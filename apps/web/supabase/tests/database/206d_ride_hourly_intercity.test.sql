-- O17 etapa 6 · PAR-606: bloco por hora, extensão com aceite duplo e viagem entre municípios.
-- Identidades, tarifas e corredor fictícios do ensaio; sem rede, sem PSP e sem depender da hora do dia.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,id uuid not null);
create temp table w(k text primary key,at timestamptz not null);
grant all on t,w to authenticated,anon,service_role;
create function pg_temp.id(p text) returns uuid language sql stable as $$select id from t where k=p$$;
create function pg_temp.at(p text) returns timestamptz language sql stable as $$select at from w where k=p$$;
create function pg_temp.key(p text) returns uuid language sql immutable as $$select md5('206d:'||p)::uuid$$;
grant execute on function pg_temp.id(text),pg_temp.at(text),pg_temp.key(text) to authenticated,anon,service_role;
-- Trecho aceito de outro passageiro, para ocupar a agenda de um motorista (fora do papel da API).
create function pg_temp.busy(p_label text,p_driver uuid,p_from timestamptz,p_minutes int) returns void language plpgsql as $$
declare q private.ride_quotes; r uuid; l uuid;
begin
 insert into private.ride_quotes(environment,actor_id,request_key,passenger_id,request_legs,legs,required_users,tariff_id,expires_at,status,total_cents)
 select 'simulation',tests.uid('client_b'),gen_random_uuid(),tests.uid('client_b'),'[]','[]',array[tests.uid('client_b')],x.id,now()+interval '10 minutes','requested',3000
 from private.ride_tariffs x where x.environment='simulation' limit 1 returning * into q;
 insert into public.rides(quote_id,environment,passenger_id) values(q.id,'simulation',tests.uid('client_b')) returning id into r;
 insert into public.ride_legs(ride_id,seq,origin,destination,pickup_at,duration_minutes,slot,fare_cents,fee_cents,extras_cents,driver_cents,
   payer_id,driver_id,tariff_id,status,environment)
 values(r,1,'Saúde','Jabaquara',p_from,p_minutes,tstzrange(p_from,p_from+make_interval(mins=>p_minutes),'[)'),3000,300,0,2700,
   tests.uid('client_b'),p_driver,q.tariff_id,'accepted','simulation') returning id into l;
 insert into t values(p_label,l);
end $$;
create function pg_temp.leg(p_label text) returns void language sql as $$
 insert into t select p_label,l.id from public.ride_legs l where l.ride_id=pg_temp.id(p_label||':ride') $$;
insert into w values('h',now()+interval '3 hours'),('i',now()+interval '8 hours'),('j',now()+interval '14 hours'),('x',now()+interval '20 hours');
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 select tests.uid(u),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true from unnest(array['provider_b','provider_d']) u;
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity)
 select 'simulation','Saúde','Jabaquara',m,'ficticio-206d',tstzrange(now()-interval '1 day',now()+interval '2 days') from unnest(array['cash','pix']) m;

-- Sementes e superfície: só o ensaio recebe tarifa e corredor; ao vivo nada habilita a modalidade.
select is((select count(*)::int from private.ride_block_tariffs where environment='live'),0,'ao vivo não há tarifa de bloco');
select is((select count(*)::int from private.ride_intercity_corridors where environment='live'),0,'ao vivo não há corredor entre municípios');
select is((select count(*)::int||':'||count(*) filter(where evidence_ref='ficticio-o17-e6' and minutes between 60 and 720)::int
 from private.ride_block_tariffs where environment='simulation' and area='Saúde'),'3:3','o ensaio recebe três blocos fictícios por área');
select is((select count(*)::int||':'||bool_and(enabled and authority_ref='ficticio-o17-e6' and coverage_ref='ficticio-o17-e6')
 from private.ride_intercity_corridors where environment='simulation'),'1:true','o ensaio recebe um corredor com referências fictícias');
select ok(private.ride_modality_issue('live','hourly','Saúde','Jabaquara',now()+interval '1 hour') is not null,'ao vivo o bloco por hora segue recusado');
select ok(private.ride_modality_issue('live','intercity','Saúde','Cidade vizinha de ensaio',now()+interval '1 hour') is not null,
 'ao vivo a viagem entre municípios segue recusada');
select ok(not exists(select from private.ride_market_areas where area='Cidade vizinha de ensaio'),'a cidade vizinha fictícia fica fora da praça');
select is((select count(*)::int from pg_class c where c.relnamespace='private'::regnamespace and c.relrowsecurity
 and c.relname in ('ride_block_tariffs','ride_intercity_corridors','ride_leg_blocks','ride_block_extensions','ride_block_extension_decisions')),5,
 'as cinco tabelas têm RLS ligado');
select is((select count(*)::int from pg_class c cross join (values('anon'),('authenticated'),('service_role')) r(n)
 where c.relnamespace='private'::regnamespace and c.relname in ('ride_block_tariffs','ride_intercity_corridors','ride_leg_blocks','ride_block_extensions',
   'ride_block_extension_decisions') and has_table_privilege(r.n,c.oid,'select,insert,update,delete')),0,'nenhum papel da API tem direito sobre as tabelas');
select is((select count(*)::int from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.pronamespace='private'::regnamespace and p.proname in ('ride_block_fee','ride_corridor_registered','ride_corridor','ride_reprice_mode_quote',
   'ride_quote_before_corridors','check_ride_block','freeze_ride_block','extend_ride_block_return','ride_block_issue','ride_before_blocks_eligible',
   'ride_offer_eligible','check_ride_block_amendment','ride_extension_issue','ride_apply_extension','ride_driver_extension_tasks')
 and a.privilege_type='EXECUTE' and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),
   (select oid from pg_roles where rolname='service_role'))),0,'auxiliares e gatilhos não são executáveis pelos papéis da API');
select is((select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('ride_block_options','ride_quote_block',
   'ride_intercity_options','ride_quote_intercity','ride_propose_extension','ride_decide_extension','ride_block_state','ride_quote')
 and (has_function_privilege('anon',p.oid,'execute') or not has_function_privilege('authenticated',p.oid,'execute'))),0,
 'as RPCs são só de quem tem sessão; o anônimo não executa nenhuma');
select has_function('private','ride_driver_extension_tasks',array['uuid'],'o gancho de tarefas do motorista existe com o nome esperado');
select has_function('private','ride_quote_before_corridors','a cotação comum foi preservada sob o novo nome');

-- C5.1 · Bloco de 3 horas: o trecho ocupa 180 minutos e a comissão incide sobre o turno inteiro.
select tests.authenticate_as('client_a');
select is((select jsonb_agg(o->>'code' order by (o->>'minutes')::int) from jsonb_array_elements(public.ride_block_options('Saúde',pg_temp.at('h'))) o),
 '["1h","3h","6h"]'::jsonb,'a área lista os blocos vigentes no início pedido');
select is((select (o->>'minutes')||':'||(o->>'included_km')||':'||(o->>'block_cents')||':'||(o->>'extra_15min_cents')||':'||(o->>'extra_km_cents')
 from jsonb_array_elements(public.ride_block_options('Saúde',pg_temp.at('h'))) o where o->>'code'='3h'),'180:60:24000:2000:300',
 'cada bloco informa minutos, km incluídos, preço e o custo da extensão');
select is(public.ride_block_options('Cidade vizinha de ensaio',pg_temp.at('h')),'[]'::jsonb,'área sem tarifa não oferece bloco');
select is(public.ride_block_options('Saúde',now()+interval '40 days'),'[]'::jsonb,'fora do horizonte de agendamento não há bloco');
select throws_ok($$select public.ride_block_options(null,now())$$,'P0001','invalid_input','área nula é entrada inválida');
select throws_ok($$select public.ride_quote_block(pg_temp.key('h-no'),pg_temp.at('h'),'Saúde','Jabaquara','9h')$$,'P0001','ride_block_unavailable',
 'bloco inexistente na área é recusado');
