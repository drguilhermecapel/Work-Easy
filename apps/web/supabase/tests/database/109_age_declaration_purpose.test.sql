-- Age declaration (migrations 20261110500004 and 20261110500005). 'age_declaration' is accepted and
-- recorded in the consent history like the other purposes; a purpose outside the list is refused.
-- A new care recipient needs the declaration time; a care recipient stored before the check existed
-- has none and can still be updated.
begin;
select plan(14);
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

-- Care recipients: the declaration is required on insert.
insert into public.households (owner_id, name) values (tests.uid('client_a'), 'Casa de teste 109');

select has_trigger('public', 'care_recipients', 'care_recipients_05_adult_declaration',
                   'the age declaration check is on care recipients');
select is(has_function_privilege('authenticated', 'private.require_adult_declaration()', 'EXECUTE'), false,
          'authenticated cannot run the age declaration check');

select tests.authenticate_as('client_a');
select throws_ok($$insert into public.care_recipients (household_id, first_name)
                    values ((select id from public.households where name = 'Casa de teste 109'), 'Sem declaração')$$,
                 'P0001', 'adult_declaration_required', 'a care recipient without an age declaration is refused');
select lives_ok($$insert into public.care_recipients (household_id, first_name, adult_declared_at)
                    values ((select id from public.households where name = 'Casa de teste 109'), 'Com declaração', now())$$,
                'a care recipient with an age declaration is accepted');
select is((select count(*)::int from public.care_recipients where adult_declared_at is not null), 1,
          'the declared care recipient is stored');
select tests.clear_authentication();

-- A care recipient stored before the check existed has no declaration. The check does not run on
-- an update, so that row can still be changed.
alter table public.care_recipients disable trigger care_recipients_05_adult_declaration;
insert into public.care_recipients (household_id, first_name)
values ((select id from public.households where name = 'Casa de teste 109'), 'Antiga');
alter table public.care_recipients enable trigger care_recipients_05_adult_declaration;
select is((select count(*)::int from public.care_recipients where first_name = 'Antiga' and adult_declared_at is null), 1,
          'an existing care recipient without a declaration is stored as it is');

select tests.authenticate_as('client_a');
select lives_ok($$update public.care_recipients set preferences = 'Atualizada' where first_name = 'Antiga'$$,
                'an existing care recipient can be updated without a declaration');
select tests.clear_authentication();
select is((select preferences from public.care_recipients where first_name = 'Antiga'), 'Atualizada',
          'the update is stored');
select ok((select adult_declared_at is null from public.care_recipients where first_name = 'Antiga'),
          'the update does not add a declaration');

select * from finish();
rollback;
