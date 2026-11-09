-- Contact sharing follows the status of the job on both sides. A request nobody accepted yet and a
-- canceled job release nothing to the counterpart; from acceptance on, the name and the phone are shared.
begin;
select plan(8);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- One job per case, each with its own provider, so every check sees a single booking.
select tests.make_booking('provider_d', 'client_b', 't-reparo', tests.sp_period(tests.at(30, 0, '09:00')), 'requested');
select tests.make_booking('provider_e', 'client_b', 't-reparo', tests.sp_period(tests.at(31, 0, '09:00')), 'canceled');
select tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(32, 0, '09:00')), 'accepted');
select tests.make_booking('provider_a', 'client_a', 't-reparo', tests.sp_period(tests.at(33, 0, '09:00')), 'completed');

-- The provider side: a request nobody accepted and a canceled job show no contact.
select tests.authenticate_as('provider_d');
select is((select count(*)::int from public.profiles where id = tests.uid('client_b')), 0,
          'a provider does not see the client of a request nobody accepted');
select tests.authenticate_as('provider_e');
select is((select count(*)::int from public.profiles where id = tests.uid('client_b')), 0,
          'a provider does not see the client of a canceled job');

-- From acceptance on, the provider sees the client.
select tests.authenticate_as('provider_c');
select is((select count(*)::int from public.profiles where id = tests.uid('client_a')), 1,
          'a provider sees the client of an accepted job');
select tests.authenticate_as('provider_a');
select is((select count(*)::int from public.profiles where id = tests.uid('client_a')), 1,
          'and of a completed job');

-- The client side keeps the same rule.
select tests.authenticate_as('client_b');
select is((select count(*)::int from public.profiles where id = tests.uid('provider_d')), 0,
          'a client does not see the provider of a request nobody accepted');
select is((select count(*)::int from public.profiles where id = tests.uid('provider_e')), 0,
          'a client does not see the provider of a canceled job');
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.profiles where id = tests.uid('provider_c')), 1,
          'a client sees the provider of an accepted job');
select tests.clear_authentication();

select * from finish();
rollback;
