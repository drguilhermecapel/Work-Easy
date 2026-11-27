-- Public-source address index. Input supplied by the regional importer; this
-- catalog contains no passenger history. Polygon coordinates use (lng,lat).
create extension if not exists pg_trgm with schema extensions;
create table private.ride_places_osm(
 osm_type text not null check(osm_type in ('node','way','relation')), osm_id bigint not null,
 label text not null, area text not null, lat double precision not null check(lat between -90 and 90),
 lng double precision not null check(lng between -180 and 180),kind text not null,primary key(osm_type,osm_id)
);
create index ride_places_osm_lookup on private.ride_places_osm using gin(lower(label) extensions.gin_trgm_ops);
create table private.ride_route_areas(
 environment text not null references private.ride_network(environment),area text not null,
 boundary polygon not null,source_ref text not null check(length(trim(source_ref)) between 1 and 160),
 primary key(environment,area)
);
create function private.ride_point_in_scope(p_env text,p_area text,p jsonb) returns boolean
language sql stable set search_path='' as $$
 select private.valid_ride_point(p) and exists(select from private.ride_route_areas a where a.environment=p_env
   and (p_area is null or a.area=p_area) and private.ride_area_allowed(p_env,a.area,'quote')
   and point((p->>'lng')::double precision,(p->>'lat')::double precision)<@a.boundary)
