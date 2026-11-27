-- Live diligence uses a separate bucket, purpose and permission from service-provider KYC.
-- No production policy, file or credential is seeded. Only back-office provisioning may open collection.
create table private.ride_dossier_policy (
  singleton boolean primary key default true check(singleton),
  approval_ref text not null check(length(trim(approval_ref)) between 1 and 160),
  privacy_version text not null check(length(trim(privacy_version)) between 1 and 80),
  until_at timestamptz not null,
  retention_days integer not null check(retention_days between 1 and 3650)
);
create table private.ride_dossiers (
  id uuid primary key default gen_random_uuid(), driver_id uuid not null references public.ride_drivers(id),
  status text not null check(status in ('draft','submitted','approved','rejected','superseded')),
  display_name text not null check(length(trim(display_name)) between 2 and 100),
  vehicle_model text not null check(length(trim(vehicle_model)) between 2 and 100),
  vehicle_plate text not null check(vehicle_plate ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  public_driver_number text not null check(length(trim(public_driver_number)) between 1 and 80),
  vehicle_category text not null, privacy_version text not null, reviewed_at timestamptz,
  rejection_reason text, created_at timestamptz not null default now(), expires_at timestamptz not null
);
create unique index ride_one_current_dossier on private.ride_dossiers(driver_id) where status in ('draft','submitted','approved');
-- Exceptional retention requires a purpose-specific, time-bounded decision.
-- This holds evidence in restricted custody; it never extends ordinary read access.
create table private.ride_dossier_holds (
 dossier_id uuid primary key references private.ride_dossiers(id) on delete cascade,
 evidence_ref text not null check(length(trim(evidence_ref)) between 4 and 160),
 until_at timestamptz not null check(isfinite(until_at))
);
revoke all on private.ride_dossier_holds from public,anon,authenticated,service_role;
create function private.active_ride_dossier_actor() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from public.profiles where id=auth.uid() and deleted_at is null)
$$;
revoke all on function private.active_ride_dossier_actor() from public,anon,authenticated;
create table private.ride_dossier_files (
  id uuid primary key default gen_random_uuid(), dossier_id uuid not null references private.ride_dossiers(id) on delete cascade,
  kind text not null check(kind in ('driver_photo','vehicle_photo','driver_license','municipal_permit','vehicle_license','vehicle_certificate','insurance')),
  path text not null unique, replaced boolean not null default false, uploaded_at timestamptz not null default now()
);
create unique index ride_one_current_file on private.ride_dossier_files(dossier_id,kind) where not replaced;
revoke all on private.ride_dossier_policy, private.ride_dossiers, private.ride_dossier_files from public, anon, authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('ride-driver-files','ride-driver-files',false,8388608,array['image/jpeg','image/png']);
-- The Storage API's authenticated role gets no read/write policy on this bucket.
create function private.ride_dossier_open() returns boolean language sql stable security definer set search_path='' as $$
 select private.ride_env()='live' and exists(select from private.ride_network where environment='live' and module_enabled)
   and exists(select from private.ride_dossier_policy where until_at>now())
   and exists(select from private.ride_area_authorizations where until_at>now() and quote_enabled)
$$;
create function public.ride_dossier(p_driver uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); target uuid:=coalesce(p_driver,u); d private.ride_dossiers; policy private.ride_dossier_policy; files jsonb;
begin
 if not private.active_ride_dossier_actor() or (target<>u and not public.is_admin()) then raise exception 'not_allowed'; end if;
 if not private.ride_dossier_open() then return jsonb_build_object('open',false); end if;
 select * into strict policy from private.ride_dossier_policy;
 select * into d from private.ride_dossiers where driver_id=target and status<>'superseded' and expires_at>now() order by created_at desc limit 1;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind) order by kind),'[]') into files
   from private.ride_dossier_files where dossier_id=d.id and not replaced;
 return jsonb_build_object('open',true,'version',policy.privacy_version,'retention_days',policy.retention_days,'dossier',case when d.id is not null then jsonb_build_object(
   'id',d.id,'status',d.status,'name',d.display_name,'plate',d.vehicle_plate,'model',d.vehicle_model,'number',d.public_driver_number,
   'reason',d.rejection_reason,'files',files) end);
