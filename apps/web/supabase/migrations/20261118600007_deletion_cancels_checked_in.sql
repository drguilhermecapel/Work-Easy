-- Account deletion, care shifts in progress: when the caregiver's account is deleted, a shift in progress (status
-- checked_in) of that caregiver is canceled with the account, like the other future shifts. Redefines
-- public.cancel_shifts_for_user_deletion (20261110600007) with the same signature, grants and return value; the only
-- change is the filter that selects the shifts.
--
-- Why: a caregiver checks in up to 2 hours before the start, so a shift in progress can start later than now, and a
-- shift that has already started is checked_in too. The previous filter (lower(period) > now()) left both as they
-- were. The shift kept checked_in, and the foreign key cleared its caregiver when the caregiver's account was
-- deleted: the family was left with a shift that had no caregiver and no notice.
--
-- Now a shift in progress of the deleted caregiver is canceled whatever its period, because its check-out cannot
-- happen once the caregiver's account is gone. The counterparts are told through the same path as every other
-- cancellation in this function (private.notify with shift_canceled_by_deletion); the deleted account is never told.
-- A completed shift is history and stays as it is.
--
-- Not changed here: a shift in progress when the family's account is deleted. Only the caregiver's deletion is decided.
--
-- Provisional: canceling a shift in progress awaits the legal confirmation (DD12). If that decision changes, a new
-- migration redefines the function; this file is not edited.

create or replace function public.cancel_shifts_for_user_deletion(p_user uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_shift uuid;
  v_party uuid;
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
     where ((s.status in ('open', 'offered', 'assigned') and lower(s.period) > now()
             and (s.provider_id = p_user or h.owner_id = p_user))
            or (s.status = 'checked_in' and s.provider_id = p_user))
     order by lower(s.period)
       for update of s
  loop
    -- The people left with the shift are told before their offers expire: the family, the assigned caregiver,
    -- and the caregivers still holding an offer. The deleted account is never one of them.
    for v_party in
      select distinct x.id
        from (
          select h.owner_id as id
            from public.shifts s
            join public.households h on h.id = s.household_id
           where s.id = v_shift
          union all
          select s.provider_id from public.shifts s where s.id = v_shift
          union all
          select o.provider_id from public.shift_offers o where o.shift_id = v_shift and o.status = 'offered'
        ) x
       where x.id is not null and x.id <> p_user
    loop
      perform private.notify(v_party, 'shift_canceled_by_deletion', jsonb_build_object('shift_id', v_shift));
    end loop;

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

