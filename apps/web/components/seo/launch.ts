import { LOCAL_NEIGHBORHOODS } from '../../config/neighborhoods';
import { launchNeighborhoods, occupationLabel } from '../../catalog/prose.mjs';
import { OCCUPATIONS, findArea } from '../../catalog';
import type { Occupation } from '../../catalog/types';

/** Neighborhoods that have a static page, from the same data scripts/prerender.mjs reads. */
export const LAUNCH_NEIGHBORHOODS = launchNeighborhoods(LOCAL_NEIGHBORHOODS);

const normalize = (text: string): string => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const nameCount = new Map<string, number>();
for (const occupation of OCCUPATIONS) nameCount.set(normalize(occupation.name), (nameCount.get(normalize(occupation.name)) ?? 0) + 1);

/** Name of an occupation in titles: two occupations with the same name get their area appended, as in the prerendered titles. */
export const labelOf = (occupation: Occupation): string =>
  occupationLabel(occupation.name, findArea(occupation.areaSlug)?.name ?? '', (nameCount.get(normalize(occupation.name)) ?? 0) > 1);
