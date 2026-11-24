-- Migration 20261124100010 (DD82): when a provider's account is deleted, the title of each quote and of each
-- service (free text that can carry a client's name) is replaced by a neutral one. 120_pilot_reports_blocks_metrics
-- covers a draft quote and one service; this covers the quotes the client already saw (sent and accepted), whose
-- total, items and status are the record of what was charged and must not change, a second deletion, and the
-- data of another provider, which the deletion of this one must leave alone.
--
-- Two paths: the trigger alone (profiles.deleted_at set, as 120 does), and the real deletion (anonymize_user,
-- called by account-delete with the service role). The second also suspends the provider, and the suspension
-- cascade of 20261109000005 moves a 'sent' quote back to 'draft' so its public link stops: that status change
-- is that migration's, not this one's, and is asserted as such.
begin;
select plan(23);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- Inserted by the test session (not an API role), as the app reaches these states through respond_quote and send
with q as (
  insert into public.quotes (provider_id, title, status, client_name, items) values
    (tests.uid('provider_e'), 'Pintura da sala da dona Maria', 'sent', 'Maria',
     '[{"description": "Tinta", "quantity": 2, "unit_price_cents": 15000}, {"description": "Mão de obra", "quantity": 1, "unit_price_cents": 40000}]')
  returning id
) insert into ids select 'e_sent', id from q;
with q as (
  insert into public.quotes (provider_id, title, status, client_name, items) values
    (tests.uid('provider_e'), 'Reforma do banheiro do seu João', 'accepted', 'João',
     '[{"description": "Azulejo", "quantity": 10, "unit_price_cents": 4590}]')
  returning id
) insert into ids select 'e_accepted', id from q;
with q as (
  insert into public.quotes (provider_id, title, status, client_name, items) values
    (tests.uid('provider_a'), 'Faxina na casa da dona Lúcia', 'sent', 'Lúcia',
     '[{"description": "Faxina", "quantity": 1, "unit_price_cents": 20000}]')
  returning id
) insert into ids select 'a_sent', id from q;
with q as (
  insert into public.quotes (provider_id, title, status, client_name, items) values
    (tests.uid('provider_a'), 'Conserto do portão do seu Pedro', 'accepted', 'Pedro',
     '[{"description": "Solda", "quantity": 3, "unit_price_cents": 5000}]')
  returning id
) insert into ids select 'a_accepted', id from q;
insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit) values
  (tests.uid('provider_e'), 't-reparo', 'Reparos na casa da dona Maria', 8000, 'hora'),
  (tests.uid('provider_a'), 't-reparo', 'Reparos na casa da dona Lúcia', 9000, 'hora');

with q as (
  insert into public.quotes (provider_id, title, status, client_name, items) values
    (tests.uid('provider_d'), 'Telhado da casa da dona Rosa', 'sent', 'Rosa',
     '[{"description": "Telha", "quantity": 40, "unit_price_cents": 350}]')
  returning id
) insert into ids select 'd_sent', id from q;
with q as (
  insert into public.quotes (provider_id, title, status, client_name, items) values
    (tests.uid('provider_d'), 'Calha da casa do seu Antônio', 'accepted', 'Antônio',
     '[{"description": "Calha", "quantity": 6, "unit_price_cents": 2500}]')
  returning id
) insert into ids select 'd_accepted', id from q;

-- What must survive the deletion, as it was before it
create temp table before_deletion as
  select i.name, q.title, q.status, q.total_cents, q.items
    from ids i join public.quotes q on q.id = i.id;

select is((select total_cents from before_deletion where name = 'e_sent'), 70000, 'the sent quote has its total (2 × 150 + 400)');
select is((select total_cents from before_deletion where name = 'e_accepted'), 45900, 'the accepted quote has its total (10 × 45.90)');

-- The trigger of migration 010 alone: the profile is marked deleted, the provider stays as it was
update public.profiles set deleted_at = now() where id = tests.uid('provider_d');
select is((select count(*)::int from public.quotes q join ids i on i.id = q.id
            where i.name in ('d_sent', 'd_accepted') and q.title = 'Orçamento removido'), 2,
          'trigger alone: the titles of the sent and the accepted quote are replaced');
