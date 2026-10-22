// payments-create (cliente): charges an `accepted` platform booking through the
// platform's Asaas account, with a split to the provider's wallet
// (amount − platform fee). Pix returns the QR code; card and boleto use the
// Asaas invoice page (`invoiceUrl`), so the app never handles card numbers.

import { AsaasError, type AsaasClient } from '../_shared/asaas-client.ts';
import { addDays, saoPauloDate } from '../_shared/dates.ts';
import { redactAsaasPayload } from '../_shared/asaas-events.ts';
import {
  type AuditEntry, type AuthUser, type BaseDeps, auditSafely, callAsaas, corsOf, isUniqueViolation, toHttpError, validated,
} from '../_shared/handler-kit.ts';
import { errors, HttpError, readJson, route } from '../_shared/http.ts';
import { centsToReais } from '../_shared/money.ts';
import { buildProviderSplit } from '../_shared/split.ts';
import { BILLING_TYPE, PAYMENT_METHODS, type PaymentMethod, type PaymentStatus } from '../_shared/types.ts';
import { cpfCnpj, object, oneOf, optional, uuid } from '../_shared/validate.ts';

export interface BookingForPayment {
  id: string;
  client_id: string | null;
  provider_id: string;
  occupation_slug: string;
  status: string;
  origin: string;
  price_cents: number | null;
  platform_fee_cents: number | null;
}

export interface PaymentRecord {
  id: string;
  asaas_payment_id: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amount_cents: number;
  invoice_url: string | null;
  pix_qr_code: string | null;
  pix_payload: string | null;
  due_date: string | null;
}

export interface NewPayment {
  booking_id: string | null;
  quote_id: string | null;
  provider_id: string;
  payer_id: string | null;
  asaas_payment_id: string;
  method: PaymentMethod;
  amount_cents: number;
  platform_fee_cents: number;
  status: PaymentStatus;
  escrow: boolean;
  invoice_url: string | null;
  pix_qr_code: string | null;
  pix_payload: string | null;
  due_date: string;
  raw: unknown;
}

