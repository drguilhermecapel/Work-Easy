-- PAR-508 (O17 etapa 5): frotas, sobre 20261127110506. A frota é uma camada sobre o motorista:
-- diz qual veículo ele dirige, sob qual cessão e até quando. Troca de motorista, veículo vencido
-- ou documento renovado bloqueiam novas ofertas até a revisão da operação. O frotista confere só
-- os próprios veículos e os trechos feitos com eles; corridas de outra frota e as do motorista
-- como autônomo ficam protegidas. Dados fictícios, sem rede.
begin;
select no_plan();
select tests.setup_fixture();
select tests.create_user('fleet_mgr_a');
select tests.create_user('fleet_mgr_b');
select tests.create_user('indep_driver');
select tests.create_user('rider_c');
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
update private.ride_dispatch_rules set wave_size=6 where environment='simulation';
create temp table t(k text primary key,v text not null);
grant select,insert on t to authenticated,anon;
create function pg_temp.g(p text) returns text language sql stable as $$select t.v from t where t.k=p$$;
create function pg_temp.u(p text) returns uuid language sql stable as $$select t.v::uuid from t where t.k=p$$;
create function pg_temp.trip() returns jsonb language sql immutable as $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
create function pg_temp.today() returns date language sql stable security definer as $$select private.sp_date(now())$$;
create function pg_temp.fleet(p_id uuid) returns jsonb language sql as $$select a from jsonb_array_elements(public.ride_my_accounts()) a where a->>'id'=p_id::text$$;
create function pg_temp.month_of(p_leg text) returns date language sql stable security definer as $$
 select private.ride_month(l.pickup_at) from public.ride_legs l join t on t.v=l.id::text where t.k=p_leg$$;
grant execute on function pg_temp.g(text),pg_temp.u(text),pg_temp.trip(),pg_temp.today(),pg_temp.fleet(uuid),pg_temp.month_of(text) to authenticated,anon;
-- Lidos só pelo dono do teste: a regra completa, a regra anterior às partes e a regra da frota.
create function pg_temp.eligible(p_driver text,p_leg text) returns boolean language sql as $$
 select private.ride_offer_eligible(tests.uid(p_driver),l) from public.ride_legs l where l.id=pg_temp.u(p_leg)$$;
create function pg_temp.before_parties(p_driver text,p_leg text) returns boolean language sql as $$
 select private.ride_before_parties_eligible(tests.uid(p_driver),l) from public.ride_legs l where l.id=pg_temp.u(p_leg)$$;
create function pg_temp.fleet_rule(p_driver text,p_leg text) returns boolean language sql as $$
 select private.ride_fleet_can_serve(tests.uid(p_driver),l) from public.ride_legs l where l.id=pg_temp.u(p_leg)$$;
create function pg_temp.offered(p_driver text,p_leg text) returns bigint language sql as $$
 select count(*) from private.ride_driver_offers where leg_id=pg_temp.u(p_leg) and driver_id=tests.uid(p_driver) and state='offered'$$;
create function pg_temp.status(p_assignment text) returns text language sql as $$select status from private.ride_fleet_assignments where id=pg_temp.u(p_assignment)$$;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 select tests.uid(d),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true from unnest(array['provider_c','provider_d','provider_e','indep_driver']) d;
-- O identificador inspecionado pela operação para cada motorista: os dois da frota A dirigem o mesmo veículo.
insert into private.ride_vehicle_capacity(driver_id,vehicle,document_ref,seats,tools,accessible,valid_until)
 select tests.uid(x.d),'sedan',x.ref,4,false,false,now()+interval '60 days'
 from (values('provider_c','FROTA-A-001'),('provider_d','FROTA-A-001'),('provider_e','FROTA-B-001'),('indep_driver','PARTICULAR-01')) x(d,ref);
insert into t select k,gen_random_uuid()::text from unnest(array['fa_key','a1','a2','a3','a4','a5','ab','ab0','end1','end4','endb0','leave_c']) k;

-- Portão e minimização: a capacidade de frota só existe no ensaio; nada de documento pessoal.
select is((select count(*) from private.ride_party_rules where environment='simulation' and capability='fleet' and enabled and evidence_ref='ficticio-o17-e5'
  and area in ('Saúde','Jabaquara')),2::bigint,'o ensaio tem a capacidade de frota com evidência fictícia nas duas praças');
select is((select count(*) from private.ride_party_rules where environment='live' and capability='fleet'),0::bigint,'produção não recebe nenhuma linha de frota');
select ok(not private.ride_party_allowed('live','fleet',null,null,now()),'em produção nenhuma frota é aberta');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relrowsecurity
  and c.relname in ('ride_fleet_vehicles','ride_fleet_assignments','ride_leg_vehicles')),3::bigint,'as três tabelas ficam com RLS ligada');
select is((select count(*) from information_schema.columns where table_schema='private' and table_name in ('ride_fleet_vehicles','ride_fleet_assignments','ride_leg_vehicles')
  and column_name ~ 'cpf|cnh|phone|mail|birth|origin|destination|passenger'),0::bigint,'as tabelas da frota não guardam documento pessoal, contato, trajeto nem passageiro');

