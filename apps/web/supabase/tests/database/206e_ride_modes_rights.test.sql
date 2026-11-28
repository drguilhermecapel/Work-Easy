-- O17 etapa 6 · direitos do titular nas modalidades (C6): descarte do voo e dos termos de
-- reserva 24 h após o encerramento do trecho, eliminação na exclusão da conta (assentos
-- futuros liberados, respostas e atores anonimizados), exportação com assentos, termos de
-- reserva e extensões, e as invariantes de permissão de toda função nova da etapa 6.
-- Identidades e áreas fictícias do ensaio; sem rede, sem PSP e sem depender da hora do dia.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,id uuid not null);
create temp table x(k text primary key,data jsonb);
grant all on t,x to authenticated,anon,service_role;
create function pg_temp.id(p text) returns uuid language sql stable as $$select id from t where k=p$$;
create function pg_temp.key(p text) returns uuid language sql immutable as $$select md5('206e:'||p)::uuid$$;
create function pg_temp.data(p text) returns jsonb language sql stable as $$select data from x where k=p$$;
create function pg_temp.dep(n int) returns timestamptz language sql stable as
 $$select ((now() at time zone 'America/Sao_Paulo')::date+n+time '10:00') at time zone 'America/Sao_Paulo'$$;
create function pg_temp.taken(p text) returns int language sql stable as
 $$select coalesce(sum(seats),0)::int from private.ride_shuttle_seats where departure_id=pg_temp.key(p) and state='confirmed'$$;
grant execute on function pg_temp.id(text),pg_temp.key(text),pg_temp.data(text),pg_temp.dep(int) to authenticated,anon,service_role;
-- Cotação comum e aceite do próprio passageiro; o trecho é lido depois, fora do papel da API.
create function pg_temp.request(p_label text,p_origin text,p_destination text,p_at timestamptz) returns void language plpgsql as $$
declare q uuid;
begin
 q:=(public.ride_quote(pg_temp.key('quote:'||p_label),null,p_at,jsonb_build_array(jsonb_build_object('origin',p_origin,'destination',p_destination,'payer','passenger')))->>'id')::uuid;
 insert into t values(p_label||':quote',q),(p_label||':ride',(public.ride_consent(q,true)->>'ride_id')::uuid);
end $$;
create function pg_temp.legs() returns void language sql as $$
 insert into t select split_part(t.k,':',1),l.id from t join public.ride_legs l on l.ride_id=t.id where t.k like '%:ride' on conflict do nothing $$;
-- Quem executa uma função, pela ACL efetiva (sem ACL vale a padrão, que concede a PUBLIC).
create function pg_temp.api_can_execute(p oid) returns boolean language sql stable as $$
 select exists(select from pg_proc f cross join lateral aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a
   where f.oid=p and a.privilege_type='EXECUTE' and a.grantee in (0,'anon'::regrole,'authenticated'::regrole,'service_role'::regrole)) $$;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 select tests.uid(u),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true from unnest(array['provider_b','provider_d']) u;
insert into private.ride_vehicle_capacity(driver_id,vehicle,document_ref,seats,valid_until) values(tests.uid('provider_d'),'sedan','TEST-206e',4,now()+interval '30 days');

-- ── Encadeamentos: purga e exportação embrulhadas, sem job novo, visão com as mesmas colunas.
select has_function('private','purge_ride_safety_before_modes','a purga anterior foi preservada sob o novo nome');
select has_function('public','ride_export_before_modes','a exportação anterior foi preservada sob o novo nome');
select is((select array_agg(command order by command) from cron.job where command like '%purge_ride_safety%'),array['select private.purge_ride_safety()'],
 'nenhum job novo: o job de retenção existente chama o topo da purga');
select is((select count(*)::int from cron.job where command ~ 'modes|erase_ride|shuttle|reserve_terms|block_extension'),0,'nenhum job foi criado para as modalidades');
select is((select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema='public' and table_name='my_ride_data_export'),
 array['id','mobility'],'a visão de exportação mantém as colunas id e mobility');
select ok((select c.reloptions @> array['security_invoker=true'] from pg_class c where c.oid='public.my_ride_data_export'::regclass),'a visão segue com security_invoker');
select ok((select pg_get_viewdef('public.my_ride_data_export'::regclass) ~ 'ride_export_my_data\(\)'
 and pg_get_viewdef('public.my_ride_data_export'::regclass) !~ 'before_modes'),'a visão está ligada ao novo topo da exportação');
select is((select tgname::text from pg_trigger where tgrelid='public.profiles'::regclass and tgfoid='private.erase_ride_modes()'::regprocedure),'erase_ride_modes',
 'a eliminação das modalidades é um gatilho da exclusão de conta');
select ok('erase_ride_modes'>'erase_ride_account','e dispara depois do encerramento dos trechos da pessoa');

