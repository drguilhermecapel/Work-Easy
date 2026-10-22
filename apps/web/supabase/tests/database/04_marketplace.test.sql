-- Marketplace: requests and proposals RLS, matching by occupation and neighborhood,
-- proposal limit, closed requests, accept_proposal.
begin;
select plan(94);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
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
                 '23514', 'new row for relation "requests" violates check constraint "requests_description_check"',
                 'description needs at least 10 characters');
select throws_ok(format($$insert into public.requests (client_id, occupation_slug, neighborhood_id, description)
                          values (%L, 't-reparo', %L, 'Pedido em nome de outra pessoa')$$,
                        tests.uid('client_b'), tests.neighborhood('t-bairro-1')),
                 '42501', null, 'client cannot create a request for someone else');
select is((select status::text from public.requests where id = (select id from ids where name = 'req1')), 'open',
          'new request is open');
select ok((select expires_at between now() + interval '7 days' - interval '1 second' and now() + interval '7 days'
             from public.requests where id = (select id from ids where name = 'req1')),
          'a request expires in 7 days by default');
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
select is((select array_agg(p.parameter_name::text order by p.ordinal_position) from information_schema.parameters p
            where p.specific_schema = 'public' and p.specific_name like 'open_requests_for_me%' and p.parameter_mode = 'OUT'),
          array['id', 'occupation_slug', 'neighborhood_id', 'neighborhood_name', 'description', 'preferred_dates',
                'urgent', 'expires_at', 'created_at', 'proposal_count', 'my_proposal_id', 'my_proposal_status'],
          'open_requests_for_me returns exactly these columns: no client identity, no contact');

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
-- A proposal shares the provider row (name), never the profile: the phone only comes with a
-- booking the provider accepted. Otherwise a free request would collect phones off-platform.
select is((select count(*)::int from public.profiles
            where id in (tests.uid('provider_a'), tests.uid('provider_c'), tests.uid('provider_e'))), 0,
          'client A does not read the profile (phone) of providers who only proposed');
select tests.authenticate_as('provider_a');
select is((select count(*)::int from public.profiles where id = tests.uid('client_a')), 0,
          'a provider who proposed does not read the profile of the client either');
select tests.authenticate_as('client_a');

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
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, gen_random_uuid(), tests.sp_period(tests.at(30, 0, '10:00'))),
                 'P0001', 'not_allowed', 'an unknown proposal id is not allowed');
select tests.clear_authentication();
insert into ids select 'prop_a', id from public.proposals where provider_id = tests.uid('provider_a');

select tests.authenticate_as('client_b');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'prop_a'),
                        tests.sp_period(tests.at(30, 0, '10:00'))),
                 'P0001', 'not_allowed', 'only the request owner accepts a proposal');

select tests.authenticate_as('client_a');
select lives_ok(format($$insert into ids select 'booking', public.accept_proposal(%L, %L)$$,
                       (select id from ids where name = 'prop_a'), tests.sp_period(tests.at(30, 0, '10:00'))),
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
                        tests.sp_period(tests.at(30, 1, '10:00'))),
                 'P0001', 'request_not_open', 'a matched request cannot accept again');

select tests.clear_authentication();
select is((select origin::text from public.provider_clients
            where provider_id = tests.uid('provider_a') and client_id = tests.uid('client_a')), 'platform',
          'the client enters the provider CRM with origin platform');

-- ---------------------------------------------------------------- proposals: who writes what
select tests.authenticate_as('provider_a');
select throws_ok($$update public.proposals set status = 'withdrawn' where id = (select id from ids where name = 'prop_a')$$,
                 'P0001', 'invalid_transition', 'an accepted proposal cannot be withdrawn');
select tests.authenticate_as('client_a');
select throws_ok($$insert into public.proposals (request_id, price_cents)
                   values ((select id from ids where name = 'req_med'), 1)$$,
                 'P0001', 'not_allowed', 'a client cannot send a proposal');
update public.proposals set status = 'accepted', price_cents = 1;
select tests.clear_authentication();
select is((select count(*)::int from public.proposals where price_cents = 1), 0, 'a client cannot edit proposals');

-- ---------------------------------------------------------------- request lifetime
select tests.authenticate_as('client_b');
insert into public.requests (occupation_slug, neighborhood_id, description, expires_at)
values ('t-reparo', tests.neighborhood('t-bairro-1'), 'Pedido com prazo muito longo', now() + interval '90 days');
select tests.clear_authentication();
select ok((select expires_at <= now() + interval '30 days' from public.requests where description = 'Pedido com prazo muito longo'),
          'a request lasts at most 30 days');
select ok((select count(*) from public.requests where description = 'Pedido com prazo muito longo') = 1, 'the long request exists');

-- ---------------------------------------------------------------- who receives requests
insert into public.requests (client_id, occupation_slug, neighborhood_id, description)
values (tests.uid('client_b'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Janela emperrada no quarto');
insert into ids select 'req_m', id from public.requests where description = 'Janela emperrada no quarto';
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.open_requests_for_me() where id = (select id from ids where name = 'req_m')), 1,
          'baseline: an approved provider with the approved occupation gets the request');

