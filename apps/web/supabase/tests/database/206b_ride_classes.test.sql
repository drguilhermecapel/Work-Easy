-- O17 etapa 6 · PAR-601: escolher veículo e preferência (C2). Só dados fictícios, dentro
-- desta transação. Aceite do O17: "Cada opção tem prestador e veículo aptos no turno,
-- remuneração e preço aceitos. Ensaiar falta de oferta, equipamento que não cabe e animal
-- de assistência, com alternativa consentida e sem sobretaxa indevida."
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t206b(k text primary key,id uuid,data jsonb);
grant all on t206b to authenticated;
create function pg_temp.id(p text) returns uuid language sql stable as $$select id from t206b where k=p$$;
create function pg_temp.key(p text) returns uuid language sql immutable as $$select md5('206b'||p)::uuid$$;
create function pg_temp.point(p_lat numeric,p_lng numeric,p_label text) returns jsonb language sql immutable as
 $$select jsonb_build_object('lat',p_lat,'lng',p_lng,'label',p_label)$$;
-- Disponibilidade por classe, como a resposta da RPC a entrega.
create function pg_temp.flags(p jsonb,p_key text default 'available') returns jsonb language sql immutable as
 $$select jsonb_object_agg(o->>'code',o->p_key) from jsonb_array_elements(p) o$$;
grant execute on function pg_temp.id(text),pg_temp.key(text),pg_temp.point(numeric,numeric,text),pg_temp.flags(jsonb,text) to authenticated;
-- Só a sessão de teste (dona do banco) usa as duas funções abaixo.
create function pg_temp.avail(p_code text) returns boolean language sql stable as $$
 select private.ride_capacity_estimate(c,now(),a) is not null from private.ride_route_cases c,private.ride_class_policies a
 where c.id=pg_temp.id('r1') and a.environment='simulation' and a.area='Saúde' and a.code=p_code$$;
create function pg_temp.eligible(p_driver text,p_leg text) returns boolean language sql stable as
 $$select private.ride_offer_eligible(tests.uid(p_driver),l) from public.ride_legs l where l.id=pg_temp.id(p_leg)$$;
create function pg_temp.offered(p_leg text) returns uuid[] language sql stable as
 $$select coalesce(array_agg(driver_id order by driver_id),'{}') from private.ride_driver_offers where leg_id=pg_temp.id(p_leg) and state='offered'$$;

-- Classes fictícias da origem: uma por característica vendida.
insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,luggage,standard,electric,pets,priority_wait_minutes,modality,valid_until,evidence_ref) values
 ('simulation','Saúde','padrao','Padrão',0,4,1,'standard',false,false,null,'car',now()+interval '1 day','ficticio-206b'),
 ('simulation','Saúde','eletrico','Elétrico',200,4,0,'standard',true,false,null,'car',now()+interval '1 day','ficticio-206b'),
 ('simulation','Saúde','pet','Com animal doméstico',250,3,0,'standard',false,true,null,'car',now()+interval '1 day','ficticio-206b'),
 ('simulation','Saúde','conforto','Conforto',300,4,2,'comfort',false,false,null,'car',now()+interval '1 day','ficticio-206b'),
 ('simulation','Saúde','prioridade','Prioridade',400,4,0,'standard',false,false,3,'car',now()+interval '1 day','ficticio-206b'),
 ('simulation','Saúde','van','Van',900,8,6,'standard',false,false,null,'van',now()+interval '1 day','ficticio-206b');
select tests.authenticate_as('client_a');
insert into t206b(k,id) select 'r'||i,(public.ride_prepare_route(pg_temp.key('rota'||i),null,'Saúde','Jabaquara',
 pg_temp.point(-23.60,-46.64,'Embarque de ensaio'),pg_temp.point(-23.61,-46.65,'Destino de ensaio'),null)->>'id')::uuid from generate_series(1,8) i;
insert into t206b(k,id) values('r9',(public.ride_prepare_route(pg_temp.key('rota9'),null,'Saúde','Jabaquara',
 pg_temp.point(-23.60,-46.64,'Embarque de ensaio'),pg_temp.point(-23.62,-46.66,'Destino alterado'),null)->>'id')::uuid);
select tests.authenticate_as('admin');
select public.ride_claim_route(id),public.ride_verify_route(id,2000,12,'ensaio/206b') from t206b where k ~ '^r[0-9]$';

-- Cadastro: SUV e minivan passam a ser categorias aceitas; outra categoria continua recusada.
select tests.authenticate_as('client_b');
select is(public.ride_apply_driver('sedan')->>'vehicle','sedan','sedã continua aceito no cadastro');
select tests.authenticate_as('provider_c');
select is(public.ride_apply_driver('suv')->>'vehicle','suv','SUV passa a ser categoria aceita');
select tests.authenticate_as('provider_d');
select is(public.ride_apply_driver('minivan')->>'vehicle','minivan','minivan passa a ser categoria aceita');
select throws_ok($$select public.ride_apply_driver('moto')$$,'P0001','invalid_vehicle','moto não é categoria de veículo desta rede');
select tests.clear_authentication();
select lives_ok($$insert into private.ride_driver_credentials(driver_id,vehicle_identifier,vehicle_category,driver_document_ref,vehicle_document_ref,insurance_ref,driver_until,vehicle_until,insurance_until,inspected_by)
 values(tests.uid('provider_c'),'ENS-206B','suv','DOC-206B','VEI-206B','SEG-206B',(now() at time zone 'America/Sao_Paulo')::date+2,(now() at time zone 'America/Sao_Paulo')::date+2,(now() at time zone 'America/Sao_Paulo')::date+2,tests.uid('admin'))$$,
 'a credencial privada do veículo aceita a categoria SUV');
select throws_ok($$update private.ride_driver_credentials set vehicle_category='moto' where driver_id=tests.uid('provider_c')$$,'23514',null,
 'a credencial continua recusando categoria fora da lista');
select tests.authenticate_as('admin');
select public.ride_review_driver(tests.uid(u),true,(now() at time zone 'America/Sao_Paulo')::date+3) from unnest(array['client_b','provider_c','provider_d']) u;
select public.ride_validate_capacity(tests.uid('client_b'),4,false,false,now()+interval '1 day','ensaio/206b-d1');
select public.ride_validate_capacity(tests.uid('provider_c'),4,false,false,now()+interval '1 day','ensaio/206b-d2');
select public.ride_validate_capacity(tests.uid('provider_d'),8,false,false,now()+interval '1 day','ensaio/206b-d3');

