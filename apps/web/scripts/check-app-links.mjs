#!/usr/bin/env node
// Checks that the deep-link setup of the native apps is coherent, and lists what is still a placeholder.
//
// An https link of the site opens the app only when five things say the same thing:
//   - Android: the host of the autoVerify intent filter in android/app/src/main/AndroidManifest.xml;
//   - Android: public/.well-known/assetlinks.json (package and SHA-256 of the signing certificate);
//   - iOS: the "applinks:" domain in ios/App/App/App.entitlements, registered in the Xcode project;
//   - iOS: public/.well-known/apple-app-site-association (Team ID and bundle id);
//   - the application id: capacitor.config.ts (appId), build.gradle (applicationId) and the Xcode
//     project (PRODUCT_BUNDLE_IDENTIFIER). The Capacitor config carries no link host on purpose: the
//     WebView origin is https://localhost / capacitor://localhost (CORS of the Edge Functions), and a
//     `server.url` or `server.hostname` there would point a store build somewhere else.
//
// Two kinds of finding, because the owner has not chosen the domain yet and the signing keys do not exist:
//   - ERRO: the files contradict each other or are malformed. Always fails (exit 1).
//   - PENDENTE: a placeholder is still there (example host, TODO fingerprint, TODO Team ID). Listed always;
//     fails (exit 1) only with --strict, so the CI that runs without it is not broken by the wait.
//
// Usage: node scripts/check-app-links.mjs [--strict] [--platform android|ios] [--site-url https://host] [--root <apps/web>]
//   --site-url (or VITE_SITE_URL) is also compared with the host of the manifest.
// Exit code: 0 = coherent (and, with --strict, nothing pending), 1 = error (or pending with --strict).
// The values to fill in, and where to get them: docs/arquitetura/nativo.md, section 8.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FILES = {
  manifest: 'android/app/src/main/AndroidManifest.xml',
  gradle: 'android/app/build.gradle',
  capacitor: 'capacitor.config.ts',
  assetlinks: 'public/.well-known/assetlinks.json',
  aasa: 'public/.well-known/apple-app-site-association',
  entitlements: 'ios/App/App/App.entitlements',
  pbxproj: 'ios/App/App.xcodeproj/project.pbxproj',
};

const FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const TEAM_ID = /^[A-Z0-9]{10}$/;
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** A host that cannot be the real one: reserved example domains (RFC 2606 and 6761), localhost, a TODO. */
export const isPlaceholderHost = host =>
  /todo/i.test(host) ||
  host === 'localhost' ||
  /(?:^|\.)(?:example|test|invalid|localhost)$/.test(host) ||
  /(?:^|\.)example\.(?:com|org|net)$/.test(host);

const read = (root, key, errors) => {
  const path = join(root, FILES[key]);
  if (!existsSync(path)) {
    errors.push(`${FILES[key]}: arquivo não encontrado.`);
    return null;
  }
  return readFileSync(path, 'utf8');
};

const parseJson = (text, key, errors) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`${FILES[key]}: JSON inválido (${error.message}).`);
    return null;
  }
};

const unique = list => [...new Set(list)];

/** Hosts of the intent filters that ask for verification (android:autoVerify="true"), https only. */
export const manifestHosts = xml => {
  const hosts = [];
  const withoutComments = xml.replace(/<!--[\s\S]*?-->/g, '');
  for (const filter of withoutComments.matchAll(/<intent-filter\b([^>]*)>([\s\S]*?)<\/intent-filter>/g)) {
    if (!/android:autoVerify\s*=\s*"true"/.test(filter[1])) continue;
    for (const data of filter[2].matchAll(/<data\b[^>]*>/g)) {
      const scheme = /android:scheme\s*=\s*"([^"]*)"/.exec(data[0])?.[1];
      const host = /android:host\s*=\s*"([^"]*)"/.exec(data[0])?.[1];
      if (host && scheme === 'https') hosts.push(host.toLowerCase());
    }
  }
  return unique(hosts);
};

