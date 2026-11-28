-- O17 follow-up (DD118, 28/11/2026): ownership of a family, organization or fleet can be handed over.
--  1. The owner names other admins (ride_set_account_admin) and hands the account to one of them
--     (ride_transfer_account, idempotent per key, audited). The old owner stays as an admin member;
--     an organization or fleet keeps its verification, a family keeps its limits.
--  2. When the owner deletes the profile, the earliest-joined active admin receives the account
--     (audited) instead of the account being closed; with no other admin it closes as before.
--  3. A family's standing payer is its owner: the old owner's family mandates are revoked, quotes
--     still waiting on them are superseded, and each active rider, the old owner included, gets a
--     mandate of the new owner.
--  4. Role 'admin' no longer means "owner": only the owner demotes or removes another admin, and only
--     the owner registers dependents and acts as their guardian (DD116). A family whose owner still
--     guards a pending or reviewed dependent is not handed over until the dependent is withdrawn.
-- Legs, leg funding, orders, invoices and every other financial row are never touched.
create table private.ride_account_transfers (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references private.ride_accounts(id),
 environment text not null references private.ride_network(environment),
 from_owner uuid not null references private.ride_subjects(id), to_owner uuid not null references private.ride_subjects(id),
 reason text not null check(reason in ('owner','erasure')), request_key uuid, request_hash bytea,
 created_at timestamptz not null default now(), check(from_owner<>to_owner),
 check((reason='owner')=(request_key is not null and request_hash is not null)), unique(from_owner,request_key)
);
create index ride_account_transfers_account on private.ride_account_transfers(account_id,created_at);
create index ride_account_transfers_to on private.ride_account_transfers(to_owner,created_at);
alter table private.ride_account_transfers enable row level security;
revoke all on private.ride_account_transfers from public,anon,authenticated,service_role;

-- Who receives the account when p_leaving goes: the earliest-joined active admin with a live profile.
create function private.ride_account_successor(p_account uuid,p_leaving uuid) returns uuid language sql stable security definer set search_path='' as $$
 select m.member_id from private.ride_account_members m
 where m.account_id=p_account and m.member_id<>p_leaving and m.status='active' and m.role='admin' and private.ride_active_user(m.member_id)
 order by m.joined_at,m.member_id limit 1
$$;

-- The one place ownership moves. Caller holds the account row lock.
create function private.ride_handover_account(p_account uuid,p_to uuid,p_reason text,p_key uuid,p_hash bytea) returns private.ride_account_transfers
language plpgsql security definer set search_path='' as $$
declare a private.ride_accounts; x private.ride_account_transfers; gone uuid[];
begin
 select * into strict a from private.ride_accounts where id=p_account;
 update private.ride_accounts set owner_id=p_to where id=a.id;
 update private.ride_account_members set role='admin' where account_id=a.id and member_id=a.owner_id and status='active' and role<>'admin';
 if a.kind='family' then
   with r as (update private.ride_payer_mandates set status='revoked',revoked_at=now()
     where account_id=a.id and kind='family' and status='active' and payer_id=a.owner_id returning id)
   select coalesce(array_agg(id),'{}') into gone from r;
   update private.ride_quotes q set status='superseded' from private.ride_quote_funding f
    where f.quote_id=q.id and f.mandate_id=any(gone) and q.status='awaiting_consent';
   insert into private.ride_payer_mandates(environment,kind,account_id,rider_id,payer_id)
    select a.environment,'family',a.id,m.member_id,p_to from private.ride_account_members m
    where m.account_id=a.id and m.status='active' and m.member_id not in (p_to,a.owner_id) and private.ride_active_user(m.member_id)
      and exists(select from private.ride_payer_mandates d where d.id=any(gone) and d.rider_id=m.member_id);
   -- The previous owner stays an admin and rides on the family like every other admin.
   insert into private.ride_payer_mandates(environment,kind,account_id,rider_id,payer_id)
    select a.environment,'family',a.id,a.owner_id,p_to where private.ride_active_user(a.owner_id)
      and exists(select from private.ride_account_members m where m.account_id=a.id and m.member_id=a.owner_id and m.status='active')
      and not exists(select from private.ride_payer_mandates d where d.account_id=a.id and d.rider_id=a.owner_id and d.status='active');
 end if;
 insert into private.ride_account_transfers(account_id,environment,from_owner,to_owner,reason,request_key,request_hash)
  values(a.id,a.environment,a.owner_id,p_to,p_reason,p_key,p_hash) returning * into x;
 perform private.audit('ride.account_transfer','ride_accounts',a.id::text,
   jsonb_build_object('kind',a.kind,'from',a.owner_id,'to',p_to,'reason',p_reason,'environment',a.environment,'transfer',x.id));
 return x;
