-- Administration: every admin_* function requires is_admin() and writes audit_log;
-- dashboard views return rows to admins only.
begin;
select plan(27);
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- A provider waiting for review with two documents, and a disputed job.
select tests.create_user('provider_new', 'Prestador Novo');
update public.profiles set role = 'provider' where id = tests.uid('provider_new');
insert into public.providers (id, display_name, slug, status) values (tests.uid('provider_new'), 'Novo Teste', 't-novo', 'pending_review');
insert into public.provider_occupations (provider_id, occupation_slug, is_primary) values (tests.uid('provider_new'), 't-reparo', true);
insert into public.provider_documents (provider_id, step, storage_path) values
  (tests.uid('provider_new'), 'documento_selfie', tests.uid('provider_new') || '/selfie.png'),
  (tests.uid('provider_new'), 'cadastro_fiscal', tests.uid('provider_new') || '/cpf.pdf');
insert into ids select 'doc1', id from public.provider_documents where storage_path like '%/selfie.png';
insert into ids select 'doc2', id from public.provider_documents where storage_path like '%/cpf.pdf';
insert into ids values
  ('dispute', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2029-03-05 09:00'), 'disputed')),
  ('accepted', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2030-03-05 09:00'), 'accepted'));

-- ================================================================ non-admins
select tests.authenticate_as('provider_a');
select throws_ok($$select public.admin_review_document((select id from ids where name = 'doc1'), true)$$,
                 'P0001', 'not_allowed', 'admin_review_document requires an admin');
select throws_ok($$select public.admin_set_registry_status(tests.uid('provider_b'), 't-medico', 'confirmed')$$,
                 'P0001', 'not_allowed', 'admin_set_registry_status requires an admin');
select throws_ok($$select public.admin_set_provider_status(auth.uid(), 'approved')$$,
                 'P0001', 'not_allowed', 'admin_set_provider_status requires an admin');
select throws_ok($$select public.admin_set_setting('commission_enabled', 'true')$$,
                 'P0001', 'not_allowed', 'admin_set_setting requires an admin');
select throws_ok($$select public.admin_resolve_dispute((select id from ids where name = 'dispute'), 'released', 'x')$$,
                 'P0001', 'not_allowed', 'admin_resolve_dispute requires an admin');
select is((select count(*)::int from public.admin_provider_queue), 0, 'non-admins get no rows from admin_provider_queue');
select is((select count(*)::int from public.admin_open_disputes), 0, 'non-admins get no rows from admin_open_disputes');
select is((select count(*)::int from public.admin_metrics), 0, 'non-admins get no rows from admin_metrics');
select tests.authenticate_anon();
select throws_ok($$select * from public.admin_metrics$$, '42501', null, 'anon cannot read admin views');
select throws_ok($$select public.admin_set_setting('commission_enabled', 'true')$$, '42501', null,
                 'anon cannot call admin functions');

-- ================================================================ admin
select tests.authenticate_as('admin');
select is((select documents_submitted from public.admin_provider_queue where slug = 't-novo'), 2::bigint,
          'the queue shows the pending provider and the submitted documents');
select is(public.admin_review_document((select id from ids where name = 'doc1'), true)::text, 'accepted',
          'admin accepts a document');
select throws_ok($$select public.admin_review_document((select id from ids where name = 'doc2'), false)$$,
                 'P0001', 'not_allowed', 'rejecting needs a reason');
select is(public.admin_review_document((select id from ids where name = 'doc2'), false, 'Ilegível')::text, 'rejected',
          'admin rejects a document with a reason');
select is((select rejection_reason from public.provider_documents where id = (select id from ids where name = 'doc2')),
          'Ilegível', 'the rejection reason is stored');
select is((select reviewed_by from public.provider_documents where id = (select id from ids where name = 'doc1')),
          tests.uid('admin'), 'the reviewer is recorded');
select is(public.admin_set_provider_status(tests.uid('provider_new'), 'approved', 'Documentos conferidos')::text, 'approved',
          'admin approves the provider');
select is(public.admin_set_registry_status(tests.uid('provider_b'), 't-medico', 'rejected', 'Número não encontrado')::text,
          'rejected', 'admin rejects a registry');
select is(public.admin_set_setting('proposal_limit', '5')::text, '5', 'admin changes a setting');
select is((select count(*)::int from public.admin_open_disputes), 1, 'the dispute is listed');
select throws_ok($$select public.admin_resolve_dispute((select id from ids where name = 'accepted'), 'released', 'x')$$,
                 'P0001', 'invalid_transition', 'only disputed jobs are resolved');
select throws_ok($$select public.admin_resolve_dispute((select id from ids where name = 'dispute'), 'released', ' ')$$,
                 'P0001', 'not_allowed', 'resolving needs a reason');
select is(public.admin_resolve_dispute((select id from ids where name = 'dispute'), 'released', 'Serviço feito')::text,
          'released', 'admin resolves the dispute');
select is((select count(*)::int from public.admin_open_disputes), 0, 'the dispute leaves the list');
select ok((select total from public.admin_metrics where entity = 'bookings' and status = 'released') >= 1,
          'admin_metrics counts bookings by status');
select ok((select this_month from public.admin_metrics where entity = 'providers' and status = 'approved') >= 1,
          'admin_metrics counts in the current month');

select tests.clear_authentication();
select is((select count(*)::int from public.audit_log
            where actor_id = tests.uid('admin')
              and action in ('document.accepted', 'document.rejected', 'provider.status', 'registry.status',
                             'setting.changed', 'dispute.resolved')), 6,
          'every admin action is in the audit log');

select * from finish();
rollback;
