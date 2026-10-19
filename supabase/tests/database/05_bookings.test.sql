-- Bookings: labor lock (week, time zone, limits), overlap exclusion, transition matrix
-- per role, blocked direct status updates, commission, direct and own bookings, free
-- slots and RLS.
begin;
select plan(66);
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ labor lock
-- ISO week of Monday 2030-01-07 .. Sunday 2030-01-13, São Paulo time.
insert into ids values
  ('lock_mon', tests.make_booking('provider_a', 'client_a', 't-domestica', tests.sp_period('2030-01-07 09:00'))),
  ('lock_wed', tests.make_booking('provider_a', 'client_a', 't-domestica', tests.sp_period('2030-01-09 09:00')));
select pass('two days in the same week for the same client are allowed');
select lives_ok($$select tests.make_booking('provider_a', 'client_a', 't-domestica', tests.sp_period('2030-01-07 14:00'))$$,
                'a second job on a day already counted is allowed');
select throws_ok($$select tests.make_booking('provider_a', 'client_a', 't-domestica', tests.sp_period('2030-01-11 09:00'))$$,
                 'P0001', 'labor_lock', 'a third day in the same ISO week is refused');
-- Sunday 23:00 in São Paulo is already Monday in UTC: it still belongs to the first week.
select throws_ok($$select tests.make_booking('provider_a', 'client_a', 't-domestica', tests.sp_period('2030-01-13 23:00', 1))$$,
                 'P0001', 'labor_lock', 'the week is computed in America/Sao_Paulo, not UTC');
select lives_ok($$select tests.make_booking('provider_a', 'client_a', 't-domestica', tests.sp_period('2030-01-14 09:00'))$$,
                'the next ISO week starts a new count');
select lives_ok($$select tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-01-11 09:00'))$$,
                'another client has an own count');
select lives_ok($$select tests.make_booking('provider_a', 'client_a', 't-reparo', tests.sp_period('2030-01-10 09:00'))$$,
                'occupations without labor_lock are not counted');
update public.bookings set status = 'canceled' where id = (select id from ids where name = 'lock_wed');
select lives_ok($$select tests.make_booking('provider_a', 'client_a', 't-domestica', tests.sp_period('2030-01-12 09:00'))$$,
                'a canceled job frees its day');
select throws_ok($$update public.bookings set status = 'accepted' where id = (select id from ids where name = 'lock_wed')$$,
                 'P0001', 'labor_lock', 'reactivating a canceled job is checked again');

