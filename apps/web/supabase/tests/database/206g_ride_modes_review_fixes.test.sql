-- O17 etapa 6 · correções da revisão das modalidades (110609). Cada bloco nomeia o achado e
-- falha sem a correção. Identidades e áreas fictícias do ensaio; sem rede, sem PSP e sem
-- depender da hora do dia.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,id uuid,data jsonb);
create temp table w(k text primary key,at timestamptz not null);
grant all on t,w to authenticated;
create function pg_temp.id(p text) returns uuid language sql stable as $$select id from t where k=p$$;
create function pg_temp.data(p text) returns jsonb language sql stable as $$select data from t where k=p$$;
create function pg_temp.at(p text) returns timestamptz language sql stable as $$select at from w where k=p$$;
create function pg_temp.key(p text) returns uuid language sql immutable as $$select md5('206g:'||p)::uuid$$;
create function pg_temp.trip(p_origin text,p_destination text) returns jsonb language sql immutable as
 $$select jsonb_build_array(jsonb_build_object('origin',p_origin,'destination',p_destination,'payer','passenger'))$$;
create function pg_temp.dep(n int) returns timestamptz language sql stable as
 $$select ((now() at time zone 'America/Sao_Paulo')::date+n+time '10:00') at time zone 'America/Sao_Paulo'$$;
grant execute on function pg_temp.id(text),pg_temp.data(text),pg_temp.at(text),pg_temp.key(text),pg_temp.trip(text,text),pg_temp.dep(int) to authenticated;
-- Cotação comum e aceite do próprio passageiro; o trecho é lido depois, fora do papel da API.
create function pg_temp.request(p_label text,p_origin text,p_destination text,p_at timestamptz) returns void language plpgsql as $$
declare q uuid;
begin
 q:=(public.ride_quote(pg_temp.key('quote:'||p_label),null,p_at,pg_temp.trip(p_origin,p_destination))->>'id')::uuid;
 insert into t(k,id) values(p_label||':quote',q),(p_label||':ride',(public.ride_consent(q,true)->>'ride_id')::uuid);
end $$;
create function pg_temp.legs() returns void language sql as $$
 insert into t(k,id) select split_part(t.k,':',1),l.id from t join public.ride_legs l on l.ride_id=t.id where t.k like '%:ride' on conflict do nothing $$;
-- Um motorista fictício em turno na Saúde, com a capacitação dada e sem equipamento vistoriado.
create function pg_temp.driver(p text,p_capability text) returns void language plpgsql as $$
begin
 perform tests.create_user(p);
 insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
  values(tests.uid(p),'simulation','sedan','approved',private.sp_date(now())+3,tests.uid('admin'),true);
 insert into private.ride_driver_credentials(driver_id,vehicle_identifier,vehicle_category,driver_document_ref,vehicle_document_ref,insurance_ref,
   driver_until,vehicle_until,insurance_until,inspected_by)
  values(tests.uid(p),'VEI-'||p,'sedan','DOC-206G','VEI-'||p,'SEG-206G',private.sp_date(now())+3,private.sp_date(now())+3,private.sp_date(now())+3,tests.uid('admin'));
 insert into private.ride_assist_capabilities values(tests.uid(p),'VEI-'||p,p_capability,'CURSO-206G','VIST-206G',now()+interval '1 day');
 insert into private.ride_driver_shifts(driver_id,area,period) values(tests.uid(p),'Saúde',tstzrange(now()-interval '5 minutes',now()+interval '3 hours'));
end $$;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_b'),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true);
insert into private.ride_vehicle_capacity(driver_id,vehicle,document_ref,seats,valid_until) values(tests.uid('provider_b'),'sedan','TEST-206G',4,now()+interval '30 days');
-- Regra de demanda fictícia no par Saúde → Jabaquara o dia inteiro: 3 min de espera grátis, R$ 1,00 por minuto depois.
insert into private.ride_demand_rates(environment,origin,destination,validity,multiplier_bps,free_wait_minutes,wait_cents_per_minute,absence_policy,evidence_ref)
 values('simulation','Saúde','Jabaquara',tstzrange(now()-interval '1 hour',now()+interval '1 day'),10000,3,100,'Espera fictícia de ensaio.','ficticio-206g');
