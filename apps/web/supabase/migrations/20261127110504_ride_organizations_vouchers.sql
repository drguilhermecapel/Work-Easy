-- O17 stage 5, PAR-505 and PAR-506, on the core of 20261127110501. An organization is a
-- ride account of kind 'organization', unusable until the operation checked it. The rider
-- of a professional or guest trip stays passenger and payer; the company funds through a
-- stage-4 corporate benefit bound to the leg, so order, receipt, refund and ledger stay
-- the stage-4 ones. Gates: 'organization' and 'voucher' in private.ride_party_rules
-- (simulation rows only); a program is registered by finance with a funding reference.
--
-- Contracts for the later stage-5 files:
--  ride_voucher_grants(benefit_id pk, leg_id unique, program_id, account_id, member_id, cost_center_id, granted_cents)
--    one row per funded leg, written with the benefit when the leg is created.
--  ride_voucher_commitment(program,member) -> bigint   computed: use = applied-restored; unused = awarded,
--    or 0 once the leg is cancelled or the benefit expired. Nothing is counted in a column.
--  Money facts are ride_benefit_uses and ride_order_events ('benefit', 'benefit_refund') of the grant's benefit.
--  ride_trip_grants.status: requested -> approved|rejected -> used (bound to one ride); 'expired' is derived on read.
--  ride_quote_funding/ride_leg_funding.program_id, cost_center_id and grant_id now carry foreign keys to these tables.
--  ride_org_report(account,month) -> {account_id,month,rows[],by_cost_center[],voucher_cents,refunded_cents,reserved_cents,invoice}
--    cents are grouped by the São Paulo month of their order event; "invoice" is null here, for the invoice file to fill.
--  A program's member limit holds for the whole program; a leg amended later keeps the cents reserved for it.
create table private.ride_cost_centers (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references private.ride_accounts(id),
 code text not null check(code ~ '^[A-Z0-9][A-Z0-9._-]{0,23}$'), label text not null check(length(trim(label)) between 1 and 80),
 active boolean not null default true, created_at timestamptz not null default now(), unique(account_id,code)
);
create table private.ride_voucher_programs (
 id uuid primary key, account_id uuid not null references private.ride_accounts(id),
 environment text not null references private.ride_network(environment), label text not null check(length(trim(label)) between 1 and 80),
 budget_cents int not null check(budget_cents between 1 and 100000000), ride_value_cents int not null check(ride_value_cents>0),
 member_limit_cents int check(member_limit_cents>0),
 areas text[] not null default '{}' check(cardinality(areas)<=20 and array_position(areas,null) is null),
 classes text[] not null default '{}' check(cardinality(classes)<=12 and array_position(classes,null) is null),
 group_tag text check(length(trim(group_tag)) between 1 and 40),
 validity tstzrange not null check(not isempty(validity) and not lower_inf(validity) and not upper_inf(validity)),
 excess_payer text not null check(excess_payer in ('rider','none')), requires_approval boolean not null default false,
 funding_ref text not null check(length(trim(funding_ref)) between 1 and 160), evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160),
 enabled boolean not null default false, created_by uuid not null, created_at timestamptz not null default now(),
 check(ride_value_cents<=budget_cents and member_limit_cents<=budget_cents)
);
create index ride_voucher_programs_account on private.ride_voucher_programs(account_id);
-- An authorization for one trip. A guest grant is issued approved by the desk and
-- learns its beneficiary when the invited person accepts.
create table private.ride_trip_grants (
 id uuid primary key, account_id uuid not null references private.ride_accounts(id),
 program_id uuid not null references private.ride_voucher_programs(id), cost_center_id uuid not null references private.ride_cost_centers(id),
 beneficiary_id uuid references private.ride_subjects(id), issued_by uuid not null references private.ride_subjects(id),
 approved_by uuid references private.ride_subjects(id), decided_by uuid references private.ride_subjects(id),
 purpose text not null check(length(trim(purpose)) between 1 and 140), ceiling_cents int not null check(ceiling_cents>0),
 validity tstzrange not null check(not isempty(validity) and not lower_inf(validity) and not upper_inf(validity)),
 status text not null default 'requested' check(status in ('requested','approved','rejected','used','expired')),
 guest boolean not null default false, ride_id uuid references public.rides(id), request_hash bytea not null,
 decided_at timestamptz, created_at timestamptz not null default now(),
 check(beneficiary_id is not null or guest), check(status<>'used' or ride_id is not null),
 check(beneficiary_id is null or (approved_by is distinct from beneficiary_id and decided_by is distinct from beneficiary_id))
);
create index ride_trip_grants_account on private.ride_trip_grants(account_id,created_at);
create index ride_trip_grants_beneficiary on private.ride_trip_grants(beneficiary_id) where beneficiary_id is not null;
create table private.ride_guest_invites (
 id uuid primary key, account_id uuid not null references private.ride_accounts(id), grant_id uuid not null unique references private.ride_trip_grants(id),
 request_legs jsonb not null check(jsonb_typeof(request_legs)='array'), scheduled_at timestamptz,
 token_hash bytea not null unique, recipient_hash bytea not null, request_hash bytea not null,
 issued_by uuid not null references private.ride_subjects(id), guest_id uuid references private.ride_subjects(id),
 quote_id uuid references private.ride_quotes(id) on delete set null,
 status text not null default 'pending' check(status in ('pending','accepted','declined','expired','revoked')),
 expires_at timestamptz not null, answered_at timestamptz, created_at timestamptz not null default now(), check(guest_id is distinct from issued_by)
);
create index ride_guest_invites_issuer on private.ride_guest_invites(issued_by,created_at);
create table private.ride_voucher_grants (
 benefit_id uuid primary key references private.ride_benefits(id), leg_id uuid not null unique references public.ride_legs(id),
 program_id uuid not null references private.ride_voucher_programs(id), account_id uuid not null references private.ride_accounts(id),
 member_id uuid not null references private.ride_subjects(id), cost_center_id uuid references private.ride_cost_centers(id),
 granted_cents int not null check(granted_cents>0), created_at timestamptz not null default now()
);
create index ride_voucher_grants_program on private.ride_voucher_grants(program_id,member_id);
create index ride_voucher_grants_account on private.ride_voucher_grants(account_id);
create index ride_benefit_uses_benefit on private.ride_benefit_uses(benefit_id);
alter table private.ride_quote_funding add foreign key(program_id) references private.ride_voucher_programs(id),
 add foreign key(cost_center_id) references private.ride_cost_centers(id), add foreign key(grant_id) references private.ride_trip_grants(id);
