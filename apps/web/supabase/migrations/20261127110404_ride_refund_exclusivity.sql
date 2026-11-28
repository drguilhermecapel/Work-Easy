-- One refund path per approved case. A provider refund is booked only against the
-- row this system reserved and sent; every function below locks case -> order.
alter table private.ride_order_refunds add column voided_at timestamptz, add column void_ref text,
 add constraint ride_order_refunds_void check((voided_at is null)=(void_ref is null) and (void_ref is null or length(trim(void_ref)) between 1 and 160));
-- An issuer debit shares ride_order_psp.reversed_cents with provider refunds, but the provider reports
-- only its own refunds. Every comparison with its total, and every refund target, removes the debit first.
create function private.ride_order_issuer_debit(p_order uuid) returns int language sql stable set search_path='' as $$
 select coalesce((select d.cents from private.ride_issuer_decisions d where d.order_id=p_order and d.lost),0)
$$;
-- Greatest provider refund total parked as unrequested that is still unbooked, or null.
create function private.ride_order_parked_refund(p_order uuid) returns int language sql stable set search_path='' as $$
 select max((v.observed->>'refunded')::int) from private.ride_order_provider_reviews v join private.ride_order_psp s on s.order_id=v.order_id
 where v.order_id=p_order and v.reason='unrequested_refund' and (v.observed->>'refunded')::int>s.reversed_cents-private.ride_order_issuer_debit(p_order)
$$;
create function private.ride_void_order_refund(p_case uuid,p_ref text) returns void language plpgsql set search_path='' as $$
declare r private.ride_order_refunds;
begin
 update private.ride_order_refunds set voided_at=now(),void_ref=left(p_ref,160) where case_id=p_case and voided_at is null returning * into r;
 if not found then return; end if;
 delete from private.ride_order_refund_allocation where order_id=r.order_id and cumulative_cents=r.target_cents;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(r.order_id,'refund_voided',md5('refund-void/'||r.case_id||'/'||r.void_ref)::uuid,auth.uid(),
   jsonb_build_object('case',r.case_id,'reference',r.void_ref,'target',r.target_cents,'sent',r.sent)) on conflict do nothing;
end $$;
revoke all on function private.ride_order_issuer_debit(uuid),private.ride_order_parked_refund(uuid),private.ride_void_order_refund(uuid,text) from public,anon,authenticated,service_role;

