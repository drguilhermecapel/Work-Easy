-- Two trigger functions cannot be executed by PUBLIC, anon or authenticated (migration 20261110100004),
-- and their triggers still run for the API roles: the booking request notice reaches the provider
-- and the server still sets the date of a proposal.
begin;
select plan(10);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- The effective ACL (a function without an ACL has the default one, which grants PUBLIC)
select is(
  (select count(*)::int
     from pg_proc p
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid in ('private.guard_proposal_timestamps()'::regprocedure, 'private.notify_booking_requested()'::regprocedure)
      and a.privilege_type = 'EXECUTE'
      and a.grantee in (0, (select oid from pg_roles where rolname = 'anon'), (select oid from pg_roles where rolname = 'authenticated'))),
  0, 'neither trigger function is executable by PUBLIC, anon or authenticated');
select is(has_function_privilege('anon', 'private.guard_proposal_timestamps()', 'EXECUTE'), false,
          'anon cannot execute the proposal timestamp trigger function');
select is(has_function_privilege('authenticated', 'private.guard_proposal_timestamps()', 'EXECUTE'), false,
          'authenticated cannot execute the proposal timestamp trigger function');
select is(has_function_privilege('anon', 'private.notify_booking_requested()', 'EXECUTE'), false,
          'anon cannot execute the booking request notice trigger function');
select is(has_function_privilege('authenticated', 'private.notify_booking_requested()', 'EXECUTE'), false,
          'authenticated cannot execute the booking request notice trigger function');

-- The booking request notice still fires for a client's request (the API role, not the test session)
insert into public.availability (provider_id, weekday, start_time, end_time)
values (tests.uid('provider_c'), 1, '08:00', '18:00');
insert into public.services (id, provider_id, occupation_slug, title, price_min_cents, unit, duration_minutes, active)
values (md5('s93-svc')::uuid, tests.uid('provider_c'), 't-reparo', 'Reparo de teste', 5000, 'hora', 60, true);

select tests.authenticate_as('client_a');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), md5('s93-svc')::uuid, tests.sp_period(tests.at(4, 0, '10:00'), 1))$$,
                'a client requests a slot');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications
            where user_id = tests.uid('provider_c') and template = 'agendamento_solicitado'), 1,
          'the booking request notice still reaches the provider');

-- The proposal timestamp trigger still runs for a provider: a backdated date is replaced by the server's
insert into ids values ('r', md5('s93-r')::uuid);
insert into public.requests (id, client_id, occupation_slug, neighborhood_id, description)
values ((select id from ids where name = 'r'), tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido de teste 93');

select tests.authenticate_as('provider_d');
select lives_ok($$insert into public.proposals (request_id, price_cents, created_at)
                  values ((select id from ids where name = 'r'), 9000, now() - interval '40 days')$$,
                'a provider sends a proposal with a backdated date');
select tests.clear_authentication();
select ok((select created_at from public.proposals where request_id = (select id from ids where name = 'r')) > now() - interval '1 minute',
          'the server sets the date of the proposal, through the trigger');

select * from finish();
rollback;
