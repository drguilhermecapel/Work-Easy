-- O17 follow-up · operations registry (DD125). Shuttle lines and departures, hourly block
-- tariffs, intercity corridors and reserve policies could only be provisioned by a backend
-- change; minor driver clearances, guest invites issued by companies and closed invoices had
-- no listing. Finance administrators now list and save them through RPCs filtered by the
-- deployment environment and audited. A save takes the row's id (a client key for a new row)
-- or its natural key, so a replay with the same input changes nothing and answers the same
-- row. Live enabling needs a real evidence reference and a finite validity date: the rule is a
-- check constraint on every table, the RPCs add the window (future, at most 24 months).
-- Nothing is seeded and nothing is enabled here.

-- ── Rules for any writer ──
alter table private.ride_shuttle_lines add constraint ride_shuttle_lines_live_evidence
 check(environment<>'live' or not enabled or (isfinite(valid_until) and evidence_ref !~* '^\s*(ficticio|ensaio)'));
alter table private.ride_block_tariffs add constraint ride_block_tariffs_live_evidence
 check(environment<>'live' or (isfinite(valid_until) and evidence_ref !~* '^\s*(ficticio|ensaio)'));
alter table private.ride_intercity_corridors add constraint ride_intercity_corridors_live_evidence
 check(environment<>'live' or not enabled or (isfinite(valid_until) and authority_ref !~* '^\s*(ficticio|ensaio)' and coverage_ref !~* '^\s*(ficticio|ensaio)'));
alter table private.ride_reserve_policies add constraint ride_reserve_policies_live_evidence
 check(environment<>'live' or not enabled or (isfinite(valid_until) and evidence_ref !~* '^\s*(ficticio|ensaio)'));

-- A line with departures keeps its environment and its two areas; a tariff already frozen on a
-- leg keeps its environment, area and code. Prices and validity may change: legs and seats
-- keep the terms they were sold with.
create function private.guard_ride_registry_identity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='ride_shuttle_lines' then
   if (new.environment,new.origin_area,new.destination_area) is distinct from (old.environment,old.origin_area,old.destination_area)
      and exists(select from private.ride_shuttle_departures d where d.line_id=old.id) then raise exception 'ride_registry_frozen'; end if;
 elsif (new.environment,new.area,new.code) is distinct from (old.environment,old.area,old.code)
      and exists(select from private.ride_leg_blocks b where b.tariff_id=old.id) then raise exception 'ride_registry_frozen';
 end if;
 return new;
end $$;
create trigger ride_shuttle_line_identity before update on private.ride_shuttle_lines for each row execute function private.guard_ride_registry_identity();
create trigger ride_block_tariff_identity before update on private.ride_block_tariffs for each row execute function private.guard_ride_registry_identity();
-- A departure is marked departed only with a driver whose registration holds on that day, and
-- only once its time has come: until then a confirmed seat can still be given back or rebooked.
create function private.guard_ride_shuttle_departed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.driver_id is null or not private.ride_driver_valid(new.driver_id,private.sp_date(new.departs_at))
    or new.departs_at>now() then raise exception 'ride_departure_not_ready'; end if;
 return new;
end $$;
create trigger ride_shuttle_departed_guard before update of state on private.ride_shuttle_departures for each row
 when(old.state='open' and new.state='departed') execute function private.guard_ride_shuttle_departed();

-- ── Helpers ──
-- The finance administrator with a live profile; answers the deployment environment.
create function private.ride_registry_admin() returns text language plpgsql security definer set search_path='' as $$
begin
 perform private.require_ride_finance_admin();
 if not private.ride_active_user(auth.uid()) then raise exception 'not_allowed'; end if;
 return private.ride_env();
end $$;
create function private.ride_registry_text(p text,p_max int) returns boolean language sql immutable set search_path='' as $$
 select coalesce(length(trim(p)) between 1 and p_max,false)
