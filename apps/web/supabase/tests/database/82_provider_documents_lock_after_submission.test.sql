-- Verification documents: an owner removes an unreviewed document and its file while the
-- profile is a draft; once the profile is submitted for review, the owner cannot remove or
-- replace the documents under review, and an administrator still reviews them. A reviewed
-- document stays locked for its owner in every state.
begin;
select plan(12);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();
-- Direct deletes reach the storage policies in this transaction only (the Storage API guard is
-- what the policy is checked against here).
set local storage.allow_delete_query = 'true';

-- provider_e starts as a draft with three files: one unreviewed document, one that is
-- reviewed, and one file that no document row refers to.
update public.providers set status = 'draft' where id = tests.uid('provider_e');
insert into storage.objects (bucket_id, name) values
  ('provider-documents', tests.uid('provider_e') || '/draft.png'),
  ('provider-documents', tests.uid('provider_e') || '/review.png'),
  ('provider-documents', tests.uid('provider_e') || '/accepted.png'),
  ('provider-documents', tests.uid('provider_e') || '/loose.png');
insert into public.provider_documents (provider_id, step, storage_path, status) values
  (tests.uid('provider_e'), 'documento_selfie', tests.uid('provider_e') || '/draft.png', 'submitted'),
  (tests.uid('provider_e'), 'documento_selfie', tests.uid('provider_e') || '/review.png', 'submitted'),
  (tests.uid('provider_e'), 'documento_selfie', tests.uid('provider_e') || '/accepted.png', 'accepted');

-- Draft: the owner removes the unreviewed document, its file and the orphan file.
select tests.authenticate_as('provider_e');
delete from public.provider_documents where storage_path = tests.uid('provider_e') || '/draft.png';
delete from storage.objects where bucket_id = 'provider-documents' and name = tests.uid('provider_e') || '/draft.png';
delete from storage.objects where bucket_id = 'provider-documents' and name = tests.uid('provider_e') || '/loose.png';
delete from public.provider_documents where storage_path = tests.uid('provider_e') || '/accepted.png';
delete from storage.objects where bucket_id = 'provider-documents' and name = tests.uid('provider_e') || '/accepted.png';
select tests.clear_authentication();
select is((select count(*)::int from public.provider_documents where storage_path = tests.uid('provider_e') || '/draft.png'), 0,
          'in draft the owner removes an unreviewed document');
select is((select count(*)::int from storage.objects where name = tests.uid('provider_e') || '/draft.png'), 0,
          'and its file');
select is((select count(*)::int from storage.objects where name = tests.uid('provider_e') || '/loose.png'), 0,
          'the owner removes a file that no document refers to');
select is((select count(*)::int from public.provider_documents where storage_path = tests.uid('provider_e') || '/accepted.png'), 1,
          'a reviewed document cannot be removed by its owner, even in draft (row)');
select is((select count(*)::int from storage.objects where name = tests.uid('provider_e') || '/accepted.png'), 1,
          'a reviewed document cannot be removed by its owner, even in draft (file)');

-- The profile goes to review; the document under review is then locked.
select tests.authenticate_as('provider_e');
select lives_ok($$select public.submit_provider_for_review()$$, 'the provider submits the profile for review');
select tests.clear_authentication();
select is((select status::text from public.providers where id = tests.uid('provider_e')), 'pending_review',
          'the profile is in review');

select tests.authenticate_as('provider_e');
delete from public.provider_documents where storage_path = tests.uid('provider_e') || '/review.png';
delete from storage.objects where bucket_id = 'provider-documents' and name = tests.uid('provider_e') || '/review.png';
update storage.objects set metadata = '{"swapped": true}'::jsonb
 where bucket_id = 'provider-documents' and name = tests.uid('provider_e') || '/review.png';
select tests.clear_authentication();
select is((select count(*)::int from public.provider_documents where storage_path = tests.uid('provider_e') || '/review.png'), 1,
          'after the submission the owner cannot remove the document under review (row)');
select is((select count(*)::int from storage.objects where name = tests.uid('provider_e') || '/review.png'), 1,
          'and not its file');
select is((select metadata from storage.objects where name = tests.uid('provider_e') || '/review.png'), null,
          'and cannot replace the file under review');

-- An administrator still reviews the document under review.
select tests.authenticate_as('admin');
select is(public.admin_review_document(
            (select id from public.provider_documents where storage_path = tests.uid('provider_e') || '/review.png'), true)::text,
          'accepted', 'an administrator still reviews the document under review');
select tests.clear_authentication();

select * from finish();
rollback;
