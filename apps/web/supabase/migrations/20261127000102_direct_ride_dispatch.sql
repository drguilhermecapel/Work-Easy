-- Commands share the same lock order and immutable operation keys, whether the
-- dispatcher is serving rides requested now or rides reserved for a future slot.
create function private.ride_offer_eligible(p_driver uuid,l public.ride_legs) returns boolean
language sql stable security definer set search_path='' as $$
  select l.status='requested' and l.environment=private.ride_env()
    and exists(select from private.ride_network f where f.environment=l.environment and f.module_enabled and f.dispatch_enabled and f.quote_enabled)
    and l.pickup_at+interval '10 minutes'>now()
    and private.ride_area_allowed(l.environment,l.origin,'dispatch') and private.ride_area_allowed(l.environment,l.destination,'dispatch')
    and (l.environment='simulation' or l.fee_cents=0 or
      (exists(select from private.ride_network where environment='live' and monetization_enabled)
       and private.ride_area_allowed('live',l.origin,'monetize') and private.ride_area_allowed('live',l.destination,'monetize')))
    and exists(select from public.ride_drivers d where d.id=p_driver and d.online
         and private.ride_driver_valid(d.id,(greatest(now(),upper(l.slot)) at time zone 'America/Sao_Paulo')::date))
    and exists(select from public.rides r where r.id=l.ride_id and r.passenger_id<>p_driver)
    and not exists(select from private.ride_declines where driver_id=p_driver and leg_id=l.id)
    and not exists(select from public.ride_legs other where other.driver_id=p_driver and other.id<>l.id
      and (other.status='unknown' or (other.status in ('accepted','arriving','boarded')
        and (other.slot && l.slot or (other.status in ('arriving','boarded') and upper(other.slot)<=now())))))
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
      status in ('accepted','arriving','boarded','unknown') and slot && new.period) then raise exception 'slot_unavailable'; end if;
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
        update public.ride_legs set driver_id=v_uid where id=l.id;
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
  v_admin boolean:=public.is_admin(); v_driver jsonb; v_reviews jsonb; v_rides jsonb; v_quotes jsonb; v_offers jsonb; v_areas jsonb;