export interface PaymentsCreateDeps extends BaseDeps {
  /** Platform (root account) client, or null without ASAAS_API_KEY. */
  asaas: AsaasClient | null;
  session(req: Request): Promise<{ user: AuthUser; getBooking(id: string): Promise<BookingForPayment | null> } | null>;
  admin: {
    /** True when the booking already has a payment received/confirmed/held/released. */
    hasPaidPayment(bookingId: string): Promise<boolean>;
    findOpenPayment(bookingId: string): Promise<PaymentRecord | null>;
    getProviderWallet(providerId: string): Promise<string | null>;
    getCustomerId(userId: string): Promise<string | null>;
    saveCustomerId(userId: string, asaasCustomerId: string): Promise<void>;
    getProfile(userId: string): Promise<{ full_name: string | null; phone: string | null } | null>;
    /** Rejects with a unique violation (23505) when the database already has a pending charge for the booking. */
    insertPayment(row: NewPayment): Promise<{ id: string }>;
    markPaymentCanceled(id: string): Promise<void>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

export const ALREADY_PAID = 'already_paid';
export const ALREADY_PAID_MESSAGE = 'Este item já foi pago. Não é possível cobrar de novo.';

const Body = object({
  booking_id: uuid(),
  method: oneOf(PAYMENT_METHODS),
  cpf_cnpj: optional(cpfCnpj()),
});

export function paymentView(p: PaymentRecord, reused: boolean) {
  return {
    payment_id: p.id,
    asaas_payment_id: p.asaas_payment_id,
    method: p.method,
    status: p.status,
    amount_cents: p.amount_cents,
    due_date: p.due_date,
    invoice_url: p.invoice_url,
    pix: p.pix_payload ? { payload: p.pix_payload, qr_code_base64: p.pix_qr_code } : null,
    reused,
  };
}

/** Ensures an Asaas customer for a WorkEasy user in the platform account. */
export interface CustomerStore {
  getCustomerId(userId: string): Promise<string | null>;
  saveCustomerId(userId: string, asaasCustomerId: string): Promise<void>;
  getProfile(userId: string): Promise<{ full_name: string | null; phone: string | null } | null>;
}

export async function ensurePlatformCustomer(
  deps: { admin: CustomerStore; asaas: AsaasClient },
  user: AuthUser,
  document: string | undefined,
): Promise<string> {
  const existing = await deps.admin.getCustomerId(user.id);
  if (existing) return existing;
  if (!document) {
    throw new HttpError(400, 'cpf_cnpj_required', 'Informe o CPF ou CNPJ para o primeiro pagamento.');
  }
  const profile = await deps.admin.getProfile(user.id);
  const name = profile?.full_name?.trim();
  if (!name) throw new HttpError(400, 'profile_incomplete', 'Complete seu nome no perfil antes de pagar.');
  const customer = await callAsaas(() =>
    deps.asaas.createCustomer({
      name,
      cpfCnpj: document,
      email: user.email ?? undefined,
      mobilePhone: profile?.phone ?? undefined,
      externalReference: `user:${user.id}`,
      // WorkEasy sends its own notifications
      notificationDisabled: true,
    }),
  );
  await deps.admin.saveCustomerId(user.id, customer.id);
  return customer.id;
}

/**
 * The pending charge to hand back for a new request, or null when it was
 * replaced: a charge for another method, or already past its due date (Asaas
 * keeps it open as overdue), is removed in Asaas and marked canceled so the
 * caller creates a fresh one. A charge Asaas will not remove (already paid and
 * waiting for the webhook) is kept and returned.
 */
export async function reuseOrRetire(
  client: AsaasClient,
  open: PaymentRecord,
  wanted: { method: PaymentMethod; today: string },
  markCanceled: (id: string) => Promise<void>,
): Promise<PaymentRecord | null> {
  const stillValid = open.due_date === null || open.due_date >= wanted.today;
  if (open.method === wanted.method && stillValid) return open;
  try {
    await client.deletePayment(open.asaas_payment_id);
  } catch (error) {
    if (error instanceof AsaasError && (error.status === 400 || error.status === 409)) return open;
    if (!(error instanceof AsaasError && error.status === 404)) throw toHttpError(error);
  }
  await markCanceled(open.id);
  return null;
}

/**
 * Stores a charge already created in Asaas. If the database refuses it (a
 * concurrent request got there first, or any failure) the Asaas charge is
 * removed so the payer cannot pay a charge WorkEasy has no record of; on a
 * duplicate the winner's charge is returned.
 */
export async function saveCharge(input: {
  client: AsaasClient;
  row: NewPayment;
  insert(row: NewPayment): Promise<{ id: string }>;
  findOpen(): Promise<PaymentRecord | null>;
  logError(error: unknown): void;
}): Promise<{ saved: { id: string } } | { existing: PaymentRecord }> {
  try {
    return { saved: await input.insert(input.row) };
  } catch (error) {
    try {
      await input.client.deletePayment(input.row.asaas_payment_id);
    } catch (cleanup) {
      input.logError(cleanup);
      input.logError(new Error(`charge ${input.row.asaas_payment_id} left in Asaas without a payments row`));
    }
    if (isUniqueViolation(error)) {
      const existing = await input.findOpen();
      if (existing) return { existing };
    }
    throw error;
  }
}

export function handler(req: Request, deps: PaymentsCreateDeps): Promise<Response> {
  return route(req, { methods: ['POST'], ...corsOf(deps), onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const asaas = deps.asaas;
    if (!asaas) throw errors.paymentsNotConfigured();
    const input = validated(Body, await readJson(req));
    const { user } = session;

    const booking = await session.getBooking(input.booking_id);
    if (!booking) throw errors.notFound('Atendimento');
    if (booking.client_id !== user.id) throw errors.notAllowed('Só o cliente do atendimento pode pagar.');
    if (booking.origin !== 'platform') {
      throw errors.conflict('own_booking', 'Atendimentos de clientes próprios são cobrados pelo prestador.');
    }
    if (booking.status !== 'accepted') {
      throw errors.conflict('booking_not_payable', 'Só atendimentos aceitos podem ser pagos.');
    }
    const amount = booking.price_cents ?? 0;
    if (amount <= 0) throw errors.conflict('price_missing', 'O atendimento não tem valor definido.');

    // Paid but the webhook has not moved the booking yet: charging again would make the client pay twice
    if (await deps.admin.hasPaidPayment(booking.id)) throw errors.conflict(ALREADY_PAID, ALREADY_PAID_MESSAGE);

    const today = saoPauloDate(deps.now());
    const open = await deps.admin.findOpenPayment(booking.id);
    if (open) {
      const kept = await reuseOrRetire(asaas, open, { method: input.method, today }, deps.admin.markPaymentCanceled);
      if (kept) return { data: paymentView(kept, true) };
    }

    const wallet = await deps.admin.getProviderWallet(booking.provider_id);
    if (!wallet) {
      throw errors.conflict('provider_payment_account_missing', 'O prestador ainda não ativou o recebimento pelo Asaas.');
    }

    const fee = booking.platform_fee_cents ?? 0;
    const plan = buildProviderSplit({
      amountCents: amount,
      platformFeeCents: fee,
      providerWalletId: wallet,
      reference: `booking:${booking.id}`,
    });

    const customerId = await ensurePlatformCustomer({ admin: deps.admin, asaas }, user, input.cpf_cnpj);
    const dueDate = addDays(today, 1);
    const payment = await callAsaas(() =>
      asaas.createPayment({
        customer: customerId,
        billingType: BILLING_TYPE[input.method],
        value: centsToReais(amount),
        dueDate,
        description: `WorkEasy: atendimento ${booking.occupation_slug}`,
        externalReference: `booking:${booking.id}`,
        split: plan.split,
      }),
    );

    let pix: { encodedImage: string; payload: string } | null = null;
    if (input.method === 'pix') {
      try {
        pix = await callAsaas(() => asaas.getPixQrCode(payment.id));
      } catch (error) {
        // The charge exists; the QR code can still be read on the invoice page
        deps.logError(error);
      }
    }

    const row: NewPayment = {
      booking_id: booking.id,
      quote_id: null,
      provider_id: booking.provider_id,
      payer_id: user.id,
      asaas_payment_id: payment.id,
      method: input.method,
      amount_cents: amount,
      platform_fee_cents: fee,
      status: 'pending',
      // escrow_enabled stays false until the legal review (contract)
      escrow: false,
      invoice_url: payment.invoiceUrl ?? null,
      pix_qr_code: pix?.encodedImage ?? null,
      pix_payload: pix?.payload ?? null,
      due_date: dueDate,
      raw: redactAsaasPayload(payment),
    };
    const outcome = await saveCharge({
      client: asaas,
      row,
      insert: deps.admin.insertPayment,
      findOpen: () => deps.admin.findOpenPayment(booking.id),
      logError: deps.logError,
    });
    if ('existing' in outcome) return { data: paymentView(outcome.existing, true) };
    const saved = outcome.saved;
    // The charge exists in Asaas: a failed audit is logged, never returned
    await auditSafely(deps, {
      actor_id: user.id,
      action: 'payment.create',
      entity: 'payments',
      entity_id: saved.id,
      data: { booking_id: booking.id, amount_cents: amount, platform_fee_cents: fee, method: input.method, asaas_payment_id: payment.id },
    });

    return {
      status: 201,
      data: paymentView({ ...row, id: saved.id }, false),
    };
  });
}
