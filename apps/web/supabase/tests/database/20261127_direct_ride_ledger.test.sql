begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true where environment='simulation';

create function pg_temp.leg() returns uuid language sql immutable as $$select 'f1000000-0000-4000-8000-000000000001'::uuid$$;
create function pg_temp.post_event(op int, kind text, cents int, extras int default 0)
returns jsonb language sql as $$
  select public.admin_simulate_ride_payment_event(pg_temp.leg(),md5('ride-finance-'||op::text)::uuid,kind,cents,extras)
$$;

grant execute on function pg_temp.leg(), pg_temp.post_event(int,text,int,int) to authenticated,service_role;

insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by)
  values(tests.uid('provider_c'),'simulation','sedan','approved',current_date+30,tests.uid('admin'));
with q as (
  insert into private.ride_quotes(environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
    select 'simulation',tests.uid('client_a'),gen_random_uuid(),tests.uid('client_a'),'[]','[]',array[tests.uid('client_a')],id,now()+interval '10 minutes','requested',3309
      from private.ride_tariffs where environment='simulation' limit 1 returning id,tariff_id
), r as (
  insert into public.rides(quote_id,environment,passenger_id)
    select id,'simulation',tests.uid('client_a') from q returning id,quote_id
)
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,
                            driver_cents,payer_id,driver_id,tariff_id,status,environment)
select pg_temp.leg(),r.id,1,'Saúde','Jabaquara',now(),18,tstzrange(now(),now()+interval '18 minutes','[)'),3309,300,300,
       3009,tests.uid('client_a'),tests.uid('provider_c'),q.tariff_id,'boarded','simulation' from r join q on q.id=r.quote_id;
select tests.authenticate_as('admin');
select is(public.admin_ride_settlement(pg_temp.leg())->>'recognized','false','Boarding cannot accrue or charge a fare');
select tests.clear_authentication();
update public.ride_legs set status='completed' where id=pg_temp.leg();
select is((select count(*) from private.ride_financial_events where leg_id=pg_temp.leg()),1::bigint,'Completion creates only an accrual');
select is((select cash_cents from private.ride_financial_balances where leg_id=pg_temp.leg()),0::bigint,'No capture or payout on arrival/completion');
select is((select commission_cents from private.ride_financial_balances where leg_id=pg_temp.leg()),300::bigint,'Floor 10% of 3009 cents with 300 cents of pass-through expenses');
select tests.authenticate_as('client_b');
select throws_ok($$select public.admin_ride_settlement(pg_temp.leg())$$,'P0001','not_allowed','A different rider cannot inspect financial data');
select throws_ok($$select pg_temp.post_event(1,'capture',3309)$$,'P0001','not_allowed','A client cannot forge a settlement');
select tests.authenticate_as('admin');
select throws_ok($$select pg_temp.post_event(1,'payout',3009)$$,'P0001','ride_financial_state','No disbursement before capture');
select lives_ok($$select pg_temp.post_event(2,'capture_unknown',3309)$$,'Record ambiguous collection');
select throws_ok($$select pg_temp.post_event(3,'capture',3309)$$,'P0001','ride_reconciliation_required','Reconcile original operation before another collection');
select lives_ok($$select pg_temp.post_event(2,'capture_failed',3309)$$,'Confirmed failure releases uncertain operation');
select lives_ok($$select pg_temp.post_event(3,'capture',3309)$$,'Confirmed collection under a new key');
select lives_ok($$select pg_temp.post_event(3,'capture',3309)$$,'Replayed collection is idempotent');
select throws_ok($$select pg_temp.post_event(3,'capture',3308)$$,'P0001','ride_operation_conflict','Conflicting replay cannot change amount');
select throws_ok($$select pg_temp.post_event(4,'capture',3309)$$,'P0001','ride_financial_state','Already captured under another key');
select lives_ok($$select pg_temp.post_event(5,'payout',3009)$$,'Pay driver with extras once');
select lives_ok($$select pg_temp.post_event(5,'payout',3009)$$,'Replayed payout is idempotent');
select lives_ok($$select pg_temp.post_event(6,'refund',309,300)$$,'Partial refund explicitly identifies reimbursed expenses');
select lives_ok($$select pg_temp.post_event(6,'refund',309,300)$$,'Replayed refund is idempotent');
select is((public.admin_ride_settlement(pg_temp.leg())->>'commission_cents')::int,300,'3000 commissionable cents left so fee remains 300');
select is((public.admin_ride_settlement(pg_temp.leg())->>'driver_balance_cents')::int,-309,'Post-payout adjustment is a receivable from the driver, not an automatic debit');
select lives_ok($$select pg_temp.post_event(7,'dispute_open',3000)$$,'Record a dispute separately from a money movement');
select throws_ok($$select pg_temp.post_event(8,'refund',3000)$$,'P0001','ride_financial_state','Disputed balance cannot be reimbursed again');
select lives_ok($$select pg_temp.post_event(9,'chargeback',3000)$$,'Verified dispute outcome reverses remaining fare and fee');
select lives_ok($$select pg_temp.post_event(9,'chargeback',3000)$$,'Chargeback replay does not change money');
select is((public.admin_ride_settlement(pg_temp.leg())->>'commission_cents')::int,0,'Full reversal of commission matches original cents');
select is((public.admin_ride_settlement(pg_temp.leg())->>'driver_balance_cents')::int,-3009,'Driver recovery is limited to original payout');
select is((public.admin_ride_settlement(pg_temp.leg())->>'cash_cents')::int,-3009,'Cash reflects one capture, one payout and actual reversals');
select tests.clear_authentication();
select is((select sum(cash_delta::bigint+receivable_delta-driver_delta-fee_delta) from private.ride_financial_events where leg_id=pg_temp.leg()),0::numeric,'Every posting balances');
select is((select count(*) from private.ride_financial_events where leg_id=pg_temp.leg() and kind='capture'),1::bigint,'One capture after transport redelivery');
select tests.authenticate_service();
select throws_ok($$select public.claim_ride_sandbox_account(pg_temp.leg())$$,'P0001','ride_operation_conflict','PSP cannot take over a manual simulation with posted money');
select tests.clear_authentication();
create function pg_temp.second_leg() returns uuid language sql immutable as $$select 'f1000000-0000-4000-8000-000000000002'::uuid$$;
grant execute on function pg_temp.second_leg() to authenticated,service_role;
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,
                            driver_cents,payer_id,driver_id,tariff_id,status,environment)
