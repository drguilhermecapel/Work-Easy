#!/usr/bin/env node
// End-to-end run of the Edge Functions in the real Deno runtime (the edge-runtime container of
// `supabase functions serve`), against the local database, with fake Asaas, Resend, WhatsApp and
// Anthropic. Nothing leaves the machine: every outside API is a local HTTPS server.
//
// Needs: the local stack up (`supabase start`, with the edge-runtime image pulled), Docker, psql,
// openssl, and port 443 free on the host (Resend, WhatsApp and the Anthropic SDK use fixed https
// hosts on 443; inside the container those names are pointed at the host).
// Refuses to start when another `functions serve` already runs for this project (same container).
//
// What it does, in order: makes a temporary folder (CA, certificate, env file, log) outside the
// repository; starts the fake server; writes the CA bundle into the edge-runtime cache volume (the
// runtime reads it at boot through SSL_CERT_FILE); starts `supabase functions serve` with that env
// file; creates users and data with the service role; runs the flows below and checks the database;
// removes what it created; stops the runtime. Exit code 0 only when every check passed and the
// cleanup was complete.
//
// Flows: asaas-onboard -> subscriptions-manage (Pro) -> CRM client with document -> own booking ->
// charges-create (body of the app; `customer` refused) -> asaas-webhook (wrong token refused;
// PAYMENT_RECEIVED with the subaccount token) -> payments.status 'received' and received_at;
// asaas-webhooks-sync (403 for a provider, dry_run for the admin, nothing written in Asaas);
// quote-assist (fake Anthropic); notify-dispatch (fake WhatsApp and Resend, only when the queue holds
// no row of anyone else); account-delete.
//
// Usage: node scripts/e2e-functions.mjs   (npm run test:e2e-functions)
// Env: E2E_KEEP=1 keeps the temporary folder (log of the runtime) for inspection.

import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT_ID = /^project_id\s*=\s*"([^"]+)"/m.exec(readFileSync(join(APP_DIR, 'supabase/config.toml'), 'utf8'))?.[1] ?? 'workeasy';
const CONTAINER = `supabase_edge_runtime_${PROJECT_ID}`;
const CACHE_VOLUME = `supabase_edge_runtime_${PROJECT_ID}`;
const CA_IN_CONTAINER = '/root/.cache/deno/e2e-functions-ca.pem';
const FIXED_HOSTS = ['api.resend.com', 'graph.facebook.com', 'api.anthropic.com'];
const ASAAS_HOST = 'host.docker.internal';
const RUN = randomBytes(4).toString('hex');
const PASSWORD = `E2e-${randomBytes(9).toString('base64url')}!`;
const ROOT_KEY = `e2e-root-${RUN}`;
const WEBHOOK_TOKEN = randomBytes(24).toString('hex');
const DOCUMENT_SECRET = randomBytes(24).toString('hex');
const CRON_SECRET = randomBytes(16).toString('hex');
const WHATSAPP_PHONE_ID = '100200300';

// ---- output and checks ------------------------------------------------------------------------------

const results = [];
const log = message => console.log(`[e2e] ${message}`);
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FALHA'} ${name}${detail ? ` (${detail})` : ''}`);
  return ok;
}
function must(condition, message) {
  if (!condition) throw new Error(message);
}

// ---- helpers ----------------------------------------------------------------------------------------

const sh = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...options });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** A valid CPF with random digits (check digits computed), different on every run. */
function randomCpf() {
  const digits = Array.from({ length: 9 }, () => randomInt(10));
  for (const length of [9, 10]) {
    const sum = digits.slice(0, length).reduce((acc, digit, index) => acc + digit * (length + 1 - index), 0);
    const rest = (sum * 10) % 11;
    digits.push(rest === 10 ? 0 : rest);
  }
  return digits.join('');
}

