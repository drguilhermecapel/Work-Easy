-- One method and one book per obligation. Existing O16 Pix remains the default.
create table private.ride_method_releases (
  id uuid primary key default gen_random_uuid(), environment text not null references private.ride_network(environment),
  origin text not null, destination text not null,
  method text not null check(method in ('card','cash','pix','benefit','tips','withdrawal')),
  evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160),
  validity tstzrange not null check(not isempty(validity) and not lower_inf(validity) and not upper_inf(validity)),
  exclude using gist(environment with =,origin with =,destination with =,method with =,validity with &&)
);
create table private.ride_demand_rates (
  id uuid primary key default gen_random_uuid(), environment text not null references private.ride_network(environment),
  origin text not null, destination text not null, validity tstzrange not null check(not isempty(validity) and not lower_inf(validity) and not upper_inf(validity)),
  multiplier_bps int not null check(multiplier_bps between 10000 and 30000),
  free_wait_minutes int not null check(free_wait_minutes between 0 and 120),
  wait_cents_per_minute int not null check(wait_cents_per_minute>=0),
  absence_policy text not null check(length(trim(absence_policy)) between 1 and 480),
  evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160),
  exclude using gist(environment with =,origin with =,destination with =,validity with &&)
);
create function private.ride_price_demand() returns trigger language plpgsql set search_path='' as $$
declare entry jsonb; entries jsonb:='[]'; rule private.ride_demand_rates; base int; extras int; fee int; total bigint:=0;
begin
  if new.status<>'awaiting_consent' or not exists(select from private.ride_demand_rates where environment=new.environment) then return new; end if;
  for entry in select value from jsonb_array_elements(new.legs) loop
    select * into rule from private.ride_demand_rates where environment=new.environment and origin=entry->>'origin'
      and destination=entry->>'destination' and validity @> (entry->>'pickup_at')::timestamptz;
    if found then
      extras:=(entry->>'extras_cents')::int;
      base:=(entry->>'fare_cents')::int-extras;
      -- Persist the calculation separately from the public projection.
      new.price_rules:=new.price_rules || jsonb_build_object(entry->>'seq',jsonb_build_object('id',rule.id,
        'base_cents',base,'multiplier_bps',rule.multiplier_bps,'free_wait_minutes',rule.free_wait_minutes,
        'wait_cents_per_minute',rule.wait_cents_per_minute,'absence_policy',rule.absence_policy));
      base:=round(base::numeric*rule.multiplier_bps/10000)::int;
      fee:=case when new.environment='simulation' or
        (exists(select from private.ride_network where environment=new.environment and monetization_enabled)
        and private.ride_area_allowed(new.environment,rule.origin,'monetize') and private.ride_area_allowed(new.environment,rule.destination,'monetize'))
        then base/10 else 0 end;
      entry:=entry || jsonb_build_object('fare_cents',base+extras,'limit_cents',base+extras,'fee_cents',fee,'driver_cents',base+extras-fee);
    end if;
    entries:=entries || entry;
    total:=total+(entry->>'fare_cents')::int;
  end loop;
  new.legs:=entries; new.total_cents:=total; return new;
end $$;
alter table private.ride_quotes add column price_rules jsonb not null default '{}';
create trigger ride_quote_demand before insert on private.ride_quotes for each row execute function private.ride_price_demand();
create function public.ride_quote_payment_terms(p_quote uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('seq',e->'seq','total_cents',e->'fare_cents','extras_cents',e->'extras_cents',
    'maximum_cents',e->'limit_cents','rule',q.price_rules->(e->>'seq')) order by (e->>'seq')::int),'[]'::jsonb)
  from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) e
  where q.id=p_quote and q.environment=private.ride_env() and private.ride_active_user(auth.uid()) and (e->>'payer_id')::uuid=auth.uid()
$$;

create table private.ride_order_plans (
  leg_id uuid primary key references public.ride_legs(id), original_payer uuid not null, environment text not null,
  created_at timestamptz not null default clock_timestamp()
);
create table private.ride_payment_orders (
  id uuid primary key default gen_random_uuid(), leg_id uuid not null references private.ride_order_plans(leg_id),
  payer uuid not null, component text not null check(component in ('fare','tip','wait')),
  method text not null check(method in ('card','cash','pix')), release_id uuid not null references private.ride_method_releases(id),
  amount_cents integer not null check(amount_cents>0), extras_cents int not null check(extras_cents between 0 and amount_cents),
  commission_cents int not null check(commission_cents between 0 and amount_cents-extras_cents),
  status text not null default 'open' check(status in ('open','pending','unknown','settling','review','paid','cancelled')),
  received_cents int not null default 0 check(received_cents between 0 and amount_cents),
  refunded_cents int not null default 0 check(refunded_cents between 0 and received_cents),
  refunded_extras int not null default 0 check(refunded_extras between 0 and extras_cents and refunded_extras<=refunded_cents),
  driver_paid int not null default 0 check(driver_paid between 0 and amount_cents),
  driver_returned int not null default 0 check(driver_returned between 0 and driver_paid),
  fee_cents int not null default 0 check(fee_cents>=0), created_at timestamptz not null default clock_timestamp(),
  unique (leg_id,payer,component)
);
create table private.ride_share_invites (
  id uuid primary key default gen_random_uuid(), source_order uuid not null references private.ride_payment_orders(id), recipient uuid not null,
  cents int not null check(cents>0), expires_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','accepted','declined','expired','revoked')),
  created_at timestamptz not null default now()
);
create index ride_share_recipient on private.ride_share_invites(recipient,status);
create table private.ride_benefits (
  id uuid primary key default gen_random_uuid(), environment text not null, owner_id uuid not null,
  funding_ref text not null check(length(trim(funding_ref)) between 1 and 160),
  source text not null check(source in ('promotion','remediation','prepaid')),
  awarded_cents int not null check(awarded_cents>0), available_cents int not null check(available_cents between 0 and awarded_cents),
  valid_until timestamptz not null
);
create table private.ride_benefit_uses (
  order_id uuid primary key references private.ride_payment_orders(id), benefit_id uuid not null references private.ride_benefits(id),
  applied_cents int not null check(applied_cents>0), restored_cents int not null default 0 check(restored_cents between 0 and applied_cents)
);
create table private.ride_order_events (
  id bigint generated always as identity primary key, order_id uuid not null references private.ride_payment_orders(id),
  action text not null, operation_id uuid not null, actor uuid, data jsonb not null default '{}', at timestamptz not null default clock_timestamp(),
  unique(operation_id,action)
);
create index ride_order_history on private.ride_order_events(order_id,id);
create table private.ride_order_cases (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references private.ride_payment_orders(id),
  payer_id uuid not null, reason text not null check(length(trim(reason)) between 1 and 500), requested_cents int not null check(requested_cents>0),
  status text not null default 'open' check(status in ('open','approved','declined','settled')), decision text, decided_by uuid,
  created_at timestamptz not null default now()
);
create unique index ride_order_pending_case on private.ride_order_cases(order_id) where status in ('open','approved');

create function private.ride_method(l public.ride_legs,m text) returns uuid language sql stable set search_path='' as $$
  select g.id from private.ride_method_releases g
  join private.ride_network n on n.environment=g.environment and n.module_enabled
  where g.environment=private.ride_env() and g.environment=l.environment and g.origin=l.origin and g.destination=l.destination
    and g.method=m and g.validity @> now() and (g.environment='simulation' or (
      n.monetization_enabled and private.ride_area_allowed('live',l.origin,'monetize') and private.ride_area_allowed('live',l.destination,'monetize')
      and exists(select from private.ride_live_finance_release where enabled and until_at>now())))
