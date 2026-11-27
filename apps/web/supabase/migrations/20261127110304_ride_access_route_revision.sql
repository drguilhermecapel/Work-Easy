-- A route revision keeps the logical leg and may extend the driver's occupied
-- window. Preserve the passenger's functional requirement through its new end.
create function private.ride_assistance_covers(p_driver uuid,p_leg uuid,p_until timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select not exists (
   select from private.ride_access_preferences p
   where p.leg=p_leg and p.assistance<>'none' and not exists (
     select from private.ride_assist_capabilities a
     join private.ride_driver_credentials c on c.driver_id=a.driver_id and c.vehicle_identifier=a.vehicle_ref
     where a.driver_id=p_driver and a.capability=p.assistance and a.until_at>=p_until
   )
 )
$$;

create or replace function private.ride_safety_can_pair(driver uuid,l public.ride_legs)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
   select from public.rides r where r.id=l.ride_id
   and not exists (select from private.ride_pair_blocks b where
     (b.actor=driver and b.other=r.passenger_id) or (b.actor=r.passenger_id and b.other=driver))
   and not exists (select from private.ride_restrictions s where
     s.subject in (driver,r.passenger_id) and s.environment=l.environment and s.until_at>now() and s.appeal_state<>'lifted')
 ) and private.ride_assistance_covers(driver,l.id,greatest(now(),upper(l.slot),upper(l.driver_slot)))
$$;

create function private.require_ride_assistance_until_arrival() returns trigger
language plpgsql security definer set search_path='' as $$
declare horizon timestamptz:=greatest(upper(new.slot),upper(new.driver_slot));
begin
 if new.status is distinct from old.status then
   if new.status='arriving' then
     horizon:=greatest(horizon,now()+coalesce(upper(new.driver_slot)-lower(new.driver_slot),make_interval(mins=>new.duration_minutes)));
   elsif new.status='boarded' then
     horizon:=greatest(horizon,now()+make_interval(mins=>new.duration_minutes));
   end if;
 end if;
 if not private.ride_assistance_covers(new.driver_id,new.id,horizon) then raise exception 'ride_assistance_requote'; end if;
 return new;
end $$;

create trigger ride_require_assistance_window before update of slot,driver_slot,status on public.ride_legs for each row
 when (new.driver_id is not null and new.status in ('accepted','arriving','boarded') and
   (new.slot is distinct from old.slot or new.driver_slot is distinct from old.driver_slot or new.status is distinct from old.status))
 execute function private.require_ride_assistance_until_arrival();

revoke all on function private.ride_assistance_covers(uuid,uuid,timestamptz),private.require_ride_assistance_until_arrival()
 from public,anon,authenticated,service_role;

-- Use the currently accepted geometry, including an authorized route change.
-- GeoJSON uses longitude first; the projection uses latitude first. Reuse the
-- original private geometry and its retention date without making a second copy.
create or replace function private.ride_current_safety_path(p_leg uuid) returns private.ride_safety_paths
language plpgsql stable security definer set search_path='' as $$
declare l public.ride_legs; g jsonb; expiry timestamptz; points jsonb; result private.ride_safety_paths;
begin
 select * into l from public.ride_legs where id=p_leg;
 if not found then return null; end if;
 if l.route_case_id is null then
   select * into result from private.ride_safety_paths where leg=p_leg and expires_at>now();
   return result;
 end if;
 select p.geometry->'coordinates',p.delete_by into g,expiry
 from private.ride_route_points p join private.ride_route_cases c on c.id=p.route_id
 where c.id=l.route_case_id and c.environment=l.environment and c.source_ref='osrm/car/static'
   and p.delete_by>now() and p.geometry->>'type'='LineString';
 if jsonb_typeof(g) is distinct from 'array' then return null; end if;
 select jsonb_agg(jsonb_build_array(node->1,node->0) order by seq) into points
 from jsonb_array_elements(g) with ordinality coordinates(node,seq)
 where case when jsonb_typeof(node->0)='number' and jsonb_typeof(node->1)='number' then
   (node->>0)::numeric between -180 and 180 and (node->>1)::numeric between -90 and 90 else false end;
 if points is null or jsonb_array_length(points)<>jsonb_array_length(g) or jsonb_array_length(points)<2 then return null; end if;
 result:=(p_leg,points,250,'osrm/car/static',expiry)::private.ride_safety_paths;
 return result;
