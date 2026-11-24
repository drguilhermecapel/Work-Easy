#!/usr/bin/env node
// Checks public/_headers (Cloudflare Pages) against the security and cache
// policy of docs/arquitetura/infra.md, and, with --dist <dir>, checks the
// built HTML against the Content-Security-Policy: no executable inline script,
// no inline style element or style attribute, and no external script or style.
// No dependencies: Node 22 only.
//
// Usage: node scripts/check-headers.mjs [--file public/_headers] [--dist dist]

import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MAX_RULES = 100;
const MAX_LINE_LENGTH = 2000;
const ONE_YEAR = 31536000;
// Hosts the app contacts. Supabase: the project URL comes from VITE_SUPABASE_URL at build time,
// so the pattern covers any project. Sentry: ingestion only, and only when VITE_SENTRY_DSN is set
// (EU, US and the older US host). No Realtime: the app opens no channel, so no wss:// host.
const SUPABASE_HTTPS = 'https://*.supabase.co';
const SENTRY_INGEST = ['https://*.ingest.sentry.io', 'https://*.ingest.de.sentry.io', 'https://*.ingest.us.sentry.io'];
// Hashes of the two print stylesheets (<style> elements rendered by QuoteDocument and Orcamento).
const SHA256_SOURCE = /^'sha256-[A-Za-z0-9+/]+=*'$/;

/** Paths whose effective headers are checked. Each must be covered by the rules below. */
export const SAMPLE_PATHS = [
  '/',
  '/index.html',
  '/entrar',
  '/categorias/',
  '/categorias/agro-e-rural/',
  '/servicos/eletricista/',
  '/assets/index-Wjwz0HYm.js',
  '/workbox-9c191d2f.js',
  '/sw.js',
  '/registerSW.js',
  '/manifest.webmanifest',
  '/favicon.png',
];

/**
 * Parses the _headers format: a path line (no leading whitespace), then indented
 * `Name: value` lines, or `! Name` to unset a header set by a broader rule.
 * Throws on any line the Cloudflare parser would reject or misread.
 */
export const parseHeadersFile = text => {
  const rules = [];
  let current = null;
  text.split('\n').forEach((line, index) => {
    const where = `linha ${index + 1}`;
    if (line.includes('\r')) throw new Error(`${where}: CRLF no arquivo de cabeçalhos`);
    if (line.length > MAX_LINE_LENGTH) throw new Error(`${where}: linha com mais de ${MAX_LINE_LENGTH} caracteres`);
    if (line.trim() === '') return;
    if (/^\s/.test(line)) {
      if (!current) throw new Error(`${where}: cabeçalho antes de qualquer caminho`);
      const unset = /^\s+!\s+([A-Za-z0-9-]+)\s*$/.exec(line);
      if (unset) {
        current.headers.push({ name: unset[1], value: null });
        return;
      }
      const header = /^\s+([A-Za-z0-9-]+):\s*(.+?)\s*$/.exec(line);
      if (!header) throw new Error(`${where}: linha de cabeçalho inválida: ${line.trim()}`);
      current.headers.push({ name: header[1], value: header[2] });
      return;
    }
    if (!line.startsWith('/') && !line.startsWith('https://')) throw new Error(`${where}: caminho deve começar com /`);
    if ((line.match(/\*/g) ?? []).length > 1) throw new Error(`${where}: só é permitido um asterisco por caminho`);
    current = { pattern: line.trim(), headers: [] };
    rules.push(current);
  });
  if (rules.length > MAX_RULES) throw new Error(`mais de ${MAX_RULES} regras de cabeçalho`);
  return rules;
};

const patternToRegExp = pattern => {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
};

/**
 * Effective headers for one path, applying every matching rule in file order.
 * Repeated names are joined with ", " as Cloudflare does, and reported in
 * `combined`, because a joined Cache-Control is almost always a mistake.
 */