-- Antes de entrar em qualquer frota, o futuro motorista da frota A faz uma corrida como autônomo.
select tests.authenticate_as('client_b');
insert into t select 'r0',public.ride_consent((public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id')::uuid,true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg0',id::text from public.ride_legs where ride_id=pg_temp.u('r0');
select ok(pg_temp.eligible('provider_c','leg0') and pg_temp.fleet_rule('provider_c','leg0'),'fora de frota, o motorista é elegível como sempre foi');
select tests.authenticate_as('provider_c');
select lives_ok($$select public.ride_accept_offer(pg_temp.u('leg0'),gen_random_uuid())$$,'o motorista aceita a corrida como autônomo');
select lives_ok($$select public.ride_transition(pg_temp.u('leg0'),'arriving',gen_random_uuid())$$,'e segue para o embarque');
select tests.authenticate_as('client_b');
insert into t select 'pin0',public.ride_issue_pin(pg_temp.u('leg0'))->>'pin';
select tests.authenticate_as('provider_c');
select is(public.ride_verify_boarding(pg_temp.u('leg0'),pg_temp.g('pin0'),gen_random_uuid())->>'ok','true','a passageira embarca na corrida particular');
select is(public.ride_transition(pg_temp.u('leg0'),'completed',gen_random_uuid())->>'status','completed','a corrida particular é concluída antes de existir cessão');
select tests.clear_authentication();
select is((select count(*) from private.ride_leg_vehicles),0::bigint,'corrida de motorista autônomo não cria vínculo com veículo de frota');

-- Abertura da frota: idempotente, e parada até a conferência da operação.
select tests.authenticate_as('provider_a');
insert into t select 'fa',public.ride_create_fleet('  Frota A ',pg_temp.u('fa_key'))::text;
select is(public.ride_create_fleet('Frota A',pg_temp.u('fa_key')),pg_temp.u('fa'),'repetir a abertura devolve a mesma frota');
select throws_ok($$select public.ride_create_fleet('Outra frota',pg_temp.u('fa_key'))$$,'P0001','idempotency_conflict','mesma chave com outro nome é conflito');
select throws_ok($$select public.ride_create_fleet('   ',gen_random_uuid())$$,'P0001','invalid_input','frota sem nome é recusada');
select throws_ok($$select public.ride_create_fleet('Frota sem chave',null)$$,'P0001','invalid_input','abertura sem chave é recusada');
select is(pg_temp.fleet(pg_temp.u('fa'))->>'kind','fleet','a conta aparece como frota para quem abriu');
select is(pg_temp.fleet(pg_temp.u('fa'))->>'name','Frota A','o nome é guardado sem espaços nas pontas');
select is(pg_temp.fleet(pg_temp.u('fa'))->>'role','admin','quem abre a frota responde por ela');
select is(pg_temp.fleet(pg_temp.u('fa'))->>'verified','false','a frota nasce sem conferência da operação');
select throws_ok($$select public.ride_invite_member(pg_temp.u('fa'),'provider_c@test.local','fleet_driver',60,gen_random_uuid())$$,'P0001','ride_feature_disabled','frota sem conferência não convida motorista');
select throws_ok($$select public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-001','sedan','DOC-A1','APOLICE-A1','VISTORIA-A1',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)$$,
 'P0001','ride_feature_disabled','frota sem conferência não cadastra veículo');
select tests.authenticate_as('provider_b');
insert into t select 'fb',public.ride_create_fleet('Frota B',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select ok(public.admin_verify_ride_account(pg_temp.u('fa'),'CONTRATO-205D-A',now()+interval '90 days'),'a operação confere a frota A');
select ok(public.admin_verify_ride_account(pg_temp.u('fb'),'CONTRATO-205D-B',now()+interval '90 days'),'a operação confere a frota B');

-- Adesão pelo convite de conta: o motorista entra com o papel fleet_driver.
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_invite_member(pg_temp.u('fa'),'provider_c@test.local','member',60,gen_random_uuid())$$,'P0001','invalid_input','frota só convida gestor ou motorista da frota');
insert into t select 'inv_c',public.ride_invite_member(pg_temp.u('fa'),'provider_c@test.local','fleet_driver',60,gen_random_uuid())->>'token';
insert into t select 'inv_d',public.ride_invite_member(pg_temp.u('fa'),'provider_d@test.local','fleet_driver',60,gen_random_uuid())->>'token';
insert into t select 'inv_ma',public.ride_invite_member(pg_temp.u('fa'),'fleet_mgr_a@test.local','manager',60,gen_random_uuid())->>'token';
select tests.authenticate_as('provider_b');
insert into t select 'inv_e',public.ride_invite_member(pg_temp.u('fb'),'provider_e@test.local','fleet_driver',60,gen_random_uuid())->>'token';
insert into t select 'inv_mb',public.ride_invite_member(pg_temp.u('fb'),'fleet_mgr_b@test.local','manager',60,gen_random_uuid())->>'token';
select tests.authenticate_as('provider_c');
select is(public.ride_join_account(pg_temp.g('inv_c'),true),'accepted','o primeiro motorista aceita o convite da frota A');
select is(pg_temp.fleet(pg_temp.u('fa'))->>'role','fleet_driver','o motorista vê a frota com o papel de motorista da frota');
select tests.authenticate_as('provider_d');
select is(public.ride_join_account(pg_temp.g('inv_d'),true),'accepted','o segundo motorista aceita o convite da frota A');
select tests.authenticate_as('fleet_mgr_a');
select is(public.ride_join_account(pg_temp.g('inv_ma'),true),'accepted','a gestora entra na frota A');
select tests.authenticate_as('provider_e');
select is(public.ride_join_account(pg_temp.g('inv_e'),true),'accepted','o motorista da frota B aceita o convite');
select tests.authenticate_as('fleet_mgr_b');
select is(public.ride_join_account(pg_temp.g('inv_mb'),true),'accepted','o gestor entra na frota B');
select tests.clear_authentication();
select is((select count(*) from private.ride_account_members where account_id=pg_temp.u('fa') and role='fleet_driver' and status='active'),2::bigint,
 'os dois motoristas ficam na frota A como fleet_driver');

-- Veículos: salvar de novo o mesmo identificador não duplica; datas vencidas não entram.
select tests.authenticate_as('fleet_mgr_a');
insert into t select 'v1',public.ride_fleet_save_vehicle(pg_temp.u('fa'),' FROTA-A-001 ','sedan','DOC-A1','APOLICE-A1','VISTORIA-A1',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)::text;
select is(public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-001','sedan','DOC-A1','APOLICE-A1','VISTORIA-A1',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60),
 pg_temp.u('v1'),'salvar de novo os mesmos dados devolve o mesmo veículo');
select throws_ok($$select public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-009','sedan','DOC','APOLICE','VISTORIA',pg_temp.today()+60,pg_temp.today()-1,pg_temp.today()+60)$$,
 'P0001','invalid_input','veículo com seguro já vencido não é cadastrado');
select throws_ok($$select public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-009','caminhão','DOC','APOLICE','VISTORIA',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)$$,
 'P0001','invalid_input','categoria fora da lista é recusada');
select throws_ok($$select public.ride_fleet_save_vehicle(pg_temp.u('fa'),repeat('x',41),'sedan','DOC','APOLICE','VISTORIA',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)$$,
 'P0001','invalid_input','identificador com mais de 40 caracteres é recusado');
select throws_ok($$select public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-009','sedan','DOC','   ','VISTORIA',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)$$,
 'P0001','invalid_input','referência de seguro em branco é recusada');
select tests.authenticate_as('provider_a');
insert into t select 'v2',public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-002','compact','DOC-A2','APOLICE-A2','VISTORIA-A2',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)::text;
select tests.authenticate_as('fleet_mgr_b');
insert into t select 'vb',public.ride_fleet_save_vehicle(pg_temp.u('fb'),'FROTA-B-001','sedan','DOC-B1','APOLICE-B1','VISTORIA-B1',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)::text;
insert into t select 'vb0',public.ride_fleet_save_vehicle(pg_temp.u('fb'),'FROTA-A-001','sedan','DOC-B0','APOLICE-B0','VISTORIA-B0',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)::text;
select tests.clear_authentication();
select is((select count(*) from private.ride_fleet_vehicles where account_id=pg_temp.u('fa')),2::bigint,'a frota A fica com dois veículos, sem duplicar o primeiro');

-- 6. Regressão: com frotas existindo, o motorista autônomo segue como antes; o motorista de frota sem cessão não recebe oferta.
select tests.authenticate_as('client_a');
insert into t select 'r1',public.ride_consent((public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id')::uuid,true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg1',id::text from public.ride_legs where ride_id=pg_temp.u('r1');
select ok(pg_temp.before_parties('indep_driver','leg1'),'antes das regras das partes o autônomo já era elegível');
select ok(pg_temp.eligible('indep_driver','leg1'),'6. a elegibilidade do motorista autônomo não muda com a existência de frotas');
select ok(pg_temp.fleet_rule('indep_driver','leg1') and private.ride_party_can_serve(tests.uid('indep_driver'),l),'a regra da frota não alcança quem não é motorista de frota')
 from public.ride_legs l where l.id=pg_temp.u('leg1');
select is(pg_temp.offered('indep_driver','leg1'),1::bigint,'o autônomo recebe a oferta na primeira onda');
select ok(pg_temp.before_parties('provider_c','leg1') and pg_temp.before_parties('provider_d','leg1'),'sem a regra da frota os dois motoristas da frota A seriam elegíveis');
select ok(not pg_temp.eligible('provider_c','leg1') and not pg_temp.eligible('provider_d','leg1'),'motorista de frota sem cessão não é elegível');
select is(pg_temp.offered('provider_c','leg1')+pg_temp.offered('provider_d','leg1')+pg_temp.offered('provider_e','leg1'),0::bigint,'e não recebe oferta nenhuma');
-- A gestora da frota também dirige? Só quem entrou como fleet_driver passa pela regra.
select ok(pg_temp.fleet_rule('fleet_mgr_a','leg1'),'o papel de gestora não é tratado como motorista de frota');

-- 5. Outra frota, motorista da própria frota, pessoa de fora e visitante não gerem a frota A.
select tests.authenticate_as('fleet_mgr_b');
select throws_ok($$select public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-003','sedan','DOC','APOLICE','VISTORIA',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)$$,
 'P0001','ride_account_role_required','5. o gestor da frota B não cadastra veículo na frota A');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_e'),'CESSAO-INTRUSA','fleet',now()-interval '1 hour',now()+interval '30 days',gen_random_uuid())$$,
 'P0001','ride_account_role_required','5. o gestor da frota B não cede veículo da frota A');
select throws_ok($$select public.ride_fleet_overview(pg_temp.u('fa'),null)$$,'P0001','ride_account_role_required','5. o gestor da frota B não lê o resumo da frota A');
select throws_ok($$select public.ride_fleet_assign(gen_random_uuid(),tests.uid('provider_e'),'CESSAO','fleet',now()-interval '1 hour',now()+interval '30 days',gen_random_uuid())$$,
 'P0001','ride_account_role_required','veículo inexistente responde como veículo alheio');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('vb'),tests.uid('provider_c'),'CESSAO','fleet',now()-interval '1 hour',now()+interval '30 days',gen_random_uuid())$$,
 'P0001','invalid_input','a frota B não cede veículo a motorista que só pertence à frota A');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.ride_fleet_overview(pg_temp.u('fa'),null)$$,'P0001','ride_account_role_required','o motorista da frota não lê o resumo da frota');
