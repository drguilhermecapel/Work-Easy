begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true where environment='simulation';
create function pg_temp.leg() returns uuid language sql immutable as $$select md5('receipt143-leg')::uuid$$;
grant execute on function pg_temp.leg() to authenticated, service_role;

-- Empty test deployment: exercise export authorization/pagination and audit
-- without opening any real network connection or using personal information.
update private.ride_deployment set environment='live';
insert into private.ride_receipt_policy values('live','fixture-143',30,true,now()+interval '1 day');
select tests.authenticate_service();
select is(public.export_ride_municipal(now()-interval '1 hour',now(),null,5),'[]'::jsonb,'Authorized export returns only a bounded live period');
select throws_ok($$select public.export_ride_municipal(now()-interval '3 days',now(),null,5)$$,'P0001','invalid_export_window','Reject overly broad municipal extract');
select tests.clear_authentication();
select is((select count(*) from private.ride_export_audit where approval_ref='fixture-143'),1::bigint,'Audit records authorized extract even when empty');
update private.ride_deployment set environment='simulation';

insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by)
  values(tests.uid('provider_c'),'simulation','sedan','approved',current_date+30,tests.uid('admin'));
update private.ride_routes set
  origin_point='{"label":"Ponto público de ensaio A","lat":-23.60,"lng":-46.63}',
  destination_point='{"label":"Ponto público de ensaio B","lat":-23.61,"lng":-46.63}',
  verified_ref='SYNTHETIC-143',verified_until=now()+interval '1 day'
  where environment='simulation' and origin='Saúde' and destination='Jabaquara';
with q as (
  insert into private.ride_quotes(environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
    select 'simulation',tests.uid('provider_a'),gen_random_uuid(),tests.uid('provider_a'),'[]',
      '[{"seq":1,"meters":4400,"origin":"Saúde","destination":"Jabaquara"}]', array[tests.uid('provider_a'),tests.uid('client_a')],id,now()+interval '4 minutes','requested',3000
      from private.ride_tariffs where environment='simulation' limit 1 returning id,tariff_id
), r as (
  insert into public.rides(quote_id,environment,passenger_id,created_at)
    select id,'simulation',tests.uid('provider_a'),now()-interval '1 hour' from q returning id,quote_id
)
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,
  fee_cents,extras_cents,driver_cents,payer_id,driver_id,tariff_id,status,environment)
select pg_temp.leg(),r.id,1,'Saúde','Jabaquara',now()-interval '20 minutes',20,tstzrange(now(),now()+interval '20 minutes'),
  3000,290,100,2710,tests.uid('client_a'),tests.uid('provider_c'),q.tariff_id,'arriving','simulation' from r join q on r.quote_id=q.id;

update public.ride_legs l set source_quote_id=r.quote_id,quote_seq=1 from public.rides r
  where l.id=pg_temp.leg() and r.id=l.ride_id;
insert into private.ride_meeting_snapshots(quote_id,seq,origin,destination,reference,valid_until)
  select source_quote_id,1,'{"label":"Ponto público de ensaio A","lat":-23.60,"lng":-46.63}',
    '{"label":"Ponto público de ensaio B","lat":-23.61,"lng":-46.63}','SYNTHETIC-143',now()+interval '1 day'
  from public.ride_legs where id=pg_temp.leg() on conflict(quote_id,seq) do nothing;

-- A driver who gives up before pickup and an unresolved attempt create neither
-- an earned fare nor a receipt. Resolution may confirm a cancellation later.
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,
  fee_cents,extras_cents,driver_cents,payer_id,driver_id,tariff_id,status,environment)
select md5('receipt143-uncertain')::uuid,ride_id,2,destination,origin,pickup_at+interval '2 hours',duration_minutes,
  tstzrange(now()+interval '2 hours',now()+interval '3 hours'),fare_cents,fee_cents,extras_cents,
  driver_cents,payer_id,driver_id,tariff_id,'unknown',environment from public.ride_legs where id=pg_temp.leg();