select tests.authenticate_as('client_a');
select pg_temp.request('pa','Saúde','Vila Mariana',null);
select tests.authenticate_as('client_b');
select pg_temp.request('pb','Saúde','Vila Mariana',null);
select tests.clear_authentication();
select pg_temp.legs();
-- Um caso de segurança aberto pela passageira B: o protocolo serve às restrições fictícias abaixo.
select tests.authenticate_as('client_b');
insert into t(k,id) values('case',public.ride_safety_case(pg_temp.id('pb'),'harassment',pg_temp.key('case')));
select tests.clear_authentication();
create function pg_temp.restrict(p_user text) returns void language sql as $$
 insert into private.ride_restrictions(subject,environment,protocol,decided_by,reason,proof_ref,until_at,appeal_until)
 values(tests.uid(p_user),'simulation',pg_temp.id('case'),tests.uid('admin'),'conduct','EVID-206G',now()+interval '10 days',now()+interval '30 days') $$;

-- ── Achado 10 · a oferta acessível só conta motorista que pode atender a passageira.
select pg_temp.driver('assist_206g','boarding');
insert into private.ride_pair_blocks(actor,other,leg) values(tests.uid('client_a'),tests.uid('assist_206g'),pg_temp.id('pa'));
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('par1'),null,null,pg_temp.trip('Saúde','Jabaquara'),'boarding',false)$$,'P0001','ride_assistance_unavailable',
 'achado 10: o único motorista capacitado bloqueado pela passageira não sustenta a promessa');
select tests.clear_authentication();
update private.ride_pair_blocks set actor=tests.uid('assist_206g'),other=tests.uid('client_a') where actor=tests.uid('client_a');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_with_access(pg_temp.key('par2'),null,null,pg_temp.trip('Saúde','Jabaquara'),'boarding')$$,'P0001','ride_assistance_unavailable',
 'achado 10: nem quando o motorista bloqueou a passageira, por qualquer porta');
select tests.clear_authentication();
delete from private.ride_pair_blocks where actor=tests.uid('assist_206g');
select pg_temp.restrict('assist_206g');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_quote_accessible(pg_temp.key('par3'),null,null,pg_temp.trip('Saúde','Jabaquara'),'boarding',false)$$,'P0001','ride_assistance_unavailable',
 'achado 10: nem com o motorista sob restrição da operação');
select tests.clear_authentication();
delete from private.ride_restrictions where subject=tests.uid('assist_206g');
select is((select count(*)::int from private.ride_quotes where request_key in (pg_temp.key('par1'),pg_temp.key('par2'),pg_temp.key('par3'))),0,
 'as recusas não deixam cotação');

-- ── Achado 12 · o tempo de embarque assistido não é cobrado como espera.
select tests.authenticate_as('client_a');
insert into t(k,data) values('qb',public.ride_quote_accessible(pg_temp.key('qb'),null,null,pg_temp.trip('Saúde','Jabaquara'),'boarding',false));
insert into t(k,data) values('qplain',public.ride_quote(pg_temp.key('qplain'),null,null,pg_temp.trip('Saúde','Jabaquara')));
update t set id=(data->>'id')::uuid where k in ('qb','qplain');
select is(public.ride_quote_accessible(pg_temp.key('qb'),null,null,pg_temp.trip('Saúde','Jabaquara'),'boarding',false)->>'id',pg_temp.id('qb')::text,
 'repetir o pedido devolve a mesma cotação');
