-- O17 stage 6 · PAR-604 (seat in a line van). A standalone seat ledger: a line, its dated
-- departures, the seats each passenger holds and one audit row per outcome. A driver cannot
-- hold concurrent legs, so a seat is not a leg and NOTHING is charged for it in this stage:
-- refund_due_cents is recorded and is always 0. Only simulation gets a fictitious line.
create table private.ride_shuttle_lines(
 id uuid primary key default gen_random_uuid(),environment text not null references private.ride_network(environment),
 origin_area text not null check(length(trim(origin_area)) between 1 and 120),
 destination_area text not null check(length(trim(destination_area)) between 1 and 120),
 operator_ref text not null check(length(trim(operator_ref)) between 1 and 160),
 seat_cents int not null check(seat_cents between 1 and 1000000),minutes int not null check(minutes between 1 and 720),
 evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160),valid_until timestamptz not null,
 enabled boolean not null default false,check(origin_area<>destination_area),
 unique(environment,origin_area,destination_area,operator_ref)
);
create table private.ride_shuttle_departures(
 id uuid primary key default gen_random_uuid(),line_id uuid not null references private.ride_shuttle_lines(id),
 departs_at timestamptz not null,seats_total smallint not null check(seats_total between 1 and 20),
 driver_id uuid references public.ride_drivers(id) on delete set null,
 state text not null default 'open' check(state in ('open','departed','cancelled')),
 created_at timestamptz not null default now(),closed_at timestamptz,
 unique(line_id,departs_at),check((state='open')=(closed_at is null))
);
create index ride_shuttle_departures_driver on private.ride_shuttle_departures(driver_id,departs_at) where state='open';
-- operation_key is the passenger's idempotency key of the booking or rebooking that created the row.
create table private.ride_shuttle_seats(
 id uuid primary key default gen_random_uuid(),departure_id uuid not null references private.ride_shuttle_departures(id),
 passenger_id uuid not null references private.ride_subjects(id),operation_key uuid not null,
 seats smallint not null check(seats between 1 and 4),seat_cents int not null check(seat_cents between 1 and 1000000),
 state text not null default 'confirmed' check(state in ('confirmed','cancelled','rebooked','released')),
 replaces uuid unique references private.ride_shuttle_seats(id) on delete set null,
 created_at timestamptz not null default now(),closed_at timestamptz,
 unique(passenger_id,operation_key),check((state='confirmed')=(closed_at is null)),check(replaces is distinct from id)
);
create index ride_shuttle_seats_taken on private.ride_shuttle_seats(departure_id) where state='confirmed';
create index ride_shuttle_seats_passenger on private.ride_shuttle_seats(passenger_id,created_at desc);
-- One row per outcome: who, when, under which operation key. The row that answers the
-- caller keeps the input and the answer, so a replay returns exactly what was stored.
-- Nothing is collected for a seat, so nothing can be due: a charging stage replaces the check.
create table private.ride_shuttle_events(
 id bigint generated always as identity primary key,operation_key uuid not null,
 action text not null check(action in ('booked','cancelled','rebooked_from','rebooked_to','released','departure_cancelled')),
 departure_id uuid not null references private.ride_shuttle_departures(id),
 seat_id uuid references private.ride_shuttle_seats(id) on delete set null,
 actor_id uuid,actor_role text not null check(actor_role in ('passenger','admin','system')),at timestamptz not null default clock_timestamp(),
 seats smallint not null check(seats between 0 and 20),seat_cents int check(seat_cents is null or seat_cents between 1 and 1000000),
 refund_due_cents int not null default 0 check(refund_due_cents=0),
 data jsonb not null default '{}' check(jsonb_typeof(data)='object' and pg_column_size(data)<=2048),
 unique(operation_key,action,seat_id)
);
create unique index ride_shuttle_one_cancellation on private.ride_shuttle_events(departure_id) where action='departure_cancelled';
create index ride_shuttle_events_actor on private.ride_shuttle_events(actor_id,operation_key);
create index ride_shuttle_events_seat on private.ride_shuttle_events(seat_id,id);
do $$ declare t text; begin
 foreach t in array array['ride_shuttle_lines','ride_shuttle_departures','ride_shuttle_seats','ride_shuttle_events'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

-- The ledger rules hold for any writer, not only for the RPCs below. A departure keeps its
-- line; with seats sold it keeps its time, cannot shrink below them and cannot be cancelled
-- before they are released. A designated driver needs a valid registration and a vehicle
-- whose inspected capacity covers every seat.
create function private.guard_ride_shuttle_departure() returns trigger language plpgsql security definer set search_path='' as $$
declare v_taken int;
begin
 if tg_op='UPDATE' then
   if new.line_id<>old.line_id or (old.state<>'open' and new.state<>old.state) then raise exception 'ride_seat_frozen'; end if;
   select coalesce(sum(s.seats),0) into v_taken from private.ride_shuttle_seats s where s.departure_id=new.id and s.state='confirmed';
   if v_taken>0 and (new.departs_at<>old.departs_at or new.state='cancelled' or new.seats_total<v_taken) then raise exception 'ride_seat_frozen'; end if;
 end if;
 if new.driver_id is not null and new.state='open' and (tg_op='INSERT' or new.driver_id is distinct from old.driver_id
    or new.seats_total<>old.seats_total or new.departs_at<>old.departs_at)
    and not (private.ride_driver_valid(new.driver_id,private.sp_date(new.departs_at))
      and exists(select from private.ride_shuttle_lines l join public.ride_drivers d on d.environment=l.environment
        join private.ride_vehicle_capacity c on c.driver_id=d.id and c.vehicle=d.vehicle
        where l.id=new.line_id and d.id=new.driver_id and c.seats>=new.seats_total
          and c.valid_until>=new.departs_at+make_interval(mins=>l.minutes))) then raise exception 'driver_ineligible'; end if;
 new.closed_at:=case when new.state='open' then null else coalesce(new.closed_at,now()) end;
 return new;
end $$;
create trigger ride_shuttle_departure_guard before insert or update on private.ride_shuttle_departures
 for each row execute function private.guard_ride_shuttle_departure();
-- A seat is born confirmed, under the lock of its departure: the confirmed seats never exceed
-- the total, and one passenger never holds more than 4 seats of a departure. Afterwards only
-- its state moves, and never back to confirmed.
create function private.guard_ride_shuttle_seat() returns trigger language plpgsql security definer set search_path='' as $$
declare d private.ride_shuttle_departures; v_taken int; v_own int;
begin
 if tg_op='UPDATE' then
   if (new.id,new.departure_id,new.passenger_id,new.operation_key,new.seats,new.seat_cents,new.created_at)
        is distinct from (old.id,old.departure_id,old.passenger_id,old.operation_key,old.seats,old.seat_cents,old.created_at)
      or (new.replaces is distinct from old.replaces and new.replaces is not null)
      or not (new.state=old.state or (old.state='confirmed' and new.state in ('cancelled','rebooked','released'))
        or (old.state='released' and new.state='rebooked')) then raise exception 'ride_seat_frozen'; end if;
   new.closed_at:=case when new.state<>'confirmed' then coalesce(old.closed_at,now()) end;
   return new;
 end if;
 if new.state<>'confirmed' then raise exception 'ride_seat_frozen'; end if;
 select * into d from private.ride_shuttle_departures where id=new.departure_id for update;
 if not found or d.state<>'open' then raise exception 'ride_seat_unavailable'; end if;
 select coalesce(sum(s.seats),0),coalesce(sum(s.seats) filter(where s.passenger_id=new.passenger_id),0) into v_taken,v_own
   from private.ride_shuttle_seats s where s.departure_id=d.id and s.state='confirmed';
 if v_taken+new.seats>d.seats_total or v_own+new.seats>4 then raise exception 'ride_seat_unavailable'; end if;
 new.closed_at:=null;
 return new;
end $$;
create trigger ride_shuttle_seat_guard before insert or update on private.ride_shuttle_seats
 for each row execute function private.guard_ride_shuttle_seat();

-- Fictitious rehearsal line between two synthetic areas, with two departures a day for two
-- weeks and no driver designated. Live gets no line.
insert into private.ride_shuttle_lines(environment,origin_area,destination_area,operator_ref,seat_cents,minutes,evidence_ref,valid_until,enabled)
 select 'simulation',o.area,t.area,'operador-ficticio-o17-e6',1800,45,'ficticio-o17-e6','infinity',true
 from private.ride_market_areas o join private.ride_market_areas t on t.environment=o.environment and t.market=o.market
 where o.environment='simulation' and (o.area,t.area) in (('Saúde','Terminal de ensaio'),('Terminal de ensaio','Saúde'));
insert into private.ride_shuttle_departures(line_id,departs_at,seats_total)
 select l.id,(private.sp_date(now())+n+h.at) at time zone 'America/Sao_Paulo',12
 from private.ride_shuttle_lines l cross join generate_series(1,14) n cross join (values(time '07:00'),(time '18:00')) h(at)
 where l.environment='simulation';

-- Why a departure cannot be sold now; null when it can. The modality gate is asked through
-- the planned arrival, with the opening hours read at the departure.
create function private.ride_shuttle_issue(p_env text,l private.ride_shuttle_lines,d private.ride_shuttle_departures) returns text
language sql stable security definer set search_path='' as $$
 select case
   when l.id is null or d.id is null or d.line_id<>l.id or l.environment is distinct from p_env then 'unknown'
   when d.state<>'open' or d.departs_at<=now() then 'closed'
   when not l.enabled or l.valid_until<d.departs_at+make_interval(mins=>l.minutes) then 'line_disabled'
   when not private.ride_area_allowed(p_env,l.origin_area,'dispatch') or not private.ride_area_allowed(p_env,l.destination_area,'dispatch') then 'area_not_authorized'
   else private.ride_modality_issue(p_env,'shuttle_seat',l.origin_area,l.destination_area,d.departs_at+make_interval(mins=>l.minutes),d.departs_at) end
$$;
create function private.require_ride_shuttle_sale(l private.ride_shuttle_lines,d private.ride_shuttle_departures) returns void
language plpgsql stable security definer set search_path='' as $$
declare v_issue text:=private.ride_shuttle_issue(private.ride_env(),l,d);
begin
 if v_issue in ('unknown','closed','line_disabled') then raise exception 'ride_seat_unavailable';
 elsif v_issue is not null then raise exception 'ride_modality_unavailable'; end if;
end $$;
-- Row locks on departures are always taken one by one in id order; the answer is that order.
create function private.ride_shuttle_lock_departures(variadic p_ids uuid[]) returns uuid[]
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_locked uuid[]:='{}';
begin
 for v_id in select distinct x from unnest(p_ids) x where x is not null order by x loop
   perform 1 from private.ride_shuttle_departures where id=v_id for update;
   if found then v_locked:=v_locked||v_id; end if;
 end loop;
 return v_locked;
end $$;
-- The stored outcome of an operation key of this actor, or an empty row when the key is new.
-- A key that already served another kind of operation is a conflict.
create function private.ride_shuttle_replay(p_actor uuid,p_key uuid,p_action text,p_input jsonb) returns private.ride_shuttle_events
language plpgsql stable security definer set search_path='' as $$
declare e private.ride_shuttle_events;
begin
 select * into e from private.ride_shuttle_events where actor_id=p_actor and operation_key=p_key order by (action=p_action) desc,id limit 1;
 if found and (e.action<>p_action or e.data->'input' is distinct from p_input) then raise exception 'idempotency_conflict'; end if;
 return e;
end $$;
create function private.ride_shuttle_event(p_key uuid,p_action text,p_departure uuid,p_seat uuid,p_actor uuid,p_role text,p_seats int,p_cents int,
 p_data jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into private.ride_shuttle_events(operation_key,action,departure_id,seat_id,actor_id,actor_role,seats,seat_cents,data)
 values(p_key,p_action,p_departure,p_seat,p_actor,p_role,p_seats,p_cents,coalesce(p_data,'{}'))
$$;
-- The in-app notice of a released seat is its event row, shown on the passenger's board. It is
-- forwarded outside under the rules of every ride notice: the person's choice and a released channel.
create function private.emit_shuttle_notice(p_env text,p_user uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if private.ride_active_user(p_user) and exists(select from private.ride_notice_preferences where owner_id=p_user and forward_updates)
    and exists(select from private.ride_passenger_contact where environment=p_env and external_enabled) then
   perform private.notify(p_user,'atualizacao_corrida','{}');
   return true;
 end if;
 return false;
end $$;
create function private.ride_shuttle_taken(p_departure uuid) returns int language sql stable security definer set search_path='' as $$
 select coalesce(sum(s.seats),0)::int from private.ride_shuttle_seats s where s.departure_id=p_departure and s.state='confirmed'
$$;

-- Lines with a departure that can be sold now, and the caller's own seats. Area labels only.
create function public.ride_shuttle_board(p_origin text,p_destination text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('module'); v_env text:=private.ride_env();
begin
 if length(p_origin)>120 or length(p_destination)>120 then raise exception 'invalid_input'; end if;
 return jsonb_build_object('simulation',v_env='simulation','charged',false,
  'lines',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'origin_area',l.origin_area,'destination_area',l.destination_area,
       'seat_cents',l.seat_cents,'minutes',l.minutes,'departures',x.departures) order by l.origin_area,l.destination_area,l.id)
     from private.ride_shuttle_lines l cross join lateral (
       select jsonb_agg(jsonb_build_object('id',o.id,'departs_at',o.departs_at,'seats_total',o.seats_total,
         'seats_left',o.seats_total-private.ride_shuttle_taken(o.id),'state',o.state) order by o.departs_at,o.id) as departures
       from (select d.* from private.ride_shuttle_departures d where d.line_id=l.id and d.state='open' and d.departs_at>now()
          and private.ride_shuttle_issue(v_env,l,d) is null order by d.departs_at,d.id limit 20) o) x
     where l.environment=v_env and l.enabled and (p_origin is null or l.origin_area=p_origin)
       and (p_destination is null or l.destination_area=p_destination) and x.departures is not null),'[]'),
  'my_seats',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'line_id',l.id,'departure_id',d.id,'origin_area',l.origin_area,
       'destination_area',l.destination_area,'departs_at',d.departs_at,'seats',s.seats,'seat_cents',s.seat_cents,'state',s.state,
       'replaces',s.replaces,'booked_at',s.created_at,'closed_at',s.closed_at,
       'refund_due_cents',coalesce((select sum(e.refund_due_cents) from private.ride_shuttle_events e where e.seat_id=s.id),0),
       'notice',(select 'shuttle_departure_cancelled' from private.ride_shuttle_events e where e.seat_id=s.id and e.action='released' limit 1))
       order by d.departs_at desc,s.created_at desc,s.id)
     from (select m.* from private.ride_shuttle_seats m where m.passenger_id=v_uid order by m.created_at desc,m.id limit 40) s
     join private.ride_shuttle_departures d on d.id=s.departure_id
     join private.ride_shuttle_lines l on l.id=d.line_id and l.environment=v_env),'[]'));
