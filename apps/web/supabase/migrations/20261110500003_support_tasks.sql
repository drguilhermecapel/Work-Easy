-- Support tasks: a durable record the server opens when a person has to act and the flow cannot
-- finish alone (for example, a charge that needs a subaccount key that is no longer available).
-- Opening a task does not block the flow that opened it. No API role (anon, authenticated) reads or
-- writes this table; the service role reads it, and opens tasks only through
-- public.open_support_task.

create table public.support_tasks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (char_length(kind) between 1 and 60),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

comment on table public.support_tasks is 'Tasks for the support team, opened by the server. No API role reads them.';

create index support_tasks_open_idx on public.support_tasks (created_at) where resolved_at is null;

alter table public.support_tasks enable row level security;

-- No policy for authenticated or anon users. The service-role read policy is explicit because every
-- table in public has one; the grants below are what limit access.
create policy support_tasks_service_read on public.support_tasks
  for select to service_role using (true);

revoke all on public.support_tasks from public, anon, authenticated, service_role;
grant select on public.support_tasks to service_role;

create function public.open_support_task(p_kind text, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  insert into public.support_tasks (kind, payload)
  values (p_kind, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.open_support_task(text, jsonb) from public, anon, authenticated;
grant execute on function public.open_support_task(text, jsonb) to service_role;