select tests.clear_authentication();
select is((select jsonb_build_array((price_rules#>>'{1,free_wait_minutes}')::int,(price_rules#>>'{1,assisted_boarding_minutes}')::int,(price_rules#>>'{1,wait_cents_per_minute}')::int)
   from private.ride_quotes where id=pg_temp.id('qb')),'[6,3,100]'::jsonb,
 'achado 12: a franquia de espera soma os 3 minutos de embarque aos 3 da regra, uma única vez mesmo com a repetição');
select is((select (price_rules#>>'{1,free_wait_minutes}')::int from private.ride_quotes where id=pg_temp.id('qplain')),3,'sem assistência a franquia é a da regra');
select is((select total_cents from private.ride_quotes where id=pg_temp.id('qb')),(select total_cents from private.ride_quotes where id=pg_temp.id('qplain')),
 'a assistência continua sem preço');

-- ── Achado 13 · regra positiva para adicionais e classes: nada de cobrar assistência.
select throws_ok($$insert into private.ride_extra_prices select id,'cachorro_guia','Cachorro-guia',1500 from private.ride_tariffs where environment='simulation' limit 1$$,
 '23514',null,'achado 13: cachorro-guia não vira adicional cobrado');
select throws_ok($$insert into private.ride_extra_prices select id,'wheelchair','Cadeira de rodas',900 from private.ride_tariffs where environment='simulation' limit 1$$,
 '23514',null,'achado 13: cadeira de rodas não vira adicional cobrado');
select throws_ok($$insert into private.ride_extra_prices select id,'bagagem_extra','Bagagem grande',500 from private.ride_tariffs where environment='simulation' limit 1$$,
 '23514',null,'achado 13: um tipo de adicional fora da lista revisada exige nova migração');
select throws_ok($$insert into private.ride_extra_prices select id,'child_seat','Acompanhante',500 from private.ride_tariffs where environment='simulation' limit 1$$,
 '23514',null,'achado 13: o nome também não pode cobrar acompanhante');
select lives_ok($$insert into private.ride_extra_prices select id,'child_seat','Cadeirinha infantil',500 from private.ride_tariffs where environment='simulation' limit 1$$,
 'um tipo revisado com nome neutro segue vendável');
select throws_ok($$insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,valid_until,evidence_ref)
 values('simulation','Saúde','x1','Cachorro-guia a bordo',900,4,now()+interval '1 day','ficticio-206g')$$,'23514',null,'achado 13: classe de cachorro-guia é recusada');
select throws_ok($$insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,pets,valid_until,evidence_ref)
 values('simulation','Saúde','x2','Com cão'||chr(8209)||'guia',900,4,true,now()+interval '1 day','ficticio-206g')$$,'23514',null,
 'achado 13: o hífen não separável não esconde o cão-guia, nem numa classe de animal doméstico');
select throws_ok($$insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,valid_until,evidence_ref)
 values('simulation','Saúde','x3','Cadela ouvinte',900,4,now()+interval '1 day','ficticio-206g')$$,'23514',null,'achado 13: animal ouvinte também é de assistência');
select throws_ok($$insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,valid_until,evidence_ref)
 values('simulation','Saúde','x4','Com cachorro',300,4,now()+interval '1 day','ficticio-206g')$$,'23514',null,
 'achado 13: nome de animal só em classe vendida como animal doméstico');
select throws_ok($$insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,valid_until,evidence_ref)
 values('simulation','Saúde','x5','Cadeirante',300,4,now()+interval '1 day','ficticio-206g')$$,'23514',null,'achado 13: classe não cobra por cadeira de rodas');
select lives_ok($$insert into private.ride_class_policies(environment,area,code,label,surcharge_cents,seats,pets,valid_until,evidence_ref)
 values('simulation','Saúde','x6','Com cachorro',300,4,true,now()+interval '1 day','ficticio-206g')$$,'a classe de animal doméstico segue vendável');
delete from private.ride_class_policies where code='x6';

-- ── Achado 18 · entre municípios o portão confere o corredor.
select is(private.ride_modality_issue('simulation','intercity','Saúde','Lugar sem corredor',now()+interval '1 hour'),'corridor_unavailable',
 'achado 18: destino sem corredor é recusado pelo portão');
select is(private.ride_modality_issue('simulation','intercity','Saúde','Jabaquara',now()+interval '1 hour'),'corridor_unavailable',
 'achado 18: um par da praça sem corredor também');
select is(private.ride_modality_issue('simulation','intercity','Saúde','Cidade vizinha de ensaio',now()+interval '1 hour'),null,'o corredor de ensaio passa');
select is(private.ride_modality_issue('simulation','intercity','Saúde',null,now()+interval '1 hour'),null,'sem destino o catálogo não conclui nada sobre o corredor');
update private.ride_intercity_corridors set enabled=false where environment='simulation';
select is(private.ride_modality_issue('simulation','intercity','Saúde','Cidade vizinha de ensaio',now()+interval '1 hour'),'corridor_unavailable',
 'achado 18: corredor desligado fecha a modalidade');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_request_modality('intercity','Saúde','Cidade vizinha de ensaio')$$,'P0001','ride_modality_unavailable',
 'achado 18: e a porta recusa');
select is((select m->>'reason' from jsonb_array_elements(public.ride_market_catalog('Saúde','Cidade vizinha de ensaio',null)->'modalities') m where m->>'code'='intercity'),
 'corridor_unavailable','achado 18: e o catálogo mostra o motivo');
select tests.clear_authentication();
update private.ride_intercity_corridors set enabled=true where environment='simulation';
update private.ride_intercity_corridors set valid_until=now()+interval '30 minutes' where environment='simulation';
select is(private.ride_modality_issue('simulation','intercity','Saúde','Cidade vizinha de ensaio',now()+interval '1 hour'),'corridor_unavailable',
 'corredor que vence antes do fim também fecha');
