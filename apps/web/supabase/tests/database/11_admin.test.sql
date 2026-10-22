-- Administration: every admin_* function requires is_admin() and writes audit_log;
-- dashboard views return rows to admins only.
begin;
select plan(95);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- A provider waiting for review with two documents, and a disputed job.
select tests.create_user('provider_new', 'Prestador Novo');
update public.profiles set role = 'provider' where id = tests.uid('provider_new');
insert into public.providers (id, display_name, slug, status) values (tests.uid('provider_new'), 'Novo Teste', 't-novo', 'pending_review');
-- t-reparo asks only for the selfie document; t-medico also asks for the professional registry.
insert into public.provider_occupations (provider_id, occupation_slug, is_primary, registry_number, registry_uf) values
  (tests.uid('provider_new'), 't-reparo', true, null, null),
  (tests.uid('provider_new'), 't-medico', false, '654321', 'SP');
insert into public.provider_documents (provider_id, step, storage_path) values
  (tests.uid('provider_new'), 'documento_selfie', tests.uid('provider_new') || '/selfie.png'),
  (tests.uid('provider_new'), 'cadastro_fiscal', tests.uid('provider_new') || '/cpf.pdf');
-- The files of the first document are in the bucket; the second one has no file.
insert into storage.objects (bucket_id, name) values ('provider-documents', tests.uid('provider_new') || '/selfie.png');
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
-- The views are security invoker: RLS alone would already hide rows from an outsider. These
-- users do read the underlying rows, so only the is_admin() filter of the view stops them.
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.bookings where id = (select id from ids where name = 'dispute')), 1,
          'precondition: client A reads the disputed job through RLS');
select is((select count(*)::int from public.admin_open_disputes), 0, 'a participant gets no rows from admin_open_disputes');
select is((select count(*)::int from public.admin_metrics), 0, 'a participant gets no rows from admin_metrics');
select tests.authenticate_as('provider_c');
select is((select count(*)::int from public.bookings where id = (select id from ids where name = 'dispute')), 1,
          'precondition: provider C reads the disputed job through RLS');
select is((select count(*)::int from public.admin_open_disputes), 0, 'the provider of the dispute gets no rows');
select tests.authenticate_as('provider_new');
select is((select count(*)::int from public.providers where id = auth.uid()), 1, 'precondition: a pending provider reads the own row');
select is((select count(*)::int from public.admin_provider_queue), 0, 'a pending provider does not read the queue');
select throws_ok($$select public.admin_get_payment_raw(gen_random_uuid())$$, 'P0001', 'not_allowed',
                 'admin_get_payment_raw requires an admin');
select tests.authenticate_as('provider_a');
select tests.authenticate_anon();
select throws_ok($$select * from public.admin_metrics$$, '42501', null, 'anon cannot read admin views');
select throws_ok($$select public.admin_set_setting('commission_enabled', 'true')$$, '42501', null,
                 'anon cannot call admin functions');

-- ================================================================ admin
select tests.authenticate_as('admin');
select is((select documents_submitted from public.admin_provider_queue where slug = 't-novo'), 2::bigint,
          'the queue shows the pending provider and the submitted documents');
select throws_ok($$select public.admin_review_document((select id from ids where name = 'doc2'), true)$$,
                 'P0001', 'not_allowed', 'a document whose file is not in the bucket cannot be accepted');
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
select is((select occupations_to_approve from public.admin_provider_queue where slug = 't-novo'), 2::bigint,
          'the queue counts the occupations still to approve');
select is(public.admin_set_provider_status(tests.uid('provider_new'), 'approved', 'Documentos conferidos')::text, 'approved',
          'admin approves the provider');
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_new') and occupation_slug = 't-reparo'), true,
          'the first approval approves an occupation whose policy documents are all accepted');
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_new') and occupation_slug = 't-medico'), false,
          'but not an occupation whose policy documents are missing');
