-- A rejected registry takes the occupation's approval with it: the occupation leaves the
-- search, confirming the registry again does not bring it back, and only an administrator's
-- new approval offers it again. Confirming a registry keeps the approval.
begin;
select plan(13);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- The accepted documents that the approval of t-medico needs (inserted by the test session).
insert into public.provider_documents (provider_id, step, storage_path, status) values
  (tests.uid('provider_b'), 'documento_selfie', tests.uid('provider_b') || '/selfie.png', 'accepted'),
  (tests.uid('provider_b'), 'registro_profissional', tests.uid('provider_b') || '/crm.pdf', 'accepted');

select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-medico') where slug = 't-bruno'), 1,
          'the approved occupation is offered');

-- Confirming the registry keeps the approval.
select tests.authenticate_as('admin');
select is(public.admin_set_registry_status(tests.uid('provider_b'), 't-medico', 'confirmed', 'CRM conferido')::text, 'confirmed',
          'admin confirms the registry');
select tests.clear_authentication();
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'), true,
          'confirming a registry keeps the approval');

-- Rejecting it takes the approval away, and the occupation leaves the search.
select tests.authenticate_as('admin');
select is(public.admin_set_registry_status(tests.uid('provider_b'), 't-medico', 'rejected', 'Número não confere')::text, 'rejected',
          'admin rejects the registry');
select tests.clear_authentication();
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'), false,
          'rejecting a registry takes its approval away');
select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-medico') where slug = 't-bruno'), 0,
          'a rejected registry leaves the search');

-- Confirming it again does not restore the approval.
select tests.authenticate_as('admin');
select is(public.admin_set_registry_status(tests.uid('provider_b'), 't-medico', 'confirmed', 'Número conferido')::text, 'confirmed',
          'admin confirms the rejected registry again');
select tests.clear_authentication();
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'), false,
          'confirming the registry again does not restore the approval');
select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-medico') where slug = 't-bruno'), 0,
          'the occupation stays out of the search until an administrator approves it again');

-- An administrator approves it again: it is offered again.
select tests.authenticate_as('admin');
select is(public.admin_set_occupation_approval(tests.uid('provider_b'), 't-medico', true, 'Conferido novamente'), true,
          'admin approves the occupation again');
select tests.authenticate_anon();
select is((select count(*)::int from public.search_providers('t-medico') where slug = 't-bruno'), 1,
          'and it is offered again');

-- A direct write cannot leave an approval standing on a rejected registry.
select tests.clear_authentication();
update public.provider_occupations set approved = true, registry_status = 'rejected'
 where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico';
select is((select approved from public.provider_occupations
            where provider_id = tests.uid('provider_b') and occupation_slug = 't-medico'), false,
          'a direct write cannot leave an approval on a rejected registry');

select * from finish();
rollback;
