-- Each marketed class has a local policy and documented vehicle capacity.
-- No live class, driver validation, contact sender or deadline is pre-approved.
create table private.ride_class_policies(
 environment text not null references private.ride_network(environment),area text not null,code text not null,
 label text not null, surcharge_cents int not null check(surcharge_cents between 0 and 100000),
 seats smallint not null check(seats between 1 and 12),tools boolean not null default false,accessible boolean not null default false,
 valid_until timestamptz not null,evidence_ref text not null,primary key(environment,area,code)
);
create table private.ride_vehicle_capacity(
 driver_id uuid primary key references public.ride_drivers(id) on delete cascade,
 vehicle text not null, document_ref text not null, seats smallint not null check(seats between 1 and 12),
 tools boolean not null default false,accessible boolean not null default false,valid_until timestamptz not null
);
create table private.ride_route_preferences(
 route_id uuid primary key references private.ride_route_cases(id) on delete cascade,class_code text not null,
 label text not null,surcharge_cents integer not null,seats smallint not null,tools boolean not null,accessible boolean not null,
 class_until timestamptz not null
);
create function private.ride_qualified_capacity(p_driver uuid,p_from timestamptz,p_until timestamptz,p_seats integer,p_tools boolean,p_access boolean)
returns boolean language sql stable set search_path='' as $$
 select exists(select from private.ride_vehicle_capacity v join public.ride_drivers d on d.id=v.driver_id and d.vehicle=v.vehicle
 where v.driver_id=p_driver and private.ride_driver_valid(d.id,(p_until at time zone 'America/Sao_Paulo')::date)
 and private.ride_active_user(d.id) and v.valid_until>=p_until and v.seats>=p_seats
 and (not p_tools or v.tools) and (not p_access or v.accessible)
 and (d.environment='simulation' or exists(select from private.ride_driver_credentials c where c.driver_id=d.id and c.vehicle_identifier=v.document_ref)))
$$;
create function private.ride_capacity_estimate(c private.ride_route_cases,depart timestamptz,seats int,tools boolean,accessible boolean) returns integer
language sql stable set search_path='' as $$
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
 select min(d.minutes) from candidates d
 where d.period @> d.occupied and private.ride_qualified_capacity(d.id,lower(d.occupied),upper(d.occupied),seats,tools,accessible)
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
create function public.ride_class_options(p_route uuid,p_departure timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.require_ride_feature('quote');c private.ride_route_cases;t private.ride_tariffs;depart timestamptz:=coalesce(p_departure,now());
begin
 select * into c from private.ride_route_cases where id=p_route and p_route is not null and environment=private.ride_env()
 and u in(passenger_id,client_id) and status='verified' and valid_until>now();
 if not found then raise exception 'route_unavailable'; end if;
 select * into t from private.ride_tariffs where environment=c.environment and valid_from<=now() order by valid_from desc limit 1;
 if not found then return '[]'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('code',a.code,'label',a.label,'seats',a.seats,'tools',a.tools,'accessible',a.accessible,
 'fare_cents',greatest(t.minimum_cents,t.base_cents+round(c.meters::numeric*t.km_cents/1000)::int+c.minutes*t.minute_cents)+a.surcharge_cents,
 'available',eta.minutes is not null,'approach_minutes',case when u=c.passenger_id then eta.minutes end,
 'duration_minutes',case when u=c.passenger_id then c.minutes end,
 'observed_at',now()) order by a.surcharge_cents,a.code),'[]') from private.ride_class_policies a
 cross join lateral(select private.ride_capacity_estimate(c,depart,a.seats,a.tools,a.accessible) as minutes) eta
 where a.environment=c.environment and a.area=c.origin_area and a.valid_until>=depart+make_interval(mins=>c.minutes));
