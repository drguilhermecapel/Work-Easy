-- Admin reads of provider documents (migration 20261109100004): an admin who asks for the link
-- of a document leaves one audit entry, written before the link is returned; a refused request
-- leaves none, and nobody else can ask for the entry.
begin;
select plan(11);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

insert into public.provider_documents (provider_id, step, storage_path)
values (tests.uid('provider_a'), 'documento_selfie', tests.uid('provider_a') || '/selfie-view-test.png');
insert into ids select 'doc', id from public.provider_documents where storage_path like '%/selfie-view-test.png';

select has_function('public', 'admin_log_document_view', array['text'], 'the admin RPC that records a document view exists');

-- a provider cannot record (or obtain) a view
select tests.authenticate_as('provider_a');
select throws_ok($$select public.admin_log_document_view(tests.uid('provider_a') || '/selfie-view-test.png')$$,
                 'P0001', 'not_allowed', 'only an admin can record a document view');
select tests.clear_authentication();
select is((select count(*)::int from public.audit_log where action = 'document.viewed'), 0,
          'the refused request leaves no audit entry');

-- an admin records the view
select tests.authenticate_as('admin');
select lives_ok($$select public.admin_log_document_view(tests.uid('provider_a') || '/selfie-view-test.png')$$,
                'an admin records the view of a document');
select tests.clear_authentication();
select is((select count(*)::int from public.audit_log
            where action = 'document.viewed' and entity = 'provider_document' and entity_id = (select id from ids where name = 'doc')::text), 1,
          'the view leaves exactly one audit entry for the document');
select is((select actor_id from public.audit_log where action = 'document.viewed' and entity_id = (select id from ids where name = 'doc')::text),
          tests.uid('admin'), 'the entry names the admin who asked');
select is((select data ->> 'step' from public.audit_log where action = 'document.viewed' and entity_id = (select id from ids where name = 'doc')::text),
          'documento_selfie', 'the entry names the kind of document');

-- an unknown path is refused and records nothing
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_log_document_view('no-such-owner/file.pdf')$$, 'P0001', 'not_allowed',
                 'a path that is not a document is refused');
select tests.clear_authentication();
select is((select count(*)::int from public.audit_log where action = 'document.viewed'), 1,
          'the refused path leaves no entry');

select tests.authenticate_anon();
select throws_ok($$select public.admin_log_document_view('x/y.pdf')$$, '42501', null, 'anon cannot call the RPC');
select tests.clear_authentication();

select * from finish();
rollback;
