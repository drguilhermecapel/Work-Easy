/** Local PostgreSQL only. Creates and drops its own database; a busy source database is left alone.
 * In the test container use RIDE_TEST_DB_CONTAINER=supabase_db_workeasy PGHOST=127.0.0.1 PGPORT=5432.
 * The source has the project's migrations and 00_helpers.test.sql installed. No provider requests.
 * Every race is a pair of real sessions released by one advisory-lock gate and asserted on the final state. */
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import assert from 'node:assert/strict';

const host = process.env.PGHOST ?? '/tmp';
if (!['/tmp', '/var/run/postgresql', 'localhost', '127.0.0.1'].includes(host))
  throw new Error('Use um PostgreSQL local de ensaio.');
const source = process.env.PGDATABASE ?? 'postgres';
if (!/^[a-zA-Z0-9_]+$/.test(source)) throw new Error('Nome de banco inválido.');
const database = 'ride_mode_test_' + randomUUID().replaceAll('-', '');
const docker = process.env.RIDE_TEST_DB_CONTAINER;
const connection = (db) =>
  `-h ${host} -p ${process.env.PGPORT ?? '54322'} -U ${process.env.PGUSER ?? 'postgres'} -d ${db}`.split(' ');
const psql = (db) => ['-XAtq', '-v', 'ON_ERROR_STOP=1', ...connection(db)];
function start(program, args) {
  const child = spawn(docker ? 'docker' : program, docker ? ['exec', '-i', docker, program, ...args] : args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  // psql stops reading after the first error: the rest of the input is dropped and the exit code tells.
  child.stdin.on('error', () => {});
  return child;
}
/** Never rejects for a failed statement: a refused racer is an outcome, not a crash. */
function exec(db, sql, program = 'psql', args = psql(db)) {
  return new Promise((resolve, reject) => {
    const child = start(program, args);
    let out = '',
      err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
    child.stdin.end(sql);
  });
}
async function run(db, sql, program, args) {
  const result = await exec(db, sql, program, args);
  if (result.code !== 0)
    throw new Error(result.err.trim() || `${program ?? 'psql'} terminou com código ${result.code}`);
  return result.out.trim();
}
/** One open session: every statement sent must print exactly one line. It holds the starting gate. */
function openControl(db) {
  const child = start('psql', psql(db));
  const pending = [];
  let buffer = '',
    err = '',
    closed = false;
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      pending.shift()?.resolve(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
    }
  });
  child.stderr.on('data', (chunk) => (err += chunk));
  const done = new Promise((resolve) =>
    child.on('close', () => {
      closed = true;
      for (const waiting of pending.splice(0)) waiting.reject(new Error(err.trim() || 'Sessão de controle encerrada.'));
      resolve();
    }),
  );
  return {
    ask: (sql) =>
      new Promise((resolve, reject) => {
        if (closed) return reject(new Error(err.trim() || 'Sessão de controle encerrada.'));
        pending.push({ resolve, reject });
        child.stdin.write(sql + '\n');
      }),
    close: () => {
      child.stdin.end();
      return done;
    },
  };
}

const GATE = 7206; // advisory lock class of the starting gate, in the disposable database only
const HOLD = 0.3; // seconds each racer keeps its transaction open after its call
const BEHIND = 0.1; // seconds a racer may be sent after the other, still inside the other's transaction
const key = (name) => `md5('206-race-${name}')::uuid`;
// A null role is the database owner, as pg_cron runs the minute job.
const enter = (role) => (role ? `select tests.authenticate_as('${role}');` : '');
let control;
let gates = 0;
/** Runs [role, expression, seconds behind] in concurrent sessions. Each session authenticates and waits at
 * the gate; the gate opens only when all of them are waiting, so the calls start together (or BEHIND apart,
 * so that the side that usually loses the start also arrives first). Each then keeps its transaction open
 * for HOLD seconds: starts closer than HOLD prove the transactions overlapped. No assertion depends on who
 * arrives first. */
