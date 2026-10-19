-- Payments: read by payer, provider and admin only; writes by the service role only;
-- the Vault secret helper is service-role only.
begin;
select plan(22);
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

insert into ids values
  ('booking', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-06-03 09:00')));
insert into public.payments (booking_id, provider_id, payer_id, asaas_payment_id, method, amount_cents, status)
values ((select id from ids where name = 'booking'), tests.uid('provider_c'), tests.uid('client_a'), 'pay_t1', 'pix', 10000, 'pending');
insert into public.payment_events (asaas_event_id, event_type, payload) values ('evt_t1', 'PAYMENT_CREATED', '{}');
insert into public.subscriptions (provider_id, plan, status) values (tests.uid('provider_c'), 'pro', 'active');
insert into public.customer_payment_profiles (user_id, asaas_customer_id) values (tests.uid('client_a'), 'cus_t1');
insert into public.provider_payment_accounts (provider_id, asaas_account_id, asaas_wallet_id, status)
values (tests.uid('provider_c'), 'acc_t1', 'wal_t1', 'active');

-- anon
select tests.authenticate_anon();
select throws_ok($$select * from public.payments$$, '42501', null, 'anon cannot read payments');
select throws_ok($$select * from public.subscriptions$$, '42501', null, 'anon cannot read subscriptions');

-- payer
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.payments), 1, 'the payer reads the own payment');
select is((select count(*)::int from public.customer_payment_profiles), 1, 'the user reads the own customer profile');
select throws_ok($$update public.payments set status = 'received'$$, '42501', null, 'the payer cannot update payments');
select throws_ok(format($$insert into public.payments (provider_id, payer_id, amount_cents, status)
                          values (%L, auth.uid(), 1, 'received')$$, tests.uid('provider_c')),
                 '42501', null, 'the payer cannot insert payments');
select is((select count(*)::int from public.payment_events), 0, 'webhook events are not visible to users');

-- provider
select tests.authenticate_as('provider_c');
select is((select count(*)::int from public.payments), 1, 'the provider reads payments of the own jobs');
select is((select count(*)::int from public.subscriptions), 1, 'the provider reads the own subscription');
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
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.payments), 0, 'another provider cannot read the payment');
select is((select count(*)::int from public.provider_payment_accounts), 0, 'another provider cannot read the account');

-- admin
select tests.authenticate_as('admin');
select is((select count(*)::int from public.payment_events), 1, 'admin reads webhook events');
select throws_ok($$update public.payments set status = 'refunded'$$, '42501', null, 'even admins do not write payments');

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

select * from finish();
rollback;
