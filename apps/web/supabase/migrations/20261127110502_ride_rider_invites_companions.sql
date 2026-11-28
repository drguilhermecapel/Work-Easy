-- O17 stage 5, PAR-501 and PAR-503, on the core of 20261127110501. Somebody may ask
-- for a ride that another adult takes, or be the trusted companion of a person. In both
-- the passenger stays the confirmed account that quotes and consents in its own session;
-- the sponsor or companion only pays and reads what the passenger allowed. Boarding code,
-- route, chat and support protocols never leave the passenger. Gates: 'delegated_ride'
-- and 'companion' in private.ride_party_rules (simulation rows only).
--
-- For the data-rights file: private.purge_ride_delegation_invites() marks overdue invites
-- as expired and clears free-text instructions 24 h after an invite closed.

-- PAR-501. The sponsor's own fresh quote becomes a single-use invite: itinerary by area,
-- time, a price ceiling and optional instructions. No e-mail is stored, only hashes.
create table private.ride_rider_invites (
 id uuid primary key, environment text not null references private.ride_network(environment),
 sponsor_id uuid not null references private.ride_subjects(id), source_quote uuid not null unique references private.ride_quotes(id),
 request_legs jsonb not null check(jsonb_typeof(request_legs)='array'), scheduled_at timestamptz,
 ceiling_cents int not null check(ceiling_cents>0), instructions text check(length(instructions) between 1 and 280),
 token_hash bytea not null unique, recipient_hash bytea not null, request_hash bytea not null,
 rider_id uuid references private.ride_subjects(id), quote_id uuid references private.ride_quotes(id),
 status text not null default 'pending' check(status in ('pending','accepted','declined','expired','revoked','reprice')),
 expires_at timestamptz not null, answered_at timestamptz, created_at timestamptz not null default now(),
 check(rider_id is distinct from sponsor_id)
);
create index ride_rider_invites_sponsor on private.ride_rider_invites(sponsor_id,created_at);
create index ride_rider_invites_rider on private.ride_rider_invites(rider_id) where rider_id is not null;

