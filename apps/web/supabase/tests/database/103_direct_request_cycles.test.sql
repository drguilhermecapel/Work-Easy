-- Direct requests: a client who cancels a request to a provider cannot cycle through new ones without
-- limit. Cancelled requests of the last 24 hours count with the open ones, per client and provider.
-- A provider holds at most 20 open requests, checked after the provider row is locked.
begin;
select plan(17);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- Mondays 08:00 to 18:00 for three providers, each with a service of one hour.
insert into public.availability (provider_id, weekday, start_time, end_time) values
  (tests.uid('provider_c'), 1, '08:00', '18:00'),
  (tests.uid('provider_d'), 1, '08:00', '18:00'),
  (tests.uid('provider_e'), 1, '08:00', '18:00');
insert into public.services (id, provider_id, occupation_slug, title, price_min_cents, unit, duration_minutes, active) values
  (md5('s103-c')::uuid, tests.uid('provider_c'), 't-reparo', 'Reparo de teste', 5000, 'hora', 60, true),
  (md5('s103-d')::uuid, tests.uid('provider_d'), 't-reparo', 'Reparo de teste', 5000, 'hora', 60, true),
  (md5('s103-e')::uuid, tests.uid('provider_e'), 't-reparo', 'Reparo de teste', 5000, 'hora', 60, true);

-- Cycle with provider D: request, cancel, request, cancel, request. The next one is refused, because
-- the two cancelled requests of the last 24 hours and the open one fill the limit of three.
select tests.authenticate_as('client_a');
select lives_ok($$select public.book_direct(tests.uid('provider_d'), md5('s103-d')::uuid, tests.sp_period(tests.at(10, 0, '09:00'), 1))$$,
                'client A asks provider D for a job');
select lives_ok($$select public.transition_booking((select id from public.bookings where client_id = tests.uid('client_a')
                    and provider_id = tests.uid('provider_d') and status = 'requested'), 'canceled', 'Mudei de ideia')$$,
                'and cancels it');
select lives_ok($$select public.book_direct(tests.uid('provider_d'), md5('s103-d')::uuid, tests.sp_period(tests.at(11, 0, '09:00'), 1))$$,
                'a second request to the same provider');
select lives_ok($$select public.transition_booking((select id from public.bookings where client_id = tests.uid('client_a')
                    and provider_id = tests.uid('provider_d') and status = 'requested'), 'canceled', 'Mudei de ideia')$$,
                'cancelled too');
select lives_ok($$select public.book_direct(tests.uid('provider_d'), md5('s103-d')::uuid, tests.sp_period(tests.at(12, 0, '09:00'), 1))$$,
                'a third request is still allowed');
select throws_ok($$select public.book_direct(tests.uid('provider_d'), md5('s103-d')::uuid, tests.sp_period(tests.at(13, 0, '09:00'), 1))$$,
                 'P0001', 'booking_limit', 'a fourth one, with two cancelled in the last 24 hours, is refused');

-- Cancellations older than 24 hours no longer count.
select tests.clear_authentication();
update public.booking_events set at = now() - interval '25 hours'
 where to_status = 'canceled'
   and booking_id in (select id from public.bookings where client_id = tests.uid('client_a') and provider_id = tests.uid('provider_d'));
select tests.authenticate_as('client_a');
select lives_ok($$select public.book_direct(tests.uid('provider_d'), md5('s103-d')::uuid, tests.sp_period(tests.at(14, 0, '09:00'), 1))$$,
                'once those cancellations are a day old, the request is accepted');

-- Cancelled bookings that did not start as a request do not count: client B has two cancelled requests
-- and one booking that was cancelled without a request before it.
select tests.authenticate_as('client_b');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), md5('s103-c')::uuid, tests.sp_period(tests.at(10, 0, '09:00'), 1))$$,
                'client B asks provider C for a job');
select lives_ok($$select public.transition_booking((select id from public.bookings where client_id = tests.uid('client_b')
                    and provider_id = tests.uid('provider_c') and status = 'requested'), 'canceled', 'Mudei de ideia')$$,
                'and cancels it');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), md5('s103-c')::uuid, tests.sp_period(tests.at(11, 0, '09:00'), 1))$$,
                'a second request to provider C');
select lives_ok($$select public.transition_booking((select id from public.bookings where client_id = tests.uid('client_b')
                    and provider_id = tests.uid('provider_c') and status = 'requested'), 'canceled', 'Mudei de ideia')$$,
                'cancelled too');
select tests.clear_authentication();
select tests.make_booking('provider_c', 'client_b', 't-reparo', tests.sp_period(tests.at(20, 0, '09:00')), 'canceled');
select tests.authenticate_as('client_b');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), md5('s103-c')::uuid, tests.sp_period(tests.at(12, 0, '09:00'), 1))$$,
                'the booking cancelled without a request does not count: a third request is allowed');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), md5('s103-c')::uuid, tests.sp_period(tests.at(13, 0, '09:00'), 1))$$,
                 'P0001', 'booking_limit', 'and the fourth one is refused, with the two cancelled requests');

-- The open requests of a provider: twenty at most, from any clients (checked sequentially here).
select tests.clear_authentication();
insert into public.bookings (client_id, provider_id, occupation_slug, period, price_cents, status)
select tests.uid('client_b'), tests.uid('provider_e'), 't-reparo', tests.sp_period(tests.at(w, 0, '09:00'), 1), 5000, 'requested'
  from generate_series(10, 28) as w;
select is((select count(*)::int from public.bookings where provider_id = tests.uid('provider_e') and status = 'requested'), 19,
          'provider E has nineteen open requests');
select tests.authenticate_as('client_a');
select lives_ok($$select public.book_direct(tests.uid('provider_e'), md5('s103-e')::uuid, tests.sp_period(tests.at(5, 0, '10:00'), 1))$$,
                'the twentieth open request is accepted');
select throws_ok($$select public.book_direct(tests.uid('provider_e'), md5('s103-e')::uuid, tests.sp_period(tests.at(5, 0, '11:00'), 1))$$,
                 'P0001', 'booking_limit', 'a provider with twenty open requests takes no more');

select tests.clear_authentication();
select * from finish();
rollback;
