import { formatCents } from '../lib/money';
import type { Tables } from '../lib/database.types';
import { db, invokeFunction, unwrap } from './client';
import { guard } from './proErrors';

// Charges for the provider's own clients, made in the provider's Asaas
// subaccount by the charges-create function. Card data never reaches the app:
// the card is paid on the Asaas invoice page.

export type PaymentMethod = Tables<'payments'>['method'];
export type PaymentStatus = Tables<'payments'>['status'];

export type PaymentRow = Pick<
  Tables<'payments'>,
  'id' | 'booking_id' | 'quote_id' | 'method' | 'amount_cents' | 'platform_fee_cents' | 'status' | 'invoice_url' | 'pix_qr_code' | 'pix_payload' | 'due_date' | 'created_at'
>;

const PAYMENT_COLUMNS =
  'id, booking_id, quote_id, method, amount_cents, platform_fee_cents, status, invoice_url, pix_qr_code, pix_payload, due_date, created_at';

/** What charges-create answers (paymentView in the function). */
export interface ChargeResult {
  payment_id: string;
  asaas_payment_id: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  amount_cents: number;
  due_date: string | null;
  invoice_url: string | null;
  pix: { payload: string; qr_code_base64: string | null } | null;
  /** True when an open charge for the same item already existed and was returned. */
  reused: boolean;
}

export interface NewCharge {
  target: { kind: 'booking'; id: string } | { kind: 'quote'; id: string };
  method: PaymentMethod;
  /** "YYYY-MM-DD"; empty = the server picks tomorrow. */
  dueDate?: string;
  description?: string;
  /**
   * The CRM client who pays. Needed only when the booking or quote is not linked to one (a linked
   * item keeps its own client; naming another is refused). The payer's name and document come
   * from the CRM record, never from the request: the document must be saved there first.
   */
  providerClientId?: string;
}

/** Charges an own booking or an accepted quote. Needs the Pro plan and an active receiving account (the function checks both). */
export const createCharge = (input: NewCharge): Promise<ChargeResult> =>
  guard(async () => {
    const body: Record<string, unknown> = {
      [input.target.kind === 'booking' ? 'booking_id' : 'quote_id']: input.target.id,
      method: input.method,
    };
    if (input.providerClientId) body.provider_client_id = input.providerClientId;
    if (input.dueDate) body.due_date = input.dueDate;
    if (input.description?.trim()) body.description = input.description.trim();
    return invokeFunction<ChargeResult>('charges-create', body);
  });

/** Payments of the provider (RLS), newest first. */
export const listMyPayments = (providerId: string): Promise<PaymentRow[]> =>
  guard(async () =>
    unwrap<PaymentRow[]>(
      await db().from('payments').select(PAYMENT_COLUMNS).eq('provider_id', providerId).order('created_at', { ascending: false }),
    ),
  );

// ---- Sharing ------------------------------------------------------------------

/**
 * Text the provider sends to the client with a charge: the invoice link when there is one (it
 * shows Pix, boleto or card on the Asaas page), else the Pix "copia e cola" code on its own line.
 */
export const chargeShareText = (charge: { amountCents: number | null; invoiceUrl: string | null; pixPayload: string | null }): string => {
  const amount = charge.amountCents !== null ? ` de ${formatCents(charge.amountCents)}` : '';
  if (charge.invoiceUrl) return `Olá! Segue a cobrança${amount}. Para pagar, abra: ${charge.invoiceUrl}`;
  return `Olá! Segue a cobrança${amount}. Pix copia e cola:\n${charge.pixPayload ?? ''}`;
};

/** wa.me link with the text ready and no number (the provider picks the chat); the platform sends nothing. */
export const chargeWhatsAppUrl = (charge: Parameters<typeof chargeShareText>[0]): string =>
  `https://wa.me/?text=${encodeURIComponent(chargeShareText(charge))}`;
