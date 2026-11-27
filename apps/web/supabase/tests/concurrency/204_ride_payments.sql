-- Loaded only in a fresh disposable clone by scripts/test-ride-payment-races.mjs.
insert into private.ride_deployment(environment) values('simulation');
insert into private.ride_network(environment) values('simulation');
insert into private.ride_tariffs(environment,valid_from,base_cents,km_cents,minute_cents,minimum_cents,commission_bps) values('simulation','2020-01-01Z',400,200,20,1000,1000);
insert into private.ride_sandbox_psp default values;
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity)
 select 'simulation','Saúde','Jabaquara',m,'race fixture',tstzrange(now()-interval '1 day',now()+interval '1 day') from unnest(array['pix','benefit','withdrawal'])m;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by) values(tests.uid('provider_c'),'simulation','sedan','approved',current_date+3,tests.uid('admin'));
do $$ declare t uuid; q uuid; r uuid; l uuid; i int;
begin
 select id into strict t from private.ride_tariffs where environment='simulation' limit 1;
 for i in 1..3 loop
   insert into private.ride_quotes(environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
     values('simulation',tests.uid('client_a'),gen_random_uuid(),tests.uid('client_a'),'[]','[]',array[tests.uid('client_a')],t,now()+interval '10 minutes','requested',1000) returning id into q;
   insert into public.rides(quote_id,environment,passenger_id) values(q,'simulation',tests.uid('client_a')) returning id into r;
   l:=md5('204-race-leg-'||i)::uuid;
   insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,driver_cents,
     payer_id,driver_id,tariff_id,status,environment) values(l,r,1,'Saúde','Jabaquara',now()+make_interval(hours=>i),18,
     tstzrange(now()+make_interval(hours=>i),now()+make_interval(hours=>i,mins=>18)),1000,100,0,900,tests.uid('client_a'),tests.uid('provider_c'),t,'boarded','simulation');
   update public.ride_legs set status='completed' where id=l;
 end loop;
end $$;
select tests.authenticate_as('client_a');
select public.ride_open_payment_order(md5('204-race-leg-'||i)::uuid,'pix') from generate_series(1,3)i;
select tests.clear_authentication();
insert into private.ride_benefit_campaigns(id,environment,funding_ref,budget_cents,validity)
 values(md5('204-campaign')::uuid,'simulation','fixture',1000,tstzrange(now()-interval '1 day',now()+interval '1 day'));
insert into private.ride_benefits(id,environment,owner_id,funding_ref,source,awarded_cents,available_cents,valid_until,campaign_id)
 select md5('204-benefit-'||i)::uuid,'simulation',tests.uid('client_a'),'fixture','promotion',800,800,now()+interval '1 hour',md5('204-campaign')::uuid from generate_series(1,2)i;
update private.ride_sandbox_psp set enabled=true;
insert into private.ride_sandbox_customers values(tests.uid('client_a'),'cus_fixture204');
insert into private.ride_order_test_wallets values(tests.uid('provider_c'),md5('wallet204')::uuid,md5('platform204')::uuid,'TEST',now()+interval '1 day');
insert into private.ride_withdrawal_terms(driver_id,environment,wallet,bank_ref,evidence_ref,fee_cents,limit_cents,valid_until,pix_key_type,bank_pix_key,settlement_time)
 values(tests.uid('provider_c'),'simulation',md5('wallet204')::uuid,'fixture','test',0,1000,now()+interval '1 day','EVP','fixture-bank','No mesmo dia');
