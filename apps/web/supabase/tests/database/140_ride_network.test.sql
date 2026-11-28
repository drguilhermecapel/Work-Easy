-- This test touches only local fixture accounts and synthetic, public meeting areas.
begin;
select no_plan();
select tests.setup_fixture();
create temporary table ride_case(k text primary key,v uuid not null);
grant select,insert,update on ride_case to authenticated;

select tests.authenticate_as('client_a');
select is(public.ride_dashboard()->>'enabled','false','module ships disabled');
select throws_ok($$select public.ride_quote(gen_random_uuid(),null,null,'[]')$$,'P0001','ride_feature_disabled','quote is blocked by server flags');
select throws_ok($$update private.ride_network set dispatch_enabled=true$$,'42501',null,'API cannot grant itself dispatch');
select throws_ok($$select * from public.ride_legs$$,'42501',null,'raw leg rows are not visible through the API');
select tests.authenticate_anon();
select throws_ok($$select public.ride_dashboard()$$,'42501',null,'anonymous caller cannot enumerate trips');
select tests.clear_authentication();

-- The live project starts with zero usable routes, tariffs or driver authorizations.
savepoint live_case;
update private.ride_deployment set environment='live';
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='live';
select tests.authenticate_as('client_a');
select is(jsonb_array_length(public.ride_dashboard()->'areas'),0,'simulation areas do not appear in live');
select throws_ok($$select public.ride_quote(gen_random_uuid(),null,null,'[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]')$$,
                 'P0001','no_active_tariff','permissive global flags cannot use fixture tariffs');
select lives_ok($$select public.ride_apply_driver('sedan')$$,'live application is only a pending record');
select tests.authenticate_as('admin');
select throws_ok($$select public.ride_review_driver(tests.uid('client_a'),true,current_date+30)$$,
                 'P0001','missing_driver_evidence','approved live driver requires verified driver, vehicle and insurance');
rollback to live_case;

update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
select tests.authenticate_as('client_b');
select is(public.ride_apply_driver('sedan')->>'status','pending','applicant starts pending');
select throws_ok($$select public.ride_set_online(true)$$,'P0001','driver_ineligible','pending driver cannot go online');
select throws_ok($$select public.ride_review_driver(tests.uid('client_b'),true,current_date+1)$$,'P0001','not_allowed','cannot approve oneself');
select tests.authenticate_as('provider_b');
select lives_ok($$select public.ride_apply_driver('van')$$,'a provider can also apply as a driver');
select tests.authenticate_as('admin');
select is(public.ride_review_driver(tests.uid('provider_b'),true,current_date+3)->>'status','approved','admin approves fixture driver');
select is(public.ride_review_driver(tests.uid('client_b'),true,current_date+3)->>'status','approved','approve second driver');
select tests.authenticate_as('provider_b');
select lives_ok($$select public.ride_set_online(true)$$,'verified driver goes online');
select tests.authenticate_as('client_b');
select lives_ok($$select public.ride_set_online(true)$$,'second driver online');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote(gen_random_uuid(),null,null,'[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger","fare_cents":1}]')$$,
                 'P0001','invalid_leg','client cannot dictate fare');
select throws_ok($$select public.ride_quote(gen_random_uuid(),null,null,'[{"origin":"endereço privado","destination":"Jabaquara","payer":"passenger"}]')$$,
                 'P0001','route_unavailable','only server-configured routes can be quoted');
insert into ride_case values ('key',gen_random_uuid());
insert into ride_case select 'quote',(public.ride_quote((select v from ride_case where k='key'),null,null,
  '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"},{"origin":"Jabaquara","destination":"Saúde","payer":"passenger"}]')->>'id')::uuid;
select is((public.ride_quote((select v from ride_case where k='key'),null,null,
  '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"},{"origin":"Jabaquara","destination":"Saúde","payer":"passenger"}]')->>'id')::uuid,
  (select v from ride_case where k='quote'),'retry returns original quote');
select throws_ok($$select public.ride_quote((select v from ride_case where k='key'),null,null,
  '[{"origin":"Jabaquara","destination":"Saúde","payer":"passenger"}]')$$,'P0001','idempotency_conflict','altered quote cannot reuse key');
insert into ride_case select 'ride',(public.ride_consent((select v from ride_case where k='quote'),true)->>'ride_id')::uuid;
select is((public.ride_consent((select v from ride_case where k='quote'),true)->>'ride_id')::uuid,
          (select v from ride_case where k='ride'),'retrying final consent returns the same ride');