-- PAR-503. A companion link belongs to the accompanied person (owner). The per-ride
-- ceiling of a paying companion comes from dated terms; production has no row.
create table private.ride_companion_terms (
 environment text primary key references private.ride_network(environment),
 ride_ceiling_cents int not null check(ride_ceiling_cents between 1 and 100000000),
 evidence_ref text not null check(length(trim(evidence_ref)) between 1 and 160), valid_until timestamptz not null
);
insert into private.ride_companion_terms values('simulation',15000,'ficticio-o17-e5','infinity');
create table private.ride_companions (
 owner_id uuid not null references private.ride_subjects(id), companion_id uuid not null references private.ride_subjects(id),
 environment text not null references private.ride_network(environment),
 notices text[] not null default '{}' check(cardinality(notices)<=10
   and notices <@ array['requested','searching','accepted','reminder','arriving','boarded','completed','cancelled','no_supply','unknown']),
 pays boolean not null default false, status text not null default 'active' check(status in ('active','revoked')),
 created_at timestamptz not null default now(), revoked_at timestamptz,
 primary key(owner_id,companion_id), check(owner_id<>companion_id)
);
create index ride_companions_companion on private.ride_companions(companion_id) where status='active';
create table private.ride_companion_invites (
 id uuid primary key, environment text not null references private.ride_network(environment),
 owner_id uuid not null references private.ride_subjects(id),
 notices text[] not null check(cardinality(notices)<=10
   and notices <@ array['requested','searching','accepted','reminder','arriving','boarded','completed','cancelled','no_supply','unknown']),
 pays boolean not null, token_hash bytea not null unique, recipient_hash bytea not null, request_hash bytea not null,
 expires_at timestamptz not null, status text not null default 'pending' check(status in ('pending','accepted','declined','expired','revoked')),
 companion_id uuid references private.ride_subjects(id), answered_at timestamptz, created_at timestamptz not null default now()
);
create index ride_companion_invites_owner on private.ride_companion_invites(owner_id,created_at);
do $$ declare t text; begin
 foreach t in array array['ride_rider_invites','ride_companion_terms','ride_companions','ride_companion_invites'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

-- The reader of a token must hold the confirmed e-mail it was issued to.
create function private.ride_find_rider_invite(p_token text) returns private.ride_rider_invites
language sql stable security definer set search_path='' as $$
 select i from private.ride_rider_invites i join auth.users u on u.id=auth.uid()
 where p_token ~ '^[a-f0-9]{64}$' and i.token_hash=sha256(convert_to(p_token,'UTF8'))
   and i.recipient_hash=sha256(convert_to(p_token||lower(trim(u.email)),'UTF8')) and u.email_confirmed_at is not null
   and i.environment=private.ride_env()
$$;
create function private.ride_find_companion_invite(p_token text) returns private.ride_companion_invites
language sql stable security definer set search_path='' as $$
 select i from private.ride_companion_invites i join auth.users u on u.id=auth.uid()
 where p_token ~ '^[a-f0-9]{64}$' and i.token_hash=sha256(convert_to(p_token,'UTF8'))
   and i.recipient_hash=sha256(convert_to(p_token||lower(trim(u.email)),'UTF8')) and u.email_confirmed_at is not null
   and i.environment=private.ride_env()
$$;
-- Sorted, distinct notice codes; null when the list is not acceptable.
create function private.ride_companion_notices(p_notices text[]) returns text[] language sql immutable set search_path='' as $$
 select case when p_notices is null or cardinality(p_notices)>20 or array_position(p_notices,null) is not null
   or not p_notices <@ array['requested','searching','accepted','reminder','arriving','boarded','completed','cancelled','no_supply','unknown'] then null
   else coalesce((select array_agg(distinct x order by x) from unnest(p_notices) x),'{}'::text[]) end
$$;

create function public.ride_invite_rider(p_quote uuid,p_email text,p_minutes int,p_instructions text,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('quote'); env text:=private.ride_env(); q private.ride_quotes; i private.ride_rider_invites;
 token text:=encode(extensions.gen_random_bytes(32),'hex'); note text:=nullif(trim(coalesce(p_instructions,'')),''); h bytea; e jsonb;
begin
 if p_key is null or p_quote is null or p_minutes is null or p_minutes not in (5,15,30,60) or p_email is null or length(p_email)>254
   or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(note)>280 then raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(p_key::text,p_quote::text,p_minutes::text,lower(trim(p_email)),coalesce(note,''));
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into i from private.ride_rider_invites where id=p_key;
 if found then
   if i.sponsor_id<>me or i.request_hash<>h then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('id',i.id,'token',null,'expires_at',i.expires_at);
 end if;
 if exists(select from auth.users u where u.id=me and lower(u.email)=lower(trim(p_email))) then raise exception 'invalid_input'; end if;
 if (select count(*) from private.ride_rider_invites where sponsor_id=me and created_at>now()-interval '1 hour')>=12 then raise exception 'rate_limited'; end if;
 select * into q from private.ride_quotes where id=p_quote and environment=env and actor_id=me for update;
 if not found then raise exception 'not_allowed'; end if;
 -- Only a plain, untouched quote of the caller's own standalone ride can be handed over.
 if q.passenger_id<>me or q.booking_id is not null or q.existing_ride_id is not null or q.status<>'awaiting_consent' or q.expires_at<=now()
   or q.required_users<>array[me] or exists(select from private.ride_consents where quote_id=q.id)
   or exists(select from private.ride_quote_funding where quote_id=q.id) then raise exception 'quote_unavailable'; end if;
 -- A measured route holds the sponsor's exact places and is bound to the sponsor: the invite carries areas only.
 if exists(select from jsonb_array_elements(q.request_legs) x where x ?| array['route_id','replaces','next_booking_id','service_endpoint']) then
   raise exception 'invalid_input'; end if;
 for e in select value from jsonb_array_elements(q.legs) loop
   if not private.ride_party_allowed(env,'delegated_ride',e->>'origin',e->>'destination',
      (e->>'pickup_at')::timestamptz+make_interval(mins=>(e->>'duration_minutes')::int)) then raise exception 'ride_feature_disabled'; end if;
 end loop;
 update private.ride_quotes set status='superseded' where id=q.id;
 insert into private.ride_rider_invites(id,environment,sponsor_id,source_quote,request_legs,scheduled_at,ceiling_cents,instructions,
   token_hash,recipient_hash,request_hash,expires_at)
  values(p_key,env,me,q.id,case when q.scheduled_at is null then jsonb_set(q.request_legs,'{0}',(q.request_legs->0)-'pickup_at') else q.request_legs end,
   q.scheduled_at,q.total_cents,note,sha256(convert_to(token,'UTF8')),
   sha256(convert_to(token||lower(trim(p_email)),'UTF8')),h,least(now()+make_interval(mins=>p_minutes),coalesce(q.scheduled_at,'infinity'::timestamptz)))
  returning * into i;
 return jsonb_build_object('id',i.id,'token',token,'expires_at',i.expires_at);
end $$;

-- What the confirmed recipient reads before answering: areas, time, instructions and
-- the staffed channel. Never the price, the sponsor's identity or anybody's contact.
create function public.ride_rider_invite(p_token text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); i private.ride_rider_invites; state text; channel private.ride_staffed_channels;
begin
 if not private.ride_active_user(me) then return null; end if;
 i:=private.ride_find_rider_invite(p_token);
 if i.id is null or i.sponsor_id=me or (i.rider_id is not null and i.rider_id<>me) then return null; end if;
 state:=case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end;
 select * into channel from private.ride_staffed_channels c where upper(c.hours)>now()
   order by (c.hours @> now()) desc,lower(c.hours),c.id limit 1;
 return jsonb_build_object('id',i.id,'status',state,
   'legs',case when state in ('pending','accepted') then (select coalesce(jsonb_agg(jsonb_build_object('seq',x.n,'origin',x.leg->>'origin',
       'destination',x.leg->>'destination','pickup_at',x.leg->>'pickup_at') order by x.n),'[]'::jsonb)
     from jsonb_array_elements(i.request_legs) with ordinality x(leg,n)) else '[]'::jsonb end,
   'scheduled_at',i.scheduled_at,
   'instructions',case when state='pending' or (state='accepted' and i.answered_at>now()-interval '24 hours') then i.instructions end,
   'expires_at',i.expires_at,'simulation',i.environment='simulation',
   'support',case when channel.id is not null then jsonb_build_object('channel',channel.channel,'address',channel.address,'team',channel.team,
     'on_duty',channel.hours @> now()) end);
end $$;

-- Acceptance runs entirely in the rider's session: single-use mandate, the rider's own
-- quote, the sponsor's bounded consent and the rider's consent, or nothing at all. A
-- price above the ceiling aborts; the invite stays pending until it expires.
create function public.ride_answer_rider_invite(p_token text,p_accept boolean,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); i private.ride_rider_invites; q private.ride_quotes; v jsonb; c jsonb; mandate uuid; desired text;
begin
 if p_accept is null or p_key is null then raise exception 'invalid_input'; end if;
 i:=private.ride_find_rider_invite(p_token);
 if i.id is null then raise exception 'ride_invite_unavailable'; end if;
 select * into strict i from private.ride_rider_invites where id=i.id for update;
 desired:=case when p_accept then 'accepted' else 'declined' end;
 if i.rider_id=me and i.status=desired then
   return jsonb_build_object('status',i.status,'quote_id',i.quote_id,'ride_id',(select r.id from public.rides r where r.quote_id=i.quote_id));
 end if;
 if i.status<>'pending' or i.expires_at<=now() or i.sponsor_id=me or not private.ride_active_user(i.sponsor_id) then
   raise exception 'ride_invite_unavailable'; end if;
 if not p_accept then
   update private.ride_rider_invites set status='declined',rider_id=me,answered_at=now(),instructions=null where id=i.id;
   return jsonb_build_object('status','declined','quote_id',null,'ride_id',null);
 end if;
 mandate:=private.ride_grant_mandate('sponsor',me,i.sponsor_id,i.ceiling_cents,1,i.expires_at);
 begin
   v:=public.ride_quote(p_key,null,i.scheduled_at,i.request_legs);
 exception when raise_exception then
   -- A departure time that has passed makes the invite itself stale.
   if sqlerrm='invalid_schedule' then raise exception 'ride_invite_unavailable'; end if;
   raise;
 end;
 select * into strict q from private.ride_quotes where id=(v->>'id')::uuid;
 if q.total_cents>i.ceiling_cents then raise exception 'ride_invite_reprice'; end if;
 q:=private.ride_apply_mandate(q.id,mandate);
 c:=public.ride_consent(q.id,true);
 if c->>'status' is distinct from 'requested' then raise exception 'ride_invite_unavailable'; end if;
 update private.ride_rider_invites set status='accepted',rider_id=me,quote_id=q.id,answered_at=now() where id=i.id;
 return jsonb_build_object('status','accepted','quote_id',q.id,'ride_id',(c->>'ride_id')::uuid);
end $$;

-- Withdrawal never depends on a feature switch.
create function public.ride_revoke_rider_invite(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid();
begin
 if not private.ride_active_user(me) then raise exception 'not_allowed'; end if;
 update private.ride_rider_invites set status='revoked',answered_at=now(),instructions=null
  where id=p_id and sponsor_id=me and status='pending' and environment=private.ride_env();
 return found;
end $$;
create function public.ride_my_rider_invites() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); env text:=private.ride_env();
begin
 return (select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,
     'ceiling_cents',i.ceiling_cents,'scheduled_at',i.scheduled_at,'expires_at',i.expires_at,'answered_at',i.answered_at,'created_at',i.created_at,
     'ride_id',(select r.id from public.rides r where r.quote_id=i.quote_id)) order by i.created_at desc,i.id),'[]'::jsonb)
   from (select * from private.ride_rider_invites x where x.sponsor_id=me and x.environment=env order by x.created_at desc limit 40) i);
