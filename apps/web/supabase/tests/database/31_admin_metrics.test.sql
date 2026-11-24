-- admin_metrics, the view behind the administration panel. The old rows and columns stay; the
-- operating funnel (rolling windows, payment amounts, requests that received a proposal, Pro
-- subscriptions by status, free-plan providers at the proposal limit) comes after them; and the
-- whole view still answers only to administrators.
begin;
select plan(46);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- The funnel reads this setting: start from a known value.
insert into public.platform_settings (key, value) values ('free_proposals_per_month', '2')
on conflict (key) do update set value = excluded.value;

-- Counts are compared with a snapshot taken before this file adds its rows, so rows that already
-- sit in the shared database do not matter.
create temp table base (entity text, status text, this_week bigint, this_month bigint, total bigint,
                        last_7_days bigint, last_30_days bigint, amount_cents bigint, month_amount_cents bigint);
create temp table probe (k text primary key, v bigint);
grant all on base, probe to authenticated;

-- How much a column of one row of the view moved since the snapshot.
create function pg_temp.moved(p_entity text, p_status text, p_column text)
returns numeric
language plpgsql
as $$
declare
  v_now numeric;
  v_before numeric;
begin
  execute format('select coalesce(sum(%I), 0) from public.admin_metrics where entity = %L and status = %L',
                 p_column, p_entity, p_status) into v_now;
  execute format('select coalesce(sum(%I), 0) from base where entity = %L and status = %L',
                 p_column, p_entity, p_status) into v_before;
  return v_now - v_before;
end;
$$;

select tests.authenticate_as('admin');
insert into base
select entity, status, this_week, this_month, total, last_7_days, last_30_days, amount_cents, month_amount_cents
  from public.admin_metrics;
select tests.clear_authentication();

-- ================================================================ data
-- A provider waiting for review.
select tests.create_user('provider_f', 'Prestador F');
update public.profiles set role = 'provider' where id = tests.uid('provider_f');
insert into public.providers (id, display_name, slug, status)
values (tests.uid('provider_f'), 'Fabio Teste', 't-fabio', 'pending_review');

-- Four requests: two now, one 10 days old, one 40 days old.
insert into public.requests (client_id, occupation_slug, neighborhood_id, description)
select tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido do funil numero ' || n
  from generate_series(1, 4) n;
create temp table reqs as
  select row_number() over (order by description) as n, id from public.requests where description like 'Pedido do funil numero %';

-- Proposals: the first three requests receive some (the fourth none). Provider A is on Pro; C and D are free.
insert into public.proposals (request_id, provider_id, price_cents) values
  ((select id from reqs where n = 1), tests.uid('provider_c'), 10000),
  ((select id from reqs where n = 2), tests.uid('provider_c'), 10000),
  ((select id from reqs where n = 1), tests.uid('provider_a'), 12000),
  ((select id from reqs where n = 2), tests.uid('provider_a'), 12000),
  ((select id from reqs where n = 3), tests.uid('provider_d'), 9000);
update public.requests set created_at = now() - interval '40 days' where id = (select id from reqs where n = 3);
update public.requests set created_at = now() - interval '10 days' where id = (select id from reqs where n = 4);
update public.providers set plan = 'pro' where id = tests.uid('provider_a');

insert into public.subscriptions (provider_id, plan, status) values
  (tests.uid('provider_a'), 'pro', 'active'),
  (tests.uid('provider_b'), 'pro', 'trialing'),
  (tests.uid('provider_c'), 'pro', 'past_due'),
  (tests.uid('provider_d'), 'pro', 'pending'),
  (tests.uid('provider_e'), 'pro', 'canceled');

-- Payments of provider C; the released one is 40 days old.
insert into public.payments (provider_id, payer_id, amount_cents, status) values
  (tests.uid('provider_c'), tests.uid('client_a'), 12000, 'received'),
  (tests.uid('provider_c'), tests.uid('client_a'), 6000, 'held'),
  (tests.uid('provider_c'), tests.uid('client_a'), 8000, 'released'),
  (tests.uid('provider_c'), tests.uid('client_a'), 5000, 'pending'),
  (tests.uid('provider_c'), tests.uid('client_a'), 3000, 'confirmed'),
  (tests.uid('provider_c'), tests.uid('client_a'), 4000, 'refunded');