end $$;
create function public.ride_choose_class(p_route uuid,p_code text,p_departure timestamptz default null) returns void
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
 if not found or private.ride_capacity_estimate(c,depart,opt.seats,opt.tools,opt.accessible) is null then raise exception 'offer_unavailable'; end if;
 insert into private.ride_route_preferences values(c.id,opt.code,opt.label,opt.surcharge_cents,opt.seats,opt.tools,opt.accessible,opt.valid_until)
 on conflict(route_id) do update set class_code=excluded.class_code,label=excluded.label,surcharge_cents=excluded.surcharge_cents,seats=excluded.seats,tools=excluded.tools,
 accessible=excluded.accessible,class_until=excluded.class_until;
end $$;
create function private.freeze_passenger_class() returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb;out_legs jsonb:='[]';c private.ride_route_cases;f private.ride_route_preferences;t private.ride_tariffs;
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
       if not exists(select from private.ride_class_policies a where a.environment=c.environment and a.area=c.origin_area and a.code=f.class_code
          and (a.seats,a.tools,a.accessible,a.surcharge_cents)=(f.seats,f.tools,f.accessible,f.surcharge_cents)
          and least(a.valid_until,f.class_until)>=depart+make_interval(mins=>c.minutes)) then raise exception 'requote_required'; end if;
       est:=private.ride_capacity_estimate(c,depart,f.seats,f.tools,f.accessible);
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
create trigger ride_01_passenger_class_price before insert on private.ride_quotes for each row
 when(new.status='awaiting_consent') execute function private.freeze_passenger_class();
alter function private.ride_offer_eligible(uuid,public.ride_legs) rename to ride_offer_before_capacity;
create function private.ride_offer_eligible(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select private.ride_offer_before_capacity(p_driver,l) and not exists(
   select from private.ride_route_preferences f
   cross join lateral private.ride_approach_plan(p_driver,l) plan
   where f.route_id=l.route_case_id and (f.class_until<upper(plan.driver_slot)
    or not private.ride_qualified_capacity(p_driver,lower(plan.driver_slot),upper(plan.driver_slot),f.seats,f.tools,f.accessible)
    or not exists(select from private.ride_class_policies a where a.environment=l.environment and a.area=l.origin
      and a.code=f.class_code and a.valid_until>=upper(plan.driver_slot) and (a.seats,a.tools,a.accessible)=(f.seats,f.tools,f.accessible))))
$$;
-- Recheck the accepted equipment, even when the driver or a credential changed
-- after quoting. Cancelling, reporting an incident and completing a boarded
-- trip remain available when the inspection expires.
create function private.require_ride_class_capacity() returns trigger language plpgsql security definer set search_path='' as $$
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
    and a.code=f.class_code and least(a.valid_until,f.class_until)>=horizon and (a.seats,a.tools,a.accessible)=(f.seats,f.tools,f.accessible))
   or (new.driver_id is not null and not private.ride_qualified_capacity(new.driver_id,lower(new.slot),horizon,f.seats,f.tools,f.accessible))
 then raise exception 'ride_capacity_changed'; end if;
 return new;
end $$;
create trigger ride_class_when_requested before insert on public.ride_legs for each row when (new.status='requested')
 execute function private.require_ride_class_capacity();
create trigger ride_class_when_travelling before update of status,driver_slot on public.ride_legs for each row
 when (new.status in ('accepted','arriving','boarded')) execute function private.require_ride_class_capacity();
revoke all on function private.require_ride_class_capacity() from public,anon,authenticated,service_role;
-- The service client can authorize a price without learning the approach to
-- the passenger's private point. The server still retains the frozen estimate.
alter function private.ride_quote_view(private.ride_quotes,uuid) rename to ride_quote_view_base;
create function private.ride_quote_view(q private.ride_quotes,p_uid uuid) returns jsonb language sql stable set search_path='' as $$
 select case when p_uid=q.passenger_id then v.data else jsonb_set(v.data,'{legs}',
   coalesce((select jsonb_agg(l-'approach_minutes'-'eta_observed_at' order by n)
     from jsonb_array_elements(v.data->'legs') with ordinality e(l,n)),'[]')) end
 from (select private.ride_quote_view_base(q,p_uid) as data) v
