-- A leg has its own receivable, driver balance and commission. Completing it records
-- accrual only. Nothing here posts to service payments or sends money to a PSP.
create table private.ride_financial_accounts (
  leg_id uuid primary key references public.ride_legs(id),
  environment text not null check (environment in ('simulation','live')),
  payer_id uuid not null, driver_id uuid not null,
  settlement_source text not null default 'unclaimed' check (settlement_source in ('unclaimed','manual','psp_sandbox','psp_live')),
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
    'dispute_open','dispute_release','chargeback','psp_fee','psp_fee_credit','payout_reversal')),
  amount_cents integer not null check (amount_cents > 0),
  extras_cents integer not null default 0 check (extras_cents between 0 and amount_cents),
  -- Evidence from the provider, independent of the accepted price or driver balance.
  psp_fee_cents integer not null default 0 check (psp_fee_cents >= 0),
  observed_driver_split_cents integer not null default 0 check (observed_driver_split_cents >= 0),
  -- Assets + processing expense = driver liability + platform commission.
  cash_delta integer not null default 0, receivable_delta integer not null default 0,
  driver_delta integer not null default 0, fee_delta integer not null default 0,
  dispute_delta integer not null default 0, processing_expense_delta integer not null default 0,
  recorded_by uuid, recorded_at timestamptz not null default clock_timestamp(),
  primary key (leg_id,operation_id,kind),
  exclude using gist (operation_id with =,leg_id with <>),
  check (cash_delta::bigint + receivable_delta + processing_expense_delta = driver_delta::bigint + fee_delta)
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
    coalesce(-sum(e.driver_delta) filter (where e.kind in ('payout','payout_reversal')),0)::bigint as net_paid_driver_cents,
    sum(e.dispute_delta)::bigint as disputed_cents, sum(e.processing_expense_delta)::bigint as processing_cost_cents,
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

-- An interrupted trip can cost money even when no fare is earned. Keep the
-- exposure separate from payer receivables until liability and evidence are reviewed.
create table private.ride_interruption_costs (
  leg_id uuid primary key references public.ride_legs(id),
  opened_at timestamptz not null default now(),
  cost_cents integer check (cost_cents >= 0),
  evidence_ref text, operation_id uuid unique, reviewed_by uuid, reviewed_at timestamptz,
  check ((cost_cents is null and evidence_ref is null and operation_id is null and reviewed_at is null)
      or (cost_cents is not null and evidence_ref is not null and length(trim(evidence_ref)) between 1 and 160
          and operation_id is not null and reviewed_by is not null and reviewed_at is not null))
);
alter table private.ride_interruption_costs enable row level security;
revoke all on private.ride_interruption_costs from public,anon,authenticated,service_role;
create function private.open_ride_cost_review()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into private.ride_interruption_costs(leg_id) values(new.id) on conflict do nothing;
  return new;
end; $$;
revoke all on function private.open_ride_cost_review() from public,anon,authenticated,service_role;
create trigger ride_leg_interruption_cost after update of status on public.ride_legs
  for each row when (new.driver_id is not null and new.status in ('unknown','cancelled') and old.status is distinct from new.status)
  execute function private.open_ride_cost_review();
insert into private.ride_interruption_costs(leg_id)
  select id from public.ride_legs where driver_id is not null and status in ('unknown','cancelled');

