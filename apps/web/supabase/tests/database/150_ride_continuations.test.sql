begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table journey(k text primary key,id uuid);
grant select,insert on journey to authenticated;
insert into journey select 'first',tests.make_booking('provider_a','client_a','t-reparo',tstzrange(now()+interval '1 hour',now()+interval '2 hours'),'accepted');
insert into journey select 'second',tests.make_booking('provider_a','client_b','t-reparo',tstzrange(now()+interval '3 hours',now()+interval '4 hours'),'accepted');
select tests.authenticate_as('provider_a');
insert into journey select 'quote',(public.ride_quote(gen_random_uuid(),(select id from journey where k='first'),now()+interval '2 hours',
 jsonb_build_array(jsonb_build_object('origin','Saúde','destination','Vila Mariana','payer','client','next_booking_id',(select id from journey where k='second'))))->>'id')::uuid;
select is(public.ride_consent((select id from journey where k='quote'),true)->>'status','awaiting_consent','provider cannot bill an uninformed payer for the next journey');
select tests.authenticate_as('client_b');
select is(jsonb_array_length(public.ride_dashboard()->'quotes'),0,'the destination customer receives no charge or view of the prior customer');
select throws_ok($$select public.ride_consent((select id from journey where k='quote'),true)$$,'P0001','not_allowed','destination is not automatic payer');
select tests.authenticate_as('client_a');
select ok(not ((public.ride_dashboard()->'quotes'->0->'legs'->0) ? 'next_booking_id'),'first customer cannot learn the other appointment identifier');
select is(public.ride_consent((select id from journey where k='quote'),true)->>'status','requested','chosen originating payer approves the leg');
select tests.clear_authentication();
select is((select count(*)::int from public.ride_legs where next_booking_id=(select id from journey where k='second')),1,'only one financial leg references the second service');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_quote(gen_random_uuid(),(select id from journey where k='second'),now()+interval '4 hours',
 jsonb_build_array(jsonb_build_object('origin','Saúde','destination','Jabaquara','payer','next_client','next_booking_id',(select id from journey where k='first'))))$$,
 'P0001','invalid_continuation','only confirmed later appointments with compatible times can be linked');

-- New booking to exercise an agreed return. Once outbound was travelled,
-- ending the service must leave a practical means of recovering cancelled return.
select tests.clear_authentication();
insert into journey select 'return_booking',tests.make_booking('provider_a','client_a','t-reparo',
 tstzrange(now()+interval '5 hours',now()+interval '6 hours'),'accepted');
select tests.authenticate_as('client_a');
insert into journey select 'return_quote',(public.ride_quote(gen_random_uuid(),(select id from journey where k='return_booking'),null,
 jsonb_build_array(jsonb_build_object('origin','Saúde','destination','Jabaquara','payer','client'),
 jsonb_build_object('origin','Jabaquara','destination','Saúde','payer','client','pickup_at',now()+interval '6 hours')))->>'id')::uuid;
select lives_ok($$select public.ride_consent((select id from journey where k='return_quote'),true)$$,'payer confirms outbound and eventual return');
select tests.authenticate_as('provider_a');
insert into journey select 'return_ride',(public.ride_consent((select id from journey where k='return_quote'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
insert into journey select 'internal_leg'||seq,id from public.ride_legs where ride_id=(select id from journey where k='return_ride');
select tests.authenticate_as('provider_b');
select lives_ok($$select public.ride_apply_driver('sedan')$$,'test driver application');
select tests.authenticate_as('admin');
select lives_ok($$select public.ride_review_driver(tests.uid('provider_b'),true,current_date+1)$$,'simulation driver approved');
select tests.authenticate_as('provider_b');
select lives_ok($$select public.ride_set_online(true)$$,'simulation driver available');
select lives_ok($$select public.ride_accept_offer((select id from journey where k='internal_leg1'),gen_random_uuid())$$,'outbound assigned');
select lives_ok($$select public.ride_transition((select id from journey where k='internal_leg1'),'arriving',gen_random_uuid())$$,'driver en route');
select tests.authenticate_as('provider_a');
select set_config('tests.pin150',public.ride_issue_pin((select id from journey where k='internal_leg1'))->>'pin',true);
select tests.authenticate_as('provider_b');
select is(public.ride_verify_boarding((select id from journey where k='internal_leg1'),current_setting('tests.pin150'),gen_random_uuid())->>'ok','true','professional boarded the outbound leg with their PIN');
select lives_ok($$select public.ride_transition((select id from journey where k='internal_leg1'),'completed',gen_random_uuid())$$,'outbound settled as a physical trip');
select tests.authenticate_as('provider_a');
select lives_ok($$select public.transition_booking((select id from journey where k='return_booking'),'in_progress',null)$$,'start the service separately');
select lives_ok($$select public.transition_booking((select id from journey where k='return_booking'),'completed',null)$$,'close the service separately');
select lives_ok($$select public.ride_transition((select id from journey where k='internal_leg2'),'cancelled',gen_random_uuid())$$,'prior return cancelled with confirmation');
select throws_ok($$select public.ride_quote(gen_random_uuid(),(select id from journey where k='return_booking'),null,
 '[{"origin":"Saúde","destination":"Jabaquara","payer":"provider"}]')$$,'P0001','booking_not_eligible','closed service cannot authorize a fresh outbound');
select throws_ok($$select public.ride_quote(gen_random_uuid(),(select id from journey where k='return_booking'),now()+interval '7 hours',
 jsonb_build_array(jsonb_build_object('origin','Saúde','destination','Jabaquara','payer','client','service_endpoint','destination','replaces',(select id from journey where k='internal_leg2'))))$$,
 'P0001','replacement_unavailable','a return revision cannot be used as a new outbound in disguise');
select lives_ok($$select public.ride_prepare_route(gen_random_uuid(),(select id from journey where k='return_booking'),'Jabaquara','Saúde',
 '{"label":"Ponto fictício A","lat":1,"lng":1}','{"label":"Ponto fictício B","lat":2,"lng":2}','origin')$$,
 'the return can obtain a fresh exact measurement after service closure');
insert into journey select 'rescue',(public.ride_quote(gen_random_uuid(),(select id from journey where k='return_booking'),now()+interval '7 hours',
 jsonb_build_array(jsonb_build_object('origin','Jabaquara','destination','Saúde','payer','client','replaces',(select id from journey where k='internal_leg2'))))->>'id')::uuid;
select is(public.ride_consent((select id from journey where k='rescue'),true)->>'status','awaiting_consent','return revision obtains fresh passenger and payer decisions');
select tests.authenticate_as('client_a');
select is((public.ride_consent((select id from journey where k='rescue'),true)->>'ride_id')::uuid,(select id from journey where k='return_ride'),'return recovered under original itinerary with frozen historical pricing');
select tests.clear_authentication();
select is((select count(*)::int from public.ride_legs where ride_id=(select id from journey where k='return_ride') and seq=1),1,'no repeat of completed outbound');
select is((select status::text from public.bookings where id=(select id from journey where k='return_booking')),'completed','recovering transport leaves the completed service alone');
select is((select service_endpoint from public.ride_legs where replaces_id=(select id from journey where k='internal_leg2')),'origin','requote retains the service side of the return');
select tests.authenticate_as('provider_b');
select lives_ok($$select public.ride_accept_offer((select (o->>'leg_id')::uuid from jsonb_array_elements(public.ride_dashboard()->'offers') o
 where o->>'pickup_at'=(to_jsonb(now()+interval '7 hours')#>>'{}')),gen_random_uuid())$$,'driver can reserve the recovered return even after service closure');
select * from finish();
rollback;
