-- Pro plan expiry. The Edge Functions set providers.plan when a subscription changes (cancel, past
-- due, paid), but nothing revisited the plan when the paid period ran out with no further event:
-- a cancelled or unpaid Pro kept the plan forever. This sweep mirrors planAfterCancel and
-- planWhileOverdue: a provider keeps Pro while the subscription is active or trialing, or while its
-- period (plus pro_grace_days) has not ended. It runs hourly and records each downgrade.
-- pro_grace_days must match PRO_GRACE_DAYS of the Edge Functions (default 0).

insert into public.platform_settings (key, value) values ('pro_grace_days', '0')
on conflict (key) do nothing;

create function private.expire_pro_plans()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grace int := greatest(private.setting_int('pro_grace_days', 0), 0);
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    update public.providers p
       set plan = 'free'
     where p.plan = 'pro'
       and not exists (select 1 from public.subscriptions s
                        where s.provider_id = p.id and s.status in ('active', 'trialing'))
       and not exists (select 1 from public.subscriptions s
                        where s.provider_id = p.id
                          and s.current_period_end is not null
                          and s.current_period_end + make_interval(days => v_grace) > now())
    returning p.id
  loop
    perform private.audit('provider.plan_expired', 'providers', v_id::text, '{"plan":"free"}'::jsonb);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.expire_pro_plans() from public;

select cron.schedule('workeasy-expire-pro-plans', '17 * * * *', 'select private.expire_pro_plans()');
