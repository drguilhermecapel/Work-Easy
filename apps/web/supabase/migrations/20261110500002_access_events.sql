-- Access events of the accounts: the time and the authentication method, kept six months and read
-- only by administrators. The authentication service runs public.custom_access_token_hook before it
-- issues a token; the hook records the account and the method and returns the event unchanged, so
-- the token does not change. The IP address is not recorded: the hook payload does not carry it.
-- If token renewals also run the hook, they are recorded as well.
-- The hook is activated in the Supabase project settings (Auth hooks, custom access token); this
-- migration only creates the function and its grants.

create table public.access_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  occurred_at timestamptz not null default now(),
  method text check (method is null or char_length(method) <= 40)
);

comment on table public.access_events is 'Account access events (time and method), kept six months. Administrators read them.';

-- user_id has no foreign key: the events of an account are kept for their period even after the
-- account is deleted.
create index access_events_user_idx on public.access_events (user_id, occurred_at desc);
create index access_events_occurred_idx on public.access_events (occurred_at);

alter table public.access_events enable row level security;

create policy access_events_admin_read on public.access_events
  for select to authenticated using ((select public.is_admin()));

revoke all on public.access_events from public, anon, authenticated, service_role;
grant select on public.access_events to authenticated;

-- Records the sign-in and returns the event. An event without an account id records nothing.
create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := nullif(event ->> 'user_id', '')::uuid;
begin
  if v_user is not null then
    insert into public.access_events (user_id, method)
    values (v_user, left(event ->> 'authentication_method', 40));
  end if;
  return event;
end;
$$;

revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

-- The authentication service connects as supabase_auth_admin. Its grants are set only where that
-- role exists, so the migration also runs on a database without the authentication service.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant usage on schema public to supabase_auth_admin;
    grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
  end if;
end;
$$;

-- Deletes the events older than six months.
create function private.purge_access_events()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.access_events where occurred_at < now() - interval '6 months';
end;
$$;

revoke all on function private.purge_access_events() from public, anon, authenticated;
