-- PAR-505 e PAR-506 (O17 etapa 5): organização, perfil profissional, central, convidado,
-- vouchers, orçamento e limites, sobre 20261127110504. Dados fictícios, sem rede.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,v text not null);
grant select,insert on t to authenticated,anon;
create function pg_temp.g(p text) returns text language sql stable as $$select t.v from t where t.k=p$$;
create function pg_temp.u(p text) returns uuid language sql stable as $$select t.v::uuid from t where t.k=p$$;
create function pg_temp.n(p text) returns int language sql stable as $$select t.v::int from t where t.k=p$$;
create function pg_temp.trip() returns jsonb language sql immutable as $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
create function pg_temp.org(p uuid) returns jsonb language sql as $$
 select a from jsonb_array_elements(public.ride_my_accounts()) a where a->>'id'=p::text$$;
create function pg_temp.program(p_account uuid,p_program uuid) returns jsonb language sql as $$
 select x from jsonb_array_elements(pg_temp.org(p_account)->'programs') x where x->>'id'=p_program::text$$;
create function pg_temp.dash_leg(p uuid) returns jsonb language sql as $$
 select l from jsonb_array_elements(public.ride_dashboard()->'rides') r cross join lateral jsonb_array_elements(r->'legs') l where l->>'id'=p::text$$;
create function pg_temp.dash_quote(p uuid) returns jsonb language sql as $$
 select q from jsonb_array_elements(public.ride_dashboard()->'quotes') q where q->>'id'=p::text$$;
grant execute on function pg_temp.g(text),pg_temp.u(text),pg_temp.n(text),pg_temp.trip(),pg_temp.org(uuid),pg_temp.program(uuid,uuid),
 pg_temp.dash_leg(uuid),pg_temp.dash_quote(uuid) to authenticated,anon;
-- Atalhos do roteiro, executados como dono do teste: registrar um programa (pela operação financeira),
-- concluir um trecho e guardar o trecho de uma corrida.
create function pg_temp.save_program(p_key text,p_account text,p_label text,p_budget int,p_value int,p_member int,p_areas text[],p_classes text[],p_group text,
 p_from timestamptz,p_until timestamptz,p_excess text,p_approval boolean) returns void language plpgsql as $$
begin
 insert into t values(p_key,gen_random_uuid()::text);
 perform tests.authenticate_as('admin');
 perform public.admin_save_ride_voucher_program(pg_temp.u(p_key),pg_temp.u(p_account),p_label,p_budget,p_value,p_member,p_areas,p_classes,p_group,p_from,p_until,
   p_excess,p_approval,'ficticio-o17-e5 verba','ficticio-o17-e5 contrato',true);
 perform tests.clear_authentication();
end $$;
create function pg_temp.finish_leg(p_key text) returns void language sql as $$
 update public.ride_legs set driver_id=tests.uid('provider_c'),status='completed' where id=pg_temp.u(p_key)$$;
create function pg_temp.keep_leg(p_key text,p_ride text) returns void language sql as $$
 insert into t select p_key,id::text from public.ride_legs where ride_id=pg_temp.u(p_ride)$$;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_c'),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true);
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity,card_brands,acquirer_profile_ref)
 select 'simulation','Saúde','Jabaquara',m,'ensaio 205c',tstzrange(now()-interval '1 day',now()+interval '1 day'),
  case when m='card' then array['VISA'] else '{}'::text[] end,case when m='card' then 'conta hospedada TESTE' end from unnest(array['card','pix','benefit']) m;

-- Tarifa de referência do trecho, lida de uma cotação comum.
select tests.authenticate_as('provider_c');
insert into t select 'x',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'total_cents';
select tests.clear_authentication();
select ok(pg_temp.n('x')>1000,'a tarifa do ensaio permite um voucher parcial');
insert into t select 'name_b',full_name from public.profiles where id=tests.uid('client_b');
insert into t select 'name_e',full_name from public.profiles where id=tests.uid('provider_e');
insert into t select 'part',(pg_temp.n('x')-500)::text;

-- Organização: nasce fechada e só opera depois da conferência da operação.
select tests.authenticate_as('client_a');
insert into t values('org_key',gen_random_uuid()::text);
insert into t select 'org',public.ride_create_organization('Empresa de ensaio A',pg_temp.u('org_key'))::text;
select is(public.ride_create_organization('Empresa de ensaio A',pg_temp.u('org_key')),pg_temp.u('org'),'repetir a criação devolve a mesma organização');
select throws_ok($$select public.ride_create_organization('Outro nome',pg_temp.u('org_key'))$$,'P0001','idempotency_conflict','mesma chave com outro nome é conflito');
select is(pg_temp.org(pg_temp.u('org'))->>'kind','organization','a conta criada é uma organização');
select is(pg_temp.org(pg_temp.u('org'))->>'verified','false','a organização nasce sem conferência');
select throws_ok($$select public.ride_save_cost_center(pg_temp.u('org'),'VENDAS','Vendas',true)$$,'P0001','ride_feature_disabled','sem conferência não há centro de custo');
select throws_ok($$select public.ride_invite_member(pg_temp.u('org'),'client_b@test.local','member',60,gen_random_uuid())$$,'P0001','ride_feature_disabled','sem conferência não há convite');
select throws_ok($$select public.admin_save_ride_voucher_program(gen_random_uuid(),pg_temp.u('org'),'Programa',1000,500,null,null,null,null,now(),now()+interval '1 day','none',false,'ref','ref',true)$$,
 'P0001','not_allowed','a própria empresa não registra programa de voucher');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_save_ride_voucher_program(gen_random_uuid(),pg_temp.u('org'),'Programa',1000,500,null,null,null,null,now(),now()+interval '1 day','none',false,'ref','ref',true)$$,
 'P0001','ride_feature_disabled','programa não é habilitado para empresa sem conferência');
