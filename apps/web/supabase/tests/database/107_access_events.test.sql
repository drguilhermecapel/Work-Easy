-- Access events (migration 20261110500002): the custom access token hook records the account, the
-- time and the authentication method, and returns the event unchanged. Administrators read the
-- events; ordinary users and anonymous callers do not. The purge removes the events older than six
-- months. The hook is called here as the test session; the authentication service has its own role.
begin;
select plan(20);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

select has_function('public', 'custom_access_token_hook', array['jsonb'], 'the access token hook exists');
select ok((select c.relrowsecurity from pg_class c where c.oid = 'public.access_events'::regclass),
          'RLS is on for the access events');

-- A sign-in of client A: the event comes back unchanged and is recorded.
select is(
  public.custom_access_token_hook(jsonb_build_object('user_id', tests.uid('client_a'), 'claims', '{}'::jsonb,
                                                     'authentication_method', 'password')),
  jsonb_build_object('user_id', tests.uid('client_a'), 'claims', '{}'::jsonb, 'authentication_method', 'password'),
  'the hook returns the event unchanged');
select is((select count(*)::int from public.access_events
            where user_id = tests.uid('client_a') and method = 'password'), 1,
          'the sign-in is recorded with the account and the method');
select ok((select occurred_at >= now() - interval '1 minute' from public.access_events
            where user_id = tests.uid('client_a')),
          'the time of the event is the server time');

-- An event without an account id records nothing and still comes back unchanged.
select is(public.custom_access_token_hook('{"authentication_method": "no-account-method"}'::jsonb),
          '{"authentication_method": "no-account-method"}'::jsonb,
          'an event without an account is returned unchanged');
select is((select count(*)::int from public.access_events where method = 'no-account-method'), 0,
          'an event without an account records nothing');

-- Grants: the authentication service runs the hook; the API roles do not.
select is(has_function_privilege('supabase_auth_admin', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'), true,
          'the authentication service can run the hook');
select is(has_function_privilege('authenticated', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'), false,
          'authenticated cannot run the hook');
select is(has_function_privilege('anon', 'public.custom_access_token_hook(jsonb)', 'EXECUTE'), false,
          'anon cannot run the hook');
select is(has_function_privilege('authenticated', 'private.purge_access_events()', 'EXECUTE'), false,
          'authenticated cannot run the purge');
select has_function('private', 'purge_access_events', 'the purge function exists');

-- Reads: only an administrator reads the events.
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.access_events), 0, 'an ordinary user reads no access events');
select throws_ok($$insert into public.access_events (user_id) values (gen_random_uuid())$$, '42501', null,
                 'an ordinary user cannot write access events');
select throws_ok($$select public.custom_access_token_hook('{}'::jsonb)$$, '42501', null,
                 'an ordinary user cannot call the hook');
select tests.authenticate_anon();
select throws_ok('select count(*) from public.access_events', '42501', null, 'anon cannot read access events');
select tests.authenticate_as('admin');
select ok((select count(*) from public.access_events) >= 1, 'an administrator reads the access events');
select tests.clear_authentication();

-- Purge: an event older than six months goes; the recent ones stay.
insert into public.access_events (user_id, occurred_at, method) values
  (tests.uid('client_a'), now() - interval '7 months', 'password'),
  (tests.uid('client_a'), now() - interval '5 months', 'password');
select private.purge_access_events();
select is((select count(*)::int from public.access_events where occurred_at < now() - interval '6 months'), 0,
          'the purge removes the events older than six months');
select is((select count(*)::int from public.access_events
            where user_id = tests.uid('client_a') and occurred_at >= now() - interval '6 months'), 2,
          'the purge keeps the events of the last six months');

select * from finish();
rollback;
