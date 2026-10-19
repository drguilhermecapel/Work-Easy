-- 09 Care line: households, care recipients (no diagnosis, no medication: health data
-- stays out), shifts offered to caregivers, check-in/out and a non-clinical daily
-- report. The labor lock always applies to shifts.

create table public.households (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  neighborhood_id uuid references public.neighborhoods (id),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

create index households_owner_idx on public.households (owner_id);
create index households_neighborhood_idx on public.households (neighborhood_id);

alter table public.bookings
  add constraint bookings_household_id_fkey foreign key (household_id) references public.households (id) on delete set null;

create table public.care_recipients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 60),
  birth_year smallint check (birth_year between 1900 and 2100),
  preferences text check (char_length(preferences) <= 2000),
  emergency_contact text check (char_length(emergency_contact) <= 300),
  created_at timestamptz not null default now()
);

create index care_recipients_household_idx on public.care_recipients (household_id);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  care_recipient_id uuid references public.care_recipients (id) on delete set null,
  provider_id uuid references public.providers (id) on delete set null,
  period tstzrange not null check (not isempty(period) and lower(period) is not null and upper(period) is not null),
  rate_cents int not null check (rate_cents >= 0),
  caregiver_payout_cents int check (caregiver_payout_cents >= 0),
  status public.shift_status not null default 'open',
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  constraint shifts_no_overlap exclude using gist (provider_id with =, period with &&)
    where (status in ('assigned', 'checked_in'))
);

create index shifts_household_idx on public.shifts (household_id, lower(period));
create index shifts_provider_idx on public.shifts (provider_id);
create index shifts_care_recipient_idx on public.shifts (care_recipient_id);
create index shifts_status_idx on public.shifts (status);

create table public.shift_offers (
  shift_id uuid not null references public.shifts (id) on delete cascade,
  provider_id uuid not null references public.providers (id) on delete cascade,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  primary key (shift_id, provider_id)
);

create index shift_offers_provider_idx on public.shift_offers (provider_id, status);

create table public.checkins (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  provider_id uuid references public.providers (id) on delete set null,
  kind text not null check (kind in ('in', 'out')),
  at timestamptz not null default now(),
  lat numeric check (lat between -90 and 90),
  lng numeric check (lng between -180 and 180),
  created_at timestamptz not null default now(),
  unique (shift_id, kind)
);

create index checkins_provider_idx on public.checkins (provider_id);

