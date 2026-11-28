-- O17 stage 6 · PAR-604 (reserve and airport). Over the scheduled ride of O16: an early
-- confirmation deadline with a contingency the passenger decides, a new pickup time after a
-- flight delay at the same price and payer, and a terminal change only to a terminal with its
-- own rule. Only simulation gets policies; a leg without terms stays the plain O16 ride.
create table private.ride_reserve_policies(
 environment text not null references private.ride_network(environment),area text not null check(length(trim(area)) between 1 and 120),
 min_lead_minutes int not null check(min_lead_minutes between 0 and 43200),
 confirm_lead_minutes int not null check(confirm_lead_minutes between 1 and 1440),
 max_shift_minutes int not null check(max_shift_minutes between 0 and 1440),
 evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160),
 valid_until timestamptz not null,enabled boolean not null default false,
 primary key(environment,area),check(confirm_lead_minutes<=min_lead_minutes)
);
-- Frozen at leg insert. original_pickup is the time last agreed in full (booking, rebook or amendment).
create table private.ride_reserve_terms(
 leg_id uuid primary key references public.ride_legs(id) on delete cascade,environment text not null,area text not null,
 policy_ref text not null,confirm_lead_minutes int not null check(confirm_lead_minutes between 1 and 1440),
 max_shift_minutes int not null check(max_shift_minutes between 0 and 1440),
 original_pickup timestamptz not null,confirm_by timestamptz not null,airport text,terminal text,
 flight_ref text check(flight_ref is null or flight_ref ~ '^[A-Z0-9]{2}[A-Z]?[0-9]{1,4}[A-Z]?$'),
 state text not null default 'awaiting_driver' check(state in ('awaiting_driver','confirmed','contingency','released')),
 frozen_at timestamptz not null default now(),updated_at timestamptz not null default now(),closed_at timestamptz,
 check((airport is null)=(terminal is null)),check(flight_ref is null or airport is not null)
);
create index ride_reserve_terms_due on private.ride_reserve_terms(confirm_by) where state='awaiting_driver';
-- The id is the passenger's operation key. first_state is the answer given to the passenger.
create table private.ride_reserve_shifts(
 id uuid primary key,leg_id uuid not null references public.ride_legs(id),requested_by uuid not null,
 reason text not null check(reason in ('flight_delay','passenger','contingency')),
 old_pickup timestamptz not null,new_pickup timestamptz not null,check(new_pickup<>old_pickup),
 state text not null check(state in ('proposed','applied','declined','expired')),
 first_state text not null check(first_state in ('proposed','applied')),
 outcome text check(outcome in ('no_driver','contingency_rebook','driver_accepted','driver_declined','driver_conflict','driver_timeout',
   'superseded','leg_changed','unavailable')),
 driver_id uuid,accepted boolean,expires_at timestamptz,created_at timestamptz not null default clock_timestamp(),decided_at timestamptz,
 check((state='proposed')=(outcome is null)),check(state<>'proposed' or (driver_id is not null and expires_at is not null))
);
create unique index ride_one_open_reserve_shift on private.ride_reserve_shifts(leg_id) where state='proposed';
create index ride_reserve_shifts_due on private.ride_reserve_shifts(expires_at) where state='proposed';
create index ride_reserve_shifts_driver on private.ride_reserve_shifts(driver_id) where state='proposed';
create index ride_reserve_shifts_leg on private.ride_reserve_shifts(leg_id,created_at);
-- Audit of every outcome: who, when and under which operation key. No address, no flight number.
create table private.ride_reserve_events(
 id bigint generated always as identity primary key,leg_id uuid not null references public.ride_legs(id),
 action text not null check(action in ('terms_frozen','driver_confirmed','driver_released','unconfirmed','keep_searching','rebook','cancel',
   'shift_applied','shift_proposed','shift_accepted','shift_declined','shift_conflict','shift_expired','shift_superseded','shift_unavailable',
   'flight_updated','closed')),
 actor_id uuid,actor_role text not null check(actor_role in ('passenger','driver','system')),
 operation_key uuid not null,at timestamptz not null default clock_timestamp(),old_pickup timestamptz,new_pickup timestamptz,
 data jsonb not null default '{}' check(jsonb_typeof(data)='object' and pg_column_size(data)<=2048),
 unique(operation_key,action),check((actor_role='system')=(actor_id is null))
);
create index ride_reserve_events_leg on private.ride_reserve_events(leg_id,id);
do $$ declare t text; begin
 foreach t in array array['ride_reserve_policies','ride_reserve_terms','ride_reserve_shifts','ride_reserve_events'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
alter table private.ride_reservation_releases drop constraint ride_reservation_releases_reason_check,
 add constraint ride_reservation_releases_reason_check check(reason in ('driver_unavailable','no_show','schedule_change'));
-- A terminal belongs to one airport and may publish pickup hours (local time of the market).
alter table private.ride_airport_rules add column airport text check(airport is null or length(trim(airport)) between 2 and 80),
 add column open_from time,add column open_until time,
 add constraint ride_airport_rules_hours check((open_from is null and open_until is null)
   or (open_from is not null and open_until is not null and open_from<>open_until));
update private.ride_airport_rules set airport='Aeroporto de ensaio' where environment='simulation' and pickup_area='Terminal de ensaio';
-- Fictitious rehearsal policy for the synthetic areas. Live gets none.
insert into private.ride_reserve_policies(environment,area,min_lead_minutes,confirm_lead_minutes,max_shift_minutes,evidence_ref,valid_until,enabled)
 select 'simulation',a.area,60,30,180,'ficticio-o17-e6','infinity',true from private.ride_market_areas a where a.environment='simulation';

create function private.ride_reserve_event(p_leg uuid,p_action text,p_actor uuid,p_role text,p_key uuid,p_old timestamptz,p_new timestamptz,
 p_data jsonb default '{}') returns void language sql security definer set search_path='' as $$
 insert into private.ride_reserve_events(leg_id,action,actor_id,actor_role,operation_key,old_pickup,new_pickup,data)
 values(p_leg,p_action,p_actor,p_role,p_key,p_old,p_new,coalesce(p_data,'{}'))
$$;
-- True when the area is a terminal with published hours and the pickup falls outside them.
create function private.ride_terminal_closed_at(p_env text,p_area text,p_at timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_airport_rules t
   cross join lateral(select (p_at at time zone coalesce((private.ride_market_for(p_env,p_area,p_area)).timezone,'America/Sao_Paulo'))::time as at) x
   where t.environment=p_env and t.pickup_area=p_area and t.open_from is not null and not (
     case when t.open_from<t.open_until then x.at>=t.open_from and x.at<t.open_until else x.at>=t.open_from or x.at<t.open_until end))
$$;
-- The enabled terminal of a leg: its pickup area first, else its drop-off area.
create function private.ride_reserve_terminal(p_env text,p_origin text,p_destination text,p_until timestamptz) returns private.ride_airport_rules
language sql stable security definer set search_path='' as $$
 select t from private.ride_airport_rules t where t.environment=p_env and t.pickup_area in (p_origin,p_destination)
   and t.airport is not null and t.enabled and t.valid_until>=p_until order by (t.pickup_area=p_origin) desc limit 1
$$;
-- An endpoint that is or becomes a terminal needs its own enabled rule through the trip, of the
-- same airport when it replaces a terminal. Only a boarded passenger may leave the airport as destination.
create function private.ride_terminal_change_issue(p_env text,p_old text,p_new text,p_until timestamptz,p_may_leave boolean) returns text
language sql stable security definer set search_path='' as $$
 select case when p_old=p_new then null
   when n.id is null then case when o.id is null or p_may_leave then null else 'ride_terminal_unavailable' end
   when not n.enabled or n.valid_until<p_until or (o.id is not null and (n.airport is null or o.airport is distinct from n.airport))
     then 'ride_terminal_unavailable' end
 from (select 1) one
 left join private.ride_airport_rules o on o.environment=p_env and o.pickup_area=p_old
 left join private.ride_airport_rules n on n.environment=p_env and n.pickup_area=p_new
$$;
-- Any quote, whatever its wrapper: a pickup at a terminal outside its hours is not sold.
create function private.check_ride_reserve_window() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select from jsonb_array_elements(new.legs) l
    where private.ride_terminal_closed_at(new.environment,l->>'origin',(l->>'pickup_at')::timestamptz)) then raise exception 'ride_reserve_window'; end if;
 return new;
