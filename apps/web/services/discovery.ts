import { AppError, toAppError } from '../lib/errors';
import { formatTstzRange, parseTstzRange, type Period } from '../lib/tstzrange';
import { db, unwrapMaybe } from './client';
import type { PriceUnit } from '../catalog/types';

/** Registry states a public page may show (a rejected registry never reaches the page). */
export type PublicRegistryStatus = 'not_required' | 'informed' | 'confirmed';

/** One row of search_providers. Ratings are null when the occupation does not rank by rating. */
export interface ProviderSummary {
  provider_id: string;
  display_name: string;
  slug: string;
  bio: string | null;
  avatar_path: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  price_min_cents: number | null;
  price_max_cents: number | null;
  unit: PriceUnit | null;
  registry_status: PublicRegistryStatus | null;
}

export const SEARCH_PAGE_SIZE = 20;

export interface SearchProvidersInput {
  occupation: string;
  /** neighborhoods.id; omitted = any neighborhood. */
  neighborhoodId?: string | null;
  limit?: number;
  offset?: number;
}

export const searchProviders = async (input: SearchProvidersInput): Promise<ProviderSummary[]> => {
  const data = unwrapMaybe<unknown>(
    await db().rpc('search_providers', {
      p_occupation: input.occupation,
      p_neighborhood: input.neighborhoodId || null,
      p_limit: input.limit ?? SEARCH_PAGE_SIZE,
      p_offset: input.offset ?? 0,
    }),
  );
  return Array.isArray(data) ? (data as ProviderSummary[]) : [];
};

export interface PageOccupation {
  slug: string;
  name: string;
  is_primary: boolean;
  registry_name: string | null;
  registry_number: string | null;
  registry_uf: string | null;
  registry_status: PublicRegistryStatus;
  /** False when the occupation's rules do not allow public ratings. */
  rating_ranking: boolean;
}

export interface PageService {
  id: string;
  occupation_slug: string;
  title: string;
  description: string | null;
  price_min_cents: number;
  price_max_cents: number | null;
  unit: PriceUnit;
  duration_minutes: number | null;
}

export interface PageAvailability {
  weekday: number;
  /** "HH:MM:SS" */
  start_time: string;
  end_time: string;
}

export interface PageReview {
  rating: number;
  comment: string | null;
  occupation_slug: string;
  created_at: string;
}

export interface PageNeighborhood {
  id: string;
  name: string;
  slug: string;
  zone?: string | null;
}

export interface ProviderPage {
  provider: {
    id: string;
    display_name: string;
    slug: string;
    bio: string | null;
    avatar_path: string | null;
    base_neighborhood: PageNeighborhood | null;
  };
  occupations: PageOccupation[];
  neighborhoods: PageNeighborhood[];
  services: PageService[];
  availability: PageAvailability[];
  reviews: PageReview[];
}

const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);

/** Public page of an approved provider, or null when the slug is unknown or the provider is not approved. */
export const getProviderPage = async (slug: string): Promise<ProviderPage | null> => {
  const data = unwrapMaybe<Record<string, unknown>>(await db().rpc('get_provider_page', { p_slug: slug }));
  if (!data || typeof data !== 'object' || !data.provider) return null;
  return {
    provider: data.provider as ProviderPage['provider'],
    occupations: list<PageOccupation>(data.occupations),
    neighborhoods: list<PageNeighborhood>(data.neighborhoods),
    services: list<PageService>(data.services),
    availability: list<PageAvailability>(data.availability),
    reviews: list<PageReview>(data.reviews),
  };
};

/** Free periods of a provider on a São Paulo calendar day ("YYYY-MM-DD"), earliest first. */
export const availableSlots = async (providerId: string, day: string, durationMinutes: number): Promise<Period[]> => {
  const data = unwrapMaybe<unknown>(
    await db().rpc('available_slots', { p_provider: providerId, p_day: day, p_duration_minutes: durationMinutes }),
  );
  if (!Array.isArray(data)) return [];
  return data.flatMap(item => {
    const period = typeof item === 'string' ? parseTstzRange(item) : null;
    return period ? [period] : [];
  });
};

export interface DirectBooking {
  providerId: string;
  serviceId: string;
  period: Period;
  notes?: string;
}

export const NOTES_MAX = 2000;

/** Asks for a booking in a free slot; the provider still has to accept it. Returns the booking id. */
export const bookDirect = async (input: DirectBooking): Promise<string> => {
  const notes = input.notes?.trim() ?? '';
  if (notes.length > NOTES_MAX) throw new AppError('invalid_input');
  let range: string;
  try {
    range = formatTstzRange(input.period);
  } catch {
    throw new AppError('invalid_input');
  }
  try {
    const data = unwrapMaybe<unknown>(
      await db().rpc('book_direct', {
        p_provider: input.providerId,
        p_service: input.serviceId,
        p_period: range,
        p_notes: notes || null,
      }),
    );
    if (typeof data !== 'string') throw new AppError('server_error');
    return data;
  } catch (err) {
    // booking_limit (too many open requests) and slot_unavailable come translated by lib/errors
    throw toAppError(err);
  }
};
