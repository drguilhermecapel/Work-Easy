// Extends the shared Supabase stand-in (test/web/fakeSupabase.ts) with a small
// in-memory care line: households, care recipients, shifts, offers, check-ins
// and reports, plus the RPCs of 09_care.sql that the screens call. The RPCs
// mirror the rules that matter to the tests (first to accept wins, 2-hour
// check-in window, ownership); everything else is scripted through the world.
// Imports no app code except constants, so the vi.mock factory can load it.
import { CONSENT_VERSIONS } from '../../config/legal';
import { profileRow, type FakeSupabase, type Result, type TableCall } from '../web/fakeSupabase';

export { profileRow };
export type { FakeSupabase, Result, TableCall };

export const FAMILY_ID = 'family-1';
export const CAREGIVER_ID = 'cg-1';
export const OTHER_CAREGIVER_ID = 'cg-2';

type Row = Record<string, unknown>;

export const ok = (data: unknown): Result => ({ data, error: null });

/** The database raises a rule as `raise exception 'labor_lock'` (errcode P0001): PostgREST returns it as the message. */
export const ruleError = (code: string): Result => ({ data: null, error: { code: 'P0001', message: code, details: null, hint: null } });

/** Postgres prints a tstzrange like this. */
export const pgRange = (start: Date, end: Date): string => {
  const text = (d: Date) => `"${d.toISOString().replace('T', ' ').replace('.000Z', '+00')}"`;
  return `[${text(start)},${text(end)})`;
};

export const HOUR = 3_600_000;

export const acceptedTerms = (userId: string): Row[] =>
  (['terms', 'privacy'] as const).map(purpose => ({
    id: `c-${purpose}`,
    user_id: userId,
    purpose,
    version: CONSENT_VERSIONS[purpose],
    granted: true,
    at: '2030-01-01T10:00:00Z',
  }));

export interface CareWorld {
  /** The signed-in user. */
  userId: string;
  /** Provider record of the signed-in user (a caregiver); null for the family. */
  provider: Row | null;
  now: () => number;
  households: Row[];
  recipients: Row[];
  shifts: Row[];
  offers: Row[];
  checkins: Row[];
  reports: Row[];
  consents: Row[];
  /** What search_providers answers. */
  caregivers: Row[];
  /** occupation_policies rows */
  policies: Row[];
  neighborhoods: Row[];
  profiles: Row[];
  /** providers rows the signed-in user may read besides its own (a counterpart: the caregiver of the family's shift). */
  providerRows: Row[];
  /** occupations rows (slug, name): what the catalog of the app may not know. */
  occupations: Row[];
  settings: Row[];
  /** A table answers with this error instead of data. */
  tableErrors: Record<string, unknown>;
  /** An RPC answers with this rule error (code) instead of running. */
  rpcErrors: Record<string, string>;
  counter: number;
}

export const newWorld = (userId: string = FAMILY_ID): CareWorld => ({
  userId,
  provider: null,
  now: () => Date.now(),
  households: [],
  recipients: [],
  shifts: [],
  offers: [],
  checkins: [],
  reports: [],
  consents: acceptedTerms(userId),
  caregivers: [],
  policies: [{ occupation_slug: 'cuidador-de-idosos', price_units: ['plantao'] }, { occupation_slug: 'diarista', price_units: ['servico'] }],
  neighborhoods: [
    { id: 'nb-lapa', city: 'São Paulo', name: 'Lapa', slug: 'lapa', zone: 'Oeste' },
    { id: 'nb-moema', city: 'São Paulo', name: 'Moema', slug: 'moema', zone: 'Sul' },
  ],
  profiles: [{ id: FAMILY_ID, full_name: 'Maria Família' }],
  providerRows: [],
  occupations: [],
  settings: [],
  tableErrors: {},
  rpcErrors: {},
  counter: 0,
});

export const approvedProvider = (id: string): Row => ({
  id,
  display_name: 'Ana Cuidadora',
  slug: 'ana-cuidadora',
  bio: null,
  avatar_path: null,
  status: 'approved',
  plan: 'free',
  base_neighborhood_id: null,
  accepts_platform_requests: true,
  created_at: '2030-01-01T00:00:00Z',
});

