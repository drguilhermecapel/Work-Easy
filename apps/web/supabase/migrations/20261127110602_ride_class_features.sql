-- O17 stage 6 · PAR-601: classes sold by inspected seats, luggage, vehicle standard,
-- propulsion and room for a domestic animal, plus a priority class whose benefit is
-- a bound on the approach estimate at quote time. A class with no feature behaves as
-- in stage 1. Assistance animals have no input, flag or price anywhere: they ride in
-- every class, and the catalogs below refuse a code or label that would price them.
-- Seven existing functions are replaced in place, so their triggers, grants and
-- callers stay bound. Stop if one of them is no longer the reviewed text of stages
-- 1 and 2: a change made by another migration must be merged by hand, not overwritten.
do $$ declare r record; begin
 for r in select * from (values
   ('public.ride_apply_driver(text)','bcfef694b52256824fdd31b0c9e2a9b6'),
   ('private.ride_capacity_estimate(private.ride_route_cases,timestamptz,int,boolean,boolean)','b95c33a7fc6ce1da32c12dbdba1a7a12'),
   ('public.ride_class_options(uuid,timestamptz)','01ef6a0e4656f2866561aec9a38d401f'),
   ('public.ride_choose_class(uuid,text,timestamptz)','b07d7c5b23b8f027adfc82af869fbc33'),
   ('private.freeze_passenger_class()','24da2fc0f0a0efd36c9313d1124975f0'),
   ('private.require_ride_class_capacity()','3c4a0ea1c5d510ec1198986c6e1e7c6e'),
   ('private.ride_pre_dispatch_eligible(uuid,public.ride_legs)','1003e47d937e1e886af6a6330a5124b1')) x(fn,digest) loop
   if md5(replace((select p.prosrc from pg_catalog.pg_proc p where p.oid=r.fn::regprocedure),E'\r',''))<>r.digest then
     raise exception 'function % changed since it was reviewed: merge it by hand before replacing it',r.fn;
   end if;
 end loop;
end $$;
alter table public.ride_drivers drop constraint ride_drivers_vehicle_check;
alter table public.ride_drivers add constraint ride_drivers_vehicle_check check(vehicle in ('compact','sedan','suv','minivan','van'));
alter table private.ride_driver_credentials drop constraint ride_driver_credentials_vehicle_category_check;
alter table private.ride_driver_credentials add constraint ride_driver_credentials_vehicle_category_check
 check(vehicle_category in ('compact','sedan','suv','minivan','van'));
create or replace function public.ride_apply_driver(p_vehicle text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid := private.require_ride_feature('module'); v_driver public.ride_drivers;
begin
  if p_vehicle is null or p_vehicle not in ('compact','sedan','suv','minivan','van') then raise exception 'invalid_vehicle'; end if;
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

-- True for a code or label that names a guide dog or another assistance animal.
-- A domestic animal ("pet") alone is a sellable option and stays allowed.
create function private.ride_names_assistance_animal(p_text text) returns boolean language sql immutable set search_path='' as $$
 select coalesce(p_text ~* '(c[aãÃ]o|c[aãÃ]es)[-_ ]*(de[-_ ]*)?guia|guide[-_ ]*dog|seeing[-_ ]*eye'
   or p_text ~* '(c[aãÃ]o|c[aãÃ]es|anima[li]s?)[-_ ]*(de[-_ ]*)?(apoio|servi[cçÇ]o)|(service|support)[-_ ]*(animal|dog)'
   or (p_text ~* '(c[aãÃ]o|c[aãÃ]es|dog|anima[li]|pet)' and p_text ~* '(assist|emocional|emotional|terap|therap)'),false)
$$;
alter table private.ride_extra_prices add constraint ride_extra_prices_no_assistance_animal
 check(not private.ride_names_assistance_animal(code) and not private.ride_names_assistance_animal(label));

alter table private.ride_vehicle_capacity
 add column luggage smallint not null default 0 check(luggage between 0 and 12),
 add column standard text not null default 'standard' check(standard in ('standard','comfort','premium')),
 add column propulsion text not null default 'combustion' check(propulsion in ('combustion','hybrid','electric')),
 add column pets boolean not null default false,
 add column features_ref text check(features_ref ~ '^[[:alnum:]_.:/-]{3,100}$');
-- A van class is the individual van of PAR-604: it also needs a van or minivan and
-- the market authorization of the 'van' modality through the end of the leg.
alter table private.ride_class_policies
 add column luggage smallint not null default 0 check(luggage between 0 and 12),
 add column standard text not null default 'standard' check(standard in ('standard','comfort','premium')),
 add column electric boolean not null default false,
 add column pets boolean not null default false,
 add column priority_wait_minutes smallint check(priority_wait_minutes between 1 and 60),
 add column modality text not null default 'car' references private.ride_modalities(code) check(modality in ('car','van')),
 add constraint ride_class_policies_no_assistance_animal
   check(not private.ride_names_assistance_animal(code) and not private.ride_names_assistance_animal(label));
alter table private.ride_route_preferences
 add column luggage smallint not null default 0,
 add column standard text not null default 'standard',
 add column electric boolean not null default false,
 add column pets boolean not null default false,
 add column priority_wait_minutes smallint,
 add column modality text not null default 'car';

-- Features belong to the inspected vehicle: another vehicle or document starts from nothing.
create function private.reset_ride_vehicle_features() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.vehicle,new.document_ref) is distinct from (old.vehicle,old.document_ref)
   and (new.luggage,new.standard,new.propulsion,new.pets,new.features_ref) is not distinct from (old.luggage,old.standard,old.propulsion,old.pets,old.features_ref) then
   new.luggage:=0; new.standard:='standard'; new.propulsion:='combustion'; new.pets:=false; new.features_ref:=null;
 end if;
 return new;