select throws_ok($$select public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-003','sedan','DOC','APOLICE','VISTORIA',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)$$,
 'P0001','ride_account_role_required','o motorista da frota não cadastra veículo');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_c'),'CESSAO-PROPRIA','driver',now()-interval '1 hour',now()+interval '30 days',gen_random_uuid())$$,
 'P0001','ride_account_role_required','o motorista da frota não cede veículo a si mesmo');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_fleet_overview(pg_temp.u('fa'),null)$$,'P0001','ride_account_role_required','pessoa sem vínculo não lê o resumo da frota');
select throws_ok($$select public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-003','sedan','DOC','APOLICE','VISTORIA',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)$$,
 'P0001','ride_account_role_required','pessoa sem vínculo não cadastra veículo');
insert into t select 'fam',public.ride_create_family('Família 205D',100000,'pix',gen_random_uuid())::text;
select throws_ok($$select public.ride_fleet_save_vehicle(pg_temp.u('fam'),'FAMILIA-001','sedan','DOC','APOLICE','VISTORIA',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)$$,
 'P0001','invalid_input','conta de família não cadastra veículo de frota');
select throws_ok($$select public.ride_fleet_overview(pg_temp.u('fam'),null)$$,'P0001','invalid_input','conta de família não tem resumo de frota');
select tests.authenticate_anon();
select throws_ok($$select public.ride_create_fleet('Anônima',gen_random_uuid())$$,'42501',null,'visitante não abre frota');
select throws_ok($$select public.ride_fleet_save_vehicle(pg_temp.u('fa'),'X-1','sedan','D','A','V',pg_temp.today()+30,pg_temp.today()+30,pg_temp.today()+30)$$,'42501',null,'visitante não cadastra veículo');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),gen_random_uuid(),'C','fleet',now(),now()+interval '1 day',gen_random_uuid())$$,'42501',null,'visitante não cede veículo');
select throws_ok($$select public.ride_fleet_end_assignment(gen_random_uuid(),gen_random_uuid())$$,'42501',null,'visitante não encerra cessão');
select throws_ok($$select public.admin_review_fleet_assignment(gen_random_uuid(),true,'REF')$$,'42501',null,'visitante não revisa cessão');
select throws_ok($$select public.admin_ride_fleet_assignments()$$,'42501',null,'visitante não lê a fila de cessões');
select throws_ok($$select public.ride_fleet_overview(pg_temp.u('fa'),null)$$,'42501',null,'visitante não lê resumo de frota');
select tests.clear_authentication();

-- Cessão: nasce em revisão, é idempotente e não se sobrepõe a outra do mesmo veículo ou motorista.
select tests.authenticate_as('fleet_mgr_a');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_e'),'CESSAO-A1','fleet',now()-interval '1 hour',now()+interval '30 days',gen_random_uuid())$$,
 'P0001','invalid_input','motorista de outra frota não recebe veículo da frota A');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('fleet_mgr_a'),'CESSAO-A1','fleet',now()-interval '1 hour',now()+interval '30 days',gen_random_uuid())$$,
 'P0001','invalid_input','quem não entrou como motorista da frota não recebe veículo');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_c'),'CESSAO-A1','locadora',now()-interval '1 hour',now()+interval '30 days',gen_random_uuid())$$,
 'P0001','invalid_input','beneficiário fora da lista é recusado');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_c'),'CESSAO-A1','fleet',now()+interval '2 days',now()+interval '1 day',gen_random_uuid())$$,
 'P0001','invalid_input','período invertido é recusado');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_c'),'CESSAO-A1','fleet',now()-interval '3 days',now()-interval '2 days',gen_random_uuid())$$,
 'P0001','invalid_input','período já encerrado é recusado');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_c'),'CESSAO-A1','fleet',now(),now()+interval '14 months',gen_random_uuid())$$,
 'P0001','invalid_input','cessão não passa de 13 meses');
