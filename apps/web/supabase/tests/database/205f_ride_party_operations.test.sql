-- O17 etapa 5 · o que a operação e a pessoa convidada enxergam antes de agir (20261127110508).
-- A fila da operação lista contas sem conferência ou perto de perdê-la, dependentes e cessões em
-- revisão, contestações abertas e meses a fechar, sem lugar, sem e-mail e só com o nome e a faixa
-- etária do dependente. O financeiro lê as empresas e seus programas. Quem recebe um convite de
-- acompanhante ou de convidado lê o que está aceitando, e o motorista de frota lê a própria cessão.
-- As competências são relativas ao mês corrente de São Paulo; os eventos da etapa 4 nascem agora
-- e o roteiro os reposiciona, então nada depende do dia em que o teste roda. Dados fictícios, sem rede.
begin;
select no_plan();
select tests.setup_fixture();
select tests.create_user('f_driver','Motorista autônomo');
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,v text not null);
grant select,insert on t to authenticated,anon;
create function pg_temp.g(p text) returns text language sql stable as $$select t.v from t where t.k=p$$;
create function pg_temp.u(p text) returns uuid language sql stable as $$select t.v::uuid from t where t.k=p$$;
create function pg_temp.n(p text) returns int language sql stable as $$select t.v::int from t where t.k=p$$;
create function pg_temp.d(p text) returns date language sql stable as $$select t.v::date from t where t.k=p$$;
create function pg_temp.trip() returns jsonb language sql immutable as $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
create function pg_temp.today() returns date language sql stable security definer as $$select private.sp_date(now())$$;
create function pg_temp.keys(p jsonb) returns text[] language sql immutable as $$select array_agg(k order by k) from jsonb_object_keys(p) k$$;
-- Um item da fila, lido pela operação: pela chave do item ou pela conta.
create function pg_temp.item(p_section text,p_id uuid) returns jsonb language sql as $$
 select e from jsonb_array_elements(public.admin_ride_party_queue()->p_section) e where coalesce(e->>'id',e->>'account_id')=p_id::text$$;
create function pg_temp.org(p_id uuid) returns jsonb language sql as $$
 select e from jsonb_array_elements(public.admin_ride_organizations()) e where e->>'id'=p_id::text$$;
grant execute on function pg_temp.g(text),pg_temp.u(text),pg_temp.n(text),pg_temp.d(text),pg_temp.trip(),pg_temp.today(),pg_temp.keys(jsonb),
 pg_temp.item(text,uuid),pg_temp.org(uuid) to authenticated,anon;
-- Atalhos do roteiro, executados como dono do teste.
create function pg_temp.noon(p_month text,p_day int) returns timestamptz language sql stable as $$
 select ((pg_temp.d(p_month)+(p_day-1))::timestamp+interval '12 hours') at time zone 'America/Sao_Paulo'$$;
-- Viagem pelo perfil profissional: cotação, aceite, conclusão e uso do voucher.
create function pg_temp.work_trip(p_key text) returns void language plpgsql as $$
declare v jsonb; leg uuid;
begin
 perform tests.authenticate_as('client_a');
 v:=public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('prog'),pg_temp.u('cc'));
 perform public.ride_consent((v->>'id')::uuid,true);
 perform tests.clear_authentication();
 select l.id into strict leg from public.ride_legs l where l.source_quote_id=(v->>'id')::uuid;
 update public.ride_legs set driver_id=tests.uid('f_driver'),status='completed' where id=leg;
 perform tests.authenticate_as('client_a');
 insert into t select 'o_'||p_key,public.ride_redeem_voucher(leg,'pix')->>'order_id';
 perform tests.clear_authentication();
