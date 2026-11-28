-- O17 stage 6 · PAR-606: a car with driver for a block of time, and a trip between
-- municipalities on an authorized corridor. Both are ordinary chargeable legs: the block and
-- the driver's empty return are components INSIDE the fare base (D14 commission applies to
-- them), the leg is completed once and earns once. Time or distance beyond the block is never
-- charged by itself: only an extension accepted by the payer and by the driver changes the
-- leg, through a new quote version, like a stage-1 amendment. A registered corridor can only
-- be sold with its frozen terms. Only simulation receives fictitious tariffs and a corridor.
create table private.ride_block_tariffs(
 id uuid primary key default gen_random_uuid(),environment text not null references private.ride_network(environment),
 area text not null check(length(trim(area)) between 1 and 120),code text not null check(code~'^[a-z0-9][a-z0-9_-]{0,23}$'),
 minutes int not null check(minutes between 60 and 720),included_km int not null check(included_km between 1 and 1000),
 block_cents int not null check(block_cents between 1 and 10000000),
 extra_15min_cents int not null check(extra_15min_cents between 0 and 1000000),
 extra_km_cents int not null check(extra_km_cents between 0 and 100000),
 evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160),valid_until timestamptz not null,
 unique(environment,area,code)
);
-- One row per direction. A row, enabled or not, marks the pair as intercity: from then on
-- the pair is never sold or assigned as a plain ride.
create table private.ride_intercity_corridors(
 environment text not null references private.ride_network(environment),
 origin text not null check(length(trim(origin)) between 1 and 120),destination text not null check(length(trim(destination)) between 1 and 120),
 origin_jurisdiction text not null check(length(trim(origin_jurisdiction)) between 1 and 120),
 destination_jurisdiction text not null check(length(trim(destination_jurisdiction)) between 1 and 120),
 authority_ref text not null check(length(trim(authority_ref)) between 1 and 160),
 coverage_ref text not null check(length(trim(coverage_ref)) between 1 and 160),
 empty_return_cents int not null check(empty_return_cents between 0 and 10000000),
 return_minutes int not null check(return_minutes between 0 and 720),
 valid_until timestamptz not null,enabled boolean not null default false,
 primary key(environment,origin,destination),check(origin<>destination and origin_jurisdiction<>destination_jurisdiction)
);
-- Terms frozen on the leg when it is created from a block or corridor quote. minutes is the
-- contracted block (the planned trip of an intercity leg); the extended_* totals only grow
-- when an extension is applied.
create table private.ride_leg_blocks(
 leg_id uuid primary key references public.ride_legs(id) on delete cascade,kind text not null check(kind in ('hourly','intercity')),
 tariff_id uuid references private.ride_block_tariffs(id),code text,minutes int not null check(minutes>0),
 included_km int not null default 0 check(included_km>=0),block_cents int not null default 0 check(block_cents>=0),
 extra_15min_cents int not null default 0 check(extra_15min_cents>=0),extra_km_cents int not null default 0 check(extra_km_cents>=0),
 return_cents int not null default 0 check(return_cents>=0),return_minutes int not null default 0 check(return_minutes between 0 and 720),
 authority_ref text,coverage_ref text,evidence_ref text,
 extended_minutes int not null default 0 check(extended_minutes>=0),extended_km int not null default 0 check(extended_km>=0),
 extension_cents int not null default 0 check(extension_cents>=0),
 quote_id uuid not null references private.ride_quotes(id),frozen_at timestamptz not null default now(),
 check((kind='hourly')=(tariff_id is not null))
);
-- operation_key is the proposer's idempotency key. cents is the price of the extension;
-- fee_cents and driver_cents are its D14 split, computed on the whole new fare base.
create table private.ride_block_extensions(
 id uuid primary key default gen_random_uuid(),leg_id uuid not null references public.ride_legs(id) on delete cascade,
 proposer uuid not null,proposer_role text not null check(proposer_role in ('passenger','payer','driver')),operation_key uuid not null,
 minutes int not null check(minutes between 0 and 660 and minutes%15=0),km int not null check(km between 0 and 500),
 cents int not null check(cents between 0 and 10000000),fee_cents int not null check(fee_cents>=0),driver_cents int not null check(driver_cents>=0),
 old_quote uuid not null references private.ride_quotes(id),new_quote uuid references private.ride_quotes(id),
 old_fare int not null,old_minutes int not null,driver_id uuid not null,required uuid[] not null,
 state text not null default 'pending' check(state in ('pending','applied','declined','expired')),
 outcome text check(outcome in ('accepted','declined','superseded')),
 created_at timestamptz not null default now(),expires_at timestamptz not null,closed_at timestamptz,
 unique(proposer,operation_key),check(minutes>0 or km>0),check(cents=fee_cents+driver_cents),
 check((state='pending')=(closed_at is null)),check((state='applied')=(new_quote is not null))
);
create unique index ride_one_pending_extension on private.ride_block_extensions(leg_id) where state='pending';
create index ride_block_extensions_leg on private.ride_block_extensions(leg_id,created_at);
create table private.ride_block_extension_decisions(
 extension_id uuid not null references private.ride_block_extensions(id) on delete cascade,actor_id uuid not null,
 accepted boolean not null,decided_at timestamptz not null default now(),primary key(extension_id,actor_id)
);
do $$ declare t text; begin
 foreach t in array array['ride_block_tariffs','ride_intercity_corridors','ride_leg_blocks','ride_block_extensions','ride_block_extension_decisions'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

-- Rehearsal fixtures only. The neighbouring town is fictitious and lies outside the market;
-- its approach rows state that the driver is back at the corridor origin after the paid return.
insert into private.ride_block_tariffs(environment,area,code,minutes,included_km,block_cents,extra_15min_cents,extra_km_cents,evidence_ref,valid_until)
 select 'simulation',a.area,b.code,b.minutes,b.km,b.cents,2000,300,'ficticio-o17-e6','infinity'::timestamptz
 from private.ride_market_areas a cross join (values('1h',60,20,9000),('3h',180,60,24000),('6h',360,120,42000)) b(code,minutes,km,cents)
 where a.environment='simulation';
insert into private.ride_routes(environment,origin,destination,meters,minutes)
 values('simulation','Saúde','Cidade vizinha de ensaio',38000,55) on conflict do nothing;
insert into private.ride_approach_routes(environment,origin_area,destination_area,minutes,reference,valid_until,meters)
 select r.environment,'Cidade vizinha de ensaio',r.destination_area,r.minutes,'ficticio-o17-e6','infinity'::timestamptz,r.meters
 from private.ride_approach_routes r where r.environment='simulation' and r.origin_area='Saúde' on conflict do nothing;
insert into private.ride_intercity_corridors(environment,origin,destination,origin_jurisdiction,destination_jurisdiction,authority_ref,coverage_ref,
  empty_return_cents,return_minutes,valid_until,enabled)
 values('simulation','Saúde','Cidade vizinha de ensaio','Município de ensaio A','Município de ensaio B','ficticio-o17-e6','ficticio-o17-e6',
  5200,55,'infinity',true);

-- The D14 gate of the quote path (the expression of freeze_passenger_class), on a whole fare base.
create function private.ride_block_fee(p_env text,p_origin text,p_destination text,p_base bigint,p_bps int) returns int
language sql stable security definer set search_path='' as $$
 select case when p_env='simulation' or (exists(select from private.ride_network where environment='live' and monetization_enabled)
   and private.ride_area_allowed('live',p_origin,'monetize') and private.ride_area_allowed('live',p_destination,'monetize'))
   then (p_base*p_bps/10000)::int else 0 end
$$;
create function private.ride_corridor_registered(p_env text,p_origin text,p_destination text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_intercity_corridors c where c.environment=p_env and c.origin=p_origin and c.destination=p_destination)
$$;
-- The enabled corridor valid now and through p_until; a null row when there is none.
create function private.ride_corridor(p_env text,p_origin text,p_destination text,p_until timestamptz) returns private.ride_intercity_corridors
language sql stable security definer set search_path='' as $$
 select c from private.ride_intercity_corridors c where c.environment=p_env and c.origin=p_origin and c.destination=p_destination
   and c.enabled and c.valid_until>=greatest(now(),p_until)
$$;

-- private.ride_requote_legs (stage 5) keeps the time of every leg and the fare of a
-- demand-priced one. A block replaces both, so the quote created in this transaction by its
-- own passenger is first re-timed and its price rules set aside, then the shared rewrite
-- validates the money, and last the rules return with the block or corridor terms.
create function private.ride_reprice_mode_quote(p_quote uuid,p_legs jsonb,p_rules jsonb) returns private.ride_quotes
language plpgsql security definer set search_path='' as $$
declare q private.ride_quotes; v_rules jsonb;
begin
 select * into q from private.ride_quotes where id=p_quote and environment=private.ride_env() for update;
 if not found or q.status<>'awaiting_consent' or q.created_at<>now() or q.actor_id is distinct from auth.uid() or q.booking_id is not null then
   raise exception 'quote_unavailable'; end if;
 if jsonb_typeof(p_legs) is distinct from 'array' or jsonb_array_length(p_legs)<>jsonb_array_length(q.legs) or jsonb_typeof(p_rules) is distinct from 'object'
   or exists(select from jsonb_array_elements(p_legs) x where coalesce((x->>'duration_minutes')::int,0) not between 1 and 720) then raise exception 'invalid_input'; end if;
 v_rules:=q.price_rules||p_rules;
 update private.ride_quotes set price_rules='{}',
   legs=(select jsonb_agg(o.l||jsonb_build_object('duration_minutes',p_legs->(o.n::int-1)->'duration_minutes') order by o.n)
         from jsonb_array_elements(q.legs) with ordinality o(l,n)) where id=q.id;
 q:=private.ride_requote_legs(q.id,p_legs,q.required_users);
 update private.ride_quotes set price_rules=v_rules where id=q.id returning * into q;
 return q;
end $$;

-- Blocks that can be quoted for a pickup in the area at that time; empty while the modality is closed.
create function public.ride_block_options(p_area text,p_at timestamptz) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_env text:=private.ride_env(); v_at timestamptz:=coalesce(p_at,now());
begin
 perform private.require_ride_feature('quote');
 if p_area is null or length(p_area)>120 then raise exception 'invalid_input'; end if;
 if v_at<now()-interval '2 minutes' or v_at>now()+interval '30 days' then return '[]'::jsonb; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('code',t.code,'minutes',t.minutes,'included_km',t.included_km,'block_cents',t.block_cents,
     'extra_15min_cents',t.extra_15min_cents,'extra_km_cents',t.extra_km_cents) order by t.minutes,t.code)
   from private.ride_block_tariffs t where t.environment=v_env and t.area=p_area and t.valid_until>=v_at+make_interval(mins=>t.minutes)
     and private.ride_modality_issue(v_env,'hourly',p_area,null,v_at+make_interval(mins=>t.minutes),v_at) is null),'[]'::jsonb);
