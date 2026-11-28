-- O17 follow-up · DD122 (rebook cap after contingency). A passenger could rebook a reservation
-- after each missed confirmation deadline at the frozen price as often as the 30-day horizon and
-- the demand rule allowed. Each area policy now caps the contingency rebooks of a leg
-- (max_rebooks, default 2). The count is derived from the 'rebook' rows of
-- private.ride_reserve_events, unique per operation key, so a replay never counts twice. At the
-- cap rebook raises ride_rebook_limit and the state no longer offers it; keep_searching and
-- cancel stay. Only simulation has policies; live gets no enabling row.
alter table private.ride_reserve_policies add column max_rebooks smallint not null default 2 check(max_rebooks between 0 and 10);
update private.ride_reserve_policies set max_rebooks=2 where environment='simulation' and evidence_ref='ficticio-o17-e6';

-- Rebooks still allowed on the leg under the current enabled policy of its area; null without one.
create function private.ride_rebooks_left(p_leg uuid) returns int language sql stable security definer set search_path='' as $$
 select greatest(p.max_rebooks-(select count(*)::int from private.ride_reserve_events e where e.leg_id=t.leg_id and e.action='rebook'),0)
 from private.ride_reserve_terms t join private.ride_reserve_policies p on p.environment=t.environment and p.area=t.area and p.enabled
 where t.leg_id=p_leg
$$;

alter function public.ride_reserve_contingency(uuid,text,timestamptz,uuid) rename to ride_reserve_contingency_before_rebook_cap;
alter function public.ride_reserve_contingency_before_rebook_cap(uuid,text,timestamptz,uuid) set schema private;
-- Same locks and order as the wrapped function (key, profile, leg, terms), so two rebooks of
-- the leg are serialized and the count is read after the lock. A stored answer of this key is
-- left to the wrapped function, which replays it even at the cap.
create function public.ride_reserve_contingency(p_leg uuid,p_choice text,p_new_pickup timestamptz,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); l public.ride_legs;
begin
 if p_choice='rebook' and p_leg is not null and p_key is not null and p_new_pickup is not null and private.ride_active_user(v_uid) then
   perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_key::text,0));
   perform private.ride_lock_live_profile();
   select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
   if found and exists(select from public.rides r where r.id=l.ride_id and r.passenger_id=v_uid)
      and not exists(select from private.ride_reserve_events where operation_key=p_key and action in ('keep_searching','rebook','cancel'))
      and not exists(select from private.ride_reserve_shifts where id=p_key)
      and exists(select from private.ride_reserve_terms where leg_id=l.id and state='contingency')
      and private.ride_rebooks_left(l.id)=0 then raise exception 'ride_rebook_limit'; end if;
 end if;
 return private.ride_reserve_contingency_before_rebook_cap(p_leg,p_choice,p_new_pickup,p_key);
end $$;

alter function public.ride_reserve_state(uuid) rename to ride_reserve_state_before_rebook_cap;
alter function public.ride_reserve_state_before_rebook_cap(uuid) set schema private;
-- Adds the cap, the rebooks used and left, and the contingency choices the passenger has now.
create function public.ride_reserve_state(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v jsonb:=private.ride_reserve_state_before_rebook_cap(p_leg); v_left int;
begin
 if v is null then return null; end if;
 v_left:=private.ride_rebooks_left(p_leg);
 return v||jsonb_build_object(
   'max_rebooks',(select p.max_rebooks from private.ride_reserve_terms t join private.ride_reserve_policies p
      on p.environment=t.environment and p.area=t.area and p.enabled where t.leg_id=p_leg),
   'rebooks_used',(select count(*)::int from private.ride_reserve_events where leg_id=p_leg and action='rebook'),
   'rebooks_left',v_left,
   'choices',case when (v->>'can_decide')::boolean then
      jsonb_build_array('keep_searching')||case when coalesce(v_left,0)>0 then jsonb_build_array('rebook') else '[]'::jsonb end||jsonb_build_array('cancel')
      else '[]'::jsonb end);
end $$;

revoke all on function private.ride_rebooks_left(uuid),private.ride_reserve_contingency_before_rebook_cap(uuid,text,timestamptz,uuid),
 private.ride_reserve_state_before_rebook_cap(uuid) from public,anon,authenticated,service_role;
revoke all on function public.ride_reserve_contingency(uuid,text,timestamptz,uuid),public.ride_reserve_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ride_reserve_contingency(uuid,text,timestamptz,uuid),public.ride_reserve_state(uuid) to authenticated;
