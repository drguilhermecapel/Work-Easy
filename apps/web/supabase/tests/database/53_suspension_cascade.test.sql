-- Suspension and loss of approval stop the offers a provider still holds: sent
-- proposals are withdrawn, requested bookings canceled, sent quotes go back to draft. Accepted
-- jobs and the offers of other providers are untouched.
begin;
select plan(10);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

insert into ids values ('req_a', md5('s53-req-a')::uuid);
insert into public.requests (id, client_id, occupation_slug, neighborhood_id, description)
values ((select id from ids where name = 'req_a'), tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'),
        'Pedido de teste para suspensão');

-- provider_d and provider_e both propose on it; provider_d also has a requested booking and a sent quote.
select tests.authenticate_as('provider_d');
insert into public.proposals (id, request_id, price_cents) values (md5('s53-prop-d')::uuid, (select id from ids where name = 'req_a'), 9000);
insert into public.quotes (id, title, items, status, valid_until) values (md5('s53-quote-d')::uuid, 'Orçamento de teste',
  '[{"description":"Reparo","quantity":1,"unit_price_cents":4000}]', 'sent', '2031-12-31');
select tests.authenticate_as('provider_e');
insert into public.proposals (id, request_id, price_cents) values (md5('s53-prop-e')::uuid, (select id from ids where name = 'req_a'), 9500);

select tests.clear_authentication();
insert into ids values ('book_d', tests.make_booking('provider_d', 'client_a', 't-reparo', tests.sp_period(tests.at(47, 0, '09:00'), 1), 'requested'));
insert into ids values ('book_e', tests.make_booking('provider_e', 'client_a', 't-reparo', tests.sp_period(tests.at(48, 0, '09:00'), 1), 'accepted'));

-- The admin suspends provider_d through the real RPC.
select tests.authenticate_as('admin');
select lives_ok($$select public.admin_set_provider_status(tests.uid('provider_d'), 'suspended', 'Teste de suspensão')$$,
                'the admin suspends provider_d');
select tests.clear_authentication();

select is((select status::text from public.proposals where id = md5('s53-prop-d')::uuid), 'withdrawn',
          'the suspended provider''s sent proposal is withdrawn');
select is((select status::text from public.proposals where request_id = (select id from ids where name = 'req_a')
              and provider_id = tests.uid('provider_e')), 'sent',
          'the proposal of another provider is untouched');
select is((select status::text from public.bookings where id = (select id from ids where name = 'book_d')), 'canceled',
          'the suspended provider''s requested booking is canceled');
select is((select canceled_reason from public.bookings where id = (select id from ids where name = 'book_d')),
          'provider_not_approved', 'and the reason says why');
select is((select status::text from public.quotes where id = md5('s53-quote-d')::uuid), 'draft',
          'the sent quote goes back to draft, so the public link stops showing it');

-- The client cannot accept what was withdrawn.
select tests.authenticate_as('client_a');
select throws_ok($$select public.accept_proposal(md5('s53-prop-d')::uuid, tests.sp_period(tests.at(49, 0, '10:00'), 1))$$,
                 'P0001', null, 'a withdrawn proposal cannot be accepted');

-- A lost occupation approval withdraws that occupation's sent proposals; an accepted job stays.
select tests.clear_authentication();
update public.provider_occupations set approved = false
 where provider_id = tests.uid('provider_e') and occupation_slug = 't-reparo';
select is((select status::text from public.proposals where id = md5('s53-prop-e')::uuid), 'withdrawn',
          'losing the occupation approval withdraws its sent proposals');
select is((select status::text from public.bookings where id = (select id from ids where name = 'book_e')), 'accepted',
          'an accepted job is not changed by the cascade');

select * from finish();
rollback;