select ok(public.admin_verify_ride_account(pg_temp.u('org'),'ficticio-o17-e5 contrato A',now()+interval '30 days'),'a operação confere a empresa A');
select tests.authenticate_as('provider_d');
insert into t select 'org_b',public.ride_create_organization('Empresa de ensaio B',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select ok(public.admin_verify_ride_account(pg_temp.u('org_b'),'ficticio-o17-e5 contrato B',now()+interval '30 days'),'a operação confere a empresa B');

-- Centros de custo e pessoas da empresa A, por adesão.
select tests.authenticate_as('client_a');
insert into t select 'cc1',public.ride_save_cost_center(pg_temp.u('org'),' vendas ','Vendas',true)::text;
select is(public.ride_save_cost_center(pg_temp.u('org'),'VENDAS','Vendas e parcerias',true),pg_temp.u('cc1'),'o mesmo código atualiza o centro de custo existente');
insert into t select 'cc2',public.ride_save_cost_center(pg_temp.u('org'),'VISITAS','Visitantes',true)::text;
insert into t select 'cc_off',public.ride_save_cost_center(pg_temp.u('org'),'ANTIGO','Encerrado',false)::text;
select throws_ok($$select public.ride_save_cost_center(pg_temp.u('org'),'com espaço','Inválido',true)$$,'P0001','invalid_input','código de centro de custo fora do formato é recusado');
select is(jsonb_array_length(pg_temp.org(pg_temp.u('org'))->'cost_centers'),3,'a administradora lê os centros de custo da empresa');
insert into t select 'inv_b',public.ride_invite_member(pg_temp.u('org'),'client_b@test.local','member',60,gen_random_uuid())->>'token';
insert into t select 'inv_pa',public.ride_invite_member(pg_temp.u('org'),'provider_a@test.local','approver',60,gen_random_uuid())->>'token';
insert into t select 'inv_pb',public.ride_invite_member(pg_temp.u('org'),'provider_b@test.local','member',60,gen_random_uuid())->>'token';
select tests.authenticate_as('client_b');
select is(public.ride_join_account(pg_temp.g('inv_b'),true),'accepted','colaboradora entra por adesão');
select tests.authenticate_as('provider_a');
select is(public.ride_join_account(pg_temp.g('inv_pa'),true),'accepted','aprovador entra por adesão');
select tests.authenticate_as('provider_b');
select is(public.ride_join_account(pg_temp.g('inv_pb'),true),'accepted','futuro operador entra por adesão');
select throws_ok($$select public.ride_set_member_role(pg_temp.u('org'),tests.uid('provider_b'),'operator',null)$$,'P0001','ride_account_role_required','colaborador não define papéis');
select tests.authenticate_as('client_a');
select ok(public.ride_set_member_role(pg_temp.u('org'),tests.uid('provider_b'),'operator',null),'a administradora define o operador da central');
select throws_ok($$select public.ride_set_member_role(pg_temp.u('org'),tests.uid('client_a'),'member',null)$$,'P0001','invalid_input','o papel de quem abriu a conta não muda');
select throws_ok($$select public.ride_set_member_role(pg_temp.u('org'),tests.uid('provider_b'),'admin',null)$$,'P0001','invalid_input','ninguém recebe o papel de administrador');
select throws_ok($$select public.ride_set_member_role(pg_temp.u('org'),tests.uid('provider_e'),'member',null)$$,'P0001','invalid_input','quem não é da empresa não recebe papel');
select tests.authenticate_as('provider_d');
insert into t select 'cc_b',public.ride_save_cost_center(pg_temp.u('org_b'),'GERAL','Geral',true)::text;
insert into t select 'inv_e',public.ride_invite_member(pg_temp.u('org_b'),'provider_e@test.local','manager',60,gen_random_uuid())->>'token';
select tests.authenticate_as('provider_e');
select is(public.ride_join_account(pg_temp.g('inv_e'),true),'accepted','gestor da empresa B entra por adesão');
select tests.clear_authentication();

-- Programas registrados pela operação financeira, com verba de referência fictícia.
select pg_temp.save_program('p_main','org','Viagens a trabalho',pg_temp.n('x')*2,pg_temp.n('x')*2,null,null,null,null,now()-interval '1 hour',now()+interval '10 days','none',false);
select pg_temp.save_program('p_part','org','Voucher parcial',pg_temp.n('x')*10,pg_temp.n('part'),null,null,null,null,now()-interval '1 hour',now()+interval '10 days','rider',false);
select pg_temp.save_program('p_none','org','Sem excedente',pg_temp.n('x')*10,pg_temp.n('part'),null,null,null,null,now()-interval '1 hour',now()+interval '10 days','none',false);
select pg_temp.save_program('p_appr','org','Com autorização',pg_temp.n('x')*10,pg_temp.n('x')*2,null,null,null,null,now()-interval '1 hour',now()+interval '10 days','none',true);
select pg_temp.save_program('p_area','org','Só Vila Mariana',pg_temp.n('x')*10,pg_temp.n('x')*2,null,array['Vila Mariana'],null,null,now()-interval '1 hour',now()+interval '10 days','none',false);
select pg_temp.save_program('p_class','org','Só executivo',pg_temp.n('x')*10,pg_temp.n('x')*2,null,null,array['executivo'],null,now()-interval '1 hour',now()+interval '10 days','none',false);
select pg_temp.save_program('p_old','org','Vencido',pg_temp.n('x')*10,pg_temp.n('x')*2,null,null,null,null,now()-interval '10 days',now()-interval '1 day','none',false);
select pg_temp.save_program('p_limit','org','Limite por colaborador',pg_temp.n('x')*10,pg_temp.n('x')*2,pg_temp.n('x'),null,null,null,now()-interval '1 hour',now()+interval '10 days','none',false);
select pg_temp.save_program('p_group','org','Só diretoria',pg_temp.n('x')*10,pg_temp.n('x')*2,null,null,null,'diretoria',now()-interval '1 hour',now()+interval '10 days','none',false);
select pg_temp.save_program('p_guest','org','Convidados',pg_temp.n('x')*10,pg_temp.n('x')*2,null,null,null,null,now()-interval '1 hour',now()+interval '10 days','none',false);
select pg_temp.save_program('p_b','org_b','Programa da empresa B',pg_temp.n('x')*10,pg_temp.n('x')*2,null,null,null,null,now()-interval '1 hour',now()+interval '10 days','none',false);
select is((select count(*) from private.ride_voucher_programs where environment='live'),0::bigint,'produção não recebe nenhum programa');
select is((select count(*) from public.audit_log where action='ride.voucher_program'),11::bigint,'cada registro de programa fica na auditoria');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_save_ride_voucher_program(pg_temp.u('p_main'),pg_temp.u('org_b'),'Troca de empresa',1000,500,null,null,null,null,now(),now()+interval '1 day','none',false,'ref','ref',true)$$,
 'P0001','idempotency_conflict','um programa não muda de empresa');
select throws_ok($$select public.admin_save_ride_voucher_program(gen_random_uuid(),pg_temp.u('org'),'Valor acima da verba',1000,2000,null,null,null,null,now(),now()+interval '1 day','none',false,'ref','ref',true)$$,
 'P0001','invalid_input','valor por viagem acima do orçamento é recusado');
select throws_ok($$select public.admin_save_ride_voucher_program(gen_random_uuid(),pg_temp.u('org'),'Praça sem regra',1000,500,null,array['Praça desconhecida'],null,null,now(),now()+interval '1 day','none',false,'ref','ref',true)$$,
 'P0001','ride_feature_disabled','programa não é habilitado em praça sem regra');
select tests.authenticate_as('client_a');
select is((pg_temp.program(pg_temp.u('org'),pg_temp.u('p_main'))->>'budget_cents')::int,pg_temp.n('x')*2,'a administradora lê o orçamento do programa');
select is((pg_temp.program(pg_temp.u('org'),pg_temp.u('p_main'))->>'committed_cents')::int,0,'o saldo inicial não tem nada comprometido');
select tests.authenticate_as('client_b');
select is(pg_temp.program(pg_temp.u('org'),pg_temp.u('p_main'))->>'budget_cents',null,'colaboradora não lê o orçamento');
select is(pg_temp.program(pg_temp.u('org'),pg_temp.u('p_main'))->>'excess_payer','none','colaboradora lê as regras do programa');
select is(pg_temp.program(pg_temp.u('org'),pg_temp.u('p_group')),null::jsonb,'programa de outro grupo não aparece para a colaboradora');
select throws_ok($$select private.ride_voucher_reserve()$$,'42501',null,'rotina privada não é chamada pelo cliente');
select throws_ok($$select * from private.ride_voucher_programs$$,'42501',null,'os programas não são lidos direto pelo cliente');
select throws_ok($$select * from private.ride_voucher_grants$$,'42501',null,'as reservas não são lidas direto pelo cliente');
select throws_ok($$select * from private.ride_trip_grants$$,'42501',null,'as autorizações não são lidas direto pelo cliente');
select tests.authenticate_anon();
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),gen_random_uuid(),gen_random_uuid())$$,'42501',null,'visitante sem sessão não cota pelo perfil profissional');
select throws_ok($$select public.ride_redeem_voucher(gen_random_uuid(),'pix')$$,'42501',null,'visitante sem sessão não usa voucher');
select throws_ok($$select public.ride_answer_guest_invite(repeat('a',64),true,gen_random_uuid())$$,'42501',null,'visitante sem sessão não responde convite');
select throws_ok($$select public.ride_org_report(gen_random_uuid(),null)$$,'42501',null,'visitante sem sessão não lê relatório');