-- ── Invariantes de permissão de toda função nova (ou substituída) da etapa 6.
create temp table private_fns as select unnest(array[
 'attach_ride_class_modes','check_ride_block','check_ride_block_amendment','check_ride_leg_mode','check_ride_market','check_ride_reserve_window',
 'check_ride_terminal_change','emit_shuttle_notice','erase_ride_modes','extend_ride_block_return','freeze_passenger_class','freeze_ride_access_boarding',
 'freeze_ride_block','freeze_ride_leg_mode','freeze_ride_reserve_terms','guard_ride_shuttle_departure','guard_ride_shuttle_seat','inherit_ride_class_features',
 'purge_ride_safety','purge_ride_safety_before_modes','reagree_ride_reserve','require_ride_access_equipment','require_ride_class_capacity','require_ride_modality',
 'require_ride_shuttle_sale','reset_ride_vehicle_features','ride_access_boarding','ride_access_equipped','ride_access_supply','ride_apply_extension',
 'ride_attach_quote_mode','ride_before_blocks_eligible','ride_before_catalog_eligible','ride_before_modes_eligible','ride_block_fee','ride_block_issue',
 'ride_capacity_candidates','ride_capacity_estimate','ride_class_gate_issue','ride_class_list','ride_corridor','ride_corridor_registered',
 'ride_driver_departure_tasks','ride_driver_extension_tasks','ride_driver_shift_tasks','ride_extension_issue','ride_leg_access_covers','ride_leg_has_mode',
 'ride_leg_mode_issue','ride_market_for','ride_modality_allowed','ride_modality_issue','ride_mode_frozen','ride_names_assistance_animal','ride_offer_eligible',
 'ride_pre_dispatch_eligible','ride_quote_before_corridors','ride_quote_has_mode','ride_reprice_mode_quote','ride_reservation_check',
 'ride_reservation_check_before_reserve','ride_reserve_event','ride_reserve_move','ride_reserve_move_issue','ride_reserve_release','ride_reserve_settle',
 'ride_reserve_terminal','ride_shuttle_event','ride_shuttle_issue','ride_shuttle_lock_departures','ride_shuttle_replay','ride_shuttle_taken',
 'ride_terminal_change_issue','ride_terminal_closed_at','ride_vehicle_meets','sync_ride_reserve_terms']) as name;
create temp table public_fns as select unnest(array[
 'ride_market_catalog(text,text,timestamptz)','ride_request_modality(text,text,text,timestamptz)','ride_class_menu(uuid,timestamptz,jsonb)',
 'ride_validate_vehicle_features(uuid,integer,text,text,boolean,text)','ride_access_options(uuid,timestamptz)',
 'ride_quote_accessible(uuid,uuid,timestamptz,jsonb,text,boolean)','ride_verify_access_equipment(uuid,text,text,text,timestamptz)',
 'ride_shift_reservation(uuid,timestamptz,text,uuid)','driver_decide_shift(uuid,boolean)','ride_reserve_contingency(uuid,text,timestamptz,uuid)',
 'ride_reserve_flight(uuid,text)','ride_reserve_state(uuid)','driver_mode_tasks()','ride_shuttle_board(text,text)',
 'ride_book_shuttle_seat(uuid,integer,integer,uuid)','ride_cancel_shuttle_seat(uuid,uuid)','ride_rebook_shuttle_seat(uuid,uuid,uuid)',
 'admin_cancel_shuttle_departure(uuid,text,uuid)','admin_shuttle_departures()','driver_shuttle_manifest(uuid)','ride_block_options(text,timestamptz)',
 'ride_quote_block(uuid,timestamptz,text,text,text,uuid)','ride_intercity_options()','ride_quote_intercity(uuid,timestamptz,jsonb)',
 'ride_propose_extension(uuid,integer,integer,uuid)','ride_decide_extension(uuid,boolean)','ride_block_state(uuid)','ride_export_my_data()']) as sig;
select is((select array_agg(n.name order by n.name) from private_fns n where not exists(select from pg_proc p where p.pronamespace='private'::regnamespace and p.proname=n.name)),
 null,'toda função privada da etapa 6 existe com o nome esperado');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p join private_fns n on n.name=p.proname
 where p.pronamespace='private'::regnamespace and pg_temp.api_can_execute(p.oid)),null,
 'nenhum auxiliar ou gatilho privado da etapa 6 é executável por PUBLIC, anon, authenticated ou service_role');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_proc p
 where p.pronamespace='private'::regnamespace and p.proname ~ '(^|_)(ride|shuttle)(_|$)' and pg_temp.api_can_execute(p.oid)),null,
 'a varredura vale para toda função privada de corridas: nenhuma é executável por papel da API');
select is((select array_agg(p.oid::regprocedure::text order by 1) from pg_trigger g join pg_class c on c.oid=g.tgrelid join pg_proc p on p.oid=g.tgfoid
 where not g.tgisinternal and c.relname ~ '^ride(s$|_)' and pg_temp.api_can_execute(p.oid)),null,
 'nenhuma função de gatilho das tabelas de corridas é executável por papel da API');
select is((select array_agg(s.sig order by s.sig) from public_fns s where to_regprocedure('public.'||s.sig) is null),null,
 'toda RPC pública da etapa 6 existe com a assinatura esperada');
select is((select array_agg(s.sig order by s.sig) from public_fns s join pg_proc p on p.oid=to_regprocedure('public.'||s.sig)
 where not has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute')
   or has_function_privilege('service_role',p.oid,'execute') or not p.prosecdef or not p.proconfig @> array['search_path=""']
   or exists(select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0 and a.privilege_type='EXECUTE')),null,
 'cada RPC da etapa 6 é só de pessoa autenticada: sem PUBLIC, sem anon, sem service_role, definer com search_path vazio');
select is((select has_function_privilege('authenticated',p.oid,'execute')::text||':'||has_function_privilege('anon',p.oid,'execute')::text||':'||
 exists(select from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantee=0)::text
 from pg_proc p where p.oid='public.ride_quote(uuid,uuid,timestamptz,jsonb)'::regprocedure),'true:false:false',
 'a cotação comum embrulhada segue só para quem tem sessão');
