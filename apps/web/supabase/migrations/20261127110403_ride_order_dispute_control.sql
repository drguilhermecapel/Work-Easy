-- The acquiring account must actually restrict the brands in hosted checkout.
alter table private.ride_method_releases add column acquirer_profile_ref text
 check(acquirer_profile_ref is null or length(trim(acquirer_profile_ref)) between 1 and 160);
create or replace function private.ride_method(l public.ride_legs,m text) returns uuid language sql stable set search_path='' as $$
  select g.id from private.ride_method_releases g
  join private.ride_network n on n.environment=g.environment and n.module_enabled
  where g.environment=private.ride_env() and g.environment=l.environment and g.origin=l.origin and g.destination=l.destination
    and (m<>'card' or g.acquirer_profile_ref is not null) and g.method=m and g.validity @> now() and (g.environment='simulation' or (
      n.monetization_enabled and private.ride_area_allowed('live',l.origin,'monetize') and private.ride_area_allowed('live',l.destination,'monetize')
      and exists(select from private.ride_live_finance_release where enabled and until_at>now())))
$$;
create or replace function public.ride_claim_withdrawal_send(p_key uuid,p_environment text) returns boolean
language plpgsql security definer set search_path='' as $$
declare w private.ride_withdrawals;
begin
 select * into w from private.ride_withdrawals where id=p_key and environment=private.ride_env() and environment=p_environment for update;
 if not found or w.sent or w.status<>'reserved' then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('ride-wallet:'||w.environment||w.driver_id,0));
 if not private.ride_active_user(w.driver_id) or not exists(select from private.ride_withdrawal_terms t where t.driver_id=w.driver_id and t.environment=w.environment
    and t.wallet=w.wallet and t.bank_ref=w.bank_ref and t.bank_pix_key=w.destination and t.pix_key_type=w.pix_type and t.fee_cents=w.fee_cents
    and t.valid_until>now() and t.limit_cents>=w.gross_cents)
    or exists(select from private.ride_payment_orders o join public.ride_legs l on l.id=o.leg_id
      where l.driver_id=w.driver_id and l.environment=w.environment and (o.status='review' or exists(
        select from private.ride_order_cases c where c.order_id=o.id and c.status in ('open','approved'))))
    or private.ride_wallet_available(w.driver_id,w.environment)<0 or not exists(select from public.ride_legs l
      join private.ride_payment_orders o on o.leg_id=l.id join private.ride_order_psp s on s.order_id=o.id and s.wallet=w.wallet
      where l.driver_id=w.driver_id and l.environment=w.environment and private.ride_method(l,'withdrawal') is not null) then return false; end if;
 update private.ride_withdrawals set sent=true,status='unknown' where id=p_key;
 return true;
end $$;
create or replace function private.ride_order_reverse(p_order uuid,p_amount int,p_extras int,p_origin text,p_op uuid) returns void
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
 elsif p_origin in ('psp','issuer') then cash:=-p_amount;
 elsif p_origin='cash' then
   select coalesce(sum(tendered_cents-change_cents),0) into outstanding from private.ride_cash_receipts where order_id=o.id and status='confirmed';
   if p_amount>outstanding-coalesce((select sum((data->>'cents')::int) from private.ride_order_events where order_id=o.id and action='cash_refund'),0)
     then raise exception 'ride_financial_mismatch'; end if;
 else raise exception 'invalid_input'; end if;
 insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,extras_cents,cash_delta,benefit_delta,driver_delta,fee_delta,recorded_by)
 values(l.id,p_op,case p_origin when 'issuer' then 'chargeback' when 'benefit' then 'benefit_restored' when 'cash' then 'cash_refund' else 'refund' end,
        p_amount,p_extras,cash,funding,cash+funding-fee_change,fee_change,auth.uid());
 update private.ride_payment_orders set refunded_cents=refunded_cents+p_amount,refunded_extras=refunded_extras+p_extras where id=o.id;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data)
 values(o.id,p_origin||'_refund',p_op,auth.uid(),jsonb_build_object('cents',p_amount,'extras',p_extras,'commission_change',fee_change));