-- Características do veículo: só a operação registra, com referência da vistoria.
select lives_ok($$select public.ride_validate_vehicle_features(tests.uid('client_b'),1,'standard','combustion',false,'vistoria/206b-d1')$$,
 'a operação registra bagagem, padrão, propulsão e animal doméstico do veículo aprovado');
select lives_ok($$select public.ride_validate_vehicle_features(tests.uid('client_b'),1,'standard','combustion',false,'vistoria/206b-d1')$$,
 'repetir o mesmo registro não falha');
select throws_ok($$select public.ride_validate_vehicle_features(tests.uid('client_b'),13,'standard','combustion',false,'vistoria/206b')$$,'P0001','invalid_input','bagagem fora do limite é entrada inválida');
select throws_ok($$select public.ride_validate_vehicle_features(tests.uid('client_b'),1,'luxo','combustion',false,'vistoria/206b')$$,'P0001','invalid_input','padrão fora da lista é entrada inválida');
select throws_ok($$select public.ride_validate_vehicle_features(tests.uid('client_b'),1,'standard','vapor',false,'vistoria/206b')$$,'P0001','invalid_input','propulsão fora da lista é entrada inválida');
select throws_ok($$select public.ride_validate_vehicle_features(tests.uid('client_b'),1,'standard','combustion',null,'vistoria/206b')$$,'P0001','invalid_input','a opção de animal doméstico precisa ser informada');
select throws_ok($$select public.ride_validate_vehicle_features(tests.uid('client_b'),1,'standard','combustion',false,'x')$$,'P0001','invalid_input','a referência da vistoria é obrigatória');
select throws_ok($$select public.ride_validate_vehicle_features(tests.uid('admin'),1,'standard','combustion',false,'vistoria/206b')$$,'P0001','not_allowed','ninguém registra o próprio veículo');
select throws_ok($$select public.ride_validate_vehicle_features(tests.uid('provider_e'),1,'standard','combustion',false,'vistoria/206b')$$,'P0001','driver_ineligible',
 'sem motorista aprovado e capacidade registrada não há o que conferir');
select tests.clear_authentication();
select is((select count(*)::int from public.audit_log where action='ride.vehicle_features_review' and entity_id=tests.uid('client_b')::text),1,
 'o registro repetido é auditado uma única vez');
select is((select jsonb_build_array(luggage,standard,propulsion,pets,features_ref) from private.ride_vehicle_capacity where driver_id=tests.uid('client_b')),
 '[1,"standard","combustion",false,"vistoria/206b-d1"]'::jsonb,'as características ficam no registro de capacidade do veículo');

select tests.authenticate_as('client_b');
select public.ride_configure_shift('Saúde',now(),now()+interval '2 hours');
select public.ride_set_online(true);
select tests.authenticate_as('provider_c');
select public.ride_configure_shift('Saúde',now(),now()+interval '2 hours');
select public.ride_set_online(true);
select tests.authenticate_as('provider_d');
select public.ride_configure_shift('Saúde',now(),now()+interval '2 hours');
select public.ride_set_online(true);

-- Permissões (negativos).
select tests.authenticate_anon();
select throws_ok($$select public.ride_class_menu(pg_temp.id('r1'),null,'{}')$$,'42501',null,'visitante anônimo não consulta o cardápio de classes');
select throws_ok($$select public.ride_class_options(pg_temp.id('r1'),null)$$,'42501',null,'visitante anônimo não consulta as classes');
select throws_ok($$select public.ride_validate_vehicle_features(tests.uid('client_b'),1,'standard','combustion',false,'vistoria/206b')$$,'42501',null,
 'visitante anônimo não registra características de veículo');
select tests.authenticate_service();
select throws_ok($$select public.ride_class_menu(pg_temp.id('r1'),null,'{}')$$,'42501',null,'a chave de serviço não chama o cardápio de pessoa');
select throws_ok($$select public.ride_validate_vehicle_features(tests.uid('client_b'),1,'standard','combustion',false,'vistoria/206b')$$,'42501',null,
 'a chave de serviço não registra características de veículo');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_validate_vehicle_features(tests.uid('client_b'),6,'premium','electric',true,'vistoria/206b')$$,'P0001','not_allowed',
 'passageiro não registra características de veículo');
select throws_ok($$select private.ride_vehicle_meets(tests.uid('client_b'),0,'standard',false,false,'car')$$,'42501',null,'cliente não executa a regra privada do veículo');
select throws_ok($$select * from private.ride_capacity_candidates(null,now())$$,'42501',null,'cliente não lista motoristas candidatos');
select throws_ok($$select * from private.ride_vehicle_capacity$$,'42501',null,'cliente não lê a capacidade dos veículos');
select throws_ok($$select * from private.ride_class_policies$$,'42501',null,'cliente não lê a tabela de classes');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_validate_vehicle_features(tests.uid('client_b'),6,'premium','electric',true,'vistoria/206b')$$,'P0001','not_allowed',
 'motorista não registra as características do próprio veículo');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_class_menu(pg_temp.id('r1'),null,'{}')$$,'P0001','route_unavailable','outra pessoa não consulta o cardápio de uma rota alheia');
select throws_ok($$select public.ride_choose_class(pg_temp.id('r1'),'padrao',null)$$,'P0001','route_unavailable','outra pessoa não escolhe classe em rota alheia');
select tests.clear_authentication();
select is((select count(*)::int from pg_proc p where p.pronamespace='private'::regnamespace
   and p.proname in ('ride_names_assistance_animal','reset_ride_vehicle_features','inherit_ride_class_features','ride_vehicle_meets','ride_class_gate_issue',
     'ride_capacity_candidates','ride_capacity_estimate','ride_class_list','freeze_passenger_class','require_ride_class_capacity','attach_ride_class_modes','ride_pre_dispatch_eligible')
   and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))),0,
 'nenhum auxiliar ou gatilho privado das classes é executável pelas funções da API');
select is((select count(*)::int from pg_proc p where p.pronamespace='private'::regnamespace
   and p.proname in ('ride_vehicle_meets','ride_capacity_estimate')),5,'três regras de veículo e duas estimativas existem (a da etapa 1 e a da classe)');