end $$;
create function pg_temp.move(p_order text,p_at timestamptz) returns void language sql as $$
 update private.ride_order_events set at=p_at where order_id=pg_temp.u(p_order) and action='benefit'$$;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 select tests.uid(d),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true from unnest(array['provider_c','f_driver']) d;
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity,card_brands,acquirer_profile_ref)
 select 'simulation','Saúde','Jabaquara',m,'ensaio 205f',tstzrange(now()-interval '1 day',now()+interval '1 day'),
  case when m='card' then array['VISA'] else '{}'::text[] end,case when m='card' then 'conta hospedada TESTE' end from unnest(array['card','pix','benefit']) m;
insert into t select 'c',private.ride_month(now())::text;
insert into t select 'p',(pg_temp.d('c')-interval '3 months')::date::text;
insert into t select 'm',(pg_temp.d('c')-interval '2 months')::date::text;
insert into t select 'l',(pg_temp.d('c')-interval '1 month')::date::text;
select tests.authenticate_as('provider_b');
insert into t select 'x',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'total_cents';
select tests.clear_authentication();
select ok(pg_temp.n('x')>0,'o ensaio tem tarifa para o trecho de referência');

-- ─── Quem lê ───────────────────────────────────────────────────────────────────────────────
select tests.authenticate_anon();
select throws_ok($$select public.admin_ride_party_queue()$$,'42501',null,'visitante sem sessão não lê a fila da operação');
select throws_ok($$select public.admin_ride_organizations()$$,'42501',null,'visitante sem sessão não lê as empresas');
select throws_ok($$select public.ride_companion_invite(repeat('a',64))$$,'42501',null,'visitante sem sessão não lê convite de acompanhante');
select throws_ok($$select public.ride_guest_invite(repeat('a',64))$$,'42501',null,'visitante sem sessão não lê convite de convidado');
select throws_ok($$select public.ride_my_cessions()$$,'42501',null,'visitante sem sessão não lê cessões');
select tests.authenticate_as('client_a');
select throws_ok($$select public.admin_ride_party_queue()$$,'P0001','not_allowed','quem não é da operação não lê a fila');
select throws_ok($$select public.admin_ride_organizations()$$,'P0001','not_allowed','quem não é da operação não lê as empresas e seus programas');
select throws_ok($$select private.ride_invoice_open_months(gen_random_uuid())$$,'42501',null,'a função interna dos meses a fechar não é chamada direto');
select is(public.ride_companion_invite(repeat('a',64)),null,'código desconhecido de acompanhante não devolve nada');
select is(public.ride_guest_invite('não é um código'),null,'código malformado de convidado não devolve nada');
select tests.authenticate_as('admin');
select is(pg_temp.keys(public.admin_ride_party_queue()),array['accounts','cessions','dependents','disputes','invoices'],'a fila tem as cinco seções');
select tests.clear_authentication();

-- ─── Contas sem conferência ou perto de perdê-la ───────────────────────────────────────────
select tests.authenticate_as('client_a');
insert into t select 'org',public.ride_create_organization('Empresa da fila',gen_random_uuid())::text;
select tests.authenticate_as('provider_d');
insert into t select 'org_b',public.ride_create_organization('Empresa B da fila',gen_random_uuid())::text;
select tests.authenticate_as('provider_a');
insert into t select 'fleet',public.ride_create_fleet('Frota da fila',gen_random_uuid())::text;
select tests.authenticate_as('client_b');
insert into t select 'fam',public.ride_create_family('Família da fila',100000,'pix',gen_random_uuid())::text;
select tests.clear_authentication();
insert into private.ride_accounts(id,environment,kind,owner_id,name,request_key,request_hash)
 values(md5('205f-live')::uuid,'live','organization',tests.uid('provider_d'),'Empresa de outro ambiente',gen_random_uuid(),'\x00');
insert into t values('live',md5('205f-live')::uuid::text);
select tests.authenticate_as('admin');
select is(pg_temp.keys(pg_temp.item('accounts',pg_temp.u('org'))),array['created_at','id','kind','name','state','verified_until'],'a conta em espera traz só o necessário para a conferência');
select is(pg_temp.item('accounts',pg_temp.u('org'))-'created_at',jsonb_build_object('id',pg_temp.u('org'),'kind','organization','name','Empresa da fila','state','pending','verified_until',null),
 'empresa recém-aberta aguarda a conferência');
