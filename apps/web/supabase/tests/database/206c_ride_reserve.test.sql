-- O17 etapa 6 · PAR-604: reserva sobre a corrida agendada, atraso de voo e troca de terminal.
-- Identidades e áreas fictícias do ensaio; sem rede, sem PSP e sem depender da hora do dia.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,id uuid not null);
create temp table w(k text primary key,at timestamptz not null);
grant all on t,w to authenticated;
create function pg_temp.id(p text) returns uuid language sql stable as $$select id from t where k=p$$;
create function pg_temp.at(p text) returns timestamptz language sql stable as $$select at from w where k=p$$;
create function pg_temp.key(p text) returns uuid language sql immutable as $$select md5('206c:'||p)::uuid$$;
-- Cotação e aceite do próprio passageiro; o trecho é lido depois, fora do papel da API.
create function pg_temp.request(p_label text,p_origin text,p_destination text,p_at timestamptz) returns void language plpgsql as $$
declare q uuid;
begin
 q:=(public.ride_quote(pg_temp.key('quote:'||p_label),null,p_at,jsonb_build_array(jsonb_build_object('origin',p_origin,'destination',p_destination,'payer','passenger')))->>'id')::uuid;
 insert into t values(p_label||':quote',q),(p_label||':ride',(public.ride_consent(q,true)->>'ride_id')::uuid);
end $$;
create function pg_temp.legs() returns void language sql as $$
 insert into t select split_part(t.k,':',1),l.id from t join public.ride_legs l on l.ride_id=t.id where t.k like '%:ride' on conflict do nothing $$;
insert into w values('a',now()+interval '3 hours'),('b',now()+interval '5 hours'),('c',now()+interval '8 hours'),('d',now()+interval '7 hours'),
 ('t',now()+interval '10 hours'),('g',now()+interval '2 hours');
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 select tests.uid(u),'simulation','sedan','approved',current_date+3,tests.uid('admin'),true from unnest(array['provider_b','provider_d']) u;

-- Sementes: só o ensaio recebe política; nenhum job novo; a verificação do O16 continua embaixo.
select is((select count(*)::int from private.ride_reserve_policies where environment='live'),0,'ao vivo não há política de reserva');
select is((select count(*)::int from private.ride_reserve_policies where environment='simulation' and enabled and evidence_ref='ficticio-o17-e6'),4,
 'o ensaio recebe política fictícia nas quatro áreas sintéticas');
select is((select count(*)::int from cron.job where command like '%ride_reservation_check%'),1,'nenhum job novo: segue o job de minuto existente');
select has_function('private','ride_reservation_check_before_reserve','a verificação do O16 foi preservada sob o novo nome');
select is((select airport from private.ride_airport_rules where environment='simulation' and pickup_area='Terminal de ensaio'),'Aeroporto de ensaio',
 'o terminal de ensaio pertence a um aeroporto');

-- Congelamento dos termos no trecho agendado.
select tests.authenticate_as('client_a');
select pg_temp.request('a','Terminal de ensaio','Saúde',pg_temp.at('a'));
select pg_temp.request('b','Saúde','Jabaquara',pg_temp.at('b'));
select pg_temp.request('plain','Saúde','Vila Mariana',null);
select pg_temp.request('short','Jabaquara','Saúde',now()+interval '30 minutes');
select tests.clear_authentication();
select pg_temp.legs();
select is((select state||':'||(confirm_by=pg_temp.at('a')-interval '30 minutes')||':'||max_shift_minutes||':'||(original_pickup=pg_temp.at('a'))
 from private.ride_reserve_terms where leg_id=pg_temp.id('a')),'awaiting_driver:true:180:true','trecho agendado com antecedência congela prazo de confirmação e limite de mudança');
select is((select airport||' / '||terminal from private.ride_reserve_terms where leg_id=pg_temp.id('a')),'Aeroporto de ensaio / Terminal de ensaio',
 'embarque em terminal congela aeroporto e terminal');
select is((select array_agg(modality order by modality) from private.ride_leg_modes where leg_id=pg_temp.id('a')),array['airport','reserve'],
 'o trecho carrega reserva e aeroporto, revalidados até o fim previsto');
select is((select (airport is null and terminal is null)::text from private.ride_reserve_terms where leg_id=pg_temp.id('b')),'true','reserva fora de terminal não tem aeroporto');
select is((select array_agg(modality) from private.ride_leg_modes where leg_id=pg_temp.id('b')),array['reserve'],'fora de terminal o trecho carrega só a reserva');
select is((select count(*)::int from private.ride_reserve_terms where leg_id in (pg_temp.id('plain'),pg_temp.id('short'))),0,
 'corrida imediata ou agendada com antecedência menor que a política segue sem termos de reserva');
select is((select count(*)::int from private.ride_leg_modes where leg_id in (pg_temp.id('plain'),pg_temp.id('short'))),0,'e sem modalidade congelada');
select is((select (actor_id=tests.uid('client_a') and actor_role='passenger' and new_pickup=pg_temp.at('a'))::text from private.ride_reserve_events
 where leg_id=pg_temp.id('a') and action='terms_frozen'),'true','o congelamento fica registrado com o passageiro como ator');

-- Leitura e permissões.
select tests.authenticate_as('client_a');
select is(public.ride_reserve_state(pg_temp.id('a'))->>'state','awaiting_driver','o passageiro lê o estado da própria reserva');
select is((public.ride_reserve_state(pg_temp.id('a'))->>'max_shift_minutes')::int,180,'e o limite de mudança de horário');
select is(public.ride_reserve_state(pg_temp.id('plain')),null,'trecho sem termos devolve nulo');
select is(public.ride_reserve_flight(pg_temp.id('a'),' la-3456 ')->>'flight_ref','LA3456','o passageiro informa o voo da reserva de aeroporto');
select throws_ok($$select public.ride_reserve_flight(pg_temp.id('a'),'voo de amanhã')$$,'P0001','invalid_input','texto livre não é referência de voo');
select throws_ok($$select public.ride_reserve_flight(pg_temp.id('b'),'LA3456')$$,'P0001','invalid_ride_transition','reserva sem terminal não guarda voo');
select is(public.ride_reserve_state(pg_temp.id('a'))->>'flight_ref','LA3456','o passageiro relê o próprio voo');
select throws_ok($$select * from private.ride_reserve_terms$$,'42501',null,'cliente não lê a tabela de termos');
select throws_ok($$select * from private.ride_reserve_shifts$$,'42501',null,'cliente não lê a tabela de mudanças de horário');
select throws_ok($$select * from private.ride_reserve_events$$,'42501',null,'cliente não lê a trilha de eventos');
select throws_ok($$select * from private.ride_reserve_policies$$,'42501',null,'cliente não lê as políticas');
select throws_ok($$select private.ride_reserve_settle(gen_random_uuid(),true,auth.uid())$$,'42501',null,'cliente não executa o auxiliar de decisão');
select throws_ok($$select private.ride_reserve_move(pg_temp.id('a'),now()+interval '1 day')$$,'42501',null,'cliente não move o trecho pelo auxiliar');
select throws_ok($$select private.ride_reservation_check()$$,'42501',null,'cliente não executa a verificação de reservas');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_reserve_state(pg_temp.id('a'))$$,'P0001','not_allowed','outra pessoa não lê a reserva');
select throws_ok($$select public.ride_reserve_flight(pg_temp.id('a'),'LA1')$$,'P0001','not_allowed','outra pessoa não altera o voo');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a')+interval '30 minutes','flight_delay',gen_random_uuid())$$,
 'P0001','not_allowed','outra pessoa não muda o horário da reserva');