$$;
alter table private.ride_financial_accounts drop constraint ride_financial_accounts_settlement_source_check;
alter table private.ride_financial_accounts add check (settlement_source in ('unclaimed','manual','psp_sandbox','psp_live','orders'));
create function private.guard_order_book() returns trigger language plpgsql set search_path='' as $$
begin
  if exists(select from private.ride_order_plans where leg_id=new.leg_id) then
    if tg_op='INSERT' and new.settlement_source='unclaimed' then new.settlement_source:='orders';
    elsif new.settlement_source<>'orders' then raise exception 'ride_operation_conflict'; end if;
  end if;
  return new;
end $$;
create trigger ride_order_book_guard before insert or update of settlement_source on private.ride_financial_accounts
 for each row execute function private.guard_order_book();

-- Rate, eligibility, beneficiary and totals come from the signed leg. No client chooses them.
create function public.ride_open_payment_order(p_leg uuid,p_method text) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; release uuid; o private.ride_payment_orders; source text;
begin
 select * into l from public.ride_legs where id=p_leg and payer_id=auth.uid() and environment=private.ride_env() for update;
 if not found or not private.ride_active_user(auth.uid()) or p_method is null or p_method not in ('cash','card','pix') then raise exception 'not_allowed'; end if;
 select * into o from private.ride_payment_orders where leg_id=l.id and payer=auth.uid() and component='fare';
 if found then
   if o.method<>p_method then raise exception 'ride_operation_conflict'; end if; return o.id;
 end if;
 release:=private.ride_method(l,p_method);
 if release is null or l.status in ('cancelled','unknown') or (p_method='cash' and l.status not in ('requested','accepted','arriving')) then
  raise exception 'ride_feature_disabled'; end if;
 select settlement_source into source from private.ride_financial_accounts where leg_id=l.id for update;
 if source is not null and source<>'unclaimed' then raise exception 'ride_operation_conflict'; end if;
 if exists(select from private.ride_sandbox_charges where leg_id=l.id) or exists(select from private.ride_live_charges where leg_id=l.id)
 then raise exception 'ride_operation_conflict'; end if;
 insert into private.ride_order_plans(leg_id,original_payer,environment) values(l.id,l.payer_id,l.environment);
 update private.ride_financial_accounts set settlement_source='orders' where leg_id=l.id;
 insert into private.ride_payment_orders(leg_id,payer,component,method,release_id,amount_cents,extras_cents,commission_cents)
 values(l.id,l.payer_id,'fare',p_method,release,l.fare_cents,l.extras_cents,l.fee_cents) returning * into o;
 insert into private.ride_order_events(order_id,action,operation_id,actor) values(o.id,'authorized',o.id,auth.uid());
 return o.id;
end $$;