$$;
-- Live enabling: every reference real (not a rehearsal one) and a validity date ahead, within 24 months.
create function private.ride_registry_evidence(p_env text,p_enabled boolean,p_refs text[],p_until timestamptz) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if p_env='live' and p_enabled and (p_until is null or not isfinite(p_until) or p_until<=now() or p_until>now()+interval '24 months'
    or exists(select from unnest(p_refs) r where r is null or trim(r)='' or r ~* '^\s*(ficticio|ensaio)')) then
   raise exception 'ride_registry_evidence_required'; end if;
end $$;
create function private.ride_registry_areas(p_env text) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(a.area order by a.area),'[]'::jsonb) from private.ride_market_areas a where a.environment=p_env
$$;
create function private.ride_registry_area(p_env text,p_area text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_market_areas a where a.environment=p_env and a.area=p_area)
$$;
-- An open-ended rehearsal validity is shown as null.
create function private.ride_registry_until(p timestamptz) returns timestamptz language sql immutable set search_path='' as $$
 select case when isfinite(p) then p end
$$;

create function private.ride_shuttle_line_view(l private.ride_shuttle_lines) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',l.id,'origin_area',l.origin_area,'destination_area',l.destination_area,'operator_ref',l.operator_ref,
   'seat_cents',l.seat_cents,'minutes',l.minutes,'evidence_ref',l.evidence_ref,'valid_until',private.ride_registry_until(l.valid_until),
   'enabled',l.enabled,'open_departures',(select count(*) from private.ride_shuttle_departures d where d.line_id=l.id and d.state='open' and d.departs_at>now()),
   'next_departure',(select min(d.departs_at) from private.ride_shuttle_departures d where d.line_id=l.id and d.state='open' and d.departs_at>now()))
$$;
create function private.ride_shuttle_departure_view(d private.ride_shuttle_departures) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',d.id,'line_id',d.line_id,'departs_at',d.departs_at,'seats_total',d.seats_total,
   'seats_confirmed',private.ride_shuttle_taken(d.id),'state',d.state,'closed_at',d.closed_at,'driver_id',d.driver_id,
   'driver_label',(select p.full_name from public.profiles p where p.id=d.driver_id and p.deleted_at is null),
   'driver_valid',d.driver_id is not null and private.ride_driver_valid(d.driver_id,private.sp_date(d.departs_at)))
$$;
create function private.ride_block_tariff_view(t private.ride_block_tariffs) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',t.id,'area',t.area,'code',t.code,'minutes',t.minutes,'included_km',t.included_km,'block_cents',t.block_cents,
   'extra_15min_cents',t.extra_15min_cents,'extra_km_cents',t.extra_km_cents,'evidence_ref',t.evidence_ref,
   'valid_until',private.ride_registry_until(t.valid_until),'legs',(select count(*) from private.ride_leg_blocks b where b.tariff_id=t.id))
$$;
create function private.ride_corridor_view(c private.ride_intercity_corridors) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('origin',c.origin,'destination',c.destination,'origin_jurisdiction',c.origin_jurisdiction,
   'destination_jurisdiction',c.destination_jurisdiction,'authority_ref',c.authority_ref,'coverage_ref',c.coverage_ref,
   'empty_return_cents',c.empty_return_cents,'return_minutes',c.return_minutes,'valid_until',private.ride_registry_until(c.valid_until),'enabled',c.enabled)
$$;
create function private.ride_reserve_policy_view(p private.ride_reserve_policies) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('area',p.area,'min_lead_minutes',p.min_lead_minutes,'confirm_lead_minutes',p.confirm_lead_minutes,
   'max_shift_minutes',p.max_shift_minutes,'evidence_ref',p.evidence_ref,'valid_until',private.ride_registry_until(p.valid_until),'enabled',p.enabled)
$$;

-- ── Shuttle lines and departures ──
create function public.admin_ride_shuttle_lines() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin();
begin
 return jsonb_build_object('simulation',v_env='simulation','areas',private.ride_registry_areas(v_env),
  'lines',coalesce((select jsonb_agg(private.ride_shuttle_line_view(l) order by l.origin_area,l.destination_area,l.operator_ref,l.id)
    from (select x.* from private.ride_shuttle_lines x where x.environment=v_env order by x.origin_area,x.destination_area,x.operator_ref,x.id limit 200) l),'[]'));
