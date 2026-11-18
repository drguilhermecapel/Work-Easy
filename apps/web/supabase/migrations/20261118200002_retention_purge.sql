-- Daily retention purge, scheduled by the database itself (pg_cron), with no operator action.
-- public.run_retention_purge() runs the two purges of the privacy migrations and reports how many
-- rows of each kind it removed. Those purges return nothing, so the counts use the same criteria,
-- read just before the purges in the same transaction: keep them in step if a purge changes.

create or replace function public.run_retention_purge()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_consent_proofs bigint;
  v_access_events bigint;
begin
  select count(*) into v_consent_proofs from public.consent_proofs where retain_until <= now();
  select count(*) into v_access_events from public.access_events where occurred_at < now() - interval '6 months';
  perform private.purge_expired_consent_proofs();
  perform private.purge_access_events();
  return jsonb_build_object(
    'consent_proofs_removed', v_consent_proofs,
    'access_events_removed', v_access_events
  );
end;
$$;

revoke all on function public.run_retention_purge() from public, anon, authenticated;

-- Schedules it every day at 03:00 when pg_cron is available. Without pg_cron the migration still
-- applies: the job is not created and a notice says so, and the purge can be run by hand.
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron could not be enabled: %', sqlerrm;
  end;

  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.schedule('retention-purge-daily', '0 3 * * *', 'select public.run_retention_purge()');
    exception when others then
      raise notice 'retention purge not scheduled: %', sqlerrm;
    end;
  else
    raise notice 'pg_cron is not installed: public.run_retention_purge() is not scheduled';
  end if;
end;
$$;
