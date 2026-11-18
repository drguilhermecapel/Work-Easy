-- Free trial claims (trial_claims): one row per CPF hash, and only the service role can touch it.
-- The onboarding check and the trial rule are covered by Vitest (test/functions); this suite
-- checks the table itself.
begin;
select plan(12);
select has_function('tests', 'create_user', 'test helpers are installed (run 00_helpers first)');

select has_table('public', 'trial_claims', 'the claims table exists');
select col_is_pk('public', 'trial_claims', 'cpf_hash', 'the CPF hash is the primary key');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.trial_claims'::regclass),
  'row level security is on'
);
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'trial_claims'),
  0,
  'no policy opens the table to any role'
);

-- The service role claims a CPF hash once.
select tests.authenticate_service();
select lives_ok(
  $$insert into public.trial_claims (cpf_hash, provider_id) values ('hash-116-a', '99999999-9999-4999-8999-999999999991')$$,
  'the service role claims a CPF hash'
);
select throws_ok(
  $$insert into public.trial_claims (cpf_hash, provider_id) values ('hash-116-a', '99999999-9999-4999-8999-999999999992')$$,
  '23505', null,
  'a second claim of the same CPF hash is refused, whatever the provider'
);
select tests.clear_authentication();

-- An authenticated user (a provider or a client) can neither read nor write the table.
do $$ begin perform tests.create_user('trial-116-user', 'Usuário de teste'); end; $$;
select tests.authenticate_as('trial-116-user');
select throws_ok(
  'select count(*) from public.trial_claims', '42501', null,
  'an authenticated user cannot read the claims'
);
select throws_ok(
  $$insert into public.trial_claims (cpf_hash, provider_id) values ('hash-116-b', '99999999-9999-4999-8999-999999999993')$$,
  '42501', null,
  'an authenticated user cannot write a claim'
);
select throws_ok(
  'delete from public.trial_claims', '42501', null,
  'an authenticated user cannot delete a claim'
);
select tests.authenticate_anon();
select throws_ok(
  'select count(*) from public.trial_claims', '42501', null,
  'anon cannot read the claims'
);
select tests.clear_authentication();

-- The claim written above is still there for the service role.
select tests.authenticate_service();
select is(
  (select count(*)::int from public.trial_claims where cpf_hash = 'hash-116-a'),
  1,
  'the claim is kept for the service role'
);
select tests.clear_authentication();

select * from finish();
rollback;
