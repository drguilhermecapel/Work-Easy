-- PAR-507 (O17 etapa 5): fatura mensal por centro de custo, contestação por item e exportação,
-- sobre 20261127110505. Dados fictícios, sem rede. As competências são relativas ao mês corrente
-- de São Paulo: M = três meses atrás, M+1 = dois meses atrás, M+2 = mês passado. Os eventos da
-- etapa 4 nascem agora e o roteiro os reposiciona nesses meses, então nada depende do dia em que
-- o teste roda.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,v text not null);
grant select,insert on t to authenticated,anon;
create function pg_temp.g(p text) returns text language sql stable as $$select t.v from t where t.k=p$$;
create function pg_temp.u(p text) returns uuid language sql stable as $$select t.v::uuid from t where t.k=p$$;
create function pg_temp.n(p text) returns int language sql stable as $$select t.v::int from t where t.k=p$$;
create function pg_temp.d(p text) returns date language sql stable as $$select t.v::date from t where t.k=p$$;
create function pg_temp.trip() returns jsonb language sql immutable as $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
grant execute on function pg_temp.g(text),pg_temp.u(text),pg_temp.n(text),pg_temp.d(text),pg_temp.trip() to authenticated,anon;
-- Atalhos do roteiro, executados como dono do teste.
-- Meio-dia (São Paulo) de um dia da competência guardada em t.
create function pg_temp.noon(p_month text,p_day int) returns timestamptz language sql stable as $$
 select ((pg_temp.d(p_month)+(p_day-1))::timestamp+interval '12 hours') at time zone 'America/Sao_Paulo'$$;
create function pg_temp.save_program(p_key text,p_account text,p_label text,p_budget int,p_value int,p_excess text) returns void language plpgsql as $$
begin
 insert into t values(p_key,gen_random_uuid()::text);
 perform tests.authenticate_as('admin');
 perform public.admin_save_ride_voucher_program(pg_temp.u(p_key),pg_temp.u(p_account),p_label,p_budget,p_value,null,null,null,null,
   now()-interval '1 hour',now()+interval '10 days',p_excess,false,'ficticio-o17-e5 verba','ficticio-o17-e5 contrato',true);
 perform tests.clear_authentication();
end $$;
-- Viagem pelo perfil profissional: cotação, aceite, conclusão e uso do voucher (quando há forma de pagamento).
create function pg_temp.work_trip(p_key text,p_user text,p_program text,p_cc text,p_method text,p_legs jsonb default null) returns void language plpgsql as $$
declare v jsonb; leg uuid;
begin
 perform tests.authenticate_as(p_user);
 v:=public.ride_quote_funded(gen_random_uuid(),null,coalesce(p_legs,pg_temp.trip()),pg_temp.u(p_program),pg_temp.u(p_cc));
 perform public.ride_consent((v->>'id')::uuid,true);
 perform tests.clear_authentication();
 select l.id into strict leg from public.ride_legs l where l.source_quote_id=(v->>'id')::uuid;
 insert into t values('l_'||p_key,leg::text);
 if p_method is null then return; end if;
 update public.ride_legs set driver_id=tests.uid('provider_c'),status='completed' where id=leg;
 perform tests.authenticate_as(p_user);
 insert into t select 'o_'||p_key,public.ride_redeem_voucher(leg,p_method)->>'order_id';
 perform tests.clear_authentication();
end $$;
-- O instante em que o dinheiro se moveu, para simular competências passadas.
create function pg_temp.move(p_order text,p_action text,p_at timestamptz) returns void language sql as $$
 update private.ride_order_events set at=p_at where order_id=pg_temp.u(p_order) and action=p_action$$;
create function pg_temp.frozen(p_invoice text) returns text language sql stable as $$
 select (select to_jsonb(i)::text from private.ride_invoices i where i.id=pg_temp.u(p_invoice))
   ||(select jsonb_agg(to_jsonb(l) order by l.id)::text from private.ride_invoice_lines l where l.invoice_id=pg_temp.u(p_invoice))$$;
-- O livro da etapa 4 para as mesmas operações das linhas cobradas de uma fatura.
create function pg_temp.ledger(p_invoice text) returns bigint language sql stable as $$
 select sum(fe.benefit_delta) from private.ride_invoice_lines l join private.ride_order_events ev on ev.id=l.event_id
 join private.ride_financial_events fe on fe.leg_id=l.leg_id and fe.operation_id=ev.operation_id and fe.benefit_delta<>0
 where l.invoice_id=pg_temp.u(p_invoice) and l.billable$$;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_c'),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true);
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity,card_brands,acquirer_profile_ref)
 select 'simulation','Saúde','Jabaquara',m,'ensaio 205c2',tstzrange(now()-interval '1 day',now()+interval '1 day'),
  case when m='card' then array['VISA'] else '{}'::text[] end,case when m='card' then 'conta hospedada TESTE' end from unnest(array['card','pix','benefit']) m;
insert into t select 'c',private.ride_month(now())::text;
insert into t select 'm',(pg_temp.d('c')-interval '3 months')::date::text;
insert into t select 'n',(pg_temp.d('c')-interval '2 months')::date::text;
insert into t select 'l',(pg_temp.d('c')-interval '1 month')::date::text;
insert into t select 'p',(pg_temp.d('c')-interval '4 months')::date::text;

-- Tarifa de referência do trecho, lida de uma cotação comum.
select tests.authenticate_as('provider_c');
insert into t select 'x',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'total_cents';
select tests.clear_authentication();
select ok(pg_temp.n('x')>1000,'a tarifa do ensaio permite voucher parcial e estorno parcial');
insert into t select 'part',(pg_temp.n('x')-500)::text;
insert into t select 'name_b',full_name from public.profiles where id=tests.uid('client_b');

