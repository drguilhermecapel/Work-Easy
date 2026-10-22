// @vitest-environment node
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkPublicKey } from '../lib/supabaseKey';

// Guards against reintroducing claims the product cannot back up (consumer
// law, CDC arts. 37-38) and against shipping secrets in the client bundle.
// A phrase may come back only together with a real implementation and a
// matching change to this list.

// Vitest runs from the repository root
const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', 'dist', 'test', '.git', 'android', 'ios', 'src-tauri', 'docs']);
const EXTENSIONS = ['.ts', '.tsx', '.html', '.json'];
const SKIP_FILES = new Set(['package-lock.json']);

const FORBIDDEN_CLAIMS: Array<[label: string, pattern: RegExp]> = [
  ['end-to-end encryption', /ponta.a.ponta|end.to.end/],
  ['digital signature', /assinado digitalmente/],
  ['fake LGPD hash', /lgpd hash/],
  ['audit log promise', /registrado em log de auditoria/],
  ['"verified" badge without "não"', /(?<!nao )verificad[oa]s?\b/],
  ['escrow promise', /liberado apos o servico|pagamento seguro/],
  ['made-up statistic', /\d+x mais chances/],
  ['approval time promise', /em ate \d+ horas/],
  ['instant delivery promise', /imediatamente/],
  ['"free and secure" booking', /gratis e seguro/],
  ['"real patients" reviews', /pacientes reais/],
  ['fake video quality', /720p/],
  ['"CRM ativo" badge', /crm ativo/],
];

// Server-only keys (docs/ARQUITETURA.md). The client knows only the Supabase
// URL and the publishable key; everything below belongs to the Edge Functions.
const FORBIDDEN_SECRETS: Array<[label: string, pattern: RegExp]> = [
  ['Gemini key in client code', /GEMINI_API_KEY/],
  ['process.env API key', /process\.env\.API_KEY/],
  ['Supabase service role in client code', /service_role|SERVICE_ROLE/],
  ['Supabase secret key in client code', /sb_secret_/],
  ['Asaas key in client code', /ASAAS_API_KEY/],
  ['WhatsApp token in client code', /WHATSAPP_TOKEN/],
  ['Resend key in client code', /RESEND_API_KEY/],
  ['Anthropic key in client code', /ANTHROPIC_API_KEY/],
];

// Server code (Edge Functions, migrations, build scripts) may name its own
// secrets; it is still scanned for claims, since its messages reach users.
// Matched from the repository root, so a nested "components/scripts/" stays client code.
const SERVER_PATHS = ['supabase/', 'scripts/'];

const toPosix = (path: string): string => path.split(sep).join('/');
const isServerPath = (relativePath: string): boolean => SERVER_PATHS.some(prefix => toPosix(relativePath).startsWith(prefix));

const normalize = (text: string): string =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const sourceFiles = (dir: string, skip: Set<string> = SKIP_DIRS): string[] =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return skip.has(name) ? [] : sourceFiles(path, skip);
    return EXTENSIONS.some(ext => name.endsWith(ext)) && !SKIP_FILES.has(name) ? [path] : [];
  });

const clientFiles = (): string[] => sourceFiles(ROOT).filter(file => !isServerPath(relative(ROOT, file)));

// Vite puts every VITE_* variable of these files in the public bundle. .env.example
// is the template (empty values); .env.local and others may exist only on a dev machine.
const envFiles = (): string[] =>
  readdirSync(ROOT)
    .filter(name => name.startsWith('.env') && name !== '.env.example')
    .map(name => join(ROOT, name))
    .filter(path => statSync(path).isFile());

const ENV_LINE = /^\s*(?:export\s+)?(VITE_[A-Z0-9_]+)\s*=\s*(.*)$/;

const envSecretFindings = (files: string[] = envFiles()): string[] =>
  files.flatMap(file =>
    readFileSync(file, 'utf8')
      .split('\n')
      .flatMap((line, i) => {
        const match = ENV_LINE.exec(line);
        if (!match) return [];
        const [, name, raw] = match;
        const value = raw.replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
        const labels = FORBIDDEN_SECRETS.filter(([, pattern]) => pattern.test(value)).map(([label]) => label);
        if (name === 'VITE_SUPABASE_PUBLISHABLE_KEY' && value !== '' && checkPublicKey(value) === 'refused') {
          labels.push('Supabase key that is not the publishable or anon key');
        }
        return labels.map(label => `${relative(ROOT, file)}:${i + 1} ${label}: ${name}`);
      }),
  );

