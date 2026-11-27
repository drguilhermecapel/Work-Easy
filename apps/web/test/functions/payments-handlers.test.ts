// @vitest-environment node
import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DbError, type AuditEntry } from '../../supabase/functions/_shared/handler-kit.ts';
import { handler as onboard, type OnboardDeps, type PaymentAccount } from '../../supabase/functions/asaas-onboard/handler.ts';
import {
  type ChargesCreateDeps, handler as chargesCreate, type OpenCharge,
} from '../../supabase/functions/charges-create/handler.ts';
import {
  type BookingForPayment, handler as paymentsCreate, type NewPayment, type PaymentRecord, type PaymentsCreateDeps,
} from '../../supabase/functions/payments-create/handler.ts';
import {
  handler as subscriptions, type SubscriptionRow, type SubscriptionsDeps,
} from '../../supabase/functions/subscriptions-manage/handler.ts';
import type { ProviderApproval } from '../../supabase/functions/_shared/provider-approval.ts';

type ProviderAccount = ProviderApproval & { id: string; plan: string };
import { deriveSubaccountToken } from '../../supabase/functions/_shared/secrets.ts';
import { asaasWith, baseDeps, BOOKING_ID, post, PROVIDER, QUOTE_ID, read, USER, VALID_CNPJ, VALID_CPF } from './helpers.ts';

/** An account the admin approved, with an approved occupation (the money tools need both). */
const APPROVED: ProviderAccount = {
  id: PROVIDER.id,
  plan: 'free',
  status: 'approved',
  occupations: [
    { occupation_slug: 'diarista', approved: true, registry_status: 'not_required' },
    { occupation_slug: 'eletricista', approved: true, registry_status: 'not_required' },
  ],
};

/** Platform token of the tests: the key of the CPF fingerprints and of the subaccount tokens. */
const PLATFORM_SECRET = 'platform-token-0123456789abcdef0123456789';
/** The fingerprint Edge Functions store for a CPF/CNPJ, written out with node:crypto to check the WebCrypto code. */
const fingerprintOf = (digits: string, key = PLATFORM_SECRET) =>
  createHmac('sha256', key).update(`document-fingerprint:${digits}`).digest('hex');

