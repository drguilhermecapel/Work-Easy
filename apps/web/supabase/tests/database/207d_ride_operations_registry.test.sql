-- O17 · cadastros da operação (20261128100401, DD125). Linhas e partidas de van, blocos por hora,
-- corredores entre municípios e políticas de reserva passam a ser listados e salvos pelo
-- financeiro da operação, no ambiente da implantação e com auditoria; liberações de motorista
-- para dependente, convites de convidado das empresas e faturas fechadas passam a ser listados.
-- No ambiente real nada é ligado sem referência de evidência real e data de validade.
-- Só dados fictícios, dentro desta transação; nada depende da hora do dia.
begin;
select no_plan();
select tests.setup_fixture();
create function pg_temp.id(k text) returns uuid language sql immutable as $$select md5('207d'||k)::uuid$$;
-- Leitura de conferência do roteiro, como dono do teste, enquanto o papel autenticado age.
create function pg_temp.v(p_sql text) returns text language plpgsql security definer as $$declare r text; begin execute p_sql into r; return r; end $$;
grant execute on function pg_temp.id(text),pg_temp.v(text) to authenticated,anon;
create function pg_temp.audits(p_action text,p_entity text) returns int language sql stable security definer as
 $$select count(*)::int from public.audit_log where action=p_action and entity_id=p_entity$$;

-- ─── Superfície ─────────────────────────────────────────────────────────────────────────────
select is((select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace
   and p.proname in ('admin_ride_shuttle_lines','admin_save_ride_shuttle_line','admin_ride_shuttle_line_departures','admin_save_ride_shuttle_departure',
     'admin_designate_shuttle_driver','admin_mark_shuttle_departed','admin_ride_block_tariffs','admin_save_ride_block_tariff',
     'admin_ride_intercity_corridors','admin_save_ride_intercity_corridor','admin_ride_reserve_policies','admin_save_ride_reserve_policy',
     'admin_ride_minor_clearances','admin_ride_guest_invites','admin_revoke_ride_guest_invite','admin_ride_closed_invoices')
   and has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute')
   and not has_function_privilege('service_role',p.oid,'execute') and p.prosecdef and p.proconfig @> array['search_path=""']),16,
 'as dezesseis RPCs de cadastro são só de pessoa autenticada, com search_path vazio');
select is((select count(*)::int from pg_proc p where p.pronamespace='private'::regnamespace
   and p.proname in ('guard_ride_registry_identity','guard_ride_shuttle_departed','ride_registry_admin','ride_registry_text','ride_registry_evidence',
     'ride_registry_areas','ride_registry_area','ride_registry_until','ride_shuttle_line_view','ride_shuttle_departure_view','ride_block_tariff_view',
     'ride_corridor_view','ride_reserve_policy_view')
   and not (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')
     or has_function_privilege('service_role',p.oid,'execute'))),13,'nenhum auxiliar ou gatilho privado do cadastro é executável pelas funções da API');
select is((select count(*)::int from pg_constraint where conname in ('ride_shuttle_lines_live_evidence','ride_block_tariffs_live_evidence',
   'ride_intercity_corridors_live_evidence','ride_reserve_policies_live_evidence') and contype='c'),4,
 'as quatro tabelas de cadastro exigem evidência e validade no ambiente real');
select is((select count(*)::int from private.ride_shuttle_lines where environment='live')+(select count(*)::int from private.ride_block_tariffs where environment='live')
   +(select count(*)::int from private.ride_intercity_corridors where environment='live')+(select count(*)::int from private.ride_reserve_policies where environment='live'),0,
 'nenhum cadastro do ambiente real é semeado');

-- ─── Regras para qualquer escritor no ambiente real ─────────────────────────────────────────
insert into private.ride_market_areas(environment,market,area) values('live','sao-paulo','Área real 207d'),('live','sao-paulo','Outra área real 207d');
select throws_ok($$insert into private.ride_shuttle_lines(environment,origin_area,destination_area,operator_ref,seat_cents,minutes,evidence_ref,valid_until,enabled)
  values('live','Área real 207d','Outra área real 207d','OP-207d',1500,40,'ficticio-o17',now()+interval '30 days',true)$$,'23514',null,
 'linha ligada no ambiente real com referência de ensaio é recusada pela tabela');
select throws_ok($$insert into private.ride_shuttle_lines(environment,origin_area,destination_area,operator_ref,seat_cents,minutes,evidence_ref,valid_until,enabled)
  values('live','Área real 207d','Outra área real 207d','OP-207d',1500,40,'CONTRATO-207d','infinity',true)$$,'23514',null,
 'linha ligada no ambiente real sem data de validade é recusada pela tabela');
