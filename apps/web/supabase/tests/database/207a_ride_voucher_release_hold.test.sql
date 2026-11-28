-- DD124 (O17, continuação da etapa 5): o voucher reservado segura a cobrança pessoal da tarifa
-- mesmo com a liberação do benefício fechada, o interruptor de cobrança desligado ou a janela
-- vencida; o caso vai para a fila da operação, que aplica ou devolve o voucher. Sobre 20261128100101.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,v text not null);
grant select,insert on t to authenticated,anon,service_role;
create function pg_temp.g(p text) returns text language sql stable as $$select t.v from t where t.k=p$$;
create function pg_temp.u(p text) returns uuid language sql stable as $$select t.v::uuid from t where t.k=p$$;
create function pg_temp.n(p text) returns int language sql stable as $$select t.v::int from t where t.k=p$$;
create function pg_temp.trip() returns jsonb language sql immutable as $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
create function pg_temp.vouchers() returns jsonb language sql as $$select public.admin_ride_party_queue()->'vouchers'$$;
create function pg_temp.item(p uuid) returns jsonb language sql as $$select x from jsonb_array_elements(pg_temp.vouchers()) x where x->>'leg_id'=p::text$$;
-- Runs one statement and undoes it, answering the error it raised or 'ok'.
create function pg_temp.refusal(p_sql text) returns text language plpgsql as $f$
begin
 begin execute p_sql; raise exception 'pg_temp_undo'; exception when others then
   if sqlerrm='pg_temp_undo' then return 'ok'; end if; return sqlerrm; end;
end $f$;
grant execute on function pg_temp.g(text),pg_temp.u(text),pg_temp.n(text),pg_temp.trip(),pg_temp.vouchers(),pg_temp.item(uuid),pg_temp.refusal(text)
 to authenticated,anon,service_role;
create function pg_temp.save_program(p_key text,p_label text,p_budget int,p_value int,p_excess text) returns void language plpgsql as $$
begin
 insert into t values(p_key,gen_random_uuid()::text);
 perform tests.authenticate_as('admin');
 perform public.admin_save_ride_voucher_program(pg_temp.u(p_key),pg_temp.u('org'),p_label,p_budget,p_value,null,null,null,null,now()-interval '1 hour',
   now()+interval '10 days',p_excess,false,'ficticio-o17-dd124 verba','ficticio-o17-dd124 contrato',true);
 perform tests.clear_authentication();
end $$;
create function pg_temp.finish_leg(p_key text) returns void language sql as $$
 update public.ride_legs set driver_id=tests.uid('provider_c'),status='completed' where id=pg_temp.u(p_key)$$;
create function pg_temp.keep_leg(p_key text,p_ride text) returns void language sql as $$
 insert into t select p_key,id::text from public.ride_legs where ride_id=pg_temp.u(p_ride)$$;
create function pg_temp.benefit(p_open boolean) returns void language sql as $$
 update private.ride_method_releases set validity=tstzrange(lower(validity),case when p_open then now()+interval '1 day' else now() end)
 where environment='simulation' and origin='Saúde' and destination='Jabaquara' and method='benefit'$$;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_c'),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true);
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity,card_brands,acquirer_profile_ref)
 select 'simulation','Saúde','Jabaquara',m,'ensaio 207a',tstzrange(now()-interval '1 day',now()+interval '1 day'),
  case when m='card' then array['VISA'] else '{}'::text[] end,case when m='card' then 'conta hospedada TESTE' end from unnest(array['card','pix','benefit']) m;