select is((select data -> 'occupations_approved' from public.audit_log
            where action = 'provider.status' and entity_id = tests.uid('provider_new')::text order by id desc limit 1),
          '["t-reparo"]'::jsonb, 'the audit entry lists the occupations the first approval approved');
select is((select occupations_to_approve from public.admin_provider_queue where slug = 't-novo'), 1::bigint,
          'an approved provider with an occupation still to approve stays in the queue');
select throws_ok($$select public.admin_set_occupation_approval(tests.uid('provider_new'), 't-medico', true, 'Teste')$$,
                 'P0001', 'documents_missing', 'that occupation is approved one by one, with its documents');
select is(public.admin_set_registry_status(tests.uid('provider_b'), 't-medico', 'rejected', 'Número não encontrado')::text,
          'rejected', 'admin rejects a registry');
select is(public.admin_set_setting('proposal_limit', '5')::text, '5', 'admin changes a setting');
select throws_ok($$select public.admin_set_setting('commission_bps', '1000000')$$, '23514', 'invalid_setting',
                 'a setting above its range is refused');
select throws_ok($$select public.admin_set_setting('commission_bps', '-1')$$, '23514', 'invalid_setting',
                 'a setting below its range is refused');
select throws_ok($$select public.admin_set_setting('proposal_limit', '2.5')$$, '23514', 'invalid_setting',
                 'a whole-number setting refuses a fraction');
select throws_ok($$select public.admin_set_setting('pro_price_cents', '"49"')$$, '23514', 'invalid_setting',
                 'a number setting refuses text');
select throws_ok($$select public.admin_set_setting('escrow_enabled', '1')$$, '23514', 'invalid_setting',
                 'a money switch is true or false, nothing else');
select is(public.admin_set_setting('labor_lock_days_per_week', '7')::text, '7', 'the limits themselves are accepted');
select is((select value::text from public.platform_settings where key = 'commission_bps'), '1200',
          'a refused value changes nothing');
select is((select count(*)::int from public.admin_open_disputes), 1, 'the dispute is listed');
select throws_ok($$select public.admin_resolve_dispute((select id from ids where name = 'accepted'), 'released', 'x')$$,
                 'P0001', 'invalid_transition', 'only disputed jobs are resolved');
select throws_ok($$select public.admin_resolve_dispute((select id from ids where name = 'dispute'), 'released', ' ')$$,
                 'P0001', 'not_allowed', 'resolving needs a reason');
select is(public.admin_resolve_dispute((select id from ids where name = 'dispute'), 'released', 'Serviço feito')::text,
          'released', 'admin resolves the dispute');
select is((select count(*)::int from public.admin_open_disputes), 0, 'the dispute leaves the list');
select is((select total from public.admin_metrics where entity = 'bookings' and status = 'released'), 1::bigint,
          'admin_metrics counts bookings by status');
select is((select this_month from public.admin_metrics where entity = 'bookings' and status = 'released'), 1::bigint,
          'a row created now is in this month');
select tests.clear_authentication();
update public.bookings set created_at = now() - interval '40 days' where id = (select id from ids where name = 'dispute');
select tests.authenticate_as('admin');
select is((select this_month from public.admin_metrics where entity = 'bookings' and status = 'released'), 0::bigint,
          'an old row is outside this month');
select is((select total from public.admin_metrics where entity = 'bookings' and status = 'released'), 1::bigint,
          'but still in the total');
select is((select this_week from public.admin_metrics where entity = 'bookings' and status = 'released'), 0::bigint,
          'and outside this week');

-- occupations added after the first approval are approved one by one
select tests.authenticate_as('provider_new');
select lives_ok($$insert into public.provider_occupations (provider_id, occupation_slug) values (auth.uid(), 't-domestica')$$,
                'an approved provider adds an occupation');
