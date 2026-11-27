begin;
select no_plan();
select tests.setup_fixture();
create temp table booking_fixture(label text primary key,id uuid not null);
grant all on booking_fixture to authenticated;
insert into private.service_commission_releases(occupation_slug,version,terms_reference,starts_at) values
 ('t-reparo','r1','https://terms.example.test/r1',now()-interval '1 day'),
 ('t-medico','r1','https://terms.example.test/r1',now()-interval '1 day');
update public.platform_settings set value='true' where key='commission_enabled';
select tests.authenticate_as('provider_c');
select is((select count(*) from public.service_commission_options()),0::bigint,'Separate rollout starts disabled');
select throws_ok($$select public.accept_service_commission('t-reparo','r1')$$,'P0001','service_policy_unavailable','Cannot contract while disabled');
select tests.clear_authentication();
update public.platform_settings set value='true' where key='service_recurring_commission_enabled';
insert into booking_fixture values ('legacy', tests.make_booking('provider_c','client_b','t-reparo',tests.sp_period(tests.at(50,0,'09:00')),'requested',300009));
select tests.authenticate_as('provider_c');
select lives_ok($$select public.accept_service_commission('t-reparo','r1')$$,'Provider accepts the published version');
select lives_ok($$select public.accept_service_commission('t-reparo','r1')$$,'Consent is idempotent');
select is(public.service_pro_sales_allowed(tests.uid('provider_c')),false,'Commission-only account cannot start Pro');
select tests.clear_authentication();
-- Previous paid platform work used to make D5 zero. It does not waive the new recurring agreement.
select tests.make_payment(tests.make_booking('provider_c','client_a','t-reparo',tests.sp_period(tests.at(49,1,'09:00')),'completed',10000));
insert into booking_fixture values ('new', tests.make_booking('provider_c','client_a','t-reparo',tests.sp_period(tests.at(50,1,'09:00')),'accepted',300009));
select is((select platform_fee_cents from public.bookings where id=(select id from booking_fixture where label='new')),30000,'10% floors cents without the former cap');
update public.bookings set status='accepted' where id=(select id from booking_fixture where label='legacy');
select is((select platform_fee_cents from public.bookings where id=(select id from booking_fixture where label='legacy')),15000,'A prior request preserves D5 at acceptance');
insert into booking_fixture values ('own', tests.make_booking('provider_c','client_b','t-reparo',tests.sp_period(tests.at(50,2,'09:00')),'accepted',300009,'own'));
select is((select platform_fee_cents from public.bookings where id=(select id from booking_fixture where label='own')),0,'Own-origin bookings stay outside commission');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.accept_service_commission('t-medico','r1')$$,'P0001','service_policy_unavailable','Catalog billing restriction prevails over release');
select throws_ok($$select public.service_pro_sales_allowed(tests.uid('provider_c'))$$,'P0001','not_allowed','Another account cannot read the provider billing decision');
select tests.authenticate_as('provider_a');
select lives_ok($$select public.accept_service_commission('t-reparo','r1')$$,'Mixed provider accepts one occupation');
select is(public.service_pro_sales_allowed(tests.uid('provider_a')),true,'Legacy occupation retains Pro on a mixed account');
select tests.clear_authentication();
create temp table service_test_requests as
  select gen_random_uuid() as id,x as n from generate_series(1,3) x;
grant select on service_test_requests to authenticated;
insert into public.requests(id,client_id,occupation_slug,neighborhood_id,description)
  select id,tests.uid('client_b'),'t-reparo',tests.neighborhood('t-bairro-1'),'Descricao do pedido de reparo para teste' from service_test_requests;
update public.platform_settings set value='1' where key='free_proposals_per_month';
select tests.authenticate_as('provider_c');
select lives_ok($$insert into public.proposals(request_id,price_cents) select id,300009 from service_test_requests$$,
                'Commission-only provider sends multiple eligible proposals without paying a subscription');
select is((select count(*) from public.proposals where provider_id=tests.uid('provider_c') and service_fee_policy_version='r1'),3::bigint,'Server stamps each proposal');
select tests.clear_authentication();
insert into public.subscriptions(provider_id,plan,status,asaas_subscription_id,current_period_end)
 values(tests.uid('provider_d'),'pro','active','test_remote',now()+interval '10 days');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.accept_service_commission('t-reparo','r1')$$,'P0001','cancel_pro_renewal_first','Active external renewal blocks last occupation from migrating');
select tests.clear_authentication();
update public.subscriptions set status='canceled',canceled_at=now() where provider_id=tests.uid('provider_d');
select tests.authenticate_as('provider_d');
select ok(public.accept_service_commission('t-reparo','r1')>=now()+interval '10 days','Honors remaining paid period after cancellation');
select tests.clear_authentication();
insert into booking_fixture values ('grace', tests.make_booking('provider_d','client_b','t-reparo',tests.sp_period(tests.at(50,2,'09:00')),'accepted',300009));
select is((select platform_fee_cents from public.bookings where id=(select id from booking_fixture where label='grace')),0,'New contract during prepaid period is covered with no D5 or recurring fee');
update public.platform_settings set value='false' where key='service_recurring_commission_enabled';
select tests.authenticate_as('provider_c');
select is(public.compute_platform_fee((select id from booking_fixture where label='new')),30000,'Already accepted split remains stable after stopping sales');
select tests.clear_authentication();
insert into booking_fixture values ('paused',tests.make_booking('provider_c','client_b','t-reparo',tests.sp_period(tests.at(51,0,'09:00')),'requested',300009));
update public.platform_settings set value='true' where key='service_recurring_commission_enabled';
update public.bookings set status='accepted' where id=(select id from booking_fixture where label='paused');
select is((select platform_fee_cents from public.bookings where id=(select id from booking_fixture where label='paused')),0,'A service offered while charging was paused stays free after reactivation');
update private.service_commission_releases set ends_at=statement_timestamp() where occupation_slug='t-reparo' and version='r1';
insert into booking_fixture values ('expired',tests.make_booking('provider_c','client_b','t-reparo',tests.sp_period(tests.at(51,1,'09:00')),'accepted',300009));
select is((select platform_fee_cents from public.bookings where id=(select id from booking_fixture where label='expired')),0,'An expired version never silently restarts D5');
select tests.authenticate_as('provider_c');
select is(public.service_pro_sales_allowed(tests.uid('provider_c')),false,'Closing the release does not restart Pro for migrated accounts');
select tests.clear_authentication();
insert into public.payments(booking_id,payer_id,provider_id,asaas_payment_id,amount_cents,platform_fee_cents,service_split_review_required)
  select b.id,b.client_id,b.provider_id,'pay_test_split_review',b.price_cents,b.platform_fee_cents,true from public.bookings b
  where b.id=(select id from booking_fixture where label='new');
select tests.authenticate_as('admin');
select is((select count(*) from public.admin_payments_attention where action='payment.service_split_review'),1::bigint,'Actual split divergence enters the existing finance queue atomically');
select tests.authenticate_as('client_b');
select is((select count(*) from public.admin_payments_attention where action='payment.service_split_review'),0::bigint,'Finance incident stays isolated from other users');
select * from finish();
rollback;
