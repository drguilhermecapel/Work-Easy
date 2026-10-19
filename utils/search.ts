import { Provider } from '../types';

export interface ProviderFilter {
  query?: string;
  categorySlug?: string | null;
}

const normalize = (text: string): string =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

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