create table public.daily_reports (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null unique references public.shifts (id) on delete cascade,
  provider_id uuid references public.providers (id) on delete set null,
  meals text check (char_length(meals) <= 2000),
  activities text check (char_length(activities) <= 2000),
  mood text check (char_length(mood) <= 500),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

create index daily_reports_provider_idx on public.daily_reports (provider_id);

alter table public.households enable row level security;
alter table public.care_recipients enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_offers enable row level security;
alter table public.checkins enable row level security;
alter table public.daily_reports enable row level security;

-- ---------------------------------------------------------------------------
-- Helpers and triggers
-- ---------------------------------------------------------------------------

create function private.owns_household(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.households h where h.id = p_household and h.owner_id = (select auth.uid()));
$$;

-- Policy helpers (security definer, so shifts and shift_offers policies do not recurse).
create function private.owns_shift(p_shift uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.shifts s join public.households h on h.id = s.household_id
                  where s.id = p_shift and h.owner_id = (select auth.uid()));
$$;

create function private.has_open_shift_offer(p_shift uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.shift_offers o
                  where o.shift_id = p_shift and o.provider_id = (select auth.uid()) and o.status = 'offered');
$$;

-- Families create open shifts and edit them while nobody is assigned; assignment and
-- status go through offer_shift/accept_shift_offer/check_in/cancel_shift.
create function private.guard_shift()
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
    new.provider_id := null;
    return new;
  end if;
  if new.status is distinct from old.status
     or new.provider_id is distinct from old.provider_id
     or new.household_id is distinct from old.household_id then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if old.status not in ('open', 'offered')
     and (new.period, new.rate_cents, new.caregiver_payout_cents) is distinct from
         (old.period, old.rate_cents, old.caregiver_payout_cents) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger shifts_10_guard
  before insert or update on public.shifts
  for each row execute function private.guard_shift();

create function private.enforce_shift_labor_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider_id is null or new.status not in ('assigned', 'checked_in', 'completed') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and old.status in ('assigned', 'checked_in', 'completed')
     and new.provider_id is not distinct from old.provider_id
     and new.period = old.period
     and new.household_id = old.household_id then
    return new;
  end if;
  perform private.check_labor_lock(new.provider_id, null, null, new.household_id, new.period, null, new.id);
  return new;
end;
$$;

create trigger shifts_20_labor_lock
  before insert or update on public.shifts
  for each row execute function private.enforce_shift_labor_lock();

-- Shift offered -> caregiver.
create function private.notify_shift_offered()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'offered' and (tg_op = 'INSERT' or old.status is distinct from 'offered') then
    perform private.notify(new.provider_id, 'plantao_oferecido',
                           jsonb_build_object('shift_id', s.id, 'starts_at', lower(s.period),
                                              'ends_at', upper(s.period), 'payout_cents', s.caregiver_payout_cents))
      from public.shifts s where s.id = new.shift_id;
  end if;
  return null;
end;
$$;

create trigger shift_offers_notify
  after insert or update of status on public.shift_offers
  for each row execute function private.notify_shift_offered();

-- Care shifts also make the family and the caregiver counterparts.
create or replace function private.is_counterpart(p_user uuid)
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
    select 1 from public.proposals p
      join public.requests r on r.id = p.request_id
     where p.provider_id = p_user and r.client_id = (select auth.uid())
  )
  or exists (
    -- the family sees caregivers offered or assigned; the assigned caregiver sees the family
    select 1 from public.shifts s
      join public.households h on h.id = s.household_id
      left join public.shift_offers o on o.shift_id = s.id and o.provider_id = p_user
     where (h.owner_id = (select auth.uid()) and (s.provider_id = p_user or o.provider_id is not null))
        or (s.provider_id = (select auth.uid()) and h.owner_id = p_user)
  );
