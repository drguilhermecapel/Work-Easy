-- O17 etapa 6 · PAR-602: assistência e veículo acessível (C3). Só dados fictícios, dentro
-- desta transação. Aceite do O17: "Falta de veículo compatível impede promessa de
-- transporte acessível. Evidenciar tempos, preço e atendimento em incidente."
begin;
select no_plan();
select tests.setup_fixture();
select tests.create_user('plantao_602');
insert into public.admins(user_id) values(tests.uid('plantao_602'));
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t602(k text primary key,id uuid,data jsonb);
grant all on t602 to authenticated;
create function pg_temp.id(p text) returns uuid language sql stable as $$select id from t602 where k=p$$;
create function pg_temp.data(p text) returns jsonb language sql stable as $$select data from t602 where k=p$$;
create function pg_temp.key(p text) returns uuid language sql immutable as $$select md5('602'||p)::uuid$$;
create function pg_temp.point(p_lat numeric,p_lng numeric,p_label text) returns jsonb language sql immutable as
 $$select jsonb_build_object('lat',p_lat,'lng',p_lng,'label',p_label)$$;
-- Um trecho medido, pago por quem viaja.
create function pg_temp.trecho(p_route text) returns jsonb language sql stable as
 $$select jsonb_build_array(jsonb_build_object('route_id',pg_temp.id(p_route),'origin','Saúde','destination','Jabaquara','payer','passenger'))$$;
-- Uma chave por assistência, como a resposta da RPC a entrega.
create function pg_temp.opt(p jsonb,p_key text default 'available') returns jsonb language sql immutable as
 $$select jsonb_object_agg(o->>'assistance',o->p_key) from jsonb_array_elements(p->'options') o$$;
grant execute on function pg_temp.id(text),pg_temp.data(text),pg_temp.key(text),pg_temp.point(numeric,numeric,text),pg_temp.trecho(text),pg_temp.opt(jsonb,text) to authenticated;
-- Só a sessão de teste (dona do banco) usa as funções abaixo.
create function pg_temp.eligible(p_driver text,p_leg text) returns boolean language sql stable as
 $$select private.ride_offer_eligible(tests.uid(p_driver),l) from public.ride_legs l where l.id=pg_temp.id(p_leg)$$;
create function pg_temp.offered(p_leg text) returns uuid[] language sql stable as
 $$select coalesce(array_agg(driver_id order by driver_id),'{}') from private.ride_driver_offers where leg_id=pg_temp.id(p_leg) and state='offered'$$;
create function pg_temp.rows602() returns jsonb language sql stable as $$select jsonb_build_array((select count(*) from private.ride_quotes),
 (select count(*) from private.ride_access_quotes),(select count(*) from private.ride_quote_modes),(select count(*) from public.ride_legs))$$;

-- Política fictícia de embarque da origem, explícita para o teste não depender da semente.
insert into private.ride_access_policies(environment,area,assistance,boarding_minutes,evidence_ref,valid_until) values
 ('simulation','Saúde','boarding',3,'ficticio-602',now()+interval '1 day'),('simulation','Saúde','folding_equipment',5,'ficticio-602',now()+interval '1 day'),
 ('simulation','Saúde','wheelchair_vehicle',10,'ficticio-602',now()+interval '1 day'),('simulation','Jabaquara','wheelchair_vehicle',10,'ficticio-602',now()+interval '1 day')
 on conflict(environment,area,assistance) do update set boarding_minutes=excluded.boarding_minutes,evidence_ref=excluded.evidence_ref,valid_until=excluded.valid_until;
select tests.authenticate_as('client_a');
insert into t602(k,id) select 'r'||i,(public.ride_prepare_route(pg_temp.key('rota'||i),null,'Saúde','Jabaquara',
 pg_temp.point(-23.60,-46.64,'Embarque de ensaio'),pg_temp.point(-23.61,-46.65,'Destino de ensaio'),null)->>'id')::uuid from generate_series(1,9) i;
insert into t602(k,id) values('volta',(public.ride_prepare_route(pg_temp.key('volta'),null,'Jabaquara','Saúde',
 pg_temp.point(-23.61,-46.65,'Destino de ensaio'),pg_temp.point(-23.60,-46.64,'Embarque de ensaio'),null)->>'id')::uuid);
select tests.authenticate_as('admin');
select public.ride_claim_route(id),public.ride_verify_route(id,2000,12,'ensaio/602') from t602 where k ~ '^(r[0-9]|volta)$';

-- Três motoristas fictícios em turno: o primeiro terá veículo adaptado, o segundo só
-- capacitação para ajudar no embarque e o terceiro nenhuma capacitação.
select tests.authenticate_as('client_b');
select public.ride_apply_driver('sedan');
select tests.authenticate_as('provider_c');
select public.ride_apply_driver('sedan');
select tests.authenticate_as('provider_d');
select public.ride_apply_driver('sedan');
select tests.clear_authentication();
insert into private.ride_driver_credentials(driver_id,vehicle_identifier,vehicle_category,driver_document_ref,vehicle_document_ref,insurance_ref,driver_until,vehicle_until,insurance_until,inspected_by)
 select tests.uid(u),'ENS-602-'||upper(u),'sedan','DOC-602','VEI-602','SEG-602',private.sp_date(now())+3,private.sp_date(now())+3,private.sp_date(now())+3,tests.uid('admin')
 from unnest(array['client_b','provider_c']) u;
select tests.authenticate_as('admin');
select public.ride_review_driver(tests.uid(u),true,(now() at time zone 'America/Sao_Paulo')::date+3) from unnest(array['client_b','provider_c','provider_d']) u;
select public.ride_validate_capacity(tests.uid('client_b'),1,false,false,now()+interval '1 day','ensaio/602-d1');
select public.ride_validate_capacity(tests.uid('provider_c'),4,false,false,now()+interval '1 day','ensaio/602-d2');
select public.ride_validate_capacity(tests.uid('provider_d'),4,false,false,now()+interval '1 day','ensaio/602-d3');
select tests.authenticate_as('client_b');
select public.ride_configure_shift('Saúde',now(),now()+interval '3 hours');
select public.ride_set_online(true);
select tests.authenticate_as('provider_c');
select public.ride_configure_shift('Saúde',now(),now()+interval '3 hours');
select public.ride_set_online(true);
select tests.authenticate_as('provider_d');
select public.ride_configure_shift('Saúde',now(),now()+interval '3 hours');
select public.ride_set_online(true);

