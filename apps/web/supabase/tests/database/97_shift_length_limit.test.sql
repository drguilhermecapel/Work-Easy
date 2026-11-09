-- Shift length: a shift covers at most 60 calendar days from its start, for a family, on update,
-- and in a maintenance session. A shorter period is still accepted.
begin;
select plan(7);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

select tests.authenticate_as('client_a');
select lives_ok($$insert into public.households (name) values ('Casa do prazo')$$, 'family creates a household');
insert into ids select 'house', id from public.households where name = 'Casa do prazo';

-- 60 days is the limit itself (1440 hours), 61 days is over it (1464 hours).
select lives_ok(format($$insert into public.shifts (household_id, period, rate_cents)
                         values (%L, %L, 100)$$,
                       (select id from ids where name = 'house'), tests.sp_period(tests.at(70, 0, '08:00'), 1440)),
                'a shift of 60 days is accepted');
insert into ids select 'sixty', id from public.shifts where rate_cents = 100;
select throws_ok(format($$insert into public.shifts (household_id, period, rate_cents)
                          values (%L, %L, 101)$$,
                        (select id from ids where name = 'house'), tests.sp_period(tests.at(75, 0, '08:00'), 1464)),
                 'P0001', 'shift_too_long', 'a shift of 61 days is refused');
select throws_ok(format($$update public.shifts set period = %L where id = %L$$,
                        tests.sp_period(tests.at(70, 0, '08:00'), 1464), (select id from ids where name = 'sixty')),
                 'P0001', 'shift_too_long', 'a period extended to 61 days is refused');
select lives_ok(format($$update public.shifts set period = %L where id = %L$$,
                       tests.sp_period(tests.at(70, 0, '08:00'), 72), (select id from ids where name = 'sixty')),
                'a period shortened to three days is accepted');

select tests.clear_authentication();
select throws_ok(format($$insert into public.shifts (household_id, period, rate_cents)
                          values (%L, %L, 102)$$,
                        (select id from ids where name = 'house'), tests.sp_period(tests.at(80, 0, '08:00'), 1464)),
                 'P0001', 'shift_too_long', 'the limit holds in a maintenance session too');

select * from finish();
rollback;
