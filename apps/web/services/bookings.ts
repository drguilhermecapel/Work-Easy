import { AppError } from '../lib/errors';
import { parseTstzRange, type Period } from '../lib/tstzrange';
import { db, invokeFunction, unwrap, unwrapMaybe } from './client';

export type BookingStatus =
  | 'requested'
  | 'accepted'
  | 'paid'
  | 'in_progress'
  | 'completed'
  | 'released'
  | 'canceled'
  | 'disputed';

export type BookingOrigin = 'platform' | 'own';

/** bookings, only the columns the screens use. */
export interface BookingRow {
  id: string;
  client_id: string | null;
  provider_id: string | null;
  occupation_slug: string;
  service_id: string | null;
  /** tstzrange text, e.g. `["2030-01-01 12:00:00+00","2030-01-01 13:00:00+00")` */
  period: string;
  price_cents: number;
  status: BookingStatus;
  origin: BookingOrigin;
  notes: string | null;
  canceled_reason: string | null;
  created_at: string;
}

export interface BookingEventRow {
  id: string;
  booking_id: string;
  from_status: BookingStatus | null;
  to_status: BookingStatus;
  actor_id: string | null;
  reason: string | null;
  at: string;
}

export type BookingRole = 'client' | 'provider';

export interface BookingView extends BookingRow {
  /** Parsed `period`; null if the database text could not be read. */
  when: Period | null;
  /** Role of the signed-in user in this booking; null for someone else (e.g. an administrator). */
  role: BookingRole | null;
  /** Public name of the other party when RLS lets this user read it. */
  counterpart_name: string | null;
  counterpart_slug: string | null;
}

const BOOKING_COLUMNS =
  'id, client_id, provider_id, occupation_slug, service_id, period, price_cents, status, origin, notes, canceled_reason, created_at';
const EVENT_COLUMNS = 'id, booking_id, from_status, to_status, actor_id, reason, at';

export const roleIn = (booking: Pick<BookingRow, 'client_id' | 'provider_id'>, userId: string): BookingRole | null => {
  if (booking.client_id === userId) return 'client';
  if (booking.provider_id === userId) return 'provider';
  return null;
};

/** Adds role and the other party's name. Names are a separate best-effort read: RLS may hide them. */
const withParties = async (rows: BookingRow[], userId: string): Promise<BookingView[]> => {
  const asClient = rows.filter(r => roleIn(r, userId) === 'client' && r.provider_id);
  const asProvider = rows.filter(r => roleIn(r, userId) === 'provider' && r.client_id);
  const providers = new Map<string, { display_name: string; slug: string }>();
  const clients = new Map<string, string>();

  const providerIds = [...new Set(asClient.map(r => r.provider_id as string))];
  if (providerIds.length > 0) {
    const { data } = await db().from('providers').select('id, display_name, slug').in('id', providerIds);
    for (const p of (data ?? []) as Array<{ id: string; display_name: string; slug: string }>) providers.set(p.id, p);
  }
  const clientIds = [...new Set(asProvider.map(r => r.client_id as string))];
  if (clientIds.length > 0) {
    const { data } = await db().from('profiles').select('id, full_name').in('id', clientIds);
    for (const p of (data ?? []) as Array<{ id: string; full_name: string | null }>) if (p.full_name) clients.set(p.id, p.full_name);
  }

  return rows.map(row => {
    const role = roleIn(row, userId);
    const provider = role === 'client' && row.provider_id ? providers.get(row.provider_id) : undefined;
    return {
      ...row,
      when: parseTstzRange(row.period),
      role,
      counterpart_name: provider?.display_name ?? (role === 'provider' && row.client_id ? clients.get(row.client_id) ?? null : null),
      counterpart_slug: provider?.slug ?? null,
    };
  });
};

/** Bookings the user takes part in as client or provider (RLS), newest first. */
export const listMyBookings = async (userId: string): Promise<BookingView[]> => {
  const rows = unwrap<BookingRow[]>(await db().from('bookings').select(BOOKING_COLUMNS).order('created_at', { ascending: false }));
  return withParties(rows, userId);
};

export const getBooking = async (id: string, userId: string): Promise<BookingView> => {
  const row = unwrapMaybe<BookingRow>(await db().from('bookings').select(BOOKING_COLUMNS).eq('id', id).maybeSingle());
  if (!row) throw new AppError('not_found');
  const [view] = await withParties([row], userId);
  return view;
};

/** Status history of a booking, oldest first. */
export const listBookingEvents = async (bookingId: string): Promise<BookingEventRow[]> =>
  unwrap<BookingEventRow[]>(
    await db().from('booking_events').select(EVENT_COLUMNS).eq('booking_id', bookingId).order('at', { ascending: true }),
  );

/** Shown when the open charge of a canceled booking could not be canceled right away. */
export const CHARGE_VOID_NOTICE = 'A cobrança em aberto será cancelada em breve.';

/**
 * After a cancellation: asks payments-void to cancel the charge still open for
 * the booking. Never throws: the cancellation already happened and stays. Returns
 * the notice to show when the call failed, null when it worked.
 */
export const voidOpenCharges = async (bookingId: string): Promise<string | null> => {
  try {
    await invokeFunction('payments-void', { booking_id: bookingId });
    return null;
  } catch {
    return CHARGE_VOID_NOTICE;
  }
};

export interface TransitionResult {
  status: BookingStatus;
  /** A warning about something that did not finish (the cancellation itself did). */
  notice: string | null;
}

/**
 * The only way to change a booking's status (the database checks who may do
 * what: invalid_transition and not_allowed come back translated). A
 * cancellation is followed by the cancellation of the open charge; `from` is the
 * status before, since a booking that was only requested never had a charge.
 */
export const transitionBooking = async (
  bookingId: string,
  to: BookingStatus,
  reason?: string,
  from?: BookingStatus,
): Promise<TransitionResult> => {
  const text = reason?.trim();
  const data = unwrapMaybe<unknown>(
    await db().rpc('transition_booking', { p_booking: bookingId, p_to: to, p_reason: text ? text : null }),
  );
  const status = typeof data === 'string' ? (data as BookingStatus) : to;
  const notice = status === 'canceled' && from !== 'requested' ? await voidOpenCharges(bookingId) : null;
  return { status, notice };
};

/** The client may dispute a completed booking until 7 days after it ends (same rule as the database). */
export const DISPUTE_WINDOW_DAYS = 7;

export const canStillDispute = (booking: Pick<BookingView, 'when'>, now: number): boolean =>
  booking.when !== null && now <= booking.when.end.getTime() + DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** Transitions each role may ask for, from the rules in docs/ARQUITETURA.md (the database has the last word). */
export const ALLOWED_TRANSITIONS: Record<BookingRole, Partial<Record<BookingStatus, BookingStatus[]>>> = {
  provider: {
    requested: ['accepted', 'canceled'],
    accepted: ['in_progress', 'canceled'],
    paid: ['in_progress'],
    in_progress: ['completed'],
  },
  client: {
    requested: ['canceled'],
    accepted: ['canceled'],
    completed: ['released', 'disputed'],
  },
};

export const allowedNext = (role: BookingRole | null, status: BookingStatus): BookingStatus[] =>
  role ? (ALLOWED_TRANSITIONS[role][status] ?? []) : [];
