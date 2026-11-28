-- O17 etapa 6 · PAR-604, assento em linha de van (C4, itens 5, 6 e 8). Só dados fictícios,
-- dentro desta transação. Aceite do O17: "Ensaio de atraso, troca de terminal, último assento
-- e ausência do motorista produz remarcação ou restituição auditável. Só anunciar embarques
-- e janelas com operação autorizada." Nenhum valor é cobrado por assento nesta etapa.
begin;
select no_plan();
select tests.setup_fixture();
create function pg_temp.id(k text) returns uuid language sql immutable as $$select md5('206c2'||k)::uuid$$;
create function pg_temp.dep(n int) returns timestamptz language sql stable as
 $$select ((now() at time zone 'America/Sao_Paulo')::date+n+time '10:00') at time zone 'America/Sao_Paulo'$$;
create temp table t206(k text primary key,data jsonb);
grant all on t206 to authenticated;
create function pg_temp.seat(k text) returns uuid language sql stable as $$select (data->>'id')::uuid from t206 t where t.k=$1$$;
create function pg_temp.taken(k text) returns int language sql stable as
 $$select coalesce(sum(seats),0)::int from private.ride_shuttle_seats where departure_id=pg_temp.id(k) and state='confirmed'$$;
grant execute on function pg_temp.id(text),pg_temp.seat(text),pg_temp.dep(int) to authenticated;
-- Modo das travas de linha desta transação, para provar a trava das partidas na remarcação.
create extension if not exists pgrowlocks with schema extensions;
create function pg_temp.locks(variadic k text[]) returns text[] language sql as
 $$select coalesce(array_agg(m order by m),'{}') from private.ride_shuttle_departures d
   join extensions.pgrowlocks('private.ride_shuttle_departures') r on r.locked_row=d.ctid cross join unnest(r.modes) m
   where d.id in (select pg_temp.id(x) from unnest(k) x)$$;
create temp table m206 as select (select count(*) from private.ride_payment_orders)::int as orders,
 (select count(*) from private.ride_financial_events)::int as postings;

-- Sementes e superfície: linha fictícia só no ensaio, tabelas fechadas, auxiliares privados.
select is((select count(*)::int from private.ride_shuttle_lines where environment<>'simulation' or evidence_ref<>'ficticio-o17-e6'
   or operator_ref<>'operador-ficticio-o17-e6'),0,'só o ensaio tem linha semeada, com referências fictícias');
select is((select count(*)::int from private.ride_shuttle_departures where driver_id is not null or state<>'open'),0,
 'as partidas semeadas estão abertas e sem motorista designado');
select is((select count(*)::int from private.ride_shuttle_seats)+(select count(*)::int from private.ride_shuttle_events),0,'nenhum assento ou evento é semeado');
select is((select count(*)::int from pg_class c where c.relnamespace='private'::regnamespace
   and c.relname in ('ride_shuttle_lines','ride_shuttle_departures','ride_shuttle_seats','ride_shuttle_events') and c.relrowsecurity),4,
 'as quatro tabelas de assentos têm RLS ligada');
select is((select count(*)::int from information_schema.role_table_grants where table_schema='private' and table_name like 'ride\_shuttle\_%'
   and grantee in ('PUBLIC','anon','authenticated','service_role')),0,'nenhuma função da API tem privilégio nas tabelas de assentos');
select is((select count(*)::int from pg_proc p where p.pronamespace='private'::regnamespace
   and p.proname in ('guard_ride_shuttle_departure','guard_ride_shuttle_seat','ride_shuttle_issue','require_ride_shuttle_sale','ride_shuttle_lock_departures',
     'ride_shuttle_replay','ride_shuttle_event','emit_shuttle_notice','ride_shuttle_taken','ride_driver_departure_tasks')
   and not (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')
     or has_function_privilege('service_role',p.oid,'execute'))),10,'nenhum auxiliar ou gatilho privado de assentos é executável pelas funções da API');
select is((select count(*)::int from pg_proc p where p.pronamespace='public'::regnamespace
   and p.proname in ('ride_shuttle_board','ride_book_shuttle_seat','ride_cancel_shuttle_seat','ride_rebook_shuttle_seat',
     'admin_cancel_shuttle_departure','admin_shuttle_departures','driver_shuttle_manifest')
   and has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute')
   and not has_function_privilege('service_role',p.oid,'execute') and p.prosecdef and p.proconfig @> array['search_path=""']),7,
 'as sete RPCs de assentos são só de pessoa autenticada, com search_path vazio');

-- Fixtures: uma linha própria do teste (R$ 15,00 por assento, 40 minutos) e suas partidas.
insert into private.ride_shuttle_lines(id,environment,origin_area,destination_area,operator_ref,seat_cents,minutes,evidence_ref,valid_until,enabled)
 values(pg_temp.id('line'),'simulation','Saúde','Vila Mariana','TEST-206c2',1500,40,'TEST-206c2',now()+interval '60 days',true),
 (pg_temp.id('other'),'simulation','Vila Mariana','Jabaquara','TEST-206c2',900,30,'TEST-206c2',now()+interval '60 days',true),
 (pg_temp.id('off'),'simulation','Jabaquara','Vila Mariana','TEST-206c2',900,30,'TEST-206c2',now()+interval '60 days',false);
insert into private.ride_shuttle_departures(id,line_id,departs_at,seats_total)
 values(pg_temp.id('d1'),pg_temp.id('line'),pg_temp.dep(2),3),(pg_temp.id('d2'),pg_temp.id('line'),pg_temp.dep(3),12),
 (pg_temp.id('d3'),pg_temp.id('line'),pg_temp.dep(4),12),(pg_temp.id('dx'),pg_temp.id('line'),pg_temp.dep(5),6),
 (pg_temp.id('gone'),pg_temp.id('line'),now()-interval '5 minutes',12),
 (pg_temp.id('o1'),pg_temp.id('other'),pg_temp.dep(2),12),(pg_temp.id('off1'),pg_temp.id('off'),pg_temp.dep(2),12);

-- Portões (negativos): rede desligada, visitante, chave de serviço e conta encerrada.
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_shuttle_board(null,null)$$,'P0001','ride_feature_disabled','com o módulo desligado o quadro de linhas não abre');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-off')),'P0001','ride_feature_disabled',
 'com o despacho desligado nenhum assento é reservado');
select tests.authenticate_anon();
select throws_ok($$select public.ride_shuttle_board(null,null)$$,'42501',null,'visitante anônimo não consulta linhas');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-anon')),'42501',null,'visitante anônimo não reserva assento');
select throws_ok(format($$select public.ride_cancel_shuttle_seat(%L,%L)$$,pg_temp.id('x'),pg_temp.id('k-anon')),'42501',null,'visitante anônimo não cancela assento');
select throws_ok(format($$select public.ride_rebook_shuttle_seat(%L,%L,%L)$$,pg_temp.id('x'),pg_temp.id('d2'),pg_temp.id('k-anon')),'42501',null,'visitante anônimo não remarca assento');
select throws_ok(format($$select public.admin_cancel_shuttle_departure(%L,'motivo de teste',%L)$$,pg_temp.id('dx'),pg_temp.id('k-anon')),'42501',null,
 'visitante anônimo não cancela partida');
