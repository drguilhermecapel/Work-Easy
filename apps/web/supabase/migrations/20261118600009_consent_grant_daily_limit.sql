-- Grant limit per day: a user has at most 20 granted consents (granted = true) of one purpose created
-- on the same São Paulo day. A withdrawal (granted = false) is never counted and never refused, so a
-- consent can always be withdrawn. The check runs only for a statement that inserts a grant.
--
-- Statement-level, after the row-level skip of repeated decisions (consents_05_skip_repeated): a skipped
-- repeat is not in the transition table, so it is not counted. The lock is the one the skip check takes
-- for the same user and purpose, so two grants of one purpose wait for each other, and the second one
-- counts the first one's row. A bulk insert over the limit is refused as a whole.

create function private.limit_consent_grants_per_day()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key record;
begin
  for v_key in
    select distinct n.user_id, n.purpose from new_rows n where n.granted order by n.user_id, n.purpose
  loop
    perform pg_advisory_xact_lock(hashtextextended('consent:' || v_key.user_id::text || ':' || v_key.purpose::text, 0));
    if (select count(*) from public.consents c
         where c.user_id = v_key.user_id
           and c.purpose = v_key.purpose
           and c.granted
           and private.sp_date(c.created_at) = private.sp_date(now())) > 20 then
      raise exception 'consent_daily_limit' using errcode = 'P0001';
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function private.limit_consent_grants_per_day() from public, anon, authenticated;

create trigger consents_06_grant_daily_limit
  after insert on public.consents
  referencing new table as new_rows
  for each statement execute function private.limit_consent_grants_per_day();
