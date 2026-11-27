begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true where environment='simulation';
create function pg_temp.leg() returns uuid language sql immutable as $$select '72588888-0000-4000-8000-000000000001'::uuid$$;
grant execute on function pg_temp.leg() to authenticated,service_role;
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

update public.ride_legs set status='completed' where id=pg_temp.leg();
insert into private.ride_sandbox_customers values(tests.uid('client_a'),'cus_sandbox');
select tests.authenticate_as('client_a');
select is(public.ride_sandbox_payment_view(pg_temp.leg()),null::jsonb,'Gated until this sandbox is provisioned');
select ok(not has_function_privilege('authenticated','public.ride_sandbox_prepare_charge(uuid,uuid)','EXECUTE'),'Clients cannot claim backend intents');
select tests.clear_authentication();
update private.ride_sandbox_psp set enabled=true;
select tests.authenticate_service();
select throws_ok($$select public.ride_sandbox_prepare_charge(pg_temp.leg(),tests.uid('client_b'))$$,'P0001','not_allowed','Another payer cannot claim the leg');
select is((public.ride_sandbox_prepare_charge(pg_temp.leg(),tests.uid('client_a'))->>'create')::boolean,true,'First request can look for a prior external charge');
select is(public.ride_sandbox_claim_send(pg_temp.leg()),true,'First process acquires the send lease after a successful lookup');
select is(public.ride_sandbox_claim_send(pg_temp.leg()),false,'A concurrent process cannot acquire the send lease');
select is((public.ride_sandbox_prepare_charge(pg_temp.leg(),tests.uid('client_a'))->>'create')::boolean,false,'Lost response cannot issue another POST');
select throws_ok($$select public.ride_sandbox_observe_charge(pg_temp.leg(),'pay_test','cus_other',3309,'paid',0,null)$$,'P0001','payment_mismatch','Customer mismatch rejected before capture');
select throws_ok($$select public.ride_sandbox_observe_charge(pg_temp.leg(),'pay_test','cus_sandbox',3308,'paid',0,null)$$,'P0001','payment_mismatch','Wrong captured value rejected');
select lives_ok($$select public.ride_sandbox_observe_charge(pg_temp.leg(),'pay_test','cus_sandbox',3309,'paid',0,null)$$,'Canonical webhook confirms the capture');
select lives_ok($$select public.ride_sandbox_observe_charge(pg_temp.leg(),'pay_test','cus_sandbox',3309,'paid',0,null)$$,'Replayed capture is safe');
select is(public.ride_sandbox_observe_charge(pg_temp.leg(),'pay_test','cus_sandbox',3309,'pending',0,null)->>'state','paid','Delayed observation cannot reopen a paid invoice');
select is(public.ride_sandbox_observe_charge(pg_temp.leg(),'pay_test','cus_sandbox',3309,'paid',3309,null)->>'state','refunded','Full confirmed refund reverses the original captured amount');
select is(public.ride_sandbox_observe_charge(pg_temp.leg(),'pay_test','cus_sandbox',3309,'paid',3309,null)->>'state','refunded','Replayed reversal has no new balance impact');
select tests.clear_authentication();
select is((select count(*) from private.ride_financial_events where leg_id=pg_temp.leg() and kind='capture'),1::bigint,'Only one capture reached the ledger');
select is((select count(*) from private.ride_financial_events where leg_id=pg_temp.leg() and kind='refund'),1::bigint,'Only one refund reached the ledger');
select tests.authenticate_as('client_b');
select is(public.ride_sandbox_payment_view(pg_temp.leg()),null::jsonb,'Another user cannot read invoice or state');
select tests.authenticate_as('client_a');
select is(public.ride_sandbox_payment_view(pg_temp.leg())->>'state','refunded','Only the payer gets the view');
select * from finish();
rollback;
