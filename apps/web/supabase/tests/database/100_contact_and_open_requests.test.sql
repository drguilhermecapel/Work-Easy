-- Contact sharing follows the status of the job on both sides. A request nobody accepted yet and a
-- canceled job release nothing to the counterpart; from acceptance on, the name and the phone are shared.
-- A client has at most five open requests at a time (open and not expired yet).
begin;
select plan(15);
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

-- Open requests: five at a time per client. client_a has none open in this fixture.
select lives_ok($$insert into public.requests (occupation_slug, neighborhood_id, description)
                  select 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido aberto número ' || g
                    from generate_series(1, 5) as g$$,
                'a client can keep five open requests');
select throws_ok($$insert into public.requests (occupation_slug, neighborhood_id, description)
                   values ('t-reparo', tests.neighborhood('t-bairro-1'), 'Sexto pedido aberto')$$,
                 'P0001', 'request_limit', 'a sixth open request is refused');
select throws_ok($$insert into public.requests (occupation_slug, neighborhood_id, description)
                   select 't-reparo', tests.neighborhood('t-bairro-1'), 'Lote acima do limite ' || g
                     from generate_series(1, 2) as g$$,
                 'P0001', 'request_limit', 'a bulk insert over the limit is refused as a whole');
select lives_ok($$update public.requests set status = 'canceled' where description = 'Pedido aberto número 1'$$,
                'the client cancels one of them');
select lives_ok($$insert into public.requests (occupation_slug, neighborhood_id, description)
                   values ('t-reparo', tests.neighborhood('t-bairro-1'), 'Pedido depois do cancelamento')$$,
                'a canceled request frees a place');

-- Expired requests do not count: client_b has three expired and four valid open requests.
select tests.clear_authentication();
insert into public.requests (client_id, occupation_slug, neighborhood_id, description, expires_at)
select tests.uid('client_b'), 't-reparo', tests.neighborhood('t-bairro-2'), 'Pedido vencido ' || g, now() - interval '1 day'
  from generate_series(1, 3) as g;
insert into public.requests (client_id, occupation_slug, neighborhood_id, description)
select tests.uid('client_b'), 't-reparo', tests.neighborhood('t-bairro-2'), 'Pedido válido ' || g
  from generate_series(1, 4) as g;

select tests.authenticate_as('client_b');
select lives_ok($$insert into public.requests (occupation_slug, neighborhood_id, description)
                   values ('t-reparo', tests.neighborhood('t-bairro-2'), 'Quinto pedido válido')$$,
                'expired requests do not take places: the fifth valid one is accepted');
select throws_ok($$insert into public.requests (occupation_slug, neighborhood_id, description)
                   values ('t-reparo', tests.neighborhood('t-bairro-2'), 'Sexto pedido válido')$$,
                 'P0001', 'request_limit', 'and the sixth valid one is refused');
select tests.clear_authentication();

select * from finish();
rollback;
