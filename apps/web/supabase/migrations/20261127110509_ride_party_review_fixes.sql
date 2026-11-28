-- O17 stage 5 review fixes (PAR-501..508). Each block answers one finding of the adversarial
-- review of 20261127110501..110508 and keeps the stage-4 money invariants: one benefit per
-- order, every cent through the stage-4 order calls, the ledger identity and the 110404 guards.
--  1. A reserved voucher funds its leg in the ordinary payment flow: opening the payer's fare
--     order applies it, a full-fare voucher is applied when the leg completes, cash and a
--     personal charge are refused while it is still unused (ride_voucher_pending).
--  2. A funded quote and its reservation need a 'benefit' and a pix/card release through the leg end.
--  3. A route change of a voucher leg meets the program, the authorization and the release again,
--     and the benefit's redemption window follows the new slot.
--  4. A benefit refund never credits cents an accepted invoice contestation already credited.
--  5. Who rides on somebody else's mandate reads no money in the receipt (ride_aftercare).
--  6. Re-adhesion starts clean; removal withdraws the person's pending and approved authorizations.
--  7. A driver whose capacity record names an active fleet vehicle needs a reviewed cession.
--  8. The quote of a route amendment hides its total from a rider who pays nothing.
--  9. Invite idempotency hashes no longer carry the recipient's e-mail.
-- 10. Erasure neutralizes free text kept for history; the purge removes stale authorizations
--     and memberships; the guardian withdraws a dependent; the export lists every own record.
-- 11. A family needs a limit and a method; a mandate leg re-checks its gate; a price above the
--     ceiling of an invite is recorded as 'reprice'.

