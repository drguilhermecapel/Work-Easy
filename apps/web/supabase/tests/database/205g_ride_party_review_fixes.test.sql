-- O17 etapa 5 · correções da revisão (20261127110509): recibo de quem não paga, nova adesão sem o
-- histórico de quem saiu, conta encerrada sem o nome dado por quem saiu, retenção de autorizações e
-- participações, retirada do dependente pelo responsável e exportação completa. Dados fictícios, sem rede.
begin;
select no_plan();
select tests.setup_fixture();
select tests.create_user(k) from unnest(array['g_owner','g_member','g_extra','o_owner','o_mgr','o_emp','f_owner','f_member']) k;
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,v text not null);
grant select,insert on t to authenticated,anon;
create function pg_temp.g(p text) returns text language sql stable as $$select t.v from t where t.k=p$$;
create function pg_temp.u(p text) returns uuid language sql stable as $$select t.v::uuid from t where t.k=p$$;
create function pg_temp.n(p text) returns int language sql stable as $$select t.v::int from t where t.k=p$$;
create function pg_temp.trip() returns jsonb language sql immutable as $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
create function pg_temp.account(p uuid) returns jsonb language sql as $$select a from jsonb_array_elements(public.ride_my_accounts()) a where a->>'id'=p::text$$;
grant execute on function pg_temp.g(text),pg_temp.u(text),pg_temp.n(text),pg_temp.trip(),pg_temp.account(uuid) to authenticated,anon;
-- Runs one expression and answers its value, or {"error": code} when it raises, so a refused call is a failed assertion and not an aborted file.
create function pg_temp.attempt(p_sql text) returns jsonb language plpgsql as $f$
declare r jsonb;
begin
 execute 'select to_jsonb(('||p_sql||'))' into r;
 return r;
exception when others then return jsonb_build_object('error',sqlerrm);
end $f$;
grant execute on function pg_temp.attempt(text) to authenticated,anon,service_role;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_c'),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true);
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity,card_brands,acquirer_profile_ref)
 select 'simulation','Saúde','Jabaquara',m,'ensaio 205g',tstzrange(now()-interval '1 day',now()+interval '1 day'),
  case when m='card' then array['VISA'] else '{}'::text[] end,case when m='card' then 'conta hospedada TESTE' end from unnest(array['card','pix','benefit']) m;
select tests.authenticate_as('provider_b');
insert into t select 'x',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'total_cents';
select tests.clear_authentication();

