-- WorkEasy's direct network. Use separate Supabase projects for rehearsal and live.
-- RPCs read the gate from a private table, never from a request or JWT metadata.
create table private.ride_deployment (
  singleton boolean primary key default true check(singleton),
  environment text not null check(environment in ('simulation','live'))
);
insert into private.ride_deployment(environment) values('simulation');
create table private.ride_network (
  environment text primary key check (environment in ('simulation','live')),
  module_enabled boolean not null default false,
  quote_enabled boolean not null default false,
  dispatch_enabled boolean not null default false,
  monetization_enabled boolean not null default false
);
insert into private.ride_network(environment) values ('simulation'),('live');

-- Synthetic public meeting areas and comparable route samples. The client can
-- select endpoints but cannot write distance, duration, tariff or payout.
-- Live authorizations are populated only through controlled backend provisioning.
-- Configure both endpoints of every corridor independently and renew the file on expiry.
create table private.ride_area_authorizations (
  area text primary key, legal_ref text not null check(length(trim(legal_ref)) between 1 and 160),
  privacy_ref text not null check(length(trim(privacy_ref)) between 1 and 160),
  ops_ref text not null check(length(trim(ops_ref)) between 1 and 160),
  until_at timestamptz not null, quote_enabled boolean not null default false,
  dispatch_enabled boolean not null default false, monetization_enabled boolean not null default false
);
create table private.ride_routes (
  environment text not null default 'simulation' references private.ride_network(environment),
  origin text not null, destination text not null,
  meters integer not null check (meters between 1 and 100000),
  minutes integer not null check (minutes between 1 and 240),
  origin_point jsonb,destination_point jsonb,verified_ref text,verified_until timestamptz,
  primary key (environment,origin,destination), check (origin <> destination)
);
insert into private.ride_routes(origin,destination,meters,minutes) values
  ('Saúde','Jabaquara',4400,18), ('Jabaquara','Saúde',4400,18),
  ('Saúde','Vila Mariana',4500,19), ('Vila Mariana','Saúde',4500,19),
  ('Vila Mariana','Jabaquara',8200,29), ('Jabaquara','Vila Mariana',8200,29);

create table private.ride_tariffs (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'simulation' references private.ride_network(environment),
  valid_from timestamptz not null, unique(environment,valid_from),
  base_cents int not null check (base_cents >= 0),
  km_cents int not null check (km_cents >= 0),
  minute_cents int not null check (minute_cents >= 0),
  minimum_cents int not null check (minimum_cents > 0),
  commission_bps int not null check (commission_bps between 0 and 10000)
);
insert into private.ride_tariffs(valid_from,base_cents,km_cents,minute_cents,minimum_cents,commission_bps)
values ('2020-01-01 00:00Z',450,180,35,1200,1000);

create table private.ride_extra_prices (
  tariff_id uuid not null references private.ride_tariffs(id),code text not null,label text not null,
  cents int not null check(cents between 1 and 100000),primary key(tariff_id,code)
);
insert into private.ride_extra_prices
  select t.id,e.code,e.label,e.cents from private.ride_tariffs t cross join
    (values ('luggage','Bagagem adicional',400),('toll','Pedágio',600)) e(code,label,cents)
  where t.environment='simulation';
revoke all on private.ride_extra_prices from public,anon,authenticated;

