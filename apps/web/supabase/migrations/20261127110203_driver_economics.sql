-- The driver's financial book remains the source of money. Daily observations contain no locations.
create table private.ride_driver_diaries (
  driver_id uuid not null references public.ride_drivers on delete cascade,
  day date not null, paid_meters integer not null check(paid_meters between 0 and 2000000),
  empty_meters integer not null check(empty_meters between 0 and 2000000),
  cost_cents integer not null check(cost_cents between 0 and 10000000),
  updated_at timestamptz not null default now(), primary key(driver_id,day)
);
create table private.ride_driver_online_periods (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.ride_drivers on delete cascade,
  started_at timestamptz not null, stopped_at timestamptz check(stopped_at>=started_at)
);
create index ride_online_driver_time on private.ride_driver_online_periods(driver_id,started_at);
create unique index ride_one_open_online_period on private.ride_driver_online_periods(driver_id) where stopped_at is null;
create function private.capture_driver_online() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.online and (tg_op='INSERT' or not old.online) then
    insert into private.ride_driver_online_periods(driver_id,started_at) values(new.id,clock_timestamp());
  elsif not new.online and tg_op='UPDATE' and old.online then
    update private.ride_driver_online_periods set stopped_at=clock_timestamp() where driver_id=new.id and stopped_at is null;
  end if;
  return null;
end $$;
create trigger driver_economics_online after insert or update of online on public.ride_drivers
  for each row execute function private.capture_driver_online();
-- Existing online accounts have no historical clock. Measurement begins at installation.
insert into private.ride_driver_online_periods(driver_id,started_at)
  select id,clock_timestamp() from public.ride_drivers where online;
-- Removing a scheduled shift must never erase availability already observed during that shift.
create table private.ride_driver_past_shifts (
 shift_id uuid primary key,driver_id uuid not null references public.ride_drivers on delete cascade,period tstzrange not null
);
alter table private.ride_driver_past_shifts enable row level security;
revoke all on private.ride_driver_past_shifts from public,anon,authenticated,service_role;
create function private.retain_elapsed_shift() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if lower(old.period)<clock_timestamp() and private.ride_active_user(old.driver_id) then
   insert into private.ride_driver_past_shifts values(old.id,old.driver_id,tstzrange(lower(old.period),least(clock_timestamp(),upper(old.period)),'[)'));
 end if;
 return null;
end $$;
create trigger ride_driver_elapsed_shift after delete on private.ride_driver_shifts for each row execute function private.retain_elapsed_shift();
revoke all on function private.retain_elapsed_shift() from public,anon,authenticated,service_role;
create function private.clear_driver_diary() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from private.ride_driver_diaries where driver_id=new.id;
 delete from private.ride_driver_past_shifts where driver_id=new.id;
 delete from private.ride_driver_online_periods where driver_id=new.id;
 return null;
end $$;
create trigger ride_clear_driver_diary after update of deleted_at on public.profiles for each row
  when(old.deleted_at is null and new.deleted_at is not null) execute function private.clear_driver_diary();