end $$;
create or replace function public.ride_cash_balance_pix(p_order uuid) returns int language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; l public.ride_legs; rel uuid;
begin
 select * into o from private.ride_payment_orders where id=p_order and payer=auth.uid() for update;
 if not found or not private.ride_active_user(auth.uid()) then raise exception 'not_allowed'; end if;
 select * into strict l from public.ride_legs where id=o.leg_id and environment=private.ride_env();
 if o.method='pix' and exists(select from private.ride_order_events where order_id=o.id and action='cash_balance_pix') then return o.amount_cents-o.received_cents; end if;
 rel:=private.ride_method(l,'pix');
 if rel is null or o.method<>'cash' or l.status<>'completed' or o.status<>'open' or o.received_cents not between 1 and o.amount_cents-1
   or exists(select from private.ride_cash_receipts where order_id=o.id and status in ('reported','contested')) then raise exception 'ride_financial_state'; end if;
 update private.ride_payment_orders set method='pix',release_id=rel where id=o.id;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(o.id,'cash_balance_pix',o.id,auth.uid(),jsonb_build_object('cents',o.amount_cents-o.received_cents));
 return o.amount_cents-o.received_cents;
end $$;
create or replace function private.ride_price_demand() returns trigger language plpgsql set search_path='' as $$
declare entry jsonb; entries jsonb:='[]'; rule private.ride_demand_rates; base int; extras int; fee int; total bigint:=0; changed boolean:=false;
begin
  if new.status<>'awaiting_consent' or not exists(select from private.ride_demand_rates where environment=new.environment) then return new; end if;
  for entry in select value from jsonb_array_elements(new.legs) loop
    select * into rule from private.ride_demand_rates where environment=new.environment and origin=entry->>'origin'
      and destination=entry->>'destination' and validity @> (entry->>'pickup_at')::timestamptz;
    if found then
      changed:=true;
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
  if changed then new.legs:=entries; new.total_cents:=total; end if; return new;
