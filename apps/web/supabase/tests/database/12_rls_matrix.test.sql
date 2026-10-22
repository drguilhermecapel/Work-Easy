-- Cross-cutting checks: RLS on every table, no open write policies, minimal grants,
-- pinned search_path on security definer functions, security_invoker views, and the
-- read/write matrix of the provider-owned tables for every role (anon, client, another
-- client, provider, another provider, admin). Domain files test the rules of each domain.
begin;
select plan(74);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
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
  array['assist_usage'],
  'every table in public has at least one explicit policy, except the deny-all service-role counter assist_usage');

-- assist_usage is the one table with RLS and no policy on purpose: only take_assist_quota() touches it.
select is(
  (select coalesce(array_agg(r.rolname || ':' || pr.p order by r.rolname, pr.p), '{}')
     from (values ('anon'), ('authenticated')) r(rolname)
     cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) pr(p)
    where has_table_privilege(r.rolname, 'public.assist_usage', pr.p)),
  '{}'::text[], 'assist_usage has no grant for anon or authenticated');

-- A write policy has to tie the row to the caller (auth.uid()), to the admin role or to a
-- ownership helper; 'true', '1 = 1' or auth.role() = 'authenticated' would open it to everyone.
select is(
  (select coalesce(array_agg(tablename || ':' || policyname order by tablename, policyname), '{}')
     from pg_policies
    where schemaname in ('public', 'storage') and cmd <> 'SELECT'
      and ((cmd = 'INSERT' and coalesce(with_check, '') !~ '(uid\(\)|is_admin|owns_)')
        or (cmd in ('UPDATE', 'DELETE', 'ALL') and coalesce(qual, '') !~ '(uid\(\)|is_admin|owns_)')
        or (cmd in ('UPDATE', 'ALL') and with_check is not null and with_check !~ '(uid\(\)|is_admin|owns_)'))),
  '{}'::text[], 'no write policy is open: each one is tied to auth.uid(), is_admin() or an ownership helper');

select is(
  (select coalesce(array_agg(table_name::text || ':' || privilege_type::text order by table_name::text), '{}')
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon' and privilege_type <> 'SELECT'),
  '{}'::text[], 'anon has no write privilege on any table or view');

select is(
  (select coalesce(array_agg(c.relname::text || '.' || a.attname::text order by c.relname::text, a.attname::text), '{}')
     from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v')
      and (has_column_privilege('anon', c.oid, a.attnum, 'INSERT') or has_column_privilege('anon', c.oid, a.attnum, 'UPDATE'))),
  '{}'::text[], 'anon has no column-level write grant either');

select is(
  (select coalesce(array_agg(c.relname::text || ':' || r.rolname || ':' || pr.p order by c.relname::text, r.rolname, pr.p), '{}')
     from pg_class c
     cross join (values ('anon'), ('authenticated')) r(rolname)
     cross join (values ('TRUNCATE'), ('TRIGGER'), ('REFERENCES')) pr(p)
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and has_table_privilege(r.rolname, c.oid, pr.p)),
  '{}'::text[], 'no TRUNCATE, TRIGGER or REFERENCES for the API roles (TRUNCATE ignores RLS)');

select is(
  (select coalesce(array_agg(table_name::text order by table_name::text), '{}')
     from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon' and privilege_type = 'SELECT'),
  array['areas', 'neighborhoods', 'occupation_policies', 'occupations', 'platform_settings'],
  'anon reads only the public catalog tables');

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname::text), '{}')
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
      and not coalesce(c.reloptions @> array['security_invoker=true'], false)),
  '{}'::text[], 'every view runs with the rights of the caller (security_invoker)');

select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
     from pg_proc p
    where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
      and p.prosecdef
      and not (p.proconfig && array['search_path=""', 'search_path=pg_catalog, public'])),
  '{}'::text[], 'every security definer function pins search_path to empty (or pg_catalog, public)');

select is(
  (select coalesce(array_agg(p.oid::regprocedure::text order by 1), '{}')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname not in ('is_admin', 'is_provider_approved', 'search_providers', 'get_provider_page', 'slug_available',
                            'available_slots', 'get_quote_by_token', 'respond_quote')),
  '{}'::text[], 'anon executes only the public RPCs');

select is(
  (select coalesce(array_agg(p.proname::text order by 1), '{}')
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('claim_notifications', 'anonymize_user', 'store_provider_payment_secret',
                        'get_provider_payment_secret', 'take_assist_quota')
      and has_function_privilege('authenticated', p.oid, 'execute')),
  '{}'::text[], 'service-role RPCs are not executable by users');

-- The columns of the payments that carry the payer's tax data are not granted to users.
select is(
  (select coalesce(array_agg(a.attname::text order by a.attname::text), '{}')
     from pg_attribute a
    where a.attrelid = 'public.payments'::regclass and a.attnum > 0 and not a.attisdropped
      and has_column_privilege('authenticated', a.attrelid, a.attnum, 'SELECT') and a.attname = 'raw'),
  '{}'::text[], 'authenticated cannot select payments.raw');

