// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// supabase/seed.sql is generated from catalog/*.json and data/neighborhoods.json by
// scripts/generate-seed.mjs. This test regenerates it in memory and fails when the
// committed file is stale: run `npm run db:seed` after changing the catalog.

interface SeedInputs {
  areas: { areas: Array<{ slug: string; name: string; occupations: Array<{ slug: string; name: string }> }> };
  policies: Record<string, unknown>;
  neighborhoods: Array<{ name: string; slug: string; zone: string }>;
}

interface SeedModule {
  generateSeedSql: (input: SeedInputs) => string;
  readSeedInputs: (root?: string) => SeedInputs;
  sqlString: (value: unknown) => string;
  sqlArray: (values: string[], type: string) => string;
}

const ROOT = process.cwd();
const loadGenerator = async (): Promise<SeedModule> =>
  (await import(pathToFileURL(join(ROOT, 'scripts', 'generate-seed.mjs')).href)) as SeedModule;

describe('supabase/seed.sql', () => {
  it('is up to date with the catalog and the neighborhoods', async () => {
    const { generateSeedSql, readSeedInputs } = await loadGenerator();
    const committed = readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8');
    expect(committed, 'seed.sql is stale: run `npm run db:seed`').toBe(generateSeedSql(readSeedInputs()));
  });

  it('inserts every area, occupation, policy and neighborhood', async () => {
    const { generateSeedSql, readSeedInputs, sqlString } = await loadGenerator();
    const inputs = readSeedInputs();
    const sql = generateSeedSql(inputs);
    const section = (table: string): string =>
      sql
        .split(/\n(?=insert into public\.)/)
        .filter(statement => statement.startsWith(`insert into public.${table} `))
        .join('\n');
    const occupationsSql = section('occupations');
    const policiesSql = section('occupation_policies');

    expect(inputs.areas.areas.length).toBeGreaterThan(0);
    for (const area of inputs.areas.areas) {
      expect(section('areas')).toContain(`(${sqlString(area.slug)}, ${sqlString(area.name)}, `);
      expect(area.occupations.length).toBeGreaterThan(0);
      for (const occupation of area.occupations) {
        expect(occupationsSql, occupation.slug).toContain(
          `(${sqlString(occupation.slug)}, ${sqlString(area.slug)}, ${sqlString(occupation.name)}, `,
        );
        // Every occupation has a policy row: without one the database blocks it (no add, no approval)
        expect(inputs.policies[occupation.slug], `${occupation.slug} has no policy`).toBeDefined();
        expect(policiesSql, occupation.slug).toContain(`(${sqlString(occupation.slug)}, `);
      }
    }
    for (const n of inputs.neighborhoods) {
      expect(section('neighborhoods')).toContain(`${sqlString(n.name)}, ${sqlString(n.slug)}, ${sqlString(n.zone)})`);
    }
  });

  it('inserts exactly one policy per occupation and refuses a catalog with an occupation that has none', async () => {
    const { generateSeedSql, readSeedInputs } = await loadGenerator();
    const inputs = readSeedInputs();
    const occupations = inputs.areas.areas.flatMap(area => area.occupations.map(o => o.slug));
    expect(Object.keys(inputs.policies).sort()).toEqual([...occupations].sort());
    const sql = generateSeedSql(inputs);
    expect(sql).toContain(`${occupations.length} occupations, ${occupations.length} policies`);

    const [first] = inputs.areas.areas[0].occupations;
    const rest = Object.fromEntries(Object.entries(inputs.policies).filter(([slug]) => slug !== first.slug));
    expect(() => generateSeedSql({ ...inputs, policies: rest })).toThrow(`occupations without policy in catalog/policies.json: ${first.slug}`);
  });

  it('lists the 96 districts of São Paulo with unique slugs and valid zones', async () => {
    const { readSeedInputs } = await loadGenerator();
    const { neighborhoods } = readSeedInputs();
    expect(neighborhoods).toHaveLength(96);
    expect(new Set(neighborhoods.map(n => n.slug)).size).toBe(96);
    for (const n of neighborhoods) {
      expect(n.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(['Centro', 'Norte', 'Sul', 'Leste', 'Oeste']).toContain(n.zone);
    }
  });

  it('escapes quotes and builds typed arrays', async () => {
    const { sqlString, sqlArray } = await loadGenerator();
    expect(sqlString("Pingo d'Água")).toBe("'Pingo d''Água'");
    expect(sqlString(null)).toBe('null');
    expect(sqlArray([], 'public.price_unit')).toBe("'{}'::public.price_unit[]");
    expect(sqlArray(['hora', "d'x"], 'text')).toBe("array['hora', 'd''x']::text[]");
  });

  it('scales to a large catalog and stays idempotent', async () => {
    const { generateSeedSql } = await loadGenerator();
    const occupations = Array.from({ length: 1200 }, (_, i) => ({ slug: `ocupacao-${i}`, name: `Ocupação ${i}`, synonyms: [] }));
    const policy = {
      regulated: false, regulatorBody: '', registryName: '', legalBasis: '', verification: [], backgroundCheck: false,
      billing: 'so_assinatura', ratingRanking: true, laborLock: false, providerType: 'autonomo', audienceMinors: false,
      priceUnits: ['hora'], locations: ['domicilio'], notes: '', confidence: 'a_confirmar', sources: [],
    };
    const sql = generateSeedSql({
      areas: { areas: [{ slug: 'grande', name: 'Grande', occupations }] },
      policies: Object.fromEntries(occupations.map(o => [o.slug, policy])),
      neighborhoods: [],
    });
    // 500 rows per statement: 3 statements for occupations and 3 for policies
    expect(sql.match(/insert into public\.occupations /g)).toHaveLength(3);
    expect(sql.match(/insert into public\.occupation_policies /g)).toHaveLength(3);
    expect(sql.match(/on conflict \(/g)).toHaveLength(7);
    expect(sql).toContain("('ocupacao-1199', 'grande', 'Ocupação 1199', '{}'::text[])");
  });
});
