// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  handler, type PurgeCandidate, type PurgeDeps,
} from '../../supabase/functions/background-check-purge/handler.ts';

const SECRET = 'cron-secret-0123456789abcdef';
const URL_ = 'http://localhost/functions/v1/background-check-purge';

const FIRST: PurgeCandidate = { id: 'doc-a', storage_path: 'prov-a/antecedentes-1.pdf' };
const SECOND: PurgeCandidate = { id: 'doc-b', storage_path: 'prov-b/antecedentes-2.pdf' };

interface Options {
  candidates?: PurgeCandidate[];
  /** Storage removal fails for these paths. */
  removeFails?: string[];
  /** The purge call fails for these row ids. */
  markFails?: string[];
  /** No CRON_SECRET configured on the server. */
  noSecret?: boolean;
}

function setup(options: Options = {}) {
  const calls: string[] = [];
  const logged: unknown[] = [];
  const removeFails = new Set(options.removeFails ?? []);
  const markFails = new Set(options.markFails ?? []);
  const candidates = vi.fn(async () => options.candidates ?? []);
  const deps: PurgeDeps = {
    now: () => new Date('2026-11-18T03:20:00Z'),
    logError: error => void logged.push(error),
    cronSecret: options.noSecret ? undefined : SECRET,
    store: {
      candidates,
      async removeObject(path) {
        calls.push(`remove:${path}`);
        if (removeFails.has(path)) throw new Error('storage unavailable');
      },
      async markPurged(id) {
        calls.push(`mark:${id}`);
        if (markFails.has(id)) throw new Error('database unavailable');
      },
    },
  };
  return { deps, calls, logged, candidates };
}

function post(headers: Record<string, string> = {}, method = 'POST'): Request {
  return new Request(URL_, { method, headers });
}

const withSecret = { 'x-cron-secret': SECRET };

describe('background-check-purge handler', () => {
  it('answers 503 and runs nothing when CRON_SECRET is not configured', async () => {
    const { deps, candidates, calls } = setup({ noSecret: true, candidates: [FIRST] });
    const res = await handler(post(withSecret), deps);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('cron_not_configured');
    expect(candidates).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('refuses a wrong secret with 401 and runs nothing', async () => {
    const { deps, candidates, calls } = setup({ candidates: [FIRST] });
    const res = await handler(post({ 'x-cron-secret': 'outro-segredo' }), deps);
    expect(res.status).toBe(401);
    expect(candidates).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('refuses a request without the header with 401', async () => {
    const { deps, candidates } = setup({ candidates: [FIRST] });
    const res = await handler(post(), deps);
    expect(res.status).toBe(401);
    expect(candidates).not.toHaveBeenCalled();
  });

  it('does not accept the secret as a Bearer token: only x-cron-secret is read', async () => {
    const { deps, candidates } = setup({ candidates: [FIRST] });
    const res = await handler(post({ Authorization: `Bearer ${SECRET}` }), deps);
    expect(res.status).toBe(401);
    expect(candidates).not.toHaveBeenCalled();
  });

  it('answers 405 to a method other than POST', async () => {
    const { deps, candidates } = setup({ candidates: [FIRST] });
    const res = await handler(post(withSecret, 'GET'), deps);
    expect(res.status).toBe(405);
    expect(candidates).not.toHaveBeenCalled();
  });

  it('removes each file before marking its row, and answers the counts', async () => {
    const { deps, calls } = setup({ candidates: [FIRST, SECOND] });
    const res = await handler(post(withSecret), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { purged: 2, failed: 0 } });
    expect(calls).toEqual([
      `remove:${FIRST.storage_path}`, `mark:${FIRST.id}`,
      `remove:${SECOND.storage_path}`, `mark:${SECOND.id}`,
    ]);
  });

  it('a file that fails to be removed is counted, not marked, and does not stop the others', async () => {
    const { deps, calls, logged } = setup({ candidates: [FIRST, SECOND], removeFails: [FIRST.storage_path] });
    const res = await handler(post(withSecret), deps);
    expect((await res.json()).data).toEqual({ purged: 1, failed: 1 });
    expect(calls).toEqual([`remove:${FIRST.storage_path}`, `remove:${SECOND.storage_path}`, `mark:${SECOND.id}`]);
    expect(logged).toHaveLength(1);
  });

  it('a row whose purge fails after its file is removed is counted as failed and the others still run', async () => {
    const { deps, calls, logged } = setup({ candidates: [FIRST, SECOND], markFails: [FIRST.id] });
    const res = await handler(post(withSecret), deps);
    expect((await res.json()).data).toEqual({ purged: 1, failed: 1 });
    expect(calls).toContain(`remove:${SECOND.storage_path}`);
    expect(calls).toContain(`mark:${SECOND.id}`);
    expect(logged).toHaveLength(1);
  });

  it('answers zero counts when nothing is due', async () => {
    const { deps, calls } = setup({ candidates: [] });
    const res = await handler(post(withSecret), deps);
    expect(await res.json()).toEqual({ ok: true, data: { purged: 0, failed: 0 } });
    expect(calls).toEqual([]);
  });
});