end $$;

-- The plain quote validates itinerary, route and schedule; the block then replaces time and
-- price. Fare base = block + class surcharge of the route, no extras; fee by the D14 gate.
-- The price rule of the leg becomes the block's terms: waiting is inside the block.
create function public.ride_quote_block(p_key uuid,p_scheduled_at timestamptz,p_origin text,p_destination text,p_block text,p_route uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('quote'); v_env text; q private.ride_quotes; t private.ride_block_tariffs; tar private.ride_tariffs;
 e jsonb; v_request jsonb; v_pickup timestamptz; v_surcharge int:=0; v_fare int; v_fee int; v_id uuid;
begin
 perform singleton from private.ride_deployment for share;
 v_env:=private.ride_env();
 if p_key is null or p_origin is null or p_destination is null or p_block is null
   or length(p_origin)>120 or length(p_destination)>120 or length(p_block)>24 then raise exception 'invalid_input'; end if;
 v_request:=jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('origin',p_origin,'destination',p_destination,'payer','passenger','route_id',p_route)));
 perform 1 from public.profiles where id=v_uid for no key update;
 select * into q from private.ride_quotes where actor_id=v_uid and request_key=p_key;
 if found then
   if q.booking_id is not null or q.scheduled_at is distinct from p_scheduled_at or q.request_legs<>v_request
     or (q.legs->0->>'block') is distinct from p_block then raise exception 'idempotency_conflict'; end if;
   return private.ride_quote_view(q,v_uid);
 end if;
 v_pickup:=coalesce(p_scheduled_at,now());
 select * into t from private.ride_block_tariffs x where x.environment=v_env and x.area=p_origin and x.code=p_block
   and x.valid_until>=v_pickup+make_interval(mins=>x.minutes);
 if not found then raise exception 'ride_block_unavailable'; end if;
 v_id:=(public.ride_quote(p_key,null,p_scheduled_at,v_request)->>'id')::uuid;
 select * into strict q from private.ride_quotes where id=v_id;
 e:=q.legs->0;
 -- The block has to hold at least the direct trip to the final drop-off.
 if (e->>'duration_minutes')::int>t.minutes or (e->>'meters')::int>t.included_km*1000 then raise exception 'ride_block_unavailable'; end if;
 select * into strict tar from private.ride_tariffs where id=q.tariff_id;
 if e ? 'class_code' then
   select f.surcharge_cents into v_surcharge from private.ride_route_preferences f where f.route_id=(e->>'route_id')::uuid;
 end if;
 v_fare:=t.block_cents+coalesce(v_surcharge,0);
 v_fee:=private.ride_block_fee(v_env,e->>'origin',e->>'destination',v_fare::bigint,tar.commission_bps);
 e:=e||jsonb_build_object('duration_minutes',t.minutes,'route_minutes',(e->>'duration_minutes')::int,'fare_cents',v_fare,'limit_cents',v_fare,
   'fee_cents',v_fee,'driver_cents',v_fare-v_fee,'extras_cents',0,'block',t.code,'block_minutes',t.minutes,'included_km',t.included_km,
   'block_cents',t.block_cents,'extra_15min_cents',t.extra_15min_cents,'extra_km_cents',t.extra_km_cents);
 q:=private.ride_reprice_mode_quote(q.id,jsonb_build_array(e),jsonb_build_object(e->>'seq',jsonb_build_object('kind','hourly','block',t.code,
   'tariff_id',t.id,'base_cents',v_fare,'multiplier_bps',10000,'free_wait_minutes',t.minutes,'wait_cents_per_minute',0,
   'absence_policy','Bloco por hora: a espera está incluída no tempo contratado; excedente só com extensão aceita.',
   'minutes',t.minutes,'included_km',t.included_km,'block_cents',t.block_cents,'extra_15min_cents',t.extra_15min_cents,'extra_km_cents',t.extra_km_cents)));
 perform private.ride_attach_quote_mode(q.id,'hourly');
 return private.ride_quote_view(q,v_uid);
