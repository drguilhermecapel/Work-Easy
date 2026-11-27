-- Driver signals are opt-in per deployment. A simulator never accepts a GPS
-- observation or a real device token. Exact points are inaccessible to clients.
create table private.ride_signal_settings (
  singleton boolean primary key default true check(singleton),
  location_enabled boolean not null default false,
  push_enabled boolean not null default false
);
insert into private.ride_signal_settings default values;
create table private.ride_observations (
  leg_id uuid not null references public.ride_legs(id) on delete cascade,
  observed_at timestamptz not null, latitude double precision not null check(latitude between -90 and 90),
  longitude double precision not null check(longitude between -180 and 180),
  accuracy_m double precision not null check(accuracy_m between 0 and 200),
  onboard boolean not null, primary key(leg_id,observed_at)
);
create index ride_observations_expiry on private.ride_observations(observed_at);
create table private.ride_arrival_estimates (
  leg_id uuid primary key references public.ride_legs(id) on delete cascade,
  arrives_at timestamptz not null, updated_at timestamptz not null default now()
);
create table private.ride_ratings (
  leg_id uuid primary key references public.ride_legs(id),
  stars smallint not null check(stars between 1 and 5), created_at timestamptz not null default now()
);
create table private.ride_help (
  leg_id uuid not null references public.ride_legs(id), actor uuid not null references public.profiles(id),
  reason text not null, task_id uuid not null references public.support_tasks(id),
  primary key(leg_id,actor,reason)
);
create function public.ride_can_transmit(p_leg uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select from public.ride_legs l join public.rides r on r.id=l.ride_id
 join public.ride_drivers d on d.id=l.driver_id
 join public.profiles p on p.id=d.id and p.deleted_at is null
 cross join private.ride_signal_settings g
 where l.id=p_leg and l.driver_id=auth.uid() and private.ride_active_user(r.passenger_id) and l.status in ('arriving','boarded')
 and private.ride_driver_valid(d.id,private.sp_date(now())) and r.environment='live' and g.location_enabled)
$$;
create function public.ride_send_position(p_leg uuid, p_at timestamptz, p_lat double precision,
 p_lng double precision, p_accuracy double precision) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_status text;
begin
 select status into v_status from public.ride_legs where id=p_leg and driver_id=auth.uid() for share;
 if not public.ride_can_transmit(p_leg) then raise exception 'transmission_ended'; end if;
 if p_at is null or p_at < now()-interval '2 minutes' or p_at > now()+interval '15 seconds' then return false; end if;
 -- A stationary driver may send the same sample again after connectivity recovers.
 if exists(select from private.ride_observations where leg_id=p_leg and observed_at>=p_at-interval '3 seconds') then return false; end if;
 insert into private.ride_observations values(p_leg,p_at,p_lat,p_lng,p_accuracy,v_status='boarded') on conflict do nothing;
 return found;
