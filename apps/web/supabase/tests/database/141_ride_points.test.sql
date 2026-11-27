-- Use fictitious coordinates and no routing service. The server must bind the
-- reviewer's distance to these exact endpoints through consent and dispatch.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true, quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temporary table route_test(k text primary key,v uuid not null);
grant select,insert on route_test to authenticated;
insert into route_test select 'booking',tests.make_booking('provider_a','client_a','t-reparo',tstzrange(now()+interval '3 hours',now()+interval '4 hours'),'accepted');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_prepare_route(gen_random_uuid(),(select v from route_test where k='booking'),'Saúde','Jabaquara',
 '{"label":"Ponto fictício A","lat":1,"lng":1}','{"label":"Ponto fictício B","lat":2,"lng":2}','destination')$$,
 'P0001','not_allowed','service client cannot supply provider origin');
select throws_ok($$select public.ride_prepare_route(gen_random_uuid(),null,'Saúde','Jabaquara',
 '{"label":"Ponto A","lat":95,"lng":1}','{"label":"Ponto B","lat":2,"lng":2}',null)$$,'P0001','invalid_point','invalid coordinate rejected');
insert into route_test select 'case',(public.ride_prepare_route(gen_random_uuid(),(select v from route_test where k='booking'),'Saúde','Jabaquara',null,
 '{"label":"Ponto fictício B","lat":2,"lng":2}','destination')->>'id')::uuid;
select is((public.ride_route_cases()->0)->>'status','draft','service address alone is an incomplete case');
select tests.authenticate_as('provider_a');
select is(public.ride_complete_route((select v from route_test where k='case'),
 '{"label":"Ponto fictício A","lat":1,"lng":1}',null)->>'status','awaiting_review','professional privately adds departure');
select throws_ok($$select public.ride_verify_route((select v from route_test where k='case'),2000,12,'fake-map-1')$$,
 'P0001','not_allowed','passenger cannot authorize their own mileage');
select throws_ok($$select public.ride_quote(gen_random_uuid(),(select v from route_test where k='booking'),null,
 jsonb_build_array(jsonb_build_object('origin','Saúde','destination','Jabaquara','payer','client','route_id',(select v from route_test where k='case'))))$$,
 'P0001','route_unavailable','unverified measurement cannot price the ride');
select tests.authenticate_as('admin');
select is(public.ride_route_cases()->0->'origin','null'::jsonb,'admin queue omits precise points until case is assigned');
select is(public.ride_claim_route((select v from route_test where k='case'))->'origin'->>'label','Ponto fictício A','assigned reviewer can route the exact pair');
select is(public.ride_verify_route((select v from route_test where k='case'),2000,12,'synthetic/route-1')->>'status','verified','authenticated source and validity freeze measurement');
select throws_ok($$select public.ride_verify_route((select v from route_test where k='case'),1000,12,'synthetic/route-1')$$,
 'P0001','route_measurement_locked','verified mileage is immutable');
select tests.authenticate_as('client_a');
select is(public.ride_route_cases()->0->'origin','null'::jsonb,'service client sees only its service endpoint even before booking transport');
insert into route_test select 'quote',(public.ride_quote(gen_random_uuid(),(select v from route_test where k='booking'),null,
 jsonb_build_array(jsonb_build_object('origin','Saúde','destination','Jabaquara','payer','client','route_id',(select v from route_test where k='case'))))->>'id')::uuid;
select is((public.ride_dashboard()->'quotes'->0->>'total_cents')::int,1230,'2km and 12min of this exact pair, not the default 4.4km route, determine the price');
select lives_ok($$select public.ride_consent((select v from route_test where k='quote'),true)$$,'payer authorizes the quote');
select tests.authenticate_as('provider_a');
select is(public.ride_consent((select v from route_test where k='quote'),true)->>'status','requested','passenger authorizes the same quote');
select tests.clear_authentication();
insert into route_test select 'leg',id from public.ride_legs where route_case_id=(select v from route_test where k='case');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_leg_points((select v from route_test where k='leg'))$$,'P0001','not_allowed','outsider cannot read points');
select lives_ok($$select public.ride_apply_driver('compact')$$,'unrelated user applies to drive');
select tests.authenticate_as('admin');
select lives_ok($$select public.ride_review_driver(tests.uid('client_b'),true,current_date+1)$$,'driver reviewed in simulation');
select tests.authenticate_as('client_b');
select lives_ok($$select public.ride_set_online(true)$$,'driver sees candidate offers');
select throws_ok($$select public.ride_leg_points((select v from route_test where k='leg'))$$,'P0001','not_allowed','offered driver cannot read precise pickup');
select lives_ok($$select public.ride_accept_offer((select v from route_test where k='leg'),gen_random_uuid())$$,'driver accepts leg');
select is(public.ride_leg_points((select v from route_test where k='leg'))->'origin'->>'label','Ponto fictício A','assigned driver sees immutable pickup point');
select tests.authenticate_as('client_a');
select is(public.ride_leg_points((select v from route_test where k='leg'))->'destination'->>'label','Ponto fictício B','client may read its own service endpoint');
select is(public.ride_leg_points((select v from route_test where k='leg'))->'origin','null'::jsonb,'client cannot read professional origin');
select tests.clear_authentication();
update private.ride_route_points set delete_by=now()-interval '1 second';
select is(private.purge_ride_points(),1,'expired operational coordinates are purged');
select is((select count(*)::int from private.ride_quotes where id=(select v from route_test where k='quote')),1,'financial authorization survives coordinate removal');
select tests.authenticate_as('provider_a');
select is(public.ride_leg_points((select v from route_test where k='leg'))->'origin','null'::jsonb,'expired point is absent even for the passenger');
insert into route_test select 'reversed',(public.ride_prepare_route(gen_random_uuid(),(select v from route_test where k='booking'),
 'Jabaquara','Saúde','{"label":"Partida fictícia","lat":1,"lng":1}',null,'destination')->>'id')::uuid;
select tests.authenticate_as('client_a');
select is((select c->>'can_complete' from jsonb_array_elements(public.ride_route_cases()) c where c->>'id'=(select v::text from route_test where k='reversed')),
 'true','service client can complete their endpoint in a case initiated by the provider');
select throws_ok($$select public.ride_complete_route((select v from route_test where k='reversed'),
 '{"label":"Troca indevida","lat":3,"lng":3}','{"label":"Local do serviço","lat":2,"lng":2}')$$,
 'P0001','not_allowed','client cannot replace the private origin while completing destination');
select is(public.ride_complete_route((select v from route_test where k='reversed'),null,
 '{"label":"Local do serviço","lat":2,"lng":2}')->>'status','awaiting_review','service client independently completes the service destination');
select * from finish();
rollback;
