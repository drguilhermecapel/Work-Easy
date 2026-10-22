import { features } from '../config/features';
import { AppError } from '../lib/errors';
import { formatCents } from '../lib/money';
import { toE164BR } from '../lib/phone';
import type { Tables } from '../lib/database.types';
import { db, unwrap, unwrapMaybe } from './client';
import { guard } from './proErrors';
import { MAX_TOTAL_CENTS, itemsTotalCents } from './quoteMath';

export interface QuoteItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
}

export type QuoteStatus = Tables<'quotes'>['status'];

export interface QuoteRow {
  id: string;
  provider_id: string;
  provider_client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  title: string;
  items: QuoteItem[];
  total_cents: number;
  valid_until: string | null;
  notes: string | null;
  status: QuoteStatus;
  public_token: string;
  created_at: string;
  updated_at: string;
}

const QUOTE_COLUMNS =
  'id, provider_id, provider_client_id, client_name, client_phone, title, items, total_cents, valid_until, notes, status, public_token, created_at, updated_at';

/** Preview of the total the server computes on save (sum of quantity x unit price, rounded per item as the database does). */
export const quoteTotalCents = (items: QuoteItem[]): number => itemsTotalCents(items);

/** The total goes into an `int` column: past this the database fails with an error the screen could not explain. */
export const TOTAL_LIMIT_MESSAGE = `O total do orçamento passa do limite de ${formatCents(MAX_TOTAL_CENTS)}. Reduza quantidades ou preços.`;

/** A quantity typed as plain decimal text ("2", "2,5", "0.75"); "0x10" or "1e9" are not quantities. */
export const parseQuantity = (text: string): number | null => {
  const value = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(value)) return null;
  const quantity = Number(value);
  return quantity > 0 ? quantity : null;
};

/** The quote is "sent" in the database until the scheduler expires it; the validity day ends at midnight in São Paulo. */
export const effectiveQuoteStatus = (quote: Pick<QuoteRow, 'status' | 'valid_until'>, today: string): QuoteStatus =>
  quote.status === 'sent' && quote.valid_until !== null && quote.valid_until < today ? 'expired' : quote.status;

export interface QuoteInput {
  id?: string;
  providerId: string;
  providerClientId: string | null;
  clientName: string;
  clientPhone: string;
  title: string;
  items: QuoteItem[];
  /** "YYYY-MM-DD" or empty. */
  validUntil: string;
  notes: string;
}

export const MAX_ITEMS = 200;

const validate = (input: QuoteInput): void => {
  const title = input.title.trim();
  if (title.length < 2 || title.length > 200) {
    throw new AppError('invalid_input', { message: 'O título do orçamento precisa ter de 2 a 200 caracteres.' });
  }
  if (input.items.length === 0) throw new AppError('invalid_input', { message: 'Inclua pelo menos um item no orçamento.' });
  if (input.items.length > MAX_ITEMS) throw new AppError('invalid_input', { message: `Um orçamento pode ter até ${MAX_ITEMS} itens.` });
  for (const item of input.items) {
    if (!item.description.trim()) throw new AppError('invalid_input', { message: 'Todos os itens precisam de descrição.' });
    if (!(item.quantity > 0) || !Number.isFinite(item.quantity)) {
      throw new AppError('invalid_input', { message: 'A quantidade de cada item precisa ser maior que zero.' });
    }
    if (!Number.isSafeInteger(item.unit_price_cents) || item.unit_price_cents < 0) {
      throw new AppError('invalid_input', { message: 'Confira o preço unitário de cada item.' });
    }
  }
  if (quoteTotalCents(input.items) > MAX_TOTAL_CENTS) throw new AppError('invalid_input', { message: TOTAL_LIMIT_MESSAGE });
  if (input.clientName.trim().length > 200 || input.notes.trim().length > 4000) throw new AppError('invalid_input');
};

export const listQuotes = (providerId: string): Promise<QuoteRow[]> =>
  guard(async () =>
    unwrap<QuoteRow[]>(
      await db().from('quotes').select(QUOTE_COLUMNS).eq('provider_id', providerId).order('created_at', { ascending: false }),
    ),
  );

/** Saves a draft (or edits one that was sent). The total is computed by the server. */
export const saveQuote = (input: QuoteInput): Promise<QuoteRow> =>
  guard(async () => {
    validate(input);
    const typedPhone = input.clientPhone.trim();
    const phone = typedPhone ? toE164BR(typedPhone) : null;
    if (typedPhone && !phone) throw new AppError('invalid_phone');
    const row = {
      provider_client_id: input.providerClientId,
      client_name: input.clientName.trim() || null,
      client_phone: phone,
      title: input.title.trim(),
      items: input.items.map(item => ({
        description: item.description.trim(),
        quantity: item.quantity,
        unit_price_cents: item.unit_price_cents,
      })),
      valid_until: input.validUntil || null,
      notes: input.notes.trim() || null,
    };
    if (input.id) {
      return unwrap<QuoteRow>(await db().from('quotes').update(row).eq('id', input.id).select(QUOTE_COLUMNS).single());
    }
    return unwrap<QuoteRow>(
      await db().from('quotes').insert({ ...row, provider_id: input.providerId, status: 'draft' }).select(QUOTE_COLUMNS).single(),
    );
  });

/** The provider moves a quote between draft and sent; accepted/declined come from the client's link. */
export const setQuoteStatus = (id: string, status: 'draft' | 'sent'): Promise<QuoteRow> =>
  guard(async () => unwrap<QuoteRow>(await db().from('quotes').update({ status }).eq('id', id).select(QUOTE_COLUMNS).single()));

/** Only drafts can be deleted. */
export const deleteQuote = (id: string): Promise<void> =>
  guard(async () => {
    unwrapMaybe<unknown>(await db().from('quotes').delete().eq('id', id));
  });

// ---- Sharing ------------------------------------------------------------------

/** Public address of the quote (/orcamento/<token>), on the canonical site when configured. */
export const quoteShareUrl = (token: string): string => {
  const base = features.siteUrl ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/orcamento/${token}`;
};

export const quoteShareText = (quote: Pick<QuoteRow, 'title' | 'client_name' | 'total_cents' | 'public_token'>): string => {
  const greeting = quote.client_name ? `Olá, ${quote.client_name}!` : 'Olá!';
  return `${greeting} Segue o orçamento "${quote.title}", no valor de ${formatCents(quote.total_cents)}: ${quoteShareUrl(quote.public_token)}`;
};

/** wa.me link with the text ready; with the client's phone it opens that chat, else the user picks the contact. */
export const quoteWhatsAppUrl = (quote: Pick<QuoteRow, 'title' | 'client_name' | 'client_phone' | 'total_cents' | 'public_token'>): string => {
  const phone = quote.client_phone ? toE164BR(quote.client_phone) : null;
  const target = phone ? phone.replace('+', '') : '';
  return `https://wa.me/${target}?text=${encodeURIComponent(quoteShareText(quote))}`;
};
