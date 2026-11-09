-- Check-in keeps the caregiver's position only while the caregiver has location consent (the
-- latest 'location' decision is granted). Without it the check-in still registers, with no
-- coordinates; a consent given for another purpose does not count.
begin;
select plan(11);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;
insert into public.provider_occupations (provider_id, occupation_slug, approved) values
  (tests.uid('provider_a'), 't-cuidado', true), (tests.uid('provider_c'), 't-cuidado', true);

-- A family with one care recipient, and two shifts that are inside the check-in window now.
insert into public.households (owner_id, name, neighborhood_id)
values (tests.uid('client_a'), 'Casa de teste', tests.neighborhood('t-bairro-1'));
insert into public.care_recipients (household_id, first_name)
values ((select id from public.households where name = 'Casa de teste'), 'Teste');
insert into public.shifts (household_id, care_recipient_id, period, rate_cents, caregiver_payout_cents, status, provider_id)
values ((select id from public.households where name = 'Casa de teste'),
        (select id from public.care_recipients where first_name = 'Teste'),
        tstzrange(now() - interval '1 hour', now() + interval '1 hour'), 30000, 24000, 'assigned', tests.uid('provider_c'));
insert into ids select 'no_consent', id from public.shifts where provider_id = tests.uid('provider_c');
insert into public.shifts (household_id, care_recipient_id, period, rate_cents, caregiver_payout_cents, status, provider_id)
values ((select id from public.households where name = 'Casa de teste'),
        (select id from public.care_recipients where first_name = 'Teste'),
        tstzrange(now() - interval '1 hour', now() + interval '1 hour'), 30000, 24000, 'assigned', tests.uid('provider_a'));
insert into ids select 'consent', id from public.shifts where provider_id = tests.uid('provider_a');

-- Without location consent the check-in registers, and no position is stored.
select tests.authenticate_as('provider_c');
select lives_ok($$select public.check_in((select id from ids where name = 'no_consent'), 'in', -23.56, -46.69)$$,
                'a caregiver without location consent still checks in');
select tests.clear_authentication();
select is((select lat from public.checkins where shift_id = (select id from ids where name = 'no_consent')), null,
          'without location consent no position is stored');

-- A consent for another purpose is not location consent.
insert into public.consents (user_id, purpose, version, granted)
values (tests.uid('provider_c'), 'privacy', 'teste-1', true);
select is(private.has_location_consent(tests.uid('provider_c')), false,
          'consent to another purpose does not count as location consent');

-- With location consent the position is stored.
select tests.authenticate_as('provider_a');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('location', 'teste-1', true)$$,
                'a caregiver records location consent');
select lives_ok($$select public.check_in((select id from ids where name = 'consent'), 'in', -23.56, -46.69)$$,
                'with location consent the check-in registers');
select tests.clear_authentication();
select is((select lat from public.checkins where shift_id = (select id from ids where name = 'consent') and kind = 'in'),
          -23.56::numeric, 'with location consent the latitude is stored');
select is((select lng from public.checkins where shift_id = (select id from ids where name = 'consent') and kind = 'in'),
          -46.69::numeric, 'and the longitude');

-- The caregiver withdraws the consent before checking out. This transaction keeps now() still,
-- so the withdrawal is dated a second later, as the server clock would date it.
insert into public.consents (user_id, purpose, version, granted, at)
values (tests.uid('provider_a'), 'location', 'teste-1', false, now() + interval '1 second');
select tests.authenticate_as('provider_a');
select lives_ok($$select public.check_in((select id from ids where name = 'consent'), 'out', -23.5, -46.6)$$,
                'after the withdrawal the check-out still registers');
select tests.clear_authentication();
select is((select lat from public.checkins where shift_id = (select id from ids where name = 'consent') and kind = 'out'), null,
          'after the withdrawal no position is stored');
select is((select status::text from public.shifts where id = (select id from ids where name = 'consent')), 'completed',
          'the shift is completed');

select * from finish();
rollback;