-- Promotions are optional, capped and booked separately from the 10% fare. No campaign is seeded.
create table private.ride_driver_campaigns (
 id uuid primary key default gen_random_uuid(), environment text not null references private.ride_network(environment),
 period tstzrange not null check(not isempty(period) and not lower_inf(period) and not upper_inf(period)),
 budget_cents integer not null check(budget_cents>0), approval_ref text not null check(length(trim(approval_ref)) between 1 and 160)
);
create table private.ride_driver_rewards (
 operation_id uuid primary key, campaign_id uuid not null references private.ride_driver_campaigns,
 leg_id uuid not null references private.ride_financial_accounts,
 kind text not null check(kind in ('reward','reward_reversal','reward_payout','reward_payout_reversal')),
 cents integer not null check(cents>0), reference text not null check(length(trim(reference)) between 1 and 160),
 recorded_at timestamptz not null default clock_timestamp(), unique(campaign_id,reference,kind)
);
create index ride_rewards_campaign_leg on private.ride_driver_rewards(campaign_id,leg_id);
-- Backend-only import of approved credits and verified disbursements. This records evidence; it cannot send money.
create function public.record_ride_driver_reward(p_operation uuid,p_campaign uuid,p_leg uuid,p_kind text,p_cents integer,p_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare c private.ride_driver_campaigns; prior private.ride_driver_rewards; granted bigint; paid bigint; used bigint;
begin
 if not private.is_service_role() then raise exception 'not_allowed'; end if;
 if p_operation is null or p_cents is null or p_cents<=0 or p_kind is null or p_kind not in
   ('reward','reward_reversal','reward_payout','reward_payout_reversal') or nullif(trim(p_reference),'') is null
   then raise exception 'invalid_input'; end if;
 select * into c from private.ride_driver_campaigns where id=p_campaign and environment=private.ride_env() for update;
 if not found or not exists(select from private.ride_financial_accounts f where f.leg_id=p_leg and f.environment=c.environment)
   then raise exception 'not_allowed'; end if;
 select * into prior from private.ride_driver_rewards where operation_id=p_operation;
 if found then
  if (prior.campaign_id,prior.leg_id,prior.kind,prior.cents,prior.reference) is distinct from
     (p_campaign,p_leg,p_kind,p_cents,trim(p_reference)) then raise exception 'ride_operation_conflict'; end if;
  return;
 end if;
 select coalesce(sum(case kind when 'reward' then cents when 'reward_reversal' then -cents else 0 end),0),
        coalesce(sum(case kind when 'reward_payout' then cents when 'reward_payout_reversal' then -cents else 0 end),0)
   into granted,paid from private.ride_driver_rewards where campaign_id=p_campaign and leg_id=p_leg;
 if p_kind='reward' then
   if not c.period @> statement_timestamp() or (c.environment='live' and not exists(select from private.ride_live_finance_release
       where enabled and until_at>now())) then raise exception 'ride_financial_state'; end if;
   select coalesce(sum(case kind when 'reward' then cents when 'reward_reversal' then -cents else 0 end),0)
     into used from private.ride_driver_rewards where campaign_id=p_campaign;
   if used+p_cents>c.budget_cents then raise exception 'ride_financial_state'; end if;
 elsif (p_kind='reward_reversal' and p_cents>granted) or (p_kind='reward_payout' and p_cents>granted-paid)
    or (p_kind='reward_payout_reversal' and p_cents>paid) then raise exception 'ride_financial_state';
 end if;
 insert into private.ride_driver_rewards(operation_id,campaign_id,leg_id,kind,cents,reference)
   values(p_operation,p_campaign,p_leg,p_kind,p_cents,trim(p_reference));
end $$;
revoke all on function public.record_ride_driver_reward(uuid,uuid,uuid,text,integer,text) from public,anon,authenticated,service_role;
grant execute on function public.record_ride_driver_reward(uuid,uuid,uuid,text,integer,text) to service_role;

-- Freeze each toll at quote creation. Legacy quotes that contain only a toll also have an exact amount.
alter table private.ride_quotes add column driver_tolls jsonb not null default '{}';
create function private.snapshot_driver_tolls() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select coalesce(jsonb_object_agg(e->>'seq', t.cents),'{}') into new.driver_tolls
 from jsonb_array_elements(new.legs) e join private.ride_extra_prices t on t.tariff_id=new.tariff_id and t.code='toll'
 where (e->'extras') ? 'toll';
 return new;
end $$;
create trigger ride_quote_driver_tolls before insert on private.ride_quotes for each row execute function private.snapshot_driver_tolls();

-- Signed changes in driver income and cash. A capture, processing fee or failed payout never earns the fare twice.
create view private.ride_driver_book_entries with (security_invoker=true) as
select a.driver_id,a.environment,e.leg_id,e.operation_id,e.recorded_at at_time,e.kind,e.amount_cents::bigint gross,
  case when e.kind in ('earned','refund','chargeback') then e.driver_delta::bigint else 0 end income,
  case when e.kind in ('payout','payout_reversal') then -e.driver_delta::bigint else 0 end paid,
  e.fee_delta::bigint fee, case when e.kind='earned' then e.extras_cents when e.kind in ('refund','chargeback') then -e.extras_cents else 0 end::bigint extras,
  0::bigint reward
from private.ride_financial_events e join private.ride_financial_accounts a using(leg_id)
union all
select l.driver_id,l.environment,c.leg_id,c.leg_id,c.opened_at,'cancel_pending',null,0,0,0,0,0
from private.ride_interruption_costs c join public.ride_legs l on l.id=c.leg_id
union all
select l.driver_id,l.environment,c.leg_id,c.operation_id,c.reviewed_at,'cancel_cost',c.cost_cents,c.cost_cents,0,0,0,0
from private.ride_interruption_costs c join public.ride_legs l on l.id=c.leg_id where c.reviewed_at is not null
union all
select l.driver_id,l.environment,d.leg_id,d.operation_id,d.recorded_at,'cancel_payout',d.amount_cents,0,d.amount_cents,0,0,0
from private.ride_cost_disbursements d join public.ride_legs l on l.id=d.leg_id
union all
select a.driver_id,a.environment,r.leg_id,r.operation_id,r.recorded_at,r.kind,r.cents,0,
  case r.kind when 'reward_payout' then r.cents when 'reward_payout_reversal' then -r.cents else 0 end,0,0,
  case r.kind when 'reward' then r.cents when 'reward_reversal' then -r.cents else 0 end
from private.ride_driver_rewards r join private.ride_financial_accounts a using(leg_id);
create index ride_finance_driver_history on private.ride_financial_accounts(driver_id,environment,leg_id);
create index ride_finance_leg_time on private.ride_financial_events(leg_id,recorded_at);

create function private.ride_economics_driver() returns uuid language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if not private.ride_active_user(u) or not exists(select from public.ride_drivers d where d.id=u and d.environment=private.ride_env())
 then raise exception 'not_allowed'; end if;
 return u;
end $$;

create function public.ride_driver_diary(p_day date,p_paid_meters integer,p_empty_meters integer,p_cost_cents integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare u uuid:=private.ride_economics_driver(); today date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 if p_day is null or p_day not between today-365 and today or p_paid_meters is null or p_empty_meters is null or p_cost_cents is null
   or p_paid_meters not between 0 and 2000000 or p_empty_meters not between 0 and 2000000 or p_cost_cents not between 0 and 10000000
 then raise exception 'invalid_input'; end if;
 -- Repeating an edit replaces the same daily observation instead of adding the costs twice.
 insert into private.ride_driver_diaries(driver_id,day,paid_meters,empty_meters,cost_cents)
 values(u,p_day,p_paid_meters,p_empty_meters,p_cost_cents)
 on conflict(driver_id,day) do update set paid_meters=excluded.paid_meters,empty_meters=excluded.empty_meters,
 cost_cents=excluded.cost_cents,updated_at=clock_timestamp();
 return true;
end $$;

create function private.ride_timeline(p_driver uuid,p_window tstzrange)
returns table(category text,span tstzrange) language sql stable security definer set search_path='' as $$
 with legs as (
  select l.id,l.status,l.updated_at,
   min(e.at) filter(where e.to_status='arriving' and e.from_status<>e.to_status) as approach,
   coalesce(proof.boarded_at,min(e.at) filter(where e.to_status='boarded' and e.from_status<>e.to_status)) as onboard,
   pickup.arrived_at as pickup,
   coalesce(proof.ended_at,min(e.at) filter(where e.to_status in ('completed','cancelled','unknown') and e.from_status<>e.to_status),
      case when l.status in ('completed','cancelled','unknown') then l.updated_at else statement_timestamp() end) as finish
  from public.ride_legs l left join private.ride_events e on e.leg_id=l.id
  left join private.ride_pickup_arrivals pickup on pickup.leg_id=l.id left join private.ride_resolution_proofs proof on proof.leg_id=l.id
  where l.driver_id=p_driver and l.environment=private.ride_env()
  group by l.id,proof.boarded_at,proof.ended_at,pickup.arrived_at
 ), periods as (
  select phase,start_time,end_time from legs cross join lateral (values
   ('approach',approach,least(pickup,onboard,finish)),('wait',pickup,least(onboard,finish)),('passenger',onboard,finish)
  ) phases(phase,start_time,end_time)
  union all
  select 'online',greatest(o.started_at,lower(s.period)),least(o.stopped_at,statement_timestamp(),upper(s.period))
    from private.ride_driver_online_periods o join (
      select driver_id,period from private.ride_driver_shifts where driver_id=p_driver and period && p_window
      union all select driver_id,period from private.ride_driver_past_shifts where driver_id=p_driver and period && p_window
    ) s on s.driver_id=o.driver_id
    where o.driver_id=p_driver and s.period && p_window
  union all
  select 'service',e.at,coalesce((select min(n.at) from public.booking_events n where n.booking_id=e.booking_id and n.at>=e.at
    and n.from_status='in_progress' and n.to_status<>'in_progress'),statement_timestamp())
    from public.booking_events e join public.bookings b on b.id=e.booking_id where b.provider_id=p_driver
    and e.to_status='in_progress' and e.from_status is distinct from 'in_progress'
 )
 select phase,tstzrange(greatest(start_time,lower(p_window)),least(end_time,upper(p_window)),'[)')
 from periods where start_time is not null and start_time<end_time and start_time<upper(p_window) and end_time>lower(p_window)
$$;
create function private.ride_union_seconds(p_ranges tstzmultirange) returns bigint language sql immutable set search_path='' as $$
 select coalesce(round(sum(extract(epoch from upper(x)-lower(x)))),0)::bigint from unnest(p_ranges) x;
$$;

-- One fixed, completed four-week cohort per deployment; callers cannot difference arbitrary date or person filters.
create function private.driver_weekly_trends() returns jsonb language sql stable security definer set search_path='' as $$
 with limits as (select date_trunc('week',statement_timestamp() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo' as cutoff),
 itinerary as (
  select distinct on (l.ride_id,l.seq) l.id,l.pickup_at,l.origin,l.driver_id,r.passenger_id
  from public.ride_legs l join public.rides r on r.id=l.ride_id join private.ride_quotes q on q.id=coalesce(l.source_quote_id,r.quote_id)
  cross join limits b
  where l.environment=private.ride_env() and r.created_at<b.cutoff and q.created_at<b.cutoff
    and exists(select from public.ride_legs s where s.ride_id=l.ride_id and s.seq=l.seq
      and s.pickup_at>=b.cutoff-interval '28 days' and s.pickup_at<b.cutoff)
  order by l.ride_id,l.seq,l.revision desc
 ), sample as (
  select i.origin zone,extract(hour from i.pickup_at at time zone 'America/Sao_Paulo')::integer/4*4 as hour_block,
    i.driver_id,i.passenger_id,e.driver_delta,e.extras_cents
  from itinerary i cross join limits b left join private.ride_financial_events e
    on e.leg_id=i.id and e.kind='earned' and e.recorded_at<b.cutoff
  where i.pickup_at>=b.cutoff-interval '28 days' and i.pickup_at<b.cutoff
 ), cells as (
  select zone,hour_block,count(*) demand,count(driver_delta) completed,round(avg(driver_delta-extras_cents)) typical_cents
  from sample group by zone,hour_block having count(*)>=10 and count(distinct passenger_id)>=5
     and count(distinct driver_id) filter(where driver_delta is not null)>=5 and count(driver_delta)>=10
 )
 select jsonb_build_object('as_of',(select cutoff from limits),'cells',coalesce(jsonb_agg(to_jsonb(cells) order by zone,hour_block),'[]'))
 from cells;
$$;

create function public.ride_driver_statement(p_day date,p_week boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.ride_economics_driver(); env text:=private.ride_env();
 first_day date; last_day date; lo timestamptz; hi timestamptz; report jsonb;
begin
 if p_day is null or not isfinite(p_day) or p_week is null then raise exception 'invalid_input'; end if;
 first_day:=case when p_week then date_trunc('week',p_day::timestamp)::date else p_day end;
 last_day:=first_day+case when p_week then 7 else 1 end;
 lo:=first_day::timestamp at time zone 'America/Sao_Paulo';
 hi:=last_day::timestamp at time zone 'America/Sao_Paulo';
 with book as materialized (
   select * from private.ride_driver_book_entries e where e.driver_id=u and e.environment=env and e.at_time<hi
 ), entries as (
   select e.operation_id,e.leg_id,e.kind,e.at_time,e.gross,e.income,e.reward,e.paid,e.fee,e.extras,
     case when e.kind='earned' and (q.legs->(coalesce(l.quote_seq,l.seq)-1)->'extras') ? 'toll' then
       coalesce((q.driver_tolls->>coalesce(l.quote_seq,l.seq)::text)::integer,
         case when jsonb_array_length(q.legs->(coalesce(l.quote_seq,l.seq)-1)->'extras')=1 then e.extras end)
       else 0 end toll_cents,
     l.status,h.task_id protocol
   from book e join public.ride_legs l on l.id=e.leg_id join public.rides r on r.id=l.ride_id
   left join private.ride_quotes q on q.id=coalesce(l.source_quote_id,r.quote_id)
   left join private.ride_help h on h.leg_id=l.id and h.actor=u and h.reason='payment'
   where e.at_time>=lo
 ), money as (
   select coalesce(sum(income) filter(where at_time>=lo),0) income,
     coalesce(sum(reward) filter(where at_time>=lo),0) rewards,coalesce(sum(paid) filter(where at_time>=lo),0) paid,
     coalesce(sum(extras) filter(where at_time>=lo),0) reimbursements,
     coalesce(sum(income+reward-paid) filter(where at_time<lo),0) opening,
     coalesce(sum(income+reward-paid),0) closing from book
 ), spans as materialized (select * from private.ride_timeline(u,tstzrange(lo,hi,'[)'))),
 times as (
   select private.ride_union_seconds(range_agg(span) filter(where category='online')) as online_seconds,
    private.ride_union_seconds(range_agg(span) filter(where category='approach')) as approach_seconds,
    private.ride_union_seconds(range_agg(span) filter(where category='passenger')) as passenger_seconds,
    private.ride_union_seconds(range_agg(span) filter(where category='wait')) as wait_seconds,
    private.ride_union_seconds(range_agg(span) filter(where category='service')) as service_seconds,
    private.ride_union_seconds(range_agg(span) filter(where category<>'online')) as committed_seconds
    from spans
 ), days as (
   select first_day+i as day,tstzrange((first_day+i)::timestamp at time zone 'America/Sao_Paulo',
      (first_day+i+1)::timestamp at time zone 'America/Sao_Paulo','[)') day_window
   from generate_series(0,last_day-first_day-1) i
 ), observations as (
   select d.day,j.driver_id is not null as filled,coalesce(j.paid_meters,receipt.meters,0) paid_meters,
     coalesce(j.empty_meters,0) empty_meters,coalesce(j.cost_cents,0) costs,
     (exists(select from spans s where s.span && d.day_window) or
      exists(select from book e where d.day_window @> e.at_time and e.kind in ('earned','cancel_cost')) or
      exists(select from public.ride_legs l where l.driver_id=u and l.environment=env and d.day_window @> l.updated_at
               and l.status in ('cancelled','completed','unknown'))) active
   from days d left join private.ride_driver_diaries j on j.driver_id=u and j.day=d.day
   left join lateral (select sum(r.measured_meters) meters from private.ride_receipts r
     where r.driver_id=u and r.environment=env and d.day_window @> r.ended_at) receipt on true
 ), coverage as (
   select count(*) filter(where active and not filled) missing_days,sum(paid_meters) paid_meters,sum(empty_meters) empty_meters,
    sum(costs) costs from observations
 ), measures as (
   select m.*,t.*,c.*,m.income-c.costs as base_net,m.income+m.rewards-c.costs as total_net
   from money m cross join times t cross join coverage c
 ), missing_times as (
   select exists(select from public.ride_legs l where l.driver_id=u and l.environment=env and l.status='completed'
     and l.updated_at>=lo and l.updated_at<hi and not exists(select from private.ride_events e where e.leg_id=l.id and e.to_status='arriving')
   ) or exists(select from public.ride_legs l where l.driver_id=u and l.environment=env and l.status='completed'
     and l.updated_at>=lo and l.updated_at<hi and
     (not exists(select from private.ride_pickup_arrivals a where a.leg_id=l.id) or
      (not exists(select from private.ride_events e where e.leg_id=l.id and e.to_status='boarded') and
       not exists(select from private.ride_resolution_proofs p where p.leg_id=l.id)))) as incomplete
 )
 select jsonb_build_object('from_day',first_day,'until_day',last_day,'simulation',env='simulation',
  'metrics',to_jsonb(m)||jsonb_build_object('time_incomplete',x.incomplete,
    'per_online_hour',case when m.missing_days=0 then round(m.total_net*3600/nullif(m.online_seconds,0)) end,
    'per_committed_hour',case when m.missing_days=0 and not x.incomplete then round(m.total_net*3600/nullif(m.committed_seconds,0)) end,
    'per_km',case when m.missing_days=0 then round(m.total_net*1000/nullif(m.paid_meters+m.empty_meters,0)) end),
  'entries',coalesce((select jsonb_agg(to_jsonb(e) order by at_time desc,operation_id,kind) from entries e),'[]'),
  'diary',(select jsonb_build_object('paid_meters',paid_meters,'empty_meters',empty_meters,'cost_cents',cost_cents)
       from private.ride_driver_diaries where driver_id=u and day=p_day),
  'trends',private.driver_weekly_trends())
 into report from measures m cross join missing_times x;
 return report;
end $$;

alter table private.ride_driver_diaries enable row level security;
alter table private.ride_driver_online_periods enable row level security;
alter table private.ride_driver_rewards enable row level security;
alter table private.ride_driver_campaigns enable row level security;
revoke all on private.ride_driver_diaries,private.ride_driver_online_periods,private.ride_driver_rewards,
  private.ride_driver_campaigns,private.ride_driver_book_entries from public,anon,authenticated,service_role;
revoke all on function private.capture_driver_online(),private.clear_driver_diary(),private.snapshot_driver_tolls(),
 private.ride_economics_driver(),private.ride_timeline(uuid,tstzrange),private.ride_union_seconds(tstzmultirange),
 private.driver_weekly_trends() from public,anon,authenticated,service_role;
revoke all on function public.ride_driver_statement(date,boolean),public.ride_driver_diary(date,integer,integer,integer)
 from public,anon,authenticated,service_role;
grant execute on function public.ride_driver_statement(date,boolean),public.ride_driver_diary(date,integer,integer,integer)
 to authenticated;
