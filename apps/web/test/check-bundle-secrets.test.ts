// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// The gate is a plain Node script: run it the way the workflows do, on a throwaway dist.
const SCRIPT = join(process.cwd(), 'scripts', 'check-bundle-secrets.mjs');

const jwt = (role: string) =>
  [{ alg: 'HS256', typ: 'JWT' }, { iss: 'supabase', ref: 'abcdefghijklmnop', role, iat: 1700000000, exp: 2000000000 }]
    .map(part => Buffer.from(JSON.stringify(part)).toString('base64url'))
    .join('.') + '.c2lnbmF0dXJlLW5vdC1yZWFs';

const made: string[] = [];
const makeDist = (js: string): string => {
  const dist = mkdtempSync(join(tmpdir(), 'check-secrets-'));
  made.push(dist);
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'index-AbC123xY.js'), js);
  writeFileSync(join(dist, 'index.html'), '<!doctype html><script type="module" src="/assets/index-AbC123xY.js"></script>');
  return dist;
};
const run = (args: string[], env: Record<string, string> = {}) =>
  spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, ...env } });

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('check-bundle-secrets', () => {
  it('passes a bundle with the publishable key or the legacy anon key', () => {
    const dist = makeDist(`const key="sb_publishable_abc123";const old="${jwt('anon')}";`);
    const result = run(['--dist', dist]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('nenhum segredo');
  });

  it('refuses a secret key by its prefix', () => {
    const result = run(['--dist', makeDist('const key="sb_secret_abc123";')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('assets/index-AbC123xY.js');
    expect(result.stderr).toContain('sb_secret_');
  });

  it('refuses a legacy service_role key, which has no telling prefix', () => {
    const result = run(['--dist', makeDist(`const key="${jwt('service_role')}";`)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('service_role');
    // the key itself is never printed
    expect(result.stderr).not.toContain(jwt('service_role'));
  });

  it('checks the key the build was given, before it is embedded', () => {
    expect(run(['--dist', makeDist('ok'), '--env'], { VITE_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') }).status).toBe(1);
    expect(run(['--dist', makeDist('ok'), '--env'], { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_x' }).status).toBe(1);
    expect(run(['--dist', makeDist('ok'), '--env'], { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }).status).toBe(0);
    expect(run(['--dist', makeDist('ok'), '--env'], { VITE_SUPABASE_PUBLISHABLE_KEY: jwt('anon') }).status).toBe(0);
  });

  it('says when there is no build to check', () => {
    const result = run(['--dist', join(tmpdir(), 'no-such-dist-folder')]);
    expect(result.status).toBe(2);
  });
});
