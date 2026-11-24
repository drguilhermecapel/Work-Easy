-- Decision of 24/11/2026 (DD82, delegated to the assistant "in favor of the platform"): a provider's quote title
-- and service title are free text and can carry a client's name; when the account is deleted they are replaced by a
-- neutral one. The items and the total of a quote stay: they are the fiscal record of what was charged, and the
-- name, phone and notes of the client are already cleared by anonymize_user.
--
-- The trigger of migration 20261124100002 (reports and blocks) already runs when a profile is marked deleted; this
-- adds the two updates to it. It runs as the table owner, so the guards written for the app's roles do not apply.

create or replace function private.clear_reports_and_blocks_on_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    update public.content_reports set details = null, reporter_id = null where reporter_id = new.id;
    delete from public.user_blocks where blocker_id = new.id or blocked_id = new.id;
    delete from public.waitlist_entries where user_id = new.id;
    update public.proposals set message = null where provider_id = new.id and message is not null;
    update public.profiles set city = null where id = new.id and city is not null;
    update public.quotes set title = 'Orçamento removido' where provider_id = new.id and title <> 'Orçamento removido';
    update public.services set title = 'Serviço removido' where provider_id = new.id and title <> 'Serviço removido';
  end if;
  return null;
end;
$$;

revoke all on function private.clear_reports_and_blocks_on_deletion() from public, anon, authenticated;
