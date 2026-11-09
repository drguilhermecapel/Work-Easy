-- A client has at most five open requests at a time. Only requests that are open and not expired yet
-- count. The check runs once per statement over the rows that statement inserted, so a bulk insert
-- that would go over the limit is refused as a whole. Parallel inserts of the same client take one
-- advisory lock first, so each of them is counted after the other has committed.
-- Security invoker on purpose: the client role is what identifies a request made by a client.
create function private.guard_request_open_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_client_context() then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('requests_open_limit'), hashtext(c.client_id::text))
     from (select distinct n.client_id from new_requests n) as c;

  if exists (
    select 1 from public.requests r
     where r.client_id in (select n.client_id from new_requests n)
       and r.status = 'open'
       and r.expires_at > now()
     group by r.client_id
    having count(*) > 5
  ) then
    raise exception 'request_limit' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

revoke all on function private.guard_request_open_limit() from public;

create trigger requests_open_limit
  after insert on public.requests
  referencing new table as new_requests
  for each statement execute function private.guard_request_open_limit();