-- C2.1 · Cada opção só fica disponível com motorista válido e veículo em turno que atenda
-- assentos, bagagem, padrão, propulsão e animal doméstico.
select tests.authenticate_as('client_a');
insert into t206b(k,data) values('op1',public.ride_class_options(pg_temp.id('r1'),null));
select is((select pg_temp.flags(data) from t206b where k='op1'),
 '{"padrao":true,"eletrico":false,"pet":false,"conforto":false,"prioridade":false,"van":false}'::jsonb,
 'só a classe que o veículo vistoriado atende fica disponível');
select is((select jsonb_agg(o->>'code') from t206b,jsonb_array_elements(data) o where k='op1'),
 '["padrao","eletrico","pet","conforto","prioridade","van"]'::jsonb,'as classes seguem ordenadas por preço');
select ok((select bool_and(o ?& array['code','label','seats','tools','accessible','fare_cents','available','approach_minutes','duration_minutes','observed_at',
   'luggage','standard','electric','pets','priority_wait_minutes']) from t206b,jsonb_array_elements(data) o where k='op1'),
 'cada opção traz as chaves da etapa 1 e as características novas');
select is((select o-array['observed_at','label','tools','accessible'] from t206b,jsonb_array_elements(data) o where k='op1' and o->>'code'='padrao'),
 '{"code":"padrao","seats":4,"luggage":1,"standard":"standard","electric":false,"pets":false,"priority_wait_minutes":null,"fare_cents":1230,"available":true,"approach_minutes":5,"duration_minutes":12}'::jsonb,
 'a opção informa capacidade, bagagem, padrão, preço e tempo estimado até o embarque');
select tests.authenticate_as('admin');
select public.ride_validate_vehicle_features(tests.uid('provider_c'),2,'comfort','electric',true,'vistoria/206b-d2');
select public.ride_validate_vehicle_features(tests.uid('provider_d'),6,'standard','combustion',false,'vistoria/206b-d3');
select tests.authenticate_as('client_a');
select is(pg_temp.flags(public.ride_class_options(pg_temp.id('r1'),null)),
 '{"padrao":true,"eletrico":true,"pet":true,"conforto":true,"prioridade":false,"van":true}'::jsonb,
 'com veículos vistoriados, elétrico, animal doméstico, conforto e van passam a ter oferta');
select tests.clear_authentication();
-- Uma dimensão por vez, no veículo do motorista do SUV.
update private.ride_vehicle_capacity set luggage=1 where driver_id=tests.uid('provider_c');
select is(pg_temp.avail('conforto'),false,'bagagem abaixo da classe tira a oferta');
update private.ride_vehicle_capacity set luggage=2,standard='standard' where driver_id=tests.uid('provider_c');
select is(pg_temp.avail('conforto'),false,'padrão abaixo da classe tira a oferta');
update private.ride_vehicle_capacity set standard='premium' where driver_id=tests.uid('provider_c');
select is(pg_temp.avail('conforto'),true,'padrão acima da classe atende');
update private.ride_vehicle_capacity set standard='comfort',seats=3 where driver_id=tests.uid('provider_c');
select is(pg_temp.avail('conforto'),false,'assentos abaixo da classe tiram a oferta');
update private.ride_vehicle_capacity set seats=4,propulsion='hybrid' where driver_id=tests.uid('provider_c');
select is(pg_temp.avail('eletrico'),false,'híbrido não atende a classe elétrica');
update private.ride_vehicle_capacity set propulsion='electric',pets=false where driver_id=tests.uid('provider_c');
select is(pg_temp.avail('pet'),false,'veículo sem a opção de animal doméstico não atende a classe com animal');
update private.ride_vehicle_capacity set pets=true where driver_id=tests.uid('provider_c');
select ok(pg_temp.avail('conforto') and pg_temp.avail('eletrico') and pg_temp.avail('pet'),'com tudo conferido as três classes voltam a ter oferta');
-- Motorista válido, vistoria vigente e turno.
update private.ride_vehicle_capacity set valid_until=now()-interval '1 minute' where driver_id=tests.uid('provider_c');
select is(pg_temp.avail('conforto'),false,'vistoria vencida tira a oferta');
update private.ride_vehicle_capacity set valid_until=now()+interval '1 day' where driver_id=tests.uid('provider_c');
update public.ride_drivers set valid_until=private.sp_date(now())-1 where id=tests.uid('provider_c');
select is(pg_temp.avail('conforto'),false,'motorista com aprovação vencida tira a oferta');
update public.ride_drivers set valid_until=private.sp_date(now())+3 where id=tests.uid('provider_c');
update private.ride_driver_shifts set period=tstzrange(now()-interval '3 hours',now()-interval '1 hour') where driver_id=tests.uid('provider_c');
select is(pg_temp.avail('conforto'),false,'fora do turno declarado não há oferta');
update private.ride_driver_shifts set period=tstzrange(now(),now()+interval '2 hours') where driver_id=tests.uid('provider_c');
select is(pg_temp.avail('conforto'),true,'motorista válido, vistoria vigente e turno devolvem a oferta');
-- Van: além de assentos e bagagem, a categoria precisa ser van ou minivan.
update public.ride_drivers set online=false where id=tests.uid('provider_d');
update private.ride_vehicle_capacity set seats=8,luggage=6 where driver_id=tests.uid('provider_c');
select is(pg_temp.avail('van'),false,'um SUV com os mesmos números não atende a classe van');
update private.ride_vehicle_capacity set seats=4,luggage=2 where driver_id=tests.uid('provider_c');
update public.ride_drivers set online=true where id=tests.uid('provider_d');
select is(pg_temp.avail('van'),true,'a minivan vistoriada atende a classe van');
-- Trocar o veículo ou o documento zera as características: elas valem para o veículo vistoriado.
update private.ride_vehicle_capacity set document_ref='ensaio/206b-outro' where driver_id=tests.uid('provider_d');
select is((select jsonb_build_array(luggage,standard,propulsion,pets,features_ref) from private.ride_vehicle_capacity where driver_id=tests.uid('provider_d')),
 '[0,"standard","combustion",false,null]'::jsonb,'outro documento de veículo começa sem características conferidas');
