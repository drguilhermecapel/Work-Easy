begin;
select no_plan();
select tests.setup_fixture();
select tests.create_user('safety_reviewer');
insert into public.admins(user_id) values(tests.uid('safety_reviewer'));
create function pg_temp.key(k text) returns uuid language sql immutable as $$select md5('203'||k)::uuid$$;
insert into private.ride_pilot(id,period,approved_ref,budget_cents) values(pg_temp.key('pilot'),tstzrange(now()-interval '1 hour',now()+interval '1 day'),'TEST-203',10000);
insert into private.ride_coverage(id,pilot,period,lead_id,backup_id) values(pg_temp.key('roster'),pg_temp.key('pilot'),tstzrange(now()-interval '1 hour',now()+interval '1 day'),tests.uid('admin'),tests.uid('safety_reviewer'));
insert into private.ride_support_channels values(pg_temp.key('roster'),'email','qa@example.test','Equipe fictícia','TEST-203');
update private.ride_network set module_enabled=true,dispatch_enabled=true,quote_enabled=true where environment='simulation';
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_c'),'simulation','sedan','approved',current_date+5,tests.uid('admin'),true);
insert into private.ride_quotes(id,environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
select pg_temp.key('quote'),'simulation',tests.uid('client_a'),gen_random_uuid(),tests.uid('client_a'),'[]','[]',array[tests.uid('client_a')],id,
 now()+interval '4 minutes','requested',3000 from private.ride_tariffs where environment='simulation' limit 1;
insert into public.rides(id,quote_id,environment,passenger_id) values(pg_temp.key('ride'),pg_temp.key('quote'),'simulation',tests.uid('client_a'));
insert into public.ride_legs(id,ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,driver_cents,payer_id,driver_id,tariff_id,status,environment)
select pg_temp.key('leg'||i),pg_temp.key('ride'),i,'Saúde','Jabaquara',now()+make_interval(hours=>i-1),20,tstzrange(now()+make_interval(hours=>i-1),now()+make_interval(hours=>i-1,mins=>20)),
 3000,300,2700,tests.uid('client_b'),case when i=1 then tests.uid('provider_c') end,tariff_id,case when i=1 then 'arriving' else 'requested' end,'simulation'
 from private.ride_quotes cross join generate_series(1,2) i where id=pg_temp.key('quote');
insert into private.ride_safety_policies(id,environment,origin,destination,period,insurer,coverage,exclusions,territory,claim_channel,approval_ref,reply_minutes,media_key,media_days)
 values(pg_temp.key('policy'),'simulation','Saúde','Jabaquara',tstzrange(now()-interval '1 day',now()+interval '5 days'),'Seguradora fictícia','Acidente de treinamento','Outros casos','SP ensaio','canal de ensaio','TEST-203',15,
 vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'safety-test-203'),1);
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_issue_pin(pg_temp.key('leg1'))$$,'P0001','not_allowed','Another payer cannot obtain or guess the passenger PIN');
select tests.authenticate_as('client_a');
select set_config('tests.revoked203',public.ride_share_invite(pg_temp.key('leg1'),'client_b@test.local',5)::text,true);
select ok(public.ride_share_revoke((current_setting('tests.revoked203')::jsonb->>'id')::uuid),'Issuer immediately revokes a trusted contact');
select tests.authenticate_as('client_b');
select is(public.ride_shared_progress(current_setting('tests.revoked203')::jsonb->>'token'),null::jsonb,'Revoked invite cannot be reused');
select tests.authenticate_as('client_a');
select set_config('tests.share203',public.ride_share_invite(pg_temp.key('leg1'),'client_b@test.local',15)->>'token',true);
select set_config('tests.pin203',public.ride_issue_pin(pg_temp.key('leg1'))->>'pin',true);
select ok(current_setting('tests.pin203') ~ '^[0-9]{6}$','Server issues a 6-digit code to this passenger');
select lives_ok($$select public.ride_chat_send(pg_temp.key('leg1'),'Estou no ponto combinado.',pg_temp.key('msg'))$$,'Protected assigned-pair chat works');
select tests.authenticate_as('provider_b');
select is(public.ride_shared_progress(current_setting('tests.share203')),null::jsonb,'Leaked invite cannot be read by another account');
select tests.authenticate_as('client_b');
select is(public.ride_shared_progress(current_setting('tests.share203'))->>'status','arriving','Confirmed invitee sees only their shared leg');
select ok(public.ride_shared_progress(current_setting('tests.share203'))::text not like '%Saúde%','Share omits residential route labels');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.ride_transition(pg_temp.key('leg1'),'boarded',gen_random_uuid())$$,'P0001','ride_pin_required','Earlier boarding entry point cannot bypass PIN');
select is(public.ride_verify_boarding(pg_temp.key('leg1'),'wrong!',gen_random_uuid())->>'ok','false','Invalid PIN cannot board');
select is(public.ride_communication(pg_temp.key('leg1'))#>>'{messages,0,text}','Estou no ponto combinado.','Driver receives message without customer phone');
select tests.clear_authentication();
select is((select failures from private.ride_pins where leg=pg_temp.key('leg1')),1,'Wrong PIN attempt persists');
update private.ride_pins set expires_at=now()-interval '1 minute' where leg=pg_temp.key('leg1');
select tests.authenticate_as('provider_c');
select is(public.ride_verify_boarding(pg_temp.key('leg1'),current_setting('tests.pin203'),gen_random_uuid())->>'reason','unavailable','Expired PIN is refused');
select tests.authenticate_as('client_a');
select set_config('tests.help203',public.ride_open_help(pg_temp.key('leg1'),'safety')::text,true);
select tests.authenticate_as('admin');
select public.admin_ride_support_action(current_setting('tests.help203')::uuid,'claim',null);
select set_config('tests.recovery203',public.ride_recover_pin(pg_temp.key('leg1'),current_setting('tests.help203')::uuid,'VERIF-203')->>'pin',true);
select tests.authenticate_as('provider_c');
select is(public.ride_verify_boarding(pg_temp.key('leg1'),current_setting('tests.recovery203'),pg_temp.key('board'))->>'ok','true','Recovered PIN completes normal server transition');
select is(public.ride_verify_boarding(pg_temp.key('leg1'),current_setting('tests.recovery203'),pg_temp.key('board'))->>'replayed','true','Retry of committed boarding is idempotent');
select is(public.ride_verify_boarding(pg_temp.key('leg1'),current_setting('tests.recovery203'),gen_random_uuid())->>'reason','used','Used PIN cannot be used for a new operation');
select tests.authenticate_as('client_a');
select is(public.ride_safety_status(pg_temp.key('leg1'))->>'wellness','stale_signal','Stale or absent GPS prompts a check and never fabricates a location');
select ok(public.ride_wellness_ack(pg_temp.key('leg1')),'Passenger can dismiss false positive');
select is(public.ride_safety_status(pg_temp.key('leg1'))->>'wellness',null,'Acknowledged check is suppressed');
select tests.clear_authentication();
update private.ride_wellness_ack set at=now()-interval '15 minutes';
insert into private.ride_observations values(pg_temp.key('leg1'),now()-interval '5 minutes',-23.60,-46.63,10,true),(pg_temp.key('leg1'),now(),-23.60,-46.63,10,true);
insert into private.ride_safety_paths values(pg_temp.key('leg1'),'[[-23.70,-46.80],[-23.72,-46.82]]',250,'TEST-ROUTE',now()+interval '1 hour');
select tests.authenticate_as('client_a');
select is(public.ride_safety_status(pg_temp.key('leg1'))->>'wellness','route_deviation','Recent position away from a verified route triggers a check');
select tests.clear_authentication();
delete from private.ride_safety_paths where leg=pg_temp.key('leg1');
select tests.authenticate_as('client_a');
select is(public.ride_safety_status(pg_temp.key('leg1'))->>'wellness','long_stop','Sustained stationary samples prompt a check');
select set_config('tests.lost203',public.ride_safety_case(pg_temp.key('leg1'),'lost_item',pg_temp.key('lost'))::text,true);
select tests.authenticate_as('provider_c');
select is(public.ride_safety_status(pg_temp.key('leg1'))->'lost_checks','[]'::jsonb,'Uninvited participant cannot read the lost-property report');
select tests.authenticate_as('admin');
select public.admin_ride_support_action(current_setting('tests.lost203')::uuid,'claim',null);
select public.ride_case_update(current_setting('tests.lost203')::uuid,'request_item_check',null,pg_temp.key('locate'));
select tests.authenticate_as('provider_c');
select is(public.ride_safety_status(pg_temp.key('leg1'))#>>'{lost_checks,0,protocol}',current_setting('tests.lost203'),'Staff can mediate a lost-item check without providing private contact');
select lives_ok($$select public.ride_case_update(current_setting('tests.lost203')::uuid,'item_found',null,pg_temp.key('found'))$$,'Invited counterpart answers the mediated check');
select tests.authenticate_as('client_a');
select set_config('tests.inc203',public.ride_safety_case(pg_temp.key('leg1'),'accident',pg_temp.key('accident'))::text,true);
select is(public.ride_safety_case(pg_temp.key('leg1'),'accident',pg_temp.key('accident'))::text,current_setting('tests.inc203'),'Retries create a single confidential accident');
select ok(public.ride_safety_status(pg_temp.key('leg1'))#>>'{policy,insurer}'='Seguradora fictícia','Policy publishes insurer, exclusions and territory');
select public.ride_case_update(current_setting('tests.inc203')::uuid,'request_claim',null,pg_temp.key('insurer'));
select public.ride_recording_notice(pg_temp.key('leg1'),true);
select throws_ok($$select public.ride_attach_incident(current_setting('tests.inc203')::uuid,'audio/webm','GkXfo2ZpeHR1cmVhdWRpbw==',pg_temp.key('audio'))$$,'P0001','ride_recording_notice_required','Audio requires notice acknowledged by both occupants');
select tests.authenticate_as('provider_c');
select public.ride_recording_notice(pg_temp.key('leg1'),true);
select tests.authenticate_as('client_a');
select set_config('tests.media203',public.ride_attach_incident(current_setting('tests.inc203')::uuid,'audio/webm','GkXfo2ZpeHR1cmVhdWRpbw==',pg_temp.key('audio'))::text,true);
select is(public.ride_incident_file(current_setting('tests.media203')::uuid)->>'content','GkXfo2ZpeHR1cmVhdWRpbw==','Reporter can download original synthetic evidence');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_incident_file(current_setting('tests.media203')::uuid)$$,'P0001','not_allowed','Other payer cannot read incident media');
select tests.authenticate_as('admin');
select public.admin_ride_support_action(current_setting('tests.inc203')::uuid,'claim',null);
select lives_ok($$select public.ride_case_update(current_setting('tests.inc203')::uuid,'claim_registered','SIM-PROTOCOL',pg_temp.key('claim'))$$,'Staff records an external training claim reference with consent');
select set_config('tests.restrict203',public.admin_ride_restrict(current_setting('tests.inc203')::uuid,'driver','safety','EVID-203',3)::text,true);
select tests.authenticate_as('provider_c');
select ok(public.ride_appeal(current_setting('tests.restrict203')::uuid,'decision_review'),'Driver files an appeal');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_ride_decide_appeal(current_setting('tests.restrict203')::uuid,true,'REVIEW-203')$$,'P0001','not_allowed','Original operator may not decide their own review');
select tests.authenticate_as('safety_reviewer');
select ok(public.admin_ride_decide_appeal(current_setting('tests.restrict203')::uuid,true,'REVIEW-203'),'Another staffed operator grants an appeal');
select tests.authenticate_as('client_a');
-- PAR-602 (110608): with no certified adapted capacity the requirement is refused, never promised.
select throws_ok($$select public.ride_set_access(pg_temp.key('leg2'),'visual','wheelchair_vehicle',true)$$,'P0001','ride_assistance_unavailable','No certified adapted capacity is shown when unavailable');
select tests.clear_authentication();
-- Fixture: the requirement as a legitimate request of the passenger freezes it, for the pairing checks below.
insert into private.ride_access_preferences(leg,owner_id,cue,assistance,share_cue) values(pg_temp.key('leg2'),tests.uid('client_a'),'visual','wheelchair_vehicle',true)
 on conflict(leg) do update set cue=excluded.cue,assistance=excluded.assistance,share_cue=excluded.share_cue;
select ok(not private.ride_safety_can_pair(tests.uid('provider_c'),l),'An incompatible vehicle alone cannot match') from public.ride_legs l where l.id=pg_temp.key('leg2');
insert into private.ride_driver_credentials(driver_id,vehicle_identifier,vehicle_category,driver_document_ref,vehicle_document_ref,insurance_ref,driver_until,vehicle_until,insurance_until,inspected_by)
 values(tests.uid('provider_c'),'QA-vehicle','sedan','QA-driver','QA-vehicle','QA-policy',current_date+1,current_date+1,current_date+1,tests.uid('admin'));
insert into private.ride_assist_capabilities values(tests.uid('provider_c'),'QA-vehicle','wheelchair_vehicle','TRAIN-203','VEH-203',now()+interval '1 day');
select ok(private.ride_safety_can_pair(tests.uid('provider_c'),l),'Verified vehicle and training unlock a compatible pairing') from public.ride_legs l where l.id=pg_temp.key('leg2');
select tests.authenticate_as('client_a');
select ok(public.ride_block_pair(pg_temp.key('leg1'),true),'Passenger blocks new pairing');
select tests.clear_authentication();
select ok(not private.ride_offer_eligible(tests.uid('provider_c'),l),'Blocked pair never becomes a new offer') from public.ride_legs l where l.id=pg_temp.key('leg2');
select throws_ok($$update public.ride_legs set driver_id=tests.uid('provider_c') where id=pg_temp.key('leg2')$$,'P0001','ride_pair_unavailable','Server rejects direct assignment to blocked/incompatible driver');
select tests.authenticate_as('client_a');
select ok(not public.ride_block_pair(pg_temp.key('leg1'),false),'Passenger can remove their own block');
select public.ride_set_access(pg_temp.key('leg2'),'text','none',false);
select tests.clear_authentication();
update public.ride_legs set status='completed' where id=pg_temp.key('leg1');
select tests.authenticate_as('client_b');
select is(public.ride_shared_progress(current_setting('tests.share203')),null::jsonb,'End of trip immediately closes invite');
select tests.authenticate_as('client_a');
select ok(public.ride_rate_pair(pg_temp.key('leg1'),4),'Passenger rates the driver');
select throws_ok($$select public.ride_rate_pair(pg_temp.key('leg1'),2)$$,'P0001','ride_already_rated','One final rating per direction');
select tests.authenticate_as('provider_c');
select ok(public.ride_rate_pair(pg_temp.key('leg1'),5),'Driver may independently rate the passenger');
select tests.clear_authentication();
select is((select count(*) from private.ride_directional_ratings where leg=pg_temp.key('leg1')),2::bigint,'Two directions produce exactly two ratings');
select ok(not exists(select from private.ride_chat where leg=pg_temp.key('leg1')),'Private chat is purged on closure');
select ok(not exists(select from private.ride_incident_media where encrypted=decode('GkXfo2ZpeHR1cmVhdWRpbw==','base64')),'Stored evidence is encrypted');
update private.ride_incident_media set expires_at=now()-interval '1 day';
insert into private.ride_incident_media_holds values(current_setting('tests.media203')::uuid,'HOLD-203','Custódia de ensaio',now()+interval '1 hour');
select private.purge_ride_safety();
select is((select count(*) from private.ride_incident_media),1::bigint,'Scoped hold preserves evidence after routine expiry');
update private.ride_incident_media_holds set until_at=now()-interval '1 minute';
select private.purge_ride_safety();
select is((select count(*) from private.ride_incident_media),0::bigint,'Expired hold permits evidence purge');
-- Change of assigned driver invalidates a PIN, old chat and all invites.
select tests.authenticate_as('client_a');
select set_config('tests.replacement_ride203',public.ride_consent((public.ride_quote(gen_random_uuid(),null,null,
 '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]')->>'id')::uuid,true)->>'ride_id',true);
select tests.clear_authentication();
select set_config('tests.replacement_leg203',id::text,true) from public.ride_legs where ride_id=current_setting('tests.replacement_ride203')::uuid;
select tests.authenticate_as('provider_c');
select public.ride_accept_offer(current_setting('tests.replacement_leg203')::uuid,gen_random_uuid());
select public.ride_transition(current_setting('tests.replacement_leg203')::uuid,'arriving',gen_random_uuid());
select tests.authenticate_as('client_a');
select set_config('tests.old203',public.ride_issue_pin(current_setting('tests.replacement_leg203')::uuid)->>'pin',true);
select set_config('tests.old_invite203',public.ride_share_invite(current_setting('tests.replacement_leg203')::uuid,'client_b@test.local',5)->>'token',true);
select set_config('tests.history_lost203',public.ride_safety_case(current_setting('tests.replacement_leg203')::uuid,'lost_item',gen_random_uuid())::text,true);
select set_config('tests.history_accident203',public.ride_safety_case(current_setting('tests.replacement_leg203')::uuid,'accident',gen_random_uuid())::text,true);
select tests.authenticate_as('admin');
select public.admin_ride_support_action(current_setting('tests.history_lost203')::uuid,'claim',null);
select public.ride_case_update(current_setting('tests.history_lost203')::uuid,'request_item_check',null,gen_random_uuid());
select public.admin_ride_support_action(current_setting('tests.history_accident203')::uuid,'claim',null);
select tests.clear_authentication();
update public.ride_legs set status='requested',driver_id=null where id=current_setting('tests.replacement_leg203')::uuid;
select ok(not exists(select from private.ride_pins where leg=current_setting('tests.replacement_leg203')::uuid),'Assignment change invalidates the earlier PIN');
select tests.authenticate_as('client_b');
select is(public.ride_shared_progress(current_setting('tests.old_invite203')),null::jsonb,'Reassignment also withdraws an existing trusted invite');
select tests.clear_authentication();
select is((select count(*) from private.ride_pins where consumed_at is not null and length(digest)>0),0::bigint,'A consumed code retains proof but no reusable digest');
-- Fixture (PAR-602, 110608): a driver on a declared shift trained for boarding help makes the
-- request below a legitimate one; it goes off shift once the quote is accepted.
select tests.create_user('assist_203');
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('assist_203'),'simulation','sedan','approved',private.sp_date(now())+3,tests.uid('admin'),true);
insert into private.ride_driver_credentials(driver_id,vehicle_identifier,vehicle_category,driver_document_ref,vehicle_document_ref,insurance_ref,driver_until,vehicle_until,insurance_until,inspected_by)
 values(tests.uid('assist_203'),'ASSIST-203','sedan','DOC-203A','ASSIST-203','POLICY-203A',private.sp_date(now())+3,private.sp_date(now())+3,private.sp_date(now())+3,tests.uid('admin'));