async function race(...sessions) {
  const gate = ++gates;
  const early = [];
  await control.ask(`select pg_advisory_lock(${GATE},${gate});`);
  const running = sessions.map(async ([role, expression, behind = 0]) => {
    const result = await exec(
      database,
      `begin;
       ${enter(role)}
       select pg_advisory_xact_lock_shared(${GATE},${gate});
       select pg_sleep(${behind});
       select 't0='||extract(epoch from clock_timestamp());
       select 'r='||coalesce((${expression})::text,'');
       select pg_sleep(${HOLD});
       commit;`,
    );
    early.push(result);
    return result;
  });
  try {
    for (const deadline = Date.now() + 60000; ; await sleep(15)) {
      const waiting = await control.ask(
        `select count(*) from pg_locks where locktype='advisory' and classid=${GATE} and objid=${gate} and not granted
           and database=(select oid from pg_database where datname=current_database());`.replace(/\s+/g, ' '),
      );
      if (Number(waiting) === sessions.length) break;
      if (early.length || Date.now() > deadline)
        throw new Error('Uma sessão concorrente não chegou à largada. ' + (early[0]?.err.trim() ?? ''));
    }
  } finally {
    await control.ask(`select pg_advisory_unlock(${GATE},${gate});`);
    await Promise.allSettled(running);
  }
  const results = (await Promise.all(running)).map((result, i) => ({
    role: sessions[i][0],
    ok: result.code === 0,
    value: /^r=(.*)$/m.exec(result.out)?.[1],
    error: result.code === 0 ? null : (/ERROR:\s+(.*)/.exec(result.err)?.[1] ?? result.err.trim()),
    t0: Number(/^t0=(.*)$/m.exec(result.out)?.[1]),
  }));
  for (const result of results) assert.ok(Number.isFinite(result.t0), 'sessão parou antes da largada: ' + result.error);
  const starts = results.map((result) => result.t0);
  assert.ok(Math.max(...starts) - Math.min(...starts) < HOLD, 'as sessões não ficaram abertas ao mesmo tempo');
  return results;
}
/** Exactly one of the two racers is served; the other is refused with the expected code. */
function onlyOne(results, code) {
  assert.deepEqual(results.map((x) => x.ok).sort(), [false, true], JSON.stringify(results));
  assert.equal(results.find((x) => !x.ok).error, code);
  return results.find((x) => x.ok);
}
const bothServed = (results) =>
  assert.deepEqual(
    results.map((x) => x.error),
    [null, null],
  );
const query = (sql) => run(database, sql);
const json = async (sql) => JSON.parse(await query(sql));
const uid = (role) => query(`select tests.uid('${role}');`);
const same = (a, b) => new Date(a).getTime() === new Date(b).getTime();
const later = (at, minutes) => new Date(new Date(at).getTime() + minutes * 60000).toISOString();
const book = (name, seats, operation) =>
  `public.ride_book_shuttle_seat(${key('departure-' + name)},${seats},1500,${key(operation)})`;
const rebook = (seat, name, operation) =>
  `public.ride_rebook_shuttle_seat('${seat}',${key('departure-' + name)},${key(operation)})`;
const seat = (name) => query(`select id from private.ride_shuttle_seats where operation_key=${key('seat-' + name)};`);
const departure = (name) =>
  json(`select jsonb_build_object('state',d.state,'total',d.seats_total,
      'confirmed',(select coalesce(sum(s.seats),0) from private.ride_shuttle_seats s where s.departure_id=d.id and s.state='confirmed'),
      'holders',(select coalesce(jsonb_agg(s.passenger_id order by s.passenger_id),'[]') from private.ride_shuttle_seats s
        where s.departure_id=d.id and s.state='confirmed'),
      'released',(select count(*) from private.ride_shuttle_seats s where s.departure_id=d.id and s.state='released'),
      'events',(select coalesce(jsonb_object_agg(e.action,e.n),'{}') from (select action,count(*) as n
        from private.ride_shuttle_events where departure_id=d.id group by action) e))
    from private.ride_shuttle_departures d where d.id=${key('departure-' + name)};`);
