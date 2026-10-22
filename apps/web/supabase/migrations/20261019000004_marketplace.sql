-- 04 Marketplace: client requests and provider proposals.
-- Providers never read requests directly: open_requests_for_me() returns the open
-- requests that match their occupations and neighborhoods, without client contact data.

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  occupation_slug text not null references public.occupations (slug) on update cascade,
  neighborhood_id uuid not null references public.neighborhoods (id),
  description text not null check (char_length(description) between 10 and 2000),
  preferred_dates text check (char_length(preferred_dates) <= 500),
  urgent boolean not null default false,
  status public.request_status not null default 'open',
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create index requests_client_idx on public.requests (client_id, created_at desc);
create index requests_open_match_idx on public.requests (occupation_slug, neighborhood_id) where status = 'open';
create index requests_neighborhood_idx on public.requests (neighborhood_id);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests (id) on delete cascade,
  provider_id uuid not null default auth.uid() references public.providers (id) on delete cascade,
  price_cents int not null check (price_cents > 0),
  message text check (char_length(message) <= 2000),
  valid_until timestamptz,
  status public.proposal_status not null default 'sent',
  created_at timestamptz not null default now(),
  unique (request_id, provider_id)
);

create index proposals_provider_idx on public.proposals (provider_id, created_at desc);

alter table public.requests enable row level security;
alter table public.proposals enable row level security;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Clients create open requests and may only cancel them; matching is done by
-- accept_proposal() and expiry by the scheduler.
create function private.guard_request()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_client_context() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.status := 'open';
    new.expires_at := least(coalesce(new.expires_at, now() + interval '7 days'), now() + interval '30 days');
    return new;
  end if;

  if new.client_id is distinct from old.client_id
     or new.occupation_slug is distinct from old.occupation_slug
     or new.neighborhood_id is distinct from old.neighborhood_id
     or new.expires_at is distinct from old.expires_at then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status
     and not (old.status = 'open' and new.status = 'canceled') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger requests_guard
  before insert or update on public.requests
  for each row execute function private.guard_request();

-- Providers send proposals and may edit or withdraw them while sent; acceptance and
-- decline come from accept_proposal(). (Invoker: it must see the API role.)
create function private.guard_proposal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_client_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'sent';
    return new;
  end if;
  if new.request_id is distinct from old.request_id
     or new.provider_id is distinct from old.provider_id
     or (new.status is distinct from old.status and not (old.status = 'sent' and new.status = 'withdrawn'))
     or (old.status <> 'sent' and (new.price_cents, new.message, new.valid_until)
           is distinct from (old.price_cents, old.message, old.valid_until)) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger proposals_10_guard
  before insert or update on public.proposals
  for each row execute function private.guard_proposal();

-- A proposal needs an open request, an approved provider with the occupation approved (and
-- its registry not rejected) who serves the neighborhood, and a free slot under proposal_limit. The request row is
-- locked so concurrent proposals cannot pass the limit together.
create function private.check_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.requests;
  v_active int;
