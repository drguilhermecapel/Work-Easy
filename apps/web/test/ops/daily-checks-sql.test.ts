// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// scripts/ops-daily-checks.sql roda em produção, no SQL Editor, por quem tem acesso ao banco.
// Ele precisa continuar somente leitura: este teste é a trava contra uma escrita acidental.
const ROOT = process.cwd();
const sql = readFileSync(join(ROOT, 'scripts', 'ops-daily-checks.sql'), 'utf8');

/** O SQL sem comentários (-- e blocos) e sem o conteúdo de strings, para procurar comandos. */
const stripSql = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");

const code = stripSql(sql);
const statements = code
  .split(';')
  .map(part => part.trim())
  .filter(Boolean);

const WRITE_WORDS = [
  'insert',
  'update',
  'delete',
  'alter',
  'create',
  'drop',
  'grant',
  'revoke',
  'truncate',
  'merge',
  'copy',
  'vacuum',
  'reindex',
  'cluster',
  'comment',
  'lock',
  'call',
  'do',
  'execute',
  'set',
  'reset',
  'listen',
  'notify',
  'refresh',
  'commit',
];

describe('ops-daily-checks.sql: somente leitura', () => {
  it('abre com begin read only e fecha com rollback', () => {
    expect(statements[0]).toMatch(/^begin read only$/i);
    expect(statements[statements.length - 1]).toMatch(/^rollback$/i);
  });

  it('só tem select (ou with ... select) entre o begin e o rollback', () => {
    const middle = statements.slice(1, -1);
    expect(middle.length).toBeGreaterThanOrEqual(11);
    for (const statement of middle) {
      expect(statement, statement.slice(0, 80)).toMatch(/^(select|with)\b/i);
    }
  });

  it.each(WRITE_WORDS)('não usa o comando %s fora de comentários', word => {
    expect(code).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
  });

  it('não trava linhas (for update/share) nem usa select into', () => {
    expect(code).not.toMatch(/\bfor\s+(no\s+key\s+)?(update|share)\b/i);
    expect(code).not.toMatch(/\binto\b/i);
  });

  it('não chama função de reparo, de envio ou de gravação', () => {
    for (const fn of [
      'expire_pro_plans',
      'run_retention_purge',
      'transition_booking',
      'private.audit',
      'http_post',
      'http_get',
      'cron.schedule',
      'cron.unschedule',
      'create_secret',
      'update_secret',
      'nextval',
      'setval',
      'pg_sleep',
      'pg_terminate_backend',
      'set_config',
    ]) {
      expect(code, fn).not.toContain(fn);
    }
  });

  it('nunca lê o valor de um segredo (só o nome, em vault.secrets)', () => {
    expect(code).not.toMatch(/\bdecrypted_secrets?\b/i);
    expect(code).not.toMatch(/\bsecret\s*,|\bsecret\s+from\b/i);
    expect(code).toMatch(/from vault\.secrets/i);
  });
});

describe('ops-daily-checks.sql: conteúdo', () => {
  const EXPECTED = ['S01', 'S03', 'S06', 'S07', 'S10', 'S14', 'S16', 'S17', 'S18', 'S20'];

  /** O bloco de comentários que começa no cabeçalho `-- Sxx. ...`. */
  const headerOf = (id: string): string => {
    const lines = sql.split('\n');
    const start = lines.findIndex(line => line.startsWith(`-- ${id}. `));
    if (start === -1) return '';
    const block: string[] = [];
    for (const line of lines.slice(start)) {
      if (!line.startsWith('--')) break;
      block.push(line);
    }
    return block.join('\n');
  };

  it.each(EXPECTED)('traz a consulta %s com título, significado e ação', id => {
    const header = headerOf(id);
    expect(header, `cabeçalho de ${id}`).not.toBe('');
    expect(header).toMatch(/Ação:/);
    // O que significa um resultado não vazio (ou, em S16 e S20, como ler).
    expect(header).toMatch(/Linha =|NÃO é "vazio = ok"|`overdue_queued` > 0/);
  });

  it('traz S21 (chaves do agendador, só nomes) e o painel final', () => {
    expect(headerOf('S21')).toMatch(/Ação:/);
    expect(sql).toMatch(/^-- PAINEL\./m);
  });

  it('o painel tem uma linha para cada verificação e é o último resultado', () => {
    const panel = sql.slice(sql.indexOf('with panel('));
    for (const id of [...EXPECTED, 'S20b', 'S21']) {
      expect(panel, id).toContain(`select '${id}'`);
    }
    expect(panel).toMatch(/order by id;\s*rollback;\s*$/i);
  });

  it('lê as tabelas do schema do produto', () => {
    for (const table of [
      'public.payment_events',
      'public.audit_log',
      'public.payments',
      'public.bookings',
      'public.provider_payment_accounts',
      'public.providers',
      'public.subscriptions',
      'public.notifications',
      'cron.job_run_details',
      'net._http_response',
    ]) {
      expect(code, table).toContain(table);
    }
  });
});
