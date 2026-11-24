-- Marking a payment as handled: a second administrator who reviews the same payment after the first one
-- gets invalid_transition, and no second entry is written. Concurrent reviews wait on the payment row.
begin;
select plan(7);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- A payment that came in after its booking was cancelled, and the entry the webhook writes for it.
create temp table review_ids (name text primary key, id uuid);
grant select on review_ids to authenticated;
insert into review_ids values
  ('booking', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2031-05-05 09:00'), 'canceled'));
insert into review_ids select 'payment', tests.make_payment((select id from review_ids where name = 'booking'), 'received', 12000);
insert into review_ids select 'plain', tests.make_payment(tests.make_booking('provider_c', 'client_a', 't-reparo',
                                                                              tests.sp_period('2031-05-06 09:00'), 'canceled'),
                                                          'received', 5000);
insert into public.audit_log (actor_id, action, entity, entity_id, data)
select null, 'payment.received_after_cancel', 'payments', (select id::text from review_ids where name = 'payment'),
       '{"event": "PAYMENT_RECEIVED"}'::jsonb;

select tests.authenticate_as('admin');
select is((select count(*)::int from public.admin_payments_attention
            where payment_id = (select id from review_ids where name = 'payment')), 1,
          'the payment waits in the list for an administrator');

-- The first administrator marks it as handled.
select is(public.admin_review_payment((select id from review_ids where name = 'payment'), 'Reembolso feito no painel do Asaas'), true,
          'the first administrator marks the payment as handled');

-- The second one, who was looking at the same list, is refused and writes nothing.
select throws_ok($$select public.admin_review_payment((select id from review_ids where name = 'payment'), 'Tratado de novo')$$,
                 'P0001', 'invalid_transition', 'a second review of the same payment is refused');
select tests.clear_authentication();
select is((select count(*)::int from public.audit_log
            where action = 'payment.reviewed' and entity_id = (select id::text from review_ids where name = 'payment')), 1,
          'only one review entry is written for the payment');
select is((select count(*)::int from public.admin_payments_attention
            where payment_id = (select id from review_ids where name = 'payment')), 0,
          'the payment has left the list');

-- A payment with nothing waiting is refused in the same way.
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_review_payment((select id from review_ids where name = 'plain'), 'Tratado')$$,
                 'P0001', 'invalid_transition', 'a payment with nothing waiting is refused');
select tests.clear_authentication();

select * from finish();
rollback;
