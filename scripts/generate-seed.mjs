#!/usr/bin/env node
// Generates supabase/seed.sql from the catalog and the neighborhood list:
//   catalog/areas.json + catalog/policies.json -> areas, occupations, occupation_policies
//   data/neighborhoods.json                    -> neighborhoods
// Run with `npm run db:seed`; test/seed.test.ts fails when seed.sql is out of date.
//
// data/neighborhoods.json holds the 96 districts of the city of São Paulo, grouped in
// zones by the region of their subprefeitura, as published by the Prefeitura de São
// Paulo (SMUL/Infocidade, table "Área, população e densidade demográfica por
// subprefeitura e distrito, 1970-2022"):
// https://drive.prefeitura.sp.gov.br/cidade/secretarias/upload/chamadas/314-03_censo_r5-sub-distr_dens-demo_1970-2022_final_1715873407.htm
// List of the 32 subprefeituras:
// https://prefeitura.sp.gov.br/web/subprefeituras/subprefeituras/mapa
//
// No dependencies; the output is deterministic so the test can compare it byte by byte.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SEED_PATH = join(ROOT, 'supabase', 'seed.sql');
const CHUNK = 500;

/** SQL string literal; null and undefined become NULL. */
export const sqlString = value => (value === null || value === undefined ? 'null' : `'${String(value).replace(/'/g, "''")}'`);

const sqlBool = value => (value ? 'true' : 'false');

const sqlInt = value => {
  if (!Number.isInteger(value)) throw new Error(`not an integer: ${value}`);
  return String(value);
};

/** Postgres array literal of a given element type, e.g. text[] or public.price_unit[]. */
export const sqlArray = (values, type) => {
  if (!Array.isArray(values)) throw new Error(`expected an array for ${type}[]`);
  return values.length === 0 ? `'{}'::${type}[]` : `array[${values.map(sqlString).join(', ')}]::${type}[]`;
};

const chunks = (rows, size) => {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
};

const upsert = (table, columns, rows, conflict) => {
  if (rows.length === 0) return [];
  const updates = columns.filter(c => c !== conflict).map(c => `${c} = excluded.${c}`).join(',\n  ');
  return chunks(rows, CHUNK).map(
    part =>
      `insert into public.${table} (${columns.join(', ')}) values\n` +
      part.map(values => `  (${values.join(', ')})`).join(',\n') +
      `\non conflict (${conflict}) do update set\n  ${updates};\n`,
  );
};

const POLICY_COLUMNS = [
  ['occupation_slug', null],
  ['regulated', 'regulated'],
  ['regulator_body', 'regulatorBody'],
  ['registry_name', 'registryName'],
  ['legal_basis', 'legalBasis'],
  ['verification', 'verification'],
  ['background_check', 'backgroundCheck'],
  ['billing', 'billing'],
  ['rating_ranking', 'ratingRanking'],
  ['labor_lock', 'laborLock'],
  ['provider_type', 'providerType'],
  ['audience_minors', 'audienceMinors'],
  ['price_units', 'priceUnits'],
  ['locations', 'locations'],
  ['notes', 'notes'],
  ['confidence', 'confidence'],
  ['sources', 'sources'],
];

const policyValues = (slug, p) => [
  sqlString(slug),
  sqlBool(p.regulated),
  sqlString(p.regulatorBody ?? ''),
  sqlString(p.registryName ?? ''),
  sqlString(p.legalBasis ?? ''),
  sqlArray(p.verification ?? [], 'public.verification_step'),
  sqlBool(p.backgroundCheck),
  `${sqlString(p.billing)}::public.billing_model`,
  sqlBool(p.ratingRanking),
  sqlBool(p.laborLock),
  `${sqlString(p.providerType)}::public.provider_kind`,
  sqlBool(p.audienceMinors),
  sqlArray(p.priceUnits ?? [], 'public.price_unit'),
  sqlArray(p.locations ?? [], 'public.service_location'),
  sqlString(p.notes ?? ''),
  sqlString(p.confidence ?? 'a_confirmar'),
  sqlArray(p.sources ?? [], 'text'),
];

/**
 * Builds the seed SQL in memory.
 * @param {{ areas: { areas: Array<{slug: string, name: string, description?: string, icon?: string,
 *   occupations: Array<{slug: string, name: string, synonyms?: string[]}>}> },
 *   policies: Record<string, object>,
 *   neighborhoods: Array<{name: string, slug: string, zone: string}> }} input
 * @returns {string}
 */
export function generateSeedSql({ areas, policies, neighborhoods }) {
  const areaList = areas.areas;
  const occupations = areaList.flatMap(area => area.occupations.map(o => ({ ...o, areaSlug: area.slug })));

  const occupationSlugs = new Set(occupations.map(o => o.slug));
  if (occupationSlugs.size !== occupations.length) throw new Error('duplicate occupation slug in catalog/areas.json');
  const orphan = Object.keys(policies).filter(slug => !occupationSlugs.has(slug));
  if (orphan.length > 0) throw new Error(`policies without occupation: ${orphan.join(', ')}`);

  const areaRows = areaList.map((area, index) => [
    sqlString(area.slug),
    sqlString(area.name),
    sqlString(area.description ?? null),
    sqlString(area.icon ?? null),
    sqlInt(index),
  ]);
  const occupationRows = occupations.map(o => [
    sqlString(o.slug),
    sqlString(o.areaSlug),
    sqlString(o.name),
    sqlArray(o.synonyms ?? [], 'text'),
  ]);
  const policyRows = occupations.filter(o => policies[o.slug]).map(o => policyValues(o.slug, policies[o.slug]));
  const neighborhoodRows = [...neighborhoods]
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map(n => [sqlString('São Paulo'), sqlString(n.name), sqlString(n.slug), sqlString(n.zone)]);

  return [
    '-- GENERATED by scripts/generate-seed.mjs from catalog/*.json and data/neighborhoods.json.',
    '-- Do not edit by hand: run `npm run db:seed`.',
    `-- ${areaRows.length} areas, ${occupationRows.length} occupations, ${policyRows.length} policies, ` +
      `${neighborhoodRows.length} neighborhoods.`,
    '',
    ...upsert('areas', ['slug', 'name', 'description', 'icon', 'sort'], areaRows, 'slug'),
    ...upsert('occupations', ['slug', 'area_slug', 'name', 'synonyms'], occupationRows, 'slug'),
    ...upsert('occupation_policies', POLICY_COLUMNS.map(([column]) => column), policyRows, 'occupation_slug'),
    ...upsert('neighborhoods', ['city', 'name', 'slug', 'zone'], neighborhoodRows, 'slug'),
  ].join('\n');
}

/** Reads the JSON inputs from the repository. */
export function readSeedInputs(root = ROOT) {
  const read = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
  return {
    areas: read('catalog/areas.json'),
    policies: read('catalog/policies.json'),
    neighborhoods: read('data/neighborhoods.json'),
  };
}

export const seedPath = SEED_PATH;

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sql = generateSeedSql(readSeedInputs());
  writeFileSync(SEED_PATH, sql);
  console.log(`wrote ${SEED_PATH}`);
}