-- A single URL token is insufficient. Only the named, active account can accept.
create function public.ride_invite_fare_share(p_order uuid,p_recipient uuid,p_cents int,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; i private.ride_share_invites; plan private.ride_order_plans;
begin
 select * into o from private.ride_payment_orders where id=p_order and payer=auth.uid() for update;
 if not found or not private.ride_active_user(auth.uid()) then raise exception 'not_allowed'; end if;
 select * into plan from private.ride_order_plans where leg_id=o.leg_id;
 if plan.original_payer<>auth.uid() or plan.environment<>private.ride_env() then raise exception 'not_allowed'; end if;
 select * into i from private.ride_share_invites where id=p_key;
 if found then
   if (i.source_order,i.recipient,i.cents) is distinct from (o.id,p_recipient,p_cents) then raise exception 'ride_operation_conflict'; end if;
   return i.id;
 end if;
 if not private.ride_active_user(p_recipient) or p_recipient=auth.uid() or p_key is null or p_cents is null
   or p_cents not between 1 and o.amount_cents-1 or o.component<>'fare' or o.method='cash' or o.status<>'open'
   or o.received_cents<>0 or exists(select from private.ride_benefit_uses where order_id=o.id)
   or exists(select from private.ride_payment_orders where leg_id=o.leg_id and payer=p_recipient and component='fare') then raise exception 'invalid_input'; end if;
 update private.ride_share_invites set status='expired' where source_order=o.id and status='pending' and expires_at<=now();
 if exists(select from private.ride_share_invites where source_order=o.id and status='pending') then raise exception 'ride_operation_conflict'; end if;
 insert into private.ride_share_invites(id,source_order,recipient,cents,expires_at) values(p_key,o.id,p_recipient,p_cents,now()+interval '15 minutes');
 return p_key;
end $$;
create function public.ride_answer_fare_share(p_invite uuid,p_accept boolean) returns text
language plpgsql security definer set search_path='' as $$
declare i private.ride_share_invites; o private.ride_payment_orders; l public.ride_legs; extras int; fee int; created uuid; desired text;
begin
 if not private.ride_active_user(auth.uid()) or p_accept is null then raise exception 'not_allowed'; end if;
 select * into i from private.ride_share_invites where id=p_invite and recipient=auth.uid();
 if not found then raise exception 'not_allowed'; end if;
 select * into strict o from private.ride_payment_orders where id=i.source_order for update;
 select * into strict l from public.ride_legs where id=o.leg_id and environment=private.ride_env();
 select * into strict i from private.ride_share_invites where id=p_invite for update;
 desired:=case when p_accept then 'accepted' else 'declined' end;
 if i.status=desired then return i.status; end if;
 if i.status<>'pending' or i.expires_at<=now() then
   if i.status='pending' then update private.ride_share_invites set status='expired' where id=i.id; end if;
   return case when i.status='pending' then 'expired' else i.status end;
 end if;
 if p_accept then
   if o.status<>'open' or l.status in ('cancelled','unknown') or o.received_cents<>0 or private.ride_method(l,o.method) is null
      or not private.ride_active_user(o.payer) then raise exception 'ride_financial_state'; end if;
   extras:=(o.extras_cents::bigint*i.cents/o.amount_cents)::int;
   fee:=case when o.amount_cents=o.extras_cents then 0 else (o.commission_cents::bigint*(i.cents-extras)/(o.amount_cents-o.extras_cents))::int end;
   insert into private.ride_payment_orders(leg_id,payer,component,method,release_id,amount_cents,extras_cents,commission_cents)
   values(o.leg_id,auth.uid(),'fare',o.method,o.release_id,i.cents,extras,fee) returning id into created;
   update private.ride_payment_orders set amount_cents=amount_cents-i.cents,extras_cents=extras_cents-extras,commission_cents=commission_cents-fee where id=o.id;
   insert into private.ride_order_events(order_id,action,operation_id,actor,data)
     values(o.id,'share_out',i.id,auth.uid(),jsonb_build_object('cents',i.cents)),(created,'share_in',i.id,auth.uid(),jsonb_build_object('cents',i.cents));
 end if;
 update private.ride_share_invites set status=desired where id=i.id; return desired;
end $$;

-- Sources of funds are separate from revenue. A restored promotional cent goes back
-- to its original funding line and never becomes a second cash refund.
create table private.ride_benefit_campaigns (
  id uuid primary key default gen_random_uuid(), environment text not null, funding_ref text not null,
  budget_cents int not null check(budget_cents between 1 and 30000),
  committed_cents int not null default 0 check(committed_cents between 0 and budget_cents),
  validity tstzrange not null check(not isempty(validity) and not lower_inf(validity) and not upper_inf(validity))
);
alter table private.ride_benefits add column campaign_id uuid references private.ride_benefit_campaigns(id),
 add check(source<>'promotion' or campaign_id is not null);
alter table private.ride_financial_events add column benefit_delta integer not null default 0;
alter table private.ride_financial_events drop constraint ride_financial_events_check1;
alter table private.ride_financial_events add check(cash_delta::bigint+receivable_delta+processing_expense_delta+benefit_delta=driver_delta::bigint+fee_delta);
alter table private.ride_financial_events drop constraint ride_financial_events_kind_check;
alter table private.ride_financial_events add check(kind in ('earned','capture','capture_failed','capture_unknown','payout','payout_failed','payout_unknown',
 'refund','refund_failed','refund_unknown','dispute_open','dispute_release','chargeback','psp_fee','psp_fee_credit','payout_reversal',
 'tip_earned','wait_earned','direct_cash','benefit','benefit_restored','cash_refund','cash_commission_settled'));

create function public.ride_add_order_component(p_leg uuid,p_component text,p_cents int,p_method text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; o private.ride_payment_orders; term jsonb; arrived timestamptz; boarded timestamptz; calculated bigint;
  release uuid; fee int; extras int;
begin
 select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() and payer_id=auth.uid() for update;
 if not found or not private.ride_active_user(auth.uid()) or p_key is null or p_cents is null or p_cents<=0
   or p_component is null or p_component not in ('tip','wait') or p_method is null or p_method not in ('card','pix') then raise exception 'not_allowed'; end if;
 select * into o from private.ride_payment_orders where leg_id=l.id and payer=auth.uid() and component=p_component;
 if found then
   if (o.id,o.amount_cents,o.method) is distinct from (p_key,p_cents,p_method) then raise exception 'ride_operation_conflict'; end if;
   return o.id;
 end if;
 release:=private.ride_method(l,p_method);
 if l.status<>'completed' or release is null or not exists(select from private.ride_order_plans where leg_id=l.id)
   or (p_component='tip' and private.ride_method(l,'tips') is null) then raise exception 'ride_feature_disabled'; end if;
 if p_component='wait' then
   select q.price_rules->(l.quote_seq::text) into term from private.ride_quotes q where q.id=l.source_quote_id;
   select a.arrived_at into arrived from private.ride_pickup_arrivals a where a.leg_id=l.id;
   select min(at) into boarded from private.ride_events where leg_id=l.id and to_status='boarded';
   if term is null or arrived is null or boarded is null or boarded<arrived then raise exception 'ride_financial_state'; end if;
   calculated:=greatest(0,floor(extract(epoch from (boarded-arrived))/60)::bigint-(term->>'free_wait_minutes')::int)*(term->>'wait_cents_per_minute')::int;
   if p_cents<>calculated then raise exception 'ride_financial_mismatch'; end if;
 end if;
 fee:=case when p_component='wait' and (l.environment='simulation' or l.fee_cents>0) then p_cents/10 else 0 end;
 extras:=case when p_component='tip' then p_cents else 0 end;
 insert into private.ride_payment_orders(id,leg_id,payer,component,method,release_id,amount_cents,extras_cents,commission_cents)
 values(p_key,l.id,auth.uid(),p_component,p_method,release,p_cents,extras,fee);
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(p_key,'authorized',p_key,auth.uid(),jsonb_build_object('cents',p_cents));
 insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,extras_cents,receivable_delta,driver_delta,fee_delta,recorded_by)
 values(l.id,p_key,p_component||'_earned',p_cents,extras,p_cents,p_cents-fee,fee,auth.uid());
 return p_key;
end $$;

create function public.ride_apply_order_benefit(p_order uuid,p_benefit uuid,p_cents int) returns int
language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; l public.ride_legs; b private.ride_benefits; used private.ride_benefit_uses; scope_id uuid;
begin
 select * into o from private.ride_payment_orders where id=p_order and payer=auth.uid() for update;
 if not found or not private.ride_active_user(auth.uid()) or p_cents is null or p_cents<=0 then raise exception 'not_allowed'; end if;
 select * into strict l from public.ride_legs where id=o.leg_id and environment=private.ride_env();
 select * into used from private.ride_benefit_uses where order_id=o.id;
 if found then
  if (used.benefit_id,used.applied_cents) is distinct from (p_benefit,p_cents) then raise exception 'ride_operation_conflict'; end if;
  return p_cents;
 end if;
 if o.component<>'fare' or o.status<>'open' or o.method='cash' or l.status<>'completed' or o.received_cents<>0 or p_cents>o.amount_cents
   or private.ride_method(l,'benefit') is null or exists(select from private.ride_share_invites where source_order=o.id and status='pending' and expires_at>now())
 then raise exception 'ride_financial_state'; end if;
 select coalesce(r.booking_id,r.id) into scope_id from public.rides r where r.id=l.ride_id;
 perform pg_advisory_xact_lock(hashtextextended('ride-benefit:'||scope_id,0));
 select * into b from private.ride_benefits where id=p_benefit and owner_id=auth.uid() and environment=l.environment for update;
 if not found or b.valid_until<=now() or b.available_cents<p_cents then raise exception 'benefit_unavailable'; end if;
 if b.source='promotion' then
   if p_cents+coalesce((select sum(u.applied_cents-u.restored_cents) from private.ride_benefit_uses u
     join private.ride_benefits other on other.id=u.benefit_id and other.source='promotion'
     join private.ride_payment_orders po on po.id=u.order_id join public.ride_legs leg on leg.id=po.leg_id
     join public.rides r on r.id=leg.ride_id where coalesce(r.booking_id,r.id)=scope_id),0)>1000 then raise exception 'benefit_unavailable'; end if;
   update private.ride_benefit_campaigns set committed_cents=committed_cents+p_cents where id=b.campaign_id and environment=l.environment
     and validity @> now() and committed_cents+p_cents<=budget_cents;
   if not found then raise exception 'benefit_unavailable'; end if;
 end if;
 update private.ride_benefits set available_cents=available_cents-p_cents where id=b.id;
 insert into private.ride_benefit_uses(order_id,benefit_id,applied_cents) values(o.id,b.id,p_cents);
 update private.ride_payment_orders set received_cents=p_cents,status=case when p_cents=amount_cents then 'paid' else 'open' end where id=o.id;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(o.id,'benefit',o.id,auth.uid(),jsonb_build_object('cents',p_cents,'source',b.source));
 insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,receivable_delta,benefit_delta,recorded_by)
 values(o.leg_id,o.id,'benefit',p_cents,-p_cents,p_cents,auth.uid());
 return p_cents;
end $$;

