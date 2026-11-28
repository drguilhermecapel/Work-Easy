-- Pre-funded corporate vouchers are nominal and bound to one leg. They may
-- settle an order only after the participant has accepted that order.
alter table private.ride_benefits drop constraint ride_benefits_source_check;
alter table private.ride_benefits add column restricted_leg uuid references public.ride_legs(id),
 add check(source in ('promotion','remediation','prepaid','corporate')),add check(source<>'corporate' or restricted_leg is not null);
create function private.ride_restrict_benefit() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select from private.ride_benefits b join private.ride_payment_orders o on o.id=new.order_id
  where b.id=new.benefit_id and b.restricted_leg is not null and (b.restricted_leg<>o.leg_id or b.owner_id<>o.payer)) then raise exception 'benefit_unavailable'; end if;
 return new;
end $$;
create trigger ride_restrict_benefit before insert on private.ride_benefit_uses for each row execute function private.ride_restrict_benefit();

-- Sponsor-funded driver liability is separate from the share sent by the PSP.
-- The platform's portion may not exceed the original fee. Later sponsor-funded
-- transfers require an independent bank receipt and never generate a charge.
create function private.allocate_funded_split() returns trigger language plpgsql set search_path='' as $$
declare o private.ride_payment_orders; used int;
begin
 select applied_cents into used from private.ride_benefit_uses where order_id=new.order_id;
 if found then
  select * into strict o from private.ride_payment_orders where id=new.order_id;
  new.split_cents:=((o.amount_cents-o.commission_cents)::bigint*new.amount_cents/o.amount_cents)::int;
 end if;
 return new;
end $$;
create trigger allocate_funded_split before insert on private.ride_order_psp for each row execute function private.allocate_funded_split();

create table private.ride_funding_payouts (
 id uuid primary key, order_id uuid not null references private.ride_payment_orders(id), reference text not null unique,
 cents int not null check(cents>0), reviewer uuid not null, at timestamptz not null default now()
);
alter table private.ride_funding_payouts enable row level security;
revoke all on private.ride_funding_payouts from public,anon,authenticated,service_role;
create function public.admin_record_order_funding_payout(p_order uuid,p_cents int,p_reference text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; u private.ride_benefit_uses; old private.ride_funding_payouts; paid int; outstanding int;
begin
 perform private.require_ride_finance_admin();
 select ord.* into o from private.ride_payment_orders ord join private.ride_order_plans p on p.leg_id=ord.leg_id
   and p.environment=private.ride_env() where ord.id=p_order for update of ord;
 if not found or p_key is null or p_cents is null or p_cents<=0 or length(trim(coalesce(p_reference,''))) not between 1 and 160 then raise exception 'invalid_input'; end if;
 select * into old from private.ride_funding_payouts where id=p_key;
 if found then
  if (old.order_id,old.cents,old.reference) is distinct from (o.id,p_cents,trim(p_reference)) then raise exception 'ride_operation_conflict'; end if;
  return old.id;
 end if;
 select * into u from private.ride_benefit_uses where order_id=o.id;
 if not found or o.received_cents<>o.amount_cents or o.status<>'paid' or u.applied_cents=u.restored_cents
    or exists(select from private.ride_order_cases where order_id=o.id and status in ('open','approved')) then raise exception 'ride_financial_state'; end if;
 perform 1 from private.ride_financial_accounts where leg_id=o.leg_id for update;
 select coalesce(sum(cents),0) into paid from private.ride_funding_payouts where order_id=o.id;
 -- Proportional PSP allocation leaves the fractional residual with the sponsor.
 outstanding:=ceil((o.amount_cents-o.commission_cents)::numeric*(u.applied_cents-u.restored_cents)/o.amount_cents)::int-paid;
 if p_cents>outstanding or p_cents>(select driver_balance_cents from private.ride_financial_balances where leg_id=o.leg_id) then raise exception 'ride_financial_state'; end if;
 insert into private.ride_funding_payouts values(p_key,o.id,trim(p_reference),p_cents,auth.uid(),now());
 insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,cash_delta,driver_delta,recorded_by)
 values(o.leg_id,p_key,'payout',p_cents,-p_cents,-p_cents,auth.uid());
 insert into private.ride_order_events(order_id,action,operation_id,actor,data)
 values(o.id,'funding_payout',p_key,auth.uid(),jsonb_build_object('cents',p_cents));
 return p_key;