update public.payments set created_at = now() - interval '40 days' where status = 'released' and amount_cents = 8000;

-- One of the original entities, to see it still counted.
select tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2031-04-01 09:00'), 'accepted');

-- ================================================================ the administrator
select tests.authenticate_as('admin');

select is((select array_agg(a.attname::text order by a.attnum)
             from pg_attribute a
            where a.attrelid = 'public.admin_metrics'::regclass and a.attnum > 0 and not a.attisdropped),
          array['entity', 'status', 'this_week', 'this_month', 'total', 'last_7_days', 'last_30_days',
                'amount_cents', 'month_amount_cents'],
          'the five old columns keep their place and the new ones come after them');

-- Original entities, now with rolling windows
select is(pg_temp.moved('requests', 'open', 'total'), 4::numeric, 'requests: four were created');
select is(pg_temp.moved('requests', 'open', 'last_7_days'), 2::numeric, 'requests: two in the last 7 days');
select is(pg_temp.moved('requests', 'open', 'last_30_days'), 3::numeric,
          'requests: three in the last 30 days (one is 10 days old, one 40)');
select is(pg_temp.moved('requests', 'open', 'this_week'), 2::numeric, 'requests: the calendar week still counts as before');
select is(pg_temp.moved('bookings', 'accepted', 'total'), 1::numeric, 'bookings are still counted by status');
select is(pg_temp.moved('bookings', 'accepted', 'last_7_days'), 1::numeric, 'and have the rolling windows too');
select is(pg_temp.moved('providers', 'pending_review', 'total'), 1::numeric, 'providers are still counted by status');

-- Requests that received a proposal, by the day of the request
select is(pg_temp.moved('requests_with_proposal', 'with_proposal', 'total'), 3::numeric,
          'three requests received at least one proposal (a request with two proposals counts once)');
select is(pg_temp.moved('requests_with_proposal', 'with_proposal', 'last_7_days'), 2::numeric, 'two of them are from the last 7 days');
select is(pg_temp.moved('requests_with_proposal', 'with_proposal', 'last_30_days'), 2::numeric,
          'and the one from 40 days ago is outside the last 30');

-- Pro subscriptions by status
select is(pg_temp.moved('subscriptions', s, 'total'), 1::numeric, 'one Pro subscription is ' || s)
  from unnest(array['pending', 'trialing', 'active', 'past_due', 'canceled']) as s;

-- Payments: counts by status plus the amounts
select is(pg_temp.moved('payments', 'received', 'total'), 1::numeric, 'payments: one received');
select is(pg_temp.moved('payments', 'received', 'amount_cents'), 12000::numeric, 'payments: its amount');
select is(pg_temp.moved('payments', 'received', 'month_amount_cents'), 12000::numeric, 'payments: and its amount this month');
select is(pg_temp.moved('payments', 'held', 'amount_cents'), 6000::numeric, 'payments: the held one has its own amount');
select is(pg_temp.moved('payments', 'released', 'amount_cents'), 8000::numeric,
          'payments: a released payment from 40 days ago is in the total amount');
select is(pg_temp.moved('payments', 'released', 'month_amount_cents'), 0::numeric, 'payments: and not in this month');
select ok((select month_amount_cents is not null from public.admin_metrics where entity = 'payments' and status = 'released'),
          'a payment status with rows but none this month shows 0, not null');
select ok((select bool_and(amount_cents is null and month_amount_cents is null)
             from public.admin_metrics where entity <> 'payments'),
          'only payments carry amounts');

