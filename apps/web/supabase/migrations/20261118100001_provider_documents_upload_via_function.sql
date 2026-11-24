-- Verification documents reach the provider-documents bucket only through the provider-document-upload
-- Edge Function. It removes the metadata of the photo on the server and writes with the service role.
-- The provider's insert policy on storage.objects is dropped, so an original file can no longer go
-- straight through the Storage API. The select and delete policies stay as they are. The 60-file
-- limit is counted by the function: no policy calls private.provider_document_slot_free any more.

drop policy provider_documents_objects_insert on storage.objects;
