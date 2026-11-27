begin;
select no_plan();
select tests.setup_fixture();
create function pg_temp.leg(n integer) returns uuid language sql immutable as $$select md5('ride-rights-'||n)::uuid$$;
create temp table account(subject uuid);
insert into account select tests.uid('provider_a');
insert into public.ride_drivers(id,environment,vehicle,status,reviewed_by,valid_until)
  values (tests.uid('provider_c'),'simulation','sedan','approved',tests.uid('admin'),current_date+30);
insert into private.ride_driver_shifts(driver_id,area,period)
  values(tests.uid('provider_c'),'Saúde',tstzrange(now(),now()+interval '2 hours'));
insert into private.ride_devices(driver_id,transport,token,expires_at)
  values(tests.uid('provider_c'),'android','fixture-device-private',now()+interval '2 hours');
with q as (
  insert into private.ride_quotes(environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
  select 'simulation',tests.uid('provider_a'),gen_random_uuid(),tests.uid('provider_a'),'[]','[]',
    array[tests.uid('provider_a'),tests.uid('client_a')],id,now()+interval '4 minutes','requested',2900
    from private.ride_tariffs where environment='simulation' limit 1 returning id,tariff_id
), r as (
  insert into public.rides(quote_id,environment,passenger_id) select id,'simulation',tests.uid('provider_a') from q returning id,quote_id
)
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,driver_cents,
    payer_id,driver_id,tariff_id,status,environment)
  select pg_temp.leg(i),r.id,i,'Saúde','Jabaquara',now()+make_interval(hours=>i),20,
    tstzrange(now()+make_interval(hours=>i),now()+make_interval(hours=>i,mins=>20)),2900,290,2610,tests.uid('client_a'),
    case when i<>3 then tests.uid('provider_c') end,q.tariff_id,case when i=1 then 'boarded' when i=2 then 'arriving' else 'requested' end,'simulation'
    from q join r on r.quote_id=q.id cross join generate_series(1,3) i;
insert into private.ride_events values(tests.uid('provider_c'),gen_random_uuid(),pg_temp.leg(1),'boarded','arriving','boarded',now()-interval '20 minutes');
insert into private.ride_observations values
  (pg_temp.leg(1),now()-interval '18 minutes',-23.6,-46.63,15,true),
  (pg_temp.leg(2),now()-interval '1 minute',-23.7,-46.63,15,false);
update public.ride_legs set status='completed' where id=pg_temp.leg(1);
insert into private.ride_receipt_holds values(pg_temp.leg(1),'fixture-proof','fixture-owner',now()+interval '30 days');
insert into private.ride_arrival_estimates values(pg_temp.leg(2),now()+interval '1 minute',now());
insert into private.ride_route_cases(id,environment,request_key,creator_id,passenger_id,origin_area,destination_area,status,valid_until)
  values(pg_temp.leg(10),'simulation',gen_random_uuid(),tests.uid('provider_a'),tests.uid('provider_a'),'Saúde','Jabaquara','draft',now()+interval '2 hours');
insert into private.ride_route_points(route_id,origin,initial_digest,delete_by)
  values(pg_temp.leg(10),'{"label":"endereço inserido pelo titular","lat":-23.6,"lng":-46.63}','\x00',now()+interval '2 hours');