update private.ride_intercity_corridors set valid_until='infinity' where environment='simulation';

-- ── Achado 3 · restrição da operação e bloqueio de par valem para assentos de shuttle.
insert into private.ride_shuttle_lines(id,environment,origin_area,destination_area,operator_ref,seat_cents,minutes,evidence_ref,valid_until,enabled)
 values(pg_temp.key('line'),'simulation','Saúde','Vila Mariana','OPERADOR-206g',1500,40,'EVIDENCIA-206g',now()+interval '60 days',true);
insert into private.ride_shuttle_departures(id,line_id,departs_at,seats_total)
 values(pg_temp.key('d1'),pg_temp.key('line'),pg_temp.dep(2),4),(pg_temp.key('d2'),pg_temp.key('line'),pg_temp.dep(3),4),
 (pg_temp.key('d3'),pg_temp.key('line'),pg_temp.dep(4),4),(pg_temp.key('d4'),pg_temp.key('line'),pg_temp.dep(5),4);
update private.ride_shuttle_departures set driver_id=tests.uid('provider_b') where id=pg_temp.key('d1');
select pg_temp.restrict('client_b');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_book_shuttle_seat(pg_temp.key('d2'),1,1500,pg_temp.key('rb1'))$$,'P0001','ride_pair_unavailable',
 'achado 3: passageira sob restrição não reserva assento');
select tests.clear_authentication();
insert into private.ride_pair_blocks(actor,other,leg) values(tests.uid('client_a'),tests.uid('provider_b'),pg_temp.id('pa'));
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_book_shuttle_seat(pg_temp.key('d1'),1,1500,pg_temp.key('ra1'))$$,'P0001','ride_pair_unavailable',
 'achado 3: nem na partida do motorista que ela bloqueou');
insert into t(k,id) values('seat-a2',(public.ride_book_shuttle_seat(pg_temp.key('d2'),1,1500,pg_temp.key('ra2'))->>'id')::uuid);
select throws_ok($$select public.ride_rebook_shuttle_seat(pg_temp.id('seat-a2'),pg_temp.key('d1'),pg_temp.key('ra3'))$$,'P0001','ride_pair_unavailable',
 'achado 3: a remarcação também não leva à partida do motorista bloqueado');
select tests.clear_authentication();
select throws_ok($$update private.ride_shuttle_departures set driver_id=tests.uid('provider_b') where id=pg_temp.key('d2')$$,'P0001','ride_pair_unavailable',
 'achado 3: o motorista não é designado a uma partida com passageira com quem não pode formar par');
select pg_temp.restrict('provider_b');
select throws_ok($$update private.ride_shuttle_departures set driver_id=tests.uid('provider_b') where id=pg_temp.key('d3')$$,'P0001','driver_ineligible',
 'achado 3: motorista sob restrição não é designado');
delete from private.ride_restrictions where subject=tests.uid('provider_b');
delete from private.ride_pair_blocks where actor=tests.uid('client_a') and other=tests.uid('provider_b');
select is((select coalesce(sum(seats),0)::int from private.ride_shuttle_seats where departure_id in (pg_temp.key('d1'),pg_temp.key('d3'))),0,'nenhuma das recusas gravou assento');

-- ── Achado 14 · a reserva de assento trava o perfil antes da partida, como a exclusão faz.
select tests.authenticate_as('provider_e');
insert into t(k,id) values('seat-e',(public.ride_book_shuttle_seat(pg_temp.key('d4'),1,1500,pg_temp.key('re1'))->>'id')::uuid);
select tests.clear_authentication();
select is((select state from private.ride_shuttle_seats where id=pg_temp.id('seat-e')),'confirmed','com a conta ativa a reserva segue normal');
select ok((select position('ride_lock_live_profile' in prosrc)>0 and position('ride_lock_live_profile' in prosrc)<position('ride_shuttle_lock_departures' in prosrc)
   from pg_proc where oid='public.ride_book_shuttle_seat(uuid,integer,integer,uuid)'::regprocedure)
 and (select position('ride_lock_live_profile' in prosrc)>0 and position('ride_lock_live_profile' in prosrc)<position('ride_shuttle_lock_departures' in prosrc)
   from pg_proc where oid='public.ride_rebook_shuttle_seat(uuid,uuid,uuid)'::regprocedure),
 'achado 14: reservar e remarcar travam o perfil antes das partidas (ordem perfil → partida da exclusão)');

