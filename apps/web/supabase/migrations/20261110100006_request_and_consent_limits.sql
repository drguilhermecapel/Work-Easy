-- Data requests and consent history, kept small.
-- 1. A user has at most 3 pending data requests per kind (export or delete). Checked once per
--    statement over the transition table, so one insert of several rows cannot pass the limit.
-- 2. A consent decision equal to the latest one of the same purpose (same version and same answer)
--    adds no row and is not an error. A withdrawal (granted = false) is a new decision, so it is
--    always recorded. The check runs row by row: rows of the same statement do not see each other,
--    so the app's one-row-per-call inserts are covered, and several identical rows in one statement
--    are not collapsed.

create function private.limit_pending_data_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key record;
begin
  for v_key in
    select distinct n.user_id, n.kind from new_rows n where n.status = 'pending' and n.user_id is not null
  loop
    perform pg_advisory_xact_lock(hashtextextended('data-request:' || v_key.user_id::text || ':' || v_key.kind::text, 0));
    if (select count(*) from public.data_requests r
         where r.user_id = v_key.user_id and r.kind = v_key.kind and r.status = 'pending') > 3 then
      raise exception 'data_request_limit' using errcode = 'P0001';
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function private.limit_pending_data_requests() from public, anon, authenticated;

create trigger data_requests_05_pending_limit
  after insert on public.data_requests
  referencing new table as new_rows
  for each statement execute function private.limit_pending_data_requests();

create function private.skip_repeated_consent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_last record;
begin
  -- Two decisions of one purpose at the same time wait for each other, so the second one sees the first
  perform pg_advisory_xact_lock(hashtextextended('consent:' || new.user_id::text || ':' || new.purpose::text, 0));
  select c.version, c.granted into v_last
    from public.consents c
   where c.user_id = new.user_id and c.purpose = new.purpose
   order by c.at desc, c.created_at desc
   limit 1;
  if found and v_last.version = new.version and v_last.granted = new.granted then
    return null;
  end if;
  return new;
end;
$$;

revoke all on function private.skip_repeated_consent() from public, anon, authenticated;

create trigger consents_05_skip_repeated
  before insert on public.consents
  for each row execute function private.skip_repeated_consent();
