-- PAR-504 (O17 etapa 5): adolescente com responsável, sobre 20261127110503. O responsável é o
-- passageiro de registro; o parecer e a apólice valem por praça e faixa etária; só motorista
-- liberado atende; o código incorreto impede o embarque; o responsável recebe e escala o alerta;
-- a revisão de acesso e a retenção dos dados do menor ficam registradas. Dados fictícios, sem rede.
begin;
select no_plan();
select tests.setup_fixture();
select tests.create_user('minor_reviewer');
select tests.create_user('guardian_x');
insert into public.admins(user_id) values(tests.uid('minor_reviewer'));
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
update private.ride_dispatch_rules set wave_size=1 where environment='simulation';
create temp table t(k text primary key,v text not null);
grant select,insert on t to authenticated,anon;
create function pg_temp.g(p text) returns text language sql stable as $$select t.v from t where t.k=p$$;
create function pg_temp.u(p text) returns uuid language sql stable as $$select t.v::uuid from t where t.k=p$$;
create function pg_temp.k(p text) returns uuid language sql immutable as $$select md5('205b2'||p)::uuid$$;
create function pg_temp.trip() returns jsonb language sql immutable as $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
create function pg_temp.today() returns date language sql stable security definer as $$select private.sp_date(now())$$;
create function pg_temp.family(p_accounts jsonb,p_id uuid) returns jsonb language sql immutable as $$
 select a from jsonb_array_elements(p_accounts) a where a->>'id'=p_id::text$$;
create function pg_temp.mine(p_dependent uuid) returns jsonb language sql as $$
 select d from jsonb_array_elements(public.ride_my_accounts()) a cross join lateral jsonb_array_elements(a->'dependents') d where d->>'id'=p_dependent::text$$;
grant execute on function pg_temp.g(text),pg_temp.u(text),pg_temp.k(text),pg_temp.trip(),pg_temp.family(jsonb,uuid),pg_temp.mine(uuid),pg_temp.today() to authenticated,anon;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 select tests.uid(d),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true from unnest(array['provider_c','provider_d']) d;
-- Plantão de ensaio: o escalonamento do responsável precisa chegar a uma fila com gente.
insert into private.ride_pilot(id,period,approved_ref,budget_cents) values(pg_temp.k('pilot'),tstzrange(now()-interval '1 hour',now()+interval '1 day'),'TEST-205B2',10000);
insert into private.ride_coverage(id,pilot,period,lead_id,backup_id)
 values(pg_temp.k('roster'),pg_temp.k('pilot'),tstzrange(now()-interval '1 hour',now()+interval '1 day'),tests.uid('admin'),tests.uid('minor_reviewer'));
insert into private.ride_support_channels values(pg_temp.k('roster'),'email','qa@example.test','Equipe fictícia','TEST-205B2');

-- Portão e minimização: parecer e apólice só no ensaio; nada de nascimento ou documento no cadastro.
select is((select count(*) from private.ride_minor_policies where environment='simulation' and enabled and opinion_ref='ficticio-o17-e5' and insurance_ref='ficticio-o17-e5'
  and area in ('Saúde','Jabaquara')),4::bigint,'o ensaio semeia parecer e apólice fictícios para as duas faixas nas duas praças');
select is((select count(*) from private.ride_minor_policies where environment='live'),0::bigint,'produção não recebe nenhuma linha de parecer ou apólice');
select ok(not private.ride_minor_allowed('live','13-15','Saúde','Jabaquara',now()),'em produção nenhuma praça aceita adolescente');
select is((select count(*) from information_schema.columns where table_schema='private' and table_name in ('ride_dependents','ride_quote_dependents','ride_leg_dependents')
  and column_name ~ 'birth|nasc|cpf|document|doc_|phone|mail'),0::bigint,'o cadastro do dependente não tem data de nascimento, documento nem contato');
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relrowsecurity
  and c.relname in ('ride_minor_policies','ride_dependents','ride_minor_driver_clearances','ride_quote_dependents','ride_leg_dependents','ride_minor_alerts','ride_minor_access_log')),
 7::bigint,'as sete tabelas ficam com RLS ligada');

