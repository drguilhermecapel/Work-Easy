import { AppError } from '../lib/errors';
import { formatTstzRange, parseTstzRange, type Period } from '../lib/tstzrange';
import { saoPauloDateTime } from '../lib/timezone';
import type { Tables } from '../lib/database.types';
import { voidOpenCharges } from './bookings';
import { db, unwrap, unwrapMaybe } from './client';
import { guard } from './proErrors';
import { addDays, shortTime, toPeriod } from './proFormat';

export type AvailabilityRow = Pick<Tables<'availability'>, 'id' | 'weekday' | 'start_time' | 'end_time'>;

export interface TimeOffEntry {
  id: string;
  period: Period;
}

export type BookingStatus = Tables<'bookings'>['status'];

export interface BookingRow {
  id: string;
  client_id: string | null;
  provider_client_id: string | null;
  occupation_slug: string;
  period: string;
  price_cents: number;
  status: BookingStatus;
  origin: 'platform' | 'own';
  platform_fee_cents: number;
  notes: string | null;
  canceled_reason: string | null;
  created_at: string;
}

/** A booking with its parsed period and the client's name, when readable. */
export interface BookingView extends Omit<BookingRow, 'period'> {
  period: Period;
  clientName: string | null;
}

const BOOKING_COLUMNS =
  'id, client_id, provider_client_id, occupation_slug, period, price_cents, status, origin, platform_fee_cents, notes, canceled_reason, created_at';

// ---- Weekly availability ------------------------------------------------------

export const listAvailability = (providerId: string): Promise<AvailabilityRow[]> =>
  guard(async () =>
    unwrap<AvailabilityRow[]>(
      await db().from('availability').select('id, weekday, start_time, end_time').eq('provider_id', providerId).order('weekday', { ascending: true }),
    ).map(row => ({ ...row, start_time: shortTime(row.start_time), end_time: shortTime(row.end_time) })),
  );

/** Weekly window in São Paulo time ("HH:MM"); weekday 0 is Sunday. */
export const addAvailability = (input: { providerId: string; weekday: number; start: string; end: string }): Promise<void> =>
  guard(async () => {
    if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) throw new AppError('invalid_input');
    if (!/^\d{2}:\d{2}$/.test(input.start) || !/^\d{2}:\d{2}$/.test(input.end)) {
      throw new AppError('invalid_input', { message: 'Informe o horário de início e de término.' });
    }
    if (input.start >= input.end) throw new AppError('invalid_input', { message: 'O horário de término precisa ser depois do início.' });
    unwrapMaybe<unknown>(
      await db().from('availability').insert({ provider_id: input.providerId, weekday: input.weekday, start_time: input.start, end_time: input.end }),
    );
  });

export const removeAvailability = (id: string): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().from('availability').delete().eq('id', id));
  });

// ---- Time off -----------------------------------------------------------------

export const listTimeOff = (providerId: string): Promise<TimeOffEntry[]> =>
  guard(async () => {
    const rows = unwrap<Array<{ id: string; period: string }>>(
      await db().from('time_off').select('id, period').eq('provider_id', providerId).order('created_at', { ascending: true }),
    );
    return rows.flatMap(row => {
      const period = parseTstzRange(row.period);
      return period ? [{ id: row.id, period }] : [];
    });
  });

/** Whole days off, from the first day to the last (both included), in São Paulo time. */
export const addTimeOff = (input: { providerId: string; fromDay: string; toDay: string }): Promise<void> =>
  guard(async () => {
    const start = saoPauloDateTime(input.fromDay, '00:00');
    const end = saoPauloDateTime(addDays(input.toDay, 1), '00:00');
    if (!start || !end) throw new AppError('invalid_input', { message: 'Informe o primeiro e o último dia da folga.' });
    if (end.getTime() <= start.getTime()) throw new AppError('invalid_input', { message: 'O último dia não pode ser antes do primeiro.' });
    unwrapMaybe<unknown>(await db().from('time_off').insert({ provider_id: input.providerId, period: formatTstzRange({ start, end }) }));
  });