-- ─── 1. Voucher bound to the stage-4 order ────────────────────────────────────────────────
-- Applies the leg's unused corporate benefit to the caller's open fare order, through the
-- stage-4 call and under its locks. Silent when anything is not ready yet.
create function private.ride_voucher_apply(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
declare o private.ride_payment_orders; l public.ride_legs; g private.ride_voucher_grants; b private.ride_benefits;
begin
 select * into o from private.ride_payment_orders where id=p_order and payer=auth.uid();
 if not found or o.component<>'fare' or o.status<>'open' or o.method='cash' or o.received_cents<>0 then return; end if;
 select * into strict l from public.ride_legs where id=o.leg_id;
 select * into g from private.ride_voucher_grants where leg_id=l.id and member_id=o.payer;
 if not found or l.status<>'completed' or exists(select from private.ride_benefit_uses u where u.order_id=o.id or u.benefit_id=g.benefit_id)
   or private.ride_method(l,'benefit') is null
   or exists(select from private.ride_share_invites where source_order=o.id and status='pending' and expires_at>now()) then return; end if;
 select * into strict b from private.ride_benefits where id=g.benefit_id;
 if b.valid_until<=now() or b.available_cents<=0 then return; end if;
 perform public.ride_apply_order_benefit(o.id,b.id,least(b.available_cents,o.amount_cents));
end $$;
-- A live voucher of the leg that no order has used yet.
create function private.ride_voucher_waiting(p_leg uuid,p_payer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_voucher_grants g join private.ride_benefits b on b.id=g.benefit_id
   where g.leg_id=p_leg and g.member_id=p_payer and b.valid_until>now() and b.available_cents>0
     and not exists(select from private.ride_benefit_uses u where u.benefit_id=b.id))
$$;
alter function public.ride_open_payment_order(uuid,text) rename to ride_open_payment_order_before_vouchers;
alter function public.ride_open_payment_order_before_vouchers(uuid,text) set schema private;
create function public.ride_open_payment_order(p_leg uuid,p_method text) returns uuid language plpgsql security definer set search_path='' as $$
declare opened uuid;
begin
 -- Cash never carries a benefit: the voucher would be lost to a personal payment.
 if p_method='cash' and private.ride_voucher_waiting(p_leg,auth.uid())
   and exists(select from public.ride_legs l where l.id=p_leg and l.payer_id=auth.uid()) then raise exception 'ride_voucher_pending'; end if;
 opened:=private.ride_open_payment_order_before_vouchers(p_leg,p_method);
 perform private.ride_voucher_apply(opened);
 return opened;
end $$;
alter function public.ride_prepare_order_payment(uuid,uuid,text) rename to ride_prepare_order_payment_before_vouchers;
alter function public.ride_prepare_order_payment_before_vouchers(uuid,uuid,text) set schema private;
-- The provider charge of a fare order is never prepared while the leg's voucher is unused.
create function public.ride_prepare_order_payment(p_order uuid,p_payer uuid,p_environment text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if exists(select from private.ride_payment_orders o where o.id=p_order and o.payer=p_payer and o.component='fare'
     and not exists(select from private.ride_order_psp s where s.order_id=o.id) and private.ride_voucher_waiting(o.leg_id,o.payer)) then
   raise exception 'ride_voucher_pending'; end if;
 return private.ride_prepare_order_payment_before_vouchers(p_order,p_payer,p_environment);
end $$;
-- When a leg completes and its voucher covers the whole fare (always for a corporate guest),
-- or the payer already opened the fare order, the voucher is applied in the payer's name with
-- the stage-4 calls. Anything unexpected leaves the leg as it was for the payer to redeem.
create function private.ride_voucher_settle() returns trigger language plpgsql security definer set search_path='' as $$
declare g private.ride_voucher_grants; b private.ride_benefits; o private.ride_payment_orders; m text; was text:=current_setting('request.jwt.claim.sub',true);
begin
 select * into g from private.ride_voucher_grants where leg_id=new.id and member_id=new.payer_id;
 if not found or not private.ride_voucher_waiting(new.id,new.payer_id) then return null; end if;
 select * into strict b from private.ride_benefits where id=g.benefit_id;
 select * into o from private.ride_payment_orders where leg_id=new.id and payer=new.payer_id and component='fare';
 if o.id is null and b.available_cents<new.fare_cents then return null; end if;
 m:=coalesce(o.method,case when private.ride_method(new,'pix') is not null then 'pix' when private.ride_method(new,'card') is not null then 'card' end);
 if m is null or m='cash' then return null; end if;
 begin
   perform set_config('request.jwt.claim.sub',new.payer_id::text,true);
   perform public.ride_open_payment_order(new.id,m);
   perform set_config('request.jwt.claim.sub',coalesce(was,''),true);
 exception when others then
   -- The subtransaction rollback also restores the caller's identity.
   null;
 end;
 return null;
end $$;
create trigger ride_voucher_settle after update of status on public.ride_legs for each row
 when(new.status='completed' and old.status is distinct from new.status) execute function private.ride_voucher_settle();
-- Redemption answers the order that already carries the voucher, whatever method is asked.
create or replace function public.ride_redeem_voucher(p_leg uuid,p_method text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); g private.ride_voucher_grants; b private.ride_benefits; o private.ride_payment_orders;
 u private.ride_benefit_uses; cents int; opened uuid;
begin
 if p_leg is null or p_method is null or p_method not in ('pix','card') then raise exception 'invalid_input'; end if;
 select x.* into g from private.ride_voucher_grants x join public.ride_legs l on l.id=x.leg_id
  where x.leg_id=p_leg and l.payer_id=me and x.member_id=me and l.environment=private.ride_env();
 if not found then raise exception 'ride_voucher_unavailable'; end if;
 select * into o from private.ride_payment_orders where leg_id=p_leg and payer=me and component='fare';
 if o.id is not null and exists(select from private.ride_benefit_uses where order_id=o.id) then opened:=o.id;
 else opened:=public.ride_open_payment_order(p_leg,p_method); end if;
 select * into strict o from private.ride_payment_orders where id=opened;
 select * into u from private.ride_benefit_uses where order_id=o.id;
 if not found then
   select * into strict b from private.ride_benefits where id=g.benefit_id;
   cents:=least(b.available_cents,o.amount_cents);
   if cents<=0 or b.valid_until<=now() then raise exception 'ride_voucher_unavailable'; end if;
   perform public.ride_apply_order_benefit(o.id,b.id,cents);
   select * into strict u from private.ride_benefit_uses where order_id=o.id;
 elsif u.benefit_id<>g.benefit_id then raise exception 'ride_operation_conflict'; end if;
 return jsonb_build_object('order_id',o.id,'applied_cents',u.applied_cents,'remainder_cents',o.amount_cents-u.applied_cents,'method',o.method);
end $$;

-- ─── 2. Releases a voucher depends on ─────────────────────────────────────────────────────
-- Redemption needs a 'benefit' release and the fare order a pix or card release on the leg's
-- corridor; both must last through the end of the leg.
create function private.ride_voucher_payable(p_env text,p_origin text,p_destination text,p_until timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_method_releases r where r.environment=p_env and r.origin=p_origin and r.destination=p_destination
     and r.method='benefit' and r.validity @> greatest(now(),p_until))
   and exists(select from private.ride_method_releases r where r.environment=p_env and r.origin=p_origin and r.destination=p_destination
     and r.method in ('pix','card') and r.validity @> greatest(now(),p_until))
$$;
alter function public.ride_quote_funded(uuid,timestamptz,jsonb,uuid,uuid,uuid) rename to ride_quote_funded_before_review;
alter function public.ride_quote_funded_before_review(uuid,timestamptz,jsonb,uuid,uuid,uuid) set schema private;
create function public.ride_quote_funded(p_key uuid,p_scheduled_at timestamptz,p_legs jsonb,p_program uuid,p_cost_center uuid,p_grant uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v jsonb:=private.ride_quote_funded_before_review(p_key,p_scheduled_at,p_legs,p_program,p_cost_center,p_grant); e jsonb;
begin
 for e in select x from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) x where q.id=(v->>'id')::uuid loop
   if not private.ride_voucher_payable(private.ride_env(),e->>'origin',e->>'destination',
      (e->>'pickup_at')::timestamptz+make_interval(mins=>coalesce((e->>'duration_minutes')::int,0))) then raise exception 'ride_voucher_unavailable'; end if;
 end loop;
 return v;
end $$;
create or replace function private.ride_voucher_reserve() returns trigger language plpgsql security definer set search_path='' as $$
declare f private.ride_leg_funding; a private.ride_accounts; p private.ride_voucher_programs; item jsonb; part jsonb; cents int; v_ceiling int; made uuid;
begin
 select * into f from private.ride_leg_funding where leg_id=new.id and kind='voucher' and program_id is not null;
 if not found then return null; end if;
 select * into a from private.ride_accounts where id=f.account_id;
 select * into p from private.ride_voucher_programs where id=f.program_id and account_id=a.id for update;
 if not found or new.payer_id<>f.member_id or new.environment<>p.environment or a.kind<>'organization' or not private.ride_account_verified(a)
   or not private.ride_party_allowed(a.environment,'organization',null,null,now()) then raise exception 'ride_voucher_unavailable'; end if;
 if p.requires_approval or f.grant_id is not null then
   update private.ride_trip_grants set status='used',ride_id=new.ride_id where id=f.grant_id and beneficiary_id=f.member_id and program_id=p.id
     and validity @> new.pickup_at and (status='approved' or (status='used' and ride_id=new.ride_id)) returning ceiling_cents into v_ceiling;
   if not found then raise exception 'ride_approval_required'; end if;
 end if;
 select e into item from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) e where q.id=f.quote_id and (e->>'seq')::int=new.quote_seq;
 part:=private.ride_voucher_plan(p,item,v_ceiling);
 if (item->>'fare_cents')::int is distinct from new.fare_cents or part is distinct from f.planned
   or not private.ride_voucher_payable(new.environment,new.origin,new.destination,upper(new.slot)) then raise exception 'ride_voucher_unavailable'; end if;
 cents:=(part->>'voucher_cents')::int;
 if private.ride_voucher_commitment(p.id,null)+cents>p.budget_cents or private.ride_voucher_commitment(p.id,f.member_id)+cents>p.member_limit_cents then
   raise exception 'ride_voucher_unavailable'; end if;
 insert into private.ride_benefits(environment,owner_id,funding_ref,source,awarded_cents,available_cents,valid_until,restricted_leg)
  values(new.environment,new.payer_id,'voucher:'||p.id,'corporate',cents,cents,upper(new.slot)+interval '30 days',new.id) returning id into made;
 insert into private.ride_voucher_grants(benefit_id,leg_id,program_id,account_id,member_id,cost_center_id,granted_cents)
  values(made,new.id,p.id,a.id,f.member_id,f.cost_center_id,cents);
 return null;
end $$;

-- ─── 3. Route change of a voucher leg ─────────────────────────────────────────────────────
-- The reserved cents stay; the rules that allowed them are checked for the new place and time,
-- so a change outside the program needs a new funded quote.
create function private.ride_voucher_leg_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare g private.ride_voucher_grants; f private.ride_leg_funding; p private.ride_voucher_programs; v_ceiling int; v_class text;
begin
 select * into g from private.ride_voucher_grants where leg_id=new.id;
 if not found or exists(select from private.ride_benefit_uses u where u.benefit_id=g.benefit_id) then return new; end if;
 select * into strict f from private.ride_leg_funding where leg_id=new.id;
 select * into strict p from private.ride_voucher_programs where id=g.program_id for update;
 if f.grant_id is not null then
   select ceiling_cents into v_ceiling from private.ride_trip_grants where id=f.grant_id and validity @> new.pickup_at;
   if not found then raise exception 'ride_approval_required'; end if;
 end if;
 select coalesce(e->>'class_code',e->>'ride_class') into v_class from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) e
  where q.id=f.quote_id order by ((e->>'seq')::int=old.quote_seq and old.source_quote_id=f.quote_id) desc,(e->>'seq')::int limit 1;
 perform private.ride_voucher_plan(p,jsonb_build_object('origin',new.origin,'destination',new.destination,'pickup_at',new.pickup_at,
   'duration_minutes',new.duration_minutes,'fare_cents',g.granted_cents,'class_code',v_class),coalesce(v_ceiling,g.granted_cents));
 if not private.ride_voucher_payable(new.environment,new.origin,new.destination,upper(new.slot)) then raise exception 'ride_voucher_unavailable'; end if;
 update private.ride_benefits set valid_until=upper(new.slot)+interval '30 days' where id=g.benefit_id;
 return new;
end $$;
create trigger ride_voucher_leg_change before update of origin,destination,pickup_at,slot on public.ride_legs for each row
 when(new.status<>'cancelled' and (new.origin,new.destination,new.pickup_at,new.slot) is distinct from (old.origin,old.destination,old.pickup_at,old.slot))
 execute function private.ride_voucher_leg_guard();

