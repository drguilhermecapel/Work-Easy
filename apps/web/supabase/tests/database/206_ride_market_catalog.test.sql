-- O17 etapa 6 · Catálogo de mercado e de modalidades (C1). Só dados fictícios, dentro
-- desta transação. Cada bloco cita o aceite do O17 ou o item da especificação que cobre.
begin;
select no_plan();
select tests.setup_fixture();
create function pg_temp.key(k text) returns uuid language sql immutable as $$select md5('206'||k)::uuid$$;
create function pg_temp.nonop() returns text[] language sql immutable as
 $$select array['taxi','moto','shared','route_share','transit_info','transit_ticket','bike','scooter','boat','rental','autonomous']$$;
create function pg_temp.stage6() returns text[] language sql immutable as
 $$select array['assist','wav','reserve','airport','van','shuttle_seat','hourly','intercity']$$;
create temp table t206(k text primary key,id uuid,data jsonb);
grant all on t206 to authenticated;

-- Sementes: inventário nos dois ambientes, piloto fictício só no ensaio, nada habilitado ao vivo.
select is((select count(*)::int from private.ride_modalities),20,'vinte modalidades no catálogo');
select is((select array_agg(code order by position) from private.ride_modalities where operational),
 array['car','assist','wav','reserve','airport','van','shuttle_seat','hourly','intercity'],'nove modalidades têm fluxo operacional');
select is((select array_agg(code order by position) from private.ride_modalities where not operational),pg_temp.nonop(),
 'onze modalidades existem somente como catálogo');
select is((select count(*)::int from private.ride_market_modalities where source_url ~ '^https://' and consulted_on=date '2026-11-27'),40,
 'cada modalidade tem fonte pública e data de consulta 27/11/2026 nos dois ambientes');
select is((select count(*)::int from private.ride_market_modalities where environment='live' and (status<>'inventory' or authorization_ref is not null or valid_until is not null)),0,
 'ao vivo não há linha de piloto nem de autorização');
select is((select array_agg(a.modality order by m.position) from private.ride_market_modalities a join private.ride_modalities m on m.code=a.modality
   where a.environment='simulation' and a.status<>'inventory'),
 array['car','assist','wav','reserve','airport','van','shuttle_seat','hourly','intercity'],'no ensaio só as modalidades operacionais têm piloto');
select is((select count(*)::int from private.ride_market_modalities where status<>'inventory' and authorization_ref is distinct from 'ficticio-o17-e6'),0,
 'todo piloto semeado usa a referência fictícia ficticio-o17-e6');
select is((select count(*)::int from private.ride_markets where language='pt-BR' and currency='BRL' and minor_unit=2 and timezone='America/Sao_Paulo' and city='São Paulo'),2,
 'a praça de São Paulo existe no ensaio e ao vivo');
select is((select count(*)::int from private.ride_market_areas where environment='live'),0,'nenhuma área ao vivo foi semeada');
select throws_ok($$update private.ride_modalities set operational=true,flow='taxi' where code='taxi'$$,'23514',null,
 'uma edição de dados não dá fluxo operacional ao táxi');
select throws_ok($$update private.ride_market_modalities set status='pilot' where environment='live' and modality='reserve'$$,'23514',null,
 'piloto ou autorização exige referência e validade');
select throws_ok($$insert into private.ride_markets values('simulation','teste','BR','Teste','pt-BR','BRL',2,'America/Cidade_Inexistente')$$,'P0001','invalid_input',
 'o fuso precisa existir na base IANA');

-- Permissões (negativos).
select tests.authenticate_anon();
select throws_ok($$select public.ride_market_catalog()$$,'42501',null,'visitante anônimo não consulta o catálogo');
select throws_ok($$select public.ride_request_modality('car','Saúde','Jabaquara')$$,'42501',null,'visitante anônimo não passa pela porta de modalidades');
select tests.authenticate_service();
select throws_ok($$select public.ride_market_catalog()$$,'42501',null,'a chave de serviço não chama o catálogo de pessoa');
select tests.authenticate_as('client_a');
select throws_ok($$select private.ride_modality_allowed('simulation','reserve','Saúde','Jabaquara',now())$$,'42501',null,'cliente não executa o portão privado');
select throws_ok($$select private.ride_attach_quote_mode(gen_random_uuid(),'reserve')$$,'42501',null,'cliente não anexa modalidade a uma cotação');
select throws_ok($$select * from private.ride_market_modalities$$,'42501',null,'cliente não lê a tabela de autorizações');
select throws_ok($$select * from private.ride_leg_modes$$,'42501',null,'cliente não lê as modalidades dos trechos');
select tests.clear_authentication();
select is((select count(*)::int from pg_proc p where p.pronamespace='private'::regnamespace
   and p.proname in ('check_ride_market','ride_market_for','ride_modality_issue','ride_modality_allowed','require_ride_modality','ride_attach_quote_mode',
     'ride_quote_has_mode','ride_leg_has_mode','ride_leg_mode_issue','check_ride_leg_mode','freeze_ride_leg_mode','ride_mode_frozen','ride_before_catalog_eligible','ride_offer_eligible')
   and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))),0,
 'nenhum auxiliar ou gatilho privado do catálogo é executável pelas funções da API');