const CLIENT_ID = '55555555-5555-4555-8555-555555555555';
const OTHER_CLIENT_ID = '66666666-6666-4666-8666-666666666666';
/** The provider's CRM record for the payer: the only source of the payer's data for own charges. */
const CRM_CLIENT: {
  provider_id: string; name: string; phone: string | null; email: string | null; cpf_cnpj: string | null; client_id: string | null;
} = {
  provider_id: PROVIDER.id, name: 'Dona Maria', phone: '11987654321', email: 'maria@example.com', cpf_cnpj: VALID_CNPJ,
  client_id: null,
};

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
  /** markPaymentCanceled rejects with this (the open charge was canceled in Asaas, its row not updated) */
  markCanceledError?: Error;
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
      markPaymentCanceled: async id => {
        if (over.markCanceledError) throw over.markCanceledError;
        canceled.push(id);
      },
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
      description: 'WorkEasy: atendimento', externalReference: `booking:${BOOKING_ID}`,
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

  it('keeps the occupation out of the charge description the processor and the payer see', async () => {
    for (const slug of ['eletricista', 'diarista']) {
      const { deps, calls } = paymentsDeps({ booking: { ...BOOKING, occupation_slug: slug }, customerId: 'cus_9' });
      const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), deps));
      expect(res.status).toBe(201);
      const { description } = calls.find(c => c.url.endsWith('/payments'))!.body as { description: string };
      expect(description).toBe('WorkEasy: atendimento');
      expect(description).not.toContain(slug);
    }
  });

  const recurring = { ...BOOKING, service_fee_policy_version: 'r1', service_fee_offered: true, price_cents: 300009, platform_fee_cents: 30000 };

  it('sends the exact uncapped provider payout from the accepted recurring contract, including odd centavos', async () => {
    const { deps, calls, inserted } = paymentsDeps({ booking: recurring, customerId: 'cus_9', routes: {
      'POST /v3/payments/simulate': { body: { value: 3000.09, creditCard: { netValue: 2900.11 } } },
      'POST /v3/payments': { body: { ...ASAAS_PAYMENT, billingType: 'CREDIT_CARD', value: 3000.09, netValue: 2900.11 } },
    } });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'credit_card' }), deps));
    expect(res.status).toBe(201);
    expect(calls[0].body).toEqual({ value: 3000.09, billingTypes: ['CREDIT_CARD'] });
    expect(calls[1].body).toMatchObject({
      value: 3000.09, split: [{ walletId: 'wal_provider', fixedValue: 2700.09, externalReference: `booking:${BOOKING_ID}` }],
    });
    expect((calls[1].body as {split: object[]}).split[0]).not.toHaveProperty('percentualValue');
    expect(inserted[0]).toMatchObject({ amount_cents: 300009, platform_fee_cents: 30000, service_split_review_required: false });
  });

  it('refuses an inconsistent recurring fee snapshot instead of falling back to a percentage split', async () => {
    const { deps, calls } = paymentsDeps({ booking: { ...recurring, platform_fee_cents: 29999 } });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), deps));
    expect(res.body.error.code).toBe('service_split_review');
    expect(calls).toHaveLength(0);
  });

  it('keeps a zero rounded commission exact on a 9-cent eligible service', async () => {
    const { deps, calls, inserted } = paymentsDeps({ booking: { ...recurring, price_cents: 9, platform_fee_cents: 0 },
      routes: { 'POST /v3/payments/simulate': { body: { value: 0.09, pix: { netValue: 0.08 } } } } });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), deps));
    expect(res.body.error.code).toBe('service_split_unavailable');
    expect(calls).toHaveLength(1);
    expect(inserted).toHaveLength(0);
  });

  it.each([
    ['pix', { value: 10, pix: { netValue: 8.99 } }],
    ['boleto', { value: 10, bankSlip: {} }],
    ['credit_card', { value: 100, creditCard: { netValue: 98 } }],
  ] as const)('rejects %s before issuing any charge when the simulation cannot cover the promised fixed payout', async (method, simulation) => {
    const { deps, calls, inserted } = paymentsDeps({ booking: { ...recurring, price_cents: 1000, platform_fee_cents: 100 },
      routes: { 'POST /v3/payments/simulate': { body: simulation } } });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method }), deps));
    expect(res.body.error.code).toBe('service_split_unavailable');
    expect(calls).toHaveLength(1);
    expect(inserted).toHaveLength(0);
  });

  it('keeps the PSP reference but hides the invoice and blocks any new payment when the actual net falls below the simulation', async () => {
    const { deps, inserted, calls } = paymentsDeps({ booking: recurring, customerId: 'cus_9', routes: {
      'POST /v3/payments/simulate': { body: { value: 3000.09, pix: { netValue: 2900.11 } } },
      'POST /v3/payments': { body: { ...ASAAS_PAYMENT, value: 3000.09, netValue: 2700.08 } },
    } });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'pix' }), deps));
    expect(res.body.error.code).toBe('service_split_review');
    expect(calls).toHaveLength(2);
    expect(inserted[0]).toMatchObject({ asaas_payment_id: 'pay_1', invoice_url: null, pix_payload: null, service_split_review_required: true });
    const retry = paymentsDeps({ booking: recurring, open: { ...inserted[0], id: 'payment-row-1' } });
    const repeated = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'boleto' }), retry.deps));
    expect(repeated.body.error.code).toBe('service_split_review');
    expect(retry.calls).toHaveLength(0);
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
    // Changed with the no-delete rule: Asaas is asked about the open charge, the new charge is created,
    // and only then the open one is canceled (it used to be deleted before the new charge existed)
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual([
      'GET /v3/payments/pay_0', 'POST /v3/payments', 'DELETE /v3/payments/pay_0',
    ]);
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
    // Asaas shows the open charge as pending when the request starts, and as received after it refuses the cancel
    let reads = 0;
    const { deps, calls, canceled, inserted } = paymentsDeps({
      open: OPEN,
      customerId: 'cus_1',
      routes: {
        'GET /v3/payments/pay_0': () => ({ body: { ...ASAAS_PAYMENT, id: 'pay_0', status: reads++ === 0 ? 'PENDING' : 'RECEIVED' } }),
        'POST /v3/payments': { body: ASAAS_PAYMENT },
        'DELETE /v3/payments/pay_0': { status: 400, body: { errors: [{ code: 'invalid_action', description: 'Não é possível remover esta cobrança.' }] } },
        'DELETE /v3/payments/pay_1': { body: { deleted: true, id: 'pay_1' } },
      },
    });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'boleto' }), deps));
    // changed from 200 (the paid charge was returned as reused): the request is refused and the new charge removed
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('already_paid');
    expect(canceled).toEqual([]);
    expect(inserted).toEqual([]);
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toContain('DELETE /v3/payments/pay_1');
  });

  it('refuses to replace an open charge that Asaas already shows as paid, before creating the new one', async () => {
    const { deps, calls, canceled, inserted } = paymentsDeps({
      open: OPEN,
      customerId: 'cus_1',
      routes: { 'GET /v3/payments/pay_0': { body: { ...ASAAS_PAYMENT, id: 'pay_0', status: 'CONFIRMED' } } },
    });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'boleto' }), deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('already_paid');
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /v3/payments/pay_0']);
    expect(canceled).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it('keeps the open charge pending and removes the new one when the cancel fails for another reason (502)', async () => {
    const { deps, calls, canceled, inserted, errors: logged } = paymentsDeps({
      open: OPEN,
      customerId: 'cus_1',
      routes: {
        'POST /v3/payments': { body: ASAAS_PAYMENT },
        'DELETE /v3/payments/pay_0': { status: 500, body: { errors: [{ code: 'internal', description: 'Falha no Asaas.' }] } },
        'DELETE /v3/payments/pay_1': { body: { deleted: true, id: 'pay_1' } },
      },
    });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'boleto' }), deps));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('payment_replace_failed');
    expect(canceled).toEqual([]);
    expect(inserted).toEqual([]);
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toContain('DELETE /v3/payments/pay_1');
    expect(logged.length).toBeGreaterThan(0);
  });

  it('replaces the open charge when Asaas no longer has it (404): it is marked canceled here too', async () => {
    const { deps, canceled, inserted } = paymentsDeps({
      open: OPEN,
      customerId: 'cus_1',
      routes: {
        'POST /v3/payments': { body: ASAAS_PAYMENT },
        'DELETE /v3/payments/pay_0': { status: 404, body: { errors: [] } },
      },
    });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'boleto' }), deps));
    expect(res.status).toBe(201);
    expect(canceled).toEqual(['p0']);
    expect(inserted).toHaveLength(1);
  });

  it('removes the new charge when the open one cannot be marked canceled after Asaas canceled it', async () => {
    const { deps, calls, inserted } = paymentsDeps({
      open: OPEN,
      customerId: 'cus_1',
      markCanceledError: new DbError('connection reset', '08006'),
    });
    const res = await read(await paymentsCreate(post('payments-create', { booking_id: BOOKING_ID, method: 'boleto' }), deps));
    expect(res.status).toBe(500);
    const sent = calls.map(c => `${c.method} ${new URL(c.url).pathname}`);
    expect(sent).toContain('DELETE /v3/payments/pay_0');
    expect(sent).toContain('DELETE /v3/payments/pay_1');
    expect(inserted).toEqual([]);
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
  function chargesDeps(over: {
    migratedOccupations?: string[]; fullyMigrated?: boolean;
    plan?: string; quoteStatus?: string; apiKey?: string | null; open?: OpenCharge | null; paid?: boolean;
    provider?: ProviderAccount;
    /** CRM client linked to the quote (null: none) */
    quoteClient?: string | null;
    /** the CRM record the provider's client id resolves to (null: not found) */
    client?: typeof CRM_CLIENT | null;
    /** Asaas routes that replace or add to the defaults */
    routes?: Parameters<typeof asaasWith>[0];
  } = {}) {
    const inserted: NewPayment[] = [];
    const canceled: string[] = [];
    const { client, calls } = asaasWith({
      'POST /v3/customers': { body: { id: 'cus_sub', name: 'Cliente' } },
      'POST /v3/payments': { body: { ...ASAAS_PAYMENT, id: 'pay_sub', billingType: 'BOLETO' } },
      'DELETE /v3/payments/pay_0': { body: { deleted: true, id: 'pay_0' } },
      ...over.routes,
    });
    const deps: ChargesCreateDeps = {
      ...baseDeps,
      asaas: client,
      session: async () => ({
        user: PROVIDER,
        getProvider: async () => ({ ...(over.provider ?? APPROVED), plan: over.plan ?? 'pro', migratedOccupations: over.migratedOccupations, fullyMigrated: over.fullyMigrated }),
        getBooking: async () => ({
          id: BOOKING_ID, provider_id: PROVIDER.id, client_id: null, provider_client_id: null,
          occupation_slug: 'diarista', status: 'accepted', origin: 'platform', price_cents: 1000,
        }),
        getQuote: async () => ({
          id: QUOTE_ID, provider_id: PROVIDER.id, provider_client_id: over.quoteClient === undefined ? CLIENT_ID : over.quoteClient,
          title: 'Pintura', total_cents: 250050, status: over.quoteStatus ?? 'accepted',
        }),
        getProviderClient: async () => (over.client === undefined ? CRM_CLIENT : over.client),
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

  const body = { quote_id: QUOTE_ID, method: 'boleto', provider_client_id: CLIENT_ID };
  it('allows an own quote with no service commission after the Pro subscription ends on an exclusively migrated account', async () => {
    const { deps, inserted } = chargesDeps({ plan: 'free', migratedOccupations: ['eletricista'], fullyMigrated: true });
    const res = await read(await chargesCreate(post('charges-create', body), deps));
    expect(res.status).toBe(201);
    expect(inserted[0].platform_fee_cents).toBe(0);
  });

  it('preserves the legacy gate on an unscoped own quote of a mixed account', async () => {
    const { deps } = chargesDeps({ plan: 'free', migratedOccupations: ['eletricista'], fullyMigrated: false });
    const res = await read(await chargesCreate(post('charges-create', body), deps));
    expect(res.body.error.code).toBe('pro_required');
  });

  /** The Asaas customer of an open charge, created for CLIENT_ID (the reference charges-create gives it). */
  const CUSTOMER_OF_CLIENT = {
    'GET /v3/customers/cus_0': { body: { id: 'cus_0', name: 'Dona Maria', externalReference: `provider_client:${CLIENT_ID}` } },
    'GET /v3/payments/pay_0': { body: { id: 'pay_0', status: 'PENDING' } },
  };

  /** An own booking (the provider's own client) on top of the approved provider. */
  function ownBooking(over: {
    provider?: ProviderAccount; clientId?: string | null; occupation?: string; open?: OpenCharge;
    routes?: Parameters<typeof asaasWith>[0];
  } = {}) {
    const made = chargesDeps({ provider: over.provider, open: over.open, routes: over.routes });
    const session = made.deps.session;
    made.deps.session = async req => ({
      ...(await session(req))!,
      getBooking: async () => ({
        id: BOOKING_ID, provider_id: PROVIDER.id, client_id: null, provider_client_id: over.clientId === undefined ? CLIENT_ID : over.clientId,
        occupation_slug: over.occupation ?? 'diarista', status: 'completed', origin: 'own', price_cents: 1000,
      }),
    });
    return made;
  }

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
    expect(calls[0].body).toMatchObject({
      name: 'Dona Maria', cpfCnpj: VALID_CNPJ, mobilePhone: '11987654321', email: 'maria@example.com',
      externalReference: `provider_client:${CLIENT_ID}`,
      // The provider's CRM client gets no Asaas notice: the platform sends its own.
      notificationDisabled: true,
    });
    expect(calls[1].body).toMatchObject({ value: 2500.5, billingType: 'BOLETO', externalReference: `quote:${QUOTE_ID}` });
    expect((calls[1].body as Record<string, unknown>).split).toBeUndefined();
    expect(inserted[0]).toMatchObject({ quote_id: QUOTE_ID, platform_fee_cents: 0, amount_cents: 250050 });
  });

  it('describes a quote charge and an own booking charge without the quote title or the service category', async () => {
    const quote = chargesDeps();
    const quoted = await read(await chargesCreate(post('charges-create', body), quote.deps));
    expect(quoted.status).toBe(201);
    const quoteDescription = (quote.calls.find(c => c.url.endsWith('/payments'))!.body as { description: string }).description;
    expect(quoteDescription).toBe('WorkEasy: orçamento');
    expect(quoteDescription).not.toContain('Pintura');

    const own = ownBooking({ occupation: 'diarista' });
    const owned = await read(await chargesCreate(post('charges-create', { booking_id: BOOKING_ID, method: 'pix' }), own.deps));
    expect(owned.status).toBe(201);
    const ownDescription = (own.calls.find(c => c.url.endsWith('/payments'))!.body as { description: string }).description;
    expect(ownDescription).toBe('WorkEasy: atendimento');
    expect(ownDescription).not.toContain('diarista');
  });

  it('reuses an open charge of the same method and replaces it (in the subaccount) when the method changes', async () => {
    const open: PaymentRecord = {
      id: 'p0', asaas_payment_id: 'pay_0', method: 'boleto', status: 'pending', amount_cents: 250050,
      invoice_url: 'u', pix_qr_code: null, pix_payload: null, due_date: '2026-10-25',
    };
    const same = chargesDeps({ open: { ...open, asaas_customer_id: 'cus_0' }, routes: CUSTOMER_OF_CLIENT });
    const reused = await read(await chargesCreate(post('charges-create', body), same.deps));
    expect(reused.status).toBe(200);
    expect(reused.body.data).toMatchObject({ payment_id: 'p0', reused: true });
    // Only the payer of the open charge is read: nothing is created or canceled
    expect(same.calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /v3/customers/cus_0']);
    expect(same.calls[0].headers.access_token).toBe('sub-key');

    const other = chargesDeps({ open });
    const res = await read(await chargesCreate(post('charges-create', { ...body, method: 'pix' }), other.deps));
    expect(res.status).toBe(201);
    // Changed with the no-delete rule: the new charge is created first, then the open one is canceled
    const cancel = other.calls.at(-1)!;
    expect(cancel).toMatchObject({ method: 'DELETE' });
    expect(cancel.headers.access_token).toBe('sub-key');
    expect(other.canceled).toEqual(['p0']);
  });

  describe('an open charge of a booking or quote with no linked client (the provider picks the payer)', () => {
    const open: OpenCharge = {
      id: 'p0', asaas_payment_id: 'pay_0', method: 'boleto', status: 'pending', amount_cents: 1000,
      invoice_url: 'u', pix_qr_code: null, pix_payload: null, due_date: '2026-10-25', asaas_customer_id: 'cus_0',
    };
    const pick = (clientId: string) => ({ booking_id: BOOKING_ID, method: 'boleto', provider_client_id: clientId });
    const unlinked = (over: { open?: OpenCharge; routes?: Parameters<typeof asaasWith>[0] } = {}) => {
      const made = ownBooking({ clientId: null, open: over.open ?? open, routes: { ...CUSTOMER_OF_CLIENT, ...over.routes } });
      return made;
    };
    const paths = (calls: Array<{ method: string; url: string }>) => calls.map(c => `${c.method} ${new URL(c.url).pathname}`);

    it('reuses it when the same client is picked again', async () => {
      const made = unlinked();
      const res = await read(await chargesCreate(post('charges-create', pick(CLIENT_ID)), made.deps));
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ payment_id: 'p0', reused: true });
      expect(paths(made.calls)).toEqual(['GET /v3/customers/cus_0']);
      expect(made.inserted).toEqual([]);
      expect(made.canceled).toEqual([]);
    });

    it('replaces it with a charge to the newly picked client (never returns the first client\'s charge)', async () => {
      const made = unlinked();
      const res = await read(await chargesCreate(post('charges-create', pick(OTHER_CLIENT_ID)), made.deps));
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({ reused: false });
      expect(res.body.data.payment_id).not.toBe('p0');
      expect(paths(made.calls)).toEqual([
        'GET /v3/customers/cus_0', 'GET /v3/payments/pay_0', 'POST /v3/customers', 'POST /v3/payments', 'DELETE /v3/payments/pay_0',
      ]);
      expect(made.calls[2].body).toMatchObject({ externalReference: `provider_client:${OTHER_CLIENT_ID}` });
      expect(made.canceled).toEqual(['p0']);
      expect(made.inserted).toHaveLength(1);
    });

    it('refuses (409 already_paid) when the first client already paid it, before creating anything', async () => {
      const made = unlinked({ routes: { 'GET /v3/payments/pay_0': { body: { id: 'pay_0', status: 'RECEIVED' } } } });
      const res = await read(await chargesCreate(post('charges-create', pick(OTHER_CLIENT_ID)), made.deps));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('already_paid');
      expect(paths(made.calls)).toEqual(['GET /v3/customers/cus_0', 'GET /v3/payments/pay_0']);
      expect(made.inserted).toEqual([]);
      expect(made.canceled).toEqual([]);
    });

    it('does not reuse it when its payer cannot be told (no customer stored, or gone in Asaas)', async () => {
      const unknown = unlinked({ open: { ...open, asaas_customer_id: null } });
      const res = await read(await chargesCreate(post('charges-create', pick(CLIENT_ID)), unknown.deps));
      expect(res.status).toBe(201);
      expect(paths(unknown.calls)[0]).toBe('GET /v3/payments/pay_0');
      expect(unknown.canceled).toEqual(['p0']);

      const gone = unlinked({ routes: { 'GET /v3/customers/cus_0': { status: 404, body: { errors: [] } } } });
      const res2 = await read(await chargesCreate(post('charges-create', pick(CLIENT_ID)), gone.deps));
      expect(res2.status).toBe(201);
      expect(gone.canceled).toEqual(['p0']);
    });
  });

  it('refuses to replace a charge that Asaas already shows as paid (409 already_paid), before creating anything', async () => {
    const open: PaymentRecord = {
      id: 'p0', asaas_payment_id: 'pay_0', method: 'pix', status: 'pending', amount_cents: 250050,
      invoice_url: 'u', pix_qr_code: null, pix_payload: null, due_date: '2026-10-25',
    };
    const made = chargesDeps({ open, routes: { 'GET /v3/payments/pay_0': { body: { id: 'pay_0', status: 'RECEIVED' } } } });
    const res = await read(await chargesCreate(post('charges-create', body), made.deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('already_paid');
    expect(made.calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toEqual(['GET /v3/payments/pay_0']);
    expect(made.inserted).toEqual([]);
    expect(made.canceled).toEqual([]);
  });

  it('keeps the open charge pending and removes the new one when the cancel fails (502)', async () => {
    const open: PaymentRecord = {
      id: 'p0', asaas_payment_id: 'pay_0', method: 'pix', status: 'pending', amount_cents: 250050,
      invoice_url: 'u', pix_qr_code: null, pix_payload: null, due_date: '2026-10-25',
    };
    const made = chargesDeps({
      open,
      routes: { 'DELETE /v3/payments/pay_0': { status: 500, body: { errors: [{ code: 'internal', description: 'Falha no Asaas.' }] } } },
    });
    const res = await read(await chargesCreate(post('charges-create', body), made.deps));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('payment_replace_failed');
    expect(made.canceled).toEqual([]);
    expect(made.inserted).toEqual([]);
    expect(made.calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toContain('DELETE /v3/payments/pay_sub');
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

  it('refuses to charge until the admin approves the provider, without calling Asaas', async () => {
    for (const status of ['draft', 'pending_review', 'suspended']) {
      const { deps, calls, inserted } = chargesDeps({ provider: { ...APPROVED, status } });
      const res = await read(await chargesCreate(post('charges-create', body), deps));
      expect(res.status, status).toBe(403);
      expect(res.body.error.code, status).toBe('provider_not_approved');
      expect(calls, status).toEqual([]);
      expect(inserted, status).toEqual([]);
    }
  });

  it('refuses to charge an approved account that has no approved occupation, without calling Asaas', async () => {
    const { deps, calls, inserted } = chargesDeps({ provider: { ...APPROVED, occupations: [] } });
    const res = await read(await chargesCreate(post('charges-create', body), deps));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('provider_not_approved');
    expect(calls).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it('refuses an own booking whose occupation the admin has not approved', async () => {
    const provider = { ...APPROVED, occupations: [{ occupation_slug: 'eletricista', approved: true, registry_status: 'not_required' }] };
    const { deps, calls } = ownBooking({ provider, occupation: 'diarista' });
    const res = await read(await chargesCreate(post('charges-create', { booking_id: BOOKING_ID, method: 'pix' }), deps));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('provider_not_approved');
    expect(calls).toEqual([]);
  });

  it('does not accept a customer block in the body: the payer comes from the CRM record only', async () => {
    const { deps, calls, inserted } = chargesDeps();
    const res = await read(await chargesCreate(post('charges-create', { ...body, customer: { cpf_cnpj: VALID_CPF, email: 'x@example.com' } }), deps));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('invalid_input');
    expect(calls).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it('refuses a quote with no CRM client: the provider has to choose one of its clients', async () => {
    const { deps, calls } = chargesDeps({ quoteClient: null });
    const res = await read(await chargesCreate(post('charges-create', { quote_id: QUOTE_ID, method: 'boleto' }), deps));
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('refuses a CRM client without a billing document, before calling Asaas', async () => {
    const { deps, calls } = chargesDeps({ client: { ...CRM_CLIENT, cpf_cnpj: null } });
    const res = await read(await chargesCreate(post('charges-create', body), deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('customer_document_missing');
    expect(calls).toEqual([]);
  });

  it('refuses a CRM client record that belongs to another provider', async () => {
    const { deps, calls } = chargesDeps({ client: { ...CRM_CLIENT, provider_id: USER.id } });
    const res = await read(await chargesCreate(post('charges-create', body), deps));
    expect(res.status).toBe(404);
    expect(calls).toEqual([]);
  });

  it('refuses a provider_client_id that differs from the client linked to the quote', async () => {
    const { deps, calls } = chargesDeps();
    const res = await read(await chargesCreate(post('charges-create', { ...body, provider_client_id: OTHER_CLIENT_ID }), deps));
    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('uses the body provider_client_id only when the own booking has no linked client', async () => {
    const { deps, calls } = ownBooking({ clientId: null });
    const res = await read(await chargesCreate(post('charges-create', {
      booking_id: BOOKING_ID, method: 'pix', provider_client_id: CLIENT_ID,
    }), deps));
    expect(res.status).toBe(201);
    expect(calls[0].body).toMatchObject({ cpfCnpj: VALID_CNPJ, externalReference: `provider_client:${CLIENT_ID}` });
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
    /** how many writes of the account row fail before one works (Infinity: all of them) */
    saveFailures?: number;
    token?: string;
    busy?: boolean;
    noKey?: boolean;
    asaasFails?: boolean;
    provider?: ProviderAccount;
    claim?: boolean | 'resumed';
    /** extra Asaas routes (GET /v3/accounts, POST .../accessTokens) */
    routes?: Parameters<typeof asaasWith>[0];
    linkedToOther?: boolean;
  } = {}) {
    const saved: PaymentAccount[] = [];
    const secrets: Array<[string, string]> = [];
    const released: string[] = [];
    const sleeps: number[] = [];
    let vaultCalls = 0;
    let saveCalls = 0;
    const audits: Array<{ action: string; data?: Record<string, unknown> }> = [];
    const { client, calls } = asaasWith({
      'POST /v3/accounts': over.asaasFails
        ? { status: 400, body: { errors: [{ code: 'invalid_cpfCnpj', description: 'CPF já cadastrado.' }] } }
        : { body: { id: 'acc_1', walletId: 'wal_1', ...(over.noKey ? {} : { apiKey: '$aact_sub' }) } },
      ...over.routes,
    });
    const deps: OnboardDeps = {
      ...baseDeps,
      asaas: client,
      webhookUrl: 'https://proj.supabase.co/functions/v1/asaas-webhook',
      webhookToken: over.token ?? TOKEN,
      trialDocumentSecret: over.token ?? TOKEN,
      sleep: async ms => void sleeps.push(ms),
      session: async () => ({ user: PROVIDER, getProvider: async () => over.provider ?? APPROVED }),
      admin: {
        getPaymentAccount: async () => over.existing ?? null,
        claimOnboarding: async () => (over.busy ? false : over.claim ?? true),
        accountLinkedToOther: async () => over.linkedToOther === true,
        releaseOnboarding: async id => void released.push(id),
        storeSecret: async (providerId, secret) => {
          if (vaultCalls++ < (over.vaultFailures ?? 0)) throw new Error('vault down');
          secrets.push([providerId, secret]);
          return 'secret-uuid';
        },
        savePaymentAccount: async row => {
          if (saveCalls++ < (over.saveFailures ?? 0)) throw new Error('database down');
          saved.push(row);
        },
        audit: async entry => void audits.push(entry),
      },
    };
    return { deps, calls, saved, secrets, released, sleeps, audits, vaultCalls: () => vaultCalls };
  }

  it('tries again when the account row cannot be written right after Asaas created the account', async () => {
    const { deps, saved, calls } = onboardDeps({ saveFailures: 2 });
    const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
    expect(res.status).toBe(201);
    expect(saved).toHaveLength(1);
    // one account in Asaas, however many writes it took here
    expect(calls.filter(call => call.method === 'POST')).toHaveLength(1);
  });

  it('leaves a trail with the Asaas ids when the account row is never written', async () => {
    const { deps, saved, audits, released } = onboardDeps({ saveFailures: Infinity });
    const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
    expect(res.status).toBe(500);
    expect(saved).toEqual([]);
    const orphan = audits.find(entry => entry.action === 'payment_account.orphan');
    expect(orphan?.data).toMatchObject({ asaas_account_id: 'acc_1', asaas_wallet_id: 'wal_1', key_stored: true });
    // the claim is not released: releasing it would let the next attempt create a second account
    expect(released).toEqual([]);
  });

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
      cpf_hash: fingerprintOf(VALID_CPF, TOKEN),
    });
    expect(JSON.stringify(res.body)).not.toContain('$aact_sub');
    expect(res.body.data).toMatchObject({ wallet_id: 'wal_1', webhook_registered: true, own_charges_enabled: true });
  });

  it('stores the keyed fingerprint of the validated CPF, never the CPF, and no fingerprint without the platform token', async () => {
    const { deps, saved } = onboardDeps();
    await onboard(post('asaas-onboard', fiscal), deps);
    expect(saved[0].cpf_hash).toBe(fingerprintOf(VALID_CPF, TOKEN));
    expect(JSON.stringify(saved[0])).not.toContain(VALID_CPF);

    const unkeyed = onboardDeps();
    await onboard(post('asaas-onboard', fiscal), { ...unkeyed.deps, trialDocumentSecret: undefined });
    expect(unkeyed.saved[0].cpf_hash).toBeNull();
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

  it('refuses the receiving account before the admin approves the provider, without calling Asaas', async () => {
    for (const status of ['draft', 'pending_review', 'suspended']) {
      const { deps, calls, saved } = onboardDeps({ provider: { ...APPROVED, status } });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.status, status).toBe(403);
      expect(res.body.error.code, status).toBe('provider_not_approved');
      expect(calls, status).toEqual([]);
      expect(saved, status).toEqual([]);
    }
  });

  it('refuses the receiving account to an approved account that has no approved occupation', async () => {
    const { deps, calls, saved } = onboardDeps({ provider: { ...APPROVED, occupations: [] } });
    const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('provider_not_approved');
    expect(calls).toEqual([]);
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

  describe('recovering an interrupted activation', () => {
    const FOUND = { id: 'acc_9', walletId: 'wal_9', cpfCnpj: '529.982.247-25', name: 'Ana' };
    const list = (data: unknown[]) => ({ 'GET /v3/accounts': { body: { object: 'list', hasMore: false, data } } });
    const token = { 'POST /v3/accounts/acc_9/accessTokens': { body: { id: 'tok_1', apiKey: '$aact_new_key' } } };
    const paths = (calls: Array<{ method: string; url: string }>) => calls.map(c => `${c.method} ${new URL(c.url).pathname}`);

    it('a fresh claim creates as before and does not search', async () => {
      const { deps, calls } = onboardDeps({ claim: true, routes: list([FOUND]) });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.status).toBe(201);
      expect(res.body.data.recovered).toBeUndefined();
      expect(paths(calls)).toEqual(['POST /v3/accounts']);
    });

    it('a resumed claim with no account in Asaas creates it', async () => {
      const { deps, calls, saved } = onboardDeps({ claim: 'resumed', routes: list([]) });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.status).toBe(201);
      expect(res.body.data.recovered).toBeUndefined();
      expect(paths(calls)).toEqual(['GET /v3/accounts', 'POST /v3/accounts']);
      expect(new URL(calls[0].url).searchParams.get('cpfCnpj')).toBe(VALID_CPF);
      expect(calls[0].headers.access_token).toBe('root-key');
      expect(saved[0]).toMatchObject({ asaas_account_id: 'acc_1', status: 'active' });
    });

    it('a resumed claim with one account does not create: it issues a new key and saves the row', async () => {
      const { deps, calls, saved, secrets, audits } = onboardDeps({ claim: 'resumed', routes: { ...list([FOUND]), ...token } });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.status).toBe(201);
      expect(paths(calls)).toEqual(['GET /v3/accounts', 'POST /v3/accounts/acc_9/accessTokens']);
      expect(calls[1].body).toEqual({ name: 'WorkEasy' });
      expect(calls[1].headers.access_token).toBe('root-key');
      expect(secrets).toEqual([[PROVIDER.id, '$aact_new_key']]);
      expect(saved[0]).toMatchObject({
        provider_id: PROVIDER.id, asaas_account_id: 'acc_9', asaas_wallet_id: 'wal_9', api_key_secret_id: 'secret-uuid', status: 'active',
      });
      expect(res.body.data).toMatchObject({ recovered: true, wallet_id: 'wal_9', own_charges_enabled: true, webhook_registered: false });
      expect(audits.map(a => a.action)).toEqual(['payment_account.recovered']);
      expect(JSON.stringify([res.body, audits])).not.toContain('$aact_new_key');
    });

    it('keeps the account without a key when Asaas refuses to issue one (panel or IP not set up)', async () => {
      const refused = { 'POST /v3/accounts/acc_9/accessTokens': { status: 403, body: { errors: [{ code: 'access_denied', description: 'Acesso negado. Code: abc' }] } } };
      const { deps, saved, secrets, audits } = onboardDeps({ claim: 'resumed', routes: { ...list([FOUND]), ...refused } });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.status).toBe(201);
      expect(secrets).toEqual([]);
      expect(saved[0]).toMatchObject({ asaas_account_id: 'acc_9', asaas_wallet_id: 'wal_9', api_key_secret_id: null, status: 'key_not_returned' });
      expect(res.body.data).toMatchObject({ recovered: true, own_charges_enabled: false });
      expect(res.body.data.message).toContain('suporte');
      expect(audits.map(a => a.action)).toEqual(['payment_account.recovered_without_key']);
    });

    it('answers 409 onboarding_ambiguous and creates nothing when two accounts match', async () => {
      const { deps, calls, saved, released, audits } = onboardDeps({
        claim: 'resumed', routes: list([FOUND, { ...FOUND, id: 'acc_10', walletId: 'wal_10' }]),
      });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('onboarding_ambiguous');
      expect(paths(calls)).toEqual(['GET /v3/accounts']);
      expect(saved).toEqual([]);
      expect(released).toEqual([]); // the claim stays: a blind retry would create another account
      expect(audits.map(a => a.action)).toEqual(['payment_account.onboarding_ambiguous']);
    });

    it('ignores items whose cpfCnpj or walletId do not match the request', async () => {
      const other = { id: 'acc_7', walletId: 'wal_7', cpfCnpj: '11222333000181' };
      const noWallet = { id: 'acc_8', cpfCnpj: VALID_CPF };
      const { deps, calls, saved } = onboardDeps({ claim: 'resumed', routes: list([other, noWallet]) });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.status).toBe(201);
      expect(paths(calls)).toEqual(['GET /v3/accounts', 'POST /v3/accounts']);
      expect(saved[0]).toMatchObject({ asaas_account_id: 'acc_1' });
    });

    it('does not create when the lookup itself fails, and keeps the claim', async () => {
      const { deps, calls, released } = onboardDeps({
        claim: 'resumed', routes: { 'GET /v3/accounts': { status: 500, body: {} } },
      });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.status).toBe(502);
      expect(paths(calls)).toEqual(['GET /v3/accounts']);
      expect(released).toEqual([]);
    });

    it('refuses to hand over an account that already belongs to another provider', async () => {
      const { deps, saved, calls } = onboardDeps({ claim: 'resumed', linkedToOther: true, routes: { ...list([FOUND]), ...token } });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.body.error.code).toBe('onboarding_ambiguous');
      expect(saved).toEqual([]);
      expect(paths(calls)).toEqual(['GET /v3/accounts']);
    });

    it('after a 400 from createAccount, one lookup finds the account and recovers it', async () => {
      const { deps, calls, saved, released } = onboardDeps({ asaasFails: true, routes: { ...list([FOUND]), ...token } });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.status).toBe(201);
      expect(res.body.data.recovered).toBe(true);
      expect(paths(calls)).toEqual(['POST /v3/accounts', 'GET /v3/accounts', 'POST /v3/accounts/acc_9/accessTokens']);
      expect(saved[0]).toMatchObject({ asaas_account_id: 'acc_9', status: 'active' });
      expect(released).toEqual([]);
    });

    it('after a 400 with no account found, releases the claim and shows the Asaas message', async () => {
      const { deps, released, saved } = onboardDeps({ asaasFails: true, routes: list([]) });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.status).toBe(502);
      expect(res.body.error.message).toContain('CPF já cadastrado');
      expect(released).toEqual([PROVIDER.id]);
      expect(saved).toEqual([]);
    });

    it('does not search after a non-400 failure of createAccount', async () => {
      const { deps, calls } = onboardDeps({ routes: { 'POST /v3/accounts': { status: 500, body: {} }, ...list([FOUND]) } });
      const res = await read(await onboard(post('asaas-onboard', fiscal), deps));
      expect(res.status).toBe(502);
      expect(paths(calls)).toEqual(['POST /v3/accounts']);
    });
  });
});

describe('subscriptions-manage', () => {
  function subsDeps(
    current: SubscriptionRow | null,
    routes: Record<string, { status?: number; body: unknown }> = {},
    claim = true,
    trialDays = 0,
    provider: ProviderAccount = APPROVED,
    // onboarded: the Asaas receiving account is finished; trials: the trial claims already stored (keyed
    // fingerprints, or the SHA-256 of earlier claims); accountHash: the account's CPF fingerprint (null: the
    // account predates it; default: the fingerprint of VALID_CPF); secret: the platform secret (null: none)
    options: { onboarded?: boolean; trials?: string[]; accountHash?: string | null; secret?: string | null } = {},
  ) {
    const saved: SubscriptionRow[] = [];
    const plans: string[] = [];
    const trials = options.trials ?? [];
    const { client, calls } = asaasWith({
      'POST /v3/subscriptions': { body: { id: 'sub_1', status: 'ACTIVE', nextDueDate: '2026-10-19' } },
      'GET /v3/subscriptions/sub_1/payments': { body: { data: [{ id: 'pay_s1', invoiceUrl: 'https://sandbox.asaas.com/i/s1' }] } },
      'DELETE /v3/subscriptions/sub_1': { body: { deleted: true, id: 'sub_1' } },
      ...routes,
    });
    const accountHash = options.accountHash === undefined ? fingerprintOf(VALID_CPF) : options.accountHash;
    const deps: SubscriptionsDeps = {
      ...baseDeps,
      asaas: client,
      documentSecret: options.secret === undefined ? PLATFORM_SECRET : (options.secret ?? undefined),
      session: async () => ({ user: PROVIDER, getProvider: async () => provider }),
      admin: {
        proSalesAllowed: async () => true,
        getSubscription: async () => current,
        saveSubscription: async row => void saved.push(row),
        claimSubscription: async row => {
          if (claim) saved.push(row);
          return claim;
        },
        setProviderPlan: async (_id, plan) => void plans.push(plan),
        isPaymentOnboardingComplete: async () => options.onboarded ?? true,
        getPaymentCpfHash: async () => accountHash,
        claimTrial: async (hash, _providerId, legacyHash) => {
          if (trials.includes(hash) || trials.includes(legacyHash)) return false;
          trials.push(hash);
          return true;
        },
        releaseTrial: async hash => {
          const at = trials.indexOf(hash);
          if (at >= 0) trials.splice(at, 1);
        },
        getProPriceCents: async () => 4900,
        getTrialDays: async () => trialDays,
        getCustomerId: async () => 'cus_p',
        saveCustomerId: async () => {},
        getProfile: async () => ({ full_name: 'Ana', phone: null }),
        audit: async () => {},
      },
    };
    return { deps, calls, saved, plans, trials };
  }

  it('does not start the subscription or the free trial before the admin approves the provider', async () => {
    for (const status of ['draft', 'pending_review', 'suspended']) {
      const { deps, calls, saved, plans } = subsDeps(null, {}, true, 30, { ...APPROVED, status });
      const res = await read(await subscriptions(post('subscriptions-manage', { action: 'subscribe', method: 'pix' }), deps));
      expect(res.status, status).toBe(403);
      expect(res.body.error.code, status).toBe('provider_not_approved');
      expect(calls, status).toEqual([]);
      expect(saved, status).toEqual([]);
      expect(plans, status).toEqual([]);
    }
  });

  it('does not start the subscription or the free trial for an approved account with no approved occupation', async () => {
    const { deps, calls, saved, plans } = subsDeps(null, {}, true, 30, { ...APPROVED, occupations: [] });
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'subscribe', method: 'pix' }), deps));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('provider_not_approved');
    expect(calls).toEqual([]);
    expect(saved).toEqual([]);
    expect(plans).toEqual([]);
  });

  it('lets a suspended provider cancel a subscription that is still billing', async () => {
    const current: SubscriptionRow = {
      provider_id: PROVIDER.id, plan: 'pro', status: 'active', asaas_subscription_id: 'sub_1',
      current_period_end: '2026-11-19T23:59:59-03:00', canceled_at: null,
    };
    const { deps, calls } = subsDeps(current, {}, true, 0, { ...APPROVED, status: 'suspended' });
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'cancel' }), deps));
    expect(res.status).toBe(200);
    expect(calls.map(call => call.method)).toEqual(['DELETE']);
  });

  it('declines new recurring Pro billing on commission-only accounts before calling Asaas', async () => {
    const { deps, calls, saved } = subsDeps(null);
    deps.admin.proSalesAllowed = async () => false;
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'subscribe', method: 'pix' }), deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('service_commission_only');
    expect(calls).toEqual([]);
    expect(saved).toEqual([]);
  });

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

  it('gives a provider that never subscribed the trial: Pro now, first charge when it ends', async () => {
    const { deps, calls, saved, plans } = subsDeps(null, {}, true, 30);
    // The trial also needs the provider's CPF (its onboarding is finished in the fixture)
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'subscribe', method: 'pix', cpf_cnpj: VALID_CPF }), deps));
    expect(res.status).toBe(201);
    // 2026-10-19 + 30 days; the Asaas subscription starts charging only then
    expect((calls[0].body as { nextDueDate: string }).nextDueDate).toBe('2026-11-18');
    expect(saved[0]).toMatchObject({ status: 'trialing', asaas_subscription_id: 'sub_1', current_period_end: '2026-11-18T23:59:59-03:00' });
    expect(plans).toEqual(['pro']);
    expect(res.body.data).toMatchObject({
      status: 'trialing', plan: 'pro', awaiting_payment: false, trial_ends_at: '2026-11-18T23:59:59-03:00',
    });
  });

  it('gives the trial once: subscribing again after a cancellation waits for the payment', async () => {
    const canceled: SubscriptionRow = {
      provider_id: PROVIDER.id, plan: 'pro', status: 'canceled', asaas_subscription_id: 'sub_old',
      current_period_end: '2026-10-01T23:59:59-03:00', canceled_at: '2026-10-02T12:00:00.000Z',
    };
    const { deps, calls, saved, plans } = subsDeps(canceled, {}, true, 30);
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'subscribe', method: 'pix' }), deps));
    expect(res.status).toBe(201);
    expect((calls[0].body as { nextDueDate: string }).nextDueDate).toBe('2026-10-19');
    expect(saved[0]).toMatchObject({ status: 'pending' });
    expect(plans).toEqual([]);
    expect(res.body.data).toMatchObject({ awaiting_payment: true, plan: 'free', trial_ends_at: null });
  });

  it('keeps Pro until the end of the trial when the provider cancels during it', async () => {
    const trialing: SubscriptionRow = {
      provider_id: PROVIDER.id, plan: 'pro', status: 'trialing', asaas_subscription_id: 'sub_1',
      current_period_end: '2026-11-18T23:59:59-03:00', canceled_at: null,
    };
    const { deps, saved, plans } = subsDeps(trialing);
    const res = await read(await subscriptions(post('subscriptions-manage', { action: 'cancel' }), deps));
    expect(res.body.data).toEqual({ status: 'canceled', plan: 'pro', pro_until: '2026-11-18T23:59:59-03:00' });
    expect(saved[0]).toMatchObject({ status: 'canceled' });
    expect(plans).toEqual(['pro']);
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

  // ---- free trial: finished Asaas receiving account, one trial per CPF ----
  const SUBSCRIBE = { action: 'subscribe', method: 'pix' };
  // the unkeyed SHA-256 that claims made before the keyed fingerprint stored
  const trialSha = (cpf: string) => createHash('sha256').update(cpf).digest('hex');
  // a valid CPF that is not VALID_CPF
  const OTHER_CPF = '11144477735';

  it('refuses the free trial until the Asaas receiving account is finished, without calling Asaas', async () => {
    const { deps, calls, saved, trials } = subsDeps(null, {}, true, 30, APPROVED, { onboarded: false });
    const res = await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: VALID_CPF }), deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('trial_requires_payment_account');
    expect(calls).toEqual([]);
    expect(saved).toEqual([]);
    expect(trials).toEqual([]);
  });

  it('asks for the provider CPF before starting the free trial, and not for a CNPJ', async () => {
    for (const body of [SUBSCRIBE, { ...SUBSCRIBE, cpf_cnpj: VALID_CNPJ }]) {
      const { deps, calls, trials } = subsDeps(null, {}, true, 30);
      const res = await read(await subscriptions(post('subscriptions-manage', body), deps));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(calls).toEqual([]);
      expect(trials).toEqual([]);
    }
  });

  it('starts the free trial for a CPF that never had one, and keeps only the hash of its digits', async () => {
    const { deps, saved, trials } = subsDeps(null, {}, true, 30);
    const res = await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: '529.982.247-25' }), deps));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'trialing', plan: 'pro' });
    expect(saved[0]).toMatchObject({ status: 'trialing' });
    expect(trials).toEqual([fingerprintOf(VALID_CPF)]);
    expect(JSON.stringify(trials)).not.toContain(VALID_CPF);
  });

  it('refuses a CPF that already had a free trial (409 trial_already_used), without calling Asaas', async () => {
    const trials: string[] = [];
    const first = subsDeps(null, {}, true, 30, APPROVED, { trials });
    expect((await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: VALID_CPF }), first.deps))).status).toBe(201);

    // a new account (no subscription row) with the same CPF
    const again = subsDeps(null, {}, true, 30, APPROVED, { trials });
    const res = await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: VALID_CPF }), again.deps));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'trial_already_used', message: 'Este CPF já usou o teste grátis.' });
    expect(again.calls).toEqual([]);
    expect(trials).toHaveLength(1);
  });

  it('claims the trial under the keyed fingerprint, which the unkeyed SHA-256 of the CPF does not match', async () => {
    const { deps, trials } = subsDeps(null, {}, true, 30);
    expect((await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: VALID_CPF }), deps))).status).toBe(201);
    expect(trials).toEqual([fingerprintOf(VALID_CPF)]);
    expect(trials).not.toContain(trialSha(VALID_CPF));
  });

  it('refuses a CPF that is not the one of the receiving account (409 trial_document_mismatch), and claims nothing', async () => {
    // the account was validated by Asaas with another CPF
    const { deps, calls, saved, trials } = subsDeps(null, {}, true, 30, APPROVED, { accountHash: fingerprintOf(OTHER_CPF) });
    const res = await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: VALID_CPF }), deps));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'trial_document_mismatch', message: 'Para o teste grátis, informe o CPF do seu cadastro de recebimento.',
    });
    expect(calls).toEqual([]);
    expect(saved).toEqual([]);
    expect(trials).toEqual([]);
  });

  it('refuses a receiving account created before the CPF binding (no fingerprint), without calling Asaas', async () => {
    const { deps, calls, trials } = subsDeps(null, {}, true, 30, APPROVED, { accountHash: null });
    const res = await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: VALID_CPF }), deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('trial_requires_payment_account');
    expect(res.body.error.message).toContain('suporte');
    expect(calls).toEqual([]);
    expect(trials).toEqual([]);
  });

  it('refuses the trial when the platform secret is missing (503 trial_unavailable), without calling Asaas', async () => {
    const { deps, calls, trials } = subsDeps(null, {}, true, 30, APPROVED, { secret: null });
    const res = await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: VALID_CPF }), deps));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('trial_unavailable');
    expect(calls).toEqual([]);
    expect(trials).toEqual([]);
  });

  it('refuses a CPF that an earlier claim stored as unkeyed SHA-256 (409 trial_already_used), without calling Asaas', async () => {
    const trials = [trialSha(VALID_CPF)];
    const { deps, calls } = subsDeps(null, {}, true, 30, APPROVED, { trials });
    const res = await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: VALID_CPF }), deps));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'trial_already_used', message: 'Este CPF já usou o teste grátis.' });
    expect(calls).toEqual([]);
    expect(trials).toEqual([trialSha(VALID_CPF)]);
  });

  it('gives the trial claim back when the Asaas subscription cannot be created', async () => {
    const { deps, trials } = subsDeps(
      null,
      { 'POST /v3/subscriptions': { status: 400, body: { errors: [{ code: 'invalid_value', description: 'Valor inválido.' }] } } },
      true,
      30,
    );
    const res = await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: VALID_CPF }), deps));
    expect(res.status).toBe(502);
    expect(trials).toEqual([]);
  });

  it('gives the trial claim back when the subscription is not saved, so the next try can still start the trial', async () => {
    const trials: string[] = [];
    const lost = subsDeps(null, {}, false, 30, APPROVED, { trials });
    const res = await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: VALID_CPF }), lost.deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('already_subscribed');
    expect(lost.calls.map(c => `${c.method} ${new URL(c.url).pathname}`)).toContain('DELETE /v3/subscriptions/sub_1');
    expect(trials).toEqual([]);

    const retry = subsDeps(null, {}, true, 30, APPROVED, { trials });
    expect((await read(await subscriptions(post('subscriptions-manage', { ...SUBSCRIBE, cpf_cnpj: VALID_CPF }), retry.deps))).status).toBe(201);
    expect(trials).toEqual([fingerprintOf(VALID_CPF)]);
  });
});