begin
  -- Only a new proposal, or one becoming active again, takes a slot.
  if tg_op = 'UPDATE'
     and not (new.status in ('sent', 'accepted') and old.status not in ('sent', 'accepted')) then
    return new;
  end if;

  select * into v_request from public.requests where id = new.request_id for update;

  if v_request.status is distinct from 'open' or v_request.expires_at <= now() then
    raise exception 'request_not_open' using errcode = 'P0001';
  end if;

  if v_request.client_id = new.provider_id
     or not private.offers_occupation(new.provider_id, v_request.occupation_slug)
     or not private.provider_serves(new.provider_id, v_request.neighborhood_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select count(*) into v_active
    from public.proposals p
   where p.request_id = new.request_id and p.status in ('sent', 'accepted') and p.id <> new.id;

  if v_active >= private.setting_int('proposal_limit', 3) then
    raise exception 'proposal_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger proposals_20_check
  before insert or update on public.proposals
  for each row execute function private.check_proposal();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.open_requests_for_me()
returns table (
  id uuid,
  occupation_slug text,
  neighborhood_id uuid,
  neighborhood_name text,
  description text,
  preferred_dates text,
  urgent boolean,
  expires_at timestamptz,
  created_at timestamptz,
  proposal_count int,
  my_proposal_id uuid,
  my_proposal_status public.proposal_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.occupation_slug, r.neighborhood_id, n.name, r.description, r.preferred_dates,
         r.urgent, r.expires_at, r.created_at,
         (select count(*)::int from public.proposals p
           where p.request_id = r.id and p.status in ('sent', 'accepted')),
         mine.id, mine.status
    from public.providers me
    join public.requests r
      on r.status = 'open' and r.expires_at > now() and r.client_id <> me.id
    join public.neighborhoods n on n.id = r.neighborhood_id
    left join public.proposals mine on mine.request_id = r.id and mine.provider_id = me.id
   where me.id = (select auth.uid())
     and me.status = 'approved'
     and me.accepts_platform_requests
     and exists (select 1 from public.provider_occupations po
                  where po.provider_id = me.id and po.occupation_slug = r.occupation_slug
                    and po.approved and po.registry_status <> 'rejected')
     and private.provider_serves(me.id, r.neighborhood_id)
   order by r.urgent desc, r.created_at desc;
$$;

-- The client who owns the request accepts one proposal: the others are declined, the
-- request is matched and an accepted booking is created (labor lock and overlap rules
-- run on that insert). Returns the booking id.
create function public.accept_proposal(p_proposal uuid, p_period tstzrange)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_proposal public.proposals;
  v_request public.requests;
  v_client public.profiles;
  v_provider_client uuid;
  v_booking uuid;
begin
  select * into v_proposal from public.proposals where id = p_proposal for update;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select * into v_request from public.requests where id = v_proposal.request_id for update;
  if v_request.client_id is distinct from v_uid then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  -- The scheduler closes expired requests only every 15 minutes: check the date here too.
  if v_request.status <> 'open' or v_request.expires_at <= now() then
    raise exception 'request_not_open' using errcode = 'P0001';
  end if;
  if v_proposal.status <> 'sent' or v_proposal.valid_until < now() then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  -- The client picks the period: it must be a future slot of at most 24 hours within
  -- two years (a past or months-long period would block the provider's agenda and fill the
  -- labor-lock count).
  if p_period is null or isempty(p_period) or lower(p_period) is null or upper(p_period) is null
     or lower(p_period) <= now()
     or lower(p_period) > now() + interval '2 years'
     or upper(p_period) - lower(p_period) > interval '24 hours' then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  update public.proposals set status = 'accepted' where id = v_proposal.id;
  update public.proposals set status = 'declined'
   where request_id = v_request.id and id <> v_proposal.id and status = 'sent';
  update public.requests set status = 'matched' where id = v_request.id;

  select * into v_client from public.profiles where id = v_uid;
  v_provider_client := private.ensure_provider_client(v_proposal.provider_id, v_client);

  begin
    insert into public.bookings (client_id, provider_client_id, provider_id, occupation_slug, request_id,
                                 proposal_id, period, price_cents, status, origin)
    values (v_uid, v_provider_client, v_proposal.provider_id, v_request.occupation_slug, v_request.id,
            v_proposal.id, p_period, v_proposal.price_cents, 'accepted', 'platform')
    returning id into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;

  perform private.audit('proposal.accepted', 'proposal', v_proposal.id::text,
                        jsonb_build_object('booking_id', v_booking, 'request_id', v_request.id));
  return v_booking;
end;
$$;

-- Finds or creates the provider's CRM entry for a platform client.
create function private.ensure_provider_client(p_provider uuid, p_client public.profiles)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.provider_clients (provider_id, client_id, name, phone, origin)
  values (p_provider, p_client.id, coalesce(p_client.full_name, 'Cliente'), p_client.phone, 'platform')
  on conflict (provider_id, client_id) where client_id is not null
  do update set phone = coalesce(public.provider_clients.phone, excluded.phone)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.open_requests_for_me() from public;
revoke all on function public.accept_proposal(uuid, tstzrange) from public;
grant execute on function public.open_requests_for_me() to authenticated;
grant execute on function public.accept_proposal(uuid, tstzrange) to authenticated;

-- ---------------------------------------------------------------------------
-- Request assistant quota (request-assist Edge Function)
-- ---------------------------------------------------------------------------

-- One counter per user and hour. RLS is on and there is deliberately no policy and no grant
-- for the API roles: only take_assist_quota() (service role) reads or writes it.
create table public.assist_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  window_start timestamptz not null,
  count int not null default 0 check (count >= 0),
  primary key (user_id, window_start)
);

alter table public.assist_usage enable row level security;

-- Consumes one unit of the current hour (UTC clock hour) for p_user and tells whether it was
-- granted. Atomic: the insert-or-increment is one statement and the increment only happens
-- while count < p_limit, so concurrent calls can never pass the limit. Returns false when the
-- hour is used up, and always false for a limit below 1 (0 turns the assistant off).
create function public.take_assist_quota(p_user uuid, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('hour', now() at time zone 'UTC') at time zone 'UTC';
  v_count int;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_user is null or coalesce(p_limit, 0) < 1 then
    return false;
  end if;

  insert into public.assist_usage as u (user_id, window_start, count)
  values (p_user, v_window, 1)
  on conflict (user_id, window_start) do update set count = u.count + 1
    where u.count < p_limit
  returning u.count into v_count;

  return v_count is not null;
end;
$$;

revoke all on function public.take_assist_quota(uuid, int) from public, anon, authenticated;
grant execute on function public.take_assist_quota(uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- Policies and grants
-- ---------------------------------------------------------------------------

create policy requests_select on public.requests
  for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_admin()));
create policy requests_insert_own on public.requests
  for insert to authenticated with check (client_id = (select auth.uid()));
create policy requests_update_own on public.requests
  for update to authenticated
  using (client_id = (select auth.uid())) with check (client_id = (select auth.uid()));

-- Providers see their own proposals; clients see the proposals on their requests.
create policy proposals_select on public.proposals
  for select to authenticated
  using (
    provider_id = (select auth.uid())
    or exists (select 1 from public.requests r where r.id = request_id and r.client_id = (select auth.uid()))
    or (select public.is_admin())
  );
create policy proposals_insert_own on public.proposals
  for insert to authenticated with check (provider_id = (select auth.uid()));
create policy proposals_update_own on public.proposals
  for update to authenticated
  using (provider_id = (select auth.uid())) with check (provider_id = (select auth.uid()));

grant select, insert, update on public.requests to authenticated;
grant select, insert, update on public.proposals to authenticated;

revoke all on all functions in schema private from public;