end $$;
create trigger ride_05_reserve_window before insert on private.ride_quotes for each row when(new.status='awaiting_consent')
 execute function private.check_ride_reserve_window();
create function private.check_ride_terminal_change() returns trigger language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; c private.ride_route_cases; v_until timestamptz; v_issue text;
begin
 select * into l from public.ride_legs where id=new.leg_id;
 select * into c from private.ride_route_cases where id=new.route_id;
 if l.id is null or c.id is null then return new; end if;
 v_until:=greatest(now(),new.pickup_at)+make_interval(mins=>new.remaining_minutes);
 if new.requested_pickup is not null and private.ride_terminal_closed_at(l.environment,c.origin_area,new.pickup_at) then
   raise exception 'ride_reserve_window'; end if;
 if l.status<>'boarded' then v_issue:=private.ride_terminal_change_issue(l.environment,l.origin,c.origin_area,v_until,false); end if;
 v_issue:=coalesce(v_issue,private.ride_terminal_change_issue(l.environment,l.destination,c.destination_area,v_until,l.status='boarded'));
 if v_issue is not null then raise exception '%',v_issue; end if;
 return new;
end $$;
create trigger ride_terminal_change before insert on private.ride_amendments for each row execute function private.check_ride_terminal_change();
-- A route change with a new time was agreed by everyone: it becomes the reference of later shifts.
create function private.reagree_ride_reserve() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.ride_reserve_terms t set original_pickup=l.pickup_at,updated_at=now() from public.ride_legs l where l.id=new.leg_id and t.leg_id=l.id;
 return null;
