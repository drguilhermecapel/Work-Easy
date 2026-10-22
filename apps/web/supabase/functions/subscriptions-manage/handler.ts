// subscriptions-manage (prestador): subscribes to or cancels the Pro plan.
// Subscribe creates a monthly Asaas subscription in the platform account;
// Pro is switched on by asaas-webhook when the first charge is paid.
// Cancel removes the Asaas subscription; Pro stays until the paid period ends.

import { AsaasError, type AsaasClient } from '../_shared/asaas-client.ts';
import { saoPauloDate } from '../_shared/dates.ts';
import {
  type AuditEntry, type AuthUser, type BaseDeps, auditSafely, callAsaas, corsOf, toHttpError, validated,
} from '../_shared/handler-kit.ts';
import { errors, readJson, route } from '../_shared/http.ts';
import { centsToReais } from '../_shared/money.ts';
import { firstDueDate, planAfterCancel } from '../_shared/subscriptions.ts';
import { BILLING_TYPE, PAYMENT_METHODS, type PlanCode, type SubscriptionStatus } from '../_shared/types.ts';
import { cpfCnpj, object, oneOf, optional } from '../_shared/validate.ts';
import { ensurePlatformCustomer } from '../payments-create/handler.ts';

export interface SubscriptionRow {
  provider_id: string;
  plan: PlanCode;
  status: SubscriptionStatus;
  asaas_subscription_id: string | null;
  current_period_end: string | null;
  canceled_at: string | null;
}

export interface SubscriptionsDeps extends BaseDeps {
  asaas: AsaasClient | null;
  session(req: Request): Promise<{ user: AuthUser; getProvider(): Promise<{ id: string; plan: PlanCode } | null> } | null>;
  admin: {
    getSubscription(providerId: string): Promise<SubscriptionRow | null>;
    saveSubscription(row: SubscriptionRow): Promise<void>;
    /**
     * Writes the row of a new subscription only if the stored row is still
     * `previous` (null: there is none). False when another request got there
     * first, so two simultaneous clicks cannot leave a billing subscription
     * in Asaas that no row points to.
     */
    claimSubscription(row: SubscriptionRow, previous: SubscriptionRow | null): Promise<boolean>;
    setProviderPlan(providerId: string, plan: PlanCode): Promise<void>;
    /** platform_settings.pro_price_cents */
    getProPriceCents(): Promise<number>;
    getCustomerId(userId: string): Promise<string | null>;
    saveCustomerId(userId: string, asaasCustomerId: string): Promise<void>;
    getProfile(userId: string): Promise<{ full_name: string | null; phone: string | null } | null>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

const Body = object({
  action: oneOf(['subscribe', 'cancel'] as const),
  method: optional(oneOf(PAYMENT_METHODS)),
  cpf_cnpj: optional(cpfCnpj()),
});

export function handler(req: Request, deps: SubscriptionsDeps): Promise<Response> {
  return route(req, { methods: ['POST'], ...corsOf(deps), onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const asaas = deps.asaas;
    if (!asaas) throw errors.paymentsNotConfigured();
    const input = validated(Body, await readJson(req));

    const provider = await session.getProvider();
    if (!provider || provider.id !== session.user.id) throw errors.notAllowed('Disponível apenas para prestadores.');
    const current = await deps.admin.getSubscription(provider.id);
    const now = deps.now();

    if (input.action === 'subscribe') {
      if (current && current.status !== 'canceled' && current.asaas_subscription_id) {
        throw errors.conflict('already_subscribed', 'Já existe uma assinatura Pro para esta conta.');
      }
      const method = input.method ?? 'undefined';
      const price = await deps.admin.getProPriceCents();
      if (!Number.isSafeInteger(price) || price <= 0) throw errors.conflict('price_missing', 'Preço do plano Pro não configurado.');
      const customerId = await ensurePlatformCustomer({ admin: deps.admin, asaas }, session.user, input.cpf_cnpj);
      const subscription = await callAsaas(() =>
        asaas.createSubscription({
          customer: customerId,
          billingType: BILLING_TYPE[method],
          value: centsToReais(price),
          // Subscribing again inside a period already paid starts charging when it ends
          nextDueDate: firstDueDate(saoPauloDate(now), current?.current_period_end ?? null, now),
          cycle: 'MONTHLY',
          description: 'WorkEasy Pro (mensal)',
          externalReference: `subscription:${provider.id}`,
        }),
      );
      let invoiceUrl: string | null = null;
      try {
        const payments = await callAsaas(() => asaas.listSubscriptionPayments(subscription.id));
        invoiceUrl = payments[0]?.invoiceUrl ?? null;
      } catch (error) {
        deps.logError(error);
      }
      // Waiting for the first payment: `pending` until asaas-webhook confirms it and
      // sets active (it never grants Pro by itself: providers.plan only changes on a paid charge).
      const row: SubscriptionRow = {
        provider_id: provider.id,
        plan: 'pro',
        status: 'pending',
        asaas_subscription_id: subscription.id,
        current_period_end: current?.current_period_end ?? null,
        canceled_at: null,
      };
      let claimed: boolean;
      try {
        claimed = await deps.admin.claimSubscription(row, current);
      } catch (error) {
        // Without a row nothing would ever stop this subscription from billing the provider
        await asaas.deleteSubscription(subscription.id).catch(deps.logError);
        throw error;
      }
      if (!claimed) {
        // A simultaneous request saved its own subscription first: drop this one
        await asaas.deleteSubscription(subscription.id).catch(deps.logError);
        throw errors.conflict('already_subscribed', 'Já existe uma assinatura Pro para esta conta.');
      }
      await auditSafely(deps, {
        actor_id: provider.id,
        action: 'subscription.create',
        entity: 'subscriptions',
        entity_id: provider.id,
        data: { asaas_subscription_id: subscription.id, price_cents: price, method },
      });
      return {
        status: 201,
        data: {
          status: row.status,
          plan: provider.plan,
          asaas_subscription_id: subscription.id,
          price_cents: price,
          invoice_url: invoiceUrl,
          awaiting_payment: true,
        },
      };
    }

    if (!current || current.status === 'canceled' || !current.asaas_subscription_id) {
      throw errors.conflict('no_subscription', 'Não há assinatura Pro ativa para cancelar.');
    }
    const subscriptionId = current.asaas_subscription_id;
    try {
      await asaas.deleteSubscription(subscriptionId);
    } catch (error) {
      // Already removed in Asaas (404): only the local rows are left to update
      if (!(error instanceof AsaasError && error.status === 404)) throw toHttpError(error);
    }
    const plan = planAfterCancel(current.current_period_end, now);
    await deps.admin.saveSubscription({ ...current, status: 'canceled', canceled_at: now.toISOString() });
    await deps.admin.setProviderPlan(provider.id, plan);
    await auditSafely(deps, {
      actor_id: provider.id,
      action: 'subscription.cancel',
      entity: 'subscriptions',
      entity_id: provider.id,
      data: { asaas_subscription_id: subscriptionId, plan_after: plan },
    });
    return {
      data: {
        status: 'canceled' as const,
        plan,
        pro_until: plan === 'pro' ? current.current_period_end : null,
      },
    };
  });
}