end $$;

-- A pair registered as a corridor is refused by the plain quote, whoever calls it (sponsored
-- and other wrappers included). The intercity flow calls the previous function directly.
alter function public.ride_quote(uuid,uuid,timestamptz,jsonb) rename to ride_quote_before_corridors;
alter function public.ride_quote_before_corridors(uuid,uuid,timestamptz,jsonb) set schema private;
create function public.ride_quote(p_key uuid,p_booking uuid,p_scheduled_at timestamptz,p_legs jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v jsonb:=private.ride_quote_before_corridors(p_key,p_booking,p_scheduled_at,p_legs);
begin
 if exists(select from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) e
    where q.id=(v->>'id')::uuid and not coalesce((e->>'intercity')::boolean,false)
      and private.ride_corridor_registered(q.environment,e->>'origin',e->>'destination')) then raise exception 'ride_corridor_unavailable'; end if;
 return v;
end $$;

create function public.ride_intercity_options() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_env text:=private.ride_env();
begin
 perform private.require_ride_feature('quote');
 return coalesce((select jsonb_agg(jsonb_build_object('origin',c.origin,'destination',c.destination,'origin_jurisdiction',c.origin_jurisdiction,
     'destination_jurisdiction',c.destination_jurisdiction,'empty_return_cents',c.empty_return_cents,'return_minutes',c.return_minutes,
     'valid_until',case when isfinite(c.valid_until) then c.valid_until end) order by c.origin,c.destination)
   from private.ride_intercity_corridors c where c.environment=v_env and c.enabled and c.valid_until>now()
     and private.ride_modality_issue(v_env,'intercity',c.origin,c.destination,now(),now()) is null),'[]'::jsonb);
end $$;