-- AO VIVO (antes de existir motorista ou cotação nesta transação).
update private.ride_deployment set environment='live';
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true,monetization_enabled=true where environment='live';
insert into private.ride_area_authorizations(area,legal_ref,privacy_ref,ops_ref,until_at,quote_enabled,dispatch_enabled,monetization_enabled)
 select a,'TEST-206','TEST-206','TEST-206',now()+interval '2 days',true,true,true from unnest(array['Saúde','Jabaquara']) a;
select tests.authenticate_as('client_a');
insert into t206(k,data) values('live',public.ride_market_catalog('Saúde','Jabaquara',null));
-- C1.2 · Ao vivo, toda modalidade da etapa 6 fica indisponível.
select is((select data->>'environment' from t206 where k='live'),'live','o catálogo identifica o ambiente ao vivo');
select is((select array_agg(m->>'code' order by ord) from t206,jsonb_array_elements(data->'modalities') with ordinality e(m,ord) where k='live' and (m->>'available')::boolean),
 array['car'],'ao vivo só o carro base responde disponível, pelos portões do O16');
select is((select count(*)::int from t206,jsonb_array_elements(data->'modalities') m where k='live' and m->>'code'<>'car'
   and not (m->>'available')::boolean and m->>'status'='inventory' and m->>'reason'='not_authorized'),19,
 'ao vivo as 19 modalidades da etapa 6 estão em inventário, indisponíveis e sem autorização');
select is((select count(*)::int from jsonb_array_elements(public.ride_market_catalog()->'modalities') m where m->>'code'<>'car' and (m->>'available')::boolean),0,
 'ao vivo, sem corredor informado, nenhuma modalidade da etapa 6 está disponível');
-- C1.3 · A porta recusa cada código sem fluxo operacional (ao vivo).
select throws_ok(format($$select public.ride_request_modality(%L,'Saúde','Jabaquara')$$,c),'P0001','ride_modality_unavailable',
 'ao vivo: a porta recusa '||c) from unnest(pg_temp.nonop()) c;
select throws_ok(format($$select public.ride_request_modality(%L,'Saúde','Jabaquara')$$,c),'P0001','ride_modality_unavailable',
 'ao vivo: sem autorização a porta recusa '||c) from unnest(pg_temp.stage6()) c;
select is(public.ride_request_modality('car','Saúde','Jabaquara')->>'flow','quote','ao vivo o carro base não passa por segundo portão');
select tests.clear_authentication();
-- Uma linha de piloto não abre nada ao vivo; só autorização vigente com área na praça abre.
update private.ride_market_modalities set status='pilot',authorization_ref='TEST-206',valid_until=now()+interval '1 day' where environment='live' and modality in ('reserve','taxi');
insert into private.ride_market_areas(environment,market,area) values('live','sao-paulo','Saúde'),('live','sao-paulo','Jabaquara');
select is(private.ride_modality_allowed('live','reserve','Saúde','Jabaquara',now()+interval '1 hour'),false,'ao vivo um piloto não abre o portão');
update private.ride_market_modalities set status='authorized' where environment='live' and modality in ('reserve','taxi');
select is(private.ride_modality_allowed('live','reserve','Saúde','Jabaquara',now()+interval '1 hour'),true,'ao vivo só a autorização vigente abre a modalidade operacional');
select is(private.ride_modality_allowed('live','reserve','Saúde','Jabaquara',now()+interval '3 days'),false,
 'ao vivo a autorização que vence antes do fim do trecho fecha o portão');
select is(private.ride_modality_allowed('live','airport','Saúde','Jabaquara',now()+interval '1 hour'),false,'autorizar a reserva não habilita aeroporto');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_request_modality('taxi','Saúde','Jabaquara')$$,'P0001','ride_modality_unavailable',
 'ao vivo: táxi marcado como autorizado continua recusado, pois não tem fluxo operacional');