/** São Paulo calendar date `days` from today, "YYYY-MM-DD". */
function spDate(days) {
  const date = new Date(Date.now() + days * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(date);
}

/** The token Asaas sends for a provider subaccount (same derivation as _shared/secrets.ts, written independently). */
const subaccountToken = providerId => createHmac('sha256', WEBHOOK_TOKEN).update(`asaas-subaccount:${providerId.toLowerCase()}`).digest('hex');

// ---- local stack ------------------------------------------------------------------------------------

function stackStatus() {
  const status = JSON.parse(sh(join(APP_DIR, 'node_modules/.bin/supabase'), ['status', '-o', 'json'], { cwd: APP_DIR }));
  must(status.API_URL && status.SERVICE_ROLE_KEY && status.DB_URL, 'supabase status sem API_URL, SERVICE_ROLE_KEY ou DB_URL: a stack local está de pé?');
  return { url: status.API_URL, anonKey: status.PUBLISHABLE_KEY || status.ANON_KEY, serviceKey: status.SERVICE_ROLE_KEY, dbUrl: status.DB_URL };
}

const psql = (dbUrl, sql) => sh('psql', [dbUrl, '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql]).trim();

// ---- certificates -----------------------------------------------------------------------------------

function makeCertificates(dir) {
  const ca = join(dir, 'ca.pem');
  const caKey = join(dir, 'ca.key');
  const key = join(dir, 'server.key');
  const csr = join(dir, 'server.csr');
  const cert = join(dir, 'server.pem');
  const ext = join(dir, 'server.ext');
  sh('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', caKey, '-out', ca, '-days', '1', '-subj', `/CN=WorkEasy e2e CA ${RUN}`]);
  sh('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', key, '-out', csr, '-subj', `/CN=${ASAAS_HOST}`]);
  const names = [ASAAS_HOST, ...FIXED_HOSTS, 'localhost'].map(name => `DNS:${name}`).join(',');
  writeFileSync(ext, `subjectAltName=${names},IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`);
  sh('openssl', ['x509', '-req', '-in', csr, '-CA', ca, '-CAkey', caKey, '-CAcreateserial', '-out', cert, '-days', '1', '-extfile', ext]);
  // The runtime reads only this bundle: the system CAs (npm registry, any proxy CA trusted here) plus ours
  const system = [process.env.SSL_CERT_FILE, '/etc/ssl/certs/ca-certificates.crt'].find(file => file && existsSync(file));
  const bundle = join(dir, 'bundle.pem');
  writeFileSync(bundle, `${system ? readFileSync(system, 'utf8') : ''}\n${readFileSync(ca, 'utf8')}`);
  return { key: readFileSync(key), cert: readFileSync(cert), bundle };
}

// ---- fake outside APIs ------------------------------------------------------------------------------

function fakeApis() {
  const calls = [];
  const state = { n: 0, subKeys: new Set(), payments: new Map(), subscriptions: new Map(), webhooks: new Map(), unknown: [] };
  const next = prefix => `${prefix}_e2e_${RUN}_${++state.n}`;

  const asaas = (call, key) => {
    const known = key === ROOT_KEY || state.subKeys.has(key);
    if (!known) return [401, { errors: [{ code: 'invalid_access_token', description: 'chave desconhecida' }] }];
    const { method, path, query, body } = call;
    let m;
    if (method === 'POST' && path === '/v3/accounts') {
      const apiKey = `$aact_e2e_${RUN}_${randomBytes(8).toString('hex')}`;
      state.subKeys.add(apiKey);
      return [200, { id: next('acc'), walletId: next('wal'), apiKey }];
    }
    if (method === 'GET' && path === '/v3/accounts') return [200, { data: [], totalCount: 0, hasMore: false, offset: 0, limit: Number(query.get('limit') ?? 10) }];
    if (method === 'POST' && path === '/v3/customers') return [200, { id: next('cus'), name: body?.name ?? '' }];
    if (method === 'POST' && path === '/v3/payments') {
      const payment = {
        id: next('pay'), status: 'PENDING', value: body?.value, netValue: body?.value, dueDate: body?.dueDate, billingType: body?.billingType,
        customer: body?.customer, externalReference: body?.externalReference ?? null, invoiceUrl: `https://sandbox.asaas.com/i/${state.n}`, deleted: false,
        owner: key,
      };
      state.payments.set(payment.id, payment);
      return [200, payment];
    }
    if ((m = /^\/v3\/payments\/([^/]+)\/pixQrCode$/.exec(path)) && method === 'GET') {
      return [200, { encodedImage: 'iVBORw0KGgo=', payload: `00020126e2e${m[1]}`, expirationDate: `${spDate(2)} 23:59:59` }];
    }
    if ((m = /^\/v3\/payments\/([^/]+)$/.exec(path))) {
      const payment = state.payments.get(m[1]);
      // Each account sees only its own charges, as in Asaas
      if (!payment || payment.owner !== key) return [404, { errors: [{ code: 'not_found', description: 'cobrança não encontrada' }] }];
      if (method === 'GET') return [200, payment];
      if (method === 'DELETE') {
        payment.deleted = true;
        return [200, { deleted: true, id: payment.id }];
      }
    }
    if (method === 'POST' && path === '/v3/subscriptions') {
      const subscription = { id: next('sub'), status: 'ACTIVE', nextDueDate: body?.nextDueDate ?? spDate(0), value: body?.value, cycle: body?.cycle };
      state.subscriptions.set(subscription.id, subscription);
      const payment = {
        id: next('pay'), status: 'PENDING', value: body?.value, dueDate: subscription.nextDueDate, billingType: body?.billingType, subscription: subscription.id,
        invoiceUrl: `https://sandbox.asaas.com/i/s${state.n}`, deleted: false, owner: key,
      };
      state.payments.set(payment.id, payment);
      subscription.paymentId = payment.id;
      return [200, subscription];
    }
    if ((m = /^\/v3\/subscriptions\/([^/]+)\/payments$/.exec(path)) && method === 'GET') {
      return [200, { data: [...state.payments.values()].filter(payment => payment.subscription === m[1]), totalCount: 1, hasMore: false }];
    }
    if ((m = /^\/v3\/subscriptions\/([^/]+)$/.exec(path))) {
      const subscription = state.subscriptions.get(m[1]);
      if (!subscription) return [404, { errors: [{ code: 'not_found', description: 'assinatura não encontrada' }] }];
      if (method === 'GET') return [200, subscription];
      if (method === 'DELETE') {
        subscription.status = 'INACTIVE';
        return [200, { deleted: true, id: subscription.id }];
      }
    }
    if (method === 'GET' && path === '/v3/webhooks') {
      const list = state.webhooks.get(key) ?? [];
      return [200, { data: list, totalCount: list.length, hasMore: false, offset: 0, limit: Number(query.get('limit') ?? 10) }];
    }
    if (method === 'POST' && path === '/v3/webhooks') return [200, { id: next('wh'), ...body }];
    if ((m = /^\/v3\/webhooks\/([^/]+)$/.exec(path)) && method === 'PUT') return [200, { id: m[1], ...body }];
    state.unknown.push(`${method} ${path}`);
    return [404, { errors: [{ code: 'not_found', description: `rota falsa ausente: ${method} ${path}` }] }];
  };

  const anthropicAnswer = body => ({
    id: next('msg'), type: 'message', role: 'assistant', model: body?.model ?? 'claude-haiku-5-5', stop_reason: 'end_turn', stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
    content: [{
      type: 'text',
      text: JSON.stringify({
        intro: 'Olá! Segue a proposta para a pintura da sala.',
        items: [{ description: 'Pintura de parede, duas demãos', quantity: 40, unit: 'm2', price_ref: 'nenhum' }],
      }),
    }],
  });

  const server = createServer({}, (req, res) => {
    let raw = '';
    req.on('data', chunk => (raw += chunk));
    req.on('end', () => {
      const host = (req.headers.host ?? '').replace(/:\d+$/, '');
      const url = new URL(req.url ?? '/', `https://${host}`);
      let body = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      const call = { host, method: req.method ?? 'GET', path: url.pathname, query: url.searchParams, body, headers: req.headers };
      calls.push(call);
      let status;
      let answer;
      if (host === ASAAS_HOST) [status, answer] = asaas(call, String(req.headers.access_token ?? ''));
      else if (host === 'api.resend.com' && call.method === 'POST' && call.path === '/emails') [status, answer] = [200, { id: next('email') }];
      else if (host === 'graph.facebook.com' && call.method === 'POST' && call.path.endsWith(`/${WHATSAPP_PHONE_ID}/messages`)) {
        [status, answer] = [200, { messaging_product: 'whatsapp', messages: [{ id: next('wamid') }] }];
      } else if (host === 'api.anthropic.com' && call.method === 'POST' && call.path === '/v1/messages') [status, answer] = [200, anthropicAnswer(body)];
      else {
        state.unknown.push(`${host} ${call.method} ${call.path}`);
        [status, answer] = [404, { error: 'rota falsa ausente' }];
      }
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(answer));
    });
  });
  return { server, calls, state };
}

