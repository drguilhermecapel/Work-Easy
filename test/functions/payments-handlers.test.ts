// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AuditEntry } from '../../supabase/functions/_shared/handler-kit.ts';
import { handler as onboard, type OnboardDeps, type PaymentAccount } from '../../supabase/functions/asaas-onboard/handler.ts';
import { type ChargesCreateDeps, handler as chargesCreate } from '../../supabase/functions/charges-create/handler.ts';
import {
  type BookingForPayment, handler as paymentsCreate, type NewPayment, type PaymentRecord, type PaymentsCreateDeps,
} from '../../supabase/functions/payments-create/handler.ts';
import {
  handler as subscriptions, type SubscriptionRow, type SubscriptionsDeps,
} from '../../supabase/functions/subscriptions-manage/handler.ts';
import { asaasWith, baseDeps, BOOKING_ID, post, PROVIDER, QUOTE_ID, read, USER, VALID_CNPJ, VALID_CPF } from './helpers.ts';

const BOOKING: BookingForPayment = {
  id: BOOKING_ID,
  client_id: USER.id,
  provider_id: PROVIDER.id,
  occupation_slug: 'eletricista',
  status: 'accepted',
  origin: 'platform',
  price_cents: 15000,
  platform_fee_cents: 0,
};

const ASAAS_PAYMENT = { id: 'pay_1', status: 'PENDING', value: 150, dueDate: '2026-10-20', billingType: 'PIX', invoiceUrl: 'https://sandbox.asaas.com/i/1' };

function paymentsDeps(over: {
  booking?: BookingForPayment | null;
  customerId?: string | null;
  wallet?: string | null;
  open?: PaymentRecord | null;
  routes?: Parameters<typeof asaasWith>[0];
  noAsaas?: boolean;
  noSession?: boolean;
} = {}) {
  const inserted: NewPayment[] = [];
  const audits: AuditEntry[] = [];
  const savedCustomers: string[] = [];
  const { client, calls } = asaasWith(over.routes ?? {
    'POST /v3/customers': { body: { id: 'cus_1', name: 'Ana' } },
    'POST /v3/payments': { body: ASAAS_PAYMENT },
    'GET /v3/payments/pay_1/pixQrCode': { body: { encodedImage: 'iVBOR', payload: '000201pix', expirationDate: '2026-10-21 00:00:00' } },
  });
  const deps: PaymentsCreateDeps = {
    ...baseDeps,
    asaas: over.noAsaas ? null : client,
    session: async () =>
      over.noSession ? null : { user: USER, getBooking: async () => (over.booking === undefined ? BOOKING : over.booking) },
    admin: {
      findOpenPayment: async () => over.open ?? null,
      getProviderWallet: async () => (over.wallet === undefined ? 'wal_provider' : over.wallet),
      getCustomerId: async () => over.customerId ?? null,
      saveCustomerId: async (_u, id) => void savedCustomers.push(id),
      getProfile: async () => ({ full_name: 'Ana Cliente', phone: '11987654321' }),
      insertPayment: async row => {
        inserted.push(row);
        return { id: 'payment-row-1' };
      },
      audit: async entry => void audits.push(entry),
    },
  };
  return { deps, calls, inserted, audits, savedCustomers };
}