-- B7.1 · A mesma pessoa cota pelo perfil pessoal (sem financiamento) e pelo profissional (com financiamento).
select tests.authenticate_as('client_b');
insert into t values('k_personal',gen_random_uuid()::text),('k_work',gen_random_uuid()::text);
insert into t select 'q_personal',public.ride_quote(pg_temp.u('k_personal'),null,null,pg_temp.trip())->>'id';
insert into t select 'q_work',public.ride_quote_funded(pg_temp.u('k_work'),null,pg_temp.trip(),pg_temp.u('p_main'),pg_temp.u('cc1'))->>'id';
select is((public.ride_quote_funded(pg_temp.u('k_work'),null,pg_temp.trip(),pg_temp.u('p_main'),pg_temp.u('cc1'))->>'id')::uuid,pg_temp.u('q_work'),'repetir a cotação profissional devolve a mesma cotação');
select throws_ok($$select public.ride_quote_funded(pg_temp.u('k_work'),null,pg_temp.trip(),pg_temp.u('p_main'),pg_temp.u('cc2'))$$,'P0001','idempotency_conflict','mesma chave com outro centro de custo é conflito');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_main'),pg_temp.u('cc_off'))$$,'P0001','invalid_input','centro de custo inativo é recusado');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_main'),pg_temp.u('cc_b'))$$,'P0001','invalid_input','centro de custo de outra empresa é recusado');
select ok(not (pg_temp.dash_quote(pg_temp.u('q_personal')) ? 'funding'),'a cotação pessoal não tem bloco de financiamento');
select is(pg_temp.dash_quote(pg_temp.u('q_work'))#>>'{funding,kind}','voucher','a cotação profissional informa o voucher');
select is(pg_temp.dash_quote(pg_temp.u('q_work'))#>>'{funding,role}','rider','quem cota pelo perfil profissional é quem viaja');
select is(pg_temp.dash_quote(pg_temp.u('q_work'))#>>'{funding,account_name}','Empresa de ensaio A','a cotação informa a empresa pagadora');
select is((pg_temp.dash_quote(pg_temp.u('q_work'))#>>'{legs,0,voucher_cents}')::int,pg_temp.n('x'),'o voucher cobre a tarifa inteira neste programa');
select is((pg_temp.dash_quote(pg_temp.u('q_work'))#>>'{legs,0,excess_cents}')::int,0,'sem excedente a cargo de quem viaja');
select tests.clear_authentication();
select is((select count(*) from private.ride_quote_funding where quote_id=pg_temp.u('q_personal')),0::bigint,'a cotação pessoal não tem linha de financiamento');
select results_eq($$select kind,account_id,program_id,cost_center_id,member_id,payer_id from private.ride_quote_funding where quote_id=pg_temp.u('q_work')$$,
 $$select 'voucher',pg_temp.u('org'),pg_temp.u('p_main'),pg_temp.u('cc1'),tests.uid('client_b'),tests.uid('client_b')$$,
 'a cotação profissional registra empresa, programa e centro de custo, e quem viaja continua pagador');
select is((select count(*) from private.ride_voucher_grants),0::bigint,'cotar não reserva saldo');

-- B8.1 · Saldo inicial B = 2 tarifas. A primeira viagem usa metade; dois aceites disputam a outra metade.
select tests.authenticate_as('client_b');
insert into t select 'r_personal',public.ride_consent(pg_temp.u('q_personal'),true)->>'ride_id';
insert into t select 'r_work',public.ride_consent(pg_temp.u('q_work'),true)->>'ride_id';
select is(public.ride_consent(pg_temp.u('q_work'),true)->>'ride_id',pg_temp.g('r_work'),'repetir o aceite devolve a mesma corrida');
insert into t select 'q_last1',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_main'),pg_temp.u('cc1'))->>'id';
select tests.authenticate_as('provider_a');
insert into t select 'q_last2',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_main'),pg_temp.u('cc1'))->>'id';
select tests.authenticate_as('client_b');
insert into t select 'r_last1',public.ride_consent(pg_temp.u('q_last1'),true)->>'ride_id';
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_consent(pg_temp.u('q_last2'),true)$$,'P0001','ride_voucher_unavailable','o segundo aceite do último saldo é recusado');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_main'),pg_temp.u('cc1'))$$,'P0001','ride_voucher_unavailable','sem saldo não há nova cotação profissional');
select tests.clear_authentication();
select pg_temp.keep_leg('l_personal','r_personal');
select pg_temp.keep_leg('l_work','r_work');
select pg_temp.keep_leg('l_last1','r_last1');
select is((select count(*) from public.rides where quote_id=pg_temp.u('q_last2')),0::bigint,'o aceite recusado não cria corrida nem cai no pagamento pessoal');
select is((select status from private.ride_quotes where id=pg_temp.u('q_last2')),'awaiting_consent','a cotação recusada continua sem aceite');
select is((select count(*) from private.ride_voucher_grants where program_id=pg_temp.u('p_main')),2::bigint,'o orçamento de duas tarifas gera exatamente duas reservas');
select is(private.ride_voucher_commitment(pg_temp.u('p_main'),null),(pg_temp.n('x')*2)::bigint,'o comprometido é igual ao orçamento, sem passar dele');
select is((select count(*) from private.ride_voucher_grants where leg_id=pg_temp.u('l_personal')),0::bigint,'a corrida pessoal não reserva voucher');
select results_eq($$select b.source,b.owner_id,b.restricted_leg,b.awarded_cents,b.available_cents,b.funding_ref,g.account_id,g.member_id,g.cost_center_id,g.granted_cents
  from private.ride_voucher_grants g join private.ride_benefits b on b.id=g.benefit_id where g.leg_id=pg_temp.u('l_work')$$,
 $$select 'corporate',tests.uid('client_b'),pg_temp.u('l_work'),pg_temp.n('x'),pg_temp.n('x'),'voucher:'||pg_temp.g('p_main'),pg_temp.u('org'),tests.uid('client_b'),pg_temp.u('cc1'),pg_temp.n('x')$$,
 'a reserva é um benefício corporativo da etapa 4, nominal e preso ao trecho');
select is((select payer_id from public.ride_legs where id=pg_temp.u('l_work')),tests.uid('client_b'),'quem viaja continua pagador do trecho');
select throws_ok($$insert into private.ride_voucher_grants(benefit_id,leg_id,program_id,account_id,member_id,granted_cents)
  select g.benefit_id,pg_temp.u('l_last1'),g.program_id,g.account_id,g.member_id,1 from private.ride_voucher_grants g where g.leg_id=pg_temp.u('l_work')$$,
 '23505',null,'um benefício não vira duas reservas');
select throws_ok($$insert into private.ride_voucher_grants(benefit_id,leg_id,program_id,account_id,member_id,granted_cents)
  select o.benefit_id,pg_temp.u('l_work'),o.program_id,o.account_id,o.member_id,1 from private.ride_voucher_grants o where o.leg_id=pg_temp.u('l_last1')$$,
 '23505',null,'um trecho não recebe duas reservas');
select tests.authenticate_as('client_b');
select is(pg_temp.dash_leg(pg_temp.u('l_work'))#>>'{funding,kind}','voucher','o trecho informa o voucher a quem viaja');
select is((pg_temp.dash_leg(pg_temp.u('l_work'))#>>'{funding,voucher_cents}')::int,pg_temp.n('x'),'o trecho informa o valor do voucher a quem paga');
select ok(not (pg_temp.dash_leg(pg_temp.u('l_personal')) ? 'funding'),'o trecho pessoal não tem financiamento');
select tests.authenticate_as('client_a');
select is((pg_temp.program(pg_temp.u('org'),pg_temp.u('p_main'))->>'committed_cents')::int,pg_temp.n('x')*2,'a administradora lê o comprometido do programa');

-- B8.2 · Uma reserva por trecho; repetir o uso devolve o mesmo resultado e um único lançamento.
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_redeem_voucher(pg_temp.u('l_work'),'pix')$$,'P0001','ride_financial_state','o voucher só é usado depois do trecho concluído');
select throws_ok($$select public.ride_redeem_voucher(pg_temp.u('l_work'),'dinheiro')$$,'P0001','invalid_input','forma de pagamento fora da lista é recusada');
select tests.clear_authentication();
select is((select count(*) from private.ride_payment_orders where leg_id=pg_temp.u('l_work')),0::bigint,'a tentativa antes da conclusão não deixa pedido aberto');
select pg_temp.finish_leg('l_work');
select pg_temp.finish_leg('l_personal');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_redeem_voucher(pg_temp.u('l_work'),'pix')$$,'P0001','ride_voucher_unavailable','outra pessoa da empresa não usa o voucher deste trecho');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_redeem_voucher(pg_temp.u('l_work'),'pix')$$,'P0001','ride_voucher_unavailable','a administradora não usa o voucher no lugar de quem viajou');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_redeem_voucher(pg_temp.u('l_personal'),'pix')$$,'P0001','ride_voucher_unavailable','corrida pessoal não tem voucher para usar');
insert into t select 'redeem',public.ride_redeem_voucher(pg_temp.u('l_work'),'pix')::text;
select is(public.ride_redeem_voucher(pg_temp.u('l_work'),'pix')::text,pg_temp.g('redeem'),'repetir o uso do voucher devolve o mesmo resultado');
select is((pg_temp.g('redeem')::jsonb->>'applied_cents')::int,pg_temp.n('x'),'o voucher aplicado é a tarifa inteira');
select is((pg_temp.g('redeem')::jsonb->>'remainder_cents')::int,0,'nada fica a cargo de quem viaja');
select throws_ok($$select public.ride_redeem_voucher(pg_temp.u('l_work'),'card')$$,'P0001','ride_operation_conflict','repetir com outra forma de pagamento é conflito');
insert into t select 'o_work',pg_temp.g('redeem')::jsonb->>'order_id';
insert into t select 'o_personal',public.ride_open_payment_order(pg_temp.u('l_personal'),'pix')::text;
select tests.clear_authentication();
select is((select count(*) from private.ride_benefit_uses u join private.ride_voucher_grants g on g.benefit_id=u.benefit_id where g.leg_id=pg_temp.u('l_work')),1::bigint,
 'o uso repetido gera um único lançamento do benefício');
select results_eq($$select status,amount_cents,received_cents from private.ride_payment_orders where id=pg_temp.u('o_work')$$,
 $$select 'paid',pg_temp.n('x'),pg_temp.n('x')$$,'o pedido da etapa 4 fica quitado pelo voucher');
select is((select count(*) from private.ride_financial_events where leg_id=pg_temp.u('l_work') and kind='benefit' and benefit_delta=pg_temp.n('x')),1::bigint,
 'o livro registra o voucher uma única vez, como benefício');
select is(private.ride_voucher_commitment(pg_temp.u('p_main'),null),(pg_temp.n('x')*2)::bigint,'usar o voucher não muda o comprometido');

-- B8.3 · Estorno parcial pelo benefício: só os centavos restaurados voltam ao orçamento.
select tests.authenticate_as('client_b');
insert into t select 'case',public.ride_request_order_review(pg_temp.u('o_work'),400,'Parte do trajeto não foi feita',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.u('case'),true,'Conferido no ensaio'),'approved','a operação aprova o estorno parcial');
select tests.clear_authentication();
select is(private.ride_voucher_commitment(pg_temp.u('p_main'),null),(pg_temp.n('x')*2)::bigint,'a decisão sozinha não devolve saldo');
select tests.authenticate_as('admin');
select is(public.ride_refund_order_source(pg_temp.u('case'),'benefit',0,'ENSAIO-205C'),'settled','o estorno volta à verba de origem');
select is(public.ride_refund_order_source(pg_temp.u('case'),'benefit',0,'ENSAIO-205C'),'settled','repetir o estorno não devolve duas vezes');
select tests.clear_authentication();
select is(private.ride_voucher_commitment(pg_temp.u('p_main'),null),(pg_temp.n('x')*2-400)::bigint,'o comprometido cai exatamente os centavos restaurados');
select results_eq($$select u.applied_cents,u.restored_cents from private.ride_benefit_uses u where u.order_id=pg_temp.u('o_work')$$,$$select pg_temp.n('x'),400$$,
 'aplicado e restaurado ficam no lançamento do benefício');
select is((select sum(cash_delta::bigint+receivable_delta+processing_expense_delta+benefit_delta-driver_delta-fee_delta) from private.ride_financial_events),0::numeric,
 'o livro fecha depois do voucher e do estorno');
select tests.authenticate_as('client_a');
select is((pg_temp.program(pg_temp.u('org'),pg_temp.u('p_main'))->>'budget_cents')::int-(pg_temp.program(pg_temp.u('org'),pg_temp.u('p_main'))->>'committed_cents')::int,400,
 'saldo final = orçamento − aplicado e reservado + restaurado');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_consent(pg_temp.u('q_last2'),true)$$,'P0001','ride_voucher_unavailable','o saldo restaurado não paga uma tarifa inteira');

-- B8.6 · Trecho cancelado libera a reserva, e só então o aceite que tinha sido recusado passa.
select tests.authenticate_as('client_b');
select lives_ok($$select public.ride_transition(pg_temp.u('l_last1'),'cancelled',gen_random_uuid())$$,'quem viaja cancela o trecho ainda sem motorista');
select tests.clear_authentication();
select is(private.ride_voucher_commitment(pg_temp.u('p_main'),null),(pg_temp.n('x')-400)::bigint,'o cancelamento libera a reserva do trecho');
select is((select count(*) from private.ride_voucher_grants where leg_id=pg_temp.u('l_last1')),1::bigint,'a reserva cancelada continua registrada');
select tests.authenticate_as('provider_a');
insert into t select 'r_last2',public.ride_consent(pg_temp.u('q_last2'),true)->>'ride_id';
select ok(pg_temp.g('r_last2') is not null,'com o saldo liberado o aceite é atendido');
select tests.clear_authentication();
select is(private.ride_voucher_commitment(pg_temp.u('p_main'),null),(pg_temp.n('x')*2-400)::bigint,'a nova reserva entra no comprometido');
select is(private.ride_voucher_commitment(pg_temp.u('p_main'),tests.uid('provider_a')),pg_temp.n('x')::bigint,'o comprometido por pessoa separa cada colaborador');
update private.ride_benefits b set valid_until=now()-interval '1 minute' from private.ride_voucher_grants g join public.ride_legs l on l.id=g.leg_id
 where b.id=g.benefit_id and l.ride_id=pg_temp.u('r_last2');
select is(private.ride_voucher_commitment(pg_temp.u('p_main'),null),(pg_temp.n('x')-400)::bigint,'benefício vencido sem uso também libera a reserva');

-- B8.4 · Excedente a cargo de quem viaja aparece na cotação e é exatamente o que sobra no pedido.
select tests.authenticate_as('client_b');
insert into t select 'q_part',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_part'),pg_temp.u('cc1'))->>'id';
select is((pg_temp.dash_quote(pg_temp.u('q_part'))#>>'{legs,0,voucher_cents}')::int,pg_temp.n('part'),'a cotação mostra o valor coberto pelo voucher');
select is((pg_temp.dash_quote(pg_temp.u('q_part'))#>>'{legs,0,excess_cents}')::int,500,'a cotação mostra o excedente antes do aceite');
select is((pg_temp.dash_quote(pg_temp.u('q_part'))#>>'{funding,excess_cents}')::int,500,'o bloco de financiamento soma o excedente');
select is((pg_temp.dash_quote(pg_temp.u('q_part'))->>'total_cents')::int,pg_temp.n('x'),'quem viaja vê a tarifa inteira que está aceitando');
insert into t select 'r_part',public.ride_consent(pg_temp.u('q_part'),true)->>'ride_id';
select tests.clear_authentication();
select pg_temp.keep_leg('l_part','r_part');
select is((select b.awarded_cents from private.ride_voucher_grants g join private.ride_benefits b on b.id=g.benefit_id where g.leg_id=pg_temp.u('l_part')),pg_temp.n('part'),
 'a reserva é só da parte da empresa');
select pg_temp.finish_leg('l_part');
select tests.authenticate_as('client_b');
insert into t select 'redeem_part',public.ride_redeem_voucher(pg_temp.u('l_part'),'card')::text;
select is((pg_temp.g('redeem_part')::jsonb->>'applied_cents')::int,pg_temp.n('part'),'o voucher paga a parte da empresa');
select is((pg_temp.g('redeem_part')::jsonb->>'remainder_cents')::int,500,'a diferença no pedido é igual ao excedente aceito');
select is(public.ride_redeem_voucher(pg_temp.u('l_part'),'card')::text,pg_temp.g('redeem_part'),'repetir o uso parcial devolve o mesmo resultado');
select tests.clear_authentication();
select results_eq($$select status,method,amount_cents-received_cents from private.ride_payment_orders where id=(pg_temp.g('redeem_part')::jsonb->>'order_id')::uuid$$,
 $$select 'open','card',500$$,'o mesmo pedido fica aberto pelo excedente, na forma escolhida por quem viaja');

-- B8.5 · Sem pagador do excedente, tarifa acima do voucher não gera cotação.
select tests.authenticate_as('client_b');
insert into t values('k_none',gen_random_uuid()::text);
select throws_ok($$select public.ride_quote_funded(pg_temp.u('k_none'),null,pg_temp.trip(),pg_temp.u('p_none'),pg_temp.u('cc1'))$$,'P0001','ride_voucher_unavailable',
 'tarifa acima do voucher sem pagador do excedente é recusada');
select tests.clear_authentication();
select is((select count(*) from private.ride_quotes where request_key=pg_temp.u('k_none')),0::bigint,'a recusa não deixa cotação criada');

-- B8.7 · Praça, categoria, validade e grupo.
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_area'),pg_temp.u('cc1'))$$,'P0001','ride_voucher_unavailable','trajeto fora das praças do programa é recusado');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_class'),pg_temp.u('cc1'))$$,'P0001','ride_voucher_unavailable','categoria fora do programa é recusada');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_old'),pg_temp.u('cc1'))$$,'P0001','ride_voucher_unavailable','programa fora da validade é recusado');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_group'),pg_temp.u('cc1'))$$,'P0001','ride_voucher_unavailable','programa de outro grupo é recusado');
select lives_ok($$select public.ride_quote_funded(gen_random_uuid(),null,'[{"origin":"Vila Mariana","destination":"Saúde","payer":"passenger"}]',pg_temp.u('p_guest'),pg_temp.u('cc1'))$$,
 'programa sem lista de praças aceita outra praça habilitada');
select tests.authenticate_as('client_a');
select ok(public.ride_set_member_role(pg_temp.u('org'),tests.uid('client_b'),'member','diretoria'),'a administradora define o grupo da colaboradora');
select tests.authenticate_as('client_b');
select lives_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_group'),pg_temp.u('cc1'))$$,'no grupo certo a cotação é atendida');
select ok(pg_temp.program(pg_temp.u('org'),pg_temp.u('p_group')) is not null,'o programa do grupo passa a aparecer para a colaboradora');
select tests.clear_authentication();
select is((select private.ride_voucher_plan(p,jsonb_build_object('origin','Saúde','destination','Jabaquara','pickup_at',now(),'duration_minutes',18,'fare_cents',3000,'class_code','executivo'),null)
  from private.ride_voucher_programs p where p.id=pg_temp.u('p_class')),jsonb_build_object('voucher_cents',3000,'excess_cents',0),'a categoria do programa é atendida');
select throws_ok($$select private.ride_voucher_plan(p,jsonb_build_object('origin','Saúde','destination','Jabaquara','pickup_at',now(),'duration_minutes',18,'fare_cents',3000,'class_code','comum'),null)
  from private.ride_voucher_programs p where p.id=pg_temp.u('p_class')$$,'P0001','ride_voucher_unavailable','outra categoria é recusada');
select is((select private.ride_voucher_plan(p,jsonb_build_object('origin','Vila Mariana','destination','Vila Mariana','pickup_at',now(),'duration_minutes',5,'fare_cents',900),null)
  from private.ride_voucher_programs p where p.id=pg_temp.u('p_area')),jsonb_build_object('voucher_cents',900,'excess_cents',0),'a praça do programa é atendida');
select throws_ok($$select private.ride_voucher_plan(p,jsonb_build_object('origin','Vila Mariana','destination','Saúde','pickup_at',now(),'duration_minutes',5,'fare_cents',900),null)
  from private.ride_voucher_programs p where p.id=pg_temp.u('p_area')$$,'P0001','ride_voucher_unavailable','destino fora das praças do programa é recusado');
update private.ride_party_rules set enabled=false where environment='simulation' and capability='voucher';
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_part'),pg_temp.u('cc1'))$$,'P0001','ride_feature_disabled','com o portão de voucher fechado nada é cotado');
select tests.clear_authentication();
update private.ride_party_rules set enabled=true where environment='simulation' and capability='voucher';
update private.ride_accounts set verified_until=now()-interval '1 minute' where id=pg_temp.u('org');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_part'),pg_temp.u('cc1'))$$,'P0001','ride_feature_disabled','com a conferência da empresa vencida nada é cotado');
select tests.clear_authentication();
update private.ride_accounts set verified_until=now()+interval '30 days' where id=pg_temp.u('org');

-- B8.8 · Limite por colaborador: vale na cotação e de novo no aceite.
select tests.authenticate_as('client_b');
insert into t select 'q_lim1',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_limit'),pg_temp.u('cc1'))->>'id';
insert into t select 'q_lim2',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_limit'),pg_temp.u('cc1'))->>'id';
insert into t select 'r_lim1',public.ride_consent(pg_temp.u('q_lim1'),true)->>'ride_id';
select throws_ok($$select public.ride_consent(pg_temp.u('q_lim2'),true)$$,'P0001','ride_voucher_unavailable','o aceite acima do limite da colaboradora é recusado');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_limit'),pg_temp.u('cc1'))$$,'P0001','ride_voucher_unavailable','no limite, a colaboradora não cota de novo pelo programa');
select tests.authenticate_as('provider_a');
select lives_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_limit'),pg_temp.u('cc1'))$$,'o limite de uma pessoa não bloqueia a outra');
select tests.clear_authentication();
select is(private.ride_voucher_commitment(pg_temp.u('p_limit'),tests.uid('client_b')),pg_temp.n('x')::bigint,'o comprometido da colaboradora fica no limite');
select is((select count(*) from private.ride_voucher_grants where program_id=pg_temp.u('p_limit')),1::bigint,'o limite por colaborador gera uma única reserva');

-- B7.5 e B7.7 · Programa com autorização: sem pedido aprovado não há cotação; aprovador não aprova o próprio pedido.
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_appr'),pg_temp.u('cc1'))$$,'P0001','ride_approval_required','programa com autorização recusa cotação sem pedido');
insert into t values('grant_b',gen_random_uuid()::text),('grant_pa',gen_random_uuid()::text),('grant_no',gen_random_uuid()::text);
select is(public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('p_appr'),pg_temp.u('cc1'),'Visita a cliente',now()-interval '1 hour',now()+interval '2 days',pg_temp.u('grant_b')),
 pg_temp.u('grant_b'),'a colaboradora pede a autorização');
select is(public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('p_appr'),pg_temp.u('cc1'),'Visita a cliente',now()-interval '1 hour',now()+interval '2 days',pg_temp.u('grant_b')),
 pg_temp.u('grant_b'),'repetir o pedido devolve a mesma autorização');
select throws_ok($$select public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('p_appr'),pg_temp.u('cc1'),'Outro motivo',now()-interval '1 hour',now()+interval '2 days',pg_temp.u('grant_b'))$$,
 'P0001','idempotency_conflict','mesma chave com outro motivo é conflito');
