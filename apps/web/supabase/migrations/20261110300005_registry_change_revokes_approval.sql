-- Registry rule. Only a new number or a new state sends the registry back to review. A rejected or a
-- confirmed registry that changes this way loses the occupation's approval: the occupation leaves the
-- search until an administrator confirms the registry and approves the occupation again.
create or replace function private.apply_registry_rule()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_required boolean := private.requires_registry(new.occupation_slug);
  v_provider_status public.provider_status;
begin
  new.registry_number := nullif(trim(new.registry_number), '');

  -- An occupation without a policy cannot be taken (become_provider and adding an
  -- occupation both land here), whoever writes the row.
  if (tg_op = 'INSERT' or new.occupation_slug is distinct from old.occupation_slug)
     and not private.occupation_has_policy(new.occupation_slug) then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'policy missing';
  end if;

  if v_required and new.registry_number is null then
    raise exception 'registry_required' using errcode = 'P0001';
  end if;

  if tg_op = 'INSERT' then
    if private.is_client_context() then
      v_provider_status := private.provider_status_of(new.provider_id);
      if v_provider_status is distinct from 'draft' and v_provider_status is distinct from 'approved' then
        raise exception 'not_allowed' using errcode = 'P0001';
      end if;
      new.approved := false;
    end if;
  else
    if private.is_client_context() then
      if new.provider_id is distinct from old.provider_id
         or new.occupation_slug is distinct from old.occupation_slug
         or new.registry_status is distinct from old.registry_status
         or new.approved is distinct from old.approved then
        raise exception 'not_allowed' using errcode = 'P0001';
      end if;
    elsif new.registry_status is distinct from old.registry_status then
      return new; -- explicit decision by an admin function or the service role
    end if;

    -- Only a new number (or UF) sends the registry back to review.
    if new.registry_number is not distinct from old.registry_number
       and new.registry_uf is not distinct from old.registry_uf
       and new.occupation_slug is not distinct from old.occupation_slug then
      return new;
    end if;

    -- A rejected or confirmed registry does not keep its approval through a change of number or state.
    if old.registry_status in ('rejected', 'confirmed') then
      new.approved := false;
    end if;
  end if;

  new.registry_status := case when v_required then 'informed' else 'not_required' end;
  return new;
end;
$$;
