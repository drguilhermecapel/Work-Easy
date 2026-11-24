// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error the script is plain JavaScript, with no type declarations
import { checkCatalogShape as shapeOf, checkCatalogSql as checkBoth, readRow as rowOf } from '../../scripts/check-catalog-sql.mjs';
// @ts-expect-error the script is plain JavaScript, with no type declarations
import { catalogPath as catalogFile, generateCatalogSql as generate, readSeedInputs as readInputs } from '../../scripts/generate-seed.mjs';

const checkCatalogShape = shapeOf as (text: string) => string[];
const checkCatalogSql = checkBoth as (text: string, generated: string) => string[];
const readRow = rowOf as (row: string) => { count: number } | { error: string };
const catalogPath = catalogFile as string;

// O deploy-supabase.yml aplica supabase/catalog.sql em produção. O filtro anterior aceitava qualquer
// linha que começasse com dois espaços: uma segunda instrução escondida numa linha de valores passava.
const real = readFileSync(catalogPath, 'utf8');
const generated = (generate as (input: unknown) => string)((readInputs as () => unknown)());

/** Troca a primeira ocorrência e garante que ela existia (o teste não passa por engano). */
const tamper = (text: string, from: string | RegExp, to: string): string => {
  const out = text.replace(from, to);
  expect(out, String(from)).not.toBe(text);
  return out;
};

const SMALL = [
  '-- 1 areas, 1 occupations, 1 policies, 1 neighborhoods.',
  '',
  'begin;',
  "insert into public.areas (slug, name, sort) values",
  "  ('a', 'Área; com ponto e vírgula e -- traço', 0),",
  "  ('b', 'It''s', 1)",
  'on conflict (slug) do update set',
  '  name = excluded.name,',
  '  sort = excluded.sort;',
  '',
  'insert into public.occupations (slug, synonyms) values',
  "  ('o', array['x', 'y']::text[])",
  'on conflict (slug) do update set',
  '  synonyms = excluded.synonyms;',
  '',
  'insert into public.occupation_policies (occupation_slug, regulated, billing, sources) values',
  "  ('o', false, 'so_assinatura'::public.billing_model, '{}'::text[])",
  'on conflict (occupation_slug) do update set',
  '  regulated = excluded.regulated,',
  '  billing = excluded.billing,',
  '  sources = excluded.sources;',
  '',
  'insert into public.neighborhoods (slug, name) values',
  "  ('n', null)",
  'on conflict (slug) do update set',
  '  name = excluded.name;',
  'commit;',
  '',
].join('\n');

describe('check-catalog-sql: o arquivo do repositório', () => {
  it('é o que o gerador produz e tem só upserts do catálogo', () => {
    expect(checkCatalogSql(real, generated)).toEqual([]);
  });

  it('um arquivo pequeno, com ; e -- dentro de texto, também passa na forma', () => {
    expect(checkCatalogShape(SMALL)).toEqual([]);
  });
});

describe('check-catalog-sql: recusa', () => {
  const shape = (text: string) => checkCatalogShape(text);

  it('instrução solta entre os upserts ou depois do commit', () => {
    expect(shape(tamper(SMALL, 'commit;', 'delete from public.profiles;\ncommit;')).join('\n')).toMatch(/instrução fora do esperado/);
    expect(shape(tamper(SMALL, /commit;\n$/, 'commit;\nselect 1;\n')).join('\n')).toMatch(/depois de commit/);
  });

  it('segunda instrução escondida numa linha de valores (o que o filtro antigo deixava passar)', () => {
    const hidden = tamper(SMALL, "  ('b', 'It''s', 1)", "  ('b', 'x', 1); delete from public.profiles; select (1, 2, 3)");
    expect(shape(hidden).join('\n')).toMatch(/separador inesperado/);
    // O filtro antigo: só olhava se a linha começava com dois espaços.
    expect(hidden.split('\n').filter(line => !/^(--|begin;$|commit;$|$| {2}|on conflict |insert into public\.(areas|occupations|occupation_policies|neighborhoods) \()/.test(line))).toEqual([]);
  });

  it('tabela fora do catálogo, mesmo no formato de upsert', () => {
    const other = tamper(SMALL, 'insert into public.neighborhoods (slug, name) values', 'insert into public.profiles (slug, name) values');
    const errors = shape(other).join('\n');
    expect(errors).toMatch(/tabela fora do catálogo: public\.profiles/);
    expect(errors).toMatch(/nenhum insert em public\.neighborhoods/);
  });

  it('chamada de função, subconsulta ou conversão para tipo fora da lista numa linha de valores', () => {
    expect(readRow("('a', pg_sleep(10))")).toHaveProperty('error');
    expect(readRow("('a', (select 1))")).toHaveProperty('error');
    expect(readRow("('a', 'public.profiles'::regclass)")).toHaveProperty('error');
    expect(readRow("('a', array['x', current_user])")).toHaveProperty('error');
    expect(readRow("('a', 1) -- comentário")).toHaveProperty('error');
    expect(readRow("('a', 'b''c', -1, true, null, array['x']::public.price_unit[], '{}'::text[])")).toEqual({ count: 7 });
  });

  it('texto não fechado que engoliria o resto da linha', () => {
    expect(readRow("('a', 'b)")).toHaveProperty('error');
  });

  it('número de valores diferente do de colunas', () => {
    expect(shape(tamper(SMALL, "  ('n', null)", "  ('n', null, 'extra')")).join('\n')).toMatch(/3 valores para 2 colunas/);
  });

  it('cláusula do update diferente das colunas (por exemplo, trocar outra coluna)', () => {
    expect(shape(tamper(SMALL, '  name = excluded.name;', '  name = excluded.slug;')).join('\n')).toMatch(/esperava " {2}name = excluded\.name;"/);
    expect(shape(tamper(SMALL, 'on conflict (slug) do update set\n  name = excluded.name;', 'on conflict (slug) do nothing;')).join('\n')).toMatch(/on conflict/);
  });

  it('sem begin, sem commit ou sem a contagem no cabeçalho', () => {
    expect(shape(tamper(SMALL, 'begin;\n', ''))).toContain('falta begin;');
    expect(shape(tamper(SMALL, 'commit;\n', ''))).toContain('falta commit;');
    expect(shape(tamper(SMALL, /^-- 1 areas.*\n/, '-- cabeçalho\n')).join('\n')).toMatch(/sem a contagem/);
    expect(shape(tamper(SMALL, /^-- 1 areas.*\n/, '-- 1 areas, 1 occupations, 1 policies, 1 neighborhoods.\nset role postgres;\n')).join('\n')).toMatch(/só comentários/);
  });

  it('arquivo com a forma certa mas diferente do gerador (edição à mão)', () => {
    const edited = tamper(real, "'Reformas e construção'", "'Reformas e construções'");
    expect(checkCatalogShape(edited)).toEqual([]);
    expect(checkCatalogSql(edited, generated).join('\n')).toMatch(/difere do gerado/);
  });
});

describe('deploy-supabase.yml usa o verificador', () => {
  const workflow = readFileSync(join(process.cwd(), '..', '..', '.github', 'workflows', 'deploy-supabase.yml'), 'utf8');
  it('antes de aplicar o catálogo', () => {
    const check = workflow.indexOf('node scripts/check-catalog-sql.mjs supabase/catalog.sql');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(workflow.indexOf('-f supabase/catalog.sql'));
  });
});