create function private.ride_settlement_snapshot(p_leg uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  a private.ride_financial_accounts%rowtype;
  b private.ride_financial_balances%rowtype;
  pending jsonb;
begin
  if not exists (select 1 from public.ride_legs l join private.ride_deployment d
                on d.environment=l.environment where l.id=p_leg) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select * into a from private.ride_financial_accounts where leg_id=p_leg;
  if not found then
    return jsonb_build_object('recognized',false,'review',(
      select jsonb_build_object('status',l.status,'environment',l.environment,'cost_cents',c.cost_cents,'evidence',c.evidence_ref)
      from private.ride_interruption_costs c join public.ride_legs l on l.id=c.leg_id where c.leg_id=p_leg));
  end if;
  select * into strict b from private.ride_financial_balances where leg_id=p_leg;
  select jsonb_build_object('operation_id',operation_id,'kind',kind,'amount_cents',amount_cents,'extras_cents',extras_cents)
    into pending from private.ride_financial_unknown where leg_id=p_leg;
  return jsonb_build_object('recognized',true,'environment',a.environment,'source',a.settlement_source,'fare_cents',a.fare_cents,
    'extras_cents',a.extras_cents,'fee_cents',a.fee_cents,'driver_cents',a.driver_cents,
    'cash_cents',b.cash_cents,'receivable_cents',b.receivable_cents,'driver_balance_cents',b.driver_balance_cents,
    'commission_cents',b.commission_cents,'disputed_cents',b.disputed_cents,'reversed_cents',b.reversed_cents,
    'reversed_extras_cents',b.reversed_extras_cents,'processing_cost_cents',b.processing_cost_cents,'net_paid_driver_cents',b.net_paid_driver_cents,'unknown',pending);
end;
$$;

revoke all on function private.ride_settlement_snapshot(uuid) from public,anon,authenticated,service_role;
create function private.require_ride_finance_admin()
returns void language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_admin();
  if not exists(select 1 from public.profiles where id=auth.uid() and deleted_at is null) then
    raise exception 'not_allowed' using errcode='P0001';
  end if;
end; $$;
revoke all on function private.require_ride_finance_admin() from public,anon,authenticated,service_role;
create function public.admin_ride_settlement(p_leg uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_ride_finance_admin();
  return private.ride_settlement_snapshot(p_leg);
end;
$$;

-- One posting engine serves both isolated rehearsals and verified PSP sandbox events.
-- Wrappers choose the source from server-side authority; neither accepts a beneficiary.
create function private.record_ride_financial_event(
  p_source text,p_leg uuid,p_operation uuid,p_kind text,p_amount_cents integer,p_extras_cents integer,
  p_psp_fee integer default 0,p_driver_split integer default 0
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a private.ride_financial_accounts%rowtype;
  b private.ride_financial_balances%rowtype;
  previous private.ride_financial_events%rowtype;
  pending private.ride_financial_unknown%rowtype;
  action text;
  cash integer := 0; receivable integer := 0; driver integer := 0; fee integer := 0; disputed integer := 0;
  remaining_base bigint; processing integer := 0;
begin
  if p_operation is null or p_operation=p_leg or p_kind is null or p_kind not in ('capture','capture_failed','capture_unknown',
     'payout','payout_failed','payout_unknown','refund','refund_failed','refund_unknown','dispute_open','dispute_release','chargeback','psp_fee','psp_fee_credit','payout_reversal')
     or p_psp_fee is null or p_psp_fee<0 or p_driver_split is null or p_driver_split<0
     or (p_source<>'psp_live' and (p_psp_fee<>0 or p_driver_split<>0 or p_kind in ('psp_fee','psp_fee_credit','payout_reversal')))
     or (p_kind<>'capture' and p_psp_fee<>0) or (p_kind not in ('capture','payout','payout_reversal') and p_driver_split<>0)
     or p_amount_cents is null or p_amount_cents<=0 or p_extras_cents is null or p_extras_cents not between 0 and p_amount_cents then
    raise exception 'invalid_input' using errcode='P0001';
  end if;
  select * into a from private.ride_financial_accounts where leg_id=p_leg for update;
  if not found then raise exception 'not_found' using errcode='P0001'; end if;
  if p_source='psp_live' then
    -- Once the operation is claimed while the gates are open, incoming fiscal
    -- facts, refunds and disputes must still reconcile after sales are stopped.
    if a.environment<>'live' or not exists(select 1 from private.ride_deployment where environment='live') then
      raise exception 'not_allowed' using errcode='P0001';
    end if;
  elsif a.environment<>'simulation' or not exists (select 1 from private.ride_deployment d
        join private.ride_network n using(environment) where d.environment='simulation' and (n.module_enabled or (p_source='psp_sandbox' and a.settlement_source='psp_sandbox'))) then
    raise exception 'not_allowed' using errcode='P0001';
  end if;
  if p_source='manual' and a.settlement_source='unclaimed' then
    update private.ride_financial_accounts set settlement_source='manual' where leg_id=p_leg;
  elsif p_source<>a.settlement_source then
    raise exception 'ride_operation_conflict' using errcode='P0001';
  end if;
  select * into previous from private.ride_financial_events
    where leg_id=p_leg and operation_id=p_operation and kind=p_kind;
  if found then
    if previous.amount_cents<>p_amount_cents or previous.extras_cents<>p_extras_cents
       or previous.psp_fee_cents<>p_psp_fee or previous.observed_driver_split_cents<>p_driver_split then
      raise exception 'ride_operation_conflict' using errcode='P0001';
    end if;
    return private.ride_settlement_snapshot(p_leg);
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
    if p_kind='capture' then
      if p_source='psp_live' and (p_driver_split<>a.driver_cents or p_amount_cents-p_psp_fee<a.driver_cents) then
        raise exception 'ride_financial_mismatch' using errcode='P0001';
      end if;
      cash:=p_amount_cents-p_psp_fee; receivable:=-p_amount_cents; processing:=p_psp_fee;
    end if;
  elsif p_kind='payout_reversal' then
    if b.receivable_cents<>0 or p_amount_cents>least(b.net_paid_driver_cents,-b.driver_balance_cents)
       or p_driver_split<>p_amount_cents then raise exception 'ride_financial_state' using errcode='P0001'; end if;
    cash:=p_amount_cents; driver:=cash;
  elsif action='payout' then
    if b.receivable_cents<>0 or b.disputed_cents<>0 or p_amount_cents>b.driver_balance_cents then
      raise exception 'ride_financial_state' using errcode='P0001';
    end if;
    if p_kind='payout' then
      if p_source='psp_live' and p_driver_split<>p_amount_cents then
        raise exception 'ride_financial_mismatch' using errcode='P0001';
      end if;
      cash:=-p_amount_cents; driver:=cash;
    end if;
  else
    if b.receivable_cents<>0 then raise exception 'ride_financial_state' using errcode='P0001'; end if;
    if p_kind in ('psp_fee','psp_fee_credit') then
      if p_kind='psp_fee_credit' and p_amount_cents>b.processing_cost_cents then raise exception 'ride_financial_state' using errcode='P0001'; end if;
      processing:=case when p_kind='psp_fee' then p_amount_cents else -p_amount_cents end;
      cash:=-processing;
    elsif p_kind='dispute_open' then
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
    driver_delta,fee_delta,dispute_delta,processing_expense_delta,psp_fee_cents,observed_driver_split_cents,recorded_by)
    values(p_leg,p_operation,p_kind,p_amount_cents,p_extras_cents,cash,receivable,driver,fee,disputed,processing,p_psp_fee,p_driver_split,auth.uid());
  return private.ride_settlement_snapshot(p_leg);
end;
$$;
revoke all on function private.record_ride_financial_event(text,uuid,uuid,text,integer,integer,integer,integer)
  from public,anon,authenticated,service_role;

create function public.admin_simulate_ride_payment_event(
  p_leg uuid,p_operation uuid,p_kind text,p_amount_cents integer,p_extras_cents integer default 0
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_ride_finance_admin();
  return private.record_ride_financial_event('manual',p_leg,p_operation,p_kind,p_amount_cents,p_extras_cents);
end;
$$;

-- The protected PSP intent claims the completed leg BEFORE making an external call.
-- No manual money events may precede or follow that claim. No personal contact data leaves SQL here.
create function public.claim_ride_sandbox_account(p_leg uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a private.ride_financial_accounts%rowtype;
begin
  if not private.is_service_role() then raise exception 'not_allowed' using errcode='P0001'; end if;
  select * into a from private.ride_financial_accounts where leg_id=p_leg for update;
  if not found then raise exception 'not_found' using errcode='P0001'; end if;
  if a.environment<>'simulation' or not exists (select 1 from private.ride_deployment d
    join private.ride_network n using(environment) where d.environment='simulation'
    and (n.module_enabled or a.settlement_source='psp_sandbox')) then
    raise exception 'not_allowed' using errcode='P0001';
  end if;
  if a.settlement_source='manual' then raise exception 'ride_operation_conflict' using errcode='P0001'; end if;
  update private.ride_financial_accounts set settlement_source='psp_sandbox' where leg_id=p_leg;
  return jsonb_build_object('environment',a.environment,'payer_id',a.payer_id,'driver_id',a.driver_id,
     'fare_cents',a.fare_cents,'extras_cents',a.extras_cents,'fee_cents',a.fee_cents,'driver_cents',a.driver_cents);
end;
$$;

create function public.record_ride_sandbox_financial_event(
  p_leg uuid,p_operation uuid,p_kind text,p_amount_cents integer,p_extras_cents integer default 0
)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_service_role() then raise exception 'not_allowed' using errcode='P0001'; end if;
  return private.record_ride_financial_event('psp_sandbox',p_leg,p_operation,p_kind,p_amount_cents,p_extras_cents);
end;
$$;
revoke all on function public.claim_ride_sandbox_account(uuid),
  public.record_ride_sandbox_financial_event(uuid,uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_ride_sandbox_account(uuid),
  public.record_ride_sandbox_financial_event(uuid,uuid,text,integer,integer) to service_role;
revoke all on function public.admin_ride_settlement(uuid),
  public.admin_simulate_ride_payment_event(uuid,uuid,text,integer,integer) from public,anon,service_role;
grant execute on function public.admin_ride_settlement(uuid),
  public.admin_simulate_ride_payment_event(uuid,uuid,text,integer,integer) to authenticated;

-- The reconciliation exercise records the platform's documented cancellation cost.
-- Zero also requires evidence. There is no client charge, commission or payment instruction.
create function public.admin_confirm_simulated_ride_cost(p_leg uuid,p_operation uuid,p_cost_cents integer,p_reference text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  c private.ride_interruption_costs%rowtype;
begin
  perform private.require_ride_finance_admin();
  if p_operation is null or p_cost_cents is null or p_cost_cents<0 or p_reference is null
    or length(trim(p_reference)) not between 1 and 160 then raise exception 'invalid_input' using errcode='P0001'; end if;
  if not exists(select 1 from public.ride_legs l join private.ride_deployment d using(environment)
    join private.ride_network n using(environment)
    where l.id=p_leg and l.status='cancelled' and d.environment='simulation' and n.module_enabled) then
    raise exception 'ride_financial_state' using errcode='P0001';
  end if;
  select * into c from private.ride_interruption_costs where leg_id=p_leg for update;
  if not found then raise exception 'not_found' using errcode='P0001'; end if;
  if c.cost_cents is not null then
    if c.operation_id<>p_operation or c.cost_cents<>p_cost_cents or c.evidence_ref<>trim(p_reference) then
      raise exception 'ride_operation_conflict' using errcode='P0001';
    end if;
  else
    update private.ride_interruption_costs set cost_cents=p_cost_cents,evidence_ref=trim(p_reference),operation_id=p_operation,
      reviewed_by=auth.uid(),reviewed_at=now() where leg_id=p_leg;
  end if;
  return private.ride_settlement_snapshot(p_leg);
end; $$;
revoke all on function public.admin_confirm_simulated_ride_cost(uuid,uuid,integer,text) from public,anon,service_role;
grant execute on function public.admin_confirm_simulated_ride_cost(uuid,uuid,integer,text) to authenticated;

-- A release for the live finance book needs its own dated evidence, in addition
-- to the configured PSP/verified wallet, deployment, module and area permissions.
create table private.ride_live_finance_release (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  evidence_ref text, until_at timestamptz,
  check (not enabled or (evidence_ref is not null and length(trim(evidence_ref)) between 1 and 160 and until_at is not null))
);
insert into private.ride_live_finance_release(singleton) values(true);
alter table private.ride_live_finance_release enable row level security;
revoke all on private.ride_live_finance_release from public,anon,authenticated,service_role;

create function public.claim_ride_live_account(p_leg uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  a private.ride_financial_accounts%rowtype;
begin
  if not private.is_service_role() then raise exception 'not_allowed' using errcode='P0001'; end if;
  select * into a from private.ride_financial_accounts where leg_id=p_leg for update;
  if not found then raise exception 'not_found' using errcode='P0001'; end if;
  if a.environment<>'live' or not exists(select 1 from private.ride_deployment where environment='live') then
    raise exception 'not_allowed' using errcode='P0001';
  end if;
  if a.settlement_source='unclaimed' then
    if not exists(select 1 from private.ride_live_finance_release where enabled and until_at>now())
       or not exists(select 1 from private.ride_network where environment='live' and module_enabled and monetization_enabled)
       or not exists(select 1 from public.ride_legs l where id=p_leg
           and private.ride_area_allowed('live',l.origin,'monetize') and private.ride_area_allowed('live',l.destination,'monetize')) then
      raise exception 'not_allowed' using errcode='P0001';
    end if;
    update private.ride_financial_accounts set settlement_source='psp_live' where leg_id=p_leg;
  elsif a.settlement_source<>'psp_live' then
    raise exception 'ride_operation_conflict' using errcode='P0001';
  end if;
  return jsonb_build_object('environment',a.environment,'payer_id',a.payer_id,'driver_id',a.driver_id,
    'fare_cents',a.fare_cents,'extras_cents',a.extras_cents,'fee_cents',a.fee_cents,'driver_cents',a.driver_cents);
end; $$;

-- Only a backend that independently read the charge and its individual split
-- from the configured live PSP may call this. A mismatch remains an incident in
-- the external intent log and never causes us to announce a payment or payout.
create function public.record_verified_live_ride_event(
  p_leg uuid,p_operation uuid,p_kind text,p_amount_cents integer,p_extras_cents integer default 0,
  p_psp_fee_cents integer default 0,p_driver_split_cents integer default 0
)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not private.is_service_role() then raise exception 'not_allowed' using errcode='P0001'; end if;
  return private.record_ride_financial_event('psp_live',p_leg,p_operation,p_kind,p_amount_cents,p_extras_cents,p_psp_fee_cents,p_driver_split_cents);
end; $$;
revoke all on function public.claim_ride_live_account(uuid),
  public.record_verified_live_ride_event(uuid,uuid,text,integer,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.claim_ride_live_account(uuid),
  public.record_verified_live_ride_event(uuid,uuid,text,integer,integer,integer,integer) to service_role;
