-- LGPD and audit: consent history is insert-only and written by the server clock, data
-- requests, the audit log is append-only for every role, log_event (an app user cannot pass
-- for the system), anonymization (what is erased, what stays for tax records, the Storage
-- order) and what really happens to history when an account is deleted.
begin;
select plan(77);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ consents
select tests.authenticate_as('client_a');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('terms', '2026-10', true)$$,
                'user records a consent');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('marketing', '2026-10', false)$$,
                'user records a refusal');
select is((select count(*)::int from public.consents), 2, 'user reads the own consent history');
select ok((select min(at) >= now() - interval '1 minute' and max(at) <= now() from public.consents),
          'the time of a consent is the server time');
select throws_ok($$update public.consents set granted = true$$, '42501', null, 'consents are never updated');
select throws_ok($$delete from public.consents$$, '42501', null, 'consents are never deleted');
select throws_ok(format($$insert into public.consents (user_id, purpose, version, granted) values (%L, 'terms', '1', true)$$,
                        tests.uid('client_b')),
                 '42501', null, 'nobody records consent for someone else');
select throws_ok($$insert into public.consents (purpose, version, granted, at) values ('marketing', 'v1', false, '2020-01-01')$$,
                 '42501', null, 'the history cannot be backdated (at)');
select throws_ok($$insert into public.consents (purpose, version, granted, created_at) values ('marketing', 'v1', false, '2020-01-01')$$,
                 '42501', null, 'the history cannot be backdated (created_at)');
select lives_ok($$insert into public.data_requests (kind) values ('export')$$, 'user opens a data export request');
select throws_ok($$insert into public.data_requests (kind, status) values ('delete', 'completed')$$, '42501', null,
                 'a user cannot open a request already completed');
select throws_ok($$insert into public.data_requests (kind, completed_at) values ('export', '2020-01-01')$$, '42501', null,
                 'a user cannot fill completed_at');
select throws_ok($$insert into public.data_requests (kind, result_path) values ('export', 'exports/outro/export.json')$$, '42501', null,
                 'a user cannot choose the result path of an export');
select throws_ok($$update public.data_requests set status = 'completed'$$, '42501', null, 'a user cannot change the status of a request');
select is((select status || '/' || coalesce(result_path, 'none') from public.data_requests), 'pending/none',
          'a new request is pending with no result');
select tests.authenticate_as('client_b');
select is((select count(*)::int from public.consents), 0, 'another user cannot read the consents');
select is((select count(*)::int from public.data_requests), 0, 'another user cannot read the data requests');
select tests.authenticate_as('admin');
select is((select count(*)::int from public.consents where user_id = tests.uid('client_a')), 2, 'admin reads the consents');
select tests.authenticate_service();
select throws_ok($$update public.consents set granted = true$$, '42501', null, 'the service role cannot change the consent history');
select tests.authenticate_anon();
select throws_ok($$insert into public.consents (purpose, version, granted) values ('terms', '1', true)$$, '42501', null,
                 'anon cannot record consents');

-- ================================================================ audit log
select tests.authenticate_as('client_a');
select ok(public.log_event('client.account_viewed', 'profile', auth.uid()::text, '{"screen": "conta"}') > 0,
          'log_event writes an entry in the client namespace');
select is((select count(*)::int from public.audit_log), 0, 'non-admins cannot read the audit log');
select throws_ok($$insert into public.audit_log (action, entity) values ('fake', 'x')$$, '42501', null,
                 'users cannot insert into audit_log directly');
