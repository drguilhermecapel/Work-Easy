-- Purge of withdrawn background-check files (antecedentes). withdraw_background_check marks the
-- files with deletion_requested_at. The daily background-check-purge Edge Function removes each
-- file from the bucket once its mark is more than 30 days old, then calls
-- mark_background_check_purged for its row. Both functions run with the service role only.
--
-- A row with review or audit history stays as the record that the file was reviewed: status
-- 'purged' and no storage path. Any other row is deleted. The Storage object is removed first;
-- mark_background_check_purged refuses to run while the object is still in the bucket.

alter table public.provider_documents alter column storage_path drop not null;

alter table public.provider_documents
  add constraint provider_documents_purged_has_no_file
  check ((storage_path is null) = (status::text = 'purged'));

create function public.background_check_purge_candidates()
returns setof public.provider_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  retention_days constant int := 30;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  return query
    select d.*
      from public.provider_documents d
     where d.deletion_requested_at is not null
       and d.deletion_requested_at < now() - make_interval(days => retention_days)
       and d.storage_path is not null
     order by d.deletion_requested_at, d.id;
end;
$$;

create function public.mark_background_check_purged(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc public.provider_documents%rowtype;
  v_kept boolean;
begin
  if not private.is_service_role() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  select * into v_doc from public.provider_documents where id = p_id for update;
  -- Already deleted, or already purged (no file left): nothing to do.
  if not found or v_doc.storage_path is null then
    return;
  end if;
  if v_doc.deletion_requested_at is null then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'document was not withdrawn';
  end if;
  if exists (select 1 from storage.objects o
              where o.bucket_id = 'provider-documents' and o.name = v_doc.storage_path) then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'file still in the bucket';
  end if;

  v_kept := v_doc.reviewed_at is not null
            or exists (select 1 from public.audit_log a
                        where a.entity = 'provider_document' and a.entity_id = p_id::text);
  perform private.audit('document.purged', 'provider_document', p_id::text,
                        jsonb_build_object('provider_id', v_doc.provider_id, 'step', v_doc.step, 'kept', v_kept));
  if v_kept then
    update public.provider_documents set storage_path = null, status = 'purged' where id = p_id;
  else
    delete from public.provider_documents where id = p_id;
  end if;
end;
$$;

revoke all on function public.background_check_purge_candidates() from public, anon, authenticated;
grant execute on function public.background_check_purge_candidates() to service_role;

revoke all on function public.mark_background_check_purged(uuid) from public, anon, authenticated;
grant execute on function public.mark_background_check_purged(uuid) to service_role;