end $$;

create function public.ride_invite_companion(p_email text,p_notices text[],p_pays boolean,p_minutes int,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); env text:=private.ride_env(); i private.ride_companion_invites;
 token text:=encode(extensions.gen_random_bytes(32),'hex'); wanted text[]:=private.ride_companion_notices(p_notices); h bytea;
begin
 if p_key is null or wanted is null or p_pays is null or p_minutes is null or p_minutes not between 5 and 10080 or p_email is null or length(p_email)>254
   or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'invalid_input'; end if;
 h:=private.ride_party_hash(p_key::text,lower(trim(p_email)),array_to_string(wanted,','),p_pays::text,p_minutes::text);
 perform pg_advisory_xact_lock(hashtextextended(me::text||p_key::text,0));
 select * into i from private.ride_companion_invites where id=p_key;
 if found then
   if i.owner_id<>me or i.request_hash<>h then raise exception 'idempotency_conflict'; end if;
   return jsonb_build_object('id',i.id,'token',null,'expires_at',i.expires_at);
 end if;
 if exists(select from auth.users u where u.id=me and lower(u.email)=lower(trim(p_email))) then raise exception 'invalid_input'; end if;
 if not private.ride_party_allowed(env,'companion',null,null,now()) or (p_pays and not exists(select from private.ride_companion_terms
     where environment=env and valid_until>now())) then raise exception 'ride_feature_disabled'; end if;
 if (select count(*) from private.ride_companion_invites where owner_id=me and created_at>now()-interval '1 hour')>=12
   or (select count(*) from private.ride_companions where owner_id=me and status='active')>=5 then raise exception 'rate_limited'; end if;
 insert into private.ride_companion_invites(id,environment,owner_id,notices,pays,token_hash,recipient_hash,request_hash,expires_at)
  values(p_key,env,me,wanted,p_pays,sha256(convert_to(token,'UTF8')),sha256(convert_to(token||lower(trim(p_email)),'UTF8')),h,
   now()+make_interval(mins=>p_minutes)) returning * into i;
 return jsonb_build_object('id',i.id,'token',token,'expires_at',i.expires_at);
