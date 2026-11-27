-- Authority must cover the promised trip, including any delay to reach pickup.
-- These checks stop a new commitment or departure; cancellation, assistance,
-- completion, reconciliation and receipt access remain possible.
create function private.ride_scope_covers(p_origin text,p_destination text,p_until timestamptz,
  p_dispatch boolean,p_fee boolean) returns boolean language sql stable set search_path='' as $$
 select p_until is not null and exists(select from private.ride_network n where n.environment='live'
   and n.module_enabled and n.quote_enabled and (not p_dispatch or n.dispatch_enabled) and (not p_fee or n.monetization_enabled))
   and not exists(select from unnest(array[p_origin,p_destination]) endpoint where not exists(
     select from private.ride_area_authorizations a where a.area=endpoint and a.until_at>=greatest(now(),p_until)
     and a.quote_enabled and (not p_dispatch or a.dispatch_enabled) and (not p_fee or a.monetization_enabled)))
$$;

-- Only a digest of the service binding and its schedule are needed, with no
-- address copied into the itinerary. Replacement offers get fresh snapshots.
create table private.ride_service_windows (
 quote_id uuid not null references private.ride_quotes(id) on delete cascade,
 booking_id uuid not null references public.bookings(id), period tstzrange not null,
 binding bytea not null,primary key(quote_id,booking_id)
);
revoke all on private.ride_service_windows from public,anon,authenticated,service_role;
create function private.ride_service_binding(b public.bookings) returns bytea language sql stable set search_path='' as $$
 select sha256(convert_to(jsonb_build_array(b.id,b.provider_id,b.client_id,b.request_id,b.service_id,b.household_id,
   (select neighborhood_id from public.requests where id=b.request_id))::text,'UTF8'))
$$;
create function private.snapshot_ride_service_windows() returns trigger language plpgsql security definer set search_path='' as $$
declare leg jsonb;
begin
 for leg in select value from jsonb_array_elements(new.legs) loop
   if not private.ride_scope_covers(leg->>'origin',leg->>'destination',(leg->>'pickup_at')::timestamptz
      +make_interval(mins=>(leg->>'duration_minutes')::int),false,(leg->>'fee_cents')::int>0)
      then raise exception 'ride_scope_expired'; end if;
 end loop;
 insert into private.ride_service_windows
   select new.id,b.id,b.period,private.ride_service_binding(b) from public.bookings b where b.id=new.booking_id
     or b.id in (select (l->>'next_booking_id')::uuid from jsonb_array_elements(new.legs) l);
 return null;
end $$;
create trigger snapshot_ride_service_windows after insert on private.ride_quotes for each row
 when(new.environment='live' and new.status='awaiting_consent') execute function private.snapshot_ride_service_windows();