-- Permissões (negativos).
select tests.authenticate_anon();
select throws_ok($$select public.ride_access_options(pg_temp.id('r1'),null)$$,'42501',null,'visitante anônimo não consulta as opções de assistência');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('anon'),null,null,pg_temp.trecho('r1'),'boarding',false)$$,'42501',null,
 'visitante anônimo não pede cotação com assistência');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'ramp','insp-1','curso-1',now()+interval '1 day')$$,'42501',null,
 'visitante anônimo não registra equipamento');
select tests.authenticate_service();
select throws_ok($$select public.ride_access_options(pg_temp.id('r1'),null)$$,'42501',null,'a chave de serviço não consulta opções de pessoa');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('servico'),null,null,pg_temp.trecho('r1'),'boarding',false)$$,'42501',null,
 'a chave de serviço não pede cotação com assistência');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'ramp','insp-1','curso-1',now()+interval '1 day')$$,'42501',null,
 'a chave de serviço não registra equipamento');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'ramp','insp-1','curso-1',now()+interval '1 day')$$,'P0001','not_allowed',
 'passageira não registra equipamento de veículo');
select throws_ok($$select * from private.ride_access_equipment$$,'42501',null,'cliente não lê os equipamentos dos veículos');
select throws_ok($$select * from private.ride_access_policies$$,'42501',null,'cliente não lê a política de embarque');
select throws_ok($$select private.ride_access_equipped(tests.uid('client_b'),'boarding',false,now(),now())$$,'42501',null,'cliente não executa a regra privada do equipamento');
select throws_ok($$select private.ride_access_supply(null,now(),'boarding',false,0)$$,'42501',null,'cliente não consulta a oferta privada de assistência');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'ramp','insp-1','curso-1',now()+interval '1 day')$$,'P0001','not_allowed',
 'motorista não registra o equipamento do próprio veículo');
select throws_ok($$select public.ride_access_options(null,null)$$,'P0001','route_unavailable','sem rota medida não há opções a consultar');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_access_options(pg_temp.id('r1'),null)$$,'P0001','route_unavailable','outra pessoa não consulta a assistência de uma rota alheia');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('alheia'),null,null,pg_temp.trecho('r1'),'boarding',false)$$,'P0001','route_unavailable',
 'outra pessoa não cota com assistência a rota alheia');
select tests.clear_authentication();
select is((select count(*)::int from pg_proc p where p.pronamespace='private'::regnamespace
   and p.proname in ('ride_access_equipped','ride_leg_access_covers','ride_before_modes_eligible','ride_offer_eligible','require_ride_access_equipment',
     'freeze_ride_access_boarding','ride_access_boarding','ride_access_supply')
   and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))),0,
 'nenhum auxiliar ou gatilho privado da assistência é executável pelas funções da API');
select is((select count(*)::int from pg_proc p where p.pronamespace='private'::regnamespace
   and p.proname in ('ride_access_equipped','ride_leg_access_covers','ride_before_modes_eligible','ride_offer_eligible','require_ride_access_equipment',
     'freeze_ride_access_boarding','ride_access_boarding','ride_access_supply')),8,'os oito auxiliares privados existem');
select ok((select bool_and(c.relrowsecurity) from pg_class c where c.oid in ('private.ride_access_equipment'::regclass,'private.ride_access_policies'::regclass)),
 'as duas tabelas novas têm segurança por linha ligada');
select is((select count(*)::int from private.ride_access_policies where environment='live'),0,'produção não recebe política de embarque');
select ok((select count(*)>0 and bool_and(evidence_ref='ficticio-o17-e6' and environment='simulation') from private.ride_access_policies where evidence_ref<>'ficticio-602'),
 'a semente só traz política de ensaio com referência fictícia');
select is(private.ride_access_boarding('live','Saúde','wheelchair_vehicle',now(),12),null,'em produção não há tempo de embarque publicado');
select ok(private.ride_modality_issue('live','wav','Saúde','Jabaquara',now()+interval '22 minutes',now()) is not null
  and private.ride_modality_issue('live','assist','Saúde','Jabaquara',now()+interval '15 minutes',now()) is not null,
 'em produção as duas modalidades de assistência seguem sem autorização');

-- C3.5 · Nenhum campo de diagnóstico: a lista de assistências é a da etapa 3, sem mudança.
select is((select pg_get_constraintdef(oid) from pg_constraint where conname='ride_access_preferences_assistance_check'),
 $$CHECK ((assistance = ANY (ARRAY['none'::text, 'boarding'::text, 'folding_equipment'::text, 'wheelchair_vehicle'::text])))$$,
 'a preferência do trecho continua com as quatro opções funcionais');
select is((select pg_get_constraintdef(oid) from pg_constraint where conname='ride_access_quotes_assistance_check'),
 $$CHECK ((assistance = ANY (ARRAY['boarding'::text, 'folding_equipment'::text, 'wheelchair_vehicle'::text])))$$,
 'a cotação continua com as três assistências');
select is((select pg_get_constraintdef(oid) from pg_constraint where conname='ride_access_policies_assistance_check'),
 $$CHECK ((assistance = ANY (ARRAY['boarding'::text, 'folding_equipment'::text, 'wheelchair_vehicle'::text])))$$,
 'a política de embarque usa as mesmas três assistências');
select is((select pg_get_constraintdef(oid) from pg_constraint where conname='ride_assist_capabilities_capability_check'),
 $$CHECK ((capability = ANY (ARRAY['boarding'::text, 'folding_equipment'::text, 'wheelchair_vehicle'::text])))$$,
 'a capacitação do motorista usa as mesmas três assistências');
select is((select jsonb_object_agg(c.relname,(select jsonb_agg(a.attname order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))
   from pg_class c where c.oid in ('private.ride_access_equipment'::regclass,'private.ride_access_policies'::regclass,
     'private.ride_access_quotes'::regclass,'private.ride_access_preferences'::regclass)),
 '{"ride_access_equipment":["driver_id","vehicle_ref","kind","inspected_ref","trained_ref","valid_until","verified_at"],
   "ride_access_policies":["environment","area","assistance","boarding_minutes","evidence_ref","valid_until"],
   "ride_access_quotes":["quote_id","owner_id","assistance","companion","boarding"],
   "ride_access_preferences":["leg","owner_id","cue","assistance","share_cue","companion","boarding_minutes"]}'::jsonb,
 'as tabelas de assistência guardam só necessidade funcional, acompanhante, tempo e evidência do veículo');
select is((select count(*)::int from pg_attribute a join pg_class c on c.oid=a.attrelid
   where c.relnamespace='private'::regnamespace and c.relname ~ '^ride_(access|assist)' and a.attnum>0 and not a.attisdropped
     and a.attname ~* '(diagn|disab|defici|medic|health|saude|laudo|doen|illness|condition|cid|reason|motivo)'),0,
 'nenhuma coluna de diagnóstico, deficiência, laudo ou motivo existe nas tabelas de assistência');
