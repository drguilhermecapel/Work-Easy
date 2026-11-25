// Distribution builds explicitly opt in through WORKEASY_RELEASE_TARGET.
// Never print configuration values, even when validation fails.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadEnv } from 'vite';
import { findSecrets } from './check-bundle-secrets.mjs';
import { checkAppLinks, FILES, isPlaceholderHost, manifestHosts } from './check-app-links.mjs';

const productionBackend = 'https://hlzdgbxygtaklqaoihlq.supabase.co';
const targets = ['web', 'android', 'ios', 'windows', 'macos', 'linux'];

function httpsOrigin(value) {
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' && value === url.origin &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(url.hostname) &&
      !url.port && !/(?:^|\.)(?:localhost|local|example|test|invalid|example\.(?:com|org|net))$/.test(url.hostname) &&
      !/^\d+(?:\.\d+){3}$/.test(url.hostname)
    ) return url.origin;
  } catch {
    // Report the variable name without its contents.
  }
  return null;
}

export function validateReleaseConfig(env, target, mode) {
  const errors = [];
  const store = target === 'android' || target === 'ios' ? target : '';
  const web = target === 'web';
  if (!targets.includes(target)) errors.push('WORKEASY_RELEASE_TARGET inválido');
  if (mode !== (web ? 'production' : 'native')) errors.push('Modo Vite incompatível com o alvo');
  if (env.VITE_SUPABASE_URL !== productionBackend) errors.push('VITE_SUPABASE_URL deve corresponder ao projeto de produção WorkEasy');
  if (!/^sb_publishable_[A-Za-z0-9_-]{16,}$/.test(env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '')) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY deve conter uma chave publicável');
  }
  if (!httpsOrigin(env.VITE_SITE_URL)) errors.push('VITE_SITE_URL deve ser a origem HTTPS pública do site');
  if (!/^[1-9]\d{11,14}$/.test(env.VITE_CONCIERGE_WHATSAPP ?? '')) errors.push('VITE_CONCIERGE_WHATSAPP inválido');
  if (!/^[1-9]\d{11,14}$/.test(env.VITE_SAC_WHATSAPP ?? '')) errors.push('VITE_SAC_WHATSAPP inválido');
  if (!/^(email|phone|email,phone|phone,email)$/.test(env.VITE_LOGIN_METHODS ?? '')) errors.push('VITE_LOGIN_METHODS deve ser explícito');
  if ((env.VITE_STORE_BUILD ?? '') !== store) errors.push('VITE_STORE_BUILD incompatível com o alvo');
  if ((env.VITE_ROUTER ?? (web ? 'browser' : '')) !== (web ? 'browser' : 'hash')) errors.push('VITE_ROUTER incompatível com o alvo');
  if (!/^[a-f0-9]{40}$/.test(env.VITE_APP_VERSION ?? '')) errors.push('VITE_APP_VERSION deve conter o SHA completo');
  if (!['', 'vigente'].includes(env.VITE_LEGAL_STATUS ?? '')) errors.push('VITE_LEGAL_STATUS inválido');
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith('VITE_') && findSecrets(value).length) errors.push(`${name} contém um padrão de segredo`);
  }
  if (errors.length) throw new Error(`Configuração de distribuição recusada:\n- ${errors.join('\n- ')}`);
}

function* scripts(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* scripts(path);
    else if (entry.isFile() && entry.name.endsWith('.js')) yield readFileSync(path, 'utf8');
  }
}

function verifyBundle(env, dir) {
  const required = new Map([
    ['projeto Supabase', env.VITE_SUPABASE_URL],
    ['chave publicável', env.VITE_SUPABASE_PUBLISHABLE_KEY],
    ['origem do site', env.VITE_SITE_URL],
  ]);
  for (const script of scripts(dir)) {
    for (const [name, value] of required) {
      if (script.includes(value)) required.delete(name);
    }
    if (!required.size) return;
  }
  throw new Error(`Configuração ausente do JavaScript empacotado: ${[...required.keys()].join(', ')}`);
}

function prepareWebLinks(env, dir) {
  const [host] = manifestHosts(readFileSync(FILES.manifest, 'utf8'));
  const placeholderHost = host !== undefined && isPlaceholderHost(host);
  const { errors, pending } = checkAppLinks(process.cwd(), { siteUrl: placeholderHost ? undefined : env.VITE_SITE_URL });
  if (errors.length) throw new Error(errors.join('\n'));
  const files = [
    [FILES.assetlinks, 'assetlinks.json', []],
    [FILES.aasa, 'apple-app-site-association', { applinks: { apps: [], details: [] } }],
  ];
  for (const [source, name, empty] of files) {
    if (placeholderHost || pending.some(line => line.startsWith(`${source}:`))) {
      writeFileSync(join(dir, '.well-known', name), JSON.stringify(empty) + '\n');
      console.log(`Associação ${name} sem apps até a configuração do canal de distribuição`);
    }
  }
}

async function verifyBackend(env) {
  const response = await fetch(`${productionBackend}/rest/v1/platform_settings?select=key&limit=1`, {
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`A consulta pública ao Supabase de produção falhou (HTTP ${response.status})`);
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.some(row => typeof row?.key === 'string')) {
    throw new Error('A consulta pública ao Supabase de produção não retornou configurações');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [action, dir = 'dist'] = process.argv.slice(2);
    const target = process.env.WORKEASY_RELEASE_TARGET;
    const mode = target === 'web' ? 'production' : 'native';
    const env = loadEnv(mode, process.cwd());
    validateReleaseConfig(env, target, mode);
    if (action === 'backend') await verifyBackend(env);
    else if (action === 'bundle') verifyBundle(env, dir);
    else if (action === 'web-links' && target === 'web') prepareWebLinks(env, dir);
    else if (action !== 'config') throw new Error('Use config, backend, bundle [pasta] ou web-links [pasta]');
    console.log(`Verificação ${action} aprovada para ${target}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
