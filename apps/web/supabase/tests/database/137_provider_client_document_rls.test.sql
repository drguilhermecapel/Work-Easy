-- The CPF or CNPJ of a CRM entry (provider_clients.cpf_cnpj) belongs to the provider who owns the
-- entry: the provider reads, sets, changes and clears it from the CRM screen, and nobody else (another
-- provider, a client, an anonymous visitor) can read or write it. An admin reads it through the
-- select policy that already exists for the table (support and audit) but cannot change it.
begin;
select plan(17);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

insert into public.provider_clients (provider_id, name, origin, cpf_cnpj) values
  (tests.uid('provider_a'), 'Cliente do A com CPF', 'own', '52998224725'),
  (tests.uid('provider_a'), 'Cliente do A sem documento', 'own', null);
insert into ids select 'a_with', id from public.provider_clients where name = 'Cliente do A com CPF';
insert into ids select 'a_without', id from public.provider_clients where name = 'Cliente do A sem documento';

-- Column grants: a signed-in user can write the column (the row rule limits it to the owner); the anonymous role has no access
select ok(has_column_privilege('authenticated', 'public.provider_clients', 'cpf_cnpj', 'INSERT')
          and has_column_privilege('authenticated', 'public.provider_clients', 'cpf_cnpj', 'UPDATE'),
          'a signed-in user can write cpf_cnpj (the provider, under the row rule)');
select ok(not has_column_privilege('anon', 'public.provider_clients', 'cpf_cnpj', 'SELECT')
          and not has_column_privilege('anon', 'public.provider_clients', 'cpf_cnpj', 'INSERT')
          and not has_column_privilege('anon', 'public.provider_clients', 'cpf_cnpj', 'UPDATE'),
          'the anonymous role cannot read or write cpf_cnpj');

-- The owner
select tests.authenticate_as('provider_a');
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'a_with')), '52998224725',
          'the provider reads the document of an own entry');
select lives_ok($$update public.provider_clients set cpf_cnpj = '11222333000181' where id = (select id from ids where name = 'a_with')$$,
                'the provider changes the document of an own entry');
select lives_ok($$update public.provider_clients set cpf_cnpj = '12345678909' where id = (select id from ids where name = 'a_without')$$,
                'the provider sets a document on an entry that had none');
select lives_ok($$update public.provider_clients set cpf_cnpj = null where id = (select id from ids where name = 'a_without')$$,
                'the provider clears the document of an own entry');
select tests.clear_authentication();
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'a_with')), '11222333000181',
          'the changed document was stored');
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'a_without')), null,
          'the cleared document was stored as null');

-- Another provider
select tests.authenticate_as('provider_b');
select is((select count(*)::int from public.provider_clients where id in (select id from ids)), 0,
          'another provider cannot see the entries of provider A, so no document of theirs is readable');
update public.provider_clients set cpf_cnpj = '52998224725' where id = (select id from ids where name = 'a_with');
select throws_ok(format($$insert into public.provider_clients (provider_id, name, cpf_cnpj) values (%L, 'Invasor', '52998224725')$$, tests.uid('provider_a')),
                 '42501', null, 'another provider cannot create an entry with a document in the CRM of provider A');
select tests.clear_authentication();
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'a_with')), '11222333000181',
          'the silent update by another provider changed nothing');

-- A client of the platform
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.provider_clients where id in (select id from ids)), 0,
          'a client cannot read the CRM of a provider, documents included');
update public.provider_clients set cpf_cnpj = null where id = (select id from ids where name = 'a_with');
select tests.clear_authentication();
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'a_with')), '11222333000181',
          'a client cannot clear the document of an entry');

-- An anonymous visitor
select tests.authenticate_anon();
select throws_ok($$select cpf_cnpj from public.provider_clients$$, '42501', null, 'an anonymous visitor cannot select the document');
select tests.clear_authentication();

-- The admin reads through the table select policy, but the write rule is the provider's alone
select tests.authenticate_as('admin');
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'a_with')), '11222333000181',
          'an admin reads the document through the select policy');
update public.provider_clients set cpf_cnpj = null where id = (select id from ids where name = 'a_with');
select tests.clear_authentication();
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'a_with')), '11222333000181',
          'an admin cannot change the document of a provider entry');

select * from finish();
rollback;
