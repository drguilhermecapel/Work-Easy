-- Live account bindings and commercial perimeter. Empty by default. All provisioning
-- happens on the backend after review of the contracts, identity and wallet ownership.
create table private.ride_live_psp_corridors (
 origin text not null,destination text not null,primary key(origin,destination),
 contract_ref text not null check(length(trim(contract_ref)) between 1 and 160),
 platform_wallet uuid not null, valid_until timestamptz not null
);
create table private.ride_live_psp_customers (
 payer_id uuid primary key references public.profiles(id), customer_ref text not null unique check(customer_ref ~ '^cus_[a-zA-Z0-9_-]{1,100}$'),
 evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160), valid_until timestamptz not null
);
create table private.ride_live_psp_wallets (
 driver_id uuid primary key references public.ride_drivers(id),wallet_id uuid not null unique,
 evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160),valid_until timestamptz not null
);
create table private.ride_live_charges (
 leg_id uuid primary key references public.ride_legs(id),operation_id uuid not null unique default gen_random_uuid(),
 payer_id uuid not null references public.profiles(id), customer_ref text not null, wallet uuid not null, contract_ref text not null,
 amount_cents integer not null check(amount_cents>0),driver_cents integer not null check(driver_cents between 1 and amount_cents),
 extras_cents integer not null check(extras_cents between 0 and amount_cents),external_id text unique,
 state text not null default 'unknown' check(state in ('unknown','pending','settling','paid','partial_refund','refunded','cancelled','review')),
 send_claimed boolean not null default false,captured boolean not null default false,refunded_cents integer not null default 0,
 paid_to_driver integer not null default 0,returned_by_driver integer not null default 0,psp_fee_cents integer not null default 0,
 invoice_url text,updated_at timestamptz not null default now()
);
create table private.ride_live_psp_reviews (
 leg_id uuid not null references private.ride_live_charges(leg_id),payment_id text not null,reason text not null,
 observed jsonb not null,at timestamptz not null default now(), primary key(leg_id,payment_id,reason)
);
revoke all on private.ride_live_psp_corridors,private.ride_live_psp_customers,private.ride_live_psp_wallets,
 private.ride_live_charges,private.ride_live_psp_reviews from public,anon,authenticated,service_role;

create function private.ride_live_psp_permitted(l public.ride_legs) returns boolean
language sql stable security definer set search_path='' as $$
 select private.ride_env()='live' and l.environment='live' and l.status='completed' and private.ride_active_user(l.payer_id) and private.ride_active_user(l.driver_id)
 and exists(select from private.ride_live_finance_release where enabled and until_at>now())
 and exists(select from private.ride_network where environment='live' and module_enabled and monetization_enabled)
 and private.ride_area_allowed('live',l.origin,'monetize') and private.ride_area_allowed('live',l.destination,'monetize')
 and exists(select from private.ride_live_psp_corridors c join private.ride_live_psp_wallets w on w.driver_id=l.driver_id
   join private.ride_live_psp_customers cu on cu.payer_id=l.payer_id where c.origin=l.origin and c.destination=l.destination
   and least(c.valid_until,w.valid_until,cu.valid_until)>now() and c.platform_wallet<>w.wallet_id)
$$;
revoke all on function private.ride_live_psp_permitted(public.ride_legs) from public,anon,authenticated,service_role;