select throws_ok($$select public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('p_appr'),pg_temp.u('cc1'),'Período invertido',now()+interval '2 days',now()+interval '1 day',gen_random_uuid())$$,
 'P0001','invalid_input','período invertido é recusado');
select throws_ok($$select public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('p_b'),pg_temp.u('cc1'),'Programa alheio',now(),now()+interval '1 day',gen_random_uuid())$$,
 'P0001','invalid_input','programa de outra empresa não entra no pedido');
select ok(public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('p_appr'),pg_temp.u('cc1'),'Pedido a recusar',now()-interval '1 hour',now()+interval '2 days',pg_temp.u('grant_no')) is not null,
 'a colaboradora faz um segundo pedido');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_appr'),pg_temp.u('cc1'),pg_temp.u('grant_b'))$$,'P0001','ride_approval_required',
 'pedido ainda não aprovado não libera a cotação');
select throws_ok($$select public.ride_decide_trip_grant(pg_temp.u('grant_b'),true)$$,'P0001','ride_account_role_required','colaboradora não decide autorizações');
select is((select g->>'mine' from jsonb_array_elements(pg_temp.org(pg_temp.u('org'))->'grants') g where g->>'id'=pg_temp.g('grant_b')),'true','a colaboradora vê o próprio pedido');
select tests.authenticate_as('provider_a');
select is(public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('p_appr'),pg_temp.u('cc1'),'Reunião externa',now()-interval '1 hour',now()+interval '2 days',pg_temp.u('grant_pa')),
 pg_temp.u('grant_pa'),'o aprovador também pede autorização para si');
