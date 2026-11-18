-- Acceptance paths and the provider's agenda: accept_proposal refuses a period inside a care shift the
-- provider holds (assigned or checked in), and accept_shift_offer refuses a shift that overlaps a booking
-- of the caregiver in an agenda status, both with slot_unavailable. A period that only touches the other
-- one is accepted. The refused calls write no row.
begin;
select plan(16);
select has_function('tests', 'setup_fixture', 'test helpers are installed (run 00_helpers first)');
select tests.setup_fixture();

-- Provider C also holds the care occupation (approved), so that it can take care shifts.
insert into public.provider_occupations (provider_id, occupation_slug, is_primary, approved) values
  (tests.uid('provider_c'), 't-cuidado', false, true);

-- A household of client B owns the shifts.
insert into public.households (id, owner_id, name) values (md5('h124')::uuid, tests.uid('client_b'), 'Casa de teste');

-- ---------------------------------------------------------------- accept_proposal
-- Provider C, week 47: a shift assigned from 10:00 to 12:00 and one checked in from 14:00 to 15:00 (Monday).
insert into public.shifts (id, household_id, period, rate_cents, status, provider_id) values
  (md5('s124-assigned')::uuid, md5('h124')::uuid, tests.sp_period(tests.at(47, 0, '10:00'), 2), 30000, 'assigned', tests.uid('provider_c')),
  (md5('s124-checked')::uuid, md5('h124')::uuid, tests.sp_period(tests.at(47, 0, '14:00'), 1), 30000, 'checked_in', tests.uid('provider_c'));

-- Four requests of client A, each with a proposal of provider C.
insert into public.requests (id, client_id, occupation_slug, neighborhood_id, description) values
  (md5('s124-req-a')::uuid, tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido de teste A'),
  (md5('s124-req-b')::uuid, tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido de teste B'),
  (md5('s124-req-c')::uuid, tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido de teste C'),
  (md5('s124-req-d')::uuid, tests.uid('client_a'), 't-reparo', tests.neighborhood('t-bairro-1'), 'Pedido de teste D');

select tests.authenticate_as('provider_c');
insert into public.proposals (id, request_id, price_cents) values
  (md5('s124-prop-a')::uuid, md5('s124-req-a')::uuid, 9000),
  (md5('s124-prop-b')::uuid, md5('s124-req-b')::uuid, 9000),
  (md5('s124-prop-c')::uuid, md5('s124-req-c')::uuid, 9000),
  (md5('s124-prop-d')::uuid, md5('s124-req-d')::uuid, 9000);

select tests.authenticate_as('client_a');
select throws_ok($$select public.accept_proposal(md5('s124-prop-a')::uuid, tests.sp_period(tests.at(47, 0, '09:30'), 1))$$,
                 'P0001', 'slot_unavailable', 'a proposal for a period inside an assigned shift is refused');
select throws_ok($$select public.accept_proposal(md5('s124-prop-b')::uuid, tests.sp_period(tests.at(47, 0, '14:30'), 1))$$,
                 'P0001', 'slot_unavailable', 'a proposal for a period inside a checked-in shift is refused');
select lives_ok($$select public.accept_proposal(md5('s124-prop-c')::uuid, tests.sp_period(tests.at(47, 0, '08:00'), 2))$$,
                'a period that ends when the assigned shift starts is accepted');
select lives_ok($$select public.accept_proposal(md5('s124-prop-d')::uuid, tests.sp_period(tests.at(47, 0, '12:00'), 1))$$,
                'a period that starts when the assigned shift ends is accepted');

-- ---------------------------------------------------------------- accept_shift_offer
-- Provider C has an accepted booking on Tuesday of week 47, from 10:00 to 12:00.
select tests.clear_authentication();
select tests.make_booking('provider_c', 'client_a', 't-reparo', tests.sp_period(tests.at(47, 1, '10:00'), 2), 'accepted');

-- Three shifts offered to provider C: one that overlaps the booking, one that starts when it ends, one that ends when it starts.
insert into public.shifts (id, household_id, period, rate_cents, status) values
  (md5('s124-offer-overlap')::uuid, md5('h124')::uuid, tests.sp_period(tests.at(47, 1, '11:00'), 2), 30000, 'offered'),
  (md5('s124-offer-after')::uuid, md5('h124')::uuid, tests.sp_period(tests.at(47, 1, '12:00'), 2), 30000, 'offered'),
  (md5('s124-offer-before')::uuid, md5('h124')::uuid, tests.sp_period(tests.at(47, 1, '08:00'), 2), 30000, 'offered');
insert into public.shift_offers (shift_id, provider_id, status) values
  (md5('s124-offer-overlap')::uuid, tests.uid('provider_c'), 'offered'),
  (md5('s124-offer-after')::uuid, tests.uid('provider_c'), 'offered'),
  (md5('s124-offer-before')::uuid, tests.uid('provider_c'), 'offered');

select tests.authenticate_as('provider_c');
select throws_ok($$select public.accept_shift_offer(md5('s124-offer-overlap')::uuid)$$,
                 'P0001', 'slot_unavailable', 'a shift offer that overlaps an accepted booking is refused');
select is(public.accept_shift_offer(md5('s124-offer-after')::uuid)::text, 'assigned',
          'a shift that starts when the booking ends is accepted');
select is(public.accept_shift_offer(md5('s124-offer-before')::uuid)::text, 'assigned',
          'a shift that ends when the booking starts is accepted');

-- ---------------------------------------------------------------- refused calls write nothing
select tests.clear_authentication();
select is((select status::text from public.proposals where id = md5('s124-prop-a')::uuid), 'sent',
          'the refused proposal (assigned shift) stays sent');
select is((select status::text from public.proposals where id = md5('s124-prop-b')::uuid), 'sent',
          'the refused proposal (checked-in shift) stays sent');
select is((select count(*)::int from public.bookings
            where proposal_id in (md5('s124-prop-a')::uuid, md5('s124-prop-b')::uuid)), 0,
          'the refused proposals wrote no booking');
select is((select count(*)::int from public.bookings
            where proposal_id in (md5('s124-prop-c')::uuid, md5('s124-prop-d')::uuid)), 2,
          'the two accepted proposals wrote one booking each');
select is((select status::text from public.shifts where id = md5('s124-offer-overlap')::uuid), 'offered',
          'the refused shift stays offered');
select ok((select provider_id is null from public.shifts where id = md5('s124-offer-overlap')::uuid),
          'and it has no caregiver');
select is((select status::text from public.shift_offers
            where shift_id = md5('s124-offer-overlap')::uuid and provider_id = tests.uid('provider_c')), 'offered',
          'the offer of the refused shift to provider C stays offered');
select is((select count(*)::int from public.shifts
            where id in (md5('s124-offer-after')::uuid, md5('s124-offer-before')::uuid)
              and status = 'assigned' and provider_id = tests.uid('provider_c')), 2,
          'the two accepted shifts are assigned to provider C');

select * from finish();
rollback;