end $$;
create function public.admin_save_ride_shuttle_line(p_id uuid,p_origin text,p_destination text,p_operator_ref text,p_seat_cents int,p_minutes int,
 p_evidence_ref text,p_valid_until timestamptz,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin(); o private.ride_shuttle_lines; n private.ride_shuttle_lines;
 v_origin text:=trim(p_origin); v_dest text:=trim(p_destination); v_op text:=trim(p_operator_ref); v_ev text:=trim(p_evidence_ref);
begin
 if p_id is null or not private.ride_registry_text(v_origin,120) or not private.ride_registry_text(v_dest,120) or v_origin=v_dest
   or not private.ride_registry_text(v_op,160) or not private.ride_registry_text(v_ev,160) or p_seat_cents is null or p_seat_cents not between 1 and 1000000
   or p_minutes is null or p_minutes not between 1 and 720 or p_valid_until is null or p_enabled is null
   or not private.ride_registry_area(v_env,v_origin) or not private.ride_registry_area(v_env,v_dest) then raise exception 'invalid_input'; end if;
 perform private.ride_registry_evidence(v_env,p_enabled,array[v_ev],p_valid_until);
 perform pg_advisory_xact_lock(hashtextextended('ride_registry:'||p_id::text,0));
 select * into o from private.ride_shuttle_lines where id=p_id for update;
 if found and o.environment<>v_env then raise exception 'idempotency_conflict'; end if;
 if exists(select from private.ride_shuttle_lines x where x.environment=v_env and x.origin_area=v_origin and x.destination_area=v_dest
    and x.operator_ref=v_op and x.id<>p_id) then raise exception 'ride_registry_duplicate'; end if;
 if o.id is null then
   insert into private.ride_shuttle_lines(id,environment,origin_area,destination_area,operator_ref,seat_cents,minutes,evidence_ref,valid_until,enabled)
   values(p_id,v_env,v_origin,v_dest,v_op,p_seat_cents,p_minutes,v_ev,p_valid_until,p_enabled) returning * into n;
 else
   update private.ride_shuttle_lines set origin_area=v_origin,destination_area=v_dest,operator_ref=v_op,seat_cents=p_seat_cents,minutes=p_minutes,
     evidence_ref=v_ev,valid_until=p_valid_until,enabled=p_enabled where id=o.id returning * into n;
 end if;
 if o is distinct from n then
   perform private.audit('ride.shuttle_line_saved','ride_shuttle_lines',n.id::text,jsonb_build_object('created',o.id is null,'origin',v_origin,
     'destination',v_dest,'seat_cents',p_seat_cents,'minutes',p_minutes,'evidence',v_ev,'until',p_valid_until,'enabled',p_enabled,'environment',v_env));
 end if;
 return private.ride_shuttle_line_view(n);
end $$;

-- The departures of one line (coming ones and those of the last 2 days) and the drivers the
-- operation can designate: approved, valid today, with an inspected vehicle capacity. The
-- trigger of the departure still checks the day, the seats and the pairing when designating.
create function public.admin_ride_shuttle_line_departures(p_line uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin(); l private.ride_shuttle_lines;
begin
 select * into l from private.ride_shuttle_lines where id=p_line and environment=v_env;
 if not found then raise exception 'not_allowed'; end if;
 return jsonb_build_object('line_id',l.id,'minutes',l.minutes,
  'departures',coalesce((select jsonb_agg(private.ride_shuttle_departure_view(d) order by d.departs_at,d.id)
    from (select x.* from private.ride_shuttle_departures x where x.line_id=l.id and x.departs_at>now()-interval '2 days'
      order by x.departs_at,x.id limit 100) d),'[]'),
  'drivers',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'label',p.full_name,'vehicle',r.vehicle,'seats',c.seats,
      'capacity_until',c.valid_until,'valid_until',r.valid_until) order by p.full_name,r.id)
    from public.ride_drivers r join private.ride_vehicle_capacity c on c.driver_id=r.id and c.vehicle=r.vehicle
      join public.profiles p on p.id=r.id and p.deleted_at is null
    where r.environment=v_env and r.status='approved' and r.valid_until>=private.sp_date(now()) and c.valid_until>now()
      and r.id<>auth.uid() and not private.ride_person_restricted(r.id,v_env)),'[]'));
