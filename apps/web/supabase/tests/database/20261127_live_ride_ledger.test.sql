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
-- Operational readiness is independent from the initially closed finance release.
insert into private.ride_receipt_policy values ('live','ledger fixture',7,true,now()+interval '1 day');
update private.ride_signal_settings set location_enabled=true where singleton;
insert into private.ride_driver_credentials(driver_id,vehicle_identifier,vehicle_category,driver_document_ref,
  vehicle_document_ref,insurance_ref,driver_until,vehicle_until,insurance_until,inspected_by,
  public_driver_name,public_driver_number,vehicle_plate,vehicle_model)
values (tests.uid('provider_c'),'fixture-vehicle','sedan','fixture-driver','fixture-vehicle','fixture-insurance',
  current_date+30,current_date+30,current_date+30,tests.uid('admin'),'Motorista de ensaio','TESTE-01','XXX0A00','Sedã de ensaio');
insert into public.admins(user_id) values(tests.create_user('ride_support_backup_ledger','Suplente de ensaio'));
with pilot as (
 insert into private.ride_pilot(period,approved_ref,budget_cents)
    values(tstzrange(now()-interval '15 minutes',now()+interval '5 hours'),'ledger fixture',6309)
 returning id,period
), coverage as (
 insert into private.ride_coverage(pilot,period,lead_id,backup_id)
   select id,period,tests.uid('admin'),tests.uid('ride_support_backup_ledger') from pilot
   returning id
)
insert into private.ride_support_channels(coverage_id,channel,address,team,verified_ref)
  select id,'email','plantao@example.test','Equipe de ensaio','TEST-VERIFIED' from coverage;
create function pg_temp.live_leg() returns uuid language sql immutable as $$select 'f1000000-0000-4000-8000-000000000011'::uuid$$;
create function pg_temp.verified(op int, kind text, amount int, extras int default 0, cost int default 0, beneficiary int default 0)
returns jsonb language sql as $$
  select public.record_verified_live_ride_event(pg_temp.live_leg(),md5('live-fixture-'||op::text)::uuid,kind,amount,extras,cost,beneficiary)
$$;
grant execute on function pg_temp.live_leg(), pg_temp.verified(int,text,int,int,int,int) to authenticated,service_role;
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
create function pg_temp.interrupted_live() returns uuid language sql immutable as $$select 'f1000000-0000-4000-8000-000000000012'::uuid$$;
grant execute on function pg_temp.interrupted_live() to authenticated,service_role;
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,
                            driver_cents,payer_id,driver_id,tariff_id,status,environment)
select pg_temp.interrupted_live(),ride_id,2,origin,destination,pickup_at+interval '3 hours',duration_minutes,
  tstzrange(pickup_at+interval '3 hours',pickup_at+interval '4 hours','[)'),3000,300,0,2700,payer_id,driver_id,tariff_id,'boarded','live'
 from public.ride_legs where id=pg_temp.live_leg();
update public.ride_legs set status='unknown' where id=pg_temp.interrupted_live();
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_confirm_live_ride_cost(pg_temp.interrupted_live(),md5('live-cost')::uuid,600,'cost proof')$$,
  'P0001','ride_financial_state','An uncertain cancellation stays under review');
select tests.clear_authentication();
update public.ride_legs set status='cancelled' where id=pg_temp.interrupted_live();
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_confirm_live_ride_cost(pg_temp.interrupted_live(),md5('live-cost')::uuid,600,'cost proof')$$,
  'P0001','not_allowed','Live expense confirmation is closed pending approved release and both areas');
select tests.clear_authentication();
select tests.authenticate_service();
select throws_ok($$select public.claim_ride_live_account(pg_temp.live_leg())$$,'P0001','not_allowed','Live finance starts closed even for a provisioned driver');
select throws_ok($$select public.claim_ride_sandbox_account(pg_temp.live_leg())$$,'P0001','not_allowed','Sandbox cannot claim a live obligation');
select tests.authenticate_as('admin');
select throws_ok($$select pg_temp.verified(1,'capture',3309,0,75,3009)$$,'42501',null,'An authenticated admin cannot forge a PSP capture');
select throws_ok($$select public.admin_simulate_ride_payment_event(pg_temp.live_leg(),md5('simulation')::uuid,'capture',3309)$$,
    'P0001','not_allowed','Simulated payments cannot enter the live project');
select tests.clear_authentication();
update private.ride_network set module_enabled=true,monetization_enabled=true,dispatch_enabled=true where environment='live';
update private.ride_live_finance_release set enabled=true,until_at=now()+interval '1 day',evidence_ref='fixture only';
select tests.authenticate_service();
select throws_ok($$select public.claim_ride_live_account(pg_temp.live_leg())$$,'P0001','not_allowed','Unapproved areas still block finance');
select tests.clear_authentication();
insert into private.ride_area_authorizations(area,legal_ref,privacy_ref,ops_ref,until_at,quote_enabled,dispatch_enabled,monetization_enabled)
 select area,'test only','test only','test only',now()+interval '1 day',true,true,true from unnest(array['A-test','B-test']) x(area);