select throws_ok($$select public.admin_shuttle_departures()$$,'42501',null,'visitante anônimo não lista partidas da operação');
select throws_ok(format($$select public.driver_shuttle_manifest(%L)$$,pg_temp.id('d2')),'42501',null,'visitante anônimo não lê a lista de embarque');
select tests.authenticate_service();
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-svc')),'42501',null,
 'a chave de serviço não reserva assento em nome de ninguém');
select throws_ok(format($$select public.admin_cancel_shuttle_departure(%L,'motivo de teste',%L)$$,pg_temp.id('dx'),pg_temp.id('k-svc')),'42501',null,
 'a chave de serviço não cancela partida');
select tests.clear_authentication();

-- AO VIVO (antes de existir motorista nesta transação): linha cadastrada não abre nada sem autorização.
update private.ride_deployment set environment='live';
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='live';
insert into private.ride_area_authorizations(area,legal_ref,privacy_ref,ops_ref,until_at,quote_enabled,dispatch_enabled,monetization_enabled)
 select a,'TEST-206c2','TEST-206c2','TEST-206c2',now()+interval '30 days',true,true,false from unnest(array['Saúde','Vila Mariana']) a;
insert into private.ride_market_areas(environment,market,area) values('live','sao-paulo','Saúde'),('live','sao-paulo','Vila Mariana');
insert into private.ride_shuttle_lines(id,environment,origin_area,destination_area,operator_ref,seat_cents,minutes,evidence_ref,valid_until,enabled)
 values(pg_temp.id('live'),'live','Saúde','Vila Mariana','TEST-206c2',1500,40,'TEST-206c2',now()+interval '60 days',true);
insert into private.ride_shuttle_departures(id,line_id,departs_at,seats_total) values(pg_temp.id('l1'),pg_temp.id('live'),pg_temp.dep(2),12);
select tests.authenticate_as('client_a');
select is(public.ride_shuttle_board(null,null)->'lines','[]'::jsonb,'ao vivo, sem autorização da modalidade, nenhuma linha ou partida é anunciada');
select is(public.ride_shuttle_board(null,null)->>'simulation','false','o quadro identifica o ambiente ao vivo');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('l1'),pg_temp.id('k-live')),'P0001','ride_modality_unavailable',
 'ao vivo a reserva de assento passa pelo portão da modalidade e é recusada');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-live')),'P0001','ride_seat_unavailable',
 'ao vivo uma partida do ensaio não é vendida');
select tests.clear_authentication();
-- Um piloto não vale ao vivo; a autorização vigente até o fim da viagem abre exatamente essa linha.
update private.ride_market_modalities set status='pilot',authorization_ref='TEST-206c2',valid_until=now()+interval '30 days'
 where environment='live' and modality='shuttle_seat';
select tests.authenticate_as('client_a');
select is(public.ride_shuttle_board(null,null)->'lines','[]'::jsonb,'ao vivo uma linha de piloto não anuncia partida');
select tests.clear_authentication();
update private.ride_market_modalities set status='authorized' where environment='live' and modality='shuttle_seat';
select tests.authenticate_as('client_a');
select is((select array_agg(l->>'id') from jsonb_array_elements(public.ride_shuttle_board(null,null)->'lines') l),array[pg_temp.id('live')::text],
 'ao vivo só a autorização vigente anuncia a linha autorizada');
select tests.clear_authentication();
update private.ride_area_authorizations set dispatch_enabled=false where area='Vila Mariana';
select tests.authenticate_as('client_a');
select is(public.ride_shuttle_board(null,null)->'lines','[]'::jsonb,'sem despacho liberado na área de destino a partida não é anunciada');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('l1'),pg_temp.id('k-live')),'P0001','ride_modality_unavailable',
 'sem despacho liberado na área de destino o assento não é reservado');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_shuttle_seats),0,'nenhuma recusa deixou assento registrado');
update private.ride_deployment set environment='simulation';

-- ENSAIO.
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
select tests.authenticate_as('client_a');
insert into t206 values('board0',public.ride_shuttle_board('Saúde','Vila Mariana'));
select is((select data->>'simulation' from t206 where k='board0'),'true','o quadro identifica o ensaio');
select is((select jsonb_agg(l->>'id') from t206,jsonb_array_elements(data->'lines') l where k='board0'),jsonb_build_array(pg_temp.id('line')),
 'o filtro por origem e destino devolve só a linha do corredor');
select is((select array_agg(d->>'id' order by d->>'departs_at') from t206,jsonb_array_elements(data->'lines'->0->'departures') d where k='board0'),
 array[pg_temp.id('d1'),pg_temp.id('d2'),pg_temp.id('d3'),pg_temp.id('dx')]::text[],'só partidas abertas e futuras aparecem, em ordem de horário');
select is((select data->'lines'->0->'departures'->0 from t206 where k='board0')-'departs_at',
 jsonb_build_object('id',pg_temp.id('d1'),'seats_total',3,'seats_left',3,'state','open'),'a partida informa total e assentos livres');
select is((select (data->'lines'->0->>'seat_cents')::int from t206 where k='board0'),1500,'a linha informa o preço de um assento');
select is((select data->'my_seats' from t206 where k='board0'),'[]'::jsonb,'quem não reservou não tem assento');
select is((select count(*)::int from jsonb_array_elements(public.ride_shuttle_board(null,null)->'lines') l where l->>'id'=pg_temp.id('off')::text),0,
 'uma linha desabilitada não é anunciada');

-- Limites de 1 a 4 assentos e entradas inválidas.
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,%s,1500,%L)$$,pg_temp.id('d2'),n,pg_temp.id('k-bounds')),'P0001','invalid_input',
 'reserva de '||n||' assentos é recusada: o limite é de 1 a 4') from unnest(array[0,5,-1]) n;
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,null,1500,%L)$$,pg_temp.id('d2'),pg_temp.id('k-bounds')),'P0001','invalid_input','quantidade nula é recusada');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,null)$$,pg_temp.id('d2')),'P0001','invalid_input','reserva sem chave de operação é recusada');
select lives_ok(format($$insert into t206 select 'lim'||n,public.ride_book_shuttle_seat(case n when 1 then %L else %L end::uuid,n,1500,pg_temp.id('k-lim'||n))
 from unnest(array[1,4]) n$$,pg_temp.id('d3'),pg_temp.id('d2')),'os limites 1 e 4 são aceitos');
