-- All inputs are synthetic in the local test database. No PSP or external transfer.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_deployment set environment='live' where singleton;
insert into private.ride_routes(environment,origin,destination,meters,minutes) values('live','A-test','B-test',4200,18);
insert into private.ride_tariffs(environment,valid_from,base_cents,km_cents,minute_cents,minimum_cents,commission_bps)
  values('live','2000-01-01Z',450,180,35,1200,1000);
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by) values(
  tests.uid('provider_c'),'live','sedan','approved',current_date+30,tests.uid('admin')
);
insert into private.ride_receipt_policy values('live','fixture only',7,true,now()+interval '1 day');
update private.ride_signal_settings set location_enabled=true;
insert into private.ride_driver_credentials(driver_id,vehicle_identifier,vehicle_category,driver_document_ref,vehicle_document_ref,insurance_ref,
 driver_until,vehicle_until,insurance_until,inspected_by,public_driver_name,public_driver_number,vehicle_plate,vehicle_model)
values(tests.uid('provider_c'),'fixture','sedan','fixture','fixture','fixture',current_date+30,current_date+30,current_date+30,
 tests.uid('admin'),'Fixture','TEST','XXX0A00','Fixture');
insert into public.admins(user_id) values(tests.create_user('ride_support_backup_152','Suplente de ensaio'));
with pilot as (
 insert into private.ride_pilot(period,approved_ref,budget_cents) values(tstzrange(now()-interval '1 hour',now()+interval '2 hours'),'test-finance',3309)
 returning id,period
), coverage as (
 insert into private.ride_coverage(pilot,period,lead_id,backup_id)
   select id,period,tests.uid('admin'),tests.uid('ride_support_backup_152') from pilot
   returning id
)
insert into private.ride_support_channels(coverage_id,channel,address,team,verified_ref)
  select id,'email','plantao@example.test','Equipe de ensaio','TEST-VERIFIED' from coverage;
create function pg_temp.live_leg() returns uuid language sql immutable as $$select 'f1000000-0000-4000-8000-000000000011'::uuid$$;
with q as (
  insert into private.ride_quotes(environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
    select 'live',tests.uid('client_a'),gen_random_uuid(),tests.uid('client_a'),'[]','[]',array[tests.uid('client_a')],id,now()+interval '10 minutes','requested',3309
      from private.ride_tariffs where environment='live' limit 1 returning id,tariff_id
), r as (
  insert into public.rides(quote_id,environment,passenger_id) select id,'live',tests.uid('client_a') from q returning id,quote_id
)
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,
                            driver_cents,payer_id,driver_id,tariff_id,status,environment)
select pg_temp.live_leg(),r.id,1,'A-test','B-test',now(),18,tstzrange(now(),now()+interval '18 minutes','[)'),3309,300,300,
       3009,tests.uid('client_a'),tests.uid('provider_c'),q.tariff_id,'boarded','live' from r join q on q.id=r.quote_id;
update public.ride_legs set status='completed' where id=pg_temp.live_leg();
select tests.authenticate_as('client_a');
select is(public.ride_live_payment_view(pg_temp.live_leg()),null::jsonb,'No live issuer by default');
select tests.authenticate_service();
select throws_ok($$select public.ride_live_prepare_charge(pg_temp.live_leg(),tests.uid('client_a'))$$,'P0001','ride_feature_disabled','Unapproved release cannot prepare a charge');
select tests.clear_authentication();
update private.ride_network set module_enabled=true,monetization_enabled=true where environment='live';
update private.ride_live_finance_release set enabled=true,until_at=now()+interval '1 day',evidence_ref='fixture only';
insert into private.ride_area_authorizations(area,legal_ref,privacy_ref,ops_ref,until_at,quote_enabled,dispatch_enabled,monetization_enabled)
 select area,'fixture','fixture','fixture',now()+interval '1 day',true,true,true from unnest(array['A-test','B-test']) x(area);
