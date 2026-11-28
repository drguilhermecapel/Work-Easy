-- O17 stage 6 · PAR-602: assistance for boarding and the accessible vehicle. The
-- passenger says what helps (the three stage-3 values, never a reason): there is no
-- diagnosis, disability or medical field anywhere, and assistance has no price.
-- A quote through this door exists only while a driver on a declared shift has the
-- capacitation and, for travelling seated in the wheelchair, an inspected restraint
-- plus ramp or lift (and a companion seat when asked) through the end of the leg.
-- The boarding time of the area is added to the duration of the leg, never to the fare.
-- Offers and assignment keep the same rule through the leg end, for every leg that
-- carries an assistance, whichever door created it. Simulation rows only; live has none.
create table private.ride_access_equipment(
 driver_id uuid not null references public.ride_drivers(id) on delete cascade,
 vehicle_ref text not null check(length(trim(vehicle_ref)) between 1 and 160),
 kind text not null check(kind in ('ramp','lift','restraint','companion_seat')),
 inspected_ref text not null check(inspected_ref ~ '^[[:alnum:]_.:/-]{3,100}$'),
 trained_ref text not null check(trained_ref ~ '^[[:alnum:]_.:/-]{3,100}$'),
 valid_until timestamptz not null,verified_at timestamptz not null default now(),
 primary key(driver_id,kind)
);
-- Gate and boarding time of an assistance where the passenger boards.
create table private.ride_access_policies(
 environment text not null references private.ride_network(environment),area text not null check(length(trim(area)) between 1 and 120),
 assistance text not null check(assistance in ('boarding','folding_equipment','wheelchair_vehicle')),
 boarding_minutes smallint not null check(boarding_minutes between 0 and 30),
 evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160),valid_until timestamptz not null,
 primary key(environment,area,assistance)
);
alter table private.ride_access_equipment enable row level security;
alter table private.ride_access_policies enable row level security;
revoke all on private.ride_access_equipment,private.ride_access_policies from public,anon,authenticated,service_role;
-- "boarding" keeps the minutes added to each quoted leg ({"<quote seq>":minutes}); the leg freezes its own.
alter table private.ride_access_quotes add column companion boolean not null default false,
 add column boarding jsonb not null default '{}' check(jsonb_typeof(boarding)='object' and pg_column_size(boarding)<=512);
alter table private.ride_access_preferences add column companion boolean not null default false,
 add column boarding_minutes smallint not null default 0 check(boarding_minutes between 0 and 30);
insert into private.ride_access_policies(environment,area,assistance,boarding_minutes,evidence_ref,valid_until)
 select 'simulation',a.area,p.assistance,p.minutes,'ficticio-o17-e6','infinity'
 from private.ride_market_areas a cross join (values('boarding',3),('folding_equipment',5),('wheelchair_vehicle',10)) p(assistance,minutes)
 where a.environment='simulation';

-- The driver's current vehicle (the one of the credential) serves the assistance
-- through p_until. The stage-3 capacitation stays required for every assistance.
create function private.ride_access_equipped(p_driver uuid,p_assistance text,p_companion boolean,p_from timestamptz,p_until timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p_assistance='none',false) or exists(
   select from private.ride_assist_capabilities a
   join private.ride_driver_credentials c on c.driver_id=a.driver_id and c.vehicle_identifier=a.vehicle_ref
   where a.driver_id=p_driver and a.capability=p_assistance and a.until_at>=p_until
     and (p_assistance<>'wheelchair_vehicle' or (
       exists(select from private.ride_access_equipment e where e.driver_id=a.driver_id and e.vehicle_ref=c.vehicle_identifier
         and e.kind='restraint' and e.valid_until>=p_until)
       and exists(select from private.ride_access_equipment e where e.driver_id=a.driver_id and e.vehicle_ref=c.vehicle_identifier
         and e.kind in ('ramp','lift') and e.valid_until>=p_until)
       and (not coalesce(p_companion,false) or exists(select from private.ride_access_equipment e where e.driver_id=a.driver_id
         and e.vehicle_ref=c.vehicle_identifier and e.kind='companion_seat' and e.valid_until>=p_until))))
     and (not coalesce(p_companion,false) or private.ride_qualified_capacity(p_driver,p_from,p_until,2,false,false)))
$$;
create function private.ride_leg_access_covers(p_driver uuid,l public.ride_legs,p_until timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select from private.ride_access_preferences p where p.leg=l.id and p.assistance<>'none'
   and not private.ride_access_equipped(p_driver,p.assistance,p.companion,l.pickup_at,p_until))