export const removeTimeOff = (id: string): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().from('time_off').delete().eq('id', id));
  });

// ---- Bookings -----------------------------------------------------------------

/** Names of platform clients, when the database lets this provider read them. */
const platformClientNames = async (ids: string[]): Promise<Map<string, string>> => {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  try {
    const { data } = await db().from('profiles').select('id, full_name').in('id', ids);
    for (const row of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
      if (row.full_name) names.set(row.id, row.full_name);
    }
  } catch {
    // Without names the list still works
  }
  return names;
};

/** The provider's bookings, soonest first, with each client's name from the CRM (or the profile for platform clients). */
export const listMyBookings = (providerId: string): Promise<BookingView[]> =>
  guard(async () => {
    const rows = unwrap<BookingRow[]>(
      await db().from('bookings').select(BOOKING_COLUMNS).eq('provider_id', providerId).order('created_at', { ascending: false }).limit(500),
    );
    const crmIds = [...new Set(rows.map(row => row.provider_client_id).filter((id): id is string => Boolean(id)))];
    const crm = new Map<string, string>();
    if (crmIds.length > 0) {
      const { data } = await db().from('provider_clients').select('id, name').eq('provider_id', providerId).in('id', crmIds);
      for (const row of (data ?? []) as Array<{ id: string; name: string }>) crm.set(row.id, row.name);
    }
    const accountIds = [...new Set(rows.filter(row => !row.provider_client_id && row.client_id).map(row => row.client_id as string))];
    const accounts = await platformClientNames(accountIds);
    return rows
      .flatMap(row => {
        const period = parseTstzRange(row.period);
        if (!period) return [];
        const clientName =
          (row.provider_client_id ? crm.get(row.provider_client_id) : undefined) ?? (row.client_id ? accounts.get(row.client_id) : undefined) ?? null;
        return [{ ...row, period, clientName }];
      })
      .sort((a, b) => a.period.start.getTime() - b.period.start.getTime());
  });

export interface NewOwnBooking {
  providerClientId: string;
  occupationSlug: string;
  day: string;
  start: string;
  end: string;
  priceCents: number;
  notes?: string;
}

/** The provider's own appointment with a CRM client: no commission, but the weekly labor rule still applies. */
export const createOwnBooking = (input: NewOwnBooking): Promise<string | null> =>
  guard(async () => {
    if (!input.providerClientId) throw new AppError('invalid_input', { message: 'Escolha o cliente.' });
    if (!input.occupationSlug) throw new AppError('invalid_input', { message: 'Escolha a ocupação do atendimento.' });
    if (!Number.isSafeInteger(input.priceCents) || input.priceCents < 0) {
      throw new AppError('invalid_input', { message: 'Informe o valor combinado.' });
    }
    const period = toPeriod(input.day, input.start, input.end);
    const data = unwrapMaybe<unknown>(
      await db().rpc('create_own_booking', {
        p_provider_client: input.providerClientId,
        p_occupation: input.occupationSlug,
        p_period: formatTstzRange(period),
        p_price_cents: input.priceCents,
        p_notes: input.notes?.trim() || null,
      }),
    );
    return typeof data === 'string' ? data : null;
  });

/**
 * The only way to change a booking's status (the database checks who may do which move).
 * A cancellation is followed by the cancellation of the open charge (`from`: the status before;
 * a booking that was only requested never had one). Returns a warning to show, or null.
 */
export const transitionBooking = (bookingId: string, to: BookingStatus, reason?: string, from?: BookingStatus): Promise<string | null> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().rpc('transition_booking', { p_booking: bookingId, p_to: to, p_reason: reason?.trim() || null }));
    return to === 'canceled' && from !== 'requested' ? voidOpenCharges(bookingId) : null;
  });