create function private.ride_eligibility_issue(l public.ride_legs,p_until timestamptz,p_driver uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare r public.rides; b public.bookings; next_b public.bookings;
begin
 if l.environment<>'live' then return null; end if;
 if not private.ride_scope_covers(l.origin,l.destination,p_until,true,l.fee_cents>0) then return 'ride_scope_expired'; end if;
 if p_driver is not null and (not private.ride_active_user(p_driver)
   or not private.ride_driver_valid(p_driver,(p_until at time zone 'America/Sao_Paulo')::date)
   or not exists(select from private.ride_driver_credentials c join private.ride_dossiers d on d.id::text=c.driver_document_ref
       where c.driver_id=p_driver and d.driver_id=p_driver and d.expires_at>=p_until)
   or not exists(select from private.ride_receipt_policy where environment='live' and approved_until>=p_until))
 then return 'ride_driver_expired'; end if;
 select * into strict r from public.rides where id=l.ride_id;
 if r.booking_id is null then return null; end if;
 select * into b from public.bookings where id=r.booking_id;
 if b.origin<>'platform' or b.provider_id is distinct from r.passenger_id or not private.ride_active_user(b.client_id)
   or not private.ride_active_user(r.passenger_id) or not exists(select from private.ride_service_windows w
     where w.quote_id=l.source_quote_id and w.booking_id=b.id and w.period=b.period and w.binding=private.ride_service_binding(b))
 then return 'ride_service_changed'; end if;
 if l.service_endpoint='destination' then
   if b.status not in ('accepted','paid','in_progress') or p_until>upper(b.period) then return 'ride_service_changed'; end if;
 elsif b.status not in ('accepted','paid','in_progress') and not (
   (l.next_booking_id is not null and b.status in ('completed','released') and l.pickup_at>=upper(b.period))
   or (l.seq>1 and b.status in ('completed','released','disputed','canceled') and private.ride_prior_boarded(r.id,l.seq)))
 then return 'ride_service_changed'; end if;
 if l.next_booking_id is not null then
   select * into next_b from public.bookings where id=l.next_booking_id;
   if next_b.origin<>'platform' or next_b.provider_id is distinct from r.passenger_id or not private.ride_active_user(next_b.client_id)
      or next_b.status not in ('accepted','paid') or p_until>lower(next_b.period)
      or not exists(select from private.ride_service_windows w where w.quote_id=l.source_quote_id and w.booking_id=next_b.id
        and w.period=next_b.period and w.binding=private.ride_service_binding(next_b))
   then return 'ride_service_changed'; end if;
 end if;
 return null;
end $$;

-- Dashboard, push and accept consult the same driver-specific horizon.
alter function private.ride_offer_eligible(uuid,public.ride_legs) rename to ride_base_offer_eligible;
create function private.ride_offer_eligible(p_driver uuid,l public.ride_legs) returns boolean
language sql stable security definer set search_path='' as $$
 select private.ride_base_offer_eligible(p_driver,l)
   and (l.environment<>'live' or private.ride_eligibility_issue(l,
      (select upper(p.driver_slot) from private.ride_approach_plan(p_driver,l) p),p_driver) is null)
$$;

create function private.check_ride_departure() returns trigger language plpgsql security definer set search_path='' as $$
declare horizon timestamptz:=upper(coalesce(new.driver_slot,new.slot));issue text;
begin
 if tg_op='UPDATE' and new.status='arriving' then
   -- A late departure still needs the originally calibrated approach plus
   -- the passenger's travel time before the authorization horizon ends.
   horizon:=greatest(horizon,now()+coalesce(upper(new.driver_slot)-lower(new.driver_slot),
     make_interval(mins=>new.duration_minutes)));
 elsif tg_op='UPDATE' and new.status='boarded' then
   horizon:=greatest(horizon,now()+make_interval(mins=>new.duration_minutes));
 end if;
 issue:=private.ride_eligibility_issue(new,horizon,new.driver_id);
 if issue is not null then raise exception '%',issue; end if;
 return new;
end $$;
create trigger ride_creation_eligibility before insert on public.ride_legs for each row
 when(new.environment='live' and new.status='requested') execute function private.check_ride_departure();
create trigger ride_departure_eligibility before update of status,driver_slot on public.ride_legs for each row
 when(new.environment='live' and (new.driver_slot is distinct from old.driver_slot or
   (new.status is distinct from old.status and new.status in ('accepted','arriving','boarded'))))
 execute function private.check_ride_departure();

-- Lock the service(s) before the leg on departure as dispatch already does.
-- This serializes a simultaneous reschedule with starting a still-authorized trip.
alter function private.ride_command(uuid,text,uuid) rename to ride_base_command;
create function private.ride_command(p_leg uuid,p_action text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if p_action in ('arriving','boarded') then
   perform b.id from public.ride_legs l join public.rides r on r.id=l.ride_id
     join public.bookings b on b.id=r.booking_id or b.id=l.next_booking_id
     where l.id=p_leg and l.environment='live' and l.driver_id=auth.uid() order by b.id for share of b;
 end if;
 return private.ride_base_command(p_leg,p_action,p_key);
end $$;

revoke all on function private.ride_scope_covers(text,text,timestamptz,boolean,boolean),
 private.ride_service_binding(public.bookings),private.snapshot_ride_service_windows(),
 private.ride_eligibility_issue(public.ride_legs,timestamptz,uuid),private.check_ride_departure(),
 private.ride_offer_eligible(uuid,public.ride_legs),private.ride_command(uuid,text,uuid)
 from public,anon,authenticated,service_role;
