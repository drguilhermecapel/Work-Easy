-- O17 etapa 6 · PAR-602 (110608): uma só regra para pedir assistência, qualquer que seja a
-- porta. A porta da etapa 3 (ride_quote_with_access) e a preferência do trecho
-- (ride_set_access) seguem as regras da porta acessível: modalidade do mercado, política de
-- embarque e um motorista em turno capacitado até o fim do trecho. Aceite do O17: "Falta de
-- veículo compatível impede promessa de transporte acessível". Só dados fictícios.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,id uuid,data jsonb);
grant all on t to authenticated;
create function pg_temp.id(p text) returns uuid language sql stable as $$select id from t where k=p$$;
create function pg_temp.data(p text) returns jsonb language sql stable as $$select data from t where k=p$$;
create function pg_temp.key(p text) returns uuid language sql immutable as $$select md5('206f:'||p)::uuid$$;
create function pg_temp.trip() returns jsonb language sql immutable as
 $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
create function pg_temp.counts() returns jsonb language sql stable as $$select jsonb_build_array((select count(*) from private.ride_quotes),
 (select count(*) from private.ride_access_quotes),(select count(*) from private.ride_quote_modes),(select count(*) from public.ride_legs),
 (select count(*) from private.ride_access_preferences),(select count(*) from private.ride_leg_modes))$$;
grant execute on function pg_temp.id(text),pg_temp.data(text),pg_temp.key(text),pg_temp.trip() to authenticated;
-- Um motorista fictício em turno na Saúde, com a capacitação dada e sem equipamento vistoriado.
create function pg_temp.driver(p text,p_capability text) returns void language plpgsql as $$
begin
 perform tests.create_user(p);
 insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
  values(tests.uid(p),'simulation','sedan','approved',private.sp_date(now())+3,tests.uid('admin'),true);
 insert into private.ride_driver_credentials(driver_id,vehicle_identifier,vehicle_category,driver_document_ref,vehicle_document_ref,insurance_ref,
   driver_until,vehicle_until,insurance_until,inspected_by)
  values(tests.uid(p),'VEI-'||p,'sedan','DOC-206F','VEI-'||p,'SEG-206F',private.sp_date(now())+3,private.sp_date(now())+3,private.sp_date(now())+3,tests.uid('admin'));
 insert into private.ride_assist_capabilities values(tests.uid(p),'VEI-'||p,p_capability,'CURSO-206F','VIST-206F',now()+interval '1 day');
 insert into private.ride_driver_shifts(driver_id,area,period) values(tests.uid(p),'Saúde',tstzrange(now()-interval '5 minutes',now()+interval '3 hours'));
end $$;

select has_function('private','ride_quote_with_access_before_door',array['uuid','uuid','timestamp with time zone','jsonb','text'],
 'o corpo da etapa 3 foi preservado em private sob novo nome');
select has_function('private','ride_set_access_before_door',array['uuid','text','text','boolean'],'a preferência da etapa 3 foi preservada em private');
select has_function('private','ride_quote_access_door',array['uuid','uuid','timestamp with time zone','jsonb','text','boolean'],'as duas portas de cotação respondem pela mesma rotina');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p where p.oid in ('private.ride_quote_with_access_before_door(uuid,uuid,timestamptz,jsonb,text)'::regprocedure,
   'private.ride_set_access_before_door(uuid,text,text,boolean)'::regprocedure,'private.ride_quote_access_door(uuid,uuid,timestamptz,jsonb,text,boolean)'::regprocedure)
   and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))),
 null,'nenhuma das rotinas privadas é executável pelas funções da API');
select ok(has_function_privilege('authenticated','public.ride_quote_with_access(uuid,uuid,timestamptz,jsonb,text)','execute')
  and has_function_privilege('authenticated','public.ride_set_access(uuid,text,text,boolean)','execute')
  and not has_function_privilege('anon','public.ride_quote_with_access(uuid,uuid,timestamptz,jsonb,text)','execute')
  and not has_function_privilege('anon','public.ride_set_access(uuid,text,text,boolean)','execute'),
 'os nomes da etapa 3 seguem só para quem tem sessão');
select is((select array_agg(n order by ord) from pg_proc p cross join lateral unnest(p.proargnames) with ordinality x(n,ord)
   where p.oid='public.ride_quote_with_access(uuid,uuid,timestamptz,jsonb,text)'::regprocedure),
 array['p_key','p_booking','p_scheduled_at','p_legs','p_assistance'],'a porta da etapa 3 mantém os mesmos argumentos');