/** The leg born from a fixture quote. slot_fits: the slot is the pickup plus the duration. calendar_fits:
 * the driver's calendar covers the slot, and nobody's calendar is kept on a leg without a driver. */
const leg = (quote) =>
  json(`select jsonb_build_object('id',l.id,'ride',l.ride_id,'status',l.status,'driver',l.driver_id,'pickup',l.pickup_at,
      'minutes',l.duration_minutes,'fare',l.fare_cents,'fee',l.fee_cents,'driver_cents',l.driver_cents,'quote',l.source_quote_id,
      'slot_fits',l.slot=tstzrange(l.pickup_at,l.pickup_at+make_interval(mins=>l.duration_minutes),'[)'),
      'calendar_fits',case when l.driver_id is null then l.driver_slot is null else coalesce(l.driver_slot @> l.slot,false) end,
      'reserve',(select t.state from private.ride_reserve_terms t where t.leg_id=l.id))
    from public.ride_legs l join public.rides r on r.id=l.ride_id join private.ride_quotes q on q.id=r.quote_id
    where q.request_key=${key('quote-' + quote)};`);
/** The time proposals of a leg, oldest request first, each with the number of outcome rows in the audit. */
const shifts = (legId) =>
  json(`select coalesce(jsonb_agg(jsonb_build_object('state',s.state,'outcome',s.outcome,'old',s.old_pickup,'new',s.new_pickup,
      'accepted',s.accepted,'outcomes',(select count(*) from private.ride_reserve_events e where e.operation_key=s.id
        and e.action in ('shift_accepted','shift_declined','shift_conflict','shift_expired','shift_superseded','shift_unavailable')))
      order by s.created_at),'[]')
    from private.ride_reserve_shifts s where s.leg_id='${legId}';`);