end $$;
create function public.ride_report_eta(p_leg uuid,p_minutes integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_minutes is null or p_minutes not between 1 and 180 then raise exception 'invalid_eta'; end if;
 if not private.ride_active_user(auth.uid()) or not exists(select from public.ride_legs where id=p_leg and driver_id=auth.uid() and status in ('accepted','arriving','boarded') for share)
 then raise exception 'not_allowed'; end if;
 insert into private.ride_arrival_estimates values(p_leg,now()+make_interval(mins=>p_minutes),now())
 on conflict(leg_id) do update set arrives_at=excluded.arrives_at,updated_at=excluded.updated_at;
end $$;
create function public.ride_progress(p_leg uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare l public.ride_legs; r public.rides; eta private.ride_arrival_estimates; pos jsonb;
begin
 select * into l from public.ride_legs where id=p_leg;
 select * into r from public.rides where id=l.ride_id;
 if not private.ride_active_user(auth.uid()) or not (coalesce(auth.uid() in (r.passenger_id,l.payer_id,l.driver_id),false)
   or exists(select from public.bookings b where b.id=r.booking_id and b.client_id=auth.uid()) or public.is_admin()) or r.id is null
 then raise exception 'not_allowed'; end if;
 if l.status in ('accepted','arriving','boarded') then
  select * into eta from private.ride_arrival_estimates where leg_id=p_leg and updated_at>now()-interval '10 minutes' and arrives_at>=now();
 end if;
 -- Position is displayed only to the actual passenger during travel. Other
 -- participants receive the driver's ETA, including for a provider's home pickup.
 if r.environment='live' and r.passenger_id=auth.uid() and l.status='boarded' then
  select jsonb_build_object('lat',latitude,'lng',longitude,'at',observed_at) into pos
    from private.ride_observations where leg_id=p_leg and onboard and observed_at>now()-interval '2 minutes' order by observed_at desc limit 1;
 end if;
 return jsonb_build_object('status',l.status,'eta',eta.arrives_at,'position',pos,'simulation',r.environment='simulation');
end $$;
create function public.ride_rate(p_leg uuid,p_stars integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.ride_active_user(auth.uid()) or not exists(select from public.ride_legs l join public.rides r on l.ride_id=r.id
   where l.id=p_leg and l.status='completed' and r.passenger_id=auth.uid()) then raise exception 'not_allowed'; end if;
 if p_stars is null or p_stars not between 1 and 5 then raise exception 'invalid_rating'; end if;
 insert into private.ride_ratings values(p_leg,p_stars,now()) on conflict(leg_id) do update set stars=excluded.stars;
end $$;
create function public.ride_open_help(p_leg uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare task uuid; env text;
begin
 perform public.ride_progress(p_leg);
 if p_reason is null or p_reason not in ('safety','no_show','price','schedule','payment','other') then raise exception 'invalid_reason'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_leg::text || auth.uid()::text || p_reason,0));
 select task_id into task from private.ride_help where leg_id=p_leg and actor=auth.uid() and reason=p_reason;
 if found then return task; end if;
 select r.environment into env from public.rides r join public.ride_legs l on l.ride_id=r.id where l.id=p_leg;
 insert into public.support_tasks(kind,payload) values('ride_help',jsonb_build_object('leg_id',p_leg,'reason',p_reason,'environment',env)) returning id into task;
 insert into private.ride_help values(p_leg,auth.uid(),p_reason,task);
 return task;
end $$;
select cron.schedule('workeasy-ride-location-retention','*/5 * * * *',
  $job$delete from private.ride_observations where observed_at <= now()-interval '24 hours'$job$);
revoke all on private.ride_observations, private.ride_arrival_estimates, private.ride_signal_settings, private.ride_ratings, private.ride_help from public, anon, authenticated;
revoke all on function public.ride_can_transmit(uuid), public.ride_send_position(uuid,timestamptz,double precision,double precision,double precision),
 public.ride_report_eta(uuid,integer), public.ride_progress(uuid), public.ride_rate(uuid,integer), public.ride_open_help(uuid,text) from public, anon;
grant execute on function public.ride_can_transmit(uuid), public.ride_send_position(uuid,timestamptz,double precision,double precision,double precision),
 public.ride_report_eta(uuid,integer), public.ride_progress(uuid), public.ride_rate(uuid,integer), public.ride_open_help(uuid,text) to authenticated;
create table private.ride_devices (
 id uuid primary key default gen_random_uuid(), driver_id uuid not null references public.ride_drivers(id) on delete cascade,
 transport text not null check(transport in ('android','ios')), token text not null unique,
 expires_at timestamptz not null, unique(driver_id,transport)
);
create table private.ride_push_attempts (
 leg_id uuid not null references public.ride_legs(id), device_id uuid not null references private.ride_devices(id) on delete cascade,
 attempts int not null, leased_until timestamptz not null, delivered boolean not null default false,
 primary key(leg_id,device_id)
);
revoke all on private.ride_devices,private.ride_push_attempts from public,anon,authenticated;
create function public.ride_push_ready() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_signal_settings s, private.ride_deployment e, public.ride_drivers d
 join public.profiles p on p.id=d.id and p.deleted_at is null where s.push_enabled and e.environment='live' and d.id=auth.uid()
 and d.environment='live' and private.ride_driver_valid(d.id,private.sp_date(now())) and d.online)
$$;
create function public.ride_device(p_transport text,p_token text,p_enable boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Serialize new token registration with account erasure, which clears every device.
 perform 1 from public.profiles where id=auth.uid() and deleted_at is null for share;
 if not found then raise exception 'not_allowed'; end if;
 if p_enable is false then delete from private.ride_devices where driver_id=auth.uid() and transport=p_transport and token=p_token; return; end if;
 if p_enable is null or not public.ride_push_ready() then raise exception 'push_disabled'; end if;
 if p_transport not in ('ios','android') or p_token is null or p_token !~ '^[A-Za-z0-9:_-]{20,4096}$'
   or (p_transport='ios' and p_token !~ '^[0-9A-Fa-f]{64,256}$') then raise exception 'invalid_token'; end if;
 -- Device tokens cannot be reassigned from a different account as a side effect of a conflict.
 delete from private.ride_devices where expires_at<=now();
 insert into private.ride_devices(driver_id,transport,token,expires_at) values(auth.uid(),p_transport,p_token,now()+interval '8 hours')
 on conflict(driver_id,transport) do update set token=excluded.token,expires_at=excluded.expires_at;
end $$;
create function public.claim_ride_alerts() returns table(leg uuid,device uuid,transport text,token text,attempt int)
language sql security definer set search_path='' as $$
 with pending as (
 select l.id as leg,d.id as device from public.ride_legs l join public.rides r on r.id=l.ride_id,
 private.ride_devices d join public.ride_drivers m on m.id=d.driver_id,
 private.ride_signal_settings s, private.ride_network n
 where s.push_enabled and n.environment='live' and n.module_enabled and n.dispatch_enabled
 and r.environment='live' and m.environment='live' and m.online and m.status='approved' and m.valid_until>=private.sp_date(l.pickup_at)
 and private.ride_offer_eligible(m.id,l) and d.expires_at>now() and l.status='requested'
 and not exists(select from private.ride_push_attempts a where a.device_id=d.id and a.leg_id=l.id
 and (a.delivered or a.leased_until>now() or a.attempts>=3)) order by l.pickup_at,private.ride_approach_minutes(m.id,l) nulls last,m.id,d.id limit 12
 ), acquired as (
 insert into private.ride_push_attempts as a(leg_id,device_id,attempts,leased_until)
 select p.leg,p.device,1,now()+interval '2 minutes' from pending p
 on conflict(leg_id,device_id) do update set attempts=a.attempts+1, leased_until=now()+interval '2 minutes'
 where not a.delivered and a.leased_until<=now() and a.attempts<3 returning a.*
 )
 select a.leg_id,d.id,d.transport,d.token,a.attempts from acquired a join private.ride_devices d on d.id=a.device_id
$$;
create function public.ack_ride_alert(p_leg uuid,p_device uuid,p_attempt int) returns void
language sql security definer set search_path='' as $$
 update private.ride_push_attempts set delivered=true where leg_id=p_leg and device_id=p_device and attempts=p_attempt
$$;
revoke all on function public.ride_push_ready(),public.ride_device(text,text,boolean) from public,anon;
grant execute on function public.ride_push_ready(),public.ride_device(text,text,boolean) to authenticated;
revoke all on function public.claim_ride_alerts(),public.ack_ride_alert(uuid,uuid,int) from public,anon,authenticated;
grant execute on function public.claim_ride_alerts(),public.ack_ride_alert(uuid,uuid,int) to service_role;
create function private.dispatch_ride_alerts() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text; credential text;
begin
 delete from private.ride_devices where expires_at<=now();
 if not exists(select from private.ride_signal_settings where push_enabled) or not exists(select from private.ride_devices) then return; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='ride_alerts_url';
 select decrypted_secret into credential from vault.decrypted_secrets where name='cron_secret';
 if endpoint is not null and credential is not null then
 perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Authorization','Bearer '||credential,'Content-Type','application/json'),body:='{}'::jsonb);
 end if;
end $$;
revoke all on function private.dispatch_ride_alerts() from public,anon,authenticated;
select cron.schedule('workeasy-offer-alerts','* * * * *','select private.dispatch_ride_alerts()');
