-- Bookings: labor lock (week, time zone, limits), overlap exclusion, transition matrix
-- per role, blocked direct status updates, commission, direct and own bookings, free
-- slots and RLS.
begin;
select plan(154);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ labor lock
-- ISO week of Monday 2030-01-07 .. Sunday 2030-01-13, São Paulo time.
select lives_ok($$insert into ids values
  ('lock_mon', tests.make_booking('provider_a', 'client_a', 't-domestica', tests.sp_period('2030-01-07 09:00')))$$,
  'the first day of the week is allowed');
select lives_ok($$insert into ids values
  ('lock_wed', tests.make_booking('provider_a', 'client_a', 't-domestica', tests.sp_period('2030-01-09 09:00')))$$,
  'a second day in the same week for the same client is allowed');
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

-- The lock counts São Paulo calendar days, not UTC days: Wednesday 22:00-23:30 in São Paulo is
-- already Thursday in UTC, so a Thursday job is a third day (a UTC count would see two).
select lives_ok($$insert into ids values
  ('wk_mon', tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-02-04 09:00')))$$,
  'week of 2030-02-04: Monday');
select lives_ok($$select tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-02-06 22:00', 1.5))$$,
                'Wednesday 22:00-23:30 in São Paulo');
select throws_ok($$select tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-02-07 09:00'))$$,
                 'P0001', 'labor_lock', 'the day is the São Paulo calendar day (Wednesday night is not Thursday)');
-- A job that ends exactly at midnight does not touch the next day.
select lives_ok($$select tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-02-11 09:00'))$$,
                'week of 2030-02-11: Monday');
select lives_ok($$select tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-02-12 22:00', 2))$$,
                'Tuesday 22:00-00:00 counts one day (Wednesday is not touched)');
select throws_ok($$select tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-02-13 09:00'))$$,
                 'P0001', 'labor_lock', 'Monday + Tuesday + Wednesday is three days');
-- Finished jobs still count (a third day is not freed by completing the first two).
insert into ids values
  ('done_1', tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-02-18 09:00'), 'completed')),
  ('done_2', tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-02-19 09:00'), 'released'));
select throws_ok($$select tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-02-20 09:00'))$$,
                 'P0001', 'labor_lock', 'completed and released jobs count towards the limit');
-- Another provider with the same client has an own count.
select lives_ok($$select tests.make_booking('provider_c', 'client_b', 't-domestica', tests.sp_period('2030-02-20 09:00'))$$,
                'the count is per provider');
-- Moving a job to another day is checked again.
select throws_ok($$update public.bookings set period = tests.sp_period('2030-02-21 09:00')
                    where id = (select id from ids where name = 'wk_mon')$$,
                 'P0001', 'labor_lock', 'moving a job into a week that is full is checked again');
-- The limit is read from the settings at run time.
update public.platform_settings set value = '3' where key = 'labor_lock_days_per_week';
select lives_ok($$select tests.make_booking('provider_a', 'client_b', 't-domestica', tests.sp_period('2030-02-20 09:00'))$$,
                'the limit follows platform_settings');
update public.platform_settings set value = '2' where key = 'labor_lock_days_per_week';

-- Own clients without an account are counted through the CRM entry, whichever RPC creates the job.
select tests.authenticate_as('provider_a');
insert into public.provider_clients (provider_id, name, phone, email) values
  (auth.uid(), 'Dona Rosa', '(11) 90000-5555', null),
  (auth.uid(), 'Rosa (outro cadastro)', '+55 11 90000-5555', null),
  (auth.uid(), 'Outra Rosa', '11 98888-1111', null),
  (auth.uid(), 'Seu Mário', null, 'mario@example.test'),
  (auth.uid(), 'Mário (de novo)', null, ' Mario@Example.test ');
insert into ids select 'rosa1', id from public.provider_clients where name = 'Dona Rosa';
insert into ids select 'rosa2', id from public.provider_clients where name = 'Rosa (outro cadastro)';
insert into ids select 'rosa3', id from public.provider_clients where name = 'Outra Rosa';
insert into ids select 'mario1', id from public.provider_clients where name = 'Seu Mário';
insert into ids select 'mario2', id from public.provider_clients where name = 'Mário (de novo)';
select lives_ok($$select public.create_own_booking((select id from ids where name = 'rosa1'), 't-domestica', tests.sp_period('2030-03-04 09:00'), 100, null)$$,
                'own client: first day');
select lives_ok($$select public.create_own_booking((select id from ids where name = 'rosa1'), 't-domestica', tests.sp_period('2030-03-05 09:00'), 100, null)$$,
                'own client: second day');
select throws_ok($$select public.create_own_booking((select id from ids where name = 'rosa1'), 't-domestica', tests.sp_period('2030-03-06 09:00'), 100, null)$$,
                 'P0001', 'labor_lock', 'own clients are counted through provider_client_id');
select throws_ok($$select public.create_own_booking((select id from ids where name = 'rosa2'), 't-domestica', tests.sp_period('2030-03-06 09:00'), 100, null)$$,
                 'P0001', 'labor_lock', 'a second CRM entry with the same phone (other formatting) is the same employer');
select lives_ok($$select public.create_own_booking((select id from ids where name = 'rosa3'), 't-domestica', tests.sp_period('2030-03-06 09:00'), 100, null)$$,
                'an entry with another phone is another person');
select lives_ok($$select public.create_own_booking((select id from ids where name = 'mario1'), 't-domestica', tests.sp_period('2030-03-11 09:00'), 100, null)$$,
                'e-mail: first day');
select lives_ok($$select public.create_own_booking((select id from ids where name = 'mario1'), 't-domestica', tests.sp_period('2030-03-12 09:00'), 100, null)$$,
                'e-mail: second day');
select throws_ok($$select public.create_own_booking((select id from ids where name = 'mario2'), 't-domestica', tests.sp_period('2030-03-13 09:00'), 100, null)$$,
                 'P0001', 'labor_lock', 'a second CRM entry with the same e-mail is the same employer');
select tests.clear_authentication();

-- The lock also runs on the real client paths: book_direct and accept_proposal.
insert into public.availability (provider_id, weekday, start_time, end_time) values
  (tests.uid('provider_a'), 1, '08:00', '18:00'), (tests.uid('provider_a'), 2, '08:00', '18:00'),
  (tests.uid('provider_a'), 3, '08:00', '18:00');
insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit)
values (tests.uid('provider_a'), 't-domestica', 'Diária de faxina', 15000, 'dia');
insert into ids select 'service_a', id from public.services where provider_id = tests.uid('provider_a') and title = 'Diária de faxina';
select tests.authenticate_as('client_a');
select lives_ok($$select public.book_direct(tests.uid('provider_a'), (select id from ids where name = 'service_a'),
                    tests.sp_period(tests.at(20, 0, '09:00'), 1))$$, 'book_direct: Monday');
select lives_ok($$select public.book_direct(tests.uid('provider_a'), (select id from ids where name = 'service_a'),
                    tests.sp_period(tests.at(20, 1, '09:00'), 1))$$, 'book_direct: Tuesday');
select throws_ok($$select public.book_direct(tests.uid('provider_a'), (select id from ids where name = 'service_a'),
                    tests.sp_period(tests.at(20, 2, '09:00'), 1))$$,
                 'P0001', 'labor_lock', 'book_direct goes through the labor lock');
select tests.clear_authentication();
insert into public.requests (client_id, occupation_slug, neighborhood_id, description)
values (tests.uid('client_a'), 't-domestica', tests.neighborhood('t-bairro-1'), 'Faxina semanal em casa');
insert into public.proposals (request_id, provider_id, price_cents)
select id, tests.uid('provider_a'), 16000 from public.requests where description = 'Faxina semanal em casa';
insert into ids select 'prop_lock', id from public.proposals where price_cents = 16000;
select tests.authenticate_as('client_a');
select throws_ok(format($$select public.accept_proposal(%L, %L)$$, (select id from ids where name = 'prop_lock'),
                        tests.sp_period(tests.at(20, 2, '09:00'), 1)),
                 'P0001', 'labor_lock', 'accept_proposal goes through the labor lock');
select tests.clear_authentication();

-- ================================================================ overlap
insert into ids values
  ('overlap', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-03-04 10:00')));
select throws_ok($$select tests.make_booking('provider_c', 'client_b', 't-reparo', tests.sp_period('2030-03-04 11:00'))$$,
                 '23P01', 'conflicting key value violates exclusion constraint "bookings_no_overlap"',
                 'active bookings of a provider cannot overlap');
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

-- More of the matrix: cancellations, the webhook, refunds, final states, the admin and anon.
insert into ids values
  ('p_req', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-04-08 09:00'), 'requested')),
  ('p_acc', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-04-09 09:00'), 'accepted')),
  ('c_req', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-04-10 09:00'), 'requested')),
  ('paid1', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-04-11 09:00'), 'paid')),
  ('paid2', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-04-12 09:00'), 'paid')),
  ('c_done', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-04-13 09:00'), 'completed'));
select tests.authenticate_as('provider_c');
select is(public.transition_booking((select id from ids where name = 'p_req'), 'canceled')::text, 'canceled',
          'provider: requested -> canceled');
select is(public.transition_booking((select id from ids where name = 'p_acc'), 'canceled')::text, 'canceled',
          'provider: accepted -> canceled');
select throws_ok($$select public.transition_booking((select id from ids where name = 'p_req'), 'accepted')$$,
                 'P0001', 'invalid_transition', 'canceled is final');
select throws_ok($$select public.transition_booking((select id from ids where name = 'c_done'), 'disputed')$$,
                 'P0001', 'invalid_transition', 'provider: completed -> disputed is the client''s right');
select throws_ok($$select public.transition_booking((select id from ids where name = 't1'), 'in_progress')$$,
                 'P0001', 'invalid_transition', 'released is final');
select tests.authenticate_as('client_a');
select is(public.transition_booking((select id from ids where name = 'c_req'), 'canceled')::text, 'canceled',
          'client: requested -> canceled through the RPC');
select throws_ok($$select public.transition_booking((select id from ids where name = 't1'), 'disputed')$$,
                 'P0001', 'invalid_transition', 'client: released -> disputed');
select tests.authenticate_as('client_b');
select throws_ok($$select public.transition_booking((select id from ids where name = 'c_done'), 'disputed')$$,
                 'P0001', 'not_allowed', 'a client cannot dispute the job of another client');
select tests.authenticate_service();
select is(public.transition_booking((select id from ids where name = 'paid1'), 'released')::text, 'released',
          'service role: paid -> released (escrow)');
select is(public.transition_booking((select id from ids where name = 'paid2'), 'canceled')::text, 'canceled',
          'service role: paid -> canceled (refund)');
select throws_ok($$select public.transition_booking((select id from ids where name = 't_srv'), 'disputed')$$,
                 'P0001', 'invalid_transition', 'service role: disputed -> disputed');
select throws_ok($$select public.transition_booking((select id from ids where name = 'p_req'), 'accepted')$$,
                 'P0001', 'invalid_transition', 'service role: canceled -> accepted');
select lives_ok($$update public.bookings set notes = 'ajuste do webhook' where id = (select id from ids where name = 't_srv')$$,
                'the service role may update a booking directly');
select tests.authenticate_as('admin');
select throws_ok($$select public.transition_booking((select id from ids where name = 't_old'), 'canceled', '  ')$$,
                 'P0001', 'not_allowed', 'a blank reason is not a reason');
select throws_ok($$select public.transition_booking((select id from ids where name = 't_old'), 'canceled', '')$$,
                 'P0001', 'not_allowed', 'an empty reason is not a reason');
update public.bookings set status = 'accepted' where id = (select id from ids where name = 't_old');
select tests.authenticate_anon();
select throws_ok($$select public.transition_booking((select id from ids where name = 't2'), 'canceled')$$,
                 '42501', null, 'anon cannot call transition_booking');
select tests.clear_authentication();
select is((select status::text from public.bookings where id = (select id from ids where name = 't_old')), 'released',
          'an admin cannot change the status by a direct update (only through the function)');

-- The dispute window is 7 days after the end of the job. now() is fixed in the transaction.
insert into ids values
  ('d_in', tests.make_booking('provider_c', 'client_a', 't-reparo',
                              tstzrange(now() - interval '7 days 1 hour', now() - interval '6 days 23 hours 59 minutes'), 'completed')),
  ('d_out', tests.make_booking('provider_c', 'client_a', 't-reparo',
                               tstzrange(now() - interval '7 days 2 hours', now() - interval '7 days 1 minute'), 'completed')),
  ('d_long', tests.make_booking('provider_c', 'client_a', 't-reparo',
                                tstzrange(now() - interval '9 days', now() - interval '6 days'), 'completed'));
select tests.authenticate_as('client_a');
select is(public.transition_booking((select id from ids where name = 'd_in'), 'disputed')::text, 'disputed',
          'dispute on the 7th day after the end');
select throws_ok($$select public.transition_booking((select id from ids where name = 'd_out'), 'disputed')$$,
                 'P0001', 'invalid_transition', 'no dispute on the 8th day');
select is(public.transition_booking((select id from ids where name = 'd_long'), 'disputed')::text, 'disputed',
          'the window counts from the end of the job, not from its start');
select tests.clear_authentication();

-- Direct writes: the API roles cannot create jobs, price them or move them.
select tests.authenticate_as('client_a');
select throws_ok(format($$insert into public.bookings (client_id, provider_id, occupation_slug, period, price_cents, status, origin)
                          values (auth.uid(), %L, 't-reparo', tests.sp_period('2030-06-10 09:00'), 1, 'accepted', 'own')$$,
                        tests.uid('provider_c')),
                 '42501', null, 'bookings are created only through the RPCs');
select throws_ok($$update public.bookings set price_cents = 1 where id = (select id from ids where name = 't2')$$,
                 'P0001', 'not_allowed', 'a client cannot change the price');
select throws_ok($$update public.bookings set platform_fee_cents = 1 where id = (select id from ids where name = 't2')$$,
                 'P0001', 'not_allowed', 'a client cannot set the fee');
select throws_ok($$update public.bookings set period = tests.sp_period('2031-01-01 09:00') where id = (select id from ids where name = 't2')$$,
                 'P0001', 'not_allowed', 'a client cannot move the job');
select throws_ok($$insert into public.booking_events (booking_id, from_status, to_status)
                    values ((select id from ids where name = 't2'), 'accepted', 'released')$$,
                 '42501', null, 'users cannot forge booking events');
select ok((select count(*) from public.booking_events where booking_id = (select id from ids where name = 't2')) > 0,
          'a participant reads the events of the own job');
select tests.authenticate_as('provider_c');
select throws_ok($$update public.bookings set origin = 'own' where id = (select id from ids where name = 't2')$$,
                 'P0001', 'not_allowed', 'a provider cannot turn a platform job into an own job');
select throws_ok($$delete from public.bookings where id = (select id from ids where name = 't2')$$,
                 '42501', null, 'bookings are never deleted by users');
select tests.clear_authentication();
select throws_ok($$select tests.make_booking('provider_c', 'provider_c', 't-reparo', tests.sp_period('2030-06-11 09:00'))$$,
                 '23514', 'new row for relation "bookings" violates check constraint "bookings_parties_differ"',
                 'nobody is both sides of a job');

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
  ('fee_unpaid', tests.make_booking('provider_e', 'client_b', 't-reparo', tests.sp_period('2030-05-08 09:00'), 'accepted', 25000));
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'fee_unpaid')), 3000,
          'a finished job nobody paid for in the app does not waive the commission');
select tests.make_payment((select id from ids where name = 'fee_first'), 'received', 25000);
insert into ids values
  ('fee_second', tests.make_booking('provider_e', 'client_b', 't-reparo', tests.sp_period('2030-05-09 11:00'), 'accepted', 25000));
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'fee_second')), 0,
          'no commission once a platform job with this client was completed and paid in the app');
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'fee_unpaid')), 3000,
          'a fee already fixed is not recomputed');