-- Duas empresas conferidas pela operação; A tem dois centros de custo, um gestor e duas pessoas que viajam.
select tests.authenticate_as('client_a');
insert into t select 'org',public.ride_create_organization('Empresa de ensaio A',gen_random_uuid())::text;
insert into t select 'family',public.ride_create_family('Família de ensaio',10000,'pix',gen_random_uuid())::text;
select tests.authenticate_as('provider_d');
insert into t select 'org_b',public.ride_create_organization('Empresa de ensaio B',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select ok(public.admin_verify_ride_account(pg_temp.u('org'),'ficticio-o17-e5 contrato A',now()+interval '30 days'),'a operação confere a empresa A');
select ok(public.admin_verify_ride_account(pg_temp.u('org_b'),'ficticio-o17-e5 contrato B',now()+interval '30 days'),'a operação confere a empresa B');
select tests.authenticate_as('client_a');
insert into t select 'cc1',public.ride_save_cost_center(pg_temp.u('org'),'VENDAS','Vendas',true)::text;
insert into t select 'cc2',public.ride_save_cost_center(pg_temp.u('org'),'VISITAS','Visitas técnicas',true)::text;
insert into t select 'inv_b',public.ride_invite_member(pg_temp.u('org'),'client_b@test.local','member',60,gen_random_uuid())->>'token';
insert into t select 'inv_pb',public.ride_invite_member(pg_temp.u('org'),'provider_b@test.local','member',60,gen_random_uuid())->>'token';
insert into t select 'inv_pa',public.ride_invite_member(pg_temp.u('org'),'provider_a@test.local','manager',60,gen_random_uuid())->>'token';
select tests.authenticate_as('client_b');
select is(public.ride_join_account(pg_temp.g('inv_b'),true),'accepted','colaboradora entra na empresa A');
select tests.authenticate_as('provider_b');
select is(public.ride_join_account(pg_temp.g('inv_pb'),true),'accepted','colaborador entra na empresa A');
select tests.authenticate_as('provider_a');
select is(public.ride_join_account(pg_temp.g('inv_pa'),true),'accepted','gestor entra na empresa A');
select tests.authenticate_as('provider_d');
insert into t select 'inv_e',public.ride_invite_member(pg_temp.u('org_b'),'provider_e@test.local','manager',60,gen_random_uuid())->>'token';
select tests.authenticate_as('provider_e');
select is(public.ride_join_account(pg_temp.g('inv_e'),true),'accepted','gestor entra na empresa B');
select tests.clear_authentication();
select pg_temp.save_program('p_main','org','Viagens a trabalho',pg_temp.n('x')*20,pg_temp.n('x')*2,'none');
select pg_temp.save_program('p_part','org','Voucher parcial',pg_temp.n('x')*20,pg_temp.n('part'),'rider');

-- Viagens. 1: voucher inteiro, com estorno parcial depois. 2a/2b: viagem remarcada. 3: voucher parcial com
-- complemento de quem viajou. 4 e 6: competência seguinte. 5: mês corrente. E uma corrida pessoal.
select pg_temp.work_trip('1','client_b','p_main','cc1','pix');
select pg_temp.work_trip('2a','client_b','p_main','cc1',null);
select tests.authenticate_as('client_b');
select lives_ok($$select public.ride_transition(pg_temp.u('l_2a'),'cancelled',gen_random_uuid())$$,'quem viaja cancela o trecho para remarcar');
select tests.clear_authentication();
select pg_temp.work_trip('2b','client_b','p_main','cc1','pix',jsonb_build_array(pg_temp.trip()->0||jsonb_build_object('replaces',pg_temp.g('l_2a'))));
select is((select replaces_id from public.ride_legs where id=pg_temp.u('l_2b')),pg_temp.u('l_2a'),'o trecho remarcado substitui o cancelado na mesma viagem');
select is((select count(*) from private.ride_voucher_grants where leg_id in (pg_temp.u('l_2a'),pg_temp.u('l_2b'))),2::bigint,'o trecho cancelado e o remarcado têm cada um a sua reserva');
select pg_temp.work_trip('3','provider_b','p_part','cc2','card');
select pg_temp.work_trip('4','client_b','p_main','cc1','pix');
select pg_temp.work_trip('6','provider_b','p_main','cc2','pix');
select pg_temp.work_trip('5','client_b','p_main','cc1','pix');
select tests.authenticate_as('client_b');
insert into t select 'r_personal',public.ride_consent((public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id')::uuid,true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'l_personal',id::text from public.ride_legs where ride_id=pg_temp.u('r_personal');
update public.ride_legs set driver_id=tests.uid('provider_c'),status='completed' where id=pg_temp.u('l_personal');
select tests.authenticate_as('client_b');
insert into t select 'o_personal',public.ride_open_payment_order(pg_temp.u('l_personal'),'pix')::text;
insert into t select 'case',public.ride_request_order_review(pg_temp.u('o_1'),400,'Parte do trajeto não foi feita',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.u('case'),true,'Conferido no ensaio'),'approved','a operação aprova o estorno parcial da viagem 1');
select is(public.ride_refund_order_source(pg_temp.u('case'),'benefit',0,'ENSAIO-205C2'),'settled','o estorno volta à verba da empresa');
select tests.clear_authentication();

-- Competências: M recebe as viagens 1, 2b e 3 (a 2b no último segundo do mês em São Paulo, que já é o mês
-- seguinte em UTC); M+1 recebe as viagens 4 (no primeiro instante do mês) e 6 e o estorno da viagem 1.
select pg_temp.move('o_1','benefit',pg_temp.noon('m',5));
select pg_temp.move('o_2b','benefit',(pg_temp.d('n')::timestamp at time zone 'America/Sao_Paulo')-interval '1 second');
select pg_temp.move('o_3','benefit',pg_temp.noon('m',12));
insert into private.ride_order_events(order_id,action,operation_id,data,at)
 values(pg_temp.u('o_3'),'capture',gen_random_uuid(),jsonb_build_object('cents',500,'processing',0),pg_temp.noon('m',12)+interval '1 hour');
select pg_temp.move('o_4','benefit',pg_temp.d('n')::timestamp at time zone 'America/Sao_Paulo');
select pg_temp.move('o_6','benefit',pg_temp.noon('n',9));
select pg_temp.move('o_1','benefit_refund',pg_temp.noon('n',7));
select is((select count(*) from private.ride_invoice_movements(pg_temp.u('org')) where month=pg_temp.d('m')),4::bigint,'M tem três vouchers e um complemento pessoal a faturar');
select is((select count(*) from private.ride_invoice_movements(pg_temp.u('org')) where month=pg_temp.d('n')),3::bigint,'M+1 tem dois vouchers e um estorno a faturar');
select is((select count(*) from private.ride_invoice_movements(pg_temp.u('org')) where month=pg_temp.d('c')),1::bigint,'o mês corrente tem um voucher ainda sem fatura');

-- Quem fecha: só a operação financeira, com o portão ligado, e só competência encerrada, em ordem.
insert into t values('k_m',gen_random_uuid()::text),('k_n',gen_random_uuid()::text),('k_b',gen_random_uuid()::text);
select tests.authenticate_anon();
select throws_ok($$select public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('m'),gen_random_uuid())$$,'42501',null,'visitante sem sessão não fecha fatura');
select throws_ok($$select public.ride_invoice(gen_random_uuid())$$,'42501',null,'visitante sem sessão não lê fatura');
select throws_ok($$select public.ride_invoice_export(gen_random_uuid())$$,'42501',null,'visitante sem sessão não exporta fatura');
select throws_ok($$select public.ride_dispute_invoice_line(gen_random_uuid(),'Motivo',gen_random_uuid())$$,'42501',null,'visitante sem sessão não contesta');
select throws_ok($$select public.admin_decide_invoice_dispute(gen_random_uuid(),true,'Motivo')$$,'42501',null,'visitante sem sessão não decide contestação');
select tests.authenticate_as('client_a');
select throws_ok($$select public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('m'),gen_random_uuid())$$,'P0001','not_allowed','a própria empresa não fecha a sua fatura');
select throws_ok($$select private.ride_invoice_movements(pg_temp.u('org'))$$,'42501',null,'rotina privada não é chamada pelo cliente');
select throws_ok($$select * from private.ride_invoices$$,'42501',null,'as faturas não são lidas direto pelo cliente');
select throws_ok($$select * from private.ride_invoice_lines$$,'42501',null,'as linhas não são lidas direto pelo cliente');
select throws_ok($$select * from private.ride_invoice_disputes$$,'42501',null,'as contestações não são lidas direto pelo cliente');
select is(public.ride_org_report(pg_temp.u('org'),pg_temp.d('m'))->'invoice','null'::jsonb,'antes do fechamento o relatório não tem fatura');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('c'),gen_random_uuid())$$,'P0001','invalid_input','o mês corrente ainda não pode ser fechado');
select throws_ok($$select public.admin_close_ride_invoice(pg_temp.u('org'),(pg_temp.d('c')+interval '1 month')::date,gen_random_uuid())$$,'P0001','invalid_input','mês futuro não é fechado');
select throws_ok($$select public.admin_close_ride_invoice(pg_temp.u('org'),null,gen_random_uuid())$$,'P0001','invalid_input','competência é obrigatória');
select throws_ok($$select public.admin_close_ride_invoice(pg_temp.u('family'),pg_temp.d('m'),gen_random_uuid())$$,'P0001','invalid_input','conta de família não tem fatura');
select throws_ok($$select public.admin_close_ride_invoice(gen_random_uuid(),pg_temp.d('m'),gen_random_uuid())$$,'P0001','invalid_input','conta desconhecida é recusada');
select throws_ok($$select public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('n'),gen_random_uuid())$$,'P0001','ride_financial_state','M+1 não fecha antes de M, que tem movimento sem fatura');
select tests.clear_authentication();
update private.ride_party_rules set enabled=false where environment='simulation' and capability='invoice';
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('m'),gen_random_uuid())$$,'P0001','ride_feature_disabled','com o portão de fatura fechado nada é faturado');
select tests.clear_authentication();
update private.ride_party_rules set enabled=true where environment='simulation' and capability='invoice';
select is((select count(*) from private.ride_invoices),0::bigint,'nenhuma recusa deixa fatura criada');
select is((select count(*) from private.ride_party_rules where environment='live'),0::bigint,'produção não tem regra que habilite fatura');