create table private.ride_cash_receipts (
  id uuid primary key, order_id uuid not null references private.ride_payment_orders(id),
  tendered_cents int not null check(tendered_cents>0), change_cents int not null check(change_cents between 0 and tendered_cents-1),
  driver_id uuid not null, status text not null default 'reported' check(status in ('reported','confirmed','contested')),
  unique(order_id,id)
);
create unique index ride_cash_open on private.ride_cash_receipts(order_id) where status in ('reported','contested');
create function public.ride_cash_report(p_order uuid,p_tendered int,p_change int,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; o private.ride_payment_orders; r private.ride_cash_receipts;
begin
 select * into o from private.ride_payment_orders where id=p_order for update;
 select * into l from public.ride_legs where id=o.leg_id and driver_id=auth.uid() and environment=private.ride_env();
 if not found or not private.ride_active_user(auth.uid()) or o.method<>'cash' then raise exception 'not_allowed'; end if;
 select * into r from private.ride_cash_receipts where id=p_key;
 if found then
  if (r.order_id,r.tendered_cents,r.change_cents) is distinct from (o.id,p_tendered,p_change) then raise exception 'ride_operation_conflict'; end if;
  return r.id;
 end if;
 if l.status<>'completed' or p_key is null or p_tendered is null or p_change is null or p_change<0 or p_tendered<=p_change
    or p_tendered-p_change>o.amount_cents-o.received_cents or o.status<>'open' then raise exception 'ride_financial_state'; end if;
 insert into private.ride_cash_receipts(id,order_id,tendered_cents,change_cents,driver_id) values(p_key,o.id,p_tendered,p_change,auth.uid());
 return p_key;
end $$;
create function public.ride_cash_confirm(p_receipt uuid,p_agree boolean) returns text
language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; r private.ride_cash_receipts; amount int; result text;
begin
 select * into r from private.ride_cash_receipts where id=p_receipt;
 select ord.* into o from private.ride_payment_orders ord join private.ride_order_plans plan on plan.leg_id=ord.leg_id
   where ord.id=r.order_id and ord.payer=auth.uid() and plan.environment=private.ride_env() for update of ord;
 if not found or not private.ride_active_user(auth.uid()) or p_agree is null then raise exception 'not_allowed'; end if;
 select * into strict r from private.ride_cash_receipts where id=p_receipt for update;
 result:=case when p_agree then 'confirmed' else 'contested' end;
 if r.status=result then return result; end if;
 if r.status<>'reported' then raise exception 'ride_operation_conflict'; end if;
 amount:=r.tendered_cents-r.change_cents;
 update private.ride_cash_receipts set status=result where id=r.id;
 if p_agree then
   update private.ride_payment_orders set received_cents=received_cents+amount,
    status=case when received_cents+amount=amount_cents then 'paid' else 'open' end where id=o.id;
   insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,receivable_delta,driver_delta,recorded_by)
     values(o.leg_id,r.id,'direct_cash',amount,-amount,-amount,auth.uid());
 else
   update private.ride_payment_orders set status='review' where id=o.id;
 end if;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data)
   values(o.id,'cash_'||result,r.id,auth.uid(),jsonb_build_object('cents',amount,'tendered',r.tendered_cents,'change',r.change_cents));
 return result;
end $$;
-- On a short cash payment the same payer may explicitly choose Pix ONLY for the outstanding balance.
create function public.ride_cash_balance_pix(p_order uuid) returns int language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; l public.ride_legs; rel uuid;
begin
 select * into o from private.ride_payment_orders where id=p_order and payer=auth.uid() for update;
 if not found or not private.ride_active_user(auth.uid()) then raise exception 'not_allowed'; end if;
 select * into strict l from public.ride_legs where id=o.leg_id and environment=private.ride_env();
 if o.method='pix' and exists(select from private.ride_order_events where order_id=o.id and action='cash_balance_pix') then return o.amount_cents-o.received_cents; end if;
 rel:=private.ride_method(l,'pix');
 if rel is null or o.method<>'cash' or l.status<>'completed' or o.status<>'open' or o.received_cents not between 1 and o.amount_cents-1
   or exists(select from private.ride_cash_receipts where order_id=o.id and status<>'confirmed') then raise exception 'ride_financial_state'; end if;
 update private.ride_payment_orders set method='pix',release_id=rel where id=o.id;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(o.id,'cash_balance_pix',o.id,auth.uid(),jsonb_build_object('cents',o.amount_cents-o.received_cents));
 return o.amount_cents-o.received_cents;
end $$;

create table private.ride_order_test_wallets (
  driver_id uuid primary key references public.ride_drivers(id), wallet_id uuid not null unique, platform_wallet uuid not null,
  evidence_ref text not null check(length(trim(evidence_ref))>0), valid_until timestamptz not null, check(wallet_id<>platform_wallet)
);
create table private.ride_order_psp (
  order_id uuid primary key references private.ride_payment_orders(id), environment text not null, contract_id uuid not null,
  customer_ref text not null, wallet uuid not null, amount_cents int not null check(amount_cents>0),
  split_cents int not null check(split_cents between 0 and amount_cents), method text not null check(method in ('card','pix')),
  sent boolean not null default false, captured boolean not null default false, payment_id text unique,
  invoice text, reversed_cents int not null default 0, refunded_split_cents int not null default 0
);
create function private.ride_order_binding(l public.ride_legs,o private.ride_payment_orders)
returns table(customer text,wallet uuid) language sql stable set search_path='' as $$
 select c.customer_ref,w.wallet_id from private.ride_order_test_wallets w,private.ride_sandbox_customers c,private.ride_sandbox_psp g
 where l.environment='simulation' and g.enabled and w.driver_id=l.driver_id and w.valid_until>now() and c.payer_id=o.payer
 union all
 select c.customer_ref,w.wallet_id from private.ride_live_psp_wallets w, private.ride_live_psp_customers c,private.ride_live_psp_corridors g
 where l.environment='live' and w.driver_id=l.driver_id and c.payer_id=o.payer and g.origin=l.origin and g.destination=l.destination
   and g.platform_wallet<>w.wallet_id and least(w.valid_until,c.valid_until,g.valid_until)>now()
