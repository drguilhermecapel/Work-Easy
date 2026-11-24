// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error the script is plain JavaScript, with no type declarations
import { storeOfBundleText, storeOfDist } from '../../scripts/check-store-bundle.mjs';

// scripts/check-store-bundle.mjs reads back the store a web bundle was built for (VITE_STORE_BUILD).
// The snippets are the shape the minifier gives config/features.ts in a real build (checked on the
// output of `VITE_STORE_BUILD=android vite build --mode native`, 24/11/2026).

const SCRIPT = join(process.cwd(), 'scripts', 'check-store-bundle.mjs');
const features = (storeFn: string) =>
  `const Vn=${storeFn},Hn=()=>[],Un={get storeBuild(){return Vn()},get proSalesEnabled(){return Vn()===null},get careLineInBuild(){return Vn()===null},get aiAssistInBuild(){return Vn()!==\`ios\`}};`;

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const makeDist = (...bundles: string[]): string => {
  const dist = mkdtempSync(join(tmpdir(), 'check-store-'));
  made.push(dist);
  mkdirSync(join(dist, 'assets'));
  bundles.forEach((text, index) => writeFileSync(join(dist, 'assets', `chunk-${index}.js`), text));
  writeFileSync(join(dist, 'index.html'), '<!doctype html>');
  return dist;
};
const run = (...args: string[]) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

describe('storeOfBundleText', () => {
  it.each([
    ['()=>`android`', 'android'],
    ['()=>`ios`', 'ios'],
    ['()=>null', 'none'],
    ['()=>"android"', 'android'],
  ])('reads %s as %s', (fn, store) => {
    expect(storeOfBundleText(features(fn))).toBe(store);
  });

  it('is not fooled by another constant with the same shape', () => {
    // the name Vn must be the one the careLineInBuild getter calls
    const text = `const Zz=()=>\`ios\`;const Vn=()=>null;get careLineInBuild(){return Vn()===null}`;
    expect(storeOfBundleText(text)).toBe('none');
  });

  it('answers null when there is no features object or its function was not folded', () => {
    expect(storeOfBundleText('console.log(1)')).toBeNull();
    expect(storeOfBundleText('const Vn=()=>process.env.X;get careLineInBuild(){return Vn()===null}')).toBeNull();
  });
});

describe('storeOfDist and the command', () => {
  it('finds the store in whichever chunk carries it', () => {
    const dist = makeDist('console.log(1)', features('()=>`android`'));
    expect(storeOfDist(dist)).toBe('android');
  });

  it('says "conflict" when two chunks disagree', () => {
    expect(storeOfDist(makeDist(features('()=>`android`'), features('()=>null')))).toBe('conflict');
  });

  it('passes the expected store and fails another, saying how to redo the build', () => {
    const dist = makeDist(features('()=>`android`'));
    const ok = run('--store', 'android', '--dist', dist);
    expect(ok.status).toBe(0);
    expect(ok.stdout).toContain('de loja (android)');
    const wrong = run('--store', 'none', '--dist', dist);
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain('"android"');
    const other = run('--store', 'ios', '--dist', dist);
    expect(other.status).toBe(1);
    expect(other.stderr).toContain('VITE_STORE_BUILD=ios');
  });

  it('recognizes a plain build as "none"', () => {
    expect(run('--store', 'none', '--dist', makeDist(features('()=>null'))).status).toBe(0);
    expect(run('--store', 'android', '--dist', makeDist(features('()=>null'))).status).toBe(1);
  });

  it('exits 2 when there is nothing to read or the arguments are wrong', () => {
    expect(run('--store', 'android', '--dist', join(tmpdir(), 'nao-existe-check-store')).status).toBe(2);
    expect(run('--store', 'android', '--dist', makeDist('console.log(1)')).status).toBe(2);
    expect(run('--dist', makeDist(features('()=>null'))).status).toBe(2);
    expect(run('--store', 'windows', '--dist', makeDist(features('()=>null'))).status).toBe(2);
  });
});