-- ─── 4. Invoice contestation and benefit refund credit the same cents once ────────────────
-- Both read the order's benefit use after locking the order row.
alter function private.ride_order_reverse(uuid,int,int,text,uuid) rename to ride_order_reverse_before_invoices;
create function private.ride_order_reverse(p_order uuid,p_amount int,p_extras int,p_origin text,p_op uuid) returns void
language plpgsql set search_path='' as $$
declare u private.ride_benefit_uses; credited bigint;
begin
 if p_origin='benefit' then
   perform 1 from private.ride_payment_orders where id=p_order for update;
   select * into u from private.ride_benefit_uses where order_id=p_order;
   select coalesce(sum(d.credit_cents),0) into credited from private.ride_invoice_disputes d join private.ride_invoice_lines l on l.id=d.line_id
    where l.order_id=p_order and d.status='accepted';
   if u.order_id is not null and p_amount>u.applied_cents-u.restored_cents-credited then raise exception 'ride_financial_state'; end if;
 end if;
 perform private.ride_order_reverse_before_invoices(p_order,p_amount,p_extras,p_origin,p_op);
end $$;
create or replace function public.admin_decide_invoice_dispute(p_dispute uuid,p_accept boolean,p_reason text) returns text
language plpgsql security definer set search_path='' as $$
declare d private.ride_invoice_disputes; l private.ride_invoice_lines; env text:=private.ride_env(); target text; credit int;
begin
 perform private.require_ride_finance_admin();
 if p_dispute is null or p_accept is null or length(trim(coalesce(p_reason,''))) not between 1 and 500 then raise exception 'invalid_input'; end if;
 select x.* into d from private.ride_invoice_disputes x join private.ride_accounts a on a.id=x.account_id and a.environment=env where x.id=p_dispute;
 if not found then raise exception 'invalid_input'; end if;
 perform 1 from private.ride_accounts where id=d.account_id for update;
 select * into strict d from private.ride_invoice_disputes where id=p_dispute for update;
 if exists(select from private.ride_account_members where account_id=d.account_id and member_id=auth.uid() and status='active') then raise exception 'not_allowed'; end if;
 target:=case when p_accept then 'accepted' else 'rejected' end;
 if d.status<>'open' then
   if d.status<>target or d.decision<>trim(p_reason) then raise exception 'ride_operation_conflict'; end if;
   return d.status;
 end if;
 if not private.ride_party_allowed(env,'invoice',null,null,now()) then raise exception 'ride_feature_disabled'; end if;
 if p_accept then
   select * into strict l from private.ride_invoice_lines where id=d.line_id;
   perform 1 from private.ride_payment_orders where id=l.order_id for update;
   select least(l.cents,u.applied_cents-u.restored_cents-coalesce((select sum(x.credit_cents) from private.ride_invoice_disputes x
       join private.ride_invoice_lines xl on xl.id=x.line_id where xl.order_id=l.order_id and x.status='accepted'),0))
     into credit from private.ride_benefit_uses u where u.order_id=l.order_id;
   if credit is null or credit<=0 then raise exception 'ride_financial_state'; end if;
 end if;
 update private.ride_invoice_disputes set status=target,decision=trim(p_reason),decided_by=auth.uid(),decided_at=now(),credit_cents=credit where id=d.id;
 perform private.audit('ride.invoice_dispute','ride_invoice_disputes',d.id::text,jsonb_build_object('account',d.account_id,'line',d.line_id,
   'status',target,'credit',credit,'environment',env));
 return target;
end $$;

-- ─── 5. Receipt of a rider who does not pay ───────────────────────────────────────────────
alter function public.ride_aftercare(uuid) rename to ride_aftercare_before_parties;
alter function public.ride_aftercare_before_parties(uuid) set schema private;
create function public.ride_aftercare(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb:=private.ride_aftercare_before_parties(p_leg);
begin
 if jsonb_typeof(d->'document') is distinct from 'object' or d#>>'{document,role}' is distinct from 'passenger'
   or not exists(select from public.ride_legs l join private.ride_leg_funding f on f.leg_id=l.id and f.kind='payer'
     where l.id=p_leg and l.payer_id is distinct from auth.uid()) then return d; end if;
 return jsonb_set(d,'{document}',(d->'document')||jsonb_build_object('money',null,'paid_by_other',true));
end $$;

-- ─── 6. Re-adhesion and removal ───────────────────────────────────────────────────────────
create or replace function private.ride_consume_account_invite(p_token text,p_accept boolean) returns private.ride_account_invites
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); i private.ride_account_invites; a private.ride_accounts; desired text;
begin
 if not private.ride_active_user(me) or p_accept is null then raise exception 'not_allowed'; end if;
 i:=private.ride_find_account_invite(p_token);
 if i.id is null then raise exception 'ride_invite_unavailable'; end if;
 select * into a from private.ride_accounts where id=i.account_id and environment=private.ride_env() for update;
 if not found then raise exception 'ride_invite_unavailable'; end if;
 select * into strict i from private.ride_account_invites where id=i.id for update;
 desired:=case when p_accept then 'accepted' else 'declined' end;
 if i.status=desired and i.member_id=me then return i; end if;
 if i.status<>'pending' or i.expires_at<=now() or a.status<>'active' or a.owner_id=me or not exists(select from private.ride_account_members m
     where m.account_id=a.id and m.member_id=i.issued_by and m.status='active' and m.role in ('admin','manager') and private.ride_active_user(m.member_id))
   then raise exception 'ride_invite_unavailable'; end if;
 if p_accept then
   if not private.ride_account_verified(a) or not private.ride_party_allowed(a.environment,a.kind,null,null,now()) then raise exception 'ride_invite_unavailable'; end if;
   -- Coming back is a new adhesion: group and individual limit are set again by the administrator.
   -- The removal key stays, so an old replay of that removal still answers without removing.
   insert into private.ride_account_members(account_id,member_id,role) values(a.id,me,i.role)
    on conflict(account_id,member_id) do update set status='active',role=excluded.role,joined_at=now(),removed_at=null,member_limit_cents=null,group_tag=null
    where private.ride_account_members.status='removed';
   if a.kind='family' and exists(select from private.ride_account_members where account_id=a.id and member_id=me and role='member')
      and not exists(select from private.ride_payer_mandates where account_id=a.id and rider_id=me and status='active') then
     insert into private.ride_payer_mandates(environment,kind,account_id,rider_id,payer_id) values(a.environment,'family',a.id,me,a.owner_id);
   end if;
 end if;
 update private.ride_account_invites set status=desired,member_id=me,answered_at=now() where id=i.id returning * into i;
 return i;