const findings = (
  patterns: Array<[string, RegExp]>,
  transform: (s: string) => string,
  files: string[] = sourceFiles(ROOT),
): string[] =>
  files.flatMap(file => {
    const lines = readFileSync(file, 'utf8').split('\n');
    return lines.flatMap((line, i) =>
      patterns
        .filter(([, pattern]) => pattern.test(transform(line)))
        .map(([label]) => `${relative(ROOT, file)}:${i + 1} ${label}: ${line.trim()}`),
    );
  });

describe('claims guard', () => {
  it('scans the app sources', () => {
    expect(sourceFiles(ROOT).length).toBeGreaterThan(10);
  });

  it('has no unbacked security, verification or payment claims', () => {
    expect(findings(FORBIDDEN_CLAIMS, normalize)).toEqual([]);
  });

  it('scans server function messages for claims, but not for their own secrets', () => {
    const all = sourceFiles(ROOT).map(file => relative(ROOT, file));
    const client = new Set(clientFiles().map(file => relative(ROOT, file)));
    expect(all.some(file => file.startsWith('lib/'))).toBe(true);
    for (const file of all.filter(f => f.startsWith('supabase/') || f.startsWith('scripts/'))) {
      expect(client.has(file)).toBe(false);
    }
  });

  it('excludes server code by its path from the root, not by folder name (self-check)', () => {
    expect(isServerPath('supabase/functions/account-delete/handler.ts')).toBe(true);
    expect(isServerPath('scripts/generate-seed.mjs')).toBe(true);
    expect(isServerPath('components/scripts/helper.ts')).toBe(false);
    expect(isServerPath('pages/supabase/x.tsx')).toBe(false);
  });

  it('does not reference API secrets in client code', () => {
    expect(findings(FORBIDDEN_SECRETS, s => s, clientFiles())).toEqual([]);
  });

  it('has no secret in a VITE_* variable of the .env files', () => {
    expect(envSecretFindings()).toEqual([]);
  });

  it('accepts only public Supabase keys (self-check)', () => {
    const jwt = (payload: object) =>
      ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'signature'].join('.');
    expect(checkPublicKey('sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH')).toBe('publishable');
    expect(checkPublicKey(jwt({ role: 'anon', iss: 'supabase' }))).toBe('legacy_anon');
    expect(checkPublicKey(jwt({ role: 'service_role', iss: 'supabase' }))).toBe('refused');
    expect(checkPublicKey('sb_secret_abc123')).toBe('refused');
    expect(checkPublicKey('qualquer coisa')).toBe('refused');
  });

  it('detects a secret placed in a VITE_* variable (self-check)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claims-guard-'));
    try {
      const file = join(dir, '.env.local');
      writeFileSync(
        file,
        [
          'VITE_SUPABASE_URL=http://127.0.0.1:54321',
          'VITE_SUPABASE_PUBLISHABLE_KEY="sb_secret_abc123"',
          'SUPABASE_SERVICE_ROLE_KEY=only-for-local-scripts',
        ].join('\n'),
      );
      const found = envSecretFindings([file]);
      expect(found.length).toBeGreaterThan(0);
      expect(found.every(line => line.includes('VITE_SUPABASE_PUBLISHABLE_KEY'))).toBe(true);
      writeFileSync(file, 'VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc123\n');
      expect(envSecretFindings([file])).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects a forbidden phrase (self-check)', () => {
    const [, pattern] = FORBIDDEN_CLAIMS[0];
    expect(pattern.test(normalize('Criptografia Ponta-a-Ponta'))).toBe(true);
    const [, verified] = FORBIDDEN_CLAIMS[4];
    expect(verified.test(normalize('MÉDICO VERIFICADO'))).toBe(true);
    expect(verified.test(normalize('CRM informado (não verificado)'))).toBe(false);
  });

  it('detects a server secret (self-check)', () => {
    const matches = (line: string) => FORBIDDEN_SECRETS.some(([, pattern]) => pattern.test(line));
    expect(matches("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')")).toBe(true);
    expect(matches('const key = "sb_secret_abc"')).toBe(true);
    expect(matches('ASAAS_API_KEY=x')).toBe(true);
    expect(matches('VITE_SUPABASE_PUBLISHABLE_KEY')).toBe(false);
  });
});
