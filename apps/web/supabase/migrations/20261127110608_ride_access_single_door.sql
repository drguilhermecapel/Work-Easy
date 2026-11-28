-- O17 stage 6 · PAR-602: one behaviour for assistance, whichever door is used. The stage-3
-- calls public.ride_quote_with_access and public.ride_set_access stayed open beside
-- public.ride_quote_accessible: they attached any assistance, the accessible vehicle
-- included, with no market modality, no boarding policy and no equipped vehicle, a promise
-- of accessible transport without a compatible vehicle. Now every quote with an assistance
-- answers through one private routine (the rules of the stage-6 door: modality of the
-- market, boarding policy of the pickup area, an equipped candidate on a declared shift
-- through the end of the leg; any refusal raises, so no quote, access row or mode is left),
-- and a leg only receives a new assistance when the same checks pass. The stage-3 names keep
-- their signatures and grants for their callers. No table, no seed and no new public name.
alter function public.ride_quote_with_access(uuid,uuid,timestamptz,jsonb,text) rename to ride_quote_with_access_before_door;
alter function public.ride_quote_with_access_before_door(uuid,uuid,timestamptz,jsonb,text) set schema private;
alter function public.ride_set_access(uuid,text,text,boolean) rename to ride_set_access_before_door;
alter function public.ride_set_access_before_door(uuid,text,text,boolean) set schema private;