select tests.authenticate_as('admin');
select lives_ok($$select public.admin_confirm_live_ride_cost(pg_temp.interrupted_live(),md5('live-cost')::uuid,600,'cost proof')$$,'Authorized review recognizes documented platform expense');
select lives_ok($$select public.admin_confirm_live_ride_cost(pg_temp.interrupted_live(),md5('live-cost')::uuid,600,'cost proof')$$,'Replaying the evidence does not recognize a second expense');
select is((public.admin_ride_settlement(pg_temp.interrupted_live())#>>'{review,payable_cents}')::int,600,'Unpaid expense remains a liability with zero cash disbursement');
select tests.clear_authentication();
select is((select count(*) from private.ride_financial_accounts where leg_id=pg_temp.interrupted_live()),0::bigint,'Confirmed cost creates no fare, client debit or commission');
select tests.authenticate_service();
select is((public.claim_ride_live_account(pg_temp.live_leg())->>'driver_cents')::int,3009,'Claim preserves the exact driver split including pass-through');
select throws_ok($$select pg_temp.verified(1,'capture',3309,0,301,3009)$$,'P0001','ride_financial_mismatch','Net below promised driver balance is an unresolved mismatch');
select throws_ok($$select pg_temp.verified(1,'capture',3309,0,75,3008)$$,'P0001','ride_financial_mismatch','An incorrect split cent cannot be recognized');
select lives_ok($$select pg_temp.verified(1,'capture',3309,0,75,3009)$$,'Verified capture books gross charge and PSP cost separately');
select lives_ok($$select pg_temp.verified(1,'capture',3309,0,75,3009)$$,'Replay of matching PSP facts is idempotent');
select throws_ok($$select pg_temp.verified(1,'capture',3309,0,76,3009)$$,'P0001','ride_operation_conflict','Same event with a different fee is rejected');
select throws_ok($$select pg_temp.verified(2,'payout',3009,0,0,3008)$$,'P0001','ride_financial_mismatch','An incorrect driver payout cannot be announced');
select lives_ok($$select pg_temp.verified(2,'payout',3009,0,0,3009)$$,'Actual completed split pays the driver');
select tests.authenticate_as('admin');
select is((public.admin_ride_settlement(pg_temp.live_leg())->>'cash_cents')::int,225,'Clearing retains 300 cents commission less 75 cents PSP fee');
select is((public.admin_ride_settlement(pg_temp.live_leg())->>'processing_cost_cents')::int,75,'Processing expense is visible separately');
select tests.clear_authentication();
update private.ride_live_finance_release set enabled=false;
update private.ride_network set module_enabled=false,monetization_enabled=false where environment='live';
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_record_ride_cost_disbursement(pg_temp.interrupted_live(),md5('bank')::uuid,601,'bank fixture')$$,
  'P0001','ride_financial_state','Cannot reconcile more cash than the documented obligation');
select lives_ok($$select public.admin_record_ride_cost_disbursement(pg_temp.interrupted_live(),md5('bank')::uuid,400,'bank fixture')$$,'Documented actual disbursement can reconcile after sales pause');
select lives_ok($$select public.admin_record_ride_cost_disbursement(pg_temp.interrupted_live(),md5('bank')::uuid,400,'bank fixture')$$,'Replayed bank transfer does not consume more liability');
select is((public.admin_ride_settlement(pg_temp.interrupted_live())#>>'{review,payable_cents}')::int,200,'600 expense minus 400 disbursed leaves 200 due');
select lives_ok($$select public.admin_record_ride_cost_disbursement(pg_temp.interrupted_live(),md5('bank2')::uuid,200,'bank fixture 2')$$,'The second documented transfer settles the remaining liability');
select is((public.admin_ride_settlement(pg_temp.interrupted_live())#>>'{review,paid_cents}')::int,600,'Only confirmed transfers count as cash paid');
select is((public.admin_ride_settlement(pg_temp.interrupted_live())#>>'{review,payable_cents}')::int,0,'No residual payable and no silently issued charge');
select tests.clear_authentication();
select tests.authenticate_service();
select throws_ok($$select public.claim_ride_live_account(pg_temp.live_leg())$$,'P0001','not_allowed','Even a prior claim cannot start another charge after gate closure');
select lives_ok($$select pg_temp.verified(3,'refund',3309,300)$$,'Refund of an already claimed transaction still settles after closure');
select throws_ok($$select pg_temp.verified(4,'payout_reversal',3010,0,0,3010)$$,'P0001','ride_financial_state','Cannot recover more than was paid and reversed');
select lives_ok($$select pg_temp.verified(4,'payout_reversal',3009,0,0,3009)$$,'Documented return of the driver split extinguishes its receivable');
select lives_ok($$select pg_temp.verified(4,'payout_reversal',3009,0,0,3009)$$,'Returned split is idempotent');
select lives_ok($$select pg_temp.verified(5,'psp_fee_credit',75)$$,'A verified fee credit closes the remaining processing expense');
select tests.clear_authentication();
select is((select cash_cents from private.ride_financial_balances where leg_id=pg_temp.live_leg()),0::bigint,'Fully reversed cash including the fee credit closes at zero');
select is((select driver_balance_cents from private.ride_financial_balances where leg_id=pg_temp.live_leg()),0::bigint,'Driver liability and recovery settle exactly once');
select is((select commission_cents from private.ride_financial_balances where leg_id=pg_temp.live_leg()),0::bigint,'Commission closes at zero after refund');
select is((select processing_cost_cents from private.ride_financial_balances where leg_id=pg_temp.live_leg()),0::bigint,'Fee and credit reconcile separately');
select * from finish();
rollback;