-- Every leg needs its own enabled corridor, valid through the end of the leg. The driver's
-- empty return is added to the fare base as a component shown apart.
create function public.ride_quote_intercity(p_key uuid,p_scheduled_at timestamptz,p_legs jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('quote'); v_env text; q private.ride_quotes; tar private.ride_tariffs; c private.ride_intercity_corridors;
 e jsonb; v_legs jsonb:='[]'; v_rules jsonb:='{}'; v_fare int; v_fee int; v_id uuid;
begin
 perform singleton from private.ride_deployment for share;
 v_env:=private.ride_env();
 if p_key is null or jsonb_typeof(p_legs) is distinct from 'array' or jsonb_array_length(p_legs) not between 1 and 4 then raise exception 'invalid_input'; end if;
 perform 1 from public.profiles where id=v_uid for no key update;
 select * into q from private.ride_quotes where actor_id=v_uid and request_key=p_key;
 if found then
   if q.booking_id is not null or q.scheduled_at is distinct from p_scheduled_at or q.request_legs<>p_legs
     or exists(select from jsonb_array_elements(q.legs) x where not coalesce((x->>'intercity')::boolean,false)) then raise exception 'idempotency_conflict'; end if;
   return private.ride_quote_view(q,v_uid);
 end if;
 if exists(select from jsonb_array_elements(p_legs) x where jsonb_typeof(x) is distinct from 'object'
      or (private.ride_corridor(v_env,x->>'origin',x->>'destination',now())).origin is null) then raise exception 'ride_corridor_unavailable'; end if;
 v_id:=(private.ride_quote_before_corridors(p_key,null,p_scheduled_at,p_legs)->>'id')::uuid;
 select * into strict q from private.ride_quotes where id=v_id;
 select * into strict tar from private.ride_tariffs where id=q.tariff_id;
 for e in select x.l from jsonb_array_elements(q.legs) with ordinality x(l,n) order by x.n loop
   c:=private.ride_corridor(v_env,e->>'origin',e->>'destination',(e->>'pickup_at')::timestamptz+make_interval(mins=>(e->>'duration_minutes')::int));
   if c.origin is null then raise exception 'ride_corridor_unavailable'; end if;
   v_fare:=(e->>'fare_cents')::int+c.empty_return_cents;
   v_fee:=private.ride_block_fee(v_env,c.origin,c.destination,(v_fare-(e->>'extras_cents')::int)::bigint,tar.commission_bps);
   v_legs:=v_legs||jsonb_build_array(e||jsonb_build_object('fare_cents',v_fare,'limit_cents',v_fare,'fee_cents',v_fee,'driver_cents',v_fare-v_fee,
     'intercity',true,'empty_return_cents',c.empty_return_cents,'return_minutes',c.return_minutes,
     'origin_jurisdiction',c.origin_jurisdiction,'destination_jurisdiction',c.destination_jurisdiction));
   if q.price_rules ? (e->>'seq') then
     v_rules:=v_rules||jsonb_build_object(e->>'seq',(q.price_rules->(e->>'seq'))
       ||jsonb_build_object('kind','intercity','empty_return_cents',c.empty_return_cents,'return_minutes',c.return_minutes));
   end if;
 end loop;
 q:=private.ride_reprice_mode_quote(q.id,v_legs,v_rules);
 perform private.ride_attach_quote_mode(q.id,'intercity');
 return private.ride_quote_view(q,v_uid);
end $$;

-- Where the obligation is born and whenever it is assigned, moved or started: the block
-- tariff must still be the quoted one through the end of the leg, and a leg on a registered
-- corridor needs its frozen terms and an enabled corridor valid through the end of the leg.
-- Cancelling and completing stay possible.
create function private.check_ride_block() returns trigger language plpgsql security definer set search_path='' as $$
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
 if found and b.kind='intercity' then
   if (private.ride_corridor(new.environment,new.origin,new.destination,upper(new.slot))).origin is null then raise exception 'ride_corridor_unavailable'; end if;
 elsif ((new.driver_id is not null and new.driver_id is distinct from old.driver_id) or new.slot is distinct from old.slot
     or new.origin is distinct from old.origin or new.destination is distinct from old.destination)
   and private.ride_corridor_registered(new.environment,new.origin,new.destination) then raise exception 'ride_corridor_unavailable';
 end if;
 return new;
end $$;
create trigger ride_block_when_requested before insert on public.ride_legs for each row execute function private.check_ride_block();
create trigger ride_block_when_travelling before update of status,driver_id,slot,pickup_at,origin,destination on public.ride_legs for each row
 when(new.status in ('requested','accepted','arriving','boarded') and (
   (new.driver_id is not null and new.driver_id is distinct from old.driver_id)
   or (new.status is distinct from old.status and new.status<>'requested')
   or new.slot is distinct from old.slot or new.pickup_at is distinct from old.pickup_at
   or new.origin is distinct from old.origin or new.destination is distinct from old.destination))
 execute function private.check_ride_block();
-- Named to run before the dispatch wave of the new leg, which already reads the frozen terms.
create function private.freeze_ride_block() returns trigger language plpgsql security definer set search_path='' as $$
declare e jsonb; v_quote uuid:=coalesce(new.source_quote_id,(select r.quote_id from public.rides r where r.id=new.ride_id));
begin
 select x into e from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) x
   where q.id=v_quote and (x->>'seq')::int=coalesce(new.quote_seq,new.seq);
 if coalesce(e ? 'block',false) then
   insert into private.ride_leg_blocks(leg_id,kind,tariff_id,code,minutes,included_km,block_cents,extra_15min_cents,extra_km_cents,evidence_ref,quote_id)
   select new.id,'hourly',t.id,t.code,t.minutes,t.included_km,t.block_cents,t.extra_15min_cents,t.extra_km_cents,t.evidence_ref,v_quote
   from private.ride_block_tariffs t where t.environment=new.environment and t.area=new.origin and t.code=e->>'block';
 elsif coalesce((e->>'intercity')::boolean,false) then
   insert into private.ride_leg_blocks(leg_id,kind,minutes,return_cents,return_minutes,authority_ref,coverage_ref,quote_id)
   select new.id,'intercity',new.duration_minutes,c.empty_return_cents,c.return_minutes,c.authority_ref,c.coverage_ref,v_quote
   from private.ride_intercity_corridors c where c.environment=new.environment and c.origin=new.origin and c.destination=new.destination;
 end if;
 return null;
