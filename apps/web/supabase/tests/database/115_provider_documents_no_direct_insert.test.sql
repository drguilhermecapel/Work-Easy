-- Verification documents: a signed-in provider cannot write the provider-documents bucket directly, not
-- even into its own folder. The upload function writes it with the service role, and the provider keeps
-- the select and delete policies on its own files.
begin;
select plan(9);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and cmd = 'INSERT'
      and policyname = 'provider_documents_objects_insert'),
  0, 'the provider insert policy on storage.objects is gone');
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('provider_documents_objects_select', 'provider_documents_objects_delete')),
  2, 'the select and delete policies of the documents bucket stay');

-- The upload function writes with the service role
select tests.authenticate_service();
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                       tests.uid('provider_a') || '/cnh.jpg'),
                'the service role writes into the provider folder (the upload function)');
select tests.clear_authentication();

select tests.authenticate_as('provider_a');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                        tests.uid('provider_a') || '/original.jpg'),
                 '42501', null, 'a provider cannot upload an original file into its own folder');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                        tests.uid('provider_b') || '/original.jpg'),
                 '42501', null, 'a provider cannot upload into another provider folder');
select is((select count(*)::int from storage.objects where name = tests.uid('provider_a') || '/original.jpg'), 0,
          'the refused original is not in the bucket');
select is((select count(*)::int from storage.objects where bucket_id = 'provider-documents'), 1,
          'the provider still reads its own file in the bucket');

select tests.authenticate_as('provider_b');
select is((select count(*)::int from storage.objects where bucket_id = 'provider-documents'), 0,
          'another provider reads none of these files');
select tests.clear_authentication();

select * from finish();
rollback;
