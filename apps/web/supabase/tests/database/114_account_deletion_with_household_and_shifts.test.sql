-- Account deletion with a household and its shifts, in the order account-delete uses: the shifts and the accepted
-- bookings are canceled, anonymize_user keeps the household and its shifts, and the Auth delete goes through.
-- The same goes for a caregiver's account: its future shifts are canceled, and a shift in progress stays
-- checked in with no caregiver, because the caregiver's account is gone.
begin;
select plan(20);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ family account with a household and shifts
insert into public.households (owner_id, name) values (tests.uid('client_a'), 'Casa da família A');
insert into ids select 'house_a', id from public.households where name = 'Casa da família A';
insert into public.care_recipients (household_id, first_name, adult_declared_at) values ((select id from ids where name = 'house_a'), 'Vó Lia', now());
insert into public.shifts (id, household_id, period, rate_cents, status, provider_id) values
  (md5('open-a')::uuid, (select id from ids where name = 'house_a'), tests.sp_period(tests.at(110, 0, '08:00'), 4), 100, 'open', null),
  (md5('assigned-a')::uuid, (select id from ids where name = 'house_a'), tests.sp_period(tests.at(110, 1, '08:00'), 4), 100, 'assigned', tests.uid('provider_c')),
  (md5('done-a')::uuid, (select id from ids where name = 'house_a'),
     tstzrange(now() - interval '10 days', now() - interval '10 days' + interval '4 hours'), 100, 'completed', tests.uid('provider_c'));
insert into ids values ('acc_a_d', tests.make_booking('provider_d', 'client_a', 't-reparo', tests.sp_period(tests.at(110, 2, '09:00'))));

select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('client_a')), 2,
          'the family account cancels its open and assigned shifts');
select is(public.cancel_unpaid_accepted_bookings_for_user(tests.uid('client_a')), 1,
          'and its accepted booking');
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$, 'anonymize_user runs with the household and its shifts still there');
select tests.clear_authentication();

-- anonymize_user keeps the household and its shifts: it only clears the household name and notes.
select is((select name from public.households where id = (select id from ids where name = 'house_a')), 'Removida',
          'the household is kept, with its name cleared');
select is((select count(*)::int from public.shifts where household_id = (select id from ids where name = 'house_a')), 3,
          'and so are its three shifts');

select lives_ok($$delete from auth.users where id = tests.uid('client_a')$$,
                'the Auth delete goes through for the family account');
select is((select count(*)::int from public.profiles where id = tests.uid('client_a')), 0, 'the profile is gone');
select is((select count(*)::int from public.households where id = (select id from ids where name = 'house_a')), 0,
          'the household goes with the account');
select is((select count(*)::int from public.shifts where household_id = (select id from ids where name = 'house_a')), 0,
          'and its shifts go with it');

-- ================================================================ caregiver account with shifts in progress
insert into public.households (owner_id, name) values (tests.uid('client_b'), 'Casa da família B');
insert into ids select 'house_b', id from public.households where name = 'Casa da família B';
insert into public.shifts (id, household_id, period, rate_cents, status, provider_id) values
  (md5('in-progress-b')::uuid, (select id from ids where name = 'house_b'),
     tstzrange(now() + interval '1 hour', now() + interval '5 hours'), 100, 'checked_in', tests.uid('provider_c')),
  (md5('assigned-b')::uuid, (select id from ids where name = 'house_b'), tests.sp_period(tests.at(110, 3, '08:00'), 4), 100, 'assigned', tests.uid('provider_c'));
select pass('the caregiver has a shift in progress and a future shift in another household');

select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('provider_c')), 1,
          'the caregiver account cancels its future shift and leaves the one in progress');
select lives_ok($$select public.anonymize_user(tests.uid('provider_c'))$$, 'anonymize_user runs for the caregiver account');
select tests.clear_authentication();

select lives_ok($$delete from auth.users where id = tests.uid('provider_c')$$,
                'the Auth delete goes through for the caregiver account');
select is((select status::text from public.shifts where id = md5('assigned-b')::uuid), 'canceled',
          'the future shift of the caregiver is canceled');
select is((select provider_id from public.shifts where id = md5('assigned-b')::uuid), null::uuid,
          'and has no caregiver once the account is gone');
-- Recorded behavior: the shift in progress ends with the account. It stays checked_in with no caregiver, so the
-- check-out cannot happen and the daily report cannot be written.
select is((select status::text from public.shifts where id = md5('in-progress-b')::uuid), 'checked_in',
          'the shift in progress stays checked in');
select is((select provider_id from public.shifts where id = md5('in-progress-b')::uuid), null::uuid,
          'with no caregiver once the account is gone');

select is((select count(*)::int from public.households where id = (select id from ids where name = 'house_b')), 1,
          'the other family keeps its household');
select is((select count(*)::int from public.profiles where id = tests.uid('client_b')), 1,
          'and its account');

select * from finish();
rollback;
