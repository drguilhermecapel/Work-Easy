-- Marking a purged background-check file (migration 20261118400002): a row with review or audit
-- history stays, without its file, with status 'purged'; a row without history is deleted. The
-- row is refused while its object is still in the bucket or when it was never withdrawn.
begin;
select plan(14);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

insert into public.provider_documents (provider_id, step, storage_path, status, reviewed_at, deletion_requested_at) values
  (tests.uid('provider_a'), 'antecedentes', tests.uid('provider_a') || '/reviewed.pdf', 'accepted',
   now() - interval '40 days', now() - interval '31 days'),
  (tests.uid('provider_a'), 'antecedentes', tests.uid('provider_a') || '/audited.pdf', 'submitted',
   null, now() - interval '31 days'),
  (tests.uid('provider_a'), 'antecedentes', tests.uid('provider_a') || '/removed.pdf', 'submitted',
   null, now() - interval '31 days'),
  (tests.uid('provider_b'), 'antecedentes', tests.uid('provider_b') || '/in-bucket.pdf', 'submitted',
   null, now() - interval '31 days'),
  (tests.uid('provider_b'), 'antecedentes', tests.uid('provider_b') || '/not-withdrawn.pdf', 'submitted',
   null, null);

create temp table ids (name text primary key, id uuid);
insert into ids select 'reviewed', id from public.provider_documents where storage_path like '%/reviewed.pdf';
insert into ids select 'audited', id from public.provider_documents where storage_path like '%/audited.pdf';
insert into ids select 'removed', id from public.provider_documents where storage_path like '%/removed.pdf';
insert into ids select 'in_bucket', id from public.provider_documents where storage_path like '%/in-bucket.pdf';
insert into ids select 'not_withdrawn', id from public.provider_documents where storage_path like '%/not-withdrawn.pdf';

-- The audit history of the second row; the first row has review history instead.
insert into public.audit_log (actor_id, action, entity, entity_id, data)
  values (null, 'document.viewed', 'provider_document', (select id::text from ids where name = 'audited'), '{}'::jsonb);

-- The object of the third row is still in the bucket: its purge is refused.
insert into storage.objects (bucket_id, name) values ('provider-documents', tests.uid('provider_b') || '/in-bucket.pdf');

grant select on ids to service_role;
select tests.authenticate_service();
select lives_ok($$select public.mark_background_check_purged((select id from ids where name = 'reviewed'))$$,
                'a reviewed file is marked: the call succeeds');
select lives_ok($$select public.mark_background_check_purged((select id from ids where name = 'audited'))$$,
                'a file with audit history is marked: the call succeeds');
select lives_ok($$select public.mark_background_check_purged((select id from ids where name = 'removed'))$$,
                'a file without history is marked: the call succeeds');
select throws_ok($$select public.mark_background_check_purged((select id from ids where name = 'in_bucket'))$$,
                 'P0001', 'not_allowed', 'a row is refused while its object is still in the bucket');
select throws_ok($$select public.mark_background_check_purged((select id from ids where name = 'not_withdrawn'))$$,
                 'P0001', 'not_allowed', 'a file that was never withdrawn is refused');
select lives_ok($$select public.mark_background_check_purged((select id from ids where name = 'reviewed'))$$,
                'marking a row that is already purged does nothing');
select tests.clear_authentication();

select is((select status::text from public.provider_documents where id = (select id from ids where name = 'reviewed')), 'purged',
          'a reviewed row stays with status purged');
select is((select storage_path from public.provider_documents where id = (select id from ids where name = 'reviewed')), null,
          'the reviewed row keeps no storage path');
select is((select status::text from public.provider_documents where id = (select id from ids where name = 'audited')), 'purged',
          'a row with audit history stays with status purged');
select ok(not exists (select 1 from public.provider_documents where id = (select id from ids where name = 'removed')),
          'a row without history is deleted');
select is((select storage_path from public.provider_documents where id = (select id from ids where name = 'in_bucket')),
          tests.uid('provider_b') || '/in-bucket.pdf', 'a refused row keeps its storage path');
select is((select data->>'kept' from public.audit_log
            where action = 'document.purged' and entity_id = (select id::text from ids where name = 'audited')), 'true',
          'the purge of a row with history is recorded as kept');
select throws_ok($$insert into public.provider_documents (provider_id, step, storage_path, status)
                    values (tests.uid('provider_a'), 'antecedentes', null, 'submitted')$$, '23514', null,
                 'a row without a file must have status purged');

select * from finish();
rollback;
