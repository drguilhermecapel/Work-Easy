-- 09 Care, shift terms while offered: the period, the rate and the caregiver payout are fixed as
-- soon as a shift leaves 'open', not only once it is assigned. The caregiver accepts the values
-- shown in the offer, and the family cannot change them while the offer is open. Notes stay
-- editable. Redefines private.guard_shift with the same signature; the other rules are unchanged.

create or replace function private.guard_shift()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_client_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'open';
    new.provider_id := null;
    return new;
  end if;
  if new.status is distinct from old.status
     or new.provider_id is distinct from old.provider_id
     or new.household_id is distinct from old.household_id then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  -- Families create open shifts and edit their terms only while nobody is offered or assigned.
  if old.status <> 'open'
     and (new.period, new.rate_cents, new.caregiver_payout_cents) is distinct from
         (old.period, old.rate_cents, old.caregiver_payout_cents) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
