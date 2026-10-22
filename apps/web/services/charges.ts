import { AppError } from '../lib/errors';
import { toE164BR } from '../lib/phone';
import type { Tables } from '../lib/database.types';
import { db, invokeFunction, unwrap } from './client';
import { guard } from './proErrors';
import { parseCpfCnpj } from './proFormat';

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
  customer: { cpfCnpj: string; name?: string; email?: string; phone?: string };
}

/** Charges an own booking or an accepted quote. Needs the Pro plan and an active receiving account (the function checks both). */
export const createCharge = (input: NewCharge): Promise<ChargeResult> =>
  guard(async () => {
    const cpfCnpj = parseCpfCnpj(input.customer.cpfCnpj);
    if (!cpfCnpj) throw new AppError('cpf_cnpj_required', { message: 'Informe um CPF ou CNPJ válido do cliente.' });
    const customer: Record<string, string> = { cpf_cnpj: cpfCnpj };
    if (input.customer.name?.trim()) customer.name = input.customer.name.trim();
    if (input.customer.email?.trim()) customer.email = input.customer.email.trim();
    const typedPhone = input.customer.phone?.trim() ?? '';
    if (typedPhone) {
      const phone = toE164BR(typedPhone);
      if (!phone) throw new AppError('invalid_phone');
      customer.phone = phone;
    }
    const body: Record<string, unknown> = {
      [input.target.kind === 'booking' ? 'booking_id' : 'quote_id']: input.target.id,
      method: input.method,
      customer,
    };
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
