-- Booking reminders: the sweep that pg_cron runs every 15 minutes queues the 2 h reminder (and
-- the 24 h one when the acceptance trigger did not), once per recipient, booking and offset,
-- only for accepted or paid bookings and only for contacts confirmed by Auth.
-- The sweep takes the current time as a parameter, so every case runs at a chosen instant.
begin;
select plan(34);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);

-- The reminders of one booking (named in ids), optionally of one offset.
create function pg_temp.reminders(p_booking text, p_hours text default null)
returns setof public.notifications
language sql
as $$
  select n.* from public.notifications n
   where n.template = 'lembrete_atendimento'
     and n.params ->> 'booking_id' = (select id from ids where name = p_booking)::text
     and (p_hours is null or n.params ->> 'reminder_hours' = p_hours)
$$;

-- ---------------------------------------------------------------- the job
select has_function('private', 'enqueue_booking_reminders', array['timestamp with time zone'], 'the sweep exists');
select is((select schedule::text from cron.job where jobname = 'workeasy-booking-reminders'), '*/15 * * * *',
          'pg_cron runs the sweep every 15 minutes');
select is((select (command ilike '%vault%')::text from cron.job where jobname = 'workeasy-booking-reminders'), 'false',
          'the job reads no Vault secret: it only fills the outbox');

-- ---------------------------------------------------------------- 24 h: the trigger's reminder is kept, not doubled
insert into ids values ('b1', tests.make_booking('provider_a', 'client_a', 't-reparo', tests.sp_period('2030-07-01 09:00')));
select is((select count(*)::int from pg_temp.reminders('b1')), 2, 'the acceptance trigger queued the 24 h reminders (08)');
select is(private.enqueue_booking_reminders(tests.sp('2030-06-29 12:00')), 0, 'nothing is due more than half an hour ahead');
select is(private.enqueue_booking_reminders(tests.sp('2030-06-30 08:45')), 0, 'a 24 h reminder queued by the trigger is not queued again');
select is((select count(*)::int from pg_temp.reminders('b1')), 2, 'and there are still two');

-- ---------------------------------------------------------------- 2 h
select is(private.enqueue_booking_reminders(tests.sp('2030-07-01 06:45')), 2,
          'the 2 h reminder is queued for the client and the provider');
select is((select count(*)::int from pg_temp.reminders('b1', '2')
            where user_id in (tests.uid('client_a'), tests.uid('provider_a'))), 2, 'one for each of the two');
select is((select scheduled_for from pg_temp.reminders('b1', '2') where user_id = tests.uid('client_a')),
          tests.sp('2030-07-01 07:00'), 'it is scheduled for exactly 2 h before the start');
select is((select scheduled_for from pg_temp.reminders('b1', '2') where user_id = tests.uid('client_a')),
          '2030-07-01 10:00:00+00'::timestamptz, 'São Paulo is UTC-3: 07:00 there is 10:00 UTC, whatever the server zone');
select is((select (params ->> 'starts_at')::timestamptz from pg_temp.reminders('b1', '2') where user_id = tests.uid('client_a')),
          tests.sp('2030-07-01 09:00'), 'it carries the start of the booking, which the dispatcher shows in São Paulo time');
select is((select params ->> 'provider_name' from pg_temp.reminders('b1', '2') where user_id = tests.uid('client_a')),
          'Ana Teste', 'and the provider name the template uses');
select is((select channel::text || '/' || phone from pg_temp.reminders('b1', '2') where user_id = tests.uid('client_a')),
          'whatsapp/5511900000001', 'a confirmed phone receives WhatsApp');
select is(private.enqueue_booking_reminders(tests.sp('2030-07-01 06:45')), 0, 'a second run at the same time queues nothing');
select is(private.enqueue_booking_reminders(tests.sp('2030-07-01 07:10')), 0, 'nor a later run, once the moment has passed');
select is((select count(*)::int from pg_temp.reminders('b1')), 4, 'one 24 h and one 2 h reminder for each of the two parties');

-- ---------------------------------------------------------------- 24 h: the sweep as a safety net
insert into ids values ('b2', tests.make_booking('provider_b', 'client_b', 't-reparo', tests.sp_period('2030-07-02 15:00')));
delete from public.notifications
 where template = 'lembrete_atendimento' and params ->> 'booking_id' = (select id from ids where name = 'b2')::text;
select is(private.enqueue_booking_reminders(tests.sp('2030-07-01 15:10')), 2,
          'without the trigger''s reminder, the sweep queues the 24 h one');
select is((select scheduled_for from pg_temp.reminders('b2', '24') where user_id = tests.uid('client_b')),
          tests.sp('2030-07-01 15:10'), 'a moment missed by 10 minutes is sent right away');
