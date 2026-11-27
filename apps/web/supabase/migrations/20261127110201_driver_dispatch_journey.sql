-- Timed, exclusive dispatch over the existing eligibility/acceptance transaction.
create table private.ride_dispatch_rules (
 environment text primary key references private.ride_network(environment),
 enabled boolean not null default false,
 wave_size smallint not null default 3 check(wave_size between 1 and 12),
 lifetime_seconds integer not null default 90 check(lifetime_seconds between 15 and 600),
 external_navigation boolean not null default false
);
insert into private.ride_dispatch_rules(environment,enabled,external_navigation) values ('simulation',true,true),('live',false,false);
alter table private.ride_approach_routes add column meters integer check(meters between 0 and 250000);
update private.ride_approach_routes a set meters=coalesce(
 (select r.meters from private.ride_routes r where r.environment=a.environment and r.origin=a.origin_area and r.destination=a.destination_area),
 800) where a.environment='simulation';
create table private.ride_dispatch_rounds (
 leg_id uuid primary key references public.ride_legs(id) on delete cascade,
 generation int not null default 1, status text not null default 'waiting' check(status in ('waiting','offered','assigned','no_driver','closed')),
 next_scan timestamptz not null default now()
);
create index ride_dispatch_round_ready on private.ride_dispatch_rounds(next_scan) where status in ('waiting','offered');
create table private.ride_driver_offers (
 leg_id uuid not null references public.ride_legs(id) on delete cascade, generation int not null,
 driver_id uuid not null references public.profiles(id) on delete cascade,
 state text not null check(state in ('offered','expired','declined','assigned','withdrawn')),
 revision int not null default 1, offered_at timestamptz not null, expires_at timestamptz not null,
 approach_minutes int not null, approach_meters int not null, driver_cents int not null, cost_cents int,
 primary key(leg_id,generation,driver_id)
);
create index ride_driver_offers_active on private.ride_driver_offers(driver_id,expires_at) where state='offered';
create table private.ride_offer_history(
 id bigint generated always as identity primary key, leg_id uuid not null references public.ride_legs(id) on delete cascade,
 driver_id uuid not null references public.profiles(id) on delete cascade, generation int not null, revision int not null,
 state text not null, at timestamptz not null default clock_timestamp()
);
revoke all on private.ride_offer_history from public,anon,authenticated,service_role;
create table private.ride_driver_interest (
 leg_id uuid not null references public.ride_legs(id) on delete cascade, driver_id uuid not null references public.profiles(id) on delete cascade,
 at timestamptz not null default now(), primary key(leg_id,driver_id)
);
create table private.ride_driver_preferences (
 driver_id uuid primary key references public.profiles(id) on delete cascade,
 destination_area text, arrive_by timestamptz, cost_per_km_cents integer check(cost_per_km_cents between 0 and 2000),
 check((destination_area is null)=(arrive_by is null))
);
revoke all on private.ride_dispatch_rules, private.ride_dispatch_rounds,private.ride_driver_offers,
 private.ride_driver_interest,private.ride_driver_preferences from public,anon,authenticated,service_role;

-- Realtime carries only the driver's own revision. Coordinates, offers and passenger data stay behind RPCs.
create table public.ride_driver_inbox (
 driver_id uuid primary key references public.profiles(id) on delete cascade, revision bigint not null default 1
);
alter table public.ride_driver_inbox enable row level security;
revoke all on public.ride_driver_inbox from public,anon,authenticated;
grant select on public.ride_driver_inbox to authenticated;
create policy driver_reads_own_revision on public.ride_driver_inbox for select to authenticated
 using(driver_id=(select auth.uid()));
do $$begin
 if exists(select from pg_publication where pubname='supabase_realtime') then
   alter publication supabase_realtime add table public.ride_driver_inbox;
 end if;
end$$;

