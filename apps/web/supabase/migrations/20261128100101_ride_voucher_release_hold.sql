-- O17 follow-up, voucher release hold (DD124), on top of 20261127110509 and 110510.
-- Until now a reserved voucher held the fare order only while its 'benefit' release was open:
-- with the release lapsed or the live monetization switch off, the order became payable the
-- ordinary way and the payer could be charged the company's part personally, with no alert.
-- Now a live voucher (reserved, unused, not returned, on a leg that was not cancelled) always
-- holds the personal charge of the fare, also after its redemption window lapses:
--  - cash, the provider charge, a fare share and the legacy O16 checkout are refused while it
--    holds: 'ride_voucher_pending' when the payer can use it now, 'ride_voucher_on_hold' when
--    the benefit cannot be applied (release closed, monetization off or benefit expired);
--  - a completed leg in that state is kept in private.ride_voucher_holds and listed in the
--    'vouchers' section of admin_ride_party_queue until the operation resolves it with
--    admin_resolve_ride_voucher_hold: 'apply' (the release is open again; an expired benefit
--    gets a new 30-day window) or 'return' (the cents go back to the program and the payer then
--    pays the ordinary way), with a reference, idempotent per key and audited. A partial voucher
--    whose fare order was never opened is not applied by the operation: 'apply' lifts the hold and
--    the payer then uses it with the method of their choice for the difference;
--  - a leg may be held again after such an 'apply' (the release closes before the payer acts):
--    each hold is its own row, at most one open per benefit;
--  - the payer reads 'returned' once the operation gave the voucher back, and redeeming it then
--    answers 'ride_voucher_returned';
--  - a held benefit keeps counting in the program's commitment even past its window, so applying
--    it later never spends cents that another trip already took.
-- Nothing is enabled and no row is seeded. New codes: ride_voucher_on_hold, ride_voucher_returned.
--
-- Contracts (jsonb, authenticated):
--  admin_ride_party_queue() -> previous sections + vouchers[{leg_id,account_name,program_label,cents,since,reason,ready,expires_at}]
--    reason: 'release_closed' | 'monetization_off' | 'benefit_expired'; ready: the release is open now ('apply' can run).
--  admin_resolve_ride_voucher_hold(leg,action 'apply'|'return',reference,key) -> {leg_id,action,reason,cents,applied_cents,order_id,payer_choice,reference}
--    payer_choice: 'apply' lifted the hold without an order; the payer picks the method of the difference.
--  ride_voucher_hold(leg) -> {state:'ready'|'on_hold'|'returned',reason,cents} | null   the payer's own leg only

create table private.ride_voucher_holds (
 id uuid primary key default gen_random_uuid(),
 benefit_id uuid not null references private.ride_voucher_grants(benefit_id), leg_id uuid not null references public.ride_legs(id),
 environment text not null, reason text not null check(reason in ('release_closed','monetization_off','benefit_expired')),
 since timestamptz not null, noticed_at timestamptz not null default now(),
 resolution text check(resolution in ('applied','returned')), resolution_key uuid unique,
 reference text check(reference is null or length(trim(reference)) between 1 and 160), resolved_by uuid, resolved_at timestamptz, result jsonb,
 check((resolution is null)=(resolution_key is null) and (resolution is null)=(resolved_at is null) and (resolution is null)=(reference is null))
);
create unique index ride_voucher_holds_one_open on private.ride_voucher_holds(benefit_id) where resolution is null;
create index ride_voucher_holds_open on private.ride_voucher_holds(environment,since) where resolution is null;
create index ride_voucher_holds_leg on private.ride_voucher_holds(leg_id);
alter table private.ride_voucher_holds enable row level security;
revoke all on private.ride_voucher_holds from public,anon,authenticated,service_role;

-- ─── What holds and why ───────────────────────────────────────────────────────────────────
-- A live voucher of the leg: reserved, unused, not returned, the leg not cancelled. Its
-- redemption window no longer matters: a lapsed voucher keeps holding until the operation acts.
create or replace function private.ride_voucher_waiting(p_leg uuid,p_payer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_voucher_grants g join private.ride_benefits b on b.id=g.benefit_id join public.ride_legs l on l.id=g.leg_id
   where g.leg_id=p_leg and g.member_id=p_payer and l.status<>'cancelled' and b.available_cents>0
     and not exists(select from private.ride_benefit_uses u where u.benefit_id=b.id)
     and not exists(select from private.ride_voucher_holds h where h.benefit_id=b.id and h.resolution='returned'))