select is((select count(*)::int from pg_proc p cross join lateral unnest(p.proargnames) n
   where p.pronamespace='public'::regnamespace and p.proname in ('ride_access_options','ride_quote_accessible','ride_verify_access_equipment','ride_quote_with_access','ride_set_access')
     and n ~* '(diagn|disab|defici|medic|health|saude|laudo|doen|illness|condition|cid|reason|motivo|animal|pet)'),0,
 'nenhuma RPC de assistência recebe diagnóstico, motivo ou declaração de animal');
select is((select array_agg(n order by ord) from pg_proc p cross join lateral unnest(p.proargnames) with ordinality x(n,ord) where p.oid='public.ride_quote_accessible'::regproc),
 array['p_key','p_booking','p_scheduled_at','p_legs','p_assistance','p_companion'],'a cotação com assistência recebe só o pedido, a assistência e o acompanhante');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('laudo'),null,null,pg_temp.trecho('r1'),'paraplegia',false)$$,'P0001','invalid_input',
 'um valor fora da lista funcional é entrada inválida');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('nula'),null,null,pg_temp.trecho('r1'),null,false)$$,'P0001','invalid_input','a assistência precisa ser informada');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('semcomp'),null,null,pg_temp.trecho('r1'),'boarding',null)$$,'P0001','invalid_input','o acompanhante precisa ser informado');
select throws_ok($$select public.ride_quote_accessible(null,null,null,pg_temp.trecho('r1'),'boarding',false)$$,'P0001','invalid_input','a chave do pedido é obrigatória');

-- Registro de equipamento pela operação: entradas e pessoas recusadas.
select tests.authenticate_as('admin');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'elevador','insp-1','curso-1',now()+interval '1 day')$$,'P0001','invalid_input','equipamento fora da lista é entrada inválida');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),null,'insp-1','curso-1',now()+interval '1 day')$$,'P0001','invalid_input','o equipamento precisa ser informado');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'ramp','x','curso-1',now()+interval '1 day')$$,'P0001','invalid_input','a referência da inspeção é obrigatória');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'ramp','insp-1','tem espaço',now()+interval '1 day')$$,'P0001','invalid_input','a referência da capacitação segue o formato de referência');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'ramp','insp-1','curso-1',now()-interval '1 minute')$$,'P0001','invalid_input','validade passada é entrada inválida');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'ramp','insp-1','curso-1',null)$$,'P0001','invalid_input','a validade precisa ser informada');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('admin'),'ramp','insp-1','curso-1',now()+interval '1 day')$$,'P0001','not_allowed','ninguém registra o próprio veículo');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('provider_e'),'ramp','insp-1','curso-1',now()+interval '1 day')$$,'P0001','driver_ineligible',
 'sem motorista aprovado não há equipamento a registrar');
select throws_ok($$select public.ride_verify_access_equipment(tests.uid('provider_d'),'ramp','insp-1','curso-1',now()+interval '1 day')$$,'P0001','driver_ineligible',
 'sem credencial do veículo não há a que vincular o equipamento');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_access_equipment),0,'as recusas não deixam equipamento gravado');

-- C3.1 · Pedido de veículo adaptado sem veículo compatível: recusa e nenhuma cotação.
insert into t602(k,data) values('antes',pg_temp.rows602());
select tests.authenticate_as('client_a');
insert into t602(k,data) values('op0',public.ride_access_options(pg_temp.id('r1'),null));
select is(pg_temp.opt(pg_temp.data('op0')),'{"boarding":false,"folding_equipment":false,"wheelchair_vehicle":false}'::jsonb,
 'sem motorista capacitado nenhuma assistência aparece como disponível');
select is(pg_temp.opt(pg_temp.data('op0'),'boarding_minutes'),'{"boarding":3,"folding_equipment":5,"wheelchair_vehicle":10}'::jsonb,
 'as opções informam o tempo de embarque de cada assistência');
select is(pg_temp.opt(pg_temp.data('op0'),'companion'),'{"boarding":false,"folding_equipment":false,"wheelchair_vehicle":false}'::jsonb,
 'sem oferta não há assento de acompanhante a prometer');
select is((select jsonb_agg(o->>'assistance') from jsonb_array_elements(pg_temp.data('op0')->'options') o),
 '["boarding","folding_equipment","wheelchair_vehicle"]'::jsonb,'as opções seguem a ordem fixa das três assistências');
select ok(pg_temp.data('op0') ? 'channel' and pg_temp.data('op0')->>'channel' is null,'sem plantão publicado o canal vem vazio');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('wav0'),null,null,pg_temp.trecho('r1'),'wheelchair_vehicle',false)$$,'P0001','ride_assistance_unavailable',
 'C3.1: sem veículo compatível o pedido de veículo adaptado é recusado');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('emb0'),null,null,pg_temp.trecho('r1'),'boarding',false)$$,'P0001','ride_assistance_unavailable',
 'sem motorista capacitado a ajuda no embarque também é recusada');
select tests.clear_authentication();
select is(pg_temp.rows602(),pg_temp.data('antes'),'C3.1: a recusa não deixa cotação, assistência cotada, modalidade nem trecho');
select is((select count(*)::int from private.ride_quotes where request_key in (pg_temp.key('wav0'),pg_temp.key('emb0'))),0,'nenhuma cotação existe para as chaves recusadas');
-- Só a capacitação não basta para o veículo adaptado.
insert into private.ride_assist_capabilities values(tests.uid('client_b'),'ENS-602-CLIENT_B','wheelchair_vehicle','CURSO-602','VIST-602',now()+interval '1 day');
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r1'),null))->'wheelchair_vehicle','false'::jsonb,'capacitação sem equipamento vistoriado não oferece veículo adaptado');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('wav0'),null,null,pg_temp.trecho('r1'),'wheelchair_vehicle',false)$$,'P0001','ride_assistance_unavailable',
 'capacitação sem fixação e rampa não sustenta a promessa');
select tests.authenticate_as('admin');
select lives_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'restraint','insp/602-fix','curso/602',now()+interval '1 day')$$,'a operação registra a fixação vistoriada');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('wav0'),null,null,pg_temp.trecho('r1'),'wheelchair_vehicle',false)$$,'P0001','ride_assistance_unavailable',
 'fixação sem rampa ou plataforma ainda não é veículo compatível');
