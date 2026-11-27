-- A change is an offer against one exact version of an existing leg.
-- Prices and consents are audit records. Exact points inherit the route TTL.
create table private.ride_amendments (
 id uuid primary key default gen_random_uuid(), leg_id uuid not null references public.ride_legs(id),
 proposer uuid not null, intent uuid not null, route_id uuid not null references private.ride_route_cases(id),
 old_route_id uuid references private.ride_route_cases(id), old_quote uuid not null references private.ride_quotes(id),
 new_quote uuid references private.ride_quotes(id), old_state text not null, assigned_driver uuid,
 old_fare int not null, fare int not null, fee int not null, driver_net int not null,
 consumed_meters int not null, consumed_minutes int not null, remaining_minutes int not null,
 pickup_at timestamptz not null, requested_pickup timestamptz,
 required_users uuid[] not null, created_at timestamptz not null default now(), expires_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','applied','declined','superseded')),
 unique(proposer,intent),check(fare>0 and fee>=0 and driver_net>=0 and fare=fee+driver_net)
);
create unique index ride_one_pending_amendment on private.ride_amendments(leg_id) where status='pending';
create index ride_amendments_route on private.ride_amendments(route_id);
create table private.ride_amendment_decisions (
 change_id uuid not null references private.ride_amendments(id), actor_id uuid not null, accepted boolean not null,
 decided_at timestamptz not null default now(),primary key(change_id,actor_id)
);
alter table private.ride_route_points add column actual_pickup jsonb check(actual_pickup is null or private.valid_ride_point(actual_pickup));
revoke all on private.ride_amendments,private.ride_amendment_decisions from public,anon,authenticated,service_role;

-- Haversine in metres, using the same earth radius as the statutory receipt.
create function private.ride_point_distance(a jsonb,b jsonb) returns double precision language sql immutable strict set search_path='' as $$
 select 12742000*asin(sqrt(least(1.0,
   power(sin(radians((a->>'lat')::float8-(b->>'lat')::float8)/2),2)
   +cos(radians((a->>'lat')::float8))*cos(radians((b->>'lat')::float8))
    *power(sin(radians((a->>'lng')::float8-(b->>'lng')::float8)/2),2))))
$$;

-- Only a fresh onboard fix with a continuous track can anchor a mid-trip
-- revision. Missing evidence leaves the accepted fare and journey executable.
create function private.ride_revision_meter(l public.ride_legs)
 returns table(anchor jsonb,consumed_meters int,consumed_minutes int)
 language plpgsql stable set search_path='' as $$
declare boarding timestamptz;last_at timestamptz;first_at timestamptz;max_gap interval;
begin
 if l.status<>'boarded' then
   select private.ride_receipt_endpoints(l.id)->'origin',0,0 into anchor,consumed_meters,consumed_minutes;
   if anchor='null'::jsonb then anchor:=null; end if;
   return next;return;
 end if;
 select min(at) into boarding from private.ride_events where leg_id=l.id and to_status='boarded';
 with trace as (
   select observed_at,jsonb_build_object('lat',latitude,'lng',longitude,'label','Posição de embarcado') pt
   from private.ride_observations where leg_id=l.id and onboard and accuracy_m<=50 and observed_at between boarding and now()
 ), samples as (
   select *,lag(pt) over w prev,lag(observed_at) over w prev_at from trace window w as(order by observed_at)
 )
 select (array_agg(pt order by observed_at desc))[1],min(observed_at),max(observed_at),max(observed_at-prev_at),
   coalesce(round(sum(private.ride_point_distance(pt,prev)))::int,0)
 into anchor,first_at,last_at,max_gap,consumed_meters from samples;
 if last_at is null or last_at<now()-interval '2 minutes' or first_at>boarding+interval '2 minutes'
   or max_gap>interval '2 minutes' then anchor:=null; end if;
 consumed_minutes:=greatest(0,ceil(extract(epoch from (last_at-boarding))/60)::int);
 return next;
end $$;