select tests.clear_authentication();
update public.provider_occupations set approved = false where provider_id = tests.uid('provider_d');
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.open_requests_for_me()), 0, 'an occupation not approved gets no request');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req_m'), 9000)$$,
                 'P0001', 'not_allowed', 'an occupation not approved cannot propose');

select tests.clear_authentication();
update public.provider_occupations set approved = true, registry_status = 'rejected' where provider_id = tests.uid('provider_d');
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.open_requests_for_me()), 0, 'a rejected registry gets no request');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'req_m'), 9000)$$,
                 'P0001', 'not_allowed', 'a rejected registry cannot propose');

select tests.clear_authentication();
update public.provider_occupations set registry_status = 'not_required' where provider_id = tests.uid('provider_d');
update public.providers set status = 'draft' where id = tests.uid('provider_d');
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.open_requests_for_me()), 0, 'a draft provider gets no request');

select tests.clear_authentication();
update public.providers set status = 'approved', accepts_platform_requests = false where id = tests.uid('provider_d');
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.open_requests_for_me()), 0, 'a provider that does not accept platform requests gets none');

select tests.clear_authentication();
update public.providers set accepts_platform_requests = true where id = tests.uid('provider_d');
update public.requests set expires_at = now() - interval '1 second' where id = (select id from ids where name = 'req_m');
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.open_requests_for_me() where id = (select id from ids where name = 'req_m')), 0,
          'an expired request is not listed even before the scheduler closes it');

-- ---------------------------------------------------------------- the scheduler closes stale requests
select tests.clear_authentication();
select private.expire_stale();
select is((select status::text from public.requests where id = (select id from ids where name = 'req_m')), 'closed',
          'expire_stale closes requests past their date');
select is((select status::text from public.requests where id = (select id from ids where name = 'req1')), 'matched',
          'expire_stale leaves matched requests alone');
select results_eq($$select jobname::text from cron.job where jobname like 'workeasy-%' order by 1$$,
                  array['workeasy-dispatch-notifications', 'workeasy-expire-stale'], 'the scheduler jobs exist');

-- ---------------------------------------------------------------- accept_proposal edge cases
insert into public.requests (client_id, occupation_slug, neighborhood_id, description) values
  (tests.uid('client_b'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pia solta na lavanderia'),
  (tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Segundo pedido da mesma cliente');
insert into ids select 'r3', id from public.requests where description = 'Pia solta na lavanderia';
insert into ids select 'r4', id from public.requests where description = 'Segundo pedido da mesma cliente';
insert into public.proposals (request_id, provider_id, price_cents) values
  ((select id from ids where name = 'r3'), tests.uid('provider_a'), 15000),
  ((select id from ids where name = 'r3'), tests.uid('provider_c'), 14000),
  ((select id from ids where name = 'r3'), tests.uid('provider_e'), 13000),
  ((select id from ids where name = 'r4'), tests.uid('provider_a'), 16000);
update public.proposals set status = 'withdrawn' where provider_id = tests.uid('provider_c') and request_id = (select id from ids where name = 'r3');
update public.proposals set status = 'declined' where provider_id = tests.uid('provider_e') and request_id = (select id from ids where name = 'r3');
insert into ids select 'p_r3_a', id from public.proposals where provider_id = tests.uid('provider_a') and request_id = (select id from ids where name = 'r3');
insert into ids select 'p_r3_c', id from public.proposals where provider_id = tests.uid('provider_c') and request_id = (select id from ids where name = 'r3');
insert into ids select 'p_r3_e', id from public.proposals where provider_id = tests.uid('provider_e') and request_id = (select id from ids where name = 'r3');
insert into ids select 'p_r4_a', id from public.proposals where provider_id = tests.uid('provider_a') and request_id = (select id from ids where name = 'r4');

select tests.authenticate_as('client_b');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'p_r3_c'), tests.sp_period(tests.at(30, 2, '10:00'))),
                 'P0001', 'invalid_transition', 'a withdrawn proposal cannot be accepted');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'p_r3_e'), tests.sp_period(tests.at(30, 2, '10:00'))),
                 'P0001', 'invalid_transition', 'a declined proposal cannot be accepted');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'p_r3_a'),
                        tstzrange(now() - interval '2 hours', now() - interval '1 hour')),
                 'P0001', 'slot_unavailable', 'a past period is refused');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'p_r3_a'),
                        tstzrange(now() + interval '1 day', now() + interval '4 days')),
                 'P0001', 'slot_unavailable', 'a period longer than 24 hours is refused');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'p_r3_a'),
                        tstzrange(now() + interval '3 years', now() + interval '3 years 2 hours')),
                 'P0001', 'slot_unavailable', 'a period more than two years away is refused');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'p_r3_a'), 'empty'::tstzrange),
                 'P0001', 'slot_unavailable', 'an empty period is refused');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'p_r3_a'), tests.sp_period(tests.at(30, 0, '10:30'))),
                 'P0001', 'slot_unavailable', 'a slot the provider already has is refused');
select is((select status::text from public.requests where id = (select id from ids where name = 'r3')), 'open',
          'a refused acceptance leaves the request open');