end $$;
create function public.ride_begin_dossier(p_name text,p_plate text,p_model text,p_number text,p_version text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); category text; out_id uuid; d private.ride_dossiers; pol private.ride_dossier_policy;
begin
 if not private.active_ride_dossier_actor() or not private.ride_dossier_open() then raise exception 'not_allowed'; end if;
 select vehicle into category from public.ride_drivers where id=u and environment='live' for update;
 if not found then raise exception 'not_allowed'; end if;
 select * into strict pol from private.ride_dossier_policy;
 if p_version is distinct from pol.privacy_version then raise exception 'invalid_input'; end if;
 select * into d from private.ride_dossiers where driver_id=u and status in ('draft','approved','submitted') for update;
 if found and d.status='draft' and d.expires_at>now() then
   update private.ride_dossiers set display_name=trim(p_name),vehicle_model=trim(p_model),vehicle_plate=upper(trim(p_plate)),
     public_driver_number=trim(p_number),privacy_version=p_version, vehicle_category=category where id=d.id; return d.id;
 end if;
 if d.status='submitted' and d.expires_at>now() then raise exception 'invalid_transition'; end if;
 if exists(select from public.ride_legs where driver_id=u and status in ('accepted','arriving','boarded','unknown')) then raise exception 'driver_has_active_ride'; end if;
 if (select count(*) from private.ride_dossiers where driver_id=u and created_at>now()-interval '24 hours')>=5 then raise exception 'rate_limited'; end if;
 update private.ride_dossiers set status='superseded' where driver_id=u and status in ('draft','submitted','approved');
 update public.ride_drivers set status='pending',online=false,valid_until=null where id=u;
 delete from private.ride_driver_credentials where driver_id=u;
 insert into private.ride_dossiers(driver_id,status,display_name,vehicle_plate,vehicle_model,public_driver_number,vehicle_category,privacy_version,expires_at)
   values(u,'draft',trim(p_name),upper(trim(p_plate)),trim(p_model),trim(p_number),category,p_version,now()+make_interval(days=>pol.retention_days)) returning id into out_id;
 return out_id;
end $$;
-- Reserve capacity before the Edge Function reads bytes. Concurrent calls share the
-- same counter, including uploads whose Storage write succeeds but DB reply is lost.
create table private.ride_upload_limits (
 driver_id uuid not null references public.ride_drivers(id), day date not null, count int not null, primary key(driver_id,day)
);
revoke all on private.ride_upload_limits from public,anon,authenticated;
create function public.ride_dossier_upload_target() returns uuid language plpgsql security definer set search_path='' as $$
declare d private.ride_dossiers; n int;
begin
 select * into d from private.ride_dossiers where driver_id=auth.uid() and status='draft' and expires_at>now() for update;
 if not found or not private.active_ride_dossier_actor() or not private.ride_dossier_open() then return null; end if;
 insert into private.ride_upload_limits(driver_id,day,count) values(d.driver_id,(now() at time zone 'America/Sao_Paulo')::date,1)
   on conflict(driver_id,day) do update set count=private.ride_upload_limits.count+1 where private.ride_upload_limits.count<32
   returning count into n;
 if n is null or (select count(*) from private.ride_dossier_files where dossier_id=d.id)>=28 then raise exception 'rate_limited'; end if;
 return d.id;
end $$;
create function public.ride_dossier_attach(p_driver uuid,p_dossier uuid,p_kind text,p_path text) returns uuid
 language plpgsql security definer set search_path='' as $$
