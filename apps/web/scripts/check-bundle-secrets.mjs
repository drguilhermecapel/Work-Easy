#!/usr/bin/env node
// Refuses a build whose public files carry a server key.
//
// Everything in dist/ is downloaded by anyone, so only the publishable key (sb_publishable_...) or
// the legacy anon JWT may be there (lib/supabaseKey.ts makes the app refuse anything else, but by
// then the key would already be public). This looks for:
//   - "sb_secret_" and the name SUPABASE_SERVICE_ROLE;
//   - any JWT whose payload says role "service_role" (the legacy service key has no telling prefix);
//   - optionally (--key <value>, or the VITE_SUPABASE_PUBLISHABLE_KEY variable with --env) the key the
//     build was given, before it is embedded.
//
// Usage: node scripts/check-bundle-secrets.mjs [--dist dist] [--env] [--key <value>]
// Exit code 0 = clean, 1 = something found, 2 = nothing to check.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const dist = option('--dist') ?? 'dist';
const givenKey = option('--key') ?? (args.includes('--env') ? process.env.VITE_SUPABASE_PUBLISHABLE_KEY : undefined);

/** Role of a JWT payload, or undefined when the text is not a JWT with a JSON payload. */
export const jwtRole = token => {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload && typeof payload === 'object' ? payload.role : undefined;
  } catch {
    return undefined;
  }
};

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
// Text files only: a key never hides inside an image, and reading binaries as text is slow and noisy
const TEXT = /\.(?:html?|js|mjs|cjs|css|json|map|txt|xml|webmanifest|svg)$/i;

/** What is wrong with a piece of text, as a list of reasons (empty = nothing). */
export const findSecrets = text => {
  const found = [];
  if (text.includes('sb_secret_')) found.push('chave secreta do Supabase (sb_secret_)');
  if (text.includes('SUPABASE_SERVICE_ROLE')) found.push('nome SUPABASE_SERVICE_ROLE');
  for (const token of text.match(JWT) ?? []) {
    if (jwtRole(token) === 'service_role') {
      found.push('JWT com papel service_role');
      break;
    }
  }
  return found;
};

const walk = dir =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const main = () => {
  const problems = [];
  if (givenKey !== undefined && givenKey !== '') {
    const inKey = findSecrets(givenKey);
    if (inKey.length > 0 || jwtRole(givenKey) === 'service_role') {
      problems.push(`VITE_SUPABASE_PUBLISHABLE_KEY: ${inKey.join(', ') || 'JWT com papel service_role'}. Use somente a chave publicável.`);
    }
  }
  if (!existsSync(dist)) {
    if (problems.length === 0 && givenKey === undefined) {
      console.error(`check-bundle-secrets: pasta "${dist}" não encontrada. Rode o build antes.`);
      return 2;
    }
  } else {
    for (const file of walk(dist).filter(path => TEXT.test(path))) {
      const found = findSecrets(readFileSync(file, 'utf8'));
      if (found.length > 0) problems.push(`${relative(dist, file)}: ${found.join(', ')}`);
    }
  }
  if (problems.length > 0) {
    console.error('check-bundle-secrets: segredo encontrado no que vai a público:');
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }
  console.log('check-bundle-secrets: nenhum segredo de servidor encontrado.');
  return 0;
};

// Run only as a script: the test imports the helpers above
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
