-- A leg has its own receivable, driver balance and commission. Completing it records
-- accrual only. Nothing here posts to service payments or sends money to a PSP.
create table private.ride_financial_accounts (
  leg_id uuid primary key references public.ride_legs(id),
  environment text not null check (environment in ('simulation','live')),
  payer_id uuid not null, driver_id uuid not null,
  fare_cents integer not null check (fare_cents > 0),
  extras_cents integer not null check (extras_cents between 0 and fare_cents),
  fee_cents integer not null check (fee_cents = 0 or fee_cents = (fare_cents - extras_cents)::bigint * 1000 / 10000),
  driver_cents integer not null check (driver_cents = fare_cents - fee_cents),
  created_at timestamptz not null default now()
);

create table private.ride_financial_events (
  leg_id uuid not null references private.ride_financial_accounts(leg_id),
  operation_id uuid not null,
  kind text not null check (kind in ('earned','capture','capture_failed','capture_unknown',
    'payout','payout_failed','payout_unknown','refund','refund_failed','refund_unknown',
    'dispute_open','dispute_release','chargeback')),
  amount_cents integer not null check (amount_cents > 0),
  extras_cents integer not null default 0 check (extras_cents between 0 and amount_cents),
  -- Assets (cash, receivable) = liabilities (driver) + platform commission.
  cash_delta integer not null default 0, receivable_delta integer not null default 0,
  driver_delta integer not null default 0, fee_delta integer not null default 0,
  dispute_delta integer not null default 0,
  recorded_by uuid, recorded_at timestamptz not null default clock_timestamp(),
  primary key (leg_id,operation_id,kind),
  exclude using gist (operation_id with =,leg_id with <>),
  check (cash_delta::bigint + receivable_delta = driver_delta::bigint + fee_delta)
);
alter table private.ride_financial_accounts enable row level security;
alter table private.ride_financial_events enable row level security;
revoke all on private.ride_financial_accounts,private.ride_financial_events
  from public,anon,authenticated,service_role;

create function private.accrue_completed_ride()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.ride_financial_accounts(leg_id,environment,payer_id,driver_id,fare_cents,extras_cents,fee_cents,driver_cents)
    values (new.id,new.environment,new.payer_id,new.driver_id,new.fare_cents,new.extras_cents,new.fee_cents,new.driver_cents);
  insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,extras_cents,receivable_delta,driver_delta,fee_delta,recorded_by)
    values (new.id,new.id,'earned',new.fare_cents,new.extras_cents,new.fare_cents,new.driver_cents,new.fee_cents,auth.uid());
  return new;
end;
$$;
revoke all on function private.accrue_completed_ride() from public,anon,authenticated,service_role;
create trigger ride_leg_accrue after update of status on public.ride_legs
  for each row when (new.status='completed' and old.status is distinct from new.status)
  execute function private.accrue_completed_ride();

-- Covers completed legs between an incremental domain rollout and this migration.
insert into private.ride_financial_accounts(leg_id,environment,payer_id,driver_id,fare_cents,extras_cents,fee_cents,driver_cents)
  select id,environment,payer_id,driver_id,fare_cents,extras_cents,fee_cents,driver_cents
    from public.ride_legs where status='completed';
insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,extras_cents,receivable_delta,driver_delta,fee_delta)
  select leg_id,leg_id,'earned',fare_cents,extras_cents,fare_cents,driver_cents,fee_cents
    from private.ride_financial_accounts;

create view private.ride_financial_balances with (security_invoker = true) as
  select a.leg_id,
    sum(e.cash_delta)::bigint as cash_cents, sum(e.receivable_delta)::bigint as receivable_cents,
    sum(e.driver_delta)::bigint as driver_balance_cents, sum(e.fee_delta)::bigint as commission_cents,
    sum(e.dispute_delta)::bigint as disputed_cents,
    coalesce(sum(e.amount_cents) filter (where e.kind in ('refund','chargeback')),0)::bigint as reversed_cents,
    coalesce(sum(e.extras_cents) filter (where e.kind in ('refund','chargeback')),0)::bigint as reversed_extras_cents
  from private.ride_financial_accounts a join private.ride_financial_events e using(leg_id) group by a.leg_id;
