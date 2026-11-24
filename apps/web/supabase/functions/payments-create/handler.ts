// payments-create (cliente): charges an `accepted` platform booking through the
// platform's Asaas account, with a split to the provider's wallet
// (amount − platform fee). Pix returns the QR code; card and boleto use the
// Asaas invoice page (`invoiceUrl`), so the app never handles card numbers.

import { AsaasError, type AsaasClient } from '../_shared/asaas-client.ts';
import { addDays, saoPauloDate } from '../_shared/dates.ts';
import { ASAAS_PAID, redactAsaasPayload } from '../_shared/asaas-events.ts';
import {
  type AuditEntry, type AuthUser, type BaseDeps, auditSafely, callAsaas, corsOf, isUniqueViolation, validated,
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

/** The open charge stays when it is for the same method and not past its due date (due today is still valid). */
export function canReuseCharge(open: PaymentRecord, wanted: { method: PaymentMethod; today: string }): boolean {
  const stillValid = open.due_date === null || open.due_date >= wanted.today;
  return open.method === wanted.method && stillValid;
}

export const REPLACE_FAILED_MESSAGE =
  'Não foi possível trocar a forma de pagamento agora. A cobrança anterior continua em aberto; tente de novo.';

/**
 * Refuses a replacement when Asaas already shows the open charge as paid (RECEIVED, CONFIRMED,
 * RECEIVED_IN_CASH...). Runs before anything new is created in Asaas.
 */
export async function refuseIfSettled(client: AsaasClient, open: PaymentRecord): Promise<void> {
  const remote = await callAsaas(() => client.getPayment(open.asaas_payment_id));
  if (remote && !remote.deleted && ASAAS_PAID.has(remote.status)) throw errors.conflict(ALREADY_PAID, ALREADY_PAID_MESSAGE);
}

/**
 * Removes a charge that WorkEasy will not keep: one created moments ago, which no row points to.
 * A charge Asaas no longer has is already gone; any other failure is logged, and the caller keeps
 * its own error.
 */
export async function discardCharge(
  client: AsaasClient,
  asaasPaymentId: string,
  logError: (error: unknown) => void,
): Promise<void> {
  try {
    await client.deletePayment(asaasPaymentId);
  } catch (error) {
    if (error instanceof AsaasError && error.status === 404) return;
    logError(error);
    logError(new Error(`charge ${asaasPaymentId} left in Asaas without a payments row`));
  }
}

/**
 * 'canceled': Asaas removed the charge, or it is gone there. 'settled': Asaas refuses to remove a
 * charge it has settled. Any other refusal is thrown.
 */
async function cancelInAsaas(client: AsaasClient, asaasPaymentId: string): Promise<'canceled' | 'settled'> {
  try {
    await client.deletePayment(asaasPaymentId);
    return 'canceled';
  } catch (error) {
    if (!(error instanceof AsaasError) || ![400, 404, 409].includes(error.status)) throw error;
    if (error.status === 404) return 'canceled';
    // Read the charge to tell a paid one from another refusal
    const remote = await callAsaas(() => client.getPayment(asaasPaymentId));
    if (!remote || remote.deleted) return 'canceled';
    if (ASAAS_PAID.has(remote.status)) return 'settled';
    throw error;
  }
}

/**
 * Replaces the open charge with the new one, which already exists in Asaas. The open charge is
 * canceled in Asaas first and then marked canceled in the table: its row is never deleted. When Asaas
 * shows it as paid, the new charge is removed and the request is refused (already_paid). When the
 * cancel fails for any other reason, the new charge is removed, the open one stays pending, the
 * failure is logged and the request fails with 502. (Two pending rows for one booking are refused by
 * payments_one_pending_per_booking_uidx, so a new charge cannot be kept next to the open one.)
 */
export async function replaceOpenCharge(input: {
  client: AsaasClient;
  open: PaymentRecord;
  replacementAsaasId: string;
  markCanceled(id: string): Promise<void>;
  logError(error: unknown): void;
}): Promise<void> {
  let outcome: 'canceled' | 'settled';
  try {
    outcome = await cancelInAsaas(input.client, input.open.asaas_payment_id);
  } catch (error) {
    input.logError(error);
    await discardCharge(input.client, input.replacementAsaasId, input.logError);
    throw new HttpError(502, 'payment_replace_failed', REPLACE_FAILED_MESSAGE);
  }
  if (outcome === 'settled') {
    await discardCharge(input.client, input.replacementAsaasId, input.logError);
    throw errors.conflict(ALREADY_PAID, ALREADY_PAID_MESSAGE);
  }
  try {
    await input.markCanceled(input.open.id);
  } catch (error) {
    // The open charge is already canceled in Asaas: the replacement must not stay without a row
    await discardCharge(input.client, input.replacementAsaasId, input.logError);
    throw error;
  }
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
    await discardCharge(input.client, input.row.asaas_payment_id, input.logError);
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
    if (open && canReuseCharge(open, { method: input.method, today })) return { data: paymentView(open, true) };
    if (open) await refuseIfSettled(asaas, open);

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
        // Generic on purpose: the processor and the payer's statement see this text, not the service category
        description: 'WorkEasy: atendimento',
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
    // The new charge exists in Asaas: the open one is replaced only now, never before
    if (open) {
      await replaceOpenCharge({
        client: asaas,
        open,
        replacementAsaasId: payment.id,
        markCanceled: deps.admin.markPaymentCanceled,
        logError: deps.logError,
      });
    }
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