select tests.authenticate_as('admin');
select lives_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'ramp','insp/602-rampa','curso/602',now()+interval '1 day')$$,'a operação registra a rampa vistoriada');
select lives_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'ramp','insp/602-rampa','curso/602',now()+interval '1 day')$$,'repetir o mesmo registro não falha');
select tests.clear_authentication();
select is((select count(*)::int from public.audit_log where action='ride.access_equipment_review' and entity_id=tests.uid('client_b')::text),2,
 'cada equipamento é auditado uma vez, e a repetição não audita de novo');
select is((select jsonb_agg(jsonb_build_array(kind,vehicle_ref,inspected_ref,trained_ref) order by kind) from private.ride_access_equipment where driver_id=tests.uid('client_b')),
 '[["ramp","ENS-602-CLIENT_B","insp/602-rampa","curso/602"],["restraint","ENS-602-CLIENT_B","insp/602-fix","curso/602"]]'::jsonb,
 'o equipamento fica vinculado ao veículo da credencial, com inspeção e capacitação');
select tests.authenticate_as('admin');
select lives_ok($$select public.ride_verify_access_equipment(tests.uid('client_b'),'ramp','insp/602-rampa-2','curso/602',now()+interval '2 days')$$,
 'uma nova vistoria substitui o registro do mesmo equipamento');
select tests.clear_authentication();
select is((select jsonb_build_array(count(*),max(inspected_ref) filter(where kind='ramp')) from private.ride_access_equipment where driver_id=tests.uid('client_b')),
 '[2,"insp/602-rampa-2"]'::jsonb,'a nova vistoria atualiza a linha, sem duplicar o equipamento');
select is((select count(*)::int from public.audit_log where action='ride.access_equipment_review' and entity_id=tests.uid('client_b')::text),3,
 'a nova vistoria é auditada');
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r1'),null)),'{"boarding":false,"folding_equipment":false,"wheelchair_vehicle":true}'::jsonb,
 'com capacitação, fixação e rampa vigentes o veículo adaptado passa a ter oferta');
select tests.clear_authentication();
update private.ride_access_equipment set valid_until=now()-interval '1 minute' where driver_id=tests.uid('client_b') and kind='restraint';
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r1'),null))->'wheelchair_vehicle','false'::jsonb,'fixação vencida tira a oferta do veículo adaptado');
select tests.clear_authentication();
update private.ride_access_equipment set valid_until=now()+interval '1 day' where driver_id=tests.uid('client_b') and kind='restraint';
update private.ride_access_equipment set vehicle_ref='OUTRO-VEICULO' where driver_id=tests.uid('client_b') and kind='ramp';
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r1'),null))->'wheelchair_vehicle','false'::jsonb,'rampa vistoriada em outro veículo não vale para o veículo atual');
select tests.clear_authentication();
update private.ride_access_equipment set vehicle_ref='ENS-602-CLIENT_B',kind='lift' where driver_id=tests.uid('client_b') and kind='ramp';
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r1'),null))->'wheelchair_vehicle','true'::jsonb,'plataforma elevatória vale no lugar da rampa');
select tests.clear_authentication();
update private.ride_access_equipment set kind='ramp' where driver_id=tests.uid('client_b') and kind='lift';
update private.ride_assist_capabilities set until_at=now()+interval '10 minutes' where driver_id=tests.uid('client_b');
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r1'),null))->'wheelchair_vehicle','false'::jsonb,'capacitação que vence antes do fim do trecho tira a oferta');
select tests.clear_authentication();
update private.ride_assist_capabilities set until_at=now()+interval '1 day' where driver_id=tests.uid('client_b');
update public.ride_drivers set online=false where id=tests.uid('client_b');
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r1'),null))->'wheelchair_vehicle','false'::jsonb,'veículo adaptado fora de turno não é oferta');
select tests.clear_authentication();
update public.ride_drivers set online=true where id=tests.uid('client_b');
-- A ajuda no embarque só pede a capacitação do motorista.
insert into private.ride_assist_capabilities values(tests.uid('provider_c'),'ENS-602-PROVIDER_C','boarding','CURSO-602','VIST-602',now()+interval '1 day');
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r1'),null)),'{"boarding":true,"folding_equipment":false,"wheelchair_vehicle":true}'::jsonb,
 'a ajuda no embarque fica disponível com motorista capacitado, sem equipamento');
-- O canal do plantão vem da escala já existente.
select tests.clear_authentication();
insert into private.ride_pilot(id,period,approved_ref,budget_cents) values(pg_temp.key('piloto'),tstzrange(now()-interval '1 hour',now()+interval '1 day'),'ENSAIO-602',10000);
insert into private.ride_coverage(id,pilot,period,lead_id,backup_id) values(pg_temp.key('escala'),pg_temp.key('piloto'),tstzrange(now()-interval '1 hour',now()+interval '1 day'),tests.uid('admin'),tests.uid('plantao_602'));
insert into private.ride_support_channels values(pg_temp.key('escala'),'email','plantao@example.test','Equipe fictícia','ENSAIO-602');
select tests.authenticate_as('client_a');
select is(public.ride_access_options(pg_temp.id('r1'),null)->>'channel','plantao@example.test','as opções trazem o canal do plantão em serviço');

-- Política de embarque e autorização da modalidade também seguram a promessa.
select tests.clear_authentication();
update private.ride_access_policies set valid_until=now()+interval '15 minutes' where environment='simulation' and area='Saúde' and assistance='wheelchair_vehicle';
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r1'),null))->'wheelchair_vehicle','false'::jsonb,'política que vence antes do fim do trecho tira a oferta');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('wav0'),null,null,pg_temp.trecho('r1'),'wheelchair_vehicle',false)$$,'P0001','ride_assistance_unavailable',
 'sem política de embarque vigente até o fim do trecho não há cotação');
select tests.clear_authentication();
update private.ride_access_policies set valid_until=now()+interval '1 day' where environment='simulation' and area='Saúde' and assistance='wheelchair_vehicle';
update private.ride_market_modalities set status='inventory',authorization_ref=null,valid_until=null where environment='simulation' and modality='wav';
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r1'),null)),'{"boarding":true,"folding_equipment":false,"wheelchair_vehicle":false}'::jsonb,
 'sem autorização da modalidade o veículo adaptado não é oferecido, e a ajuda no embarque segue');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('wav0'),null,null,pg_temp.trecho('r1'),'wheelchair_vehicle',false)$$,'P0001','ride_modality_unavailable',
 'sem autorização da modalidade a porta recusa antes de qualquer promessa');
select tests.clear_authentication();
update private.ride_market_modalities set status='pilot',authorization_ref='ficticio-o17-e6',valid_until='infinity' where environment='simulation' and modality='wav';
select is(pg_temp.rows602(),pg_temp.data('antes'),'nenhuma das recusas deixou cotação, assistência cotada, modalidade nem trecho');

