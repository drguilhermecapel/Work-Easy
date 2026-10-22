import { AppError, toAppError } from '../lib/errors';
import { db, invokeFunction, unwrap } from './client';

export type PaymentMethod = 'pix' | 'credit_card' | 'boleto';
export type PaymentStatus = 'pending' | 'confirmed' | 'received' | 'held' | 'released' | 'refunded' | 'failed' | 'canceled';

/** payments, only the columns the screens use (RLS: payer, provider and admin read). */
export interface PaymentRow {
  id: string;
  booking_id: string | null;
  method: PaymentMethod | 'undefined';
  amount_cents: number;
  status: PaymentStatus;
  escrow: boolean;
  invoice_url: string | null;
  pix_qr_code: string | null;
  pix_payload: string | null;
  due_date: string | null;
  created_at: string;
}

const PAYMENT_COLUMNS =
  'id, booking_id, method, amount_cents, status, escrow, invoice_url, pix_qr_code, pix_payload, due_date, created_at';

/** Statuses that count as paid through the app (same as the database check on reviews). */
const PAID_STATUSES: readonly PaymentStatus[] = ['received', 'confirmed', 'released'];

export const isPaid = (payment: Pick<PaymentRow, 'status'>): boolean => PAID_STATUSES.includes(payment.status);

/** Payments of a booking, newest first. */
export const listBookingPayments = async (bookingId: string): Promise<PaymentRow[]> =>
  unwrap<PaymentRow[]>(
    await db().from('payments').select(PAYMENT_COLUMNS).eq('booking_id', bookingId).order('created_at', { ascending: false }),
  );

/** What the payments-create function answers (the card number never passes through the app). */
export interface PaymentCharge {
  payment_id: string;
  method: PaymentMethod | 'undefined';
  status: PaymentStatus;
  amount_cents: number;
  due_date: string | null;
  invoice_url: string | null;
  pix: { payload: string; qr_code_base64: string | null } | null;
  reused: boolean;
}

// Codes of payments-create that the shared error table does not have; their HTTP
// status (409) would otherwise read as "already exists".
const CHARGE_MESSAGES: Record<string, string> = {
  booking_not_payable: 'Só atendimentos aceitos pelo profissional podem ser pagos.',
  provider_payment_account_missing:
    'Este profissional ainda não ativou o recebimento pelo app. Combine a forma de pagamento diretamente com ele.',
  payment_key_missing: 'O recebimento deste profissional está com um problema. Fale com o suporte.',
  price_missing: 'Este atendimento ainda não tem valor definido.',
  own_booking: 'Este atendimento é cobrado pelo próprio profissional.',
  payment_in_progress: 'Já existe um pagamento em andamento para este atendimento. Atualize a página.',
};

/** The function's error code, from the parsed answer or from the HTTP response kept in the cause. */
const chargeErrorCode = async (err: AppError): Promise<string | undefined> => {
  const cause = err.cause as { error?: { code?: unknown }; context?: unknown } | undefined;
  if (typeof cause?.error?.code === 'string') return cause.error.code;
  const context = cause?.context as Response | undefined;
  if (context && typeof context.clone === 'function') {
    try {
      const body = (await context.clone().json()) as { error?: { code?: unknown } };
      if (typeof body?.error?.code === 'string') return body.error.code;
    } catch {
      // not JSON
    }
  }
  return undefined;
};

export const onlyDigits = (value: string): string => value.replace(/\D/g, '');

export interface CreateChargeInput {
  bookingId: string;
  method: PaymentMethod;
  /** Needed only for the first charge of a customer (cpf_cnpj_required). */
  cpfCnpj?: string;
}

/**
 * Creates (or returns the open) charge of a booking. Pix comes with the
 * copy-and-paste code; card and boleto come as the Asaas invoice link, where
 * the payer types the card, never in this app.
 */
export const createCharge = async (input: CreateChargeInput): Promise<PaymentCharge> => {
  const document = input.cpfCnpj ? onlyDigits(input.cpfCnpj) : '';
  if (input.cpfCnpj && document.length !== 11 && document.length !== 14) {
    throw new AppError('invalid_input', { message: 'Informe um CPF (11 números) ou CNPJ (14 números) válido.' });
  }
  try {
    return await invokeFunction<PaymentCharge>('payments-create', {
      booking_id: input.bookingId,
      method: input.method,
      ...(document ? { cpf_cnpj: document } : {}),
    });
  } catch (err) {
    const error = toAppError(err);
    const code = await chargeErrorCode(error);
    const message = code ? CHARGE_MESSAGES[code] : undefined;
    if (message) throw new AppError('invalid_input', { cause: err, detail: code, message });
    throw error;
  }
};
