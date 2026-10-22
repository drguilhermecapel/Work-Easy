// payments-create (cliente): charges an `accepted` platform booking through the
// platform's Asaas account, with a split to the provider's wallet
// (amount − platform fee). Pix returns the QR code; card and boleto use the
// Asaas invoice page (`invoiceUrl`), so the app never handles card numbers.

import type { AsaasClient } from '../_shared/asaas-client.ts';
import { addDays, saoPauloDate } from '../_shared/dates.ts';
import {
  type AuditEntry, type AuthUser, type BaseDeps, callAsaas, validated,
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
    findOpenPayment(bookingId: string): Promise<PaymentRecord | null>;
    getProviderWallet(providerId: string): Promise<string | null>;
    getCustomerId(userId: string): Promise<string | null>;
    saveCustomerId(userId: string, asaasCustomerId: string): Promise<void>;
    getProfile(userId: string): Promise<{ full_name: string | null; phone: string | null } | null>;
    insertPayment(row: NewPayment): Promise<{ id: string }>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

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

export function handler(req: Request, deps: PaymentsCreateDeps): Promise<Response> {
  return route(req, { methods: ['POST'], siteUrl: deps.siteUrl, onError: deps.logError }, async () => {
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

    const open = await deps.admin.findOpenPayment(booking.id);
    if (open) return { data: paymentView(open, true) };

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
    const dueDate = addDays(saoPauloDate(deps.now()), 1);
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
      raw: payment,
    };
    const saved = await deps.admin.insertPayment(row);
    await deps.admin.audit({
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