end $$;
create trigger a_ride_freeze_block after insert on public.ride_legs for each row execute function private.freeze_ride_block();

-- The driver's calendar covers the empty return. Accept, a reserve shift and any other
-- writer set driver_slot from the approach plan, which ends with the passenger's trip: a
-- newly written value gets the return added (a late arrival included), and the calendar
-- never ends before the end of the leg plus the return, so a value written back unchanged
-- is not extended twice. Named to run before the checks that read driver_slot.
create function private.extend_ride_block_return() returns trigger language plpgsql security definer set search_path='' as $$
declare v_return int; v_end timestamptz:=upper(new.driver_slot);
begin
 select b.return_minutes into v_return from private.ride_leg_blocks b where b.leg_id=new.id and b.return_minutes>0;
 if not found then return new; end if;
 if new.driver_slot is distinct from old.driver_slot then v_end:=v_end+make_interval(mins=>v_return); end if;
 v_end:=greatest(v_end,upper(new.slot)+make_interval(mins=>v_return));
 if v_end<>upper(new.driver_slot) then new.driver_slot:=tstzrange(lower(new.driver_slot),v_end,'[)'); end if;
 return new;
end $$;
create trigger a_ride_block_return before update on public.ride_legs for each row
 when(new.driver_slot is not null) execute function private.extend_ride_block_return();