select lives_ok($$insert into private.ride_shuttle_lines(environment,origin_area,destination_area,operator_ref,seat_cents,minutes,evidence_ref,valid_until,enabled)
  values('live','Área real 207d','Outra área real 207d','OP-207d-off',1500,40,'ficticio-o17','infinity',false)$$,
 'linha desligada no ambiente real pode ficar só como rascunho');
select throws_ok($$insert into private.ride_block_tariffs(environment,area,code,minutes,included_km,block_cents,extra_15min_cents,extra_km_cents,evidence_ref,valid_until)
  values('live','Área real 207d','2h',120,40,15000,1000,200,'ensaio-207d',now()+interval '30 days')$$,'23514',null,
 'tarifa de bloco no ambiente real exige referência real');
select throws_ok($$insert into private.ride_intercity_corridors(environment,origin,destination,origin_jurisdiction,destination_jurisdiction,authority_ref,coverage_ref,
  empty_return_cents,return_minutes,valid_until,enabled) values('live','Área real 207d','Cidade real 207d','Município A','Município B','AUT-207d','ficticio-o17',100,30,now()+interval '30 days',true)$$,
 '23514',null,'corredor ligado no ambiente real exige cobertura real');
select throws_ok($$insert into private.ride_reserve_policies(environment,area,min_lead_minutes,confirm_lead_minutes,max_shift_minutes,evidence_ref,valid_until,enabled)
  values('live','Área real 207d',60,30,60,'POL-207d','infinity',true)$$,'23514',null,'política de reserva ligada no ambiente real exige data de validade');

-- ─── As RPCs no ambiente real ──────────────────────────────────────────────────────────────
update private.ride_deployment set environment='live';
select tests.authenticate_as('admin');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Área real 207d','Outra área real 207d','OP-207d',1500,40,'ficticio-o17',now()+interval '30 days',true)$$,
  pg_temp.id('live-line')),'P0001','ride_registry_evidence_required','a operação não liga linha real com referência de ensaio');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Área real 207d','Outra área real 207d','OP-207d',1500,40,'CONTRATO-207d','infinity',true)$$,
  pg_temp.id('live-line')),'P0001','ride_registry_evidence_required','a operação não liga linha real sem data de validade');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Área real 207d','Outra área real 207d','OP-207d',1500,40,'CONTRATO-207d',now()+interval '30 months',true)$$,
  pg_temp.id('live-line')),'P0001','ride_registry_evidence_required','a validade de uma linha real vai no máximo a 24 meses');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Área real 207d','Outra área real 207d','OP-207d',1500,40,'CONTRATO-207d',now()-interval '1 day',true)$$,
  pg_temp.id('live-line')),'P0001','ride_registry_evidence_required','uma linha real não é ligada com validade vencida');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Saúde','Jabaquara','OP-207d',1500,40,'CONTRATO-207d',now()+interval '30 days',false)$$,
  pg_temp.id('live-line')),'P0001','invalid_input','no ambiente real as áreas do ensaio não existem');
select is(public.admin_save_ride_shuttle_line(pg_temp.id('live-line'),'Área real 207d','Outra área real 207d','OP-207d',1500,40,'CONTRATO-207d',now()+interval '6 months',true)->>'enabled',
 'true','com contrato real e validade de seis meses a linha real é ligada');
select is(pg_temp.v(format('select environment from private.ride_shuttle_lines where id=%L',pg_temp.id('live-line'))),'live','a linha nasce no ambiente da implantação');
select throws_ok(format($$select public.admin_save_ride_block_tariff(%L,'Área real 207d','2h',120,40,15000,1000,200,'ensaio-207d',now()+interval '6 months')$$,pg_temp.id('live-t')),
 'P0001','ride_registry_evidence_required','tarifa real com referência de ensaio é recusada');
select throws_ok($$select public.admin_save_ride_intercity_corridor('Área real 207d','Cidade real 207d','Município A','Município B','AUT-207d','ficticio-207d',100,30,now()+interval '6 months',true)$$,
 'P0001','ride_registry_evidence_required','corredor real ligado com cobertura de ensaio é recusado');
select is(public.admin_save_ride_intercity_corridor('Área real 207d','Cidade real 207d','Município A','Município B','AUT-207d','ficticio-207d',100,30,now()+interval '6 months',false)->>'enabled',
 'false','o corredor real pode ser registrado desligado enquanto falta a cobertura');
select throws_ok($$select public.admin_save_ride_reserve_policy('Área real 207d',60,30,60,'POL-207d','infinity',true)$$,
 'P0001','ride_registry_evidence_required','política de reserva real sem data de validade é recusada');