-- C3.2 · Com equipamento conferido, a duração inclui o tempo de embarque e a tarifa não muda.
select tests.authenticate_as('client_a');
insert into t602(k,data) values('comum',public.ride_quote(pg_temp.key('comum'),null,null,pg_temp.trecho('r2')));
insert into t602(k,data) values('q1',public.ride_quote_accessible(pg_temp.key('q1'),null,null,pg_temp.trecho('r1'),'wheelchair_vehicle',false));
update t602 set id=(data->>'id')::uuid where k in ('comum','q1');
select is((pg_temp.data('comum')#>>'{legs,0,duration_minutes}')::int,12,'a cotação comum dura o tempo medido da rota');
select is((pg_temp.data('q1')#>>'{legs,0,duration_minutes}')::int,22,'C3.2: a duração cotada soma os 10 minutos de embarque aos 12 da rota');
select is(pg_temp.data('q1')->'total_cents',pg_temp.data('comum')->'total_cents','C3.2: o total é o mesmo da cotação sem assistência');
select is(pg_temp.data('q1')#>'{legs,0,fare_cents}',pg_temp.data('comum')#>'{legs,0,fare_cents}','C3.2: a tarifa do trecho não muda com a assistência');
select is(pg_temp.data('q1')->>'status','awaiting_consent','a cotação aguarda o aceite de quem viaja');
select is(public.ride_quote_accessible(pg_temp.key('q1'),null,null,pg_temp.trecho('r1'),'wheelchair_vehicle',false),pg_temp.data('q1'),
 'repetir o pedido com a mesma chave devolve a mesma cotação');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('q1'),null,null,pg_temp.trecho('r1'),'wheelchair_vehicle',true)$$,'P0001','idempotency_conflict',
 'a mesma chave com acompanhante diferente é conflito');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('q1'),null,null,pg_temp.trecho('r1'),'boarding',false)$$,'P0001','idempotency_conflict',
 'a mesma chave com outra assistência é conflito');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('q1'),null,null,pg_temp.trecho('r3'),'wheelchair_vehicle',false)$$,'P0001','idempotency_conflict',
 'a mesma chave com outro trajeto é conflito');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('comum'),null,null,pg_temp.trecho('r2'),'wheelchair_vehicle',false)$$,'P0001','idempotency_conflict',
 'a chave de uma cotação comum não vira cotação com assistência');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_quotes where request_key=pg_temp.key('q1')),1,'a repetição não cria segunda cotação');