-- Empresa conferida, colaboradora e dois programas: um parcial (diferença por conta de quem viaja) e um integral.
select tests.authenticate_as('provider_c');
insert into t select 'x',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'total_cents';
select tests.authenticate_as('client_a');
insert into t select 'org',public.ride_create_organization('Empresa de ensaio DD124',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select ok(public.admin_verify_ride_account(pg_temp.u('org'),'ficticio-o17-dd124 contrato',now()+interval '30 days'),'a operação confere a empresa');
select tests.authenticate_as('client_a');
insert into t select 'cc',public.ride_save_cost_center(pg_temp.u('org'),'VENDAS','Vendas',true)::text;
insert into t select 'inv_b',public.ride_invite_member(pg_temp.u('org'),'client_b@test.local','member',60,gen_random_uuid())->>'token';
select tests.authenticate_as('client_b');
select is(public.ride_join_account(pg_temp.g('inv_b'),true),'accepted','colaboradora entra por adesão');
select tests.clear_authentication();
insert into t select 'part',(pg_temp.n('x')-500)::text;
select pg_temp.save_program('p_part','Voucher parcial',pg_temp.n('x')*10,pg_temp.n('part'),'rider');
select pg_temp.save_program('p_full','Voucher integral',pg_temp.n('x')*10,pg_temp.n('x')*2,'none');
select tests.authenticate_as('client_b');
insert into t select 'q_a',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_part'),pg_temp.u('cc'))->>'id';
insert into t select 'r_a',public.ride_consent(pg_temp.u('q_a'),true)->>'ride_id';
insert into t select 'q_b',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_full'),pg_temp.u('cc'))->>'id';
insert into t select 'r_b',public.ride_consent(pg_temp.u('q_b'),true)->>'ride_id';
insert into t select 'q_c',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('p_part'),pg_temp.u('cc'))->>'id';
insert into t select 'r_c',public.ride_consent(pg_temp.u('q_c'),true)->>'ride_id';
select tests.clear_authentication();
select pg_temp.keep_leg('l_a','r_a');
select pg_temp.keep_leg('l_b','r_b');
select pg_temp.keep_leg('l_c','r_c');
insert into t select 'ben_c',benefit_id::text from private.ride_voucher_grants where leg_id=pg_temp.u('l_c');
insert into t select 'ben_a',benefit_id::text from private.ride_voucher_grants where leg_id=pg_temp.u('l_a');
insert into t select 'ben_b',benefit_id::text from private.ride_voucher_grants where leg_id=pg_temp.u('l_b');
select is((select count(*) from private.ride_voucher_grants where leg_id in (pg_temp.u('l_a'),pg_temp.u('l_b'))),2::bigint,'os dois trechos reservam voucher');

-- H1 · Liberação do benefício fechada: o trecho termina, o voucher não é aplicado e nada é cobrado da pessoa.
select tests.authenticate_as('client_b');
insert into t select 'o_a',public.ride_open_payment_order(pg_temp.u('l_a'),'pix')::text;
select tests.clear_authentication();
select pg_temp.benefit(false);
select pg_temp.finish_leg('l_a');
select pg_temp.finish_leg('l_b');
select pg_temp.finish_leg('l_c');
select is((select received_cents from private.ride_payment_orders where id=pg_temp.u('o_a')),0,'sem liberação do benefício o voucher não é aplicado');
select ok(private.ride_voucher_waiting(pg_temp.u('l_a'),tests.uid('client_b')),'o voucher continua segurando o pedido com a liberação fechada');
select results_eq($$select reason,resolution from private.ride_voucher_holds where leg_id=pg_temp.u('l_a')$$,$$values ('release_closed'::text,null::text)$$,
 'o fim do trecho registra o caso para a operação');
select tests.authenticate_service();
select is(pg_temp.refusal($$select public.ride_prepare_order_payment(pg_temp.u('o_a'),tests.uid('client_b'),'simulation')$$),'ride_voucher_on_hold',
 'a cobrança pessoal do pedido não é preparada enquanto o voucher aguarda a operação');
select tests.clear_authentication();
select throws_ok($$insert into private.ride_sandbox_charges(leg_id,payer_id,customer_ref,amount_cents,extras_cents)
 values(pg_temp.u('l_b'),tests.uid('client_b'),'cliente-ficticio',100,0)$$,'P0001','ride_voucher_on_hold','a cobrança antiga da tarifa inteira também é recusada');
select tests.authenticate_as('provider_b');
insert into t select 'code',public.ride_make_share_code()::text;
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_open_payment_order(pg_temp.u('l_b'),'cash')$$,'P0001','ride_voucher_on_hold','dinheiro é recusado enquanto o voucher aguarda a operação');
select throws_ok($$select public.ride_redeem_voucher(pg_temp.u('l_a'),'pix')$$,'P0001','ride_voucher_on_hold','usar o voucher explica que ele aguarda a operação');
select throws_ok($$select public.ride_invite_fare_code(pg_temp.u('o_a'),pg_temp.u('code'),100,gen_random_uuid())$$,'P0001','ride_voucher_on_hold',
 'dividir a tarifa não passa a parte da empresa para outra pessoa');
select results_eq($$select x->>'state',x->>'reason',(x->>'cents')::int from (select public.ride_voucher_hold(pg_temp.u('l_a')) x) s$$,
 $$values ('on_hold'::text,'release_closed'::text,pg_temp.n('part'))$$,'quem paga lê que o voucher aguarda a operação');
