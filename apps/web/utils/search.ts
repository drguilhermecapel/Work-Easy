import { Provider } from '../types';
import type { Occupation } from '../catalog/types';

export interface ProviderFilter {
  query?: string;
  categorySlug?: string | null;
}

export const normalize = (text: string): string =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const occupationScore = (occupation: Occupation, q: string): number => {
  const name = normalize(occupation.name);
  const synonyms = occupation.synonyms.map(normalize);
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (synonyms.includes(q)) return 70;
  if (name.split(/[\s/(),-]+/).some(word => word.startsWith(q))) return 60;
  if (synonyms.some(s => s.startsWith(q))) return 50;
  if (synonyms.some(s => s.includes(q))) return 40;
  if (name.includes(q)) return 30;
  return 0;
};

/**
 * Occupations matching what the client typed, best match first: the name,
 * then synonyms ("faxina" finds Diarista), ignoring case and accents.
 */
export const searchOccupations = (occupations: Occupation[], query: string, limit = 8): Occupation[] => {
  const q = normalize(query.trim());
  if (q.length < 2) return [];
  return occupations
    .map(occupation => ({ occupation, score: occupationScore(occupation, q) }))
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score || a.occupation.name.localeCompare(b.occupation.name, 'pt-BR'))
    .slice(0, limit)
    .map(match => match.occupation);
};

/** Text search (accent- and case-insensitive) plus category filter by slug. */
export const filterProviders = (providers: Provider[], { query = '', categorySlug }: ProviderFilter): Provider[] => {
  const q = normalize(query.trim());

  return providers.filter(p => {
    const matchesQuery =
      !q ||
      [
        p.name,
        p.title,
        ...p.services.map(s => s.title),
        ...(p.medicalInfo?.specialties ?? []),
      ].some(field => normalize(field).includes(q));

    const matchesCategory = !categorySlug || p.services.some(s => s.category === categorySlug);

    return matchesQuery && matchesCategory;
  });
};

/** Health professionals open the dedicated doctor profile; everyone else the general one. */
export const profilePath = (provider: Provider): string =>
  provider.medicalInfo ? `/doctor/${provider.id}` : `/profile/${provider.id}`;
