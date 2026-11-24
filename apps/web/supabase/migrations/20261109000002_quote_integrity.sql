-- Quote integrity. A quote can be sent (inserted or moved to 'sent') only by a provider who is
-- approved and has at least one approved occupation whose registry was not rejected: the same
-- rule as the proposals and direct bookings. While a quote is 'sent' its offer (title, items,
-- validity, notes) cannot change; a provider who edits it moves it back to draft first, and the
-- new version is sent again. The total is recomputed from the items as before.

create function private.can_send_quotes(p_provider uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_provider_approved(p_provider)
     and exists (select 1 from public.provider_occupations po
                  where po.provider_id = p_provider
                    and po.approved
                    and po.registry_status <> 'rejected');
$$;

revoke all on function private.can_send_quotes(uuid) from public;
grant execute on function private.can_send_quotes(uuid) to authenticated, service_role;

create or replace function private.guard_quote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_client_context() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'sent') then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
  else
    if new.provider_id is distinct from old.provider_id or new.public_token is distinct from old.public_token then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
    if new.status is distinct from old.status
       and (old.status, new.status) not in (('draft', 'sent'), ('sent', 'draft')) then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    if old.status in ('accepted', 'declined', 'expired') then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    if old.status = 'sent' and new.status = 'sent'
       and (new.title, new.items, new.valid_until, new.notes)
           is distinct from (old.title, old.items, old.valid_until, old.notes) then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
  end if;
  if new.status = 'sent'
     and (tg_op = 'INSERT' or old.status is distinct from 'sent')
     and not private.can_send_quotes(new.provider_id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
