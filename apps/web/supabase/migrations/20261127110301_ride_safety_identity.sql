-- Direct-network safety. PIN plaintext is returned once to its issuer, never to
-- the driver. A wrong guess returns a result so its durable attempt is committed.
create function private.safety_leg(p_leg uuid,p_roles text[]) returns public.ride_legs
language plpgsql stable security definer set search_path='' as $$
declare l public.ride_legs; me uuid:=auth.uid(); passenger uuid;
begin
  if not private.ride_active_user(me) then raise exception 'not_allowed'; end if;
  select * into l from public.ride_legs where id=p_leg and environment=private.ride_env();
  select passenger_id into passenger from public.rides where id=l.ride_id;
  if l.id is null or not (('passenger'=any(p_roles) and passenger=me) or ('driver'=any(p_roles) and coalesce(l.driver_id=me,false))
    or ('payer'=any(p_roles) and l.payer_id=me)) then raise exception 'not_allowed'; end if;
  return l;
end $$;
-- Hold the leg while accepting a message, invitation or declaration, so an
-- assignment change or closure cannot commit between authorization and write.
create function private.lock_safety_leg(p_leg uuid,p_roles text[]) returns public.ride_legs
language plpgsql security definer set search_path='' as $$
begin
 perform private.safety_leg(p_leg,p_roles);
 perform 1 from public.ride_legs where id=p_leg for share;
 return private.safety_leg(p_leg,p_roles);
end $$;
revoke all on function private.lock_safety_leg(uuid,text[]) from public,anon,authenticated,service_role;
create function private.safety_operator() returns uuid language plpgsql stable security definer set search_path='' as $$
begin
  perform private.require_admin();
  if not private.ride_active_user(auth.uid()) or private.ride_support_shift(auth.uid()) is null then raise exception 'ride_support_off_duty'; end if;
  return auth.uid();