export const household = (overrides: Row = {}): Row => ({
  id: 'house-1',
  owner_id: FAMILY_ID,
  name: 'Casa da vó',
  neighborhood_id: 'nb-lapa',
  notes: null,
  created_at: '2030-01-01T10:00:00Z',
  ...overrides,
});

export const recipient = (overrides: Row = {}): Row => ({
  id: 'rec-1',
  household_id: 'house-1',
  first_name: 'Lúcia',
  birth_year: 1940,
  preferences: 'Gosta de rádio',
  emergency_contact: 'Filho 11 90000-0000',
  created_at: '2030-01-01T10:00:00Z',
  ...overrides,
});

/** A shift row as the family reads it. Defaults: 2030-01-15 08:00-20:00 in São Paulo (11:00-23:00 UTC). */
export const shiftRow = (overrides: Row = {}): Row => ({
  id: 'shift-1',
  household_id: 'house-1',
  care_recipient_id: 'rec-1',
  provider_id: null,
  period: pgRange(new Date('2030-01-15T11:00:00Z'), new Date('2030-01-15T23:00:00Z')),
  rate_cents: 28000,
  caregiver_payout_cents: 28000,
  status: 'open',
  notes: null,
  created_at: '2030-01-10T12:00:00Z',
  ...overrides,
});

