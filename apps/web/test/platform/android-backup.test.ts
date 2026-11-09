// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Android backup: the manifest turns it off, and the data extraction rules exclude every domain
// (cloud backup and device-to-device transfer) in case it is turned on later.
const ROOT = process.cwd();
const ANDROID = join(ROOT, 'android');
const RES_XML = join(ANDROID, 'app', 'src', 'main', 'res', 'xml');
const manifest = readFileSync(join(ANDROID, 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
const rules = readFileSync(join(RES_XML, 'data_extraction_rules.xml'), 'utf8');

/** The body of one section of the rules file (cloud-backup or device-transfer). */
const section = (name: 'cloud-backup' | 'device-transfer'): string => {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(rules);
  if (!match) throw new Error(`<${name}> is missing from data_extraction_rules.xml`);
  return match[1];
};

const EVERY_DOMAIN = [
  'root',
  'file',
  'database',
  'sharedpref',
  'external',
  'device_root',
  'device_file',
  'device_database',
  'device_sharedpref',
];

/** AndroidManifest.xml files under android/, excluding build output. */
const manifests = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return ['build', '.gradle', 'node_modules'].includes(entry.name) ? [] : manifests(full);
    return entry.name === 'AndroidManifest.xml' ? [full] : [];
  });

describe('Android: backup desligado no manifesto', () => {
  it('o application tem allowBackup="false" e aponta para as regras de extração', () => {
    expect(manifest).toMatch(/<application\b[^>]*\sandroid:allowBackup="false"/);
    expect(manifest).toMatch(/<application\b[^>]*\sandroid:dataExtractionRules="@xml\/data_extraction_rules"/);
    expect(existsSync(join(RES_XML, 'data_extraction_rules.xml'))).toBe(true);
  });

  it('nenhum AndroidManifest.xml do projeto liga o backup', () => {
    const files = manifests(ANDROID);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(readFileSync(file, 'utf8'), file).not.toMatch(/allowBackup="true"/);
  });
});

describe('Android: regras de extração excluem tudo', () => {
  it.each(['cloud-backup', 'device-transfer'] as const)('%s exclui todos os domínios na raiz', name => {
    const body = section(name);
    const excluded = [...body.matchAll(/<exclude\s+domain="([a-z_]+)"\s+path="([^"]*)"\s*\/>/g)].map(match => ({
      domain: match[1],
      path: match[2],
    }));
    expect(excluded.map(item => item.domain).sort()).toEqual([...EVERY_DOMAIN].sort());
    for (const item of excluded) expect(item.path, item.domain).toBe('.');
  });

  it.each(['cloud-backup', 'device-transfer'] as const)('%s não inclui nenhum caminho', name => {
    expect(section(name)).not.toMatch(/<include\b/);
  });
});
