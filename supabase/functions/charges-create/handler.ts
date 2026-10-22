// charges-create (prestador Pro): charges the provider's own client (own
// booking) or an accepted quote, in the provider's Asaas subaccount, with no
// platform fee and no split.

import type { AsaasClient } from '../_shared/asaas-client.ts';
import { addDays, saoPauloDate } from '../_shared/dates.ts';
import { type AuditEntry, type AuthUser, type BaseDeps, callAsaas, validated } from '../_shared/handler-kit.ts';
import { errors, HttpError, readJson, route } from '../_shared/http.ts';
import { centsToReais } from '../_shared/money.ts';
import { BILLING_TYPE, PAYMENT_METHODS } from '../_shared/types.ts';
import { cpfCnpj, email, isoDate, object, oneOf, optional, phoneBR, string, uuid } from '../_shared/validate.ts';
import { type NewPayment, type PaymentRecord, paymentView } from '../payments-create/handler.ts';

export interface OwnBooking {
  id: string;
  provider_id: string;
  client_id: string | null;
  provider_client_id: string | null;
  occupation_slug: string;
  status: string;
  origin: string;
  price_cents: number | null;
}

export interface ProviderQuote {
  id: string;
  provider_id: string;
  provider_client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  title: string;
  total_cents: number | null;
  status: string;
}

export interface ProviderClient {
  name: string | null;
  phone: string | null;
  email: string | null;
  client_id: string | null;
}

