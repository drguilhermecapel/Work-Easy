-- Account deletion, care shifts: the future shifts of a user are canceled, so they do not block the deletion.
-- account-delete calls this function as the service role, before anonymize_user.
--
-- Canceled: the shifts that start after now and are open, offered or assigned, when they belong to a
-- household the user owns or they are assigned to the user as caregiver. The offers still open on them
-- expire, as a family cancel does in cancel_shift. The shift keeps its caregiver, so the record shows who
-- was booked. Returns how many shifts were canceled. Running it again cancels nothing.
--
-- Not canceled: a shift in progress (checked_in) stays checked_in, even when it starts later than now (a
-- caregiver checks in up to 2 hours early). It ends with the deletion of the caregiver's account: the
-- foreign key sets its provider to null, and the check-out cannot happen. Started, completed, canceled and
-- no-show shifts are history and stay as they are.
--
-- Not notified: the counterpart of a canceled shift should get a message through private.notify, but the
-- notifications table only accepts the templates of 20261109300006, and none of them is a shift
-- cancellation. This function does not add a template; the WhatsApp template has to exist first.
create function public.cancel_shifts_for_user_deletion(p_user uuid)
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
  return v_count;
end;
$$;

revoke all on function public.cancel_shifts_for_user_deletion(uuid) from public, anon, authenticated;
grant execute on function public.cancel_shifts_for_user_deletion(uuid) to service_role;
