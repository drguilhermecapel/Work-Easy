create table private.ride_access_preferences(
 leg uuid primary key references public.ride_legs(id),owner_id uuid not null,cue text not null check(cue in ('text','visual','sound')),
 assistance text not null check(assistance in ('none','boarding','folding_equipment','wheelchair_vehicle')),share_cue boolean not null
);
-- A qualified reviewer provisions evidence for a specific vehicle, driver and
-- period. Pets, disability labels or medical diagnoses are not eligibility inputs.
create table private.ride_assist_capabilities(
 driver_id uuid not null references public.ride_drivers(id),vehicle_ref text not null,
 capability text not null check(capability in ('boarding','folding_equipment','wheelchair_vehicle')),training_ref text not null,
 vehicle_ref_evidence text not null,until_at timestamptz not null,primary key(driver_id,capability)
);
create table private.ride_pair_blocks(actor uuid not null,other uuid not null,leg uuid not null references public.ride_legs(id),at timestamptz not null default now(),primary key(actor,other),check(actor<>other));
create table private.ride_directional_ratings(leg uuid not null references public.ride_legs(id),direction text not null check(direction in ('passenger','driver')),
 stars smallint not null check(stars between 1 and 5),at timestamptz not null default now(),primary key(leg,direction));
insert into private.ride_directional_ratings select leg_id,'passenger',stars,created_at from private.ride_ratings;
create table private.ride_restrictions(
 id uuid primary key default gen_random_uuid(),subject uuid not null,environment text not null,protocol uuid not null references private.ride_case_details(protocol),
 decided_by uuid not null,reason text not null check(reason in ('identity','safety','conduct','qualification')),proof_ref text not null check(proof_ref ~ '^[A-Za-z0-9_-]{4,80}$'),
 notified_at timestamptz not null default now(),until_at timestamptz not null,appeal_until timestamptz not null,appeal_state text not null default 'available',
 appeal_reason text,reviewed_by uuid,review_ref text,reviewed_at timestamptz,unique(subject,protocol)
);
create function private.ride_safety_can_pair(driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from public.rides r where r.id=l.ride_id and not exists(select from private.ride_pair_blocks b
   where (b.actor=driver and b.other=r.passenger_id) or (b.actor=r.passenger_id and b.other=driver))
   and not exists(select from private.ride_restrictions s where s.subject in (driver,r.passenger_id) and s.environment=l.environment
     and s.until_at>now() and s.appeal_state<>'lifted') and not exists(select from private.ride_access_preferences p where p.leg=l.id and p.assistance<>'none'
     and not exists(select from private.ride_assist_capabilities a join private.ride_driver_credentials c on c.driver_id=a.driver_id and c.vehicle_identifier=a.vehicle_ref
       where a.driver_id=driver and a.capability=p.assistance and a.until_at>=greatest(now(),upper(l.slot)))))
