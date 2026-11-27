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
 select area,'test-legal','test-privacy','test-ops',now()+interval '1 day',true,true,true from (values('Bairro A'),('Bairro B')) a(area);
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
insert into live_case select 'quote',(public.ride_quote(gen_random_uuid(),null,null,
 jsonb_build_array(jsonb_build_object('origin','Bairro A','destination','Bairro B','payer','passenger','route_id',(select id from live_case where k='case'))))->>'id')::uuid;
select is((public.ride_dashboard()->'quotes'->0->>'total_cents')::int,1700,'price frozen at 500 + 3 × 200 + 15 × 40');
select throws_ok($$select public.ride_consent((select id from live_case where k='quote'),true)$$,'P0001','ride_pilot_unstaffed','global and area gates alone do not dispatch');
select tests.clear_authentication();
insert into private.ride_pilot(period,approved_ref,budget_cents) values(tstzrange(now()-interval '10 minutes',now()+interval '2 hours'),'test-finance',1699);
insert into private.ride_coverage(pilot,period,lead_id,backup_id)
 select id,period,tests.uid('admin'),tests.uid('provider_a') from private.ride_pilot;
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_consent((select id from live_case where k='quote'),true)$$,'P0001','ride_pilot_budget','one cent over budget blocks dispatch atomically');
select tests.clear_authentication();
update private.ride_pilot set budget_cents=1700;
select tests.authenticate_as('client_a');
insert into live_case select 'ride',(public.ride_consent((select id from live_case where k='quote'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
insert into live_case select 'leg',id from public.ride_legs where ride_id=(select id from live_case where k='ride');
select is((select amount_cents::int from private.ride_commitments where leg_id=(select id from live_case where k='leg')),1700,'only authorized gross fare committed');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_accept_offer((select id from live_case where k='leg'),gen_random_uuid())$$,
 'P0001','ride_receipt_not_ready','assignment also requires location and receipt/reporting readiness');
select tests.clear_authentication();
update private.ride_receipt_policy set export_enabled=true where environment='live';
update private.ride_signal_settings set location_enabled=true;
select tests.authenticate_as('client_b');
select is(public.ride_accept_offer((select id from live_case where k='leg'),gen_random_uuid())->>'status','accepted','driver accepts using public RPC after all live-mode gates');
select is(public.ride_leg_points((select id from live_case where k='leg'))->'origin'->>'label','Ensaio ponto A','assigned driver receives exact authorized point');
select lives_ok($$select public.ride_transition((select id from live_case where k='leg'),'arriving',gen_random_uuid())$$,'driver en route');
select lives_ok($$select public.ride_mark_at_pickup((select id from live_case where k='leg'))$$,'physical arrival recorded separately');
select lives_ok($$select public.ride_transition((select id from live_case where k='leg'),'boarded',gen_random_uuid())$$,'boarding confirmed');
select lives_ok($$select public.ride_transition((select id from live_case where k='leg'),'completed',gen_random_uuid())$$,'trip complete independently of settlement');
select tests.authenticate_as('client_a');
select is(public.ride_aftercare((select id from live_case where k='leg'))#>>'{document,money,paid_cents}','0','live-mode trip completion does not manufacture payment');
select * from finish();
rollback;
