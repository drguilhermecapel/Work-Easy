#!/usr/bin/env node
// Availability and security-header check of the published site. Meant to be run by a
// scheduler or an external monitor (docs/operacao/13-alertas-e-monitor.md). No
// dependencies: Node 22 only. It sends plain GET requests and writes nothing.
//
// For each page it checks: HTTP 200 (after at most 3 redirects, same origin), an HTML
// body, and every security header of public/_headers (the same file that
// scripts/check-headers.mjs validates and Cloudflare Pages serves) with the value the
// file defines for that path. Strict-Transport-Security is skipped over plain http.
//
// Usage: node scripts/healthcheck.mjs [--url https://site] [--paths /,/servicos/]
//                                     [--timeout 10000] [--file public/_headers]
// The base URL comes from --url, or else from VITE_SITE_URL.
// Exit code: 0 all good; 1 at least one check failed; 2 bad usage (no URL, bad flag).

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { headersFor, parseHeadersFile } from './check-headers.mjs';

const MAX_REDIRECTS = 3;
const DEFAULT_TIMEOUT_MS = 10000;
/** The headers whose value must match public/_headers. Cache-Control is left out on purpose. */
export const CHECKED_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
];

const normalize = value => value.trim().replace(/\s+/g, ' ');

/**
 * Fetches one URL, following redirects by hand so each hop stays on the same origin.
 * Returns { response, finalUrl, hops } or throws with a short message.
 */
const fetchFollowing = async (startUrl, timeoutMs) => {
  let url = startUrl;
  for (let hops = 0; hops <= MAX_REDIRECTS; hops += 1) {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': 'workeasy-healthcheck/1', accept: 'text/html' },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
      const next = new URL(response.headers.get('location'), url);
      await response.body?.cancel();
      if (next.origin !== startUrl.origin) throw new Error(`redireciona para outra origem: ${next.origin}`);
      url = next;
      continue;
    }
    return { response, finalUrl: url, hops };
  }
  throw new Error(`mais de ${MAX_REDIRECTS} redirecionamentos`);
};

/** Checks one page. Returns { path, ok, failures[], status }. */
export const checkPage = async ({ base, path, rules, timeoutMs }) => {
  const failures = [];
  const target = new URL(path, base);
  let status = null;
  try {
    const { response, finalUrl } = await fetchFollowing(target, timeoutMs);
    status = response.status;
    const body = await response.text();
    if (response.status !== 200) failures.push(`HTTP ${response.status} (esperado 200)`);
    const contentType = response.headers.get('content-type') ?? '';
    if (!/text\/html/i.test(contentType)) failures.push(`content-type "${contentType || '(ausente)'}" (esperado text/html)`);
    if (!/<html[\s>]/i.test(body)) failures.push('o corpo não parece uma página HTML');
    const expected = headersFor(rules, finalUrl.pathname).headers;
    for (const name of CHECKED_HEADERS) {
      const want = expected.get(name);
      if (want === undefined) continue;
      if (name === 'strict-transport-security' && finalUrl.protocol !== 'https:') continue;
      const got = response.headers.get(name);
      if (got === null) failures.push(`cabeçalho ausente: ${name}`);
      else if (normalize(got) !== normalize(want)) failures.push(`cabeçalho diferente de public/_headers: ${name}`);
    }
  } catch (error) {
    const reason = error?.name === 'TimeoutError' ? `sem resposta em ${timeoutMs} ms` : (error?.cause?.code ?? error?.message ?? String(error));
    failures.push(`falha de rede: ${reason}`);
  }
  return { path, status, ok: failures.length === 0, failures };
};

/** Runs every page. `file` is the _headers file; returns the list of page results. */
export const runHealthcheck = async ({ url, paths, timeoutMs, file }) => {
  const rules = parseHeadersFile(await readFile(file, 'utf8'));
  const base = new URL(url);
  const results = [];
  for (const path of paths) results.push(await checkPage({ base, path, rules, timeoutMs }));
  return results;
};

const argValue = (args, flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

const KNOWN_FLAGS = new Set(['--url', '--paths', '--timeout', '--file']);

const main = async () => {
  const args = process.argv.slice(2);
  for (const arg of args.filter(item => item.startsWith('--'))) {
    if (!KNOWN_FLAGS.has(arg)) {
      console.error(`Opção desconhecida: ${arg}`);
      process.exit(2);
    }
  }
  const raw = argValue(args, '--url') ?? process.env.VITE_SITE_URL;
  if (!raw) {
    console.error('Informe o endereço do site com --url ou com a variável VITE_SITE_URL.');
    process.exit(2);
  }
  let url;
  try {
    url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocolo');
  } catch {
    console.error('Endereço inválido: use http:// ou https://.');
    process.exit(2);
  }
  const timeoutMs = Number(argValue(args, '--timeout') ?? DEFAULT_TIMEOUT_MS);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) {
    console.error('--timeout deve ser um inteiro de 100 a 120000 (milissegundos).');
    process.exit(2);
  }
  const paths = (argValue(args, '--paths') ?? '/').split(',').map(item => item.trim()).filter(Boolean);
  if (paths.length === 0 || paths.some(item => !item.startsWith('/'))) {
    console.error('--paths deve ser uma lista separada por vírgulas de caminhos que começam com /.');
    process.exit(2);
  }
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const file = resolve(root, argValue(args, '--file') ?? 'public/_headers');

  const results = await runHealthcheck({ url: url.href, paths, timeoutMs, file });
  for (const result of results) {
    if (result.ok) console.log(`ok     ${url.origin}${result.path} (HTTP ${result.status})`);
    else {
      console.error(`FALHA  ${url.origin}${result.path}${result.status ? ` (HTTP ${result.status})` : ''}`);
      for (const failure of result.failures) console.error(`         - ${failure}`);
    }
  }
  const failed = results.filter(result => !result.ok).length;
  if (failed > 0) {
    console.error(`Healthcheck: ${failed} de ${results.length} página(s) com falha.`);
    process.exit(1);
  }
  console.log(`Healthcheck ok: ${results.length} página(s).`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Falha no healthcheck: ${error.message}`);
    process.exit(1);
  });
}