$$;
alter function private.ride_offer_eligible(uuid,public.ride_legs) rename to ride_before_safety_eligible;
create function private.ride_offer_eligible(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select private.ride_safety_can_pair(p_driver,l) and private.ride_before_safety_eligible(p_driver,l)
$$;
create function private.ride_assignment_safety() returns trigger language plpgsql security definer set search_path='' as $$
declare passenger uuid;
begin
 select passenger_id into passenger from public.rides where id=new.ride_id;
 perform pg_advisory_xact_lock(hashtextextended(least(passenger,new.driver_id)::text||greatest(passenger,new.driver_id)::text,0));
 if not private.ride_safety_can_pair(new.driver_id,new) then raise exception 'ride_pair_unavailable'; end if;
 return new;
end $$;
create trigger ride_assignment_safety before update of driver_id on public.ride_legs for each row
 when(new.driver_id is not null and new.driver_id is distinct from old.driver_id) execute function private.ride_assignment_safety();
create function public.ride_set_access(p_leg uuid,p_cue text,p_assistance text,p_share boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['passenger']); previous private.ride_access_preferences; available boolean;
begin
 select * into strict l from public.ride_legs where id=p_leg for update;
 select * into previous from private.ride_access_preferences where leg=l.id;
 if p_cue is null or p_cue not in ('text','visual','sound') or p_assistance is null or p_assistance not in ('none','boarding','folding_equipment','wheelchair_vehicle') or p_share is null then raise exception 'invalid_input'; end if;
 if l.status not in ('requested','accepted','arriving','boarded') or (l.status<>'requested' and p_assistance<>'none' and p_assistance is distinct from previous.assistance)
   then raise exception 'ride_assistance_requote'; end if;
 insert into private.ride_access_preferences values(l.id,auth.uid(),p_cue,p_assistance,p_share)
  on conflict(leg) do update set cue=excluded.cue,assistance=excluded.assistance,share_cue=excluded.share_cue;
 select p_assistance='none' or exists(select from private.ride_assist_capabilities cap join public.ride_drivers d on d.id=cap.driver_id
   join private.ride_driver_credentials c on c.driver_id=d.id and cap.vehicle_ref=c.vehicle_identifier
   where d.environment=l.environment and cap.capability=p_assistance and private.ride_offer_eligible(d.id,l)) into available;
 return jsonb_build_object('available',available,'fee_cents',0);
end $$;
create function public.ride_trust_overview(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['passenger','driver']); passenger uuid; p private.ride_access_preferences; role text;other uuid;
begin
 select passenger_id into passenger from public.rides where id=l.ride_id;
 role:=case when auth.uid()=passenger then 'passenger' else 'driver' end; other:=case when role='driver' then passenger else l.driver_id end;
 select * into p from private.ride_access_preferences where leg=l.id;
 return jsonb_build_object('role',role,'can_rate',l.status='completed' and other is not null,'my_stars',(select stars from private.ride_directional_ratings where leg=l.id and direction=role),
 'can_block',other is not null,'blocked',exists(select from private.ride_pair_blocks b where b.actor=auth.uid() and b.other=other),
 'cue',case when role='passenger' or p.share_cue then p.cue end,'assistance',p.assistance,'sharing',p.share_cue,
 'restrictions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'reason',s.reason,'until',s.until_at,'appeal_until',s.appeal_until,'state',s.appeal_state)) from private.ride_restrictions s
   where s.subject=auth.uid() and s.environment=l.environment and (s.until_at>now() or s.reviewed_at>now()-interval '7 days')),'[]'));
end $$;
create function public.ride_rate_pair(p_leg uuid,p_stars int) returns boolean language plpgsql security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['driver','passenger']); role text; old int;
begin
 if l.status<>'completed' or l.driver_id is null or p_stars not between 1 and 5 or p_stars is null then raise exception 'not_allowed'; end if;
 role:=case when auth.uid()=l.driver_id then 'driver' else 'passenger' end;
 insert into private.ride_directional_ratings(leg,direction,stars) values(l.id,role,p_stars) on conflict do nothing;
 select stars into old from private.ride_directional_ratings where leg=l.id and direction=role;
 if old<>p_stars then raise exception 'ride_already_rated'; end if;
 if role='passenger' then insert into private.ride_ratings values(l.id,p_stars,now()) on conflict do nothing; end if;
 return true;
end $$;
create or replace function public.ride_rate(p_leg uuid,p_stars int) returns void language plpgsql security definer set search_path='' as $$
begin perform private.safety_leg(p_leg,array['passenger']);perform public.ride_rate_pair(p_leg,p_stars);end $$;
create function public.ride_block_pair(p_leg uuid,p_enable boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['passenger','driver']); counterpart uuid; passenger uuid;
begin
 select passenger_id into passenger from public.rides where id=l.ride_id;
 if l.driver_id is null or p_enable is null then raise exception 'not_allowed'; end if;
 counterpart:=case when auth.uid()=passenger then l.driver_id else passenger end;
 perform pg_advisory_xact_lock(hashtextextended(least(counterpart,auth.uid())::text||greatest(counterpart,auth.uid())::text,0));
 if p_enable then insert into private.ride_pair_blocks(actor,other,leg) values(auth.uid(),counterpart,l.id) on conflict do nothing;
 else delete from private.ride_pair_blocks where actor=auth.uid() and private.ride_pair_blocks.other=counterpart; end if;
 return p_enable;
