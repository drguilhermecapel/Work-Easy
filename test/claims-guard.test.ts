// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

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

const FORBIDDEN_SECRETS: Array<[label: string, pattern: RegExp]> = [
  ['Gemini key in client code', /GEMINI_API_KEY/],
  ['process.env API key', /process\.env\.API_KEY/],
];

const normalize = (text: string): string =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIP_DIRS.has(name) ? [] : sourceFiles(path);
    return EXTENSIONS.some(ext => name.endsWith(ext)) && !SKIP_FILES.has(name) ? [path] : [];
  });

const findings = (patterns: Array<[string, RegExp]>, transform: (s: string) => string): string[] =>
  sourceFiles(ROOT).flatMap(file => {
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

  it('does not reference API secrets in client code', () => {
    expect(findings(FORBIDDEN_SECRETS, s => s)).toEqual([]);
  });

  it('detects a forbidden phrase (self-check)', () => {
    const [, pattern] = FORBIDDEN_CLAIMS[0];
    expect(pattern.test(normalize('Criptografia Ponta-a-Ponta'))).toBe(true);
    const [, verified] = FORBIDDEN_CLAIMS[4];
    expect(verified.test(normalize('MÉDICO VERIFICADO'))).toBe(true);
    expect(verified.test(normalize('CRM informado (não verificado)'))).toBe(false);
  });
});