update private.ride_vehicle_capacity set luggage=6,features_ref='vistoria/206b-d3' where driver_id=tests.uid('provider_d');

-- C2.3 · Falta de oferta: disponível=false e a escolha é recusada, sem promessa.
update public.ride_drivers set online=false where id in (tests.uid('client_b'),tests.uid('provider_c'),tests.uid('provider_d'));
select tests.authenticate_as('client_a');
select is((select count(*)::int from jsonb_array_elements(public.ride_class_options(pg_temp.id('r1'),null)) o where (o->>'available')::boolean),0,
 'sem motorista em turno nenhuma classe fica disponível');
select is((select count(*)::int from jsonb_array_elements(public.ride_class_options(pg_temp.id('r1'),null)) o where o->>'approach_minutes' is not null),0,
 'sem oferta não há tempo estimado de chegada');
select throws_ok($$select public.ride_choose_class(pg_temp.id('r1'),'padrao',null)$$,'P0001','offer_unavailable','sem oferta a escolha da classe é recusada');
select throws_ok($$select public.ride_choose_class(pg_temp.id('r1'),'inexistente',null)$$,'P0001','offer_unavailable','classe inexistente é recusada');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_route_preferences),0,'a recusa não deixa preferência gravada');
update public.ride_drivers set online=true where id in (tests.uid('client_b'),tests.uid('provider_c'),tests.uid('provider_d'));

-- C2.2 · Preço e remuneração do motorista ficam congelados na cotação e no trecho.
select tests.authenticate_as('client_a');
select lives_ok($$select public.ride_choose_class(pg_temp.id('r1'),'conforto',null)$$,'a passageira escolhe a classe conforto');
select lives_ok($$select public.ride_choose_class(pg_temp.id('r1'),'conforto',null)$$,'repetir a escolha não falha');
insert into t206b(k,id) values('q1',(public.ride_quote(pg_temp.key('q1'),null,null,jsonb_build_array(jsonb_build_object('route_id',pg_temp.id('r1'),
 'origin','Saúde','destination','Jabaquara','payer','passenger')))->>'id')::uuid);
select is((public.ride_quote(pg_temp.key('q1'),null,null,jsonb_build_array(jsonb_build_object('route_id',pg_temp.id('r1'),
 'origin','Saúde','destination','Jabaquara','payer','passenger')))->>'id')::uuid,pg_temp.id('q1'),'repetir a cotação com a mesma chave devolve a mesma cotação');
select lives_ok($$select public.ride_choose_class(pg_temp.id('r1'),'conforto',null)$$,'com a cotação aberta, repetir a mesma classe é aceito');
select throws_ok($$select public.ride_choose_class(pg_temp.id('r1'),'padrao',null)$$,'P0001','route_measurement_locked','com a cotação aberta a classe não muda');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_route_preferences where route_id=pg_temp.id('r1')),1,'a escolha repetida mantém uma única preferência');
select is((select jsonb_build_array(class_code,surcharge_cents,seats,luggage,standard,electric,pets,priority_wait_minutes,modality) from private.ride_route_preferences where route_id=pg_temp.id('r1')),
 '["conforto",300,4,2,"comfort",false,false,null,"car"]'::jsonb,'a preferência congela as características da classe escolhida');
select is((select jsonb_build_array(total_cents,legs#>'{0,fare_cents}',legs#>'{0,fee_cents}',legs#>'{0,driver_cents}',legs#>>'{0,class_code}',legs#>'{0,approach_minutes}')
   from private.ride_quotes where id=pg_temp.id('q1')),'[1530,1530,153,1377,"conforto",5]'::jsonb,
 'a cotação congela preço (1230 + 300), comissão e remuneração do motorista');
select tests.authenticate_as('client_a');
insert into t206b(k,id) values('ride1',(public.ride_consent(pg_temp.id('q1'),true)->>'ride_id')::uuid);
select is((public.ride_consent(pg_temp.id('q1'),true)->>'ride_id')::uuid,pg_temp.id('ride1'),'repetir o aceite devolve a mesma corrida');
select tests.clear_authentication();
insert into t206b(k,id) select 'leg1',id from public.ride_legs where ride_id=pg_temp.id('ride1');
select is((select count(*)::int from public.ride_legs where ride_id=pg_temp.id('ride1')),1,'o aceite repetido não cria segundo trecho');
select is((select jsonb_build_array(fare_cents,fee_cents,driver_cents,extras_cents) from public.ride_legs where id=pg_temp.id('leg1')),'[1530,153,1377,0]'::jsonb,
 'o trecho nasce com o preço e a remuneração aceitos');
select is(pg_temp.offered('leg1'),array[tests.uid('provider_c')],'só o motorista cujo veículo atende a classe recebe a oferta');
select ok(not pg_temp.eligible('client_b','leg1') and not pg_temp.eligible('provider_d','leg1') and pg_temp.eligible('provider_c','leg1'),
 'veículo de padrão básico não é elegível para a classe conforto');
update private.ride_class_policies set surcharge_cents=900 where environment='simulation' and area='Saúde' and code='conforto';
select is((select jsonb_build_array(fare_cents,fee_cents,driver_cents) from public.ride_legs where id=pg_temp.id('leg1')),'[1530,153,1377]'::jsonb,
 'mudar a tabela depois do aceite não altera preço nem remuneração do trecho');
select ok(pg_temp.eligible('provider_c','leg1'),'a mudança de preço da tabela não tira o trecho aceito do despacho');
update private.ride_class_policies set surcharge_cents=300 where environment='simulation' and area='Saúde' and code='conforto';
-- A perda da característica depois do aceite bloqueia a oferta, o aceite e a partida.
update private.ride_vehicle_capacity set standard='standard' where driver_id=tests.uid('provider_c');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.ride_accept_offer(pg_temp.id('leg1'),pg_temp.key('aceite1'))$$,'P0001','offer_unavailable',
 'veículo que deixou de atender a classe não aceita o pedido');
select tests.clear_authentication();
update private.ride_vehicle_capacity set standard='comfort' where driver_id=tests.uid('provider_c');
select tests.authenticate_as('provider_c');
select is(public.ride_accept_offer(pg_temp.id('leg1'),pg_temp.key('aceite1'))->>'status','accepted','o veículo que atende a classe aceita');
select tests.clear_authentication();
update private.ride_vehicle_capacity set standard='standard' where driver_id=tests.uid('provider_c');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.ride_transition(pg_temp.id('leg1'),'arriving',pg_temp.key('partida1'))$$,'P0001','ride_capacity_changed',
 'característica perdida depois do aceite bloqueia a partida');