end $$;
create or replace function public.ride_remove_member(p_account uuid,p_member uuid,p_key uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; old private.ride_account_members;
begin
 if p_account is null or p_member is null or p_key is null then raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into old from private.ride_account_members where removed_by=me and removal_key=p_key;
 if found then
   if (old.account_id,old.member_id)<>(p_account,p_member) then raise exception 'idempotency_conflict'; end if;
   return true;
 end if;
 if p_member<>me then a:=private.ride_require_account_role(p_account,array['admin']);
 else a:=private.ride_require_account_role(p_account,array['member','operator','approver','manager','fleet_driver']); end if;
 if p_member=a.owner_id then raise exception 'invalid_input'; end if;
 perform 1 from private.ride_accounts where id=a.id for update;
 update private.ride_account_members set status='removed',removed_at=now(),removed_by=me,removal_key=p_key
  where account_id=a.id and member_id=p_member and status='active';
 if not found then return false; end if;
 update private.ride_payer_mandates set status='revoked',revoked_at=now() where account_id=a.id and rider_id=p_member and status='active';
 update private.ride_account_invites set status='revoked',answered_at=now() where account_id=a.id and issued_by=p_member and status='pending';
 -- An authorization given to the member does not survive the membership.
 update private.ride_trip_grants set status='rejected',decided_at=now() where account_id=a.id and beneficiary_id=p_member and not guest
   and status in ('requested','approved');
 return true;
end $$;

-- ─── 7. The fleet rule follows the vehicle ────────────────────────────────────────────────
create or replace function private.ride_fleet_can_serve(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select (not exists(select from private.ride_account_members m join private.ride_accounts a on a.id=m.account_id
       where m.member_id=p_driver and m.status='active' and m.role='fleet_driver' and a.kind='fleet' and a.status='active' and a.environment=l.environment)
     -- Leaving the fleet does not free a car the operation knows as a fleet vehicle: a new inspection of
     -- the driver's own vehicle, or a reviewed cession, is needed first.
     and not exists(select from private.ride_vehicle_capacity c join private.ride_fleet_vehicles v on v.vehicle_identifier=c.document_ref and v.status='active'
       join private.ride_accounts a on a.id=v.account_id and a.kind='fleet' and a.status='active' and a.environment=l.environment
       where c.driver_id=p_driver))
   or private.ride_fleet_assignment(p_driver,l) is not null
$$;

-- ─── 8. Amendment quote of a funded leg ───────────────────────────────────────────────────
create or replace function private.ride_quote_view(q private.ride_quotes,p_uid uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare v jsonb:=private.ride_quote_view_before_parties(q,p_uid); f private.ride_quote_funding; n int; pays boolean; items jsonb; planned jsonb;
begin
 pays:=exists(select from jsonb_array_elements(q.legs) e where (e->>'payer_id')::uuid=p_uid);
 select * into f from private.ride_quote_funding where quote_id=q.id;
 if not found then
   -- A route amendment quotes the leg again without a funding row: who pays nothing still reads no total.
   if not pays and exists(select from public.ride_legs l join private.ride_leg_funding x on x.leg_id=l.id and x.kind='payer'
       where (l.source_quote_id=q.id or l.ride_id=q.existing_ride_id) and l.payer_id is distinct from p_uid) then
     return v||jsonb_build_object('total_cents',null); end if;
   return v;
 end if;
 n:=jsonb_array_length(q.legs);
 select coalesce(jsonb_agg(case when e.l->>'fare_cents' is null then e.l else e.l||private.ride_planned(f.planned,e.l->>'seq',n) end order by e.pos),'[]'::jsonb)
   into items from jsonb_array_elements(case when jsonb_typeof(v->'legs')='array' then v->'legs' else '[]'::jsonb end) with ordinality e(l,pos);
 select jsonb_strip_nulls(jsonb_build_object('voucher_cents',sum((x.p->>'voucher_cents')::int),'excess_cents',sum((x.p->>'excess_cents')::int))) into planned
   from (select private.ride_planned(f.planned,e->>'seq',n) as p from jsonb_array_elements(q.legs) e) x;
 return v||jsonb_build_object('legs',items)||case when pays then '{}'::jsonb else jsonb_build_object('total_cents',null) end
   ||jsonb_build_object('funding',case when p_uid=q.passenger_id or p_uid=f.payer_id then private.ride_funding_view(f.kind,f.mandate_id,f.account_id,
       case when p_uid=q.passenger_id then 'rider' else 'payer' end,case when pays then planned end) end);
end $$;

-- ─── 9. Idempotency hashes without the recipient's e-mail ─────────────────────────────────
-- Every other input is stored in the row, so a hash over the e-mail would let a dictionary of
-- addresses re-identify the invitee. A replay with the same key returns the first invite; a
-- different recipient needs a new key.
create or replace function private.ride_issue_account_invite(p_account uuid,p_role text,p_email text,p_minutes int,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); i private.ride_account_invites; token text:=encode(extensions.gen_random_bytes(32),'hex'); h bytea;
begin
 if not private.ride_active_user(me) then raise exception 'not_allowed'; end if;
 if p_key is null or p_account is null or p_role is null or p_role not in ('admin','member','operator','approver','manager','fleet_driver')
   or p_minutes is null or p_minutes not between 5 and 10080 or p_email is null or length(p_email)>254
   or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(p_key::text,p_account::text,p_role,p_minutes::text);
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into i from private.ride_account_invites where id=p_key;
 if found then
   if i.issued_by<>me or i.request_hash<>h then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('id',i.id,'token',null,'expires_at',i.expires_at);
 end if;
 if exists(select from auth.users u where u.id=me and lower(u.email)=lower(trim(p_email))) then raise exception 'invalid_input'; end if;
 if (select count(*) from private.ride_account_invites where issued_by=me and created_at>now()-interval '1 hour')>=12 then raise exception 'rate_limited'; end if;
 insert into private.ride_account_invites(id,account_id,role,token_hash,recipient_hash,request_hash,issued_by,expires_at)
  values(p_key,p_account,p_role,sha256(convert_to(token,'UTF8')),sha256(convert_to(token||lower(trim(p_email)),'UTF8')),h,me,now()+make_interval(mins=>p_minutes))
  returning * into i;
 return jsonb_build_object('id',i.id,'token',token,'expires_at',i.expires_at);
end $$;
create or replace function public.ride_invite_rider(p_quote uuid,p_email text,p_minutes int,p_instructions text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('quote'); env text:=private.ride_env(); q private.ride_quotes; i private.ride_rider_invites;
 token text:=encode(extensions.gen_random_bytes(32),'hex'); note text:=nullif(trim(coalesce(p_instructions,'')),''); h bytea; e jsonb;
begin
 if p_key is null or p_quote is null or p_minutes is null or p_minutes not in (5,15,30,60) or p_email is null or length(p_email)>254
   or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(note)>280 then raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(p_key::text,p_quote::text,p_minutes::text,coalesce(note,''));
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into i from private.ride_rider_invites where id=p_key;
 if found then
   if i.sponsor_id<>me or i.request_hash<>h then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('id',i.id,'token',null,'expires_at',i.expires_at);
 end if;
 if exists(select from auth.users u where u.id=me and lower(u.email)=lower(trim(p_email))) then raise exception 'invalid_input'; end if;
 if (select count(*) from private.ride_rider_invites where sponsor_id=me and created_at>now()-interval '1 hour')>=12 then raise exception 'rate_limited'; end if;
 select * into q from private.ride_quotes where id=p_quote and environment=env and actor_id=me for update;
 if not found then raise exception 'not_allowed'; end if;
 if q.passenger_id<>me or q.booking_id is not null or q.existing_ride_id is not null or q.status<>'awaiting_consent' or q.expires_at<=now()
   or q.required_users<>array[me] or exists(select from private.ride_consents where quote_id=q.id)
   or exists(select from private.ride_quote_funding where quote_id=q.id) then raise exception 'quote_unavailable'; end if;
 if exists(select from jsonb_array_elements(q.request_legs) x where x ?| array['route_id','replaces','next_booking_id','service_endpoint']) then
   raise exception 'invalid_input'; end if;
 for e in select value from jsonb_array_elements(q.legs) loop
   if not private.ride_party_allowed(env,'delegated_ride',e->>'origin',e->>'destination',
      (e->>'pickup_at')::timestamptz+make_interval(mins=>(e->>'duration_minutes')::int)) then raise exception 'ride_feature_disabled'; end if;
 end loop;
 update private.ride_quotes set status='superseded' where id=q.id;
 insert into private.ride_rider_invites(id,environment,sponsor_id,source_quote,request_legs,scheduled_at,ceiling_cents,instructions,
   token_hash,recipient_hash,request_hash,expires_at)
  values(p_key,env,me,q.id,case when q.scheduled_at is null then jsonb_set(q.request_legs,'{0}',(q.request_legs->0)-'pickup_at') else q.request_legs end,
   q.scheduled_at,q.total_cents,note,sha256(convert_to(token,'UTF8')),
   sha256(convert_to(token||lower(trim(p_email)),'UTF8')),h,least(now()+make_interval(mins=>p_minutes),coalesce(q.scheduled_at,'infinity'::timestamptz)))
  returning * into i;
 return jsonb_build_object('id',i.id,'token',token,'expires_at',i.expires_at);
end $$;
create or replace function public.ride_invite_companion(p_email text,p_notices text[],p_pays boolean,p_minutes int,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); env text:=private.ride_env(); i private.ride_companion_invites;
 token text:=encode(extensions.gen_random_bytes(32),'hex'); wanted text[]:=private.ride_companion_notices(p_notices); h bytea;
begin
 if p_key is null or wanted is null or p_pays is null or p_minutes is null or p_minutes not between 5 and 10080 or p_email is null or length(p_email)>254
   or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(p_key::text,array_to_string(wanted,','),p_pays::text,p_minutes::text);
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into i from private.ride_companion_invites where id=p_key;
 if found then
   if i.owner_id<>me or i.request_hash<>h then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('id',i.id,'token',null,'expires_at',i.expires_at);
 end if;
 if exists(select from auth.users u where u.id=me and lower(u.email)=lower(trim(p_email))) then raise exception 'invalid_input'; end if;
 if not private.ride_party_allowed(env,'companion',null,null,now()) or (p_pays and not exists(select from private.ride_companion_terms
     where environment=env and valid_until>now())) then raise exception 'ride_feature_disabled'; end if;
 if (select count(*) from private.ride_companion_invites where owner_id=me and created_at>now()-interval '1 hour')>=12
   or (select count(*) from private.ride_companions where owner_id=me and status='active')>=5 then raise exception 'rate_limited'; end if;
 insert into private.ride_companion_invites(id,environment,owner_id,notices,pays,token_hash,recipient_hash,request_hash,expires_at)
  values(p_key,env,me,wanted,p_pays,sha256(convert_to(token,'UTF8')),sha256(convert_to(token||lower(trim(p_email)),'UTF8')),h,
   now()+make_interval(mins=>p_minutes)) returning * into i;
 return jsonb_build_object('id',i.id,'token',token,'expires_at',i.expires_at);
end $$;
create or replace function public.ride_invite_guest(p_account uuid,p_program uuid,p_cost_center uuid,p_email text,p_legs jsonb,p_scheduled_at timestamptz,p_minutes int,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('quote'); a private.ride_accounts; p private.ride_voucher_programs; i private.ride_guest_invites;
 token text:=encode(extensions.gen_random_bytes(32),'hex'); h bytea; e jsonb; legs jsonb; depart timestamptz:=coalesce(p_scheduled_at,now()); ends timestamptz;
begin
 a:=private.ride_organization(p_account,array['admin','operator']);
 if p_key is null or p_program is null or p_cost_center is null or p_minutes is null or p_minutes not in (5,15,30,60) or p_email is null or length(p_email)>254
   or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(p_legs) is distinct from 'array'
   or jsonb_array_length(p_legs) not between 1 and 4 or pg_column_size(p_legs)>4096
   or (p_scheduled_at is not null and (p_scheduled_at<=now() or p_scheduled_at>now()+interval '30 days')) then raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(a.id::text,p_program::text,p_cost_center::text,p_legs::text,coalesce(extract(epoch from p_scheduled_at)::text,''),p_minutes::text);
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into i from private.ride_guest_invites where id=p_key;
 if found then
   if i.issued_by<>me or i.request_hash<>h then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('id',i.id,'token',null,'expires_at',i.expires_at);
 end if;
 if exists(select from private.ride_trip_grants where id=p_key) or exists(select from auth.users u where u.id=me and lower(u.email)=lower(trim(p_email))) then
   raise exception 'invalid_input'; end if;
 if (select count(*) from private.ride_guest_invites x where x.issued_by=me and x.created_at>now()-interval '1 hour')>=12 then raise exception 'rate_limited'; end if;
 select * into p from private.ride_voucher_programs where id=p_program and account_id=a.id and environment=a.environment and enabled;
 if not found or not exists(select from private.ride_cost_centers c where c.id=p_cost_center and c.account_id=a.id and c.active) then raise exception 'invalid_input'; end if;
 for e in select value from jsonb_array_elements(p_legs) loop
   if jsonb_typeof(e)<>'object' or (e-array['origin','destination','payer','pickup_at','extras'])<>'{}'::jsonb or e->>'payer' is distinct from 'passenger'
     or e->>'origin' is null or e->>'destination' is null then raise exception 'invalid_input'; end if;
   if not private.ride_party_allowed(a.environment,'voucher',e->>'origin',e->>'destination',depart) then raise exception 'ride_feature_disabled'; end if;
   if cardinality(p.areas)>0 and not ((e->>'origin')=any(p.areas) and (e->>'destination')=any(p.areas)) then raise exception 'ride_voucher_unavailable'; end if;
 end loop;
 if p.group_tag is not null or not p.validity @> depart then raise exception 'ride_voucher_unavailable'; end if;
 legs:=jsonb_set(p_legs,'{0}',(p_legs->0)-'pickup_at');
 ends:=least(now()+make_interval(mins=>p_minutes),coalesce(p_scheduled_at,'infinity'::timestamptz));
 insert into private.ride_trip_grants(id,account_id,program_id,cost_center_id,issued_by,approved_by,decided_by,purpose,ceiling_cents,validity,status,guest,request_hash,decided_at)
  values(p_key,a.id,p.id,p_cost_center,me,me,me,'Viagem de convidado',p.ride_value_cents,tstzrange(now(),greatest(ends,depart)+interval '1 day','[)'),'approved',true,h,now());
 insert into private.ride_guest_invites(id,account_id,grant_id,request_legs,scheduled_at,token_hash,recipient_hash,request_hash,issued_by,expires_at)
  values(p_key,a.id,p_key,legs,p_scheduled_at,sha256(convert_to(token,'UTF8')),sha256(convert_to(token||lower(trim(p_email)),'UTF8')),h,me,ends)
  returning * into i;
 return jsonb_build_object('id',i.id,'token',token,'expires_at',i.expires_at);
end $$;
-- Hashes written before this file carried the e-mail: replace them. A replay of such an
-- invite then answers idempotency_conflict, and nothing derived from an address remains.
update private.ride_account_invites set request_hash=extensions.gen_random_bytes(32);
update private.ride_rider_invites set request_hash=extensions.gen_random_bytes(32);
update private.ride_companion_invites set request_hash=extensions.gen_random_bytes(32);
update private.ride_guest_invites set request_hash=extensions.gen_random_bytes(32);
update private.ride_trip_grants set request_hash=extensions.gen_random_bytes(32) where guest;

-- ─── 10. Erasure, retention, withdrawal and export ────────────────────────────────────────
create or replace function private.erase_ride_parties() returns trigger language plpgsql security definer set search_path='' as $$
declare acct private.ride_accounts; link record;
begin
 update private.ride_payer_mandates set status='revoked',revoked_at=now() where status='active' and new.id in (rider_id,payer_id);
 for link in delete from private.ride_companions where new.id in (owner_id,companion_id) returning owner_id,companion_id,status loop
   if link.status='active' then
     delete from private.ride_passenger_notices n using public.ride_legs l,public.rides r
      where n.owner_id=link.companion_id and l.id=n.leg_id and r.id=l.ride_id and r.passenger_id=link.owner_id and l.payer_id<>link.companion_id;
   end if;
 end loop;
 delete from private.ride_companion_invites where new.id in (owner_id,companion_id);
 delete from private.ride_rider_invites where new.id in (sponsor_id,rider_id);
 with gone as (delete from private.ride_guest_invites where new.id in (issued_by,guest_id) returning grant_id,status)
  update private.ride_trip_grants g set status='rejected',decided_at=now() from gone where g.id=gone.grant_id and gone.status='pending' and g.status='approved';
 delete from private.ride_account_invites where new.id in (issued_by,member_id);
 delete from private.ride_consents c using private.ride_quote_funding f,private.ride_quotes q
  where f.quote_id=c.quote_id and q.id=f.quote_id and q.status not in ('requested','awaiting_consent') and f.kind='payer' and f.payer_id=new.id and c.actor_id=new.id;
 delete from private.ride_quote_funding f using private.ride_quotes q
  where q.id=f.quote_id and q.status not in ('requested','awaiting_consent') and new.id in (f.member_id,f.payer_id);
 delete from private.ride_trip_grants g where g.beneficiary_id=new.id and g.status<>'used'
   and not exists(select from private.ride_quote_funding f where f.grant_id=g.id) and not exists(select from private.ride_leg_funding f where f.grant_id=g.id)
   and not exists(select from private.ride_guest_invites i where i.grant_id=g.id);
 -- What stays for the financial record keeps no text the person wrote.
 update private.ride_trip_grants set purpose='Viagem registrada' where (beneficiary_id=new.id or issued_by=new.id) and not guest and purpose<>'Viagem registrada';
 update private.ride_invoice_disputes set reason='Contestação registrada' where raised_by=new.id and reason<>'Contestação registrada';
 for acct in select * from private.ride_accounts where owner_id=new.id order by id for update loop
   update private.ride_accounts set status='closed' where id=acct.id and status<>'closed';
   update private.ride_payer_mandates set status='revoked',revoked_at=now() where account_id=acct.id and status='active';
   update private.ride_account_invites set status='revoked',answered_at=now() where account_id=acct.id and status='pending';
   update private.ride_quotes q set status='superseded' from private.ride_quote_funding f where f.quote_id=q.id and f.account_id=acct.id and q.status='awaiting_consent';
   if not exists(select from private.ride_leg_funding where account_id=acct.id) and not exists(select from private.ride_voucher_grants where account_id=acct.id)
     and not exists(select from private.ride_invoices where account_id=acct.id) and not exists(select from private.ride_leg_vehicles where account_id=acct.id) then
     begin
       delete from private.ride_quote_funding where account_id=acct.id;
       delete from private.ride_guest_invites where account_id=acct.id;
       delete from private.ride_trip_grants where account_id=acct.id;
       delete from private.ride_voucher_programs where account_id=acct.id;
       delete from private.ride_cost_centers where account_id=acct.id;
       delete from private.ride_fleet_assignments where account_id=acct.id;
       delete from private.ride_fleet_vehicles where account_id=acct.id;
       delete from private.ride_payer_mandates where account_id=acct.id;
       delete from private.ride_account_invites where account_id=acct.id;
       delete from private.ride_account_members where account_id=acct.id;
       delete from private.ride_accounts where id=acct.id;
     exception when foreign_key_violation then
       null;
     end;
   end if;
   -- An account kept for history: the name a person gave a family or a fleet goes, and nobody
   -- stays a member of it. A company keeps the name its invoices were issued to.
   update private.ride_accounts set name='Conta encerrada',verification_ref=case when kind='family' then null else verification_ref end
    where id=acct.id and kind in ('family','fleet');
   update private.ride_account_members set status='removed',removed_at=now(),removed_by=new.id where account_id=acct.id and status='active';
 end loop;
 update private.ride_account_members set status='removed',removed_at=now(),removed_by=new.id where member_id=new.id and status='active';
 return null;
end $$;
-- Retention. Besides the rules of 20261127110507: an authorization that was refused, lapsed or
-- never used leaves 30 days after it ended, and a membership that ended leaves 30 days after
-- its removal when nothing of the account still points to the person.
create or replace function private.purge_ride_parties() returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.purge_ride_delegation_invites();
 update private.ride_account_invites set status='expired',answered_at=expires_at where status='pending' and expires_at<=now();
 with gone as (update private.ride_guest_invites set status='expired',answered_at=expires_at where status='pending' and expires_at<=now() returning grant_id)
  update private.ride_trip_grants g set status='expired' from gone where g.id=gone.grant_id and g.status='approved';
 delete from private.ride_account_invites where status<>'pending' and coalesce(answered_at,expires_at)<=now()-interval '24 hours';
 delete from private.ride_rider_invites where status<>'pending' and coalesce(answered_at,expires_at)<=now()-interval '24 hours';
 delete from private.ride_companion_invites where status<>'pending' and coalesce(answered_at,expires_at)<=now()-interval '24 hours';
 delete from private.ride_guest_invites where status<>'pending' and coalesce(answered_at,expires_at)<=now()-interval '24 hours';
 delete from private.ride_companions where status='revoked' and coalesce(revoked_at,created_at)<=now()-interval '24 hours';
 delete from private.ride_payer_mandates m where (m.status<>'active' or m.valid_until<=now())
   and coalesce(m.revoked_at,m.valid_until,m.created_at)<=now()-interval '24 hours'
   and not exists(select from private.ride_quote_funding f where f.mandate_id=m.id) and not exists(select from private.ride_leg_funding f where f.mandate_id=m.id);
 delete from private.ride_trip_grants g where g.status<>'used'
   and (g.status in ('rejected','expired') or upper(g.validity)<=now())
   and case when g.status='rejected' then coalesce(g.decided_at,g.created_at) else upper(g.validity) end<=now()-interval '30 days'
   and not exists(select from private.ride_quote_funding f where f.grant_id=g.id) and not exists(select from private.ride_leg_funding f where f.grant_id=g.id)
   and not exists(select from private.ride_guest_invites i where i.grant_id=g.id);
 delete from private.ride_account_members m where m.status='removed' and m.removed_at<=now()-interval '30 days'
   and not exists(select from private.ride_accounts a where a.id=m.account_id and a.owner_id=m.member_id)
   and not exists(select from private.ride_leg_funding f where f.account_id=m.account_id and m.member_id in (f.member_id,f.payer_id))
   and not exists(select from private.ride_voucher_grants g where g.account_id=m.account_id and g.member_id=m.member_id)
   and not exists(select from private.ride_trip_grants g where g.account_id=m.account_id and m.member_id in (g.beneficiary_id,g.issued_by))
   and not exists(select from private.ride_fleet_assignments s where s.account_id=m.account_id and s.driver_id=m.member_id)
   and not exists(select from private.ride_leg_vehicles x where x.account_id=m.account_id and x.driver_id=m.member_id)
   and not exists(select from private.ride_dependents d where d.account_id=m.account_id and d.guardian_id=m.member_id)
   and not exists(select from private.ride_account_invites i where i.account_id=m.account_id and i.issued_by=m.member_id)
   and not exists(select from private.ride_guest_invites i where i.account_id=m.account_id and i.issued_by=m.member_id)
   and not exists(select from private.ride_invoice_disputes d where d.account_id=m.account_id and d.raised_by=m.member_id);
end $$;
-- Managers read former members only during the month after they left.
create or replace function private.ride_my_accounts_before_dependents() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); env text:=private.ride_env(); v_month date:=private.ride_month(now());
begin
 return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'name',a.name,'role',m.role,'owner',a.owner_id=me,
   'verified',private.ride_account_verified(a),'verified_until',a.verified_until,'default_method',a.default_method,
   'monthly_limit_cents',case when manage.yes then a.monthly_limit_cents end,
   'committed_cents',case when manage.yes then private.ride_account_commitment(a.id,null,v_month,null) end,
   'member_limit_cents',m.member_limit_cents,'group_tag',m.group_tag,
   'mandate_id',(select d.id from private.ride_payer_mandates d where d.account_id=a.id and d.rider_id=me and d.status='active'),
   'members',case when manage.yes then (select coalesce(jsonb_agg(jsonb_build_object('member_id',o.member_id,'name',p.full_name,'role',o.role,'status',o.status,
       'member_limit_cents',o.member_limit_cents,'group_tag',o.group_tag,'joined_at',o.joined_at,'removed_at',o.removed_at) order by o.joined_at,o.member_id),'[]'::jsonb)
     from private.ride_account_members o left join public.profiles p on p.id=o.member_id and p.deleted_at is null
     where o.account_id=a.id and (o.status='active' or o.removed_at>now()-interval '30 days')) else '[]'::jsonb end,
   'invites',case when manage.yes then (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'role',i.role,'expires_at',i.expires_at,
       'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end) order by i.created_at desc),'[]'::jsonb)
     from (select * from private.ride_account_invites x where x.account_id=a.id order by x.created_at desc limit 20) i) else '[]'::jsonb end)
   order by a.created_at,a.id),'[]'::jsonb)
  from private.ride_accounts a join private.ride_account_members m on m.account_id=a.id and m.member_id=me and m.status='active'
  cross join lateral (select m.role in ('admin','manager') as yes) manage
  where a.environment=env and a.status='active');
