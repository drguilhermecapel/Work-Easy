-- Revenue levers of migration 12: commission ceiling and the monthly proposal allowance of the
-- free plan (the Pro trial lives in the subscriptions-manage function, tested with it).
begin;
select plan(19);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- ---------------------------------------------------------------- defaults
select is((select value from public.platform_settings where key = 'commission_cap_cents'), '15000'::jsonb,
          'the commission ceiling starts at R$ 150,00');
select is((select value from public.platform_settings where key = 'free_proposals_per_month'), '5'::jsonb,
          'the free plan starts with 5 proposals a month');
select is((select value from public.platform_settings where key = 'pro_trial_days'), '30'::jsonb,
          'the Pro trial starts at 30 days');

-- ---------------------------------------------------------------- commission ceiling
update public.platform_settings set value = 'true' where key = 'commission_enabled';
create temp table ids (name text primary key, id uuid);
insert into ids values
  ('cap_big', tests.make_booking('provider_e', 'client_b', 't-reparo', tests.sp_period('2031-03-04 09:00'), 'accepted', 2000000)),
  ('cap_edge', tests.make_booking('provider_e', 'client_b', 't-reparo', tests.sp_period('2031-03-05 09:00'), 'accepted', 125000)),
  ('cap_small', tests.make_booking('provider_e', 'client_b', 't-reparo', tests.sp_period('2031-03-06 09:00'), 'accepted', 100000));
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'cap_big')), 15000,
          'R$ 20.000,00 at 12% would be R$ 2.400,00: the ceiling holds it at R$ 150,00');
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'cap_edge')), 15000,
          'R$ 1.250,00 at 12% is exactly the ceiling');
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'cap_small')), 12000,
          'below the ceiling the percentage applies as before');

update public.platform_settings set value = '0' where key = 'commission_cap_cents';
insert into ids values
  ('nocap', tests.make_booking('provider_e', 'client_b', 't-reparo', tests.sp_period('2031-03-07 09:00'), 'accepted', 2000000));
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'nocap')), 240000,
          'a ceiling of 0 means no ceiling');
update public.platform_settings set value = '15000' where key = 'commission_cap_cents';
update public.platform_settings set value = 'false' where key = 'commission_enabled';
insert into ids values
  ('off', tests.make_booking('provider_e', 'client_a', 't-reparo', tests.sp_period('2031-03-08 09:00'), 'accepted', 2000000));
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'off')), 0,
          'the ceiling does not turn the commission on: it stays 0 while commission_enabled is false');

-- ---------------------------------------------------------------- free proposals
update public.platform_settings set value = '2' where key = 'free_proposals_per_month';
insert into public.requests (client_id, occupation_slug, neighborhood_id, description)
select tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido de teste numero ' || n
  from generate_series(1, 7) n;
create temp table reqs as
  select row_number() over (order by description) as n, id from public.requests where description like 'Pedido de teste numero %';
grant all on ids, reqs to authenticated, service_role;

select tests.authenticate_as('provider_c');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from reqs where n = 1), 10000)$$,
                'free provider: first proposal of the month');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from reqs where n = 2), 10000)$$,
                'free provider: second proposal of the month');
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from reqs where n = 3), 10000)$$,
                 'P0001', 'free_proposal_limit', 'free provider: the third one is refused');
-- Withdrawing does not give the slot back: otherwise withdraw-and-resend would be free forever
update public.proposals set status = 'withdrawn' where request_id = (select id from reqs where n = 1);
select throws_ok($$insert into public.proposals (request_id, price_cents) values ((select id from reqs where n = 3), 10000)$$,
                 'P0001', 'free_proposal_limit', 'a withdrawn proposal still counts for the month');

-- Another free provider has the own allowance
select tests.authenticate_as('provider_d');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from reqs where n = 3), 9000)$$,
                'the allowance is per provider');

-- Pro has no limit
select tests.clear_authentication();
update public.providers set plan = 'pro' where id = tests.uid('provider_c');
select tests.authenticate_as('provider_c');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from reqs where n = 3), 10000)$$,
                'Pro: the third proposal goes through');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from reqs where n = 4), 10000)$$,
                'Pro: and the fourth');

-- The count is a calendar month: proposals from earlier months do not count
select tests.clear_authentication();
insert into public.proposals (request_id, provider_id, price_cents, created_at) values
  ((select id from reqs where n = 1), tests.uid('provider_e'), 8000, now() - interval '70 days'),
  ((select id from reqs where n = 2), tests.uid('provider_e'), 8000, now() - interval '65 days');
select tests.authenticate_as('provider_e');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from reqs where n = 5), 8000)$$,
                'old proposals do not use the allowance of this month');

-- The server side (seeds, support) is not limited, and 0 turns the limit off
select tests.authenticate_service();
select lives_ok($$insert into public.proposals (request_id, provider_id, price_cents) values
                  ((select id from reqs where n = 6), tests.uid('provider_e'), 8000),
                  ((select id from reqs where n = 7), tests.uid('provider_e'), 8000)$$,
                'the service role is not limited');
select tests.clear_authentication();
update public.platform_settings set value = '0' where key = 'free_proposals_per_month';
select tests.authenticate_as('provider_d');
select lives_ok($$insert into public.proposals (request_id, price_cents) values ((select id from reqs where n = 4), 9000)$$,
                'an allowance of 0 turns the limit off');

select * from finish();
rollback;