select is(public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_c'),' CESSAO-A1 ','fleet',now()-interval '1 hour',now()+interval '30 days',pg_temp.u('a1')),pg_temp.u('a1'),
 'a gestora cede o veículo ao primeiro motorista');
select is(public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_c'),'CESSAO-A1','fleet',now()-interval '1 hour',now()+interval '30 days',pg_temp.u('a1')),pg_temp.u('a1'),
 'repetir a cessão devolve a mesma cessão');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_c'),'CESSAO-A1','driver',now()-interval '1 hour',now()+interval '30 days',pg_temp.u('a1'))$$,
 'P0001','idempotency_conflict','mesma chave com outro beneficiário é conflito');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_d'),'CESSAO-DUPLA','fleet',now(),now()+interval '10 days',gen_random_uuid())$$,
 'P0001','slot_unavailable','o mesmo veículo não é cedido a dois motoristas no mesmo período');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v2'),tests.uid('provider_c'),'CESSAO-DUPLA','fleet',now(),now()+interval '10 days',gen_random_uuid())$$,
 'P0001','slot_unavailable','o mesmo motorista não recebe dois veículos no mesmo período');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_c'),'CESSAO-A1','fleet',now()-interval '1 hour',now()+interval '30 days',pg_temp.u('a1'))$$,
 'P0001','idempotency_conflict','a chave de outra pessoa não é reaproveitada');
select tests.clear_authentication();
select is((select count(*) from private.ride_fleet_assignments),1::bigint,'as tentativas recusadas não deixam cessão');
select is((select status||'|'||cession_ref||'|'||beneficiary from private.ride_fleet_assignments where id=pg_temp.u('a1')),'pending_review|CESSAO-A1|fleet',
 'a cessão nasce em revisão, com a referência do contrato e o beneficiário contratado');
select ok(not pg_temp.eligible('provider_c','leg1'),'cessão em revisão não libera oferta');

-- 3. A atribuição pelo comando da corrida e a atribuição direta são recusadas enquanto a cessão não foi revisada.
select tests.authenticate_as('provider_c');
select throws_ok($$select public.ride_accept_offer(pg_temp.u('leg1'),gen_random_uuid())$$,'P0001','offer_unavailable','3. o motorista com cessão em revisão não aceita a corrida pelo comando');
select tests.clear_authentication();
select throws_ok($$update public.ride_legs set driver_id=tests.uid('provider_c') where id=pg_temp.u('leg1')$$,'P0001','ride_fleet_review_required',
 '3. a atribuição direta de motorista de frota sem cessão revisada é recusada');
select throws_ok($$update public.ride_legs set driver_id=tests.uid('provider_d') where id=pg_temp.u('leg1')$$,'P0001','ride_fleet_review_required',
 '3. a atribuição direta de motorista de frota sem cessão alguma também é recusada');
select is((select driver_id from public.ride_legs where id=pg_temp.u('leg1')),null::uuid,'o trecho continua sem motorista');