select tests.clear_authentication();
insert into ride_case select 'leg'||seq,id from public.ride_legs where ride_id=(select v from ride_case where k='ride');
select is((select fare_cents from public.ride_legs where id=(select v from ride_case where k='leg1')),1872,'server tariff: 450 + 4.4 km × 180 + 18 min × 35');
select is((select fee_cents from public.ride_legs where id=(select v from ride_case where k='leg1')),187,'simulated 10% truncated once in integer cents');
select is((select role::text from public.profiles where id=tests.uid('provider_b')),'provider','driver onboarding preserves service provider role');
select throws_ok($$update private.ride_deployment set environment='live'$$,'P0001','ride_environment_in_use','cannot flip a project containing simulation accounts into live');
-- Nominal driving ends at +18m; the five-minute approach delays the actual
-- finish until +23m, so even the last five minutes conflict with care work.
savepoint approach_conflict;
select tests.make_booking('provider_b','client_b','t-medico',tstzrange(now()+interval '18 minutes',now()+interval '45 minutes'),'accepted');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_accept_offer((select v from ride_case where k='leg1'),gen_random_uuid())$$,
  'P0001','offer_unavailable','approach-delayed arrival would overlap an upcoming service');
select ok(not exists(select from jsonb_array_elements(public.ride_dashboard()->'offers') o
  where o->>'leg_id'=(select v::text from ride_case where k='leg1')),'infeasible immediate offer hidden from driver');
rollback to approach_conflict;
select tests.authenticate_as('client_b');
insert into ride_case values('decline',gen_random_uuid());
select lives_ok($$select public.ride_decline_offer((select v from ride_case where k='leg1'),(select v from ride_case where k='decline'))$$,'driver can decline');
select throws_ok($$select public.ride_accept_offer((select v from ride_case where k='leg1'),gen_random_uuid())$$,
  'P0001','offer_unavailable','decline is personal and persists');
select tests.authenticate_as('provider_b');
insert into ride_case values('accept',gen_random_uuid());
select is(public.ride_accept_offer((select v from ride_case where k='leg1'),(select v from ride_case where k='accept'))->>'status','accepted','second driver accepts the same offer');
select is(public.ride_accept_offer((select v from ride_case where k='leg1'),(select v from ride_case where k='accept'))->>'replayed','true','delivery replay confirms the same assignment');
select throws_ok($$select public.ride_transition((select v from ride_case where k='leg1'),'boarded',(select v from ride_case where k='accept'))$$,
  'P0001','idempotency_conflict','an acceptance key cannot authorize another operation');
select tests.clear_authentication();
select throws_ok($$select tests.make_booking('provider_b','client_b','t-medico',
  tstzrange(now()+interval '18 minutes',now()+interval '45 minutes'),'accepted')$$,
  'P0001','slot_unavailable','a later service cannot overlap the assigned driver adjusted arrival');
select tests.authenticate_as('client_a');
insert into ride_case select 'overlap_quote',(public.ride_quote(gen_random_uuid(),null,now()+interval '5 minutes',
  '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]')->>'id')::uuid;
select lives_ok($$select public.ride_consent((select v from ride_case where k='overlap_quote'),true)$$,'scheduled request accepted by payer');
select tests.clear_authentication();
insert into ride_case select 'overlap_leg',l.id from public.ride_legs l join public.rides r on r.id=l.ride_id
  where r.quote_id=(select v from ride_case where k='overlap_quote');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_accept_offer((select v from ride_case where k='overlap_leg'),gen_random_uuid())$$,
  'P0001','offer_unavailable','scheduled and immediate assignments share the same driver calendar');
select is(public.ride_transition((select v from ride_case where k='leg1'),'arriving',gen_random_uuid())->>'status','arriving','driver is on the way');
select tests.authenticate_as('client_a');
select set_config('tests.pin140',public.ride_issue_pin((select v from ride_case where k='leg1'))->>'pin',true);
select tests.authenticate_as('provider_b');
select is(public.ride_verify_boarding((select v from ride_case where k='leg1'),current_setting('tests.pin140'),gen_random_uuid())->>'status','boarded','driver confirms boarding with the passenger PIN');
select tests.authenticate_as('client_a');
select is(public.ride_transition((select v from ride_case where k='leg1'),'cancelled',gen_random_uuid())->>'status','unknown','cancellation after boarding opens reconciliation');
select throws_ok($$select public.ride_resolve((select v from ride_case where k='leg1'),'cancelled',gen_random_uuid())$$,'P0001','not_allowed','rider cannot resolve an uncertain cost');
select tests.authenticate_as('admin');
select lives_ok($$select public.ride_resolve((select v from ride_case where k='leg1'),'completed',gen_random_uuid())$$,'admin records confirmed result');
select tests.clear_authentication();
insert into ride_case select 'booking',tests.make_booking('provider_a','client_a','t-reparo',
  tstzrange(now()+interval '3 hours',now()+interval '4 hours'),'accepted');