end $$;
create trigger ride_reserve_reagreed after update of status on private.ride_amendments for each row
 when(new.status='applied' and old.status<>'applied' and new.requested_pickup is not null) execute function private.reagree_ride_reserve();

-- Terms exist only for a scheduled direct ride booked with the policy lead while the reserve
-- authorization covers the whole leg. Named to run after a_ride_freeze_mode.
create function private.freeze_ride_reserve_terms() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.rides; p private.ride_reserve_policies; a private.ride_airport_rules; k private.ride_markets; v_scheduled boolean;
begin
 if new.status<>'requested' or new.next_booking_id is not null then return null; end if;
 select * into strict r from public.rides where id=new.ride_id;
 select case when q.id is not null then q.scheduled_at is not null else r.scheduled_at is not null end into v_scheduled
   from (select 1) one left join private.ride_quotes q on q.id=new.source_quote_id;
 if not v_scheduled or r.booking_id is not null then return null; end if;
 select * into p from private.ride_reserve_policies where environment=new.environment and area=new.origin and enabled and valid_until>=new.pickup_at;
 if not found or new.pickup_at<now()+make_interval(mins=>p.min_lead_minutes)
   or private.ride_modality_issue(new.environment,'reserve',new.origin,new.destination,upper(new.slot),new.pickup_at) is not null then return null; end if;
 k:=private.ride_market_for(new.environment,new.origin,new.destination);
 if private.ride_modality_issue(new.environment,'airport',new.origin,new.destination,upper(new.slot),new.pickup_at) is null then
   a:=private.ride_reserve_terminal(new.environment,new.origin,new.destination,upper(new.slot));
 end if;
 insert into private.ride_reserve_terms(leg_id,environment,area,policy_ref,confirm_lead_minutes,max_shift_minutes,original_pickup,confirm_by,airport,terminal)
   values(new.id,new.environment,new.origin,p.evidence_ref,p.confirm_lead_minutes,p.max_shift_minutes,new.pickup_at,
     new.pickup_at-make_interval(mins=>p.confirm_lead_minutes),a.airport,a.name);
 insert into private.ride_leg_modes(leg_id,modality,environment,market,authorization_ref,quote_id)
   select new.id,m.modality,m.environment,m.market,m.authorization_ref,coalesce(new.source_quote_id,r.quote_id) from private.ride_market_modalities m
   where m.environment=new.environment and m.market=k.code and (m.modality='reserve' or (m.modality='airport' and a.id is not null))
   on conflict(leg_id,modality) do nothing;
 perform private.ride_reserve_event(new.id,'terms_frozen',r.passenger_id,'passenger',md5('reserve-terms:'||new.id::text)::uuid,null,new.pickup_at,
   jsonb_build_object('policy',p.evidence_ref,'confirm_lead_minutes',p.confirm_lead_minutes,'max_shift_minutes',p.max_shift_minutes,'airport',a.id is not null));
 return null;
end $$;
create trigger ride_reserve_freeze after insert on public.ride_legs for each row execute function private.freeze_ride_reserve_terms();
-- The terms follow the leg whoever changes it: assignment, release, closure, new time or new terminal.
-- An open proposal was made for one driver, one status and one pickup time.
create function private.sync_ride_reserve_terms() returns trigger language plpgsql security definer set search_path='' as $$
declare t private.ride_reserve_terms; a private.ride_airport_rules; s private.ride_reserve_shifts; v_state text; v_confirm timestamptz;
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
   if v_state='confirmed' then
     perform private.ride_reserve_event(new.id,'driver_confirmed',new.driver_id,'driver',gen_random_uuid(),null,new.pickup_at);
   elsif v_state='released' then
     perform private.ride_reserve_event(new.id,'closed',null,'system',gen_random_uuid(),null,new.pickup_at,jsonb_build_object('status',new.status));
   elsif old.driver_id is not null then
     perform private.ride_reserve_event(new.id,'driver_released',null,'system',gen_random_uuid(),old.pickup_at,new.pickup_at);
   end if;
 end if;
 return null;