end $$;
create table private.ride_pins (
  leg uuid primary key references public.ride_legs(id), driver_id uuid not null,
  digest bytea not null, salt bytea not null, issued_at timestamptz not null, expires_at timestamptz not null,
  failures int not null default 0, locked_until timestamptz, consumed_at timestamptz,
  consumed_op uuid, recovery_ref uuid
);
create table private.ride_pin_recoveries (
  id uuid primary key default gen_random_uuid(),leg uuid not null references public.ride_legs(id),
  driver_id uuid not null, protocol uuid not null references public.support_tasks(id), approved_by uuid not null,
  proof_ref text not null check(proof_ref ~ '^[A-Za-z0-9_-]{4,80}$'), at timestamptz not null default now()
);
create function private.new_ride_pin(l public.ride_legs,recovery uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare old private.ride_pins; random bytea:=extensions.gen_random_bytes(4); salt bytea:=extensions.gen_random_bytes(24); pin text;
begin
  select * into old from private.ride_pins where leg=l.id;
  if l.status not in ('accepted','arriving') or l.driver_id is null or
     not private.ride_active_user(l.driver_id) then raise exception 'ride_pin_unavailable'; end if;
  if old.locked_until>now() or (old.issued_at>now()-interval '20 seconds' and recovery is null) then raise exception 'ride_pin_wait'; end if;
  pin:=lpad(((get_byte(random,0)*65536+get_byte(random,1)*256+get_byte(random,2))%1000000)::text,6,'0');
  insert into private.ride_pins(leg,driver_id,digest,salt,issued_at,expires_at,recovery_ref)
    values(l.id,l.driver_id,sha256(salt||convert_to(pin,'UTF8')),salt,now(),now()+interval '10 minutes',recovery)
    on conflict(leg) do update set driver_id=excluded.driver_id,digest=excluded.digest,salt=excluded.salt,
    issued_at=excluded.issued_at,expires_at=excluded.expires_at,failures=case when private.ride_pins.locked_until<=now() then 0 else private.ride_pins.failures end,
    locked_until=null,consumed_at=null,consumed_op=null,recovery_ref=excluded.recovery_ref;
  return jsonb_build_object('pin',pin,'expires_at',now()+interval '10 minutes');
end $$;
create function public.ride_issue_pin(p_leg uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.ride_legs;
begin
  perform private.safety_leg(p_leg,array['passenger']);
  if not exists(select from auth.users where id=auth.uid() and (email_confirmed_at is not null or phone_confirmed_at is not null)) then
     raise exception 'ride_identity_verification_required'; end if;
  select * into strict l from public.ride_legs where id=p_leg for update;
  return private.new_ride_pin(l,null);
end $$;
-- Recovery verifies the passenger through an independent, logged staffed case
-- and issues another PIN. Support cannot mark boarding directly.
create function public.ride_recover_pin(p_leg uuid,p_protocol uuid,p_proof text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare operator uuid:=private.safety_operator(); l public.ride_legs; recovery uuid;
begin
  select * into l from public.ride_legs where id=p_leg and environment=private.ride_env() for update;
  if l.id is null or operator=l.driver_id or not exists(select from private.ride_support_cases c join private.ride_help h on h.task_id=c.protocol
    join public.rides r on r.id=l.ride_id where h.actor=r.passenger_id and c.leg=l.id and c.protocol=p_protocol
    and c.claimed_by=operator and c.resolved_at is null and r.passenger_id<>operator) then raise exception 'not_allowed'; end if;
  insert into private.ride_pin_recoveries(leg,driver_id,protocol,approved_by,proof_ref) values(l.id,l.driver_id,p_protocol,operator,p_proof) returning id into recovery;
  return private.new_ride_pin(l,recovery);
end $$;
create function public.ride_verify_boarding(p_leg uuid,p_pin text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; p private.ride_pins; result jsonb;
begin
  perform private.safety_leg(p_leg,array['driver']);
  select * into strict l from public.ride_legs where id=p_leg and driver_id=auth.uid() for update;
  select * into p from private.ride_pins where leg=l.id and driver_id=l.driver_id for update;
  if p_key is null then raise exception 'invalid_input'; end if;
  if p.consumed_at is not null then
    if p.consumed_op=p_key then return jsonb_build_object('ok',true,'status','boarded','replayed',true); end if;
    return jsonb_build_object('ok',false,'reason','used');
  end if;
  if p.leg is null or p.expires_at<=now() or l.status<>'arriving' then return jsonb_build_object('ok',false,'reason','unavailable'); end if;
  if p.locked_until>now() then return jsonb_build_object('ok',false,'reason','locked'); end if;
  if p_pin is null or p_pin !~ '^[0-9]{6}$' or sha256(p.salt||convert_to(p_pin,'UTF8'))<>p.digest then
    update private.ride_pins set failures=failures+1,
      locked_until=case when failures+1>=5 then now()+interval '10 minutes' end where leg=l.id;
    return jsonb_build_object('ok',false,'reason','invalid');
  end if;
  update private.ride_pins set consumed_at=clock_timestamp(),consumed_op=p_key,digest=decode('','hex'),salt=decode('','hex') where leg=l.id;
  result:=private.ride_command(l.id,'boarded',p_key);
  return result||jsonb_build_object('ok',true);
end $$;
create function private.guard_ride_pin() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.driver_id is distinct from old.driver_id then delete from private.ride_pins where leg=new.id; end if;
  if old.status is distinct from new.status and new.status='boarded'
    and (new.environment='live' or auth.uid() is not null) and not exists(
      select from private.ride_pins p where p.leg=new.id and p.driver_id=new.driver_id and p.consumed_at is not null)
    then raise exception 'ride_pin_required'; end if;
  return new;
end $$;
create trigger zz_ride_pin before update of driver_id,status on public.ride_legs for each row execute function private.guard_ride_pin();

create table private.ride_shares (
  id uuid primary key default gen_random_uuid(),leg uuid not null references public.ride_legs(id),issuer uuid not null,driver_id uuid not null,
  token_hash bytea not null unique,recipient_hash bytea not null,expires_at timestamptz not null,revoked_at timestamptz,created_at timestamptz not null default now()
);
create function public.ride_share_invite(p_leg uuid,p_email text,p_minutes int) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; token text:=encode(extensions.gen_random_bytes(32),'hex'); share_id uuid;
begin
  l:=private.lock_safety_leg(p_leg,array['passenger','driver']);
  if l.status not in ('accepted','arriving','boarded') or p_minutes is null or p_minutes not in (5,15,30,60) or p_email is null or length(p_email)>254 or
     p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_input'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_leg::text,0));
  if (select count(*) from private.ride_shares where issuer=auth.uid() and leg=p_leg and created_at>now()-interval '1 hour')>=12 then raise exception 'rate_limited'; end if;
  insert into private.ride_shares(leg,issuer,driver_id,token_hash,recipient_hash,expires_at)
    values(l.id,auth.uid(),l.driver_id,sha256(convert_to(token,'UTF8')),sha256(convert_to(token||lower(trim(p_email)),'UTF8')),now()+make_interval(mins=>p_minutes))
    returning id into share_id;
  return jsonb_build_object('id',share_id,'token',token,'expires_at',now()+make_interval(mins=>p_minutes));
end $$;
create function public.ride_share_revoke(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not private.ride_active_user(auth.uid()) then raise exception 'not_allowed'; end if;
  update private.ride_shares set revoked_at=coalesce(revoked_at,now()) where id=p_id and issuer=auth.uid();
  return found;
end $$;
create function public.ride_shared_progress(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare share private.ride_shares; l public.ride_legs; eta timestamptz; position jsonb;
begin
  if not private.ride_active_user(auth.uid()) or p_token is null or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  select s.* into share from private.ride_shares s join auth.users u on u.id=auth.uid()
    where s.token_hash=sha256(convert_to(p_token,'UTF8')) and s.recipient_hash=sha256(convert_to(p_token||lower(trim(u.email)),'UTF8'))
      and u.email_confirmed_at is not null and s.revoked_at is null and s.expires_at>now() and private.ride_active_user(s.issuer);
  select * into l from public.ride_legs where id=share.leg and driver_id=share.driver_id and environment=private.ride_env() and status in ('accepted','arriving','boarded');
  if l.id is null or not private.ride_active_user(l.driver_id) then return null; end if;
  select arrives_at into eta from private.ride_arrival_estimates where leg_id=l.id and updated_at>now()-interval '10 minutes';
  if l.status='boarded' and l.environment='live' then
    select jsonb_build_object('lat',round(latitude::numeric,2),'lng',round(longitude::numeric,2),'at',observed_at) into position
      from private.ride_observations where leg_id=l.id and onboard and observed_at>now()-interval '2 minutes' order by observed_at desc limit 1;
  end if;
  return jsonb_build_object('status',l.status,'eta',eta,'approximate_position',position,'expires_at',share.expires_at,'simulation',l.environment='simulation');
end $$;
create table private.ride_chat (
  id uuid primary key default gen_random_uuid(),leg uuid not null references public.ride_legs(id),driver_id uuid not null,
  author uuid not null,op uuid not null,body text not null check(length(trim(body)) between 1 and 400),
  sent_at timestamptz not null default now(),unique(author,op)
);
create function public.ride_chat_send(p_leg uuid,p_text text,p_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; previous private.ride_chat; msg uuid;
begin
  l:=private.lock_safety_leg(p_leg,array['passenger','driver']);
  if l.driver_id is null or l.status not in ('accepted','arriving','boarded') or p_key is null or p_text is null
      or length(trim(p_text)) not between 1 and 400 then raise exception 'invalid_input'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into previous from private.ride_chat where author=auth.uid() and op=p_key;
  if found then
    if previous.leg<>l.id or previous.body<>trim(p_text) then raise exception 'idempotency_conflict'; end if;
    return previous.id;
  end if;
  if (select count(*) from private.ride_chat where author=auth.uid() and sent_at>now()-interval '5 minutes')>=20 then raise exception 'rate_limited'; end if;
  insert into private.ride_chat(leg,driver_id,author,op,body) values(l.id,l.driver_id,auth.uid(),p_key,trim(p_text)) returning id into msg;
  return msg;
end $$;
create function public.ride_communication(p_leg uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare l public.ride_legs:=private.safety_leg(p_leg,array['passenger','driver']);
begin
  return jsonb_build_object('role',case when l.driver_id=auth.uid() then 'driver' else 'passenger' end,'status',l.status,
    'shares',coalesce((select jsonb_agg(jsonb_build_object('id',id,'expires_at',expires_at) order by created_at desc) from private.ride_shares
      where leg=l.id and issuer=auth.uid() and driver_id=l.driver_id and revoked_at is null and expires_at>now() and l.status in ('accepted','arriving','boarded')),'[]'),
    'messages',coalesce((select jsonb_agg(jsonb_build_object('id',id,'mine',author=auth.uid(),'text',body,'at',sent_at) order by sent_at,id)
      from private.ride_chat where leg=l.id and driver_id=l.driver_id and sent_at>now()-interval '24 hours' and l.status in ('accepted','arriving','boarded')),'[]'));
end $$;
create function private.expire_ride_communications() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.driver_id is distinct from old.driver_id or new.status in ('cancelled','completed','unknown') then
    update private.ride_shares set revoked_at=coalesce(revoked_at,now()) where leg=new.id and revoked_at is null;
    delete from private.ride_chat where leg=new.id;
  end if;
  return null;
end $$;
create trigger expire_ride_communications after update of driver_id,status on public.ride_legs for each row execute function private.expire_ride_communications();
revoke all on private.ride_pins,private.ride_pin_recoveries,private.ride_shares,private.ride_chat from public,anon,authenticated,service_role;
revoke all on function private.safety_leg(uuid,text[]),private.safety_operator(),private.guard_ride_pin(),private.new_ride_pin(public.ride_legs,uuid),
 private.expire_ride_communications() from public,anon,authenticated,service_role;
revoke all on function public.ride_issue_pin(uuid),public.ride_recover_pin(uuid,uuid,text),public.ride_verify_boarding(uuid,text,uuid),
 public.ride_share_invite(uuid,text,int),public.ride_share_revoke(uuid),public.ride_shared_progress(text),public.ride_chat_send(uuid,text,uuid),public.ride_communication(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.ride_issue_pin(uuid),public.ride_recover_pin(uuid,uuid,text),public.ride_verify_boarding(uuid,text,uuid),
 public.ride_share_invite(uuid,text,int),public.ride_share_revoke(uuid),public.ride_shared_progress(text),public.ride_chat_send(uuid,text,uuid),public.ride_communication(uuid) to authenticated;

-- Archived pre-migration boardings retain their existing evidentiary treatment.
-- After rollout, a new live reconciliation cannot assert boarding without its
-- passenger PIN, even when a driver or operator reports an uncertain outcome.
create table private.ride_prior_boarding_evidence(leg uuid primary key references public.ride_legs(id));
insert into private.ride_prior_boarding_evidence select distinct l.id from public.ride_legs l where l.environment='live' and
  (l.status='boarded' or exists(select from private.ride_events e where e.leg_id=l.id and e.to_status='boarded'));
create function private.ride_recovery_pin_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select from public.ride_legs l where l.id=new.leg_id and l.environment='live')
   and not exists(select from private.ride_pins p join public.ride_legs l on l.id=p.leg and l.driver_id=p.driver_id where p.leg=new.leg_id and p.consumed_at is not null)
   and not exists(select from private.ride_prior_boarding_evidence where leg=new.leg_id) then raise exception 'ride_pin_required'; end if;
 return new;
end $$;
create trigger ride_recovery_pin_guard before insert on private.ride_resolution_proofs for each row execute function private.ride_recovery_pin_guard();
revoke all on private.ride_prior_boarding_evidence from public,anon,authenticated,service_role;
revoke all on function private.ride_recovery_pin_guard() from public,anon,authenticated,service_role;
