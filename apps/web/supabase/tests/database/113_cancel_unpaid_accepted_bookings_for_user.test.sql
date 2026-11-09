-- Account deletion, bookings: the accepted bookings of the deleted user, as client or as provider, are canceled
-- with the reason "cancelada pela exclusão da conta". Paid, in-progress, disputed, completed and requested
-- bookings, and bookings of other people, are left as they are. Only the service role can run the function.
begin;
select plan(26);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

select has_function('public', 'cancel_unpaid_accepted_bookings_for_user', array['uuid'], 'the function exists');
select is(has_function_privilege('authenticated', 'public.cancel_unpaid_accepted_bookings_for_user(uuid)', 'EXECUTE'), false,
          'authenticated cannot execute it');
select is(has_function_privilege('anon', 'public.cancel_unpaid_accepted_bookings_for_user(uuid)', 'EXECUTE'), false,
          'anon cannot execute it');
select is(has_function_privilege('service_role', 'public.cancel_unpaid_accepted_bookings_for_user(uuid)', 'EXECUTE'), true,
          'the service role can execute it');

-- ================================================================ bookings
-- Week 120 and 121. Each caregiver has no two active bookings on the same day.
insert into ids values
  ('acc_a_c',   tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(120, 0, '09:00')))),
  ('acc_a_pa',  tests.make_booking('provider_a', 'client_a', 't-reparo', tests.sp_period(tests.at(120, 2, '09:00')))),
  ('paid_a_c',  tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(120, 3, '09:00')), 'paid')),
  ('prog_a_d',  tests.make_booking('provider_d', 'client_a', 't-reparo', tests.sp_period(tests.at(120, 4, '09:00')), 'in_progress')),
  ('disp_a_c',  tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(120, 5, '09:00')), 'disputed')),
  ('done_a_c',  tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(120, 6, '09:00')), 'completed')),
  ('req_a_d',   tests.make_booking('provider_d', 'client_a', 't-reparo', tests.sp_period(tests.at(121, 0, '09:00')), 'requested')),
  ('other_c_b', tests.make_booking('provider_c', 'client_b', 't-reparo', tests.sp_period(tests.at(121, 1, '09:00')))),
  ('acc_b_pa',  tests.make_booking('provider_a', 'client_b', 't-reparo', tests.sp_period(tests.at(121, 2, '09:00')))),
  ('paid_b_pa', tests.make_booking('provider_a', 'client_b', 't-reparo', tests.sp_period(tests.at(121, 3, '09:00')), 'paid'));

-- An own booking of provider A: a client without an account, so client_id is null.
insert into public.provider_clients (provider_id, name) values (tests.uid('provider_a'), 'Cliente própria 113');
insert into ids select 'own_entry', id from public.provider_clients where name = 'Cliente própria 113';
with b as (
  insert into public.bookings (client_id, provider_client_id, provider_id, occupation_slug, period, price_cents, status, origin)
  values (null, (select id from ids where name = 'own_entry'), tests.uid('provider_a'), 't-reparo',
          tests.sp_period(tests.at(121, 5, '09:00')), 10000, 'accepted', 'own')
  returning id
)
insert into ids select 'own_pa', id from b;

-- ================================================================ permission
select tests.authenticate_as('client_a');
select throws_ok($$select public.cancel_unpaid_accepted_bookings_for_user(tests.uid('client_a'))$$, '42501', null,
                 'the family cannot run it');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.cancel_unpaid_accepted_bookings_for_user(tests.uid('provider_a'))$$, '42501', null,
                 'a provider cannot run it');
select tests.authenticate_anon();
select throws_ok($$select public.cancel_unpaid_accepted_bookings_for_user(tests.uid('client_a'))$$, '42501', null,
                 'anon cannot run it');
select tests.clear_authentication();

-- ================================================================ family account
select tests.authenticate_service();
select is(public.cancel_unpaid_accepted_bookings_for_user(tests.uid('client_a')), 2,
          'the service role cancels the two accepted bookings of the family, one with each caregiver');
select tests.clear_authentication();

select is((select status::text from public.bookings where id = (select id from ids where name = 'acc_a_c')), 'canceled',
          'an accepted booking with a caregiver is canceled');
select is((select status::text from public.bookings where id = (select id from ids where name = 'acc_a_pa')), 'canceled',
          'and the other accepted booking of the family too');
select is((select canceled_reason from public.bookings where id = (select id from ids where name = 'acc_a_c')),
          'cancelada pela exclusão da conta', 'the cancellation keeps the reason');
select is((select count(*)::int from public.booking_events
            where booking_id = (select id from ids where name = 'acc_a_c')
              and from_status = 'accepted' and to_status = 'canceled'
              and reason = 'cancelada pela exclusão da conta'), 1,
          'the history records accepted -> canceled with the same reason');
select is((select status::text from public.bookings where id = (select id from ids where name = 'paid_a_c')), 'paid',
          'a paid booking is not canceled here');
select is((select status::text from public.bookings where id = (select id from ids where name = 'prog_a_d')), 'in_progress',
          'an in-progress booking is not canceled here');
select is((select status::text from public.bookings where id = (select id from ids where name = 'disp_a_c')), 'disputed',
          'a disputed booking is not canceled here');
select is((select status::text from public.bookings where id = (select id from ids where name = 'done_a_c')), 'completed',
          'a completed booking is history and stays');
select is((select status::text from public.bookings where id = (select id from ids where name = 'req_a_d')), 'requested',
          'a requested booking is not accepted, so it is not canceled here');
select is((select status::text from public.bookings where id = (select id from ids where name = 'other_c_b')), 'accepted',
          'an accepted booking of another client is not touched');

-- ================================================================ provider account
select tests.authenticate_service();
select is(public.cancel_unpaid_accepted_bookings_for_user(tests.uid('provider_a')), 2,
          'the provider account cancels its accepted bookings: one with a client, one of its own');
select tests.clear_authentication();
select is((select status::text from public.bookings where id = (select id from ids where name = 'acc_b_pa')), 'canceled',
          'the accepted booking of provider A with another client is canceled');
select is((select status::text from public.bookings where id = (select id from ids where name = 'own_pa')), 'canceled',
          'the accepted own booking of provider A is canceled');
select is((select canceled_reason from public.bookings where id = (select id from ids where name = 'own_pa')),
          'cancelada pela exclusão da conta', 'and it keeps the reason');
select is((select status::text from public.bookings where id = (select id from ids where name = 'paid_b_pa')), 'paid',
          'a paid booking of provider A is not canceled here');

-- ================================================================ running again and unknown users
select tests.authenticate_service();
select is(public.cancel_unpaid_accepted_bookings_for_user(tests.uid('client_a')), 0, 'a second run cancels nothing');
select throws_ok($$select public.cancel_unpaid_accepted_bookings_for_user(gen_random_uuid())$$, 'P0001', 'not_allowed',
                 'an unknown user is refused');
select tests.clear_authentication();

select * from finish();
rollback;