select tests.authenticate_as('provider_a');
select lives_ok($$select public.ride_rate(pg_temp.leg(1),4)$$,'Active passenger can rate');
select lives_ok($$select public.ride_open_help(pg_temp.leg(1),'payment')$$,'Passenger opens own help case');
select is((select mobility#>>'{legs,0,my_rating}' from public.my_ride_data_export), '4', 'Account export view contains own rating');
select is((select jsonb_array_length(mobility->'help') from public.my_ride_data_export),1,'Own help protocol appears');
select ok((select mobility::text not like '%'||tests.uid('provider_c')::text||'%' and mobility::text not like '%driver_number%' from public.my_ride_data_export),'Export omits other participant identity');
select is(public.ride_export_my_data()#>>'{route_requests,0,origin,label}','endereço inserido pelo titular','Passenger can export an unexpired personal pickup');
select ok(not (public.ride_export_my_data()#>'{legs,0}' ? 'fare_cents'),'Nonpayer cannot export payer balance');
select tests.authenticate_as('client_a');
select ok(public.ride_export_my_data()#>>'{legs,0,financial,due_cents}'='2900' and not (public.ride_export_my_data()#>'{legs,0}' ? 'journey'),'Payer exports own balance without passenger route');
select tests.authenticate_as('provider_c');
select ok(public.ride_export_my_data()#>>'{legs,0,financial,driver_cents}'='2610' and not (public.ride_export_my_data()#>'{legs,0,financial}' ? 'due_cents'),'Driver sees own earnings without payer details');
select ok(public.ride_export_my_data()#>>'{device_registrations,0,platform}'='android' and public.ride_export_my_data()::text not like '%fixture-device-private%', 'Driver sees registered platform without a reusable token');
select tests.authenticate_as('admin');
select is(public.ride_export_my_data()->'legs','[]'::jsonb,'Administrator personal export cannot expand access');
select throws_ok($$select * from private.ride_subjects$$,'42501',null,'No access to cross-domain subject keys');
select tests.clear_authentication();

select lives_ok($$select public.anonymize_user(tests.uid('provider_a'))$$,'Normal account deletion anonymizes active and completed rides');
select is((select status from public.ride_legs where id=pg_temp.leg(2)),'unknown','Assigned trip requires reconciliation after deletion');
select is((select status from public.ride_legs where id=pg_temp.leg(3)),'cancelled','Unassigned request is withdrawn');
select is((select count(*) from public.support_tasks where kind='ride_deletion_review' and payload->>'leg_id'=pg_temp.leg(2)::text),1::bigint,'Operations receives one case for assigned trip');
select is((select count(*) from private.ride_route_points where route_id=pg_temp.leg(10)),0::bigint,'Unused exact addresses are erased');
select is((select count(*) from private.ride_observations where leg_id in(pg_temp.leg(1),pg_temp.leg(2))),0::bigint,'Raw GPS is removed when completed or outside boarding');
select ok(exists(select from private.ride_receipts where leg_id=pg_temp.leg(1)) and exists(select from private.ride_receipt_holds where leg_id=pg_temp.leg(1)),'Completed receipt and formal hold survive account deletion');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_export_my_data()$$,'P0001','not_allowed','JWT of a logically deleted account cannot export');
select throws_ok($$select public.ride_progress(pg_temp.leg(1))$$,'P0001','not_allowed','Stale token cannot read progress');
select throws_ok($$select public.ride_aftercare(pg_temp.leg(1))$$,'P0001','not_allowed','Stale token cannot read the receipt');
select throws_ok($$select public.ride_open_help(pg_temp.leg(1),'payment')$$,'P0001','not_allowed','Stale token cannot reclaim help protocol');
select throws_ok($$select public.ride_rate(pg_temp.leg(1),2)$$,'P0001','not_allowed','Stale token cannot change rating');
select tests.clear_authentication();
select lives_ok($$delete from auth.users where id=(select subject from account)$$,'Auth account can be physically erased with financial and regulatory history');
select ok(not exists(select from public.profiles where id=(select subject from account)) and exists(select from private.ride_subjects where id=(select subject from account)),'Technical key has no surviving Auth profile');
select is((select fare_cents from private.ride_financial_accounts where leg_id=pg_temp.leg(1)),2900,'The financial book survives physical erasure');
select tests.authenticate_as('client_a');
select is(public.ride_aftercare(pg_temp.leg(1))#>>'{document,money,due_cents}','2900','Other payer keeps their own statement');
select tests.clear_authentication();
select public.anonymize_user(tests.uid('provider_c'));
select ok(not exists(select from private.ride_devices where driver_id=tests.uid('provider_c')) and not exists(select from private.ride_driver_shifts where driver_id=tests.uid('provider_c')),'Erasing driver clears all location preferences, shifts and push tokens');
select tests.authenticate_as('provider_c');
select ok(not public.ride_can_transmit(pg_temp.leg(2)),'No GPS capability for deleted driver');
select throws_ok($$select public.ride_send_position(pg_temp.leg(2),now(),-23.6,-46.63,15)$$,'P0001','transmission_ended','Stale token cannot submit an observation');
select throws_ok($$select public.ride_mark_at_pickup(pg_temp.leg(2))$$,'P0001','not_allowed','Stale token cannot mark arrival');
select throws_ok($$select public.ride_device('android','fixture-device-private',true)$$,'P0001','not_allowed','Stale token cannot register a push device');
select tests.clear_authentication();
select lives_ok($$delete from auth.users where id=tests.uid('provider_c')$$,'Assigned driver can physically erase Auth while its legal receipt survives');
with p as (
  insert into private.ride_pilot(period,approved_ref,budget_cents)
    values(tstzrange(now(),now()+interval '1 day'),'fixture-150',10000) returning id
) insert into private.ride_coverage(pilot,period,lead_id,backup_id)
  select p.id,tstzrange(now(),now()+interval '12 hours'),tests.uid('admin'),tests.uid('client_b') from p;
select public.anonymize_user(tests.uid('admin'));
select ok(not exists(select from private.ride_coverage where lead_id=tests.uid('admin') and upper(period)>now()),'Deleted dispatcher cannot count as future operational coverage');
select tests.authenticate_as('admin');
select ok(not public.is_admin(),'Logical deletion immediately revokes operator privileges');
select * from finish();
rollback;
