/** Local PostgreSQL only. Creates and drops its own database; a busy source database is left alone.
 * In the test container use RIDE_TEST_DB_CONTAINER=supabase_db_workeasy PGHOST=/tmp PGPORT=55404.
 * The source has the project's migrations and 00_helpers.test.sql installed. No provider requests. */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const host = process.env.PGHOST ?? '/tmp';
if (!['/tmp', '/var/run/postgresql', 'localhost', '127.0.0.1'].includes(host))
  throw new Error('Use um PostgreSQL local de ensaio.');
const source = process.env.PGDATABASE ?? 'postgres';
if (!/^[a-zA-Z0-9_]+$/.test(source)) throw new Error('Nome de banco inválido.');
const database = 'ride_order_test_' + randomUUID().replaceAll('-', '');
const docker = process.env.RIDE_TEST_DB_CONTAINER;
function run(db, sql, program = 'psql', options = null) {
  const args = options ?? [
    '-XAtq',
    '-v',
    'ON_ERROR_STOP=1',
    '-h',
    host,
    '-p',
    process.env.PGPORT ?? '54322',
    '-U',
    process.env.PGUSER ?? 'postgres',
    '-d',
    db,
  ];
  return new Promise((resolve, reject) => {
    const child = spawn(docker ? 'docker' : program, docker ? ['exec', '-i', docker, program, ...args] : args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let out = '',
      err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim()))));
    child.stdin.end(sql);
  });
}
const fixture = await readFile(
  new URL('../supabase/tests/concurrency/204_ride_payments.sql', import.meta.url),
  'utf8',
);
const as = (role, sql) =>
  'begin; select tests.authenticate_' +
  (role === 'service' ? 'service()' : "as('" + role + "')") +
  '; ' +
  sql +
  '; select pg_sleep(.15); commit;';
const schema = await run(source, '', 'pg_dump', [
  '--schema-only',
  '--no-comments',
  '--no-owner',
  '-n',
  'public',
  '-n',
  'private',
  '-n',
  'auth',
  '-n',
  'storage',
  '-n',
  'tests',
  '-h',
  host,
  '-p',
  process.env.PGPORT ?? '54322',
  '-U',
  process.env.PGUSER ?? 'postgres',
  '-d',
  source,
]);
await run('template1', 'create database ' + database + ' template template0;');
try {
  await run(
    database,
    'drop schema public; create schema extensions; create extension btree_gist with schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions;',
  );
  // Supabase owns cluster-wide defaults for roles such as auth_admin. All cloned objects carry their explicit grants.
  await run(database, schema.replace(/^ALTER DEFAULT PRIVILEGES[^;]+;/gm, ''));
  await run(database, 'begin;\n' + fixture + '\ncommit;');
  const ids = (
    await run(
      database,
      "select id from private.ride_payment_orders order by case leg_id when md5('204-race-leg-1')::uuid then 1 when md5('204-race-leg-2')::uuid then 2 else 3 end;",
    )
  ).split('\n');
  const reserve = await Promise.allSettled(
    ids
      .slice(0, 2)
      .map((id, i) =>
        run(
          database,
          as(
            'client_a',
            "select public.ride_apply_order_benefit('" + id + "',md5('204-benefit-" + (i + 1) + "')::uuid,700)",
          ),
        ),
      ),
  );
  assert.equal(reserve.filter((x) => x.status === 'fulfilled').length, 1);
  assert.match(reserve.find((x) => x.status === 'rejected').reason.message, /benefit_unavailable/);
  assert.equal(await run(database, 'select committed_cents from private.ride_benefit_campaigns;'), '700');
  const order = ids[2];
  await run(
    database,
    as('service', "select public.ride_prepare_order_payment('" + order + "',tests.uid('client_a'),'simulation')"),
  );
  const lease = await Promise.all(
    [1, 2].map(() =>
      run(database, as('service', "select public.ride_claim_order_send('" + order + "','simulation')")),
    ),
  );
  assert.deepEqual(lease.sort(), ['f', 't']);
  const observed = JSON.stringify({
    payment: 'pay_race',
    customer: 'cus_fixture204',
    amount: 1000,
    splitCents: 900,
    pspFee: 10,
    refunded: 0,
    paidToDriver: 900,
    returnedByDriver: 0,
    status: 'paid',
  });
  await Promise.all(
    [1, 2].map(() =>
      run(
        database,
        as('service', "select public.ride_observe_order_payment('" + order + "','simulation','" + observed + "')"),
      ),
    ),
  );
  assert.equal(
    await run(database, "select count(*) from private.ride_financial_events where kind='capture';"),
    '1',
  );
  const withdrawals = await Promise.allSettled(
    [1, 2].map(() =>
      run(database, as('provider_c', "select public.ride_request_withdrawal('" + randomUUID() + "',600,0)")),
    ),
  );
  assert.equal(withdrawals.filter((x) => x.status === 'fulfilled').length, 1);
  assert.match(withdrawals.find((x) => x.status === 'rejected').reason.message, /ride_financial_state/);
  assert.equal(await run(database, 'select sum(gross_cents) from private.ride_withdrawals;'), '600');
  console.log('4 corridas concorrentes verificadas: orçamento, emissão, captura/repasse, saque.');
} finally {
  await run('template1', 'drop database ' + database + ';');
}