/** Domains of the associated-domains entitlement ("applinks:host", without the ?mode= suffix). */
export const entitlementDomains = plist => {
  const text = plist.replace(/<!--[\s\S]*?-->/g, '');
  const block = /<key>com\.apple\.developer\.associated-domains<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(text);
  if (!block) return null;
  return [...block[1].matchAll(/<string>\s*([^<]*?)\s*<\/string>/g)].map(match => match[1]);
};

/** A TypeScript file without its whole-line and block comments (enough for the plain config object read here). */
const stripComments = source => (source === null ? null : source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, ''));

/** The string value of `key: 'value'` at any depth of a TypeScript config (the file is not executed). */
const configString = (source, key) => new RegExp(`(?:^|[\\s{,])${key}\\s*:\\s*['"\`]([^'"\`]*)['"\`]`, 'm').exec(source)?.[1];

/**
 * Checks the files under `root` (the apps/web folder). `siteUrl` is optional: the URL of the site the
 * build is made for (VITE_SITE_URL). Returns the errors (contradictions) and the pending items (placeholders).
 */
export const checkAppLinks = (root, { siteUrl } = {}) => {
  const errors = [];
  const pending = [];
  const info = [];

  // ---- the application id, in the three native projects -------------------------------------------------
  const gradle = read(root, 'gradle', errors);
  const pbxproj = read(root, 'pbxproj', errors);
  const capacitorConfig = stripComments(read(root, 'capacitor', errors));
  const appId = capacitorConfig ? configString(capacitorConfig, 'appId') : undefined;
  if (capacitorConfig && !appId) errors.push(`${FILES.capacitor}: appId não encontrado.`);
  if (capacitorConfig) {
    if (configString(capacitorConfig, 'url')) {
      errors.push(`${FILES.capacitor}: "server.url" definido. Uma build de loja carregaria o app dessa URL em vez do pacote local.`);
    }
    const hostname = configString(capacitorConfig, 'hostname');
    if (hostname && hostname !== 'localhost') {
      errors.push(`${FILES.capacitor}: "server.hostname" é "${hostname}". A origem do WebView precisa ser localhost (lista de CORS das Edge Functions); o host dos links fica no manifesto e no entitlement.`);
    }
  }
  if (gradle) {
    const applicationId = /applicationId\s+["']([^"']+)["']/.exec(gradle)?.[1];
    if (applicationId && appId && applicationId !== appId) {
      errors.push(`${FILES.gradle}: applicationId "${applicationId}" difere do appId "${appId}" de ${FILES.capacitor}.`);
    }
  }
  if (pbxproj) {
    const ids = unique([...pbxproj.matchAll(/PRODUCT_BUNDLE_IDENTIFIER\s*=\s*([^;\s]+);/g)].map(match => match[1]));
    for (const id of ids) {
      if (appId && id !== appId) errors.push(`${FILES.pbxproj}: PRODUCT_BUNDLE_IDENTIFIER "${id}" difere do appId "${appId}".`);
    }
    if (!/CODE_SIGN_ENTITLEMENTS\s*=\s*App\/App\.entitlements;/.test(pbxproj)) {
      errors.push(`${FILES.pbxproj}: o alvo App não aponta para App/App.entitlements (CODE_SIGN_ENTITLEMENTS). Sem isso o domínio dos Universal Links não entra no app.`);
    }
    if (!/path = App\.entitlements;/.test(pbxproj)) {
      errors.push(`${FILES.pbxproj}: App.entitlements não está registrado como arquivo do projeto.`);
    }
  }

  // ---- Android: the manifest host --------------------------------------------------------------------------
  const manifest = read(root, 'manifest', errors);
  let host;
  if (manifest) {
    const hosts = manifestHosts(manifest);
    if (hosts.length === 0) {
      errors.push(`${FILES.manifest}: nenhum intent-filter com android:autoVerify="true" e esquema https para um host.`);
    } else if (hosts.length > 1) {
      errors.push(`${FILES.manifest}: mais de um host verificado (${hosts.join(', ')}). O site tem um só.`);
    } else {
      host = hosts[0];
      if (!HOST.test(host) && !isPlaceholderHost(host)) errors.push(`${FILES.manifest}: "${host}" não é um nome de domínio.`);
      if (isPlaceholderHost(host)) {
        pending.push(`${FILES.manifest}: o host é o de exemplo "${host}". Trocar pelo domínio real do site (o mesmo do entitlement iOS e de VITE_SITE_URL).`);
      }
    }
  }
  if (host && siteUrl) {
    let siteHost;
    try {
      siteHost = new URL(siteUrl).host.toLowerCase();
    } catch {
      errors.push(`--site-url / VITE_SITE_URL: "${siteUrl}" não é uma URL.`);
    }
    if (siteHost && siteHost !== host) {
      errors.push(`VITE_SITE_URL aponta para "${siteHost}", mas o manifesto Android verifica "${host}". O app só trata links do host de VITE_SITE_URL (platform/deepLinks.ts).`);
    }
  } else if (host && !siteUrl) {
    info.push('VITE_SITE_URL não informado: o host do manifesto não foi comparado com o do site (use --site-url).');
  }

  // ---- Android: assetlinks.json ------------------------------------------------------------------------------
  const assetlinksText = read(root, 'assetlinks', errors);
  const assetlinks = assetlinksText ? parseJson(assetlinksText, 'assetlinks', errors) : null;
  if (assetlinks) {
    const statements = Array.isArray(assetlinks) ? assetlinks : [];
    const mine = statements.filter(
      item =>
        item?.target?.namespace === 'android_app' &&
        Array.isArray(item.relation) &&
        item.relation.includes('delegate_permission/common.handle_all_urls'),
    );
    if (mine.length === 0) {
      errors.push(`${FILES.assetlinks}: falta uma declaração android_app com a relação delegate_permission/common.handle_all_urls.`);
    }
    for (const item of mine) {
      if (appId && item.target.package_name !== appId) {
        errors.push(`${FILES.assetlinks}: package_name "${item.target.package_name}" difere do appId "${appId}".`);
      }
      const prints = item.target.sha256_cert_fingerprints;
      if (!Array.isArray(prints) || prints.length === 0) {
        errors.push(`${FILES.assetlinks}: sha256_cert_fingerprints vazio.`);
        continue;
      }
      for (const print of prints) {
        if (typeof print !== 'string') {
          errors.push(`${FILES.assetlinks}: impressão digital que não é texto.`);
        } else if (/todo/i.test(print)) {
          pending.push(`${FILES.assetlinks}: impressão digital SHA-256 ainda é TODO. Preencher com a do certificado de ASSINATURA do Google Play (Play Console > Integridade do app > Assinatura de apps), não a da chave de upload.`);
        } else if (!FINGERPRINT.test(print)) {
          errors.push(`${FILES.assetlinks}: impressão digital fora do formato AA:BB:... (32 pares hexadecimais maiúsculos): "${print}".`);
        }
      }
    }
  }

  // ---- iOS: apple-app-site-association and entitlements -------------------------------------------------
  const aasaText = read(root, 'aasa', errors);
  const aasa = aasaText ? parseJson(aasaText, 'aasa', errors) : null;
  if (aasa) {
    const details = aasa.applinks?.details;
    if (!Array.isArray(details) || details.length === 0) {
      errors.push(`${FILES.aasa}: applinks.details vazio ou ausente.`);
    } else {
      for (const detail of details) {
        const ids = Array.isArray(detail.appIDs) ? detail.appIDs : detail.appID ? [detail.appID] : [];
        if (ids.length === 0) errors.push(`${FILES.aasa}: um item de applinks.details sem appID.`);
        for (const id of ids) {
          const dot = String(id).indexOf('.');
          const team = String(id).slice(0, dot);
          const bundle = String(id).slice(dot + 1);
          if (dot < 0) {
            errors.push(`${FILES.aasa}: appID "${id}" fora do formato TEAMID.bundle.id.`);
            continue;
          }
          if (appId && bundle !== appId) errors.push(`${FILES.aasa}: o bundle id de "${id}" difere do appId "${appId}".`);
          if (/todo/i.test(team)) {
            pending.push(`${FILES.aasa}: o Team ID de "${id}" ainda é TODO. Preencher com o Team ID de 10 caracteres da conta Apple Developer (Membership).`);
          } else if (!TEAM_ID.test(team)) {
            errors.push(`${FILES.aasa}: Team ID "${team}" fora do formato (10 letras maiúsculas ou números).`);
          }
        }
        if (!Array.isArray(detail.paths) && !Array.isArray(detail.components)) {
          errors.push(`${FILES.aasa}: um item de applinks.details sem "paths" nem "components": nenhum link abriria o app.`);
        }
      }
    }
  }

  const entitlements = read(root, 'entitlements', errors);
  if (entitlements) {
    const domains = entitlementDomains(entitlements);
    const links = (domains ?? []).filter(domain => domain.startsWith('applinks:'));
    if (links.length === 0) {
      errors.push(`${FILES.entitlements}: falta com.apple.developer.associated-domains com uma entrada "applinks:<host>".`);
    } else {
      const iosHosts = unique(links.map(domain => domain.slice('applinks:'.length).split('?')[0].toLowerCase()));
      if (iosHosts.length > 1) errors.push(`${FILES.entitlements}: mais de um domínio applinks (${iosHosts.join(', ')}). O site tem um só.`);
      const iosHost = iosHosts[0];
      if (isPlaceholderHost(iosHost)) {
        pending.push(`${FILES.entitlements}: o domínio é o de exemplo "applinks:${iosHost}". Trocar pelo domínio real, sem https:// e sem caminho.`);
      }
      if (host && iosHosts.length === 1 && iosHost !== host) {
        errors.push(`${FILES.entitlements}: o domínio "${iosHost}" difere do host do manifesto Android "${host}".`);
      }
    }
  }

  return { errors, pending, info };
};

