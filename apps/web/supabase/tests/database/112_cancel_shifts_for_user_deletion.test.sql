-- Account deletion, care shifts: the future shifts of the deleted user are canceled and do not block the
-- deletion; a shift in progress, a past shift and other households' shifts are left as they are. Only the
-- service role can run the function.
begin;
select plan(38);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

select has_function('public', 'cancel_shifts_for_user_deletion', array['uuid'], 'the function exists');
select is(has_function_privilege('authenticated', 'public.cancel_shifts_for_user_deletion(uuid)', 'EXECUTE'), false,
          'authenticated cannot execute it');
select is(has_function_privilege('anon', 'public.cancel_shifts_for_user_deletion(uuid)', 'EXECUTE'), false,
          'anon cannot execute it');
select is(has_function_privilege('service_role', 'public.cancel_shifts_for_user_deletion(uuid)', 'EXECUTE'), true,
          'the service role can execute it');

-- ================================================================ households and shifts
-- Each family owns one household. Future shifts are in week 110; the caregivers are provider C, D and E.
insert into public.households (owner_id, name) values
  (tests.uid('client_a'), 'Casa da família A'),
  (tests.uid('client_b'), 'Casa da família B');
insert into ids select 'house_a', id from public.households where name = 'Casa da família A';
insert into ids select 'house_b', id from public.households where name = 'Casa da família B';

insert into public.shifts (id, household_id, period, rate_cents, status, provider_id) values
  (md5('open-a')::uuid, (select id from ids where name = 'house_a'), tests.sp_period(tests.at(110, 0, '08:00'), 4), 100, 'open', null),
  (md5('offered-a')::uuid, (select id from ids where name = 'house_a'), tests.sp_period(tests.at(110, 0, '14:00'), 4), 100, 'offered', null),
  (md5('assigned-a')::uuid, (select id from ids where name = 'house_a'), tests.sp_period(tests.at(110, 1, '08:00'), 4), 100, 'assigned', tests.uid('provider_c')),
  (md5('assigned-b')::uuid, (select id from ids where name = 'house_b'), tests.sp_period(tests.at(110, 3, '08:00'), 4), 100, 'assigned', tests.uid('provider_c')),
  (md5('unrelated-b')::uuid, (select id from ids where name = 'house_b'), tests.sp_period(tests.at(110, 4, '08:00'), 4), 100, 'assigned', tests.uid('provider_d')),
  (md5('canceled-a')::uuid, (select id from ids where name = 'house_a'), tests.sp_period(tests.at(110, 2, '08:00'), 4), 100, 'canceled', null),
  -- Checked in early: the start is still ahead, but the shift is in progress.
  (md5('in-progress-b')::uuid, (select id from ids where name = 'house_b'),
     tstzrange(now() + interval '1 hour', now() + interval '5 hours'), 100, 'checked_in', tests.uid('provider_e')),
  -- Past shifts: one assigned (never checked in), one completed.
  (md5('past-c')::uuid, (select id from ids where name = 'house_b'),
     tstzrange(now() - interval '3 days', now() - interval '3 days' + interval '4 hours'), 100, 'assigned', tests.uid('provider_c')),
  (md5('completed-a')::uuid, (select id from ids where name = 'house_a'),
     tstzrange(now() - interval '10 days', now() - interval '10 days' + interval '4 hours'), 100, 'completed', tests.uid('provider_c'));

-- The offer of the offered shift is open for provider D.
insert into public.shift_offers (shift_id, provider_id, status) values
  (md5('offered-a')::uuid, tests.uid('provider_d'), 'offered');

-- Offered shifts of the other family, held by the caregiver who leaves: one holds only that caregiver's offer
-- (it goes back to open); the other is also offered to provider D (it stays offered to D).
insert into public.shifts (id, household_id, period, rate_cents, status, provider_id) values
  (md5('solo-b')::uuid, (select id from ids where name = 'house_b'), tests.sp_period(tests.at(111, 0, '08:00'), 4), 100, 'offered', null),
  (md5('shared-b')::uuid, (select id from ids where name = 'house_b'), tests.sp_period(tests.at(111, 1, '08:00'), 4), 100, 'offered', null);
insert into public.shift_offers (shift_id, provider_id, status) values
  (md5('solo-b')::uuid, tests.uid('provider_c'), 'offered'),
  (md5('shared-b')::uuid, tests.uid('provider_c'), 'offered'),
  (md5('shared-b')::uuid, tests.uid('provider_d'), 'offered');

-- ================================================================ permission
select tests.authenticate_as('client_a');
select throws_ok($$select public.cancel_shifts_for_user_deletion(tests.uid('client_a'))$$, '42501', null,
                 'the family cannot run it');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.cancel_shifts_for_user_deletion(tests.uid('provider_c'))$$, '42501', null,
                 'a caregiver cannot run it');
select tests.authenticate_anon();
select throws_ok($$select public.cancel_shifts_for_user_deletion(tests.uid('client_a'))$$, '42501', null,
                 'anon cannot run it');
select tests.clear_authentication();

-- ================================================================ family account
select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('client_a')), 3,
          'the service role cancels the three future shifts of the family: open, offered and assigned');
select tests.clear_authentication();

select is((select status::text from public.shifts where id = md5('open-a')::uuid), 'canceled',
          'an open shift of the family is canceled');
