// Extends the shared Supabase stand-in (test/web/fakeSupabase.ts) with what the
// Pro area needs: Storage, ready-made table handlers for a signed-in provider
// and builders for database and Edge Function failures. Imports no app code, so
// the vi.mock factory of lib/supabase can load it.
import { CONSENT_VERSIONS } from '../../config/legal';
import { createFakeSupabase, profileRow, type FakeSupabase, type Result, type TableCall, type TableHandler } from '../web/fakeSupabase';

export { isEq, profileRow } from '../web/fakeSupabase';
export type { FakeSupabase, Result, TableCall, TableHandler };

export interface Upload {
  bucket: string;
  path: string;
  file: unknown;
  options: unknown;
}

export interface ProFake extends FakeSupabase {
  uploads: Upload[];
  removed: Array<{ bucket: string; paths: string[] }>;
  /** Set to make the next uploads fail. */
  uploadError: unknown;
  storage: {
    from: (bucket: string) => {
      upload: (path: string, file: unknown, options?: unknown) => Promise<{ data: unknown; error: unknown }>;
      remove: (paths: string[]) => Promise<{ data: unknown; error: unknown }>;
    };
  };
}

export const createProFake = (): ProFake => {
  const base = createFakeSupabase();
  const fake = base as ProFake;
  fake.uploads = [];
  fake.removed = [];
  fake.uploadError = null;
  fake.storage = {
    from: bucket => ({
      async upload(path, file, options) {
        if (fake.uploadError) return { data: null, error: fake.uploadError };
        fake.uploads.push({ bucket, path, file, options });
        return { data: { path }, error: null };
      },
      async remove(paths) {
        fake.removed.push({ bucket, paths });
        return { data: [], error: null };
      },
    }),
  };
  const baseReset = base.reset;
  fake.reset = () => {
    baseReset();
    fake.uploads = [];
    fake.removed = [];
    fake.uploadError = null;
  };
  return fake;
};

export const USER_ID = 'prov-1';

export const ok = (data: unknown): Result => ({ data, error: null });

/** The database raises a rule as `raise exception 'labor_lock'` (errcode P0001): PostgREST returns it as the message. */
export const ruleError = (code: string, details?: string): Result => ({
  data: null,
  error: { code: 'P0001', message: code, details: details ?? null, hint: null },
});

/** An Edge Function answered { ok: false, error } with an HTTP error status. */
export const functionError = (status: number, code: string, message = 'Erro'): Result => ({
  data: null,
  error: {
    name: 'FunctionsHttpError',
    message: 'Edge Function returned a non-2xx status code',
    context: new Response(JSON.stringify({ ok: false, error: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } }),
  },
});

/** An Edge Function answered { ok: true, data }. */
export const functionData = (data: unknown): Result => ok({ ok: true, data });

export const providerRow = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  display_name: 'Ana Souza',
  slug: 'ana-souza',
  bio: null,
  avatar_path: null,
  status: 'approved',
  plan: 'free',
  base_neighborhood_id: null,
  accepts_platform_requests: true,
  created_at: '2026-10-01T12:00:00Z',
  ...overrides,
});

export const acceptedConsents = (userId = USER_ID) =>
  (['terms', 'privacy'] as const).map(purpose => ({
    id: `c-${purpose}`,
    user_id: userId,
    purpose,
    version: CONSENT_VERSIONS[purpose],
    granted: true,
    at: '2026-10-01T10:00:00Z',
  }));

export const occupationRow = (slug: string, overrides: Record<string, unknown> = {}) => ({
  occupation_slug: slug,
  is_primary: true,
  registry_number: null,
  registry_uf: null,
  registry_status: 'not_required',
  approved: true,
  ...overrides,
});

export const policyRow = (slug: string, overrides: Record<string, unknown> = {}) => ({
  occupation_slug: slug,
  regulated: false,
  regulator_body: '',
  registry_name: '',
  verification: ['documento_selfie', 'cadastro_fiscal'],
  price_units: ['dia'],
  labor_lock: false,
  ...overrides,
});

export const NEIGHBORHOODS = [
  { id: 'nb-lapa', city: 'São Paulo', name: 'Lapa', slug: 'lapa', zone: 'Oeste' },
  { id: 'nb-pinheiros', city: 'São Paulo', name: 'Pinheiros', slug: 'pinheiros', zone: 'Oeste' },
  { id: 'nb-santana', city: 'São Paulo', name: 'Santana', slug: 'santana', zone: 'Norte' },
];

export interface ProTables {
  /** null = the user is not a provider yet. */
  provider: ReturnType<typeof providerRow> | null;
}

/**
 * Handlers for the reads every Pro screen makes (profile, provider, consents,
 * policies, neighborhoods). A test overrides or adds the tables it exercises.
 */
export const baseTables = ({ provider }: ProTables): Record<string, TableHandler> => ({
  profiles: () => ({ data: profileRow(USER_ID, { role: provider ? 'provider' : 'client' }), error: null }),
  providers: () => ok(provider),
  consents: (call: TableCall) =>
    call.op === 'insert' ? ok({ id: 'c-new', at: '2026-10-22T12:00:00Z', ...(call.payload as object) }) : ok(acceptedConsents()),
  neighborhoods: () => ok(NEIGHBORHOODS),
});

export const signInProvider = (fake: FakeSupabase): void => {
  fake.session = { access_token: 'test-token', user: { id: USER_ID, email: 'ana@example.com' } };
};