describe('payments-create', () => {
  it('requires a session, then Asaas configuration', async () => {
    expect((await read(await paymentsCreate(post('payments-create', {}), paymentsDeps({ noSession: true }).deps))).status).toBe(401);
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), paymentsDeps({ noAsaas: true }).deps));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('payments_not_configured');
    expect(res.body.error.message).toContain('depende de configuração');
  });

  it('validates the body', async () => {
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: 'x', method: 'cash' }), paymentsDeps().deps));
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(['booking_id: identificador inválido', 'method: valor inválido']);
  });

  it('only charges the client of an accepted platform booking', async () => {
    const other = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }),
      paymentsDeps({ booking: { ...BOOKING, client_id: PROVIDER.id } }).deps));
    expect(other.status).toBe(403);
    const notAccepted = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }),
      paymentsDeps({ booking: { ...BOOKING, status: 'requested' } }).deps));
    expect(notAccepted.body.error.code).toBe('booking_not_payable');
    const own = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }),
      paymentsDeps({ booking: { ...BOOKING, origin: 'own' } }).deps));
    expect(own.body.error.code).toBe('own_booking');
    const missing = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), paymentsDeps({ booking: null }).deps));
    expect(missing.status).toBe(404);
  });

  it('needs the provider wallet and the payer document on the first payment', async () => {
    const noWallet = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), paymentsDeps({ wallet: null }).deps));
    expect(noWallet.body.error.code).toBe('provider_payment_account_missing');
    const noDoc = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), paymentsDeps().deps));
    expect(noDoc.status).toBe(400);
    expect(noDoc.body.error.code).toBe('cpf_cnpj_required');
  });

  it('creates customer, Pix charge with 100% split (fee 0) and stores it', async () => {
    const { deps, calls, inserted, audits, savedCustomers } = paymentsDeps();
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix', cpf_cnpj: '529.982.247-25' }), deps));
    expect(res.status).toBe(201);
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'POST /v3/customers', 'POST /v3/payments', 'GET /v3/payments/pay_1/pixQrCode',
    ]);
    expect(calls[0].body).toMatchObject({ name: 'Ana Cliente', cpfCnpj: VALID_CPF, email: USER.email, notificationDisabled: true });
    expect(calls[1].body).toEqual({
      customer: 'cus_1', billingType: 'PIX', value: 150, dueDate: '2026-10-20',
      description: 'WorkEasy: atendimento eletricista', externalReference: `booking:${BOOKING_ID}`,
      split: [{ walletId: 'wal_provider', percentualValue: 100, externalReference: `booking:${BOOKING_ID}` }],
    });
    expect(savedCustomers).toEqual(['cus_1']);
    expect(inserted[0]).toMatchObject({
      booking_id: BOOKING_ID, payer_id: USER.id, asaas_payment_id: 'pay_1', amount_cents: 15000,
      platform_fee_cents: 0, status: 'pending', escrow: false, pix_payload: '000201pix',
    });
    expect(audits[0]).toMatchObject({ action: 'payment.create', entity_id: 'payment-row-1' });
    expect(res.body.data).toMatchObject({
      payment_id: 'payment-row-1', invoice_url: 'https://sandbox.asaas.com/i/1',
      pix: { payload: '000201pix', qr_code_base64: 'iVBOR' }, reused: false,
    });
  });

  it('splits amount minus fee as a fixed value when there is a platform fee', async () => {
    const { deps, calls } = paymentsDeps({ booking: { ...BOOKING, price_cents: 9999, platform_fee_cents: 1199 }, customerId: 'cus_9' });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'credit_card' }), deps));
    expect(res.status).toBe(201);
    const body = calls.find(c => c.url.endsWith('/payments'))!.body as { value: number; billingType: string; split: unknown[] };
    expect(body.value).toBe(99.99);
    expect(body.billingType).toBe('CREDIT_CARD');
    expect(body.split).toEqual([{ walletId: 'wal_provider', fixedValue: 88, externalReference: `booking:${BOOKING_ID}` }]);
    expect(calls.some(c => c.url.includes('pixQrCode'))).toBe(false);
  });

  it('reuses a pending payment instead of charging twice', async () => {
    const open: PaymentRecord = {
      id: 'p0', asaas_payment_id: 'pay_0', method: 'pix', status: 'pending', amount_cents: 15000,
      invoice_url: 'u', pix_qr_code: 'img', pix_payload: 'code', due_date: '2026-10-20',
    };
    const { deps, calls } = paymentsDeps({ open });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ payment_id: 'p0', reused: true });
    expect(calls).toHaveLength(0);
  });

  it('reports Asaas rejections as 502 with the Asaas message', async () => {
    const { deps } = paymentsDeps({
      customerId: 'cus_1',
      routes: { 'POST /v3/payments': { status: 400, body: { errors: [{ code: 'invalid_value', description: 'Valor mínimo não atingido.' }] } } },
    });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'boleto' }), deps));
    expect(res.status).toBe(502);
    expect(res.body.error).toMatchObject({ code: 'upstream_error', message: 'O Asaas recusou a operação: Valor mínimo não atingido.' });
  });
});

