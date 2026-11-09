-- Verification documents: a provider keeps at most 30 files in the provider-documents bucket. Every file
-- in the provider's folder counts, reviewed or not.
begin;
select plan(5);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- provider_c already has 29 files in its folder.
insert into storage.objects (bucket_id, name)
select 'provider-documents', tests.uid('provider_c') || '/arquivo-' || g || '.png'
  from generate_series(1, 29) as g;
select is((select count(*)::int from storage.objects
            where bucket_id = 'provider-documents' and (storage.foldername(name))[1] = tests.uid('provider_c')::text), 29,
          'provider C has 29 files in the bucket');

select tests.authenticate_as('provider_c');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                       tests.uid('provider_c') || '/arquivo-30.png'),
                'the thirtieth file is accepted');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                        tests.uid('provider_c') || '/arquivo-31.png'),
                 '42501', null, 'the thirty-first file is refused by the policy');
select tests.clear_authentication();

-- The limit is per provider: provider D still has room.
select tests.authenticate_as('provider_d');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                       tests.uid('provider_d') || '/selfie.png'),
                'another provider uploads freely');
select tests.clear_authentication();

select * from finish();
rollback;