select pg_temp.second_leg(),ride_id,2,destination,origin,pickup_at+interval '3 hours',duration_minutes,
  tstzrange(pickup_at+interval '3 hours',pickup_at+interval '4 hours','[)'),2509,250,0,2259,payer_id,driver_id,tariff_id,'boarded','simulation'
 from public.ride_legs where id=pg_temp.leg();
update public.ride_legs set status='completed' where id=pg_temp.second_leg();
select tests.authenticate_service();
select throws_ok($$select public.record_ride_sandbox_financial_event(pg_temp.second_leg(),md5('verified')::uuid,'capture',2509)$$,
  'P0001','ride_operation_conflict','A verified PSP event requires an earlier source claim');
select is((public.claim_ride_sandbox_account(pg_temp.second_leg())->>'fare_cents')::int,2509,'Claim locks the exact authorized fare for the PSP intent');
select is((public.claim_ride_sandbox_account(pg_temp.second_leg())->>'payer_id')::uuid,tests.uid('client_a'),'Claim is idempotent with server-derived payer');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_simulate_ride_payment_event(pg_temp.second_leg(),md5('manual')::uuid,'capture',2509)$$,
  'P0001','ride_operation_conflict','No manual money posting after PSP sandbox intent');
select throws_ok($$select public.claim_ride_sandbox_account(pg_temp.second_leg())$$,'42501',null,'Authenticated admin lacks PSP capability');
select tests.authenticate_service();
select lives_ok($$select public.record_ride_sandbox_financial_event(pg_temp.second_leg(),md5('verified')::uuid,'capture',2509)$$,
  'Verified source records one full capture');
select lives_ok($$select public.record_ride_sandbox_financial_event(pg_temp.second_leg(),md5('verified')::uuid,'capture',2509)$$,
  'Webhook and later reconciliation share the same operation ID');
select tests.clear_authentication();
select is((select count(*) from private.ride_financial_events where leg_id=pg_temp.second_leg() and kind='capture'),1::bigint,
  'Provider delivery cannot duplicate a money movement');
create function pg_temp.interrupted() returns uuid language sql immutable as $$select 'f1000000-0000-4000-8000-000000000003'::uuid$$;
grant execute on function pg_temp.interrupted() to authenticated;
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,
                            driver_cents,payer_id,driver_id,tariff_id,status,environment)
select pg_temp.interrupted(),ride_id,3,origin,destination,pickup_at+interval '6 hours',duration_minutes,
  tstzrange(pickup_at+interval '6 hours',pickup_at+interval '7 hours','[)'),3000,300,0,2700,payer_id,driver_id,tariff_id,'boarded','simulation'
 from public.ride_legs where id=pg_temp.leg();
update public.ride_legs set status='unknown' where id=pg_temp.interrupted();
select tests.authenticate_as('admin');
select is(public.admin_ride_settlement(pg_temp.interrupted())#>>'{review,status}','unknown','Cost is pending while trip outcome is unknown');
select throws_ok($$select public.admin_confirm_simulated_ride_cost(pg_temp.interrupted(),md5('cancel')::uuid,600,'fixture receipt')$$,
  'P0001','ride_financial_state','Cannot settle cancellation cost before confirmation');
select tests.clear_authentication();
update public.ride_legs set status='cancelled' where id=pg_temp.interrupted();
select tests.authenticate_as('admin');
select lives_ok($$select public.admin_confirm_simulated_ride_cost(pg_temp.interrupted(),md5('cancel')::uuid,600,'fixture receipt')$$,'Documented cost is retained after confirmed cancellation');
select lives_ok($$select public.admin_confirm_simulated_ride_cost(pg_temp.interrupted(),md5('cancel')::uuid,600,'fixture receipt')$$,'Recording same cancellation cost is idempotent');
select is((public.admin_ride_settlement(pg_temp.interrupted())#>>'{review,cost_cents}')::integer,600,'Six-real cancellation cost survives, with no assumed zero');
select is(public.admin_ride_settlement(pg_temp.interrupted())->>'recognized','false','Accounting the platform expense does not charge the rider');
select tests.clear_authentication();
select throws_ok($$update private.ride_deployment set environment='live' where singleton$$,
  'P0001','ride_environment_in_use','A project with rehearsed money/legs cannot become live');
update private.ride_network set module_enabled=false where environment='simulation';
select tests.authenticate_as('admin');
select throws_ok($$select pg_temp.post_event(11,'capture',3309)$$,'P0001','not_allowed','Manual money events stop when the module closes');
select tests.authenticate_service();
select lives_ok($$select public.record_ride_sandbox_financial_event(pg_temp.second_leg(),md5('verified refund')::uuid,'refund',2509)$$,
  'A verified refund on an already claimed sandbox obligation can reconcile after stopping the module');
select tests.clear_authentication();
update public.profiles set deleted_at=now() where id=tests.uid('admin');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_ride_settlement(pg_temp.leg())$$,'P0001','not_allowed','An operator with a deleted profile cannot inspect balances using an old JWT');
select * from finish();
rollback;