-- Select the same shift and preceding drop-off as the canonical schedule calculation.
create function private.driver_offer_metrics(p_driver uuid,l public.ride_legs)
returns table(minutes integer,meters integer,cost_cents integer)
language sql stable security definer set search_path='' as $$
 select plan.minutes,m.meters,
   case when pref.cost_per_km_cents is not null then
     ((((q.legs->(l.quote_seq-1))->>'meters')::bigint+m.meters)*pref.cost_per_km_cents+500)::bigint/1000 end::integer
 from private.ride_approach_plan(p_driver,l) plan
 join private.ride_quotes q on q.id=l.source_quote_id
 left join lateral(select s.area,s.period from private.ride_driver_shifts s where s.driver_id=p_driver and s.period @> plan.driver_slot limit 1) sh on true
 left join lateral(select prev.destination from public.ride_legs prev where prev.driver_id=p_driver and prev.id<>l.id
   and prev.status in ('accepted','arriving','boarded','completed')
   and upper(coalesce(prev.driver_slot,prev.slot)) between coalesce(lower(sh.period),now()-interval '1 hour') and l.pickup_at
   order by upper(coalesce(prev.driver_slot,prev.slot)) desc limit 1) prior on true
 join private.ride_approach_routes m on m.environment=l.environment and m.origin_area=coalesce(prior.destination,sh.area,l.origin)
   and m.destination_area=l.origin and m.valid_until>=greatest(now(),l.pickup_at) and m.meters is not null
 left join private.ride_driver_preferences pref on pref.driver_id=p_driver
$$;

create function private.dispatch_lease_current(p_driver uuid,l public.ride_legs) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select from private.ride_dispatch_rules where environment=l.environment and enabled)
   or exists(select from private.ride_driver_offers o join private.ride_dispatch_rounds r using(leg_id,generation)
     where o.leg_id=l.id and o.driver_id=p_driver and o.state='offered' and o.expires_at>statement_timestamp())
$$;

create function private.driver_offer_changed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.ride_offer_history(leg_id,driver_id,generation,revision,state) values(new.leg_id,new.driver_id,new.generation,new.revision,new.state);
 insert into public.ride_driver_inbox as b(driver_id) values(new.driver_id)
   on conflict(driver_id) do update set revision=b.revision+1;
 return null;
end $$;
create trigger driver_inbox_change after insert or update of state on private.ride_driver_offers
 for each row execute function private.driver_offer_changed();

-- Ordinary corridors can notify a small wave. The terminal policy specializes these two functions.
create function private.driver_wave_size(l public.ride_legs,p_size integer) returns integer language sql immutable set search_path='' as $$ select p_size $$;
create function private.driver_queue_order(p_driver uuid,l public.ride_legs) returns bigint language sql immutable set search_path='' as $$ select null::bigint $$;
revoke all on function private.driver_wave_size(public.ride_legs,integer),private.driver_queue_order(uuid,public.ride_legs) from public,anon,authenticated,service_role;