select throws_ok($$select public.ride_decide_trip_grant(pg_temp.u('grant_pa'),true)$$,'P0001','not_allowed','o aprovador não aprova o próprio pedido');
select throws_ok($$select public.ride_decide_trip_grant(pg_temp.u('grant_pa'),false)$$,'P0001','not_allowed','o aprovador também não recusa o próprio pedido');
select throws_ok($$select public.ride_decide_trip_grant(gen_random_uuid(),true)$$,'P0001','ride_account_role_required','autorização inexistente responde como a de outra empresa');
select is((select g->>'beneficiary' from jsonb_array_elements(pg_temp.org(pg_temp.u('org'))->'grants') g where g->>'id'=pg_temp.g('grant_b')),pg_temp.g('name_b'),'o aprovador vê quem pediu');
select is(public.ride_decide_trip_grant(pg_temp.u('grant_b'),true),'approved','o aprovador aprova o pedido de outra pessoa');
select is(public.ride_decide_trip_grant(pg_temp.u('grant_b'),true),'approved','repetir a aprovação devolve o mesmo resultado');
select throws_ok($$select public.ride_decide_trip_grant(pg_temp.u('grant_b'),false)$$,'P0001','ride_operation_conflict','decisão tomada não é trocada');
select is(public.ride_decide_trip_grant(pg_temp.u('grant_no'),false),'rejected','o aprovador recusa um pedido');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_appr'),pg_temp.u('cc1'),pg_temp.u('grant_b'))$$,'P0001','ride_approval_required',
 'a autorização de uma pessoa não serve para outra');
