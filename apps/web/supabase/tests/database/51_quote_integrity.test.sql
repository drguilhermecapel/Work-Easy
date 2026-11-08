-- Quote integrity: only an approved provider with an approved occupation sends a quote, and a sent
-- quote keeps its offer until it goes back to draft.
begin;
select plan(9);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- A provider still in review, with an occupation approved on file.
select tests.create_user('review_q', 'Em análise', '5511900000077');
insert into public.providers (id, display_name, slug, status, base_neighborhood_id)
values (tests.uid('review_q'), 'Em Análise Teste', 't-em-analise-q', 'pending_review', tests.neighborhood('t-bairro-1'));
insert into public.provider_occupations (provider_id, occupation_slug, is_primary, registry_number, registry_uf, approved)
values (tests.uid('review_q'), 't-reparo', true, null, null, true);

select tests.authenticate_as('review_q');
select throws_ok($$insert into public.quotes (title, items, status, valid_until) values
                    ('Troca de torneira', '[{"description":"Torneira","quantity":1,"unit_price_cents":5000}]', 'sent', '2031-12-31')$$,
                 'P0001', 'not_allowed', 'a provider in review cannot send a quote');
select lives_ok($$insert into public.quotes (title, items, status) values
                    ('Rascunho de orçamento', '[{"description":"Torneira","quantity":1,"unit_price_cents":5000}]', 'draft')$$,
                'a draft quote is always allowed');
select throws_ok($$update public.quotes set status = 'sent', valid_until = '2031-12-31' where title = 'Rascunho de orçamento'$$,
                 'P0001', 'not_allowed', 'a provider in review cannot move a draft to sent');

-- An approved provider sends a quote; its items cannot change while it is sent.
select tests.clear_authentication();
select tests.authenticate_as('provider_c');
insert into ids values ('q1', md5('s51-q1')::uuid);
select lives_ok($$insert into public.quotes (id, title, items, status, valid_until) values
                    ((select id from ids where name = 'q1'), 'Troca de torneira',
                     '[{"description":"Torneira","quantity":2,"unit_price_cents":5000}]', 'sent', '2031-12-31')$$,
                'an approved provider sends a quote');
select throws_ok($$update public.quotes set items = '[{"description":"Torneira","quantity":2,"unit_price_cents":900000}]'
                    where id = (select id from ids where name = 'q1')$$,
                 'P0001', 'invalid_transition', 'the items of a sent quote cannot change');

-- To edit, the provider takes it back to draft, changes it and sends it again.
select lives_ok($$update public.quotes set status = 'draft' where id = (select id from ids where name = 'q1')$$,
                'a sent quote goes back to draft');
select lives_ok($$update public.quotes set items = '[{"description":"Torneira","quantity":3,"unit_price_cents":5000}]', status = 'sent'
                   where id = (select id from ids where name = 'q1')$$,
                'and is sent again with the new items');
select is((select total_cents from public.quotes where id = (select id from ids where name = 'q1')), 15000,
          'the total is recomputed from the items sent');

select * from finish();
rollback;
