-- Verification documents: a provider keeps at most 60 files in the provider-documents bucket. The upload
-- function counts them and writes the bucket; the provider has no insert policy on it.
-- Registry: changing the number or the state of a confirmed registry takes the occupation's approval
-- away, so it leaves the search until an administrator confirms and approves it again.
begin;
select plan(15);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- Documents: provider_c already has 59 files in its folder (reviewed or not, they all count).
insert into storage.objects (bucket_id, name)
select 'provider-documents', tests.uid('provider_c') || '/arquivo-' || g || '.png'
  from generate_series(1, 59) as g;
select is((select count(*)::int from storage.objects
            where bucket_id = 'provider-documents' and (storage.foldername(name))[1] = tests.uid('provider_c')::text), 59,
          'provider C has 59 files in the bucket');

-- A provider writes no file itself: the upload function writes the bucket and counts the folder
-- against the limit (test/functions/provider-document-upload.test.ts). Nothing in the database counts now.
select tests.authenticate_as('provider_c');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                        tests.uid('provider_c') || '/arquivo-60.png'),
                 '42501', null, 'the sixtieth file is not written by the provider itself');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                        tests.uid('provider_c') || '/arquivo-61.png'),
                 '42501', null, 'the sixty-first file is not written by the provider itself either');
select tests.clear_authentication();

select tests.authenticate_as('provider_d');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                        tests.uid('provider_d') || '/selfie.png'),
                 '42501', null, 'another provider cannot write its file directly either');
select tests.clear_authentication();

-- Registry: provider B's medical registry is confirmed and approved (its documents are accepted).
insert into public.provider_documents (provider_id, step, storage_path, status) values
  (tests.uid('provider_b'), 'documento_selfie', tests.uid('provider_b') || '/selfie.png', 'accepted'),
  (tests.uid('provider_b'), 'registro_profissional', tests.uid('provider_b') || '/crm.pdf', 'accepted');
select tests.authenticate_as('admin');
select is(public.admin_set_registry_status(tests.uid('provider_b'), 't-medico', 'confirmed', 'CRM conferido')::text, 'confirmed',
          'admin confirms the registry');
select tests.clear_authentication();

-- The provider corrects the number of the confirmed registry: the approval goes away.
select tests.authenticate_as('provider_b');
select lives_ok($$update public.provider_occupations set registry_number = '654321'
                   where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'$$,
                'the provider corrects the registry number');
select tests.clear_authentication();
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'), false,
          'changing the number of a confirmed registry takes the approval away');
select is((select registry_status::text from public.provider_occupations
            where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'), 'informed',
          'and the registry goes back to review');

-- Confirmed and approved again by an administrator.
select tests.authenticate_as('admin');
select is(public.admin_set_registry_status(tests.uid('provider_b'), 't-medico', 'confirmed', 'Número conferido')::text, 'confirmed',
          'admin confirms the new number');
select is(public.admin_set_occupation_approval(tests.uid('provider_b'), 't-medico', true, 'Conferido novamente'), true,
          'admin approves the occupation again');
select tests.clear_authentication();

-- A save that keeps the number keeps the approval.
select tests.authenticate_as('provider_b');
select lives_ok($$update public.provider_occupations set registry_number = '654321'
                   where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'$$,
                'the provider saves the same number again');
select tests.clear_authentication();
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'), true,
          'a save that keeps the number keeps the approval');

-- The state of the registry counts as well.
select tests.authenticate_as('provider_b');
select lives_ok($$update public.provider_occupations set registry_uf = 'RJ'
                   where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'$$,
                'the provider changes the state of the registry');
select tests.clear_authentication();
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'), false,
          'changing the state of a confirmed registry takes the approval away too');

select * from finish();
rollback;
