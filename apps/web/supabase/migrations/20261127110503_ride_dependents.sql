-- PAR-504 (O17 stage 5): an adolescent travels under a guardian. A minor never has an
-- account: the guardian is the passenger of record, quotes, pays and declares on each
-- quote that a reviewed dependent travels. What is kept about the minor is a label, an
-- age band and reference codes: no birth date and no document. Ships closed: only
-- simulation policy rows with a fictitious reference are seeded; live has none.
--
-- Contracts for the later stage-5 files (all private):
--  ride_minor_can_serve(driver,leg)  a leg that carries a dependent needs a cleared driver through its end
--  ride_party_can_serve(driver,leg)  extension point read by ride_offer_eligible; a replacement must keep the call above
--  ride_dependents_view(guardian)    the guardian's dependents and their legs as jsonb (my accounts, export)
--  purge_ride_minors()               retention of everything below; purge_ride_safety() already calls it
create table private.ride_minor_policies (
 environment text not null references private.ride_network(environment), area text not null check(length(trim(area)) between 1 and 80),
 age_band text not null check(age_band in ('13-15','16-17')), opinion_ref text not null check(length(trim(opinion_ref)) between 1 and 160),
 insurance_ref text not null check(length(trim(insurance_ref)) between 1 and 160), valid_until timestamptz not null,
 enabled boolean not null default false, primary key(environment,area,age_band)
);
insert into private.ride_minor_policies(environment,area,age_band,opinion_ref,insurance_ref,valid_until,enabled)
 select 'simulation',a.area,b.band,'ficticio-o17-e5','ficticio-o17-e5','infinity',true
 from (select origin as area from private.ride_routes where environment='simulation' union select destination from private.ride_routes where environment='simulation'
   union select area from private.ride_route_areas where environment='simulation') a cross join unnest(array['13-15','16-17']) b(band);
