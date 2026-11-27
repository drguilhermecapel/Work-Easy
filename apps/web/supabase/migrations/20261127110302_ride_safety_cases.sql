-- Territory-specific coverage and operational promises are provisioned only
-- after a verified agreement. Document upload and the emergency dialer have
-- independent switches and never send a file, claim or location externally.
create table private.ride_safety_policies (
 id uuid primary key default gen_random_uuid(), environment text not null references private.ride_network(environment),
 origin text not null,destination text not null,period tstzrange not null check(not isempty(period) and not upper_inf(period)),
 insurer text not null,coverage text not null,exclusions text not null,territory text not null,claim_channel text not null,approval_ref text not null,
 reply_minutes int not null check(reply_minutes between 1 and 1440), media_key uuid,media_days int check(media_days between 1 and 90),
 emergency_number text check(emergency_number ~ '^[0-9]{2,15}$'),check((media_key is null)=(media_days is null)),
 exclude using gist(environment with =,origin with =,destination with =,period with &&)
);
create table private.ride_case_details (
 protocol uuid primary key references public.support_tasks(id),leg uuid not null references public.ride_legs(id),reporter uuid not null,
 category text not null check(category in ('accident','discrimination','lost_item','wellness','emergency','harassment','other')),
 source_key uuid not null,opened timestamptz not null default now(),severity text not null,
 due_at timestamptz,policy_id uuid references private.ride_safety_policies(id),
 parent uuid references private.ride_case_details(protocol),first_response timestamptz,unique(reporter,source_key)
);
create table private.ride_case_updates(
 id uuid primary key default gen_random_uuid(),protocol uuid not null references private.ride_case_details(protocol),
 actor uuid not null,op uuid not null,code text not null,reference text,created timestamptz not null default now(),unique(actor,op)
);
create table private.ride_wellness_ack(leg uuid references public.ride_legs(id),actor uuid not null,at timestamptz not null,primary key(leg,actor));
-- Optional server-provisioned shape of a licensed route in WGS84. The distance
-- uses projected segments at city scale, not distance to a single waypoint.
create table private.ride_safety_paths(leg uuid primary key references public.ride_legs(id),points jsonb not null check(jsonb_typeof(points)='array' and jsonb_array_length(points) between 2 and 1500),
 threshold_m int not null check(threshold_m between 100 and 3000),verified_ref text not null,expires_at timestamptz not null);
create function private.ride_route_deviation(p_lat float8,p_lng float8,p_points jsonb) returns float8 language sql immutable set search_path='' as $$
 with nodes as (select j.ordinality seq,(j.v->>0)::float8 lat,(j.v->>1)::float8 lng from jsonb_array_elements(p_points) with ordinality j(v,ordinality)),
 seg as(select (lng-p_lng)*111320*cos(radians(p_lat)) x,(lat-p_lat)*111320 y,
    (lead(lng) over w-lng)*111320*cos(radians(p_lat)) dx,(lead(lat) over w-lat)*111320 dy from nodes window w as(order by seq)),
 nearest as(select *,greatest(0,least(1,-(x*dx+y*dy)/nullif(dx*dx+dy*dy,0))) t from seg where dx is not null)
 select min(sqrt(power(x+t*dx,2)+power(y+t*dy,2))) from nearest
$$;
create function public.ride_safety_case(p_leg uuid,p_category text,p_key uuid,p_parent uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['driver','passenger']); me uuid:=auth.uid(); c private.ride_case_details;
 policy private.ride_safety_policies; protocol uuid; severity text;
