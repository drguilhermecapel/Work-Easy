-- Providers: RLS per role, registry rule, protected status, service units, documents
-- and storage, review submission, search ordering and the public page.
begin;
select plan(111);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
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
                 '23503', 'insert or update on table "services" violates foreign key constraint "services_provider_id_occupation_slug_fkey"',
                 'a service needs an occupation the provider has');
select throws_ok($$insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit)
                   values (tests.uid('provider_c'), 't-reparo', 'Hack', 100, 'hora')$$,
                 '42501', null, 'provider A cannot create services for provider C');
select throws_ok($$insert into public.availability (provider_id, weekday, start_time, end_time)
                   values (auth.uid(), 1, '18:00', '08:00')$$,
                 '23514', 'new row for relation "availability" violates check constraint "availability_check"',
                 'availability needs start before end');

-- ---------------------------------------------------------------- documents and storage
select lives_ok(format($$insert into public.provider_documents (provider_id, step, storage_path)
                         values (%L, 'documento_selfie', %L)$$, tests.uid('provider_a'), tests.uid('provider_a') || '/rg.png'),
                'provider uploads a document record');
select throws_ok(format($$insert into public.provider_documents (provider_id, step, storage_path)
                          values (%L, 'documento_selfie', 'outra-pasta/rg.png')$$, tests.uid('provider_a')),
                 '23514', 'new row for relation "provider_documents" violates check constraint "provider_documents_path_in_own_folder"',
                 'document path must be inside the own folder');
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
select throws_ok($$select public.submit_provider_for_review()$$, 'P0001', 'documents_missing',
                 'document records without the uploaded files do not count');
insert into storage.objects (bucket_id, name) values
  ('provider-documents', tests.uid('client_b') || '/selfie.png'),
  ('provider-documents', tests.uid('client_b') || '/cpf.pdf');
select is(public.submit_provider_for_review()::text, 'pending_review', 'complete documents move the provider to review');
select throws_ok($$select public.submit_provider_for_review()$$, 'P0001', 'invalid_transition',
                 'a provider in review cannot submit again');
select throws_ok($$insert into public.provider_occupations (provider_id, occupation_slug) values (auth.uid(), 't-reparo')$$,
                 'P0001', 'not_allowed', 'no occupation is added while the provider is in review');

-- rejected documents do not count; the slug is unique; a regulated occupation needs its number
select tests.clear_authentication();
select tests.create_user('client_c', 'Cliente C');
select tests.create_user('client_d', 'Cliente D');
select tests.authenticate_as('client_c');
select throws_ok($$select public.become_provider('Outra Ana', 't-ana', 't-domestica')$$, 'P0001', 'slug_taken',
                 'a slug already in use is refused with its own code');
select is((select count(*)::int from public.providers where id = auth.uid()), 0, 'the refused call created nothing');
select lives_ok($$select public.become_provider('Faxina C', 't-faxina-c', 't-domestica')$$, 'client C becomes a provider');
insert into public.provider_documents (provider_id, step, storage_path) values
  (tests.uid('client_c'), 'documento_selfie', tests.uid('client_c') || '/selfie.png'),
  (tests.uid('client_c'), 'cadastro_fiscal', tests.uid('client_c') || '/cpf.pdf');
insert into storage.objects (bucket_id, name) values
  ('provider-documents', tests.uid('client_c') || '/selfie.png'),
  ('provider-documents', tests.uid('client_c') || '/cpf.pdf');
select tests.authenticate_as('admin');
select public.admin_review_document((select id from public.provider_documents where storage_path like '%/cpf.pdf'
                                        and provider_id = tests.uid('client_c')), false, 'Ilegível');
select tests.authenticate_as('client_c');
select throws_ok($$select public.submit_provider_for_review()$$, 'P0001', 'documents_missing',
                 'a rejected document does not count for the review');
select tests.authenticate_as('client_d');
select lives_ok($$select public.become_provider('Médico D', 't-medico-d', 't-medico', '555444', 'sp')$$,
                'a regulated occupation is created with its number');
select is((select registry_status::text || '/' || registry_uf || '/' || approved::text from public.provider_occupations
            where provider_id = auth.uid()), 'informed/SP/false', 'the number starts informed and the occupation starts unapproved');

-- ---------------------------------------------------------------- approval per occupation
-- A provider that is already approved adds a regulated occupation: it is not searchable,
-- bookable or on the public page until an admin approves it.
select tests.authenticate_as('provider_e');
select throws_ok($$insert into public.provider_occupations (provider_id, occupation_slug) values (auth.uid(), 't-medico')$$,
                 'P0001', 'registry_required', 'a regulated occupation needs the number on a direct insert');
