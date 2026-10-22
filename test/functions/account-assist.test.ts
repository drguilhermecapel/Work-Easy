// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type DeleteDeps, handler as accountDelete } from '../../supabase/functions/account-delete/handler.ts';
import { type ExportDeps, handler as accountExport } from '../../supabase/functions/account-export/handler.ts';
import {
  type AssistDeps, type ClassifyRequest, type ClassifyResult, handler as assist,
} from '../../supabase/functions/request-assist/handler.ts';
import { baseDeps, post, read, USER } from './helpers.ts';

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
  function deleteDeps(over: { anonymizeFails?: boolean; authFails?: boolean } = {}) {
    const steps: string[] = [];
    const deps: DeleteDeps = {
      ...baseDeps,
      session: async () => ({ user: USER }),
      admin: {
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
        audit: async () => void steps.push('audit'),
      },
    };
    return { deps, steps };
  }

  it('requires the explicit confirmation', async () => {
    for (const body of [{}, { confirm: 'excluir' }, { confirm: 'SIM' }]) {
      const { deps, steps } = deleteDeps();
      const res = await read(await accountDelete(post('account-delete', body), deps));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('confirmation_required');
      expect(steps).toEqual([]);
    }
  });

  it('records, anonymizes and then deletes the Auth user', async () => {
    const { deps, steps } = deleteDeps();
    const res = await read(await accountDelete(post('account-delete', { confirm: 'EXCLUIR' }), deps));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: true, data_request_id: 'dr-1', completed_at: '2026-10-19T15:00:00.000Z' });
    expect(steps).toEqual(['request', 'anonymize', 'status:anonymized', 'audit', 'auth-delete', 'status:completed']);
  });

  it('marks the request failed when anonymization fails, and never deletes the login', async () => {
    const { deps, steps } = deleteDeps({ anonymizeFails: true });
    expect((await read(await accountDelete(post('account-delete', { confirm: 'EXCLUIR' }), deps))).status).toBe(500);
    expect(steps).toEqual(['request', 'status:failed']);
  });

  it('explains a partial failure when the Auth delete fails', async () => {
    const { deps, steps } = deleteDeps({ authFails: true });
    const res = await read(await accountDelete(post('account-delete', { confirm: 'EXCLUIR' }), deps));
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

  function assistDeps(result: ClassifyResult | null) {
    const requests: ClassifyRequest[] = [];
    const deps: AssistDeps = {
      ...baseDeps,
      classify: result
        ? async request => {
            requests.push(request);
            return result;
          }
        : null,
      session: async () => ({ user: USER, listOccupations: async () => OCCUPATIONS }),
    };
    return { deps, requests };
  }

  const text = { text: 'Tem um vazamento embaixo da pia, preciso hoje' };

  it('answers 503 without ANTHROPIC_API_KEY', async () => {
    const res = await read(await assist(post('request-assist', text), assistDeps(null).deps));
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('assist_not_configured');
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