-- Free-plan providers at the proposal limit (2 this month): C has sent 2 as a free provider,
-- A has sent 2 but is on Pro, D has sent 1.
select is(pg_temp.moved('free_allowance', 'reached', 'total'), 1::numeric, 'one free provider reached the limit of 2 this month');
select is(pg_temp.moved('free_allowance', 'reached', 'last_7_days'), 1::numeric, 'it is a snapshot of now: every window holds it');
select tests.clear_authentication();
update public.platform_settings set value = '0' where key = 'free_proposals_per_month';
select tests.authenticate_as('admin');
select is((select count(*)::int from public.admin_metrics where entity = 'free_allowance'), 0,
          'with the limit at 0 (no limit) nobody reaches it');
-- A missing or malformed limit counts as 5, like check_proposal() does
select tests.clear_authentication();
update public.platform_settings set value = '5' where key = 'free_proposals_per_month';
select tests.authenticate_as('admin');
insert into probe select 'five', coalesce(sum(total), 0) from public.admin_metrics where entity = 'free_allowance';
select tests.clear_authentication();
update public.platform_settings set value = '"ten"' where key = 'free_proposals_per_month';
select tests.authenticate_as('admin');
select is((select coalesce(sum(total), 0) from public.admin_metrics where entity = 'free_allowance'),
          (select v::numeric from probe where k = 'five'), 'a malformed limit counts as 5');
select tests.clear_authentication();
delete from public.platform_settings where key = 'free_proposals_per_month';
select tests.authenticate_as('admin');
select is((select coalesce(sum(total), 0) from public.admin_metrics where entity = 'free_allowance'),
          (select v::numeric from probe where k = 'five'), 'and so does a missing one');

-- ================================================================ everybody else
-- These users do read rows of the tables underneath, so only the filter of the view stops them.
select tests.authenticate_as('provider_c');
select is((select count(*)::int from public.proposals where provider_id = auth.uid()), 2,
          'precondition: provider C reads the own proposals');
select is((select count(*)::int from public.payments where provider_id = auth.uid()), 6,
          'precondition: and the own payments');
select is((select count(*)::int from public.subscriptions where provider_id = auth.uid()), 1,
          'precondition: and the own subscription');
select is((select count(*)::int from public.admin_metrics), 0, 'but the provider gets no row from admin_metrics');

select tests.authenticate_as('client_a');
select is((select count(*)::int from public.requests where client_id = auth.uid()), 4,
          'precondition: a client reads the own requests');
select is((select count(*)::int from public.admin_metrics), 0, 'but gets no row from admin_metrics');

select tests.authenticate_as('provider_f');
select is((select count(*)::int from public.providers where id = auth.uid()), 1,
          'precondition: a pending provider reads the own row');
select is((select count(*)::int from public.admin_metrics), 0, 'but gets no row from admin_metrics');

select tests.authenticate_anon();
select throws_ok($$select * from public.admin_metrics$$, '42501', null, 'anon cannot read the view');
select throws_ok($$select last_30_days, amount_cents from public.admin_metrics$$, '42501', null, 'nor its new columns');

-- The filter lives in the view: the owner of the database (no RLS) and the service role are not
-- administrators either.
select tests.clear_authentication();
select is((select count(*)::int from public.admin_metrics), 0, 'a session that is not an administrator gets no row, RLS or not');
select tests.authenticate_service();
select is((select count(*)::int from public.admin_metrics), 0, 'the service role gets no row');
select tests.clear_authentication();

select ok(not has_table_privilege('anon', 'public.admin_metrics', 'select'), 'anon has no grant on the view');
select ok(has_table_privilege('authenticated', 'public.admin_metrics', 'select'),
          'signed-in users keep the grant (the filter of the view decides)');
select ok(not (has_table_privilege('anon', 'public.admin_metrics', 'insert')
               or has_table_privilege('anon', 'public.admin_metrics', 'update')
               or has_table_privilege('anon', 'public.admin_metrics', 'delete')),
          'anon cannot write to it');
select ok((select coalesce(c.reloptions @> array['security_invoker=true'], false)
             from pg_class c where c.oid = 'public.admin_metrics'::regclass),
          'the view still runs with the rights of the caller');

select * from finish();
rollback;
