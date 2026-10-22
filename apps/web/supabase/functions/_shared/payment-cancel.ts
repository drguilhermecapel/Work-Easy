import { DbError } from './handler-kit.ts';

// The write behind markPaymentCanceled. It lives here, free of Deno APIs, so Vitest can check
// the second barrier: the update only touches a payment that is still `pending`. The first
// barrier is the caller's own read of the open charges; this one holds when the payment
// changed in between (the webhook confirmed or received it after the read), so a paid
// payment is never overwritten with `canceled`.

/** The only status a payment can be canceled from. */
export const CANCELABLE_PAYMENT_STATUS = 'pending';

interface UpdateResult {
  error: { message: string; code?: string } | null;
}

/** The slice of the Supabase query builder used here (the real client satisfies it). */
export interface PaymentUpdateFilter extends PromiseLike<UpdateResult> {
  eq(column: string, value: string): PaymentUpdateFilter;
}

export interface PaymentsWriter {
  from(table: 'payments'): { update(values: Record<string, unknown>): PaymentUpdateFilter };
}

/**
 * Marks a payment `canceled` only while it is `pending`. A payment in any other status stays as
 * it is (zero rows match, and that is not an error: the charge was settled by someone else).
 */
export async function cancelPendingPayment(client: PaymentsWriter, id: string, at: Date): Promise<void> {
  const { error } = await client
    .from('payments')
    .update({ status: 'canceled', updated_at: at.toISOString() })
    .eq('id', id)
    .eq('status', CANCELABLE_PAYMENT_STATUS);
  if (error) throw new DbError(error.message, error.code);
}