end $$;

-- p_cents is the price of ONE seat as shown to the passenger. Nothing is charged.
create function public.ride_book_shuttle_seat(p_departure uuid,p_seats int,p_cents int,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('dispatch'); e private.ride_shuttle_events; d private.ride_shuttle_departures;
 l private.ride_shuttle_lines; v_input jsonb; v_seat uuid; v_result jsonb;
begin
 if p_departure is null or p_key is null or p_seats is null or p_cents is null or p_seats not between 1 and 4 or p_cents<0 then
   raise exception 'invalid_input'; end if;
 v_input:=jsonb_build_object('departure',p_departure,'seats',p_seats,'cents',p_cents);
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_key::text,0));
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
-- Giving a seat back stays possible whatever the gates say, until the departure.
create function public.ride_cancel_shuttle_seat(p_seat uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); e private.ride_shuttle_events; s private.ride_shuttle_seats; d private.ride_shuttle_departures;
 v_input jsonb; v_result jsonb;
begin
 if not private.ride_active_user(v_uid) then raise exception 'not_allowed'; end if;
 if p_seat is null or p_key is null then raise exception 'invalid_input'; end if;
 v_input:=jsonb_build_object('seat',p_seat);
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_key::text,0));
 e:=private.ride_shuttle_replay(v_uid,p_key,'cancelled',v_input);
 if e.id is not null then return e.data->'result'; end if;
 select m.* into s from private.ride_shuttle_seats m join private.ride_shuttle_departures x on x.id=m.departure_id
   join private.ride_shuttle_lines l on l.id=x.line_id where m.id=p_seat and m.passenger_id=v_uid and l.environment=private.ride_env();
 if not found then raise exception 'not_allowed'; end if;
 perform private.ride_shuttle_lock_departures(s.departure_id);
 select * into d from private.ride_shuttle_departures where id=s.departure_id;
 select * into s from private.ride_shuttle_seats where id=p_seat for update;
 if s.state<>'confirmed' or d.state<>'open' or d.departs_at<=now() then raise exception 'ride_seat_unavailable'; end if;
 update private.ride_shuttle_seats set state='cancelled' where id=s.id;
 v_result:=jsonb_build_object('id',s.id,'state','cancelled','seats',s.seats,'refund_due_cents',0);
 perform private.ride_shuttle_event(p_key,'cancelled',d.id,s.id,v_uid,'passenger',s.seats,s.seat_cents,jsonb_build_object('input',v_input,'result',v_result));
 return v_result;
