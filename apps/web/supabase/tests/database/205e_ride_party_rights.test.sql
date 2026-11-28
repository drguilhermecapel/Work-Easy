-- O17 etapa 5 · direitos sobre os dados de família, terceiros, empresas e frotas (20261127110507).
-- Saída de uma pessoa: mandatos revogados, participações encerradas, convites, acompanhantes e
-- dependentes apagados; a conta de quem sai é fechada e só some quando nada financeiro depende dela.
-- Retenção: convite encerrado sai em 24 h, sem agendamento novo. Exportação: só o lado da própria
-- pessoa, nunca a identidade da outra parte. No fim, as invariantes de permissão das funções novas.
-- Dados fictícios, sem rede.
begin;
select no_plan();
select tests.setup_fixture();
select tests.create_user(k) from unnest(array['e_fam_owner','e_fam_member','e_free_owner','e_free_member','e_owner','e_helper','e_payer','e_sponsor','e_rider',
 'e_org_owner','e_org_member','e_org_desk','e_free_org','e_fleet_owner','e_fleet_driver','e_extra','e_extra2','e_outsider']) k;
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,v text not null);
grant select,insert on t to authenticated,anon;
create function pg_temp.g(p text) returns text language sql stable as $$select t.v from t where t.k=p$$;
create function pg_temp.u(p text) returns uuid language sql stable as $$select t.v::uuid from t where t.k=p$$;
create function pg_temp.n(p text) returns int language sql stable as $$select t.v::int from t where t.k=p$$;
create function pg_temp.j(p text) returns jsonb language sql stable as $$select t.v::jsonb from t where t.k=p$$;
create function pg_temp.trip() returns jsonb language sql immutable as $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
create function pg_temp.today() returns date language sql stable security definer as $$select private.sp_date(now())$$;
create function pg_temp.account(p uuid) returns jsonb language sql as $$select a from jsonb_array_elements(public.ride_my_accounts()) a where a->>'id'=p::text$$;
grant execute on function pg_temp.g(text),pg_temp.u(text),pg_temp.n(text),pg_temp.j(text),pg_temp.trip(),pg_temp.today(),pg_temp.account(uuid) to authenticated,anon;
-- As pessoas do roteiro ficam guardadas pela chave: depois da exclusão física o e-mail não as encontra mais.
insert into t select k,tests.uid(k)::text from unnest(array['e_fam_owner','e_fam_member','e_free_owner','e_free_member','e_owner','e_helper','e_payer','e_sponsor','e_rider',
 'e_org_owner','e_org_member','e_org_desk','e_free_org','e_fleet_owner','e_fleet_driver','e_extra','e_extra2','e_outsider']) k;
create function pg_temp.keys(p_prefix text) returns void language sql as $$
 insert into t select p_prefix||i,gen_random_uuid()::text from generate_series(1,9) i$$;
select pg_temp.keys('k');
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_c'),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true);
-- O voucher da empresa precisa de benefício e de Pix ou cartão liberados no trajeto.
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity,card_brands,acquirer_profile_ref)
 select 'simulation','Saúde','Jabaquara',m,'ensaio 205e',tstzrange(now()-interval '1 day',now()+interval '1 day'),
  case when m='card' then array['VISA'] else '{}'::text[] end,case when m='card' then 'conta hospedada TESTE' end from unnest(array['card','pix','benefit']) m;

select tests.authenticate_as('e_outsider');
insert into t select 'q_x',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
select tests.clear_authentication();
insert into t select 'x',total_cents::text from private.ride_quotes where id=pg_temp.u('q_x');
select ok(pg_temp.n('x')>0,'o ensaio tem tarifa para o trecho de referência');

-- ─── Roteiro ───────────────────────────────────────────────────────────────────────────────
-- Família com histórico: uma participante viaja pela conta, há convite pendente e dependente.
select tests.authenticate_as('e_fam_owner');
insert into t select 'fam',public.ride_create_family('Família com histórico',pg_temp.n('x')*10,'pix',pg_temp.u('k1'))::text;
insert into t select 'fam_tok',public.ride_invite_member(pg_temp.u('fam'),'e_fam_member@test.local','member',60,gen_random_uuid())->>'token';
insert into t select 'fam_tok_x',public.ride_invite_member(pg_temp.u('fam'),'e_extra@test.local','member',60,gen_random_uuid())->>'token';
insert into t select 'fam_inv_pending',public.ride_invite_member(pg_temp.u('fam'),'e_outsider@test.local','member',60,gen_random_uuid())->>'id';
insert into t select 'dep',public.ride_register_dependent(pg_temp.u('fam'),'Lia','13-15','parental_authority',pg_temp.u('k2'))::text;
select tests.authenticate_as('e_fam_member');
select is(public.ride_join_account(pg_temp.g('fam_tok'),true),'accepted','a participante entra na família por adesão');
insert into t select 'm_fam',pg_temp.account(pg_temp.u('fam'))->>'mandate_id';
insert into t select 'q_fam',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_fam'))->>'id';
insert into t select 'r_fam',public.ride_consent(pg_temp.u('q_fam'),true)->>'ride_id';
select tests.authenticate_as('e_extra');
select is(public.ride_join_account(pg_temp.g('fam_tok_x'),true),'accepted','outra pessoa entra na família');
insert into t select 'm_extra',pg_temp.account(pg_temp.u('fam'))->>'mandate_id';
select tests.authenticate_as('e_fam_owner');
select ok(public.ride_remove_member(pg_temp.u('fam'),pg_temp.u('e_extra'),gen_random_uuid()),'e é removida sem ter viajado');
select tests.clear_authentication();
insert into t select 'leg_fam',id::text from public.ride_legs where ride_id=pg_temp.u('r_fam');
insert into t select 'month_fam',private.ride_month(pickup_at)::text from public.ride_legs where id=pg_temp.u('leg_fam');
select is((select payer_id from public.ride_legs where id=pg_temp.u('leg_fam')),pg_temp.u('e_fam_owner'),'o trecho da participante é pago pela administradora da família');

-- Família sem uso: participante, dependente e uma cotação ainda aguardando aceite.
select tests.authenticate_as('e_free_owner');
insert into t select 'fam2',public.ride_create_family('Família sem uso',pg_temp.n('x')*10,'pix',pg_temp.u('k3'))::text;
insert into t select 'fam2_tok',public.ride_invite_member(pg_temp.u('fam2'),'e_free_member@test.local','member',60,gen_random_uuid())->>'token';
insert into t select 'dep2',public.ride_register_dependent(pg_temp.u('fam2'),'Davi','16-17','guardianship',gen_random_uuid())::text;
select tests.authenticate_as('e_free_member');
select is(public.ride_join_account(pg_temp.g('fam2_tok'),true),'accepted','a participante entra na família sem uso');
insert into t select 'm_fam2',pg_temp.account(pg_temp.u('fam2'))->>'mandate_id';
insert into t select 'q_fam2',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_fam2'))->>'id';

