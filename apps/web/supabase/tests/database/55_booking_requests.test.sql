-- Booking requests expire after 48 hours (or when their slot has passed), so they stop holding the
-- provider's agenda; book_direct sweeps the provider it books.
begin;
select plan(7);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

insert into public.availability (provider_id, weekday, start_time, end_time)
values (tests.uid('provider_c'), 1, '08:00', '18:00');
insert into public.services (id, provider_id, occupation_slug, title, price_min_cents, unit, duration_minutes, active)
values (md5('s55-svc')::uuid, tests.uid('provider_c'), 't-reparo', 'Reparo de teste', 5000, 'hora', 60, true);
insert into ids values ('svc', md5('s55-svc')::uuid);

-- A request nobody answered for 49 hours, and a fresh one.
insert into ids values ('stale', md5('s55-stale')::uuid);
insert into public.bookings (id, client_id, provider_id, occupation_slug, period, price_cents, status, created_at) values
  ((select id from ids where name = 'stale'), tests.uid('client_b'), tests.uid('provider_c'), 't-reparo',
   tests.sp_period(tests.at(51, 0, '09:00'), 1), 5000, 'requested', now() - interval '49 hours');
insert into ids values ('fresh', tests.make_booking('provider_c', 'client_b', 't-reparo', tests.sp_period(tests.at(52, 0, '09:00'), 1), 'requested'));

select is(private.expire_booking_requests(tests.uid('provider_c')), 1,
          'the sweep expires the stale request of the provider and nothing else');
select is((select status::text from public.bookings where id = (select id from ids where name = 'stale')), 'canceled',
          'a request older than 48 hours is canceled');
select is((select canceled_reason from public.bookings where id = (select id from ids where name = 'stale')), 'request_expired',
          'and the reason says it expired');
select is((select status::text from public.bookings where id = (select id from ids where name = 'fresh')), 'requested',
          'a fresh request is still waiting for the provider');

-- A second stale request that the sweep has not reached yet, on the slot book_direct will take.
insert into public.bookings (id, client_id, provider_id, occupation_slug, period, price_cents, status, created_at)
values (md5('s55-stale2')::uuid, tests.uid('client_b'), tests.uid('provider_c'), 't-reparo',
        tests.sp_period(tests.at(45, 0, '09:00'), 1), 5000, 'requested', now() - interval '49 hours');
insert into ids values ('stale2', md5('s55-stale2')::uuid);

select tests.authenticate_as('client_a');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'svc'),
                    tests.sp_period(tests.at(45, 0, '09:00'), 1))$$,
                'the provider''s agenda is free: a new request takes the slot of an expired one');
select tests.clear_authentication();
select is((select status::text from public.bookings where id = (select id from ids where name = 'stale2')), 'canceled',
          'book_direct cancels the expired request it stepped over');

select * from finish();
rollback;