-- ================================================================ overlap
insert into ids values
  ('overlap', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-03-04 10:00')));
select throws_ok($$select tests.make_booking('provider_c', 'client_b', 't-reparo', tests.sp_period('2030-03-04 11:00'))$$,
                 '23P01', null, 'active bookings of a provider cannot overlap');
select lives_ok($$select tests.make_booking('provider_c', 'client_b', 't-reparo', tests.sp_period('2030-03-04 11:00'), 'canceled')$$,
                'a canceled booking does not block the slot');
select lives_ok($$select tests.make_booking('provider_d', 'client_b', 't-reparo', tests.sp_period('2030-03-04 11:00'))$$,
                'another provider may work at the same time');

-- ================================================================ transitions
insert into ids values
  ('t1', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-04-01 09:00'), 'requested')),
  ('t2', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-04-02 09:00'), 'accepted')),
  ('t3', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-04-03 09:00'), 'accepted')),
  ('t_recent', tests.make_booking('provider_c', 'client_a', 't-reparo',
                                  tstzrange(now() - interval '3 days 2 hours', now() - interval '3 days'), 'completed')),
  ('t_old', tests.make_booking('provider_c', 'client_a', 't-reparo',
                               tstzrange(now() - interval '10 days 2 hours', now() - interval '10 days'), 'completed')),
  ('t_srv', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-04-04 09:00'), 'requested'));

select tests.authenticate_as('client_a');
select throws_ok($$select public.transition_booking((select id from ids where name = 't1'), 'accepted')$$,
                 'P0001', 'invalid_transition', 'client: requested -> accepted is forbidden');
select throws_ok($$update public.bookings set status = 'canceled' where id = (select id from ids where name = 't1')$$,
                 'P0001', 'not_allowed', 'direct status update is blocked for the client');
select tests.authenticate_as('client_b');
select throws_ok($$select public.transition_booking((select id from ids where name = 't1'), 'canceled')$$,
                 'P0001', 'not_allowed', 'a client outside the booking cannot change it');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.transition_booking((select id from ids where name = 't1'), 'accepted')$$,
                 'P0001', 'not_allowed', 'another provider cannot change it');

select tests.authenticate_as('provider_c');
select throws_ok($$update public.bookings set status = 'accepted' where id = (select id from ids where name = 't1')$$,
                 'P0001', 'not_allowed', 'direct status update is blocked for the provider');
select lives_ok($$update public.bookings set notes = 'Levar escada' where id = (select id from ids where name = 't1')$$,
                'participants may edit notes');
select is(public.transition_booking((select id from ids where name = 't1'), 'accepted')::text, 'accepted',
          'provider: requested -> accepted');
select throws_ok($$select public.transition_booking((select id from ids where name = 't1'), 'completed')$$,
                 'P0001', 'invalid_transition', 'provider: accepted -> completed is forbidden');
select throws_ok($$select public.transition_booking((select id from ids where name = 't1'), 'paid')$$,
                 'P0001', 'invalid_transition', 'provider: accepted -> paid is for the payment webhook only');
select is(public.transition_booking((select id from ids where name = 't1'), 'in_progress')::text, 'in_progress',
          'provider: accepted -> in_progress');
select throws_ok($$select public.transition_booking((select id from ids where name = 't1'), 'released')$$,
                 'P0001', 'invalid_transition', 'provider: in_progress -> released is forbidden');
select is(public.transition_booking((select id from ids where name = 't1'), 'completed')::text, 'completed',
          'provider: in_progress -> completed');
select throws_ok($$select public.transition_booking((select id from ids where name = 't1'), 'released')$$,
                 'P0001', 'invalid_transition', 'provider: completed -> released is the client''s decision');

select tests.authenticate_as('client_a');
select is(public.transition_booking((select id from ids where name = 't1'), 'released')::text, 'released',
          'client: completed -> released');
select is(public.transition_booking((select id from ids where name = 't3'), 'canceled', 'Mudei de ideia')::text, 'canceled',
          'client: accepted -> canceled');
select is(public.transition_booking((select id from ids where name = 't_recent'), 'disputed')::text, 'disputed',
          'client: completed -> disputed within 7 days of the end');
select throws_ok($$select public.transition_booking((select id from ids where name = 't_old'), 'disputed')$$,
                 'P0001', 'invalid_transition', 'client: no dispute more than 7 days after the end');
select throws_ok($$select public.transition_booking((select id from ids where name = 't2'), 'paid')$$,
                 'P0001', 'invalid_transition', 'client: accepted -> paid is forbidden');

select tests.authenticate_service();
select is(public.transition_booking((select id from ids where name = 't2'), 'paid')::text, 'paid',
          'service role: accepted -> paid');
select throws_ok($$select public.transition_booking((select id from ids where name = 't_srv'), 'completed')$$,
                 'P0001', 'invalid_transition', 'service role: requested -> completed is forbidden');
select is(public.transition_booking((select id from ids where name = 't_srv'), 'disputed')::text, 'disputed',
          'service role: any -> disputed');

select tests.authenticate_as('provider_c');
select is(public.transition_booking((select id from ids where name = 't2'), 'in_progress')::text, 'in_progress',
          'provider: paid -> in_progress');

select tests.authenticate_as('admin');
select throws_ok($$select public.transition_booking((select id from ids where name = 't_old'), 'released')$$,
                 'P0001', 'not_allowed', 'admin needs a reason');
select is(public.transition_booking((select id from ids where name = 't_old'), 'released', 'Acordo com as partes')::text,
          'released', 'admin applies any transition with a reason');

select tests.clear_authentication();
select is((select count(*)::int from public.booking_events where booking_id = (select id from ids where name = 't1')), 5,
          'every status (creation and four transitions) is in booking_events');
select is((select reason from public.booking_events where booking_id = (select id from ids where name = 't_old')
            and to_status = 'released'), 'Acordo com as partes', 'the reason is kept in booking_events');
select is((select canceled_reason from public.bookings where id = (select id from ids where name = 't3')), 'Mudei de ideia',
          'the cancel reason is stored');
select ok(exists (select 1 from public.audit_log where entity = 'booking' and action = 'booking.transition'
                   and entity_id = (select id from ids where name = 't1')::text), 'transitions are written to audit_log');

-- ================================================================ commission
insert into ids values
  ('fee_off', tests.make_booking('provider_d', 'client_a', 't-reparo', tests.sp_period('2030-05-06 09:00'))),
  ('fee_reg', tests.make_booking('provider_b', 'client_a', 't-medico', tests.sp_period('2030-05-06 09:00')));
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'fee_off')), 0,
          'no commission while commission_enabled is false');
update public.platform_settings set value = 'true' where key = 'commission_enabled';
insert into ids values
  ('fee_first', tests.make_booking('provider_e', 'client_b', 't-reparo', tests.sp_period('2030-05-07 09:00'), 'accepted', 25000)),
  ('fee_med', tests.make_booking('provider_b', 'client_b', 't-medico', tests.sp_period('2030-05-07 09:00'), 'accepted', 25000));
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'fee_first')), 3000,
          'first job with a platform client: price * 1200 bps');
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'fee_med')), 0,
          'no commission when the policy is not comissao_primeiro_servico');