create function public.ride_live_payment_view(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c private.ride_live_charges;l public.ride_legs;
begin
 if private.ride_env()<>'live' or not exists(select from public.profiles where id=auth.uid() and deleted_at is null) then return null; end if;
 select * into l from public.ride_legs where id=p_leg and payer_id=auth.uid() and environment='live' and status='completed';
 if not found then return null; end if;
 select * into c from private.ride_live_charges where leg_id=p_leg;
 if not found and not private.ride_live_psp_permitted(l) then return null; end if;
 return jsonb_build_object('state',coalesce(c.state,'available'),'amount_cents',l.fare_cents,'refunded_cents',coalesce(c.refunded_cents,0),
  'invoice_url',case when c.state='pending' then c.invoice_url end);
end $$;

create function public.ride_live_prepare_charge(p_leg uuid,p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.ride_live_charges;l public.ride_legs;a jsonb;
begin
 select * into l from public.ride_legs where id=p_leg and payer_id=p_user and environment='live' and status='completed' for update;
 if not found or private.ride_env()<>'live' or not exists(select from public.profiles where id=p_user and deleted_at is null) then raise exception 'not_allowed'; end if;
 select * into c from private.ride_live_charges where leg_id=p_leg;
 if not found then
  if not private.ride_live_psp_permitted(l) then raise exception 'ride_feature_disabled'; end if;
  a:=public.claim_ride_live_account(p_leg);
  insert into private.ride_live_charges(leg_id,payer_id,customer_ref,wallet,contract_ref,amount_cents,driver_cents,extras_cents)
   select l.id,l.payer_id,cu.customer_ref,w.wallet_id,g.contract_ref,(a->>'fare_cents')::int,(a->>'driver_cents')::int,(a->>'extras_cents')::int
   from private.ride_live_psp_customers cu,private.ride_live_psp_wallets w,private.ride_live_psp_corridors g
   where cu.payer_id=l.payer_id and w.driver_id=l.driver_id and g.origin=l.origin and g.destination=l.destination returning * into strict c;
 end if;
 return jsonb_build_object('leg_id',l.id,'customer',c.customer_ref,'wallet',c.wallet,'driver_cents',c.driver_cents,'extras_cents',c.extras_cents,
  'amount_cents',c.amount_cents,'payment_id',c.external_id,'create',not c.send_claimed and c.external_id is null);
end $$;

create function public.ride_live_claim_send(p_leg uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update private.ride_live_charges c set send_claimed=true,updated_at=now()
 from public.ride_legs l,private.ride_live_psp_customers cu,private.ride_live_psp_wallets w,private.ride_live_psp_corridors g
 where c.leg_id=p_leg and l.id=p_leg and private.ride_live_psp_permitted(l) and not c.send_claimed and c.external_id is null
 and cu.payer_id=c.payer_id and cu.customer_ref=c.customer_ref and w.driver_id=l.driver_id and w.wallet_id=c.wallet
 and g.origin=l.origin and g.destination=l.destination and g.contract_ref=c.contract_ref;
 if not found then return false; end if;
 perform public.claim_ride_live_account(p_leg);
 return true;
end $$;
create function public.ride_live_find_charge(p_leg uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('leg_id',leg_id,'customer',customer_ref,'wallet',wallet,'driver_cents',driver_cents,'extras_cents',extras_cents,
 'amount_cents',amount_cents,'payment_id',external_id,'create',false) from private.ride_live_charges where leg_id=p_leg and private.ride_env()='live'
$$;

-- Reconciliation is fact-based, including after the stop switch. A mismatch
-- closes the payable link and preserves a restricted operational occurrence.
create function public.ride_live_observe_charge(p_leg uuid,p_payment text,p_customer text,p_amount integer,
 p_status text,p_refunded integer,p_invoice text,p_fee integer,p_split integer,p_payout integer,p_reversal integer,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.ride_live_charges;diff integer;reverse_driver integer;next_state text;reason text:=p_reason;
begin
 select * into c from private.ride_live_charges where leg_id=p_leg for update;
 if not found or private.ride_env()<>'live' then raise exception 'not_allowed'; end if;
 if p_payment is null or p_payment !~ '^pay_[a-zA-Z0-9_-]{1,100}$' then raise exception 'invalid_input'; end if;
 if p_customer is distinct from c.customer_ref or p_amount is distinct from c.amount_cents or
    (c.external_id is not null and c.external_id<>p_payment) then reason:=coalesce(reason,'payment_mismatch'); end if;
 if p_invoice is not null and p_invoice !~ '^https://www\.asaas\.com/i/[a-zA-Z0-9_-]+$' then reason:='invalid_invoice'; end if;
 if p_status not in ('pending','settling','paid','cancelled') or p_status is null then reason:=coalesce(reason,'provider_state'); end if;
 if p_split is distinct from c.driver_cents or p_fee is null or p_fee not between 0 and c.amount_cents-c.driver_cents
   or p_refunded is null or p_refunded not between 0 and c.amount_cents or p_payout is null or p_payout not in (0,c.driver_cents)
   or p_reversal is null or p_reversal not between 0 and least(c.driver_cents,p_refunded) then reason:=coalesce(reason,'financial_mismatch'); end if;
 if c.captured and c.psp_fee_cents is distinct from p_fee then reason:=coalesce(reason,'processor_fee_changed'); end if;
 if p_refunded>0 and p_refunded<c.amount_cents and c.extras_cents>0 then reason:=coalesce(reason,'partial_extras'); end if;
 if p_reversal>greatest(c.paid_to_driver,p_payout) then reason:=coalesce(reason,'unconfirmed_prior_payout'); end if;
 if reason is null then
  begin
   if (p_status='paid' or p_refunded>0) and not c.captured then
    perform public.record_verified_live_ride_event(p_leg,c.operation_id,'capture',c.amount_cents,0,p_fee,p_split);
    c.captured:=true;c.psp_fee_cents:=p_fee;
   end if;
   if p_payout>c.paid_to_driver then
    if not c.captured then raise exception 'split_before_capture'; end if;
    perform public.record_verified_live_ride_event(p_leg,gen_random_uuid(),'payout',p_payout,0,0,p_payout);
    c.paid_to_driver:=p_payout;
   end if;
   diff:=greatest(0,p_refunded-c.refunded_cents);
   if diff>0 then
    perform public.record_verified_live_ride_event(p_leg,gen_random_uuid(),'refund',diff,
      case when p_refunded=c.amount_cents then c.extras_cents else 0 end,0,0);
    c.refunded_cents:=p_refunded;
   end if;
   reverse_driver:=greatest(0,p_reversal-c.returned_by_driver);
   if reverse_driver>0 then
    perform public.record_verified_live_ride_event(p_leg,gen_random_uuid(),'payout_reversal',reverse_driver,0,0,reverse_driver);
    c.returned_by_driver:=p_reversal;
   end if;
   next_state:=case when c.refunded_cents=c.amount_cents then 'refunded' when c.refunded_cents>0 then 'partial_refund'
    when c.captured then 'paid' when c.state='cancelled' then 'cancelled'
    when c.state='settling' and p_status='pending' then 'settling' else p_status end;
   update private.ride_live_charges set external_id=p_payment,state=next_state,invoice_url=p_invoice,
    captured=c.captured,refunded_cents=c.refunded_cents,paid_to_driver=c.paid_to_driver,returned_by_driver=c.returned_by_driver,
    psp_fee_cents=c.psp_fee_cents,updated_at=now() where leg_id=p_leg;
  exception when sqlstate 'P0001' or unique_violation then reason:='ledger_conflict';
  end;
 end if;
 if reason is not null then
  insert into private.ride_live_psp_reviews(leg_id,payment_id,reason,observed) values(p_leg,p_payment,left(reason,100),
   jsonb_build_object('status',p_status,'gross',p_amount,'fee',p_fee,'split',p_split,'payout',p_payout,'refund',p_refunded,'split_reversal',p_reversal))
   on conflict on constraint ride_live_psp_reviews_pkey do update set at=now(),observed=excluded.observed;
  update private.ride_live_charges set state='review',send_claimed=true,invoice_url=null,updated_at=now() where leg_id=p_leg;
  return jsonb_build_object('state','review');
 end if;
 return jsonb_build_object('state',next_state,'amount_cents',c.amount_cents,'refunded_cents',c.refunded_cents);
end $$;
create function public.admin_ride_psp_reviews(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_admin();
 if not exists(select from public.profiles where id=auth.uid() and deleted_at is null) then raise exception 'not_allowed'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('at',at,'reason',reason,'observed',observed) order by at desc),'[]'::jsonb)
  from private.ride_live_psp_reviews where leg_id=p_leg and private.ride_env()='live');
end $$;
revoke all on function public.ride_live_payment_view(uuid),public.admin_ride_psp_reviews(uuid) from public,anon,service_role;
grant execute on function public.ride_live_payment_view(uuid),public.admin_ride_psp_reviews(uuid) to authenticated;
revoke all on function public.ride_live_prepare_charge(uuid,uuid),public.ride_live_claim_send(uuid),public.ride_live_find_charge(uuid),
 public.ride_live_observe_charge(uuid,text,text,integer,text,integer,text,integer,integer,integer,integer,text) from public,anon,authenticated;
grant execute on function public.ride_live_prepare_charge(uuid,uuid),public.ride_live_claim_send(uuid),public.ride_live_find_charge(uuid),
 public.ride_live_observe_charge(uuid,text,text,integer,text,integer,text,integer,integer,integer,integer,text) to service_role;