select is((select (legs#>>'{0,duration_minutes}')::int from private.ride_quotes where id=pg_temp.id('q1')),22,'a repetição não soma o embarque duas vezes');
select is((select q.legs->0 from private.ride_quotes q where q.id=pg_temp.id('q1'))-array['duration_minutes','route_id','eta_observed_at'],
 (select q.legs->0 from private.ride_quotes q where q.id=pg_temp.id('comum'))-array['duration_minutes','route_id','eta_observed_at','pickup_at']
   ||jsonb_build_object('pickup_at',(select q.legs#>'{0,pickup_at}' from private.ride_quotes q where q.id=pg_temp.id('q1'))),
 'C3.2: preço, comissão, remuneração do motorista e medida da rota são os da cotação sem assistência');
select is((select jsonb_build_array(assistance,companion,boarding) from private.ride_access_quotes where quote_id=pg_temp.id('q1')),
 '["wheelchair_vehicle",false,{"1":10}]'::jsonb,'a cotação guarda a assistência, o acompanhante e o tempo de embarque somado');
select is((select jsonb_agg(modality order by modality) from private.ride_quote_modes where quote_id=pg_temp.id('q1')),'["wav"]'::jsonb,
 'a cotação carrega a modalidade de veículo acessível do catálogo');
select is((select count(*)::int from private.ride_quote_modes where quote_id=pg_temp.id('comum')),0,'a cotação comum não carrega modalidade de assistência');
select tests.authenticate_as('client_a');
insert into t602(k,id) values('ride1',(public.ride_consent(pg_temp.id('q1'),true)->>'ride_id')::uuid);
select is((public.ride_consent(pg_temp.id('q1'),true)->>'ride_id')::uuid,pg_temp.id('ride1'),'repetir o aceite devolve a mesma corrida');
select is(public.ride_quote_accessible(pg_temp.key('q1'),null,null,pg_temp.trecho('r1'),'wheelchair_vehicle',false)->>'status','requested',
 'depois do aceite, repetir o pedido devolve a cotação já aceita');
select tests.clear_authentication();
insert into t602(k,id) select 'leg1',id from public.ride_legs where ride_id=pg_temp.id('ride1');
select is((select count(*)::int from public.ride_legs where ride_id=pg_temp.id('ride1')),1,'o aceite repetido não cria segundo trecho');
select is((select jsonb_build_array(duration_minutes,extract(epoch from upper(slot)-lower(slot))::int/60) from public.ride_legs where id=pg_temp.id('leg1')),
 '[22,22]'::jsonb,'C3.2: o trecho reserva a rota mais o embarque na agenda');
select is((select jsonb_build_array(fare_cents,fee_cents,driver_cents) from public.ride_legs where id=pg_temp.id('leg1')),
 (select jsonb_build_array(legs#>'{0,fare_cents}',legs#>'{0,fee_cents}',legs#>'{0,driver_cents}') from private.ride_quotes where id=pg_temp.id('comum')),
 'C3.2: o trecho nasce com o preço e a remuneração da cotação sem assistência');
select is((select jsonb_build_array(assistance,companion,boarding_minutes,owner_id=tests.uid('client_a')) from private.ride_access_preferences where leg=pg_temp.id('leg1')),
 '["wheelchair_vehicle",false,10,true]'::jsonb,'o trecho congela a assistência e o tempo de embarque');
select is((select jsonb_agg(modality order by modality) from private.ride_leg_modes where leg_id=pg_temp.id('leg1')),'["wav"]'::jsonb,'o trecho congela a modalidade de veículo acessível');
select is(pg_temp.offered('leg1'),array[tests.uid('client_b')],'só o veículo adaptado recebe a oferta');
select ok(pg_temp.eligible('client_b','leg1') and not pg_temp.eligible('provider_c','leg1') and not pg_temp.eligible('provider_d','leg1'),
 'motorista sem equipamento não é elegível para o trecho com veículo adaptado');
select tests.authenticate_as('client_b');
select is(public.ride_offer_assistance(pg_temp.id('leg1')),'wheelchair_vehicle','o motorista elegível vê a assistência pedida, sem motivo');
select tests.authenticate_as('provider_c');
select is(public.ride_offer_assistance(pg_temp.id('leg1')),null,'quem não pode atender não vê o pedido');
select throws_ok($$select public.ride_accept_offer(pg_temp.id('leg1'),pg_temp.key('aceite-c'))$$,'P0001','offer_unavailable','motorista sem equipamento não aceita o trecho');

-- A porta antiga (etapa 3) não soma embarque nem modalidade, mas o equipamento vale para o trecho.
select tests.authenticate_as('client_a');
insert into t602(k,id) values('q3',(public.ride_quote_with_access(pg_temp.key('q3'),null,null,pg_temp.trecho('r3'),'wheelchair_vehicle')->>'id')::uuid);
insert into t602(k,id) values('ride3',(public.ride_consent(pg_temp.id('q3'),true)->>'ride_id')::uuid);
select tests.clear_authentication();
insert into t602(k,id) select 'leg3',id from public.ride_legs where ride_id=pg_temp.id('ride3');
insert into private.ride_assist_capabilities values(tests.uid('provider_c'),'ENS-602-PROVIDER_C','wheelchair_vehicle','CURSO-602','VIST-602',now()+interval '1 day');
select ok((select private.ride_safety_can_pair(tests.uid('provider_c'),l) from public.ride_legs l where l.id=pg_temp.id('leg3')),
 'pela regra da etapa 3 a capacitação sozinha formava o par');
select ok(pg_temp.eligible('client_b','leg3') and not pg_temp.eligible('provider_c','leg3'),
 'agora o trecho com veículo adaptado só é oferecido a quem tem fixação e rampa, qualquer que seja a porta');
select ok((select not private.ride_leg_access_covers(tests.uid('provider_c'),l,upper(l.slot)) and private.ride_leg_access_covers(tests.uid('client_b'),l,upper(l.slot))
   from public.ride_legs l where l.id=pg_temp.id('leg3')),'a regra usada na atribuição recusa o veículo sem equipamento e aceita o equipado');
select is((select jsonb_build_array(l.duration_minutes,(select count(*) from private.ride_leg_modes m where m.leg_id=l.id),p.boarding_minutes,p.companion)
   from public.ride_legs l join private.ride_access_preferences p on p.leg=l.id where l.id=pg_temp.id('leg3')),'[12,0,0,false]'::jsonb,
 'o trecho da porta antiga não tem tempo de embarque, modalidade nem acompanhante');
delete from private.ride_assist_capabilities where driver_id=tests.uid('provider_c') and capability='wheelchair_vehicle';
select tests.authenticate_as('client_a');
select is(public.ride_transition(pg_temp.id('leg3'),'cancelled',pg_temp.key('cancela3'))->>'status','cancelled','a passageira cancela o trecho da porta antiga');

-- C3.4 · Equipamento que vence antes do fim do trecho bloqueia oferta e atribuição.
select tests.clear_authentication();
update private.ride_access_equipment set valid_until=(select upper(slot)-interval '1 minute' from public.ride_legs where id=pg_temp.id('leg1'))
 where driver_id=tests.uid('client_b') and kind='ramp';
select ok(not pg_temp.eligible('client_b','leg1'),'C3.4: rampa que vence antes do fim do trecho tira o motorista da oferta');
select tests.authenticate_as('client_b');
select is(public.ride_offer_assistance(pg_temp.id('leg1')),null,'C3.4: o trecho some do radar do motorista');
select throws_ok($$select public.ride_accept_offer(pg_temp.id('leg1'),pg_temp.key('aceite1'))$$,'P0001','offer_unavailable','C3.4: o aceite é recusado');
select tests.clear_authentication();
select throws_ok($$update public.ride_legs set driver_id=tests.uid('client_b') where id=pg_temp.id('leg1')$$,'P0001','ride_assistance_unavailable',
 'C3.4: a atribuição direta também é recusada');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('q4'),null,null,pg_temp.trecho('r4'),'wheelchair_vehicle',false)$$,'P0001','ride_assistance_unavailable',
 'C3.4: com o equipamento a vencer nenhuma nova cotação é prometida');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_quotes where request_key=pg_temp.key('q4')),0,'a recusa não deixa cotação');
update private.ride_access_equipment set valid_until=(select upper(slot)+interval '2 minutes' from public.ride_legs where id=pg_temp.id('leg1'))
 where driver_id=tests.uid('client_b') and kind='ramp';
select ok(not pg_temp.eligible('client_b','leg1'),'a validade precisa cobrir também o fim planejado do motorista, que chega depois do horário pedido');
update private.ride_access_equipment set valid_until=now()+interval '1 day' where driver_id=tests.uid('client_b') and kind='ramp';
update private.ride_access_equipment set valid_until=(select upper(slot)-interval '1 minute' from public.ride_legs where id=pg_temp.id('leg1'))
 where driver_id=tests.uid('client_b') and kind='restraint';
select ok(not pg_temp.eligible('client_b','leg1'),'C3.4: fixação que vence antes do fim do trecho também bloqueia');
select throws_ok($$update public.ride_legs set driver_id=tests.uid('client_b') where id=pg_temp.id('leg1')$$,'P0001','ride_assistance_unavailable',
 'C3.4: e a atribuição continua recusada');
update private.ride_access_equipment set valid_until=now()+interval '1 day' where driver_id=tests.uid('client_b') and kind='restraint';
select ok(pg_temp.eligible('client_b','leg1'),'com o equipamento vigente até o fim o motorista volta a ser elegível');
select tests.authenticate_as('client_b');
select is(public.ride_accept_offer(pg_temp.id('leg1'),pg_temp.key('aceite1'))->>'status','accepted','o veículo adaptado aceita o trecho');
select is(public.ride_accept_offer(pg_temp.id('leg1'),pg_temp.key('aceite1'))->>'replayed','true','repetir o aceite com a mesma chave não repete o efeito');
select tests.clear_authentication();
select is((select extract(epoch from upper(driver_slot)-lower(driver_slot))::int/60 from public.ride_legs where id=pg_temp.id('leg1')),27,
 'a agenda do motorista reserva deslocamento (5), embarque (10) e rota (12)');
-- Depois do aceite, a perda do equipamento bloqueia a partida; cancelar continua possível.
update private.ride_access_equipment set valid_until=now()+interval '1 minute' where driver_id=tests.uid('client_b') and kind='ramp';
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_transition(pg_temp.id('leg1'),'arriving',pg_temp.key('partida1'))$$,'P0001','ride_assistance_unavailable',
 'equipamento que vence durante o trecho bloqueia a partida');
select tests.clear_authentication();
select throws_ok($$update public.ride_legs set slot=tstzrange(lower(slot),upper(slot)+interval '1 hour') where id=pg_temp.id('leg1')$$,'P0001','ride_assistance_unavailable',
 'esticar o trecho além da validade do equipamento é recusado');
update private.ride_access_equipment set valid_until=now()+interval '1 day' where driver_id=tests.uid('client_b') and kind='ramp';

-- C3.6 · Acidente e discriminação podem ser abertos para o trecho.
select tests.authenticate_as('client_a');
insert into t602(k,id) values('acidente',public.ride_safety_case(pg_temp.id('leg1'),'accident',pg_temp.key('acidente')));
insert into t602(k,id) values('discriminacao',public.ride_safety_case(pg_temp.id('leg1'),'discrimination',pg_temp.key('discriminacao')));
select ok(pg_temp.id('acidente') is not null and pg_temp.id('discriminacao') is not null and pg_temp.id('acidente')<>pg_temp.id('discriminacao'),
 'C3.6: a passageira abre um caso de acidente e um de discriminação para o trecho');
select is(public.ride_safety_case(pg_temp.id('leg1'),'discrimination',pg_temp.key('discriminacao')),pg_temp.id('discriminacao'),'repetir a abertura devolve o mesmo protocolo');
select throws_ok($$select public.ride_safety_case(pg_temp.id('leg1'),'accident',pg_temp.key('discriminacao'))$$,'P0001','idempotency_conflict',
 'a mesma chave com outra categoria é conflito');
select tests.authenticate_as('client_b');
insert into t602(k,id) values('acidente-motorista',public.ride_safety_case(pg_temp.id('leg1'),'accident',pg_temp.key('acidente-motorista')));
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_safety_case(pg_temp.id('leg1'),'discrimination',pg_temp.key('alheio'))$$,'P0001','not_allowed','quem não participa do trecho não abre caso');
select tests.clear_authentication();
select is((select jsonb_agg(jsonb_build_array(category,severity) order by category,severity) from private.ride_case_details where leg=pg_temp.id('leg1')),
 '[["accident","urgent"],["accident","urgent"],["discrimination","priority"]]'::jsonb,'C3.6: os casos ficam ligados ao trecho, com a prioridade de cada categoria');
select is((select count(*)::int from public.support_tasks t join private.ride_case_details d on d.protocol=t.id where d.leg=pg_temp.id('leg1') and t.kind='ride_help'),3,
 'cada caso entra na fila do plantão');
select tests.authenticate_as('client_a');
select is(public.ride_transition(pg_temp.id('leg1'),'cancelled',pg_temp.key('cancela1'))->>'status','cancelled','a passageira ainda pode cancelar o trecho com assistência');

-- C3.3 · Acompanhante exige dois lugares e, no veículo adaptado, o assento de acompanhante.
insert into t602(k,data) values('op5',public.ride_access_options(pg_temp.id('r5'),null));
select is(pg_temp.opt(pg_temp.data('op5'),'companion'),'{"boarding":true,"folding_equipment":false,"wheelchair_vehicle":false}'::jsonb,
 'o assento de acompanhante só aparece onde há lugar: no carro de quatro lugares, não no veículo adaptado de um');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('q5'),null,null,pg_temp.trecho('r5'),'wheelchair_vehicle',true)$$,'P0001','ride_assistance_unavailable',
 'C3.3: veículo adaptado sem lugar nem assento de acompanhante não é prometido com acompanhante');