select tests.clear_authentication();
update private.ride_deployment set environment='simulation';

-- ENSAIO.
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
update private.ride_dispatch_rules set wave_size=1 where environment='simulation';
insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,valid_until,evidence_ref)
 values('simulation','Saúde','conforto','Conforto',300,4,now()+interval '1 day','TEST-206'),
 ('simulation','Saúde','vencida','Vencida',100,4,now()-interval '1 minute','TEST-206');
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity)
 values('simulation','Saúde','Jabaquara','pix','TEST-206',tstzrange(now()-interval '1 hour',now()+interval '1 day')),
 ('simulation','Jabaquara','Saúde','cash','TEST-206',tstzrange(now()-interval '1 hour',now()+interval '1 day')),
 ('simulation','Saúde','Jabaquara','tips','TEST-206',tstzrange(now()-interval '1 hour',now()+interval '1 day'));
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_c'),'simulation','sedan','approved',(now() at time zone 'America/Sao_Paulo')::date+5,tests.uid('admin'),true);
insert into private.ride_vehicle_capacity(driver_id,vehicle,document_ref,seats,valid_until) values(tests.uid('provider_c'),'sedan','TEST-206',4,now()+interval '1 day');
create temp table counts206 as select
 (select count(*) from private.ride_markets)+(select count(*) from private.ride_market_areas)+(select count(*) from private.ride_modalities)
 +(select count(*) from private.ride_market_modalities)+(select count(*) from private.ride_quote_modes)+(select count(*) from private.ride_leg_modes)
 +(select count(*) from private.ride_place_history)+(select count(*) from private.ride_route_cases)+(select count(*) from private.ride_route_points)
 +(select count(*) from private.ride_observations)+(select count(*) from private.ride_quotes)+(select count(*) from public.audit_log) as n;

select tests.authenticate_as('client_a');
insert into t206(k,data) values('sim',public.ride_market_catalog('Saúde','Jabaquara',null));
-- C1.1 · Contrato "Catálogo de mercado": idioma, moeda, fuso IANA, portões separados, classes e meios de pagamento.
select is((select data->>'language' from t206 where k='sim'),'pt-BR','o catálogo devolve o idioma pt-BR');
select is((select data->>'currency' from t206 where k='sim'),'BRL','o catálogo devolve a moeda BRL');
select is((select (data->>'minor_unit')::int from t206 where k='sim'),2,'valores em centavos (unidade mínima 2)');
select is((select data->>'timezone' from t206 where k='sim'),'America/Sao_Paulo','o catálogo devolve o fuso IANA America/Sao_Paulo');
select is((select data->'gates' from t206 where k='sim'),'{"module":true,"quote":true,"dispatch":true,"monetization":false}'::jsonb,
 'módulo, cotação, despacho e monetização vêm separados');
