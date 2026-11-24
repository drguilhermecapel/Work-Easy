-- A CRM entry that has a job or a quote cannot be deleted: deleting it would cut the history
-- from its client. The foreign keys keep their set-null rule, which is what the account
-- deletion relies on: removing a provider's account removes its entries by cascade, and the jobs
-- stay with a null link. So the check is skipped when the provider row is already gone (the
-- cascade), and it applies to every other delete, the provider's own included.

create function private.guard_crm_entry_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.providers p where p.id = old.provider_id) then
    return old;
  end if;
  if exists (select 1 from public.bookings b where b.provider_client_id = old.id)
     or exists (select 1 from public.quotes q where q.provider_client_id = old.id) then
    raise exception 'client_has_history' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

revoke all on function private.guard_crm_entry_history() from public, anon, authenticated;

create trigger provider_clients_history_guard
  before delete on public.provider_clients
  for each row execute function private.guard_crm_entry_history();
