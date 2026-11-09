-- The CRM entry of a platform client carries no name and no phone while the request is not accepted:
-- the provider sees a neutral label. Accepting the request (direct request, or a proposal accepted by
-- the client) writes the client's name and phone. The labor lock is checked again at acceptance, so
-- a client who is the same person as an own entry of the provider (same phone) is counted with it.
begin;
select plan(28);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- Provider C works on Monday and Tuesday; its service is a reparo (no labor lock).
insert into public.availability (provider_id, weekday, start_time, end_time) values
  (tests.uid('provider_c'), 1, '08:00', '18:00'), (tests.uid('provider_c'), 2, '08:00', '18:00');
insert into public.services (id, provider_id, occupation_slug, title, price_min_cents, unit, duration_minutes, active)
values (md5('p105-reparo')::uuid, tests.uid('provider_c'), 't-reparo', 'Reparo de teste 105', 5000, 'hora', 60, true);

-- ================================================================ request: neutral entry
select tests.authenticate_as('client_b');
select lives_ok($$insert into ids select 'req_b', public.book_direct(tests.uid('provider_c'), md5('p105-reparo')::uuid,
                    tests.sp_period(tests.at(40,0, '10:00'), 1))$$,
                'client B asks provider C for a job');
select tests.clear_authentication();
select is((select count(*)::int from public.provider_clients
            where provider_id = tests.uid('provider_c') and client_id = tests.uid('client_b')), 1,
          'the request creates the CRM entry of the provider');

select tests.authenticate_as('provider_c');
select is((select name from public.provider_clients where client_id = tests.uid('client_b')),
          'Cliente da plataforma', 'a request nobody accepted gives the entry a neutral label');
select isnt((select name from public.provider_clients where client_id = tests.uid('client_b')),
            'Cliente B', 'and not the client name');
select is((select phone from public.provider_clients where client_id = tests.uid('client_b')), null,
          'and no phone before the acceptance');
select is((select email from public.provider_clients where client_id = tests.uid('client_b')), null,
          'and no e-mail');
select tests.clear_authentication();

-- ================================================================ direct request: accepted by the provider
select tests.authenticate_as('client_a');
select lives_ok($$insert into ids select 'req_a', public.book_direct(tests.uid('provider_c'), md5('p105-reparo')::uuid,
                    tests.sp_period(tests.at(40,1, '10:00'), 1))$$,
                'client A asks provider C for a job on Tuesday');
select tests.clear_authentication();

select tests.authenticate_as('provider_c');
select is(public.transition_booking((select id from ids where name = 'req_a'), 'accepted')::text, 'accepted',
          'provider C accepts the request');
select is((select name from public.provider_clients where client_id = tests.uid('client_a')), 'Cliente A',
          'after the acceptance the entry carries the client name');
select is((select phone from public.provider_clients where client_id = tests.uid('client_a')), '5511900000001',
          'and the client phone');
select tests.clear_authentication();