select is(jsonb_array_length(public.admin_ride_shuttle_lines()->'lines'),2,'a lista do ambiente real mostra só as linhas reais');
select is(public.admin_ride_shuttle_lines()->'simulation','false'::jsonb,'e diz que não é ensaio');
select tests.clear_authentication();
update private.ride_deployment set environment='simulation';

-- ─── Permissões (negativos) ────────────────────────────────────────────────────────────────
select tests.authenticate_anon();
select throws_ok($$select public.admin_ride_shuttle_lines()$$,'42501',null,'visitante anônimo não lista linhas');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Saúde','Jabaquara','OP',1500,40,'REF','infinity',true)$$,pg_temp.id('x')),'42501',null,
 'visitante anônimo não salva linha');
select throws_ok($$select public.admin_ride_guest_invites()$$,'42501',null,'visitante anônimo não lista convites');
select tests.authenticate_service();
select throws_ok(format($$select public.admin_save_ride_block_tariff(%L,'Saúde','x',60,10,100,0,0,'REF','infinity')$$,pg_temp.id('x')),'42501',null,
 'a chave de serviço não salva tarifa');
select throws_ok(format($$select public.admin_mark_shuttle_departed(%L)$$,pg_temp.id('x')),'42501',null,'a chave de serviço não marca partida');
select tests.authenticate_as('client_a');
select throws_ok($$select public.admin_ride_shuttle_lines()$$,'P0001','not_allowed','quem não administra não lista linhas');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Saúde','Jabaquara','OP',1500,40,'REF','infinity',true)$$,pg_temp.id('x')),'P0001','not_allowed',
 'quem não administra não salva linha');
select throws_ok(format($$select public.admin_save_ride_shuttle_departure(%L,%L,now()+interval '2 days',12)$$,pg_temp.id('x'),pg_temp.id('x')),'P0001','not_allowed',
 'quem não administra não cria partida');
select throws_ok(format($$select public.admin_designate_shuttle_driver(%L,null)$$,pg_temp.id('x')),'P0001','not_allowed','quem não administra não designa motorista');
select throws_ok(format($$select public.admin_save_ride_block_tariff(%L,'Saúde','x',60,10,100,0,0,'REF','infinity')$$,pg_temp.id('x')),'P0001','not_allowed',
 'quem não administra não salva tarifa');
select throws_ok($$select public.admin_save_ride_intercity_corridor('Saúde','Cidade X','A','B','R','R',0,0,'infinity',false)$$,'P0001','not_allowed',
 'quem não administra não salva corredor');
select throws_ok($$select public.admin_save_ride_reserve_policy('Saúde',60,30,60,'REF','infinity',false)$$,'P0001','not_allowed',
 'quem não administra não salva política de reserva');
select throws_ok($$select public.admin_ride_minor_clearances()$$,'P0001','not_allowed','quem não administra não lista liberações');
select throws_ok($$select public.admin_ride_closed_invoices()$$,'P0001','not_allowed','quem não administra não lista faturas');
select throws_ok(format($$select public.admin_revoke_ride_guest_invite(%L,'motivo de teste')$$,pg_temp.id('x')),'P0001','not_allowed','quem não administra não revoga convite');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_shuttle_lines where id=pg_temp.id('x')),0,'nenhuma tentativa recusada deixou linha');

-- ─── Linhas ────────────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('admin');
select is(public.admin_save_ride_shuttle_line(pg_temp.id('line'),' Saúde ','Jabaquara','OP-207d',1500,40,'CONTRATO-207d',now()+interval '60 days',true)
   -'valid_until'-'next_departure',
 jsonb_build_object('id',pg_temp.id('line'),'origin_area','Saúde','destination_area','Jabaquara','operator_ref','OP-207d','seat_cents',1500,'minutes',40,
   'evidence_ref','CONTRATO-207d','enabled',true,'open_departures',0),'a operação cadastra uma linha de ensaio pela tela');
select is(public.admin_save_ride_shuttle_line(pg_temp.id('line'),'Saúde','Jabaquara','OP-207d',1500,40,'CONTRATO-207d',
   pg_temp.v(format('select valid_until from private.ride_shuttle_lines where id=%L',pg_temp.id('line')))::timestamptz,true)->>'id',pg_temp.id('line')::text,'a repetição do mesmo cadastro responde a mesma linha');
