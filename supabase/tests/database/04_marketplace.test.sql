-- Marketplace: requests and proposals RLS, matching by occupation and neighborhood,
-- proposal limit, closed requests, accept_proposal.
begin;
select plan(40);
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon;

-- ---------------------------------------------------------------- requests
select tests.authenticate_as('client_a');
select lives_ok(format($$insert into public.requests (occupation_slug, neighborhood_id, description)
                         values ('t-reparo', %L, 'Torneira pingando na cozinha')$$, tests.neighborhood('t-bairro-1')),
                'client creates a request');
insert into ids select 'req1', id from public.requests where description = 'Torneira pingando na cozinha';
insert into public.requests (occupation_slug, neighborhood_id, description)
values ('t-reparo', tests.neighborhood('t-bairro-2'), 'Chuveiro queimado no bairro dois'),
       ('t-medico', tests.neighborhood('t-bairro-1'), 'Consulta para o bairro um'),
       ('t-reparo', tests.neighborhood('t-bairro-1'), 'Pedido que será cancelado');
insert into ids select 'req_n2', id from public.requests where description = 'Chuveiro queimado no bairro dois';
insert into ids select 'req_med', id from public.requests where description = 'Consulta para o bairro um';
insert into ids select 'req_cancel', id from public.requests where description = 'Pedido que será cancelado';

select throws_ok(format($$insert into public.requests (occupation_slug, neighborhood_id, description)
                          values ('t-reparo', %L, 'curto')$$, tests.neighborhood('t-bairro-1')),
                 '23514', null, 'description needs at least 10 characters');
select throws_ok(format($$insert into public.requests (client_id, occupation_slug, neighborhood_id, description)
                          values (%L, 't-reparo', %L, 'Pedido em nome de outra pessoa')$$,
                        tests.uid('client_b'), tests.neighborhood('t-bairro-1')),
                 '42501', null, 'client cannot create a request for someone else');
select is((select status::text from public.requests where id = (select id from ids where name = 'req1')), 'open',
          'new request is open');
select throws_ok($$update public.requests set status = 'matched' where client_id = auth.uid()$$, 'P0001',
                 'invalid_transition', 'client cannot mark a request as matched');
select throws_ok($$update public.requests set occupation_slug = 't-medico' where client_id = auth.uid()$$, 'P0001',
                 'not_allowed', 'client cannot change the occupation of a request');
select lives_ok($$update public.requests set status = 'canceled'
                   where id = (select id from ids where name = 'req_cancel')$$, 'client cancels an open request');
select is((select count(*)::int from public.requests), 4, 'client A reads the own requests');

select tests.authenticate_as('client_b');
select is((select count(*)::int from public.requests), 0, 'client B cannot read requests of client A');

select tests.authenticate_as('provider_a');
select is((select count(*)::int from public.requests), 0, 'providers cannot read the requests table');
select is((select count(*)::int from public.open_requests_for_me()), 1,
          'open_requests_for_me lists only matching occupation and neighborhood');
select is((select id from public.open_requests_for_me()), (select id from ids where name = 'req1'),
          'provider A sees the t-reparo request in bairro 1');

select tests.authenticate_as('provider_b');
select is((select count(*)::int from public.open_requests_for_me()), 0,
          'provider B (other occupation and neighborhood) sees no request');

select tests.authenticate_as('admin');
select is((select count(*)::int from public.requests), 4, 'admin reads every request');

select tests.clear_authentication();
select ok(pg_get_function_result('public.open_requests_for_me()'::regprocedure) !~ '(client_id|phone|email)',
          'open_requests_for_me does not expose client identity or contact');

-- ---------------------------------------------------------------- proposals
select tests.authenticate_as('provider_a');
select lives_ok($$insert into public.proposals (request_id, price_cents, message)
                  values ((select id from ids where name = 'req1'), 12000, 'Posso ir amanhã')$$, 'provider A proposes');
