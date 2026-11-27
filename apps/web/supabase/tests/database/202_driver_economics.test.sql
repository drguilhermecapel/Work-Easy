begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true where environment='simulation';
create function pg_temp.monday() returns date language sql stable as $$
  select date_trunc('week',m)::date from generate_series(date_trunc('month',current_date)-interval '5 months',
    date_trunc('month',current_date)-interval '1 month',interval '1 month') m
  where extract(isodow from m)>1 order by m desc limit 1
$$;
create function pg_temp.local_at(day_offset int, hour_value text) returns timestamptz language sql stable as $$
 select (pg_temp.monday()+day_offset+hour_value::time) at time zone 'America/Sao_Paulo'
$$;
create function pg_temp.report_for(day_offset int, whole_week boolean default true) returns jsonb language sql as $$
 select public.ride_driver_statement(pg_temp.monday()+day_offset,whole_week)
$$;
create function pg_temp.trip(n integer) returns uuid language sql immutable as $$select md5('income-trip'||n)::uuid$$;
grant execute on function pg_temp.monday(),pg_temp.local_at(int,text),pg_temp.report_for(int,boolean),pg_temp.trip(int) to authenticated,service_role;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by) select tests.uid(k),'simulation','sedan','approved',current_date+30,tests.uid('admin')
from unnest(array['provider_c','provider_d']) k;
insert into private.ride_driver_shifts(driver_id,area,period) values(tests.uid('provider_c'),'Saúde',tstzrange(pg_temp.local_at(0,'09:00'),pg_temp.local_at(0,'16:00')));
insert into private.ride_driver_online_periods(driver_id,started_at,stopped_at) values(tests.uid('provider_c'),pg_temp.local_at(0,'09:00'),pg_temp.local_at(0,'13:00'));
with q as (
  insert into private.ride_quotes(environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
  select 'simulation',tests.uid('client_a'),gen_random_uuid(),tests.uid('client_a'),'[]',
    '[{"seq":1,"origin":"Saúde","destination":"Jabaquara","extras":["toll"],"meters":5000}]',array[tests.uid('client_a')],id,now()+interval '10 minutes','requested',3609
  from private.ride_tariffs where environment='simulation' limit 1 returning id,tariff_id
), r as (
  insert into public.rides(quote_id,environment,passenger_id) select id,'simulation',tests.uid('client_a') from q returning id,quote_id
)
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,
                            driver_cents,payer_id,driver_id,tariff_id,status,environment)
select pg_temp.trip(1),r.id,1,'Saúde','Jabaquara',pg_temp.local_at(0,'09:20'),30,tstzrange(pg_temp.local_at(0,'09:20'),pg_temp.local_at(0,'10:00')),
  3609,300,600,3309,tests.uid('client_a'),tests.uid('provider_c'),q.tariff_id,'boarded','simulation' from r join q on q.id=r.quote_id;
insert into private.ride_events(actor_id,operation_key,leg_id,action,from_status,to_status,at) values
(tests.uid('provider_c'),gen_random_uuid(),pg_temp.trip(1),'arriving','accepted','arriving',pg_temp.local_at(0,'09:10')),
(tests.uid('provider_c'),gen_random_uuid(),pg_temp.trip(1),'boarded','arriving','boarded',pg_temp.local_at(0,'09:30')),
(tests.uid('provider_c'),gen_random_uuid(),pg_temp.trip(1),'completed','boarded','completed',pg_temp.local_at(0,'10:00'));
insert into private.ride_pickup_arrivals(leg_id,arrived_at) values(pg_temp.trip(1),pg_temp.local_at(0,'09:20'));
update public.ride_legs set status='completed',updated_at=pg_temp.local_at(0,'10:00') where id=pg_temp.trip(1);
with b as (select tests.make_booking('provider_c','client_a','t-reparo',tests.sp_period(tests.at(49,1,'12:00')),'completed',10000) id)
insert into public.booking_events(booking_id,from_status,to_status,actor_id,at) select b.id,t.prev::public.booking_status,t.next::public.booking_status,tests.uid('provider_c'),pg_temp.local_at(0,t.hm)
  from b cross join (values ('accepted','in_progress','09:45'),('in_progress','completed','10:15')) t(prev,next,hm);