-- ── Achados 4 e 5 · a tarifa do bloco por hora vale na atribuição e em toda mudança de horário.
-- ── Achado 6 · o bloco por hora não depende da regra de demanda ao mudar de horário.
insert into w values('h',now()+interval '3 hours');
select tests.authenticate_as('client_a');
insert into t(k,id) values('h:quote',(public.ride_quote_block(pg_temp.key('h'),pg_temp.at('h'),'Saúde','Jabaquara','3h')->>'id')::uuid);
insert into t(k,id) values('h:ride',(public.ride_consent(pg_temp.id('h:quote'),true)->>'ride_id')::uuid);
select tests.clear_authentication();
select pg_temp.legs();
select is((select state from private.ride_reserve_terms where leg_id=pg_temp.id('h')),'awaiting_driver','o bloco agendado é uma reserva');
select tests.authenticate_as('client_a');
select lives_ok($$select public.ride_shift_reservation(pg_temp.id('h'),pg_temp.at('h')+interval '30 minutes','passenger',pg_temp.key('h-shift1'))$$,
 'achado 6: sob a mesma regra de demanda o bloco por hora muda de horário pelo mesmo preço');
select tests.clear_authentication();
select is((select pickup_at from public.ride_legs where id=pg_temp.id('h')),pg_temp.at('h')+interval '30 minutes','o bloco passa ao novo horário');
update private.ride_block_tariffs set valid_until=pg_temp.at('h')+interval '3 hours 40 minutes' where environment='simulation' and area='Saúde' and code='3h';
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('h'),pg_temp.at('h')+interval '1 hour','passenger',pg_temp.key('h-shift2'))$$,'P0001','ride_block_unavailable',
 'achado 5: o novo horário não pode passar da validade da tarifa do bloco');
select tests.clear_authentication();
select is((select pickup_at from public.ride_legs where id=pg_temp.id('h')),pg_temp.at('h')+interval '30 minutes','a recusa não muda o trecho');
update private.ride_block_tariffs set valid_until=now()-interval '1 minute' where environment='simulation' and area='Saúde' and code='3h';
select ok((select not private.ride_offer_eligible(tests.uid('provider_b'),l) from public.ride_legs l where l.id=pg_temp.id('h')),
 'achado 4: com a tarifa vencida o bloco sai da oferta');
select throws_ok($$update public.ride_legs set driver_id=tests.uid('provider_b') where id=pg_temp.id('h')$$,'P0001','ride_block_unavailable',
 'achado 4: e a atribuição direta é recusada');
update private.ride_block_tariffs set valid_until='infinity',block_cents=block_cents+100 where environment='simulation' and area='Saúde' and code='3h';
select throws_ok($$update public.ride_legs set driver_id=tests.uid('provider_b') where id=pg_temp.id('h')$$,'P0001','ride_block_unavailable',
 'achado 4: tarifa repreçada depois do aceite também não é mais a cotada');
update private.ride_block_tariffs set block_cents=block_cents-100 where environment='simulation' and area='Saúde' and code='3h';
select tests.authenticate_as('provider_b');
select is(public.ride_accept_offer(pg_temp.id('h'),pg_temp.key('h-accept'))->>'status','accepted','com a tarifa cotada vigente o motorista aceita o bloco');
select tests.clear_authentication();
update private.ride_block_tariffs set valid_until=now()-interval '1 minute' where environment='simulation' and area='Saúde' and code='3h';
select throws_ok($$update public.ride_legs set slot=tstzrange(lower(slot),upper(slot)+interval '15 minutes') where id=pg_temp.id('h')$$,'P0001','ride_block_unavailable',
 'achado 4: com motorista, mover o bloco sem tarifa vigente é recusado');
select tests.authenticate_as('client_a');
select is(public.ride_transition(pg_temp.id('h'),'cancelled',pg_temp.key('h-cancel'))->>'status','cancelled','cancelar o bloco continua possível');
select tests.clear_authentication();
update private.ride_block_tariffs set valid_until='infinity' where environment='simulation' and area='Saúde' and code='3h';

-- ── Achado 22 · mudar de horário mantém o preço só sob a mesma regra de demanda.
insert into w values('r1',now()+interval '5 hours'),('r2',now()+interval '7 hours');
select tests.authenticate_as('client_a');
select pg_temp.request('r1','Jabaquara','Vila Mariana',pg_temp.at('r1'));
select tests.clear_authentication();
insert into private.ride_demand_rates(environment,origin,destination,validity,multiplier_bps,free_wait_minutes,wait_cents_per_minute,absence_policy,evidence_ref)
 values('simulation','Jabaquara','Vila Mariana',tstzrange(now()+interval '6 hours',now()+interval '1 day'),15000,3,100,'Pico fictício de ensaio.','ficticio-206g');
