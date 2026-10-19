-- 01 Identity: extensions, every enum of the contract, the private helper schema,
-- profiles and admins.
--
-- Conventions used by all migrations:
--   * Business rules raise `P0001` with one of the codes listed in docs/ARQUITETURA.md
--     ("Erros do banco"); lib/errors.ts translates them.
--   * "Client context" means the statement runs as the API roles `anon` or
--     `authenticated`. Inside a `security definer` function current_user is the owner,
--     so guard triggers let those functions (and the service role) through.
--   * Nothing is granted by default: each table and RPC below grants what it needs.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Tables, sequences and functions created by migrations are no longer exposed to the
-- API roles automatically (Supabase grants everything to anon/authenticated by default).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on functions from anon, authenticated;

-- Internal helpers and trigger functions live outside the exposed `public` schema, so
-- PostgREST never offers them as RPCs.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.user_role as enum ('client', 'provider');
create type public.provider_status as enum ('draft', 'pending_review', 'approved', 'suspended');
create type public.registry_status as enum ('not_required', 'informed', 'confirmed', 'rejected');
create type public.document_status as enum ('submitted', 'accepted', 'rejected');
create type public.verification_step as enum (
  'documento_selfie', 'cadastro_fiscal', 'registro_profissional', 'antecedentes',
  'certificado_curso', 'cnh', 'licenca_orgao', 'seguro_rc'
);
create type public.billing_model as enum ('comissao_primeiro_servico', 'so_assinatura', 'sob_consulta_juridica');
create type public.provider_kind as enum ('autonomo', 'autonomo_ou_empresa', 'somente_empresa_licenciada');
create type public.price_unit as enum (
  'hora', 'dia', 'servico', 'm2', 'sessao', 'plantao', 'mes', 'projeto', 'km', 'pacote',
  'pagina', 'palavra', 'aula', 'evento', 'visita'
);
create type public.service_location as enum ('domicilio', 'online', 'estabelecimento', 'empresa_cliente', 'externo');
create type public.request_status as enum ('open', 'matched', 'closed', 'canceled');
create type public.proposal_status as enum ('sent', 'accepted', 'declined', 'withdrawn');
create type public.booking_status as enum (
  'requested', 'accepted', 'paid', 'in_progress', 'completed', 'released', 'canceled', 'disputed'
);
create type public.booking_origin as enum ('platform', 'own');
create type public.payment_status as enum (
  'pending', 'confirmed', 'received', 'held', 'released', 'refunded', 'failed', 'canceled'
);
create type public.payment_method as enum ('pix', 'credit_card', 'boleto', 'undefined');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'declined', 'expired');
create type public.plan_code as enum ('free', 'pro');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');
create type public.notification_channel as enum ('whatsapp', 'email');
create type public.notification_status as enum ('queued', 'sending', 'sent', 'failed', 'skipped');
create type public.shift_status as enum ('open', 'offered', 'assigned', 'checked_in', 'completed', 'canceled', 'no_show');
create type public.consent_purpose as enum ('terms', 'privacy', 'marketing', 'background_check', 'location');
create type public.data_request_kind as enum ('export', 'delete');

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------

-- True when the current statement comes straight from the API roles (not from a
-- security definer function, the service role or a migration).
create function private.is_client_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user in ('anon', 'authenticated');
$$;

-- True for the service role (Edge Functions) and for direct maintenance sessions as
-- postgres (migrations, pg_cron). `role` is the SET ROLE value, which a security
-- definer call does not change.
create function private.is_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_setting('role', true) = 'service_role'
      or (coalesce(current_setting('role', true), 'none') = 'none'
          and session_user in ('postgres', 'supabase_admin'));
$$;

-- Calendar date in São Paulo; every per-day and per-week rule uses it.
create function private.sp_date(p_at timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_at at time zone 'America/Sao_Paulo')::date;
$$;

-- Every São Paulo calendar day touched by a period (an overnight shift touches two).
create function private.local_days(p_period tstzrange)
returns setof date
language sql
stable
set search_path = ''
as $$
  select generate_series(
    private.sp_date(lower(p_period)),
    private.sp_date(upper(p_period) - interval '1 microsecond'),
    interval '1 day'
  )::date;
$$;

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text check (char_length(full_name) <= 200),
  phone text check (char_length(phone) <= 32),
  role public.user_role not null default 'client',
  city text default 'São Paulo',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth user, created by trigger. role changes only through become_provider().';

alter table public.profiles enable row level security;

-- Every sign-up becomes a client; metadata can carry a name but never a role.
create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    coalesce(new.phone, nullif(trim(new.raw_user_meta_data ->> 'phone'), ''))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Users edit their own name, phone and city; id, role and deleted_at are server-owned.
create function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_client_context() and (
       new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.deleted_at is distinct from old.deleted_at
     ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.guard_profile_update();

-- ---------------------------------------------------------------------------
-- admins
-- ---------------------------------------------------------------------------

create table public.admins (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.admins is 'Platform operators. Only the service role writes here.';

alter table public.admins enable row level security;

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Policies and grants
-- ---------------------------------------------------------------------------

create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy admins_select on public.admins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

grant select, update on public.profiles to authenticated;
grant select on public.admins to authenticated;

revoke all on all functions in schema private from public;
grant execute on function private.is_client_context() to anon, authenticated;
grant execute on function private.is_service_role() to anon, authenticated;