end $$;
create trigger ride_reserve_sync after update of status,driver_id,pickup_at,origin,destination on public.ride_legs for each row
 when(old.status is distinct from new.status or old.driver_id is distinct from new.driver_id or old.pickup_at is distinct from new.pickup_at
   or old.origin is distinct from new.origin or old.destination is distinct from new.destination)
 execute function private.sync_ride_reserve_terms();

-- Why the leg cannot move to p_new at the same price, whoever drives it. Null when it can.
create function private.ride_reserve_move_issue(l public.ride_legs,p_new timestamptz) returns text
language plpgsql stable security definer set search_path='' as $$
declare c public.ride_legs:=l; v_slot tstzrange; v_issue text;
begin
 if p_new is null or p_new<=now() or p_new>now()+interval '30 days' or p_new=l.pickup_at then return 'invalid_schedule'; end if;
 v_slot:=tstzrange(p_new,p_new+make_interval(mins=>l.duration_minutes),'[)');
 c.pickup_at:=p_new; c.slot:=v_slot; c.driver_id:=null; c.driver_slot:=null; c.status:='requested';
 if private.ride_terminal_closed_at(l.environment,l.origin,p_new) then return 'ride_reserve_window'; end if;
 -- The fare was multiplied by the demand rule of the agreed time; another rule is another price.
 if (select q.price_rules->(coalesce(l.quote_seq,l.seq)::text)->>'id' from private.ride_quotes q
      where q.id=coalesce(l.source_quote_id,(select r.quote_id from public.rides r where r.id=l.ride_id)))
    is distinct from (select d.id::text from private.ride_demand_rates d where d.environment=l.environment and d.origin=l.origin
      and d.destination=l.destination and d.validity @> p_new) then return 'requote_required'; end if;
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
-- Moves an unassigned leg and restarts its dispatch. The caller holds the leg lock and has checked the move.
create function private.ride_reserve_move(p_leg uuid,p_new timestamptz) returns void language plpgsql security definer set search_path='' as $$
declare l public.ride_legs;
begin
 update private.ride_amendments set status='superseded' where leg_id=p_leg and status='pending';
 update private.ride_driver_offers set state='withdrawn' where leg_id=p_leg and state='offered';
 update private.ride_dispatch_rounds set generation=generation+1,status='waiting',next_scan=now() where leg_id=p_leg;
 update public.ride_legs set pickup_at=p_new,slot=tstzrange(p_new,p_new+make_interval(mins=>duration_minutes),'[)'),updated_at=now()
   where id=p_leg and status='requested' and driver_id is null returning * into strict l;
 update private.ride_route_points set delete_by=upper(l.slot)+interval '24 hours' where route_id=l.route_case_id;
 perform private.dispatch_ride_leg(p_leg);
