// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type DeleteDeps, handler as accountDelete, type OpenCharge } from '../../supabase/functions/account-delete/handler.ts';
import { type ExportDeps, handler as accountExport } from '../../supabase/functions/account-export/handler.ts';
import {
  type AssistDeps, type ClassifyRequest, type ClassifyResult, handler as assist,
} from '../../supabase/functions/request-assist/handler.ts';
import { asaasWith, baseDeps, post, PROVIDER, read, USER } from './helpers.ts';

describe('account-export', () => {
  function exportDeps(failing: string[] = []) {
    const filters: Array<[string, string]> = [];
    const requests: unknown[] = [];
    const deps: ExportDeps = {
      ...baseDeps,
      session: async () => ({
        user: USER,
        selectOwned: async (table, filter) => {
          filters.push([table, filter]);
          if (failing.includes(table)) throw new Error(`relation "${table}" does not exist`);
          if (table === 'profiles') return [{ id: USER.id, full_name: 'Ana' }];
          if (table === 'households') return [{ id: 'h1', owner_id: USER.id }];
          if (table === 'provider_payment_accounts') return [{ provider_id: USER.id, api_key_secret_id: 'secret', asaas_wallet_id: 'w' }];
          return [];
        },
        selectIn: async (table, column, values) => (table === 'care_recipients' ? [{ id: 'c1', [column]: values[0], first_name: 'Dona' }] : []),
      }),
      admin: { recordRequest: async row => void requests.push(row) },
    };
    return { deps, filters, requests };
  }

  it('exports only the caller rows and logs the request', async () => {
    const { deps, filters, requests } = exportDeps();
    const res = await read(await accountExport(post('account-export', {}), deps));
    expect(res.status).toBe(200);
    expect(filters.every(([, f]) => f.includes(`.eq.${USER.id}`))).toBe(true);
    expect(res.body.data.data.profiles).toEqual([{ id: USER.id, full_name: 'Ana' }]);
    expect(res.body.data.data.care_recipients).toEqual([{ id: 'c1', household_id: 'h1', first_name: 'Dona' }]);
    expect(res.body.data.data.provider_payment_accounts).toEqual([{ provider_id: USER.id, asaas_wallet_id: 'w' }]);
    expect(requests).toEqual([{ user_id: USER.id, kind: 'export', status: 'completed', completed_at: '2026-10-19T15:00:00.000Z' }]);
  });

  it('lists tables it could not read instead of failing', async () => {
    const res = await read(await accountExport(post('account-export', {}), exportDeps(['checkins']).deps));
    expect(res.status).toBe(200);
    expect(res.body.data.unavailable).toEqual(['checkins']);
  });

  it('requires a session', async () => {
    const deps: ExportDeps = { ...exportDeps().deps, session: async () => null };
    expect((await read(await accountExport(post('account-export', {}), deps))).status).toBe(401);
  });
});

