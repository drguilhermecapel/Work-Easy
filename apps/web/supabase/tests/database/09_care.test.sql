-- Care line: household RLS, offers (only to care providers, first to accept wins), what a
-- family and a caregiver may read of each other, the caregiver view without rates or
-- contacts, check-in window, daily report, cancellations, labor lock and overlap on shifts.
begin;
select plan(90);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- Providers A, C, D and E also offer the care occupation (a policy priced by shift).
insert into public.provider_occupations (provider_id, occupation_slug, approved) values
  (tests.uid('provider_a'), 't-cuidado', true), (tests.uid('provider_c'), 't-cuidado', true),
  (tests.uid('provider_d'), 't-cuidado', true), (tests.uid('provider_e'), 't-cuidado', true);

-- ================================================================ schema
select columns_are('public', 'care_recipients',
                   array['id', 'household_id', 'first_name', 'birth_year', 'preferences', 'emergency_contact', 'created_at'],
                   'care_recipients holds no health data (no diagnosis, no medication)');
select is((select array_agg(p.parameter_name::text order by p.ordinal_position) from information_schema.parameters p
            where p.specific_schema = 'public' and p.specific_name like 'caregiver_shifts%' and p.parameter_mode = 'OUT'),
          array['shift_id', 'period', 'status', 'offer_status', 'caregiver_payout_cents', 'notes', 'neighborhood_name',
                'recipient_first_name'],
          'the caregiver view has no rate, no contact and no preferences');

-- ================================================================ family
select tests.authenticate_as('client_a');
select lives_ok(format($$insert into public.households (name, neighborhood_id) values ('Casa da vó', %L)$$,
                       tests.neighborhood('t-bairro-1')), 'family creates a household');
insert into ids select 'house', id from public.households where name = 'Casa da vó';
select lives_ok($$insert into public.care_recipients (household_id, first_name, birth_year, preferences, emergency_contact)
                  values ((select id from ids where name = 'house'), 'Lúcia', 1940, 'Gosta de rádio', 'Filho 11 90000-0000')$$,
                'family adds a care recipient');
insert into ids select 'lucia', id from public.care_recipients where first_name = 'Lúcia';
select lives_ok(format($$insert into public.shifts (household_id, care_recipient_id, period, rate_cents, caregiver_payout_cents,
                                                    status, provider_id)
                         values ((select id from ids where name = 'house'), (select id from ids where name = 'lucia'),
                                 %L, 30000, 24000, 'assigned', %L)$$,
                       tests.sp_period(tests.at(60, 0, '08:00'), 12), tests.uid('provider_a')),
                'family creates a shift');
insert into ids select 'shift1', id from public.shifts where rate_cents = 30000;
select is((select status::text || '/' || coalesce(provider_id::text, 'none') from public.shifts
            where id = (select id from ids where name = 'shift1')), 'open/none',
          'a new shift is always open and unassigned');
select throws_ok($$update public.shifts set status = 'assigned' where id = (select id from ids where name = 'shift1')$$,
                 'P0001', 'not_allowed', 'the family cannot change the shift status directly');
select throws_ok(format($$update public.shifts set provider_id = %L where id = (select id from ids where name = 'shift1')$$,
                        tests.uid('provider_a')),
                 'P0001', 'not_allowed', 'the family cannot assign a caregiver directly');

select tests.authenticate_as('client_b');
select is((select count(*)::int from public.households), 0, 'another client cannot read the household');
select is((select count(*)::int from public.care_recipients), 0, 'another client cannot read the care recipient');
select is((select count(*)::int from public.shifts), 0, 'another client cannot read the shifts');
select throws_ok($$select public.offer_shift((select id from ids where name = 'shift1'), array[tests.uid('provider_a')])$$,
                 'P0001', 'not_allowed', 'only the owner (or an admin) offers a shift');
select throws_ok(format($$insert into public.care_recipients (household_id, first_name) values (%L, 'Intruso')$$,
                        (select id from ids where name = 'house')),
                 '42501', null, 'a family cannot add a care recipient to the household of another family');
-- a shift names only a recipient of its own household
select lives_ok($$insert into public.households (name) values ('Casa B')$$, 'client B creates a household');
insert into ids select 'house_own_b', id from public.households where name = 'Casa B';
select throws_ok(format($$insert into public.shifts (household_id, care_recipient_id, period, rate_cents)
                          values (%L, %L, %L, 1)$$, (select id from ids where name = 'house_own_b'),
                        (select id from ids where name = 'lucia'), tests.sp_period(tests.at(61, 0, '08:00'), 4)),
                 '23503', 'insert or update on table "shifts" violates foreign key constraint "shifts_recipient_in_household"',
                 'a shift cannot name the care recipient of another household');
