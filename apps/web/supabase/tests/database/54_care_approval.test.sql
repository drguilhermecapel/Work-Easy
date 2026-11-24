-- Care shifts: a caregiver takes a shift only while approved with an approved care occupation, and a
-- suspended caregiver's open offers expire.
begin;
select plan(9);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

create temp table ids (name text primary key, id uuid);
grant all on ids to authenticated, anon, service_role;

-- Two caregivers with an approved care occupation (t-cuidado has the plantao price unit).
insert into public.provider_occupations (provider_id, occupation_slug, is_primary, registry_number, registry_uf, approved) values
  (tests.uid('provider_c'), 't-cuidado', false, null, null, true),
  (tests.uid('provider_e'), 't-cuidado', false, null, null, true);

-- A household of client_a with two open shifts.
insert into ids values ('s1', md5('s54-s1')::uuid), ('s2', md5('s54-s2')::uuid), ('h', md5('s54-h')::uuid);
insert into public.households (id, owner_id, name, neighborhood_id)
values ((select id from ids where name = 'h'), tests.uid('client_a'), 'Família de teste', tests.neighborhood('t-bairro-1'));
insert into public.shifts (id, household_id, period, rate_cents, caregiver_payout_cents, status) values
  ((select id from ids where name = 's1'), (select id from ids where name = 'h'), tests.sp_period(tests.at(49, 0, '08:00'), 4), 3000, 2500, 'open'),
  ((select id from ids where name = 's2'), (select id from ids where name = 'h'), tests.sp_period(tests.at(50, 0, '08:00'), 4), 3000, 2500, 'open');

select tests.authenticate_as('client_a');
select lives_ok($$select public.offer_shift((select id from ids where name = 's1'),
                    array[tests.uid('provider_c'), tests.uid('provider_e')])$$,
                'the family offers shift 1 to two caregivers');
select lives_ok($$select public.offer_shift((select id from ids where name = 's2'), array[tests.uid('provider_c')])$$,
                'the family offers shift 2 to one caregiver');
select tests.clear_authentication();

-- provider_e is suspended through the normal path: the trigger expires its offer.
update public.providers set status = 'suspended' where id = tests.uid('provider_e');
select is((select status from public.shift_offers where shift_id = (select id from ids where name = 's1')
              and provider_id = tests.uid('provider_e')), 'expired',
          'the suspended caregiver''s open offer expires');
select is((select status::text from public.shifts where id = (select id from ids where name = 's1')), 'offered',
          'the shift stays offered while another caregiver still has an open offer');

-- An approved caregiver takes shift 1.
select tests.authenticate_as('provider_c');
select lives_ok($$select public.accept_shift_offer((select id from ids where name = 's1'))$$,
                'an approved caregiver takes the shift');

-- provider_c loses the approval without the cascade: an open offer cannot be taken.
select tests.clear_authentication();
set session_replication_role = replica;
update public.providers set status = 'suspended' where id = tests.uid('provider_c');
set session_replication_role = origin;
select tests.authenticate_as('provider_c');
select throws_ok($$select public.accept_shift_offer((select id from ids where name = 's2'))$$,
                 'P0001', 'not_allowed', 'a suspended caregiver cannot take a shift with an open offer');

select tests.clear_authentication();
select is((select status::text from public.shifts where id = (select id from ids where name = 's1')), 'assigned',
          'shift 1 is assigned to the caregiver who took it');
select is((select status::text from public.shifts where id = (select id from ids where name = 's2')), 'offered',
          'shift 2 is not taken');

select * from finish();
rollback;
