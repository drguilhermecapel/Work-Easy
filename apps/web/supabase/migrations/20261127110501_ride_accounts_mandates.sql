-- O17 stage 5 core (PAR-501..508). The passenger is always the account that quotes;
-- a payer mandate or a corporate funding row only changes who pays. Everything ships
-- closed: the gate holds simulation rows with fictitious evidence and no live row.
--
-- Contracts for the later stage-5 files (all private, called from security definer RPCs):
--  ride_party_allowed(env,capability,origin,destination,until)        gate; null areas mean "any area"
--  ride_open_account(kind,name,limit,method,key) -> uuid              account + owner as 'admin' (idempotent per owner/key)
--  ride_require_account_role(account,roles[]) -> ride_accounts        raises ride_account_role_required
--  ride_account_verified(ride_accounts) -> boolean                    family needs none; others need a current reference
--  ride_issue_account_invite(account,role,email,minutes,key) -> jsonb {id,token,expires_at}; token only on first call
--  ride_consume_account_invite(token,accept) -> ride_account_invites  confirmed e-mail must match; raises ride_invite_unavailable
--  ride_grant_mandate(kind,rider,payer,ceiling,uses,until) -> uuid    sponsor/companion standing authorization
--  ride_apply_mandate(quote,mandate) -> ride_quotes                   right after public.ride_quote, in the rider's session
--  ride_requote_legs(quote,legs,required[]) -> ride_quotes            the only post-insert rewrite of a quote
--  ride_fund_voucher_quote(quote,account,program,cost_center,grant,planned) -> ride_quote_funding  rider stays payer
--  ride_quote_funding.planned = {"<quote seq>":{"voucher_cents":n,"excess_cents":n}}; the leg copy keeps its own
--  object. ride_quote_view and ride_dashboard already render both tables, so later files do not wrap them again.
create table private.ride_party_rules (
 environment text not null references private.ride_network(environment), area text not null check(length(trim(area)) between 1 and 80),
 capability text not null check(capability in ('delegated_ride','family','companion','dependent','organization','voucher','invoice','fleet')),
 evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160), valid_until timestamptz not null,
 enabled boolean not null default false, primary key(environment,area,capability)
);
insert into private.ride_party_rules(environment,area,capability,evidence_ref,valid_until,enabled)
 select 'simulation',a.area,c.capability,'ficticio-o17-e5','infinity',true
 from (select origin as area from private.ride_routes where environment='simulation' union select destination from private.ride_routes where environment='simulation'
   union select area from private.ride_route_areas where environment='simulation') a
 cross join unnest(array['delegated_ride','family','companion','dependent','organization','voucher','invoice','fleet']) c(capability);
create function private.ride_party_allowed(p_env text,p_capability text,p_origin text,p_destination text,p_until timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select from unnest(array[p_origin,p_destination]) with ordinality t(area,n)
   where (t.area is not null or (t.n=1 and p_origin is null and p_destination is null))
     and not exists(select from private.ride_party_rules r where r.environment=p_env and r.capability=p_capability and r.enabled
       and (t.area is null or r.area=t.area) and r.valid_until>=greatest(now(),coalesce(p_until,now()))))
$$;
create function private.ride_party_hash(variadic p_parts text[]) returns bytea language sql immutable set search_path='' as $$
 select sha256(convert_to(array_to_string(p_parts,chr(31),''),'UTF8'))
$$;
create function private.ride_month(p_at timestamptz) returns date language sql stable set search_path='' as $$
 select date_trunc('month',p_at at time zone 'America/Sao_Paulo')::date
$$;

