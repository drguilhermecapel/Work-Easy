import type { BookingStatus, PaymentStatus, SubscriptionStatus } from './types.ts';

// Event names: https://docs.asaas.com/docs/webhook-para-cobrancas and
// https://docs.asaas.com/docs/eventos-para-assinaturas
// Payload (id, event, dateCreated, payment|subscription):
// https://docs.asaas.com/docs/sobre-os-webhooks

export interface AsaasWebhookPayment {
  id: string;
  status?: string;
  value?: number;
  netValue?: number;
  billingType?: string;
  dueDate?: string;
  paymentDate?: string | null;
  confirmedDate?: string | null;
  subscription?: string | null;
  externalReference?: string | null;
  invoiceUrl?: string | null;
}

export interface AsaasWebhookEvent {
  id: string;
  event: string;
  dateCreated?: string;
  payment?: AsaasWebhookPayment;
  subscription?: { id: string; status?: string };
}

/** Booking transitions the contract gives the service role ('canceled' only from 'paid': refund). */
export type BookingTarget = Extract<BookingStatus, 'paid' | 'disputed' | 'canceled'>;

export interface EventEffect {
  /** False for event names this code does not know: they are stored and ignored. */
  known: boolean;
  /** New payments.status, or null to leave it unchanged. */
  paymentStatus: PaymentStatus | null;
  /** Target booking status to request through transition_booking, if any. */
  bookingTo: BookingTarget | null;
  /** Only PAYMENT_RECEIVED_IN_CASH_UNDONE may move a received payment back to pending. */
  revert?: boolean;
  /** Effect on a Pro subscription when the payment belongs to one. */
  subscription: { status: SubscriptionStatus; extendPeriod: boolean } | null;
}

const NONE: Omit<EventEffect, 'known'> = { paymentStatus: null, bookingTo: null, subscription: null };

const PAYMENT_EFFECTS: Record<string, Omit<EventEffect, 'known'>> = {
  // The row is inserted as pending by payments-create/charges-create; a late
  // CREATED must not touch it.
  PAYMENT_CREATED: NONE,
  PAYMENT_UPDATED: NONE,
  PAYMENT_AWAITING_RISK_ANALYSIS: NONE,
  PAYMENT_APPROVED_BY_RISK_ANALYSIS: NONE,
  PAYMENT_REPROVED_BY_RISK_ANALYSIS: { ...NONE, paymentStatus: 'failed' },
  PAYMENT_AUTHORIZED: NONE,
  PAYMENT_CONFIRMED: {
    paymentStatus: 'confirmed',
    bookingTo: 'paid',
    subscription: { status: 'active', extendPeriod: true },
  },
  PAYMENT_RECEIVED: {
    paymentStatus: 'received',
    bookingTo: 'paid',
    subscription: { status: 'active', extendPeriod: true },
  },
  PAYMENT_CREDIT_CARD_CAPTURE_REFUSED: { ...NONE, paymentStatus: 'failed' },
  PAYMENT_ANTICIPATED: NONE,
  PAYMENT_OVERDUE: { ...NONE, subscription: { status: 'past_due', extendPeriod: false } },
  PAYMENT_DELETED: { ...NONE, paymentStatus: 'canceled' },
  PAYMENT_RESTORED: { ...NONE, paymentStatus: 'pending' },
  PAYMENT_REFUNDED: { ...NONE, paymentStatus: 'refunded', bookingTo: 'canceled' },
  PAYMENT_PARTIALLY_REFUNDED: NONE,
  PAYMENT_REFUND_IN_PROGRESS: NONE,
  PAYMENT_REFUND_DENIED: NONE,
  PAYMENT_RECEIVED_IN_CASH_UNDONE: { ...NONE, paymentStatus: 'pending', revert: true },
  PAYMENT_CHARGEBACK_REQUESTED: { ...NONE, bookingTo: 'disputed' },
  PAYMENT_CHARGEBACK_DISPUTE: NONE,
  PAYMENT_AWAITING_CHARGEBACK_REVERSAL: NONE,
  PAYMENT_DUNNING_REQUESTED: NONE,
  PAYMENT_DUNNING_RECEIVED: NONE,
  PAYMENT_BANK_SLIP_CANCELLED: NONE,
  PAYMENT_BANK_SLIP_VIEWED: NONE,
  PAYMENT_CHECKOUT_VIEWED: NONE,
  PAYMENT_SPLIT_CANCELLED: NONE,
  PAYMENT_SPLIT_DIVERGENCE_BLOCK: NONE,
  PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED: NONE,
  PAYMENT_SPLIT_DONE: NONE,
};

const SUBSCRIPTION_EFFECTS: Record<string, Omit<EventEffect, 'known'>> = {
  SUBSCRIPTION_CREATED: NONE,
  SUBSCRIPTION_UPDATED: NONE,
  SUBSCRIPTION_INACTIVATED: { ...NONE, subscription: { status: 'canceled', extendPeriod: false } },
  SUBSCRIPTION_DELETED: { ...NONE, subscription: { status: 'canceled', extendPeriod: false } },
  SUBSCRIPTION_SPLIT_DISABLED: NONE,
  SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK: NONE,
  SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED: NONE,
};

export function eventEffect(eventName: string): EventEffect {
  // Own keys only: an event named "__proto__" or "constructor" is unknown
  const effect = Object.hasOwn(PAYMENT_EFFECTS, eventName)
    ? PAYMENT_EFFECTS[eventName]
    : Object.hasOwn(SUBSCRIPTION_EFFECTS, eventName)
      ? SUBSCRIPTION_EFFECTS[eventName]
      : undefined;
  return effect ? { known: true, ...effect } : { known: false, ...NONE };
}

