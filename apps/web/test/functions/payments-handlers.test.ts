// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DbError, type AuditEntry } from '../../supabase/functions/_shared/handler-kit.ts';
import { handler as onboard, type OnboardDeps, type PaymentAccount } from '../../supabase/functions/asaas-onboard/handler.ts';
import { type ChargesCreateDeps, handler as chargesCreate } from '../../supabase/functions/charges-create/handler.ts';
import {
  type BookingForPayment, handler as paymentsCreate, type NewPayment, type PaymentRecord, type PaymentsCreateDeps,
} from '../../supabase/functions/payments-create/handler.ts';
import {
  handler as subscriptions, type SubscriptionRow, type SubscriptionsDeps,
} from '../../supabase/functions/subscriptions-manage/handler.ts';
import { deriveSubaccountToken } from '../../supabase/functions/_shared/secrets.ts';
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
  /** insertPayment rejects with this (e.g. the unique violation of a concurrent charge) */
  insertError?: Error;
  /** findOpenPayment answers: first call, then the following ones */
  openAfter?: PaymentRecord | null;
  auditFails?: boolean;
  /** the booking already has a received/confirmed payment */
  paid?: boolean;
} = {}) {
  const inserted: NewPayment[] = [];
  const audits: AuditEntry[] = [];
  const canceled: string[] = [];
  const errors: unknown[] = [];
  let lookups = 0;
  const savedCustomers: string[] = [];
  const { client, calls } = asaasWith(over.routes ?? {
    'POST /v3/customers': { body: { id: 'cus_1', name: 'Ana' } },
    'POST /v3/payments': { body: ASAAS_PAYMENT },
    'GET /v3/payments/pay_1/pixQrCode': { body: { encodedImage: 'iVBOR', payload: '000201pix', expirationDate: '2026-10-21 00:00:00' } },
    'DELETE /v3/payments/pay_1': { body: { deleted: true, id: 'pay_1' } },
    'DELETE /v3/payments/pay_0': { body: { deleted: true, id: 'pay_0' } },
  });
  const deps: PaymentsCreateDeps = {
    ...baseDeps,
    logError: error => void errors.push(error),
    asaas: over.noAsaas ? null : client,
    session: async () =>
      over.noSession ? null : { user: USER, getBooking: async () => (over.booking === undefined ? BOOKING : over.booking) },
    admin: {
      hasPaidPayment: async () => over.paid === true,
      findOpenPayment: async () => (lookups++ === 0 ? over.open ?? null : over.openAfter ?? null),
      getProviderWallet: async () => (over.wallet === undefined ? 'wal_provider' : over.wallet),
      getCustomerId: async () => over.customerId ?? null,
      saveCustomerId: async (_u, id) => void savedCustomers.push(id),
      getProfile: async () => ({ full_name: 'Ana Cliente', phone: '11987654321' }),
      insertPayment: async row => {
        if (over.insertError) throw over.insertError;
        inserted.push(row);
        return { id: 'payment-row-1' };
      },
      markPaymentCanceled: async id => void canceled.push(id),
      audit: async entry => {
        if (over.auditFails) throw new Error('audit_log unavailable');
        audits.push(entry);
      },
    },
  };
  return { deps, calls, inserted, audits, savedCustomers, canceled, errors };
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

  it('splits amount minus fee as a percentage of the net value when there is a platform fee', async () => {
    const { deps, calls } = paymentsDeps({ booking: { ...BOOKING, price_cents: 9999, platform_fee_cents: 1199 }, customerId: 'cus_9' });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'credit_card' }), deps));
    expect(res.status).toBe(201);
    const body = calls.find(c => c.url.endsWith('/payments'))!.body as { value: number; billingType: string; split: unknown[] };
    expect(body.value).toBe(99.99);
    expect(body.billingType).toBe('CREDIT_CARD');
    expect(body.split).toEqual([{ walletId: 'wal_provider', percentualValue: 88.0088, externalReference: `booking:${BOOKING_ID}` }]);
    expect(calls.some(c => c.url.includes('pixQrCode'))).toBe(false);
  });

  it('does not ask a fixed value the net value cannot cover when the commission is below the Asaas fee', async () => {
    const { deps, calls } = paymentsDeps({ booking: { ...BOOKING, price_cents: 1000, platform_fee_cents: 120 }, customerId: 'cus_9' });
    await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), deps);
    const split = (calls.find(c => c.url.endsWith('/payments'))!.body as { split: Array<Record<string, unknown>> }).split[0];
    expect(split.percentualValue).toBe(88);
    expect(split.fixedValue).toBeUndefined();
  });

  const OPEN: PaymentRecord = {
    id: 'p0', asaas_payment_id: 'pay_0', method: 'pix', status: 'pending', amount_cents: 15000,
    invoice_url: 'u', pix_qr_code: 'img', pix_payload: 'code', due_date: '2026-10-20',
  };

  it('reuses a pending payment of the same method instead of charging twice', async () => {
    const { deps, calls } = paymentsDeps({ open: OPEN });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ payment_id: 'p0', reused: true });
    expect(calls).toHaveLength(0);
  });

  it('replaces the pending charge when the client asks for another method', async () => {
    const { deps, calls, canceled } = paymentsDeps({ open: OPEN, customerId: 'cus_1' });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'boleto' }), deps));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ reused: false });
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['DELETE /v3/payments/pay_0', 'POST /v3/payments']);
    expect(canceled).toEqual(['p0']);
  });

  it('replaces a pending charge that is already past its due date', async () => {
    const { deps, canceled } = paymentsDeps({ open: { ...OPEN, due_date: '2026-10-18' }, customerId: 'cus_1' });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), deps));
    expect(res.status).toBe(201);
    expect(canceled).toEqual(['p0']);
    // due today is still valid
    const today = paymentsDeps({ open: { ...OPEN, due_date: '2026-10-19' } });
    expect((await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), today.deps))).body.data.reused).toBe(true);
  });

  it('keeps the old charge when Asaas will not remove it (paid, webhook pending)', async () => {
    const { deps, canceled } = paymentsDeps({
      open: OPEN,
      customerId: 'cus_1',
      routes: { 'DELETE /v3/payments/pay_0': { status: 400, body: { errors: [{ code: 'invalid_action', description: 'Não é possível remover esta cobrança.' }] } } },
    });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'boleto' }), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ payment_id: 'p0', reused: true });
    expect(canceled).toEqual([]);
  });

  it('under concurrency, the request that loses the insert removes its Asaas charge and returns the winner', async () => {
    const winner: PaymentRecord = { ...OPEN, id: 'winner', asaas_payment_id: 'pay_w' };
    const { deps, calls, inserted } = paymentsDeps({
      customerId: 'cus_1', insertError: new DbError('duplicate key value violates unique constraint', '23505'), openAfter: winner,
    });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ payment_id: 'winner', reused: true });
    expect(inserted).toEqual([]);
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toContain('DELETE /v3/payments/pay_1');
  });

  it('removes the Asaas charge when the database insert fails, so no charge is left without a row', async () => {
    const { deps, calls } = paymentsDeps({ customerId: 'cus_1', insertError: new DbError('connection reset', '08006') });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), deps));
    expect(res.status).toBe(500);
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toContain('DELETE /v3/payments/pay_1');
  });

  it('does not fail (or retry the charge) when only the audit entry fails after the charge was saved', async () => {
    const { deps, inserted, errors } = paymentsDeps({ customerId: 'cus_1', auditFails: true });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), deps));
    expect(res.status).toBe(201);
    expect(inserted).toHaveLength(1);
    expect(errors).toHaveLength(1);
  });

  it('refuses to charge a booking that already has a received payment (409 already_paid), without calling Asaas', async () => {
    const { deps, calls, inserted } = paymentsDeps({ paid: true });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix', cpf_cnpj: VALID_CPF }), deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('already_paid');
    expect(calls).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it('stores the Asaas payment without card data', async () => {
    const card = { creditCardToken: 'tok', creditCardBrand: 'VISA' };
    const { deps, inserted } = paymentsDeps({
      customerId: 'cus_1',
      routes: { 'POST /v3/payments': { body: { ...ASAAS_PAYMENT, creditCard: card } } },
    });
    await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'credit_card' }), deps);
    expect(JSON.stringify(inserted[0].raw)).not.toMatch(/creditCard|tok/);
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
  function chargesDeps(over: { plan?: string; quoteStatus?: string; apiKey?: string | null; open?: PaymentRecord | null; paid?: boolean } = {}) {
    const inserted: NewPayment[] = [];
    const canceled: string[] = [];
    const { client, calls } = asaasWith({
      'POST /v3/customers': { body: { id: 'cus_sub', name: 'Cliente' } },
      'POST /v3/payments': { body: { ...ASAAS_PAYMENT, id: 'pay_sub', billingType: 'BOLETO' } },
      'DELETE /v3/payments/pay_0': { body: { deleted: true, id: 'pay_0' } },
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
        hasPaidCharge: async () => over.paid === true,
        findOpenCharge: async () => over.open ?? null,
        insertPayment: async row => {
          inserted.push(row);
          return { id: 'charge-1' };
        },
        markPaymentCanceled: async id => void canceled.push(id),
        audit: async () => {},
      },
    };
    return { deps, calls, inserted, canceled };
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

  it('reuses an open charge of the same method and replaces it (in the subaccount) when the method changes', async () => {
    const open: PaymentRecord = {
      id: 'p0', asaas_payment_id: 'pay_0', method: 'boleto', status: 'pending', amount_cents: 250050,
      invoice_url: 'u', pix_qr_code: null, pix_payload: null, due_date: '2026-10-25',
    };
    const same = chargesDeps({ open });
    const reused = await read(await chargesCreate(post('charges-create', body), same.deps));
    expect(reused.status).toBe(200);
    expect(reused.body.data).toMatchObject({ payment_id: 'p0', reused: true });
    expect(same.calls).toHaveLength(0);

    const other = chargesDeps({ open });
    const res = await read(await chargesCreate(post('charges-create', { ...body, method: 'pix' }), other.deps));
    expect(res.status).toBe(201);
    expect(other.calls[0]).toMatchObject({ method: 'DELETE' });
    expect(other.calls[0].headers.access_token).toBe('sub-key');
    expect(other.canceled).toEqual(['p0']);
  });

  it('refuses to charge a quote or a booking that already has a received payment (409 already_paid)', async () => {
    const quote = chargesDeps({ paid: true });
    const res = await read(await chargesCreate(post('charges-create', body), quote.deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('already_paid');
    expect(quote.calls).toEqual([]);
    expect(quote.inserted).toEqual([]);
    // the same guard on the booking target, asked with the target the function received
    const targets: unknown[] = [];
    const booking = chargesDeps({ paid: true });
    const original = booking.deps.admin.hasPaidCharge;
    booking.deps.admin.hasPaidCharge = async target => (targets.push(target), original(target));
    const ownSession = await booking.deps.session(post('charges-create', {}));
    booking.deps.session = async () => ({
      ...ownSession!,
      getBooking: async () => ({
        id: BOOKING_ID, provider_id: PROVIDER.id, client_id: null, provider_client_id: null,
        occupation_slug: 'diarista', status: 'completed', origin: 'own', price_cents: 1000,
      }),
    });
    const own = await read(await chargesCreate(post('charges-create', { ...body, quote_id: undefined, booking_id: BOOKING_ID }), booking.deps));
    expect(own.body.error.code).toBe('already_paid');
    expect(targets).toEqual([{ bookingId: BOOKING_ID }]);
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
  const TOKEN = 'platform-token-0123456789abcdef0123456789';
  const fiscal = {
    name: 'Ana Prestadora', email: 'ana@example.com', cpf_cnpj: VALID_CPF, birth_date: '1990-05-10',
    mobile_phone: '(11) 98765-4321', income_value_cents: 500000, address: 'Rua A', address_number: '10',
    province: 'Pinheiros', postal_code: '05422-000',
  };

  function onboardDeps(over: {
    existing?: PaymentAccount | null;
    /** how many Vault writes fail before one works (Infinity: all of them) */
    vaultFailures?: number;
    token?: string;
    busy?: boolean;
    noKey?: boolean;
    asaasFails?: boolean;
  } = {}) {
    const saved: PaymentAccount[] = [];
    const secrets: Array<[string, string]> = [];
    const released: string[] = [];
    const sleeps: number[] = [];
    let vaultCalls = 0;
    const { client, calls } = asaasWith({
      'POST /v3/accounts': over.asaasFails
        ? { status: 400, body: { errors: [{ code: 'invalid_cpfCnpj', description: 'CPF já cadastrado.' }] } }
        : { body: { id: 'acc_1', walletId: 'wal_1', ...(over.noKey ? {} : { apiKey: '$aact_sub' }) } },
    });
    const deps: OnboardDeps = {
      ...baseDeps,
      asaas: client,
      webhookUrl: 'https://proj.supabase.co/functions/v1/asaas-webhook',
      webhookToken: over.token ?? TOKEN,
      sleep: async ms => void sleeps.push(ms),
      session: async () => ({ user: PROVIDER, getProvider: async () => ({ id: PROVIDER.id, display_name: 'Ana' }) }),
      admin: {
        getPaymentAccount: async () => over.existing ?? null,
        claimOnboarding: async () => !over.busy,
        releaseOnboarding: async id => void released.push(id),
        storeSecret: async (providerId, secret) => {
          if (vaultCalls++ < (over.vaultFailures ?? 0)) throw new Error('vault down');
          secrets.push([providerId, secret]);
          return 'secret-uuid';
        },
        savePaymentAccount: async row => void saved.push(row),
        audit: async () => {},
      },
    };
    return { deps, calls, saved, secrets, released, sleeps, vaultCalls: () => vaultCalls };
  }

  it('creates the subaccount, registers its own webhook and keeps the key out of the response', async () => {
    const { deps, calls, saved, secrets } = onboardDeps();
    const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
    expect(res.status).toBe(201);
    expect(calls[0].body).toMatchObject({
      cpfCnpj: VALID_CPF, birthDate: '1990-05-10', mobilePhone: '11987654321', incomeValue: 5000, postalCode: '05422000',
    });
    const webhook = (calls[0].body as { webhooks: Array<Record<string, unknown>> }).webhooks[0];
    expect(webhook).toMatchObject({
      url: `https://proj.supabase.co/functions/v1/asaas-webhook?acct=${PROVIDER.id}`, enabled: true,
    });
    // the provider can read this token in their Asaas panel: it must not be the platform token
    expect(webhook.authToken).not.toBe(TOKEN);
    expect(webhook.authToken).toBe(await deriveSubaccountToken(TOKEN, PROVIDER.id));
    expect(JSON.stringify(calls[0].body)).not.toContain(TOKEN);
    expect(secrets).toEqual([[PROVIDER.id, '$aact_sub']]);
    expect(saved[0]).toEqual({
      provider_id: PROVIDER.id, asaas_account_id: 'acc_1', asaas_wallet_id: 'wal_1', api_key_secret_id: 'secret-uuid', status: 'active',
    });
    expect(JSON.stringify(res.body)).not.toContain('$aact_sub');
    expect(res.body.data).toMatchObject({ wallet_id: 'wal_1', webhook_registered: true, own_charges_enabled: true });
  });

  it('skips the webhook when no platform token is configured', async () => {
    const { deps, calls } = onboardDeps();
    await onboard(post('asaas-onboard', fiscal), { ...deps, webhookToken: undefined });
    expect((calls[0].body as Record<string, unknown>).webhooks).toBeUndefined();
  });

  it('retries the Vault write before giving up, since Asaas shows the key only once', async () => {
    const { deps, saved, secrets, sleeps, vaultCalls } = onboardDeps({ vaultFailures: 2 });
    const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
    expect(res.status).toBe(201);
    expect(vaultCalls()).toBe(3);
    expect(sleeps).toHaveLength(2);
    expect(secrets).toEqual([[PROVIDER.id, '$aact_sub']]);
    expect(saved[0]).toMatchObject({ api_key_secret_id: 'secret-uuid', status: 'active' });
  });

  it('still records the account when the Vault keeps failing, and later calls say the key is missing', async () => {
    const { deps, saved, vaultCalls } = onboardDeps({ vaultFailures: Infinity });
    const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
    expect(res.status).toBe(201);
    expect(vaultCalls()).toBe(3);
    expect(saved[0]).toMatchObject({ api_key_secret_id: null, status: 'key_not_stored', asaas_wallet_id: 'wal_1' });
    expect(res.body.data.own_charges_enabled).toBe(false);
    expect(res.body.data.message).toContain('suporte');

    // the next call must not claim the provider is simply "already onboarded"
    const again = await read(await onboard(post('asaas-onboard', fiscal), onboardDeps({ existing: saved[0] }).deps));
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('payment_key_missing');
  });

  it('records key_not_returned when Asaas answers without a key', async () => {
    const { deps, saved } = onboardDeps({ noKey: true });
    await onboard(post('asaas-onboard', fiscal), deps);
    expect(saved[0]).toMatchObject({ api_key_secret_id: null, status: 'key_not_returned' });
  });

  it('serializes simultaneous calls: the second one does not create another subaccount', async () => {
    const { deps, calls } = onboardDeps({ busy: true });
    const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('onboarding_in_progress');
    expect(calls).toEqual([]);
  });

  it('frees the claim when Asaas refuses the account, so the provider can fix the data and retry', async () => {
    const { deps, released, saved } = onboardDeps({ asaasFails: true });
    const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
    expect(res.status).toBe(502);
    expect(released).toEqual([PROVIDER.id]);
    expect(saved).toEqual([]);
  });

  it('requires birth date for CPF, company type for CNPJ, and refuses a second onboarding', async () => {
    const noBirth = await read(await onboard(post('asaas-onboard', { ...fiscal, birth_date: undefined }), onboardDeps().deps));
    expect(noBirth.body.error.details).toEqual(['birth_date: obrigatório para CPF']);
    const noType = await read(await onboard(post('asaas-onboard', { ...fiscal, cpf_cnpj: VALID_CNPJ }), onboardDeps().deps));
    expect(noType.body.error.details).toEqual(['company_type: obrigatório para CNPJ']);
    const again = await read(await onboard(post('asaas-onboard', fiscal), onboardDeps({
      existing: { provider_id: PROVIDER.id, asaas_account_id: 'acc_0', asaas_wallet_id: 'wal_0', api_key_secret_id: 'k', status: 'active' },
    }).deps));
    expect(again.body.error.code).toBe('already_onboarded');
  });
});

describe('subscriptions-manage', () => {
  function subsDeps(current: SubscriptionRow | null, routes: Record<string, { status?: number; body: unknown }> = {}, claim = true) {
    const saved: SubscriptionRow[] = [];
    const plans: string[] = [];
    const { client, calls } = asaasWith({
      'POST /v3/subscriptions': { body: { id: 'sub_1', status: 'ACTIVE', nextDueDate: '2026-10-19' } },
      'GET /v3/subscriptions/sub_1/payments': { body: { data: [{ id: 'pay_s1', invoiceUrl: 'https://sandbox.asaas.com/i/s1' }] } },
      'DELETE /v3/subscriptions/sub_1': { body: { deleted: true, id: 'sub_1' } },
      ...routes,
    });
    const deps: SubscriptionsDeps = {
      ...baseDeps,
      asaas: client,
      session: async () => ({ user: PROVIDER, getProvider: async () => ({ id: PROVIDER.id, plan: 'free' }) }),
      admin: {
        getSubscription: async () => current,
        saveSubscription: async row => void saved.push(row),
        claimSubscription: async row => {
          if (claim) saved.push(row);
          return claim;
        },
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
    expect(saved[0]).toMatchObject({ status: 'pending', asaas_subscription_id: 'sub_1' });
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

  it('subscribing again inside the paid period starts charging when it ends, not today', async () => {
    const canceled: SubscriptionRow = {
      provider_id: PROVIDER.id, plan: 'pro', status: 'canceled', asaas_subscription_id: 'sub_old',
      current_period_end: '2026-11-10T23:59:59-03:00', canceled_at: '2026-10-18T12:00:00.000Z',
    };
    const { deps, calls, saved } = subsDeps(canceled);
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'subscribe', method: 'pix' }), deps));
    expect(res.status).toBe(201);
    expect((calls[0].body as { nextDueDate: string }).nextDueDate).toBe('2026-11-10');
    expect(saved[0]).toMatchObject({ status: 'pending', asaas_subscription_id: 'sub_1', current_period_end: '2026-11-10T23:59:59-03:00' });

    // after the period ended the first charge is due today
    const lapsed = subsDeps({ ...canceled, current_period_end: '2026-10-01T23:59:59-03:00' });
    await subscriptions(post('subscriptions-manage', { action: 'subscribe' }), lapsed.deps);
    expect((lapsed.calls[0].body as { nextDueDate: string }).nextDueDate).toBe('2026-10-19');
  });

  it('removes the Asaas subscription when it could not be saved, so it does not bill without a row', async () => {
    const { deps, calls } = subsDeps(null);
    const failing: SubscriptionsDeps = {
      ...deps,
      admin: { ...deps.admin, claimSubscription: async () => { throw new Error('database unavailable'); } },
    };
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'subscribe' }), failing));
    expect(res.status).toBe(500);
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toContain('DELETE /v3/subscriptions/sub_1');
  });

  it('drops the Asaas subscription it created when a simultaneous request saved first', async () => {
    const { deps, calls, saved } = subsDeps(null, {}, false);
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'subscribe' }), deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('already_subscribed');
    expect(saved).toEqual([]);
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toContain('DELETE /v3/subscriptions/sub_1');
  });

  it('finishes a cancellation locally when Asaas no longer has the subscription', async () => {
    const active: SubscriptionRow = {
      provider_id: PROVIDER.id, plan: 'pro', status: 'active', asaas_subscription_id: 'sub_1',
      current_period_end: '2026-11-10T23:59:59-03:00', canceled_at: null,
    };
    const { deps, saved } = subsDeps(active, { 'DELETE /v3/subscriptions/sub_1': { status: 404, body: { errors: [] } } });
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'cancel' }), deps));
    expect(res.status).toBe(200);
    expect(saved[0]).toMatchObject({ status: 'canceled' });
  });

  it('does not fail a cancellation or a subscription only because the audit entry failed', async () => {
    const active: SubscriptionRow = {
      provider_id: PROVIDER.id, plan: 'pro', status: 'active', asaas_subscription_id: 'sub_1',
      current_period_end: '2026-11-10T23:59:59-03:00', canceled_at: null,
    };
    const { deps } = subsDeps(active);
    const noAudit: SubscriptionsDeps = { ...deps, admin: { ...deps.admin, audit: async () => { throw new Error('audit_log unavailable'); } } };
    expect((await read(await subscriptions(post('subscriptions-manage', { action: 'cancel' }), noAudit))).status).toBe(200);
  });

  it('has nothing to cancel without a subscription', async () => {
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'cancel' }), subsDeps(null).deps));
    expect(res.body.error.code).toBe('no_subscription');
  });
});
