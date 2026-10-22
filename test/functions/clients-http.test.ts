// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AsaasClient, AsaasError, describeAsaasError } from '../../supabase/functions/_shared/asaas-client.ts';
import { keyFromDictionary, readConfig } from '../../supabase/functions/_shared/config.ts';
import { dbRuleError } from '../../supabase/functions/_shared/handler-kit.ts';
import { allowedOrigins, corsHeaders, errors, HttpError, route } from '../../supabase/functions/_shared/http.ts';
import { asaasWith, fakeFetch } from './helpers.ts';

describe('AsaasClient', () => {
  it('sends access_token, JSON body and parses the response', async () => {
    const { client, calls } = asaasWith({ 'POST /v3/payments': { body: { id: 'pay_1', status: 'PENDING' } } });
    const payment = await client.createPayment({
      customer: 'cus_1', billingType: 'PIX', value: 150.5, dueDate: '2026-10-20',
      split: [{ walletId: 'wal_1', percentualValue: 100 }],
    });
    expect(payment).toEqual({ id: 'pay_1', status: 'PENDING' });
    expect(calls[0].url).toBe('https://api-sandbox.asaas.com/v3/payments');
    expect(calls[0].headers.access_token).toBe('root-key');
    expect(calls[0].headers['Content-Type']).toBe('application/json');
    expect(calls[0].headers['User-Agent']).toMatch(/^WorkEasy/);
    expect(calls[0].body).toMatchObject({ value: 150.5, split: [{ walletId: 'wal_1', percentualValue: 100 }] });
  });

  it('turns Asaas error bodies into AsaasError with the Asaas messages', async () => {
    const { client } = asaasWith({
      'POST /v3/customers': { status: 400, body: { errors: [{ code: 'invalid_cpfCnpj', description: 'CPF inválido.' }] } },
    });
    const error = await client.createCustomer({ name: 'A', cpfCnpj: '1' }).catch(e => e);
    expect(error).toBeInstanceOf(AsaasError);
    expect(error.status).toBe(400);
    expect(error.errors).toEqual([{ code: 'invalid_cpfCnpj', description: 'CPF inválido.' }]);
    expect(describeAsaasError(error)).toBe('O Asaas recusou a operação: CPF inválido.');
  });

  it('handles non-JSON errors', async () => {
    const fetch = async () => new Response('<html>bad gateway</html>', { status: 502 });
    const client = new AsaasClient({ apiKey: 'k', fetch });
    const error = await client.getPixQrCode('pay_1').catch(e => e);
    expect(error).toBeInstanceOf(AsaasError);
    expect(error.errors[0].code).toBe('http_502');
  });

  it('reads the subaccount key from either place the docs show', async () => {
    const top = asaasWith({ 'POST /v3/accounts': { body: { id: 'acc_1', walletId: 'wal_1', apiKey: 'sub-key' } } });
    expect(await top.client.createAccount({} as never)).toEqual({ id: 'acc_1', walletId: 'wal_1', apiKey: 'sub-key' });
    const nested = asaasWith({ 'POST /v3/accounts': { body: { id: 'acc_2', walletId: 'wal_2', accessToken: { apiKey: 'k2' } } } });
    expect((await nested.client.createAccount({} as never)).apiKey).toBe('k2');
  });

  it('switches API key for subaccount calls and encodes path ids', async () => {
    const { fetch, calls } = fakeFetch({ 'DELETE /v3/subscriptions/sub_1%2F..': { body: { deleted: true, id: 'sub_1' } } });
    const client = new AsaasClient({ apiKey: 'root', fetch, baseUrl: 'https://api.asaas.com/v3/' }).withApiKey('sub');
    await client.deleteSubscription('sub_1/..');
    expect(calls[0].url).toBe('https://api.asaas.com/v3/subscriptions/sub_1%2F..');
    expect(calls[0].headers.access_token).toBe('sub');
  });

  it('refuses plain http and missing keys', () => {
    expect(() => new AsaasClient({ apiKey: 'k', fetch: fetch, baseUrl: 'http://api.asaas.com/v3' })).toThrow();
    expect(() => new AsaasClient({ apiKey: '', fetch: fetch })).toThrow();
  });
});