select tests.authenticate_as('client_a');
select is(public.ride_decide_trip_grant(pg_temp.u('grant_pa'),true),'approved','outra pessoa com papel aprova o pedido do aprovador');
select tests.clear_authentication();
select results_eq($$select status,approved_by,beneficiary_id from private.ride_trip_grants where id=pg_temp.u('grant_pa')$$,
 $$select 'approved',tests.uid('client_a'),tests.uid('provider_a')$$,'quem aprova nunca é quem viaja');

-- B7.6 · A autorização vale para uma única viagem.
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_appr'),pg_temp.u('cc1'),pg_temp.u('grant_no'))$$,'P0001','ride_approval_required','pedido recusado não libera a cotação');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_appr'),pg_temp.u('cc2'),pg_temp.u('grant_b'))$$,'P0001','ride_approval_required','a autorização vale só para o centro de custo aprovado');
insert into t select 'q_g1',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_appr'),pg_temp.u('cc1'),pg_temp.u('grant_b'))->>'id';
insert into t select 'q_g2',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_appr'),pg_temp.u('cc1'),pg_temp.u('grant_b'))->>'id';
insert into t select 'r_g1',public.ride_consent(pg_temp.u('q_g1'),true)->>'ride_id';
select throws_ok($$select public.ride_consent(pg_temp.u('q_g2'),true)$$,'P0001','ride_approval_required','a segunda viagem com a mesma autorização é recusada no aceite');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_appr'),pg_temp.u('cc1'),pg_temp.u('grant_b'))$$,'P0001','ride_approval_required','autorização usada não libera nova cotação');
select is((select g->>'status' from jsonb_array_elements(pg_temp.org(pg_temp.u('org'))->'grants') g where g->>'id'=pg_temp.g('grant_b')),'used','a colaboradora vê a autorização como usada');
select tests.clear_authentication();
select results_eq($$select status,ride_id from private.ride_trip_grants where id=pg_temp.u('grant_b')$$,$$select 'used',pg_temp.u('r_g1')$$,'a autorização fica presa à viagem que a usou');
select is((select count(*) from public.rides where quote_id=pg_temp.u('q_g2')),0::bigint,'a segunda cotação não vira corrida');
select is((select grant_id from private.ride_leg_funding f join public.ride_legs l on l.id=f.leg_id where l.ride_id=pg_temp.u('r_g1')),pg_temp.u('grant_b'),'o trecho guarda a autorização usada');

-- Ida e volta com uma autorização: uma viagem, dois trechos, duas reservas.
select tests.authenticate_as('provider_a');
insert into t select 'q_round',public.ride_quote_funded(gen_random_uuid(),null,
 '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"},{"origin":"Jabaquara","destination":"Saúde","payer":"passenger"}]',
 pg_temp.u('p_appr'),pg_temp.u('cc1'),pg_temp.u('grant_pa'))->>'id';
select is(jsonb_array_length(pg_temp.dash_quote(pg_temp.u('q_round'))->'legs'),2,'a cotação profissional aceita ida e volta');
select ok((pg_temp.dash_quote(pg_temp.u('q_round'))#>>'{legs,1,voucher_cents}')::int>0,'cada trecho mostra o seu voucher');
insert into t select 'r_round',public.ride_consent(pg_temp.u('q_round'),true)->>'ride_id';
select tests.clear_authentication();
select is((select count(*) from private.ride_voucher_grants g join public.ride_legs l on l.id=g.leg_id where l.ride_id=pg_temp.u('r_round')),2::bigint,'cada trecho recebe a sua reserva');
select results_eq($$select status,ride_id from private.ride_trip_grants where id=pg_temp.u('grant_pa')$$,$$select 'used',pg_temp.u('r_round')$$,
 'a autorização cobre os dois trechos da mesma viagem e fica usada');
select is((select sum(b.awarded_cents) from private.ride_voucher_grants g join private.ride_benefits b on b.id=g.benefit_id join public.ride_legs l on l.id=g.leg_id
  where l.ride_id=pg_temp.u('r_round')),(select sum(l.fare_cents) from public.ride_legs l where l.ride_id=pg_temp.u('r_round')),'as reservas somam a tarifa dos dois trechos');

-- Regra alterada entre a cotação e o aceite: nada é cobrado além do que a pessoa aceitou.
select pg_temp.save_program('p_edit','org','Programa a alterar',pg_temp.n('x')*10,pg_temp.n('part'),null,null,null,null,now()-interval '1 hour',now()+interval '10 days','rider',false);
select tests.authenticate_as('client_b');
insert into t select 'q_edit',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_edit'),pg_temp.u('cc1'))->>'id';
insert into t select 'q_edit2',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_edit'),pg_temp.u('cc1'))->>'id';
select tests.authenticate_as('admin');
select is(public.admin_save_ride_voucher_program(pg_temp.u('p_edit'),pg_temp.u('org'),'Programa a alterar',pg_temp.n('x')*10,pg_temp.n('part')-100,null,null,null,null,
  now()-interval '1 hour',now()+interval '10 days','rider',false,'ficticio-o17-e5 verba','ficticio-o17-e5 contrato',true),pg_temp.u('p_edit'),'a operação reduz o valor por viagem');
select throws_ok($$select public.admin_save_ride_voucher_program(pg_temp.u('p_main'),pg_temp.u('org'),'Viagens a trabalho',1,1,null,null,null,null,
  now()-interval '1 hour',now()+interval '10 days','none',false,'ficticio-o17-e5 verba','ficticio-o17-e5 contrato',true)$$,'P0001','invalid_input','o orçamento não desce abaixo do comprometido');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_consent(pg_temp.u('q_edit'),true)$$,'P0001','ride_voucher_unavailable','excedente maior que o aceito exige nova cotação');
select tests.authenticate_as('admin');
select is(public.admin_save_ride_voucher_program(pg_temp.u('p_edit'),pg_temp.u('org'),'Programa a alterar',pg_temp.n('x')*10,pg_temp.n('part'),null,null,null,null,
  now()-interval '1 hour',now()+interval '10 days','rider',false,'ficticio-o17-e5 verba','ficticio-o17-e5 contrato',false),pg_temp.u('p_edit'),'a operação desabilita o programa');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_consent(pg_temp.u('q_edit2'),true)$$,'P0001','ride_voucher_unavailable','programa desabilitado não reserva saldo no aceite');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_edit'),pg_temp.u('cc1'))$$,'P0001','ride_voucher_unavailable','programa desabilitado não é cotado');
select tests.clear_authentication();
select is((select count(*) from private.ride_voucher_grants where program_id=pg_temp.u('p_edit')),0::bigint,'nenhuma reserva nasce de uma regra que mudou');
select is((select count(*) from public.rides where quote_id in (pg_temp.u('q_edit'),pg_temp.u('q_edit2'))),0::bigint,'os aceites recusados não criam corrida');

