// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse, parseDocument } from 'yaml';

// Regras de cadeia de suprimentos e de CI que valem para todos os workflows. Os YAML são lidos com um
// parser de verdade (o pacote `yaml`), que acusa chave duplicada: já houve workflow quebrado por isso.
const REPO = join(process.cwd(), '..', '..');
const WORKFLOWS = join(REPO, '.github', 'workflows');
const FILES = readdirSync(WORKFLOWS).filter(name => /\.ya?ml$/.test(name));
const text = (name: string): string => readFileSync(join(WORKFLOWS, name), 'utf8');
const pkg = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
  devDependencies: Record<string, string>;
};

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
}
interface Workflow {
  jobs: Record<string, { steps: Step[] }>;
}
const workflow = (name: string): Workflow => parse(text(name)) as Workflow;
const allSteps = (name: string): Step[] => Object.values(workflow(name).jobs).flatMap(job => job.steps);

describe('YAML com parser que acusa chave duplicada', () => {
  it('o parser acusa a chave repetida (prova do detector)', () => {
    const doc = parseDocument('jobs:\n  x:\n    runs-on: a\n    runs-on: b\n');
    expect(doc.errors.map(e => e.code)).toContain('DUPLICATE_KEY');
  });

  it.each([...FILES.map(name => join('.github', 'workflows', name)), join('.github', 'dependabot.yml')])('%s', path => {
    const doc = parseDocument(readFileSync(join(REPO, path), 'utf8'));
    expect(doc.errors.map(e => `${e.code}: ${e.message}`)).toEqual([]);
    expect(doc.warnings.map(e => `${e.code}: ${e.message}`)).toEqual([]);
  });
});

describe('actions', () => {
  const uses = FILES.flatMap(name => allSteps(name).filter(s => s.uses).map(s => ({ name, uses: s.uses as string })));
  const lines = FILES.flatMap(name => text(name).split('\n').filter(line => /^\s*(-\s*)?uses:/.test(line)).map(line => ({ name, line: line.trim() })));

  it('há actions para conferir', () => expect(uses.length).toBeGreaterThan(10));

  it('as de terceiros estão fixadas por SHA de commit, com a versão no comentário (o Dependabot atualiza os dois)', () => {
    const third = lines.filter(({ line }) => !/uses:\s*(actions\/|\.\/)/.test(line));
    expect(third.length).toBeGreaterThan(0);
    for (const { name, line } of third) {
      expect(line, name).toMatch(/uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40} # v?\d+\.\d+\.\d+$/);
    }
  });

  it('as do GitHub (actions/*) ficam na major, sem as que rodam em Node 20 (checkout e setup-node v4)', () => {
    for (const { name, uses: ref } of uses.filter(u => u.uses.startsWith('actions/'))) {
      expect(ref, name).toMatch(/^actions\/[\w-]+@v\d+$/);
    }
    const majors = (action: string) => new Set(uses.filter(u => u.uses.startsWith(`${action}@`)).map(u => u.uses));
    expect(majors('actions/checkout')).toEqual(new Set(['actions/checkout@v7']));
    expect(majors('actions/setup-node')).toEqual(new Set(['actions/setup-node@v7']));
  });

  it('todo checkout tem persist-credentials: false (nenhum job faz push)', () => {
    const checkouts = FILES.flatMap(name => allSteps(name).filter(s => s.uses?.startsWith('actions/checkout@')).map(s => ({ name, s })));
    expect(checkouts.length).toBeGreaterThan(5);
    for (const { name, s } of checkouts) expect(s.with?.['persist-credentials'], name).toBe(false);
  });
});

describe('ferramentas pelo lock, não baixadas na hora', () => {
  it('nenhum workflow usa npx --yes nem npx pacote@versão', () => {
    for (const name of FILES) {
      for (const step of allSteps(name)) {
        expect(step.run ?? '', `${name}: ${step.name ?? step.run}`).not.toMatch(/\bnpx\s+(--yes|-y)\b|\bnpx\s+[\w@/.-]+@\d/);
      }
    }
  });

  it('deploy-web.yml publica com o wrangler de tools/wrangler, instalado com npm ci', () => {
    const steps = allSteps('deploy-web.yml');
    const install = steps.find(s => s.name === 'Instalar o wrangler') as Step & { 'working-directory'?: string };
    expect(install).toBeDefined();
    expect(install['working-directory']).toBe('apps/web/tools/wrangler');
    expect(install.run?.trim()).toBe('npm ci');
    const publish = steps.find(s => s.name === 'Publicar no Cloudflare Pages');
    expect(publish?.run).toMatch(/^tools\/wrangler\/node_modules\/\.bin\/wrangler pages deploy dist /);
  });

  it('o wrangler tem versão exata, e o lock tem a mesma versão com hash de integridade', () => {
    const dir = join(process.cwd(), 'tools', 'wrangler');
    const own = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')) as {
      packages: Record<string, { version?: string; integrity?: string; dependencies?: Record<string, string> }>;
    };
    expect(Object.keys(own.dependencies)).toEqual(['wrangler']);
    expect(own.dependencies.wrangler).toMatch(/^\d+\.\d+\.\d+$/);
    expect(lock.packages[''].dependencies).toEqual(own.dependencies);
    expect(lock.packages['node_modules/wrangler'].version).toBe(own.dependencies.wrangler);
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (path !== '') expect(entry.integrity, path).toMatch(/^sha512-/);
    }
  });

  it('o Dependabot acompanha o lock do wrangler e as actions', () => {
    const config = parse(readFileSync(join(REPO, '.github', 'dependabot.yml'), 'utf8')) as {
      updates: { 'package-ecosystem': string; directory: string }[];
    };
    const watched = config.updates.map(u => `${u['package-ecosystem']} ${u.directory}`);
    expect(watched).toEqual(expect.arrayContaining(['npm /apps/web', 'npm /apps/web/tools/wrangler', 'github-actions /']));
  });
});

describe('Supabase CLI', () => {
  const version = pkg.devDependencies.supabase;
  it('é a major 3, versão exata', () => expect(version).toMatch(/^3\.\d+\.\d+$/));

  it.each(['web-ci.yml', 'deploy-supabase.yml'])('%s instala a mesma versão do package.json', name => {
    const setups = allSteps(name).filter(s => s.uses?.startsWith('supabase/setup-cli@'));
    expect(setups.length).toBe(1);
    expect(String(setups[0].with?.version)).toBe(version);
  });
});

describe('web-ci.yml, job web: o que roda depois do build', () => {
  const runs = workflow('web-ci.yml').jobs.web.steps.map(s => s.run?.trim() ?? '');
  const at = (command: string) => runs.indexOf(command);

  it('confere que o site não é build de loja e que os links dos apps estão coerentes', () => {
    expect(at('npm run build')).toBeGreaterThan(-1);
    expect(at('npm run check:store-bundle -- --store none')).toBeGreaterThan(at('npm run build'));
    expect(at('npm run check:app-links')).toBeGreaterThan(-1);
    // Sem --strict: as pendências do dono (domínio, fingerprint, Team ID) não derrubam o CI.
    expect(runs.join('\n')).not.toMatch(/check-app-links[^\n]*--strict|check:app-links[^\n]*--strict/);
  });

  it('os scripts npm apontam para os verificadores', () => {
    expect(pkg.scripts['check:store-bundle']).toBe('node scripts/check-store-bundle.mjs');
    expect(pkg.scripts['check:app-links']).toBe('node scripts/check-app-links.mjs');
  });
});
