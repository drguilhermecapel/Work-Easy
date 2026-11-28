-- O17 stage 5, what the operation and the invited person can see before acting (PAR-501..508).
-- The console of accounts had actions and no list: an operator needed a code typed by hand
-- to verify an account, review a dependent or a cession, decide a contestation or close a
-- month. Three invited people also answered without seeing what they were asked: a
-- companion, a corporate guest and a fleet driver waiting for a review. Everything here
-- only reads (the queue also writes the access log of dependents, as the review queue of
-- 20261127110503 does). No new table, no gate row, nothing is enabled.
--
-- Contracts (all jsonb, authenticated only):
--  admin_ride_party_queue() -> {accounts[{id,kind,name,state,verified_until,created_at}],
--    dependents[{id,label,age_band,requested_at}], cessions[{id,fleet_name,vehicle_identifier,driver_label,from,until}],
--    disputes[{id,account_name,month,kind,cents,reason,raised_at}], invoices[{account_id,account_name,months[]}]}
--    state: 'pending' (never checked) | 'lapsed' (ended in the last 30 days) | 'expiring' (ends in the next 30 days).
--    months: ended São Paulo months a closing would bill now, oldest first, at most 12. No place and no e-mail; the only cents are those of a contested line.
--  admin_ride_organizations() -> [{id,name,verified,verified_until,created_at,programs[{id,label,enabled,budget_cents,
--    committed_cents,ride_value_cents,member_limit_cents,areas,classes,group_tag,valid_from,valid_until,excess_payer,
--    requires_approval,funding_ref,evidence_ref,created_at}]}]   what finance needs to register or change a program
--  ride_companion_invite(token) -> {id,owner_label,notices,pays,ceiling_cents,expires_at,simulation} | null
--  ride_guest_invite(token)     -> {id,status,account_name,legs[{seq,origin,destination,pickup_at}],scheduled_at,expires_at,simulation} | null
--  ride_my_cessions()           -> [{id,account_id,account_name,vehicle_identifier,category,cession_ref,beneficiary,from,until,status,created_at}]
create index ride_accounts_review on private.ride_accounts(environment,verified_until) where kind<>'family' and status='active';
create index ride_dependents_pending on private.ride_dependents(environment,created_at) where status='pending';
create index ride_invoice_disputes_open on private.ride_invoice_disputes(created_at) where status='open';

-- The ended months a closing of this company would bill today: a month with voucher or
-- refund movement and no invoice, or the first open month after an invoice that left a
-- late movement or an accepted contestation behind. Same source as the closing itself.
create function private.ride_invoice_open_months(p_account uuid) returns date[] language sql stable security definer set search_path='' as $$
 select array_agg(u.m order by u.m) from (select distinct t.m from (
     select mv.month as since from private.ride_invoice_movements(p_account) mv where mv.kind<>'personal_topup' and mv.month<private.ride_month(now())
     union
     select (o.month+interval '1 month')::date from private.ride_invoice_disputes d join private.ride_invoice_lines l on l.id=d.line_id
      join private.ride_invoices o on o.id=l.invoice_id
      where d.account_id=p_account and d.status='accepted' and not exists(select from private.ride_invoice_lines x where x.dispute_id=d.id)) s
   cross join lateral (select g::date as m from generate_series(s.since::timestamp,private.ride_month(now())-interval '1 month',interval '1 month') g
     where not exists(select from private.ride_invoices x where x.account_id=p_account and x.month=g::date) order by g limit 1) t
   order by t.m limit 12) u
$$;

-- One reading for the console. About a minor only the label and the age band leave the
-- record, and each reading is logged, at most once per hour per operator and dependent.
create function public.admin_ride_party_queue() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); env text:=private.ride_env(); result jsonb;
begin
 perform private.require_ride_finance_admin();
 with waiting as (select d.id,d.label,d.age_band,d.created_at from private.ride_dependents d where d.environment=env and d.status='pending'
   order by d.created_at,d.id limit 100),
 logged as (insert into private.ride_minor_access_log(actor,dependent_id,purpose) select me,w.id,'queue' from waiting w
   where not exists(select from private.ride_minor_access_log o where o.actor=me and o.dependent_id=w.id and o.purpose='queue' and o.at>now()-interval '1 hour'))
 select jsonb_build_object(
  'accounts',(select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'name',a.name,
      'state',case when a.verified_until is null then 'pending' when a.verified_until<=now() then 'lapsed' else 'expiring' end,
      'verified_until',a.verified_until,'created_at',a.created_at) order by a.verified_until nulls first,a.created_at,a.id),'[]'::jsonb)
    from (select x.id,x.kind,x.name,x.verified_until,x.created_at from private.ride_accounts x
      where x.environment=env and x.kind<>'family' and x.status='active'
        and (x.verified_until is null or x.verified_until between now()-interval '30 days' and now()+interval '30 days')
      order by x.verified_until nulls first,x.created_at,x.id limit 100) a),
  'dependents',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'label',w.label,'age_band',w.age_band,'requested_at',w.created_at)
      order by w.created_at,w.id),'[]'::jsonb) from waiting w),
  'cessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'fleet_name',a.name,'vehicle_identifier',v.vehicle_identifier,'driver_label',p.full_name,
      'from',lower(s.period),'until',upper(s.period)) order by s.seq),'[]'::jsonb)
    from (select x.id,x.seq,x.account_id,x.vehicle_id,x.driver_id,x.period from private.ride_fleet_assignments x
      join private.ride_accounts xa on xa.id=x.account_id and xa.environment=env where x.status='pending_review' order by x.seq limit 100) s
    join private.ride_accounts a on a.id=s.account_id join private.ride_fleet_vehicles v on v.id=s.vehicle_id
    left join public.profiles p on p.id=s.driver_id and p.deleted_at is null),
  'disputes',(select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'account_name',a.name,'month',i.month,'kind',l.kind,'cents',l.cents,'reason',d.reason,
      'raised_at',d.created_at) order by d.created_at,d.id),'[]'::jsonb)
    from (select x.id,x.account_id,x.line_id,x.reason,x.created_at from private.ride_invoice_disputes x
      join private.ride_accounts xa on xa.id=x.account_id and xa.environment=env where x.status='open' order by x.created_at,x.id limit 100) d
    join private.ride_accounts a on a.id=d.account_id join private.ride_invoice_lines l on l.id=d.line_id join private.ride_invoices i on i.id=l.invoice_id),
  'invoices',(select coalesce(jsonb_agg(jsonb_build_object('account_id',o.id,'account_name',o.name,'months',to_jsonb(o.months)) order by o.months[1],o.name,o.id),'[]'::jsonb)
    from (select y.id,y.name,y.months from (select x.id,x.name,private.ride_invoice_open_months(x.id) as months from private.ride_accounts x
        where x.environment=env and x.kind='organization' and exists(select from private.ride_voucher_grants g where g.account_id=x.id)) y
      where y.months is not null order by y.months[1],y.name,y.id limit 50) o)) into result;
 return result;
