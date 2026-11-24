-- AI assistant quota: a sliding window of 60 minutes per user instead of the UTC clock hour.
-- The hour counter reset at the top of every hour, so a user could spend the whole limit at the end
-- of one hour and again at the start of the next. Now each granted call is one row in
-- assist_usage_events, and a call is granted while the rows of the last 60 minutes stay below the
-- limit (ASSIST_HOURLY_LIMIT, read by the Edge Functions and passed as p_limit, is unchanged).
--
-- assist_usage (the hour counter) is no longer written. It stays in place: the marketplace tests and
-- private.expire_stale still refer to it, and dropping it would change their expectations for nothing.

create table public.assist_usage_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  used_at timestamptz not null default now()
);

create index assist_usage_events_user_used_idx on public.assist_usage_events (user_id, used_at);

-- Same rule as assist_usage: RLS on, no policy and no grant for the API roles. Only take_assist_quota()
-- (service role) reads or writes it.
alter table public.assist_usage_events enable row level security;
revoke all on public.assist_usage_events from public, anon, authenticated;

create or replace function public.take_assist_quota(p_user uuid, p_limit int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used int;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_user is null or coalesce(p_limit, 0) < 1 then
    return false;
  end if;

  -- One call at a time per user: the count and the insert must not interleave with another call of the
  -- same user, or both could take the last unit of the window.
  perform pg_advisory_xact_lock(hashtextextended('assist_quota:' || p_user::text, 0));

  -- Events older than two hours are outside every window this function reads (60 minutes): dropped here.
  delete from public.assist_usage_events
   where user_id = p_user and used_at < now() - interval '2 hours';

  select count(*)::int into v_used
    from public.assist_usage_events
   where user_id = p_user and used_at > now() - interval '60 minutes';

  if v_used >= p_limit then
    return false;
  end if;

  insert into public.assist_usage_events (user_id, used_at) values (p_user, now());
  return true;
end;
$$;

revoke all on function public.take_assist_quota(uuid, int) from public, anon, authenticated;
grant execute on function public.take_assist_quota(uuid, int) to service_role;