-- B7.2 · A central agenda para uma pessoa convidada, que viaja com a própria conta.
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_guest'),pg_temp.u('cc2'),'provider_e@test.local',pg_temp.trip(),null,30,gen_random_uuid())$$,
 'P0001','ride_account_role_required','quem não é da central não convida');
select tests.authenticate_as('provider_b');
insert into t values('gi_key',gen_random_uuid()::text),('gi2_key',gen_random_uuid()::text),('gi3_key',gen_random_uuid()::text),('gi4_key',gen_random_uuid()::text);
insert into t select 'gi',public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_guest'),pg_temp.u('cc2'),'Provider_E@test.local',pg_temp.trip(),null,30,pg_temp.u('gi_key'))->>'token';
select ok(pg_temp.g('gi') ~ '^[a-f0-9]{64}$','o convite de viagem devolve o código uma única vez');
select is(public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_guest'),pg_temp.u('cc2'),'Provider_E@test.local',pg_temp.trip(),null,30,pg_temp.u('gi_key'))->>'token',null,
 'repetir o convite não devolve o código de novo');
select throws_ok($$select public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_guest'),pg_temp.u('cc2'),'client_b@test.local',pg_temp.trip(),null,30,pg_temp.u('gi_key'))$$,
 'P0001','idempotency_conflict','mesma chave para outra pessoa é conflito');
select throws_ok($$select public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_guest'),pg_temp.u('cc2'),'provider_b@test.local',pg_temp.trip(),null,30,gen_random_uuid())$$,
 'P0001','invalid_input','o operador não convida a si mesmo');
select throws_ok($$select public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_guest'),pg_temp.u('cc2'),'provider_e@test.local','[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger","route_id":"00000000-0000-0000-0000-000000000001"}]',null,30,gen_random_uuid())$$,
 'P0001','invalid_input','o convite leva praças, nunca um trajeto medido de outra pessoa');
select throws_ok($$select public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_group'),pg_temp.u('cc2'),'provider_e@test.local',pg_temp.trip(),null,30,gen_random_uuid())$$,
 'P0001','ride_voucher_unavailable','programa restrito a um grupo não serve a convidado');
select throws_ok($$select public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_b'),pg_temp.u('cc2'),'provider_e@test.local',pg_temp.trip(),null,30,gen_random_uuid())$$,
 'P0001','invalid_input','programa de outra empresa não entra no convite');
insert into t select 'gi2',public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_guest'),pg_temp.u('cc2'),'provider_e@test.local',pg_temp.trip(),null,30,pg_temp.u('gi2_key'))->>'token';
insert into t select 'gi3',public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_guest'),pg_temp.u('cc2'),'provider_e@test.local',pg_temp.trip(),null,5,pg_temp.u('gi3_key'))->>'token';
insert into t select 'gi4',public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_part'),pg_temp.u('cc2'),'provider_e@test.local',pg_temp.trip(),null,30,pg_temp.u('gi4_key'))->>'token';
select tests.clear_authentication();
select is((select token_hash from private.ride_guest_invites where id=pg_temp.u('gi_key')),sha256(convert_to(pg_temp.g('gi'),'UTF8')),'só o resumo do código é guardado');
select is((select count(*) from information_schema.columns where table_schema='private' and table_name in ('ride_guest_invites','ride_trip_grants') and column_name ~ 'mail'),0::bigint,
 'o convite não guarda e-mail');
select results_eq($$select status,guest,beneficiary_id,approved_by from private.ride_trip_grants where id=pg_temp.u('gi_key')$$,
 $$select 'approved',true,null::uuid,tests.uid('provider_b')$$,'o convite nasce com uma autorização aprovada pela central');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_answer_guest_invite(pg_temp.g('gi'),true,gen_random_uuid())$$,'P0001','ride_invite_unavailable','destinatário errado não responde o convite');
select tests.authenticate_as('provider_e');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_guest'),pg_temp.u('cc2'),pg_temp.u('gi_key'))$$,'P0001','ride_account_role_required',
 'a pessoa convidada não cota pela empresa antes de aceitar');
insert into t values('ga_key',gen_random_uuid()::text);
insert into t select 'guest_answer',public.ride_answer_guest_invite(pg_temp.g('gi'),true,pg_temp.u('ga_key'))::text;
select is(pg_temp.g('guest_answer')::jsonb->>'status','accepted','a pessoa convidada aceita a viagem');
select is(public.ride_answer_guest_invite(pg_temp.g('gi'),true,pg_temp.u('ga_key'))::text,pg_temp.g('guest_answer'),'repetir o aceite devolve a mesma viagem');
select throws_ok($$select public.ride_answer_guest_invite(pg_temp.g('gi'),false,gen_random_uuid())$$,'P0001','ride_invite_unavailable','convite aceito não muda de resposta');
insert into t select 'r_guest',pg_temp.g('guest_answer')::jsonb->>'ride_id';
select is(public.ride_answer_guest_invite(pg_temp.g('gi2'),false,gen_random_uuid())->>'status','declined','recusar o convite não cria viagem');
select throws_ok($$select public.ride_answer_guest_invite(pg_temp.g('gi4'),true,gen_random_uuid())$$,'P0001','ride_voucher_unavailable',
 'convidado nunca fica com excedente: tarifa acima do voucher não é aceita');
select tests.clear_authentication();
select pg_temp.keep_leg('l_guest','r_guest');
select is((select passenger_id from public.rides where id=pg_temp.u('r_guest')),tests.uid('provider_e'),'a pessoa passageira é a convidada');
select results_eq($$select f.kind,f.account_id,f.cost_center_id,f.program_id,f.grant_id,f.member_id,f.payer_id from private.ride_leg_funding f where f.leg_id=pg_temp.u('l_guest')$$,
 $$select 'voucher',pg_temp.u('org'),pg_temp.u('cc2'),pg_temp.u('p_guest'),pg_temp.u('gi_key'),tests.uid('provider_e'),tests.uid('provider_e')$$,
 'o trecho registra a empresa pagadora, o centro de custo e a pessoa beneficiária');
select results_eq($$select status,beneficiary_id,ride_id from private.ride_trip_grants where id=pg_temp.u('gi_key')$$,
 $$select 'used',tests.uid('provider_e'),pg_temp.u('r_guest')$$,'a autorização do convite é usada uma vez, pela pessoa convidada');
select is((select count(*) from private.ride_account_members where account_id=pg_temp.u('org') and member_id=tests.uid('provider_e')),0::bigint,'a pessoa convidada não vira integrante da empresa');
select results_eq($$select i.status,g.status from private.ride_guest_invites i join private.ride_trip_grants g on g.id=i.grant_id where i.id=pg_temp.u('gi2_key')$$,
 $$select 'declined','rejected'$$,'o convite recusado encerra a própria autorização');
select is((select status from private.ride_guest_invites where id=pg_temp.u('gi4_key')),'pending','o convite sem cobertura continua pendente, sem viagem');
select is((select count(*) from public.rides where passenger_id=tests.uid('provider_e')),1::bigint,'a pessoa convidada tem uma única viagem');
update private.ride_guest_invites set expires_at=now()-interval '1 minute' where id=pg_temp.u('gi3_key');
select tests.authenticate_as('provider_e');
select throws_ok($$select public.ride_answer_guest_invite(pg_temp.g('gi3'),true,gen_random_uuid())$$,'P0001','ride_invite_unavailable','convite vencido não vale');
select is(pg_temp.dash_leg(pg_temp.u('l_guest'))#>>'{funding,account_name}','Empresa de ensaio A','a pessoa convidada vê qual empresa paga');
select ok(not public.ride_revoke_guest_invite(pg_temp.u('gi4_key')),'a pessoa convidada não revoga o convite');
select tests.authenticate_as('provider_b');
select ok(public.ride_revoke_guest_invite(pg_temp.u('gi4_key')),'quem emitiu revoga o convite pendente');
select ok(not public.ride_revoke_guest_invite(pg_temp.u('gi4_key')),'repetir a revogação não faz nada');
select is((select g->>'beneficiary' from jsonb_array_elements(pg_temp.org(pg_temp.u('org'))->'grants') g where g->>'id'=pg_temp.g('gi_key')),pg_temp.g('name_e'),'o operador vê quem aceitou o convite que emitiu');
select tests.authenticate_as('provider_e');
select throws_ok($$select public.ride_answer_guest_invite(pg_temp.g('gi4'),true,gen_random_uuid())$$,'P0001','ride_invite_unavailable','convite revogado não vale');

-- B7.3 · Empresas isoladas: o gestor da empresa B não alcança nada da empresa A.
select throws_ok($$select public.ride_org_report(pg_temp.u('org'),null)$$,'P0001','ride_account_role_required','gestor de B não lê o relatório de A');
select throws_ok($$select public.ride_decide_trip_grant(pg_temp.u('grant_pa'),false)$$,'P0001','ride_account_role_required','gestor de B não decide autorização de A');
select throws_ok($$select public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('p_appr'),pg_temp.u('cc1'),'Pedido alheio',now(),now()+interval '1 day',gen_random_uuid())$$,
 'P0001','ride_account_role_required','gestor de B não pede autorização em A');
