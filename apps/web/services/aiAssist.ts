import { PRICE_UNIT_LABELS } from '../catalog/labels';
import type { PriceUnit } from '../catalog/types';
import { AppError, toAppErrorAsync } from '../lib/errors';
import { invokeFunction } from './client';
import { serverCodeOf } from './proErrors';
import { centsToInput } from './proFormat';

// The two server-side AI assists (supabase/functions/quote-assist and care-summary; contract in
// docs/arquitetura/ia-no-servidor.md). The model runs on the server: the app only sends the text
// and shows what comes back. Nothing returned here is saved: the screens fill a form the person
// edits (quote items) or show a summary that is not kept (week of the care line).

// ---- Errors ---------------------------------------------------------------------------------

// The sentence of each code the assists answer; the screen adds what the person can do instead.
const ASSIST_MESSAGES: Record<string, string> = {
  assist_not_configured: 'A IA ainda não está ativada neste ambiente.',
  assist_rate_limited: 'Você usou todos os pedidos de IA desta hora. Tente de novo mais tarde.',
  assist_declined: 'A IA não conseguiu usar este texto.',
  assist_unavailable: 'A IA não conseguiu responder agora.',
  assist_busy: 'A IA está ocupada no momento. Tente de novo em instantes.',
  assist_timeout: 'A IA demorou para responder.',
};

const assistError = async (err: unknown, instead: string): Promise<AppError> => {
  const error = await toAppErrorAsync(err);
  const code = await serverCodeOf(error);
  const message = code ? ASSIST_MESSAGES[code] : undefined;
  return message ? new AppError(error.code, { cause: error.cause, detail: error.detail, message: `${message} ${instead}` }) : error;
};

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// ---- Quote items (provider) -------------------------------------------------------------------

/** The units of the catalog plus "unidade" for pieces and materials (same list as quote-assist). */
export type QuoteUnit = PriceUnit | 'unidade';

export interface QuoteSuggestionItem {
  description: string;
  quantity: number;
  unit: QuoteUnit;
  /** Only ever the price of a reference the provider passed; null when none applies. */
  unit_price_cents: number | null;
}

export interface QuoteSuggestion {
  /** Opening text for the quote. */
  intro: string;
  items: QuoteSuggestionItem[];
  notice: string;
}

export interface ReferencePrice {
  label: string;
  unit_price_cents: number;
  unit?: PriceUnit;
}

export interface QuoteAssistInput {
  description: string;
  occupationSlug?: string | null;
  referencePrices?: ReferencePrice[];
}

export const QUOTE_ASSIST_LIMITS = { descriptionMin: 10, descriptionMax: 2000, referencePrices: 20, labelMax: 80 } as const;

const NOTES_MAX = 4000;
const MANUAL_QUOTE = 'Monte os itens manualmente.';

const isQuoteSuggestion = (value: unknown): value is QuoteSuggestion =>
  isRecord(value) &&
  typeof value.intro === 'string' &&
  Array.isArray(value.items) &&
  value.items.every(
    item =>
      isRecord(item) &&
      typeof item.description === 'string' &&
      typeof item.quantity === 'number' &&
      typeof item.unit === 'string' &&
      (item.unit_price_cents === null || typeof item.unit_price_cents === 'number'),
  );

/** Asks the server for a draft of quote items. Nothing is saved or sent to anyone. */
export const suggestQuote = async (input: QuoteAssistInput): Promise<QuoteSuggestion> => {
  const description = input.description.trim();
  if (description.length < QUOTE_ASSIST_LIMITS.descriptionMin) {
    throw new AppError('invalid_input', { message: `Descreva o serviço com pelo menos ${QUOTE_ASSIST_LIMITS.descriptionMin} caracteres.` });
  }
  if (description.length > QUOTE_ASSIST_LIMITS.descriptionMax) {
    throw new AppError('invalid_input', { message: `A descrição pode ter até ${QUOTE_ASSIST_LIMITS.descriptionMax} caracteres.` });
  }
  const references = (input.referencePrices ?? []).slice(0, QUOTE_ASSIST_LIMITS.referencePrices).map(price => ({
    label: price.label.trim().slice(0, QUOTE_ASSIST_LIMITS.labelMax),
    unit_price_cents: price.unit_price_cents,
    ...(price.unit ? { unit: price.unit } : {}),
  }));
  try {
    const answer = await invokeFunction<unknown>('quote-assist', {
      description,
      ...(input.occupationSlug ? { occupation_slug: input.occupationSlug } : {}),
      ...(references.length > 0 ? { reference_prices: references } : {}),
    });
    if (!isQuoteSuggestion(answer)) throw new AppError('server_error');
    return answer;
  } catch (err) {
    throw await assistError(err, MANUAL_QUOTE);
  }
};