$$;
revoke all on function private.ride_quote_view(private.ride_quotes,uuid) from public,anon,authenticated,service_role;
-- In-app notifications are always visible to their owner. Forwarding to a
-- verified contact requires an explicit choice and a released template/channel.
create table private.ride_passenger_contact(
 environment text primary key references private.ride_network(environment),external_enabled boolean not null default false
);
insert into private.ride_passenger_contact(environment) values('simulation'),('live');
create table private.ride_notice_preferences(owner_id uuid primary key references public.profiles(id) on delete cascade,forward_updates boolean not null);
create table private.ride_passenger_notices(
 leg_id uuid not null references public.ride_legs(id),owner_id uuid not null references public.profiles(id) on delete cascade,
 event text not null,created_at timestamptz not null default now(),primary key(leg_id,owner_id,event)
);
create function private.emit_ride_notice(l public.ride_legs,p_event text) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid;
begin
 for uid in select distinct id from (select passenger_id as id from public.rides where id=l.ride_id union select l.payer_id) t
 where private.ride_active_user(id) loop
   insert into private.ride_passenger_notices values(l.id,uid,p_event,now()) on conflict do nothing;
   if found and exists(select from private.ride_notice_preferences where owner_id=uid and forward_updates)
     and exists(select from private.ride_passenger_contact where environment=l.environment and external_enabled) then
     perform private.notify(uid,'atualizacao_corrida','{}');
   end if;
 end loop;
end $$;
create function private.notice_ride_transition() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or old.status<>new.status then perform private.emit_ride_notice(new,new.status); end if;
 return null;
end $$;
create trigger ride_passenger_state after insert or update of status on public.ride_legs for each row execute function private.notice_ride_transition();
create function private.ride_reservation_check() returns integer language plpgsql security definer set search_path='' as $$
declare l public.ride_legs;n int:=0;
begin
 for l in select x.* from public.ride_legs x where x.status in ('requested','accepted') and x.pickup_at<=now()+interval '30 minutes'
   and x.pickup_at>now()-interval '1 day' and not exists(select from private.ride_passenger_notices a where a.leg_id=x.id and a.event=
     case when x.status='accepted' then 'reminder' when x.pickup_at+interval '10 minutes'<=now() then 'no_supply' else 'searching' end)
   order by x.pickup_at limit 300 for update skip locked loop
   if l.status='requested' and l.pickup_at+interval '10 minutes'<=now() then
     perform private.emit_ride_notice(l,'no_supply');
     update public.ride_legs set status='cancelled',updated_at=now() where id=l.id and driver_id is null;
     if found then
       perform private.audit('ride.dispatch_deadline','ride_legs',l.id::text,jsonb_build_object('source','scheduler','from','requested','to','cancelled'));
     end if;
   else perform private.emit_ride_notice(l,case when l.status='accepted' then 'reminder' else 'searching' end); end if;
   n:=n+1;
 end loop;return n;
end $$;
select cron.schedule('workeasy-ride-reservation-check','* * * * *','select private.ride_reservation_check()');
create function public.ride_passenger_updates(p_forward boolean default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();available boolean;
begin
 if not private.ride_active_user(u) then raise exception 'not_allowed'; end if;
 select external_enabled into available from private.ride_passenger_contact where environment=private.ride_env();
 if p_forward is not null then
   if p_forward and not available then raise exception 'ride_feature_disabled'; end if;
   insert into private.ride_notice_preferences values(u,p_forward) on conflict(owner_id) do update set forward_updates=excluded.forward_updates;
 end if;
 return jsonb_build_object('external_available',available,'forward',coalesce((select forward_updates from private.ride_notice_preferences where owner_id=u),false),
 'items',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc) from(select a.leg_id,a.event,a.created_at,l.seq,l.pickup_at,
   l.pickup_at+interval '10 minutes' as search_deadline
   from private.ride_passenger_notices a join public.ride_legs l on l.id=a.leg_id
   where a.owner_id=u and l.environment=private.ride_env() order by a.created_at desc limit 40)t),'[]'));