end $$;
create function public.admin_ride_restrict(p_protocol uuid,p_subject text,p_reason text,p_evidence text,p_days int) returns uuid
language plpgsql security definer set search_path='' as $$
declare op uuid:=private.safety_operator(); c private.ride_support_cases; subj uuid; result uuid;
begin
 select * into c from private.ride_support_cases where protocol=p_protocol and environment=private.ride_env();
 if c.claimed_by is distinct from op or c.resolved_at is not null or p_subject is null or p_subject not in ('driver','passenger')
   or p_days is null or p_days not between 1 and 30 or p_reason is null or p_reason not in ('identity','safety','conduct','qualification')
   or p_evidence is null or p_evidence !~ '^[A-Za-z0-9_-]{4,80}$' then raise exception 'not_allowed'; end if;
 select case when p_subject='driver' then l.driver_id else r.passenger_id end into subj from public.ride_legs l join public.rides r on r.id=l.ride_id where l.id=c.leg;
 if subj is null or subj=op or not exists(select from private.ride_case_details d where d.protocol=p_protocol and d.category in ('accident','emergency','discrimination','harassment')) then raise exception 'not_allowed'; end if;
 insert into private.ride_restrictions(subject,environment,protocol,decided_by,reason,proof_ref,until_at,appeal_until)
   values(subj,c.environment,p_protocol,op,p_reason,p_evidence,now()+make_interval(days=>p_days),now()+interval '30 days')
   on conflict(subject,protocol) do nothing returning id into result;
 if result is null then select id into result from private.ride_restrictions where subject=subj and protocol=p_protocol and reason=p_reason and proof_ref=p_evidence;
   if result is null then raise exception 'idempotency_conflict'; end if; end if;
 return result;
