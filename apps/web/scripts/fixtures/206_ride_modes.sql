-- Loaded only in a fresh disposable clone by scripts/test-ride-mode-races.mjs (through psql: \gset is used).
-- The clone has the schema and no migration seed, so every reference row below is written here and is
-- fictitious. Legs, seats and proposals are created through the public RPCs, as the people would.
insert into private.ride_deployment(environment) values('simulation');
insert into private.ride_network(environment) values('simulation');
insert into private.ride_tariffs(environment,valid_from,base_cents,km_cents,minute_cents,minimum_cents,commission_bps) values('simulation','2020-01-01Z',400,200,20,1000,1000);
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
insert into private.ride_dispatch_rules(environment,enabled,wave_size,lifetime_seconds,external_navigation) values('simulation',true,6,90,true);
insert into private.ride_markets(environment,code,country,city,language,currency,minor_unit,timezone)
  values('simulation','ensaio','BR','Cidade de ensaio','pt-BR','BRL',2,'America/Sao_Paulo');
insert into private.ride_market_areas(environment,market,area) select 'simulation','ensaio',a from unnest(array['Saúde','Jabaquara']) a;
insert into private.ride_modalities(code,par,label,operational,flow,position) values('reserve','PAR-604','Reserva',true,'reserve',4),
  ('van','PAR-604','Van individual',true,'class',6),('shuttle_seat','PAR-604','Assento em linha de van',true,'shuttle',7),('hourly','PAR-606','Por hora',true,'block',8);
insert into private.ride_market_modalities(environment,market,modality,status,source_url,consulted_on,note,authorization_ref,valid_until)
  select 'simulation','ensaio',code,'pilot','https://example.invalid/206-races','2026-11-27','Ensaio de concorrência com dados fictícios.','ficticio-206-races','infinity'
  from private.ride_modalities;
insert into private.ride_routes(environment,origin,destination,meters,minutes) values('simulation','Saúde','Jabaquara',4400,18),('simulation','Jabaquara','Saúde',4400,18);
insert into private.ride_approach_routes(environment,origin_area,destination_area,minutes,reference,valid_until,meters)
  select 'simulation',o,d,case when o=d then 5 else 18 end,'ficticio-206-races','infinity',case when o=d then 800 else 4400 end
  from unnest(array['Saúde','Jabaquara']) o cross join unnest(array['Saúde','Jabaquara']) d;
insert into private.ride_reserve_policies(environment,area,min_lead_minutes,confirm_lead_minutes,max_shift_minutes,evidence_ref,valid_until,enabled)
  select 'simulation',a,60,30,180,'ficticio-206-races','infinity',true from unnest(array['Saúde','Jabaquara']) a;
insert into private.ride_block_tariffs(environment,area,code,minutes,included_km,block_cents,extra_15min_cents,extra_km_cents,evidence_ref,valid_until)
  values('simulation','Saúde','1h',60,20,9000,2000,300,'ficticio-206-races','infinity');
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
  select tests.uid(u),'simulation','sedan','approved',(now() at time zone 'America/Sao_Paulo')::date+5,tests.uid('admin'),true
  from unnest(array['provider_a','provider_b','provider_c','provider_d']) u;
-- Seats: one line and its departures. A: 3 seats, free. B1 and B2: 2 seats, 1 sold. C1 -> C2: two seats want
-- the last place of C2. X1 <-> X2: two seats cross between departures with room.
insert into private.ride_shuttle_lines(id,environment,origin_area,destination_area,operator_ref,seat_cents,minutes,evidence_ref,valid_until,enabled)
  values(md5('206-race-line')::uuid,'simulation','Saúde','Jabaquara','ficticio-206-races',1500,40,'ficticio-206-races','infinity',true);
insert into private.ride_shuttle_departures(id,line_id,departs_at,seats_total)
  select md5('206-race-departure-'||d.k)::uuid,md5('206-race-line')::uuid,date_trunc('hour',now())+interval '2 days'+make_interval(hours=>d.n),d.seats
  from (values('a',1,3),('b1',2,2),('b2',7,2),('c1',3,4),('c2',4,2),('x1',5,4),('x2',6,4)) d(k,n,seats);
select tests.authenticate_as('client_a');
select public.ride_book_shuttle_seat(md5('206-race-departure-c1')::uuid,1,1500,md5('206-race-seat-c-a')::uuid);
select public.ride_book_shuttle_seat(md5('206-race-departure-x1')::uuid,1,1500,md5('206-race-seat-x-a')::uuid);
select tests.authenticate_as('client_b');
select public.ride_book_shuttle_seat(md5('206-race-departure-b1')::uuid,1,1500,md5('206-race-seat-b1-b')::uuid);
select public.ride_book_shuttle_seat(md5('206-race-departure-b2')::uuid,1,1500,md5('206-race-seat-b2-b')::uuid);
select public.ride_book_shuttle_seat(md5('206-race-departure-c1')::uuid,1,1500,md5('206-race-seat-c-b')::uuid);
select public.ride_book_shuttle_seat(md5('206-race-departure-x2')::uuid,1,1500,md5('206-race-seat-x-b')::uuid);
select tests.authenticate_as('provider_a');
select public.ride_book_shuttle_seat(md5('206-race-departure-c2')::uuid,1,1500,md5('206-race-seat-c-other')::uuid);