begin
 if p_category is null or p_category not in ('accident','discrimination','lost_item','wellness','emergency','harassment','other') or p_key is null then raise exception 'invalid_input'; end if;
 perform pg_advisory_xact_lock(hashtextextended(me::text,0));
 select * into c from private.ride_case_details where reporter=me and source_key=p_key;
 if found then
   if c.category<>p_category or c.leg<>p_leg or c.parent is distinct from p_parent then raise exception 'idempotency_conflict'; end if;
   return c.protocol;
 end if;
 if p_parent is not null and not exists(select from private.ride_case_details d join public.support_tasks t on t.id=d.protocol
   where d.protocol=p_parent and d.leg=p_leg and d.reporter=me and d.category=p_category and t.resolved_at is not null) then raise exception 'not_allowed'; end if;
 if (select count(*) from private.ride_case_details d where d.reporter=me and d.opened>now()-interval '1 hour')>=12 then raise exception 'rate_limited'; end if;
 select * into policy from private.ride_safety_policies where environment=l.environment and origin=l.origin and destination=l.destination and period @> l.pickup_at;
 severity:=case when p_category in ('emergency','accident','harassment') then 'urgent' when p_category in ('wellness','discrimination') then 'priority' else 'normal' end;
 insert into public.support_tasks(kind,payload) values('ride_help',jsonb_build_object('leg_id',p_leg,'environment',l.environment,'reason',p_category)) returning id into protocol;
 -- Use the shared queue/claim lifecycle. An incident can be reopened without
 -- rewriting the original task, its fees, or other users' support history.
 insert into private.ride_case_details(protocol,leg,reporter,category,source_key,severity,due_at,policy_id,parent)
   values(protocol,p_leg,me,p_category,p_key,severity,coalesce(now()+make_interval(mins=>policy.reply_minutes),(select min(upper(roster.hours)) from private.ride_staffed_channels roster where roster.hours @> now())),policy.id,p_parent);
 return protocol;