select lives_ok(format($$insert into public.shifts (household_id, period, rate_cents) values (%L, %L, 1)$$,
                       (select id from ids where name = 'house_own_b'), tests.sp_period(tests.at(61, 0, '08:00'), 4)),
                'a shift without a recipient is fine');
select throws_ok(format($$update public.shifts set care_recipient_id = %L where household_id = %L$$,
                        (select id from ids where name = 'lucia'), (select id from ids where name = 'house_own_b')),
                 '23503', 'insert or update on table "shifts" violates foreign key constraint "shifts_recipient_in_household"',
                 'nor can it be moved to such a recipient later');

-- ================================================================ offers
select tests.authenticate_as('client_a');
select throws_ok($$select public.offer_shift((select id from ids where name = 'shift1'), array[tests.uid('client_b')])$$,
                 'P0001', 'not_allowed', 'shifts are not offered to users who are not providers');
select throws_ok($$select public.offer_shift((select id from ids where name = 'shift1'), array[tests.uid('provider_b')])$$,
                 'P0001', 'not_allowed', 'a shift is not offered to an approved provider with no care occupation');
select tests.clear_authentication();
update public.provider_occupations set approved = false where provider_id = tests.uid('provider_e') and occupation_slug = 't-cuidado';
update public.providers set status = 'draft' where id = tests.uid('provider_d');
select tests.authenticate_as('client_a');
select throws_ok($$select public.offer_shift((select id from ids where name = 'shift1'), array[tests.uid('provider_e')])$$,
                 'P0001', 'not_allowed', 'nor to a provider whose care occupation is not approved');
select throws_ok($$select public.offer_shift((select id from ids where name = 'shift1'), array[tests.uid('provider_d')])$$,
                 'P0001', 'not_allowed', 'nor to a provider that is not approved');
select tests.clear_authentication();
update public.provider_occupations set approved = true where provider_id = tests.uid('provider_e') and occupation_slug = 't-cuidado';
update public.providers set status = 'approved' where id = tests.uid('provider_d');

-- the family cannot read a caregiver (phone) just by offering a shift
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.profiles where id in (tests.uid('provider_a'), tests.uid('provider_c'))), 0,
          'before the offer: the family reads no caregiver profile');
select is(public.offer_shift((select id from ids where name = 'shift1'), array[tests.uid('provider_a'), tests.uid('provider_c')]),
          2, 'family offers the shift to two caregivers');
select is((select count(*)::int from public.profiles where id in (tests.uid('provider_a'), tests.uid('provider_c'))), 0,
          'after the offer: the family still reads no caregiver profile');
select is((select count(*)::int from public.providers where id in (tests.uid('provider_a'), tests.uid('provider_c'))), 0,
          'nor the provider rows of the caregivers offered');

select tests.clear_authentication();
select is((select count(*)::int from public.notifications where template = 'plantao_oferecido'), 2,
          'each caregiver offered is notified');

select tests.authenticate_as('provider_a');
select is((select count(*)::int from public.shifts), 0, 'a caregiver does not read the shifts table (rate and household ids)');
select is((select count(*)::int from public.caregiver_shifts()), 1, 'an offered caregiver reads the shift through caregiver_shifts()');
select is((select recipient_first_name from public.caregiver_shifts()), 'Lúcia', 'the caregiver sees the first name');
select is((select caregiver_payout_cents from public.caregiver_shifts()), 24000, 'and the payout, not the rate');
select is((select count(*)::int from public.care_recipients), 0,
          'the caregiver cannot read the care recipient record (contact, preferences)');
select is((select count(*)::int from public.households), 0, 'the caregiver cannot read the household');
select is((select count(*)::int from public.profiles where id = tests.uid('client_a')), 0,
          'an offered caregiver does not read the family profile before accepting');
select throws_ok($$insert into public.shift_offers (shift_id, provider_id)
                   values ((select id from ids where name = 'shift1'), auth.uid())$$,
                 '42501', null, 'a caregiver cannot offer a shift to himself');
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.caregiver_shifts()), 0, 'a caregiver not offered sees nothing');
select throws_ok($$select public.accept_shift_offer((select id from ids where name = 'shift1'))$$,
                 'P0001', 'not_allowed', 'a caregiver not offered cannot accept');