-- Additive capability: becoming a simulation driver leaves profiles.role intact.
create table public.ride_drivers (
  id uuid primary key references public.profiles(id),
  environment text not null references private.ride_network(environment),
  vehicle text not null check (vehicle in ('compact','sedan','van')),
  status text not null check (status in ('pending','approved','rejected')),
  valid_until date, online boolean not null default false,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz, updated_at timestamptz not null default now(),
  check (status <> 'approved' or (reviewed_by is not null and valid_until is not null))
);
-- A private verification record is tied to the specific driver AND vehicle.
-- Store references to reviewed evidence in restricted custody, not document images in the dispatcher.
create table private.ride_driver_credentials (
  driver_id uuid primary key references public.ride_drivers(id), vehicle_identifier text not null,
  vehicle_category text not null check(vehicle_category in ('compact','sedan','van')),
  driver_document_ref text not null check(length(trim(driver_document_ref))>0),
  vehicle_document_ref text not null check(length(trim(vehicle_document_ref))>0),
  insurance_ref text not null check(length(trim(insurance_ref))>0),
  driver_until date not null, vehicle_until date not null, insurance_until date not null,
  inspected_by uuid not null references public.profiles(id), verified_at timestamptz not null default now()
);
-- Coordinates live only in the restricted points table. Quote versions retain the
-- case ID, approved measurement and tariff, not a second copy of a home address.
create table private.ride_route_cases (
  id uuid primary key default gen_random_uuid(),environment text not null references private.ride_network(environment),
  request_key uuid not null,creator_id uuid not null references public.profiles(id),passenger_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id),client_id uuid references public.profiles(id),
  origin_area text not null,destination_area text not null,service_endpoint text check(service_endpoint in ('origin','destination')),
  status text not null check(status in ('draft','awaiting_review','verified')), reviewer_id uuid references public.profiles(id),
  meters integer check(meters between 1 and 100000),minutes integer check(minutes between 1 and 240),source_ref text,
  valid_until timestamptz not null,created_at timestamptz not null default now(),unique(creator_id,request_key)
);
create table private.ride_route_points (
  route_id uuid primary key references private.ride_route_cases(id) on delete cascade,
  origin jsonb,destination jsonb,initial_digest bytea not null,delete_by timestamptz not null,
  check(origin is not null or destination is not null)
);
revoke all on private.ride_route_cases,private.ride_route_points from public,anon,authenticated;
create table private.ride_quotes (
  environment text not null references private.ride_network(environment),
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  request_key uuid not null,
  booking_id uuid references public.bookings(id),
  passenger_id uuid not null references public.profiles(id),
  client_id uuid references public.profiles(id),
  scheduled_at timestamptz,
  request_legs jsonb not null, legs jsonb not null,
  required_users uuid[] not null,
  tariff_id uuid not null references private.ride_tariffs(id),
  expires_at timestamptz not null, created_at timestamptz not null default now(),
  status text not null check (status in ('awaiting_consent','requested','declined','superseded')),
  total_cents int not null check (total_cents > 0),
  unique(actor_id,request_key)
);
create index ride_quotes_booking_idx on private.ride_quotes(booking_id) where booking_id is not null;
create table private.ride_consents (
  quote_id uuid not null references private.ride_quotes(id), actor_id uuid not null,
  accepted boolean not null, at timestamptz not null default now(), primary key (quote_id, actor_id)
);
create table public.rides (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null unique references private.ride_quotes(id),
  environment text not null references private.ride_network(environment),
  passenger_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id),
  scheduled_at timestamptz, created_at timestamptz not null default now()
);
-- One canonical itinerary per service, across actors/quotes/request UUIDs.
alter table private.ride_quotes add column existing_ride_id uuid references public.rides(id);
create unique index rides_booking_uniq on public.rides(booking_id) where booking_id is not null;
create table public.ride_legs (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id), seq int not null check (seq between 1 and 4),
  origin text not null, destination text not null,
  pickup_at timestamptz not null, duration_minutes int not null check (duration_minutes > 0),
  slot tstzrange not null,
  fare_cents integer not null check (fare_cents>0), fee_cents integer not null check (fee_cents>=0),
  extras_cents integer not null default 0 check (extras_cents>=0),
  driver_cents integer not null check (driver_cents>=0 and driver_cents+fee_cents=fare_cents),
  payer_id uuid not null references public.profiles(id), tariff_id uuid not null references private.ride_tariffs(id),
  driver_id uuid references public.ride_drivers(id),
  source_quote_id uuid references private.ride_quotes(id),quote_seq int,
  route_case_id uuid unique references private.ride_route_cases(id),
  service_endpoint text check(service_endpoint in ('origin','destination')),
  replaces_id uuid unique references public.ride_legs(id),revision int not null default 1 check(revision>0),
  status text not null default 'requested' check (status in ('requested','accepted','arriving','boarded','completed','cancelled','unknown')),
  updated_at timestamptz not null default now(), unique(ride_id,seq,revision),
  environment text not null references private.ride_network(environment),

  exclude using gist (driver_id with =,slot with &&) where (status in ('accepted','arriving','boarded','unknown'))
);
create unique index ride_logical_position on public.ride_legs(ride_id,seq) where status<>'cancelled';
create index ride_open_legs_idx on public.ride_legs(pickup_at) where status='requested';
create table private.ride_events (
  actor_id uuid not null, operation_key uuid not null, leg_id uuid not null references public.ride_legs(id),
  action text not null, from_status text not null, to_status text not null,
  at timestamptz not null default now(), primary key(actor_id, operation_key)
);
create index ride_events_leg_idx on private.ride_events(leg_id,at);
create table private.ride_declines (
  leg_id uuid not null references public.ride_legs(id), driver_id uuid not null references public.ride_drivers(id),
  primary key(leg_id,driver_id)
);
alter table public.ride_drivers enable row level security;
alter table public.rides enable row level security;
alter table public.ride_legs enable row level security;
create policy ride_drivers_backend on public.ride_drivers for select to service_role using (true);
create policy rides_backend on public.rides for select to service_role using (true);
create policy ride_legs_backend on public.ride_legs for select to service_role using (true);
revoke all on public.ride_drivers,public.rides,public.ride_legs from public,anon,authenticated;
revoke all on private.ride_deployment,private.ride_area_authorizations,private.ride_driver_credentials,private.ride_network,private.ride_routes,private.ride_tariffs,private.ride_quotes,
  private.ride_consents,private.ride_events,private.ride_declines from public,anon,authenticated;