-- The history has to be a platform job: a job of origin own (even a finished, paid one) waives nothing.
insert into ids values
  ('own_hist', tests.make_booking('provider_d', 'client_b', 't-reparo', tests.sp_period('2030-05-10 09:00'), 'completed', 1, 'own'));
select tests.make_payment((select id from ids where name = 'own_hist'), 'received', 1);
insert into ids values
  ('fee_vs_own', tests.make_booking('provider_d', 'client_b', 't-reparo', tests.sp_period('2030-05-10 13:00'), 'accepted', 20000));
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'fee_vs_own')), 2400,
          'a job of origin own never waives the first-service commission');

-- The real paths: requested -> accepted fixes the fee (truncated); paying does not change it.
insert into ids values
  ('f_req', tests.make_booking('provider_d', 'client_a', 't-reparo', tests.sp_period('2030-05-13 09:00'), 'requested', 9999));
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'f_req')), 0,
          'no fee while the job is only requested');
select tests.authenticate_as('provider_d');
select public.transition_booking((select id from ids where name = 'f_req'), 'accepted');
select tests.clear_authentication();
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'f_req')), 1199,
          'the fee is fixed on requested -> accepted and truncated (9999 * 0.12 = 1199.88)');
select tests.authenticate_service();
select public.transition_booking((select id from ids where name = 'f_req'), 'paid');
select tests.clear_authentication();
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'f_req')), 1199,
          'accepted -> paid keeps the fee');
