import { describe, expect, it } from 'vitest';
import { AsaasClient, ASAAS_SANDBOX_URL } from '../../supabase/functions/_shared/asaas-client.ts';
import { checkoutHandler, webhookHandler, type Intent, type Observation, type SandboxDeps } from '../../supabase/functions/ride-sandbox-checkout/handler.ts';

const leg = '918e2baa-9584-4067-a82b-f2132115ee89';
const reference = 'we-ride-sandbox:' + leg;
const token = 'isolated-fixture-token-for-webhook';
const request = (body: unknown, secret?: string) => new Request('https://fixture.local', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(secret ? { 'asaas-access-token': secret } : {}) }, body: JSON.stringify(body),
});
const charge = { id: 'pay_example', status: 'PENDING', value: 18.72, billingType: 'PIX', customer: 'cus_example',
  externalReference: reference, dueDate: '2026-11-27', invoiceUrl: 'https://sandbox.asaas.com/i/example' };

function fixture(fetch: (path: string, method: string, body: unknown) => unknown | Promise<unknown>) {
  const seen: Observation[] = [];
  const intent: Intent = { create: true, leg_id: leg, payment_id: null, amount_cents: 1872, customer: 'cus_example' };
  const deps: SandboxDeps = {
    api: new AsaasClient({ apiKey: 'fixture', baseUrl: ASAAS_SANDBOX_URL, fetch: async (url, options) => {
      const parsed = new URL(url);
      expect(parsed.origin).toBe('https://api-sandbox.asaas.com');
      const data = await fetch(parsed.pathname + parsed.search, options?.method ?? 'GET', options?.body ? JSON.parse(String(options.body)) : undefined);
      return Response.json(data);
    } }),
    token, now: () => new Date('2026-11-27T14:00Z'), session: async () => 'test-user',
    claimSend: async () => true,
    prepare: async () => ({ ...intent }), find: async () => intent,
    observe: async (_leg, data) => { seen.push(data); return { state: data.status }; },
  };
  return { deps, intent, seen };
}

describe('Asaas de homologação de corridas', () => {
  it('falha fechado sem credencial e autentica o pagador antes de gravar ou chamar o PSP', async () => {
    const { deps } = fixture(() => { throw new Error('PSP inesperado'); });
    deps.api = null;
    deps.prepare = async () => { throw new Error('gravação inesperada'); };
    expect((await checkoutHandler(request({ leg_id: leg }), deps)).status).toBe(503);
    deps.session = async () => null;
    expect((await checkoutHandler(request({ leg_id: leg }), deps)).status).toBe(401);
  });

  it('preço vem do trecho, apenas um POST é enviado e uma resposta perdida é recuperada por referência', async () => {
    let attempts = 0;
    let visible = false;
    const { deps, intent, seen } = fixture((path, method, body) => {
      if (method === 'POST') {
        attempts++;
        expect(path).toBe('/v3/payments');
        expect(body).toMatchObject({ value: 18.72, customer: 'cus_example', billingType: 'PIX', externalReference: reference });
        throw new Error('resposta perdida');
      }
      expect(path).toBe('/v3/payments?externalReference=' + encodeURIComponent(reference) + '&limit=2');
      return { data: visible ? [charge] : [], totalCount: visible ? 1 : 0, hasMore: false };
    });
    expect((await checkoutHandler(request({ leg_id: leg, amount: 1 }), deps)).status).toBe(409);
    intent.create = false;
    expect((await checkoutHandler(request({ leg_id: leg }), deps)).status).toBe(409);
    visible = true;
    expect((await checkoutHandler(request({ leg_id: leg }), deps)).status).toBe(200);
    expect(attempts).toBe(1);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ status: 'pending', amount: 1872, invoice: charge.invoiceUrl });
  });

  it('reentrega consulta o estado canônico do PSP e envia o mesmo fato financeiro ao livro transacional', async () => {
    let received = 0;
    const { deps, seen } = fixture((path, method) => {
      expect(method).toBe('GET');
      expect(path).toBe('/v3/payments/pay_example');
      received++;
      return { ...charge, status: 'RECEIVED', refunds: [{ status: 'DONE', value: 2.50 }, { status: 'PENDING', value: 3 }] };
    });
    const event = { id: 'evt_old', event: 'PAYMENT_DELETED', payment: { id: charge.id, value: 0.01 } };
    expect((await webhookHandler(request(event, 'invalid'), deps)).status).toBe(401);
    expect(received).toBe(0);
    for (let i = 0; i < 2; i++) expect((await webhookHandler(request(event, token), deps)).status).toBe(200);
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[0]).toMatchObject({ status: 'paid', amount: 1872, refunded: 250 });
  });

  it('não contabiliza retorno com valor alterado, cliente divergente ou duas cobranças na mesma referência', async () => {
    for (const data of [[{ ...charge, value: 18.32 }], [{ ...charge, customer: 'cus_other' }], [charge, charge]]) {
      const { deps, seen } = fixture(() => ({ data, totalCount: data.length, hasMore: false }));
      expect((await checkoutHandler(request({ leg_id: leg }), deps)).status).toBe(409);
      expect(seen).toHaveLength(0);
    }
  });
});
