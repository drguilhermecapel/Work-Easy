-- Transitions to accepted and the provider's care shifts (transition_booking, 20261118600013): a booking
-- moved to accepted is refused with slot_unavailable when the provider holds a care shift (status assigned
-- or checked in) whose period overlaps it. This covers the admin's reactivation of a canceled booking and the
-- provider's own acceptance of a requested one. A period that only touches the shift is accepted, another
-- target status is not affected, and a refused call writes no row and changes no status.
begin;
select plan(16);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- A household of client B owns the shifts.
insert into public.households (id, owner_id, name) values (md5('h135')::uuid, tests.uid('client_b'), 'Casa de teste');

-- Provider C holds a shift assigned on Monday from 10:00 to 12:00 and a shift checked in on Tuesday from 15:00 to 16:00.
insert into public.shifts (id, household_id, period, rate_cents, status, provider_id) values
  (md5('s135-assigned')::uuid, md5('h135')::uuid, tests.sp_period(tests.at(48, 0, '10:00'), 2), 30000, 'assigned', tests.uid('provider_c')),
  (md5('s135-checked')::uuid, md5('h135')::uuid, tests.sp_period(tests.at(48, 1, '15:00'), 1), 30000, 'checked_in', tests.uid('provider_c'));

-- Bookings of provider C. Each refused call overlaps a shift and no other active booking of the provider, so
-- the refusal can only come from the shift check, not from bookings_no_overlap.
-- Monday: ref_assigned (11:00-13:00) overlaps the assigned shift; touch_before (08:00-10:00) and touch_after
-- (12:00-13:00) only touch it; in_progress (10:00-10:45) is accepted and overlaps it but no other booking.
-- Tuesday: requested_cancel (14:30-15:10) and ref_checked (15:10-15:28) and requested_in_check (15:30-16:30)
-- overlap the checked-in shift (15:00-16:00) without overlapping each other while active.
insert into ids values
  ('ref_assigned', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(48, 0, '11:00'), 2), 'canceled')),
  ('ref_checked', tests.make_booking('provider_c', 'client_a', 't-reparo',
                                     tstzrange(tests.sp(tests.at(48, 1, '15:10')), tests.sp(tests.at(48, 1, '15:28'))), 'canceled')),
  ('touch_after', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(48, 0, '12:00'), 1), 'canceled')),
  ('touch_before', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(48, 0, '08:00'), 2), 'canceled')),
  ('requested_in_check', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(48, 1, '15:30'), 1), 'requested')),
  ('requested_cancel', tests.make_booking('provider_c', 'client_a', 't-reparo',
                                          tstzrange(tests.sp(tests.at(48, 1, '14:30')), tests.sp(tests.at(48, 1, '15:10'))), 'requested')),
  ('in_progress', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(48, 0, '10:00'), 0.75), 'accepted')),
  ('other_provider', tests.make_booking('provider_a', 'client_a', 't-reparo', tests.sp_period(tests.at(48, 0, '11:00'), 2), 'canceled'));

-- ---------------------------------------------------------------- admin reactivation
select tests.authenticate_as('admin');
select throws_ok($$select public.transition_booking((select id from ids where name = 'ref_assigned'), 'accepted', 'Reativação de teste')$$,
                 'P0001', 'slot_unavailable', 'a reactivation inside an assigned shift of the provider is refused');
select throws_ok($$select public.transition_booking((select id from ids where name = 'ref_checked'), 'accepted', 'Reativação de teste')$$,
                 'P0001', 'slot_unavailable', 'a reactivation inside a checked-in shift of the provider is refused');
select is(public.transition_booking((select id from ids where name = 'touch_after'), 'accepted', 'Reativação de teste')::text, 'accepted',
          'a reactivation that starts when the assigned shift ends is accepted');
select is(public.transition_booking((select id from ids where name = 'touch_before'), 'accepted', 'Reativação de teste')::text, 'accepted',
          'a reactivation that ends when the assigned shift starts is accepted');
select is(public.transition_booking((select id from ids where name = 'other_provider'), 'accepted', 'Reativação de teste')::text, 'accepted',
          'a shift of another provider does not block the reactivation');

-- ---------------------------------------------------------------- provider acceptance and other targets
select tests.authenticate_as('provider_c');
select throws_ok($$select public.transition_booking((select id from ids where name = 'requested_in_check'), 'accepted')$$,
                 'P0001', 'slot_unavailable', 'the provider cannot accept a request inside a checked-in shift');
select is(public.transition_booking((select id from ids where name = 'requested_cancel'), 'canceled')::text, 'canceled',
          'a request that overlaps a shift can still be canceled');
select is(public.transition_booking((select id from ids where name = 'in_progress'), 'in_progress')::text, 'in_progress',
          'an accepted booking that overlaps a shift can still start');

-- ---------------------------------------------------------------- refused calls write nothing
select tests.clear_authentication();
select is((select status::text from public.bookings where id = (select id from ids where name = 'ref_assigned')), 'canceled',
          'the refused reactivation keeps the booking canceled');
select is((select status::text from public.bookings where id = (select id from ids where name = 'ref_checked')), 'canceled',
          'the refused reactivation in a checked-in shift keeps the booking canceled');
select is((select status::text from public.bookings where id = (select id from ids where name = 'requested_in_check')), 'requested',
          'the refused acceptance keeps the request requested');
select is((select count(*)::int from public.booking_events where booking_id = (select id from ids where name = 'ref_assigned')), 1,
          'the refused reactivation writes no history row (only the creation)');
select is((select count(*)::int from public.booking_events where booking_id = (select id from ids where name = 'requested_in_check')), 1,
          'the refused acceptance writes no history row (only the creation)');
select ok(not exists (select 1 from public.audit_log where entity = 'booking' and action = 'booking.transition'
                       and entity_id = (select id from ids where name = 'ref_assigned')::text),
          'the refused reactivation writes no transition to audit_log');
select is((select count(*)::int from public.bookings where provider_id = tests.uid('provider_c')), 7,
          'the refused calls wrote no booking row (seven were created, none added)');

select * from finish();
rollback;