select tests.authenticate_as('provider_a');
select lives_ok($$insert into public.provider_occupations (provider_id, occupation_slug, registry_number, registry_uf,
                                                           registry_status, approved)
                  values (auth.uid(), 't-medico', '999', 'SP', 'confirmed', true)$$,
                'an approved provider adds a regulated occupation');
select is((select registry_status::text || '/' || approved::text from public.provider_occupations
            where provider_id = auth.uid() and occupation_slug = 't-medico'), 'informed/false',
          'whatever the client sends, the new occupation is informed and not approved');
select throws_ok($$update public.provider_occupations set approved = true where provider_id = auth.uid()
                   and occupation_slug = 't-medico'$$, 'P0001', 'not_allowed', 'a provider cannot approve the own occupation');
select lives_ok($$insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit)
                  values (auth.uid(), 't-medico', 'Consulta online', 30000, 'sessao')$$,
                'the provider prepares a service for the new occupation');
select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-medico') where slug = 't-ana'), 0,
          'an unapproved occupation is not searchable');
select is((select jsonb_agg(o ->> 'slug' order by o ->> 'slug') from jsonb_array_elements(public.get_provider_page('t-ana') -> 'occupations') o),
          '["t-domestica", "t-reparo"]'::jsonb, 'an unapproved occupation is not on the public page');
select is((select count(*)::int from jsonb_array_elements(public.get_provider_page('t-ana') -> 'services') sv
            where sv ->> 'occupation_slug' = 't-medico'), 0, 'nor are its services');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_set_occupation_approval(tests.uid('provider_a'), 't-medico', true)$$,
                 'P0001', 'documents_missing', 'an occupation is approved only with every verification step accepted');
select tests.clear_authentication();
insert into public.provider_documents (provider_id, step, storage_path, status) values
  (tests.uid('provider_a'), 'documento_selfie', tests.uid('provider_a') || '/a.png', 'accepted'),
  (tests.uid('provider_a'), 'registro_profissional', tests.uid('provider_a') || '/crm.pdf', 'accepted');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.admin_set_occupation_approval(auth.uid(), 't-medico', true)$$, 'P0001', 'not_allowed',
                 'a provider cannot call the approval function');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_set_occupation_approval(tests.uid('provider_a'), 't-medico', null)$$, 'P0001', 'not_allowed',
                 'the approval needs an explicit decision');
select is(public.admin_set_occupation_approval(tests.uid('provider_a'), 't-medico', true, 'CRM conferido'), true,
          'admin approves the occupation once the documents are accepted');
select tests.authenticate_anon();
select is((select registry_status::text from public.search_providers('t-medico') where slug = 't-ana'), 'informed',
          'an approved occupation is searchable with its registry status');
select is((select count(*)::int from jsonb_array_elements(public.get_provider_page('t-ana') -> 'services') sv
            where sv ->> 'occupation_slug' = 't-medico'), 1, 'and its services appear on the page');

-- a rejected registry is neither listed nor revived by typing another number
select tests.authenticate_as('admin');
select public.admin_set_registry_status(tests.uid('provider_a'), 't-medico', 'rejected', 'Número não confere');
select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-medico') where slug = 't-ana'), 0,
          'a rejected registry leaves the search');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_set_occupation_approval(tests.uid('provider_a'), 't-medico', true)$$, 'P0001', 'not_allowed',
                 'a rejected registry cannot be approved');
select tests.authenticate_as('provider_a');
select lives_ok($$update public.provider_occupations set registry_number = '111222' where provider_id = auth.uid()
                  and occupation_slug = 't-medico'$$, 'the provider types another number');
select is((select registry_status::text || '/' || approved::text from public.provider_occupations
            where provider_id = auth.uid() and occupation_slug = 't-medico'), 'informed/false',
          'a rejected registry with a new number needs a new approval');
select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-medico') where slug = 't-ana'), 0,
          'the occupation stays out of the search until it is approved again');
select tests.authenticate_as('admin');
select is(public.admin_set_occupation_approval(tests.uid('provider_a'), 't-medico', true), true, 'admin approves again');
select is(public.admin_set_occupation_approval(tests.uid('provider_a'), 't-medico', false, 'Revisão'), false, 'admin withdraws the approval');
select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-medico') where slug = 't-ana'), 0,
          'a withdrawn approval leaves the search');

-- ---------------------------------------------------------------- CRM identity (client_id is server-owned)
select tests.authenticate_as('provider_a');
select lives_ok($$insert into public.provider_clients (provider_id, name, phone) values (auth.uid(), 'Dona Rosa', '5511977770000')$$,
                'a provider adds a CRM entry with the contact data');
select throws_ok(format($$insert into public.provider_clients (provider_id, client_id, name) values (%L, %L, 'Alvo')$$,
                        tests.uid('provider_a'), tests.uid('client_a')),
                 '42501', null, 'a provider cannot point a CRM entry to a platform account');
