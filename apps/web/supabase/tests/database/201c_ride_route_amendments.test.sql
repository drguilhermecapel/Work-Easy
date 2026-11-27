-- Three local identities, synthetic points and measurements. No network/PSP.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table amendment_test(k text primary key,id uuid not null);
grant select,insert on amendment_test to authenticated;
create function pg_temp.uid(k1 text) returns uuid language sql as $$select id from amendment_test where k=k1$$;
create function pg_temp.payload(p_x numeric,p_y numeric,p_label text) returns jsonb language sql as $$
 select jsonb_build_object('lat',p_x,'lng',p_y,'label',p_label)$$;
insert into amendment_test select 'booking',tests.make_booking('provider_a','client_a','t-reparo',
 tstzrange(now()+interval '3 hours',now()+interval '4 hours'),'accepted');
select tests.authenticate_as('provider_a');
insert into amendment_test select 'original',(public.ride_prepare_route(gen_random_uuid(),pg_temp.uid('booking'),'Saúde','Jabaquara',
 pg_temp.payload(-23.60,-46.64,'Embarque inicial'),pg_temp.payload(-23.61,-46.65,'Atendimento inicial'),'destination')->>'id')::uuid;
select tests.authenticate_as('admin');
select public.ride_claim_route(pg_temp.uid('original'));
select public.ride_verify_route(pg_temp.uid('original'),2000,12,'amendment/test1');
select tests.authenticate_as('provider_a');
insert into amendment_test select 'q',(public.ride_quote_with_access(gen_random_uuid(),pg_temp.uid('booking'),null,
 jsonb_build_array(jsonb_build_object('origin','Saúde','destination','Jabaquara','route_id',pg_temp.uid('original'),'payer','client','extras',jsonb_build_array('luggage'))),'folding_equipment')->>'id')::uuid;
