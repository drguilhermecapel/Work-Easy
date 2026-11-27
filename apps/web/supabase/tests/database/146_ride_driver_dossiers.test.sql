begin;
select plan(34);
select tests.setup_fixture();
create temporary table dossier_fixture(k text primary key,id uuid);
grant select,insert on dossier_fixture to authenticated;
select tests.authenticate_as('client_a');
select is(public.ride_dossier()->>'open','false','no real files accepted in rehearsal');
select throws_ok($$select public.ride_begin_dossier('Teste ABC','ABC1D23','Modelo exemplo','REF-1','v1')$$,'P0001','not_allowed','refuses direct writes in rehearsal');
select tests.clear_authentication();
update private.ride_deployment set environment='live';
update private.ride_network set module_enabled=true where environment='live';
insert into public.ride_drivers(id,vehicle,environment,status) values(tests.uid('client_a'),'compact','live','pending');
insert into private.ride_area_authorizations(area,legal_ref,privacy_ref,ops_ref,until_at,quote_enabled) values('Teste','LEGAL','PRIV','OPS',now()+interval '5 days',true);
select tests.authenticate_as('client_a');
select is(public.ride_dossier()->>'open','false','authorized corridor alone does not authorize personal data intake');
select tests.clear_authentication();
insert into private.ride_dossier_policy(approval_ref,privacy_version,until_at,retention_days) values('test','v1',now()+interval '5 days',3);
select tests.authenticate_as('client_a');
insert into dossier_fixture values('dossier',public.ride_begin_dossier('Nome Fictício','ABC1D23','Sedã Teste','TESTE-123','v1'));
select is(public.ride_dossier_upload_target(),(select id from dossier_fixture where k='dossier'),'only the editable dossier receives files');
select throws_ok($$select public.ride_submit_dossier((select id from dossier_fixture where k='dossier'))$$,'P0001','documents_missing','incomplete dossier cannot be submitted');
select ok(not has_function_privilege('authenticated','public.ride_dossier_attach(uuid,uuid,text,text)','execute'),'only sanitized backend uploads can be attached');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_dossier(tests.uid('client_a'))$$,'P0001','not_allowed','a different account cannot list the dossier');
select tests.clear_authentication();
insert into storage.objects(bucket_id,name)
select 'ride-driver-files', tests.uid('client_a')||'/'||x.id||'/'||kind||'-'||gen_random_uuid()||'.jpg'
from dossier_fixture x, unnest(array['driver_photo','vehicle_photo','driver_license','municipal_permit','vehicle_license','vehicle_certificate','insurance']) kind;
insert into dossier_fixture
select split_part(split_part(o.name,'/',3),'-',1),public.ride_dossier_attach(tests.uid('client_a'),x.id,split_part(split_part(o.name,'/',3),'-',1),o.name)
from storage.objects o,dossier_fixture x where o.bucket_id='ride-driver-files' and x.k='dossier';
select tests.authenticate_as('client_b');
select is(public.ride_dossier_file_path((select id from dossier_fixture where k='driver_license')),null,'another account cannot open license');
select tests.authenticate_as('client_a');
select ok(public.ride_submit_dossier((select id from dossier_fixture where k='dossier')),'all required files enter review');
select is(public.ride_dossier_upload_target(),null,'files are frozen on submission');
select throws_ok($$select public.ride_decide_dossier((select id from dossier_fixture where k='dossier'),true,current_date+3,current_date+3,current_date+3,'')$$,'P0001','not_allowed','applicant cannot approve own dossier');
select tests.authenticate_as('admin');
select ok(public.ride_dossier_file_path((select id from dossier_fixture where k='insurance')) is not null,'administrator can inspect the private proof');
select ok(public.ride_decide_dossier((select id from dossier_fixture where k='dossier'),true,current_date+10,current_date+8,current_date+3,''),'admin verifies the three expiries and approves');
select tests.clear_authentication();
select is((select valid_until from public.ride_drivers where id=tests.uid('client_a')),current_date+3,'first expiry limits eligibility');
select is((select vehicle_plate from private.ride_driver_credentials where driver_id=tests.uid('client_a')),'ABC1D23','approved vehicle is copied into the attestation');
select ok(private.ride_driver_valid(tests.uid('client_a'),current_date+2),'current direct driver and verified dossier qualify');
select ok(not private.ride_driver_valid(tests.uid('client_a'),current_date+4),'expired insurance blocks assignment');
-- A client paying for a service is deliberately different from the assigned passenger.
insert into private.ride_receipt_policy(environment,approval_ref,receipt_retention_days,export_enabled,approved_until)
values ('live','fixture-146',30,true,now()+interval '1 day');
update private.ride_signal_settings set location_enabled=true where singleton;
insert into public.admins(user_id) values(tests.create_user('ride_support_backup_146','Suplente de ensaio'));
with pilot as (
 insert into private.ride_pilot(period,approved_ref,budget_cents) values(tstzrange(now()-interval '1 hour',now()+interval '1 day'),'fixture-146',50000)
 returning id,period
), coverage as (
 insert into private.ride_coverage(pilot,period,lead_id,backup_id)
   select id,period,tests.uid('admin'),tests.uid('ride_support_backup_146') from pilot
   returning id
)
insert into private.ride_support_channels(coverage_id,channel,address,team,verified_ref)
  select id,'email','plantao@example.test','Equipe de ensaio','TEST-VERIFIED' from coverage;
