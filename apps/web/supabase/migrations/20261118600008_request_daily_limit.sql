-- Request limit per day: a client has at most 20 requests created on the same São Paulo day,
-- whatever their status (a canceled request still counts, so cancelling does not free a place).
-- The open-request limit (requests_open_limit, five open at a time) is separate and unchanged.
-- Statement-level over the transition table, like the quote limit: a bulk insert over the limit
-- is refused as a whole. The advisory lock per client makes a parallel insert wait, so it is
-- counted after the other one has committed.

create function private.limit_requests_per_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
begin
  for v_client in select distinct n.client_id from new_requests n loop
    perform pg_advisory_xact_lock(hashtextextended('request-day:' || v_client::text, 0));
    if (select count(*) from public.requests r
         where r.client_id = v_client
           and private.sp_date(r.created_at) = private.sp_date(now())) > 20 then
      raise exception 'request_daily_limit' using errcode = 'P0001';
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function private.limit_requests_per_day() from public, anon, authenticated;

create trigger requests_daily_limit
  after insert on public.requests
  referencing new table as new_requests
  for each statement execute function private.limit_requests_per_day();