end $$;
-- The companion's acceptance is also the consent to pay, when the invite asks for it.
create function public.ride_answer_companion(p_token text,p_accept boolean) returns text
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); i private.ride_companion_invites; desired text; ceiling int;
begin
 if p_accept is null then raise exception 'invalid_input'; end if;
 i:=private.ride_find_companion_invite(p_token);
 if i.id is null then raise exception 'ride_invite_unavailable'; end if;
 select * into strict i from private.ride_companion_invites where id=i.id for update;
 desired:=case when p_accept then 'accepted' else 'declined' end;
 if i.status=desired and i.companion_id=me then return desired; end if;
 if i.status<>'pending' or i.expires_at<=now() or i.owner_id=me or not private.ride_active_user(i.owner_id) then
   raise exception 'ride_invite_unavailable'; end if;
 if p_accept then
   perform pg_advisory_xact_lock(hashtextextended('ride-companions:'||i.owner_id::text,0));
   if not private.ride_party_allowed(i.environment,'companion',null,null,now())
     or (select count(*) from private.ride_companions where owner_id=i.owner_id and status='active' and companion_id<>me)>=5 then
     raise exception 'ride_invite_unavailable'; end if;
   if i.pays then
     select ride_ceiling_cents into ceiling from private.ride_companion_terms where environment=i.environment and valid_until>now();
     if not found then raise exception 'ride_invite_unavailable'; end if;
   end if;
   insert into private.ride_companions(owner_id,companion_id,environment,notices,pays) values(i.owner_id,me,i.environment,i.notices,i.pays)
    on conflict(owner_id,companion_id) do update set status='active',notices=excluded.notices,pays=excluded.pays,revoked_at=null,
      created_at=case when private.ride_companions.status='revoked' then now() else private.ride_companions.created_at end;
   if not i.pays then
     update private.ride_payer_mandates set status='revoked',revoked_at=now() where kind='companion' and rider_id=i.owner_id and payer_id=me and status='active';
   elsif not exists(select from private.ride_payer_mandates where kind='companion' and rider_id=i.owner_id and payer_id=me and status='active'
       and environment=i.environment) then
     perform private.ride_grant_mandate('companion',i.owner_id,me,ceiling,null,null);
   end if;
 end if;
 update private.ride_companion_invites set status=desired,companion_id=me,answered_at=now() where id=i.id;
 return desired;