select tests.authenticate_as('client_a');
insert into ride_case select 'linked_quote',(public.ride_quote(gen_random_uuid(),(select v from ride_case where k='booking'),null,
  '[{"origin":"Saúde","destination":"Jabaquara","payer":"client"}]')->>'id')::uuid;
select is(public.ride_consent((select v from ride_case where k='linked_quote'),true)->>'status','awaiting_consent','client payment approval alone never dispatches the provider');
select is((select q->'legs'->0->>'origin' from jsonb_array_elements(public.ride_dashboard()->'quotes') q where q->>'id'=(select v::text from ride_case where k='linked_quote')),
 'Reservado ao passageiro','linked client receives no private departure point');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_consent((select v from ride_case where k='linked_quote'),true)$$,'P0001','not_allowed','third party cannot authorize a linked quote');
select tests.authenticate_as('provider_a');
select is(public.ride_consent((select v from ride_case where k='linked_quote'),true)->>'status','requested','linked provider consent promotes the ride once');
select throws_ok($$select public.ride_quote(gen_random_uuid(),(select v from ride_case where k='booking'),null,
  '[{"origin":"Saúde","destination":"Jabaquara","payer":"provider"}]')$$,'P0001','ride_already_requested','two logical itineraries cannot dispatch for the same booking');
select tests.clear_authentication();
select is((select status::text from public.bookings where id=(select v from ride_case where k='booking')),'accepted','transport events leave service state untouched');
-- A confirmed cancellation can be replaced in the same logical position. Its
-- earlier quote, charge and authorization remain identifiable.
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote(gen_random_uuid(),null,null,
   jsonb_build_array(jsonb_build_object('origin','Saúde','destination','Jabaquara','payer','passenger','replaces',(select v from ride_case where k='leg1'))))$$,
   'P0001','replacement_unavailable','cannot rebook an already completed leg as a cancelled one');
select is(public.ride_transition((select v from ride_case where k='leg2'),'cancelled',gen_random_uuid())->>'status','cancelled','unassigned return cancelled before recotação');
select throws_ok($$select public.ride_quote(gen_random_uuid(),null,null,
 '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger","extras":["unknown"]}]')$$,'P0001','invalid_extras','unsupported expense rejected on server');
insert into ride_case select 'replacement',(public.ride_quote(gen_random_uuid(),null,now()+interval '1 hour',
 jsonb_build_array(jsonb_build_object('origin','Jabaquara','destination','Vila Mariana','payer','passenger','replaces',(select v from ride_case where k='leg2'),
   'extras',jsonb_build_array('luggage'))))->>'id')::uuid;
select is((public.ride_consent((select v from ride_case where k='replacement'),true)->>'ride_id')::uuid,
          (select v from ride_case where k='ride'),'replacement promotes into the same itinerary');
select throws_ok($$select public.ride_quote(gen_random_uuid(),null,null,
   jsonb_build_array(jsonb_build_object('origin','Saúde','destination','Jabaquara','payer','passenger','replaces',(select v from ride_case where k='leg2'))))$$,
   'P0001','replacement_unavailable','a second UUID cannot bypass a prior replacement');
select tests.clear_authentication();
select is((select seq from public.ride_legs where replaces_id=(select v from ride_case where k='leg2')),2,'secondary attempt keeps original return position');
select is((select extras_cents from public.ride_legs where replaces_id=(select v from ride_case where k='leg2')),400,'server-priced baggage only after new consent');
select is((select fee_cents from public.ride_legs where replaces_id=(select v from ride_case where k='leg2')),294,'10% excludes pass-through baggage');
select is((select status from public.ride_legs where id=(select v from ride_case where k='leg2')),'cancelled','original leg retained for reconciliation');
update public.ride_drivers set valid_until=private.sp_date(now())-1 where id=tests.uid('provider_b');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_set_online(true)$$,'P0001','driver_ineligible','expired review blocks online status');
select is((select jsonb_array_length(public.ride_dashboard()->'offers')),0,'expired driver cannot receive offers');
select tests.clear_authentication();
update public.profiles set deleted_at=now() where id=tests.uid('client_a');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_dashboard()$$,'P0001','not_allowed','deleted profile cannot read ride history with an existing session');
select throws_ok($$select public.ride_consent((select v from ride_case where k='quote'),true)$$,
  'P0001','not_allowed','deleted payer cannot replay a previously approved consent');
select * from finish();
rollback;