end $$;
-- Moves a confirmed seat, or a seat the operation released, to another departure of the same
-- line. Both departures are locked in id order and the price of the seat does not change.
create function public.ride_rebook_shuttle_seat(p_seat uuid,p_departure uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('dispatch'); e private.ride_shuttle_events; s private.ride_shuttle_seats;
 o private.ride_shuttle_departures; d private.ride_shuttle_departures; l private.ride_shuttle_lines; v_input jsonb; v_seat uuid; v_result jsonb;
begin
 if p_seat is null or p_departure is null or p_key is null then raise exception 'invalid_input'; end if;
 v_input:=jsonb_build_object('seat',p_seat,'departure',p_departure);
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_key::text,0));
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

-- The operation cancels a departure (an absent driver, for example): every confirmed seat is
-- released and its passenger is told. A released seat may be rebooked at the price it was sold.
create function public.admin_cancel_shuttle_departure(p_departure uuid,p_reason text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_env text:=private.ride_env(); e private.ride_shuttle_events; d private.ride_shuttle_departures;
 l private.ride_shuttle_lines; s private.ride_shuttle_seats; v_reason text:=trim(p_reason); v_input jsonb; v_result jsonb;
 v_seats int:=0; v_bookings int:=0; v_forwarded int:=0; v_sent boolean;
begin
 perform private.require_admin();
 if not private.ride_active_user(v_uid) then raise exception 'not_allowed'; end if;
 if p_departure is null or p_key is null or v_reason is null or length(v_reason) not between 4 and 200 then raise exception 'invalid_input'; end if;
 v_input:=jsonb_build_object('departure',p_departure,'reason',v_reason);
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_key::text,0));
 e:=private.ride_shuttle_replay(v_uid,p_key,'departure_cancelled',v_input);
 if e.id is not null then return e.data->'result'; end if;
 perform private.ride_shuttle_lock_departures(p_departure);
 select * into d from private.ride_shuttle_departures where id=p_departure;
 select * into l from private.ride_shuttle_lines where id=d.line_id;
 if d.id is null or l.environment<>v_env then raise exception 'not_allowed'; end if;
 if d.state<>'open' then raise exception 'ride_seat_unavailable'; end if;
 for s in select * from private.ride_shuttle_seats where departure_id=d.id and state='confirmed' order by id for update loop
   update private.ride_shuttle_seats set state='released' where id=s.id;
   v_sent:=private.emit_shuttle_notice(v_env,s.passenger_id);
   perform private.ride_shuttle_event(p_key,'released',d.id,s.id,v_uid,'admin',s.seats,s.seat_cents,
     jsonb_build_object('notice','shuttle_departure_cancelled','forwarded',v_sent,'rebook_cents',s.seat_cents));
   v_seats:=v_seats+s.seats; v_bookings:=v_bookings+1; v_forwarded:=v_forwarded+v_sent::int;
 end loop;
 update private.ride_shuttle_departures set state='cancelled' where id=d.id;
 v_result:=jsonb_build_object('departure_id',d.id,'state','cancelled','released_seats',v_seats,'bookings',v_bookings,'refund_due_cents',0);
 perform private.ride_shuttle_event(p_key,'departure_cancelled',d.id,null,v_uid,'admin',v_seats,null,
   jsonb_build_object('input',v_input,'result',v_result,'driver_assigned',d.driver_id is not null,'forwarded',v_forwarded));
 perform private.audit('ride.shuttle_departure_cancelled','ride_shuttle_departures',d.id::text,
   jsonb_build_object('reason',v_reason,'released_seats',v_seats,'bookings',v_bookings,'operation',p_key));
 return v_result;