select tests.authenticate_as('admin');
select public.admin_simulate_ride_payment_event(pg_temp.trip(1),md5('cap')::uuid,'capture',3609,0);
select public.admin_simulate_ride_payment_event(pg_temp.trip(1),md5('paid')::uuid,'payout',1000,0);
select public.admin_simulate_ride_payment_event(pg_temp.trip(1),md5('refund')::uuid,'refund',500,0);
select tests.clear_authentication();
update private.ride_financial_events set recorded_at=case when kind='refund' then pg_temp.local_at(7,'09:00') else pg_temp.local_at(0,'10:01') end
 where leg_id=pg_temp.trip(1);
insert into private.ride_driver_campaigns(id,environment,period,budget_cents,approval_ref)
 values(pg_temp.trip(50),'simulation',tstzrange(now()-interval '1 hour',now()+interval '1 day'),200,'fixture-approval');
select tests.authenticate_service();
select lives_ok($$select public.record_ride_driver_reward(md5('bonus')::uuid,pg_temp.trip(50),pg_temp.trip(1),'reward',200,'approved-1')$$,'Optional campaign has a funded credit');
select lives_ok($$select public.record_ride_driver_reward(md5('bonus')::uuid,pg_temp.trip(50),pg_temp.trip(1),'reward',200,'approved-1')$$,'Repeated reward credit is idempotent');
select throws_ok($$select public.record_ride_driver_reward(md5('unfunded')::uuid,pg_temp.trip(50),pg_temp.trip(1),'reward',1,'approved-2')$$,
 'P0001','ride_financial_state','Budget cannot be exceeded');