end $$;
-- The guardian withdraws a dependent at any time except during a trip. Quote and leg links go
-- with the record; a pending quote that declared the dependent stops being valid.
create function public.ride_withdraw_dependent(p_dependent uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); d private.ride_dependents;
begin
 if not private.ride_active_user(me) or p_dependent is null then raise exception 'not_allowed'; end if;
 select * into d from private.ride_dependents where id=p_dependent and guardian_id=me and environment=private.ride_env() for update;
 if not found then return false; end if;
 if exists(select from private.ride_leg_dependents x join public.ride_legs l on l.id=x.leg_id
     where x.dependent_id=d.id and l.status in ('requested','accepted','arriving','boarded')) then raise exception 'ride_dependent_in_trip'; end if;
 update private.ride_quotes q set status='superseded' from private.ride_quote_dependents x
  where x.dependent_id=d.id and q.id=x.quote_id and q.status='awaiting_consent';
 delete from private.ride_dependents where id=d.id;
 return true;
end $$;
-- Export: the person's own records of this stage that the wrap of 20261127110507 left out.
alter function public.ride_export_my_data() rename to ride_export_before_party_review;
alter function public.ride_export_before_party_review() set schema private;
create function public.ride_export_my_data() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare data jsonb:=private.ride_export_before_party_review(); me uuid:=auth.uid();
begin
 return data||jsonb_build_object(
  'invoice_disputes',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'account_id',d.account_id,'reason',d.reason,'status',d.status,
      'decision',d.decision,'credit_cents',d.credit_cents,'created_at',d.created_at,'decided_at',d.decided_at) order by d.created_at,d.id)
    from private.ride_invoice_disputes d where d.raised_by=me),'[]'::jsonb),
  'invites_issued',coalesce((select jsonb_agg(x.item order by x.at,x.id) from (
      select i.created_at as at,i.id,jsonb_build_object('id',i.id,'kind','account','account_id',i.account_id,'role',i.role,
        'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,'expires_at',i.expires_at,'created_at',i.created_at) as item
      from private.ride_account_invites i where i.issued_by=me
      union all
      select i.created_at,i.id,jsonb_build_object('id',i.id,'kind','companion','environment',i.environment,'notices',to_jsonb(i.notices),'pays',i.pays,
        'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,'expires_at',i.expires_at,'created_at',i.created_at)
      from private.ride_companion_invites i where i.owner_id=me
      union all
      select i.created_at,i.id,jsonb_build_object('id',i.id,'kind','guest','account_id',i.account_id,
        'legs',(select jsonb_agg(jsonb_build_object('seq',y.n,'origin',y.leg->>'origin','destination',y.leg->>'destination') order by y.n)
          from jsonb_array_elements(i.request_legs) with ordinality y(leg,n)),'scheduled_at',i.scheduled_at,
        'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,'expires_at',i.expires_at,'created_at',i.created_at)
      from private.ride_guest_invites i where i.issued_by=me) x),'[]'::jsonb),
  'guest_invites',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'account_id',i.account_id,'status',i.status,'scheduled_at',i.scheduled_at,
      'answered_at',i.answered_at) order by i.created_at,i.id) from private.ride_guest_invites i where i.guest_id=me),'[]'::jsonb),
  'minor_clearance',(select jsonb_build_object('evidence_ref',c.evidence_ref,'valid_until',c.valid_until,'granted_at',c.granted_at)
    from private.ride_minor_driver_clearances c where c.driver_id=me),
  'leg_vehicles',coalesce((select jsonb_agg(jsonb_build_object('leg_id',x.leg_id,'account_id',x.account_id,'vehicle_identifier',v.vehicle_identifier,
      'frozen_at',x.frozen_at) order by x.frozen_at,x.leg_id)
    from private.ride_leg_vehicles x join private.ride_fleet_vehicles v on v.id=x.vehicle_id where x.driver_id=me),'[]'::jsonb),
  'minor_alerts',coalesce((select jsonb_agg(jsonb_build_object('leg_id',a.leg_id,'dependent_id',x.dependent_id,'kind',a.kind,'at',a.at,'seen_at',a.seen_at)
      order by a.at,a.leg_id,a.kind)
    from private.ride_minor_alerts a join private.ride_leg_dependents x on x.leg_id=a.leg_id where x.guardian_id=me),'[]'::jsonb));
