-- Account deletion clears the CPF/CNPJ of CRM entries in both directions (migration 20261110100001):
-- the entries the deleted provider keeps about other people, and the entries about the deleted
-- person as a client. Entries of other people keep their document.
begin;
select plan(7);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);

-- Entries are written by the test session (postgres), like the platform does on account links.
insert into public.provider_clients (provider_id, client_id, name, origin, cpf_cnpj) values
  (tests.uid('provider_a'), null, 'Cliente próprio', 'own', '12345678909'),
  (tests.uid('provider_c'), tests.uid('client_a'), 'Cliente A', 'platform', '11144477735'),
  (tests.uid('provider_d'), tests.uid('client_b'), 'Cliente B', 'platform', '52998224725'),
  (tests.uid('provider_c'), null, 'Outro cliente', 'own', '11222333000181');
insert into ids select 'own', id from public.provider_clients where name = 'Cliente próprio';
insert into ids select 'linked', id from public.provider_clients where name = 'Cliente A';
insert into ids select 'other', id from public.provider_clients where name = 'Cliente B';
insert into ids select 'other_cnpj', id from public.provider_clients where name = 'Outro cliente';

select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('provider_a'))$$, 'service role anonymizes the provider');
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$, 'service role anonymizes the client');
select tests.clear_authentication();

select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'own')), null,
          'the provider side: the CPF of an entry the deleted provider kept is cleared');
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'linked')), null,
          'the client side: the CPF of an entry about the deleted client is cleared');
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'other')), '52998224725',
          'an entry about another client keeps its CPF');
select is((select cpf_cnpj from public.provider_clients where id = (select id from ids where name = 'other_cnpj')), '11222333000181',
          'an entry of a provider who was not deleted keeps its CNPJ');

select * from finish();
rollback;