select tests.authenticate_as('provider_b');
select is(public.ride_voucher_hold(pg_temp.u('l_a')),null::jsonb,'outra pessoa não lê o voucher do trecho');
select tests.clear_authentication();
select is((select count(*) from private.ride_order_psp where order_id=pg_temp.u('o_a')),0::bigint,'nenhuma cobrança foi preparada');

-- H2 · A fila da operação lista os casos, com empresa, programa, valor, início e motivo.
select tests.authenticate_as('admin');
select results_eq($$select x->>'account_name',x->>'program_label',(x->>'cents')::int,x->>'reason',(x->>'ready')::boolean from (select pg_temp.item(pg_temp.u('l_a')) x) s$$,
 $$values ('Empresa de ensaio DD124'::text,'Voucher parcial'::text,pg_temp.n('part'),'release_closed'::text,false)$$,'a fila lista o voucher parcial retido');
select is((pg_temp.item(pg_temp.u('l_b'))->>'reason'),'release_closed','a fila lista o voucher integral retido');
select ok((pg_temp.item(pg_temp.u('l_a'))->>'since')::timestamptz<=now(),'a fila informa desde quando o pedido está retido');
select ok(public.admin_ride_party_queue() ?& array['accounts','dependents','cessions','disputes','invoices','vouchers'],'a fila mantém as seções anteriores');
select throws_ok($$select public.admin_resolve_ride_voucher_hold(pg_temp.u('l_a'),'apply','ficticio-dd124-a',gen_random_uuid())$$,'P0001','ride_feature_disabled',
 'aplicar exige a liberação do benefício aberta de novo');
select throws_ok($$select public.admin_resolve_ride_voucher_hold(pg_temp.u('l_a'),'pagar','ficticio-dd124-a',gen_random_uuid())$$,'P0001','invalid_input','ação desconhecida é recusada');
select throws_ok($$select public.admin_resolve_ride_voucher_hold(pg_temp.u('l_a'),'return','  ',gen_random_uuid())$$,'P0001','invalid_input','sem referência não há decisão');
select tests.authenticate_as('client_a');
select throws_ok($$select public.admin_ride_party_queue()$$,'P0001','not_allowed','a empresa não lê a fila da operação');
select throws_ok($$select public.admin_resolve_ride_voucher_hold(pg_temp.u('l_a'),'return','ficticio-dd124-a',gen_random_uuid())$$,'P0001','not_allowed',
 'quem não é da operação não decide o voucher');
select throws_ok($$select private.ride_voucher_note_holds('simulation',null)$$,'42501',null,'rotina privada não é chamada pelo cliente');
select throws_ok($$select * from private.ride_voucher_holds$$,'42501',null,'os casos retidos não são lidos direto pelo cliente');
select tests.authenticate_anon();
select throws_ok($$select public.admin_resolve_ride_voucher_hold(gen_random_uuid(),'return','ficticio',gen_random_uuid())$$,'42501',null,'visitante sem sessão não decide');
select throws_ok($$select public.ride_voucher_hold(gen_random_uuid())$$,'42501',null,'visitante sem sessão não lê o voucher');
select tests.clear_authentication();

-- H3 · A janela do voucher vence durante a retenção: ele não some, segue comprometido e listado.
update private.ride_benefits set valid_until=now() where id=pg_temp.u('ben_b');
select ok(private.ride_voucher_waiting(pg_temp.u('l_b'),tests.uid('client_b')),'o voucher vencido durante a retenção continua segurando o pedido');
select is(private.ride_voucher_commitment(pg_temp.u('p_full'),null),pg_temp.n('x')::bigint,'o voucher retido continua comprometido no programa');
select pg_temp.benefit(true);
select tests.authenticate_as('admin');
select results_eq($$select x->>'reason',(x->>'ready')::boolean from (select pg_temp.item(pg_temp.u('l_b')) x) s$$,$$values ('benefit_expired'::text,true)$$,
 'com a liberação aberta de novo, a fila mostra o voucher vencido');
select results_eq($$select x->>'reason',(x->>'ready')::boolean from (select pg_temp.item(pg_temp.u('l_a')) x) s$$,$$values ('release_closed'::text,true)$$,
 'o caso continua na fila depois que a liberação volta, agora pronto para aplicar');