$$;
-- Why the benefit of the leg cannot be applied now, or null when it can.
create function private.ride_voucher_hold_reason(l public.ride_legs,p_valid_until timestamptz) returns text language sql stable security definer set search_path='' as $$
 select case
   when private.ride_method(l,'benefit') is not null then case when p_valid_until<=now() then 'benefit_expired' end
   when not exists(select from private.ride_network n where n.environment=l.environment and n.module_enabled
       and (l.environment='simulation' or (n.monetization_enabled and private.ride_area_allowed('live',l.origin,'monetize')
         and private.ride_area_allowed('live',l.destination,'monetize') and exists(select from private.ride_live_finance_release where enabled and until_at>now()))))
     then 'monetization_off'
   else 'release_closed' end
$$;
-- The refusal a personal charge of the fare gets while the voucher holds, or null.
create function private.ride_voucher_refusal(p_leg uuid,p_payer uuid) returns text language sql stable security definer set search_path='' as $$
 select case when not private.ride_voucher_waiting(p_leg,p_payer) then null
   when exists(select from private.ride_voucher_grants g join private.ride_benefits b on b.id=g.benefit_id join public.ride_legs l on l.id=g.leg_id
       where g.leg_id=p_leg and g.member_id=p_payer and private.ride_voucher_hold_reason(l,b.valid_until) is not null) then 'ride_voucher_on_hold'
   else 'ride_voucher_pending' end
$$;
-- Completed legs of the environment whose live voucher cannot be applied now, with the moment
-- the block started: the end of the trip, or later the end of the release or of the window.
create function private.ride_voucher_blocked(p_env text,p_leg uuid) returns table(benefit_id uuid,leg_id uuid,reason text,since timestamptz)
language sql stable security definer set search_path='' as $$
 select g.benefit_id,l.id,x.reason,greatest(
     coalesce((select min(e.at) from private.ride_events e where e.leg_id=l.id and e.to_status='completed'),l.updated_at),
     case x.reason when 'benefit_expired' then b.valid_until
       when 'release_closed' then (select max(upper(r.validity)) from private.ride_method_releases r where r.environment=l.environment
         and r.origin=l.origin and r.destination=l.destination and r.method='benefit' and upper(r.validity)<=now()) end)
 from private.ride_voucher_grants g join public.ride_legs l on l.id=g.leg_id and l.payer_id=g.member_id
 join private.ride_benefits b on b.id=g.benefit_id
 cross join lateral (select private.ride_voucher_hold_reason(l,b.valid_until) as reason) x
 where l.environment=p_env and (p_leg is null or l.id=p_leg) and l.status='completed' and b.available_cents>0
   and not exists(select from private.ride_benefit_uses u where u.benefit_id=b.id) and x.reason is not null
   and private.ride_voucher_waiting(l.id,l.payer_id)
$$;
-- Records the blocked legs for the operation; the first moment stays, the reason follows the state.
create function private.ride_voucher_note_holds(p_env text,p_leg uuid) returns void language sql security definer set search_path='' as $$
 insert into private.ride_voucher_holds(benefit_id,leg_id,environment,reason,since)
 select x.benefit_id,x.leg_id,p_env,x.reason,x.since from private.ride_voucher_blocked(p_env,p_leg) x
 on conflict (benefit_id) where resolution is null do update set reason=excluded.reason
  where private.ride_voucher_holds.resolution is null and private.ride_voucher_holds.reason<>excluded.reason
$$;
-- Recorded as the leg ends, right after ride_voucher_settle had its chance to apply the voucher.
create function private.ride_voucher_settle_hold() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform private.ride_voucher_note_holds(new.environment,new.id);
 return null;
end $$;
create trigger ride_voucher_settle_hold after update of status on public.ride_legs for each row
 when(new.status='completed' and old.status is distinct from new.status) execute function private.ride_voucher_settle_hold();

