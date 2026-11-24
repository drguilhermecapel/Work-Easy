-- Labor lock, one employer: every household with the same owner counts together (bookings and shifts),
-- and a CRM entry linked to an account carries the account's confirmed phone, never the phone typed in
-- the CRM. An entry without an account still carries its own typed phone. Each scenario uses its own
-- week, so the counts do not mix.
begin;
select plan(12);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ households of one owner
-- The owner has no confirmed phone or e-mail that another account shares: the count is the owner's.
select tests.create_user('lar_titular', 'Titular do lar');
insert into public.households (owner_id, name) values
  (tests.uid('lar_titular'), 'Casa um'),
  (tests.uid('lar_titular'), 'Casa dois');
insert into ids select 'casa_um', id from public.households where name = 'Casa um';
insert into ids select 'casa_dois', id from public.households where name = 'Casa dois';

-- Monday: a booking in the second household, with no account on the client side.
select lives_ok($$insert into public.bookings (provider_id, occupation_slug, household_id, period, price_cents, status)
                  values (tests.uid('provider_a'), 't-domestica', (select id from ids where name = 'casa_dois'),
                          tests.sp_period(tests.at(100, 0, '09:00')), 10000, 'accepted')$$,
                'a booking in the second household of the owner, Monday');
select lives_ok($$select tests.make_booking('provider_a', 'lar_titular', 't-domestica', tests.sp_period(tests.at(100, 1, '09:00')))$$,
                'the owner books on Tuesday: two days, one of them in the second household');
select throws_ok($$select tests.make_booking('provider_a', 'lar_titular', 't-domestica', tests.sp_period(tests.at(100, 2, '09:00')))$$,
                 'P0001', 'labor_lock', 'the booking in the second household counts with the owner: Wednesday is the third day');

-- Shifts in every household of the owner count together.
select lives_ok($$insert into public.shifts (household_id, period, rate_cents, status, provider_id) values
  ((select id from ids where name = 'casa_dois'), tests.sp_period(tests.at(101, 0, '08:00'), 4), 100, 'assigned', tests.uid('provider_a')),
  ((select id from ids where name = 'casa_um'), tests.sp_period(tests.at(101, 1, '08:00'), 4), 100, 'assigned', tests.uid('provider_a'))$$,
                'a shift in each household of the owner: Monday and Tuesday');
select throws_ok(format($$insert into public.shifts (household_id, period, rate_cents, status, provider_id)
                          values (%L, %L, 100, 'assigned', %L)$$,
                        (select id from ids where name = 'casa_um'), tests.sp_period(tests.at(101, 2, '08:00'), 4),
                        tests.uid('provider_a')),
                 'P0001', 'labor_lock', 'shifts of both households of the owner share the limit');

-- ================================================================ typed phone of a linked entry
-- The linked entry's account has a confirmed phone that differs from the phone typed in the CRM. The
-- typed phone is the phone of an unlinked entry, which must not group the two.
select tests.create_user('crm_x', 'Cliente X', '5511977770001');
insert into public.provider_clients (provider_id, name, phone, client_id) values
  (tests.uid('provider_a'), 'Cliente X (com conta)', '(11) 96666-0001', tests.uid('crm_x'));
insert into public.provider_clients (provider_id, name, phone) values
  (tests.uid('provider_a'), 'Teresa sem conta', '11 96666-0001');
insert into ids select 'linked_x', id from public.provider_clients where name = 'Cliente X (com conta)';
insert into ids select 'typed_t', id from public.provider_clients where name = 'Teresa sem conta';

select tests.authenticate_as('provider_a');
select lives_ok($$select public.create_own_booking((select id from ids where name = 'typed_t'), 't-domestica', tests.sp_period(tests.at(102, 0, '09:00')), 100, null)$$,
                'the entry without an account: Monday');
select lives_ok($$select public.create_own_booking((select id from ids where name = 'typed_t'), 't-domestica', tests.sp_period(tests.at(102, 1, '09:00')), 100, null)$$,
                'the entry without an account: Tuesday');
select lives_ok($$select public.create_own_booking((select id from ids where name = 'linked_x'), 't-domestica', tests.sp_period(tests.at(102, 2, '09:00')), 100, null)$$,
                'the linked entry is not grouped by its typed phone: its confirmed account has one day, Wednesday');
select tests.clear_authentication();

-- ================================================================ confirmed phone of a linked entry
-- The linked entry's account confirms a phone; an unlinked entry types the same number in another format.
-- The two are one employer, whatever the CRM says about the linked entry.
select tests.create_user('crm_y', 'Cliente Y', '5511988880001');
insert into public.provider_clients (provider_id, name, phone, client_id) values
  (tests.uid('provider_a'), 'Cliente Y (com conta)', '(11) 91234-0000', tests.uid('crm_y'));
insert into public.provider_clients (provider_id, name, phone) values
  (tests.uid('provider_a'), 'Yara sem conta', '11 98888-0001');
insert into ids select 'linked_y', id from public.provider_clients where name = 'Cliente Y (com conta)';
insert into ids select 'typed_y', id from public.provider_clients where name = 'Yara sem conta';

select tests.authenticate_as('provider_a');
select lives_ok($$select public.create_own_booking((select id from ids where name = 'typed_y'), 't-domestica', tests.sp_period(tests.at(103, 0, '09:00')), 100, null)$$,
                'the entry without an account types the confirmed number: Monday');
select lives_ok($$select public.create_own_booking((select id from ids where name = 'typed_y'), 't-domestica', tests.sp_period(tests.at(103, 1, '09:00')), 100, null)$$,
                'the entry without an account: Tuesday');
select throws_ok($$select public.create_own_booking((select id from ids where name = 'linked_y'), 't-domestica', tests.sp_period(tests.at(103, 2, '09:00')), 100, null)$$,
                 'P0001', 'labor_lock', 'the linked entry is grouped by its confirmed phone with the entry that types it: Wednesday is the third day');
select tests.clear_authentication();

select * from finish();
rollback;