-- Sem motorista capacitado nenhuma porta promete assistência.
insert into t(k,data) values('antes',pg_temp.counts());
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_with_access(pg_temp.key('wav0'),null,null,pg_temp.trip(),'wheelchair_vehicle')$$,'P0001','ride_assistance_unavailable',
 'PAR-602: a porta da etapa 3 recusa veículo adaptado sem veículo compatível');
select throws_ok($$select public.ride_quote_with_access(pg_temp.key('emb0'),null,null,pg_temp.trip(),'boarding')$$,'P0001','ride_assistance_unavailable',
 'PAR-602: e recusa a ajuda no embarque sem motorista capacitado');
select throws_ok($$select public.ride_quote_with_access(pg_temp.key('dob0'),null,null,pg_temp.trip(),'folding_equipment')$$,'P0001','ride_assistance_unavailable',
 'PAR-602: e a ajuda com equipamento dobrável');
select tests.clear_authentication();
select is(pg_temp.counts(),pg_temp.data('antes'),'as recusas não deixam cotação, assistência cotada, modalidade nem trecho');

-- Com um motorista capacitado para o embarque, a modalidade do mercado ainda segura a promessa.
select pg_temp.driver('assist_206f','boarding');
update private.ride_market_modalities set status='inventory',authorization_ref=null,valid_until=null where environment='simulation' and modality='assist';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_with_access(pg_temp.key('emb1'),null,null,pg_temp.trip(),'boarding')$$,'P0001','ride_modality_unavailable',
 'sem autorização da modalidade de assistência a porta da etapa 3 recusa');
select tests.clear_authentication();
update private.ride_market_modalities set status='pilot',authorization_ref='ficticio-o17-e6',valid_until='infinity' where environment='simulation' and modality='assist';
update private.ride_access_policies set valid_until=now()+interval '5 minutes' where environment='simulation' and area='Saúde' and assistance='boarding';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_with_access(pg_temp.key('emb2'),null,null,pg_temp.trip(),'boarding')$$,'P0001','ride_assistance_unavailable',
 'sem política de embarque vigente até o fim do trecho a porta da etapa 3 recusa');
select tests.clear_authentication();
update private.ride_access_policies set valid_until='infinity' where environment='simulation' and area='Saúde' and assistance='boarding';
select is(pg_temp.counts(),pg_temp.data('antes'),'nenhuma das recusas deixou rastro');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_with_access(pg_temp.key('wav1'),null,null,pg_temp.trip(),'wheelchair_vehicle')$$,'P0001','ride_assistance_unavailable',
 'capacitação para o embarque não sustenta veículo adaptado');