update public.platform_settings set value = '1000' where key = 'commission_bps';
insert into ids values
  ('f_bps', tests.make_booking('provider_e', 'client_a', 't-reparo', tests.sp_period('2030-05-14 09:00'), 'accepted', 10000));
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'f_bps')), 1000,
          'commission_bps is read from the settings at run time');
update public.platform_settings set value = '1200' where key = 'commission_bps';
-- A history kept after an account deletion (client_id null) is still found through the CRM entry.
insert into public.provider_clients (provider_id, name, origin) values (tests.uid('provider_d'), 'Cliente removido', 'platform');
insert into ids select 'crm_gone', id from public.provider_clients where name = 'Cliente removido' and provider_id = tests.uid('provider_d');
insert into public.bookings (client_id, provider_client_id, provider_id, occupation_slug, period, price_cents, status, origin)
values (null, (select id from ids where name = 'crm_gone'), tests.uid('provider_d'), 't-reparo',
        tests.sp_period('2030-05-15 09:00'), 5000, 'released', 'platform');
select tests.make_payment((select id from public.bookings where provider_client_id = (select id from ids where name = 'crm_gone')),
                          'released', 5000);
select is(private.platform_fee(gen_random_uuid(), null, (select id from ids where name = 'crm_gone'), tests.uid('provider_d'),
                               't-reparo', 'platform', 20000), 0,
          'the history is also matched by provider_client_id when client_id is null');
