-- 10 LGPD and audit: consent history, data subject requests, an append-only audit log
-- and account anonymization (payments and bookings stay, anonymized, for tax records).

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  purpose public.consent_purpose not null,
  version text not null check (char_length(version) between 1 and 40),
  granted boolean not null,
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index consents_user_idx on public.consents (user_id, purpose, at desc);

create table public.data_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references public.profiles (id) on delete set null,
  kind public.data_request_kind not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  completed_at timestamptz,
  result_path text,
  created_at timestamptz not null default now()
);

create index data_requests_user_idx on public.data_requests (user_id, created_at desc);

create table public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  data jsonb not null default '{}',
  at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index audit_log_entity_idx on public.audit_log (entity, entity_id, at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, at desc);

alter table public.consents enable row level security;
alter table public.data_requests enable row level security;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- Append-only audit log
-- ---------------------------------------------------------------------------

-- Privileges are revoked below; this trigger also stops the table owner.
create function private.audit_log_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'not_allowed' using errcode = 'P0001', detail = 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function private.audit_log_immutable();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function private.audit_log_immutable();

-- Internal writer used by functions and triggers of every domain.
create function private.audit(p_action text, p_entity text, p_entity_id text, p_data jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, data)
  values (auth.uid(), p_action, p_entity, p_entity_id,
          coalesce(p_data, '{}') || jsonb_build_object('via', case when private.is_service_role() then 'service' else 'user' end))
  returning id into v_id;
  return v_id;
end;
$$;

-- Public entry point: the actor is always the caller, never a parameter.
create function public.log_event(
  p_action text,
  p_entity text,
  p_entity_id text default null,
  p_data jsonb default '{}'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(trim(p_action), '') is null or nullif(trim(p_entity), '') is null
     or char_length(p_action) > 100 or char_length(p_entity) > 100 then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if auth.uid() is null and not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return private.audit(p_action, p_entity, p_entity_id, p_data);
end;
$$;

revoke all on function public.log_event(text, text, text, jsonb) from public;
grant execute on function public.log_event(text, text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Anonymization (service role, called by account-delete)
-- ---------------------------------------------------------------------------

create function public.anonymize_user(p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.profiles
     set full_name = null, phone = null, deleted_at = coalesce(deleted_at, now())
   where id = p_user;

  -- As a provider: the public page goes away; jobs and payments remain.
  update public.providers
     set display_name = 'Prestador removido',
         slug = 'removido-' || replace(id::text, '-', ''),
         bio = null,
         avatar_path = null,
         status = 'suspended',
         accepts_platform_requests = false
   where id = p_user;
  update public.services set active = false, description = null where provider_id = p_user;
  delete from public.provider_neighborhoods where provider_id = p_user;
  delete from public.availability where provider_id = p_user;
  update public.provider_clients
     set name = 'Cliente removido', phone = null, email = null, notes = null
   where provider_id = p_user;
  update public.quotes set client_name = null, client_phone = null, notes = null where provider_id = p_user;
  update public.checkins set lat = null, lng = null where provider_id = p_user;

  -- As a client: entries about this person in providers' CRMs and quotes.
  update public.quotes q
     set client_name = null, client_phone = null
    from public.provider_clients pc
   where q.provider_client_id = pc.id and pc.client_id = p_user;
  update public.provider_clients
     set name = 'Cliente removido', phone = null, email = null, notes = null
   where client_id = p_user;
  update public.requests set description = 'Pedido removido a pedido do titular.', preferred_dates = null
   where client_id = p_user;
  update public.reviews set comment = null where client_id = p_user;
  update public.bookings set notes = null where client_id = p_user;
  update public.households set name = 'Removida', notes = null where owner_id = p_user;
  update public.care_recipients cr
     set first_name = 'Removido', birth_year = null, preferences = null, emergency_contact = null
    from public.households h
   where cr.household_id = h.id and h.owner_id = p_user;

  delete from public.notifications where user_id = p_user and status = 'queued';
  update public.notifications set phone = null, email = null, params = '{}' where user_id = p_user;

  perform private.audit('user.anonymized', 'profile', p_user::text, '{}'::jsonb);
end;
$$;

revoke all on function public.anonymize_user(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_user(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Policies and grants
-- ---------------------------------------------------------------------------

-- Consent history: insert by the user, never updated or deleted.
create policy consents_select on public.consents
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy consents_insert_own on public.consents
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy data_requests_select on public.data_requests
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_admin()));
create policy data_requests_insert_own on public.data_requests
  for insert to authenticated with check (user_id = (select auth.uid()) and status = 'pending');

create policy audit_log_select_admin on public.audit_log
  for select to authenticated using ((select public.is_admin()));

grant select, insert on public.consents to authenticated;
grant select, insert on public.data_requests to authenticated;
grant select on public.audit_log to authenticated;

-- Nobody updates or deletes audit entries, the service role included.
revoke update, delete, truncate on public.audit_log from public, anon, authenticated, service_role;
revoke insert on public.audit_log from anon, authenticated;
revoke all on public.consents from anon;
revoke update, delete, truncate on public.consents from authenticated, service_role;

revoke all on all functions in schema private from public;
