-- A registry that goes to 'rejected' takes the occupation's approval with it, whoever writes
-- the row (the admin function, the service role or a direct write). Before, the approval
-- stayed set: the offer gates only read the rejection next to it, so confirming the registry
-- again offered the occupation with no new approval. Now the occupation comes back only
-- through admin_set_occupation_approval.

create function private.revoke_approval_on_rejection()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.registry_status = 'rejected' and old.registry_status is distinct from 'rejected' then
    new.approved := false;
  end if;
  return new;
end;
$$;

revoke all on function private.revoke_approval_on_rejection() from public;

create trigger provider_occupations_rejection_revokes_approval
  before update of registry_status on public.provider_occupations
  for each row execute function private.revoke_approval_on_rejection();

-- Rows that already sit on a rejected registry with the approval still set. The guard leaves
-- out a regulated row without its number, which the registry rule would refuse to rewrite.
update public.provider_occupations
   set approved = false
 where registry_status = 'rejected' and approved
   and (registry_number is not null or not private.requires_registry(occupation_slug));