-- accept_proposal with the commission on.
insert into public.requests (client_id, occupation_slug, neighborhood_id, description)
values (tests.uid('client_b'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Torneira nova na cozinha');
insert into public.proposals (request_id, provider_id, price_cents)
select id, tests.uid('provider_c'), 30000 from public.requests where description = 'Torneira nova na cozinha';
insert into ids select 'prop_fee', id from public.proposals where price_cents = 30000;
select tests.authenticate_as('client_b');
select lives_ok(format($$insert into ids select 'fee_prop', public.accept_proposal(%L, %L)$$, (select id from ids where name = 'prop_fee'),
                       tests.sp_period(tests.at(30, 0, '10:00'))), 'client B accepts a proposal with the commission on');
select tests.clear_authentication();
select is((select platform_fee_cents from public.bookings where id = (select id from ids where name = 'fee_prop')), 3600,
          'accept_proposal fixes the fee (30000 * 1200 bps)');
update public.platform_settings set value = 'false' where key = 'commission_enabled';

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
select is((select client_id from public.bookings where id = (select id from ids where name = 'own')), null,
          'an own booking has no platform account on the other side');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.create_own_booking((select id from ids where name = 'maria'), 't-reparo',
                    tests.sp_period('2030-05-09 13:00'), 100, null)$$,
                 'P0001', 'not_allowed', 'a provider cannot book on another provider''s client');

-- ================================================================ direct booking and free slots
select tests.clear_authentication();
-- Dates are relative to today (book_direct refuses past slots): Mondays 40 weeks ahead.
insert into public.availability (provider_id, weekday, start_time, end_time)
values (tests.uid('provider_c'), 1, '08:00', '18:00');
insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit, duration_minutes)
values (tests.uid('provider_c'), 't-reparo', 'Visita técnica', 5000, 'hora', 60);
insert into ids select 'service_c', id from public.services where provider_id = tests.uid('provider_c');
insert into public.time_off (provider_id, period) values (tests.uid('provider_c'), tests.sp_period(tests.at(40, 7, '00:00'), 24));