select throws_ok($$select public.ride_shuttle_board(repeat('a',121),null)$$,'P0001','invalid_input','rótulo de área acima do limite é recusado');
select tests.clear_authentication();
select throws_ok(format($$insert into private.ride_shuttle_seats(departure_id,passenger_id,operation_key,seats,seat_cents)
 values(%L,%L,gen_random_uuid(),5,1500)$$,pg_temp.id('d2'),tests.uid('client_b')),'P0001','ride_seat_unavailable','o livro também recusa mais de 4 assentos em uma escrita direta');
select ok(exists(select from pg_constraint where conrelid='private.ride_shuttle_seats'::regclass and contype='c'
   and pg_get_constraintdef(oid) ~ 'seats >= 1' and pg_get_constraintdef(oid) ~ 'seats <= 4'),'a tabela limita cada reserva a 1 a 4 assentos');
select throws_ok(format($$insert into private.ride_shuttle_seats(departure_id,passenger_id,operation_key,seats,seat_cents)
 values(%L,%L,gen_random_uuid(),0,1500)$$,pg_temp.id('d2'),tests.uid('client_b')),'23514',null,'a tabela também recusa reserva de zero assento');
select tests.authenticate_as('client_a');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d2'),pg_temp.id('k-cap')),'P0001','ride_seat_unavailable',
 'uma pessoa não acumula mais de 4 assentos na mesma partida');
select lives_ok(format($$select public.ride_cancel_shuttle_seat(pg_temp.seat('lim%s'),pg_temp.id('k-clim%s'))$$,n,n),'os assentos do teste de limites são devolvidos ('||n||')')
 from unnest(array[1,4]) n;

-- Preço divergente: nova cotação, sem assento registrado.
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,2,1400,%L)$$,pg_temp.id('d1'),pg_temp.id('k-price')),'P0001','requote_required',
 'preço por assento diferente do vigente exige nova cotação');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,2,3000,%L)$$,pg_temp.id('d1'),pg_temp.id('k-price')),'P0001','requote_required',
 'o valor informado é o de UM assento, não o total');
select tests.clear_authentication();
select is(pg_temp.taken('d1'),0,'a recusa por preço não ocupa assento');
select is((select count(*)::int from private.ride_shuttle_events where operation_key=pg_temp.id('k-price')),0,'a recusa por preço não deixa evento');

-- Partida encerrada, desconhecida, de linha desabilitada, e autorização que não cobre a viagem.
select tests.authenticate_as('client_a');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('gone'),pg_temp.id('k-gone')),'P0001','ride_seat_unavailable',
 'partida cujo horário passou não é vendida');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('nope'),pg_temp.id('k-gone')),'P0001','ride_seat_unavailable',
 'partida desconhecida não é vendida');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,900,%L)$$,pg_temp.id('off1'),pg_temp.id('k-gone')),'P0001','ride_seat_unavailable',
 'partida de linha desabilitada não é vendida');
select tests.clear_authentication();
update private.ride_market_modalities set valid_until=pg_temp.dep(2)+interval '10 minutes' where environment='simulation' and modality='shuttle_seat';
select tests.authenticate_as('client_a');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-exp')),'P0001','ride_modality_unavailable',
 'autorização que vence antes da chegada prevista recusa a reserva');
select is(public.ride_shuttle_board('Saúde','Vila Mariana')->'lines','[]'::jsonb,'e nenhuma partida além da validade é anunciada');
select tests.clear_authentication();
update private.ride_market_modalities set valid_until='infinity',open_from='12:00',open_until='14:00' where environment='simulation' and modality='shuttle_seat';
select tests.authenticate_as('client_a');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-exp')),'P0001','ride_modality_unavailable',
 'partida fora do horário autorizado da modalidade é recusada');
select tests.clear_authentication();
update private.ride_market_modalities set open_from=null,open_until=null where environment='simulation' and modality='shuttle_seat';
update private.ride_shuttle_lines set valid_until=pg_temp.dep(2)+interval '10 minutes' where id=pg_temp.id('line');
select tests.authenticate_as('client_a');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-exp')),'P0001','ride_seat_unavailable',
 'linha cuja evidência vence antes da chegada prevista não é vendida');
select tests.clear_authentication();
update private.ride_shuttle_lines set valid_until=now()+interval '60 days' where id=pg_temp.id('line');

-- C4.5 · Último assento: a partida d1 tem 3 lugares.
select tests.authenticate_as('client_a');
insert into t206 values('a1',public.ride_book_shuttle_seat(pg_temp.id('d1'),2,1500,pg_temp.id('k-a1')));
select is((select data-'id' from t206 where k='a1'),jsonb_build_object('state','confirmed','departure_id',pg_temp.id('d1'),'departs_at',pg_temp.dep(2),
 'seats',2,'seat_cents',1500,'total_cents',3000,'charged_cents',0),'a reserva responde assento confirmado, preço congelado e nada cobrado');
-- Repetição idempotente.
select is(public.ride_book_shuttle_seat(pg_temp.id('d1'),2,1500,pg_temp.id('k-a1')),(select data from t206 where k='a1'),
 'repetir a mesma chave com a mesma entrada devolve a resposta guardada');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-a1')),'P0001','idempotency_conflict',
 'a mesma chave com outra quantidade é conflito');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,2,1500,%L)$$,pg_temp.id('d2'),pg_temp.id('k-a1')),'P0001','idempotency_conflict',
 'a mesma chave para outra partida é conflito');
select tests.authenticate_as('client_b');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,2,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-b0')),'P0001','ride_seat_unavailable',
 'pedido de 2 assentos com 1 livre é recusado por inteiro');
insert into t206 values('b1',public.ride_book_shuttle_seat(pg_temp.id('d1'),1,1500,pg_temp.id('k-b1')));
select is((select data->>'state' from t206 where k='b1'),'confirmed','o último assento é reservado pela primeira pessoa');
-- A mesma chave de outra pessoa é outra operação: as chaves são únicas por pessoa.
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,2,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-a1')),'P0001','ride_seat_unavailable',
 'a chave de outra pessoa não devolve a reserva dela');
select tests.authenticate_as('provider_a');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-p1')),'P0001','ride_seat_unavailable',
 'C4.5: a segunda reserva do último assento é recusada');
select is((select (d->>'seats_left')::int from jsonb_array_elements(public.ride_shuttle_board('Saúde','Vila Mariana')->'lines'->0->'departures') d
   where d->>'id'=pg_temp.id('d1')::text),0,'o quadro mostra a partida lotada');
select tests.clear_authentication();
select is(pg_temp.taken('d1'),3,'a soma dos assentos confirmados é igual ao total, nunca maior');
select is((select count(*)::int from private.ride_shuttle_seats where departure_id=pg_temp.id('d1')),2,'as recusas e a repetição não criaram linhas de assento');
select is((select count(*)::int from private.ride_shuttle_events where departure_id=pg_temp.id('d1') and action='booked'),2,'cada reserva tem exatamente um evento');
select throws_ok(format($$insert into private.ride_shuttle_seats(departure_id,passenger_id,operation_key,seats,seat_cents)
 values(%L,%L,gen_random_uuid(),1,1500)$$,pg_temp.id('d1'),tests.uid('provider_b')),'P0001','ride_seat_unavailable',
 'o limite da partida vale para qualquer escrita no livro, não só para a RPC');