-- One account abstraction for family, organization and fleet. Membership is by
-- adhesion: an invite names a confirmed e-mail by hash and never stores it.
create table private.ride_accounts (
 id uuid primary key default gen_random_uuid(), environment text not null references private.ride_network(environment),
 kind text not null check(kind in ('family','organization','fleet')), owner_id uuid not null references private.ride_subjects(id),
 name text not null check(length(trim(name)) between 1 and 80), status text not null default 'active' check(status in ('active','closed')),
 verification_ref text check(length(trim(verification_ref)) between 1 and 160), verified_until timestamptz, verified_by uuid,
 monthly_limit_cents int check(monthly_limit_cents between 0 and 100000000), default_method text check(default_method in ('pix','card')),
 request_key uuid not null, request_hash bytea not null, created_at timestamptz not null default now(), unique(owner_id,request_key)
);
create table private.ride_account_members (
 account_id uuid not null references private.ride_accounts(id), member_id uuid not null references private.ride_subjects(id),
 role text not null check(role in ('admin','member','operator','approver','manager','fleet_driver')),
 status text not null default 'active' check(status in ('active','removed')),
 member_limit_cents int check(member_limit_cents between 0 and 100000000), group_tag text check(length(trim(group_tag)) between 1 and 40),
 joined_at timestamptz not null default now(), removed_at timestamptz, removed_by uuid, removal_key uuid, primary key(account_id,member_id)
);
create index ride_account_members_member on private.ride_account_members(member_id) where status='active';
create table private.ride_account_invites (
 id uuid primary key, account_id uuid not null references private.ride_accounts(id),
 role text not null check(role in ('admin','member','operator','approver','manager','fleet_driver')),
 token_hash bytea not null unique, recipient_hash bytea not null, request_hash bytea not null,
 issued_by uuid not null references private.ride_subjects(id), expires_at timestamptz not null,
 status text not null default 'pending' check(status in ('pending','accepted','declined','expired','revoked')),
 member_id uuid, answered_at timestamptz, created_at timestamptz not null default now()
);
create index ride_account_invites_account on private.ride_account_invites(account_id,status);
create index ride_account_invites_issuer on private.ride_account_invites(issued_by,created_at);
create table private.ride_payer_mandates (
 id uuid primary key default gen_random_uuid(), environment text not null references private.ride_network(environment),
 kind text not null check(kind in ('sponsor','family','companion')), account_id uuid references private.ride_accounts(id),
 rider_id uuid not null references private.ride_subjects(id), payer_id uuid not null references private.ride_subjects(id),
 ceiling_cents int check(ceiling_cents>0), uses_max int check(uses_max>0),
 status text not null default 'active' check(status in ('active','used','revoked')), valid_until timestamptz,
 created_at timestamptz not null default now(), revoked_at timestamptz,
 check(rider_id<>payer_id), check((kind='family')=(account_id is not null))
);
create unique index ride_family_mandate on private.ride_payer_mandates(account_id,rider_id) where status='active' and account_id is not null;
create index ride_payer_mandates_rider on private.ride_payer_mandates(rider_id,status);
create index ride_payer_mandates_payer on private.ride_payer_mandates(payer_id,status);
-- Funding is declared on the quote and frozen on each leg at creation. A later
-- route amendment changes the leg's source quote; the frozen row keeps the origin.
create table private.ride_quote_funding (
 quote_id uuid primary key references private.ride_quotes(id) on delete cascade, kind text not null check(kind in ('payer','voucher')),
 mandate_id uuid references private.ride_payer_mandates(id), account_id uuid references private.ride_accounts(id),
 member_id uuid not null references private.ride_subjects(id), payer_id uuid not null references private.ride_subjects(id),
 program_id uuid, cost_center_id uuid, grant_id uuid, planned jsonb not null default '{}' check(jsonb_typeof(planned)='object'), month date not null,
 check(kind<>'payer' or mandate_id is not null), check(kind<>'voucher' or account_id is not null)
);
create index ride_quote_funding_account on private.ride_quote_funding(account_id) where account_id is not null;
create index ride_quote_funding_mandate on private.ride_quote_funding(mandate_id) where mandate_id is not null;
create table private.ride_leg_funding (
 leg_id uuid primary key references public.ride_legs(id), quote_id uuid not null, kind text not null check(kind in ('payer','voucher')),
 mandate_id uuid references private.ride_payer_mandates(id), account_id uuid references private.ride_accounts(id),
 member_id uuid not null references private.ride_subjects(id), payer_id uuid not null references private.ride_subjects(id),
 program_id uuid, cost_center_id uuid, grant_id uuid, planned jsonb not null default '{}' check(jsonb_typeof(planned)='object'), month date not null
);
create index ride_leg_funding_account on private.ride_leg_funding(account_id,month) where account_id is not null;
create index ride_leg_funding_member on private.ride_leg_funding(member_id);
do $$ declare t text; begin
 foreach t in array array['ride_party_rules','ride_accounts','ride_account_members','ride_account_invites','ride_payer_mandates','ride_quote_funding','ride_leg_funding'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

create function private.ride_account_verified(a private.ride_accounts) returns boolean language sql stable set search_path='' as $$
 select a.status='active' and (a.kind='family' or (a.verification_ref is not null and coalesce(a.verified_until>now(),false)))
$$;
create function private.ride_require_account_role(p_account uuid,p_roles text[]) returns private.ride_accounts
language plpgsql stable security definer set search_path='' as $$
declare a private.ride_accounts; me uuid:=auth.uid();
begin
 if not private.ride_active_user(me) then raise exception 'not_allowed'; end if;
 select acc.* into a from private.ride_accounts acc join private.ride_account_members m on m.account_id=acc.id
  where acc.id=p_account and acc.environment=private.ride_env() and acc.status='active' and m.member_id=me and m.status='active' and m.role=any(p_roles);
 if not found then raise exception 'ride_account_role_required'; end if;
 return a;
end $$;
create function private.ride_open_account(p_kind text,p_name text,p_limit int,p_method text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); env text:=private.ride_env(); a private.ride_accounts; h bytea;
begin
 if p_kind is null or p_kind not in ('family','organization','fleet') or p_key is null or p_name is null or length(trim(p_name)) not between 1 and 80
   or p_limit not between 0 and 100000000 or p_method not in ('pix','card') then raise exception 'invalid_input'; end if;
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

-- Same single-use token scheme as ride_share_invite: 32 random bytes returned once,
-- only sha256(token) and sha256(token||lower(email)) are stored.
create function private.ride_issue_account_invite(p_account uuid,p_role text,p_email text,p_minutes int,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); i private.ride_account_invites; token text:=encode(extensions.gen_random_bytes(32),'hex'); h bytea;
begin
 if not private.ride_active_user(me) then raise exception 'not_allowed'; end if;
 if p_key is null or p_account is null or p_role is null or p_role not in ('admin','member','operator','approver','manager','fleet_driver')
   or p_minutes is null or p_minutes not between 5 and 10080 or p_email is null or length(p_email)>254
   or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(p_key::text,p_account::text,p_role,p_minutes::text,lower(trim(p_email)));
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
create function private.ride_find_account_invite(p_token text) returns private.ride_account_invites
language sql stable security definer set search_path='' as $$
 select i from private.ride_account_invites i join auth.users u on u.id=auth.uid()
 where p_token ~ '^[a-f0-9]{64}$' and i.token_hash=sha256(convert_to(p_token,'UTF8'))
   and i.recipient_hash=sha256(convert_to(p_token||lower(trim(u.email)),'UTF8')) and u.email_confirmed_at is not null
$$;
create function private.ride_consume_account_invite(p_token text,p_accept boolean) returns private.ride_account_invites
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
   insert into private.ride_account_members(account_id,member_id,role) values(a.id,me,i.role)
    on conflict(account_id,member_id) do update set status='active',role=excluded.role,joined_at=now(),removed_at=null
    where private.ride_account_members.status='removed';
   if a.kind='family' and exists(select from private.ride_account_members where account_id=a.id and member_id=me and role='member')
      and not exists(select from private.ride_payer_mandates where account_id=a.id and rider_id=me and status='active') then
     insert into private.ride_payer_mandates(environment,kind,account_id,rider_id,payer_id) values(a.environment,'family',a.id,me,a.owner_id);
   end if;
 end if;
 update private.ride_account_invites set status=desired,member_id=me,answered_at=now() where id=i.id returning * into i;
 return i;
end $$;
create function private.ride_grant_mandate(p_kind text,p_rider uuid,p_payer uuid,p_ceiling int,p_uses int,p_until timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare created uuid;
begin
 if p_kind is null or p_kind not in ('sponsor','companion') or p_rider is null or p_payer is null or p_rider=p_payer
   or not private.ride_active_user(p_rider) or not private.ride_active_user(p_payer) or p_ceiling<=0 or p_uses<=0 or p_until<=now() then raise exception 'invalid_input'; end if;
 insert into private.ride_payer_mandates(environment,kind,rider_id,payer_id,ceiling_cents,uses_max,valid_until)
  values(private.ride_env(),p_kind,p_rider,p_payer,p_ceiling,p_uses,p_until) returning id into created;
 return created;
end $$;

-- Commitment is computed, never counted: fares of the month's live legs plus the
-- unexpired quotes other members still hold. A rider's own pending quotes never
-- block a new one; the same sum is checked again when each leg is created.
create function private.ride_account_commitment(p_account uuid,p_member uuid,p_month date,p_rider uuid) returns bigint
language sql stable security definer set search_path='' as $$
 select coalesce((select sum(l.fare_cents) from private.ride_leg_funding f join public.ride_legs l on l.id=f.leg_id
    where f.account_id=p_account and f.kind='payer' and l.status<>'cancelled' and private.ride_month(l.pickup_at)=p_month
      and (p_member is null or f.member_id=p_member)),0)
  +coalesce((select sum((e->>'fare_cents')::int) from private.ride_quote_funding f join private.ride_quotes q on q.id=f.quote_id
    cross join lateral jsonb_array_elements(q.legs) e
    where f.account_id=p_account and f.kind='payer' and q.status='awaiting_consent' and q.expires_at>now()
      and f.member_id is distinct from p_rider and (p_member is null or f.member_id=p_member)
      and private.ride_month((e->>'pickup_at')::timestamptz)=p_month),0)
$$;

-- One rewrite point for a fresh quote. Itinerary, time and measured route never
-- change here; a demand-priced leg keeps its fare so price_rules stay coherent.
create function private.ride_requote_legs(p_quote uuid,p_legs jsonb,p_required uuid[]) returns private.ride_quotes
language plpgsql security definer set search_path='' as $$
declare q private.ride_quotes; was jsonb; item jsonb; i int; total bigint:=0;
begin
 select * into q from private.ride_quotes where id=p_quote and environment=private.ride_env() for update;
 if not found or q.status<>'awaiting_consent' or q.expires_at<=now() or exists(select from private.ride_consents where quote_id=q.id) then
   raise exception 'quote_unavailable'; end if;
 if jsonb_typeof(p_legs) is distinct from 'array' or jsonb_array_length(p_legs)<>jsonb_array_length(q.legs) or pg_column_size(p_legs)>16384
   or p_required is null or cardinality(p_required) not between 1 and 4 or not coalesce(q.passenger_id=any(p_required),false)
   or (select count(distinct u) from unnest(p_required) u)<>cardinality(p_required)
   or exists(select from unnest(p_required) u where not private.ride_active_user(u)) then raise exception 'invalid_input'; end if;
 for i in 0..jsonb_array_length(q.legs)-1 loop
   was:=q.legs->i; item:=p_legs->i;
   if jsonb_typeof(item) is distinct from 'object'
     or exists(select from unnest(array['seq','origin','destination','pickup_at','route_id','duration_minutes','meters']) k where (item->k) is distinct from (was->k))
     or not coalesce((item->>'fare_cents')::int>0 and (item->>'fee_cents')::int>=0 and (item->>'driver_cents')::int>=0
       and (item->>'fee_cents')::int+(item->>'driver_cents')::int=(item->>'fare_cents')::int
       and (item->>'extras_cents')::int between 0 and (item->>'fare_cents')::int and (item->>'payer_id')::uuid=any(p_required),false)
     or (q.price_rules ? (was->>'seq') and ((item->'fare_cents') is distinct from (was->'fare_cents') or (item->'extras_cents') is distinct from (was->'extras_cents')))
   then raise exception 'invalid_input'; end if;
   total:=total+(item->>'fare_cents')::int;
 end loop;
 update private.ride_quotes set legs=p_legs,required_users=p_required,total_cents=total where id=q.id returning * into q;
 return q;
end $$;

-- The rider quotes; the mandate swaps the payer and records the payer's standing
-- consent, bounded by the ceiling or by the account limits. Lock order: account,
-- mandate, quote. An exception here rolls back the quote created by the caller.
create function private.ride_apply_mandate(p_quote uuid,p_mandate uuid) returns private.ride_quotes
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); env text:=private.ride_env(); m private.ride_payer_mandates; q private.ride_quotes; f private.ride_quote_funding;
 a private.ride_accounts; mem private.ride_account_members; e jsonb; legs jsonb:='[]'; slice record; cap text;
begin
 if not private.ride_active_user(me) or p_quote is null or p_mandate is null then raise exception 'not_allowed'; end if;
 select * into m from private.ride_payer_mandates where id=p_mandate and environment=env and rider_id=me;
 if not found then raise exception 'not_allowed'; end if;
 select * into q from private.ride_quotes where id=p_quote and environment=env and actor_id=me and passenger_id=me and booking_id is null;
 if not found then raise exception 'not_allowed'; end if;
 select * into f from private.ride_quote_funding where quote_id=q.id;
 if found then
   if f.mandate_id is distinct from m.id then raise exception 'idempotency_conflict'; end if;
   return q;
 end if;
 -- The same key first used for a plain quote is a different request.
 if q.created_at<>now() then raise exception 'idempotency_conflict'; end if;
 if m.account_id is not null then
   select * into strict a from private.ride_accounts where id=m.account_id for update;
   select * into mem from private.ride_account_members where account_id=a.id and member_id=me;
 end if;
 select * into strict m from private.ride_payer_mandates where id=p_mandate for update;
 if m.status<>'active' or m.valid_until<=now() or not private.ride_active_user(m.payer_id)
   or (m.account_id is not null and (a.status<>'active' or mem.status is distinct from 'active')) then raise exception 'ride_mandate_revoked'; end if;
 if (select count(*) from private.ride_quote_funding x join private.ride_quotes o on o.id=x.quote_id where x.mandate_id=m.id
      and (o.status='requested' or (o.status='awaiting_consent' and o.expires_at>now())))>=m.uses_max then raise exception 'ride_limit_exceeded'; end if;
 select * into strict q from private.ride_quotes where id=p_quote for update;
 if q.status<>'awaiting_consent' or q.expires_at<=now() then raise exception 'quote_unavailable'; end if;
 if q.total_cents>m.ceiling_cents then raise exception 'ride_limit_exceeded'; end if;
 cap:=case m.kind when 'sponsor' then 'delegated_ride' else m.kind end;
 for e in select value from jsonb_array_elements(q.legs) loop
   if not private.ride_party_allowed(env,cap,e->>'origin',e->>'destination',
      (e->>'pickup_at')::timestamptz+make_interval(mins=>(e->>'duration_minutes')::int)) then raise exception 'ride_feature_disabled'; end if;
   legs:=legs||jsonb_build_array(e||jsonb_build_object('payer',m.kind,'payer_id',m.payer_id));
 end loop;
 if m.account_id is not null then
   for slice in select private.ride_month((x->>'pickup_at')::timestamptz) as month,sum((x->>'fare_cents')::int) as cents
     from jsonb_array_elements(q.legs) x group by 1 loop
     if private.ride_account_commitment(a.id,null,slice.month,me)+slice.cents>a.monthly_limit_cents
       or private.ride_account_commitment(a.id,me,slice.month,me)+slice.cents>mem.member_limit_cents then raise exception 'ride_limit_exceeded'; end if;
   end loop;
 end if;
 q:=private.ride_requote_legs(q.id,legs,array[me,m.payer_id]);
 insert into private.ride_consents(quote_id,actor_id,accepted,at) values(q.id,m.payer_id,true,now());
 insert into private.ride_quote_funding(quote_id,kind,mandate_id,account_id,member_id,payer_id,month)
  values(q.id,'payer',m.id,m.account_id,me,m.payer_id,private.ride_month((q.legs->0->>'pickup_at')::timestamptz));
 return q;
end $$;

-- Corporate funding keeps the rider as payer; the quote only declares who funds
-- which cents. Idempotent per quote; nothing is reserved before the leg exists.
create function private.ride_fund_voucher_quote(p_quote uuid,p_account uuid,p_program uuid,p_cost_center uuid,p_grant uuid,p_planned jsonb)
returns private.ride_quote_funding language plpgsql security definer set search_path='' as $$
declare q private.ride_quotes; f private.ride_quote_funding;
begin
 select * into q from private.ride_quotes where id=p_quote and environment=private.ride_env() for update;
 if not found or p_account is null or jsonb_typeof(p_planned) is distinct from 'object' then raise exception 'invalid_input'; end if;
 select * into f from private.ride_quote_funding where quote_id=q.id;
 if found then
   if (f.kind,f.account_id,f.program_id,f.cost_center_id,f.grant_id,f.planned) is distinct from ('voucher',p_account,p_program,p_cost_center,p_grant,p_planned) then
     raise exception 'idempotency_conflict'; end if;
   return f;
 end if;
 if q.status<>'awaiting_consent' or q.expires_at<=now() or q.booking_id is not null or q.actor_id<>q.passenger_id then raise exception 'quote_unavailable'; end if;
 insert into private.ride_quote_funding(quote_id,kind,account_id,member_id,payer_id,program_id,cost_center_id,grant_id,planned,month)
  values(q.id,'voucher',p_account,q.passenger_id,q.passenger_id,p_program,p_cost_center,p_grant,p_planned,private.ride_month((q.legs->0->>'pickup_at')::timestamptz))
  returning * into f;
 return f;
end $$;

-- Revocation, removal and a lowered limit are enforced where the obligation is
-- born: no leg is created for a mandate that stopped being valid meanwhile.
create function private.ride_funding_guard() returns trigger language plpgsql security definer set search_path='' as $$
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
 end if;
 if f.kind='payer' and f.account_id is not null then
   v_month:=private.ride_month(new.pickup_at);
   if private.ride_account_commitment(a.id,null,v_month,f.member_id)+new.fare_cents>a.monthly_limit_cents
     or private.ride_account_commitment(a.id,f.member_id,v_month,f.member_id)+new.fare_cents>mem.member_limit_cents then raise exception 'ride_limit_exceeded'; end if;
 end if;
 return new;
end $$;
create trigger ride_funding_when_requested before insert on public.ride_legs for each row
 when(new.status='requested' and new.source_quote_id is not null) execute function private.ride_funding_guard();
create function private.freeze_ride_funding() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.ride_leg_funding(leg_id,quote_id,kind,mandate_id,account_id,member_id,payer_id,program_id,cost_center_id,grant_id,planned,month)
 select new.id,f.quote_id,f.kind,f.mandate_id,f.account_id,f.member_id,f.payer_id,f.program_id,f.cost_center_id,f.grant_id,
   coalesce(f.planned->(new.quote_seq::text),case when jsonb_array_length(q.legs)=1 and f.planned ?| array['voucher_cents','excess_cents'] then f.planned end,'{}'::jsonb),
   private.ride_month(new.pickup_at)
 from private.ride_quote_funding f join private.ride_quotes q on q.id=f.quote_id
 where f.quote_id=coalesce(new.source_quote_id,(select r.quote_id from public.rides r where r.id=new.ride_id));
 return null;
end $$;
create trigger freeze_ride_funding after insert on public.ride_legs for each row execute function private.freeze_ride_funding();
-- A route amendment may raise the fare with the payer's explicit consent, yet
-- never beyond what the account authorized for the month.
create function private.ride_funding_fare_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare f private.ride_leg_funding; a private.ride_accounts; cap int; v_month date:=private.ride_month(new.pickup_at); held int;
begin
 select * into f from private.ride_leg_funding where leg_id=new.id and kind='payer' and account_id is not null;
 if not found or new.status='cancelled' then return new; end if;
 held:=case when old.status<>'cancelled' and private.ride_month(old.pickup_at)=v_month then old.fare_cents else 0 end;
 if new.fare_cents<=held then return new; end if;
 select * into strict a from private.ride_accounts where id=f.account_id for update;
 select member_limit_cents into cap from private.ride_account_members where account_id=a.id and member_id=f.member_id;
 if private.ride_account_commitment(a.id,null,v_month,f.member_id)-held+new.fare_cents>a.monthly_limit_cents
   or private.ride_account_commitment(a.id,f.member_id,v_month,f.member_id)-held+new.fare_cents>cap then raise exception 'ride_limit_exceeded'; end if;
 return new;
end $$;
create trigger ride_funding_fare_change before update of fare_cents,pickup_at on public.ride_legs for each row
 when(new.fare_cents>old.fare_cents or new.pickup_at is distinct from old.pickup_at) execute function private.ride_funding_fare_guard();
-- A single-use mandate is spent when its quote becomes a ride.
create function private.ride_mandate_use() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.ride_payer_mandates m set status='used' from private.ride_quote_funding f
 where f.quote_id=new.id and m.id=f.mandate_id and m.status='active' and m.uses_max is not null
   and (select count(*) from private.ride_quote_funding x join private.ride_quotes o on o.id=x.quote_id where x.mandate_id=m.id and o.status='requested')>=m.uses_max;
 return null;
end $$;
create trigger ride_mandate_use after update of status on private.ride_quotes for each row
 when(new.status='requested' and old.status is distinct from new.status) execute function private.ride_mandate_use();

create function public.ride_quote_sponsored(p_key uuid,p_scheduled_at timestamptz,p_legs jsonb,p_mandate uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('quote'); v jsonb; q private.ride_quotes;
begin
 if p_mandate is null then raise exception 'invalid_input'; end if;
 if not exists(select from private.ride_payer_mandates where id=p_mandate and environment=private.ride_env() and rider_id=me) then raise exception 'not_allowed'; end if;
 v:=public.ride_quote(p_key,null,p_scheduled_at,p_legs);
 q:=private.ride_apply_mandate((v->>'id')::uuid,p_mandate);
 return private.ride_quote_view(q,me);
end $$;

create function public.ride_create_family(p_name text,p_monthly_limit int,p_method text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin return private.ride_open_account('family',p_name,p_monthly_limit,p_method,p_key); end $$;
create function public.ride_invite_member(p_account uuid,p_email text,p_role text,p_minutes int,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; mine text;
begin
 a:=private.ride_require_account_role(p_account,array['admin','manager']);
 select role into strict mine from private.ride_account_members where account_id=a.id and member_id=me;
 if p_role is null or not (case a.kind when 'family' then p_role='member' when 'organization' then p_role in ('member','operator','approver','manager')
     else p_role in ('manager','fleet_driver') end) or (mine<>'admin' and p_role not in ('member','fleet_driver')) then raise exception 'invalid_input'; end if;
 if not private.ride_account_verified(a) or not private.ride_party_allowed(a.environment,a.kind,null,null,now()) then raise exception 'ride_feature_disabled'; end if;
 return private.ride_issue_account_invite(a.id,p_role,p_email,p_minutes,p_key);
end $$;
create function public.ride_account_invite(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i private.ride_account_invites;
begin
 if not private.ride_active_user(auth.uid()) then return null; end if;
 i:=private.ride_find_account_invite(p_token);
 return (select jsonb_build_object('id',i.id,'account_name',a.name,'kind',a.kind,'role',i.role,'expires_at',i.expires_at,'simulation',a.environment='simulation')
   from private.ride_accounts a where a.id=i.account_id and a.environment=private.ride_env() and a.status='active' and i.status='pending' and i.expires_at>now());
end $$;
create function public.ride_join_account(p_token text,p_accept boolean) returns text
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_ride_feature('module');
 return (private.ride_consume_account_invite(p_token,p_accept)).status;
end $$;
create function public.ride_revoke_account_invite(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module');
begin
 update private.ride_account_invites i set status='revoked',answered_at=now() where i.id=p_id and i.status='pending'
   and (i.issued_by=me or exists(select from private.ride_account_members m where m.account_id=i.account_id and m.member_id=me and m.status='active' and m.role='admin'));
 return found;
end $$;
create function public.ride_set_member_limit(p_account uuid,p_member uuid,p_cents int) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_ride_feature('module');
 perform private.ride_require_account_role(p_account,array['admin']);
 if p_member is null or p_cents not between 0 and 100000000 then raise exception 'invalid_input'; end if;
 perform 1 from private.ride_accounts where id=p_account for update;
 update private.ride_account_members set member_limit_cents=p_cents where account_id=p_account and member_id=p_member and status='active';
 if not found then raise exception 'invalid_input'; end if;
 return true;
end $$;
create function public.ride_set_account_limit(p_account uuid,p_cents int,p_method text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_ride_feature('module');
 perform private.ride_require_account_role(p_account,array['admin']);
 if p_cents not between 0 and 100000000 or p_method not in ('pix','card') then raise exception 'invalid_input'; end if;
 perform 1 from private.ride_accounts where id=p_account for update;
 update private.ride_accounts set monthly_limit_cents=p_cents,default_method=p_method where id=p_account;
 return true;
end $$;
-- Removal closes future access only. Legs, orders and frozen funding stay as they are.
create function public.ride_remove_member(p_account uuid,p_member uuid,p_key uuid) returns boolean
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
 return true;
end $$;
create function public.ride_my_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
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
     from private.ride_account_members o left join public.profiles p on p.id=o.member_id and p.deleted_at is null where o.account_id=a.id) else '[]'::jsonb end,
   'invites',case when manage.yes then (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'role',i.role,'expires_at',i.expires_at,
       'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end) order by i.created_at desc),'[]'::jsonb)
     from (select * from private.ride_account_invites x where x.account_id=a.id order by x.created_at desc limit 20) i) else '[]'::jsonb end)
   order by a.created_at,a.id),'[]'::jsonb)
  from private.ride_accounts a join private.ride_account_members m on m.account_id=a.id and m.member_id=me and m.status='active'
  cross join lateral (select m.role in ('admin','manager') as yes) manage
  where a.environment=env and a.status='active');
end $$;
-- The administrator reads every row with its fare and the payer's order; a member
-- reads only their own trips, without prices. Places are never part of a statement.
create function public.ride_account_statement(p_account uuid,p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; mine private.ride_account_members; manage boolean;
 v_month date:=date_trunc('month',coalesce(p_month,private.ride_month(now()))::timestamp)::date; lines jsonb; total bigint;
begin
 a:=private.ride_require_account_role(p_account,array['admin','member','operator','approver','manager','fleet_driver']);
 select * into strict mine from private.ride_account_members where account_id=a.id and member_id=me;
 manage:=mine.role='admin';
 select coalesce(jsonb_agg(jsonb_build_object('leg_id',l.id,'ride_id',l.ride_id,'member_id',f.member_id,'member_name',case when manage then p.full_name end,
     'date',private.sp_date(l.pickup_at),'pickup_at',l.pickup_at,'status',l.status,'counted',l.status<>'cancelled',
     'fare_cents',case when manage then l.fare_cents end,'order_id',case when manage and f.payer_id=me then o.id end,
     'order_status',case when manage then o.status end,'received_cents',case when manage then o.received_cents end,
     'refunded_cents',case when manage then o.refunded_cents end) order by l.pickup_at,l.id),'[]'::jsonb),
   coalesce(sum(l.fare_cents) filter(where l.status<>'cancelled'),0)
 into lines,total
 from private.ride_leg_funding f join public.ride_legs l on l.id=f.leg_id
 left join public.profiles p on p.id=f.member_id and p.deleted_at is null
 left join private.ride_payment_orders o on o.leg_id=l.id and o.payer=f.payer_id and o.component='fare'
 where f.account_id=a.id and f.kind='payer' and private.ride_month(l.pickup_at)=v_month and (manage or f.member_id=me);
 return jsonb_build_object('account_id',a.id,'month',v_month,'role',mine.role,'default_method',a.default_method,
   'monthly_limit_cents',case when manage then a.monthly_limit_cents end,'member_limit_cents',mine.member_limit_cents,
   'total_cents',case when manage then total end,'rows',lines);
end $$;
-- Organizations and fleets operate only with a reviewed, dated reference. The
-- reviewer may not vouch for an account they belong to. A null date withdraws it.
create function public.admin_verify_ride_account(p_account uuid,p_reference text,p_until timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare a private.ride_accounts;
begin
 perform private.require_ride_finance_admin();
 select * into a from private.ride_accounts where id=p_account and environment=private.ride_env() for update;
 if not found or a.kind='family' or a.status<>'active' or p_reference is null or length(trim(p_reference)) not between 1 and 160
   or p_until<=now() or p_until>now()+interval '13 months' then raise exception 'invalid_input'; end if;
 if exists(select from private.ride_account_members where account_id=a.id and member_id=auth.uid() and status='active') then raise exception 'not_allowed'; end if;
 update private.ride_accounts set verification_ref=trim(p_reference),verified_until=coalesce(p_until,now()),verified_by=auth.uid() where id=a.id;
 perform private.audit('ride.account_verify','ride_accounts',a.id::text,jsonb_build_object('kind',a.kind,'reference',trim(p_reference),'until',p_until,'environment',a.environment));
 return p_until is not null;
end $$;

-- Views. A funded quote or leg tells the rider and the payer who they are to it.
-- The payer keeps price and receipt and never the route; the rider keeps the route
-- and never the price. Planned voucher cents follow the price visibility.
-- Quote: "funding" {kind,mandate_kind,role:'rider'|'payer',account_id,account_name,voucher_cents?,excess_cents?}, legs gain
-- voucher_cents/excess_cents, total_cents is null for who pays nothing. Dashboard legs: the same "funding" (role may be
-- 'operator') and "payer" becomes the mandate kind ('sponsor'|'family'|'companion'). Unfunded output is unchanged.
create function private.ride_planned(p_planned jsonb,p_seq text,p_legs int) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_strip_nulls(jsonb_build_object('voucher_cents',x.v->'voucher_cents','excess_cents',x.v->'excess_cents'))
 from (select coalesce(p_planned->p_seq,case when p_legs=1 then p_planned end,'{}'::jsonb) as v) x
$$;
create function private.ride_funding_view(p_kind text,p_mandate uuid,p_account uuid,p_role text,p_planned jsonb) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('kind',p_kind,'mandate_kind',(select m.kind from private.ride_payer_mandates m where m.id=p_mandate),'role',p_role,
   'account_id',p_account,'account_name',(select a.name from private.ride_accounts a where a.id=p_account))||coalesce(p_planned,'{}'::jsonb)
$$;
alter function private.ride_quote_view(private.ride_quotes,uuid) rename to ride_quote_view_before_parties;
create function private.ride_quote_view(q private.ride_quotes,p_uid uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare v jsonb:=private.ride_quote_view_before_parties(q,p_uid); f private.ride_quote_funding; n int; pays boolean; items jsonb; planned jsonb;
begin
 select * into f from private.ride_quote_funding where quote_id=q.id;
 if not found then return v; end if;
 n:=jsonb_array_length(q.legs);
 pays:=exists(select from jsonb_array_elements(q.legs) e where (e->>'payer_id')::uuid=p_uid);
 select coalesce(jsonb_agg(case when e.l->>'fare_cents' is null then e.l else e.l||private.ride_planned(f.planned,e.l->>'seq',n) end order by e.pos),'[]'::jsonb)
   into items from jsonb_array_elements(case when jsonb_typeof(v->'legs')='array' then v->'legs' else '[]'::jsonb end) with ordinality e(l,pos);
 select jsonb_strip_nulls(jsonb_build_object('voucher_cents',sum((x.p->>'voucher_cents')::int),'excess_cents',sum((x.p->>'excess_cents')::int))) into planned
   from (select private.ride_planned(f.planned,e->>'seq',n) as p from jsonb_array_elements(q.legs) e) x;
 return v||jsonb_build_object('legs',items)||case when pays then '{}'::jsonb else jsonb_build_object('total_cents',null) end
   ||jsonb_build_object('funding',case when p_uid=q.passenger_id or p_uid=f.payer_id then private.ride_funding_view(f.kind,f.mandate_id,f.account_id,
       case when p_uid=q.passenger_id then 'rider' else 'payer' end,case when pays then planned end) end);
end $$;
alter function public.ride_dashboard() rename to ride_dashboard_before_parties;
revoke all on function public.ride_dashboard_before_parties() from public,anon,authenticated,service_role;
create function public.ride_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb:=public.ride_dashboard_before_parties(); u uuid:=auth.uid(); admin boolean:=public.is_admin(); journeys jsonb;
begin
 if not exists(select from jsonb_array_elements(d->'rides') r
     cross join lateral jsonb_array_elements(case when jsonb_typeof(r->'legs')='array' then r->'legs' else '[]'::jsonb end) l
     join private.ride_leg_funding f on f.leg_id=(l->>'id')::uuid) then return d; end if;
 select coalesce(jsonb_agg(r.item||jsonb_build_object('legs',nested.items) order by r.pos),'[]'::jsonb) into journeys
 from jsonb_array_elements(d->'rides') with ordinality r(item,pos)
 cross join lateral(select coalesce(jsonb_agg(case when f.leg_id is null or part.role is null then e.item else
     e.item||jsonb_build_object('payer',coalesce(m.kind,e.item->>'payer'),'funding',private.ride_funding_view(f.kind,f.mandate_id,f.account_id,part.role,
       case when u=f.payer_id or admin then private.ride_planned(f.planned,null,1) end)) end order by e.pos),'[]'::jsonb) items
   from jsonb_array_elements(case when jsonb_typeof(r.item->'legs')='array' then r.item->'legs' else '[]'::jsonb end) with ordinality e(item,pos)
   left join private.ride_leg_funding f on f.leg_id=(e.item->>'id')::uuid
   left join private.ride_payer_mandates m on m.id=f.mandate_id
   cross join lateral(select case when (r.item->>'passenger_id')::uuid=u then 'rider' when f.payer_id=u then 'payer' when admin then 'operator' end as role) part) nested;
 return d||jsonb_build_object('rides',journeys);
end $$;

revoke all on function private.ride_party_allowed(text,text,text,text,timestamptz),private.ride_party_hash(text[]),private.ride_month(timestamptz),
 private.ride_account_verified(private.ride_accounts),private.ride_require_account_role(uuid,text[]),private.ride_open_account(text,text,int,text,uuid),
 private.ride_issue_account_invite(uuid,text,text,int,uuid),private.ride_find_account_invite(text),private.ride_consume_account_invite(text,boolean),
 private.ride_grant_mandate(text,uuid,uuid,int,int,timestamptz),private.ride_account_commitment(uuid,uuid,date,uuid),
 private.ride_requote_legs(uuid,jsonb,uuid[]),private.ride_apply_mandate(uuid,uuid),private.ride_fund_voucher_quote(uuid,uuid,uuid,uuid,uuid,jsonb),private.ride_funding_guard(),private.freeze_ride_funding(),
 private.ride_funding_fare_guard(),private.ride_mandate_use(),private.ride_planned(jsonb,text,int),private.ride_funding_view(text,uuid,uuid,text,jsonb),
 private.ride_quote_view_before_parties(private.ride_quotes,uuid),private.ride_quote_view(private.ride_quotes,uuid) from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.ride_quote_sponsored(uuid,timestamptz,jsonb,uuid)'::regprocedure,'public.ride_create_family(text,int,text,uuid)'::regprocedure,
  'public.ride_invite_member(uuid,text,text,int,uuid)'::regprocedure,'public.ride_account_invite(text)'::regprocedure,'public.ride_join_account(text,boolean)'::regprocedure,
  'public.ride_revoke_account_invite(uuid)'::regprocedure,'public.ride_set_member_limit(uuid,uuid,int)'::regprocedure,
  'public.ride_set_account_limit(uuid,int,text)'::regprocedure,'public.ride_remove_member(uuid,uuid,uuid)'::regprocedure,'public.ride_my_accounts()'::regprocedure,
  'public.ride_account_statement(uuid,date)'::regprocedure,'public.admin_verify_ride_account(uuid,text,timestamptz)'::regprocedure,
  'public.ride_dashboard()'::regprocedure] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