-- Called by creation, refusal, shift activation and cron. The leg lock serializes offers with acceptance.
create function private.dispatch_ride_leg(p_leg uuid) returns void language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; cfg private.ride_dispatch_rules; r private.ride_dispatch_rounds; active int; added int; cutoff timestamptz;
begin
 select * into l from public.ride_legs where id=p_leg for update skip locked;
 if not found then return; end if;
 select * into cfg from private.ride_dispatch_rules where environment=l.environment and enabled;
 if not found then return; end if;
 insert into private.ride_dispatch_rounds(leg_id) values(p_leg) on conflict do nothing;
 select * into strict r from private.ride_dispatch_rounds where leg_id=p_leg;
 if l.status<>'requested' then
   update private.ride_driver_offers set state=case when driver_id=l.driver_id and l.status='accepted' then 'assigned' else 'withdrawn' end
    where leg_id=p_leg and generation=r.generation and state='offered';
   update private.ride_dispatch_rounds set status=case when l.driver_id is not null then 'assigned' else 'closed' end where leg_id=p_leg;
   return;
 end if;
 cutoff:=l.pickup_at+interval '10 minutes';
 update private.ride_driver_offers o set state=case when o.expires_at<=statement_timestamp() then 'expired' else 'withdrawn' end
   where o.leg_id=p_leg and o.generation=r.generation and o.state='offered'
     and (o.expires_at<=statement_timestamp() or not private.ride_offer_eligible(o.driver_id,l));
 if cutoff<=statement_timestamp() then
   update private.ride_dispatch_rounds set status='no_driver' where leg_id=p_leg;
   return;
 end if;
 select count(*) into active from private.ride_driver_offers where leg_id=p_leg and generation=r.generation and state='offered';
 cfg.wave_size:=private.driver_wave_size(l,cfg.wave_size);
 if active<cfg.wave_size then
   insert into private.ride_driver_offers(leg_id,generation,driver_id,state,offered_at,expires_at,approach_minutes,approach_meters,driver_cents,cost_cents)
    select p_leg,r.generation,d.id,'offered',statement_timestamp(),least(cutoff,statement_timestamp()+make_interval(secs=>cfg.lifetime_seconds)),
      m.minutes,m.meters,l.driver_cents,m.cost_cents
    from public.ride_drivers d cross join lateral private.driver_offer_metrics(d.id,l) m
    left join private.ride_driver_interest i on i.leg_id=l.id and i.driver_id=d.id
    where d.environment=l.environment and d.online and private.ride_offer_eligible(d.id,l)
     and not exists(select from private.ride_driver_offers prior where prior.leg_id=p_leg and prior.generation=r.generation and prior.driver_id=d.id and prior.state<>'withdrawn')
    order by private.driver_queue_order(d.id,l) nulls last,i.at nulls last,m.minutes,d.id limit(cfg.wave_size-active) on conflict(leg_id,generation,driver_id) do update
     set state='offered',revision=private.ride_driver_offers.revision+1,offered_at=excluded.offered_at,expires_at=excluded.expires_at,
       approach_minutes=excluded.approach_minutes,approach_meters=excluded.approach_meters,cost_cents=excluded.cost_cents
     where private.ride_driver_offers.state='withdrawn';
   get diagnostics added=row_count;
 else added:=0; end if;
 update private.ride_dispatch_rounds set status=case when active+added>0 then 'offered' else 'waiting' end,
   next_scan=least(cutoff,coalesce((select min(expires_at) from private.ride_driver_offers where leg_id=p_leg and generation=r.generation and state='offered'),statement_timestamp()+interval '1 minute'))
   where leg_id=p_leg;
 -- Existing push dispatcher checks its gate and Vault. Cron separately retries leased, unacknowledged deliveries.
 if added>0 and l.environment='live' then perform private.dispatch_ride_alerts(); end if;
end $$;

create function private.driver_dispatch_leg_event() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.dispatch_ride_leg(new.id); return null;
end $$;
create trigger ride_wave_new after insert on public.ride_legs for each row execute function private.driver_dispatch_leg_event();
create trigger ride_wave_status after update of status on public.ride_legs for each row
 when(old.status is distinct from new.status) execute function private.driver_dispatch_leg_event();
create function private.driver_declined_wave() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.ride_driver_offers set state='declined' where leg_id=new.leg_id and driver_id=new.driver_id and state='offered';
 perform private.dispatch_ride_leg(new.leg_id); return null;
end $$;
create trigger ride_wave_declined after insert on private.ride_declines for each row execute function private.driver_declined_wave();
create unique index ride_support_late_reservation on public.support_tasks((payload->>'leg_id'),(payload->>'driver_id'))
 where kind='ride_reservation_late';
create function private.recover_ride_dispatch() returns void language plpgsql security definer set search_path='' as $$
declare candidate uuid;
begin
 -- A missed departure is a contact task, never an inferred no-show or a financial cancellation.
 insert into public.support_tasks(kind,payload)
 select 'ride_reservation_late',jsonb_build_object('leg_id',l.id,'driver_id',l.driver_id,'environment',l.environment)
 from public.ride_legs l join public.rides r on r.id=l.ride_id join private.ride_dispatch_rules cfg on cfg.environment=l.environment
 where l.status='accepted' and r.scheduled_at is not null and cfg.enabled and l.pickup_at<=statement_timestamp()
 and l.driver_id is not null and not exists(select from public.support_tasks t where t.kind='ride_reservation_late'
  and t.payload->>'leg_id'=l.id::text and t.payload->>'driver_id'=l.driver_id::text)
 order by l.pickup_at limit 100 on conflict do nothing;
 for candidate in select l.id from public.ride_legs l join private.ride_dispatch_rules cfg on cfg.environment=l.environment and cfg.enabled
    left join private.ride_dispatch_rounds r on r.leg_id=l.id where l.status='requested'
     and (r.leg_id is null or (r.status in ('waiting','offered') and r.next_scan<=statement_timestamp()))
    order by coalesce(r.next_scan,l.pickup_at),l.id limit 250
 loop perform private.dispatch_ride_leg(candidate); end loop;
