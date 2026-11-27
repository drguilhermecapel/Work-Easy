-- Commands share the same lock order and immutable operation keys, whether the
-- dispatcher is serving rides requested now or rides reserved for a future slot.
create function public.ride_configure_shift(p_area text,p_from timestamptz,p_until timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('module');env text:=private.ride_env();s private.ride_driver_shifts;
begin
 if p_from is null or p_until is null or p_from>=p_until or p_until>p_from+interval '12 hours' or p_area is null then raise exception 'invalid_shift'; end if;
 perform 1 from public.ride_drivers where id=u for update;
 if not found or not private.ride_driver_valid(u,(p_until at time zone 'America/Sao_Paulo')::date) then raise exception 'driver_ineligible'; end if;
 select * into s from private.ride_driver_shifts where driver_id=u and area=p_area and period=tstzrange(p_from,p_until,'[)');
 if not found then
   if p_from<now()-interval '10 minutes' or p_from>now()+interval '30 days' or p_until<=now()
     or not private.ride_area_allowed(env,p_area,'dispatch')
     or not exists(select from private.ride_approach_routes where environment=env and origin_area=p_area and valid_until>now()) then
      raise exception 'invalid_shift'; end if;
   if (select count(*) from private.ride_driver_shifts where driver_id=u and upper(period)>now())>=40 then raise exception 'ride_shift_limit'; end if;
   begin
     insert into private.ride_driver_shifts(driver_id,area,period) values(u,p_area,tstzrange(p_from,p_until,'[)')) returning * into s;
   exception when exclusion_violation then raise exception 'driver_shift_overlap'; end;
 end if;
 return jsonb_build_object('id',s.id,'area',s.area,'starts_at',lower(s.period),'ends_at',upper(s.period));
end $$;
create function public.ride_remove_shift(p_shift uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();s private.ride_driver_shifts;
begin
 if not private.ride_active_user(u) then raise exception 'not_allowed'; end if;
 perform 1 from public.ride_drivers where id=u for update;
 select * into s from private.ride_driver_shifts where id=p_shift and driver_id=u for update;
 if not found then return jsonb_build_object('removed',false); end if;
 if exists(select from public.ride_legs where driver_id=u and coalesce(driver_slot,slot) && s.period and status in ('accepted','arriving','boarded','unknown'))
    then raise exception 'driver_has_active_ride'; end if;
 delete from private.ride_driver_shifts where id=s.id;
 if not exists(select from private.ride_driver_shifts where driver_id=u and upper(period)>now()) then update public.ride_drivers set online=false where id=u; end if;
 return jsonb_build_object('removed',true);
end $$;

-- Earliest reach from a declared shift or the end of the driver's preceding
-- ride. Also leave enough time to reach the next scheduled pickup. These are
-- calibrated approach estimates, never device positions or traffic promises.
create function private.ride_approach_plan(p_driver uuid,l public.ride_legs) returns table(minutes int,driver_slot tstzrange)
language sql stable security definer set search_path='' as $$
 with shifts as (
   select area,period from private.ride_driver_shifts where driver_id=p_driver and upper(period)>=upper(l.slot)
   union all
   select l.origin,tstzrange(now()-interval '1 hour',greatest(now(),l.pickup_at)+interval '24 hours','[)')
     where l.environment='simulation' and not exists(select from private.ride_driver_shifts where driver_id=p_driver)
 ), candidates as (
   select s.period,m.minutes,
    greatest(now(),lower(s.period),coalesce(past.ends_at,lower(s.period)))+make_interval(mins=>m.minutes) as earliest,
    nx.pickup_at as next_pickup, onward.minutes as onward_minutes
   from shifts s
   left join lateral (select p.destination,upper(coalesce(p.driver_slot,p.slot)) as ends_at from public.ride_legs p where p.driver_id=p_driver
     and p.id<>l.id and p.status in ('accepted','arriving','boarded','completed') and upper(coalesce(p.driver_slot,p.slot))<=l.pickup_at
     and upper(coalesce(p.driver_slot,p.slot))>=lower(s.period) order by upper(coalesce(p.driver_slot,p.slot)) desc limit 1) past on true
   join private.ride_approach_routes m on m.environment=l.environment and m.origin_area=coalesce(past.destination,s.area)
     and m.destination_area=l.origin and m.valid_until>=greatest(now(),l.pickup_at)
   left join lateral (select n.origin,n.pickup_at from public.ride_legs n where n.driver_id=p_driver and n.id<>l.id
     and n.status in ('accepted','arriving','boarded') and n.pickup_at>=upper(l.slot) and n.pickup_at<upper(s.period)
     order by n.pickup_at limit 1) nx on true
   left join private.ride_approach_routes onward on onward.environment=l.environment and onward.origin_area=l.destination
     and onward.destination_area=nx.origin and onward.valid_until>=nx.pickup_at
 )
 select c.minutes,occupied.period from candidates c
 cross join lateral(select tstzrange(greatest(l.pickup_at,c.earliest)-make_interval(mins=>c.minutes),
   greatest(l.pickup_at,c.earliest)+make_interval(mins=>l.duration_minutes),'[)') period) occupied
 join private.ride_network f on f.environment=l.environment join public.rides r on r.id=l.ride_id
 left join private.ride_quotes q on q.id=l.source_quote_id
 where c.minutes<=f.max_approach_minutes and c.earliest<=l.pickup_at+
   case when (case when q.id is not null then q.scheduled_at is null else r.scheduled_at is null end) and l.seq=1 then make_interval(mins=>f.immediate_wait_minutes) else interval '0' end
   and greatest(l.pickup_at,c.earliest)+make_interval(mins=>l.duration_minutes)<=upper(c.period)
   and (c.next_pickup is null or (c.onward_minutes is not null and
     greatest(l.pickup_at,c.earliest)+make_interval(mins=>l.duration_minutes+c.onward_minutes)<=c.next_pickup))
   and not exists(select from public.bookings b where b.provider_id=p_driver and b.status in ('requested','accepted','paid','in_progress') and b.period && occupied.period)
   and not exists(select from public.shifts sh where sh.provider_id=p_driver and sh.status in ('assigned','checked_in') and sh.period && occupied.period)
   and not exists(select from public.ride_legs other where other.driver_id=p_driver and other.id<>l.id and other.status in ('accepted','arriving','boarded','unknown')
     and coalesce(other.driver_slot,other.slot) && occupied.period)
 order by lower(occupied.period)+make_interval(mins=>c.minutes),c.minutes limit 1
$$;
revoke all on function private.ride_approach_plan(uuid,public.ride_legs) from public,anon,authenticated;
create function private.ride_approach_minutes(p_driver uuid,l public.ride_legs) returns int
language sql stable security definer set search_path='' as $$
 select p.minutes from private.ride_approach_plan(p_driver,l) p
$$;
revoke all on function private.ride_approach_minutes(uuid,public.ride_legs) from public,anon,authenticated;
revoke all on function public.ride_configure_shift(text,timestamptz,timestamptz),public.ride_remove_shift(uuid) from public,anon;
grant execute on function public.ride_configure_shift(text,timestamptz,timestamptz),public.ride_remove_shift(uuid) to authenticated;

create function private.ride_offer_eligible(p_driver uuid,l public.ride_legs) returns boolean
language sql stable security definer set search_path='' as $$
  select private.ride_active_user(p_driver) and private.ride_active_user(l.payer_id)
    and private.ride_approach_minutes(p_driver,l) is not null and l.status='requested' and l.environment=private.ride_env()
    and exists(select from private.ride_network f where f.environment=l.environment and f.module_enabled and f.dispatch_enabled and f.quote_enabled)
    and l.pickup_at+interval '10 minutes'>now()
    and private.ride_area_allowed(l.environment,l.origin,'dispatch') and private.ride_area_allowed(l.environment,l.destination,'dispatch')
    and (l.environment='simulation' or l.fee_cents=0 or
      (exists(select from private.ride_network where environment='live' and monetization_enabled)
       and private.ride_area_allowed('live',l.origin,'monetize') and private.ride_area_allowed('live',l.destination,'monetize')))
    and exists(select from public.ride_drivers d where d.id=p_driver and d.online
         and private.ride_driver_valid(d.id,(greatest(now(),upper(l.slot)) at time zone 'America/Sao_Paulo')::date))
    and exists(select from public.rides r where r.id=l.ride_id and r.passenger_id<>p_driver and private.ride_active_user(r.passenger_id)
      and (r.booking_id is null or exists(select from public.bookings b where b.id=r.booking_id and b.provider_id=r.passenger_id and private.ride_active_user(b.client_id)
        and (b.status in ('accepted','paid','in_progress')
          or (l.next_booking_id is not null and b.status in ('completed','released') and l.pickup_at>=upper(b.period))
          or (l.seq>1 and l.service_endpoint='origin' and l.next_booking_id is null and b.status in ('completed','released','disputed','canceled')
            and private.ride_prior_boarded(r.id,l.seq))))))
    and (l.next_booking_id is null or exists(select from public.bookings nb join public.rides parent on parent.id=l.ride_id
      where nb.id=l.next_booking_id and nb.provider_id=parent.passenger_id and private.ride_active_user(nb.client_id) and nb.status in ('accepted','paid')
       and lower(nb.period)>=upper(l.slot)))
    and not exists(select from private.ride_declines where driver_id=p_driver and leg_id=l.id)
    and not exists(select from public.ride_legs other where other.driver_id=p_driver and other.id<>l.id
      and (other.status='unknown' or (other.status in ('accepted','arriving','boarded')
        and (coalesce(other.driver_slot,other.slot) && l.slot or (other.status in ('arriving','boarded') and upper(coalesce(other.driver_slot,other.slot))<=now())))))
    and not exists(select from public.bookings b where b.provider_id=p_driver and b.status in ('requested','accepted','paid','in_progress') and b.period && l.slot)
    and not exists(select from public.shifts s where s.provider_id=p_driver and s.status in ('assigned','checked_in') and s.period && l.slot)
$$;
revoke all on function private.ride_offer_eligible(uuid,public.ride_legs) from public,anon,authenticated;

-- New service commitments must honor previously accepted driving assignments too.
create function private.guard_ride_conflict() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.provider_id is null or new.status::text not in ('requested','accepted','paid','in_progress','assigned','checked_in') then return new; end if;
  if exists(select from public.ride_drivers where id=new.provider_id) then
    perform 1 from public.providers where id=new.provider_id for no key update;
    perform 1 from public.ride_drivers where id=new.provider_id for update;
    if exists(select from public.ride_legs where driver_id=new.provider_id and
      status in ('accepted','arriving','boarded','unknown') and coalesce(driver_slot,slot) && new.period) then raise exception 'slot_unavailable'; end if;
  end if;
  return new;
end $$;
create trigger bookings_ride_conflict before insert or update of status,provider_id,period on public.bookings
  for each row execute function private.guard_ride_conflict();
create trigger shifts_ride_conflict before insert or update of status,provider_id,period on public.shifts
  for each row execute function private.guard_ride_conflict();
revoke all on function private.guard_ride_conflict() from public,anon,authenticated;

create function private.ride_command(p_leg uuid,p_action text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid := auth.uid(); l public.ride_legs; r public.rides; e private.ride_events;
  v_target text; v_participant boolean; v_driver boolean; v_admin boolean := public.is_admin();
begin
  if v_uid is null or p_leg is null or p_action is null or p_key is null or
     not exists(select from public.profiles where id=v_uid and deleted_at is null) then raise exception 'not_allowed'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text || p_key::text,0));
  select * into e from private.ride_events where actor_id=v_uid and operation_key=p_key;
  if found then
    if e.leg_id<>p_leg or e.action<>p_action then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('id',e.leg_id,'status',e.to_status,'replayed',true);
  end if;
  -- Cross-domain operations lock a provider before its driver record and the leg.
  if p_action in ('accept_offer','decline_offer') then
    perform private.require_ride_feature('dispatch');
  end if;
  if p_action in ('accept_offer','decline_offer') then
    -- Serialize against cancellation or replacement of the associated service.
    perform pg_advisory_xact_lock(hashtextextended('ride-passenger:'||ride.passenger_id::text,0))
      from public.rides ride join public.ride_legs candidate on candidate.ride_id=ride.id where candidate.id=p_leg and ride.booking_id is not null;
    perform b.id from public.ride_legs candidate join public.rides ride on ride.id=candidate.ride_id
      join public.bookings b on b.id=ride.booking_id or b.id=candidate.next_booking_id
      where candidate.id=p_leg order by b.id for share of b;
  end if;
  if p_action in ('accept_offer','decline_offer','arriving','boarded') then
    perform 1 from public.providers where id=v_uid for no key update;
    perform 1 from public.ride_drivers where id=v_uid for update;
  end if;
  select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
  if not found then raise exception 'not_allowed'; end if;
  select * into strict r from public.rides where id=l.ride_id;
  v_driver:=l.driver_id is not distinct from v_uid;
  v_participant:=v_uid=r.passenger_id or v_uid=l.payer_id or exists(select from public.bookings b where b.id=r.booking_id and b.client_id=v_uid);
  v_target:=p_action;
  case p_action
    when 'accept_offer','decline_offer' then
      if not private.ride_offer_eligible(v_uid,l) then raise exception 'offer_unavailable'; end if;
      if p_action='decline_offer' then
        insert into private.ride_declines values(l.id,v_uid) on conflict do nothing;
        v_target:=l.status;
      else
        v_target:='accepted';
        update public.ride_legs set driver_id=v_uid,driver_slot=(select p.driver_slot from private.ride_approach_plan(v_uid,l) p) where id=l.id;
      end if;
    when 'arriving','boarded' then
      if not v_driver or not ((l.status='accepted' and p_action='arriving') or (l.status='arriving' and p_action='boarded'))
         or l.pickup_at>now()+interval '30 minutes' or not private.ride_driver_valid(v_uid,(now() at time zone 'America/Sao_Paulo')::date) then
        raise exception 'invalid_ride_transition';
      end if;
      if exists(select from public.ride_legs where id<>l.id and driver_id=v_uid and status in ('arriving','boarded','unknown')) then
        raise exception 'driver_has_active_ride'; end if;
      if p_action='boarded' and exists(select from public.ride_legs where ride_id=r.id and seq<l.seq and status not in ('completed','cancelled')) then
        raise exception 'previous_leg_open'; end if;
    when 'completed' then
      if not v_driver or l.status<>'boarded' then raise exception 'invalid_ride_transition'; end if;
    when 'cancelled' then
      if not (v_driver or v_participant or v_admin) or l.status not in ('requested','accepted','arriving','boarded') then
        raise exception 'invalid_ride_transition'; end if;
      if l.status='boarded' then v_target:='unknown'; end if;
    when 'unknown' then
      if not (v_driver or v_admin) or l.status not in ('accepted','arriving','boarded') then raise exception 'invalid_ride_transition'; end if;
    when 'resolve_completed','resolve_cancelled' then
      if not v_admin or l.status<>'unknown' then raise exception 'not_allowed'; end if;
      v_target:=substr(p_action,9);
    else raise exception 'invalid_ride_transition';
  end case;
  if l.status<>v_target then update public.ride_legs set status=v_target,updated_at=now() where id=l.id; end if;
  insert into private.ride_events(actor_id,operation_key,leg_id,action,from_status,to_status)
    values(v_uid,p_key,l.id,p_action,l.status,v_target);
  return jsonb_build_object('id',l.id,'status',v_target,'replayed',false);
end $$;
revoke all on function private.ride_command(uuid,text,uuid) from public,anon,authenticated;

create function public.ride_accept_offer(p_leg uuid,p_key uuid) returns jsonb
language sql security definer set search_path='' as $$ select private.ride_command(p_leg,'accept_offer',p_key) $$;
create function public.ride_decline_offer(p_leg uuid,p_key uuid) returns jsonb
language sql security definer set search_path='' as $$ select private.ride_command(p_leg,'decline_offer',p_key) $$;
create function public.ride_transition(p_leg uuid,p_to text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_to is null or p_to not in ('arriving','boarded','completed','cancelled','unknown') then raise exception 'invalid_ride_transition'; end if;
  return private.ride_command(p_leg,p_to,p_key);
end $$;
create function public.ride_resolve(p_leg uuid,p_to text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if p_to is null or p_to not in ('completed','cancelled') then raise exception 'invalid_ride_transition'; end if;
  return private.ride_command(p_leg,'resolve_'||p_to,p_key);
end $$;

create function public.ride_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_env text:=private.ride_env(); f private.ride_network;
  v_admin boolean:=public.is_admin(); v_driver jsonb; v_reviews jsonb; v_rides jsonb; v_quotes jsonb; v_offers jsonb; v_areas jsonb; v_extras jsonb;
begin
  if v_uid is null or not exists(select from public.profiles where id=v_uid and deleted_at is null) then raise exception 'not_allowed'; end if;
  select * into strict f from private.ride_network where environment=v_env;
  select jsonb_build_object('status',d.status,'online',d.online,'vehicle',d.vehicle,'valid_until',d.valid_until,
      'shifts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'area',s.area,'starts_at',lower(s.period),'ends_at',upper(s.period)) order by lower(s.period))
        from private.ride_driver_shifts s where s.driver_id=d.id and upper(s.period)>now()),'[]'))
    into v_driver from public.ride_drivers d where d.id=v_uid and d.environment=v_env;
  if v_admin then
    select jsonb_agg(jsonb_build_object('driver_id',d.id,'vehicle',d.vehicle,'status',d.status,'valid_until',d.valid_until) order by d.updated_at desc)
      into v_reviews from (select * from public.ride_drivers where environment=v_env and private.ride_active_user(id) order by updated_at desc limit 100) d;
  end if;
  if f.module_enabled then
    select jsonb_agg(jsonb_build_object('code',code,'label',label,'cents',cents) order by code) into v_extras
      from private.ride_extra_prices where tariff_id=(select id from private.ride_tariffs where environment=v_env
        and valid_from<=now() order by valid_from desc limit 1);
    select jsonb_agg(area order by area) into v_areas from
      (select origin as area from private.ride_routes where environment=v_env
       union select destination from private.ride_routes where environment=v_env
       union select area from private.ride_area_authorizations where v_env='live') a where private.ride_area_allowed(v_env,area,'quote');
  end if;
  select jsonb_agg(private.ride_quote_view(q::private.ride_quotes,v_uid) order by created_at desc) into v_quotes from
    (select q1.* from private.ride_quotes q1 where q1.environment=v_env and v_uid=any(q1.required_users)
      order by q1.created_at desc limit 50) q;
  select jsonb_agg(jsonb_build_object('leg_id',l.id,'origin',l.origin,'destination',l.destination,'pickup_at',l.pickup_at,
    'duration_minutes',l.duration_minutes,'approach_minutes',private.ride_approach_minutes(v_uid,l::public.ride_legs),'driver_cents',l.driver_cents) order by l.pickup_at,private.ride_approach_minutes(v_uid,l::public.ride_legs)) into v_offers
    from (select l1.* from public.ride_legs l1 where l1.status='requested' and private.ride_offer_eligible(v_uid,l1) order by l1.pickup_at limit 50) l;
  select jsonb_agg(jsonb_build_object('id',r.id,'booking_id',r.booking_id,'passenger_id',r.passenger_id,
    'scheduled_at',r.scheduled_at,'kind',case when r.scheduled_at is null then 'instant' else 'scheduled' end,
    'environment',r.environment,'in_my_journeys',(r.passenger_id=v_uid or exists(select from public.bookings b where b.id=r.booking_id and b.client_id=v_uid)
     or exists(select from public.ride_legs pay where pay.ride_id=r.id and pay.payer_id=v_uid)),'status',summary.status,'legs',summary.legs) order by r.created_at desc) into v_rides
  from (select r1.* from public.rides r1 where r1.environment=v_env and
    (v_admin or v_uid=r1.passenger_id or exists(select from public.bookings b where b.id=r1.booking_id and b.client_id=v_uid)
     or exists(select from public.ride_legs l where l.ride_id=r1.id and (l.payer_id=v_uid or l.driver_id=v_uid)))
    order by r1.created_at desc limit 100) r
  cross join lateral (
    select case when count(*) filter(where l.status='unknown')>0 then 'unknown'
      when bool_and(l.status='cancelled') then 'cancelled' when bool_and(l.status in ('completed','cancelled')) then 'completed'
      else (array_agg(l.status order by l.seq) filter(where l.status not in ('completed','cancelled')))[1] end status,
      jsonb_agg(jsonb_build_object('id',l.id,'seq',l.seq,'revision',l.revision,'status',l.status,'driver_id',l.driver_id,
      'origin',case when rights.see_route then l.origin else 'Reservado ao passageiro' end,
      'destination',case when rights.see_route then l.destination else 'Reservado ao passageiro' end,
      'pickup_at',l.pickup_at,'duration_minutes',l.duration_minutes,
      'fare_cents',case when rights.see_price then l.fare_cents end,'limit_cents',case when rights.see_price then l.fare_cents end,
      'extras_cents',case when rights.see_price then l.extras_cents end,
      'fee_cents',case when v_admin or l.driver_id=v_uid then l.fee_cents end,'driver_cents',case when v_admin or l.driver_id=v_uid then l.driver_cents end,
      'payer',case when r.booking_id is null then 'passenger' when l.payer_id=r.passenger_id then 'provider' else 'client' end,
      'next_booking_id',case when r.passenger_id=v_uid then l.next_booking_id end,
      'can_requote',f.module_enabled and f.quote_enabled and l.status='cancelled' and (v_uid=r.passenger_id or rights.is_client)
       and not exists(select from public.ride_legs next_leg where next_leg.replaces_id=l.id)
       and (r.booking_id is null or exists(select from public.bookings b where b.id=r.booking_id and b.status in ('accepted','paid','in_progress'))
         or private.ride_rescuable_return(r.booking_id,l.id)),
      'can_view_driver_identity',r.environment='live' and v_uid=r.passenger_id and l.driver_id is not null and l.status in ('accepted','arriving','boarded'),
      'can_cancel',l.status in ('requested','accepted','arriving','boarded') and
          (v_admin or l.driver_id=v_uid or l.payer_id=v_uid or r.passenger_id=v_uid or rights.is_client)) order by l.seq,l.revision) legs
    from public.ride_legs l cross join lateral (select
      (v_admin or l.driver_id=v_uid or r.passenger_id=v_uid) as see_route,
      (v_admin or l.driver_id=v_uid or l.payer_id=v_uid) as see_price,
      exists(select from public.bookings b where b.id=r.booking_id and b.client_id=v_uid) as is_client) rights
    where l.ride_id=r.id and (v_admin or r.passenger_id=v_uid or rights.is_client or l.driver_id=v_uid or l.payer_id=v_uid)
  ) summary;
  return jsonb_build_object('enabled',f.module_enabled,'simulation',v_env='simulation','quote_enabled',f.module_enabled and f.quote_enabled,
    'dispatch_enabled',f.module_enabled and f.dispatch_enabled and f.quote_enabled,'areas',coalesce(v_areas,'[]'),'extra_options',coalesce(v_extras,'[]'),'driver',v_driver,
    'rides',coalesce(v_rides,'[]'),'offers',coalesce(v_offers,'[]'),'quotes',coalesce(v_quotes,'[]'),'reviews',coalesce(v_reviews,'[]'));
end $$;

revoke all on function public.ride_accept_offer(uuid,uuid),public.ride_decline_offer(uuid,uuid),
  public.ride_transition(uuid,text,uuid),public.ride_resolve(uuid,text,uuid),public.ride_dashboard() from public,anon;
grant execute on function public.ride_accept_offer(uuid,uuid),public.ride_decline_offer(uuid,uuid),
  public.ride_transition(uuid,text,uuid),public.ride_resolve(uuid,text,uuid),public.ride_dashboard() to authenticated;
