// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { AsaasClient } from '../../supabase/functions/_shared/asaas-client.ts';
import { deriveSubaccountToken } from '../../supabase/functions/_shared/secrets.ts';
import { SUBACCOUNT_WEBHOOK_EVENTS } from '../../supabase/functions/_shared/subaccount-webhook.ts';
import { handler, type SyncDeps } from '../../supabase/functions/asaas-webhooks-sync/handler.ts';
import { baseDeps, post, read, USER } from './helpers.ts';

const TOKEN = 'platform-token-0123456789abcdef0123456789';
const BASE = 'https://proj.supabase.co/functions/v1/asaas-webhook';
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const P2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const P3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ours = (id: string) => `${BASE}?acct=${id}`;
const KEY = (id: string) => `$aact_secret_${id.slice(0, 4)}`;

type Hook = { id: string; url: string; hasAuthToken?: boolean };
interface Call { method: string; path: string; search: URLSearchParams; key: string; body: Record<string, unknown> | undefined }
type Reply = { status?: number; body: unknown };

/**
 * Fake Asaas per subaccount key. `webhooks` are the hooks each subaccount lists; `fail` forces an
 * answer for one provider's calls (`GET`, `PUT` or `POST`).
 */
function setup(over: {
  admin?: boolean;
  webhooks?: Record<string, Hook[]>;
  fail?: Record<string, Partial<Record<'GET' | 'PUT' | 'POST', Reply>>>;
  targets?: string[];
  token?: string | undefined;
  emails?: Record<string, string | null>;
  fallbackEmail?: string | null;
} = {}) {
  const calls: Call[] = [];
  const audits: Array<{ action: string; entity_id: string; data?: Record<string, unknown> }> = [];
  const providerOfKey = (key: string) => [P1, P2, P3].find(id => KEY(id) === key) as string;
  const fetch = async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const key = (init.headers as Record<string, string>).access_token;
    const method = (init.method ?? 'GET') as 'GET' | 'PUT' | 'POST';
    const call: Call = {
      method, path: url.pathname, search: url.searchParams, key, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const provider = providerOfKey(key);
    const forced = over.fail?.[provider]?.[method];
    if (forced) return new Response(JSON.stringify(forced.body), { status: forced.status ?? 200 });
    const hooks = over.webhooks?.[provider] ?? [];
    if (method === 'GET') {
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      const data = hooks.slice(offset, offset + limit);
      return new Response(JSON.stringify({ object: 'list', hasMore: offset + limit < hooks.length, totalCount: hooks.length, limit, offset, data }));
    }
    return new Response(JSON.stringify({ id: 'wh_new', url: call.body?.url }));
  };
  const deps: SyncDeps = {
    ...baseDeps,
    asaas: new AsaasClient({ apiKey: 'root-key', baseUrl: 'https://api-sandbox.asaas.com/v3', fetch }),
    webhookUrl: BASE,
    webhookToken: 'token' in over ? over.token : TOKEN,
    fallbackEmail: 'fallbackEmail' in over ? (over.fallbackEmail ?? null) : 'suporte@workeasy.com.br',
    session: async () => ({ user: USER, isAdmin: async () => over.admin !== false }),
    admin: {
      listTargets: async ({ providerId, after, limit }) => {
        const all = over.targets ?? [P1, P2, P3];
        const rest = providerId ? all.filter(id => id === providerId) : all.filter(id => !after || id > after);
        const ids = rest.slice(0, limit);
        return { ids, remaining: providerId ? 0 : rest.length - ids.length };
      },
      readKey: async id => KEY(id),
      emailOf: async id => (over.emails && id in over.emails ? over.emails[id] : null),
      audit: async entry => void audits.push(entry),
    },
  };
  return { deps, calls, audits };
}

const run = async (deps: SyncDeps, body: unknown = {}) => read(await handler(post('asaas-webhooks-sync', body), deps));
const writes = (calls: Call[]) => calls.filter(c => c.method !== 'GET');
const hook = (id: string, url: string, hasAuthToken = true): Hook => ({ id: `wh_${id}`, url, hasAuthToken });