-- A held benefit keeps its cents committed past its window; a returned one frees them.
create or replace function private.ride_voucher_commitment(p_program uuid,p_member uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce(sum(case when u.order_id is not null then u.applied_cents-u.restored_cents
     when l.status='cancelled' or b.available_cents=0 or exists(select from private.ride_voucher_holds h where h.benefit_id=b.id and h.resolution='returned') then 0
     when b.valid_until<=now() and l.status<>'completed' then 0 else b.awarded_cents end),0)::bigint
 from private.ride_voucher_grants g join private.ride_benefits b on b.id=g.benefit_id join public.ride_legs l on l.id=g.leg_id
 left join private.ride_benefit_uses u on u.benefit_id=b.id
 where g.program_id=p_program and (p_member is null or g.member_id=p_member)
$$;

-- ─── Personal charges refused while the voucher holds ─────────────────────────────────────
create or replace function public.ride_open_payment_order(p_leg uuid,p_method text) returns uuid language plpgsql security definer set search_path='' as $$
declare opened uuid; refusal text;
begin
 -- Cash never carries a benefit: the voucher would be lost to a personal payment.
 if p_method='cash' and exists(select from public.ride_legs l where l.id=p_leg and l.payer_id=auth.uid()) then
   refusal:=private.ride_voucher_refusal(p_leg,auth.uid());
   if refusal is not null then raise exception '%',refusal; end if;
 end if;
 opened:=private.ride_open_payment_order_before_vouchers(p_leg,p_method);
 perform private.ride_voucher_apply(opened);
 return opened;
end $$;
create or replace function public.ride_prepare_order_payment(p_order uuid,p_payer uuid,p_environment text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare refusal text;
begin
 select private.ride_voucher_refusal(o.leg_id,o.payer) into refusal from private.ride_payment_orders o
  where o.id=p_order and o.payer=p_payer and o.component='fare' and not exists(select from private.ride_order_psp s where s.order_id=o.id);
 if refusal is not null then raise exception '%',refusal; end if;
 return private.ride_prepare_order_payment_before_vouchers(p_order,p_payer,p_environment);
end $$;
-- Sharing the fare would move the company's part onto somebody else's personal charge.
alter function public.ride_invite_fare_share(uuid,uuid,int,uuid) rename to ride_invite_fare_share_before_voucher_hold;
alter function public.ride_invite_fare_share_before_voucher_hold(uuid,uuid,int,uuid) set schema private;
create function public.ride_invite_fare_share(p_order uuid,p_recipient uuid,p_cents int,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare refusal text;
begin
 select private.ride_voucher_refusal(o.leg_id,o.payer) into refusal from private.ride_payment_orders o
  where o.id=p_order and o.payer=auth.uid() and o.component='fare';
 if refusal is not null then raise exception '%',refusal; end if;
 return private.ride_invite_fare_share_before_voucher_hold(p_order,p_recipient,p_cents,p_key);
end $$;
-- The cents of the payer's voucher on the leg that the operation gave back to the program, or null.
create function private.ride_voucher_returned_cents(p_leg uuid,p_payer uuid) returns int language sql stable security definer set search_path='' as $$
 select (h.result->>'cents')::int from private.ride_voucher_holds h join private.ride_voucher_grants g on g.benefit_id=h.benefit_id
  join public.ride_legs l on l.id=h.leg_id
  where h.leg_id=p_leg and g.member_id=p_payer and l.payer_id=p_payer and h.resolution='returned' order by h.resolved_at desc limit 1
$$;
-- The payer who asks to use a voucher the operation still has to release, or already gave back, reads why.
alter function public.ride_redeem_voucher(uuid,text) rename to ride_redeem_voucher_before_hold;
alter function public.ride_redeem_voucher_before_hold(uuid,text) set schema private;
create function public.ride_redeem_voucher(p_leg uuid,p_method text) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module');
begin
 if private.ride_voucher_refusal(p_leg,me)='ride_voucher_on_hold' then raise exception 'ride_voucher_on_hold'; end if;
 if private.ride_voucher_returned_cents(p_leg,me) is not null then raise exception 'ride_voucher_returned'; end if;
 return private.ride_redeem_voucher_before_hold(p_leg,p_method);
end $$;
-- The legacy O16 full-fare checkout of a leg without an order plan.
create function private.ride_voucher_legacy_charge_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare refusal text:=private.ride_voucher_refusal(new.leg_id,new.payer_id);
begin
 if refusal is not null then raise exception '%',refusal; end if;
 return new;
end $$;
create trigger ride_voucher_legacy_charge before insert on private.ride_sandbox_charges for each row execute function private.ride_voucher_legacy_charge_guard();
create trigger ride_voucher_legacy_charge before insert on private.ride_live_charges for each row execute function private.ride_voucher_legacy_charge_guard();

-- ─── Operations ───────────────────────────────────────────────────────────────────────────
alter function public.admin_ride_party_queue() rename to admin_ride_party_queue_before_vouchers;
alter function public.admin_ride_party_queue_before_vouchers() set schema private;
create function public.admin_ride_party_queue() returns jsonb language plpgsql security definer set search_path='' as $$
declare env text:=private.ride_env(); v jsonb:=private.admin_ride_party_queue_before_vouchers();
begin
 perform private.ride_voucher_note_holds(env,null);
 return v||jsonb_build_object('vouchers',(select coalesce(jsonb_agg(jsonb_build_object('leg_id',x.leg_id,'account_name',a.name,'program_label',p.label,
     'cents',b.available_cents,'since',x.since,'reason',coalesce(private.ride_voucher_hold_reason(l,b.valid_until),x.reason),
     'ready',private.ride_method(l,'benefit') is not null,'expires_at',b.valid_until) order by x.since,x.leg_id),'[]'::jsonb)
   from (select h.* from private.ride_voucher_holds h join public.ride_legs hl on hl.id=h.leg_id
       where h.environment=env and h.resolution is null and private.ride_voucher_waiting(hl.id,hl.payer_id) order by h.since,h.leg_id limit 100) x
   join public.ride_legs l on l.id=x.leg_id join private.ride_voucher_grants g on g.benefit_id=x.benefit_id
   join private.ride_benefits b on b.id=g.benefit_id join private.ride_accounts a on a.id=g.account_id join private.ride_voucher_programs p on p.id=g.program_id));
end $$;

-- One decision per held voucher. 'apply' runs the stage-4 order calls in the payer's name, as
-- ride_voucher_settle does; 'return' gives the cents back to the program. Nobody of the
-- company and not the payer decides; a replay of the same key answers the first result.
create function public.admin_resolve_ride_voucher_hold(p_leg uuid,p_action text,p_reference text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); env text:=private.ride_env(); ref text:=trim(p_reference); h private.ride_voucher_holds; l public.ride_legs;
 g private.ride_voucher_grants; b private.ride_benefits; o private.ride_payment_orders; m text; was text; opened uuid; applied int; outcome jsonb;
 choice boolean:=false;
begin
 perform private.require_ride_finance_admin();
 if p_leg is null or p_key is null or p_action is null or p_action not in ('apply','return') or ref is null or length(ref) not between 1 and 160 then
   raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into h from private.ride_voucher_holds where resolution_key=p_key;
 if found then
   if (h.leg_id,h.resolution,h.reference,h.resolved_by) is distinct from (p_leg,case p_action when 'apply' then 'applied' else 'returned' end,ref,me) then
     raise exception 'idempotency_conflict'; end if;
   return h.result;
 end if;
 select * into l from public.ride_legs where id=p_leg and environment=env for update;
 if not found then raise exception 'ride_voucher_unavailable'; end if;
 select * into g from private.ride_voucher_grants where leg_id=l.id and member_id=l.payer_id;
 if not found then raise exception 'ride_voucher_unavailable'; end if;
 if l.payer_id=me or exists(select from private.ride_account_members where account_id=g.account_id and member_id=me and status='active') then
   raise exception 'not_allowed'; end if;
 perform private.ride_voucher_note_holds(env,l.id);
 select * into h from private.ride_voucher_holds where benefit_id=g.benefit_id and resolution is null for update;
 if not found then
   if exists(select from private.ride_voucher_holds where benefit_id=g.benefit_id) then raise exception 'ride_operation_conflict'; end if;
   raise exception 'ride_voucher_unavailable'; end if;
 if not private.ride_voucher_waiting(l.id,l.payer_id) then raise exception 'ride_voucher_unavailable'; end if;
 select * into strict b from private.ride_benefits where id=g.benefit_id for update;
 if p_action='apply' then
   if private.ride_method(l,'benefit') is null then raise exception 'ride_feature_disabled'; end if;
   -- The commitment kept the cents while the voucher was held: a new window spends nothing new.
   if b.valid_until<=now() then update private.ride_benefits set valid_until=now()+interval '30 days' where id=b.id; end if;
   select * into o from private.ride_payment_orders where leg_id=l.id and payer=l.payer_id and component='fare';
   -- The method of the difference is the payer's: without an order a partial voucher is only
   -- released, and the payer uses it from the leg (ride_redeem_voucher) with the method chosen.
   choice:=o.id is null and b.available_cents<l.fare_cents;
   if not choice then
     m:=coalesce(o.method,case when private.ride_method(l,'pix') is not null then 'pix' when private.ride_method(l,'card') is not null then 'card' end);
     if m is null or m='cash' then raise exception 'ride_feature_disabled'; end if;
     was:=current_setting('request.jwt.claim.sub',true);
     perform set_config('request.jwt.claim.sub',l.payer_id::text,true);
     opened:=public.ride_open_payment_order(l.id,m);
     perform set_config('request.jwt.claim.sub',coalesce(was,''),true);
     select u.applied_cents into applied from private.ride_benefit_uses u where u.benefit_id=b.id;
     if applied is null then raise exception 'ride_financial_state'; end if;
   end if;
 else
   update private.ride_benefits set available_cents=0 where id=b.id;
 end if;
 outcome:=jsonb_build_object('leg_id',l.id,'action',p_action,'reason',coalesce(private.ride_voucher_hold_reason(l,b.valid_until),h.reason),
   'cents',b.available_cents,'applied_cents',applied,'order_id',opened,'payer_choice',choice,'reference',ref);
 update private.ride_voucher_holds set resolution=case p_action when 'apply' then 'applied' else 'returned' end,resolution_key=p_key,reference=ref,
   resolved_by=me,resolved_at=now(),result=outcome where id=h.id;
 perform private.audit('ride.voucher_hold','ride_voucher_grants',b.id::text,outcome||jsonb_build_object('account',g.account_id,'program',g.program_id,'environment',env));
 return outcome;
end $$;

-- The payer reads whether the voucher of the own leg waits for the operation.
create function public.ride_voucher_hold(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); reason text; cents int;
begin
 if p_leg is null then return null; end if;
 if not private.ride_voucher_waiting(p_leg,me) then
   select private.ride_voucher_returned_cents(l.id,me) into cents from public.ride_legs l where l.id=p_leg and l.environment=private.ride_env();
   return case when cents is not null then jsonb_build_object('state','returned','reason',null,'cents',cents) end;
 end if;
 select private.ride_voucher_hold_reason(l,b.valid_until),b.available_cents into reason,cents
  from private.ride_voucher_grants g join public.ride_legs l on l.id=g.leg_id join private.ride_benefits b on b.id=g.benefit_id
  where g.leg_id=p_leg and g.member_id=me and l.payer_id=me and l.environment=private.ride_env();
 if not found then return null; end if;
 return jsonb_build_object('state',case when reason is null then 'ready' else 'on_hold' end,'reason',reason,'cents',cents);
end $$;

-- ─── Grants ───────────────────────────────────────────────────────────────────────────────
revoke all on function private.ride_voucher_waiting(uuid,uuid),private.ride_voucher_hold_reason(public.ride_legs,timestamptz),
 private.ride_voucher_refusal(uuid,uuid),private.ride_voucher_blocked(text,uuid),private.ride_voucher_note_holds(text,uuid),
 private.ride_voucher_settle_hold(),private.ride_voucher_commitment(uuid,uuid),private.ride_voucher_returned_cents(uuid,uuid),private.ride_voucher_legacy_charge_guard(),
 private.ride_invite_fare_share_before_voucher_hold(uuid,uuid,int,uuid),private.ride_redeem_voucher_before_hold(uuid,text),
 private.admin_ride_party_queue_before_vouchers() from public,anon,authenticated,service_role;
-- The fare share stays reachable only through the share code, as in 20261127110401.
revoke all on function public.ride_invite_fare_share(uuid,uuid,int,uuid) from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.admin_ride_party_queue()'::regprocedure,'public.admin_resolve_ride_voucher_hold(uuid,text,text,uuid)'::regprocedure,
  'public.ride_voucher_hold(uuid)'::regprocedure,'public.ride_redeem_voucher(uuid,text)'::regprocedure] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