select throws_ok(format($$insert into public.provider_clients (provider_id, name, origin) values (%L, 'Alvo', 'platform')$$,
                        tests.uid('provider_a')),
                 '42501', null, 'a provider cannot create an entry of origin platform');
select throws_ok(format($$update public.provider_clients set client_id = %L where provider_id = auth.uid()$$, tests.uid('client_a')),
                 '42501', null, 'a provider cannot link an existing entry to a platform account');
select throws_ok($$update public.provider_clients set origin = 'platform' where provider_id = auth.uid()$$,
                 '42501', null, 'a provider cannot change the origin of an entry');
select lives_ok($$update public.provider_clients set name = 'Rosa', notes = 'Ligar antes' where provider_id = auth.uid()$$,
                'the contact data stays editable');
-- second line of defense: the trigger refuses the same writes if a grant is ever widened
select tests.clear_authentication();
grant insert (client_id, origin), update (client_id, origin, provider_id) on public.provider_clients to authenticated;
select tests.authenticate_as('provider_a');
select throws_ok(format($$insert into public.provider_clients (provider_id, client_id, name) values (%L, %L, 'Alvo')$$,
                        tests.uid('provider_a'), tests.uid('client_a')),
                 'P0001', 'not_allowed', 'the trigger refuses client_id even if the column grant is widened');
select throws_ok($$insert into public.provider_clients (provider_id, name, origin) values (auth.uid(), 'Alvo', 'platform')$$,
                 'P0001', 'not_allowed', 'the trigger refuses origin platform even if the column grant is widened');
select throws_ok(format($$update public.provider_clients set client_id = %L where provider_id = auth.uid()$$, tests.uid('client_a')),
                 'P0001', 'not_allowed', 'the trigger refuses an update of client_id');
select tests.clear_authentication();
revoke insert (client_id, origin), update (client_id, origin, provider_id) on public.provider_clients from authenticated;
select is((select client_id from public.provider_clients where name = 'Rosa'), null, 'no entry of provider A points to an account');

-- a quote points only to a CRM entry of its own provider
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon;
insert into ids select 'rosa', id from public.provider_clients where name = 'Rosa';
select tests.authenticate_as('provider_b');
select throws_ok(format($$insert into public.quotes (title, provider_client_id) values ('Orçamento', %L)$$,
                        (select id from ids where name = 'rosa')),
                 '23503', null, 'a provider cannot attach a quote to the CRM entry of another provider');

-- ---------------------------------------------------------------- documents in storage
select tests.authenticate_as('client_a');
select throws_ok(format($$insert into storage.objects (bucket_id, name) values ('provider-documents', %L)$$,
                        tests.uid('client_a') || '/junk.pdf'),
                 '42501', null, 'only providers upload into the private bucket');
select tests.clear_authentication();
insert into storage.objects (bucket_id, name) values
  ('provider-documents', tests.uid('provider_a') || '/accepted.pdf'),
  ('provider-documents', tests.uid('provider_a') || '/submitted.pdf'),
  ('provider-documents', tests.uid('provider_a') || '/loose.pdf'),
  ('provider-documents', tests.uid('provider_a') || '/rejected.pdf');
insert into public.provider_documents (provider_id, step, storage_path, status) values
  (tests.uid('provider_a'), 'cnh', tests.uid('provider_a') || '/accepted.pdf', 'accepted'),
  (tests.uid('provider_a'), 'cnh', tests.uid('provider_a') || '/submitted.pdf', 'submitted'),
  (tests.uid('provider_a'), 'cnh', tests.uid('provider_a') || '/rejected.pdf', 'rejected');
-- direct deletes are allowed for this transaction so the policy (not the Storage API guard) is what is tested
set local storage.allow_delete_query = 'true';
select tests.authenticate_as('provider_a');
update storage.objects set metadata = '{"swapped": true}'::jsonb
 where bucket_id = 'provider-documents' and name = tests.uid('provider_a') || '/accepted.pdf';
select tests.authenticate_as('provider_b');
delete from storage.objects where bucket_id = 'provider-documents' and name like tests.uid('provider_a') || '/%';
select tests.authenticate_as('provider_a');
delete from storage.objects where bucket_id = 'provider-documents' and name like tests.uid('provider_a') || '/%';
select tests.clear_authentication();
select is((select metadata from storage.objects where name = tests.uid('provider_a') || '/accepted.pdf'), null,
          'the owner cannot replace an uploaded document (no update policy)');
select results_eq($$select regexp_replace(name, '^.*/', '') from storage.objects
                     where bucket_id = 'provider-documents' and name like tests.uid('provider_a') || '/%' order by 1$$,
                  array['accepted.pdf', 'rejected.pdf'],
                  'the owner deletes unreviewed and unreferenced files only; another provider deletes nothing');
