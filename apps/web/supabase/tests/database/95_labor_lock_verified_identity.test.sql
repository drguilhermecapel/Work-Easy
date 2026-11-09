-- Labor lock by verified identity: two accounts are one employer only through contact data
-- confirmed in auth.users, the same confirmed phone or the same confirmed e-mail on both sides.
-- Unconfirmed contact data never joins accounts, and the phone a user types in the profile
-- does not either. Each scenario uses its own week, so the counts do not mix.
begin;
select plan(26);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- ================================================================ both phones unconfirmed
-- The helper confirms a phone when one is given: the same number typed two ways, then unconfirmed.
select tests.create_user('emp_u1', 'Titular U1', '5511966660001');
select tests.create_user('emp_u2', 'Titular U2', '11966660001');
update auth.users set phone_confirmed_at = null where email in ('emp_u1@test.local', 'emp_u2@test.local');
select lives_ok($$select tests.make_booking('provider_a', 'emp_u1', 't-domestica', tests.sp_period(tests.at(80, 0, '09:00')))$$,
                'unconfirmed phones: the first account, Monday');
select lives_ok($$select tests.make_booking('provider_a', 'emp_u1', 't-domestica', tests.sp_period(tests.at(80, 1, '09:00')))$$,
                'unconfirmed phones: the first account, Tuesday');
select lives_ok($$select tests.make_booking('provider_a', 'emp_u2', 't-domestica', tests.sp_period(tests.at(80, 2, '09:00')))$$,
                'two accounts with the same unconfirmed phone do not share the count');
select lives_ok($$select tests.make_booking('provider_a', 'emp_u2', 't-domestica', tests.sp_period(tests.at(80, 3, '09:00')))$$,
                'the second account has its own two days');
select throws_ok($$select tests.make_booking('provider_a', 'emp_u1', 't-domestica', tests.sp_period(tests.at(80, 4, '09:00')))$$,
                 'P0001', 'labor_lock', 'and each account keeps its own limit');

-- ================================================================ one phone confirmed
select tests.create_user('emp_m1', 'Titular M1', '5511944440001');
select tests.create_user('emp_m2', 'Titular M2', '11944440001');
update auth.users set phone_confirmed_at = null where email = 'emp_m2@test.local';
select lives_ok($$select tests.make_booking('provider_a', 'emp_m1', 't-domestica', tests.sp_period(tests.at(81, 0, '09:00')))$$,
                'one confirmed phone: the confirmed account, Monday');
select lives_ok($$select tests.make_booking('provider_a', 'emp_m1', 't-domestica', tests.sp_period(tests.at(81, 1, '09:00')))$$,
                'one confirmed phone: the confirmed account, Tuesday');
select lives_ok($$select tests.make_booking('provider_a', 'emp_m2', 't-domestica', tests.sp_period(tests.at(81, 2, '09:00')))$$,
                'a confirmed phone joins only an account whose phone is confirmed too');

-- ================================================================ both phones confirmed
select tests.create_user('emp_c1', 'Titular C1', '5511933330001');
select tests.create_user('emp_c2', 'Titular C2', '11933330001');
select lives_ok($$select tests.make_booking('provider_a', 'emp_c1', 't-domestica', tests.sp_period(tests.at(82, 0, '09:00')))$$,
                'confirmed phones: the first account, Monday');
select lives_ok($$select tests.make_booking('provider_a', 'emp_c1', 't-domestica', tests.sp_period(tests.at(82, 1, '09:00')))$$,
                'confirmed phones: the first account, Tuesday');
select throws_ok($$select tests.make_booking('provider_a', 'emp_c2', 't-domestica', tests.sp_period(tests.at(82, 2, '09:00')))$$,
                 'P0001', 'labor_lock', 'two accounts with the same confirmed phone share the count');

-- ================================================================ e-mail
-- Same e-mail, letters in another case, both confirmed: one employer. The helper keys give the
-- two accounts their own e-mails (the lookup by key stays exact).
select tests.create_user('emp_e1', 'Titular E1');
select tests.create_user('EMP_E1', 'Titular E1 (outro cadastro)');
select lives_ok($$select tests.make_booking('provider_a', 'emp_e1', 't-domestica', tests.sp_period(tests.at(83, 0, '09:00')))$$,
                'confirmed e-mail: the first account, Monday');