/** With escrow on, money received is `held` until release. */
export function applyEscrow(status: PaymentStatus | null, escrow: boolean): PaymentStatus | null {
  if (escrow && (status === 'received' || status === 'confirmed')) return 'held';
  return status;
}

// Forward-only ladder for the happy path. Asaas delivers "at least once" and
// not necessarily in order, so CONFIRMED arriving after RECEIVED must not
// move a payment backwards.
const RANK: Partial<Record<PaymentStatus, number>> = {
  pending: 0, confirmed: 1, received: 2, held: 2, released: 3,
};

/**
 * The status to store, or null when nothing should change. Back to pending
 * only in two cases: `revert` (cash receipt undone) from received/confirmed,
 * and PAYMENT_RESTORED from canceled/failed.
 */
export function nextPaymentStatus(
  current: PaymentStatus,
  proposed: PaymentStatus | null,
  revert = false,
): PaymentStatus | null {
  if (proposed === null || proposed === current) return null;
  if (current === 'refunded') return null; // terminal
  if (proposed === 'refunded') return 'refunded';
  if (proposed === 'pending') {
    if (revert) return current === 'received' || current === 'confirmed' ? 'pending' : null;
    return current === 'failed' || current === 'canceled' ? 'pending' : null;
  }
  if (proposed === 'failed' || proposed === 'canceled') {
    return current === 'pending' || current === 'confirmed' ? proposed : null;
  }
  if (current === 'failed' || current === 'canceled') {
    // a charge paid after a failed card attempt or after being restored
    return RANK[proposed] !== undefined ? proposed : null;
  }
  const from = RANK[current];
  const to = RANK[proposed];
  if (from === undefined || to === undefined) return null;
  return to > from ? proposed : null;
}

export const isPaidStatus = (status: PaymentStatus) =>
  status === 'received' || status === 'confirmed' || status === 'held' || status === 'released';

/** transition_booking target allowed for the service role, given the current status. */
export function bookingTransition(current: BookingStatus, target: BookingTarget | null): BookingTarget | null {
  if (target === 'paid') return current === 'accepted' ? 'paid' : null;
  if (target === 'canceled') return current === 'paid' ? 'canceled' : null;
  if (target === 'disputed') {
    return current === 'canceled' || current === 'disputed' ? null : 'disputed';
  }
  return null;
}

// Asaas payment statuses (GET /v3/payments/{id}).
export const ASAAS_PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH', 'DUNNING_RECEIVED']);
export const ASAAS_UNPAID = new Set(['PENDING', 'OVERDUE']);
const ASAAS_CHARGEBACK = new Set(['CHARGEBACK_REQUESTED', 'CHARGEBACK_DISPUTE', 'AWAITING_CHARGEBACK_REVERSAL']);

export interface RemotePayment {
  status?: string;
  deleted?: boolean;
}

/**
 * Whether the charge as Asaas reports it now (GET /payments/{id}, null when
 * unknown there) backs the event's effect. The webhook body is only a hint:
 * nothing that grants money or Pro is applied without this check.
 */
export function remoteConfirms(effect: EventEffect, remote: RemotePayment | null): boolean {
  const gone = remote === null || remote.deleted === true;
  const status = remote?.status ?? '';
  switch (effect.paymentStatus) {
    case 'canceled':
      return gone;
    case 'received':
    case 'confirmed':
      return !gone && ASAAS_PAID.has(status);
    case 'refunded':
      return !gone && status === 'REFUNDED';
    case 'pending':
      return !gone && (ASAAS_UNPAID.has(status) || status === 'AWAITING_RISK_ANALYSIS');
    case 'failed':
      return gone || !ASAAS_PAID.has(status);
    case null:
      if (effect.bookingTo === 'disputed') return !gone && ASAAS_CHARGEBACK.has(status);
      if (effect.subscription?.status === 'past_due') return !gone && status === 'OVERDUE';
      return true;
    default:
      return false;
  }
}

/** Subscription payment effects: active needs a paid charge, past_due an overdue one. */
export function remoteConfirmsSubscription(effect: EventEffect, remote: RemotePayment | null): boolean {
  const status = remote && !remote.deleted ? remote.status ?? '' : '';
  if (effect.subscription?.status === 'active') return ASAAS_PAID.has(status);
  if (effect.subscription?.status === 'past_due') return status === 'OVERDUE';
  return false;
}

const CARD_KEY = /^creditcard/i;

/**
 * Copy without card data (creditCard, creditCardToken, creditCardHolderInfo,
 * at any depth) before storing an Asaas object: the token can charge the card
 * again, and the contract keeps card data out of the database.
 */
export function redactAsaasPayload<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => redactAsaasPayload(item)) as T;
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (CARD_KEY.test(key)) continue;
    out[key] = redactAsaasPayload(item);
  }
  return out as T;
}

export function parseWebhookEvent(body: unknown): AsaasWebhookEvent | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || !b.id || typeof b.event !== 'string' || !b.event) return null;
  const event: AsaasWebhookEvent = { id: b.id, event: b.event };
  if (typeof b.dateCreated === 'string') event.dateCreated = b.dateCreated;
  const payment = b.payment as Record<string, unknown> | undefined;
  if (payment && typeof payment === 'object' && typeof payment.id === 'string') {
    event.payment = payment as unknown as AsaasWebhookPayment;
  }
  const subscription = b.subscription as Record<string, unknown> | undefined;
  if (subscription && typeof subscription === 'object' && typeof subscription.id === 'string') {
    event.subscription = subscription as unknown as { id: string; status?: string };
  }
  return event;
}