select throws_ok($$select public.ride_quote_block(pg_temp.key('h-no'),pg_temp.at('h'),'Saúde','Jabaquara',null)$$,'P0001','invalid_input','bloco nulo é entrada inválida');
select throws_ok($$select public.ride_quote_block(pg_temp.key('h-no'),pg_temp.at('h'),'Saúde','Bairro inexistente','3h')$$,'P0001','route_unavailable',
 'o itinerário do bloco passa pelas mesmas regras da cotação comum');
select throws_ok($$select public.ride_quote_block(pg_temp.key('h-no'),now()-interval '1 hour','Saúde','Jabaquara','3h')$$,'P0001','invalid_schedule',
 'início no passado é recusado pela cotação');
insert into t select 'h:quote',(public.ride_quote_block(pg_temp.key('h'),pg_temp.at('h'),'Saúde','Jabaquara','3h')->>'id')::uuid;
select is((public.ride_quote_block(pg_temp.key('h'),pg_temp.at('h'),'Saúde','Jabaquara','3h')->>'id')::uuid,pg_temp.id('h:quote'),
 'repetir a cotação com a mesma chave devolve a mesma proposta');
select is((select (l->>'duration_minutes')||':'||(l->>'block_cents')||':'||(l->>'fare_cents')||':'||(l->>'block') from jsonb_array_elements(
 public.ride_quote_block(pg_temp.key('h'),pg_temp.at('h'),'Saúde','Jabaquara','3h')->'legs') l),'180:24000:24000:3h',
 'a proposta mostra a duração do bloco e o preço do bloco como tarifa');
select is((public.ride_quote_block(pg_temp.key('h'),pg_temp.at('h'),'Saúde','Jabaquara','3h')->>'total_cents')::int,24000,'o total é o preço do bloco');
select throws_ok($$select public.ride_quote_block(pg_temp.key('h'),pg_temp.at('h'),'Saúde','Jabaquara','1h')$$,'P0001','idempotency_conflict',
 'a mesma chave com outro bloco é conflito');
select throws_ok($$select public.ride_quote_block(pg_temp.key('h'),pg_temp.at('h')+interval '1 hour','Saúde','Jabaquara','3h')$$,'P0001','idempotency_conflict',
 'a mesma chave com outro início é conflito');
select throws_ok($$select public.ride_quote_intercity(pg_temp.key('h'),pg_temp.at('h'),'[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]')$$,
 'P0001','idempotency_conflict','a chave de um bloco não serve a outra modalidade');
select tests.clear_authentication();
select is((select (l->>'fee_cents')||'+'||(l->>'driver_cents')||'='||(l->>'fare_cents')||':'||(l->>'extras_cents') from private.ride_quotes q
 cross join lateral jsonb_array_elements(q.legs) l where q.id=pg_temp.id('h:quote')),'2400+21600=24000:0',
 'o bloco está dentro da base: 10% de comissão sobre o bloco inteiro, sem adicional');
select is((select (price_rules->'1'->>'kind')||':'||(price_rules->'1'->>'wait_cents_per_minute')||':'||(price_rules->'1'->>'free_wait_minutes')||':'||
 (price_rules->'1' ? 'id') from private.ride_quotes where id=pg_temp.id('h:quote')),'hourly:0:180:false',
 'a regra de preço do trecho passa a ser a do bloco: espera incluída e sem cobrança por minuto');
select is((select array_agg(modality) from private.ride_quote_modes where quote_id=pg_temp.id('h:quote')),array['hourly'],
 'a modalidade por hora fica presa à proposta pelo auxiliar do catálogo');
select is((select count(*)::int from private.ride_quotes where actor_id=tests.uid('client_a')),1,'as tentativas recusadas não deixam proposta');

-- Bloco fora de validade, menor que o trajeto, e modalidade fechada.
update private.ride_block_tariffs set valid_until=pg_temp.at('h')+interval '5 hours' where environment='simulation' and area='Saúde' and code='6h';
insert into private.ride_block_tariffs(environment,area,code,minutes,included_km,block_cents,extra_15min_cents,extra_km_cents,evidence_ref,valid_until)
 values('simulation','Saúde','curto',60,1,5000,1000,100,'ficticio-206d','infinity');
select tests.authenticate_as('client_b');
select is(jsonb_array_length(public.ride_block_options('Saúde',pg_temp.at('h'))),3,'bloco cuja tarifa vence antes do fim não é oferecido');
select throws_ok($$select public.ride_quote_block(pg_temp.key('b-6h'),pg_temp.at('h'),'Saúde','Jabaquara','6h')$$,'P0001','ride_block_unavailable',
 'tarifa que vence antes do fim do bloco é recusada');
select throws_ok($$select public.ride_quote_block(pg_temp.key('b-curto'),pg_temp.at('h'),'Saúde','Jabaquara','curto')$$,'P0001','ride_block_unavailable',
 'bloco que não comporta o trajeto direto é recusado');
select tests.clear_authentication();
delete from private.ride_block_tariffs where code='curto';
update private.ride_block_tariffs set valid_until='infinity' where environment='simulation' and area='Saúde' and code='6h';
update private.ride_market_modalities set valid_until=now()-interval '1 day' where environment='simulation' and modality='hourly';
select tests.authenticate_as('client_b');
select is(public.ride_block_options('Saúde',pg_temp.at('h')),'[]'::jsonb,'com a autorização vencida nenhum bloco é oferecido');
select throws_ok($$select public.ride_quote_block(pg_temp.key('b-fechado'),pg_temp.at('h'),'Saúde','Jabaquara','3h')$$,'P0001','ride_modality_unavailable',
 'com a modalidade fechada a cotação do bloco é recusada');
select tests.clear_authentication();
update private.ride_market_modalities set valid_until='infinity' where environment='simulation' and modality='hourly';
update private.ride_network set quote_enabled=false where environment='simulation';
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_quote_block(pg_temp.key('b-gate'),pg_temp.at('h'),'Saúde','Jabaquara','3h')$$,'P0001','ride_feature_disabled',
 'com a cotação desligada não há bloco');
select throws_ok($$select public.ride_block_options('Saúde',pg_temp.at('h'))$$,'P0001','ride_feature_disabled','nem lista de blocos');
select tests.clear_authentication();
update private.ride_network set quote_enabled=true where environment='simulation';
select is((select count(*)::int from private.ride_quotes where actor_id=tests.uid('client_b')),0,'nenhuma recusa deixou proposta');

-- Tarifa alterada depois da proposta: o aceite pede nova cotação.
select tests.authenticate_as('client_b');
insert into t select 'h2:quote',(public.ride_quote_block(pg_temp.key('h2'),pg_temp.at('x'),'Jabaquara','Saúde','1h')->>'id')::uuid;
select tests.clear_authentication();
update private.ride_block_tariffs set block_cents=9500 where environment='simulation' and area='Jabaquara' and code='1h';
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_consent(pg_temp.id('h2:quote'),true)$$,'P0001','requote_required','tarifa de bloco alterada depois da proposta exige nova cotação');
select is(public.ride_consent(pg_temp.id('h2:quote'),false)->>'status','declined','a proposta antiga pode ser recusada');
select tests.clear_authentication();
update private.ride_block_tariffs set block_cents=9000 where environment='simulation' and area='Jabaquara' and code='1h';

