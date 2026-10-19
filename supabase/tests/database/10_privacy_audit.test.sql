-- LGPD and audit: consent history is insert-only, data requests, the audit log is
-- append-only for every role, log_event, anonymization and account deletion.
begin;
select plan(33);
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
select throws_ok($$update public.consents set granted = true$$, '42501', null, 'consents are never updated');
select throws_ok($$delete from public.consents$$, '42501', null, 'consents are never deleted');
select throws_ok(format($$insert into public.consents (user_id, purpose, version, granted) values (%L, 'terms', '1', true)$$,
                        tests.uid('client_b')),
                 '42501', null, 'nobody records consent for someone else');
select lives_ok($$insert into public.data_requests (kind) values ('export')$$, 'user opens a data export request');
select throws_ok($$insert into public.data_requests (kind, status) values ('delete', 'completed')$$, '42501', null,
                 'a user cannot open a request already completed');
select tests.authenticate_as('client_b');
select is((select count(*)::int from public.consents), 0, 'another user cannot read the consents');
select is((select count(*)::int from public.data_requests), 0, 'another user cannot read the data requests');
select tests.authenticate_anon();
select throws_ok($$insert into public.consents (purpose, version, granted) values ('terms', '1', true)$$, '42501', null,
                 'anon cannot record consents');

-- ================================================================ audit log
select tests.authenticate_as('client_a');
select ok(public.log_event('account.viewed', 'profile', auth.uid()::text, '{"screen": "conta"}') > 0,
          'log_event writes an entry');
select is((select count(*)::int from public.audit_log), 0, 'non-admins cannot read the audit log');
select throws_ok($$insert into public.audit_log (action, entity) values ('fake', 'x')$$, '42501', null,
                 'users cannot insert into audit_log directly');
select throws_ok($$update public.audit_log set action = 'x'$$, '42501', null, 'authenticated cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'authenticated cannot delete audit_log');
select tests.authenticate_anon();
select throws_ok($$select public.log_event('x', 'y')$$, '42501', null, 'anon cannot call log_event');
select tests.authenticate_service();
select throws_ok($$update public.audit_log set action = 'x'$$, '42501', null, 'the service role cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, '42501', null, 'the service role cannot delete audit_log');
select tests.clear_authentication();
select throws_ok($$update public.audit_log set action = 'x'$$, 'P0001', 'not_allowed', 'even the owner cannot update audit_log');
select throws_ok($$delete from public.audit_log$$, 'P0001', 'not_allowed', 'even the owner cannot delete audit_log');
select throws_ok($$truncate public.audit_log$$, 'P0001', 'not_allowed', 'even the owner cannot truncate audit_log');
select is((select actor_id from public.audit_log where action = 'account.viewed'), tests.uid('client_a'),
          'the actor is the caller');
select tests.authenticate_as('admin');
select ok((select count(*) from public.audit_log) > 0, 'admins read the audit log');

-- ================================================================ anonymization
select tests.clear_authentication();
insert into ids values
  ('booking', tests.make_booking('provider_a', 'client_a', 't-reparo', tests.sp_period('2029-02-05 09:00'), 'completed'));
insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status)
values ((select id from ids where name = 'booking'), tests.uid('provider_a'), tests.uid('client_a'), 10000, 'received');
insert into public.provider_clients (provider_id, client_id, name, phone, origin)
values (tests.uid('provider_c'), tests.uid('client_a'), 'Cliente A', '5511900000001', 'platform');

select tests.authenticate_as('client_a');
select throws_ok($$select public.anonymize_user(auth.uid())$$, '42501', null, 'users cannot call anonymize_user');

select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('provider_a'))$$, 'service role anonymizes a provider');
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$, 'service role anonymizes a client');
select tests.clear_authentication();
select is((select coalesce(full_name, '') || coalesce(phone, '') || (deleted_at is not null)::text
             from public.profiles where id = tests.uid('client_a')), 'true',
          'profile: name and phone erased, deleted_at set');
select is((select display_name || '/' || status::text || '/' || coalesce(bio, '') from public.providers
            where id = tests.uid('provider_a')), 'Prestador removido/suspended/',
          'provider page erased and suspended');
select is((select name || coalesce(phone, '') from public.provider_clients
            where provider_id = tests.uid('provider_c') and client_id = tests.uid('client_a')), 'Cliente removido',
          'CRM entries about the client are erased');
select is((select count(*)::int from public.payments where booking_id = (select id from ids where name = 'booking')), 1,
          'payments are kept for tax records');
select ok(exists (select 1 from public.audit_log where action = 'user.anonymized' and entity_id = tests.uid('client_a')::text),
          'anonymization is audited');

-- Deleting the auth user afterwards keeps jobs and payments: their links to people are
-- "on delete set null" (checked in the catalog; a same-transaction delete would trip the
-- foreign key re-check on rows created by this test).
select results_eq(
  $$select c.conrelid::regclass::text || '.' || (a.attname::text collate "default") || '=' || c.confdeltype::text
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f'
       and c.conrelid in ('public.bookings'::regclass, 'public.payments'::regclass)
       and a.attname in ('client_id', 'provider_id', 'payer_id')
     order by 1$$,
  array['bookings.client_id=n', 'bookings.provider_id=n', 'payments.payer_id=n', 'payments.provider_id=n'],
  'history keeps jobs and payments when an account is deleted');

select * from finish();
rollback;
