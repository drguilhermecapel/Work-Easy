-- A check-in keeps the caregiver's position only while the caregiver has location consent: the
-- latest 'location' decision in the consent history must be granted. Without it the check-in
-- is still registered, with no coordinates, as it already is when the app refuses the position.

create function private.has_location_consent(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.granted
      from public.consents c
     where c.user_id = p_user and c.purpose = 'location'
     order by c.at desc, c.created_at desc
     limit 1
  ), false);
$$;

revoke all on function private.has_location_consent(uuid) from public;

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
          case when v_consent then p_lat end,
          case when v_consent then p_lng end)
  returning id into v_id;
  update public.shifts set status = case when p_kind = 'in' then 'checked_in' else 'completed' end::public.shift_status
   where id = p_shift;
  return v_id;
end;
$$;