select throws_ok($$select public.cancel_shift((select id from ids where name = 'shift1'))$$,
                 'P0001', 'not_allowed', 'a caregiver not on the shift cannot cancel it');

select tests.authenticate_as('provider_a');
select is(public.accept_shift_offer((select id from ids where name = 'shift1'))::text, 'assigned', 'first caregiver accepts');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.accept_shift_offer((select id from ids where name = 'shift1'))$$,
                 'P0001', 'not_allowed', 'the second caregiver is too late');
select tests.clear_authentication();
select results_eq($$select status from public.shift_offers where shift_id = (select id from ids where name = 'shift1')
                    order by status$$,
                  array['accepted', 'expired'], 'the other offer expired');

-- after the assignment, family and caregiver share contact
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.profiles where id = tests.uid('provider_a')), 1,
          'the family reads the profile of the assigned caregiver');
select is((select count(*)::int from public.profiles where id = tests.uid('provider_c')), 0,
          'but not the one of a caregiver who was only offered');
select tests.authenticate_as('provider_a');
select is((select count(*)::int from public.profiles where id = tests.uid('client_a')), 1,
          'the assigned caregiver reads the profile of the family');
select is((select count(*)::int from public.shifts), 0, 'the assigned caregiver still does not read the shifts table');

-- ================================================================ check-in and report
select throws_ok($$select public.check_in((select id from ids where name = 'shift1'), 'in', -23.56, -46.69)$$,
                 'P0001', 'checkin_window', 'check-in only within 2 h of the start');
select throws_ok($$select public.check_in((select id from ids where name = 'shift1'), 'out')$$,
                 'P0001', 'invalid_transition', 'no check-out before the check-in');

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
select throws_ok($$insert into public.checkins (shift_id, provider_id, kind)
                    values ((select id from ids where name = 'shift_now'), auth.uid(), 'in')$$,
                 '42501', null, 'check-ins only through check_in()');
select throws_ok($$insert into public.daily_reports (shift_id, provider_id, meals)
                    values ((select id from ids where name = 'shift_now'), auth.uid(), 'Almoço')$$,
                 '42501', null, 'reports only through submit_daily_report()');
select lives_ok($$select public.check_in((select id from ids where name = 'shift_now'), 'in', -23.56, -46.69)$$,
                'assigned caregiver checks in near the start');
select tests.clear_authentication();
select is((select status::text from public.shifts where id = (select id from ids where name = 'shift_now')), 'checked_in',
          'the check-in moves the shift to checked_in');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.check_in((select id from ids where name = 'shift_now'), 'out')$$,
                 'P0001', 'checkin_window', 'check-out only within 2 h of the end');
select lives_ok($$select public.submit_daily_report((select id from ids where name = 'shift_now'), 'Almoço e lanche',
                  'Caminhada', 'Animada', null)$$, 'caregiver sends the daily report');
select lives_ok($$select public.submit_daily_report((select id from ids where name = 'shift_now'), 'Almoço, lanche e jantar')$$,
                'a second report for the same shift replaces the first');
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.daily_reports), 1, 'there is one report per shift');
select is((select meals from public.daily_reports), 'Almoço, lanche e jantar', 'the family reads the daily report');
select is((select count(*)::int from public.checkins), 1, 'the family reads the check-ins');
select tests.authenticate_as('client_b');
select is((select count(*)::int from public.daily_reports), 0, 'others cannot read the daily report');
select tests.authenticate_as('admin');
select is((select count(*)::int from public.households where name = 'Casa da vó'), 1, 'admin reads the households');
select is((select count(*)::int from public.care_recipients where first_name = 'Lúcia'), 1, 'admin reads the care recipients');
select ok((select count(*) from public.shifts) >= 2, 'admin reads the shifts');

-- window edges (now() is fixed inside the transaction)
select tests.clear_authentication();
insert into public.shifts (household_id, period, rate_cents, status, provider_id) values
  ((select id from ids where name = 'house'), tstzrange(now() + interval '2 hours', now() + interval '10 hours'), 101, 'assigned', tests.uid('provider_e')),
  ((select id from ids where name = 'house'), tstzrange(now() + interval '2 hours 1 minute', now() + interval '10 hours'), 102, 'assigned', tests.uid('provider_d'));