-- ─── Recibo: quem viaja pela família não recebe valores ───────────────────────────────────
select tests.authenticate_as('g_owner');
insert into t select 'fam',public.ride_create_family('Família Souza de ensaio',pg_temp.n('x')*10,'pix',gen_random_uuid())::text;
insert into t select 'tok_m',public.ride_invite_member(pg_temp.u('fam'),'g_member@test.local','member',60,gen_random_uuid())->>'token';
insert into t select 'tok_x',public.ride_invite_member(pg_temp.u('fam'),'g_extra@test.local','member',60,gen_random_uuid())->>'token';
select tests.authenticate_as('g_member');
select is(public.ride_join_account(pg_temp.g('tok_m'),true),'accepted','a participante entra na família');
insert into t select 'm',pg_temp.account(pg_temp.u('fam'))->>'mandate_id';
insert into t select 'q_f',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m'))->>'id';
insert into t select 'r_f',public.ride_consent(pg_temp.u('q_f'),true)->>'ride_id';
select tests.authenticate_as('g_extra');
select is(public.ride_join_account(pg_temp.g('tok_x'),true),'accepted','outra pessoa entra na família');
select tests.clear_authentication();
insert into t select 'leg_f',id::text from public.ride_legs where ride_id=pg_temp.u('r_f');
update public.ride_legs set driver_id=tests.uid('provider_c'),status='completed' where id=pg_temp.u('leg_f');
select tests.authenticate_as('g_member');
insert into t select 'care_m',public.ride_aftercare(pg_temp.u('leg_f'))::text;
select tests.authenticate_as('g_owner');
insert into t select 'care_o',public.ride_aftercare(pg_temp.u('leg_f'))::text;
select tests.clear_authentication();
select is(pg_temp.g('care_m')::jsonb#>>'{document,role}','passenger','quem viajou recebe o documento do trecho');
select is(pg_temp.g('care_m')::jsonb#>'{document,money}','null'::jsonb,'quem viaja pela família não recebe os valores do trecho');
select ok(pg_temp.g('care_m') !~ '_cents','o documento de quem não paga não traz nenhum valor');
select is(pg_temp.g('care_m')::jsonb#>>'{document,paid_by_other}','true','o documento avisa que outra pessoa paga');
select is(pg_temp.g('care_m')::jsonb->>'can_rate','true','quem viajou continua avaliando o trecho');
select is(pg_temp.g('care_o')::jsonb#>>'{document,role}','payer','quem paga recebe o demonstrativo');
select is((pg_temp.g('care_o')::jsonb#>>'{document,money,fare_cents}')::int,(select fare_cents from public.ride_legs where id=pg_temp.u('leg_f')),'quem paga lê a tarifa');
select is(pg_temp.g('care_o')::jsonb#>'{document,journey}',null::jsonb,'quem paga não recebe o trajeto');

-- ─── Participação encerrada: o nome sai da lista e a linha sai na retenção ───────────────
select tests.authenticate_as('g_owner');
select ok(public.ride_remove_member(pg_temp.u('fam'),tests.uid('g_extra'),gen_random_uuid()),'a administradora remove quem não viajou');
select is((select count(*) from jsonb_array_elements(pg_temp.account(pg_temp.u('fam'))->'members') x where x->>'member_id'=tests.uid('g_extra')::text),1::bigint,
 'logo depois da saída a lista ainda mostra a pessoa como removida');
select tests.clear_authentication();
update private.ride_account_members set joined_at=now()-interval '2 months',removed_at=now()-interval '40 days'
 where account_id=pg_temp.u('fam') and member_id=tests.uid('g_extra');
select tests.authenticate_as('g_owner');
select is((select count(*) from jsonb_array_elements(pg_temp.account(pg_temp.u('fam'))->'members') x where x->>'member_id'=tests.uid('g_extra')::text),0::bigint,
 'um mês depois da saída a lista não mostra mais o nome de quem saiu');
select tests.clear_authentication();
select lives_ok($$select private.purge_ride_safety()$$,'a retenção roda');
select is((select count(*) from private.ride_account_members where account_id=pg_temp.u('fam') and member_id=tests.uid('g_extra')),0::bigint,
 'a participação encerrada sem nenhum vínculo financeiro sai na retenção');
select is((select status from private.ride_account_members where account_id=pg_temp.u('fam') and member_id=tests.uid('g_member')),'active',
 'a participação ativa fica');

-- ─── Dependente: o responsável retira o cadastro, exceto durante uma viagem ───────────────
select tests.authenticate_as('g_owner');
insert into t select 'dep',public.ride_register_dependent(pg_temp.u('fam'),'Lia','13-15','parental_authority',gen_random_uuid())::text;
select tests.clear_authentication();
insert into t select 'dep_until',(private.sp_date(now())+60)::text;
select tests.authenticate_as('admin');
select ok(public.admin_review_dependent(pg_temp.u('dep'),true,'REF-205G-1',pg_temp.g('dep_until')::date),'a operação confere o dependente');
select tests.authenticate_as('g_owner');
insert into t select 'q_dep',public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)->>'id';
insert into t select 'q_plain',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'r_plain',public.ride_consent(pg_temp.u('q_plain'),true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg_plain',id::text from public.ride_legs where ride_id=pg_temp.u('r_plain');
insert into private.ride_leg_dependents(leg_id,dependent_id,guardian_id,consented_at) values(pg_temp.u('leg_plain'),pg_temp.u('dep'),tests.uid('g_owner'),now());
select tests.authenticate_as('g_member');
select is(pg_temp.attempt($$public.ride_withdraw_dependent(pg_temp.u('dep'))$$),'false'::jsonb,'outra pessoa não retira o dependente');
select tests.authenticate_as('g_owner');
select throws_ok($$select public.ride_withdraw_dependent(pg_temp.u('dep'))$$,'P0001','ride_dependent_in_trip','durante a viagem o dependente não é retirado');
-- Viagem com o contato perdido ('unknown') ainda está em curso: o dependente também não sai.
select tests.clear_authentication();
update public.ride_legs set driver_id=tests.uid('provider_c'),status='unknown' where id=pg_temp.u('leg_plain');
select tests.authenticate_as('g_owner');
select throws_ok($$select public.ride_withdraw_dependent(pg_temp.u('dep'))$$,'P0001','ride_dependent_in_trip','com a viagem em estado desconhecido o dependente não é retirado');
select tests.clear_authentication();
select is((select count(*) from private.ride_leg_dependents where leg_id=pg_temp.u('leg_plain')),1::bigint,'o vínculo do menor com a viagem em curso continua');
update public.ride_legs set driver_id=null,status='requested' where id=pg_temp.u('leg_plain');
select tests.authenticate_as('g_owner');
select lives_ok($$select public.ride_transition(pg_temp.u('leg_plain'),'cancelled',gen_random_uuid())$$,'o responsável cancela a viagem');
select tests.clear_authentication();
update private.ride_network set module_enabled=false where environment='simulation';
select tests.authenticate_as('g_owner');
select is(pg_temp.attempt($$public.ride_withdraw_dependent(pg_temp.u('dep'))$$),'true'::jsonb,'o responsável retira o cadastro do dependente, mesmo com o módulo desligado');
select tests.clear_authentication();
update private.ride_network set module_enabled=true where environment='simulation';
select tests.authenticate_as('g_owner');
select is(pg_temp.attempt($$public.ride_withdraw_dependent(pg_temp.u('dep'))$$),'false'::jsonb,'repetir a retirada não faz nada');
select is(jsonb_array_length(coalesce(pg_temp.account(pg_temp.u('fam'))->'dependents','[]'::jsonb)),0,'a família não mostra mais o dependente');
select tests.clear_authentication();
select is((select count(*) from private.ride_dependents where id=pg_temp.u('dep')),0::bigint,'o cadastro do menor é apagado');
select is((select count(*) from private.ride_leg_dependents where dependent_id=pg_temp.u('dep'))+(select count(*) from private.ride_quote_dependents where dependent_id=pg_temp.u('dep')),
 0::bigint,'as ligações com cotações e trechos saem com o cadastro');
select is((select status from private.ride_quotes where id=pg_temp.u('q_dep')),'superseded','a cotação que declarava o dependente deixa de valer');
select ok(exists(select from private.ride_minor_access_log where dependent_id=pg_temp.u('dep')),'o registro de acesso da operação fica');

-- ─── Empresa: nova adesão começa sem grupo, limite nem autorização antiga ────────────────
select tests.authenticate_as('o_owner');
insert into t select 'org',public.ride_create_organization('Empresa de ensaio G',gen_random_uuid())::text;
select tests.authenticate_as('admin');
select ok(public.admin_verify_ride_account(pg_temp.u('org'),'ficticio-o17-e5 contrato G',now()+interval '30 days'),'a operação confere a empresa');
insert into t values('prog',gen_random_uuid()::text);
select lives_ok($$select public.admin_save_ride_voucher_program(pg_temp.u('prog'),pg_temp.u('org'),'Diretoria',pg_temp.n('x')*10,pg_temp.n('x')*2,null,null,null,'diretoria',
 now()-interval '1 hour',now()+interval '10 days','none',true,'ficticio-o17-e5 verba','ficticio-o17-e5 contrato',true)$$,'a operação registra um programa da diretoria com autorização');
select tests.authenticate_as('o_owner');
insert into t select 'cc',public.ride_save_cost_center(pg_temp.u('org'),'DIR','Diretoria',true)::text;
insert into t select 'tok_mgr',public.ride_invite_member(pg_temp.u('org'),'o_mgr@test.local','manager',60,gen_random_uuid())->>'token';
insert into t select 'tok_emp',public.ride_invite_member(pg_temp.u('org'),'o_emp@test.local','member',60,gen_random_uuid())->>'token';
select tests.authenticate_as('o_mgr');
select is(public.ride_join_account(pg_temp.g('tok_mgr'),true),'accepted','o gestor entra na empresa');
select tests.authenticate_as('o_emp');
select is(public.ride_join_account(pg_temp.g('tok_emp'),true),'accepted','a colaboradora entra na empresa');
select tests.authenticate_as('o_owner');
select ok(public.ride_set_member_role(pg_temp.u('org'),tests.uid('o_emp'),'member','diretoria'),'a administradora põe a colaboradora no grupo da diretoria');
select ok(public.ride_set_member_limit(pg_temp.u('org'),tests.uid('o_emp'),pg_temp.n('x')*5),'e define um limite individual');
select tests.authenticate_as('o_emp');
insert into t values('grant',gen_random_uuid()::text),('grant_old',gen_random_uuid()::text);
select is(public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('prog'),pg_temp.u('cc'),'Reunião de ensaio',now()-interval '1 hour',now()+interval '2 days',pg_temp.u('grant')),
 pg_temp.u('grant'),'a colaboradora pede uma autorização');
select is(public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('prog'),pg_temp.u('cc'),'Consulta de ensaio',now()-interval '1 hour',now()+interval '2 days',pg_temp.u('grant_old')),
 pg_temp.u('grant_old'),'e outra que fica sem decisão');
select tests.authenticate_as('o_owner');
select is(public.ride_decide_trip_grant(pg_temp.u('grant'),true),'approved','a administradora aprova a autorização');
select ok(public.ride_remove_member(pg_temp.u('org'),tests.uid('o_emp'),gen_random_uuid()),'a administradora remove a colaboradora');
select tests.clear_authentication();
select is((select array_agg(status order by id) from private.ride_trip_grants where id in (pg_temp.u('grant'),pg_temp.u('grant_old'))),array['rejected','rejected'],
 'a saída encerra as autorizações pendentes e aprovadas da pessoa');
select tests.authenticate_as('o_mgr');
insert into t select 'tok_back',public.ride_invite_member(pg_temp.u('org'),'o_emp@test.local','member',60,gen_random_uuid())->>'token';
select tests.authenticate_as('o_emp');
select is(public.ride_join_account(pg_temp.g('tok_back'),true),'accepted','o gestor convida de novo e ela volta');
select is(pg_temp.account(pg_temp.u('org'))->>'group_tag',null,'quem volta não recupera o grupo antigo');
select is(pg_temp.account(pg_temp.u('org'))->>'member_limit_cents',null,'quem volta não recupera o limite antigo');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('prog'),pg_temp.u('cc'),pg_temp.u('grant'))$$,'P0001','ride_voucher_unavailable',
 'fora do grupo, o programa da diretoria não é usado');
select tests.authenticate_as('o_owner');
select ok(public.ride_set_member_role(pg_temp.u('org'),tests.uid('o_emp'),'member','diretoria'),'a administradora devolve o grupo');
select tests.authenticate_as('o_emp');
select throws_ok($$select public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('prog'),pg_temp.u('cc'),pg_temp.u('grant'))$$,'P0001','ride_approval_required',
 'a autorização aprovada antes da saída não vale depois da volta');
insert into t values('grant_new',gen_random_uuid()::text);
select is(public.ride_request_trip_grant(pg_temp.u('org'),pg_temp.u('prog'),pg_temp.u('cc'),'Visita técnica de ensaio',now()-interval '1 hour',now()+interval '2 days',pg_temp.u('grant_new')),
 pg_temp.u('grant_new'),'depois da volta a colaboradora pede uma nova autorização');
select tests.authenticate_as('o_owner');
select is(public.ride_decide_trip_grant(pg_temp.u('grant_new'),true),'approved','a nova autorização é aprovada');
select tests.authenticate_as('o_emp');
insert into t select 'q_org',public.ride_quote_funded(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('prog'),pg_temp.u('cc'),pg_temp.u('grant_new'))->>'id';
select ok(public.ride_consent(pg_temp.u('q_org'),true)->>'ride_id' is not null,'com a nova autorização a viagem é pedida');

-- ─── Retenção das autorizações sem efeito ─────────────────────────────────────────────────
select tests.clear_authentication();
update private.ride_trip_grants set decided_at=now()-interval '40 days',created_at=now()-interval '41 days' where id=pg_temp.u('grant_old');
insert into private.ride_trip_grants(id,account_id,program_id,cost_center_id,beneficiary_id,issued_by,purpose,ceiling_cents,validity,status,request_hash,created_at)
 values(md5('205g-lapsed')::uuid,pg_temp.u('org'),pg_temp.u('prog'),pg_temp.u('cc'),tests.uid('o_emp'),tests.uid('o_emp'),'Pedido antigo de ensaio',100,
  tstzrange(now()-interval '50 days',now()-interval '40 days'),'requested','\x00',now()-interval '50 days'),
  (md5('205g-recent')::uuid,pg_temp.u('org'),pg_temp.u('prog'),pg_temp.u('cc'),tests.uid('o_emp'),tests.uid('o_emp'),'Pedido recente de ensaio',100,
  tstzrange(now()-interval '5 days',now()-interval '1 day'),'requested','\x00',now()-interval '5 days');
select lives_ok($$select private.purge_ride_safety()$$,'a retenção roda de novo');
select is((select count(*) from private.ride_trip_grants where id in (pg_temp.u('grant_old'),md5('205g-lapsed')::uuid)),0::bigint,
 'autorização recusada ou vencida há mais de 30 dias sai com o texto do motivo');
select is((select count(*) from private.ride_trip_grants where id in (pg_temp.u('grant'),md5('205g-recent')::uuid)),2::bigint,
 'autorização decidida ou vencida há pouco fica');

-- ─── Exportação: o que a pessoa emitiu ou que é sobre ela ─────────────────────────────────
select tests.authenticate_as('o_owner');
insert into t select 'inv_pending',public.ride_invite_member(pg_temp.u('org'),'f_member@test.local','approver',60,gen_random_uuid())->>'id';
insert into t select 'x_owner',public.ride_export_my_data()::text;
select tests.clear_authentication();
select ok(pg_temp.g('x_owner')::jsonb ?& array['invoice_disputes','invites_issued','guest_invites','minor_clearance','leg_vehicles','minor_alerts'],
 'a exportação traz contestações, convites emitidos, convites recebidos, liberação de motorista, veículos e alertas');
select is((select count(*) from jsonb_array_elements(pg_temp.g('x_owner')::jsonb->'invites_issued') i where i->>'id'=pg_temp.g('inv_pending') and i->>'role'='approver'
  and i->>'kind'='account'),1::bigint,'o convite pendente emitido aparece na exportação de quem convidou');
select ok((pg_temp.g('x_owner')::jsonb->'invites_issued')::text !~ 'hash|token|mail','os convites exportados não trazem resumo, código nem e-mail');
insert into private.ride_minor_driver_clearances(driver_id,evidence_ref,valid_until,granted_by) values(tests.uid('provider_c'),'LIB-205G',now()+interval '30 days',tests.uid('admin'));
select tests.authenticate_as('provider_c');
insert into t select 'x_driver',public.ride_export_my_data()::text;
select tests.clear_authentication();
select is(pg_temp.g('x_driver')::jsonb#>>'{minor_clearance,evidence_ref}','LIB-205G','o motorista vê a própria liberação para transportar adolescentes');

-- ─── Conta encerrada pela saída de quem a abriu ───────────────────────────────────────────
select lives_ok($$select public.anonymize_user(tests.uid('g_owner'))$$,'quem abriu a família exclui a conta');
select is((select status from private.ride_accounts where id=pg_temp.u('fam')),'closed','a família com trecho financiado é fechada');
select is((select name from private.ride_accounts where id=pg_temp.u('fam')),'Conta encerrada','a conta fechada não guarda o nome dado por quem saiu');
select is((select count(*) from private.ride_account_members where account_id=pg_temp.u('fam') and status='active'),0::bigint,'ninguém continua participante da conta fechada');
select tests.authenticate_as('g_member');
select is((select f->>'account_name' from jsonb_array_elements(public.ride_export_my_data()->'funded_legs') f where f->>'leg'=pg_temp.g('leg_f')),'Conta encerrada',
 'a exportação de quem viajou não mostra mais o nome antigo');
select tests.clear_authentication();
select lives_ok($$select public.anonymize_user(tests.uid('o_emp'))$$,'a colaboradora exclui a conta');
select is((select purpose from private.ride_trip_grants where id=pg_temp.u('grant_new')),'Viagem registrada',
 'a autorização usada fica para a fatura sem o texto escrito por quem saiu');

select * from finish();
rollback;