select is(pg_temp.api_can_execute('public.ride_export_before_modes()'::regprocedure),false,'a exportação anterior não é executável por nenhum papel da API');
select is((select array_agg(c.relname::text order by 1) from pg_class c cross join (values('anon'),('authenticated'),('service_role')) r(n)
 where c.relnamespace='private'::regnamespace and c.relname in ('ride_markets','ride_market_areas','ride_modalities','ride_market_modalities','ride_quote_modes',
   'ride_leg_modes','ride_access_equipment','ride_access_policies','ride_reserve_policies','ride_reserve_terms','ride_reserve_shifts','ride_reserve_events',
   'ride_shuttle_lines','ride_shuttle_departures','ride_shuttle_seats','ride_shuttle_events','ride_block_tariffs','ride_intercity_corridors','ride_leg_blocks',
   'ride_block_extensions','ride_block_extension_decisions') and has_table_privilege(r.n,c.oid,'select,insert,update,delete,truncate')),null,
 'nenhum papel da API tem direito sobre as tabelas da etapa 6');
select is((select count(*)::int from pg_class c where c.relnamespace='private'::regnamespace and c.relrowsecurity and c.relname in ('ride_markets','ride_market_areas',
   'ride_modalities','ride_market_modalities','ride_quote_modes','ride_leg_modes','ride_access_equipment','ride_access_policies','ride_reserve_policies',
   'ride_reserve_terms','ride_reserve_shifts','ride_reserve_events','ride_shuttle_lines','ride_shuttle_departures','ride_shuttle_seats','ride_shuttle_events',
   'ride_block_tariffs','ride_intercity_corridors','ride_leg_blocks','ride_block_extensions','ride_block_extension_decisions')),21,
 'as 21 tabelas da etapa 6 têm RLS ligada');
select tests.authenticate_anon();
select throws_ok($$select public.ride_export_my_data()$$,'42501',null,'visitante anônimo não exporta dados de corridas');
select throws_ok($$select private.purge_ride_safety()$$,'42501',null,'visitante anônimo não executa a purga');
select tests.authenticate_service();
select throws_ok($$select public.ride_export_my_data()$$,'42501',null,'o papel de serviço não exporta no lugar da pessoa');
select throws_ok($$select private.purge_ride_safety()$$,'42501',null,'o papel de serviço não executa a purga');
select throws_ok($$select private.purge_ride_safety_before_modes()$$,'42501',null,'nem a purga anterior');
select tests.authenticate_as('client_a');
select throws_ok($$select private.purge_ride_safety()$$,'42501',null,'pessoa autenticada não executa a purga');
select throws_ok($$select private.erase_ride_modes()$$,'42501',null,'nem a função de eliminação');
select throws_ok($$select public.ride_export_before_modes()$$,'42501',null,'nem a exportação anterior, fora do novo topo');
select throws_ok($$select * from private.ride_reserve_terms$$,'42501',null,'os termos de reserva não são lidos direto');
select throws_ok($$select * from private.ride_shuttle_seats$$,'42501',null,'nem os assentos');
select throws_ok($$select * from private.ride_block_extension_decisions$$,'42501',null,'nem as respostas de extensão');
select tests.clear_authentication();

-- ── Cenário. Assentos: linha própria do teste, três partidas futuras e uma já passada.
insert into private.ride_shuttle_lines(id,environment,origin_area,destination_area,operator_ref,seat_cents,minutes,evidence_ref,valid_until,enabled)
 values(pg_temp.key('line'),'simulation','Saúde','Vila Mariana','OPERADOR-206e',1500,40,'EVIDENCIA-206e',now()+interval '60 days',true);
insert into private.ride_shuttle_departures(id,line_id,departs_at,seats_total)
 values(pg_temp.key('d1'),pg_temp.key('line'),pg_temp.dep(2),6),(pg_temp.key('d2'),pg_temp.key('line'),pg_temp.dep(3),6),
 (pg_temp.key('d3'),pg_temp.key('line'),pg_temp.dep(4),6),(pg_temp.key('gone'),pg_temp.key('line'),now()-interval '5 minutes',6),
 (pg_temp.key('dd'),pg_temp.key('line'),pg_temp.dep(5),4);
update private.ride_shuttle_departures set driver_id=tests.uid('provider_d') where id=pg_temp.key('dd');
insert into private.ride_shuttle_seats(id,departure_id,passenger_id,operation_key,seats,seat_cents)
 values(pg_temp.key('seat-past'),pg_temp.key('gone'),tests.uid('client_a'),pg_temp.key('k-past'),1,1500);
select private.ride_shuttle_event(pg_temp.key('k-past'),'booked',pg_temp.key('gone'),pg_temp.key('seat-past'),tests.uid('client_a'),'passenger',1,1500);
select tests.authenticate_as('client_a');
insert into t select 'seat-a1',(public.ride_book_shuttle_seat(pg_temp.key('d1'),2,1500,pg_temp.key('k-a1'))->>'id')::uuid;
insert into t select 'seat-a2',(public.ride_book_shuttle_seat(pg_temp.key('d2'),1,1500,pg_temp.key('k-a2'))->>'id')::uuid;
insert into t select 'seat-a3',(public.ride_rebook_shuttle_seat(pg_temp.id('seat-a2'),pg_temp.key('d3'),pg_temp.key('k-a3'))->>'id')::uuid;
select tests.authenticate_as('client_b');
insert into t select 'seat-b1',(public.ride_book_shuttle_seat(pg_temp.key('d1'),1,1500,pg_temp.key('k-b1'))->>'id')::uuid;
select tests.clear_authentication();
select is(pg_temp.taken('d1')||':'||pg_temp.taken('d2')||':'||pg_temp.taken('d3')||':'||pg_temp.taken('gone'),'3:0:1:1','assentos do cenário: 3, 0, 1 e 1 confirmados');

