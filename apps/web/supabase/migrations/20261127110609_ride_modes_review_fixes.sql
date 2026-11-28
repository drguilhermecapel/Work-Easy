-- O17 stage 6: fixes from the adversarial review of the modalities (PAR-601..606). Every
-- change is a rename-and-wrap, a constraint or a create-or-replace of a function that only
-- stage 6 owns. No table, no seed, no new public name: the public RPCs keep their
-- signatures and grants. Each block names the defect it closes.

-- ── Pairing (stage 3) as one predicate: a pair block in either direction or an active
-- operator restriction of either person stops the pair. Used where stage 6 sells or
-- promises a vehicle without going through ride_offer_eligible.
create function private.ride_person_restricted(p_user uuid,p_env text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_restrictions s where s.subject=p_user and s.environment=p_env and s.until_at>now() and s.appeal_state<>'lifted')
$$;
create function private.ride_pair_allowed(p_driver uuid,p_passenger uuid,p_env text) returns boolean
language sql stable security definer set search_path='' as $$
 select p_driver is not null and p_passenger is not null
   and not exists(select from private.ride_pair_blocks b where (b.actor=p_driver and b.other=p_passenger) or (b.actor=p_passenger and b.other=p_driver))
   and not private.ride_person_restricted(p_driver,p_env) and not private.ride_person_restricted(p_passenger,p_env)
$$;

-- ── PAR-602: the accessible supply counted a driver who can never be paired with this
-- passenger (blocked pair or restriction), so the quote promised a vehicle never offered.
create or replace function private.ride_access_supply(c private.ride_route_cases,depart timestamptz,p_assistance text,p_companion boolean,p_minutes int)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare f private.ride_route_preferences;
begin
 if p_minutes is null or p_assistance is null or p_companion is null or depart is null or c.minutes is null then return false; end if;
 select * into f from private.ride_route_preferences where route_id=c.id;
 c.minutes:=c.minutes+p_minutes;
 return exists(select from private.ride_capacity_candidates(c,depart) k
   where private.ride_active_user(k.driver_id) and private.ride_driver_valid(k.driver_id,private.sp_date(upper(k.occupied)))
     and private.ride_pair_allowed(k.driver_id,c.passenger_id,c.environment)
     and private.ride_access_equipped(k.driver_id,p_assistance,p_companion,lower(k.occupied),upper(k.occupied))
     and (f.route_id is null or (f.class_until>=upper(k.occupied)
       and private.ride_qualified_capacity(k.driver_id,lower(k.occupied),upper(k.occupied),f.seats,f.tools,f.accessible)
       and private.ride_vehicle_meets(k.driver_id,f))));
end $$;