create table private.ride_dependents (
 id uuid primary key default gen_random_uuid(), environment text not null references private.ride_network(environment),
 account_id uuid not null references private.ride_accounts(id) on delete cascade, guardian_id uuid not null references private.ride_subjects(id),
 label text not null check(length(trim(label)) between 1 and 40), age_band text not null check(age_band in ('13-15','16-17')),
 legal_basis_ref text not null check(legal_basis_ref in ('parental_authority','guardianship')),
 evidence_ref text check(evidence_ref ~ '^[A-Za-z0-9_-]{4,80}$'), verified_by uuid, valid_until date,
 status text not null default 'pending' check(status in ('pending','verified','rejected','expired')),
 request_key uuid not null, request_hash bytea not null, created_at timestamptz not null default now(), reviewed_at timestamptz,
 unique(guardian_id,request_key), check((status in ('verified','expired'))=(valid_until is not null)),
 check(status='pending' or (evidence_ref is not null and verified_by is not null and reviewed_at is not null))
);
create index ride_dependents_account on private.ride_dependents(account_id);
create table private.ride_minor_driver_clearances (
 driver_id uuid primary key references public.ride_drivers(id) on delete cascade, evidence_ref text not null check(evidence_ref ~ '^[A-Za-z0-9_-]{4,80}$'),
 valid_until timestamptz not null, granted_by uuid, granted_at timestamptz not null default now()
);
-- The declaration lives on the quote and is frozen on each leg at creation. Deleting
-- a dependent removes its links, so nothing here can outlive the minor's record.
create table private.ride_quote_dependents (
 quote_id uuid primary key references private.ride_quotes(id) on delete cascade, dependent_id uuid not null references private.ride_dependents(id) on delete cascade,
 guardian_id uuid not null references private.ride_subjects(id), consented_at timestamptz not null default now()
);
create table private.ride_leg_dependents (
 leg_id uuid primary key references public.ride_legs(id) on delete cascade, dependent_id uuid not null references private.ride_dependents(id) on delete cascade,
 guardian_id uuid not null references private.ride_subjects(id), consented_at timestamptz not null
);
create index ride_quote_dependents_dependent on private.ride_quote_dependents(dependent_id);
create index ride_leg_dependents_dependent on private.ride_leg_dependents(dependent_id);
create table private.ride_minor_alerts (
 leg_id uuid not null references public.ride_legs(id) on delete cascade,
 kind text not null check(kind in ('route_deviation','stale_signal','long_stop','unexpected_end','emergency')),
 at timestamptz not null default now(), seen_at timestamptz not null default now(), escalated_protocol uuid, primary key(leg_id,kind)
);
create table private.ride_minor_access_log (
 id bigint generated always as identity primary key, actor uuid not null, dependent_id uuid not null,
 purpose text not null check(purpose in ('review','queue')), at timestamptz not null default now()
);
create index ride_minor_access_log_at on private.ride_minor_access_log(at);
do $$ declare t text; begin
 foreach t in array array['ride_minor_policies','ride_dependents','ride_minor_driver_clearances','ride_quote_dependents','ride_leg_dependents','ride_minor_alerts','ride_minor_access_log'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

-- Legal opinion and insurance must cover the age band at both ends of the leg, through its end.
create function private.ride_minor_allowed(p_env text,p_band text,p_origin text,p_destination text,p_until timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select p_band is not null and p_origin is not null and p_destination is not null
   and not exists(select from unnest(array[p_origin,p_destination]) a(area) where not exists(select from private.ride_minor_policies p
     where p.environment=p_env and p.area=a.area and p.age_band=p_band and p.enabled and p.valid_until>=greatest(now(),coalesce(p_until,now()))))
$$;
create function private.ride_minor_can_serve(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select from private.ride_leg_dependents x where x.leg_id=l.id)
   or exists(select from private.ride_minor_driver_clearances c where c.driver_id=p_driver and c.valid_until>=greatest(now(),upper(l.slot),upper(l.driver_slot)))
$$;
create function private.ride_party_can_serve(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select private.ride_minor_can_serve(p_driver,l)
$$;
alter function private.ride_offer_eligible(uuid,public.ride_legs) rename to ride_before_parties_eligible;
create function private.ride_offer_eligible(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select private.ride_party_can_serve(p_driver,l) and private.ride_before_parties_eligible(p_driver,l)
$$;

-- Leg creation. The declaration comes from the consented quote, or from the cancelled
-- leg being replaced, so a requote never drops the protection silently. Everything
-- that authorized the quote is checked again where the trip is born.
create function private.ride_minor_leg_created() returns trigger language plpgsql security definer set search_path='' as $$
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
     where a.id=d.account_id and a.status='active' and m.status='active' and m.role='admin')
   or not private.ride_party_allowed(new.environment,'dependent',new.origin,new.destination,v_end)
   or not private.ride_minor_allowed(new.environment,d.age_band,new.origin,new.destination,v_end) then raise exception 'ride_minor_unavailable'; end if;
 return new;
end $$;
create trigger ride_minor_when_requested before insert on public.ride_legs for each row when(new.status='requested')
 execute function private.ride_minor_leg_created();
-- Named to run before ride_wave_new: the first wave must already see the declaration.
create trigger freeze_ride_dependent after insert on public.ride_legs for each row execute function private.ride_minor_leg_created();
-- Assignment outside the offer path and any later change of place or window (route
-- amendment) meet the same rules. Named to run before the other assignment guards.
create function private.ride_minor_leg_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare band text;
begin
 select d.age_band into band from private.ride_leg_dependents x join private.ride_dependents d on d.id=x.dependent_id where x.leg_id=new.id;
 if not found then return new; end if;
 if ((new.origin,new.destination,new.slot) is distinct from (old.origin,old.destination,old.slot)
     and not private.ride_minor_allowed(new.environment,band,new.origin,new.destination,upper(new.slot)))
   or (new.driver_id is not null and not private.ride_minor_can_serve(new.driver_id,new)) then raise exception 'ride_minor_unavailable'; end if;
 return new;
end $$;
create trigger ride_assignment_minor before update of driver_id,origin,destination,slot,driver_slot on public.ride_legs for each row
 when(new.status in ('requested','accepted','arriving','boarded') and (new.driver_id is distinct from old.driver_id or new.origin is distinct from old.origin
   or new.destination is distinct from old.destination or new.slot is distinct from old.slot or new.driver_slot is distinct from old.driver_slot))
 execute function private.ride_minor_leg_guard();

create function private.ride_dependents_view(p_guardian uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'account_id',d.account_id,'label',d.label,'age_band',d.age_band,'legal_basis',d.legal_basis_ref,
   'status',case when d.status='verified' and d.valid_until<private.sp_date(now()) then 'expired' else d.status end,'valid_until',d.valid_until,
   'legs',(select coalesce(jsonb_agg(jsonb_build_object('leg_id',l.id,'status',l.status,'pickup_at',l.pickup_at) order by l.pickup_at desc,l.id),'[]'::jsonb)
     from (select o.id,o.status,o.pickup_at from private.ride_leg_dependents x join public.ride_legs o on o.id=x.leg_id
       where x.dependent_id=d.id order by o.pickup_at desc,o.id limit 10) l)) order by d.created_at,d.id),'[]'::jsonb)
 from private.ride_dependents d where d.guardian_id=p_guardian and d.environment=private.ride_env()
$$;

create function public.ride_register_dependent(p_account uuid,p_label text,p_age_band text,p_legal_basis text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; d private.ride_dependents; h bytea;
begin
 if p_account is null or p_key is null or p_label is null or length(trim(p_label)) not between 1 and 40 or p_age_band is null or p_age_band not in ('13-15','16-17')
   or p_legal_basis is null or p_legal_basis not in ('parental_authority','guardianship') then raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(p_account::text,trim(p_label),p_age_band,p_legal_basis);
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into d from private.ride_dependents where guardian_id=me and request_key=p_key;
 if found then
   if d.request_hash<>h then raise exception 'idempotency_conflict'; end if;
   return d.id;
 end if;
 a:=private.ride_require_account_role(p_account,array['admin']);
 if a.kind<>'family' then raise exception 'invalid_input'; end if;
 if not private.ride_party_allowed(a.environment,'dependent',null,null,now()) then raise exception 'ride_feature_disabled'; end if;
 if not exists(select from auth.users u where u.id=me and (u.email_confirmed_at is not null or u.phone_confirmed_at is not null)) then
   raise exception 'ride_identity_verification_required'; end if;
 perform 1 from private.ride_accounts where id=a.id for update;
 if (select count(*) from private.ride_dependents where account_id=a.id and status in ('pending','verified'))>=6
   or (select count(*) from private.ride_dependents where guardian_id=me and created_at>now()-interval '1 day')>=12 then raise exception 'rate_limited'; end if;
 insert into private.ride_dependents(environment,account_id,guardian_id,label,age_band,legal_basis_ref,request_key,request_hash)
  values(a.environment,a.id,me,trim(p_label),p_age_band,p_legal_basis,p_key,h) returning * into d;
 return d.id;
end $$;
-- The reviewer checks the link, the age and the legal basis outside the system and
-- records only a reference and a date. Each review and each queue reading is logged.
create function public.admin_review_dependent(p_dependent uuid,p_approve boolean,p_evidence text,p_until date) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); d private.ride_dependents; today date:=private.sp_date(now()); verdict text:=case when p_approve then 'verified' else 'rejected' end;
begin
 perform private.require_admin();
 if not private.ride_active_user(me) then raise exception 'not_allowed'; end if;
 select * into d from private.ride_dependents where id=p_dependent and environment=private.ride_env() for update;
 if not found or p_approve is null or p_evidence is null or p_evidence !~ '^[A-Za-z0-9_-]{4,80}$'
   or (p_approve and (p_until is null or p_until<=today or p_until>(today+interval '12 months')::date)) then raise exception 'invalid_input'; end if;
 if d.guardian_id=me or exists(select from private.ride_account_members m where m.account_id=d.account_id and m.member_id=me and m.status='active') then
   raise exception 'not_allowed'; end if;
 insert into private.ride_minor_access_log(actor,dependent_id,purpose) values(me,d.id,'review');
 if (d.status,d.evidence_ref,d.verified_by,d.valid_until) is not distinct from (verdict,p_evidence,me,case when p_approve then p_until end) then return p_approve; end if;
 update private.ride_dependents set status=verdict,evidence_ref=p_evidence,verified_by=me,valid_until=case when p_approve then p_until end,reviewed_at=now() where id=d.id;
 perform private.audit('ride.dependent_review','ride_dependents',d.id::text,jsonb_build_object('approve',p_approve,'evidence',p_evidence,'until',p_until,'environment',d.environment));
 return p_approve;
end $$;
create function public.admin_ride_dependents() returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); result jsonb;
begin
 perform private.require_admin();
 if not private.ride_active_user(me) then raise exception 'not_allowed'; end if;
 with listed as (select d.* from private.ride_dependents d where d.environment=private.ride_env() and (d.status='pending' or d.reviewed_at>now()-interval '7 days')
   order by (d.status='pending') desc,d.created_at,d.id limit 100),
 logged as (insert into private.ride_minor_access_log(actor,dependent_id,purpose) select me,l.id,'queue' from listed l
   where not exists(select from private.ride_minor_access_log o where o.actor=me and o.dependent_id=l.id and o.purpose='queue' and o.at>now()-interval '1 hour'))
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'account_id',l.account_id,'account_name',a.name,'guardian_id',l.guardian_id,'guardian_name',p.full_name,
   'label',l.label,'age_band',l.age_band,'legal_basis',l.legal_basis_ref,'status',l.status,'valid_until',l.valid_until,'evidence_ref',l.evidence_ref,
   'created_at',l.created_at,'reviewed_at',l.reviewed_at) order by (l.status='pending') desc,l.created_at,l.id),'[]'::jsonb) into result
 from listed l join private.ride_accounts a on a.id=l.account_id left join public.profiles p on p.id=l.guardian_id and p.deleted_at is null;
 return result;
