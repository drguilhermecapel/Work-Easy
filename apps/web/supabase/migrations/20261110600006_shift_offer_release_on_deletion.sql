-- Account deletion, care shifts: an offer the deleted caregiver still held goes with the account (the offers
-- cascade with the provider), so the shift it was offered on must not stay offered to nobody. Redefines
-- public.cancel_shifts_for_user_deletion (20261110600003) with the same signature. The shift goes back to open
-- when no other offer of it is still open; it stays offered when another caregiver still holds an offer.
-- The offer of the deleted caregiver is expired first, and the audit log keeps the change.
--
-- The return value is still the number of shifts canceled. A shift that goes back to open is not counted.

create or replace function public.cancel_shifts_for_user_deletion(p_user uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift uuid;
  v_count int := 0;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles where id = p_user) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  for v_shift in
    select s.id
      from public.shifts s
      join public.households h on h.id = s.household_id
     where s.status in ('open', 'offered', 'assigned')
       and lower(s.period) > now()
       and (s.provider_id = p_user or h.owner_id = p_user)
     order by lower(s.period)
       for update of s
  loop
    update public.shifts set status = 'canceled' where id = v_shift;
    update public.shift_offers set status = 'expired' where shift_id = v_shift and status = 'offered';
    perform private.audit('shift.canceled', 'shift', v_shift::text,
                          jsonb_build_object('status', 'canceled', 'cause', 'account_deletion'));
    v_count := v_count + 1;
  end loop;

  -- Shifts offered to the deleted caregiver: the offer goes with the account, so the shift is released.
  for v_shift in
    select s.id
      from public.shifts s
     where s.status = 'offered'
       and exists (select 1 from public.shift_offers o
                    where o.shift_id = s.id and o.provider_id = p_user and o.status = 'offered')
     order by s.id
       for update of s
  loop
    update public.shift_offers set status = 'expired'
     where shift_id = v_shift and provider_id = p_user and status = 'offered';
    if not exists (select 1 from public.shift_offers o where o.shift_id = v_shift and o.status = 'offered') then
      update public.shifts set status = 'open' where id = v_shift;
      perform private.audit('shift.reopened', 'shift', v_shift::text,
                            jsonb_build_object('status', 'open', 'cause', 'account_deletion'));
    end if;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.cancel_shifts_for_user_deletion(uuid) from public, anon, authenticated;
grant execute on function public.cancel_shifts_for_user_deletion(uuid) to service_role;