select tests.authenticate_as('client_a');
insert into t select 'h:ride',(public.ride_consent(pg_temp.id('h:quote'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
select pg_temp.leg('h');
select is((select duration_minutes||':'||(upper(slot)-lower(slot)=interval '180 minutes')||':'||(lower(slot)=pg_temp.at('h')) from public.ride_legs
 where id=pg_temp.id('h')),'180:true:true','C5.1 o trecho do bloco de 3 horas ocupa 180 minutos');
select is((select fare_cents||':'||fee_cents||':'||driver_cents||':'||(driver_cents+fee_cents=fare_cents) from public.ride_legs where id=pg_temp.id('h')),
 '24000:2400:21600:true','C5.1 motorista + comissão = tarifa no turno inteiro');
select is((select kind||':'||code||':'||minutes||':'||included_km||':'||block_cents||':'||extra_15min_cents||':'||extra_km_cents||':'||return_cents||':'||
 (tariff_id is not null)||':'||evidence_ref from private.ride_leg_blocks where leg_id=pg_temp.id('h')),'hourly:3h:180:60:24000:2000:300:0:true:ficticio-o17-e6',
 'os termos do bloco ficam congelados no trecho');
select ok('hourly'=any((select array_agg(modality) from private.ride_leg_modes where leg_id=pg_temp.id('h'))::text[]),
 'o trecho carrega a modalidade por hora, revalidada até o fim previsto');
select tests.authenticate_as('provider_b');
select is(public.ride_accept_offer(pg_temp.id('h'),pg_temp.key('h-accept'))->>'status','accepted','um motorista aceita o bloco');
select tests.authenticate_as('client_a');
insert into t values('h:order',public.ride_open_payment_order(pg_temp.id('h'),'cash'));
select tests.clear_authentication();
select is((select (upper(driver_slot)=upper(slot))::text from public.ride_legs where id=pg_temp.id('h')),'true','bloco sem retorno: a agenda do motorista termina com o bloco');
select is((select amount_cents from private.ride_payment_orders where id=pg_temp.id('h:order')),24000,'a ordem de pagamento nasce com o preço do bloco');

-- Leitura do bloco e permissões.
select tests.authenticate_as('client_a');
select is(public.ride_block_state(pg_temp.id('h'))->>'minutes','180','o passageiro lê o bloco contratado');
select is((public.ride_block_state(pg_temp.id('h'))->>'can_propose')||':'||jsonb_array_length(public.ride_block_state(pg_temp.id('h'))->'extensions'),'true:0',
 'com o trecho em andamento a extensão pode ser proposta');
select throws_ok($$select * from private.ride_block_tariffs$$,'42501',null,'cliente não lê a tabela de tarifas de bloco');
select throws_ok($$select * from private.ride_intercity_corridors$$,'42501',null,'cliente não lê a tabela de corredores');
select throws_ok($$select * from private.ride_leg_blocks$$,'42501',null,'cliente não lê os termos congelados');
select throws_ok($$select * from private.ride_block_extensions$$,'42501',null,'cliente não lê as extensões');
select throws_ok($$select * from private.ride_block_extension_decisions$$,'42501',null,'cliente não lê as decisões');
select throws_ok($$select private.ride_apply_extension(gen_random_uuid())$$,'42501',null,'cliente não aplica extensão pelo auxiliar');
select throws_ok($$select private.ride_reprice_mode_quote(pg_temp.id('h:quote'),'[]','{}')$$,'42501',null,'cliente não reescreve proposta pelo auxiliar');
select throws_ok($$select private.ride_quote_before_corridors(gen_random_uuid(),null,null,'[]')$$,'42501',null,'cliente não alcança a cotação anterior ao corredor');
select throws_ok($$select private.ride_driver_extension_tasks(auth.uid())$$,'42501',null,'cliente não executa o gancho de tarefas');
select tests.authenticate_as('provider_b');
select is(public.ride_block_state(pg_temp.id('h'))->>'included_km','60','o motorista designado lê o bloco');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_block_state(pg_temp.id('h'))$$,'P0001','not_allowed','outra pessoa não lê o bloco');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),30,0,pg_temp.key('alheio'))$$,'P0001','not_allowed','outra pessoa não propõe extensão');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),30,0,pg_temp.key('outro-motorista'))$$,'P0001','not_allowed',
 'motorista que não é o do trecho não propõe extensão');
select tests.authenticate_anon();
select throws_ok($$select public.ride_block_options('Saúde',now())$$,'42501',null,'anônimo não lista blocos');
select throws_ok($$select public.ride_quote_block(gen_random_uuid(),null,'Saúde','Jabaquara','3h')$$,'42501',null,'anônimo não cota bloco');
select throws_ok($$select public.ride_intercity_options()$$,'42501',null,'anônimo não lista corredores');
select throws_ok($$select public.ride_quote_intercity(gen_random_uuid(),null,'[]')$$,'42501',null,'anônimo não cota viagem entre municípios');
select throws_ok($$select public.ride_propose_extension(gen_random_uuid(),30,0,gen_random_uuid())$$,'42501',null,'anônimo não propõe extensão');
select throws_ok($$select public.ride_decide_extension(gen_random_uuid(),true)$$,'42501',null,'anônimo não decide extensão');
select throws_ok($$select public.ride_block_state(gen_random_uuid())$$,'42501',null,'anônimo não lê bloco');
select tests.authenticate_service();
select throws_ok($$select public.ride_propose_extension(gen_random_uuid(),30,0,gen_random_uuid())$$,'42501',null,'o papel de serviço não propõe no lugar das partes');
select throws_ok($$select public.ride_decide_extension(gen_random_uuid(),true)$$,'42501',null,'o papel de serviço não decide no lugar das partes');
select throws_ok($$select public.ride_quote_block(gen_random_uuid(),null,'Saúde','Jabaquara','3h')$$,'42501',null,'o papel de serviço não cota bloco');
select tests.clear_authentication();

-- C5.2 · Extensão de 30 minutos aceita por pagador e motorista.
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),20,0,pg_temp.key('e-bad'))$$,'P0001','invalid_input','tempo fora de múltiplos de 15 minutos é inválido');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),0,0,pg_temp.key('e-bad'))$$,'P0001','invalid_input','extensão vazia é inválida');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),15,-1,pg_temp.key('e-bad'))$$,'P0001','invalid_input','quilometragem negativa é inválida');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),null,0,pg_temp.key('e-bad'))$$,'P0001','invalid_input','tempo nulo é inválido');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),600,0,pg_temp.key('e-bad'))$$,'P0001','ride_extension_unavailable',
 'o trecho não passa de 12 horas no total');
insert into t select 'e1',(public.ride_propose_extension(pg_temp.id('h'),30,0,pg_temp.key('e1'))->>'id')::uuid;
select is(public.ride_propose_extension(pg_temp.id('h'),30,0,pg_temp.key('e1'))->>'id',pg_temp.id('e1')::text,'repetir a proposta com a mesma chave devolve a mesma extensão');
select is((public.ride_propose_extension(pg_temp.id('h'),30,0,pg_temp.key('e1'))->>'cents')||':'||
 (public.ride_propose_extension(pg_temp.id('h'),30,0,pg_temp.key('e1'))->>'replayed'),'4000:true','30 minutos custam dois períodos de 15 ao preço congelado');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),45,0,pg_temp.key('e1'))$$,'P0001','idempotency_conflict','a mesma chave com outro tempo é conflito');
select is((select (x->>'state')||':'||(x->>'may_decide')||':'||(x->>'accepted_by_me')||':'||(x->>'proposed_by_me')
 from jsonb_array_elements(public.ride_block_state(pg_temp.id('h'))->'extensions') x),'pending:true:false:true','o pagador vê a proposta pendente e pode decidir');
select throws_ok($$select public.ride_decide_extension(pg_temp.id('e1'),null)$$,'P0001','invalid_input','resposta nula é entrada inválida');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_decide_extension(pg_temp.id('e1'),true)$$,'P0001','not_allowed','outra pessoa não decide a extensão');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.ride_decide_extension(pg_temp.id('e1'),true)$$,'P0001','not_allowed','outro motorista não decide a extensão');
select is(public.driver_mode_tasks()->'extensions','[]'::jsonb,'outro motorista não recebe a tarefa');
select tests.authenticate_as('provider_b');
select is((select (x->>'id')||':'||(x->>'minutes')||':'||(x->>'km')||':'||(x->>'cents')||':'||(x->>'driver_cents')||':'||(x->>'origin')||':'||(x->>'destination')
 from jsonb_array_elements(public.driver_mode_tasks()->'extensions') x),pg_temp.id('e1')||':30:0:4000:3600:Saúde:Jabaquara',
 'o motorista designado recebe a extensão com a sua parte');
select tests.clear_authentication();
select is((select count(*)::int||':'||min(proposer_role)||':'||(min(operation_key::text)=pg_temp.key('e1')::text)||':'||(array_length(min(required),1))
 from private.ride_block_extensions where leg_id=pg_temp.id('h')),'1:passenger:true:2','uma só proposta, com ator, chave e as duas partes exigidas');