end $$;
-- A driver serves a dependent only with a dated clearance. A null date withdraws it.
create function public.admin_set_minor_driver_clearance(p_driver uuid,p_evidence text,p_until timestamptz) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); env text:=private.ride_env();
begin
 perform private.require_admin();
 if not private.ride_active_user(me) or p_driver is null or p_driver=me then raise exception 'not_allowed'; end if;
 if p_evidence is null or p_evidence !~ '^[A-Za-z0-9_-]{4,80}$' or p_until<=now() or p_until>now()+interval '12 months'
   or not exists(select from public.ride_drivers d where d.id=p_driver and d.environment=env and d.status='approved' and private.ride_active_user(d.id)) then
   raise exception 'invalid_input'; end if;
 if p_until is null then delete from private.ride_minor_driver_clearances where driver_id=p_driver;
 else insert into private.ride_minor_driver_clearances(driver_id,evidence_ref,valid_until,granted_by) values(p_driver,p_evidence,p_until,me)
   on conflict(driver_id) do update set evidence_ref=excluded.evidence_ref,valid_until=excluded.valid_until,granted_by=excluded.granted_by,granted_at=now();
 end if;
 perform private.audit('ride.minor_clearance','ride_drivers',p_driver::text,jsonb_build_object('evidence',p_evidence,'until',p_until,'environment',env));
 return p_until is not null;
