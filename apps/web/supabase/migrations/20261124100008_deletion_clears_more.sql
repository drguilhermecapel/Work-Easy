-- What the deletion of an account still left behind (found while writing the public page
-- /excluir-conta against anonymize_user): the city of the profile, the free text of the proposals
-- a provider sent, and the account's entries in the waiting list. The trigger that already clears
-- reports and blocks when a profile is marked deleted (migration 20261124100002) now clears these
-- too, so anonymize_user itself stays as it is.

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
  end if;
  return null;
end;
$$;

revoke all on function private.clear_reports_and_blocks_on_deletion() from public, anon, authenticated;
