// asaas-webhook (Asaas): validates `asaas-access-token`, stores the event in
// payment_events (idempotent by event id), updates payments and requests the
// booking transition.
//
// Trust: the root account webhook uses ASAAS_WEBHOOK_TOKEN; each provider
// subaccount is registered by asaas-onboard with `?acct=<provider_id>` and its
// own derived token (deriveSubaccountToken). The event body is only a hint:
// before any effect the charge is read again from Asaas with the key of the
// account the event came from (GET /payments/{id}) and the effect is applied
// only if that answer backs it. Subaccount events never touch Pro
// subscriptions (those live in the root account).
//
// Retries: a 500 is returned only for transient failures (network, Asaas
// 5xx, database connection), so Asaas retries the event. Failures that would
// repeat on every retry are recorded and acknowledged with 200, so the
// sequential queue is not blocked.

import { AsaasError, type AsaasClient, type AsaasPayment } from '../_shared/asaas-client.ts';
import {
  applyEscrow, bookingTransition, type EventEffect, eventEffect, isPaidStatus, nextPaymentStatus, parseWebhookEvent,
  redactAsaasPayload, remoteConfirms, remoteConfirmsSubscription,
} from '../_shared/asaas-events.ts';
import { saoPauloDate } from '../_shared/dates.ts';
import {
  type AuditEntry, type BaseDeps, dbRuleError, isDeterministicDbError,
} from '../_shared/handler-kit.ts';
import { HttpError, readJson, route } from '../_shared/http.ts';
import { deriveSubaccountToken, isUuid, secretMatches } from '../_shared/secrets.ts';
import { laterPeriodEnd, periodEndFrom, planAfterCancel, planWhileOverdue } from '../_shared/subscriptions.ts';
import type { BookingStatus, PaymentStatus, PlanCode, SubscriptionStatus } from '../_shared/types.ts';

export interface StoredPayment {
  id: string;
  status: PaymentStatus;
  booking_id: string | null;
  provider_id: string;
  escrow: boolean;
}

export interface StoredSubscription {
  provider_id: string;
  status: SubscriptionStatus;
  current_period_end: string | null;
}

