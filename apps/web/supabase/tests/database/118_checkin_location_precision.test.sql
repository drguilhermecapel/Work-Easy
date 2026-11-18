-- Check-in stores the caregiver's position rounded to 3 decimal places, even when the client sends
-- more precision. Without location consent no position is stored, as before.
begin;
select plan(9);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();
create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;
insert into public.provider_occupations (provider_id, occupation_slug, approved) values
  (tests.uid('provider_a'), 't-cuidado', true), (tests.uid('provider_c'), 't-cuidado', true);

-- A family with one care recipient, and two shifts that are inside the check-in window now.
insert into public.households (owner_id, name, neighborhood_id)
values (tests.uid('client_a'), 'Casa de teste', tests.neighborhood('t-bairro-1'));
insert into public.care_recipients (household_id, first_name, adult_declared_at)
values ((select id from public.households where name = 'Casa de teste'), 'Teste', now());
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

-- Without location consent the check-in registers with many decimals, and no position is stored.
select tests.authenticate_as('provider_c');
select lives_ok($$select public.check_in((select id from ids where name = 'no_consent'), 'in', -23.5613449, -46.6565712)$$,
                'a caregiver without location consent checks in with a precise position');
select tests.clear_authentication();
select is((select lat from public.checkins where shift_id = (select id from ids where name = 'no_consent')), null,
          'without location consent no latitude is stored');
select is((select lng from public.checkins where shift_id = (select id from ids where name = 'no_consent')), null,
          'without location consent no longitude is stored');

-- With location consent the position is stored rounded to 3 decimal places, whatever the client sent.
select tests.authenticate_as('provider_a');
select lives_ok($$insert into public.consents (purpose, version, granted) values ('location', 'teste-1', true)$$,
                'a caregiver records location consent');
select lives_ok($$select public.check_in((select id from ids where name = 'consent'), 'in', -23.5613449, -46.6565712)$$,
                'with location consent a check-in with many decimals registers');
select tests.clear_authentication();
select is((select lat from public.checkins where shift_id = (select id from ids where name = 'consent') and kind = 'in'),
          -23.561::numeric, 'the latitude is rounded to 3 decimal places');
select is((select lng from public.checkins where shift_id = (select id from ids where name = 'consent') and kind = 'in'),
          -46.657::numeric, 'and the longitude is rounded to 3 decimal places');
select ok((select scale(lat) <= 3 and scale(lng) <= 3 from public.checkins
            where shift_id = (select id from ids where name = 'consent') and kind = 'in'),
          'no more than 3 decimal places are stored');

select * from finish();
rollback;
