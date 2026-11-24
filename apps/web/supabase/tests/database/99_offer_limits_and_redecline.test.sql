-- Offer limits: a caregiver who declined a shift is not offered it again; a shift takes at most
-- 10 caregivers; a family makes at most 30 offers in 24 hours, and a caregiver offered again
-- (an expired offer sent again) counts for that day as well. offer_shift locks the family row
-- before it counts; this suite runs the checks one after another, so it covers the counts
-- themselves, not the locking between two sessions.
begin;
select plan(19);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();
select has_column('public', 'shift_offers', 'offered_at', 'offers record when the family last offered the shift');

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- Twelve approved caregivers with the care occupation.
do $$
declare
  i int;
  v_key text;
begin
  for i in 1..12 loop
    v_key := 'of' || i;
    perform tests.create_user(v_key, 'Cuidador ' || i);
    update public.profiles set role = 'provider' where id = tests.uid(v_key);
    insert into public.providers (id, display_name, slug, status)
    values (tests.uid(v_key), 'Cuidador ' || i, 't-of-' || i, 'approved');
    insert into public.provider_occupations (provider_id, occupation_slug, is_primary, approved)
    values (tests.uid(v_key), 't-cuidado', true, true);
  end loop;
end;
$$;

-- ================================================================ declined caregivers
select tests.authenticate_as('client_a');
select lives_ok($$insert into public.households (name) values ('Casa da recusa')$$, 'family creates a household');
insert into ids select 'house_a', id from public.households where name = 'Casa da recusa';
select lives_ok(format($$insert into public.shifts (household_id, period, rate_cents)
                         values (%L, %L, 100)$$,
                       (select id from ids where name = 'house_a'), tests.sp_period(tests.at(90, 0, '08:00'), 4)),
                'family creates an open shift');
insert into ids select 'declined_shift', id from public.shifts where rate_cents = 100;

select is(public.offer_shift((select id from ids where name = 'declined_shift'), array[tests.uid('of1')]), 1,
          'the caregiver is offered the shift');
select tests.authenticate_as('of1');
select is(public.accept_shift_offer((select id from ids where name = 'declined_shift'))::text, 'assigned',
          'the caregiver accepts');
select is(public.cancel_shift((select id from ids where name = 'declined_shift'), 'Imprevisto')::text, 'open',
          'and then leaves the shift: the row becomes declined');
select tests.authenticate_as('client_a');
select throws_ok(format($$select public.offer_shift(%L, array[%L]::uuid[])$$,
                        (select id from ids where name = 'declined_shift'), tests.uid('of1')),
                 'P0001', 'offer_declined', 'a caregiver who declined is not offered the shift again');
select is(public.offer_shift((select id from ids where name = 'declined_shift'), array[tests.uid('of2')]), 1,
          'the other caregivers can still be offered it');

-- ================================================================ daily and per-shift limits
-- A second family, so that the offers of the first do not count here.
select tests.authenticate_as('client_b');
select lives_ok($$insert into public.households (name) values ('Casa do limite')$$, 'second family creates a household');
insert into ids select 'house_b', id from public.households where name = 'Casa do limite';
select lives_ok(format($$insert into public.shifts (household_id, period, rate_cents) values
                         (%1$L, %2$L, 201), (%1$L, %3$L, 202), (%1$L, %4$L, 203),
                         (%1$L, %5$L, 204), (%1$L, %6$L, 205)$$,
                       (select id from ids where name = 'house_b'),
                       tests.sp_period(tests.at(91, 0, '08:00'), 4), tests.sp_period(tests.at(91, 1, '08:00'), 4),
                       tests.sp_period(tests.at(91, 2, '08:00'), 4), tests.sp_period(tests.at(91, 3, '08:00'), 4),
                       tests.sp_period(tests.at(91, 4, '08:00'), 4)),
                'second family creates five open shifts');
insert into ids select 's1', id from public.shifts where rate_cents = 201;
insert into ids select 's2', id from public.shifts where rate_cents = 202;
insert into ids select 's3', id from public.shifts where rate_cents = 203;
insert into ids select 's4', id from public.shifts where rate_cents = 204;
insert into ids select 's5', id from public.shifts where rate_cents = 205;

select is(public.offer_shift((select id from ids where name = 's1'), (select array_agg(tests.uid('of' || g)) from generate_series(3, 12) g)),
          10, 'ten caregivers take a shift');
select is(public.offer_shift((select id from ids where name = 's2'), (select array_agg(tests.uid('of' || g)) from generate_series(3, 12) g)),
          10, 'ten more on another shift: twenty offers today');
select is(public.offer_shift((select id from ids where name = 's3'), (select array_agg(tests.uid('of' || g)) from generate_series(1, 9) g)),
          9, 'nine more on a third shift: twenty-nine offers today');
select throws_ok(format($$select public.offer_shift(%L, array[%L]::uuid[])$$,
                        (select id from ids where name = 's1'), tests.uid('of1')),
                 'P0001', 'offer_limit', 'a shift takes at most ten caregivers');

-- A caregiver offered on an earlier day, still expired: sending the offer again counts for today.
select tests.clear_authentication();
insert into public.shift_offers (shift_id, provider_id, status, created_at, offered_at)
values ((select id from ids where name = 's4'), tests.uid('of11'), 'expired',
        now() - interval '3 days', now() - interval '3 days');
select tests.authenticate_as('client_b');
select is(public.offer_shift((select id from ids where name = 's4'), array[tests.uid('of11')]), 1,
          'the expired offer is sent again: thirty offers today');
select is((select offered_at = now() from public.shift_offers
            where shift_id = (select id from ids where name = 's4') and provider_id = tests.uid('of11')), true,
          'the offer row records the new offer time');
select throws_ok(format($$select public.offer_shift(%L, array[%L]::uuid[])$$,
                        (select id from ids where name = 's5'), tests.uid('of12')),
                 'P0001', 'offer_limit', 'the thirty-first offer of the day is refused, the re-sent one included');

-- The administrator is not held by the family limit.
select tests.authenticate_as('admin');
select is(public.offer_shift((select id from ids where name = 's5'), array[tests.uid('of12')]), 1,
          'an administrator is not held by the daily limit of the family');

select * from finish();
rollback;
