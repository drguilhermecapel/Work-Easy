-- Account deletion, care shifts in progress (migration 20261118600007). When a caregiver's account is deleted, a shift
-- in progress (checked_in) is canceled, whether it has started or starts later (a caregiver checks in up to 2 hours
-- early). Its family is told through the same notice as the other cancellations (shift_canceled_by_deletion), and the
-- deleted account is not told. A completed shift does not change. Only the service role can run the function.
begin;
select plan(15);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ families and shifts
insert into public.households (owner_id, name) values
  (tests.uid('client_a'), 'Casa da família A'),
  (tests.uid('client_b'), 'Casa da família B');
insert into ids select 'house_a', id from public.households where name = 'Casa da família A';
insert into ids select 'house_b', id from public.households where name = 'Casa da família B';

insert into public.shifts (id, household_id, period, rate_cents, status, provider_id) values
  -- Caregiver C: a shift in progress that has started, a completed shift, and a future assigned shift in another family.
  (md5('ci-started-c')::uuid, (select id from ids where name = 'house_a'),
     tstzrange(now() - interval '1 hour', now() + interval '3 hours'), 100, 'checked_in', tests.uid('provider_c')),
  (md5('done-c')::uuid, (select id from ids where name = 'house_a'),
     tstzrange(now() - interval '10 days', now() - interval '10 days' + interval '4 hours'), 100, 'completed', tests.uid('provider_c')),
  (md5('assigned-c')::uuid, (select id from ids where name = 'house_b'), tests.sp_period(tests.at(130, 0, '08:00'), 4), 100, 'assigned', tests.uid('provider_c')),
  -- Caregiver E: checked in early, the start is still an hour ahead.
  (md5('ci-early-e')::uuid, (select id from ids where name = 'house_b'),
     tstzrange(now() + interval '1 hour', now() + interval '5 hours'), 100, 'checked_in', tests.uid('provider_e'));

-- ================================================================ caregiver C leaves, a shift in progress has started
select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('provider_c')), 2,
          'the caregiver account cancels the shift in progress and its future shift');
select tests.clear_authentication();

select is((select status::text from public.shifts where id = md5('ci-started-c')::uuid), 'canceled',
          'a shift in progress that has started is canceled');
select is((select status::text from public.shifts where id = md5('assigned-c')::uuid), 'canceled',
          'the future assigned shift of the caregiver is canceled');
select is((select status::text from public.shifts where id = md5('done-c')::uuid), 'completed',
          'a completed shift is history and does not change');
select is((select provider_id from public.shifts where id = md5('ci-started-c')::uuid), tests.uid('provider_c'),
          'the canceled shift in progress keeps the caregiver who checked in');
select is((select count(*)::int from public.audit_log
            where action = 'shift.canceled' and entity_id = (md5('ci-started-c')::uuid)::text
              and data ->> 'cause' = 'account_deletion'), 1,
          'the cancellation of the shift in progress is written to the audit log with its cause');

-- The family gets the same notice as for any other canceled shift; the deleted caregiver does not, and a completed
-- shift produces no notice.
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('client_a')
              and params ->> 'shift_id' = (md5('ci-started-c')::uuid)::text), 1,
          'the family of a shift in progress is told, with the shift_canceled_by_deletion notice');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('client_b')
              and params ->> 'shift_id' = (md5('assigned-c')::uuid)::text), 1,
          'the family of the future shift is told, as before');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('provider_c')), 0,
          'the deleted caregiver is not told');
select is((select count(*)::int from public.notifications
            where params ->> 'shift_id' = (md5('done-c')::uuid)::text), 0,
          'the completed shift produces no notice');

-- ================================================================ caregiver E leaves, a shift checked in early
select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('provider_e')), 1,
          'the caregiver account cancels the shift it checked in early, whose start is still ahead');
select tests.clear_authentication();

select is((select status::text from public.shifts where id = md5('ci-early-e')::uuid), 'canceled',
          'a shift checked in early, before its start, is canceled');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('client_b')
              and params ->> 'shift_id' = (md5('ci-early-e')::uuid)::text), 1,
          'its family is told with the same notice');

-- ================================================================ a second run finds nothing left
select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('provider_c')), 0, 'a second run cancels nothing');
select tests.clear_authentication();

select * from finish();
rollback;