select throws_ok($$select public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('p_guest'),pg_temp.u('cc2'),'client_b@test.local',pg_temp.trip(),null,30,gen_random_uuid())$$,
 'P0001','ride_account_role_required','gestor de B não emite convite por A');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_main'),pg_temp.u('cc1'))$$,'P0001','ride_account_role_required','gestor de B não cota por programa de A');
select throws_ok($$select public.ride_save_cost_center(pg_temp.u('org'),'INVASOR','Alheio',true)$$,'P0001','ride_account_role_required','gestor de B não cria centro de custo em A');
select throws_ok($$select public.ride_set_member_role(pg_temp.u('org'),tests.uid('client_b'),'manager',null)$$,'P0001','ride_account_role_required','gestor de B não muda papéis em A');
select is(pg_temp.org(pg_temp.u('org')),null::jsonb,'a empresa A não aparece nas contas do gestor de B');
select is(jsonb_array_length(public.ride_org_report(pg_temp.u('org_b'),null)->'rows'),0,'o gestor de B lê o relatório de B, sem linhas de A');
select is(jsonb_array_length(pg_temp.org(pg_temp.u('org_b'))->'programs'),1,'o gestor de B vê só o programa de B');
select throws_ok($$select public.ride_save_cost_center(pg_temp.u('org_b'),'NOVO','Novo',true)$$,'P0001','ride_account_role_required','gestor não cria centro de custo, nem na própria empresa');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_org_report(pg_temp.u('org_b'),null)$$,'P0001','ride_account_role_required','a administradora de A não lê o relatório de B');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_org_report(pg_temp.u('org'),null)$$,'P0001','ride_account_role_required','colaboradora não lê o relatório da empresa');

-- Pessoa removida da empresa: o aceite pendente não vira corrida e o perfil profissional se fecha.
select tests.authenticate_as('provider_a');
insert into t select 'q_removed',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_guest'),pg_temp.u('cc1'))->>'id';
select tests.authenticate_as('client_a');
select ok(public.ride_remove_member(pg_temp.u('org'),tests.uid('provider_a'),gen_random_uuid()),'a administradora remove uma pessoa da empresa');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_consent(pg_temp.u('q_removed'),true)$$,'P0001','ride_mandate_revoked','a cotação de quem saiu não vira corrida pela empresa');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_guest'),pg_temp.u('cc1'))$$,'P0001','ride_account_role_required','quem saiu não cota mais pelo perfil profissional');
select throws_ok($$select public.ride_decide_trip_grant(pg_temp.u('grant_no'),true)$$,'P0001','ride_account_role_required','quem saiu não decide mais autorizações');
select tests.clear_authentication();
select is((select count(*) from private.ride_voucher_grants g join public.ride_legs l on l.id=g.leg_id where l.ride_id=pg_temp.u('r_round')),2::bigint,'as reservas anteriores de quem saiu ficam preservadas');

-- Invariantes de acesso das novas tabelas e rotinas.
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relrowsecurity
  and c.relname in ('ride_cost_centers','ride_voucher_programs','ride_trip_grants','ride_guest_invites','ride_voucher_grants')),5::bigint,'as cinco tabelas novas têm RLS ligada');
select is((select count(*) from information_schema.role_table_grants where table_schema='private' and grantee in ('anon','authenticated','service_role','PUBLIC')
  and table_name in ('ride_cost_centers','ride_voucher_programs','ride_trip_grants','ride_guest_invites','ride_voucher_grants')),0::bigint,'nenhum papel da API tem acesso direto às tabelas novas');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')
  and p.proname in ('ride_create_organization','ride_set_member_role','ride_save_cost_center','admin_save_ride_voucher_program','ride_request_trip_grant','ride_decide_trip_grant',
   'ride_invite_guest','ride_revoke_guest_invite','ride_answer_guest_invite','ride_quote_funded','ride_redeem_voucher','ride_org_report','ride_my_accounts')),0::bigint,
 'visitante sem sessão não executa nenhuma das rotinas novas');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
  and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))
  and p.proname in ('ride_organization','ride_voucher_commitment','ride_voucher_plan','ride_find_guest_invite','ride_voucher_reserve','ride_organization_sections',
   'ride_my_accounts_before_business')),0::bigint,'as rotinas privadas novas não são executáveis pelos papéis da API');

-- B7.4 · A corrida pessoal fica fora do relatório; o relatório não traz lugar nem complemento pessoal.
select tests.authenticate_as('client_a');
insert into t select 'report',public.ride_org_report(pg_temp.u('org'),null)::text;
select tests.clear_authentication();
select is(jsonb_array_length(pg_temp.g('report')::jsonb->'rows'),
 (select count(*)::int from private.ride_voucher_grants g join public.ride_legs l on l.id=g.leg_id join private.ride_benefits b on b.id=g.benefit_id
   where g.account_id=pg_temp.u('org') and (l.status<>'cancelled' and b.valid_until>now() or exists(select from private.ride_benefit_uses u where u.benefit_id=b.id))),
 'o relatório traz só os trechos com voucher da empresa');
select is((select count(*) from private.ride_payment_orders where id=pg_temp.u('o_personal') and amount_cents=pg_temp.n('x')),1::bigint,'a corrida pessoal existe e tem pedido próprio');
select is((pg_temp.g('report')::jsonb->>'voucher_cents')::int,pg_temp.n('x')+pg_temp.n('part'),'o relatório soma os vouchers usados no mês');
select is((pg_temp.g('report')::jsonb->>'refunded_cents')::int,400,'o relatório soma só o que foi restaurado');
select is((select sum((c->>'net_cents')::int) from jsonb_array_elements(pg_temp.g('report')::jsonb->'by_cost_center') c),(pg_temp.n('x')+pg_temp.n('part')-400)::bigint,
 'o total por centro de custo fecha com usado menos restaurado');
select is((select sum(e.benefit_delta) from private.ride_financial_events e join private.ride_voucher_grants g on g.leg_id=e.leg_id where g.account_id=pg_temp.u('org')),
 (pg_temp.n('x')+pg_temp.n('part')-400)::bigint,'o relatório fecha com o livro da etapa 4');
select is((select count(*) from jsonb_array_elements(pg_temp.g('report')::jsonb->'rows') r where r->>'cost_center'='VENDAS' and r->>'member'=pg_temp.g('name_b') and (r->>'voucher_cents')::int=pg_temp.n('x')),
 1::bigint,'a linha traz data, centro de custo, pessoa e valor do voucher');
select is((select count(*) from jsonb_array_elements(pg_temp.g('report')::jsonb->'rows') r where r->>'cost_center'='VISITAS' and r->>'member'=pg_temp.g('name_e') and (r->>'reserved_cents')::int=pg_temp.n('x')),
 1::bigint,'a viagem da pessoa convidada aparece como reserva no centro de custo dos visitantes');
select ok(pg_temp.g('report') !~ 'Saúde|Jabaquara|origin|destination|lat|lng|points|excess|fare','o relatório não traz praça, ponto, tarifa nem complemento pessoal');
select is((select count(*) from jsonb_array_elements(pg_temp.g('report')::jsonb->'rows') r where (r->>'voucher_cents')::int=500),0::bigint,'o complemento pago por quem viajou não entra no relatório');

select * from finish();
rollback;
