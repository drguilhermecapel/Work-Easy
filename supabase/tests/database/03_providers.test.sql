-- Providers: RLS per role, registry rule, protected status, service units, documents
-- and storage, review submission, search ordering and the public page.
begin;
select plan(47);
select tests.setup_fixture();

-- ---------------------------------------------------------------- RLS on providers
select tests.authenticate_anon();
select throws_ok($$select * from public.providers$$, '42501', null, 'anon cannot read the providers table');
select throws_ok($$select * from public.services$$, '42501', null, 'anon cannot read the services table');

select tests.authenticate_as('client_a');
select is((select count(*)::int from public.providers), 0, 'a client without jobs reads no provider rows');
select is((select count(*)::int from public.provider_occupations), 0, 'a client reads no provider occupations');

select tests.authenticate_as('provider_a');
select is((select count(*)::int from public.providers), 1, 'provider A reads only the own row');
select is((select count(*)::int from public.provider_occupations), 2, 'provider A reads only the own occupations');
select lives_ok($$update public.providers set bio = 'Atendo zona oeste.' where id = auth.uid()$$, 'provider edits the bio');
select throws_ok($$update public.providers set status = 'suspended' where id = auth.uid()$$, 'P0001', 'not_allowed',
                 'provider cannot change the own status');
select throws_ok($$update public.providers set plan = 'pro' where id = auth.uid()$$, 'P0001', 'not_allowed',
                 'provider cannot change the own plan');
update public.providers set bio = 'Invadido' where id = tests.uid('provider_b');

select tests.authenticate_as('admin');
select is((select count(*)::int from public.providers where slug like 't-%'), 5, 'admin reads every provider');

select tests.clear_authentication();
select is((select bio from public.providers where id = tests.uid('provider_b')), null, 'provider A could not edit provider B');

-- ---------------------------------------------------------------- registry rule
select is((select registry_status::text from public.provider_occupations
            where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'), 'informed',
          'regulated occupation with a number starts informed');
select is((select registry_status::text from public.provider_occupations
            where provider_id = tests.uid('provider_a') and occupation_slug = 't-domestica'), 'not_required',
          'unregulated occupation is not_required');

select tests.authenticate_as('provider_b');
select throws_ok($$update public.provider_occupations set registry_status = 'confirmed' where provider_id = auth.uid()$$,
                 'P0001', 'not_allowed', 'provider cannot confirm the own registry');
select throws_ok($$update public.provider_occupations set registry_number = null where provider_id = auth.uid()$$,
                 'P0001', 'registry_required', 'provider cannot remove a required registry number');
select tests.authenticate_as('admin');
select lives_ok($$select public.admin_set_registry_status(tests.uid('provider_b'), 't-medico', 'confirmed', 'CRM consultado')$$,
                'admin confirms the registry');
select tests.authenticate_as('provider_b');
select lives_ok($$update public.provider_occupations set is_primary = true where provider_id = auth.uid()$$,
                'editing other fields keeps the reviewed status');
select is((select registry_status::text from public.provider_occupations where provider_id = auth.uid()), 'confirmed',
          'status still confirmed');
select lives_ok($$update public.provider_occupations set registry_number = '654321' where provider_id = auth.uid()$$,
                'provider changes the registry number');
select is((select registry_status::text from public.provider_occupations where provider_id = auth.uid()), 'informed',
          'a new number goes back to informed');
select throws_ok($$insert into public.provider_occupations (provider_id, occupation_slug, registry_number)
                   values (tests.uid('provider_a'), 't-medico', '999')$$,
                 '42501', null, 'provider B cannot add occupations to provider A');

-- ---------------------------------------------------------------- services
select tests.authenticate_as('provider_a');
select throws_ok($$insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit)
                   values (auth.uid(), 't-domestica', 'Faxina', 15000, 'm2')$$,
                 'P0001', 'unit_not_allowed', 'unit outside the policy price_units is rejected');
select lives_ok($$insert into public.services (provider_id, occupation_slug, title, price_min_cents, price_max_cents, unit)
                  values (auth.uid(), 't-domestica', 'Diária', 15000, 20000, 'dia')$$,
                'unit allowed by the policy is accepted');
select throws_ok($$insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit)
                   values (auth.uid(), 't-medico', 'Consulta', 30000, 'sessao')$$,
                 '23503', null, 'a service needs an occupation the provider has');
select throws_ok($$insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit)
                   values (tests.uid('provider_c'), 't-reparo', 'Hack', 100, 'hora')$$,
                 '42501', null, 'provider A cannot create services for provider C');
