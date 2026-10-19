-- Notifications: the outbox triggers per template, reminder scheduling and skipping,
-- claim_notifications (service role) and RLS.
begin;
select plan(19);
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

select * from finish();
rollback;