select is((select fare_cents||':'||duration_minutes from public.ride_legs where id=pg_temp.id('h')),'24000:180','propor não muda o trecho');
select tests.authenticate_as('client_a');
select is(public.ride_decide_extension(pg_temp.id('e1'),true),'pending','o aceite do pagador sozinho deixa a extensão pendente');
select is(public.ride_decide_extension(pg_temp.id('e1'),true),'pending','repetir o aceite não muda o estado');
select tests.clear_authentication();
select is((select fare_cents||':'||duration_minutes from public.ride_legs where id=pg_temp.id('h')),'24000:180','sem o aceite do motorista nada é cobrado');
select tests.authenticate_as('provider_b');
select is(public.ride_decide_extension(pg_temp.id('e1'),true),'applied','com o aceite do motorista a extensão é aplicada');
select is(public.ride_decide_extension(pg_temp.id('e1'),true),'applied','C5.2 repetir a decisão devolve o mesmo resultado');
select is(public.driver_mode_tasks()->'extensions','[]'::jsonb,'a tarefa respondida sai da lista');
select tests.authenticate_as('client_a');
select is(public.ride_decide_extension(pg_temp.id('e1'),true),'applied','o pagador repete o aceite e recebe o mesmo estado');
select is(public.ride_propose_extension(pg_temp.id('h'),30,0,pg_temp.key('e1'))->>'state','applied','repetir a proposta aplicada não cria outra');
select throws_ok($$select public.ride_decide_extension(pg_temp.id('e1'),false)$$,'P0001','ride_extension_unavailable','extensão aplicada não é recusada depois');
select is((public.ride_block_state(pg_temp.id('h'))->>'extended_minutes')||':'||(public.ride_block_state(pg_temp.id('h'))->>'extension_cents'),'30:4000',
 'o bloco mostra o total das extensões aceitas');
select tests.clear_authentication();
select is((select duration_minutes||':'||(upper(slot)-lower(slot)=interval '210 minutes')||':'||(lower(slot)=pg_temp.at('h'))||':'||(upper(driver_slot)=upper(slot))
 from public.ride_legs where id=pg_temp.id('h')),'210:true:true:true','C5.2 o trecho passa a 210 minutos, e a agenda do motorista acompanha');
select is((select fare_cents||':'||fee_cents||':'||driver_cents from public.ride_legs where id=pg_temp.id('h')),'28000:2800:25200',
 'C5.2 a tarifa sobe exatamente o preço da extensão, com a comissão sobre a nova base');
select is((select count(*)::int from private.ride_block_extensions where leg_id=pg_temp.id('h')),1,'C5.2 as repetições não criaram outra extensão');
select is((select count(*)::int from private.ride_quotes where existing_ride_id=pg_temp.id('h:ride')),1,'e uma única nova versão de proposta');
select is((select (q.status='requested')||':'||(q.total_cents)||':'||(q.legs->0->>'duration_minutes')||':'||(q.legs->0->>'fare_cents')||':'||
 (select count(*) from private.ride_consents c where c.quote_id=q.id and c.accepted)||':'||
 exists(select from private.ride_consents c where c.quote_id=q.id and c.actor_id=tests.uid('client_a') and c.accepted)
 from private.ride_quotes q join public.ride_legs l on l.source_quote_id=q.id where l.id=pg_temp.id('h')),'true:28000:210:28000:2:true',
 'a nova versão carrega o preço, o tempo e os aceites do pagador e do motorista');
select is((select extended_minutes||':'||extended_km||':'||extension_cents||':'||minutes from private.ride_leg_blocks where leg_id=pg_temp.id('h')),'30:0:4000:180',
 'o trecho soma a extensão sem alterar o bloco contratado');
select is((select state||':'||outcome||':'||(new_quote is not null)||':'||(closed_at is not null) from private.ride_block_extensions where id=pg_temp.id('e1')),
 'applied:accepted:true:true','a extensão fica registrada como aplicada, com hora e nova proposta');
select is((select count(*)::int from private.ride_block_extension_decisions where extension_id=pg_temp.id('e1') and accepted),2,'uma decisão por parte');
select is((select amount_cents||':'||commission_cents from private.ride_payment_orders where id=pg_temp.id('h:order')),'28000:2800',
 'a ordem aberta da etapa 4 acompanha o novo preço');
select is((select count(*)::int from private.ride_order_events where order_id=pg_temp.id('h:order') and action='new_price'),1,'com um único evento de novo preço');

-- C5.3 · Recusa do pagador não muda nada; agenda do motorista em conflito recusa a extensão.
select tests.authenticate_as('provider_b');
insert into t select 'e2',(public.ride_propose_extension(pg_temp.id('h'),15,10,pg_temp.key('e2'))->>'id')::uuid;
select is((public.ride_propose_extension(pg_temp.id('h'),15,10,pg_temp.key('e2'))->>'cents')::int,5000,'o motorista propõe 15 minutos e 10 km ao preço congelado');
select tests.authenticate_as('client_a');
select is(public.ride_decide_extension(pg_temp.id('e2'),false),'declined','C5.3 o pagador recusa a extensão');
select is(public.ride_decide_extension(pg_temp.id('e2'),false),'declined','repetir a recusa devolve o mesmo resultado');
select throws_ok($$select public.ride_decide_extension(pg_temp.id('e2'),true)$$,'P0001','ride_extension_unavailable','depois de recusar não se aceita a mesma extensão');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_decide_extension(pg_temp.id('e2'),true)$$,'P0001','ride_extension_unavailable','o motorista não aceita uma extensão já recusada');
select tests.clear_authentication();
select is((select fare_cents||':'||fee_cents||':'||duration_minutes||':'||(upper(slot)-lower(slot)=interval '210 minutes') from public.ride_legs
 where id=pg_temp.id('h')),'28000:2800:210:true','C5.3 a recusa não muda tarifa, comissão nem tempo');
select is((select extended_minutes||':'||extended_km||':'||extension_cents from private.ride_leg_blocks where leg_id=pg_temp.id('h')),'30:0:4000',
 'nem os totais do bloco: excedente sem aceite não é cobrado');
select is((select state||':'||proposer_role||':'||(new_quote is null) from private.ride_block_extensions where id=pg_temp.id('e2')),'declined:driver:true',
 'a recusa fica registrada sem nova proposta');
select is((select amount_cents from private.ride_payment_orders where id=pg_temp.id('h:order')),28000,'a ordem de pagamento não muda com a recusa');
-- Outro trecho aceito do mesmo motorista logo depois do bloco.
select pg_temp.busy('busy',tests.uid('provider_b'),pg_temp.at('h')+interval '220 minutes',20);
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),30,0,pg_temp.key('e3'))$$,'P0001','ride_extension_unavailable',
 'C5.3 com a agenda do motorista ocupada a extensão de tempo é recusada');
select tests.clear_authentication();
update public.ride_legs set status='cancelled' where id=pg_temp.id('busy');
select tests.authenticate_as('client_a');
insert into t select 'e3',(public.ride_propose_extension(pg_temp.id('h'),30,0,pg_temp.key('e3'))->>'id')::uuid;
select is(public.ride_decide_extension(pg_temp.id('e3'),true),'pending','com a agenda livre a proposta é registrada e o pagador aceita');
select tests.clear_authentication();
-- O conflito aparece depois da proposta: vale a agenda na hora de aplicar.
select pg_temp.busy('busy2',tests.uid('provider_b'),pg_temp.at('h')+interval '220 minutes',20);
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_decide_extension(pg_temp.id('e3'),true)$$,'P0001','ride_extension_unavailable',
 'C5.3 conflito de agenda no momento de aplicar recusa a extensão');
select tests.clear_authentication();
select is((select fare_cents||':'||duration_minutes||':'||(upper(slot)-lower(slot)=interval '210 minutes') from public.ride_legs where id=pg_temp.id('h')),
 '28000:210:true','o conflito não altera o trecho');
