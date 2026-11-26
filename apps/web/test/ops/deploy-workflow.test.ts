// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

// O workflow que publica em produção. Já houve um workflow quebrado por chave duplicada
// (o YAML aceita a repetição e o GitHub rejeita ou descarta uma das chaves): este teste procura.
const REPO = join(process.cwd(), '..', '..');
const WORKFLOWS = join(REPO, '.github', 'workflows');
const read = (name: string): string => readFileSync(join(WORKFLOWS, name), 'utf8');

const indentOf = (value: string): number => value.length - value.trimStart().length;

/**
 * Chaves de mapa repetidas no mesmo mapa, em YAML de blocos (o estilo dos workflows).
 * Entende itens de lista (`- chave: valor`) e pula o conteúdo de blocos `|` e `>`.
 * Não entende YAML em linha (`{a: 1}`) nem strings de várias linhas entre aspas.
 */
const findDuplicateKeys = (text: string): string[] => {
  const found: string[] = [];
  const stack: { indent: number; keys: Set<string> }[] = [];
  let blockIndent: number | null = null;
  text.split('\n').forEach((line, index) => {
    if (blockIndent !== null) {
      if (line.trim() === '' || indentOf(line) > blockIndent) return;
      blockIndent = null;
    }
    if (line.trim() === '' || line.trim().startsWith('#')) return;
    let indent = indentOf(line);
    let rest = line.trim();
    while (rest.startsWith('- ')) {
      // Um item novo encerra o mapa do item anterior.
      while (stack.length > 0 && stack[stack.length - 1].indent > indent) stack.pop();
      const after = rest.slice(2);
      indent += 2 + (after.length - after.trimStart().length);
      rest = after.trimStart();
    }
    const match = /^("[^"]*"|'[^']*'|[^\s#'"][^:#]*?):(\s|$)/.exec(rest);
    if (!match) return;
    const key = match[1].replace(/^["']|["']$/g, '');
    while (stack.length > 0 && stack[stack.length - 1].indent > indent) stack.pop();
    let top = stack[stack.length - 1];
    if (!top || top.indent < indent) {
      top = { indent, keys: new Set() };
      stack.push(top);
    }
    if (top.keys.has(key)) found.push(`linha ${index + 1}: ${key}`);
    top.keys.add(key);
    if (/^[|>][+-]?\d*\s*(#.*)?$/.test(rest.slice(match[0].length).trim())) blockIndent = indent;
  });
  return found;
};

describe('findDuplicateKeys (o detector)', () => {
  it('acha uma chave repetida no mesmo mapa', () => {
    expect(findDuplicateKeys('a: 1\nb: 2\na: 3\n')).toEqual(['linha 3: a']);
    expect(findDuplicateKeys('jobs:\n  x:\n    runs-on: a\n    runs-on: b\n')).toEqual(['linha 4: runs-on']);
  });

  it('não acusa a mesma chave em mapas diferentes nem em itens de lista diferentes', () => {
    expect(findDuplicateKeys('a:\n  n: 1\nb:\n  n: 2\n')).toEqual([]);
    expect(findDuplicateKeys('steps:\n  - name: x\n    run: y\n  - name: z\n    run: w\n')).toEqual([]);
    expect(findDuplicateKeys('steps:\n- name: x\n  run: y\n- name: z\n  run: w\n')).toEqual([]);
  });

  it('acusa repetição dentro de um item de lista', () => {
    expect(findDuplicateKeys('steps:\n  - name: x\n    run: y\n    run: w\n')).toEqual(['linha 4: run']);
  });

  it('ignora o conteúdo de blocos de texto', () => {
    expect(findDuplicateKeys('run: |\n  a: 1\n  a: 2\nnext: 1\n')).toEqual([]);
  });
});

describe('workflows: sem chave duplicada', () => {
  const files = readdirSync(WORKFLOWS).filter(name => name.endsWith('.yml'));
  it('há workflows para conferir', () => expect(files.length).toBeGreaterThan(0));
  it.each(files)('%s', name => {
    expect(findDuplicateKeys(read(name))).toEqual([]);
  });
});

describe('deploy-supabase.yml: origem de produção', () => {
  it('isola o job de origem dos modelos, banco e funções', () => {
    const { jobs } = parseYaml(read('deploy-supabase.yml'));
    expect(jobs['site-origin'].if).toBe('inputs.site_origin_only');
    expect(jobs['site-origin'].environment).toBe('production');
    expect(jobs['auth-templates'].if).toContain('!inputs.site_origin_only');
    expect(jobs.supabase.if).toContain('!inputs.site_origin_only');
    const steps = jobs['site-origin'].steps as { run?: string }[];
    expect(steps[0].run).toContain('refs/heads/main');
    expect(steps[0].run).toContain('"$AUTH_TEMPLATES" == true');
    const step = steps.find(item => item.run?.includes('supabase_site_origin.py'));
    expect(step?.run).toContain('if [[ "$DRY_RUN" == false ]]; then args+=(--apply)');
  });
});

describe('deploy-supabase.yml: reversão de Edge Functions', () => {
  const text = read('deploy-supabase.yml');
  const triggers = text.slice(text.indexOf('\non:'), text.indexOf('\npermissions:'));

  it('só roda sob demanda (sem push, pull_request nem schedule)', () => {
    expect(triggers).toMatch(/workflow_dispatch:/);
    expect(triggers).not.toMatch(/\b(push|pull_request|pull_request_target|schedule|workflow_run):/);
  });

  it('mantém dry_run (padrão ligado) e deploy_functions (padrão desligado)', () => {
    expect(triggers).toMatch(/dry_run:[\s\S]*?type: boolean\s+default: true/);
    expect(triggers).toMatch(/deploy_functions:[\s\S]*?type: boolean\s+default: false/);
  });

  it('tem o input ref, opcional e vazio por padrão', () => {
    expect(triggers).toMatch(/\n {6}ref:\n[\s\S]*?required: false\s+type: string\s+default: ''/);
  });

  it('faz o checkout no ref (ou no commit do workflow) com histórico completo', () => {
    expect(text).toMatch(/ref: \$\{\{ inputs\.ref \|\| github\.sha \}\}/);
    expect(text).toMatch(/fetch-depth: 0/);
  });

  it('nunca interpola inputs.ref numa linha de shell (só em with:, env: e if:)', () => {
    const uses = text.split('\n').filter(line => /inputs\.ref/.test(line) && !/^\s*#/.test(line));
    expect(uses.length).toBeGreaterThan(0);
    for (const line of uses) {
      expect(line).toMatch(/^\s*(ref|REQUESTED_REF|if): /);
    }
  });

  it('exige que o commit esteja no histórico de main e registra o SHA no resumo', () => {
    expect(text).toMatch(/git merge-base --is-ancestor "\$sha" origin\/main/);
    expect(text).toMatch(/SHA publicado/);
    expect(text).toMatch(/GITHUB_STEP_SUMMARY/);
  });

  it('com ref, não toca migrations nem catálogo', () => {
    for (const step of [
      'Listar migrations pendentes',
      'Conferir que o catálogo',
      'Aplicar migrations pendentes',
      'Aplicar o catálogo',
    ]) {
      const start = text.indexOf(`- name: ${step}`);
      expect(start, step).toBeGreaterThan(-1);
      const block = text.slice(start, text.indexOf('run:', start));
      expect(block, step).toMatch(/inputs\.ref == ''/);
    }
  });

  it('com dry_run ligado, as funções não são publicadas, com ou sem ref', () => {
    const start = text.indexOf('- name: Publicar Edge Functions');
    const block = text.slice(start, text.indexOf('run:', start));
    expect(block).toMatch(/if: \$\{\{ inputs\.deploy_functions && !inputs\.dry_run \}\}/);
  });

  it('continua só em main e dentro do ambiente production', () => {
    expect(text).toMatch(/\$GITHUB_REF" != "refs\/heads\/main"/);
    expect(text).toMatch(/environment:\s+name: production/);
  });
});

// ---------------------------------------------------------------------------------------------------
// dry_run cobre tudo (decisão do coordenador): os `if:` dos passos são avaliados para cada combinação
// das entradas, e os scripts de listar e de publicar funções rodam de verdade em bash, com `git` e
// `supabase` falsos, num diretório temporário.
// ---------------------------------------------------------------------------------------------------

interface Step {
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  env?: Record<string, string>;
}
interface Inputs {
  dry_run: boolean;
  deploy_functions: boolean;
  ref: string;
}

const deploySteps = (): Step[] => {
  const doc = parseYaml(read('deploy-supabase.yml')) as { jobs: { supabase: { steps: Step[] } } };
  return doc.jobs.supabase.steps;
};

/** Avalia um `if:` dos que o workflow usa (inputs, !, &&, ||, ==, !=, '' e parênteses). */
const evalIf = (expression: string | undefined, inputs: Inputs): boolean => {
  if (expression === undefined) return true;
  const inner = expression.replace(/^\$\{\{\s*/, '').replace(/\s*\}\}$/, '');
  // Só o vocabulário esperado: qualquer outra coisa (funções, contextos) falha aqui, e o teste é revisto.
  expect(inner, expression).toMatch(/^(?:\s|inputs\.(?:dry_run|deploy_functions|ref)|!|&&|\|\||==|!=|''|\(|\))*$/);
  const js = inner.replace(/([!=])=/g, '$1==');
  return Boolean(new Function('inputs', `return (${js});`)(inputs));
};

/** Passos que mudam produção: aplicar migrations, aplicar o catálogo ou publicar função. */
const publishes = (step: Step): boolean => {
  const run = step.run ?? '';
  return /supabase functions deploy/.test(run) || /supabase db query/.test(run) || (/supabase db push/.test(run) && !/--dry-run/.test(run));
};

const COMBOS: Inputs[] = [true, false].flatMap(dry_run =>
  [true, false].flatMap(deploy_functions => ['', 'abc1234'].map(ref => ({ dry_run, deploy_functions, ref }))),
);

describe('deploy-supabase.yml: dry_run não publica nada', () => {
  const steps = deploySteps();
  const named = (name: string): Step => {
    const step = steps.find(s => s.name === name);
    expect(step, name).toBeDefined();
    return step as Step;
  };

  it('há passos que publicam, e todos são reconhecidos', () => {
    expect(steps.filter(publishes).map(s => s.name)).toEqual(['Aplicar migrations pendentes', 'Aplicar o catálogo', 'Publicar Edge Functions']);
  });

  it.each(COMBOS)('dry_run=$dry_run deploy_functions=$deploy_functions ref=$ref', inputs => {
    const runs = (step: Step) => evalIf(step.if, inputs);
    const published = steps.filter(s => publishes(s) && runs(s)).map(s => s.name);
    if (inputs.dry_run) {
      expect(published).toEqual([]);
      expect(runs(named('Registrar o ensaio'))).toBe(true);
    } else if (inputs.ref !== '') {
      expect(published).toEqual(inputs.deploy_functions ? ['Publicar Edge Functions'] : []);
      expect(runs(named('Registrar o ensaio'))).toBe(false);
    } else {
      expect(published).toEqual([
        'Aplicar migrations pendentes',
        'Aplicar o catálogo',
        ...(inputs.deploy_functions ? ['Publicar Edge Functions'] : []),
      ]);
      expect(runs(named('Registrar o ensaio'))).toBe(false);
    }
    // O que seria publicado aparece no resumo em toda execução, ensaio ou não.
    expect(runs(named('Listar as Edge Functions a publicar'))).toBe(inputs.deploy_functions);
    expect(runs(named('Listar migrations pendentes'))).toBe(inputs.ref === '');
    expect(runs(named('Conferir que o catálogo só toca tabelas de catálogo'))).toBe(inputs.ref === '');
  });

  describe('os scripts dos passos, em bash', () => {
    let dir = '';
    const fakeBin = (name: string, body: string) => writeFileSync(join(dir, 'bin', name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), 'deploy-supabase-'));
      for (const fn of ['_shared', '_runtime', 'asaas-webhook', 'notify-dispatch', 'background-check-purge', 'charges-create', 'quote-assist']) {
        mkdirSync(join(dir, 'supabase', 'functions', fn), { recursive: true });
      }
      mkdirSync(join(dir, 'bin'));
      mkdirSync(join(dir, 'tmp'));
      // `git rev-parse HEAD` devolve um SHA fixo; `supabase` só registra os argumentos.
      fakeBin('git', 'echo 0123456789abcdef0123456789abcdef01234567');
      fakeBin('supabase', `echo "$*" >> "${join(dir, 'calls.txt')}"`);
    });
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    const exec = (name: string, env: Record<string, string>) =>
      spawnSync('bash', ['-e', '-c', named(name).run ?? ''], {
        cwd: dir,
        encoding: 'utf8',
        env: {
          PATH: `${join(dir, 'bin')}:${process.env.PATH ?? ''}`,
          RUNNER_TEMP: join(dir, 'tmp'),
          GITHUB_STEP_SUMMARY: join(dir, 'summary.md'),
          SUPABASE_PROJECT_ID: 'abcdefghijklmnopqrst',
          ...env,
        },
      });
    const file = (path: string) => (existsSync(join(dir, path)) ? readFileSync(join(dir, path), 'utf8') : '');
    const runStep = (name: string, env: Record<string, string>) => {
      const result = exec(name, env);
      expect(result.status, result.stderr).toBe(0);
      return { summary: file('summary.md'), calls: file('calls.txt'), stdout: result.stdout };
    };

    it('o ensaio lista no resumo as funções que seriam publicadas, sem chamar a CLI', () => {
      const { summary, calls } = runStep('Listar as Edge Functions a publicar', { DRY_RUN: 'true' });
      expect(summary).toMatch(/seriam publicadas a partir de 0123456789abcdef0123456789abcdef01234567 \(ensaio: nada publicado\)/);
      expect(summary).toContain('- `asaas-webhook` (sem JWT)');
      expect(summary).toContain('- `notify-dispatch` (sem JWT)');
      expect(summary).toContain('- `background-check-purge` (sem JWT)');
      expect(summary).toContain('- `charges-create`\n');
      expect(summary).toContain('- `quote-assist`\n');
      expect(summary).not.toMatch(/_shared|_runtime/);
      expect(calls).toBe('');
    });

    it('a publicação de verdade publica a mesma lista, com --no-verify-jwt só nas três', () => {
      runStep('Listar as Edge Functions a publicar', { DRY_RUN: 'false' });
      const { calls, summary } = runStep('Publicar Edge Functions', {});
      expect(calls.trim().split('\n')).toEqual([
        'functions deploy asaas-webhook --remote=abcdefghijklmnopqrst --yes --no-verify-jwt',
        'functions deploy notify-dispatch --remote=abcdefghijklmnopqrst --yes --no-verify-jwt',
        'functions deploy background-check-purge --remote=abcdefghijklmnopqrst --yes --no-verify-jwt',
        'functions deploy charges-create --remote=abcdefghijklmnopqrst --yes',
        'functions deploy quote-assist --remote=abcdefghijklmnopqrst --yes',
      ]);
      expect(summary).toMatch(/Edge Functions a publicar a partir de/);
      expect(summary).toMatch(/Edge Functions publicadas:/);
    });

    it('commit antigo sem uma das funções sem JWT: aviso, e as outras seguem', () => {
      rmSync(join(dir, 'supabase', 'functions', 'background-check-purge'), { recursive: true });
      const { stdout, summary } = runStep('Listar as Edge Functions a publicar', { DRY_RUN: 'true' });
      expect(stdout).toMatch(/::warning::background-check-purge não existe neste commit/);
      expect(summary).not.toMatch(/background-check-purge/);
      expect(summary).toContain('- `asaas-webhook` (sem JWT)');
    });

    it('o resumo do ensaio diz que nada foi publicado e o que uma execução de verdade faria', () => {
      const withRef = runStep('Registrar o ensaio', { DEPLOY_FUNCTIONS: 'true', REQUESTED_REF: 'abc1234' }).summary;
      expect(withRef).toMatch(/\*\*Ensaio \(dry_run\): nada foi publicado\.\*\*/);
      expect(withRef).toMatch(/publicaria só as funções listadas/);
      rmSync(join(dir, 'summary.md'));
      expect(runStep('Registrar o ensaio', { DEPLOY_FUNCTIONS: 'false', REQUESTED_REF: '' }).summary).toMatch(
        /aplicaria as migrations listadas e o catálogo; a publicação das funções não foi pedida/,
      );
    });

    it('a lista de migrations pendentes vai para o resumo, e uma falha da CLI derruba o passo', () => {
      fakeBin('supabase', 'echo "Would push these migrations: 20261201000001_x.sql"');
      expect(runStep('Listar migrations pendentes', { DRY_RUN: 'true' }).summary).toMatch(
        /seriam aplicadas \(ensaio: nada aplicado\):\n```\nWould push these migrations: 20261201000001_x\.sql\n```/,
      );
      fakeBin('supabase', 'echo falhou\nexit 3');
      expect(exec('Listar migrations pendentes', { DRY_RUN: 'true' }).status).not.toBe(0);
    });
  });
});

describe('deploy-supabase.yml: comandos da CLI 3', () => {
  const text = read('deploy-supabase.yml');
  it('usa --remote (o --linked é obsoleto na CLI 3) e --yes nas mudanças do projeto hospedado', () => {
    expect(text).not.toMatch(/--linked/);
    expect(text).toMatch(/supabase db push --remote --skip-vault --dry-run/);
    expect(text).toMatch(/supabase db push --remote --skip-vault --yes/);
    expect(text).toMatch(/supabase db query --remote --yes -f supabase\/catalog\.sql/);
  });
});