end $$;
-- The owner changes the notices or stops the companion from paying. Making somebody
-- pay needs that person's own acceptance of a new invite.
create function public.ride_set_companion(p_companion uuid,p_notices text[],p_pays boolean) returns boolean
language plpgsql security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); c private.ride_companions; wanted text[]:=private.ride_companion_notices(p_notices);
begin
 if p_companion is null or wanted is null or p_pays is null then raise exception 'invalid_input'; end if;
 select * into c from private.ride_companions where owner_id=me and companion_id=p_companion and status='active' and environment=private.ride_env() for update;
 if not found or (p_pays and not c.pays) then raise exception 'not_allowed'; end if;
 update private.ride_companions set notices=wanted,pays=p_pays where owner_id=me and companion_id=p_companion;
 if c.pays and not p_pays then
   update private.ride_payer_mandates set status='revoked',revoked_at=now() where kind='companion' and rider_id=me and payer_id=p_companion and status='active';
 end if;
 return true;
end $$;
-- Either side ends the link. The companion stops paying new rides and loses the copied
-- notices; legs already requested keep their payer, and the owner keeps everything.
create function public.ride_revoke_companion(p_companion uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); c record; done boolean:=false;
begin
 if not private.ride_active_user(me) or p_companion is null then raise exception 'not_allowed'; end if;
 for c in update private.ride_companions set status='revoked',revoked_at=now()
   where status='active' and ((owner_id=me and companion_id=p_companion) or (owner_id=p_companion and companion_id=me))
   returning owner_id,companion_id loop
   done:=true;
   update private.ride_payer_mandates set status='revoked',revoked_at=now()
    where kind='companion' and rider_id=c.owner_id and payer_id=c.companion_id and status='active';
   delete from private.ride_passenger_notices n using public.ride_legs l,public.rides r
    where n.owner_id=c.companion_id and l.id=n.leg_id and r.id=l.ride_id and r.passenger_id=c.owner_id and l.payer_id<>c.companion_id;
 end loop;
 return done;