select is((select state||':'||(select count(*) from private.ride_block_extension_decisions d where d.extension_id=e.id and d.actor_id=tests.uid('provider_b'))
 from private.ride_block_extensions e where e.id=pg_temp.id('e3')),'pending:0','a extensão segue pendente e o aceite do motorista não ficou registrado');
select tests.authenticate_as('client_a');
select is(public.ride_decide_extension(pg_temp.id('e3'),false),'declined','o pagador retira o aceite e a proposta é encerrada');
-- Só quilometragem não ocupa a agenda; uma proposta nova substitui a pendente.
insert into t select 'e4',(public.ride_propose_extension(pg_temp.id('h'),0,5,pg_temp.key('e4'))->>'id')::uuid;
insert into t select 'e5',(public.ride_propose_extension(pg_temp.id('h'),0,10,pg_temp.key('e5'))->>'id')::uuid;
select throws_ok($$select public.ride_decide_extension(pg_temp.id('e4'),true)$$,'P0001','ride_extension_unavailable','a proposta substituída não é aceita');
select is((select x->>'state' from jsonb_array_elements(public.ride_block_state(pg_temp.id('h'))->'extensions') x where x->>'id'=pg_temp.id('e4')::text),
 'expired','e aparece como expirada');
select is(public.ride_decide_extension(pg_temp.id('e5'),true),'pending','o pagador aceita a extensão de 10 km');
select tests.authenticate_as('provider_b');
select is(public.ride_decide_extension(pg_temp.id('e5'),true),'applied','o motorista aceita e a extensão de km é aplicada com a agenda ocupada');
select tests.clear_authentication();
select is((select state||':'||outcome from private.ride_block_extensions where id=pg_temp.id('e4')),'expired:superseded','a substituição fica registrada');
select is((select fare_cents||':'||fee_cents||':'||driver_cents||':'||duration_minutes||':'||(upper(slot)-lower(slot)=interval '210 minutes')
 from public.ride_legs where id=pg_temp.id('h')),'31000:3100:27900:210:true','10 km a mais somam exatamente o seu preço, sem mexer no tempo');
select is((select extended_minutes||':'||extended_km||':'||extension_cents from private.ride_leg_blocks where leg_id=pg_temp.id('h')),'30:10:7000',
 'os totais somam só as extensões aceitas');
select is((select amount_cents||':'||(select count(*) from private.ride_order_events v where v.order_id=o.id and v.action='new_price')
 from private.ride_payment_orders o where o.id=pg_temp.id('h:order')),'31000:2','a ordem acompanha cada extensão aplicada, uma vez');
-- Proposta vencida e despacho desligado.
select tests.authenticate_as('client_a');
insert into t select 'e6',(public.ride_propose_extension(pg_temp.id('h'),0,1,pg_temp.key('e6'))->>'id')::uuid;
select tests.clear_authentication();
update private.ride_block_extensions set expires_at=now()-interval '1 minute' where id=pg_temp.id('e6');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_decide_extension(pg_temp.id('e6'),true)$$,'P0001','ride_extension_unavailable','proposta vencida não é aceita');
select is((select x->>'state' from jsonb_array_elements(public.ride_block_state(pg_temp.id('h'))->'extensions') x where x->>'id'=pg_temp.id('e6')::text),
 'expired','e aparece como expirada para as partes');
insert into t select 'e7',(public.ride_propose_extension(pg_temp.id('h'),0,2,pg_temp.key('e7'))->>'id')::uuid;
select is(public.ride_decide_extension(pg_temp.id('e7'),true),'pending','o pagador aceita mais 2 km');
select tests.clear_authentication();
select is((select state||':'||outcome from private.ride_block_extensions where id=pg_temp.id('e6')),'expired:superseded','a proposta vencida cede lugar à nova');
update private.ride_network set dispatch_enabled=false where environment='simulation';
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_decide_extension(pg_temp.id('e7'),true)$$,'P0001','ride_feature_disabled','com o despacho desligado nenhuma extensão é aplicada');
select is(public.ride_decide_extension(pg_temp.id('e7'),false),'declined','mas a recusa continua possível');
select tests.clear_authentication();
update private.ride_network set dispatch_enabled=true where environment='simulation';
-- Tarifa de bloco vencida antes do novo fim: o preço congelado deixa de valer para extensões.
update private.ride_block_tariffs set valid_until=pg_temp.at('h')+interval '215 minutes' where environment='simulation' and area='Saúde' and code='3h';
update public.ride_legs set status='cancelled' where id=pg_temp.id('busy2');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),15,0,pg_temp.key('e8'))$$,'P0001','ride_extension_unavailable',
 'tarifa do bloco vencida antes do novo fim recusa a extensão');
select tests.clear_authentication();
update private.ride_block_tariffs set valid_until='infinity' where environment='simulation' and area='Saúde' and code='3h';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),0,1,gen_random_uuid()) from generate_series(1,13)$$,'P0001','rate_limited',
 'propostas em série da mesma pessoa no mesmo trecho são limitadas');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_block_extensions where leg_id=pg_temp.id('h') and state='pending'),0,'e a série recusada não deixa proposta pendente');
select is((select fare_cents||':'||duration_minutes from public.ride_legs where id=pg_temp.id('h')),'31000:210','nenhuma dessas recusas mudou o trecho');
-- Mudança de rota da etapa 1 não se aplica a um bloco: ela recalcularia o preço pelo taxímetro.
select throws_ok($$insert into private.ride_amendments(leg_id) values(pg_temp.id('h'))$$,'P0001','ride_block_unavailable','um bloco por hora não aceita mudança de rota');

-- C5.5 · A conclusão registra a receita uma única vez, pelo valor final.
update public.ride_legs set status='boarded' where id=pg_temp.id('h');
select tests.authenticate_as('provider_b');
select is(public.ride_transition(pg_temp.id('h'),'completed',pg_temp.key('h-done'))->>'status','completed','o motorista conclui o bloco');
select tests.clear_authentication();
select is((select count(*)::int||':'||min(amount_cents)||':'||min(fee_delta)||':'||min(driver_delta) from private.ride_financial_events
 where leg_id=pg_temp.id('h') and kind='earned'),'1:31000:3100:27900','C5.5 uma única linha de receita, no valor da tarifa final');
select is((select (a.fare_cents=l.fare_cents)||':'||(a.fee_cents+a.driver_cents=a.fare_cents) from private.ride_financial_accounts a
 join public.ride_legs l on l.id=a.leg_id where a.leg_id=pg_temp.id('h')),'true:true','a conta financeira guarda a tarifa final com a divisão da D14');
select tests.authenticate_as('provider_b');
select is(public.ride_transition(pg_temp.id('h'),'completed',pg_temp.key('h-done'))->>'replayed','true','repetir a conclusão com a mesma chave é reconhecido');
select is(public.ride_decide_extension(pg_temp.id('e1'),true),'applied','repetir a decisão da extensão depois da conclusão devolve o mesmo estado');
select throws_ok($$select public.ride_transition(pg_temp.id('h'),'completed',pg_temp.key('h-done-2'))$$,'P0001','invalid_ride_transition',
 'outra chave não conclui de novo');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('h'),15,0,pg_temp.key('e9'))$$,'P0001','ride_extension_unavailable',
 'trecho concluído não recebe extensão');
select is(public.ride_block_state(pg_temp.id('h'))->>'can_propose','false','e o bloco concluído não oferece nova proposta');
select tests.clear_authentication();
-- Espera maior que o bloco, sem extensão aceita: a regra do bloco não cobra por minuto.
insert into private.ride_pickup_arrivals(leg_id,arrived_at) values(pg_temp.id('h'),now()-interval '6 hours');
insert into private.ride_events(actor_id,operation_key,leg_id,action,from_status,to_status,at)
 values(tests.uid('provider_b'),gen_random_uuid(),pg_temp.id('h'),'board','arriving','boarded',now()-interval '1 minute');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_add_order_component(pg_temp.id('h'),'wait',500,'pix',pg_temp.key('h-wait'))$$,'P0001','ride_financial_mismatch',
 'tempo além do bloco sem extensão aceita não vira cobrança de espera');
