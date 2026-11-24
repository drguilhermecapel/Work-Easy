-- Account deletion, care shifts in progress, household side (migration 20261118600011, DD40). When the family's account
-- (the household owner) is deleted, a shift in progress (checked_in) of that household that has not ended is canceled,
-- whether it has started or is checked in early. The caregiver is told through the same notice as the other
-- cancellations (shift_canceled_by_deletion); the deleted family account is not told. A checked-in shift whose period
-- has already ended is history and does not change or get a notice. A shift in progress of another household is not
-- touched. Only the service role can run the function.
begin;
select plan(16);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ households and shifts
insert into public.households (owner_id, name) values
  (tests.uid('client_a'), 'Casa da família A'),
  (tests.uid('client_b'), 'Casa da família B');
insert into ids select 'house_a', id from public.households where name = 'Casa da família A';
insert into ids select 'house_b', id from public.households where name = 'Casa da família B';

insert into public.shifts (id, household_id, period, rate_cents, status, provider_id) values
  -- House A: a shift in progress that has started, with caregiver C.
  (md5('ci-started-a')::uuid, (select id from ids where name = 'house_a'),
     tstzrange(now() - interval '1 hour', now() + interval '3 hours'), 100, 'checked_in', tests.uid('provider_c')),
  -- House A: a shift checked in early by caregiver E, whose start is still an hour ahead.
  (md5('ci-early-a')::uuid, (select id from ids where name = 'house_a'),
     tstzrange(now() + interval '1 hour', now() + interval '5 hours'), 100, 'checked_in', tests.uid('provider_e')),
  -- House A: a future assigned shift, canceled as before.
  (md5('assigned-a')::uuid, (select id from ids where name = 'house_a'), tests.sp_period(tests.at(133, 0, '08:00'), 4),
     100, 'assigned', tests.uid('provider_c')),
  -- House A: a checked-in shift whose period has already ended is history: check-out was not recorded, but the care took place.
  (md5('ended-a')::uuid, (select id from ids where name = 'house_a'),
     tstzrange(now() - interval '5 hours', now() - interval '1 hour'), 100, 'checked_in', tests.uid('provider_c')),
  -- House B, another family: a shift in progress with caregiver D. The deletion of family A does not touch it.
  (md5('ci-b')::uuid, (select id from ids where name = 'house_b'),
     tstzrange(now() - interval '1 hour', now() + interval '3 hours'), 100, 'checked_in', tests.uid('provider_d'));

-- ================================================================ family A leaves
select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('client_a')), 3,
          'the family account cancels the two shifts in progress of its household and its future assigned shift');
select tests.clear_authentication();

select is((select status::text from public.shifts where id = md5('ci-started-a')::uuid), 'canceled',
          'a shift in progress of the family that has started is canceled');
select is((select status::text from public.shifts where id = md5('ci-early-a')::uuid), 'canceled',
          'a shift of the family checked in early, before its start, is canceled');
select is((select status::text from public.shifts where id = md5('assigned-a')::uuid), 'canceled',
          'the future assigned shift of the family is canceled as before');
select is((select status::text from public.shifts where id = md5('ended-a')::uuid), 'checked_in',
          'a checked-in shift of the family whose period has ended is history and does not change');
select is((select status::text from public.shifts where id = md5('ci-b')::uuid), 'checked_in',
          'a shift in progress of another family is not touched');
select is((select provider_id from public.shifts where id = md5('ci-started-a')::uuid), tests.uid('provider_c'),
          'the canceled shift in progress keeps the caregiver who checked in');
select is((select count(*)::int from public.audit_log
            where action = 'shift.canceled' and entity_id = (md5('ci-started-a')::uuid)::text
              and data ->> 'cause' = 'account_deletion'), 1,
          'the cancellation of the shift in progress is written to the audit log with its cause');

-- The caregivers of the canceled shifts are told with the same notice; the deleted family account is not.
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('provider_c')
              and params ->> 'shift_id' = (md5('ci-started-a')::uuid)::text), 1,
          'the caregiver of the shift in progress is told, with the shift_canceled_by_deletion notice');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('provider_e')
              and params ->> 'shift_id' = (md5('ci-early-a')::uuid)::text), 1,
          'the caregiver of the shift checked in early is told, with the same notice');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('provider_c')
              and params ->> 'shift_id' = (md5('assigned-a')::uuid)::text), 1,
          'the caregiver of the future assigned shift is told, as before');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('client_a')), 0,
          'the deleted family account is not told');
select is((select count(*)::int from public.notifications
            where params ->> 'shift_id' = (md5('ended-a')::uuid)::text), 0,
          'the checked-in shift whose period has ended produces no notice');
select is((select count(*)::int from public.notifications
            where params ->> 'shift_id' = (md5('ci-b')::uuid)::text), 0,
          'the shift in progress of another family produces no notice');

-- Running it again finds nothing left to cancel; the shift whose period has ended still does not count.
select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('client_a')), 0, 'a second run cancels nothing');
select tests.clear_authentication();

select * from finish();
rollback;