select tests.authenticate_anon();
select throws_ok($$select public.ride_reserve_state(gen_random_uuid())$$,'42501',null,'anônimo não lê reserva');
select throws_ok($$select public.ride_shift_reservation(gen_random_uuid(),now()+interval '1 hour','passenger',gen_random_uuid())$$,'42501',null,'anônimo não muda horário');
select throws_ok($$select public.ride_reserve_contingency(gen_random_uuid(),'cancel',null,gen_random_uuid())$$,'42501',null,'anônimo não decide contingência');
select throws_ok($$select public.driver_decide_shift(gen_random_uuid(),true)$$,'42501',null,'anônimo não responde proposta');
select throws_ok($$select public.driver_mode_tasks()$$,'42501',null,'anônimo não lê tarefas de motorista');
select throws_ok($$select public.ride_reserve_flight(gen_random_uuid(),'LA1')$$,'42501',null,'anônimo não informa voo');
select tests.authenticate_service();
select throws_ok($$select public.ride_shift_reservation(gen_random_uuid(),now()+interval '1 hour','passenger',gen_random_uuid())$$,'42501',null,
 'o papel de serviço não age no lugar do passageiro');
select tests.clear_authentication();
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where n.nspname='private' and (p.proname like 'ride\_reserve\_%' or p.proname like 'ride\_terminal\_%' or p.proname in ('check_ride_reserve_window',
   'check_ride_terminal_change','reagree_ride_reserve','freeze_ride_reserve_terms','sync_ride_reserve_terms','ride_driver_shift_tasks',
   'ride_reservation_check','ride_reservation_check_before_reserve'))
 and a.privilege_type='EXECUTE' and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),
   (select oid from pg_roles where rolname='service_role'))),0,'auxiliares e gatilhos da reserva não são executáveis pelos papéis da API');

-- C4.1 · Atraso dentro da política, sem motorista: o trecho muda e há linha de evento.
insert into w values('a1',pg_temp.at('a')+interval '45 minutes');
select tests.authenticate_as('client_a');
select is(public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a1'),'flight_delay',pg_temp.key('a1'))->>'state','applied',
 'atraso de voo dentro da política e sem motorista é aplicado na hora');
select is(public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a1'),'flight_delay',pg_temp.key('a1'))->>'replayed','true','repetir com a mesma chave devolve o mesmo resultado');
select is(public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a1'),'flight_delay',pg_temp.key('a1'))->>'state','applied','e o mesmo estado');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a1')+interval '5 minutes','flight_delay',pg_temp.key('a1'))$$,
 'P0001','idempotency_conflict','a mesma chave com outro horário é conflito');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('a'),'keep_searching',null,pg_temp.key('a1'))$$,
 'P0001','idempotency_conflict','a mesma chave não serve a outra operação');
select tests.clear_authentication();
select is((select (pickup_at=pg_temp.at('a1') and lower(slot)=pg_temp.at('a1') and upper(slot)=pg_temp.at('a1')+make_interval(mins=>duration_minutes)
   and status='requested' and driver_id is null)::text from public.ride_legs where id=pg_temp.id('a')),'true','o trecho passa ao novo horário e segue buscando motorista');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('a') and action='shift_applied' and operation_key=pg_temp.key('a1')
   and actor_id=tests.uid('client_a') and old_pickup=pg_temp.at('a') and new_pickup=pg_temp.at('a1')),1,'uma linha de evento registra a mudança, uma única vez');
select is((select state||':'||outcome||':'||reason from private.ride_reserve_shifts where id=pg_temp.key('a1')),'applied:no_driver:flight_delay','a mudança fica registrada com motivo e desfecho');
select is((select confirm_by from private.ride_reserve_terms where leg_id=pg_temp.id('a')),pg_temp.at('a1')-interval '30 minutes','o prazo de confirmação acompanha o novo horário');
select is((select fare_cents::text||':'||payer_id from public.ride_legs where id=pg_temp.id('a')),
 (select (legs->0->>'fare_cents')||':'||tests.uid('client_a') from private.ride_quotes where id=pg_temp.id('a:quote')),'preço e pagador não mudam');
select is((select count(*)::int from private.ride_quotes where existing_ride_id=pg_temp.id('a:ride')),0,'nenhuma cotação nova é emitida pela mudança de horário');

-- C4.3 · Atraso acima do limite e entradas inválidas são recusados sem tocar o trecho.
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a')+interval '181 minutes','flight_delay',pg_temp.key('a2'))$$,
 'P0001','ride_reserve_window','atraso acima do limite da política é recusado, contado do horário combinado');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a1')-interval '10 minutes','flight_delay',pg_temp.key('a3'))$$,
 'P0001','ride_reserve_window','atraso de voo não antecipa o embarque');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('a'),now()-interval '1 minute','passenger',pg_temp.key('a4'))$$,'P0001','invalid_schedule','horário passado é recusado');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a1'),'passenger',pg_temp.key('a5'))$$,'P0001','invalid_schedule','o mesmo horário não é mudança');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a1')+interval '5 minutes','contingency',pg_temp.key('a6'))$$,'P0001','invalid_input','motivo interno não é aceito do passageiro');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('a'),null,'passenger',pg_temp.key('a7'))$$,'P0001','invalid_input','horário nulo é entrada inválida');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a1')+interval '5 minutes','passenger',null)$$,'P0001','invalid_input','chave nula é entrada inválida');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('b'),pg_temp.at('b')+interval '30 minutes','flight_delay',pg_temp.key('b0'))$$,
 'P0001','invalid_input','atraso de voo exige reserva de aeroporto');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('plain'),now()+interval '1 hour','passenger',pg_temp.key('p0'))$$,
 'P0001','invalid_ride_transition','trecho sem termos de reserva não muda por este caminho');