select is(pg_temp.item('accounts',pg_temp.u('fleet'))->>'state','pending','frota recém-aberta aguarda a conferência');
select is(pg_temp.item('accounts',pg_temp.u('fleet'))->>'kind','fleet','a fila diz que a conta é uma frota');
select is(pg_temp.item('accounts',pg_temp.u('fam')),null,'família não passa por conferência e não entra na fila');
select is(pg_temp.item('accounts',pg_temp.u('live')),null,'conta de outro ambiente não entra na fila');
select is(public.admin_ride_party_queue()#>>'{accounts,0,state}','pending','quem nunca foi conferido aparece primeiro');
select ok(public.admin_verify_ride_account(pg_temp.u('org'),'ficticio-o17-e5 contrato',now()+interval '90 days'),'a operação confere a empresa por noventa dias');
select is(pg_temp.item('accounts',pg_temp.u('org')),null,'conta conferida com folga sai da fila');
select ok(public.admin_verify_ride_account(pg_temp.u('fleet'),'ficticio-o17-e5 frota',now()+interval '20 days'),'a operação confere a frota por vinte dias');
select is(pg_temp.item('accounts',pg_temp.u('fleet'))->>'state','expiring','conferência que vence em menos de trinta dias volta à fila');
select ok((pg_temp.item('accounts',pg_temp.u('fleet'))->>'verified_until')::timestamptz>now(),'com a data em que a conferência termina');
select ok(public.admin_verify_ride_account(pg_temp.u('org_b'),'ficticio-o17-e5 contrato B',now()+interval '10 days'),'a operação confere a empresa B');
select is(public.admin_verify_ride_account(pg_temp.u('org_b'),'ficticio-o17-e5 retirada',null),false,'e depois retira a conferência');
select is(pg_temp.item('accounts',pg_temp.u('org_b'))->>'state','lapsed','conferência que acabou de terminar aparece como vencida');
select tests.clear_authentication();
update private.ride_accounts set verified_until=now()-interval '40 days' where id=pg_temp.u('org_b');
select tests.authenticate_as('admin');
select is(pg_temp.item('accounts',pg_temp.u('org_b')),null,'conferência vencida há mais de trinta dias deixa a fila');
select tests.clear_authentication();
update private.ride_accounts set verified_until=null,verification_ref=null,status='closed' where id=pg_temp.u('org_b');
select tests.authenticate_as('admin');
select is(pg_temp.item('accounts',pg_temp.u('org_b')),null,'conta encerrada não espera conferência');

-- ─── Empresas e programas para o financeiro ────────────────────────────────────────────────
select is(pg_temp.keys(pg_temp.org(pg_temp.u('org'))),array['created_at','id','name','programs','verified','verified_until'],'a empresa traz nome, conferência e programas');
select is(pg_temp.org(pg_temp.u('org'))->'verified','true'::jsonb,'empresa conferida aparece como tal');
select is(pg_temp.org(pg_temp.u('org'))->'programs','[]'::jsonb,'empresa conferida ainda sem programa mostra a lista vazia');
select is(pg_temp.org(pg_temp.u('fleet')),null,'frota não entra na lista de empresas');
select is(pg_temp.org(pg_temp.u('fam')),null,'família não entra na lista de empresas');
select is(pg_temp.org(pg_temp.u('org_b')),null,'empresa encerrada não entra na lista');
select is(pg_temp.org(pg_temp.u('live')),null,'empresa de outro ambiente não entra na lista');
insert into t values('prog',gen_random_uuid()::text);
select lives_ok($$select public.admin_save_ride_voucher_program(pg_temp.u('prog'),pg_temp.u('org'),'Viagens a trabalho',pg_temp.n('x')*20,pg_temp.n('x')*2,null,null,null,null,
  now()-interval '1 hour',now()+interval '10 days','none',false,'ficticio-o17-e5 verba','ficticio-o17-e5 contrato',true)$$,'o financeiro registra o programa da empresa');
select is(pg_temp.keys(pg_temp.org(pg_temp.u('org'))#>'{programs,0}'),array['areas','budget_cents','classes','committed_cents','created_at','enabled','evidence_ref','excess_payer',
  'funding_ref','group_tag','id','label','member_limit_cents','requires_approval','ride_value_cents','valid_from','valid_until'],'o programa traz o que o registro pede de volta');
select is((pg_temp.org(pg_temp.u('org'))#>'{programs,0}')-array['created_at','valid_from','valid_until'],jsonb_build_object('id',pg_temp.u('prog'),'label','Viagens a trabalho','enabled',true,
  'budget_cents',pg_temp.n('x')*20,'committed_cents',0,'ride_value_cents',pg_temp.n('x')*2,'member_limit_cents',null,'areas','[]'::jsonb,'classes','[]'::jsonb,'group_tag',null,
  'excess_payer','none','requires_approval',false,'funding_ref','ficticio-o17-e5 verba','evidence_ref','ficticio-o17-e5 contrato'),'com verba, valor, regras e as duas referências');
select tests.authenticate_as('client_a');
insert into t select 'cc',public.ride_save_cost_center(pg_temp.u('org'),'VENDAS','Vendas',true)::text;
select tests.clear_authentication();

-- ─── Meses a fechar e contestações ─────────────────────────────────────────────────────────
select tests.authenticate_as('admin');
select is(pg_temp.item('invoices',pg_temp.u('org')),null,'empresa sem movimento não tem mês a fechar');
select tests.clear_authentication();
select pg_temp.work_trip('1');
select pg_temp.move('o_1',pg_temp.noon('p',5));
select pg_temp.work_trip('4');
select tests.authenticate_as('admin');
select is(pg_temp.org(pg_temp.u('org'))#>'{programs,0,committed_cents}',to_jsonb(pg_temp.n('x')*2),'o financeiro vê o que já está comprometido da verba');
select is(pg_temp.keys(pg_temp.item('invoices',pg_temp.u('org'))),array['account_id','account_name','months'],'o mês a fechar traz a conta, o nome e as competências');
select is(pg_temp.item('invoices',pg_temp.u('org'))->'months',to_jsonb(array[pg_temp.d('p')]),'só o mês encerrado com movimento entra; o mês corrente fica de fora');
select is(pg_temp.item('invoices',pg_temp.u('org'))->>'account_name','Empresa da fila','com o nome da empresa');
insert into t select 'inv_p',public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('p'),gen_random_uuid())::text;
select is(pg_temp.item('invoices',pg_temp.u('org')),null,'mês fechado sai da fila');
select is(public.admin_ride_party_queue()->'disputes'@>jsonb_build_array(jsonb_build_object('account_name','Empresa da fila')),false,'sem contestação aberta, nada aparece');
select tests.clear_authentication();
insert into t select 'line',l.id::text from private.ride_invoice_lines l where l.invoice_id=pg_temp.u('inv_p') and l.kind='voucher';
select tests.authenticate_as('client_a');
insert into t select 'disp',public.ride_dispute_invoice_line(pg_temp.u('line'),'Cobrança em duplicidade',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select is(pg_temp.keys(pg_temp.item('disputes',pg_temp.u('disp'))),array['account_name','cents','id','kind','month','raised_at','reason'],'a contestação aberta traz só o que a decisão pede');
select is(pg_temp.item('disputes',pg_temp.u('disp'))-'raised_at',jsonb_build_object('id',pg_temp.u('disp'),'account_name','Empresa da fila','month',pg_temp.d('p'),'kind','voucher',
  'cents',pg_temp.n('x'),'reason','Cobrança em duplicidade'),'com a empresa, a competência, o item e o motivo');
select is(public.admin_decide_invoice_dispute(pg_temp.u('disp'),true,'Conferido no ensaio'),'accepted','o financeiro aceita a contestação');
select is(pg_temp.item('disputes',pg_temp.u('disp')),null,'contestação decidida sai da fila');
select is(pg_temp.item('invoices',pg_temp.u('org'))->'months',to_jsonb(array[pg_temp.d('m')]),'o crédito aceito espera o primeiro mês aberto depois da fatura contestada');
select tests.clear_authentication();
select pg_temp.work_trip('2');
select pg_temp.move('o_2',pg_temp.noon('p',20));
select tests.authenticate_as('admin');
select is(pg_temp.item('invoices',pg_temp.u('org'))->'months',to_jsonb(array[pg_temp.d('m')]),'movimento tardio de um mês já fechado vai para o primeiro mês aberto');
select tests.clear_authentication();
select pg_temp.work_trip('3');
select pg_temp.move('o_3',pg_temp.noon('l',3));
select tests.authenticate_as('admin');
select is(pg_temp.item('invoices',pg_temp.u('org'))->'months',to_jsonb(array[pg_temp.d('m'),pg_temp.d('l')]),'os meses a fechar vêm do mais antigo para o mais novo');
insert into t select 'inv_m',public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('m'),gen_random_uuid())::text;
select tests.clear_authentication();
select is((select array_agg(l.kind order by l.kind) from private.ride_invoice_lines l where l.invoice_id=pg_temp.u('inv_m')),array['adjustment','voucher'],
 'o fechamento do mês indicado leva o movimento tardio e o crédito, como a fila dizia');
select tests.authenticate_as('admin');
select is(pg_temp.item('invoices',pg_temp.u('org'))->'months',to_jsonb(array[pg_temp.d('l')]),'resta o mês seguinte');
select lives_ok($$select public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('l'),gen_random_uuid())$$,'o financeiro fecha o último mês encerrado');
select is(pg_temp.item('invoices',pg_temp.u('org')),null,'com tudo fechado a empresa sai da fila, mesmo com movimento no mês corrente');
select tests.clear_authentication();
-- Limite: muitos meses antigos em aberto aparecem em doze, do mais antigo em diante.
insert into private.ride_order_events(order_id,action,operation_id,data,at)
 select pg_temp.u('o_1'),'benefit',gen_random_uuid(),jsonb_build_object('cents',1),
  ((pg_temp.d('c')-make_interval(months=>i))::timestamp+interval '12 hours') at time zone 'America/Sao_Paulo' from generate_series(4,17) i;
