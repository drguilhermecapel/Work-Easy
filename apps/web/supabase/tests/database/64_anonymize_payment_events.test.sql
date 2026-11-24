-- Account deletion and gateway events (migration 20261109100006): anonymize_user keeps only the
-- fiscal fields of the webhook payloads of the account's payments; other payments are untouched.
begin;
select plan(9);
select has_function('public', 'anonymize_user', array['uuid'], 'the anonymization function exists');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

insert into ids values
  ('booking_a', tests.make_booking('provider_a', 'client_b', 't-reparo', tests.sp_period('2030-09-01 09:00'), 'paid')),
  ('booking_b', tests.make_booking('provider_b', 'client_a', 't-reparo', tests.sp_period('2030-09-08 09:00'), 'paid'));
insert into ids select 'payment_a', tests.make_payment((select id from ids where name = 'booking_a'), 'received', 10000);
insert into ids select 'payment_b', tests.make_payment((select id from ids where name = 'booking_b'), 'received', 10000);

insert into public.payment_events (asaas_event_id, payment_id, event_type, payload) values
  ('evt_privtest_a', (select id from ids where name = 'payment_a'), 'PAYMENT_RECEIVED',
   '{"event": "PAYMENT_RECEIVED", "payment": {"id": "pay_privtest_a", "customer": "cus_privtest", "status": "RECEIVED",
     "value": 100, "netValue": 95, "invoiceNumber": "77", "invoiceUrl": "https://example.test/nf/77",
     "externalReference": "ref-privtest", "description": "Servico privtest", "billingType": "PIX"}}'),
  ('evt_privtest_b', (select id from ids where name = 'payment_b'), 'PAYMENT_RECEIVED',
   '{"event": "PAYMENT_RECEIVED", "payment": {"id": "pay_privtest_b", "customer": "cus_other", "value": 100}}');

select tests.authenticate_service();
select public.anonymize_user(tests.uid('provider_a'));
select tests.clear_authentication();

select is((select payload #>> '{payment,customer}' from public.payment_events where asaas_event_id = 'evt_privtest_a'), null,
          'the customer id of the payer is removed from the webhook payload');
select is((select payload #>> '{payment,invoiceUrl}' from public.payment_events where asaas_event_id = 'evt_privtest_a'), null,
          'the invoice link is removed from the webhook payload');
select is((select payload #>> '{payment,description}' from public.payment_events where asaas_event_id = 'evt_privtest_a'), null,
          'the description of the service is removed from the webhook payload');
select is((select payload #>> '{payment,externalReference}' from public.payment_events where asaas_event_id = 'evt_privtest_a'), null,
          'the external reference is removed from the webhook payload');
select is((select payload #>> '{payment,value}' from public.payment_events where asaas_event_id = 'evt_privtest_a'), '100',
          'the amount stays for the tax records');
select is((select payload #>> '{payment,id}' from public.payment_events where asaas_event_id = 'evt_privtest_a'), 'pay_privtest_a',
          'the payment id stays for the tax records');
select is((select payload ->> 'event' from public.payment_events where asaas_event_id = 'evt_privtest_a'), 'PAYMENT_RECEIVED',
          'the event type stays');
select is((select payload #>> '{payment,customer}' from public.payment_events where asaas_event_id = 'evt_privtest_b'), 'cus_other',
          'the payload of another account is untouched');

select * from finish();
rollback;
