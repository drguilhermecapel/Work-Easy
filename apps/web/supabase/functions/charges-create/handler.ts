// charges-create (prestador Pro): charges the provider's own client (own
// booking) or an accepted quote, in the provider's Asaas subaccount, with no
// platform fee and no split. The payer is a client of the provider's CRM: name,
// e-mail, phone and CPF/CNPJ come from that stored record, never from the request.

import type { AsaasClient } from '../_shared/asaas-client.ts';
import { addDays, saoPauloDate } from '../_shared/dates.ts';
import { redactAsaasPayload } from '../_shared/asaas-events.ts';
import {
  type AuditEntry, type AuthUser, type BaseDeps, auditSafely, callAsaas, corsOf, validated,
} from '../_shared/handler-kit.ts';
import { errors, HttpError, readJson, route } from '../_shared/http.ts';
import { centsToReais } from '../_shared/money.ts';
import { type ProviderApproval, requireApprovedProvider } from '../_shared/provider-approval.ts';
import { BILLING_TYPE, PAYMENT_METHODS } from '../_shared/types.ts';
import { isoDate, object, oneOf, optional, string, uuid } from '../_shared/validate.ts';
import {
  ALREADY_PAID, ALREADY_PAID_MESSAGE, type NewPayment, type PaymentRecord, paymentView, reuseOrRetire, saveCharge,
} from '../payments-create/handler.ts';

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
  title: string;
  total_cents: number | null;
  status: string;
}

/** A client of the provider's CRM: the only source of the payer's data. */
export interface ProviderClient {
  provider_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  cpf_cnpj: string | null;
  client_id: string | null;
}

export interface ChargesCreateDeps extends BaseDeps {
  /** Client built from ASAAS_BASE_URL; null when Asaas is not configured. */
  asaas: AsaasClient | null;
  session(req: Request): Promise<{
    user: AuthUser;
    getProvider(): Promise<(ProviderApproval & { id: string; plan: string }) | null>;
    getBooking(id: string): Promise<OwnBooking | null>;
    getQuote(id: string): Promise<ProviderQuote | null>;
    getProviderClient(id: string): Promise<ProviderClient | null>;
  } | null>;
  admin: {
    /** Subaccount API key from the Vault, or null if onboarding did not store one. */
    getSubaccountApiKey(providerId: string): Promise<string | null>;
    /** True when the booking or quote already has a payment received/confirmed/held/released. */
    hasPaidCharge(target: { bookingId?: string; quoteId?: string }): Promise<boolean>;
    findOpenCharge(target: { bookingId?: string; quoteId?: string }): Promise<PaymentRecord | null>;
    /** Rejects with a unique violation (23505) when a pending charge already exists for the target. */
    insertPayment(row: NewPayment): Promise<{ id: string }>;
    markPaymentCanceled(id: string): Promise<void>;
    audit(entry: AuditEntry): Promise<void>;
  };
}

const Body = object({
  booking_id: optional(uuid()),
  quote_id: optional(uuid()),
  /** One of the provider's CRM clients; only used when the booking or quote is not linked to one. */
  provider_client_id: optional(uuid()),
  method: oneOf(PAYMENT_METHODS),
  due_date: optional(isoDate()),
  description: optional(string({ max: 300 })),
});

const CHARGEABLE_BOOKING = new Set(['accepted', 'in_progress', 'completed']);

/** The client of the charge: the one the booking or quote is linked to, else the one the provider picked. */
function chooseClient(linked: string | null, picked: string | undefined): string | null {
  if (linked && picked && linked !== picked) {
    throw errors.invalidInput(['provider_client_id: este atendimento já está vinculado a outro cliente']);
  }
  return linked ?? picked ?? null;
}