select lives_ok($$select tests.make_booking('provider_a', 'emp_e1', 't-domestica', tests.sp_period(tests.at(83, 1, '09:00')))$$,
                'confirmed e-mail: the first account, Tuesday');
select throws_ok($$select tests.make_booking('provider_a', 'EMP_E1', 't-domestica', tests.sp_period(tests.at(83, 2, '09:00')))$$,
                 'P0001', 'labor_lock', 'two accounts with the same confirmed e-mail share the count');

-- The same pair with both e-mails unconfirmed does not share it.
select tests.create_user('emp_f1', 'Titular F1');
select tests.create_user('EMP_F1', 'Titular F1 (outro cadastro)');
update auth.users set email_confirmed_at = null where email in ('emp_f1@test.local', 'EMP_F1@test.local');
select lives_ok($$select tests.make_booking('provider_a', 'emp_f1', 't-domestica', tests.sp_period(tests.at(84, 0, '09:00')))$$,
                'unconfirmed e-mails: the first account, Monday');
select lives_ok($$select tests.make_booking('provider_a', 'emp_f1', 't-domestica', tests.sp_period(tests.at(84, 1, '09:00')))$$,
                'unconfirmed e-mails: the first account, Tuesday');
select lives_ok($$select tests.make_booking('provider_a', 'EMP_F1', 't-domestica', tests.sp_period(tests.at(84, 2, '09:00')))$$,
                'two accounts with the same unconfirmed e-mail do not share the count');

-- ================================================================ profile phone
-- The user types a phone in the profile: it is not confirmed identity, so it joins nothing.
select tests.create_user('emp_p1', 'Titular P1', '5511922220001');
select tests.create_user('emp_p2', 'Titular P2', '5511922229999');
select tests.authenticate_as('emp_p2');
select lives_ok($$update public.profiles set phone = '5511922220001' where id = auth.uid()$$,
                'the user edits the phone in the profile');
select tests.clear_authentication();
select is((select phone from public.profiles where id = tests.uid('emp_p2')), '5511922220001',
          'the profile now shows the typed phone');
select lives_ok($$select tests.make_booking('provider_a', 'emp_p1', 't-domestica', tests.sp_period(tests.at(85, 0, '09:00')))$$,
                'the typed phone does not join the accounts: first account, Monday');
select lives_ok($$select tests.make_booking('provider_a', 'emp_p1', 't-domestica', tests.sp_period(tests.at(85, 1, '09:00')))$$,
                'the typed phone does not join the accounts: first account, Tuesday');
select lives_ok($$select tests.make_booking('provider_a', 'emp_p2', 't-domestica', tests.sp_period(tests.at(85, 2, '09:00')))$$,
                'the account that typed the phone keeps its own count');

-- ================================================================ shifts of a verified peer
-- A household owned by a confirmed peer of emp_c1 counts in the same week as emp_c1's bookings.
insert into public.households (owner_id, name) values (tests.uid('emp_c2'), 'Casa do titular C2');
insert into ids select 'house_c2', id from public.households where name = 'Casa do titular C2';
select lives_ok($$insert into public.shifts (household_id, period, rate_cents, status, provider_id)
                  values ((select id from ids where name = 'house_c2'), tests.sp_period(tests.at(86, 0, '08:00'), 8), 1,
                          'assigned', tests.uid('provider_a'))$$,
                'a shift of the peer account, Monday');
select lives_ok($$select tests.make_booking('provider_a', 'emp_c1', 't-domestica', tests.sp_period(tests.at(86, 1, '09:00')))$$,
                'the first account, Tuesday: two days with the shift');
select throws_ok($$select tests.make_booking('provider_a', 'emp_c1', 't-domestica', tests.sp_period(tests.at(86, 2, '09:00')))$$,
                 'P0001', 'labor_lock', 'the shift of the peer counts towards the same limit');

select * from finish();
rollback;