alter table private.ride_leg_funding add foreign key(program_id) references private.ride_voucher_programs(id),
 add foreign key(cost_center_id) references private.ride_cost_centers(id), add foreign key(grant_id) references private.ride_trip_grants(id);
do $$ declare t text; begin
 foreach t in array array['ride_cost_centers','ride_voucher_programs','ride_trip_grants','ride_guest_invites','ride_voucher_grants'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

-- The caller's role in a checked organization. Reading history only needs the role.
create function private.ride_organization(p_account uuid,p_roles text[]) returns private.ride_accounts
language plpgsql stable security definer set search_path='' as $$
declare a private.ride_accounts:=private.ride_require_account_role(p_account,p_roles);
begin
 if a.kind<>'organization' then raise exception 'invalid_input'; end if;
 if not private.ride_account_verified(a) or not private.ride_party_allowed(a.environment,'organization',null,null,now()) then raise exception 'ride_feature_disabled'; end if;
 return a;
end $$;
-- Commitment is computed, never counted. Only cents restored by a settled stage-4
-- benefit refund come back; a cancelled leg or an expired benefit frees its grant.
create function private.ride_voucher_commitment(p_program uuid,p_member uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce(sum(case when u.order_id is not null then u.applied_cents-u.restored_cents
     when l.status='cancelled' or b.valid_until<=now() then 0 else b.awarded_cents end),0)::bigint
 from private.ride_voucher_grants g join private.ride_benefits b on b.id=g.benefit_id join public.ride_legs l on l.id=g.leg_id
 left join private.ride_benefit_uses u on u.benefit_id=b.id
 where g.program_id=p_program and (p_member is null or g.member_id=p_member)
$$;
-- What the program pays for one quoted leg, or a refusal. The same rule runs when
-- the rider quotes and again when the leg is created.
create function private.ride_voucher_plan(p private.ride_voucher_programs,p_leg jsonb,p_ceiling int) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare fare int:=(p_leg->>'fare_cents')::int; pickup timestamptz:=(p_leg->>'pickup_at')::timestamptz; cents int;
begin
 if p.id is null or fare is null or fare<=0 or pickup is null or p.environment is distinct from private.ride_env() then raise exception 'ride_voucher_unavailable'; end if;
 if not private.ride_party_allowed(p.environment,'voucher',p_leg->>'origin',p_leg->>'destination',
    pickup+make_interval(mins=>coalesce((p_leg->>'duration_minutes')::int,0))) then raise exception 'ride_feature_disabled'; end if;
 if not p.enabled or not p.validity @> pickup
   or (cardinality(p.areas)>0 and not coalesce((p_leg->>'origin')=any(p.areas) and (p_leg->>'destination')=any(p.areas),false))
   or (cardinality(p.classes)>0 and not coalesce((p_leg->>'class_code')=any(p.classes),false)) then raise exception 'ride_voucher_unavailable'; end if;
 cents:=least(fare,p.ride_value_cents,coalesce(p_ceiling,p.ride_value_cents));
 if fare>cents and p.excess_payer<>'rider' then raise exception 'ride_voucher_unavailable'; end if;
 return jsonb_build_object('voucher_cents',cents,'excess_cents',fare-cents);
end $$;

create function public.ride_create_organization(p_name text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin return private.ride_open_account('organization',p_name,null,null,p_key); end $$;
create function public.ride_set_member_role(p_account uuid,p_member uuid,p_role text,p_group text) returns boolean
language plpgsql security definer set search_path='' as $$
declare a private.ride_accounts; tag text:=nullif(trim(coalesce(p_group,'')),'');
begin
 perform private.require_ride_feature('module');
 a:=private.ride_organization(p_account,array['admin']);
 if p_member is null or p_member=a.owner_id or p_role is null or p_role not in ('member','operator','approver','manager') or length(tag)>40 then
   raise exception 'invalid_input'; end if;
 perform 1 from private.ride_accounts where id=a.id for update;
 update private.ride_account_members set role=p_role,group_tag=tag where account_id=a.id and member_id=p_member and status='active';
 if not found then raise exception 'invalid_input'; end if;
 return true;
end $$;
create function public.ride_save_cost_center(p_account uuid,p_code text,p_label text,p_active boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare a private.ride_accounts; v_code text:=upper(trim(coalesce(p_code,''))); saved uuid;
begin
 perform private.require_ride_feature('module');
 a:=private.ride_organization(p_account,array['admin']);
 if v_code !~ '^[A-Z0-9][A-Z0-9._-]{0,23}$' or p_label is null or length(trim(p_label)) not between 1 and 80 or p_active is null then raise exception 'invalid_input'; end if;
 perform 1 from private.ride_accounts where id=a.id for update;
 if not exists(select from private.ride_cost_centers c where c.account_id=a.id and c.code=v_code)
   and (select count(*) from private.ride_cost_centers c where c.account_id=a.id)>=200 then raise exception 'rate_limited'; end if;
 insert into private.ride_cost_centers(account_id,code,label,active) values(a.id,v_code,trim(p_label),p_active)
  on conflict(account_id,code) do update set label=excluded.label,active=excluded.active returning id into saved;
 return saved;
end $$;
-- Finance registers a program against a funding reference. The reviewer may not
-- belong to the company, and a budget never drops below what is already committed.
create function public.admin_save_ride_voucher_program(p_id uuid,p_account uuid,p_label text,p_budget int,p_ride_value int,p_member_limit int,
 p_areas text[],p_classes text[],p_group text,p_from timestamptz,p_until timestamptz,p_excess_payer text,p_requires_approval boolean,
 p_funding_ref text,p_evidence_ref text,p_enabled boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare a private.ride_accounts; old private.ride_voucher_programs; env text:=private.ride_env(); v_areas text[]:=coalesce(p_areas,'{}'::text[]);
 v_classes text[]:=coalesce(p_classes,'{}'::text[]); tag text:=nullif(trim(coalesce(p_group,'')),'');
begin
 perform private.require_ride_finance_admin();
 select * into a from private.ride_accounts where id=p_account and environment=env for update;
 if not found or a.kind<>'organization' or a.status<>'active' or p_id is null or p_label is null or length(trim(p_label)) not between 1 and 80
   or p_budget is null or p_budget not between 1 and 100000000 or p_ride_value is null or p_ride_value not between 1 and p_budget
   or p_member_limit not between 1 and p_budget or cardinality(v_areas)>20 or array_position(v_areas,null) is not null
   or cardinality(v_classes)>12 or array_position(v_classes,null) is not null
   or exists(select from unnest(v_areas||v_classes) x where x<>trim(x) or length(x) not between 1 and 80) or length(tag)>40
   or p_from is null or p_until is null or p_from>=p_until or isfinite(p_from) is not true or isfinite(p_until) is not true
   or p_excess_payer is null or p_excess_payer not in ('rider','none') or p_requires_approval is null or p_enabled is null
   or length(trim(coalesce(p_funding_ref,''))) not between 1 and 160 or length(trim(coalesce(p_evidence_ref,''))) not between 1 and 160 then
   raise exception 'invalid_input'; end if;
 if exists(select from private.ride_account_members where account_id=a.id and member_id=auth.uid() and status='active') then raise exception 'not_allowed'; end if;
 if p_enabled and (not private.ride_account_verified(a) or not private.ride_party_allowed(env,'organization',null,null,now())
   or (cardinality(v_areas)=0 and not private.ride_party_allowed(env,'voucher',null,null,p_until))
   or exists(select from unnest(v_areas) x where not private.ride_party_allowed(env,'voucher',x,null,p_until))) then raise exception 'ride_feature_disabled'; end if;
 select * into old from private.ride_voucher_programs where id=p_id for update;
 if found then
   if old.account_id<>a.id or old.environment<>env then raise exception 'idempotency_conflict'; end if;
   if p_budget<private.ride_voucher_commitment(old.id,null) then raise exception 'invalid_input'; end if;
   update private.ride_voucher_programs set label=trim(p_label),budget_cents=p_budget,ride_value_cents=p_ride_value,member_limit_cents=p_member_limit,
     areas=v_areas,classes=v_classes,group_tag=tag,validity=tstzrange(p_from,p_until,'[)'),excess_payer=p_excess_payer,requires_approval=p_requires_approval,
     funding_ref=trim(p_funding_ref),evidence_ref=trim(p_evidence_ref),enabled=p_enabled where id=old.id;
 else
   insert into private.ride_voucher_programs(id,account_id,environment,label,budget_cents,ride_value_cents,member_limit_cents,areas,classes,group_tag,validity,
     excess_payer,requires_approval,funding_ref,evidence_ref,enabled,created_by)
   values(p_id,a.id,env,trim(p_label),p_budget,p_ride_value,p_member_limit,v_areas,v_classes,tag,tstzrange(p_from,p_until,'[)'),p_excess_payer,
     p_requires_approval,trim(p_funding_ref),trim(p_evidence_ref),p_enabled,auth.uid());
 end if;
 perform private.audit('ride.voucher_program','ride_voucher_programs',p_id::text,jsonb_build_object('account',a.id,'budget',p_budget,'ride_value',p_ride_value,
   'member_limit',p_member_limit,'enabled',p_enabled,'funding',trim(p_funding_ref),'evidence',trim(p_evidence_ref),'environment',env));
 return p_id;
end $$;

-- Any member asks for an authorization; an approver decides, never for themselves.
create function public.ride_request_trip_grant(p_account uuid,p_program uuid,p_cost_center uuid,p_purpose text,p_from timestamptz,p_until timestamptz,p_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; p private.ride_voucher_programs; g private.ride_trip_grants; h bytea;
begin
 a:=private.ride_organization(p_account,array['admin','member','operator','approver','manager']);
 if p_key is null or p_program is null or p_cost_center is null or p_purpose is null or length(trim(p_purpose)) not between 1 and 140
   or p_from is null or p_until is null or p_from>=p_until or p_until<=now() or p_until>now()+interval '90 days' or p_until-p_from>interval '31 days' then
   raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(a.id::text,p_program::text,p_cost_center::text,trim(p_purpose),extract(epoch from p_from)::text,extract(epoch from p_until)::text);
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into g from private.ride_trip_grants where id=p_key;
 if found then
   if g.issued_by<>me or g.request_hash<>h then raise exception 'idempotency_conflict'; end if;
   return g.id;
 end if;
 select * into p from private.ride_voucher_programs where id=p_program and account_id=a.id and environment=a.environment and enabled;
 if not found or not exists(select from private.ride_cost_centers c where c.id=p_cost_center and c.account_id=a.id and c.active) then raise exception 'invalid_input'; end if;
 if p.group_tag is not null and p.group_tag is distinct from (select m.group_tag from private.ride_account_members m where m.account_id=a.id and m.member_id=me) then
   raise exception 'ride_voucher_unavailable'; end if;
 if (select count(*) from private.ride_trip_grants x where x.account_id=a.id and x.beneficiary_id=me and x.status='requested' and upper(x.validity)>now())>=20 then
   raise exception 'rate_limited'; end if;
 insert into private.ride_trip_grants(id,account_id,program_id,cost_center_id,beneficiary_id,issued_by,purpose,ceiling_cents,validity,request_hash)
  values(p_key,a.id,p.id,p_cost_center,me,me,trim(p_purpose),p.ride_value_cents,tstzrange(p_from,p_until,'[)'),h);
 return p_key;
end $$;
create function public.ride_decide_trip_grant(p_grant uuid,p_approve boolean) returns text
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); g private.ride_trip_grants; desired text;
begin
 if p_grant is null or p_approve is null then raise exception 'invalid_input'; end if;
 select * into g from private.ride_trip_grants where id=p_grant;
 -- An unknown authorization and another company's one answer alike.
 if not found then raise exception 'ride_account_role_required'; end if;
 perform private.ride_organization(g.account_id,array['admin','approver']);
 select * into strict g from private.ride_trip_grants where id=p_grant for update;
 if g.guest or g.beneficiary_id is not distinct from me then raise exception 'not_allowed'; end if;
 desired:=case when p_approve then 'approved' else 'rejected' end;
 if g.status=desired or (p_approve and g.status='used') then return g.status; end if;
 if g.status<>'requested' then raise exception 'ride_operation_conflict'; end if;
 if upper(g.validity)<=now() then return 'expired'; end if;
 update private.ride_trip_grants set status=desired,decided_by=me,approved_by=case when p_approve then me end,decided_at=now() where id=g.id;
 return desired;
end $$;

-- The desk schedules for somebody outside the company. The invite names a confirmed
-- e-mail by hash only and carries areas and time, never a place or a price.
create function private.ride_find_guest_invite(p_token text) returns private.ride_guest_invites
language sql stable security definer set search_path='' as $$
 select i from private.ride_guest_invites i join auth.users u on u.id=auth.uid() join private.ride_accounts a on a.id=i.account_id
 where p_token ~ '^[a-f0-9]{64}$' and i.token_hash=sha256(convert_to(p_token,'UTF8'))
   and i.recipient_hash=sha256(convert_to(p_token||lower(trim(u.email)),'UTF8')) and u.email_confirmed_at is not null
   and a.environment=private.ride_env()
$$;
create function public.ride_invite_guest(p_account uuid,p_program uuid,p_cost_center uuid,p_email text,p_legs jsonb,p_scheduled_at timestamptz,p_minutes int,p_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('quote'); a private.ride_accounts; p private.ride_voucher_programs; i private.ride_guest_invites;
 token text:=encode(extensions.gen_random_bytes(32),'hex'); h bytea; e jsonb; legs jsonb; depart timestamptz:=coalesce(p_scheduled_at,now()); ends timestamptz;
begin
 a:=private.ride_organization(p_account,array['admin','operator']);
 if p_key is null or p_program is null or p_cost_center is null or p_minutes is null or p_minutes not in (5,15,30,60) or p_email is null or length(p_email)>254
   or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(p_legs) is distinct from 'array'
   or jsonb_array_length(p_legs) not between 1 and 4 or pg_column_size(p_legs)>4096
   or (p_scheduled_at is not null and (p_scheduled_at<=now() or p_scheduled_at>now()+interval '30 days')) then raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(a.id::text,p_program::text,p_cost_center::text,lower(trim(p_email)),p_legs::text,coalesce(extract(epoch from p_scheduled_at)::text,''),p_minutes::text);
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
 -- A guest has no group, and the itinerary is by area: a measured route belongs to who measured it.
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
create function public.ride_revoke_guest_invite(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); i private.ride_guest_invites;
begin
 if not private.ride_active_user(me) then raise exception 'not_allowed'; end if;
 update private.ride_guest_invites x set status='revoked',answered_at=now() from private.ride_accounts a
  where x.id=p_id and x.status='pending' and a.id=x.account_id and a.environment=private.ride_env() and (x.issued_by=me or exists(select from private.ride_account_members m
    where m.account_id=x.account_id and m.member_id=me and m.status='active' and m.role='admin')) returning x.* into i;
 if not found then return false; end if;
 update private.ride_trip_grants set status='rejected',decided_at=now() where id=i.grant_id and status='approved';
 return true;
end $$;

-- The professional profile. The rider quotes as usual and stays the payer; the quote
-- only declares which cents the company funds and which the rider accepts to pay.
-- Nothing is reserved here. A refusal raises and leaves no quote behind.
create function public.ride_quote_funded(p_key uuid,p_scheduled_at timestamptz,p_legs jsonb,p_program uuid,p_cost_center uuid,p_grant uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('quote'); env text:=private.ride_env(); p private.ride_voucher_programs; a private.ride_accounts;
 mem private.ride_account_members; g private.ride_trip_grants; q private.ride_quotes; f private.ride_quote_funding; v jsonb; e jsonb;
 planned jsonb:='{}'; part jsonb; total bigint:=0;
begin
 if p_program is null or p_cost_center is null then raise exception 'invalid_input'; end if;
 select * into p from private.ride_voucher_programs where id=p_program and environment=env;
 select * into a from private.ride_accounts where id=p.account_id and environment=env and status='active';
 select * into mem from private.ride_account_members where account_id=a.id and member_id=me and status='active';
 if p_grant is not null then select * into g from private.ride_trip_grants where id=p_grant and account_id=a.id and beneficiary_id=me; end if;
 -- Somebody outside the company learns nothing about its programs.
 if a.id is null or (mem.member_id is null and not coalesce(g.guest,false)) then raise exception 'ride_account_role_required'; end if;
 if a.kind<>'organization' or not private.ride_account_verified(a) or not private.ride_party_allowed(env,'organization',null,null,now()) then
   raise exception 'ride_feature_disabled'; end if;
 if not exists(select from private.ride_cost_centers c where c.id=p_cost_center and c.account_id=a.id and c.active) then raise exception 'invalid_input'; end if;
 v:=public.ride_quote(p_key,null,p_scheduled_at,p_legs);
 select * into strict q from private.ride_quotes where id=(v->>'id')::uuid;
 select * into f from private.ride_quote_funding where quote_id=q.id;
 if found then
   if (f.kind,f.program_id,f.cost_center_id,f.grant_id) is distinct from ('voucher'::text,p.id,p_cost_center,p_grant) then raise exception 'idempotency_conflict'; end if;
   return private.ride_quote_view(q,me);
 end if;
 -- The same key first used for another kind of quote is a different request.
 if q.created_at<>now() then raise exception 'idempotency_conflict'; end if;
 if p.group_tag is not null and mem.group_tag is distinct from p.group_tag then raise exception 'ride_voucher_unavailable'; end if;
 if p.requires_approval or p_grant is not null then
   if g.id is null or g.program_id<>p.id or g.cost_center_id<>p_cost_center
     or not (g.status='approved' or (g.status='used' and g.ride_id is not distinct from q.existing_ride_id))
     or exists(select from jsonb_array_elements(q.legs) x where not g.validity @> (x->>'pickup_at')::timestamptz) then raise exception 'ride_approval_required'; end if;
 end if;
 for e in select value from jsonb_array_elements(q.legs) loop
   part:=private.ride_voucher_plan(p,e,g.ceiling_cents);
   planned:=planned||jsonb_build_object(e->>'seq',part); total:=total+(part->>'voucher_cents')::int;
 end loop;
 if private.ride_voucher_commitment(p.id,null)+total>p.budget_cents or private.ride_voucher_commitment(p.id,me)+total>p.member_limit_cents then
   raise exception 'ride_voucher_unavailable'; end if;
 perform private.ride_fund_voucher_quote(q.id,a.id,p.id,p_cost_center,p_grant,planned);
 return private.ride_quote_view(q,me);
end $$;
-- Acceptance runs in the guest's own session: the funded quote and the guest's
-- consent, or nothing at all. A guest never owes a cent: a fare above the voucher
-- aborts, and the invite stays pending until it expires.
create function public.ride_answer_guest_invite(p_token text,p_accept boolean,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); i private.ride_guest_invites; g private.ride_trip_grants; a private.ride_accounts;
 v jsonb; c jsonb; desired text;
begin
 if p_accept is null or p_key is null then raise exception 'invalid_input'; end if;
 i:=private.ride_find_guest_invite(p_token);
 if i.id is null then raise exception 'ride_invite_unavailable'; end if;
 select * into strict i from private.ride_guest_invites where id=i.id for update;
 desired:=case when p_accept then 'accepted' else 'declined' end;
 if i.guest_id=me and i.status=desired then
   return jsonb_build_object('status',i.status,'quote_id',i.quote_id,'ride_id',(select r.id from public.rides r where r.quote_id=i.quote_id));
 end if;
 select * into strict g from private.ride_trip_grants where id=i.grant_id for update;
 select * into strict a from private.ride_accounts where id=i.account_id;
 if i.status<>'pending' or i.expires_at<=now() or i.issued_by=me or g.status<>'approved' or a.status<>'active'
   or not exists(select from private.ride_account_members m where m.account_id=a.id and m.member_id=i.issued_by and m.status='active'
     and m.role in ('admin','operator') and private.ride_active_user(m.member_id)) then raise exception 'ride_invite_unavailable'; end if;
 if not p_accept then
   update private.ride_guest_invites set status='declined',guest_id=me,answered_at=now() where id=i.id;
   update private.ride_trip_grants set status='rejected',decided_at=now() where id=g.id;
   return jsonb_build_object('status','declined','quote_id',null,'ride_id',null);
 end if;
 update private.ride_trip_grants set beneficiary_id=me where id=g.id;
 begin
   v:=public.ride_quote_funded(p_key,i.scheduled_at,i.request_legs,g.program_id,g.cost_center_id,g.id);
 exception when raise_exception then
   -- A departure time that has passed makes the invite itself stale.
   if sqlerrm='invalid_schedule' then raise exception 'ride_invite_unavailable'; end if;
   raise;
 end;
 if coalesce((v#>>'{funding,excess_cents}')::int,0)>0 then raise exception 'ride_voucher_unavailable'; end if;
 c:=public.ride_consent((v->>'id')::uuid,true);
 if c->>'status' is distinct from 'requested' then raise exception 'ride_invite_unavailable'; end if;
 update private.ride_guest_invites set status='accepted',guest_id=me,quote_id=(v->>'id')::uuid,answered_at=now() where id=i.id;
 return jsonb_build_object('status','accepted','quote_id',(v->>'id')::uuid,'ride_id',(c->>'ride_id')::uuid);
end $$;

-- Atomic reservation where the obligation is born. The program row serializes every
-- consent that draws on it; the benefit and its grant exist or the whole consent
-- rolls back. There is no fallback to a personal payment.
create function private.ride_voucher_reserve() returns trigger language plpgsql security definer set search_path='' as $$
declare f private.ride_leg_funding; a private.ride_accounts; p private.ride_voucher_programs; item jsonb; part jsonb; cents int; v_ceiling int; made uuid;
begin
 -- Every voucher declaration names its program (ride_quote_funded always does; 20261127110507 makes it a constraint).
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
 if (item->>'fare_cents')::int is distinct from new.fare_cents or part is distinct from f.planned then raise exception 'ride_voucher_unavailable'; end if;
 cents:=(part->>'voucher_cents')::int;
 if private.ride_voucher_commitment(p.id,null)+cents>p.budget_cents or private.ride_voucher_commitment(p.id,f.member_id)+cents>p.member_limit_cents then
   raise exception 'ride_voucher_unavailable'; end if;
 insert into private.ride_benefits(environment,owner_id,funding_ref,source,awarded_cents,available_cents,valid_until,restricted_leg)
  values(new.environment,new.payer_id,'voucher:'||p.id,'corporate',cents,cents,upper(new.slot)+interval '30 days',new.id) returning id into made;
 insert into private.ride_voucher_grants(benefit_id,leg_id,program_id,account_id,member_id,cost_center_id,granted_cents)
  values(made,new.id,p.id,a.id,f.member_id,f.cost_center_id,cents);
 return null;
end $$;
-- Named to fire after freeze_ride_funding, which copies the quote's funding to the leg.
create trigger ride_voucher_reserve after insert on public.ride_legs for each row when(new.source_quote_id is not null)
 execute function private.ride_voucher_reserve();

-- Redemption in the payer's own session, composed from the stage-4 calls: the order,
-- then the leg's benefit up to what is available. What is left stays on the same
-- order for the method chosen here. A replay answers the first result.
create function public.ride_redeem_voucher(p_leg uuid,p_method text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); g private.ride_voucher_grants; b private.ride_benefits; o private.ride_payment_orders;
 u private.ride_benefit_uses; cents int; opened uuid;
begin
 if p_leg is null or p_method is null or p_method not in ('pix','card') then raise exception 'invalid_input'; end if;
 select x.* into g from private.ride_voucher_grants x join public.ride_legs l on l.id=x.leg_id
  where x.leg_id=p_leg and l.payer_id=me and x.member_id=me and l.environment=private.ride_env();
 if not found then raise exception 'ride_voucher_unavailable'; end if;
 opened:=public.ride_open_payment_order(p_leg,p_method);
 select * into strict o from private.ride_payment_orders where id=opened;
 select * into u from private.ride_benefit_uses where order_id=o.id;
 if not found then
   select * into strict b from private.ride_benefits where id=g.benefit_id;
   cents:=least(b.available_cents,o.amount_cents);
   if cents<=0 or b.valid_until<=now() then raise exception 'ride_voucher_unavailable'; end if;
   perform public.ride_apply_order_benefit(o.id,b.id,cents);
   select * into strict u from private.ride_benefit_uses where order_id=o.id;
 elsif u.benefit_id<>g.benefit_id then raise exception 'ride_operation_conflict'; end if;
 return jsonb_build_object('order_id',o.id,'applied_cents',u.applied_cents,'remainder_cents',o.amount_cents-u.applied_cents);
end $$;

-- What a manager reads: date, cost center, person, class and the company's cents by
-- the month in which they moved. Never a place, a route or the rider's own top-up.
create function public.ride_org_report(p_account uuid,p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a private.ride_accounts; v_month date:=date_trunc('month',coalesce(p_month,private.ride_month(now()))::timestamp)::date; answer jsonb;
begin
 perform private.require_ride_feature('module');
 a:=private.ride_require_account_role(p_account,array['admin','manager']);
 if a.kind<>'organization' then raise exception 'invalid_input'; end if;
 with moved as (
   select g.leg_id,l.pickup_at,c.code,c.label,coalesce(pr.full_name,'Conta encerrada') as person,
     (select coalesce(e->>'ride_class',e->>'class_code') from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) e
       where q.id=l.source_quote_id and (e->>'seq')::int=l.quote_seq) as ride_class,
     coalesce((select sum((ev.data->>'cents')::int) from private.ride_benefit_uses u join private.ride_order_events ev on ev.order_id=u.order_id
       where u.benefit_id=g.benefit_id and ev.action='benefit' and private.ride_month(ev.at)=v_month),0)::int as used,
     coalesce((select sum((ev.data->>'cents')::int) from private.ride_benefit_uses u join private.ride_order_events ev on ev.order_id=u.order_id
       where u.benefit_id=g.benefit_id and ev.action='benefit_refund' and private.ride_month(ev.at)=v_month),0)::int as refunded,
     case when l.status<>'cancelled' and b.valid_until>now() and private.ride_month(l.pickup_at)=v_month
       and not exists(select from private.ride_benefit_uses u where u.benefit_id=g.benefit_id) then b.awarded_cents else 0 end as reserved
   from private.ride_voucher_grants g join public.ride_legs l on l.id=g.leg_id join private.ride_benefits b on b.id=g.benefit_id
   left join private.ride_cost_centers c on c.id=g.cost_center_id left join public.profiles pr on pr.id=g.member_id and pr.deleted_at is null
   where g.account_id=a.id
 ), shown as (select * from moved where used>0 or refunded>0 or reserved>0)
 select jsonb_build_object('account_id',a.id,'month',v_month,
   'rows',(select coalesce(jsonb_agg(jsonb_build_object('date',private.sp_date(s.pickup_at),'cost_center',s.code,'cost_center_label',s.label,'member',s.person,
       'ride_class',s.ride_class,'voucher_cents',s.used,'refunded_cents',s.refunded,'reserved_cents',s.reserved) order by s.pickup_at,s.leg_id),'[]'::jsonb) from shown s),
   'by_cost_center',(select coalesce(jsonb_agg(jsonb_build_object('cost_center',t.code,'cost_center_label',t.label,'voucher_cents',t.used,'refunded_cents',t.refunded,
       'net_cents',t.used-t.refunded) order by t.code),'[]'::jsonb)
     from (select s.code,s.label,sum(s.used)::bigint as used,sum(s.refunded)::bigint as refunded from shown s group by s.code,s.label having sum(s.used)>0 or sum(s.refunded)>0) t),
   'voucher_cents',(select coalesce(sum(s.used),0) from shown s),'refunded_cents',(select coalesce(sum(s.refunded),0) from shown s),
   'reserved_cents',(select coalesce(sum(s.reserved),0) from shown s),'invoice',null) into answer;
 return answer;
end $$;

-- Organization rows of the caller's account list gain what the role may read: cost
-- centers, programs (budget and commitment only for who manages) and authorizations.
create function private.ride_organization_sections(p_account uuid,p_me uuid,p_role text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'cost_centers',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'code',c.code,'label',c.label,'active',c.active) order by c.code),'[]'::jsonb)
    from private.ride_cost_centers c where c.account_id=p_account),
  'programs',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',p.label,'enabled',p.enabled,
      'budget_cents',case when p_role in ('admin','manager') then p.budget_cents end,
      'committed_cents',case when p_role in ('admin','manager') then private.ride_voucher_commitment(p.id,null) end,
      'ride_value_cents',p.ride_value_cents,'member_limit_cents',p.member_limit_cents,'areas',to_jsonb(p.areas),'classes',to_jsonb(p.classes),
      'group_tag',p.group_tag,'valid_from',lower(p.validity),'valid_until',upper(p.validity),'excess_payer',p.excess_payer,
      'requires_approval',p.requires_approval) order by p.created_at,p.id),'[]'::jsonb)
    from private.ride_voucher_programs p where p.account_id=p_account and p.environment=private.ride_env()
      and (p_role is distinct from 'member' or (p.enabled and (p.group_tag is null or p.group_tag is not distinct from
        (select m.group_tag from private.ride_account_members m where m.account_id=p_account and m.member_id=p_me))))),
  'grants',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'program_id',g.program_id,'cost_center_id',g.cost_center_id,
      'beneficiary',coalesce(pr.full_name,case when g.beneficiary_id is null then 'Convidado(a)' else 'Conta encerrada' end),'purpose',g.purpose,
      'status',case when g.status in ('requested','approved') and upper(g.validity)<=now() then 'expired' else g.status end,
      'valid_from',lower(g.validity),'valid_until',upper(g.validity),'guest',g.guest,'mine',g.beneficiary_id is not distinct from p_me)
      order by g.created_at desc,g.id),'[]'::jsonb)
    from (select * from private.ride_trip_grants x where x.account_id=p_account
       and (x.beneficiary_id=p_me or x.issued_by=p_me or p_role in ('admin','approver')) order by x.created_at desc,x.id limit 50) g
    left join public.profiles pr on pr.id=g.beneficiary_id and pr.deleted_at is null))