end $$;
create trigger ride_vehicle_features_reset before update of vehicle,document_ref on private.ride_vehicle_capacity
 for each row execute function private.reset_ride_vehicle_features();
-- The amended route receives a copy of the accepted class (stage 1 copies the first
-- eight columns): it keeps the frozen features of the route it replaces.
create function private.inherit_ride_class_features() returns trigger language plpgsql security definer set search_path='' as $$
declare o private.ride_route_preferences;
begin
 if (new.luggage,new.standard,new.electric,new.pets,new.modality)<>(0,'standard',false,false,'car') or new.priority_wait_minutes is not null then return new; end if;
 select f.* into o from private.ride_amendments a join private.ride_route_preferences f on f.route_id=a.old_route_id
 where a.route_id=new.route_id and a.status='pending' and a.expires_at>now()
   and (f.class_code,f.label,f.surcharge_cents,f.seats,f.tools,f.accessible,f.class_until)
      =(new.class_code,new.label,new.surcharge_cents,new.seats,new.tools,new.accessible,new.class_until) limit 1;
 if found then
   new.luggage:=o.luggage; new.standard:=o.standard; new.electric:=o.electric; new.pets:=o.pets;
   new.priority_wait_minutes:=o.priority_wait_minutes; new.modality:=o.modality;
 end if;
 return new;
end $$;
create trigger ride_class_features_follow_amendment before insert on private.ride_route_preferences
 for each row execute function private.inherit_ride_class_features();

-- The current vehicle of the driver covers the features a class sells. Seats, tools,
-- accessibility and the validity of the inspection stay in ride_qualified_capacity.
create function private.ride_vehicle_meets(p_driver uuid,p_luggage int,p_standard text,p_electric boolean,p_pets boolean,p_modality text) returns boolean
language sql stable set search_path='' as $$
 select exists(select from private.ride_vehicle_capacity v join public.ride_drivers d on d.id=v.driver_id and d.vehicle=v.vehicle
  where v.driver_id=p_driver and v.luggage>=p_luggage
   and array_position(array['standard','comfort','premium'],v.standard)>=array_position(array['standard','comfort','premium'],p_standard)
   and (not p_electric or v.propulsion='electric') and (not p_pets or v.pets)
   and (p_modality<>'van' or d.vehicle in ('van','minivan')))
$$;
create function private.ride_vehicle_meets(p_driver uuid,a private.ride_class_policies) returns boolean language sql stable set search_path='' as $$
 select private.ride_vehicle_meets(p_driver,a.luggage,a.standard,a.electric,a.pets,a.modality)
