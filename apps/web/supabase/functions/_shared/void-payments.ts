import { AsaasError, type AsaasClient } from './asaas-client.ts';
import { ASAAS_PAID } from './asaas-events.ts';
import { toHttpError } from './handler-kit.ts';

export interface PendingCharge {
  id: string;
  asaas_payment_id: string;
}

export interface VoidResult {
  /** Removed in Asaas (or already gone there) and marked canceled. */
  canceled: PendingCharge[];
  /**
   * Asaas refuses to remove them because they were paid meanwhile: left
   * `pending` for the webhook, which refunds a payment received after a cancel.
   */
  paid: PendingCharge[];
  /** Charges that could not be removed (network, Asaas 5xx...): a retry may succeed. */
  failed: Array<{ charge: PendingCharge; error: unknown }>;
}

const isStatus = (error: unknown, ...statuses: number[]) => error instanceof AsaasError && statuses.includes(error.status);

/**
 * Removes open charges in Asaas and marks them canceled. Safe to repeat: a
 * charge Asaas no longer has (404, or `deleted`) counts as done. Every charge is
 * tried even when one fails, so a retry only has the failures left.
 */
export async function voidCharges(input: {
  client: AsaasClient;
  charges: PendingCharge[];
  markCanceled(id: string): Promise<void>;
}): Promise<VoidResult> {
  const result: VoidResult = { canceled: [], paid: [], failed: [] };
  for (const charge of input.charges) {
    try {
      let gone = true;
      try {
        await input.client.deletePayment(charge.asaas_payment_id);
      } catch (error) {
        if (isStatus(error, 404)) {
          // Not in that account anymore
        } else if (isStatus(error, 400, 409)) {
          // Asaas refuses to remove it: already deleted, or paid while we were here
          const remote = await input.client.getPayment(charge.asaas_payment_id);
          if (remote && !remote.deleted) {
            if (!ASAAS_PAID.has(remote.status)) throw error;
            gone = false;
          }
        } else {
          throw error;
        }
      }
      if (gone) {
        await input.markCanceled(charge.id);
        result.canceled.push(charge);
      } else {
        result.paid.push(charge);
      }
    } catch (error) {
      result.failed.push({ charge, error: toHttpError(error) });
    }
  }
  return result;
}