select tests.authenticate_as('admin');
select is((select occupations_to_approve from public.admin_provider_queue where slug = 't-novo'), 2::bigint,
          'an approved provider with another pending occupation stays in the queue');
select is(public.admin_set_provider_status(tests.uid('provider_new'), 'suspended', 'Denúncia')::text, 'suspended', 'admin suspends it');
select is(public.admin_set_provider_status(tests.uid('provider_new'), 'approved', 'Denúncia improcedente')::text, 'approved',
          'and reinstates it');
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_new') and occupation_slug = 't-domestica'), false,
          'reinstating a provider does not approve what was added after the first review');

select tests.clear_authentication();
select results_eq($$select action, count(*)::int from public.audit_log where actor_id = tests.uid('admin') group by 1 order by 1$$,
                  $$values ('booking.transition', 1), ('dispute.resolved', 1), ('document.accepted', 1), ('document.rejected', 1),
                           ('provider.status', 3), ('registry.status', 1), ('setting.changed', 2)$$,
                  'each admin action is logged exactly once');


-- ================================================================ approval follows the documents
-- provider_new is approved, and so is its t-reparo (policy: selfie); doc1 is the accepted selfie.
select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-reparo') where provider_id = tests.uid('provider_new')), 1,
          'precondition: the approved occupation is searchable');
select is((select count(*)::int from jsonb_array_elements(public.get_provider_page('t-novo') -> 'occupations') o
            where o ->> 'slug' = 't-reparo'), 1, 'precondition: the approved occupation is on the public page');
select tests.authenticate_as('admin');
select is(public.admin_review_document((select id from ids where name = 'doc1'), false, 'Foto trocada')::text, 'rejected',
          'admin undoes the acceptance of the document');
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_new') and occupation_slug = 't-reparo'), false,
          'the occupation that depended on the document loses its approval');
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_new') and occupation_slug = 't-medico'), false,
          'an occupation that was not approved stays as it was');
select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-reparo') where provider_id = tests.uid('provider_new')), 0,
          'the occupation leaves search_providers');
select is((select count(*)::int from jsonb_array_elements(public.get_provider_page('t-novo') -> 'occupations') o
            where o ->> 'slug' = 't-reparo'), 0, 'and the public page');
select tests.clear_authentication();
select is((select count(*)::int from public.audit_log
            where action = 'occupation.approval_revoked' and entity_id = tests.uid('provider_new')::text || ':t-reparo'
              and data ->> 'cause' = 'document_rejected' and data ->> 'step' = 'documento_selfie'
              and actor_id = tests.uid('admin')), 1,
          'the withdrawal is recorded in audit_log with its cause');
select tests.authenticate_as('admin');
select is(public.admin_review_document((select id from ids where name = 'doc1'), true)::text, 'accepted',
          'the document is accepted again');
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_new') and occupation_slug = 't-reparo'), false,
          'accepting again does not bring the approval back by itself');
select is(public.admin_set_occupation_approval(tests.uid('provider_new'), 't-reparo', true, 'Documento conferido de novo'), true,
          'the admin approves the occupation again');

-- another accepted document of the same step keeps the approval; removing the last one takes it
select tests.clear_authentication();
insert into storage.objects (bucket_id, name) values ('provider-documents', tests.uid('provider_new') || '/selfie2.png');
insert into public.provider_documents (provider_id, step, storage_path, status)
values (tests.uid('provider_new'), 'documento_selfie', tests.uid('provider_new') || '/selfie2.png', 'accepted');
select tests.authenticate_as('admin');
select is(public.admin_review_document((select id from ids where name = 'doc1'), false, 'Duplicado')::text, 'rejected',
          'admin rejects one of two accepted documents of the step');
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_new') and occupation_slug = 't-reparo'), true,
          'the approval stays while another accepted document covers the step');
select tests.clear_authentication();
delete from public.provider_documents where storage_path = tests.uid('provider_new') || '/selfie2.png';
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_new') and occupation_slug = 't-reparo'), false,
          'removing the last accepted document takes the approval back');