end $$;
-- A canonical issuer signal freezes withdrawals. Only the financial operator can
-- close it against a final statement and a separate proof of recovered split.
create table private.ride_issuer_decisions (
  order_id uuid primary key references private.ride_order_psp(order_id),
  lost boolean not null, cents integer not null check(cents>=0), extras integer not null check(extras between 0 and cents),
  evidence_ref text not null unique, reviewer uuid not null, reviewed_at timestamptz not null default now(),
  check(lost=(cents>0))
);
create table private.ride_issuer_returns (
  id uuid primary key, order_id uuid not null references private.ride_issuer_decisions(order_id),
  cents integer not null check(cents>0), evidence_ref text not null unique, reviewer uuid not null, reviewed_at timestamptz not null default now()
);
alter table private.ride_issuer_decisions enable row level security;
alter table private.ride_issuer_returns enable row level security;
revoke all on private.ride_issuer_decisions,private.ride_issuer_returns from public,anon,authenticated,service_role;
create function public.admin_resolve_ride_issuer(p_order uuid,p_lost boolean,p_amount int,p_extras int,p_reference text) returns text
language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; s private.ride_order_psp; d private.ride_issuer_decisions; op uuid;
begin
 perform private.require_ride_finance_admin();
 select * into o from private.ride_payment_orders where id=p_order for update;
 select * into s from private.ride_order_psp where order_id=p_order and environment=private.ride_env() for update;
 if not found or s.method<>'card' or s.payment_id is null or not exists(select from private.ride_order_provider_reviews
   where order_id=o.id and payment_id=s.payment_id and reason='card_chargeback') then raise exception 'ride_financial_state'; end if;
 select * into d from private.ride_issuer_decisions where order_id=o.id;
 if found then
   if (d.lost,d.cents,d.extras,d.evidence_ref) is distinct from (p_lost,p_amount,p_extras,trim(p_reference)) then raise exception 'ride_operation_conflict'; end if;
   return case when d.lost then 'debited' else 'released' end;
 end if;
 if p_lost is null or p_amount is null or p_extras is null or length(trim(coalesce(p_reference,''))) not between 1 and 160
   or (p_lost and (not s.captured or p_amount not between 1 and s.amount_cents-s.reversed_cents))
   or (not p_lost and (p_amount<>0 or p_extras<>0)) then raise exception 'ride_financial_state'; end if;
 perform 1 from private.ride_financial_accounts where leg_id=o.leg_id for update;
 perform pg_advisory_xact_lock(hashtextextended('ride-wallet:'||s.environment||(select driver_id from public.ride_legs where id=o.leg_id),0));
 op:=md5('issuer-decision/'||o.id)::uuid;
 insert into private.ride_issuer_decisions values(o.id,p_lost,p_amount,p_extras,trim(p_reference),auth.uid(),now());
 if p_lost then
   perform private.ride_order_reverse(o.id,p_amount,p_extras,'issuer',op);
   update private.ride_order_psp set reversed_cents=reversed_cents+p_amount where order_id=o.id;
   update private.ride_order_cases set status='settled' where order_id=o.id and status='approved' and requested_cents=p_amount;
 end if;
 update private.ride_payment_orders set status=case when s.captured then 'paid' else 'unknown' end where id=o.id;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(o.id,'issuer_decision',op,auth.uid(),
   jsonb_build_object('lost',p_lost,'amount',p_amount,'extras',p_extras));
 return case when p_lost then 'debited' else 'released' end;
end $$;
create function public.admin_record_issuer_split_return(p_order uuid,p_cents int,p_reference text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; s private.ride_order_psp; d private.ride_issuer_decisions; r private.ride_issuer_returns; driver uuid;
begin
 perform private.require_ride_finance_admin();
 select * into o from private.ride_payment_orders where id=p_order for update;
 select * into s from private.ride_order_psp where order_id=p_order and environment=private.ride_env() for update;
 select * into d from private.ride_issuer_decisions where order_id=o.id and lost;
 if not found or s.order_id is null or p_key is null or p_cents is null or p_cents<=0 or length(trim(coalesce(p_reference,''))) not between 1 and 160 then raise exception 'ride_financial_state'; end if;
 select * into r from private.ride_issuer_returns where id=p_key;
 if found then
  if (r.order_id,r.cents,r.evidence_ref) is distinct from(o.id,p_cents,trim(p_reference)) then raise exception 'ride_operation_conflict'; end if;
  return p_key;
 end if;
 perform 1 from private.ride_financial_accounts where leg_id=o.leg_id for update;
 select driver_id into strict driver from public.ride_legs where id=o.leg_id;
 perform pg_advisory_xact_lock(hashtextextended('ride-wallet:'||s.environment||driver,0));
 if p_cents>least(o.driver_paid-o.driver_returned,s.reversed_cents-s.refunded_split_cents,
       (select -e.driver_delta from private.ride_financial_events e where e.leg_id=o.leg_id
         and e.kind='chargeback' and e.operation_id=md5('issuer-decision/'||o.id)::uuid)
       -coalesce((select sum(cents) from private.ride_issuer_returns where order_id=o.id),0))
     then raise exception 'ride_financial_mismatch'; end if;
 insert into private.ride_issuer_returns values(p_key,o.id,p_cents,trim(p_reference),auth.uid(),now());
 insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,cash_delta,driver_delta,observed_driver_split_cents,recorded_by)
 values(o.leg_id,p_key,'payout_reversal',p_cents,p_cents,p_cents,p_cents,auth.uid());
 update private.ride_order_psp set refunded_split_cents=refunded_split_cents+p_cents where order_id=o.id;
 update private.ride_payment_orders set driver_returned=driver_returned+p_cents where id=o.id;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(o.id,'issuer_return',p_key,auth.uid(),jsonb_build_object('cents',p_cents));
 return p_key;
