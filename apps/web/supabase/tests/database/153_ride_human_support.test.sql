begin;
select no_plan();
select tests.setup_fixture();
select tests.create_user('support_backup_153');
select tests.create_user('support_next_153');
insert into public.admins(user_id) values(tests.uid('support_backup_153')),(tests.uid('support_next_153'));
create function pg_temp.k(p text) returns uuid language sql immutable as $$select md5('support-153-'||p)::uuid$$;
insert into private.ride_pilot(id,period,approved_ref,budget_cents) values(pg_temp.k('pilot'),tstzrange(now()-interval '3 hours',now()+interval '1 day'),'fixture-153',10000);
insert into private.ride_coverage(id,pilot,period,lead_id,backup_id) values(pg_temp.k('coverage'),pg_temp.k('pilot'),tstzrange(now()-interval '2 hours',now()+interval '2 hours'),tests.uid('admin'),tests.uid('support_backup_153'));
update private.ride_deployment set environment='live';
insert into private.ride_tariffs(environment,valid_from,base_cents,km_cents,minute_cents,minimum_cents,commission_bps)
  values('live','2000-01-01Z',450,180,35,1200,1000);
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true,monetization_enabled=true where environment='live';
insert into private.ride_area_authorizations(area,legal_ref,privacy_ref,ops_ref,until_at,quote_enabled,dispatch_enabled,monetization_enabled)
  select area,'TEST','TEST','TEST',now()+interval '1 day',true,true,true from unnest(array['A','B']) area;
insert into private.ride_quotes(id,environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
  select pg_temp.k('quote-live'),'live',tests.uid('client_a'),gen_random_uuid(),tests.uid('client_a'),'[]','[]',array[tests.uid('client_a')],id,
    now()+interval '4 minutes','requested',2900 from private.ride_tariffs where environment='live' limit 1;
insert into public.rides(id,quote_id,environment,passenger_id) values(pg_temp.k('ride-live'),pg_temp.k('quote-live'),'live',tests.uid('client_a'));
-- A funded roster of two authorized operators has no verified contact yet.
select throws_ok($probe$
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,driver_cents,payer_id,tariff_id,environment)
  select pg_temp.k('no-contact'),pg_temp.k('ride-live'),1,'A','B',now(),20,tstzrange(now(),now()+interval '20 minutes'),
    2900,290,2610,tests.uid('client_a'),tariff_id,'live' from private.ride_quotes where id=pg_temp.k('quote-live')
$probe$,'P0001','ride_support_unstaffed','Live commitment fails if a staffed and funded shift has no verified contact');
select is((select count(*) from private.ride_commitments where leg_id=pg_temp.k('no-contact')),0::bigint,'Blocked commitment does not consume capacity or money');
delete from public.rides where id=pg_temp.k('ride-live');
delete from private.ride_quotes where id=pg_temp.k('quote-live');
update private.ride_deployment set environment='simulation';
with q as (
  insert into private.ride_quotes(environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
  select 'simulation',tests.uid('provider_a'),gen_random_uuid(),tests.uid('provider_a'),'[]','[]',
    array[tests.uid('provider_a'),tests.uid('client_a')],id,now()+interval '4 minutes','requested',2900
    from private.ride_tariffs where environment='simulation' limit 1 returning id,tariff_id
), r as (
  insert into public.rides(quote_id,environment,passenger_id) select id,'simulation',tests.uid('provider_a') from q returning id,quote_id
)
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,driver_cents,payer_id,tariff_id,environment)
  select pg_temp.k('leg'),r.id,1,'Saúde','Jabaquara',now(),20,tstzrange(now(),now()+interval '20 minutes'),
    2900,290,2610,tests.uid('client_a'),q.tariff_id,'simulation' from q join r on r.quote_id=q.id;
select tests.authenticate_as('provider_a');
select ok((public.ride_support_contact(pg_temp.k('leg'))->>'address') is null,'Roster alone does not disclose or invent a contact');
create temp table my_ticket(id uuid);
grant select on my_ticket to authenticated;
insert into my_ticket select public.ride_open_help(pg_temp.k('leg'),'safety');
select is(public.ride_open_help(pg_temp.k('leg'),'safety'),(select id from my_ticket),'Repeated help request retains the support protocol');
select tests.clear_authentication();
select throws_ok($$insert into private.ride_support_channels values(pg_temp.k('coverage'),'email',E'unsafe@example.test\nrest','Equipe','TEST-153')$$,'23514',null,'Reject mail addresses with control characters');
insert into private.ride_support_channels values(pg_temp.k('coverage'),'email','plantao@example.test','Equipe de ensaio','TEST-153');
insert into public.support_tasks(id,kind,payload) values
  (pg_temp.k('other'),'other_case',jsonb_build_object('leg_id',pg_temp.k('leg'),'environment','simulation')),
  (pg_temp.k('mismatch'),'ride_receipt_incomplete',jsonb_build_object('leg_id',pg_temp.k('leg'),'environment','live'));
