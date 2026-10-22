// asaas-onboard (prestador): creates the provider's Asaas subaccount
// (POST /v3/accounts) with the fiscal data sent by the app, stores the
// walletId and puts the subaccount API key in Supabase Vault. The key is
// never returned to the app.

import type { AsaasClient, AsaasWebhookConfig, CreateAccountInput } from '../_shared/asaas-client.ts';
import { type AuditEntry, type AuthUser, type BaseDeps, callAsaas, validated } from '../_shared/handler-kit.ts';
import { errors, readJson, route } from '../_shared/http.ts';
import { centsToReais } from '../_shared/money.ts';
import { email, int, isoDate, object, oneOf, optional, phoneBR, postalCode, string, cpfCnpj } from '../_shared/validate.ts';

export interface PaymentAccount {
  provider_id: string;
  asaas_account_id: string | null;
  asaas_wallet_id: string | null;
  api_key_secret_id: string | null;
  status: string | null;
}

export interface OnboardDeps extends BaseDeps {
  asaas: AsaasClient | null;
  /** `${SUPABASE_URL}/functions/v1/asaas-webhook`, to register the subaccount webhook. */
  webhookUrl: string | null;
  webhookToken?: string;
  session(req: Request): Promise<{ user: AuthUser; getProvider(): Promise<{ id: string; display_name: string | null } | null> } | null>;
  admin: {
    getPaymentAccount(providerId: string): Promise<PaymentAccount | null>;
    /** Stores a secret in Vault, returning its id. */
    storeSecret(name: string, secret: string): Promise<string>;
    savePaymentAccount(row: PaymentAccount): Promise<void>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

const Body = object({
  name: string({ min: 3, max: 120 }),
  email: email(),
  cpf_cnpj: cpfCnpj(),
  birth_date: optional(isoDate()),
  company_type: optional(oneOf(['MEI', 'LIMITED', 'INDIVIDUAL', 'ASSOCIATION'] as const)),
  mobile_phone: phoneBR(),
  income_value_cents: int({ min: 1 }),
  address: string({ min: 2, max: 200 }),
  address_number: string({ min: 1, max: 20 }),
  complement: optional(string({ max: 100 })),
  province: string({ min: 2, max: 100 }),
  postal_code: postalCode(),
});

/** Payment events forwarded from the subaccount to asaas-webhook. */
export const SUBACCOUNT_WEBHOOK_EVENTS = [
  'PAYMENT_CREATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE', 'PAYMENT_DELETED',
  'PAYMENT_RESTORED', 'PAYMENT_REFUNDED', 'PAYMENT_RECEIVED_IN_CASH_UNDONE', 'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS', 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
];

export function subaccountWebhook(url: string | null, token: string | undefined, notifyEmail: string): AsaasWebhookConfig[] | undefined {
  // Asaas requires authToken with 32-255 characters
  if (!url || !token || token.length < 32 || token.length > 255) return undefined;
  return [{
    name: 'WorkEasy',
    url,
    email: notifyEmail,
    enabled: true,
    interrupted: false,
    sendType: 'SEQUENTIALLY',
    apiVersion: 3,
    authToken: token,
    events: SUBACCOUNT_WEBHOOK_EVENTS,
  }];
}

export function handler(req: Request, deps: OnboardDeps): Promise<Response> {
  return route(req, { methods: ['POST'], siteUrl: deps.siteUrl, onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const asaas = deps.asaas;
    if (!asaas) throw errors.paymentsNotConfigured();
    const input = validated(Body, await readJson(req));

    const provider = await session.getProvider();
    if (!provider || provider.id !== session.user.id) throw errors.notAllowed('Cadastre-se como prestador antes de ativar o recebimento.');

    const isPerson = input.cpf_cnpj.length === 11;
    if (isPerson && !input.birth_date) throw errors.invalidInput(['birth_date: obrigatório para CPF']);
    if (!isPerson && !input.company_type) throw errors.invalidInput(['company_type: obrigatório para CNPJ']);

    const existing = await deps.admin.getPaymentAccount(provider.id);
    if (existing?.asaas_wallet_id) {
      throw errors.conflict('already_onboarded', 'O recebimento pelo Asaas já está ativado para este prestador.');
    }

    const account: CreateAccountInput = {
      name: input.name,
      email: input.email,
      cpfCnpj: input.cpf_cnpj,
      mobilePhone: input.mobile_phone.slice(2),
      incomeValue: centsToReais(input.income_value_cents),
      address: input.address,
      addressNumber: input.address_number,
      province: input.province,
      postalCode: input.postal_code,
    };
    if (input.complement) account.complement = input.complement;
    if (isPerson) account.birthDate = input.birth_date;
    else account.companyType = input.company_type;
    const webhooks = subaccountWebhook(deps.webhookUrl, deps.webhookToken, input.email);
    if (webhooks) account.webhooks = webhooks;

    const created = await callAsaas(() => asaas.createAccount(account));

    // The account exists from here on: persist it even if the Vault write fails
    let secretId: string | null = null;
    let status = 'active';
    if (created.apiKey) {
      try {
        secretId = await deps.admin.storeSecret(`asaas_subaccount_${provider.id}`, created.apiKey);
      } catch (error) {
        deps.logError(error);
        status = 'key_not_stored';
      }
    } else {
      status = 'key_not_returned';
    }
    await deps.admin.savePaymentAccount({
      provider_id: provider.id,
      asaas_account_id: created.id,
      asaas_wallet_id: created.walletId,
      api_key_secret_id: secretId,
      status,
    });
    await deps.admin.audit({
      actor_id: provider.id,
      action: 'payment_account.create',
      entity: 'provider_payment_accounts',
      entity_id: provider.id,
      data: { asaas_account_id: created.id, status, webhook_registered: Boolean(webhooks) },
    });

    return {
      status: 201,
      data: {
        account_id: created.id,
        wallet_id: created.walletId,
        status,
        webhook_registered: Boolean(webhooks),
        own_charges_enabled: secretId !== null,
      },
    };
  });
}