describe('charges-create', () => {
  function chargesDeps(over: { plan?: string; quoteStatus?: string; apiKey?: string | null } = {}) {
    const inserted: NewPayment[] = [];
    const { client, calls } = asaasWith({
      'POST /v3/customers': { body: { id: 'cus_sub', name: 'Cliente' } },
      'POST /v3/payments': { body: { ...ASAAS_PAYMENT, id: 'pay_sub', billingType: 'BOLETO' } },
    });
    const deps: ChargesCreateDeps = {
      ...baseDeps,
      asaas: client,
      session: async () => ({
        user: PROVIDER,
        getProvider: async () => ({ id: PROVIDER.id, plan: over.plan ?? 'pro' }),
        getBooking: async () => ({
          id: BOOKING_ID, provider_id: PROVIDER.id, client_id: null, provider_client_id: null,
          occupation_slug: 'diarista', status: 'accepted', origin: 'platform', price_cents: 1000,
        }),
        getQuote: async () => ({
          id: QUOTE_ID, provider_id: PROVIDER.id, provider_client_id: null, client_name: 'Dona Maria',
          client_phone: '11987654321', title: 'Pintura', total_cents: 250050, status: over.quoteStatus ?? 'accepted',
        }),
        getProviderClient: async () => null,
      }),
      admin: {
        getSubaccountApiKey: async () => (over.apiKey === undefined ? 'sub-key' : over.apiKey),
        findOpenCharge: async () => null,
        insertPayment: async row => {
          inserted.push(row);
          return { id: 'charge-1' };
        },
        audit: async () => {},
      },
    };
    return { deps, calls, inserted };
  }

  const body = { quote_id: QUOTE_ID, method: 'boleto', customer: { cpf_cnpj: VALID_CNPJ } };

  it('is a Pro feature', async () => {
    const res = await read(await chargesCreate(post('charges-create', body), chargesDeps({ plan: 'free' }).deps));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('pro_required');
  });

  it('charges an accepted quote in the subaccount without split', async () => {
    const { deps, calls, inserted } = chargesDeps();
    const res = await read(await chargesCreate(post('charges-create', body), deps));
    expect(res.status).toBe(201);
    expect(calls.every(c => c.headers.access_token === 'sub-key')).toBe(true);
    expect(calls[0].body).toMatchObject({ name: 'Dona Maria', cpfCnpj: VALID_CNPJ, mobilePhone: '11987654321' });
    expect(calls[1].body).toMatchObject({ value: 2500.5, billingType: 'BOLETO', externalReference: `quote:${QUOTE_ID}` });
    expect((calls[1].body as Record<string, unknown>).split).toBeUndefined();
    expect(inserted[0]).toMatchObject({ quote_id: QUOTE_ID, platform_fee_cents: 0, amount_cents: 250050 });
  });

  it('rejects platform bookings, unaccepted quotes, ambiguous targets and missing subaccounts', async () => {
    const platform = await read(await chargesCreate(post('charges-create', { ...body, quote_id: undefined, booking_id: BOOKING_ID }), chargesDeps().deps));
    expect(platform.body.error.code).toBe('platform_booking');
    const quote = await read(await chargesCreate(post('charges-create', body), chargesDeps({ quoteStatus: 'sent' }).deps));
    expect(quote.body.error.code).toBe('quote_not_accepted');
    const both = await read(await chargesCreate(post('charges-create', { ...body, booking_id: BOOKING_ID }), chargesDeps().deps));
    expect(both.status).toBe(400);
    const noKey = await read(await chargesCreate(post('charges-create', body), chargesDeps({ apiKey: null }).deps));
    expect(noKey.body.error.code).toBe('provider_payment_account_missing');
  });
});