select is(pg_temp.v($$select count(*) from private.ride_shuttle_lines where operator_ref='OP-207d' and environment='simulation'$$)::int,1,'a repetição não cria outra linha');
select is(pg_temp.audits('ride.shuttle_line_saved',pg_temp.id('line')::text),1,'e não deixa outra linha de auditoria');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Saúde','Jabaquara','OP-207d',1500,40,'CONTRATO-207d','infinity',true)$$,pg_temp.id('line2')),
 'P0001','ride_registry_duplicate','outra linha com as mesmas áreas e o mesmo operador é recusada');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Saúde','Saúde','OP-207d',1500,40,'CONTRATO-207d','infinity',true)$$,pg_temp.id('line2')),
 'P0001','invalid_input','origem e destino iguais são recusados');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Saúde','Área inexistente','OP-207d',1500,40,'CONTRATO-207d','infinity',true)$$,pg_temp.id('line2')),
 'P0001','invalid_input','área fora do mercado do ambiente é recusada');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Saúde','Vila Mariana','OP-207d',0,40,'CONTRATO-207d','infinity',true)$$,pg_temp.id('line2')),
 'P0001','invalid_input','assento sem preço é recusado');
select throws_ok(format($$select public.admin_save_ride_shuttle_line(%L,'Saúde','Vila Mariana','OP-207d',1500,40,'CONTRATO-207d','infinity',false)$$,
  pg_temp.id('live-line')),'P0001','idempotency_conflict','o código de uma linha de outro ambiente não é reaproveitado');
select is(public.admin_save_ride_shuttle_line(pg_temp.id('line'),'Saúde','Jabaquara','OP-207d',1800,40,'CONTRATO-207d',now()+interval '60 days',true)->>'seat_cents',
 '1800','o preço do assento muda para as próximas reservas');
select is(pg_temp.audits('ride.shuttle_line_saved',pg_temp.id('line')::text),2,'a alteração fica na auditoria');
select ok(exists(select from jsonb_array_elements(public.admin_ride_shuttle_lines()->'lines') e where e->>'id'=pg_temp.id('line')::text),'a linha aparece na lista');
select ok(not exists(select from jsonb_array_elements(public.admin_ride_shuttle_lines()->'lines') e where e->>'id'=pg_temp.id('live-line')::text),
 'a linha do ambiente real não aparece no ensaio');
select ok(public.admin_ride_shuttle_lines()->'areas' ? 'Saúde','a lista traz as áreas do mercado para o formulário');

-- ─── Partidas ──────────────────────────────────────────────────────────────────────────────
select is(public.admin_save_ride_shuttle_departure(pg_temp.id('d1'),pg_temp.id('line'),now()+interval '3 days',12)->>'state','open','a operação cria uma partida');
select is(public.admin_save_ride_shuttle_departure(pg_temp.id('d1'),pg_temp.id('line'),pg_temp.v(format('select departs_at from private.ride_shuttle_departures where id=%L',pg_temp.id('d1')))::timestamptz,12)->>'id',
 pg_temp.id('d1')::text,'a repetição da criação responde a mesma partida');
select is(pg_temp.audits('ride.shuttle_departure_saved',pg_temp.id('d1')::text),1,'a repetição não deixa outra auditoria');
select throws_ok(format($$select public.admin_save_ride_shuttle_departure(%L,%L,now()+interval '3 days',12)$$,pg_temp.id('d1'),
  pg_temp.v($$select id from private.ride_shuttle_lines where environment='simulation' and operator_ref='operador-ficticio-o17-e6' limit 1$$)),
 'P0001','idempotency_conflict','o mesmo código de partida em outra linha é conflito');
select throws_ok(format($$select public.admin_save_ride_shuttle_departure(%L,%L,pg_temp.v(format('select departs_at from private.ride_shuttle_departures where id=%%L',%L::uuid))::timestamptz,12)$$,
  pg_temp.id('d-dup'),pg_temp.id('line'),pg_temp.id('d1')),'P0001','ride_registry_duplicate','duas partidas da linha no mesmo horário são recusadas');
select throws_ok(format($$select public.admin_save_ride_shuttle_departure(%L,%L,now()-interval '1 hour',12)$$,pg_temp.id('d-past'),pg_temp.id('line')),
 'P0001','invalid_input','partida no passado é recusada');
select throws_ok(format($$select public.admin_save_ride_shuttle_departure(%L,%L,now()+interval '1 day',21)$$,pg_temp.id('d-big'),pg_temp.id('line')),
 'P0001','invalid_input','partida com mais de 20 assentos é recusada');
select is(public.admin_save_ride_shuttle_departure(pg_temp.id('d1'),pg_temp.id('line'),now()+interval '4 days',10)->>'seats_total','10',
 'a partida sem assentos reservados muda de horário e de lotação');
select tests.clear_authentication();
select throws_ok($$update private.ride_shuttle_lines set destination_area='Vila Mariana' where id=md5('207dline')::uuid$$,'P0001','ride_registry_frozen',
 'linha com partida não muda de áreas, por nenhum escritor');
