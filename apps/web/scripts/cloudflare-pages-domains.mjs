// Repair only the www alias. Never rebuild, deploy, replace or delete a resource.
import { pathToFileURL } from 'node:url';

const CANONICAL = 'workeasy.ia.br';
const ALIAS = `www.${CANONICAL}`;
const API = 'https://api.cloudflare.com/client/v4';
const hostname = value => String(value ?? '').toLowerCase().replace(/\.$/, '');

/** All project, zone and DNS reads finish before the first write. */
export async function reconcilePagesDomains(env, { apply = false, request = fetch } = {}) {
  const account = env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const project = env.CLOUDFLARE_PAGES_PROJECT?.trim();
  const token = env.CLOUDFLARE_API_TOKEN?.trim();
  if (!/^[a-f0-9]{32}$/.test(account ?? '') || project !== 'workeasy' || !token) {
    throw new Error('Configure CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN e o projeto workeasy no ambiente production.');
  }
  let site;
  try { site = new URL(env.VITE_SITE_URL); } catch { throw new Error('VITE_SITE_URL inválida.'); }
  if (site.origin !== `https://${CANONICAL}` || site.pathname !== '/' || site.search || site.hash || site.username || site.password) {
    throw new Error(`Esta operação aceita apenas VITE_SITE_URL=https://${CANONICAL}.`);
  }

  const call = async (path, description, body) => {
    let response;
    try {
      response = await request(`${API}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      // Never print raw transport errors, request headers or secret values.
      throw new Error(`Falha de rede durante ${description}.`);
    }
    if (!response.ok) throw new Error(`Cloudflare recusou ${description} (HTTP ${response.status}).`);
    let data;
    try { data = await response.json(); } catch { throw new Error(`Resposta inválida durante ${description}.`); }
    if (data.success !== true || data.result === undefined || data.result === null) {
      throw new Error(`Cloudflare não confirmou ${description}.`);
    }
    return data;
  };

  const projectPath = `/accounts/${account}/pages/projects/${project}`;
  const { result: target } = await call(projectPath, 'a consulta do projeto Pages');
  if (target.name !== project || target.production_branch !== 'main' ||
      !/^[a-z0-9][a-z0-9-]*\.pages\.dev$/.test(target.subdomain ?? '') ||
      !Array.isArray(target.domains) || !target.domains.includes(CANONICAL)) {
    throw new Error('O projeto, a branch, o endereço Pages ou o domínio canônico diverge da configuração esperada.');
  }
  const { result: canonical } = await call(`${projectPath}/domains/${CANONICAL}`, 'a consulta do domínio canônico');
  if (canonical.name !== CANONICAL || canonical.status !== 'active') {
    throw new Error('O domínio canônico precisa estar ativo antes de configurar www.');
  }
  const { result: domains } = await call(`${projectPath}/domains`, 'a consulta dos domínios Pages');
  if (!Array.isArray(domains)) throw new Error('A lista de domínios Pages é inválida.');
  const aliases = domains.filter(domain => hostname(domain.name) === ALIAS);
  if (aliases.length > 1) throw new Error('Há mais de uma associação Pages para www.');
  let alias = aliases[0];
  if (alias && !['active', 'pending', 'initializing'].includes(alias.status)) {
    throw new Error('A associação Pages existente de www precisa de revisão; nenhuma configuração foi alterada.');
  }

  // DNS read access is checked even when the Pages association is missing.
  // A token with only Pages Write cannot complete DNS provisioning.
  const zoneQuery = new URLSearchParams({ name: CANONICAL, 'account.id': account });
  const { result: zones } = await call(`/zones?${zoneQuery}`, 'a consulta da zona DNS');
  if (!Array.isArray(zones) || zones.length !== 1 || zones[0].name !== CANONICAL ||
      zones[0].account?.id !== account || zones[0].status !== 'active' ||
      !/^[a-f0-9]{32}$/.test(zones[0].id ?? '')) {
    throw new Error('A zona DNS ativa do domínio não foi encontrada nesta conta. Verifique o escopo do token.');
  }
  const dnsPath = `/zones/${zones[0].id}/dns_records`;
  const dnsQuery = new URLSearchParams({ name: ALIAS, per_page: '100' });
  const readDns = async () => {
    const dns = await call(`${dnsPath}?${dnsQuery}`, 'a consulta dos registros DNS de www');
    if (!Array.isArray(dns.result) || (dns.result_info?.total_count ?? dns.result.length) > dns.result.length ||
        dns.result.some(record => hostname(record.name) !== ALIAS)) {
      throw new Error('A consulta DNS não retornou a lista completa e exata de www.');
    }
    const records = dns.result;
    if (records.length > 1 || (records.length === 1 &&
        (records[0].type !== 'CNAME' || hostname(records[0].content) !== target.subdomain))) {
      throw new Error('Já existe um registro DNS conflitante para www; ele não será alterado.');
    }
    return records;
  };
  let records = await readDns();

  const missing = [];
  if (!alias) missing.push('pages_domain');
  if (records.length === 0) missing.push('dns_cname');
  const created = [];
  if (apply && !alias) {
    const { result } = await call(`${projectPath}/domains`, 'a associação de www ao Pages', { name: ALIAS });
    if (result.name !== ALIAS || !['active', 'pending', 'initializing'].includes(result.status)) {
      throw new Error('A criação da associação Pages não retornou o estado esperado. Consulte o domínio antes de repetir.');
    }
    alias = result;
    created.push('pages_domain');
  }
  if (apply && records.length === 0) {
    // Pages may create the record itself, or another operator may act meanwhile.
    // Re-read and validate instead of creating a duplicate or replacing a conflict.
    records = await readDns();
  }
  if (apply && records.length === 0) {
    // POST creates a missing record only; no existing DNS record is overwritten.
    const { result } = await call(dnsPath, 'a criação do CNAME de www', {
      type: 'CNAME', name: ALIAS, content: target.subdomain, proxied: true, ttl: 1,
    });
    if (hostname(result.name) !== ALIAS || result.type !== 'CNAME' ||
        hostname(result.content) !== target.subdomain || result.proxied !== true) {
      throw new Error('A criação do CNAME não retornou o estado esperado. Consulte o DNS antes de repetir.');
    }
    created.push('dns_cname');
  }

  return {
    mode: apply ? 'apply' : 'check',
    canonical: CANONICAL,
    alias: ALIAS,
    project,
    pagesTarget: target.subdomain,
    domainStatus: alias?.status ?? 'missing',
    missingBefore: missing,
    created,
    // TLS activation and public DNS propagation still require a live check.
    publicVerificationRequired: true,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [action, ...extra] = process.argv.slice(2);
    if (!['check', 'apply'].includes(action) || extra.length) throw new Error('Use check ou apply.');
    const result = await reconcilePagesDomains(process.env, { apply: action === 'apply' });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
