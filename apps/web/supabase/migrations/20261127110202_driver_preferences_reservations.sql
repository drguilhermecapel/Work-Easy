-- An airport pickup area denotes one approved terminal; a city or neighborhood is not a terminal.
create table private.ride_airport_rules(
 id uuid primary key default gen_random_uuid(), environment text not null references private.ride_network(environment),
 name text not null check(length(name) between 2 and 120), pickup_area text not null, pickup_instruction text not null,
 wait_lat double precision not null check(wait_lat between -90 and 90), wait_lng double precision not null check(wait_lng between -180 and 180),
 radius_m int not null check(radius_m between 30 and 1000), authority_reference text not null check(length(trim(authority_reference))>3),
 valid_until timestamptz not null, enabled boolean not null default false, unique(environment,pickup_area)
);
create table private.ride_airport_queue(
 id bigint generated always as identity primary key, terminal uuid not null references private.ride_airport_rules(id),
 driver_id uuid not null references public.profiles(id) on delete cascade, entered_at timestamptz not null default clock_timestamp(),
 present_until timestamptz not null, left_at timestamptz, outcome text check(outcome in ('left','called','declined','expired','paused')),
 called_leg uuid references public.ride_legs(id)
);
create unique index ride_one_airport_queue on private.ride_airport_queue(driver_id) where left_at is null;
create index ride_airport_fifo on private.ride_airport_queue(terminal,id) where left_at is null;
create table private.ride_reservation_releases(
 leg_id uuid not null references public.ride_legs(id), driver_id uuid not null references private.ride_subjects(id),
 released_by uuid references private.ride_subjects(id), operation_id uuid not null, reason text not null check(reason in ('driver_unavailable','no_show')),
 at timestamptz not null default now(), primary key(driver_id,operation_id)
);
revoke all on private.ride_airport_rules,private.ride_airport_queue,private.ride_reservation_releases from public,anon,authenticated,service_role;

-- A fictitious terminal with its own pickup area and published FIFO rule for rehearsal only.
insert into private.ride_airport_rules(environment,name,pickup_area,pickup_instruction,wait_lat,wait_lng,radius_m,authority_reference,valid_until,enabled)
 values('simulation','Terminal de ensaio','Terminal de ensaio','Embarque no ponto T do terminal fictício.',-23.6191632,-46.6349565,180,'ficticio-fifo-v1','infinity',true);
insert into private.ride_routes(environment,origin,destination,meters,minutes,origin_point,destination_point,verified_ref,verified_until)
 values('simulation','Terminal de ensaio','Saúde',511,1,'{"lat":-23.6191632,"lng":-46.6349565,"label":"Ponto T (ensaio)"}','{"lat":-23.6172244,"lng":-46.6304177,"label":"Ponto Saúde (ensaio)"}','ficticio-terminal-v1','infinity'),
 ('simulation','Saúde','Terminal de ensaio',511,1,'{"lat":-23.6172244,"lng":-46.6304177,"label":"Ponto Saúde (ensaio)"}','{"lat":-23.6191632,"lng":-46.6349565,"label":"Ponto T (ensaio)"}','ficticio-terminal-v1','infinity');
insert into private.ride_approach_routes(environment,origin_area,destination_area,minutes,reference,valid_until,meters) values
 ('simulation','Terminal de ensaio','Terminal de ensaio',4,'ficticio-terminal-v1','infinity',250),
 ('simulation','Terminal de ensaio','Saúde',1,'ficticio-terminal-v1','infinity',511),
 ('simulation','Saúde','Terminal de ensaio',1,'ficticio-terminal-v1','infinity',511);
create function private.driver_terminal_open(t private.ride_airport_rules) returns boolean language sql stable security definer set search_path='' as $$
 select t.environment=private.ride_env() and t.enabled and t.valid_until>statement_timestamp()
  and private.ride_area_allowed(t.environment,t.pickup_area,'dispatch') and exists(
    select from private.ride_dispatch_rules cfg join private.ride_network f using(environment) where cfg.environment=t.environment
      and cfg.enabled and f.module_enabled and f.dispatch_enabled and f.quote_enabled)