select tests.clear_authentication();
-- A autorização da modalidade passa a vencer antes do fim do trecho no novo horário.
update private.ride_market_modalities set valid_until=pg_temp.at('a1')+interval '10 minutes' where environment='simulation' and modality='airport';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a1')+interval '30 minutes','flight_delay',pg_temp.key('a8'))$$,
 'P0001','ride_modality_unavailable','o novo horário precisa caber na autorização da modalidade até o fim previsto');
select tests.clear_authentication();
update private.ride_market_modalities set valid_until='infinity' where environment='simulation' and modality='airport';

-- C4.7 · Embarque fora do horário do terminal.
update private.ride_airport_rules set open_from=(pg_temp.at('a1') at time zone 'America/Sao_Paulo')::time-interval '1 hour',
 open_until=(pg_temp.at('a1') at time zone 'America/Sao_Paulo')::time+interval '20 minutes' where environment='simulation' and pickup_area='Terminal de ensaio';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('a'),pg_temp.at('a1')+interval '40 minutes','flight_delay',pg_temp.key('a9'))$$,
 'P0001','ride_reserve_window','novo horário fora do horário do terminal é recusado');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_quote(pg_temp.key('hours-out'),null,pg_temp.at('a1')+interval '40 minutes',
 '[{"origin":"Terminal de ensaio","destination":"Saúde","payer":"passenger"}]')$$,'P0001','ride_reserve_window','cotação com embarque fora do horário do terminal é recusada');
select lives_ok($$select public.ride_quote(pg_temp.key('hours-in'),null,pg_temp.at('a1')+interval '10 minutes',
 '[{"origin":"Terminal de ensaio","destination":"Saúde","payer":"passenger"}]')$$,'dentro do horário do terminal a cotação é emitida');
select lives_ok($$select public.ride_quote(pg_temp.key('hours-drop'),null,pg_temp.at('a1')+interval '40 minutes',
 '[{"origin":"Saúde","destination":"Terminal de ensaio","payer":"passenger"}]')$$,'o horário de embarque do terminal não restringe quem embarca em outra área');
select tests.clear_authentication();
update private.ride_airport_rules set open_from=null,open_until=null where environment='simulation' and pickup_area='Terminal de ensaio';
select is((select (pickup_at=pg_temp.at('a1'))::text||':'||(select count(*) from private.ride_reserve_shifts where leg_id=pg_temp.id('a')) from public.ride_legs where id=pg_temp.id('a')),
 'true:1','as recusas não alteram o trecho nem criam mudança');

-- C4.2 · Com motorista que recusa: volta a solicitado no novo horário e o motorista anterior fica bloqueado.
select tests.authenticate_as('provider_b');
select is(public.ride_accept_offer(pg_temp.id('b'),pg_temp.key('b-accept'))->>'status','accepted','um motorista confirma a reserva');
select tests.clear_authentication();
select is((select state from private.ride_reserve_terms where leg_id=pg_temp.id('b')),'confirmed','a reserva passa a confirmada');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('b') and action='driver_confirmed' and actor_id=tests.uid('provider_b')
 and actor_role='driver'),1,'a confirmação fica registrada com o motorista como ator');
