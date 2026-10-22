-- Payments: read by payer, provider and admin only; writes by the service role only;
-- the Vault secret helper is service-role only.
begin;
select plan(52);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

insert into ids values
  ('booking', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-06-03 09:00')));
insert into public.payments (booking_id, provider_id, payer_id, asaas_payment_id, method, amount_cents, status)
values ((select id from ids where name = 'booking'), tests.uid('provider_c'), tests.uid('client_a'), 'pay_t1', 'pix', 10000, 'pending');
insert into public.payment_events (asaas_event_id, event_type, payload) values ('evt_t1', 'PAYMENT_CREATED', '{}');
insert into public.subscriptions (provider_id, plan, status) values (tests.uid('provider_c'), 'pro', 'active');
insert into public.customer_payment_profiles (user_id, asaas_customer_id) values
  (tests.uid('client_a'), 'cus_t1'), (tests.uid('client_b'), 'cus_t2');
insert into public.subscriptions (provider_id, plan, status) values (tests.uid('provider_d'), 'pro', 'trialing');
update public.payments set raw = '{"id": "pay_t1", "value": 100, "customer": {"name": "Cliente A", "cpfCnpj": "12345678909"}}'
 where asaas_payment_id = 'pay_t1';
insert into public.provider_payment_accounts (provider_id, asaas_account_id, asaas_wallet_id, status)
values (tests.uid('provider_c'), 'acc_t1', 'wal_t1', 'active');

-- anon
select tests.authenticate_anon();
select throws_ok($$select * from public.payments$$, '42501', null, 'anon cannot read payments');
select throws_ok($$select * from public.subscriptions$$, '42501', null, 'anon cannot read subscriptions');

-- payer
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.payments), 1, 'the payer reads the own payment');
select is((select count(*)::int from public.customer_payment_profiles), 1, 'the user reads only the own customer profile');
select is((select asaas_customer_id from public.customer_payment_profiles), 'cus_t1', 'and it is the own one');
select lives_ok($$select id, status, amount_cents, pix_payload from public.payments$$, 'the payer lists the payment columns');
select throws_ok($$select raw from public.payments$$, '42501', null, 'the payer does not read the gateway payload (payer tax data)');
select throws_ok($$select * from public.payments$$, '42501', null, 'select * on payments is denied: columns are listed explicitly');
select throws_ok($$insert into public.payment_events (asaas_event_id, event_type) values ('evt_forged', 'PAYMENT_RECEIVED')$$,
                 '42501', null, 'users cannot write webhook events');
select throws_ok($$select public.admin_get_payment_raw((select id from public.payments limit 1))$$, 'P0001', 'not_allowed',
                 'the payer cannot call the admin payload reader');
select throws_ok($$update public.payments set status = 'received'$$, '42501', null, 'the payer cannot update payments');
select throws_ok(format($$insert into public.payments (provider_id, payer_id, amount_cents, status)
                          values (%L, auth.uid(), 1, 'received')$$, tests.uid('provider_c')),
                 '42501', null, 'the payer cannot insert payments');
select is((select count(*)::int from public.payment_events), 0, 'webhook events are not visible to users');

-- provider
select tests.authenticate_as('provider_c');
select is((select count(*)::int from public.payments), 1, 'the provider reads payments of the own jobs');
select is((select count(*)::int from public.subscriptions), 1, 'the provider reads only the own subscription');
select is((select plan::text from public.subscriptions), 'pro', 'and it is the own one');
select throws_ok($$select raw from public.payments$$, '42501', null, 'the provider does not read the gateway payload either');
select lives_ok($$select id, status, amount_cents, platform_fee_cents from public.payments$$, 'the provider lists the payment columns');
select is((select asaas_wallet_id from public.provider_payment_accounts), 'wal_t1', 'the provider reads the own wallet');
select throws_ok($$select api_key_secret_id from public.provider_payment_accounts$$, '42501', null,
                 'the Vault reference is not exposed to the provider');
select throws_ok($$update public.subscriptions set status = 'canceled'$$, '42501', null,
                 'the provider cannot change the subscription directly');
select throws_ok($$select public.store_provider_payment_secret(auth.uid(), 'sk_test')$$, '42501', null,
                 'store_provider_payment_secret is not executable by users');

-- other users
select tests.authenticate_as('client_b');
select is((select count(*)::int from public.payments), 0, 'another client cannot read the payment');
select is((select asaas_customer_id from public.customer_payment_profiles), 'cus_t2', 'another client reads only the own customer profile');
select is((select count(*)::int from public.subscriptions), 0, 'a client reads no subscription');
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.payments), 0, 'another provider cannot read the payment');
select is((select plan::text from public.subscriptions), 'pro', 'another provider reads only the own subscription');
select is((select status::text from public.subscriptions), 'trialing', 'and not the one of provider C');
select is((select count(*)::int from public.provider_payment_accounts), 0, 'another provider cannot read the account');

