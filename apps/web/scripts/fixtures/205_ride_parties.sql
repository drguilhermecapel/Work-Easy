-- Loaded only in a fresh disposable clone by scripts/test-ride-party-races.mjs, after the
-- reference rows the migrations seed (routes, tariff, gates). Fictitious data, built
-- through the product's own RPCs. What a race needs fresh (quotes) is made by the script.
select tests.setup_fixture();
select tests.create_user(k) from unnest(array['fam_owner','fam_m0','fam_m1','fam_m2','org_owner','org_m0','org_m1','org_m2','org_m3','org_m4',
 'guest','sponsor','rider_1','rider_2','rider_3','fleet_owner','fleet_d1','fleet_d2','rider_f1','rider_f2','driver_x','finance_b']) k;
insert into public.admins(user_id) values(tests.uid('finance_b'));
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
update private.ride_dispatch_rules set wave_size=6 where environment='simulation';
create table tests.race_refs(k text primary key,v text not null);
grant select,insert on tests.race_refs to authenticated;
create function tests.ref(p text) returns text language sql stable as $$select v from tests.race_refs where k=p$$;
create function tests.trip() returns jsonb language sql immutable as $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
-- A leg taken and completed by a driver outside every fleet, without the steps in between.
-- Its id is kept under p_leg, because a rider's session does not read the legs table.
create function tests.complete_leg(p_quote text,p_leg text) returns void language sql as $$
 update public.ride_legs set driver_id=tests.uid('driver_x'),status='completed' where source_quote_id=tests.ref(p_quote)::uuid;
 insert into tests.race_refs select p_leg,id::text from public.ride_legs where source_quote_id=tests.ref(p_quote)::uuid$$;
revoke all on function tests.complete_leg(text,text) from public;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 select tests.uid(d),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true from unnest(array['driver_x','fleet_d1','fleet_d2']) d;
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity)
 select 'simulation','Saúde','Jabaquara',m,'ensaio de disputa',tstzrange(now()-interval '1 day',now()+interval '1 day') from unnest(array['pix','benefit']) m;
insert into tests.race_refs select k,gen_random_uuid()::text from unnest(array['p_last','p_work','p_guest','guest_key','invite_1','invite_2','invite_3','cession_1','cession_2']) k;
-- The month the invoice race closes: ended, and far from any month boundary of this run.
insert into tests.race_refs select 'month',(private.ride_month(now())-interval '2 months')::date::text;
insert into tests.race_refs select 'documents_until',(private.sp_date(now())+60)::text;
-- Every family ride leaves at this one scheduled time, so all of them count in the same
-- month of the limit even when the run crosses a month boundary.
insert into tests.race_refs select 'family_at',(now()+interval '3 hours')::text;
insert into tests.race_refs select 'family_month',private.ride_month(tests.ref('family_at')::timestamptz)::text;

-- Reference fare of the corridor, read from an ordinary quote.
select tests.authenticate_as('driver_x');
insert into tests.race_refs select 'x',public.ride_quote(gen_random_uuid(),null,null,tests.trip())->>'total_cents';

-- (a) A family whose limit holds two fares and a half. One fare is already committed, so
-- exactly one more fits: the last slice.
select tests.authenticate_as('fam_owner');
insert into tests.race_refs select 'family',public.ride_create_family('Família de ensaio',tests.ref('x')::int*5/2,'pix',gen_random_uuid())::text;
insert into tests.race_refs select 'join_'||m,public.ride_invite_member(tests.ref('family')::uuid,m||'@test.local','member',60,gen_random_uuid())->>'token'
 from unnest(array['fam_m0','fam_m1','fam_m2']) m;