-- Why this driver cannot take the leg under its block terms; null when nothing prevents it.
create function private.ride_block_issue(l public.ride_legs,p_driver uuid) returns text
language plpgsql stable security definer set search_path='' as $$
declare b private.ride_leg_blocks; v_plan tstzrange; v_busy tstzrange;
begin
 select * into b from private.ride_leg_blocks where leg_id=l.id;
 if not found then
   return case when private.ride_corridor_registered(l.environment,l.origin,l.destination) then 'ride_corridor_unavailable' end;
 end if;
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
alter function private.ride_offer_eligible(uuid,public.ride_legs) rename to ride_before_blocks_eligible;
create function private.ride_offer_eligible(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select private.ride_before_blocks_eligible(p_driver,l) and private.ride_block_issue(l,p_driver) is null
$$;

-- A stage-1 route amendment reprices by the metered tariff, which would drop the block or the
-- empty return. A block or corridor leg is not amended, and no leg is amended onto a corridor.
create function private.check_ride_block_amendment() returns trigger language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; c private.ride_route_cases; v_kind text;
begin
 select kind into v_kind from private.ride_leg_blocks where leg_id=new.leg_id;
 if found then raise exception '%',case v_kind when 'hourly' then 'ride_block_unavailable' else 'ride_corridor_unavailable' end; end if;
 select * into l from public.ride_legs where id=new.leg_id;
 select * into c from private.ride_route_cases where id=new.route_id;
 if l.id is not null and c.id is not null and (private.ride_corridor_registered(l.environment,c.origin_area,c.destination_area)
    or private.ride_corridor_registered(l.environment,l.origin,c.destination_area)) then raise exception 'ride_corridor_unavailable'; end if;
 return new;
end $$;
create trigger ride_block_amendment before insert on private.ride_amendments for each row execute function private.check_ride_block_amendment();

-- Why the hourly leg cannot be extended by p_minutes; null when it can. Zero minutes checks
-- the state, the price terms and the payment order only.
create function private.ride_extension_issue(l public.ride_legs,p_minutes int) returns text
language plpgsql stable security definer set search_path='' as $$
declare b private.ride_leg_blocks; o private.ride_payment_orders; c public.ride_legs:=l;
 v_end timestamptz:=upper(l.slot)+make_interval(mins=>coalesce(p_minutes,0)); v_busy tstzrange;
begin
 select * into b from private.ride_leg_blocks where leg_id=l.id and kind='hourly';
 if not found or p_minutes is null or p_minutes<0 or l.environment<>private.ride_env() or l.status not in ('accepted','arriving','boarded')
   or l.driver_id is null or l.duration_minutes+p_minutes>720 or exists(select from private.ride_financial_accounts where leg_id=l.id)
   or not exists(select from private.ride_block_tariffs t where t.id=b.tariff_id and t.valid_until>=v_end) then return 'ride_extension_unavailable'; end if;
 -- Stage 4 only reprices an untouched fare order of the original payer.
 if exists(select from private.ride_order_plans p where p.leg_id=l.id) then
   select * into o from private.ride_payment_orders where leg_id=l.id and payer=l.payer_id and component='fare';
   if not found or o.status<>'open' or o.received_cents<>0 or exists(select from private.ride_order_psp where order_id=o.id)
     or exists(select from private.ride_order_plans p where p.leg_id=l.id and p.original_payer<>l.payer_id)
     or exists(select from private.ride_payment_orders x where x.leg_id=l.id and x.id<>o.id and x.status<>'cancelled')
     or exists(select from private.ride_share_invites i where i.source_order=o.id and i.status='pending' and i.expires_at>now())
   then return 'ride_extension_unavailable'; end if;
 end if;
 if p_minutes>0 then
   c.duration_minutes:=l.duration_minutes+p_minutes; c.slot:=tstzrange(lower(l.slot),v_end,'[)');
   if private.ride_leg_mode_issue(c) is not null
     or exists(select from public.ride_legs x where x.ride_id=l.ride_id and x.id<>l.id and x.seq>l.seq and x.status not in ('completed','cancelled')
          and lower(x.slot)<v_end) then return 'ride_extension_unavailable'; end if;
   v_busy:=tstzrange(upper(coalesce(l.driver_slot,l.slot)),upper(coalesce(l.driver_slot,l.slot))+make_interval(mins=>p_minutes),'[)');
   if exists(select from public.ride_legs x where x.driver_id=l.driver_id and x.id<>l.id and x.status in ('accepted','arriving','boarded','unknown')
        and coalesce(x.driver_slot,x.slot) && v_busy)
     or exists(select from public.bookings k where k.provider_id=l.driver_id and k.status in ('requested','accepted','paid','in_progress') and k.period && v_busy)
     or exists(select from public.shifts s where s.provider_id=l.driver_id and s.status in ('assigned','checked_in') and s.period && v_busy)
     or (l.environment='live' and not exists(select from private.ride_driver_shifts s where s.driver_id=l.driver_id
          and s.period @> (coalesce(l.driver_slot,l.slot)+v_busy))) then return 'ride_extension_unavailable'; end if;
 end if;
 return null;
end $$;

-- The passenger, the payer or the assigned driver proposes more time (multiples of 15
-- minutes) or more kilometres at the frozen prices of the block. Nothing changes yet.
create function public.ride_propose_extension(p_leg uuid,p_minutes int,p_km int,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=private.require_ride_feature('quote'); l public.ride_legs; r public.rides; b private.ride_leg_blocks; e private.ride_block_extensions;
 tar private.ride_tariffs; v_role text; v_cents bigint; v_fee int; v_issue text;
begin
 if p_leg is null or p_key is null or p_minutes is null or p_km is null then raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_uid::text||p_key::text,0));
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
 if not found then raise exception 'not_allowed'; end if;
 select * into strict r from public.rides where id=l.ride_id;
 v_role:=case when v_uid=r.passenger_id then 'passenger' when v_uid=l.payer_id then 'payer' when l.driver_id is not distinct from v_uid then 'driver' end;
 if v_role is null then raise exception 'not_allowed'; end if;
 select * into e from private.ride_block_extensions where proposer=v_uid and operation_key=p_key;
 if found then
   if (e.leg_id,e.minutes,e.km) is distinct from (p_leg,p_minutes,p_km) then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('id',e.id,'state',e.state,'minutes',e.minutes,'km',e.km,'cents',e.cents,'expires_at',e.expires_at,'replayed',true);
 end if;
 if p_minutes<0 or p_minutes%15<>0 or p_minutes>660 or p_km not between 0 and 500 or (p_minutes=0 and p_km=0) then raise exception 'invalid_input'; end if;
 if (select count(*) from private.ride_block_extensions x where x.leg_id=l.id and x.proposer=v_uid and x.created_at>now()-interval '1 hour')>=12 then
   raise exception 'rate_limited'; end if;
 v_issue:=private.ride_extension_issue(l,p_minutes);
 if v_issue is not null then raise exception '%',v_issue; end if;
 select * into strict b from private.ride_leg_blocks where leg_id=l.id;
 select * into strict tar from private.ride_tariffs where id=l.tariff_id;
 v_cents:=(p_minutes/15)::bigint*b.extra_15min_cents+p_km::bigint*b.extra_km_cents;
 if v_cents>10000000 then raise exception 'invalid_input'; end if;
 -- Commission on the whole new base, truncated once; an unmonetized leg stays unmonetized.
 v_fee:=case when l.fee_cents>0 then greatest(l.fee_cents,((l.fare_cents-l.extras_cents+v_cents)*tar.commission_bps/10000)::int)-l.fee_cents else 0 end;
 v_fee:=least(v_fee,v_cents::int);
 update private.ride_block_extensions set state='expired',outcome='superseded',closed_at=clock_timestamp() where leg_id=l.id and state='pending';
 insert into private.ride_block_extensions(leg_id,proposer,proposer_role,operation_key,minutes,km,cents,fee_cents,driver_cents,old_quote,old_fare,old_minutes,
   driver_id,required,expires_at)
 values(l.id,v_uid,v_role,p_key,p_minutes,p_km,v_cents::int,v_fee,v_cents::int-v_fee,coalesce(l.source_quote_id,r.quote_id),l.fare_cents,l.duration_minutes,
   l.driver_id,array(select distinct u from unnest(array[l.payer_id,l.driver_id]) u),now()+interval '10 minutes') returning * into e;
 return jsonb_build_object('id',e.id,'state',e.state,'minutes',e.minutes,'km',e.km,'cents',e.cents,'expires_at',e.expires_at,'replayed',false);
end $$;