-- Motoristas: uma van com 12 lugares conferidos e um sedã com 4.
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by)
 values(tests.uid('provider_c'),'simulation','van','approved',private.sp_date(now())+60,tests.uid('admin')),
 (tests.uid('provider_d'),'simulation','sedan','approved',private.sp_date(now())+60,tests.uid('admin')),
 (tests.uid('admin'),'simulation','van','approved',private.sp_date(now())+60,tests.uid('provider_c'));
insert into private.ride_vehicle_capacity(driver_id,vehicle,document_ref,seats,valid_until)
 values(tests.uid('provider_c'),'van','TEST-207d',12,now()+interval '30 days'),(tests.uid('provider_d'),'sedan','TEST-207d',4,now()+interval '30 days'),
 (tests.uid('admin'),'van','TEST-207d',12,now()+interval '30 days');
select tests.authenticate_as('admin');
select is((select array_agg(e->>'id' order by e->>'id') from jsonb_array_elements(public.admin_ride_shuttle_line_departures(pg_temp.id('line'))->'drivers') e),
 (select array_agg(x::text order by x::text) from unnest(array[tests.uid('provider_c'),tests.uid('provider_d')]) x),
 'a lista de partidas traz os motoristas aprovados com capacidade conferida, sem o próprio operador');
select throws_ok(format($$select public.admin_designate_shuttle_driver(%L,%L)$$,pg_temp.id('d1'),tests.uid('provider_d')),'P0001','driver_ineligible',
 'sedã com 4 lugares não é designado para partida de 10 assentos');
select throws_ok(format($$select public.admin_designate_shuttle_driver(%L,%L)$$,pg_temp.id('d1'),tests.uid('provider_e')),'P0001','driver_ineligible',
 'quem não é motorista cadastrado não é designado');
select throws_ok(format($$select public.admin_designate_shuttle_driver(%L,%L)$$,pg_temp.id('d1'),tests.uid('admin')),'P0001','not_allowed',
 'o operador não designa a si mesmo');
select is(public.admin_designate_shuttle_driver(pg_temp.id('d1'),tests.uid('provider_c'))->>'driver_valid','true','a van com 12 lugares conferidos é designada');
select is(public.admin_designate_shuttle_driver(pg_temp.id('d1'),tests.uid('provider_c'))->>'driver_id',tests.uid('provider_c')::text,'repetir a designação responde o mesmo');
select is(pg_temp.audits('ride.shuttle_driver_designated',pg_temp.id('d1')::text),1,'a repetição não deixa outra auditoria');
select throws_ok(format($$select public.admin_save_ride_shuttle_departure(%L,%L,now()+interval '4 days',13)$$,pg_temp.id('d1'),pg_temp.id('line')),'P0001','driver_ineligible',
 'com motorista designado a lotação não passa da capacidade conferida');
select throws_ok(format($$select public.admin_mark_shuttle_departed(%L)$$,pg_temp.id('d1')),'P0001','ride_departure_not_ready',
 'partida a dias de distância não é marcada como partida');
select is(public.admin_save_ride_shuttle_departure(pg_temp.id('soon'),pg_temp.id('line'),now()+interval '10 minutes',8)->>'state','open','uma partida daqui a dez minutos');
select throws_ok(format($$select public.admin_mark_shuttle_departed(%L)$$,pg_temp.id('soon')),'P0001','ride_departure_not_ready',
 'partida sem motorista designado não é marcada como partida');
select lives_ok(format($$select public.admin_designate_shuttle_driver(%L,%L)$$,pg_temp.id('soon'),tests.uid('provider_c')),'a operação designa a van');
select throws_ok(format($$select public.admin_mark_shuttle_departed(%L)$$,pg_temp.id('soon')),'P0001','ride_departure_not_ready',
 'com motorista, a partida daqui a dez minutos ainda não é marcada como partida');
select is(pg_temp.v(format('select state from private.ride_shuttle_departures where id=%L',pg_temp.id('soon'))),'open',
 'antes do horário a partida segue aberta para devolver ou remarcar assento');
select tests.clear_authentication();
update private.ride_shuttle_departures set departs_at=now()-interval '1 minute' where id=pg_temp.id('soon');
select tests.authenticate_as('admin');
select is(public.admin_mark_shuttle_departed(pg_temp.id('soon'))->>'state','departed','com motorista e no horário a partida é marcada como partida');
select is(public.admin_mark_shuttle_departed(pg_temp.id('soon'))->>'state','departed','repetir a marcação responde o mesmo estado');
select is(pg_temp.audits('ride.shuttle_departure_departed',pg_temp.id('soon')::text),1,'a repetição não deixa outra auditoria');
select ok(pg_temp.v(format('select closed_at is not null from private.ride_shuttle_departures where id=%L',pg_temp.id('soon')))::boolean,'a partida marcada fica encerrada');
select throws_ok(format($$select public.admin_designate_shuttle_driver(%L,null)$$,pg_temp.id('soon')),'P0001','ride_seat_frozen','partida encerrada não troca de motorista');
select throws_ok(format($$select public.admin_save_ride_shuttle_departure(%L,%L,now()+interval '1 day',8)$$,pg_temp.id('soon'),pg_temp.id('line')),'P0001','ride_seat_frozen',
 'partida encerrada não muda de horário');