$$;
create function public.ride_order_provider_intent(p_order uuid,p_environment text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('leg_id',s.order_id,'customer',s.customer_ref,'wallet',s.wallet,'amount_cents',s.amount_cents,
   'driver_cents',s.split_cents,'extras_cents',o.extras_cents,'method',case s.method when 'card' then 'CREDIT_CARD' else 'PIX' end,
   'payment_id',s.payment_id,'create',not s.sent and s.payment_id is null)
 from private.ride_order_psp s join private.ride_payment_orders o on o.id=s.order_id
 where s.order_id=p_order and s.environment=private.ride_env() and s.environment=p_environment
$$;
create function public.ride_prepare_order_payment(p_order uuid,p_payer uuid,p_environment text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; l public.ride_legs; rel uuid; binding record; remaining int; cash_paid int;
begin
 if p_environment is distinct from private.ride_env() or not private.ride_active_user(p_payer) then raise exception 'not_allowed'; end if;
 select * into o from private.ride_payment_orders where id=p_order and payer=p_payer for update;
 if not found then raise exception 'not_allowed'; end if;
 if exists(select from private.ride_order_psp where order_id=o.id) then return public.ride_order_provider_intent(o.id,p_environment); end if;
 select * into l from public.ride_legs where id=o.leg_id and environment=p_environment and status='completed';
 if not found or not private.ride_active_user(l.driver_id) then raise exception 'ride_financial_state'; end if;
 rel:=private.ride_method(l,o.method);
 if rel is null or rel<>o.release_id or o.method='cash' or o.status<>'open' or o.amount_cents<=o.received_cents
    or exists(select from private.ride_share_invites where source_order=o.id and status='pending' and expires_at>now())
 then raise exception 'ride_feature_disabled'; end if;
 select * into binding from private.ride_order_binding(l,o);
 if not found then raise exception 'ride_feature_disabled'; end if;
 remaining:=o.amount_cents-o.received_cents;
 select coalesce(sum(tendered_cents-change_cents),0) into cash_paid from private.ride_cash_receipts where order_id=o.id and status='confirmed';
 insert into private.ride_order_psp(order_id,environment,contract_id,customer_ref,wallet,amount_cents,split_cents,method)
 values(o.id,l.environment,rel,binding.customer,binding.wallet,remaining,least(remaining,greatest(0,o.amount_cents-o.commission_cents-cash_paid)),o.method);
 update private.ride_payment_orders set status='unknown' where id=o.id;
 return public.ride_order_provider_intent(o.id,p_environment);
end $$;
create function public.ride_claim_order_send(p_order uuid,p_environment text) returns boolean language plpgsql security definer set search_path='' as $$
declare s private.ride_order_psp; o private.ride_payment_orders; l public.ride_legs;
begin
 select * into o from private.ride_payment_orders where id=p_order for update;
 select * into s from private.ride_order_psp where order_id=o.id and environment=p_environment and environment=private.ride_env() for update;
 if not found or s.sent or s.payment_id is not null then return false; end if;
 select * into l from public.ride_legs where id=o.leg_id;
 if private.ride_method(l,o.method) is distinct from s.contract_id or not private.ride_active_user(o.payer) or not private.ride_active_user(l.driver_id)
   or not exists(select from private.ride_order_binding(l,o) b where (b.customer,b.wallet)=(s.customer_ref,s.wallet)) then return false; end if;
 update private.ride_order_psp set sent=true where order_id=o.id;
 return true;
end $$;

create function public.ride_request_order_review(p_order uuid,p_cents int,p_reason text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; c private.ride_order_cases;
begin
 select po.* into o from private.ride_payment_orders po join private.ride_order_plans pl on pl.leg_id=po.leg_id and pl.environment=private.ride_env()
   where po.id=p_order and po.payer=auth.uid() for update of po;
 if not found or not private.ride_active_user(auth.uid()) then raise exception 'not_allowed'; end if;
 select * into c from private.ride_order_cases where id=p_key;
 if found then
   if (c.order_id,c.requested_cents,c.reason) is distinct from (o.id,p_cents,trim(p_reason)) then raise exception 'ride_operation_conflict'; end if;
   return c.id;
 end if;
 if p_cents is null or p_cents not between 1 and o.received_cents-o.refunded_cents or p_key is null then raise exception 'ride_financial_state'; end if;
 insert into private.ride_order_cases(id,order_id,payer_id,reason,requested_cents) values(p_key,o.id,auth.uid(),trim(p_reason),p_cents);
 return p_key;
end $$;
create function public.ride_decide_order_review(p_case uuid,p_approve boolean,p_reason text) returns text
language plpgsql security definer set search_path='' as $$
declare c private.ride_order_cases; target text;
begin
 perform private.require_ride_finance_admin();
 select rc.* into c from private.ride_order_cases rc join private.ride_payment_orders o on o.id=rc.order_id
 join private.ride_order_plans p on p.leg_id=o.leg_id and p.environment=private.ride_env() where rc.id=p_case for update of rc;
 if not found or p_approve is null or length(trim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'invalid_input'; end if;
 target:=case when p_approve then 'approved' else 'declined' end;
 if c.status<>'open' then
   if c.status<>target or c.decision<>trim(p_reason) then raise exception 'ride_operation_conflict'; end if; return target;
 end if;
 update private.ride_order_cases set status=target,decision=trim(p_reason),decided_by=auth.uid() where id=c.id;
 return target;
end $$;

-- Post a confirmed refund to the original payer and source. Multiple fare shares
-- use one residual D14 base, preserving rounding even after staggered partial refunds.
create function private.ride_order_reverse(p_order uuid,p_amount int,p_extras int,p_origin text,p_op uuid) returns void
language plpgsql set search_path='' as $$
declare o private.ride_payment_orders; l public.ride_legs; used private.ride_benefit_uses; b private.ride_benefits;
  original_base bigint; reversed_base bigint; fee_change int:=0; funding int:=0; cash int:=0; outstanding int;
begin
 select * into strict o from private.ride_payment_orders where id=p_order for update;
 perform 1 from private.ride_financial_accounts where leg_id=o.leg_id for update;
 select * into strict l from public.ride_legs where id=o.leg_id;
 if p_amount is null or p_amount not between 1 and o.received_cents-o.refunded_cents or p_extras is null
    or p_extras not between 0 and least(p_amount,o.extras_cents-o.refunded_extras)
    or p_amount-p_extras>o.amount_cents-o.extras_cents-o.refunded_cents+o.refunded_extras then raise exception 'ride_financial_mismatch'; end if;
 select sum(amount_cents-extras_cents),sum(refunded_cents-refunded_extras) into original_base,reversed_base from private.ride_payment_orders
   where leg_id=o.leg_id and component=o.component;
 if o.component<>'tip' and exists(select from private.ride_payment_orders where leg_id=o.leg_id and component=o.component and commission_cents>0) then
   fee_change:=((original_base-reversed_base-(p_amount-p_extras))/10-(original_base-reversed_base)/10)::int;
 end if;
 if p_origin='benefit' then
   select * into used from private.ride_benefit_uses where order_id=o.id for update;
   if not found or p_amount>used.applied_cents-used.restored_cents then raise exception 'ride_financial_mismatch'; end if;
   update private.ride_benefit_uses set restored_cents=restored_cents+p_amount where order_id=o.id;
   update private.ride_benefits set available_cents=available_cents+p_amount where id=used.benefit_id returning * into b;
   if b.source='promotion' then update private.ride_benefit_campaigns set committed_cents=committed_cents-p_amount where id=b.campaign_id; end if;
   funding:=-p_amount;
 elsif p_origin='psp' then cash:=-p_amount;
 elsif p_origin='cash' then
   select coalesce(sum(tendered_cents-change_cents),0) into outstanding from private.ride_cash_receipts where order_id=o.id and status='confirmed';
   if p_amount>outstanding-coalesce((select sum((data->>'cents')::int) from private.ride_order_events where order_id=o.id and action='cash_refund'),0)
     then raise exception 'ride_financial_mismatch'; end if;
 else raise exception 'invalid_input'; end if;
 insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,extras_cents,cash_delta,benefit_delta,driver_delta,fee_delta,recorded_by)
 values(l.id,p_op,case p_origin when 'benefit' then 'benefit_restored' when 'cash' then 'cash_refund' else 'refund' end,
        p_amount,p_extras,cash,funding,cash+funding-fee_change,fee_change,auth.uid());
 update private.ride_payment_orders set refunded_cents=refunded_cents+p_amount,refunded_extras=refunded_extras+p_extras where id=o.id;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data)
 values(o.id,p_origin||'_refund',p_op,auth.uid(),jsonb_build_object('cents',p_amount,'extras',p_extras,'commission_change',fee_change));
end $$;

create function public.ride_refund_order_source(p_case uuid,p_origin text,p_extras int,p_reference text) returns text
language plpgsql security definer set search_path='' as $$
declare c private.ride_order_cases; o private.ride_payment_orders; l public.ride_legs;
begin
 perform private.require_ride_finance_admin();
 select * into c from private.ride_order_cases where id=p_case for update;
 select po.* into o from private.ride_payment_orders po join private.ride_order_plans pl on pl.leg_id=po.leg_id and pl.environment=private.ride_env() where po.id=c.order_id for update of po;
 if not found or c.status not in ('approved','settled') or p_origin is null or p_origin not in ('benefit','cash')
    or length(trim(coalesce(p_reference,''))) not between 1 and 160 then raise exception 'ride_financial_state'; end if;
 if c.status='settled' then
   if not exists(select from private.ride_order_events where order_id=o.id and operation_id=c.id and action='refund_evidence'
      and data=jsonb_build_object('origin',p_origin,'reference',trim(p_reference),'extras',p_extras)) then raise exception 'ride_operation_conflict'; end if;
   return c.status;
 end if;
 perform private.ride_order_reverse(o.id,c.requested_cents,p_extras,p_origin,c.id);
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(o.id,'refund_evidence',c.id,auth.uid(),
 jsonb_build_object('origin',p_origin,'reference',trim(p_reference),'extras',p_extras));
 update private.ride_order_cases set status='settled' where id=c.id;
 return 'settled';
end $$;

create table private.ride_order_provider_reviews (
 order_id uuid not null references private.ride_payment_orders(id), payment_id text not null, reason text not null,
 observed jsonb not null, observed_at timestamptz not null default now(), primary key(order_id,payment_id,reason,observed)
);
create table private.ride_order_refund_allocation (
 order_id uuid not null references private.ride_payment_orders(id), cumulative_cents int not null check(cumulative_cents>0),
 extras_cents int not null check(extras_cents between 0 and cumulative_cents),
 evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160), primary key(order_id,cumulative_cents)
);
create function public.ride_observe_order_payment(p_order uuid,p_environment text,p_fact jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; s private.ride_order_psp; l public.ride_legs; state text:=p_fact->>'status'; reason text:=p_fact->>'reason';
 payment text:=p_fact->>'payment'; refunded int:=(p_fact->>'refunded')::int; split int:=(p_fact->>'splitCents')::int;
 paid int:=(p_fact->>'paidToDriver')::int; returned int:=(p_fact->>'returnedByDriver')::int; processor int:=(p_fact->>'pspFee')::int;
 invoice_link text:=p_fact->>'invoice'; prefix text; delta int; extras int; operation uuid; actual_cash int;
begin
 select * into o from private.ride_payment_orders where id=p_order for update;
 select * into s from private.ride_order_psp where order_id=p_order and environment=p_environment and environment=private.ride_env() for update;
 if not found or payment is null or payment !~ '^pay_[a-zA-Z0-9_-]{1,100}$' then raise exception 'not_allowed'; end if;
 perform 1 from private.ride_financial_accounts where leg_id=o.leg_id for update;
 prefix:=case p_environment when 'live' then '^https://www\.asaas\.com/i/[a-zA-Z0-9_-]+$' else '^https://sandbox\.asaas\.com/i/[a-zA-Z0-9_-]+$' end;
 select * into strict l from public.ride_legs where id=o.leg_id;
 perform pg_advisory_xact_lock(hashtextextended('ride-wallet:'||l.environment||l.driver_id,0));
 if (p_fact->>'customer') is distinct from s.customer_ref or (p_fact->>'amount')::int is distinct from s.amount_cents
   or (s.payment_id is not null and s.payment_id<>payment) or (invoice_link is not null and invoice_link !~ prefix)
   or state is null or state not in ('pending','settling','paid','cancelled') or (state='pending' and invoice_link is null)
   or split is distinct from s.split_cents or processor is null or processor not between 0 and s.amount_cents-s.split_cents
   or paid is null or paid not in (0,s.split_cents) or returned is null or returned not between 0 and greatest(paid,o.driver_paid)
   or refunded is null or refunded not between 0 and s.amount_cents or returned>refunded
   or (s.captured and processor<>o.fee_cents) then reason:=coalesce(reason,'payment_mismatch'); end if;
 delta:=refunded-s.reversed_cents;
 if delta>0 then
   if o.extras_cents=o.amount_cents then extras:=delta;
   elsif o.extras_cents=0 then extras:=0;
   elsif delta=o.amount_cents-o.refunded_cents and o.received_cents+(case when not s.captured and state='paid' then s.amount_cents else 0 end)=o.amount_cents then extras:=o.extras_cents-o.refunded_extras;
   else
     select a.extras_cents into extras from private.ride_order_refund_allocation a where a.order_id=o.id and a.cumulative_cents=refunded;
     if not found then reason:=coalesce(reason,'refund_allocation_requires_review'); end if;
   end if;
 end if;
 if state<>'paid' and (paid>0 or refunded>0 or returned>0) then reason:=coalesce(reason,'unconfirmed_collection'); end if;
 if reason is not null then
   insert into private.ride_order_provider_reviews values(o.id,payment,left(reason,100),
     jsonb_build_object('gross',p_fact->'amount','refunded',refunded,'psp_fee',processor,'split',split,'paid',paid,'returned',returned),now()) on conflict do nothing;
   update private.ride_order_psp set invoice=null where order_id=o.id;
   update private.ride_payment_orders set status='review' where id=o.id and status<>'review';
   return 'review';
 end if;
 -- Late or replayed canonical observations cannot rewind money already posted.
 if refunded<s.reversed_cents or returned<s.refunded_split_cents or (s.captured and state<>'paid') then return o.status; end if;
 if state='paid' and not s.captured then
   operation:=md5('order-capture/'||o.id)::uuid;
   insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,cash_delta,receivable_delta,processing_expense_delta,psp_fee_cents,observed_driver_split_cents)
   values(o.leg_id,operation,'capture',s.amount_cents,s.amount_cents-processor,-s.amount_cents,processor,processor,split);
   update private.ride_payment_orders set received_cents=received_cents+s.amount_cents,fee_cents=processor where id=o.id;
   insert into private.ride_order_events(order_id,action,operation_id,data) values(o.id,'capture',operation,jsonb_build_object('cents',s.amount_cents,'processing',processor));
 end if;
 if paid>o.driver_paid then
   delta:=paid-o.driver_paid; operation:=md5('order-split/'||o.id||'/'||paid)::uuid;
   insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,cash_delta,driver_delta,observed_driver_split_cents)
     values(o.leg_id,operation,'payout',delta,-delta,-delta,delta);
   update private.ride_payment_orders set driver_paid=paid where id=o.id;
   insert into private.ride_order_events(order_id,action,operation_id,data) values(o.id,'wallet_credit',operation,jsonb_build_object('cents',delta));
 end if;
 if refunded>s.reversed_cents then
   delta:=refunded-s.reversed_cents; operation:=md5('order-refund/'||o.id||'/'||refunded)::uuid;
   perform private.ride_order_reverse(o.id,delta,extras,'psp',operation);
   update private.ride_order_cases set status='settled' where order_id=o.id and status='approved' and requested_cents=delta;
 end if;
 if returned>s.refunded_split_cents then
   delta:=returned-s.refunded_split_cents; operation:=md5('order-returned-split/'||o.id||'/'||returned)::uuid;
   insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,cash_delta,driver_delta,observed_driver_split_cents)
    values(o.leg_id,operation,'payout_reversal',delta,delta,delta,delta);
   update private.ride_payment_orders set driver_returned=returned where id=o.id;
   insert into private.ride_order_events(order_id,action,operation_id,data) values(o.id,'wallet_reversal',operation,jsonb_build_object('cents',delta));
 end if;
 update private.ride_order_psp set payment_id=payment,sent=true,captured=captured or state='paid',invoice=case when state='pending' then invoice_link end,
   reversed_cents=refunded,refunded_split_cents=returned where order_id=o.id;
 update private.ride_payment_orders set status=state where id=o.id and status<>state;
 return state;