select throws_ok($$update public.audit_log set action = 'x'$$, '42501', null, 'authenticated cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'authenticated cannot delete audit_log');
-- an app user cannot write entries that look like the system's
select throws_ok($$select public.log_event('booking.transition', 'booking', gen_random_uuid()::text)$$, 'P0001', 'not_allowed',
                 'a user cannot write a booking.transition entry');
select throws_ok($$select public.log_event('user.anonymized', 'profile', gen_random_uuid()::text, '{"via": "service"}')$$,
                 'P0001', 'not_allowed', 'nor a user.anonymized entry');
select throws_ok($$select public.log_event('payment.received', 'payment')$$, 'P0001', 'not_allowed', 'nor a payment entry');
select throws_ok($$select public.log_event('client.big', 'profile', null, jsonb_build_object('x', repeat('a', 5000)))$$,
                 'P0001', 'not_allowed', 'the payload of a user entry is small');
select throws_ok($$select public.log_event('client.list', 'profile', null, '[1, 2]')$$, 'P0001', 'not_allowed',
                 'the payload of a user entry is an object');
select throws_ok($$select public.log_event('client.x', 'profile', repeat('a', 201))$$, 'P0001', 'not_allowed',
                 'the entity id has a size limit');
select lives_ok($$select public.log_event('client.n' || g, 'profile') from generate_series(1, 59) g$$,
                'a user writes up to 60 entries a minute');
select throws_ok($$select public.log_event('client.one_too_many', 'profile')$$, 'P0001', 'not_allowed',
                 'the 61st entry in a minute is refused');
select tests.authenticate_anon();
select throws_ok($$select public.log_event('client.x', 'y')$$, '42501', null, 'anon cannot call log_event');
select tests.authenticate_service();
select throws_ok($$update public.audit_log set action = 'x'$$, '42501', null, 'the service role cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'the service role cannot delete audit_log');
select ok(public.log_event('payment.created', 'payment', 'pay_1', '{"amount": 100}') > 0,
          'the service role (Edge Functions) records system actions');
select tests.clear_authentication();
select throws_ok($$update public.audit_log set action = 'x'$$, 'P0001', 'not_allowed', 'even the owner cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, 'P0001', 'not_allowed', 'even the owner cannot delete audit_log');
select throws_ok($$truncate public.audit_log$$, 'P0001', 'not_allowed', 'even the owner cannot truncate audit_log');
select is((select actor_id from public.audit_log where action = 'client.account_viewed'), tests.uid('client_a'),
          'the actor is the caller');
select is((select data ->> 'via' from public.audit_log where action = 'client.account_viewed'), 'user',
          'a user entry is marked via user');
select is((select data ->> 'via' || '/' || coalesce(actor_id::text, 'none') from public.audit_log where action = 'payment.created'),
          'service/none', 'a service entry is marked via service and has no user actor');
select tests.authenticate_as('admin');
select ok((select count(*) from public.audit_log) > 0, 'admins read the audit log');

-- ================================================================ anonymization
select tests.clear_authentication();
insert into ids values
  ('booking', tests.make_booking('provider_a', 'client_a', 't-reparo', tests.sp_period('2029-02-05 09:00'), 'completed'));
update public.bookings set notes = 'Portão azul', canceled_reason = 'Chuva'
 where id = (select id from ids where name = 'booking');
insert into public.booking_events (booking_id, from_status, to_status, reason)
values ((select id from ids where name = 'booking'), 'accepted', 'canceled', 'Telefone 11 98888-0000');
insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status, raw, invoice_url, pix_payload)
values ((select id from ids where name = 'booking'), tests.uid('provider_a'), tests.uid('client_a'), 10000, 'received',
        '{"id": "pay_1", "value": 100, "status": "RECEIVED", "dueDate": "2029-02-06",
          "customer": {"name": "Cliente A", "email": "client_a@test.local", "cpfCnpj": "12345678909"}}',
        'https://example.test/i/1', '000201...');
insert into public.provider_clients (provider_id, client_id, name, phone, origin)
values (tests.uid('provider_c'), tests.uid('client_a'), 'Cliente A', '5511900000001', 'platform');
insert into public.households (owner_id, name, notes) values (tests.uid('client_a'), 'Casa da vó', 'Portão verde');
insert into public.care_recipients (household_id, first_name, birth_year, preferences, emergency_contact)
values ((select id from public.households where name = 'Casa da vó'), 'Lúcia', 1940, 'Gosta de rádio', 'Filho 11 90000-0000');
insert into public.shifts (household_id, period, rate_cents) values
  ((select id from public.households where name = 'Casa da vó'), tests.sp_period('2029-03-05 08:00', 8), 30000);
insert into public.quotes (provider_id, title, items, client_name, client_phone, status, valid_until)
values (tests.uid('provider_a'), 'Orçamento aceito', '[]', 'Seu João', '5511977776666', 'accepted', current_date + 5);
insert into public.subscriptions (provider_id, plan, status) values (tests.uid('provider_a'), 'pro', 'active');
-- A provider's identity file sits in Storage.
insert into storage.objects (bucket_id, name) values ('provider-documents', tests.uid('provider_a') || '/selfie.pdf');
insert into public.provider_documents (provider_id, step, storage_path)
values (tests.uid('provider_a'), 'documento_selfie', tests.uid('provider_a') || '/selfie.pdf');

select tests.authenticate_as('client_a');
select throws_ok($$select public.anonymize_user(auth.uid())$$, '42501', null, 'users cannot call anonymize_user');

select tests.authenticate_service();
select throws_ok($$select public.anonymize_user(gen_random_uuid())$$, 'P0001', 'not_allowed', 'an unknown user is refused');
select throws_ok($$select public.anonymize_user(tests.uid('provider_a'))$$, 'P0001', 'storage_not_empty',
                 'a provider with files in Storage is not anonymized: the files go first (Storage, anonymize, Auth)');
select tests.clear_authentication();
-- what account-delete does through the Storage API before calling anonymize_user
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'provider-documents' and name = tests.uid('provider_a') || '/selfie.pdf';
select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('provider_a'))$$, 'service role anonymizes a provider');
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$, 'service role anonymizes a client');
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$, 'anonymize_user is idempotent');
select tests.clear_authentication();
select is((select coalesce(full_name, '') || coalesce(phone, '') || (deleted_at is not null)::text
             from public.profiles where id = tests.uid('client_a')), 'true',
          'profile: name and phone erased, deleted_at set');