end $$;
create or replace view public.my_ride_data_export with(security_invoker=true) as
 select auth.uid() as id,public.ride_export_my_data() as mobility where auth.uid() is not null;

-- ─── 11. Family limit, mandate gate and invite reprice ────────────────────────────────────
alter table private.ride_accounts add constraint ride_accounts_family_limit check(kind<>'family' or (monthly_limit_cents is not null and default_method is not null));
create or replace function private.ride_open_account(p_kind text,p_name text,p_limit int,p_method text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); env text:=private.ride_env(); a private.ride_accounts; h bytea;
begin
 if p_kind is null or p_kind not in ('family','organization','fleet') or p_key is null or p_name is null or length(trim(p_name)) not between 1 and 80
   or p_limit not between 0 and 100000000 or p_method not in ('pix','card') or (p_kind='family' and (p_limit is null or p_method is null)) then
   raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(p_kind,trim(p_name),p_limit::text,p_method);
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into a from private.ride_accounts where owner_id=me and request_key=p_key;
 if found then
   if a.request_hash<>h then raise exception 'idempotency_conflict'; end if;
   return a.id;
 end if;
 if not private.ride_party_allowed(env,p_kind,null,null,now()) then raise exception 'ride_feature_disabled'; end if;
 if (select count(*) from private.ride_accounts where owner_id=me and kind=p_kind and environment=env and status='active')>=5 then raise exception 'rate_limited'; end if;
 insert into private.ride_accounts(environment,kind,owner_id,name,monthly_limit_cents,default_method,request_key,request_hash)
  values(env,p_kind,me,trim(p_name),p_limit,p_method,p_key,h) returning * into a;
 insert into private.ride_account_members(account_id,member_id,role) values(a.id,me,'admin');
 return a.id;