select throws_ok(format($$update private.ride_shuttle_departures set seats_total=2 where id=%L$$,pg_temp.id('d1')),'P0001','ride_seat_frozen',
 'a partida não encolhe abaixo dos assentos confirmados');
select throws_ok(format($$update private.ride_shuttle_departures set departs_at=departs_at+interval '1 hour' where id=%L$$,pg_temp.id('d1')),'P0001','ride_seat_frozen',
 'partida com assento vendido não muda de horário em silêncio');
select throws_ok(format($$update private.ride_shuttle_departures set state='cancelled' where id=%L$$,pg_temp.id('d1')),'P0001','ride_seat_frozen',
 'partida não é cancelada por fora enquanto houver assento confirmado');
select throws_ok(format($$update private.ride_shuttle_seats set seats=1 where id=%L$$,pg_temp.seat('a1')),'P0001','ride_seat_frozen','assento vendido não muda de quantidade');
select throws_ok(format($$update private.ride_shuttle_seats set seat_cents=1 where id=%L$$,pg_temp.seat('a1')),'P0001','ride_seat_frozen','assento vendido não muda de preço');

-- Privacidade: cada pessoa lê só os próprios assentos.
select tests.authenticate_as('client_a');
select is((select array_agg(s->>'id') from jsonb_array_elements(public.ride_shuttle_board(null,null)->'my_seats') s where s->>'state'='confirmed'),
 array[pg_temp.seat('a1')::text],'o quadro devolve o assento confirmado de quem consulta');
select tests.authenticate_as('client_b');
select is((select count(*)::int from jsonb_array_elements(public.ride_shuttle_board(null,null)->'my_seats') s where s->>'id'<>pg_temp.seat('b1')::text),0,
 'o quadro de uma pessoa não traz o assento de outra');
select ok(position(tests.uid('client_a')::text in public.ride_shuttle_board(null,null)::text)=0
  and position(pg_temp.seat('a1')::text in public.ride_shuttle_board(null,null)::text)=0,'o quadro não traz identificador de outro passageiro nem do assento dele');
select throws_ok(format($$select public.ride_cancel_shuttle_seat(%L,%L)$$,pg_temp.seat('a1'),pg_temp.id('k-steal1')),'P0001','not_allowed',
 'uma pessoa não cancela o assento de outra');
select throws_ok(format($$select public.ride_rebook_shuttle_seat(%L,%L,%L)$$,pg_temp.seat('a1'),pg_temp.id('d2'),pg_temp.id('k-steal2')),'P0001','not_allowed',
 'uma pessoa não remarca o assento de outra');
select throws_ok(format($$select public.ride_cancel_shuttle_seat(%L,%L)$$,pg_temp.id('nope'),pg_temp.id('k-steal3')),'P0001','not_allowed',
 'assento inexistente responde como assento alheio');
select throws_ok($$select * from private.ride_shuttle_seats$$,'42501',null,'passageiro não lê a tabela de assentos');
select throws_ok($$select * from private.ride_shuttle_events$$,'42501',null,'passageiro não lê os eventos de assentos');
select throws_ok($$select private.ride_shuttle_taken(gen_random_uuid())$$,'42501',null,'passageiro não executa auxiliar privado');
select throws_ok($$select public.admin_shuttle_departures()$$,'P0001','not_allowed','passageiro não lista as partidas da operação');
select throws_ok(format($$select public.admin_cancel_shuttle_departure(%L,'motivo de teste',%L)$$,pg_temp.id('dx'),pg_temp.id('k-steal4')),'P0001','not_allowed',
 'passageiro não cancela partida');
select tests.clear_authentication();
select is((select state from private.ride_shuttle_seats where id=pg_temp.seat('a1')),'confirmed','as tentativas de terceiros não mudaram o assento');
select is((select state from private.ride_shuttle_departures where id=pg_temp.id('dx')),'open','as tentativas de terceiros não mudaram a partida');

-- Cancelamento pelo passageiro: restituição auditável, com valor devido 0 porque nada foi cobrado.
select tests.authenticate_as('client_b');
insert into t206 values('cb1',public.ride_cancel_shuttle_seat(pg_temp.seat('b1'),pg_temp.id('k-cb1x')));
select is((select data from t206 where k='cb1'),jsonb_build_object('id',pg_temp.seat('b1'),'state','cancelled','seats',1,'refund_due_cents',0),
 'o cancelamento responde o estado e a restituição devida, que é 0');
select is(public.ride_cancel_shuttle_seat(pg_temp.seat('b1'),pg_temp.id('k-cb1x')),(select data from t206 where k='cb1'),
 'repetir o cancelamento com a mesma chave devolve a resposta guardada');
select throws_ok(format($$select public.ride_cancel_shuttle_seat(%L,%L)$$,pg_temp.seat('b1'),pg_temp.id('k-cb1y')),'P0001','ride_seat_unavailable',
 'assento já cancelado não é cancelado de novo com outra chave');
select throws_ok(format($$select public.ride_cancel_shuttle_seat(%L,%L)$$,pg_temp.seat('b1'),pg_temp.id('k-b1')),'P0001','idempotency_conflict',
 'a chave da reserva não serve para cancelar');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d2'),pg_temp.id('k-cb1x')),'P0001','idempotency_conflict',
 'a chave do cancelamento não serve para reservar');
select throws_ok(format($$select public.ride_rebook_shuttle_seat(%L,%L,%L)$$,pg_temp.seat('b1'),pg_temp.id('d2'),pg_temp.id('k-cb1z')),'P0001','ride_seat_unavailable',
 'assento cancelado não é remarcado');
select tests.clear_authentication();
select is(pg_temp.taken('d1'),2,'o assento cancelado volta a ficar livre');
select is((select count(*)::int from private.ride_shuttle_events where seat_id=pg_temp.seat('b1') and action='cancelled'),1,'o cancelamento e sua repetição deixam um único evento');
select throws_ok(format($$update private.ride_shuttle_seats set state='confirmed' where id=%L$$,pg_temp.seat('b1')),'P0001','ride_seat_frozen',
 'assento cancelado não volta a confirmado');
-- Devolver o assento continua possível com a modalidade fechada; reservar, não.
update private.ride_market_modalities set status='inventory' where environment='simulation' and modality='shuttle_seat';
select tests.authenticate_as('provider_a');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d1'),pg_temp.id('k-p2')),'P0001','ride_modality_unavailable',
 'sem autorização vigente da modalidade o assento livre não é vendido');
select tests.clear_authentication();
insert into private.ride_shuttle_seats(id,departure_id,passenger_id,operation_key,seats,seat_cents)
 values(pg_temp.id('s-closed'),pg_temp.id('d2'),tests.uid('provider_a'),pg_temp.id('k-closed'),1,1500);