end $$;
-- Status and estimate of the owner's ride in progress, nothing else: no place, no
-- position, no driver, no price.
create function public.ride_companion_progress(p_owner uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=auth.uid(); env text:=private.ride_env(); l public.ride_legs; eta timestamptz;
begin
 if not private.ride_active_user(me) or p_owner is null or not private.ride_active_user(p_owner)
   or not exists(select from private.ride_companions c where c.owner_id=p_owner and c.companion_id=me and c.status='active' and c.environment=env)
   or not private.ride_party_allowed(env,'companion',null,null,now()) then return null; end if;
 select x.* into l from public.ride_legs x join public.rides r on r.id=x.ride_id
  where r.passenger_id=p_owner and r.booking_id is null and x.environment=env and x.status in ('accepted','arriving','boarded')
  order by x.pickup_at,x.id limit 1;
 if not found then return null; end if;
 select arrives_at into eta from private.ride_arrival_estimates where leg_id=l.id and updated_at>now()-interval '10 minutes';
 return jsonb_build_object('status',l.status,'eta',eta,'simulation',l.environment='simulation');
end $$;
-- Both sides of the caller's links, the companion mandates the caller may ride on and
-- the caller's own pending invites.
create function public.ride_my_companions() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare me uuid:=private.require_ride_feature('module'); env text:=private.ride_env();
begin
 return jsonb_build_object(
  'companions',(select coalesce(jsonb_agg(jsonb_build_object('owner_id',c.owner_id,'companion_id',c.companion_id,'label',p.full_name,
      'mine',c.owner_id=me,'notices',to_jsonb(c.notices),'pays',c.pays,'since',c.created_at) order by (c.owner_id=me) desc,c.created_at,c.companion_id,c.owner_id),'[]'::jsonb)
    from private.ride_companions c join public.profiles p on p.id=case when c.owner_id=me then c.companion_id else c.owner_id end and p.deleted_at is null
    where me in (c.owner_id,c.companion_id) and c.status='active' and c.environment=env),
  'mandates',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'account_id',null,'payer_label',p.full_name,
      'ceiling_cents',m.ceiling_cents,'limit_cents',null,'valid_until',m.valid_until) order by m.created_at,m.id),'[]'::jsonb)
    from private.ride_payer_mandates m join public.profiles p on p.id=m.payer_id and p.deleted_at is null
    where m.rider_id=me and m.kind='companion' and m.status='active' and m.environment=env and (m.valid_until is null or m.valid_until>now())),
  'invites',(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'status',case when i.status='pending' and i.expires_at<=now() then 'expired' else i.status end,
      'notices',to_jsonb(i.notices),'pays',i.pays,'expires_at',i.expires_at) order by i.created_at desc,i.id),'[]'::jsonb)
    from (select * from private.ride_companion_invites x where x.owner_id=me and x.environment=env order by x.created_at desc limit 20) i));
end $$;