-- B9.4 · Fechar duas vezes dá uma única fatura, com as mesmas linhas.
select tests.authenticate_as('admin');
select is(public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('m'),pg_temp.u('k_m')),pg_temp.u('k_m'),'a operação financeira fecha a competência M');
select tests.clear_authentication();
insert into t select 'count_m',count(*)::text from private.ride_invoice_lines where invoice_id=pg_temp.u('k_m');
select tests.authenticate_as('admin');
select is(public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('m'),pg_temp.u('k_m')),pg_temp.u('k_m'),'repetir o fechamento devolve a mesma fatura');
select is(public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('m')+14,gen_random_uuid()),pg_temp.u('k_m'),'outra chave e outro dia do mesmo mês devolvem a mesma fatura');
select throws_ok($$select public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('n'),pg_temp.u('k_m'))$$,'P0001','idempotency_conflict','a mesma chave para outra competência é conflito');
select is(public.admin_close_ride_invoice(pg_temp.u('org_b'),pg_temp.d('m'),pg_temp.u('k_b')),pg_temp.u('k_b'),'a empresa B, sem movimento, fecha M com fatura vazia');
select tests.clear_authentication();
select is((select count(*) from private.ride_invoices where account_id=pg_temp.u('org')),1::bigint,'fechar duas vezes gera uma única fatura');
select is((select count(*)::text from private.ride_invoice_lines where invoice_id=pg_temp.u('k_m')),pg_temp.g('count_m'),'fechar duas vezes mantém a mesma quantidade de linhas');
select is(pg_temp.n('count_m'),4,'a fatura de M tem três vouchers e um complemento informativo');
select results_eq($$select status,month,closed_by,environment from private.ride_invoices where id=pg_temp.u('k_m')$$,
 $$select 'closed',pg_temp.d('m'),tests.uid('admin'),'simulation'$$,'a fatura nasce fechada, na competência pedida, por quem fechou');