export const headersFor = (rules, path) => {
  const headers = new Map();
  const combined = new Set();
  for (const rule of rules) {
    if (!patternToRegExp(rule.pattern).test(path)) continue;
    for (const { name, value } of rule.headers) {
      const key = name.toLowerCase();
      if (value === null) {
        headers.delete(key);
      } else if (headers.has(key)) {
        combined.add(key);
        headers.set(key, `${headers.get(key)}, ${value}`);
      } else {
        headers.set(key, value);
      }
    }
  }
  return { headers, combined };
};

/** "directive value value; directive value" into a Map of directive to value list. */
export const parseCsp = value => {
  const directives = new Map();
  for (const part of value.split(';')) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (!name) continue;
    if (directives.has(name)) throw new Error(`diretiva repetida na CSP: ${name}`);
    directives.set(name, values);
  }
  return directives;
};

const sameValues = (actual, expected) =>
  actual !== undefined && actual.length === expected.length && expected.every(item => actual.includes(item));

/** Policy checks on the rules alone. Returns a list of failure messages (empty when clean). */
export const checkRules = rules => {
  const failures = [];
  const expectExact = (label, actual, expected) => {
    if (actual !== expected) failures.push(`${label}: esperado "${expected}", encontrado "${actual ?? '(ausente)'}"`);
  };

  for (const path of SAMPLE_PATHS) {
    const { headers, combined } = headersFor(rules, path);
    for (const name of combined) {
      failures.push(`${path}: o cabeçalho ${name} é combinado de duas regras (use caminhos que não se sobrepõem)`);
    }

    const csp = headers.get('content-security-policy');
    if (!csp) {
      failures.push(`${path}: Content-Security-Policy ausente`);
    } else {
      const d = parseCsp(csp);
      if (!sameValues(d.get('default-src'), ["'self'"])) failures.push(`${path}: default-src deve ser 'self'`);
      if (!sameValues(d.get('script-src'), ["'self'"])) failures.push(`${path}: script-src deve ser exatamente 'self'`);
      if (!sameValues(d.get('object-src'), ["'none'"])) failures.push(`${path}: object-src deve ser 'none'`);
      if (!sameValues(d.get('base-uri'), ["'self'"])) failures.push(`${path}: base-uri deve ser 'self'`);
      if (!sameValues(d.get('form-action'), ["'self'"])) failures.push(`${path}: form-action deve ser 'self'`);
      if (!sameValues(d.get('frame-ancestors'), ["'none'"])) failures.push(`${path}: frame-ancestors deve ser 'none'`);
      if (!sameValues(d.get('connect-src'), ["'self'", SUPABASE_HTTPS, ...SENTRY_INGEST])) {
        failures.push(`${path}: connect-src deve ser exatamente 'self', ${SUPABASE_HTTPS} e os hosts de ingestão do Sentry`);
      }
      if (!sameValues(d.get('img-src'), ["'self'", 'data:', 'blob:'])) {
        failures.push(`${path}: img-src deve ser exatamente 'self', data: e blob:`);
      }
      const styleSources = d.get('style-src') ?? [];
      if (!styleSources.includes("'self'") || styleSources.some(v => v !== "'self'" && !SHA256_SOURCE.test(v))) {
        failures.push(`${path}: style-src aceita só 'self' e hashes sha256 (sem 'unsafe-inline')`);
      }
      for (const [name, values] of d) {
        if (values.includes("'unsafe-eval'")) failures.push(`${path}: 'unsafe-eval' em ${name}`);
        if ((name === 'script-src' || name === 'default-src') && values.includes("'unsafe-inline'")) {
          failures.push(`${path}: 'unsafe-inline' em ${name}`);
        }
        if (values.some(v => v === '*' || v === 'http:' || v === 'https:')) failures.push(`${path}: fonte ampla demais em ${name}`);
      }
    }

    const hsts = headers.get('strict-transport-security') ?? '';
    const maxAge = Number(/max-age=(\d+)/.exec(hsts)?.[1] ?? 0);
    if (maxAge < ONE_YEAR) failures.push(`${path}: HSTS com max-age menor que um ano`);
    if (/preload/.test(hsts)) failures.push(`${path}: HSTS com preload (ainda não permitido)`);

    expectExact(`${path} X-Content-Type-Options`, headers.get('x-content-type-options'), 'nosniff');
    expectExact(`${path} X-Frame-Options`, headers.get('x-frame-options'), 'DENY');
    expectExact(`${path} Referrer-Policy`, headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    expectExact(
      `${path} Permissions-Policy`,
      headers.get('permissions-policy'),
      'geolocation=(self), camera=(self), microphone=(), payment=()',
    );
    expectExact(`${path} Cross-Origin-Opener-Policy`, headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
    expectExact(`${path} Cross-Origin-Resource-Policy`, headers.get('cross-origin-resource-policy'), 'same-origin');
  }

  const cacheFor = path => headersFor(rules, path).headers.get('cache-control');
  const immutable = 'public, max-age=31536000, immutable';
  expectExact('/assets/* Cache-Control', cacheFor('/assets/index-Wjwz0HYm.js'), immutable);
  expectExact('/workbox-*.js Cache-Control', cacheFor('/workbox-9c191d2f.js'), immutable);
  for (const path of ['/', '/index.html', '/categorias/', '/servicos/eletricista/', '/sw.js', '/registerSW.js', '/manifest.webmanifest']) {
    expectExact(`${path} Cache-Control`, cacheFor(path), 'no-cache');
  }
  return failures;
};

const EXECUTABLE_SCRIPT_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript']);

/** Checks built HTML files against the CSP. Returns failure messages. */
export const checkBuiltHtml = html => {
  const failures = [];
  for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
    const attrs = match[1];
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attrs)?.[1]?.toLowerCase() ?? '';
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!src && EXECUTABLE_SCRIPT_TYPES.has(type)) failures.push(`script inline executável: ${match[0].slice(0, 80)}`);
    if (src && /^(https?:)?\/\//i.test(src)) failures.push(`script externo: ${src}`);
  }
  if (/<style\b/i.test(html)) failures.push('elemento <style> inline (style-src não permite)');
  if (/\sstyle\s*=\s*["']/i.test(html)) failures.push('atributo style inline (style-src não permite)');
  for (const match of html.matchAll(/<link\b[^>]*\bhref\s*=\s*["'](https?:\/\/[^"']+)["']/gi)) {
    failures.push(`link externo: ${match[1]}`);
  }
  return failures;
};

const walkHtml = async dir => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walkHtml(full)));
    else if (entry.name.endsWith('.html')) files.push(full);
  }
  return files;
};

