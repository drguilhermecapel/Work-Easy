-- Mapped points are supplied by a participant. The route measurement for this
-- exact pair is authenticated by a different, assigned reviewer before pricing.
create function private.valid_ride_point(p jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
begin
  if p is null or jsonb_typeof(p)<>'object' then return false; end if;
  return (p-array['label','lat','lng'])='{}'::jsonb and p ?& array['label','lat','lng']
    and jsonb_typeof(p->'label')='string' and length(trim(p->>'label')) between 3 and 180
    and (p->>'label')!~'[[:cntrl:]]'
    and case when jsonb_typeof(p->'lat')='number' and jsonb_typeof(p->'lng')='number' then
        (p->>'lat')::numeric between -90 and 90 and (p->>'lng')::numeric between -180 and 180 else false end;
end $$;
revoke all on function private.valid_ride_point(jsonb) from public,anon,authenticated;
alter table private.ride_route_points add check(origin is null or private.valid_ride_point(origin)),
  add check(destination is null or private.valid_ride_point(destination));
alter table private.ride_routes add check(origin_point is null or private.valid_ride_point(origin_point)),
  add check(destination_point is null or private.valid_ride_point(destination_point));

create function private.ride_route_view(c private.ride_route_cases,p_uid uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',c.id,'environment',c.environment,'booking_id',c.booking_id,
   'status',case when c.valid_until<=now() then 'expired' else c.status end,'origin_area',c.origin_area,
   'destination_area',c.destination_area,'service_endpoint',c.service_endpoint,'valid_until',c.valid_until,
   'can_claim',public.is_admin() and c.status='awaiting_review' and c.valid_until>now() and c.reviewer_id is null
     and p_uid<>c.passenger_id and p_uid is distinct from c.client_id,
   'can_verify',c.reviewer_id is not distinct from p_uid and public.is_admin() and c.status='awaiting_review' and c.valid_until>now(),
   'is_service_client',p_uid is not distinct from c.client_id,
   'can_complete',c.status='draft' and c.valid_until>now() and pt.delete_by>now()
     and (c.passenger_id=p_uid or (c.client_id=p_uid and
       ((c.service_endpoint='origin' and pt.origin is null) or (c.service_endpoint='destination' and pt.destination is null)))),
   'can_quote',(p_uid=c.passenger_id or p_uid is not distinct from c.client_id) and c.status='verified'
      and c.valid_until>now() and pt.delete_by>now() and not exists(select from public.ride_legs l where l.route_case_id=c.id),
   'meters',case when p_uid=c.passenger_id or p_uid=c.reviewer_id then c.meters end,
   'minutes',case when p_uid=c.passenger_id or p_uid=c.reviewer_id then c.minutes end,
   'origin',case when pt.delete_by>now() and (p_uid=c.passenger_id or (p_uid=c.client_id and c.service_endpoint='origin')
      or (p_uid=c.reviewer_id and public.is_admin() and c.status='awaiting_review' and c.valid_until>now())) then pt.origin end,
   'destination',case when pt.delete_by>now() and (p_uid=c.passenger_id or (p_uid=c.client_id and c.service_endpoint='destination')
      or (p_uid=c.reviewer_id and public.is_admin() and c.status='awaiting_review' and c.valid_until>now())) then pt.destination end)
 from (select 1) a left join private.ride_route_points pt on pt.route_id=c.id
$$;
revoke all on function private.ride_route_view(private.ride_route_cases,uuid) from public,anon,authenticated;

create function public.ride_prepare_route(p_key uuid,p_booking uuid,p_origin_area text,p_destination_area text,
  p_origin jsonb,p_destination jsonb,p_service_endpoint text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  u uuid:=private.require_ride_feature('quote');env text;b public.bookings;c private.ride_route_cases;
  pt private.ride_route_points;passenger uuid:=u;client uuid;digest bytea;
begin
  perform singleton from private.ride_deployment for share;
  env:=private.ride_env();
  if p_key is null or p_origin_area is null or p_destination_area is null or
     length(trim(p_origin_area)) not between 1 and 90 or length(trim(p_destination_area)) not between 1 and 90
     or (p_origin is not null and not private.valid_ride_point(p_origin))
     or (p_destination is not null and not private.valid_ride_point(p_destination))
     or (p_origin is null and p_destination is null) then raise exception 'invalid_point'; end if;
  if (env='simulation' and (not exists(select from private.ride_routes where environment=env and origin=p_origin_area)
     or not exists(select from private.ride_routes where environment=env and destination=p_destination_area)))
     or not private.ride_area_allowed(env,p_origin_area,'quote') or not private.ride_area_allowed(env,p_destination_area,'quote')
     then raise exception 'route_unavailable'; end if;
  -- Serialize retries for the same account; the digest expires with the coordinates.
  perform 1 from public.profiles where id=u for no key update;
  digest:=sha256(convert_to(jsonb_build_array(p_booking,p_origin_area,p_destination_area,p_origin,p_destination,p_service_endpoint)::text,'UTF8'));
  select * into c from private.ride_route_cases where creator_id=u and request_key=p_key;
  if found then
    select * into pt from private.ride_route_points where route_id=c.id;
    if pt.initial_digest is distinct from digest then raise exception 'idempotency_conflict'; end if;
    return private.ride_route_view(c,u);
  end if;
  if (select count(*) from private.ride_route_cases where creator_id=u and created_at>now()-interval '1 hour')>=30 then raise exception 'ride_quote_limit'; end if;
  if p_booking is null then
    if p_service_endpoint is not null or p_origin is null or p_destination is null then raise exception 'invalid_point'; end if;
  else
    select * into b from public.bookings where id=p_booking;
    if not found or b.origin<>'platform' or b.status not in ('accepted','paid','in_progress') or b.client_id is null
       or u not in (b.provider_id,b.client_id) then raise exception 'booking_not_eligible'; end if;
    passenger:=b.provider_id;client:=b.client_id;
    if p_service_endpoint is null or p_service_endpoint not in ('origin','destination') then raise exception 'invalid_endpoint'; end if;
    if u=client and ((p_service_endpoint='origin' and (p_origin is null or p_destination is not null))
       or (p_service_endpoint='destination' and (p_destination is null or p_origin is not null))) then raise exception 'not_allowed'; end if;
  end if;
  insert into private.ride_route_cases(environment,request_key,creator_id,passenger_id,booking_id,client_id,origin_area,destination_area,
     service_endpoint,status,valid_until)
    values(env,p_key,u,passenger,p_booking,client,p_origin_area,p_destination_area,p_service_endpoint,
      case when p_origin is null or p_destination is null then 'draft' else 'awaiting_review' end,now()+interval '1 day')
    returning * into c;
  insert into private.ride_route_points(route_id,origin,destination,initial_digest,delete_by)
    values(c.id,p_origin,p_destination,digest,c.valid_until+interval '24 hours');
  return private.ride_route_view(c,u);
end $$;

create function public.ride_complete_route(p_route uuid,p_origin jsonb,p_destination jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('quote'); c private.ride_route_cases;pt private.ride_route_points;
begin
 select * into c from private.ride_route_cases where id=p_route and environment=private.ride_env() and (passenger_id=u or client_id=u) for update;
 if not found then raise exception 'not_allowed'; end if;
 select * into pt from private.ride_route_points where route_id=c.id and delete_by>now() for update;
 if not found or c.valid_until<=now() then raise exception 'route_unavailable'; end if;
 if c.client_id=u and
    ((c.service_endpoint='destination' and p_origin is not null) or (c.service_endpoint='origin' and p_destination is not null)) then
   raise exception 'not_allowed'; end if;
 if (p_origin is not null and (not private.valid_ride_point(p_origin) or (pt.origin is not null and p_origin<>pt.origin)))
    or (p_destination is not null and (not private.valid_ride_point(p_destination) or (pt.destination is not null and p_destination<>pt.destination)))
    or coalesce(p_origin,pt.origin) is null or coalesce(p_destination,pt.destination) is null then raise exception 'invalid_point'; end if;
 if c.status<>'draft' then return private.ride_route_view(c,u); end if;
 update private.ride_route_points set origin=coalesce(origin,p_origin),destination=coalesce(destination,p_destination) where route_id=c.id;
 update private.ride_route_cases set status='awaiting_review' where id=c.id returning * into c;
 return private.ride_route_view(c,u);
end $$;

create function public.ride_claim_route(p_route uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('quote');c private.ride_route_cases;
begin
 if not public.is_admin() then raise exception 'not_allowed'; end if;
 update private.ride_route_cases set reviewer_id=u where id=p_route and environment=private.ride_env() and status='awaiting_review'
   and valid_until>now() and (reviewer_id is null or reviewer_id=u) and u<>passenger_id and u is distinct from client_id returning * into c;
 if not found then raise exception 'not_allowed'; end if;
 perform private.audit('ride.route_claim','ride_route_cases',c.id::text,jsonb_build_object('environment',c.environment));
 return private.ride_route_view(c,u);
end $$;

create function public.ride_verify_route(p_route uuid,p_meters integer,p_minutes integer,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('quote');c private.ride_route_cases;
begin
 if not public.is_admin() then raise exception 'not_allowed'; end if;
 if p_meters is null or p_meters not between 1 and 100000 or p_minutes is null or p_minutes not between 1 and 240
    or p_reference is null or p_reference !~ '^[[:alnum:]_.:/-]{3,120}$' then raise exception 'invalid_route_measurement'; end if;
 select * into c from private.ride_route_cases where id=p_route and environment=private.ride_env() and reviewer_id=u for update;
 if not found or c.valid_until<=now() or c.status not in ('awaiting_review','verified') then raise exception 'route_unavailable'; end if;
 if c.status='verified' then
   if c.meters<>p_meters or c.minutes<>p_minutes or c.source_ref<>p_reference then raise exception 'route_measurement_locked'; end if;
   return private.ride_route_view(c,u);
 end if;
 update private.ride_route_cases set status='verified',meters=p_meters,minutes=p_minutes,source_ref=p_reference,valid_until=now()+interval '30 minutes'
 where id=c.id returning * into c;
 update private.ride_route_points set delete_by=c.valid_until+interval '24 hours' where route_id=c.id;
 perform private.audit('ride.route_verify','ride_route_cases',c.id::text,jsonb_build_object('environment',c.environment,'meters',c.meters,'minutes',c.minutes));
 return private.ride_route_view(c,u);
end $$;

create function public.ride_route_cases() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(private.ride_route_view(c::private.ride_route_cases,auth.uid()) order by c.created_at desc),'[]'::jsonb)
 from (select rc.* from private.ride_route_cases rc where rc.environment=private.ride_env() and auth.uid() is not null
    and exists(select from public.profiles p where p.id=auth.uid() and p.deleted_at is null)
    and (auth.uid()=rc.passenger_id or auth.uid()=rc.client_id or
      (public.is_admin() and (rc.reviewer_id=auth.uid() or (rc.status='awaiting_review' and rc.reviewer_id is null and rc.valid_until>now()))))
    order by rc.created_at desc limit 100) c
$$;

-- Optional fixed public meeting points are rehearsal fixtures only. Every live
-- leg must use its own reviewed pair. Freeze fixture endpoints for simulated receipts.
create table private.ride_meeting_snapshots (
 quote_id uuid not null references private.ride_quotes(id),seq int not null,origin jsonb not null,destination jsonb not null,
 reference text not null,valid_until timestamptz not null,primary key(quote_id,seq)
);
revoke all on private.ride_meeting_snapshots from public,anon,authenticated;
create function private.freeze_ride_meeting_points() returns trigger language plpgsql security definer set search_path='' as $$
declare leg jsonb; rt private.ride_routes;
begin
 if new.environment<>'simulation' then return new; end if;
 for leg in select value from jsonb_array_elements(new.legs) where value->>'route_id' is null loop
   select * into strict rt from private.ride_routes where environment='simulation' and origin=leg->>'origin' and destination=leg->>'destination' for share;
   if rt.origin_point is null and rt.destination_point is null then continue; end if;
   if rt.origin_point is null or rt.destination_point is null or rt.verified_ref is null or rt.verified_until<=now()
      or rt.meters<>(leg->>'meters')::int or rt.minutes<>(leg->>'duration_minutes')::int then raise exception 'requote_required'; end if;
   insert into private.ride_meeting_snapshots values(new.id,(leg->>'seq')::int,rt.origin_point,rt.destination_point,rt.verified_ref,rt.verified_until);
 end loop;
 return new;
end $$;
create trigger freeze_ride_meeting_points after insert on private.ride_quotes for each row execute function private.freeze_ride_meeting_points();
revoke all on function private.freeze_ride_meeting_points() from public,anon,authenticated;

create function public.ride_leg_points(p_leg uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); l public.ride_legs; r public.rides; is_client boolean; a jsonb;b jsonb;
begin
 if u is null or not exists(select from public.profiles where id=u and deleted_at is null) then raise exception 'not_allowed'; end if;
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env();
 if not found then raise exception 'not_allowed'; end if;
 select * into strict r from public.rides where id=l.ride_id;
 is_client:=exists(select from public.bookings where id=r.booking_id and client_id=u);
 if not (u=r.passenger_id or (u is not distinct from l.driver_id and l.status in ('accepted','arriving','boarded')) or is_client) then
   raise exception 'not_allowed';
 end if;
 if l.route_case_id is not null then
   select origin,destination into a,b from private.ride_route_points where route_id=l.route_case_id and delete_by>now();
 else
   select origin,destination into a,b from private.ride_meeting_snapshots where quote_id=l.source_quote_id and seq=l.quote_seq;
 end if;
 if is_client and u<>r.passenger_id and u is distinct from l.driver_id then
   if l.service_endpoint is distinct from 'origin' then a:=null; end if;
   if l.service_endpoint is distinct from 'destination' then b:=null; end if;
 end if;
 if a is not null or b is not null then
   perform private.audit('ride.points_access','ride_legs',l.id::text,jsonb_build_object('environment',r.environment));
 end if;
 return jsonb_build_object('origin',a,'destination',b);
end $$;

create function private.ride_points_lifetime() returns trigger language plpgsql set search_path='' as $$
begin
 if new.route_case_id is null then return new; end if;
 if tg_op='INSERT' then
   -- Even if confirmation is lost and reconciliation remains open, a future
   -- pickup never keeps coordinates indefinitely. Only financial IDs survive.
   update private.ride_route_points set delete_by=upper(new.slot)+interval '24 hours' where route_id=new.route_case_id;
 elsif new.status in ('completed','cancelled') then
   update private.ride_route_points set delete_by=least(delete_by,now()+interval '24 hours') where route_id=new.route_case_id;
 elsif new.status='unknown' then
   update private.ride_route_points set delete_by=least(delete_by,now()+interval '24 hours') where route_id=new.route_case_id;
 end if;
 return new;
end $$;
create trigger ride_points_lifetime after insert or update of status on public.ride_legs for each row execute function private.ride_points_lifetime();

create function private.ride_declined_points() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status in ('declined','superseded') then
   update private.ride_route_points p set delete_by=least(p.delete_by,now()+interval '24 hours') where
     exists(select from jsonb_array_elements(new.legs) l where l->>'route_id'=p.route_id::text)
     and not exists(select from public.ride_legs l where l.route_case_id=p.route_id);
 end if;
 return new;
end $$;
create trigger ride_declined_points after update of status on private.ride_quotes for each row execute function private.ride_declined_points();
create function private.purge_ride_points() returns int language plpgsql security definer set search_path='' as $$
declare n int;
begin
 -- Run every five minutes and expire slightly early to meet the 24-hour limit.
 delete from private.ride_route_points p where p.delete_by<=now()+interval '5 minutes' or
   (not exists(select from public.ride_legs l where l.route_case_id=p.route_id) and exists(select from private.ride_quotes q
     cross join lateral jsonb_array_elements(q.legs) l where l->>'route_id'=p.route_id::text and q.expires_at+interval '24 hours'<=now()+interval '5 minutes'));
 get diagnostics n=row_count;
 return n;
end $$;
do $schedule$
begin
 if exists(select from pg_extension where extname='pg_cron') then
   perform cron.schedule('purge-ride-route-points','*/5 * * * *','select private.purge_ride_points()');
 end if;
end $schedule$;
revoke all on function private.ride_points_lifetime(),private.ride_declined_points(),private.purge_ride_points() from public,anon,authenticated;
revoke all on function public.ride_prepare_route(uuid,uuid,text,text,jsonb,jsonb,text),public.ride_complete_route(uuid,jsonb,jsonb),
 public.ride_claim_route(uuid),public.ride_verify_route(uuid,int,int,text),public.ride_route_cases(),public.ride_leg_points(uuid) from public,anon;
grant execute on function public.ride_prepare_route(uuid,uuid,text,text,jsonb,jsonb,text),public.ride_complete_route(uuid,jsonb,jsonb),
 public.ride_claim_route(uuid),public.ride_verify_route(uuid,int,int,text),public.ride_route_cases(),public.ride_leg_points(uuid) to authenticated;
