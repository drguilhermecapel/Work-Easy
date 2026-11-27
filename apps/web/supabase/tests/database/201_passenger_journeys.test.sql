begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
insert into private.ride_route_areas values('simulation','Saúde','((1,1),(2,1),(2,2),(1,2))','synthetic:201')
 on conflict(environment,area) do update set boundary=excluded.boundary;
insert into private.ride_places_osm values('node',-201,'Mercado de ensaio 201','Saúde',1.2,1.1,'shop'),
 ('way',-201,'Mercado de ensaio 201','Saúde',1.201,1.101,'shop'),('way',-202,'Mercado de ensaio fora','Saúde',0,0,'shop');
create temp table j(k text primary key,id uuid);
grant select,insert on j to authenticated;
select tests.authenticate_as('client_a');
select is(jsonb_array_length(public.ride_search_places('Mercado de ensaio','Saúde')),1,'area verified by geometry; road segments deduplicated');
select throws_ok($$select * from private.ride_places_osm$$,'42501',null,'dataset provisioning is not a client right');
insert into j values('fav',public.ride_store_place('favorite','{"label":"Mercado de ensaio","lng":1.1,"lat":1.2}'));
select is(jsonb_array_length(public.ride_my_places()),1,'favorite belongs to current account');
select tests.authenticate_as('client_b');
select public.ride_forget_place((select id from j where k='fav'));
select is(jsonb_array_length(public.ride_my_places()),0,'second user cannot list or remove a saved address');
select tests.authenticate_as('client_a');
select is(jsonb_array_length(public.ride_export_my_data()->'my_places'),1,'own favorites are included in the data export');
select is((select jsonb_array_length(mobility->'my_places') from public.my_ride_data_export),1,'account export entry point includes favored place');
insert into j select 'route',(public.ride_prepare_route(gen_random_uuid(),null,'Saúde','Saúde',
 '{"label":"Local A","lat":1.1,"lng":1.2}','{"label":"Local B","lat":1.4,"lng":1.3}',null)->>'id')::uuid;
select public.ride_route_waypoints((select id from j where k='route'),'[{"label":"Parada A","lat":1.3,"lng":1.3}]','Portão lateral');
select throws_ok($$select public.ride_measure_input((select id from j where k='route'),tests.uid('client_a'))$$,
 '42501',null,'only the authenticated edge can retrieve coordinates for routing');
select tests.clear_authentication();
select is(jsonb_array_length(public.ride_measure_input((select id from j where k='route'),tests.uid('client_a'))->'coordinates'),3,
 'routing includes the intermediate stop in order');
select throws_ok($$select public.ride_measure_commit((select id from j where k='route'),tests.uid('client_a'),1,2000,12,
 '{"type":"LineString","coordinates":[[1.2,1.1],[1.3,1.3],[1.3,1.4]]}')$$,'P0001','route_unavailable','stale response cannot overwrite waypoint changes');
select lives_ok($$select public.ride_measure_commit((select id from j where k='route'),tests.uid('client_a'),2,2000,12,
 '{"type":"LineString","coordinates":[[1.2,1.1],[1.3,1.3],[1.3,1.4]]}')$$,'server measurement binds the exact pair and version');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_route_detail((select id from j where k='route'))$$,'P0001','not_allowed','another person cannot see the route shape');
