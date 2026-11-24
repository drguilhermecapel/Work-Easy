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

type Policies = Record<string, OccupationPolicy>;

// The rules are loaded per area (policiesByArea.ts cuts policies.json at build time): the page of a
// service or an area reads one small module instead of the 1.8 MB of every rule.
const areaPolicies = new Map<string, Promise<Policies>>();

/**
 * The policies of the occupations of one area, loaded once on demand. Pair with React's `use` inside a
 * Suspense boundary. An unknown area gives an empty set.
 */
export const loadAreaPolicies = (areaSlug: string): Promise<Policies> => {
  let promise = areaPolicies.get(areaSlug);
  if (!promise) {
    promise = import('virtual:policies-by-area').then(async ({ default: loaders }) => {
      const load = loaders[areaSlug];
      return load ? (await load()).default : {};
    });
    areaPolicies.set(areaSlug, promise);
  }
  return promise;
};

let allPolicies: Promise<Policies> | undefined;

/**
 * Every policy: the areas are fetched together and merged. For the few screens that need rules of
 * occupations of several areas (the care line, the registry of a provider); a page about one area or
 * one service uses loadAreaPolicies.
 */
export const loadPolicies = (): Promise<Policies> =>
  (allPolicies ??= import('virtual:policies-by-area').then(async ({ default: loaders }) => {
    const parts = await Promise.all(Object.keys(loaders).map(slug => loadAreaPolicies(slug)));
    return Object.assign({}, ...parts) as Policies;
  }));