export function handler(req: Request, deps: ChargesCreateDeps): Promise<Response> {
  return route(req, { methods: ['POST'], ...corsOf(deps), onError: deps.logError }, async () => {
    const session = await deps.session(req);
    if (!session) throw errors.unauthorized();
    const asaas = deps.asaas;
    if (!asaas) throw errors.paymentsNotConfigured();
    const raw = await readJson(req);
    // The payer's data is never taken from the request: the provider picks a CRM client instead
    if (raw && typeof raw === 'object' && 'customer' in raw) {
      throw errors.invalidInput(['customer: os dados do cliente vêm do CRM; envie provider_client_id']);
    }
    const input = validated(Body, raw);
    if (Boolean(input.booking_id) === Boolean(input.quote_id)) {
      throw errors.invalidInput(['Informe booking_id ou quote_id (apenas um).']);
    }

    const provider = await session.getProvider();
    if (!provider || provider.id !== session.user.id) throw errors.notAllowed('Disponível apenas para prestadores.');
    if (provider.plan !== 'pro') throw new HttpError(403, 'pro_required', 'Cobranças de clientes próprios fazem parte do plano Pro.');
    // Money moves only for an account the admin approved (checked again for the booking's occupation)
    requireApprovedProvider(provider);

    let amount: number;
    let linkedClient: string | null;
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
      requireApprovedProvider(provider, booking.occupation_slug);
      amount = booking.price_cents ?? 0;
      linkedClient = booking.provider_client_id;
      description = input.description ?? `Atendimento ${booking.occupation_slug}`;
    } else {
      const quote = await session.getQuote(input.quote_id!);
      if (!quote || quote.provider_id !== provider.id) throw errors.notFound('Orçamento');
      if (quote.status !== 'accepted') throw errors.conflict('quote_not_accepted', 'Só orçamentos aceitos podem ser cobrados.');
      amount = quote.total_cents ?? 0;
      linkedClient = quote.provider_client_id;
      description = input.description ?? `Orçamento: ${quote.title}`;
    }
    const target = input.booking_id ? { bookingId: input.booking_id } : { quoteId: input.quote_id };
    if (await deps.admin.hasPaidCharge(target)) throw errors.conflict(ALREADY_PAID, ALREADY_PAID_MESSAGE);
    if (amount <= 0) throw errors.conflict('price_missing', 'O valor da cobrança não está definido.');

    const clientId = chooseClient(linkedClient, input.provider_client_id);
    if (!clientId) throw errors.invalidInput(['provider_client_id: escolha um cliente do seu CRM para cobrar']);
    const client = await session.getProviderClient(clientId);
    if (!client || client.provider_id !== provider.id) throw errors.notFound('Cliente');
    if (!client.cpf_cnpj) {
      throw errors.conflict('customer_document_missing', 'Cadastre o CPF ou CNPJ do cliente no CRM antes de cobrar.');
    }

    const apiKey = await deps.admin.getSubaccountApiKey(provider.id);
    if (!apiKey) {
      throw errors.conflict('provider_payment_account_missing', 'Ative o recebimento pelo Asaas antes de cobrar clientes.');
    }
    const sub = asaas.withApiKey(apiKey);

    const today = saoPauloDate(deps.now());
    const open = await deps.admin.findOpenCharge(target);
    if (open) {
      const kept = await reuseOrRetire(sub, open, { method: input.method, today }, deps.admin.markPaymentCanceled);
      if (kept) return { data: paymentView(kept, true) };
    }

    const dueDate = input.due_date ?? addDays(today, 1);
    if (dueDate < today) throw errors.invalidInput(['due_date: o vencimento não pode estar no passado']);

    const customer = await callAsaas(() =>
      sub.createCustomer({
        name: client.name,
        cpfCnpj: client.cpf_cnpj!,
        email: client.email ?? undefined,
        mobilePhone: client.phone ?? undefined,
        externalReference: `provider_client:${clientId}`,
        notificationDisabled: true,
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
      payer_id: client.client_id,
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
      raw: redactAsaasPayload(payment),
    };
    const outcome = await saveCharge({
      client: sub,
      row,
      insert: deps.admin.insertPayment,
      findOpen: () => deps.admin.findOpenCharge(target),
      logError: deps.logError,
    });
    if ('existing' in outcome) return { data: paymentView(outcome.existing, true) };
    const saved = outcome.saved;
    // The charge exists in Asaas: a failed audit is logged, never returned
    await auditSafely(deps, {
      actor_id: provider.id,
      action: 'charge.create',
      entity: 'payments',
      entity_id: saved.id,
      data: { reference, amount_cents: amount, method: input.method, asaas_payment_id: payment.id },
    });
    return { status: 201, data: paymentView({ ...row, id: saved.id }, false) };
  });
}