select tests.clear_authentication();
select is((select count(*)::int||':'||sum(amount_cents) from private.ride_financial_events where leg_id=pg_temp.id('h')),'1:31000',
 'C5.5 as repetições da conclusão e da decisão não criaram outra linha');
select is((select fare_cents from public.ride_legs where id=pg_temp.id('h')),31000,'e a tarifa final segue a mesma');

-- Bloco sobre rota conferida com classe: o acréscimo da classe entra na mesma base do bloco.
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_c'),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true);
insert into private.ride_vehicle_capacity(driver_id,vehicle,document_ref,seats,tools,accessible,valid_until,luggage,standard)
 values(tests.uid('provider_c'),'sedan','ensaio/206d',4,false,false,now()+interval '3 days',2,'comfort');
insert into private.ride_driver_shifts(driver_id,area,period)
 values(tests.uid('provider_c'),'Vila Mariana',tstzrange(pg_temp.at('x')-interval '1 hour',pg_temp.at('x')+interval '6 hours','[)'));
insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,luggage,standard,electric,pets,priority_wait_minutes,modality,valid_until,evidence_ref)
 values('simulation','Vila Mariana','conforto','Conforto',300,4,2,'comfort',false,false,null,'car',now()+interval '3 days','ficticio-206d');
select tests.authenticate_as('client_b');
insert into t select 'rota',(public.ride_prepare_route(pg_temp.key('rota'),null,'Vila Mariana','Saúde',
 jsonb_build_object('lat',-23.59,'lng',-46.63,'label','Embarque de ensaio'),jsonb_build_object('lat',-23.61,'lng',-46.64,'label','Destino de ensaio'),null)->>'id')::uuid;
select tests.authenticate_as('admin');
select lives_ok($$select public.ride_claim_route(pg_temp.id('rota')),public.ride_verify_route(pg_temp.id('rota'),4500,19,'ensaio/206d')$$,
 'a operação confere a rota de ensaio');
select tests.authenticate_as('client_b');
select lives_ok($$select public.ride_choose_class(pg_temp.id('rota'),'conforto',pg_temp.at('x'))$$,'a passageira escolhe a classe da rota');
insert into t select 'hc:quote',(public.ride_quote_block(pg_temp.key('hc'),pg_temp.at('x'),'Vila Mariana','Saúde','1h',pg_temp.id('rota'))->>'id')::uuid;
select is((select (l->>'fare_cents')||':'||(l->>'block_cents')||':'||(l->>'duration_minutes')||':'||(l->>'class_code') from jsonb_array_elements(
 public.ride_quote_block(pg_temp.key('hc'),pg_temp.at('x'),'Vila Mariana','Saúde','1h',pg_temp.id('rota'))->'legs') l),'9300:9000:60:conforto',
 'com rota conferida e classe o preço é o bloco mais o acréscimo da classe');
select throws_ok($$select public.ride_quote_block(pg_temp.key('hc'),pg_temp.at('x'),'Vila Mariana','Saúde','1h')$$,'P0001','idempotency_conflict',
 'a mesma chave sem a rota é outro pedido');