$$;
create function private.ride_vehicle_meets(p_driver uuid,f private.ride_route_preferences) returns boolean language sql stable set search_path='' as $$
 select private.ride_vehicle_meets(p_driver,f.luggage,f.standard,f.electric,f.pets,f.modality)
$$;
-- Null when the class needs no market authorization or still holds it through the end of the trip.
create function private.ride_class_gate_issue(a private.ride_class_policies,c private.ride_route_cases,depart timestamptz) returns text
language sql stable set search_path='' as $$
 select case when a.modality<>'car' then private.ride_modality_issue(c.environment,a.modality,c.origin_area,c.destination_area,
   depart+make_interval(mins=>c.minutes),depart) end
$$;

-- Drivers on a declared shift who can reach the pickup and stay free for the whole
-- trip: the stage-1 predicates of ride_capacity_estimate, without the vehicle.
create function private.ride_capacity_candidates(c private.ride_route_cases,depart timestamptz)
returns table(driver_id uuid,minutes integer,occupied tstzrange) language sql stable set search_path='' as $$
 with drivers as (
   select d.id,s.period,m.minutes,n.max_approach_minutes,n.immediate_wait_minutes,
     greatest(now(),lower(s.period),coalesce(previous.ends_at,lower(s.period)))+make_interval(mins=>m.minutes) as earliest
   from private.ride_driver_shifts s join public.ride_drivers d on d.id=s.driver_id
   join private.ride_network n on n.environment=c.environment
   left join lateral (
     select l.destination,upper(coalesce(l.driver_slot,l.slot)) as ends_at from public.ride_legs l
     where l.driver_id=d.id and l.status in ('accepted','arriving','boarded','completed')
       and upper(coalesce(l.driver_slot,l.slot)) between lower(s.period) and depart
     order by upper(coalesce(l.driver_slot,l.slot)) desc limit 1
   ) previous on true
   join private.ride_approach_routes m on m.environment=c.environment and m.origin_area=coalesce(previous.destination,s.area)
     and m.destination_area=c.origin_area and m.valid_until>=depart
   where d.environment=c.environment and d.id<>c.passenger_id and d.online and upper(s.period)>=depart
 ), candidates as (
   select d.*,tstzrange(greatest(depart,earliest)-make_interval(mins=>minutes),
      greatest(depart,earliest)+make_interval(mins=>c.minutes),'[)') as occupied from drivers d
   where minutes<=max_approach_minutes and earliest<=depart+
     case when depart<=now()+interval '1 minute' then make_interval(mins=>immediate_wait_minutes) else interval '0' end
 )
 select d.id,d.minutes,d.occupied from candidates d
 where d.period @> d.occupied
 and not exists(select from public.ride_legs l where l.driver_id=d.id and (l.status='unknown' or
   (l.status in ('accepted','arriving','boarded') and coalesce(l.driver_slot,l.slot) && d.occupied)))
 and not exists(select from public.bookings b where b.provider_id=d.id and b.status in ('requested','accepted','paid','in_progress') and b.period && d.occupied)
 and not exists(select from public.shifts sh where sh.provider_id=d.id and sh.status in ('assigned','checked_in') and sh.period && d.occupied)
 and not exists(select from lateral (
   select l.origin,l.pickup_at from public.ride_legs l where l.driver_id=d.id and l.status in ('accepted','arriving','boarded')
      and l.pickup_at>=upper(d.occupied) and l.pickup_at<upper(d.period) order by l.pickup_at limit 1
 ) upcoming where not exists(select from private.ride_approach_routes onward where onward.environment=c.environment
    and onward.origin_area=c.destination_area and onward.destination_area=upcoming.origin and onward.valid_until>=upcoming.pickup_at
    and upper(d.occupied)+make_interval(mins=>onward.minutes)<=upcoming.pickup_at))
$$;
create or replace function private.ride_capacity_estimate(c private.ride_route_cases,depart timestamptz,seats int,tools boolean,accessible boolean) returns integer
language sql stable set search_path='' as $$
 select min(k.minutes) from private.ride_capacity_candidates(c,depart) k
 where private.ride_qualified_capacity(k.driver_id,lower(k.occupied),upper(k.occupied),seats,tools,accessible)