end $$;

-- The guardian quotes as the passenger of record and accepts this specific trip for
-- this dependent. Price and payer stay as quoted; an exception rolls the quote back.
create function public.ride_quote_for_dependent(p_key uuid,p_scheduled_at timestamptz,p_legs jsonb,p_dependent uuid,p_consent boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('quote'); env text:=private.ride_env(); d private.ride_dependents; q private.ride_quotes; v jsonb; e jsonb;
 v_end timestamptz; tag jsonb;
begin
 if p_dependent is null or p_consent is not true then raise exception 'invalid_input'; end if;
 select * into d from private.ride_dependents where id=p_dependent and guardian_id=me and environment=env;
 if not found then raise exception 'not_allowed'; end if;
 tag:=jsonb_build_object('dependent',jsonb_build_object('id',d.id,'label',d.label,'age_band',d.age_band));
 v:=public.ride_quote(p_key,null,p_scheduled_at,p_legs);
 select * into strict q from private.ride_quotes where id=(v->>'id')::uuid for update;
 if exists(select from private.ride_quote_dependents x where x.quote_id=q.id) then
   if not exists(select from private.ride_quote_dependents x where x.quote_id=q.id and x.dependent_id=d.id) then raise exception 'idempotency_conflict'; end if;
   return v||tag;
 end if;
 -- The same key first used for a plain quote is a different request.
 if q.created_at<>now() or q.status<>'awaiting_consent' or q.passenger_id<>me or exists(select from private.ride_quote_funding f where f.quote_id=q.id) then
   raise exception 'idempotency_conflict'; end if;
 perform private.ride_require_account_role(d.account_id,array['admin']);
 if d.status<>'verified' then raise exception 'ride_minor_unavailable'; end if;
 for e in select value from jsonb_array_elements(q.legs) loop
   v_end:=(e->>'pickup_at')::timestamptz+make_interval(mins=>(e->>'duration_minutes')::int);
   if not private.ride_party_allowed(env,'dependent',e->>'origin',e->>'destination',v_end) then raise exception 'ride_feature_disabled'; end if;
   if d.valid_until<private.sp_date(v_end) or not private.ride_minor_allowed(env,d.age_band,e->>'origin',e->>'destination',v_end) then
     raise exception 'ride_minor_unavailable'; end if;
 end loop;
 insert into private.ride_quote_dependents(quote_id,dependent_id,guardian_id) values(q.id,d.id,me);
 return v||tag;
end $$;
-- The guardian reads the trip as its passenger. A deviation, a silent signal, a long
-- stop or an unexpected end seen on a reading is kept as an alert for the leg.
create function public.ride_guardian_watch(p_leg uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); s jsonb; seen text;
begin
 if not exists(select from private.ride_leg_dependents x join public.ride_legs l on l.id=x.leg_id
   where x.leg_id=p_leg and x.guardian_id=me and l.environment=private.ride_env()) then raise exception 'not_allowed'; end if;
 s:=public.ride_safety_status(p_leg);
 seen:=s->>'wellness';
 if seen in ('route_deviation','stale_signal','long_stop','unexpected_end') then
   insert into private.ride_minor_alerts(leg_id,kind) values(p_leg,seen) on conflict(leg_id,kind) do update set seen_at=now();
 end if;
 return s||jsonb_build_object('alerts',(select coalesce(jsonb_agg(jsonb_build_object('kind',a.kind,'at',a.at,'seen_at',a.seen_at,
   'escalated_protocol',a.escalated_protocol) order by a.at,a.kind),'[]'::jsonb) from private.ride_minor_alerts a where a.leg_id=p_leg));
end $$;
-- Human escalation goes through the staffed safety queue as an emergency case.
create function public.ride_guardian_escalate(p_leg uuid,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); protocol uuid;
begin
 if p_key is null then raise exception 'invalid_input'; end if;
 if not exists(select from private.ride_leg_dependents x join public.ride_legs l on l.id=x.leg_id
   where x.leg_id=p_leg and x.guardian_id=me and l.environment=private.ride_env()) then raise exception 'not_allowed'; end if;
 protocol:=public.ride_safety_case(p_leg,'emergency',p_key);
 if not exists(select from private.ride_minor_alerts where leg_id=p_leg and escalated_protocol=protocol) then
   update private.ride_minor_alerts set escalated_protocol=protocol where leg_id=p_leg and escalated_protocol is null;
   insert into private.ride_minor_alerts(leg_id,kind,escalated_protocol) values(p_leg,'emergency',protocol) on conflict(leg_id,kind) do nothing;
 end if;
 return protocol;
end $$;

-- Dependents ride on the family row of the guardian's own account list.
alter function public.ride_my_accounts() rename to ride_my_accounts_before_dependents;
alter function public.ride_my_accounts_before_dependents() set schema private;
create function public.ride_my_accounts() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); d jsonb:=private.ride_my_accounts_before_dependents(); mine jsonb:=private.ride_dependents_view(me); items jsonb;
begin
 items:=case jsonb_typeof(d) when 'array' then d when 'object' then d->'accounts' end;
 if mine='[]'::jsonb or jsonb_typeof(items) is distinct from 'array' then return d; end if;
 select coalesce(jsonb_agg(case when e.item->>'kind'='family' then e.item||jsonb_build_object('dependents',
     (select coalesce(jsonb_agg(x.dep order by x.pos),'[]'::jsonb) from jsonb_array_elements(mine) with ordinality x(dep,pos) where x.dep->>'account_id'=e.item->>'id'))
   else e.item end order by e.pos),'[]'::jsonb) into items from jsonb_array_elements(items) with ordinality e(item,pos);
 return case when jsonb_typeof(d)='array' then items else d||jsonb_build_object('accounts',items) end;