-- A mesma cotação pelas duas portas.
insert into t(k,data) values('plain',public.ride_quote(pg_temp.key('plain'),null,null,pg_temp.trip()));
insert into t(k,data) values('old',public.ride_quote_with_access(pg_temp.key('old'),null,null,pg_temp.trip(),'boarding'));
insert into t(k,data) values('new',public.ride_quote_accessible(pg_temp.key('new'),null,null,pg_temp.trip(),'boarding',false));
update t set id=(data->>'id')::uuid where k in ('plain','old','new');
select is((pg_temp.data('old')#>>'{legs,0,duration_minutes}')::int,(pg_temp.data('plain')#>>'{legs,0,duration_minutes}')::int+3,
 'PAR-602: pela porta da etapa 3 a duração soma os 3 minutos de embarque');
select is(pg_temp.data('old')#>'{legs,0,duration_minutes}',pg_temp.data('new')#>'{legs,0,duration_minutes}','as duas portas dão a mesma duração');
select is(pg_temp.data('old')->'total_cents',pg_temp.data('plain')->'total_cents','a assistência continua sem preço');
select is(public.ride_quote_with_access(pg_temp.key('old'),null,null,pg_temp.trip(),'boarding'),pg_temp.data('old'),'repetir a chave devolve a mesma cotação');
select throws_ok($$select public.ride_quote_with_access(pg_temp.key('old'),null,null,pg_temp.trip(),'folding_equipment')$$,'P0001','idempotency_conflict',
 'a mesma chave com outra assistência é conflito');
select throws_ok($$select public.ride_quote_with_access(pg_temp.key('plain'),null,null,pg_temp.trip(),'boarding')$$,'P0001','idempotency_conflict',
 'a chave de uma cotação comum não ganha assistência pela porta da etapa 3');
select throws_ok($$select public.ride_quote_with_access(pg_temp.key('x1'),null,null,pg_temp.trip(),'paraplegia')$$,'P0001','invalid_input','valor fora da lista segue inválido');
select throws_ok($$select public.ride_quote_with_access(pg_temp.key('x2'),null,null,pg_temp.trip(),null)$$,'P0001','invalid_input','assistência nula segue inválida');
select tests.clear_authentication();
select is((select jsonb_agg(modality order by modality) from private.ride_quote_modes where quote_id=pg_temp.id('old')),'["assist"]'::jsonb,
 'PAR-602: a cotação da porta da etapa 3 carrega a modalidade do catálogo');
select is((select jsonb_build_array(assistance,companion,boarding) from private.ride_access_quotes where quote_id=pg_temp.id('old')),'["boarding",false,{"1":3}]'::jsonb,
 'e guarda o tempo de embarque somado, sem acompanhante');
select is((select count(*)::int from private.ride_access_quotes where quote_id=pg_temp.id('plain')),0,'a cotação comum continua sem assistência');

-- A preferência do trecho: nova assistência só com as mesmas checagens.
select tests.authenticate_as('client_a');
insert into t(k,id) values('ride',(public.ride_consent(pg_temp.id('plain'),true)->>'ride_id')::uuid);
select tests.clear_authentication();
insert into t(k,id) select 'leg',id from public.ride_legs where ride_id=pg_temp.id('ride');
insert into t(k,data) values('antes-leg',pg_temp.counts());
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_set_access(pg_temp.id('leg'),'visual','wheelchair_vehicle',true)$$,'P0001','ride_assistance_unavailable',
 'PAR-602: o trecho não recebe veículo adaptado sem veículo compatível');
select tests.clear_authentication();
update private.ride_market_modalities set status='inventory',authorization_ref=null,valid_until=null where environment='simulation' and modality='assist';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_set_access(pg_temp.id('leg'),'text','boarding',false)$$,'P0001','ride_modality_unavailable',
 'sem autorização da modalidade o trecho não recebe ajuda no embarque');
select tests.clear_authentication();
update private.ride_market_modalities set status='pilot',authorization_ref='ficticio-o17-e6',valid_until='infinity' where environment='simulation' and modality='assist';
select is(pg_temp.counts(),pg_temp.data('antes-leg'),'as recusas não gravam preferência nem modalidade no trecho');
select tests.authenticate_as('client_a');
select is(public.ride_set_access(pg_temp.id('leg'),'text','boarding',false)->>'available','true','com motorista capacitado o trecho recebe a ajuda no embarque');
select tests.clear_authentication();
select is((select jsonb_build_array(assistance,boarding_minutes,companion) from private.ride_access_preferences where leg=pg_temp.id('leg')),'["boarding",3,false]'::jsonb,
 'a preferência guarda a assistência e o tempo de embarque da área');
select is((select jsonb_agg(modality) from private.ride_leg_modes where leg_id=pg_temp.id('leg')),'["assist"]'::jsonb,
 'PAR-602: o trecho passa a carregar a modalidade, revalidada até o fim');
select tests.authenticate_as('client_a');
select lives_ok($$select public.ride_set_access(pg_temp.id('leg'),'sound','boarding',true)$$,'trocar só o sinal ou o compartilhamento continua livre');
select is(public.ride_set_access(pg_temp.id('leg'),'text','none',false)->>'available','true','tirar a assistência continua possível');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_leg_modes where leg_id=pg_temp.id('leg')),0,'sem assistência o trecho perde a modalidade de assistência');
select is((select jsonb_build_array(assistance,boarding_minutes) from private.ride_access_preferences where leg=pg_temp.id('leg')),'["none",0]'::jsonb,
 'e a preferência volta a zero minutos de embarque');
-- Com motorista no trecho a regra da etapa 3 segue: nova assistência pede nova cotação.
select tests.authenticate_as('assist_206f');
select is(public.ride_accept_offer(pg_temp.id('leg'),pg_temp.key('aceite'))->>'status','accepted','o motorista capacitado aceita o trecho');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_set_access(pg_temp.id('leg'),'text','boarding',false)$$,'P0001','ride_assistance_requote',
 'depois do aceite a nova assistência pede nova cotação, como na etapa 3');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_set_access(pg_temp.id('leg'),'text','boarding',false)$$,'P0001','not_allowed','só quem viaja declara a assistência do trecho');
select tests.clear_authentication();

select * from finish();
rollback;