-- Reserva: A (para o terminal, com voo, motorista confirmado e proposta de novo horário),
-- B (sem motorista) e C (de outra pessoa, saindo do terminal, com voo, que será cancelada).
select tests.authenticate_as('client_a');
select pg_temp.request('a','Saúde','Terminal de ensaio',now()+interval '3 hours');
select pg_temp.request('b','Saúde','Jabaquara',now()+interval '6 hours');
select tests.authenticate_as('client_b');
select pg_temp.request('c','Terminal de ensaio','Saúde',now()+interval '5 hours');
select tests.clear_authentication();
select pg_temp.legs();
select is((select count(*)::int||':'||count(airport)::int from private.ride_reserve_terms where leg_id in (pg_temp.id('a'),pg_temp.id('b'),pg_temp.id('c'))),'3:2',
 'as três reservas congelam termos; as duas com terminal guardam o aeroporto');
select tests.authenticate_as('client_a');
select is(public.ride_reserve_flight(pg_temp.id('a'),'LA-3456')->>'flight_ref','LA3456','a passageira informa o voo da reserva A');
select tests.authenticate_as('client_b');
select is(public.ride_reserve_flight(pg_temp.id('c'),'G3 1234')->>'flight_ref','G31234','outra pessoa informa o voo da reserva C');
select tests.authenticate_as('provider_b');
select is(public.ride_accept_offer(pg_temp.id('a'),pg_temp.key('a-accept'))->>'status','accepted','um motorista confirma a reserva A');
select tests.authenticate_as('client_a');
select is(public.ride_shift_reservation(pg_temp.id('a'),now()+interval '3 hours 30 minutes','flight_delay',pg_temp.key('a-shift'))->>'state','proposed',
 'o atraso do voo vira proposta ao motorista confirmado');

-- Bloco por hora H: motorista D, uma extensão aplicada (E0) e outra pendente com o aceite da pagadora (E1).
insert into t select 'h:quote',(public.ride_quote_block(pg_temp.key('h'),now()+interval '9 hours','Saúde','Jabaquara','3h')->>'id')::uuid;
insert into t select 'h:ride',(public.ride_consent(pg_temp.id('h:quote'),true)->>'ride_id')::uuid;
-- Assistência: a escolha fica com a cotação e é congelada no trecho X (imediato, sem motorista).
insert into t select 'x:quote',(public.ride_quote_with_access(pg_temp.key('x'),null,null,'[{"origin":"Saúde","destination":"Vila Mariana","payer":"passenger"}]','boarding')->>'id')::uuid;
select tests.clear_authentication();
update private.ride_access_quotes set companion=true,boarding='{"1":5}' where quote_id=pg_temp.id('x:quote');
select tests.authenticate_as('client_a');
insert into t select 'x:ride',(public.ride_consent(pg_temp.id('x:quote'),true)->>'ride_id')::uuid;
select tests.clear_authentication();
select pg_temp.legs();
insert into private.ride_quote_modes(quote_id,seq,modality,environment,market,authorization_ref) values(pg_temp.id('x:quote'),1,'assist','simulation','sao-paulo','ficticio-o17-e6');
insert into private.ride_leg_modes(leg_id,modality,environment,market,authorization_ref)
 select pg_temp.id(l),'assist','simulation','sao-paulo','ficticio-o17-e6' from unnest(array['x','c']) l;
insert into private.ride_access_equipment(driver_id,vehicle_ref,kind,inspected_ref,trained_ref,valid_until)
 values(tests.uid('provider_d'),'VEI-206E','ramp','VISTORIA-206E','TREINO-206E',now()+interval '30 days');
select tests.authenticate_as('provider_d');
select is(public.ride_accept_offer(pg_temp.id('h'),pg_temp.key('h-accept'))->>'status','accepted','outro motorista aceita o bloco H');
select tests.authenticate_as('client_a');
insert into t select 'e0',(public.ride_propose_extension(pg_temp.id('h'),30,0,pg_temp.key('e0'))->>'id')::uuid;
select is(public.ride_decide_extension(pg_temp.id('e0'),true),'pending','a pagadora aceita a extensão E0');
select tests.authenticate_as('provider_d');
select is(public.ride_decide_extension(pg_temp.id('e0'),true),'applied','com o aceite do motorista a extensão E0 é aplicada');
select tests.authenticate_as('client_a');
insert into t select 'e1',(public.ride_propose_extension(pg_temp.id('h'),15,0,pg_temp.key('e1'))->>'id')::uuid;
select is(public.ride_decide_extension(pg_temp.id('e1'),true),'pending','a pagadora aceita a extensão E1, que segue pendente');

-- ── Exportação da própria pessoa.
insert into x values('a',public.ride_export_my_data());
select is(public.ride_export_my_data(),pg_temp.data('a'),'repetir a exportação devolve o mesmo conteúdo e nada grava');
select is((select mobility from public.my_ride_data_export),pg_temp.data('a'),'a visão da exportação da conta entrega o mesmo conteúdo');
select is((select id from public.my_ride_data_export),tests.uid('client_a'),'e identifica só a própria pessoa');
select ok(pg_temp.data('a') ?& array['driver','quotes','legs','help','my_places','my_route_decisions','safety_cases','my_messages','reviews','access_preferences'],
 'as chaves das etapas anteriores continuam na exportação');
