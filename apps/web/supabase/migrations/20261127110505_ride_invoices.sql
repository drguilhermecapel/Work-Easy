-- O17 stage 5, PAR-507, on the organizations and vouchers of 20261127110504. A monthly
-- invoice is the frozen composition of what the stage-4 order events already say: one
-- line per event of the company's voucher orders, by the São Paulo month in which the
-- money moved. Nothing is recomputed from fares and no parallel money path exists.
-- Gate: 'invoice' in private.ride_party_rules (simulation rows only), needed to close,
-- dispute and decide; reading a closed invoice needs only the role.
--
-- Contracts:
--  A month is closed only after it ended (São Paulo), once per account, by finance.
--  Lines: 'voucher' (+, order event 'benefit'), 'refund' (-, 'benefit_refund'), 'adjustment' (-, an accepted
--   dispute, in the next closing after the disputed invoice), 'personal_topup' (informational, never billable:
--   'capture' + and 'psp_refund'/'issuer_refund' - of the rider's own payment on the same order).
--  Every order event is invoiced at most once (event_id is unique). A refund settled in a later month is a
--   credit line of that later month; a closed invoice never changes (ride_invoice_closed).
--  An earlier month with billable movement must be closed first (ride_financial_state), so the invoice of a
--   month, the report of that month and the stage-4 ledger show the same cents.
--  ride_invoice_marks(order_id, applied_cents, restored_cents, topup_cents): what was already invoiced per order,
--   never above the stage-4 benefit use (ride_financial_mismatch).
--  Rows keep opaque subject keys and no place, route or e-mail; lines and closed invoices are never updated.
create table private.ride_invoices (
 id uuid primary key, account_id uuid not null references private.ride_accounts(id),
 environment text not null references private.ride_network(environment), month date not null check(extract(day from month)=1),
 status text not null default 'open' check(status in ('open','closed')), closed_at timestamptz, closed_by uuid not null,
 total_cents bigint not null default 0, created_at timestamptz not null default now(),
 unique(account_id,month), check((status='closed')=(closed_at is not null))
);
create table private.ride_invoice_lines (
 id uuid primary key default gen_random_uuid(), invoice_id uuid not null references private.ride_invoices(id),
 kind text not null check(kind in ('voucher','refund','adjustment','personal_topup')), billable boolean not null,
 leg_id uuid not null references public.ride_legs(id), order_id uuid not null references private.ride_payment_orders(id),
 cost_center_id uuid references private.ride_cost_centers(id), member_id uuid not null references private.ride_subjects(id),
 cents int not null, occurred_at timestamptz not null,
 event_id bigint unique references private.ride_order_events(id), dispute_id uuid unique,
 check(billable=(kind<>'personal_topup')),
 check(case kind when 'voucher' then cents>0 when 'personal_topup' then cents<>0 else cents<0 end),
 check((kind='adjustment')=(event_id is null) and (kind='adjustment')=(dispute_id is not null))
);
create index ride_invoice_lines_invoice on private.ride_invoice_lines(invoice_id,occurred_at);
create index ride_invoice_lines_order on private.ride_invoice_lines(order_id);
create table private.ride_invoice_marks (
 order_id uuid primary key references private.ride_payment_orders(id), applied_cents int not null default 0 check(applied_cents>=0),
 restored_cents int not null default 0 check(restored_cents>=0), topup_cents int not null default 0, updated_at timestamptz not null default now()
);
-- One contestation per billed line. An accepted one fixes its credit when it is decided.
create table private.ride_invoice_disputes (
 id uuid primary key, line_id uuid not null unique references private.ride_invoice_lines(id),
 account_id uuid not null references private.ride_accounts(id), raised_by uuid not null references private.ride_subjects(id),
 reason text not null check(length(trim(reason)) between 1 and 280),
 status text not null default 'open' check(status in ('open','accepted','rejected')),
 decision text check(length(trim(decision)) between 1 and 500), decided_by uuid, decided_at timestamptz,
 credit_cents int check(credit_cents>0), created_at timestamptz not null default now(),
 check((status='open')=(decided_at is null) and (status='open')=(decision is null) and (status='accepted')=(credit_cents is not null))
);
create index ride_invoice_disputes_account on private.ride_invoice_disputes(account_id,status);
alter table private.ride_invoice_lines add foreign key(dispute_id) references private.ride_invoice_disputes(id);
do $$ declare t text; begin
 foreach t in array array['ride_invoices','ride_invoice_lines','ride_invoice_marks','ride_invoice_disputes'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

-- A closed invoice and its lines are a record: no update, no delete, no late line.
-- Corrections are new lines of a later invoice.
create function private.ride_invoice_frozen() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status='closed' then raise exception 'ride_invoice_closed'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger ride_invoice_frozen before update or delete on private.ride_invoices for each row execute function private.ride_invoice_frozen();
create function private.ride_invoice_line_frozen() returns trigger language plpgsql set search_path='' as $$
begin
 if exists(select from private.ride_invoices i where i.status='closed'
     and ((tg_op<>'INSERT' and i.id=old.invoice_id) or (tg_op<>'DELETE' and i.id=new.invoice_id))) then
   raise exception 'ride_invoice_closed'; end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger ride_invoice_line_frozen before insert or update or delete on private.ride_invoice_lines
 for each row execute function private.ride_invoice_line_frozen();
create function private.ride_invoice_no_truncate() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'ride_invoice_closed'; end $$;
create trigger ride_invoice_no_truncate before truncate on private.ride_invoices for each statement execute function private.ride_invoice_no_truncate();
create trigger ride_invoice_line_no_truncate before truncate on private.ride_invoice_lines for each statement execute function private.ride_invoice_no_truncate();

-- Money of the company's voucher orders that no invoice carries yet, straight from
-- the stage-4 order events. Amounts and times are the events' own.
create function private.ride_invoice_movements(p_account uuid)
returns table(event_id bigint,kind text,order_id uuid,leg_id uuid,cost_center_id uuid,member_id uuid,cents int,occurred_at timestamptz,month date)
language sql stable security definer set search_path='' as $$
 select ev.id,case ev.action when 'benefit' then 'voucher' when 'benefit_refund' then 'refund' else 'personal_topup' end,
   u.order_id,g.leg_id,g.cost_center_id,g.member_id,
   case when ev.action in ('benefit','capture') then (ev.data->>'cents')::int else -(ev.data->>'cents')::int end,ev.at,private.ride_month(ev.at)
 from private.ride_voucher_grants g join private.ride_benefit_uses u on u.benefit_id=g.benefit_id
 join private.ride_order_events ev on ev.order_id=u.order_id and ev.action in ('benefit','benefit_refund','capture','psp_refund','issuer_refund')
 where g.account_id=p_account and (ev.data->>'cents')::int>0
   and not exists(select from private.ride_invoice_lines x where x.event_id=ev.id)
$$;

-- Finance closes one ended month of one company. The account row serializes closings
-- and dispute decisions; the same account and month always answer the same invoice.
create function public.admin_close_ride_invoice(p_account uuid,p_month date,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare a private.ride_accounts; i private.ride_invoices; env text:=private.ride_env(); v_month date; v_total bigint; v_lines int;
begin
 perform private.require_ride_finance_admin();
 if p_account is null or p_month is null or p_key is null or isfinite(p_month) is not true then raise exception 'invalid_input'; end if;
 v_month:=date_trunc('month',p_month::timestamp)::date;
 select * into a from private.ride_accounts where id=p_account and environment=env for update;
 if not found or a.kind<>'organization' then raise exception 'invalid_input'; end if;
 if exists(select from private.ride_account_members where account_id=a.id and member_id=auth.uid() and status='active') then raise exception 'not_allowed'; end if;
 select * into i from private.ride_invoices where account_id=a.id and month=v_month;
 if found then return i.id; end if;
 if exists(select from private.ride_invoices where id=p_key) then raise exception 'idempotency_conflict'; end if;
 if not private.ride_party_allowed(env,'invoice',null,null,now()) then raise exception 'ride_feature_disabled'; end if;
 -- Only a month that ended: its events are complete and none can still arrive.
 if v_month>=private.ride_month(now()) then raise exception 'invalid_input'; end if;
 if exists(select from private.ride_invoice_movements(a.id) m where m.kind<>'personal_topup' and m.month<v_month
     and not exists(select from private.ride_invoices x where x.account_id=a.id and x.month=m.month)) then raise exception 'ride_financial_state'; end if;
 insert into private.ride_invoices(id,account_id,environment,month,closed_by) values(p_key,a.id,env,v_month,auth.uid());
 insert into private.ride_invoice_lines(invoice_id,kind,billable,leg_id,order_id,cost_center_id,member_id,cents,occurred_at,event_id)
  select p_key,m.kind,m.kind<>'personal_topup',m.leg_id,m.order_id,m.cost_center_id,m.member_id,m.cents,m.occurred_at,m.event_id
  from private.ride_invoice_movements(a.id) m where m.month<=v_month order by m.occurred_at,m.event_id;
 -- A contestation accepted on an earlier invoice becomes a credit here, once.
 insert into private.ride_invoice_lines(invoice_id,kind,billable,leg_id,order_id,cost_center_id,member_id,cents,occurred_at,dispute_id)
  select p_key,'adjustment',true,l.leg_id,l.order_id,l.cost_center_id,l.member_id,-d.credit_cents,d.decided_at,d.id
  from private.ride_invoice_disputes d join private.ride_invoice_lines l on l.id=d.line_id join private.ride_invoices o on o.id=l.invoice_id
  where d.account_id=a.id and d.status='accepted' and o.month<v_month
    and not exists(select from private.ride_invoice_lines x where x.dispute_id=d.id) order by d.decided_at,d.id;
 insert into private.ride_invoice_marks as k(order_id,applied_cents,restored_cents,topup_cents)
  select l.order_id,coalesce(sum(l.cents) filter(where l.kind='voucher'),0),coalesce(-sum(l.cents) filter(where l.kind='refund'),0),
    coalesce(sum(l.cents) filter(where l.kind='personal_topup'),0)
  from private.ride_invoice_lines l where l.invoice_id=p_key and l.kind<>'adjustment' group by l.order_id
  on conflict(order_id) do update set applied_cents=k.applied_cents+excluded.applied_cents,restored_cents=k.restored_cents+excluded.restored_cents,
    topup_cents=k.topup_cents+excluded.topup_cents,updated_at=now();
 -- What is invoiced never exceeds what the stage-4 benefit use says.
 if exists(select from private.ride_invoice_lines l join private.ride_invoice_marks k on k.order_id=l.order_id
     left join private.ride_benefit_uses u on u.order_id=l.order_id
     where l.invoice_id=p_key and (u.order_id is null or k.applied_cents>u.applied_cents or k.restored_cents>u.restored_cents)) then
   raise exception 'ride_financial_mismatch'; end if;
 select coalesce(sum(l.cents) filter(where l.billable),0),count(*) into v_total,v_lines from private.ride_invoice_lines l where l.invoice_id=p_key;
 update private.ride_invoices set status='closed',closed_at=now(),total_cents=v_total where id=p_key;
 perform private.audit('ride.invoice_close','ride_invoices',p_key::text,jsonb_build_object('account',a.id,'month',v_month,'total',v_total,'lines',v_lines,'environment',env));
 return p_key;
end $$;

-- Who answers for the company's costs reads its closed invoices. An unknown invoice
-- and another company's one answer alike.
create function private.ride_invoice_for(p_invoice uuid) returns private.ride_invoices
language plpgsql stable security definer set search_path='' as $$
declare i private.ride_invoices;
begin
 perform private.require_ride_feature('module');
 select * into i from private.ride_invoices where id=p_invoice and status='closed' and environment=private.ride_env();
 if not found then raise exception 'ride_account_role_required'; end if;
 perform private.ride_require_account_role(i.account_id,array['admin','manager']);
 return i;
end $$;
-- The composition as it is shown and exported: date, cost center, person and cents.
-- Never a place, a point or a route.
create function private.ride_invoice_lines_view(p_invoice uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'kind',l.kind,'billable',l.billable,'date',private.sp_date(l.occurred_at),'occurred_at',l.occurred_at,
     'cost_center',c.code,'cost_center_label',c.label,'member',coalesce(pr.full_name,'Conta encerrada'),'cents',l.cents,
     'dispute',case when d.id is not null then jsonb_build_object('id',d.id,'status',d.status,'decision',d.decision) end)
   order by l.occurred_at,l.kind,l.id),'[]'::jsonb)
 from private.ride_invoice_lines l left join private.ride_cost_centers c on c.id=l.cost_center_id
 left join public.profiles pr on pr.id=l.member_id and pr.deleted_at is null
 left join private.ride_invoice_disputes d on d.line_id=l.id where l.invoice_id=p_invoice
$$;
create function private.ride_invoice_by_cost_center(p_invoice uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('cost_center',t.code,'cost_center_label',t.label,'voucher_cents',t.voucher,'refund_cents',t.refund,
     'adjustment_cents',t.adjustment,'billable_cents',t.voucher+t.refund+t.adjustment) order by t.code),'[]'::jsonb)
 from (select c.code,c.label,coalesce(sum(l.cents) filter(where l.kind='voucher'),0)::bigint as voucher,
     coalesce(sum(l.cents) filter(where l.kind='refund'),0)::bigint as refund,coalesce(sum(l.cents) filter(where l.kind='adjustment'),0)::bigint as adjustment
   from private.ride_invoice_lines l left join private.ride_cost_centers c on c.id=l.cost_center_id
   where l.invoice_id=p_invoice and l.billable group by c.code,c.label) t