insert into t select 'hc:ride',(public.ride_consent(pg_temp.id('hc:quote'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
select pg_temp.leg('hc');
select is((select fare_cents||':'||fee_cents||':'||driver_cents||':'||duration_minutes||':'||(route_case_id=pg_temp.id('rota')) from public.ride_legs
 where id=pg_temp.id('hc')),'9300:930:8370:60:true','a comissão incide sobre bloco e classe, na rota conferida');
select tests.authenticate_as('provider_c');
select is(public.ride_accept_offer(pg_temp.id('hc'),pg_temp.key('hc-accept'))->>'status','accepted','o motorista com o veículo da classe aceita o bloco');
select tests.clear_authentication();
-- Rota de ensaio com pontos de encontro fixos: a nova versão da proposta leva os mesmos pontos.
insert into w values('z',now()+interval '30 hours');
select tests.authenticate_as('client_b');
insert into t select 'hp:quote',(public.ride_quote_block(pg_temp.key('hp'),pg_temp.at('z'),'Saúde','Terminal de ensaio','1h')->>'id')::uuid;
insert into t select 'hp:ride',(public.ride_consent(pg_temp.id('hp:quote'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
select pg_temp.leg('hp');
select tests.authenticate_as('provider_d');
select is(public.ride_accept_offer(pg_temp.id('hp'),pg_temp.key('hp-accept'))->>'status','accepted','um motorista aceita o bloco com destino no terminal de ensaio');
select tests.authenticate_as('client_b');
insert into t select 'hp:e',(public.ride_propose_extension(pg_temp.id('hp'),15,0,pg_temp.key('hp-e'))->>'id')::uuid;
select is(public.ride_decide_extension(pg_temp.id('hp:e'),true),'pending','a pagadora aceita 15 minutos a mais');
select tests.authenticate_as('provider_d');
select is(public.ride_decide_extension(pg_temp.id('hp:e'),true),'applied','o motorista aceita e a extensão é aplicada na rota com pontos fixos');
select tests.authenticate_as('client_b');
select ok(public.ride_leg_points(pg_temp.id('hp'))->'origin' is distinct from 'null'::jsonb and public.ride_leg_points(pg_temp.id('hp'))->'destination' is distinct from 'null'::jsonb,
 'depois da extensão a passageira segue vendo os pontos de encontro do trecho');
select tests.clear_authentication();
select is((select l.duration_minutes||':'||l.fare_cents||':'||(q.legs->0->>'duration_minutes')||':'||(q.legs->0->>'route_minutes')||':'||
 (select count(*) from private.ride_meeting_snapshots m where m.quote_id=q.id and m.seq=l.quote_seq)
 from public.ride_legs l join private.ride_quotes q on q.id=l.source_quote_id where l.id=pg_temp.id('hp')),'75:11000:75:1:1',
 'a nova versão guarda o tempo total acordado e o instantâneo dos pontos');

-- Regra de demanda no par: o bloco não é multiplicado; no corredor ela segue valendo e o retorno é somado.
insert into w values('y',now()+interval '26 hours');
insert into private.ride_demand_rates(environment,origin,destination,validity,multiplier_bps,free_wait_minutes,wait_cents_per_minute,absence_policy,evidence_ref)
 values('simulation','Jabaquara','Vila Mariana',tstzrange(pg_temp.at('y')-interval '1 hour',pg_temp.at('y')+interval '2 hours'),15000,5,80,'Política fictícia de ausência','ficticio-206d'),
  ('simulation','Saúde','Cidade vizinha de ensaio',tstzrange(pg_temp.at('y')-interval '1 hour',pg_temp.at('y')+interval '2 hours'),15000,5,80,'Política fictícia de ausência','ficticio-206d');
select tests.authenticate_as('client_b');
insert into t select 'hd:quote',(public.ride_quote_block(pg_temp.key('hd'),pg_temp.at('y'),'Jabaquara','Vila Mariana','1h')->>'id')::uuid;
insert into t select 'id:quote',(public.ride_quote_intercity(pg_temp.key('id'),pg_temp.at('y'),
 '[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')->>'id')::uuid;
select tests.clear_authentication();
select is((select (q.legs->0->>'fare_cents')||':'||(q.legs->0->>'fee_cents')||':'||(q.price_rules->'1'->>'kind')||':'||(q.price_rules->'1'->>'multiplier_bps')||':'||
 (q.price_rules->'1' ? 'id')||':'||q.total_cents from private.ride_quotes q where q.id=pg_temp.id('hd:quote')),'9000:900:hourly:10000:false:9000',
 'com regra de demanda no par o bloco mantém o preço do bloco e a regra passa a ser a do bloco');
select is((select (q.legs->0->>'fare_cents')||':'||(q.legs->0->>'fee_cents')||':'||(q.legs->0->>'empty_return_cents')||':'||(q.price_rules->'1'->>'base_cents')||':'||
 (q.price_rules->'1'->>'multiplier_bps')||':'||(q.price_rules->'1' ? 'id')||':'||(q.price_rules->'1'->>'empty_return_cents')||':'||q.total_cents
 from private.ride_quotes q where q.id=pg_temp.id('id:quote')),'19023:1902:5200:9215:15000:true:5200:19023',
 'no corredor a regra de demanda continua valendo; o retorno entra depois dela, dentro da base da comissão');
delete from private.ride_demand_rates where evidence_ref='ficticio-206d';

-- C5.6 · Sem corredor, ou com corredor vencido ou desativado, a viagem entre municípios é recusada.
select tests.authenticate_as('client_a');
select is((select (o->>'origin')||'>'||(o->>'destination')||':'||(o->>'empty_return_cents')||':'||(o->>'return_minutes')||':'||(o->>'origin_jurisdiction')||':'||
 (o->>'destination_jurisdiction') from jsonb_array_elements(public.ride_intercity_options()) o),
 'Saúde>Cidade vizinha de ensaio:5200:55:Município de ensaio A:Município de ensaio B','o corredor fictício é listado com competência e custo de retorno');
select ok(not (public.ride_intercity_options()->0) ? 'authority_ref','a lista não expõe as referências internas do corredor');
select throws_ok($$select public.ride_quote_intercity(pg_temp.key('i-sem'),pg_temp.at('i'),'[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]')$$,
 'P0001','ride_corridor_unavailable','C5.6 par de áreas sem corredor é recusado');
select throws_ok($$select public.ride_quote_intercity(pg_temp.key('i-sem'),pg_temp.at('i'),'{}')$$,'P0001','invalid_input','itinerário que não é lista é inválido');
select throws_ok($$select public.ride_quote(pg_temp.key('i-comum'),null,pg_temp.at('i'),'[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')$$,
 'P0001','ride_corridor_unavailable','a cotação comum não vende um corredor entre municípios');
select throws_ok($$select public.ride_quote_block(pg_temp.key('i-bloco'),pg_temp.at('i'),'Saúde','Cidade vizinha de ensaio','3h')$$,
 'P0001','ride_corridor_unavailable','nem o bloco por hora');
select tests.clear_authentication();
update private.ride_intercity_corridors set valid_until=now()-interval '1 hour' where environment='simulation';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_intercity(pg_temp.key('i-venc'),pg_temp.at('i'),'[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')$$,
 'P0001','ride_corridor_unavailable','C5.6 corredor vencido é recusado');
select is(public.ride_intercity_options(),'[]'::jsonb,'e sai da lista');
select tests.clear_authentication();
update private.ride_intercity_corridors set valid_until=pg_temp.at('i')+interval '30 minutes' where environment='simulation';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_intercity(pg_temp.key('i-curto'),pg_temp.at('i'),'[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')$$,
 'P0001','ride_corridor_unavailable','C5.6 corredor que vence antes do fim do trecho é recusado');
select tests.clear_authentication();
update private.ride_intercity_corridors set valid_until='infinity',enabled=false where environment='simulation';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_intercity(pg_temp.key('i-off'),pg_temp.at('i'),'[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')$$,
 'P0001','ride_corridor_unavailable','corredor desativado é recusado');
select throws_ok($$select public.ride_quote(pg_temp.key('i-comum-off'),null,pg_temp.at('i'),'[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')$$,
 'P0001','ride_corridor_unavailable','e o par continua fora da cotação comum enquanto o corredor estiver registrado');
select tests.clear_authentication();
update private.ride_intercity_corridors set enabled=true where environment='simulation';
update private.ride_market_modalities set valid_until=now()-interval '1 day' where environment='simulation' and modality='intercity';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_intercity(pg_temp.key('i-mod'),pg_temp.at('i'),'[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')$$,
 'P0001','ride_modality_unavailable','com a modalidade fechada o corredor não basta');
select is(public.ride_intercity_options(),'[]'::jsonb,'e nenhum corredor é listado');
select tests.clear_authentication();
update private.ride_market_modalities set valid_until='infinity' where environment='simulation' and modality='intercity';
select is((select count(*)::int from private.ride_quotes where actor_id=tests.uid('client_a') and request_key<>pg_temp.key('h') and existing_ride_id is null),0,
 'nenhuma recusa deixou proposta');

-- C5.4 · Retorno sem passageiro: dentro da tarifa e dentro da agenda do motorista.
select tests.authenticate_as('client_a');
insert into t select 'i:quote',(public.ride_quote_intercity(pg_temp.key('i'),pg_temp.at('i'),
 '[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')->>'id')::uuid;
select is((public.ride_quote_intercity(pg_temp.key('i'),pg_temp.at('i'),'[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')->>'id')::uuid,
 pg_temp.id('i:quote'),'repetir a cotação com a mesma chave devolve a mesma proposta');
select is((select (l->>'fare_cents')||':'||(l->>'empty_return_cents')||':'||(l->>'return_minutes')||':'||(l->>'intercity') from jsonb_array_elements(
 public.ride_quote_intercity(pg_temp.key('i'),pg_temp.at('i'),'[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')->'legs') l),
 '14415:5200:55:true','a proposta mostra o retorno sem passageiro como componente à parte');
select throws_ok($$select public.ride_quote_intercity(pg_temp.key('i'),pg_temp.at('i')+interval '1 hour','[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')$$,
 'P0001','idempotency_conflict','a mesma chave com outro horário é conflito');
select tests.clear_authentication();
select is((select ((l->>'fare_cents')::int-(l->>'empty_return_cents')::int)||':'||(l->>'fee_cents')||':'||(l->>'driver_cents')||':'||
 ((l->>'fee_cents')::int+(l->>'driver_cents')::int=(l->>'fare_cents')::int) from private.ride_quotes q cross join lateral jsonb_array_elements(q.legs) l
 where q.id=pg_temp.id('i:quote')),'9215:1441:12974:true','C5.4 a tarifa é o trajeto medido mais o retorno, com 10% sobre a base inteira');
select is((select array_agg(modality) from private.ride_quote_modes where quote_id=pg_temp.id('i:quote')),array['intercity'],
 'a modalidade entre municípios fica presa à proposta');
-- Custo de retorno alterado depois da proposta: o aceite pede nova cotação.
select tests.authenticate_as('client_b');
insert into t select 'i0:quote',(public.ride_quote_intercity(pg_temp.key('i0'),pg_temp.at('x'),
 '[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')->>'id')::uuid;
select tests.clear_authentication();
update private.ride_intercity_corridors set empty_return_cents=6000 where environment='simulation';
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_consent(pg_temp.id('i0:quote'),true)$$,'P0001','requote_required','custo de retorno alterado depois da proposta exige nova cotação');
select tests.clear_authentication();
update private.ride_intercity_corridors set empty_return_cents=5200,enabled=false where environment='simulation';
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_consent(pg_temp.id('i0:quote'),true)$$,'P0001','ride_corridor_unavailable','corredor desativado depois da proposta não vira corrida');
select is(public.ride_consent(pg_temp.id('i0:quote'),false)->>'status','declined','a proposta antiga pode ser recusada');
select tests.clear_authentication();
update private.ride_intercity_corridors set enabled=true where environment='simulation';