insert into public.shifts (household_id, period, rate_cents, status, provider_id)
values ((select id from ids where name = 'house'), tstzrange(now() - interval '8 hours', now()), 103, 'checked_in', tests.uid('provider_b'));
insert into ids select 'edge_in', id from public.shifts where rate_cents = 101;
insert into ids select 'edge_out', id from public.shifts where rate_cents = 102;
insert into ids select 'edge_end', id from public.shifts where rate_cents = 103;
select tests.authenticate_as('provider_e');
select lives_ok($$select public.check_in((select id from ids where name = 'edge_in'), 'in')$$,
                'exactly 2 h before the start is inside the window');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.check_in((select id from ids where name = 'edge_out'), 'in')$$,
                 'P0001', 'checkin_window', '2 h 1 min before the start is outside');
select tests.authenticate_as('provider_b');
select lives_ok($$select public.check_in((select id from ids where name = 'edge_end'), 'out')$$,
                'check-out at the end of the shift');
select tests.clear_authentication();
select is((select status::text from public.shifts where rate_cents = 103), 'completed', 'the check-out completes the shift');

-- ================================================================ cancellations
select tests.authenticate_as('provider_a');
select is(public.cancel_shift((select id from ids where name = 'shift1'), 'Imprevisto')::text, 'offered',
          'caregiver cancels: the shift is offered again to the others');
select tests.clear_authentication();
select is((select provider_id from public.shifts where id = (select id from ids where name = 'shift1')), null,
          'the caregiver is removed from the shift');
select results_eq($$select provider_id::text || ':' || status from public.shift_offers
                     where shift_id = (select id from ids where name = 'shift1') order by 1$$,
                  $$select p || ':' || s from (values (tests.uid('provider_a')::text, 'declined'),
                                                       (tests.uid('provider_c')::text, 'offered')) v(p, s) order by 1$$,
                  'the caregiver who left is declined and the others are offered again');
select is((select count(*)::int from public.notifications where template = 'plantao_oferecido'
              and user_id = tests.uid('provider_c')), 2, 'the caregiver offered again is notified again');
select tests.authenticate_as('client_a');
select is(public.cancel_shift((select id from ids where name = 'shift1'), 'Não precisa mais')::text, 'canceled',
          'family cancels: the shift is canceled');

-- ================================================================ labor lock and overlap on shifts
select tests.clear_authentication();
insert into public.households (owner_id, name) values (tests.uid('client_b'), 'Casa B2');
insert into ids select 'house_b', id from public.households where name = 'Casa B2';
insert into public.shifts (household_id, period, rate_cents, status, provider_id) values
  ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-02 08:00', 8), 1, 'assigned', tests.uid('provider_d'));
select throws_ok($$insert into public.shifts (household_id, period, rate_cents, status, provider_id)
                   values ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-02 12:00', 8), 1,
                           'assigned', tests.uid('provider_d'))$$,
                 '23P01', 'conflicting key value violates exclusion constraint "shifts_no_overlap"',
                 'assigned shifts of a caregiver cannot overlap');
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

-- The real path: a caregiver who accepts an offer goes through the same lock and overlap checks.
insert into public.shifts (household_id, period, rate_cents, status) values
  ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-06 14:00', 4), 7, 'offered'),
  ((select id from ids where name = 'house_b'), tests.sp_period('2030-09-02 10:00', 4), 8, 'offered');
insert into ids select 'fri', id from public.shifts where rate_cents = 7;
insert into ids select 'overlap', id from public.shifts where rate_cents = 8;
insert into public.shift_offers (shift_id, provider_id) values
  ((select id from ids where name = 'fri'), tests.uid('provider_d')),
  ((select id from ids where name = 'overlap'), tests.uid('provider_d'));
select tests.authenticate_as('provider_d');
select throws_ok($$select public.accept_shift_offer((select id from ids where name = 'fri'))$$,
                 'P0001', 'labor_lock', 'accepting an offer goes through the labor lock');
select throws_ok($$select public.accept_shift_offer((select id from ids where name = 'overlap'))$$,
                 'P0001', 'slot_unavailable', 'accepting an offer that overlaps another shift is refused');

-- ================================================================ offer limits
-- Eleven care providers, one family: ten offers per shift and thirty new offers a day.
select tests.clear_authentication();
do $$
declare
  i int;
  v_key text;