$$;
-- Radar, waves and accept: the end is the driver's planned end when it is later than the slot.
alter function private.ride_offer_eligible(uuid,public.ride_legs) rename to ride_before_modes_eligible;
create function private.ride_offer_eligible(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select private.ride_before_modes_eligible(p_driver,l) and not exists(
   select from private.ride_access_preferences p left join lateral private.ride_approach_plan(p_driver,l) plan on true
   where p.leg=l.id and p.assistance<>'none' and not private.ride_access_equipped(p_driver,p.assistance,p.companion,l.pickup_at,
     greatest(now(),upper(l.slot),upper(l.driver_slot),upper(plan.driver_slot))))
$$;
-- Assignment by any path, and every later change of time or state while a driver
-- holds the leg. The horizons are those of the stage-3 assistance guard, which
-- fires first by name. Cancelling and completing stay possible.
create function private.require_ride_access_equipment() returns trigger language plpgsql security definer set search_path='' as $$
declare horizon timestamptz:=greatest(now(),upper(new.slot),upper(new.driver_slot));
begin
 if new.status is distinct from old.status then
   if new.status='arriving' then
     horizon:=greatest(horizon,now()+coalesce(upper(new.driver_slot)-lower(new.driver_slot),make_interval(mins=>new.duration_minutes)));
   elsif new.status='boarded' then horizon:=greatest(horizon,now()+make_interval(mins=>new.duration_minutes)); end if;
 end if;
 if not private.ride_leg_access_covers(new.driver_id,new,horizon) then raise exception 'ride_assistance_unavailable'; end if;
 return new;
end $$;
create trigger ride_require_equipment_window before update of driver_id,slot,driver_slot,status on public.ride_legs for each row
 when(new.driver_id is not null and (new.driver_id is distinct from old.driver_id or (new.status in ('accepted','arriving','boarded')
   and (new.slot is distinct from old.slot or new.driver_slot is distinct from old.driver_slot or new.status is distinct from old.status))))
 execute function private.require_ride_access_equipment();
-- The leg keeps the companion and the boarding minutes of its quoted leg. Named to run after freeze_ride_access.
create function private.freeze_ride_access_boarding() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.ride_access_preferences p set companion=a.companion,
   boarding_minutes=coalesce((a.boarding->>(coalesce(new.quote_seq,new.seq))::text)::int,0)
 from private.ride_access_quotes a where p.leg=new.id
   and a.quote_id=coalesce(new.source_quote_id,(select r.quote_id from public.rides r where r.id=new.ride_id));
 return null;
end $$;
create trigger freeze_ride_access_boarding after insert on public.ride_legs for each row execute function private.freeze_ride_access_boarding();

-- Boarding minutes of the pickup area, or null when no policy covers the assistance through the end of the trip.
create function private.ride_access_boarding(p_env text,p_area text,p_assistance text,p_start timestamptz,p_trip_minutes int) returns int
language sql stable security definer set search_path='' as $$
 select p.boarding_minutes::int from private.ride_access_policies p where p.environment=p_env and p.area=p_area and p.assistance=p_assistance
   and p.valid_until>=p_start+make_interval(mins=>p_trip_minutes+p.boarding_minutes)
$$;
-- A candidate of the shift (stage-6 classes) is free for trip plus boarding, valid,
-- equipped, and also meets the class already chosen for the route, if any.
create function private.ride_access_supply(c private.ride_route_cases,depart timestamptz,p_assistance text,p_companion boolean,p_minutes int)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare f private.ride_route_preferences;
begin
 if p_minutes is null or p_assistance is null or p_companion is null or depart is null or c.minutes is null then return false; end if;
 select * into f from private.ride_route_preferences where route_id=c.id;
 c.minutes:=c.minutes+p_minutes;
 return exists(select from private.ride_capacity_candidates(c,depart) k
   where private.ride_active_user(k.driver_id) and private.ride_driver_valid(k.driver_id,private.sp_date(upper(k.occupied)))
     and private.ride_access_equipped(k.driver_id,p_assistance,p_companion,lower(k.occupied),upper(k.occupied))
     and (f.route_id is null or (f.class_until>=upper(k.occupied)
       and private.ride_qualified_capacity(k.driver_id,lower(k.occupied),upper(k.occupied),f.seats,f.tools,f.accessible)
       and private.ride_vehicle_meets(k.driver_id,f))));
end $$;

-- What can be asked for a measured route in this window. It writes nothing and
-- takes no reason: only the passenger of the route reads it.
create function public.ride_access_options(p_route uuid,p_departure timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('quote'); c private.ride_route_cases; depart timestamptz:=coalesce(p_departure,now());
 v_kind text; v_mode text; v_minutes int; v_available boolean; v_options jsonb:='[]'; v_channel text;
begin
 select * into c from private.ride_route_cases where id=p_route and p_route is not null and environment=private.ride_env()
   and passenger_id=u and status='verified' and valid_until>now();
 if not found then raise exception 'route_unavailable'; end if;
 foreach v_kind in array array['boarding','folding_equipment','wheelchair_vehicle'] loop
   v_mode:=case when v_kind='wheelchair_vehicle' then 'wav' else 'assist' end;
   v_minutes:=private.ride_access_boarding(c.environment,c.origin_area,v_kind,depart,c.minutes);
   v_available:=v_minutes is not null and private.ride_modality_issue(c.environment,v_mode,c.origin_area,c.destination_area,
       depart+make_interval(mins=>c.minutes+v_minutes),depart) is null
     and private.ride_access_supply(c,depart,v_kind,false,v_minutes);
   v_options:=v_options||jsonb_build_array(jsonb_build_object('assistance',v_kind,'available',v_available,'boarding_minutes',coalesce(v_minutes,0),
     'companion',v_available and private.ride_access_supply(c,depart,v_kind,true,v_minutes)));
 end loop;
 -- The team on duty now, else the next planned one; never a past window.
 select s.address into v_channel from private.ride_staffed_channels s where upper(s.hours)>now()
   order by (s.hours @> now()) desc,lower(s.hours),s.id limit 1;
 return jsonb_build_object('options',v_options,'channel',v_channel);
end $$;

-- The accessible door. Lock order is that of ride_quote (deployment, profile, quote).
-- Any refusal raises, so the quote created a few lines above is rolled back with it:
-- no quote, no access row and no mode survive without a compatible vehicle.
-- private.ride_requote_legs (stage 5) is the rewrite point of a fresh quote and it
-- refuses any change of duration_minutes. It is called with the legs as quoted, for
-- its preconditions (awaiting consent, unexpired, nobody consented) and its price
-- integrity; the boarding minutes are then written to duration_minutes alone.
create function public.ride_quote_accessible(p_key uuid,p_booking uuid,p_scheduled_at timestamptz,p_legs jsonb,p_assistance text,p_companion boolean)
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
   -- A replay answers only for a quote this door made with the same choice.
   select * into a from private.ride_access_quotes where quote_id=q.id;
   if not found or a.assistance<>p_assistance or a.companion<>p_companion or not private.ride_quote_has_mode(q.id,v_mode) then
     raise exception 'idempotency_conflict'; end if;
   return public.ride_quote_with_access(p_key,p_booking,p_scheduled_at,p_legs,p_assistance);
 end if;
 v_quote:=(public.ride_quote_with_access(p_key,p_booking,p_scheduled_at,p_legs,p_assistance)->>'id')::uuid;
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

-- The operation records one inspected equipment of the driver's current vehicle,
-- with the driver's training for it. The same record twice changes nothing and is audited once.
create function public.ride_verify_access_equipment(p_driver uuid,p_kind text,p_inspected text,p_trained text,p_until timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare d public.ride_drivers; v_ref text;
begin
 perform private.require_admin();
 if not private.ride_active_user(auth.uid()) or auth.uid()=p_driver or not private.ride_active_user(p_driver) then raise exception 'not_allowed'; end if;
 if p_kind is null or p_kind not in ('ramp','lift','restraint','companion_seat') or p_inspected is null or p_inspected!~'^[[:alnum:]_.:/-]{3,100}$'
   or p_trained is null or p_trained!~'^[[:alnum:]_.:/-]{3,100}$' or p_until is null or p_until<=now() then raise exception 'invalid_input'; end if;
 select * into d from public.ride_drivers where id=p_driver and environment=private.ride_env() for update;
 if not found or not private.ride_driver_valid(p_driver,private.sp_date(now())) then raise exception 'driver_ineligible'; end if;
 select k.vehicle_identifier into v_ref from private.ride_driver_credentials k where k.driver_id=p_driver and k.vehicle_category=d.vehicle;
 if not found then raise exception 'driver_ineligible'; end if;
 if exists(select from private.ride_access_equipment e where e.driver_id=p_driver and e.kind=p_kind
    and (e.vehicle_ref,e.inspected_ref,e.trained_ref,e.valid_until)=(v_ref,p_inspected,p_trained,p_until)) then return; end if;
 insert into private.ride_access_equipment(driver_id,vehicle_ref,kind,inspected_ref,trained_ref,valid_until)
   values(p_driver,v_ref,p_kind,p_inspected,p_trained,p_until)
 on conflict(driver_id,kind) do update set vehicle_ref=excluded.vehicle_ref,inspected_ref=excluded.inspected_ref,
   trained_ref=excluded.trained_ref,valid_until=excluded.valid_until,verified_at=now();
 perform private.audit('ride.access_equipment_review','ride_drivers',p_driver::text,
   jsonb_build_object('kind',p_kind,'inspected',p_inspected,'trained',p_trained,'until',p_until));
end $$;

revoke all on function private.ride_access_equipped(uuid,text,boolean,timestamptz,timestamptz),private.ride_leg_access_covers(uuid,public.ride_legs,timestamptz),
 private.ride_before_modes_eligible(uuid,public.ride_legs),private.ride_offer_eligible(uuid,public.ride_legs),private.require_ride_access_equipment(),
 private.freeze_ride_access_boarding(),private.ride_access_boarding(text,text,text,timestamptz,int),
 private.ride_access_supply(private.ride_route_cases,timestamptz,text,boolean,int) from public,anon,authenticated,service_role;
revoke all on function public.ride_access_options(uuid,timestamptz),public.ride_quote_accessible(uuid,uuid,timestamptz,jsonb,text,boolean),
 public.ride_verify_access_equipment(uuid,text,text,text,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.ride_access_options(uuid,timestamptz),public.ride_quote_accessible(uuid,uuid,timestamptz,jsonb,text,boolean),
 public.ride_verify_access_equipment(uuid,text,text,text,timestamptz) to authenticated;