select is((select display_name || '/' || status::text || '/' || coalesce(bio, '') from public.providers
            where id = tests.uid('provider_a')), 'Prestador removido/suspended/',
          'provider page erased and suspended');
select is(public.get_provider_page('t-ana'), null, 'the public page of an anonymized provider is gone');
select is((select count(*)::int from public.search_providers('t-reparo') where slug = 't-ana'), 0,
          'an anonymized provider leaves the search');
select is((select count(*)::int from public.provider_documents where provider_id = tests.uid('provider_a')), 0,
          'the document records of the provider are erased');
select is((select name || coalesce(phone, '') from public.provider_clients
            where provider_id = tests.uid('provider_c') and client_id = tests.uid('client_a')), 'Cliente removido',
          'CRM entries about the client are erased');
select is((select count(*)::int from public.bookings where id = (select id from ids where name = 'booking')), 1,
          'the job is kept');
select is((select coalesce(notes, '') || coalesce(canceled_reason, '') from public.bookings
            where id = (select id from ids where name = 'booking')), '', 'but its notes and cancel reason are erased');
select is((select reason from public.booking_events where booking_id = (select id from ids where name = 'booking')
              and to_status = 'canceled'), null, 'the free-text reason of the job events is erased');
select is((select count(*)::int from public.payments where booking_id = (select id from ids where name = 'booking')), 1,
          'payments are kept for tax records');
select is((select raw::text from public.payments where booking_id = (select id from ids where name = 'booking')),
          '{"id": "pay_1", "value": 100, "status": "RECEIVED", "dueDate": "2029-02-06"}',
          'the gateway payload keeps the fiscal fields only (no payer name, CPF/CNPJ or e-mail)');
select is((select coalesce(invoice_url, '') || coalesce(pix_payload, '') from public.payments
            where booking_id = (select id from ids where name = 'booking')), '', 'and the payment pages are dropped');
select is((select count(*)::int from public.notifications where user_id = tests.uid('client_a') and (phone is not null or email is not null)),
          0, 'notifications lose contact data');
select is((select h.name || '/' || coalesce(h.notes, '') || '/' || cr.first_name || '/' || coalesce(cr.emergency_contact, '')
             || coalesce(cr.preferences, '')
             from public.households h join public.care_recipients cr on cr.household_id = h.id
            where h.owner_id = tests.uid('client_a')), 'Removida//Removido/', 'household and care recipient data are erased');