select tests.clear_authentication();
update private.ride_vehicle_capacity set standard='comfort' where driver_id=tests.uid('provider_c');
select tests.authenticate_as('client_a');
select is(public.ride_transition(pg_temp.id('leg1'),'cancelled',pg_temp.key('cancela1'))->>'status','cancelled','a passageira ainda pode cancelar');

-- A classe com animal doméstico só restringe a própria classe (opção vendida, nunca assistência).
select public.ride_choose_class(pg_temp.id('r4'),'pet',null);
insert into t206b(k,id) values('q4',(public.ride_quote(pg_temp.key('q4'),null,null,jsonb_build_array(jsonb_build_object('route_id',pg_temp.id('r4'),
 'origin','Saúde','destination','Jabaquara','payer','passenger')))->>'id')::uuid);
insert into t206b(k,id) values('ride4',(public.ride_consent(pg_temp.id('q4'),true)->>'ride_id')::uuid);
select tests.clear_authentication();
insert into t206b(k,id) select 'leg4',id from public.ride_legs where ride_id=pg_temp.id('ride4');
select is((select fare_cents from public.ride_legs where id=pg_temp.id('leg4')),1480,'a classe com animal doméstico tem o preço aceito da própria classe');
select ok(pg_temp.eligible('provider_c','leg4') and not pg_temp.eligible('client_b','leg4') and not pg_temp.eligible('provider_d','leg4'),
 'só o veículo preparado para animal doméstico é elegível para a classe com animal');
select is(pg_temp.offered('leg4'),array[tests.uid('provider_c')],'a oferta da classe com animal vai só ao veículo preparado');

-- C2.5 · Animal de assistência: viaja em qualquer classe, sem declaração e sem sobretaxa.
select tests.authenticate_as('client_a');
select public.ride_choose_class(pg_temp.id('r3'),'padrao',null);
insert into t206b(k,id) values('q3',(public.ride_quote(pg_temp.key('q3'),null,null,jsonb_build_array(jsonb_build_object('route_id',pg_temp.id('r3'),
 'origin','Saúde','destination','Jabaquara','payer','passenger')))->>'id')::uuid);
insert into t206b(k,id) values('ride3',(public.ride_consent(pg_temp.id('q3'),true)->>'ride_id')::uuid);
select throws_ok($$select public.ride_quote(pg_temp.key('animal1'),null,null,jsonb_build_array(jsonb_build_object('route_id',pg_temp.id('r2'),
 'origin','Saúde','destination','Jabaquara','payer','passenger','assistance_animal',true)))$$,'P0001','invalid_leg','a cotação não aceita declaração de animal de assistência');
select throws_ok($$select public.ride_quote(pg_temp.key('animal2'),null,null,jsonb_build_array(jsonb_build_object('route_id',pg_temp.id('r2'),
 'origin','Saúde','destination','Jabaquara','payer','passenger','extras',jsonb_build_array('assistance_animal'))))$$,'P0001','invalid_extras',
 'não existe adicional de animal de assistência para pedir');
select throws_ok($$select public.ride_class_menu(pg_temp.id('r2'),null,'{"seats":1,"assistance_animal":true}')$$,'P0001','invalid_input',
 'o cardápio de classes não aceita declaração de animal de assistência');
select throws_ok($$select public.ride_class_menu(pg_temp.id('r2'),null,'{"guide_dog":true}')$$,'P0001','invalid_input','nem com outro nome a declaração é aceita');
select tests.clear_authentication();
insert into t206b(k,id) select 'leg3',id from public.ride_legs where ride_id=pg_temp.id('ride3');
select is((select jsonb_build_array(fare_cents,extras_cents,fee_cents,driver_cents) from public.ride_legs where id=pg_temp.id('leg3')),'[1230,0,123,1107]'::jsonb,
 'a tarifa da classe padrão é a mesma para quem viaja com animal de assistência: não há adicional');
select is((select pets from private.ride_vehicle_capacity where driver_id=tests.uid('client_b')),false,'o veículo do sedã não tem a opção de animal doméstico');
select ok(pg_temp.eligible('client_b','leg3'),'o pedido da classe padrão é elegível para veículo sem a opção de animal doméstico');
select ok(tests.uid('client_b')=any(pg_temp.offered('leg3')),'a classe padrão é despachada ao motorista cujo veículo tem pets=false');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private')
   and exists(select from unnest(p.proargnames) a where a ~* '(assist.*anim|anim.*assist|guia|guide|service_?(animal|dog)|emotional|emocional)')),0,
 'nenhuma função recebe declaração de animal de assistência');
select is((select count(*)::int from information_schema.columns where table_schema in ('public','private')
   and column_name ~* '(assist.*anim|anim.*assist|guia|guide|service_?(animal|dog)|emotional|emocional)'),0,'nenhuma coluna guarda declaração de animal de assistência');
select throws_ok($$insert into private.ride_extra_prices select id,'cao_guia','Acompanhante',100 from private.ride_tariffs where environment='simulation' limit 1$$,'23514',null,
 'adicional com código de cão-guia viola a restrição');
select throws_ok($$insert into private.ride_extra_prices select id,'assistance_animal','Acompanhante',100 from private.ride_tariffs where environment='simulation' limit 1$$,'23514',null,
 'adicional de animal de assistência viola a restrição');
select throws_ok($$insert into private.ride_extra_prices select id,'x1','Animal de assistência',100 from private.ride_tariffs where environment='simulation' limit 1$$,'23514',null,
 'o rótulo também não pode cobrar animal de assistência');
select throws_ok($$insert into private.ride_extra_prices select id,'x2','Cão de serviço',100 from private.ride_tariffs where environment='simulation' limit 1$$,'23514',null,
 'cão de serviço também não pode ser cobrado');
select throws_ok($$insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,valid_until,evidence_ref)
 values('simulation','Saúde','guide_dog','Acompanhado',100,4,now()+interval '1 day','ficticio-206b')$$,'23514',null,'classe com código de cão-guia viola a restrição');