const main = () => {
  const args = process.argv.slice(2);
  const option = name => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const strict = args.includes('--strict');
  const platform = option('--platform');
  if (args.includes('--platform') && !['android', 'ios'].includes(platform)) {
    console.error('check-app-links: --platform aceita android ou ios.');
    return 1;
  }
  const root = resolve(option('--root') ?? join(fileURLToPath(import.meta.url), '..', '..'));
  const siteUrl = (option('--site-url') ?? process.env.VITE_SITE_URL ?? '').trim() || undefined;
  const { errors, pending, info } = checkAppLinks(root, { siteUrl });
  // A missing signing identity on the other platform is independent of this
  // package. Shared host and identifier checks still apply to both.
  const otherAssociation = platform === 'android' ? FILES.aasa : platform === 'ios' ? FILES.assetlinks : undefined;
  const blockingPending = otherAssociation ? pending.filter(line => !line.startsWith(`${otherAssociation}:`)) : pending;

  for (const line of errors) console.error(`ERRO      ${line}`);
  for (const line of pending) console[strict && blockingPending.includes(line) ? 'error' : 'log'](`PENDENTE  ${line}`);
  for (const line of info) console.log(`AVISO     ${line}`);

  if (errors.length > 0) {
    console.error(`check-app-links: ${errors.length} incoerência(s) entre os arquivos de links.`);
    return 1;
  }
  if (pending.length > 0) {
    if (strict && blockingPending.length > 0) {
      console.error(`check-app-links (--strict): ${blockingPending.length} pendência(s) do dono. Os links ainda não abrem o app em produção. Passo a passo: docs/arquitetura/nativo.md, seção 8.`);
      return 1;
    }
    console.log(`check-app-links: coerente, com ${pending.length} pendência(s) do dono (use --strict para falhar por elas).`);
    return 0;
  }
  console.log('check-app-links: coerente e sem pendências.');
  return 0;
};

// Run only as a script: the test imports the helpers above
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main());