$$;
alter function public.ride_my_accounts() rename to ride_my_accounts_before_business;
alter function public.ride_my_accounts_before_business() set schema private;
create function public.ride_my_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); d jsonb:=private.ride_my_accounts_before_business(); items jsonb;
begin
 items:=case jsonb_typeof(d) when 'array' then d when 'object' then d->'accounts' end;
 if jsonb_typeof(items) is distinct from 'array' or not exists(select from jsonb_array_elements(items) x where x->>'kind'='organization') then return d; end if;
 select coalesce(jsonb_agg(case when e.item->>'kind'='organization'
     then e.item||private.ride_organization_sections((e.item->>'id')::uuid,me,e.item->>'role') else e.item end order by e.pos),'[]'::jsonb)
   into items from jsonb_array_elements(items) with ordinality e(item,pos);
 return case when jsonb_typeof(d)='array' then items else d||jsonb_build_object('accounts',items) end;
end $$;

revoke all on function private.ride_organization(uuid,text[]),private.ride_voucher_commitment(uuid,uuid),private.ride_voucher_plan(private.ride_voucher_programs,jsonb,int),
 private.ride_find_guest_invite(text),private.ride_voucher_reserve(),private.ride_organization_sections(uuid,uuid,text),private.ride_my_accounts_before_business()
 from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.ride_create_organization(text,uuid)'::regprocedure,'public.ride_set_member_role(uuid,uuid,text,text)'::regprocedure,
  'public.ride_save_cost_center(uuid,text,text,boolean)'::regprocedure,
  'public.admin_save_ride_voucher_program(uuid,uuid,text,int,int,int,text[],text[],text,timestamptz,timestamptz,text,boolean,text,text,boolean)'::regprocedure,
  'public.ride_request_trip_grant(uuid,uuid,uuid,text,timestamptz,timestamptz,uuid)'::regprocedure,'public.ride_decide_trip_grant(uuid,boolean)'::regprocedure,
  'public.ride_invite_guest(uuid,uuid,uuid,text,jsonb,timestamptz,int,uuid)'::regprocedure,'public.ride_revoke_guest_invite(uuid)'::regprocedure,
  'public.ride_answer_guest_invite(text,boolean,uuid)'::regprocedure,'public.ride_quote_funded(uuid,timestamptz,jsonb,uuid,uuid,uuid)'::regprocedure,
  'public.ride_redeem_voucher(uuid,text)'::regprocedure,'public.ride_org_report(uuid,date)'::regprocedure,'public.ride_my_accounts()'::regprocedure] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