select public.record_ride_driver_reward(md5('bp')::uuid,pg_temp.trip(50),pg_temp.trip(1),'reward_payout',80,'paid-1');
select public.record_ride_driver_reward(md5('br')::uuid,pg_temp.trip(50),pg_temp.trip(1),'reward_reversal',50,'returned-1');
select public.record_ride_driver_reward(md5('bpr')::uuid,pg_temp.trip(50),pg_temp.trip(1),'reward_payout_reversal',20,'paid-back-1');
select tests.clear_authentication();
update private.ride_driver_rewards set recorded_at=pg_temp.local_at(0,'10:05') where leg_id=pg_temp.trip(1);
select tests.authenticate_as('provider_c');
select is(pg_temp.report_for(0)->>'from_day',pg_temp.monday()::text,'São Paulo statement covers Monday through Sunday across the month boundary');
select is((pg_temp.report_for(0)#>>'{metrics,missing_days}')::int,1,'Absent observations flag the working date');
select is(pg_temp.report_for(0)#>>'{metrics,per_online_hour}',null,'Missing own expenses suppresses the net rate');
select public.ride_driver_diary(pg_temp.monday(),5000,7000,500);
select public.ride_driver_diary(pg_temp.monday(),5000,7000,500);
select is((pg_temp.report_for(0)#>>'{metrics,income}')::int,3309,'Tariff accrual includes pass-throughs once, independent of partial payout');
select is((pg_temp.report_for(0)#>>'{metrics,reimbursements}')::int,600,'Expense pass-through is shown');
select is((select (x->>'toll_cents')::int from jsonb_array_elements(pg_temp.report_for(0)->'entries') x where x->>'kind'='earned'),600,'Toll amount comes from the frozen quote');
select is((pg_temp.report_for(0)#>>'{metrics,rewards}')::int,150,'Only recognized net rewards contribute to income');
select is((pg_temp.report_for(0)#>>'{metrics,paid}')::int,1060,'Paid driver cash includes partial fare and net promotional payout');
select is((pg_temp.report_for(0)#>>'{metrics,closing}')::int,2399,'Closing equals opening plus signed income minus paid');
select is((pg_temp.report_for(7)#>>'{metrics,opening}')::int,2399,'Following week carries the previous close');
select is((pg_temp.report_for(7)#>>'{metrics,income}')::int,-450,'Subsequent refund adjusts its own week after commission reversal');
select is((pg_temp.report_for(0)#>>'{metrics,base_net}')::int,2809,'Income without incentives subtracts entered costs once across diary retries');
select is((pg_temp.report_for(0)#>>'{metrics,total_net}')::int,2959,'Income with incentives stays distinct');
select is((pg_temp.report_for(0)#>>'{metrics,online_seconds}')::int,14400,'Idle time remains part of the observed online shift');
select is((pg_temp.report_for(0)#>>'{metrics,approach_seconds}')::int,600,'Approach begins at departure, not reservation');
select is((pg_temp.report_for(0)#>>'{metrics,wait_seconds}')::int,600,'Waiting runs from arrival to boarding');
select is((pg_temp.report_for(0)#>>'{metrics,passenger_seconds}')::int,1800,'Onboard time excludes pickup wait');
select is((pg_temp.report_for(0)#>>'{metrics,committed_seconds}')::int,3900,'Overlapping service and driving intervals counted once');
select is((pg_temp.report_for(0)#>>'{metrics,per_online_hour}')::int,740,'Four online hours include idle time in denominator');
select is((pg_temp.report_for(0)#>>'{metrics,per_km}')::int,247,'5 paid km and 7 empty km both enter the rate');
select is(pg_temp.report_for(0)#>'{trends,cells}','[]'::jsonb,'No sparse cell is disclosed');
select is(pg_temp.report_for(1,false)#>>'{metrics,per_online_hour}',null,'Denominator zero has no rate');
select tests.authenticate_as('provider_d');
select is(pg_temp.report_for(0)->'entries','[]'::jsonb,'Another driver cannot query the recorded trips');
select is(pg_temp.report_for(0)->'diary','null'::jsonb,'Diary stays private');
select throws_ok($$select * from private.ride_driver_book_entries$$,'42501',null,'No direct access to driver cash book');
select tests.authenticate_as('client_a');
select throws_ok($$select pg_temp.report_for(0)$$,'P0001','not_allowed','Passenger cannot use driver statement');
select tests.clear_authentication();
-- On cancellation the confirmed obligation and actual cash remain separate.
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,
 driver_cents,payer_id,driver_id,tariff_id,status,environment)
 select pg_temp.trip(2),ride_id,2,destination,origin,pg_temp.local_at(2,'10:00'),30,
  tstzrange(pg_temp.local_at(2,'10:00'),pg_temp.local_at(2,'10:30')),3000,300,0,2700,payer_id,driver_id,tariff_id,'accepted','simulation'
 from public.ride_legs where id=pg_temp.trip(1);
update public.ride_legs set status='cancelled',updated_at=pg_temp.local_at(2,'10:01') where id=pg_temp.trip(2);
update private.ride_interruption_costs set opened_at=pg_temp.local_at(2,'10:02') where leg_id=pg_temp.trip(2);
select tests.authenticate_as('provider_c');
select is((select x->'gross' from jsonb_array_elements(pg_temp.report_for(2,false)->'entries') x where x->>'kind'='cancel_pending'),'null'::jsonb,
 'Cancellation starts with an unknown expense rather than assuming zero');
select tests.authenticate_as('admin');
select public.admin_confirm_simulated_ride_cost(pg_temp.trip(2),md5('cc')::uuid,600,'evidencia');
select public.admin_record_ride_cost_disbursement(pg_temp.trip(2),md5('cp')::uuid,200,'comprovante');
select tests.clear_authentication();
update private.ride_interruption_costs set reviewed_at=pg_temp.local_at(2,'10:15') where leg_id=pg_temp.trip(2);
update private.ride_cost_disbursements set recorded_at=pg_temp.local_at(2,'10:20') where leg_id=pg_temp.trip(2);
select tests.authenticate_as('provider_c');
select is((pg_temp.report_for(2,false)#>>'{metrics,income}')::int,600,'Documented cancellation credit counted once');
select is((pg_temp.report_for(2,false)#>>'{metrics,paid}')::int,200,'Only the supported cancellation disbursement is liquidated');
select lives_ok($$select public.ride_open_help(pg_temp.trip(2),'payment')$$,'Driver can dispute a cancellation posting');
select ok((select bool_and(x->>'protocol' is not null) from jsonb_array_elements(pg_temp.report_for(2,false)->'entries') x),'All entries for the same leg return the existing payment protocol');
select tests.clear_authentication();
-- A closed four-week cell needs real diversity among drivers and customers.
create temp table trend_legs as select n,pg_temp.trip(100+n) quote,pg_temp.trip(200+n) ride,pg_temp.trip(300+n) leg,
 pg_temp.trip(400+n%5) driver,pg_temp.trip(500+n%5) passenger,
 (date_trunc('week',now() at time zone 'America/Sao_Paulo') - interval '2 days' + interval '10 hours') at time zone 'America/Sao_Paulo' as pickup
 from generate_series(1,12) n;
insert into private.ride_subjects select distinct driver from trend_legs union select distinct passenger from trend_legs;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by) select distinct driver,'simulation','sedan','approved',current_date+30,tests.uid('admin') from trend_legs;
insert into private.ride_quotes(id,environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents,created_at)
 select quote,'simulation',passenger,quote,passenger,'[]','[]',array[passenger],(select id from private.ride_tariffs where environment='simulation' limit 1),
 pickup+interval '1 hour','requested',2000,pickup-interval '30 minutes' from trend_legs;
insert into public.rides(id,quote_id,environment,passenger_id,created_at) select ride,quote,'simulation',passenger,pickup-interval '15 minutes' from trend_legs;
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,driver_cents,
 payer_id,driver_id,tariff_id,status,environment)
 select leg,ride,1,'Saúde','Jabaquara',pickup,30,tstzrange(pickup,pickup+interval '30 minutes'),2000,200,0,1800,passenger,
 case when n<=10 then driver end,(select id from private.ride_tariffs where environment='simulation' limit 1),
 case when n<=10 then 'completed' else 'cancelled' end,'simulation' from trend_legs;
insert into private.ride_financial_accounts(leg_id,environment,payer_id,driver_id,fare_cents,extras_cents,fee_cents,driver_cents)
 select leg,'simulation',passenger,driver,2000,0,200,1800 from trend_legs where n<=10;
insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,receivable_delta,driver_delta,fee_delta,recorded_at)
 select leg,leg,'earned',2000,2000,1800,200,pickup+interval '30 minutes' from trend_legs where n<=10;
select tests.authenticate_as('provider_c');
select ok(pg_temp.report_for(0)#>'{trends,cells}' @> '[{"zone":"Saúde","hour_block":8,"completed":10,"demand":12,"typical_cents":1800}]',
 'Published fixed cell includes unmet demand, distinct users and ordinary fare only');
select tests.clear_authentication();
delete from private.ride_driver_shifts where driver_id=tests.uid('provider_c');
select tests.authenticate_as('provider_c');
select is((pg_temp.report_for(0)#>>'{metrics,online_seconds}')::int,14400,'Removing a shift preserves its historical time');
select tests.clear_authentication();
update public.profiles set deleted_at=now() where id=tests.uid('provider_c');
select is((select count(*) from private.ride_driver_diaries where driver_id=tests.uid('provider_c')),0::bigint,'Author erasure clears private diary');
select tests.authenticate_as('provider_c');
select throws_ok($$select pg_temp.report_for(0)$$,'P0001','not_allowed','Old token cannot read after erasure');
select * from finish();
rollback;
