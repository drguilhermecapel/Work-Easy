-- Fixes from the adversarial review of PR #4 (24/11/2026). Every item below was reproduced in a rolled
-- back transaction before it was fixed.
--
--   1. notify_new_request ran for every row of an insert BEFORE the daily limit of requests (a statement
--      trigger) was checked: one INSERT of 1000 rows scanned the providers 1000 times (49 s with 300
--      providers) and was rejected only at the end. The row trigger now skips the scan when the client is
--      already over the daily limit.
--   2. pedido_novo shared the daily cap of notifications with the transactional messages (payment received,
--      booking confirmed, reminders), so a few accounts creating requests could silence a provider. pedido_novo
--      now has a cap of its own: a provider gets at most 10 a day, leaving the shared cap for the others.
--   3. my_blocks() and a direct SELECT on user_blocks returned blocked_id, which for a block made from a request
--      is the uuid of the client: the provider learned who the client is. my_blocks() now returns `ref`, the id of
--      the provider (already public) or an opaque handle for a client; unblock_user takes that handle; and
--      authenticated no longer reads user_blocks directly.
--   4. quotes.completed_at could still be written by INSERT: the guard now covers INSERT too.
--   5. approved_at and received_at were stamped with now() on the first UPDATE of a row that was already
--      approved (or paid) before the columns existed. They are stamped only on the transition into the state.
--   6. admin_set_setting had no range for pro_grace_days, while the webhook caps the grace at 60 days and the
--      expiry job did not: the key now accepts 0 to 60 days, so the function and the job agree.

-- 1 and 2 ---------------------------------------------------------------------
create or replace function private.notify_new_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider uuid;
begin
  if new.status <> 'open' then
    return null;
  end if;
  -- The daily limit is checked by a statement trigger that runs after the rows, and refuses the whole
  -- insert: do not scan the providers for a request that is about to be refused
  if (select count(*) from public.requests r
       where r.client_id = new.client_id
         and private.sp_date(r.created_at) = private.sp_date(now())) > 20 then
    return null;
  end if;
  for v_provider in
    select pr.id
      from public.providers pr
      join public.profiles pf on pf.id = pr.id and pf.deleted_at is null
     where pr.status = 'approved'
       and pr.accepts_platform_requests
       and pr.id <> new.client_id
       and exists (select 1 from public.provider_occupations po
                    where po.provider_id = pr.id and po.occupation_slug = new.occupation_slug
                      and po.approved and po.registry_status <> 'rejected')
       and private.provider_serves(pr.id, new.neighborhood_id)
       and not private.blocked_between(pr.id, new.client_id)
       -- A cap of its own, so new requests cannot use up what the transactional messages need
       and (select count(*) from public.notifications n
             where n.user_id = pr.id and n.template = 'pedido_novo'
               and n.created_at > now() - interval '1 day') < 10
     order by random()
     limit 30
  loop
    perform private.notify(v_provider, 'pedido_novo', jsonb_build_object('request_id', new.id));
  end loop;
  return null;
end;
$$;

-- 3 ---------------------------------------------------------------------------
-- A client is identified to the provider only by the request; the handle of a block made from it must not
-- reveal the client id. Not secret-keyed on purpose: it is only a name for the row, and the client ids are not
-- known to the provider, so there is nothing to confirm a guess against.
create function private.block_ref(p_blocker uuid, p_blocked uuid)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select md5('block:' || p_blocker::text || ':' || p_blocked::text)::uuid;
$$;

revoke all on function private.block_ref(uuid, uuid) from public, anon, authenticated;