end $$;
-- The driver leaves the reservation and it returns to dispatch at the new time (as release_driver_reservation does).
create function private.ride_reserve_release(s private.ride_reserve_shifts,l public.ride_legs,p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_slot tstzrange:=tstzrange(s.new_pickup,s.new_pickup+make_interval(mins=>l.duration_minutes),'[)');
begin
 insert into private.ride_reservation_releases(leg_id,driver_id,released_by,operation_id,reason) values(l.id,l.driver_id,p_actor,s.id,'schedule_change');
 insert into private.ride_events(actor_id,operation_key,leg_id,action,from_status,to_status)
   values(coalesce(p_actor,s.requested_by),md5('reserve-release:'||s.id::text)::uuid,l.id,'reservation_schedule_change',l.status,'requested');
 insert into private.ride_declines values(l.id,l.driver_id) on conflict do nothing;
 update private.ride_amendments set status='superseded' where leg_id=l.id and status='pending';
 update private.ride_dispatch_rounds set generation=generation+1,status='waiting',next_scan=now() where leg_id=l.id;
 update public.ride_legs set driver_id=null,driver_slot=null,status='requested',pickup_at=s.new_pickup,slot=v_slot,updated_at=now() where id=l.id;
 delete from private.ride_arrival_estimates where leg_id=l.id;
 update private.ride_route_points set delete_by=upper(v_slot)+interval '24 hours' where route_id=l.route_case_id;
end $$;
-- Settles an open proposal: true keeps the driver when the calendar allows, false or null (no
-- answer in time) returns the leg to dispatch at the new time. A new time that can no longer be
-- sold changes nothing. The caller holds provider and driver; here the leg, then the shift.
create function private.ride_reserve_settle(p_shift uuid,p_accept boolean,p_actor uuid) returns text
language plpgsql security definer set search_path='' as $$
declare s private.ride_reserve_shifts; l public.ride_legs; c public.ride_legs; v_slot tstzrange; v_plan tstzrange;
 v_outcome text; v_keep boolean; v_error text;
begin
 select * into l from public.ride_legs where id=(select leg_id from private.ride_reserve_shifts where id=p_shift) for update;
 select * into s from private.ride_reserve_shifts where id=p_shift for update;
 if not found then raise exception 'not_allowed'; end if;
 if s.state<>'proposed' then return s.state; end if;
 if l.status<>'accepted' or l.driver_id is distinct from s.driver_id or l.pickup_at<>s.old_pickup
   or not exists(select from private.ride_reserve_terms where leg_id=l.id) then
   update private.ride_reserve_shifts set state='expired',outcome='leg_changed',decided_at=clock_timestamp() where id=s.id;
   perform private.ride_reserve_event(l.id,'shift_expired',null,'system',s.id,s.old_pickup,s.new_pickup,jsonb_build_object('outcome','leg_changed'));
   return 'expired';
 end if;
 v_slot:=tstzrange(s.new_pickup,s.new_pickup+make_interval(mins=>l.duration_minutes),'[)');
 v_keep:=coalesce(p_accept,false) and s.expires_at>now();
 if v_keep then
   begin
     c:=l; c.pickup_at:=s.new_pickup; c.slot:=v_slot;
     select p.driver_slot into v_plan from private.ride_approach_plan(l.driver_id,c) p;
     if v_plan is null or upper(v_plan)>upper(v_slot) then raise exception 'driver_unavailable'; end if;
     update private.ride_reserve_shifts set state='applied',outcome='driver_accepted',accepted=true,decided_at=clock_timestamp() where id=s.id;
     update private.ride_amendments set status='superseded' where leg_id=l.id and status='pending';
     update public.ride_legs set pickup_at=s.new_pickup,slot=v_slot,driver_slot=v_plan,updated_at=now() where id=l.id;
     delete from private.ride_arrival_estimates where leg_id=l.id;
     update private.ride_route_points set delete_by=upper(v_slot)+interval '24 hours' where route_id=l.route_case_id;
     v_outcome:='driver_accepted';
   exception when exclusion_violation or raise_exception then
     get stacked diagnostics v_error=message_text; v_outcome:=null;
   end;
 end if;
 if v_outcome is null then
   v_outcome:=case when p_accept is null or (p_accept and not v_keep) then 'driver_timeout' when p_accept then 'driver_conflict' else 'driver_declined' end;
   begin
     update private.ride_reserve_shifts set state=case when v_outcome='driver_timeout' then 'expired' else 'declined' end,outcome=v_outcome,
       accepted=p_accept,decided_at=clock_timestamp() where id=s.id;
     perform private.ride_reserve_release(s,l,case when p_accept is not null then p_actor end);
   exception when exclusion_violation or raise_exception then
     get stacked diagnostics v_error=message_text; v_outcome:='unavailable';
   end;
 end if;
 if v_outcome='unavailable' then
   update private.ride_reserve_shifts set state='expired',outcome='unavailable',accepted=p_accept,decided_at=clock_timestamp() where id=s.id;
 end if;
 perform private.ride_reserve_event(l.id,case v_outcome when 'driver_accepted' then 'shift_accepted' when 'driver_declined' then 'shift_declined'
     when 'driver_conflict' then 'shift_conflict' when 'driver_timeout' then 'shift_expired' else 'shift_unavailable' end,
   case when p_accept is not null then p_actor end,case when p_accept is not null and p_actor is not null then 'driver' else 'system' end,
   s.id,s.old_pickup,s.new_pickup,jsonb_strip_nulls(jsonb_build_object('reason',s.reason,'outcome',v_outcome,'detail',left(v_error,120))));
 return (select state from private.ride_reserve_shifts where id=s.id);
end $$;

-- Passenger: a new pickup time at the same price and payer. Without a driver it applies at
-- once; with a driver it becomes a proposal the driver answers before it expires.
create function public.ride_shift_reservation(p_leg uuid,p_new_pickup timestamptz,p_reason text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('dispatch'); l public.ride_legs; r public.rides; t private.ride_reserve_terms;
 s private.ride_reserve_shifts; v_issue text; v_expires timestamptz;
begin
 if p_leg is null or p_key is null or p_new_pickup is null or p_reason is null or p_reason not in ('flight_delay','passenger') then
   raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_key::text,0));
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
 if not found then raise exception 'not_allowed'; end if;
 select * into strict r from public.rides where id=l.ride_id;
 if r.passenger_id<>v_uid then raise exception 'not_allowed'; end if;
 select * into s from private.ride_reserve_shifts where id=p_key;
 if found then
   if s.requested_by<>v_uid or s.leg_id<>p_leg or s.new_pickup<>p_new_pickup or s.reason<>p_reason then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('id',s.id,'state',s.first_state,'current',s.state,'new_pickup',s.new_pickup,'expires_at',s.expires_at,'replayed',true);
 end if;
 if exists(select from private.ride_reserve_events where operation_key=p_key) then raise exception 'idempotency_conflict'; end if;
 select * into t from private.ride_reserve_terms where leg_id=l.id for update;
 if not found or t.state not in ('awaiting_driver','confirmed') or l.status not in ('requested','accepted')
   or (l.status='accepted')<>(l.driver_id is not null) then raise exception 'invalid_ride_transition'; end if;
 if p_reason='flight_delay' and t.airport is null then raise exception 'invalid_input'; end if;
 if p_new_pickup<=now() or p_new_pickup>now()+interval '30 days' or p_new_pickup=l.pickup_at then raise exception 'invalid_schedule'; end if;
 if (p_reason='flight_delay' and p_new_pickup<l.pickup_at)
   or abs(extract(epoch from p_new_pickup-t.original_pickup))>t.max_shift_minutes*60 then raise exception 'ride_reserve_window'; end if;
 v_issue:=private.ride_reserve_move_issue(l,p_new_pickup);
 if v_issue is not null then raise exception '%',v_issue; end if;
 -- A newer request replaces the one still waiting for the driver.
 for s in update private.ride_reserve_shifts set state='expired',outcome='superseded',decided_at=clock_timestamp()
    where leg_id=l.id and state='proposed' returning * loop
   perform private.ride_reserve_event(l.id,'shift_superseded',v_uid,'passenger',s.id,s.old_pickup,s.new_pickup,jsonb_build_object('by',p_key));
 end loop;
 if l.status='requested' then
   insert into private.ride_reserve_shifts(id,leg_id,requested_by,reason,old_pickup,new_pickup,state,first_state,outcome,decided_at)
     values(p_key,l.id,v_uid,p_reason,l.pickup_at,p_new_pickup,'applied','applied','no_driver',clock_timestamp());
   perform private.ride_reserve_move(l.id,p_new_pickup);
   perform private.ride_reserve_event(l.id,'shift_applied',v_uid,'passenger',p_key,l.pickup_at,p_new_pickup,jsonb_build_object('reason',p_reason));
   return jsonb_build_object('id',p_key,'state','applied','current','applied','new_pickup',p_new_pickup,'expires_at',null,'replayed',false);
 end if;
 v_expires:=least(now()+interval '10 minutes',p_new_pickup);
 insert into private.ride_reserve_shifts(id,leg_id,requested_by,reason,old_pickup,new_pickup,state,first_state,driver_id,expires_at)
   values(p_key,l.id,v_uid,p_reason,l.pickup_at,p_new_pickup,'proposed','proposed',l.driver_id,v_expires);
 insert into public.ride_driver_inbox as b(driver_id) values(l.driver_id) on conflict(driver_id) do update set revision=b.revision+1;
 perform private.ride_reserve_event(l.id,'shift_proposed',v_uid,'passenger',p_key,l.pickup_at,p_new_pickup,jsonb_build_object('reason',p_reason));
 return jsonb_build_object('id',p_key,'state','proposed','current','proposed','new_pickup',p_new_pickup,'expires_at',v_expires,'replayed',false);