-- admin
select tests.authenticate_as('admin');
select is((select count(*)::int from public.payment_events), 1, 'admin reads webhook events');
select throws_ok($$update public.payments set status = 'refunded'$$, '42501', null, 'even admins do not write payments');
select is(public.admin_get_payment_raw((select id from public.payments where asaas_payment_id = 'pay_t1')) -> 'customer' ->> 'cpfCnpj',
          '12345678909', 'an admin reads the gateway payload through the audited function');
select throws_ok($$select public.admin_get_payment_raw(gen_random_uuid())$$, 'P0001', 'not_allowed', 'an unknown payment is refused');
select tests.clear_authentication();
select ok(exists (select 1 from public.audit_log where action = 'payment.raw_viewed' and actor_id = tests.uid('admin')),
          'reading the payload is audited');
select tests.authenticate_as('admin');

-- service role
select tests.authenticate_service();
select lives_ok($$update public.payments set status = 'received' where asaas_payment_id = 'pay_t1'$$,
                'the service role updates payments');
select lives_ok($$insert into ids select 'secret', public.store_provider_payment_secret(tests.uid('provider_c'), 'sk_test_123')$$,
                'the service role stores the subaccount key in the Vault');
select is(public.get_provider_payment_secret(tests.uid('provider_c')), 'sk_test_123', 'the key is read back from the Vault');

select tests.clear_authentication();
select is((select api_key_secret_id from public.provider_payment_accounts where provider_id = tests.uid('provider_c')),
          (select id from ids where name = 'secret'), 'the account points to the Vault secret');

-- ---------------------------------------------------------------- one pending charge per booking / quote
-- Two simultaneous clicks race on the insert: the database lets only one pending charge through
-- (the Edge Functions turn the 23505 of the loser into the winner's charge).
insert into ids values
  ('booking2', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-06-10 09:00')));
insert into public.quotes (provider_id, title, items, status) values (tests.uid('provider_c'), 'Orçamento da cobrança', '[]', 'draft');
insert into ids select 'quote', id from public.quotes where title = 'Orçamento da cobrança';

select lives_ok(format($$insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status)
                         values (%L, %L, %L, 10000, 'pending')$$, (select id from ids where name = 'booking2'),
                        tests.uid('provider_c'), tests.uid('client_a')),
                'the first pending charge of a booking is accepted');
select throws_ok(format($$insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status)
                          values (%L, %L, %L, 10000, 'pending')$$, (select id from ids where name = 'booking2'),
                        tests.uid('provider_c'), tests.uid('client_a')),
                 '23505', null, 'a second pending charge for the same booking is refused (unique violation)');
select lives_ok(format($$insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status)
                         values (%L, %L, %L, 10000, 'received')$$, (select id from ids where name = 'booking2'),
                        tests.uid('provider_c'), tests.uid('client_a')),
                'settled charges of the same booking do not conflict with the pending one');
select lives_ok(format($$update public.payments set status = 'canceled' where booking_id = %L and status = 'pending'$$,
                        (select id from ids where name = 'booking2')),
                'canceling the pending charge frees the booking');
select lives_ok(format($$insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status)
                         values (%L, %L, %L, 10000, 'pending')$$, (select id from ids where name = 'booking2'),
                        tests.uid('provider_c'), tests.uid('client_a')),
                'and a new pending charge is accepted');

select lives_ok(format($$insert into public.payments (quote_id, provider_id, amount_cents, status)
                         values (%L, %L, 5000, 'pending')$$, (select id from ids where name = 'quote'), tests.uid('provider_c')),
                'the first pending charge of a quote is accepted');
select throws_ok(format($$insert into public.payments (quote_id, provider_id, amount_cents, status)
                          values (%L, %L, 5000, 'pending')$$, (select id from ids where name = 'quote'), tests.uid('provider_c')),
                 '23505', null, 'a second pending charge for the same quote is refused (unique violation)');
select lives_ok($$insert into public.payments (provider_id, amount_cents, status) values (tests.uid('provider_c'), 100, 'pending'),
                                                                                         (tests.uid('provider_c'), 200, 'pending')$$,
                'pending charges without booking or quote are not constrained');

-- ---------------------------------------------------------------- subscription_status 'pending'
select enum_has_labels('public', 'subscription_status', array['pending', 'trialing', 'active', 'past_due', 'canceled'],
                       'subscription_status has pending (created, not paid yet)');
insert into public.subscriptions (provider_id, plan, status) values (tests.uid('provider_a'), 'free', 'pending');
select is((select status::text from public.subscriptions where provider_id = tests.uid('provider_a')), 'pending',
          'a subscription can be stored as pending');
select tests.authenticate_as('provider_a');
select is((select status::text from public.subscriptions), 'pending', 'the provider reads the own pending subscription');
select tests.authenticate_as('client_b');
select is((select count(*)::int from public.subscriptions), 0, 'RLS hides a pending subscription from other users');
select tests.authenticate_service();
select lives_ok(format($$update public.subscriptions set status = 'active' where provider_id = %L$$, tests.uid('provider_a')),
                'the service role moves it from pending to active');
select tests.clear_authentication();

select * from finish();
rollback;
