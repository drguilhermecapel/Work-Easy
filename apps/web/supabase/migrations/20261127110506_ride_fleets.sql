-- PAR-508 (O17 stage 5): fleets. Capacity and credentials stay keyed by the driver; a
-- fleet is an overlay that says which vehicle a member driver holds, under which cession
-- and until when. A fleet driver receives offers only with a cession the operation has
-- reviewed, on a vehicle whose three dates are current and whose identifier is the one
-- on the driver's own capacity record. A driver swap, a vehicle change or renewed
-- documents leave a cession in review, and that blocks new offers until the decision.
-- The contracted beneficiary is recorded only: settlement still goes to the driver's
-- wallet. Ships closed: the 'fleet' gate has simulation rows only (110501) and a fleet
-- does nothing before admin_verify_ride_account.
--
-- Contracts for the later stage-5 files (all private):
--  ride_fleet_can_serve(driver,leg)     fleet rule read by ride_party_can_serve, beside ride_minor_can_serve
--  ride_fleet_assignment(driver,leg)    the approved cession that lets the driver take the leg, or null
--  ride_fleet_assignments_view(driver)  the driver's cessions as jsonb, for the export
create table private.ride_fleet_vehicles (
 id uuid primary key default gen_random_uuid(), account_id uuid not null references private.ride_accounts(id),
 vehicle_identifier text not null check(length(vehicle_identifier) between 1 and 40 and vehicle_identifier=trim(vehicle_identifier)),
 category text not null check(category in ('compact','sedan','van')),
 document_ref text not null check(length(trim(document_ref)) between 1 and 160),
 insurance_ref text not null check(length(trim(insurance_ref)) between 1 and 160),
 inspection_ref text not null check(length(trim(inspection_ref)) between 1 and 160),
 vehicle_until date not null, insurance_until date not null, inspection_until date not null,
 status text not null default 'active' check(status in ('active','retired')),
 saved_by uuid not null references private.ride_subjects(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(account_id,vehicle_identifier)
);
-- The id is the client key. seq orders cessions inside one transaction, where created_at ties.
create table private.ride_fleet_assignments (
 id uuid primary key, seq bigint generated always as identity unique,
 account_id uuid not null references private.ride_accounts(id), vehicle_id uuid not null references private.ride_fleet_vehicles(id),
 driver_id uuid not null references private.ride_subjects(id), cession_ref text not null check(length(trim(cession_ref)) between 1 and 160),
 beneficiary text not null check(beneficiary in ('driver','fleet')),
 period tstzrange not null check(not isempty(period) and lower_inc(period) and not upper_inc(period) and not lower_inf(period) and not upper_inf(period)),
 status text not null default 'pending_review' check(status in ('pending_review','approved','ended','rejected')),
 reviewed_by uuid, review_ref text check(length(trim(review_ref)) between 1 and 160), reviewed_at timestamptz,
 created_by uuid not null references private.ride_subjects(id), request_hash bytea not null, created_at timestamptz not null default now(),
 ended_by uuid, end_key uuid, ended_at timestamptz,
 check(status not in ('approved','rejected') or (reviewed_by is not null and review_ref is not null and reviewed_at is not null)),
 exclude using gist(vehicle_id with =,period with &&) where(status in ('pending_review','approved')),
 exclude using gist(driver_id with =,period with &&) where(status in ('pending_review','approved'))
);
create index ride_fleet_assignments_account on private.ride_fleet_assignments(account_id,seq);
create index ride_fleet_assignments_review on private.ride_fleet_assignments(status,seq);
create unique index ride_fleet_assignment_end on private.ride_fleet_assignments(ended_by,end_key) where end_key is not null;
-- Which fleet vehicle a leg was taken with. Written only when a driver is assigned
-- under a current cession, so earlier and independent legs of the same driver never
-- reach the fleet.
create table private.ride_leg_vehicles (
 leg_id uuid primary key references public.ride_legs(id) on delete cascade, vehicle_id uuid not null references private.ride_fleet_vehicles(id),
 assignment_id uuid not null references private.ride_fleet_assignments(id), account_id uuid not null references private.ride_accounts(id),
 driver_id uuid not null references private.ride_subjects(id), frozen_at timestamptz not null default now()
);
create index ride_leg_vehicles_account on private.ride_leg_vehicles(account_id);
create index ride_leg_vehicles_assignment on private.ride_leg_vehicles(assignment_id);
do $$ declare t text; begin
 foreach t in array array['ride_fleet_vehicles','ride_fleet_assignments','ride_leg_vehicles'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

-- Eligibility. The cession must have started and run past the leg end, in a fleet
-- that is still verified and allowed at both areas; the vehicle dates must reach the
-- leg's local day; the identifier must be the one the operation inspected for this
-- driver; and nothing newer about this driver or this vehicle may be awaiting review.
create function private.ride_fleet_assignment(p_driver uuid,l public.ride_legs) returns uuid language sql stable security definer set search_path='' as $$
 select s.id from private.ride_fleet_assignments s
 join private.ride_fleet_vehicles v on v.id=s.vehicle_id
 join private.ride_accounts a on a.id=s.account_id
 join private.ride_account_members m on m.account_id=a.id and m.member_id=s.driver_id
 cross join lateral (select greatest(now(),upper(l.slot),upper(l.driver_slot)) as until) leg
 where s.driver_id=p_driver and s.status='approved' and lower(s.period)<=now() and upper(s.period)>leg.until
   and m.status='active' and m.role='fleet_driver' and a.kind='fleet' and a.environment=l.environment and private.ride_account_verified(a)
   and private.ride_party_allowed(a.environment,'fleet',l.origin,l.destination,leg.until)
   and v.status='active' and least(v.vehicle_until,v.insurance_until,v.inspection_until)>=private.sp_date(leg.until)
   and exists(select from private.ride_vehicle_capacity c where c.driver_id=p_driver and c.document_ref=v.vehicle_identifier)
   and not exists(select from private.ride_fleet_assignments n where n.status='pending_review' and n.seq>s.seq
     and (n.driver_id=s.driver_id or n.vehicle_id=s.vehicle_id))
$$;
-- A driver outside every fleet is untouched by this file.
create function private.ride_fleet_can_serve(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select from private.ride_account_members m join private.ride_accounts a on a.id=m.account_id
     where m.member_id=p_driver and m.status='active' and m.role='fleet_driver' and a.kind='fleet' and a.status='active' and a.environment=l.environment)
   or private.ride_fleet_assignment(p_driver,l) is not null
$$;
-- Replaces the extension point of 110503 and keeps its dependent rule.
create or replace function private.ride_party_can_serve(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select private.ride_minor_can_serve(p_driver,l) and private.ride_fleet_can_serve(p_driver,l)
$$;

-- Assignment outside the offer path meets the same rule. The cession row stays share
-- locked until commit, so a concurrent end or review waits and the frozen link below
-- is the cession the guard saw. Named to run before the other assignment guards.
create function private.ride_fleet_leg_assigned() returns trigger language plpgsql security definer set search_path='' as $$
declare v_assignment uuid;
begin
 if tg_when='AFTER' then
   delete from private.ride_leg_vehicles where leg_id=new.id;
   if new.driver_id is not null then
     insert into private.ride_leg_vehicles(leg_id,vehicle_id,assignment_id,account_id,driver_id)
     select new.id,s.vehicle_id,s.id,s.account_id,s.driver_id from private.ride_fleet_assignments s
     join private.ride_accounts a on a.id=s.account_id and a.kind='fleet' and a.status='active' and a.environment=new.environment
     join private.ride_account_members m on m.account_id=a.id and m.member_id=s.driver_id and m.status='active' and m.role='fleet_driver'
     where s.driver_id=new.driver_id and s.status='approved' and s.period @> now();
   end if;
   return null;
 end if;
 v_assignment:=private.ride_fleet_assignment(new.driver_id,new);
 if v_assignment is not null then
   perform 1 from private.ride_fleet_assignments where id=v_assignment and status='approved' for share;
   if found then return new; end if;
 elsif private.ride_fleet_can_serve(new.driver_id,new) then return new;
 end if;
 raise exception 'ride_fleet_review_required';
end $$;
create trigger ride_assignment_fleet before update of driver_id on public.ride_legs for each row
 when(new.driver_id is not null and new.driver_id is distinct from old.driver_id) execute function private.ride_fleet_leg_assigned();
create trigger freeze_ride_vehicle after update of driver_id on public.ride_legs for each row
 when(new.driver_id is distinct from old.driver_id) execute function private.ride_fleet_leg_assigned();
-- A driver who leaves the fleet, or a fleet that closes, holds no vehicle any more.
create function private.ride_fleet_release() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='ride_accounts' then
   update private.ride_fleet_assignments set status='ended',ended_at=now() where account_id=new.id and status in ('pending_review','approved');
 else
   update private.ride_fleet_assignments set status='ended',ended_by=new.removed_by,ended_at=now()
    where account_id=new.account_id and driver_id=new.member_id and status in ('pending_review','approved');
 end if;
 return null;
end $$;
create trigger ride_fleet_member_left after update of status,role on private.ride_account_members for each row
 when(old.role='fleet_driver' and (new.status<>'active' or new.role<>'fleet_driver')) execute function private.ride_fleet_release();
create trigger ride_fleet_closed after update of status on private.ride_accounts for each row
 when(new.kind='fleet' and new.status='closed' and old.status<>'closed') execute function private.ride_fleet_release();

create function private.ride_fleet_assignments_view(p_driver uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'account_id',a.id,'account_name',a.name,'vehicle_identifier',v.vehicle_identifier,'category',v.category,
   'cession_ref',s.cession_ref,'beneficiary',s.beneficiary,'from',lower(s.period),'until',upper(s.period),'status',s.status,'created_at',s.created_at) order by s.seq),'[]'::jsonb)
 from private.ride_fleet_assignments s join private.ride_fleet_vehicles v on v.id=s.vehicle_id join private.ride_accounts a on a.id=s.account_id
 where s.driver_id=p_driver and a.environment=private.ride_env()
$$;

create function public.ride_create_fleet(p_name text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin return private.ride_open_account('fleet',p_name,null,null,p_key); end $$;
-- Saving an identifier the fleet already has renews its documents. The operation
-- reviewed the previous ones, so any change sends the current cessions back to review.
create function public.ride_fleet_save_vehicle(p_account uuid,p_identifier text,p_category text,p_document text,p_insurance text,p_inspection text,
 p_vehicle_until date,p_insurance_until date,p_inspection_until date) returns uuid language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; v private.ride_fleet_vehicles; today date:=private.sp_date(now());
 ident text:=trim(p_identifier); doc text:=trim(p_document); ins text:=trim(p_insurance); insp text:=trim(p_inspection);
begin
 a:=private.ride_require_account_role(p_account,array['admin','manager']);
 if a.kind<>'fleet' or ident is null or length(ident) not between 1 and 40 or p_category is null or p_category not in ('compact','sedan','van')
   or doc is null or length(doc) not between 1 and 160 or ins is null or length(ins) not between 1 and 160 or insp is null or length(insp) not between 1 and 160
   or p_vehicle_until is null or p_insurance_until is null or p_inspection_until is null
   or least(p_vehicle_until,p_insurance_until,p_inspection_until)<today or greatest(p_vehicle_until,p_insurance_until,p_inspection_until)>(today+interval '10 years')::date
   then raise exception 'invalid_input'; end if;
 if not private.ride_account_verified(a) or not private.ride_party_allowed(a.environment,'fleet',null,null,now()) then raise exception 'ride_feature_disabled'; end if;
 perform 1 from private.ride_accounts where id=a.id for update;
 select * into v from private.ride_fleet_vehicles where account_id=a.id and vehicle_identifier=ident for update;
 if not found then
   if (select count(*) from private.ride_fleet_vehicles where account_id=a.id)>=200 then raise exception 'rate_limited'; end if;
   insert into private.ride_fleet_vehicles(account_id,vehicle_identifier,category,document_ref,insurance_ref,inspection_ref,vehicle_until,insurance_until,inspection_until,saved_by)
    values(a.id,ident,p_category,doc,ins,insp,p_vehicle_until,p_insurance_until,p_inspection_until,me) returning * into v;
   return v.id;
 end if;
 if (v.category,v.document_ref,v.insurance_ref,v.inspection_ref,v.vehicle_until,v.insurance_until,v.inspection_until,v.status)
    =(p_category,doc,ins,insp,p_vehicle_until,p_insurance_until,p_inspection_until,'active') then return v.id; end if;
 update private.ride_fleet_vehicles set category=p_category,document_ref=doc,insurance_ref=ins,inspection_ref=insp,vehicle_until=p_vehicle_until,
   insurance_until=p_insurance_until,inspection_until=p_inspection_until,status='active',saved_by=me,updated_at=now() where id=v.id;
 update private.ride_fleet_assignments set status='pending_review',reviewed_by=null,review_ref=null,reviewed_at=null
  where vehicle_id=v.id and status='approved' and upper(period)>now();
 return v.id;
end $$;
-- A cession names a driver who joined the fleet by invite. It is born in review.
create function public.ride_fleet_assign(p_vehicle uuid,p_driver uuid,p_cession text,p_beneficiary text,p_from timestamptz,p_until timestamptz,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; v private.ride_fleet_vehicles; s private.ride_fleet_assignments; h bytea;
begin
 if p_key is null or p_vehicle is null or p_driver is null or p_cession is null or length(trim(p_cession)) not between 1 and 160
   or p_beneficiary is null or p_beneficiary not in ('driver','fleet') or p_from is null or p_until is null or p_from>=p_until then raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(p_vehicle::text,p_driver::text,trim(p_cession),p_beneficiary,extract(epoch from p_from)::text,extract(epoch from p_until)::text);
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into s from private.ride_fleet_assignments where id=p_key;
 if found then
   if s.created_by<>me or s.request_hash<>h then raise exception 'idempotency_conflict'; end if;
   return s.id;
 end if;
 select * into v from private.ride_fleet_vehicles where id=p_vehicle;
 if not found then raise exception 'ride_account_role_required'; end if;
 a:=private.ride_require_account_role(v.account_id,array['admin','manager']);
 if not private.ride_account_verified(a) or not private.ride_party_allowed(a.environment,'fleet',null,null,now()) then raise exception 'ride_feature_disabled'; end if;
 perform 1 from private.ride_accounts where id=a.id for update;
 select * into strict v from private.ride_fleet_vehicles where id=p_vehicle for update;
 if a.kind<>'fleet' or p_until<=now() or p_from<now()-interval '1 day' or p_until>p_from+interval '13 months' or v.status<>'active'
   or least(v.vehicle_until,v.insurance_until,v.inspection_until)<private.sp_date(now())
   or not exists(select from private.ride_account_members m where m.account_id=a.id and m.member_id=p_driver and m.status='active' and m.role='fleet_driver'
     and private.ride_active_user(m.member_id)) then raise exception 'invalid_input'; end if;
 if (select count(*) from private.ride_fleet_assignments where account_id=a.id and created_at>now()-interval '1 day')>=60 then raise exception 'rate_limited'; end if;
 begin
   insert into private.ride_fleet_assignments(id,account_id,vehicle_id,driver_id,cession_ref,beneficiary,period,created_by,request_hash)
    values(p_key,a.id,v.id,p_driver,trim(p_cession),p_beneficiary,tstzrange(p_from,p_until,'[)'),me,h) returning * into s;
 exception when exclusion_violation then raise exception 'slot_unavailable'; end;
 return s.id;
end $$;
-- Ending closes future offers only; legs already taken with the vehicle stay as they are.
create function public.ride_fleet_end_assignment(p_assignment uuid,p_key uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; s private.ride_fleet_assignments;
begin
 if p_assignment is null or p_key is null then raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into s from private.ride_fleet_assignments where ended_by=me and end_key=p_key;
 if found then
   if s.id<>p_assignment then raise exception 'idempotency_conflict'; end if;
   return true;
 end if;
 select * into s from private.ride_fleet_assignments where id=p_assignment;
 if not found then raise exception 'ride_account_role_required'; end if;
 a:=private.ride_require_account_role(s.account_id,array['admin','manager']);
 perform 1 from private.ride_accounts where id=a.id for update;
 update private.ride_fleet_assignments set status='ended',ended_by=me,end_key=p_key,ended_at=now() where id=s.id and status in ('pending_review','approved');
 return found;
end $$;
-- The reviewer checks cession, insurance, inspection and beneficiary outside the
-- system and records a reference. Nobody reviews a fleet they belong to or their own
-- cession. A refusal also withdraws an approval already given.
create function public.admin_review_fleet_assignment(p_assignment uuid,p_approve boolean,p_reference text) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); a private.ride_accounts; v private.ride_fleet_vehicles; s private.ride_fleet_assignments; ref text:=trim(p_reference);
 verdict text:=case when p_approve then 'approved' else 'rejected' end;
begin
 perform private.require_admin();
 if not private.ride_active_user(me) then raise exception 'not_allowed'; end if;
 select * into s from private.ride_fleet_assignments where id=p_assignment;
 if not found or p_approve is null or ref is null or length(ref) not between 1 and 160 then raise exception 'invalid_input'; end if;
 select * into a from private.ride_accounts where id=s.account_id and environment=private.ride_env() for update;
 if not found then raise exception 'invalid_input'; end if;
 select * into strict s from private.ride_fleet_assignments where id=p_assignment for update;
 if s.driver_id=me or exists(select from private.ride_account_members m where m.account_id=a.id and m.member_id=me and m.status='active') then raise exception 'not_allowed'; end if;
 if (s.status,s.reviewed_by,s.review_ref) is not distinct from (verdict,me,ref) then return p_approve; end if;
 if s.status not in ('pending_review','approved') or (p_approve and s.status<>'pending_review') then raise exception 'invalid_input'; end if;
 if p_approve then
   select * into strict v from private.ride_fleet_vehicles where id=s.vehicle_id;
   -- The same vehicle approved for another fleet in the same period is a conflict for the reviewer to solve first.
   if not private.ride_account_verified(a) or upper(s.period)<=now() or v.status<>'active'
     or least(v.vehicle_until,v.insurance_until,v.inspection_until)<private.sp_date(now())
     or not exists(select from private.ride_account_members m where m.account_id=a.id and m.member_id=s.driver_id and m.status='active' and m.role='fleet_driver')
     or exists(select from private.ride_fleet_assignments o join private.ride_fleet_vehicles ov on ov.id=o.vehicle_id join private.ride_accounts oa on oa.id=o.account_id
       where o.id<>s.id and ov.id<>v.id and o.status='approved' and o.period && s.period and ov.vehicle_identifier=v.vehicle_identifier and oa.environment=a.environment)
     then raise exception 'invalid_input'; end if;
 end if;
 update private.ride_fleet_assignments set status=verdict,reviewed_by=me,review_ref=ref,reviewed_at=now() where id=s.id;
 perform private.audit('ride.fleet_assignment_review','ride_fleet_assignments',s.id::text,jsonb_build_object('approve',p_approve,'reference',ref,
   'account',a.id,'vehicle',s.vehicle_id,'environment',a.environment));
 return p_approve;
end $$;
-- What the reviewer needs to decide: the cessions awaiting review and those decided in
-- the last seven days, with the references the fleet declared. No leg and no value.
create function public.admin_ride_fleet_assignments() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 perform private.require_admin();
 if not private.ride_active_user(me) then raise exception 'not_allowed'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'account_id',a.id,'account_name',a.name,'account_verified',private.ride_account_verified(a),
     'vehicle_id',v.id,'vehicle_identifier',v.vehicle_identifier,'category',v.category,'document_ref',v.document_ref,'insurance_ref',v.insurance_ref,
     'inspection_ref',v.inspection_ref,'vehicle_until',v.vehicle_until,'insurance_until',v.insurance_until,'inspection_until',v.inspection_until,
     'driver_id',s.driver_id,'driver_name',p.full_name,
     'driver_vehicle_match',exists(select from private.ride_vehicle_capacity c where c.driver_id=s.driver_id and c.document_ref=v.vehicle_identifier),
     'cession_ref',s.cession_ref,'beneficiary',s.beneficiary,'from',lower(s.period),'until',upper(s.period),'status',s.status,
     'review_ref',s.review_ref,'reviewed_at',s.reviewed_at,'created_at',s.created_at) order by (s.status='pending_review') desc,s.seq),'[]'::jsonb)
   from (select x.* from private.ride_fleet_assignments x join private.ride_accounts xa on xa.id=x.account_id
     where xa.environment=private.ride_env() and (x.status='pending_review' or x.reviewed_at>now()-interval '7 days')
     order by (x.status='pending_review') desc,x.seq limit 100) s
   join private.ride_accounts a on a.id=s.account_id join private.ride_fleet_vehicles v on v.id=s.vehicle_id
   left join public.profiles p on p.id=s.driver_id and p.deleted_at is null);