end $$;

create function public.ride_transfer_account(p_account uuid,p_new_owner uuid,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; x private.ride_account_transfers; h bytea;
begin
 if p_account is null or p_new_owner is null or p_key is null then raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(p_account::text,p_new_owner::text);
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into x from private.ride_account_transfers where from_owner=me and request_key=p_key;
 if found then
   if x.request_hash<>h then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('id',x.id,'account_id',x.account_id,'owner_id',x.to_owner,'transferred_at',x.created_at);
 end if;
 a:=private.ride_require_account_role(p_account,array['admin']);
 select * into strict a from private.ride_accounts where id=a.id for update;
 if a.owner_id<>me or a.status<>'active' then raise exception 'ride_account_owner_required'; end if;
 if p_new_owner=me or not exists(select from private.ride_account_members m where m.account_id=a.id and m.member_id=p_new_owner
     and m.status='active' and m.role='admin' and private.ride_active_user(m.member_id)) then raise exception 'ride_transfer_target_invalid'; end if;
 -- Guardianship is the owner's and does not move with the account (DD116).
 if exists(select from private.ride_dependents d where d.account_id=a.id and d.guardian_id=me and d.status in ('pending','verified')) then
   raise exception 'ride_transfer_dependents_open'; end if;
 if (select count(*) from private.ride_accounts where owner_id=p_new_owner and kind=a.kind and environment=a.environment and status='active')>=5 then
   raise exception 'rate_limited'; end if;
 x:=private.ride_handover_account(a.id,p_new_owner,'owner',p_key,h);
 return jsonb_build_object('id',x.id,'account_id',x.account_id,'owner_id',x.to_owner,'transferred_at',x.created_at);
end $$;

-- The owner names or removes another admin; an admin who is not the owner may step down.
-- A family admin keeps riding on the family; one who steps down gets the family mandate back.
create function public.ride_set_account_admin(p_account uuid,p_member uuid,p_admin boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; m private.ride_account_members; back text;
begin
 if p_account is null or p_member is null or p_admin is null then raise exception 'invalid_input'; end if;
 a:=private.ride_require_account_role(p_account,array['admin']);
 select * into strict a from private.ride_accounts where id=a.id for update;
 if a.owner_id<>me and not (p_member=me and not p_admin) then raise exception 'ride_account_owner_required'; end if;
 if p_member=a.owner_id then raise exception 'invalid_input'; end if;
 select * into m from private.ride_account_members where account_id=a.id and member_id=p_member and status='active' for update;
 if not found or not private.ride_active_user(p_member) then raise exception 'invalid_input'; end if;
 back:=case a.kind when 'fleet' then 'manager' else 'member' end;
 if p_admin then
   if m.role='admin' then return true; end if;
   if not (case a.kind when 'family' then m.role='member' when 'organization' then m.role in ('member','operator','approver','manager')
       else m.role='manager' end) then raise exception 'invalid_input'; end if;
   update private.ride_account_members set role='admin' where account_id=a.id and member_id=p_member;
 else
   if m.role<>'admin' then return true; end if;
   update private.ride_account_members set role=back where account_id=a.id and member_id=p_member;
   if a.kind='family' and not exists(select from private.ride_payer_mandates where account_id=a.id and rider_id=p_member and status='active') then
     insert into private.ride_payer_mandates(environment,kind,account_id,rider_id,payer_id) values(a.environment,'family',a.id,p_member,a.owner_id);
   end if;
 end if;
 perform private.audit('ride.account_admin','ride_accounts',a.id::text,
   jsonb_build_object('kind',a.kind,'member',p_member,'admin',p_admin,'environment',a.environment));
 return true;
end $$;

-- What the deletion of the caller's profile does to each account the caller owns.
create function public.ride_erasure_account_plan() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if not private.ride_active_user(me) then return '[]'::jsonb; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,'name',a.name,
     'outcome',case when s.id is null then 'close' else 'transfer' end,'successor_id',s.id,'successor_name',p.full_name) order by a.created_at,a.id),'[]'::jsonb)
  from private.ride_accounts a cross join lateral (select private.ride_account_successor(a.id,me) as id) s
  left join public.profiles p on p.id=s.id and p.deleted_at is null
  where a.owner_id=me and a.status='active' and a.environment=private.ride_env());
end $$;

