-- A check-in stores its position rounded to 3 decimal places (about 110 m), whatever precision the
-- client sends. The exact position of a caregiver at a family's home is not needed to register
-- attendance. Everything else in the function is unchanged from 20261109400004.

-- Assigned caregiver checks in within 2 h of the start and out within 2 h of the end.
create or replace function public.check_in(p_shift uuid, p_kind text, p_lat numeric default null, p_lng numeric default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_shift public.shifts;
  v_id uuid;
  v_consent boolean;
begin
  select * into v_shift from public.shifts where id = p_shift for update;
  if not found or v_shift.provider_id is distinct from v_uid or p_kind not in ('in', 'out') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if (p_kind = 'in' and v_shift.status <> 'assigned') or (p_kind = 'out' and v_shift.status <> 'checked_in') then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  if abs(extract(epoch from now() - case when p_kind = 'in' then lower(v_shift.period) else upper(v_shift.period) end))
     > 2 * 3600 then
    raise exception 'checkin_window' using errcode = 'P0001';
  end if;

  v_consent := private.has_location_consent(v_uid);
  insert into public.checkins (shift_id, provider_id, kind, lat, lng)
  values (p_shift, v_uid, p_kind,
          case when v_consent then round(p_lat::numeric, 3) end,
          case when v_consent then round(p_lng::numeric, 3) end)
  returning id into v_id;
  update public.shifts set status = case when p_kind = 'in' then 'checked_in' else 'completed' end::public.shift_status
   where id = p_shift;
  return v_id;
end;
$$;