end $$;

-- A wallet credit is a confirmed split at the PSP. A withdrawal moves that
-- already disbursed money from the driver's wallet to their verified bank.
create table private.ride_withdrawal_terms (
 driver_id uuid not null, environment text not null, wallet uuid not null, bank_ref text not null, evidence_ref text not null,
 fee_cents int not null check(fee_cents>=0), limit_cents int not null check(limit_cents>0), valid_until timestamptz not null,
 primary key(driver_id,environment), unique(environment,wallet)
);
create table private.ride_withdrawals (
 id uuid primary key, driver_id uuid not null, environment text not null, wallet uuid not null, bank_ref text not null,
 gross_cents int not null check(gross_cents>0), fee_cents int not null check(fee_cents between 0 and gross_cents-1),
 status text not null default 'reserved' check(status in ('reserved','unknown','paid','failed')), provider_ref text,
 submitted_at timestamptz not null default now(), resolved_at timestamptz,
 unique(environment,provider_ref)
);
create function private.ride_wallet_available(p_driver uuid,p_env text) returns bigint language sql stable set search_path='' as $$
 select coalesce((select sum(o.driver_paid-o.driver_returned) from private.ride_payment_orders o
   join public.ride_legs l on l.id=o.leg_id where l.driver_id=p_driver and l.environment=p_env),0)
 - coalesce((select sum(w.gross_cents) from private.ride_withdrawals w where w.driver_id=p_driver and w.environment=p_env and w.status<>'failed'),0)