select tests.clear_authentication();
update public.requests set expires_at = now() - interval '1 second' where id = (select id from ids where name = 'r3');
select tests.authenticate_as('client_b');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'p_r3_a'), tests.sp_period(tests.at(30, 3, '10:00'))),
                 'P0001', 'request_not_open', 'an expired request cannot be accepted before the scheduler closes it');

select tests.authenticate_as('client_a');
select lives_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'p_r4_a'), tests.sp_period(tests.at(30, 4, '10:00'))),
                'the same client accepts a second proposal of the same provider');
select tests.clear_authentication();
select is((select count(*)::int from public.provider_clients
            where provider_id = tests.uid('provider_a') and client_id = tests.uid('client_a')), 1,
          'the provider CRM keeps one entry per platform client');
select is((select count(distinct provider_client_id)::int from public.bookings
            where provider_id = tests.uid('provider_a') and client_id = tests.uid('client_a')), 1,
          'both jobs point to that entry');

-- ---------------------------------------------------------------- admin_set_setting changes the rule
insert into public.requests (client_id, occupation_slug, neighborhood_id, description)
values (tests.uid('client_b'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido para o limite de propostas');
insert into ids select 'r5', id from public.requests where description = 'Pedido para o limite de propostas';
select tests.authenticate_as('admin');
select public.admin_set_setting('proposal_limit', '1');
select tests.authenticate_as('provider_a');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'r5'), 9000)$$,
                'the first proposal fits the new limit');
select tests.authenticate_as('provider_c');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from ids where name = 'r5'), 8000)$$,
                 'P0001', 'proposal_limit', 'the limit comes from platform_settings at run time');

-- ---------------------------------------------------------------- assist_usage / take_assist_quota
select tests.clear_authentication();
select has_table('public', 'assist_usage', 'the assistant has its own usage counter table');
select col_is_pk('public', 'assist_usage', array['user_id', 'window_start'], 'the counter is keyed by user and hour window');
select is((select c.relrowsecurity from pg_class c where c.oid = 'public.assist_usage'::regclass), true,
          'RLS is on for assist_usage');
select is((select count(*)::int from pg_policy where polrelid = 'public.assist_usage'::regclass), 0,
          'and there is no policy: users never touch the counter');

select tests.authenticate_as('client_a');
select throws_ok($$select * from public.assist_usage$$, '42501', null, 'a user cannot read the counter table');
select throws_ok(format($$insert into public.assist_usage (user_id, window_start, count) values (%L, date_trunc('hour', now()), 0)$$,
                        tests.uid('client_a')),
                 '42501', null, 'nor write to it (resetting the own quota)');
select throws_ok(format($$select public.take_assist_quota(%L, 10)$$, tests.uid('client_a')), '42501', null,
                 'a user cannot call take_assist_quota');
select tests.authenticate_anon();
select throws_ok(format($$select public.take_assist_quota(%L, 10)$$, tests.uid('client_a')), '42501', null,
                 'anon cannot call take_assist_quota');

select tests.authenticate_service();
select is(public.take_assist_quota(tests.uid('client_a'), 2), true, 'the first unit of the hour is granted');
select is(public.take_assist_quota(tests.uid('client_a'), 2), true, 'and the second');
select is(public.take_assist_quota(tests.uid('client_a'), 2), false, 'the third is refused at limit 2');
select tests.clear_authentication();
select is((select count from public.assist_usage where user_id = tests.uid('client_a')
              and window_start = date_trunc('hour', now() at time zone 'UTC') at time zone 'UTC'), 2,
          'a refused call does not consume anything: the counter stays at the limit');
select tests.authenticate_service();
select is(public.take_assist_quota(tests.uid('client_a'), 3), true, 'raising the limit grants again in the same hour');
select is(public.take_assist_quota(tests.uid('client_b'), 2), true, 'another user has an independent counter');
select is((select count(*)::int from generate_series(1, 10) g where public.take_assist_quota(tests.uid('provider_a'), 3)), 3,
          'ten calls at limit 3 grant exactly three');
select is(public.take_assist_quota(tests.uid('client_b'), 0), false, 'a limit of 0 turns the assistant off');
select is(public.take_assist_quota(null, 5), false, 'a null user is refused');
select tests.clear_authentication();
select is((select count(*)::int from public.assist_usage where user_id = tests.uid('client_b')), 1,
          'a limit of 0 or below writes no row');

insert into public.assist_usage (user_id, window_start, count)
values (tests.uid('provider_c'), date_trunc('hour', now() at time zone 'UTC') at time zone 'UTC' - interval '1 hour', 5),
       (tests.uid('provider_c'), date_trunc('hour', now() at time zone 'UTC') at time zone 'UTC' - interval '2 days', 5);
select tests.authenticate_service();
select is(public.take_assist_quota(tests.uid('provider_c'), 5), true, 'a full previous hour does not count against the current one');
select tests.clear_authentication();
select private.expire_stale();
select is((select count(*)::int from public.assist_usage where user_id = tests.uid('provider_c')), 2,
          'expire_stale drops counters older than a day and keeps the recent windows');

select * from finish();
rollback;