select is((select jsonb_agg(c->>'code') from t206,jsonb_array_elements(data->'classes') c where k='sim'),'["conforto"]'::jsonb,'só a classe vigente da origem aparece');
select ok((select (data#>>'{classes,0,seats}')::int=4 and data#>>'{classes,0,label}'='Conforto' and (data#>>'{classes,0,surcharge_cents}')::int=300
   and not (data#>'{classes,0}' ? 'evidence_ref') from t206 where k='sim'),'a classe traz capacidade e preço, sem a referência interna');
select is((select data->'vehicles' from t206 where k='sim'),'[{"category":"sedan","seats":4}]'::jsonb,'veículos com capacidade documentada e vigente');
select is((select jsonb_agg(m->>'method') from t206,jsonb_array_elements(data->'methods') m where k='sim'),'["pix"]'::jsonb,
 'só o meio de pagamento vigente do corredor aparece (gorjeta e outro sentido ficam fora)');
select is((select data->'roles' from t206 where k='sim'),'["passenger"]'::jsonb,'o papel vem da sessão no servidor');
select is((select count(*)::int from t206,jsonb_array_elements(data->'modalities') m where k='sim'
   and m ?& array['code','par','status','available','reason','source','consulted_on'] and m->>'source' ~ '^https://' and m->>'consulted_on'='2026-11-27'),20,
 'cada modalidade traz código, PAR, estado, disponibilidade, motivo, fonte e data de consulta');
select is((select array_agg(m->>'code' order by ord) from t206,jsonb_array_elements(data->'modalities') with ordinality e(m,ord) where k='sim' and (m->>'available')::boolean),
 array['car','assist','wav','reserve','airport','van','shuttle_seat','hourly','intercity'],'no ensaio as nove modalidades operacionais ficam disponíveis');
select is((select count(*)::int from t206,jsonb_array_elements(data->'modalities') m where k='sim' and m->>'code'=any(pg_temp.nonop())
   and not (m->>'available')::boolean and m->>'status'='inventory'),11,'no ensaio as onze modalidades só de catálogo ficam indisponíveis');
select ok((select data::text !~ 'infinity' from t206 where k='sim'),'validade sem fim não vaza como texto "infinity"');
-- C1.8 · O catálogo não grava nada nem guarda localização.
select ok((select data::text !~* '"(lat|lng|latitude|longitude|point|origin_point)"' from t206 where k='sim'),'a resposta não contém coordenadas');
select tests.authenticate_as('provider_c');
select is(public.ride_market_catalog()->'roles','["passenger", "driver"]'::jsonb,'motorista aprovado recebe também o papel de motorista');
select tests.authenticate_as('client_a');
select is(public.ride_market_catalog('Saúde','Jabaquara',null)-'at',(select data-'at' from t206 where k='sim'),'repetir a consulta devolve o mesmo catálogo');
select tests.clear_authentication();
select is((select (select count(*) from private.ride_markets)+(select count(*) from private.ride_market_areas)+(select count(*) from private.ride_modalities)
 +(select count(*) from private.ride_market_modalities)+(select count(*) from private.ride_quote_modes)+(select count(*) from private.ride_leg_modes)
 +(select count(*) from private.ride_place_history)+(select count(*) from private.ride_route_cases)+(select count(*) from private.ride_route_points)
 +(select count(*) from private.ride_observations)+(select count(*) from private.ride_quotes)+(select count(*) from public.audit_log)),(select n from counts206),
 'consultar o catálogo e a porta não grava linha alguma (catálogo, locais, rotas, posições, cotações, auditoria)');
select is((select array_agg(provolatile::text order by proname) from pg_proc where oid in
   ('public.ride_market_catalog(text,text,timestamptz)'::regprocedure,'public.ride_request_modality(text,text,text,timestamptz)'::regprocedure)),
 array['s','s'],'catálogo e porta são funções estáveis: o banco impede qualquer escrita');
select is(pg_get_function_identity_arguments('public.ride_market_catalog(text,text,timestamptz)'::regprocedure),
 'p_origin text, p_destination text, p_at timestamp with time zone','o catálogo recebe rótulos de área e horário, nunca uma posição');

-- C1.3 · A porta recusa cada código sem fluxo operacional (ensaio) e devolve o fluxo dos operacionais.
select tests.authenticate_as('client_a');
select throws_ok(format($$select public.ride_request_modality(%L,'Saúde','Jabaquara')$$,c),'P0001','ride_modality_unavailable',
 'ensaio: a porta recusa '||c) from unnest(pg_temp.nonop()) c;
select is((select jsonb_object_agg(c,public.ride_request_modality(c,'Saúde','Jabaquara')->>'flow') from unnest(array['car']||pg_temp.stage6()) c),
 '{"car":"quote","assist":"access","wav":"access","reserve":"reserve","airport":"airport","van":"class","shuttle_seat":"shuttle","hourly":"block","intercity":"intercity"}'::jsonb,
 'ensaio: a porta devolve o fluxo de cada modalidade operacional');
select is(public.ride_request_modality('reserve','Saúde','Jabaquara'),public.ride_request_modality('reserve','Saúde','Jabaquara'),'repetir o pedido à porta devolve a mesma resposta');
select throws_ok($$select public.ride_request_modality('helicoptero','Saúde','Jabaquara')$$,'P0001','ride_modality_unavailable','código desconhecido é recusado');
select throws_ok($$select public.ride_request_modality(null,'Saúde','Jabaquara')$$,'P0001','invalid_input','modalidade nula é entrada inválida');
select throws_ok($$select public.ride_request_modality('reserve','Saúde',null)$$,'P0001','ride_modality_unavailable','sem corredor completo não há modalidade');
select throws_ok($$select public.ride_request_modality('reserve','Saúde','Bairro fora da praça')$$,'P0001','ride_modality_unavailable','destino fora da praça é recusado');
select is(public.ride_request_modality('intercity','Saúde','Município vizinho (ensaio)')->>'flow','intercity',
 'entre municípios o destino fica fora da praça: o corredor é conferido pelo fluxo próprio');
select throws_ok($$select public.ride_request_modality('intercity','Município vizinho (ensaio)','Saúde')$$,'P0001','ride_modality_unavailable','a origem precisa estar na praça');
select tests.clear_authentication();
update public.profiles set deleted_at=now() where id=tests.uid('provider_e');
select tests.authenticate_as('provider_e');
select throws_ok($$select public.ride_market_catalog()$$,'P0001','not_allowed','conta encerrada não consulta o catálogo');
select throws_ok($$select public.ride_request_modality('car','Saúde','Jabaquara')$$,'P0001','not_allowed','conta encerrada não passa pela porta');
select tests.clear_authentication();

-- C1.4 · Placar por praça: a prova de táxi não habilita moto do mesmo PAR-603.
update private.ride_market_modalities set status='authorized',authorization_ref='TEST-206-TAXI',valid_until=now()+interval '1 day'
 where environment='simulation' and modality='taxi';
select is((select status from private.ride_market_modalities where environment='simulation' and modality='moto'),'inventory','autorizar o táxi deixa a moto em inventário');
select is(private.ride_modality_allowed('simulation','moto','Saúde','Jabaquara',now()),false,'o portão da moto segue fechado');
select is(private.ride_modality_allowed('simulation','taxi','Saúde','Jabaquara',now()),false,'o portão do táxi segue fechado: não há fluxo operacional');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_request_modality('taxi','Saúde','Jabaquara')$$,'P0001','ride_modality_unavailable','táxi autorizado no cadastro continua recusado pela porta');
select throws_ok($$select public.ride_request_modality('moto','Saúde','Jabaquara')$$,'P0001','ride_modality_unavailable','moto continua recusada');
insert into t206(k,data) values('taxi',public.ride_market_catalog('Saúde','Jabaquara',null));
select is((select jsonb_object_agg(m->>'code',jsonb_build_array(m->>'status',m->'available',m->>'reason')) from t206,jsonb_array_elements(data->'modalities') m
   where k='taxi' and m->>'code' in ('taxi','moto')),
 '{"taxi":["authorized",false,"no_operational_flow"],"moto":["inventory",false,"not_authorized"]}'::jsonb,
 'o catálogo distingue os motivos: táxi sem fluxo operacional, moto sem autorização');
select tests.clear_authentication();

-- C1.5 · PAR-607: consultar informação de linhas não habilita a venda de bilhete.
update private.ride_market_modalities set status='authorized',authorization_ref='TEST-206-LINHAS',valid_until=now()+interval '1 day'
 where environment='simulation' and modality='transit_info';
select is((select status from private.ride_market_modalities where environment='simulation' and modality='transit_ticket'),'inventory','o bilhete continua em inventário');
select is(private.ride_modality_allowed('simulation','transit_ticket','Saúde','Jabaquara',now()),false,'o portão do bilhete segue fechado');
select tests.authenticate_as('client_a');
select is((select jsonb_object_agg(m->>'code',jsonb_build_array(m->>'status',m->'available',m->>'reason')) from jsonb_array_elements(public.ride_market_catalog()->'modalities') m
   where m->>'code' in ('transit_info','transit_ticket')),
 '{"transit_info":["authorized",false,"no_operational_flow"],"transit_ticket":["inventory",false,"not_authorized"]}'::jsonb,
 'informação consultável não vira bilhete disponível');
select throws_ok($$select public.ride_request_modality('transit_ticket','Saúde','Jabaquara')$$,'P0001','ride_modality_unavailable','a venda de bilhete é recusada');
select throws_ok($$select public.ride_request_modality('transit_info','Saúde','Jabaquara')$$,'P0001','ride_modality_unavailable','a informação de linhas também não abre fluxo de corrida');
select tests.clear_authentication();

-- C1.6 · Validade vencida ou embarque fora do horário recusam modalidade operacional.
update private.ride_market_modalities set valid_until=now()-interval '1 minute' where environment='simulation' and modality='reserve';
select is(private.ride_modality_issue('simulation','reserve','Saúde','Jabaquara',now()),'authorization_expired','autorização vencida é o motivo');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_request_modality('reserve','Saúde','Jabaquara')$$,'P0001','ride_modality_unavailable','autorização vencida recusa a reserva');
select is((select m->>'reason' from jsonb_array_elements(public.ride_market_catalog()->'modalities') m where m->>'code'='reserve'),'authorization_expired','o catálogo informa a autorização vencida');
select is(public.ride_request_modality('airport','Saúde','Jabaquara')->>'flow','airport','o vencimento da reserva não afeta outra modalidade');
select tests.clear_authentication();
update private.ride_market_modalities set valid_until=now()+interval '10 minutes' where environment='simulation' and modality='reserve';
select is(private.ride_modality_allowed('simulation','reserve','Saúde','Jabaquara',now()+interval '5 minutes'),true,'dentro da validade o portão abre');
select is(private.ride_modality_allowed('simulation','reserve','Saúde','Jabaquara',now()+interval '18 minutes'),false,'autorização que vence antes do fim do trecho fecha o portão');
update private.ride_market_modalities set valid_until='infinity' where environment='simulation' and modality='reserve';
-- Janela diária de uma hora que começa daqui a duas horas (no fuso da praça): agora está fora, daqui a 2h30 está dentro.
update private.ride_market_modalities set open_from=((now() at time zone 'America/Sao_Paulo')::time+interval '2 hours'),
 open_until=((now() at time zone 'America/Sao_Paulo')::time+interval '3 hours') where environment='simulation' and modality='hourly';
select is(private.ride_modality_issue('simulation','hourly','Saúde','Jabaquara',now()+interval '20 minutes',now()),'outside_hours','embarque fora do horário é o motivo');
select is(private.ride_modality_issue('simulation','hourly','Saúde','Jabaquara',now()+interval '170 minutes',now()+interval '150 minutes'),null,'embarque dentro do horário é aceito');
select is(private.ride_modality_allowed('simulation','hourly','Saúde','Jabaquara',now()),false,'sem embarque informado o horário é lido no instante dado');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_request_modality('hourly','Saúde','Jabaquara')$$,'P0001','ride_modality_unavailable','embarque agora, fora do horário, é recusado');
select is(public.ride_request_modality('hourly','Saúde','Jabaquara',now()+interval '150 minutes')->>'flow','block','embarque pretendido dentro do horário é aceito');
select tests.clear_authentication();
update private.ride_market_modalities set open_from=null,open_until=null where environment='simulation' and modality='hourly';

-- C1.7 · O servidor revalida até o fim previsto do trecho: criação, aceite e partida.
select tests.authenticate_as('client_a');
insert into t206(k,id) values('quote',(public.ride_quote(pg_temp.key('q1'),null,null,'[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]')->>'id')::uuid);
select tests.clear_authentication();
select throws_ok($$select private.ride_attach_quote_mode((select id from t206 where k='quote'),'taxi')$$,'P0001','ride_modality_unavailable',
 'táxi autorizado no cadastro não pode ser anexado a uma cotação');
select throws_ok($$select private.ride_attach_quote_mode((select id from t206 where k='quote'),'moto')$$,'P0001','ride_modality_unavailable','moto não pode ser anexada a uma cotação');
select throws_ok($$select private.ride_attach_quote_mode((select id from t206 where k='quote'),'reserve',3)$$,'P0001','invalid_input','trecho inexistente na cotação é entrada inválida');
select lives_ok($$select private.ride_attach_quote_mode((select id from t206 where k='quote'),'reserve')$$,'a reserva é anexada à cotação');
select lives_ok($$select private.ride_attach_quote_mode((select id from t206 where k='quote'),'reserve')$$,'repetir a anexação não falha');
select lives_ok($$select private.ride_attach_quote_mode((select id from t206 where k='quote'),'car')$$,'o carro base não gera linha de modalidade');
select is((select array_agg(modality||':'||seq||':'||authorization_ref) from private.ride_quote_modes where quote_id=(select id from t206 where k='quote')),
 array['reserve:1:ficticio-o17-e6'],'a repetição não duplica: uma linha, com a referência da autorização');
select ok(private.ride_quote_has_mode((select id from t206 where k='quote'),'reserve') and not private.ride_quote_has_mode((select id from t206 where k='quote'),'airport'),
 'a cotação carrega só a modalidade escolhida');
select throws_ok($$update private.ride_quote_modes set modality='airport'$$,'P0001','ride_mode_frozen','a modalidade da cotação não é editável');
-- A autorização passa a vencer antes do fim previsto (o trecho dura 18 minutos).
update private.ride_market_modalities set valid_until=now()+interval '5 minutes' where environment='simulation' and modality='reserve';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_consent((select id from t206 where k='quote'),true)$$,'P0001','ride_modality_unavailable',
 'trecho cuja autorização vence antes do fim previsto é recusado na criação');