insert into private.ride_routes(environment,origin,destination,meters,minutes) values('live','Área A','Área B',4000,15);
insert into private.ride_tariffs(environment,valid_from,base_cents,km_cents,minute_cents,minimum_cents,commission_bps)
values('live',now()-interval '1 day',400,150,10,1000,1000);
with q as (
 insert into private.ride_quotes(environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
 select 'live',tests.uid('client_b'),gen_random_uuid(),tests.uid('client_b'),'[]','[]',array[tests.uid('client_b')],t.id,now()+interval '1 hour','requested',2000
 from private.ride_tariffs t where environment='live' returning id,passenger_id,tariff_id
), r as (
 insert into public.rides(quote_id,environment,passenger_id) select id,'live',passenger_id from q returning id,quote_id
), l as (
 insert into public.ride_legs(ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,driver_cents,payer_id,tariff_id,driver_id,environment,status)
 select r.id,1,'Área A','Área B',now(),15,tstzrange(now(),now()+interval '15 min'),2000,200,1800,tests.uid('provider_b'),q.tariff_id,tests.uid('client_a'),'live','accepted'
 from r join q on q.id=r.quote_id returning id
) insert into dossier_fixture select 'leg',id from l;
select tests.authenticate_as('provider_b');
select is(public.ride_trip_driver_identity((select id from dossier_fixture where k='leg')),null,'a payer who is not the rider cannot see the identification');
select is(public.ride_dossier_file_path((select id from dossier_fixture where k='driver_photo'),(select id from dossier_fixture where k='leg')),null,'payer cannot open the photo with a known id');
select tests.authenticate_as('client_b');
select is(public.ride_trip_driver_identity((select id from dossier_fixture where k='leg'))->>'plate','ABC1D23','assigned passenger sees the reviewed plate');
select ok(public.ride_dossier_file_path((select id from dossier_fixture where k='driver_photo'),(select id from dossier_fixture where k='leg')) is not null,'rider may open the verified photo during the trip');
select is(public.ride_dossier_file_path((select id from dossier_fixture where k='driver_license'),(select id from dossier_fixture where k='leg')),null,'rider cannot open the underlying license');
select tests.authenticate_as('admin');
select ok(public.ride_decide_dossier((select id from dossier_fixture where k='dossier'),false,null,null,null,'Revogação identificada na fonte'),'admin can suspend an approved credential immediately');
select tests.clear_authentication();
select ok(not private.ride_driver_valid(tests.uid('client_a'),current_date),'suspension blocks new assignments');
select tests.authenticate_as('client_b');
select is(public.ride_trip_driver_identity((select id from dossier_fixture where k='leg'))->>'plate','ABC1D23','assigned rider retains the verified identity to handle the active trip');
select tests.clear_authentication();
update public.ride_legs set status='cancelled' where id=(select id from dossier_fixture where k='leg');
select tests.authenticate_as('client_b');
select is(public.ride_trip_driver_identity((select id from dossier_fixture where k='leg')),null,'identification projection stops on closure');
select is(public.ride_dossier_file_path((select id from dossier_fixture where k='driver_photo'),(select id from dossier_fixture where k='leg')),null,'no new signed photo after cancellation');
select tests.clear_authentication();
insert into private.ride_dossier_holds(dossier_id,evidence_ref,until_at) select id,'fixture:obrigacao',now()+interval '1 day' from dossier_fixture where k='dossier';
update public.profiles set deleted_at=now() where id in (tests.uid('admin'),tests.uid('client_a'));
select tests.authenticate_as('admin');
select throws_ok($$select public.ride_dossier(tests.uid('client_a'))$$,'P0001','not_allowed','a stale JWT for a deleted administrator cannot read another dossier');
select is(public.ride_dossier_file_path((select id from dossier_fixture where k='insurance')),null,'a stale admin cannot mint file access');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_begin_dossier('Nome Fictício','ABC1D23','Modelo','Ref','v1')$$,'P0001','not_allowed','deleted owner cannot open a new file collection');
select is(public.ride_dossier_upload_target(),null,'deleted owner cannot acquire an upload slot');
select tests.clear_authentication();
select ok((select expires_at<=now() from private.ride_dossiers where id=(select id from dossier_fixture where k='dossier')),'erasure expires routine access immediately');
select is((select count(*) from public.ride_dossier_expired_files() x join private.ride_dossier_files f on f.path=x.path
 where f.dossier_id=(select id from dossier_fixture where k='dossier')),0::bigint,'formal retention prevents deletion during the specific hold');
update private.ride_dossier_holds set until_at=now()-interval '1 second' where dossier_id=(select id from dossier_fixture where k='dossier');
select is((select count(*) from public.ride_dossier_expired_files() x join private.ride_dossier_files f on f.path=x.path
 where f.dossier_id=(select id from dossier_fixture where k='dossier')),7::bigint,'expired hold returns the private files to the retention worker');
select * from finish();
rollback;
