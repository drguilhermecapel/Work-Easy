-- 05 Withdrawing the background-check consent (PRIV-02): one call records the decision and marks
-- every background-check file (antecedentes) of the provider with deletion_requested_at. The
-- storage cleanup that deletes the marked files is a separate step; the owner cannot set the
-- mark directly (no column grant), and reviewed files stay locked for the owner as before.

alter table public.provider_documents add column deletion_requested_at timestamptz;

create function public.withdraw_background_check(p_version text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_marked int;
begin
  if v_uid is null or nullif(trim(p_version), '') is null or char_length(p_version) > 40 then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  insert into public.consents (user_id, purpose, version, granted)
  values (v_uid, 'background_check', p_version, false);

  update public.provider_documents
     set deletion_requested_at = now()
   where provider_id = v_uid and step = 'antecedentes' and deletion_requested_at is null;
  get diagnostics v_marked = row_count;
  return v_marked;
end;
$$;

revoke all on function public.withdraw_background_check(text) from public, anon;
grant execute on function public.withdraw_background_check(text) to authenticated;