create function private.ride_env() returns text language sql stable security definer set search_path=''
as $$ select environment from private.ride_deployment where singleton $$;
revoke all on function private.ride_env() from public,anon,authenticated;

create function private.pin_ride_deployment() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or (new.environment<>old.environment and
     (exists(select from public.ride_drivers) or exists(select from private.ride_quotes) or exists(select from private.ride_route_cases))) then
    raise exception 'ride_environment_in_use';
  end if;
  return new;
end $$;
create trigger ride_deployment_pinned before update or delete on private.ride_deployment
for each row execute function private.pin_ride_deployment();
revoke all on function private.pin_ride_deployment() from public,anon,authenticated;

create function private.ride_area_allowed(p_env text,p_area text,p_capability text) returns boolean
language sql stable security definer set search_path='' as $$
  select p_env='simulation' or exists(select 1 from private.ride_area_authorizations a
    where a.area=p_area and a.until_at>now() and a.quote_enabled and
    case p_capability when 'quote' then true when 'dispatch' then a.dispatch_enabled
         when 'monetize' then a.monetization_enabled else false end)
$$;
revoke all on function private.ride_area_allowed(text,text,text) from public,anon,authenticated;

create function private.ride_driver_valid(p_driver uuid,p_day date) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select from public.ride_drivers d where d.id=p_driver and d.status='approved'
   and d.environment=private.ride_env() and d.valid_until>=p_day and
   (d.environment='simulation' or exists(select from private.ride_driver_credentials c
     where c.driver_id=d.id and c.vehicle_category=d.vehicle and least(c.driver_until,c.vehicle_until,c.insurance_until)>=p_day)))
$$;
revoke all on function private.ride_driver_valid(uuid,date) from public,anon,authenticated;

create function private.require_ride_feature(p_feature text) returns uuid
language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not exists(select 1 from public.profiles where id=v_uid and deleted_at is null) then
    raise exception 'not_allowed';
  end if;
  if not exists(select 1 from private.ride_network where environment=private.ride_env()
     and module_enabled and case p_feature when 'module' then true when 'quote' then quote_enabled
       when 'dispatch' then quote_enabled and dispatch_enabled else false end) then
    raise exception 'ride_feature_disabled';
  end if;
  return v_uid;
