-- A CRM entry with a job or a quote cannot be deleted (migration 20261110100002): the history keeps
-- its client. Entries without history can be deleted and renamed as before, and deleting a
-- provider account still removes its entries (the cascade keeps the jobs with a null link).
begin;
select plan(14);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- Entries of provider_c: one with a job, one with a quote, one without history.
insert into public.provider_clients (provider_id, name, origin) values
  (tests.uid('provider_c'), 'Com atendimento', 'own'),
  (tests.uid('provider_c'), 'Com orçamento', 'own'),
  (tests.uid('provider_c'), 'Sem histórico', 'own'),
  (tests.uid('provider_d'), 'Entrada do prestador D', 'own'),
  (tests.uid('provider_e'), 'Entrada do prestador E', 'own');
insert into ids select 'with_job', id from public.provider_clients where name = 'Com atendimento';
insert into ids select 'with_quote', id from public.provider_clients where name = 'Com orçamento';
insert into ids select 'free', id from public.provider_clients where name = 'Sem histórico';
insert into ids select 'd_entry', id from public.provider_clients where name = 'Entrada do prestador D';
insert into ids select 'e_entry', id from public.provider_clients where name = 'Entrada do prestador E';

insert into ids values
  ('job', tests.make_booking('provider_c', 'client_b', 't-reparo', tests.sp_period('2029-04-05 09:00'), 'completed')),
  ('d_job', tests.make_booking('provider_d', 'client_b', 't-reparo', tests.sp_period('2029-04-06 09:00'), 'completed')),
  ('e_job', tests.make_booking('provider_e', 'client_b', 't-reparo', tests.sp_period('2029-04-07 09:00'), 'completed'));
update public.bookings set provider_client_id = (select id from ids where name = 'with_job')
 where id = (select id from ids where name = 'job');
update public.bookings set provider_client_id = (select id from ids where name = 'd_entry')
 where id = (select id from ids where name = 'd_job');
update public.bookings set provider_client_id = (select id from ids where name = 'e_entry')
 where id = (select id from ids where name = 'e_job');
insert into public.quotes (provider_id, provider_client_id, title, items, status)
values (tests.uid('provider_c'), (select id from ids where name = 'with_quote'), 'Orçamento ligado', '[]', 'draft');
insert into public.quotes (provider_id, provider_client_id, title, items, status)
values (tests.uid('provider_e'), (select id from ids where name = 'e_entry'), 'Orçamento do E', '[]', 'draft');

-- The provider cannot delete an entry with a job or a quote, and the message names the rule.
select tests.authenticate_as('provider_c');
select throws_ok($$delete from public.provider_clients where id = (select id from ids where name = 'with_job')$$,
                 'P0001', 'client_has_history', 'an entry with a job cannot be deleted by the provider, with its own code');
select throws_ok($$delete from public.provider_clients where id = (select id from ids where name = 'with_quote')$$,
                 'P0001', 'client_has_history', 'an entry with a quote cannot be deleted by the provider');
select lives_ok($$delete from public.provider_clients where id = (select id from ids where name = 'free')$$,
                'an entry without history can be deleted');
select lives_ok($$update public.provider_clients set name = 'Renomeado' where id = (select id from ids where name = 'with_job')$$,
                'the provider can still rename an entry with history');
select tests.clear_authentication();

select is((select provider_client_id from public.bookings where id = (select id from ids where name = 'job')),
          (select id from ids where name = 'with_job'), 'after the refused delete the job keeps its entry');
select is((select provider_client_id from public.quotes where title = 'Orçamento ligado'),
          (select id from ids where name = 'with_quote'), 'and the quote keeps its entry');

-- The rule is for every delete while the provider exists, the direct ones included.
select throws_ok($$delete from public.provider_clients where id = (select id from ids where name = 'with_job')$$,
                 'P0001', 'client_has_history', 'a direct delete of an entry with a job is refused too');

-- Deleting a provider account removes its entries by cascade, even with a job or a quote:
-- the jobs keep their history with a null link, as the account deletion requires.
select lives_ok($$delete from auth.users where id = tests.uid('provider_d')$$,
                'deleting a provider account with an entry that has a job goes through');
select is((select provider_client_id from public.bookings where id = (select id from ids where name = 'd_job')), null,
          'the job of the deleted provider keeps its history with a null entry');
select is((select count(*)::int from public.provider_clients where name = 'Entrada do prestador D'), 0,
          'and the entry is gone with the account');

select lives_ok($$delete from auth.users where id = tests.uid('provider_e')$$,
                'deleting a provider account with a quote on its entry goes through');
select is((select count(*)::int from public.quotes where title = 'Orçamento do E'), 0,
          'the quotes of the deleted provider go with it');
select is((select provider_client_id from public.bookings where id = (select id from ids where name = 'e_job')), null,
          'and the job of that provider keeps its history');

select * from finish();
rollback;