select ok(exists (select 1 from public.audit_log where action = 'user.anonymized' and entity_id = tests.uid('client_a')::text),
          'anonymization is audited');

-- ================================================================ what an account deletion keeps
-- History is kept (anonymized): jobs, job events, payments, reviews, CRM entries. Everything
-- else that belongs to the account goes with it: families lose their households, recipients,
-- shifts, check-ins and reports (no payment of the platform is tied to a shift), providers
-- lose quotes and the subscription state (the charges stay in payments). The foreign keys
-- pin that decision.
select is(
  (select array_agg(x order by x collate "C") from (
     select c.conrelid::regclass::text || '.' || a.attname::text || '=' || c.confdeltype::text as x
       from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f' and c.connamespace = 'public'::regnamespace
        and c.conrelid in ('public.bookings'::regclass, 'public.booking_events'::regclass, 'public.payments'::regclass,
                           'public.payment_events'::regclass, 'public.reviews'::regclass, 'public.shifts'::regclass,
                           'public.checkins'::regclass, 'public.daily_reports'::regclass, 'public.households'::regclass,
                           'public.quotes'::regclass, 'public.subscriptions'::regclass, 'public.data_requests'::regclass,
                           'public.provider_clients'::regclass, 'public.notifications'::regclass, 'public.consents'::regclass)
   ) q),
  array['booking_events.booking_id=c', 'bookings.client_id=n', 'bookings.household_id=n', 'bookings.occupation_slug=a', 'bookings.proposal_id=n',
        'bookings.provider_client_id=n', 'bookings.provider_id=n', 'bookings.request_id=n', 'bookings.service_id=n',
        'checkins.provider_id=n', 'checkins.shift_id=c', 'consents.user_id=c', 'daily_reports.provider_id=n',
        'daily_reports.shift_id=c', 'data_requests.user_id=n', 'households.neighborhood_id=a', 'households.owner_id=c', 'notifications.user_id=c',
        'payment_events.payment_id=n', 'payments.booking_id=n', 'payments.payer_id=n', 'payments.provider_id=n',
        'payments.quote_id=n', 'provider_clients.client_id=n', 'provider_clients.provider_id=c',
        'quotes.provider_client_id=n', 'quotes.provider_id=c', 'reviews.booking_id=c', 'reviews.client_id=n',
        'reviews.provider_id=n', 'shifts.care_recipient_id=n', 'shifts.household_id=c', 'shifts.provider_id=n',
        'subscriptions.provider_id=c'],
  'the delete rule of every history table is pinned (tax history set null, family and provider data cascade)');

-- The real delete of the accounts, one after the other (the transaction is rolled back at the
-- end of the file; deleting both in one statement would re-check the rows this test just created).
delete from auth.users where id = tests.uid('client_a');
select is((select client_id from public.bookings where id = (select id from ids where name = 'booking')), null,
          'deleting the client keeps the job with a null client');
select is((select count(*)::int from public.payments where booking_id = (select id from ids where name = 'booking')), 1,
          'and the payment');
select is((select payer_id from public.payments where booking_id = (select id from ids where name = 'booking')), null,
          'with a null payer');
select is((select count(*)::int from public.shifts where rate_cents = 30000), 0,
          'the shifts of the family are erased with the account (they are not tax records)');
select is((select count(*)::int from public.households where name in ('Casa da vó', 'Removida')), 0, 'and so are its households');
select is((select count(*)::int from public.provider_clients where provider_id = tests.uid('provider_c')
              and name = 'Cliente removido'), 1, 'the CRM entry of the provider is kept, anonymized');
delete from auth.users where id = tests.uid('provider_a');
select is((select provider_id from public.bookings where id = (select id from ids where name = 'booking')), null,
          'deleting the provider keeps the job with a null provider');
select is((select count(*)::int from public.payments where booking_id = (select id from ids where name = 'booking')), 1,
          'and the payment');
select is((select count(*)::int from public.quotes where title = 'Orçamento aceito'), 0, 'the quotes of the provider are erased');
select is((select count(*)::int from public.subscriptions where plan = 'pro' and status = 'active'), 0,
          'and the subscription state');

select * from finish();
rollback;