-- ================================================================ proposal: accepted by the client at once
insert into public.requests (client_id, occupation_slug, neighborhood_id, description)
values (tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido 105 com orçamento');
insert into public.proposals (request_id, provider_id, price_cents)
select id, tests.uid('provider_d'), 12000 from public.requests where description = 'Pedido 105 com orçamento';
insert into ids select 'prop_105', id from public.proposals where price_cents = 12000;

select tests.authenticate_as('client_a');
select lives_ok($$insert into ids select 'acc_105', public.accept_proposal((select id from ids where name = 'prop_105'),
                    tests.sp_period(tests.at(40,2, '10:00'), 1))$$,
                'client A accepts the proposal of provider D');
select tests.clear_authentication();

select tests.authenticate_as('provider_d');
select is((select name from public.provider_clients where client_id = tests.uid('client_a')), 'Cliente A',
          'accepting a proposal writes the client name to the entry of provider D');
select is((select phone from public.provider_clients where client_id = tests.uid('client_a')), '5511900000001',
          'and the phone');
select tests.clear_authentication();

-- ================================================================ a name the provider changed is kept
select tests.authenticate_as('provider_c');
select lives_ok($$update public.provider_clients set name = 'Clara da casa'
                   where provider_id = auth.uid() and client_id = tests.uid('client_b')$$,
                'provider C renames the entry of client B before the acceptance');
select is(public.transition_booking((select id from ids where name = 'req_b'), 'accepted')::text, 'accepted',
          'provider C accepts the second request');
select is((select name from public.provider_clients where client_id = tests.uid('client_b')), 'Clara da casa',
          'the name the provider chose is kept');
select is((select phone from public.provider_clients where client_id = tests.uid('client_b')), null,
          'client B has no phone on the profile, so none is written');
select tests.clear_authentication();

-- ================================================================ labor lock at acceptance
-- Provider A has two own days with an own entry that carries client A's phone. Client A's request for
-- a third day is the same employer, so the acceptance is refused.
select tests.authenticate_as('provider_a');
insert into public.provider_clients (provider_id, name, phone) values (auth.uid(), 'Dona Teresa', '5511900000001');
insert into ids select 'own_t', id from public.provider_clients where name = 'Dona Teresa';
select lives_ok($$select public.create_own_booking((select id from ids where name = 'own_t'), 't-domestica',
                    tests.sp_period(tests.at(45,0, '09:00')), 10000, null)$$, 'provider A schedules the first own day');
select lives_ok($$select public.create_own_booking((select id from ids where name = 'own_t'), 't-domestica',
                    tests.sp_period(tests.at(45,1, '09:00')), 10000, null)$$, 'and the second own day');
select tests.clear_authentication();

with entry as (
  select private.ensure_provider_client(tests.uid('provider_a'), p) as id
    from public.profiles p where p.id = tests.uid('client_a')
), b as (
  insert into public.bookings (client_id, provider_client_id, provider_id, occupation_slug, period, price_cents, status, origin)
  select tests.uid('client_a'), entry.id, tests.uid('provider_a'), 't-domestica',
         tests.sp_period(tests.at(45,2, '09:00'), 1), 15000, 'requested', 'platform'
    from entry
  returning id
)
insert into ids select 'dup_req', id from b;

select tests.authenticate_as('provider_a');
select throws_ok(format($$select public.transition_booking(%L, 'accepted')$$, (select id from ids where name = 'dup_req')),
                 'P0001', 'labor_lock',
                 'the acceptance is refused: the same person as an own entry with two days is a third day');
select is((select phone from public.provider_clients where provider_id = auth.uid() and client_id = tests.uid('client_a')), null,
          'the contact written for that check is rolled back with the refusal');
select tests.clear_authentication();
select is((select status::text from public.bookings where id = (select id from ids where name = 'dup_req')), 'requested',
          'the request stays requested');

-- ================================================================ API roles cannot run the new functions
select is(has_function_privilege('authenticated', 'private.share_client_contact(uuid, uuid)', 'EXECUTE'), false,
          'authenticated cannot execute the contact share function');
select is(has_function_privilege('anon', 'private.share_client_contact(uuid, uuid)', 'EXECUTE'), false,
          'anon cannot execute the contact share function');
select is(has_function_privilege('authenticated', 'private.share_booking_contact()', 'EXECUTE'), false,
          'authenticated cannot execute the booking contact trigger function');
select is(has_function_privilege('anon', 'private.share_booking_contact()', 'EXECUTE'), false,
          'anon cannot execute the booking contact trigger function');
select is(
  (select count(*)::int
     from pg_proc p
     cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid in ('private.share_client_contact(uuid,uuid)'::regprocedure, 'private.share_booking_contact()'::regprocedure)
      and a.privilege_type = 'EXECUTE'
      and a.grantee = 0),
  0, 'neither function is executable by PUBLIC');

select * from finish();
rollback;
