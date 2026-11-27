-- Local Supabase rehearsal of live-mode rules. Configuration and fictitious
-- fixture evidence exist only inside this transaction. No transport or PSP call.
begin;
select no_plan();
select tests.setup_fixture();
create temp table live_case (k text primary key,id uuid);
grant select,insert on live_case to authenticated;
update private.ride_deployment set environment='live';
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true,monetization_enabled=true where environment='live';
insert into private.ride_area_authorizations(area,legal_ref,privacy_ref,ops_ref,until_at,quote_enabled,dispatch_enabled,monetization_enabled)
 select area,'test-legal','test-privacy','test-ops',now()+interval '1 day',true,true,true from (values('Bairro A'),('Bairro B'),('Bairro distante')) a(area);
insert into private.ride_approach_routes(environment,origin_area,destination_area,minutes,reference,valid_until) values
 ('live','Bairro distante','Bairro A',55,'test-approach',now()+interval '1 day'),
 ('live','Bairro A','Bairro A',6,'test-approach',now()+interval '1 day');
insert into private.ride_tariffs(environment,valid_from,base_cents,km_cents,minute_cents,minimum_cents,commission_bps)
 values('live',now()-interval '1 day',500,200,40,1200,1000);
insert into private.ride_receipt_policy values('live','test-only',7,false,now()+interval '1 day');
insert into private.ride_dossier_policy(approval_ref,privacy_version,until_at,retention_days) values('test-only','test',now()+interval '1 day',7);
select tests.authenticate_as('client_b');
select lives_ok($$select public.ride_apply_driver('compact')$$,'live-mode fleet registration uses additive driver capability');
insert into live_case values ('dossier',public.ride_begin_dossier('Nome Fictício','XXX0A00','Sedã de Ensaio','TESTE-01','test'));
select tests.clear_authentication();
insert into storage.objects(bucket_id,name)
select 'ride-driver-files',tests.uid('client_b')||'/'||(select id from live_case where k='dossier')||'/'||kind||'-'||gen_random_uuid()||'.jpg'
from unnest(array['driver_photo','vehicle_photo','driver_license','municipal_permit','vehicle_license','vehicle_certificate','insurance']) kind;
select public.ride_dossier_attach(tests.uid('client_b'),(select id from live_case where k='dossier'),split_part(split_part(name,'/',3),'-',1),name)
from storage.objects where bucket_id='ride-driver-files' and split_part(name,'/',2)=(select id::text from live_case where k='dossier');
select tests.authenticate_as('client_b');
select lives_ok($$select public.ride_submit_dossier((select id from live_case where k='dossier'))$$,'test driver submits verified-document pipeline');
select tests.authenticate_as('admin');
select lives_ok($$select public.ride_decide_dossier((select id from live_case where k='dossier'),true,current_date+2,current_date+3,current_date+4,'')$$,'independent reviewer approves current driver, vehicle and insurance');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_set_online(true)$$,'P0001','driver_shift_required','live driver needs declared shift and area');
insert into live_case select 'distant_shift',(public.ride_configure_shift('Bairro distante',now(),now()+interval '2 hours')->>'id')::uuid;
select is((public.ride_configure_shift('Bairro distante',now(),now()+interval '2 hours')->>'id')::uuid,(select id from live_case where k='distant_shift'),'retry keeps one shift');
select lives_ok($$select public.ride_set_online(true)$$,'current licensed driver goes online');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote(gen_random_uuid(),null,null,'[{"origin":"Bairro A","destination":"Bairro B","payer":"passenger"}]')$$,
 'P0001','verified_route_required','live-mode never substitutes synthetic area-to-area pricing');
insert into live_case select 'case',(public.ride_prepare_route(gen_random_uuid(),null,'Bairro A','Bairro B',
 '{"label":"Ensaio ponto A","lat":-23.60,"lng":-46.64}','{"label":"Ensaio ponto B","lat":-23.61,"lng":-46.65}',null)->>'id')::uuid;
select tests.authenticate_as('admin');
select lives_ok($$select public.ride_claim_route((select id from live_case where k='case'))$$,'reviewer claims precise route');
select lives_ok($$select public.ride_verify_route((select id from live_case where k='case'),3000,15,'SYNTHETIC/local-map')$$,'operator freezes synthetic measured route');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote(gen_random_uuid(),null,now()+interval '1 day',
 jsonb_build_array(jsonb_build_object('origin','Bairro A','destination','Bairro B','payer','passenger','route_id',(select id from live_case where k='case'))))$$,
 'P0001','ride_scope_expired','both area permits must cover the end of a future scheduled journey');
