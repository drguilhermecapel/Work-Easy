// Types of catalog/prose.mjs (plain ESM, so that scripts/prerender.mjs can import it under bare Node).

export interface ProseOccupation {
  name: string;
  synonyms?: readonly string[];
}

export interface ProseArea {
  name: string;
  description: string;
}

/** The fields of OccupationPolicy (catalog/types.ts) that the prose reads. */
export interface ProsePolicy {
  regulated: boolean;
  regulatorBody: string;
  registryName: string;
  legalBasis: string;
  verification: readonly string[];
  backgroundCheck: boolean;
  billing: string;
  ratingRanking: boolean;
  laborLock: boolean;
  providerType: string;
  audienceMinors: boolean;
  priceUnits: readonly string[];
  locations: readonly string[];
  notes: string;
  confidence: string;
}

export interface ProseNeighborhood {
  name: string;
  slug: string;
  zone: string;
}

export interface OccupationSentences {
  /** Opening paragraphs: the area, other names, and the occupation's own scope note. */
  intro: string[];
  hiring: string[];
  /** Documents the policy asks for, as list items. */
  steps: string[];
  /** Sentence that introduces `steps`; '' when there are none. */
  stepsLead: string;
  requirements: string[];
  regulation: string[];
  units: string;
  places: string;
}

export interface PageMeta {
  title: string;
  description: string;
}

export interface ZoneGroup<T extends ProseNeighborhood = ProseNeighborhood> {
  zone: string;
  label: string;
  items: T[];
}

export const SITE_NAME: string;
export const CITY: string;
export const LAUNCH_AREA_SLUGS: string[];
export const LAUNCH_ZONES: string[];
export const ZONE_LABELS: Record<string, string>;
export const SLUG: RegExp;
export const DESCRIPTION_MAX: number;
export const RELATED_LIMIT: number;
export const PRICE_UNIT_TEXT: Record<string, string>;
export const LOCATION_TEXT: Record<string, string>;
export const VERIFICATION_TEXT: Record<string, string>;
export const PROVIDER_KIND_TEXT: Record<string, (name: string) => string>;
export const BILLING_TEXT: Record<string, (name: string) => string>;
export const NOTICE: string;
export const RULE_NOTE: string;
export const SECTION: {
  hiring: string;
  hiringIn: (bairro: string) => string;
  requirements: string;
  requirementsLocal: string;
  regulation: string;
  byNeighborhood: (name: string) => string;
  related: (areaName: string) => string;
  otherNeighborhoods: (name: string) => string;
  seeAlso: string;
  areaServices: string;
};

export function joinPt(items: ReadonlyArray<string | false | null | undefined>, word?: string): string;
export function capitalize(text: string): string;
export function truncate(text: string, max?: number): string;
export function zoneLabel(zone: string): string;
export function inZone(zone: string): string;

export function verificationItems(policy: Pick<ProsePolicy, 'verification'>): string[];
export function verificationLead(name: string): string;
export function occupationSentences(occupation: ProseOccupation, area: ProseArea | undefined, policy: ProsePolicy): OccupationSentences;
export function neighborhoodPlaceSentence(name: string, policy: Pick<ProsePolicy, 'locations'>, bairro: string): string;
export function neighborhoodIntro(options: {
  name: string;
  policy: Pick<ProsePolicy, 'locations'>;
  bairro: string;
  zone: string;
  city?: string;
}): string[];

export function areaIntro(options: { area: ProseArea; count: number; regulated: number; launch: boolean }): string[];
export function categoriesLead(count: number): string;
export function policyBadges(
  policy: Pick<ProsePolicy, 'regulated' | 'registryName' | 'regulatorBody' | 'providerType'> | undefined,
): string[];
export function priceLine(policy: Pick<ProsePolicy, 'priceUnits'>): string;

export function relatedWindow<T>(list: readonly T[], index: number, limit?: number): T[];
export function launchNeighborhoods<T extends ProseNeighborhood>(neighborhoods: readonly T[] | null | undefined): T[];
export function groupByZone<T extends ProseNeighborhood>(bairros: readonly T[]): ZoneGroup<T>[];
export function rotateNeighbors<T extends { slug: string }>(sameZone: readonly T[], slug: string, limit?: number): T[];
export function requestHref(occupationSlug: string, neighborhoodSlug?: string): string;

export function occupationLabel(name: string, areaName: string, duplicated: boolean): string;
export function categoriesMeta(areaNames: readonly string[]): PageMeta;
export function areaMeta(area: ProseArea & { name: string }, occupationNames: readonly string[]): PageMeta;
export function occupationMeta(options: { label: string; name: string; units: string; places: string }): PageMeta;
export function neighborhoodMeta(options: {
  label: string;
  bairro: string;
  zone: string;
  city?: string;
  units: string;
  places: string;
}): PageMeta;