$$;
create function private.driver_trip_compatible(u uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select not exists (
  select from private.ride_driver_preferences p where p.driver_id=u and p.arrive_by>statement_timestamp()
   and (l.destination<>p.destination_area or upper((select driver_slot from private.ride_approach_plan(u,l)))>p.arrive_by))
 and not exists (
  select from public.ride_legs prev join private.ride_arrival_estimates eta on eta.leg_id=prev.id
   where prev.driver_id=u and prev.id<>l.id and prev.status='boarded' and eta.updated_at>=now()-interval '30 minutes'
    and eta.arrives_at+make_interval(mins=>coalesce(private.ride_approach_minutes(u,l),0))>l.pickup_at)
 and not exists(
  select from private.ride_airport_rules t where t.environment=l.environment and t.pickup_area=l.origin
   and (not private.driver_terminal_open(t) or t.valid_until<upper(l.slot) or not exists (
    select from private.ride_airport_queue q where q.driver_id=u and q.terminal=t.id and q.left_at is null and q.present_until>statement_timestamp())))
$$;
alter function private.ride_offer_eligible(uuid,public.ride_legs) rename to ride_pre_dispatch_eligible;
create function private.ride_offer_eligible(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select private.ride_pre_dispatch_eligible(p_driver,l) and private.driver_trip_compatible(p_driver,l)
$$;
revoke all on function private.driver_terminal_open(private.ride_airport_rules),private.driver_trip_compatible(uuid,public.ride_legs),
 private.ride_offer_eligible(uuid,public.ride_legs) from public,anon,authenticated,service_role;

create function public.driver_save_preferences(p_destination text,p_arrive_by timestamptz,p_cost_per_km integer) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('module');
begin
 if not exists(select from public.ride_drivers where id=u and environment=private.ride_env())
   or (p_destination is null)<>(p_arrive_by is null) or p_cost_per_km not between 0 and 2000
   or (p_destination is not null and (p_arrive_by<=now() or p_arrive_by>now()+interval '24 hours' or
     not exists(select from private.ride_routes where environment=private.ride_env() and destination=p_destination)))
 then raise exception 'invalid_input'; end if;
 insert into private.ride_driver_preferences as p(driver_id,destination_area,arrive_by,cost_per_km_cents)
 values(u,p_destination,p_arrive_by,p_cost_per_km) on conflict(driver_id) do update
   set destination_area=excluded.destination_area,arrive_by=excluded.arrive_by,cost_per_km_cents=excluded.cost_per_km_cents;
 perform private.dispatch_ride_leg(x.id) from(
   select l.id from public.ride_legs l where l.status='requested' and l.environment=private.ride_env()
    and l.pickup_at+interval '10 minutes'>statement_timestamp()
    and (private.ride_offer_eligible(u,l) or exists(select from private.ride_driver_offers o where o.leg_id=l.id and o.driver_id=u and o.state='offered'))
    order by l.pickup_at limit 80) x;
end $$;
create function public.driver_airport_queue(p_terminal uuid,p_join boolean,p_lat double precision,p_lng double precision,p_accuracy double precision) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('module'); t private.ride_airport_rules; q private.ride_airport_queue; distance_m double precision;
begin
 perform 1 from public.ride_drivers where id=u and environment=private.ride_env() for update;
 if not found then raise exception 'not_allowed'; end if;
 select * into t from private.ride_airport_rules where id=p_terminal and environment=private.ride_env();
 if not found or p_join is null then raise exception 'invalid_input'; end if;
 select * into q from private.ride_airport_queue where driver_id=u and left_at is null for update;
 if p_join=false then
   update private.ride_airport_queue set left_at=now(),outcome='left' where id=q.id and terminal=t.id; return;
 end if;
 if not private.driver_terminal_open(t) or not exists(select from public.ride_drivers where id=u and online)
    or not private.ride_driver_valid(u,private.sp_date(now())) then raise exception 'offer_unavailable'; end if;
 if p_lat is null or p_lng is null or p_accuracy is null or p_lat not between -90 and 90 or p_lng not between -180 and 180
    or p_accuracy not between 0 and least(100,t.radius_m/2) then raise exception 'invalid_input'; end if;
 -- The measured point with its uncertainty circle must be inside the permitted waiting area. Do not store its coordinates.
 distance_m:=12742000*asin(least(1,sqrt(power(sin(radians(p_lat-t.wait_lat)/2),2)+cos(radians(t.wait_lat))*cos(radians(p_lat))*power(sin(radians(p_lng-t.wait_lng)/2),2))));
 if distance_m+p_accuracy>t.radius_m then raise exception 'outside_waiting_area'; end if;
 if q.id is not null and q.terminal=t.id and q.present_until>statement_timestamp() then
   update private.ride_airport_queue set present_until=least(t.valid_until,now()+interval '10 minutes') where id=q.id;
 else
   update private.ride_airport_queue set left_at=now(),outcome=case when present_until<=now() then 'expired' else 'left' end where id=q.id;
   insert into private.ride_airport_queue(terminal,driver_id,present_until) values(t.id,u,least(t.valid_until,now()+interval '10 minutes'));
 end if;
 update private.ride_dispatch_rounds w set next_scan=now() from public.ride_legs l
   where l.id=w.leg_id and l.origin=t.pickup_area and w.status in ('waiting','offered');
 perform private.recover_ride_dispatch();
end $$;

create function public.driver_preferences() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('module');
begin
 if not exists(select from public.ride_drivers where id=u and environment=private.ride_env()) then raise exception 'not_allowed'; end if;
 return jsonb_build_object('destination',(select destination_area from private.ride_driver_preferences where driver_id=u and arrive_by>now()),
  'arrive_by',(select arrive_by from private.ride_driver_preferences where driver_id=u and arrive_by>now()),
  'cost_per_km',(select cost_per_km_cents from private.ride_driver_preferences where driver_id=u),
  'terminals',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',t.name,'instruction',t.pickup_instruction,
    'reference',t.authority_reference,'lat',t.wait_lat,'lng',t.wait_lng,'radius_m',t.radius_m,'until',q.present_until,
    'position',case when q.id is not null then 1+(select count(*) from private.ride_airport_queue preceding where preceding.terminal=t.id
     and preceding.left_at is null and preceding.present_until>now() and preceding.id<q.id) end) order by t.name),'[]')
    from private.ride_airport_rules t left join private.ride_airport_queue q on q.terminal=t.id and q.driver_id=u and q.left_at is null and q.present_until>now()
    where private.driver_terminal_open(t)));