end $$;
create function public.ride_appeal(p_id uuid,p_reason text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.ride_active_user(auth.uid()) or p_reason is null or p_reason not in ('incorrect_identity','new_evidence','decision_review') then raise exception 'not_allowed'; end if;
 update private.ride_restrictions set appeal_state='pending',appeal_reason=p_reason where id=p_id and subject=auth.uid() and environment=private.ride_env()
    and appeal_until>=now() and (appeal_state='available' or (appeal_state='pending' and appeal_reason=p_reason));
 if not found then raise exception 'not_allowed'; end if;return true;
end $$;
create function public.admin_ride_appeals() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare op uuid:=private.safety_operator();
begin return(select coalesce(jsonb_agg(jsonb_build_object('id',id,'protocol',protocol,'reason',reason,'appeal_reason',appeal_reason,'evidence_ref',proof_ref,'until',until_at) order by notified_at),'[]')
 from private.ride_restrictions where environment=private.ride_env() and appeal_state='pending' and decided_by<>op and subject<>op);end $$;
create function public.admin_ride_decide_appeal(p_id uuid,p_lift boolean,p_evidence text) returns boolean language plpgsql security definer set search_path='' as $$
declare op uuid:=private.safety_operator(); s private.ride_restrictions; state text:=case when p_lift then 'lifted' else 'maintained' end;
begin
 select * into s from private.ride_restrictions where id=p_id and environment=private.ride_env() for update;
 if s.id is null or s.subject=op or s.decided_by=op or p_lift is null or p_evidence is null or p_evidence !~ '^[A-Za-z0-9_-]{4,80}$' then raise exception 'not_allowed'; end if;
 if s.appeal_state=state and s.reviewed_by=op and s.review_ref=p_evidence then return true; end if;
 if s.appeal_state<>'pending' then raise exception 'not_allowed'; end if;
 update private.ride_restrictions set appeal_state=state,review_ref=p_evidence,reviewed_by=op,reviewed_at=now() where id=p_id;return true;
end $$;
create function private.purge_ride_safety() returns void language sql security definer set search_path='' as $$
 delete from private.ride_chat where sent_at<=now()-interval '24 hours';
 delete from private.ride_shares where expires_at<=now() or revoked_at is not null;
 delete from private.ride_safety_paths where expires_at<=now();
 delete from private.ride_incident_media m where m.expires_at<=now() and not exists(select from private.ride_incident_media_holds h where h.media=m.id and h.until_at>now());
 delete from private.ride_pins where consumed_at is null and expires_at<=now()-interval '24 hours';
 delete from private.ride_wellness_ack where at<now()-interval '24 hours';
 delete from private.ride_access_preferences p using public.ride_legs l where l.id=p.leg and l.status in ('completed','cancelled') and l.updated_at<now()-interval '24 hours';
$$;
select cron.schedule('workeasy-ride-safety-retention','*/5 * * * *','select private.purge_ride_safety()');
create function private.on_safety_account_erasure() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from private.ride_chat m using public.ride_legs l,public.rides r where m.leg=l.id and r.id=l.ride_id and new.id in (m.author,m.driver_id,r.passenger_id);
 delete from private.ride_shares where issuer=new.id or driver_id=new.id;
 delete from private.ride_access_preferences where owner_id=new.id;
 delete from private.ride_pair_blocks where new.id in(actor,other);
 delete from private.ride_recording_notices where actor=new.id;
 delete from private.ride_wellness_ack where actor=new.id;
 delete from private.ride_incident_media m where m.uploader=new.id and not exists(select from private.ride_incident_media_holds h where h.media=m.id and h.until_at>now());
 return null;
end $$;
create trigger on_safety_account_erasure after update of deleted_at on public.profiles for each row when(new.deleted_at is not null and old.deleted_at is null)
 execute function private.on_safety_account_erasure();
revoke all on private.ride_access_preferences,private.ride_assist_capabilities,private.ride_pair_blocks,private.ride_directional_ratings,private.ride_restrictions from public,anon,authenticated,service_role;
revoke all on function private.ride_safety_can_pair(uuid,public.ride_legs),private.ride_before_safety_eligible(uuid,public.ride_legs),private.ride_offer_eligible(uuid,public.ride_legs),
 private.ride_assignment_safety(),private.purge_ride_safety(),private.on_safety_account_erasure() from public,anon,authenticated,service_role;
revoke all on function public.ride_set_access(uuid,text,text,boolean),public.ride_trust_overview(uuid),public.ride_rate_pair(uuid,int),public.ride_block_pair(uuid,boolean),
 public.admin_ride_restrict(uuid,text,text,text,int),public.ride_appeal(uuid,text),public.admin_ride_appeals(),public.admin_ride_decide_appeal(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.ride_set_access(uuid,text,text,boolean),public.ride_trust_overview(uuid),public.ride_rate_pair(uuid,int),public.ride_block_pair(uuid,boolean),
 public.admin_ride_restrict(uuid,text,text,text,int),public.ride_appeal(uuid,text),public.admin_ride_appeals(),public.admin_ride_decide_appeal(uuid,boolean,text) to authenticated;

-- Take the functional requirement at quotation so an immediate driver cannot
-- accept an incompatible assignment before the passenger sets a preference.
create table private.ride_access_quotes(quote_id uuid primary key references private.ride_quotes(id) on delete cascade,
 owner_id uuid not null,assistance text not null check(assistance in ('boarding','folding_equipment','wheelchair_vehicle')));
create function public.ride_quote_with_access(p_key uuid,p_booking uuid,p_scheduled_at timestamptz,p_legs jsonb,p_assistance text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare q jsonb; reserved private.ride_quotes;old private.ride_access_quotes;
begin
 if p_assistance is null or p_assistance not in ('boarding','folding_equipment','wheelchair_vehicle') then raise exception 'invalid_input'; end if;
 q:=public.ride_quote(p_key,p_booking,p_scheduled_at,p_legs);
 select * into strict reserved from private.ride_quotes where id=(q->>'id')::uuid for update;
 if reserved.passenger_id<>auth.uid() then raise exception 'not_allowed'; end if;
 select * into old from private.ride_access_quotes where quote_id=reserved.id;
 if found then
   if old.assistance<>p_assistance then raise exception 'idempotency_conflict'; end if;
 elsif reserved.status='awaiting_consent' then insert into private.ride_access_quotes values(reserved.id,auth.uid(),p_assistance);
 else raise exception 'requote_required'; end if;
 return q;
end $$;
create function private.freeze_ride_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.ride_access_preferences(leg,owner_id,cue,assistance,share_cue)
 select new.id,a.owner_id,'text',a.assistance,false from private.ride_access_quotes a
 where a.quote_id=coalesce(new.source_quote_id,(select r.quote_id from public.rides r where r.id=new.ride_id));
 return null;
end $$;
create trigger freeze_ride_access after insert on public.ride_legs for each row execute function private.freeze_ride_access();
revoke all on private.ride_access_quotes from public,anon,authenticated,service_role;
revoke all on function private.freeze_ride_access(), public.ride_quote_with_access(uuid,uuid,timestamptz,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.ride_quote_with_access(uuid,uuid,timestamptz,jsonb,text) to authenticated;

alter function public.ride_export_my_data() rename to ride_export_before_safety;
revoke all on function public.ride_export_before_safety() from public,anon,authenticated,service_role;
create function public.ride_export_my_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb:=public.ride_export_before_safety();me uuid:=auth.uid();
begin
 return data||jsonb_build_object('safety_cases',coalesce((select jsonb_agg(private.safety_case_view(d,me) order by d.opened) from private.ride_case_details d where d.reporter=me),'[]'),
 'my_messages',coalesce((select jsonb_agg(jsonb_build_object('leg',leg,'text',body,'at',sent_at) order by sent_at) from private.ride_chat where author=me),'[]'),
 'access_preferences',coalesce((select jsonb_agg(jsonb_build_object('leg',leg,'cue',cue,'assistance',assistance,'shared',share_cue)) from private.ride_access_preferences where owner_id=me),'[]'),
 'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',id,'reason',reason,'state',appeal_state,'until',until_at,'appeal_until',appeal_until)) from private.ride_restrictions where subject=me),'[]'));