const argValue = (args, flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

const main = async () => {
  const args = process.argv.slice(2);
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const headersFile = resolve(root, argValue(args, '--file') ?? 'public/_headers');
  const distDir = argValue(args, '--dist');

  const text = await readFile(headersFile, 'utf8');
  const rules = parseHeadersFile(text);
  const failures = checkRules(rules).map(message => `_headers: ${message}`);

  if (distDir) {
    const dist = resolve(root, distDir);
    const copied = await readFile(join(dist, '_headers'), 'utf8').catch(() => null);
    if (copied !== text) failures.push(`${distDir}/_headers ausente ou diferente de ${headersFile}`);
    const pages = await walkHtml(dist);
    for (const file of pages) {
      const html = await readFile(file, 'utf8');
      for (const failure of checkBuiltHtml(html)) failures.push(`${file}: ${failure}`);
    }
    console.log(`HTML verificado: ${pages.length} arquivos`);
  }

  if (failures.length > 0) {
    console.error(`Cabeçalhos com ${failures.length} falha(s):`);
    for (const failure of failures.slice(0, 200)) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log(`Cabeçalhos ok: ${rules.length} regras, ${SAMPLE_PATHS.length} caminhos conferidos.`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Falha ao verificar cabeçalhos: ${error.message}`);
    process.exit(1);
  });
}