-- Owner rows list the admins who may receive the account and who would receive it on deletion;
-- every row says when the account came to the caller in the last 30 days.
alter function public.ride_my_accounts() rename to ride_my_accounts_before_transfer;
alter function public.ride_my_accounts_before_transfer() set schema private;
create function public.ride_my_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); d jsonb:=private.ride_my_accounts_before_transfer(); items jsonb;
begin
 items:=case jsonb_typeof(d) when 'array' then d when 'object' then d->'accounts' end;
 if jsonb_typeof(items) is distinct from 'array' then return d; end if;
 select coalesce(jsonb_agg(e.item||jsonb_build_object(
     'owner_candidates',case when a.owner_id=me then (select coalesce(jsonb_agg(jsonb_build_object('member_id',m.member_id,'name',p.full_name,'joined_at',m.joined_at)
         order by m.joined_at,m.member_id),'[]'::jsonb)
       from private.ride_account_members m left join public.profiles p on p.id=m.member_id and p.deleted_at is null
       where m.account_id=a.id and m.member_id<>me and m.status='active' and m.role='admin' and private.ride_active_user(m.member_id)) else '[]'::jsonb end,
     'successor_id',case when a.owner_id=me then private.ride_account_successor(a.id,me) end,
     'transferred',(select jsonb_build_object('at',x.created_at,'reason',x.reason) from private.ride_account_transfers x
       where x.account_id=a.id and x.to_owner=me and a.owner_id=me and x.created_at>now()-interval '30 days' order by x.created_at desc,x.id limit 1))
   order by e.pos),'[]'::jsonb)
  into items from jsonb_array_elements(items) with ordinality e(item,pos) left join private.ride_accounts a on a.id=(e.item->>'id')::uuid;
 return case when jsonb_typeof(d)='array' then items else d||jsonb_build_object('accounts',items) end;
end $$;