select tests.authenticate_as('client_b');
select lives_ok($$insert into ids select 'direct', public.book_direct(tests.uid('provider_c'),
                    (select id from ids where name = 'service_c'), tests.sp_period(tests.at(40, 0, '09:00'), 1), 'Portão azul')$$,
                'client books inside the availability');
select is((select status::text || '/' || origin::text || '/' || price_cents from public.bookings
            where id = (select id from ids where name = 'direct')), 'requested/platform/5000',
          'direct booking is requested, origin platform, priced by the service');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period(tests.at(40, 0, '09:30'), 1))$$,
                 'P0001', 'slot_unavailable', 'overlapping a booking is refused');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period(tests.at(40, 0, '18:00'), 1))$$,
                 'P0001', 'slot_unavailable', 'outside the availability window is refused');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period(tests.at(40, 1, '09:00'), 1))$$,
                 'P0001', 'slot_unavailable', 'a weekday without availability is refused');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period(tests.at(40, 7, '09:00'), 1))$$,
                 'P0001', 'slot_unavailable', 'time off is refused');
-- 2020-03-09 was a Monday inside the 08:00-18:00 window: only the "not in the past" rule can refuse it.
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period('2020-03-09 09:00', 1))$$,
                 'P0001', 'slot_unavailable', 'a past slot inside the availability is refused');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period(tests.at(40, 0, '17:00'), 1))$$,
                'a slot ending exactly when the window closes is accepted');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period(tests.at(40, 0, '10:00'), 1))$$,
                'a slot adjacent to an existing booking is accepted');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period(tests.at(40, 0, '13:00'), 1))$$,
                 'P0001', 'booking_limit', 'at most 3 open requests per client and provider');
