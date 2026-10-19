import areasData from './areas.json';
import { AREA_ICONS, FALLBACK_ICON } from './icons';
import type { Area, Occupation, OccupationPolicy } from './types';

// areas.json is the light index the home, search and category pages need on
// first load. policies.json holds the per-occupation rules and is loaded only
// by the pages that show them.

export const AREAS: Area[] = areasData.areas.map(area => ({
  slug: area.slug,
  name: area.name,
  description: area.description,
  icon: AREA_ICONS[area.icon] ?? FALLBACK_ICON,
  occupations: area.occupations.map(o => ({ ...o, areaSlug: area.slug })),
}));

export const OCCUPATIONS: Occupation[] = AREAS.flatMap(area => area.occupations);

const areasBySlug = new Map(AREAS.map(area => [area.slug, area]));
const occupationsBySlug = new Map(OCCUPATIONS.map(o => [o.slug, o]));

export const findArea = (slug: string | null | undefined): Area | undefined =>
  slug ? areasBySlug.get(slug) : undefined;

export const findOccupation = (slug: string | null | undefined): Occupation | undefined =>
  slug ? occupationsBySlug.get(slug) : undefined;

/** Areas shown on the home page before "Ver todas"; the launch categories first. */
export const FEATURED_AREA_SLUGS = ['cuidados', 'limpeza', 'reformas', 'eletricista', 'beleza', 'aulas', 'health', 'pets', 'autos', 'tecnologia', 'eventos'];

export const featuredAreas = (): Area[] =>
  FEATURED_AREA_SLUGS.map(slug => areasBySlug.get(slug)).filter((area): area is Area => Boolean(area));

let policiesPromise: Promise<Record<string, OccupationPolicy>> | undefined;

/** Per-occupation policy, loaded once on demand. Pair with React's `use` inside a Suspense boundary. */
export const loadPolicies = (): Promise<Record<string, OccupationPolicy>> =>
  (policiesPromise ??= import('./policies.json').then(
    module => module.default as unknown as Record<string, OccupationPolicy>,
  ));
