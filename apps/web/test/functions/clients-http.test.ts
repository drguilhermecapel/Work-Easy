// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AsaasClient, AsaasError, describeAsaasError } from '../../supabase/functions/_shared/asaas-client.ts';
import { keyFromDictionary, readConfig } from '../../supabase/functions/_shared/config.ts';
import { dbRuleError } from '../../supabase/functions/_shared/handler-kit.ts';
import {
  allowedOrigins, corsHeaders, errors, HttpError, JSON_BODY_LIMIT, readJson, route,
} from '../../supabase/functions/_shared/http.ts';
import { asaasWith, fakeFetch, post } from './helpers.ts';

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
  it('allows the native app origins and SITE_URL only, with no localhost in production', () => {
    expect(allowedOrigins('https://workeasy.com.br/qualquer')).toEqual([
      'capacitor://localhost', 'https://localhost', 'http://tauri.localhost', 'tauri://localhost', 'https://workeasy.com.br',
    ]);
    expect(allowedOrigins()).not.toContain('http://localhost:3000');
    expect(allowedOrigins()).not.toContain('http://127.0.0.1:3000');
    expect(corsHeaders('http://localhost:3000')['Access-Control-Allow-Origin']).toBeUndefined();
    expect(corsHeaders('capacitor://localhost')['Access-Control-Allow-Origin']).toBe('capacitor://localhost');
    expect(corsHeaders('https://workeasy.com.br', 'https://workeasy.com.br')['Access-Control-Allow-Origin']).toBe('https://workeasy.com.br');
    expect(corsHeaders('https://evil.example')['Access-Control-Allow-Origin']).toBeUndefined();
    expect(allowedOrigins('not a url')).toHaveLength(4);
  });

  it('adds the Vite dev origins only when asked (sandbox or ALLOW_DEV_ORIGINS)', () => {
    expect(allowedOrigins('https://workeasy.com.br', true)).toEqual([
      'capacitor://localhost', 'https://localhost', 'http://tauri.localhost', 'tauri://localhost',
      'http://localhost:3000', 'http://127.0.0.1:3000', 'https://workeasy.com.br',
    ]);
    expect(corsHeaders('http://localhost:3000', undefined, true)['Access-Control-Allow-Origin']).toBe('http://localhost:3000');
  });

  it('answers preflight, rejects methods, wraps data and errors', async () => {
    const opts = { methods: ['POST'] };
    const preflight = await route(new Request('http://x/f', { method: 'OPTIONS', headers: { Origin: 'capacitor://localhost' } }), opts, async () => ({ data: 1 }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('capacitor://localhost');
    const dev = new Request('http://x/f', { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000' } });
    expect((await route(dev, opts, async () => ({ data: 1 }))).headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect((await route(dev, { ...opts, allowDevOrigins: true }, async () => ({ data: 1 }))).headers.get('Access-Control-Allow-Origin'))
      .toBe('http://localhost:3000');

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
    expect(config.proGraceDays).toBe(0);
    expect(config.assistHourlyLimit).toBe(10);
  });

  it('opens the dev origins only for the Asaas sandbox or ALLOW_DEV_ORIGINS=true', () => {
    expect(readConfig(() => undefined).allowDevOrigins).toBe(true); // defaults to the sandbox
    const production = { ASAAS_BASE_URL: 'https://api.asaas.com/v3' };
    expect(readConfig(n => (production as Record<string, string>)[n]).allowDevOrigins).toBe(false);
    expect(readConfig(n => ({ ...production, ALLOW_DEV_ORIGINS: 'true' } as Record<string, string>)[n]).allowDevOrigins).toBe(true);
    expect(readConfig(n => ({ ...production, ALLOW_DEV_ORIGINS: 'yes' } as Record<string, string>)[n]).allowDevOrigins).toBe(false);
  });

  it('reads the grace days and the assistant limit as bounded integers', () => {
    const env = { PRO_GRACE_DAYS: '7', ASSIST_HOURLY_LIMIT: '25' } as Record<string, string>;
    expect(readConfig(n => env[n])).toMatchObject({ proGraceDays: 7, assistHourlyLimit: 25 });
    expect(readConfig(n => ({ PRO_GRACE_DAYS: '9999' } as Record<string, string>)[n]).proGraceDays).toBe(60);
    expect(readConfig(n => ({ PRO_GRACE_DAYS: '-1', ASSIST_HOURLY_LIMIT: 'x' } as Record<string, string>)[n])).toMatchObject({
      proGraceDays: 0, assistHourlyLimit: 10,
    });
  });

  it('falls back to the legacy anon key and ignores malformed dictionaries', () => {
    expect(readConfig(n => ({ SUPABASE_ANON_KEY: 'anon', SUPABASE_PUBLISHABLE_KEYS: '{bad' })[n]).publishableKey).toBe('anon');
    expect(keyFromDictionary('{"other":"x"}')).toBeUndefined();
    expect(readConfig(n => ({ SUPABASE_SECRET_KEYS: '{"default":"sb_secret_y"}' })[n]).serviceKey).toBe('sb_secret_y');
  });
});

describe('readJson body limit', () => {
  /** The HttpError a refused body leaves behind; fails the test when the body was accepted. */
  const refusal = (promise: Promise<unknown>): Promise<HttpError> =>
    promise.then(() => {
      throw new Error('readJson accepted the body');
    }, (error: HttpError) => error);

  // A body that arrives as a stream, so the request carries no Content-Length
  const streamed = (chunks: Uint8Array[]) =>
    new Request('http://x/f', {
      method: 'POST',
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }),
      duplex: 'half',
    } as RequestInit);

  it('reads a body within the limit and accepts one of exactly the limit', async () => {
    expect(await readJson(post('x', { a: 1 }))).toEqual({ a: 1 });
    const padded = `${' '.repeat(JSON_BODY_LIMIT - 2)}{}`;
    expect(new TextEncoder().encode(padded).byteLength).toBe(JSON_BODY_LIMIT);
    expect(await readJson(new Request('http://x/f', { method: 'POST', body: padded }))).toEqual({});
  });

  it('still answers 400 for text that is not JSON', async () => {
    const error = await refusal(readJson(new Request('http://x/f', { method: 'POST', body: 'não é json' })));
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(400);
    expect(error.code).toBe('invalid_json');
  });

  it('refuses a Content-Length over the limit before reading the body', async () => {
    const req = new Request('http://x/f', {
      method: 'POST', headers: { 'Content-Length': String(JSON_BODY_LIMIT + 1) }, body: '{}',
    });
    const error = await refusal(readJson(req));
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(413);
    expect(req.bodyUsed).toBe(false);
  });

  it('refuses a streamed body without Content-Length once it passes the limit', async () => {
    const half = new Uint8Array(JSON_BODY_LIMIT / 2 + 1).fill(0x20);
    const req = streamed([half, half]);
    expect(req.headers.get('content-length')).toBeNull();
    const error = await refusal(readJson(req));
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(413);
  });

  it('stops reading an endless stream at the limit', async () => {
    let pulls = 0;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++;
        controller.enqueue(new Uint8Array(1024).fill(0x20));
      },
    });
    const error = await refusal(readJson(new Request('http://x/f', { method: 'POST', body: endless, duplex: 'half' } as RequestInit)));
    expect(error.status).toBe(413);
    expect(pulls).toBeLessThan(JSON_BODY_LIMIT / 1024 + 10);
  });

  it('answers 413 with the error envelope through route', async () => {
    const req = new Request('http://x/f', {
      method: 'POST', headers: { 'Content-Length': String(JSON_BODY_LIMIT + 1) }, body: '{}',
    });
    const res = await route(req, { methods: ['POST'] }, async () => ({ data: await readJson(req) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      ok: false, error: { code: 'payload_too_large', message: 'O corpo da requisição é grande demais.' },
    });
  });
});