-- ── PAR-602: the assisted boarding time was billable as waiting. The frozen price rule of
-- every assisted leg grants the boarding minutes on top of its free wait, once.
alter function private.ride_quote_access_door(uuid,uuid,timestamptz,jsonb,text,boolean) rename to ride_quote_access_door_before_wait;
create function private.ride_quote_access_door(p_key uuid,p_booking uuid,p_scheduled_at timestamptz,p_legs jsonb,p_assistance text,p_companion boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb:=private.ride_quote_access_door_before_wait(p_key,p_booking,p_scheduled_at,p_legs,p_assistance,p_companion); q private.ride_quotes; v_boarding jsonb;
begin
 select * into q from private.ride_quotes where id=(v->>'id')::uuid for update;
 select a.boarding into v_boarding from private.ride_access_quotes a where a.quote_id=q.id;
 if q.status<>'awaiting_consent' or v_boarding is null or not exists(select from jsonb_each(q.price_rules) r
    where v_boarding ? r.key and jsonb_typeof(r.value)='object' and not r.value ? 'assisted_boarding_minutes') then return v; end if;
 update private.ride_quotes set price_rules=(select jsonb_object_agg(r.key,case when v_boarding ? r.key and jsonb_typeof(r.value)='object'
     and not r.value ? 'assisted_boarding_minutes' then r.value||jsonb_build_object(
       'free_wait_minutes',coalesce((r.value->>'free_wait_minutes')::int,0)+(v_boarding->>r.key)::int,'assisted_boarding_minutes',(v_boarding->>r.key)::int)
     else r.value end) from jsonb_each(q.price_rules) r)
 where id=q.id returning * into q;
 return private.ride_quote_view(q,auth.uid());
end $$;

-- ── PAR-601/602: the assistance-animal price guard was a short list of words. Two closed
-- rules replace it as the first line: an extra is one of the reviewed kinds (a new priced
-- kind takes a reviewed migration), and an animal word only names a class sold as a pet
-- class. The name check stays as a second line, on normalised text (accents, any dash or
-- space) and also covering a priced assistance need (wheelchair, companion).
create function private.ride_plain_label(p_text text) returns text language sql immutable set search_path='' as $$
 select btrim(regexp_replace(lower(translate(coalesce(p_text,''),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ','AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn')),
   '[^a-z0-9]+',' ','g'))
$$;
create function private.ride_names_animal(p_text text) returns boolean language sql immutable set search_path='' as $$
 select private.ride_plain_label(p_text) ~ '(^| )(cao|caes|cachorr[a-z]*|cadel[a-z]*|canin[a-z]*|animal|animais|dogs?|pets?|gat[ao]s?|felin[a-z]*)( |$)'
$$;
create function private.ride_names_assistance(p_text text) returns boolean language sql immutable set search_path='' as $$
 select private.ride_names_assistance_animal(p_text) or (private.ride_names_animal(p_text)
     and private.ride_plain_label(p_text) ~ '(^| )(guias?|guide|seeing|ouvintes?|alerta|servicos?|service|apoio|support|suporte|assist[a-z]*|emociona[a-z]*|emotional|terap[a-z]*|therap[a-z]*)( |$)')
   or private.ride_plain_label(p_text) ~ '(^| )(cadeira de rodas|cadeirantes?|wheel ?chairs?|acompanhantes?|companion|mobilidade reduzida|deficien[a-z]*|pcd|assistencias?|assistance|guide dog|seeing eye)( |$)'
$$;
alter table private.ride_extra_prices
 add constraint ride_extra_prices_reviewed_kind check(code in ('luggage','toll','pet','child_seat')),
 add constraint ride_extra_prices_no_assistance check(not private.ride_names_assistance(code) and not private.ride_names_assistance(label));
alter table private.ride_class_policies
 add constraint ride_class_policies_no_assistance check(not private.ride_names_assistance(code) and not private.ride_names_assistance(label)),
 add constraint ride_class_policies_animal_is_pet check(pets or not (private.ride_names_animal(code) or private.ride_names_animal(label)));

-- ── PAR-606 (intercity): the modality gate never checked the corridor, so the catalog and
-- the door called intercity available for any pair. With both areas given, intercity needs
-- an enabled corridor valid through p_until.
alter function private.ride_modality_issue(text,text,text,text,timestamptz,timestamptz) rename to ride_modality_issue_before_corridor;
create function private.ride_modality_issue(p_env text,p_modality text,p_origin text,p_destination text,p_until timestamptz,p_pickup timestamptz default null)
returns text language sql stable security definer set search_path='' as $$
 select coalesce(private.ride_modality_issue_before_corridor(p_env,p_modality,p_origin,p_destination,p_until,p_pickup),
   case when p_modality='intercity' and p_origin is not null and p_destination is not null
     and (private.ride_corridor(p_env,p_origin,p_destination,p_until)).origin is null then 'corridor_unavailable' end)
$$;

-- ── PAR-604 (seat): a passenger under an operator restriction booked seats, and a driver
-- could be designated to passengers he cannot be paired with. Rules for any writer.
create function private.guard_ride_shuttle_seat_pairing() returns trigger language plpgsql security definer set search_path='' as $$
declare v_env text; v_driver uuid;
begin
 select l.environment,d.driver_id into v_env,v_driver from private.ride_shuttle_departures d join private.ride_shuttle_lines l on l.id=d.line_id
  where d.id=new.departure_id;
 if private.ride_person_restricted(new.passenger_id,v_env) or (v_driver is not null and not private.ride_pair_allowed(v_driver,new.passenger_id,v_env)) then
   raise exception 'ride_pair_unavailable'; end if;
 return new;
end $$;
create trigger ride_shuttle_seat_pairing before insert on private.ride_shuttle_seats for each row execute function private.guard_ride_shuttle_seat_pairing();
create function private.guard_ride_shuttle_driver_pairing() returns trigger language plpgsql security definer set search_path='' as $$
declare v_env text;
begin
 select environment into v_env from private.ride_shuttle_lines where id=new.line_id;
 if private.ride_person_restricted(new.driver_id,v_env) then raise exception 'driver_ineligible'; end if;
 if exists(select from private.ride_shuttle_seats s where s.departure_id=new.id and s.state='confirmed'
      and not private.ride_pair_allowed(new.driver_id,s.passenger_id,v_env)) then raise exception 'ride_pair_unavailable'; end if;
 return new;
end $$;
create trigger ride_shuttle_driver_pairing before insert or update of driver_id on private.ride_shuttle_departures for each row
 when(new.driver_id is not null) execute function private.guard_ride_shuttle_driver_pairing();

-- ── Erasure (D7): a booking in flight while the account was erased left a confirmed seat
-- and an identified event. Every stage-6 writer of person-keyed rows that did not lock the
-- profile now takes it first (the order of the erasure: profile, then the rest) and sees
-- the erasure once it commits. The seat and contingency RPCs are replaced in place (206c2
-- pins the lock order inside the seat RPC); the two others are wrapped. The contingency
-- replay also reads only its own choice rows, since the outcome row of its leg command now
-- carries the same operation key (see C4.8 below).
create function private.ride_lock_live_profile() returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.profiles where id=auth.uid() and deleted_at is null for no key update;
 if not found then raise exception 'not_allowed'; end if;
end $$;
create or replace function public.ride_book_shuttle_seat(p_departure uuid,p_seats int,p_cents int,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('dispatch'); e private.ride_shuttle_events; d private.ride_shuttle_departures;
 l private.ride_shuttle_lines; v_input jsonb; v_seat uuid; v_result jsonb;
begin
 if p_departure is null or p_key is null or p_seats is null or p_cents is null or p_seats not between 1 and 4 or p_cents<0 then
   raise exception 'invalid_input'; end if;
 v_input:=jsonb_build_object('departure',p_departure,'seats',p_seats,'cents',p_cents);
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_key::text,0));
 perform private.ride_lock_live_profile();
 e:=private.ride_shuttle_replay(v_uid,p_key,'booked',v_input);
 if e.id is not null then return e.data->'result'; end if;
 perform private.ride_shuttle_lock_departures(p_departure);
 select * into d from private.ride_shuttle_departures where id=p_departure;
 select * into l from private.ride_shuttle_lines where id=d.line_id;
 perform private.require_ride_shuttle_sale(l,d);
 if p_cents<>l.seat_cents then raise exception 'requote_required'; end if;
 insert into private.ride_shuttle_seats(departure_id,passenger_id,operation_key,seats,seat_cents)
   values(d.id,v_uid,p_key,p_seats,l.seat_cents) returning id into v_seat;
 v_result:=jsonb_build_object('id',v_seat,'state','confirmed','departure_id',d.id,'departs_at',d.departs_at,'seats',p_seats,
   'seat_cents',l.seat_cents,'total_cents',p_seats*l.seat_cents,'charged_cents',0);
 perform private.ride_shuttle_event(p_key,'booked',d.id,v_seat,v_uid,'passenger',p_seats,l.seat_cents,jsonb_build_object('input',v_input,'result',v_result));
 return v_result;
end $$;
create or replace function public.ride_rebook_shuttle_seat(p_seat uuid,p_departure uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('dispatch'); e private.ride_shuttle_events; s private.ride_shuttle_seats;
 o private.ride_shuttle_departures; d private.ride_shuttle_departures; l private.ride_shuttle_lines; v_input jsonb; v_seat uuid; v_result jsonb;
begin
 if p_seat is null or p_departure is null or p_key is null then raise exception 'invalid_input'; end if;
 v_input:=jsonb_build_object('seat',p_seat,'departure',p_departure);
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_key::text,0));
 perform private.ride_lock_live_profile();
 e:=private.ride_shuttle_replay(v_uid,p_key,'rebooked_to',v_input);
 if e.id is not null then return e.data->'result'; end if;
 select m.* into s from private.ride_shuttle_seats m join private.ride_shuttle_departures x on x.id=m.departure_id
   join private.ride_shuttle_lines y on y.id=x.line_id where m.id=p_seat and m.passenger_id=v_uid and y.environment=private.ride_env();
 if not found then raise exception 'not_allowed'; end if;
 if s.departure_id=p_departure then raise exception 'invalid_input'; end if;
 perform private.ride_shuttle_lock_departures(s.departure_id,p_departure);
 select * into o from private.ride_shuttle_departures where id=s.departure_id;
 select * into d from private.ride_shuttle_departures where id=p_departure;
 select * into l from private.ride_shuttle_lines where id=o.line_id;
 select * into s from private.ride_shuttle_seats where id=p_seat for update;
 if d.id is null or d.line_id<>o.line_id or s.state not in ('confirmed','released')
    or (s.state='confirmed' and (o.state<>'open' or o.departs_at<=now()))
    or exists(select from private.ride_shuttle_seats n where n.replaces=s.id) then raise exception 'ride_seat_unavailable'; end if;
 perform private.require_ride_shuttle_sale(l,d);
 update private.ride_shuttle_seats set state='rebooked' where id=s.id;
 insert into private.ride_shuttle_seats(departure_id,passenger_id,operation_key,seats,seat_cents,replaces)
   values(d.id,v_uid,p_key,s.seats,s.seat_cents,s.id) returning id into v_seat;
 v_result:=jsonb_build_object('id',v_seat,'state','confirmed','replaces',s.id,'departure_id',d.id,'departs_at',d.departs_at,'seats',s.seats,
   'seat_cents',s.seat_cents,'total_cents',s.seats*s.seat_cents,'charged_cents',0);
 perform private.ride_shuttle_event(p_key,'rebooked_from',o.id,s.id,v_uid,'passenger',s.seats,s.seat_cents,
   jsonb_build_object('from_state',s.state,'to_departure',d.id,'to_seat',v_seat));
 perform private.ride_shuttle_event(p_key,'rebooked_to',d.id,v_seat,v_uid,'passenger',s.seats,s.seat_cents,jsonb_build_object('input',v_input,'result',v_result));
 return v_result;
end $$;
create or replace function public.ride_reserve_contingency(p_leg uuid,p_choice text,p_new_pickup timestamptz,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); l public.ride_legs; r public.rides; t private.ride_reserve_terms; e private.ride_reserve_events;
 v_issue text; v_result jsonb; v_data jsonb:='{}';
begin
 if not private.ride_active_user(v_uid) then raise exception 'not_allowed'; end if;
 if p_leg is null or p_key is null or p_choice is null or p_choice not in ('keep_searching','rebook','cancel')
   or (p_choice='rebook')<>(p_new_pickup is not null) then raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_key::text,0));
 perform private.ride_lock_live_profile();
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
 if not found then raise exception 'not_allowed'; end if;
 select * into strict r from public.rides where id=l.ride_id;
 if r.passenger_id<>v_uid then raise exception 'not_allowed'; end if;
 -- The stored answer of this choice: the outcome row of the leg command carries the same key.
 select * into e from private.ride_reserve_events where operation_key=p_key and action in ('keep_searching','rebook','cancel') order by id limit 1;
 if found then
   if e.actor_id is distinct from v_uid or e.leg_id<>p_leg or e.action<>p_choice or e.new_pickup is distinct from p_new_pickup then
     raise exception 'idempotency_conflict'; end if;
   return (e.data->'result')||jsonb_build_object('replayed',true);
 end if;
 if exists(select from private.ride_reserve_shifts where id=p_key) then raise exception 'idempotency_conflict'; end if;
 select * into t from private.ride_reserve_terms where leg_id=l.id for update;
 if not found or t.state<>'contingency' or l.status<>'requested' or l.driver_id is not null then raise exception 'invalid_ride_transition'; end if;
 if p_choice='keep_searching' then
   perform private.require_ride_feature('dispatch');
   update private.ride_dispatch_rounds set next_scan=now() where leg_id=l.id and status in ('waiting','offered');
   perform private.dispatch_ride_leg(l.id);
   v_result:=jsonb_build_object('state','contingency','choice',p_choice,'pickup_at',l.pickup_at);
 elsif p_choice='rebook' then
   perform private.require_ride_feature('dispatch');
   if p_new_pickup<=now() or p_new_pickup>now()+interval '30 days' or p_new_pickup=l.pickup_at then raise exception 'invalid_schedule'; end if;
   -- The new time needs a confirmation deadline still ahead and a policy that covers it.
   if p_new_pickup-make_interval(mins=>t.confirm_lead_minutes)<=now() or not exists(select from private.ride_reserve_policies p
        where p.environment=l.environment and p.area=t.area and p.enabled and p.valid_until>=p_new_pickup) then raise exception 'ride_reserve_window'; end if;
   v_issue:=private.ride_reserve_move_issue(l,p_new_pickup);
   if v_issue is not null then raise exception '%',v_issue; end if;
   insert into private.ride_reserve_shifts(id,leg_id,requested_by,reason,old_pickup,new_pickup,state,first_state,outcome,decided_at)
     values(p_key,l.id,v_uid,'contingency',l.pickup_at,p_new_pickup,'applied','applied','contingency_rebook',clock_timestamp());
   perform private.ride_reserve_move(l.id,p_new_pickup);
   update private.ride_reserve_terms set state='awaiting_driver',original_pickup=p_new_pickup,updated_at=now() where leg_id=l.id;
   v_result:=jsonb_build_object('state','awaiting_driver','choice',p_choice,'pickup_at',p_new_pickup);
 else
   perform public.ride_transition(p_leg,'cancelled',p_key);
   -- Unspent orders were closed by the stage-4 trigger; money already received is owed back through its refund flow.
   select jsonb_build_object('orders_cancelled',count(*) filter(where o.status='cancelled'),
     'refund_due_cents',coalesce(sum(o.received_cents-o.refunded_cents),0)) into v_data from private.ride_payment_orders o where o.leg_id=l.id;
   v_result:=jsonb_build_object('state','released','choice',p_choice,'pickup_at',l.pickup_at)||v_data;
 end if;
 perform private.ride_reserve_event(l.id,p_choice,v_uid,'passenger',p_key,l.pickup_at,p_new_pickup,v_data||jsonb_build_object('result',v_result));
 return v_result||jsonb_build_object('replayed',false);