select tests.authenticate_as('client_a');
insert into t select 'i:ride',(public.ride_consent(pg_temp.id('i:quote'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
select pg_temp.leg('i');
select is((select fare_cents||':'||fee_cents||':'||driver_cents||':'||duration_minutes from public.ride_legs where id=pg_temp.id('i')),'14415:1441:12974:55',
 'C5.4 a tarifa do trecho inclui o retorno sem passageiro');
select is((select kind||':'||return_cents||':'||return_minutes||':'||authority_ref||':'||coverage_ref||':'||(tariff_id is null) from private.ride_leg_blocks
 where leg_id=pg_temp.id('i')),'intercity:5200:55:ficticio-o17-e6:ficticio-o17-e6:true','os termos do corredor ficam congelados no trecho');
select is((select array_agg(modality) from private.ride_leg_modes where leg_id=pg_temp.id('i')),array['intercity'],'o trecho carrega a modalidade entre municípios');
select tests.authenticate_as('client_a');
select is(public.ride_block_state(pg_temp.id('i')),null,'trecho entre municípios não é bloco por hora');
select throws_ok($$select public.ride_propose_extension(pg_temp.id('i'),15,0,pg_temp.key('i-ext'))$$,'P0001','ride_extension_unavailable',
 'extensão existe só para bloco por hora');
select tests.clear_authentication();

-- C5.7 · Corredor que vence antes do fim do trecho bloqueia a designação.
update private.ride_intercity_corridors set valid_until=pg_temp.at('i')+interval '54 minutes' where environment='simulation';
select is((select private.ride_offer_eligible(tests.uid('provider_d'),l)||':'||private.ride_before_blocks_eligible(tests.uid('provider_d'),l)
 from public.ride_legs l where l.id=pg_temp.id('i')),'false:true','C5.7 com o corredor vencendo antes do fim o motorista deixa de ser elegível');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.ride_accept_offer(pg_temp.id('i'),pg_temp.key('i-accept-cedo'))$$,'P0001','offer_unavailable','C5.7 o aceite é recusado');
select tests.clear_authentication();
select throws_ok($$update public.ride_legs set driver_id=tests.uid('provider_d') where id=pg_temp.id('i')$$,'P0001','ride_corridor_unavailable',
 'C5.7 e a designação direta também');
update private.ride_intercity_corridors set valid_until='infinity',enabled=false where environment='simulation';
select throws_ok($$update public.ride_legs set driver_id=tests.uid('provider_d') where id=pg_temp.id('i')$$,'P0001','ride_corridor_unavailable',
 'corredor desativado bloqueia a designação');
select lives_ok($$update public.ride_legs set updated_at=now() where id=pg_temp.id('i')$$,'sem designar, o trecho segue podendo ser atualizado');
update private.ride_intercity_corridors set enabled=true where environment='simulation';
-- A janela do retorno também precisa estar livre na agenda de quem aceita.
select pg_temp.busy('busy3',tests.uid('provider_b'),pg_temp.at('i')+interval '70 minutes',20);
select is((select private.ride_offer_eligible(tests.uid('provider_b'),l)||':'||private.ride_before_blocks_eligible(tests.uid('provider_b'),l)
 from public.ride_legs l where l.id=pg_temp.id('i')),'false:true','motorista com compromisso durante o retorno não é elegível');
select is((select private.ride_block_issue(l,tests.uid('provider_b')) from public.ride_legs l where l.id=pg_temp.id('i')),'driver_unavailable','pelo motivo da agenda');
update public.ride_legs set status='cancelled' where id=pg_temp.id('busy3');
select tests.authenticate_as('provider_d');
select is(public.ride_accept_offer(pg_temp.id('i'),pg_temp.key('i-accept'))->>'status','accepted','com o corredor válido até o fim o motorista aceita');
select is(public.ride_accept_offer(pg_temp.id('i'),pg_temp.key('i-accept'))->>'replayed','true','repetir o aceite com a mesma chave não muda o resultado');
select tests.clear_authentication();
select is((select (upper(driver_slot)=upper(slot)+interval '55 minutes')||':'||(lower(driver_slot)<=lower(slot)) from public.ride_legs where id=pg_temp.id('i')),
 'true:true','C5.4 a agenda do motorista inclui os minutos do retorno');
select throws_ok($$select pg_temp.busy('busy4',tests.uid('provider_d'),pg_temp.at('i')+interval '70 minutes',20)$$,'23P01',null,
 'outro trecho durante o retorno não entra na agenda do mesmo motorista');
-- Quem regrava a agenda a partir do plano de aproximação (aceite, mudança de horário) não perde o retorno.
update public.ride_legs set driver_slot=tstzrange(lower(driver_slot),upper(slot),'[)') where id=pg_temp.id('i');
select is((select (upper(driver_slot)=upper(slot)+interval '55 minutes')::text from public.ride_legs where id=pg_temp.id('i')),'true',
 'agenda regravada sem o retorno volta a incluí-lo');
update public.ride_legs set updated_at=now() where id=pg_temp.id('i');
select is((select (upper(driver_slot)=upper(slot)+interval '55 minutes')::text from public.ride_legs where id=pg_temp.id('i')),'true',
 'uma atualização que não toca a agenda não soma o retorno de novo');
update public.ride_legs set duration_minutes=duration_minutes+10,slot=tstzrange(lower(slot),upper(slot)+interval '10 minutes','[)') where id=pg_temp.id('i');
select is((select (upper(driver_slot)=upper(slot)+interval '55 minutes')::text from public.ride_legs where id=pg_temp.id('i')),'true',
 'trecho alongado sem regravar a agenda: ela acompanha o novo fim mais o retorno');
select throws_ok($$insert into private.ride_amendments(leg_id) values(pg_temp.id('i'))$$,'P0001','ride_corridor_unavailable',
 'trecho de corredor não aceita mudança de rota');
update private.ride_intercity_corridors set enabled=false where environment='simulation';
select throws_ok($$update public.ride_legs set status='arriving' where id=pg_temp.id('i')$$,'P0001','ride_corridor_unavailable',
 'com o corredor desativado o motorista não inicia o deslocamento');
select tests.authenticate_as('client_a');
select is(public.ride_transition(pg_temp.id('i'),'cancelled',pg_temp.key('i-cancel'))->>'status','cancelled','cancelar continua possível');
select tests.clear_authentication();
update private.ride_intercity_corridors set enabled=true where environment='simulation';
select is((select count(*)::int from private.ride_financial_events where leg_id=pg_temp.id('i')),0,'trecho cancelado não registra receita');

-- Reserva com mudança de horário aceita pelo motorista: a agenda recalculada mantém o retorno.
insert into private.ride_market_areas(environment,market,area) values('simulation','sao-paulo','Cidade vizinha de ensaio');
select tests.authenticate_as('client_b');
insert into t select 'j:quote',(public.ride_quote_intercity(pg_temp.key('j'),pg_temp.at('j'),
 '[{"origin":"Saúde","destination":"Cidade vizinha de ensaio","payer":"passenger"}]')->>'id')::uuid;
insert into t select 'j:ride',(public.ride_consent(pg_temp.id('j:quote'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
select pg_temp.leg('j');
select ok(exists(select from private.ride_reserve_terms where leg_id=pg_temp.id('j')),'com as duas áreas na praça o trecho agendado também é reserva');
select tests.authenticate_as('provider_d');
select is(public.ride_accept_offer(pg_temp.id('j'),pg_temp.key('j-accept'))->>'status','accepted','o motorista confirma a reserva entre municípios');
select tests.authenticate_as('client_b');
select is(public.ride_shift_reservation(pg_temp.id('j'),pg_temp.at('j')+interval '30 minutes','passenger',pg_temp.key('j-shift'))->>'state','proposed',
 'a passageira pede novo horário ao motorista');
select tests.authenticate_as('provider_d');
select is(public.driver_decide_shift(pg_temp.key('j-shift'),true),'applied','o motorista aceita o novo horário');
select tests.clear_authentication();
select is((select (lower(slot)=pg_temp.at('j')+interval '30 minutes')||':'||(upper(driver_slot)=upper(slot)+interval '55 minutes') from public.ride_legs
 where id=pg_temp.id('j')),'true:true','depois da mudança de horário a agenda do motorista segue incluindo o retorno');
select is((select fare_cents||':'||(driver_cents+fee_cents=fare_cents) from public.ride_legs where id=pg_temp.id('j')),'14415:true','e o preço não muda');
update public.ride_legs set status='boarded' where id=pg_temp.id('j');
select tests.authenticate_as('provider_d');
select is(public.ride_transition(pg_temp.id('j'),'completed',pg_temp.key('j-done'))->>'status','completed','o motorista conclui a viagem');
select tests.clear_authentication();
select is((select count(*)::int||':'||min(amount_cents)||':'||min(fee_delta) from private.ride_financial_events where leg_id=pg_temp.id('j')),'1:14415:1441',
 'a viagem entre municípios registra a receita uma vez, com o retorno dentro da base');

select * from finish();
rollback;
