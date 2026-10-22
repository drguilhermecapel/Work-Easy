// Fixtures and table handlers for the client-journey tests. They extend (do not
// edit) test/web/fakeSupabase.ts: each test file still calls vi.mock('../../lib/supabase')
// with createFakeSupabase, then asks this module for the handlers.
import { CONSENT_VERSIONS } from '../../config/legal';
import { isEq, profileRow, type FakeSupabase, type Result, type TableCall } from '../web/fakeSupabase';

export { isEq, profileRow };
export type { FakeSupabase, TableCall };

export const CLIENT_ID = 'client-1';
export const PROVIDER_ID = 'prov-1';

type Row = Record<string, unknown>;

/** Period text as Postgres prints a tstzrange (end of the period 2030-01-15 13:00-14:00 in São Paulo = 16:00-17:00 UTC). */
export const PERIOD = '["2030-01-15 16:00:00+00","2030-01-15 17:00:00+00")';
/** A period that ended long ago, to test the 7-day dispute window. */
export const OLD_PERIOD = '["2020-01-15 16:00:00+00","2020-01-15 17:00:00+00")';

export const bookingRow = (overrides: Row = {}): Row => ({
  id: 'book-1',
  client_id: CLIENT_ID,
  provider_id: PROVIDER_ID,
  occupation_slug: 'diarista',
  service_id: 'svc-1',
  period: PERIOD,
  price_cents: 18000,
  status: 'accepted',
  origin: 'platform',
  notes: null,
  canceled_reason: null,
  created_at: '2030-01-10T12:00:00Z',
  ...overrides,
});

export const paymentRow = (overrides: Row = {}): Row => ({
  id: 'pay-1',
  booking_id: 'book-1',
  method: 'pix',
  amount_cents: 18000,
  status: 'received',
  escrow: false,
  invoice_url: null,
  pix_qr_code: null,
  pix_payload: null,
  due_date: null,
  created_at: '2030-01-11T12:00:00Z',
  ...overrides,
});

export const acceptedTerms = (userId: string): Row[] =>
  (['terms', 'privacy'] as const).map(purpose => ({
    id: `c-${purpose}`,
    user_id: userId,
    purpose,
    version: CONSENT_VERSIONS[purpose],
    granted: true,
    at: '2030-01-01T10:00:00Z',
  }));

/** What the database "contains" in a test; handlers read it on every call, so tests may change it. */
export interface World {
  userId: string;
  bookings: Row[];
  events: Row[];
  payments: Row[];
  reviews: Row[];
  providers: Row[];
  profiles: Row[];
  settings: Row[];
  neighborhoods: Row[];
  /** Makes a table answer with this error instead of data. */
  errors: Record<string, unknown>;
}

export const newWorld = (userId: string = CLIENT_ID): World => ({
  userId,
  bookings: [],
  events: [],
  payments: [],
  reviews: [],
  providers: [{ id: PROVIDER_ID, display_name: 'Ana Diarista', slug: 'ana-diarista' }],
  profiles: [{ id: CLIENT_ID, full_name: 'Maria Cliente' }],
  settings: [],
  neighborhoods: [
    { id: 'nb-lapa', city: 'São Paulo', name: 'Lapa', slug: 'lapa', zone: 'Oeste' },
    { id: 'nb-moema', city: 'São Paulo', name: 'Moema', slug: 'moema', zone: 'Sul' },
  ],
  errors: {},
});

const found = (call: TableCall, rows: Row[]): Result => {
  const id = call.filters.find(([op, column]) => op === 'eq' && column === 'id')?.[2];
  const bookingId = call.filters.find(([op, column]) => op === 'eq' && column === 'booking_id')?.[2];
  const ids = call.filters.find(([op, column]) => op === 'in' && column === 'id')?.[2] as unknown[] | undefined;
  let result = rows;
  if (id !== undefined) result = result.filter(r => r.id === id);
  if (bookingId !== undefined) result = result.filter(r => r.booking_id === bookingId);
  if (ids) result = result.filter(r => ids.includes(r.id));
  if (call.single) return { data: result[0] ?? null, error: null };
  return { data: result, error: null };
};

/** Table handlers for the session of `world.userId`; assign to `fake.tables`. */
export const worldTables = (world: World): FakeSupabase['tables'] => {
  const guard =
    (table: string, handler: (call: TableCall) => Result) =>
    (call: TableCall): Result =>
      world.errors[table] ? { data: null, error: world.errors[table] } : handler(call);

  return {
    profiles: guard('profiles', call =>
      call.single ? { data: profileRow(world.userId), error: null } : found(call, world.profiles),
    ),
    // AuthContext asks for the user's own provider row (eq id = user); counterpart reads use `in`
    providers: guard('providers', call =>
      call.filters.some(([op]) => op === 'in') ? found(call, world.providers) : { data: null, error: null },
    ),
    consents: guard('consents', call =>
      call.op === 'insert'
        ? { data: { id: 'c-new', at: '2030-01-01T12:00:00Z', ...(call.payload as object) }, error: null }
        : { data: acceptedTerms(world.userId), error: null },
    ),
    bookings: guard('bookings', call => found(call, world.bookings)),
    booking_events: guard('booking_events', call => found(call, world.events)),
    payments: guard('payments', call => found(call, world.payments)),
    reviews: guard('reviews', call => {
      if (call.op === 'insert') {
        const row = { id: 'rev-new', published: true, created_at: '2030-02-01T12:00:00Z', provider_id: PROVIDER_ID, ...(call.payload as Row) };
        world.reviews.push(row);
        return { data: row, error: null };
      }
      return found(call, world.reviews);
    }),
    platform_settings: guard('platform_settings', () => ({ data: world.settings, error: null })),
    neighborhoods: guard('neighborhoods', () => ({ data: world.neighborhoods, error: null })),
  };
};

export const noAdmin = { is_admin: () => ({ data: false, error: null }) } satisfies FakeSupabase['rpcs'];