$$;
create function public.ride_request_withdrawal(p_key uuid,p_cents int,p_fee int) returns uuid language plpgsql security definer set search_path='' as $$
declare w private.ride_withdrawals; t private.ride_withdrawal_terms; env text:=private.ride_env();
begin
 if not private.ride_active_user(auth.uid()) or p_key is null or p_cents is null or p_fee is null then raise exception 'not_allowed'; end if;
 perform pg_advisory_xact_lock(hashtextextended('ride-wallet:'||env||auth.uid(),0));
 select * into w from private.ride_withdrawals where id=p_key;
 if found then
  if (w.driver_id,w.environment,w.gross_cents,w.fee_cents) is distinct from (auth.uid(),env,p_cents,p_fee) then raise exception 'ride_operation_conflict'; end if;
  return w.id;
 end if;
 select * into t from private.ride_withdrawal_terms where driver_id=auth.uid() and environment=env and valid_until>now();
 if not found or t.fee_cents<>p_fee or p_cents not between p_fee+1 and t.limit_cents
   or not exists(select from public.ride_legs l join private.ride_order_psp s on s.wallet=t.wallet
     join private.ride_payment_orders o on o.leg_id=l.id and o.id=s.order_id and o.driver_paid>o.driver_returned
     where l.driver_id=auth.uid() and l.environment=env and private.ride_method(l,'withdrawal') is not null)
   or exists(select from private.ride_order_cases c join private.ride_payment_orders o on o.id=c.order_id
       join public.ride_legs l on l.id=o.leg_id where c.status in ('open','approved') and l.driver_id=auth.uid() and l.environment=env)
   or exists(select from private.ride_payment_orders o join public.ride_legs l on l.id=o.leg_id where l.driver_id=auth.uid() and l.environment=env and o.status='review')
   or p_cents>private.ride_wallet_available(auth.uid(),env) then raise exception 'ride_financial_state'; end if;
 insert into private.ride_withdrawals(id,driver_id,environment,wallet,bank_ref,gross_cents,fee_cents) values(p_key,auth.uid(),env,t.wallet,t.bank_ref,p_cents,t.fee_cents);
 return p_key;
end $$;
create function public.ride_record_withdrawal(p_key uuid,p_environment text,p_status text,p_reference text,p_wallet uuid,p_net int) returns text
language plpgsql security definer set search_path='' as $$
declare w private.ride_withdrawals;
begin
 select * into w from private.ride_withdrawals where id=p_key and environment=private.ride_env() and environment=p_environment for update;
 if not found or p_status is null or p_status not in ('unknown','failed','paid') or p_wallet is distinct from w.wallet
   or p_net is distinct from w.gross_cents-w.fee_cents or length(trim(coalesce(p_reference,''))) not between 1 and 160
   or (w.provider_ref is not null and w.provider_ref<>p_reference) then raise exception 'ride_financial_mismatch'; end if;
 if w.status=p_status then return p_status; end if;
 if w.status in ('paid','failed') then raise exception 'ride_operation_conflict'; end if;
 update private.ride_withdrawals set status=p_status,provider_ref=p_reference,resolved_at=case when p_status<>'unknown' then now() end where id=w.id;
 return p_status;
end $$;

create table private.ride_order_versions (
 version bigint generated always as identity primary key, order_id uuid not null references private.ride_payment_orders(id),
 at timestamptz not null default clock_timestamp(), amount_cents int not null, extras_cents int not null, commission_cents int not null,
 method text not null, status text not null, received_cents int not null, refunded_cents int not null, driver_paid int not null,
 driver_returned int not null, processing_cents int not null
);
create index ride_order_versions_order on private.ride_order_versions(order_id,version);
create function private.version_ride_order() returns trigger language plpgsql set search_path='' as $$
begin
 insert into private.ride_order_versions(order_id,amount_cents,extras_cents,commission_cents,method,status,received_cents,refunded_cents,driver_paid,driver_returned,processing_cents)
 values(new.id,new.amount_cents,new.extras_cents,new.commission_cents,new.method,new.status,new.received_cents,new.refunded_cents,new.driver_paid,new.driver_returned,new.fee_cents);
 return new;
end $$;
create trigger ride_order_version after insert or update on private.ride_payment_orders for each row execute function private.version_ride_order();

create function public.ride_order_desk(p_leg uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); env text:=private.ride_env(); l public.ride_legs; methods jsonb:='[]'; receipt jsonb; items jsonb;
 pending jsonb:='[]'; own_benefits jsonb; own_orders jsonb; earnings jsonb; is_driver boolean:=false; is_operator boolean; terms jsonb; measured jsonb;
begin
 if not private.ride_active_user(u) then raise exception 'not_allowed'; end if;
 is_operator:=public.is_admin();
 if p_leg is not null then
   select * into l from public.ride_legs where id=p_leg and environment=env;
   if not found or (u is distinct from l.payer_id and u is distinct from l.driver_id and not is_operator and not exists(
     select from private.ride_payment_orders o where o.leg_id=p_leg and o.payer=u)) then return null; end if;
   is_driver:=l.driver_id=u;
   if u=l.payer_id then
     select coalesce(jsonb_agg(m order by m),'[]') into methods from unnest(array['card','cash','pix','tips','benefit']) m
       where private.ride_method(l,m) is not null and (m<>'cash' or l.status in ('requested','accepted','arriving'));
     select q.price_rules->(l.quote_seq::text) into terms from private.ride_quotes q where q.id=l.source_quote_id;
     select jsonb_build_object('minutes',greatest(0,floor(extract(epoch from (min(e.at)-a.arrived_at))/60)::int),
       'cents',greatest(0,floor(extract(epoch from (min(e.at)-a.arrived_at))/60)::integer-(terms->>'free_wait_minutes')::int)*(terms->>'wait_cents_per_minute')::int)
       into measured from private.ride_pickup_arrivals a join private.ride_events e on e.leg_id=a.leg_id and e.to_status='boarded'
       where a.leg_id=l.id and terms is not null group by a.arrived_at;
   end if;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'leg_id',o.leg_id,'component',o.component,'method',o.method,
   'total',o.amount_cents,'extras',o.extras_cents,'commission',case when is_operator or o.payer=u then o.commission_cents end,'received',o.received_cents,
   'refunded',o.refunded_cents,'status',o.status,'mine',o.payer=u,'can_invite',o.payer=u and o.payer=plan.original_payer and o.component='fare'
     and o.method<>'cash' and o.status='open' and o.received_cents=0,'can_report_cash',l.driver_id=u and o.method='cash' and o.status='open' and l.status='completed',
   'invoice',case when o.payer=u and o.status='pending' then s.invoice end,
   'receipts',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'tendered',r.tendered_cents,'change',r.change_cents,'status',r.status)),'[]') from private.ride_cash_receipts r where r.order_id=o.id),
   'cases',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'amount',c.requested_cents,'status',c.status,'decision',c.decision,
      'reason',case when o.payer=u or is_operator then c.reason end)),'[]') from private.ride_order_cases c where c.order_id=o.id and (is_operator or o.payer=u)),
   'benefit',coalesce(b.applied_cents,0),'benefit_returned',coalesce(b.restored_cents,0)) order by o.created_at),'[]') into own_orders
 from private.ride_payment_orders o join private.ride_order_plans plan on plan.leg_id=o.leg_id and plan.environment=env
 left join private.ride_order_psp s on s.order_id=o.id left join private.ride_benefit_uses b on b.order_id=o.id
 where (p_leg is null and o.payer=u or p_leg=o.leg_id and (o.payer=u or is_operator or (is_driver and o.method='cash')));
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'cents',i.cents,'expires',i.expires_at,
   'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,'incoming',i.recipient=u) order by i.created_at desc),'[]')
 into pending from private.ride_share_invites i join private.ride_payment_orders o on o.id=i.source_order join private.ride_order_plans p on p.leg_id=o.leg_id
 where p.environment=env and (i.recipient=u or o.payer=u) and (p_leg is null or o.leg_id=p_leg);
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'source',b.source,'available',b.available_cents,'until',b.valid_until)),'[]') into own_benefits
 from private.ride_benefits b where b.owner_id=u and b.environment=env and b.available_cents>0 and b.valid_until>now();
 select jsonb_build_object('available',greatest(0,private.ride_wallet_available(u,env)),'fee',t.fee_cents,'limit',t.limit_cents,
   'withdrawals',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'gross',w.gross_cents,'fee',w.fee_cents,'status',w.status) order by w.submitted_at desc),'[]')
   from private.ride_withdrawals w where w.driver_id=u and w.environment=env)) into earnings from private.ride_withdrawal_terms t
 where t.driver_id=u and t.environment=env and t.valid_until>now();
 return jsonb_build_object('environment',env,'methods',methods,'terms',terms,'wait',measured,'orders',own_orders,'invites',pending,'benefits',own_benefits,
   'wallet',earnings,'operator',is_operator,'has_plan',exists(select from private.ride_order_plans where leg_id=p_leg),
   'can_open',l.payer_id=u and l.status not in ('cancelled','unknown') and not exists(select from private.ride_financial_accounts where leg_id=l.id and settlement_source<>'unclaimed'));