insert into live_case select 'quote',(public.ride_quote(gen_random_uuid(),null,null,
 jsonb_build_array(jsonb_build_object('origin','Bairro A','destination','Bairro B','payer','passenger','route_id',(select id from live_case where k='case'))))->>'id')::uuid;
select is((public.ride_dashboard()->'quotes'->0->>'total_cents')::int,1700,'price frozen at 500 + 3 × 200 + 15 × 40');
select throws_ok($$select public.ride_consent((select id from live_case where k='quote'),true)$$,'P0001','ride_pilot_unstaffed','global and area gates alone do not dispatch');
select tests.clear_authentication();
insert into public.admins(user_id) values(tests.create_user('ride_support_backup_149','Suplente de ensaio'));
with pilot as (
 insert into private.ride_pilot(period,approved_ref,budget_cents) values(tstzrange(now()-interval '10 minutes',now()+interval '2 hours'),'test-finance',1699)
 returning id,period
), coverage as (
 insert into private.ride_coverage(pilot,period,lead_id,backup_id)
   select id,period,tests.uid('admin'),tests.uid('ride_support_backup_149') from pilot
   returning id
)
insert into private.ride_support_channels(coverage_id,channel,address,team,verified_ref)
  select id,'email','plantao@example.test','Equipe de ensaio','TEST-VERIFIED' from coverage;
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_consent((select id from live_case where k='quote'),true)$$,'P0001','ride_pilot_budget','one cent over budget blocks dispatch atomically');
select tests.clear_authentication();
update private.ride_pilot set budget_cents=1700;
savepoint permit_changed;
update private.ride_area_authorizations set until_at=now()+interval '10 minutes' where area='Bairro B';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_consent((select id from live_case where k='quote'),true)$$,'P0001','ride_scope_expired',
 'a shortened permit between quotation and confirmation stops the commitment');
