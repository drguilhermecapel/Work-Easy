-- 05 Bookings: schedule and jobs. Status changes only through transition_booking()
-- (or the service role); every change is written to booking_events and audit_log.
-- Rules enforced here: no overlapping active bookings per provider, the labor lock
-- for domestic work, and the platform fee (commission) computed on acceptance.

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  -- Null for a provider's own client without an account. History FKs use
  -- "on delete set null" so deleting an account keeps fiscal records (anonymized).
  client_id uuid references public.profiles (id) on delete set null,
  provider_client_id uuid references public.provider_clients (id) on delete set null,
  provider_id uuid references public.providers (id) on delete set null,
  occupation_slug text not null references public.occupations (slug) on update cascade,
  service_id uuid references public.services (id) on delete set null,
  request_id uuid references public.requests (id) on delete set null,
  proposal_id uuid references public.proposals (id) on delete set null,
  household_id uuid, -- references public.households, added in 09_care
  period tstzrange not null check (not isempty(period) and lower(period) is not null and upper(period) is not null),
  price_cents int not null check (price_cents >= 0),
  status public.booking_status not null default 'requested',
  origin public.booking_origin not null default 'platform',
  platform_fee_cents int not null default 0 check (platform_fee_cents >= 0),
  notes text check (char_length(notes) <= 2000),
  canceled_reason text check (char_length(canceled_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint bookings_no_overlap exclude using gist (provider_id with =, period with &&)
    where (status in ('requested', 'accepted', 'paid', 'in_progress'))
);

create index bookings_client_idx on public.bookings (client_id, created_at desc);
create index bookings_provider_idx on public.bookings (provider_id, created_at desc);
create index bookings_provider_client_idx on public.bookings (provider_client_id);
create index bookings_service_idx on public.bookings (service_id);
create index bookings_request_idx on public.bookings (request_id);
create index bookings_proposal_idx on public.bookings (proposal_id);
create index bookings_household_idx on public.bookings (household_id);
create index bookings_occupation_idx on public.bookings (occupation_slug);
create index bookings_status_idx on public.bookings (status);

create table public.booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  from_status public.booking_status, -- null when the booking is created
  to_status public.booking_status not null,
  actor_id uuid,
  reason text,
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index booking_events_booking_idx on public.booking_events (booking_id, at);

alter table public.bookings enable row level security;
alter table public.booking_events enable row level security;

-- ---------------------------------------------------------------------------
-- Rule helpers
-- ---------------------------------------------------------------------------

-- Domestic work on more than labor_lock_days_per_week distinct days in one ISO week
-- (Monday to Sunday, São Paulo time) for the same client or household is employment
-- (LC 150/2015). Counts bookings of labor-locked occupations that are not canceled and
-- assigned shifts. The advisory lock serializes concurrent checks per provider.
create function private.check_labor_lock(
  p_provider uuid,
  p_client uuid,
  p_provider_client uuid,
  p_household uuid,
  p_period tstzrange,
  p_booking uuid,
  p_shift uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit int := private.setting_int('labor_lock_days_per_week', 2);
  v_owner uuid;
  v_week date;
  v_days int;
begin
  if p_provider is null then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('labor_lock:' || p_provider::text, 0));

  -- The household owner and the household are the same employer.
  if p_household is not null then
    select h.owner_id into v_owner from public.households h where h.id = p_household;
  end if;

  for v_week in
    select distinct date_trunc('week', d)::date from private.local_days(p_period) d
  loop
    select count(distinct day) into v_days
      from (
        select d as day from private.local_days(p_period) d
        union all
        select d
          from public.bookings b
          join public.occupation_policies op on op.occupation_slug = b.occupation_slug and op.labor_lock
          cross join lateral private.local_days(b.period) d
         where b.provider_id = p_provider
           and b.id is distinct from p_booking
           and b.status <> 'canceled'
           and (b.client_id in (p_client, v_owner)
                or b.provider_client_id = p_provider_client
                or b.household_id = p_household)
        union all
        -- shifts and households are created in 09_care
        select d
          from public.shifts s
          join public.households h on h.id = s.household_id
          cross join lateral private.local_days(s.period) d
         where s.provider_id = p_provider
           and s.id is distinct from p_shift
           and s.status in ('assigned', 'checked_in', 'completed')
           and (s.household_id = p_household or h.owner_id in (p_client, v_owner))
      ) days
     where date_trunc('week', day)::date = v_week;

    if v_days > v_limit then
      raise exception 'labor_lock' using errcode = 'P0001',
        detail = format('week %s: %s days, limit %s', v_week, v_days, v_limit);
    end if;
  end loop;
end;
$$;

-- Commission rule. Zero when commission is off, for the provider's own clients, when
-- the occupation is not billed by first-service commission, or when this client and
-- provider already had a completed/released job.
create function private.platform_fee(
  p_booking uuid,
  p_client uuid,
  p_provider_client uuid,
  p_provider uuid,
  p_occupation text,
  p_origin public.booking_origin,
  p_price_cents int
)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.setting_bool('commission_enabled', false)
     or p_origin = 'own'
     or not exists (select 1 from public.occupation_policies op
                     where op.occupation_slug = p_occupation and op.billing = 'comissao_primeiro_servico')
     or exists (select 1 from public.bookings b
                 where b.provider_id = p_provider
                   and b.id is distinct from p_booking
                   and b.status in ('completed', 'released')
                   and (b.client_id = p_client or b.provider_client_id = p_provider_client)) then
    return 0;
  end if;
  return (p_price_cents::bigint * private.setting_int('commission_bps', 0) / 10000)::int;
end;
$$;

-- Transition matrix for participants and the payment webhook (service role).
-- Admins may apply any transition with a reason (checked in transition_booking).
create function private.booking_transition_allowed(
  p_actor text,
  p_from public.booking_status,
  p_to public.booking_status
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_actor
    when 'provider' then (p_from, p_to) in (
      ('requested', 'accepted'), ('requested', 'canceled'), ('accepted', 'in_progress'),
      ('paid', 'in_progress'), ('in_progress', 'completed'), ('accepted', 'canceled'))
    when 'client' then (p_from, p_to) in (
      ('requested', 'canceled'), ('accepted', 'canceled'), ('completed', 'disputed'),
      ('completed', 'released'))
    -- paid -> canceled is the refund path (PAYMENT_REFUNDED).
    when 'service' then (p_from, p_to) in (
      ('accepted', 'paid'), ('paid', 'released'), ('paid', 'canceled'))
      or (p_to = 'disputed' and p_from <> 'disputed')
    else false
  end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Participants may edit notes only; status goes through transition_booking().
create function private.guard_booking_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_context()
     and (to_jsonb(new) - 'notes' - 'updated_at') is distinct from (to_jsonb(old) - 'notes' - 'updated_at') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger bookings_10_guard
  before update on public.bookings
  for each row execute function private.guard_booking_update();

create trigger bookings_15_touch
  before update on public.bookings
  for each row execute function private.touch_updated_at();

-- The fee is fixed when the booking becomes accepted.
create function private.set_booking_fee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted') then
    new.platform_fee_cents := private.platform_fee(new.id, new.client_id, new.provider_client_id, new.provider_id,
                                                   new.occupation_slug, new.origin, new.price_cents);
  elsif tg_op = 'INSERT' then
    new.platform_fee_cents := 0;
  end if;
  return new;
end;
$$;

create trigger bookings_20_fee
  before insert or update of status on public.bookings
  for each row execute function private.set_booking_fee();

create function private.enforce_booking_labor_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'canceled'
     or not exists (select 1 from public.occupation_policies op
                     where op.occupation_slug = new.occupation_slug and op.labor_lock) then
    return new;
  end if;

  -- Only a change that can add a day for the same parties is checked again.
  if tg_op = 'UPDATE'
     and old.status <> 'canceled'
     and new.period = old.period
     and new.provider_id is not distinct from old.provider_id
     and new.client_id is not distinct from old.client_id
     and new.provider_client_id is not distinct from old.provider_client_id
     and new.household_id is not distinct from old.household_id then
    return new;
  end if;

  perform private.check_labor_lock(new.provider_id, new.client_id, new.provider_client_id,
                                   new.household_id, new.period, new.id, null);
  return new;
end;
$$;

create trigger bookings_30_labor_lock
  before insert or update on public.bookings
  for each row execute function private.enforce_booking_labor_lock();

-- History of every status, with the reason passed to transition_booking().
create function private.log_booking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text := nullif(current_setting('workeasy.transition_reason', true), '');
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return null;
  end if;

  insert into public.booking_events (booking_id, from_status, to_status, actor_id, reason)
  values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid(), v_reason);

  perform private.audit(
    case when tg_op = 'INSERT' then 'booking.created' else 'booking.transition' end,
    'booking', new.id::text,
    jsonb_build_object('from', case when tg_op = 'UPDATE' then old.status end, 'to', new.status,
                       'reason', v_reason, 'platform_fee_cents', new.platform_fee_cents));
  return null;
end;
$$;

create trigger bookings_40_log_status
  after insert or update of status on public.bookings
  for each row execute function private.log_booking_status();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create function public.compute_platform_fee(p_booking uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_booking public.bookings;
begin
  select * into v_booking from public.bookings where id = p_booking;
  if not found
     or not (private.is_service_role() or public.is_admin()
             or auth.uid() in (v_booking.client_id, v_booking.provider_id)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return private.platform_fee(v_booking.id, v_booking.client_id, v_booking.provider_client_id,
                              v_booking.provider_id, v_booking.occupation_slug, v_booking.origin,
                              v_booking.price_cents);
end;
$$;

create function public.transition_booking(
  p_booking uuid,
  p_to public.booking_status,
  p_reason text default null
)
returns public.booking_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_booking public.bookings;
  v_service boolean := private.is_service_role();
  v_admin boolean := public.is_admin();
  v_is_provider boolean;
  v_is_client boolean;
  v_ok boolean;
begin
  select * into v_booking from public.bookings where id = p_booking for update;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  v_is_provider := v_uid is not null and v_uid = v_booking.provider_id;
  v_is_client := v_uid is not null and v_uid = v_booking.client_id;
  if not (v_service or v_admin or v_is_provider or v_is_client) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_to is null or p_to = v_booking.status then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  v_ok := (v_is_provider and private.booking_transition_allowed('provider', v_booking.status, p_to))
       or (v_is_client and private.booking_transition_allowed('client', v_booking.status, p_to)
           and (p_to <> 'disputed' or now() <= upper(v_booking.period) + interval '7 days'))
       or (v_service and private.booking_transition_allowed('service', v_booking.status, p_to));

  if not v_ok and v_admin then
    if nullif(trim(p_reason), '') is null then
      raise exception 'not_allowed' using errcode = 'P0001', detail = 'reason required';
    end if;
    v_ok := true;
  end if;
  if not v_ok then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  perform set_config('workeasy.transition_reason', coalesce(p_reason, ''), true);
  begin
    update public.bookings
       set status = p_to,
           canceled_reason = case when p_to = 'canceled' then coalesce(p_reason, canceled_reason) else canceled_reason end
     where id = v_booking.id;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;
  perform set_config('workeasy.transition_reason', '', true);
  return p_to;
end;
$$;

-- Direct booking by a client inside the provider's availability and outside time off.
create function public.book_direct(
  p_provider uuid,
  p_service uuid,
  p_period tstzrange,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_service public.services;
  v_client public.profiles;
  v_start timestamp;
  v_end timestamp;
  v_booking uuid;
begin
  select * into v_client from public.profiles where id = v_uid and deleted_at is null;
  if not found or v_uid = p_provider or not public.is_provider_approved(p_provider) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select * into v_service from public.services where id = p_service and provider_id = p_provider and active;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if p_period is null or isempty(p_period) or lower(p_period) is null or upper(p_period) is null
     or lower(p_period) <= now() then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  v_start := lower(p_period) at time zone 'America/Sao_Paulo';
  v_end := upper(p_period) at time zone 'America/Sao_Paulo';
  if v_start::date <> v_end::date
     or not exists (
       select 1 from public.availability a
        where a.provider_id = p_provider
          and a.weekday = extract(dow from v_start)
          and a.start_time <= v_start::time
          and v_end::time <= a.end_time
     )
     or exists (select 1 from public.time_off t where t.provider_id = p_provider and t.period && p_period) then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end if;

  begin
    insert into public.bookings (client_id, provider_client_id, provider_id, occupation_slug, service_id,
                                 period, price_cents, status, origin, notes)
    values (v_uid, private.ensure_provider_client(p_provider, v_client), p_provider, v_service.occupation_slug,
            v_service.id, p_period, v_service.price_min_cents, 'requested', 'platform', p_notes)
    returning id into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;
  return v_booking;
end;
$$;

-- A Pro provider schedules a job with a client of their own: accepted, never charged
-- a commission.
create function public.create_own_booking(
  p_provider_client uuid,
  p_occupation text,
  p_period tstzrange,
  p_price_cents int,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_client public.provider_clients;
  v_booking uuid;
begin
  select * into v_client from public.provider_clients where id = p_provider_client and provider_id = v_uid;
  if not found
     or not exists (select 1 from public.providers p where p.id = v_uid and p.status <> 'suspended')
     or not exists (select 1 from public.provider_occupations po
                     where po.provider_id = v_uid and po.occupation_slug = p_occupation) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  begin
    insert into public.bookings (client_id, provider_client_id, provider_id, occupation_slug, period,
                                 price_cents, status, origin, notes)
    values (v_client.client_id, v_client.id, v_uid, p_occupation, p_period, p_price_cents, 'accepted', 'own', p_notes)
    returning id into v_booking;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;
  return v_booking;
end;
$$;

-- Free slots of p_duration_minutes in one São Paulo day, starting every 30 minutes
-- inside the availability windows, outside time off, bookings and shifts.
create function public.available_slots(p_provider uuid, p_day date, p_duration_minutes int)
returns tstzrange[]
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_length interval := make_interval(mins => p_duration_minutes);
begin
  if p_duration_minutes is null or p_duration_minutes not between 5 and 1440
     or not public.is_provider_approved(p_provider) then
    return '{}';
  end if;

  return coalesce((
    select array_agg(slot order by lower(slot))
      from (
        select distinct tstzrange(s, s + v_length) as slot
          from public.availability a
          cross join lateral generate_series(
            (p_day + a.start_time) at time zone 'America/Sao_Paulo',
            ((p_day + a.end_time) at time zone 'America/Sao_Paulo') - v_length,
            interval '30 minutes') s
         where a.provider_id = p_provider
           and a.weekday = extract(dow from p_day)
      ) slots
     where lower(slot) > now()
       and not exists (select 1 from public.time_off t
                        where t.provider_id = p_provider and t.period && slots.slot)
       and not exists (select 1 from public.bookings b
                        where b.provider_id = p_provider and b.period && slots.slot
                          and b.status in ('requested', 'accepted', 'paid', 'in_progress'))
       and not exists (select 1 from public.shifts sh -- created in 09_care
                        where sh.provider_id = p_provider and sh.period && slots.slot
                          and sh.status in ('assigned', 'checked_in'))
  ), '{}');
end;
$$;

revoke all on function public.compute_platform_fee(uuid) from public;
revoke all on function public.transition_booking(uuid, public.booking_status, text) from public;
revoke all on function public.book_direct(uuid, uuid, tstzrange, text) from public;
revoke all on function public.create_own_booking(uuid, text, tstzrange, int, text) from public;
revoke all on function public.available_slots(uuid, date, int) from public;
grant execute on function public.compute_platform_fee(uuid) to authenticated;
grant execute on function public.transition_booking(uuid, public.booking_status, text) to authenticated;
grant execute on function public.book_direct(uuid, uuid, tstzrange, text) to authenticated;
grant execute on function public.create_own_booking(uuid, text, tstzrange, int, text) to authenticated;
grant execute on function public.available_slots(uuid, date, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Counterparts: people who share a job may read each other's profile and the
-- provider row (name, phone). Extended with care shifts in 09_care.
-- ---------------------------------------------------------------------------

create function private.is_counterpart(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bookings b
     where (b.client_id = (select auth.uid()) and b.provider_id = p_user)
        or (b.provider_id = (select auth.uid()) and b.client_id = p_user)
  )
  or exists (
    -- a client sees who sent a proposal (the provider never sees the client before a match)
    select 1 from public.proposals p
      join public.requests r on r.id = p.request_id
     where p.provider_id = p_user and r.client_id = (select auth.uid())
  );
$$;

grant execute on function private.is_counterpart(uuid) to authenticated;

create policy profiles_select_counterpart on public.profiles
  for select to authenticated using (private.is_counterpart(id));

create policy providers_select_counterpart on public.providers
  for select to authenticated using (private.is_counterpart(id));

-- ---------------------------------------------------------------------------
-- Policies and grants
-- ---------------------------------------------------------------------------

create policy bookings_select on public.bookings
  for select to authenticated
  using (client_id = (select auth.uid()) or provider_id = (select auth.uid()) or (select public.is_admin()));
create policy bookings_update_participant on public.bookings
  for update to authenticated
  using (client_id = (select auth.uid()) or provider_id = (select auth.uid()))
  with check (client_id = (select auth.uid()) or provider_id = (select auth.uid()));

-- Visible to whoever can see the booking (the subquery runs under bookings RLS).
create policy booking_events_select on public.booking_events
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id));

grant select, update on public.bookings to authenticated;
grant select on public.booking_events to authenticated;

revoke all on all functions in schema private from public;
grant execute on function private.is_counterpart(uuid) to authenticated;
