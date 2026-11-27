-- A signed budget and a staffed time window are prerequisites of real
-- commitments. Fixture traffic lives in a different project.
create table private.ride_pilot (
 id uuid primary key default gen_random_uuid(), period tstzrange not null check(not isempty(period) and not lower_inf(period) and not upper_inf(period)),
 approved_ref text not null check(length(trim(approved_ref)) between 1 and 160),
 budget_cents integer not null check(budget_cents>0), external_commitments_cents integer not null default 0 check(external_commitments_cents>=0),
 frozen boolean not null default false, exclude using gist(period with &&)
);
create table private.ride_coverage (
 id uuid primary key default gen_random_uuid(), pilot uuid not null references private.ride_pilot(id),
 period tstzrange not null check(not isempty(period)), lead_id uuid not null references public.profiles(id),
 backup_id uuid not null references public.profiles(id), check(lead_id<>backup_id)
);
create table private.ride_commitments (
 leg_id uuid primary key references public.ride_legs(id), pilot uuid not null references private.ride_pilot(id),
 amount_cents bigint not null check(amount_cents>=0)
);
create index ride_commitments_pilot on private.ride_commitments(pilot);
create function private.reserve_ride_budget() returns trigger language plpgsql security definer set search_path='' as $$
declare p private.ride_pilot; committed bigint; own_use bigint:=new.fare_cents;
begin
 if new.environment<>'live' then return new; end if;
 if tg_op='UPDATE' and own_use<=old.fare_cents then return new; end if;
 select * into p from private.ride_pilot where period @> new.slot and period @> now() and not frozen for update;
 if not found or not exists(select from private.ride_coverage c where c.pilot=p.id and c.period @> new.slot)
 then raise exception 'ride_pilot_unstaffed'; end if;
 select coalesce(sum(amount_cents),0) into committed from private.ride_commitments where pilot=p.id and leg_id<>new.id;
 if committed+own_use+p.external_commitments_cents>p.budget_cents then raise exception 'ride_pilot_budget'; end if;
 insert into private.ride_commitments values(new.id,p.id,own_use) on conflict(leg_id) do update
 set amount_cents=greatest(private.ride_commitments.amount_cents,excluded.amount_cents);
 return new;
end $$;
-- AFTER insert ensures the leg FK exists. A rejected budget rolls back the entire multi-leg itinerary.
create trigger ride_commitment after insert or update of fare_cents,extras_cents on public.ride_legs for each row execute function private.reserve_ride_budget();

create table private.ride_pilot_entries (
 id uuid primary key, environment text not null, market text not null check(market in ('services','public')),
 stratum text not null check(length(trim(stratum)) between 1 and 80), arm text not null check(arm in ('offer','comparison','public')),
 entered_at timestamptz not null default now(), recorded_by uuid not null references public.profiles(id),
 closed_at timestamptz, completed boolean, margin_cents integer, support_minutes integer check(support_minutes>=0)
);
create function public.ride_enroll(p_reference uuid,p_market text,p_stratum text) returns text
language plpgsql security definer set search_path='' as $$
declare existing private.ride_pilot_entries; chosen text; env text:=private.ride_env();
begin
 perform private.require_admin();
 if p_reference is null or p_market not in ('services','public') or p_stratum is null or length(trim(p_stratum)) not between 1 and 80 then raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_reference::text,0));
 select * into existing from private.ride_pilot_entries where id=p_reference;
 if found then
 if existing.environment<>env or existing.market<>p_market or existing.stratum<>trim(p_stratum) then raise exception 'idempotency_conflict'; end if;
 return existing.arm;
 end if;
 if env='live' then
  perform 1 from private.ride_pilot where period @> now() and not frozen for update;
  if not found then raise exception 'ride_pilot_closed'; end if;
  if (select count(*) from private.ride_pilot_entries e join private.ride_pilot p on p.period @> e.entered_at
      where e.environment=env and p.period @> now())>=100 then raise exception 'ride_pilot_closed'; end if;
 end if;
 chosen:=case when p_market='public' then 'public' when random()<0.5 then 'offer' else 'comparison' end;
 insert into private.ride_pilot_entries(id,environment,market,stratum,arm,recorded_by)
 values(p_reference,env,p_market,trim(p_stratum),chosen,auth.uid());
 return chosen;
end $$;
create function public.ride_close_observation(p_reference uuid,p_completed boolean,p_margin_cents integer,p_support_minutes integer)
returns void language plpgsql security definer set search_path='' as $$
declare e private.ride_pilot_entries;
begin
 perform private.require_admin();
 select * into e from private.ride_pilot_entries where id=p_reference and environment=private.ride_env() for update;
 if not found or p_completed is null or p_margin_cents is null or p_support_minutes is null or p_support_minutes<0 then raise exception 'invalid_input'; end if;
 if e.closed_at is not null then
  if (e.completed,e.margin_cents,e.support_minutes) is distinct from (p_completed,p_margin_cents,p_support_minutes) then raise exception 'observation_already_closed'; end if;
  return;
 end if;
 update private.ride_pilot_entries set closed_at=now(),completed=p_completed,margin_cents=p_margin_cents,support_minutes=p_support_minutes where id=e.id;
end $$;
create function public.ride_pilot_report() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare report jsonb; env text:=private.ride_env();
begin
 perform private.require_admin();
 select coalesce(jsonb_agg(to_jsonb(row)), '[]') into report from (
  select date_trunc('month',entered_at at time zone 'America/Sao_Paulo')::date as month,market,stratum,arm,count(*) as eligible,
    count(closed_at) as closed,count(*) filter(where completed) as completed,
    case when count(*)=count(closed_at) then round(sum(margin_cents)::numeric/count(*),2) end as cents_per_eligible,
    case when count(*)=count(closed_at) then round(sum(support_minutes)::numeric/count(*),2) end as minutes_per_eligible
  from private.ride_pilot_entries where environment=env group by 1,2,3,4 order by 1 desc,2,3,4
 ) row;
 return jsonb_build_object('environment',env,'rows',report);
end $$;
revoke all on private.ride_pilot,private.ride_coverage,private.ride_commitments,private.ride_pilot_entries from public,anon,authenticated;
revoke all on function private.reserve_ride_budget() from public,anon,authenticated;
revoke all on function public.ride_enroll(uuid,text,text),public.ride_close_observation(uuid,boolean,int,int),public.ride_pilot_report() from public,anon;
grant execute on function public.ride_enroll(uuid,text,text),public.ride_close_observation(uuid,boolean,int,int),public.ride_pilot_report() to authenticated;
