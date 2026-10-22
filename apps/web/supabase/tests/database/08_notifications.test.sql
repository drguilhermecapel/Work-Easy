-- Notifications: the outbox triggers per template, reminder scheduling and skipping,
-- claim_notifications (service role) and RLS.
begin;
select plan(48);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- proposta_recebida -> client
insert into public.requests (client_id, occupation_slug, neighborhood_id, description)
values (tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pia entupida no banheiro');
insert into public.proposals (request_id, provider_id, price_cents)
select id, tests.uid('provider_c'), 9000 from public.requests where description = 'Pia entupida no banheiro';
select is((select channel::text || '/' || phone from public.notifications
            where template = 'proposta_recebida' and user_id = tests.uid('client_a')), 'whatsapp/5511900000001',
          'proposal received: client notified by WhatsApp when the profile has a phone');
select is((select params ->> 'provider_name' from public.notifications where template = 'proposta_recebida'), 'Carla Teste',
          'the template carries the provider name');

-- atendimento_confirmado + lembrete_atendimento -> both
insert into ids values
  ('booking', tests.make_booking('provider_a', 'client_b', 't-reparo', tests.sp_period('2030-07-01 09:00')));
select is((select count(*)::int from public.notifications
            where template = 'atendimento_confirmado' and params ->> 'booking_id' = (select id from ids where name = 'booking')::text),
          2, 'booking accepted: both parties notified');
select is((select channel::text from public.notifications
            where template = 'atendimento_confirmado' and user_id = tests.uid('client_b')), 'email',
          'a user without phone is notified by e-mail');
select is((select count(*)::int from public.notifications
            where template = 'lembrete_atendimento' and scheduled_for = tests.sp('2030-06-30 09:00')), 2,
          'reminders are scheduled 24 h before the start');

-- requested bookings do not notify until accepted
insert into ids values
  ('requested', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-07-02 09:00'), 'requested'));
select is((select count(*)::int from public.notifications
            where params ->> 'booking_id' = (select id from ids where name = 'requested')::text), 0,
          'a requested booking does not notify yet');
select tests.authenticate_as('provider_c');
select public.transition_booking((select id from ids where name = 'requested'), 'accepted');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications
            where template = 'atendimento_confirmado' and params ->> 'booking_id' = (select id from ids where name = 'requested')::text),
          2, 'accepting through transition_booking notifies both');

select is((select count(*)::int from public.notifications
            where template = 'lembrete_atendimento' and params ->> 'booking_id' = (select id from ids where name = 'requested')::text),
          2, 'a booking accepted later also gets its reminders');

-- canceling skips the reminders
select tests.authenticate_as('client_b');
select public.transition_booking((select id from ids where name = 'booking'), 'canceled', 'Viagem');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications
            where template = 'lembrete_atendimento' and status = 'skipped'
              and params ->> 'booking_id' = (select id from ids where name = 'booking')::text), 2,
          'canceling skips the queued reminders');

-- pagamento_recebido -> provider
insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status)
values ((select id from ids where name = 'requested'), tests.uid('provider_c'), tests.uid('client_a'), 10000, 'pending');
select is((select count(*)::int from public.notifications where template = 'pagamento_recebido'), 0,
          'a pending payment does not notify');
update public.payments set status = 'received' where booking_id = (select id from ids where name = 'requested');
select is((select user_id from public.notifications where template = 'pagamento_recebido'), tests.uid('provider_c'),
          'payment received: provider notified');

update public.payments set status = 'confirmed' where booking_id = (select id from ids where name = 'requested');
select is((select count(*)::int from public.notifications where template = 'pagamento_recebido'), 1,
          'received -> confirmed does not notify twice');
insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status)
values ((select id from ids where name = 'booking'), tests.uid('provider_a'), tests.uid('client_b'), 5000, 'confirmed');
select is((select count(*)::int from public.notifications where template = 'pagamento_recebido' and user_id = tests.uid('provider_a')), 1,
          'a payment that arrives already confirmed notifies the provider');