rollback to permit_changed;
select tests.authenticate_as('client_a');
insert into live_case select 'ride',(public.ride_consent((select id from live_case where k='quote'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
insert into live_case select 'leg',id from public.ride_legs where ride_id=(select id from live_case where k='ride');
select is((select amount_cents::int from private.ride_commitments where leg_id=(select id from live_case where k='leg')),1700,'only authorized gross fare committed');
select tests.authenticate_as('client_b');
select is(jsonb_array_length(public.ride_dashboard()->'offers'),0,'distant declared origin cannot reach immediate pickup');
select throws_ok($$select public.ride_accept_offer((select id from live_case where k='leg'),gen_random_uuid())$$,'P0001','offer_unavailable','knowing a distant leg ID cannot bypass reachability');
select lives_ok($$select public.ride_remove_shift((select id from live_case where k='distant_shift'))$$,'driver can close a shift without commitments');
select lives_ok($$select public.ride_configure_shift('Bairro A',now(),now()+interval '2 hours')$$,'declare the actual nearby shift');
select lives_ok($$select public.ride_set_online(true)$$,'resume offers after declaring nearby origin');
select is((public.ride_dashboard()->'offers'->0->>'approach_minutes')::int,6,'offer labels the calibrated six-minute approach');
select throws_ok($$select public.ride_accept_offer((select id from live_case where k='leg'),gen_random_uuid())$$,
 'P0001','ride_receipt_not_ready','assignment also requires location and receipt/reporting readiness');
select tests.clear_authentication();
update private.ride_receipt_policy set export_enabled=true where environment='live';
update private.ride_signal_settings set location_enabled=true;
savepoint approach_horizon;
update private.ride_area_authorizations set until_at=now()+interval '18 minutes' where area='Bairro B';
select tests.authenticate_as('client_b');
select is(jsonb_array_length(public.ride_dashboard()->'offers'),0,'area permit covers the original trip but expires during its delayed arrival');
select throws_ok($$select public.ride_accept_offer((select id from live_case where k='leg'),gen_random_uuid())$$,'P0001','offer_unavailable',
 'assignment cannot bypass the driver-specific end time');
rollback to approach_horizon;
select tests.authenticate_as('client_b');
select is(public.ride_accept_offer((select id from live_case where k='leg'),gen_random_uuid())->>'status','accepted','driver accepts using public RPC after all live-mode gates');
select is(public.ride_can_transmit((select id from live_case where k='leg')),false,'accepting alone never starts location tracking');
select throws_ok($$select public.ride_send_position((select id from live_case where k='leg'),now(),-23.61,-46.65,5)$$,'P0001','transmission_ended','a device cannot upload GPS before approach starts');
select is(public.ride_leg_points((select id from live_case where k='leg'))->'origin'->>'label','Ensaio ponto A','assigned driver receives exact authorized point');
select tests.clear_authentication();
savepoint predeparture;
update private.ride_area_authorizations set until_at=now() where area='Bairro B';
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_transition((select id from live_case where k='leg'),'arriving',gen_random_uuid())$$,
 'P0001','ride_scope_expired','a suspended permit stops departure');
select lives_ok($$select public.ride_transition((select id from live_case where k='leg'),'cancelled',gen_random_uuid())$$,
 'an already assigned driver can still cancel and arrange assistance');
rollback to predeparture;
select tests.authenticate_as('client_b');
select lives_ok($$select public.ride_transition((select id from live_case where k='leg'),'arriving',gen_random_uuid())$$,'driver en route');
select throws_ok($$select public.ride_transition((select id from live_case where k='leg'),'boarded',gen_random_uuid())$$,
 'P0001','ride_pickup_arrival_required','driver records actual arrival before boarding in live mode');
select lives_ok($$select public.ride_mark_at_pickup((select id from live_case where k='leg'))$$,'physical arrival recorded separately');
select lives_ok($$select public.ride_transition((select id from live_case where k='leg'),'boarded',gen_random_uuid())$$,'boarding confirmed');
select tests.clear_authentication();
update private.ride_area_authorizations set until_at=now() where area='Bairro B';
select tests.authenticate_as('client_b');
select lives_ok($$select public.ride_transition((select id from live_case where k='leg'),'completed',gen_random_uuid())$$,
 'permit expiry after boarding allows safe completion independently of settlement');
select tests.authenticate_as('client_a');
select is(public.ride_aftercare((select id from live_case where k='leg'))#>>'{document,money,paid_cents}','0','live-mode trip completion does not manufacture payment');
-- A linked client/provider remains bound to the same service window after
-- assignment. Changes can be recovered through cancellation and fresh consent.
select tests.clear_authentication();
update private.ride_area_authorizations set until_at=now()+interval '1 day';
update private.ride_pilot set budget_cents=5000;
insert into live_case select 'booking',tests.make_booking('provider_a','client_a','t-reparo',
 tstzrange(now()+interval '1 hour',now()+interval '2 hours'),'accepted');
select tests.authenticate_as('provider_a');
insert into live_case select 'linked_case',(public.ride_prepare_route(gen_random_uuid(),(select id from live_case where k='booking'),'Bairro A','Bairro B',
 '{"label":"Ponto fictício C","lat":-23.60,"lng":-46.64}','{"label":"Ponto fictício D","lat":-23.61,"lng":-46.65}','destination')->>'id')::uuid;
select tests.authenticate_as('admin');
select public.ride_claim_route((select id from live_case where k='linked_case'));
select public.ride_verify_route((select id from live_case where k='linked_case'),3000,15,'SYNTHETIC/linked');
select tests.authenticate_as('provider_a');
insert into live_case select 'linked_quote',(public.ride_quote(gen_random_uuid(),(select id from live_case where k='booking'),null,
 jsonb_build_array(jsonb_build_object('origin','Bairro A','destination','Bairro B','payer','client','route_id',(select id from live_case where k='linked_case'))))->>'id')::uuid;
select public.ride_consent((select id from live_case where k='linked_quote'),true);
select tests.authenticate_as('client_a');
select public.ride_consent((select id from live_case where k='linked_quote'),true);
select tests.clear_authentication();
insert into live_case select 'linked_leg',l.id from public.ride_legs l where source_quote_id=(select id from live_case where k='linked_quote');
select tests.authenticate_as('client_b');
select public.ride_accept_offer((select id from live_case where k='linked_leg'),gen_random_uuid());
select tests.clear_authentication();
savepoint booking_rescheduled;
update public.bookings set period=tstzrange(now()+interval '2 hours',now()+interval '3 hours') where id=(select id from live_case where k='booking');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_transition((select id from live_case where k='linked_leg'),'arriving',gen_random_uuid())$$,
 'P0001','ride_service_changed','rescheduling the service prevents departure on its old authorization');
rollback to booking_rescheduled;
select tests.authenticate_as('client_b');
select public.ride_transition((select id from live_case where k='linked_leg'),'arriving',gen_random_uuid());
select public.ride_mark_at_pickup((select id from live_case where k='linked_leg'));
select tests.authenticate_as('client_a');
select public.transition_booking((select id from live_case where k='booking'),'canceled','Reagendamento de ensaio');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_transition((select id from live_case where k='linked_leg'),'boarded',gen_random_uuid())$$,
 'P0001','ride_service_changed','outbound cannot board after the related service has been cancelled');
select lives_ok($$select public.ride_transition((select id from live_case where k='linked_leg'),'cancelled',gen_random_uuid())$$,
 'driver may cancel a ride whose original service was withdrawn');
select * from finish();
rollback;
