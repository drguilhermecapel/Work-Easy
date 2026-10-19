-- Identity: profile trigger, profile RLS by role, protected columns, admins, become_provider.
begin;
select plan(27);
select tests.setup_fixture();

-- Trigger on auth.users
select is((select role::text from public.profiles where id = tests.uid('client_a')), 'client',
          'sign-up creates a client profile');
select is((select full_name from public.profiles where id = tests.uid('client_a')), 'Cliente A',
          'profile takes the name from user metadata');
select is((select phone from public.profiles where id = tests.uid('client_a')), '5511900000001',
          'profile takes the phone from auth.users');

insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'sneaky@test.local', '{"full_name": "Sneaky", "role": "provider"}', now(), now());
select is((select role::text from public.profiles where id = tests.uid('sneaky')), 'client',
          'metadata cannot choose the role at sign-up');

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
select ok((select count(*) from public.profiles) >= 9, 'admin reads every profile');
select throws_ok($$insert into public.admins (user_id) values (tests.uid('client_b'))$$, '42501', null,
                 'admins are written by the service role only');

select tests.clear_authentication();
select is((select full_name from public.profiles where id = tests.uid('client_b')), 'Cliente B',
          'client A could not rename client B');

select * from finish();
rollback;