select tests.authenticate_as('client_a');
select pg_temp.request('r2','Jabaquara','Vila Mariana',pg_temp.at('r2'));
select tests.clear_authentication();
select pg_temp.legs();
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('r1'),pg_temp.at('r1')+interval '75 minutes','passenger',pg_temp.key('r1-shift'))$$,'P0001','requote_required',
 'achado 22: levar a reserva fora do pico para dentro do pico exige nova cotação');
select throws_ok($$select public.ride_shift_reservation(pg_temp.id('r2'),pg_temp.at('r2')-interval '90 minutes','passenger',pg_temp.key('r2-shift'))$$,'P0001','requote_required',
 'achado 22: e tirar do pico a reserva cotada nele também');
select is(public.ride_shift_reservation(pg_temp.id('r2'),pg_temp.at('r2')+interval '30 minutes','passenger',pg_temp.key('r2-ok'))->>'state','applied',
 'dentro do mesmo pico a mudança mantém o preço');
select tests.clear_authentication();
update private.ride_reserve_terms set confirm_by=now()-interval '1 minute' where leg_id=pg_temp.id('r1');
select private.ride_reservation_check();
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('r1'),'rebook',pg_temp.at('r1')+interval '2 hours',pg_temp.key('r1-rebook'))$$,'P0001','requote_required',
 'achado 22: a remarcação da contingência para dentro do pico também exige nova cotação');
select tests.clear_authentication();
select is((select pickup_at from public.ride_legs where id=pg_temp.id('r1')),pg_temp.at('r1'),'as recusas não mudam o trecho');

-- ── Achado 7 · cada prazo de confirmação perdido avisa de novo.
select is((select count(*)::int from private.ride_passenger_notices where leg_id=pg_temp.id('r1') and event='reserve_unconfirmed'),1,'a primeira contingência avisa');
select tests.authenticate_as('client_a');
select is(public.ride_reserve_contingency(pg_temp.id('r1'),'rebook',pg_temp.at('r1')+interval '30 minutes',pg_temp.key('r1-rebook2'))->>'state','awaiting_driver',
 'a passageira remarca dentro da mesma regra');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_passenger_notices where leg_id=pg_temp.id('r1') and event='reserve_unconfirmed'),0,
 'achado 7: ao sair da contingência o aviso volta a poder ser enviado');
update private.ride_reserve_terms set confirm_by=now()-interval '1 minute' where leg_id=pg_temp.id('r1');
select private.ride_reservation_check();
select is((select count(*)::int from private.ride_passenger_notices where leg_id=pg_temp.id('r1') and event='reserve_unconfirmed'),1,
 'achado 7: o segundo prazo perdido avisa de novo');

-- ── Achado 8 · a rotina do minuto não muda para contingência um prazo que acabou de mudar.
insert into w values('sa',now()+interval '3 hours'),('sb',now()+interval '3 hours 10 minutes');
select tests.authenticate_as('client_a');
select pg_temp.request('sa','Vila Mariana','Saúde',pg_temp.at('sa'));
select pg_temp.request('sb','Vila Mariana','Jabaquara',pg_temp.at('sb'));
select tests.clear_authentication();
select pg_temp.legs();
update private.ride_reserve_terms set confirm_by=now()-interval '3 minutes' where leg_id=pg_temp.id('sa');
update private.ride_reserve_terms set confirm_by=now()-interval '2 minutes' where leg_id=pg_temp.id('sb');
-- Simula a mudança de horário confirmada por outra sessão enquanto a rotina percorre a lista:
-- o aviso da primeira reserva adia o prazo da segunda.
create function tests.g206_shift_other() returns trigger language plpgsql as $$
begin
 update private.ride_reserve_terms set confirm_by=now()+interval '1 hour' where leg_id=(select id from t where k='sb');
 return null;
end $$;
create trigger g206_shift_other after insert on private.ride_passenger_notices for each row
 when(new.event='reserve_unconfirmed') execute function tests.g206_shift_other();
select private.ride_reservation_check();
drop trigger g206_shift_other on private.ride_passenger_notices;
select is((select state from private.ride_reserve_terms where leg_id=pg_temp.id('sa')),'contingency','a primeira reserva sem motorista entra em contingência');
select is((select state from private.ride_reserve_terms where leg_id=pg_temp.id('sb')),'awaiting_driver',
 'achado 8: a segunda, com o prazo já adiado, segue aguardando motorista');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('sb') and action='unconfirmed'),0,'e não ganha linha de contingência');
