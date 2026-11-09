import { AppError } from '../lib/errors';
import { toE164BR } from '../lib/phone';
import type { Tables } from '../lib/database.types';
import { db, unwrap, unwrapMaybe } from './client';
import type { BookingStatus, BookingView } from './proAgenda';
import { guard } from './proErrors';
import type { QuoteRow, QuoteStatus } from './quotes';

export type ClientRow = Pick<Tables<'provider_clients'>, 'id' | 'client_id' | 'name' | 'phone' | 'email' | 'notes' | 'origin' | 'created_at'>;

const CLIENT_COLUMNS = 'id, client_id, name, phone, email, notes, origin, created_at';

export interface ClientInput {
  id?: string;
  providerId: string;
  name: string;
  phone?: string;
  email?: string;
  notes?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The provider's CRM, by name. */
export const listClients = (providerId: string): Promise<ClientRow[]> =>
  guard(async () => {
    const rows = unwrap<ClientRow[]>(await db().from('provider_clients').select(CLIENT_COLUMNS).eq('provider_id', providerId).order('name', { ascending: true }));
    return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  });

/**
 * Creates or updates a CRM entry. Only contact data is written: the link to a
 * platform account and the origin belong to the server. The phone is kept in E.164.
 */
export const saveClient = (input: ClientInput): Promise<ClientRow> =>
  guard(async () => {
    const name = input.name.trim();
    if (name.length < 1 || name.length > 200) throw new AppError('invalid_input', { message: 'Informe o nome do cliente.' });
    const typedPhone = input.phone?.trim() ?? '';
    const phone = typedPhone ? toE164BR(typedPhone) : null;
    if (typedPhone && !phone) throw new AppError('invalid_phone');
    const email = input.email?.trim() ?? '';
    if (email && (email.length > 320 || !EMAIL.test(email))) throw new AppError('invalid_email');
    const notes = input.notes?.trim() ?? '';
    if (notes.length > 4000) throw new AppError('invalid_input', { message: 'As anotações podem ter até 4000 caracteres.' });
    const row = { name, phone, email: email || null, notes: notes || null };
    if (input.id) {
      return unwrap<ClientRow>(await db().from('provider_clients').update(row).eq('id', input.id).select(CLIENT_COLUMNS).single());
    }
    return unwrap<ClientRow>(
      await db().from('provider_clients').insert({ ...row, provider_id: input.providerId }).select(CLIENT_COLUMNS).single(),
    );
  });

export const deleteClient = (id: string): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().from('provider_clients').delete().eq('id', id));
  });

/**
 * How many bookings each CRM entry has (all statuses). An entry with bookings or quotes cannot
 * be deleted (the database refuses it), so its history keeps the client's name and the weekly
 * labor limit keeps grouping it.
 */
export const countBookingsByClient = (providerId: string): Promise<Record<string, number>> =>
  guard(async () => {
    const rows = unwrap<Array<{ provider_client_id: string | null }>>(
      await db().from('bookings').select('provider_client_id').eq('provider_id', providerId),
    );
    const counts: Record<string, number> = {};
    for (const row of rows) if (row.provider_client_id) counts[row.provider_client_id] = (counts[row.provider_client_id] ?? 0) + 1;
    return counts;
  });

/** One line of a client's history: a booking or a quote of this provider for this CRM entry. */
export type HistoryEntry = { key: string; at: Date; cents: number } & (
  | { kind: 'booking'; occupationSlug: string; status: BookingStatus }
  | { kind: 'quote'; title: string; status: QuoteStatus }
);

/** The provider's bookings and quotes for one CRM entry, newest first (a booking counts from its start, a quote from its creation). */
export const clientHistory = (clientId: string, bookings: BookingView[], quotes: QuoteRow[]): HistoryEntry[] =>
  [
    ...bookings
      .filter(item => item.provider_client_id === clientId)
      .map((item): HistoryEntry => ({
        key: `booking-${item.id}`,
        at: item.period.start,
        cents: item.price_cents,
        kind: 'booking',
        occupationSlug: item.occupation_slug,
        status: item.status,
      })),
    ...quotes
      .filter(item => item.provider_client_id === clientId)
      .map((item): HistoryEntry => ({
        key: `quote-${item.id}`,
        at: new Date(item.created_at),
        cents: item.total_cents,
        kind: 'quote',
        title: item.title,
        status: item.status,
      })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