end $$;
select cron.schedule('workeasy-recover-driver-offers','* * * * *','select private.recover_ride_dispatch()');

create function private.driver_availability_event() returns trigger language plpgsql security definer set search_path='' as $$
declare leg uuid;
begin
 if not new.online then
   update private.ride_driver_offers set state='withdrawn' where driver_id=new.id and state='offered';
 end if;
 for leg in select id from public.ride_legs where environment=new.environment and status='requested' and pickup_at+interval '10 minutes'>now()
    order by pickup_at limit 80 loop perform private.dispatch_ride_leg(leg); end loop;
 return null;
end $$;
create trigger ride_wave_availability after update of online on public.ride_drivers for each row
 when (old.online is distinct from new.online) execute function private.driver_availability_event();

-- A stale device must not accept an expired offer. The original command owns idempotency, eligibility, conflicts and the final exclusive assignment.
create function private.enforce_driver_wave() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.driver_id is not null and old.driver_id is null and not private.dispatch_lease_current(new.driver_id,old)
 then raise exception 'offer_unavailable'; end if;
 return new;
end $$;
create trigger ride_enforce_timed_offer before update of driver_id on public.ride_legs for each row execute function private.enforce_driver_wave();

create function public.ride_register_interest(p_leg uuid) returns void language plpgsql security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('dispatch'); l public.ride_legs;
begin
 select * into l from public.ride_legs where id=p_leg for update;
 if not found or not private.ride_offer_eligible(u,l) then raise exception 'offer_unavailable'; end if;
 insert into private.ride_driver_interest(leg_id,driver_id) values(l.id,u) on conflict do nothing;
 perform private.dispatch_ride_leg(l.id);
end $$;

alter function public.ride_dashboard() rename to ride_dashboard_before_waves;
revoke all on function public.ride_dashboard_before_waves() from public,anon,authenticated,service_role;
create function public.ride_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb:=public.ride_dashboard_before_waves(); cfg private.ride_dispatch_rules; u uuid:=auth.uid(); result jsonb; journeys jsonb;
begin
 select * into cfg from private.ride_dispatch_rules where environment=private.ride_env();
 if not cfg.enabled or not coalesce((d->>'enabled')::boolean,false) then return d; end if;
 select coalesce(jsonb_agg(x.item order by x.pickup_at),'[]') into result from (
   select l.pickup_at,jsonb_build_object('leg_id',l.id,'origin',l.origin,'destination',l.destination,'pickup_at',l.pickup_at,
    'driver_cents',o.driver_cents,'approach_minutes',o.approach_minutes,'approach_meters',o.approach_meters,'expires_at',o.expires_at,
    'trip_minutes',l.duration_minutes,'trip_meters',((q.legs->(l.quote_seq-1))->>'meters')::int,'cost_cents',o.cost_cents,'scheduled',r.scheduled_at is not null) item
   from private.ride_driver_offers o join private.ride_dispatch_rounds w using(leg_id,generation)
   join public.ride_legs l on l.id=o.leg_id join public.rides r on r.id=l.ride_id join private.ride_quotes q on q.id=l.source_quote_id
   where o.driver_id=u and o.state='offered' and o.expires_at>statement_timestamp() and private.ride_offer_eligible(u,l)
   order by l.pickup_at limit 50) x;
 -- Enrich only leg IDs that the existing role-filtered dashboard already exposes.
 select coalesce(jsonb_agg(r.item||jsonb_build_object('legs',nested.items) order by r.pos),'[]'::jsonb) into journeys
 from jsonb_array_elements(d->'rides') with ordinality r(item,pos)
 cross join lateral(select coalesce(jsonb_agg(e.item||jsonb_build_object('dispatch_state',w.status,
   'can_review_no_show',case when public.is_admin() then l.status='accepted' and l.pickup_at<=statement_timestamp() else false end,
   'pickup_estimate',case when l.status in ('accepted','arriving') then coalesce(eta.arrives_at,lower(l.driver_slot)+make_interval(mins=>o.approach_minutes)) end) order by e.pos),'[]'::jsonb) items
   from jsonb_array_elements(r.item->'legs') with ordinality e(item,pos)
   left join public.ride_legs l on l.id=(e.item->>'id')::uuid left join private.ride_dispatch_rounds w on w.leg_id=l.id
   left join private.ride_driver_offers o on o.leg_id=l.id and o.generation=w.generation and o.driver_id=l.driver_id and o.state='assigned'
   left join private.ride_arrival_estimates eta on eta.leg_id=l.id) nested;
 return d||jsonb_build_object('rides',journeys,'offers',result,'dispatch_waves',true,'external_navigation',cfg.external_navigation);