select tests.authenticate_as('admin');
select public.ride_verify_access_equipment(tests.uid('client_b'),'companion_seat','insp/602-assento','curso/602',now()+interval '1 day');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('q5'),null,null,pg_temp.trecho('r5'),'wheelchair_vehicle',true)$$,'P0001','ride_assistance_unavailable',
 'C3.3: o assento de acompanhante sem dois lugares vistoriados não basta');
select tests.authenticate_as('admin');
select public.ride_validate_capacity(tests.uid('client_b'),2,false,false,now()+interval '1 day','ensaio/602-d1');
select tests.clear_authentication();
update private.ride_access_equipment set valid_until=now()-interval '1 minute' where driver_id=tests.uid('client_b') and kind='companion_seat';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('q5'),null,null,pg_temp.trecho('r5'),'wheelchair_vehicle',true)$$,'P0001','ride_assistance_unavailable',
 'C3.3: dois lugares sem o assento de acompanhante vigente não bastam no veículo adaptado');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r5'),null),'companion')->'wheelchair_vehicle','false'::jsonb,'as opções dizem que não há assento de acompanhante');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r5'),null))->'wheelchair_vehicle','true'::jsonb,'e o veículo adaptado sem acompanhante continua disponível');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_quotes where request_key=pg_temp.key('q5')),0,'as recusas com acompanhante não deixam cotação');
update private.ride_access_equipment set valid_until=now()+interval '1 day' where driver_id=tests.uid('client_b') and kind='companion_seat';
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r5'),null),'companion')->'wheelchair_vehicle','true'::jsonb,
 'com dois lugares e assento de acompanhante vistoriado a opção aparece');
insert into t602(k,data) values('q5',public.ride_quote_accessible(pg_temp.key('q5'),null,null,pg_temp.trecho('r5'),'wheelchair_vehicle',true));
update t602 set id=(data->>'id')::uuid where k='q5';
select is(pg_temp.data('q5')->'total_cents',pg_temp.data('comum')->'total_cents','C3.3: o acompanhante não muda o preço');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('q5'),null,null,pg_temp.trecho('r5'),'wheelchair_vehicle',false)$$,'P0001','idempotency_conflict',
 'a mesma chave sem o acompanhante é conflito');
insert into t602(k,id) values('ride5',(public.ride_consent(pg_temp.id('q5'),true)->>'ride_id')::uuid);
select tests.clear_authentication();
insert into t602(k,id) select 'leg5',id from public.ride_legs where ride_id=pg_temp.id('ride5');
select is((select companion from private.ride_access_quotes where quote_id=pg_temp.id('q5')),true,'a cotação guarda o pedido de acompanhante');
select is((select jsonb_build_array(assistance,companion,boarding_minutes) from private.ride_access_preferences where leg=pg_temp.id('leg5')),
 '["wheelchair_vehicle",true,10]'::jsonb,'o trecho congela o acompanhante');
select ok(pg_temp.eligible('client_b','leg5'),'o veículo adaptado com assento de acompanhante é elegível');
update private.ride_vehicle_capacity set seats=1 where driver_id=tests.uid('client_b');
select ok(not pg_temp.eligible('client_b','leg5'),'C3.3: com um só lugar o veículo deixa de servir ao trecho com acompanhante');
select throws_ok($$update public.ride_legs set driver_id=tests.uid('client_b') where id=pg_temp.id('leg5')$$,'P0001','ride_assistance_unavailable',
 'C3.3: e a atribuição é recusada');