$$;
create function public.ride_search_places(p_search text,p_area text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare term text:=lower(trim(p_search));env text:=private.ride_env();
begin
 perform private.require_ride_feature('quote');
 if term is null or length(term) not between 3 and 120 or term~'[[:cntrl:]]' then return '[]'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(v)-'ranking'),'[]') from (
   select p.osm_type,p.osm_id,p.label,p.lat,p.lng,p.kind,p.area,extensions.similarity(lower(p.label),term) as ranking
   from (select distinct on (lower(label),area,round(lat::numeric,2),round(lng::numeric,2)) p.*
       from private.ride_places_osm p where (lower(p.label) operator(extensions.%) term
      or lower(p.label) like '%'||replace(replace(replace(term,'\','\\'),'%','\%'),'_','\_')||'%')
     and exists(select from private.ride_route_areas a where a.environment=env and (p_area is null or a.area=p_area)
       and private.ride_area_allowed(env,a.area,'quote') and point(p.lng,p.lat)<@a.boundary)
       order by lower(label),area,round(lat::numeric,2),round(lng::numeric,2),p.osm_type,p.osm_id) p
   order by ranking desc, p.label,p.osm_type,p.osm_id limit 10
 ) v);
end $$;
-- Precise data shares the point row's expiry and erasure. Route cases retain
-- only a measurement and provenance after the position row has expired.
alter table private.ride_route_points add column stops jsonb not null default '[]',
 add column instruction text,add column geometry jsonb,add column route_version bigint not null default 1;
create function public.ride_route_waypoints(p_route uuid,p_stops jsonb,p_instruction text) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('quote');c private.ride_route_cases;pt private.ride_route_points;
begin
 select * into c from private.ride_route_cases where id=p_route and environment=private.ride_env() and passenger_id=u for update;
 if not found then raise exception 'not_allowed'; end if;
 select * into pt from private.ride_route_points where route_id=c.id and delete_by>now() for update;
 if not found or c.valid_until<=now() then raise exception 'route_unavailable'; end if;
 if jsonb_typeof(p_stops) is distinct from 'array' or jsonb_array_length(p_stops)>5 or pg_column_size(p_stops)>3000
    or length(coalesce(p_instruction,''))>180 or coalesce(p_instruction,'')~'[[:cntrl:]]'
    or exists(select from jsonb_array_elements(p_stops) e where not private.valid_ride_point(e)) then raise exception 'invalid_point'; end if;
 if pt.stops=p_stops and pt.instruction is not distinct from nullif(trim(p_instruction),'') then return; end if;
 if c.status not in ('draft','awaiting_review') or c.reviewer_id is not null then raise exception 'route_measurement_locked'; end if;
 update private.ride_route_points set stops=p_stops,instruction=nullif(trim(p_instruction),''),route_version=route_version+1 where route_id=c.id;
end $$;
create function private.ride_path_info(p_route uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('geometry',p.geometry,'stops',p.stops,'instruction',p.instruction,'meters',c.meters,
   'minutes',c.minutes,'source',c.source_ref) from private.ride_route_points p join private.ride_route_cases c on c.id=p.route_id
   where p.route_id=p_route and p.delete_by>now()
$$;
create function public.ride_route_detail(p_route uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if not private.ride_active_user(u) or not exists(select from private.ride_route_cases c where c.id=p_route and c.environment=private.ride_env()
   and (c.passenger_id=u or (c.reviewer_id=u and public.is_admin() and c.status='awaiting_review' and c.valid_until>now()))) then raise exception 'not_allowed'; end if;
 return private.ride_path_info(p_route);
end $$;
create function public.ride_navigation_data(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); route uuid;
begin
 if not private.ride_active_user(u) then raise exception 'not_allowed'; end if;
 select l.route_case_id into route from public.ride_legs l join public.rides r on r.id=l.ride_id where l.id=p_leg and l.environment=private.ride_env()
   and (r.passenger_id=u or (l.driver_id=u and l.status in ('accepted','arriving','boarded')));
 if not found then raise exception 'not_allowed'; end if;
 return private.ride_path_info(route);
end $$;

-- The edge function derives p_user from Auth. Clients cannot obtain the
-- counterparty's precise point by calling this server-only request.
create function public.ride_measure_input(p_route uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.ride_route_cases;pt private.ride_route_points;
begin
 if not private.ride_active_user(p_user) or not exists(select from private.ride_network where environment=private.ride_env()
   and module_enabled and quote_enabled) then raise exception 'not_allowed'; end if;
 select * into c from private.ride_route_cases where id=p_route and environment=private.ride_env() and p_user in (passenger_id,client_id) for share;
 if not found or not private.ride_active_user(c.passenger_id) or (c.client_id is not null and not private.ride_active_user(c.client_id))
   or c.valid_until<=now() then raise exception 'route_unavailable'; end if;
 select * into pt from private.ride_route_points where route_id=c.id and delete_by>now();
 if not found then raise exception 'route_unavailable'; end if;
 if c.status='verified' then return jsonb_build_object('verified',true); end if;
 if c.status<>'awaiting_review' or c.reviewer_id is not null or not private.ride_point_in_scope(c.environment,c.origin_area,pt.origin)
    or not private.ride_point_in_scope(c.environment,c.destination_area,pt.destination)
    or exists(select from jsonb_array_elements(pt.stops) s where not private.ride_point_in_scope(c.environment,null,s)) then raise exception 'route_unavailable'; end if;
 return jsonb_build_object('version',pt.route_version,'coordinates',(
   select jsonb_agg(jsonb_build_array(p->'lng',p->'lat') order by n)
   from jsonb_array_elements(jsonb_build_array(pt.origin)||pt.stops||jsonb_build_array(pt.destination)) with ordinality e(p,n)));
end $$;
create function public.ride_measure_commit(p_route uuid,p_user uuid,p_version bigint,p_meters int,p_minutes int,p_geometry jsonb) returns boolean
language plpgsql security definer set search_path='' as $$
declare c private.ride_route_cases; current_input jsonb;
begin
 select * into c from private.ride_route_cases where id=p_route for update;
 if not found then raise exception 'route_unavailable'; end if;
 current_input:=public.ride_measure_input(p_route,p_user);
 if (current_input->>'verified')::boolean then return true; end if;
 if p_version is distinct from (current_input->>'version')::bigint then raise exception 'route_unavailable'; end if;
 if p_meters is null or p_meters not between 1 and 100000 or p_minutes is null or p_minutes not between 1 and 240
   or coalesce(p_geometry->>'type','')<>'LineString' or jsonb_typeof(p_geometry->'coordinates') is distinct from 'array'
   or jsonb_array_length(p_geometry->'coordinates') not between 2 and 12000 or pg_column_size(p_geometry)>1500000 then raise exception 'invalid_route_measurement'; end if;
 update private.ride_route_cases set status='verified',meters=p_meters,minutes=p_minutes,source_ref='osrm/car/static',
   valid_until=now()+interval '30 minutes' where id=c.id;
 update private.ride_route_points set geometry=jsonb_build_object('type','LineString','coordinates',p_geometry->'coordinates'),
   delete_by=now()+interval '24 hours 30 minutes' where route_id=c.id;
 perform private.audit('ride.route_calculated','ride_route_cases',c.id::text,jsonb_build_object('environment',c.environment,'provider','osrm'));
 return true;
end $$;
-- A saved favorite is explicitly chosen. Recents require a separate opt-in
-- and expire in seven days. Both can be deleted by the person at any time.
create table private.ride_place_history(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 category text not null check(category in ('favorite','recent')), point jsonb not null check(private.valid_ride_point(point)),
 used_at timestamptz not null default now(),unique(owner_id,category,point)
);
create function public.ride_my_places() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if not private.ride_active_user(u) then raise exception 'not_allowed'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',category,'point',point) order by used_at desc),'[]')
   from private.ride_place_history where owner_id=u and (category='favorite' or used_at>now()-interval '7 days'));
end $$;
create function public.ride_store_place(p_kind text,p_point jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('quote');item uuid;
begin
 if p_kind is null or p_kind not in ('favorite','recent') or not private.valid_ride_point(p_point) then raise exception 'invalid_point'; end if;
 perform 1 from public.profiles where id=u for no key update;
 insert into private.ride_place_history(owner_id,category,point) values(u,p_kind,p_point) on conflict(owner_id,category,point)
 do update set used_at=now() returning id into item;
 delete from private.ride_place_history where id in (select id from private.ride_place_history where owner_id=u and category=p_kind order by used_at desc,id offset 30);
 return item;
end $$;
create function public.ride_forget_place(p_id uuid) returns void language sql security definer set search_path='' as $$
 delete from private.ride_place_history where id=p_id and owner_id=auth.uid() and private.ride_active_user(auth.uid())
$$;
create function private.erase_ride_places() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from private.ride_place_history where owner_id=new.id; return null; end $$;
create trigger erase_ride_places after update of deleted_at on public.profiles for each row
 when(new.deleted_at is not null and old.deleted_at is null) execute function private.erase_ride_places();
select cron.schedule('workeasy-ride-recent-places','*/5 * * * *',
 $job$delete from private.ride_place_history where category='recent' and used_at<=now()-interval '7 days'+interval '5 minutes'$job$);
alter function public.ride_export_my_data() rename to ride_export_without_places;
alter function public.ride_export_without_places() set schema private;
create function public.ride_export_my_data() returns jsonb language sql stable security definer set search_path='' as $$
 select private.ride_export_without_places()||jsonb_build_object('my_places',public.ride_my_places())
$$;
revoke all on private.ride_places_osm,private.ride_route_areas,private.ride_place_history from public,anon,authenticated,service_role;
revoke all on function private.ride_point_in_scope(text,text,jsonb),private.ride_path_info(uuid),private.erase_ride_places(),
 private.ride_export_without_places() from public,anon,authenticated,service_role;
revoke all on function public.ride_measure_input(uuid,uuid),public.ride_measure_commit(uuid,uuid,bigint,int,int,jsonb) from public,anon,authenticated;
grant execute on function public.ride_measure_input(uuid,uuid),public.ride_measure_commit(uuid,uuid,bigint,int,int,jsonb) to service_role;
revoke all on function public.ride_search_places(text,text),public.ride_route_waypoints(uuid,jsonb,text),public.ride_route_detail(uuid),
 public.ride_navigation_data(uuid),public.ride_my_places(),public.ride_store_place(text,jsonb),public.ride_forget_place(uuid),
 public.ride_export_my_data() from public,anon,service_role;
grant execute on function public.ride_search_places(text,text),public.ride_route_waypoints(uuid,jsonb,text),public.ride_route_detail(uuid),
 public.ride_navigation_data(uuid),public.ride_my_places(),public.ride_store_place(text,jsonb),public.ride_forget_place(uuid),
 public.ride_export_my_data() to authenticated;
-- PostgreSQL views bind by function OID. Rebind the account export after
-- moving the prior implementation into the private schema.
create or replace view public.my_ride_data_export with(security_invoker=true) as
 select auth.uid() as id,public.ride_export_my_data() as mobility where auth.uid() is not null;