select tests.authenticate_as('admin');
delete from storage.objects where bucket_id = 'provider-documents' and name = tests.uid('provider_a') || '/rejected.pdf';
select tests.clear_authentication();
select is((select count(*)::int from storage.objects where bucket_id = 'provider-documents'
            and name = tests.uid('provider_a') || '/rejected.pdf'), 0, 'an admin may delete a reviewed file');

-- admin cannot accept a document whose file is missing
select tests.authenticate_as('admin');
select throws_ok(format($$select public.admin_review_document(%L, true)$$,
                        (select id from public.provider_documents where storage_path = tests.uid('provider_a') || '/submitted.pdf')),
                 'P0001', 'not_allowed', 'an admin cannot accept a document that has no file in the bucket');
-- (the file of submitted.pdf was deleted above)

-- ---------------------------------------------------------------- search and public page
select tests.clear_authentication();
do $$
declare
  v_booking uuid;
  v_provider text;
  v_rating int;
  i int;
begin
  -- Davi: three 5-star reviews, Carla: three 4-star reviews, Eva: only two 5-star reviews
  -- (below the threshold of 3, so she does not rank).
  foreach v_provider in array array['provider_d', 'provider_c', 'provider_e'] loop
    v_rating := case v_provider when 'provider_c' then 4 else 5 end;
    for i in 1..(case when v_provider = 'provider_e' then 2 else 3 end) loop
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
select results_eq($$select slug from public.search_providers('t-reparo', null, 2, 1)$$, array['t-carla', 't-ana'],
                  'limit and offset page through the ranking');
select is((select rating_count from public.search_providers('t-reparo') where slug = 't-eva'), 2,
          'fewer than 3 reviews are counted but do not rank (Eva stays below Carla with a 5.0 average)');
select is(public.get_provider_page('t-ana') -> 'provider' ->> 'display_name', 'Ana Teste', 'anon reads the public page');
select is(public.get_provider_page('t-faxina-b'), null, 'a provider not approved has no public page');
select is(jsonb_array_length(public.get_provider_page('t-davi') -> 'reviews'), 3, 'public page shows published reviews');

-- Without rating_ranking the order is a stable daily draw (md5 of the provider and the São Paulo date).
select tests.clear_authentication();
insert into public.provider_occupations (provider_id, occupation_slug, registry_number, registry_uf, approved)
values (tests.uid('provider_e'), 't-medico', '777', 'SP', true);
create temp table expected_draw as
  select po.provider_id, row_number() over (order by md5(po.provider_id::text || (now() at time zone 'America/Sao_Paulo')::date::text), po.provider_id) as rn
    from public.provider_occupations po
    join public.providers p on p.id = po.provider_id and p.status = 'approved'
   where po.occupation_slug = 't-medico' and po.approved and po.registry_status <> 'rejected';
grant select on expected_draw to anon;
select tests.authenticate_anon();
select results_eq($$select provider_id from public.search_providers('t-medico')$$,
                  $$select provider_id from expected_draw order by rn$$,
                  'without rating_ranking the order is the stable daily draw');
select is((select count(*)::int from expected_draw), 2, 'the draw has two providers to order');

-- suspended providers and inactive services
select tests.clear_authentication();
update public.providers set status = 'suspended' where id = tests.uid('provider_c');
insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit, active)
values (tests.uid('provider_d'), 't-reparo', 'Serviço antigo', 500, 'hora', false);
select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-reparo') where slug = 't-carla'), 0,
          'suspended providers are not listed');
select is(public.get_provider_page('t-carla'), null, 'suspended providers have no public page');
select is(jsonb_array_length(public.get_provider_page('t-davi') -> 'services'), 0, 'inactive services are not on the public page');
select is((select price_min_cents from public.search_providers('t-reparo') where slug = 't-davi'), null,
          'and are not used as the price of the search');

-- ---------------------------------------------------------------- slug_available
-- t-ana is approved, t-faxina-b is a draft (never approved), t-carla is suspended
select tests.authenticate_anon();
select is(public.slug_available('t-ana'), false, 'slug_available: the address of an approved page is taken');
select is(public.slug_available('t-faxina-b'), false, 'slug_available: a draft holds its address too');
select is(public.slug_available('t-carla'), false, 'slug_available: a suspended provider keeps the address');
select is(public.slug_available('  T-ANA '), false, 'slug_available: case and spaces do not hide a taken address');
select is(public.slug_available('t-endereco-livre'), true, 'slug_available: a free address');
select is(public.slug_available('Nao Slug'), false, 'slug_available: not a valid address');
select is(public.slug_available(null), false, 'slug_available: null is not available');
select is(public.slug_available(repeat('a', 81)), false, 'slug_available: over 80 characters is not available');
select tests.authenticate_as('client_a');
select is(public.slug_available('t-faxina-b'), false, 'slug_available: also answers a signed-in user, with no owner shown');

select * from finish();
rollback;