-- H4 · A operação aplica o voucher parcial: só a diferença aceita fica para quem viaja.
insert into t values('k_apply',gen_random_uuid()::text),('k_return',gen_random_uuid()::text);
insert into t select 'apply',public.admin_resolve_ride_voucher_hold(pg_temp.u('l_a'),'apply',' ficticio-dd124-a ',pg_temp.u('k_apply'))::text;
select is((pg_temp.g('apply')::jsonb->>'applied_cents')::int,pg_temp.n('part'),'a operação aplica o voucher ao pedido');
select is(public.admin_resolve_ride_voucher_hold(pg_temp.u('l_a'),'apply','ficticio-dd124-a',pg_temp.u('k_apply')),pg_temp.g('apply')::jsonb,'repetir a decisão devolve o mesmo resultado');
select throws_ok($$select public.admin_resolve_ride_voucher_hold(pg_temp.u('l_a'),'return','ficticio-dd124-a',pg_temp.u('k_apply'))$$,'P0001','idempotency_conflict',
 'a mesma chave com outra decisão é conflito');
select throws_ok($$select public.admin_resolve_ride_voucher_hold(pg_temp.u('l_a'),'return','ficticio-dd124-b',gen_random_uuid())$$,'P0001','ride_operation_conflict',
 'um caso já resolvido não recebe outra decisão');
select is(pg_temp.item(pg_temp.u('l_a')),null::jsonb,'o caso resolvido sai da fila');
select tests.clear_authentication();
select results_eq($$select o.received_cents,o.amount_cents-o.received_cents,o.status from private.ride_payment_orders o where o.id=pg_temp.u('o_a')$$,
 $$select pg_temp.n('part'),500,'open'::text$$,'o pedido fica só com a diferença aceita na cotação');
select is((select count(*) from private.ride_benefit_uses where benefit_id=pg_temp.u('ben_a')),1::bigint,'o voucher é usado uma única vez');
select tests.authenticate_service();
select isnt(pg_temp.refusal($$select public.ride_prepare_order_payment(pg_temp.u('o_a'),tests.uid('client_b'),'simulation')$$),'ride_voucher_on_hold',
 'depois de aplicado, a diferença segue o pagamento comum');
select tests.clear_authentication();

-- H5 · A operação devolve o voucher vencido ao programa: quem viaja passa a pagar pelo caminho comum.
select tests.authenticate_as('admin');
insert into t select 'ret',public.admin_resolve_ride_voucher_hold(pg_temp.u('l_b'),'return','ficticio-dd124-c',pg_temp.u('k_return'))::text;
select is(public.admin_resolve_ride_voucher_hold(pg_temp.u('l_b'),'return','ficticio-dd124-c',pg_temp.u('k_return')),pg_temp.g('ret')::jsonb,'repetir a devolução devolve o mesmo resultado');
select throws_ok($$select public.admin_resolve_ride_voucher_hold(pg_temp.u('l_b'),'return','ficticio-dd124-d',pg_temp.u('k_return'))$$,'P0001','idempotency_conflict',
 'a mesma chave com outra referência é conflito');
select is(pg_temp.item(pg_temp.u('l_b')),null::jsonb,'o voucher devolvido sai da fila');
select tests.clear_authentication();
select ok(not private.ride_voucher_waiting(pg_temp.u('l_b'),tests.uid('client_b')),'o voucher devolvido não segura mais o pedido');
select is(private.ride_voucher_commitment(pg_temp.u('p_full'),null),0::bigint,'o valor devolvido volta ao programa');
select is((select available_cents from private.ride_benefits where id=pg_temp.u('ben_b')),0,'o benefício devolvido não pode mais ser usado');
select is((select count(*) from public.audit_log where action='ride.voucher_hold' and entity_id in (pg_temp.g('ben_a'),pg_temp.g('ben_b'))),2::bigint,'cada decisão fica na auditoria');
select is((select count(*) from public.audit_log where action='ride.voucher_hold' and data->>'reference'='ficticio-dd124-a'),1::bigint,'a auditoria guarda a referência sem espaços');
select tests.authenticate_as('client_b');
select results_eq($$select x->>'state',x->>'reason',(x->>'cents')::int from (select public.ride_voucher_hold(pg_temp.u('l_b')) x) s$$,
 $$values ('returned'::text,null::text,pg_temp.n('x'))$$,'quem paga lê que o voucher voltou ao programa, não que ele paga a parte da empresa');