select is(public.admin_designate_shuttle_driver(pg_temp.id('d1'),null)->>'driver_id',null,'a designação pode ser retirada de uma partida aberta');
select lives_ok(format($$select public.admin_cancel_shuttle_departure(%L,'motivo de teste',%L)$$,pg_temp.id('d1'),pg_temp.id('k-cancel')),'a operação cancela a outra partida');
select throws_ok(format($$select public.admin_mark_shuttle_departed(%L)$$,pg_temp.id('d1')),'P0001','ride_seat_unavailable','partida cancelada não é marcada como partida');
select tests.clear_authentication();
select throws_ok(format($$update private.ride_shuttle_departures set state='departed' where id=%L$$,pg_temp.id('d1')),'P0001','ride_seat_frozen',
 'nenhum escritor reabre ou marca partida cancelada');
insert into private.ride_shuttle_departures(id,line_id,departs_at,seats_total) values(pg_temp.id('raw'),pg_temp.id('line'),now()+interval '5 days',8);
select throws_ok(format($$update private.ride_shuttle_departures set state='departed' where id=%L$$,pg_temp.id('raw')),'P0001','ride_departure_not_ready',
 'nenhum escritor marca como partida uma partida sem motorista');
select tests.authenticate_as('admin');
select is((select count(*)::int from jsonb_array_elements(public.admin_ride_shuttle_line_departures(pg_temp.id('line'))->'departures')),3,
 'a lista da linha traz as partidas abertas, encerradas e canceladas recentes');
select throws_ok(format($$select public.admin_ride_shuttle_line_departures(%L)$$,pg_temp.id('live-line')),'P0001','not_allowed','partidas de linha de outro ambiente não são lidas');

-- ─── Blocos por hora ───────────────────────────────────────────────────────────────────────
select is(public.admin_save_ride_block_tariff(pg_temp.id('t2h'),'Saúde','2h-207d',120,40,15000,1000,200,'TARIFA-207d',now()+interval '90 days')->>'code','2h-207d',
 'a operação cadastra um bloco de duas horas');
select is(public.admin_save_ride_block_tariff(pg_temp.id('t2h'),'Saúde','2h-207d',120,40,15000,1000,200,'TARIFA-207d',
   pg_temp.v(format('select valid_until from private.ride_block_tariffs where id=%L',pg_temp.id('t2h')))::timestamptz)->>'id',pg_temp.id('t2h')::text,'a repetição responde o mesmo bloco');
select is(pg_temp.audits('ride.block_tariff_saved',pg_temp.id('t2h')::text),1,'a repetição não deixa outra auditoria');
select throws_ok(format($$select public.admin_save_ride_block_tariff(%L,'Saúde','1h',60,20,9000,2000,300,'TARIFA-207d','infinity')$$,pg_temp.id('t-dup')),
 'P0001','ride_registry_duplicate','outro bloco com o código de um bloco da área é recusado');
select throws_ok(format($$select public.admin_save_ride_block_tariff(%L,'Saúde','30m',30,10,5000,0,0,'TARIFA-207d','infinity')$$,pg_temp.id('t-short')),
 'P0001','invalid_input','bloco de menos de uma hora é recusado');
select throws_ok(format($$select public.admin_save_ride_block_tariff(%L,'Saúde','Dois H',120,40,15000,0,0,'TARIFA-207d','infinity')$$,pg_temp.id('t-code')),
 'P0001','invalid_input','código com espaço ou maiúscula é recusado');
select is(public.admin_save_ride_block_tariff(pg_temp.id('t2h'),'Saúde','2h-207d',120,40,16000,1000,200,'TARIFA-207d',now()+interval '90 days')->>'block_cents','16000',
 'o preço do bloco muda para as próximas cotações');
select ok(exists(select from jsonb_array_elements(public.admin_ride_block_tariffs()->'tariffs') e where e->>'id'=pg_temp.id('t2h')::text and e->>'legs'='0'),
 'o bloco aparece na lista, sem trecho vendido');
select ok(exists(select from jsonb_array_elements(public.admin_ride_block_tariffs()->'tariffs') e where e->>'code'='1h' and e->'valid_until'='null'::jsonb),
 'o bloco de ensaio sem prazo aparece sem data de validade');