-- Cadastro pelo responsável que administra a família: idempotente e validado.
select tests.authenticate_as('client_a');
insert into t select 'fam',public.ride_create_family('Família de ensaio',1000000,'pix',gen_random_uuid())::text;
insert into t values('dep_key',gen_random_uuid()::text),('dep2_key',gen_random_uuid()::text),('dep3_key',gen_random_uuid()::text);
insert into t select 'dep',public.ride_register_dependent(pg_temp.u('fam'),'  Lia ','13-15','parental_authority',pg_temp.u('dep_key'))::text;
select is(public.ride_register_dependent(pg_temp.u('fam'),'Lia','13-15','parental_authority',pg_temp.u('dep_key')),pg_temp.u('dep'),'repetir o cadastro devolve o mesmo dependente');
select throws_ok($$select public.ride_register_dependent(pg_temp.u('fam'),'Outro nome','13-15','parental_authority',pg_temp.u('dep_key'))$$,'P0001','idempotency_conflict','mesma chave com outro cadastro é conflito');
select throws_ok($$select public.ride_register_dependent(pg_temp.u('fam'),'Criança','10-12','parental_authority',gen_random_uuid())$$,'P0001','invalid_input','faixa etária fora da lista é recusada');
select throws_ok($$select public.ride_register_dependent(pg_temp.u('fam'),'Lia','13-15','RG 12.345.678-9',gen_random_uuid())$$,'P0001','invalid_input','o vínculo é um código da lista, nunca um documento');
select throws_ok($$select public.ride_register_dependent(pg_temp.u('fam'),repeat('x',41),'13-15','guardianship',gen_random_uuid())$$,'P0001','invalid_input','nome com mais de 40 caracteres é recusado');
insert into t select 'dep2',public.ride_register_dependent(pg_temp.u('fam'),'Caio','16-17','guardianship',pg_temp.u('dep2_key'))::text;
insert into t select 'dep3',public.ride_register_dependent(pg_temp.u('fam'),'Nina','13-15','parental_authority',pg_temp.u('dep3_key'))::text;
select is(pg_temp.mine(pg_temp.u('dep'))->>'status','pending','o responsável vê o cadastro em conferência na sua família');
select is(pg_temp.mine(pg_temp.u('dep'))->>'label','Lia','o nome é guardado sem espaços nas pontas');
-- 2. Dependente sem conferência não viaja.
select throws_ok($$select public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)$$,'P0001','ride_minor_unavailable','dependente ainda não conferido é recusado');
select tests.clear_authentication();
select is((select count(*) from private.ride_dependents where account_id=pg_temp.u('fam') and status='pending' and valid_until is null and evidence_ref is null),3::bigint,
 'o cadastro nasce pendente, sem validade e sem evidência');
select is((select count(*) from private.ride_quotes where actor_id=tests.uid('client_a')),0::bigint,'a recusa não deixa cotação para trás');

-- 6. Outra pessoa e outra conta não alcançam o dependente.
select tests.authenticate_as('client_b');
insert into t select 'fam_b',public.ride_create_family('Outra família',1000000,'pix',gen_random_uuid())::text;
select throws_ok($$select public.ride_register_dependent(pg_temp.u('fam'),'Intruso','13-15','parental_authority',gen_random_uuid())$$,'P0001','ride_account_role_required','quem não administra a família não cadastra dependente nela');
select throws_ok($$select public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)$$,'P0001','not_allowed','pessoa sem vínculo recebe not_allowed ao cotar para o dependente alheio');
select is(pg_temp.family(public.ride_my_accounts(),pg_temp.u('fam_b'))->'dependents',null::jsonb,'a outra família não enxerga dependente nenhum');
-- Participante da mesma família que não é o responsável também não alcança o dependente.
select tests.authenticate_as('client_a');
insert into t select 'inv_e',public.ride_invite_member(pg_temp.u('fam'),'provider_e@test.local','member',60,gen_random_uuid())->>'token';
select tests.authenticate_as('provider_e');
select is(public.ride_join_account(pg_temp.g('inv_e'),true),'accepted','uma participante entra na família do responsável');
select ok(pg_temp.family(public.ride_my_accounts(),pg_temp.u('fam')) is not null and not (pg_temp.family(public.ride_my_accounts(),pg_temp.u('fam')) ? 'dependents'),
 'a participante vê a família, mas não os dependentes do responsável');