insert into w values('b1',pg_temp.at('b')+interval '30 minutes');
select tests.authenticate_as('client_a');
select is(public.ride_shift_reservation(pg_temp.id('b'),pg_temp.at('b1'),'passenger',pg_temp.key('b1'))->>'state','proposed','com motorista confirmado o novo horário vira proposta');
select ok((public.ride_shift_reservation(pg_temp.id('b'),pg_temp.at('b1'),'passenger',pg_temp.key('b1'))->>'expires_at')::timestamptz>now(),'a proposta tem prazo de resposta');
select is(public.ride_reserve_state(pg_temp.id('b'))#>>'{shift,state}','proposed','o passageiro vê a proposta pendente');
select throws_ok($$select public.driver_mode_tasks()$$,'P0001','not_allowed','quem não é motorista não lê tarefas de motorista');
select throws_ok($$select public.driver_decide_shift(pg_temp.key('b1'),true)$$,'P0001','not_allowed','o passageiro não responde pelo motorista');
select tests.clear_authentication();
select is((select pickup_at from public.ride_legs where id=pg_temp.id('b')),pg_temp.at('b'),'enquanto o motorista não responde o trecho não muda');
select tests.authenticate_as('provider_d');
select is(jsonb_array_length(public.driver_mode_tasks()->'shifts'),0,'outro motorista não vê a proposta');
select throws_ok($$select public.driver_decide_shift(pg_temp.key('b1'),true)$$,'P0001','not_allowed','outro motorista não responde a proposta');
select tests.authenticate_as('provider_b');
select is(public.driver_mode_tasks()#>>'{shifts,0,id}',pg_temp.key('b1')::text,'o motorista designado recebe o pedido de novo horário');
select is((public.driver_mode_tasks()#>>'{shifts,0,new_pickup}')::timestamptz,pg_temp.at('b1'),'com o novo horário pedido');
select is(public.driver_mode_tasks()->'extensions'||(public.driver_mode_tasks()->'departures'),'[]'::jsonb,'sem extensão nem partida do motorista, as outras listas vêm vazias');
select is(public.ride_reserve_state(pg_temp.id('b'))->>'state','confirmed','o motorista designado lê o estado da reserva');
select throws_ok($$select public.driver_decide_shift(pg_temp.key('b1'),null)$$,'P0001','invalid_input','resposta nula é entrada inválida');
select is(public.driver_decide_shift(pg_temp.key('b1'),false),'declined','a recusa devolve a reserva ao despacho');
select is(public.driver_decide_shift(pg_temp.key('b1'),false),'declined','repetir a recusa devolve o mesmo resultado');
select throws_ok($$select public.driver_decide_shift(pg_temp.key('b1'),true)$$,'P0001','offer_unavailable','depois de recusar não se aceita a mesma proposta');
select is(jsonb_array_length(public.driver_mode_tasks()->'shifts'),0,'a proposta respondida sai da lista');
select tests.clear_authentication();
select is((select status||':'||(driver_id is null)||':'||(pickup_at=pg_temp.at('b1'))||':'||(driver_slot is null) from public.ride_legs where id=pg_temp.id('b')),
 'requested:true:true:true','o trecho volta a solicitado, sem motorista, no novo horário');
select ok(exists(select from private.ride_declines where leg_id=pg_temp.id('b') and driver_id=tests.uid('provider_b')),'o motorista anterior fica bloqueado em ride_declines');
select is((select private.ride_offer_eligible(tests.uid('provider_b'),l) from public.ride_legs l where l.id=pg_temp.id('b')),false,'e deixa de ser elegível para o trecho');
select is((select reason||':'||(released_by=tests.uid('provider_b')) from private.ride_reservation_releases where leg_id=pg_temp.id('b')),'schedule_change:true',
 'a liberação fica registrada com o motivo de mudança de horário');
select ok(exists(select from private.ride_driver_offers where leg_id=pg_temp.id('b') and driver_id=tests.uid('provider_d') and state='offered'),
 'o despacho recomeça no novo horário com outro motorista');
select is((select state from private.ride_reserve_terms where leg_id=pg_temp.id('b')),'awaiting_driver','a reserva volta a aguardar motorista');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('b') and action='shift_declined' and actor_id=tests.uid('provider_b')
 and actor_role='driver' and operation_key=pg_temp.key('b1')),1,'a recusa fica registrada uma única vez, com ator e chave');
select is((select state||':'||outcome||':'||accepted from private.ride_reserve_shifts where id=pg_temp.key('b1')),'declined:driver_declined:false','a mudança guarda o desfecho da recusa');
select is((select fare_cents from public.ride_legs where id=pg_temp.id('b')),(select (legs->0->>'fare_cents')::int from private.ride_quotes where id=pg_temp.id('b:quote')),
 'o preço não muda com a devolução ao despacho');

-- Sem resposta no prazo: o job de minuto devolve a reserva ao despacho no novo horário.
select private.dispatch_ride_leg(pg_temp.id('b'));
select tests.authenticate_as('provider_d');
select is(public.ride_accept_offer(pg_temp.id('b'),pg_temp.key('b-accept-d'))->>'status','accepted','outro motorista confirma a reserva no novo horário');
insert into w values('b2',pg_temp.at('b1')+interval '20 minutes');
select tests.authenticate_as('client_a');
select is(public.ride_shift_reservation(pg_temp.id('b'),pg_temp.at('b2'),'passenger',pg_temp.key('b2'))->>'state','proposed','nova proposta ao novo motorista');
select tests.clear_authentication();
update private.ride_reserve_shifts set expires_at=now()-interval '1 second' where id=pg_temp.key('b2');
select tests.authenticate_as('provider_d');
select is(jsonb_array_length(public.driver_mode_tasks()->'shifts'),0,'proposta vencida sai da lista do motorista');
select tests.clear_authentication();
select lives_ok($$select private.ride_reservation_check()$$,'o job de minuto trata a proposta vencida');
select is((select state||':'||outcome from private.ride_reserve_shifts where id=pg_temp.key('b2')),'expired:driver_timeout','sem resposta a proposta expira');
select is((select status||':'||(driver_id is null)||':'||(pickup_at=pg_temp.at('b2')) from public.ride_legs where id=pg_temp.id('b')),'requested:true:true',
 'e o trecho volta ao despacho no novo horário');
select ok(exists(select from private.ride_declines where leg_id=pg_temp.id('b') and driver_id=tests.uid('provider_d')),'o motorista que não respondeu também fica bloqueado');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('b') and action='shift_expired' and actor_role='system'
 and operation_key=pg_temp.key('b2')),1,'a expiração é registrada pelo sistema sob a chave da proposta');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.driver_decide_shift(pg_temp.key('b2'),true)$$,'P0001','offer_unavailable','resposta depois do prazo não reatribui a reserva');
select tests.clear_authentication();

-- Aceite do motorista, proposta substituída e conflito de agenda.
select tests.authenticate_as('client_a');
select pg_temp.request('c','Saúde','Vila Mariana',pg_temp.at('c'));
select tests.authenticate_as('client_b');
select pg_temp.request('d','Jabaquara','Saúde',pg_temp.at('d'));
select tests.clear_authentication();
select pg_temp.legs();
select tests.authenticate_as('provider_d');
select is(public.ride_accept_offer(pg_temp.id('c'),pg_temp.key('c-accept'))->>'status','accepted','o motorista confirma a reserva C');
select is(public.ride_accept_offer(pg_temp.id('d'),pg_temp.key('d-accept'))->>'status','accepted','e a reserva D, mais cedo');
insert into w values('c0',pg_temp.at('c')+interval '20 minutes'),('c1',pg_temp.at('c')+interval '30 minutes'),('d1',pg_temp.at('d')+interval '90 minutes');
select tests.authenticate_as('client_a');
select is(public.ride_shift_reservation(pg_temp.id('c'),pg_temp.at('c0'),'passenger',pg_temp.key('c0'))->>'state','proposed','primeira proposta');
select is(public.ride_shift_reservation(pg_temp.id('c'),pg_temp.at('c1'),'passenger',pg_temp.key('c1'))->>'state','proposed','um pedido mais novo substitui o pendente');
select tests.clear_authentication();
select is((select state||':'||outcome from private.ride_reserve_shifts where id=pg_temp.key('c0')),'expired:superseded','a proposta anterior é encerrada como substituída');
select is((select count(*)::int from private.ride_reserve_shifts where leg_id=pg_temp.id('c') and state='proposed'),1,'há uma única proposta aberta por trecho');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.driver_decide_shift(pg_temp.key('c0'),true)$$,'P0001','offer_unavailable','a proposta substituída não pode ser aceita');
select is(public.driver_decide_shift(pg_temp.key('c1'),true),'applied','o aceite mantém o motorista no novo horário');
select is(public.driver_decide_shift(pg_temp.key('c1'),true),'applied','repetir o aceite devolve o mesmo resultado');
select throws_ok($$select public.driver_decide_shift(pg_temp.key('c1'),false)$$,'P0001','offer_unavailable','depois de aceitar não se recusa a mesma proposta');
select tests.clear_authentication();
select is((select status||':'||(driver_id=tests.uid('provider_d'))||':'||(pickup_at=pg_temp.at('c1'))||':'||(upper(driver_slot)=upper(slot))||':'||(lower(driver_slot)<=pickup_at)
 from public.ride_legs where id=pg_temp.id('c')),'accepted:true:true:true:true','o trecho segue com o mesmo motorista e a agenda dele cobre o novo horário');