-- Revisão pela operação: só ela decide, quem é da frota não revisa a própria cessão, e a repetição não duplica a trilha.
select tests.authenticate_as('provider_a');
select throws_ok($$select public.admin_review_fleet_assignment(pg_temp.u('a1'),true,'DOSSIE-205D-1')$$,'P0001','not_allowed','quem não é da operação não revisa cessão');
select throws_ok($$select public.admin_ride_fleet_assignments()$$,'P0001','not_allowed','quem não é da operação não lê a fila de cessões');
select tests.clear_authentication();
insert into public.admins(user_id) values(tests.uid('provider_a')),(tests.uid('provider_c'));
select tests.authenticate_as('provider_a');
select throws_ok($$select public.admin_review_fleet_assignment(pg_temp.u('a1'),true,'DOSSIE-PROPRIO')$$,'P0001','not_allowed','quem responde pela frota não revisa a cessão da própria frota');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.admin_review_fleet_assignment(pg_temp.u('a1'),true,'DOSSIE-PROPRIO')$$,'P0001','not_allowed','o motorista não revisa a própria cessão');
select tests.clear_authentication();
delete from public.admins where user_id in (tests.uid('provider_a'),tests.uid('provider_c'));
select tests.authenticate_as('admin');
select is(jsonb_array_length(public.admin_ride_fleet_assignments()),1,'a operação lê a cessão que aguarda revisão');
select is(public.admin_ride_fleet_assignments()#>>'{0,vehicle_identifier}','FROTA-A-001','a fila traz o identificador do veículo');
select is(public.admin_ride_fleet_assignments()#>>'{0,driver_vehicle_match}','true','e diz se o identificador confere com o cadastro do motorista');
select throws_ok($$select public.admin_review_fleet_assignment(pg_temp.u('a1'),true,'   ')$$,'P0001','invalid_input','revisão sem referência é recusada');
select throws_ok($$select public.admin_review_fleet_assignment(pg_temp.u('a1'),null,'DOSSIE-205D-1')$$,'P0001','invalid_input','revisão sem decisão é recusada');
select throws_ok($$select public.admin_review_fleet_assignment(gen_random_uuid(),true,'DOSSIE-205D-1')$$,'P0001','invalid_input','cessão inexistente é recusada');
select ok(public.admin_review_fleet_assignment(pg_temp.u('a1'),true,'DOSSIE-205D-1'),'a operação aprova a cessão');
select ok(public.admin_review_fleet_assignment(pg_temp.u('a1'),true,'DOSSIE-205D-1'),'repetir a mesma revisão devolve o mesmo resultado');
select throws_ok($$select public.admin_review_fleet_assignment(pg_temp.u('a1'),true,'DOSSIE-OUTRO')$$,'P0001','invalid_input','cessão já aprovada não é aprovada de novo com outra referência');
select tests.clear_authentication();
select is((select count(*) from public.audit_log where action='ride.fleet_assignment_review' and entity_id=pg_temp.g('a1')),1::bigint,'a repetição não duplica a trilha de auditoria');
select is((select status||'|'||review_ref||'|'||(reviewed_by=tests.uid('admin'))::text from private.ride_fleet_assignments where id=pg_temp.u('a1')),'approved|DOSSIE-205D-1|true',
 'a cessão guarda a referência da revisão e quem revisou');
select ok(pg_temp.eligible('provider_c','leg1'),'com a cessão aprovada e os documentos em dia o motorista volta a ser elegível');
select ok(not pg_temp.eligible('provider_d','leg1'),'o outro motorista da frota continua sem cessão e sem oferta');

-- 2. Veículo vencido bloqueia; volta a valer depois da renovação e da nova revisão.
update private.ride_fleet_vehicles set insurance_until=pg_temp.today()-1 where id=pg_temp.u('v1');
select ok(not pg_temp.eligible('provider_c','leg1'),'2. seguro vencido torna o motorista inelegível');
select throws_ok($$update public.ride_legs set driver_id=tests.uid('provider_c') where id=pg_temp.u('leg1')$$,'P0001','ride_fleet_review_required',
 'a atribuição direta com veículo vencido é recusada');
select tests.authenticate_as('fleet_mgr_a');
select is((select (v->>'expired')::boolean from jsonb_array_elements(public.ride_fleet_overview(pg_temp.u('fa'),null)->'vehicles') v where v->>'id'=pg_temp.g('v1')),true,
 'a frota vê o veículo com documento vencido');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_d'),'CESSAO-VENCIDA','fleet',now()+interval '40 days',now()+interval '50 days',gen_random_uuid())$$,
 'P0001','invalid_input','veículo com documento vencido não entra em nova cessão');
select is(public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-001','sedan','DOC-A1','APOLICE-A1-NOVA','VISTORIA-A1',pg_temp.today()+60,pg_temp.today()+90,pg_temp.today()+60),
 pg_temp.u('v1'),'a renovação dos documentos atualiza o mesmo veículo');
select tests.clear_authentication();
select is(pg_temp.status('a1'),'pending_review','documento renovado devolve a cessão à revisão');
select ok(not pg_temp.eligible('provider_c','leg1'),'2. renovado mas ainda sem nova revisão, o motorista continua inelegível');
select tests.authenticate_as('admin');
select ok(public.admin_review_fleet_assignment(pg_temp.u('a1'),true,'DOSSIE-205D-2'),'a operação revisa a cessão com os documentos novos');
select tests.clear_authentication();
select ok(pg_temp.eligible('provider_c','leg1'),'2. depois da renovação e da revisão o motorista volta a ser elegível');
select tests.authenticate_as('fleet_mgr_a');
select is(public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-001','sedan','DOC-A1','APOLICE-A1-NOVA','VISTORIA-A1',pg_temp.today()+60,pg_temp.today()+90,pg_temp.today()+60),
 pg_temp.u('v1'),'salvar de novo sem mudança devolve o mesmo veículo');
select tests.clear_authentication();
select is(pg_temp.status('a1'),'approved','salvar sem mudança não devolve a cessão à revisão');
-- A vistoria e o documento do veículo valem do mesmo jeito que o seguro.
update private.ride_fleet_vehicles set inspection_until=pg_temp.today()-1 where id=pg_temp.u('v1');
select ok(not pg_temp.eligible('provider_c','leg1'),'revisão do veículo vencida também bloqueia');
update private.ride_fleet_vehicles set inspection_until=pg_temp.today()+60,vehicle_until=pg_temp.today()-1 where id=pg_temp.u('v1');
select ok(not pg_temp.eligible('provider_c','leg1'),'documento do veículo vencido também bloqueia');
update private.ride_fleet_vehicles set vehicle_until=pg_temp.today()+60 where id=pg_temp.u('v1');
select ok(pg_temp.eligible('provider_c','leg1'),'com as três datas em dia a cessão aprovada vale');

-- 1. Troca de motorista: a nova cessão fica em revisão e nenhum dos dois recebe oferta até a decisão.
select tests.authenticate_as('fleet_mgr_b');
select throws_ok($$select public.ride_fleet_end_assignment(pg_temp.u('a1'),gen_random_uuid())$$,'P0001','ride_account_role_required','5. o gestor da frota B não encerra cessão da frota A');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.ride_fleet_end_assignment(pg_temp.u('a1'),gen_random_uuid())$$,'P0001','ride_account_role_required','o motorista não encerra a cessão pela gestão da frota');
select tests.authenticate_as('fleet_mgr_a');
select throws_ok($$select public.ride_fleet_end_assignment(gen_random_uuid(),gen_random_uuid())$$,'P0001','ride_account_role_required','cessão inexistente responde como cessão alheia');
select ok(public.ride_fleet_end_assignment(pg_temp.u('a1'),pg_temp.u('end1')),'a gestora encerra a cessão do primeiro motorista');
select ok(public.ride_fleet_end_assignment(pg_temp.u('a1'),pg_temp.u('end1')),'repetir o encerramento devolve o mesmo resultado');
select ok(not public.ride_fleet_end_assignment(pg_temp.u('a1'),gen_random_uuid()),'encerrar de novo com outra chave não muda nada');
select is(public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_d'),'CESSAO-A2','fleet',now()-interval '1 hour',now()+interval '30 days',pg_temp.u('a2')),pg_temp.u('a2'),
 'a gestora cede o mesmo veículo ao segundo motorista');
select throws_ok($$select public.ride_fleet_end_assignment(pg_temp.u('a2'),pg_temp.u('end1'))$$,'P0001','idempotency_conflict','a chave de um encerramento não serve para outra cessão');
select tests.clear_authentication();
select is(pg_temp.status('a1')||'|'||pg_temp.status('a2'),'ended|pending_review','a cessão antiga fica encerrada e a nova fica em revisão');
select ok(not pg_temp.eligible('provider_c','leg1'),'1. depois da troca, o motorista anterior não é elegível');
select ok(not pg_temp.eligible('provider_d','leg1'),'1. e o novo motorista também não, até a revisão');
select ok(pg_temp.before_parties('provider_c','leg1') and pg_temp.before_parties('provider_d','leg1'),'só a regra da frota separa os dois da oferta');
select private.dispatch_ride_leg(pg_temp.u('leg1'));
select is(pg_temp.offered('provider_c','leg1')+pg_temp.offered('provider_d','leg1'),0::bigint,'1. a troca bloqueia novas ofertas aos dois até a revisão');
select tests.authenticate_as('admin');
select ok(public.admin_review_fleet_assignment(pg_temp.u('a2'),true,'DOSSIE-205D-3'),'a operação aprova a cessão do novo motorista');
select throws_ok($$select public.admin_review_fleet_assignment(pg_temp.u('a1'),true,'DOSSIE-205D-4')$$,'P0001','invalid_input','cessão encerrada não é aprovada');
select tests.clear_authentication();
select ok(pg_temp.eligible('provider_d','leg1'),'1. depois da revisão o novo motorista é elegível');
select ok(not pg_temp.eligible('provider_c','leg1'),'o motorista anterior segue sem cessão e sem oferta');
-- Troca agendada: uma cessão futura do mesmo veículo, ainda em revisão, bloqueia quem o dirige hoje.
select tests.authenticate_as('fleet_mgr_a');
select is(public.ride_fleet_assign(pg_temp.u('v1'),tests.uid('provider_c'),'CESSAO-A3','driver',now()+interval '40 days',now()+interval '50 days',pg_temp.u('a3')),pg_temp.u('a3'),
 'a gestora agenda a devolução do veículo ao primeiro motorista');
