#!/usr/bin/env node
// Tells which store a web bundle was built for, and fails when that is not the one expected.
//
// VITE_STORE_BUILD (config/features.ts) is read when the build runs and folded into the bundle: the
// minifier turns the function behind `features.storeBuild` into a constant (`()=>"android"`, or `()=>null`
// for the site, the desktop apps and development). This script reads that constant back from the files, so
// a store build can be told from a plain one without opening the app. It is what proves that:
//   - the dist/ that `vite build --mode native` made was made with VITE_STORE_BUILD=android (or ios);
//   - the copy that `cap sync` put in android/app/src/main/assets/public (or ios/App/App/public) is that dist.
//
// It does NOT prove that the screens are hidden: the code of the Pro sale, of the care line and of the AI
// assistants stays in the files (the flags are read at run time, so nothing is tree-shaken); what the flag
// does is decide, when the app runs, whether it is shown. That is covered by test/web/store-build*.test.tsx.
// For iOS, also check that the legacy prototype routes and their page chunks were eliminated.
//
// Usage: node scripts/check-store-bundle.mjs --store android|ios|none [--dist dist]
// Exit code: 0 = the bundle is for the expected store, 1 = it is for another, 2 = nothing to read.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const walk = dir =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

/**
 * The store a minified bundle was built for: 'android', 'ios', 'none' (not a store build), or null when
 * the text has no `features` object to read. Looks for `get careLineInBuild(){return f()===null}`, which is
 * features.careLineInBuild, and then for what `f` was folded into.
 */
export const storeOfBundleText = text => {
  const getter = /get careLineInBuild\(\)\s*\{\s*return\s+([\w$]+)\(\)\s*===\s*null\s*\}/.exec(text);
  if (!getter) return null;
  const name = getter[1].replace(/\$/g, '\\$');
  const folded = new RegExp(`(?:^|[^\\w$.])${name}\\s*=\\s*\\(\\)\\s*=>\\s*(null|\`(android|ios)\`|"(android|ios)"|'(android|ios)')`).exec(text);
  if (!folded) return null;
  return folded[1] === 'null' ? 'none' : (folded[2] ?? folded[3] ?? folded[4]);
};

/** The store of a dist folder, reading every .js file; 'conflict' when two files disagree. */
export const storeOfDist = dist => {
  const found = new Set();
  for (const file of walk(dist).filter(path => path.endsWith('.js'))) {
    const store = storeOfBundleText(readFileSync(file, 'utf8'));
    if (store) found.add(store);
  }
  if (found.size === 0) return null;
  return found.size === 1 ? [...found][0] : 'conflict';
};

const main = () => {
  const args = process.argv.slice(2);
  const option = name => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const expected = option('--store');
  const dist = option('--dist') ?? 'dist';
  if (!['android', 'ios', 'none'].includes(expected ?? '')) {
    console.error('uso: node scripts/check-store-bundle.mjs --store android|ios|none [--dist dist]');
    return 2;
  }
  if (!existsSync(dist)) {
    console.error(`check-store-bundle: pasta "${dist}" não encontrada. Rode o build antes.`);
    return 2;
  }
  const actual = storeOfDist(dist);
  if (actual === null) {
    console.error(`check-store-bundle: não achei a configuração de loja em "${dist}" (bundle sem features, ou o minificador mudou a forma).`);
    return 2;
  }
  if (actual !== expected) {
    console.error(`check-store-bundle: "${dist}" foi feito para "${actual}", e era esperado "${expected}". Refaça o build com VITE_STORE_BUILD=${expected === 'none' ? '(vazio)' : expected}.`);
    return 1;
  }
  if (actual === 'ios') {
    const prototypeChunk = /[/\\](?:Verification|HealthSearch|DoctorProfile|TeleconsultationRoom|MedicalRecords|FutureFeaturePage|ProviderRegistration|Dashboard)-[^/\\]+\.js$/;
    const prototypeRoute = /\bpath\s*:\s*["'`]\/(?:verification|health|doctor\/:id|teleconsultation\/:sessionId|medical-records)["'`]/;
    if (walk(dist).some(path => path.endsWith('.js') && (prototypeChunk.test(path) || prototypeRoute.test(readFileSync(path, 'utf8'))))) {
      console.error('check-store-bundle: o bundle iOS ainda contém rotas ou telas de protótipo.');
      return 1;
    }
  }
  console.log(`check-store-bundle: "${dist}" é um bundle ${expected === 'none' ? 'sem build de loja' : `de loja (${expected})`}.`);
  return 0;
};

// Run only as a script: the test imports the helpers above
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