select is((select status::text from public.shifts where id = md5('offered-a')::uuid), 'canceled',
          'an offered shift of the family is canceled');
select is((select status from public.shift_offers where shift_id = md5('offered-a')::uuid and provider_id = tests.uid('provider_d')),
          'expired', 'and the offer open on it expires');
select is((select status::text from public.shifts where id = md5('assigned-a')::uuid), 'canceled',
          'an assigned shift of the family is canceled');
select is((select provider_id from public.shifts where id = md5('assigned-a')::uuid), tests.uid('provider_c'),
          'the canceled shift keeps the caregiver who was booked');
select is((select status::text from public.shifts where id = md5('assigned-b')::uuid), 'assigned',
          'a shift of another family with the same caregiver is not touched');
select is((select status::text from public.shifts where id = md5('unrelated-b')::uuid), 'assigned',
          'a shift of another family with another caregiver is not touched');
select is((select status::text from public.shifts where id = md5('in-progress-b')::uuid), 'checked_in',
          'a shift in progress is not canceled, even though it starts later than now');
select is((select status::text from public.shifts where id = md5('past-c')::uuid), 'assigned',
          'a past shift is not canceled');
select is((select status::text from public.shifts where id = md5('completed-a')::uuid), 'completed',
          'a completed shift is history and stays');
select is((select count(*)::int from public.audit_log
            where action = 'shift.canceled' and entity_id = (md5('assigned-a')::uuid)::text
              and data ->> 'cause' = 'account_deletion'), 1,
          'the cancellation is written to the audit log with its cause');

-- The people left with a canceled shift are told, and the deleted family account is not.
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('provider_c')
              and params ->> 'shift_id' = (md5('assigned-a')::uuid)::text), 1,
          'the caregiver of a canceled shift is told');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('provider_d')
              and params ->> 'shift_id' = (md5('offered-a')::uuid)::text), 1,
          'a caregiver still holding an offer on a canceled shift is told');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('client_a')), 0,
          'the deleted family account is not told');

-- ================================================================ caregiver account
select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('provider_c')), 1,
          'the caregiver account cancels its one future assigned shift left, in another family');
select tests.clear_authentication();
select is((select status::text from public.shifts where id = md5('assigned-b')::uuid), 'canceled',
          'the future shift of the caregiver is canceled');
select is((select status::text from public.shifts where id = md5('past-c')::uuid), 'assigned',
          'the past shift of the caregiver stays as it is');
select is((select status::text from public.shifts where id = md5('in-progress-b')::uuid), 'checked_in',
          'the shift in progress of another caregiver is still checked in');
-- Offers held by the caregiver who left: the shift with no other offer goes back to open, the shared one stays offered.
select is((select status::text from public.shifts where id = md5('solo-b')::uuid), 'open',
          'a shift offered only to the caregiver who left goes back to open');
select is((select status from public.shift_offers where shift_id = md5('solo-b')::uuid and provider_id = tests.uid('provider_c')),
          'expired', 'the offer of the caregiver who left is expired');
select is((select status::text from public.shifts where id = md5('shared-b')::uuid), 'offered',
          'a shift still offered to another caregiver stays offered');
select is((select status from public.shift_offers where shift_id = md5('shared-b')::uuid and provider_id = tests.uid('provider_c')),
          'expired', 'the offer of the caregiver who left is expired on the shared shift too');
select is((select status from public.shift_offers where shift_id = md5('shared-b')::uuid and provider_id = tests.uid('provider_d')),
          'offered', 'and the other caregiver keeps its offer');

-- The family of the canceled caregiver shift is told; the deleted caregiver is not.
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('client_b')
              and params ->> 'shift_id' = (md5('assigned-b')::uuid)::text), 1,
          'the family of a shift canceled by the caregiver deletion is told');
select is((select count(*)::int from public.notifications
            where template = 'shift_canceled_by_deletion' and user_id = tests.uid('provider_c')
              and params ->> 'shift_id' = (md5('assigned-b')::uuid)::text), 0,
          'the deleted caregiver is not told');

-- Running it again finds nothing left to cancel.
select tests.authenticate_service();
select is(public.cancel_shifts_for_user_deletion(tests.uid('client_a')), 0, 'a second run cancels nothing');
select throws_ok($$select public.cancel_shifts_for_user_deletion(gen_random_uuid())$$, 'P0001', 'not_allowed',
                 'an unknown user is refused');
select tests.clear_authentication();

-- Canceled shifts no longer count for the labor lock: the caregiver has no day left in week 110, so two
-- new days fit the limit and a third one does not.
select lives_ok($$insert into public.shifts (household_id, period, rate_cents, status, provider_id) values
  ((select id from ids where name = 'house_b'), tests.sp_period(tests.at(110, 0, '08:00'), 4), 100, 'assigned', tests.uid('provider_c')),
  ((select id from ids where name = 'house_b'), tests.sp_period(tests.at(110, 2, '08:00'), 4), 100, 'assigned', tests.uid('provider_c'))$$,
                'the caregiver takes two days of that week again');
select throws_ok($$insert into public.shifts (household_id, period, rate_cents, status, provider_id)
                   values ((select id from ids where name = 'house_b'), tests.sp_period(tests.at(110, 4, '08:00'), 4), 100,
                           'assigned', tests.uid('provider_c'))$$,
                 'P0001', 'labor_lock', 'a third day in that week is refused');

select * from finish();
rollback;