-- Acompanhantes: uma pessoa só recebe avisos, outra também paga; duas ligações já retiradas.
select tests.authenticate_as('e_owner');
insert into t select 'c_tok1',public.ride_invite_companion('e_helper@test.local',array['requested','accepted'],false,60,gen_random_uuid())->>'token';
insert into t select 'c_tok2',public.ride_invite_companion('e_payer@test.local',array['completed'],true,60,gen_random_uuid())->>'token';
insert into t select 'c_tok3',public.ride_invite_companion('e_extra@test.local',array['completed'],false,60,gen_random_uuid())->>'token';
insert into t select 'c_tok4',public.ride_invite_companion('e_extra2@test.local',array['completed'],false,60,gen_random_uuid())->>'token';
insert into t select 'c_inv_pending',public.ride_invite_companion('e_outsider@test.local',array['completed'],false,60,gen_random_uuid())->>'id';
select tests.authenticate_as('e_helper');
select is(public.ride_answer_companion(pg_temp.g('c_tok1'),true),'accepted','a pessoa de confiança aceita receber avisos');
select tests.authenticate_as('e_payer');
select is(public.ride_answer_companion(pg_temp.g('c_tok2'),true),'accepted','a pessoa de confiança aceita pagar');
select tests.authenticate_as('e_extra');
select is(public.ride_answer_companion(pg_temp.g('c_tok3'),true),'accepted','terceira ligação aceita');
select tests.authenticate_as('e_extra2');
select is(public.ride_answer_companion(pg_temp.g('c_tok4'),true),'accepted','quarta ligação aceita');
select tests.authenticate_as('e_owner');
select ok(public.ride_revoke_companion(pg_temp.u('e_extra')) and public.ride_revoke_companion(pg_temp.u('e_extra2')),'duas ligações são retiradas');
insert into t select 'q_owner',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'r_owner',public.ride_consent(pg_temp.u('q_owner'),true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg_owner',id::text from public.ride_legs where ride_id=pg_temp.u('r_owner');
insert into private.ride_passenger_notices(leg_id,owner_id,event) values(pg_temp.u('leg_owner'),pg_temp.u('e_owner'),'accepted') on conflict do nothing;
select ok(exists(select from private.ride_passenger_notices where leg_id=pg_temp.u('leg_owner') and owner_id=pg_temp.u('e_helper') and event='accepted'),
 'o aviso escolhido é copiado para quem acompanha');
insert into t select 'm_comp',id::text from private.ride_payer_mandates where kind='companion' and rider_id=pg_temp.u('e_owner') and payer_id=pg_temp.u('e_payer');

-- Pedido para outra pessoa: um convite aceito (vira corrida) e um ainda pendente.
select tests.authenticate_as('e_sponsor');
insert into t select 'q_sp',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'ri_tok',public.ride_invite_rider(pg_temp.u('q_sp'),'e_rider@test.local',30,'Portão azul, levar documento.',pg_temp.u('k4'))->>'token';
insert into t select 'q_sp2',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'ri_pending',public.ride_invite_rider(pg_temp.u('q_sp2'),'e_outsider@test.local',30,null,pg_temp.u('k5'))->>'id';
select tests.authenticate_as('e_rider');
insert into t select 'r_rider',public.ride_answer_rider_invite(pg_temp.g('ri_tok'),true,gen_random_uuid())->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg_rider',id::text from public.ride_legs where ride_id=pg_temp.u('r_rider');
insert into t select 'm_sp',mandate_id::text from private.ride_leg_funding where leg_id=pg_temp.u('leg_rider');
select is((select status from private.ride_payer_mandates where id=pg_temp.u('m_sp')),'used','o mandato de uso único do convite foi gasto');

-- Empresa com histórico: colaboradora viaja com voucher, tem um pedido de autorização em aberto
-- e a central deixou um convite de convidado pendente.
select tests.authenticate_as('e_org_owner');
insert into t select 'org',public.ride_create_organization('Empresa com histórico',pg_temp.u('k6'))::text;
select tests.authenticate_as('e_free_org');
insert into t select 'org2',public.ride_create_organization('Empresa sem uso',pg_temp.u('k7'))::text;
select tests.authenticate_as('e_fleet_owner');
insert into t select 'fleet',public.ride_create_fleet('Frota de ensaio',pg_temp.u('k8'))::text;
select tests.authenticate_as('admin');
select ok(public.admin_verify_ride_account(pg_temp.u('org'),'ficticio-o17-e5 contrato 1',now()+interval '30 days')
 and public.admin_verify_ride_account(pg_temp.u('org2'),'ficticio-o17-e5 contrato 2',now()+interval '30 days')
 and public.admin_verify_ride_account(pg_temp.u('fleet'),'ficticio-o17-e5 contrato 3',now()+interval '30 days'),'a operação confere as duas empresas e a frota');
select tests.authenticate_as('e_org_owner');
insert into t select 'cc',public.ride_save_cost_center(pg_temp.u('org'),'VENDAS','Vendas',true)::text;
insert into t select 'org_tok_m',public.ride_invite_member(pg_temp.u('org'),'e_org_member@test.local','member',60,gen_random_uuid())->>'token';
insert into t select 'org_tok_d',public.ride_invite_member(pg_temp.u('org'),'e_org_desk@test.local','operator',60,gen_random_uuid())->>'token';
select tests.authenticate_as('e_org_member');
select is(public.ride_join_account(pg_temp.g('org_tok_m'),true),'accepted','a colaboradora entra na empresa');
select tests.authenticate_as('e_org_desk');
select is(public.ride_join_account(pg_temp.g('org_tok_d'),true),'accepted','a central entra na empresa');
select tests.authenticate_as('e_free_org');
insert into t select 'cc2',public.ride_save_cost_center(pg_temp.u('org2'),'GERAL','Geral',true)::text;
select tests.authenticate_as('admin');
insert into t values('prog',gen_random_uuid()::text),('prog2',gen_random_uuid()::text);
select lives_ok($$select public.admin_save_ride_voucher_program(pg_temp.u('prog'),pg_temp.u('org'),'Visitas',pg_temp.n('x')*10,pg_temp.n('x')*2,null,null,null,null,
 now()-interval '1 hour',now()+interval '20 days','none',false,'ficticio-o17-e5 verba','ficticio-o17-e5 contrato',true)$$,'a operação registra o programa da empresa com histórico');
select lives_ok($$select public.admin_save_ride_voucher_program(pg_temp.u('prog2'),pg_temp.u('org2'),'Visitas',pg_temp.n('x')*10,pg_temp.n('x')*2,null,null,null,null,
 now()-interval '1 hour',now()+interval '20 days','none',false,'ficticio-o17-e5 verba','ficticio-o17-e5 contrato',true)$$,'a operação registra o programa da empresa sem uso');
select tests.authenticate_as('e_org_member');
insert into t values('grant_open',gen_random_uuid()::text);
select is(public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('prog'),pg_temp.u('cc'),'Visita a cliente em ensaio',now()-interval '1 hour',now()+interval '2 days',pg_temp.u('grant_open')),
 pg_temp.u('grant_open'),'a colaboradora pede uma autorização de viagem');
insert into t select 'q_work',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('prog'),pg_temp.u('cc'))->>'id';
insert into t select 'r_work',public.ride_consent(pg_temp.u('q_work'),true)->>'ride_id';
select tests.authenticate_as('e_org_desk');
insert into t select 'guest_inv',public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('prog'),pg_temp.u('cc'),'e_outsider@test.local',pg_temp.trip(),null,30,gen_random_uuid())->>'id';
select tests.authenticate_as('e_free_org');
insert into t select 'guest_inv2',public.ride_invite_guest(pg_temp.u('org2'),pg_temp.u('prog2'),pg_temp.u('cc2'),'e_outsider@test.local',pg_temp.trip(),null,30,gen_random_uuid())->>'id';
select tests.clear_authentication();
insert into t select 'leg_work',id::text from public.ride_legs where ride_id=pg_temp.u('r_work');
insert into t select 'guest_grant',grant_id::text from private.ride_guest_invites where id=pg_temp.u('guest_inv');
select ok(exists(select from private.ride_voucher_grants where leg_id=pg_temp.u('leg_work') and account_id=pg_temp.u('org')),'o trecho profissional reserva o voucher da empresa');