select ok(pg_temp.data('a') ?& array['shuttle_seats','reserve_terms','reserve_shifts','block_extensions'],'C6: a exportação ganha assentos, termos de reserva e extensões');
select is(jsonb_array_length(pg_temp.data('a')->'shuttle_seats'),4,'a passageira recebe os seus quatro registros de assento');
select is((select s-'booked_at' from jsonb_array_elements(pg_temp.data('a')->'shuttle_seats') s where s->>'id'=pg_temp.id('seat-a1')::text),
 jsonb_build_object('id',pg_temp.id('seat-a1'),'environment','simulation','origin_area','Saúde','destination_area','Vila Mariana','departs_at',pg_temp.dep(2),
   'seats',2,'seat_cents',1500,'charged_cents',0,'state','confirmed'),'cada assento traz linha, partida, quantidade, preço e que nada foi cobrado');
select is((select (s->>'state')||':'||(s->>'replaces') from jsonb_array_elements(pg_temp.data('a')->'shuttle_seats') s where s->>'id'=pg_temp.id('seat-a3')::text),
 'confirmed:'||pg_temp.id('seat-a2'),'a remarcação aparece ligada ao assento que substituiu');
select is((select (s->>'state')||':'||(s ? 'closed_at') from jsonb_array_elements(pg_temp.data('a')->'shuttle_seats') s where s->>'id'=pg_temp.id('seat-a2')::text),
 'rebooked:true','o assento remarcado aparece encerrado');
select is((select t-'frozen_at'-'confirm_by'-'original_pickup' from jsonb_array_elements(pg_temp.data('a')->'reserve_terms') t where t->>'leg'=pg_temp.id('a')::text),
 jsonb_build_object('leg',pg_temp.id('a'),'state','confirmed','airport','Aeroporto de ensaio','terminal','Terminal de ensaio','flight_ref','LA3456'),
 'C6: os termos da reserva A trazem estado, terminal e o voo informado');
select is((select (t->>'state')||':'||(t ? 'flight_ref')||':'||(t ? 'airport') from jsonb_array_elements(pg_temp.data('a')->'reserve_terms') t
 where t->>'leg'=pg_temp.id('b')::text),'awaiting_driver:false:false','a reserva B, fora de terminal, vem sem voo');
select is((select array_agg(t->>'leg' order by t->>'leg') from jsonb_array_elements(pg_temp.data('a')->'reserve_terms') t),
 (select array_agg(id::text order by id::text) from t where k in ('a','b','h')),'só as reservas da própria passageira: A, B e o bloco agendado H');
select is((select (s->>'id')||':'||(s->>'reason')||':'||(s->>'state')||':'||(s->>'requested_by_me')||':'||(s ? 'my_answer')
 from jsonb_array_elements(pg_temp.data('a')->'reserve_shifts') s),pg_temp.key('a-shift')||':flight_delay:proposed:true:false','o pedido de novo horário aparece como pedido dela');
select is((select (e->>'state')||':'||(e->>'minutes')||':'||(e->>'cents')||':'||(e->>'proposed_by_me')||':'||(e->>'accepted')||':'||(e ? 'driver_cents')
 from jsonb_array_elements(pg_temp.data('a')->'block_extensions') e where e->>'id'=pg_temp.id('e0')::text),'applied:30:4000:true:true:false',
 'C6: a extensão aplicada aparece com a proposta e o aceite dela, sem a parte do motorista');
select is((select (e->>'state')||':'||(e->>'minutes')||':'||(e->>'cents')||':'||(e->>'accepted') from jsonb_array_elements(pg_temp.data('a')->'block_extensions') e
 where e->>'id'=pg_temp.id('e1')::text),'pending:15:2000:true','a extensão pendente aparece com o aceite já dado');
select is(pg_temp.data('a')->'access_preferences',jsonb_build_array(jsonb_build_object('leg',pg_temp.id('x'),'cue','text','assistance','boarding','shared',false,
 'companion',true,'boarding_minutes',5)),'a preferência de assistência passa a trazer acompanhante e minutos de embarque');
select ok(position('OPERADOR-206e' in pg_temp.data('a')::text)=0 and position('EVIDENCIA-206e' in pg_temp.data('a')::text)=0
 and position('ficticio-o17-e6' in pg_temp.data('a')::text)=0,'a exportação não traz operador, evidência nem referência de autorização');
select ok(position(pg_temp.id('seat-b1')::text in pg_temp.data('a')::text)=0 and position(tests.uid('client_b')::text in pg_temp.data('a')::text)=0
 and position(tests.uid('provider_b')::text in pg_temp.data('a')::text)=0 and position(tests.uid('provider_d')::text in pg_temp.data('a')::text)=0
 and position('G31234' in pg_temp.data('a')::text)=0,'nem assento, voo ou identificador de outra pessoa');
select tests.authenticate_as('client_b');
insert into x values('b',public.ride_export_my_data());
select is((select jsonb_agg(s->>'id') from jsonb_array_elements(pg_temp.data('b')->'shuttle_seats') s),jsonb_build_array(pg_temp.id('seat-b1')),'outra passageira recebe só o próprio assento');
select is((select jsonb_agg(t->>'flight_ref') from jsonb_array_elements(pg_temp.data('b')->'reserve_terms') t),'["G31234"]'::jsonb,'e só a própria reserva, com o próprio voo');
select is(pg_temp.data('b')->'block_extensions'||(pg_temp.data('b')->'reserve_shifts'),'[]'::jsonb,'sem extensão nem pedido de horário de terceiros');
select tests.authenticate_as('provider_b');
insert into x values('pb',public.ride_export_my_data());
select is((select (s->>'id')||':'||(s->>'requested_by_me')||':'||(s ? 'my_answer') from jsonb_array_elements(pg_temp.data('pb')->'reserve_shifts') s),
 pg_temp.key('a-shift')||':false:false','o motorista recebe a proposta que lhe foi feita, ainda sem resposta');