-- orcamento_respondido -> provider
insert into public.quotes (provider_id, title, items, valid_until, status)
values (tests.uid('provider_a'), 'Orçamento de teste', '[]', current_date + 5, 'sent');
insert into ids select 'token', public_token from public.quotes where title = 'Orçamento de teste';
select tests.authenticate_anon();
select public.respond_quote((select id from ids where name = 'token'), false);
select tests.clear_authentication();
select is((select params ->> 'status' from public.notifications
            where template = 'orcamento_respondido' and user_id = tests.uid('provider_a')), 'declined',
          'quote answered: provider notified');

-- Only contacts confirmed by Auth receive messages: the phone typed in the profile is informative.
select tests.create_user('u_phone', 'U Phone', '5511933330000');
select tests.create_user('u_mail', 'U Mail');
select tests.create_user('u_none', 'U None');
update auth.users set phone_confirmed_at = null where email = 'u_mail@test.local';
update auth.users set email_confirmed_at = null where email = 'u_none@test.local';
update public.profiles set phone = '5511944445555' where id in (tests.uid('u_mail'), tests.uid('u_none'));
select private.notify(tests.uid('u_phone'), 'proposta_recebida', '{}');
select private.notify(tests.uid('u_mail'), 'proposta_recebida', '{}');
select private.notify(tests.uid('u_none'), 'proposta_recebida', '{}');
select is((select channel::text || '/' || phone from public.notifications where user_id = tests.uid('u_phone')), 'whatsapp/5511933330000',
          'a confirmed phone receives WhatsApp');
select is((select channel::text || '/' || coalesce(phone, 'none') || '/' || email from public.notifications where user_id = tests.uid('u_mail')),
          'email/none/u_mail@test.local', 'a phone only typed in the profile is never used: the confirmed e-mail receives it');
select is((select count(*)::int from public.notifications where user_id = tests.uid('u_none')), 0,
          'an account with no confirmed contact receives nothing');
update public.profiles set phone = '5511955556666' where id = tests.uid('client_b');
select private.notify(tests.uid('client_b'), 'proposta_recebida', '{}');
select is((select phone from public.notifications where user_id = tests.uid('client_b') and template = 'proposta_recebida'), null,
          'changing the profile phone does not redirect messages to another number');

-- RLS
select tests.authenticate_as('client_a');
select ok((select count(*) from public.notifications) > 0, 'a user reads the own notifications');
select is((select count(*)::int from public.notifications where user_id <> auth.uid()), 0,
          'a user reads only the own notifications');
select throws_ok(format($$insert into public.notifications (user_id, channel, template) values (%L, 'email', 'proposta_recebida')$$,
                        tests.uid('client_a')),
                 '42501', null, 'users cannot enqueue notifications');
select throws_ok($$select * from public.claim_notifications(10)$$, '42501', null, 'users cannot claim notifications');
select tests.authenticate_anon();
select throws_ok($$select * from public.notifications$$, '42501', null, 'anon cannot read notifications');
select throws_ok($$select * from public.claim_notifications(10)$$, '42501', null, 'anon cannot claim notifications');
select tests.authenticate_as('client_a');
select throws_ok($$update public.notifications set status = 'sent'$$, '42501', null, 'users cannot mark notifications as sent');

-- claim_notifications
select tests.clear_authentication();
create temp table due as
  select count(*)::int as n from public.notifications where status = 'queued' and scheduled_for <= now();
grant select on due to service_role;
select tests.authenticate_service();
select is((select count(*)::int from public.claim_notifications(100)), (select n from due),
          'claim returns every due queued message');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications where status = 'queued' and scheduled_for <= now()), 0,
          'claimed messages are marked sending');
select ok((select count(*) from public.notifications where status = 'queued' and template = 'lembrete_atendimento') > 0,
          'future reminders stay queued');
