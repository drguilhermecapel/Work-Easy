begin;
select plan(12);
select tests.setup_fixture();
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_enroll(gen_random_uuid(),'public','Zona 1')$$,
                'P0001',null,'only operations can enrol a request');
select is(public.ride_push_ready(),false,'fixture project cannot send push');
select is(public.ride_can_transmit(gen_random_uuid()),false,'GPS is off outside a live assigned leg');
select throws_ok($$select public.ride_send_position(gen_random_uuid(),now(),-23.5,-46.6,4)$$,
                 'P0001','transmission_ended','unassigned client cannot store a position');
select throws_ok($$select public.ride_progress(gen_random_uuid())$$,'P0001','not_allowed','unknown leg stays private');
select tests.authenticate_as('admin');
select ok(public.ride_enroll('70000000-1234-4321-8123-000000000001','services','montagem | zona A | manhã') in ('offer','comparison'),'randomized service assignment');
select is(public.ride_enroll('70000000-1234-4321-8123-000000000002','public','zona A'),
          'public','standalone requests have a separate denominator');
select is(public.ride_enroll('70000000-1234-4321-8123-000000000002','public','zona A'),
          'public','resubmitting the same request preserves arm and denominator');
select throws_ok($$select public.ride_enroll('70000000-1234-4321-8123-000000000002','services','zona A')$$,'P0001','idempotency_conflict','arm cannot be shopped');
select lives_ok($$select public.ride_close_observation('70000000-1234-4321-8123-000000000002',false,-600,7)$$,'a cancelled ride retains its margin and support burden');
select is((select e->>'cents_per_eligible' from jsonb_array_elements(public.ride_pilot_report()->'rows') e where e->>'market'='public')::numeric,-600::numeric,'cancelled cost in numerator');
select ok((select (e->>'cents_per_eligible') is null from jsonb_array_elements(public.ride_pilot_report()->'rows') e where e->>'market'='services'),'open outcomes leave contribution undetermined');
select * from finish();
rollback;
