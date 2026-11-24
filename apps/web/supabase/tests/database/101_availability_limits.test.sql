-- Weekly availability: a provider keeps at most 50 windows, and two windows of the same weekday do not
-- overlap (windows that only touch are fine). available_slots stays public, because the public
-- booking page asks it for the days a client can still book (today to a year ahead).
begin;
select plan(15);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- Windows of the same weekday: a provider's own writes are checked against the rows already kept.
select tests.authenticate_as('provider_c');
select lives_ok($$insert into public.availability (provider_id, weekday, start_time, end_time)
                  values (tests.uid('provider_c'), 1, '08:00', '12:00')$$,
                'a provider adds a window');
select throws_ok($$insert into public.availability (provider_id, weekday, start_time, end_time)
                   values (tests.uid('provider_c'), 1, '11:00', '14:00')$$,
                 'P0001', 'availability_overlap', 'a window that overlaps one of the same weekday is refused');
select lives_ok($$insert into public.availability (provider_id, weekday, start_time, end_time)
                  values (tests.uid('provider_c'), 1, '12:00', '14:00')$$,
                'a window that only touches the previous one is accepted');
select lives_ok($$insert into public.availability (provider_id, weekday, start_time, end_time)
                  values (tests.uid('provider_c'), 2, '08:00', '12:00')$$,
                'the same hours on another weekday are accepted');
select throws_ok($$update public.availability set start_time = '09:00', end_time = '10:00'
                    where provider_id = tests.uid('provider_c') and weekday = 1 and start_time = '12:00'$$,
                 'P0001', 'availability_overlap', 'moving a window onto another one of the same weekday is refused');
-- Both windows of one statement are checked against each other, not only against the rows already kept.
select throws_ok($$insert into public.availability (provider_id, weekday, start_time, end_time)
                   values (tests.uid('provider_c'), 3, '08:00', '10:00'), (tests.uid('provider_c'), 3, '09:00', '11:00')$$,
                 'P0001', 'availability_overlap', 'two overlapping windows in one statement are refused');
select tests.clear_authentication();

-- Fifty windows that do not overlap (seven weekdays, hours 00 to 07).
insert into public.availability (provider_id, weekday, start_time, end_time)
select tests.uid('provider_d'), (g % 7)::smallint, make_time(g / 7, 0, 0), make_time(g / 7, 30, 0)
  from generate_series(0, 49) as g;
select is((select count(*)::int from public.availability where provider_id = tests.uid('provider_d')), 50,
          'fifty windows are kept');

select tests.authenticate_as('provider_d');
select throws_ok($$insert into public.availability (provider_id, weekday, start_time, end_time)
                   values (tests.uid('provider_d'), 0, '20:00', '21:00')$$,
                 'P0001', 'availability_limit', 'a fifty-first window is refused');
select throws_ok($$insert into public.availability (provider_id, weekday, start_time, end_time)
                   values (tests.uid('provider_d'), 6, '20:00', '21:00'), (tests.uid('provider_d'), 6, '22:00', '23:00')$$,
                 'P0001', 'availability_limit', 'a bulk insert over the limit is refused as a whole');
select lives_ok($$update public.availability set end_time = '00:45'
                   where provider_id = tests.uid('provider_d') and weekday = 0 and start_time = '00:00'$$,
                'changing a window that is kept stays possible at the limit');
select tests.clear_authentication();

-- available_slots for anonymous visitors (the public booking page).
select tests.authenticate_anon();
select is(cardinality(public.available_slots(tests.uid('provider_c'), tests.future_monday(4), 60)), 10,
          'an anonymous visitor gets the free slots of a day inside the booking horizon');
select is(cardinality(public.available_slots(tests.uid('provider_c'), tests.future_monday(54), 60)), 0,
          'no slots are computed for a day more than a year ahead');
select is(cardinality(public.available_slots(tests.uid('provider_c'), tests.future_monday(-2), 60)), 0,
          'no slots are computed for a past day');
select tests.clear_authentication();
select ok(has_function_privilege('anon', 'public.available_slots(uuid, date, integer)', 'execute'),
          'anonymous visitors can still call available_slots');

select * from finish();
rollback;
