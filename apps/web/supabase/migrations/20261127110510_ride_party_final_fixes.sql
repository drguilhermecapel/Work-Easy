-- O17 stage 5 final fixes (PAR-501..508), on top of 20261127110509:
--  1. The fleet rule that follows the vehicle only binds a driver to a fleet the driver drove for
--     (a fleet_driver membership or a cession there), so no fleet can cut an independent driver
--     off by registering that driver's vehicle identifier.
--  2. A dependent is not withdrawn while a linked leg is 'unknown' (contact lost, trip still live).
--  3. A route change of a voucher leg is checked with the leg's new fare: a program that leaves
--     no excess to the rider refuses a fare above the reserved cents.
--  4. A voucher only holds the order (no cash, no personal charge) while it can be applied now:
--     when its 'benefit' method is not available, the order is payable the ordinary way.

-- ─── 1. Fleet rule bound to the driver's own fleets ───────────────────────────────────────
create or replace function private.ride_fleet_can_serve(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select (not exists(select from private.ride_account_members m join private.ride_accounts a on a.id=m.account_id
       where m.member_id=p_driver and m.status='active' and m.role='fleet_driver' and a.kind='fleet' and a.status='active' and a.environment=l.environment)
     -- Leaving a fleet does not free a car the operation knows as a vehicle of that fleet: a new
     -- inspection of the driver's own vehicle, or a reviewed cession, is needed first. Only fleets
     -- the driver drove for count; any other fleet's register says nothing about this driver.
     and not exists(select from private.ride_vehicle_capacity c join private.ride_fleet_vehicles v on v.vehicle_identifier=c.document_ref and v.status='active'
       join private.ride_accounts a on a.id=v.account_id and a.kind='fleet' and a.status='active' and a.environment=l.environment
       where c.driver_id=p_driver
         and (exists(select from private.ride_account_members m where m.account_id=a.id and m.member_id=p_driver and m.role='fleet_driver')
           or exists(select from private.ride_fleet_assignments s where s.account_id=a.id and s.driver_id=p_driver))))
   or private.ride_fleet_assignment(p_driver,l) is not null
$$;

-- ─── 2. Withdrawal of a dependent during a trip whose state is unknown ────────────────────
create or replace function public.ride_withdraw_dependent(p_dependent uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); d private.ride_dependents;
begin
 if not private.ride_active_user(me) or p_dependent is null then raise exception 'not_allowed'; end if;
 select * into d from private.ride_dependents where id=p_dependent and guardian_id=me and environment=private.ride_env() for update;
 if not found then return false; end if;
 -- 'unknown' is a live trip whose contact was lost: it can still complete or be cancelled.
 if exists(select from private.ride_leg_dependents x join public.ride_legs l on l.id=x.leg_id
     where x.dependent_id=d.id and l.status in ('requested','accepted','arriving','boarded','unknown')) then raise exception 'ride_dependent_in_trip'; end if;
 update private.ride_quotes q set status='superseded' from private.ride_quote_dependents x
  where x.dependent_id=d.id and q.id=x.quote_id and q.status='awaiting_consent';
 delete from private.ride_dependents where id=d.id;
 return true;
end $$;

-- ─── 3. Route change of a voucher leg, with its new fare ──────────────────────────────────
-- The reserved cents stay. The plan runs on the leg's new fare with the reserved cents as the
-- ceiling, so a fare above them is refused unless the program leaves the excess to the rider.
create or replace function private.ride_voucher_leg_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare g private.ride_voucher_grants; f private.ride_leg_funding; p private.ride_voucher_programs; v_ceiling int; v_class text;
begin
 select * into g from private.ride_voucher_grants where leg_id=new.id;
 if not found or exists(select from private.ride_benefit_uses u where u.benefit_id=g.benefit_id) then return new; end if;
 select * into strict f from private.ride_leg_funding where leg_id=new.id;
 select * into strict p from private.ride_voucher_programs where id=g.program_id for update;
 if f.grant_id is not null then
   select ceiling_cents into v_ceiling from private.ride_trip_grants where id=f.grant_id and validity @> new.pickup_at;
   if not found then raise exception 'ride_approval_required'; end if;
 end if;
 select coalesce(e->>'class_code',e->>'ride_class') into v_class from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) e
  where q.id=f.quote_id order by ((e->>'seq')::int=old.quote_seq and old.source_quote_id=f.quote_id) desc,(e->>'seq')::int limit 1;
 perform private.ride_voucher_plan(p,jsonb_build_object('origin',new.origin,'destination',new.destination,'pickup_at',new.pickup_at,
   'duration_minutes',new.duration_minutes,'fare_cents',new.fare_cents,'class_code',v_class),least(coalesce(v_ceiling,g.granted_cents),g.granted_cents));
 if not private.ride_voucher_payable(new.environment,new.origin,new.destination,upper(new.slot)) then raise exception 'ride_voucher_unavailable'; end if;
 update private.ride_benefits set valid_until=upper(new.slot)+interval '30 days' where id=g.benefit_id;
 return new;
end $$;
drop trigger ride_voucher_leg_change on public.ride_legs;
create trigger ride_voucher_leg_change before update of origin,destination,pickup_at,slot,fare_cents on public.ride_legs for each row
 when(new.status<>'cancelled' and (new.origin,new.destination,new.pickup_at,new.slot,new.fare_cents) is distinct from (old.origin,old.destination,old.pickup_at,old.slot,old.fare_cents))
 execute function private.ride_voucher_leg_guard();

-- ─── 4. A voucher holds the order only while it can be applied ────────────────────────────
create or replace function private.ride_voucher_waiting(p_leg uuid,p_payer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_voucher_grants g join private.ride_benefits b on b.id=g.benefit_id join public.ride_legs l on l.id=g.leg_id
   where g.leg_id=p_leg and g.member_id=p_payer and b.valid_until>now() and b.available_cents>0
     and not exists(select from private.ride_benefit_uses u where u.benefit_id=b.id)
     and private.ride_method(l,'benefit') is not null)
$$;

-- ─── Grants ───────────────────────────────────────────────────────────────────────────────
revoke all on function private.ride_fleet_can_serve(uuid,public.ride_legs),private.ride_voucher_leg_guard(),
 private.ride_voucher_waiting(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.ride_withdraw_dependent(uuid) from public,anon,service_role;
grant execute on function public.ride_withdraw_dependent(uuid) to authenticated;