end $$;

-- Finance registers and changes programs with admin_save_ride_voucher_program, which
-- takes the company and the program by id. This is where both are read, with what is
-- already committed, since a budget never drops below it.
create function public.admin_ride_organizations() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare env text:=private.ride_env();
begin
 perform private.require_ride_finance_admin();
 return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.name,'verified',private.ride_account_verified(a),'verified_until',a.verified_until,
     'created_at',a.created_at,'programs',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',p.label,'enabled',p.enabled,'budget_cents',p.budget_cents,
         'committed_cents',private.ride_voucher_commitment(p.id,null),'ride_value_cents',p.ride_value_cents,'member_limit_cents',p.member_limit_cents,
         'areas',to_jsonb(p.areas),'classes',to_jsonb(p.classes),'group_tag',p.group_tag,'valid_from',lower(p.validity),'valid_until',upper(p.validity),
         'excess_payer',p.excess_payer,'requires_approval',p.requires_approval,'funding_ref',p.funding_ref,'evidence_ref',p.evidence_ref,
         'created_at',p.created_at) order by p.created_at,p.id),'[]'::jsonb)
       from private.ride_voucher_programs p where p.account_id=a.id and p.environment=env)) order by a.name,a.created_at,a.id),'[]'::jsonb)
   from (select x.* from private.ride_accounts x where x.environment=env and x.kind='organization' and x.status='active' order by x.name,x.created_at,x.id limit 200) a);
end $$;

-- Who is asked to follow somebody's rides, and maybe to pay for them, reads who asks,
-- which notices and up to how much per ride before answering. Only the confirmed
-- recipient of a pending invite gets an answer.
create function public.ride_companion_invite(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); i private.ride_companion_invites; ceiling int;
begin
 if not private.ride_active_user(me) then return null; end if;
 i:=private.ride_find_companion_invite(p_token);
 if i.id is null or i.status<>'pending' or i.expires_at<=now() or i.owner_id=me then return null; end if;
 if i.pays then
   select t.ride_ceiling_cents into ceiling from private.ride_companion_terms t where t.environment=i.environment and t.valid_until>now();
   if not found then return null; end if;
 end if;
 return (select jsonb_build_object('id',i.id,'owner_label',p.full_name,'notices',to_jsonb(i.notices),'pays',i.pays,'ceiling_cents',ceiling,
     'expires_at',i.expires_at,'simulation',i.environment='simulation') from public.profiles p where p.id=i.owner_id and p.deleted_at is null);
end $$;
-- The corporate guest reads which company invites, the itinerary by area and the time.
-- Never a price: the guest owes nothing, and a fare above the voucher is not accepted.
create function public.ride_guest_invite(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); i private.ride_guest_invites; state text;
begin
 if not private.ride_active_user(me) then return null; end if;
 i:=private.ride_find_guest_invite(p_token);
 if i.id is null or i.issued_by=me or (i.guest_id is not null and i.guest_id<>me) then return null; end if;
 state:=case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end;
 return (select jsonb_build_object('id',i.id,'status',state,'account_name',a.name,
     'legs',case when state in ('pending','accepted') then (select coalesce(jsonb_agg(jsonb_build_object('seq',x.n,'origin',x.leg->>'origin',
         'destination',x.leg->>'destination','pickup_at',x.leg->>'pickup_at') order by x.n),'[]'::jsonb)
       from jsonb_array_elements(i.request_legs) with ordinality x(leg,n)) else '[]'::jsonb end,
     'scheduled_at',i.scheduled_at,'expires_at',i.expires_at,'simulation',a.environment='simulation')
   from private.ride_accounts a where a.id=i.account_id);
end $$;
-- A fleet driver gets offers only under a reviewed cession and could not see their own.
create function public.ride_my_cessions() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module');
begin return private.ride_fleet_assignments_view(me); end $$;

revoke all on function private.ride_invoice_open_months(uuid) from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.admin_ride_party_queue()'::regprocedure,'public.admin_ride_organizations()'::regprocedure,
  'public.ride_companion_invite(text)'::regprocedure,'public.ride_guest_invite(text)'::regprocedure,'public.ride_my_cessions()'::regprocedure] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