select tests.clear_authentication();
select is((select count(*)::int from public.ride_legs where source_quote_id=(select id from t206 where k='quote')),0,'nenhum trecho foi criado, não há promessa');
update private.ride_market_modalities set valid_until='infinity' where environment='simulation' and modality='reserve';
select tests.authenticate_as('client_a');
select is(public.ride_consent((select id from t206 where k='quote'),true)->>'status','requested','com a autorização vigente o trecho é criado');
select is(public.ride_consent((select id from t206 where k='quote'),true)->>'status','requested','repetir o aceite devolve o mesmo resultado');
select tests.clear_authentication();
insert into t206(k,id) select 'leg',id from public.ride_legs where source_quote_id=(select id from t206 where k='quote');
select is((select array_agg(modality||':'||authorization_ref||':'||(quote_id=(select id from t206 where k='quote'))) from private.ride_leg_modes where leg_id=(select id from t206 where k='leg')),
 array['reserve:ficticio-o17-e6:true'],'a modalidade fica congelada no trecho, uma única vez');
select ok(private.ride_leg_has_mode((select id from t206 where k='leg'),'reserve'),'o trecho carrega a reserva');
select throws_ok($$update private.ride_leg_modes set modality='airport'$$,'P0001','ride_mode_frozen','a modalidade do trecho não é editável');
select is((select count(*)::int from private.ride_driver_offers where leg_id=(select id from t206 where k='leg') and driver_id=tests.uid('provider_c') and state='offered'),1,
 'o motorista elegível recebe a oferta');