describe('asaas-onboard', () => {
  const TOKEN = 't'.repeat(40);
  const fiscal = {
    name: 'Ana Prestadora', email: 'ana@example.com', cpf_cnpj: VALID_CPF, birth_date: '1990-05-10',
    mobile_phone: '(11) 98765-4321', income_value_cents: 500000, address: 'Rua A', address_number: '10',
    province: 'Pinheiros', postal_code: '05422-000',
  };

  function onboardDeps(over: { existing?: PaymentAccount | null; vaultFails?: boolean; token?: string } = {}) {
    const saved: PaymentAccount[] = [];
    const secrets: Array<[string, string]> = [];
    const { client, calls } = asaasWith({ 'POST /v3/accounts': { body: { id: 'acc_1', walletId: 'wal_1', apiKey: '$aact_sub' } } });
    const deps: OnboardDeps = {
      ...baseDeps,
      asaas: client,
      webhookUrl: 'https://proj.supabase.co/functions/v1/asaas-webhook',
      webhookToken: over.token ?? TOKEN,
      session: async () => ({ user: PROVIDER, getProvider: async () => ({ id: PROVIDER.id, display_name: 'Ana' }) }),
      admin: {
        getPaymentAccount: async () => over.existing ?? null,
        storeSecret: async (name, secret) => {
          if (over.vaultFails) throw new Error('vault down');
          secrets.push([name, secret]);
          return 'secret-uuid';
        },
        savePaymentAccount: async row => void saved.push(row),
        audit: async () => {},
      },
    };
    return { deps, calls, saved, secrets };
  }

  it('creates the subaccount, registers the webhook and keeps the key out of the response', async () => {
    const { deps, calls, saved, secrets } = onboardDeps();
    const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
    expect(res.status).toBe(201);
    expect(calls[0].body).toMatchObject({
      cpfCnpj: VALID_CPF, birthDate: '1990-05-10', mobilePhone: '11987654321', incomeValue: 5000, postalCode: '05422000',
    });
    const webhook = (calls[0].body as { webhooks: Array<Record<string, unknown>> }).webhooks[0];
    expect(webhook).toMatchObject({ url: 'https://proj.supabase.co/functions/v1/asaas-webhook', authToken: TOKEN, enabled: true });
    expect(secrets).toEqual([[`asaas_subaccount_${PROVIDER.id}`, '$aact_sub']]);
    expect(saved[0]).toEqual({
      provider_id: PROVIDER.id, asaas_account_id: 'acc_1', asaas_wallet_id: 'wal_1', api_key_secret_id: 'secret-uuid', status: 'active',
    });
    expect(JSON.stringify(res.body)).not.toContain('$aact_sub');
    expect(res.body.data).toMatchObject({ wallet_id: 'wal_1', webhook_registered: true, own_charges_enabled: true });
  });

  it('skips the webhook when the token is too short for Asaas', async () => {
    const { deps, calls } = onboardDeps({ token: 'short' });
    await onboard(post('asaas-onboard', fiscal), deps);
    expect((calls[0].body as Record<string, unknown>).webhooks).toBeUndefined();
  });

  it('still records the account when the Vault write fails', async () => {
    const { deps, saved } = onboardDeps({ vaultFails: true });
    const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
    expect(res.status).toBe(201);
    expect(saved[0]).toMatchObject({ api_key_secret_id: null, status: 'key_not_stored' });
    expect(res.body.data.own_charges_enabled).toBe(false);
  });

  it('requires birth date for CPF, company type for CNPJ, and refuses a second onboarding', async () => {
    const noBirth = await read(await onboard(post('asaas-onboard', { ...fiscal, birth_date: undefined }), onboardDeps().deps));
    expect(noBirth.body.error.details).toEqual(['birth_date: obrigatório para CPF']);
    const noType = await read(await onboard(post('asaas-onboard', { ...fiscal, cpf_cnpj: VALID_CNPJ }), onboardDeps().deps));
    expect(noType.body.error.details).toEqual(['company_type: obrigatório para CNPJ']);
    const again = await read(await onboard(post('asaas-onboard', fiscal), onboardDeps({
      existing: { provider_id: PROVIDER.id, asaas_account_id: 'acc_0', asaas_wallet_id: 'wal_0', api_key_secret_id: null, status: 'active' },
    }).deps));
    expect(again.body.error.code).toBe('already_onboarded');
  });
});