select ok(pg_temp.data('pb')->'reserve_terms'='[]'::jsonb and position('LA3456' in pg_temp.data('pb')::text)=0,'o motorista não recebe os termos nem o voo da passageira');
select tests.authenticate_as('provider_d');
insert into x values('pd',public.ride_export_my_data());
select is((select (e->>'state')||':'||(e->>'driver_cents')||':'||(e->>'proposed_by_me')||':'||(e->>'accepted') from jsonb_array_elements(pg_temp.data('pd')->'block_extensions') e
 where e->>'id'=pg_temp.id('e0')::text),'applied:3600:false:true','o motorista do bloco recebe a extensão com a sua parte e o seu aceite');
select is((select (e->>'state')||':'||(e ? 'accepted') from jsonb_array_elements(pg_temp.data('pd')->'block_extensions') e where e->>'id'=pg_temp.id('e1')::text),
 'pending:false','a extensão que ele ainda não respondeu vem sem resposta');
select ok(pg_temp.data('pd')->'shuttle_seats'='[]'::jsonb and position(tests.uid('client_a')::text in pg_temp.data('pd')::text)=0,
 'sem assentos e sem identificador da passageira');
select tests.authenticate_as('admin');
select is(public.ride_export_my_data()->'shuttle_seats'||(public.ride_export_my_data()->'reserve_terms')||(public.ride_export_my_data()->'block_extensions'),'[]'::jsonb,
 'a exportação pessoal de quem administra não amplia o acesso');
select tests.clear_authentication();

-- ── Purga: voo e termos saem 24 h após o encerramento do trecho; nada antes disso.
insert into private.ride_access_preferences(leg,owner_id,cue,assistance,share_cue) values(pg_temp.id('c'),tests.uid('client_b'),'text','boarding',false);
select tests.authenticate_as('client_b');
select is(public.ride_transition(pg_temp.id('c'),'cancelled',pg_temp.key('c-cancel'))->>'status','cancelled','a reserva C é cancelada pela passageira');
select tests.clear_authentication();
select is((select state||':'||(closed_at is not null)||':'||flight_ref from private.ride_reserve_terms where leg_id=pg_temp.id('c')),'released:true:G31234',
 'o cancelamento encerra os termos e marca a hora do encerramento');
select lives_ok($$select private.purge_ride_safety()$$,'a purga roda pelo topo do encadeamento');
select is((select count(*)::int from private.ride_reserve_terms where leg_id in (pg_temp.id('a'),pg_temp.id('b'),pg_temp.id('c'))),3,
 'antes de 24 h do encerramento nenhum termo de reserva é descartado');
update private.ride_reserve_terms set closed_at=now()-interval '23 hours 59 minutes' where leg_id=pg_temp.id('c');
update public.ride_legs set updated_at=now()-interval '23 hours 59 minutes' where id=pg_temp.id('c');
select private.purge_ride_safety();
select is((select flight_ref from private.ride_reserve_terms where leg_id=pg_temp.id('c')),'G31234','a 23 h 59 min do encerramento o voo ainda está guardado');
select is((select count(*)::int from private.ride_leg_modes where leg_id=pg_temp.id('c') and modality='assist')
 +(select count(*)::int from private.ride_access_preferences where leg=pg_temp.id('c')),2,'e a assistência do trecho também');
update private.ride_reserve_terms set closed_at=now()-interval '24 hours 1 minute' where leg_id=pg_temp.id('c');
update public.ride_legs set updated_at=now()-interval '24 hours 1 minute' where id=pg_temp.id('c');
-- Termos antigos de trechos ainda abertos não contam: só o encerramento inicia o prazo.
update private.ride_reserve_terms set frozen_at=now()-interval '10 days',updated_at=now()-interval '10 days' where leg_id in (pg_temp.id('a'),pg_temp.id('b'));
update public.ride_legs set updated_at=now()-interval '10 days' where id in (pg_temp.id('a'),pg_temp.id('b'),pg_temp.id('x'));
select private.purge_ride_safety();
select is((select count(*)::int from private.ride_reserve_terms where leg_id=pg_temp.id('c')),0,'C6: 24 h após o encerramento os termos e o voo da reserva são descartados');
select is((select count(*)::int from private.ride_reserve_terms where leg_id in (pg_temp.id('a'),pg_temp.id('b'))),2,'os termos de trechos abertos permanecem');
select is((select array_agg(modality order by modality) from private.ride_leg_modes where leg_id=pg_temp.id('c')),array['airport','reserve'],
 'a modalidade de assistência do trecho encerrado sai com a mesma regra; reserva e aeroporto ficam');
select is((select count(*)::int from private.ride_access_preferences where leg=pg_temp.id('c')),0,'a purga anterior continua rodando por baixo: a preferência de assistência saiu');
select is((select count(*)::int from private.ride_leg_modes where leg_id=pg_temp.id('x') and modality='assist')
 +(select count(*)::int from private.ride_access_preferences where leg=pg_temp.id('x')),2,'a assistência de um trecho ainda aberto permanece');
select ok((select count(*)>0 and bool_and(position('G31234' in data::text)=0) from private.ride_reserve_events where leg_id=pg_temp.id('c')),
 'o registro de auditoria da reserva permanece e nunca guardou o voo');
select lives_ok($$select private.purge_ride_safety()$$,'repetir a purga não falha');
select is((select count(*)::int from private.ride_reserve_terms where leg_id in (pg_temp.id('a'),pg_temp.id('b'),pg_temp.id('h')))
 +(select count(*)::int from private.ride_leg_modes where leg_id=pg_temp.id('c')),5,'nem descarta mais nada');
