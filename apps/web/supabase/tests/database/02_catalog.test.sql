-- Catalog: public read of areas, occupations, policies, neighborhoods and non-internal
-- settings; writes by admins only; default settings of the contract.
--
-- The "Defaults" block reads the settings as the migrations left them, before the fixture
-- pins them: it holds right after `supabase db reset` (the CI case) and fails when someone
-- saved another value in the shared local database. Every other file starts from the
-- pinned values of tests.setup_fixture().
begin;
select plan(28);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
create temp table saved_settings as select key, value from public.platform_settings;
select tests.setup_fixture();
insert into public.platform_settings (key, value, internal) values ('t_internal', '"x"', true);

-- Defaults
select is((select value from saved_settings where key = 'commission_enabled'), 'false'::jsonb,
          'commission starts disabled');
select is((select value from saved_settings where key = 'escrow_enabled'), 'false'::jsonb,
          'escrow starts disabled');
select is((select value from saved_settings where key = 'commission_bps'), '1200'::jsonb, 'commission_bps 1200');
select is((select value from saved_settings where key = 'pro_price_cents'), '4900'::jsonb, 'pro price 4900');
select is((select value from saved_settings where key = 'proposal_limit'), '3'::jsonb, 'proposal limit 3');
select is((select value from saved_settings where key = 'labor_lock_days_per_week'), '2'::jsonb,
          'labor lock 2 days per week');
select is((select count(*)::int from public.neighborhoods where city = 'São Paulo' and slug not like 't-%'), 96,
          'seed has the 96 districts of São Paulo');

-- anon
select tests.authenticate_anon();
select ok((select count(*) from public.areas) > 0, 'anon reads areas');
select ok((select count(*) from public.occupations) > 0, 'anon reads occupations');
select ok((select count(*) from public.occupation_policies) > 0, 'anon reads policies');
select ok((select count(*) from public.neighborhoods) > 0, 'anon reads neighborhoods');
select is((select count(*)::int from public.platform_settings where key = 'proposal_limit'), 1,
          'anon reads public settings');
select is((select count(*)::int from public.platform_settings where key = 't_internal'), 0,
          'anon does not read internal settings');
select throws_ok($$insert into public.areas (slug, name) values ('x-anon', 'X')$$, '42501', null, 'anon cannot insert areas');
select throws_ok($$update public.platform_settings set value = 'true' where key = 'commission_enabled'$$, '42501', null,
                 'anon cannot update settings');

-- client
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.platform_settings where key = 't_internal'), 0,
          'clients do not read internal settings');
select throws_ok($$insert into public.areas (slug, name) values ('x-client', 'X')$$, '42501', null,
                 'clients cannot insert areas (RLS)');
select throws_ok($$insert into public.neighborhoods (name, slug) values ('X', 'x-client')$$, '42501', null,
                 'clients cannot insert neighborhoods (RLS)');
update public.platform_settings set value = 'true' where key = 'commission_enabled';
update public.occupation_policies set labor_lock = false where occupation_slug = 't-domestica';
delete from public.occupations where slug = 't-reparo';

-- provider
select tests.authenticate_as('provider_a');
update public.areas set name = 'Hack' where slug = 't-area';

select tests.clear_authentication();
select is((select value from public.platform_settings where key = 'commission_enabled'), 'false'::jsonb,
          'a client update of settings changed nothing');
select is((select labor_lock from public.occupation_policies where occupation_slug = 't-domestica'), true,
          'a client update of policies changed nothing');
select is((select count(*)::int from public.occupations where slug = 't-reparo'), 1,
          'a client delete of occupations changed nothing');
select is((select name from public.areas where slug = 't-area'), 'Área de teste', 'a provider update of areas changed nothing');

-- admin
select tests.authenticate_as('admin');
select is((select count(*)::int from public.platform_settings where key = 't_internal'), 1, 'admins read internal settings');
select lives_ok($$update public.areas set name = 'Área revisada' where slug = 't-area'$$, 'admin updates areas');
select lives_ok($$insert into public.neighborhoods (name, slug, zone) values ('Novo', 't-novo', 'Centro')$$,
                'admin inserts neighborhoods');
select lives_ok($$select public.admin_set_setting('commission_enabled', 'true')$$, 'admin changes a setting');
select tests.clear_authentication();
select is((select value from public.platform_settings where key = 'commission_enabled'), 'true'::jsonb,
          'admin_set_setting stored the value');

select * from finish();
rollback;