select tests.authenticate_as('provider_a');
select is(public.ride_aftercare(md5('receipt143-uncertain')::uuid)->'document','null'::jsonb,'Unknown before boarding has no passenger receipt');
select tests.authenticate_as('admin');
select throws_ok($$select public.ride_resolve(md5('receipt143-uncertain')::uuid,'completed',gen_random_uuid())$$,
  'P0001','ride_resolution_proof_required','Unknown before boarding needs evidence to recognize money');
select public.ride_resolve(md5('receipt143-uncertain')::uuid,'cancelled',md5('receipt143-resolution')::uuid);
select tests.clear_authentication();
select ok(not exists(select from private.ride_financial_accounts where leg_id=md5('receipt143-uncertain')::uuid),
  'Confirmed withdrawal before boarding has no accrued fare');
select ok(not exists(select from private.ride_receipts where leg_id=md5('receipt143-uncertain')::uuid),
  'Cancelled leg cannot create a receipt or passenger route');

insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,
  fee_cents,extras_cents,driver_cents,payer_id,driver_id,tariff_id,status,environment)
select md5('receipt143-proof')::uuid,ride_id,3,origin,destination,pickup_at,duration_minutes,
  tstzrange(now()+interval '3 hours',now()+interval '4 hours'),fare_cents,fee_cents,extras_cents,
  driver_cents,payer_id,driver_id,tariff_id,'unknown',environment from public.ride_legs where id=pg_temp.leg();
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_resolve_with_evidence(md5('receipt143-proof')::uuid,md5('op143')::uuid,
  'CASE-143',now()-interval '35 minutes',now()-interval '10 minutes')$$,'P0001','not_allowed','Payer cannot certify a trip');
select tests.authenticate_as('admin');
select lives_ok($$select public.ride_resolve_with_evidence(md5('receipt143-proof')::uuid,md5('op143')::uuid,
  'CASE-143',now()-interval '35 minutes',now()-interval '10 minutes')$$,'Admin reconciles actual trip times against a restricted reference');
select is(public.ride_resolve_with_evidence(md5('receipt143-proof')::uuid,md5('op143')::uuid,
  'CASE-143',now()-interval '35 minutes',now()-interval '10 minutes')->>'replayed','true','Same evidence replay is idempotent');
select throws_ok($$select public.ride_resolve_with_evidence(md5('receipt143-proof')::uuid,md5('op143')::uuid,
  'CHANGED',now()-interval '35 minutes',now()-interval '10 minutes')$$,'P0001','idempotency_conflict','Reconciliation reference cannot change on replay');
select tests.clear_authentication();
select is((select ended_at-boarded_at from private.ride_receipts where leg_id=md5('receipt143-proof')::uuid),
  interval '25 minutes','Actual duration is independent of administrative confirmation time');

select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_mark_at_pickup(pg_temp.leg())$$,'P0001','not_allowed','Only assigned driver marks pickup arrival');
select tests.authenticate_as('provider_c');
select is(public.ride_mark_at_pickup(pg_temp.leg()),public.ride_mark_at_pickup(pg_temp.leg()),'Replayed arrival preserves time');
select tests.clear_authentication();
update public.ride_legs set status='boarded' where id=pg_temp.leg();
insert into private.ride_events(actor_id,operation_key,leg_id,action,from_status,to_status,at)
  values(tests.uid('provider_c'),gen_random_uuid(),pg_temp.leg(),'boarded','arriving','boarded',now()-interval '18 minutes');
-- Deterministic server-side fixtures, not a GPS transmission by the simulator.
insert into private.ride_observations values
  (pg_temp.leg(),now()-interval '21 minutes',-23.7,-46.7,10,false),
  (pg_temp.leg(),now()-interval '15 minutes',-23.60,-46.63,10,true),
  (pg_temp.leg(),now()-interval '3 minutes',-23.61,-46.63,10,true);