select throws_ok($$select public.ride_register_dependent(pg_temp.u('fam'),'Intruso','13-15','parental_authority',gen_random_uuid())$$,'P0001','ride_account_role_required','participante comum não cadastra dependente');
select throws_ok($$select public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)$$,'P0001','not_allowed','participante comum não cota para o dependente do responsável');
select tests.authenticate_as('client_b');
select throws_ok($$select public.admin_review_dependent(pg_temp.u('dep'),true,'EVID-205B2',pg_temp.today()+90)$$,'P0001','not_allowed','quem não é da operação não confere dependente');
select throws_ok($$select public.admin_ride_dependents()$$,'P0001','not_allowed','quem não é da operação não lê a fila de conferência');
select throws_ok($$select public.admin_set_minor_driver_clearance(tests.uid('provider_c'),'EVID-205B2',now()+interval '30 days')$$,'P0001','not_allowed','quem não é da operação não libera motorista');
select tests.authenticate_anon();
select throws_ok($$select public.ride_register_dependent(pg_temp.u('fam'),'Anônimo','13-15','parental_authority',gen_random_uuid())$$,'42501',null,'visitante não cadastra dependente');
select throws_ok($$select public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)$$,'42501',null,'visitante não cota para dependente');
select throws_ok($$select public.ride_guardian_watch(gen_random_uuid())$$,'42501',null,'visitante não acompanha viagem');
select throws_ok($$select public.ride_guardian_escalate(gen_random_uuid(),gen_random_uuid())$$,'42501',null,'visitante não escala alerta');
select throws_ok($$select public.admin_review_dependent(pg_temp.u('dep'),true,'EVID-205B2',pg_temp.today()+30)$$,'42501',null,'visitante não confere dependente');
select tests.clear_authentication();

-- 7. A conferência da operação fica no registro de acesso.
select tests.authenticate_as('admin');
select is(jsonb_array_length(public.admin_ride_dependents()),3,'a operação lê a fila com os três cadastros pendentes');
select is(jsonb_array_length(public.admin_ride_dependents()),3,'ler a fila de novo devolve a mesma fila');
select throws_ok($$select public.admin_review_dependent(pg_temp.u('dep'),true,'RG 12.345.678-9',pg_temp.today()+90)$$,'P0001','invalid_input','a evidência é uma referência, nunca o documento');
select throws_ok($$select public.admin_review_dependent(pg_temp.u('dep'),true,'EVID-205B2',null)$$,'P0001','invalid_input','aprovar exige validade');
select throws_ok($$select public.admin_review_dependent(pg_temp.u('dep'),true,'EVID-205B2',(pg_temp.today()+interval '13 months')::date)$$,'P0001','invalid_input','a validade não passa de 12 meses');
select throws_ok($$select public.admin_review_dependent(pg_temp.u('dep'),true,'EVID-205B2',pg_temp.today())$$,'P0001','invalid_input','a validade precisa estar no futuro');
select throws_ok($$select public.admin_review_dependent(gen_random_uuid(),true,'EVID-205B2',pg_temp.today()+90)$$,'P0001','invalid_input','cadastro inexistente é recusado');
select tests.clear_authentication();
select is((select count(*) from private.ride_minor_access_log where purpose='review'),0::bigint,'conferência recusada não deixa registro de acesso');
select is((select count(*) from private.ride_minor_access_log where purpose='queue' and actor=tests.uid('admin')),3::bigint,'a leitura da fila é registrada uma vez por cadastro, sem repetir a cada consulta');
select tests.authenticate_as('admin');
select ok(public.admin_review_dependent(pg_temp.u('dep'),true,'EVID-205B2',pg_temp.today()+90),'a operação confere o vínculo e a idade de Lia');
select ok(public.admin_review_dependent(pg_temp.u('dep'),true,'EVID-205B2',pg_temp.today()+90),'repetir a mesma conferência devolve o mesmo resultado');
select ok(public.admin_review_dependent(pg_temp.u('dep2'),true,'EVID-205B2-2',pg_temp.today()+90),'a operação confere Caio');
select ok(not public.admin_review_dependent(pg_temp.u('dep3'),false,'EVID-205B2-3',null),'a operação recusa o cadastro de Nina');
select tests.clear_authentication();
select is((select count(*) from private.ride_minor_access_log where dependent_id=pg_temp.u('dep') and actor=tests.uid('admin') and purpose='review'),2::bigint,
 'cada conferência grava uma linha no registro de acesso aos dados do menor');
select is((select status||'|'||evidence_ref||'|'||(valid_until-pg_temp.today())::text||'|'||(verified_by=tests.uid('admin'))::text from private.ride_dependents where id=pg_temp.u('dep')),
 'verified|EVID-205B2|90|true','o cadastro guarda só a referência, a validade e quem conferiu');