end $$;
revoke all on private.ride_class_policies,private.ride_vehicle_capacity,private.ride_route_preferences,private.ride_passenger_contact,
 private.ride_notice_preferences,private.ride_passenger_notices from public,anon,authenticated,service_role;
revoke all on function private.ride_qualified_capacity(uuid,timestamptz,timestamptz,int,boolean,boolean),
 private.ride_capacity_estimate(private.ride_route_cases,timestamptz,int,boolean,boolean),private.freeze_passenger_class(),
 private.ride_offer_eligible(uuid,public.ride_legs),private.emit_ride_notice(public.ride_legs,text),
 private.notice_ride_transition(),private.ride_reservation_check() from public,anon,authenticated,service_role;
revoke all on function public.ride_class_options(uuid,timestamptz),public.ride_choose_class(uuid,text,timestamptz),
 public.ride_passenger_updates(boolean) from public,anon,service_role;
grant execute on function public.ride_class_options(uuid,timestamptz),public.ride_choose_class(uuid,text,timestamptz),
 public.ride_passenger_updates(boolean) to authenticated;
-- A verified operator records inspected seats and equipment for the exact
-- approved vehicle. Replacing its documents invalidates the binding.
create function public.ride_validate_capacity(p_driver uuid,p_seats integer,p_tools boolean,p_accessible boolean,p_until timestamptz,p_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare d public.ride_drivers;ref text;
begin
 perform private.require_admin();
 if not private.ride_active_user(auth.uid()) or auth.uid()=p_driver or not private.ride_active_user(p_driver)
 then raise exception 'not_allowed'; end if;
 if p_seats is null or p_seats not between 1 and 12 or p_tools is null or p_accessible is null or p_until is null or p_until<=now()
 or p_reference is null or p_reference!~'^[[:alnum:]_.:/-]{3,100}$' then raise exception 'invalid_input'; end if;
 select * into d from public.ride_drivers where id=p_driver and environment=private.ride_env() for update;
 if not found or not private.ride_driver_valid(p_driver,(p_until at time zone 'America/Sao_Paulo')::date)
 then raise exception 'driver_ineligible'; end if;
 if d.environment='live' then
   select vehicle_identifier into strict ref from private.ride_driver_credentials where driver_id=p_driver and vehicle_category=d.vehicle;
 else ref:=p_reference; end if;
 insert into private.ride_vehicle_capacity values(p_driver,d.vehicle,ref,p_seats,p_tools,p_accessible,p_until)
 on conflict(driver_id) do update set vehicle=excluded.vehicle, document_ref=excluded.document_ref,seats=excluded.seats,
 tools=excluded.tools,accessible=excluded.accessible,valid_until=excluded.valid_until;
 perform private.audit('ride.capacity_review','ride_drivers',p_driver::text,jsonb_build_object('evidence',p_reference,'seats',p_seats,'tools',p_tools,'accessible',p_accessible));
end $$;
revoke all on function public.ride_validate_capacity(uuid,int,boolean,boolean,timestamptz,text) from public,anon,service_role;
grant execute on function public.ride_validate_capacity(uuid,int,boolean,boolean,timestamptz,text) to authenticated;

alter table public.notifications drop constraint notifications_template_check;
alter table public.notifications add constraint notifications_template_check check(template in(
 'proposta_recebida','atendimento_confirmado','lembrete_atendimento','pagamento_recebido','orcamento_respondido','plantao_oferecido',
 'agendamento_solicitado','shift_canceled_by_deletion','booking_canceled_by_deletion','pedido_novo','atualizacao_corrida'));
create function private.erase_passenger_notices() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from private.ride_notice_preferences where owner_id=new.id;
 delete from private.ride_passenger_notices where owner_id=new.id;
 return null;
end $$;
create trigger erase_passenger_notices after update of deleted_at on public.profiles for each row when(new.deleted_at is not null and old.deleted_at is null)
 execute function private.erase_passenger_notices();
revoke all on function private.erase_passenger_notices() from public,anon,authenticated,service_role;
