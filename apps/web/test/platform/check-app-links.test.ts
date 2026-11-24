// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error the script is plain JavaScript, with no type declarations
import { checkAppLinks, entitlementDomains, FILES, isPlaceholderHost, manifestHosts } from '../../scripts/check-app-links.mjs';

// scripts/check-app-links.mjs: the deep-link files of Android and iOS say the same thing, and what the owner
// still has to fill in is listed. Run on a copy of the real files, then on copies broken one way at a time.

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'check-app-links.mjs');

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** A copy of the files the script reads, so a test can change one without touching the repository. */
const copyOfRepo = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'check-app-links-'));
  made.push(root);
  for (const file of Object.values(FILES) as string[]) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    cpSync(join(ROOT, file), join(root, file));
  }
  return root;
};
const edit = (root: string, key: keyof typeof FILES, change: (text: string) => string) => {
  const path = join(root, FILES[key]);
  const before = readFileSync(path, 'utf8');
  const after = change(before);
  expect(after, `a mudança em ${FILES[key]} não alterou nada`).not.toBe(before);
  writeFileSync(path, after);
};
const run = (root: string, ...args: string[]) =>
  spawnSync(process.execPath, [SCRIPT, '--root', root, ...args], { encoding: 'utf8' });

const FINGERPRINT = Array.from({ length: 32 }, (_, i) => (i * 7 + 10).toString(16).toUpperCase().padStart(2, '0').slice(-2)).join(':');

describe('check-app-links on the files of the repository', () => {
  it('finds them coherent, and lists the four things only the owner can fill in', () => {
    const { errors, pending } = checkAppLinks(ROOT);
    expect(errors).toEqual([]);
    expect(pending).toHaveLength(4);
    expect(pending.join('\n')).toMatch(/manifest.*exemplo/is);
    expect(pending.join('\n')).toMatch(/assetlinks.*SHA-256/s);
    expect(pending.join('\n')).toMatch(/apple-app-site-association.*Team ID/s);
    expect(pending.join('\n')).toMatch(/App\.entitlements.*exemplo/s);
  });

  it('exits 0 without --strict and 1 with it, while the placeholders are there', () => {
    const lenient = run(ROOT);
    expect(lenient.status).toBe(0);
    expect(lenient.stdout).toContain('PENDENTE');
    const strict = run(ROOT, '--strict');
    expect(strict.status).toBe(1);
    expect(strict.stderr).toContain('PENDENTE');
    expect(strict.stderr).toContain('--strict');
  });

  it('registers the entitlements file in the Xcode project and in the target', () => {
    const project = readFileSync(join(ROOT, FILES.pbxproj), 'utf8');
    expect(project.match(/CODE_SIGN_ENTITLEMENTS = App\/App\.entitlements;/g)).toHaveLength(2); // Debug and Release
    expect(project).toContain('path = App.entitlements;');
  });
});

