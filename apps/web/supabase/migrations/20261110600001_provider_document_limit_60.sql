-- A provider keeps at most 60 files in the provider-documents bucket (it was 30). Every file in the
-- provider's folder counts, reviewed or not. A document that was already analyzed stays locked as before:
-- this migration changes only the number. Redefines private.provider_document_slot_free with the same
-- signature and the same body as 20261110300004, except the limit. The insert policy asks this function,
-- which takes a lock per provider before it counts, so two uploads of one provider are counted one after
-- the other. Uploads reach the bucket one object at a time through the Storage API, and the storage schema
-- is not exposed through the Data API, so a bulk insert of many objects in one statement is not a path here.
create or replace function private.provider_document_slot_free(p_bucket text, p_name text)
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
  ) < 60;
end;
$$;

revoke all on function private.provider_document_slot_free(text, text) from public;
grant execute on function private.provider_document_slot_free(text, text) to authenticated;