$$;
-- Estimate for a class: the vehicle also meets its features and, for a priority
-- class, both the approach and the wait from the requested departure fit the bound.
create function private.ride_capacity_estimate(c private.ride_route_cases,depart timestamptz,a private.ride_class_policies) returns integer
language sql stable set search_path='' as $$
 select min(k.minutes) from private.ride_capacity_candidates(c,depart) k
 where private.ride_qualified_capacity(k.driver_id,lower(k.occupied),upper(k.occupied),a.seats,a.tools,a.accessible)
   and private.ride_vehicle_meets(k.driver_id,a)
   and (a.priority_wait_minutes is null or (k.minutes<=a.priority_wait_minutes
     and lower(k.occupied)+make_interval(mins=>k.minutes)<=depart+make_interval(mins=>a.priority_wait_minutes)))
$$;

-- One list for the class chooser and the needs menu. "fits" exists only with needs.
create function private.ride_class_list(c private.ride_route_cases,p_uid uuid,depart timestamptz,p_needs jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare t private.ride_tariffs;
begin
 select * into t from private.ride_tariffs where environment=c.environment and valid_from<=now() order by valid_from desc limit 1;
 if not found then return '[]'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('code',a.code,'label',a.label,'seats',a.seats,'tools',a.tools,'accessible',a.accessible,
   'luggage',a.luggage,'standard',a.standard,'electric',a.electric,'pets',a.pets,'priority_wait_minutes',a.priority_wait_minutes,
   'fare_cents',greatest(t.minimum_cents,t.base_cents+round(c.meters::numeric*t.km_cents/1000)::int+c.minutes*t.minute_cents)+a.surcharge_cents,
   'available',eta.minutes is not null,'approach_minutes',case when p_uid=c.passenger_id then eta.minutes end,
   'duration_minutes',case when p_uid=c.passenger_id then c.minutes end,'observed_at',now())
   ||case when p_needs is null then '{}'::jsonb else jsonb_build_object('fits',
     a.seats>=coalesce((p_needs->>'seats')::int,1) and a.luggage>=coalesce((p_needs->>'luggage')::int,0)
     and (a.pets or not coalesce((p_needs->>'pets')::boolean,false)) and (a.electric or not coalesce((p_needs->>'electric')::boolean,false))
     and (a.priority_wait_minutes is not null or not coalesce((p_needs->>'priority')::boolean,false))) end
   order by a.surcharge_cents,a.code),'[]') from private.ride_class_policies a
 cross join lateral(select case when private.ride_class_gate_issue(a,c,depart) is null then private.ride_capacity_estimate(c,depart,a) end as minutes) eta
 where a.environment=c.environment and a.area=c.origin_area and a.valid_until>=depart+make_interval(mins=>c.minutes));
