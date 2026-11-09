// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// The site's policy (public/_headers, Cloudflare Pages) and the checker that the deploy workflow runs.
const ROOT = process.cwd();
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');
const HEADERS = read('public', '_headers');
const CHECKER = join(ROOT, 'scripts', 'check-headers.mjs');
const SENTRY = ['https://*.ingest.sentry.io', 'https://*.ingest.de.sentry.io', 'https://*.ingest.us.sentry.io'];
const PRINT_SHEETS = ['components/pro/QuoteDocument.tsx', 'pages/publico/Orcamento.tsx'];

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The lines of the rule for every route (/*), up to the first blank line. */
const globalBlock = HEADERS.split('\n\n')[0].split('\n');

const globalHeader = (name: string): string => {
  const line = globalBlock.find(item => item.trim().startsWith(`${name}:`));
  if (!line) throw new Error(`${name} is missing from the /* rule`);
  return line.trim().slice(name.length + 1).trim();
};

/** "directive value value; directive value" as a Map of directive to its values. */
const directives = (csp: string): Map<string, string[]> =>
  new Map(
    csp
      .split(';')
      .map(part => part.trim().split(/\s+/))
      .filter(([name]) => name !== '')
      .map(([name, ...values]): [string, string[]] => [name, values]),
  );

const policy = (): Map<string, string[]> => directives(globalHeader('Content-Security-Policy'));

const sha256 = (text: string): string => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

/** The CSS of `const PRINT_CSS = \`...\`` in a source file: the text the <style> element receives. */
const printCss = (file: string): string => {
  const match = /const PRINT_CSS = `([\s\S]*?)`;/.exec(read(file));
  if (!match) throw new Error(`${file}: PRINT_CSS not found`);
  return match[1];
};

const SKIP = new Set(['node_modules', 'dist', 'android', 'ios', 'src-tauri', 'test', 'supabase', 'docs', 'scripts', 'public', 'coverage']);

/** The app's own TypeScript sources, relative to apps/web. */
const appSourceFiles = (dir = ''): string[] =>
  readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap(entry => {
    const relative = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return SKIP.has(entry.name) || entry.name.startsWith('.') ? [] : appSourceFiles(relative);
    return /\.(ts|tsx)$/.test(entry.name) ? [relative] : [];
  });

/** Runs the checker on a copy of the headers file, with the same arguments the workflow uses. */
const runChecker = (text: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'headers-'));
  made.push(dir);
  const file = join(dir, '_headers');
  writeFileSync(file, text);
  return spawnSync(process.execPath, [CHECKER, '--file', file], { encoding: 'utf8' });
};

describe('public/_headers: política de conteúdo do site', () => {
  it('passa no verificador que o workflow de publicação roda', () => {
    const result = spawnSync(process.execPath, [CHECKER], { encoding: 'utf8' });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it('libera só os hosts que o app contacta', () => {
    const d = policy();
    expect(d.get('connect-src')).toEqual(["'self'", 'https://*.supabase.co', ...SENTRY]);
    expect(d.get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
    expect(d.get('font-src')).toEqual(["'self'"]);
    expect(d.get('manifest-src')).toEqual(["'self'"]);
    expect(d.get('worker-src')).toEqual(["'self'"]);
    expect(d.get('frame-src')).toEqual(["'none'"]);
  });

  it('não tem nenhum host de websocket', () => {
    expect(HEADERS).not.toMatch(/wss?:/);
  });

  it('o app não abre canal Realtime, então o site não precisa de websocket', () => {
    expect(appSourceFiles().filter(file => /\.channel\(/.test(read(file)))).toEqual([]);
  });

  it('style-src aceita só self e o hash de cada folha de impressão', () => {
    expect(policy().get('style-src')).toEqual(["'self'", ...PRINT_SHEETS.map(file => sha256(printCss(file)))]);
  });

  it.each(PRINT_SHEETS)('%s: a folha de impressão é <style> e o hash confere com o código', file => {
    const css = printCss(file);
    // The hash covers the text exactly as the browser receives it: no escapes, no interpolation.
    expect(css).not.toMatch(/\\|\$\{/);
    expect(read(file)).toContain('<style>{PRINT_CSS}</style>');
    expect(HEADERS).toContain(sha256(css));
  });

  it('nenhuma diretiva tem unsafe-inline, unsafe-eval, * ou um esquema amplo', () => {
    for (const [name, values] of policy()) {
      for (const value of values) expect(value, name).not.toMatch(/unsafe-|^\*$|^https?:$/);
    }
  });

  it('mantém frame-ancestors, object-src e os demais cabeçalhos de segurança', () => {
    const d = policy();
    expect(d.get('frame-ancestors')).toEqual(["'none'"]);
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'self'"]);
    expect(d.get('form-action')).toEqual(["'self'"]);
    expect(globalHeader('X-Content-Type-Options')).toBe('nosniff');
    expect(globalHeader('X-Frame-Options')).toBe('DENY');
    expect(globalHeader('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });

  it('index.html não tem estilo inline nem script inline: a política vem só do cabeçalho', () => {
    const html = read('index.html');
    expect(html).not.toMatch(/<style[\s>]/);
    expect(html).not.toMatch(/\sstyle="/);
    for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) expect(tag).toMatch(/\ssrc="/);
  });
});

describe('verificador de cabeçalhos: recusa uma política que volta a ser ampla', () => {
  it('o arquivo atual passa (controle do teste)', () => {
    expect(runChecker(HEADERS).status).toBe(0);
  });

  it.each([
    ['wss:// em connect-src, sem Realtime', "connect-src 'self' https://*.supabase.co", "connect-src 'self' https://*.supabase.co wss://*.supabase.co"],
    ['unsafe-inline em style-src', "style-src 'self' 'sha256", "style-src 'self' 'unsafe-inline' 'sha256"],
    ['host do Supabase em img-src, sem imagem do Storage', "img-src 'self' data: blob:;", "img-src 'self' data: blob: https://*.supabase.co;"],
    ['frame-ancestors removido', "frame-ancestors 'none'; ", ''],
  ])('recusa %s', (_label, from, to) => {
    expect(HEADERS).toContain(from);
    const result = runChecker(HEADERS.replace(from, to));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('_headers');
  });
});