select private.notify(tests.uid('client_a'), 'proposta_recebida', '{}');
select private.notify(tests.uid('client_a'), 'proposta_recebida', '{}');
select private.notify(tests.uid('client_a'), 'proposta_recebida', '{}');
select tests.authenticate_service();
select is((select count(*)::int from public.claim_notifications(1)), 1, 'claim respects the limit');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications where status = 'queued' and scheduled_for <= now()), 2,
          'the rest of the batch stays queued');
select is((select max(attempts) from public.notifications where status = 'sending' and template = 'proposta_recebida'
              and user_id = tests.uid('client_a')), 1, 'claim counts the attempt');
update public.notifications set status = 'queued' where status = 'sending' and user_id = tests.uid('client_a');
create temp table due2 as
  select count(*)::int as n from public.notifications where status = 'queued' and scheduled_for <= now();
grant select on due2 to service_role;
select tests.authenticate_service();
select is((select count(*)::int from public.claim_notifications(100)), (select n from due2),
          'a message put back in the queue can be claimed again');
select tests.clear_authentication();
select is((select max(attempts) from public.notifications where user_id = tests.uid('client_a')), 2, 'and its attempts increase');

-- ---------------------------------------------------------------- claimed_at and stuck 'sending' rows
select has_column('public', 'notifications', 'claimed_at', 'notifications records when a row was claimed');
insert into public.notifications (user_id, channel, template, status, attempts, claimed_at, params) values
  (tests.uid('client_a'), 'email', 'proposta_recebida', 'sending', 1, now() - interval '11 minutes', '{"t": "stale"}'),
  (tests.uid('client_a'), 'email', 'proposta_recebida', 'sending', 2, now() - interval '2 minutes', '{"t": "recent"}'),
  (tests.uid('client_a'), 'email', 'proposta_recebida', 'sending', 1, null, '{"t": "legacy"}'),
  (tests.uid('client_a'), 'email', 'proposta_recebida', 'sent', 1, now() - interval '3 hours', '{"t": "done"}'),
  (tests.uid('client_a'), 'email', 'proposta_recebida', 'queued', 0, null, '{"t": "fresh"}');
select tests.authenticate_service();
create temp table claimed as select * from public.claim_notifications(100);
select tests.clear_authentication();
select is((select count(*)::int from claimed where params ->> 't' = 'fresh'), 1, 'a queued row is claimed');
select is((select attempts from claimed where params ->> 't' = 'fresh'), 1, 'and its attempt is counted');
select is((select claimed_at from claimed where params ->> 't' = 'fresh'), now(), 'claiming records claimed_at');
select is((select count(*)::int from claimed where params ->> 't' = 'stale'), 1, 'a row stuck in sending for more than 10 minutes is claimed again');
select is((select attempts from claimed where params ->> 't' = 'stale'), 1, 'and resuming it does not spend a new attempt');
select is((select claimed_at from public.notifications where params ->> 't' = 'stale'), now(), 'and its claimed_at is renewed');
select is((select status::text from public.notifications where params ->> 't' = 'stale'), 'sending', 'and it stays sending');
select is((select count(*)::int from claimed where params ->> 't' = 'legacy'), 1, 'a sending row with no claimed_at counts as stuck');
select is((select count(*)::int from claimed where params ->> 't' = 'recent'), 0, 'a row claimed 2 minutes ago is left alone');
select is((select claimed_at from public.notifications where params ->> 't' = 'recent'), now() - interval '2 minutes',
          'and its claimed_at is not touched');
select is((select attempts from public.notifications where params ->> 't' = 'recent'), 2, 'nor its attempts');
select is((select count(*)::int from claimed where params ->> 't' = 'done'), 0, 'a sent row is never claimed');
update public.notifications set claimed_at = now() - interval '9 minutes 59 seconds' where params ->> 't' = 'stale';
select tests.authenticate_service();
select is((select count(*)::int from public.claim_notifications(100) where params ->> 't' = 'stale'), 0,
          'just under 10 minutes is not stuck yet');
select tests.clear_authentication();

select * from finish();
rollback;
