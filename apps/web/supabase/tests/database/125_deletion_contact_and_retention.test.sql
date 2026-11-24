-- Privacy and retention fixes (migration 20261118600002). (a) Anonymizing a family clears the free text of
-- its shifts and daily reports, and nothing of another family. (b) A shift the family canceled releases no
-- contact to its caregiver, and the family sees no caregiver of it; an assigned shift still does. (c) The
-- retention purge removes assistant usage events older than one day and keeps the recent ones.
begin;
select plan(22);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- ================================================================ (a) free text of the family's shifts and reports
insert into public.households (owner_id, name) values
  (tests.uid('client_a'), 'Casa da família A'),
  (tests.uid('client_b'), 'Casa da família B');
insert into public.shifts (id, household_id, period, rate_cents, status, provider_id, notes) values
  (md5('notes-a-assigned')::uuid, (select id from public.households where owner_id = tests.uid('client_a')),
     tests.sp_period(tests.at(120, 0, '08:00'), 4), 100, 'assigned', tests.uid('provider_c'), 'Nota do plantão A'),
  (md5('notes-a-done')::uuid, (select id from public.households where owner_id = tests.uid('client_a')),
     tstzrange(now() - interval '10 days', now() - interval '10 days' + interval '4 hours'), 100, 'completed',
     tests.uid('provider_c'), 'Nota antiga A'),
  (md5('notes-b-assigned')::uuid, (select id from public.households where owner_id = tests.uid('client_b')),
     tests.sp_period(tests.at(120, 0, '08:00'), 4), 100, 'assigned', tests.uid('provider_e'), 'Nota do plantão B');
insert into public.daily_reports (shift_id, provider_id, meals, activities, mood, notes) values
  (md5('notes-a-assigned')::uuid, tests.uid('provider_c'), 'Almoço A', 'Caminhada A', 'Calma', 'Relato A'),
  (md5('notes-a-done')::uuid, tests.uid('provider_c'), 'Jantar A', 'Leitura A', 'Animada', 'Relato antigo A'),
  (md5('notes-b-assigned')::uuid, tests.uid('provider_e'), 'Almoço B', 'Caminhada B', 'Calma', 'Relato B');

select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$,
                'service role anonymizes the family account with notes and daily reports on its shifts');
select tests.clear_authentication();

select is((select notes from public.shifts where id = md5('notes-a-assigned')::uuid), null,
          'the notes of an assigned shift of the anonymized family are cleared');
select is((select notes from public.shifts where id = md5('notes-a-done')::uuid), null,
          'and the notes of a completed shift of that family');
select ok(
  (select meals is null and activities is null and mood is null and notes is null
     from public.daily_reports where shift_id = md5('notes-a-assigned')::uuid),
  'the daily report of that shift loses its meals, activities, mood and notes');
select ok(
  (select meals is null and activities is null and mood is null and notes is null
     from public.daily_reports where shift_id = md5('notes-a-done')::uuid),
  'and so does the daily report of the completed shift');
select is((select count(*)::int from public.shifts where household_id = (select id from public.households where owner_id = tests.uid('client_a'))), 2,
          'the shifts of the family stay; only their free text goes');
select is((select notes from public.shifts where id = md5('notes-b-assigned')::uuid), 'Nota do plantão B',
          'the notes of a shift of another family stay');
select ok(
  (select meals = 'Almoço B' and activities = 'Caminhada B' and mood = 'Calma' and notes = 'Relato B'
     from public.daily_reports where shift_id = md5('notes-b-assigned')::uuid),
  'and the daily report of that shift of another family stays');

-- ================================================================ (b) contact of a shift the family canceled
-- Canceled by the family (status canceled, provider kept on the row): it releases nothing.
insert into public.shifts (id, household_id, period, rate_cents, status, provider_id) values
  (md5('canceled-b')::uuid, (select id from public.households where owner_id = tests.uid('client_b')),
     tests.sp_period(tests.at(121, 0, '08:00'), 4), 100, 'canceled', tests.uid('provider_d'));

select tests.authenticate_as('client_b');
select is(private.shares_contact(tests.uid('provider_d')), false,
          'the family sees no contact of a caregiver whose only shift it canceled');
select is(private.is_counterpart(tests.uid('provider_d')), false,
          'and no provider row of that caregiver');
select is(private.shares_contact(tests.uid('provider_e')), true,
          'an assigned shift still shares the contact of its caregiver');
select is(private.is_counterpart(tests.uid('provider_e')), true,
          'and the provider row of that caregiver');
select tests.clear_authentication();

select tests.authenticate_as('provider_d');
select is(private.shares_contact(tests.uid('client_b')), false,
          'the caregiver of the canceled shift sees no contact of the family');
select is(private.is_counterpart(tests.uid('client_b')), false,
          'and no row of the family');
select tests.clear_authentication();

select tests.authenticate_as('provider_e');
select is(private.shares_contact(tests.uid('client_b')), true,
          'the caregiver of the assigned shift sees the contact of the family');
select is(private.is_counterpart(tests.uid('client_b')), true,
          'and the row of the family');
select tests.clear_authentication();

-- ================================================================ (c) assistant usage events
insert into public.assist_usage_events (user_id, used_at) values
  (tests.uid('provider_a'), now() - interval '25 hours'),
  (tests.uid('provider_a'), now() - interval '23 hours'),
  (tests.uid('provider_a'), now() - interval '2 hours');

select lives_ok('select public.run_retention_purge()',
                'the retention purge runs while usage events of several ages are present');
select is((select count(*)::int from public.assist_usage_events
            where user_id = tests.uid('provider_a') and used_at < now() - interval '1 day'), 0,
          'usage events older than one day are removed');
select is((select count(*)::int from public.assist_usage_events where user_id = tests.uid('provider_a')), 2,
          'usage events of the last day stay');

-- ================================================================ redefined functions keep their contract
select ok(
  (select bool_and(p.prosecdef and p.proconfig && array['search_path=""'])
     from pg_proc p
    where p.oid in ('public.anonymize_user(uuid)'::regprocedure, 'private.shares_contact(uuid)'::regprocedure,
                    'private.is_counterpart(uuid)'::regprocedure, 'public.run_retention_purge()'::regprocedure)),
  'the four redefined functions stay security definer with an empty search_path'
);
select ok(
  (select p.provolatile = 's' from pg_proc p where p.oid = 'private.shares_contact(uuid)'::regprocedure)
  and (select p.provolatile = 's' from pg_proc p where p.oid = 'private.is_counterpart(uuid)'::regprocedure),
  'the two contact helpers stay stable'
);

select * from finish();
rollback;