create function public.ride_propose_amendment(p_leg uuid,p_route uuid,p_key uuid,p_pickup_at timestamptz default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=private.require_ride_feature('quote'); l public.ride_legs; r public.rides;
 c private.ride_route_cases; pts private.ride_route_points; a private.ride_amendments; m record;
 t private.ride_tariffs; base int; fee int; users uuid[]; ride_client uuid;
begin
 if p_key is null then raise exception 'invalid_ride_request'; end if;
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
 select * into r from public.rides where id=l.ride_id;
 if r.passenger_id is distinct from actor then raise exception 'not_allowed'; end if;
 select * into a from private.ride_amendments where proposer=actor and intent=p_key;
 if found then
   if a.leg_id<>p_leg or a.route_id is distinct from p_route or a.requested_pickup is distinct from p_pickup_at then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('id',a.id,'status',a.status);
 end if;
 if l.status not in ('requested','accepted','arriving','boarded') then raise exception 'invalid_ride_transition'; end if;
 if p_pickup_at is not null and (l.status not in ('requested','accepted') or p_pickup_at<=now() or p_pickup_at>now()+interval '30 days') then
   raise exception 'invalid_schedule'; end if;
 select * into c from private.ride_route_cases where id=p_route and passenger_id=actor and booking_id is null
   and environment=l.environment and status='verified' and valid_until>now() for update;
 if not found or exists(select from public.ride_legs where route_case_id=p_route) or exists(
    select from private.ride_amendments where (status='applied' and p_route in(route_id,old_route_id))
      or (route_id=p_route and leg_id<>p_leg and status='pending' and expires_at>now()))
 then raise exception 'route_unavailable'; end if;
 select * into pts from private.ride_route_points where route_id=p_route and delete_by>now();
 select * into m from private.ride_revision_meter(l);
 if pts.origin is null or pts.destination is null or m.anchor is null
   or private.ride_point_distance(pts.origin,m.anchor)>(case when l.status='boarded' then 75 else 2 end)
 then raise exception 'ride_revision_anchor_changed'; end if;
 if l.status<>'boarded' and l.origin<>c.origin_area then raise exception 'route_unavailable'; end if;
 if not private.ride_area_allowed(l.environment,c.origin_area,'quote') or not private.ride_area_allowed(l.environment,c.destination_area,'quote') then raise exception 'route_unavailable'; end if;
 select * into strict t from private.ride_tariffs where id=l.tariff_id;
 base:=greatest(t.minimum_cents,t.base_cents+round((c.meters+m.consumed_meters)::numeric*t.km_cents/1000)::int+(c.minutes+m.consumed_minutes)*t.minute_cents);
 base:=base+coalesce((select surcharge_cents from private.ride_route_preferences where route_id=l.route_case_id),0);
 fee:=case when l.fee_cents>0 then (base::bigint*t.commission_bps/10000)::int else 0 end;
 -- Only the destination client's agreed service point may be altered. Include
 -- them in the decision even if the professional pays. Other legs and bookings
 -- are never modified on their behalf.
 if r.booking_id is not null and l.service_endpoint='destination' then
   select client_id into ride_client from public.bookings where id=r.booking_id;
 end if;
 select array_agg(distinct v) into users from unnest(array[actor,l.driver_id,l.payer_id,ride_client]) v where v is not null;
 if exists(select from unnest(users) u where not private.ride_active_user(u)) then raise exception 'not_allowed'; end if;
 update private.ride_amendments set status='superseded' where leg_id=p_leg and status='pending';
 insert into private.ride_amendments(leg_id,proposer,intent,route_id,old_route_id,old_quote,old_state,assigned_driver,old_fare,fare,fee,driver_net,
   consumed_meters,consumed_minutes,remaining_minutes,pickup_at,requested_pickup,required_users,expires_at)
 values(l.id,actor,p_key,c.id,l.route_case_id,coalesce(l.source_quote_id,r.quote_id),l.status,l.driver_id,l.fare_cents,base+l.extras_cents,fee,
   base+l.extras_cents-fee,m.consumed_meters,m.consumed_minutes,c.minutes,coalesce(p_pickup_at,l.pickup_at),p_pickup_at,users,
   least(c.valid_until,now()+interval '5 minutes',coalesce(p_pickup_at,'infinity'::timestamptz))) returning * into a;
 return jsonb_build_object('id',a.id,'status',a.status);
end $$;

create function private.apply_ride_amendment(a private.ride_amendments,l public.ride_legs) returns void
 language plpgsql security definer set search_path='' as $$
declare c private.ride_route_cases;pt private.ride_route_points;q private.ride_quotes;old_leg jsonb;
 v_quote uuid;expected_end timestamptz;next_driver_slot tstzrange;new_slot tstzrange; candidate public.ride_legs; approach interval:=interval '0';
 f private.ride_route_preferences;origin_point jsonb;m record;v_issue text; full_minutes int:=a.remaining_minutes+a.consumed_minutes;
begin
 perform private.require_ride_feature('dispatch');
 select * into c from private.ride_route_cases where id=a.route_id and status='verified' and valid_until>now() for update;
 if not found or exists(select from public.ride_legs where route_case_id=a.route_id) then raise exception 'route_unavailable'; end if;
 select * into pt from private.ride_route_points where route_id=c.id and delete_by>now() for update;
 if not found then raise exception 'route_unavailable'; end if;
 select * into m from private.ride_revision_meter(l);
 if m.anchor is null or private.ride_point_distance(pt.origin,m.anchor)>(case when l.status='boarded' then 75 else 2 end) then raise exception 'ride_revision_anchor_changed'; end if;
 if l.status in ('accepted','arriving') and l.driver_slot is not null then
   approach:=greatest(interval '0',upper(l.driver_slot)-lower(l.driver_slot)-make_interval(mins=>l.duration_minutes));
 end if;
 expected_end:=case when l.status='boarded' then now() else greatest(now()+approach,a.pickup_at) end+make_interval(mins=>c.minutes);
 new_slot:=tstzrange(a.pickup_at,expected_end,'[)');
 candidate:=l;candidate.slot:=new_slot;candidate.pickup_at:=a.pickup_at;candidate.destination:=c.destination_area;candidate.duration_minutes:=c.minutes;
 if l.driver_id is not null then
   if l.status='accepted' and (a.requested_pickup is not null or l.pickup_at>=now()) then
     select p.driver_slot into next_driver_slot from private.ride_approach_plan(l.driver_id,candidate) p;
     if next_driver_slot is null or (a.requested_pickup is not null and upper(next_driver_slot)>a.pickup_at+make_interval(mins=>c.minutes)) then
       raise exception 'driver_unavailable'; end if;
     expected_end:=upper(next_driver_slot);
     new_slot:=tstzrange(a.pickup_at,expected_end,'[)');
   else
     next_driver_slot:=tstzrange(lower(coalesce(l.driver_slot,l.slot)),expected_end,'[)');
     if l.environment='live' and not exists(select from private.ride_driver_shifts where driver_id=l.driver_id and period @> next_driver_slot) then
       raise exception 'driver_shift_required'; end if;
     if exists(select from public.bookings b where b.provider_id=l.driver_id and b.status in ('requested','accepted','paid','in_progress') and b.period && next_driver_slot)
       or exists(select from public.shifts s where s.provider_id=l.driver_id and s.status in ('assigned','checked_in') and s.period && next_driver_slot)
       then raise exception 'slot_unavailable'; end if;
     -- A following pickup also needs travel from the newly agreed destination.
     if exists(select from (
       select n.pickup_at,n.origin from public.ride_legs n where n.driver_id=l.driver_id and n.id<>l.id
         and n.status in ('accepted','arriving','boarded','unknown') and lower(coalesce(n.driver_slot,n.slot))>=lower(next_driver_slot)
         order by n.pickup_at limit 1
     ) other where not exists(select from private.ride_approach_routes ap where ap.environment=l.environment and ap.origin_area=c.destination_area and ap.destination_area=other.origin
         and ap.valid_until>=other.pickup_at and expected_end+make_interval(mins=>ap.minutes)<=other.pickup_at)) then raise exception 'slot_unavailable'; end if;
   end if;
 end if;
 candidate.slot:=new_slot;
 if l.environment='live' and not exists(select from private.ride_commitments h join private.ride_coverage v on v.pilot=h.pilot
   join private.ride_staffed_channels staffed on staffed.id=v.id where h.leg_id=l.id and not staffed.frozen
     and staffed.hours @> coalesce(next_driver_slot,new_slot)) then raise exception 'ride_support_unstaffed'; end if;
 if exists(select from public.ride_legs other join public.rides other_ride on other_ride.id=other.ride_id
    join public.rides this_ride on this_ride.id=l.ride_id where this_ride.booking_id is not null and other_ride.passenger_id=this_ride.passenger_id
      and other.environment=l.environment and other.ride_id<>l.ride_id and other.status not in ('completed','cancelled') and other.slot && new_slot)
   then raise exception 'passenger_slot_unavailable'; end if;
 if exists(select from private.ride_financial_accounts where leg_id=l.id) then raise exception 'ride_already_settled'; end if;
 select * into f from private.ride_route_preferences where route_id=l.route_case_id;
 if found then
   if not exists(select from private.ride_class_policies policy where policy.environment=l.environment and policy.area=l.origin and policy.code=f.class_code
      and least(policy.valid_until,f.class_until)>=expected_end and (policy.seats,policy.tools,policy.accessible)=(f.seats,f.tools,f.accessible))
     or (l.driver_id is not null and not private.ride_qualified_capacity(l.driver_id,lower(new_slot),expected_end,f.seats,f.tools,f.accessible))
     then raise exception 'requote_required'; end if;
 end if;
 if exists(select from private.ride_route_preferences p where p.route_id=c.id) then raise exception 'requote_required'; end if;
 if f.route_id is not null then
   insert into private.ride_route_preferences values(c.id,f.class_code,f.label,f.surcharge_cents,f.seats,f.tools,f.accessible,f.class_until);
 end if;
 if exists(select from public.ride_legs lx where lx.ride_id=l.ride_id and lx.id<>l.id and lx.status not in ('completed','cancelled') and
   ((lx.seq>l.seq and lower(lx.slot)<upper(new_slot)) or (lx.seq<l.seq and upper(lx.slot)>lower(new_slot)))) then raise exception 'invalid_itinerary'; end if;
 candidate.fare_cents:=a.fare;candidate.fee_cents:=a.fee;candidate.driver_cents:=a.driver_net;
 v_issue:=private.ride_eligibility_issue(candidate,greatest(upper(new_slot),upper(next_driver_slot)),l.driver_id);
 if v_issue is not null then raise exception '%',v_issue; end if;
 if l.environment='live' and not private.ride_scope_covers(c.origin_area,c.destination_area,upper(new_slot),true,a.fee>0) then raise exception 'ride_scope_expired'; end if;
 select * into strict q from private.ride_quotes where id=a.old_quote;
 select value into old_leg from jsonb_array_elements(q.legs) where (value->>'seq')::int=coalesce(l.quote_seq,l.seq);
 if old_leg is null then raise exception 'requote_required'; end if;
 -- A new financial snapshot serves the existing receipt and ledger readers.
 -- The original quote, accepted limit, history and driver share remain auditable.
 old_leg:=old_leg||jsonb_build_object('seq',1,'origin',l.origin,'destination',c.destination_area,'pickup_at',a.pickup_at,
   'duration_minutes',full_minutes,'meters',c.meters+a.consumed_meters,'route_id',c.id,'stop_wait_policy','accepted_extras_only_v1','fare_cents',a.fare,'limit_cents',a.fare,'fee_cents',a.fee,'driver_cents',a.driver_net);
 insert into private.ride_quotes(environment,actor_id,request_key,booking_id,passenger_id,client_id,scheduled_at,request_legs,legs,
   required_users,tariff_id,expires_at,status,total_cents,existing_ride_id)
 values(l.environment,a.proposer,gen_random_uuid(),q.booking_id,q.passenger_id,q.client_id,coalesce(a.requested_pickup,q.scheduled_at),'[]',jsonb_build_array(old_leg),
   array(select distinct u from unnest(array[q.passenger_id,l.payer_id,q.client_id]) u where u is not null),l.tariff_id,a.expires_at,'requested',a.fare,l.ride_id) returning id into v_quote;
 insert into private.ride_consents(quote_id,actor_id,accepted,at)
 select v_quote,d.actor_id,d.accepted,d.decided_at from private.ride_amendment_decisions d
   where d.change_id=a.id and d.accepted;
 insert into private.ride_service_windows select v_quote,booking_id,period,binding from private.ride_service_windows where quote_id=q.id;
 select private.ride_receipt_endpoints(l.id)->'origin' into origin_point;
 -- The previous route no longer needs the retention horizon of a future booking.
 update private.ride_route_points set delete_by=least(delete_by,now()+interval '24 hours') where route_id=l.route_case_id;
 update private.ride_route_points set actual_pickup=nullif(origin_point,'null'::jsonb),delete_by=upper(new_slot)+interval '24 hours' where route_id=c.id;
 -- Updating the existing leg keeps the unique assignment, coverage, budget and
 -- settlement triggers authoritative. It cannot start a second charge.
 update public.ride_legs set destination=c.destination_area,pickup_at=a.pickup_at,duration_minutes=full_minutes,slot=new_slot,driver_slot=next_driver_slot,
   route_case_id=c.id,source_quote_id=v_quote,quote_seq=1,fare_cents=a.fare,fee_cents=a.fee,driver_cents=a.driver_net,updated_at=now() where id=l.id;
 update private.ride_amendments set status='applied',new_quote=v_quote where id=a.id;
end $$;

create function public.ride_decide_amendment(p_change uuid,p_accept boolean) returns jsonb
 language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();a private.ride_amendments;l public.ride_legs;r public.rides;prior boolean;
begin
 if not private.ride_active_user(actor) or p_accept is null then raise exception 'not_allowed'; end if;
 select * into a from private.ride_amendments where id=p_change and actor=any(required_users);
 if not found then raise exception 'not_allowed'; end if;
 select * into l from public.ride_legs where id=a.leg_id and environment=private.ride_env();
 if not found then raise exception 'not_allowed'; end if;
 select * into strict r from public.rides where id=l.ride_id;
 -- Service/driver locks have the same order as normal assignment. Locking
 -- the route and leg serializes concurrent final consents and cancellation.
 if r.booking_id is not null then
   perform pg_advisory_xact_lock(hashtextextended('ride-passenger:'||r.passenger_id::text,0));
   perform id from public.bookings where id in (r.booking_id,l.next_booking_id) order by id for share;
 end if;
 perform 1 from public.providers where id=l.driver_id for no key update;
 perform 1 from public.ride_drivers where id=l.driver_id for update;
 select * into strict l from public.ride_legs where id=l.id for update;
 select * into strict a from private.ride_amendments where id=a.id for update;
 select accepted into prior from private.ride_amendment_decisions where change_id=a.id and actor_id=actor;
 if a.status<>'pending' then
   if prior is distinct from p_accept then raise exception 'quote_unavailable'; end if;
   return jsonb_build_object('id',a.id,'status',a.status);
 end if;
 if a.expires_at<=now() or a.old_state<>l.status or a.assigned_driver is distinct from l.driver_id
   or a.old_quote<>coalesce(l.source_quote_id,r.quote_id) or a.old_fare<>l.fare_cents
   or exists(select from unnest(a.required_users) u where not private.ride_active_user(u)) then raise exception 'quote_unavailable'; end if;
 insert into private.ride_amendment_decisions(change_id,actor_id,accepted) values(a.id,actor,p_accept)
 on conflict(change_id,actor_id) do update set accepted=excluded.accepted,decided_at=now() where private.ride_amendment_decisions.accepted is distinct from excluded.accepted;
 if not p_accept then
   update private.ride_amendments set status='declined' where id=a.id;
   return jsonb_build_object('id',a.id,'status','declined');
 end if;
 if exists(select from unnest(a.required_users) u where not exists(select from private.ride_amendment_decisions d where d.change_id=a.id and d.actor_id=u and d.accepted)) then
   return jsonb_build_object('id',a.id,'status','pending'); end if;
 perform private.apply_ride_amendment(a,l);
 return jsonb_build_object('id',a.id,'status','applied');
end $$;

create function public.ride_amendment_state(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid();l public.ride_legs;r public.rides;ride_client boolean; anchor jsonb; revisions jsonb;
begin
 if not private.ride_active_user(actor) then raise exception 'not_allowed'; end if;
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env();
 if not found then raise exception 'not_allowed'; end if;
 select * into strict r from public.rides where id=l.ride_id;
 ride_client:=exists(select from public.bookings where id=r.booking_id and client_id=actor);
 if not (actor=r.passenger_id or actor=l.payer_id or l.driver_id is not distinct from actor or ride_client) then raise exception 'not_allowed'; end if;
 if actor=r.passenger_id and l.status in ('requested','accepted','arriving','boarded') then
   select m.anchor into anchor from private.ride_revision_meter(l) m;
 end if;
 select jsonb_agg(jsonb_build_object('id',a.id,'status',case when a.status='pending' and (a.expires_at<=now() or l.status<>a.old_state
       or a.assigned_driver is distinct from l.driver_id or a.old_quote<>coalesce(l.source_quote_id,r.quote_id)) then 'expired' else a.status end,
   'expires_at',a.expires_at,'pickup_at',a.pickup_at,'created_at',a.created_at,'old_cents',case when actor=l.payer_id then a.old_fare end,
   'fare_cents',case when actor=l.payer_id then a.fare end,'driver_cents',case when a.assigned_driver=actor then a.driver_net end,
   'accepted_by_me',exists(select from private.ride_amendment_decisions d where d.change_id=a.id and d.actor_id=actor and d.accepted),
   'may_decide',actor=any(a.required_users),'is_current',coalesce(l.source_quote_id=a.new_quote,false),
   'previous_destination',case when actor=r.passenger_id or (actor=a.assigned_driver and l.driver_id=actor and l.status in('accepted','arriving','boarded'))
       or (ride_client and l.service_endpoint='destination') then previous.destination->>'label' end,
   'consumed_variable_cents',case when actor=l.payer_id then round(a.consumed_meters::numeric*t.km_cents/1000)::int+a.consumed_minutes*t.minute_cents end,
   'remaining_minutes',case when actor=r.passenger_id or actor=a.assigned_driver then a.remaining_minutes end,
   'destination',case when actor=r.passenger_id or (actor=a.assigned_driver and l.driver_id=actor and l.status in('accepted','arriving','boarded'))
       or (ride_client and l.service_endpoint='destination') then pt.destination->>'label' end,
   'stops',case when actor=r.passenger_id or (actor=a.assigned_driver and l.driver_id=actor and l.status in('accepted','arriving','boarded'))
      then (select jsonb_agg(stop->>'label' order by ord) from jsonb_array_elements(pt.stops) with ordinality e(stop,ord)) end) order by a.created_at desc)
 into revisions from (select * from private.ride_amendments where leg_id=p_leg order by created_at desc limit 20) a
 left join private.ride_route_points pt on pt.route_id=a.route_id and pt.delete_by>now()
 left join private.ride_route_points previous on previous.route_id=a.old_route_id and previous.delete_by>now()
 join private.ride_tariffs t on t.id=l.tariff_id;
 return jsonb_build_object('can_propose',actor=r.passenger_id and l.status in ('requested','accepted','arriving','boarded'),
   'can_reschedule',actor=r.passenger_id and l.status in ('requested','accepted'),'anchor',anchor,
   'origin_area',case when actor=r.passenger_id then l.origin end,'destination_area',case when actor=r.passenger_id then l.destination end,
   'current_cents',case when actor=l.payer_id then l.fare_cents end,'status',l.status,'changes',coalesce(revisions,'[]'));
end $$;

-- Current route case may start where the vehicle was already in transit.
-- Preserve the real pickup on the receipt and on the service-client projection.
create or replace function private.ride_receipt_endpoints(p_leg uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('origin',case when l.route_case_id is not null then coalesce(p.actual_pickup,p.origin) else m.origin end,
   'destination',case when l.route_case_id is not null then p.destination else m.destination end)
 from public.ride_legs l left join private.ride_route_points p on p.route_id=l.route_case_id and p.delete_by>now()
 left join private.ride_meeting_snapshots m on m.quote_id=l.source_quote_id and m.seq=l.quote_seq where l.id=p_leg
$$;
alter function public.ride_leg_points(uuid) rename to ride_unamended_points;
alter function public.ride_unamended_points(uuid) set schema private;
create function public.ride_leg_points(p_leg uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare visible jsonb;pickup jsonb;
begin
 visible:=private.ride_unamended_points(p_leg);
 if visible->'origin' is distinct from 'null'::jsonb then
   select pt.actual_pickup into pickup from public.ride_legs l join private.ride_route_points pt on pt.route_id=l.route_case_id and pt.delete_by>now()
     where l.id=p_leg;
   if pickup is not null then visible:=jsonb_set(visible,'{origin}',pickup); end if;
 end if;
 return visible;
end $$;

-- An onboard route revision already includes elapsed travel in its new slot.
-- Preserve the existing departure checks on genuine state transitions.
create or replace function private.check_ride_departure() returns trigger language plpgsql security definer set search_path='' as $$
declare horizon timestamptz:=upper(coalesce(new.driver_slot,new.slot));issue text;
begin
 if tg_op='UPDATE' and new.status is distinct from old.status then
   if new.status='arriving' then horizon:=greatest(horizon,now()+coalesce(upper(new.driver_slot)-lower(new.driver_slot),make_interval(mins=>new.duration_minutes)));
   elsif new.status='boarded' then horizon:=greatest(horizon,now()+make_interval(mins=>new.duration_minutes)); end if;
 end if;
 issue:=private.ride_eligibility_issue(new,horizon,new.driver_id);
 if issue is not null then raise exception '%',issue;end if;
 return new;
end $$;

-- Include the data subject's own decisions in their download. The financial
-- projections of other participants and precise counterparty points stay private.
create or replace function public.ride_export_my_data() returns jsonb language sql stable security definer set search_path='' as $$
 select private.ride_export_without_places()||jsonb_build_object('my_places',public.ride_my_places(),
   'my_route_decisions',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('leg',a.leg_id,'revision',a.id,
     'status',a.status,'created_at',a.created_at,'accepted',d.accepted,'decided_at',d.decided_at,
     'fare_cents',case when l.payer_id=auth.uid() then a.fare end,'driver_cents',case when a.assigned_driver=auth.uid() then a.driver_net end))
     order by a.created_at,a.id) from private.ride_amendments a join public.ride_legs l on l.id=a.leg_id
     left join private.ride_amendment_decisions d on d.change_id=a.id and d.actor_id=auth.uid()
     where l.environment=private.ride_env() and auth.uid()=any(a.required_users) and private.ride_active_user(auth.uid())),'[]'))