select is((select channel::text || '/' || email from pg_temp.reminders('b2', '24') where user_id = tests.uid('client_b')),
          'email/client_b@test.local', 'a client with only a confirmed e-mail gets e-mail');

-- ---------------------------------------------------------------- too late, accepted after the moment, not active
insert into ids values ('b3', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-07-03 15:00')));
select is(private.enqueue_booking_reminders(tests.sp('2030-07-03 13:40')), 0, 'a moment missed by more than 30 minutes is dropped');

insert into ids values ('b4', tests.make_booking('provider_d', 'client_b', 't-reparo', tests.sp_period('2030-07-04 10:00')));
update public.booking_events set at = tests.sp('2030-07-04 08:10')
 where booking_id = (select id from ids where name = 'b4') and to_status = 'accepted';
select is(private.enqueue_booking_reminders(tests.sp('2030-07-04 08:20')), 0,
          'a booking accepted after the moment gets no reminder: the confirmation was it');

insert into ids values
  ('b5', tests.make_booking('provider_e', 'client_a', 't-reparo', tests.sp_period('2030-07-05 09:00'), 'canceled')),
  ('b6', tests.make_booking('provider_a', 'client_b', 't-reparo', tests.sp_period('2030-07-05 09:00'), 'requested')),
  ('b7', tests.make_booking('provider_d', 'client_a', 't-reparo', tests.sp_period('2030-07-05 09:00'), 'in_progress')),
  ('b8', tests.make_booking('provider_c', 'client_b', 't-reparo', tests.sp_period('2030-07-05 09:00'), 'completed'));
select is(private.enqueue_booking_reminders(tests.sp('2030-07-05 06:45')), 0,
          'canceled, requested, started and completed bookings get no reminder');

-- ---------------------------------------------------------------- paid, then canceled
insert into ids values ('b9', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-07-06 09:00'), 'paid'));
select is(private.enqueue_booking_reminders(tests.sp('2030-07-06 06:45')), 2, 'a paid booking is reminded too');
update public.bookings set status = 'canceled' where id = (select id from ids where name = 'b9');
select is((select count(*)::int from pg_temp.reminders('b9', '2') where status = 'skipped'), 2,
          'canceling skips the reminders the sweep queued');
select is(private.enqueue_booking_reminders(tests.sp('2030-07-06 06:50')), 0, 'and the sweep does not queue them again');

-- ---------------------------------------------------------------- confirmed contacts only
select tests.create_user('u_unverified', 'U Unverified');
update auth.users set email_confirmed_at = null where email = 'u_unverified@test.local';
update public.profiles set phone = '5511977778888' where id = tests.uid('u_unverified');
insert into ids values ('b10', tests.make_booking('provider_d', 'u_unverified', 't-reparo', tests.sp_period('2030-07-07 09:00')));
select is(private.enqueue_booking_reminders(tests.sp('2030-07-07 06:45')), 1,
          'only the provider is reminded when the client has no confirmed contact');
select is((select count(*)::int from pg_temp.reminders('b10') where user_id = tests.uid('u_unverified')), 0,
          'a phone typed in the profile is never used');

-- A provider's own client has no account: nobody to message but the provider.
with n as (
  insert into public.bookings (client_id, provider_id, occupation_slug, period, price_cents, status, origin)
  values (null, tests.uid('provider_e'), 't-reparo', tests.sp_period('2030-07-08 09:00'), 10000, 'accepted', 'own')
  returning id)
insert into ids select 'b11', id from n;
select is(private.enqueue_booking_reminders(tests.sp('2030-07-08 06:45')), 1, 'an own booking reminds the provider only');

-- ---------------------------------------------------------------- dedupe key and privileges
select throws_ok(
  format($$insert into public.notifications (user_id, channel, template, params)
           values (%L, 'email', 'lembrete_atendimento', jsonb_build_object('booking_id', %L, 'reminder_hours', 2))$$,
         tests.uid('client_a'), (select id from ids where name = 'b1')),
  '23505', null, 'the database refuses a second 2 h reminder for the same user and booking');

select tests.authenticate_as('client_a');
select throws_ok($$select private.enqueue_booking_reminders()$$, '42501', null, 'users cannot run the sweep');
select tests.authenticate_anon();
select throws_ok($$select private.enqueue_booking_reminders()$$, '42501', null, 'anon cannot run the sweep');
select tests.authenticate_service();
select throws_ok($$select private.enqueue_booking_reminders()$$, '42501', null, 'nor the service role: only the scheduler runs it');
select tests.clear_authentication();

select * from finish();
rollback;
