// Fixtures and a small in-memory database for the administration tests. It
// extends (does not edit) test/web/fakeSupabase.ts: each test file still calls
// vi.mock('../../lib/supabase') with createAdminFake and then fills a world.
//
// The query builder here understands what the admin services send (eq, in,
// gte, lt, lte, order, range) so filters and pagination are really exercised.
// The rpcs mimic the checks of supabase/migrations/..._11_admin.sql that matter
// to the screens (reason required, admin only).
import { createFakeSupabase, type FakeSupabase, type Result, type TableCall } from '../web/fakeSupabase';

export type Row = Record<string, unknown>;

export const ADMIN_ID = 'a0000000-0000-4000-8000-000000000001';
export const PROVIDER_ID = 'b0000000-0000-4000-8000-000000000002';
export const CLIENT_ID = 'c0000000-0000-4000-8000-000000000003';
export const BOOKING_ID = 'd0000000-0000-4000-8000-000000000004';
export const DOC_ID = 'e0000000-0000-4000-8000-000000000005';
export const DOC2_ID = 'e0000000-0000-4000-8000-000000000006';

export interface RangeCall {
  table: string;
  from: number;
  to: number;
}

export interface AdminFake extends FakeSupabase {
  storage: { from: (bucket: string) => { createSignedUrl: (path: string, seconds: number) => Promise<Result> } };
  ranges: RangeCall[];
  signedUrlCalls: Array<{ bucket: string; path: string; seconds: number }>;
}

/** What the database "contains" in a test; handlers read it on every call, so tests may change it. */
export interface AdminWorld {
  userId: string;
  isAdmin: boolean;
  tables: Record<string, Row[]>;
  /** Makes a table answer with this error instead of data. */
  errors: Record<string, unknown>;
  /** Makes the signed URL request fail with this error. */
  storageError: unknown;
}

const timestampLike = /^\d{4}-\d{2}-\d{2}T/;