select tests.authenticate_as('provider_a');
select is(public.ride_cancel_shuttle_seat(pg_temp.id('s-closed'),pg_temp.id('k-closed-c'))->>'state','cancelled',
 'com a modalidade fechada o passageiro ainda devolve o assento');
select throws_ok(format($$select public.ride_rebook_shuttle_seat(%L,%L,%L)$$,pg_temp.id('s-closed'),pg_temp.id('d3'),pg_temp.id('k-closed-r')),'P0001','ride_seat_unavailable',
 'assento devolvido não é remarcado');
select tests.clear_authentication();
update private.ride_market_modalities set status='pilot' where environment='simulation' and modality='shuttle_seat';

-- Remarcação pelo passageiro: trava as duas partidas em ordem de id e mantém o preço.
update private.ride_shuttle_lines set seat_cents=1700 where id=pg_temp.id('line');
select is(private.ride_shuttle_lock_departures(greatest(pg_temp.id('d1'),pg_temp.id('d3')),least(pg_temp.id('d1'),pg_temp.id('d3'))),
 array[least(pg_temp.id('d1'),pg_temp.id('d3')),greatest(pg_temp.id('d1'),pg_temp.id('d3'))],'as partidas são travadas em ordem crescente de id (maior informado primeiro)');
select is(private.ride_shuttle_lock_departures(least(pg_temp.id('d1'),pg_temp.id('d3')),greatest(pg_temp.id('d1'),pg_temp.id('d3'))),
 array[least(pg_temp.id('d1'),pg_temp.id('d3')),greatest(pg_temp.id('d1'),pg_temp.id('d3'))],'e na mesma ordem quando o menor é informado primeiro');
select ok((select position('ride_shuttle_lock_departures(s.departure_id,p_departure)' in prosrc)>0
   and position('ride_shuttle_lock_departures(s.departure_id,p_departure)' in prosrc)<position('for update' in prosrc)
   and position('ride_shuttle_lock_departures(s.departure_id,p_departure)' in prosrc)<position('update private.ride_shuttle_seats' in prosrc)
   and position('ride_shuttle_lock_departures(s.departure_id,p_departure)' in prosrc)<position('insert into private.ride_shuttle_seats' in prosrc)
  from pg_proc where oid='public.ride_rebook_shuttle_seat(uuid,uuid,uuid)'::regprocedure),
 'a remarcação trava as duas partidas pelo auxiliar ordenado antes de travar ou escrever qualquer assento');
select tests.authenticate_as('client_a');
select throws_ok(format($$select public.ride_rebook_shuttle_seat(%L,%L,%L)$$,pg_temp.seat('a1'),pg_temp.id('d1'),pg_temp.id('k-ra0')),'P0001','invalid_input',
 'remarcar para a mesma partida é entrada inválida');
select throws_ok(format($$select public.ride_rebook_shuttle_seat(%L,%L,%L)$$,pg_temp.seat('a1'),pg_temp.id('o1'),pg_temp.id('k-ra0')),'P0001','ride_seat_unavailable',
 'remarcar para partida de outra linha é recusado');
select throws_ok(format($$select public.ride_rebook_shuttle_seat(%L,%L,%L)$$,pg_temp.seat('a1'),pg_temp.id('gone'),pg_temp.id('k-ra0')),'P0001','ride_seat_unavailable',
 'remarcar para partida que já saiu é recusado');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d3'),pg_temp.id('k-newprice')),'P0001','requote_required',
 'depois da mudança de preço, reserva nova com o preço antigo exige nova cotação');
insert into t206 values('ra',public.ride_rebook_shuttle_seat(pg_temp.seat('a1'),pg_temp.id('d3'),pg_temp.id('k-ra')));
select is((select data-'id' from t206 where k='ra'),jsonb_build_object('state','confirmed','replaces',pg_temp.seat('a1'),'departure_id',pg_temp.id('d3'),
 'departs_at',pg_temp.dep(4),'seats',2,'seat_cents',1500,'total_cents',3000,'charged_cents',0),
 'a remarcação mantém quantidade e preço do assento (R$ 15,00), mesmo com a linha agora a R$ 17,00');
select is(public.ride_rebook_shuttle_seat(pg_temp.seat('a1'),pg_temp.id('d3'),pg_temp.id('k-ra')),(select data from t206 where k='ra'),
 'repetir a remarcação com a mesma chave devolve a resposta guardada');
select throws_ok(format($$select public.ride_rebook_shuttle_seat(%L,%L,%L)$$,pg_temp.seat('a1'),pg_temp.id('d2'),pg_temp.id('k-ra')),'P0001','idempotency_conflict',
 'a mesma chave para outra partida é conflito');
select throws_ok(format($$select public.ride_rebook_shuttle_seat(%L,%L,%L)$$,pg_temp.seat('a1'),pg_temp.id('d2'),pg_temp.id('k-ra2')),'P0001','ride_seat_unavailable',
 'assento já remarcado não é remarcado de novo');
select tests.clear_authentication();
select is((select array[state,(closed_at is not null)::text] from private.ride_shuttle_seats where id=pg_temp.seat('a1')),array['rebooked','true'],
 'o assento antigo fica como remarcado e encerrado');
select is((select array[seats::int,seat_cents] from private.ride_shuttle_seats where id=pg_temp.seat('ra') and replaces=pg_temp.seat('a1') and state='confirmed'),
 array[2,1500],'o assento novo aponta o que substitui e guarda o preço original');
select is(array[pg_temp.taken('d1'),pg_temp.taken('d3')],array[0,2],'os lugares saem da partida antiga e entram na nova');
select is((select array_agg(action order by id) from private.ride_shuttle_events where operation_key=pg_temp.id('k-ra')),array['rebooked_from','rebooked_to'],
 'a remarcação e sua repetição deixam um par de eventos sob a mesma chave');
-- A trava é observada em duas partidas que esta transação ainda não travou: o assento de origem
-- entra sem gatilhos (que travariam a partida), e depois da remarcação as duas linhas têm trava.
insert into private.ride_shuttle_departures(id,line_id,departs_at,seats_total)
 values(pg_temp.id('r1'),pg_temp.id('line'),pg_temp.dep(7),12),(pg_temp.id('r2'),pg_temp.id('line'),pg_temp.dep(8),12);
set local session_replication_role=replica;
insert into private.ride_shuttle_seats(id,departure_id,passenger_id,operation_key,seats,seat_cents)
 values(pg_temp.id('s-lock'),pg_temp.id('r1'),tests.uid('provider_b'),pg_temp.id('k-lock'),1,1500);