end $$;
create or replace function private.ride_wallet_available(p_driver uuid,p_env text) returns bigint language sql stable set search_path='' as $$
 select coalesce((select sum(o.driver_paid-o.driver_returned) from private.ride_payment_orders o join public.ride_legs l on l.id=o.leg_id
    join private.ride_order_psp s on s.order_id=o.id join private.ride_withdrawal_terms t on t.driver_id=p_driver and t.environment=p_env and t.wallet=s.wallet
    where l.driver_id=p_driver and l.environment=p_env),0)
   -coalesce((select sum(w.gross_cents) from private.ride_withdrawals w join private.ride_withdrawal_terms t
      on t.driver_id=w.driver_id and t.environment=w.environment and t.wallet=w.wallet
      where w.driver_id=p_driver and w.environment=p_env and w.status<>'failed'),0)
   +coalesce((select sum(least(0,b.driver_balance_cents)) from private.ride_financial_accounts a join private.ride_financial_balances b using(leg_id)
      where a.driver_id=p_driver and a.environment=p_env and a.settlement_source='orders'),0)
$$;
revoke all on function private.ride_restrict_benefit(),private.allocate_funded_split() from public,anon,authenticated,service_role;
revoke all on function public.admin_record_order_funding_payout(uuid,int,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_record_order_funding_payout(uuid,int,text,uuid) to authenticated;

create table private.ride_order_refunds (
 case_id uuid primary key references private.ride_order_cases(id), order_id uuid not null references private.ride_payment_orders(id),
 amount_cents int not null, target_cents int not null, extras_cents int not null, return_split_cents int not null,
 sent boolean not null default false, recorded_by uuid not null, evidence_ref text not null, created_at timestamptz not null default now()
);
alter table private.ride_order_refunds enable row level security;
revoke all on private.ride_order_refunds from public,anon,authenticated,service_role;
create function public.ride_prepare_order_refund(p_case uuid,p_actor uuid,p_environment text,p_extras int,p_evidence text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.ride_order_cases; o private.ride_payment_orders; s private.ride_order_psp; r private.ride_order_refunds; basis bigint; fee int; returned int;
begin
 if not private.ride_active_user(p_actor) or not exists(select from public.admins where user_id=p_actor)
   or p_environment is distinct from private.ride_env() or length(trim(coalesce(p_evidence,''))) not between 1 and 160 then raise exception 'not_allowed'; end if;
 select * into c from private.ride_order_cases where id=p_case for update;
 select * into o from private.ride_payment_orders where id=c.order_id for update;
 select * into s from private.ride_order_psp where order_id=o.id and environment=p_environment for update;
 if not found or not s.captured or s.payment_id is null then raise exception 'ride_financial_state'; end if;
 select * into r from private.ride_order_refunds where case_id=p_case;
 if found then
  if (r.extras_cents,r.evidence_ref) is distinct from (p_extras,trim(p_evidence)) then raise exception 'ride_operation_conflict'; end if;
 else
  if c.status<>'approved' or c.requested_cents>s.amount_cents-s.reversed_cents or p_extras is null
    or p_extras not between 0 and least(c.requested_cents,o.extras_cents-o.refunded_extras)
    or c.requested_cents-p_extras>o.amount_cents-o.extras_cents-o.refunded_cents+o.refunded_extras then raise exception 'ride_financial_state'; end if;
  perform 1 from private.ride_financial_accounts where leg_id=o.leg_id for update;
  select sum(amount_cents-extras_cents-refunded_cents+refunded_extras) into basis from private.ride_payment_orders where leg_id=o.leg_id and component=o.component;
  fee:=case when exists(select from private.ride_payment_orders where leg_id=o.leg_id and component=o.component and commission_cents>0)
         then (basis/10-(basis-c.requested_cents+p_extras)/10)::int else 0 end;
  returned:=least(s.split_cents-s.refunded_split_cents,c.requested_cents-fee);
  insert into private.ride_order_refunds(case_id,order_id,amount_cents,target_cents,extras_cents,return_split_cents,recorded_by,evidence_ref)
   values(p_case,o.id,c.requested_cents,s.reversed_cents+c.requested_cents,p_extras,returned,p_actor,trim(p_evidence)) returning * into r;
  insert into private.ride_order_refund_allocation values(o.id,r.target_cents,p_extras,trim(p_evidence));
 end if;
 return jsonb_build_object('case_id',r.case_id,'order_id',o.id,'payment',s.payment_id,'amount',r.amount_cents,'target',r.target_cents,
   'split_return',r.return_split_cents,'wallet',s.wallet,'create',not r.sent and c.status='approved','method',s.method);
end $$;
create function public.ride_claim_order_refund(p_case uuid,p_environment text) returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform 1 from private.ride_order_cases where id=p_case and status='approved' for update; if not found then return false; end if;
update private.ride_order_refunds r set sent=true from private.ride_order_psp s,private.ride_order_cases c
 where r.case_id=p_case and not r.sent and s.order_id=r.order_id and s.environment=private.ride_env() and s.environment=p_environment
   and c.id=r.case_id and c.status='approved' and s.reversed_cents+r.amount_cents=r.target_cents;
 return found;
end $$;
create or replace function public.ride_refund_order_source(p_case uuid,p_origin text,p_extras int,p_reference text) returns text
language plpgsql security definer set search_path='' as $$
declare c private.ride_order_cases; o private.ride_payment_orders; l public.ride_legs;
begin
  perform private.require_ride_finance_admin();
  select * into c from private.ride_order_cases where id=p_case for update;
  select po.* into o from private.ride_payment_orders po join private.ride_order_plans pl on pl.leg_id=po.leg_id and pl.environment=private.ride_env() where po.id=c.order_id for update of po;
  if not found or c.status not in ('approved','settled') or p_origin is null or p_origin not in ('benefit','cash')
    or length(trim(coalesce(p_reference,''))) not between 1 and 160 then raise exception 'ride_financial_state'; end if;
  if exists(select from private.ride_order_refunds where case_id=c.id) then raise exception 'ride_operation_conflict'; end if;
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

-- A dedicated driver-wallet credential and pre-reviewed destination are required.
-- Without a verified destination, a reservation cannot dispatch a bank transfer.
alter table private.ride_withdrawal_terms add column pix_key_type text check(pix_key_type in ('EVP','EMAIL','PHONE','CPF','CNPJ')),
 add column bank_pix_key text, add column settlement_time text check(length(trim(settlement_time)) between 1 and 150);
alter table private.ride_withdrawals add column sent boolean not null default false, add column pix_type text, add column destination text,
 add column settlement_time text;
create function private.freeze_ride_withdrawal() returns trigger language plpgsql set search_path='' as $$
declare t private.ride_withdrawal_terms;
begin
 select * into strict t from private.ride_withdrawal_terms where driver_id=new.driver_id and environment=new.environment;
 if t.pix_key_type is null or length(trim(coalesce(t.bank_pix_key,''))) not between 1 and 160 or t.settlement_time is null then raise exception 'ride_feature_disabled'; end if;
 new.pix_type:=t.pix_key_type; new.destination:=t.bank_pix_key; new.settlement_time:=t.settlement_time;
 return new;
end $$;
create trigger freeze_withdrawal before insert on private.ride_withdrawals for each row execute function private.freeze_ride_withdrawal();
create function public.ride_withdrawal_provider_view(p_key uuid,p_environment text,p_actor uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',w.id,'wallet',w.wallet,'type',w.pix_type,'destination',w.destination,'gross',w.gross_cents,'fee',w.fee_cents,
 'net',w.gross_cents-w.fee_cents,'provider_ref',w.provider_ref,'status',w.status,'sent',w.sent)
 from private.ride_withdrawals w where w.id=p_key and w.environment=private.ride_env() and w.environment=p_environment
 and (p_actor is null or (p_actor=w.driver_id and private.ride_active_user(p_actor)))
$$;
create function public.ride_claim_withdrawal_send(p_key uuid,p_environment text) returns boolean
language plpgsql security definer set search_path='' as $$
declare w private.ride_withdrawals;
begin
 select * into w from private.ride_withdrawals where id=p_key and environment=private.ride_env() and environment=p_environment for update;
 if not found or w.sent or w.status<>'reserved' then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended('ride-wallet:'||w.environment||w.driver_id,0));
 if not private.ride_active_user(w.driver_id) or not exists(select from private.ride_withdrawal_terms t where t.driver_id=w.driver_id and t.environment=w.environment
    and t.wallet=w.wallet and t.bank_ref=w.bank_ref and t.bank_pix_key=w.destination and t.pix_key_type=w.pix_type and t.fee_cents=w.fee_cents
    and t.valid_until>now() and t.limit_cents>=w.gross_cents)
    or private.ride_wallet_available(w.driver_id,w.environment)<0 or not exists(select from public.ride_legs l
      join private.ride_payment_orders o on o.leg_id=l.id join private.ride_order_psp s on s.order_id=o.id and s.wallet=w.wallet
      where l.driver_id=w.driver_id and l.environment=w.environment and private.ride_method(l,'withdrawal') is not null) then return false; end if;
 update private.ride_withdrawals set sent=true,status='unknown' where id=p_key;
 return true;
end $$;
create function public.ride_my_withdrawal_terms() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('time',t.settlement_time,'fee',t.fee_cents,'limit',t.limit_cents) from private.ride_withdrawal_terms t
 where t.driver_id=auth.uid() and private.ride_active_user(auth.uid()) and t.environment=private.ride_env() and t.valid_until>now()
   and t.pix_key_type is not null and t.bank_pix_key is not null
$$;
revoke all on function private.freeze_ride_withdrawal(),public.ride_prepare_order_refund(uuid,uuid,text,int,text),public.ride_claim_order_refund(uuid,text),
 public.ride_withdrawal_provider_view(uuid,text,uuid),public.ride_claim_withdrawal_send(uuid,text),public.ride_my_withdrawal_terms() from public,anon,authenticated,service_role;
grant execute on function public.ride_prepare_order_refund(uuid,uuid,text,int,text),public.ride_claim_order_refund(uuid,text),
 public.ride_withdrawal_provider_view(uuid,text,uuid),public.ride_claim_withdrawal_send(uuid,text) to service_role;
grant execute on function public.ride_my_withdrawal_terms() to authenticated;

create table private.ride_cash_commission_receipts (
 id uuid primary key, leg_id uuid not null references private.ride_order_plans(leg_id),
 cents integer not null check(cents>0), bank_ref text not null unique, reviewer uuid not null, at timestamptz not null default now()
);
alter table private.ride_cash_commission_receipts enable row level security;
revoke all on private.ride_cash_commission_receipts from public,anon,authenticated,service_role;
create function public.admin_settle_ride_cash_commission(p_leg uuid,p_cents int,p_reference text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare e private.ride_cash_commission_receipts; balance bigint; o private.ride_payment_orders;
begin
 perform private.require_ride_finance_admin();
 perform 1 from private.ride_financial_accounts where leg_id=p_leg and environment=private.ride_env() and settlement_source='orders' for update;
 if not found or p_key is null or p_cents is null or p_cents<=0 or length(trim(coalesce(p_reference,''))) not between 1 and 160 then raise exception 'invalid_input'; end if;
 select * into e from private.ride_cash_commission_receipts where id=p_key;
 if found then
   if (e.leg_id,e.cents,e.bank_ref) is distinct from (p_leg,p_cents,trim(p_reference)) then raise exception 'ride_operation_conflict'; end if;
   return e.id;
 end if;
 select po.* into o from private.ride_payment_orders po where po.leg_id=p_leg and exists(select from private.ride_cash_receipts r where r.order_id=po.id and r.status='confirmed');
 select driver_balance_cents into balance from private.ride_financial_balances where leg_id=p_leg;
 if o.id is null or p_cents> -balance or p_cents>o.commission_cents-coalesce((select sum(cents) from private.ride_cash_commission_receipts where leg_id=p_leg),0)
    then raise exception 'ride_financial_state'; end if;
 insert into private.ride_cash_commission_receipts values(p_key,p_leg,p_cents,trim(p_reference),auth.uid(),now());
 insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,cash_delta,driver_delta,recorded_by)
 values(p_leg,p_key,'cash_commission_settled',p_cents,p_cents,p_cents,auth.uid());
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(o.id,'cash_commission_settled',p_key,auth.uid(),jsonb_build_object('cents',p_cents));
 return p_key;
end $$;
revoke all on function public.admin_settle_ride_cash_commission(uuid,int,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.admin_settle_ride_cash_commission(uuid,int,text,uuid) to authenticated;

-- O17 stage 2 projects these amounts through its existing role-checked daily
-- and weekly statements. A tip is income; it is never a reimbursed expense.
create or replace function private.ride_driver_event_amounts(e private.ride_financial_events)
returns table(income bigint,paid bigint,extras bigint) language sql stable set search_path='' as $$
 select
   case when e.kind in ('earned','tip_earned','wait_earned','refund','chargeback','benefit_restored') then e.driver_delta::bigint
        when e.kind='cash_refund' then e.driver_delta::bigint-e.amount_cents else 0 end,
   case when e.kind in ('payout','payout_reversal','direct_cash','cash_commission_settled') then -e.driver_delta::bigint
        when e.kind='cash_refund' then -e.amount_cents::bigint else 0 end,
   case when e.kind='earned' then e.extras_cents::bigint
        when e.kind in ('refund','chargeback','cash_refund','benefit_restored') and not exists(
          select from private.ride_order_events v join private.ride_payment_orders o on o.id=v.order_id
          where v.operation_id=e.operation_id and o.leg_id=e.leg_id and o.component='tip'
        ) then -e.extras_cents::bigint else 0 end
$$;
revoke all on function private.ride_driver_event_amounts(private.ride_financial_events) from public,anon,authenticated,service_role;

-- A changed route from stage 1 carries a new quote and individual consents.
-- Never rewrite a guest's share or a submitted tender with a changed fare.
create function private.amend_order_price() returns trigger language plpgsql security definer set search_path='' as $$
declare plan private.ride_order_plans; o private.ride_payment_orders; entry jsonb; op uuid;
begin
 select * into plan from private.ride_order_plans where leg_id=new.id for update;
 if not found then return new; end if;
 if new.payer_id<>plan.original_payer or new.source_quote_id is null or new.source_quote_id is not distinct from old.source_quote_id
   or not exists(select from private.ride_consents where quote_id=new.source_quote_id and actor_id=new.payer_id and accepted) then raise exception 'ride_order_reapproval_required'; end if;
 select e into entry from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) e where q.id=new.source_quote_id
   and q.environment=new.environment and (e->>'seq')::int=new.quote_seq;
 if (entry->>'payer_id')::uuid is distinct from new.payer_id or (entry->>'fare_cents')::int is distinct from new.fare_cents
   or (entry->>'extras_cents')::int is distinct from new.extras_cents or (entry->>'fee_cents')::int is distinct from new.fee_cents then raise exception 'ride_order_reapproval_required'; end if;
 select * into o from private.ride_payment_orders where leg_id=new.id and payer=new.payer_id and component='fare' for update;
 if o.status<>'open' or o.received_cents<>0 or exists(select from private.ride_order_psp where order_id=o.id)
   or exists(select from private.ride_payment_orders where leg_id=new.id and id<>o.id and status<>'cancelled')
   or exists(select from private.ride_share_invites where source_order=o.id and status='pending' and expires_at>now())
   then raise exception 'ride_order_reapproval_required'; end if;
 update private.ride_payment_orders set amount_cents=new.fare_cents,extras_cents=new.extras_cents,commission_cents=new.fee_cents where id=o.id;
 op:=md5('order-price:'||new.id||':'||new.source_quote_id)::uuid;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(o.id,'new_price',op,auth.uid(),jsonb_build_object('quote',new.source_quote_id,'total',new.fare_cents));
 return new;
end $$;
create trigger ride_order_amendment before update of fare_cents,extras_cents,fee_cents,payer_id on public.ride_legs for each row
 when ((new.fare_cents,new.extras_cents,new.fee_cents,new.payer_id) is distinct from (old.fare_cents,old.extras_cents,old.fee_cents,old.payer_id))
 execute function private.amend_order_price();
create function private.cancel_unspent_orders() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.ride_payment_orders set status='cancelled' where leg_id=new.id and status='open' and received_cents=0;
 update private.ride_share_invites i set status='revoked' from private.ride_payment_orders o where o.id=i.source_order and o.leg_id=new.id and i.status='pending';
 return new;
end $$;
create trigger ride_cancel_unspent_orders after update of status on public.ride_legs for each row
 when(new.status='cancelled' and old.status is distinct from new.status) execute function private.cancel_unspent_orders();
revoke all on function private.amend_order_price(),private.cancel_unspent_orders() from public,anon,authenticated,service_role;

create function public.ride_order_statement(p_leg uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('gross',sum(o.amount_cents),'received',sum(o.received_cents),'refunded',sum(o.refunded_cents),
   'funded',coalesce(sum(b.applied_cents-b.restored_cents),0),'commission',max(fin.commission_cents),'driver_balance',max(fin.driver_balance_cents),
   'receivable',max(fin.receivable_cents),'processor',max(fin.processing_cost_cents),'driver_paid',sum(o.driver_paid),'driver_recovered',sum(o.driver_returned),
   'cash_received',coalesce((select sum(r.tendered_cents-r.change_cents) from private.ride_cash_receipts r
       join private.ride_payment_orders c on c.id=r.order_id where c.leg_id=p_leg and r.status='confirmed'),0),
   'has_cash',exists(select from private.ride_cash_receipts r join private.ride_payment_orders c on c.id=r.order_id where c.leg_id=p_leg and r.status='confirmed'))
 from private.ride_payment_orders o join public.ride_legs l on l.id=o.leg_id and l.environment=private.ride_env()
 left join private.ride_benefit_uses b on b.order_id=o.id left join private.ride_financial_balances fin on fin.leg_id=l.id
 where l.id=p_leg and private.ride_active_user(auth.uid()) and (l.driver_id=auth.uid() or public.is_admin()) group by l.id
$$;
revoke all on function public.ride_order_statement(uuid) from public,anon,authenticated,service_role;
grant execute on function public.ride_order_statement(uuid) to authenticated;

-- One promotion budget per real pilot shares the R$300 envelope across users,
-- legs and markets. Opening a second campaign must not reset that envelope.
alter table private.ride_benefit_campaigns add column pilot_id uuid unique references private.ride_pilot(id),
 add check(environment<>'live' or pilot_id is not null);
create function private.enforce_ride_campaign_window() returns trigger language plpgsql set search_path='' as $$
begin
 if new.environment='live' and new.committed_cents>old.committed_cents and not exists(select from private.ride_pilot p
     where p.id=new.pilot_id and not p.frozen and p.period @> now() and p.period @> new.validity) then raise exception 'benefit_unavailable'; end if;
 return new;
end $$;
create trigger ride_promotion_window before update of committed_cents on private.ride_benefit_campaigns
 for each row execute function private.enforce_ride_campaign_window();
revoke all on function private.enforce_ride_campaign_window() from public,anon,authenticated,service_role;

-- The hosted checkout must actually enforce the card brands specified in the
-- signed corridor contract. No client can expand the acquiring account's list.
alter table private.ride_method_releases add column card_brands text[] not null default '{}',
 add constraint ride_method_brands check((method<>'card' and cardinality(card_brands)=0) or
   (method='card' and cardinality(card_brands) between 1 and 15 and array_position(card_brands,null) is null
    and card_brands <@ array['VISA','MASTERCARD','ELO','DINERS','DISCOVER','AMEX','CABAL','BANESCARD','CREDZ','SOROCRED','CREDSYSTEM','JCB','HIPERCARD','AURA','CIELO']));
alter table private.ride_order_psp add column card_brands text[] not null default '{}';
create function private.freeze_ride_card_brands() returns trigger language plpgsql set search_path='' as $$
begin
 if new.method='card' then select r.card_brands into strict new.card_brands from private.ride_method_releases r where r.id=new.contract_id and r.method='card'; end if;
 return new;
end $$;
create trigger ride_order_card_brands before insert on private.ride_order_psp for each row execute function private.freeze_ride_card_brands();
create or replace function public.ride_order_provider_intent(p_order uuid,p_environment text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('leg_id',s.order_id,'customer',s.customer_ref,'wallet',s.wallet,'amount_cents',s.amount_cents,'brands',s.card_brands,
   'driver_cents',s.split_cents,'extras_cents',o.extras_cents,'method',case s.method when 'card' then 'CREDIT_CARD' else 'PIX' end,
   'payment_id',s.payment_id,'create',not s.sent and s.payment_id is null)
 from private.ride_order_psp s join private.ride_payment_orders o on o.id=s.order_id
 where s.order_id=p_order and s.environment=private.ride_env() and s.environment=p_environment
$$;
revoke all on function private.freeze_ride_card_brands() from public,anon,authenticated,service_role;