const fixture = await readFile(new URL('./fixtures/206_ride_modes.sql', import.meta.url), 'utf8');
const schema = await run(source, '', 'pg_dump', [
  ...'--schema-only --no-comments --no-owner -n public -n private -n auth -n storage -n tests'.split(' '),
  ...connection(source),
]);
await run('template1', `create database ${database} template template0;`);
try {
  // pg_trgm: the cloned schema has trigram indexes, so the extension has to exist before the dump is loaded.
  await run(
    database,
    'drop schema public; create schema extensions; create extension btree_gist with schema extensions; create extension pgcrypto with schema extensions; create extension "uuid-ossp" with schema extensions; create extension pg_trgm with schema extensions;',
  );
  // Supabase owns cluster-wide defaults for roles such as auth_admin. All cloned objects carry their explicit grants.
  await run(database, schema.replace(/^ALTER DEFAULT PRIVILEGES[^;]+;/gm, ''));
  await run(database, 'begin;\n' + fixture + '\ncommit;');
  control = openControl(database);
  const [clientA, clientB, providerA, providerB, providerC, providerE] = await Promise.all(
    ['client_a', 'client_b', 'provider_a', 'provider_b', 'provider_c', 'provider_e'].map(uid),
  );
  const first = {};

  // (a) Two passengers ask 2 seats each of a departure with 3: one is served, the sum never passes the total.
  const lastSeats = onlyOne(
    await race(['client_a', book('a', 2, 'book-a-a')], ['client_b', book('a', 2, 'book-a-b')]),
    'ride_seat_unavailable',
  );
  const a = await departure('a');
  assert.deepEqual([a.confirmed, a.holders.length, a.events], [2, 1, { booked: 1 }]);
  assert.ok(a.confirmed <= a.total);
  first.a = lastSeats.role;

  // (b) The last seat is booked while the operation cancels the departure, in both arrival orders: no seat
  // stays confirmed on a cancelled departure, and a passenger served before the cancellation is released.
  first.b = [];
  for (const [name, bookingBehind, cancelBehind] of [
    ['b1', 0, BEHIND],
    ['b2', BEHIND, 0],
  ]) {
    const [lastSeat, cancellation] = await race(
      ['client_a', book(name, 1, `book-${name}-a`), bookingBehind],
      [
        'admin',
        `public.admin_cancel_shuttle_departure(${key('departure-' + name)},'Motorista ausente no ensaio',${key('cancel-' + name)})`,
        cancelBehind,
      ],
    );
    assert.ok(cancellation.ok, cancellation.error);
    if (!lastSeat.ok) assert.equal(lastSeat.error, 'ride_seat_unavailable');
    const b = await departure(name);
    const released = lastSeat.ok ? 2 : 1;
    assert.deepEqual([b.state, b.confirmed, b.released], ['cancelled', 0, released]);
    assert.deepEqual(b.events, { booked: released, released, departure_cancelled: 1 });
    assert.equal(JSON.parse(cancellation.value).released_seats, released);
    assert.equal(
      await query(
        `select count(*) from private.ride_shuttle_seats where departure_id=${key('departure-' + name)} and passenger_id='${clientA}';`,
      ),
      lastSeat.ok ? '1' : '0',
    );
    first.b.push(lastSeat.ok ? 'reserva' : 'cancelamento');
  }

  // (c) Two seats of C1 are moved to the last place of C2: one moves at the same price, the other keeps its seat.
  const [seatA, seatB] = [await seat('c-a'), await seat('c-b')];
  const moved = onlyOne(
    await race(['client_a', rebook(seatA, 'c2', 'rebook-c-a')], ['client_b', rebook(seatB, 'c2', 'rebook-c-b')]),
    'ride_seat_unavailable',
  );
  const [c1, c2] = [await departure('c1'), await departure('c2')];
  const [mover, stayer] = moved.role === 'client_a' ? [clientA, clientB] : [clientB, clientA];
  assert.deepEqual(
    [c2.confirmed, c2.total, c2.holders.includes(mover), c2.holders.includes(stayer)],
    [2, 2, true, false],
  );
  assert.deepEqual([c1.confirmed, c1.holders, c1.events.rebooked_from, c2.events.rebooked_to], [1, [stayer], 1, 1]);
  assert.equal(
    await query(
      `select string_agg(o.state||'>'||coalesce(n.state||':'||n.seat_cents,'-'),',' order by (o.passenger_id='${mover}') desc)
       from private.ride_shuttle_seats o left join private.ride_shuttle_seats n on n.replaces=o.id where o.id in ('${seatA}','${seatB}');`,
    ),
    'rebooked>confirmed:1500,confirmed>-',
  );
  first.c = moved.role;

  // Two seats cross between departures with room: both move, so the two departure locks never wait in a circle.
  bothServed(
    await race(
      ['client_a', rebook(await seat('x-a'), 'x2', 'rebook-x-a')],
      ['client_b', rebook(await seat('x-b'), 'x1', 'rebook-x-b')],
    ),
  );
  assert.deepEqual([(await departure('x1')).holders, (await departure('x2')).holders], [[clientB], [clientA]]);
  // After every seat race: no departure sold beyond its total, no confirmed seat on a closed departure.
  assert.equal(
    await query(
      `select count(*) from private.ride_shuttle_departures d cross join lateral (select coalesce(sum(s.seats),0) as seats
         from private.ride_shuttle_seats s where s.departure_id=d.id and s.state='confirmed') taken
       where taken.seats>d.seats_total or (d.state<>'open' and taken.seats>0);`,
    ),
    '0',
  );

  // (d) Payer and driver accept the same extension at once: applied once, the fare grows once.
  const block = await leg('d');
  const extension = await query(
    `select id from private.ride_block_extensions where operation_key=${key('extension-d')};`,
  );
  const decisions = await race(
    ['client_b', `public.ride_decide_extension('${extension}',true)`],
    ['provider_d', `public.ride_decide_extension('${extension}',true)`],
  );
  assert.deepEqual(decisions.map((x) => x.value).sort(), ['applied', 'pending'], JSON.stringify(decisions));
  const extended = await leg('d');
  assert.deepEqual([block.fare, block.minutes, extended.fare, extended.minutes], [9000, 60, 13000, 90]);
  assert.deepEqual(
    [extended.fee + extended.driver_cents, extended.slot_fits, extended.calendar_fits],
    [13000, true, true],
  );
  assert.equal(
    await query(
      `select concat_ws(':',e.state,(e.new_quote='${extended.quote}')::text,e.cents,
         (select count(*) from private.ride_block_extension_decisions x where x.extension_id=e.id and x.accepted),
         (select count(*) from private.ride_quotes q where q.existing_ride_id='${block.ride}'),
         (select count(*) from private.ride_block_extensions x where x.leg_id=e.leg_id),
         (select b.extended_minutes||'/'||b.extension_cents from private.ride_leg_blocks b where b.leg_id=e.leg_id))
       from private.ride_block_extensions e where e.id='${extension}';`,
    ),
    'applied:true:4000:2:1:1:30/4000',
  );
  first.d = decisions.find((x) => x.value === 'pending').role;

  // (e) The driver accepts a new time while the passenger asks a newer one, in both arrival orders: either
  // the accepted time is where the newer request starts from, or the first request was replaced and the
  // driver is told it is gone. One proposal stays open, about the time the leg really has.
  first.e = [];
  for (const [name, driverBehind, passengerBehind] of [
    ['e1', 0, BEHIND],
    ['e4', BEHIND, 0],
  ]) {
    const reserve = await leg(name);
    const [answer, newer] = await race(
      ['provider_c', `public.driver_decide_shift(${key('shift-' + name)},true)`, driverBehind],
      [
        'client_a',
        `public.ride_shift_reservation('${reserve.id}','${later(reserve.pickup, 60)}','passenger',${key('shift-newer-' + name)})->>'state'`,
        passengerBehind,
      ],
    );
    assert.deepEqual([newer.ok, newer.value], [true, 'proposed'], JSON.stringify(newer));
    if (answer.ok) assert.equal(answer.value, 'applied');
    else assert.equal(answer.error, 'offer_unavailable');
    const shifted = await leg(name);
    const [asked, askedLater, ...others] = await shifts(reserve.id);
    assert.deepEqual(
      [others.length, asked.state, asked.outcome, asked.outcomes],
      answer.ok ? [0, 'applied', 'driver_accepted', 1] : [0, 'expired', 'superseded', 1],
    );
    assert.deepEqual(
      [askedLater.state, askedLater.outcomes, same(askedLater.old, shifted.pickup)],
      ['proposed', 0, true],
    );
    assert.ok(same(shifted.pickup, answer.ok ? asked.new : reserve.pickup));
    assert.deepEqual(
      [shifted.status, shifted.driver, shifted.reserve, shifted.slot_fits, shifted.calendar_fits],
      ['accepted', providerC, 'confirmed', true, true],
    );
    first.e.push(answer.ok ? 'motorista' : 'passageiro');
  }

  // (e) The driver answers after the window while the minute job expires the proposal, in both arrival
  // orders: one outcome, one release, and the leg returns to dispatch at the new time without a driver.
  first.expiry = [];
  for (const [name, role, driver, driverBehind, jobBehind] of [
    ['e2', 'provider_b', providerB, 0, BEHIND],
    ['e3', 'provider_a', providerA, BEHIND, 0],
  ]) {
    const overdue = await leg(name);
    await query(
      `update private.ride_reserve_shifts set expires_at=now()-interval '1 second' where id=${key('shift-' + name)} and state='proposed';`,
    );
    const [late, job] = await race(
      [role, `public.driver_decide_shift(${key('shift-' + name)},true)`, driverBehind],
      [null, 'private.ride_reservation_check()', jobBehind],
    );
    assert.ok(job.ok, job.error);
    if (late.ok) assert.equal(late.value, 'expired');
    else assert.equal(late.error, 'offer_unavailable');
    const [expired, ...others] = await shifts(overdue.id);
    assert.deepEqual(
      [others.length, expired.state, expired.outcome, expired.outcomes, expired.accepted],
      [0, 'expired', 'driver_timeout', 1, late.ok ? true : null],
    );
    const returned = await leg(name);
    assert.deepEqual(
      [returned.status, returned.driver, returned.reserve, returned.slot_fits, returned.calendar_fits],
      ['requested', null, 'awaiting_driver', true, true],
    );
    assert.ok(same(returned.pickup, expired.new));
    assert.equal(
      await query(
        `select concat_ws(':',(select count(*) from private.ride_reservation_releases x where x.leg_id='${overdue.id}' and x.reason='schedule_change'),
           (select count(*) from private.ride_declines x where x.leg_id='${overdue.id}' and x.driver_id='${driver}'));`,
      ),
      '1:1',
    );
    first.expiry.push(late.ok ? 'motorista' : 'rotina');
  }

  // (f) A class is an estimate, not a hold: two passengers may choose and book the only van of the same
  // departure at once. The hold is the assignment, and the van takes exactly one of the two legs.
  const departs = await query("select now()+interval '3 hours';");
  const [routeA, routeB] = [
    await query(`select id from private.ride_route_cases where request_key=${key('route-f-a')};`),
    await query(`select id from private.ride_route_cases where request_key=${key('route-f-b')};`),
  ];
  const choose = (route) => `public.ride_choose_class('${route}','van','${departs}')`;
  const request = (route, quote) =>
    `public.ride_consent((public.ride_quote(${key('quote-' + quote)},null,'${departs}',jsonb_build_array(jsonb_build_object(
       'route_id','${route}','origin','Jabaquara','destination','Saúde','payer','passenger')))->>'id')::uuid,true)->>'ride_id'`;
  bothServed(await race(['client_a', choose(routeA)], ['client_b', choose(routeB)]));
  bothServed(await race(['client_a', request(routeA, 'f-a')], ['client_b', request(routeB, 'f-b')]));
  const [vanA, vanB] = [await leg('f-a'), await leg('f-b')];
  assert.deepEqual([vanA.status, vanB.status, vanA.fare === vanB.fare], ['requested', 'requested', true]);
  const assigned = onlyOne(
    await race(
      ['provider_e', `public.ride_accept_offer('${vanA.id}',${key('accept-f-a')})->>'status'`],
      ['provider_e', `public.ride_accept_offer('${vanB.id}',${key('accept-f-b')})->>'status'`],
    ),
    'offer_unavailable',
  );
  assert.equal(assigned.value, 'accepted');
  const vans = [await leg('f-a'), await leg('f-b')].sort((x, y) => (x.driver ? 0 : 1) - (y.driver ? 0 : 1));
  assert.deepEqual(
    vans.map((x) => [x.status, x.driver, x.slot_fits, x.calendar_fits]),
    [
      ['accepted', providerE, true, true],
      ['requested', null, true, true],
    ],
  );
  assert.equal(
    await query(
      `select string_agg(f.class_code||':'||f.modality,',') from private.ride_route_preferences f where f.route_id in ('${routeA}','${routeB}');`,
    ),
    'van:van,van:van',
  );
  first.f = vans[0].id === vanA.id ? 'client_a' : 'client_b';

  console.log(
    `${gates} corridas concorrentes de modalidades verificadas: últimos assentos, cancelamento da partida, remarcação, ` +
      `extensão de bloco, mudança de horário da reserva, última van da classe. Quem chegou primeiro: ${JSON.stringify(first)}`,
  );
} finally {
  await control?.close();
  await run('template1', `drop database ${database};`);
}