-- Applies an extension every required party accepted. A new quote version carries the
-- consents, as a stage-1 amendment does, and the same leg is updated: nothing is charged
-- twice and completion still earns the final fare once. The caller holds the leg.
create function private.ride_apply_extension(p_extension uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e private.ride_block_extensions; l public.ride_legs; r public.rides; b private.ride_leg_blocks; q private.ride_quotes;
 entry jsonb; v_issue text; v_quote uuid; v_fare int; v_fee int; v_minutes int; v_slot tstzrange; v_driver_slot tstzrange; v_seq text;
begin
 perform private.require_ride_feature('dispatch');
 select * into strict e from private.ride_block_extensions where id=p_extension for update;
 select * into strict l from public.ride_legs where id=e.leg_id for update;
 select * into strict r from public.rides where id=l.ride_id;
 v_issue:=private.ride_extension_issue(l,e.minutes);
 if v_issue is not null then raise exception '%',v_issue; end if;
 select * into strict b from private.ride_leg_blocks where leg_id=l.id for update;
 select * into strict q from private.ride_quotes where id=coalesce(l.source_quote_id,r.quote_id);
 v_seq:=coalesce(l.quote_seq,l.seq)::text;
 select value into entry from jsonb_array_elements(q.legs) where value->>'seq'=v_seq;
 if entry is null then raise exception 'requote_required'; end if;
 v_fare:=l.fare_cents+e.cents; v_fee:=l.fee_cents+e.fee_cents; v_minutes:=l.duration_minutes+e.minutes;
 v_slot:=tstzrange(lower(l.slot),upper(l.slot)+make_interval(mins=>e.minutes),'[)');
 if l.driver_slot is not null then
   v_driver_slot:=tstzrange(lower(l.driver_slot),upper(l.driver_slot)+make_interval(mins=>e.minutes-b.return_minutes),'[)');
 end if;
 entry:=entry||jsonb_build_object('seq',1,'payer_id',l.payer_id,'fare_cents',v_fare,'limit_cents',v_fare,'fee_cents',v_fee,'driver_cents',v_fare-v_fee,
   'extended_minutes',b.extended_minutes+e.minutes,'extended_km',b.extended_km+e.km,'extension_cents',b.extension_cents+e.cents);
 -- Inserted with the route's own time, so the rehearsal meeting-point snapshot follows the
 -- new version through its own trigger; the agreed total time is written right after.
 insert into private.ride_quotes(environment,actor_id,request_key,booking_id,passenger_id,client_id,scheduled_at,request_legs,legs,
   required_users,tariff_id,expires_at,status,total_cents,existing_ride_id,price_rules)
 values(l.environment,q.passenger_id,gen_random_uuid(),q.booking_id,q.passenger_id,q.client_id,q.scheduled_at,'[]',
   jsonb_build_array(entry||jsonb_build_object('duration_minutes',coalesce((entry->>'route_minutes')::int,(entry->>'duration_minutes')::int))),
   array(select distinct u from unnest(array[q.passenger_id,l.payer_id]) u where u is not null),l.tariff_id,e.expires_at,'requested',v_fare,l.ride_id,
   case when q.price_rules ? v_seq then jsonb_build_object('1',(q.price_rules->v_seq)||jsonb_build_object('base_cents',v_fare-l.extras_cents,
     'free_wait_minutes',v_minutes,'extended_minutes',b.extended_minutes+e.minutes,'extended_km',b.extended_km+e.km)) else '{}'::jsonb end)
 returning id into v_quote;
 update private.ride_quotes set legs=jsonb_build_array(entry||jsonb_build_object('duration_minutes',v_minutes)) where id=v_quote;
 insert into private.ride_consents(quote_id,actor_id,accepted,at)
 select v_quote,d.actor_id,true,d.decided_at from private.ride_block_extension_decisions d where d.extension_id=e.id and d.accepted;
 insert into private.ride_service_windows select v_quote,booking_id,period,binding from private.ride_service_windows where quote_id=q.id;
 begin
   update public.ride_legs set duration_minutes=v_minutes,slot=v_slot,driver_slot=v_driver_slot,fare_cents=v_fare,fee_cents=v_fee,
     driver_cents=v_fare-v_fee,source_quote_id=v_quote,quote_seq=1,updated_at=now() where id=l.id;
 exception when exclusion_violation then raise exception 'ride_extension_unavailable';
 end;
 update private.ride_route_points set delete_by=greatest(delete_by,upper(v_slot)+interval '24 hours') where route_id=l.route_case_id;
 update private.ride_leg_blocks set extended_minutes=extended_minutes+e.minutes,extended_km=extended_km+e.km,extension_cents=extension_cents+e.cents
   where leg_id=l.id;
 update private.ride_block_extensions set state='applied',outcome='accepted',new_quote=v_quote,closed_at=clock_timestamp() where id=e.id;
end $$;

-- The payer and the driver both have to accept. A refusal closes the proposal and changes
-- nothing; the same answer repeated returns the same state.
create function public.ride_decide_extension(p_extension uuid,p_accept boolean) returns text
language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); e private.ride_block_extensions; l public.ride_legs; r public.rides; v_prior boolean; v_stale boolean;
begin
 if not private.ride_active_user(v_uid) then raise exception 'not_allowed'; end if;
 if p_extension is null or p_accept is null then raise exception 'invalid_input'; end if;
 select * into e from private.ride_block_extensions where id=p_extension and v_uid=any(required);
 if not found then raise exception 'not_allowed'; end if;
 select * into l from public.ride_legs where id=e.leg_id and environment=private.ride_env();
 if not found then raise exception 'not_allowed'; end if;
 -- Provider and driver before the leg, as assignment and amendments do.
 perform 1 from public.providers where id=e.driver_id for no key update;
 perform 1 from public.ride_drivers where id=e.driver_id for update;
 select * into strict l from public.ride_legs where id=l.id for update;
 select * into strict e from private.ride_block_extensions where id=e.id for update;
 select * into strict r from public.rides where id=l.ride_id;
 select d.accepted into v_prior from private.ride_block_extension_decisions d where d.extension_id=e.id and d.actor_id=v_uid;
 if e.state<>'pending' then
   if v_prior is distinct from p_accept then raise exception 'ride_extension_unavailable'; end if;
   return e.state;
 end if;
 v_stale:=e.expires_at<=now() or l.status not in ('accepted','arriving','boarded') or l.driver_id is distinct from e.driver_id
   or l.fare_cents<>e.old_fare or l.duration_minutes<>e.old_minutes or coalesce(l.source_quote_id,r.quote_id)<>e.old_quote
   or exists(select from unnest(e.required) u where not private.ride_active_user(u));
 if p_accept and v_stale then raise exception 'ride_extension_unavailable'; end if;
 insert into private.ride_block_extension_decisions(extension_id,actor_id,accepted) values(e.id,v_uid,p_accept)
 on conflict(extension_id,actor_id) do update set accepted=excluded.accepted,decided_at=now()
   where private.ride_block_extension_decisions.accepted is distinct from excluded.accepted;
 if not p_accept then
   update private.ride_block_extensions set state='declined',outcome='declined',closed_at=clock_timestamp() where id=e.id;
   return 'declined';
 end if;
 if exists(select from unnest(e.required) u where not exists(select from private.ride_block_extension_decisions d
      where d.extension_id=e.id and d.actor_id=u and d.accepted)) then return 'pending'; end if;
 perform private.ride_apply_extension(e.id);
 return 'applied';