begin
  for i in 1..11 loop
    v_key := 'cg' || i;
    perform tests.create_user(v_key, 'Cuidador ' || i);
    update public.profiles set role = 'provider' where id = tests.uid(v_key);
    insert into public.providers (id, display_name, slug, status) values (tests.uid(v_key), 'Cuidador ' || i, 't-cg-' || i, 'approved');
    insert into public.provider_occupations (provider_id, occupation_slug, is_primary, approved)
    values (tests.uid(v_key), 't-cuidado', true, true);
  end loop;
end;
$$;
insert into public.households (owner_id, name) values (tests.uid('client_a'), 'Casa limite');
insert into ids select 'house_lim', id from public.households where name = 'Casa limite';
insert into public.shifts (household_id, period, rate_cents) values
  ((select id from ids where name = 'house_lim'), tests.sp_period(tests.at(62, 0, '08:00'), 4), 11),
  ((select id from ids where name = 'house_lim'), tests.sp_period(tests.at(62, 1, '08:00'), 4), 12),
  ((select id from ids where name = 'house_lim'), tests.sp_period(tests.at(62, 2, '08:00'), 4), 13),
  ((select id from ids where name = 'house_lim'), tests.sp_period(tests.at(62, 3, '08:00'), 4), 14);
insert into ids select 'lim1', id from public.shifts where rate_cents = 11;
insert into ids select 'lim2', id from public.shifts where rate_cents = 12;
insert into ids select 'lim3', id from public.shifts where rate_cents = 13;
insert into ids select 'lim4', id from public.shifts where rate_cents = 14;
select tests.authenticate_as('client_a');
select throws_ok($$select public.offer_shift((select id from ids where name = 'lim1'),
                    (select array_agg(tests.uid('cg' || g)) from generate_series(1, 11) g))$$,
                 'P0001', 'offer_limit', 'a shift takes at most 10 offers');
select is(public.offer_shift((select id from ids where name = 'lim1'), (select array_agg(tests.uid('cg' || g)) from generate_series(1, 10) g)),
          10, 'ten offers fit');
select is(public.offer_shift((select id from ids where name = 'lim2'), (select array_agg(tests.uid('cg' || g)) from generate_series(1, 10) g)),
          10, 'ten more on another shift');
-- client_a already made 2 offers on shift1, 20 here: 22 of the 30 of the day
select is(public.offer_shift((select id from ids where name = 'lim3'), (select array_agg(tests.uid('cg' || g)) from generate_series(1, 8) g)),
          8, 'up to 30 new offers a day');
select throws_ok($$select public.offer_shift((select id from ids where name = 'lim4'), array[tests.uid('cg1')])$$,
                 'P0001', 'offer_limit', 'the thirty-first offer of the day is refused');
select tests.authenticate_as('admin');
select is(public.offer_shift((select id from ids where name = 'lim4'), array[tests.uid('cg1')]), 1,
          'an admin is not held by the daily limit of the family');
select tests.clear_authentication();
-- a family that is also a caregiver cannot offer its own shift to itself
insert into public.households (owner_id, name) values (tests.uid('provider_e'), 'Casa do prestador E');
insert into ids select 'house_e', id from public.households where name = 'Casa do prestador E';
insert into public.shifts (household_id, period, rate_cents) values
  ((select id from ids where name = 'house_e'), tests.sp_period(tests.at(63, 0, '08:00'), 4), 15);
insert into ids select 'own_shift', id from public.shifts where rate_cents = 15;
select tests.authenticate_as('provider_e');
select throws_ok($$select public.offer_shift((select id from ids where name = 'own_shift'), array[auth.uid()])$$,
                 'P0001', 'not_allowed', 'a family cannot offer its own shift to itself');

-- The scheduler expires offers of shifts that already started.
select tests.clear_authentication();
insert into public.shifts (household_id, period, rate_cents, status) values
  ((select id from ids where name = 'house_lim'), tstzrange(now() - interval '1 hour', now() + interval '3 hours'), 16, 'offered');
insert into ids select 'started', id from public.shifts where rate_cents = 16;
insert into public.shift_offers (shift_id, provider_id) values ((select id from ids where name = 'started'), tests.uid('cg1'));
select private.expire_stale();
select is((select status from public.shift_offers where shift_id = (select id from ids where name = 'started')), 'expired',
          'expire_stale expires the offers of a shift that already started');
select is((select status from public.shift_offers where shift_id = (select id from ids where name = 'lim1') and provider_id = tests.uid('cg1')),
          'offered', 'and leaves the offers of future shifts');

select * from finish();
rollback;