$$;

-- A previously consumed route case cannot act as a fresh executable ride.
create function private.reserve_amendment_case() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.route_case_id is not null then
   perform 1 from private.ride_route_cases where id=new.route_case_id for update;
   if exists(select from private.ride_amendments a where (a.status='applied' and new.route_case_id in (a.route_id,a.old_route_id))
     or (a.route_id=new.route_case_id and a.status='pending' and a.expires_at>now() and (tg_op='INSERT' or a.leg_id<>new.id)))
   then raise exception 'route_unavailable'; end if;
 end if;
 return new;
end $$;
create trigger reserve_amendment_case before insert or update of route_case_id on public.ride_legs for each row execute function private.reserve_amendment_case();

revoke all on function private.ride_revision_meter(public.ride_legs),private.ride_point_distance(jsonb,jsonb),
 private.apply_ride_amendment(private.ride_amendments,public.ride_legs),private.ride_unamended_points(uuid),private.reserve_amendment_case()
 from public,anon,authenticated,service_role;
revoke all on function public.ride_amendment_state(uuid),public.ride_propose_amendment(uuid,uuid,uuid,timestamptz),
 public.ride_decide_amendment(uuid,boolean),public.ride_leg_points(uuid) from public,anon;
grant execute on function public.ride_amendment_state(uuid),public.ride_propose_amendment(uuid,uuid,uuid,timestamptz),
 public.ride_decide_amendment(uuid,boolean),public.ride_leg_points(uuid) to authenticated;
