import { describe, expect, it } from 'vitest';
import { AsaasClient, ASAAS_PRODUCTION_URL } from '../../supabase/functions/_shared/asaas-client.ts';
import { liveContract } from '../../supabase/functions/_shared/ride-live-psp.ts';
import { rideCheckout, rideWebhook, type Intent, type Observation, type RidePspDeps } from '../../supabase/functions/_shared/ride-psp.ts';

const leg = 'dea6906f-5e42-4283-9e2d-80aa1931eab2';
const wallet = '48352ca0-13ae-485e-8f6b-0e8b1116dc35';
const token = 'fixture-live-webhook-verification-key';
const customer = 'cus_fixture';
const reference = 'we-ride-live:' + leg;
const piece = { id: 'split_fixture', walletId: wallet, fixedValue: 27, totalValue: 27, status: 'PENDING' };
const charge = { id: 'pay_fixture', customer, externalReference: reference, status: 'PENDING', billingType: 'PIX',
  value: 30, netValue: 29, split: [piece], invoiceUrl: 'https://www.asaas.com/i/fixture' };
const request = (data: unknown, auth?: string) => new Request('https://fixture.test', { method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(auth ? { 'asaas-access-token': auth } : {}) }, body: JSON.stringify(data) });
function fixture(remote: (path: string, method: string, data: unknown) => unknown) {
  const records: Observation[] = [];
  const intent: Intent = { leg_id: leg, customer, wallet, amount_cents: 3000, driver_cents: 2700, extras_cents: 0, payment_id: null, create: true };
  let postsAllowed = true;
  const deps: RidePspDeps = {
    api: new AsaasClient({ apiKey: 'fixture-only', baseUrl: ASAAS_PRODUCTION_URL, fetch: async (input, init) => {
      const target = new URL(input);
      expect(target.origin).toBe('https://api.asaas.com');
      return Response.json(remote(target.pathname + target.search, init?.method ?? 'GET', init?.body ? JSON.parse(String(init.body)) : null));
    } }), now: () => new Date('2026-11-27T15:00Z'), token, session: async () => 'payer',
    prepare: async () => intent, find: async () => intent, claimSend: async () => {
      const allowed = postsAllowed;
      postsAllowed = false;
      return allowed;
    }, observe: async (_, value) => { records.push(value); return { state: value.status }; },
  };
  return { deps, records, intent };
}
describe('checkout real preparado com fixtures de protocolo e sem rede externa', () => {
  it('confere líquido antes de emitir, trava o envio e preserva repasse fixo incluindo adicionais', async () => {
    const calls: string[] = [];
    const { deps, records } = fixture((path, method, data) => {
      calls.push(method + ' ' + path.split('?')[0]);
      if (method === 'GET') return path.endsWith('/pay_fixture') ? charge : { data: [], totalCount: 0, hasMore: false };
      if (path.endsWith('/simulate')) return { value: 30, pix: { netValue: 29 } };
      expect(data).toMatchObject({ customer, externalReference: reference, value: 30, split: [{ walletId: wallet, fixedValue: 27 }] });
      return charge;
    });
    expect((await rideCheckout(request({ leg_id: leg, value: 99, walletId: 'untrusted' }), deps, liveContract)).status).toBe(200);
    expect(calls).toEqual(['GET /v3/payments', 'POST /v3/payments/simulate', 'POST /v3/payments', 'GET /v3/payments/pay_fixture']);
    expect(records[0]).toMatchObject({ status: 'pending', amount: 3000, pspFee: 100, splitCents: 2700, paidToDriver: 0, invoice: charge.invoiceUrl });
  });
  it('recusa emissão com líquido insuficiente e preserva a permissão de único envio', async () => {
    const { deps } = fixture((path, method) => {
      if (method === 'GET') return { data: [], totalCount: 0, hasMore: false };
      expect(path).toBe('/v3/payments/simulate');
      return { value: 30, pix: { netValue: 26.99 } };
    });
    deps.claimSend = async () => { throw new Error('unexpected write'); };
    expect((await rideCheckout(request({ leg_id: leg }), deps, liveContract)).status).toBe(409);
  });
  it('apenas estado canônico com recebedor, split, taxa e liquidação comprovados contabiliza repasse e devoluções', async () => {
    let remote: unknown = { ...charge, status: 'RECEIVED', split: [{ ...piece, status: 'DONE' }] };
    let calls = 0;
    const { deps, records } = fixture((path, method) => {
      expect([method, path]).toEqual(['GET','/v3/payments/pay_fixture']);
      calls++;
      return remote;
    });
    const event = { event: 'PAYMENT_DELETED', payment: { id: charge.id, value: 52 } };
    expect((await rideWebhook(request(event, 'wrong'), deps, liveContract)).status).toBe(401);
    expect(calls).toBe(0);
    async function reconcile() { return await rideWebhook(request(event, token), deps, liveContract); }
    expect((await reconcile()).status).toBe(200);
    expect((await reconcile()).status).toBe(200);
    expect(records[0]).toMatchObject({ status: 'paid', pspFee: 100, paidToDriver: 2700, refunded: 0 });
    expect(records[1]).toEqual(records[0]);
    remote = { ...charge, status: 'CONFIRMED' };
    expect((await reconcile()).status).toBe(200);
    expect(records.at(-1)).toMatchObject({ status: 'settling', paidToDriver: 0, invoice: null });
    remote = { ...charge, status: 'REFUNDED', split: [{ ...piece, status: 'REFUNDED' }], refunds: [{ status: 'DONE', value: 30, refundedSplits: [{ id: piece.id, value: 27, done: true }] }] };
    expect((await reconcile()).status).toBe(200);
    expect(records.at(-1)).toMatchObject({ status: 'paid', refunded: 3000, returnedByDriver: 2700, paidToDriver: 0 });
    remote = { ...charge, split: [{ ...piece, walletId: 'another-wallet' }] };
    expect((await reconcile()).status).toBe(200);
    expect(records.at(-1)).toMatchObject({ status: 'review', reason: 'unverified_split', invoice: null });
  });
  it('reter documentos de cobrança divergentes gera ocorrência e referência de outro ambiente é ignorada', async () => {
    const { deps, records } = fixture(() => ({ ...charge, customer: 'cus_another' }));
    const event = { payment: { id: charge.id } };
    expect((await rideWebhook(request(event, token), deps, liveContract)).status).toBe(200);
    expect(records[0]).toMatchObject({ status: 'review', reason: 'unverified_payment', invoice: null });
    const other = fixture(() => ({ ...charge, externalReference: 'we-ride-sandbox:' + leg }));
    expect((await rideWebhook(request(event, token), other.deps, liveContract)).status).toBe(200);
    expect(other.records).toHaveLength(0);
  });
});