select throws_ok($$select public.ride_redeem_voucher(pg_temp.u('l_b'),'pix')$$,'P0001','ride_voucher_returned','usar o voucher devolvido explica que ele voltou ao programa');
select isnt(pg_temp.refusal($$select public.ride_open_payment_order(pg_temp.u('l_b'),'cash')$$),'ride_voucher_on_hold','sem voucher, o pedido segue o caminho comum');
select tests.clear_authentication();

-- H7 · Voucher parcial sem pedido aberto: a operação não escolhe a forma da diferença por quem paga.
select is((select count(*) from private.ride_payment_orders where leg_id=pg_temp.u('l_c')),0::bigint,'o trecho parcial terminou sem pedido aberto');
select tests.authenticate_as('admin');
select is((pg_temp.item(pg_temp.u('l_c'))->>'ready')::boolean,true,'o voucher parcial sem pedido está na fila, pronto para aplicar');
insert into t select 'apply_c',public.admin_resolve_ride_voucher_hold(pg_temp.u('l_c'),'apply','ficticio-dd124-e',gen_random_uuid())::text;
select results_eq($$select (x->>'payer_choice')::boolean,x->>'order_id',x->>'applied_cents' from (select pg_temp.g('apply_c')::jsonb x) s$$,
 $$values (true,null::text,null::text)$$,'aplicar libera o voucher sem abrir pedido nem escolher a forma de pagamento');
select is(pg_temp.item(pg_temp.u('l_c')),null::jsonb,'o caso liberado sai da fila');
select tests.clear_authentication();
select is((select count(*) from private.ride_payment_orders where leg_id=pg_temp.u('l_c')),0::bigint,'nenhum pedido é aberto em nome de quem paga');
-- A liberação fecha de novo antes de quem paga agir: o trecho volta para a fila em um caso novo.
select pg_temp.benefit(false);
select tests.authenticate_as('admin');
select is((pg_temp.item(pg_temp.u('l_c'))->>'reason'),'release_closed','o trecho retido de novo volta para a fila');
select tests.clear_authentication();
select is((select count(*) from private.ride_voucher_holds where benefit_id=pg_temp.u('ben_c')),2::bigint,'a nova retenção é um caso novo, o anterior fica no histórico');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_open_payment_order(pg_temp.u('l_c'),'cash')$$,'P0001','ride_voucher_on_hold','na nova retenção o dinheiro segue recusado');
select tests.clear_authentication();
select pg_temp.benefit(true);
select tests.authenticate_as('admin');
select is((public.admin_resolve_ride_voucher_hold(pg_temp.u('l_c'),'apply','ficticio-dd124-f',gen_random_uuid())->>'payer_choice')::boolean,true,
 'a nova retenção também é liberada sem escolher por quem paga');
select tests.clear_authentication();
select tests.authenticate_as('client_b');
select is((public.ride_voucher_hold(pg_temp.u('l_c'))->>'state'),'ready','quem paga lê que pode usar o voucher');
select results_eq($$select (x->>'applied_cents')::int,(x->>'remainder_cents')::int,x->>'method' from (select public.ride_redeem_voucher(pg_temp.u('l_c'),'card') x) s$$,
 $$values (pg_temp.n('part'),500,'card'::text)$$,'quem paga usa o voucher e paga a diferença no cartão, a forma que escolheu');
select lives_ok($$select public.ride_open_payment_order(pg_temp.u('l_c'),'card')$$,'o pedido do trecho fica no cartão escolhido');
select tests.clear_authentication();
select is((select count(*) from private.ride_benefit_uses where benefit_id=pg_temp.u('ben_c')),1::bigint,'o voucher parcial é usado uma única vez');

-- H6 · Interruptor de cobrança desligado em produção e livro fechado.
select is((select private.ride_voucher_hold_reason(jsonb_populate_record(l,'{"environment":"live"}'),now()+interval '1 day') from public.ride_legs l where l.id=pg_temp.u('l_a')),
 'monetization_off','em produção, sem cobrança habilitada, o motivo é o interruptor desligado');
select is((select count(*) from private.ride_voucher_holds where environment='live'),0::bigint,'produção não recebe nenhum caso');
select is((select sum(cash_delta::bigint+receivable_delta+processing_expense_delta+benefit_delta-driver_delta-fee_delta) from private.ride_financial_events),0::numeric,
 'o livro fecha com o voucher aplicado pela operação');

select * from finish();
rollback;