-- Frota: um veículo e a cessão de um motorista, ainda sem corrida.
select tests.authenticate_as('e_fleet_owner');
insert into t select 'fleet_tok',public.ride_invite_member(pg_temp.u('fleet'),'e_fleet_driver@test.local','fleet_driver',60,gen_random_uuid())->>'token';
select tests.authenticate_as('e_fleet_driver');
select is(public.ride_join_account(pg_temp.g('fleet_tok'),true),'accepted','o motorista entra na frota');
select tests.authenticate_as('e_fleet_owner');
insert into t select 'veh',public.ride_fleet_save_vehicle(pg_temp.u('fleet'),'FROTA-E-001','sedan','DOC-E1','APOLICE-E1','VISTORIA-E1',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)::text;
insert into t select 'asg',public.ride_fleet_assign(pg_temp.u('veh'),pg_temp.u('e_fleet_driver'),'CESSAO-205E','fleet',now(),now()+interval '30 days',pg_temp.u('k9'))::text;
select tests.clear_authentication();
select is((select status from private.ride_fleet_assignments where id=pg_temp.u('asg')),'pending_review','a cessão nasce aguardando revisão');

-- Uma declaração de voucher sem programa não existe: sem ela o trecho viraria cobrança pessoal sem reserva.
select throws_ok($$insert into private.ride_quote_funding(quote_id,kind,account_id,member_id,payer_id,month)
 values(pg_temp.u('q_x'),'voucher',pg_temp.u('org'),pg_temp.u('e_outsider'),pg_temp.u('e_outsider'),private.ride_month(now()))$$,'23514',null,
 'financiamento corporativo sem programa é recusado na cotação');
select throws_ok($$select private.ride_fund_voucher_quote(pg_temp.u('q_x'),pg_temp.u('org'),null,null,null,'{}')$$,'23514',null,'a declaração interna sem programa também é recusada');
select throws_ok($$update private.ride_leg_funding set program_id=null where leg_id=pg_temp.u('leg_work')$$,'23514',null,'e o trecho financiado não perde o programa');

-- ─── Exportação ────────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('e_fam_member');insert into t select 'x_member',public.ride_export_my_data()::text;
insert into t select 'x_member_view',mobility::text from public.my_ride_data_export;
select tests.authenticate_as('e_fam_owner');insert into t select 'x_fam_owner',public.ride_export_my_data()::text;
select tests.authenticate_as('e_extra');insert into t select 'x_extra',public.ride_export_my_data()::text;
select tests.authenticate_as('e_owner');insert into t select 'x_owner',public.ride_export_my_data()::text;
select tests.authenticate_as('e_helper');insert into t select 'x_helper',public.ride_export_my_data()::text;
select tests.authenticate_as('e_payer');insert into t select 'x_payer',public.ride_export_my_data()::text;
select tests.authenticate_as('e_sponsor');insert into t select 'x_sponsor',public.ride_export_my_data()::text;
select tests.authenticate_as('e_rider');insert into t select 'x_rider',public.ride_export_my_data()::text;
select tests.authenticate_as('e_org_member');insert into t select 'x_org_member',public.ride_export_my_data()::text;
select tests.authenticate_as('e_org_desk');insert into t select 'x_org_desk',public.ride_export_my_data()::text;
select tests.authenticate_as('e_fleet_driver');insert into t select 'x_fleet_driver',public.ride_export_my_data()::text;
select tests.authenticate_as('e_outsider');insert into t select 'x_outsider',public.ride_export_my_data()::text;
select throws_ok($$select public.ride_export_before_parties()$$,'42501',null,'a exportação anterior não é chamada direto');
select throws_ok($$select private.purge_ride_parties()$$,'42501',null,'a retenção não é chamada por quem usa o aplicativo');
select throws_ok($$select private.purge_ride_safety()$$,'42501',null,'a rotina de retenção agendada não é chamada por quem usa o aplicativo');
select throws_ok($$select * from private.ride_accounts$$,'42501',null,'ninguém lê a tabela de contas');
select tests.authenticate_anon();
select throws_ok($$select public.ride_export_my_data()$$,'42501',null,'visitante sem sessão não exporta');
select throws_ok($$select * from public.my_ride_data_export$$,'42501',null,'visitante sem sessão não lê a visão de exportação');
select tests.clear_authentication();

select ok(pg_temp.j('x_member') ?& array['accounts','mandates','companions','dependents','rider_invites','funded_legs','fleet_assignments','trip_grants'],
 'a exportação ganha as chaves de contas, mandatos, acompanhantes, dependentes, convites, trechos financiados e cessões');
select ok(pg_temp.j('x_member') ?& array['legs','quotes','help','safety_cases','access_preferences'],'as chaves anteriores da exportação continuam presentes');
select is(pg_temp.j('x_member_view'),pg_temp.j('x_member'),'a visão da conta entrega a mesma exportação');
select is((select array_agg(a.attname::text order by a.attnum) from pg_attribute a where a.attrelid='public.my_ride_data_export'::regclass and a.attnum>0 and not a.attisdropped),
 array['id','mobility'],'a visão mantém as colunas id e mobility');