select throws_ok($$insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,valid_until,evidence_ref)
 values('simulation','Saúde','x3','Com cão-guia',100,4,now()+interval '1 day','ficticio-206b')$$,'23514',null,'classe com rótulo de cão-guia viola a restrição');
select throws_ok($$update private.ride_class_policies set label='Animal de apoio emocional' where code='pet'$$,'23514',null,
 'uma classe existente não pode ser renomeada para cobrar animal de apoio');
select lives_ok($$insert into private.ride_extra_prices select id,'pet','Animal doméstico',300 from private.ride_tariffs where environment='simulation' limit 1$$,
 'animal doméstico continua sendo opção vendável: a restrição mira só o animal de assistência');
-- C2.6 · A oferta enviada ao motorista não carrega chave de animal.
select tests.authenticate_as('client_b');
insert into t206b(k,data) values('painel',public.ride_dashboard()->'offers'),('oportunidades',public.driver_opportunities());
select ok((select jsonb_array_length(data)>0 and data @> jsonb_build_array(jsonb_build_object('leg_id',pg_temp.id('leg3'))) from t206b where k='painel'),
 'o motorista do sedã vê a oferta da classe padrão');
select ok((select data::text !~* '"[^"]*(anim|pet|guia|guide|dog|c[aã]o|assist)[^"]*" *:' from t206b where k='painel'),'a oferta ao motorista não tem chave de animal');
select ok((select jsonb_array_length(data)>0 and data::text !~* '"[^"]*(anim|pet|guia|guide|dog|c[aã]o|assist)[^"]*" *:' from t206b where k='oportunidades'),
 'a lista de oportunidades do motorista não tem chave de animal');
select is(public.ride_accept_offer(pg_temp.id('leg3'),pg_temp.key('aceite3'))->>'status','accepted','o motorista com pets=false aceita a corrida da classe padrão');
select is(public.ride_accept_offer(pg_temp.id('leg3'),pg_temp.key('aceite3'))->>'status','accepted','repetir o aceite com a mesma chave não muda o resultado');
-- Recusa de transporte por animal de assistência usa o caso de discriminação que já existe.
select tests.authenticate_as('client_a');
select ok(public.ride_safety_case(pg_temp.id('leg3'),'discrimination',pg_temp.key('caso3')) is not null,'a passageira pode abrir caso de discriminação para o trecho');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_case_details where leg=pg_temp.id('leg3') and category='discrimination'),1,'o caso fica registrado na fila de segurança');

-- C2.4 · Equipamento que não cabe: fits=false e alternativa; cotação só depois da escolha e do aceite.
create temp table n206b as select (select count(*) from private.ride_quotes) as quotes,(select count(*) from private.ride_route_preferences) as prefs,
 (select count(*) from public.rides) as rides,(select count(*) from public.audit_log) as audits;
select tests.authenticate_as('client_a');
insert into t206b(k,data) values('menu',public.ride_class_menu(pg_temp.id('r5'),null,'{"seats":2,"luggage":5,"pets":false,"electric":false,"priority":false}'));
select is((select pg_temp.flags(data->'options','fits') from t206b where k='menu'),
 '{"padrao":false,"eletrico":false,"pet":false,"conforto":false,"prioridade":false,"van":true}'::jsonb,'cinco malas não cabem nas classes de carro: fits=false');
select is((select data->>'alternative' from t206b where k='menu'),'van','o servidor indica a van como alternativa');
select ok((select bool_and(o ?& array['fits','available','fare_cents','luggage']) from t206b,jsonb_array_elements(data->'options') o where k='menu'),
 'cada opção do cardápio traz fits e available');
select is((select (o->>'fare_cents')::int from t206b,jsonb_array_elements(data->'options') o where k='menu' and o->>'code'='van'),2130,'a alternativa vem com o próprio preço');
select is(public.ride_class_menu(pg_temp.id('r5'),null,'{"seats":2,"luggage":5,"pets":false,"electric":false,"priority":false}'),(select data from t206b where k='menu'),
 'repetir a consulta devolve o mesmo cardápio');
select is(public.ride_class_menu(pg_temp.id('r5'),null,'{}')->>'alternative',null,'sem necessidade informada tudo cabe e não há alternativa');
select is((select count(*)::int from jsonb_array_elements(public.ride_class_menu(pg_temp.id('r5'),null,null)->'options') o where (o->>'fits')::boolean),6,
 'necessidade nula equivale a nenhuma necessidade');
select is(public.ride_class_menu(pg_temp.id('r5'),null,'{"seats":12}'),jsonb_build_object('options',public.ride_class_menu(pg_temp.id('r5'),null,'{"seats":12}')->'options','alternative',null),
 'quando nada cabe não há alternativa');
select is((select count(*)::int from jsonb_array_elements(public.ride_class_menu(pg_temp.id('r5'),null,'{"seats":12}')->'options') o where (o->>'fits')::boolean),0,
 'doze passageiros não cabem em nenhuma classe');
select is(public.ride_class_menu(pg_temp.id('r5'),null,'{"pets":true}')->>'alternative','pet','animal doméstico informado indica a classe com animal');
select is(public.ride_class_menu(pg_temp.id('r5'),null,'{"electric":true}')->>'alternative','eletrico','preferência por elétrico indica a classe elétrica');
select is(public.ride_class_menu(pg_temp.id('r5'),null,'{"priority":true}')->>'alternative','prioridade',
 'prioridade pedida indica a classe prioritária, mesmo sem oferta agora');
select is((select (o->>'available')::boolean from jsonb_array_elements(public.ride_class_menu(pg_temp.id('r5'),null,'{"priority":true}')->'options') o where o->>'code'='prioridade'),false,
 'a alternativa sem oferta vem marcada como indisponível');