select tests.authenticate_as('client_b');
select is(public.ride_reserve_state(pg_temp.id('c')),null,'depois da purga o trecho segue legível, sem termos de reserva');
select is(public.ride_export_my_data()->'reserve_terms','[]'::jsonb,'e a exportação já não traz o voo');
select tests.clear_authentication();

-- ── Exclusão da conta da passageira (client_a).
select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$,'a exclusão da conta da passageira conclui com as modalidades em uso');
select tests.clear_authentication();
select is((select array_agg(status order by k) from t join public.ride_legs l on l.id=t.id where k in ('a','b','h','x')),array['unknown','cancelled','unknown','cancelled'],
 'os trechos sem motorista são cancelados e os atribuídos ficam para revisão humana');
-- Assentos.
select is((select count(*)::int from private.ride_shuttle_seats where passenger_id=tests.uid('client_a')),0,'C6: nenhum assento da pessoa permanece');
select is(pg_temp.taken('d1')||':'||pg_temp.taken('d3')||':'||pg_temp.taken('gone'),'1:0:0','C6: os assentos futuros voltaram às partidas; o da outra passageira segue confirmado');
select is((select array_agg(seats order by seats) from private.ride_shuttle_events where action='released' and actor_role='system' and actor_id is null
 and seat_id is null and refund_due_cents=0 and data->>'reason'='account_erased' and departure_id in (pg_temp.key('d1'),pg_temp.key('d3'))),array[1,2]::smallint[],
 'cada assento futuro liberado deixa um registro do sistema, sem ator e sem valor devido');
select is((select count(*)::int from private.ride_shuttle_events where action='released' and departure_id in (pg_temp.key('gone'),pg_temp.key('d2'))),0,
 'partida já passada e assento já remarcado não geram liberação');
select is((select count(*)::int from private.ride_shuttle_events where actor_id=tests.uid('client_a')),0,'nenhum registro de assento guarda a pessoa como ator');
select is((select count(*)::int||':'||count(*) filter(where actor_id is null)::int from private.ride_shuttle_events where action='booked' and departure_id=pg_temp.key('d1')),
 '2:1','a auditoria das reservas de assento permanece, anonimizada só para quem saiu');
select ok((select bool_and(operation_key is not null and at is not null and actor_role='passenger') from private.ride_shuttle_events
 where action in ('booked','rebooked_from','rebooked_to') and actor_id is null),'os registros anonimizados mantêm papel, hora e chave da operação');
select is((select state||':'||seats from private.ride_shuttle_seats where id=pg_temp.id('seat-b1')),'confirmed:1','o assento da outra passageira não foi tocado');
select tests.authenticate_as('client_b');
select is((select (d->>'seats_left')::int from jsonb_array_elements(public.ride_shuttle_board('Saúde','Vila Mariana')->'lines'->0->'departures') d
 where d->>'id'=pg_temp.key('d1')::text),5,'o quadro volta a oferecer os assentos liberados');
select tests.clear_authentication();
-- Reserva.
select is((select state||':'||outcome||':'||(requested_by is null)||':'||(driver_id=tests.uid('provider_b')) from private.ride_reserve_shifts where id=pg_temp.key('a-shift')),
 'expired:leg_changed:true:true','C6: a proposta aberta é encerrada e deixa de apontar para a passageira');
select is((select count(*)::int from private.ride_reserve_shifts where state='proposed'),0,'nenhuma proposta fica aberta');
select is((select count(*)::int from private.ride_reserve_events where actor_id=tests.uid('client_a')),0,'C6: nenhum registro de reserva guarda a pessoa como ator');
select ok((select count(*)>=3 and bool_and(operation_key is not null and at is not null) from private.ride_reserve_events
 where leg_id=pg_temp.id('a') and actor_role='passenger' and actor_id is null),'os registros da passageira permanecem com papel, hora e chave, sem identificador');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('a') and actor_id=tests.uid('provider_b') and action='driver_confirmed'),1,
 'o registro do motorista, que segue com conta, não muda');
select throws_ok(format($$insert into private.ride_reserve_events(leg_id,action,actor_id,actor_role,operation_key) values(%L,'closed',%L,'system',gen_random_uuid())$$,
 pg_temp.id('a'),tests.uid('provider_b')),'23514',null,'registro do sistema continua sem poder nomear um ator');
select is((select count(*)::int from private.ride_reserve_terms where leg_id=pg_temp.id('b')),0,'os termos do trecho encerrado pela exclusão saem na hora');
select is((select state||':'||(flight_ref is null)||':'||terminal from private.ride_reserve_terms where leg_id=pg_temp.id('a')),'confirmed:true:Terminal de ensaio',
 'no trecho que fica para revisão o voo é apagado e os termos operacionais ficam');
-- Extensões.
select is((select state||':'||(closed_at is not null)||':'||(new_quote is null) from private.ride_block_extensions where id=pg_temp.id('e1')),'expired:true:true',
 'C6: a extensão pendente é encerrada sem ser aplicada');
select is((select count(*)::int from private.ride_block_extension_decisions where actor_id=tests.uid('client_a')),0,'C6: as respostas de extensão da pessoa são apagadas');
select is((select count(*)::int from private.ride_block_extension_decisions where extension_id=pg_temp.id('e0') and actor_id=tests.uid('provider_d') and accepted),1,
 'a resposta do motorista permanece');
select is((select array_agg((proposer is null)::text||':'||(required=array[tests.uid('provider_d')])::text||':'||(driver_id=tests.uid('provider_d'))::text||':'||proposer_role order by created_at,id)
 from private.ride_block_extensions where leg_id=pg_temp.id('h')),array['true:true:true:passenger','true:true:true:passenger'],
 'as propostas deixam de apontar para a pessoa e guardam só o papel de quem propôs');