select throws_ok($$insert into public.availability (provider_id, weekday, start_time, end_time)
                   values (auth.uid(), 1, '18:00', '08:00')$$,
                 '23514', null, 'availability needs start before end');

-- ---------------------------------------------------------------- documents and storage
select lives_ok(format($$insert into public.provider_documents (provider_id, step, storage_path)
                         values (%L, 'documento_selfie', %L)$$, tests.uid('provider_a'), tests.uid('provider_a') || '/rg.png'),
                'provider uploads a document record');
select throws_ok(format($$insert into public.provider_documents (provider_id, step, storage_path)
                          values (%L, 'documento_selfie', 'outra-pasta/rg.png')$$, tests.uid('provider_a')),
                 '23514', null, 'document path must be inside the own folder');
select throws_ok($$update public.provider_documents set status = 'accepted'$$, '42501', null,
                 'provider cannot accept the own document');
select lives_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                       tests.uid('provider_a') || '/rg.png'),
                'provider uploads into the own folder of provider-documents');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                        tests.uid('provider_c') || '/rg.png'),
                 '42501', null, 'provider cannot upload into another folder');
select tests.authenticate_as('client_a');
select is((select count(*)::int from storage.objects where bucket_id = 'provider-documents'), 0,
          'other users cannot read provider documents in storage');
select is((select count(*)::int from public.provider_documents), 0, 'other users cannot read document records');
select tests.authenticate_as('admin');
select is((select count(*)::int from storage.objects where bucket_id = 'provider-documents'), 1,
          'admin reads provider documents in storage');
select tests.clear_authentication();
select is((select public from storage.buckets where id = 'provider-documents'), false, 'the documents bucket is private');

-- ---------------------------------------------------------------- submit for review
select tests.authenticate_as('client_b');
select lives_ok($$select public.become_provider('Faxina B', 't-faxina-b', 't-domestica')$$, 'client B becomes a provider');
select throws_ok($$select public.submit_provider_for_review()$$, 'P0001', 'documents_missing',
                 'review needs every verification step of the policy');
insert into public.provider_documents (provider_id, step, storage_path) values
  (tests.uid('client_b'), 'documento_selfie', tests.uid('client_b') || '/selfie.png'),
  (tests.uid('client_b'), 'cadastro_fiscal', tests.uid('client_b') || '/cpf.pdf');
select is(public.submit_provider_for_review()::text, 'pending_review', 'complete documents move the provider to review');
select throws_ok($$select public.submit_provider_for_review()$$, 'P0001', 'invalid_transition',
                 'a provider in review cannot submit again');

-- ---------------------------------------------------------------- search and public page
select tests.clear_authentication();
-- Three published 5-star reviews for Davi and three 4-star reviews for Carla.
do $$
declare
  v_booking uuid;
  v_provider text;
  v_rating int;
  i int;
begin
  foreach v_provider in array array['provider_d', 'provider_c'] loop
    v_rating := case v_provider when 'provider_d' then 5 else 4 end;
    for i in 1..3 loop
      v_booking := tests.make_booking(v_provider, 'client_a', 't-reparo',
                                      tests.sp_period(format('2029-0%s-0%s 09:00', i, i + 1)), 'completed');
      insert into public.payments (booking_id, provider_id, payer_id, amount_cents, status)
      values (v_booking, tests.uid(v_provider), tests.uid('client_a'), 10000, 'received');
      insert into public.reviews (booking_id, client_id, rating) values (v_booking, tests.uid('client_a'), v_rating);
    end loop;
  end loop;
end;
$$;

select tests.authenticate_anon();
select results_eq(
  $$select slug from public.search_providers('t-reparo', tests.neighborhood('t-bairro-1'))$$,
  array['t-davi', 't-carla', 't-ana', 't-eva'],
  'with rating_ranking: rated providers by average, then the rest by name');
select is((select rating_avg from public.search_providers('t-reparo') where slug = 't-davi'), 5.00::numeric,
          'search returns the average rating');
select is((select count(*)::int from public.search_providers('t-reparo', tests.neighborhood('t-bairro-2'))), 0,
          'neighborhood filter excludes providers that do not serve it');
select is((select rating_avg from public.search_providers('t-medico')), null,
          'without rating_ranking no rating is returned');
select is((select count(*)::int from public.search_providers('t-domestica')), 1,
          'draft and pending providers are not listed');
select is(public.get_provider_page('t-ana') -> 'provider' ->> 'display_name', 'Ana Teste', 'anon reads the public page');
select is(public.get_provider_page('t-faxina-b'), null, 'a provider not approved has no public page');
select is(jsonb_array_length(public.get_provider_page('t-davi') -> 'reviews'), 3, 'public page shows published reviews');

select * from finish();
rollback;