end $$;
revoke all on function private.require_ride_feature(text) from public,anon,authenticated;

create function public.ride_apply_driver(p_vehicle text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_ride_feature('module'); v_driver public.ride_drivers;
begin
  if p_vehicle is null or p_vehicle not in ('compact','sedan','van') then raise exception 'invalid_vehicle'; end if;
  perform singleton from private.ride_deployment for share;
  insert into public.ride_drivers(id,environment,vehicle,status) values(v_uid,private.ride_env(),p_vehicle,'pending')
    on conflict(id) do nothing;
  select * into strict v_driver from public.ride_drivers where id=v_uid for update;
  if v_driver.vehicle <> p_vehicle or v_driver.status='rejected' then
    if exists(select 1 from public.ride_legs where driver_id=v_uid and status in ('accepted','arriving','boarded','unknown')) then
      raise exception 'driver_has_active_ride';
    end if;
    update public.ride_drivers set vehicle=p_vehicle,status='pending',valid_until=null,online=false,
      reviewed_at=null,reviewed_by=null,updated_at=now() where id=v_uid returning * into v_driver;
  end if;
  return jsonb_build_object('status',v_driver.status,'vehicle',v_driver.vehicle);
end $$;

create function public.ride_review_driver(p_driver uuid,p_approve boolean,p_valid_until date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_ride_feature('module'); v_status text;
begin
  if not public.is_admin() or p_driver=v_uid then raise exception 'not_allowed'; end if;
  if p_approve is null or (p_approve and (p_valid_until is null or p_valid_until < (now() at time zone 'America/Sao_Paulo')::date)) then
    raise exception 'invalid_validity';
  end if;
  if p_approve and private.ride_env()='live' and not exists(select 1 from private.ride_driver_credentials c
     join public.ride_drivers d on d.id=c.driver_id and c.vehicle_category=d.vehicle
     where c.driver_id=p_driver and c.inspected_by<>p_driver and least(c.driver_until,c.vehicle_until,c.insurance_until)>=p_valid_until) then
    raise exception 'missing_driver_evidence';
  end if;
  v_status := case when p_approve then 'approved' else 'rejected' end;
  update public.ride_drivers set status=v_status,valid_until=case when p_approve then p_valid_until end,
      online=false,reviewed_by=v_uid,reviewed_at=now(),updated_at=now() where id=p_driver;
  if not found then raise exception 'driver_not_found'; end if;
  perform private.audit('ride.driver_review','ride_drivers',p_driver::text,jsonb_build_object('status',v_status,'valid_until',p_valid_until,'environment',private.ride_env()));
  return jsonb_build_object('status',v_status);
end $$;

create function public.ride_set_online(p_online boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_ride_feature('module');
begin
  if p_online is null then raise exception 'invalid_online'; end if;
  update public.ride_drivers set online=p_online,updated_at=now() where id=v_uid
    and (not p_online or private.ride_driver_valid(v_uid,(now() at time zone 'America/Sao_Paulo')::date));
  if not found then raise exception 'driver_ineligible'; end if;
  return jsonb_build_object('online',p_online);
end $$;

create function private.ride_quote_view(q private.ride_quotes,p_uid uuid) returns jsonb
language sql stable set search_path='' as $$
  select jsonb_build_object('id',q.id,'booking_id',q.booking_id,'expires_at',q.expires_at,
    'scheduled_at',q.scheduled_at,'total_cents',q.total_cents,'environment',q.environment,
    'status',case when q.status='awaiting_consent' and q.expires_at<=now() then 'expired' else q.status end,
    'required_from_me',p_uid=any(q.required_users),
    'accepted_by_me',exists(select from private.ride_consents where quote_id=q.id and actor_id=p_uid and accepted),
    'legs',(select jsonb_agg((l - array['payer_id','driver_cents','fee_cents','meters','duration_minutes'])
      || case when p_uid=q.passenger_id then jsonb_build_object('meters',l->'meters','duration_minutes',l->'duration_minutes')
         else jsonb_build_object('origin','Reservado ao passageiro','destination','Reservado ao passageiro') end
      || case when (l->>'payer_id')::uuid=p_uid then '{}'::jsonb else
         jsonb_build_object('fare_cents',null,'limit_cents',null,'extras_cents',null) end order by pos)
      from jsonb_array_elements(q.legs) with ordinality e(l,pos)))
$$;
revoke all on function private.ride_quote_view(private.ride_quotes,uuid) from public,anon,authenticated;

create function public.ride_quote(p_key uuid,p_booking uuid,p_scheduled_at timestamptz,p_legs jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := private.require_ride_feature('quote'); v_env text; b public.bookings;
  q private.ride_quotes; t private.ride_tariffs; r private.ride_routes;
  v_existing uuid; v_original public.ride_legs; v_original_ride public.rides; v_replacements uuid[]:='{}';
  v_extras int; v_codes text[]; v_required uuid[]; v_passenger uuid; v_client uuid; v_payer uuid; v_role text;
  v_case private.ride_route_cases; v_endpoint text; v_legs jsonb := '[]'; v_input jsonb; v_start timestamptz; v_end timestamptz;
  v_fare int; v_fee int; v_total int := 0; v_index int := 0; v_monetize boolean;
begin
  perform singleton from private.ride_deployment for share;
  v_env := private.ride_env();
  if p_key is null or jsonb_typeof(p_legs) is distinct from 'array' then raise exception 'invalid_ride_request'; end if;
  if jsonb_array_length(p_legs) not between 1 and 4 or pg_column_size(p_legs)>4096 then raise exception 'invalid_itinerary'; end if;
  -- Same actor, same intent: retry retrieves the exact original quote.
  perform 1 from public.profiles where id=v_uid for no key update;
  select * into q from private.ride_quotes where actor_id=v_uid and request_key=p_key;
  if found then
    if q.booking_id is distinct from p_booking or q.scheduled_at is distinct from p_scheduled_at
      or q.request_legs<>p_legs then raise exception 'idempotency_conflict'; end if;
    return private.ride_quote_view(q,v_uid);
  end if;
  if p_scheduled_at is not null and (p_scheduled_at < now() or p_scheduled_at > now()+interval '30 days') then raise exception 'invalid_schedule'; end if;
  if (select count(*) from private.ride_quotes where actor_id=v_uid and created_at>now()-interval '1 hour')>=60 then raise exception 'ride_quote_limit'; end if;
  if p_legs->0 ? 'replaces' then
    select r0.* into v_original_ride from public.rides r0 join public.ride_legs l on l.ride_id=r0.id
      where l.id=(p_legs->0->>'replaces')::uuid and r0.environment=v_env and r0.booking_id is not distinct from p_booking
      and (r0.passenger_id=v_uid or exists(select from public.bookings bk where bk.id=p_booking and bk.client_id=v_uid));
    if not found then raise exception 'replacement_unavailable'; end if;
    v_existing:=v_original_ride.id;
  end if;
  if p_booking is null then
    v_passenger:=v_uid; v_required:=array[v_uid];
  else
    select * into b from public.bookings where id=p_booking for update;
    if not found or b.origin <> 'platform' or b.client_id is null or v_uid not in (b.client_id,b.provider_id)
       or b.status not in ('accepted','paid','in_progress') then raise exception 'booking_not_eligible'; end if;
    if v_existing is null and exists(select from public.rides where booking_id=p_booking) then raise exception 'ride_already_requested'; end if;
    v_passenger:=b.provider_id; v_client:=b.client_id; v_required:=array[v_passenger];
  end if;
  select * into t from private.ride_tariffs where environment=v_env and valid_from<=now() order by valid_from desc limit 1;
  if not found then raise exception 'no_active_tariff'; end if;
  select monetization_enabled into v_monetize from private.ride_network where environment=v_env;
  for v_input in select value from jsonb_array_elements(p_legs) loop
    v_index:=v_index+1;
    if jsonb_typeof(v_input)<>'object' or (v_input-array['origin','destination','payer','pickup_at','replaces','extras','route_id','service_endpoint'])<>'{}'::jsonb then
      raise exception 'invalid_leg';
    end if;
    v_endpoint:=case when p_booking is null then null else coalesce(v_input->>'service_endpoint',
      case when v_index=1 then 'destination' else 'origin' end) end;
    if v_endpoint is not null and v_endpoint not in ('origin','destination') then raise exception 'invalid_endpoint'; end if;
    if v_input ? 'route_id' then
      select c.* into v_case from private.ride_route_cases c join private.ride_route_points pt on pt.route_id=c.id
        where c.id=(v_input->>'route_id')::uuid and c.environment=v_env and c.booking_id is not distinct from p_booking
          and c.passenger_id=v_passenger and c.status='verified' and c.valid_until>now() and pt.delete_by>now()
          and c.origin_area=v_input->>'origin' and c.destination_area=v_input->>'destination'
          and not exists(select from public.ride_legs l where l.route_case_id=c.id);
      if not found or exists(select from jsonb_array_elements(v_legs) old where old->>'route_id'=v_input->>'route_id') then raise exception 'route_unavailable'; end if;
      r.origin:=v_case.origin_area;r.destination:=v_case.destination_area;r.meters:=v_case.meters;r.minutes:=v_case.minutes;
      v_endpoint:=v_case.service_endpoint;
    else
      select * into r from private.ride_routes where environment=v_env and origin=v_input->>'origin' and destination=v_input->>'destination';
      if v_env='live' then raise exception 'verified_route_required'; end if;
      if not found then raise exception 'route_unavailable'; end if;
    end if;
    if not private.ride_area_allowed(v_env,r.origin,'quote') or not private.ride_area_allowed(v_env,r.destination,'quote') then raise exception 'route_unavailable'; end if;
    v_start:=coalesce((v_input->>'pickup_at')::timestamptz,case when v_index=1 then coalesce(p_scheduled_at,now()) else v_end end);
    if (v_index=1 and ((p_scheduled_at is not null and v_start<>p_scheduled_at) or
       (p_scheduled_at is null and (v_start<now()-interval '2 minutes' or v_start>now()+interval '2 minutes'))))
       or v_start>now()+interval '30 days' or (v_end is not null and v_start<v_end) then raise exception 'invalid_schedule'; end if;
    v_end:=v_start+make_interval(mins=>r.minutes);
    v_role:=v_input->>'payer';
    if p_booking is null and v_role='passenger' then v_payer:=v_uid;
    elsif p_booking is not null and v_role='client' then v_payer:=v_client;
    elsif p_booking is not null and v_role='provider' then v_payer:=v_passenger;
    else raise exception 'invalid_payer'; end if;
    if not v_payer=any(v_required) then v_required:=array_append(v_required,v_payer); end if;
    if v_existing is not null then
      select * into v_original from public.ride_legs where id=(v_input->>'replaces')::uuid and ride_id=v_existing
        and status='cancelled' and not exists(select from public.ride_legs nxt where nxt.replaces_id=(v_input->>'replaces')::uuid);
      if not found or v_original.id=any(v_replacements) or v_original_ride.passenger_id<>v_passenger then raise exception 'replacement_unavailable'; end if;
      v_replacements:=array_append(v_replacements,v_original.id);
    elsif v_input ? 'replaces' then raise exception 'replacement_unavailable'; end if;
    if jsonb_typeof(coalesce(v_input->'extras','[]'))<>'array' or jsonb_array_length(coalesce(v_input->'extras','[]'))>8 then raise exception 'invalid_extras'; end if;
    select coalesce(array_agg(code),array[]::text[]) into v_codes from jsonb_array_elements_text(coalesce(v_input->'extras','[]')) code;
    select coalesce(sum(cents),0) into v_extras from private.ride_extra_prices where tariff_id=t.id and code=any(v_codes);
    if cardinality(v_codes)<>(select count(*) from private.ride_extra_prices where tariff_id=t.id and code=any(v_codes)) then raise exception 'invalid_extras'; end if;
    v_fare:=greatest(t.minimum_cents,t.base_cents+round(r.meters::numeric*t.km_cents/1000)::integer+r.minutes*t.minute_cents);
    v_fee:=case when v_env='simulation' or (v_monetize and private.ride_area_allowed(v_env,r.origin,'monetize')
       and private.ride_area_allowed(v_env,r.destination,'monetize')) then (v_fare::bigint*t.commission_bps/10000)::int else 0 end;
    v_fare:=v_fare+v_extras;
    v_legs:=v_legs || jsonb_build_object('seq',v_index,'origin',r.origin,'destination',r.destination,'pickup_at',v_start,
      'duration_minutes',r.minutes,'meters',r.meters,'route_id',v_input->>'route_id','service_endpoint',v_endpoint,'payer',v_role,'payer_id',v_payer,'fare_cents',v_fare,'limit_cents',v_fare,
      'extras',to_jsonb(v_codes),'extras_cents',v_extras,'replaces',v_input->>'replaces','fee_cents',v_fee,'driver_cents',v_fare-v_fee);
    v_total:=v_total+v_fare;
  end loop;
  -- The person ordering the trip also confirms, even when somebody else pays.
  if not v_uid=any(v_required) then v_required:=array_append(v_required,v_uid); end if;
  update private.ride_quotes set status='superseded' where (booking_id=p_booking or existing_ride_id=v_existing) and status='awaiting_consent';
  insert into private.ride_quotes(environment,actor_id,request_key,booking_id,passenger_id,client_id,scheduled_at,request_legs,
    legs,required_users,tariff_id,expires_at,status,total_cents,existing_ride_id)
  values(v_env,v_uid,p_key,p_booking,v_passenger,v_client,p_scheduled_at,p_legs,v_legs,v_required,t.id,
    least(now()+interval '5 minutes',coalesce(p_scheduled_at,'infinity'::timestamptz)), 'awaiting_consent',v_total,v_existing)
  returning * into q;
  return private.ride_quote_view(q,v_uid);
end $$;

create function public.ride_consent(p_quote uuid,p_accept boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid := auth.uid(); q private.ride_quotes; b public.bookings; v_ride uuid; leg jsonb;
  v_previous boolean; v_prior public.ride_legs; v_logical_seq int; v_revision int; v_start timestamptz; v_end timestamptz;
begin
  -- Minimal read identifies the owning booking; lock order matches ride_quote.
  select * into q from private.ride_quotes where id=p_quote and environment=private.ride_env() and v_uid=any(required_users);
  if not found or p_accept is null then raise exception 'not_allowed'; end if;
  if q.booking_id is not null then select * into b from public.bookings where id=q.booking_id for update; end if;
  select * into strict q from private.ride_quotes where id=p_quote for update;
  select accepted into v_previous from private.ride_consents where quote_id=q.id and actor_id=v_uid;
  if q.status in ('requested','declined') and v_previous is not distinct from p_accept then
    select coalesce(q.existing_ride_id,(select id from public.rides where quote_id=q.id)) into v_ride;
    return jsonb_build_object('status',q.status,'ride_id',v_ride);
  end if;
  if q.status<>'awaiting_consent' or q.expires_at<=now() then raise exception 'quote_unavailable'; end if;
  if not p_accept then
    insert into private.ride_consents values(q.id,v_uid,false,now())
      on conflict(quote_id,actor_id) do update set accepted=false,at=now();
    update private.ride_quotes set status='declined' where id=q.id;
    return jsonb_build_object('status','declined','ride_id',null);
  end if;
  perform private.require_ride_feature('dispatch');
  if q.booking_id is not null and (b.status not in ('accepted','paid','in_progress') or b.provider_id<>q.passenger_id or b.client_id is distinct from q.client_id) then
    raise exception 'booking_not_eligible';
  end if;
  for leg in select value from jsonb_array_elements(q.legs) loop
    if leg->>'route_id' is not null then
      perform c.id from private.ride_route_cases c join private.ride_route_points p on p.route_id=c.id
        where c.id=(leg->>'route_id')::uuid and c.status='verified' and c.valid_until>now() and p.delete_by>now()
        and not exists(select from public.ride_legs l where l.route_case_id=c.id) for update of c,p;
      if not found then raise exception 'requote_required'; end if;
    elsif q.environment='live' then raise exception 'verified_route_required'; end if;
    if not private.ride_area_allowed(q.environment,leg->>'origin','dispatch') or not private.ride_area_allowed(q.environment,leg->>'destination','dispatch') then raise exception 'dispatch_unavailable'; end if;
    if q.environment='live' and (leg->>'fee_cents')::int>0 and
       (not (select monetization_enabled from private.ride_network where environment='live') or
        not private.ride_area_allowed('live',leg->>'origin','monetize') or not private.ride_area_allowed('live',leg->>'destination','monetize')) then
      raise exception 'requote_required';
    end if;
  end loop;
  insert into private.ride_consents values(q.id,v_uid,true,now()) on conflict(quote_id,actor_id) do nothing;
  if exists(select from unnest(q.required_users) u where not exists(select from private.ride_consents c where c.quote_id=q.id and c.actor_id=u and c.accepted)) then
    return jsonb_build_object('status','awaiting_consent','ride_id',null);
  end if;
  if q.existing_ride_id is null then
    insert into public.rides(quote_id,passenger_id,environment,booking_id,scheduled_at)
    values(q.id,q.passenger_id,q.environment,q.booking_id,q.scheduled_at) returning id into v_ride;
  else
    select id into strict v_ride from public.rides where id=q.existing_ride_id for update;
  end if;
  for leg in select value from jsonb_array_elements(q.legs) loop
    v_start:=(leg->>'pickup_at')::timestamptz; v_end:=v_start+make_interval(mins=>(leg->>'duration_minutes')::int);
    v_logical_seq:=(leg->>'seq')::int; v_revision:=1;
    if q.existing_ride_id is not null then
      select * into v_prior from public.ride_legs where ride_id=v_ride and id=(leg->>'replaces')::uuid and status='cancelled' for update;
      if not found or exists(select from public.ride_legs where replaces_id=v_prior.id) then raise exception 'replacement_unavailable'; end if;
      v_logical_seq:=v_prior.seq; v_revision:=v_prior.revision+1;
    end if;
    insert into public.ride_legs(ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,
      fare_cents,fee_cents,driver_cents,payer_id,tariff_id,environment,source_quote_id,quote_seq,replaces_id,revision,extras_cents,route_case_id,service_endpoint)
    values(v_ride,v_logical_seq,leg->>'origin',leg->>'destination',v_start,(leg->>'duration_minutes')::int,
      tstzrange(v_start,v_end,'[)'),(leg->>'fare_cents')::int,(leg->>'fee_cents')::int,(leg->>'driver_cents')::int,
      (leg->>'payer_id')::uuid,q.tariff_id,q.environment,q.id,(leg->>'seq')::int,(leg->>'replaces')::uuid,v_revision,(leg->>'extras_cents')::int,(leg->>'route_id')::uuid,leg->>'service_endpoint');
  end loop;
  update private.ride_quotes set status='requested' where id=q.id;
  return jsonb_build_object('status','requested','ride_id',v_ride);
end $$;

revoke all on function public.ride_apply_driver(text),public.ride_review_driver(uuid,boolean,date),
  public.ride_set_online(boolean),public.ride_quote(uuid,uuid,timestamptz,jsonb), public.ride_consent(uuid,boolean) from public,anon;
grant execute on function public.ride_apply_driver(text),public.ride_review_driver(uuid,boolean,date),
  public.ride_set_online(boolean),public.ride_quote(uuid,uuid,timestamptz,jsonb),public.ride_consent(uuid,boolean) to authenticated;