select is((select (data->>'confirm_by')::timestamptz from private.ride_reserve_events where leg_id=pg_temp.id('sa') and action='unconfirmed'),
 (select confirm_by from private.ride_reserve_terms where leg_id=pg_temp.id('sa')),'a linha de contingência registra o prazo efetivamente vencido');

-- ── Achado 21 · as linhas de desfecho levam quem agiu e a chave da operação.
insert into w values('k',now()+interval '4 hours');
select tests.authenticate_as('client_a');
select pg_temp.request('k','Saúde','Vila Mariana',pg_temp.at('k'));
select tests.clear_authentication();
select pg_temp.legs();
select tests.authenticate_as('provider_b');
select is(public.ride_accept_offer(pg_temp.id('k'),pg_temp.key('k-accept'))->>'status','accepted','o motorista confirma a reserva');
select tests.authenticate_as('client_a');
select is(public.ride_transition(pg_temp.id('k'),'cancelled',pg_temp.key('k-cancel'))->>'status','cancelled','a passageira cancela a reserva confirmada');
select tests.clear_authentication();
select is((select jsonb_agg(jsonb_build_array(action,actor_role,actor_id=case actor_role when 'driver' then tests.uid('provider_b') else tests.uid('client_a') end,
     operation_key=case action when 'driver_confirmed' then pg_temp.key('k-accept') else pg_temp.key('k-cancel') end) order by id)
   from private.ride_reserve_events where leg_id=pg_temp.id('k') and action in ('driver_confirmed','closed')),
 '[["driver_confirmed","driver",true,true],["closed","passenger",true,true]]'::jsonb,
 'achado 21: confirmação e encerramento levam o motorista e a passageira, com a chave da operação de cada um');
select is((select count(*)::int from private.ride_reserve_events x where x.leg_id=pg_temp.id('k') and x.action in ('driver_confirmed','closed')
   and not exists(select from private.ride_events e where e.leg_id=x.leg_id and e.operation_key=x.operation_key and e.actor_id=x.actor_id)),0,
 'achado 21: cada linha de desfecho aponta a operação do trecho que a causou');
select is((select actor_role from private.ride_reserve_events where leg_id=pg_temp.id('sa') and action='unconfirmed'),'system','a rotina do minuto segue sendo o sistema');

-- ── Achado 11 · a exigência de assistência guardada na cotação sai no prazo e aparece na exportação.
select tests.authenticate_as('client_a');
insert into t(k,data) values('qc',public.ride_quote_with_access(pg_temp.key('qc'),null,null,pg_temp.trip('Saúde','Jabaquara'),'boarding'));
update t set id=(data->>'id')::uuid where k='qc';
insert into t(k,id) values('qbleg:ride',(public.ride_consent(pg_temp.id('qb'),true)->>'ride_id')::uuid);
insert into t(k,data) values('export',public.ride_export_my_data());
select tests.clear_authentication();
select pg_temp.legs();
select is((select jsonb_agg(jsonb_build_array(e->>'quote',e->>'assistance',e->'companion',e->'boarding_minutes') order by e->>'quote')
   from jsonb_array_elements(pg_temp.data('export')->'access_quotes') e),
 (select jsonb_agg(jsonb_build_array(q::text,'boarding',false,'{"1":3}'::jsonb) order by q::text) from unnest(array[pg_temp.id('qb'),pg_temp.id('qc')]) q),
 'achado 11: a exportação traz a escolha de assistência guardada em cada cotação');
select tests.authenticate_as('client_a');
select is(public.ride_transition(pg_temp.id('qbleg'),'cancelled',pg_temp.key('qb-cancel'))->>'status','cancelled','o trecho com assistência é cancelado');
select tests.clear_authentication();
update public.ride_legs set updated_at=now()-interval '25 hours' where id=pg_temp.id('qbleg');
select private.purge_ride_safety();
select is((select count(*)::int from private.ride_access_quotes where quote_id=pg_temp.id('qb'))
   +(select count(*)::int from private.ride_quote_modes where quote_id=pg_temp.id('qb') and modality in ('assist','wav')),0,
 'achado 11: 24 h depois do encerramento a cotação perde a assistência e a modalidade de assistência');
