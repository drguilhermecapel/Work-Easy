-- Assignment may change after a report. Bind the actual parties at reporting
-- time, never infer an earlier driver from the assignment at review time.
alter table private.ride_case_details add column incident_driver uuid references public.profiles(id) on delete set null,
 add column incident_passenger uuid references public.profiles(id) on delete set null;
update private.ride_case_details d set incident_passenger=r.passenger_id
 from public.ride_legs l join public.rides r on r.id=l.ride_id
 where d.leg=l.id and private.ride_active_user(r.passenger_id);
-- Recover a legacy driver's identity only when that driver made the original
-- report. The remaining legacy records require case evidence for attribution.
update private.ride_case_details set incident_driver=reporter where incident_passenger is not null and reporter<>incident_passenger
 and private.ride_active_user(reporter);

create function private.ride_record_incident_parties() returns trigger language plpgsql security definer set search_path='' as $$
declare l public.ride_legs:=private.lock_safety_leg(new.leg,array['driver','passenger']);
begin
 if new.parent is not null then
   select incident_passenger,incident_driver into new.incident_passenger,new.incident_driver
   from private.ride_case_details where protocol=new.parent and leg=new.leg and reporter=new.reporter;
 else
   select passenger_id,l.driver_id into new.incident_passenger,new.incident_driver from public.rides where id=l.ride_id;
 end if;
 return new;
end $$;
create trigger record_ride_incident_parties before insert on private.ride_case_details for each row
 execute function private.ride_record_incident_parties();

create function private.erase_ride_incident_parties() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.ride_case_details set incident_passenger=null where incident_passenger=new.id;
 update private.ride_case_details set incident_driver=null where incident_driver=new.id;
 return null;
end $$;
create trigger erase_ride_incident_parties after update of deleted_at on public.profiles for each row
 when(new.deleted_at is not null and old.deleted_at is null) execute function private.erase_ride_incident_parties();
revoke all on function private.ride_record_incident_parties(),private.erase_ride_incident_parties() from public,anon,authenticated,service_role;

-- A replacement can neither see nor act on another driver's property checks.
alter function public.ride_safety_status(uuid) set schema private;
revoke all on function private.ride_safety_status(uuid) from public,anon,authenticated,service_role;
create function public.ride_safety_status(p_leg uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select result || jsonb_build_object('lost_checks',coalesce((
   select jsonb_agg(item) from jsonb_array_elements(result->'lost_checks') item
   join private.ride_case_details d on d.protocol=(item->>'protocol')::uuid
   where auth.uid() in (d.incident_driver,d.incident_passenger)
 ),'[]')) from (select private.ride_safety_status(p_leg) result) s
$$;
revoke all on function public.ride_safety_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ride_safety_status(uuid) to authenticated;

create or replace function public.ride_case_update(p_protocol uuid,p_code text,p_reference text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare d private.ride_case_details; c private.ride_support_cases; existing private.ride_case_updates; result uuid; me uuid:=auth.uid();
begin
 select * into d from private.ride_case_details where protocol=p_protocol for update;
 select * into c from private.ride_support_cases where protocol=p_protocol and environment=private.ride_env();
 if d.protocol is null or c.protocol is null or not private.ride_active_user(me) or p_key is null then raise exception 'not_allowed'; end if;
 if (p_code in ('item_found','item_received','request_claim') and d.reporter=me) or
    (p_code in ('item_found','item_received') and me in (d.incident_driver,d.incident_passenger) and d.category='lost_item' and exists(select from private.ride_case_updates u where u.protocol=d.protocol and u.code='request_item_check')) then
   perform private.safety_leg(d.leg,array['passenger','driver']);
 elsif p_code in ('acknowledged','secure_handoff','return_arranged','request_item_check','escalated','insurer_contacted','claim_registered') then
   perform private.safety_operator();
   if c.claimed_by is distinct from me then raise exception 'ride_support_not_owner'; end if;
 else raise exception 'not_allowed'; end if;
 select * into existing from private.ride_case_updates where actor=me and op=p_key;
 if found then
   if existing.protocol<>p_protocol or existing.code<>p_code or existing.reference is distinct from p_reference then raise exception 'idempotency_conflict'; end if;
   return existing.id;
 end if;
 if c.resolved_at is not null or (p_code in ('item_found','item_received','return_arranged','secure_handoff','request_item_check') and d.category<>'lost_item')
   or (p_code in ('request_claim','insurer_contacted','claim_registered') and (d.category<>'accident' or d.policy_id is null))
   or (p_code in ('claim_registered','insurer_contacted') and (p_reference is null or p_reference !~ '^[A-Za-z0-9_-]{4,80}$'
     or not exists(select from private.ride_case_updates u where u.protocol=p_protocol and u.code='request_claim')))
   or (p_code not in ('claim_registered','insurer_contacted') and p_reference is not null) then raise exception 'invalid_case_action'; end if;
 insert into private.ride_case_updates(protocol,actor,op,code,reference) values(p_protocol,me,p_key,p_code,p_reference) returning id into result;
 if c.claimed_by=me then update private.ride_case_details set first_response=coalesce(first_response,now()) where protocol=p_protocol; end if;
 return result;
end $$;

create or replace function public.admin_ride_restrict(p_protocol uuid,p_subject text,p_reason text,p_evidence text,p_days int) returns uuid
language plpgsql security definer set search_path='' as $$
declare op uuid:=private.safety_operator(); c private.ride_support_cases; subj uuid; result uuid;
begin
 select * into c from private.ride_support_cases where protocol=p_protocol and environment=private.ride_env();
 if c.claimed_by is distinct from op or c.resolved_at is not null or p_subject is null or p_subject not in ('driver','passenger')
   or p_days is null or p_days not between 1 and 30 or p_reason is null or p_reason not in ('identity','safety','conduct','qualification')
   or p_evidence is null or p_evidence !~ '^[A-Za-z0-9_-]{4,80}$' then raise exception 'not_allowed'; end if;
 select case when p_subject='driver' then d.incident_driver else d.incident_passenger end into subj from private.ride_case_details d where d.protocol=p_protocol;
 if subj is null or subj=op or not exists(select from private.ride_case_details d where d.protocol=p_protocol and d.category in ('accident','emergency','discrimination','harassment')) then raise exception 'not_allowed'; end if;
 insert into private.ride_restrictions(subject,environment,protocol,decided_by,reason,proof_ref,until_at,appeal_until)
   values(subj,c.environment,p_protocol,op,p_reason,p_evidence,now()+make_interval(days=>p_days),now()+interval '30 days')
   on conflict(subject,protocol) do nothing returning id into result;
 if result is null then select id into result from private.ride_restrictions where subject=subj and protocol=p_protocol and reason=p_reason and proof_ref=p_evidence;
   if result is null then raise exception 'idempotency_conflict'; end if; end if;
 return result;
end $$;
