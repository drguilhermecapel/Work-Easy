-- A provider is told of a new direct booking request (the client is not).
begin;
select plan(4);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

insert into public.availability (provider_id, weekday, start_time, end_time)
values (tests.uid('provider_c'), 1, '08:00', '18:00');
insert into public.services (id, provider_id, occupation_slug, title, price_min_cents, unit, duration_minutes, active)
values (md5('s74-svc')::uuid, tests.uid('provider_c'), 't-reparo', 'Reparo de teste', 5000, 'hora', 60, true);

select tests.authenticate_as('client_a');
select lives_ok($$select public.book_direct(tests.uid('provider_c'), md5('s74-svc')::uuid, tests.sp_period(tests.at(4, 0, '10:00'), 1))$$,
                'a client requests a slot');
select tests.clear_authentication();
select is((select count(*)::int from public.notifications
            where user_id = tests.uid('provider_c') and template = 'agendamento_solicitado'), 1,
          'the provider is told of the new request');
select is((select count(*)::int from public.notifications
            where user_id = tests.uid('client_a') and template = 'agendamento_solicitado'), 0,
          'the client is not told');

select * from finish();
rollback;