set local session_replication_role=origin;
select is(pg_temp.locks('r1','r2'),'{}'::text[],'antes da remarcação nenhuma das duas partidas está travada');
select tests.authenticate_as('provider_b');
select is(public.ride_rebook_shuttle_seat(pg_temp.id('s-lock'),pg_temp.id('r2'),pg_temp.id('k-lock-r'))->>'state','confirmed','a remarcação entre as duas partidas é aceita');
select tests.clear_authentication();
select is(pg_temp.locks('r1','r2'),array['For Update','For Update'],'a remarcação travou para escrita a partida de origem e a de destino');
-- Remarcação para partida sem lugar: nada muda.
insert into private.ride_shuttle_departures(id,line_id,departs_at,seats_total) values(pg_temp.id('tiny'),pg_temp.id('line'),pg_temp.dep(6),1);
select tests.authenticate_as('client_a');
select throws_ok(format($$select public.ride_rebook_shuttle_seat(%L,%L,%L)$$,pg_temp.seat('ra'),pg_temp.id('tiny'),pg_temp.id('k-ra3')),'P0001','ride_seat_unavailable',
 'remarcar 2 assentos para partida com 1 lugar é recusado');
select tests.clear_authentication();
select is((select state from private.ride_shuttle_seats where id=pg_temp.seat('ra')),'confirmed','a remarcação recusada deixa o assento como estava');
select is((select count(*)::int from private.ride_shuttle_events where operation_key=pg_temp.id('k-ra3')),0,'a remarcação recusada não deixa evento');

-- Motorista designado e lista de embarque: só contagens.
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by)
 values(tests.uid('provider_c'),'simulation','van','approved',(now() at time zone 'America/Sao_Paulo')::date+60,tests.uid('admin')),
 (tests.uid('provider_d'),'simulation','sedan','approved',(now() at time zone 'America/Sao_Paulo')::date+60,tests.uid('admin'));
insert into private.ride_vehicle_capacity(driver_id,vehicle,document_ref,seats,valid_until)
 values(tests.uid('provider_c'),'van','TEST-206c2',12,now()+interval '30 days'),(tests.uid('provider_d'),'sedan','TEST-206c2',4,now()+interval '30 days');
select throws_ok(format($$update private.ride_shuttle_departures set driver_id=%L where id=%L$$,tests.uid('provider_d'),pg_temp.id('d3')),'P0001','driver_ineligible',
 'veículo com 4 lugares conferidos não é designado para partida de 12 assentos');
select throws_ok(format($$update private.ride_shuttle_departures set driver_id=%L where id=%L$$,tests.uid('provider_e'),pg_temp.id('d3')),'P0001','driver_ineligible',
 'quem não é motorista cadastrado não é designado');
select lives_ok(format($$update private.ride_shuttle_departures set driver_id=%L where id in (%L,%L)$$,tests.uid('provider_c'),pg_temp.id('d3'),pg_temp.id('dx')),
 'motorista aprovado com capacidade conferida é designado');
select tests.authenticate_as('client_b');
insert into t206 values('b3',public.ride_book_shuttle_seat(pg_temp.id('d3'),1,1700,pg_temp.id('k-b3')));
select tests.authenticate_as('provider_c');
insert into t206 values('manifest',public.driver_shuttle_manifest(pg_temp.id('d3')));
select is((select data from t206 where k='manifest'),jsonb_build_object('departure_id',pg_temp.id('d3'),'origin_area','Saúde','destination_area','Vila Mariana',
 'departs_at',pg_temp.dep(4),'state','open','seats_total',12,'seats_confirmed',3,'bookings',2),
 'a lista de embarque do motorista traz somente contagens da partida');
select ok((select position(tests.uid('client_a')::text in data::text)=0 and position(tests.uid('client_b')::text in data::text)=0
   and position(pg_temp.seat('ra')::text in data::text)=0 and position(pg_temp.seat('b3')::text in data::text)=0 from t206 where k='manifest'),
 'a lista de embarque não traz passageiro nem identificador de reserva');
select throws_ok(format($$select public.driver_shuttle_manifest(%L)$$,pg_temp.id('d2')),'P0001','not_allowed','o motorista não lê partida que não é dele');
select throws_ok($$select private.ride_driver_departure_tasks(auth.uid())$$,'42501',null,
 'o motorista não executa o auxiliar privado de tarefas');
select tests.authenticate_as('provider_d');
select throws_ok(format($$select public.driver_shuttle_manifest(%L)$$,pg_temp.id('d3')),'P0001','not_allowed','outro motorista não lê a lista de embarque');
select tests.authenticate_as('client_a');
select throws_ok(format($$select public.driver_shuttle_manifest(%L)$$,pg_temp.id('d3')),'P0001','not_allowed','passageiro não lê a lista de embarque');
select tests.clear_authentication();
select is(private.ride_driver_departure_tasks(tests.uid('provider_c')),jsonb_build_array(
  jsonb_build_object('id',pg_temp.id('d3'),'origin_area','Saúde','destination_area','Vila Mariana','departs_at',pg_temp.dep(4)),
  jsonb_build_object('id',pg_temp.id('dx'),'origin_area','Saúde','destination_area','Vila Mariana','departs_at',pg_temp.dep(5))),
 'as tarefas do motorista listam as próprias partidas abertas, sem passageiros');
select is(private.ride_driver_departure_tasks(tests.uid('provider_d')),'[]'::jsonb,'motorista sem partida designada não tem tarefa');
create function pg_temp.mode_tasks() returns jsonb language plpgsql as $$
declare v jsonb;
begin
 if to_regprocedure('public.driver_mode_tasks()') is null then return null; end if;
 execute 'select public.driver_mode_tasks()->''departures''' into v;
 return v;
end $$;
grant execute on function pg_temp.mode_tasks() to authenticated;
select tests.authenticate_as('provider_c');
select ok(coalesce(jsonb_array_length(pg_temp.mode_tasks())=2,true),'quando a caixa de tarefas do motorista existe, ela inclui as duas partidas');
select tests.clear_authentication();

-- C4.6 e C4.8 · Ausência do motorista: a operação cancela a partida dx (6 lugares).
select tests.authenticate_as('client_a');
insert into t206 values('ax',public.ride_book_shuttle_seat(pg_temp.id('dx'),2,1700,pg_temp.id('k-ax')));
select tests.authenticate_as('client_b');
insert into t206 values('bx',public.ride_book_shuttle_seat(pg_temp.id('dx'),1,1700,pg_temp.id('k-bx')));
select tests.authenticate_as('provider_a');
insert into t206 values('px',public.ride_book_shuttle_seat(pg_temp.id('dx'),1,1700,pg_temp.id('k-px')));
select lives_ok($$select public.ride_cancel_shuttle_seat(pg_temp.seat('px'),pg_temp.id('k-pxc'))$$,'um terceiro passageiro reserva e devolve antes do cancelamento');
select tests.clear_authentication();
-- client_a pediu avisos externos e o canal está liberado no ensaio; client_b não pediu.
update private.ride_passenger_contact set external_enabled=true where environment='simulation';
insert into private.ride_notice_preferences(owner_id,forward_updates) values(tests.uid('client_a'),true);
create temp table n206 as select
 (select count(*) from public.notifications where template='atualizacao_corrida' and user_id=tests.uid('client_a'))::int as a,
 (select count(*) from public.notifications where template='atualizacao_corrida' and user_id=tests.uid('client_b'))::int as b,
 (select count(*) from public.audit_log where action='ride.shuttle_departure_cancelled')::int as audits;