end $$;
-- driver_assigned is false when nobody is designated or the designated registration no longer holds.
create function public.admin_shuttle_departures() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_env text:=private.ride_env();
begin
 perform private.require_admin();
 if not private.ride_active_user(auth.uid()) then raise exception 'not_allowed'; end if;
 return jsonb_build_object('simulation',v_env='simulation','departures',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,
     'origin_area',x.origin_area,'destination_area',x.destination_area,'departs_at',x.departs_at,'seats_total',x.seats_total,
     'seats_confirmed',private.ride_shuttle_taken(x.id),'state',x.state,
     'driver_assigned',x.driver_id is not null and private.ride_driver_valid(x.driver_id,private.sp_date(x.departs_at))) order by x.departs_at,x.id)
   from (select d.*,l.origin_area,l.destination_area from private.ride_shuttle_departures d join private.ride_shuttle_lines l on l.id=d.line_id
     where l.environment=v_env and d.departs_at>now()-interval '2 days' order by d.departs_at,d.id limit 200) x),'[]'));
end $$;

-- The designated driver sees how many seats to expect. Counts only: no passenger, no booking id.
create function public.driver_shuttle_manifest(p_departure uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_result jsonb;
begin
 if not private.ride_active_user(v_uid) or p_departure is null then raise exception 'not_allowed'; end if;
 select jsonb_build_object('departure_id',d.id,'origin_area',l.origin_area,'destination_area',l.destination_area,'departs_at',d.departs_at,
   'state',d.state,'seats_total',d.seats_total,'seats_confirmed',private.ride_shuttle_taken(d.id),
   'bookings',(select count(*) from private.ride_shuttle_seats s where s.departure_id=d.id and s.state='confirmed')) into v_result
 from private.ride_shuttle_departures d join private.ride_shuttle_lines l on l.id=d.line_id
   join public.ride_drivers r on r.id=d.driver_id and r.environment=l.environment and r.status='approved'
 where d.id=p_departure and d.driver_id=v_uid and l.environment=private.ride_env();
 if v_result is null then raise exception 'not_allowed'; end if;
 return v_result;
end $$;
-- Read by public.driver_mode_tasks (reserve package) when present: the driver's coming departures.
create function private.ride_driver_departure_tasks(p_driver uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'origin_area',x.origin_area,'destination_area',x.destination_area,
   'departs_at',x.departs_at) order by x.departs_at,x.id),'[]'::jsonb)
 from (select d.id,d.departs_at,l.origin_area,l.destination_area from private.ride_shuttle_departures d
   join private.ride_shuttle_lines l on l.id=d.line_id
   join public.ride_drivers r on r.id=d.driver_id and r.environment=l.environment and r.status='approved'
   where d.driver_id=p_driver and d.state='open' and l.environment=private.ride_env() and d.departs_at>now()-interval '2 hours'
   order by d.departs_at,d.id limit 20) x