/** What the quote form keeps for an item (all text, as the person would type it). */
export interface SuggestedDraft {
  description: string;
  quantity: string;
  /** Empty when the server proposed no price: the provider has to type it. */
  price: string;
}

/** The unit has no field in the form: it goes at the end of the description ("Pintura (por m²)"). */
const describedWithUnit = (description: string, unit: QuoteUnit): string =>
  unit === 'unidade' || !(unit in PRICE_UNIT_LABELS) ? description : `${description} (${PRICE_UNIT_LABELS[unit]})`;

export const suggestionDrafts = (suggestion: QuoteSuggestion): SuggestedDraft[] =>
  suggestion.items.map(item => ({
    description: describedWithUnit(item.description, item.unit),
    quantity: String(item.quantity).replace('.', ','),
    price: item.unit_price_cents === null ? '' : centsToInput(item.unit_price_cents),
  }));

/**
 * The notes with the intro in front of what the provider already wrote. The same intro is not
 * added twice, and nothing the provider typed is cut: past the limit of the field the notes stay as they are.
 */
export const withIntro = (notes: string, intro: string): string => {
  const text = intro.trim();
  if (!text || notes.includes(text)) return notes;
  const joined = notes.trim() ? `${text}\n\n${notes}` : text;
  return joined.length <= NOTES_MAX ? joined : notes;
};

// ---- Summary of the week (family) ---------------------------------------------------------------

export interface WeekSummary {
  /** Plain dates ("2026-10-12") of the window, São Paulo calendar. */
  period: { from: string; to: string };
  /** Shifts of the week that started (or had a no-show). */
  shifts: number;
  /** Reports whose text the summary used. */
  reports_used: number;
  /** Reports not sent to the AI because they mention health. */
  reports_omitted: number;
  /** Shifts that started and have no report. */
  reports_missing: number;
  /** Shifts left out because the week was larger than the limits. */
  reports_truncated: number;
  /** Null when there was nothing to summarize (no call to the AI was made). */
  summary: { overview: string; activities: string[]; routine: string[]; follow_up: string[] } | null;
  mentions_health: boolean;
  notice: string;
  /** The 192/SAMU guidance, written by the server, when a report touches health. */
  health_notice: string | null;
}

const isStrings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');

const isWeekSummary = (value: unknown): value is WeekSummary =>
  isRecord(value) &&
  isRecord(value.period) &&
  typeof value.period.from === 'string' &&
  typeof value.period.to === 'string' &&
  ['shifts', 'reports_used', 'reports_omitted', 'reports_missing', 'reports_truncated'].every(key => typeof value[key] === 'number') &&
  typeof value.mentions_health === 'boolean' &&
  typeof value.notice === 'string' &&
  (value.health_notice === null || typeof value.health_notice === 'string') &&
  (value.summary === null ||
    (isRecord(value.summary) &&
      typeof value.summary.overview === 'string' &&
      isStrings(value.summary.activities) &&
      isStrings(value.summary.routine) &&
      isStrings(value.summary.follow_up)));

/** Asks the server for the summary of the last 7 days of a house of the signed-in family. Nothing is kept. */
export const summarizeWeek = async (householdId: string): Promise<WeekSummary> => {
  try {
    const answer = await invokeFunction<unknown>('care-summary', { household_id: householdId });
    if (!isWeekSummary(answer)) throw new AppError('server_error');
    return answer;
  } catch (err) {
    throw await assistError(err, 'Leia os relatórios abaixo.');
  }
};
