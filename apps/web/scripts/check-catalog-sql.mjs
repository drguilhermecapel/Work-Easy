#!/usr/bin/env node
// Checks supabase/catalog.sql before .github/workflows/deploy-supabase.yml applies it to production.
//
// Two independent checks, both must pass:
//   1. The file is, byte for byte, what scripts/generate-seed.mjs makes from catalog/*.json and
//      data/neighborhoods.json. A hand edit, or a JSON change without `npm run db:seed`, fails here.
//   2. The file has nothing but the expected shape: header comments, `begin;`, upserts into the four
//      catalog tables (areas, occupations, occupation_policies, neighborhoods) and `commit;`. Every row is
//      read token by token (string literals, numbers, booleans, null, `array[...]::type[]`, casts to
//      `text` or a `public.` type), so a second statement hidden in a row, a `;` outside a string or a
//      table outside the catalog fails even if the generator itself were changed to emit it.
//
// Usage: node scripts/check-catalog-sql.mjs [supabase/catalog.sql]
// Exit code: 0 = both checks pass, 1 = a check failed (the reasons go to stderr, as ::error lines).
// No dependencies: the deploy job runs it without `npm ci`.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { catalogPath, generateCatalogSql, readSeedInputs } from './generate-seed.mjs';

export const CATALOG_TABLES = ['areas', 'occupations', 'occupation_policies', 'neighborhoods'];

const IDENT = /^[a-z_][a-z0-9_]*$/;
const TYPE = /^(?:text|public\.[a-z_][a-z0-9_]*)(?:\[\])?$/;

/**
 * Reads one row `(v1, v2, ...)` (without the leading spaces and the trailing comma). Returns the number of
 * values, or an error message. A value is a string literal (with '' escapes), an integer, true, false,
 * null or `array['a', 'b']`, each optionally cast with `::text`, `::public.x` or `::...[]`.
 * @param {string} row
 * @returns {{ count: number } | { error: string }}
 */
