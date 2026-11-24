-- Free-text reasons (migrations 20261109100002 and 20261109100003): a reason has at most 500
-- characters, the audit log keeps no reason text (the booking history keeps it), and an app
-- user cannot write audit entries at all.
begin;
select plan(13);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;
insert into ids values
  ('booking', tests.make_booking('provider_a', 'client_b', 't-reparo', tests.sp_period('2030-08-01 09:00'), 'requested')),
  ('booking2', tests.make_booking('provider_a', 'client_b', 't-reparo', tests.sp_period('2030-08-08 09:00'), 'accepted'));

-- ================================================================ transitions (admin: any transition, with a reason)
select tests.authenticate_as('admin');
select throws_ok($$select public.transition_booking((select id from ids where name = 'booking'), 'canceled', repeat('a', 501))$$,
                 'P0001', 'not_allowed', 'a booking reason longer than 500 characters is refused');
select lives_ok($$select public.transition_booking((select id from ids where name = 'booking'), 'canceled', repeat('b', 500))$$,
                'a booking reason of exactly 500 characters is accepted');
select lives_ok($$select public.transition_booking((select id from ids where name = 'booking2'), 'canceled', 'Motivo PRIVTEST-9c2e')$$,
                'a short booking reason is accepted');
select tests.clear_authentication();

-- ================================================================ audit text and booking history
select is((select count(*)::int from public.audit_log
            where action = 'booking.transition' and entity_id = (select id from ids where name = 'booking2')::text
              and data::text like '%PRIVTEST%'), 0,
          'the audit log of a booking transition keeps no reason text');
select is((select data ? 'reason' from public.audit_log
            where action = 'booking.transition' and entity_id = (select id from ids where name = 'booking2')::text
            order by id desc limit 1), false,
          'the audit entry of a transition has no reason key');
select is((select data ->> 'to' from public.audit_log
            where action = 'booking.transition' and entity_id = (select id from ids where name = 'booking2')::text
            order by id desc limit 1), 'canceled',
          'the rest of the transition entry is kept');
select is((select count(*)::int from public.booking_events
            where booking_id = (select id from ids where name = 'booking2') and reason = 'Motivo PRIVTEST-9c2e'), 1,
          'the reason stays in the booking history');

-- the history table refuses a longer reason, whoever writes it
select throws_ok($$insert into public.booking_events (booking_id, to_status, reason)
                   values ((select id from ids where name = 'booking2'), 'paid', repeat('c', 501))$$,
                 '23514', null, 'the booking history refuses a reason longer than 500 characters');
select lives_ok($$insert into public.booking_events (booking_id, to_status, reason)
                   values ((select id from ids where name = 'booking2'), 'paid', repeat('c', 500))$$,
                'the booking history accepts a reason of 500 characters');

-- ================================================================ shifts
select ok(position('''reason'', p_reason' in pg_get_functiondef('public.cancel_shift(uuid, text)'::regprocedure)) = 0,
          'cancel_shift writes no reason text into the audit log');
select tests.authenticate_as('client_a');
select throws_ok($$select public.cancel_shift(gen_random_uuid(), repeat('d', 501))$$, 'P0001', 'not_allowed',
                 'a shift cancellation reason longer than 500 characters is refused');

-- ================================================================ app users cannot write audit entries
select throws_ok($$select public.log_event('client.account_viewed', 'profile', auth.uid()::text, '{"screen": "conta"}')$$,
                 '42501', null, 'an app user cannot write audit entries through log_event');
select tests.clear_authentication();

select * from finish();
rollback;
