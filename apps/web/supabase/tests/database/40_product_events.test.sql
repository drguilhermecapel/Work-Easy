-- Product events (migration 20261108100000): each funnel step is recorded once, props hold
-- no personal data, the API roles cannot read or write the table, admins read it through
-- admin_funnel_daily, the day is the São Paulo calendar day, and the retention job exists.
begin;
select plan(49);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ---------------------------------------------------------------- request and proposal
insert into public.requests (client_id, occupation_slug, neighborhood_id, description) values
  (tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pia entupida no banheiro'),
  (tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'),
   'Contato ana@exemplo.com, (11) 99999-1234, CPF 123.456.789-09');
insert into ids select 'req', id from public.requests where description = 'Pia entupida no banheiro';
insert into ids select 'req_pii', id from public.requests where description like 'Contato%';

select is((select count(*)::int from public.product_events
            where event = 'request_created' and subject_id = (select id from ids where name = 'req')), 1,
          'a request is recorded once');
select is((select user_id from public.product_events
            where event = 'request_created' and subject_id = (select id from ids where name = 'req')),
          tests.uid('client_a'), 'the request event belongs to the client');
select is((select props ->> 'occupation_slug' from public.product_events
            where event = 'request_created' and subject_id = (select id from ids where name = 'req')),
          't-reparo', 'the request event carries the occupation id, not its name');
select ok(not exists (select 1 from public.product_events
                       where subject_id = (select id from ids where name = 'req_pii')
                         and props::text ~ '(@|[0-9]{4})'),
          'a request with e-mail, phone and CPF in its text puts no personal data in props');

insert into public.proposals (request_id, provider_id, price_cents) values
  ((select id from ids where name = 'req'), tests.uid('provider_c'), 9000);
select is((select count(*)::int from public.product_events
            where event = 'proposal_sent' and subject_id = (select id from ids where name = 'req')), 1,
          'a proposal is recorded once, about its request');
select is((select user_id from public.product_events
            where event = 'proposal_sent' and subject_id = (select id from ids where name = 'req')),
          tests.uid('provider_c'), 'the proposal event belongs to the provider');

-- ---------------------------------------------------------------- bookings
insert into ids values
  ('b_req', tests.make_booking('provider_a', 'client_b', 't-reparo', tests.sp_period('2031-03-10 09:00'), 'requested')),
  ('b_direct', tests.make_booking('provider_a', 'client_b', 't-reparo', tests.sp_period('2031-03-11 09:00'), 'accepted'));

select is((select count(*)::int from public.product_events
            where event = 'booking_requested' and subject_id = (select id from ids where name = 'b_req')), 1,
          'a requested booking is recorded as requested');
select is((select count(*)::int from public.product_events
            where event = 'booking_accepted' and subject_id = (select id from ids where name = 'b_req')), 0,
          'a requested booking is not accepted yet');
update public.bookings set status = 'accepted' where id = (select id from ids where name = 'b_req');
select is((select count(*)::int from public.product_events
            where event = 'booking_accepted' and subject_id = (select id from ids where name = 'b_req')), 1,
          'accepting a booking records booking_accepted once');
update public.bookings set status = 'accepted' where id = (select id from ids where name = 'b_req');
select is((select count(*)::int from public.product_events
            where event = 'booking_accepted' and subject_id = (select id from ids where name = 'b_req')), 1,
          'an update that keeps the status records nothing new');
select is((select user_id from public.product_events
            where event = 'booking_accepted' and subject_id = (select id from ids where name = 'b_req')),
          tests.uid('provider_a'), 'the acceptance belongs to the provider');
select is((select props ->> 'origin' from public.product_events
            where event = 'booking_accepted' and subject_id = (select id from ids where name = 'b_req')),
          'platform', 'the booking event carries the origin enum');
select is((select count(*)::int from public.product_events
            where event = 'booking_requested' and subject_id = (select id from ids where name = 'b_direct')), 0,
          'a booking created already accepted is not recorded as requested');
select is((select count(*)::int from public.product_events
            where event = 'booking_accepted' and subject_id = (select id from ids where name = 'b_direct')), 1,
          'a booking created already accepted is recorded as accepted');

-- ---------------------------------------------------------------- payments
insert into ids values
  ('pay', tests.make_payment((select id from ids where name = 'b_direct'), 'pending'));
select is((select count(*)::int from public.product_events
            where event = 'payment_received' and subject_id = (select id from ids where name = 'b_direct')), 0,
          'a pending payment is not recorded');
update public.payments set status = 'confirmed' where id = (select id from ids where name = 'pay');
update public.payments set status = 'received' where id = (select id from ids where name = 'pay');
select is((select count(*)::int from public.product_events
            where event = 'payment_received' and subject_id = (select id from ids where name = 'b_direct')), 1,
          'a payment confirmed and then received is recorded once');
select is((select props ->> 'method' from public.product_events
            where event = 'payment_received' and subject_id = (select id from ids where name = 'b_direct')),
          'undefined', 'the payment event carries the method enum');

-- ---------------------------------------------------------------- provider onboarding
select tests.create_user('provider_f', 'Fabio Teste', null);
update public.profiles set role = 'provider' where id = tests.uid('provider_f');
insert into public.providers (id, display_name, slug, status) values
  (tests.uid('provider_f'), 'Fabio Teste', 't-fabio', 'draft');
update public.providers set status = 'pending_review' where id = tests.uid('provider_f');
update public.providers set status = 'pending_review' where id = tests.uid('provider_f');
select is((select count(*)::int from public.product_events
            where event = 'provider_submitted' and subject_id = tests.uid('provider_f')), 1,
          'a provider submitted for review is recorded once');
update public.providers set status = 'approved' where id = tests.uid('provider_f');
select is((select count(*)::int from public.product_events
            where event = 'provider_approved' and subject_id = tests.uid('provider_f')), 1,
          'a provider approved by an admin is recorded once');

insert into public.provider_occupations (provider_id, occupation_slug, approved) values
  (tests.uid('provider_f'), 't-domestica', false);
select is((select count(*)::int from public.product_events
            where event = 'occupation_approved' and subject_id = tests.uid('provider_f')), 0,
          'an occupation that is not approved is not recorded');
update public.provider_occupations set approved = true
 where provider_id = tests.uid('provider_f') and occupation_slug = 't-domestica';
select is((select count(*)::int from public.product_events
            where event = 'occupation_approved' and subject_id = tests.uid('provider_f')), 1,
          'an occupation approved is recorded once');
select is((select props ->> 'occupation_slug' from public.product_events
            where event = 'occupation_approved' and subject_id = tests.uid('provider_f')), 't-domestica',
          'the occupation event carries the occupation id');

-- ---------------------------------------------------------------- Pro
insert into public.subscriptions (provider_id, plan, status) values
  (tests.uid('provider_e'), 'pro', 'trialing');
select is((select count(*)::int from public.product_events
            where event = 'pro_trial_started' and subject_id = tests.uid('provider_e')), 1,
          'a trial subscription is recorded as a started trial');
update public.subscriptions set status = 'active' where provider_id = tests.uid('provider_e');
update public.subscriptions set status = 'active' where provider_id = tests.uid('provider_e');
select is((select count(*)::int from public.product_events
            where event = 'pro_subscribed' and subject_id = tests.uid('provider_e')), 1,
          'a subscription that becomes active is recorded once as subscribed');
select is((select props ->> 'plan' from public.product_events
            where event = 'pro_subscribed' and subject_id = tests.uid('provider_e')), 'pro',
          'the subscription event carries the plan enum');

-- ---------------------------------------------------------------- reviews
insert into public.reviews (booking_id, client_id, provider_id, rating, published) values
  ((select id from ids where name = 'b_req'), tests.uid('client_b'), tests.uid('provider_a'), 5, false);
select is((select count(*)::int from public.product_events
            where event = 'review_published' and subject_id = (select id from ids where name = 'b_req')), 0,
          'an unpublished review is not recorded');
update public.reviews set published = true where booking_id = (select id from ids where name = 'b_req');
update public.reviews set published = true where booking_id = (select id from ids where name = 'b_req');
select is((select count(*)::int from public.product_events
            where event = 'review_published' and subject_id = (select id from ids where name = 'b_req')), 1,
          'a review published is recorded once, about its booking');

-- ---------------------------------------------------------------- shape of the rows
select ok(not exists (select 1 from public.product_events where props::text ~ '(@|[0-9]{4})'),
          'no event carries an e-mail, a phone or a document in props');
select ok(not exists (select 1 from public.product_events where props::text like '%"name"%'),
          'no event carries a name in props');
select throws_ok($$insert into public.product_events (event) values ('login')$$, '23514',
                 'an event outside the enumerated list is refused');
select throws_ok($$insert into public.product_events (event, props)
                   values ('provider_submitted', jsonb_build_object('x', repeat('a', 600)))$$, '23514',
                 'props of 512 bytes or more are refused');

-- The day is the São Paulo calendar day: 23:30 in São Paulo is already 02:30 UTC the next day.
insert into public.product_events (occurred_at, event, subject_id) values
  (tests.sp('2030-12-31 23:30'), 'provider_submitted', '00000000-0000-4000-8000-000000000001');
select is((select day from public.product_events where subject_id = '00000000-0000-4000-8000-000000000001'),
          '2030-12-31'::date, 'the day is the São Paulo calendar day, not the UTC day');

-- ---------------------------------------------------------------- roles
select tests.authenticate_anon();
select throws_ok('select count(*) from public.product_events', '42501',
                 'anon cannot read product events');
select throws_ok($$insert into public.product_events (event) values ('provider_submitted')$$, '42501',
                 'anon cannot write product events');
select tests.clear_authentication();

select tests.authenticate_as('client_a');
select is((select count(*)::int from public.product_events), 0,
          'a client reads no product events (only admins pass the policy)');
select throws_ok($$insert into public.product_events (event) values ('provider_submitted')$$, '42501',
                 'a client cannot insert product events');
select throws_ok($$update public.product_events set event = event$$, '42501',
                 'a client cannot update product events');
select throws_ok($$delete from public.product_events$$, '42501',
                 'a client cannot delete product events');
select throws_ok($$select * from public.admin_funnel_daily(date '2030-06-01', date '2030-06-10')$$, 'P0001',
                 'not_allowed', 'a client cannot run the funnel report');
select tests.clear_authentication();

select tests.authenticate_as('admin');
select ok((select count(*) from public.product_events) > 0, 'an admin reads product events');
select tests.clear_authentication();

-- ---------------------------------------------------------------- admin reading
insert into public.product_events (occurred_at, event) values
  (tests.sp('2030-06-10 10:00'), 'review_published'),
  (tests.sp('2030-06-10 11:00'), 'review_published'),
  (tests.sp('2030-06-10 12:00'), 'booking_accepted');

select tests.authenticate_as('admin');
select results_eq($$select day::text, event, events::int from public.admin_funnel_daily(date '2030-06-10', date '2030-06-10')$$,
                  $$values ('2030-06-10'::text, 'booking_accepted'::text, 1), ('2030-06-10'::text, 'review_published'::text, 2)$$,
                  'the funnel report counts the events of each day and event');
select throws_ok($$select * from public.admin_funnel_daily(date '2030-06-10', date '2030-06-01')$$, '22023',
                 'a report with the end before the start is refused');
select throws_ok($$select * from public.admin_funnel_daily(null, date '2030-06-01')$$, '22023',
                 'a report without a start date is refused');
select tests.clear_authentication();

select ok(not has_function_privilege('anon', 'public.admin_funnel_daily(date, date)', 'execute'),
          'anon cannot run the funnel report');
select ok(not has_function_privilege('authenticated', 'private.track_request()', 'execute'),
          'the trigger functions are not callable by the API roles');

-- ---------------------------------------------------------------- retention
select results_eq($$select jobname::text from cron.job where jobname = 'product-events-retention'$$,
                  array['product-events-retention'], 'the retention job exists');
insert into public.product_events (occurred_at, event, subject_id) values
  (now() - interval '401 days', 'provider_submitted', '00000000-0000-4000-8000-000000000401'),
  (now() - interval '399 days', 'provider_submitted', '00000000-0000-4000-8000-000000000399');
select private.purge_product_events();
select is((select count(*)::int from public.product_events
            where subject_id = '00000000-0000-4000-8000-000000000401'), 0,
          'the retention deletes an event older than 400 days');
select is((select count(*)::int from public.product_events
            where subject_id = '00000000-0000-4000-8000-000000000399'), 1,
          'an event 399 days old is kept');

select * from finish();
rollback;