end $$;
create function public.admin_save_ride_shuttle_departure(p_id uuid,p_line uuid,p_departs_at timestamptz,p_seats_total int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin(); l private.ride_shuttle_lines; o private.ride_shuttle_departures; n private.ride_shuttle_departures;
begin
 if p_id is null or p_line is null or p_departs_at is null or not isfinite(p_departs_at) or p_seats_total is null or p_seats_total not between 1 and 20 then
   raise exception 'invalid_input'; end if;
 select * into l from private.ride_shuttle_lines where id=p_line and environment=v_env;
 if not found then raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ride_registry:'||p_id::text,0));
 perform private.ride_shuttle_lock_departures(p_id);
 select * into o from private.ride_shuttle_departures where id=p_id;
 if found then
   if o.line_id<>l.id then raise exception 'idempotency_conflict'; end if;
   if (o.departs_at,o.seats_total)=(p_departs_at,p_seats_total) then return private.ride_shuttle_departure_view(o); end if;
   if o.state<>'open' then raise exception 'ride_seat_frozen'; end if;
 end if;
 if p_departs_at<=now() or p_departs_at>now()+interval '180 days' then raise exception 'invalid_input'; end if;
 if exists(select from private.ride_shuttle_departures x where x.line_id=l.id and x.departs_at=p_departs_at and x.id<>p_id) then
   raise exception 'ride_registry_duplicate'; end if;
 if o.id is null then
   insert into private.ride_shuttle_departures(id,line_id,departs_at,seats_total) values(p_id,l.id,p_departs_at,p_seats_total) returning * into n;
 else
   update private.ride_shuttle_departures set departs_at=p_departs_at,seats_total=p_seats_total where id=o.id returning * into n;
 end if;
 perform private.audit('ride.shuttle_departure_saved','ride_shuttle_departures',n.id::text,jsonb_build_object('created',o.id is null,'line',l.id,
   'departs_at',p_departs_at,'seats_total',p_seats_total,'environment',v_env));
 return private.ride_shuttle_departure_view(n);
end $$;
-- p_driver null withdraws the designation. Eligibility, capacity and pairing are the rules of
-- the departure triggers (20261127110605, 20261127110609).
create function public.admin_designate_shuttle_driver(p_departure uuid,p_driver uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin(); d private.ride_shuttle_departures;
begin
 if p_departure is null then raise exception 'invalid_input'; end if;
 if p_driver=auth.uid() then raise exception 'not_allowed'; end if;
 perform private.ride_shuttle_lock_departures(p_departure);
 select x.* into d from private.ride_shuttle_departures x join private.ride_shuttle_lines l on l.id=x.line_id where x.id=p_departure and l.environment=v_env;
 if not found then raise exception 'not_allowed'; end if;
 if d.driver_id is not distinct from p_driver then return private.ride_shuttle_departure_view(d); end if;
 if d.state<>'open' then raise exception 'ride_seat_frozen'; end if;
 if p_driver is not null and not exists(select from public.ride_drivers r where r.id=p_driver and r.environment=v_env) then raise exception 'driver_ineligible'; end if;
 update private.ride_shuttle_departures set driver_id=p_driver where id=d.id returning * into d;
 perform private.audit('ride.shuttle_driver_designated','ride_shuttle_departures',d.id::text,
   jsonb_build_object('driver',p_driver,'environment',v_env));
 return private.ride_shuttle_departure_view(d);
end $$;
-- The van left with its passengers: the confirmed seats stay confirmed, the departure is closed.
create function public.admin_mark_shuttle_departed(p_departure uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin(); d private.ride_shuttle_departures;
begin
 if p_departure is null then raise exception 'invalid_input'; end if;
 perform private.ride_shuttle_lock_departures(p_departure);
 select x.* into d from private.ride_shuttle_departures x join private.ride_shuttle_lines l on l.id=x.line_id where x.id=p_departure and l.environment=v_env;
 if not found then raise exception 'not_allowed'; end if;
 if d.state='departed' then return private.ride_shuttle_departure_view(d); end if;
 if d.state<>'open' then raise exception 'ride_seat_unavailable'; end if;
 update private.ride_shuttle_departures set state='departed' where id=d.id returning * into d;
 perform private.audit('ride.shuttle_departure_departed','ride_shuttle_departures',d.id::text,
   jsonb_build_object('seats_confirmed',private.ride_shuttle_taken(d.id),'environment',v_env));
 return private.ride_shuttle_departure_view(d);
end $$;

-- ── Hourly block tariffs ──
create function public.admin_ride_block_tariffs() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin();
begin
 return jsonb_build_object('simulation',v_env='simulation','areas',private.ride_registry_areas(v_env),
  'tariffs',coalesce((select jsonb_agg(private.ride_block_tariff_view(t) order by t.area,t.minutes,t.code)
    from (select x.* from private.ride_block_tariffs x where x.environment=v_env order by x.area,x.minutes,x.code limit 300) t),'[]'));
end $$;
create function public.admin_save_ride_block_tariff(p_id uuid,p_area text,p_code text,p_minutes int,p_included_km int,p_block_cents int,
 p_extra_15min_cents int,p_extra_km_cents int,p_evidence_ref text,p_valid_until timestamptz) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin(); o private.ride_block_tariffs; n private.ride_block_tariffs;
 v_area text:=trim(p_area); v_code text:=trim(p_code); v_ev text:=trim(p_evidence_ref);
begin
 if p_id is null or not private.ride_registry_area(v_env,v_area) or v_code is null or v_code !~ '^[a-z0-9][a-z0-9_-]{0,23}$'
   or p_minutes is null or p_minutes not between 60 and 720 or p_included_km is null or p_included_km not between 1 and 1000
   or p_block_cents is null or p_block_cents not between 1 and 10000000 or p_extra_15min_cents is null or p_extra_15min_cents not between 0 and 1000000
   or p_extra_km_cents is null or p_extra_km_cents not between 0 and 100000 or not private.ride_registry_text(v_ev,160) or p_valid_until is null then
   raise exception 'invalid_input'; end if;
 perform private.ride_registry_evidence(v_env,true,array[v_ev],p_valid_until);
 perform pg_advisory_xact_lock(hashtextextended('ride_registry:'||p_id::text,0));
 select * into o from private.ride_block_tariffs where id=p_id for update;
 if found and o.environment<>v_env then raise exception 'idempotency_conflict'; end if;
 if exists(select from private.ride_block_tariffs x where x.environment=v_env and x.area=v_area and x.code=v_code and x.id<>p_id) then
   raise exception 'ride_registry_duplicate'; end if;
 if o.id is null then
   insert into private.ride_block_tariffs(id,environment,area,code,minutes,included_km,block_cents,extra_15min_cents,extra_km_cents,evidence_ref,valid_until)
   values(p_id,v_env,v_area,v_code,p_minutes,p_included_km,p_block_cents,p_extra_15min_cents,p_extra_km_cents,v_ev,p_valid_until) returning * into n;
 else
   update private.ride_block_tariffs set area=v_area,code=v_code,minutes=p_minutes,included_km=p_included_km,block_cents=p_block_cents,
     extra_15min_cents=p_extra_15min_cents,extra_km_cents=p_extra_km_cents,evidence_ref=v_ev,valid_until=p_valid_until where id=o.id returning * into n;
 end if;
 if o is distinct from n then
   perform private.audit('ride.block_tariff_saved','ride_block_tariffs',n.id::text,jsonb_build_object('created',o.id is null,'area',v_area,'code',v_code,
     'minutes',p_minutes,'included_km',p_included_km,'block_cents',p_block_cents,'evidence',v_ev,'until',p_valid_until,'environment',v_env));
 end if;
 return private.ride_block_tariff_view(n);
end $$;

-- ── Intercity corridors (one row per direction, keyed by the pair) ──
create function public.admin_ride_intercity_corridors() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin();
begin
 return jsonb_build_object('simulation',v_env='simulation','areas',private.ride_registry_areas(v_env),
  'corridors',coalesce((select jsonb_agg(private.ride_corridor_view(c) order by c.origin,c.destination)
    from (select x.* from private.ride_intercity_corridors x where x.environment=v_env order by x.origin,x.destination limit 200) c),'[]'));
end $$;
create function public.admin_save_ride_intercity_corridor(p_origin text,p_destination text,p_origin_jurisdiction text,p_destination_jurisdiction text,
 p_authority_ref text,p_coverage_ref text,p_empty_return_cents int,p_return_minutes int,p_valid_until timestamptz,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin(); o private.ride_intercity_corridors; n private.ride_intercity_corridors;
 v_origin text:=trim(p_origin); v_dest text:=trim(p_destination); v_oj text:=trim(p_origin_jurisdiction); v_dj text:=trim(p_destination_jurisdiction);
 v_auth text:=trim(p_authority_ref); v_cov text:=trim(p_coverage_ref);
begin
 if not private.ride_registry_text(v_origin,120) or not private.ride_registry_text(v_dest,120) or v_origin=v_dest
   or not private.ride_registry_text(v_oj,120) or not private.ride_registry_text(v_dj,120) or v_oj=v_dj
   or not private.ride_registry_text(v_auth,160) or not private.ride_registry_text(v_cov,160)
   or p_empty_return_cents is null or p_empty_return_cents not between 0 and 10000000 or p_return_minutes is null or p_return_minutes not between 0 and 720
   or p_valid_until is null or p_enabled is null
   or not (private.ride_registry_area(v_env,v_origin) or private.ride_registry_area(v_env,v_dest)) then raise exception 'invalid_input'; end if;
 perform private.ride_registry_evidence(v_env,p_enabled,array[v_auth,v_cov],p_valid_until);
 perform pg_advisory_xact_lock(hashtextextended('ride_registry:'||v_env||':'||v_origin||':'||v_dest,0));
 select * into o from private.ride_intercity_corridors where environment=v_env and origin=v_origin and destination=v_dest for update;
 if o.origin is null then
   insert into private.ride_intercity_corridors(environment,origin,destination,origin_jurisdiction,destination_jurisdiction,authority_ref,coverage_ref,
     empty_return_cents,return_minutes,valid_until,enabled)
   values(v_env,v_origin,v_dest,v_oj,v_dj,v_auth,v_cov,p_empty_return_cents,p_return_minutes,p_valid_until,p_enabled) returning * into n;
 else
   update private.ride_intercity_corridors set origin_jurisdiction=v_oj,destination_jurisdiction=v_dj,authority_ref=v_auth,coverage_ref=v_cov,
     empty_return_cents=p_empty_return_cents,return_minutes=p_return_minutes,valid_until=p_valid_until,enabled=p_enabled
   where environment=v_env and origin=v_origin and destination=v_dest returning * into n;
 end if;
 if o is distinct from n then
   perform private.audit('ride.intercity_corridor_saved','ride_intercity_corridors',v_origin||' > '||v_dest,jsonb_build_object('created',o.origin is null,
     'authority',v_auth,'coverage',v_cov,'empty_return_cents',p_empty_return_cents,'return_minutes',p_return_minutes,'until',p_valid_until,
     'enabled',p_enabled,'environment',v_env));
 end if;
 return private.ride_corridor_view(n);
end $$;

-- ── Reserve policies (one per area) ──
create function public.admin_ride_reserve_policies() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin();
begin
 return jsonb_build_object('simulation',v_env='simulation','areas',private.ride_registry_areas(v_env),
  'policies',coalesce((select jsonb_agg(private.ride_reserve_policy_view(p) order by p.area)
    from (select x.* from private.ride_reserve_policies x where x.environment=v_env order by x.area limit 200) p),'[]'));
end $$;
create function public.admin_save_ride_reserve_policy(p_area text,p_min_lead_minutes int,p_confirm_lead_minutes int,p_max_shift_minutes int,
 p_evidence_ref text,p_valid_until timestamptz,p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin(); o private.ride_reserve_policies; n private.ride_reserve_policies;
 v_area text:=trim(p_area); v_ev text:=trim(p_evidence_ref);
begin
 if not private.ride_registry_area(v_env,v_area) or p_min_lead_minutes is null or p_min_lead_minutes not between 0 and 43200
   or p_confirm_lead_minutes is null or p_confirm_lead_minutes not between 1 and 1440 or p_confirm_lead_minutes>p_min_lead_minutes
   or p_max_shift_minutes is null or p_max_shift_minutes not between 0 and 1440 or not private.ride_registry_text(v_ev,160)
   or p_valid_until is null or p_enabled is null then raise exception 'invalid_input'; end if;
 perform private.ride_registry_evidence(v_env,p_enabled,array[v_ev],p_valid_until);
 perform pg_advisory_xact_lock(hashtextextended('ride_registry:'||v_env||':reserve:'||v_area,0));
 select * into o from private.ride_reserve_policies where environment=v_env and area=v_area for update;
 if o.area is null then
   insert into private.ride_reserve_policies(environment,area,min_lead_minutes,confirm_lead_minutes,max_shift_minutes,evidence_ref,valid_until,enabled)
   values(v_env,v_area,p_min_lead_minutes,p_confirm_lead_minutes,p_max_shift_minutes,v_ev,p_valid_until,p_enabled) returning * into n;
 else
   update private.ride_reserve_policies set min_lead_minutes=p_min_lead_minutes,confirm_lead_minutes=p_confirm_lead_minutes,
     max_shift_minutes=p_max_shift_minutes,evidence_ref=v_ev,valid_until=p_valid_until,enabled=p_enabled
   where environment=v_env and area=v_area returning * into n;
 end if;
 if o is distinct from n then
   perform private.audit('ride.reserve_policy_saved','ride_reserve_policies',v_area,jsonb_build_object('created',o.area is null,
     'min_lead_minutes',p_min_lead_minutes,'confirm_lead_minutes',p_confirm_lead_minutes,'max_shift_minutes',p_max_shift_minutes,
     'evidence',v_ev,'until',p_valid_until,'enabled',p_enabled,'environment',v_env));
 end if;
 return private.ride_reserve_policy_view(n);
end $$;

-- ── Stage-5 listings ──
-- Drivers cleared for trips with a dependent, current and lapsed. No document, only the reference.
create function public.admin_ride_minor_clearances() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('driver_id',c.driver_id,'driver_label',p.full_name,'vehicle',r.vehicle,
     'driver_status',r.status,'evidence_ref',c.evidence_ref,'valid_until',c.valid_until,'granted_at',c.granted_at,'active',c.valid_until>now())
     order by (c.valid_until>now()) desc,c.valid_until,c.driver_id)
   from (select x.* from private.ride_minor_driver_clearances x join public.ride_drivers y on y.id=x.driver_id and y.environment=v_env
     order by x.valid_until desc,x.driver_id limit 300) c
   join public.ride_drivers r on r.id=c.driver_id left join public.profiles p on p.id=c.driver_id and p.deleted_at is null),'[]'::jsonb);
end $$;
-- Guest invites issued by companies: who issued (the company), the itinerary by area and the
-- state. Never the recipient: only its hash is stored.
create function public.admin_ride_guest_invites() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'account_id',i.account_id,'account_name',a.name,
     'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,
     'legs',(select coalesce(jsonb_agg(jsonb_build_object('origin',x.leg->>'origin','destination',x.leg->>'destination') order by x.n),'[]'::jsonb)
       from jsonb_array_elements(i.request_legs) with ordinality x(leg,n)),
     'scheduled_at',i.scheduled_at,'expires_at',i.expires_at,'answered_at',i.answered_at,'created_at',i.created_at) order by i.created_at desc,i.id)
   from (select x.* from private.ride_guest_invites x join private.ride_accounts y on y.id=x.account_id and y.environment=v_env
     order by x.created_at desc,x.id limit 200) i join private.ride_accounts a on a.id=i.account_id),'[]'::jsonb);
