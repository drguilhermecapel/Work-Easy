-- Assistant quota: a window of 60 minutes per user, not the UTC clock hour. take_assist_quota
-- counts the granted calls of the last 60 minutes in assist_usage_events. The events are written here with
-- timestamps relative to now(), so the checks hold whatever the time of the run.
begin;
select plan(21);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- ---------------------------------------------------------------- storage and access
select has_table('public', 'assist_usage_events', 'the assistant keeps one event per granted call');
select is((select count(*)::int from pg_indexes where schemaname = 'public' and tablename = 'assist_usage_events'
            and indexdef like '%(user_id, used_at)%'), 1, 'the events are indexed by user and time');
select is((select c.relrowsecurity from pg_class c where c.oid = 'public.assist_usage_events'::regclass), true,
          'RLS is on for assist_usage_events');
select is((select count(*)::int from pg_policy where polrelid = 'public.assist_usage_events'::regclass), 0,
          'and there is no policy: users never touch the events');

select tests.authenticate_as('client_a');
select throws_ok($$select * from public.assist_usage_events$$, '42501', null, 'a user cannot read the events');
select throws_ok(format($$insert into public.assist_usage_events (user_id) values (%L)$$, tests.uid('client_a')),
                 '42501', null, 'nor insert one (that would be a fresh quota)');
select tests.clear_authentication();

-- ---------------------------------------------------------------- the window
-- Two calls, 59 and 1 minute ago, fill a limit of 2. The first one is in the previous clock hour for every
-- minute of the hour except the last, which is the case the hour counter got wrong.
insert into public.assist_usage_events (user_id, used_at) values
  (tests.uid('provider_a'), now() - interval '59 minutes'),
  (tests.uid('provider_a'), now() - interval '1 minute');
select tests.authenticate_service();
select is(public.take_assist_quota(tests.uid('provider_a'), 2), false,
          'two calls in the last 60 minutes fill a limit of 2, across the clock hour');
select is(public.take_assist_quota(tests.uid('provider_a'), 3), true, 'raising the limit to 3 grants one more');
select is(public.take_assist_quota(tests.uid('provider_a'), 3), false, 'and the window is full again at 3');
select tests.clear_authentication();
select is((select count(*)::int from public.assist_usage_events where user_id = tests.uid('provider_a')), 3,
          'a refused call writes no event: the window keeps the three granted calls');

-- A call older than the window stops counting; the call granted now counts again.
insert into public.assist_usage_events (user_id, used_at) values (tests.uid('provider_b'), now() - interval '61 minutes');
select tests.authenticate_service();
select is(public.take_assist_quota(tests.uid('provider_b'), 1), true, 'a call from 61 minutes ago does not count');
select is(public.take_assist_quota(tests.uid('provider_b'), 1), false, 'the call just granted does');

-- ---------------------------------------------------------------- cleanup
-- The next call of a user drops the events older than two hours. The one of 90 minutes is still inside
-- the two hours, so it stays; it is outside the window, so it does not count.
insert into public.assist_usage_events (user_id, used_at) values
  (tests.uid('provider_c'), now() - interval '3 hours'),
  (tests.uid('provider_c'), now() - interval '90 minutes');
select is(public.take_assist_quota(tests.uid('provider_c'), 1), true, 'the 90-minute call does not fill a limit of 1');
select tests.clear_authentication();
select is((select count(*)::int from public.assist_usage_events where user_id = tests.uid('provider_c')), 2,
          'the call dropped the event of three hours ago and kept its own and the one of 90 minutes');
select is((select count(*)::int from public.assist_usage_events where user_id = tests.uid('provider_c')
              and used_at = now() - interval '90 minutes'), 1, 'the event of 90 minutes is the one that stays');

-- ---------------------------------------------------------------- limits and users
select tests.authenticate_service();
select is(public.take_assist_quota(tests.uid('provider_d'), 0), false, 'a limit of 0 turns the assistant off');
select is(public.take_assist_quota(null, 5), false, 'a null user is refused');
select is(public.take_assist_quota(tests.uid('provider_e'), 1), true,
          'another user has a window of its own, while provider A is at its limit');
select tests.clear_authentication();
select is((select count(*)::int from public.assist_usage_events where user_id = tests.uid('provider_d')), 0,
          'a limit of 0 writes no event');
select is((select count(*)::int from public.assist_usage_events where user_id = tests.uid('provider_e')), 1,
          'the granted call of the other user is recorded for that user only');

select * from finish();
rollback;