select results_eq(
  $$select q.status::text, q.total_cents, q.items from public.quotes q join ids i on i.id = q.id
     where i.name in ('d_sent', 'd_accepted') order by i.name$$,
  $$select status::text, total_cents, items from before_deletion where name in ('d_sent', 'd_accepted') order by name$$,
  'trigger alone: status, total and items of the sent and accepted quotes stay as they were'
);

-- The deletion as account-delete runs it: the service role calls anonymize_user, which marks the profile deleted
select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('provider_e'))$$,
                'the service role deletes the account of a provider with a sent and an accepted quote');
select tests.clear_authentication();

select is((select title from public.quotes where id = (select id from ids where name = 'e_sent')), 'Orçamento removido',
          'the title of a sent quote is replaced');
select is((select title from public.quotes where id = (select id from ids where name = 'e_accepted')), 'Orçamento removido',
          'the title of an accepted quote is replaced');
select results_eq(
  $$select q.total_cents, q.items from public.quotes q join ids i on i.id = q.id
     where i.name in ('e_sent', 'e_accepted') order by i.name$$,
  $$select total_cents, items from before_deletion where name in ('e_sent', 'e_accepted') order by name$$,
  'total and items of the sent and accepted quotes stay as they were (the record of what was charged)'
);
select is((select status::text from public.quotes where id = (select id from ids where name = 'e_accepted')), 'accepted',
          'the accepted quote stays accepted');
select is((select status::text from public.quotes where id = (select id from ids where name = 'e_sent')), 'draft',
          'the sent quote goes back to draft through the suspension cascade (20261109000005), not through this migration');
select is((select title from public.services where provider_id = tests.uid('provider_e')), 'Serviço removido',
          'the title of the deleted provider''s service is replaced');
select is((select price_min_cents from public.services where provider_id = tests.uid('provider_e')), 8000,
          'and its price stays');

-- Another provider's quotes and services are not touched
select results_eq(
  $$select q.title, q.status::text, q.total_cents, q.items from public.quotes q join ids i on i.id = q.id
     where i.name in ('a_sent', 'a_accepted') order by i.name$$,
  $$select title, status::text, total_cents, items from before_deletion where name in ('a_sent', 'a_accepted') order by name$$,
  'the quotes of another provider keep title, status, total and items'
);
select is((select client_name from public.quotes where id = (select id from ids where name = 'a_accepted')), 'Pedro',
          'and their client name');
select is((select title from public.services where provider_id = tests.uid('provider_a') and title like 'Reparos%'),
          'Reparos na casa da dona Lúcia', 'the service of another provider keeps its title');
select is((select count(*)::int from public.quotes
            where provider_id not in (tests.uid('provider_d'), tests.uid('provider_e')) and title = 'Orçamento removido'), 0,
          'no quote of a provider that was not deleted got the neutral title');

-- A second deletion changes nothing and does not fail
select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('provider_e'))$$, 'a repeated deletion is accepted');
select tests.clear_authentication();
select results_eq(
  $$select q.title, q.status::text, q.total_cents, q.items from public.quotes q join ids i on i.id = q.id order by i.name$$,
  $$select case when name similar to '(d|e)\_%' then 'Orçamento removido' else title end,
           case when name = 'e_sent' then 'draft' else status::text end, total_cents, items
      from before_deletion order by name$$,
  'after the second deletion every quote is as after the first'
);

-- The trigger fires again if the profile is marked deleted a second time (deleted_at cleared and set again):
-- titles already neutral are not rewritten, and nothing else moves
update public.profiles set deleted_at = null where id = tests.uid('provider_e');
select lives_ok($$update public.profiles set deleted_at = now() where id = tests.uid('provider_e')$$,
                'the deletion trigger runs again on an account already cleared');
select is((select count(*)::int from public.quotes where provider_id = tests.uid('provider_e') and title <> 'Orçamento removido'), 0,
          'every quote of the deleted provider still has the neutral title');
select results_eq(
  $$select q.total_cents, q.items from public.quotes q join ids i on i.id = q.id order by i.name$$,
  $$select total_cents, items from before_deletion order by name$$,
  'total and items of every quote are still the ones from before the deletion'
);
select is((select count(*)::int from public.services where provider_id = tests.uid('provider_e') and title <> 'Serviço removido'), 0,
          'and every service of the deleted provider still has the neutral title');

select * from finish();
rollback;
