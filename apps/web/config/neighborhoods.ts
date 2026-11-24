// Neighborhoods for the concierge request form and the SEO pages (no backend). With a
// backend, the list comes from the `neighborhoods` table, whose ids the request needs;
// both are seeded from the same file, data/neighborhoods.json (the 96 districts of São Paulo).

import districts from '../data/neighborhoods.json';

export interface LocalNeighborhood {
  name: string;
  slug: string;
  zone: string;
}

const isNeighborhood = (value: unknown): value is LocalNeighborhood =>
  !!value &&
  typeof value === 'object' &&
  typeof (value as LocalNeighborhood).name === 'string' &&
  typeof (value as LocalNeighborhood).slug === 'string';

const fromDataFile = (): LocalNeighborhood[] =>
  (districts as unknown[]).filter(isNeighborhood).map(n => ({ name: n.name, slug: n.slug, zone: typeof n.zone === 'string' ? n.zone : '' }));

const sortByName = (list: LocalNeighborhood[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

export const LOCAL_NEIGHBORHOODS: LocalNeighborhood[] = sortByName(fromDataFile());

export const DEFAULT_CITY = 'São Paulo';
