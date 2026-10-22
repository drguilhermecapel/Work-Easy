-- The Edge Functions write with the service role. Every guard trigger that runs as the caller
-- has to be able to call its helpers, or the write fails with "permission denied for function".
begin;
select plan(5);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- No trigger function that runs as the caller calls a private/public function the service role cannot execute
select is(
  (select count(*)::int
     from (select distinct p.prosrc
             from pg_trigger t
             join pg_class c on c.oid = t.tgrelid
             join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
             join pg_proc p on p.oid = t.tgfoid
            where not t.tgisinternal and not p.prosecdef) trig
     join pg_proc callee on callee.pronamespace::regnamespace::text in ('private', 'public')
      and trig.prosrc ~ ('(^|[^a-z_])' || callee.pronamespace::regnamespace::text || '\.' || callee.proname || '\(')
    where not has_function_privilege('service_role', callee.oid, 'execute')),
  0, 'the service role can execute every helper the caller-side triggers use');

-- What the subscription functions do: set the plan of a provider as the service role
select tests.authenticate_service();
select lives_ok($$update public.providers set plan = 'pro' where id = tests.uid('provider_a')$$,
                'the service role switches a provider to Pro');
select is((select plan::text from public.providers where id = tests.uid('provider_a')), 'pro', 'and the plan is Pro');
select tests.clear_authentication();

-- An API caller still cannot do the same
select tests.authenticate_as('provider_b');
select throws_ok($$update public.providers set plan = 'pro' where id = auth.uid()$$, 'P0001', 'not_allowed',
                 'a provider cannot give himself the Pro plan through the API');

select * from finish();
rollback;
