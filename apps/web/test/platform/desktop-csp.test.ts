// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The desktop shell (Tauri): the release and development policies in src-tauri/tauri.conf.json.
const ROOT = process.cwd();
const read = (...parts: string[]): string => readFileSync(join(ROOT, ...parts), 'utf8');

const config = JSON.parse(read('src-tauri', 'tauri.conf.json')) as { app: { security: { csp: string; devCsp: string } } };

/** "directive value value; directive value" as a Map of directive to its values. */
const directives = (csp: string): Map<string, string[]> =>
  new Map(
    csp
      .split(';')
      .map(part => part.trim().split(/\s+/))
      .filter(([name]) => name !== '')
      .map(([name, ...values]): [string, string[]] => [name, values]),
  );

const RELEASE = directives(config.app.security.csp);
const DEVELOPMENT = directives(config.app.security.devCsp);
const NATIVO = read('docs', 'arquitetura', 'nativo.md');

const SENTRY = ['https://*.ingest.sentry.io', 'https://*.ingest.de.sentry.io', 'https://*.ingest.us.sentry.io'];
// ipc: and http://ipc.localhost are Tauri's internal channel (macOS and Linux, and Windows).
const RELEASE_CONNECT = ["'self'", 'ipc:', 'http://ipc.localhost', 'https://*.supabase.co', ...SENTRY];
const DEVELOPMENT_ONLY_CONNECT = ['ws://localhost:3000', 'http://localhost:3000'];

describe('desktop: connect-src lista só os hosts que o app usa', () => {
  it('a política de release tem exatamente esses hosts', () => {
    expect(RELEASE.get('connect-src')).toEqual(RELEASE_CONNECT);
  });

  it('a política de desenvolvimento usa os mesmos hosts mais o servidor do Vite', () => {
    expect([...(DEVELOPMENT.get('connect-src') ?? [])].sort()).toEqual([...RELEASE_CONNECT, ...DEVELOPMENT_ONLY_CONNECT].sort());
  });

  it('nenhuma das duas tem websocket do Supabase: o app não abre canal Realtime', () => {
    for (const d of [RELEASE, DEVELOPMENT]) {
      expect((d.get('connect-src') ?? []).filter(value => value.startsWith('wss:'))).toEqual([]);
    }
  });

  it.each([...new Set([...RELEASE_CONNECT, ...DEVELOPMENT_ONLY_CONNECT])].filter(value => value !== "'self'"))(
    'nativo.md explica o motivo de %s',
    host => {
      expect(NATIVO).toContain(host);
    },
  );

  it('a página não chama o canal IPC: nenhum comando registrado e nenhuma API JS do Tauri', () => {
    expect(read('src-tauri', 'src', 'lib.rs')).not.toMatch(/generate_handler|invoke_handler/);
    expect(read('package.json')).not.toContain('@tauri-apps/api');
    expect(JSON.parse(read('src-tauri', 'capabilities', 'default.json')).permissions).toEqual([]);
  });
});

describe('desktop: a política de release continua fechada', () => {
  it('script, objetos, base e formulários só para o próprio app', () => {
    expect(RELEASE.get('default-src')).toEqual(["'self'"]);
    expect(RELEASE.get('script-src')).toEqual(["'self'"]);
    expect(RELEASE.get('object-src')).toEqual(["'none'"]);
    expect(RELEASE.get('base-uri')).toEqual(["'self'"]);
    expect(RELEASE.get('form-action')).toEqual(["'self'"]);
  });

  it('nenhuma diretiva de release tem unsafe-eval, e script não tem unsafe-inline', () => {
    for (const [, values] of RELEASE) expect(values).not.toContain("'unsafe-eval'");
    expect(RELEASE.get('script-src')).not.toContain("'unsafe-inline'");
  });

  it('img-src não tem host do Supabase: os documentos assinados abrem em link', () => {
    expect(RELEASE.get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
  });
});