update public.bookings set status = 'completed' where id = (select id from ids where name = 'fee_first');
insert into ids values
  ('fee_second', tests.make_booking('provider_e', 'client_b', 't-reparo', tests.sp_period('2030-05-08 09:00'), 'accepted', 25000));
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'fee_second')), 0,
          'no commission on the second job with the same client');

select tests.authenticate_as('client_b');
select is(public.compute_platform_fee((select id from ids where name = 'fee_second')), 0,
          'compute_platform_fee agrees for a participant');
select throws_ok($$select public.compute_platform_fee((select id from ids where name = 'fee_off'))$$,
                 'P0001', 'not_allowed', 'compute_platform_fee is not open to outsiders');

-- ================================================================ own clients
select tests.authenticate_as('provider_e');
insert into public.provider_clients (provider_id, name, phone) values (auth.uid(), 'Dona Maria', '5511988887777');
insert into ids select 'maria', id from public.provider_clients where name = 'Dona Maria';
select lives_ok($$insert into ids select 'own', public.create_own_booking(
                    (select id from public.provider_clients where name = 'Dona Maria'), 't-reparo',
                    tests.sp_period('2030-05-09 09:00'), 40000, 'Cliente antiga')$$,
                'provider schedules a job with an own client');
select is((select status::text || '/' || origin::text || '/' || platform_fee_cents from public.bookings
            where id = (select id from ids where name = 'own')), 'accepted/own/0',
          'own booking is accepted, origin own, never charged');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.create_own_booking((select id from ids where name = 'maria'), 't-reparo',
                    tests.sp_period('2030-05-09 13:00'), 100, null)$$,
                 'P0001', 'not_allowed', 'a provider cannot book on another provider''s client');

-- ================================================================ direct booking and free slots
select tests.clear_authentication();
insert into public.availability (provider_id, weekday, start_time, end_time)
values (tests.uid('provider_c'), 1, '08:00', '18:00');
insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit, duration_minutes)
values (tests.uid('provider_c'), 't-reparo', 'Visita técnica', 5000, 'hora', 60);
insert into ids select 'service_c', id from public.services where provider_id = tests.uid('provider_c');
insert into public.time_off (provider_id, period) values (tests.uid('provider_c'), tests.sp_period('2030-03-18 00:00', 24));

select tests.authenticate_as('client_b');
select lives_ok($$insert into ids select 'direct', public.book_direct(tests.uid('provider_c'),
                    (select id from ids where name = 'service_c'), tests.sp_period('2030-03-11 09:00', 1), 'Portão azul')$$,
                'client books inside the availability');
select is((select status::text || '/' || origin::text || '/' || price_cents from public.bookings
            where id = (select id from ids where name = 'direct')), 'requested/platform/5000',
          'direct booking is requested, origin platform, priced by the service');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period('2030-03-11 09:30', 1))$$,
                 'P0001', 'slot_unavailable', 'overlapping a booking is refused');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period('2030-03-11 18:00', 1))$$,
                 'P0001', 'slot_unavailable', 'outside the availability window is refused');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period('2030-03-12 09:00', 1))$$,
                 'P0001', 'slot_unavailable', 'a weekday without availability is refused');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period('2030-03-18 09:00', 1))$$,
                 'P0001', 'slot_unavailable', 'time off is refused');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tstzrange(now() - interval '2 hours', now() - interval '1 hour'))$$,
                 'P0001', 'slot_unavailable', 'a past slot is refused');

select tests.authenticate_anon();
select is(cardinality(public.available_slots(tests.uid('provider_c'), '2030-03-11', 60)), 16,
          'available_slots: 30-minute starts minus the booked hour');
select is(lower((public.available_slots(tests.uid('provider_c'), '2030-03-11', 60))[1]), tests.sp('2030-03-11 08:00'),
          'available_slots starts at the window opening (São Paulo time)');
select is(cardinality(public.available_slots(tests.uid('provider_c'), '2030-03-18', 60)), 0,
          'available_slots is empty on time off');

-- ================================================================ RLS
select throws_ok($$select * from public.bookings$$, '42501', null, 'anon cannot read bookings');
select tests.authenticate_as('client_b');
select is((select count(*)::int from public.bookings where client_id = tests.uid('client_a')), 0,
          'client B cannot read bookings of client A');
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.bookings where provider_id = tests.uid('provider_c')), 0,
          'provider D cannot read bookings of provider C');
select is((select count(*)::int from public.booking_events where booking_id = (select id from ids where name = 't1')), 0,
          'provider D cannot read events of provider C');
select tests.authenticate_as('provider_c');
select is((select full_name from public.profiles where id = tests.uid('client_a')), 'Cliente A',
          'a provider reads the profile of a client they work with');
select tests.authenticate_as('provider_e');
select is((select count(*)::int from public.profiles where id = tests.uid('client_a')), 0,
          'a provider cannot read profiles of other clients');
select tests.authenticate_as('admin');
select ok((select count(*) from public.bookings) >= 20, 'admin reads every booking');

select * from finish();
rollback;