$$;
create function public.ride_invoice(p_invoice uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i private.ride_invoices:=private.ride_invoice_for(p_invoice);
begin
 return jsonb_build_object('id',i.id,'account_id',i.account_id,'month',i.month,'status',i.status,'closed_at',i.closed_at,'total_cents',i.total_cents,
   'lines',private.ride_invoice_lines_view(i.id),'by_cost_center',private.ride_invoice_by_cost_center(i.id));
end $$;
create function public.ride_invoice_export(p_invoice uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i private.ride_invoices:=private.ride_invoice_for(p_invoice);
begin
 return jsonb_build_object('invoice',jsonb_build_object('id',i.id,'month',i.month,'status',i.status,'closed_at',i.closed_at,'total_cents',i.total_cents),
   'account',(select jsonb_build_object('id',a.id,'name',a.name) from private.ride_accounts a where a.id=i.account_id),
   'totals',(select jsonb_build_object('voucher_cents',coalesce(sum(l.cents) filter(where l.kind='voucher'),0),
       'refund_cents',coalesce(sum(l.cents) filter(where l.kind='refund'),0),'adjustment_cents',coalesce(sum(l.cents) filter(where l.kind='adjustment'),0),
       'billable_cents',coalesce(sum(l.cents) filter(where l.billable),0),'personal_topup_cents',coalesce(sum(l.cents) filter(where l.kind='personal_topup'),0))
     from private.ride_invoice_lines l where l.invoice_id=i.id),
   'by_cost_center',private.ride_invoice_by_cost_center(i.id),'lines',private.ride_invoice_lines_view(i.id));
end $$;

-- The company contests one billed line; the closed invoice stays as it is.
create function public.ride_dispute_invoice_line(p_line uuid,p_reason text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); env text:=private.ride_env(); l private.ride_invoice_lines; i private.ride_invoices; d private.ride_invoice_disputes;
begin
 if p_line is null or p_key is null or p_reason is null or length(trim(p_reason)) not between 1 and 280 then raise exception 'invalid_input'; end if;
 select * into l from private.ride_invoice_lines where id=p_line;
 select * into i from private.ride_invoices where id=l.invoice_id and status='closed' and environment=env;
 if not found then raise exception 'ride_account_role_required'; end if;
 perform private.ride_require_account_role(i.account_id,array['admin','manager']);
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into d from private.ride_invoice_disputes where id=p_key;
 if found then
   if d.raised_by<>me or d.line_id<>l.id or d.reason<>trim(p_reason) then raise exception 'idempotency_conflict'; end if;
   return d.id;
 end if;
 if not private.ride_party_allowed(env,'invoice',null,null,now()) then raise exception 'ride_feature_disabled'; end if;
 -- Only a charge is contested; credits and the rider's own top-up are not billed.
 if l.kind<>'voucher' then raise exception 'invalid_input'; end if;
 perform 1 from private.ride_accounts where id=i.account_id for update;
 if exists(select from private.ride_invoice_disputes x where x.line_id=l.id) then raise exception 'ride_operation_conflict'; end if;
 if (select count(*) from private.ride_invoice_disputes x where x.account_id=i.account_id and x.status='open')>=50 then raise exception 'rate_limited'; end if;
 insert into private.ride_invoice_disputes(id,line_id,account_id,raised_by,reason) values(p_key,l.id,i.account_id,me,trim(p_reason));
 return p_key;
end $$;
-- Finance decides. Accepting credits the line, never beyond what the company still
-- carries for that order after refunds and earlier credits.
create function public.admin_decide_invoice_dispute(p_dispute uuid,p_accept boolean,p_reason text) returns text
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

-- The monthly report now carries the closed invoice of its month, when there is one.
alter function public.ride_org_report(uuid,date) rename to ride_org_report_before_invoices;
alter function public.ride_org_report_before_invoices(uuid,date) set schema private;
create function public.ride_org_report(p_account uuid,p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb:=private.ride_org_report_before_invoices(p_account,p_month);
begin
 return d||jsonb_build_object('invoice',(select jsonb_build_object('id',i.id,'status',i.status,'total_cents',i.total_cents,'closed_at',i.closed_at)
   from private.ride_invoices i where i.account_id=(d->>'account_id')::uuid and i.month=(d->>'month')::date and i.status='closed'));
end $$;

revoke all on function private.ride_invoice_frozen(),private.ride_invoice_line_frozen(),private.ride_invoice_no_truncate(),private.ride_invoice_movements(uuid),
 private.ride_invoice_for(uuid),private.ride_invoice_lines_view(uuid),private.ride_invoice_by_cost_center(uuid),private.ride_org_report_before_invoices(uuid,date)
 from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.admin_close_ride_invoice(uuid,date,uuid)'::regprocedure,'public.ride_invoice(uuid)'::regprocedure,
  'public.ride_invoice_export(uuid)'::regprocedure,'public.ride_dispute_invoice_line(uuid,text,uuid)'::regprocedure,
  'public.admin_decide_invoice_dispute(uuid,boolean,text)'::regprocedure,'public.ride_org_report(uuid,date)'::regprocedure] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
