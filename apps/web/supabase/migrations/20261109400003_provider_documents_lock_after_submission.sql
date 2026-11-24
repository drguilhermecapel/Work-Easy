-- Verification documents are locked for their owner once the provider has submitted the
-- profile for review (the provider left 'draft') and once a document is reviewed (accepted or
-- rejected). Until the submission the owner may still remove a document and its file, as the
-- provider screen does; afterwards the file under review cannot be deleted or swapped by the
-- owner. Files that no document row refers to stay removable by their owner (a failed upload
-- cleans up after itself). Admins keep their rights.

create or replace function private.document_object_locked(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.provider_documents d
     where d.storage_path = p_name
       and (d.status <> 'submitted' or private.provider_status_of(d.provider_id) <> 'draft')
  );
$$;

drop policy provider_documents_delete_own on public.provider_documents;
create policy provider_documents_delete_own on public.provider_documents
  for delete to authenticated
  using (
    provider_id = (select auth.uid())
    and status = 'submitted'
    and private.provider_status_of(provider_id) = 'draft'
  );
