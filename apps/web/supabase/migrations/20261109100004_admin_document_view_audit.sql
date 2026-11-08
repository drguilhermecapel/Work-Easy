-- 04 Admin reads of provider documents (PRIV-01): an admin who asks for the link of a document
-- leaves an audit entry (document.viewed). The app calls this RPC before it creates the signed
-- link (services/admin.ts createDocumentUrl), so a failed record means no link. The Storage
-- policy still lets an admin read the file directly; closing that path is a separate change.

create function public.admin_log_document_view(p_storage_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doc record;
begin
  perform private.require_admin();
  select d.id, d.provider_id, d.step into v_doc
    from public.provider_documents d
   where d.storage_path = p_storage_path;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001', detail = 'document not found';
  end if;

  perform private.audit('document.viewed', 'provider_document', v_doc.id::text,
                        jsonb_build_object('provider_id', v_doc.provider_id, 'step', v_doc.step));
end;
$$;

revoke all on function public.admin_log_document_view(text) from public, anon;
grant execute on function public.admin_log_document_view(text) to authenticated;