end $$;
-- Voiding a rejected cash report keeps the original declaration for audit.
alter table private.ride_cash_receipts drop constraint ride_cash_receipts_status_check;
alter table private.ride_cash_receipts add check(status in ('reported','confirmed','contested','voided'));
create function public.admin_void_ride_cash_report(p_receipt uuid,p_reference text) returns text
language plpgsql security definer set search_path='' as $$
declare r private.ride_cash_receipts; o private.ride_payment_orders;
begin
 perform private.require_ride_finance_admin();
 select rc.* into r from private.ride_cash_receipts rc join private.ride_payment_orders po on po.id=rc.order_id
 join private.ride_order_plans p on p.leg_id=po.leg_id and p.environment=private.ride_env() where rc.id=p_receipt;
 if not found or length(trim(coalesce(p_reference,''))) not between 1 and 160 then raise exception 'invalid_input'; end if;
 select * into strict o from private.ride_payment_orders where id=r.order_id for update;
 select * into strict r from private.ride_cash_receipts where id=p_receipt for update;
 if r.status='voided' then
   if not exists(select from private.ride_order_events where order_id=o.id and action='cash_voided' and operation_id=r.id
      and data->>'evidence'=trim(p_reference)) then raise exception 'ride_operation_conflict'; end if;
   return 'voided';
 end if;
 if r.status<>'contested' or o.status<>'review' or o.method<>'cash' then raise exception 'ride_financial_state'; end if;
 update private.ride_cash_receipts set status='voided' where id=r.id;
 update private.ride_payment_orders set status='open' where id=o.id;
 insert into private.ride_order_events(order_id,operation_id,action,actor,data) values(o.id,r.id,'cash_voided',auth.uid(),jsonb_build_object('evidence',trim(p_reference)));
 return 'voided';
end $$;
create function public.ride_issuer_status(p_order uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('status',case when d.order_id is null then 'review' when d.lost then 'debited' else 'released' end,'amount',d.cents,
  'returned',case when public.is_admin() then coalesce((select sum(cents) from private.ride_issuer_returns where order_id=s.order_id),0) end)
 from private.ride_order_psp s join private.ride_payment_orders o on o.id=s.order_id left join private.ride_issuer_decisions d on d.order_id=o.id
 where o.id=p_order and s.environment=private.ride_env() and private.ride_active_user(auth.uid()) and (o.payer=auth.uid() or public.is_admin())
 and exists(select from private.ride_order_provider_reviews v where v.order_id=o.id and v.payment_id=s.payment_id and v.reason='card_chargeback')
$$;
revoke all on function public.admin_void_ride_cash_report(uuid,text),public.admin_resolve_ride_issuer(uuid,boolean,int,int,text),
 public.admin_record_issuer_split_return(uuid,int,text,uuid),public.ride_issuer_status(uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_void_ride_cash_report(uuid,text),public.admin_resolve_ride_issuer(uuid,boolean,int,int,text),
 public.admin_record_issuer_split_return(uuid,int,text,uuid),public.ride_issuer_status(uuid) to authenticated;
-- A later pending/paid notification cannot release an unresolved issuer hold.
create function private.keep_ride_issuer_hold() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select from private.ride_order_provider_reviews v where v.order_id=new.id and v.reason='card_chargeback')
    and not exists(select from private.ride_issuer_decisions d where d.order_id=new.id) then new.status:='review'; end if;
 return new;
end $$;
create trigger ride_issuer_hold before update of status on private.ride_payment_orders for each row execute function private.keep_ride_issuer_hold();
revoke all on function private.keep_ride_issuer_hold() from public,anon,authenticated,service_role;
