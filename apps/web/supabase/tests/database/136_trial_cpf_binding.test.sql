-- Free trial bound to the CPF of the receiving account (DD51): provider_payment_accounts.cpf_hash holds the
-- keyed fingerprint of the CPF/CNPJ that Asaas validated, or NULL for accounts created before it. Only the
-- service role (asaas-onboard) writes it; the API roles (anon, authenticated) can neither read nor write it.
begin;
select plan(21);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;
insert into ids values ('provider_c', tests.uid('provider_c'));

select has_column('public', 'provider_payment_accounts', 'cpf_hash', 'the receiving account has the CPF fingerprint column');
select col_type_is('public', 'provider_payment_accounts', 'cpf_hash', 'text', 'the fingerprint is text');
select col_is_null('public', 'provider_payment_accounts', 'cpf_hash', 'the fingerprint is optional: earlier accounts keep NULL');

-- An account created before the binding has no fingerprint, and the migration does not invent one
insert into public.provider_payment_accounts (provider_id, asaas_account_id, asaas_wallet_id, status)
values ((select id from ids where name = 'provider_c'), 'acc_136', 'wal_136', 'active');
select is(
  (select cpf_hash from public.provider_payment_accounts where provider_id = (select id from ids where name = 'provider_c')),
  null::text,
  'an account created without the fingerprint stores NULL'
);

-- The format check: 64 lowercase hex characters
select throws_ok(
  $$update public.provider_payment_accounts set cpf_hash = 'ABC-not-a-fingerprint' where provider_id = (select id from ids where name = 'provider_c')$$,
  '23514', null,
  'a value that is not 64 lowercase hex characters is refused'
);

-- The service role stores the fingerprint (asaas-onboard)
select tests.authenticate_service();
select lives_ok(
  $$update public.provider_payment_accounts set cpf_hash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' where provider_id = (select id from ids where name = 'provider_c')$$,
  'the service role stores the fingerprint'
);
select tests.clear_authentication();
select is(
  (select cpf_hash from public.provider_payment_accounts where provider_id = (select id from ids where name = 'provider_c')),
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  'the stored fingerprint is the one the service role wrote'
);

-- The provider cannot write or read its own fingerprint (the column is not granted)
select tests.authenticate_as('provider_c');
select throws_ok(
  $$update public.provider_payment_accounts set cpf_hash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'$$,
  '42501', null,
  'the provider cannot write the fingerprint of the own account'
);
select throws_ok(
  'select cpf_hash from public.provider_payment_accounts', '42501', null,
  'the provider cannot read the fingerprint'
);
select lives_ok(
  'select provider_id, asaas_wallet_id, status from public.provider_payment_accounts',
  'the provider still reads the own account columns'
);
select throws_ok(
  $$insert into public.provider_payment_accounts (provider_id, status) values ((select id from ids where name = 'provider_c'), 'creating')$$,
  '42501', null,
  'the provider cannot create a receiving account row'
);
select tests.clear_authentication();

-- anon has no way in either
select tests.authenticate_anon();
select throws_ok(
  $$update public.provider_payment_accounts set cpf_hash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'$$,
  '42501', null,
  'anon cannot write the fingerprint'
);
select throws_ok(
  'select cpf_hash from public.provider_payment_accounts', '42501', null,
  'anon cannot read the fingerprint'
);
select tests.clear_authentication();

-- The grants themselves: no insert or update for the API roles, and the column is closed to them
select ok(not has_table_privilege('authenticated', 'public.provider_payment_accounts', 'INSERT'),
          'authenticated has no insert grant on the receiving accounts');
select ok(not has_table_privilege('authenticated', 'public.provider_payment_accounts', 'UPDATE'),
          'authenticated has no update grant on the receiving accounts');
select ok(not has_table_privilege('anon', 'public.provider_payment_accounts', 'INSERT'),
          'anon has no insert grant on the receiving accounts');
select ok(not has_table_privilege('anon', 'public.provider_payment_accounts', 'UPDATE'),
          'anon has no update grant on the receiving accounts');
select ok(not has_column_privilege('authenticated', 'public.provider_payment_accounts', 'cpf_hash', 'SELECT'),
          'the fingerprint column is not granted to the provider');
select ok(not has_column_privilege('anon', 'public.provider_payment_accounts', 'cpf_hash', 'SELECT'),
          'the fingerprint column is not granted to anon');
select ok(has_column_privilege('service_role', 'public.provider_payment_accounts', 'cpf_hash', 'UPDATE'),
          'the service role writes the fingerprint');

select * from finish();
rollback;