const compare = (a: unknown, b: unknown): number => {
  if (typeof a === 'string' && typeof b === 'string' && timestampLike.test(a) && timestampLike.test(b)) {
    return Date.parse(a) - Date.parse(b);
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
};

const matches = (row: Row, [op, column, value]: TableCall['filters'][number]): boolean => {
  const cell = row[column];
  switch (op) {
    case 'eq':
      return cell === value;
    case 'in':
      return (value as unknown[]).includes(cell);
    case 'gte':
      return compare(cell, value) >= 0;
    case 'lt':
      return compare(cell, value) < 0;
    case 'lte':
      return compare(cell, value) <= 0;
    case 'ilike': {
      // %text% with \% \_ \\ as literal characters
      const needle = String(value).replace(/^%|%$/g, '').replace(/\\([\\%_])/g, '$1').toLowerCase();
      return String(cell ?? '').toLowerCase().includes(needle);
    }
    default:
      throw new Error(`fake database: filter ${op} is not implemented`);
  }
};

export const createAdminFake = (world: () => AdminWorld): AdminFake => {
  const fake = createFakeSupabase() as AdminFake;
  fake.ranges = [];
  fake.signedUrlCalls = [];

  fake.from = (table: string) => {
    const call: TableCall = { table, op: 'select', filters: [] };
    const orders: Array<[column: string, ascending: boolean]> = [];
    let range: [number, number] | null = null;

    const filter = (op: string) => (column: string, value: unknown) => {
      call.filters.push([op, column, value]);
      return builder;
    };

    const builder = {
      select(columns?: string) {
        call.columns = columns;
        return builder;
      },
      eq: filter('eq'),
      in: filter('in'),
      gte: filter('gte'),
      lt: filter('lt'),
      lte: filter('lte'),
      ilike: filter('ilike'),
      order(column: string, options?: { ascending?: boolean }) {
        orders.push([column, options?.ascending !== false]);
        return builder;
      },
      range(start: number, end: number) {
        range = [start, end];
        return builder;
      },
      maybeSingle() {
        call.single = 'maybe';
        return builder;
      },
      single() {
        call.single = 'single';
        return builder;
      },
      then<T>(resolve: (value: Result) => T, reject?: (reason: unknown) => T) {
        return Promise.resolve()
          .then((): Result => {
            fake.tableCalls.push(call);
            const w = world();
            if (w.errors[table]) return { data: null, error: w.errors[table] };
            let rows = (w.tables[table] ?? []).filter(row => call.filters.every(f => matches(row, f)));
            for (const [column, ascending] of [...orders].reverse()) {
              rows = [...rows].sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
            }
            if (range) {
              fake.ranges.push({ table, from: range[0], to: range[1] });
              rows = rows.slice(range[0], range[1] + 1);
            }
            return { data: call.single ? rows[0] ?? null : rows, error: null };
          })
          .then(resolve, reject);
      },
    };
    return builder;
  };

  fake.storage = {
    from: bucket => ({
      createSignedUrl: async (path, seconds) => {
        fake.signedUrlCalls.push({ bucket, path, seconds });
        const error = world().storageError;
        if (error) return { data: null, error };
        return { data: { signedUrl: `https://storage.test/${bucket}/${path}?token=abc` }, error: null };
      },
    }),
  };

  return fake;
};

const ok = (data: unknown): Result => ({ data, error: null });
const rule = (code: string, details: string | null = null): Result => ({ data: null, error: { code: 'P0001', message: code, details } });

/** Verification steps of the occupation's policy with no accepted document of the provider. */
const missingSteps = (world: AdminWorld, providerId: unknown, occupation: unknown): string[] => {
  const policy = (world.tables.occupation_policies ?? []).find(r => r.occupation_slug === occupation);
  const accepted = (world.tables.provider_documents ?? []).filter(d => d.provider_id === providerId && d.status === 'accepted');
  return ((policy?.verification ?? []) as string[]).filter(step => !accepted.some(d => d.step === step));
};

/** rpc handlers for the session of the world: is_admin and the admin_* functions. */
export const adminRpcs = (world: AdminWorld): FakeSupabase['rpcs'] => {
  const find = (table: string, predicate: (row: Row) => boolean): Row | undefined => (world.tables[table] ?? []).find(predicate);
  const blank = (value: unknown) => typeof value !== 'string' || value.trim() === '';
  const guard =
    (handler: (args: Record<string, unknown>) => Result) =>
    (args: Record<string, unknown> | undefined): Result =>
      world.isAdmin ? handler(args ?? {}) : rule('not_allowed');

  return {
    is_admin: () => ok(world.isAdmin),
    admin_review_document: guard(args => {
      const doc = find('provider_documents', r => r.id === args.p_document);
      if (!doc) return rule('not_allowed');
      if (args.p_accept === false && blank(args.p_reason)) return rule('not_allowed');
      const wasAccepted = doc.status === 'accepted';
      doc.status = args.p_accept ? 'accepted' : 'rejected';
      doc.rejection_reason = args.p_accept ? null : args.p_reason;
      // Like the database: a document that stops being accepted takes back the approval that depended on it
      if (wasAccepted && !args.p_accept) {
        for (const occ of (world.tables.provider_occupations ?? []).filter(o => o.provider_id === doc.provider_id && o.approved)) {
          if (missingSteps(world, doc.provider_id, occ.occupation_slug).includes(String(doc.step))) occ.approved = false;
        }
      }
      return ok(doc.status);
    }),
    admin_set_registry_status: guard(args => {
      const occ = find('provider_occupations', r => r.provider_id === args.p_provider && r.occupation_slug === args.p_occupation);
      if (!occ) return rule('not_allowed');
      occ.registry_status = args.p_status;
      return ok(args.p_status);
    }),
    admin_set_provider_status: guard(args => {
      const provider = find('providers', r => r.id === args.p_provider);
      if (!provider) return rule('not_allowed');
      const before = provider.status;
      provider.status = args.p_status;
      // Like the database: the first approval approves the occupations whose policy is covered, and only those
      if (args.p_status === 'approved' && (before === 'draft' || before === 'pending_review')) {
        for (const occ of (world.tables.provider_occupations ?? []).filter(o => o.provider_id === args.p_provider)) {
          if (
            !occ.approved &&
            occ.registry_status !== 'rejected' &&
            find('occupation_policies', r => r.occupation_slug === occ.occupation_slug) &&
            missingSteps(world, args.p_provider, occ.occupation_slug).length === 0
          ) {
            occ.approved = true;
          }
        }
      }
      return ok(args.p_status);
    }),
    admin_set_occupation_approval: guard(args => {
      const occ = find('provider_occupations', r => r.provider_id === args.p_provider && r.occupation_slug === args.p_occupation);
      if (!occ) return rule('not_allowed');
      if (args.p_approved) {
        if (occ.registry_status === 'rejected') return rule('not_allowed', 'registry rejected');
        if (!find('occupation_policies', r => r.occupation_slug === args.p_occupation)) return rule('not_allowed', 'policy missing');
        const missing = missingSteps(world, args.p_provider, args.p_occupation);
        if (missing.length > 0) return rule('documents_missing', missing.join(','));
      }
      occ.approved = args.p_approved;
      return ok(args.p_approved);
    }),
    admin_resolve_dispute: guard(args => {
      if (blank(args.p_reason)) return rule('not_allowed');
      world.tables.admin_open_disputes = (world.tables.admin_open_disputes ?? []).filter(r => r.booking_id !== args.p_booking);
      return ok(args.p_to);
    }),
    // Like the database: a reason is required and the payment must have an open entry; the entries leave the view
    admin_review_payment: guard(args => {
      if (blank(args.p_reason)) return rule('not_allowed', 'reason required');
      const open = (world.tables.admin_payments_attention ?? []).filter(r => r.payment_id === args.p_payment);
      if (open.length === 0) return rule('invalid_transition');
      world.tables.admin_payments_attention = (world.tables.admin_payments_attention ?? []).filter(r => r.payment_id !== args.p_payment);
      (world.tables.audit_log ??= []).push({
        id: 9000 + (world.tables.audit_log?.length ?? 0),
        actor_id: world.userId,
        action: 'payment.reviewed',
        entity: 'payments',
        entity_id: args.p_payment,
        data: { reason: String(args.p_reason).trim() },
        at: '2026-10-22T12:00:00Z',
      });
      return ok(true);
    }),
    admin_set_setting: guard(args => {
      const row = find('platform_settings', r => r.key === args.p_key);
      if (row) row.value = args.p_value;
      else (world.tables.platform_settings ??= []).push({ key: args.p_key, value: args.p_value, internal: false, updated_at: null });
      return ok(args.p_value);
    }),
  };
};

export const newWorld = (overrides: Partial<AdminWorld> = {}): AdminWorld => ({
  userId: ADMIN_ID,
  isAdmin: true,
  errors: {},
  storageError: null,
  tables: {
    profiles: [
      { id: ADMIN_ID, full_name: 'Ana Administradora', phone: null, role: 'client', city: 'São Paulo', deleted_at: null, created_at: '2026-10-01T12:00:00Z' },
      { id: PROVIDER_ID, full_name: 'Paulo Prestador', phone: '+5511999990000' },
      { id: CLIENT_ID, full_name: 'Cris Cliente', phone: null },
    ],
    providers: [
      {
        id: PROVIDER_ID,
        display_name: 'Dr. Paulo Cardio',
        slug: 'dr-paulo',
        bio: 'Atendo em consultório.',
        status: 'pending_review',
        plan: 'free',
        created_at: '2026-10-02T15:00:00Z',
      },
    ],
    provider_occupations: [
      {
        provider_id: PROVIDER_ID,
        occupation_slug: 'cardiologista',
        is_primary: true,
        registry_number: '123456',
        registry_uf: 'SP',
        registry_status: 'informed',
        approved: false,
      },
    ],
    occupation_policies: [
      {
        occupation_slug: 'cardiologista',
        regulated: true,
        regulator_body: 'CFM/CRM',
        registry_name: 'CRM',
        legal_basis: 'Lei 3.268/1957',
        verification: ['documento_selfie', 'cadastro_fiscal', 'registro_profissional'],
        sources: [],
      },
    ],
    provider_documents: [
      {
        id: DOC_ID,
        provider_id: PROVIDER_ID,
        step: 'documento_selfie',
        storage_path: `${PROVIDER_ID}/rg-frente.jpg`,
        status: 'submitted',
        reviewed_at: null,
        expires_at: null,
        rejection_reason: null,
        created_at: '2026-10-03T10:00:00Z',
      },
      {
        id: DOC2_ID,
        provider_id: PROVIDER_ID,
        step: 'cadastro_fiscal',
        storage_path: `${PROVIDER_ID}/cnpj.pdf`,
        status: 'accepted',
        reviewed_at: '2026-10-04T10:00:00Z',
        expires_at: null,
        rejection_reason: null,
        created_at: '2026-10-03T11:00:00Z',
      },
    ],
    admin_provider_queue: [
      {
        provider_id: PROVIDER_ID,
        display_name: 'Dr. Paulo Cardio',
        slug: 'dr-paulo',
        status: 'pending_review',
        created_at: '2026-10-02T15:00:00Z',
        full_name: 'Paulo Prestador',
        phone: '+5511999990000',
        occupations: ['cardiologista'],
        registries_to_review: 1,
        occupations_to_approve: 1,
        documents_submitted: 1,
        documents_accepted: 1,
        documents_rejected: 0,
      },
    ],
    admin_open_disputes: [
      {
        booking_id: BOOKING_ID,
        occupation_slug: 'diarista',
        period: '["2026-10-10 16:00:00+00","2026-10-10 20:00:00+00")',
        price_cents: 18000,
        platform_fee_cents: 0,
        origin: 'platform',
        client_id: CLIENT_ID,
        client_name: 'Cris Cliente',
        provider_id: PROVIDER_ID,
        provider_name: 'Dr. Paulo Cardio',
        disputed_at: '2026-10-12T14:00:00Z',
        payment_statuses: ['received'],
      },
    ],
    booking_events: [
      { id: 'ev-1', booking_id: BOOKING_ID, from_status: null, to_status: 'requested', actor_id: CLIENT_ID, reason: null, at: '2026-10-08T12:00:00Z' },
      {
        id: 'ev-2',
        booking_id: BOOKING_ID,
        from_status: 'completed',
        to_status: 'disputed',
        actor_id: CLIENT_ID,
        reason: 'O serviço não foi feito.',
        at: '2026-10-12T14:00:00Z',
      },
    ],
    admin_metrics: [
      { entity: 'requests', status: 'open', this_week: 2, this_month: 5, total: 9 },
      { entity: 'requests', status: 'matched', this_week: 1, this_month: 3, total: 4 },
      { entity: 'bookings', status: 'disputed', this_week: 1, this_month: 1, total: 1 },
      { entity: 'providers', status: 'pending_review', this_week: 1, this_month: 2, total: 2 },
    ],
    platform_settings: [
      { key: 'commission_enabled', value: false, internal: false, updated_at: '2026-10-01T00:00:00Z' },
      { key: 'commission_bps', value: 1200, internal: false, updated_at: '2026-10-01T00:00:00Z' },
      { key: 'escrow_enabled', value: false, internal: false, updated_at: '2026-10-01T00:00:00Z' },
      { key: 'pro_price_cents', value: 4900, internal: false, updated_at: '2026-10-01T00:00:00Z' },
      { key: 'proposal_limit', value: 3, internal: false, updated_at: '2026-10-01T00:00:00Z' },
      { key: 'labor_lock_days_per_week', value: 2, internal: false, updated_at: '2026-10-01T00:00:00Z' },
    ],
    payments: [],
    audit_log: [],
    data_requests: [],
  },
  ...overrides,
});

/** `count` payments, newest first by id, one per hour from 2026-10-10 12:00 UTC backwards. */
export const manyPayments = (count: number, overrides: Row = {}): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `pay-${String(i).padStart(3, '0')}`,
    booking_id: BOOKING_ID,
    quote_id: null,
    provider_id: PROVIDER_ID,
    payer_id: CLIENT_ID,
    method: 'pix',
    amount_cents: 10000 + i,
    platform_fee_cents: 0,
    status: 'received',
    escrow: false,
    due_date: null,
    created_at: new Date(Date.UTC(2026, 9, 10, 12) - i * 3_600_000).toISOString(),
    ...overrides,
  }));

/** The world the fake database reads; tests replace `current.world` in beforeEach. */
export const current: { world: AdminWorld } = { world: newWorld() };