update private.ride_vehicle_capacity set seats=2 where driver_id=tests.uid('client_b');
update private.ride_access_equipment set valid_until=(select upper(slot)-interval '1 minute' from public.ride_legs where id=pg_temp.id('leg5'))
 where driver_id=tests.uid('client_b') and kind='companion_seat';
select ok(not pg_temp.eligible('client_b','leg5'),'C3.3: assento de acompanhante que vence antes do fim do trecho bloqueia a oferta');
update private.ride_access_equipment set valid_until=now()+interval '1 day' where driver_id=tests.uid('client_b') and kind='companion_seat';
select ok(pg_temp.eligible('client_b','leg5'),'com lugar e assento vigentes o trecho volta à oferta');
select tests.authenticate_as('client_a');
select is(public.ride_transition(pg_temp.id('leg5'),'cancelled',pg_temp.key('cancela5'))->>'status','cancelled','a passageira cancela o trecho com acompanhante');
-- Na ajuda no embarque o acompanhante só pede o segundo lugar.
insert into t602(k,data) values('q6',public.ride_quote_accessible(pg_temp.key('q6'),null,null,pg_temp.trecho('r6'),'boarding',true));
update t602 set id=(data->>'id')::uuid where k='q6';
select is((pg_temp.data('q6')#>>'{legs,0,duration_minutes}')::int,15,'a ajuda no embarque soma 3 minutos aos 12 da rota');
select is(pg_temp.data('q6')->'total_cents',pg_temp.data('comum')->'total_cents','a ajuda no embarque com acompanhante também não tem adicional');
select tests.clear_authentication();
select is((select jsonb_agg(modality order by modality) from private.ride_quote_modes where quote_id=pg_temp.id('q6')),'["assist"]'::jsonb,
 'a ajuda no embarque carrega a modalidade de assistência do catálogo');
update private.ride_vehicle_capacity set seats=1 where driver_id=tests.uid('provider_c');
select tests.authenticate_as('client_a');
select is(pg_temp.opt(public.ride_access_options(pg_temp.id('r7'),null),'companion')->'boarding','false'::jsonb,'C3.3: com um só lugar não há acompanhante na ajuda no embarque');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('q7'),null,null,pg_temp.trecho('r7'),'boarding',true)$$,'P0001','ride_assistance_unavailable',
 'C3.3: e a cotação com acompanhante é recusada');
select is((public.ride_quote_accessible(pg_temp.key('q7b'),null,null,pg_temp.trecho('r7'),'boarding',false)#>>'{legs,0,duration_minutes}')::int,15,
 'sem acompanhante a mesma ajuda segue disponível');
select tests.clear_authentication();
update private.ride_vehicle_capacity set seats=4 where driver_id=tests.uid('provider_c');

-- Itinerário de dois trechos: o embarque precisa caber antes do próximo horário.
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('q8'),null,null,jsonb_build_array(
  jsonb_build_object('route_id',pg_temp.id('r8'),'origin','Saúde','destination','Jabaquara','payer','passenger'),
  jsonb_build_object('route_id',pg_temp.id('volta'),'origin','Jabaquara','destination','Saúde','payer','passenger')),'wheelchair_vehicle',false)$$,
 'P0001','invalid_schedule','um segundo trecho colado ao primeiro não deixa tempo para o embarque');
insert into t602(k,data) values('q9',public.ride_quote_accessible(pg_temp.key('q9'),null,null,jsonb_build_array(
  jsonb_build_object('route_id',pg_temp.id('r8'),'origin','Saúde','destination','Jabaquara','payer','passenger'),
  jsonb_build_object('route_id',pg_temp.id('volta'),'origin','Jabaquara','destination','Saúde','payer','passenger','pickup_at',now()+interval '40 minutes')),'wheelchair_vehicle',false));
select is((select jsonb_agg(l->'duration_minutes' order by (l->>'seq')::int) from jsonb_array_elements(pg_temp.data('q9')->'legs') l),'[22,22]'::jsonb,
 'com folga entre os trechos, cada um soma o próprio tempo de embarque');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_quotes where request_key=pg_temp.key('q8')),0,'o itinerário recusado não deixa cotação');
select is((select jsonb_build_array(a.boarding,(select count(*) from private.ride_quote_modes m where m.quote_id=a.quote_id and m.modality='wav'))
   from private.ride_access_quotes a where a.quote_id=(pg_temp.data('q9')->>'id')::uuid),'[{"1":10,"2":10},2]'::jsonb,
 'o tempo de embarque e a modalidade ficam registrados por trecho');

-- Trajeto fixo de ensaio (sem rota medida): a mesma regra, com a duração da tabela.
select tests.authenticate_as('client_a');
insert into t602(k,data) values('qfixa',public.ride_quote_accessible(pg_temp.key('qfixa'),null,null,
 '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]','boarding',false));
select is((pg_temp.data('qfixa')#>>'{legs,0,duration_minutes}')::int,
 (public.ride_quote(pg_temp.key('qfixa-comum'),null,null,'[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]')#>>'{legs,0,duration_minutes}')::int+3,
 'no trajeto fixo de ensaio a duração também soma o tempo de embarque');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('qfixa-dobravel'),null,null,
 '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]','folding_equipment',false)$$,'P0001','ride_assistance_unavailable',
 'assistência sem motorista capacitado é recusada também no trajeto fixo');
-- Só quem viaja declara a assistência: quem contrata o serviço não pede por outra pessoa.
select tests.clear_authentication();
insert into t602(k,id) values('reserva',tests.make_booking('provider_a','client_a','t-reparo',tstzrange(now()+interval '3 hours',now()+interval '5 hours')));
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('qcliente'),pg_temp.id('reserva'),null,
 '[{"origin":"Saúde","destination":"Jabaquara","payer":"client"}]','boarding',false)$$,'P0001','not_allowed',
 'quem contrata o serviço não declara assistência por quem viaja');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_quotes where request_key in (pg_temp.key('qcliente'),pg_temp.key('qfixa-dobravel'))),0,
 'as duas recusas não deixam cotação');
select is((select count(*)::int from private.ride_access_quotes a where not exists(select from private.ride_quote_modes m where m.quote_id=a.quote_id
   and m.modality=case when a.assistance='wheelchair_vehicle' then 'wav' else 'assist' end) and a.quote_id<>pg_temp.id('q3')),0,
 'toda cotação feita pela porta acessível carrega a modalidade do catálogo');

select * from finish();
rollback;