select is((select state||':'||(confirm_by=pg_temp.at('c1')-interval '30 minutes') from private.ride_reserve_terms where leg_id=pg_temp.id('c')),'confirmed:true','a reserva segue confirmada');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('c') and action='shift_accepted' and actor_id=tests.uid('provider_d')
 and operation_key=pg_temp.key('c1')),1,'o aceite é registrado uma única vez');
select tests.authenticate_as('client_b');
select is(public.ride_shift_reservation(pg_temp.id('d'),pg_temp.at('d1'),'passenger',pg_temp.key('d1'))->>'state','proposed','proposta que cairia sobre outro compromisso do motorista');
select tests.authenticate_as('provider_d');
select is(public.driver_decide_shift(pg_temp.key('d1'),true),'declined','agenda em conflito: o aceite não cabe e a reserva volta ao despacho');
select is(public.driver_decide_shift(pg_temp.key('d1'),true),'declined','repetir devolve o mesmo resultado');
select tests.clear_authentication();
select is((select state||':'||outcome from private.ride_reserve_shifts where id=pg_temp.key('d1')),'declined:driver_conflict','o desfecho registra o conflito de agenda');
select is((select status||':'||(driver_id is null)||':'||(pickup_at=pg_temp.at('d1')) from public.ride_legs where id=pg_temp.id('d')),'requested:true:true',
 'o trecho em conflito volta a solicitado no novo horário');
select is((select status||':'||(driver_id=tests.uid('provider_d'))||':'||(pickup_at=pg_temp.at('c1')) from public.ride_legs where id=pg_temp.id('c')),'accepted:true:true',
 'o outro compromisso do motorista fica intacto');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('d') and action='shift_conflict' and operation_key=pg_temp.key('d1')),1,'o conflito é registrado');
-- O motorista libera a reserva pelo caminho do O17 etapa 2 com uma proposta aberta: a proposta deixa de valer.
insert into w values('c2',pg_temp.at('c1')+interval '15 minutes');
select tests.authenticate_as('client_a');
select is(public.ride_shift_reservation(pg_temp.id('c'),pg_temp.at('c2'),'passenger',pg_temp.key('c2'))->>'state','proposed','proposta aberta sobre a reserva C');
select tests.authenticate_as('provider_d');
select lives_ok($$select public.driver_release_reservation(pg_temp.id('c'),pg_temp.key('c-release'))$$,'o motorista libera a reserva pelo caminho existente');
select throws_ok($$select public.driver_decide_shift(pg_temp.key('c2'),true)$$,'P0001','offer_unavailable','a proposta feita para a designação anterior não vale mais');
select tests.clear_authentication();
select is((select state||':'||outcome from private.ride_reserve_shifts where id=pg_temp.key('c2')),'expired:leg_changed','a proposta expira quando a designação muda');
select is((select pickup_at from public.ride_legs where id=pg_temp.id('c')),pg_temp.at('c1'),'sem aceite o horário não muda');
select is((select state from private.ride_reserve_terms where leg_id=pg_temp.id('c')),'awaiting_driver','a reserva liberada volta a aguardar motorista');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('c') and action='driver_released' and actor_role='system'),1,'a liberação fica na trilha');

-- O novo horário deixa de poder ser vendido entre o pedido e a resposta: nada muda e o desfecho fica registrado.
insert into w values('e',now()+interval '16 hours');
select tests.authenticate_as('client_b');
select pg_temp.request('e','Vila Mariana','Jabaquara',pg_temp.at('e'));
select tests.clear_authentication();
select pg_temp.legs();
select tests.authenticate_as('provider_b');
select is(public.ride_accept_offer(pg_temp.id('e'),pg_temp.key('e-accept'))->>'status','accepted','um motorista confirma a reserva E');
select tests.authenticate_as('client_b');
select is(public.ride_shift_reservation(pg_temp.id('e'),pg_temp.at('e')+interval '30 minutes','passenger',pg_temp.key('e1'))->>'state','proposed','proposta sobre a reserva E');
select tests.clear_authentication();
update private.ride_market_modalities set valid_until=pg_temp.at('e')+interval '40 minutes' where environment='simulation' and modality='reserve';
select tests.authenticate_as('provider_b');
select is(public.driver_decide_shift(pg_temp.key('e1'),true),'expired','se o novo horário já não cabe na autorização, o aceite não muda nada');
select is(public.driver_decide_shift(pg_temp.key('e1'),true),'expired','e repetir devolve o mesmo resultado');
select tests.clear_authentication();
update private.ride_market_modalities set valid_until='infinity' where environment='simulation' and modality='reserve';
select is((select state||':'||outcome from private.ride_reserve_shifts where id=pg_temp.key('e1')),'expired:unavailable','o desfecho registra que o novo horário ficou indisponível');
select is((select status||':'||(driver_id=tests.uid('provider_b'))||':'||(pickup_at=pg_temp.at('e')) from public.ride_legs where id=pg_temp.id('e')),'accepted:true:true',
 'o trecho segue com o mesmo motorista no horário combinado');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('e') and action='shift_unavailable' and operation_key=pg_temp.key('e1')),1,
 'a indisponibilidade fica na trilha');

-- C4.4 · Troca de terminal: só para terminal com regra própria, habilitada e do mesmo aeroporto.
insert into private.ride_routes(environment,origin,destination,meters,minutes) values('simulation','Saúde','Terminal 2 de ensaio',700,2);
insert into private.ride_market_areas(environment,market,area) values('simulation','sao-paulo','Terminal 2 de ensaio');
select tests.authenticate_as('client_a');
select pg_temp.request('t','Saúde','Terminal de ensaio',pg_temp.at('t'));
insert into t select 'route2',(public.ride_prepare_route(pg_temp.key('route2'),null,'Saúde','Terminal 2 de ensaio',
 '{"lat":-23.6172244,"lng":-46.6304177,"label":"Ponto Saúde (ensaio)"}','{"lat":-23.62,"lng":-46.636,"label":"Ponto T2 (ensaio)"}',null)->>'id')::uuid;
