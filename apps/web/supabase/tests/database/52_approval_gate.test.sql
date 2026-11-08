-- Approval gate on own jobs and on acceptance (proposals and requested bookings).
-- The suspension below is made with session_replication_role = replica so that the cascade of
-- 20261109000005 does not run: this file tests the gate on its own.
begin;
select plan(7);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- A provider in review, with an occupation approved on file, cannot schedule an own job.
select tests.create_user('review_g', 'Em análise', '5511900000078');
insert into public.providers (id, display_name, slug, status, base_neighborhood_id)
values (tests.uid('review_g'), 'Em Análise Gate', 't-em-analise-g', 'pending_review', tests.neighborhood('t-bairro-1'));
insert into public.provider_occupations (provider_id, occupation_slug, is_primary, registry_number, registry_uf, approved)
values (tests.uid('review_g'), 't-reparo', true, null, null, true);

select tests.authenticate_as('review_g');
insert into public.provider_clients (provider_id, name) values (auth.uid(), 'Cliente de terceiros');
select throws_ok($$select public.create_own_booking((select id from public.provider_clients where name = 'Cliente de terceiros'),
                    't-reparo', tests.sp_period('2031-02-03 10:00', 1), 9000, null)$$,
                 'P0001', 'not_allowed', 'a provider in review cannot schedule an own job');

select tests.authenticate_as('provider_c');
insert into public.provider_clients (provider_id, name) values (auth.uid(), 'Cliente própria');
select lives_ok($$select public.create_own_booking((select id from public.provider_clients where name = 'Cliente própria'),
                    't-reparo', tests.sp_period('2031-02-04 10:00', 1), 9000, null)$$,
                'an approved provider schedules an own job');

-- Two requests, a proposal on each; then provider_d is suspended without the cascade.
select tests.clear_authentication();
insert into ids values ('req_c', md5('s52-req-c')::uuid), ('req_d', md5('s52-req-d')::uuid);
insert into public.requests (id, client_id, occupation_slug, neighborhood_id, description) values
  ((select id from ids where name = 'req_c'), tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido para aceite do prestador ativo'),
  ((select id from ids where name = 'req_d'), tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido para aceite do prestador suspenso');

select tests.authenticate_as('provider_c');
insert into public.proposals (id, request_id, price_cents) values (md5('s52-prop-c')::uuid, (select id from ids where name = 'req_c'), 9000);
select tests.authenticate_as('provider_d');
insert into public.proposals (id, request_id, price_cents) values (md5('s52-prop-d')::uuid, (select id from ids where name = 'req_d'), 9000);

select tests.clear_authentication();
set session_replication_role = replica;
update public.providers set status = 'suspended' where id = tests.uid('provider_d');
set session_replication_role = origin;

select tests.authenticate_as('client_a');
select lives_ok($$select public.accept_proposal(md5('s52-prop-c')::uuid, tests.sp_period(tests.at(45, 0, '10:00'), 1))$$,
                'the client accepts an approved provider');
select throws_ok($$select public.accept_proposal(md5('s52-prop-d')::uuid, tests.sp_period(tests.at(45, 0, '11:00'), 1))$$,
                 'P0001', 'not_allowed', 'a suspended provider cannot be accepted, even with a sent proposal');

-- The same for a requested booking: the provider accepts it only while approved.
select tests.clear_authentication();
insert into ids values
  ('book_c', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(46, 0, '10:00'), 1), 'requested')),
  ('book_d', tests.make_booking('provider_d', 'client_a', 't-reparo', tests.sp_period(tests.at(46, 0, '11:00'), 1), 'requested'));

select tests.authenticate_as('provider_c');
select lives_ok($$select public.transition_booking((select id from ids where name = 'book_c'), 'accepted')$$,
                'an approved provider accepts a requested booking');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.transition_booking((select id from ids where name = 'book_d'), 'accepted')$$,
                 'P0001', 'not_allowed', 'a suspended provider cannot accept a requested booking');

select * from finish();
rollback;