$$;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Admin or household owner offers a shift to approved caregivers. Returns how many
-- offers are open after the call.
create function public.offer_shift(p_shift uuid, p_providers uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.shifts;
  v_count int;
begin
  select * into v_shift from public.shifts where id = p_shift for update;
  if not found or not (public.is_admin() or private.owns_household(v_shift.household_id)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_shift.status not in ('open', 'offered') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if exists (select 1 from unnest(coalesce(p_providers, '{}')) u(id) where not public.is_provider_approved(u.id)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  insert into public.shift_offers (shift_id, provider_id)
  select v_shift.id, u.id from unnest(p_providers) u(id)
  on conflict (shift_id, provider_id) do update set status = 'offered'
   where public.shift_offers.status in ('declined', 'expired');

  select count(*) into v_count from public.shift_offers where shift_id = v_shift.id and status = 'offered';
  if v_count > 0 then
    update public.shifts set status = 'offered' where id = v_shift.id;
  end if;
  perform private.audit('shift.offered', 'shift', v_shift.id::text, jsonb_build_object('providers', p_providers));
  return v_count;
end;
$$;

-- The first caregiver to accept takes the shift; the other offers expire.
create function public.accept_shift_offer(p_shift uuid)
returns public.shift_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts;
begin
  select * into v_shift from public.shifts where id = p_shift for update;
  if not found or not exists (select 1 from public.shift_offers o
                               where o.shift_id = p_shift and o.provider_id = v_uid and o.status = 'offered') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_shift.status <> 'offered' then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  begin
    update public.shifts set provider_id = v_uid, status = 'assigned' where id = p_shift;
  exception when exclusion_violation then
    raise exception 'slot_unavailable' using errcode = 'P0001';
  end;
  update public.shift_offers set status = case when provider_id = v_uid then 'accepted' else 'expired' end
   where shift_id = p_shift and status = 'offered';
  perform private.audit('shift.accepted', 'shift', p_shift::text, '{}'::jsonb);
  return 'assigned';
end;
$$;

-- Assigned caregiver checks in within 2 h of the start and out within 2 h of the end.
create function public.check_in(p_shift uuid, p_kind text, p_lat numeric default null, p_lng numeric default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts;
  v_id uuid;
begin
  select * into v_shift from public.shifts where id = p_shift for update;
  if not found or v_shift.provider_id is distinct from v_uid or p_kind not in ('in', 'out') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if (p_kind = 'in' and v_shift.status <> 'assigned') or (p_kind = 'out' and v_shift.status <> 'checked_in') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if abs(extract(epoch from now() - case when p_kind = 'in' then lower(v_shift.period) else upper(v_shift.period) end))
     > 2 * 3600 then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'outside the check-in window';
  end if;

  insert into public.checkins (shift_id, provider_id, kind, lat, lng)
  values (p_shift, v_uid, p_kind, p_lat, p_lng)
  returning id into v_id;
  update public.shifts set status = case when p_kind = 'in' then 'checked_in' else 'completed' end::public.shift_status
   where id = p_shift;
  return v_id;
end;
$$;

create function public.submit_daily_report(
  p_shift uuid,
  p_meals text default null,
  p_activities text default null,
  p_mood text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if not exists (select 1 from public.shifts s
                  where s.id = p_shift and s.provider_id = v_uid and s.status in ('checked_in', 'completed')) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  insert into public.daily_reports (shift_id, provider_id, meals, activities, mood, notes)
  values (p_shift, v_uid, p_meals, p_activities, p_mood, p_notes)
  on conflict (shift_id) do update
    set meals = excluded.meals, activities = excluded.activities, mood = excluded.mood, notes = excluded.notes
  returning id into v_id;
  return v_id;
end;
$$;

-- Caregiver cancels: the shift goes back to open and is offered again to the other
-- caregivers already invited. Family (or admin) cancels: the shift is canceled.
create function public.cancel_shift(p_shift uuid, p_reason text default null)
returns public.shift_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts;
  v_status public.shift_status;
begin
  select * into v_shift from public.shifts where id = p_shift for update;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if v_shift.provider_id = v_uid then
    if v_shift.status <> 'assigned' then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    update public.shift_offers set status = case when provider_id = v_uid then 'declined' else 'offered' end
     where shift_id = p_shift and (provider_id = v_uid or status in ('offered', 'expired'));
    update public.shifts set provider_id = null, status = 'open' where id = p_shift;
    v_status := 'open';
    if exists (select 1 from public.shift_offers o where o.shift_id = p_shift and o.status = 'offered') then
      update public.shifts set status = 'offered' where id = p_shift;
      v_status := 'offered';
    end if;
  elsif private.owns_household(v_shift.household_id) or public.is_admin() then
    if v_shift.status not in ('open', 'offered', 'assigned') then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    update public.shifts set status = 'canceled' where id = p_shift;
    update public.shift_offers set status = 'expired' where shift_id = p_shift and status = 'offered';
    v_status := 'canceled';
  else
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  perform private.audit('shift.canceled', 'shift', p_shift::text,
                        jsonb_build_object('by_caregiver', v_shift.provider_id = v_uid, 'reason', p_reason,
                                           'status', v_status));
  return v_status;
end;
$$;

-- The caregiver's view of offered and assigned shifts: only the care recipient's first
-- name and the household neighborhood.
create function public.caregiver_shifts()
returns table (
  shift_id uuid,
  period tstzrange,
  status public.shift_status,
  offer_status text,
  caregiver_payout_cents int,
  notes text,
  neighborhood_name text,
  recipient_first_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.period, s.status, o.status, s.caregiver_payout_cents, s.notes, n.name, cr.first_name
    from public.shifts s
    join public.households h on h.id = s.household_id
    left join public.neighborhoods n on n.id = h.neighborhood_id
    left join public.care_recipients cr on cr.id = s.care_recipient_id
    left join public.shift_offers o on o.shift_id = s.id and o.provider_id = (select auth.uid())
   where s.provider_id = (select auth.uid())
      or (o.status = 'offered' and s.status = 'offered')
   order by lower(s.period);
$$;

revoke all on function public.offer_shift(uuid, uuid[]) from public;
revoke all on function public.accept_shift_offer(uuid) from public;
revoke all on function public.check_in(uuid, text, numeric, numeric) from public;
revoke all on function public.submit_daily_report(uuid, text, text, text, text) from public;
revoke all on function public.cancel_shift(uuid, text) from public;
revoke all on function public.caregiver_shifts() from public;
grant execute on function public.offer_shift(uuid, uuid[]) to authenticated;
grant execute on function public.accept_shift_offer(uuid) to authenticated;
grant execute on function public.check_in(uuid, text, numeric, numeric) to authenticated;
grant execute on function public.submit_daily_report(uuid, text, text, text, text) to authenticated;
grant execute on function public.cancel_shift(uuid, text) to authenticated;
grant execute on function public.caregiver_shifts() to authenticated;

-- ---------------------------------------------------------------------------
-- Policies and grants
-- ---------------------------------------------------------------------------

create policy households_select on public.households
  for select to authenticated using (owner_id = (select auth.uid()) or (select public.is_admin()));
create policy households_insert_own on public.households
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy households_update_own on public.households
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy households_delete_own on public.households
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Caregivers read the first name through caregiver_shifts(), not this table.
create policy care_recipients_select on public.care_recipients
  for select to authenticated using (private.owns_household(household_id) or (select public.is_admin()));
create policy care_recipients_insert_own on public.care_recipients
  for insert to authenticated with check (private.owns_household(household_id));
create policy care_recipients_update_own on public.care_recipients
  for update to authenticated
  using (private.owns_household(household_id)) with check (private.owns_household(household_id));
create policy care_recipients_delete_own on public.care_recipients
  for delete to authenticated using (private.owns_household(household_id));

create policy shifts_select on public.shifts
  for select to authenticated
  using (
    private.owns_household(household_id)
    or provider_id = (select auth.uid())
    or private.has_open_shift_offer(id)
    or (select public.is_admin())
  );
create policy shifts_insert_own on public.shifts
  for insert to authenticated with check (private.owns_household(household_id));
create policy shifts_update_own on public.shifts
  for update to authenticated
  using (private.owns_household(household_id)) with check (private.owns_household(household_id));

create policy shift_offers_select on public.shift_offers
  for select to authenticated
  using (provider_id = (select auth.uid())
         or private.owns_shift(shift_id)
         or (select public.is_admin()));

create policy checkins_select on public.checkins
  for select to authenticated
  using (provider_id = (select auth.uid())
         or private.owns_shift(shift_id)
         or (select public.is_admin()));

create policy daily_reports_select on public.daily_reports
  for select to authenticated
  using (provider_id = (select auth.uid())
         or private.owns_shift(shift_id)
         or (select public.is_admin()));

grant select, insert, update, delete on public.households, public.care_recipients to authenticated;
grant select, insert, update on public.shifts to authenticated;
grant select on public.shift_offers, public.checkins, public.daily_reports to authenticated;

revoke all on all functions in schema private from public;
grant execute on function private.owns_household(uuid) to authenticated;
grant execute on function private.owns_shift(uuid) to authenticated;
grant execute on function private.has_open_shift_offer(uuid) to authenticated;
grant execute on function private.is_counterpart(uuid) to authenticated;