const parseRange = (text: unknown): { start: number; end: number } => {
  const match = /^[[(]"?([^",]+)"?,"?([^",)\]]+)"?[)\]]$/.exec(String(text));
  if (!match) throw new Error(`bad range ${String(text)}`);
  const at = (value: string) => new Date(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')).getTime();
  return { start: at(match[1]), end: at(match[2]) };
};

const matches = (call: TableCall, row: Row): boolean =>
  call.filters.every(([op, column, value]) => {
    if (op === 'eq') return row[column] === value;
    if (op === 'in') return (value as unknown[]).includes(row[column]);
    return true;
  });

/** select / insert / update / delete over an array that lives in the world (read again on every call). */
const crud = (call: TableCall, get: () => Row[], set: (rows: Row[]) => void, make: () => Row): Result => {
  const rows = get();
  const hit = rows.filter(row => matches(call, row));
  switch (call.op) {
    case 'insert': {
      const row = { ...make(), ...(call.payload as Row) };
      set([...rows, row]);
      return ok(call.single ? row : [row]);
    }
    case 'update':
      for (const row of hit) Object.assign(row, call.payload as Row);
      return ok(call.single ? (hit[0] ?? null) : hit);
    case 'delete':
      set(rows.filter(row => !hit.includes(row)));
      return ok(null);
    default:
      return ok(call.single ? (hit[0] ?? null) : hit);
  }
};

/** Table handlers for `world.userId`; assign to `fake.tables`. */
export const careTables = (world: CareWorld): FakeSupabase['tables'] => {
  const next = (prefix: string) => `${prefix}-${++world.counter}`;
  const guard =
    (table: string, handler: (call: TableCall) => Result) =>
    (call: TableCall): Result =>
      world.tableErrors[table] ? { data: null, error: world.tableErrors[table] } : handler(call);

  return {
    profiles: guard('profiles', call =>
      call.single && call.filters.some(([, column, value]) => column === 'id' && value === world.userId)
        ? ok(profileRow(world.userId))
        : ok(world.profiles.filter(row => matches(call, row))),
    ),
    providers: guard('providers', call =>
      call.single ? ok(world.provider && matches(call, world.provider) ? world.provider : null) : ok(world.providerRows.filter(row => matches(call, row))),
    ),
    occupations: guard('occupations', call => ok(world.occupations.filter(row => matches(call, row)))),
    consents: guard('consents', call =>
      crud(call, () => world.consents, rows => (world.consents = rows), () => ({ id: next('consent'), at: '2030-01-02T10:00:00Z' })),
    ),
    households: guard('households', call =>
      crud(call, () => world.households, rows => (world.households = rows), () => ({ id: next('house'), created_at: '2030-01-02T10:00:00Z' })),
    ),
    care_recipients: guard('care_recipients', call =>
      crud(call, () => world.recipients, rows => (world.recipients = rows), () => ({ id: next('rec'), created_at: '2030-01-02T10:00:00Z' })),
    ),
    shifts: guard('shifts', call =>
      crud(
        call,
        () => world.shifts,
        rows => (world.shifts = rows),
        () => ({ id: next('shift'), provider_id: null, status: 'open', created_at: '2030-01-02T10:00:00Z' }),
      ),
    ),
    shift_offers: guard('shift_offers', call => crud(call, () => world.offers, rows => (world.offers = rows), () => ({}))),
    checkins: guard('checkins', call => crud(call, () => world.checkins, rows => (world.checkins = rows), () => ({}))),
    daily_reports: guard('daily_reports', call => crud(call, () => world.reports, rows => (world.reports = rows), () => ({}))),
    occupation_policies: guard('occupation_policies', () => ok(world.policies)),
    neighborhoods: guard('neighborhoods', () => ok(world.neighborhoods)),
    platform_settings: guard('platform_settings', () => ok(world.settings)),
  };
};

const shiftOf = (world: CareWorld, id: unknown): Row | undefined => world.shifts.find(s => s.id === id);

/** The RPCs of the care line, with the rules of 09_care.sql that the tests rely on. */
export const careRpcs = (world: CareWorld): FakeSupabase['rpcs'] => {
  const refuse = (name: string): Result | null => (world.rpcErrors[name] ? ruleError(world.rpcErrors[name]) : null);

  return {
    is_admin: () => ok(false),

    search_providers: args => {
      const slug = args?.p_occupation;
      return ok(
        world.caregivers
          .filter(c => c.occupation === slug)
          .map(c => {
            const row = { ...c };
            delete row.occupation;
            return row;
          }),
      );
    },

    offer_shift: args =>
      refuse('offer_shift') ??
      (() => {
        const shift = shiftOf(world, args?.p_shift);
        if (!shift) return ruleError('not_allowed');
        for (const providerId of args?.p_providers as string[]) {
          const existing = world.offers.find(o => o.shift_id === shift.id && o.provider_id === providerId);
          if (existing) existing.status = 'offered';
          else world.offers.push({ shift_id: shift.id, provider_id: providerId, status: 'offered', created_at: '2030-01-03T10:00:00Z' });
        }
        shift.status = 'offered';
        return ok(world.offers.filter(o => o.shift_id === shift.id && o.status === 'offered').length);
      })(),

    caregiver_shifts: () =>
      ok(
        world.shifts
          .map(shift => {
            const offer = world.offers.find(o => o.shift_id === shift.id && o.provider_id === world.userId);
            const mine = shift.provider_id === world.userId;
            const open = offer?.status === 'offered' && shift.status === 'offered';
            if (!mine && !open) return null;
            const home = world.households.find(h => h.id === shift.household_id);
            const person = world.recipients.find(r => r.id === shift.care_recipient_id);
            return {
              shift_id: shift.id,
              period: shift.period,
              status: shift.status,
              offer_status: offer?.status ?? null,
              caregiver_payout_cents: shift.caregiver_payout_cents,
              notes: shift.notes,
              neighborhood_name: world.neighborhoods.find(n => n.id === home?.neighborhood_id)?.name ?? null,
              recipient_first_name: person?.first_name ?? null,
            };
          })
          .filter(Boolean),
      ),

    accept_shift_offer: args =>
      refuse('accept_shift_offer') ??
      (() => {
        const shift = shiftOf(world, args?.p_shift);
        const offer = world.offers.find(o => o.shift_id === args?.p_shift && o.provider_id === world.userId);
        if (!shift || offer?.status !== 'offered') return ruleError('not_allowed');
        if (shift.status !== 'offered') return ruleError('invalid_transition');
        shift.provider_id = world.userId;
        shift.status = 'assigned';
        for (const o of world.offers.filter(item => item.shift_id === shift.id && item.status === 'offered')) {
          o.status = o.provider_id === world.userId ? 'accepted' : 'expired';
        }
        return ok('assigned');
      })(),

    check_in: args =>
      refuse('check_in') ??
      (() => {
        const shift = shiftOf(world, args?.p_shift);
        const kind = args?.p_kind;
        if (!shift || shift.provider_id !== world.userId || (kind !== 'in' && kind !== 'out')) return ruleError('not_allowed');
        if ((kind === 'in' && shift.status !== 'assigned') || (kind === 'out' && shift.status !== 'checked_in')) {
          return ruleError('invalid_transition');
        }
        const range = parseRange(shift.period);
        if (Math.abs(world.now() - (kind === 'in' ? range.start : range.end)) > 2 * HOUR) return ruleError('checkin_window');
        const row = {
          id: `checkin-${world.checkins.length + 1}`,
          shift_id: shift.id,
          provider_id: world.userId,
          kind,
          at: new Date(world.now()).toISOString(),
          lat: args?.p_lat ?? null,
          lng: args?.p_lng ?? null,
        };
        world.checkins.push(row);
        shift.status = kind === 'in' ? 'checked_in' : 'completed';
        return ok(row.id);
      })(),

    submit_daily_report: args =>
      refuse('submit_daily_report') ??
      (() => {
        const shift = shiftOf(world, args?.p_shift);
        if (!shift || shift.provider_id !== world.userId || !['checked_in', 'completed'].includes(String(shift.status))) {
          return ruleError('not_allowed');
        }
        world.reports = world.reports.filter(r => r.shift_id !== shift.id);
        const row = {
          id: `report-${world.reports.length + 1}`,
          shift_id: shift.id,
          provider_id: world.userId,
          meals: args?.p_meals ?? null,
          activities: args?.p_activities ?? null,
          mood: args?.p_mood ?? null,
          notes: args?.p_notes ?? null,
          created_at: new Date(world.now()).toISOString(),
        };
        world.reports.push(row);
        return ok(row.id);
      })(),

    cancel_shift: args =>
      refuse('cancel_shift') ??
      (() => {
        const shift = shiftOf(world, args?.p_shift);
        if (!shift) return ruleError('not_allowed');
        if (shift.provider_id === world.userId) {
          if (shift.status !== 'assigned') return ruleError('invalid_transition');
          for (const o of world.offers.filter(item => item.shift_id === shift.id)) {
            if (o.provider_id === world.userId) o.status = 'declined';
            else if (o.status === 'expired') o.status = 'offered';
          }
          shift.provider_id = null;
          shift.status = world.offers.some(o => o.shift_id === shift.id && o.status === 'offered') ? 'offered' : 'open';
          return ok(shift.status);
        }
        if (!world.households.some(h => h.id === shift.household_id && h.owner_id === world.userId)) return ruleError('not_allowed');
        if (!['open', 'offered', 'assigned'].includes(String(shift.status))) return ruleError('invalid_transition');
        shift.status = 'canceled';
        for (const o of world.offers.filter(item => item.shift_id === shift.id && item.status === 'offered')) o.status = 'expired';
        return ok('canceled');
      })(),
  };
};

/** Sets up `fake` for the signed-in `world.userId`. */
export const useWorld = (fake: FakeSupabase, world: CareWorld): void => {
  fake.tables = careTables(world);
  fake.rpcs = careRpcs(world);
  fake.session = { access_token: 't', user: { id: world.userId, email: 'a@example.com' } };
};

export const isRpc = (fake: FakeSupabase, name: string) => fake.rpcCalls.filter(call => call.name === name);

/** Simulated navigator.geolocation: answers with a position, or fails with a GeolocationPositionError code. */
export const mockGeolocation = (answer: { lat: number; lng: number } | { code: 1 | 2 | 3 }) => {
  const calls: Array<PositionOptions | undefined> = [];
  const geolocation = {
    getCurrentPosition: (success: PositionCallback, failure?: PositionErrorCallback, options?: PositionOptions) => {
      calls.push(options);
      if ('code' in answer) {
        failure?.({ code: answer.code, message: 'x', PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      } else {
        success({ coords: { latitude: answer.lat, longitude: answer.lng, accuracy: 5 }, timestamp: 0 } as GeolocationPosition);
      }
    },
  };
  Object.defineProperty(navigator, 'geolocation', { value: geolocation, configurable: true });
  return { calls };
};

export const removeGeolocation = () => {
  Object.defineProperty(navigator, 'geolocation', { value: undefined, configurable: true });
};
