-- 09 Care, care history: a household that has shifts cannot be deleted while its owner's
-- account exists. Shifts, check-ins and daily reports are the record of the care and the
-- count the labor lock relies on, so a direct delete (by the owner or any other session)
-- is refused with household_has_shifts.
--
-- Deleting an account still removes its households: the Auth delete cascades to the profile
-- and from there to the households, and by the time the households are reached the profile
-- row is already gone, so the rule lets that cascade through. A foreign key with
-- ON DELETE RESTRICT would have blocked the account deletion too, which is why this is a
-- trigger and not a constraint.

create function private.guard_household_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.profiles p where p.id = old.owner_id)
     and exists (select 1 from public.shifts s where s.household_id = old.id) then
    raise exception 'household_has_shifts' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger households_10_keep_history
  before delete on public.households
  for each row execute function private.guard_household_delete();

revoke all on function private.guard_household_delete() from public;