end $$;
-- The operation revokes a pending invite, as its issuer can (20261127110504): the guest grant
-- is rejected with it. A replay on a revoked invite answers the same.
create function public.admin_revoke_ride_guest_invite(p_id uuid,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin(); i private.ride_guest_invites; v_reason text:=trim(p_reason);
begin
 if p_id is null or v_reason is null or length(v_reason) not between 4 and 200 then raise exception 'invalid_input'; end if;
 select x.* into i from private.ride_guest_invites x join private.ride_accounts a on a.id=x.account_id where x.id=p_id and a.environment=v_env for update of x;
 if not found then raise exception 'not_allowed'; end if;
 if i.status='revoked' then return jsonb_build_object('id',i.id,'status',i.status,'answered_at',i.answered_at); end if;
 if i.status<>'pending' or i.expires_at<=now() then raise exception 'ride_invite_unavailable'; end if;
 update private.ride_guest_invites set status='revoked',answered_at=now() where id=i.id returning * into i;
 update private.ride_trip_grants set status='rejected',decided_at=now() where id=i.grant_id and status='approved';
 perform private.audit('ride.guest_invite_revoked','ride_guest_invites',i.id::text,jsonb_build_object('account',i.account_id,'reason',v_reason,'environment',v_env));
 return jsonb_build_object('id',i.id,'status',i.status,'answered_at',i.answered_at);
end $$;
-- Closed invoices, newest month first, with their lines and the contestations still open.
create function public.admin_ride_closed_invoices() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_env text:=private.ride_registry_admin();
begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'account_id',o.account_id,'account_name',a.name,'month',o.month,
     'total_cents',o.total_cents,'closed_at',o.closed_at,'lines',(select count(*) from private.ride_invoice_lines l where l.invoice_id=o.id),
     'open_disputes',(select count(*) from private.ride_invoice_lines l join private.ride_invoice_disputes d on d.line_id=l.id
       where l.invoice_id=o.id and d.status='open')) order by o.month desc,a.name,o.id)
   from (select x.* from private.ride_invoices x where x.environment=v_env and x.status='closed' order by x.month desc,x.id limit 200) o
   join private.ride_accounts a on a.id=o.account_id),'[]'::jsonb);