select tests.authenticate_as('admin');
select is(jsonb_array_length(pg_temp.item('invoices',pg_temp.u('org'))->'months'),12,'a lista de meses de uma empresa para em doze');
select is(pg_temp.item('invoices',pg_temp.u('org'))#>>'{months,0}',(pg_temp.d('c')-interval '17 months')::date::text,'e começa pelo mais antigo');
select tests.clear_authentication();

-- ─── Dependentes em conferência ────────────────────────────────────────────────────────────
select tests.authenticate_as('client_b');
insert into t select 'dep',public.ride_register_dependent(pg_temp.u('fam'),'Lia','13-15','parental_authority',gen_random_uuid())::text;
insert into t select 'dep2',public.ride_register_dependent(pg_temp.u('fam'),'Caio','16-17','guardianship',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select is(pg_temp.keys(pg_temp.item('dependents',pg_temp.u('dep'))),array['age_band','id','label','requested_at'],'do dependente a fila leva só o nome, a faixa etária e a data do pedido');
select is(pg_temp.item('dependents',pg_temp.u('dep'))-'requested_at',jsonb_build_object('id',pg_temp.u('dep'),'label','Lia','age_band','13-15'),'com o nome e a faixa informados pelo responsável');
select is(pg_temp.item('dependents',pg_temp.u('dep2'))->>'age_band','16-17','o segundo pedido também aparece');
select tests.clear_authentication();
select is((select count(*) from private.ride_minor_access_log where actor=tests.uid('admin') and dependent_id=pg_temp.u('dep') and purpose='queue'),1::bigint,
 'cada leitura da fila fica registrada, uma vez por hora por pessoa da operação');
update private.ride_minor_access_log set at=now()-interval '2 hours' where dependent_id=pg_temp.u('dep');
select tests.authenticate_as('admin');
select ok(pg_temp.item('dependents',pg_temp.u('dep')) is not null,'uma leitura depois de uma hora');
select tests.clear_authentication();
select is((select count(*) from private.ride_minor_access_log where actor=tests.uid('admin') and dependent_id=pg_temp.u('dep') and purpose='queue'),2::bigint,'deixa um novo registro');
select tests.authenticate_as('admin');
select ok(public.admin_review_dependent(pg_temp.u('dep'),true,'PARECER-205F',pg_temp.today()+30),'a operação confere o primeiro dependente');
select is(public.admin_review_dependent(pg_temp.u('dep2'),false,'RECUSA-205F',null),false,'e recusa o segundo');
select is(pg_temp.item('dependents',pg_temp.u('dep')),null,'dependente conferido sai da fila');
select is(pg_temp.item('dependents',pg_temp.u('dep2')),null,'dependente recusado sai da fila');

-- ─── Cessões em revisão e a cessão vista pelo motorista ────────────────────────────────────
select tests.authenticate_as('provider_a');
insert into t select 'inv_c',public.ride_invite_member(pg_temp.u('fleet'),'provider_c@test.local','fleet_driver',60,gen_random_uuid())->>'token';
select tests.authenticate_as('provider_c');
select is(public.ride_my_cessions(),'[]'::jsonb,'motorista sem cessão lê a lista vazia');
select is(public.ride_join_account(pg_temp.g('inv_c'),true),'accepted','o motorista entra na frota');
select tests.authenticate_as('provider_a');
insert into t select 'veh',public.ride_fleet_save_vehicle(pg_temp.u('fleet'),'FILA-001','sedan','DOC-FILA','APOLICE-FILA','VISTORIA-FILA',pg_temp.today()+60,pg_temp.today()+60,pg_temp.today()+60)::text;
insert into t select 'ces',public.ride_fleet_assign(pg_temp.u('veh'),tests.uid('provider_c'),'CESSAO-FILA','fleet',now()-interval '1 hour',now()+interval '30 days',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select is(pg_temp.keys(pg_temp.item('cessions',pg_temp.u('ces'))),array['driver_label','fleet_name','from','id','until','vehicle_identifier'],'a cessão em revisão traz frota, veículo, motorista e período');
select is(pg_temp.item('cessions',pg_temp.u('ces'))-array['from','until'],jsonb_build_object('id',pg_temp.u('ces'),'fleet_name','Frota da fila','vehicle_identifier','FILA-001',
  'driver_label','Prestadora C'),'com os nomes que a revisão precisa');
select ok((pg_temp.item('cessions',pg_temp.u('ces'))->>'from')::timestamptz<now() and (pg_temp.item('cessions',pg_temp.u('ces'))->>'until')::timestamptz>now(),'e o período da cessão');
select tests.authenticate_as('provider_c');
select is(jsonb_array_length(public.ride_my_cessions()),1,'o motorista da frota lê a própria cessão');
select is(pg_temp.keys(public.ride_my_cessions()->0),array['account_id','account_name','beneficiary','category','cession_ref','created_at','from','id','status','until','vehicle_identifier'],
 'com frota, veículo, período e situação');
select is(public.ride_my_cessions()#>>'{0,status}','pending_review','e sabe que ela está em revisão');
select tests.authenticate_as('client_b');
select is(public.ride_my_cessions(),'[]'::jsonb,'outra pessoa não lê a cessão do motorista');
select tests.authenticate_as('admin');
select ok(public.admin_review_fleet_assignment(pg_temp.u('ces'),true,'REVISAO-FILA'),'a operação aprova a cessão');
select is(pg_temp.item('cessions',pg_temp.u('ces')),null,'cessão revisada sai da fila');
select tests.authenticate_as('provider_c');
select is(public.ride_my_cessions()#>>'{0,status}','approved','o motorista vê a cessão aprovada');

-- ─── Convite de acompanhante lido antes do aceite ──────────────────────────────────────────
select tests.authenticate_as('client_b');
insert into t select 'ct',public.ride_invite_companion('provider_b@test.local',array['completed','accepted'],true,60,gen_random_uuid())->>'token';
insert into t select 'ct2',public.ride_invite_companion('provider_d@test.local',array['arriving'],false,60,gen_random_uuid())->>'token';
select is(public.ride_companion_invite(pg_temp.g('ct')),null,'quem convidou não lê o convite como destinatário');
select tests.authenticate_as('provider_d');
select is(public.ride_companion_invite(pg_temp.g('ct')),null,'outra conta não lê o convite');
select is(public.ride_companion_invite(pg_temp.g('ct2'))-array['id','expires_at'],jsonb_build_object('owner_label','Cliente B','notices',jsonb_build_array('arriving'),'pays',false,
  'ceiling_cents',null,'simulation',true),'convite sem pagamento mostra quem convida e os avisos, sem teto');
select tests.authenticate_as('provider_b');
select is(pg_temp.keys(public.ride_companion_invite(pg_temp.g('ct'))),array['ceiling_cents','expires_at','id','notices','owner_label','pays','simulation'],'o convite traz só o que o aceite decide');
select is(public.ride_companion_invite(pg_temp.g('ct'))-array['id','expires_at'],jsonb_build_object('owner_label','Cliente B','notices',jsonb_build_array('accepted','completed'),'pays',true,
  'ceiling_cents',15000,'simulation',true),'quem é convidado a pagar lê quem convida, os avisos e o teto por corrida antes de aceitar');
select tests.clear_authentication();
update private.ride_companion_terms set valid_until=now()-interval '1 second' where environment='simulation';
select tests.authenticate_as('provider_b');
select is(public.ride_companion_invite(pg_temp.g('ct')),null,'sem termo de pagamento vigente, o convite pago não é oferecido');
select tests.authenticate_as('provider_d');
select ok(public.ride_companion_invite(pg_temp.g('ct2')) is not null,'e o convite sem pagamento continua legível');
select tests.clear_authentication();
update private.ride_companion_terms set valid_until='infinity' where environment='simulation';
update private.ride_companion_invites set expires_at=now()-interval '1 second' where owner_id=tests.uid('client_b') and not pays;
select tests.authenticate_as('provider_d');
select is(public.ride_companion_invite(pg_temp.g('ct2')),null,'convite vencido não devolve nada');
select tests.authenticate_as('provider_b');
select is(public.ride_answer_companion(pg_temp.g('ct'),true),'accepted','o acompanhante aceita depois de ler');
select is(public.ride_companion_invite(pg_temp.g('ct')),null,'convite já respondido não devolve nada');

-- ─── Convite de convidado lido antes do aceite ─────────────────────────────────────────────
select tests.authenticate_as('client_a');
insert into t select 'gt',public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('prog'),pg_temp.u('cc'),'provider_e@test.local',pg_temp.trip(),null,30,gen_random_uuid())->>'token';
insert into t values('g2',gen_random_uuid()::text);
insert into t select 'gt2',public.ride_invite_guest(pg_temp.u('org'),pg_temp.u('prog'),pg_temp.u('cc'),'provider_b@test.local',pg_temp.trip(),null,30,pg_temp.u('g2'))->>'token';
select is(public.ride_guest_invite(pg_temp.g('gt')),null,'quem emitiu não lê o convite como convidado');
select tests.authenticate_as('provider_d');
select is(public.ride_guest_invite(pg_temp.g('gt')),null,'outra conta não lê o convite');
select tests.authenticate_as('provider_e');
select is(pg_temp.keys(public.ride_guest_invite(pg_temp.g('gt'))),array['account_name','expires_at','id','legs','scheduled_at','simulation','status'],'o convite traz empresa, itinerário e horário, sem preço');
select is(public.ride_guest_invite(pg_temp.g('gt'))-array['id','expires_at'],jsonb_build_object('status','pending','account_name','Empresa da fila',
  'legs',jsonb_build_array(jsonb_build_object('seq',1,'origin','Saúde','destination','Jabaquara','pickup_at',null)),'scheduled_at',null,'simulation',true),
 'o convidado lê a empresa que convida e o itinerário por área antes de aceitar');
select is(public.ride_answer_guest_invite(pg_temp.g('gt'),true,gen_random_uuid())->>'status','accepted','o convidado aceita depois de ler');
select is(public.ride_guest_invite(pg_temp.g('gt'))->>'status','accepted','e o convite passa a aparecer como aceito');
select is(jsonb_array_length(public.ride_guest_invite(pg_temp.g('gt'))->'legs'),1,'ainda com o itinerário');
select tests.authenticate_as('provider_d');
select is(public.ride_guest_invite(pg_temp.g('gt')),null,'depois do aceite outra conta continua sem ler');
select tests.authenticate_as('client_a');
select ok(public.ride_revoke_guest_invite(pg_temp.u('g2')),'a central revoga o segundo convite');
select tests.authenticate_as('provider_b');
select is(public.ride_guest_invite(pg_temp.g('gt2'))->>'status','revoked','o convidado lê que o convite foi revogado');
select is(public.ride_guest_invite(pg_temp.g('gt2'))->'legs','[]'::jsonb,'e o itinerário deixa de ser mostrado');

-- ─── Minimização e permissões ──────────────────────────────────────────────────────────────
select tests.authenticate_as('admin');
select ok(public.admin_ride_party_queue()::text !~ '@|"(origin|destination|lat|lng|points|route|email|phone|guardian[a-z_]*|legal_basis|evidence_ref|driver_id|owner_id|member_id)"',
 'a fila não leva lugar, e-mail, telefone nem identificador de pessoa');
select tests.clear_authentication();
update private.ride_network set module_enabled=false where environment='simulation';
select tests.authenticate_as('provider_c');
select throws_ok($$select public.ride_my_cessions()$$,'P0001','ride_feature_disabled','com o módulo fechado o motorista não lê cessões');
select tests.authenticate_as('admin');
select lives_ok($$select public.admin_ride_party_queue()$$,'a operação continua lendo a fila com o módulo fechado');
select tests.clear_authentication();
create temp table added(name text primary key);
insert into added values('admin_ride_party_queue'),('admin_ride_organizations'),('ride_companion_invite'),('ride_guest_invite'),('ride_my_cessions');
select is((select count(*) from pg_proc p join added a on a.name=p.proname where p.pronamespace='public'::regnamespace and p.prosecdef
   and coalesce(p.proconfig,'{}') @> array['search_path=""'] and has_function_privilege('authenticated',p.oid,'execute')),5::bigint,
 'as cinco chamadas novas existem uma vez, são security definer com search_path vazio e pedem sessão');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join added a on a.name=p.proname where p.pronamespace='public'::regnamespace
   and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute')
     or exists(select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where x.grantee=0 and x.privilege_type='EXECUTE'))),
 null::text[],'nenhuma delas é executável por visitante, por PUBLIC ou pelo papel de serviço');
select ok(not has_function_privilege('authenticated','private.ride_invoice_open_months(uuid)','execute') and not has_function_privilege('anon','private.ride_invoice_open_months(uuid)','execute')
 and not has_function_privilege('service_role','private.ride_invoice_open_months(uuid)','execute'),'a função interna não é executável por papel da API');
select is((select count(*) from pg_indexes where schemaname='private' and indexname in ('ride_accounts_review','ride_dependents_pending','ride_invoice_disputes_open')),3::bigint,
 'os três índices da fila existem');
select ok((select count(*) from private.ride_party_rules where environment<>'simulation')=0,'produção segue sem nenhuma linha de habilitação');

select * from finish();
rollback;
