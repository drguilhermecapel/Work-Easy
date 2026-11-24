-- Execute grants of the private helpers (migration 20261118600003). The check digits are not executable
-- by PUBLIC or anon; anon does not execute the role helpers; the callers of each keep working.
begin;
select plan(21);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- The check digits: the guard trigger of provider_clients calls them as the writer
select is(has_function_privilege('anon', 'private.is_valid_cpf(text)', 'execute'), false,
          'anon cannot execute private.is_valid_cpf');
select is(has_function_privilege('anon', 'private.is_valid_cnpj(text)', 'execute'), false,
          'anon cannot execute private.is_valid_cnpj');
select is(
  (select count(*)::int from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid in ('private.is_valid_cpf(text)'::regprocedure, 'private.is_valid_cnpj(text)'::regprocedure)
      and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  0, 'PUBLIC cannot execute either check digit function');
select is(has_function_privilege('authenticated', 'private.is_valid_cpf(text)', 'execute'), true,
          'authenticated can execute private.is_valid_cpf');
select is(has_function_privilege('authenticated', 'private.is_valid_cnpj(text)', 'execute'), true,
          'authenticated can execute private.is_valid_cnpj');
select is(has_function_privilege('service_role', 'private.is_valid_cpf(text)', 'execute'), true,
          'service_role can execute private.is_valid_cpf');
select is(has_function_privilege('service_role', 'private.is_valid_cnpj(text)', 'execute'), true,
          'service_role can execute private.is_valid_cnpj');

-- The role helpers: anon no longer executes them; authenticated and service_role keep them
select is(has_function_privilege('anon', 'private.is_client_context()', 'execute'), false,
          'anon cannot execute private.is_client_context');
select is(has_function_privilege('anon', 'private.is_service_role()', 'execute'), false,
          'anon cannot execute private.is_service_role');
select is(has_function_privilege('authenticated', 'private.is_client_context()', 'execute'), true,
          'authenticated can execute private.is_client_context');
select is(has_function_privilege('authenticated', 'private.is_service_role()', 'execute'), true,
          'authenticated can execute private.is_service_role');
select is(has_function_privilege('service_role', 'private.is_client_context()', 'execute'), true,
          'service_role can execute private.is_client_context');

-- anon: the helpers refuse it, and the public paths it uses still run
select tests.authenticate_anon();
select throws_ok($$select private.is_client_context()$$, '42501', null, 'anon is refused by private.is_client_context');
select throws_ok($$select private.is_valid_cpf('52998224725')$$, '42501', null, 'anon is refused by private.is_valid_cpf');
select lives_ok($$select * from public.search_providers('faxina', null, 5, 0)$$, 'anon still runs search_providers');
select lives_ok($$select * from public.occupations$$, 'anon still reads the occupations');

-- authenticated (a provider): the guard trigger of provider_clients still checks the document
select tests.authenticate_as('provider_c');
select lives_ok($$insert into public.provider_clients (provider_id, name, cpf_cnpj) values (auth.uid(), 'Cliente 126', '52998224725')$$,
                'a provider stores a valid CPF through the guard trigger');
select throws_ok($$insert into public.provider_clients (provider_id, name, cpf_cnpj) values (auth.uid(), 'CPF errado', '12345678900')$$,
                 'P0001', 'cpf_cnpj_invalid', 'a provider with a wrong CPF is refused by the guard trigger');

-- service_role (Edge Functions): the same trigger, the same answers
select tests.authenticate_service();
select lives_ok($$insert into public.provider_clients (provider_id, name, cpf_cnpj) values (tests.uid('provider_c'), 'Empresa 126', '11444777000161')$$,
                'the service role stores a valid CNPJ through the guard trigger');
select throws_ok($$insert into public.provider_clients (provider_id, name, cpf_cnpj) values (tests.uid('provider_c'), 'CNPJ errado', '11222333000182')$$,
                 'P0001', 'cpf_cnpj_invalid', 'the service role with a wrong CNPJ is refused by the guard trigger');
select tests.clear_authentication();

select * from finish();
rollback;
