-- A shift the family cancels after the caregiver was assigned: the caregiver keeps the record (period, status
-- canceled and the payout) as history, but the family notes, the first name of the person cared for and the
-- neighborhood come back null. Before the cancellation the assigned caregiver sees all three, and another
-- caregiver whose offer ended sees nothing.
begin;
select plan(18);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- Providers A and C also offer the care occupation (a policy priced by shift).
insert into public.provider_occupations (provider_id, occupation_slug, approved) values
  (tests.uid('provider_a'), 't-cuidado', true), (tests.uid('provider_c'), 't-cuidado', true);

-- ================================================================ family
select tests.authenticate_as('client_a');
select lives_ok(format($$insert into public.households (name, neighborhood_id) values ('Casa do cancelamento', %L)$$,
                       tests.neighborhood('t-bairro-1')), 'family creates a household in a neighborhood');
insert into ids select 'house', id from public.households where name = 'Casa do cancelamento';
select lives_ok($$insert into public.care_recipients (household_id, first_name, adult_declared_at)
                  values ((select id from ids where name = 'house'), 'Lúcia', now())$$,
                'family adds a care recipient');
insert into ids select 'lucia', id from public.care_recipients where first_name = 'Lúcia';
select lives_ok(format($$insert into public.shifts (household_id, care_recipient_id, period, rate_cents, caregiver_payout_cents, notes)
                         values (%L, %L, %L, 30000, 24000, 'Porta da frente sem campainha')$$,
                       (select id from ids where name = 'house'), (select id from ids where name = 'lucia'),
                       tests.sp_period(tests.at(70, 0, '08:00'), 4)),
                'family creates an open shift with notes');
insert into ids select 'shift', id from public.shifts where household_id = (select id from ids where name = 'house');
select is(public.offer_shift((select id from ids where name = 'shift'),
                             array[tests.uid('provider_a'), tests.uid('provider_c')]),
          2, 'family offers the shift to two caregivers');

-- ================================================================ assigned
select tests.authenticate_as('provider_a');
select is(public.accept_shift_offer((select id from ids where name = 'shift'))::text, 'assigned',
          'the first caregiver accepts');
select is((select notes from public.caregiver_shifts()), 'Porta da frente sem campainha',
          'assigned: the caregiver sees the family notes');
select is((select recipient_first_name from public.caregiver_shifts()), 'Lúcia',
          'assigned: the caregiver sees the first name of the person cared for');
select is((select neighborhood_name from public.caregiver_shifts()), 'Bairro Um',
          'assigned: the caregiver sees the neighborhood');

-- ================================================================ family cancels
select tests.authenticate_as('client_a');
select is(public.cancel_shift((select id from ids where name = 'shift'), 'Não precisa mais')::text, 'canceled',
          'family cancels the assigned shift');

-- ================================================================ after cancellation
select tests.authenticate_as('provider_a');
select is((select count(*)::int from public.caregiver_shifts()), 1,
          'canceled: the caregiver still reads the shift as history');
select is((select status::text from public.caregiver_shifts()), 'canceled',
          'canceled: the status stays canceled');
select is((select period from public.caregiver_shifts()), tests.sp_period(tests.at(70, 0, '08:00'), 4),
          'canceled: the period stays');
select is((select caregiver_payout_cents from public.caregiver_shifts()), 24000,
          'canceled: the payout stays');
select is((select notes from public.caregiver_shifts()), null::text,
          'canceled: the family notes are null');
select is((select recipient_first_name from public.caregiver_shifts()), null::text,
          'canceled: the first name of the person cared for is null');
select is((select neighborhood_name from public.caregiver_shifts()), null::text,
          'canceled: the neighborhood is null');

-- The other caregiver was offered the shift too; the offer ended when the first one accepted.
select tests.authenticate_as('provider_c');
select is((select count(*)::int from public.caregiver_shifts()), 0,
          'another caregiver does not see the canceled shift');

select * from finish();
rollback;
