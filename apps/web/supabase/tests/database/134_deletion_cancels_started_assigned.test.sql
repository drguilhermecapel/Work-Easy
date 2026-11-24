-- Account deletion, assigned shifts that have started (migration 20261118600012, DD48). When the caregiver's account is
-- deleted, an assigned shift that has started and has not ended is canceled, like its future assigned shifts; the family
-- is told through shift_canceled_by_deletion and the deleted account is not. When the family's account is deleted, the
-- same happens to an assigned shift of its household that has started, and its caregiver is told. An assigned shift
-- whose period has already ended is history: it does not change and gets no notice. An open shift with a future start
-- is not touched by a caregiver's deletion (an open shift has no caregiver yet). Only the service role can run the function.
begin;
select plan(21);
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
  -- Caregiver C: an assigned shift that started an hour ago and ends in three hours, in family A.
  (md5('assigned-started-c')::uuid, (select id from ids where name = 'house_a'),
     tstzrange(now() - interval '1 hour', now() + interval '3 hours'), 100, 'assigned', tests.uid('provider_c')),
  -- Caregiver C: an assigned shift whose period has already ended, in family A: history.
  (md5('assigned-ended-c')::uuid, (select id from ids where name = 'house_a'),
     tstzrange(now() - interval '5 hours', now() - interval '1 hour'), 100, 'assigned', tests.uid('provider_c')),
  -- Caregiver C: a future assigned shift in family B, canceled as before.
  (md5('assigned-future-c')::uuid, (select id from ids where name = 'house_b'), tests.sp_period(tests.at(134, 0, '08:00'), 4),
     100, 'assigned', tests.uid('provider_c')),
  -- Family A: an open shift with a future start and no caregiver yet. The caregiver's deletion does not touch it.
  (md5('open-future-a')::uuid, (select id from ids where name = 'house_a'), tests.sp_period(tests.at(134, 1, '08:00'), 4),
     100, 'open', null),
  -- Caregiver D, family A: an assigned shift that started an hour ago, and one whose period has ended.
  (md5('assigned-started-a')::uuid, (select id from ids where name = 'house_a'),
     tstzrange(now() - interval '1 hour', now() + interval '3 hours'), 100, 'assigned', tests.uid('provider_d')),
  (md5('assigned-ended-a')::uuid, (select id from ids where name = 'house_a'),
     tstzrange(now() - interval '5 hours', now() - interval '1 hour'), 100, 'assigned', tests.uid('provider_d'));

-- ================================================================ caregiver C leaves
select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('provider_c')), 2,
          'the caregiver account cancels the assigned shift it has started and its future assigned shift');
select tests.clear_authentication();

select is((select status::text from public.shifts where id = md5('assigned-started-c')::uuid), 'canceled',
          'an assigned shift that has started and has not ended is canceled');
select is((select status::text from public.shifts where id = md5('assigned-future-c')::uuid), 'canceled',
          'the future assigned shift of the caregiver is canceled as before');
select is((select status::text from public.shifts where id = md5('assigned-ended-c')::uuid), 'assigned',
          'an assigned shift whose period has ended is history and does not change');
select is((select status::text from public.shifts where id = md5('open-future-a')::uuid), 'open',
          'an open shift with a future start is not touched by the caregiver deletion');
select is((select provider_id from public.shifts where id = md5('assigned-started-c')::uuid), tests.uid('provider_c'),
          'the canceled shift that has started keeps the caregiver who was booked');
select is((select count(*)::int from public.audit_log
            where action = 'shift.canceled' and entity_id = (md5('assigned-started-c')::uuid)::text
              and data ->> 'cause' = 'account_deletion'), 1,
          'the cancellation of the shift that has started is written to the audit log with its cause');

-- The family of each canceled shift is told with the same notice; the deleted caregiver is not, and an ended shift
-- produces no notice.
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('client_a')
              and params ->> 'shift_id' = (md5('assigned-started-c')::uuid)::text), 1,
          'the family of the shift that has started is told, with the shift_canceled_by_deletion notice');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('client_b')
              and params ->> 'shift_id' = (md5('assigned-future-c')::uuid)::text), 1,
          'the family of the future assigned shift is told, as before');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('provider_c')), 0,
          'the deleted caregiver is not told');
select is((select count(*)::int from public.notifications
            where params ->> 'shift_id' = (md5('assigned-ended-c')::uuid)::text), 0,
          'the assigned shift whose period has ended produces no notice');

-- ================================================================ family A leaves
-- The shift of family A that has started is canceled from the family side, and its caregiver is told. The shift of
-- family A whose period has ended is not touched, and the open shift with a future start is canceled as before.
select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('client_a')), 2,
          'the family account cancels the assigned shift of its household that has started and its open shift with a future start');
select tests.clear_authentication();

select is((select status::text from public.shifts where id = md5('assigned-started-a')::uuid), 'canceled',
          'the family side cancels an assigned shift of its household that has started and has not ended');
select is((select status::text from public.shifts where id = md5('open-future-a')::uuid), 'canceled',
          'an open shift of the household with a future start is canceled as before');
select is((select status::text from public.shifts where id = md5('assigned-ended-a')::uuid), 'assigned',
          'an assigned shift of the household whose period has ended is history and does not change');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('provider_d')
              and params ->> 'shift_id' = (md5('assigned-started-a')::uuid)::text), 1,
          'the caregiver of the shift that has started is told, with the same notice');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('client_a')
              and params ->> 'shift_id' = (md5('assigned-started-a')::uuid)::text), 0,
          'the deleted family account is not told about the shift');
select is((select count(*)::int from public.notifications
            where params ->> 'shift_id' = (md5('assigned-ended-a')::uuid)::text), 0,
          'the assigned shift of the household whose period has ended produces no notice');

-- ================================================================ a second run finds nothing left
select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('provider_c')), 0,
          'a second run for the caregiver cancels nothing; the shift whose period has ended does not count');
select is(public.cancel_shifts_for_user_deletion(tests.uid('client_a')), 0,
          'a second run for the family cancels nothing');
select tests.clear_authentication();

select * from finish();
rollback;