-- ================================================================ provider-owned tables
-- Data for provider A in every table, created as the test session.
insert into public.availability (provider_id, weekday, start_time, end_time) values (tests.uid('provider_a'), 2, '08:00', '12:00');
insert into public.time_off (provider_id, period) values (tests.uid('provider_a'), tests.sp_period('2030-12-24 00:00', 48));
insert into public.provider_clients (provider_id, name) values (tests.uid('provider_a'), 'Cliente particular');
insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit)
values (tests.uid('provider_a'), 't-reparo', 'Reparo', 8000, 'hora');
insert into public.quotes (provider_id, title, items, status) values (tests.uid('provider_a'), 'Orçamento A', '[]', 'draft');
insert into public.provider_payment_accounts (provider_id, asaas_account_id, asaas_wallet_id, status)
values (tests.uid('provider_a'), 'acc_a', 'wal_a', 'active');
insert into public.payments (provider_id, payer_id, quote_id, amount_cents, status)
values (tests.uid('provider_a'), null, (select id from public.quotes where title = 'Orçamento A'), 5000, 'received');
insert into storage.objects (bucket_id, name) values ('provider-documents', tests.uid('provider_a') || '/doc.pdf');

create temp table owned (tbl text primary key);
insert into owned values ('availability'), ('time_off'), ('provider_clients'), ('services'), ('provider_neighborhoods'),
                         ('quotes');
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
select is((select wal from (select asaas_wallet_id as wal from public.provider_payment_accounts) x), 'wal_a',
          'provider A reads the own payment account');
select throws_ok($$update public.provider_payment_accounts set asaas_wallet_id = 'wal_x'$$, '42501', null,
                 'provider A cannot change the own payment account');
select is((select count(*)::int from public.payments where quote_id is not null), 1,
          'provider A reads the payment tied to the own quote');
select throws_ok($$delete from public.providers where id = auth.uid()$$, '42501', null, 'a provider row is never deleted through the API');
select throws_ok($$insert into public.providers (id, display_name, slug) values (gen_random_uuid(), 'Ninguém', 'ninguem')$$,
                 '42501', null, 'providers are created only through become_provider()');
select is((select count(*)::int from storage.objects where bucket_id = 'provider-documents'), 1, 'provider A reads the own documents in storage');

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
select throws_ok(format($$insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit)
                          values (%L, 't-reparo', 'X', 1, 'hora')$$, tests.uid('provider_a')),
                 '42501', null, 'provider B cannot create services for provider A');
select throws_ok(format($$insert into public.quotes (provider_id, title) values (%L, 'X')$$, tests.uid('provider_a')),
                 '42501', null, 'provider B cannot create quotes for provider A');
select is((select count(*)::int from public.payments), 0, 'provider B cannot read the payment of provider A');
select is((select count(*)::int from storage.objects where bucket_id = 'provider-documents'), 0,
          'provider B cannot read the documents of provider A in storage');
-- silent writes: the rows are not visible, so nothing is touched
delete from public.time_off where provider_id = tests.uid('provider_a');
delete from public.services where provider_id = tests.uid('provider_a');
delete from public.quotes where provider_id = tests.uid('provider_a');
update public.availability set end_time = '23:00' where provider_id = tests.uid('provider_a');
update public.services set price_min_cents = 1 where provider_id = tests.uid('provider_a');
update public.quotes set title = 'Invadido' where provider_id = tests.uid('provider_a');

select tests.authenticate_as('client_a');
select is(pg_temp.visible(tbl), 0, 'a client cannot read ' || tbl || ' of provider A') from owned order by tbl;
select is((select count(*)::int from public.admins), 0, 'a client cannot read the admins table');
select is((select count(*)::int from storage.objects where bucket_id = 'provider-documents'), 0,
          'a client cannot read provider documents in storage');
select throws_ok($$insert into public.admins (user_id) values (auth.uid())$$, '42501', null, 'a client cannot make himself admin');

select tests.authenticate_as('admin');
select ok(pg_temp.visible(tbl) > 0, 'admin reads ' || tbl) from owned order by tbl;
select is((select count(*)::int from public.admins), 1, 'admin reads the admins table');
select is((select count(*)::int from public.payments where quote_id is not null), 1, 'admin reads the payments');
select is((select count(*)::int from storage.objects where bucket_id = 'provider-documents'), 1, 'admin reads provider documents in storage');

select tests.authenticate_anon();
select throws_ok(format('select * from public.%I', tbl), '42501', null, 'anon cannot read ' || tbl) from owned order by tbl;
select is((select count(*)::int from storage.objects where bucket_id = 'provider-documents'), 0,
          'anon reads no provider document in storage');

-- what the silent writes of provider B changed (nothing), then provider A's own deletes
select tests.clear_authentication();
select is((select count(*)::int from public.time_off where provider_id = tests.uid('provider_a')), 1,
          'provider B could not delete the time off of provider A');
select is((select count(*)::int from public.services where provider_id = tests.uid('provider_a')), 1,
          'provider B could not delete the services of provider A');
select is((select count(*)::int from public.quotes where provider_id = tests.uid('provider_a')), 1,
          'provider B could not delete the quotes of provider A');
select is((select end_time from public.availability where provider_id = tests.uid('provider_a')), '12:00'::time,
          'provider B could not edit the availability of provider A');
select is((select price_min_cents from public.services where provider_id = tests.uid('provider_a')), 8000,
          'provider B could not edit the services of provider A');
select is((select title from public.quotes where provider_id = tests.uid('provider_a')), 'Orçamento A',
          'provider B could not edit the quotes of provider A');
select tests.authenticate_as('provider_a');
select lives_ok($$delete from public.time_off where provider_id = auth.uid()$$, 'provider A deletes own time off');
select tests.clear_authentication();
select is((select count(*)::int from public.time_off where provider_id = tests.uid('provider_a')), 0, 'the delete took effect');

select * from finish();
rollback;