end $$;
revoke all on function private.ride_current_safety_path(uuid) from public,anon,authenticated,service_role;

create or replace function public.ride_safety_status(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['passenger','driver']); pol private.ride_safety_policies; pos private.ride_observations;
 path private.ride_safety_paths; reason text; notice_count int; vehicle jsonb; snapshots jsonb;
begin
 select * into pol from private.ride_safety_policies where environment=l.environment and origin=l.origin and destination=l.destination and period @> l.pickup_at;
 select * into pos from private.ride_observations where leg_id=l.id and onboard order by observed_at desc limit 1;
 if l.status='boarded' then
   if pos.observed_at is null or pos.observed_at<now()-interval '2 minutes' then reason:='stale_signal';
   else
     path:=private.ride_current_safety_path(l.id);
     if path.leg is not null and private.ride_route_deviation(pos.latitude,pos.longitude,path.points)>path.threshold_m then reason:='route_deviation';
     elsif exists(select from private.ride_observations o where o.leg_id=l.id and o.onboard and o.observed_at between now()-interval '6 minutes' and now()-interval '4 minutes')
      and not exists(select from private.ride_observations o where o.leg_id=l.id and o.onboard and o.observed_at>now()-interval '6 minutes'
        and (abs(o.latitude-pos.latitude)>0.0007 or abs(o.longitude-pos.longitude)>0.0008)) then reason:='long_stop'; end if;
   end if;
 elsif l.status in ('unknown','cancelled') and exists(select from private.ride_events e where e.leg_id=l.id and e.to_status='boarded') then reason:='unexpected_end'; end if;
 if exists(select from private.ride_wellness_ack where leg=l.id and actor=auth.uid() and at>now()-interval '10 minutes') then reason:=null; end if;
 select count(*) into notice_count from private.ride_recording_notices where leg=l.id and driver_id=l.driver_id;
 select jsonb_build_object('model',vehicle_model,'plate',vehicle_plate) into vehicle from private.ride_driver_credentials
   where driver_id=l.driver_id and l.status in ('accepted','arriving','boarded','unknown');
 select coalesce(jsonb_agg(private.safety_case_view(d,auth.uid()) order by d.opened desc),'[]') into snapshots
    from private.ride_case_details d where d.leg=l.id and d.reporter=auth.uid();
 return jsonb_build_object('role',case when l.driver_id=auth.uid() then 'driver' else 'passenger' end,'status',l.status,'simulation',l.environment='simulation',
   'wellness',reason,'vehicle',vehicle,'location',case when l.status='boarded' and pos.observed_at>now()-interval '2 minutes' then
    jsonb_build_object('lat',pos.latitude,'lng',pos.longitude,'at',pos.observed_at) end,'recording_allowed',notice_count=2 and pol.media_key is not null,
   'notice_given',exists(select from private.ride_recording_notices where leg=l.id and driver_id=l.driver_id and actor=auth.uid()),
   'media_enabled',pol.media_key is not null and pol.period @> now(),'dial',case when l.environment='live' then coalesce(pol.emergency_number,'190') end,
   'lost_checks',coalesce((select jsonb_agg(jsonb_build_object('protocol',d.protocol,'opened',d.opened))
    from private.ride_case_details d join public.support_tasks t on t.id=d.protocol where d.leg=l.id and d.reporter<>auth.uid() and d.category='lost_item' and t.resolved_at is null
      and exists(select from private.ride_case_updates u where u.protocol=d.protocol and u.code='request_item_check')),'[]'),
   'policy',case when pol.id is not null then jsonb_build_object('insurer',pol.insurer,'coverage',pol.coverage,'exclusions',pol.exclusions,'territory',pol.territory,
    'from',lower(pol.period),'until',upper(pol.period),'claim_channel',pol.claim_channel) end,'cases',snapshots);
end $$;
