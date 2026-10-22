-- Quotes (total trigger, public token, expiry) and reviews (only after an app payment,
-- unpublished without rating_ranking).
begin;
select plan(60);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ quotes
select tests.authenticate_as('provider_c');
select lives_ok($$insert into public.quotes (title, client_name, client_phone, items, valid_until)
                  values ('Troca de fiação', 'Seu João', '5511977776666',
                          '[{"description": "Cabo 2,5 mm", "quantity": 3, "unit_price_cents": 1250},
                            {"description": "Mão de obra", "quantity": 1.5, "unit_price_cents": 10000}]',
                          (now() at time zone 'America/Sao_Paulo')::date + 10)$$,
                'provider creates a quote');
insert into ids select 'quote', id from public.quotes where title = 'Troca de fiação';
insert into ids select 'token', public_token from public.quotes where title = 'Troca de fiação';
select is((select total_cents from public.quotes where id = (select id from ids where name = 'quote')), 18750,
          'total is computed by the server (3 x 1250 + 1.5 x 10000)');
update public.quotes set total_cents = 1 where id = (select id from ids where name = 'quote');
select is((select total_cents from public.quotes where id = (select id from ids where name = 'quote')), 18750,
          'a total sent by the client is ignored');
select throws_ok($$insert into public.quotes (title, items) values ('Ruim', '[{"description": "x", "quantity": -1, "unit_price_cents": 10}]')$$,
                 'P0001', 'quote_items_invalid', 'an item with a negative quantity is rejected with its own code');
select throws_ok($$insert into public.quotes (title, items) values ('Ruim', '{"description": "x"}')$$,
                 'P0001', 'quote_items_invalid', 'items must be an array');
select throws_ok($$insert into public.quotes (title, items) values ('Ruim', '[{"quantity": 1, "unit_price_cents": 10}]')$$,
                 'P0001', 'quote_items_invalid', 'an item needs a description');
select throws_ok($$insert into public.quotes (title, items) values ('Ruim', '[{"description": "x", "quantity": 1, "unit_price_cents": 10.5}]')$$,
                 'P0001', 'quote_items_invalid', 'prices are whole cents');
select throws_ok($$update public.quotes set status = 'accepted' where id = (select id from ids where name = 'quote')$$,
                 'P0001', 'invalid_transition', 'the provider cannot accept the own quote');

select tests.clear_authentication();
insert into public.quotes (provider_id, title, items) values (tests.uid('provider_c'), 'Rascunho', '[]');
insert into ids select 'draft_token', public_token from public.quotes where title = 'Rascunho';
select tests.authenticate_anon();
select is(public.get_quote_by_token((select id from ids where name = 'token')), null, 'a draft is not shared by token');
select throws_ok($$select * from public.quotes$$, '42501', null, 'anon cannot read the quotes table');
select throws_ok($$update public.quotes set status = 'accepted'$$, '42501', null, 'anon cannot update quotes directly');
select throws_ok($$select public.respond_quote((select id from ids where name = 'draft_token'), true)$$,
                 'P0001', 'not_allowed', 'a draft cannot be answered');

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
-- Validity is the São Paulo calendar date (the test session runs in UTC): yesterday is expired,
-- today is still valid on its last day.
insert into public.quotes (provider_id, title, items, valid_until, status) values
  (tests.uid('provider_c'), 'Orçamento vencido', '[]', (now() at time zone 'America/Sao_Paulo')::date - 1, 'sent'),
  (tests.uid('provider_c'), 'Vence hoje', '[]', (now() at time zone 'America/Sao_Paulo')::date, 'sent');
insert into ids select 'expired_token', public_token from public.quotes where title = 'Orçamento vencido';
insert into ids select 'today_token', public_token from public.quotes where title = 'Vence hoje';
select tests.authenticate_anon();
select is(public.get_quote_by_token((select id from ids where name = 'expired_token')) ->> 'status', 'expired',
          'a sent quote past its validity reads as expired');
select throws_ok($$select public.respond_quote((select id from ids where name = 'expired_token'), true)$$,
                 'P0001', 'quote_expired', 'an expired quote cannot be accepted');
select is(public.get_quote_by_token((select id from ids where name = 'today_token')) ->> 'status', 'sent',
          'a quote is still valid on its last day (São Paulo date)');
select is(public.respond_quote((select id from ids where name = 'today_token'), true)::text, 'accepted',
          'and can be accepted on that day');

-- The scheduler expires quotes past their validity and leaves the others alone.
select tests.clear_authentication();
insert into public.quotes (provider_id, title, items, valid_until, status)
values (tests.uid('provider_c'), 'Ainda válido', '[]', (now() at time zone 'America/Sao_Paulo')::date + 1, 'sent');
select private.expire_stale();
select is((select status::text from public.quotes where title = 'Orçamento vencido'), 'expired', 'expire_stale expires a quote past its validity');
select is((select status::text from public.quotes where title = 'Ainda válido'), 'sent', 'and leaves a valid quote alone');
select is((select status::text from public.quotes where title = 'Vence hoje'), 'accepted', 'and an answered quote');