end $$;

create function public.driver_opportunities() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(s.item order by s.pickup_at),'[]'::jsonb) from(
  select l.pickup_at,jsonb_build_object('id',l.id,'origin',l.origin,'destination',l.destination,'pickup_at',l.pickup_at,
   'driver_cents',l.driver_cents,'scheduled',r.scheduled_at is not null,'interested',i.driver_id is not null) item
  from public.ride_legs l join public.rides r on r.id=l.ride_id join private.ride_dispatch_rules cfg on cfg.environment=l.environment and cfg.enabled
  left join private.ride_driver_interest i on i.driver_id=auth.uid() and i.leg_id=l.id
  where l.status='requested' and l.pickup_at+interval '10 minutes'>now() and private.ride_offer_eligible(auth.uid(),l)
  order by l.pickup_at limit 50) s
$$;
revoke all on function public.ride_dashboard(),public.ride_register_interest(uuid),public.driver_opportunities() from public,anon;
grant execute on function public.ride_dashboard(),public.ride_register_interest(uuid),public.driver_opportunities() to authenticated;
revoke all on function private.driver_offer_metrics(uuid,public.ride_legs),private.dispatch_lease_current(uuid,public.ride_legs),
 private.driver_offer_changed(),private.dispatch_ride_leg(uuid),private.driver_dispatch_leg_event(),private.driver_declined_wave(),
 private.recover_ride_dispatch(),private.driver_availability_event(),private.enforce_driver_wave() from public,anon,authenticated,service_role;

-- A new timed offer can wake the same device again. Tokens distinguish a late ack of an earlier offer
-- from the current delivery. The original live gate retains its three-attempt policy and numeric responses.
alter table private.ride_push_attempts add column wave_generation int not null default 0,
 add column wave_revision int not null default 0, add column claim_token int not null default 0;