// ---- edge runtime -----------------------------------------------------------------------------------

function edgeImage() {
  const images = sh('docker', ['images', '--format', '{{.Repository}}:{{.Tag}}']).split('\n').filter(line => /\/edge-runtime:/.test(line));
  must(images.length > 0, 'imagem do edge-runtime não encontrada: rode `supabase start` sem excluir o edge-runtime');
  return images.sort().at(-1);
}

const containerRunning = () => sh('docker', ['ps', '-q', '--filter', `name=^/${CONTAINER}$`]).trim() !== '';

async function startServe(dir, envFile, bundle) {
  must(!containerRunning(), `o contêiner ${CONTAINER} já está de pé (outra sessão de \`supabase functions serve\`?): não vou derrubá-lo`);
  // The runtime loads SSL_CERT_FILE at boot: the bundle goes into its cache volume first
  sh('docker', ['run', '--rm', '-i', '-v', `${CACHE_VOLUME}:/cache`, '--entrypoint', 'sh', edgeImage(), '-c', 'cat > /cache/e2e-functions-ca.pem'], {
    input: readFileSync(bundle),
  });
  const logFile = join(dir, 'serve.log');
  writeFileSync(logFile, '');
  const child = spawn(join(APP_DIR, 'node_modules/.bin/supabase'), ['functions', 'serve', '--env-file', envFile], {
    cwd: APP_DIR, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  const append = chunk => {
    output += chunk;
    writeFileSync(logFile, output);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const deadline = Date.now() + 240_000;
  while (!/Serving functions on/.test(output)) {
    if (child.exitCode !== null) throw new Error(`supabase functions serve saiu (${child.exitCode}):\n${output.slice(-2000)}`);
    if (Date.now() > deadline) throw new Error(`supabase functions serve não ficou pronto em 240 s:\n${output.slice(-2000)}`);
    await sleep(1000);
  }
  // Resend, WhatsApp and the Anthropic SDK call fixed https hosts: inside the container they point at this machine
  sh('docker', ['exec', CONTAINER, 'sh', '-c', `gw=$(getent hosts ${ASAAS_HOST} | cut -d' ' -f1) && [ -n "$gw" ] && echo "$gw ${FIXED_HOSTS.join(' ')}" >> /etc/hosts`]);
  return { child, logFile, output: () => output };
}

async function stopServe(serve) {
  if (!serve) return;
  if (serve.child.exitCode === null) {
    try {
      process.kill(-serve.child.pid, 'SIGINT');
    } catch {
      /* already gone */
    }
    const deadline = Date.now() + 30_000;
    while (serve.child.exitCode === null && Date.now() < deadline) await sleep(500);
  }
  // Started by this run: never left behind
  if (containerRunning()) sh('docker', ['rm', '-f', CONTAINER]);
}

// ---- database fixtures ------------------------------------------------------------------------------

const newClient = (url, key) => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

function fixtures(stack) {
  const service = newClient(stack.url, stack.serviceKey);
  const users = [];
  /** data_requests of deleted accounts keep no user_id (anonymized): tracked by id. */
  const dataRequests = [];
  const ok = (response, what) => {
    if (response.error) throw new Error(`${what}: ${response.error.message}`);
    return response.data;
  };

  async function createUser(label) {
    const email = `e2e-${RUN}-${label}@example.com`;
    const created = ok(await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `E2E ${label}` } }), `usuário ${label}`);
    const client = newClient(stack.url, stack.anonKey);
    const session = ok(await client.auth.signInWithPassword({ email, password: PASSWORD }), `login ${label}`).session;
    const user = { id: created.user.id, label, email, client, jwt: session.access_token };
    users.push(user);
    return user;
  }

  /** Same path as the app and test/integration: become_provider, documents, review and approval by an admin. */
  async function approvedProvider(admin, label) {
    const user = await createUser(label);
    const policies = ok(await service.from('occupation_policies').select('occupation_slug, labor_lock, verification, price_units').order('occupation_slug'), 'políticas');
    const policy = policies.find(p => p.labor_lock && !p.verification.includes('registro_profissional') && !p.price_units.includes('plantao'));
    must(policy, 'o catálogo não tem ocupação doméstica sem registro profissional');
    const neighborhood = ok(await service.from('neighborhoods').select('id').order('slug').limit(1), 'bairros')[0];
    must(neighborhood, 'o seed não tem bairros');
    ok(await user.client.rpc('become_provider', { p_display_name: `E2E ${label}`, p_slug: `e2e-${RUN}-${label}`, p_occupation: policy.occupation_slug }), 'become_provider');
    ok(await user.client.from('provider_neighborhoods').insert({ provider_id: user.id, neighborhood_id: neighborhood.id }).select('provider_id'), 'área atendida');
    for (const step of policy.verification) {
      const path = `${user.id}/${step}-e2e.pdf`;
      ok(await service.storage.from('provider-documents').upload(path, Buffer.from('%PDF-1.4\n% e2e\n'), { contentType: 'application/pdf' }), `upload ${step}`);
      const document = ok(await service.from('provider_documents').insert({ provider_id: user.id, step, storage_path: path }).select('id').single(), `documento ${step}`);
      user.documents = [...(user.documents ?? []), document.id];
    }
    ok(await user.client.rpc('submit_provider_for_review'), 'submit_provider_for_review');
    for (const id of user.documents ?? []) ok(await admin.client.rpc('admin_review_document', { p_document: id, p_accept: true }), 'aceite do documento');
    ok(await admin.client.rpc('admin_set_occupation_approval', { p_provider: user.id, p_occupation: policy.occupation_slug, p_approved: true }), 'aprovação da ocupação');
    ok(await admin.client.rpc('admin_set_provider_status', { p_provider: user.id, p_status: 'approved' }), 'aprovação do prestador');
    user.occupation = policy.occupation_slug;
    return user;
  }

  /** Removes what the run created. Returns the problems (empty: complete). */
  async function cleanup(dbUrl) {
    const problems = [];
    const ids = users.map(user => user.id);
    if (ids.length === 0) return problems;
    const list = ids.map(id => `'${id}'`).join(',');
    const steps = [
      `delete from public.payment_events where asaas_event_id like 'evt_e2e_${RUN}%'`,
      `delete from public.payments where provider_id in (${list}) or payer_id in (${list})`,
      `delete from public.bookings where provider_id in (${list}) or client_id in (${list})`,
      `delete from public.subscriptions where provider_id in (${list})`,
      `delete from public.notifications where user_id in (${list})`,
      `delete from vault.secrets where name in (${ids.map(id => `'asaas_api_key:${id}'`).join(',')})`,
      `delete from public.data_requests where user_id in (${list})${dataRequests.length ? ` or id in (${dataRequests.map(id => `'${id}'`).join(',')})` : ''}`,
      // The trial is once per CPF and the claim has no foreign key: the run's claims go by hand
      `delete from public.trial_claims where provider_id in (${list})`,
    ];
    for (const sql of steps) {
      try {
        psql(dbUrl, sql);
      } catch (error) {
        problems.push(`${sql.slice(0, 60)}...: ${String(error.stderr ?? error.message).trim().split('\n')[0]}`);
      }
    }
    for (const user of users) {
      const { data: files } = await service.storage.from('provider-documents').list(user.id, { limit: 1000 });
      if (files?.length) await service.storage.from('provider-documents').remove(files.map(file => `${user.id}/${file.name}`));
      const { error } = await service.auth.admin.deleteUser(user.id);
      if (error && error.status !== 404 && !/not found/i.test(error.message)) problems.push(`usuário ${user.label}: ${error.message}`);
    }
    // What is left: every public table with a uuid column that names a user. audit_log only takes inserts (by design)
    try {
      const union = psql(dbUrl, `select string_agg(format('select %L, count(*) from public.%I where %I in (${list.replace(/'/g, "''")})', c.table_name || '.' || c.column_name, c.table_name, c.column_name), ' union all ')
        from information_schema.columns c join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
        where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.data_type = 'uuid'
          and c.column_name in ('id', 'user_id', 'provider_id', 'client_id', 'payer_id', 'actor_id', 'owner_id')`);
      const left = psql(dbUrl, union).split('\n').filter(line => line && !line.endsWith('|0'));
      for (const line of left) {
        if (line.startsWith('audit_log.')) log(`ficou no audit_log (só aceita inserção): ${line.split('|')[1]} linha(s)`);
        else problems.push(`sobrou ${line}`);
      }
    } catch (error) {
      problems.push(`varredura de sobras: ${String(error.stderr ?? error.message).trim().split('\n')[0]}`);
    }
    return problems;
  }

  return { service, users, dataRequests, createUser, approvedProvider, cleanup, ok };
}

