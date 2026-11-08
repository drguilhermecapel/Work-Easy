-- Direct booking requests: a provider's agenda is held by at most 20 open requests, and a slot more
-- than a year ahead cannot be requested.
begin;
select plan(4);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

insert into public.availability (provider_id, weekday, start_time, end_time)
values (tests.uid('provider_c'), 1, '08:00', '18:00');
insert into public.services (id, provider_id, occupation_slug, title, price_min_cents, unit, duration_minutes, active)
values (md5('s71-svc')::uuid, tests.uid('provider_c'), 't-reparo', 'Reparo de teste', 5000, 'hora', 60, true);

select tests.authenticate_as('client_a');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), md5('s71-svc')::uuid, tests.sp_period(tests.at(60, 0, '10:00'), 1))$$,
                 'P0001', 'slot_unavailable', 'a slot more than a year ahead cannot be requested');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), md5('s71-svc')::uuid, tests.sp_period(tests.at(4, 0, '10:00'), 1))$$,
                'a slot within the horizon can be requested');

-- Nineteen more open requests from another client (inserted directly): the provider now holds 20.
select tests.clear_authentication();
insert into public.bookings (client_id, provider_id, occupation_slug, period, price_cents, status)
select tests.uid('client_b'), tests.uid('provider_c'), 't-reparo', tests.sp_period(tests.at(w, 0, '09:00'), 1), 5000, 'requested'
  from generate_series(10, 28) as w;

select tests.authenticate_as('client_a');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), md5('s71-svc')::uuid, tests.sp_period(tests.at(5, 0, '11:00'), 1))$$,
                 'P0001', 'booking_limit', 'a provider with 20 open requests takes no more');

select * from finish();
rollback;