select tests.authenticate_as('fam_m0'); select public.ride_join_account(tests.ref('join_fam_m0'),true);
insert into tests.race_refs select 'mandate_fam_m0',public.ride_my_accounts()->0->>'mandate_id';
select tests.authenticate_as('fam_m1'); select public.ride_join_account(tests.ref('join_fam_m1'),true);
insert into tests.race_refs select 'mandate_fam_m1',public.ride_my_accounts()->0->>'mandate_id';
select tests.authenticate_as('fam_m2'); select public.ride_join_account(tests.ref('join_fam_m2'),true);
insert into tests.race_refs select 'mandate_fam_m2',public.ride_my_accounts()->0->>'mandate_id';
select tests.authenticate_as('fam_m0');
select public.ride_consent((public.ride_quote_sponsored(gen_random_uuid(),tests.ref('family_at')::timestamptz,tests.trip(),tests.ref('mandate_fam_m0')::uuid)->>'id')::uuid,true);

-- (b) (c) (d) (e) A company conferred by the operation, one cost center and three programs.
select tests.authenticate_as('org_owner');
insert into tests.race_refs select 'org',public.ride_create_organization('Empresa de ensaio',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select public.admin_verify_ride_account(tests.ref('org')::uuid,'ficticio-o17-e5',now()+interval '30 days');
select tests.authenticate_as('org_owner');
insert into tests.race_refs select 'cc',public.ride_save_cost_center(tests.ref('org')::uuid,'GERAL','Geral',true)::text;
insert into tests.race_refs select 'join_'||m,public.ride_invite_member(tests.ref('org')::uuid,m||'@test.local','member',60,gen_random_uuid())->>'token'
 from unnest(array['org_m0','org_m1','org_m2','org_m3','org_m4']) m;
select tests.authenticate_as('org_m0'); select public.ride_join_account(tests.ref('join_org_m0'),true);
select tests.authenticate_as('org_m1'); select public.ride_join_account(tests.ref('join_org_m1'),true);
select tests.authenticate_as('org_m2'); select public.ride_join_account(tests.ref('join_org_m2'),true);
select tests.authenticate_as('org_m3'); select public.ride_join_account(tests.ref('join_org_m3'),true);
select tests.authenticate_as('org_m4'); select public.ride_join_account(tests.ref('join_org_m4'),true);
select tests.authenticate_as('admin');
-- p_last: budget of two fares and a half; one fare is reserved below, so one more fits.
select public.admin_save_ride_voucher_program(tests.ref('p_last')::uuid,tests.ref('org')::uuid,'Último saldo',tests.ref('x')::int*5/2,tests.ref('x')::int,null,null,null,null,
 now()-interval '1 hour',now()+interval '5 days','none',false,'ficticio','ficticio',true);
select public.admin_save_ride_voucher_program(tests.ref(p)::uuid,tests.ref('org')::uuid,p,tests.ref('x')::int*20,tests.ref('x')::int,null,null,null,null,
 now()-interval '1 hour',now()+interval '5 days','none',false,'ficticio','ficticio',true) from unnest(array['p_work','p_guest']) p;
select tests.authenticate_as('org_m0');
select public.ride_consent((public.ride_quote_funded(gen_random_uuid(),null,tests.trip(),tests.ref('p_last')::uuid,tests.ref('cc')::uuid)->>'id')::uuid,true);
-- (c) One completed leg whose voucher nobody used yet.
select tests.authenticate_as('org_m3');
insert into tests.race_refs select 'q_redeem',public.ride_quote_funded(gen_random_uuid(),null,tests.trip(),tests.ref('p_work')::uuid,tests.ref('cc')::uuid)->>'id';
select public.ride_consent(tests.ref('q_redeem')::uuid,true);
select tests.clear_authentication();
select tests.complete_leg('q_redeem','leg_redeem');
-- (d) Two completed legs with the voucher used, moved to the month the race closes.
select tests.authenticate_as('org_m4');
insert into tests.race_refs select 'q_bill1',public.ride_quote_funded(gen_random_uuid(),null,tests.trip(),tests.ref('p_work')::uuid,tests.ref('cc')::uuid)->>'id';
select public.ride_consent(tests.ref('q_bill1')::uuid,true);
select tests.clear_authentication();
select tests.complete_leg('q_bill1','leg_bill1');
select tests.authenticate_as('org_m4');
insert into tests.race_refs select 'q_bill2',public.ride_quote_funded(gen_random_uuid(),null,tests.trip(),tests.ref('p_work')::uuid,tests.ref('cc')::uuid)->>'id';
select public.ride_consent(tests.ref('q_bill2')::uuid,true);
select tests.clear_authentication();
select tests.complete_leg('q_bill2','leg_bill2');
select tests.authenticate_as('org_m4');
select public.ride_redeem_voucher(tests.ref(l)::uuid,'pix') from unnest(array['leg_bill1','leg_bill2']) l;
select tests.clear_authentication();
update private.ride_order_events e set at=((tests.ref('month')::date+9)::timestamp+interval '12 hours') at time zone 'America/Sao_Paulo'
 from private.ride_payment_orders o where e.order_id=o.id and e.action='benefit' and o.leg_id in (tests.ref('leg_bill1')::uuid,tests.ref('leg_bill2')::uuid);
-- (e) A guest invited by the company's desk.
select tests.authenticate_as('org_owner');
insert into tests.race_refs select 'guest_token',public.ride_invite_guest(tests.ref('org')::uuid,tests.ref('p_guest')::uuid,tests.ref('cc')::uuid,'guest@test.local',
 tests.trip(),null,60,tests.ref('guest_key')::uuid)->>'token';

-- (e) Three rides asked for other adults: one invite per recipient.
select tests.authenticate_as('sponsor');
insert into tests.race_refs select 'token_'||n,public.ride_invite_rider((public.ride_quote(gen_random_uuid(),null,null,tests.trip())->>'id')::uuid,
 'rider_'||n||'@test.local',60,null,tests.ref('invite_'||n)::uuid)->>'token' from generate_series(1,3) n;

-- (f) A fleet conferred by the operation: two vehicles, two drivers, two approved cessions.
select tests.clear_authentication();
insert into private.ride_vehicle_capacity(driver_id,vehicle,document_ref,seats,tools,accessible,valid_until)
 select tests.uid('fleet_d'||n),'sedan','FROTA-00'||n,4,false,false,now()+interval '60 days' from generate_series(1,2) n;
select tests.authenticate_as('fleet_owner');
insert into tests.race_refs select 'fleet',public.ride_create_fleet('Frota de ensaio',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select public.admin_verify_ride_account(tests.ref('fleet')::uuid,'ficticio-o17-e5',now()+interval '30 days');
select tests.authenticate_as('fleet_owner');
insert into tests.race_refs select 'join_fleet_d'||n,public.ride_invite_member(tests.ref('fleet')::uuid,'fleet_d'||n||'@test.local','fleet_driver',60,gen_random_uuid())->>'token'
 from generate_series(1,2) n;
insert into tests.race_refs select 'vehicle_'||n,public.ride_fleet_save_vehicle(tests.ref('fleet')::uuid,'FROTA-00'||n,'sedan','DOC-'||n,'APOLICE-'||n,'VISTORIA-'||n,
 d.until,d.until,d.until)::text from generate_series(1,2) n,(select tests.ref('documents_until')::date as until) d;
select tests.authenticate_as('fleet_d1'); select public.ride_join_account(tests.ref('join_fleet_d1'),true);
select tests.authenticate_as('fleet_d2'); select public.ride_join_account(tests.ref('join_fleet_d2'),true);
select tests.authenticate_as('fleet_owner');
select public.ride_fleet_assign(tests.ref('vehicle_'||n)::uuid,tests.uid('fleet_d'||n),'CESSAO-'||n,'fleet',now()-interval '1 hour',now()+interval '30 days',
 tests.ref('cession_'||n)::uuid) from generate_series(1,2) n;
select tests.authenticate_as('admin');
select public.admin_review_fleet_assignment(tests.ref('cession_'||n)::uuid,true,'DOSSIE-'||n) from generate_series(1,2) n;
select tests.clear_authentication();