export const readRow = row => {
  if (!row.startsWith('(') || !row.endsWith(')')) return { error: 'a linha não é uma tupla entre parênteses' };
  const body = row.slice(1, -1);
  let at = 0;
  let count = 0;
  const string = /'(?:[^']|'')*'/y;
  const scalar = /(?:-?\d+|true|false|null)(?![\w'])/y;
  const cast = /::([a-z_.]+(?:\[\])?)/y;
  const take = re => {
    re.lastIndex = at;
    const match = re.exec(body);
    if (!match) return null;
    at = re.lastIndex;
    return match;
  };
  for (;;) {
    if (body.startsWith('array[', at)) {
      at += 'array['.length;
      if (!take(string)) return { error: `array sem texto na posição ${at}` };
      while (body.startsWith(', ', at)) {
        at += 2;
        if (!take(string)) return { error: `array com item que não é texto na posição ${at}` };
      }
      if (body[at] !== ']') return { error: `array não fechado na posição ${at}` };
      at += 1;
    } else if (!take(string) && !take(scalar)) {
      return { error: `valor não reconhecido na posição ${at}: ${body.slice(at, at + 40)}` };
    }
    const typed = take(cast);
    if (typed && !TYPE.test(typed[1])) return { error: `conversão para tipo não permitido: ${typed[1]}` };
    count += 1;
    if (at === body.length) return { count };
    if (!body.startsWith(', ', at)) return { error: `separador inesperado na posição ${at}: ${body.slice(at, at + 40)}` };
    at += 2;
  }
};

/**
 * Structural check of a catalog file. Returns the problems found (empty = the shape is the expected one).
 * @param {string} text
 * @returns {string[]}
 */
export const checkCatalogShape = text => {
  const errors = [];
  const lines = text.split('\n');
  const fail = (index, message) => errors.push(`linha ${index + 1}: ${message}`);
  let i = 0;
  // Header: comments and blank lines only, and it must say how many rows there are.
  let counted = false;
  while (i < lines.length && lines[i] !== 'begin;') {
    if (/^-- \d+ areas, \d+ occupations, \d+ policies, \d+ neighborhoods\.$/.test(lines[i])) counted = true;
    else if (lines[i] !== '' && !lines[i].startsWith('-- ')) fail(i, 'antes de begin; só comentários e linhas em branco');
    i += 1;
  }
  if (!counted) errors.push('cabeçalho sem a contagem "-- N areas, N occupations, N policies, N neighborhoods."');
  if (i >= lines.length) return [...errors, 'falta begin;'];
  i += 1;
  const tables = new Set();
  let committed = false;
  while (i < lines.length) {
    const line = lines[i];
    if (line === '') {
      i += 1;
      continue;
    }
    if (line === 'commit;') {
      committed = true;
      i += 1;
      break;
    }
    const insert = /^insert into public\.([a-z_]+) \(([a-z0-9_, ]+)\) values$/.exec(line);
    if (!insert) {
      fail(i, `instrução fora do esperado: ${line.slice(0, 80)}`);
      i += 1;
      continue;
    }
    const [, table, columnList] = insert;
    if (!CATALOG_TABLES.includes(table)) fail(i, `tabela fora do catálogo: public.${table}`);
    tables.add(table);
    const columns = columnList.split(', ');
    if (columns.some(c => !IDENT.test(c)) || new Set(columns).size !== columns.length) fail(i, 'lista de colunas inválida');
    i += 1;
    // Rows: "  (...)," and the last one "  (...)".
    let rows = 0;
    for (;;) {
      const row = lines[i] ?? '';
      if (!row.startsWith('  (')) {
        fail(i, 'esperava uma linha de valores');
        break;
      }
      const last = !row.endsWith(',');
      const result = readRow(row.slice(2, last ? undefined : -1));
      if ('error' in result) fail(i, result.error);
      else if (result.count !== columns.length) fail(i, `${result.count} valores para ${columns.length} colunas`);
      rows += 1;
      i += 1;
      if (last) break;
    }
    if (rows === 0) fail(i, 'insert sem linhas');
    // on conflict (key) do update set, then "  col = excluded.col," ... ending with ";".
    const conflict = /^on conflict \(([a-z_]+)\) do update set$/.exec(lines[i] ?? '');
    if (!conflict) {
      fail(i, 'esperava "on conflict (...) do update set"');
      continue;
    }
    const key = conflict[1];
    if (!columns.includes(key)) fail(i, `chave de conflito fora das colunas: ${key}`);
    i += 1;
    const expected = columns.filter(c => c !== key);
    expected.forEach((column, n) => {
      const end = n === expected.length - 1 ? ';' : ',';
      if (lines[i] !== `  ${column} = excluded.${column}${end}`) fail(i, `esperava "  ${column} = excluded.${column}${end}"`);
      i += 1;
    });
  }
  if (!committed) errors.push('falta commit;');
  while (i < lines.length) {
    if (lines[i] !== '') fail(i, 'nada pode vir depois de commit;');
    i += 1;
  }
  for (const table of CATALOG_TABLES) if (!tables.has(table)) errors.push(`nenhum insert em public.${table}`);
  return errors;
};

/**
 * Both checks: same bytes as the generator, and the expected shape.
 * @param {string} text the file's content
 * @param {string} generated what scripts/generate-seed.mjs makes from the repository's JSON
 * @returns {string[]}
 */
export const checkCatalogSql = (text, generated) => {
  const errors = [];
  if (text !== generated) {
    errors.push('supabase/catalog.sql difere do gerado por scripts/generate-seed.mjs (rode `npm run db:seed` e faça o commit).');
  }
  return [...errors, ...checkCatalogShape(text)];
};

const main = () => {
  const path = resolve(process.argv[2] ?? catalogPath);
  const text = readFileSync(path, 'utf8');
  const errors = checkCatalogSql(text, generateCatalogSql(readSeedInputs()));
  if (errors.length > 0) {
    for (const error of errors.slice(0, 50)) console.error(`::error::${path}: ${error}`);
    if (errors.length > 50) console.error(`::error::... e mais ${errors.length - 50} problema(s).`);
    return 1;
  }
  console.log(`check-catalog-sql: ${path} confere com o gerador e só tem upserts nas tabelas do catálogo.`);
  return 0;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