end $$;
create or replace function public.ride_set_account_limit(p_account uuid,p_cents int,p_method text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_ride_feature('module');
 perform private.ride_require_account_role(p_account,array['admin']);
 if p_cents is null or p_method is null or p_cents not between 0 and 100000000 or p_method not in ('pix','card') then raise exception 'invalid_input'; end if;
 perform 1 from private.ride_accounts where id=p_account for update;
 update private.ride_accounts set monthly_limit_cents=p_cents,default_method=p_method where id=p_account;
 return true;
end $$;
create or replace function private.ride_funding_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare f private.ride_quote_funding; m private.ride_payer_mandates; a private.ride_accounts; mem private.ride_account_members; v_month date;
begin
 select * into f from private.ride_quote_funding where quote_id=new.source_quote_id;
 if not found then return new; end if;
 if f.account_id is not null then
   select * into strict a from private.ride_accounts where id=f.account_id for update;
   select * into mem from private.ride_account_members where account_id=a.id and member_id=f.member_id;
   if a.status<>'active' or mem.status='removed' or (f.kind='payer' and mem.status is distinct from 'active') then raise exception 'ride_mandate_revoked'; end if;
 end if;
 if f.mandate_id is not null then
   select * into strict m from private.ride_payer_mandates where id=f.mandate_id for update;
   if m.status<>'active' or m.valid_until<=now() or new.payer_id<>m.payer_id or not private.ride_active_user(m.payer_id) then
     raise exception 'ride_mandate_revoked'; end if;
   -- The gate that allowed the quote must still be open where the obligation is born.
   if not private.ride_party_allowed(new.environment,case m.kind when 'sponsor' then 'delegated_ride' else m.kind end,new.origin,new.destination,upper(new.slot)) then
     raise exception 'ride_feature_disabled'; end if;
 end if;
 if f.kind='payer' and f.account_id is not null then
   v_month:=private.ride_month(new.pickup_at);
   if private.ride_account_commitment(a.id,null,v_month,f.member_id)+new.fare_cents>a.monthly_limit_cents
     or private.ride_account_commitment(a.id,f.member_id,v_month,f.member_id)+new.fare_cents>mem.member_limit_cents then raise exception 'ride_limit_exceeded'; end if;
 end if;
 return new;
end $$;
-- A price above the ceiling closes the invite as 'reprice': the quote and the single-use mandate
-- of the attempt are undone, the answer says so, and the sponsor reads it in the list.
create or replace function public.ride_answer_rider_invite(p_token text,p_accept boolean,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); i private.ride_rider_invites; q private.ride_quotes; v jsonb; c jsonb; mandate uuid; desired text;
begin
 if p_accept is null or p_key is null then raise exception 'invalid_input'; end if;
 i:=private.ride_find_rider_invite(p_token);
 if i.id is null then raise exception 'ride_invite_unavailable'; end if;
 select * into strict i from private.ride_rider_invites where id=i.id for update;
 desired:=case when p_accept then 'accepted' else 'declined' end;
 if i.rider_id=me and (i.status=desired or (p_accept and i.status='reprice')) then
   return jsonb_build_object('status',i.status,'quote_id',i.quote_id,'ride_id',(select r.id from public.rides r where r.quote_id=i.quote_id));
 end if;
 if i.status<>'pending' or i.expires_at<=now() or i.sponsor_id=me or not private.ride_active_user(i.sponsor_id) then
   raise exception 'ride_invite_unavailable'; end if;
 if not p_accept then
   update private.ride_rider_invites set status='declined',rider_id=me,answered_at=now(),instructions=null where id=i.id;
   return jsonb_build_object('status','declined','quote_id',null,'ride_id',null);
 end if;
 begin
   mandate:=private.ride_grant_mandate('sponsor',me,i.sponsor_id,i.ceiling_cents,1,i.expires_at);
   begin
     v:=public.ride_quote(p_key,null,i.scheduled_at,i.request_legs);
   exception when raise_exception then
     if sqlerrm='invalid_schedule' then raise exception 'ride_invite_unavailable'; end if;
     raise;
   end;
   select * into strict q from private.ride_quotes where id=(v->>'id')::uuid;
   if q.total_cents>i.ceiling_cents then raise exception 'ride_invite_reprice'; end if;
   q:=private.ride_apply_mandate(q.id,mandate);
   c:=public.ride_consent(q.id,true);
   if c->>'status' is distinct from 'requested' then raise exception 'ride_invite_unavailable'; end if;
 exception when raise_exception then
   if sqlerrm<>'ride_invite_reprice' then raise; end if;
   update private.ride_rider_invites set status='reprice',rider_id=me,answered_at=now() where id=i.id;
   return jsonb_build_object('status','reprice','quote_id',null,'ride_id',null);
 end;
 update private.ride_rider_invites set status='accepted',rider_id=me,quote_id=q.id,answered_at=now() where id=i.id;
 return jsonb_build_object('status','accepted','quote_id',q.id,'ride_id',(c->>'ride_id')::uuid);
end $$;

-- ─── Grants ───────────────────────────────────────────────────────────────────────────────
revoke all on function private.ride_voucher_apply(uuid),private.ride_voucher_waiting(uuid,uuid),private.ride_open_payment_order_before_vouchers(uuid,text),
 private.ride_prepare_order_payment_before_vouchers(uuid,uuid,text),private.ride_voucher_settle(),private.ride_voucher_payable(text,text,text,timestamptz),
 private.ride_quote_funded_before_review(uuid,timestamptz,jsonb,uuid,uuid,uuid),private.ride_voucher_leg_guard(),
 private.ride_order_reverse_before_invoices(uuid,int,int,text,uuid),private.ride_order_reverse(uuid,int,int,text,uuid),
 private.ride_aftercare_before_parties(uuid),private.ride_export_before_party_review() from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.ride_open_payment_order(uuid,text)'::regprocedure,'public.ride_quote_funded(uuid,timestamptz,jsonb,uuid,uuid,uuid)'::regprocedure,
  'public.ride_aftercare(uuid)'::regprocedure,'public.ride_withdraw_dependent(uuid)'::regprocedure,'public.ride_export_my_data()'::regprocedure] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
revoke all on function public.ride_prepare_order_payment(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.ride_prepare_order_payment(uuid,uuid,text) to service_role;