end $$;

-- Retention: a record leaves 30 days after its validity or its decision, leg links
-- and alerts 30 days after the leg closes, the access log after 12 months.
create function private.purge_ride_minors() returns void language sql security definer set search_path='' as $$
 update private.ride_dependents set status='expired' where status='verified' and valid_until<private.sp_date(now());
 delete from private.ride_dependents where (status in ('verified','expired') and valid_until<private.sp_date(now())-30)
   or (status='rejected' and reviewed_at<now()-interval '30 days') or (status='pending' and created_at<now()-interval '90 days');
 delete from private.ride_leg_dependents x using public.ride_legs l where l.id=x.leg_id and l.status in ('completed','cancelled') and l.updated_at<now()-interval '30 days';
 delete from private.ride_minor_alerts a using public.ride_legs l where l.id=a.leg_id and l.status in ('completed','cancelled') and l.updated_at<now()-interval '30 days';
 delete from private.ride_quote_dependents x using private.ride_quotes q where q.id=x.quote_id and q.created_at<now()-interval '30 days';
 delete from private.ride_minor_driver_clearances where valid_until<now()-interval '30 days';
 delete from private.ride_minor_access_log where at<now()-interval '12 months';
$$;
alter function private.purge_ride_safety() rename to purge_ride_safety_before_minors;
create function private.purge_ride_safety() returns void language sql security definer set search_path='' as $$
 select private.purge_ride_safety_before_minors();
 select private.purge_ride_minors();