end $$;
alter function public.ride_shift_reservation(uuid,timestamptz,text,uuid) rename to ride_shift_reservation_before_erasure_lock;
alter function public.ride_shift_reservation_before_erasure_lock(uuid,timestamptz,text,uuid) set schema private;
alter function public.ride_propose_extension(uuid,int,int,uuid) rename to ride_propose_extension_before_erasure_lock;
alter function public.ride_propose_extension_before_erasure_lock(uuid,int,int,uuid) set schema private;
create function public.ride_shift_reservation(p_leg uuid,p_new_pickup timestamptz,p_reason text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin perform private.ride_lock_live_profile(); return private.ride_shift_reservation_before_erasure_lock(p_leg,p_new_pickup,p_reason,p_key); end $$;
create function public.ride_propose_extension(p_leg uuid,p_minutes int,p_km int,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
begin perform private.ride_lock_live_profile(); return private.ride_propose_extension_before_erasure_lock(p_leg,p_minutes,p_km,p_key); end $$;

-- ── PAR-606 (hourly): the block tariff was only checked where the leg is born. Assignment,
-- start and any move of an hourly leg now need the quoted tariff, unchanged and valid
-- through the end of the leg; offers stop first. Cancelling and completing stay possible.
create function private.ride_block_tariff_holds(b private.ride_leg_blocks,p_until timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select b.kind<>'hourly' or exists(select from private.ride_block_tariffs t where t.id=b.tariff_id and t.valid_until>=p_until
   and (t.minutes,t.included_km,t.block_cents,t.extra_15min_cents,t.extra_km_cents)=(b.minutes,b.included_km,b.block_cents,b.extra_15min_cents,b.extra_km_cents))
$$;
create or replace function private.check_ride_block() returns trigger language plpgsql security definer set search_path='' as $$
declare e jsonb; b private.ride_leg_blocks; c private.ride_intercity_corridors; v_intercity boolean;
begin
 if tg_op='INSERT' then
   select x into e from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) x
     where q.id=coalesce(new.source_quote_id,(select r.quote_id from public.rides r where r.id=new.ride_id))
       and (x->>'seq')::int=coalesce(new.quote_seq,new.seq);
   if coalesce(e ? 'block',false) and not exists(select from private.ride_block_tariffs t where t.environment=new.environment and t.area=new.origin
        and t.code=e->>'block' and t.valid_until>=upper(new.slot) and t.minutes=new.duration_minutes
        and (t.minutes,t.included_km,t.block_cents,t.extra_15min_cents,t.extra_km_cents)
          =((e->>'block_minutes')::int,(e->>'included_km')::int,(e->>'block_cents')::int,(e->>'extra_15min_cents')::int,(e->>'extra_km_cents')::int))
     then raise exception 'requote_required'; end if;
   v_intercity:=coalesce((e->>'intercity')::boolean,false);
   if v_intercity or private.ride_corridor_registered(new.environment,new.origin,new.destination) then
     c:=private.ride_corridor(new.environment,new.origin,new.destination,upper(new.slot));
     if not v_intercity or c.origin is null then raise exception 'ride_corridor_unavailable'; end if;
     if (c.empty_return_cents,c.return_minutes) is distinct from ((e->>'empty_return_cents')::int,(e->>'return_minutes')::int) then
       raise exception 'requote_required'; end if;
   end if;
   return new;
 end if;
 select * into b from private.ride_leg_blocks where leg_id=new.id;
 if found and not private.ride_block_tariff_holds(b,upper(new.slot)) then raise exception 'ride_block_unavailable'; end if;
 if found and b.kind='intercity' then
   if (private.ride_corridor(new.environment,new.origin,new.destination,upper(new.slot))).origin is null then raise exception 'ride_corridor_unavailable'; end if;
 elsif ((new.driver_id is not null and new.driver_id is distinct from old.driver_id) or new.slot is distinct from old.slot
     or new.origin is distinct from old.origin or new.destination is distinct from old.destination)
   and private.ride_corridor_registered(new.environment,new.origin,new.destination) then raise exception 'ride_corridor_unavailable';
 end if;
 return new;
end $$;
create or replace function private.ride_block_issue(l public.ride_legs,p_driver uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare b private.ride_leg_blocks; v_plan tstzrange; v_busy tstzrange;
begin
 select * into b from private.ride_leg_blocks where leg_id=l.id;
 if not found then
   return case when private.ride_corridor_registered(l.environment,l.origin,l.destination) then 'ride_corridor_unavailable' end;
 end if;
 if not private.ride_block_tariff_holds(b,greatest(now(),upper(l.slot))) then return 'ride_block_unavailable'; end if;
 if b.kind='intercity' and (private.ride_corridor(l.environment,l.origin,l.destination,upper(l.slot))).origin is null then
   return 'ride_corridor_unavailable'; end if;
 if b.return_minutes>0 and p_driver is not null then
   select p.driver_slot into v_plan from private.ride_approach_plan(p_driver,l) p;
   if v_plan is null then return 'driver_unavailable'; end if;
   v_busy:=tstzrange(upper(v_plan),upper(v_plan)+make_interval(mins=>b.return_minutes),'[)');
   if exists(select from public.ride_legs o where o.driver_id=p_driver and o.id<>l.id and o.status in ('accepted','arriving','boarded','unknown')
        and coalesce(o.driver_slot,o.slot) && v_busy)
     or exists(select from public.bookings k where k.provider_id=p_driver and k.status in ('requested','accepted','paid','in_progress') and k.period && v_busy)
     or exists(select from public.shifts s where s.provider_id=p_driver and s.status in ('assigned','checked_in') and s.period && v_busy)
     or (l.environment='live' and not exists(select from private.ride_driver_shifts s where s.driver_id=p_driver and s.period @> (v_plan+v_busy)))
   then return 'driver_unavailable'; end if;
 end if;
 return null;
end $$;

-- ── PAR-604: why a leg cannot move to p_new at the same price. (a) An hourly block is not
-- priced by a demand rule: its fare never depends on the time of day, and its tariff must
-- hold through the new end. (b) Any other leg keeps its price only under the demand rule of
-- the agreed time: the rule frozen on its quote, or, for a leg repriced without rules (a
-- route amendment), the rule in force at its current pickup.
create or replace function private.ride_reserve_move_issue(l public.ride_legs,p_new timestamptz) returns text
language plpgsql stable security definer set search_path='' as $$
declare c public.ride_legs:=l; v_slot tstzrange; v_issue text; b private.ride_leg_blocks; v_agreed text;
begin
 if p_new is null or p_new<=now() or p_new>now()+interval '30 days' or p_new=l.pickup_at then return 'invalid_schedule'; end if;
 v_slot:=tstzrange(p_new,p_new+make_interval(mins=>l.duration_minutes),'[)');
 c.pickup_at:=p_new; c.slot:=v_slot; c.driver_id:=null; c.driver_slot:=null; c.status:='requested';
 if private.ride_terminal_closed_at(l.environment,l.origin,p_new) then return 'ride_reserve_window'; end if;
 select * into b from private.ride_leg_blocks where leg_id=l.id;
 if found and b.kind='hourly' then
   if not private.ride_block_tariff_holds(b,upper(v_slot)) then return 'ride_block_unavailable'; end if;
 else
   select q.price_rules->(coalesce(l.quote_seq,l.seq)::text)->>'id' into v_agreed from private.ride_quotes q
     where q.id=coalesce(l.source_quote_id,(select r.quote_id from public.rides r where r.id=l.ride_id));
   v_agreed:=coalesce(v_agreed,(select d.id::text from private.ride_demand_rates d where d.environment=l.environment and d.origin=l.origin
     and d.destination=l.destination and d.validity @> l.pickup_at));
   if v_agreed is distinct from (select d.id::text from private.ride_demand_rates d where d.environment=l.environment and d.origin=l.origin
       and d.destination=l.destination and d.validity @> p_new) then return 'requote_required'; end if;
 end if;
 if exists(select from private.ride_route_preferences f where f.route_id=l.route_case_id and not exists(
      select from private.ride_class_policies a where a.environment=l.environment and a.area=l.origin and a.code=f.class_code
        and least(a.valid_until,f.class_until)>=upper(v_slot))) then return 'requote_required'; end if;
 if exists(select from private.ride_financial_accounts where leg_id=l.id) then return 'invalid_ride_transition'; end if;
 if exists(select from public.ride_legs x where x.ride_id=l.ride_id and x.id<>l.id and x.status not in ('completed','cancelled')
      and ((x.seq>l.seq and lower(x.slot)<upper(v_slot)) or (x.seq<l.seq and upper(x.slot)>lower(v_slot)))) then return 'invalid_schedule'; end if;
 if private.ride_leg_mode_issue(c) is not null then return 'ride_modality_unavailable'; end if;
 if l.environment='live' then
   v_issue:=private.ride_eligibility_issue(c,upper(v_slot),null);
   if v_issue is not null then return v_issue; end if;
   if not exists(select from private.ride_commitments h join private.ride_coverage v on v.pilot=h.pilot
        join private.ride_staffed_channels staffed on staffed.id=v.id where h.leg_id=l.id and not staffed.frozen and staffed.hours @> v_slot)
     then return 'ride_support_unstaffed'; end if;
 end if;
 return null;
end $$;

-- ── PAR-604 (terminal): the amendment trigger applied the airport pickup rule to every
-- leg's drop-off. Only an airport reserve keeps a terminal: its frozen drop-off terminal
-- moves only to another terminal of the same airport with its own enabled, valid rule
-- (before boarding; a boarded passenger may leave the airport). A plain leg changes its
-- destination as in stages 1-5. A pickup terminal is not changed by an amendment: stage 1
-- keeps the origin until boarding, so that branch could never run and is gone; changing a
-- pickup terminal means a new reservation (documented limit, pinned by 206g).
create or replace function private.check_ride_terminal_change() returns trigger language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; c private.ride_route_cases; t private.ride_reserve_terms; v_until timestamptz; v_issue text;
begin
 select * into l from public.ride_legs where id=new.leg_id;
 select * into c from private.ride_route_cases where id=new.route_id;
 if l.id is null or c.id is null then return new; end if;
 v_until:=greatest(now(),new.pickup_at)+make_interval(mins=>new.remaining_minutes);
 if new.requested_pickup is not null and private.ride_terminal_closed_at(l.environment,c.origin_area,new.pickup_at) then
   raise exception 'ride_reserve_window'; end if;
 select * into t from private.ride_reserve_terms where leg_id=l.id;
 if t.terminal is not null and c.destination_area is distinct from l.destination and exists(select from private.ride_airport_rules r
      where r.environment=l.environment and r.pickup_area=l.destination and r.name=t.terminal) then
   v_issue:=private.ride_terminal_change_issue(l.environment,l.destination,c.destination_area,v_until,l.status='boarded');
 end if;
 if v_issue is not null then raise exception '%',v_issue; end if;
 return new;
end $$;

-- ── PAR-604 (notice): emit_ride_notice keeps one row per leg, person and event, so a
-- second missed deadline of the same reserve told nobody. Leaving the contingency re-arms it.
create function private.rearm_ride_reserve_notice() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from private.ride_passenger_notices where leg_id=new.leg_id and event='reserve_unconfirmed';
 return null;
end $$;
create trigger ride_reserve_notice_rearm after update of state on private.ride_reserve_terms for each row
 when(old.state='contingency' and new.state in ('awaiting_driver','confirmed')) execute function private.rearm_ride_reserve_notice();

-- ── PAR-604 (minute job): the contingency update repeated only the state, so a deadline
-- moved by a concurrent shift was overwritten from a stale snapshot. Terms are locked with
-- the leg and the deadline is repeated in the write; the event records the deadline read.
create or replace function private.ride_reservation_check() returns integer language plpgsql security definer set search_path='' as $$
declare x record; n int:=0; v_confirm timestamptz;
begin
 for x in select s.id,s.leg_id,s.driver_id from private.ride_reserve_shifts s where s.state='proposed' and s.expires_at<=now() order by s.expires_at limit 200 loop
   -- Same order as the driver's own answer: provider, driver, leg. A busy leg waits for the next minute.
   perform 1 from public.providers where id=x.driver_id for no key update;
   perform 1 from public.ride_drivers where id=x.driver_id for update;
   perform 1 from public.ride_legs where id=x.leg_id for update skip locked;
   continue when not found;
   -- One proposal that cannot be settled must not stop the minute job for every other leg.
   begin
     perform private.ride_reserve_settle(x.id,null,null);
     n:=n+1;
   exception when others then
     raise warning 'ride_reserve_settle % failed: %',x.id,sqlerrm;
   end;
 end loop;
 for x in select l as leg from private.ride_reserve_terms t join public.ride_legs l on l.id=t.leg_id
    where t.state='awaiting_driver' and t.confirm_by<=now() and l.status='requested' and l.driver_id is null
    order by t.confirm_by limit 300 for update of l,t skip locked loop
   update private.ride_reserve_terms set state='contingency',updated_at=now()
     where leg_id=(x.leg).id and state='awaiting_driver' and confirm_by<=now() returning confirm_by into v_confirm;
   continue when not found;
   perform private.ride_reserve_event((x.leg).id,'unconfirmed',null,'system',gen_random_uuid(),null,(x.leg).pickup_at,jsonb_build_object('confirm_by',v_confirm));
   perform private.emit_ride_notice(x.leg,'reserve_unconfirmed');
   n:=n+1;
 end loop;
 return n+private.ride_reservation_check_before_reserve();
end $$;

-- ── PAR-604 C4.8: the outcome rows written by the terms trigger (driver confirmed, driver
-- released, closed) carried a random key and the 'system' actor whoever acted. They now
-- carry the person and the operation key of the leg command (private.ride_events) that
-- caused them: read directly when the command wrote its event first (release paths), or
-- completed by the event insert of the same transaction (ride_command writes it after the
-- leg). A change with no command (the minute job, the operation's own SQL) stays 'system'.
alter table private.ride_reserve_events drop constraint ride_reserve_events_actor_role_check,
 add constraint ride_reserve_events_actor_role_check check(actor_role in ('passenger','payer','driver','operator','system'));
create function private.ride_reserve_actor_role(l public.ride_legs,p_driver uuid,p_actor uuid) returns text
language sql stable security definer set search_path='' as $$
 select case when p_actor is null then 'system' when p_actor is not distinct from p_driver or p_actor is not distinct from l.driver_id then 'driver'
   when p_actor=(select r.passenger_id from public.rides r where r.id=l.ride_id) then 'passenger' when p_actor=l.payer_id then 'payer' else 'operator' end
$$;
create or replace function private.sync_ride_reserve_terms() returns trigger language plpgsql security definer set search_path='' as $$
declare t private.ride_reserve_terms; a private.ride_airport_rules; s private.ride_reserve_shifts; v_state text; v_confirm timestamptz;
 v_action text; v_actor uuid; v_key uuid; v_id bigint; v_pending jsonb;
begin
 select * into t from private.ride_reserve_terms where leg_id=new.id for update;
 if not found then return null; end if;
 if new.driver_id is distinct from old.driver_id or new.status is distinct from old.status or new.pickup_at is distinct from old.pickup_at then
   for s in update private.ride_reserve_shifts set state='expired',outcome='leg_changed',decided_at=clock_timestamp()
      where leg_id=new.id and state='proposed' returning * loop
     perform private.ride_reserve_event(new.id,'shift_expired',null,'system',s.id,s.old_pickup,s.new_pickup,jsonb_build_object('outcome','leg_changed'));
   end loop;
 end if;
 v_confirm:=new.pickup_at-make_interval(mins=>t.confirm_lead_minutes);
 v_state:=case when t.state='released' or new.status in ('completed','cancelled') then 'released'
   when new.status in ('accepted','arriving','boarded') and new.driver_id is not null then 'confirmed'
   when new.status='requested' and (old.driver_id is not null or t.state='confirmed' or (t.state='contingency' and v_confirm>now())) then 'awaiting_driver'
   else t.state end;
 if t.airport is not null and (new.origin is distinct from old.origin or new.destination is distinct from old.destination) then
   a:=private.ride_reserve_terminal(new.environment,new.origin,new.destination,upper(new.slot));
   t.airport:=a.airport; t.terminal:=a.name;
 end if;
 update private.ride_reserve_terms set state=v_state,confirm_by=v_confirm,airport=t.airport,terminal=t.terminal,
   flight_ref=case when t.airport is not null then flight_ref end,updated_at=now(),
   closed_at=case when v_state='released' then coalesce(closed_at,now()) end where leg_id=new.id;
 if v_state<>t.state then
   v_action:=case when v_state='confirmed' then 'driver_confirmed' when v_state='released' then 'closed'
     when old.driver_id is not null then 'driver_released' end;
 end if;
 if v_action is not null then
   -- The command that already wrote its event for this transition, in this transaction.
   select e.actor_id,e.operation_key into v_actor,v_key from private.ride_events e
     where e.leg_id=new.id and e.at=now() and e.from_status=old.status and e.to_status=new.status
       and not exists(select from private.ride_reserve_events x where x.operation_key=e.operation_key and x.action=v_action) limit 1;
   insert into private.ride_reserve_events(leg_id,action,actor_id,actor_role,operation_key,old_pickup,new_pickup,data)
     values(new.id,v_action,v_actor,private.ride_reserve_actor_role(new,old.driver_id,v_actor),coalesce(v_key,gen_random_uuid()),
       case when v_action='driver_released' then old.pickup_at end,new.pickup_at,
       case when v_action='closed' then jsonb_build_object('status',new.status) else '{}'::jsonb end)
     returning id into v_id;
   if v_key is null then
     v_pending:=coalesce(nullif(current_setting('workeasy.ride_reserve_pending',true),'')::jsonb,'{}'::jsonb);
     perform set_config('workeasy.ride_reserve_pending',(v_pending||jsonb_build_object(new.id::text,jsonb_build_object('id',v_id,'driver',old.driver_id)))::text,true);
   end if;
 end if;
 return null;
end $$;
create function private.complete_ride_reserve_actor() returns trigger language plpgsql security definer set search_path='' as $$
declare v_pending jsonb:=nullif(current_setting('workeasy.ride_reserve_pending',true),'')::jsonb; l public.ride_legs; v_id bigint;
begin
 if v_pending is null or not v_pending ? new.leg_id::text then return null; end if;
 v_id:=(v_pending#>>array[new.leg_id::text,'id'])::bigint;
 perform set_config('workeasy.ride_reserve_pending',(v_pending-new.leg_id::text)::text,true);
 select * into l from public.ride_legs where id=new.leg_id;
 update private.ride_reserve_events x set actor_id=new.actor_id,operation_key=new.operation_key,
   actor_role=private.ride_reserve_actor_role(l,(v_pending#>>array[new.leg_id::text,'driver'])::uuid,new.actor_id)
 where x.id=v_id and x.leg_id=new.leg_id and x.actor_role='system'
   and not exists(select from private.ride_reserve_events y where y.operation_key=new.operation_key and y.action=x.action);
 return null;
end $$;
create trigger ride_reserve_event_actor after insert on private.ride_events for each row execute function private.complete_ride_reserve_actor();

-- ── Assistance data (retention and access): the requirement stayed with the quote
-- (ride_access_quotes, and the 'assist'/'wav' quote modes) with no deadline, and was
-- missing from the export once the leg preference was purged. It now leaves 24 h after
-- the quote is settled (no open leg, and its legs closed or the quote expired more than
-- 24 h ago), and the export lists the person's quote-level choices until then.
create function private.ride_quote_settled(p_quote uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_quotes q where q.id=p_quote
   and not exists(select from public.ride_legs l join public.rides r on r.id=l.ride_id
     where (l.source_quote_id=q.id or r.quote_id=q.id) and l.status not in ('completed','cancelled'))
   and coalesce((select max(l.updated_at) from public.ride_legs l join public.rides r on r.id=l.ride_id where l.source_quote_id=q.id or r.quote_id=q.id),
     q.expires_at)<=now()-interval '24 hours')
$$;
alter function private.purge_ride_safety() rename to purge_ride_safety_before_access_quotes;
create function private.purge_ride_safety() returns void language sql security definer set search_path='' as $$
 select private.purge_ride_safety_before_access_quotes();
 delete from private.ride_access_quotes a where private.ride_quote_settled(a.quote_id);
 delete from private.ride_quote_modes m where m.modality in ('assist','wav') and private.ride_quote_settled(m.quote_id);
$$;
alter function public.ride_export_my_data() rename to ride_export_before_access_quotes;
alter function public.ride_export_before_access_quotes() set schema private;
create function public.ride_export_my_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb:=private.ride_export_before_access_quotes(); me uuid:=auth.uid();
begin
 return data||jsonb_build_object('access_quotes',coalesce((select jsonb_agg(jsonb_build_object('quote',a.quote_id,'assistance',a.assistance,
     'companion',a.companion,'boarding_minutes',a.boarding,'quoted_at',q.created_at) order by q.created_at,a.quote_id)
   from private.ride_access_quotes a join private.ride_quotes q on q.id=a.quote_id where a.owner_id=me),'[]'));
end $$;
-- PostgreSQL views bind by function OID: rebind the account export to the new top.
create or replace view public.my_ride_data_export with(security_invoker=true) as
 select auth.uid() as id,public.ride_export_my_data() as mobility where auth.uid() is not null;

-- Grants: private helpers and trigger functions for nobody; the public names as before.
revoke all on function private.ride_person_restricted(uuid,text),private.ride_pair_allowed(uuid,uuid,text),
 private.ride_access_supply(private.ride_route_cases,timestamptz,text,boolean,int),
 private.ride_quote_access_door_before_wait(uuid,uuid,timestamptz,jsonb,text,boolean),private.ride_quote_access_door(uuid,uuid,timestamptz,jsonb,text,boolean),
 private.ride_plain_label(text),private.ride_names_animal(text),private.ride_names_assistance(text),
 private.ride_modality_issue_before_corridor(text,text,text,text,timestamptz,timestamptz),private.ride_modality_issue(text,text,text,text,timestamptz,timestamptz),
 private.guard_ride_shuttle_seat_pairing(),private.guard_ride_shuttle_driver_pairing(),private.ride_lock_live_profile(),
 private.ride_shift_reservation_before_erasure_lock(uuid,timestamptz,text,uuid),private.ride_propose_extension_before_erasure_lock(uuid,int,int,uuid),
 private.ride_block_tariff_holds(private.ride_leg_blocks,timestamptz),private.check_ride_block(),private.ride_block_issue(public.ride_legs,uuid),
 private.ride_reserve_move_issue(public.ride_legs,timestamptz),private.check_ride_terminal_change(),private.rearm_ride_reserve_notice(),
 private.ride_reservation_check(),private.ride_reserve_actor_role(public.ride_legs,uuid,uuid),private.sync_ride_reserve_terms(),
 private.complete_ride_reserve_actor(),private.ride_quote_settled(uuid),private.purge_ride_safety_before_access_quotes(),private.purge_ride_safety(),
 private.ride_export_before_access_quotes() from public,anon,authenticated,service_role;
revoke all on function public.ride_book_shuttle_seat(uuid,int,int,uuid),public.ride_rebook_shuttle_seat(uuid,uuid,uuid),
 public.ride_shift_reservation(uuid,timestamptz,text,uuid),public.ride_reserve_contingency(uuid,text,timestamptz,uuid),
 public.ride_propose_extension(uuid,int,int,uuid),public.ride_export_my_data() from public,anon,authenticated,service_role;
grant execute on function public.ride_book_shuttle_seat(uuid,int,int,uuid),public.ride_rebook_shuttle_seat(uuid,uuid,uuid),
 public.ride_shift_reservation(uuid,timestamptz,text,uuid),public.ride_reserve_contingency(uuid,text,timestamptz,uuid),
 public.ride_propose_extension(uuid,int,int,uuid),public.ride_export_my_data() to authenticated;
