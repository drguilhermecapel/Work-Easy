-- 20261023200000 Administration: ranges for the revenue settings and the operating funnel.
--
--   * admin_set_setting also checks the three keys that migration 12 added (commission_cap_cents,
--     free_proposals_per_month, pro_trial_days). Until now they went through unchecked ("other keys
--     pass"), so a direct call could store a negative ceiling or a trial of 36500 days. The zero of
--     each one has a meaning the rules already honour: no ceiling, no limit, no trial.
--   * admin_metrics grows the columns and rows the operating funnel of the admin panel needs. The
--     view is replaced, so the old columns keep their names, types and order and the new ones come
--     last (CREATE OR REPLACE VIEW accepts nothing else). The old rows are the same.

-- ---------------------------------------------------------------------------
-- Settings: type and range of the keys the administration screen edits
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_setting(p_key text, p_value jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_min numeric;
  v_max numeric;
  v_number numeric;
begin
  perform private.require_admin();
  if nullif(trim(p_key), '') is null or p_value is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- The keys the administration screen edits have a type and a range, checked here as well as
  -- on the screen (a direct call cannot store 1000000 as the commission). Other keys pass.
  -- Ranges: commission_cap_cents is in cents (0 = no ceiling), free_proposals_per_month counts
  -- proposals of the free plan in a calendar month (0 = no limit), pro_trial_days is the free
  -- Pro period of an account's first subscription (0 = no trial).
  if p_key in ('commission_enabled', 'escrow_enabled') then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'invalid_setting' using errcode = '23514', detail = p_key || ' is true or false';
    end if;
  elsif p_key in ('commission_bps', 'pro_price_cents', 'proposal_limit', 'labor_lock_days_per_week',
                  'commission_cap_cents', 'free_proposals_per_month', 'pro_trial_days') then
    select r.lo, r.hi into v_min, v_max
      from (values ('commission_bps', 0, 5000), ('pro_price_cents', 100, 100000),
                   ('proposal_limit', 1, 10), ('labor_lock_days_per_week', 1, 7),
                   ('commission_cap_cents', 0, 1000000), ('free_proposals_per_month', 0, 100),
                   ('pro_trial_days', 0, 90)) as r(k, lo, hi)
     where r.k = p_key;
    if jsonb_typeof(p_value) <> 'number' then
      raise exception 'invalid_setting' using errcode = '23514', detail = p_key || ' is a whole number';
    end if;
    v_number := (p_value #>> '{}')::numeric;
    if v_number <> trunc(v_number) or v_number < v_min or v_number > v_max then
      raise exception 'invalid_setting' using errcode = '23514',
        detail = p_key || ' is a whole number from ' || v_min || ' to ' || v_max;
    end if;
  end if;

  select value into v_old from public.platform_settings where key = p_key;
  insert into public.platform_settings (key, value) values (p_key, p_value)
  on conflict (key) do update set value = excluded.value;

  perform private.audit('setting.changed', 'platform_setting', p_key,
                        jsonb_build_object('from', v_old, 'to', p_value));
  return p_value;
end;
$$;

revoke all on function public.admin_set_setting(text, jsonb) from public;
grant execute on function public.admin_set_setting(text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Metrics: the operating funnel
-- ---------------------------------------------------------------------------

-- One row per entity and status. The five original entities (requests, proposals, bookings,
-- payments, providers) count rows by the day they were created. The funnel adds:
--   * last_7_days, last_30_days: the same count over the last 7 and 30 days (rolling, not the
--     calendar week and month of this_week and this_month);
--   * amount_cents, month_amount_cents: payments only, the sum of the amounts counted in total
--     and in this_month (null for every other entity);
--   * requests_with_proposal / with_proposal: requests that received at least one proposal, even
--     one withdrawn afterwards, counted by the day the request was created;
--   * subscriptions / <status>: Pro subscriptions by status, counted by the day they were created
--     (pending, trialing, active, past_due, canceled);
--   * free_allowance / reached: providers on the free plan that already sent, this month, as many
--     proposals as free_proposals_per_month allows, so the next one is refused until the month
--     turns or they subscribe. A snapshot of now, so every window holds the same number. With the
--     limit at 0 (no limit) there are none. A missing or malformed setting means 5, like the rule
--     in check_proposal().
-- Like the old view it runs with the rights of the caller and returns rows to admins only.
create or replace view public.admin_metrics
with (security_invoker = true)
as
with bounds as (
  select (date_trunc('week', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as week_start,
         (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo') as month_start,
         coalesce((select case when jsonb_typeof(s.value) = 'number' then floor((s.value #>> '{}')::numeric) end
                     from public.platform_settings s where s.key = 'free_proposals_per_month'), 5) as free_allowance
),
rows as (
  select 'requests' as entity, status::text as status, created_at, null::int as amount_cents from public.requests
  union all select 'proposals', status::text, created_at, null from public.proposals
  union all select 'bookings', status::text, created_at, null from public.bookings
  union all select 'payments', status::text, created_at, amount_cents from public.payments
  union all select 'providers', status::text, created_at, null from public.providers
  union all select 'requests_with_proposal', 'with_proposal', r.created_at, null
              from public.requests r
             where exists (select 1 from public.proposals p where p.request_id = r.id)
  union all select 'subscriptions', status::text, created_at, null from public.subscriptions
  union all select 'free_allowance', 'reached', now(), null
              from public.providers pr cross join bounds b
             where pr.plan = 'free' and b.free_allowance > 0
               and (select count(*) from public.proposals pp
                     where pp.provider_id = pr.id and pp.created_at >= b.month_start) >= b.free_allowance
)
select r.entity,
       r.status,
       count(*) filter (where r.created_at >= b.week_start) as this_week,
       count(*) filter (where r.created_at >= b.month_start) as this_month,
       count(*) as total,
       count(*) filter (where r.created_at >= now() - interval '7 days') as last_7_days,
       count(*) filter (where r.created_at >= now() - interval '30 days') as last_30_days,
       sum(r.amount_cents) as amount_cents,
       case when r.entity = 'payments'
            then coalesce(sum(r.amount_cents) filter (where r.created_at >= b.month_start), 0)
       end as month_amount_cents
  from rows r cross join bounds b
 where (select public.is_admin())
 group by r.entity, r.status
 order by r.entity, r.status;

-- Same rights as before: not for anon, read by signed-in users (the is_admin() filter of the view
-- and the admin RLS policies of the tables underneath decide who gets rows).
revoke all on public.admin_metrics from anon;
grant select on public.admin_metrics to authenticated;