end $$;
create or replace function public.ride_class_options(p_route uuid,p_departure timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('quote');c private.ride_route_cases;depart timestamptz:=coalesce(p_departure,now());
begin
 select * into c from private.ride_route_cases where id=p_route and p_route is not null and environment=private.ride_env()
 and u in(passenger_id,client_id) and status='verified' and valid_until>now();
 if not found then raise exception 'route_unavailable'; end if;
 return private.ride_class_list(c,u,depart,null);
end $$;
-- What the passenger carries decides which classes fit. Nothing is chosen or stored
-- here: the alternative becomes a quote only through ride_choose_class and consent.
create function public.ride_class_menu(p_route uuid,p_departure timestamptz,p_needs jsonb) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('quote');c private.ride_route_cases;depart timestamptz:=coalesce(p_departure,now());
 v_needs jsonb:=coalesce(p_needs,'{}'::jsonb);v_options jsonb;v_alternative text;
begin
 if jsonb_typeof(v_needs)<>'object' then raise exception 'invalid_input'; end if;
 if (v_needs-array['seats','luggage','pets','electric','priority'])<>'{}'::jsonb
   or exists(select from jsonb_each(v_needs) e where case when e.key in ('seats','luggage') then e.value::text!~'^[0-9]{1,2}$' else jsonb_typeof(e.value)<>'boolean' end)
 then raise exception 'invalid_input'; end if;
 if coalesce((v_needs->>'seats')::int,1) not between 1 and 12 or coalesce((v_needs->>'luggage')::int,0) not between 0 and 12 then raise exception 'invalid_input'; end if;
 select * into c from private.ride_route_cases where id=p_route and p_route is not null and environment=private.ride_env()
 and u in(passenger_id,client_id) and status='verified' and valid_until>now();
 if not found then raise exception 'route_unavailable'; end if;
 v_options:=private.ride_class_list(c,u,depart,v_needs);
 if exists(select from jsonb_array_elements(v_options) o where not (o->>'fits')::boolean) then
   select o.item->>'code' into v_alternative from jsonb_array_elements(v_options) with ordinality o(item,n)
   where (o.item->>'fits')::boolean order by (o.item->>'available')::boolean desc,o.n limit 1;
 end if;
 return jsonb_build_object('options',v_options,'alternative',v_alternative);
end $$;
create or replace function public.ride_choose_class(p_route uuid,p_code text,p_departure timestamptz default null) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('quote');c private.ride_route_cases;opt private.ride_class_policies;depart timestamptz:=coalesce(p_departure,now());
begin
 select * into c from private.ride_route_cases where id=p_route and environment=private.ride_env() and u in(passenger_id,client_id) for update;
 if not found or c.status<>'verified' or c.valid_until<=now() then raise exception 'route_unavailable'; end if;
 if exists(select from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) l where l->>'route_id'=p_route::text
    and (q.status='requested' or (q.status='awaiting_consent' and q.expires_at>now()))) then
   if exists(select from private.ride_route_preferences f where f.route_id=c.id and f.class_code=p_code) then return; end if;
   raise exception 'route_measurement_locked';
 end if;
 select * into opt from private.ride_class_policies where environment=c.environment and area=c.origin_area and code=p_code and valid_until>=depart+make_interval(mins=>c.minutes);
 if not found then raise exception 'offer_unavailable'; end if;
 if private.ride_class_gate_issue(opt,c,depart) is not null then raise exception 'ride_modality_unavailable'; end if;
 if private.ride_capacity_estimate(c,depart,opt) is null then raise exception 'offer_unavailable'; end if;
 insert into private.ride_route_preferences(route_id,class_code,label,surcharge_cents,seats,tools,accessible,class_until,
   luggage,standard,electric,pets,priority_wait_minutes,modality)
 values(c.id,opt.code,opt.label,opt.surcharge_cents,opt.seats,opt.tools,opt.accessible,opt.valid_until,
   opt.luggage,opt.standard,opt.electric,opt.pets,opt.priority_wait_minutes,opt.modality)
 on conflict(route_id) do update set class_code=excluded.class_code,label=excluded.label,surcharge_cents=excluded.surcharge_cents,seats=excluded.seats,tools=excluded.tools,
 accessible=excluded.accessible,class_until=excluded.class_until,luggage=excluded.luggage,standard=excluded.standard,electric=excluded.electric,
 pets=excluded.pets,priority_wait_minutes=excluded.priority_wait_minutes,modality=excluded.modality;
end $$;
-- Triggers stay bound to these two functions. The price rule is the one of stage 1:
-- the surcharge (priority included) is part of the fare base, so the driver earns on it.
create or replace function private.freeze_passenger_class() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb;out_legs jsonb:='[]';c private.ride_route_cases;f private.ride_route_preferences;a private.ride_class_policies;t private.ride_tariffs;
 est int; fee int;quoted int;depart timestamptz;