describe('account-delete', () => {
  const SUB_ID = 'sub_1';
  const CHARGES: OpenCharge[] = [
    { id: 'pay-row-1', asaas_payment_id: 'pay_p', account: 'platform', provider_id: PROVIDER.id },
    { id: 'pay-row-2', asaas_payment_id: 'pay_q', account: 'provider', provider_id: USER.id },
  ];

  function deleteDeps(over: {
    anonymizeFails?: boolean;
    authFails?: boolean;
    blocking?: number;
    subscription?: string | null;
    charges?: OpenCharge[];
    noAsaas?: boolean;
    routes?: Parameters<typeof asaasWith>[0];
    subKey?: string | null;
    documentsFail?: boolean;
  } = {}) {
    const steps: string[] = [];
    const audits: Array<{ data?: Record<string, unknown> }> = [];
    const { client, calls } = asaasWith(over.routes ?? {
      [`DELETE /v3/subscriptions/${SUB_ID}`]: { body: { deleted: true, id: SUB_ID } },
      'DELETE /v3/payments/pay_p': { body: { deleted: true, id: 'pay_p' } },
      'DELETE /v3/payments/pay_q': { body: { deleted: true, id: 'pay_q' } },
    });
    const deps: DeleteDeps = {
      ...baseDeps,
      asaas: over.noAsaas ? null : client,
      session: async () => ({ user: USER }),
      admin: {
        countBlockingBookings: async () => over.blocking ?? 0,
        getActiveSubscriptionId: async () => over.subscription ?? null,
        markSubscriptionCanceled: async () => void steps.push('sub-local'),
        listOpenCharges: async () => over.charges ?? [],
        markPaymentCanceled: async id => void steps.push(`pay-local:${id}`),
        getSubaccountApiKey: async () => (over.subKey === undefined ? 'sub-key' : over.subKey),
        removeDocuments: async () => {
          if (over.documentsFail) throw new Error('storage down');
          steps.push('documents');
          return 3;
        },
        createRequest: async () => {
          steps.push('request');
          return 'dr-1';
        },
        updateRequest: async (_id, patch) => void steps.push(`status:${patch.status}`),
        anonymizeUser: async () => {
          if (over.anonymizeFails) throw new Error('anonymize failed');
          steps.push('anonymize');
        },
        deleteAuthUser: async () => {
          if (over.authFails) throw new Error('auth down');
          steps.push('auth-delete');
        },
        audit: async entry => {
          audits.push(entry);
          steps.push('audit');
        },
      },
    };
    return { deps, steps, calls, audits };
  }

  const confirm = () => post('account-delete', { confirm: 'EXCLUIR' });

  it('requires the explicit confirmation', async () => {
    for (const body of [{}, { confirm: 'excluir' }, { confirm: 'SIM' }]) {
      const { deps, steps } = deleteDeps();
      const res = await read(await accountDelete(post('account-delete', body), deps));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('confirmation_required');
      expect(steps).toEqual([]);
    }
  });

  it('records, anonymizes and then deletes the Auth user, with data_requests only in contract statuses', async () => {
    const { deps, steps } = deleteDeps();
    const res = await read(await accountDelete(confirm(), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true, data_request_id: 'dr-1', completed_at: '2026-10-19T15:00:00.000Z' });
    // data_requests.status is pending|processing|completed|failed: no "anonymized"
    expect(steps).toEqual(['request', 'documents', 'anonymize', 'audit', 'auth-delete', 'status:completed']);
  });

  it('refuses while a booking is in progress, before touching anything', async () => {
    const { deps, steps, calls } = deleteDeps({ blocking: 2, subscription: SUB_ID, charges: CHARGES });
    const res = await read(await accountDelete(confirm(), deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('active_bookings');
    expect(res.body.error.message).toContain('Conclua ou cancele');
    expect(steps).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('cancels the Pro subscription and the open charges in Asaas before anonymizing', async () => {
    const { deps, steps, calls, audits } = deleteDeps({ subscription: SUB_ID, charges: CHARGES });
    const res = await read(await accountDelete(confirm(), deps));
    expect(res.status).toBe(200);
    expect(calls.map(c => `${c.method} ${new URL(c.url).pathname} ${c.headers.access_token}`)).toEqual([
      'DELETE /v3/subscriptions/sub_1 root-key',
      'DELETE /v3/payments/pay_p root-key',
      'DELETE /v3/payments/pay_q sub-key', // the provider's own charge, in the subaccount
    ]);
    expect(steps).toEqual([
      'request', 'sub-local', 'pay-local:pay-row-1', 'pay-local:pay-row-2', 'documents', 'anonymize', 'audit', 'auth-delete', 'status:completed',
    ]);
    expect(audits[0].data).toMatchObject({ subscription_canceled: true, charges_canceled: 2 });
  });

  it('treats what Asaas no longer has as done, so a retry after a partial failure works', async () => {
    const gone = { status: 404, body: { errors: [{ code: 'not_found', description: 'Não encontrado' }] } };
    const { deps, steps } = deleteDeps({
      subscription: SUB_ID,
      charges: CHARGES.slice(0, 1),
      routes: { [`DELETE /v3/subscriptions/${SUB_ID}`]: gone, 'DELETE /v3/payments/pay_p': gone },
    });
    expect((await read(await accountDelete(confirm(), deps))).status).toBe(200);
    expect(steps).toContain('anonymize');
  });

  it('stops without anonymizing when Asaas fails or a charge was paid meanwhile, and marks the request failed', async () => {
    const down = deleteDeps({
      subscription: SUB_ID,
      routes: { [`DELETE /v3/subscriptions/${SUB_ID}`]: { status: 500, body: {} } },
    });
    expect((await read(await accountDelete(confirm(), down.deps))).status).toBe(502);
    expect(down.steps).toEqual(['request', 'status:failed']);

    const paid = deleteDeps({
      charges: CHARGES.slice(0, 1),
      routes: { 'DELETE /v3/payments/pay_p': { status: 400, body: { errors: [{ code: 'invalid_action', description: 'Cobrança paga' }] } } },
    });
    const res = await read(await accountDelete(confirm(), paid.deps));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('payment_in_progress');
    expect(paid.steps).toEqual(['request', 'status:failed']);
  });

  it('needs Asaas only when there is something to cancel there', async () => {
    const nothing = deleteDeps({ noAsaas: true });
    expect((await read(await accountDelete(confirm(), nothing.deps))).status).toBe(200);
    const withSub = deleteDeps({ noAsaas: true, subscription: SUB_ID });
    const res = await read(await accountDelete(confirm(), withSub.deps));
    expect(res.status).toBe(503);
    expect(withSub.steps).toEqual(['request', 'status:failed']);
  });

  it('empties the document folder before anonymize_user, which refuses a user that still has files', async () => {
    const { deps, steps, audits } = deleteDeps();
    expect((await read(await accountDelete(confirm(), deps))).status).toBe(200);
    expect(steps.indexOf('documents')).toBeGreaterThan(-1);
    expect(steps.indexOf('documents')).toBeLessThan(steps.indexOf('anonymize'));
    expect(audits[0].data).toMatchObject({ documents_removed: 3 });

    const down = deleteDeps({ documentsFail: true });
    expect((await read(await accountDelete(confirm(), down.deps))).status).toBe(500);
    expect(down.steps).toEqual(['request', 'status:failed']);
  });

  it('marks the request failed when anonymization fails, and never deletes the login', async () => {
    const { deps, steps } = deleteDeps({ anonymizeFails: true });
    expect((await read(await accountDelete(confirm(), deps))).status).toBe(500);
    expect(steps).toEqual(['request', 'documents', 'status:failed']);
  });

  it('explains a partial failure when the Auth delete fails', async () => {
    const { deps, steps } = deleteDeps({ authFails: true });
    const res = await read(await accountDelete(confirm(), deps));
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('auth_delete_failed');
    expect(steps).not.toContain('status:completed');
  });
});

describe('request-assist', () => {
  const OCCUPATIONS = [
    { slug: 'encanador', name: 'Encanador', synonyms: ['vazamento'] },
    { slug: 'diarista', name: 'Diarista', synonyms: ['faxina'] },
  ];

  // `used` calls were already made this hour; take() is atomic like take_assist_quota:
  // it grants while used < limit and counts the grant, and refuses without counting.
  function assistDeps(result: ClassifyResult | null, over: { used?: number; limit?: number; failTake?: boolean } = {}) {
    const requests: ClassifyRequest[] = [];
    const usage = { takes: [] as { userId: string; limit: number }[], used: over.used ?? 0 };
    const deps: AssistDeps = {
      ...baseDeps,
      hourlyLimit: over.limit ?? 10,
      usage: {
        take: async (userId, limit) => {
          usage.takes.push({ userId, limit });
          if (over.failTake) throw new Error('database unavailable');
          if (usage.used >= limit) return false;
          usage.used += 1;
          return true;
        },
      },
      classify: result
        ? async request => {
            requests.push(request);
            return result;
          }
        : null,
      session: async () => ({ user: USER, listOccupations: async () => OCCUPATIONS }),
    };
    return { deps, requests, usage };
  }

  const text = { text: 'Tem um vazamento embaixo da pia, preciso hoje' };

  it('answers 503 without ANTHROPIC_API_KEY', async () => {
    const res = await read(await assist(post('request-assist', text), assistDeps(null).deps));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('assist_not_configured');
  });

  it('limits each user per hour, taking the quota before the model is called', async () => {
    const ok: ClassifyResult = { kind: 'ok', text: '{"occupation_slug":"encanador","urgent":false,"summary":"Vazamento."}' };
    const under = assistDeps(ok, { used: 9, limit: 10 });
    expect((await read(await assist(post('request-assist', text), under.deps))).status).toBe(200);
    expect(under.usage.takes).toEqual([{ userId: USER.id, limit: 10 }]);
    expect(under.usage.used).toBe(10);

    const over = assistDeps(ok, { used: 10, limit: 10 });
    const res = await read(await assist(post('request-assist', text), over.deps));
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('assist_rate_limited');
    expect(res.body.error.message).toContain('limite');
    expect(over.requests).toEqual([]);
    expect(over.usage.used).toBe(10); // a refused call consumes nothing
    // limit 0 turns the assistant off without even asking the database
    const off = assistDeps(ok, { limit: 0 });
    const offRes = await read(await assist(post('request-assist', text), off.deps));
    expect(offRes.status).toBe(429);
    expect(offRes.body.error.code).toBe('assist_rate_limited');
    expect(off.usage.takes).toEqual([]);
    expect(off.requests).toEqual([]);
  });

  it('never passes the limit under a burst of simultaneous requests', async () => {
    const ok: ClassifyResult = { kind: 'ok', text: '{"occupation_slug":"encanador","urgent":false,"summary":"Vazamento."}' };
    const burst = assistDeps(ok, { used: 7, limit: 10 });
    const responses = await Promise.all(Array.from({ length: 8 }, () => assist(post('request-assist', text), burst.deps)));
    const statuses = (await Promise.all(responses.map(read))).map(r => r.status).sort();
    expect(statuses).toEqual([200, 200, 200, 429, 429, 429, 429, 429]);
    expect(burst.requests).toHaveLength(3); // the model is called only for granted quota
    expect(burst.usage.used).toBe(10);
  });

  it('fails closed when the quota cannot be taken: no model call', async () => {
    const ok: ClassifyResult = { kind: 'ok', text: '{"occupation_slug":"encanador","urgent":false,"summary":"Vazamento."}' };
    const broken = assistDeps(ok, { failTake: true });
    const res = await read(await assist(post('request-assist', text), broken.deps));
    expect(res.status).toBe(500);
    expect(broken.requests).toEqual([]);
  });

  it('does not take quota for calls that fail validation or have no key configured', async () => {
    const short = assistDeps({ kind: 'ok', text: '{}' });
    await assist(post('request-assist', { text: 'curto' }), short.deps);
    expect(short.usage.takes).toEqual([]);
    const noKey = assistDeps(null);
    await assist(post('request-assist', text), noKey.deps);
    expect(noKey.usage.takes).toEqual([]);
  });

  it('validates the text length', async () => {
    const res = await read(await assist(post('request-assist', { text: 'curto' }), assistDeps({ kind: 'ok', text: '{}' }).deps));
    expect(res.status).toBe(400);
  });

  it('sends ranked candidates and returns the validated structure', async () => {
    const { deps, requests } = assistDeps({
      kind: 'ok', text: '{"occupation_slug":"encanador","urgent":true,"summary":"Vazamento sob a pia da cozinha."}',
    });
    const res = await read(await assist(post('request-assist', text), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      occupation_slug: 'encanador', occupation_name: 'Encanador', urgent: true, summary: 'Vazamento sob a pia da cozinha.',
      candidates: [{ slug: 'encanador', name: 'Encanador' }],
    });
    expect(requests[0].user).toContain('- encanador: Encanador');
    expect(requests[0].user).not.toContain('diarista');
    expect((requests[0].schema as { properties: { occupation_slug: { enum: string[] } } }).properties.occupation_slug.enum)
      .toEqual(['encanador', 'nenhuma']);
  });

  it('never returns a slug outside the catalog candidates', async () => {
    const res = await read(await assist(post('request-assist', text),
      assistDeps({ kind: 'ok', text: '{"occupation_slug":"medico","urgent":false,"summary":"x"}' }).deps));
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('assist_unavailable');
  });

  it('maps refusals and incomplete answers to manual fallback messages', async () => {
    const refused = await read(await assist(post('request-assist', text), assistDeps({ kind: 'refusal' }).deps));
    expect(refused.status).toBe(422);
    expect(refused.body.error.message).toContain('manualmente');
    const cut = await read(await assist(post('request-assist', text), assistDeps({ kind: 'incomplete', reason: 'max_tokens' }).deps));
    expect(cut.status).toBe(502);
  });
});