-- The routine of both quote doors: the body of ride_quote_accessible (110603), calling the
-- stage-3 body by its new name. Lock order is that of ride_quote (deployment, profile, quote).
create function private.ride_quote_access_door(p_key uuid,p_booking uuid,p_scheduled_at timestamptz,p_legs jsonb,p_assistance text,p_companion boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('quote'); v_env text; q private.ride_quotes; a private.ride_access_quotes; c private.ride_route_cases;
 v_quote uuid; v_mode text; leg jsonb; v_legs jsonb:='[]'; v_boarding jsonb:='{}'; v_minutes int; v_trip int; v_start timestamptz; v_end timestamptz; v_previous timestamptz;
begin
 if p_key is null or p_companion is null or p_assistance is null or p_assistance not in ('boarding','folding_equipment','wheelchair_vehicle') then
   raise exception 'invalid_input'; end if;
 v_mode:=case when p_assistance='wheelchair_vehicle' then 'wav' else 'assist' end;
 perform singleton from private.ride_deployment for share;
 v_env:=private.ride_env();
 perform 1 from public.profiles where id=v_uid for no key update;
 select * into q from private.ride_quotes where actor_id=v_uid and request_key=p_key;
 if found then
   -- A replay answers only for a quote this routine made with the same choice: the key of a
   -- plain, block or corridor quote never gains an assistance afterwards.
   select * into a from private.ride_access_quotes where quote_id=q.id;
   if not found or a.assistance<>p_assistance or a.companion<>p_companion or not private.ride_quote_has_mode(q.id,v_mode) then
     raise exception 'idempotency_conflict'; end if;
   return private.ride_quote_with_access_before_door(p_key,p_booking,p_scheduled_at,p_legs,p_assistance);
 end if;
 v_quote:=(private.ride_quote_with_access_before_door(p_key,p_booking,p_scheduled_at,p_legs,p_assistance)->>'id')::uuid;
 select * into strict q from private.ride_quotes where id=v_quote for update;
 for leg in select e.value from jsonb_array_elements(q.legs) with ordinality e(value,pos) order by e.pos loop
   v_start:=(leg->>'pickup_at')::timestamptz; v_trip:=(leg->>'duration_minutes')::int;
   -- The previous leg, boarding included, must end before this pickup.
   if v_start<v_previous then raise exception 'invalid_schedule'; end if;
   if private.ride_modality_issue(v_env,v_mode,leg->>'origin',leg->>'destination',v_start+make_interval(mins=>v_trip),v_start) is not null then
     raise exception 'ride_modality_unavailable'; end if;
   v_minutes:=private.ride_access_boarding(v_env,leg->>'origin',p_assistance,v_start,v_trip);
   if leg->>'route_id' is not null then select * into strict c from private.ride_route_cases where id=(leg->>'route_id')::uuid;
   else c:=jsonb_populate_record(null::private.ride_route_cases,jsonb_build_object('environment',v_env,'passenger_id',q.passenger_id,
     'origin_area',leg->>'origin','destination_area',leg->>'destination')); end if;
   c.minutes:=v_trip;
   if v_minutes is null or not private.ride_access_supply(c,v_start,p_assistance,p_companion,v_minutes) then
     raise exception 'ride_assistance_unavailable'; end if;
   v_end:=v_start+make_interval(mins=>v_trip+v_minutes);
   -- A continuation to another service must still start after the longer leg.
   if exists(select from public.bookings nb where nb.id=(leg->>'next_booking_id')::uuid and lower(nb.period)<v_end) then
     raise exception 'invalid_continuation'; end if;
   v_previous:=v_end;
   v_legs:=v_legs||jsonb_build_array(leg||jsonb_build_object('duration_minutes',v_trip+v_minutes));
   v_boarding:=v_boarding||jsonb_build_object(leg->>'seq',v_minutes);
 end loop;
 perform private.ride_requote_legs(q.id,q.legs,q.required_users);
 update private.ride_quotes set legs=v_legs where id=q.id returning * into q;
 update private.ride_access_quotes set companion=p_companion,boarding=v_boarding where quote_id=q.id;
 perform private.ride_attach_quote_mode(q.id,v_mode);
 return private.ride_quote_view(q,v_uid);
end $$;

-- The stage-6 name keeps its signature and its answers; only the body moved.
create or replace function public.ride_quote_accessible(p_key uuid,p_booking uuid,p_scheduled_at timestamptz,p_legs jsonb,p_assistance text,p_companion boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin return private.ride_quote_access_door(p_key,p_booking,p_scheduled_at,p_legs,p_assistance,p_companion); end $$;

-- The stage-3 name, for its callers: the same rules, without a companion. Any other value
-- of p_assistance (null or outside the list) still gets the stage-3 answer, invalid_input.
create function public.ride_quote_with_access(p_key uuid,p_booking uuid,p_scheduled_at timestamptz,p_legs jsonb,p_assistance text)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if p_assistance in ('boarding','folding_equipment','wheelchair_vehicle') then
   return private.ride_quote_access_door(p_key,p_booking,p_scheduled_at,p_legs,p_assistance,false);
 end if;
 return private.ride_quote_with_access_before_door(p_key,p_booking,p_scheduled_at,p_legs,p_assistance);
end $$;

-- The stage-3 preference of a leg. Choosing 'none', keeping the same assistance, the cue and
-- the sharing stay as they were. A new or different assistance is only accepted on a leg that
-- still waits for its driver, and only with the market modality, the boarding policy of the
-- pickup area and an equipped candidate through the end of the leg plus the boarding time;
-- the leg then carries the modality, so offers and assignment keep checking it. Any other
-- state keeps the stage-3 answer (ride_assistance_requote).
create function public.ride_set_access(p_leg uuid,p_cue text,p_assistance text,p_share boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['passenger']); r public.rides; c private.ride_route_cases; k private.ride_markets;
 v_previous text; v_mode text; v_minutes int; v_result jsonb;
begin
 select * into strict l from public.ride_legs where id=p_leg for update;
 select * into strict r from public.rides where id=l.ride_id;
 select assistance into v_previous from private.ride_access_preferences where leg=l.id;
 if p_cue in ('text','visual','sound') and p_share is not null and p_assistance in ('boarding','folding_equipment','wheelchair_vehicle')
    and p_assistance is distinct from v_previous and l.status='requested' then
   v_mode:=case when p_assistance='wheelchair_vehicle' then 'wav' else 'assist' end;
   if private.ride_modality_issue(l.environment,v_mode,l.origin,l.destination,upper(l.slot),l.pickup_at) is not null then
     raise exception 'ride_modality_unavailable'; end if;
   v_minutes:=private.ride_access_boarding(l.environment,l.origin,p_assistance,l.pickup_at,l.duration_minutes);
   if l.route_case_id is not null then select * into c from private.ride_route_cases where id=l.route_case_id; end if;
   if c.id is null then c:=jsonb_populate_record(null::private.ride_route_cases,jsonb_build_object('environment',l.environment,
     'passenger_id',r.passenger_id,'origin_area',l.origin,'destination_area',l.destination)); end if;
   c.minutes:=l.duration_minutes;
   if v_minutes is null or not private.ride_access_supply(c,l.pickup_at,p_assistance,false,v_minutes) then
     raise exception 'ride_assistance_unavailable'; end if;
 end if;
 v_result:=private.ride_set_access_before_door(p_leg,p_cue,p_assistance,p_share);
 if v_mode is not null then
   -- The modality of the new assistance replaces the one of a previous assistance.
   delete from private.ride_leg_modes where leg_id=l.id and modality in ('assist','wav') and modality<>v_mode;
   k:=private.ride_market_for(l.environment,l.origin,l.destination);
   insert into private.ride_leg_modes(leg_id,modality,environment,market,authorization_ref,quote_id)
     select l.id,m.modality,m.environment,m.market,m.authorization_ref,coalesce(l.source_quote_id,r.quote_id) from private.ride_market_modalities m
     where m.environment=l.environment and m.market=k.code and m.modality=v_mode
   on conflict(leg_id,modality) do nothing;
   update private.ride_access_preferences set boarding_minutes=v_minutes,companion=false where leg=l.id;
 elsif p_assistance='none' then
   delete from private.ride_leg_modes where leg_id=l.id and modality in ('assist','wav');
   update private.ride_access_preferences set boarding_minutes=0,companion=false where leg=l.id;
 end if;
 return v_result;
end $$;

revoke all on function private.ride_quote_with_access_before_door(uuid,uuid,timestamptz,jsonb,text),
 private.ride_set_access_before_door(uuid,text,text,boolean),
 private.ride_quote_access_door(uuid,uuid,timestamptz,jsonb,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.ride_quote_accessible(uuid,uuid,timestamptz,jsonb,text,boolean),
 public.ride_quote_with_access(uuid,uuid,timestamptz,jsonb,text),public.ride_set_access(uuid,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.ride_quote_accessible(uuid,uuid,timestamptz,jsonb,text,boolean),
 public.ride_quote_with_access(uuid,uuid,timestamptz,jsonb,text),public.ride_set_access(uuid,text,text,boolean) to authenticated;