describe('check-app-links with everything filled in', () => {
  const filled = () => {
    const root = copyOfRepo();
    edit(root, 'manifest', text => text.replaceAll('app.workeasy.example', 'app.workeasy.com.br'));
    edit(root, 'entitlements', text => text.replaceAll('app.workeasy.example', 'app.workeasy.com.br'));
    edit(root, 'assetlinks', text => text.replace(/"TODO[^"]*"/, `"${FINGERPRINT}"`));
    edit(root, 'aasa', text => text.replace('TODO-TEAM-ID', 'ABCDE12345'));
    return root;
  };

  it('passes --strict, and compares the host with the site URL', () => {
    const root = filled();
    expect(checkAppLinks(root, { siteUrl: 'https://app.workeasy.com.br' })).toEqual({ errors: [], pending: [], info: [] });
    const strict = run(root, '--strict', '--site-url', 'https://app.workeasy.com.br');
    expect(strict.status).toBe(0);
    expect(strict.stdout).toContain('sem pendências');
  });

  it('refuses a site URL on another host', () => {
    const { errors } = checkAppLinks(filled(), { siteUrl: 'https://www.workeasy.com.br' });
    expect(errors.join('\n')).toContain('"www.workeasy.com.br"');
  });
});

describe('check-app-links finds files that contradict each other', () => {
  it('a different host on iOS', () => {
    const root = copyOfRepo();
    edit(root, 'entitlements', text => text.replaceAll('app.workeasy.example', 'outro.workeasy.example'));
    expect(checkAppLinks(root).errors.join('\n')).toMatch(/outro\.workeasy\.example.*difere do host do manifesto/);
    expect(run(root).status).toBe(1);
  });

  it('a different package in assetlinks.json', () => {
    const root = copyOfRepo();
    edit(root, 'assetlinks', text => text.replace('br.com.workeasy', 'br.com.outro'));
    expect(checkAppLinks(root).errors.join('\n')).toMatch(/package_name "br\.com\.outro" difere do appId "br\.com\.workeasy"/);
  });

  it('a different bundle id in the apple-app-site-association', () => {
    const root = copyOfRepo();
    edit(root, 'aasa', text => text.replace('br.com.workeasy', 'br.com.outro'));
    expect(checkAppLinks(root).errors.join('\n')).toMatch(/bundle id.*difere do appId/);
  });

  it('a fingerprint that is not 32 uppercase hexadecimal pairs', () => {
    const root = copyOfRepo();
    edit(root, 'assetlinks', text => text.replace(/"TODO[^"]*"/, '"aa:bb:cc"'));
    expect(checkAppLinks(root).errors.join('\n')).toContain('fora do formato AA:BB');
  });

  it('a Team ID that is not 10 characters', () => {
    const root = copyOfRepo();
    edit(root, 'aasa', text => text.replace('TODO-TEAM-ID', 'abc'));
    expect(checkAppLinks(root).errors.join('\n')).toContain('Team ID "abc" fora do formato');
  });

  it('applicationId and bundle identifier that differ from the Capacitor appId', () => {
    const root = copyOfRepo();
    edit(root, 'gradle', text => text.replace('applicationId "br.com.workeasy"', 'applicationId "br.com.outro"'));
    edit(root, 'pbxproj', text => text.replaceAll('PRODUCT_BUNDLE_IDENTIFIER = br.com.workeasy;', 'PRODUCT_BUNDLE_IDENTIFIER = br.com.outro;'));
    const errors = checkAppLinks(root).errors.join('\n');
    expect(errors).toContain('applicationId "br.com.outro"');
    expect(errors).toContain('PRODUCT_BUNDLE_IDENTIFIER "br.com.outro"');
  });

  it('a Capacitor config that points the store build at a server', () => {
    const root = copyOfRepo();
    edit(root, 'capacitor', text => text.replace("androidScheme: 'https',", "androidScheme: 'https',\n    url: 'https://dev.example.com',\n    hostname: 'app.workeasy.example',"));
    const errors = checkAppLinks(root).errors.join('\n');
    expect(errors).toContain('"server.url" definido');
    expect(errors).toContain('"server.hostname"');
  });

  it('an Xcode project without the entitlements, and a missing file', () => {
    const root = copyOfRepo();
    edit(root, 'pbxproj', text => text.replaceAll('CODE_SIGN_ENTITLEMENTS = App/App.entitlements;', ''));
    expect(checkAppLinks(root).errors.join('\n')).toContain('não aponta para App/App.entitlements');
    rmSync(join(root, FILES.entitlements));
    expect(checkAppLinks(root).errors.join('\n')).toContain('App.entitlements: arquivo não encontrado');
  });

  it('a manifest with no verified https host', () => {
    const root = copyOfRepo();
    edit(root, 'manifest', text => text.replace('android:autoVerify="true"', ''));
    expect(checkAppLinks(root).errors.join('\n')).toContain('nenhum intent-filter com android:autoVerify');
  });
});

describe('helpers', () => {
  it('knows the hosts that cannot be the real one', () => {
    for (const host of ['app.workeasy.example', 'localhost', 'meu.site.test', 'x.invalid', 'www.example.com', 'TODO-dominio']) {
      expect(isPlaceholderHost(host), host).toBe(true);
    }
    for (const host of ['app.workeasy.com.br', 'workeasy.app', 'examples.com.br']) expect(isPlaceholderHost(host), host).toBe(false);
  });

  it('reads only the https hosts of the intent filters that ask for verification', () => {
    const xml = `<manifest><application><activity>
      <!-- <intent-filter android:autoVerify="true"><data android:scheme="https" android:host="comentado.com.br" /></intent-filter> -->
      <intent-filter><data android:scheme="https" android:host="sem-verificacao.com.br" /></intent-filter>
      <intent-filter android:autoVerify="true"><action android:name="android.intent.action.VIEW" />
        <data android:scheme="https" android:host="App.Exemplo.com.br" /><data android:scheme="http" android:host="http.com.br" /></intent-filter>
    </activity></application></manifest>`;
    expect(manifestHosts(xml)).toEqual(['app.exemplo.com.br']);
  });

  it('reads the associated domains and ignores the comment', () => {
    const plist = `<plist><dict><!-- <string>applinks:comentado</string> -->
      <key>com.apple.developer.associated-domains</key><array><string>applinks:a.com.br</string><string>webcredentials:b.com.br</string></array></dict></plist>`;
    expect(entitlementDomains(plist)).toEqual(['applinks:a.com.br', 'webcredentials:b.com.br']);
    expect(entitlementDomains('<plist><dict/></plist>')).toBeNull();
  });
});
