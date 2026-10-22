-- 12 Revenue levers (docs/DECISOES.md). Three rules, all driven by platform_settings so the
-- owner can tune them without a deploy:
--   * commission_cap_cents: ceiling of the first-service commission, so a large job is not a
--     reason to take the client off the app (the percentage alone would charge R$ 600 on R$ 5.000);
--   * free_proposals_per_month: how many proposals a provider on the free plan sends in a calendar
--     month (America/Sao_Paulo); the Pro plan has no limit. It only bites once there is demand;
--   * pro_trial_days: free days of Pro for a provider that never subscribed (read by the
--     subscriptions-manage function; the first charge is issued when the trial ends).
-- Commission itself stays off (commission_enabled = false) until legal advice.

insert into public.platform_settings (key, value) values
  ('commission_cap_cents', '15000'),
  ('free_proposals_per_month', '5'),
  ('pro_trial_days', '30')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Commission with a ceiling
-- ---------------------------------------------------------------------------

create or replace function private.platform_fee(
  p_booking uuid,
  p_client uuid,
  p_provider_client uuid,
  p_provider uuid,
  p_occupation text,
  p_origin public.booking_origin,
  p_price_cents int
)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fee int;
  v_cap int;
begin
  if not private.setting_bool('commission_enabled', false)
     or p_origin = 'own'
     or not exists (select 1 from public.occupation_policies op
                     where op.occupation_slug = p_occupation and op.billing = 'comissao_primeiro_servico')
     or exists (select 1 from public.bookings b
                 where b.provider_id = p_provider
                   and b.id is distinct from p_booking
                   and b.origin = 'platform'
                   and b.status in ('completed', 'released')
                   and (b.client_id = p_client or b.provider_client_id = p_provider_client)
                   and exists (select 1 from public.payments pay
                                where pay.booking_id = b.id and pay.status in ('received', 'confirmed', 'released'))) then
    return 0;
  end if;
  v_fee := (p_price_cents::bigint * private.setting_int('commission_bps', 0) / 10000)::int;
  -- A cap of 0 (or a missing / malformed value) means no ceiling
  v_cap := private.setting_int('commission_cap_cents', 0);
  if v_cap > 0 then
    v_fee := least(v_fee, v_cap);
  end if;
  return v_fee;
end;
$$;

-- ---------------------------------------------------------------------------
-- Proposals: a monthly allowance for the free plan
-- ---------------------------------------------------------------------------

create or replace function private.check_proposal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.requests;
  v_active int;
  v_plan public.plan_code;
  v_allowance int;
  v_used int;
begin
  -- Only a new proposal, or one becoming active again, takes a slot.
  if tg_op = 'UPDATE'
     and not (new.status in ('sent', 'accepted') and old.status not in ('sent', 'accepted')) then
    return new;
  end if;

  select * into v_request from public.requests where id = new.request_id for update;

  if v_request.status is distinct from 'open' or v_request.expires_at <= now() then
    raise exception 'request_not_open' using errcode = 'P0001';
  end if;

  if v_request.client_id = new.provider_id
     or not private.offers_occupation(new.provider_id, v_request.occupation_slug)
     or not private.provider_serves(new.provider_id, v_request.neighborhood_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select count(*) into v_active
    from public.proposals p
   where p.request_id = new.request_id and p.status in ('sent', 'accepted') and p.id <> new.id;

  if v_active >= private.setting_int('proposal_limit', 3) then
    raise exception 'proposal_limit' using errcode = 'P0001';
  end if;

  -- Free allowance. Counted when the proposal is created (a withdrawn one that comes back was
  -- already counted), only for API callers: the server side (seeds, support) is not limited.
  -- An allowance of 0 or less means no limit. This function is security definer, so
  -- private.is_client_context() (which reads current_user) would see the owner here; the
  -- SET ROLE value is what a definer call leaves untouched.
  if tg_op = 'INSERT' and current_setting('role', true) in ('anon', 'authenticated') then
    select pr.plan into v_plan from public.providers pr where pr.id = new.provider_id;
    v_allowance := private.setting_int('free_proposals_per_month', 5);
    if coalesce(v_plan, 'free') = 'free' and v_allowance > 0 then
      -- Two simultaneous proposals to different requests must not both slip under the limit
      perform pg_advisory_xact_lock(hashtextextended('free_proposals:' || new.provider_id::text, 0));
      select count(*) into v_used
        from public.proposals p
       where p.provider_id = new.provider_id
         and p.created_at >= date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
      if v_used >= v_allowance then
        raise exception 'free_proposal_limit' using errcode = 'P0001',
          detail = format('%s proposals this month, allowance %s', v_used, v_allowance);
      end if;
    end if;
  end if;
  return new;
end;
$$;