select public.ride_consent(pg_temp.uid('q'),true);
select tests.authenticate_as('client_a');
insert into amendment_test select 'r',(public.ride_consent(pg_temp.uid('q'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
insert into amendment_test select 'leg',id from public.ride_legs where ride_id=pg_temp.uid('r');
select tests.authenticate_as('client_b');
select public.ride_apply_driver('compact');
select tests.authenticate_as('admin');
select public.ride_review_driver(tests.uid('client_b'),true,current_date+1);
select tests.clear_authentication();
insert into private.ride_driver_credentials(driver_id,vehicle_identifier,vehicle_category,driver_document_ref,vehicle_document_ref,insurance_ref,driver_until,vehicle_until,insurance_until,inspected_by)
 values(tests.uid('client_b'),'VEH-201C','compact','DRIVER-201C','VEH-201C','POLICY-201C',current_date+2,current_date+2,current_date+2,tests.uid('admin'));
insert into private.ride_assist_capabilities values(tests.uid('client_b'),'VEH-201C','folding_equipment','TRAIN-201C','DOC-201C',now()+interval '1 day');
select tests.authenticate_as('client_b');
select public.ride_set_online(true);
select public.ride_accept_offer(pg_temp.uid('leg'),gen_random_uuid());
select tests.authenticate_as('provider_a');
insert into amendment_test select 'r1',(public.ride_prepare_route(gen_random_uuid(),null,'Saúde','Jabaquara',
 pg_temp.payload(-23.60,-46.64,'Embarque inicial'),pg_temp.payload(-23.62,-46.66,'Atendimento alterado'),null)->>'id')::uuid;
select public.ride_route_waypoints(pg_temp.uid('r1'),jsonb_build_array(pg_temp.payload(-23.615,-46.65,'Buscar ferramentas')),null);
select tests.authenticate_as('admin');
select public.ride_claim_route(pg_temp.uid('r1'));
select public.ride_verify_route(pg_temp.uid('r1'),3500,14,'amendment/test2');
select tests.authenticate_as('provider_a');
insert into amendment_test values('key',gen_random_uuid());
insert into amendment_test select 'change',(public.ride_propose_amendment(pg_temp.uid('leg'),pg_temp.uid('r1'),pg_temp.uid('key'))->>'id')::uuid;
select is((public.ride_propose_amendment(pg_temp.uid('leg'),pg_temp.uid('r1'),pg_temp.uid('key'))->>'id')::uuid,pg_temp.uid('change'),'lost response returns the same revision');
select is(public.ride_decide_amendment(pg_temp.uid('change'),true)->>'status','pending','passenger alone cannot redirect or spend');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_amendment_state(pg_temp.uid('leg'))$$,'P0001','not_allowed','outsider cannot inspect amendment');
select throws_ok($$select public.ride_decide_amendment(pg_temp.uid('change'),true)$$,'P0001','not_allowed','outsider cannot consent');
select tests.authenticate_as('client_a');
select is(public.ride_amendment_state(pg_temp.uid('leg'))#>>'{changes,0,stops}',null,'payer of linked service does not see private stops');
select is(public.ride_amendment_state(pg_temp.uid('leg'))#>>'{changes,0,fare_cents}','1970','base + assessed distance/time + originally accepted baggage once');
select is(public.ride_decide_amendment(pg_temp.uid('change'),true)->>'status','pending','payer also approves, driver still required');
select tests.authenticate_as('client_b');
select is(public.ride_amendment_state(pg_temp.uid('leg'))#>>'{changes,0,stops,0}','Buscar ferramentas','assigned driver sees ordered stops before deciding');
select is(public.ride_decide_amendment(pg_temp.uid('change'),false)->>'status','declined','driver can refuse price and itinerary');
select tests.clear_authentication();
select is((select fare_cents from public.ride_legs where id=pg_temp.uid('leg')),1630,'rejected change preserves the entire accepted price');
select is((select route_case_id from public.ride_legs where id=pg_temp.uid('leg')),pg_temp.uid('original'),'rejected change leaves executable route intact');
select tests.authenticate_as('provider_a');
insert into amendment_test select 'change2',(public.ride_propose_amendment(pg_temp.uid('leg'),pg_temp.uid('r1'),gen_random_uuid())->>'id')::uuid;
select public.ride_decide_amendment(pg_temp.uid('change2'),true);
select is((select e->>'accepted' from jsonb_array_elements(public.ride_export_my_data()->'my_route_decisions') e where e->>'revision'=pg_temp.uid('change2')::text),'true','download includes only the user’s consent');
select tests.authenticate_as('client_b');
select public.ride_decide_amendment(pg_temp.uid('change2'),true);
select tests.clear_authentication();
update private.ride_assist_capabilities set until_at=now()+interval '1 minute' where driver_id=tests.uid('client_b');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_decide_amendment(pg_temp.uid('change2'),true)$$,'P0001','ride_assistance_requote',
 'Equipment training must still cover the entire revised trip before the last consent can apply it');
select tests.clear_authentication();
select is((select route_case_id from public.ride_legs where id=pg_temp.uid('leg')),pg_temp.uid('original'),'failed accessibility revalidation rolls back the route and price change');
update private.ride_assist_capabilities set until_at=now()+interval '1 day' where driver_id=tests.uid('client_b');
select tests.authenticate_as('client_a');
select is(public.ride_decide_amendment(pg_temp.uid('change2'),true)->>'status','applied','last consent promotes the same logical leg');
select is(public.ride_decide_amendment(pg_temp.uid('change2'),true)->>'status','applied','retry of final consent causes no duplicate commitment');
select tests.clear_authentication();
select is((select assistance from private.ride_access_preferences where leg=pg_temp.uid('leg')),'folding_equipment',
 'Required equipment travels with the remaining itinerary after repricing');
select is((select count(*)::int from public.ride_legs where ride_id=pg_temp.uid('r')),1,'only one assigned trip');
select is((select count(*)::int from private.ride_quotes where existing_ride_id=pg_temp.uid('r') and status='requested'),1,'exactly one new immutable price snapshot');
select is((select q.total_cents from private.ride_quotes q where id=pg_temp.uid('q')),1630,'original financial snapshot unchanged');
select is((select status::text from public.bookings where id=pg_temp.uid('booking')),'accepted','financial approval leaves service untouched');
select ok((select delete_by<=now()+interval '24 hours' from private.ride_route_points where route_id=pg_temp.uid('original')),'superseded precise itinerary expires within 24 hours of replacement');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_propose_amendment(pg_temp.uid('leg'),pg_temp.uid('original'),gen_random_uuid())$$,'P0001','route_unavailable','archived accepted route cannot fund a new booking or amendment');
select tests.authenticate_as('client_b');
select public.ride_transition(pg_temp.uid('leg'),'arriving',gen_random_uuid());
select tests.authenticate_as('provider_a');
select set_config('tests.pin201c',public.ride_issue_pin(pg_temp.uid('leg'))->>'pin',true);
select tests.authenticate_as('client_b');
select is(public.ride_verify_boarding(pg_temp.uid('leg'),current_setting('tests.pin201c'),gen_random_uuid())->>'ok','true','revised logical leg still requires the assigned boarding PIN');
select tests.clear_authentication();
select tests.authenticate_as('provider_a');
select is(public.ride_amendment_state(pg_temp.uid('leg'))->>'anchor',null,'missing onboard evidence disables route modification');
select tests.clear_authentication();
-- Established onboard track (synthetic privileged fixture). Consumer cannot set these.
update private.ride_events set at=now()-interval '1 minute' where leg_id=pg_temp.uid('leg') and to_status='boarded';
insert into private.ride_observations values
 (pg_temp.uid('leg'),now()-interval '60 seconds',-23.60,-46.64,5,true),
 (pg_temp.uid('leg'),now()-interval '3 seconds',-23.601,-46.641,5,true);
select tests.authenticate_as('provider_a');
insert into amendment_test select 'moving',(public.ride_prepare_route(gen_random_uuid(),null,'Saúde','Jabaquara',
 pg_temp.payload(-23.601,-46.641,'Ponto do veículo'),pg_temp.payload(-23.63,-46.67,'Novo destino'),null)->>'id')::uuid;
select tests.authenticate_as('admin');
select public.ride_claim_route(pg_temp.uid('moving'));
select public.ride_verify_route(pg_temp.uid('moving'),4000,15,'amendment/test3');
select tests.authenticate_as('provider_a');
insert into amendment_test select 'change3',(public.ride_propose_amendment(pg_temp.uid('leg'),pg_temp.uid('moving'),gen_random_uuid())->>'id')::uuid;
select public.ride_decide_amendment(pg_temp.uid('change3'),true);
select tests.authenticate_as('client_a');
select public.ride_decide_amendment(pg_temp.uid('change3'),true);
select tests.authenticate_as('client_b');
select is(public.ride_decide_amendment(pg_temp.uid('change3'),true)->>'status','applied','an onboard change can be authorized');
select public.ride_transition(pg_temp.uid('leg'),'completed',gen_random_uuid());
select tests.clear_authentication();
select ok((select consumed_meters>0 and consumed_minutes=1 from private.ride_amendments where id=pg_temp.uid('change3')),'fare preserves travelled distance and time before reroute');
select is(private.ride_receipt_endpoints(pg_temp.uid('leg'))#>>'{origin,label}','Embarque inicial','receipt preserves original boarding point after a mid-trip change');
select is(private.ride_receipt_endpoints(pg_temp.uid('leg'))#>>'{destination,label}','Novo destino','receipt shows last unanimously approved destination');
select is((select fare_cents from private.ride_financial_accounts where leg_id=pg_temp.uid('leg')),(select fare from private.ride_amendments where id=pg_temp.uid('change3')),'exactly the accepted revised price becomes receivable on completion');
select is((select count(*)::int from private.ride_financial_events where leg_id=pg_temp.uid('leg') and kind='earned'),1,'single earning recognition, no duplicate capture');
-- A request still searching for a driver can move to a newly authorized time
-- without issuing a second logical leg. A route measurement may expire first.
select tests.authenticate_as('provider_b');
insert into amendment_test select 'openroute',(public.ride_prepare_route(gen_random_uuid(),null,'Saúde','Jabaquara',
 pg_temp.payload(-23.60,-46.64,'Embarque livre'),pg_temp.payload(-23.61,-46.65,'Destino livre'),null)->>'id')::uuid;
insert into amendment_test select 'newroute',(public.ride_prepare_route(gen_random_uuid(),null,'Saúde','Jabaquara',
 pg_temp.payload(-23.60,-46.64,'Embarque livre'),pg_temp.payload(-23.62,-46.66,'Destino remarcado'),null)->>'id')::uuid;
select tests.authenticate_as('admin');
select public.ride_claim_route(pg_temp.uid('openroute'));
select public.ride_verify_route(pg_temp.uid('openroute'),2500,15,'reschedule/initial');
select public.ride_claim_route(pg_temp.uid('newroute'));
select public.ride_verify_route(pg_temp.uid('newroute'),2700,16,'reschedule/revision');
select tests.authenticate_as('provider_b');
insert into amendment_test select 'q4',(public.ride_quote(gen_random_uuid(),null,now()+interval '3 hours',jsonb_build_array(
 jsonb_build_object('origin','Saúde','destination','Jabaquara','route_id',pg_temp.uid('openroute'),'payer','passenger')))->>'id')::uuid;
insert into amendment_test select 'r4',(public.ride_consent(pg_temp.uid('q4'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
insert into amendment_test select 'leg4',id from public.ride_legs where ride_id=pg_temp.uid('r4');
select tests.authenticate_as('provider_b');
insert into amendment_test select 'expired',(public.ride_propose_amendment(pg_temp.uid('leg4'),pg_temp.uid('newroute'),gen_random_uuid(),
 now()+interval '1 hour')->>'id')::uuid;
select tests.clear_authentication();
update private.ride_amendments set expires_at=now()-interval '1 minute' where id=pg_temp.uid('expired');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_decide_amendment(pg_temp.uid('expired'),true)$$,'P0001','quote_unavailable','expired proposal cannot move the pickup');
insert into amendment_test select 'newtime',(public.ride_propose_amendment(pg_temp.uid('leg4'),pg_temp.uid('newroute'),gen_random_uuid(),
 now()+interval '1 hour')->>'id')::uuid;
select is(public.ride_decide_amendment(pg_temp.uid('newtime'),true)->>'status','applied','solo payer/passenger approves new schedule while no driver is assigned');
select tests.clear_authentication();
select ok((select pickup_at=now()+interval '1 hour' and status='requested' and driver_id is null from public.ride_legs where id=pg_temp.uid('leg4')),'new pickup keeps the original unassigned leg in dispatch');
select is((select count(*)::int from public.ride_legs where ride_id=pg_temp.uid('r4')),1,'rescheduling still has a single fare obligation');
select * from finish();
rollback;