select throws_ok($$update public.proposals set status = 'accepted' where provider_id = auth.uid()$$, 'P0001',
                 'invalid_transition', 'provider cannot accept the own proposal');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req_n2'), 9000)$$,
                 'P0001', 'not_allowed', 'provider cannot propose outside the served neighborhoods');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req_med'), 9000)$$,
                 'P0001', 'not_allowed', 'provider cannot propose for an occupation not offered');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req_cancel'), 9000)$$,
                 'P0001', 'request_not_open', 'no proposals on a canceled request');
select throws_ok(format($$insert into public.proposals (request_id, provider_id, price_cents)
                          values ((select id from ids where name = 'req1'), %L, 9000)$$, tests.uid('provider_c')),
                 '42501', null, 'provider A cannot propose in the name of provider C');

select tests.authenticate_as('provider_c');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req1'), 11000)$$,
                'second proposal');
select tests.authenticate_as('provider_d');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req1'), 10000)$$,
                'third proposal');
select tests.authenticate_as('provider_e');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req1'), 9000)$$,
                 'P0001', 'proposal_limit', 'fourth proposal exceeds proposal_limit');
select tests.authenticate_as('provider_d');
select lives_ok($$update public.proposals set status = 'withdrawn' where provider_id = auth.uid()$$, 'provider D withdraws');
select tests.authenticate_as('provider_e');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req1'), 9000)$$,
                'a withdrawn proposal frees a slot');
select is((select count(*)::int from public.proposals), 1, 'provider E reads only the own proposals');

select tests.authenticate_as('provider_b');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req1'), 9000)$$,
                 'P0001', 'not_allowed', 'provider without the occupation cannot propose');

select tests.authenticate_as('client_b');
select is((select count(*)::int from public.proposals), 0, 'client B cannot read proposals of client A');

select tests.authenticate_as('client_a');
select is((select count(*)::int from public.proposals), 4, 'client A reads the proposals received');
select is((select count(*)::int from public.providers), 4, 'client A reads the providers who proposed');

-- expired request
select tests.clear_authentication();
update public.requests set expires_at = now() - interval '1 minute' where id = (select id from ids where name = 'req_n2');
update public.provider_neighborhoods set neighborhood_id = tests.neighborhood('t-bairro-2')
 where provider_id = tests.uid('provider_c');
select tests.authenticate_as('provider_c');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req_n2'), 9000)$$,
                 'P0001', 'request_not_open', 'no proposals on an expired request');

-- ---------------------------------------------------------------- accept_proposal
select tests.authenticate_as('client_b');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$,
                        (select p.id from public.proposals p where false), tests.sp_period('2030-02-04 10:00')),
                 'P0001', 'not_allowed', 'unknown proposal is not allowed');
select tests.clear_authentication();
insert into ids select 'prop_a', id from public.proposals where provider_id = tests.uid('provider_a');

select tests.authenticate_as('client_b');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'prop_a'),
                        tests.sp_period('2030-02-04 10:00')),
                 'P0001', 'not_allowed', 'only the request owner accepts a proposal');

select tests.authenticate_as('client_a');
select lives_ok(format($$insert into ids select 'booking', public.accept_proposal(%L, %L)$$,
                       (select id from ids where name = 'prop_a'), tests.sp_period('2030-02-04 10:00')),
                'client A accepts the proposal of provider A');
select is((select status::text || '/' || origin::text || '/' || price_cents from public.bookings
            where id = (select id from ids where name = 'booking')), 'accepted/platform/12000',
          'accepting creates an accepted platform booking with the proposal price');
select is((select status::text from public.requests where id = (select id from ids where name = 'req1')), 'matched',
          'the request is matched');
select results_eq($$select status::text from public.proposals where request_id = (select id from ids where name = 'req1')
                    and provider_id <> tests.uid('provider_a') order by status$$,
                  array['declined', 'declined', 'withdrawn'],
                  'other sent proposals are declined');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'prop_a'),
                        tests.sp_period('2030-02-05 10:00')),
                 'P0001', 'request_not_open', 'a matched request cannot accept again');

select tests.clear_authentication();
select is((select origin::text from public.provider_clients
            where provider_id = tests.uid('provider_a') and client_id = tests.uid('client_a')), 'platform',
          'the client enters the provider CRM with origin platform');

select * from finish();
rollback;
