import { AppError } from '../lib/errors';
import { db, unwrapMaybe } from './client';
import { lineCents } from './quoteMath';

export type PublicQuoteStatus = 'draft' | 'sent' | 'accepted' | 'declined' | 'expired';

export interface QuoteItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
}

/** What get_quote_by_token shows to whoever holds the link (no data of other clients). */
export interface PublicQuote {
  id: string;
  title: string;
  client_name: string | null;
  items: QuoteItem[];
  total_cents: number;
  /** Plain date "YYYY-MM-DD", valid through the end of that day in São Paulo. */
  valid_until: string | null;
  notes: string | null;
  /** Already `expired` when it was sent and the validity passed. */
  status: PublicQuoteStatus;
  created_at: string;
  provider: { display_name: string; slug: string; avatar_path: string | null; page_public: boolean };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isQuoteToken = (value: string): boolean => UUID.test(value);

/** Quote by its public link token, or null if there is none (also for a malformed token). */
export const getQuoteByToken = async (token: string): Promise<PublicQuote | null> => {
  if (!isQuoteToken(token)) return null;
  const data = unwrapMaybe<PublicQuote>(await db().rpc('get_quote_by_token', { p_token: token }));
  if (!data || typeof data !== 'object') return null;
  return { ...data, items: Array.isArray(data.items) ? data.items : [] };
};

/** Accepts or declines a sent quote that is still valid. Returns the new status. */
export const respondQuote = async (token: string, accept: boolean): Promise<'accepted' | 'declined'> => {
  if (!isQuoteToken(token)) throw new AppError('not_found');
  const data = unwrapMaybe<unknown>(await db().rpc('respond_quote', { p_token: token, p_accept: accept }));
  return data === 'accepted' || data === 'declined' ? data : accept ? 'accepted' : 'declined';
};

/** Line total in cents (quantity may be fractional, e.g. 2.5 hours), rounded as the database does. */
export const lineTotalCents = (item: QuoteItem): number => lineCents(item.quantity, item.unit_price_cents);