select throws_ok($$select public.book_direct(tests.uid('provider_a'), (select id from ids where name = 'service_c'),
                    tests.sp_period(tests.at(40, 0, '13:00'), 1))$$,
                 'P0001', 'not_allowed', 'the service has to belong to the provider');

-- an occupation that is not approved cannot be booked directly
select tests.clear_authentication();
update public.provider_occupations set approved = false where provider_id = tests.uid('provider_c');
select tests.authenticate_as('client_a');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period(tests.at(41, 0, '09:00'), 1))$$,
                 'P0001', 'not_allowed', 'an occupation not approved cannot be booked');
select tests.clear_authentication();
update public.provider_occupations set approved = true where provider_id = tests.uid('provider_c');

-- the open-request cap per client
insert into public.bookings (client_id, provider_id, occupation_slug, period, price_cents, status)
select tests.uid('client_a'), tests.uid('provider_d'), 't-reparo',
       tests.sp_period((date '2031-06-02' + g)::text || ' 09:00', 1), 1000, 'requested'
  from generate_series(0, 9) g;
select tests.authenticate_as('client_a');
select throws_ok($$select public.book_direct(tests.uid('provider_c'), (select id from ids where name = 'service_c'),
                    tests.sp_period(tests.at(42, 0, '09:00'), 1))$$,
                 'P0001', 'booking_limit', 'at most 10 open requests per client');

select tests.authenticate_anon();
select is(cardinality(public.available_slots(tests.uid('provider_c'), tests.future_monday(40), 60)), 12,
          'available_slots: 30-minute starts minus the booked hours');
select is(lower((public.available_slots(tests.uid('provider_c'), tests.future_monday(40), 60))[1]),
          tests.sp(tests.at(40, 0, '08:00')), 'available_slots starts at the window opening (São Paulo time)');
select is(cardinality(public.available_slots(tests.uid('provider_c'), tests.future_monday(40) + 7, 60)), 0,
          'available_slots is empty on time off');

-- ================================================================ identity and contact
-- The attack that made any user readable: a draft provider writes the CRM entry of another
-- user and schedules an own job to become that user's "counterpart".
select tests.clear_authentication();
select tests.create_user('attacker', 'Atacante', '5511977770001');
select tests.authenticate_as('attacker');
select is((select count(*)::int from public.profiles where id = tests.uid('provider_a')), 0,
          'before: the attacker cannot read the victim profile');
