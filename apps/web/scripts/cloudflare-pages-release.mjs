// Verify the configured Pages project and the exact public revision it serves.
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const MARKER = '/.well-known/workeasy-release.json';

export async function verifyPagesProject(env, request = fetch) {
  const missing = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_PAGES_PROJECT', 'CLOUDFLARE_API_TOKEN'].filter(name => !env[name]);
  if (missing.length) throw new Error(`Configure no ambiente production: ${missing.join(', ')}.`);
  const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_PAGES_PROJECT: project, CLOUDFLARE_API_TOKEN: token } = env;
  const host = new URL(env.VITE_SITE_URL).hostname;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/pages/projects/${encodeURIComponent(project)}`;
  const get = async (suffix = '') => {
    const response = await request(endpoint + suffix, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Cloudflare Pages recusou a consulta (HTTP ${response.status}).`);
    const result = await response.json();
    if (!result.success || !result.result) throw new Error('Cloudflare Pages não retornou a configuração esperada.');
    return result.result;
  };

  const target = await get();
  if (target.name !== project || target.production_branch !== 'main') {
    throw new Error('O nome do projeto ou sua branch de produção diverge da configuração.');
  }
  if (target.subdomain === host) return;
  if (!target.domains?.includes(host)) throw new Error('O domínio canônico não está associado ao projeto Pages.');
  const domain = await get(`/domains/${encodeURIComponent(host)}`);
  if (domain.name !== host || domain.status !== 'active') throw new Error('O domínio canônico ainda não está ativo no Pages.');
}

export async function verifyPublicRevision(site, commit, request = fetch) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('Informe o SHA completo da revisão esperada.');
  const url = new URL(MARKER, site);
  if (url.protocol !== 'https:') throw new Error('A URL canônica precisa usar HTTPS.');
  url.searchParams.set('commit', commit);
  const response = await request(url, {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    redirect: 'error',
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Marcador de revisão indisponível (HTTP ${response.status}).`);
  const marker = await response.json();
  if (marker.commit !== commit) throw new Error('O site público ainda não serve a revisão desta publicação.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [action] = process.argv.slice(2);
    const { VITE_SITE_URL: site, GITHUB_SHA: commit } = process.env;
    if (action === 'project') {
      await verifyPagesProject(process.env);
      console.log('Projeto, branch e domínio de produção conferidos.');
    } else if (action === 'write') {
      if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error('GITHUB_SHA inválido.');
      mkdirSync('dist/.well-known', { recursive: true });
      writeFileSync(`dist${MARKER}`, JSON.stringify({ commit }) + '\n');
    } else if (action === 'live') {
      await verifyPublicRevision(site, commit);
      console.log(`Domínio canônico serve a revisão ${commit}.`);
    } else {
      throw new Error('Use project, write ou live.');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