$$;
create function private.erase_ride_minors() returns trigger language plpgsql security definer set search_path='' as $$
begin
 delete from private.ride_dependents where guardian_id=new.id;
 delete from private.ride_minor_driver_clearances where driver_id=new.id;
 return null;
end $$;
create trigger erase_ride_minors after update of deleted_at on public.profiles for each row when(new.deleted_at is not null and old.deleted_at is null)
 execute function private.erase_ride_minors();

revoke all on function private.ride_minor_allowed(text,text,text,text,timestamptz),private.ride_minor_can_serve(uuid,public.ride_legs),
 private.ride_party_can_serve(uuid,public.ride_legs),private.ride_before_parties_eligible(uuid,public.ride_legs),private.ride_offer_eligible(uuid,public.ride_legs),
 private.ride_minor_leg_created(),private.ride_minor_leg_guard(),private.ride_dependents_view(uuid),private.ride_my_accounts_before_dependents(),
 private.purge_ride_minors(),private.purge_ride_safety_before_minors(),private.purge_ride_safety(),private.erase_ride_minors() from public,anon,authenticated,service_role;
revoke all on function public.ride_register_dependent(uuid,text,text,text,uuid),public.admin_review_dependent(uuid,boolean,text,date),public.admin_ride_dependents(),
 public.admin_set_minor_driver_clearance(uuid,text,timestamptz),public.ride_quote_for_dependent(uuid,timestamptz,jsonb,uuid,boolean),public.ride_guardian_watch(uuid),
 public.ride_guardian_escalate(uuid,uuid),public.ride_my_accounts() from public,anon,authenticated,service_role;
grant execute on function public.ride_register_dependent(uuid,text,text,text,uuid),public.admin_review_dependent(uuid,boolean,text,date),public.admin_ride_dependents(),
 public.admin_set_minor_driver_clearance(uuid,text,timestamptz),public.ride_quote_for_dependent(uuid,timestamptz,jsonb,uuid,boolean),public.ride_guardian_watch(uuid),
 public.ride_guardian_escalate(uuid,uuid),public.ride_my_accounts() to authenticated;
