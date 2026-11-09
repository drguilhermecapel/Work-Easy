-- Age declaration as a consent purpose (migration 20261110500004): 'age_declaration' is accepted and
-- recorded in the consent history like the other purposes; a purpose outside the list is refused.
begin;
select plan(5);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

select enum_has_labels('public', 'consent_purpose',
                       array['terms', 'privacy', 'marketing', 'background_check', 'location', 'age_declaration'],
                       'the consent purposes include the age declaration');

select tests.authenticate_as('client_a');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('age_declaration', '2026-11', true)$$,
                'a user records the age declaration');
select tests.clear_authentication();
select is((select count(*)::int from public.consents
            where user_id = tests.uid('client_a') and purpose = 'age_declaration' and granted), 1,
          'the age declaration is recorded in the consent history');
select throws_ok(format($$insert into public.consents (user_id, purpose, version, granted) values (%L, 'idade_informada', '2026-11', true)$$,
                        tests.uid('client_a')),
                 '22P02', null, 'a purpose outside the list is refused');

select * from finish();
rollback;
