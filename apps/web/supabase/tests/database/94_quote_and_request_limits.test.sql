-- Limits on quotes (migration 20261110100005) and on data requests and consents (migration 20261110100006):
-- an item description is at most 500 characters, a provider has at most 30 quotes in draft or sent
-- per São Paulo day (a multi-row insert cannot pass it), and the same consent is recorded once.
begin;
select plan(9);
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

select * from finish();
rollback;