update private.ride_market_modalities set valid_until=now()+interval '5 minutes' where environment='simulation' and modality='reserve';
select is((select private.ride_offer_eligible(tests.uid('provider_c'),l) from public.ride_legs l where l.id=(select id from t206 where k='leg')),false,
 'com a autorização encurtada o trecho deixa de ser elegível para oferta');
select throws_ok($$update public.ride_legs set driver_id=tests.uid('provider_c') where id=(select id from t206 where k='leg')$$,'P0001','ride_modality_unavailable',
 'a atribuição direta é recusada pelo gatilho');
select throws_ok($$update public.ride_legs set slot=tstzrange(lower(slot),upper(slot)+interval '1 hour') where id=(select id from t206 where k='leg')$$,'P0001','ride_modality_unavailable',
 'estender o trecho além da autorização é recusado');
select tests.authenticate_as('provider_c');
select throws_ok($$select public.ride_accept_offer((select id from t206 where k='leg'),pg_temp.key('accept-1'))$$,'P0001','offer_unavailable',
 'o aceite é recusado quando a autorização vence antes do fim previsto');
select tests.clear_authentication();
select is((select status||':'||coalesce(driver_id::text,'sem motorista') from public.ride_legs where id=(select id from t206 where k='leg')),'requested:sem motorista','o trecho segue sem motorista');
update private.ride_market_modalities set valid_until='infinity' where environment='simulation' and modality='reserve';
select tests.authenticate_as('provider_c');
select is(public.ride_accept_offer((select id from t206 where k='leg'),pg_temp.key('accept-2'))->>'status','accepted','com a autorização vigente o motorista aceita');
select is(public.ride_accept_offer((select id from t206 where k='leg'),pg_temp.key('accept-2'))->>'replayed','true','repetir o aceite é idempotente');
select tests.clear_authentication();
-- A autorização é retirada depois do aceite: a partida é recusada, o cancelamento continua possível.
update private.ride_market_modalities set status='inventory',authorization_ref=null,valid_until=null where environment='simulation' and modality='reserve';
select tests.authenticate_as('provider_c');
select throws_ok($$select public.ride_transition((select id from t206 where k='leg'),'arriving',pg_temp.key('arriving-1'))$$,'P0001','ride_modality_unavailable',
 'sem autorização o motorista não inicia o deslocamento');