export interface ChargesCreateDeps extends BaseDeps {
  /** Client built from ASAAS_BASE_URL; null when Asaas is not configured. */
  asaas: AsaasClient | null;
  session(req: Request): Promise<{
    user: AuthUser;
    getProvider(): Promise<{ id: string; plan: string } | null>;
    getBooking(id: string): Promise<OwnBooking | null>;
    getQuote(id: string): Promise<ProviderQuote | null>;
    getProviderClient(id: string): Promise<ProviderClient | null>;
  } | null>;
  admin: {
    /** Subaccount API key from the Vault, or null if onboarding did not store one. */
    getSubaccountApiKey(providerId: string): Promise<string | null>;
    findOpenCharge(target: { bookingId?: string; quoteId?: string }): Promise<PaymentRecord | null>;
    insertPayment(row: NewPayment): Promise<{ id: string }>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

const Body = object({
  booking_id: optional(uuid()),
  quote_id: optional(uuid()),
  method: oneOf(PAYMENT_METHODS),
  due_date: optional(isoDate()),
  description: optional(string({ max: 300 })),
  customer: object({
    cpf_cnpj: cpfCnpj(),
    name: optional(string({ min: 2, max: 120 })),
    email: optional(email()),
    phone: optional(phoneBR()),
  }),
});

const CHARGEABLE_BOOKING = new Set(['accepted', 'in_progress', 'completed']);

export function handler(req: Request, deps: ChargesCreateDeps): Promise<Response> {
  return route(req, { methods: ['POST'], siteUrl: deps.siteUrl, onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const asaas = deps.asaas;
    if (!asaas) throw errors.paymentsNotConfigured();
    const input = validated(Body, await readJson(req));
    if (Boolean(input.booking_id) === Boolean(input.quote_id)) {
      throw errors.invalidInput(['Informe booking_id ou quote_id (apenas um).']);
    }

    const provider = await session.getProvider();
    if (!provider || provider.id !== session.user.id) throw errors.notAllowed('Disponível apenas para prestadores.');
    if (provider.plan !== 'pro') throw new HttpError(403, 'pro_required', 'Cobranças de clientes próprios fazem parte do plano Pro.');

    let amount: number;
    let payerId: string | null = null;
    let clientRef: string | null = null;
    let fallbackName: string | null = null;
    let fallbackPhone: string | null = null;
    let fallbackEmail: string | null = null;
    let description: string;

    if (input.booking_id) {
      const booking = await session.getBooking(input.booking_id);
      if (!booking || booking.provider_id !== provider.id) throw errors.notFound('Atendimento');
      if (booking.origin !== 'own') {
        throw errors.conflict('platform_booking', 'Atendimentos da plataforma são pagos pelo cliente no app.');
      }
      if (!CHARGEABLE_BOOKING.has(booking.status)) {
        throw errors.conflict('booking_not_chargeable', 'Este atendimento não pode ser cobrado no status atual.');
      }
      amount = booking.price_cents ?? 0;
      payerId = booking.client_id;
      clientRef = booking.provider_client_id;
      description = input.description ?? `Atendimento ${booking.occupation_slug}`;
    } else {
      const quote = await session.getQuote(input.quote_id!);
      if (!quote || quote.provider_id !== provider.id) throw errors.notFound('Orçamento');
      if (quote.status !== 'accepted') throw errors.conflict('quote_not_accepted', 'Só orçamentos aceitos podem ser cobrados.');
      amount = quote.total_cents ?? 0;
      clientRef = quote.provider_client_id;
      fallbackName = quote.client_name;
      fallbackPhone = quote.client_phone;
      description = input.description ?? `Orçamento: ${quote.title}`;
    }
    if (amount <= 0) throw errors.conflict('price_missing', 'O valor da cobrança não está definido.');

    if (clientRef) {
      const client = await session.getProviderClient(clientRef);
      if (client) {
        fallbackName = client.name ?? fallbackName;
        fallbackPhone = client.phone ?? fallbackPhone;
        fallbackEmail = client.email;
        payerId = payerId ?? client.client_id;
      }
    }
    const name = input.customer.name ?? fallbackName?.trim();
    if (!name) throw errors.invalidInput(['customer.name: nome do cliente obrigatório']);

    const open = await deps.admin.findOpenCharge(input.booking_id ? { bookingId: input.booking_id } : { quoteId: input.quote_id });
    if (open) return { data: paymentView(open, true) };

    const apiKey = await deps.admin.getSubaccountApiKey(provider.id);
    if (!apiKey) {
      throw errors.conflict('provider_payment_account_missing', 'Ative o recebimento pelo Asaas antes de cobrar clientes.');
    }
    const sub = asaas.withApiKey(apiKey);

    const today = saoPauloDate(deps.now());
    const dueDate = input.due_date ?? addDays(today, 1);
    if (dueDate < today) throw errors.invalidInput(['due_date: o vencimento não pode estar no passado']);

    const customer = await callAsaas(() =>
      sub.createCustomer({
        name,
        cpfCnpj: input.customer.cpf_cnpj,
        email: input.customer.email ?? fallbackEmail ?? undefined,
        mobilePhone: input.customer.phone ?? fallbackPhone ?? undefined,
        externalReference: clientRef ? `provider_client:${clientRef}` : undefined,
      }),
    );
    const reference = input.booking_id ? `booking:${input.booking_id}` : `quote:${input.quote_id}`;
    const payment = await callAsaas(() =>
      sub.createPayment({
        customer: customer.id,
        billingType: BILLING_TYPE[input.method],
        value: centsToReais(amount),
        dueDate,
        description,
        externalReference: reference,
      }),
    );

    let pix: { encodedImage: string; payload: string } | null = null;
    if (input.method === 'pix') {
      try {
        pix = await callAsaas(() => sub.getPixQrCode(payment.id));
      } catch (error) {
        deps.logError(error);
      }
    }

    const row: NewPayment = {
      booking_id: input.booking_id ?? null,
      quote_id: input.quote_id ?? null,
      provider_id: provider.id,
      payer_id: payerId,
      asaas_payment_id: payment.id,
      method: input.method,
      amount_cents: amount,
      platform_fee_cents: 0,
      status: 'pending',
      escrow: false,
      invoice_url: payment.invoiceUrl ?? null,
      pix_qr_code: pix?.encodedImage ?? null,
      pix_payload: pix?.payload ?? null,
      due_date: dueDate,
      raw: payment,
    };
    const saved = await deps.admin.insertPayment(row);
    await deps.admin.audit({
      actor_id: provider.id,
      action: 'charge.create',
      entity: 'payments',
      entity_id: saved.id,
      data: { reference, amount_cents: amount, method: input.method, asaas_payment_id: payment.id },
    });
    return { status: 201, data: paymentView({ ...row, id: saved.id }, false) };
  });
}