select is((select count(*) from public.audit_log where action='ride.invoice_close' and entity_id in (pg_temp.g('k_m'),pg_temp.g('k_b'))),2::bigint,'cada fechamento fica na auditoria uma vez');
select is((select count(*) from private.ride_invoices where environment='live'),0::bigint,'produção não recebe fatura');

-- B9.1 · Viagem remarcada em M: o trecho cancelado não gera linha e o substituto gera uma linha de voucher.
select is((select count(*) from private.ride_invoice_lines where leg_id=pg_temp.u('l_2a')),0::bigint,'o trecho cancelado da viagem remarcada não gera linha');
select results_eq($$select invoice_id,kind,billable,cents,cost_center_id,member_id from private.ride_invoice_lines where leg_id=pg_temp.u('l_2b')$$,
 $$select pg_temp.u('k_m'),'voucher',true,pg_temp.n('x'),pg_temp.u('cc1'),tests.uid('client_b')$$,'o trecho substituto gera exatamente uma linha de voucher em M');
select is((select private.sp_date(occurred_at) from private.ride_invoice_lines where leg_id=pg_temp.u('l_2b')),(pg_temp.d('n')-1),
 'o último segundo do mês em São Paulo pertence a M, mesmo já sendo o mês seguinte em UTC');
select is((select count(*) from private.ride_invoice_lines where leg_id in (pg_temp.u('l_4'),pg_temp.u('l_6'),pg_temp.u('l_5'))),0::bigint,
 'movimento de M+1 e do mês corrente não entra na fatura de M');
select is((select count(*) from private.ride_invoice_lines where leg_id=pg_temp.u('l_personal') or order_id=pg_temp.u('o_personal')),0::bigint,'a corrida pessoal não entra na fatura');
select results_eq($$select kind,billable,cents from private.ride_invoice_lines where order_id=pg_temp.u('o_3') order by kind$$,
 $$values ('personal_topup',false,500),('voucher',true,pg_temp.n('part'))$$,'o complemento de quem viajou aparece como linha informativa, fora da cobrança');

-- B9.3 · Total da fatura = soma das linhas cobradas = relatório por centro de custo = livro da etapa 4.
select tests.authenticate_as('provider_a');
insert into t select 'rep_m',public.ride_org_report(pg_temp.u('org'),pg_temp.d('m'))::text;
insert into t select 'inv_m',public.ride_invoice(pg_temp.u('k_m'))::text;
insert into t select 'exp_m',public.ride_invoice_export(pg_temp.u('k_m'))::text;
select is(public.ride_org_report(pg_temp.u('org'),pg_temp.d('c'))->'invoice','null'::jsonb,'o relatório do mês corrente segue sem fatura');
select tests.clear_authentication();
select is((select total_cents from private.ride_invoices where id=pg_temp.u('k_m')),(pg_temp.n('x')*2+pg_temp.n('part'))::bigint,'o total de M é a soma dos três vouchers usados');
select is((select sum(cents) from private.ride_invoice_lines where invoice_id=pg_temp.u('k_m') and billable),(select total_cents from private.ride_invoices where id=pg_temp.u('k_m')),
 'o total da fatura é a soma das linhas cobradas');
select is((select sum((c->>'net_cents')::bigint) from jsonb_array_elements(pg_temp.g('rep_m')::jsonb->'by_cost_center') c)::bigint,
 (select total_cents from private.ride_invoices where id=pg_temp.u('k_m')),'o relatório de M por centro de custo soma o total da fatura');
select is(pg_temp.ledger('k_m'),(select total_cents from private.ride_invoices where id=pg_temp.u('k_m')),'o livro da etapa 4 soma o mesmo total para as mesmas operações');
select results_eq($$select c->>'cost_center',(c->>'billable_cents')::bigint from jsonb_array_elements(pg_temp.g('inv_m')::jsonb->'by_cost_center') c order by 1$$,
 $$select c->>'cost_center',(c->>'net_cents')::bigint from jsonb_array_elements(pg_temp.g('rep_m')::jsonb->'by_cost_center') c order by 1$$,
 'fatura e relatório coincidem centro de custo a centro de custo');
select results_eq($$select c->>'cost_center',(c->>'billable_cents')::int from jsonb_array_elements(pg_temp.g('inv_m')::jsonb->'by_cost_center') c order by 1$$,
 $$values ('VENDAS',pg_temp.n('x')*2),('VISITAS',pg_temp.n('part'))$$,'cada centro de custo recebe os vouchers das suas viagens');
select is(pg_temp.g('rep_m')::jsonb->'invoice',(select jsonb_build_object('id',i.id,'status','closed','total_cents',i.total_cents,'closed_at',i.closed_at)
  from private.ride_invoices i where i.id=pg_temp.u('k_m')),'o relatório de M passa a trazer a fatura fechada');
select is((pg_temp.g('inv_m')::jsonb->>'total_cents')::bigint,(pg_temp.n('x')*2+pg_temp.n('part'))::bigint,'o gestor lê o total da fatura');
select is(jsonb_array_length(pg_temp.g('inv_m')::jsonb->'lines'),4,'o gestor lê a composição da fatura');
select is((select count(*) from jsonb_array_elements(pg_temp.g('inv_m')::jsonb->'lines') l where l ?& array['id','kind','billable','cost_center','member','cents','occurred_at','dispute']),
 4::bigint,'cada linha traz tipo, centro de custo, pessoa, valor, data e contestação');