select throws_ok($$select public.ride_class_menu(pg_temp.id('r5'),null,'{"seats":0}')$$,'P0001','invalid_input','zero passageiros é entrada inválida');
select throws_ok($$select public.ride_class_menu(pg_temp.id('r5'),null,'{"luggage":13}')$$,'P0001','invalid_input','bagagem acima do limite é entrada inválida');
select throws_ok($$select public.ride_class_menu(pg_temp.id('r5'),null,'{"seats":"dois"}')$$,'P0001','invalid_input','quantidade em texto é entrada inválida');
select throws_ok($$select public.ride_class_menu(pg_temp.id('r5'),null,'{"pets":"sim"}')$$,'P0001','invalid_input','opção que não é booleana é entrada inválida');
select throws_ok($$select public.ride_class_menu(pg_temp.id('r5'),null,'[]')$$,'P0001','invalid_input','necessidade que não é objeto é entrada inválida');
select throws_ok($$select public.ride_class_menu(gen_random_uuid(),null,'{}')$$,'P0001','route_unavailable','rota inexistente não tem cardápio');
select tests.clear_authentication();
select is((select jsonb_build_array((select count(*) from private.ride_quotes),(select count(*) from private.ride_route_preferences),(select count(*) from public.rides),(select count(*) from public.audit_log))),
 (select jsonb_build_array(quotes,prefs,rides,audits) from n206b),'consultar o cardápio não cria cotação, preferência, corrida nem auditoria');
select is((select provolatile::text from pg_proc where oid='public.ride_class_menu(uuid,timestamptz,jsonb)'::regprocedure),'s','o cardápio é função estável: o banco impede escrita');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote(pg_temp.key('q5-sem-classe'),null,null,jsonb_build_array(jsonb_build_object('route_id',pg_temp.id('r5'),
 'origin','Saúde','destination','Jabaquara','payer','passenger')))$$,'P0001','ride_class_required','sem escolher a alternativa não existe cotação');
select lives_ok($$select public.ride_choose_class(pg_temp.id('r5'),'van',null)$$,'a passageira escolhe a alternativa indicada');
insert into t206b(k,id) values('q5',(public.ride_quote(pg_temp.key('q5'),null,null,jsonb_build_array(jsonb_build_object('route_id',pg_temp.id('r5'),
 'origin','Saúde','destination','Jabaquara','payer','passenger')))->>'id')::uuid);
