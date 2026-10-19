-- Care line: household RLS, offers (first to accept wins), caregiver view with the
-- first name only, check-in window, daily report, cancellations, labor lock and
-- overlap on shifts.
begin;
select plan(40);
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ family
select tests.authenticate_as('client_a');
select lives_ok(format($$insert into public.households (name, neighborhood_id) values ('Casa da vó', %L)$$,
                       tests.neighborhood('t-bairro-1')), 'family creates a household');
insert into ids select 'house', id from public.households where name = 'Casa da vó';
select lives_ok($$insert into public.care_recipients (household_id, first_name, birth_year, preferences, emergency_contact)
                  values ((select id from ids where name = 'house'), 'Lúcia', 1940, 'Gosta de rádio', 'Filho 11 90000-0000')$$,
                'family adds a care recipient');
insert into ids select 'lucia', id from public.care_recipients where first_name = 'Lúcia';
select lives_ok($$insert into public.shifts (household_id, care_recipient_id, period, rate_cents, caregiver_payout_cents,
                                             status, provider_id)
                  values ((select id from ids where name = 'house'), (select id from ids where name = 'lucia'),
                          tests.sp_period('2030-08-05 08:00', 12), 30000, 24000, 'assigned', tests.uid('provider_a'))$$,
                'family creates a shift');
insert into ids select 'shift1', id from public.shifts where rate_cents = 30000;
select is((select status::text || '/' || coalesce(provider_id::text, 'none') from public.shifts
            where id = (select id from ids where name = 'shift1')), 'open/none',
          'a new shift is always open and unassigned');
select throws_ok($$update public.shifts set status = 'assigned' where id = (select id from ids where name = 'shift1')$$,
                 'P0001', 'not_allowed', 'the family cannot change the shift status directly');

select tests.authenticate_as('client_b');
select is((select count(*)::int from public.households), 0, 'another client cannot read the household');
select is((select count(*)::int from public.care_recipients), 0, 'another client cannot read the care recipient');
select is((select count(*)::int from public.shifts), 0, 'another client cannot read the shifts');
select throws_ok($$select public.offer_shift((select id from ids where name = 'shift1'), array[tests.uid('provider_a')])$$,
                 'P0001', 'not_allowed', 'only the owner (or an admin) offers a shift');

-- ================================================================ offers
select tests.authenticate_as('client_a');
select throws_ok($$select public.offer_shift((select id from ids where name = 'shift1'), array[tests.uid('client_b')])$$,
                 'P0001', 'not_allowed', 'shifts are offered to approved providers only');
select is(public.offer_shift((select id from ids where name = 'shift1'), array[tests.uid('provider_a'), tests.uid('provider_c')]),
          2, 'family offers the shift to two caregivers');

select tests.clear_authentication();
select is((select count(*)::int from public.notifications where template = 'plantao_oferecido'), 2,
          'each caregiver offered is notified');

select tests.authenticate_as('provider_a');
select is((select count(*)::int from public.shifts), 1, 'an offered caregiver reads the shift');
select is((select recipient_first_name from public.caregiver_shifts()), 'Lúcia', 'the caregiver sees the first name');
select is((select count(*)::int from public.care_recipients), 0,
          'the caregiver cannot read the care recipient record (contact, preferences)');
select is((select count(*)::int from public.households), 0, 'the caregiver cannot read the household');
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.shifts), 0, 'a caregiver not offered sees nothing');
select throws_ok($$select public.accept_shift_offer((select id from ids where name = 'shift1'))$$,
                 'P0001', 'not_allowed', 'a caregiver not offered cannot accept');

select tests.authenticate_as('provider_a');
select is(public.accept_shift_offer((select id from ids where name = 'shift1'))::text, 'assigned', 'first caregiver accepts');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.accept_shift_offer((select id from ids where name = 'shift1'))$$,
                 'P0001', 'not_allowed', 'the second caregiver is too late');
select tests.clear_authentication();
select results_eq($$select status from public.shift_offers where shift_id = (select id from ids where name = 'shift1')
                    order by status$$,
                  array['accepted', 'expired'], 'the other offer expired');

-- ================================================================ check-in and report
select tests.authenticate_as('provider_a');
select throws_ok($$select public.check_in((select id from ids where name = 'shift1'), 'in', -23.56, -46.69)$$,
                 'P0001', 'not_allowed', 'check-in only within 2 h of the start');

select tests.clear_authentication();
insert into public.shifts (household_id, care_recipient_id, period, rate_cents, caregiver_payout_cents, status, provider_id)
values ((select id from ids where name = 'house'), (select id from ids where name = 'lucia'),
        tstzrange(now() + interval '1 hour', now() + interval '9 hours'), 20000, 16000, 'assigned', tests.uid('provider_c'));