-- Notice fan-out. The passenger's own notice is copied to each active companion who was
-- given that event. A companion who pays is also the leg's payer: as such they still get
-- only the chosen events, and none once the link is revoked.
create function private.ride_companion_notice_filter() returns trigger language plpgsql security definer set search_path='' as $$
declare rider uuid;
begin
 select r.passenger_id into rider from public.ride_legs l join public.rides r on r.id=l.ride_id where l.id=new.leg_id;
 if rider is null or rider=new.owner_id then return new; end if;
 if exists(select from private.ride_leg_funding f join private.ride_payer_mandates m on m.id=f.mandate_id
     where f.leg_id=new.leg_id and m.kind='companion' and m.rider_id=rider and m.payer_id=new.owner_id)
   and not exists(select from private.ride_companions c where c.owner_id=rider and c.companion_id=new.owner_id and c.status='active'
     and new.event=any(c.notices)) then return null; end if;
 return new;
end $$;
create trigger ride_companion_notice_filter before insert on private.ride_passenger_notices for each row
 execute function private.ride_companion_notice_filter();
create function private.ride_companion_notice_fanout() returns trigger language plpgsql security definer set search_path='' as $$
declare l public.ride_legs; c record;
begin
 select x.* into l from public.ride_legs x join public.rides r on r.id=x.ride_id
  where x.id=new.leg_id and r.passenger_id=new.owner_id and r.booking_id is null;
 if not found or not private.ride_party_allowed(l.environment,'companion',null,null,now()) then return null; end if;
 for c in select k.companion_id from private.ride_companions k where k.owner_id=new.owner_id and k.status='active' and k.environment=l.environment
     and new.event=any(k.notices) and private.ride_active_user(k.companion_id) loop
   insert into private.ride_passenger_notices(leg_id,owner_id,event,created_at) values(new.leg_id,c.companion_id,new.event,new.created_at)
    on conflict do nothing;
   if found and exists(select from private.ride_notice_preferences where owner_id=c.companion_id and forward_updates)
     and exists(select from private.ride_passenger_contact where environment=l.environment and external_enabled) then
     perform private.notify(c.companion_id,'atualizacao_corrida','{}');
   end if;
 end loop;
 return null;
end $$;
create trigger ride_companion_notice_fanout after insert on private.ride_passenger_notices for each row
 execute function private.ride_companion_notice_fanout();

-- Retention helper for the data-rights purge: overdue invites become expired and
-- free-text instructions disappear 24 h after the invite closed.
create function private.purge_ride_delegation_invites() returns integer language plpgsql security definer set search_path='' as $$
declare n int; total int:=0;
begin
 update private.ride_rider_invites set status='expired',answered_at=expires_at,instructions=null where status='pending' and expires_at<=now();
 get diagnostics n=row_count; total:=total+n;
 update private.ride_companion_invites set status='expired',answered_at=expires_at where status='pending' and expires_at<=now();
 get diagnostics n=row_count; total:=total+n;
 update private.ride_rider_invites set instructions=null where instructions is not null and status<>'pending' and answered_at<=now()-interval '24 hours';
 get diagnostics n=row_count; total:=total+n;
 return total;
end $$;

revoke all on function private.ride_find_rider_invite(text),private.ride_find_companion_invite(text),private.ride_companion_notices(text[]),
 private.ride_companion_notice_filter(),private.ride_companion_notice_fanout(),private.purge_ride_delegation_invites()
 from public,anon,authenticated,service_role;
do $$ declare f regprocedure; begin
 foreach f in array array['public.ride_invite_rider(uuid,text,int,text,uuid)'::regprocedure,'public.ride_rider_invite(text)'::regprocedure,
  'public.ride_answer_rider_invite(text,boolean,uuid)'::regprocedure,'public.ride_revoke_rider_invite(uuid)'::regprocedure,
  'public.ride_my_rider_invites()'::regprocedure,'public.ride_invite_companion(text,text[],boolean,int,uuid)'::regprocedure,
  'public.ride_answer_companion(text,boolean)'::regprocedure,'public.ride_set_companion(uuid,text[],boolean)'::regprocedure,
  'public.ride_revoke_companion(uuid)'::regprocedure,'public.ride_companion_progress(uuid)'::regprocedure,
  'public.ride_my_companions()'::regprocedure] loop
   execute format('revoke all on function %s from public,anon,authenticated,service_role',f);
   execute format('grant execute on function %s to authenticated',f);
 end loop;
end $$;