select tests.authenticate_as('admin');
select public.ride_claim_route(pg_temp.id('route2'));
select public.ride_verify_route(pg_temp.id('route2'),700,2,'t206c/terminal2');
select tests.clear_authentication();
select pg_temp.legs();
select is((select airport||' / '||terminal from private.ride_reserve_terms where leg_id=pg_temp.id('t')),'Aeroporto de ensaio / Terminal de ensaio',
 'desembarque em terminal também congela aeroporto e terminal');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_propose_amendment(pg_temp.id('t'),pg_temp.id('route2'),pg_temp.key('amend-1'))$$,'P0001','ride_terminal_unavailable',
 'troca para terminal sem regra própria é recusada');
select tests.clear_authentication();
insert into private.ride_airport_rules(environment,name,pickup_area,pickup_instruction,wait_lat,wait_lng,radius_m,authority_reference,valid_until,enabled,airport)
 values('simulation','Terminal 2 de ensaio','Terminal 2 de ensaio','Embarque no ponto T2 do terminal fictício.',-23.62,-46.636,180,'ficticio-t2-v1','infinity',true,'Outro aeroporto de ensaio');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_propose_amendment(pg_temp.id('t'),pg_temp.id('route2'),pg_temp.key('amend-2'))$$,'P0001','ride_terminal_unavailable',
 'regra de outro aeroporto não serve à troca de terminal');
select tests.clear_authentication();
update private.ride_airport_rules set airport='Aeroporto de ensaio',enabled=false where pickup_area='Terminal 2 de ensaio';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_propose_amendment(pg_temp.id('t'),pg_temp.id('route2'),pg_temp.key('amend-3'))$$,'P0001','ride_terminal_unavailable',
 'regra desabilitada não serve');
select tests.clear_authentication();
update private.ride_airport_rules set enabled=true,valid_until=now()+interval '1 hour' where pickup_area='Terminal 2 de ensaio';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_propose_amendment(pg_temp.id('t'),pg_temp.id('route2'),pg_temp.key('amend-4'))$$,'P0001','ride_terminal_unavailable',
 'regra que vence antes do fim do trecho não serve');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_amendments where leg_id=pg_temp.id('t')),0,'nenhuma alteração foi aberta nas recusas');
update private.ride_airport_rules set valid_until='infinity' where pickup_area='Terminal 2 de ensaio';
select tests.authenticate_as('client_a');
insert into t select 'amend',(public.ride_propose_amendment(pg_temp.id('t'),pg_temp.id('route2'),pg_temp.key('amend-ok'))->>'id')::uuid;
select is(public.ride_amendment_state(pg_temp.id('t'))#>>'{changes,0,status}','pending','com regra própria a troca vira alteração pendente de consentimento');
select tests.clear_authentication();
select is((select destination from public.ride_legs where id=pg_temp.id('t')),'Terminal de ensaio','antes do consentimento o terminal não muda');
select tests.authenticate_as('client_a');
select is(public.ride_decide_amendment(pg_temp.id('amend'),true)->>'status','applied','o consentimento de quem viaja e paga aplica a troca');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_amendment_decisions where change_id=pg_temp.id('amend') and accepted),1,'a troca passou pelos consentimentos da etapa 1');
select is((select destination from public.ride_legs where id=pg_temp.id('t')),'Terminal 2 de ensaio','o trecho passa ao novo terminal');
select is((select airport||' / '||terminal||' / '||state from private.ride_reserve_terms where leg_id=pg_temp.id('t')),'Aeroporto de ensaio / Terminal 2 de ensaio / awaiting_driver',
 'os termos da reserva acompanham o novo terminal');

-- Alteração de rota com novo horário é um novo acordo de todos: vira a referência da reserva.
select tests.authenticate_as('client_a');
insert into t select 'route3',(public.ride_prepare_route(pg_temp.key('route3'),null,'Saúde','Terminal 2 de ensaio',
 '{"lat":-23.6172244,"lng":-46.6304177,"label":"Ponto Saúde (ensaio)"}','{"lat":-23.6201,"lng":-46.6361,"label":"Ponto T2 B (ensaio)"}',null)->>'id')::uuid;
insert into t select 'route4',(public.ride_prepare_route(pg_temp.key('route4'),null,'Terminal de ensaio','Saúde',
 '{"lat":-23.6191632,"lng":-46.6349565,"label":"Ponto T (ensaio)"}','{"lat":-23.6172244,"lng":-46.6304177,"label":"Ponto Saúde (ensaio)"}',null)->>'id')::uuid;
select tests.authenticate_as('admin');
select public.ride_claim_route(pg_temp.id('route3'));
select public.ride_verify_route(pg_temp.id('route3'),710,2,'t206c/terminal2b');
select public.ride_claim_route(pg_temp.id('route4'));
select public.ride_verify_route(pg_temp.id('route4'),511,1,'t206c/terminal1');
insert into w values('t1',pg_temp.at('t')+interval '5 hours');
select tests.authenticate_as('client_a');
insert into t select 'amend-time',(public.ride_propose_amendment(pg_temp.id('t'),pg_temp.id('route3'),pg_temp.key('amend-time'),pg_temp.at('t1'))->>'id')::uuid;
select is(public.ride_decide_amendment(pg_temp.id('amend-time'),true)->>'status','applied','alteração com novo horário e mesmo terminal é aplicada pelos consentimentos');
select tests.clear_authentication();
select is((select (l.pickup_at=pg_temp.at('t1'))||':'||(x.original_pickup=pg_temp.at('t1'))||':'||(x.confirm_by=pg_temp.at('t1')-interval '30 minutes')
 from public.ride_legs l join private.ride_reserve_terms x on x.leg_id=l.id where l.id=pg_temp.id('t')),'true:true:true',
 'o horário acordado na alteração vira a referência e move o prazo de confirmação');
-- Num terminal de embarque, o novo horário pedido por alteração respeita o horário do terminal.
update private.ride_airport_rules set open_from=(pg_temp.at('a1') at time zone 'America/Sao_Paulo')::time-interval '1 hour',
 open_until=(pg_temp.at('a1') at time zone 'America/Sao_Paulo')::time+interval '20 minutes' where environment='simulation' and pickup_area='Terminal de ensaio';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_propose_amendment(pg_temp.id('a'),pg_temp.id('route4'),pg_temp.key('amend-hours'),pg_temp.at('a1')+interval '40 minutes')$$,
 'P0001','ride_reserve_window','alteração com embarque fora do horário do terminal é recusada');
select lives_ok($$select public.ride_propose_amendment(pg_temp.id('a'),pg_temp.id('route4'),pg_temp.key('amend-hours-in'),pg_temp.at('a1')+interval '10 minutes')$$,
 'dentro do horário do terminal a alteração é aberta');
