-- Identity: profile trigger, profile RLS by role, protected columns, admins, become_provider.
begin;
select plan(37);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();
create temp table expected_profiles as select count(*)::int as n from auth.users;
grant select on expected_profiles to authenticated;

-- Trigger on auth.users
select is((select role::text from public.profiles where id = tests.uid('client_a')), 'client',
          'sign-up creates a client profile');
select is((select full_name from public.profiles where id = tests.uid('client_a')), 'Cliente A',
          'profile takes the name from user metadata');
select is((select phone from public.profiles where id = tests.uid('client_a')), '5511900000001',
          'profile takes the phone from auth.users');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'sneaky@test.local', '{"full_name": "Sneaky", "role": "provider", "phone": "5511999990000"}', now(), now());
select is((select role::text from public.profiles where id = tests.uid('sneaky')), 'client',
          'metadata cannot choose the role at sign-up');
select is((select phone from public.profiles where id = tests.uid('sneaky')), null,
          'a phone typed in the sign-up metadata is not copied to the profile (it is unverified)');

-- anon
select tests.authenticate_anon();
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon cannot read profiles');
select throws_ok($$select * from public.admins$$, '42501', null, 'anon cannot read admins');
select is(public.is_admin(), false, 'anon is not admin');

-- client A
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.profiles), 1, 'client A reads only the own profile');
select is((select count(*)::int from public.profiles where id = tests.uid('client_b')), 0,
          'client A cannot read client B');
select lives_ok($$update public.profiles set full_name = 'Nome Novo', city = 'Osasco' where id = auth.uid()$$,
                'client A updates name and city');
select is((select full_name from public.profiles where id = auth.uid()), 'Nome Novo', 'name was updated');
update public.profiles set full_name = 'Invadido' where id = tests.uid('client_b');
select throws_ok($$update public.profiles set role = 'provider' where id = auth.uid()$$, 'P0001', 'not_allowed',
                 'a user cannot change the own role');
select throws_ok($$update public.profiles set deleted_at = now() where id = auth.uid()$$, 'P0001', 'not_allowed',
                 'a user cannot set deleted_at');
select throws_ok($$update public.profiles set id = gen_random_uuid() where id = auth.uid()$$, 'P0001', 'not_allowed',
                 'a user cannot change the profile id');
select throws_ok($$insert into public.admins (user_id) values (auth.uid())$$, '42501', null,
                 'a user cannot become admin');
select throws_ok($$delete from public.profiles where id = auth.uid()$$, '42501', null,
                 'a user cannot delete the profile through the API');
select is(public.is_admin(), false, 'client A is not admin');

-- client B
select tests.authenticate_as('client_b');
select is((select count(*)::int from public.profiles where id = tests.uid('client_a')), 0,
          'client B cannot read client A');

-- become_provider
select throws_ok($$select public.become_provider('Médica B', 't-medica-b', 't-medico')$$, 'P0001', 'registry_required',
                 'regulated occupation requires the registry number');
select lives_ok($$select public.become_provider('Faxina B', 't-faxina-b', 't-domestica')$$,
                'client B becomes a provider');
select is((select role::text from public.profiles where id = auth.uid()), 'provider',
          'become_provider changes the role');
select is((select status::text from public.providers where id = auth.uid()), 'draft', 'new provider starts as draft');
select throws_ok($$select public.become_provider('Outro', 't-outro', 't-reparo')$$, 'P0001', 'not_allowed',
                 'become_provider runs once per user');

-- admin
select tests.authenticate_as('admin');
select is(public.is_admin(), true, 'admin is admin');
select is((select count(*)::int from public.profiles), (select n + 1 from expected_profiles),
          'admin reads every profile (the fixture users plus the sign-up above)');
select throws_ok($$insert into public.admins (user_id) values (tests.uid('client_b'))$$, '42501', null,
                 'admins are written by the service role only');

select tests.clear_authentication();
select is((select full_name from public.profiles where id = tests.uid('client_b')), 'Cliente B',
          'client A could not rename client B');

-- is_provider_approved
select is(public.is_provider_approved(tests.uid('provider_a')), true, 'an approved provider is approved');
select is(public.is_provider_approved(tests.uid('client_a')), false, 'a client is not an approved provider');
select is(public.is_provider_approved(tests.uid('client_b')), false, 'a draft provider is not approved');
select is(public.is_provider_approved(gen_random_uuid()), false, 'an unknown id is not an approved provider');

-- the service role may change the protected columns (the allowed side of the guard trigger)
select tests.authenticate_service();
select lives_ok($$update public.profiles set role = 'provider', deleted_at = now() where id = tests.uid('client_a')$$,
                'the service role changes role and deleted_at');
select tests.clear_authentication();
select is((select role::text || '/' || (deleted_at is not null)::text from public.profiles where id = tests.uid('client_a')),
          'provider/true', 'the service role change took effect');
select tests.authenticate_as('client_a');
select is((select count(*)::int from public.profiles where id = tests.uid('client_a')), 1, 'a deleted profile is still read by its owner');
select throws_ok($$update public.profiles set deleted_at = null where id = auth.uid()$$, 'P0001', 'not_allowed',
                 'the owner cannot clear deleted_at');

select * from finish();
rollback;