-- ─── Corredores ────────────────────────────────────────────────────────────────────────────
select is(public.admin_save_ride_intercity_corridor('Jabaquara','Cidade de ensaio 207d','Município de ensaio A','Município de ensaio C','AUT-207d','COB-207d',4000,40,
   now()+interval '90 days',true)->>'enabled','true','a operação cadastra um corredor de ensaio');
select is(public.admin_save_ride_intercity_corridor('Jabaquara','Cidade de ensaio 207d','Município de ensaio A','Município de ensaio C','AUT-207d','COB-207d',4000,40,
   pg_temp.v($$select valid_until from private.ride_intercity_corridors where environment='simulation' and origin='Jabaquara' and destination='Cidade de ensaio 207d'$$)::timestamptz,true)->>'origin',
 'Jabaquara','a repetição responde o mesmo corredor');
select is(pg_temp.audits('ride.intercity_corridor_saved','Jabaquara > Cidade de ensaio 207d'),1,'a repetição não deixa outra auditoria');
select is(public.admin_save_ride_intercity_corridor('Jabaquara','Cidade de ensaio 207d','Município de ensaio A','Município de ensaio C','AUT-207d','COB-207d',4500,40,
   now()+interval '90 days',false)->>'empty_return_cents','4500','o corredor muda o retorno vazio e é desligado');
select is(pg_temp.v($$select count(*) from private.ride_intercity_corridors where environment='simulation' and origin='Jabaquara' and destination='Cidade de ensaio 207d'$$)::int,1,
 'um corredor por sentido');
select throws_ok($$select public.admin_save_ride_intercity_corridor('Jabaquara','Cidade de ensaio 207d','Município A','Município A','AUT','COB',0,0,'infinity',false)$$,
 'P0001','invalid_input','corredor dentro do mesmo município é recusado');
select throws_ok($$select public.admin_save_ride_intercity_corridor('Fora 1','Fora 2','Município A','Município B','AUT','COB',0,0,'infinity',false)$$,
 'P0001','invalid_input','corredor sem nenhuma ponta no mercado é recusado');
select is(jsonb_array_length(public.admin_ride_intercity_corridors()->'corridors'),2,'a lista traz o corredor semeado e o novo');

-- ─── Políticas de reserva ──────────────────────────────────────────────────────────────────
select is(public.admin_save_ride_reserve_policy('Vila Mariana',120,45,90,'POL-207d',now()+interval '90 days',true)->>'confirm_lead_minutes','45',
 'a operação altera a política de reserva de uma área');
select is(public.admin_save_ride_reserve_policy('Vila Mariana',120,45,90,'POL-207d',
   pg_temp.v($$select valid_until from private.ride_reserve_policies where environment='simulation' and area='Vila Mariana'$$)::timestamptz,true)->>'area','Vila Mariana','a repetição responde a mesma política');
select is(pg_temp.audits('ride.reserve_policy_saved','Vila Mariana'),1,'a repetição não deixa outra auditoria');
select throws_ok($$select public.admin_save_ride_reserve_policy('Vila Mariana',30,45,90,'POL-207d','infinity',true)$$,'P0001','invalid_input',
 'o prazo de confirmação não passa da antecedência mínima');
select throws_ok($$select public.admin_save_ride_reserve_policy('Área inexistente',120,45,90,'POL-207d','infinity',true)$$,'P0001','invalid_input',
 'política para área fora do mercado é recusada');
select is((select p->>'min_lead_minutes' from jsonb_array_elements(public.admin_ride_reserve_policies()->'policies') p where p->>'area'='Vila Mariana'),'120',
 'a política alterada aparece na lista');
select tests.clear_authentication();

-- ─── Listas da etapa 5 ─────────────────────────────────────────────────────────────────────
insert into private.ride_minor_driver_clearances(driver_id,evidence_ref,valid_until,granted_by)
 values(tests.uid('provider_c'),'CHECAGEM-207d',now()+interval '60 days',tests.uid('admin')),(tests.uid('provider_d'),'CHECAGEM-207e',now()-interval '1 day',tests.uid('admin'));
insert into private.ride_subjects(id) select tests.uid(u) from unnest(array['provider_b','client_b']) u on conflict do nothing;
insert into private.ride_accounts(id,environment,kind,owner_id,name,request_key,request_hash)
 values(pg_temp.id('org'),'simulation','organization',tests.uid('provider_b'),'Empresa fictícia 207d',gen_random_uuid(),'\x00'),
 (pg_temp.id('org-live'),'live','organization',tests.uid('provider_b'),'Empresa real 207d',gen_random_uuid(),'\x00');