begin
 select * into t from private.ride_tariffs where id=new.tariff_id;
 for item in select value from jsonb_array_elements(new.legs) loop
   select * into c from private.ride_route_cases where id=(item->>'route_id')::uuid for share;
   if found then
     depart:=(item->>'pickup_at')::timestamptz;
     select * into f from private.ride_route_preferences where route_id=c.id;
     if not found and exists(select from private.ride_class_policies where environment=c.environment and area=c.origin_area and valid_until>=depart)
       then raise exception 'ride_class_required'; end if;
     if found then
       select p.* into a from private.ride_class_policies p where p.environment=c.environment and p.area=c.origin_area and p.code=f.class_code
          and (p.seats,p.tools,p.accessible,p.surcharge_cents)=(f.seats,f.tools,f.accessible,f.surcharge_cents)
          and (p.luggage,p.standard,p.electric,p.pets,p.modality)=(f.luggage,f.standard,f.electric,f.pets,f.modality)
          and p.priority_wait_minutes is not distinct from f.priority_wait_minutes
          and least(p.valid_until,f.class_until)>=depart+make_interval(mins=>c.minutes);
       if not found then raise exception 'requote_required'; end if;
       if private.ride_class_gate_issue(a,c,depart) is not null then raise exception 'ride_modality_unavailable'; end if;
       est:=private.ride_capacity_estimate(c,depart,a);
       if est is null then raise exception 'offer_unavailable'; end if;
       quoted:=(item->>'fare_cents')::int+f.surcharge_cents;
       fee:=case when c.environment='simulation' or (exists(select from private.ride_network where environment='live' and monetization_enabled)
         and private.ride_area_allowed('live',c.origin_area,'monetize') and private.ride_area_allowed('live',c.destination_area,'monetize'))
         then ((quoted-(item->>'extras_cents')::int)::bigint*t.commission_bps/10000)::int else 0 end;
       item:=item||jsonb_build_object('ride_class',f.label,'class_code',f.class_code,'approach_minutes',est,'eta_observed_at',now(),
       'fare_cents',quoted,'limit_cents',quoted,'fee_cents',fee,'driver_cents',quoted-fee);
       new.total_cents:=new.total_cents+f.surcharge_cents;
     end if;
   end if;
   out_legs:=out_legs||jsonb_build_array(item);
 end loop;
 new.legs:=out_legs;return new;
end $$;
create or replace function private.require_ride_class_capacity() returns trigger language plpgsql security definer set search_path='' as $$
declare f private.ride_route_preferences;horizon timestamptz:=upper(coalesce(new.driver_slot,new.slot));
begin
 select * into f from private.ride_route_preferences where route_id=new.route_case_id;
 if not found then return new; end if;
 if tg_op='UPDATE' and new.status='arriving' then
   horizon:=greatest(horizon,now()+(upper(new.driver_slot)-lower(new.driver_slot)));
 elsif tg_op='UPDATE' and new.status='boarded' then
   horizon:=greatest(horizon,now()+make_interval(mins=>new.duration_minutes));
 end if;
 if not exists(select from private.ride_class_policies a where a.environment=new.environment and a.area=new.origin
    and a.code=f.class_code and least(a.valid_until,f.class_until)>=horizon and (a.seats,a.tools,a.accessible)=(f.seats,f.tools,f.accessible)
    and (a.luggage,a.standard,a.electric,a.pets,a.modality)=(f.luggage,f.standard,f.electric,f.pets,f.modality))
   or (new.driver_id is not null and (not private.ride_qualified_capacity(new.driver_id,lower(new.slot),horizon,f.seats,f.tools,f.accessible)
     or not private.ride_vehicle_meets(new.driver_id,f)))
 then raise exception 'ride_capacity_changed'; end if;
 return new;
end $$;
-- A van class carries the 'van' modality on its quoted leg: the catalog then
-- rechecks the authorization at leg creation, assignment and departure.
create function private.attach_ride_class_modes() returns trigger language plpgsql security definer set search_path='' as $$
declare leg jsonb;v_mode text;
begin
 for leg in select value from jsonb_array_elements(new.legs) loop
   select f.modality into v_mode from private.ride_route_preferences f
   where f.route_id=(leg->>'route_id')::uuid and f.class_code=leg->>'class_code' and f.modality<>'car';
   if found then perform private.ride_attach_quote_mode(new.id,v_mode,(leg->>'seq')::int); end if;
 end loop;
 return null;
end $$;
create trigger ride_quote_class_mode after insert on private.ride_quotes for each row
 when(new.status='awaiting_consent') execute function private.attach_ride_class_modes();