describe('asaas-webhooks-sync', () => {
  it('creates the webhook when the subaccount has none of ours, with the derived token', async () => {
    const { deps, calls } = setup({ emails: { [P1]: 'ana@example.com' } });
    const res = await run(deps, { provider_id: P1 });
    expect(res.status).toBe(200);
    expect(res.body.data.results).toEqual([{ provider_id: P1, result: 'created' }]);
    const [get, create] = calls;
    expect(get).toMatchObject({ method: 'GET', path: '/v3/webhooks', key: KEY(P1) }); // the subaccount's own key
    expect(create).toMatchObject({ method: 'POST', path: '/v3/webhooks', key: KEY(P1) });
    expect(create.body).toEqual({
      name: 'WorkEasy', url: ours(P1), email: 'ana@example.com', enabled: true, interrupted: false, sendType: 'SEQUENTIALLY',
      apiVersion: 3, authToken: await deriveSubaccountToken(TOKEN, P1), events: SUBACCOUNT_WEBHOOK_EVENTS,
    });
  });

  it('falls back to the configured address when the provider has no e-mail on file', async () => {
    const { deps, calls } = setup();
    await run(deps, { provider_id: P1 });
    expect(writes(calls)[0].body?.email).toBe('suporte@workeasy.com.br');
    const none = setup({ fallbackEmail: null });
    const res = await run(none.deps, { provider_id: P1 });
    expect(res.body.data.results).toEqual([{ provider_id: P1, result: 'failed', code: 'email_missing' }]);
    expect(writes(none.calls)).toEqual([]);
  });

  it('updates the existing webhook (matched by normalized URL) and rewrites the derived token', async () => {
    // same host and path, upper-case account id, trailing slash and an extra parameter
    const listed = hook('mine', `https://PROJ.supabase.co/functions/v1/asaas-webhook/?acct=${P1.toUpperCase()}&x=1`);
    const { deps, calls } = setup({ webhooks: { [P1]: [hook('other', 'https://other.example/hook'), listed] } });
    const res = await run(deps, { provider_id: P1 });
    expect(res.body.data.results).toEqual([{ provider_id: P1, result: 'updated' }]);
    const put = writes(calls)[0];
    expect(put).toMatchObject({ method: 'PUT', path: `/v3/webhooks/${listed.id}` });
    expect(put.body).toEqual({
      url: ours(P1), authToken: await deriveSubaccountToken(TOKEN, P1), enabled: true, interrupted: false,
      sendType: 'SEQUENTIALLY', events: SUBACCOUNT_WEBHOOK_EVENTS,
    });
  });

  it('does not touch webhooks of another URL or of another provider', async () => {
    const { deps, calls } = setup({
      webhooks: { [P1]: [hook('x1', 'https://other.example/hook'), hook('x2', ours(P2)), hook('x3', BASE)] },
    });
    const res = await run(deps, { provider_id: P1 });
    expect(res.body.data.results[0].result).toBe('created');
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0].method).toBe('POST');
  });

  it('dry_run writes nothing and says what it would do', async () => {
    const { deps, calls, audits } = setup({ webhooks: { [P1]: [hook(P1, ours(P1))] } });
    const res = await run(deps, { dry_run: true });
    expect(writes(calls)).toEqual([]);
    expect(res.body.data.results).toEqual([
      { provider_id: P1, result: 'unchanged_dry_run', would: 'update' },
      { provider_id: P2, result: 'unchanged_dry_run', would: 'create' },
      { provider_id: P3, result: 'unchanged_dry_run', would: 'create' },
    ]);
    expect(audits[0].data).toMatchObject({ dry_run: true, unchanged_dry_run: 3 });
  });

  it('does not create a webhook when the subaccount already has 10', async () => {
    const ten = Array.from({ length: 10 }, (_, i) => hook(`n${i}`, `https://other.example/${i}`));
    const { deps, calls } = setup({ webhooks: { [P1]: ten } });
    const res = await run(deps, { provider_id: P1 });
    expect(res.body.data.results).toEqual([{ provider_id: P1, result: 'failed', code: 'too_many_webhooks' }]);
    expect(writes(calls)).toEqual([]);
  });

  it('still updates ours when the subaccount is at 10', async () => {
    const ten = Array.from({ length: 9 }, (_, i) => hook(`n${i}`, `https://other.example/${i}`)).concat(hook(P1, ours(P1)));
    const { deps } = setup({ webhooks: { [P1]: ten } });
    expect((await run(deps, { provider_id: P1 })).body.data.results[0].result).toBe('updated');
  });

  it('reads every page of the listing (100 per page)', async () => {
    const many = Array.from({ length: 150 }, (_, i) => hook(`m${i}`, `https://other.example/${i}`));
    many.push(hook(P1, ours(P1)));
    const { deps, calls } = setup({ webhooks: { [P1]: many } });
    const res = await run(deps, { provider_id: P1 });
    const gets = calls.filter(c => c.method === 'GET');
    expect(gets.map(c => [c.search.get('offset'), c.search.get('limit')])).toEqual([['0', '100'], ['100', '100']]);
    expect(res.body.data.results[0].result).toBe('updated'); // found on the second page
  });

  it('401 or 403 from the subaccount key is key_rejected and the batch goes on', async () => {
    const { deps } = setup({
      fail: {
        [P1]: { GET: { status: 401, body: { errors: [{ code: 'invalid_access_token', description: 'x' }] } } },
        [P2]: { GET: { status: 403, body: {} } },
      },
    });
    const res = await run(deps);
    expect(res.body.data.results.map((r: { result: string }) => r.result)).toEqual(['key_rejected', 'key_rejected', 'created']);
    expect(res.body.data).toMatchObject({ key_rejected: 2, created: 1, rate_limited: false });
  });

  it('a deterministic 400/422 fails that account only', async () => {
    const { deps } = setup({ fail: { [P2]: { POST: { status: 400, body: { errors: [{ code: 'invalid_email', description: 'E-mail inválido' }] } } } } });
    const res = await run(deps);
    expect(res.body.data.results).toEqual([
      { provider_id: P1, result: 'created' },
      { provider_id: P2, result: 'failed', code: 'invalid_email' },
      { provider_id: P3, result: 'created' },
    ]);
  });

  it('429 stops the batch, reports rate_limited and points the cursor before the account that was refused', async () => {
    const { deps, calls } = setup({ fail: { [P2]: { GET: { status: 429, body: {} } } } });
    const res = await run(deps);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ rate_limited: true, processed: 1, remaining: 2, next_cursor: P1 });
    expect(res.body.data.results).toEqual([{ provider_id: P1, result: 'created' }]);
    expect(calls.some(c => c.key === KEY(P3))).toBe(false);
    // resuming from the cursor starts at the refused account
    const resumed = await run(setup().deps, { cursor: P1 });
    expect(resumed.body.data.results.map((r: { provider_id: string }) => r.provider_id)).toEqual([P2, P3]);
  });

  it('batches: limit caps the accounts per call and next_cursor/remaining continue it', async () => {
    const { deps } = setup();
    const first = await run(deps, { limit: 2 });
    expect(first.body.data).toMatchObject({ processed: 2, remaining: 1, next_cursor: P2 });
    const second = await run(deps, { limit: 2, cursor: first.body.data.next_cursor });
    expect(second.body.data).toMatchObject({ processed: 1, remaining: 0, next_cursor: null });
    expect((await run(deps, { limit: 51 })).status).toBe(400);
  });

  it('refuses callers who are not admin, and anonymous ones', async () => {
    const { deps, calls } = setup({ admin: false });
    const res = await run(deps);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('not_allowed');
    expect(calls).toEqual([]);
    const anon = await read(await handler(post('asaas-webhooks-sync', {}), { ...deps, session: async () => null }));
    expect(anon.status).toBe(401);
  });

  it('needs the platform token and a known provider', async () => {
    expect((await run(setup({ token: undefined }).deps)).body.error.code).toBe('webhook_not_configured');
    expect((await run(setup({ targets: [] }).deps, { provider_id: P1 })).status).toBe(404);
  });

  it('puts no key or token in the response or in the single audit entry', async () => {
    const { deps, audits } = setup({
      webhooks: { [P1]: [hook(P1, ours(P1))] },
      fail: { [P3]: { POST: { status: 400, body: { errors: [{ code: 'bad', description: `leaked ${KEY(P3)}` }] } } } },
    });
    const res = await run(deps);
    const text = JSON.stringify([res.body, audits]);
    for (const secret of [TOKEN, 'root-key', KEY(P1), KEY(P2), KEY(P3), await deriveSubaccountToken(TOKEN, P1), await deriveSubaccountToken(TOKEN, P2)]) {
      expect(text).not.toContain(secret);
    }
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: 'asaas_webhooks.sync', entity_id: 'all', data: { processed: 3, updated: 1, created: 1, failed: 1 } });
    expect(res.body.data.results[2]).toEqual({ provider_id: P3, result: 'failed', code: 'bad' });
  });
});