select is((select count(*) from jsonb_array_elements(pg_temp.g('inv_m')::jsonb->'lines') l where l->>'kind'='voucher' and l->>'cost_center'='VENDAS'
  and l->>'member'=pg_temp.g('name_b') and (l->>'cents')::int=pg_temp.n('x') and l->'dispute'='null'::jsonb),2::bigint,'as linhas de voucher trazem centro de custo e pessoa');
select is((pg_temp.g('exp_m')::jsonb#>>'{totals,billable_cents}')::bigint,(pg_temp.n('x')*2+pg_temp.n('part'))::bigint,'a exportação traz o total cobrado');
select is((pg_temp.g('exp_m')::jsonb#>>'{totals,personal_topup_cents}')::int,500,'a exportação separa o complemento pessoal do total cobrado');
select is(pg_temp.g('exp_m')::jsonb#>>'{account,name}','Empresa de ensaio A','a exportação identifica a empresa');
select is(jsonb_array_length(pg_temp.g('exp_m')::jsonb->'lines'),4,'a exportação traz a composição inteira');

-- B9.5 · A exportação não traz localização: nem chaves de lugar, nem praça, nem ponto.
select is((select count(*) from jsonb_path_query(pg_temp.g('exp_m')::jsonb,'$.** ? (@.type() == "object").keyvalue().key') k
  where k#>>'{}' in ('origin','destination','lat','lng','points')),0::bigint,'a exportação não tem as chaves origin, destination, lat, lng ou points');
select ok(pg_temp.g('exp_m') !~* 'Saúde|Jabaquara|"origin|"destination|"lat|"lng|"points|route|address|pickup',
 'a exportação não traz praça, trajeto, endereço nem ponto de embarque');
select ok(pg_temp.g('inv_m') !~* 'Saúde|Jabaquara|"origin|"destination|"lat|"lng|"points|route|address|pickup','a composição lida pelo gestor também não traz localização');
select ok(pg_temp.g('exp_m')||pg_temp.g('inv_m') !~ '@','nem a fatura nem a exportação trazem e-mail');

-- B9.7 · Linha de fatura fechada é imutável; a fatura fechada também.
select throws_ok($$update private.ride_invoice_lines set cents=cents-1 where invoice_id=pg_temp.u('k_m')$$,'P0001','ride_invoice_closed','atualizar linha de fatura fechada é recusado');
select throws_ok($$delete from private.ride_invoice_lines where invoice_id=pg_temp.u('k_m')$$,'P0001','ride_invoice_closed','apagar linha de fatura fechada é recusado');
select throws_ok($$insert into private.ride_invoice_lines(invoice_id,kind,billable,leg_id,order_id,member_id,cents,occurred_at,event_id)
  select pg_temp.u('k_m'),'voucher',true,pg_temp.u('l_5'),pg_temp.u('o_5'),tests.uid('client_b'),1,now(),e.id from private.ride_order_events e
  where e.order_id=pg_temp.u('o_5') and e.action='benefit'$$,'P0001','ride_invoice_closed','fatura fechada não recebe linha tardia');
select throws_ok($$update private.ride_invoice_lines set invoice_id=pg_temp.u('k_b') where invoice_id=pg_temp.u('k_m')$$,'P0001','ride_invoice_closed','linha não muda de fatura');
select throws_ok($$update private.ride_invoices set total_cents=0 where id=pg_temp.u('k_m')$$,'P0001','ride_invoice_closed','o total de uma fatura fechada não é alterado');
select throws_ok($$delete from private.ride_invoices where id=pg_temp.u('k_b')$$,'P0001','ride_invoice_closed','fatura fechada não é apagada');
select throws_ok($$truncate private.ride_invoice_lines cascade$$,'P0001','ride_invoice_closed','as linhas não são esvaziadas em bloco');
select is(pg_temp.g('count_m')::bigint,(select count(*) from private.ride_invoice_lines where invoice_id=pg_temp.u('k_m')),'as tentativas não mudaram a fatura');

-- B9.8 · Gestor de outra empresa é recusado; colaboradora sem papel e a operação também não leem por aqui.
insert into t select 'line_1',id::text from private.ride_invoice_lines where invoice_id=pg_temp.u('k_m') and leg_id=pg_temp.u('l_1');
insert into t select 'line_2b',id::text from private.ride_invoice_lines where invoice_id=pg_temp.u('k_m') and leg_id=pg_temp.u('l_2b');
insert into t select 'line_3',id::text from private.ride_invoice_lines where invoice_id=pg_temp.u('k_m') and leg_id=pg_temp.u('l_3') and kind='voucher';
insert into t select 'line_top',id::text from private.ride_invoice_lines where invoice_id=pg_temp.u('k_m') and kind='personal_topup';
select tests.authenticate_as('provider_e');
select throws_ok($$select public.ride_invoice(pg_temp.u('k_m'))$$,'P0001','ride_account_role_required','gestor de B não lê a fatura de A');
select throws_ok($$select public.ride_invoice_export(pg_temp.u('k_m'))$$,'P0001','ride_account_role_required','gestor de B não exporta a fatura de A');
select throws_ok($$select public.ride_dispute_invoice_line(pg_temp.u('line_1'),'Contestação alheia',gen_random_uuid())$$,'P0001','ride_account_role_required','gestor de B não contesta linha de A');
select throws_ok($$select public.ride_org_report(pg_temp.u('org'),pg_temp.d('m'))$$,'P0001','ride_account_role_required','gestor de B não lê o relatório de A');
select throws_ok($$select public.ride_invoice(gen_random_uuid())$$,'P0001','ride_account_role_required','fatura inexistente responde como a de outra empresa');
select throws_ok($$select public.ride_dispute_invoice_line(gen_random_uuid(),'Linha inexistente',gen_random_uuid())$$,'P0001','ride_account_role_required','linha inexistente responde como a de outra empresa');
select is(jsonb_array_length(public.ride_invoice(pg_temp.u('k_b'))->'lines'),0,'o gestor de B lê a fatura de B, sem linhas de A');
select is((public.ride_invoice(pg_temp.u('k_b'))->>'total_cents')::int,0,'a fatura vazia de B fecha em zero');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_invoice(pg_temp.u('k_b'))$$,'P0001','ride_account_role_required','gestor de A não lê a fatura de B');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_invoice(pg_temp.u('k_m'))$$,'P0001','ride_account_role_required','colaboradora sem papel de gestão não lê a fatura');
select throws_ok($$select public.ride_invoice_export(pg_temp.u('k_m'))$$,'P0001','ride_account_role_required','colaboradora sem papel de gestão não exporta a fatura');
select throws_ok($$select public.ride_dispute_invoice_line(pg_temp.u('line_1'),'Sem papel',gen_random_uuid())$$,'P0001','ride_account_role_required','colaboradora sem papel de gestão não contesta');
select tests.authenticate_as('admin');
select throws_ok($$select public.ride_invoice(pg_temp.u('k_m'))$$,'P0001','ride_account_role_required','a leitura da fatura é de quem gere a empresa');

-- B9.6 · Contestação por item: aceita vira ajuste no fechamento seguinte; a fatura contestada não muda.
insert into t values('d1',gen_random_uuid()::text),('d3',gen_random_uuid()::text);
select tests.authenticate_as('provider_a');
select is(public.ride_dispute_invoice_line(pg_temp.u('line_1'),' Viagem interrompida antes do destino ',pg_temp.u('d1')),pg_temp.u('d1'),'o gestor contesta uma linha de voucher');
select is(public.ride_dispute_invoice_line(pg_temp.u('line_1'),'Viagem interrompida antes do destino',pg_temp.u('d1')),pg_temp.u('d1'),'repetir a contestação devolve a mesma');
select throws_ok($$select public.ride_dispute_invoice_line(pg_temp.u('line_1'),'Outro motivo',pg_temp.u('d1'))$$,'P0001','idempotency_conflict','mesma chave com outro motivo é conflito');
select throws_ok($$select public.ride_dispute_invoice_line(pg_temp.u('line_2b'),'Viagem interrompida antes do destino',pg_temp.u('d1'))$$,'P0001','idempotency_conflict','mesma chave para outra linha é conflito');
select throws_ok($$select public.ride_dispute_invoice_line(pg_temp.u('line_1'),'Segunda contestação',gen_random_uuid())$$,'P0001','ride_operation_conflict','uma linha recebe uma única contestação');
select throws_ok($$select public.ride_dispute_invoice_line(pg_temp.u('line_top'),'Complemento',gen_random_uuid())$$,'P0001','invalid_input','linha informativa não é contestada');
select throws_ok($$select public.ride_dispute_invoice_line(pg_temp.u('line_2b'),'   ',gen_random_uuid())$$,'P0001','invalid_input','contestação sem motivo é recusada');
select throws_ok($$select public.ride_dispute_invoice_line(pg_temp.u('line_2b'),repeat('a',281),gen_random_uuid())$$,'P0001','invalid_input','motivo acima de 280 caracteres é recusado');
select is((select l#>>'{dispute,status}' from jsonb_array_elements(public.ride_invoice(pg_temp.u('k_m'))->'lines') l where l->>'id'=pg_temp.g('line_1')),'open','o gestor vê a contestação em análise');
select tests.authenticate_as('client_a');
select is(public.ride_dispute_invoice_line(pg_temp.u('line_3'),'Valor acima do combinado',pg_temp.u('d3')),pg_temp.u('d3'),'a administradora da empresa também contesta');
select is(public.ride_dispute_invoice_line(pg_temp.u('line_3'),'Valor acima do combinado',pg_temp.u('d3')),pg_temp.u('d3'),'repetir a contestação da administradora devolve a mesma');
select throws_ok($$select public.admin_decide_invoice_dispute(pg_temp.u('d1'),true,'Decisão da própria empresa')$$,'P0001','not_allowed','a empresa não decide a própria contestação');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_dispute_invoice_line(pg_temp.u('line_3'),'Valor acima do combinado',pg_temp.u('d3'))$$,'P0001','idempotency_conflict','a chave de outra pessoa não é reaproveitada');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_decide_invoice_dispute(gen_random_uuid(),true,'Motivo')$$,'P0001','invalid_input','contestação desconhecida é recusada');
select throws_ok($$select public.admin_decide_invoice_dispute(pg_temp.u('d1'),true,'  ')$$,'P0001','invalid_input','decisão sem justificativa é recusada');
select is(public.admin_decide_invoice_dispute(pg_temp.u('d1'),true,'Crédito concedido no ensaio'),'accepted','a operação financeira aceita a contestação');
select is(public.admin_decide_invoice_dispute(pg_temp.u('d1'),true,'Crédito concedido no ensaio'),'accepted','repetir a decisão devolve o mesmo resultado');
select throws_ok($$select public.admin_decide_invoice_dispute(pg_temp.u('d1'),false,'Crédito concedido no ensaio')$$,'P0001','ride_operation_conflict','decisão tomada não é trocada');
select is(public.admin_decide_invoice_dispute(pg_temp.u('d3'),false,'Cobrança mantida no ensaio'),'rejected','a operação financeira recusa a outra contestação');
select tests.clear_authentication();
select results_eq($$select status,credit_cents,decided_by,raised_by,reason from private.ride_invoice_disputes where id=pg_temp.u('d1')$$,
 $$select 'accepted',pg_temp.n('x')-400,tests.uid('admin'),tests.uid('provider_a'),'Viagem interrompida antes do destino'$$,
 'o crédito aceito é a linha menos o que o estorno já devolveu, decidido por quem não é da empresa');
select is((select count(*) from public.audit_log where action='ride.invoice_dispute'),2::bigint,'cada decisão fica na auditoria uma vez');
select is((select count(*)::text from private.ride_invoice_lines where invoice_id=pg_temp.u('k_m')),pg_temp.g('count_m'),'a decisão não mexe na fatura contestada');
select is((select count(*) from private.ride_invoice_lines where kind='adjustment'),0::bigint,'o crédito aceito espera o fechamento seguinte');

-- B9.2 · Estorno liquidado em M+1: linha negativa só em M+1; as linhas de M ficam idênticas depois do fechamento de M+1.
insert into t select 'frozen_m',pg_temp.frozen('k_m');
select tests.authenticate_as('admin');
select is(public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('n'),pg_temp.u('k_n')),pg_temp.u('k_n'),'a operação financeira fecha a competência M+1');
select is(public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('n'),gen_random_uuid()),pg_temp.u('k_n'),'repetir o fechamento de M+1 devolve a mesma fatura');
select tests.clear_authentication();
select is(pg_temp.frozen('k_m'),pg_temp.g('frozen_m'),'a fatura de M e as suas linhas ficam byte a byte iguais depois do fechamento de M+1');
select results_eq($$select invoice_id,kind,billable,cents,leg_id,cost_center_id from private.ride_invoice_lines where order_id=pg_temp.u('o_1') and kind='refund'$$,
 $$select pg_temp.u('k_n'),'refund',true,-400,pg_temp.u('l_1'),pg_temp.u('cc1')$$,'o estorno liquidado em M+1 é uma linha negativa da fatura de M+1');
select is((select count(*) from private.ride_invoice_lines where invoice_id=pg_temp.u('k_m') and cents<0),0::bigint,'a fatura de M não recebe linha negativa');
select is((select count(*) from private.ride_invoice_lines where kind='refund'),1::bigint,'o estorno aparece uma única vez, só em M+1');
select results_eq($$select kind,cents from private.ride_invoice_lines where invoice_id=pg_temp.u('k_n') order by kind,cents$$,
 $$values ('adjustment',400-pg_temp.n('x')),('refund',-400),('voucher',pg_temp.n('x')),('voucher',pg_temp.n('x'))$$,
 'M+1 tem os dois vouchers do mês, o estorno e o ajuste da contestação aceita');
select results_eq($$select dispute_id,leg_id,order_id,cost_center_id,member_id,billable,event_id from private.ride_invoice_lines where invoice_id=pg_temp.u('k_n') and kind='adjustment'$$,
 $$select pg_temp.u('d1'),pg_temp.u('l_1'),pg_temp.u('o_1'),pg_temp.u('cc1'),tests.uid('client_b'),true,null::bigint$$,
 'a contestação aceita vira um ajuste de crédito no fechamento seguinte, no mesmo centro de custo');
select is((select count(*) from private.ride_invoice_lines where dispute_id=pg_temp.u('d3')),0::bigint,'a contestação recusada não gera ajuste');
select is((select count(*) from private.ride_invoice_lines where dispute_id=pg_temp.u('d1')),1::bigint,'repetir o fechamento não duplica o ajuste');
select is((select count(*) from private.ride_invoice_lines where leg_id=pg_temp.u('l_5')),0::bigint,'o voucher do mês corrente espera a sua competência');
select is((select private.sp_date(occurred_at) from private.ride_invoice_lines where leg_id=pg_temp.u('l_4')),pg_temp.d('n'),'o primeiro instante do mês em São Paulo pertence a M+1');
select is((select count(*) from (select event_id from private.ride_invoice_lines where event_id is not null group by event_id having count(*)>1) x),0::bigint,'nenhum evento da etapa 4 é faturado duas vezes');
select is((select total_cents from private.ride_invoices where id=pg_temp.u('k_n')),pg_temp.n('x')::bigint,'o total de M+1 = vouchers − estorno − ajuste');
select is((select sum(cents) from private.ride_invoice_lines where invoice_id=pg_temp.u('k_n') and billable),pg_temp.n('x')::bigint,'o total de M+1 é a soma das linhas cobradas');
select tests.authenticate_as('client_a');
insert into t select 'rep_n',public.ride_org_report(pg_temp.u('org'),pg_temp.d('n'))::text;
insert into t select 'inv_n',public.ride_invoice(pg_temp.u('k_n'))::text;
select is((select l#>>'{dispute,status}' from jsonb_array_elements(public.ride_invoice(pg_temp.u('k_m'))->'lines') l where l->>'id'=pg_temp.g('line_1')),'accepted','a linha contestada mostra a contestação aceita');
select is((select l#>>'{dispute,decision}' from jsonb_array_elements(public.ride_invoice(pg_temp.u('k_m'))->'lines') l where l->>'id'=pg_temp.g('line_3')),'Cobrança mantida no ensaio','a linha recusada mostra a justificativa');
select tests.clear_authentication();
select is((select sum((c->>'net_cents')::bigint) from jsonb_array_elements(pg_temp.g('rep_n')::jsonb->'by_cost_center') c)::bigint,(pg_temp.n('x')*2-400)::bigint,
 'o relatório de M+1 soma vouchers menos estorno');
select is((select sum(cents) from private.ride_invoice_lines where invoice_id=pg_temp.u('k_n') and kind in ('voucher','refund')),(pg_temp.n('x')*2-400)::bigint,
 'as linhas de dinheiro da fatura de M+1 somam o mesmo que o relatório');
select is(pg_temp.ledger('k_n'),(pg_temp.n('x')*2-400)::bigint,'o livro da etapa 4 soma o mesmo para as operações de M+1');
select is((select sum((c->>'billable_cents')::bigint) from jsonb_array_elements(pg_temp.g('inv_n')::jsonb->'by_cost_center') c)::bigint,pg_temp.n('x')::bigint,
 'a fatura de M+1 por centro de custo soma o seu total');
select is((select count(*) from jsonb_array_elements(pg_temp.g('inv_n')::jsonb->'lines') l where l->>'kind'='adjustment' and l->>'cost_center'='VENDAS' and (l->>'cents')::int<0),1::bigint,
 'o gestor lê o ajuste como crédito do centro de custo');
select results_eq($$select applied_cents,restored_cents,topup_cents from private.ride_invoice_marks where order_id in (pg_temp.u('o_1'),pg_temp.u('o_3')) order by topup_cents$$,
 $$values (pg_temp.n('x'),400,0),(pg_temp.n('part'),0,500)$$,'as marcas guardam o que já foi faturado de cada pedido');
select is((select count(*) from private.ride_invoice_marks k join private.ride_benefit_uses u on u.order_id=k.order_id
  where k.applied_cents>u.applied_cents or k.restored_cents>u.restored_cents),0::bigint,'o faturado nunca passa do que o benefício da etapa 4 registra');
select is((select count(*) from private.ride_invoice_marks where order_id=pg_temp.u('o_5')),0::bigint,'o pedido do mês corrente ainda não tem nada faturado');

-- Evento tardio: um estorno datado de M que só aparece depois de M fechada entra no fechamento seguinte,
-- com a data em que ocorreu; nada se perde e as faturas fechadas continuam intactas.
select tests.authenticate_as('provider_b');
insert into t select 'case6',public.ride_request_order_review(pg_temp.u('o_6'),100,'Cobrança a maior',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select is(public.ride_decide_order_review(pg_temp.u('case6'),true,'Conferido no ensaio'),'approved','a operação aprova o estorno parcial da viagem 6');
select is(public.ride_refund_order_source(pg_temp.u('case6'),'benefit',0,'ENSAIO-205C2-B'),'settled','o segundo estorno volta à verba da empresa');
select tests.clear_authentication();
select pg_temp.move('o_6','benefit_refund',pg_temp.noon('m',25));
insert into t select 'frozen_n',pg_temp.frozen('k_n');
insert into t values('k_l',gen_random_uuid()::text);
select tests.authenticate_as('admin');
select is(public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('l'),pg_temp.u('k_l')),pg_temp.u('k_l'),'M+2 fecha mesmo com um evento tardio de M, que já tem fatura');
select tests.clear_authentication();
select results_eq($$select invoice_id,kind,cents,private.ride_month(occurred_at) from private.ride_invoice_lines where order_id=pg_temp.u('o_6') and kind='refund'$$,
 $$select pg_temp.u('k_l'),'refund',-100,pg_temp.d('m')$$,'o evento tardio vira linha do fechamento seguinte, com a data em que ocorreu');
select is((select total_cents from private.ride_invoices where id=pg_temp.u('k_l')),-100::bigint,'uma competência só com crédito fecha negativa');
select is(pg_temp.frozen('k_m'),pg_temp.g('frozen_m'),'a fatura de M continua igual depois do evento tardio');
select is(pg_temp.frozen('k_n'),pg_temp.g('frozen_n'),'a fatura de M+1 continua igual depois do fechamento de M+2');
select is((select count(*) from private.ride_invoice_lines where leg_id=pg_temp.u('l_5')),0::bigint,'o voucher do mês corrente continua fora de qualquer fatura');
select is((select count(*) from private.ride_invoice_movements(pg_temp.u('org'))),1::bigint,'só o movimento do mês corrente segue sem fatura');

-- Evento sem lastro no benefício da etapa 4: o fechamento inteiro é recusado e nada é gravado.
insert into private.ride_order_events(order_id,action,operation_id,data,at)
 values(pg_temp.u('o_2b'),'benefit_refund',gen_random_uuid(),jsonb_build_object('cents',1),pg_temp.noon('p',10));
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_close_ride_invoice(pg_temp.u('org'),pg_temp.d('p'),gen_random_uuid())$$,'P0001','ride_financial_mismatch',
 'estorno que o benefício da etapa 4 não registra não é faturado');
select tests.clear_authentication();
select is((select count(*) from private.ride_invoices where account_id=pg_temp.u('org')),3::bigint,'a recusa não deixa fatura nem linha');
select is((select restored_cents from private.ride_invoice_marks where order_id=pg_temp.u('o_2b')),0,'a recusa não altera o que já foi faturado do pedido');

-- Invariantes de acesso das novas tabelas e rotinas.
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relrowsecurity
  and c.relname in ('ride_invoices','ride_invoice_lines','ride_invoice_marks','ride_invoice_disputes')),4::bigint,'as quatro tabelas novas têm RLS ligada');
select is((select count(*) from information_schema.role_table_grants where table_schema='private' and grantee in ('anon','authenticated','service_role','PUBLIC')
  and table_name in ('ride_invoices','ride_invoice_lines','ride_invoice_marks','ride_invoice_disputes')),0::bigint,'nenhum papel da API tem acesso direto às tabelas novas');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')
  and p.proname in ('admin_close_ride_invoice','ride_invoice','ride_invoice_export','ride_dispute_invoice_line','admin_decide_invoice_dispute','ride_org_report')),0::bigint,
 'visitante sem sessão não executa nenhuma das rotinas novas');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('authenticated',p.oid,'execute')
  and p.proname in ('admin_close_ride_invoice','ride_invoice','ride_invoice_export','ride_dispute_invoice_line','admin_decide_invoice_dispute','ride_org_report')),6::bigint,
 'as seis rotinas públicas são chamadas só por quem tem sessão');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private'
  and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute'))
  and p.proname in ('ride_invoice_frozen','ride_invoice_line_frozen','ride_invoice_no_truncate','ride_invoice_movements','ride_invoice_for','ride_invoice_lines_view',
   'ride_invoice_by_cost_center','ride_org_report_before_invoices')),0::bigint,'as rotinas privadas novas não são executáveis pelos papéis da API');
select is((select count(*) from information_schema.columns where table_schema='private' and table_name like 'ride_invoice%' and column_name ~ 'mail|origin|destination|lat|lng|point'),0::bigint,
 'as tabelas de fatura não guardam e-mail nem localização');

select * from finish();
rollback;