end $$;
-- The fleet reads its own vehicles and cessions and, for the legs taken with them,
-- only the local date, the status and the vehicle. The driver's share appears when
-- the cession names the fleet as beneficiary. Never a place, a time or a passenger.
create function public.ride_fleet_overview(p_account uuid,p_month date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); a private.ride_accounts; today date:=private.sp_date(now());
 v_month date:=date_trunc('month',coalesce(p_month,private.ride_month(now()))::timestamp)::date;
begin
 a:=private.ride_require_account_role(p_account,array['admin','manager']);
 if a.kind<>'fleet' then raise exception 'invalid_input'; end if;
 return jsonb_build_object('account_id',a.id,'month',v_month,
   'vehicles',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'vehicle_identifier',v.vehicle_identifier,'category',v.category,'document_ref',v.document_ref,
       'insurance_ref',v.insurance_ref,'inspection_ref',v.inspection_ref,'vehicle_until',v.vehicle_until,'insurance_until',v.insurance_until,
       'inspection_until',v.inspection_until,'status',v.status,'expired',least(v.vehicle_until,v.insurance_until,v.inspection_until)<today) order by v.created_at,v.id),'[]'::jsonb)
     from private.ride_fleet_vehicles v where v.account_id=a.id),
   'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'vehicle_id',s.vehicle_id,'driver_id',s.driver_id,'driver_name',p.full_name,
       'cession_ref',s.cession_ref,'beneficiary',s.beneficiary,'from',lower(s.period),'until',upper(s.period),'status',s.status) order by s.seq desc),'[]'::jsonb)
     from (select * from private.ride_fleet_assignments x where x.account_id=a.id order by x.seq desc limit 300) s
     left join public.profiles p on p.id=s.driver_id and p.deleted_at is null),
   'legs',(select coalesce(jsonb_agg(jsonb_build_object('date',private.sp_date(l.pickup_at),'status',l.status,'vehicle_id',x.vehicle_id,
       'driver_cents',case when s.beneficiary='fleet' then l.driver_cents end) order by private.sp_date(l.pickup_at),l.pickup_at,l.id),'[]'::jsonb)
     from private.ride_leg_vehicles x join public.ride_legs l on l.id=x.leg_id join private.ride_fleet_assignments s on s.id=x.assignment_id
     where x.account_id=a.id and private.ride_month(l.pickup_at)=v_month));
end $$;

revoke all on function private.ride_fleet_assignment(uuid,public.ride_legs),private.ride_fleet_can_serve(uuid,public.ride_legs),
 private.ride_party_can_serve(uuid,public.ride_legs),private.ride_fleet_leg_assigned(),private.ride_fleet_release(),
 private.ride_fleet_assignments_view(uuid) from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.ride_create_fleet(text,uuid)'::regprocedure,
  'public.ride_fleet_save_vehicle(uuid,text,text,text,text,text,date,date,date)'::regprocedure,
  'public.ride_fleet_assign(uuid,uuid,text,text,timestamptz,timestamptz,uuid)'::regprocedure,'public.ride_fleet_end_assignment(uuid,uuid)'::regprocedure,
  'public.admin_review_fleet_assignment(uuid,boolean,text)'::regprocedure,'public.admin_ride_fleet_assignments()'::regprocedure,
  'public.ride_fleet_overview(uuid,date)'::regprocedure] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