select tests.authenticate_as('client_a');
select is(public.ride_route_detail((select id from j where k='route'))->>'instruction','Portão lateral','passenger sees instruction with reviewed route');
select throws_ok($$select public.ride_route_waypoints((select id from j where k='route'),'[]','')$$,'P0001','route_measurement_locked','a priced route cannot be changed');
select tests.clear_authentication();
insert into private.ride_class_policies values('simulation','Saúde','tools','Equipamentos',330,3,true,false,now()+interval '1 day','fixture');
select tests.authenticate_as('client_b');
select public.ride_apply_driver('van');
select tests.authenticate_as('admin');
select public.ride_review_driver(tests.uid('client_b'),true,current_date+3);
select public.ride_validate_capacity(tests.uid('client_b'),3,true,false,now()+interval '1 day','test/201');
select tests.authenticate_as('client_b');
select public.ride_configure_shift('Saúde',now(),now()+interval '2 hours');
select public.ride_set_online(true);
select tests.authenticate_as('client_a');
select is((public.ride_class_options((select id from j where k='route'),null)->0->>'approach_minutes')::int,5,'ETA to pickup uses a declared available driver');
select is((public.ride_class_options((select id from j where k='route'),null)->0->>'duration_minutes')::int,12,'journey duration remains distinct from approach');
select is((public.ride_class_options((select id from j where k='route'),null)->0->>'fare_cents')::int,1560,'per-class preview includes class surcharge');
select public.ride_choose_class((select id from j where k='route'),'tools',null);
insert into j select 'quote',(public.ride_quote(gen_random_uuid(),null,null,jsonb_build_array(jsonb_build_object('route_id',(select id from j where k='route'),
 'origin','Saúde','destination','Saúde','payer','passenger')))->>'id')::uuid;
select tests.clear_authentication();
select is((select total_cents from private.ride_quotes where id=(select id from j where k='quote')),1560,'chosen class enters frozen total');
select ok(not (select private.ride_quote_view(q,tests.uid('client_b'))->'legs'->0 ? 'approach_minutes'
  from private.ride_quotes q where id=(select id from j where k='quote')),'approach to a private point is visible to the passenger only');
update private.ride_route_cases set client_id=tests.uid('provider_c') where id=(select id from j where k='route');
select tests.authenticate_as('provider_c');
select is((public.ride_class_options((select id from j where k='route')))->0->>'duration_minutes',null,
 'linked service client may compare availability without seeing time from a private address');
select throws_ok($$select public.ride_route_detail((select id from j where k='route'))$$,'P0001','not_allowed','service client cannot retrieve the passenger geometry');
select tests.authenticate_as('client_a');
insert into j select 'ride',(public.ride_consent((select id from j where k='quote'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
insert into j select 'leg',id from public.ride_legs where ride_id=(select id from j where k='ride');
update private.ride_vehicle_capacity set tools=false where driver_id=tests.uid('client_b');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_accept_offer((select id from j where k='leg'),gen_random_uuid())$$,'P0001','offer_unavailable',
 'a driver with changed capacity cannot accept an incompatible request');
select tests.clear_authentication();
update private.ride_vehicle_capacity set tools=true where driver_id=tests.uid('client_b');
savepoint before_assignment;
select tests.authenticate_as('client_b');
select lives_ok($$select public.ride_accept_offer((select id from j where k='leg'),gen_random_uuid())$$,'reviewed vehicle can accept');
select tests.clear_authentication();
update private.ride_vehicle_capacity set tools=false where driver_id=tests.uid('client_b');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_transition((select id from j where k='leg'),'arriving',gen_random_uuid())$$,
 'P0001','ride_capacity_changed','equipment lost after acceptance blocks departure');
rollback to savepoint before_assignment;
select tests.authenticate_as('client_a');
select ok(jsonb_array_length(public.ride_passenger_updates()->'items')>0,'passenger sees own request in progress');
select ok(public.ride_passenger_updates()->'items'->0 ? 'search_deadline','the passenger receives the search deadline before dispatch ends');
select throws_ok($$select public.ride_passenger_updates(true)$$,'P0001','ride_feature_disabled','external updates require separately released provider');
select tests.clear_authentication();
update public.ride_legs set pickup_at=now()-interval '20 minutes' where id=(select id from j where k='leg');
select private.ride_reservation_check();
select private.ride_reservation_check();
select is((select count(*) from private.ride_passenger_notices where leg_id=(select id from j where k='leg') and event='no_supply'),1::bigint,'no supply reported only once');
select is((select status from public.ride_legs where id=(select id from j where k='leg')),'cancelled','unassigned request expires with a known final state');
select tests.authenticate_as('client_a');
select public.ride_forget_place((select id from j where k='fav'));
select is(jsonb_array_length(public.ride_my_places()),0,'explicit deletion removes favorite');
select * from finish();
rollback;