select is((select state||':'||(new_quote is not null) from private.ride_block_extensions where id=pg_temp.id('e0')),'applied:true','a extensão aplicada segue aplicada');
select is((select count(*)::int from private.ride_consents c join private.ride_block_extensions e on e.new_quote=c.quote_id
 where e.id=pg_temp.id('e0') and c.actor_id=tests.uid('client_a') and c.accepted),1,'o aceite do preço aplicado continua no registro da transação, como no O16');
select is((select fare_cents||':'||duration_minutes from public.ride_legs where id=pg_temp.id('h')),'28000:210','o trecho mantém o preço e o tempo já aceitos');
select tests.authenticate_as('provider_d');
select is((select jsonb_agg(e->'proposed_by_me' order by e->>'created_at') from jsonb_array_elements(public.ride_block_state(pg_temp.id('h'))->'extensions') e),
 '[false,false]'::jsonb,'o motorista segue lendo o bloco, e a proposta de quem saiu não aparece como dele');
select throws_ok($$select public.ride_decide_extension(pg_temp.id('e1'),true)$$,'P0001','ride_extension_unavailable','a extensão encerrada pela exclusão não pode mais ser aceita');
select is(public.driver_mode_tasks()->'extensions','[]'::jsonb,'e sai das tarefas do motorista');
select tests.clear_authentication();
-- Assistência.
select is((select count(*)::int from private.ride_access_quotes where owner_id=tests.uid('client_a'))
 +(select count(*)::int from private.ride_access_preferences where owner_id=tests.uid('client_a')),0,'C6: a escolha de assistência sai da cotação e do trecho');
select is((select count(*)::int from private.ride_leg_modes where leg_id=pg_temp.id('x'))+(select count(*)::int from private.ride_quote_modes where quote_id=pg_temp.id('x:quote')),0,
 'e a modalidade de assistência sai do trecho e da cotação');
select is((select array_agg(modality order by modality) from private.ride_leg_modes where leg_id in (pg_temp.id('a'),pg_temp.id('h'))),array['airport','hourly','reserve','reserve'],
 'as modalidades sem dado sensível seguem nos trechos em revisão');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_export_my_data()$$,'P0001','not_allowed','conta encerrada não exporta');
select throws_ok($$select public.ride_shuttle_board(null,null)$$,'P0001','not_allowed','nem consulta o quadro de linhas');
select tests.clear_authentication();
-- Repetição: a exclusão já feita não refaz nem desfaz nada.
create temp table before_replay as select (select count(*) from private.ride_shuttle_events) as shuttle,(select count(*) from private.ride_reserve_events) as reserve,
 (select count(*) from private.ride_block_extensions) as extensions,(select count(*) from private.ride_reserve_terms) as terms;
select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('client_a'))$$,'repetir a exclusão da conta não falha');
select tests.clear_authentication();
select is((select (select count(*) from private.ride_shuttle_events)=b.shuttle and (select count(*) from private.ride_reserve_events)=b.reserve
 and (select count(*) from private.ride_block_extensions)=b.extensions and (select count(*) from private.ride_reserve_terms)=b.terms from before_replay b),true,
 'e não cria registro nem apaga outro');
select is(pg_temp.taken('d1'),1,'nem mexe nos assentos de quem ficou');

-- ── Exclusão das contas dos motoristas.
select is((select count(*)::int from private.ride_access_equipment where driver_id=tests.uid('provider_d'))
 +(select count(*)::int from private.ride_shuttle_departures where driver_id=tests.uid('provider_d')),2,'antes: o motorista D tem equipamento conferido e uma partida designada');
select tests.authenticate_service();
select lives_ok($$select public.anonymize_user(tests.uid('provider_d'))$$,'a exclusão da conta do motorista do bloco conclui');
select lives_ok($$select public.anonymize_user(tests.uid('provider_b'))$$,'a exclusão da conta do motorista da reserva conclui');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_access_equipment where driver_id=tests.uid('provider_d')),0,'o equipamento conferido do veículo dele é apagado');
select is((select (driver_id is null)::text||':'||state from private.ride_shuttle_departures where id=pg_temp.key('dd')),'true:open','a partida fica sem motorista designado e segue aberta');
select is((select count(*)::int from private.ride_block_extension_decisions),0,'as respostas de extensão do motorista são apagadas');
select is((select array_agg((driver_id is null)::text||':'||cardinality(required) order by created_at,id) from private.ride_block_extensions where leg_id=pg_temp.id('h')),
 array['true:0','true:0'],'as extensões deixam de apontar para o motorista');
select is((select (driver_id is null)::text||':'||(requested_by is null)::text||':'||state from private.ride_reserve_shifts where id=pg_temp.key('a-shift')),'true:true:expired',
 'C6: o ator motorista da proposta de horário é anonimizado');
select is((select count(*)::int from private.ride_reserve_events where actor_id is not null and leg_id=pg_temp.id('a')),0,'nenhum registro da reserva A guarda ator');
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('a') and action='driver_confirmed' and actor_role='driver' and actor_id is null),1,
 'a confirmação do motorista permanece como fato, sem identificador');
select is((select count(*)::int from private.ride_shuttle_events where actor_id is not null and actor_id<>tests.uid('client_b')),0,
 'só a passageira que continua com conta segue identificada no registro de assentos');
select tests.authenticate_as('client_b');
select is((select jsonb_agg(s->>'id') from jsonb_array_elements(public.ride_export_my_data()->'shuttle_seats') s),jsonb_build_array(pg_temp.id('seat-b1')),
 'quem continua com conta segue exportando os próprios dados');
select tests.clear_authentication();

select * from finish();
rollback;
