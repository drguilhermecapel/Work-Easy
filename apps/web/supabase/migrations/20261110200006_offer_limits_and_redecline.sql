-- 09 Care, offer limits. A shift takes at most 10 caregivers, and a family makes at most 30 offers
-- in a rolling 24 hours. The daily count reads the offer rows: a caregiver offered for the first
-- time, or offered again, in the window counts, whatever the offer's status is now. A caregiver
-- who declined a shift is not offered that shift again. Redefines public.offer_shift with the
-- same signature.

-- When the family last offered the shift to this caregiver. Set on each new offer, so the daily
-- limit sees a caregiver offered again the same day. Existing rows start at their creation time.
alter table public.shift_offers add column offered_at timestamptz;
update public.shift_offers set offered_at = created_at;
alter table public.shift_offers alter column offered_at set not null;
alter table public.shift_offers alter column offered_at set default now();

comment on column public.shift_offers.offered_at is
  'When the family last offered the shift to this caregiver. Set again on each new offer.';

create or replace function public.offer_shift(p_shift uuid, p_providers uuid[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift public.shifts;
  v_owner uuid;
  v_providers uuid[];
  v_missing int;
  v_sent int;
  v_today int;
  v_count int;
begin
  select * into v_shift from public.shifts where id = p_shift for update;
  if not found or not (public.is_admin() or private.owns_household(v_shift.household_id)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_shift.status not in ('open', 'offered') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;

  select h.owner_id into v_owner from public.households h where h.id = v_shift.household_id;
  select coalesce(array_agg(distinct u.id), '{}') into v_providers
    from unnest(coalesce(p_providers, '{}')) u(id) where u.id is not null;

  if exists (select 1 from unnest(v_providers) u(id)
              where u.id = v_owner or not private.is_care_provider(u.id)) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  -- A caregiver who declined this shift is not offered it again.
  if exists (select 1 from public.shift_offers o
              where o.shift_id = v_shift.id and o.status = 'declined' and o.provider_id = any (v_providers)) then
    raise exception 'offer_declined' using errcode = 'P0001';
  end if;

  -- v_missing: caregivers with no row yet (new to the shift). v_sent: those plus expired rows, which
  -- the offer sends again and which therefore count as offers of the day. An open offer sends nothing.
  select count(*) filter (where o.provider_id is null),
         count(*) filter (where o.provider_id is null or o.status = 'expired')
    into v_missing, v_sent
    from unnest(v_providers) u(id)
    left join public.shift_offers o on o.shift_id = v_shift.id and o.provider_id = u.id;

  if (select count(*) from public.shift_offers o where o.shift_id = v_shift.id) + v_missing > 10 then
    raise exception 'offer_limit' using errcode = 'P0001';
  end if;
  if not public.is_admin() then
    select count(*) into v_today
      from public.shift_offers o
      join public.shifts s on s.id = o.shift_id
      join public.households h on h.id = s.household_id
     where h.owner_id = v_owner and o.offered_at > now() - interval '1 day';
    if v_today + v_sent > 30 then
      raise exception 'offer_limit' using errcode = 'P0001';
    end if;
  end if;

  insert into public.shift_offers (shift_id, provider_id)
  select v_shift.id, u.id from unnest(v_providers) u(id)
  on conflict (shift_id, provider_id) do update set status = 'offered', offered_at = now()
   where public.shift_offers.status = 'expired';

  select count(*) into v_count from public.shift_offers where shift_id = v_shift.id and status = 'offered';
  if v_count > 0 then
    update public.shifts set status = 'offered' where id = v_shift.id;
  end if;
  perform private.audit('shift.offered', 'shift', v_shift.id::text, jsonb_build_object('providers', v_providers));
  return v_count;
end;
$$;