end $$;

-- A reservation can return to dispatch only before departure, boarding, a charge or human adjudication.
-- Each release has a durable key. Its previous driver cannot accept the same commitment again.
create function private.release_driver_reservation(p_leg uuid,p_actor uuid,p_key uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; prev private.ride_reservation_releases; now_at timestamptz:=statement_timestamp();
begin
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
 if not found or p_key is null then raise exception 'not_allowed'; end if;
 select * into prev from private.ride_reservation_releases where released_by=p_actor and operation_id=p_key;
 if found then
   if prev.leg_id<>p_leg or prev.reason<>p_reason then raise exception 'idempotency_conflict'; end if;
   return;
 end if;
 if l.status<>'accepted' or l.driver_id is null or
  not exists(select from public.rides r where r.id=l.ride_id and r.scheduled_at is not null)
  or not exists(select from private.ride_dispatch_rules where environment=l.environment and enabled)
  or exists(select from private.ride_financial_accounts where leg_id=l.id)
  or (p_reason='driver_unavailable' and l.driver_id<>p_actor)
  or (p_reason='no_show' and (l.pickup_at>now_at or not public.is_admin()))
  or p_reason not in ('driver_unavailable','no_show') then raise exception 'invalid_transition'; end if;
 insert into private.ride_reservation_releases(leg_id,driver_id,released_by,operation_id,reason) values(l.id,l.driver_id,p_actor,p_key,p_reason);
 insert into private.ride_events(actor_id,operation_key,leg_id,action,from_status,to_status)
   values(p_actor,p_key,l.id,'reservation_'||p_reason,l.status,'requested');
 insert into private.ride_declines values(l.id,l.driver_id) on conflict do nothing;
 update private.ride_dispatch_rounds set generation=generation+1,status='waiting',next_scan=now() where leg_id=l.id;
 update public.ride_legs set driver_id=null,driver_slot=null,status='requested',updated_at=now() where id=l.id;
 delete from private.ride_arrival_estimates where leg_id=l.id;
end $$;
create function public.driver_release_reservation(p_leg uuid,p_key uuid,p_no_show boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('module');
begin perform private.release_driver_reservation(p_leg,u,p_key,case when p_no_show then 'no_show' else 'driver_unavailable' end); end $$;
revoke all on function private.release_driver_reservation(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.driver_save_preferences(text,timestamptz,int),public.driver_airport_queue(uuid,boolean,double precision,double precision,double precision),
 public.driver_preferences(),public.driver_release_reservation(uuid,uuid,boolean) from public,anon;
grant execute on function public.driver_save_preferences(text,timestamptz,int),public.driver_airport_queue(uuid,boolean,double precision,double precision,double precision),
 public.driver_preferences(),public.driver_release_reservation(uuid,uuid,boolean) to authenticated;

create or replace function private.driver_wave_size(l public.ride_legs,p_size integer) returns integer language sql stable security definer set search_path='' as $$
 select case when exists(select from private.ride_airport_rules t where t.environment=l.environment and t.pickup_area=l.origin) then 1 else p_size end
$$;
create or replace function private.driver_queue_order(p_driver uuid,l public.ride_legs) returns bigint language sql stable security definer set search_path='' as $$
 select q.id from private.ride_airport_queue q join private.ride_airport_rules t on t.id=q.terminal
   where t.pickup_area=l.origin and t.environment=l.environment and q.driver_id=p_driver and q.left_at is null and q.present_until>now()
$$;
create function private.finish_airport_call() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state in ('assigned','expired','declined') then
   update private.ride_airport_queue q set left_at=now(),called_leg=new.leg_id,outcome=case when new.state='assigned' then 'called' else new.state end
   from private.ride_airport_rules t join public.ride_legs l on l.environment=t.environment and l.origin=t.pickup_area
   where l.id=new.leg_id and q.terminal=t.id and q.driver_id=new.driver_id and q.left_at is null;
 end if;
 return null;
end $$;
create trigger airport_offer_closed after update of state on private.ride_driver_offers for each row execute function private.finish_airport_call();
create function private.leave_airport_offline() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.ride_airport_queue set left_at=now(),outcome='paused' where driver_id=new.id and left_at is null;
 return null;
end $$;
create trigger airport_pause after update of online on public.ride_drivers for each row when(old.online and not new.online) execute function private.leave_airport_offline();
revoke all on function private.finish_airport_call(),private.leave_airport_offline() from public,anon,authenticated,service_role;

-- Retire transient matching/location preferences on D7. Transaction records follow O16.
create function private.retire_driver_preferences() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from private.ride_driver_preferences where driver_id=new.id;
 delete from private.ride_airport_queue where driver_id=new.id;
 delete from private.ride_driver_interest where driver_id=new.id;
 delete from private.ride_driver_offers where driver_id=new.id;
 delete from private.ride_offer_history where driver_id=new.id;
 return null;
end $$;
create trigger erase_driver_preferences after update of deleted_at on public.profiles for each row
 when(new.deleted_at is not null and old.deleted_at is null) execute function private.retire_driver_preferences();
revoke all on function private.retire_driver_preferences() from public,anon,authenticated,service_role;
select cron.schedule('workeasy-driver-offer-retention','17 4 * * *',
 $job$delete from private.ride_driver_offers where state<>'offered' and expires_at<now()-interval '30 days';
 delete from private.ride_driver_interest where at<now()-interval '30 days';
 delete from private.ride_offer_history where at<now()-interval '30 days';
 delete from private.ride_airport_queue where present_until<now()-interval '30 days';
 update private.ride_driver_preferences set destination_area=null,arrive_by=null where arrive_by<=now()$job$);

-- Store the leg phase/checkpoint and the estimate made before reaching pickup. Raw navigation inputs are transient.
create table private.ride_navigation_progress(
 leg_id uuid primary key references public.ride_legs(id) on delete cascade, stop_index int not null default 0,
 expected_pickup timestamptz, actual_pickup timestamptz, check(stop_index between 0 and 8)
);
revoke all on private.ride_navigation_progress from public,anon,authenticated,service_role;
create function private.capture_pickup_deviation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.ride_navigation_progress as n(leg_id,expected_pickup,actual_pickup)
 select new.leg_id,(select arrives_at from private.ride_arrival_estimates where leg_id=new.leg_id),new.arrived_at
 on conflict(leg_id) do update set actual_pickup=excluded.actual_pickup,expected_pickup=coalesce(excluded.expected_pickup,n.expected_pickup);
 return null;
end $$;
create trigger ride_navigation_arrival after insert on private.ride_pickup_arrivals for each row execute function private.capture_pickup_deviation();
revoke all on function private.capture_pickup_deviation() from public,anon,authenticated,service_role;
create function public.driver_navigation(p_leg uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; u uuid:=auth.uid(); detail jsonb; points jsonb; n private.ride_navigation_progress; dest jsonb;
begin
 select * into l from public.ride_legs where id=p_leg and driver_id=u and environment=private.ride_env() and status in ('accepted','arriving','boarded');
 if not found or not private.ride_active_user(u) then raise exception 'not_allowed'; end if;
 if l.status='accepted' and l.pickup_at>now()+interval '30 minutes' then return jsonb_build_object('phase','scheduled'); end if;
 points:=public.ride_leg_points(l.id);
 if to_regprocedure('public.ride_navigation_data(uuid)') is not null then detail:=public.ride_navigation_data(l.id); end if;
 select * into n from private.ride_navigation_progress where leg_id=l.id;
 dest:=case when l.status='boarded' then coalesce((detail->'stops')->coalesce(n.stop_index,0),points->'destination') else points->'origin' end;
 return jsonb_build_object('phase',l.status,'target',dest,'origin',points->'origin','destination',points->'destination',
  'stops',coalesce(detail->'stops','[]'::jsonb),'index',coalesce(n.stop_index,0),'instruction',detail->'instruction',
  'geometry',case when l.status='boarded' then detail->'geometry' end,
  'external_allowed',coalesce((select external_navigation from private.ride_dispatch_rules where environment=l.environment),false),
  'simulation',l.environment='simulation',
  'pickup_deviation_seconds',extract(epoch from n.actual_pickup-n.expected_pickup)::integer);
end $$;
create function public.driver_reach_waypoint(p_leg uuid,p_index integer) returns integer language plpgsql security definer set search_path='' as $$
declare ctx jsonb; current_index int;
begin
 perform 1 from public.ride_legs where id=p_leg and driver_id=auth.uid() and status='boarded' for update;
 if not found then raise exception 'not_allowed'; end if;
 ctx:=public.driver_navigation(p_leg);current_index:=(ctx->>'index')::int;
 if p_index is null or p_index<0 or p_index>=jsonb_array_length(ctx->'stops') or p_index>current_index then raise exception 'invalid_transition'; end if;
 if p_index=current_index then
   insert into private.ride_navigation_progress as n(leg_id,stop_index) values(p_leg,p_index+1) on conflict(leg_id) do update set stop_index=excluded.stop_index;
   return p_index+1;
 end if;
 return current_index;
end $$;
revoke all on function public.driver_navigation(uuid),public.driver_reach_waypoint(uuid,integer) from public,anon;
grant execute on function public.driver_navigation(uuid),public.driver_reach_waypoint(uuid,integer) to authenticated;