select tests.clear_authentication();
select ok(not pg_temp.eligible('provider_d','leg1'),'1. troca de motorista agendada e ainda em revisão bloqueia quem dirige o veículo hoje');
select ok(not pg_temp.eligible('provider_c','leg1'),'1. e quem vai receber o veículo também não é elegível');
select tests.authenticate_as('admin');
select ok(not public.admin_review_fleet_assignment(pg_temp.u('a3'),false,'DOSSIE-205D-5'),'a operação recusa a troca agendada');
select ok(not public.admin_review_fleet_assignment(pg_temp.u('a3'),false,'DOSSIE-205D-5'),'repetir a recusa devolve o mesmo resultado');
select tests.clear_authentication();
select is(pg_temp.status('a3'),'rejected','a cessão recusada fica recusada');
select ok(pg_temp.eligible('provider_d','leg1'),'decidida a revisão, o motorista atual volta a ser elegível');
-- Troca de veículo: uma cessão futura de outro veículo ao mesmo motorista, ainda em revisão, também bloqueia.
select tests.authenticate_as('fleet_mgr_a');
select is(public.ride_fleet_assign(pg_temp.u('v2'),tests.uid('provider_d'),'CESSAO-A4','fleet',now()+interval '40 days',now()+interval '50 days',pg_temp.u('a4')),pg_temp.u('a4'),
 'a gestora agenda outro veículo para o mesmo motorista');
select tests.clear_authentication();
select ok(not pg_temp.eligible('provider_d','leg1'),'troca de veículo ainda em revisão bloqueia o motorista');
select tests.authenticate_as('fleet_mgr_a');
select ok(public.ride_fleet_end_assignment(pg_temp.u('a4'),pg_temp.u('end4')),'a gestora desiste da troca de veículo antes da revisão');
select tests.clear_authentication();
select ok(pg_temp.eligible('provider_d','leg1'),'sem cessão pendente, o motorista volta a ser elegível');

-- As demais condições da cessão aprovada.
update private.ride_vehicle_capacity set document_ref='OUTRO-VEICULO' where driver_id=tests.uid('provider_d');
select ok(not pg_temp.eligible('provider_d','leg1'),'identificador diferente do cadastro do motorista na operação não vale');
update private.ride_vehicle_capacity set document_ref='FROTA-A-001' where driver_id=tests.uid('provider_d');
update private.ride_fleet_assignments set period=tstzrange(lower(period),now()+interval '1 minute','[)') where id=pg_temp.u('a2');
select ok(not pg_temp.eligible('provider_d','leg1'),'cessão que termina antes do fim do trecho não cobre a corrida');
update private.ride_fleet_assignments set period=tstzrange(now()+interval '1 minute',now()+interval '30 days','[)') where id=pg_temp.u('a2');
select ok(not pg_temp.eligible('provider_d','leg1'),'cessão que ainda não começou não libera oferta');
update private.ride_fleet_assignments set period=tstzrange(now()-interval '1 hour',now()+interval '30 days','[)') where id=pg_temp.u('a2');
update private.ride_accounts set verified_until=now()-interval '1 second' where id=pg_temp.u('fa');
select ok(not pg_temp.eligible('provider_d','leg1'),'frota com conferência vencida não libera oferta aos seus motoristas');
update private.ride_accounts set verified_until=now()+interval '90 days' where id=pg_temp.u('fa');
update private.ride_party_rules set enabled=false where environment='simulation' and capability='fleet' and area='Jabaquara';
select ok(not pg_temp.eligible('provider_d','leg1'),'praça de destino sem a capacidade de frota não recebe motorista de frota');
select ok(pg_temp.eligible('indep_driver','leg1'),'o portão da frota não alcança o motorista autônomo');
update private.ride_party_rules set enabled=true where environment='simulation' and capability='fleet';
update private.ride_fleet_vehicles set status='retired' where id=pg_temp.u('v1');
select ok(not pg_temp.eligible('provider_d','leg1'),'veículo retirado da frota não libera oferta');
update private.ride_fleet_vehicles set status='active' where id=pg_temp.u('v1');
select ok(pg_temp.eligible('provider_d','leg1'),'restauradas as condições, a cessão aprovada vale de novo');

-- O motorista com cessão revisada aceita a corrida; o veículo fica congelado no trecho.
select private.dispatch_ride_leg(pg_temp.u('leg1'));
select is(pg_temp.offered('provider_d','leg1'),1::bigint,'o motorista com cessão revisada recebe a oferta');
select is(pg_temp.offered('provider_c','leg1'),0::bigint,'o motorista sem cessão continua sem oferta');
select tests.authenticate_as('provider_d');
select lives_ok($$select public.ride_accept_offer(pg_temp.u('leg1'),gen_random_uuid())$$,'o motorista da frota aceita a corrida com o veículo cedido');
select tests.clear_authentication();
select is((select vehicle_id::text||'|'||assignment_id::text||'|'||account_id::text||'|'||driver_id::text from private.ride_leg_vehicles where leg_id=pg_temp.u('leg1')),
 pg_temp.g('v1')||'|'||pg_temp.g('a2')||'|'||pg_temp.g('fa')||'|'||tests.uid('provider_d')::text,'o trecho guarda o veículo, a cessão e a frota com que foi aceito');
select tests.authenticate_as('provider_d');
select lives_ok($$select public.ride_transition(pg_temp.u('leg1'),'arriving',gen_random_uuid())$$,'o motorista da frota segue para o embarque');
select tests.authenticate_as('client_a');
insert into t select 'pin1',public.ride_issue_pin(pg_temp.u('leg1'))->>'pin';
select tests.authenticate_as('provider_d');
select is(public.ride_verify_boarding(pg_temp.u('leg1'),pg_temp.g('pin1'),gen_random_uuid())->>'ok','true','o passageiro embarca');
select is(public.ride_transition(pg_temp.u('leg1'),'completed',gen_random_uuid())->>'status','completed','a corrida com o veículo da frota é concluída');
select tests.clear_authentication();

-- Frota B: o mesmo identificador já aprovado para outra frota no período não passa pela revisão.
select tests.authenticate_as('fleet_mgr_b');
select is(public.ride_fleet_assign(pg_temp.u('vb0'),tests.uid('provider_e'),'CESSAO-B0','fleet',now()-interval '1 hour',now()+interval '10 days',pg_temp.u('ab0')),pg_temp.u('ab0'),
 'a frota B tenta ceder um veículo com o identificador que a frota A já usa');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_review_fleet_assignment(pg_temp.u('ab0'),true,'DOSSIE-205D-B0')$$,'P0001','invalid_input',
 'o mesmo identificador não é aprovado para duas frotas no mesmo período');
select tests.authenticate_as('fleet_mgr_b');
select ok(public.ride_fleet_end_assignment(pg_temp.u('ab0'),pg_temp.u('endb0')),'a frota B desiste dessa cessão');
select is(public.ride_fleet_assign(pg_temp.u('vb'),tests.uid('provider_e'),'CESSAO-B1','driver',now()-interval '1 hour',now()+interval '30 days',pg_temp.u('ab')),pg_temp.u('ab'),
 'a frota B cede o próprio veículo ao seu motorista, que é o beneficiário contratado');
