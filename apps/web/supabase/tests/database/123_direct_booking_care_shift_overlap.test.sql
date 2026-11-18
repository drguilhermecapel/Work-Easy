-- Direct booking requests and own bookings: a period that overlaps a care shift the provider already holds
-- (assigned or checked in) is refused with slot_unavailable. A period next to the shift is accepted, and a
-- shift of another provider does not block. The last checks cover create_own_booking the same way.
begin;
select plan(15);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- Mondays 08:00 to 18:00 for providers C and D, each with a one-hour service (as in 103).
insert into public.availability (provider_id, weekday, start_time, end_time) values
  (tests.uid('provider_c'), 1, '08:00', '18:00'),
  (tests.uid('provider_d'), 1, '08:00', '18:00');
insert into public.services (id, provider_id, occupation_slug, title, price_min_cents, unit, duration_minutes, active) values
  (md5('s123-c')::uuid, tests.uid('provider_c'), 't-reparo', 'Reparo de teste', 5000, 'hora', 60, true),
  (md5('s123-d')::uuid, tests.uid('provider_d'), 't-reparo', 'Reparo de teste', 5000, 'hora', 60, true);

-- A household of client B: provider C is assigned from 10:00 to 12:00, provider D is checked in from 15:00 to 16:00.
insert into public.households (id, owner_id, name) values (md5('h123')::uuid, tests.uid('client_b'), 'Casa de teste');
insert into public.shifts (household_id, period, rate_cents, status, provider_id) values
  (md5('h123')::uuid, tests.sp_period(tests.at(40, 0, '10:00'), 2), 30000, 'assigned', tests.uid('provider_c')),
  (md5('h123')::uuid, tests.sp_period(tests.at(40, 0, '15:00'), 1), 30000, 'checked_in', tests.uid('provider_d'));

select tests.authenticate_as('client_a');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), md5('s123-c')::uuid, tests.sp_period(tests.at(40, 0, '09:30'), 1))$$,
                 'P0001', 'slot_unavailable', 'a period that starts inside an assigned shift is refused');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), md5('s123-c')::uuid, tests.sp_period(tests.at(40, 0, '10:30'), 1))$$,
                 'P0001', 'slot_unavailable', 'a period inside an assigned shift is refused');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), md5('s123-c')::uuid, tests.sp_period(tests.at(40, 0, '09:00'), 4))$$,
                 'P0001', 'slot_unavailable', 'a period that covers an assigned shift is refused');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), md5('s123-c')::uuid, tests.sp_period(tests.at(40, 0, '12:00'), 1))$$,
                'a period that starts when the shift ends is accepted');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), md5('s123-c')::uuid, tests.sp_period(tests.at(40, 0, '08:00'), 2))$$,
                'a period that ends when the shift starts is accepted');
select throws_ok($$select public.book_direct(tests.uid('provider_d'), md5('s123-d')::uuid, tests.sp_period(tests.at(40, 0, '15:30'), 1))$$,
                 'P0001', 'slot_unavailable', 'a checked-in shift refuses an overlapping period too');
select lives_ok($$select public.book_direct(tests.uid('provider_d'), md5('s123-d')::uuid, tests.sp_period(tests.at(40, 0, '10:00'), 2))$$,
                'the assigned shift of provider C does not block provider D');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), md5('s123-c')::uuid, tests.sp_period(tests.at(40, 0, '15:00'), 1))$$,
                'and the checked-in shift of provider D does not block provider C');

select tests.clear_authentication();
select is((select count(*)::int from public.bookings where provider_id = tests.uid('provider_c') and client_id = tests.uid('client_a')),
          3, 'the refused requests wrote no booking: provider C has the three accepted ones');
select is((select count(*)::int from public.bookings where provider_id = tests.uid('provider_d') and client_id = tests.uid('client_a')),
          1, 'provider D has the one accepted request');

-- Own bookings (create_own_booking) in week 41, so that they do not meet the requests above. Provider C has
-- an assigned shift from 10:00 to 12:00 that week; each provider has one client of its own (origin own).
insert into public.provider_clients (id, provider_id, name, origin) values
  (md5('pc123-c')::uuid, tests.uid('provider_c'), 'Cliente próprio de teste', 'own'),
  (md5('pc123-d')::uuid, tests.uid('provider_d'), 'Cliente próprio de teste', 'own');
insert into public.shifts (household_id, period, rate_cents, status, provider_id) values
  (md5('h123')::uuid, tests.sp_period(tests.at(41, 0, '10:00'), 2), 30000, 'assigned', tests.uid('provider_c'));

select tests.authenticate_as('provider_c');
select throws_ok($$select public.create_own_booking(md5('pc123-c')::uuid, 't-reparo', tests.sp_period(tests.at(41, 0, '09:30'), 1), 5000)$$,
                 'P0001', 'slot_unavailable', 'an own booking that overlaps an assigned shift is refused');
select lives_ok($$select public.create_own_booking(md5('pc123-c')::uuid, 't-reparo', tests.sp_period(tests.at(41, 0, '12:00'), 1), 5000)$$,
                'an own booking that starts when the shift ends is accepted');
select tests.authenticate_as('provider_d');
select lives_ok($$select public.create_own_booking(md5('pc123-d')::uuid, 't-reparo', tests.sp_period(tests.at(41, 0, '10:00'), 2), 5000)$$,
                'the assigned shift of provider C does not block the own booking of provider D');

select tests.clear_authentication();
select is((select count(*)::int from public.bookings where origin = 'own' and provider_id = tests.uid('provider_c')), 1,
          'the refused own booking wrote no row: provider C has its one accepted own booking');

select * from finish();
rollback;