begin
  if v_uid is null or not exists(select from public.profiles where id=v_uid and deleted_at is null) then raise exception 'not_allowed'; end if;
  select * into strict f from private.ride_network where environment=v_env;
  select jsonb_build_object('status',d.status,'online',d.online,'vehicle',d.vehicle,'valid_until',d.valid_until)
    into v_driver from public.ride_drivers d where d.id=v_uid and d.environment=v_env;
  if v_admin then
    select jsonb_agg(jsonb_build_object('driver_id',d.id,'vehicle',d.vehicle,'status',d.status,'valid_until',d.valid_until) order by d.updated_at desc)
      into v_reviews from (select * from public.ride_drivers where environment=v_env order by updated_at desc limit 100) d;
  end if;
  if f.module_enabled then
    select jsonb_agg(area order by area) into v_areas from
      (select origin as area from private.ride_routes where environment=v_env
       union select destination from private.ride_routes where environment=v_env) a where private.ride_area_allowed(v_env,area,'quote');
  end if;
  select jsonb_agg(private.ride_quote_view(q::private.ride_quotes,v_uid) order by created_at desc) into v_quotes from
    (select q1.* from private.ride_quotes q1 where q1.environment=v_env and v_uid=any(q1.required_users)
      order by q1.created_at desc limit 50) q;
  select jsonb_agg(jsonb_build_object('leg_id',l.id,'origin',l.origin,'destination',l.destination,'pickup_at',l.pickup_at,
    'duration_minutes',l.duration_minutes,'driver_cents',l.driver_cents) order by l.pickup_at) into v_offers
    from (select l1.* from public.ride_legs l1 where l1.status='requested' and private.ride_offer_eligible(v_uid,l1) order by l1.pickup_at limit 50) l;
  select jsonb_agg(jsonb_build_object('id',r.id,'booking_id',r.booking_id,'passenger_id',r.passenger_id,
    'scheduled_at',r.scheduled_at,'kind',case when r.scheduled_at is null then 'instant' else 'scheduled' end,
    'environment',r.environment,'status',summary.status,'legs',summary.legs) order by r.created_at desc) into v_rides
  from (select r1.* from public.rides r1 where r1.environment=v_env and
    (v_admin or v_uid=r1.passenger_id or exists(select from public.bookings b where b.id=r1.booking_id and b.client_id=v_uid)
     or exists(select from public.ride_legs l where l.ride_id=r1.id and (l.payer_id=v_uid or l.driver_id=v_uid)))
    order by r1.created_at desc limit 100) r
  cross join lateral (
    select case when count(*) filter(where l.status='unknown')>0 then 'unknown'
      when bool_and(l.status='cancelled') then 'cancelled' when bool_and(l.status in ('completed','cancelled')) then 'completed'
      else (array_agg(l.status order by l.seq) filter(where l.status not in ('completed','cancelled')))[1] end status,
      jsonb_agg(jsonb_build_object('id',l.id,'seq',l.seq,'status',l.status,'driver_id',l.driver_id,
      'origin',case when rights.see_route then l.origin else 'Reservado ao passageiro' end,
      'destination',case when rights.see_route then l.destination else 'Reservado ao passageiro' end,
      'pickup_at',l.pickup_at,'duration_minutes',l.duration_minutes,
      'fare_cents',case when rights.see_price then l.fare_cents end,'limit_cents',case when rights.see_price then l.fare_cents end,
      'extras_cents',case when rights.see_price then l.extras_cents end,
      'fee_cents',case when v_admin or l.driver_id=v_uid then l.fee_cents end,'driver_cents',case when v_admin or l.driver_id=v_uid then l.driver_cents end,
      'payer',case when r.booking_id is null then 'passenger' when l.payer_id=r.passenger_id then 'provider' else 'client' end,
      'can_view_driver_identity',r.environment='live' and v_uid=r.passenger_id and l.driver_id is not null and l.status in ('accepted','arriving','boarded'),
      'can_cancel',l.status in ('requested','accepted','arriving','boarded') and
          (v_admin or l.driver_id=v_uid or l.payer_id=v_uid or r.passenger_id=v_uid or rights.is_client)) order by l.seq) legs
    from public.ride_legs l cross join lateral (select
      (v_admin or l.driver_id=v_uid or r.passenger_id=v_uid) as see_route,
      (v_admin or l.driver_id=v_uid or l.payer_id=v_uid) as see_price,
      exists(select from public.bookings b where b.id=r.booking_id and b.client_id=v_uid) as is_client) rights
    where l.ride_id=r.id and (v_admin or r.passenger_id=v_uid or rights.is_client or l.driver_id=v_uid or l.payer_id=v_uid)
  ) summary;
  return jsonb_build_object('enabled',f.module_enabled,'simulation',v_env='simulation','quote_enabled',f.module_enabled and f.quote_enabled,
    'dispatch_enabled',f.module_enabled and f.dispatch_enabled and f.quote_enabled,'areas',coalesce(v_areas,'[]'),'driver',v_driver,
    'rides',coalesce(v_rides,'[]'),'offers',coalesce(v_offers,'[]'),'quotes',coalesce(v_quotes,'[]'),'reviews',coalesce(v_reviews,'[]'));
end $$;

revoke all on function public.ride_accept_offer(uuid,uuid),public.ride_decline_offer(uuid,uuid),
  public.ride_transition(uuid,text,uuid),public.ride_resolve(uuid,text,uuid),public.ride_dashboard() from public,anon;
grant execute on function public.ride_accept_offer(uuid,uuid),public.ride_decline_offer(uuid,uuid),
  public.ride_transition(uuid,text,uuid),public.ride_resolve(uuid,text,uuid),public.ride_dashboard() to authenticated;