end $$;
create or replace view public.my_ride_data_export with(security_invoker=true) as select auth.uid() as id,public.ride_export_my_data() as mobility where auth.uid() is not null;
revoke all on function public.ride_export_my_data() from public,anon,authenticated,service_role;
grant execute on function public.ride_export_my_data() to authenticated;

create table private.ride_pickup_cues(leg uuid primary key references public.ride_legs(id),driver_id uuid not null,at timestamptz not null default now(),op uuid not null);
create function public.ride_offer_assistance(p_leg uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce(a.assistance,'none') from public.ride_legs l left join private.ride_access_preferences a on a.leg=l.id
  where l.id=p_leg and l.status='requested' and l.environment=private.ride_env() and private.ride_active_user(auth.uid()) and private.ride_offer_eligible(auth.uid(),l)
$$;
create function public.ride_pickup_cue(p_leg uuid,p_key uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['driver']);
begin
 if l.status<>'arriving' or p_key is null or not exists(select from private.ride_pickup_arrivals where leg_id=l.id) then raise exception 'ride_pickup_arrival_required'; end if;
 insert into private.ride_pickup_cues values(l.id,auth.uid(),now(),p_key)
 on conflict(leg) do update set driver_id=excluded.driver_id,at=excluded.at,op=excluded.op
 where private.ride_pickup_cues.driver_id<>auth.uid() or (private.ride_pickup_cues.op<>p_key and private.ride_pickup_cues.at<now()-interval '1 minute');
 return true;
end $$;
create function public.ride_read_cue(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['passenger']);
begin
 return(select jsonb_build_object('at',c.at,'mode',coalesce(a.cue,'text')) from private.ride_pickup_cues c left join private.ride_access_preferences a on a.leg=c.leg
   where c.leg=l.id and c.driver_id=l.driver_id and c.at>now()-interval '10 minutes' and l.status='arriving');
end $$;
revoke all on private.ride_pickup_cues from public,anon,authenticated,service_role;
revoke all on function public.ride_offer_assistance(uuid),public.ride_pickup_cue(uuid,uuid),public.ride_read_cue(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ride_offer_assistance(uuid),public.ride_pickup_cue(uuid,uuid),public.ride_read_cue(uuid) to authenticated;