select tests.clear_authentication();
select is((select jsonb_build_array(status,total_cents,legs#>>'{0,class_code}',legs#>'{0,driver_cents}') from private.ride_quotes where id=pg_temp.id('q5')),
 '["awaiting_consent",2130,"van",1917]'::jsonb,'a cotação da alternativa aguarda o aceite, com preço e remuneração próprios');
select is((select count(*)::int from public.rides where quote_id=pg_temp.id('q5')),0,'antes do aceite não há corrida');
select ok(private.ride_quote_has_mode(pg_temp.id('q5'),'van'),'a classe van carrega a modalidade van na cotação');
select tests.authenticate_as('client_a');
insert into t206b(k,id) values('ride5',(public.ride_consent(pg_temp.id('q5'),true)->>'ride_id')::uuid);
select tests.clear_authentication();
insert into t206b(k,id) select 'leg5',id from public.ride_legs where ride_id=pg_temp.id('ride5');
select is((select jsonb_build_array(fare_cents,fee_cents,driver_cents) from public.ride_legs where id=pg_temp.id('leg5')),'[2130,213,1917]'::jsonb,
 'depois do aceite o trecho da alternativa existe com o preço consentido');
select ok(private.ride_leg_has_mode(pg_temp.id('leg5'),'van'),'o trecho congela a modalidade van');
select is(pg_temp.offered('leg5'),array[tests.uid('provider_d')],'só a minivan vistoriada recebe a oferta da van');
select ok(not pg_temp.eligible('provider_c','leg5') and pg_temp.eligible('provider_d','leg5'),'um SUV não é elegível para o trecho de van');
select is((select count(*)::int from private.ride_quote_modes where quote_id in (pg_temp.id('q1'),pg_temp.id('q3'),pg_temp.id('q4'))),0,
 'classes de carro não ganham linha de modalidade: o carro base segue os portões do O16');
-- A classe van depende da autorização da modalidade até o fim previsto do trecho.
update private.ride_market_modalities set valid_until=now()+interval '5 minutes' where environment='simulation' and modality='van';
select tests.authenticate_as('client_a');
select is(pg_temp.flags(public.ride_class_options(pg_temp.id('r6'),null))->'van','false'::jsonb,'autorização da van que vence antes do fim do trecho tira a oferta da classe');
select is(pg_temp.flags(public.ride_class_options(pg_temp.id('r6'),null))->'padrao','true'::jsonb,'o vencimento da van não afeta as classes de carro');
select throws_ok($$select public.ride_choose_class(pg_temp.id('r6'),'van',null)$$,'P0001','ride_modality_unavailable','sem autorização vigente a classe van não pode ser escolhida');
select tests.clear_authentication();
select ok(not pg_temp.eligible('provider_d','leg5'),'o trecho de van cuja autorização venceu sai do despacho');
update private.ride_market_modalities set valid_until='infinity' where environment='simulation' and modality='van';
-- Classe escolhida e depois alterada na tabela: a cotação exige nova escolha.
select tests.authenticate_as('client_a');
select public.ride_choose_class(pg_temp.id('r6'),'eletrico',null);
select tests.clear_authentication();
update private.ride_class_policies set luggage=1 where environment='simulation' and area='Saúde' and code='eletrico';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote(pg_temp.key('q6-antiga'),null,null,jsonb_build_array(jsonb_build_object('route_id',pg_temp.id('r6'),
 'origin','Saúde','destination','Jabaquara','payer','passenger')))$$,'P0001','requote_required','característica alterada depois da escolha exige nova escolha da classe');
select tests.clear_authentication();
update private.ride_class_policies set luggage=0 where environment='simulation' and area='Saúde' and code='eletrico';

-- Prioridade: o preço é a sobretaxa da classe (dentro da base da tarifa) e o benefício é o
-- limite da estimativa de chegada na cotação; fora do limite, a classe é recusada.
select tests.authenticate_as('client_a');
select is(pg_temp.flags(public.ride_class_options(pg_temp.id('r7'),null))->'prioridade','false'::jsonb,'chegada estimada de 5 min não cumpre o limite de 3 min da prioridade');
select throws_ok($$select public.ride_choose_class(pg_temp.id('r7'),'prioridade',null)$$,'P0001','offer_unavailable','prioridade fora do limite é recusada, sem promessa');
select tests.clear_authentication();
update private.ride_class_policies set priority_wait_minutes=5 where environment='simulation' and area='Saúde' and code='prioridade';
select tests.authenticate_as('client_a');
select is((select jsonb_build_array(o->'available',o->'approach_minutes',o->'priority_wait_minutes',o->'fare_cents') from jsonb_array_elements(public.ride_class_options(pg_temp.id('r7'),null)) o
   where o->>'code'='prioridade'),'[true,5,5,1630]'::jsonb,'com a chegada dentro do limite a prioridade fica disponível e informa o limite');
select is(pg_temp.flags(public.ride_class_options(pg_temp.id('r7'),now()+interval '1 hour'))->'prioridade','true'::jsonb,
 'em horário agendado o limite vale para o deslocamento estimado até o embarque');
-- O limite também conta da partida pedida (revisão, achado 20): com os turnos começando só
-- daqui a 4 minutos, o deslocamento de 5 cabe no limite de 5, mas a chegada fica em 9.
select tests.clear_authentication();
create temp table shifts206b as select id,period from private.ride_driver_shifts;
update private.ride_driver_shifts set period=tstzrange(now()+interval '4 minutes',upper(period));
select tests.authenticate_as('client_a');
select is((select jsonb_build_array(f->'prioridade',f->'padrao') from (select pg_temp.flags(public.ride_class_options(pg_temp.id('r7'),null)) f) x),'[false,true]'::jsonb,
 'achado 20: chegada fora do limite contado da partida tira a prioridade, e a classe comum do mesmo veículo segue disponível');
select throws_ok($$select public.ride_choose_class(pg_temp.id('r7'),'prioridade',null)$$,'P0001','offer_unavailable','achado 20: e a escolha da prioridade é recusada');
select tests.clear_authentication();
update private.ride_driver_shifts s set period=x.period from shifts206b x where x.id=s.id;
select tests.authenticate_as('client_a');
select public.ride_choose_class(pg_temp.id('r7'),'prioridade',null);
insert into t206b(k,id) values('q7',(public.ride_quote(pg_temp.key('q7'),null,null,jsonb_build_array(jsonb_build_object('route_id',pg_temp.id('r7'),
 'origin','Saúde','destination','Jabaquara','payer','passenger')))->>'id')::uuid);
select tests.clear_authentication();
select is((select jsonb_build_array(total_cents,legs#>'{0,fee_cents}',legs#>'{0,driver_cents}',legs#>'{0,approach_minutes}') from private.ride_quotes where id=pg_temp.id('q7')),
 '[1630,163,1467,5]'::jsonb,'a sobretaxa da prioridade entra na base: o motorista recebe 90% dela e a estimativa fica congelada');
select is((select priority_wait_minutes::int from private.ride_route_preferences where route_id=pg_temp.id('r7')),5,'a preferência congela o limite de chegada aceito');
update private.ride_class_policies set priority_wait_minutes=4 where environment='simulation' and area='Saúde' and code='prioridade';
select tests.authenticate_as('client_a');
select is(pg_temp.flags(public.ride_class_options(pg_temp.id('r8'),null))->'prioridade','false'::jsonb,'limite apertado depois: uma nova consulta já não oferece a prioridade');
select is(public.ride_consent(pg_temp.id('q7'),true)->>'status','requested','a cotação aceita vale com o limite conferido quando foi cotada');
select tests.clear_authentication();
select is((select jsonb_build_array(fare_cents,fee_cents,driver_cents) from public.ride_legs where source_quote_id=pg_temp.id('q7')),'[1630,163,1467]'::jsonb,
 'o trecho prioritário nasce com o preço e a remuneração aceitos');

-- Alteração de rota consentida: a rota nova herda as características congeladas da classe.
select tests.authenticate_as('client_a');
insert into t206b(k,id) values('mudanca',(public.ride_propose_amendment(pg_temp.id('leg4'),pg_temp.id('r9'),pg_temp.key('mudanca4'),now()+interval '1 hour')->>'id')::uuid);
select is(public.ride_decide_amendment(pg_temp.id('mudanca'),true)->>'status','applied','a passageira aprova a alteração de rota do pedido com animal doméstico');
select tests.clear_authentication();
select is((select route_case_id from public.ride_legs where id=pg_temp.id('leg4')),pg_temp.id('r9'),'o trecho passa a usar a rota alterada');
select is((select jsonb_build_array(class_code,seats,luggage,standard,electric,pets,priority_wait_minutes,modality) from private.ride_route_preferences where route_id=pg_temp.id('r9')),
 '["pet",3,0,"standard",false,true,null,"car"]'::jsonb,'a rota alterada herda as características da classe aceita');
select ok(pg_temp.eligible('provider_c','leg4') and not pg_temp.eligible('provider_d','leg4'),
 'depois da alteração o pedido continua restrito ao veículo preparado para animal doméstico');

-- C2.7 · Sem característica pedida, a classe se comporta como na etapa 1 (201_passenger_journeys roda inalterado).
select is((select count(*)::int from pg_trigger where tgrelid='private.ride_quotes'::regclass and tgname='ride_01_passenger_class_price'
   and tgfoid='private.freeze_passenger_class()'::regprocedure),1,'o gatilho de preço da etapa 1 continua ligado à mesma função');
select is((select count(*)::int from pg_trigger where tgrelid='public.ride_legs'::regclass and tgname in ('ride_class_when_requested','ride_class_when_travelling')
   and tgfoid='private.require_ride_class_capacity()'::regprocedure),2,'os gatilhos de capacidade da etapa 1 continuam ligados à mesma função');
insert into private.ride_class_policies values('simulation','Saúde','etapa1','Etapa 1',330,3,false,false,now()+interval '1 day','ficticio-206b');
select is((select jsonb_build_array(luggage,standard,electric,pets,priority_wait_minutes,modality) from private.ride_class_policies where area='Saúde' and code='etapa1'),
 '[0,"standard",false,false,null,"car"]'::jsonb,'uma classe criada no formato da etapa 1 não exige característica nova');
select is((select jsonb_build_array(private.ride_capacity_estimate(c,now(),a),private.ride_capacity_estimate(c,now(),a.seats,a.tools,a.accessible))
   from private.ride_route_cases c,private.ride_class_policies a where c.id=pg_temp.id('r8') and a.area='Saúde' and a.code='etapa1'),'[5,5]'::jsonb,
 'sem característica pedida a estimativa da classe coincide com a da etapa 1');
select * from finish();
rollback;