describe('CORS and envelope', () => {
  it('allows the app origins and SITE_URL only', () => {
    expect(allowedOrigins('https://workeasy.com.br/qualquer')).toEqual([
      'http://localhost:3000', 'http://127.0.0.1:3000', 'capacitor://localhost', 'https://localhost',
      'http://tauri.localhost', 'tauri://localhost', 'https://workeasy.com.br',
    ]);
    expect(corsHeaders('capacitor://localhost')['Access-Control-Allow-Origin']).toBe('capacitor://localhost');
    expect(corsHeaders('https://workeasy.com.br', 'https://workeasy.com.br')['Access-Control-Allow-Origin']).toBe('https://workeasy.com.br');
    expect(corsHeaders('https://evil.example')['Access-Control-Allow-Origin']).toBeUndefined();
    expect(allowedOrigins('not a url')).toHaveLength(6);
  });

  it('answers preflight, rejects methods, wraps data and errors', async () => {
    const opts = { methods: ['POST'] };
    const preflight = await route(new Request('http://x/f', { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000' } }), opts, async () => ({ data: 1 }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');

    const get = await route(new Request('http://x/f'), opts, async () => ({ data: 1 }));
    expect(get.status).toBe(405);
    expect(await get.json()).toEqual({ ok: false, error: { code: 'method_not_allowed', message: 'Método não permitido.' } });

    const ok = await route(new Request('http://x/f', { method: 'POST' }), opts, async () => ({ data: { a: 1 }, status: 201 }));
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ ok: true, data: { a: 1 } });

    const known = await route(new Request('http://x/f', { method: 'POST' }), opts, async () => {
      throw errors.invalidInput(['a: texto obrigatório']);
    });
    expect(known.status).toBe(400);
    expect(await known.json()).toEqual({ ok: false, error: { code: 'invalid_input', message: 'Dados inválidos.', details: ['a: texto obrigatório'] } });

    const logged: unknown[] = [];
    const crash = await route(new Request('http://x/f', { method: 'POST' }), { ...opts, onError: e => logged.push(e) }, async () => {
      throw new Error('secret detail');
    });
    expect(crash.status).toBe(500);
    expect(JSON.stringify(await crash.json())).not.toContain('secret detail');
    expect(logged).toHaveLength(1);
  });

  it('passes the contract database rule codes through', () => {
    expect(dbRuleError('invalid_transition')).toBeInstanceOf(HttpError);
    expect(dbRuleError('not_allowed')?.status).toBe(403);
    expect(dbRuleError('labor_lock')?.status).toBe(409);
    expect(dbRuleError('duplicate key value')).toBeNull();
    expect(dbRuleError(undefined)).toBeNull();
  });
});

describe('readConfig', () => {
  it('reads the contract variables with defaults and new-style key dictionaries', () => {
    const env: Record<string, string> = {
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_PUBLISHABLE_KEYS: '{"default":"sb_publishable_x"}',
      SUPABASE_SERVICE_ROLE_KEY: 'service',
      ASAAS_API_KEY: ' key ',
      WHATSAPP_TOKEN: '',
    };
    const config = readConfig(name => env[name]);
    expect(config.publishableKey).toBe('sb_publishable_x');
    expect(config.serviceKey).toBe('service');
    expect(config.asaas).toEqual({ apiKey: 'key', baseUrl: 'https://api-sandbox.asaas.com/v3', webhookToken: undefined });
    expect(config.whatsapp).toEqual({ token: undefined, phoneNumberId: undefined, graphVersion: 'v26.0' });
    expect(config.anthropicApiKey).toBeUndefined();
  });

  it('falls back to the legacy anon key and ignores malformed dictionaries', () => {
    expect(readConfig(n => ({ SUPABASE_ANON_KEY: 'anon', SUPABASE_PUBLISHABLE_KEYS: '{bad' })[n]).publishableKey).toBe('anon');
    expect(keyFromDictionary('{"other":"x"}')).toBeUndefined();
    expect(readConfig(n => ({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_y"}' })[n]).serviceKey).toBe('sb_secret_y');
  });
});