select tests.authenticate_as('client_a');
select is(public.ride_transition((select id from t206 where k='leg'),'cancelled',pg_temp.key('cancel-1'))->>'status','cancelled','cancelar continua possível sem a autorização');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_leg_modes where leg_id=(select id from t206 where k='leg')),1,'o trecho cancelado conserva a modalidade congelada para auditoria');

-- O carro base não passa por segundo portão: mesmo com a linha de catálogo em inventário, a corrida do O16 segue.
update private.ride_market_modalities set status='inventory',authorization_ref=null,valid_until=null where environment='simulation' and modality='car';
select tests.authenticate_as('client_a');
select is(public.ride_request_modality('car','Saúde','Jabaquara')->>'flow','quote','o carro base segue liberado pelos portões do O16');
insert into t206(k,id) values('car',(public.ride_quote(pg_temp.key('q2'),null,null,'[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]')->>'id')::uuid);
select is(public.ride_consent((select id from t206 where k='car'),true)->>'status','requested','corrida comum é criada sem linha de modalidade');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_leg_modes m join public.ride_legs l on l.id=m.leg_id where l.source_quote_id=(select id from t206 where k='car')),0,
 'o trecho comum não tem modalidade congelada');
insert into t206(k,id) select 'car-leg',id from public.ride_legs where source_quote_id=(select id from t206 where k='car');
select tests.authenticate_as('provider_c');
select is(public.ride_accept_offer((select id from t206 where k='car-leg'),pg_temp.key('accept-car'))->>'status','accepted',
 'o motorista aceita a corrida comum como antes');