select tests.authenticate_as('provider_a');
select is(public.ride_support_contact(pg_temp.k('leg'))->>'address','plantao@example.test','Participant receives the approved team contact only');
select is(public.ride_support_contact(pg_temp.k('leg'))->>'on_duty','true','Current published roster is on duty');
select is(public.ride_support_contact(pg_temp.k('leg'))#>>'{requests,0,protocol}',(select id::text from my_ticket),'Requester sees own protocol');
select throws_ok($$select public.admin_ride_support_queue()$$,'P0001','not_allowed','Participant cannot list operations queue');
select tests.authenticate_as('client_a');
select is(public.ride_support_contact(pg_temp.k('leg'))->'requests','[]'::jsonb,'Other payer cannot see who sought help');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_support_contact(pg_temp.k('leg'))$$,'P0001','not_allowed','Unrelated account cannot read channel or case');
select tests.authenticate_as('admin');
select is(jsonb_array_length(public.admin_ride_support_queue()),1,'Queue excludes unrelated support cases and environment mismatch');
select is(public.admin_ride_support_queue()#>>'{0,can_claim}','true','An on-duty operator may take this protocol');
select throws_ok($$select public.admin_ride_support_action(pg_temp.k('other'),'claim',null)$$,'P0001','not_allowed','Cannot claim a general support task');
select is(public.admin_ride_support_action((select id from my_ticket),'claim',null),(select id from my_ticket),'Current lead takes protocol');
select is(public.admin_ride_support_action((select id from my_ticket),'claim',null),(select id from my_ticket),'Claim replay returns same protocol');
select tests.authenticate_as('support_backup_153');
select throws_ok($$select public.admin_ride_support_action((select id from my_ticket),'claim',null)$$,'P0001','ride_support_claimed','Concurrent alternate cannot replace active owner');
select throws_ok($$select public.admin_ride_support_action((select id from my_ticket),'resolve','assisted')$$,'P0001','ride_support_not_owner','Only assigned operator may close protocol');
select tests.authenticate_as('support_next_153');
select throws_ok($$select public.admin_ride_support_action((select id from my_ticket),'claim',null)$$,'P0001','ride_support_off_duty','Admin off duty cannot act');
select tests.clear_authentication();
-- Handoff: original lead leaves. Incoming team has its own verification.
update private.ride_coverage set period=tstzrange(now()-interval '2 hours',now()-interval '1 minute') where id=pg_temp.k('coverage');
insert into private.ride_coverage(id,pilot,period,lead_id,backup_id) values(pg_temp.k('next'),pg_temp.k('pilot'),tstzrange(now()-interval '1 minute',now()+interval '8 hours'),tests.uid('support_backup_153'),tests.uid('support_next_153'));
insert into private.ride_support_channels values(pg_temp.k('next'),'email','revezamento@example.test','Equipe seguinte','TEST-153-HANDOVER');
select tests.authenticate_as('support_backup_153');
select is(public.admin_ride_support_action((select id from my_ticket),'claim',null),(select id from my_ticket),'Next team can take the case after previous owner leaves duty');
select is(public.admin_ride_support_action((select id from my_ticket),'resolve','assisted'),(select id from my_ticket),'Responsible staff resolves with a reason code');
select is(public.admin_ride_support_action((select id from my_ticket),'resolve','assisted'),(select id from my_ticket),'Resolution replay retains same result');
select throws_ok($$select public.admin_ride_support_action((select id from my_ticket),'resolve','duplicate')$$,'P0001','ride_support_closed','Closed outcome cannot be rewritten');
select tests.clear_authentication();
select is((select count(*) from private.ride_support_history where task_id=(select id from my_ticket)),3::bigint,'Only original claim, real handover and resolution are audited');
select tests.authenticate_as('provider_a');
select is(public.ride_support_contact(pg_temp.k('leg'))#>>'{requests,0,code}','assisted','Requester sees resolution and stable protocol');
select is(public.ride_support_contact(pg_temp.k('leg'))->>'team','Equipe seguinte','Participant hears from present duty team even after change');
select tests.clear_authentication();
update private.ride_coverage set period=tstzrange(now()+interval '1 hour',now()+interval '8 hours') where id=pg_temp.k('next');
select tests.authenticate_as('provider_a');
select is(public.ride_support_contact(pg_temp.k('leg'))->>'on_duty','false','Upcoming hours never appear staffed now');
select tests.authenticate_anon();
select throws_ok($$select public.ride_support_contact(pg_temp.k('leg'))$$,'42501',null,'Anonymous caller cannot read team or cases');
select * from finish();
rollback;
