-- available_slots and care shifts (DD50): the occupation by a care shift (assigned or checked in) shows as
-- taken only to the provider herself and to the accounts with a household that holds a care shift of this
-- provider. An anonymous visitor and a signed-in account with no such link see those hours as free, so a
-- visitor cannot infer a caregiver's schedule by probing hours. The write side still refuses the hour:
-- book_direct checks the shifts for every caller (123_direct_booking_care_shift_overlap).
-- Occupation by reservations stays visible to everyone, as before (DD29).
begin;
select plan(13);
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

-- Signed-in account with no link to provider C (client_a has no household with a shift of C): the care-shift
-- hours are free, as for an anonymous visitor, and the reservation hours are taken (19 - 3 = 16 starts).
-- Before DD50 this account saw the care-shift hours as taken (11 starts); that is the change this block records.
select tests.authenticate_as('client_a');
select is(cardinality(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)), 16,
          'a signed-in account with no link to the provider gets the care-shift hours as free and the reservation hours as taken');
select ok(exists (select 1 from unnest(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)) as s
                   where lower(s) = tests.sp(tests.at(42, 0, '10:00'))),
          'a signed-in account with no link sees the start at 10:00, inside the care shift');
select ok(not exists (select 1 from unnest(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)) as s
                       where lower(s) = tests.sp(tests.at(42, 0, '15:00'))),
          'a signed-in account with no link does not see the start at 15:00, inside the reservation');
select tests.clear_authentication();

-- Another signed-in provider with no link to provider C (provider_d): she does not see the care-shift occupation (16 starts).
select tests.authenticate_as('provider_d');
select is(cardinality(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)), 16,
          'a signed-in provider with no link to the provider does not see the care-shift occupation');
select tests.clear_authentication();

-- The owner of the household that holds the shift (client_b) sees the care-shift hours held (19 - 5 - 3 = 11 starts).
select tests.authenticate_as('client_b');
select is(cardinality(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)), 11,
          'the owner of a household with a care shift of the provider sees the care-shift hours and the reservation hours as taken');
select tests.clear_authentication();

-- The provider herself (provider_c) sees her own care-shift hours held (11 starts).
select tests.authenticate_as('provider_c');
select is(cardinality(public.available_slots(tests.uid('provider_c'), tests.future_monday(42), 60)), 11,
          'the provider sees her own care-shift hours and the reservation hours as taken');
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