insert into private.ride_live_psp_corridors values('A-test','B-test','fixture only',md5('platform')::uuid,now()+interval '1 day');
insert into private.ride_live_psp_customers values(tests.uid('client_a'),'cus_fixture','fixture only',now()+interval '1 day');
insert into private.ride_live_psp_wallets values(tests.uid('provider_c'),md5('platform')::uuid,'fixture only',now()+interval '1 day');
select tests.authenticate_as('client_a');
select is(public.ride_live_payment_view(pg_temp.live_leg()),null::jsonb,'The platform wallet cannot stand in for the individual driver wallet');
select tests.clear_authentication();
update private.ride_live_psp_wallets set wallet_id=md5('individual')::uuid;
select tests.authenticate_service();
select throws_ok($$select public.ride_live_prepare_charge(pg_temp.live_leg(),tests.uid('client_b'))$$,'P0001','not_allowed','Cannot lock another payer into the checkout');
select is(public.ride_live_prepare_charge(pg_temp.live_leg(),tests.uid('client_a'))->>'create','true','An approved payer can begin lookup');
select tests.clear_authentication();
update private.ride_live_finance_release set enabled=false;
select tests.authenticate_service();
select is(public.ride_live_claim_send(pg_temp.live_leg()),false,'Revocation between lookup and POST prevents issuance');
select tests.clear_authentication();
update private.ride_live_finance_release set enabled=true;
select tests.authenticate_service();
select is(public.ride_live_claim_send(pg_temp.live_leg()),true,'One request acquires external POST permission');
select is(public.ride_live_claim_send(pg_temp.live_leg()),false,'Lost/duplicated request cannot POST again');
select tests.authenticate_as('client_b');
select is(public.ride_live_payment_view(pg_temp.live_leg()),null::jsonb,'Another payer cannot read the charge');
select throws_ok($$select public.admin_ride_psp_reviews(pg_temp.live_leg())$$,'P0001',null,'Payer cannot view internal occurrences');
select tests.clear_authentication();
create function pg_temp.observe(s text, refund int, payout int, reversed int, fee int default 75) returns jsonb language sql as $$
 select public.ride_live_observe_charge(pg_temp.live_leg(),'pay_fixture','cus_fixture',3309,s,refund,'https://www.asaas.com/i/fixture',fee,3009,payout,reversed,null)
$$;
grant execute on function pg_temp.observe(text,int,int,int,int) to service_role;
select tests.authenticate_service();
select is(pg_temp.observe('pending',0,0,0)->>'state','pending','Matching obligation becomes payable');
select is(pg_temp.observe('settling',0,0,0)->>'state','settling','Payment confirmed but not credited is still settling');
select is(pg_temp.observe('pending',0,0,0)->>'state','settling','Stale pending observation cannot reopen a confirmed invoice');
select is(pg_temp.observe('paid',0,3009,0)->>'state','paid','Capture and actual individual split settle');
select is(pg_temp.observe('paid',0,3009,0)->>'state','paid','Duplicate facts remain settled');
select is(pg_temp.observe('pending',0,0,0)->>'state','paid','Stale canonical delivery cannot reopen payment');
select is(pg_temp.observe('paid',100,3009,0)->>'state','review','Partial refund with unknown extras allocation opens an occurrence');
select tests.clear_authentication();
update private.ride_live_finance_release set enabled=false;
select tests.authenticate_as('admin');
select is(public.admin_ride_psp_reviews(pg_temp.live_leg())->0->>'reason','partial_extras','Operations can check the discrepancy');
select tests.authenticate_service();
select is(pg_temp.observe('paid',3309,0,3009)->>'state','refunded','Proof of full refund and split reversal reconciles after pause');
select is(pg_temp.observe('paid',3309,0,3009)->>'state','refunded','Repeated refund has no additional effect');
select tests.clear_authentication();
select is((select count(*) from private.ride_financial_events where leg_id=pg_temp.live_leg() and kind in ('capture','refund','payout','payout_reversal')),4::bigint,'Financial events are posted exactly once to the common ledger');
select is((select driver_balance_cents from private.ride_financial_balances where leg_id=pg_temp.live_leg()),0::bigint,'Driver payable reconciles after split reversal');
select * from finish();
rollback;
