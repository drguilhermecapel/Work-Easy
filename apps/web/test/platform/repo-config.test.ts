// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Repository files that sit above apps/web: Dependabot and the GitHub Actions workflows.
const REPO = join(process.cwd(), '..', '..');
const GITHUB = join(REPO, '.github');
const dependabot = readFileSync(join(GITHUB, 'dependabot.yml'), 'utf8');
const WORKFLOWS = join(GITHUB, 'workflows');

describe('Dependabot: npm em apps/web e GitHub Actions na raiz', () => {
  // Each update entry is a "package-ecosystem" line followed by its "directory" line.
  const entries = [...dependabot.matchAll(/package-ecosystem:\s*(\S+)\s*\n\s*directory:\s*(\S+)/g)].map(match => [match[1], match[2]]);

  it('atualiza o npm do site', () => {
    expect(entries).toContainEqual(['npm', '/apps/web']);
    expect(existsSync(join(REPO, 'apps', 'web', 'package-lock.json'))).toBe(true);
  });

  it('atualiza as GitHub Actions pelos workflows da raiz', () => {
    expect(entries).toContainEqual(['github-actions', '/']);
    expect(existsSync(WORKFLOWS)).toBe(true);
  });

  it('não tem entrada para services/api, que é código do dono', () => {
    expect(entries.filter(([, directory]) => directory.startsWith('/services'))).toEqual([]);
  });
});

describe('workflows: permissões mínimas', () => {
  const files = readdirSync(WORKFLOWS).filter(name => name.endsWith('.yml'));

  it('há workflows para testar', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s declara só contents: read no topo', file => {
    const text = readFileSync(join(WORKFLOWS, file), 'utf8');
    // The top-level permissions block: every indented line after "permissions:" until the next key.
    const block = /^permissions:\n((?:[ \t]+.*\n)+)/m.exec(text);
    expect(block?.[1], 'permissions: no topo do arquivo').toBe('  contents: read\n');
  });

  it.each(files)('%s não pede escrita em nenhum escopo', (file) => {
    const text = readFileSync(join(WORKFLOWS, file), 'utf8');
    expect(text).not.toMatch(/:\s*write\b/);
    expect(text).not.toMatch(/write-all/);
  });
});
