// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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

  it('com ref e dry_run ligado, as funções não são publicadas', () => {
    const start = text.indexOf('- name: Publicar Edge Functions');
    const block = text.slice(start, text.indexOf('run:', start));
    expect(block).toMatch(/inputs\.deploy_functions && \(inputs\.ref == '' \|\| !inputs\.dry_run\)/);
  });

  it('continua só em main e dentro do ambiente production', () => {
    expect(text).toMatch(/\$GITHUB_REF" != "refs\/heads\/main"/);
    expect(text).toMatch(/environment:\s+name: production/);
  });
});