end $$;

create function public.ride_order_receipt(p_order uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o private.ride_payment_orders; l public.ride_legs; u uuid:=auth.uid(); driver boolean; admin boolean;
begin
 if not private.ride_active_user(u) then raise exception 'not_allowed'; end if;
 select * into o from private.ride_payment_orders where id=p_order;
 select * into l from public.ride_legs where id=o.leg_id and environment=private.ride_env();
 admin:=public.is_admin(); driver:=l.driver_id is not distinct from u;
 if l.id is null or (o.payer<>u and not driver and not admin) then return null; end if;
 return jsonb_build_object('order',o.id,'component',o.component,'environment',l.environment,'versions',
   (select jsonb_agg(jsonb_build_object('revision',v.version,'at',v.at,'total',v.amount_cents,'extras',v.extras_cents,'commission',v.commission_cents,
    'method',v.method,'status',v.status,'received',v.received_cents,'refunded',v.refunded_cents,
    'deposited',case when driver or admin then v.driver_paid end,'recovered',case when driver or admin then v.driver_returned end,
    'processing',case when admin then v.processing_cents end) order by v.version desc) from private.ride_order_versions v where v.order_id=o.id));
end $$;

-- Neither the public roles nor a service key can mutate the tables directly through the Data API.
do $$ declare t text; begin
 foreach t in array array['ride_method_releases','ride_demand_rates','ride_order_plans','ride_payment_orders','ride_share_invites','ride_benefits',
   'ride_benefit_campaigns','ride_benefit_uses','ride_order_events','ride_order_cases','ride_cash_receipts','ride_order_test_wallets','ride_order_psp',
   'ride_order_provider_reviews','ride_order_refund_allocation','ride_withdrawal_terms','ride_withdrawals','ride_order_versions'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;
revoke all on function private.ride_price_demand(),private.ride_method(public.ride_legs,text),private.guard_order_book(),
 private.ride_order_binding(public.ride_legs,private.ride_payment_orders),private.ride_order_reverse(uuid,int,int,text,uuid),
 private.ride_wallet_available(uuid,text),private.version_ride_order() from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 foreach f in array array[
 'public.ride_quote_payment_terms(uuid)'::regprocedure,'public.ride_open_payment_order(uuid,text)'::regprocedure,
 'public.ride_invite_fare_share(uuid,uuid,int,uuid)'::regprocedure,'public.ride_answer_fare_share(uuid,boolean)'::regprocedure,
 'public.ride_add_order_component(uuid,text,int,text,uuid)'::regprocedure,'public.ride_apply_order_benefit(uuid,uuid,int)'::regprocedure,
 'public.ride_cash_report(uuid,int,int,uuid)'::regprocedure,'public.ride_cash_confirm(uuid,boolean)'::regprocedure,'public.ride_cash_balance_pix(uuid)'::regprocedure,
 'public.ride_request_order_review(uuid,int,text,uuid)'::regprocedure,'public.ride_decide_order_review(uuid,boolean,text)'::regprocedure,
 'public.ride_refund_order_source(uuid,text,int,text)'::regprocedure,'public.ride_request_withdrawal(uuid,int,int)'::regprocedure,
 'public.ride_order_desk(uuid)'::regprocedure,'public.ride_order_receipt(uuid)'::regprocedure] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
 foreach f in array array['public.ride_order_provider_intent(uuid,text)'::regprocedure,'public.ride_prepare_order_payment(uuid,uuid,text)'::regprocedure,
 'public.ride_claim_order_send(uuid,text)'::regprocedure,'public.ride_observe_order_payment(uuid,text,jsonb)'::regprocedure,
 'public.ride_record_withdrawal(uuid,text,text,text,uuid,int)'::regprocedure] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to service_role',f);
 end loop;
end $$;

-- Only a voluntarily shared, short-lived code can address a fare invitation.
create table private.ride_invite_codes (
 code uuid primary key default gen_random_uuid(), recipient uuid not null unique, environment text not null,
 expires_at timestamptz not null
);
alter table private.ride_invite_codes enable row level security;
revoke all on private.ride_invite_codes from public,anon,authenticated,service_role;
create function public.ride_make_share_code() returns uuid language plpgsql security definer set search_path='' as $$
declare token uuid;
begin
 if not private.ride_active_user(auth.uid()) then raise exception 'not_allowed'; end if;
 insert into private.ride_invite_codes(recipient,environment,expires_at) values(auth.uid(),private.ride_env(),now()+interval '15 minutes')
 on conflict(recipient) do update set code=gen_random_uuid(),environment=excluded.environment,expires_at=excluded.expires_at returning code into token;
 return token;
end $$;
create function public.ride_invite_fare_code(p_order uuid,p_code uuid,p_cents int,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 select c.recipient into recipient from private.ride_invite_codes c where c.code=p_code and c.environment=private.ride_env() and c.expires_at>now();
 if not found then raise exception 'share_code_unavailable'; end if;
 return public.ride_invite_fare_share(p_order,recipient,p_cents,p_key);
end $$;
revoke execute on function public.ride_invite_fare_share(uuid,uuid,int,uuid) from authenticated;
revoke all on function public.ride_make_share_code(),public.ride_invite_fare_code(uuid,uuid,int,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ride_make_share_code(),public.ride_invite_fare_code(uuid,uuid,int,uuid) to authenticated;

-- An O17 plan takes over the fare. Prevent even offering the legacy full-fare
-- Pix invoice once the payer has divided it or agreed on a different tender.
alter function public.ride_sandbox_payment_view(uuid) set schema private;
alter function public.ride_live_payment_view(uuid) set schema private;
revoke all on function private.ride_sandbox_payment_view(uuid),private.ride_live_payment_view(uuid) from public,anon,authenticated,service_role;
create function public.ride_sandbox_payment_view(p_leg uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when not exists(select from private.ride_order_plans where leg_id=p_leg) then private.ride_sandbox_payment_view(p_leg) end
$$;
create function public.ride_live_payment_view(p_leg uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select case when not exists(select from private.ride_order_plans where leg_id=p_leg) then private.ride_live_payment_view(p_leg) end
$$;
revoke all on function public.ride_sandbox_payment_view(uuid),public.ride_live_payment_view(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ride_sandbox_payment_view(uuid),public.ride_live_payment_view(uuid) to authenticated;
