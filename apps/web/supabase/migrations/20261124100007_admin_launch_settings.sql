-- The two launch controls are edited on the administration screen, so admin_set_setting checks
-- them like the other keys it knows: care_line_open is true or false, pilot_neighborhoods is a
-- list of slugs of neighborhoods that exist (a typo would otherwise hide the whole form filter).
-- The rest of the function is the one of migration 20261023200000, unchanged.

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
  -- Pro period of an account's first subscription (0 = no trial). care_line_open and
  -- pilot_neighborhoods are the launch controls (migration 20261124100001).
  if p_key in ('commission_enabled', 'escrow_enabled', 'care_line_open') then
    if jsonb_typeof(p_value) <> 'boolean' then
      raise exception 'invalid_setting' using errcode = '23514', detail = p_key || ' is true or false';
    end if;
  elsif p_key = 'pilot_neighborhoods' then
    -- A list of neighborhood slugs that exist; the empty list means every neighborhood
    if jsonb_typeof(p_value) <> 'array'
       or jsonb_array_length(p_value) > 200
       or exists (select 1 from jsonb_array_elements(p_value) e
                   where jsonb_typeof(e.value) <> 'string'
                      or not exists (select 1 from public.neighborhoods n where n.slug = e.value #>> '{}')) then
      raise exception 'invalid_setting' using errcode = '23514',
        detail = p_key || ' is a list of neighborhood slugs that exist';
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
