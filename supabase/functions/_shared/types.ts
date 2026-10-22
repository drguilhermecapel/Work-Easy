// Enum values from docs/ARQUITETURA.md (database contract). Kept as literal
// unions so handlers and tests share one source of truth.

export const PAYMENT_STATUSES = [
  'pending', 'confirmed', 'received', 'held', 'released', 'refunded', 'failed', 'canceled',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['pix', 'credit_card', 'boleto', 'undefined'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type BookingStatus =
  | 'requested' | 'accepted' | 'paid' | 'in_progress' | 'completed' | 'released' | 'canceled' | 'disputed';

export type BookingOrigin = 'platform' | 'own';

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'canceled';

export type PlanCode = 'free' | 'pro';

export type NotificationChannel = 'whatsapp' | 'email';

export type NotificationStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

/** Asaas `billingType` for each contract payment method. */
export const BILLING_TYPE: Record<PaymentMethod, 'PIX' | 'CREDIT_CARD' | 'BOLETO' | 'UNDEFINED'> = {
  pix: 'PIX',
  credit_card: 'CREDIT_CARD',
  boleto: 'BOLETO',
  undefined: 'UNDEFINED',
};