drop function public.my_blocks();
create function public.my_blocks()
returns table (ref uuid, label text, origin text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select case when b.origin = 'provider' then b.blocked_id else private.block_ref(b.blocker_id, b.blocked_id) end,
         case when b.origin = 'provider' then pr.display_name end,
         b.origin,
         b.created_at
    from public.user_blocks b
    left join public.providers pr on pr.id = b.blocked_id and pr.status = 'approved'
   where b.blocker_id = (select auth.uid())
   order by b.created_at desc;
$$;

revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

-- Takes the `ref` of my_blocks(): the provider id of a provider block, the opaque handle of a request block.
-- The id of a client is not accepted, so it cannot be used to test a guess.
create or replace function public.unblock_user(p_blocked uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.user_blocks b
   where b.blocker_id = (select auth.uid())
     and ((b.origin = 'provider' and b.blocked_id = p_blocked)
          or (b.origin = 'request' and private.block_ref(b.blocker_id, b.blocked_id) = p_blocked));
$$;

-- Nothing in the app reads the table directly any more (my_blocks is the way); the blocked id stays out of reach
revoke select on public.user_blocks from authenticated;
drop policy user_blocks_select on public.user_blocks;

-- 4 ---------------------------------------------------------------------------
create or replace function private.guard_quote_completed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_context() then
    if tg_op = 'INSERT' then
      new.completed_at := null;
    elsif new.completed_at is distinct from old.completed_at then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger quotes_05_completed_guard on public.quotes;
create trigger quotes_05_completed_guard
  before insert or update on public.quotes
  for each row execute function private.guard_quote_completed();

-- 5 ---------------------------------------------------------------------------
create or replace function private.stamp_payment_received()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.received_at := case when new.status in ('confirmed', 'received', 'held', 'released') then coalesce(new.received_at, now()) end;
  else
    -- Only the transition into a paid state stamps the date; a row paid before the column existed stays null
    new.received_at := old.received_at;
    if new.status in ('confirmed', 'received', 'held', 'released')
       and old.status not in ('confirmed', 'received', 'held', 'released')
       and old.received_at is null then
      new.received_at := now();
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.stamp_provider_approved()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.approved_at := case when new.status = 'approved' then now() end;
  else
    new.approved_at := old.approved_at;
    -- Only the transition into 'approved' stamps the date; a provider approved before the column existed stays null
    if new.status = 'approved' and old.status is distinct from 'approved' and old.approved_at is null then
      new.approved_at := now();
    end if;
  end if;
  return new;
end;
$$;

-- 6 ---------------------------------------------------------------------------
create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_min numeric;
  v_max numeric;
  v_number numeric;
begin
  perform private.require_admin();
  if nullif(trim(p_key), '') is null or p_value is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- The keys the administration screen edits have a type and a range, checked here as well as
  -- on the screen (a direct call cannot store 1000000 as the commission). Other keys pass.
  -- Ranges: commission_cap_cents is in cents (0 = no ceiling), free_proposals_per_month counts
  -- proposals of the free plan in a calendar month (0 = no limit), pro_trial_days is the free
  -- Pro period of an account's first subscription (0 = no trial). care_line_open and
  -- pilot_neighborhoods are the launch controls (migration 20261124100001).
  if p_key in ('commission_enabled', 'escrow_enabled', 'care_line_open') then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'invalid_setting' using errcode = '23514', detail = p_key || ' is true or false';
    end if;
  elsif p_key = 'pilot_neighborhoods' then
    -- A list of neighborhood slugs that exist; the empty list means every neighborhood
    if jsonb_typeof(p_value) <> 'array'
       or jsonb_array_length(p_value) > 200
       or exists (select 1 from jsonb_array_elements(p_value) e
                   where jsonb_typeof(e.value) <> 'string'
                      or not exists (select 1 from public.neighborhoods n where n.slug = e.value #>> '{}')) then
      raise exception 'invalid_setting' using errcode = '23514',
        detail = p_key || ' is a list of neighborhood slugs that exist';
    end if;
  elsif p_key in ('commission_bps', 'pro_price_cents', 'proposal_limit', 'labor_lock_days_per_week',
                  'commission_cap_cents', 'free_proposals_per_month', 'pro_trial_days', 'pro_grace_days') then
    select r.lo, r.hi into v_min, v_max
      from (values ('commission_bps', 0, 5000), ('pro_price_cents', 100, 100000),
                   ('proposal_limit', 1, 10), ('labor_lock_days_per_week', 1, 7),
                   ('commission_cap_cents', 0, 1000000), ('free_proposals_per_month', 0, 100),
                   ('pro_trial_days', 0, 90), ('pro_grace_days', 0, 60)) as r(k, lo, hi)
     where r.k = p_key;
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'invalid_setting' using errcode = '23514', detail = p_key || ' is a whole number';
    end if;
    v_number := (p_value #>> '{}')::numeric;
    if v_number <> trunc(v_number) or v_number < v_min or v_number > v_max then
      raise exception 'invalid_setting' using errcode = '23514',
        detail = p_key || ' is a whole number from ' || v_min || ' to ' || v_max;
    end if;
  end if;

  select value into v_old from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;

  perform private.audit('setting.changed', 'platform_setting', p_key,
                        jsonb_build_object('from', v_old, 'to', p_value));
  return p_value;
end;
$$;
