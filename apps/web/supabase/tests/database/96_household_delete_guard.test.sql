-- Households and care history: a household with shifts cannot be deleted while its owner
-- exists (for the owner, the service role or a maintenance session); a household without
-- shifts can still be deleted by its owner; and the account deletion path (anonymization,
-- then the Auth delete) still removes the account and its households.
begin;
select plan(16);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ owner
select tests.authenticate_as('client_a');
select lives_ok($$insert into public.households (name) values ('Casa com plantão')$$, 'family creates a household');
insert into ids select 'with_shift', id from public.households where name = 'Casa com plantão';
select lives_ok(format($$insert into public.shifts (household_id, period, rate_cents)
                         values (%L, %L, 5000)$$,
                       (select id from ids where name = 'with_shift'), tests.sp_period(tests.at(70, 0, '08:00'), 4)),
                'family schedules a shift in that household');
select throws_ok(format($$delete from public.households where id = %L$$, (select id from ids where name = 'with_shift')),
                 'P0001', 'household_has_shifts', 'the owner cannot delete a household that has shifts');

select lives_ok($$insert into public.households (name) values ('Casa sem plantão')$$, 'family creates a second household');
insert into ids select 'no_shift', id from public.households where name = 'Casa sem plantão';
select lives_ok(format($$delete from public.households where id = %L$$, (select id from ids where name = 'no_shift')),
                'a household without shifts can be deleted by its owner');

-- ================================================================ other sessions
select tests.clear_authentication();
select is((select count(*)::int from public.households where id = (select id from ids where name = 'no_shift')), 0,
          'the household without shifts is gone');
select is((select count(*)::int from public.households where id = (select id from ids where name = 'with_shift')), 1,
          'the household with shifts is still there');
select is((select count(*)::int from public.shifts where household_id = (select id from ids where name = 'with_shift')), 1,
          'and so is its shift');

select tests.authenticate_service();
select throws_ok(format($$delete from public.households where id = %L$$, (select id from ids where name = 'with_shift')),
                 'P0001', 'household_has_shifts', 'the service role is refused the same way');
select tests.clear_authentication();
select throws_ok(format($$delete from public.households where id = %L$$, (select id from ids where name = 'with_shift')),
                 'P0001', 'household_has_shifts', 'a maintenance session is refused the same way');

-- ================================================================ account deletion
-- account-delete: anonymize_user as the service role, then the Auth delete of the user.
insert into ids select 'uid_a', tests.uid('client_a');
select tests.authenticate_service();
select lives_ok($$select public.anonymize_user((select id from ids where name = 'uid_a'))$$,
                'account deletion anonymizes the account (service role)');
select tests.clear_authentication();
select lives_ok($$delete from auth.users where id = (select id from ids where name = 'uid_a')$$,
                'the Auth delete goes through for an account with shifts');
select is((select count(*)::int from public.profiles where id = (select id from ids where name = 'uid_a')), 0,
          'the profile of the deleted account is gone');
select is((select count(*)::int from public.households where owner_id = (select id from ids where name = 'uid_a')), 0,
          'its households go with it, as before this rule');
select is((select count(*)::int from public.shifts where household_id = (select id from ids where name = 'with_shift')), 0,
          'and so do their shifts, as before this rule');

select * from finish();
rollback;
