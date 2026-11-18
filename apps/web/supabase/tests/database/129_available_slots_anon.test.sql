-- available_slots and care shifts: an anonymous visitor does not get the hours that a care shift holds
-- (assigned or checked in) as taken, while a signed-in user does, so a client does not ask for a held hour.
-- Occupation by reservations stays visible to anonymous visitors, as before.
begin;
select plan(10);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- Mondays 08:00 to 18:00 for provider C: 19 one-hour starts, every 30 minutes, when nothing is held.
insert into public.availability (provider_id, weekday, start_time, end_time) values
  (tests.uid('provider_c'), 1, '08:00', '18:00');

-- Provider C has a care shift from 10:00 to 12:00 (assigned) and a reservation from 15:00 to 16:00.
-- Starts that overlap the shift: 09:30 to 11:30 (5). Starts that overlap the reservation: 14:30 to 15:30 (3).
insert into public.households (id, owner_id, name) values (md5('h129')::uuid, tests.uid('client_b'), 'Casa de teste');
insert into public.shifts (household_id, period, rate_cents, status, provider_id) values
  (md5('h129')::uuid, tests.sp_period(tests.at(42, 0, '10:00'), 2), 30000, 'assigned', tests.uid('provider_c'));
select tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(42, 0, '15:00'), 1));

-- Anonymous visitor: the shift hours are not held (19 - 3 = 16 starts), the reservation hours are.
select tests.authenticate_anon();
select is(cardinality(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)), 16,
          'an anonymous visitor gets the care-shift hours as free and the reservation hours as taken');
select ok(exists (select 1 from unnest(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)) as s
                   where lower(s) = tests.sp(tests.at(42, 0, '10:00'))),
          'an anonymous visitor sees the start at 10:00, inside the care shift');
select ok(not exists (select 1 from unnest(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)) as s
                       where lower(s) = tests.sp(tests.at(42, 0, '15:00'))),
          'an anonymous visitor does not see the start at 15:00, inside the reservation');
select tests.clear_authentication();

-- Signed-in user: the care-shift hours are held too (19 - 5 - 3 = 11 starts).
select tests.authenticate_as('client_a');
select is(cardinality(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)), 11,
          'a signed-in user gets the care-shift hours and the reservation hours as taken');
select ok(not exists (select 1 from unnest(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)) as s
                       where lower(s) = tests.sp(tests.at(42, 0, '10:00'))),
          'a signed-in user does not see the start at 10:00, inside the care shift');
select ok(not exists (select 1 from unnest(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)) as s
                       where lower(s) = tests.sp(tests.at(42, 0, '15:00'))),
          'a signed-in user does not see the start at 15:00, inside the reservation');
select tests.clear_authentication();

-- The function keeps its definition: security definer with an empty search_path, stable, executable by anon.
select ok((select prosecdef and proconfig && array['search_path=""'] and provolatile = 's'
             from pg_proc where oid = 'public.available_slots(uuid,date,integer)'::regprocedure),
          'available_slots stays security definer, with an empty search_path, and stable');
select ok(has_function_privilege('anon', 'public.available_slots(uuid, date, integer)', 'execute'),
          'anonymous visitors can still call available_slots');
select ok(has_function_privilege('authenticated', 'public.available_slots(uuid, date, integer)', 'execute'),
          'signed-in users can still call available_slots');

select * from finish();
rollback;
