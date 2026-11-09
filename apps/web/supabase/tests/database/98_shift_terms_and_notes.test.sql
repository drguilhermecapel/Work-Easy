-- Shift terms and family notes, through the real path: a family offers a shift, the terms are
-- frozen while the offer is open, a caregiver sees the notes only once assigned, and the terms
-- stay frozen when a caregiver leaves and the shift is offered again.
begin;
select plan(17);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- Providers A and C also offer the care occupation (a policy priced by shift).
insert into public.provider_occupations (provider_id, occupation_slug, approved) values
  (tests.uid('provider_a'), 't-cuidado', true), (tests.uid('provider_c'), 't-cuidado', true);

select tests.authenticate_as('client_a');
select lives_ok($$insert into public.households (name) values ('Casa com recado')$$, 'family creates a household');
insert into ids select 'house', id from public.households where name = 'Casa com recado';
select lives_ok(format($$insert into public.shifts (household_id, period, rate_cents, caregiver_payout_cents, notes)
                         values (%L, %L, 30000, 24000, 'Porta da frente sem campainha')$$,
                       (select id from ids where name = 'house'), tests.sp_period(tests.at(70, 0, '08:00'), 4)),
                'family creates an open shift with notes');
insert into ids select 'shift', id from public.shifts where rate_cents = 30000;

-- ================================================================ terms while open
select lives_ok($$update public.shifts set rate_cents = 31000 where id = (select id from ids where name = 'shift')$$,
                'while open, the family can still change the rate');

-- ================================================================ terms while offered
select is(public.offer_shift((select id from ids where name = 'shift'),
                             array[tests.uid('provider_a'), tests.uid('provider_c')]),
          2, 'family offers the shift to two caregivers');
select throws_ok($$update public.shifts set rate_cents = 32000 where id = (select id from ids where name = 'shift')$$,
                 'P0001', 'not_allowed', 'offered: the rate cannot change');
select throws_ok($$update public.shifts set period = tests.sp_period(tests.at(70, 0, '10:00'), 4)
                    where id = (select id from ids where name = 'shift')$$,
                 'P0001', 'not_allowed', 'offered: the period cannot change');
select throws_ok($$update public.shifts set caregiver_payout_cents = 1 where id = (select id from ids where name = 'shift')$$,
                 'P0001', 'not_allowed', 'offered: the caregiver payout cannot change');
select lives_ok($$update public.shifts set notes = 'Porta da frente, campainha quebrada' where id = (select id from ids where name = 'shift')$$,
                'offered: the notes can still be corrected');

-- ================================================================ notes before assignment
select tests.authenticate_as('provider_a');
select is((select notes from public.caregiver_shifts()), null::text,
          'an offered caregiver does not see the family notes');
select tests.authenticate_as('provider_c');
select is((select notes from public.caregiver_shifts()), null::text,
          'nor does another offered caregiver');

-- ================================================================ notes after assignment
select tests.authenticate_as('provider_a');
select is(public.accept_shift_offer((select id from ids where name = 'shift'))::text, 'assigned',
          'the first caregiver accepts');
select is((select notes from public.caregiver_shifts()), 'Porta da frente, campainha quebrada',
          'the assigned caregiver sees the family notes');
-- The family's own session (the guard applies to API sessions only).
select tests.authenticate_as('client_a');
select throws_ok($$update public.shifts set period = tests.sp_period(tests.at(70, 0, '10:00'), 4)
                    where id = (select id from ids where name = 'shift')$$,
                 'P0001', 'not_allowed', 'assigned: the period cannot change either');

-- ================================================================ a caregiver leaves
select tests.authenticate_as('provider_a');
select is(public.cancel_shift((select id from ids where name = 'shift'), 'Imprevisto')::text, 'offered',
          'the assigned caregiver cancels: the shift is offered again to the other caregiver');
select is((select count(*)::int from public.caregiver_shifts()), 0,
          'the caregiver who left no longer sees the shift');
select tests.authenticate_as('client_a');
select throws_ok($$update public.shifts set rate_cents = 33000 where id = (select id from ids where name = 'shift')$$,
                 'P0001', 'not_allowed', 'offered again: the rate stays frozen');

select * from finish();
rollback;