insert into private.ride_assist_capabilities values(tests.uid('assist_203'),'ASSIST-203','boarding','TRAIN-203A','VEH-203A',now()+interval '1 day');
insert into private.ride_driver_shifts(driver_id,area,period) values(tests.uid('assist_203'),'Saúde',tstzrange(now()-interval '5 minutes',now()+interval '3 hours'));
select tests.authenticate_as('client_b');
select set_config('tests.assistquote203',public.ride_quote_with_access(pg_temp.key('req-access'),null,null,'[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]','boarding')->>'id',true);
select lives_ok($$select public.ride_consent(current_setting('tests.assistquote203')::uuid,true)$$,'Passenger accepts a priced quote with a functional requirement before dispatch');
select tests.clear_authentication();
update public.ride_drivers set online=false where id=tests.uid('assist_203');
delete from private.ride_driver_shifts where driver_id=tests.uid('assist_203');
select ok(exists(select from private.ride_access_preferences p join public.ride_legs l on l.id=p.leg join public.rides r on r.id=l.ride_id where r.quote_id=current_setting('tests.assistquote203')::uuid and p.assistance='boarding'),
 'Every new leg receives the frozen assistance requirement atomically');
-- New driver may serve the same leg, but cannot inherit an old safety case.
select tests.authenticate_as('provider_d');
select public.ride_apply_driver('compact');
select tests.authenticate_as('admin');
select public.ride_review_driver(tests.uid('provider_d'),true,current_date+1);
select tests.authenticate_as('provider_d');
select public.ride_set_online(true);
select public.ride_accept_offer(current_setting('tests.replacement_leg203')::uuid,gen_random_uuid());
select is(public.ride_safety_status(current_setting('tests.replacement_leg203')::uuid)->'lost_checks','[]'::jsonb,'Replacement driver cannot see the earlier property case');
select throws_ok($$select public.ride_case_update(current_setting('tests.history_lost203')::uuid,'item_found',null,gen_random_uuid())$$,
 'P0001','not_allowed','Replacement cannot act on an earlier property request even with the protocol');
select tests.authenticate_as('admin');
select set_config('tests.history_review203',public.admin_ride_restrict(current_setting('tests.history_accident203')::uuid,'driver','conduct','CASE-203D',2)::text,true);
select tests.authenticate_as('provider_d');
select throws_ok($$select public.ride_appeal(current_setting('tests.history_review203')::uuid,'decision_review')$$,'P0001','not_allowed',
 'Restriction on earlier incident never applies to the replacement');
select tests.authenticate_as('provider_c');
select ok(public.ride_appeal(current_setting('tests.history_review203')::uuid,'new_evidence'),'Original assigned driver may appeal');
select tests.authenticate_as('safety_reviewer');
select ok(public.admin_ride_decide_appeal(current_setting('tests.history_review203')::uuid,false,'DENIAL-203'),'Independent reviewer can maintain decision for the original driver');
select tests.clear_authentication();
select is((select appeal_state from private.ride_restrictions where id=current_setting('tests.history_review203')::uuid),'maintained','Denied appeal retains the stated outcome');
select * from finish();
rollback;