describe('subscriptions-manage', () => {
  function subsDeps(current: SubscriptionRow | null) {
    const saved: SubscriptionRow[] = [];
    const plans: string[] = [];
    const { client, calls } = asaasWith({
      'POST /v3/subscriptions': { body: { id: 'sub_1', status: 'ACTIVE', nextDueDate: '2026-10-19' } },
      'GET /v3/subscriptions/sub_1/payments': { body: { data: [{ id: 'pay_s1', invoiceUrl: 'https://sandbox.asaas.com/i/s1' }] } },
      'DELETE /v3/subscriptions/sub_1': { body: { deleted: true, id: 'sub_1' } },
    });
    const deps: SubscriptionsDeps = {
      ...baseDeps,
      asaas: client,
      session: async () => ({ user: PROVIDER, getProvider: async () => ({ id: PROVIDER.id, plan: 'free' }) }),
      admin: {
        getSubscription: async () => current,
        saveSubscription: async row => void saved.push(row),
        setProviderPlan: async (_id, plan) => void plans.push(plan),
        getProPriceCents: async () => 4900,
        getCustomerId: async () => 'cus_p',
        saveCustomerId: async () => {},
        getProfile: async () => ({ full_name: 'Ana', phone: null }),
        audit: async () => {},
      },
    };
    return { deps, calls, saved, plans };
  }

  it('subscribes monthly and waits for the first payment before switching Pro on', async () => {
    const { deps, calls, saved, plans } = subsDeps(null);
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'subscribe', method: 'pix' }), deps));
    expect(res.status).toBe(201);
    expect(calls[0].body).toEqual({
      customer: 'cus_p', billingType: 'PIX', value: 49, nextDueDate: '2026-10-19', cycle: 'MONTHLY',
      description: 'WorkEasy Pro (mensal)', externalReference: `subscription:${PROVIDER.id}`,
    });
    expect(saved[0]).toMatchObject({ status: 'past_due', asaas_subscription_id: 'sub_1' });
    expect(plans).toEqual([]);
    expect(res.body.data).toMatchObject({ awaiting_payment: true, invoice_url: 'https://sandbox.asaas.com/i/s1', plan: 'free' });
  });

  it('refuses a second subscription and cancels keeping the paid period', async () => {
    const active: SubscriptionRow = {
      provider_id: PROVIDER.id, plan: 'pro', status: 'active', asaas_subscription_id: 'sub_1',
      current_period_end: '2026-11-10T23:59:59-03:00', canceled_at: null,
    };
    const twice = await read(await subscriptions(post('subscriptions-manage', { action: 'subscribe' }), subsDeps(active).deps));
    expect(twice.body.error.code).toBe('already_subscribed');

    const { deps, calls, saved, plans } = subsDeps(active);
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'cancel' }), deps));
    expect(res.status).toBe(200);
    expect(calls[0].method).toBe('DELETE');
    expect(saved[0]).toMatchObject({ status: 'canceled', canceled_at: '2026-10-19T15:00:00.000Z' });
    expect(plans).toEqual(['pro']);
    expect(res.body.data).toEqual({ status: 'canceled', plan: 'pro', pro_until: '2026-11-10T23:59:59-03:00' });
  });

  it('has nothing to cancel without a subscription', async () => {
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'cancel' }), subsDeps(null).deps));
    expect(res.body.error.code).toBe('no_subscription');
  });
});