end $$;
-- Driver: answers the proposal. Returns the state of the shift: applied keeps the driver on the leg.
create function public.driver_decide_shift(p_shift uuid,p_accept boolean) returns text
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('module'); s private.ride_reserve_shifts;
begin
 if p_shift is null or p_accept is null then raise exception 'invalid_input'; end if;
 select x.* into s from private.ride_reserve_shifts x join public.ride_legs l on l.id=x.leg_id
   where x.id=p_shift and x.driver_id=v_uid and l.environment=private.ride_env();
 if not found then raise exception 'not_allowed'; end if;
 -- Provider, driver and leg in the order of the assignment command, then the proposal.
 perform 1 from public.providers where id=v_uid for no key update;
 perform 1 from public.ride_drivers where id=v_uid for update;
 perform 1 from public.ride_legs where id=s.leg_id for update;
 select * into strict s from private.ride_reserve_shifts where id=p_shift for update;
 if s.state<>'proposed' then
   if s.accepted is not distinct from p_accept then return s.state; end if;
   raise exception 'offer_unavailable';
 end if;
 return private.ride_reserve_settle(p_shift,p_accept,v_uid);
end $$;
-- Passenger: after the confirmation deadline passed without a driver. Rebooking keeps price and
-- payer; cancelling goes through ride_transition, whose stage-4 trigger closes unspent orders.
create function public.ride_reserve_contingency(p_leg uuid,p_choice text,p_new_pickup timestamptz,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); l public.ride_legs; r public.rides; t private.ride_reserve_terms; e private.ride_reserve_events;
 v_issue text; v_result jsonb; v_data jsonb:='{}';
