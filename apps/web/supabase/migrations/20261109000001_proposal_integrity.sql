-- Proposal integrity. created_at drives the free monthly allowance (check_proposal), so it is
-- server-owned: clients may not write it, and the server sets it on insert. An offer is fixed once
-- it is sent: its price, message and validity cannot change afterwards (a provider who wants another
-- price withdraws and sends again).

-- Column grant instead of the table-wide one: only the fields a provider edits or withdraws.
revoke update on public.proposals from authenticated;
grant update (price_cents, message, valid_until, status) on public.proposals to authenticated;

-- Runs before the guard and the allowance check (names sort before 10_guard and 20_check).
create function private.guard_proposal_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if private.is_client_context() then
      new.created_at := now();
    end if;
    return new;
  end if;
  if new.created_at is distinct from old.created_at then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger proposals_05_timestamps
  before insert or update on public.proposals
  for each row execute function private.guard_proposal_timestamps();

-- Same guard as before, with the offer frozen from the moment it is sent (not only once it
-- left 'sent').
create or replace function private.guard_proposal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_client_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'sent';
    return new;
  end if;
  if new.request_id is distinct from old.request_id
     or new.provider_id is distinct from old.provider_id
     or (new.status is distinct from old.status and not (old.status = 'sent' and new.status = 'withdrawn'))
     or (new.price_cents, new.message, new.valid_until)
          is distinct from (old.price_cents, old.message, old.valid_until) then
    raise exception 'invalid_transition' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