end $$;

-- Null for a leg that is not an hourly block. Read by the passenger, the payer and the assigned driver.
create function public.ride_block_state(p_leg uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); l public.ride_legs; r public.rides; b private.ride_leg_blocks;
begin
 if not private.ride_active_user(v_uid) then raise exception 'not_allowed'; end if;
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env();
 if not found then raise exception 'not_allowed'; end if;
 select * into strict r from public.rides where id=l.ride_id;
 if not (v_uid=r.passenger_id or v_uid=l.payer_id or l.driver_id is not distinct from v_uid) then raise exception 'not_allowed'; end if;
 select * into b from private.ride_leg_blocks where leg_id=l.id and kind='hourly';
 if not found then return null; end if;
 return jsonb_build_object('code',b.code,'minutes',b.minutes,'included_km',b.included_km,'extra_15min_cents',b.extra_15min_cents,
  'extra_km_cents',b.extra_km_cents,'extended_minutes',b.extended_minutes,'extended_km',b.extended_km,'extension_cents',b.extension_cents,
  'ends_at',upper(l.slot),'can_propose',private.ride_extension_issue(l,0) is null,
  'extensions',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'minutes',x.minutes,'km',x.km,'cents',x.cents,'state',x.shown,
      'expires_at',x.expires_at,'created_at',x.created_at,'proposed_by_me',coalesce(x.proposer=v_uid,false),'may_decide',x.shown='pending' and v_uid=any(x.required),
      'accepted_by_me',exists(select from private.ride_block_extension_decisions d where d.extension_id=x.id and d.actor_id=v_uid and d.accepted))
      order by x.created_at desc,x.id)
    from (select e.*,case when e.state='pending' and (e.expires_at<=now() or l.status not in ('accepted','arriving','boarded')
        or l.driver_id is distinct from e.driver_id or l.fare_cents<>e.old_fare or l.duration_minutes<>e.old_minutes) then 'expired' else e.state end as shown
      from private.ride_block_extensions e where e.leg_id=l.id order by e.created_at desc,e.id limit 20) x),'[]'::jsonb));
end $$;

-- The hook public.driver_mode_tasks() looks up by name: proposals still waiting for this driver's answer.
create function private.ride_driver_extension_tasks(p_driver uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'leg_id',e.leg_id,'origin',l.origin,'destination',l.destination,'minutes',e.minutes,'km',e.km,
   'cents',e.cents,'driver_cents',e.driver_cents,'expires_at',e.expires_at) order by e.expires_at,e.id),'[]'::jsonb)
 from private.ride_block_extensions e join public.ride_legs l on l.id=e.leg_id
 where e.state='pending' and e.expires_at>now() and e.driver_id=p_driver and p_driver=any(e.required) and l.driver_id=p_driver
   and l.environment=private.ride_env() and l.status in ('accepted','arriving','boarded') and l.fare_cents=e.old_fare and l.duration_minutes=e.old_minutes
   and not exists(select from private.ride_block_extension_decisions d where d.extension_id=e.id and d.actor_id=p_driver)
$$;

revoke all on function private.ride_block_fee(text,text,text,bigint,int),private.ride_corridor_registered(text,text,text),
 private.ride_corridor(text,text,text,timestamptz),private.ride_reprice_mode_quote(uuid,jsonb,jsonb),
 private.ride_quote_before_corridors(uuid,uuid,timestamptz,jsonb),private.check_ride_block(),private.freeze_ride_block(),
 private.extend_ride_block_return(),private.ride_block_issue(public.ride_legs,uuid),private.ride_before_blocks_eligible(uuid,public.ride_legs),
 private.ride_offer_eligible(uuid,public.ride_legs),private.check_ride_block_amendment(),private.ride_extension_issue(public.ride_legs,int),
 private.ride_apply_extension(uuid),private.ride_driver_extension_tasks(uuid) from public,anon,authenticated,service_role;
revoke all on function public.ride_block_options(text,timestamptz),public.ride_quote_block(uuid,timestamptz,text,text,text,uuid),
 public.ride_intercity_options(),public.ride_quote_intercity(uuid,timestamptz,jsonb),public.ride_propose_extension(uuid,int,int,uuid),
 public.ride_decide_extension(uuid,boolean),public.ride_block_state(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ride_block_options(text,timestamptz),public.ride_quote_block(uuid,timestamptz,text,text,text,uuid),
 public.ride_intercity_options(),public.ride_quote_intercity(uuid,timestamptz,jsonb),public.ride_propose_extension(uuid,int,int,uuid),
 public.ride_decide_extension(uuid,boolean),public.ride_block_state(uuid) to authenticated;
-- The plain quote keeps the grants it had in stage 1.
revoke all on function public.ride_quote(uuid,uuid,timestamptz,jsonb) from public,anon;
grant execute on function public.ride_quote(uuid,uuid,timestamptz,jsonb) to authenticated;
