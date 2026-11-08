-- A client cannot change the description of a request that a provider has answered with a proposal.
begin;
select plan(4);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

insert into public.requests (id, client_id, occupation_slug, neighborhood_id, description) values
  (md5('s72-open')::uuid, tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Trocar a torneira da cozinha'),
  (md5('s72-sent')::uuid, tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Trocar a torneira do banheiro');
insert into public.proposals (request_id, provider_id, price_cents, status) values
  (md5('s72-sent')::uuid, tests.uid('provider_c'), 20000, 'sent');

select tests.authenticate_as('client_a');
select lives_ok($$update public.requests set description = 'Trocar a torneira da cozinha e do filtro' where id = md5('s72-open')::uuid$$,
                'a request without proposals can still be edited');
select throws_ok($$update public.requests set description = 'Trocar a torneira do lavabo' where id = md5('s72-sent')::uuid$$,
                 'P0001', 'invalid_transition', 'a request with a sent proposal cannot change its description');
select is((select description from public.requests where id = md5('s72-sent')::uuid), 'Trocar a torneira do banheiro',
          'the description the provider answered is kept');

select * from finish();
rollback;