-- Reserves E1 to E4 of the same passenger: each confirmed by a driver, each with a new time waiting for the
-- driver's answer (the script ends the answer window of E2 and E3 right before racing them).
create function pg_temp.reserve(p_label text,p_driver text,p_origin text,p_destination text,p_at timestamptz) returns void language plpgsql as $$
declare v_ride uuid; v_leg uuid;
begin
  perform tests.authenticate_as('client_a');
  v_ride:=(public.ride_consent((public.ride_quote(md5('206-race-quote-'||p_label)::uuid,null,p_at,jsonb_build_array(
    jsonb_build_object('origin',p_origin,'destination',p_destination,'payer','passenger')))->>'id')::uuid,true)->>'ride_id')::uuid;
  perform tests.clear_authentication();
  select id into strict v_leg from public.ride_legs where ride_id=v_ride;
  perform tests.authenticate_as(p_driver);
  perform public.ride_accept_offer(v_leg,md5('206-race-accept-'||p_label)::uuid);
  perform tests.authenticate_as('client_a');
  perform public.ride_shift_reservation(v_leg,p_at+interval '30 minutes','passenger',md5('206-race-shift-'||p_label)::uuid);
  perform tests.clear_authentication();
end $$;
select pg_temp.reserve('e1','provider_c','Saúde','Jabaquara',now()+interval '5 hours');
select pg_temp.reserve('e2','provider_b','Jabaquara','Saúde',now()+interval '9 hours');
select pg_temp.reserve('e3','provider_a','Saúde','Jabaquara',now()+interval '13 hours');
select pg_temp.reserve('e4','provider_c','Jabaquara','Saúde',now()+interval '17 hours');

-- Block D: one hour with a driver and a 30-minute extension proposed by the payer.
select tests.authenticate_as('client_b');
select public.ride_consent((public.ride_quote_block(md5('206-race-quote-d')::uuid,now()+interval '26 hours','Saúde','Jabaquara','1h')->>'id')::uuid,true)->>'ride_id' as ride \gset
select tests.clear_authentication();
select id as leg from public.ride_legs where ride_id=:'ride' \gset
select tests.authenticate_as('provider_d');
select public.ride_accept_offer(:'leg',md5('206-race-accept-d')::uuid);
select tests.authenticate_as('client_b');
select public.ride_propose_extension(:'leg',30,0,md5('206-race-extension-d')::uuid);
select tests.clear_authentication();

-- Class F: one van class at Jabaquara, one approved van on shift there and two measured routes of two
-- passengers. The choice of the class, the bookings and the assignment are raced by the script.
insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,luggage,standard,electric,pets,priority_wait_minutes,modality,valid_until,evidence_ref)
  values('simulation','Jabaquara','van','Van',900,8,6,'standard',false,false,null,'van','infinity','ficticio-206-races');
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
  values(tests.uid('provider_e'),'simulation','van','approved',(now() at time zone 'America/Sao_Paulo')::date+5,tests.uid('admin'),false);
select tests.authenticate_as('client_a');
select public.ride_prepare_route(md5('206-race-route-f-a')::uuid,null,'Jabaquara','Saúde',jsonb_build_object('lat',-23.60,'lng',-46.64,'label','Embarque de ensaio'),
  jsonb_build_object('lat',-23.61,'lng',-46.65,'label','Destino de ensaio'),null)->>'id' as route_a \gset
select tests.authenticate_as('client_b');
select public.ride_prepare_route(md5('206-race-route-f-b')::uuid,null,'Jabaquara','Saúde',jsonb_build_object('lat',-23.60,'lng',-46.64,'label','Embarque de ensaio'),
  jsonb_build_object('lat',-23.61,'lng',-46.65,'label','Destino de ensaio'),null)->>'id' as route_b \gset
select tests.authenticate_as('admin');
select public.ride_claim_route(r::uuid),public.ride_verify_route(r::uuid,4400,18,'ficticio-206-races') from unnest(array[:'route_a',:'route_b']) r;
select public.ride_validate_capacity(tests.uid('provider_e'),8,false,false,now()+interval '2 days','ficticio-206-races');
select public.ride_validate_vehicle_features(tests.uid('provider_e'),6,'standard','combustion',false,'ficticio-206-races');
select tests.authenticate_as('provider_e');
select public.ride_configure_shift('Jabaquara',now(),now()+interval '8 hours');
select public.ride_set_online(true);
select tests.clear_authentication();
