-- Platform settings: signed-in users cannot write the table, not even through a stale policy;
-- an administrator changes a setting only through admin_set_setting(); the service role still
-- writes it; every signed-in user keeps reading the public settings.
begin;
select plan(16);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- The API role keeps the read grant and loses the three write grants.
select ok(has_table_privilege('authenticated', 'public.platform_settings', 'SELECT'),
          'signed-in users keep the read grant on settings');
select ok(not has_table_privilege('authenticated', 'public.platform_settings', 'INSERT'),
          'signed-in users have no insert grant on settings');
select ok(not has_table_privilege('authenticated', 'public.platform_settings', 'UPDATE'),
          'signed-in users have no update grant on settings');
select ok(not has_table_privilege('authenticated', 'public.platform_settings', 'DELETE'),
          'signed-in users have no delete grant on settings');

-- A client reads the public settings and cannot change them.
select tests.authenticate_as('client_a');
select is((select value from public.platform_settings where key = 'proposal_limit'), '3'::jsonb,
          'a client reads a public setting');
select throws_ok($$update public.platform_settings set value = 'true' where key = 'commission_enabled'$$, '42501', null,
                 'a client cannot update a setting');
select throws_ok($$insert into public.platform_settings (key, value) values ('t_client', '1')$$, '42501', null,
                 'a client cannot insert a setting');
select throws_ok($$delete from public.platform_settings where key = 'commission_enabled'$$, '42501', null,
                 'a client cannot delete a setting');
select throws_ok($$select public.admin_set_setting('commission_enabled', 'true')$$, 'P0001', 'not_allowed',
                 'a client cannot change a setting through admin_set_setting');
select tests.clear_authentication();
select is((select value from public.platform_settings where key = 'commission_enabled'), 'false'::jsonb,
          'the refused client writes changed nothing');

-- An administrator is refused the table write too: settings go through the function that
-- checks the range and writes the audit row.
select tests.authenticate_as('admin');
select throws_ok($$update public.platform_settings set value = 'true' where key = 'commission_enabled'$$, '42501', null,
                 'an administrator cannot update the table directly');
select lives_ok($$select public.admin_set_setting('commission_enabled', 'true')$$,
                'an administrator changes a setting through admin_set_setting');
select tests.clear_authentication();
select is((select value from public.platform_settings where key = 'commission_enabled'), 'true'::jsonb,
          'admin_set_setting stored the value');

-- The service role (server-side code) still writes settings.
select tests.authenticate_service();
select lives_ok($$update public.platform_settings set value = '1500' where key = 'commission_bps'$$,
                'the service role still updates a setting');
select tests.clear_authentication();
select is((select value from public.platform_settings where key = 'commission_bps'), '1500'::jsonb,
          'the service role update is stored');

select * from finish();
rollback;