select ok((select c.reloptions @> array['security_invoker=true'] from pg_class c where c.oid='public.my_ride_data_export'::regclass),'a visão continua com security_invoker');
select is(jsonb_array_length(pg_temp.j('x_member')->'accounts'),1,'a participante exporta só a conta de que faz parte');
select ok(pg_temp.j('x_member')#>>'{accounts,0,id}'=pg_temp.g('fam') and pg_temp.j('x_member')#>>'{accounts,0,role}'='member' and pg_temp.j('x_member')#>>'{accounts,0,owner}'='false'
 and not (pg_temp.j('x_member')#>'{accounts,0}' ? 'monthly_limit_cents'),'a participante vê o próprio papel e não o limite da conta');
select ok(pg_temp.j('x_member')#>>'{mandates,0,role}'='rider' and pg_temp.j('x_member')#>>'{mandates,0,kind}'='family' and pg_temp.j('x_member')#>>'{mandates,0,status}'='active',
 'a participante exporta o próprio mandato como quem viaja');
select ok(pg_temp.j('x_member')#>>'{funded_legs,0,leg}'=pg_temp.g('leg_fam') and pg_temp.j('x_member')#>>'{funded_legs,0,rider}'='true'
 and pg_temp.j('x_member')#>>'{funded_legs,0,payer}'='false' and pg_temp.j('x_member')#>>'{funded_legs,0,mandate_kind}'='family','o trecho financiado aparece para quem viajou, sem papel de pagador');
select ok(not (pg_temp.j('x_member')#>'{legs,0}' ? 'fare_cents') and pg_temp.g('x_member') not like '%fare_cents%','quem viaja pela família não exporta preço');
select ok(pg_temp.g('x_member') not like '%'||pg_temp.g('e_fam_owner')||'%','a exportação de quem viaja não traz a identidade de quem paga');
select ok(pg_temp.j('x_fam_owner')#>>'{accounts,0,owner}'='true' and pg_temp.j('x_fam_owner')#>>'{accounts,0,role}'='admin'
 and (pg_temp.j('x_fam_owner')#>>'{accounts,0,monthly_limit_cents}')::int=pg_temp.n('x')*10,'a administradora exporta a própria conta com o limite');
select ok(exists(select from jsonb_array_elements(pg_temp.j('x_fam_owner')->'funded_legs') f where f->>'leg'=pg_temp.g('leg_fam') and f->>'payer'='true' and f->>'rider'='false'),
 'a administradora vê o trecho como pagadora');
select ok(pg_temp.g('x_fam_owner') not like '%'||pg_temp.g('e_fam_member')||'%' and pg_temp.g('x_fam_owner') not like '%'||pg_temp.g('e_extra')||'%',
 'a exportação de quem paga não traz a identidade de quem viaja');
select is(pg_temp.j('x_fam_owner')#>>'{dependents,0,label}','Lia','a responsável exporta o dependente cadastrado');
select is(pg_temp.j('x_member')->'dependents','[]'::jsonb,'quem não é responsável não exporta dependente');
select ok(pg_temp.j('x_extra')#>>'{accounts,0,status}'='removed' and pg_temp.j('x_extra')#>>'{mandates,0,status}'='revoked','quem foi removida exporta a participação encerrada e o mandato revogado');
select is((select count(*) from jsonb_array_elements(pg_temp.j('x_owner')->'companions') c where c->>'role'='owner'),4::bigint,'a pessoa acompanhada exporta as próprias ligações');
select is((select count(*) from jsonb_array_elements(pg_temp.j('x_owner')->'companions') c where c->>'status'='revoked'),2::bigint,'as ligações retiradas aparecem como retiradas');
select ok(pg_temp.j('x_helper')#>>'{companions,0,role}'='companion' and pg_temp.j('x_helper')#>'{companions,0,notices}'='["accepted","requested"]'::jsonb
 and pg_temp.j('x_helper')#>>'{companions,0,pays}'='false','quem acompanha exporta os avisos que recebe');
select ok(pg_temp.j('x_payer')#>>'{mandates,0,role}'='payer' and pg_temp.j('x_payer')#>>'{mandates,0,kind}'='companion' and (pg_temp.j('x_payer')#>>'{mandates,0,ceiling_cents}')::int>0,
 'quem aceitou pagar exporta o próprio mandato com o teto');
select ok(pg_temp.g('x_owner') not like '%'||pg_temp.g('e_helper')||'%' and pg_temp.g('x_helper') not like '%'||pg_temp.g('e_owner')||'%',
 'a exportação do acompanhamento não identifica a outra pessoa');
select is((select count(*) from jsonb_array_elements(pg_temp.j('x_sponsor')->'rider_invites') i where i->>'role'='sponsor' and (i->>'ceiling_cents')::int>0),2::bigint,
 'quem pediu exporta os dois convites com o teto');
select ok(exists(select from jsonb_array_elements(pg_temp.j('x_sponsor')->'rider_invites') i where i->>'instructions'='Portão azul, levar documento.' and i->>'status'='accepted'),
 'quem pediu exporta as instruções que escreveu');
select ok(pg_temp.j('x_rider')#>>'{rider_invites,0,role}'='rider' and not (pg_temp.j('x_rider')#>'{rider_invites,0}' ? 'ceiling_cents')
 and pg_temp.j('x_rider')#>>'{rider_invites,0,legs,0,origin}'='Saúde','quem viaja exporta o convite com o itinerário e sem o teto');
select ok(pg_temp.j('x_rider')#>>'{mandates,0,role}'='rider' and pg_temp.j('x_rider')#>'{mandates,0,ceiling_cents}'='null'::jsonb and pg_temp.g('x_rider') not like '%fare_cents%',
 'quem viaja a convite não exporta preço nem teto');
select ok(pg_temp.g('x_rider') not like '%'||pg_temp.g('e_sponsor')||'%' and pg_temp.g('x_sponsor') not like '%'||pg_temp.g('e_rider')||'%','a exportação do convite não identifica a outra pessoa');
select ok(pg_temp.j('x_org_member')#>>'{funded_legs,0,kind}'='voucher' and pg_temp.j('x_org_member')#>>'{funded_legs,0,cost_center}'='VENDAS'
 and (pg_temp.j('x_org_member')#>>'{funded_legs,0,voucher_cents}')::int=pg_temp.n('x') and pg_temp.j('x_org_member')#>>'{funded_legs,0,account_id}'=pg_temp.g('org'),
 'a colaboradora exporta o trecho profissional com a empresa, o centro de custo e o voucher');
select ok(pg_temp.j('x_org_member')#>>'{trip_grants,0,purpose}'='Visita a cliente em ensaio' and pg_temp.j('x_org_member')#>>'{trip_grants,0,mine}'='true','a colaboradora exporta o pedido de autorização que escreveu');
select ok(pg_temp.j('x_org_desk')#>>'{trip_grants,0,guest}'='true' and pg_temp.j('x_org_desk')#>>'{trip_grants,0,mine}'='false','a central exporta a autorização que emitiu para convidado');
select ok(pg_temp.j('x_fleet_driver')#>>'{fleet_assignments,0,vehicle_identifier}'='FROTA-E-001' and pg_temp.j('x_fleet_driver')#>>'{fleet_assignments,0,status}'='pending_review'
 and pg_temp.j('x_fleet_driver')#>>'{accounts,0,role}'='fleet_driver','o motorista exporta a cessão do veículo e a participação na frota');
select ok(pg_temp.j('x_outsider')->'accounts'='[]'::jsonb and pg_temp.j('x_outsider')->'mandates'='[]'::jsonb and pg_temp.j('x_outsider')->'companions'='[]'::jsonb
 and pg_temp.j('x_outsider')->'dependents'='[]'::jsonb and pg_temp.j('x_outsider')->'rider_invites'='[]'::jsonb and pg_temp.j('x_outsider')->'funded_legs'='[]'::jsonb
 and pg_temp.j('x_outsider')->'fleet_assignments'='[]'::jsonb and pg_temp.j('x_outsider')->'trip_grants'='[]'::jsonb,
 'quem só foi convidada e nunca respondeu não exporta nada dos outros');
select ok(pg_temp.g('x_outsider') not like '%'||pg_temp.g('fam')||'%' and pg_temp.g('x_member') not like '%'||pg_temp.g('fam2')||'%' and pg_temp.g('x_member') not like '%'||pg_temp.g('org')||'%',
 'ninguém exporta conta de que não participa');

-- ─── Retenção ──────────────────────────────────────────────────────────────────────────────
-- Cada tabela de convite recebe quatro casos: vencido há pouco, vencido há mais de um dia,
-- encerrado há mais de um dia e encerrado há pouco.
select tests.authenticate_as('e_fam_owner');
insert into t select 'ai'||i,public.ride_invite_member(pg_temp.u('fam'),'purga'||i||'@test.local','member',60,gen_random_uuid())->>'id' from generate_series(1,4) i;
select tests.authenticate_as('e_owner');
insert into t select 'ci'||i,public.ride_invite_companion('purga'||i||'@test.local',array['completed'],false,60,gen_random_uuid())->>'id' from generate_series(1,4) i;
select tests.authenticate_as('e_sponsor');
insert into t select 'rq1',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'ri1',public.ride_invite_rider(pg_temp.u('rq1'),'purga1@test.local',30,'Instrução um',gen_random_uuid())->>'id';
insert into t select 'rq2',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'ri2',public.ride_invite_rider(pg_temp.u('rq2'),'purga2@test.local',30,'Instrução dois',gen_random_uuid())->>'id';
insert into t select 'rq3',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'ri3',public.ride_invite_rider(pg_temp.u('rq3'),'purga3@test.local',30,'Instrução três',gen_random_uuid())->>'id';
insert into t select 'rq4',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'ri4',public.ride_invite_rider(pg_temp.u('rq4'),'purga4@test.local',30,'Instrução quatro',gen_random_uuid())->>'id';
select tests.authenticate_as('e_org_desk');
insert into t select 'gi'||i,public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('prog'),pg_temp.u('cc'),'purga'||i||'@test.local',pg_temp.trip(),null,30,gen_random_uuid())->>'id' from generate_series(1,4) i;
select tests.clear_authentication();
insert into t select 'gg'||i,grant_id::text from private.ride_guest_invites g,generate_series(1,4) i where g.id=pg_temp.u('gi'||i);
update private.ride_account_invites set expires_at=now()-interval '1 hour' where id=pg_temp.u('ai1');
update private.ride_account_invites set expires_at=now()-interval '25 hours',created_at=now()-interval '26 hours' where id=pg_temp.u('ai2');
update private.ride_account_invites set status='declined',answered_at=now()-interval '25 hours' where id=pg_temp.u('ai3');
update private.ride_account_invites set status='revoked',answered_at=now()-interval '1 hour' where id=pg_temp.u('ai4');
update private.ride_companion_invites set expires_at=now()-interval '1 hour' where id=pg_temp.u('ci1');
update private.ride_companion_invites set expires_at=now()-interval '25 hours' where id=pg_temp.u('ci2');
update private.ride_companion_invites set status='declined',answered_at=now()-interval '25 hours' where id=pg_temp.u('ci3');
update private.ride_companion_invites set status='revoked',answered_at=now()-interval '1 hour' where id=pg_temp.u('ci4');
update private.ride_rider_invites set expires_at=now()-interval '1 hour' where id=pg_temp.u('ri1');
update private.ride_rider_invites set expires_at=now()-interval '25 hours' where id=pg_temp.u('ri2');
update private.ride_rider_invites set status='declined',answered_at=now()-interval '25 hours' where id=pg_temp.u('ri3');
update private.ride_rider_invites set status='revoked',answered_at=now()-interval '1 hour' where id=pg_temp.u('ri4');
update private.ride_guest_invites set expires_at=now()-interval '1 hour' where id=pg_temp.u('gi1');
update private.ride_guest_invites set expires_at=now()-interval '25 hours' where id=pg_temp.u('gi2');
update private.ride_guest_invites set status='declined',answered_at=now()-interval '25 hours' where id=pg_temp.u('gi3');
update private.ride_guest_invites set status='revoked',answered_at=now()-interval '1 hour' where id=pg_temp.u('gi4');
-- Ligações e mandatos encerrados: um caso antigo e um recente de cada.
update private.ride_companions set revoked_at=now()-interval '25 hours' where owner_id=pg_temp.u('e_owner') and companion_id=pg_temp.u('e_extra');
update private.ride_payer_mandates set revoked_at=now()-interval '25 hours' where id=pg_temp.u('m_extra');
insert into t select 'm_recent',private.ride_grant_mandate('sponsor',pg_temp.u('e_extra'),pg_temp.u('e_extra2'),1000,1,now()+interval '1 hour')::text;
update private.ride_payer_mandates set status='revoked',revoked_at=now()-interval '1 hour' where id=pg_temp.u('m_recent');
update private.ride_payer_mandates set created_at=now()-interval '3 days',valid_until=now()-interval '2 days' where id=pg_temp.u('m_sp');
-- Dependente vencido há mais de 30 dias e registro de acesso com mais de 12 meses.
insert into t values('dep_old',gen_random_uuid()::text);
insert into private.ride_dependents(id,environment,account_id,guardian_id,label,age_band,legal_basis_ref,evidence_ref,verified_by,valid_until,status,request_key,request_hash,reviewed_at)
 values(pg_temp.u('dep_old'),'simulation',pg_temp.u('fam'),pg_temp.u('e_fam_owner'),'Antigo','16-17','guardianship','EVID-205E',tests.uid('admin'),private.sp_date(now())-31,'verified',
  gen_random_uuid(),'\x00',now()-interval '60 days');
insert into private.ride_minor_access_log(actor,dependent_id,purpose,at) values(tests.uid('admin'),pg_temp.u('dep'),'review',now()-interval '13 months'),
 (tests.uid('admin'),pg_temp.u('dep'),'review',now()-interval '11 months');

select lives_ok($$select private.purge_ride_safety()$$,'a rotina de retenção agendada roda com a parte nova');
create temp table purge_state as select 1 as run,(select count(*) from private.ride_account_invites) ai,(select count(*) from private.ride_companion_invites) ci,
 (select count(*) from private.ride_rider_invites) ri,(select count(*) from private.ride_guest_invites) gi,(select count(*) from private.ride_companions) co,
 (select count(*) from private.ride_payer_mandates) ma,(select count(*) from private.ride_dependents) de,(select count(*) from private.ride_trip_grants) tg;
select is((select array_agg(coalesce(i.status,'apagado') order by x.n) from generate_series(1,4) x(n) left join private.ride_account_invites i on i.id=pg_temp.u('ai'||x.n)),
 array['expired','apagado','apagado','revoked'],'convite de conta: vencido vira expirado, encerrado há mais de 24 h sai, encerrado há pouco fica');
select is((select array_agg(coalesce(i.status,'apagado') order by x.n) from generate_series(1,4) x(n) left join private.ride_companion_invites i on i.id=pg_temp.u('ci'||x.n)),
 array['expired','apagado','apagado','revoked'],'convite de acompanhante segue a mesma regra');
select is((select array_agg(coalesce(i.status,'apagado') order by x.n) from generate_series(1,4) x(n) left join private.ride_rider_invites i on i.id=pg_temp.u('ri'||x.n)),
 array['expired','apagado','apagado','revoked'],'convite para outra pessoa segue a mesma regra');
select is((select array_agg(coalesce(i.status,'apagado') order by x.n) from generate_series(1,4) x(n) left join private.ride_guest_invites i on i.id=pg_temp.u('gi'||x.n)),
 array['expired','apagado','apagado','revoked'],'convite de convidado segue a mesma regra');
select is((select instructions from private.ride_rider_invites where id=pg_temp.u('ri1')),null,'as instruções do convite vencido são apagadas');
select is((select array_agg(g.status order by x.n) from generate_series(1,4) x(n) join private.ride_trip_grants g on g.id=pg_temp.u('gg'||x.n)),
 array['expired','expired','approved','approved'],'a autorização do convidado vence com o convite e a linha da autorização permanece');
select is((select status from private.ride_account_invites where id=pg_temp.u('fam_inv_pending')),'pending','convite ainda válido não é tocado');
select ok(exists(select from private.ride_rider_invites where id=pg_temp.u('k4') and status='accepted' and instructions is not null),'convite aceito há pouco fica com as instruções');
select ok(not exists(select from private.ride_companions where owner_id=pg_temp.u('e_owner') and companion_id=pg_temp.u('e_extra'))
 and exists(select from private.ride_companions where owner_id=pg_temp.u('e_owner') and companion_id=pg_temp.u('e_extra2') and status='revoked'),
 'ligação retirada há mais de 24 h sai e a retirada há pouco fica');
select ok(not exists(select from private.ride_payer_mandates where id=pg_temp.u('m_extra')) and exists(select from private.ride_payer_mandates where id=pg_temp.u('m_recent')),
 'mandato revogado sem uso sai depois de 24 h e o revogado há pouco fica');
select ok(exists(select from private.ride_payer_mandates where id=pg_temp.u('m_sp') and status='used') and exists(select from private.ride_payer_mandates where id=pg_temp.u('m_fam') and status='active'),
 'mandato que financiou um trecho e mandato ativo nunca saem');
select ok(not exists(select from private.ride_dependents where id=pg_temp.u('dep_old')) and exists(select from private.ride_dependents where id=pg_temp.u('dep')),
 'dependente vencido há mais de 30 dias sai e o cadastro em análise fica');
select is((select count(*) from private.ride_minor_access_log where dependent_id=pg_temp.u('dep')),1::bigint,'registro de acesso sai depois de 12 meses');
select ok(exists(select from private.ride_leg_funding where leg_id=pg_temp.u('leg_fam')) and exists(select from private.ride_voucher_grants where leg_id=pg_temp.u('leg_work')),
 'a retenção não toca no financiamento dos trechos');
select lives_ok($$select private.purge_ride_safety()$$,'repetir a retenção não falha');
insert into purge_state select 2,(select count(*) from private.ride_account_invites),(select count(*) from private.ride_companion_invites),
 (select count(*) from private.ride_rider_invites),(select count(*) from private.ride_guest_invites),(select count(*) from private.ride_companions),
 (select count(*) from private.ride_payer_mandates),(select count(*) from private.ride_dependents),(select count(*) from private.ride_trip_grants);
select is((select count(*) from (select distinct ai,ci,ri,gi,co,ma,de,tg from purge_state) s),1::bigint,'repetir a retenção não muda mais nada');
select is((select array_agg(jobname||' | '||command order by jobname) from cron.job where command ~ 'purge_ride'),
 array['purge-ride-route-points | select private.purge_ride_points()','workeasy-ride-receipt-retention | select private.purge_ride_receipts()',
  'workeasy-ride-safety-retention | select private.purge_ride_safety()'],'os agendamentos de retenção das corridas são os mesmos três de antes');
select is((select count(*) from cron.job where command ~ 'part(y|ies)|minor|delegation|invite'),0::bigint,'a etapa não agenda nenhuma rotina própria');

-- ─── Exclusão de conta ─────────────────────────────────────────────────────────────────────
-- Participante da família com histórico.
select lives_ok($$select public.anonymize_user(pg_temp.u('e_fam_member'))$$,'a participante exclui a conta');
select is((select status||'/'||(removed_by=pg_temp.u('e_fam_member'))::text from private.ride_account_members where account_id=pg_temp.u('fam') and member_id=pg_temp.u('e_fam_member')),
 'removed/true','a participação de quem saiu é encerrada');
select is((select status from private.ride_payer_mandates where id=pg_temp.u('m_fam')),'revoked','o mandato de quem saiu é revogado');
select ok(exists(select from public.ride_legs where id=pg_temp.u('leg_fam') and payer_id=pg_temp.u('e_fam_owner'))
 and exists(select from private.ride_leg_funding where leg_id=pg_temp.u('leg_fam') and member_id=pg_temp.u('e_fam_member') and mandate_id=pg_temp.u('m_fam')),
 'o trecho e o financiamento anteriores continuam registrados');
select is((select status from private.ride_accounts where id=pg_temp.u('fam')),'active','a família de outra pessoa continua aberta');
select tests.authenticate_as('e_fam_owner');
select ok(exists(select from jsonb_array_elements(public.ride_account_statement(pg_temp.u('fam'),pg_temp.g('month_fam')::date)->'rows') r where r->>'leg_id'=pg_temp.g('leg_fam')),
 'a administradora ainda lê o trecho no extrato');
select tests.authenticate_as('e_fam_member');
select throws_ok($$select public.ride_export_my_data()$$,'P0001','not_allowed','sessão de conta excluída não exporta');
select throws_ok($$select public.ride_my_accounts()$$,'P0001','not_allowed','sessão de conta excluída não lê contas');
select tests.clear_authentication();

-- Dona da família com histórico: a conta fecha e fica, com a chave técnica.
select lives_ok($$select public.anonymize_user(pg_temp.u('e_fam_owner'))$$,'a administradora da família com histórico exclui a conta');
select is((select status from private.ride_accounts where id=pg_temp.u('fam')),'closed','conta com trecho financiado é fechada e não apagada');
select is((select count(*) from private.ride_payer_mandates where account_id=pg_temp.u('fam') and status='active'),0::bigint,'nenhum mandato da conta fechada continua ativo');
select is((select count(*) from private.ride_account_invites where account_id=pg_temp.u('fam')),0::bigint,'os convites emitidos por quem saiu são apagados');
select is((select count(*) from private.ride_dependents where guardian_id=pg_temp.u('e_fam_owner')),0::bigint,'os dependentes de quem saiu são apagados');
select is((select status from private.ride_account_members where account_id=pg_temp.u('fam') and member_id=pg_temp.u('e_fam_owner')),'removed','a participação da própria dona é encerrada');
select ok(exists(select from private.ride_leg_funding where leg_id=pg_temp.u('leg_fam') and payer_id=pg_temp.u('e_fam_owner')),'o financiamento do trecho continua com a chave de quem pagou');
select lives_ok($$delete from auth.users where id in (pg_temp.u('e_fam_owner'),pg_temp.u('e_fam_member'))$$,'as duas contas podem ser apagadas fisicamente');
select ok(exists(select from private.ride_subjects where id=pg_temp.u('e_fam_owner')) and exists(select from private.ride_subjects where id=pg_temp.u('e_fam_member'))
 and not exists(select from public.profiles where id in (pg_temp.u('e_fam_owner'),pg_temp.u('e_fam_member'))),'a chave técnica fica onde há histórico financeiro, sem perfil');

-- Dona da família sem uso: tudo sai, inclusive a chave técnica.
select is((select status from private.ride_quotes where id=pg_temp.u('q_fam2')),'awaiting_consent','antes da saída a cotação pela família aguardava aceite');
select lives_ok($$select public.anonymize_user(pg_temp.u('e_free_owner'))$$,'a administradora da família sem uso exclui a conta');
select ok(not exists(select from private.ride_accounts where id=pg_temp.u('fam2')) and not exists(select from private.ride_account_members where account_id=pg_temp.u('fam2'))
 and not exists(select from private.ride_payer_mandates where id=pg_temp.u('m_fam2')) and not exists(select from private.ride_dependents where id=pg_temp.u('dep2')),
 'conta sem nada financeiro é apagada com participantes, mandatos e dependentes');
select ok((select status from private.ride_quotes where id=pg_temp.u('q_fam2'))='superseded' and not exists(select from private.ride_quote_funding where quote_id=pg_temp.u('q_fam2')),
 'a cotação que contava com a conta não sobrevive como cotação pessoal');
select tests.authenticate_as('e_free_member');
select throws_ok($$select public.ride_consent(pg_temp.u('q_fam2'),true)$$,'P0001',null,'a participante não consegue aceitar a cotação antiga');
select is(public.ride_my_accounts(),'[]'::jsonb,'a participante deixa de ver a família apagada');
select tests.clear_authentication();
select is((select count(*) from public.ride_legs l join public.rides r on r.id=l.ride_id where r.passenger_id=pg_temp.u('e_free_member')),0::bigint,'nenhum trecho nasce da cotação antiga');
select lives_ok($$delete from auth.users where id=pg_temp.u('e_free_owner')$$,'a conta sem histórico pode ser apagada fisicamente');
select ok(not exists(select from private.ride_subjects where id=pg_temp.u('e_free_owner')),'sem histórico financeiro a chave técnica também sai');

-- Acompanhantes: primeiro sai quem paga, depois a pessoa acompanhada.
select lives_ok($$select public.anonymize_user(pg_temp.u('e_payer'))$$,'quem aceitou pagar exclui a conta');
select ok(not exists(select from private.ride_companions where companion_id=pg_temp.u('e_payer')) and (select status from private.ride_payer_mandates where id=pg_temp.u('m_comp'))='revoked',
 'a ligação de quem saiu é apagada e o mandato é revogado');
select ok(exists(select from private.ride_companions where owner_id=pg_temp.u('e_owner') and companion_id=pg_temp.u('e_helper') and status='active'),'as outras ligações da pessoa continuam');
select tests.authenticate_as('e_owner');
select throws_ok($$select public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_comp'))$$,'P0001','ride_mandate_revoked','ninguém viaja por conta de quem saiu');
select lives_ok($$select public.ride_support_contact(pg_temp.u('leg_owner'))$$,'a pessoa acompanhada continua com acesso ao suporte');
select tests.clear_authentication();
select lives_ok($$select public.anonymize_user(pg_temp.u('e_owner'))$$,'a pessoa acompanhada exclui a conta');
select ok(not exists(select from private.ride_companions where pg_temp.u('e_owner') in (owner_id,companion_id))
 and not exists(select from private.ride_companion_invites where owner_id=pg_temp.u('e_owner')),'ligações e convites de acompanhante de quem saiu são apagados');
select is((select count(*) from private.ride_passenger_notices where owner_id=pg_temp.u('e_helper') and leg_id=pg_temp.u('leg_owner')),0::bigint,
 'os avisos copiados para quem acompanhava são apagados');
select tests.authenticate_as('e_helper');
select is(public.ride_companion_progress(pg_temp.u('e_owner')),null::jsonb,'quem acompanhava não segue mais ninguém');
select is(public.ride_my_companions()->'companions','[]'::jsonb,'e não lista mais a ligação');
select tests.clear_authentication();

-- Pedido para outra pessoa: sai quem viajou, depois quem pediu.
select lives_ok($$select public.anonymize_user(pg_temp.u('e_rider'))$$,'quem viajou a convite exclui a conta');
select ok(not exists(select from private.ride_rider_invites where id=pg_temp.u('k4')) and exists(select from private.ride_rider_invites where id=pg_temp.u('k5') and status='pending'),
 'o convite de quem saiu é apagado e o convite pendente de quem pediu continua');
select ok(exists(select from private.ride_leg_funding where leg_id=pg_temp.u('leg_rider') and payer_id=pg_temp.u('e_sponsor') and member_id=pg_temp.u('e_rider'))
 and (select status from private.ride_payer_mandates where id=pg_temp.u('m_sp'))='used','o trecho pago por quem pediu e o mandato gasto continuam registrados');
select lives_ok($$select public.anonymize_user(pg_temp.u('e_sponsor'))$$,'quem pediu exclui a conta');
select is((select count(*) from private.ride_rider_invites where sponsor_id=pg_temp.u('e_sponsor')),0::bigint,'todos os convites de quem pediu são apagados');

-- Empresa com histórico: colaboradora, central e dona.
select lives_ok($$select public.anonymize_user(pg_temp.u('e_org_member'))$$,'a colaboradora exclui a conta');
select ok(not exists(select from private.ride_trip_grants where id=pg_temp.u('grant_open')),'o pedido de autorização nunca usado sai com a pessoa');
select ok(exists(select from private.ride_voucher_grants where leg_id=pg_temp.u('leg_work') and member_id=pg_temp.u('e_org_member'))
 and exists(select from private.ride_leg_funding where leg_id=pg_temp.u('leg_work') and account_id=pg_temp.u('org')),'o voucher reservado e o financiamento do trecho continuam registrados');
select is((select status from private.ride_account_members where account_id=pg_temp.u('org') and member_id=pg_temp.u('e_org_member')),'removed','a participação na empresa é encerrada');
select lives_ok($$select public.anonymize_user(pg_temp.u('e_org_desk'))$$,'quem operava a central exclui a conta');
select ok(not exists(select from private.ride_guest_invites where issued_by=pg_temp.u('e_org_desk')) and (select status from private.ride_trip_grants where id=pg_temp.u('guest_grant'))='rejected',
 'o convite de convidado pendente sai e a autorização dele é recusada');
select is((select status from private.ride_accounts where id=pg_temp.u('org')),'active','a empresa continua aberta quando sai um colaborador');
select lives_ok($$select public.anonymize_user(pg_temp.u('e_org_owner'))$$,'quem abriu a empresa com histórico exclui a conta');
select ok((select status from private.ride_accounts where id=pg_temp.u('org'))='closed' and exists(select from private.ride_voucher_programs where id=pg_temp.u('prog'))
 and exists(select from private.ride_cost_centers where id=pg_temp.u('cc')),'empresa com voucher reservado é fechada e guarda programa e centro de custo');
select lives_ok($$delete from auth.users where id=pg_temp.u('e_org_owner')$$,'a conta de quem abriu a empresa pode ser apagada fisicamente');
select ok(exists(select from private.ride_subjects where id=pg_temp.u('e_org_owner')),'a chave técnica de quem abriu a empresa com histórico fica');

-- Empresa sem uso: sai inteira.
select lives_ok($$select public.anonymize_user(pg_temp.u('e_free_org'))$$,'quem abriu a empresa sem uso exclui a conta');
select ok(not exists(select from private.ride_accounts where id=pg_temp.u('org2')) and not exists(select from private.ride_voucher_programs where id=pg_temp.u('prog2'))
 and not exists(select from private.ride_cost_centers where id=pg_temp.u('cc2')) and not exists(select from private.ride_guest_invites where id=pg_temp.u('guest_inv2'))
 and not exists(select from private.ride_trip_grants where account_id=pg_temp.u('org2')),'empresa sem nada financeiro é apagada com programa, centro de custo, convite e autorização');
select lives_ok($$delete from auth.users where id=pg_temp.u('e_free_org')$$,'a conta pode ser apagada fisicamente');
select ok(not exists(select from private.ride_subjects where id=pg_temp.u('e_free_org')),'sem histórico a chave técnica de quem abriu a empresa sai');

-- Frota: sai o motorista, depois quem abriu a frota.
select lives_ok($$select public.anonymize_user(pg_temp.u('e_fleet_driver'))$$,'o motorista da frota exclui a conta');
select is((select status from private.ride_fleet_assignments where id=pg_temp.u('asg')),'ended','a cessão de quem saiu é encerrada');
select is((select status from private.ride_account_members where account_id=pg_temp.u('fleet') and member_id=pg_temp.u('e_fleet_driver')),'removed','a participação na frota é encerrada');
select lives_ok($$select public.anonymize_user(pg_temp.u('e_fleet_owner'))$$,'quem abriu a frota exclui a conta');
select ok(not exists(select from private.ride_accounts where id=pg_temp.u('fleet')) and not exists(select from private.ride_fleet_vehicles where id=pg_temp.u('veh'))
 and not exists(select from private.ride_fleet_assignments where id=pg_temp.u('asg')),'frota sem corrida é apagada com veículos e cessões');

-- Quem não tinha relação com as contas apagadas não é afetado.
select tests.authenticate_as('e_outsider');
select lives_ok($$select public.ride_export_my_data()$$,'outra pessoa continua exportando os próprios dados');
select tests.clear_authentication();
select is((select count(*) from private.ride_accounts where owner_id in (select v::uuid from t where k like 'e\_%')),2::bigint,'restam só as duas contas fechadas com histórico');

-- ─── Invariantes de permissão ──────────────────────────────────────────────────────────────
create temp table rpc(name text primary key);
-- DD124 (20261128100101) adds admin_resolve_ride_voucher_hold and ride_voucher_hold.
insert into rpc select unnest(array['admin_close_ride_invoice','admin_resolve_ride_voucher_hold','ride_voucher_hold','admin_decide_invoice_dispute','admin_review_dependent','admin_review_fleet_assignment','admin_ride_dependents',
 'admin_ride_fleet_assignments','admin_ride_organizations','admin_ride_party_queue','admin_save_ride_voucher_program','admin_set_minor_driver_clearance','admin_verify_ride_account','ride_account_invite','ride_account_statement',
 'ride_answer_companion','ride_answer_guest_invite','ride_answer_rider_invite','ride_companion_progress','ride_create_family','ride_create_fleet','ride_create_organization',
 'ride_dashboard','ride_decide_trip_grant','ride_dispute_invoice_line','ride_export_my_data','ride_fleet_assign','ride_fleet_end_assignment','ride_fleet_overview',
 'ride_fleet_save_vehicle','ride_guardian_escalate','ride_guardian_watch','ride_invite_companion','ride_invite_guest','ride_invite_member','ride_invite_rider','ride_invoice',
 'ride_invoice_export','ride_join_account','ride_my_accounts','ride_my_companions','ride_my_rider_invites','ride_org_report','ride_quote_for_dependent','ride_quote_funded',
 'ride_quote_sponsored','ride_redeem_voucher','ride_register_dependent','ride_remove_member','ride_request_trip_grant','ride_revoke_account_invite','ride_revoke_companion',
 'ride_revoke_guest_invite','ride_revoke_rider_invite','ride_rider_invite','ride_save_cost_center','ride_set_account_limit','ride_set_companion','ride_set_member_limit',
 'ride_set_member_role','ride_companion_invite','ride_guest_invite','ride_my_cessions','ride_withdraw_dependent',
 -- Chamadas anteriores que passaram a ler objetos da etapa: o pedido de pagamento aplica o voucher e o recibo esconde o valor de quem não paga.
 'ride_open_payment_order','ride_aftercare',
 -- Titularidade (20261128100301, DD118 de 28/11/2026): nomear administração, transferir e ler o plano da exclusão.
 'ride_set_account_admin','ride_transfer_account','ride_erasure_account_plan']);
create temp table party_table(name text primary key);
insert into party_table select unnest(array['ride_party_rules','ride_accounts','ride_account_members','ride_account_invites','ride_payer_mandates','ride_quote_funding',
 'ride_leg_funding','ride_rider_invites','ride_companion_terms','ride_companions','ride_companion_invites','ride_minor_policies','ride_dependents',
 'ride_minor_driver_clearances','ride_quote_dependents','ride_leg_dependents','ride_minor_alerts','ride_minor_access_log','ride_cost_centers','ride_voucher_programs',
 'ride_trip_grants','ride_guest_invites','ride_voucher_grants','ride_invoices','ride_invoice_lines','ride_invoice_marks','ride_invoice_disputes','ride_fleet_vehicles',
 'ride_fleet_assignments','ride_leg_vehicles']);
select is((select count(*) from rpc),69::bigint,'a lista de chamadas públicas da etapa tem 69 nomes (64 da etapa 5, 2 de DD124 e 3 da titularidade)');
select is((select array_agg(r.name order by r.name) from rpc r where (select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=r.name)<>1),
 null::text[],'cada chamada pública da etapa existe uma única vez');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join rpc r on r.name=p.proname where p.pronamespace='public'::regnamespace
   and not has_function_privilege('authenticated',p.oid,'execute')),null::text[],'toda chamada pública da etapa é executável por quem tem sessão');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join rpc r on r.name=p.proname where p.pronamespace='public'::regnamespace
   and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute')
     or exists(select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'))),
 null::text[],'nenhuma chamada pública da etapa é executável por visitante, por PUBLIC ou pelo papel de serviço');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join rpc r on r.name=p.proname where p.pronamespace='public'::regnamespace
   and (not p.prosecdef or not coalesce(p.proconfig,'{}') @> array['search_path=""'])),null::text[],'toda chamada pública da etapa é security definer com search_path vazio');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p where p.pronamespace='public'::regnamespace
   and p.proname in ('ride_dashboard_before_parties','ride_export_before_parties')
   and not has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute') and not has_function_privilege('service_role',p.oid,'execute')),
 array['ride_dashboard_before_parties','ride_export_before_parties'],'os corpos anteriores que ficaram em public não são executáveis por nenhum papel da API');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p where p.pronamespace='public'::regnamespace
   and (p.proname ~ '(^|_)rides?(_|$)' or p.proname in (select name from rpc)) and has_function_privilege('anon',p.oid,'execute')),
 null::text[],'nenhuma função das corridas em public é executável por visitante');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p where p.pronamespace='private'::regnamespace and p.proname ~ '(^|_)rides?(_|$)'
   and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute')
     or exists(select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'))),
 null::text[],'nenhuma função das corridas em private é executável por visitante, sessão, serviço ou PUBLIC');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p where p.pronamespace='private'::regnamespace and p.prorettype='trigger'::regtype
   and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')
     or exists(select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE'))),
 null::text[],'nenhuma função de gatilho em private é executável por visitante, sessão ou PUBLIC');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p where p.pronamespace in ('private'::regnamespace,'public'::regnamespace) and p.prosecdef
   and not coalesce(p.proconfig,'{}') @> array['search_path=""']),null::text[],'toda função security definer fixa o search_path vazio');
-- As funções novas são reconhecidas pelo que tocam: qualquer função que cite um objeto da etapa.
select ok((select count(*) from pg_proc p where p.pronamespace='private'::regnamespace
   and p.prosrc ~ 'ride_(party|account|payer_mandates|quote_funding|leg_funding|rider_invites|companion|minor|dependent|cost_centers|voucher|trip_grants|guest_invites|invoice|fleet|leg_vehicles)')>=50,
 'as funções privadas da etapa são encontradas pelo que tocam');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p where p.pronamespace in ('private'::regnamespace,'public'::regnamespace)
   and p.prosrc ~ 'ride_(party|account|payer_mandates|quote_funding|leg_funding|rider_invites|companion|minor|dependent|cost_centers|voucher|trip_grants|guest_invites|invoice|fleet|leg_vehicles)'
   and (has_function_privilege('anon',p.oid,'execute') or (p.pronamespace='private'::regnamespace and has_function_privilege('authenticated',p.oid,'execute'))
     or (p.pronamespace='public'::regnamespace and has_function_privilege('authenticated',p.oid,'execute') and p.proname not in (select name from rpc)))),
 null::text[],'nenhuma função que toca objetos da etapa fica aberta fora da lista de chamadas públicas');
select is((select count(*) from pg_class c join party_table p on p.name=c.relname where c.relnamespace='private'::regnamespace and c.relkind='r' and c.relrowsecurity),30::bigint,
 'as trinta tabelas da etapa existem em private com RLS ligada');
select is((select array_agg(c.relname::text order by c.relname) from pg_class c join party_table p on p.name=c.relname where c.relnamespace='private'::regnamespace
   and (has_table_privilege('anon',c.oid,'select,insert,update,delete,truncate,references,trigger') or has_table_privilege('authenticated',c.oid,'select,insert,update,delete,truncate,references,trigger')
     or has_table_privilege('service_role',c.oid,'select,insert,update,delete,truncate,references,trigger'))),null::text[],'nenhuma tabela da etapa dá privilégio a papel da API');
select is((select count(*) from pg_class c join party_table p on p.name=c.relname where c.relnamespace='public'::regnamespace),0::bigint,'a etapa não cria tabela nem visão em public');
select is((select count(*) from pg_policies where schemaname='private' and tablename in (select name from party_table)),0::bigint,'sem política: as tabelas só são lidas pelas funções');
select ok((select count(*) from private.ride_party_rules where environment<>'simulation')=0 and (select count(*) from private.ride_minor_policies where environment<>'simulation')=0
 and (select count(*) from private.ride_companion_terms where environment<>'simulation')=0,'produção segue sem nenhuma linha de habilitação da etapa');
select is((select count(*) from pg_trigger g where g.tgrelid='public.profiles'::regclass and not g.tgisinternal and g.tgname in ('erase_ride_parties','erase_ride_minors')),2::bigint,
 'os dois gatilhos de exclusão da etapa estão ligados ao perfil');
select tests.authenticate_as('e_outsider');
select throws_ok($$select private.erase_ride_parties()$$,'42501',null,'o gatilho de exclusão não é chamado direto');
select tests.authenticate_anon();
select throws_ok($$select public.ride_my_accounts()$$,'42501',null,'visitante sem sessão não chama as funções da etapa');
select tests.clear_authentication();

select * from finish();
rollback;