select tests.clear_authentication();
-- Modalidade por trecho: só o segundo trecho de um itinerário carrega o aeroporto.
select tests.authenticate_as('client_a');
insert into t206(k,id) values('two',(public.ride_quote(pg_temp.key('q3'),null,null,
 '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"},{"origin":"Jabaquara","destination":"Saúde","payer":"passenger"}]')->>'id')::uuid);
select tests.clear_authentication();
select lives_ok($$select private.ride_attach_quote_mode((select id from t206 where k='two'),'airport',2)$$,'a modalidade pode valer para um só trecho da cotação');
select lives_ok($$select private.ride_attach_quote_mode((select id from t206 where k='two'),'hourly')$$,'outra modalidade vale para todos os trechos');
select is((select array_agg(seq||':'||modality order by seq,modality) from private.ride_quote_modes where quote_id=(select id from t206 where k='two')),
 array['1:hourly','2:airport','2:hourly'],'cada trecho guarda as próprias modalidades');
select tests.authenticate_as('client_a');
select is(public.ride_consent((select id from t206 where k='two'),true)->>'status','requested','o itinerário de dois trechos é criado');
select tests.clear_authentication();
select is((select array_agg(l.seq||':'||m.modality order by l.seq,m.modality) from private.ride_leg_modes m join public.ride_legs l on l.id=m.leg_id
   where l.source_quote_id=(select id from t206 where k='two')),array['1:hourly','2:airport','2:hourly'],'o congelamento respeita o trecho de cada modalidade');
select throws_ok($$select private.ride_attach_quote_mode((select id from t206 where k='two'),'reserve')$$,'P0001','requote_required',
 'depois do aceite não se anexa modalidade nova: é preciso nova cotação');
select lives_ok($$select private.ride_attach_quote_mode((select id from t206 where k='two'),'hourly')$$,'a repetição de uma anexação já feita segue idempotente depois do aceite');
-- Papel: uma autorização só para motoristas não abre o pedido do passageiro.
update private.ride_market_modalities set roles='{driver}' where environment='simulation' and modality='van';
select is(private.ride_modality_issue('simulation','van','Saúde','Jabaquara',now()),'not_authorized','autorização sem o papel de passageiro não vale para o pedido');
update private.ride_market_modalities set roles='{passenger,driver}' where environment='simulation' and modality='van';
select is(private.ride_modality_issue('simulation','van','Saúde','Jabaquara',now()),null,'com o papel de passageiro a van volta a ser aceita');
select lives_ok($$select private.require_ride_modality('shuttle_seat','Saúde','Jabaquara',now()+interval '1 hour')$$,'fluxo sem cotação confere a modalidade pelo auxiliar');
select throws_ok($$select private.require_ride_modality('boat','Saúde','Jabaquara',now()+interval '1 hour')$$,'P0001','ride_modality_unavailable','o auxiliar recusa modalidade sem fluxo');
update private.ride_network set quote_enabled=false where environment='simulation';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_request_modality('car','Saúde','Jabaquara')$$,'P0001','ride_modality_unavailable','com a cotação desligada a porta recusa até o carro base');
select is(public.ride_market_catalog()->'gates','{"module":true,"quote":false,"dispatch":false,"monetization":false}'::jsonb,'o catálogo segue legível e mostra o portão desligado');
select is((select count(*)::int from jsonb_array_elements(public.ride_market_catalog()->'modalities') m where (m->>'available')::boolean),0,'com a cotação desligada nada fica disponível');
select tests.clear_authentication();

select * from finish();
rollback;