begin
 if not private.ride_active_user(v_uid) then raise exception 'not_allowed'; end if;
 if p_leg is null or p_key is null or p_choice is null or p_choice not in ('keep_searching','rebook','cancel')
   or (p_choice='rebook')<>(p_new_pickup is not null) then raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_key::text,0));
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
 if not found then raise exception 'not_allowed'; end if;
 select * into strict r from public.rides where id=l.ride_id;
 if r.passenger_id<>v_uid then raise exception 'not_allowed'; end if;
 select * into e from private.ride_reserve_events where operation_key=p_key order by id limit 1;
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
-- Passenger: the flight of an airport reservation, kept only to explain a delay. Null clears it.
create function public.ride_reserve_flight(p_leg uuid,p_flight_ref text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('module'); l public.ride_legs; t private.ride_reserve_terms;
 v_ref text:=nullif(upper(regexp_replace(coalesce(p_flight_ref,''),'[[:space:]-]','','g')),'');
begin
 if p_leg is null or length(p_flight_ref)>16 or (v_ref is not null and v_ref!~'^[A-Z0-9]{2}[A-Z]?[0-9]{1,4}[A-Z]?$') then raise exception 'invalid_input'; end if;
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
 if not found or not exists(select from public.rides r where r.id=l.ride_id and r.passenger_id=v_uid) then raise exception 'not_allowed'; end if;
 select * into t from private.ride_reserve_terms where leg_id=l.id for update;
 if not found or t.state='released' or t.airport is null then raise exception 'invalid_ride_transition'; end if;
 if t.flight_ref is distinct from v_ref then
   update private.ride_reserve_terms set flight_ref=v_ref,updated_at=now() where leg_id=l.id;
   perform private.ride_reserve_event(l.id,'flight_updated',v_uid,'passenger',gen_random_uuid(),null,l.pickup_at,jsonb_build_object('set',v_ref is not null));
 end if;
 return jsonb_build_object('flight_ref',v_ref,'terminal',t.terminal);
end $$;
-- Passenger, payer or assigned driver. Null for a leg without reserve terms.
create function public.ride_reserve_state(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); l public.ride_legs; r public.rides; t private.ride_reserve_terms; v_passenger boolean;
begin
 if not private.ride_active_user(v_uid) then raise exception 'not_allowed'; end if;
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env();
 if not found then raise exception 'not_allowed'; end if;
 select * into strict r from public.rides where id=l.ride_id;
 v_passenger:=v_uid=r.passenger_id;
 if not (v_passenger or v_uid=l.payer_id or l.driver_id is not distinct from v_uid) then raise exception 'not_allowed'; end if;
 select * into t from private.ride_reserve_terms where leg_id=l.id;
 if not found then return null; end if;
 return jsonb_build_object('state',t.state,'confirm_by',t.confirm_by,'pickup_at',l.pickup_at,'original_pickup',t.original_pickup,
   'airport',t.airport,'terminal',t.terminal,'flight_ref',case when v_passenger then t.flight_ref end,
   'max_shift_minutes',t.max_shift_minutes,
   'can_shift',v_passenger and t.state in ('awaiting_driver','confirmed') and l.status in ('requested','accepted'),
   'can_decide',v_passenger and t.state='contingency' and l.status='requested',
   'shift',(select jsonb_build_object('id',s.id,'reason',s.reason,'old_pickup',s.old_pickup,'new_pickup',s.new_pickup,'state',s.state,
       'expires_at',s.expires_at) from private.ride_reserve_shifts s where s.leg_id=l.id order by s.created_at desc,s.id limit 1));
end $$;
-- The driver's open proposals. Later packages add their own lists through the two optional helpers.
create function private.ride_driver_shift_tasks(p_driver uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'leg_id',s.leg_id,'origin',l.origin,'destination',l.destination,'reason',s.reason,
   'old_pickup',s.old_pickup,'new_pickup',s.new_pickup,'expires_at',s.expires_at) order by s.expires_at,s.id),'[]'::jsonb)
 from private.ride_reserve_shifts s join public.ride_legs l on l.id=s.leg_id
 where s.driver_id=p_driver and s.state='proposed' and s.expires_at>now() and l.driver_id=p_driver and l.status='accepted'
   and l.environment=private.ride_env()
