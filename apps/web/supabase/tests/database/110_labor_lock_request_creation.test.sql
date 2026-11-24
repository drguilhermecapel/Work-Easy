-- Labor lock on a request: the request is created even when the client's confirmed phone is the phone of an
-- own entry of the provider with two days, because the contact of a linked account is compared at acceptance
-- only. The acceptance is refused with the generic labor_lock, and the refused acceptance leaves no contact on
-- the entry.
begin;
select plan(8);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- Provider A works Monday to Wednesday and offers a cleaning service (a labor-locked occupation).
insert into public.availability (provider_id, weekday, start_time, end_time) values
  (tests.uid('provider_a'), 1, '08:00', '18:00'), (tests.uid('provider_a'), 2, '08:00', '18:00'),
  (tests.uid('provider_a'), 3, '08:00', '18:00');
insert into public.services (provider_id, occupation_slug, title, price_min_cents, unit)
values (tests.uid('provider_a'), 't-domestica', 'Diária de faxina 110', 15000, 'dia');
insert into ids select 'service_a', id from public.services where title = 'Diária de faxina 110';

-- An own entry typed with client A's confirmed phone, with two own days.
select tests.authenticate_as('provider_a');
insert into public.provider_clients (provider_id, name, phone) values (auth.uid(), 'Dona Teresa', '5511900000001');
insert into ids select 'own_t', id from public.provider_clients where name = 'Dona Teresa';
select lives_ok($$select public.create_own_booking((select id from ids where name = 'own_t'), 't-domestica',
                    tests.sp_period(tests.at(40, 0, '09:00')), 10000, null)$$, 'provider A schedules the first own day');
select lives_ok($$select public.create_own_booking((select id from ids where name = 'own_t'), 't-domestica',
                    tests.sp_period(tests.at(40, 1, '09:00')), 10000, null)$$, 'and the second own day');
select tests.clear_authentication();

-- Client A asks for a third day through the real request path: created as requested.
select tests.authenticate_as('client_a');
select lives_ok($$insert into ids select 'req_110', public.book_direct(tests.uid('provider_a'),
                    (select id from ids where name = 'service_a'), tests.sp_period(tests.at(40, 2, '09:00'), 1))$$,
                'the request for the third day is created: the match by contact is not checked on creation');
select tests.clear_authentication();
select is((select status::text from public.bookings where id = (select id from ids where name = 'req_110')), 'requested',
          'the request waits for the provider');

-- Provider A accepts: the client's confirmed phone is compared now, and the acceptance is refused.
select tests.authenticate_as('provider_a');
select throws_ok(format($$select public.transition_booking(%L, 'accepted')$$, (select id from ids where name = 'req_110')),
                 'P0001', 'labor_lock',
                 'the acceptance is refused: the same person as an own entry with two days is a third day');
select is((select phone from public.provider_clients where provider_id = auth.uid() and client_id = tests.uid('client_a')), null,
          'the contact written for that acceptance is rolled back with the refusal');
select tests.clear_authentication();
select is((select status::text from public.bookings where id = (select id from ids where name = 'req_110')), 'requested',
          'the request stays requested');

select * from finish();
rollback;