// ---- flows ------------------------------------------------------------------------------------------

async function callFunction(stack, name, { jwt, body, headers = {}, query = '' } = {}) {
  const response = await fetch(`${stack.url}/functions/v1/${name}${query}`, {
    method: 'POST',
    headers: { apikey: stack.anonKey, 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  return { status: response.status, body: json };
}

const brief = result => `${result.status} ${JSON.stringify(result.body).slice(0, 220)}`;

async function flows(stack, fx, fake) {
  const { service, ok } = fx;
  const asaasCalls = filter => fake.calls.filter(call => call.host === ASAAS_HOST && filter(call));

  log('criando administrador, prestador aprovado e cliente');
  const admin = await fx.createUser('admin');
  ok(await service.from('admins').insert({ user_id: admin.id }), 'admins');
  const provider = await fx.approvedProvider(admin, 'prest');
  const client = await fx.createUser('cliente');
  const providerCpf = randomCpf();

  // asaas-onboard: opens the subaccount; the key Asaas returns goes to the Vault
  const onboard = await callFunction(stack, 'asaas-onboard', {
    jwt: provider.jwt,
    body: {
      name: 'Prestador E2E', email: provider.email, cpf_cnpj: providerCpf, mobile_phone: '+5511987654321', income_value_cents: 500000,
      address: 'Rua Teste', address_number: '100', province: 'Pinheiros', postal_code: '05422000', birth_date: '1990-05-20',
    },
  });
  check('asaas-onboard abre a subconta', onboard.status === 201 && onboard.body.data?.status === 'active', brief(onboard));
  const account = (await service.from('provider_payment_accounts').select('asaas_account_id, api_key_secret_id').eq('provider_id', provider.id).maybeSingle()).data;
  check('asaas-onboard grava a conta e a chave no Vault', Boolean(account?.asaas_account_id && account?.api_key_secret_id));
  const subKey = [...fake.state.subKeys][0];

  // subscriptions-manage: Pro plan. With a trial on the platform (pro_trial_days) the plan is Pro at once;
  // either way the first charge of the subscription, paid, comes back through the webhook of the root account
  const subscribe = await callFunction(stack, 'subscriptions-manage', { jwt: provider.jwt, body: { action: 'subscribe', method: 'pix', cpf_cnpj: providerCpf } });
  check('subscriptions-manage aceita a assinatura', subscribe.status === 201 && subscribe.body.ok === true, brief(subscribe));
  const subscription = [...fake.state.subscriptions.values()].at(-1);
  must(subscription, 'o Asaas falso não recebeu a assinatura');
  fake.state.payments.get(subscription.paymentId).status = 'RECEIVED';
  const paid = await callFunction(stack, 'asaas-webhook', {
    headers: { 'asaas-access-token': WEBHOOK_TOKEN },
    body: { id: `evt_e2e_${RUN}_sub`, event: 'PAYMENT_RECEIVED', payment: { id: subscription.paymentId, subscription: subscription.id } },
  });
  check('asaas-webhook (conta raiz) recebe o pagamento da assinatura', paid.status === 200 && paid.body.ok === true, brief(paid));
  const plan = (await service.from('providers').select('plan').eq('id', provider.id).single()).data?.plan;
  const stored = (await service.from('subscriptions').select('status, current_period_end').eq('provider_id', provider.id).maybeSingle()).data;
  check('o prestador ficou Pro com a assinatura ativa', plan === 'pro' && stored?.status === 'active', `plan=${plan}, assinatura ${JSON.stringify(stored)}, resposta ${subscribe.body.data?.status}`);

  // CRM client with document and an own booking (the RPCs of the app, as the provider)
  const crm = ok(
    await provider.client.from('provider_clients').insert({ provider_id: provider.id, name: 'Dona Maria E2E', phone: '11987654321', email: `e2e-${RUN}-crm@example.com`, cpf_cnpj: randomCpf() }).select('id').single(),
    'cliente do CRM',
  );
  const day = spDate(10 + randomInt(20));
  const bookingId = ok(
    await provider.client.rpc('create_own_booking', {
      p_provider_client: crm.id, p_occupation: provider.occupation, p_period: `[${day}T09:00:00-03:00,${day}T11:00:00-03:00)`, p_price_cents: 15000,
    }),
    'create_own_booking',
  );

  // charges-create: the body the app sends (services/charges.ts), and the old shape refused
  const refused = await callFunction(stack, 'charges-create', {
    jwt: provider.jwt, body: { booking_id: bookingId, method: 'pix', customer: { cpf_cnpj: providerCpf, name: 'Carlos' } },
  });
  check('charges-create recusa `customer`', refused.status === 400 && refused.body.error?.code === 'invalid_input', brief(refused));
  const before = fake.calls.length;
  const charge = await callFunction(stack, 'charges-create', { jwt: provider.jwt, body: { booking_id: bookingId, method: 'pix', due_date: spDate(3) } });
  check('charges-create cobra o atendimento próprio', charge.status === 201 && charge.body.data?.status === 'pending', brief(charge));
  const chargeCalls = fake.calls.slice(before).filter(call => call.host === ASAAS_HOST);
  check(
    'a cobrança foi feita na subconta, com o pagador do CRM',
    chargeCalls.length > 0 && chargeCalls.every(call => call.headers.access_token === subKey) &&
      chargeCalls.some(call => call.path === '/v3/customers' && call.body?.name === 'Dona Maria E2E'),
  );
  const paymentRow = (await service.from('payments').select('id, status, asaas_payment_id, received_at').eq('booking_id', bookingId).maybeSingle()).data;
  check('payments: linha pendente com a cobrança do Asaas', paymentRow?.status === 'pending' && Boolean(paymentRow?.asaas_payment_id));

  // asaas-webhook: a wrong token changes nothing; the subaccount token applies PAYMENT_RECEIVED
  const event = { id: `evt_e2e_${RUN}_pay`, event: 'PAYMENT_RECEIVED', payment: { id: paymentRow?.asaas_payment_id } };
  const wrong = await callFunction(stack, 'asaas-webhook', { query: `?acct=${provider.id}`, headers: { 'asaas-access-token': WEBHOOK_TOKEN }, body: event });
  check('asaas-webhook recusa o token da plataforma numa subconta', wrong.status === 401, brief(wrong));
  fake.state.payments.get(paymentRow?.asaas_payment_id).status = 'RECEIVED';
  const received = await callFunction(stack, 'asaas-webhook', {
    query: `?acct=${provider.id}`, headers: { 'asaas-access-token': subaccountToken(provider.id) }, body: event,
  });
  check('asaas-webhook aplica PAYMENT_RECEIVED da subconta', received.status === 200 && received.body.data?.payment_status === 'received', brief(received));
  const after = (await service.from('payments').select('status, received_at').eq('id', paymentRow?.id).single()).data;
  check('payments.status = received e received_at preenchido', after?.status === 'received' && Boolean(after?.received_at), JSON.stringify(after));
  const verified = asaasCalls(call => call.method === 'GET' && call.path === `/v3/payments/${paymentRow?.asaas_payment_id}`);
  check('o webhook conferiu a cobrança no Asaas com a chave da subconta', verified.length > 0 && verified.every(call => call.headers.access_token === subKey));

  // asaas-webhooks-sync: admin only; dry_run reads and writes nothing in Asaas
  const denied = await callFunction(stack, 'asaas-webhooks-sync', { jwt: provider.jwt, body: { provider_id: provider.id, dry_run: true } });
  check('asaas-webhooks-sync recusa quem não é admin', denied.status === 403, brief(denied));
  const writesBefore = asaasCalls(call => call.path.startsWith('/v3/webhooks') && call.method !== 'GET').length;
  const dry = await callFunction(stack, 'asaas-webhooks-sync', { jwt: admin.jwt, body: { provider_id: provider.id, dry_run: true } });
  const writesAfter = asaasCalls(call => call.path.startsWith('/v3/webhooks') && call.method !== 'GET').length;
  check('asaas-webhooks-sync dry_run responde ao admin', dry.status === 200 && dry.body.ok === true, brief(dry));
  check('dry_run não escreveu webhook no Asaas', writesAfter === writesBefore && asaasCalls(call => call.path === '/v3/webhooks').length > 0);
  check('a resposta do sync não traz chave nem token', !JSON.stringify(dry.body).includes(subKey) && !JSON.stringify(dry.body).includes(subaccountToken(provider.id)));

  // quote-assist: consent of the provider, answer of the fake Anthropic
  ok(await provider.client.from('consents').insert({ purpose: 'ai_assist', version: 'e2e', granted: true }), 'consentimento');
  const assist = await callFunction(stack, 'quote-assist', {
    jwt: provider.jwt, body: { description: 'Pintar a sala, uns 40 m² de parede, com duas demãos e material incluso' },
  });
  check('quote-assist responde com o modelo falso', assist.status === 200 && Array.isArray(assist.body.data?.items), brief(assist));
  check('a API da Anthropic falsa recebeu a chamada', fake.calls.some(call => call.host === 'api.anthropic.com'));

  // notify-dispatch: only when every due row in the queue is from this run
  const mine = fx.users.map(user => user.id);
  // The same predicate as public.claim_notifications: due queued rows AND `sending` rows that can be reclaimed
  // (never claimed, or claimed more than 10 minutes ago). notify-dispatch has no user filter.
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: due } = await service
    .from('notifications')
    .select('id, user_id')
    .or(`and(status.eq.queued,scheduled_for.lte.${nowIso}),and(status.eq.sending,or(claimed_at.is.null,claimed_at.lt.${staleIso}))`);
  const foreign = (due ?? []).filter(row => !mine.includes(row.user_id));
  if (foreign.length > 0) {
    log(`notify-dispatch não exercitado: a fila tem ${foreign.length} notificação(ões) de outros usuários (na fila ou reivindicáveis)`);
  } else {
    ok(await service.from('profiles').update({ phone: '+5511987654321' }).eq('id', provider.id), 'telefone');
    const params = { amount_cents: 15000, client_name: 'Dona Maria' };
    ok(
      await service.from('notifications').insert([
        { user_id: provider.id, channel: 'whatsapp', phone: '+5511987654321', template: 'pagamento_recebido', params },
        { user_id: provider.id, channel: 'email', email: provider.email, template: 'pagamento_recebido', params },
      ]),
      'notificações',
    );
    const queued = ((await service.from('notifications').select('id').eq('status', 'queued').in('user_id', mine)).data ?? []).length;
    const dispatch = await callFunction(stack, 'notify-dispatch', { headers: { 'x-cron-secret': CRON_SECRET }, body: { limit: queued } });
    check('notify-dispatch processa a fila', dispatch.status === 200, brief(dispatch));
    const sent = (await service.from('notifications').select('channel, status').eq('user_id', provider.id)).data ?? [];
    check('WhatsApp e e-mail enviados aos falsos', ['whatsapp', 'email'].every(channel => sent.some(row => row.channel === channel && row.status === 'sent')), JSON.stringify(sent));
    check('o WhatsApp e o Resend falsos receberam', fake.calls.some(call => call.host === 'graph.facebook.com') && fake.calls.some(call => call.host === 'api.resend.com'));
  }

  // account-delete: the client erases the account
  const deleted = await callFunction(stack, 'account-delete', { jwt: client.jwt, body: { confirm: 'EXCLUIR' } });
  check('account-delete exclui a conta', deleted.status === 200 && deleted.body.ok === true, brief(deleted));
  const gone = await service.auth.admin.getUserById(client.id);
  check('o usuário saiu do Auth', Boolean(gone.error) || !gone.data?.user);
  const requestId = deleted.body.data?.data_request_id;
  if (requestId) fx.dataRequests.push(requestId);
  const request = requestId ? (await service.from('data_requests').select('kind, status, user_id').eq('id', requestId).maybeSingle()).data : null;
  check('o pedido de exclusão ficou concluído e sem o usuário', request?.kind === 'delete' && request.status === 'completed' && request.user_id === null, JSON.stringify(request));
  const profile = (await service.from('profiles').select('id').eq('id', client.id).maybeSingle()).data;
  check('o perfil do usuário excluído não existe mais', profile === null);

  check('nenhuma rota falsa ausente foi chamada', fake.state.unknown.length === 0, fake.state.unknown.join('; '));
}

// ---- main -------------------------------------------------------------------------------------------

async function main() {
  const stack = stackStatus();
  const dir = mkdtempSync(join(tmpdir(), 'workeasy-e2e-functions-'));
  log(`pasta temporária ${dir}`);
  const certificates = makeCertificates(dir);
  const fake = fakeApis();
  fake.server.setSecureContext({ key: certificates.key, cert: certificates.cert });
  await new Promise((resolve, reject) => {
    fake.server.once('error', error => reject(new Error(`servidor falso na porta 443: ${error.message}`)));
    fake.server.listen(443, '0.0.0.0', resolve);
  });

  const envFile = join(dir, 'functions.env');
  writeFileSync(envFile, [
    'APP_ENV=development',
    'SITE_URL=http://localhost:3000',
    `ASAAS_BASE_URL=https://${ASAAS_HOST}/v3`,
    `ASAAS_API_KEY=${ROOT_KEY}`,
    `ASAAS_WEBHOOK_TOKEN=${WEBHOOK_TOKEN}`,
    `TRIAL_DOCUMENT_SECRET=${DOCUMENT_SECRET}`,
    'WHATSAPP_TOKEN=e2e-whatsapp-token',
    `WHATSAPP_PHONE_NUMBER_ID=${WHATSAPP_PHONE_ID}`,
    'RESEND_API_KEY=re_e2e_fake',
    'EMAIL_FROM=WorkEasy E2E <e2e@example.com>',
    'ANTHROPIC_API_KEY=sk-ant-e2e-fake',
    `CRON_SECRET=${CRON_SECRET}`,
    'DENO_TLS_CA_STORE=system',
    `SSL_CERT_FILE=${CA_IN_CONTAINER}`,
    '',
  ].join('\n'));

  const fx = fixtures(stack);
  let serve = null;
  let failure = null;
  try {
    log('subindo supabase functions serve');
    serve = await startServe(dir, envFile, certificates.bundle);
    await flows(stack, fx, fake);
  } catch (error) {
    failure = error;
    console.error(`[e2e] erro: ${error.stack ?? error}`);
    if (serve) console.error(`[e2e] fim do log do runtime:\n${serve.output().slice(-3000)}`);
  } finally {
    log('limpando');
    const problems = await fx.cleanup(stack.dbUrl).catch(error => [String(error)]);
    check('limpeza completa', problems.length === 0, problems.join('; '));
    await stopServe(serve);
    fake.server.close();
    if (process.env.E2E_KEEP === '1') log(`pasta mantida: ${dir}`);
    else rmSync(dir, { recursive: true, force: true });
  }
  const failed = results.filter(result => !result.ok);
  log(`${results.length - failed.length} de ${results.length} verificações passaram${failure ? '; a execução parou num erro' : ''}`);
  process.exit(failed.length === 0 && !failure ? 0 : 1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
