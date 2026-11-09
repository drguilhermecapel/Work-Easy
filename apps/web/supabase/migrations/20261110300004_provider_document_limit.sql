-- A provider keeps at most 30 files in the provider-documents bucket. Every file in the provider's folder
-- counts, reviewed or not. The insert policy asks private.provider_document_slot_free, which takes a lock
-- per provider before it counts, so two uploads of one provider are counted one after the other.
-- Uploads reach the bucket one object at a time through the Storage API, and the storage schema is not
-- exposed through the Data API, so a bulk insert of many objects in one statement is not a path here.
create function private.provider_document_slot_free(p_bucket text, p_name text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner text := (storage.foldername(p_name))[1];
begin
  if p_bucket is distinct from 'provider-documents' then
    return true;
  end if;

  perform pg_advisory_xact_lock(hashtext('provider-documents'), hashtext(v_owner));

  return (
    select count(*) from storage.objects o
     where o.bucket_id = 'provider-documents'
       and (storage.foldername(o.name))[1] = v_owner
  ) < 30;
end;
$$;

revoke all on function private.provider_document_slot_free(text, text) from public;
grant execute on function private.provider_document_slot_free(text, text) to authenticated;

drop policy provider_documents_objects_insert on storage.objects;

create policy provider_documents_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'provider-documents'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and private.is_provider((select auth.uid()))
    and private.provider_document_slot_free(bucket_id, name)
  );
