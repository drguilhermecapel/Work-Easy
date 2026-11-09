-- Verification documents: a provider keeps at most 30 files in the provider-documents bucket.
-- Registry: changing the number or the state of a confirmed registry takes the occupation's approval
-- away, so it leaves the search until an administrator confirms and approves it again.
begin;
select plan(15);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- Documents: provider_c already has 29 files in its folder (reviewed or not, they all count).
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
