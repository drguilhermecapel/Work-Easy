import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// The gate is a plain Node script: run it the way `npm run check:size` does, on a throwaway dist.
const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'check-bundle-size.mjs');

const made: string[] = [];

/** A dist folder whose index.html loads one entry script of the given contents. */
const makeDist = (entry: Buffer): string => {
  const dist = mkdtempSync(join(tmpdir(), 'check-size-'));
  made.push(dist);
  mkdirSync(join(dist, 'assets'));
  writeFileSync(join(dist, 'assets', 'index-AbC123xY.js'), entry);
  writeFileSync(
    join(dist, 'index.html'),
    '<!doctype html><script type="module" src="/assets/index-AbC123xY.js"></script>',
  );
  return dist;
};

const runGate = (dist: string) =>
  spawnSync(process.execPath, [SCRIPT, '--dist', dist], { encoding: 'utf8' });

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('check-bundle-size', () => {
  it('passes a build well inside the budgets', () => {
    const result = runGate(makeDist(Buffer.from('console.log("hello");'.repeat(20))));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('carga inicial');
    expect(result.stdout).not.toContain('ACIMA');
  });

  it('fails when the first load grows past its budget, and names the line that is over', () => {
    // Random bytes do not compress: 250 kB of them is about 250 kB of gzip, over the 190 kB initial budget.
    const heavy = Buffer.from(randomBytes(250_000).toString('base64'));
    const result = runGate(makeDist(heavy));
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('ACIMA');
    expect(result.stderr).toContain('orçamento(s) estourado(s)');
  });

  it('budgets only the optional map distribution separately, including its worker', () => {
    const dist = makeDist(Buffer.from('0'));
    const name = 'maplibre-gl-csp-AbC123xY.js';
    writeFileSync(join(dist, 'assets', name), randomBytes(220_000));
    expect(runGate(dist).status).toBe(0);
    writeFileSync(join(dist, 'assets', 'maplibre-gl-csp-worker-AbC123xY.js'), randomBytes(220_000));
    expect(runGate(dist).stdout).toMatch(/ACIMA mapa opcional/);
    writeFileSync(join(dist, 'index.html'), '<script src="/assets/' + name + '"></script>');
    expect(runGate(dist).stdout).toMatch(/ACIMA carga inicial/);
    writeFileSync(join(dist, 'assets', 'OutraPagina-AbC123xY.js'), randomBytes(19_000));
    expect(runGate(dist).stdout).toMatch(/ACIMA maior página/);
  });

  it('keeps the per-page limit on optional mobility routes and adds their combined cost', () => {
    const dist = makeDist(Buffer.from('0'));
    const chunk = (name: string, bytes = 14_000) => writeFileSync(join(dist, 'assets', name + '-AbC123xY.js'), randomBytes(bytes));
    // Six rider, driver and operation chunks at 14 kB: 84 kB, inside the 150 kB of the group
    for (const name of ['Corridas', 'Motorista', 'Operacao', 'RideDriverIdentity', 'RideAftercare', 'RideCheckout']) chunk(name);
    expect(runGate(dist).status).toBe(0);
    // The pages of groups, company and fleet, the invite views and the operator console belong to the same group
    for (const name of ['Grupos', 'Empresa', 'Frota', 'FleetPanel', 'RideParties', 'AccountInvite']) chunk(name);
    const over = runGate(dist);
    expect(over.stdout).toMatch(/ACIMA jornadas opcionais/);
    expect(over.stdout).not.toMatch(/ACIMA JavaScript do app/);
    chunk('Corridas', 17_000);
    expect(runGate(dist).stdout).toMatch(/ACIMA maior página/);
  });

  it('charges a mobility chunk that index.html loads to the first load, not to the optional group', () => {
    const dist = makeDist(Buffer.from('0'));
    const name = 'Grupos-AbC123xY.js';
    writeFileSync(join(dist, 'assets', name), randomBytes(200_000));
    writeFileSync(join(dist, 'index.html'), '<script src="/assets/' + name + '"></script>');
    const result = runGate(dist);
    expect(result.stdout).toMatch(/ACIMA carga inicial/);
    expect(result.stdout).not.toMatch(/ACIMA jornadas opcionais/);
  });

  it('exits with 2 when there is no build to read', () => {
    const missing = join(tmpdir(), `check-size-missing-${process.pid}-${Date.now()}`);
    const result = runGate(missing);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('rode "npm run build" antes');
  });
});