update public.ride_legs set status='completed',updated_at=now() where id=pg_temp.leg();
select is((select jsonb_array_length(route) from private.ride_receipts where leg_id=pg_temp.leg()),2,'Pre-boarding location excluded');
select ok((select measured_meters between 1080 and 1150 from private.ride_receipts where leg_id=pg_temp.leg()),'Observed distance in meters differs from quote');
delete from private.ride_observations where leg_id=pg_temp.leg();
delete from private.ride_meeting_snapshots where reference='SYNTHETIC-143';
select tests.authenticate_as('provider_a');
select is(public.ride_aftercare(pg_temp.leg()) #>> '{document,journey,origin}','Ponto público de ensaio A','Passenger retains the exact authorized pickup after signal and quote-point expiry');
select is(public.ride_aftercare(pg_temp.leg()) #>> '{document,journey,destination_point,lat}','-23.61','Receipt stores only its own consented destination');
select is(public.ride_aftercare(pg_temp.leg()) #>> '{document,money,paid_cents}','0','Completed ride has no payment until confirmation');
select is(public.ride_aftercare(pg_temp.leg())->>'can_rate','true','Only passenger can submit rating');
select lives_ok($$select public.ride_rate(pg_temp.leg(),4)$$,'Rate exactly this completed ride');
select is(public.ride_aftercare(pg_temp.leg())->>'stars','4','Rating survives reload');
select is(public.ride_open_help(pg_temp.leg(),'price'),public.ride_open_help(pg_temp.leg(),'price'),'Repeated help request has a single protocol');
select tests.authenticate_as('client_a');
select ok(not (public.ride_aftercare(pg_temp.leg())->'document' ? 'journey'),'Different payer cannot read route or driver identity');
select is(public.ride_aftercare(pg_temp.leg())->>'can_rate','false','Different payer cannot rate travel');
select ok(not (public.ride_aftercare(pg_temp.leg())#>'{document,money}' ? 'driver_cents'),'Different payer does not receive driver balance');
select tests.authenticate_as('provider_c');
select is(public.ride_aftercare(pg_temp.leg())#>>'{document,money,driver_cents}','2710','Driver sees own remuneration');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_aftercare(pg_temp.leg())$$,'P0001','not_allowed','Unrelated user cannot access receipt');
select ok(not has_function_privilege('authenticated','public.export_ride_municipal(timestamptz,timestamptz,uuid,int)','EXECUTE'),'App roles cannot export municipal dataset');
select tests.authenticate_service();
select throws_ok($$select public.export_ride_municipal(now()-interval '1 day',now(),null,20)$$,'P0001','export_disabled','Simulation cannot be exported as real mobility');
select tests.clear_authentication();
select tests.authenticate_as('admin');
select public.admin_simulate_ride_payment_event(pg_temp.leg(),md5('a143')::uuid,'capture',3000,0);
select public.admin_simulate_ride_payment_event(pg_temp.leg(),md5('b143')::uuid,'refund',100,0);
select tests.authenticate_as('client_a');
select is(public.ride_aftercare(pg_temp.leg())#>>'{document,money,paid_cents}','2900','Partial refund updates net paid in receipt');
select is(public.ride_aftercare(pg_temp.leg())#>>'{document,money,reversed_cents}','100','Original expense and refund can be reconciled');
select tests.clear_authentication();
update private.ride_receipts set expires_at=now()-interval '1 hour' where leg_id=pg_temp.leg();
insert into private.ride_receipt_holds values(pg_temp.leg(),'SANDBOX-CASE','simulated-owner',now()+interval '1 hour');
select private.purge_ride_receipts();
select is((select count(*) from private.ride_receipts where leg_id=pg_temp.leg()),1::bigint,'A case with an active dated hold preserves its record');
update private.ride_receipt_holds set hold_until=now()-interval '1 minute' where leg_id=pg_temp.leg();
select private.purge_ride_receipts();
select is((select count(*) from private.ride_receipts where leg_id=pg_temp.leg()),0::bigint,'Expired hold releases only that receipt');
select is((select count(*) from private.ride_financial_accounts where leg_id=pg_temp.leg()),1::bigint,'Location purge preserves financial obligations');
select * from finish();
rollback;
