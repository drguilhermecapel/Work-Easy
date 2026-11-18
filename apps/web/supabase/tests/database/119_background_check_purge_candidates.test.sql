-- Background-check purge candidates (migration 20261118400002): the service role lists the withdrawn
-- background-check files that are more than 30 days old and still have a file. Rows withdrawn more
-- recently, never withdrawn, or already purged are not listed. No other role can run the function.
begin;
select plan(6);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

insert into public.provider_documents (provider_id, step, storage_path, status, reviewed_at, deletion_requested_at) values
  (tests.uid('provider_a'), 'antecedentes', tests.uid('provider_a') || '/antecedentes-old.pdf', 'accepted',
   now() - interval '40 days', now() - interval '31 days'),
  (tests.uid('provider_a'), 'antecedentes', tests.uid('provider_a') || '/antecedentes-recent.pdf', 'submitted',
   null, now() - interval '29 days'),
  (tests.uid('provider_a'), 'antecedentes', tests.uid('provider_a') || '/antecedentes-active.pdf', 'submitted',
   null, null),
  (tests.uid('provider_b'), 'antecedentes', tests.uid('provider_b') || '/antecedentes-old.pdf', 'submitted',
   null, now() - interval '31 days'),
  (tests.uid('provider_b'), 'antecedentes', null, 'purged', null, now() - interval '31 days');

create temp table ids (name text primary key, id uuid);
insert into ids select 'old_a', id from public.provider_documents where storage_path = tests.uid('provider_a') || '/antecedentes-old.pdf';
insert into ids select 'old_b', id from public.provider_documents where storage_path = tests.uid('provider_b') || '/antecedentes-old.pdf';

-- The service role lists the candidates; the result is copied to a table the check can read.
create temp table candidates (id uuid primary key);
grant insert on candidates to service_role;
select tests.authenticate_service();
select lives_ok($$insert into candidates select id from public.background_check_purge_candidates()$$,
                'the service role runs the candidates function');
select tests.clear_authentication();

select set_eq($$select id from candidates$$, $$select id from ids where name in ('old_a', 'old_b')$$,
              'only files withdrawn more than 30 days ago and still in storage are candidates');

select tests.authenticate_anon();
select throws_ok($$select * from public.background_check_purge_candidates()$$, '42501', null,
                 'anon cannot list the candidates');
select tests.clear_authentication();

select tests.authenticate_as('provider_a');
select throws_ok($$select * from public.background_check_purge_candidates()$$, '42501', null,
                 'the owner cannot list the candidates');
select throws_ok($$select public.mark_background_check_purged(gen_random_uuid())$$, '42501', null,
                 'the owner cannot mark a purge');
select tests.clear_authentication();

select * from finish();
rollback;