create or replace function public.ride_observe_order_payment(p_order uuid,p_environment text,p_fact jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; s private.ride_order_psp; l public.ride_legs; state text:=p_fact->>'status'; reason text:=p_fact->>'reason';
 payment text:=p_fact->>'payment'; refunded int:=(p_fact->>'refunded')::int; split int:=(p_fact->>'splitCents')::int;
 paid int:=(p_fact->>'paidToDriver')::int; returned int:=(p_fact->>'returnedByDriver')::int; processor int:=(p_fact->>'pspFee')::int;
 invoice_link text:=p_fact->>'invoice'; prefix text; delta int; operation uuid; held uuid; held_status text; r private.ride_order_refunds;
 debited int; recovered int;
begin
 select id,status into held,held_status from private.ride_order_cases where order_id=p_order and status in ('open','approved') for update;
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
 -- Provider totals exclude what the issuer debited and what its decision recovered from the driver.
 debited:=private.ride_order_issuer_debit(o.id);
 recovered:=coalesce((select sum(cents) from private.ride_issuer_returns where order_id=o.id),0);
 delta:=refunded-(s.reversed_cents-debited);
 if delta>0 then
   -- The case was approved before its refund was sent, so a legitimate report always finds it locked above.
   select x.* into r from private.ride_order_refunds x where x.case_id=held and held_status='approved' and x.order_id=o.id
     and x.sent and x.voided_at is null and x.target_cents=refunded and x.amount_cents=delta;
   if not found then reason:=coalesce(reason,'unrequested_refund'); end if;
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
 if refunded<s.reversed_cents-debited or returned<s.refunded_split_cents-recovered or (s.captured and state<>'paid') then return o.status; end if;
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
 if refunded>s.reversed_cents-debited then
   operation:=md5('order-refund/'||o.id||'/'||refunded)::uuid;
   perform private.ride_order_reverse(o.id,r.amount_cents,r.extras_cents,'psp',operation);
   update private.ride_order_cases set status='settled' where id=r.case_id;
 end if;
 if returned>s.refunded_split_cents-recovered then
   delta:=returned-(s.refunded_split_cents-recovered); operation:=md5('order-returned-split/'||o.id||'/'||returned)::uuid;
   insert into private.ride_financial_events(leg_id,operation_id,kind,amount_cents,cash_delta,driver_delta,observed_driver_split_cents)
    values(o.leg_id,operation,'payout_reversal',delta,delta,delta,delta);
   update private.ride_payment_orders set driver_returned=returned+recovered where id=o.id;
   insert into private.ride_order_events(order_id,action,operation_id,data) values(o.id,'wallet_reversal',operation,jsonb_build_object('cents',delta));
 end if;
 update private.ride_order_psp set payment_id=payment,sent=true,captured=captured or state='paid',invoice=case when state='pending' then invoice_link end,
   reversed_cents=refunded+debited,refunded_split_cents=returned+recovered where order_id=o.id;
 update private.ride_payment_orders set status=state where id=o.id and status<>state;
 return state;
end $$;

create or replace function public.ride_prepare_order_refund(p_case uuid,p_actor uuid,p_environment text,p_extras int,p_evidence text) returns jsonb
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
 if found and (r.sent or r.voided_at is null) then
  -- A voided attempt that reached the provider is final. One that never left it is reserved again below.
  if r.voided_at is not null then raise exception 'ride_financial_state'; end if;
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
   values(p_case,o.id,c.requested_cents,s.reversed_cents-private.ride_order_issuer_debit(o.id)+c.requested_cents,p_extras,returned,p_actor,trim(p_evidence))
   on conflict(case_id) do update set amount_cents=excluded.amount_cents,target_cents=excluded.target_cents,extras_cents=excluded.extras_cents,
     return_split_cents=excluded.return_split_cents,recorded_by=excluded.recorded_by,evidence_ref=excluded.evidence_ref,voided_at=null,void_ref=null returning * into r;
  insert into private.ride_order_refund_allocation values(o.id,r.target_cents,p_extras,trim(p_evidence))
   on conflict(order_id,cumulative_cents) do update set extras_cents=excluded.extras_cents,evidence_ref=excluded.evidence_ref;
 end if;
 return jsonb_build_object('case_id',r.case_id,'order_id',o.id,'payment',s.payment_id,'amount',r.amount_cents,'target',r.target_cents,
   'split_return',r.return_split_cents,'wallet',s.wallet,'create',not r.sent and c.status='approved','method',s.method);
end $$;
-- The case lock orders the send lease against an issuer debit or an operator void.
create or replace function public.ride_claim_order_refund(p_case uuid,p_environment text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from private.ride_order_cases where id=p_case for update;
 update private.ride_order_refunds r set sent=true from private.ride_order_psp s,private.ride_order_cases c
 where r.case_id=p_case and not r.sent and r.voided_at is null and s.order_id=r.order_id and s.environment=private.ride_env() and s.environment=p_environment
   and c.id=r.case_id and c.status='approved' and s.reversed_cents-private.ride_order_issuer_debit(s.order_id)+r.amount_cents=r.target_cents;
 return found;
end $$;
create or replace function public.ride_refund_order_source(p_case uuid,p_origin text,p_extras int,p_reference text) returns text
language plpgsql security definer set search_path='' as $$
declare c private.ride_order_cases; o private.ride_payment_orders;
begin
 perform private.require_ride_finance_admin();
 select * into c from private.ride_order_cases where id=p_case for update;
 select po.* into o from private.ride_payment_orders po join private.ride_order_plans pl on pl.leg_id=po.leg_id and pl.environment=private.ride_env() where po.id=c.order_id for update of po;
 if not found or c.status not in ('approved','settled') or p_origin is null or p_origin not in ('benefit','cash')
   or length(trim(coalesce(p_reference,''))) not between 1 and 160 then raise exception 'ride_financial_state'; end if;
 -- A live provider attempt owns the case until it is booked or voided.
 if exists(select from private.ride_order_refunds where case_id=c.id and voided_at is null) then raise exception 'ride_operation_conflict'; end if;
 if c.status='settled' then
   if not exists(select from private.ride_order_events where order_id=o.id and operation_id=c.id and action='refund_evidence'
     and data=jsonb_build_object('origin',p_origin,'reference',trim(p_reference),'extras',p_extras)) then raise exception 'ride_operation_conflict'; end if;
   return c.status;
 end if;
 -- A provider refund parked for review already left this order: accept or clear it before paying from another source.
 if private.ride_order_parked_refund(o.id) is not null then raise exception 'ride_operation_conflict'; end if;
 perform private.ride_order_reverse(o.id,c.requested_cents,p_extras,p_origin,c.id);
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(o.id,'refund_evidence',c.id,auth.uid(),
   jsonb_build_object('origin',p_origin,'reference',trim(p_reference),'extras',p_extras));
 update private.ride_order_cases set status='settled' where id=c.id;
 return 'settled';
end $$;

-- The operator attests that a provider refund attempt will never complete. The case stays approved:
-- it is paid at its benefit or cash source, reserved again if the attempt never left, or declined.
create function public.admin_void_order_refund(p_case uuid,p_reference text) returns text
language plpgsql security definer set search_path='' as $$
declare c private.ride_order_cases; o private.ride_payment_orders; r private.ride_order_refunds; ref text:=trim(coalesce(p_reference,''));
begin
 perform private.require_ride_finance_admin();
 select * into c from private.ride_order_cases where id=p_case for update;
 select po.* into o from private.ride_payment_orders po join private.ride_order_plans pl on pl.leg_id=po.leg_id and pl.environment=private.ride_env() where po.id=c.order_id for update of po;
 select * into r from private.ride_order_refunds where case_id=c.id and order_id=o.id for update;
 if not found or length(ref) not between 1 and 160 then raise exception 'ride_financial_state'; end if;
 if r.voided_at is not null then
   if r.void_ref<>ref then raise exception 'ride_operation_conflict'; end if;
   return 'voided';
 end if;
 if c.status<>'approved' then raise exception 'ride_financial_state'; end if;
 perform private.ride_void_order_refund(c.id,ref);
 return 'voided';
end $$;

-- Exit for an order parked with unrequested_refund: the operator binds the refund the provider already
-- made to one approved case, and the next canonical observation books it through the single path above.
create function public.admin_accept_provider_refund(p_order uuid,p_cumulative int,p_extras int,p_reference text) returns uuid
language plpgsql security definer set search_path='' as $$
declare c private.ride_order_cases; o private.ride_payment_orders; s private.ride_order_psp; r private.ride_order_refunds;
 ref text:=trim(coalesce(p_reference,'')); amount int;
begin
 perform private.require_ride_finance_admin();
 select * into c from private.ride_order_cases where order_id=p_order and status in ('open','approved') for update;
 select po.* into o from private.ride_payment_orders po join private.ride_order_plans pl on pl.leg_id=po.leg_id and pl.environment=private.ride_env() where po.id=p_order for update of po;
 select * into s from private.ride_order_psp where order_id=o.id and environment=private.ride_env() for update;
 if not found or p_cumulative is null or p_extras is null or length(ref) not between 1 and 160 then raise exception 'ride_financial_state'; end if;
 select * into r from private.ride_order_refunds where order_id=o.id and target_cents=p_cumulative and sent and voided_at is null;
 if found then
   if (r.extras_cents,r.evidence_ref) is distinct from (p_extras,ref) then raise exception 'ride_operation_conflict'; end if;
   return r.case_id;
 end if;
 amount:=p_cumulative-(s.reversed_cents-private.ride_order_issuer_debit(o.id));
 -- Only the latest parked provider total can be accepted, and only while the order still has that much to refund.
 if p_cumulative is distinct from private.ride_order_parked_refund(o.id)
    or amount>o.received_cents-o.refunded_cents+(case when s.captured then 0 else s.amount_cents end)
    or p_extras not between 0 and least(amount,o.extras_cents-o.refunded_extras)
    or amount-p_extras>o.amount_cents-o.extras_cents-o.refunded_cents+o.refunded_extras then raise exception 'ride_financial_state'; end if;
 select * into r from private.ride_order_refunds where case_id=c.id;
 -- A case this function opened for an older provider total is replaced, never left pending beside the new one.
 if c.status='approved' and c.requested_cents<>amount and c.id=md5('provider-refund/'||o.id||'/'||r.target_cents)::uuid then
   perform private.ride_void_order_refund(c.id,'superseded:'||ref);
   update private.ride_order_cases set status='declined',decision='Substituída por novo extrato do provedor' where id=c.id;
   c:=null;
 end if;
 if c.id is null then
   insert into private.ride_order_cases as k(id,order_id,payer_id,reason,requested_cents,status,decision,decided_by)
   values(md5('provider-refund/'||o.id||'/'||p_cumulative)::uuid,o.id,o.payer,'Devolução feita direto no provedor de pagamento',amount,'approved',
     'Conferida com o extrato do provedor',auth.uid())
   on conflict(id) do update set status='approved',requested_cents=excluded.requested_cents,decision=excluded.decision,decided_by=excluded.decided_by
     where k.status='declined' returning * into c;
   if c.id is null then raise exception 'ride_operation_conflict'; end if;
 -- The approved request of this exact amount is the one the provider already paid: its unsent or voided attempt is
 -- adopted. Any other pending case is decided first; an approval nothing was sent for can be withdrawn.
 elsif c.status<>'approved' or c.requested_cents<>amount or (r.sent and r.voided_at is null) then raise exception 'ride_operation_conflict';
 end if;
 insert into private.ride_order_refunds(case_id,order_id,amount_cents,target_cents,extras_cents,return_split_cents,sent,recorded_by,evidence_ref)
 values(c.id,o.id,amount,p_cumulative,p_extras,0,true,auth.uid(),ref)
 on conflict(case_id) do update set amount_cents=excluded.amount_cents,target_cents=excluded.target_cents,extras_cents=excluded.extras_cents,return_split_cents=0,
   sent=true,recorded_by=excluded.recorded_by,evidence_ref=excluded.evidence_ref,voided_at=null,void_ref=null;
 insert into private.ride_order_refund_allocation values(o.id,p_cumulative,p_extras,ref)
 on conflict(order_id,cumulative_cents) do update set extras_cents=excluded.extras_cents,evidence_ref=excluded.evidence_ref;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(o.id,'provider_refund_accepted',
   md5('provider-accept/'||c.id||'/'||p_cumulative||'/'||ref)::uuid,auth.uid(),
   jsonb_build_object('case',c.id,'cumulative',p_cumulative,'extras',p_extras,'reference',ref)) on conflict do nothing;
 return c.id;
end $$;
-- An approval can be withdrawn until its refund reaches the provider. This is the exit when no source can pay
-- the case, or when the provider was refunded directly for another amount.
create or replace function public.ride_decide_order_review(p_case uuid,p_approve boolean,p_reason text) returns text
language plpgsql security definer set search_path='' as $$
declare c private.ride_order_cases; target text;
begin
 perform private.require_ride_finance_admin();
 select rc.* into c from private.ride_order_cases rc join private.ride_payment_orders o on o.id=rc.order_id
 join private.ride_order_plans p on p.leg_id=o.leg_id and p.environment=private.ride_env() where rc.id=p_case for update of rc;
 if not found or p_approve is null or length(trim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'invalid_input'; end if;
 target:=case when p_approve then 'approved' else 'declined' end;
 if c.status='approved' and not p_approve then
   if exists(select from private.ride_order_refunds where case_id=c.id and sent and voided_at is null) then raise exception 'ride_operation_conflict'; end if;
   perform private.ride_void_order_refund(c.id,'declined:'||trim(p_reason));
   insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(c.order_id,'approval_withdrawn',c.id,auth.uid(),
     jsonb_build_object('approval',c.decision,'approved_by',c.decided_by,'reason',trim(p_reason)));
 elsif c.status<>'open' then
   if c.status<>target or c.decision<>trim(p_reason) then raise exception 'ride_operation_conflict'; end if; return target;
 end if;
 update private.ride_order_cases set status=target,decision=trim(p_reason),decided_by=auth.uid() where id=c.id;
 return target;
end $$;

create or replace function public.admin_resolve_ride_issuer(p_order uuid,p_lost boolean,p_amount int,p_extras int,p_reference text) returns text
language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; s private.ride_order_psp; d private.ride_issuer_decisions; op uuid; held uuid;
begin
 perform private.require_ride_finance_admin();
 select id into held from private.ride_order_cases where order_id=p_order and status in ('open','approved') for update;
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
 -- A refund already sent to the provider must be booked or voided before the same money is debited.
 if p_lost and exists(select from private.ride_order_refunds x join private.ride_order_cases c on c.id=x.case_id
   where x.order_id=o.id and x.sent and x.voided_at is null and c.status='approved') then raise exception 'ride_operation_conflict'; end if;
 perform 1 from private.ride_financial_accounts where leg_id=o.leg_id for update;
 perform pg_advisory_xact_lock(hashtextextended('ride-wallet:'||s.environment||(select driver_id from public.ride_legs where id=o.leg_id),0));
 op:=md5('issuer-decision/'||o.id)::uuid;
 insert into private.ride_issuer_decisions values(o.id,p_lost,p_amount,p_extras,trim(p_reference),auth.uid(),now());
 if p_lost then
   perform private.ride_order_reverse(o.id,p_amount,p_extras,'issuer',op);
   update private.ride_order_psp set reversed_cents=reversed_cents+p_amount where order_id=o.id;
   -- The debit shrank what is left to refund, so an attempt reserved before it (unsent, per the guard above) is
   -- voided and must be reserved again against the new balance.
   perform private.ride_void_order_refund(held,'issuer:'||trim(p_reference));
   -- Only the case locked above may close, and only when the debit is exactly its approved amount.
   update private.ride_order_cases set status='settled' where id=held and status='approved' and requested_cents=p_amount;
 end if;
 -- A provider refund still parked for review keeps the order there after the issuer decision.
 update private.ride_payment_orders set status=case when private.ride_order_parked_refund(o.id) is not null then 'review'
   when s.captured then 'paid' else 'unknown' end where id=o.id;
 insert into private.ride_order_events(order_id,action,operation_id,actor,data) values(o.id,'issuer_decision',op,auth.uid(),
   jsonb_build_object('lost',p_lost,'amount',p_amount,'extras',p_extras));
 return case when p_lost then 'debited' else 'released' end;
end $$;

revoke all on function public.ride_observe_order_payment(uuid,text,jsonb),public.ride_prepare_order_refund(uuid,uuid,text,int,text),
 public.ride_claim_order_refund(uuid,text),public.ride_refund_order_source(uuid,text,int,text),public.admin_void_order_refund(uuid,text),
 public.admin_accept_provider_refund(uuid,int,int,text),public.admin_resolve_ride_issuer(uuid,boolean,int,int,text),
 public.ride_decide_order_review(uuid,boolean,text) from public,anon,authenticated,service_role;
grant execute on function public.ride_observe_order_payment(uuid,text,jsonb),public.ride_prepare_order_refund(uuid,uuid,text,int,text),
 public.ride_claim_order_refund(uuid,text) to service_role;
grant execute on function public.ride_refund_order_source(uuid,text,int,text),public.admin_void_order_refund(uuid,text),
 public.admin_accept_provider_refund(uuid,int,int,text),public.admin_resolve_ride_issuer(uuid,boolean,int,int,text),
 public.ride_decide_order_review(uuid,boolean,text) to authenticated;