$$;

revoke all on function private.guard_ride_shuttle_departure(),private.guard_ride_shuttle_seat(),
 private.ride_shuttle_issue(text,private.ride_shuttle_lines,private.ride_shuttle_departures),
 private.require_ride_shuttle_sale(private.ride_shuttle_lines,private.ride_shuttle_departures),
 private.ride_shuttle_lock_departures(uuid[]),private.ride_shuttle_replay(uuid,uuid,text,jsonb),
 private.ride_shuttle_event(uuid,text,uuid,uuid,uuid,text,int,int,jsonb),private.emit_shuttle_notice(text,uuid),
 private.ride_shuttle_taken(uuid),private.ride_driver_departure_tasks(uuid) from public,anon,authenticated,service_role;
revoke all on function public.ride_shuttle_board(text,text),public.ride_book_shuttle_seat(uuid,int,int,uuid),
 public.ride_cancel_shuttle_seat(uuid,uuid),public.ride_rebook_shuttle_seat(uuid,uuid,uuid),
 public.admin_cancel_shuttle_departure(uuid,text,uuid),public.admin_shuttle_departures(),public.driver_shuttle_manifest(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.ride_shuttle_board(text,text),public.ride_book_shuttle_seat(uuid,int,int,uuid),
 public.ride_cancel_shuttle_seat(uuid,uuid),public.ride_rebook_shuttle_seat(uuid,uuid,uuid),
 public.admin_cancel_shuttle_departure(uuid,text,uuid),public.admin_shuttle_departures(),public.driver_shuttle_manifest(uuid) to authenticated;