select tests.authenticate_as('admin');
select throws_ok(format($$select public.admin_cancel_shuttle_departure(%L,'abc',%L)$$,pg_temp.id('dx'),pg_temp.id('k-adm')),'P0001','invalid_input',
 'o cancelamento exige um motivo de 4 a 200 caracteres');
select throws_ok(format($$select public.admin_cancel_shuttle_departure(%L,null,%L)$$,pg_temp.id('dx'),pg_temp.id('k-adm')),'P0001','invalid_input','motivo nulo é recusado');
select throws_ok(format($$select public.admin_cancel_shuttle_departure(%L,'Motorista ausente',null)$$,pg_temp.id('dx')),'P0001','invalid_input','cancelamento sem chave é recusado');
select throws_ok(format($$select public.admin_cancel_shuttle_departure(%L,'Motorista ausente',%L)$$,pg_temp.id('nope'),pg_temp.id('k-adm')),'P0001','not_allowed',
 'partida desconhecida não é cancelada');
insert into t206 values('list0',public.admin_shuttle_departures());
select is((select d-'departs_at' from t206,jsonb_array_elements(data->'departures') d where k='list0' and d->>'id'=pg_temp.id('dx')::text),
 jsonb_build_object('id',pg_temp.id('dx'),'origin_area','Saúde','destination_area','Vila Mariana','seats_total',6,'seats_confirmed',3,'state','open','driver_assigned',true),
 'a operação vê a partida com contagem de assentos e se há motorista designado');
select ok((select position(tests.uid('client_a')::text in data::text)=0 and position(tests.uid('provider_c')::text in data::text)=0 from t206 where k='list0'),
 'a lista da operação não traz identificador de passageiro nem de motorista');
insert into t206 values('adm',public.admin_cancel_shuttle_departure(pg_temp.id('dx'),'  Motorista ausente  ',pg_temp.id('k-adm')));
select is((select data from t206 where k='adm'),jsonb_build_object('departure_id',pg_temp.id('dx'),'state','cancelled','released_seats',3,'bookings',2,'refund_due_cents',0),
 'C4.6: o cancelamento da partida libera os 3 assentos confirmados de 2 reservas, com restituição devida 0');
select is(public.admin_cancel_shuttle_departure(pg_temp.id('dx'),'Motorista ausente',pg_temp.id('k-adm')),(select data from t206 where k='adm'),
 'repetir o cancelamento da partida com a mesma chave devolve a resposta guardada');
select throws_ok(format($$select public.admin_cancel_shuttle_departure(%L,'Outro motivo',%L)$$,pg_temp.id('dx'),pg_temp.id('k-adm')),'P0001','idempotency_conflict',
 'a mesma chave com outro motivo é conflito');
select throws_ok(format($$select public.admin_cancel_shuttle_departure(%L,'Motorista ausente',%L)$$,pg_temp.id('dx'),pg_temp.id('k-adm2')),'P0001','ride_seat_unavailable',
 'partida já cancelada não é cancelada de novo com outra chave');
select is((select d->>'state' from jsonb_array_elements(public.admin_shuttle_departures()->'departures') d where d->>'id'=pg_temp.id('dx')::text),'cancelled',
 'a lista da operação mostra a partida cancelada');
select tests.clear_authentication();
select is((select array_agg(state order by seats) from private.ride_shuttle_seats where id in (pg_temp.seat('ax'),pg_temp.seat('bx'))),array['released','released'],
 'os assentos confirmados ficam liberados');
select is((select state from private.ride_shuttle_seats where id=pg_temp.seat('px')),'cancelled','o assento já devolvido pelo passageiro não é tocado');
select is((select array[state,(closed_at is not null)::text] from private.ride_shuttle_departures where id=pg_temp.id('dx')),array['cancelled','true'],'a partida fica cancelada e encerrada');
select is((select count(*)::int from private.ride_shuttle_events where operation_key=pg_temp.id('k-adm') and action='released' and actor_id=tests.uid('admin')
   and actor_role='admin' and refund_due_cents=0 and data->>'notice'='shuttle_departure_cancelled'),2,'cada assento liberado tem um evento com o aviso e a restituição devida 0');
select is((select count(*)::int from private.ride_shuttle_events where operation_key=pg_temp.id('k-adm') and action='departure_cancelled'
   and departure_id=pg_temp.id('dx') and seats=3 and data->'input'->>'reason'='Motorista ausente' and (data->>'driver_assigned')::boolean),1,
 'o cancelamento e sua repetição deixam um único evento da partida, com o motivo');
select is((select count(*)::int from public.audit_log where action='ride.shuttle_departure_cancelled' and entity_id=pg_temp.id('dx')::text
   and actor_id=tests.uid('admin') and data->>'reason'='Motorista ausente')-(select audits from n206),1,'o cancelamento é registrado uma vez na trilha de auditoria');
-- Avisos: o do aplicativo é o próprio assento liberado; o externo segue a escolha da pessoa.
select is((select count(*)::int from public.notifications where template='atualizacao_corrida' and user_id=tests.uid('client_a'))-(select a from n206),1,
 'quem pediu avisos externos recebe um aviso do cancelamento, sem repetição');
select is((select count(*)::int from public.notifications where template='atualizacao_corrida' and user_id=tests.uid('client_b'))-(select b from n206),0,
 'quem não pediu avisos externos não recebe mensagem');
select is((select array_agg((data->>'forwarded')::boolean order by seats) from private.ride_shuttle_events where operation_key=pg_temp.id('k-adm') and action='released'),
 array[false,true],'o evento registra se o aviso foi encaminhado');
select tests.authenticate_as('client_b');
select is((select s-'booked_at'-'closed_at' from jsonb_array_elements(public.ride_shuttle_board(null,null)->'my_seats') s where s->>'id'=pg_temp.seat('bx')::text),
 jsonb_build_object('id',pg_temp.seat('bx'),'line_id',pg_temp.id('line'),'departure_id',pg_temp.id('dx'),'origin_area','Saúde','destination_area','Vila Mariana',
  'departs_at',pg_temp.dep(5),'seats',1,'seat_cents',1700,'state','released','replaces',null,'refund_due_cents',0,'notice','shuttle_departure_cancelled'),
 'o passageiro vê no próprio quadro o assento liberado, o aviso do cancelamento e que nada é devido');
select is((select count(*)::int from jsonb_array_elements(public.ride_shuttle_board('Saúde','Vila Mariana')->'lines'->0->'departures') d where d->>'id'=pg_temp.id('dx')::text),0,
 'a partida cancelada deixa de ser anunciada');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1700,%L)$$,pg_temp.id('dx'),pg_temp.id('k-bx2')),'P0001','ride_seat_unavailable',
 'partida cancelada não vende assento');