-- The class rule of the offer chain is the stage-1 function that stage 2 renamed to
-- ride_pre_dispatch_eligible. It is replaced in place (the guard above proves it is
-- that rule), so the top of private.ride_offer_eligible is not wrapped again.
create or replace function private.ride_pre_dispatch_eligible(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select private.ride_offer_before_capacity(p_driver,l) and not exists(
   select from private.ride_route_preferences f
   cross join lateral private.ride_approach_plan(p_driver,l) plan
   where f.route_id=l.route_case_id and (f.class_until<upper(plan.driver_slot)
    or not private.ride_qualified_capacity(p_driver,lower(plan.driver_slot),upper(plan.driver_slot),f.seats,f.tools,f.accessible)
    or not private.ride_vehicle_meets(p_driver,f)
    or not exists(select from private.ride_class_policies a where a.environment=l.environment and a.area=l.origin
      and a.code=f.class_code and a.valid_until>=upper(plan.driver_slot) and (a.seats,a.tools,a.accessible)=(f.seats,f.tools,f.accessible)
      and (a.luggage,a.standard,a.electric,a.pets,a.modality)=(f.luggage,f.standard,f.electric,f.pets,f.modality))))
$$;

-- An operator records what the inspection found for the vehicle whose capacity is
-- already on file. The same record twice changes nothing and is audited once.
create function public.ride_validate_vehicle_features(p_driver uuid,p_luggage integer,p_standard text,p_propulsion text,p_pets boolean,p_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare d public.ride_drivers;v private.ride_vehicle_capacity;
begin
 perform private.require_admin();
 if not private.ride_active_user(auth.uid()) or auth.uid()=p_driver or not private.ride_active_user(p_driver)
 then raise exception 'not_allowed'; end if;
 if p_luggage is null or p_luggage not between 0 and 12 or p_standard is null or p_standard not in ('standard','comfort','premium')
 or p_propulsion is null or p_propulsion not in ('combustion','hybrid','electric') or p_pets is null
 or p_reference is null or p_reference!~'^[[:alnum:]_.:/-]{3,100}$' then raise exception 'invalid_input'; end if;
 select * into d from public.ride_drivers where id=p_driver and environment=private.ride_env() for update;
 if not found or not private.ride_driver_valid(p_driver,private.sp_date(now())) then raise exception 'driver_ineligible'; end if;
 select * into v from private.ride_vehicle_capacity where driver_id=p_driver and vehicle=d.vehicle and valid_until>now() for update;
 if not found or (d.environment='live' and not exists(select from private.ride_driver_credentials k
    where k.driver_id=p_driver and k.vehicle_category=d.vehicle and k.vehicle_identifier=v.document_ref))
 then raise exception 'driver_ineligible'; end if;
 if (v.luggage::int,v.standard,v.propulsion,v.pets,v.features_ref) is not distinct from (p_luggage,p_standard,p_propulsion,p_pets,p_reference) then return; end if;
 update private.ride_vehicle_capacity set luggage=p_luggage,standard=p_standard,propulsion=p_propulsion,pets=p_pets,features_ref=p_reference
 where driver_id=p_driver;
 perform private.audit('ride.vehicle_features_review','ride_drivers',p_driver::text,jsonb_build_object('evidence',p_reference,
   'luggage',p_luggage,'standard',p_standard,'propulsion',p_propulsion,'pets',p_pets));
end $$;

revoke all on function private.ride_names_assistance_animal(text),private.reset_ride_vehicle_features(),private.inherit_ride_class_features(),
 private.ride_vehicle_meets(uuid,int,text,boolean,boolean,text),private.ride_vehicle_meets(uuid,private.ride_class_policies),
 private.ride_vehicle_meets(uuid,private.ride_route_preferences),private.ride_class_gate_issue(private.ride_class_policies,private.ride_route_cases,timestamptz),
 private.ride_capacity_candidates(private.ride_route_cases,timestamptz),
 private.ride_capacity_estimate(private.ride_route_cases,timestamptz,int,boolean,boolean),
 private.ride_capacity_estimate(private.ride_route_cases,timestamptz,private.ride_class_policies),
 private.ride_class_list(private.ride_route_cases,uuid,timestamptz,jsonb),private.freeze_passenger_class(),private.require_ride_class_capacity(),
 private.attach_ride_class_modes(),private.ride_pre_dispatch_eligible(uuid,public.ride_legs)
 from public,anon,authenticated,service_role;
revoke all on function public.ride_class_menu(uuid,timestamptz,jsonb),public.ride_validate_vehicle_features(uuid,int,text,text,boolean,text)
 from public,anon,service_role;
grant execute on function public.ride_class_menu(uuid,timestamptz,jsonb),public.ride_validate_vehicle_features(uuid,int,text,text,boolean,text) to authenticated;
