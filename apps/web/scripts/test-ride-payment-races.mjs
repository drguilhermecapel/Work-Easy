/** Local PostgreSQL only. Creates and drops its own database; a busy source database is left alone.
 * Against the local Supabase stack (psql and pg_dump run inside its database container):
 *   RIDE_TEST_DB_CONTAINER=supabase_db_workeasy PGHOST=127.0.0.1 PGPORT=5432 npm run test:races
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
  new URL('./fixtures/204_ride_payments.sql', import.meta.url),
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
    'drop schema public; create schema extensions; create extension btree_gist with schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions; create extension pg_trgm with schema extensions;',
  );
  // Supabase owns cluster-wide defaults for roles such as auth_admin. All cloned objects carry their explicit grants.
  await run(database, schema.replace(/^ALTER DEFAULT PRIVILEGES[^;]+;/gm, ''));
  await run(database, 'begin;\n' + fixture + '\ncommit;');
  const ids = (
    await run(
      database,
      "select id from private.ride_payment_orders order by case leg_id when md5('204-race-leg-1')::uuid then 1 when md5('204-race-leg-2')::uuid then 2 when md5('204-race-leg-3')::uuid then 3 else 4 end;",
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
    await run(
      database,
      "select count(*) from private.ride_financial_events where kind='capture' and leg_id=md5('204-race-leg-3')::uuid;",
    ),
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
  // One approved case, two possible sources: the benefit restoration (admin) against the
  // provider refund reservation and send lease (service). Both paths lock the case first.
  const disputed = "md5('204-race-case')::uuid";
  const [benefit, provider] = await Promise.allSettled([
    run(database, as('admin', 'select public.ride_refund_order_source(' + disputed + ",'benefit',0,'race benefit')")),
    run(
      database,
      as(
        'service',
        'select public.ride_prepare_order_refund(' +
          disputed +
          ",tests.uid('admin'),'simulation',0,'race provider'); select public.ride_claim_order_refund(" +
          disputed +
          ",'simulation')",
      ),
    ),
  ]);
  const loser = [benefit, provider].filter((x) => x.status === 'rejected');
  assert.equal(loser.length, 1, 'exatamente um caminho de devolução vence');
  assert.match(loser[0].reason.message, /ride_operation_conflict|ride_financial_state/);
  const [restored, reserved, sent, status, available] = (
    await run(
      database,
      "select (select count(*) from private.ride_financial_events where leg_id=md5('204-race-leg-4')::uuid and kind='benefit_restored')," +
        ' (select count(*) from private.ride_order_refunds r where r.case_id=c.id and r.voided_at is null),' +
        ' (select count(*) from private.ride_order_refunds r where r.case_id=c.id and r.sent), c.status,' +
        " (select available_cents from private.ride_benefits where id=md5('204-benefit-mixed')::uuid)" +
        ' from private.ride_order_cases c where c.id=' +
        disputed +
        ';',
    )
  ).split('|');
  assert.equal(Number(restored) + Number(reserved), 1, 'benefício restaurado ou devolução reservada, nunca os dois');
  assert.deepEqual(
    [restored, reserved, sent, status, available],
    benefit.status === 'fulfilled' ? ['1', '0', '0', 'settled', '300'] : ['0', '1', '1', 'approved', '0'],
  );
  console.log(
    '5 corridas concorrentes verificadas: orçamento, emissão, captura/repasse, saque, devolução exclusiva (' +
      (benefit.status === 'fulfilled' ? 'benefício' : 'provedor') +
      ' venceu).',
  );
} finally {
  await run('template1', 'drop database ' + database + ';');
}