export interface WebhookDeps extends BaseDeps {
  webhookToken?: string;
  /** Root account client (ASAAS_API_KEY), used to read root charges again. */
  asaas: AsaasClient | null;
  /** Client with the provider's subaccount key from the Vault; null when none is stored. */
  subaccountAsaas(providerId: string): Promise<AsaasClient | null>;
  /** PRO_GRACE_DAYS: days a past-due Pro keeps the plan after the paid period. */
  proGraceDays?: number;
  store: {
    /** Inserts payment_events; on a duplicate id returns the existing row. */
    recordEvent(event: { asaas_event_id: string; event_type: string; payload: unknown }): Promise<{ id: string; processed: boolean }>;
    markProcessed(eventRowId: string, paymentId: string | null): Promise<void>;
    findPayment(asaasPaymentId: string): Promise<StoredPayment | null>;
    updatePayment(id: string, patch: { status?: PaymentStatus; raw?: unknown }): Promise<void>;
    getBookingStatus(bookingId: string): Promise<BookingStatus | null>;
    /** transition_booking as the service role; rejects with the database error message. */
    transitionBooking(bookingId: string, to: BookingStatus, reason: string): Promise<void>;
    findSubscription(asaasSubscriptionId: string): Promise<StoredSubscription | null>;
    updateSubscription(
      providerId: string,
      patch: { status?: SubscriptionStatus; current_period_end?: string; canceled_at?: string },
    ): Promise<void>;
    setProviderPlan(providerId: string, plan: PlanCode): Promise<void>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

type Result = Record<string, unknown>;

type Verified = { kind: 'ok'; payment: AsaasPayment; client: AsaasClient } | { kind: 'unverifiable'; reason: string };

/** Asaas answers that will be the same on a retry (bad request, validation). */
const isDeterministicAsaasError = (error: unknown) =>
  error instanceof AsaasError && (error.status === 400 || error.status === 422);

export function handler(req: Request, deps: WebhookDeps): Promise<Response> {
  return route(req, { methods: ['POST'], onError: deps.logError }, async () => {
    if (!deps.webhookToken) {
      throw new HttpError(503, 'webhook_not_configured', 'ASAAS_WEBHOOK_TOKEN não configurado no servidor.');
    }
    const acctParam = new URL(req.url).searchParams.get('acct');
    if (acctParam !== null && !isUuid(acctParam)) throw new HttpError(401, 'invalid_token', 'Token do webhook inválido.');
    const source = acctParam?.toLowerCase() ?? null;
    const expected = source ? await deriveSubaccountToken(deps.webhookToken, source) : deps.webhookToken;
    if (!secretMatches(req.headers.get('asaas-access-token'), expected)) {
      throw new HttpError(401, 'invalid_token', 'Token do webhook inválido.');
    }
    // Without the root key nothing can be checked; Asaas retries later
    if (!deps.asaas) {
      throw new HttpError(503, 'payments_not_configured', 'ASAAS_API_KEY não configurada no servidor.');
    }

    let body: unknown;
    try {
      body = await readJson(req);
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      deps.logError(new Error('asaas-webhook: invalid JSON payload ignored'));
      return { data: { received: true, ignored: 'invalid_payload' } };
    }
    const event = parseWebhookEvent(body);
    if (!event) {
      deps.logError(new Error('asaas-webhook: payload without id/event ignored'));
      return { data: { received: true, ignored: 'invalid_payload' } };
    }

    const stored = await deps.store.recordEvent({
      asaas_event_id: event.id,
      event_type: event.event,
      payload: redactAsaasPayload(body),
    });
    if (stored.processed) return { data: { received: true, duplicate: true } };

    const effect = eventEffect(event.event);
    if (!effect.known) {
      await deps.store.markProcessed(stored.id, null);
      return { data: { received: true, ignored: 'unknown_event' } };
    }

    const result: Result = { received: true, event: event.event };
    let paymentId: string | null = null;
    try {
      paymentId = await applyEvent(deps, source, event, effect, result);
    } catch (error) {
      if (!isDeterministicDbError(error) && !isDeterministicAsaasError(error)) throw error;
      // Same failure on every retry: record it and let the queue move on
      deps.logError(error);
      const code = error instanceof AsaasError ? `asaas_${error.status}` : (error as { code?: string }).code ?? 'error';
      result.failed = code;
      try {
        await deps.store.audit({
          actor_id: null,
          action: 'payment_event.failed',
          entity: 'payment_events',
          entity_id: event.id,
          data: { event: event.event, code, message: error instanceof Error ? error.message.slice(0, 300) : null },
        });
      } catch (auditError) {
        deps.logError(auditError);
      }
    }

    await deps.store.markProcessed(stored.id, paymentId);
    return { data: result };
  });
}

/**
 * Reads the charge again with the key of the account the event came from.
 * Asaas keeps deleted charges (`deleted: true`), so a 404 means the charge is
 * not in that account at all, which is not a confirmation of anything.
 */
async function verifyPayment(deps: WebhookDeps, source: string | null, asaasPaymentId: string): Promise<Verified> {
  const client = source ? await deps.subaccountAsaas(source) : deps.asaas;
  if (!client) return { kind: 'unverifiable', reason: 'subaccount_key_missing' };
  try {
    const payment = await client.getPayment(asaasPaymentId);
    return payment ? { kind: 'ok', payment, client } : { kind: 'unverifiable', reason: 'payment_not_in_account' };
  } catch (error) {
    if (source && error instanceof AsaasError && (error.status === 401 || error.status === 403)) {
      return { kind: 'unverifiable', reason: 'subaccount_key_rejected' };
    }
    throw error;
  }
}

async function applyEvent(
  deps: WebhookDeps,
  source: string | null,
  event: NonNullable<ReturnType<typeof parseWebhookEvent>>,
  effect: EventEffect,
  result: Result,
): Promise<string | null> {
  const now = deps.now();
  const hasPaymentEffect = effect.paymentStatus !== null || effect.bookingTo !== null;
  // Pro subscriptions are root-account charges; a subaccount cannot affect them
  const wantsSubscription = source === null && effect.subscription !== null;

  if (!event.payment) {
    if (event.subscription && wantsSubscription && effect.subscription?.status === 'canceled') {
      const remote = await deps.asaas!.getSubscription(event.subscription.id);
      const gone = remote === null || remote.deleted === true || remote.status !== 'ACTIVE';
      if (!gone) {
        result.ignored = 'status_mismatch';
        return null;
      }
      await applySubscription(deps, event.subscription.id, effect, undefined, event.id, event.event, now, result);
    }
    return null;
  }

  const local = await deps.store.findPayment(event.payment.id);
  if (local && source && local.provider_id.toLowerCase() !== source) {
    result.ignored = 'account_mismatch';
    return null;
  }
  if (!local && !wantsSubscription) {
    result.ignored = 'unknown_payment';
    return null;
  }
  if (!hasPaymentEffect && !wantsSubscription) return local?.id ?? null;

  const verified = await verifyPayment(deps, source, event.payment.id);
  if (verified.kind === 'unverifiable') {
    deps.logError(new Error(`asaas-webhook: ${event.id} not verified (${verified.reason})`));
    result.ignored = 'unverifiable';
    result.reason = verified.reason;
    try {
      await deps.store.audit({
        actor_id: null,
        action: 'payment_event.unverified',
        entity: 'payment_events',
        entity_id: event.id,
        data: { event: event.event, reason: verified.reason, source: source ?? 'platform' },
      });
    } catch (auditError) {
      deps.logError(auditError);
    }
    return local?.id ?? null;
  }
  const remote = verified.payment;

  if (local && hasPaymentEffect) {
    if (!remoteConfirms(effect, remote)) {
      result.ignored = 'status_mismatch';
    } else {
      await applyPaymentEffect(deps, local, effect, remote, verified.client, event.id, event.event, result);
    }
  }

  if (wantsSubscription) {
    // The subscription id comes from Asaas' answer, never from the body
    const subscriptionId = remote.deleted ? null : remote.subscription ?? null;
    if (subscriptionId && remoteConfirmsSubscription(effect, remote)) {
      await applySubscription(deps, subscriptionId, effect, remote.dueDate, event.id, event.event, now, result);
    } else if (!local) {
      result.ignored = subscriptionId ? 'status_mismatch' : 'unknown_payment';
    }
  }
  return local?.id ?? null;
}

async function applyPaymentEffect(
  deps: WebhookDeps,
  local: StoredPayment,
  effect: EventEffect,
  remote: AsaasPayment,
  client: AsaasClient,
  eventId: string,
  eventName: string,
  result: Result,
): Promise<void> {
  const proposed = applyEscrow(effect.paymentStatus, local.escrow);
  const next = nextPaymentStatus(local.status, proposed, effect.revert === true);
  const patch: { status?: PaymentStatus; raw?: unknown } = {};
  if (next) patch.status = next;
  patch.raw = redactAsaasPayload(remote);
  await deps.store.updatePayment(local.id, patch);
  if (next) {
    result.payment_status = next;
    await deps.store.audit({
      actor_id: null,
      action: 'payment.status',
      entity: 'payments',
      entity_id: local.id,
      data: { from: local.status, to: next, asaas_event_id: eventId, event: eventName },
    });
  }

  if (!local.booking_id || !effect.bookingTo) return;
  // The booking follows the payment as stored (also on a retry after a partial failure)
  const effective = next ?? local.status;
  if (effect.bookingTo === 'paid' && !isPaidStatus(effective)) return;
  if (effect.bookingTo === 'canceled' && effective !== 'refunded') return;
  const current = await deps.store.getBookingStatus(local.booking_id);
  if (current === 'canceled' && effect.bookingTo === 'paid') {
    // Paid after the cancellation: the booking is not reactivated, the money goes back
    await refundAfterCancel(deps, local, remote.id, client, eventId, eventName, result);
    return;
  }
  const to = current ? bookingTransition(current, effect.bookingTo) : null;
  if (!to) return;
  try {
    await deps.store.transitionBooking(local.booking_id, to, `asaas:${eventName}`);
    result.booking_status = to;
  } catch (error) {
    // A business rule refusing the transition is recorded, not retried
    const rule = dbRuleError(error instanceof Error ? error.message : undefined);
    if (!rule) throw error;
    deps.logError(error);
    result.booking_transition_refused = rule.code;
  }
}

/**
 * Safety net: a charge paid for a booking that is already canceled (the payer
 * paid a Pix or boleto issued before the cancellation, or the void did not
 * reach Asaas in time). The payment stays recorded as received, the audit log
 * gets `payment.received_after_cancel`, and a full refund is requested
 * (POST /payments/{id}/refund: card and Pix). If Asaas accepts it the payment
 * becomes `refunded`; if not (boleto, balance, network), it stays received with
 * `payment.refund_failed` in the audit log for an administrator to settle.
 */
async function refundAfterCancel(
  deps: WebhookDeps,
  local: StoredPayment,
  asaasPaymentId: string,
  client: AsaasClient,
  eventId: string,
  eventName: string,
  result: Result,
): Promise<void> {
  const base = { booking_id: local.booking_id, asaas_event_id: eventId, event: eventName };
  await deps.store.audit({
    actor_id: null,
    action: 'payment.received_after_cancel',
    entity: 'payments',
    entity_id: local.id,
    data: base,
  });
  result.received_after_cancel = true;
  try {
    await client.refundPayment(asaasPaymentId, 'Atendimento cancelado antes do pagamento');
  } catch (error) {
    deps.logError(error);
    result.refund = 'failed';
    const code = error instanceof AsaasError ? `asaas_${error.status}` : 'error';
    try {
      await deps.store.audit({
        actor_id: null,
        action: 'payment.refund_failed',
        entity: 'payments',
        entity_id: local.id,
        data: { ...base, code, message: error instanceof Error ? error.message.slice(0, 300) : null },
      });
    } catch (auditError) {
      deps.logError(auditError);
    }
    return;
  }
  result.refund = 'requested';
  await deps.store.updatePayment(local.id, { status: 'refunded' });
  result.payment_status = 'refunded';
  await deps.store.audit({
    actor_id: null,
    action: 'payment.refunded_after_cancel',
    entity: 'payments',
    entity_id: local.id,
    data: { ...base, from: local.status },
  });
}

async function applySubscription(
  deps: WebhookDeps,
  subscriptionId: string,
  effect: EventEffect,
  dueDate: string | undefined,
  eventId: string,
  eventName: string,
  now: Date,
  result: Result,
): Promise<void> {
  const sub = await deps.store.findSubscription(subscriptionId);
  if (!sub) {
    result.ignored = 'unknown_subscription';
    return;
  }
  const status = effect.subscription!.status;
  let applied: SubscriptionStatus = sub.status;
  let plan: PlanCode | null = null;

  if (status === 'active') {
    const end = laterPeriodEnd(sub.current_period_end, periodEndFrom(dueDate, saoPauloDate(now)));
    if (sub.status === 'canceled') {
      // A paid charge arriving after the cancellation extends the paid period
      // but does not reactivate the subscription
      await deps.store.updateSubscription(sub.provider_id, { current_period_end: end });
      plan = planAfterCancel(end, now);
    } else {
      await deps.store.updateSubscription(sub.provider_id, { status: 'active', current_period_end: end });
      applied = 'active';
      plan = 'pro';
    }
  } else if (status === 'canceled') {
    if (sub.status !== 'canceled') {
      await deps.store.updateSubscription(sub.provider_id, { status: 'canceled', canceled_at: now.toISOString() });
      applied = 'canceled';
      plan = planAfterCancel(sub.current_period_end, now);
    }
  } else if (status === 'past_due' && sub.status !== 'canceled') {
    // A first charge that was never paid is still "waiting for payment", not a late one
    if (sub.status === 'pending' && !sub.current_period_end) {
      result.ignored = 'first_payment_overdue';
    } else {
      await deps.store.updateSubscription(sub.provider_id, { status: 'past_due' });
      applied = 'past_due';
      plan = planWhileOverdue(sub.current_period_end, now, deps.proGraceDays ?? 0);
    }
  }

  if (plan) await deps.store.setProviderPlan(sub.provider_id, plan);
  result.subscription_status = applied;
  if (plan) result.plan = plan;
  await deps.store.audit({
    actor_id: null,
    action: 'subscription.status',
    entity: 'subscriptions',
    entity_id: sub.provider_id,
    data: { from: sub.status, to: applied, plan, asaas_event_id: eventId, event: eventName },
  });
}
