-- Cross-cutting checks: RLS on every table, no open write policies, minimal grants,
-- pinned search_path on security definer functions, and the read/write matrix of the
-- provider-owned tables for every role.
begin;
select plan(38);
select tests.setup_fixture();

-- ================================================================ schema-wide rules
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity),
  '{}'::text[], 'every table in public has RLS enabled');

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid)),
  '{}'::text[], 'every table in public has at least one explicit policy');

select is(
  (select coalesce(array_agg(tablename || ':' || policyname order by tablename), '{}')
     from pg_policies
    where schemaname in ('public', 'storage') and cmd <> 'SELECT'
      and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')),
  '{}'::text[], 'no write policy is open with using (true)');

select is(
  (select coalesce(array_agg(table_name::text || ':' || privilege_type::text order by table_name::text), '{}')
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon' and privilege_type <> 'SELECT'),
  '{}'::text[], 'anon has no write privilege on any table or view');

select is(
  (select coalesce(array_agg(table_name::text order by table_name::text), '{}')
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'),
  array['areas', 'neighborhoods', 'occupation_policies', 'occupations', 'platform_settings'],
  'anon reads only the public catalog tables');

select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
     from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg where cfg like 'search_path=%')),
  '{}'::text[], 'every security definer function pins search_path');

select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname not in ('is_admin', 'is_provider_approved', 'search_providers', 'get_provider_page',
                            'available_slots', 'get_quote_by_token', 'respond_quote')),
  '{}'::text[], 'anon executes only the public RPCs');

select is(
  (select coalesce(array_agg(p.proname::text order by 1), '{}')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('claim_notifications', 'anonymize_user', 'store_provider_payment_secret',
                        'get_provider_payment_secret')
      and has_function_privilege('authenticated', p.oid, 'execute')),
  '{}'::text[], 'service-role RPCs are not executable by users');

-- ================================================================ provider-owned tables
-- Data for provider A in every table, created as the test session.
insert into public.availability (provider_id, weekday, start_time, end_time) values (tests.uid('provider_a'), 2, '08:00', '12:00');
insert into public.time_off (provider_id, period) values (tests.uid('provider_a'), tests.sp_period('2030-12-24 00:00', 48));
insert into public.provider_clients (provider_id, name) values (tests.uid('provider_a'), 'Cliente particular');
insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit)
values (tests.uid('provider_a'), 't-reparo', 'Reparo', 8000, 'hora');

create temp table owned (tbl text primary key);
insert into owned values ('availability'), ('time_off'), ('provider_clients'), ('services'), ('provider_neighborhoods');
grant select on owned to authenticated, anon;

create function pg_temp.visible(p_table text)
returns int
language plpgsql
as $$
declare
  v int;
begin
  execute format('select count(*) from public.%I where provider_id = %L', p_table, tests.uid('provider_a')) into v;
  return v;
end;
$$;

select tests.authenticate_as('provider_a');
select ok(pg_temp.visible(tbl) > 0, 'provider A reads own ' || tbl) from owned order by tbl;
select lives_ok($$insert into public.provider_neighborhoods (provider_id, neighborhood_id)
                  values (auth.uid(), tests.neighborhood('t-bairro-3'))$$, 'provider A adds a neighborhood');
select lives_ok($$update public.provider_clients set notes = 'Prefere manhã' where provider_id = auth.uid()$$,
                'provider A edits the own CRM');
select lives_ok($$delete from public.time_off where provider_id = auth.uid()$$, 'provider A deletes own time off');

select tests.authenticate_as('provider_b');
select is(pg_temp.visible(tbl), 0, 'provider B cannot read ' || tbl || ' of provider A') from owned order by tbl;
select throws_ok(format($$insert into public.provider_neighborhoods (provider_id, neighborhood_id) values (%L, %L)$$,
                        tests.uid('provider_a'), tests.neighborhood('t-bairro-2')),
                 '42501', null, 'provider B cannot write the neighborhoods of provider A');
select throws_ok(format($$insert into public.provider_clients (provider_id, name) values (%L, 'X')$$, tests.uid('provider_a')),
                 '42501', null, 'provider B cannot write the CRM of provider A');
select throws_ok(format($$insert into public.availability (provider_id, weekday, start_time, end_time) values (%L, 1, '08:00', '09:00')$$,
                        tests.uid('provider_a')),
                 '42501', null, 'provider B cannot write the availability of provider A');

select tests.authenticate_as('client_a');
select is(pg_temp.visible(tbl), 0, 'a client cannot read ' || tbl || ' of provider A') from owned order by tbl;

select tests.authenticate_as('admin');
select ok(pg_temp.visible(tbl) > 0, 'admin reads ' || tbl) from owned where tbl <> 'time_off' order by tbl;

select tests.authenticate_anon();
select throws_ok(format('select * from public.%I', tbl), '42501', null, 'anon cannot read ' || tbl) from owned order by tbl;

select * from finish();
rollback;