insert into private.ride_cost_centers(id,account_id,code,label) values(pg_temp.id('cc'),pg_temp.id('org'),'CC1','Centro fictício');
insert into private.ride_voucher_programs(id,account_id,environment,label,budget_cents,ride_value_cents,validity,excess_payer,funding_ref,evidence_ref,enabled,created_by)
 values(pg_temp.id('prog'),pg_temp.id('org'),'simulation','Programa fictício',100000,5000,tstzrange(now()-interval '1 day',now()+interval '30 days'),'none','F-207d','E-207d',true,tests.uid('admin'));
insert into private.ride_trip_grants(id,account_id,program_id,cost_center_id,issued_by,approved_by,decided_by,purpose,ceiling_cents,validity,status,guest,request_hash,decided_at)
 select pg_temp.id('g'||n),pg_temp.id('org'),pg_temp.id('prog'),pg_temp.id('cc'),tests.uid('provider_b'),tests.uid('provider_b'),tests.uid('provider_b'),'Visita fictícia',5000,
  tstzrange(now(),now()+interval '2 days'),'approved',true,'\x00',now() from generate_series(1,2) n;
insert into private.ride_guest_invites(id,account_id,grant_id,request_legs,token_hash,recipient_hash,request_hash,issued_by,expires_at,status)
 values(pg_temp.id('i1'),pg_temp.id('org'),pg_temp.id('g1'),'[{"origin":"Saúde","destination":"Jabaquara"}]',extensions.digest('207d-1','sha256'),'\x01','\x00',
   tests.uid('provider_b'),now()+interval '1 day','pending'),
 (pg_temp.id('i2'),pg_temp.id('org'),pg_temp.id('g2'),'[{"origin":"Saúde","destination":"Jabaquara"}]',extensions.digest('207d-2','sha256'),'\x02','\x00',
   tests.uid('provider_b'),now()+interval '1 day','declined');
insert into private.ride_invoices(id,account_id,environment,month,status,closed_at,closed_by,total_cents)
 values(pg_temp.id('inv'),pg_temp.id('org'),'simulation',(private.ride_month(now())-interval '1 month')::date,'closed',now(),tests.uid('admin'),12345),
 (pg_temp.id('inv-live'),pg_temp.id('org-live'),'live',(private.ride_month(now())-interval '1 month')::date,'closed',now(),tests.uid('admin'),999);
select tests.authenticate_as('admin');
select is((select array_agg(e->>'evidence_ref'||':'||(e->>'active') order by e->>'evidence_ref') from jsonb_array_elements(public.admin_ride_minor_clearances()) e),
 array['CHECAGEM-207d:true','CHECAGEM-207e:false'],'a lista de liberações mostra a vigente e a vencida, com a referência');
select is((select e->>'status' from jsonb_array_elements(public.admin_ride_guest_invites()) e where e->>'id'=pg_temp.id('i1')::text),'pending','o convite pendente aparece na lista');
select ok(not exists(select from jsonb_array_elements(public.admin_ride_guest_invites()) e where e ? 'recipient_hash' or e ? 'token_hash' or e ? 'email'),
 'a lista de convites não traz destinatário nem token');
select throws_ok(format($$select public.admin_revoke_ride_guest_invite(%L,'x')$$,pg_temp.id('i1')),'P0001','invalid_input','revogar exige um motivo');
select is(public.admin_revoke_ride_guest_invite(pg_temp.id('i1'),'Pedido da empresa')->>'status','revoked','a operação revoga o convite pendente');
select is(pg_temp.v(format('select status from private.ride_trip_grants where id=%L',pg_temp.id('g1'))),'rejected','a autorização do convidado cai com o convite');
select is(public.admin_revoke_ride_guest_invite(pg_temp.id('i1'),'Pedido da empresa')->>'status','revoked','repetir a revogação responde o mesmo');
select is(pg_temp.audits('ride.guest_invite_revoked',pg_temp.id('i1')::text),1,'a repetição não deixa outra auditoria');
select throws_ok(format($$select public.admin_revoke_ride_guest_invite(%L,'Pedido da empresa')$$,pg_temp.id('i2')),'P0001','ride_invite_unavailable',
 'convite já respondido não é revogado');
select is(pg_temp.v(format('select status from private.ride_trip_grants where id=%L',pg_temp.id('g2'))),'approved','a recusa não mexe na autorização do convite respondido');
select is((select array_agg(e->>'total_cents') from jsonb_array_elements(public.admin_ride_closed_invoices()) e),array['12345'],
 'a lista de faturas fechadas mostra só as do ambiente da implantação');
select tests.clear_authentication();

select * from finish();
rollback;