$$;
create function public.driver_mode_tasks() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_extensions jsonb; v_departures jsonb;
begin
 if not private.ride_active_user(v_uid) or not exists(select from public.ride_drivers d where d.id=v_uid and d.environment=private.ride_env()) then
   raise exception 'not_allowed'; end if;
 if to_regprocedure('private.ride_driver_extension_tasks(uuid)') is not null then
   execute 'select private.ride_driver_extension_tasks($1)' into v_extensions using v_uid; end if;
 if to_regprocedure('private.ride_driver_departure_tasks(uuid)') is not null then
   execute 'select private.ride_driver_departure_tasks($1)' into v_departures using v_uid; end if;
 return jsonb_build_object('shifts',private.ride_driver_shift_tasks(v_uid),'extensions',coalesce(v_extensions,'[]'::jsonb),
   'departures',coalesce(v_departures,'[]'::jsonb));
end $$;

-- The existing minute job (no new cron): unanswered proposals return to dispatch, a reserve past
-- its confirmation deadline without a driver becomes a contingency the passenger decides, and
-- then the O16 check runs unchanged.
alter function private.ride_reservation_check() rename to ride_reservation_check_before_reserve;
create function private.ride_reservation_check() returns integer language plpgsql security definer set search_path='' as $$
declare x record; n int:=0;
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
 for x in select l as leg,t.confirm_by from private.ride_reserve_terms t join public.ride_legs l on l.id=t.leg_id
    where t.state='awaiting_driver' and t.confirm_by<=now() and l.status='requested' and l.driver_id is null
    order by t.confirm_by limit 300 for update of l skip locked loop
   update private.ride_reserve_terms set state='contingency',updated_at=now() where leg_id=(x.leg).id and state='awaiting_driver';
   continue when not found;
   perform private.ride_reserve_event((x.leg).id,'unconfirmed',null,'system',gen_random_uuid(),null,(x.leg).pickup_at,jsonb_build_object('confirm_by',x.confirm_by));
   perform private.emit_ride_notice(x.leg,'reserve_unconfirmed');
   n:=n+1;
 end loop;
 return n+private.ride_reservation_check_before_reserve();
end $$;

revoke all on function private.ride_reserve_event(uuid,text,uuid,text,uuid,timestamptz,timestamptz,jsonb),
 private.ride_terminal_closed_at(text,text,timestamptz),private.ride_reserve_terminal(text,text,text,timestamptz),
 private.ride_terminal_change_issue(text,text,text,timestamptz,boolean),private.check_ride_reserve_window(),
 private.check_ride_terminal_change(),private.reagree_ride_reserve(),private.freeze_ride_reserve_terms(),private.sync_ride_reserve_terms(),
 private.ride_reserve_move_issue(public.ride_legs,timestamptz),private.ride_reserve_move(uuid,timestamptz),
 private.ride_reserve_release(private.ride_reserve_shifts,public.ride_legs,uuid),private.ride_reserve_settle(uuid,boolean,uuid),
 private.ride_driver_shift_tasks(uuid),private.ride_reservation_check_before_reserve(),private.ride_reservation_check()
 from public,anon,authenticated,service_role;
revoke all on function public.ride_shift_reservation(uuid,timestamptz,text,uuid),public.driver_decide_shift(uuid,boolean),
 public.ride_reserve_contingency(uuid,text,timestamptz,uuid),public.ride_reserve_flight(uuid,text),public.ride_reserve_state(uuid),
 public.driver_mode_tasks() from public,anon,authenticated,service_role;
grant execute on function public.ride_shift_reservation(uuid,timestamptz,text,uuid),public.driver_decide_shift(uuid,boolean),
 public.ride_reserve_contingency(uuid,text,timestamptz,uuid),public.ride_reserve_flight(uuid,text),public.ride_reserve_state(uuid),
 public.driver_mode_tasks() to authenticated;