revoke all on private.ride_financial_balances from public,anon,authenticated,service_role;

-- A PSP timeout leaves an operation unresolved. A new UUID cannot silently reissue
-- the affected charge, payout or refund before reconciliation with the original UUID.
create view private.ride_financial_unknown with (security_invoker = true) as
  select e.leg_id,e.operation_id,e.kind,e.amount_cents,e.extras_cents
    from private.ride_financial_events e
    where e.kind in ('capture_unknown','payout_unknown','refund_unknown')
      and not exists (select 1 from private.ride_financial_events later
        where later.leg_id=e.leg_id and later.operation_id=e.operation_id and later.kind<>e.kind);
revoke all on private.ride_financial_unknown from public,anon,authenticated,service_role;

create function public.admin_ride_settlement(p_leg uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  a private.ride_financial_accounts%rowtype;
  b private.ride_financial_balances%rowtype;
  pending jsonb;
begin
  perform private.require_admin();
  if not exists (select 1 from public.ride_legs l join private.ride_deployment d
                on d.environment=l.environment where l.id=p_leg) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into a from private.ride_financial_accounts where leg_id=p_leg;
  if not found then return jsonb_build_object('recognized',false); end if;
  select * into strict b from private.ride_financial_balances where leg_id=p_leg;
  select jsonb_build_object('operation_id',operation_id,'kind',kind,'amount_cents',amount_cents,'extras_cents',extras_cents)
    into pending from private.ride_financial_unknown where leg_id=p_leg;
  return jsonb_build_object('recognized',true,'environment',a.environment,'fare_cents',a.fare_cents,
    'extras_cents',a.extras_cents,'fee_cents',a.fee_cents,'driver_cents',a.driver_cents,
    'cash_cents',b.cash_cents,'receivable_cents',b.receivable_cents,'driver_balance_cents',b.driver_balance_cents,
    'commission_cents',b.commission_cents,'disputed_cents',b.disputed_cents,'reversed_cents',b.reversed_cents,
    'reversed_extras_cents',b.reversed_extras_cents,'unknown',pending);
end;
$$;

-- Protected simulator, intentionally incapable of writing verified live PSP events.
-- The user supplies an observed amount, never a commission, beneficiary, balance or environment.
create function public.admin_simulate_ride_payment_event(
  p_leg uuid,p_operation uuid,p_kind text,p_amount_cents integer,p_extras_cents integer default 0
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a private.ride_financial_accounts%rowtype;
  b private.ride_financial_balances%rowtype;
  previous private.ride_financial_events%rowtype;
  pending private.ride_financial_unknown%rowtype;
  action text;
  cash integer := 0; receivable integer := 0; driver integer := 0; fee integer := 0; disputed integer := 0;
  remaining_base bigint;
begin
  perform private.require_admin();
  if p_operation is null or p_operation=p_leg or p_kind is null or p_kind not in ('capture','capture_failed','capture_unknown',
     'payout','payout_failed','payout_unknown','refund','refund_failed','refund_unknown','dispute_open','dispute_release','chargeback')
     or p_amount_cents is null or p_amount_cents<=0 or p_extras_cents is null or p_extras_cents not between 0 and p_amount_cents then
    raise exception 'invalid_input' using errcode='P0001';
  end if;
  select * into a from private.ride_financial_accounts where leg_id=p_leg for update;
  if not found then raise exception 'not_found' using errcode='P0001'; end if;
  if a.environment<>'simulation' or not exists (select 1 from private.ride_deployment d
        join private.ride_network n using(environment) where d.environment='simulation' and n.module_enabled) then
    raise exception 'not_allowed' using errcode='P0001';
  end if;
  select * into previous from private.ride_financial_events
    where leg_id=p_leg and operation_id=p_operation and kind=p_kind;
  if found then
    if previous.amount_cents<>p_amount_cents or previous.extras_cents<>p_extras_cents then
      raise exception 'ride_operation_conflict' using errcode='P0001';
    end if;
    return public.admin_ride_settlement(p_leg);
  end if;
  action := split_part(p_kind,'_',1);
  select * into pending from private.ride_financial_unknown where leg_id=p_leg;
  if found and (pending.operation_id<>p_operation or split_part(pending.kind,'_',1)<>action
       or pending.amount_cents<>p_amount_cents or pending.extras_cents<>p_extras_cents) then
    raise exception 'ride_reconciliation_required' using errcode='P0001';
  end if;
  if exists (select 1 from private.ride_financial_events where leg_id=p_leg and operation_id=p_operation
             and kind not in ('capture_unknown','payout_unknown','refund_unknown')) then
    raise exception 'ride_operation_conflict' using errcode='P0001';
  end if;
  select * into strict b from private.ride_financial_balances where leg_id=p_leg;
  if p_extras_cents<>0 and action not in ('refund','chargeback') then
    raise exception 'invalid_input' using errcode='P0001';
  end if;

  if action='capture' then
    if b.receivable_cents<>a.fare_cents or p_amount_cents<>a.fare_cents then
      raise exception 'ride_financial_state' using errcode='P0001';
    end if;
    if p_kind='capture' then cash:=p_amount_cents; receivable:=-cash; end if;
  elsif action='payout' then
    if b.receivable_cents<>0 or b.disputed_cents<>0 or p_amount_cents>b.driver_balance_cents then
      raise exception 'ride_financial_state' using errcode='P0001';
    end if;
    if p_kind='payout' then cash:=-p_amount_cents; driver:=cash; end if;
  else
    if b.receivable_cents<>0 then raise exception 'ride_financial_state' using errcode='P0001'; end if;
    if p_kind='dispute_open' then
      if p_amount_cents>a.fare_cents-b.reversed_cents-b.disputed_cents then
        raise exception 'ride_financial_state' using errcode='P0001';
      end if;
      disputed:=p_amount_cents;
    elsif p_kind='dispute_release' then
      if p_amount_cents>b.disputed_cents then raise exception 'ride_financial_state' using errcode='P0001'; end if;
      disputed:=-p_amount_cents;
    else
      if (p_kind='chargeback' and p_amount_cents>b.disputed_cents)
         or (action='refund' and p_amount_cents>a.fare_cents-b.reversed_cents-b.disputed_cents)
         or p_extras_cents>a.extras_cents-b.reversed_extras_cents then
        raise exception 'ride_financial_state' using errcode='P0001';
      end if;
      remaining_base := a.fare_cents-a.extras_cents-(b.reversed_cents-b.reversed_extras_cents)-(p_amount_cents-p_extras_cents);
      if remaining_base<0 then raise exception 'ride_financial_state' using errcode='P0001'; end if;
      if p_kind in ('refund','chargeback') then
        -- Reverse the difference against the remaining fee on its ORIGINAL rate. New
        -- tariff versions cannot change it; integer rounding closes at a full reversal.
        fee := case when a.fee_cents=0 then 0 else (remaining_base*1000/10000-b.commission_cents)::int end;
        cash:=-p_amount_cents; driver:=cash-fee;
        if p_kind='chargeback' then disputed:=-p_amount_cents; end if;
      end if;
    end if;
  end if;
  insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,extras_cents,cash_delta,receivable_delta,
    driver_delta,fee_delta,dispute_delta,recorded_by)
    values(p_leg,p_operation,p_kind,p_amount_cents,p_extras_cents,cash,receivable,driver,fee,disputed,auth.uid());
  return public.admin_ride_settlement(p_leg);
end;
$$;
revoke all on function public.admin_ride_settlement(uuid),
  public.admin_simulate_ride_payment_event(uuid,uuid,text,integer,integer) from public,anon,service_role;
grant execute on function public.admin_ride_settlement(uuid),
  public.admin_simulate_ride_payment_event(uuid,uuid,text,integer,integer) to authenticated;