select is((select count(*)::int from public.audit_log
            where action = 'occupation.approval_revoked' and entity_id = tests.uid('provider_new')::text || ':t-reparo'
              and data ->> 'cause' = 'document_removed'), 1,
          'the removal is recorded with its own cause');

-- ================================================================ no policy, no approval
insert into public.occupations (slug, area_slug, name, synonyms) values ('t-semregra', 't-area', 'Sem política', '{}');
select throws_ok($$insert into public.provider_occupations (provider_id, occupation_slug) values (tests.uid('provider_new'), 't-semregra')$$,
                 'P0001', 'not_allowed', 'an occupation without a policy cannot be added, whoever writes the row');
select tests.authenticate_as('provider_new');
select throws_ok($$insert into public.provider_occupations (provider_id, occupation_slug) values (auth.uid(), 't-semregra')$$,
                 'P0001', 'not_allowed', 'a provider cannot add an occupation without a policy');
select tests.authenticate_as('client_b');
select throws_ok($$select public.become_provider('Sem Regra', 'sem-regra', 't-semregra')$$,
                 'P0001', 'not_allowed', 'become_provider refuses an occupation without a policy');
select is((select count(*)::int from public.providers where slug = 'sem-regra'), 0, 'and creates nothing');
select tests.clear_authentication();
-- A policy that disappears after the occupation was taken (a policy with no steps is the worst
-- case: nothing to check).
insert into public.occupation_policies (occupation_slug, regulated, verification, billing, rating_ranking,
                                        labor_lock, price_units, locations, confidence)
values ('t-semregra', false, '{}', 'so_assinatura', true, false, '{hora}', '{domicilio}', 'conferido');
insert into public.provider_occupations (provider_id, occupation_slug) values (tests.uid('provider_new'), 't-semregra');
select tests.create_user('provider_semregra', 'Prestador Sem Regra');
update public.profiles set role = 'provider' where id = tests.uid('provider_semregra');
insert into public.providers (id, display_name, slug, status)
values (tests.uid('provider_semregra'), 'Sem Regra', 't-sem-regra', 'pending_review');
insert into public.provider_occupations (provider_id, occupation_slug, is_primary)
values (tests.uid('provider_semregra'), 't-semregra', true);
delete from public.occupation_policies where occupation_slug = 't-semregra';
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_set_occupation_approval(tests.uid('provider_new'), 't-semregra', true, 'Teste')$$,
                 'P0001', 'not_allowed', 'an occupation without a policy is not approved');
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_new') and occupation_slug = 't-semregra'), false,
          'and stays unapproved');
select is(public.admin_set_provider_status(tests.uid('provider_semregra'), 'approved', 'Teste')::text, 'approved',
          'the provider can be approved');
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_semregra') and occupation_slug = 't-semregra'), false,
          'but the first approval does not approve the occupation without a policy');
select tests.clear_authentication();
select is((select data -> 'occupations_approved' from public.audit_log
            where action = 'provider.status' and entity_id = tests.uid('provider_semregra')::text order by id desc limit 1),
          '[]'::jsonb, 'and the audit entry lists no occupation');


