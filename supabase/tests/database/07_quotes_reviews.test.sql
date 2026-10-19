-- Quotes (total trigger, public token, expiry) and reviews (only after an app payment,
-- unpublished without rating_ranking).
begin;
select plan(31);
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ quotes
select tests.authenticate_as('provider_c');
select lives_ok($$insert into public.quotes (title, client_name, client_phone, items, valid_until)
                  values ('Troca de fiação', 'Seu João', '5511977776666',
                          '[{"description": "Cabo 2,5 mm", "quantity": 3, "unit_price_cents": 1250},
                            {"description": "Mão de obra", "quantity": 1.5, "unit_price_cents": 10000}]',
                          current_date + 10)$$,
                'provider creates a quote');
insert into ids select 'quote', id from public.quotes where title = 'Troca de fiação';
insert into ids select 'token', public_token from public.quotes where title = 'Troca de fiação';
select is((select total_cents from public.quotes where id = (select id from ids where name = 'quote')), 18750,
          'total is computed by the server (3 x 1250 + 1.5 x 10000)');
update public.quotes set total_cents = 1 where id = (select id from ids where name = 'quote');
select is((select total_cents from public.quotes where id = (select id from ids where name = 'quote')), 18750,
          'a total sent by the client is ignored');
select throws_ok($$insert into public.quotes (title, items) values ('Ruim', '[{"description": "x", "quantity": -1, "unit_price_cents": 10}]')$$,
                 '23514', null, 'invalid items are rejected');
select throws_ok($$update public.quotes set status = 'accepted' where id = (select id from ids where name = 'quote')$$,
                 'P0001', 'invalid_transition', 'the provider cannot accept the own quote');

select tests.authenticate_anon();
select is(public.get_quote_by_token((select id from ids where name = 'token')), null, 'a draft is not shared by token');
select throws_ok($$select * from public.quotes$$, '42501', null, 'anon cannot read the quotes table');

select tests.authenticate_as('provider_c');
select lives_ok($$update public.quotes set status = 'sent' where id = (select id from ids where name = 'quote')$$,
                'provider sends the quote');
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.quotes), 0, 'another provider cannot read the quote');

select tests.authenticate_anon();
select is(public.get_quote_by_token((select id from ids where name = 'token')) ->> 'title', 'Troca de fiação',
          'anon reads the quote by token');
select is(public.get_quote_by_token((select id from ids where name = 'token')) -> 'provider' ->> 'display_name', 'Carla Teste',
          'the quote shows the provider public name');
select ok(not (public.get_quote_by_token((select id from ids where name = 'token')) ? 'client_phone'),
          'the quote by token does not expose the client phone');
select is(public.get_quote_by_token(gen_random_uuid()), null, 'an unknown token returns nothing');
select is(public.respond_quote((select id from ids where name = 'token'), true)::text, 'accepted', 'anon accepts the quote');
select throws_ok($$select public.respond_quote((select id from ids where name = 'token'), false)$$,
                 'P0001', 'invalid_transition', 'an answered quote cannot be answered again');

select tests.clear_authentication();
insert into public.quotes (provider_id, title, items, valid_until, status)
values (tests.uid('provider_c'), 'Orçamento vencido', '[]', current_date - 1, 'sent');
insert into ids select 'expired_token', public_token from public.quotes where title = 'Orçamento vencido';
select tests.authenticate_anon();
select is(public.get_quote_by_token((select id from ids where name = 'expired_token')) ->> 'status', 'expired',
          'a sent quote past its validity reads as expired');
select throws_ok($$select public.respond_quote((select id from ids where name = 'expired_token'), true)$$,
                 'P0001', 'quote_expired', 'an expired quote cannot be accepted');

-- ================================================================ reviews
select tests.clear_authentication();
insert into ids values
  ('done', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2029-06-04 09:00'), 'completed')),
  ('open', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-06-05 09:00'), 'accepted')),
  ('med', tests.make_booking('provider_b', 'client_a', 't-medico', tests.sp_period('2029-06-04 09:00'), 'completed'));
insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status) values
  ((select id from ids where name = 'open'), tests.uid('provider_c'), tests.uid('client_a'), 10000, 'received'),
  ((select id from ids where name = 'med'), tests.uid('provider_b'), tests.uid('client_a'), 10000, 'confirmed');

select tests.authenticate_as('client_a');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'done'), 5)$$,
                 'P0001', 'review_not_allowed', 'no review before an app payment');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'open'), 5)$$,
                 'P0001', 'review_not_allowed', 'no review before the job is completed');

select tests.clear_authentication();
insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status)
values ((select id from ids where name = 'done'), tests.uid('provider_c'), tests.uid('client_a'), 10000, 'received');

select tests.authenticate_as('client_b');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'done'), 1)$$,
                 'P0001', 'review_not_allowed', 'only the booking client reviews');
select throws_ok(format($$insert into public.reviews (booking_id, client_id, rating)
                          values ((select id from ids where name = 'done'), %L, 1)$$, tests.uid('client_a')),
                 '42501', null, 'nobody reviews in the name of the client');

select tests.authenticate_as('client_a');
select lives_ok($$insert into public.reviews (booking_id, rating, comment) values ((select id from ids where name = 'done'), 5, 'Ótimo')$$,
                'review after completion and payment');
select is((select published from public.reviews where booking_id = (select id from ids where name = 'done')), true,
          'published with rating_ranking');
select lives_ok($$insert into public.reviews (booking_id, rating, published) values ((select id from ids where name = 'med'), 5, true)$$,
                'review of an occupation without rating_ranking');
select is((select published from public.reviews where booking_id = (select id from ids where name = 'med')), false,
          'published is forced to false without rating_ranking');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'done'), 4)$$,
                 '23505', null, 'one review per booking');
select lives_ok($$update public.reviews set published = true where booking_id = (select id from ids where name = 'med')$$,
                'the client tries to publish it');
select is((select published from public.reviews where booking_id = (select id from ids where name = 'med')), false,
          'it stays unpublished');

select tests.authenticate_as('provider_b');
select is((select count(*)::int from public.reviews), 1, 'the provider reads the unpublished review');
select tests.authenticate_as('client_b');
select is((select count(*)::int from public.reviews), 0, 'other users do not read reviews from the table');
select tests.authenticate_anon();
select is(jsonb_array_length(public.get_provider_page('t-bruno') -> 'reviews'), 0,
          'unpublished reviews are not on the public page');

select * from finish();
rollback;