select is((select count(*) from public.audit_log where action='ride.dependent_review' and entity_id=pg_temp.g('dep')),1::bigint,'a repetição não duplica a trilha de auditoria');
select is((select status from private.ride_dependents where id=pg_temp.u('dep3')),'rejected','cadastro recusado fica recusado, sem validade');
-- Quem responde pelo dependente não confere o próprio cadastro, mesmo sendo da operação.
insert into public.admins(user_id) values(tests.uid('client_a'));
select tests.authenticate_as('client_a');
select throws_ok($$select public.admin_review_dependent(pg_temp.u('dep'),false,'EVID-PROPRIA',null)$$,'P0001','not_allowed','o responsável não confere o próprio dependente');
select tests.clear_authentication();
delete from public.admins where user_id=tests.uid('client_a');

-- 1. Parecer e apólice cobrem a faixa etária e a praça, até o fim do trecho.
update private.ride_minor_policies set enabled=false where environment='simulation';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)$$,'P0001','ride_minor_unavailable','sem parecer e apólice a viagem do adolescente é recusada');
select tests.clear_authentication();
update private.ride_minor_policies set enabled=true where environment='simulation' and age_band='16-17';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)$$,'P0001','ride_minor_unavailable','parecer de outra faixa etária não vale para 13 a 15 anos');
select tests.clear_authentication();
update private.ride_minor_policies set enabled=(area<>'Jabaquara') where environment='simulation';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)$$,'P0001','ride_minor_unavailable','parecer que cobre só a praça de origem não libera o destino');
select tests.clear_authentication();
update private.ride_minor_policies set enabled=true,valid_until=case when area='Jabaquara' then now()+interval '2 minutes' else 'infinity' end where environment='simulation';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)$$,'P0001','ride_minor_unavailable','apólice que vence antes do fim do trecho não cobre a viagem');
select tests.clear_authentication();
update private.ride_minor_policies set valid_until='infinity' where environment='simulation';
update private.ride_dependents set valid_until=pg_temp.today()-1 where id=pg_temp.u('dep');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)$$,'P0001','ride_minor_unavailable','conferência vencida não libera viagem');
select is(pg_temp.mine(pg_temp.u('dep'))->>'status','expired','o responsável vê o cadastro como vencido');
select throws_ok($$select public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep3'),true)$$,'P0001','ride_minor_unavailable','cadastro recusado pela operação não viaja');
select tests.clear_authentication();
update private.ride_dependents set valid_until=pg_temp.today()+90 where id=pg_temp.u('dep');
update private.ride_party_rules set enabled=false where environment='simulation' and capability='dependent';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)$$,'P0001','ride_feature_disabled','com o portão da capacidade fechado a cotação é recusada');
select throws_ok($$select public.ride_register_dependent(pg_temp.u('fam'),'Novo','13-15','parental_authority',gen_random_uuid())$$,'P0001','ride_feature_disabled','com o portão fechado não há novo cadastro');
select tests.clear_authentication();
update private.ride_party_rules set enabled=true where environment='simulation' and capability='dependent';

-- Motorista liberado pela operação, com data. A liberação é idempotente.
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_set_minor_driver_clearance(tests.uid('client_b'),'EVID-MOT-205B2',now()+interval '30 days')$$,'P0001','invalid_input','só motorista aprovado recebe liberação');
select throws_ok($$select public.admin_set_minor_driver_clearance(tests.uid('provider_c'),'EVID-MOT-205B2',now()+interval '13 months')$$,'P0001','invalid_input','a liberação não passa de 12 meses');
select ok(public.admin_set_minor_driver_clearance(tests.uid('provider_c'),'EVID-MOT-205B2',now()+interval '30 days'),'a operação libera um motorista para adolescentes');
select ok(public.admin_set_minor_driver_clearance(tests.uid('provider_c'),'EVID-MOT-205B2',now()+interval '30 days'),'repetir a liberação devolve o mesmo resultado');
select tests.clear_authentication();
select is((select count(*) from private.ride_minor_driver_clearances),1::bigint,'a repetição não duplica a liberação');

