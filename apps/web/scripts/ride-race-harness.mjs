/** Shared by the ride race scripts (test-ride-payment-races.mjs, test-ride-party-races.mjs,
 * test-ride-mode-races.mjs).
 * Local PostgreSQL only. Each script creates and drops its own database; a busy source database
 * is left alone. Against the local Supabase stack psql and pg_dump run inside its database container:
 *   RIDE_TEST_DB_CONTAINER=supabase_db_workeasy PGHOST=127.0.0.1 PGPORT=5432 npm run test:races
 * The source has the project's migrations and 00_helpers.test.sql installed. No provider requests. */
import { randomInt, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const host = process.env.PGHOST ?? '/tmp';
if (!['/tmp', '/var/run/postgresql', 'localhost', '127.0.0.1'].includes(host))
  throw new Error('Use um PostgreSQL local de ensaio.');
const source = process.env.PGDATABASE ?? 'postgres';
if (!/^[a-zA-Z0-9_]+$/.test(source)) throw new Error('Nome de banco inválido.');
const docker = process.env.RIDE_TEST_DB_CONTAINER;
const server = ['-h', host, '-p', process.env.PGPORT ?? '54322', '-U', process.env.PGUSER ?? 'postgres'];

/** One psql (or pg_dump) process fed through stdin. Resolves with its trimmed output; any SQL error
 * rejects with psql's message, and the output printed before the error as `output`. */
export function run(db, sql, program = 'psql', options = null) {
  const args = options ?? ['-XAtq', '-v', 'ON_ERROR_STOP=1', ...server, '-d', db];
  return new Promise((resolve, reject) => {
    const child = spawn(docker ? 'docker' : program, docker ? ['exec', '-i', docker, program, ...args] : args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // psql stops reading after the first error: the rest of the input is dropped and the exit code tells.
    child.stdin.on('error', () => {});
    let out = '',
      err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve(out.trim()) : reject(Object.assign(new Error(err.trim()), { output: out.trim() })),
    );
    child.stdin.end(sql);
  });
}

const dump = (...options) => run(source, '', 'pg_dump', [...options, '--no-owner', ...server, '-d', source]);

/** Clones the schema of the source into a fresh database, loads the fixture in one transaction, runs
 * the body with the database name and drops the database whatever happens. Rows are not cloned,
 * except those of `referenceTables`: configuration the migrations seed and the routines read. */
export async function withRaceDatabase({ prefix, fixture, referenceTables = [] }, body) {
  const database = prefix + randomUUID().replaceAll('-', '');
  const setup = await readFile(new URL(fixture, import.meta.url), 'utf8');
  const schema = await dump(
    '--schema-only',
    '--no-comments',
    ...['public', 'private', 'auth', 'storage', 'tests'].flatMap((name) => ['-n', name]),
  );
  const reference = referenceTables.length
    ? await dump('--data-only', ...referenceTables.flatMap((table) => ['-t', table]))
    : '';
  await run('template1', 'create database ' + database + ' template template0;');
  try {
    await run(
      database,
      'drop schema public; create schema extensions; create extension btree_gist with schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions; create extension pg_trgm with schema extensions;',
    );
    // Supabase owns cluster-wide defaults for roles such as auth_admin. All cloned objects carry their explicit grants.
    await run(database, schema.replace(/^ALTER DEFAULT PRIVILEGES[^;]+;/gm, ''));
    if (reference) await run(database, reference);
    await run(database, 'begin;\n' + setup + '\ncommit;');
    return await body(database);
  } finally {
    await run('template1', 'drop database ' + database + ';');
  }
}

/** One transaction of a signed-in role ('service' for the service role, null for the database owner,
 * as pg_cron runs a job): the call and, before the commit, whatever keeps the transaction open so
 * that another session meets its locks. */
const transaction = (role, sql, hold) =>
  'begin; ' +
  (role === null
    ? ''
    : 'select tests.authenticate_' + (role === 'service' ? 'service()' : "as('" + role + "')") + '; ') +
  sql +
  '; ' +
  hold +
  ' commit;';
/** The same transaction on its own, with nothing held. Resolves with psql's output. */
export const act = (database, role, sql) => run(database, transaction(role, sql, ''));
const pause = (seconds) => 'select pg_sleep(' + seconds + ');';
const advisory = (classid) => {
  const key = classid + ',' + randomInt(1, 2 ** 31 - 1);
  return {
    key,
    held: "locktype='advisory' and classid=" + classid + ' and objid=' + key.split(',')[1] + ' and objsubid=2',
  };
};
// Polls for up to thirty seconds inside the session itself; pg_locks is always current.
const until = (condition, then, failure) =>
  'do $$ begin for i in 1..3000 loop if ' +
  condition +
  ' then ' +
  then +
  " return; end if; perform pg_sleep(.01); end loop; raise exception '" +
  failure +
  "'; end $$;\n";

/** Two or more [role, sql, behind] sessions released at the same instant. Each one queues on an
 * advisory lock held by a starter session, which lets go only once all of them are waiting there; a
 * session that never arrives fails the race instead of turning it into a sequential run. A session
 * with `behind` seconds waits that long after the gate, inside its transaction, before its call, so
 * that the side that usually starts first can be made to start second. Every session keeps its
 * transaction open for `hold` seconds after its call. Resolves with one settled result per
 * session, in order. */
export async function race(database, sessions, { hold = 0.2 } = {}) {
  const gate = advisory(517);
  const starter =
    'select pg_advisory_lock(' +
    gate.key +
    ');\n' +
    until(
      '(select count(*) from pg_locks where ' + gate.held + ' and not granted)>=' + sessions.length,
      'perform pg_advisory_unlock(' + gate.key + ');',
      'race_gate_incomplete',
    );
  const queued = until(
    'exists(select from pg_locks where ' + gate.held + " and granted and mode='ExclusiveLock')",
    'perform pg_advisory_lock_shared(' + gate.key + '); perform pg_advisory_unlock_shared(' + gate.key + ');',
    'race_gate_missing',
  );
  const [started, ...settled] = await Promise.allSettled([
    run(database, starter),
    ...sessions.map(([role, sql, behind = 0]) =>
      run(database, queued + transaction(role, (behind ? pause(behind) + ' ' : '') + sql, pause(hold))),
    ),
  ]);
  if (started.status === 'rejected') throw new Error('As sessões não largaram juntas: ' + started.reason.message);
  return settled;
}

/** A fixed order with the two transactions still overlapping: `second` starts only when `first`
 * has made its call and is holding its transaction open, uncommitted. Two advisory locks make the
 * meeting independent of how long either process takes to start: the second session holds `ready`
 * until it sees `made`, which the first one takes after its call, once `ready` is there; the first
 * one then waits for `ready` to be let go and commits a moment later. Resolves with both settled
 * results; a first session that fails is an error of the scenario itself. */
export async function overlap(database, first, second) {
  const made = advisory(518);
  const ready = advisory(519);
  const visible = (lock) => 'exists(select from pg_locks where ' + lock.held + ' and granted)';
  const [led, followed] = await Promise.allSettled([
    run(
      database,
      transaction(
        first[0],
        first[1],
        until(visible(ready), 'perform pg_advisory_xact_lock(' + made.key + ');', 'race_follower_missing') +
          'select pg_advisory_xact_lock_shared(' +
          ready.key +
          '); ' +
          pause(0.3),
      ),
    ),
    run(
      database,
      'select pg_advisory_lock(' +
        ready.key +
        ');\n' +
        until(visible(made), 'perform pg_advisory_unlock(' + ready.key + ');', 'race_leader_missing') +
        transaction(second[0], second[1], ''),
    ),
  ]);
  if (led.status === 'rejected') throw new Error('A primeira sessão falhou: ' + led.reason.message);
  return [led, followed];
}