select tests.authenticate_as('admin');
select ok(public.admin_review_fleet_assignment(pg_temp.u('ab'),true,'DOSSIE-205D-B1'),'a operação aprova a cessão da frota B');
select tests.authenticate_as('client_b');
insert into t select 'r2',public.ride_consent((public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id')::uuid,true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg2',id::text from public.ride_legs where ride_id=pg_temp.u('r2');
select is(pg_temp.offered('provider_e','leg2'),1::bigint,'a primeira onda já oferece ao motorista de frota com cessão revisada');
select is(pg_temp.offered('provider_c','leg2'),0::bigint,'e não oferece ao motorista de frota sem cessão');
select tests.authenticate_as('provider_e');
select lives_ok($$select public.ride_accept_offer(pg_temp.u('leg2'),gen_random_uuid())$$,'o motorista da frota B aceita a corrida');
select tests.clear_authentication();
select is((select account_id from private.ride_leg_vehicles where leg_id=pg_temp.u('leg2')),pg_temp.u('fb'),'o trecho fica ligado à frota B');

-- Saída da frota: a cessão do motorista termina e ele volta a dirigir como autônomo, fora do resumo da frota.
select tests.authenticate_as('fleet_mgr_a');
select is(public.ride_fleet_assign(pg_temp.u('v2'),tests.uid('provider_c'),'CESSAO-A5','fleet',now()-interval '1 hour',now()+interval '30 days',pg_temp.u('a5')),pg_temp.u('a5'),
 'a gestora cede o segundo veículo ao primeiro motorista');
select tests.authenticate_as('provider_c');
select ok(public.ride_remove_member(pg_temp.u('fa'),tests.uid('provider_c'),pg_temp.u('leave_c')),'o motorista sai da frota A');
select tests.clear_authentication();
select is(pg_temp.status('a5'),'ended','a saída do motorista encerra a cessão que ele tinha');
select tests.authenticate_as('rider_c');
insert into t select 'r3',public.ride_consent((public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id')::uuid,true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg3',id::text from public.ride_legs where ride_id=pg_temp.u('r3');
select ok(pg_temp.eligible('provider_c','leg3'),'fora da frota, o motorista volta a ser elegível como autônomo');
select tests.authenticate_as('provider_c');
select lives_ok($$select public.ride_accept_offer(pg_temp.u('leg3'),gen_random_uuid())$$,'o ex-motorista da frota aceita uma corrida particular');
select tests.clear_authentication();
select is((select count(*) from private.ride_leg_vehicles where leg_id in (pg_temp.u('leg0'),pg_temp.u('leg3'))),0::bigint,
 'as corridas do motorista antes da cessão e como autônomo não ficam ligadas a veículo de frota');

-- 4. A frota A vê os seus veículos e o trecho feito com eles; nada da frota B nem das corridas particulares.
select tests.authenticate_as('fleet_mgr_a');
insert into t select 'ov_a',public.ride_fleet_overview(pg_temp.u('fa'),pg_temp.month_of('leg1'))::text;
select tests.authenticate_as('provider_a');
select is(public.ride_fleet_overview(pg_temp.u('fa'),pg_temp.month_of('leg1')),pg_temp.g('ov_a')::jsonb,'quem responde pela frota e a gestora leem o mesmo resumo');
select tests.authenticate_as('fleet_mgr_b');
insert into t select 'ov_b',public.ride_fleet_overview(pg_temp.u('fb'),pg_temp.month_of('leg2'))::text;
select tests.clear_authentication();
select is((select array_agg(v->>'vehicle_identifier' order by v->>'vehicle_identifier') from jsonb_array_elements(pg_temp.g('ov_a')::jsonb->'vehicles') v),
 array['FROTA-A-001','FROTA-A-002'],'4. a frota A vê os seus dois veículos');
select is((select array_agg(s->>'id' order by s->>'cession_ref') from jsonb_array_elements(pg_temp.g('ov_a')::jsonb->'assignments') s),
 array[pg_temp.g('a1'),pg_temp.g('a2'),pg_temp.g('a3'),pg_temp.g('a4'),pg_temp.g('a5')],'4. e todas as suas cessões, com o estado de cada uma');
select is((select s->>'status' from jsonb_array_elements(pg_temp.g('ov_a')::jsonb->'assignments') s where s->>'id'=pg_temp.g('a2')),'approved','a cessão vigente aparece aprovada');
select is((select s->>'driver_name' from jsonb_array_elements(pg_temp.g('ov_a')::jsonb->'assignments') s where s->>'id'=pg_temp.g('a2')),
 (select full_name from public.profiles where id=tests.uid('provider_d')),'a cessão mostra o nome do motorista, nunca e-mail ou documento');
select is(jsonb_array_length(pg_temp.g('ov_a')::jsonb->'legs'),1,'4. a frota A vê só o trecho feito com o seu veículo');
select is((select array_agg(k order by k) from jsonb_object_keys(pg_temp.g('ov_a')::jsonb#>'{legs,0}') k),array['date','driver_cents','status','vehicle_id'],
 '4. do trecho saem só a data, a situação, o veículo e o valor: nunca trajeto, horário ou passageiro');
select is(pg_temp.g('ov_a')::jsonb#>>'{legs,0,vehicle_id}',pg_temp.g('v1'),'o trecho aponta o veículo da frota');
select is(pg_temp.g('ov_a')::jsonb#>>'{legs,0,status}','completed','com a situação do trecho');
select is((pg_temp.g('ov_a')::jsonb#>>'{legs,0,date}')::date,(select private.sp_date(pickup_at) from public.ride_legs where id=pg_temp.u('leg1')),'e a data local da corrida');
select is((pg_temp.g('ov_a')::jsonb#>>'{legs,0,driver_cents}')::int,(select driver_cents from public.ride_legs where id=pg_temp.u('leg1')),
 '4. o valor do motorista aparece porque a cessão indica a frota como beneficiária');
select ok(pg_temp.g('ov_a') !~ 'Saúde|Jabaquara' and position(tests.uid('client_a')::text in pg_temp.g('ov_a'))=0 and position(pg_temp.g('leg1') in pg_temp.g('ov_a'))=0
  and position(pg_temp.g('r1') in pg_temp.g('ov_a'))=0,'4. o resumo não traz praça, passageiro, trecho nem corrida identificáveis');
select ok(position(pg_temp.g('vb') in pg_temp.g('ov_a'))=0 and position(pg_temp.g('ab') in pg_temp.g('ov_a'))=0 and position(pg_temp.g('fb') in pg_temp.g('ov_a'))=0
  and position(tests.uid('provider_e')::text in pg_temp.g('ov_a'))=0,'4. nada da frota B aparece no resumo da frota A');
select is(jsonb_array_length(pg_temp.g('ov_b')::jsonb->'legs'),1,'a frota B vê só o seu trecho');
select is(pg_temp.g('ov_b')::jsonb#>>'{legs,0,vehicle_id}',pg_temp.g('vb'),'feito com o seu veículo');
select is(pg_temp.g('ov_b')::jsonb#>'{legs,0,driver_cents}','null'::jsonb,'o valor não aparece quando o beneficiário contratado é o motorista');
select ok(position(pg_temp.g('v1') in pg_temp.g('ov_b'))=0 and position(pg_temp.g('a2') in pg_temp.g('ov_b'))=0,'nada da frota A aparece no resumo da frota B');
select tests.authenticate_as('fleet_mgr_a');
select is(jsonb_array_length(public.ride_fleet_overview(pg_temp.u('fa'),pg_temp.month_of('leg1')-1)->'legs'),0,'outro mês não traz o trecho deste mês');
select is(jsonb_array_length(public.ride_fleet_overview(pg_temp.u('fa'),pg_temp.month_of('leg1')-1)->'vehicles'),2,'mas traz os veículos da frota');
select tests.clear_authentication();
select is(jsonb_array_length(private.ride_fleet_assignments_view(tests.uid('provider_e'))),2,'o motorista tem as suas cessões prontas para a exportação dos próprios dados');

-- Retirada da aprovação pela operação e liberação do trecho pelo motorista.
select tests.authenticate_as('admin');
select ok(not public.admin_review_fleet_assignment(pg_temp.u('ab'),false,'DOSSIE-205D-B2'),'a operação retira a aprovação de uma cessão');
select tests.clear_authentication();
select is(pg_temp.status('ab'),'rejected','a cessão com aprovação retirada fica recusada');
select ok(not pg_temp.fleet_rule('provider_e','leg3'),'sem cessão aprovada o motorista da frota B deixa de atender novas corridas');
select is((select count(*) from private.ride_leg_vehicles where leg_id=pg_temp.u('leg2')),1::bigint,'o trecho já aceito continua ligado ao veículo');
update public.ride_legs set driver_id=null,driver_slot=null,status='requested',updated_at=now() where id=pg_temp.u('leg2');
select is((select count(*) from private.ride_leg_vehicles where leg_id=pg_temp.u('leg2')),0::bigint,'trecho devolvido à fila deixa de estar ligado ao veículo da frota');
select tests.authenticate_as('fleet_mgr_b');
select is(jsonb_array_length(public.ride_fleet_overview(pg_temp.u('fb'),pg_temp.month_of('leg2'))->'legs'),0,'e sai do resumo da frota B');
select tests.clear_authentication();

-- Portão fechado e módulo desligado: nada novo acontece; a regra de dependentes de 110503 continua na elegibilidade.
select ok(pg_get_functiondef('private.ride_party_can_serve(uuid,public.ride_legs)'::regprocedure) ~ 'ride_minor_can_serve'
  and pg_get_functiondef('private.ride_party_can_serve(uuid,public.ride_legs)'::regprocedure) ~ 'ride_fleet_can_serve',
 'a regra das partes mantém a liberação para adolescentes e soma a regra da frota');
update private.ride_party_rules set enabled=false where environment='simulation' and capability='fleet';
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_create_fleet('Frota nova',gen_random_uuid())$$,'P0001','ride_feature_disabled','com o portão fechado não se abre frota');
select throws_ok($$select public.ride_fleet_save_vehicle(pg_temp.u('fa'),'FROTA-A-004','sedan','DOC','APOLICE','VISTORIA',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)$$,
 'P0001','ride_feature_disabled','com o portão fechado não se cadastra veículo');
select throws_ok($$select public.ride_fleet_assign(pg_temp.u('v2'),tests.uid('provider_d'),'CESSAO-FECHADA','fleet',now()+interval '60 days',now()+interval '70 days',gen_random_uuid())$$,
 'P0001','ride_feature_disabled','com o portão fechado não se cede veículo');
select tests.clear_authentication();
select ok(not pg_temp.fleet_rule('provider_d','leg3'),'com o portão fechado o motorista de frota não atende novas corridas');
update private.ride_party_rules set enabled=true where environment='simulation' and capability='fleet';
select ok(pg_temp.fleet_rule('provider_d','leg3'),'reaberto o portão, a cessão aprovada vale de novo');
-- Frota encerrada: as cessões terminam e o motorista deixa de ser tratado como motorista de frota.
update private.ride_accounts set status='closed' where id=pg_temp.u('fa');
select is(pg_temp.status('a2'),'ended','o encerramento da frota termina as cessões vigentes');
select ok(pg_temp.fleet_rule('provider_d','leg3'),'sem frota ativa, o motorista volta à regra do autônomo');
update private.ride_network set module_enabled=false where environment='simulation';
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_create_fleet('Frota desligada',gen_random_uuid())$$,'P0001','ride_feature_disabled','módulo desligado recusa abrir frota');
select throws_ok($$select public.ride_fleet_overview(pg_temp.u('fb'),null)$$,'P0001','ride_feature_disabled','módulo desligado recusa o resumo da frota');
select throws_ok($$select public.ride_fleet_end_assignment(pg_temp.u('ab'),gen_random_uuid())$$,'P0001','ride_feature_disabled','módulo desligado recusa encerrar cessão');

-- Invariantes de privilégio das funções e tabelas novas.
select throws_ok($$select * from private.ride_fleet_vehicles$$,'42501',null,'a tabela de veículos não é lida direto');
select throws_ok($$select * from private.ride_fleet_assignments$$,'42501',null,'a tabela de cessões não é lida direto');
select throws_ok($$select * from private.ride_leg_vehicles$$,'42501',null,'o vínculo entre trecho e veículo não é lido direto');
select throws_ok($$select private.ride_fleet_assignments_view(auth.uid())$$,'42501',null,'a função interna de exportação não é chamada direto');
select throws_ok($$select private.ride_fleet_can_serve(auth.uid(),null)$$,'42501',null,'a regra interna da frota não é chamada direto');
select tests.clear_authentication();
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and (p.proname ~ 'fleet' or p.proname='ride_party_can_serve')
  and has_function_privilege('anon',p.oid,'execute')),0::bigint,'visitante não executa nenhuma função de frota');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname ~ 'fleet' or p.proname='ride_party_can_serve')
  and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))),0::bigint,
 'nenhuma função interna de frota fica executável pelos papéis da API');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname ~ 'fleet'
  and has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('service_role',p.oid,'execute')),7::bigint,
 'as sete chamadas públicas de frota ficam só para pessoas autenticadas');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname ~ 'fleet' and p.prosecdef
  and not coalesce(p.proconfig @> array['search_path=""'],false)),0::bigint,'toda função de frota com privilégio do dono fixa o search_path vazio');
select * from finish();
rollback;