select tests.clear_authentication();
update private.ride_airport_rules set open_from=null,open_until=null where environment='simulation' and pickup_area='Terminal de ensaio';

-- C4.6 · Ausência de motorista: depois de confirm_by a reserva entra em contingência; remarcar e cancelar ficam na trilha.
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity)
 values('simulation','Jabaquara','Vila Mariana','pix','ficticio-206c',tstzrange(now()-interval '1 day',now()+interval '10 days'));
select tests.authenticate_as('client_b');
select pg_temp.request('g','Jabaquara','Vila Mariana',pg_temp.at('g'));
select tests.clear_authentication();
select pg_temp.legs();
select tests.authenticate_as('client_b');
insert into t values('g:order',public.ride_open_payment_order(pg_temp.id('g'),'pix'));
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('g'),'cancel',null,pg_temp.key('g-early'))$$,'P0001','invalid_ride_transition',
 'antes do prazo de confirmação não há contingência a decidir');
select tests.clear_authentication();
select private.ride_reservation_check();
select is((select state from private.ride_reserve_terms where leg_id=pg_temp.id('g')),'awaiting_driver','antes do prazo o job não muda a reserva');
update private.ride_reserve_terms set confirm_by=now()-interval '1 minute' where leg_id=pg_temp.id('g');
select private.ride_reservation_check();
select private.ride_reservation_check();
select is((select state from private.ride_reserve_terms where leg_id=pg_temp.id('g')),'contingency','passado o prazo sem motorista a reserva entra em contingência');
select is((select count(*)::int from private.ride_passenger_notices where leg_id=pg_temp.id('g') and owner_id=tests.uid('client_b') and event='reserve_unconfirmed'),1,
 'o passageiro recebe o aviso reserve_unconfirmed uma única vez');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('g') and action='unconfirmed' and actor_role='system'),1,
 'a entrada em contingência é registrada uma vez pelo sistema');
select is((select status from public.ride_legs where id=pg_temp.id('g')),'requested','a busca continua enquanto o passageiro decide');
select tests.authenticate_as('client_b');
select is(public.ride_reserve_state(pg_temp.id('g'))->>'can_decide','true','o passageiro pode decidir a contingência');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('g'),pg_temp.at('g')+interval '30 minutes','passenger',pg_temp.key('g-shift'))$$,
 'P0001','invalid_ride_transition','em contingência a mudança de horário é a remarcação');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('g'),'esperar',null,pg_temp.key('g-x1'))$$,'P0001','invalid_input','escolha desconhecida é entrada inválida');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('g'),'rebook',null,pg_temp.key('g-x2'))$$,'P0001','invalid_input','remarcar exige o novo horário');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('g'),'cancel',now()+interval '3 hours',pg_temp.key('g-x3'))$$,'P0001','invalid_input','cancelar não leva horário');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('g'),'cancel',null,null)$$,'P0001','invalid_input','chave nula é entrada inválida');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('g'),'cancel',null,pg_temp.key('g-x4'))$$,'P0001','not_allowed','outra pessoa não decide a contingência');
select tests.authenticate_as('client_b');
select is(public.ride_reserve_contingency(pg_temp.id('g'),'keep_searching',null,pg_temp.key('g-keep'))->>'state','contingency','continuar buscando mantém as escolhas abertas');
select is(public.ride_reserve_contingency(pg_temp.id('g'),'keep_searching',null,pg_temp.key('g-keep'))->>'replayed','true','repetir a escolha devolve o resultado guardado');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('g'),'cancel',null,pg_temp.key('g-keep'))$$,'P0001','idempotency_conflict','a mesma chave com outra escolha é conflito');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('g'),'rebook',now()+interval '10 minutes',pg_temp.key('g-soon'))$$,'P0001','ride_reserve_window',
 'remarcar exige prazo de confirmação ainda à frente');
insert into w values('g1',now()+interval '4 hours');
select is(public.ride_reserve_contingency(pg_temp.id('g'),'rebook',pg_temp.at('g1'),pg_temp.key('g-rebook'))->>'state','awaiting_driver','remarcar reabre a reserva no novo horário');
select is(public.ride_reserve_contingency(pg_temp.id('g'),'rebook',pg_temp.at('g1'),pg_temp.key('g-rebook'))->>'replayed','true','repetir a remarcação é idempotente');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('g'),'rebook',pg_temp.at('g1')+interval '1 minute',pg_temp.key('g-rebook'))$$,'P0001','idempotency_conflict',
 'a mesma chave com outro horário é conflito');
select tests.clear_authentication();
select is((select status||':'||(pickup_at=pg_temp.at('g1'))||':'||(driver_id is null) from public.ride_legs where id=pg_temp.id('g')),'requested:true:true','o trecho remarcado busca motorista no novo horário');
select is((select state||':'||(original_pickup=pg_temp.at('g1'))||':'||(confirm_by=pg_temp.at('g1')-interval '30 minutes') from private.ride_reserve_terms where leg_id=pg_temp.id('g')),
 'awaiting_driver:true:true','os termos passam a contar do horário remarcado');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('g') and action='rebook' and actor_id=tests.uid('client_b') and actor_role='passenger'
 and operation_key=pg_temp.key('g-rebook') and old_pickup=pg_temp.at('g') and new_pickup=pg_temp.at('g1')),1,'a remarcação fica em ride_reserve_events, uma única vez');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('g') and action='keep_searching' and operation_key=pg_temp.key('g-keep')),1,
 'a escolha de continuar buscando também fica na trilha, uma única vez');
select is((select reason||':'||outcome from private.ride_reserve_shifts where id=pg_temp.key('g-rebook')),'contingency:contingency_rebook','a remarcação registra horário antigo e novo');
select is((select status||':'||amount_cents||':'||payer from private.ride_payment_orders where id=pg_temp.id('g:order')),
 (select 'open:'||fare_cents||':'||tests.uid('client_b') from public.ride_legs where id=pg_temp.id('g')),'a ordem aberta segue igual: preço e pagador não mudam na remarcação');
select is((select fare_cents from public.ride_legs where id=pg_temp.id('g')),(select (legs->0->>'fare_cents')::int from private.ride_quotes where id=pg_temp.id('g:quote')),
 'o preço é o da cotação aceita');