insert into ids select 'shift_now', id from public.shifts where rate_cents = 20000;

select tests.authenticate_as('provider_a');
select throws_ok($$select public.check_in((select id from ids where name = 'shift_now'), 'in')$$,
                 'P0001', 'not_allowed', 'only the assigned caregiver checks in');
select throws_ok($$select public.submit_daily_report((select id from ids where name = 'shift_now'), 'Almoço')$$,
                 'P0001', 'not_allowed', 'only the assigned caregiver reports');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.submit_daily_report((select id from ids where name = 'shift_now'), 'Almoço')$$,
                 'P0001', 'not_allowed', 'no report before check-in');
select lives_ok($$select public.check_in((select id from ids where name = 'shift_now'), 'in', -23.56, -46.69)$$,
                'assigned caregiver checks in near the start');
select throws_ok($$select public.check_in((select id from ids where name = 'shift_now'), 'out')$$,
                 'P0001', 'not_allowed', 'check-out only within 2 h of the end');
select lives_ok($$select public.submit_daily_report((select id from ids where name = 'shift_now'), 'Almoço e lanche',
                  'Caminhada', 'Animada', null)$$, 'caregiver sends the daily report');
select tests.authenticate_as('client_a');
select is((select meals from public.daily_reports), 'Almoço e lanche', 'the family reads the daily report');
select is((select count(*)::int from public.checkins), 1, 'the family reads the check-ins');
select tests.authenticate_as('client_b');
select is((select count(*)::int from public.daily_reports), 0, 'others cannot read the daily report');

-- ================================================================ cancellations
select tests.authenticate_as('provider_a');
select is(public.cancel_shift((select id from ids where name = 'shift1'), 'Imprevisto')::text, 'offered',
          'caregiver cancels: the shift is offered again to the others');
select tests.clear_authentication();
select is((select provider_id from public.shifts where id = (select id from ids where name = 'shift1')), null,
          'the caregiver is removed from the shift');
select tests.authenticate_as('client_a');
select is(public.cancel_shift((select id from ids where name = 'shift1'), 'Não precisa mais')::text, 'canceled',
          'family cancels: the shift is canceled');

-- ================================================================ labor lock and overlap on shifts
select tests.clear_authentication();
insert into public.households (owner_id, name) values (tests.uid('client_b'), 'Casa B');
insert into ids select 'house_b', id from public.households where name = 'Casa B';
insert into public.shifts (household_id, period, rate_cents, status, provider_id) values
  ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-02 08:00', 8), 1, 'assigned', tests.uid('provider_d'));
select throws_ok($$insert into public.shifts (household_id, period, rate_cents, status, provider_id)
                   values ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-02 12:00', 8), 1,
                           'assigned', tests.uid('provider_d'))$$,
                 '23P01', null, 'assigned shifts of a caregiver cannot overlap');
-- An overnight shift from Thursday to Friday touches two days: Monday + Thursday + Friday = 3.
select throws_ok($$insert into public.shifts (household_id, period, rate_cents, status, provider_id)
                   values ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-05 22:00', 8), 1,
                           'assigned', tests.uid('provider_d'))$$,
                 'P0001', 'labor_lock', 'an overnight shift counts both days');
select lives_ok($$insert into public.shifts (household_id, period, rate_cents, status, provider_id)
                  values ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-04 08:00', 8), 1,
                          'assigned', tests.uid('provider_d'))$$,
                'a second day in the week is allowed');
select throws_ok($$insert into public.shifts (household_id, period, rate_cents, status, provider_id)
                   values ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-06 08:00', 8), 1,
                           'assigned', tests.uid('provider_d'))$$,
                 'P0001', 'labor_lock', 'a third day of shifts in the same week is refused');
select lives_ok($$insert into public.shifts (household_id, period, rate_cents, status, provider_id)
                  values ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-06 08:00', 8), 1,
                          'open', null)$$,
                'an open shift (nobody assigned) is not counted');
-- Bookings of labor-locked occupations and shifts of the same family share the count.
select tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-09-09 09:00'));
insert into public.shifts (household_id, period, rate_cents, status, provider_id) values
  ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-10 08:00', 8), 1, 'assigned', tests.uid('provider_a'));
select throws_ok($$insert into public.shifts (household_id, period, rate_cents, status, provider_id)
                   values ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-11 08:00', 8), 1,
                           'assigned', tests.uid('provider_a'))$$,
                 'P0001', 'labor_lock', 'bookings and shifts for the same family share the weekly count');

select * from finish();
rollback;