declare d private.ride_dossiers; fid uuid;
begin
 select * into d from private.ride_dossiers where id=p_dossier and driver_id=p_driver and status='draft' and expires_at>now() for update;
 if not found or not exists(select from public.profiles where id=p_driver and deleted_at is null) or not private.ride_dossier_open() then raise exception 'not_allowed'; end if;
 if p_kind is null or p_kind not in ('driver_photo','vehicle_photo','driver_license','municipal_permit','vehicle_license','vehicle_certificate','insurance') or
    p_path !~ ('^'||p_driver::text||'/'||p_dossier::text||'/'||p_kind||'-[a-f0-9-]{36}[.](jpg|png)$') or
    not exists(select from storage.objects where bucket_id='ride-driver-files' and name=p_path) then raise exception 'invalid_input'; end if;
 select id into fid from private.ride_dossier_files where path=p_path;
 if found then return fid; end if;
 if (select count(*) from private.ride_dossier_files where dossier_id=d.id)>=28 then raise exception 'rate_limited'; end if;
 update private.ride_dossier_files set replaced=true where dossier_id=d.id and kind=p_kind and not replaced;
 insert into private.ride_dossier_files(dossier_id,kind,path) values(d.id,p_kind,p_path) returning id into fid;
 return fid;
end $$;
create function public.ride_submit_dossier(p_dossier uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare d private.ride_dossiers;
begin
 select * into d from private.ride_dossiers where id=p_dossier and driver_id=auth.uid() and expires_at>now() for update;
 if not found or not private.active_ride_dossier_actor() or not private.ride_dossier_open() then raise exception 'not_allowed'; end if;
 if d.status='submitted' then return true; end if;
 if d.status<>'draft' or d.privacy_version<>(select privacy_version from private.ride_dossier_policy)
    or (select count(*) from private.ride_dossier_files where dossier_id=d.id and not replaced)<>7 then raise exception 'documents_missing'; end if;
 update private.ride_dossiers set status='submitted' where id=d.id; return true;
end $$;
create function public.ride_decide_dossier(p_dossier uuid,p_approve boolean,p_driver_until date,p_vehicle_until date,p_insurance_until date,p_reason text)
 returns boolean language plpgsql security definer set search_path='' as $$
declare d private.ride_dossiers; today date:=(now() at time zone 'America/Sao_Paulo')::date; expiry date; driver_category text;
begin
 if not private.active_ride_dossier_actor() or not public.is_admin() or not private.ride_dossier_open() then raise exception 'not_allowed'; end if;
 select * into d from private.ride_dossiers where id=p_dossier and (status='submitted' or (status='approved' and not p_approve)) and expires_at>now() for update;
 if not found or d.driver_id=auth.uid() or p_approve is null then raise exception 'not_allowed'; end if;
 select vehicle into strict driver_category from public.ride_drivers where id=d.driver_id for update;
 if p_approve then
   expiry:=least(p_driver_until,p_vehicle_until,p_insurance_until);
   if p_driver_until is null or p_vehicle_until is null or p_insurance_until is null or not isfinite(p_driver_until) or not isfinite(p_vehicle_until) or not isfinite(p_insurance_until) or expiry<today or driver_category<>d.vehicle_category
      or (select count(*) from private.ride_dossier_files where dossier_id=d.id and not replaced)<>7 then raise exception 'documents_missing'; end if;
   insert into private.ride_driver_credentials(driver_id,vehicle_identifier,vehicle_category,driver_document_ref,vehicle_document_ref,
     insurance_ref,driver_until,vehicle_until,insurance_until,inspected_by,public_driver_number,vehicle_plate,vehicle_model,public_driver_name)
   values(d.driver_id,d.vehicle_plate,d.vehicle_category,d.id::text,d.id::text,d.id::text,p_driver_until,p_vehicle_until,p_insurance_until,
     auth.uid(),d.public_driver_number,d.vehicle_plate,d.vehicle_model,d.display_name)
   on conflict(driver_id) do update set vehicle_identifier=excluded.vehicle_identifier,vehicle_category=excluded.vehicle_category,
     driver_document_ref=excluded.driver_document_ref,vehicle_document_ref=excluded.vehicle_document_ref,insurance_ref=excluded.insurance_ref,
     driver_until=excluded.driver_until,vehicle_until=excluded.vehicle_until,insurance_until=excluded.insurance_until,inspected_by=excluded.inspected_by,
     verified_at=now(),public_driver_name=excluded.public_driver_name,public_driver_number=excluded.public_driver_number,vehicle_plate=excluded.vehicle_plate,vehicle_model=excluded.vehicle_model;
   update private.ride_dossiers set status='approved',reviewed_at=now(),
     expires_at=((expiry+1)::timestamp at time zone 'America/Sao_Paulo')+make_interval(days=>(select retention_days from private.ride_dossier_policy)) where id=d.id;
 else
   if p_reason is null or length(trim(p_reason)) not between 3 and 300 then raise exception 'invalid_input'; end if;
   update private.ride_dossiers set status='rejected',reviewed_at=now(),rejection_reason=trim(p_reason) where id=d.id;
 end if;
 perform public.ride_review_driver(d.driver_id,p_approve,expiry);
 return true;
end $$;

-- Only the passenger of the currently assigned, active leg may see driver identification.
create function public.ride_trip_driver_identity(p_leg uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('name',d.display_name,'number',d.public_driver_number,'model',d.vehicle_model,'plate',d.vehicle_plate,
   'photos',(select jsonb_object_agg(f.kind,f.id) from private.ride_dossier_files f where f.dossier_id=d.id and not f.replaced and f.kind in ('driver_photo','vehicle_photo')))
 from public.ride_legs l join public.rides r on r.id=l.ride_id
 join private.ride_driver_credentials c on c.driver_id=l.driver_id
 join private.ride_dossiers d on d.driver_id=l.driver_id and d.id::text=c.driver_document_ref
 where private.active_ride_dossier_actor() and l.id=p_leg and r.passenger_id=auth.uid() and l.environment='live' and private.ride_env()='live' and d.status in ('approved','rejected')
 and d.expires_at>now() and l.status in ('accepted','arriving','boarded')
$$;
create function public.ride_dossier_file_path(p_file uuid,p_leg uuid default null) returns text language sql stable security definer set search_path='' as $$
 select f.path from private.ride_dossier_files f join private.ride_dossiers d on d.id=f.dossier_id where private.active_ride_dossier_actor() and f.id=p_file and not f.replaced
   and d.expires_at>now() and private.ride_env()='live' and ((p_leg is null and private.ride_dossier_open() and
   (d.driver_id=auth.uid() or public.is_admin())) or (p_leg is not null and f.kind in ('driver_photo','vehicle_photo') and
    public.ride_trip_driver_identity(p_leg)->'photos'->>f.kind=f.id::text))
$$;
create function public.ride_dossier_expired_files() returns table(path text)
 language sql stable security definer set search_path='' as $$
 select o.name from storage.objects o left join private.ride_dossier_files f on f.path=o.name
 left join private.ride_dossiers d on d.id=f.dossier_id where o.bucket_id='ride-driver-files' and not exists(
 select from private.ride_dossier_holds h where h.dossier_id=d.id and h.until_at>now()) and
 (d.expires_at<=now() or f.replaced or (f.id is null and o.created_at<now()-interval '1 hour'))
 order by o.created_at limit 100
$$;
create function public.ride_purge_dossier_rows() returns void language sql security definer set search_path='' as $$
 delete from private.ride_dossiers d where expires_at<=now() and not exists(
  select from private.ride_dossier_holds h where h.dossier_id=d.id and h.until_at>now()) and not exists(
  select from private.ride_dossier_files f join storage.objects o on o.name=f.path and o.bucket_id='ride-driver-files' where f.dossier_id=d.id)
$$;
revoke all on function private.ride_dossier_open() from public,anon,authenticated;
revoke all on function public.ride_dossier(uuid),public.ride_begin_dossier(text,text,text,text,text),public.ride_dossier_upload_target(),
 public.ride_submit_dossier(uuid),public.ride_decide_dossier(uuid,boolean,date,date,date,text),public.ride_trip_driver_identity(uuid),
 public.ride_dossier_file_path(uuid,uuid),public.ride_dossier_attach(uuid,uuid,text,text),public.ride_dossier_expired_files(),public.ride_purge_dossier_rows()
 from public,anon,authenticated;
grant execute on function public.ride_dossier(uuid),public.ride_begin_dossier(text,text,text,text,text),public.ride_dossier_upload_target(),
 public.ride_submit_dossier(uuid),public.ride_decide_dossier(uuid,boolean,date,date,date,text),public.ride_trip_driver_identity(uuid),
 public.ride_dossier_file_path(uuid,uuid) to authenticated;
grant execute on function public.ride_dossier_attach(uuid,uuid,text,text),public.ride_dossier_expired_files(),public.ride_purge_dossier_rows() to service_role;
create function private.ride_expire_dossier_on_delete() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is not null and old.deleted_at is null then
   update private.ride_dossiers set expires_at=least(expires_at,now()) where driver_id=new.id;
   update public.ride_drivers set online=false,valid_until=null,status='rejected' where id=new.id;
   delete from private.ride_driver_credentials c where driver_id=new.id and not exists(
     select from private.ride_dossier_holds h where h.dossier_id::text=c.driver_document_ref and h.until_at>now());
 end if;
 return new;
end $$;
revoke all on function private.ride_expire_dossier_on_delete() from public,anon,authenticated;
create trigger ride_dossier_account_erasure after update of deleted_at on public.profiles
 for each row execute function private.ride_expire_dossier_on_delete();

create function private.dispatch_ride_dossier_purge() returns void language plpgsql security definer set search_path='' as $$
declare endpoint text; credential text;
begin
 delete from private.ride_upload_limits where day < (now() at time zone 'America/Sao_Paulo')::date;
 delete from private.ride_driver_credentials c using private.ride_dossiers d
   where c.driver_document_ref=d.id::text and d.expires_at<=now() and not exists(
     select from private.ride_dossier_holds h where h.dossier_id=d.id and h.until_at>now());
 perform public.ride_purge_dossier_rows();
 if not exists(select from public.ride_dossier_expired_files()) then return; end if;
 select decrypted_secret into endpoint from vault.decrypted_secrets where name='ride_dossier_purge_url';
 select decrypted_secret into credential from vault.decrypted_secrets where name='cron_secret';
 if endpoint is not null and credential is not null then
  perform net.http_post(url:=endpoint,headers:=jsonb_build_object('Authorization','Bearer '||credential,'Content-Type','application/json'),body:='{}'::jsonb);
 end if;
end $$;
revoke all on function private.dispatch_ride_dossier_purge() from public,anon,authenticated;
select cron.schedule('workeasy-ride-dossier-retention','15 * * * *','select private.dispatch_ride_dossier_purge()');

-- Pre-existing externally reviewed driver rows cannot accept a new live trip until
-- their display identity and photographs have been verified through this flow.
create or replace function private.ride_driver_valid(p_driver uuid,p_day date) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select from public.ride_drivers d where d.id=p_driver and d.status='approved' and d.environment=private.ride_env()
   and d.valid_until>=p_day and (d.environment='simulation' or exists(
    select from private.ride_driver_credentials c join private.ride_dossiers o on o.driver_id=c.driver_id and o.id::text=c.driver_document_ref
     where c.driver_id=d.id and o.status='approved' and o.expires_at>now() and c.vehicle_category=d.vehicle
       and least(c.driver_until,c.vehicle_until,c.insurance_until)>=p_day)))
$$;