select lives_ok($$select public.become_provider('Atk', 'atk-audit', 't-domestica')$$, 'the attacker becomes a draft provider');
select throws_ok(format($$insert into public.provider_clients (provider_id, client_id, name) values (auth.uid(), %L, 'x')$$,
                        tests.uid('provider_a')),
                 '42501', null, 'the attacker cannot forge provider_clients.client_id');
insert into public.provider_clients (provider_id, name) values (auth.uid(), 'x');
select lives_ok(format($$insert into ids select 'atk_job', public.create_own_booking(
                        (select id from public.provider_clients where name = 'x'), 't-domestica', %L, 100, null)$$,
                       tests.sp_period('2030-11-04 12:00', 1)),
                'an own job can be created for the attacker''s own entry');
select is((select client_id from public.bookings where id = (select id from ids where name = 'atk_job')), null,
          'the job carries no account of anyone else');
select is((select count(*)::int from public.profiles where id = tests.uid('provider_a')), 0,
          'after: the victim profile is still unreadable');
select is((select count(*)::int from public.providers where id = tests.uid('provider_a')), 0,
          'and so is the victim provider row');
select tests.authenticate_as('provider_a');
select is((select count(*)::int from public.bookings where provider_id = tests.uid('attacker')), 0,
          'the victim sees no fake job');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications where user_id = tests.uid('provider_a')
             and params ->> 'booking_id' = (select id::text from ids where name = 'atk_job')), 0,
          'nothing was queued for the victim');

-- A platform CRM entry (made by the server) is not a base for an "own" job either.
select tests.authenticate_as('provider_c');
select throws_ok($$select public.create_own_booking((select id from public.provider_clients where origin = 'platform' limit 1),
                    't-reparo', tests.sp_period('2030-11-05 12:00', 1), 100, null)$$,
                 'P0001', 'not_allowed', 'an own job needs an entry of origin own');

-- Contact is shared with the real counterpart only: the client gets the provider profile
-- (phone) once the provider accepted; the provider sees who asked from the start.
select tests.clear_authentication();
select tests.create_user('client_z', 'Cliente Z', '5511900000099');
select tests.authenticate_as('client_z');
select lives_ok($$insert into ids select 'direct_z', public.book_direct(tests.uid('provider_c'),
                    (select id from ids where name = 'service_c'), tests.sp_period(tests.at(43, 0, '09:00'), 1))$$,
                'client Z asks provider C for a job');
select is((select count(*)::int from public.profiles where id = tests.uid('provider_c')), 0,
          'a client with only a requested job does not read the provider profile yet');
select is((select count(*)::int from public.providers where id = tests.uid('provider_c')), 1,
          'but reads the provider row (the name for the list of jobs)');
select tests.authenticate_as('provider_c');
select is((select count(*)::int from public.profiles where id = tests.uid('client_z')), 1,
          'the provider reads the profile of the client who asked');
select is(public.transition_booking((select id from ids where name = 'direct_z'), 'accepted')::text, 'accepted',
          'the provider accepts the direct booking');
select tests.authenticate_as('client_z');
select is((select count(*)::int from public.profiles where id = tests.uid('provider_c')), 1,
          'after the acceptance the client reads the provider profile');
select tests.authenticate_as('provider_e');
select is((select count(*)::int from public.profiles where id = tests.uid('client_z')), 0,
          'another provider does not read the client');

-- ================================================================ RLS
select tests.authenticate_anon();
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
select tests.authenticate_as('provider_b');
select is((select count(*)::int from public.profiles where id = tests.uid('client_z')), 0,
          'a provider cannot read profiles of other clients');
select tests.clear_authentication();
create temp table all_bookings as select count(*)::int as n from public.bookings;
grant select on all_bookings to authenticated;
select tests.authenticate_as('admin');
select is((select count(*)::int from public.bookings), (select n from all_bookings), 'admin reads every booking');
select tests.authenticate_as('attacker');
select is((select count(*)::int from public.bookings where provider_id <> auth.uid()), 0,
          'a user with no job of their own reads no job of anyone else');
select tests.clear_authentication();

select * from finish();
rollback;