-- The opener's replay of the create call still answers the account after it was handed over.
alter function private.ride_open_account(text,text,int,text,uuid) rename to ride_open_account_before_transfer;
create function private.ride_open_account(p_kind text,p_name text,p_limit int,p_method text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts;
begin
 if p_key is not null and p_kind is not null and p_name is not null then
   select acc.* into a from private.ride_accounts acc where acc.request_key=p_key and acc.owner_id<>me
     and (select x.from_owner from private.ride_account_transfers x where x.account_id=acc.id order by x.created_at,x.id limit 1)=me;
   if found then
     if a.request_hash<>private.ride_party_hash(p_kind,trim(p_name),p_limit::text,p_method) then raise exception 'idempotency_conflict'; end if;
     return a.id;
   end if;
 end if;
 return private.ride_open_account_before_transfer(p_kind,p_name,p_limit,p_method,p_key);
end $$;

-- Deletion of the owner's profile. Runs before erase_ride_parties (trigger names sort), which then
-- finds the account owned by someone else and only ends the leaving person's membership.
create function private.ride_handover_on_erasure() returns trigger language plpgsql security definer set search_path='' as $$
declare acct record; heir uuid;
begin
 for acct in select id from private.ride_accounts where owner_id=new.id and status='active' order by id for update loop
   heir:=private.ride_account_successor(acct.id,new.id);
   if heir is not null then perform private.ride_handover_account(acct.id,heir,'erasure',null,null); end if;
 end loop;
 return null;
end $$;
create trigger erase_ride_owner_handover after update of deleted_at on public.profiles for each row when(new.deleted_at is not null and old.deleted_at is null)
 execute function private.ride_handover_on_erasure();

-- Only the owner demotes another admin of a company. The account row is locked before reading the role.
alter function public.ride_set_member_role(uuid,uuid,text,text) rename to ride_set_member_role_before_transfer;
alter function public.ride_set_member_role_before_transfer(uuid,uuid,text,text) set schema private;
create function public.ride_set_member_role(p_account uuid,p_member uuid,p_role text,p_group text) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts;
begin
 a:=private.ride_organization(p_account,array['admin']);
 select * into strict a from private.ride_accounts where id=a.id for update;
 if a.owner_id<>me and exists(select from private.ride_account_members m where m.account_id=a.id and m.member_id=p_member and m.status='active' and m.role='admin') then
   raise exception 'ride_account_owner_required'; end if;
 return private.ride_set_member_role_before_transfer(p_account,p_member,p_role,p_group);
end $$;

-- Only the owner removes another admin. Checked after the removal, under the account lock the removal
-- holds, so a promotion that commits in between is seen; a replay answers as before.
alter function public.ride_remove_member(uuid,uuid,uuid) rename to ride_remove_member_before_transfer;
alter function public.ride_remove_member_before_transfer(uuid,uuid,uuid) set schema private;
create function public.ride_remove_member(p_account uuid,p_member uuid,p_key uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); replay boolean; r boolean;
begin
 replay:=exists(select from private.ride_account_members where removed_by=me and removal_key=p_key);
 r:=private.ride_remove_member_before_transfer(p_account,p_member,p_key);
 if r and not replay and exists(select from private.ride_account_members m join private.ride_accounts a on a.id=m.account_id
     where m.account_id=p_account and m.member_id=p_member and m.removed_by=me and m.removal_key=p_key and m.role='admin' and a.owner_id<>me) then
   raise exception 'ride_account_owner_required'; end if;
 return r;
end $$;

-- DD116: only the owner of the family registers a dependent and acts as guardian.
alter function public.ride_register_dependent(uuid,text,text,text,uuid) rename to ride_register_dependent_before_transfer;
alter function public.ride_register_dependent_before_transfer(uuid,text,text,text,uuid) set schema private;
create function public.ride_register_dependent(p_account uuid,p_label text,p_age_band text,p_legal_basis text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; replay boolean; r uuid;
begin
 replay:=exists(select from private.ride_dependents where guardian_id=me and request_key=p_key);
 if not replay and p_account is not null then
   a:=private.ride_require_account_role(p_account,array['admin']);
   if a.owner_id<>me then raise exception 'ride_account_owner_required'; end if;
 end if;
 r:=private.ride_register_dependent_before_transfer(p_account,p_label,p_age_band,p_legal_basis,p_key);
 -- The inner call holds the account lock: a handover that committed meanwhile is seen here.
 if not replay and (select owner_id from private.ride_accounts where id=p_account)<>me then raise exception 'ride_account_owner_required'; end if;
 return r;
end $$;

-- Where the trip is born the guardian must still be the owner of the dependent's family.
create or replace function private.ride_minor_leg_created() returns trigger language plpgsql security definer set search_path='' as $$
declare x private.ride_quote_dependents; d private.ride_dependents; v_end timestamptz:=upper(new.slot);
begin
 select * into x from private.ride_quote_dependents where quote_id=coalesce(new.source_quote_id,(select r.quote_id from public.rides r where r.id=new.ride_id));
 if not found then
   select new.source_quote_id,o.dependent_id,o.guardian_id,o.consented_at into x from private.ride_leg_dependents o where o.leg_id=new.replaces_id;
   if not found then return new; end if;
 end if;
 if tg_when='AFTER' then
   insert into private.ride_leg_dependents(leg_id,dependent_id,guardian_id,consented_at) values(new.id,x.dependent_id,x.guardian_id,x.consented_at);
   return null;
 end if;
 select * into d from private.ride_dependents where id=x.dependent_id;
 if not found or d.status<>'verified' or d.valid_until<private.sp_date(v_end)
   or not exists(select from public.rides r where r.id=new.ride_id and r.passenger_id=d.guardian_id and private.ride_active_user(r.passenger_id))
   or not exists(select from private.ride_accounts a join private.ride_account_members m on m.account_id=a.id and m.member_id=d.guardian_id
     where a.id=d.account_id and a.status='active' and a.owner_id=d.guardian_id and m.status='active' and m.role='admin')
   or not private.ride_party_allowed(new.environment,'dependent',new.origin,new.destination,v_end)
   or not private.ride_minor_allowed(new.environment,d.age_band,new.origin,new.destination,v_end) then raise exception 'ride_minor_unavailable'; end if;
 return new;
end $$;

revoke all on function private.ride_set_member_role_before_transfer(uuid,uuid,text,text),private.ride_remove_member_before_transfer(uuid,uuid,uuid),
 private.ride_register_dependent_before_transfer(uuid,text,text,text,uuid),private.ride_minor_leg_created() from public,anon,authenticated,service_role;
revoke all on function public.ride_set_member_role(uuid,uuid,text,text),public.ride_remove_member(uuid,uuid,uuid),
 public.ride_register_dependent(uuid,text,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.ride_set_member_role(uuid,uuid,text,text),public.ride_remove_member(uuid,uuid,uuid),
 public.ride_register_dependent(uuid,text,text,text,uuid) to authenticated;

revoke all on function private.ride_account_successor(uuid,uuid),private.ride_handover_account(uuid,uuid,text,uuid,bytea),
 private.ride_my_accounts_before_transfer(),private.ride_open_account(text,text,int,text,uuid),private.ride_open_account_before_transfer(text,text,int,text,uuid),
 private.ride_handover_on_erasure() from public,anon,authenticated,service_role;
revoke all on function public.ride_transfer_account(uuid,uuid,uuid),public.ride_set_account_admin(uuid,uuid,boolean),public.ride_erasure_account_plan(),
 public.ride_my_accounts() from public,anon,authenticated,service_role;
grant execute on function public.ride_transfer_account(uuid,uuid,uuid),public.ride_set_account_admin(uuid,uuid,boolean),public.ride_erasure_account_plan(),
 public.ride_my_accounts() to authenticated;
