-- Retention purge (public.run_retention_purge): the entry point the daily job calls. It runs the two
-- purges and reports how many rows each one removed. Users cannot run it.
begin;
select plan(14);
select has_function('tests', 'create_user', 'test helpers are installed (run 00_helpers first)');

select has_function('public', 'run_retention_purge', array[]::text[], 'run_retention_purge() exists');
select is(
  (select prorettype::regtype::text from pg_proc where oid = 'public.run_retention_purge()'::regprocedure),
  'jsonb',
  'it returns jsonb'
);
select ok(
  (select prosecdef and proconfig && array['search_path=""']
     from pg_proc where oid = 'public.run_retention_purge()'::regprocedure),
  'it is security definer with an empty search_path'
);
select ok(
  (select p.proacl is not null and not exists (
            select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE')
     from pg_proc p where p.oid = 'public.run_retention_purge()'::regprocedure),
  'PUBLIC has no execute right on it'
);
select ok(
  not has_function_privilege('anon', 'public.run_retention_purge()', 'execute'),
  'anon cannot execute it'
);
select ok(
  not has_function_privilege('authenticated', 'public.run_retention_purge()', 'execute'),
  'authenticated cannot execute it'
);

do $$ begin perform tests.create_user('retention-117-user', 'Usuário de teste'); end; $$;
select tests.authenticate_as('retention-117-user');
select throws_ok(
  'select public.run_retention_purge()', '42501', null,
  'an authenticated user who calls it is refused'
);
select tests.clear_authentication();

-- Access events older than six months are removed and counted; recent ones stay.
insert into public.access_events (user_id, occurred_at, method) values
  ('99999999-9999-4999-8999-999999999901', now() - interval '7 months', 'senha'),
  ('99999999-9999-4999-8999-999999999902', now(), 'senha');
select ok(
  (select (public.run_retention_purge() ->> 'access_events_removed')::bigint >= 1),
  'an access event older than six months is counted as removed'
);
select is(
  (select count(*)::int from public.access_events where user_id = '99999999-9999-4999-8999-999999999901'),
  0,
  'and it is gone'
);
select is(
  (select count(*)::int from public.access_events where user_id = '99999999-9999-4999-8999-999999999902'),
  1,
  'a recent access event stays'
);

select ok(
  (select public.run_retention_purge() ?& array['consent_proofs_removed', 'access_events_removed']),
  'it reports both counts'
);
select ok(
  (select (public.run_retention_purge() ->> 'consent_proofs_removed')::bigint >= 0),
  'the consent proof count is a whole number'
);

-- The daily job: checked only where pg_cron is installed; without it the migration says so and this
-- accepts that state (the local database used by the suite may not have pg_cron).
create function pg_temp.retention_job_state() returns text
language plpgsql
as $$
begin
  if to_regclass('cron.job') is null then return 'pg_cron not installed'; end if;
  if exists (
    select 1 from cron.job
     where jobname = 'retention-purge-daily'
       and schedule = '0 3 * * *'
       and command = 'select public.run_retention_purge()'
  ) then
    return 'scheduled';
  end if;
  return 'not scheduled';
end;
$$;
select ok(
  pg_temp.retention_job_state() in ('scheduled', 'pg_cron not installed'),
  'the daily job is scheduled when pg_cron is installed (a database without pg_cron is accepted)'
);

select * from finish();
rollback;