end $$;

-- ── Grants ──
revoke all on function private.guard_ride_registry_identity(),private.guard_ride_shuttle_departed(),private.ride_registry_admin(),
 private.ride_registry_text(text,int),private.ride_registry_evidence(text,boolean,text[],timestamptz),private.ride_registry_areas(text),
 private.ride_registry_area(text,text),private.ride_registry_until(timestamptz),
 private.ride_shuttle_line_view(private.ride_shuttle_lines),private.ride_shuttle_departure_view(private.ride_shuttle_departures),
 private.ride_block_tariff_view(private.ride_block_tariffs),private.ride_corridor_view(private.ride_intercity_corridors),
 private.ride_reserve_policy_view(private.ride_reserve_policies) from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.admin_ride_shuttle_lines()','public.admin_save_ride_shuttle_line(uuid,text,text,text,int,int,text,timestamptz,boolean)',
   'public.admin_ride_shuttle_line_departures(uuid)','public.admin_save_ride_shuttle_departure(uuid,uuid,timestamptz,int)',
   'public.admin_designate_shuttle_driver(uuid,uuid)','public.admin_mark_shuttle_departed(uuid)',
   'public.admin_ride_block_tariffs()','public.admin_save_ride_block_tariff(uuid,text,text,int,int,int,int,int,text,timestamptz)',
   'public.admin_ride_intercity_corridors()','public.admin_save_ride_intercity_corridor(text,text,text,text,text,text,int,int,timestamptz,boolean)',
   'public.admin_ride_reserve_policies()','public.admin_save_ride_reserve_policy(text,int,int,int,text,timestamptz,boolean)',
   'public.admin_ride_minor_clearances()','public.admin_ride_guest_invites()','public.admin_revoke_ride_guest_invite(uuid,text)',
   'public.admin_ride_closed_invoices()']::regprocedure[] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
