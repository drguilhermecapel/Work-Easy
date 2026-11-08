-- Audit entries have a size cap, and deleting a payment account also deletes its Vault key.
begin;
select plan(4);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

select lives_ok($$insert into public.audit_log (action, entity, entity_id, data) values ('t.small', 't', '1', '{"reason":"curto"}')$$,
                'a normal audit entry is kept');
select throws_ok($$insert into public.audit_log (action, entity, entity_id, data) values ('t.big', 't', '2', jsonb_build_object('reason', repeat('a', 9000)))$$,
                 '23514', null, 'an oversized audit entry is refused');

create temp table ids (name text primary key, id uuid);
insert into ids values ('key', vault.create_secret('chave-de-teste-s73', 'asaas_api_key:s73-fixture', 'fixture'));
insert into public.provider_payment_accounts (provider_id, api_key_secret_id, status)
values (tests.uid('provider_c'), (select id from ids where name = 'key'), 'pending');
delete from public.provider_payment_accounts where provider_id = tests.uid('provider_c');
select is((select count(*)::int from vault.secrets where id = (select id from ids where name = 'key')), 0,
          'deleting the payment account removes its Vault key');

select * from finish();
rollback;
