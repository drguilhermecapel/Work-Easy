-- O17 stage 6 · final review of the review fixes (110608, 110609). Two bodies are replaced
-- in place; no table, no seed, no new name.
--
-- PAR-604 (terminal): the frozen drop-off terminal of a reserve still refused any new
-- destination without an airport rule before boarding, so a scheduled ride to the airport
-- could no longer be redirected to an ordinary area as in stages 1-5. Only a new destination
-- that is itself a terminal (it has an airport rule row, usable or not) must be a terminal of
-- the same airport with its own enabled rule valid through the end of the leg. An ordinary
-- area goes through the stage-1 amendment and its consents; the reserve terms then lose the
-- terminal (sync_ride_reserve_terms recomputes them).
create or replace function private.check_ride_terminal_change() returns trigger language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; c private.ride_route_cases; t private.ride_reserve_terms; v_until timestamptz; v_issue text;
begin
 select * into l from public.ride_legs where id=new.leg_id;
 select * into c from private.ride_route_cases where id=new.route_id;
 if l.id is null or c.id is null then return new; end if;
 v_until:=greatest(now(),new.pickup_at)+make_interval(mins=>new.remaining_minutes);
 if new.requested_pickup is not null and private.ride_terminal_closed_at(l.environment,c.origin_area,new.pickup_at) then
   raise exception 'ride_reserve_window'; end if;
 select * into t from private.ride_reserve_terms where leg_id=l.id;
 if t.terminal is not null and c.destination_area is distinct from l.destination
    and exists(select from private.ride_airport_rules r where r.environment=l.environment and r.pickup_area=l.destination and r.name=t.terminal)
    and exists(select from private.ride_airport_rules n where n.environment=l.environment and n.pickup_area=c.destination_area) then
   v_issue:=private.ride_terminal_change_issue(l.environment,l.destination,c.destination_area,v_until,l.status='boarded');
 end if;
 if v_issue is not null then raise exception '%',v_issue; end if;
 return new;
end $$;

-- PAR-602 (wait): an assistance added to a waiting leg through ride_set_access recorded its
-- boarding minutes but left the frozen price rule alone, so assisted boarding was billed as
-- waiting (the wait charge reads quote.price_rules[quote_seq].free_wait_minutes). Whenever
-- the leg's boarding minutes change, its rule now grants exactly those minutes on top of the
-- rule's own free wait, marked as assisted_boarding_minutes like the quote door does; 'none'
-- gives the rule back its own value. The quote is locked before the leg (quote → leg order).
create or replace function public.ride_set_access(p_leg uuid,p_cue text,p_assistance text,p_share boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['passenger']); r public.rides; c private.ride_route_cases; k private.ride_markets;
 v_previous text; v_mode text; v_minutes int; v_result jsonb; v_quote uuid; v_seq text; v_before int; v_after int;
begin
 select coalesce(l.source_quote_id,x.quote_id),coalesce(l.quote_seq,l.seq)::text into v_quote,v_seq from public.rides x where x.id=l.ride_id;
 perform 1 from private.ride_quotes where id=v_quote for no key update;
 select * into strict l from public.ride_legs where id=p_leg for update;
 select * into strict r from public.rides where id=l.ride_id;
 select assistance,boarding_minutes into v_previous,v_before from private.ride_access_preferences where leg=l.id;
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
 select boarding_minutes into v_after from private.ride_access_preferences where leg=l.id;
 if coalesce(v_after,0)<>coalesce(v_before,0) then
   update private.ride_quotes q set price_rules=jsonb_set(q.price_rules,array[v_seq],
       (q.price_rules->v_seq)-'assisted_boarding_minutes'||jsonb_build_object('free_wait_minutes',
         coalesce((q.price_rules#>>array[v_seq,'free_wait_minutes'])::int,0)-coalesce((q.price_rules#>>array[v_seq,'assisted_boarding_minutes'])::int,0)
         +coalesce(v_after,0))
       ||case when coalesce(v_after,0)>0 then jsonb_build_object('assisted_boarding_minutes',v_after) else '{}'::jsonb end)
     where q.id=v_quote and jsonb_typeof(q.price_rules->v_seq)='object';
 end if;
 return v_result;
end $$;

revoke all on function private.check_ride_terminal_change() from public,anon,authenticated,service_role;
revoke all on function public.ride_set_access(uuid,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.ride_set_access(uuid,text,text,boolean) to authenticated;
