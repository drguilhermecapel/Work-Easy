-- Launch controls of the concierge pilot (docs/operacao/01, docs/DECISOES.md D12 and DD59 to DD61).
--
--   * care_line_open: the care line is not advertised before its prerequisites (D12). While this is
--     false the menu lists it only for admins and for accounts already in it; care_access() answers
--     the second part in one call, so the app reads no care table to draw the menu.
--   * pilot_neighborhoods: slugs of the neighborhoods the request form offers. Empty = all of them.
--     It filters the form only: requests keep being accepted for any neighborhood, so the operation
--     can still register one by hand.
--   * waitlist_entries: who asked for a neighborhood outside the pilot, and for which service. It
--     holds no contact data of its own: the account is the contact.
--   * An admin creates a shift for a family (concierge operation of the care line). The family
--     policies stay as they were; the admin insert is audited.

insert into public.platform_settings (key, value) values
  ('care_line_open', 'false'),
  ('pilot_neighborhoods', '[]')
on conflict (key) do nothing;

create function public.care_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.households h where h.owner_id = (select auth.uid()))
      or exists (select 1 from public.shift_offers o where o.provider_id = (select auth.uid()))
      or exists (select 1 from public.shifts s where s.provider_id = (select auth.uid()));
$$;

revoke all on function public.care_access() from public, anon;
grant execute on function public.care_access() to authenticated;

-- ---------------------------------------------------------------------------
-- Waiting list
-- ---------------------------------------------------------------------------

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  neighborhood_id uuid not null references public.neighborhoods (id) on delete cascade,
  occupation_slug text references public.occupations (slug) on update cascade on delete set null,
  -- The unique key needs a value where the service is unknown
  occupation_key text generated always as (coalesce(occupation_slug, '')) stored,
  created_at timestamptz not null default now(),
  unique (user_id, neighborhood_id, occupation_key)
);

create index waitlist_entries_neighborhood_idx on public.waitlist_entries (neighborhood_id, created_at desc);
create index waitlist_entries_occupation_idx on public.waitlist_entries (occupation_slug);

alter table public.waitlist_entries enable row level security;

create policy waitlist_entries_select on public.waitlist_entries
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy waitlist_entries_insert_own on public.waitlist_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy waitlist_entries_delete_own on public.waitlist_entries
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.waitlist_entries from anon, authenticated;
grant select, insert, delete on public.waitlist_entries to authenticated;
grant all on public.waitlist_entries to service_role;

-- An account keeps at most 20 entries: enough for every service somebody may want, and a ceiling
-- for a script that would fill the table.
create function private.limit_waitlist_entries()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('waitlist:' || new.user_id::text, 0));
  if (select count(*) from public.waitlist_entries w where w.user_id = new.user_id) >= 20 then
    raise exception 'waitlist_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.limit_waitlist_entries() from public, anon, authenticated;

create trigger waitlist_entries_10_limit
  before insert on public.waitlist_entries
  for each row execute function private.limit_waitlist_entries();

-- Demand outside the pilot, for the administration panel: one row per neighborhood and service.
create function public.admin_waitlist_summary()
returns table (neighborhood_id uuid, neighborhood_name text, occupation_slug text, entries bigint, last_entry_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select n.id, n.name, w.occupation_slug, count(*)::bigint, max(w.created_at)
      from public.waitlist_entries w
      join public.neighborhoods n on n.id = w.neighborhood_id
     group by n.id, n.name, w.occupation_slug
     order by count(*) desc, n.name, w.occupation_slug nulls first;
end;
$$;

revoke all on function public.admin_waitlist_summary() from public, anon;
grant execute on function public.admin_waitlist_summary() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shifts created by the operation for a family
-- ---------------------------------------------------------------------------

create policy shifts_insert_admin on public.shifts
  for insert to authenticated with check ((select public.is_admin()));

create function private.audit_admin_shift_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- auth.uid() is null for the service role and for maintenance sessions: only a signed-in admin is audited here
  if (select auth.uid()) is not null and not private.owns_household(new.household_id) then
    perform private.audit('shift.created_by_admin', 'shift', new.id::text,
      jsonb_build_object('household_id', new.household_id));
  end if;
  return null;
end;
$$;

revoke all on function private.audit_admin_shift_insert() from public, anon, authenticated;

create trigger shifts_60_audit_admin_insert
  after insert on public.shifts
  for each row execute function private.audit_admin_shift_insert();