-- ================================================================ payments that need a person
select tests.clear_authentication();
insert into ids values
  ('pay_b1', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2031-03-05 09:00'), 'canceled')),
  ('pay_b2', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2031-03-06 09:00'), 'canceled')),
  ('pay_b3', tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period('2031-03-07 09:00'), 'canceled'));
insert into ids select 'pay1', tests.make_payment((select id from ids where name = 'pay_b1'), 'received', 12000);
insert into ids select 'pay2', tests.make_payment((select id from ids where name = 'pay_b2'), 'received', 8000);
insert into ids select 'pay3', tests.make_payment((select id from ids where name = 'pay_b3'), 'refunded', 5000);
-- What the webhook writes (service role: actor null, entity 'payments', the payment id as entity_id).
insert into public.audit_log (actor_id, action, entity, entity_id, data)
select null, v.action, 'payments', (select id::text from ids where name = v.pay), v.data::jsonb
  from (values
    ('payment.received_after_cancel', 'pay1', '{"event": "PAYMENT_RECEIVED"}'),
    ('payment.refund_failed', 'pay1', '{"code": "asaas_400"}'),
    ('payment.received_after_cancel', 'pay2', '{"event": "PAYMENT_RECEIVED"}'),
    ('payment.refunded_after_cancel', 'pay2', '{"event": "PAYMENT_RECEIVED"}'),
    ('payment.received_after_cancel', 'pay3', '{"event": "PAYMENT_CONFIRMED"}'),
    ('payment.refund_failed', 'pay3', '{"code": "asaas_500"}')
  ) as v(action, pay, data);

select tests.authenticate_as('client_a');
select is((select count(*)::int from public.admin_payments_attention), 0, 'the payer gets no rows from admin_payments_attention');
select throws_ok($$select public.admin_review_payment((select id from ids where name = 'pay1'), 'Tratado')$$,
                 'P0001', 'not_allowed', 'admin_review_payment requires an admin');
select tests.authenticate_anon();
select throws_ok($$select * from public.admin_payments_attention$$, '42501', null, 'anon cannot read admin_payments_attention');
select tests.authenticate_as('admin');
select results_eq($$select action, payment_id from public.admin_payments_attention order by audit_id$$,
                  $$select v.action, (select id from ids where name = v.pay)
                      from (values ('payment.received_after_cancel', 'pay1'), ('payment.refund_failed', 'pay1'),
                                   ('payment.received_after_cancel', 'pay3'), ('payment.refund_failed', 'pay3')) as v(action, pay)$$,
                  'the list has the open entries and not the ones a refund settled');
select throws_ok($$select public.admin_review_payment((select id from ids where name = 'pay1'), '  ')$$,
                 'P0001', 'not_allowed', 'marking as handled needs a reason');
select throws_ok($$select public.admin_review_payment(gen_random_uuid(), 'Tratado')$$,
                 'P0001', 'not_allowed', 'an unknown payment is refused');
select throws_ok($$select public.admin_review_payment((select id from ids where name = 'pay2'), 'Tratado')$$,
                 'P0001', 'invalid_transition', 'a payment with nothing waiting is refused');
select is(public.admin_review_payment((select id from ids where name = 'pay1'), '  Reembolso feito no painel do Asaas '), true,
          'admin marks a payment as handled');
select is((select count(*)::int from public.admin_payments_attention where payment_id = (select id from ids where name = 'pay1')), 0,
          'the payment leaves the list');
select is((select count(*)::int from public.admin_payments_attention where payment_id = (select id from ids where name = 'pay3')), 2,
          'the others stay');
select throws_ok($$select public.admin_review_payment((select id from ids where name = 'pay1'), 'De novo')$$,
                 'P0001', 'invalid_transition', 'it cannot be handled twice');
select tests.clear_authentication();
select is((select data ->> 'reason' from public.audit_log
            where action = 'payment.reviewed' and entity = 'payments' and entity_id = (select id::text from ids where name = 'pay1')
              and actor_id = tests.uid('admin')),
          'Reembolso feito no painel do Asaas', 'the audit entry keeps the trimmed reason and the administrator');
-- a new failure after the review is open again
insert into public.audit_log (actor_id, action, entity, entity_id, data)
values (null, 'payment.refund_failed', 'payments', (select id::text from ids where name = 'pay1'), '{"code": "asaas_400"}');
select tests.authenticate_as('admin');
select is((select count(*)::int from public.admin_payments_attention where payment_id = (select id from ids where name = 'pay1')), 1,
          'a failure after the review is listed again');

select * from finish();
rollback;