-- Cotação com aceite específico do responsável.
select tests.authenticate_as('client_a');
insert into t values('q1_key',gen_random_uuid()::text);
select throws_ok($$select public.ride_quote_for_dependent(pg_temp.u('q1_key'),null,pg_temp.trip(),pg_temp.u('dep'),false)$$,'P0001','invalid_input','sem o aceite específico do responsável não há cotação');
select throws_ok($$select public.ride_quote_for_dependent(pg_temp.u('q1_key'),null,pg_temp.trip(),pg_temp.u('dep'),null)$$,'P0001','invalid_input','aceite ausente também é recusado');
insert into t select 'q1',public.ride_quote_for_dependent(pg_temp.u('q1_key'),null,pg_temp.trip(),pg_temp.u('dep'),true)::text;
select is(pg_temp.g('q1')::jsonb#>>'{dependent,label}','Lia','a cotação diz qual dependente viaja');
select is(pg_temp.g('q1')::jsonb#>>'{dependent,age_band}','13-15','a cotação leva só a faixa etária');
select ok((pg_temp.g('q1')::jsonb->>'total_cents')::int>0,'o responsável vê o preço que vai pagar');
select is(public.ride_quote_for_dependent(pg_temp.u('q1_key'),null,pg_temp.trip(),pg_temp.u('dep'),true)->>'id',pg_temp.g('q1')::jsonb->>'id','repetir a cotação devolve a mesma cotação');
select throws_ok($$select public.ride_quote_for_dependent(pg_temp.u('q1_key'),null,pg_temp.trip(),pg_temp.u('dep2'),true)$$,'P0001','idempotency_conflict','mesma chave para outro dependente é conflito');
select tests.clear_authentication();
select is((select guardian_id from private.ride_quote_dependents where quote_id=(pg_temp.g('q1')::jsonb->>'id')::uuid and dependent_id=pg_temp.u('dep')),tests.uid('client_a'),
 'a declaração do responsável fica ligada à cotação');
select is((select count(*) from private.ride_quote_dependents),1::bigint,'as tentativas recusadas não deixam declaração');
select tests.authenticate_as('client_a');
insert into t select 'r1',public.ride_consent((pg_temp.g('q1')::jsonb->>'id')::uuid,true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg1',id::text from public.ride_legs where ride_id=pg_temp.u('r1');
select is((select passenger_id from public.rides where id=pg_temp.u('r1')),tests.uid('client_a'),'o responsável é o passageiro de registro');
select is((select payer_id from public.ride_legs where id=pg_temp.u('leg1')),tests.uid('client_a'),'o responsável é quem paga');
select is((select dependent_id from private.ride_leg_dependents where leg_id=pg_temp.u('leg1')),pg_temp.u('dep'),'a declaração fica congelada no trecho');

-- 3. Só motorista liberado atende; a atribuição direta é recusada.
select ok(private.ride_before_parties_eligible(tests.uid('provider_d'),l),'sem a regra do dependente o motorista sem liberação seria elegível') from public.ride_legs l where l.id=pg_temp.u('leg1');
select ok(not private.ride_offer_eligible(tests.uid('provider_d'),l),'motorista sem liberação não é elegível para o trecho do adolescente') from public.ride_legs l where l.id=pg_temp.u('leg1');
select ok(not private.ride_party_can_serve(tests.uid('provider_d'),l),'a regra das partes recusa o motorista sem liberação') from public.ride_legs l where l.id=pg_temp.u('leg1');
select ok(private.ride_offer_eligible(tests.uid('provider_c'),l),'motorista liberado é elegível') from public.ride_legs l where l.id=pg_temp.u('leg1');
select is((select count(*) from private.ride_driver_offers where leg_id=pg_temp.u('leg1') and driver_id=tests.uid('provider_d')),0::bigint,'motorista sem liberação não recebe a oferta');
select is((select count(*) from private.ride_driver_offers where leg_id=pg_temp.u('leg1') and driver_id=tests.uid('provider_c') and state='offered'),1::bigint,'a primeira onda já oferece só ao motorista liberado');
select throws_ok($$update public.ride_legs set driver_id=tests.uid('provider_d') where id=pg_temp.u('leg1')$$,'P0001','ride_minor_unavailable','atribuição direta de motorista sem liberação é recusada');
update private.ride_minor_driver_clearances set valid_until=now()+interval '5 minutes' where driver_id=tests.uid('provider_c');
select ok(not private.ride_offer_eligible(tests.uid('provider_c'),l),'liberação que vence antes do fim do trecho não serve') from public.ride_legs l where l.id=pg_temp.u('leg1');
select throws_ok($$update public.ride_legs set driver_id=tests.uid('provider_c') where id=pg_temp.u('leg1')$$,'P0001','ride_minor_unavailable','atribuição direta com liberação vencendo também é recusada');
update private.ride_minor_driver_clearances set valid_until=now()+interval '30 days' where driver_id=tests.uid('provider_c');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.ride_accept_offer(pg_temp.u('leg1'),gen_random_uuid())$$,'P0001','offer_unavailable','motorista sem liberação não aceita o trecho');
-- Regressão: trecho comum não pede liberação.
select tests.authenticate_as('client_b');
insert into t select 'r2',public.ride_consent((public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id')::uuid,true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg2',id::text from public.ride_legs where ride_id=pg_temp.u('r2');
select ok(private.ride_offer_eligible(tests.uid('provider_d'),l),'trecho sem dependente continua elegível para motorista sem liberação') from public.ride_legs l where l.id=pg_temp.u('leg2');
select is((select count(*) from private.ride_leg_dependents where leg_id=pg_temp.u('leg2')),0::bigint,'cotação comum não cria declaração de dependente');

-- 4. Código incorreto impede o embarque.
select tests.authenticate_as('provider_c');
select lives_ok($$select public.ride_accept_offer(pg_temp.u('leg1'),gen_random_uuid())$$,'motorista liberado aceita o trecho');
select lives_ok($$select public.ride_transition(pg_temp.u('leg1'),'arriving',gen_random_uuid())$$,'motorista liberado segue para o embarque');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_issue_pin(pg_temp.u('leg1'))$$,'P0001','not_allowed','só o responsável recebe o código de embarque');
select tests.authenticate_as('client_a');
insert into t select 'pin',public.ride_issue_pin(pg_temp.u('leg1'))->>'pin';
select tests.authenticate_as('provider_c');
select is(public.ride_verify_boarding(pg_temp.u('leg1'),'errado',gen_random_uuid())->>'ok','false','código incorreto devolve ok=false');
select tests.clear_authentication();
select is((select status from public.ride_legs where id=pg_temp.u('leg1')),'arriving','com o código incorreto o trecho não embarca');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.ride_transition(pg_temp.u('leg1'),'boarded',gen_random_uuid())$$,'P0001','ride_pin_required','embarque direto sem o código é recusado');
select throws_ok($$select public.ride_guardian_watch(pg_temp.u('leg1'))$$,'P0001','not_allowed','o motorista não lê o acompanhamento do responsável');
select is(public.ride_verify_boarding(pg_temp.u('leg1'),pg_temp.g('pin'),gen_random_uuid())->>'ok','true','o código certo conclui o embarque');
select tests.clear_authentication();
select is((select status from public.ride_legs where id=pg_temp.u('leg1')),'boarded','só então o trecho fica embarcado');

-- 5. O responsável recebe o alerta e consegue escalar ao plantão.
select tests.authenticate_as('client_a');
select is(public.ride_guardian_watch(pg_temp.u('leg1'))->>'wellness','stale_signal','sem sinal de localização o responsável recebe o aviso');
select is(public.ride_guardian_watch(pg_temp.u('leg1'))#>>'{alerts,0,kind}','stale_signal','o aviso fica registrado como alerta do trecho');
select is(pg_temp.mine(pg_temp.u('dep'))#>>'{legs,0,leg_id}',pg_temp.g('leg1'),'o responsável encontra o trecho no cadastro do dependente');
select tests.clear_authentication();
select is((select count(*) from private.ride_minor_alerts where leg_id=pg_temp.u('leg1')),1::bigint,'consultar de novo não duplica o alerta');
insert into private.ride_observations values(pg_temp.u('leg1'),now()-interval '5 minutes',-23.60,-46.63,10,true),(pg_temp.u('leg1'),now(),-23.60,-46.63,10,true);
insert into private.ride_safety_paths values(pg_temp.u('leg1'),'[[-23.70,-46.80],[-23.72,-46.82]]',250,'TEST-ROUTE',now()+interval '1 hour');
select tests.authenticate_as('client_a');
select is(public.ride_guardian_watch(pg_temp.u('leg1'))->>'wellness','route_deviation','posição fora do percurso de referência vira aviso de desvio');
select is(jsonb_array_length(public.ride_guardian_watch(pg_temp.u('leg1'))->'alerts'),2,'o desvio entra na lista de alertas do responsável');
insert into t values('esc_key',gen_random_uuid()::text);
insert into t select 'protocol',public.ride_guardian_escalate(pg_temp.u('leg1'),pg_temp.u('esc_key'))::text;
select is(public.ride_guardian_escalate(pg_temp.u('leg1'),pg_temp.u('esc_key')),pg_temp.u('protocol'),'repetir o escalonamento devolve o mesmo protocolo');
select throws_ok($$select public.ride_guardian_escalate(pg_temp.u('leg1'),null)$$,'P0001','invalid_input','escalonamento sem chave é recusado');
select is((select count(*) from jsonb_array_elements(public.ride_guardian_watch(pg_temp.u('leg1'))->'alerts') a where a->>'escalated_protocol'=pg_temp.g('protocol')),3::bigint,
 'os alertas do trecho ficam marcados com o protocolo do plantão');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_guardian_watch(pg_temp.u('leg1'))$$,'P0001','not_allowed','pessoa sem vínculo não acompanha a viagem');
select throws_ok($$select public.ride_guardian_escalate(pg_temp.u('leg1'),gen_random_uuid())$$,'P0001','not_allowed','pessoa sem vínculo não escala alerta');
select throws_ok($$select public.ride_guardian_watch(pg_temp.u('leg2'))$$,'P0001','not_allowed','trecho sem dependente não tem acompanhamento de responsável');
select tests.authenticate_as('provider_e');
select throws_ok($$select public.ride_guardian_watch(pg_temp.u('leg1'))$$,'P0001','not_allowed','participante da família que não é o responsável não acompanha a viagem');
select tests.authenticate_as('admin');
select ok(exists(select from jsonb_array_elements(public.admin_ride_safety_cases()) c where c->>'protocol'=pg_temp.g('protocol') and c->>'category'='emergency'
  and c->>'severity'='urgent'),'o plantão vê o protocolo do responsável como emergência urgente');
select tests.clear_authentication();
select is((select count(*) from private.ride_minor_alerts where leg_id=pg_temp.u('leg1')),3::bigint,'a repetição do escalonamento não duplica alertas');
select is((select count(*) from private.ride_case_details where leg=pg_temp.u('leg1') and reporter=tests.uid('client_a')),1::bigint,'a repetição não abre outro protocolo');

-- Mudança de trajeto para praça sem cobertura é recusada no trecho com dependente.
update private.ride_minor_policies set enabled=false where environment='simulation' and area='Vila Mariana';
select throws_ok($$update public.ride_legs set destination='Vila Mariana' where id=pg_temp.u('leg1')$$,'P0001','ride_minor_unavailable','trecho com dependente não muda para praça sem parecer');
update private.ride_minor_policies set enabled=true where environment='simulation';

-- Refazer um trecho cancelado mantém a declaração e confere tudo de novo.
select tests.authenticate_as('client_a');
insert into t select 'r3',public.ride_consent((public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep'),true)->>'id')::uuid,true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg3',id::text from public.ride_legs where ride_id=pg_temp.u('r3');
select tests.authenticate_as('client_a');
select lives_ok($$select public.ride_transition(pg_temp.u('leg3'),'cancelled',gen_random_uuid())$$,'o responsável cancela o segundo pedido');
insert into t select 'q4',public.ride_quote(gen_random_uuid(),null,null,jsonb_build_array(pg_temp.trip()->0||jsonb_build_object('replaces',pg_temp.g('leg3'))))->>'id';
select tests.clear_authentication();
update private.ride_dependents set valid_until=pg_temp.today()-1 where id=pg_temp.u('dep');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_consent(pg_temp.u('q4'),true)$$,'P0001','ride_minor_unavailable','o trecho refeito é recusado se a conferência venceu');
select tests.clear_authentication();
update private.ride_dependents set valid_until=pg_temp.today()+90 where id=pg_temp.u('dep');
select tests.authenticate_as('client_a');
select lives_ok($$select public.ride_consent(pg_temp.u('q4'),true)$$,'com a conferência em dia o trecho é refeito');
insert into t select 'q5',public.ride_quote_for_dependent(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('dep2'),true)->>'id';
select tests.clear_authentication();
insert into t select 'leg4',id::text from public.ride_legs where replaces_id=pg_temp.u('leg3');
select is((select dependent_id from private.ride_leg_dependents where leg_id=pg_temp.u('leg4')),pg_temp.u('dep'),'o trecho refeito por cotação comum herda a declaração do dependente');
select ok(not private.ride_offer_eligible(tests.uid('provider_d'),l),'o trecho refeito continua exigindo motorista liberado') from public.ride_legs l where l.id=pg_temp.u('leg4');

-- 8. Retenção: a rotina que o cron já chama remove o que venceu e mantém o resto.
insert into private.ride_minor_access_log(actor,dependent_id,purpose,at) values(tests.uid('admin'),pg_temp.u('dep2'),'review',now()-interval '13 months');
update private.ride_dependents set valid_until=pg_temp.today()-31 where id=pg_temp.u('dep2');
update private.ride_dependents set status='verified',valid_until=pg_temp.today()-5 where id=pg_temp.u('dep3');
update public.ride_legs set updated_at=now()-interval '31 days' where id=pg_temp.u('leg3');
select lives_ok($$select private.purge_ride_safety()$$,'a rotina de retenção roda com as regras do dependente');
select is((select count(*) from private.ride_dependents where id=pg_temp.u('dep2')),0::bigint,'dependente vencido há mais de 30 dias é removido');
select is((select count(*) from private.ride_quote_dependents where quote_id=pg_temp.u('q5')),0::bigint,'a declaração do dependente removido sai junto');
select is((select status from private.ride_dependents where id=pg_temp.u('dep3')),'expired','dependente vencido há poucos dias fica marcado como vencido');
select is((select status from private.ride_dependents where id=pg_temp.u('dep')),'verified','dependente em dia permanece');
select is((select count(*) from private.ride_leg_dependents where leg_id=pg_temp.u('leg3')),0::bigint,'o vínculo de trecho encerrado há mais de 30 dias é removido');
select is((select count(*) from private.ride_leg_dependents where leg_id in (pg_temp.u('leg1'),pg_temp.u('leg4'))),2::bigint,'vínculos de trechos em curso permanecem');
select is((select count(*) from private.ride_minor_access_log where at<now()-interval '12 months'),0::bigint,'o registro de acesso sai depois de 12 meses');
select is((select count(*) from private.ride_minor_access_log where dependent_id=pg_temp.u('dep') and purpose='review'),2::bigint,'o registro de acesso recente permanece');
update private.ride_dependents set reviewed_at=now()-interval '31 days',status='rejected',valid_until=null where id=pg_temp.u('dep3');
select private.purge_ride_minors();
select is((select count(*) from private.ride_dependents where id=pg_temp.u('dep3')),0::bigint,'cadastro recusado sai 30 dias depois da decisão');

-- Exclusão da conta do responsável apaga os dependentes.
select tests.authenticate_as('guardian_x');
insert into t select 'fam_x',public.ride_create_family('Família que sai',1000000,'pix',gen_random_uuid())::text;
insert into t select 'dep_x',public.ride_register_dependent(pg_temp.u('fam_x'),'Téo','16-17','guardianship',gen_random_uuid())::text;
select tests.clear_authentication();
update public.profiles set deleted_at=now() where id=tests.uid('guardian_x');
select is((select count(*) from private.ride_dependents where id=pg_temp.u('dep_x')),0::bigint,'apagar a conta do responsável remove o dependente');

-- Invariantes de permissão das novas funções e tabelas.
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where ((n.nspname='public' and p.proname in ('ride_register_dependent','admin_review_dependent','admin_ride_dependents','admin_set_minor_driver_clearance',
      'ride_quote_for_dependent','ride_guardian_watch','ride_guardian_escalate','ride_my_accounts'))
    or (n.nspname='private' and p.proname in ('ride_minor_allowed','ride_minor_can_serve','ride_party_can_serve','ride_before_parties_eligible','ride_offer_eligible',
      'ride_minor_leg_created','ride_minor_leg_guard','ride_dependents_view','ride_my_accounts_before_dependents','purge_ride_minors','purge_ride_safety_before_minors',
      'purge_ride_safety','erase_ride_minors')))
    and (has_function_privilege('anon',p.oid,'execute') or (n.nspname='private' and has_function_privilege('authenticated',p.oid,'execute')))),
 0::bigint,'visitante não executa nenhuma função nova e ninguém executa as privadas');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and has_function_privilege('authenticated',p.oid,'execute')
  and p.proname in ('ride_register_dependent','admin_review_dependent','admin_ride_dependents','admin_set_minor_driver_clearance','ride_quote_for_dependent',
    'ride_guardian_watch','ride_guardian_escalate','ride_my_accounts')),8::bigint,'as oito funções públicas ficam disponíveis a quem tem sessão');
select tests.authenticate_as('client_a');
select throws_ok($$select private.ride_dependents_view(tests.uid('client_a'))$$,'42501',null,'a leitura privada do cadastro não é chamada direto');
select throws_ok($$select count(*) from private.ride_dependents$$,'42501',null,'a tabela de dependentes não é lida direto');
select throws_ok($$select count(*) from private.ride_minor_access_log$$,'42501',null,'o registro de acesso não é lido direto');
select throws_ok($$select private.purge_ride_minors()$$,'42501',null,'a rotina de retenção não é chamada direto');
select tests.clear_authentication();
select * from finish();
rollback;
