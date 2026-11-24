// @vitest-environment node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// scripts/healthcheck.mjs contra um servidor HTTP local que imita o site: nenhum acesso à rede externa.
const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'healthcheck.mjs');
const HEADERS_FILE = readFileSync(join(ROOT, 'public', '_headers'), 'utf8');

/** Cabeçalhos da regra de todas as rotas (/*) de public/_headers: o que o site publicado deve enviar. */
const siteHeaders = (): Record<string, string> => {
  const block = HEADERS_FILE.split('\n\n')[0].split('\n').slice(1);
  const headers: Record<string, string> = {};
  for (const line of block) {
    const index = line.indexOf(':');
    headers[line.slice(0, index).trim().toLowerCase()] = line.slice(index + 1).trim();
  }
  return headers;
};

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server;
let base: string;
let handler: Handler;

const html = '<!doctype html><html lang="pt-BR"><head><title>WorkEasy</title></head><body><div id="root"></div></body></html>';

/** Resposta saudável: 200, HTML e todos os cabeçalhos do arquivo. `omit` e `override` criam defeitos. */
const healthy =
  (options: { omit?: string[]; override?: Record<string, string>; status?: number; contentType?: string; body?: string } = {}): Handler =>
  (_req, res) => {
    const headers = { ...siteHeaders(), ...options.override };
    for (const name of options.omit ?? []) delete headers[name];
    res.writeHead(options.status ?? 200, { 'content-type': options.contentType ?? 'text/html; charset=utf-8', ...headers });
    res.end(options.body ?? html);
  };

beforeEach(async () => {
  handler = healthy();
  server = createServer((req, res) => handler(req, res));
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>(done => server.close(() => done()));
});

interface Run {
  code: number | null;
  out: string;
  err: string;
}

/** Roda o script como o agendador roda: processo à parte, sem herdar VITE_SITE_URL do ambiente do teste. */
const run = (args: string[], env: Record<string, string> = {}): Promise<Run> =>
  new Promise((resolve, reject) => {
    const { VITE_SITE_URL: _ignored, ...rest } = process.env;
    void _ignored;
    const child = spawn(process.execPath, [SCRIPT, ...args], { env: { ...rest, ...env } });
    let out = '';
    let err = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.stderr.on('data', chunk => (err += chunk));
    child.on('error', reject);
    child.on('close', code => resolve({ code, out, err }));
  });

describe('healthcheck.mjs', () => {
  it('passa com 200 e todos os cabeçalhos de segurança (HSTS é ignorado em http)', async () => {
    const result = await run(['--url', base]);
    expect(result.err).toBe('');
    expect(result.code).toBe(0);
    expect(result.out).toContain(`ok     ${base}/ (HTTP 200)`);
    expect(result.out).toContain('Healthcheck ok: 1 página(s).');
  });

  it('lê o endereço de VITE_SITE_URL quando não há --url', async () => {
    const result = await run([], { VITE_SITE_URL: base });
    expect(result.code).toBe(0);
  });

  it('confere várias páginas e segue um redirecionamento na mesma origem', async () => {
    handler = (req, res) => {
      if (req.url === '/servicos') {
        res.writeHead(308, { location: '/servicos/' });
        res.end();
        return;
      }
      healthy()(req, res);
    };
    const result = await run(['--url', base, '--paths', '/,/servicos']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Healthcheck ok: 2 página(s).');
  });

  it('falha quando uma página responde 500', async () => {
    handler = (req, res) => (req.url === '/servicos' ? healthy({ status: 500 })(req, res) : healthy()(req, res));
    const result = await run(['--url', base, '--paths', '/,/servicos']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('FALHA');
    expect(result.err).toContain('HTTP 500');
    expect(result.err).toContain('1 de 2 página(s) com falha');
    expect(result.out).toContain(`ok     ${base}/ (HTTP 200)`);
  });

  it('falha quando falta um cabeçalho de segurança', async () => {
    handler = healthy({ omit: ['content-security-policy'] });
    const result = await run(['--url', base]);
    expect(result.code).toBe(1);
    expect(result.err).toContain('cabeçalho ausente: content-security-policy');
  });

  it('falha quando um cabeçalho difere do arquivo public/_headers', async () => {
    handler = healthy({ override: { 'x-frame-options': 'SAMEORIGIN' } });
    const result = await run(['--url', base]);
    expect(result.code).toBe(1);
    expect(result.err).toContain('cabeçalho diferente de public/_headers: x-frame-options');
  });

  it('falha quando a resposta não é HTML', async () => {
    handler = healthy({ contentType: 'application/json', body: '{"ok":true}' });
    const result = await run(['--url', base]);
    expect(result.code).toBe(1);
    expect(result.err).toContain('content-type');
  });

  it('falha quando o redirecionamento sai da origem', async () => {
    handler = (_req, res) => {
      res.writeHead(302, { location: 'http://example.invalid/' });
      res.end();
    };
    const result = await run(['--url', base]);
    expect(result.code).toBe(1);
    expect(result.err).toContain('outra origem');
  });

  it('falha quando ninguém atende (conexão recusada)', async () => {
    const closed = createServer();
    await new Promise<void>(done => closed.listen(0, '127.0.0.1', done));
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>(done => closed.close(() => done()));
    const result = await run(['--url', `http://127.0.0.1:${port}`, '--timeout', '2000']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('falha de rede');
  });

  it('falha quando o servidor não responde dentro do prazo', async () => {
    handler = () => undefined; // aceita a conexão e nunca responde
    const result = await run(['--url', base, '--timeout', '300']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('sem resposta em 300 ms');
  });

  it('sai com 2 sem endereço, com endereço inválido ou com opção desconhecida', async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(['--url', 'ftp://exemplo'])).code).toBe(2);
    expect((await run(['--url', base, '--paths', 'servicos'])).code).toBe(2);
    expect((await run(['--url', base, '--timeout', 'abc'])).code).toBe(2);
    expect((await run(['--url', base, '--nope'])).code).toBe(2);
  });
});
