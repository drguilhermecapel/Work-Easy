-- Limits on quotes (migration 20261110100005) and on data requests and consents (migration 20261110100006):
-- an item description is at most 500 characters, a provider has at most 30 quotes in draft or sent
-- per São Paulo day (a multi-row insert cannot pass it), a user has at most 3 pending data requests
-- per kind, and a repeated consent decision adds no row.
begin;
select plan(23);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ quote items
select tests.authenticate_as('provider_e');
select lives_ok($$insert into public.quotes (title, items) values ('Descrição no limite',
                  jsonb_build_array(jsonb_build_object('description', repeat('a', 500), 'quantity', 1, 'unit_price_cents', 100)))$$,
                'an item description of 500 characters is accepted');
select throws_ok($$insert into public.quotes (title, items) values ('Descrição longa',
                   jsonb_build_array(jsonb_build_object('description', repeat('a', 501), 'quantity', 1, 'unit_price_cents', 100)))$$,
                 'P0001', 'quote_items_invalid', 'an item description of 501 characters is refused');

-- ================================================================ quotes per day
select lives_ok($$insert into public.quotes (title, items) select 'Orçamento ' || n, '[]' from generate_series(1, 29) n$$,
                'a provider can create 29 more quotes the same day, 30 in all');
select throws_ok($$insert into public.quotes (title, items) values ('Orçamento 31', '[]')$$,
                 'P0001', 'quote_daily_limit', 'the 31st quote of the day is refused');
select is((select count(*)::int from public.quotes where provider_id = auth.uid()), 30,
          'the refused quote was not stored');

-- One statement cannot pass the limit by inserting many rows: a row-by-row check would miss them
select tests.authenticate_as('provider_d');
select throws_ok($$insert into public.quotes (title, items) select 'Lote ' || n, '[]' from generate_series(1, 31) n$$,
                 'P0001', 'quote_daily_limit', 'a single insert of 31 quotes is refused as a whole');
select is((select count(*)::int from public.quotes where provider_id = auth.uid()), 0,
          'and none of the 31 was stored');

-- Quotes of earlier days do not count against today
select tests.clear_authentication();
insert into public.quotes (provider_id, title, items, created_at)
select tests.uid('provider_c'), 'Antigo ' || n, '[]', now() - interval '2 days' from generate_series(1, 40) n;
select tests.authenticate_as('provider_c');
select lives_ok($$insert into public.quotes (title, items) values ('Hoje', '[]')$$,
                'quotes from two days ago do not block today');
select tests.clear_authentication();

-- ================================================================ data requests
-- At most three pending requests per kind; the limit is per kind, and an answered one does not count
select tests.authenticate_as('client_b');
select lives_ok($$insert into public.data_requests (kind) values ('export'), ('export'), ('export')$$,
                'a client can have three pending export requests');
select throws_ok($$insert into public.data_requests (kind) values ('export')$$,
                 'P0001', 'data_request_limit', 'a fourth pending export request is refused');
select lives_ok($$insert into public.data_requests (kind) values ('delete')$$,
                'the limit is per kind: a deletion request is still accepted');
select tests.clear_authentication();
update public.data_requests set status = 'completed', completed_at = now()
 where id = (select id from public.data_requests where user_id = tests.uid('client_b') and kind = 'export' and status = 'pending' limit 1);
select tests.authenticate_as('client_b');
select lives_ok($$insert into public.data_requests (kind) values ('export')$$,
                'an answered export request no longer counts against the limit');
select tests.clear_authentication();

-- Four pending requests in one insert are refused as a whole
select tests.authenticate_as('client_a');
select throws_ok($$insert into public.data_requests (kind) values ('delete'), ('delete'), ('delete'), ('delete')$$,
                 'P0001', 'data_request_limit', 'four pending deletion requests in one insert are refused');
select tests.clear_authentication();
select is((select count(*)::int from public.data_requests where user_id = tests.uid('client_a')), 0,
          'and none of them was stored');

-- ================================================================ consents
-- The history of the purpose has one decision in the past (a dated row, not a call of this transaction).
-- Calls of one transaction share now(), so each decision below is the only one at its time.
insert into public.consents (user_id, purpose, version, granted, at)
values (tests.uid('client_a'), 'privacy', 'v1', true, now() - interval '3 hours');

select tests.authenticate_as('client_a');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('privacy', 'v1', true)$$,
                'the same decision again is accepted without an error');
select is((select count(*)::int from public.consents where user_id = auth.uid() and purpose = 'privacy'), 1,
          'and it adds no row');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('privacy', 'v1', false)$$,
                'a withdrawal of the same version is recorded');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('privacy', 'v1', false)$$,
                'the same withdrawal again is accepted without an error');
select is((select count(*)::int from public.consents where user_id = auth.uid() and purpose = 'privacy'), 2,
          'the withdrawal is one new row, its repeat is none');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('privacy', 'v2', true)$$,
                'a new version of the same purpose is a new decision');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('terms', 'v1', true)$$,
                'another purpose is recorded on its own');
select tests.clear_authentication();
select is((select count(*)::int from public.consents where user_id = tests.uid('client_a') and purpose = 'privacy'), 3,
          'the privacy history holds the three decisions that changed');

select * from finish();
rollback;