end $$;
create function public.ride_case_update(p_protocol uuid,p_code text,p_reference text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare d private.ride_case_details; c private.ride_support_cases; existing private.ride_case_updates; result uuid; me uuid:=auth.uid();
begin
 select * into d from private.ride_case_details where protocol=p_protocol for update;
 select * into c from private.ride_support_cases where protocol=p_protocol and environment=private.ride_env();
 if d.protocol is null or c.protocol is null or not private.ride_active_user(me) or p_key is null then raise exception 'not_allowed'; end if;
 if (p_code in ('item_found','item_received','request_claim') and d.reporter=me) or
    (p_code in ('item_found','item_received') and d.category='lost_item' and exists(select from private.ride_case_updates u where u.protocol=d.protocol and u.code='request_item_check')) then
   perform private.safety_leg(d.leg,array['passenger','driver']);
 elsif p_code in ('acknowledged','secure_handoff','return_arranged','request_item_check','escalated','insurer_contacted','claim_registered') then
   perform private.safety_operator();
   if c.claimed_by is distinct from me then raise exception 'ride_support_not_owner'; end if;
 else raise exception 'not_allowed'; end if;
 select * into existing from private.ride_case_updates where actor=me and op=p_key;
 if found then
   if existing.protocol<>p_protocol or existing.code<>p_code or existing.reference is distinct from p_reference then raise exception 'idempotency_conflict'; end if;
   return existing.id;
 end if;
 if c.resolved_at is not null or (p_code in ('item_found','item_received','return_arranged','secure_handoff','request_item_check') and d.category<>'lost_item')
   or (p_code in ('request_claim','insurer_contacted','claim_registered') and (d.category<>'accident' or d.policy_id is null))
   or (p_code in ('claim_registered','insurer_contacted') and (p_reference is null or p_reference !~ '^[A-Za-z0-9_-]{4,80}$'
     or not exists(select from private.ride_case_updates u where u.protocol=p_protocol and u.code='request_claim')))
   or (p_code not in ('claim_registered','insurer_contacted') and p_reference is not null) then raise exception 'invalid_case_action'; end if;
 insert into private.ride_case_updates(protocol,actor,op,code,reference) values(p_protocol,me,p_key,p_code,p_reference) returning id into result;
 if c.claimed_by=me then update private.ride_case_details set first_response=coalesce(first_response,now()) where protocol=p_protocol; end if;
 return result;
end $$;
create function private.guard_safety_backlog() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.environment='live' and exists(select from private.ride_case_details d join public.support_tasks t on t.id=d.protocol
   join public.ride_legs l on l.id=d.leg where l.environment='live' and t.resolved_at is null and d.first_response is null and d.severity='urgent'
   and (d.due_at is null or d.due_at<=now())) then raise exception 'ride_urgent_support_overdue'; end if; return new;
end $$;
create trigger safety_backlog before insert on public.ride_legs for each row when(new.environment='live' and new.status='requested') execute function private.guard_safety_backlog();
create trigger safety_backlog_assignment before update of driver_id on public.ride_legs for each row
 when(new.environment='live' and new.driver_id is not null and new.driver_id is distinct from old.driver_id) execute function private.guard_safety_backlog();
create table private.ride_recording_notices(leg uuid references public.ride_legs(id),actor uuid not null,driver_id uuid not null,at timestamptz not null default now(),primary key(leg,actor));
create table private.ride_incident_media(id uuid primary key default gen_random_uuid(),protocol uuid not null references private.ride_case_details(protocol),
 uploader uuid not null,op uuid not null,mime text not null,encrypted bytea not null,key_id uuid not null,expires_at timestamptz not null,unique(uploader,op));
create table private.ride_incident_media_holds(media uuid primary key references private.ride_incident_media(id) on delete cascade,case_ref text not null,responsible text not null,until_at timestamptz not null check(isfinite(until_at)));
create function public.ride_recording_notice(p_leg uuid,p_agree boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare l public.ride_legs:=private.lock_safety_leg(p_leg,array['passenger','driver']);
begin
 if p_agree is null or l.status not in ('accepted','arriving','boarded') or l.driver_id is null then raise exception 'not_allowed'; end if;
 if p_agree then insert into private.ride_recording_notices(leg,actor,driver_id) values(l.id,auth.uid(),l.driver_id)
   on conflict(leg,actor) do update set driver_id=excluded.driver_id,at=now();
 else delete from private.ride_recording_notices where leg=l.id and actor=auth.uid(); end if;
 return p_agree;
end $$;
create function public.ride_attach_incident(p_protocol uuid,p_mime text,p_content text,p_key uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare d private.ride_case_details; l public.ride_legs; pol private.ride_safety_policies; body bytea; key text; previous private.ride_incident_media; result uuid;
begin
 select * into d from private.ride_case_details where protocol=p_protocol and reporter=auth.uid() for update;
 if not found or p_key is null then raise exception 'not_allowed'; end if;
 l:=private.safety_leg(d.leg,array['passenger','driver']);
 select * into pol from private.ride_safety_policies where id=d.policy_id and media_key is not null and period @> now();
 if pol.id is null or d.category not in ('accident','harassment','discrimination','emergency') or exists(select from public.support_tasks where id=p_protocol and resolved_at is not null)
   then raise exception 'ride_media_disabled'; end if;
 if p_content is null or length(p_content) not between 16 and 1398104 or p_mime not in ('image/jpeg','image/png','audio/webm','audio/mp4') or p_mime is null then raise exception 'invalid_input'; end if;
 if p_mime like 'audio/%' and (select count(*) from private.ride_recording_notices n where n.leg=l.id and n.driver_id=l.driver_id
    and (n.actor=l.driver_id or exists(select from public.rides r where r.id=l.ride_id and r.passenger_id=n.actor)))<>2 then raise exception 'ride_recording_notice_required'; end if;
 select * into previous from private.ride_incident_media where uploader=auth.uid() and op=p_key;
 if found then if previous.protocol<>p_protocol or previous.mime<>p_mime then raise exception 'idempotency_conflict'; end if; return previous.id; end if;
 if (select count(*) from private.ride_incident_media m where m.protocol=p_protocol)>=3 then raise exception 'rate_limited'; end if;
 body:=decode(p_content,'base64');
 if octet_length(body)>1048576 or not (case p_mime when 'image/png' then substring(body from 1 for 8)=decode('89504e470d0a1a0a','hex')
  when 'image/jpeg' then substring(body from 1 for 3)=decode('ffd8ff','hex') when 'audio/webm' then substring(body from 1 for 4)=decode('1a45dfa3','hex')
  when 'audio/mp4' then substring(body from 5 for 4)=convert_to('ftyp','UTF8') else false end) then raise exception 'invalid_media'; end if;
 select decrypted_secret into key from vault.decrypted_secrets where id=pol.media_key;
 if key is null then raise exception 'ride_media_disabled'; end if;
 insert into private.ride_incident_media(protocol,uploader,op,mime,encrypted,key_id,expires_at)
  values(p_protocol,auth.uid(),p_key,p_mime,extensions.pgp_sym_encrypt_bytea(body,key,'cipher-algo=aes256,compress-algo=0'),pol.media_key,now()+make_interval(days=>pol.media_days)) returning id into result;
 return result;
end $$;
create table private.ride_media_reads(media uuid not null,actor uuid not null,at timestamptz not null default now());
create function public.ride_incident_file(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare m private.ride_incident_media; d private.ride_case_details; key text;
begin
 select * into m from private.ride_incident_media where id=p_id and expires_at>now();
 if m.id is null or not private.ride_active_user(auth.uid()) then raise exception 'not_allowed'; end if;
 select * into d from private.ride_case_details where protocol=m.protocol;
 if m.uploader=auth.uid() then perform private.safety_leg(d.leg,array['passenger','driver']);
 else perform private.safety_operator(); if not exists(select from private.ride_support_cases c where c.protocol=m.protocol
   and c.claimed_by=auth.uid() and c.resolved_at is null and c.environment=private.ride_env()) then raise exception 'not_allowed'; end if; end if;
 select decrypted_secret into key from vault.decrypted_secrets where id=m.key_id;
 if key is null then raise exception 'ride_media_disabled'; end if;
 insert into private.ride_media_reads(media,actor) values(m.id,auth.uid());
 return jsonb_build_object('mime',m.mime,'content',encode(extensions.pgp_sym_decrypt_bytea(m.encrypted,key),'base64'));
end $$;
create function private.safety_case_view(d private.ride_case_details,me uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('protocol',d.protocol,'leg',d.leg,'category',d.category,'severity',d.severity,'opened',d.opened,'due_at',d.due_at,
 'first_response',d.first_response,'resolved_at',t.resolved_at,'code',a.code,'mine',d.reporter=me,'claimed_by_me',coalesce(a.claimed_by=me,false),
 'insurance',d.policy_id is not null,'updates',coalesce((select jsonb_agg(jsonb_build_object('code',u.code,'at',u.created,'ref',case when d.reporter=me or a.claimed_by=me then u.reference end) order by u.created,u.id)
   from private.ride_case_updates u where u.protocol=d.protocol),'[]'),
 'files',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'mime',m.mime,'until',m.expires_at) order by m.id) from private.ride_incident_media m
    where m.protocol=d.protocol and m.expires_at>now() and (m.uploader=me or a.claimed_by=me)),'[]'))
 from public.support_tasks t left join private.ride_support_assignments a on a.task_id=t.id where t.id=d.protocol
$$;
create function public.admin_ride_safety_cases() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 perform private.safety_operator();
 return (select coalesce(jsonb_agg(private.safety_case_view(d,auth.uid()) order by (d.severity='urgent') desc,d.due_at,d.opened),'[]')
   from private.ride_case_details d join public.ride_legs l on l.id=d.leg join public.support_tasks t on t.id=d.protocol
   where l.environment=private.ride_env() and (t.resolved_at is null or t.resolved_at>now()-interval '7 days'));
end $$;
create function public.ride_wellness_ack(p_leg uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform private.safety_leg(p_leg,array['passenger','driver']);
 insert into private.ride_wellness_ack values(p_leg,auth.uid(),now()) on conflict(leg,actor) do update set at=excluded.at;
 return true;
end $$;
create function public.ride_safety_status(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['passenger','driver']); pol private.ride_safety_policies; pos private.ride_observations;
 path private.ride_safety_paths; reason text; notice_count int; vehicle jsonb; snapshots jsonb;
begin
 select * into pol from private.ride_safety_policies where environment=l.environment and origin=l.origin and destination=l.destination and period @> l.pickup_at;
 select * into pos from private.ride_observations where leg_id=l.id and onboard order by observed_at desc limit 1;
 if l.status='boarded' then
   if pos.observed_at is null or pos.observed_at<now()-interval '2 minutes' then reason:='stale_signal';
   else
     select * into path from private.ride_safety_paths where leg=l.id and expires_at>now();
     if path.leg is not null and private.ride_route_deviation(pos.latitude,pos.longitude,path.points)>path.threshold_m then reason:='route_deviation';
     elsif exists(select from private.ride_observations o where o.leg_id=l.id and o.onboard and o.observed_at between now()-interval '6 minutes' and now()-interval '4 minutes')
      and not exists(select from private.ride_observations o where o.leg_id=l.id and o.onboard and o.observed_at>now()-interval '6 minutes'
        and (abs(o.latitude-pos.latitude)>0.0007 or abs(o.longitude-pos.longitude)>0.0008)) then reason:='long_stop'; end if;
   end if;
 elsif l.status in ('unknown','cancelled') and exists(select from private.ride_events e where e.leg_id=l.id and e.to_status='boarded') then reason:='unexpected_end'; end if;
 if exists(select from private.ride_wellness_ack where leg=l.id and actor=auth.uid() and at>now()-interval '10 minutes') then reason:=null; end if;
 select count(*) into notice_count from private.ride_recording_notices where leg=l.id and driver_id=l.driver_id;
 select jsonb_build_object('model',vehicle_model,'plate',vehicle_plate) into vehicle from private.ride_driver_credentials
   where driver_id=l.driver_id and l.status in ('accepted','arriving','boarded','unknown');
 select coalesce(jsonb_agg(private.safety_case_view(d,auth.uid()) order by d.opened desc),'[]') into snapshots
    from private.ride_case_details d where d.leg=l.id and d.reporter=auth.uid();
 return jsonb_build_object('role',case when l.driver_id=auth.uid() then 'driver' else 'passenger' end,'status',l.status,'simulation',l.environment='simulation',
   'wellness',reason,'vehicle',vehicle,'location',case when l.status='boarded' and pos.observed_at>now()-interval '2 minutes' then
    jsonb_build_object('lat',pos.latitude,'lng',pos.longitude,'at',pos.observed_at) end,'recording_allowed',notice_count=2 and pol.media_key is not null,
   'notice_given',exists(select from private.ride_recording_notices where leg=l.id and driver_id=l.driver_id and actor=auth.uid()),
   'media_enabled',pol.media_key is not null and pol.period @> now(),'dial',case when l.environment='live' then coalesce(pol.emergency_number,'190') end,
   'lost_checks',coalesce((select jsonb_agg(jsonb_build_object('protocol',d.protocol,'opened',d.opened))
    from private.ride_case_details d join public.support_tasks t on t.id=d.protocol where d.leg=l.id and d.reporter<>auth.uid() and d.category='lost_item' and t.resolved_at is null
      and exists(select from private.ride_case_updates u where u.protocol=d.protocol and u.code='request_item_check')),'[]'),
   'policy',case when pol.id is not null then jsonb_build_object('insurer',pol.insurer,'coverage',pol.coverage,'exclusions',pol.exclusions,'territory',pol.territory,
    'from',lower(pol.period),'until',upper(pol.period),'claim_channel',pol.claim_channel) end,'cases',snapshots);
end $$;
revoke all on private.ride_safety_policies,private.ride_case_details,private.ride_case_updates,private.ride_wellness_ack,private.ride_safety_paths,
 private.ride_recording_notices,private.ride_incident_media,private.ride_incident_media_holds,private.ride_media_reads from public,anon,authenticated,service_role;
revoke all on function private.guard_safety_backlog(),private.safety_case_view(private.ride_case_details,uuid),private.ride_route_deviation(float8,float8,jsonb)
 from public,anon,authenticated,service_role;
revoke all on function public.ride_safety_case(uuid,text,uuid,uuid),public.ride_case_update(uuid,text,text,uuid),public.ride_recording_notice(uuid,boolean),
 public.ride_attach_incident(uuid,text,text,uuid),public.ride_incident_file(uuid),public.admin_ride_safety_cases(),public.ride_wellness_ack(uuid),public.ride_safety_status(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.ride_safety_case(uuid,text,uuid,uuid),public.ride_case_update(uuid,text,text,uuid),public.ride_recording_notice(uuid,boolean),
 public.ride_attach_incident(uuid,text,text,uuid),public.ride_incident_file(uuid),public.admin_ride_safety_cases(),public.ride_wellness_ack(uuid),public.ride_safety_status(uuid) to authenticated;
