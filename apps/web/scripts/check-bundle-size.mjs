#!/usr/bin/env node
// Fails when the production build grows past a gzip budget.
//
//   npm run build && npm run check:size            (reads dist/)
//   node scripts/check-bundle-size.mjs --dist <dir> [--json]
//
// What is measured (gzip with node:zlib at its default level; a CDN serving brotli sends less).
// Only dist/index.html and dist/assets are read, so the 13k prerendered pages do not matter.
//
//   initial   every script and stylesheet that index.html loads (entry, modulepreload, css):
//             what any first visit pays before the app can draw anything.
//   home      initial + the Home page chunk + the catalog chunk: the real cost of the landing
//             page (the catalog data is what the home and the search need at first paint).
//   route     the largest lazy chunk that is not initial and not catalog data: a page chunk
//             above this means the page pulled in a big dependency by accident.
//   catalog   catalog/areas.json (44 areas, 1,710 occupations with their synonyms).
//   policies  catalog/policies.json: loaded only by the pages that show the rules of a service.
//   css       all stylesheets.
//   total     every script, so a forgotten dynamic import of a heavy library shows up.
//
// How the budgets were chosen. Measured on 2026-11-08 with this script on a `vite build` of the
// head of plan/e5-acessibilidade-desempenho, built with VITE_SUPABASE_URL and
// VITE_SUPABASE_PUBLISHABLE_KEY set (the production configuration; the demo build without them
// measures 109.4 kB initial and passes too). Each budget is the measured figure plus about 15% of
// headroom, rounded up to a multiple of 5 kB (css gets about 35%, because Tailwind adds utilities
// as the screens are written). The route budget is absolute: a page chunk is small by design, so
// a jump past 15 kB means a big dependency arrived by accident. The headroom absorbs normal growth
// of the screens; crossing it means someone should look at what was added, not that the number
// is wrong. To raise a budget, change it here in the same pull request and say why in its text.
//
//   measured (kB gz)   initial 164.3 | home 281.1 | route 6.9 | catalog 114.7 | policies 134.9
//                      css 11.9 | total 594.6
//   budget   (kB gz)   initial 190   | home 325   | route 15  | catalog 135   | policies 155
//                      css 16   | total 680
//
// No dependencies. Exit code 0 = within budget, 1 = over budget, 2 = no build to read.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const BUDGETS_KB = {
  initial: 190,
  home: 325,
  route: 15,
  catalog: 135,
  policies: 155,
  css: 16,
  total: 680,
};

const LABELS = {
  initial: 'carga inicial (scripts + css do index.html)',
  home: 'início (carga inicial + Home + catálogo)',
  route: 'maior página carregada sob demanda',
  catalog: 'dados do catálogo (areas.json)',
  policies: 'regras dos serviços (policies.json)',
  css: 'css',
  total: 'todo o JavaScript',
};

/** `Home-AbC123xY.js` -> `Home`. */
export const chunkName = file => file.replace(/-[A-Za-z0-9_-]{8}\.(?:js|css)$/, '');

/** Gzip size in bytes of every script and stylesheet in `<dist>/assets`, and which of them index.html loads. */
export const measureDist = dist => {
  const assets = join(dist, 'assets');
  const indexPath = join(dist, 'index.html');
  if (!existsSync(assets) || !existsSync(indexPath)) throw new Error(`nenhum build em ${dist}: rode "npm run build" antes.`);

  const files = new Map();
  for (const file of readdirSync(assets)) {
    if (!/\.(?:js|css)$/.test(file)) continue;
    files.set(file, gzipSync(readFileSync(join(assets, file))).length);
  }
  const html = readFileSync(indexPath, 'utf8');
  const initial = new Set([...html.matchAll(/(?:src|href)="(?:\.?\/)?assets\/([^"]+\.(?:js|css))"/g)].map(match => match[1]));
  return { files, initial };
};

/** The measured figures, in bytes, that the budgets are compared with. */
export const summarize = ({ files, initial }) => {
  const sum = names => [...names].reduce((total, name) => total + (files.get(name) ?? 0), 0);
  const named = name => [...files.keys()].filter(file => chunkName(file) === name && file.endsWith('.js'));
  const data = new Set(['catalog', 'policies']);
  const lazy = [...files.keys()].filter(file => file.endsWith('.js') && !initial.has(file) && !data.has(chunkName(file)));
  const largest = lazy.reduce((best, file) => (files.get(file) > (files.get(best) ?? 0) ? file : best), '');
  const js = [...files.keys()].filter(file => file.endsWith('.js'));
  return {
    initial: sum(initial),
    home: sum(initial) + sum(named('Home').filter(file => !initial.has(file))) + sum(named('catalog').filter(file => !initial.has(file))),
    route: files.get(largest) ?? 0,
    catalog: sum(named('catalog')),
    policies: sum(named('policies')),
    css: sum([...files.keys()].filter(file => file.endsWith('.css'))),
    total: sum(js),
    largestRoute: largest,
  };
};

/** One line per budget: `{ key, bytes, budget, over }`. */
export const evaluate = (summary, budgetsKb = BUDGETS_KB) =>
  Object.entries(budgetsKb).map(([key, kb]) => ({
    key,
    bytes: summary[key],
    budget: kb * 1024,
    over: summary[key] > kb * 1024,
  }));

const kb = bytes => `${(bytes / 1024).toFixed(1)} kB`;

const main = () => {
  const args = process.argv.slice(2);
  const dist = args.includes('--dist') ? args[args.indexOf('--dist') + 1] : 'dist';
  let summary;
  try {
    summary = summarize(measureDist(dist));
  } catch (error) {
    console.error(`[check:size] ${error instanceof Error ? error.message : error}`);
    process.exit(2);
  }
  const results = evaluate(summary);
  if (args.includes('--json')) {
    console.log(JSON.stringify({ summary, results }, null, 2));
  } else {
    console.log(`[check:size] tamanhos gzip de ${dist}/ contra o orçamento:`);
    for (const { key, bytes, budget, over } of results) {
      const extra = key === 'route' && summary.largestRoute ? ` (${chunkName(summary.largestRoute)})` : '';
      console.log(`  ${over ? 'ACIMA' : 'ok   '} ${LABELS[key].padEnd(46)} ${kb(bytes).padStart(10)} / ${kb(budget)}${extra}`);
    }
  }
  const over = results.filter(result => result.over);
  if (over.length > 0) {
    console.error(`[check:size] ${over.length} orçamento(s) estourado(s). Veja o que entrou no build; para subir o limite, mude BUDGETS_KB em scripts/check-bundle-size.mjs e explique no pull request.`);
    process.exit(1);
  }
};

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