update private.ride_reserve_terms set confirm_by=now()-interval '1 minute' where leg_id=pg_temp.id('g');
select private.ride_reservation_check();
select is((select state from private.ride_reserve_terms where leg_id=pg_temp.id('g')),'contingency','nova ausência de motorista abre nova contingência');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('g') and action='unconfirmed'),2,'cada contingência tem sua linha');
select tests.authenticate_as('client_b');
select is(public.ride_reserve_contingency(pg_temp.id('g'),'cancel',null,pg_temp.key('g-cancel'))->>'state','released','cancelar encerra a reserva');
select is(public.ride_reserve_contingency(pg_temp.id('g'),'cancel',null,pg_temp.key('g-cancel'))->>'replayed','true','repetir o cancelamento devolve o resultado guardado');
select is((public.ride_reserve_contingency(pg_temp.id('g'),'cancel',null,pg_temp.key('g-cancel'))->>'refund_due_cents')::int,0,'nada foi recebido, nada a restituir');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('g'),'keep_searching',null,pg_temp.key('g-after'))$$,'P0001','invalid_ride_transition',
 'reserva encerrada não aceita nova escolha');
select is(public.ride_reserve_state(pg_temp.id('g'))->>'state','released','o passageiro vê a reserva encerrada');
select tests.clear_authentication();
select is((select status from public.ride_legs where id=pg_temp.id('g')),'cancelled','o cancelamento passa pela transição do trecho');
select ok(exists(select from private.ride_events where actor_id=tests.uid('client_b') and operation_key=pg_temp.key('g-cancel') and leg_id=pg_temp.id('g') and to_status='cancelled'),
 'a transição fica sob a mesma chave de operação');
select is((select status from private.ride_payment_orders where id=pg_temp.id('g:order')),'cancelled','a ordem não gasta é encerrada pelo gatilho da etapa 4');
select is((select (state='released' and closed_at is not null)::text from private.ride_reserve_terms where leg_id=pg_temp.id('g')),'true','os termos ficam encerrados com data');
select is((select (data->>'orders_cancelled')||':'||(data->>'refund_due_cents') from private.ride_reserve_events where leg_id=pg_temp.id('g') and action='cancel'
 and actor_id=tests.uid('client_b') and operation_key=pg_temp.key('g-cancel')),'1:0','o cancelamento fica em ride_reserve_events com o efeito financeiro');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('g') and action='cancel'),1,'uma única linha de cancelamento');

-- Cancelamento com valor já recebido: a restituição devida fica registrada; a devolução segue o fluxo da etapa 4.
insert into w values('h',now()+interval '6 hours');
select tests.authenticate_as('client_b');
select pg_temp.request('h','Jabaquara','Vila Mariana',pg_temp.at('h'));
select tests.clear_authentication();
select pg_temp.legs();
select tests.authenticate_as('client_b');
insert into t values('h:order',public.ride_open_payment_order(pg_temp.id('h'),'pix'));
select tests.clear_authentication();
update private.ride_payment_orders set status='paid',received_cents=amount_cents where id=pg_temp.id('h:order');
update private.ride_reserve_terms set confirm_by=now()-interval '1 minute' where leg_id=pg_temp.id('h');
select private.ride_reservation_check();
select tests.authenticate_as('client_b');
select ok((public.ride_reserve_contingency(pg_temp.id('h'),'cancel',null,pg_temp.key('h-cancel'))->>'refund_due_cents')::int>0,'com valor recebido o cancelamento informa a restituição devida');
select tests.clear_authentication();
select is((select (data->>'refund_due_cents')||':'||(data->>'orders_cancelled') from private.ride_reserve_events where leg_id=pg_temp.id('h') and action='cancel'),
 (select fare_cents||':0' from public.ride_legs where id=pg_temp.id('h')),'a trilha guarda o valor a restituir, igual ao recebido');
select is((select status||':'||received_cents from private.ride_payment_orders where id=pg_temp.id('h:order')),
 (select 'paid:'||fare_cents from public.ride_legs where id=pg_temp.id('h')),'a ordem paga não é apagada: a devolução passa pelo fluxo de reembolso');

-- Sem política habilitada ou sem autorização de reserva, a corrida agendada do O16 segue sem termos.
update private.ride_reserve_policies set enabled=false where environment='simulation' and area='Vila Mariana';
update private.ride_market_modalities set status='inventory',authorization_ref=null,valid_until=null where environment='simulation' and modality='reserve';
select tests.authenticate_as('client_b');
select pg_temp.request('nopolicy','Vila Mariana','Saúde',now()+interval '12 hours');
select pg_temp.request('nogate','Jabaquara','Saúde',now()+interval '14 hours');
select tests.clear_authentication();
select pg_temp.legs();
select is((select count(*)::int from public.ride_legs where id in (pg_temp.id('nopolicy'),pg_temp.id('nogate')) and status='requested'),2,
 'a corrida agendada continua sendo criada sem a reserva');
select is((select count(*)::int from private.ride_reserve_terms where leg_id in (pg_temp.id('nopolicy'),pg_temp.id('nogate'))),0,'sem política ou sem autorização não há termos de reserva');
select is((select count(*)::int from private.ride_leg_modes where leg_id in (pg_temp.id('nopolicy'),pg_temp.id('nogate'))),0,'nem modalidade congelada');

-- C4.8 · Toda linha de desfecho tem ator, horário e chave de operação.
select is((select count(*)::int from private.ride_reserve_events where at is null or operation_key is null or actor_role is null
 or (actor_id is null)<>(actor_role='system')),0,'toda linha de evento tem ator (ou o sistema), horário e chave de operação');
select is((select count(*)::int from private.ride_reserve_shifts s where s.state<>'proposed' and (s.outcome is null or s.decided_at is null or s.requested_by is null
 or not exists(select from private.ride_reserve_events e where e.operation_key=s.id and e.leg_id=s.leg_id))),0,
 'toda mudança de horário encerrada tem desfecho, horário e evento sob a própria chave');
select is((select count(*)::int from (select operation_key,action from private.ride_reserve_events group by 1,2 having count(*)>1) x),0,'nenhuma operação é registrada duas vezes');
select is((select array_agg(distinct action order by action) from private.ride_reserve_events where action in ('shift_applied','shift_declined','shift_expired','shift_accepted',
 'shift_conflict','rebook','cancel','keep_searching','unconfirmed')),array['cancel','keep_searching','rebook','shift_accepted','shift_applied','shift_conflict','shift_declined',
 'shift_expired','unconfirmed'],'atraso, recusa, expiração, aceite, conflito, remarcação e cancelamento deixaram trilha');
select * from finish();
rollback;
