// account-delete (usuário): requires {"confirm":"EXCLUIR"}. Refuses while the
// user has a booking in progress (accepted, paid, in progress or disputed).
// Otherwise it stops the money first (cancels the Pro subscription and the
// open charges in Asaas), empties the user's folder in the provider-documents
// bucket (anonymize_user refuses to run while it has files: storage_not_empty),
// records the request in data_requests, calls anonymize_user (payments and
// bookings stay, anonymized, for tax obligations) and deletes the user from
// Supabase Auth.
//
// data_requests.status stays `processing` until the whole flow ends:
// `completed`, or `failed` when something stops it before anonymization.

import { AsaasError, type AsaasClient } from '../_shared/asaas-client.ts';
import {
  type AuditEntry, type AuthUser, type BaseDeps, auditSafely, corsOf, toHttpError, validated,
} from '../_shared/handler-kit.ts';
import { errors, HttpError, readJson, route } from '../_shared/http.ts';
import { object, string } from '../_shared/validate.ts';

export const CONFIRMATION = 'EXCLUIR';

/** Booking statuses where the other party or the money still depends on this user. */
export const BLOCKING_BOOKING_STATUSES = ['accepted', 'paid', 'in_progress', 'disputed'] as const;

export interface OpenCharge {
  id: string;
  asaas_payment_id: string;
  /** Platform charges live in the root account; a provider's own charges in their subaccount. */
  account: 'platform' | 'provider';
  provider_id: string | null;
}

export interface DeleteDeps extends BaseDeps {
  /** Root client; null without ASAAS_API_KEY. */
  asaas: AsaasClient | null;
  session(req: Request): Promise<{ user: AuthUser } | null>;
  admin: {
    countBlockingBookings(userId: string): Promise<number>;
    getActiveSubscriptionId(providerId: string): Promise<string | null>;
    markSubscriptionCanceled(providerId: string, canceledAt: string): Promise<void>;
    /** Pending payments where the user is payer or provider. */
    listOpenCharges(userId: string): Promise<OpenCharge[]>;
    markPaymentCanceled(id: string): Promise<void>;
    getSubaccountApiKey(providerId: string): Promise<string | null>;
    /** Removes every object under provider-documents/<userId>/ (any depth); returns how many. */
    removeDocuments(userId: string): Promise<number>;
    createRequest(userId: string): Promise<string>;
    updateRequest(id: string, patch: { status: string; completed_at?: string }): Promise<void>;
    anonymizeUser(userId: string): Promise<void>;
    deleteAuthUser(userId: string): Promise<void>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

const Body = object({ confirm: string({ min: 1, max: 20 }) });

const isStatus = (error: unknown, ...statuses: number[]) => error instanceof AsaasError && statuses.includes(error.status);

/**
 * Cancels the Pro subscription and the open charges in Asaas so nothing keeps
 * billing a user who no longer exists. Safe to repeat: what Asaas no longer
 * has (404) counts as done.
 */
async function stopMoney(deps: DeleteDeps, userId: string, now: Date): Promise<{ subscription: boolean; charges: number }> {
  const subscriptionId = await deps.admin.getActiveSubscriptionId(userId);
  const charges = await deps.admin.listOpenCharges(userId);
  if (!subscriptionId && charges.length === 0) return { subscription: false, charges: 0 };
  const root = deps.asaas;
  if (!root) throw errors.paymentsNotConfigured();

  if (subscriptionId) {
    try {
      await root.deleteSubscription(subscriptionId);
    } catch (error) {
      if (!isStatus(error, 404)) throw toHttpError(error);
    }
    await deps.admin.markSubscriptionCanceled(userId, now.toISOString());
  }

  let canceled = 0;
  for (const charge of charges) {
    let client = root;
    if (charge.account === 'provider') {
      const key = charge.provider_id ? await deps.admin.getSubaccountApiKey(charge.provider_id) : null;
      if (!key) {
        // Nothing can reach that charge: leave it for the support to void in the Asaas panel
        deps.logError(new Error(`account-delete: no subaccount key to cancel charge ${charge.asaas_payment_id}`));
        continue;
      }
      client = root.withApiKey(key);
    }
    try {
      await client.deletePayment(charge.asaas_payment_id);
    } catch (error) {
      // Asaas refuses to remove a charge that was paid while we were here
      if (isStatus(error, 400, 409)) {
        throw errors.conflict('payment_in_progress', 'Há um pagamento sendo confirmado. Tente novamente em alguns minutos.');
      }
      if (!isStatus(error, 404)) throw toHttpError(error);
    }
    await deps.admin.markPaymentCanceled(charge.id);
    canceled++;
  }
  return { subscription: Boolean(subscriptionId), charges: canceled };
}

export function handler(req: Request, deps: DeleteDeps): Promise<Response> {
  return route(req, { methods: ['POST'], ...corsOf(deps), onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const body = await readJson(req);
    const input = (() => {
      try {
        return validated(Body, body);
      } catch {
        return null;
      }
    })();
    if (!input || input.confirm !== CONFIRMATION) {
      throw new HttpError(400, 'confirmation_required', `Para excluir a conta, envie a confirmação "${CONFIRMATION}".`);
    }
    const { user } = session;

    if ((await deps.admin.countBlockingBookings(user.id)) > 0) {
      throw errors.conflict(
        'active_bookings',
        'Você tem atendimentos em andamento. Conclua ou cancele esses atendimentos antes de excluir a conta.',
      );
    }

    const requestId = await deps.admin.createRequest(user.id);
    let stopped = { subscription: false, charges: 0 };
    let documents = 0;
    try {
      stopped = await stopMoney(deps, user.id, deps.now());
      // Order required by anonymize_user: Storage, then anonymize, then Auth
      documents = await deps.admin.removeDocuments(user.id);
      await deps.admin.anonymizeUser(user.id);
    } catch (error) {
      await deps.admin.updateRequest(requestId, { status: 'failed' }).catch(deps.logError);
      throw error;
    }
    // Money is stopped and the data is anonymized: a failed audit must not turn this into a 500
    await auditSafely(deps, {
      actor_id: user.id,
      action: 'account.delete',
      entity: 'profiles',
      entity_id: user.id,
      data: { data_request_id: requestId, subscription_canceled: stopped.subscription, charges_canceled: stopped.charges, documents_removed: documents },
    });
    try {
      await deps.admin.deleteAuthUser(user.id);
    } catch (error) {
      deps.logError(error);
      throw new HttpError(
        500,
        'auth_delete_failed',
        'Seus dados foram anonimizados, mas o login não pôde ser removido. Tente novamente ou fale com o suporte.',
      );
    }
    const completedAt = deps.now().toISOString();
    // The Auth delete may cascade to rows tied to the user; this update is best effort
    await deps.admin.updateRequest(requestId, { status: 'completed', completed_at: completedAt }).catch(deps.logError);
    return { data: { deleted: true, data_request_id: requestId, completed_at: completedAt } };
  });
}