select throws_ok(format($$select public.ride_cancel_shuttle_seat(%L,%L)$$,pg_temp.seat('bx'),pg_temp.id('k-bx3')),'P0001','ride_seat_unavailable',
 'assento liberado pela operação não precisa nem pode ser cancelado pelo passageiro');
-- A linha volta a R$ 15,00: a remarcação do assento liberado mantém os R$ 17,00 pelos quais foi vendido.
select tests.clear_authentication();
update private.ride_shuttle_lines set seat_cents=1500 where id=pg_temp.id('line');
select tests.authenticate_as('client_b');
insert into t206 values('rbx',public.ride_rebook_shuttle_seat(pg_temp.seat('bx'),pg_temp.id('d2'),pg_temp.id('k-rbx')));
select is((select data-'id' from t206 where k='rbx'),jsonb_build_object('state','confirmed','replaces',pg_temp.seat('bx'),'departure_id',pg_temp.id('d2'),
 'departs_at',pg_temp.dep(3),'seats',1,'seat_cents',1700,'total_cents',1700,'charged_cents',0),
 'C4.6: a remarcação move o assento liberado para outra partida pelo mesmo preço');
select is(public.ride_rebook_shuttle_seat(pg_temp.seat('bx'),pg_temp.id('d2'),pg_temp.id('k-rbx')),(select data from t206 where k='rbx'),
 'repetir a remarcação do assento liberado devolve a resposta guardada');
select throws_ok(format($$select public.ride_rebook_shuttle_seat(%L,%L,%L)$$,pg_temp.seat('bx'),pg_temp.id('d3'),pg_temp.id('k-rbx2')),'P0001','ride_seat_unavailable',
 'o assento liberado é remarcado uma única vez');
select tests.clear_authentication();
select is((select state from private.ride_shuttle_seats where id=pg_temp.seat('bx')),'rebooked','o assento liberado fica marcado como remarcado');
select is((select data->>'from_state' from private.ride_shuttle_events where operation_key=pg_temp.id('k-rbx') and action='rebooked_from'),'released',
 'o evento registra que a remarcação partiu de um assento liberado');
select is((select state from private.ride_shuttle_seats where id=pg_temp.seat('ax')),'released','quem não remarcou continua com o assento liberado, sem cobrança');
select throws_ok(format($$update private.ride_shuttle_departures set state='open' where id=%L$$,pg_temp.id('dx')),'P0001','ride_seat_frozen','partida cancelada não reabre');

-- C4.8 · Todo desfecho tem autor, instante e chave de operação; nada foi cobrado nem é devido.
select is((select count(*)::int from private.ride_shuttle_events where actor_id is null or at is null or operation_key is null),0,
 'todo evento de assento tem autor, instante e chave de operação');
select is((select count(*)::int from private.ride_shuttle_seats s where not exists(select from private.ride_shuttle_events e where e.seat_id=s.id
   and e.operation_key=s.operation_key and e.actor_id=s.passenger_id and e.action in ('booked','rebooked_to')) and s.id not in (pg_temp.id('s-closed'),pg_temp.id('s-lock'))),0,
 'toda reserva feita pelas RPCs tem o evento de criação com a chave e o passageiro');
select is((select count(*)::int from private.ride_shuttle_seats s where s.state<>'confirmed' and not exists(select from private.ride_shuttle_events e
   where e.seat_id=s.id and e.at>=s.created_at and e.action=case s.state when 'cancelled' then 'cancelled' when 'released' then 'released' else 'rebooked_from' end)),0,
 'todo assento cancelado, liberado ou remarcado tem o evento do desfecho');
select is((select count(*)::int from private.ride_shuttle_events e join private.ride_shuttle_seats s on s.id=e.seat_id
   where e.actor_role='passenger' and e.actor_id<>s.passenger_id),0,'evento de passageiro é sempre do dono do assento');
select is((select coalesce(sum(refund_due_cents),0)::int from private.ride_shuttle_events),0,'a restituição devida registrada é 0 em todos os eventos');
select throws_ok(format($$insert into private.ride_shuttle_events(operation_key,action,departure_id,actor_id,actor_role,seats,refund_due_cents)
 values(gen_random_uuid(),'cancelled',%L,%L,'passenger',1,1500)$$,pg_temp.id('d2'),tests.uid('client_a')),'23514',null,
 'nesta etapa o livro não aceita registrar valor a restituir, pois nada é cobrado');
select is((select count(*)::int from private.ride_shuttle_departures d where
   (select coalesce(sum(s.seats),0) from private.ride_shuttle_seats s where s.departure_id=d.id and s.state='confirmed')>d.seats_total),0,
 'em nenhuma partida os assentos confirmados passam do total');
select is(array[(select count(*)::int from private.ride_payment_orders),(select count(*)::int from private.ride_financial_events)],
 (select array[orders,postings] from m206),'nenhuma ordem de pagamento nem lançamento financeiro foi criado por assento');

-- Cadastro de motorista que deixa de valer: a operação vê a partida sem motorista e a lista de embarque fecha.
update public.ride_drivers set status='rejected' where id=tests.uid('provider_c');
select tests.authenticate_as('admin');
select is((select (d->>'driver_assigned')::boolean from jsonb_array_elements(public.admin_shuttle_departures()->'departures') d where d->>'id'=pg_temp.id('d3')::text),false,
 'com o cadastro do motorista sem validade a operação vê a partida sem motorista designado');
select tests.authenticate_as('provider_c');
select throws_ok(format($$select public.driver_shuttle_manifest(%L)$$,pg_temp.id('d3')),'P0001','not_allowed','motorista sem cadastro aprovado não lê a lista de embarque');
select tests.clear_authentication();
select is(private.ride_driver_departure_tasks(tests.uid('provider_c')),'[]'::jsonb,'motorista sem cadastro aprovado não tem tarefa de partida');

-- Conta encerrada (negativo).
update public.profiles set deleted_at=now() where id=tests.uid('provider_e');
select tests.authenticate_as('provider_e');
select throws_ok($$select public.ride_shuttle_board(null,null)$$,'P0001','not_allowed','conta encerrada não consulta linhas');
select throws_ok(format($$select public.ride_book_shuttle_seat(%L,1,1500,%L)$$,pg_temp.id('d2'),pg_temp.id('k-closed-acc')),'P0001','not_allowed','conta encerrada não reserva assento');
select throws_ok(format($$select public.ride_cancel_shuttle_seat(%L,%L)$$,pg_temp.seat('ra'),pg_temp.id('k-closed-acc')),'P0001','not_allowed','conta encerrada não cancela assento');
select throws_ok(format($$select public.driver_shuttle_manifest(%L)$$,pg_temp.id('d3')),'P0001','not_allowed','conta encerrada não lê lista de embarque');
select tests.clear_authentication();

select * from finish();
rollback;