create sequence private.ride_offer_push_token as integer start 101;
revoke all on sequence private.ride_offer_push_token from public,anon,authenticated,service_role;
create or replace function public.claim_ride_alerts() returns table(leg uuid,device uuid,transport text,token text,attempt int)
language sql security definer set search_path='' as $$
 with pending as (
  select l.id leg,d.id device,coalesce(o.generation,0) generation,coalesce(o.revision,0) revision
  from public.ride_legs l join private.ride_network n on n.environment=l.environment
  join private.ride_dispatch_rules cfg on cfg.environment=l.environment
  join public.ride_drivers m on m.environment=l.environment and m.online join private.ride_devices d on d.driver_id=m.id
  cross join private.ride_signal_settings sig
  left join private.ride_dispatch_rounds rnd on rnd.leg_id=l.id
  left join private.ride_driver_offers o on cfg.enabled and o.leg_id=l.id and o.generation=rnd.generation and o.driver_id=m.id
   and o.state='offered' and o.expires_at>statement_timestamp()
  left join private.ride_push_attempts a on a.leg_id=l.id and a.device_id=d.id
  where sig.push_enabled and n.environment='live' and n.module_enabled and n.dispatch_enabled and l.status='requested' and d.expires_at>now()
    and (not cfg.enabled or o.leg_id is not null) and private.ride_offer_eligible(m.id,l)
    and (a.leg_id is null or (a.wave_generation,a.wave_revision)<>(coalesce(o.generation,0),coalesce(o.revision,0))
     or (not a.delivered and a.leased_until<=now() and a.attempts<3))
  order by l.pickup_at,private.ride_approach_minutes(m.id,l) nulls last,m.id,d.id limit 12
 ), acquired as (
  insert into private.ride_push_attempts as a(leg_id,device_id,attempts,leased_until,wave_generation,wave_revision,claim_token)
    select leg,device,1,now()+case when generation>0 then interval '20 seconds' else interval '2 minutes' end,generation,revision,
     case when generation>0 then nextval('private.ride_offer_push_token')::int else 0 end from pending
   on conflict(leg_id,device_id) do update set
    attempts=case when (a.wave_generation,a.wave_revision)<>(excluded.wave_generation,excluded.wave_revision) then 1 else a.attempts+1 end,
    leased_until=excluded.leased_until,delivered=false,wave_generation=excluded.wave_generation,wave_revision=excluded.wave_revision,claim_token=excluded.claim_token
   where (a.wave_generation,a.wave_revision)<>(excluded.wave_generation,excluded.wave_revision) or (not a.delivered and a.leased_until<=now() and a.attempts<3)
   returning a.*
 ) select a.leg_id,d.id,d.transport,d.token,case when a.claim_token=0 then a.attempts else a.claim_token end
    from acquired a join private.ride_devices d on d.id=a.device_id
$$;
create or replace function public.ack_ride_alert(p_leg uuid,p_device uuid,p_attempt int) returns void
 language sql security definer set search_path='' as $$
 update private.ride_push_attempts set delivered=true where leg_id=p_leg and device_id=p_device
   and p_attempt=case when claim_token=0 then attempts else claim_token end
$$;

-- New clients confirm the expiry displayed on screen, including after a driver returns from pause.
create function public.driver_decide_offer(p_leg uuid,p_key uuid,p_expires timestamptz,p_accept boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); e private.ride_events; action text:=case when p_accept then 'accept_offer' else 'decline_offer' end;
begin
 if u is null or p_accept is null or p_key is null or p_expires is null then raise exception 'not_allowed'; end if;
 select * into e from private.ride_events where actor_id=u and operation_key=p_key;
 if found then return private.ride_command(p_leg,action,p_key); end if;
 -- Lock the same parent/service/provider/driver/leg sequence as the O16 command before checking the offer token.
 perform pg_advisory_xact_lock(hashtextextended(u::text||p_key::text,0));
 perform pg_advisory_xact_lock(hashtextextended('ride-passenger:'||r.passenger_id::text,0))
   from public.ride_legs l join public.rides r on r.id=l.ride_id where l.id=p_leg and r.booking_id is not null;
 perform b.id from public.ride_legs l join public.rides r on r.id=l.ride_id join public.bookings b on b.id=r.booking_id or b.id=l.next_booking_id
   where l.id=p_leg order by b.id for share of b;
 perform 1 from public.providers where id=u for update;
 perform 1 from public.ride_drivers where id=u for update;
 perform 1 from public.ride_legs where id=p_leg for update;
 if exists(select from private.ride_events where actor_id=u and operation_key=p_key) then return private.ride_command(p_leg,action,p_key); end if;
 if not exists(select from private.ride_driver_offers o join private.ride_dispatch_rounds r using(leg_id,generation)
   where o.driver_id=u and o.leg_id=p_leg and o.state='offered' and o.expires_at=p_expires and o.expires_at>statement_timestamp())
 then raise exception 'offer_unavailable'; end if;
 return private.ride_command(p_leg,action,p_key);
end $$;
revoke all on function public.driver_decide_offer(uuid,uuid,timestamptz,boolean) from public,anon;
grant execute on function public.driver_decide_offer(uuid,uuid,timestamptz,boolean) to authenticated;