select is((select count(*)::int from private.ride_access_quotes where quote_id=pg_temp.id('qc')),1,'a cotação ainda em aberto mantém a escolha');
update private.ride_quotes set expires_at=now()-interval '25 hours' where id=pg_temp.id('qc');
select private.purge_ride_safety();
select is((select count(*)::int from private.ride_access_quotes where quote_id=pg_temp.id('qc'))
   +(select count(*)::int from private.ride_quote_modes where quote_id=pg_temp.id('qc')),0,
 'achado 11: a cotação nunca aceita também sai 24 h depois de vencer');
select tests.authenticate_as('client_a');
select is(public.ride_export_my_data()->'access_quotes','[]'::jsonb,'depois do descarte a exportação não mostra o que o banco já não guarda');
select tests.clear_authentication();

-- ── Achados 1 e 2 · a regra do terminal só vale para o terminal congelado de uma reserva de aeroporto.
select tests.authenticate_as('client_a');
select pg_temp.request('plainair','Saúde','Terminal de ensaio',null);
insert into w values('ap',now()+interval '4 hours');
select pg_temp.request('ap','Terminal de ensaio','Saúde',pg_temp.at('ap'));
insert into t(k,id) values('rj',(public.ride_prepare_route(pg_temp.key('rj'),null,'Saúde','Jabaquara',
 '{"lat":-23.6172244,"lng":-46.6304177,"label":"Ponto Saúde (ensaio)"}','{"lat":-23.64,"lng":-46.64,"label":"Ponto Jabaquara (ensaio)"}',null)->>'id')::uuid);
insert into t(k,id) values('rt2',(public.ride_prepare_route(pg_temp.key('rt2'),null,'Jabaquara','Saúde',
 '{"lat":-23.64,"lng":-46.64,"label":"Ponto Jabaquara (ensaio)"}','{"lat":-23.6172244,"lng":-46.6304177,"label":"Ponto Saúde (ensaio)"}',null)->>'id')::uuid);
select tests.authenticate_as('admin');
select public.ride_claim_route(pg_temp.id(k)),public.ride_verify_route(pg_temp.id(k),3000,9,'t206g/'||k) from unnest(array['rj','rt2']) k;
select tests.clear_authentication();
select pg_temp.legs();
select is((select count(*)::int from private.ride_reserve_terms where leg_id=pg_temp.id('plainair')),0,'a corrida imediata ao terminal não é reserva');
select tests.authenticate_as('client_a');
select lives_ok($$select public.ride_propose_amendment(pg_temp.id('plainair'),pg_temp.id('rj'),pg_temp.key('plainair-amend'))$$,
 'achado 1: a corrida comum ao terminal muda o destino como nas etapas 1 a 5');
select throws_ok($$select public.ride_propose_amendment(pg_temp.id('ap'),pg_temp.id('rt2'),pg_temp.key('ap-amend'))$$,'P0001','ride_revision_anchor_changed',
 'achado 2 (limite documentado): uma alteração não troca o embarque antes de embarcar, nem o terminal de embarque da reserva');
select tests.clear_authentication();

-- ── Achado 17 · o catálogo informa cada portão por si.
update private.ride_network set dispatch_enabled=false where environment='simulation';
select tests.authenticate_as('client_a');
select is(public.ride_market_catalog('Saúde','Jabaquara',null)->'gates','{"module":true,"quote":true,"dispatch":false,"monetization":false}'::jsonb,
 'achado 17: cotação liberada com despacho desligado aparece separada');
select tests.clear_authentication();
update private.ride_network set monetization_enabled=true where environment='simulation';
select tests.authenticate_as('client_a');
select is(public.ride_market_catalog('Saúde','Jabaquara',null)->'gates','{"module":true,"quote":true,"dispatch":false,"monetization":true}'::jsonb,
 'achado 17: monetização ligada aparece sem ligar o despacho');
select tests.clear_authentication();
update private.ride_network set module_enabled=false where environment='simulation';
select tests.authenticate_as('client_a');
select is((select jsonb_build_array(c->'gates',c->'vehicles',c->'classes',c->'methods') from (select public.ride_market_catalog('Saúde','Jabaquara',null) c) x),
 '[{"module":false,"quote":false,"dispatch":false,"monetization":false},[],[],[]]'::jsonb,'achado 17: sem módulo os quatro portões fecham e nada é listado');
select tests.clear_authentication();
update private.ride_network set module_enabled=true,dispatch_enabled=true,monetization_enabled=false where environment='simulation';
-- A parte ao vivo deste achado está em 206 (antes de existir trecho, a troca de ambiente é recusada aqui).

select * from finish();
rollback;
