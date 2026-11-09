-- CPF and CNPJ of a CRM entry: check digits are checked by the database (migration 20261110100003),
-- and the provider cannot change the document of an entry linked to a platform account.
begin;
select plan(25);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- The trigger function is run by its trigger only: no API role can call it (migration 20261110100007)
select is(
  (select count(*)::int from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where p.oid = 'private.guard_client_document()'::regprocedure and a.privilege_type = 'EXECUTE'
      and a.grantee in (0, (select oid from pg_roles where rolname = 'anon'), (select oid from pg_roles where rolname = 'authenticated'))),
  0, 'the document trigger function is not executable by PUBLIC, anon or authenticated');

-- The pure check functions: right digits, wrong digits, a repeated digit, a non-digit
select is(private.is_valid_cpf('12345678909'), true, 'a CPF with correct check digits is valid');
select is(private.is_valid_cpf('52998224725'), true, 'a second valid CPF');
select is(private.is_valid_cpf('12345678900'), false, 'a CPF with a wrong check digit is not valid');
select is(private.is_valid_cpf('11111111111'), false, 'a CPF with one repeated digit is not valid');
select is(private.is_valid_cpf('1234567890a'), false, 'a CPF with a letter is not valid');
select is(private.is_valid_cnpj('11222333000181'), true, 'a CNPJ with correct check digits is valid');
select is(private.is_valid_cnpj('11444777000161'), true, 'a second valid CNPJ');
select is(private.is_valid_cnpj('11222333000182'), false, 'a CNPJ with a wrong check digit is not valid');

-- An entry of provider_c linked to a platform account (written by the platform), and an own entry
insert into public.provider_clients (provider_id, client_id, name, origin, cpf_cnpj) values
  (tests.uid('provider_c'), tests.uid('client_a'), 'Cliente A', 'platform', '11144477735');
insert into public.provider_clients (provider_id, name, origin, cpf_cnpj) values
  (tests.uid('provider_c'), 'Cliente próprio', 'own', '12345678909');
insert into ids select 'linked', id from public.provider_clients where name = 'Cliente A';
insert into ids select 'own', id from public.provider_clients where name = 'Cliente próprio';

-- The provider stores documents of its own entries: valid ones only
select tests.authenticate_as('provider_c');
select lives_ok($$insert into public.provider_clients (provider_id, name, cpf_cnpj) values (auth.uid(), 'Novo com CPF', '52998224725')$$,
                'a provider stores a valid CPF on a new entry');
select throws_ok($$insert into public.provider_clients (provider_id, name, cpf_cnpj) values (auth.uid(), 'CPF errado', '12345678900')$$,
                 'P0001', 'cpf_cnpj_invalid', 'a CPF with wrong check digits is refused');
select throws_ok($$insert into public.provider_clients (provider_id, name, cpf_cnpj) values (auth.uid(), 'CPF repetido', '11111111111')$$,
                 'P0001', 'cpf_cnpj_invalid', 'a CPF with one repeated digit is refused');
select lives_ok($$insert into public.provider_clients (provider_id, name, cpf_cnpj) values (auth.uid(), 'Nova empresa', '11222333000181')$$,
                'a provider stores a valid CNPJ on a new entry');
select throws_ok($$insert into public.provider_clients (provider_id, name, cpf_cnpj) values (auth.uid(), 'CNPJ errado', '11222333000182')$$,
                 'P0001', 'cpf_cnpj_invalid', 'a CNPJ with wrong check digits is refused');
select throws_ok($$insert into public.provider_clients (provider_id, name, cpf_cnpj) values (auth.uid(), 'Curto', '1234')$$,
                 'P0001', 'cpf_cnpj_invalid', 'a number of another length is refused');
select lives_ok($$update public.provider_clients set cpf_cnpj = '11444777000161' where id = (select id from ids where name = 'own')$$,
                'a provider changes the document of an own entry to a valid CNPJ');
select throws_ok($$update public.provider_clients set cpf_cnpj = '11444777000162' where id = (select id from ids where name = 'own')$$,
                 'P0001', 'cpf_cnpj_invalid', 'and an invalid one is refused on update');

-- An entry linked to a platform account: its document is not the provider's to change
select throws_ok($$update public.provider_clients set cpf_cnpj = '52998224725' where id = (select id from ids where name = 'linked')$$,
                 'P0001', 'not_allowed', 'the provider cannot change the document of an entry linked to a platform account');
select lives_ok($$update public.provider_clients set name = 'Cliente A (atualizado)' where id = (select id from ids where name = 'linked')$$,
                'the provider can still change the name of a linked entry');
select tests.clear_authentication();
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'linked')), '11144477735',
          'after the refused change the linked document is the same');

-- Account deletion clears the document through the server, which the provider rule does not stop
select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$, 'the server anonymizes the client account');
select tests.clear_authentication();
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'linked')), null,
          'and clears the document of the linked entry');

-- The refused writes left nothing behind, and the accepted update of the own entry stayed
select is((select count(*)::int from public.provider_clients where name in ('CPF errado', 'CPF repetido', 'CNPJ errado', 'Curto')), 0,
          'the refused entries were not stored');
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'own')), '11444777000161',
          'the own entry keeps the CNPJ the provider set');

select * from finish();
rollback;