-- ================================================================ reviews
select tests.clear_authentication();
insert into ids values
  ('done', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2029-06-04 09:00'), 'completed')),
  ('open', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-06-05 09:00'), 'accepted')),
  ('med', tests.make_booking('provider_b', 'client_a', 't-medico', tests.sp_period('2029-06-04 09:00'), 'completed')),
  ('refunded', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2029-07-02 09:00'), 'completed')),
  ('pending', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2029-07-03 09:00'), 'completed')),
  ('failed', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2029-07-04 09:00'), 'completed')),
  ('released', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2029-07-05 09:00'), 'released')),
  ('other_pay', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2029-07-06 09:00'), 'completed')),
  ('own_job', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2029-07-07 09:00'), 'completed', 10000, 'own'));
insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status) values
  ((select id from ids where name = 'open'), tests.uid('provider_c'), tests.uid('client_a'), 10000, 'received'),
  ((select id from ids where name = 'med'), tests.uid('provider_b'), tests.uid('client_a'), 10000, 'confirmed'),
  ((select id from ids where name = 'refunded'), tests.uid('provider_c'), tests.uid('client_a'), 10000, 'refunded'),
  ((select id from ids where name = 'pending'), tests.uid('provider_c'), tests.uid('client_a'), 10000, 'pending'),
  ((select id from ids where name = 'failed'), tests.uid('provider_c'), tests.uid('client_a'), 10000, 'failed'),
  ((select id from ids where name = 'released'), tests.uid('provider_c'), tests.uid('client_a'), 10000, 'released'),
  ((select id from ids where name = 'own_job'), tests.uid('provider_c'), tests.uid('client_a'), 10000, 'received');

select tests.authenticate_as('client_a');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'done'), 5)$$,
                 'P0001', 'review_not_allowed', 'no review before an app payment');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'open'), 5)$$,
                 'P0001', 'review_not_allowed', 'no review before the job is completed');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'refunded'), 5)$$,
                 'P0001', 'review_not_allowed', 'a refunded payment does not allow a review');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'pending'), 5)$$,
                 'P0001', 'review_not_allowed', 'a pending payment does not allow a review');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'failed'), 5)$$,
                 'P0001', 'review_not_allowed', 'a failed payment does not allow a review');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'other_pay'), 5)$$,
                 'P0001', 'review_not_allowed', 'the payment of another job does not count');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'own_job'), 5)$$,
                 'P0001', 'review_not_allowed', 'a job of origin own is never reviewable, even paid');

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
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'done'), 6)$$,
                 '23514', 'new row for relation "reviews" violates check constraint "reviews_rating_check"', 'rating is at most 5');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'done'), 0)$$,
                 '23514', 'new row for relation "reviews" violates check constraint "reviews_rating_check"', 'rating is at least 1');
select throws_ok(format($$insert into public.reviews (booking_id, rating, comment) values ((select id from ids where name = 'done'), 5, %L)$$,
                        repeat('a', 1001)),
                 '23514', 'new row for relation "reviews" violates check constraint "reviews_comment_check"', 'the comment has at most 1000 characters');
select lives_ok($$insert into public.reviews (booking_id, rating, comment) values ((select id from ids where name = 'done'), 5, 'Ótimo')$$,
                'review after completion and payment');
select is((select published from public.reviews where booking_id = (select id from ids where name = 'done')), true,
          'published with rating_ranking');
select lives_ok(format($$insert into public.reviews (booking_id, rating, provider_id) values ((select id from ids where name = 'released'), 5, %L)$$,
                       tests.uid('provider_d')),
                'a released job can be reviewed');
select lives_ok($$insert into public.reviews (booking_id, rating, published) values ((select id from ids where name = 'med'), 5, true)$$,
                'review of an occupation without rating_ranking');
select is((select published from public.reviews where booking_id = (select id from ids where name = 'med')), false,
          'published is forced to false without rating_ranking');
select throws_ok($$insert into public.reviews (booking_id, rating) values ((select id from ids where name = 'done'), 4)$$,
                 '23505', 'duplicate key value violates unique constraint "reviews_booking_id_key"', 'one review per booking');
select throws_ok($$update public.reviews set published = true where booking_id = (select id from ids where name = 'med')$$,
                 'P0001', 'not_allowed', 'the client cannot change the publication');
select is((select published from public.reviews where booking_id = (select id from ids where name = 'med')), false,
          'it stays unpublished');
select lives_ok($$update public.reviews set rating = 4, comment = 'Bom' where booking_id = (select id from ids where name = 'done')$$,
                'the author edits rating and comment');
select tests.clear_authentication();
select is((select provider_id from public.reviews where booking_id = (select id from ids where name = 'released')),
          tests.uid('provider_c'), 'provider_id comes from the booking, not from the client');

-- moderation: an admin hides a review and the author cannot publish it again
select tests.authenticate_as('admin');
select lives_ok($$update public.reviews set published = false where booking_id = (select id from ids where name = 'done')$$,
                'an admin hides a review');
select tests.authenticate_as('client_a');
select throws_ok($$update public.reviews set published = true where booking_id = (select id from ids where name = 'done')$$,
                 'P0001', 'not_allowed', 'the author cannot republish a review hidden by moderation');
select tests.authenticate_as('provider_c');
update public.reviews set published = false, rating = 1 where booking_id = (select id from ids where name = 'done');
select tests.clear_authentication();
select is((select rating::int from public.reviews where booking_id = (select id from ids where name = 'done')), 4,
          'the reviewed provider cannot edit reviews');
select is((select published from public.reviews where booking_id = (select id from ids where name = 'done')), false,
          'the review is still hidden');
select tests.authenticate_as('admin');
select lives_ok($$update public.reviews set published = true where booking_id = (select id from ids where name = 'done')$$,
                'an admin shows it again');
select is((select count(*)::int from public.reviews), 3, 'admin reads every review');

select tests.authenticate_as('provider_b');
select is((select count(*)::int from public.reviews), 1, 'the provider reads the unpublished review');
select throws_ok($$delete from public.reviews$$, '42501', null, 'a provider cannot delete reviews');
select tests.authenticate_as('client_b');
select is((select count(*)::int from public.reviews), 0, 'other users do not read reviews from the table');
select tests.authenticate_anon();
select is(jsonb_array_length(public.get_provider_page('t-bruno') -> 'reviews'), 0,
          'unpublished reviews are not on the public page');

select * from finish();
rollback;
