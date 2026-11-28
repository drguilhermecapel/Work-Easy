-- PAR-501 e PAR-503 (O17 etapa 5): corrida pedida para outro adulto e acompanhante de confiança,
-- sobre os mandatos de 20261127110501 e as rotinas de 20261127110502. Dados fictícios, sem rede.
begin;
select no_plan();
select tests.setup_fixture();
select tests.create_user('reviewer_205');
insert into public.admins(user_id) values(tests.uid('reviewer_205'));
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
update private.ride_dispatch_rules set wave_size=1 where environment='simulation';
create temp table t(k text primary key,v text not null);
grant select,insert on t to authenticated,anon;
create function pg_temp.g(p text) returns text language sql stable as $$select t.v from t where t.k=p$$;
create function pg_temp.u(p text) returns uuid language sql stable as $$select t.v::uuid from t where t.k=p$$;
create function pg_temp.n(p text) returns int language sql stable as $$select t.v::int from t where t.k=p$$;
create function pg_temp.trip() returns jsonb language sql immutable as $$select '[{"origin":"Saúde","destination":"Jabaquara","payer":"passenger"}]'::jsonb$$;
create function pg_temp.point(p_lat numeric,p_lng numeric,p_label text) returns jsonb language sql immutable as $$
 select jsonb_build_object('lat',p_lat,'lng',p_lng,'label',p_label)$$;
create function pg_temp.dash_leg(p uuid) returns jsonb language sql as $$
 select l from jsonb_array_elements(public.ride_dashboard()->'rides') r cross join lateral jsonb_array_elements(r->'legs') l where l->>'id'=p::text$$;
create function pg_temp.sent(p uuid) returns jsonb language sql as $$
 select i from jsonb_array_elements(public.ride_my_rider_invites()) i where i->>'id'=p::text$$;
create function pg_temp.link(p_owner uuid,p_companion uuid) returns jsonb language sql as $$
 select c from jsonb_array_elements(public.ride_my_companions()->'companions') c where c->>'owner_id'=p_owner::text and c->>'companion_id'=p_companion::text$$;
grant execute on function pg_temp.g(text),pg_temp.u(text),pg_temp.n(text),pg_temp.trip(),pg_temp.point(numeric,numeric,text),
 pg_temp.dash_leg(uuid),pg_temp.sent(uuid),pg_temp.link(uuid,uuid) to authenticated,anon;
-- Lido só pela sessão do teste (sem papel de API): os avisos que uma pessoa tem de um trecho.
create function pg_temp.events(p_owner uuid,p_leg uuid) returns text[] language sql as $$
 select coalesce(array_agg(event order by event),'{}') from private.ride_passenger_notices where owner_id=p_owner and leg_id=p_leg$$;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_c'),'simulation','sedan','approved',private.sp_date(now())+30,tests.uid('admin'),true);
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity,card_brands,acquirer_profile_ref)
 select 'simulation','Saúde','Jabaquara',m,'ensaio 205',tstzrange(now()-interval '1 day',now()+interval '1 day'),
  case when m='card' then array['VISA'] else '{}'::text[] end,case when m='card' then 'conta hospedada TESTE' end from unnest(array['card','pix','benefit']) m;
insert into private.ride_pilot(id,period,approved_ref,budget_cents) values(md5('205-pilot')::uuid,tstzrange(now()-interval '1 hour',now()+interval '1 day'),'TEST-205',10000);
insert into private.ride_coverage(id,pilot,period,lead_id,backup_id)
 values(md5('205-roster')::uuid,md5('205-pilot')::uuid,tstzrange(now()-interval '1 hour',now()+interval '1 day'),tests.uid('admin'),tests.uid('reviewer_205'));
insert into private.ride_support_channels values(md5('205-roster')::uuid,'email','plantao@example.test','Equipe fictícia','TEST-205');

-- PAR-501 · quem pede cota para si e transforma a cotação em convite de uso único.
select tests.authenticate_as('client_a');
insert into t values('k0',gen_random_uuid()::text),('ik1',gen_random_uuid()::text);
insert into t select 'q0',public.ride_quote(pg_temp.u('k0'),null,null,pg_temp.trip())->>'id';
insert into t select 'x',public.ride_quote(pg_temp.u('k0'),null,null,pg_temp.trip())->>'total_cents';
select ok(pg_temp.n('x')>0,'a cotação de quem pede tem preço');
select throws_ok($$select public.ride_invite_rider(pg_temp.u('q0'),'client_b@test.local',7,null,gen_random_uuid())$$,'P0001','invalid_input','validade fora da lista é recusada');
select throws_ok($$select public.ride_invite_rider(pg_temp.u('q0'),'sem-arroba',30,null,gen_random_uuid())$$,'P0001','invalid_input','e-mail inválido é recusado');
select throws_ok($$select public.ride_invite_rider(pg_temp.u('q0'),'client_a@test.local',30,null,gen_random_uuid())$$,'P0001','invalid_input','ninguém convida a si mesmo');
select throws_ok($$select public.ride_invite_rider(pg_temp.u('q0'),'client_b@test.local',30,repeat('a',281),gen_random_uuid())$$,'P0001','invalid_input','instruções acima de 280 caracteres são recusadas');
select throws_ok($$select public.ride_invite_rider(gen_random_uuid(),'client_b@test.local',30,null,gen_random_uuid())$$,'P0001','not_allowed','cotação inexistente não vira convite');
insert into t select 'tok1',public.ride_invite_rider(pg_temp.u('q0'),'Client_B@test.local',30,'  Leve um documento. Portão azul.  ',pg_temp.u('ik1'))->>'token';
select ok(pg_temp.g('tok1') ~ '^[a-f0-9]{64}$','o convite devolve o código uma única vez');
select is(public.ride_invite_rider(pg_temp.u('q0'),'Client_B@test.local',30,'Leve um documento. Portão azul.',pg_temp.u('ik1'))->>'token',null,'repetir o convite não devolve o código de novo');
select is((public.ride_invite_rider(pg_temp.u('q0'),'client_b@test.local',30,'Leve um documento. Portão azul.',pg_temp.u('ik1'))->>'id')::uuid,pg_temp.u('ik1'),'a repetição devolve o mesmo convite');
select throws_ok($$select public.ride_invite_rider(pg_temp.u('q0'),'provider_b@test.local',30,'Leve um documento. Portão azul.',pg_temp.u('ik1'))$$,'P0001','idempotency_conflict','mesma chave para outro destinatário é conflito');
select throws_ok($$select public.ride_invite_rider(pg_temp.u('q0'),'client_b@test.local',30,null,gen_random_uuid())$$,'P0001','quote_unavailable','a mesma cotação não vira dois convites');
select throws_ok($$select public.ride_consent(pg_temp.u('q0'),true)$$,'P0001','quote_unavailable','a cotação de quem pede deixa de valer para ele mesmo');
select is(pg_temp.sent(pg_temp.u('ik1'))->>'status','pending','quem pede vê o convite aguardando resposta');
select is((pg_temp.sent(pg_temp.u('ik1'))->>'ceiling_cents')::int,pg_temp.n('x'),'o teto do convite é o preço cotado');
select is(public.ride_rider_invite(pg_temp.g('tok1')),null::jsonb,'quem pede não lê o convite como destinatário');
insert into t select 'q_other',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
select tests.clear_authentication();
select is((select status from private.ride_quotes where id=pg_temp.u('q0')),'superseded','a cotação original é substituída pelo convite');
select is((select token_hash from private.ride_rider_invites where id=pg_temp.u('ik1')),sha256(convert_to(pg_temp.g('tok1'),'UTF8')),'só o resumo do código é guardado');
select is((select instructions from private.ride_rider_invites where id=pg_temp.u('ik1')),'Leve um documento. Portão azul.','as instruções ficam aparadas');
select is((select count(*) from information_schema.columns where table_schema='private'
  and table_name in ('ride_rider_invites','ride_companions','ride_companion_invites') and column_name ~ 'mail'),0::bigint,'convites e vínculos não guardam e-mail');
select is((select count(*) from private.ride_companion_terms where environment='live'),0::bigint,'produção não recebe teto de acompanhante');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_invite_rider(pg_temp.u('q_other'),'client_b@test.local',30,null,gen_random_uuid())$$,'P0001','not_allowed','ninguém converte a cotação de outra pessoa');
select is(public.ride_revoke_rider_invite(pg_temp.u('ik1')),false,'outra pessoa não revoga o convite');
select is(jsonb_array_length(public.ride_my_rider_invites()),0,'outra pessoa não vê os convites enviados');

-- B3.4 · Enviado à pessoa errada: quem não é o destinatário confirmado não lê nem responde.
select is(public.ride_rider_invite(pg_temp.g('tok1')),null::jsonb,'destinatário errado não lê o convite');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok1'),true,gen_random_uuid())$$,'P0001','ride_invite_unavailable','destinatário errado não aceita o convite');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok1'),false,gen_random_uuid())$$,'P0001','ride_invite_unavailable','destinatário errado não recusa o convite');
select tests.clear_authentication();
select is((select status from private.ride_rider_invites where id=pg_temp.u('ik1')),'pending','a tentativa errada deixa o convite pendente para a conta certa');
update auth.users set email_confirmed_at=null where id=tests.uid('client_b');
select tests.authenticate_as('client_b');
select is(public.ride_rider_invite(pg_temp.g('tok1')),null::jsonb,'e-mail não confirmado não lê o convite');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok1'),true,gen_random_uuid())$$,'P0001','ride_invite_unavailable','e-mail não confirmado não aceita o convite');
select tests.clear_authentication();
update auth.users set email_confirmed_at=now() where id=tests.uid('client_b');
select tests.authenticate_anon();
select throws_ok($$select public.ride_rider_invite(pg_temp.g('tok1'))$$,'42501',null,'visitante sem sessão não lê convite');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok1'),true,gen_random_uuid())$$,'42501',null,'visitante sem sessão não responde convite');
select throws_ok($$select public.ride_invite_rider(gen_random_uuid(),'client_b@test.local',30,null,gen_random_uuid())$$,'42501',null,'visitante sem sessão não cria convite');
select throws_ok($$select public.ride_my_companions()$$,'42501',null,'visitante sem sessão não lista acompanhantes');
select throws_ok($$select public.ride_companion_progress(gen_random_uuid())$$,'42501',null,'visitante sem sessão não consulta andamento');

-- O destinatário confirmado lê trajeto por região, horário, instruções e o canal humano; nunca o preço.
select tests.authenticate_as('client_b');
select is(public.ride_rider_invite(pg_temp.g('tok1'))->>'status','pending','a pessoa convidada lê o convite');
select is(public.ride_rider_invite(pg_temp.g('tok1'))#>>'{legs,0,origin}','Saúde','o convite mostra a região de embarque');
select is(public.ride_rider_invite(pg_temp.g('tok1'))#>>'{legs,0,destination}','Jabaquara','o convite mostra a região de destino');
select is(public.ride_rider_invite(pg_temp.g('tok1'))->>'instructions','Leve um documento. Portão azul.','o convite mostra as instruções de quem pediu');
select is(public.ride_rider_invite(pg_temp.g('tok1'))->>'simulation','true','o convite avisa que é ensaio');
select is(public.ride_rider_invite(pg_temp.g('tok1'))#>>'{support,address}','plantao@example.test','o convite mostra o canal humano do plantão');
select ok(not (public.ride_rider_invite(pg_temp.g('tok1'))::text ~ 'cents|sponsor|client_a'),'o convite não mostra preço nem quem paga');
select throws_ok($$select private.ride_find_rider_invite(pg_temp.g('tok1'))$$,'42501',null,'rotina privada não é chamada pelo cliente');
select throws_ok($$select * from private.ride_rider_invites$$,'42501',null,'os convites não são lidos direto pelo cliente');
select throws_ok($$select * from private.ride_companions$$,'42501',null,'os vínculos de acompanhante não são lidos direto pelo cliente');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok1'),null,gen_random_uuid())$$,'P0001','invalid_input','resposta sem decisão é recusada');

-- B3.9 · Preço acima do teto: nada é pedido e não nasce aceite de quem paga.
select tests.clear_authentication();
update private.ride_rider_invites set ceiling_cents=pg_temp.n('x')-1 where id=pg_temp.u('ik1');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok1'),true,gen_random_uuid())$$,'P0001','ride_invite_reprice','preço acima do teto recusa o aceite');
select tests.clear_authentication();
select is((select count(*) from private.ride_consents where actor_id=tests.uid('client_a')),0::bigint,'o preço acima do teto não registra aceite de quem paga');
select is((select count(*) from private.ride_quotes where actor_id=tests.uid('client_b')),0::bigint,'o preço acima do teto não deixa cotação para trás');
select is((select count(*) from private.ride_payer_mandates where rider_id=tests.uid('client_b')),0::bigint,'o preço acima do teto não deixa mandato para trás');
select is((select status from private.ride_rider_invites where id=pg_temp.u('ik1')),'pending','o convite segue pendente depois da recusa por preço');
update private.ride_rider_invites set ceiling_cents=pg_temp.n('x') where id=pg_temp.u('ik1');
update private.ride_party_rules set enabled=false where environment='simulation' and capability='delegated_ride' and area='Jabaquara';
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok1'),true,gen_random_uuid())$$,'P0001','ride_feature_disabled','praça sem habilitação fecha o aceite');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_invite_rider(pg_temp.u('q_other'),'client_b@test.local',30,null,gen_random_uuid())$$,'P0001','ride_feature_disabled','praça sem habilitação fecha o convite');
select tests.clear_authentication();
update private.ride_party_rules set enabled=true where environment='simulation' and capability='delegated_ride' and area='Jabaquara';

-- B3.1 · Aceito: a corrida existe com quem viaja como passageira e quem pediu como pagador.
select tests.authenticate_as('client_b');
insert into t values('ak1',gen_random_uuid()::text);
insert into t select 'r1',public.ride_answer_rider_invite(pg_temp.g('tok1'),true,pg_temp.u('ak1'))->>'ride_id';
select ok(pg_temp.g('r1') is not null,'o aceite pede a corrida na sessão de quem viaja');
-- B3.7 · Segundo aceite é repetição idempotente, sem segunda corrida.
select is((public.ride_answer_rider_invite(pg_temp.g('tok1'),true,pg_temp.u('ak1'))->>'ride_id')::uuid,pg_temp.u('r1'),'repetir o aceite devolve a mesma corrida');
select is((public.ride_answer_rider_invite(pg_temp.g('tok1'),true,gen_random_uuid())->>'ride_id')::uuid,pg_temp.u('r1'),'aceitar de novo com outra chave devolve a mesma corrida');
select is(public.ride_answer_rider_invite(pg_temp.g('tok1'),true,gen_random_uuid())->>'status','accepted','a repetição informa o convite aceito');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok1'),false,gen_random_uuid())$$,'P0001','ride_invite_unavailable','convite aceito não muda de resposta');
select is(public.ride_rider_invite(pg_temp.g('tok1'))->>'status','accepted','quem viaja vê o convite como aceito');
select is(public.ride_rider_invite(pg_temp.g('tok1'))->>'instructions','Leve um documento. Portão azul.','as instruções seguem visíveis logo após o aceite');
select tests.clear_authentication();
insert into t select 'leg1',id::text from public.ride_legs where ride_id=pg_temp.u('r1');
select is((select count(*) from public.rides where passenger_id=tests.uid('client_b')),1::bigint,'as repetições não criam segunda corrida');
select is((select passenger_id from public.rides where id=pg_temp.u('r1')),tests.uid('client_b'),'passageira é a pessoa convidada');
select is((select payer_id from public.ride_legs where id=pg_temp.u('leg1')),tests.uid('client_a'),'pagador é quem pediu');
select is((select m.kind||':'||m.status||':'||m.uses_max from private.ride_leg_funding f join private.ride_payer_mandates m on m.id=f.mandate_id where f.leg_id=pg_temp.u('leg1')),
 'sponsor:used:1','o trecho nasce de um mandato de uso único já consumido');
select is((select count(*) from private.ride_payer_mandates where rider_id=tests.uid('client_b')),1::bigint,'o aceite cria um único mandato');
select is((select rider_id from private.ride_rider_invites where id=pg_temp.u('ik1')),tests.uid('client_b'),'o convite registra quem aceitou');

-- B3.5 · Só o destinatário confirmado consulta embarque: código e conversa ficam com quem viaja.
select tests.authenticate_as('provider_c');
select lives_ok($$select public.ride_accept_offer(pg_temp.u('leg1'),gen_random_uuid())$$,'motorista do ensaio aceita a oferta');
select tests.authenticate_as('client_b');
select ok(public.ride_issue_pin(pg_temp.u('leg1'))->>'pin' ~ '^[0-9]{6}$','quem viaja recebe o código de embarque');
select is(public.ride_communication(pg_temp.u('leg1'))->>'role','passenger','quem viaja abre a conversa com o motorista');
select is(public.ride_safety_status(pg_temp.u('leg1'))->>'status','accepted','quem viaja consulta a segurança da corrida');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))->>'origin','Saúde','quem viaja vê o próprio trajeto');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))->>'fare_cents',null,'quem viaja não vê o preço');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))#>>'{funding,role}','rider','a corrida mostra a quem viaja que outra pessoa paga');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))->>'payer','sponsor','a corrida informa o pagador convidante');
select throws_ok($$select public.ride_open_payment_order(pg_temp.u('leg1'),'pix')$$,'P0001','not_allowed','quem viaja não abre o pagamento de quem pediu');
-- B3.6 · Ajuda: o protocolo de quem viaja não aparece para quem paga.
insert into t select 'help1',public.ride_open_help(pg_temp.u('leg1'),'schedule')::text;
select is(jsonb_array_length(public.ride_support_contact(pg_temp.u('leg1'))->'requests'),1,'quem viaja vê o próprio protocolo de ajuda');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_issue_pin(pg_temp.u('leg1'))$$,'P0001','not_allowed','quem paga não recebe o código de embarque');
select throws_ok($$select public.ride_communication(pg_temp.u('leg1'))$$,'P0001','not_allowed','quem paga não lê a conversa do embarque');
select throws_ok($$select public.ride_safety_status(pg_temp.u('leg1'))$$,'P0001','not_allowed','quem paga não consulta a segurança da corrida');
select is(jsonb_array_length(public.ride_support_contact(pg_temp.u('leg1'))->'requests'),0,'o protocolo de quem viaja não aparece para quem paga');
select ok(not (public.ride_support_contact(pg_temp.u('leg1'))::text ~ pg_temp.g('help1')),'quem paga não recebe o número do protocolo de quem viaja');
-- B3.8 · Recibo do pagador; o painel esconde o trajeto de quem paga e o preço de quem viaja.
select is(pg_temp.dash_leg(pg_temp.u('leg1'))->>'origin','Reservado ao passageiro','quem paga não vê o trajeto');
select is((pg_temp.dash_leg(pg_temp.u('leg1'))->>'fare_cents')::int,pg_temp.n('x'),'quem paga vê o preço');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))#>>'{funding,role}','payer','a corrida mostra a quem pediu que ele paga');
insert into t select 'o1',public.ride_open_payment_order(pg_temp.u('leg1'),'pix')::text;
select ok(public.ride_order_receipt(pg_temp.u('o1')) is not null,'quem paga consulta o recibo');
select is(pg_temp.sent(pg_temp.u('ik1'))->>'status','accepted','quem pediu vê o convite aceito');
select is((pg_temp.sent(pg_temp.u('ik1'))->>'ride_id')::uuid,pg_temp.u('r1'),'o convite aceito aponta a corrida');
select is(public.ride_revoke_rider_invite(pg_temp.u('ik1')),false,'convite aceito não é mais revogado');
select tests.authenticate_as('client_b');
select is(public.ride_order_receipt(pg_temp.u('o1')),null::jsonb,'quem viaja não consulta o recibo do pagador');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_support_contact(pg_temp.u('leg1'))$$,'P0001','not_allowed','pessoa de fora não consulta a ajuda da corrida');
select is(public.ride_order_receipt(pg_temp.u('o1')),null::jsonb,'pessoa de fora não consulta o recibo');
-- Depois do aceite, quem paga cancela pelo caminho que já existe.
select tests.authenticate_as('client_a');
select is(public.ride_transition(pg_temp.u('leg1'),'cancelled',gen_random_uuid())->>'status','cancelled','quem paga cancela a corrida que financia');

-- B3.2 · Recusado: não nasce cotação nem corrida.
insert into t values('ik2',gen_random_uuid()::text);
insert into t select 'q2',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'tok2',public.ride_invite_rider(pg_temp.u('q2'),'client_b@test.local',15,'Recado do segundo convite',pg_temp.u('ik2'))->>'token';
select tests.clear_authentication();
insert into t select 'quotes_b',count(*)::text from private.ride_quotes where actor_id=tests.uid('client_b');
select tests.authenticate_as('client_b');
select is(public.ride_answer_rider_invite(pg_temp.g('tok2'),false,gen_random_uuid())->>'status','declined','a pessoa convidada recusa');
select is(public.ride_answer_rider_invite(pg_temp.g('tok2'),false,gen_random_uuid())->>'status','declined','repetir a recusa devolve o mesmo resultado');
select is(public.ride_answer_rider_invite(pg_temp.g('tok2'),false,gen_random_uuid())->>'ride_id',null,'a recusa não aponta corrida');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok2'),true,gen_random_uuid())$$,'P0001','ride_invite_unavailable','convite recusado não é aceito depois');
select is(public.ride_rider_invite(pg_temp.g('tok2'))->>'status','declined','quem recusou vê o convite encerrado');
select is(jsonb_array_length(public.ride_rider_invite(pg_temp.g('tok2'))->'legs'),0,'convite encerrado não mostra mais o trajeto');
select tests.clear_authentication();
select is((select count(*)::text from private.ride_quotes where actor_id=tests.uid('client_b')),pg_temp.g('quotes_b'),'a recusa não cria cotação');
select is((select count(*) from public.rides where passenger_id=tests.uid('client_b')),1::bigint,'a recusa não cria corrida');
select is((select instructions from private.ride_rider_invites where id=pg_temp.u('ik2')),null,'a recusa apaga as instruções');

-- B3.3 · Expirado: responder devolve convite indisponível.
select tests.authenticate_as('client_a');
insert into t values('ik3',gen_random_uuid()::text),('ik4',gen_random_uuid()::text);
insert into t select 'q3',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'tok3',public.ride_invite_rider(pg_temp.u('q3'),'client_b@test.local',5,'Recado do convite que vence',pg_temp.u('ik3'))->>'token';
insert into t select 'q4',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'tok4',public.ride_invite_rider(pg_temp.u('q4'),'client_b@test.local',60,null,pg_temp.u('ik4'))->>'token';
select tests.clear_authentication();
update private.ride_rider_invites set expires_at=now()-interval '1 minute' where id=pg_temp.u('ik3');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok3'),true,gen_random_uuid())$$,'P0001','ride_invite_unavailable','convite expirado não é aceito');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok3'),false,gen_random_uuid())$$,'P0001','ride_invite_unavailable','convite expirado não é recusado');
select is(public.ride_rider_invite(pg_temp.g('tok3'))->>'status','expired','a pessoa convidada vê o convite como expirado');
select is(public.ride_rider_invite(pg_temp.g('tok3'))->>'instructions',null,'convite expirado não mostra mais as instruções');
-- B3.7 · Permissões e revogação: convite pendente revogado não é respondido.
select tests.authenticate_as('client_a');
select is(pg_temp.sent(pg_temp.u('ik3'))->>'status','expired','quem pediu vê o convite expirado');
select is(public.ride_revoke_rider_invite(pg_temp.u('ik4')),true,'quem pediu revoga o convite pendente');
select is(public.ride_revoke_rider_invite(pg_temp.u('ik4')),false,'revogar de novo não muda nada');
select is(pg_temp.sent(pg_temp.u('ik4'))->>'status','revoked','quem pediu vê o convite revogado');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok4'),true,gen_random_uuid())$$,'P0001','ride_invite_unavailable','convite revogado não é aceito');
select is(public.ride_rider_invite(pg_temp.g('tok4'))->>'status','revoked','a pessoa convidada vê que o convite foi revogado');
-- Horário de saída que já passou: o convite deixa de valer, mesmo antes de expirar.
select tests.authenticate_as('client_a');
insert into t values('ik6',gen_random_uuid()::text);
insert into t select 'tok6',public.ride_invite_rider(pg_temp.u('q_other'),'client_b@test.local',30,null,pg_temp.u('ik6'))->>'token';
select tests.clear_authentication();
update private.ride_rider_invites set scheduled_at=now()-interval '1 minute' where id=pg_temp.u('ik6');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_answer_rider_invite(pg_temp.g('tok6'),true,gen_random_uuid())$$,'P0001','ride_invite_unavailable','convite com horário de saída vencido não é aceito');
select tests.clear_authentication();
select is((select count(*) from public.rides where passenger_id=tests.uid('client_b')),1::bigint,'expirado, revogado e vencido não criam corrida');
select is((select count(*) from private.ride_payer_mandates where rider_id=tests.uid('client_b')),1::bigint,'as tentativas recusadas não deixam mandato para trás');

-- Cotação com trajeto medido guarda os endereços de quem pediu: não vira convite.
select tests.authenticate_as('client_a');
insert into t select 'route1',public.ride_prepare_route(gen_random_uuid(),null,'Saúde','Jabaquara',
 pg_temp.point(-23.60,-46.64,'Embarque de ensaio'),pg_temp.point(-23.61,-46.65,'Destino de ensaio'),null)->>'id';
select tests.authenticate_as('admin');
select public.ride_claim_route(pg_temp.u('route1'));
select public.ride_verify_route(pg_temp.u('route1'),2000,12,'ensaio/205-1');
select tests.authenticate_as('client_a');
insert into t select 'q5',public.ride_quote(gen_random_uuid(),null,null,
 jsonb_build_array(jsonb_build_object('origin','Saúde','destination','Jabaquara','route_id',pg_temp.g('route1'),'payer','passenger')))->>'id';
select throws_ok($$select public.ride_invite_rider(pg_temp.u('q5'),'client_b@test.local',30,null,gen_random_uuid())$$,'P0001','invalid_input','cotação com endereço exato não é repassada');

-- Retenção: convites vencidos são marcados e as instruções somem 24 h depois do encerramento.
select tests.clear_authentication();
update private.ride_rider_invites set answered_at=now()-interval '25 hours' where id=pg_temp.u('ik1');
select tests.authenticate_as('client_b');
select is(public.ride_rider_invite(pg_temp.g('tok1'))->>'instructions',null,'depois de 24 h as instruções deixam de ser exibidas');
select tests.clear_authentication();
select ok(private.purge_ride_delegation_invites()>=2,'a rotina de retenção trata convites vencidos e instruções antigas');
select is((select status from private.ride_rider_invites where id=pg_temp.u('ik3')),'expired','a retenção marca o convite vencido');
select is((select count(*) from private.ride_rider_invites where instructions is not null),0::bigint,'a retenção apaga instruções de convites encerrados');
select is(private.purge_ride_delegation_invites(),0,'a retenção repetida não muda mais nada');

-- PAR-503 · acompanhante de confiança: a pessoa escolhe quem acompanha, quais avisos e quem paga.
select tests.authenticate_as('provider_a');
insert into t values('ck1',gen_random_uuid()::text),('ck2',gen_random_uuid()::text);
select throws_ok($$select public.ride_invite_companion('provider_e@test.local',array['arriving','localizacao'],false,60,gen_random_uuid())$$,'P0001','invalid_input','aviso desconhecido é recusado');
select throws_ok($$select public.ride_invite_companion('provider_e@test.local',null,false,60,gen_random_uuid())$$,'P0001','invalid_input','lista de avisos ausente é recusada');
select throws_ok($$select public.ride_invite_companion('provider_e@test.local',array['arriving'],null,60,gen_random_uuid())$$,'P0001','invalid_input','sem dizer quem paga o convite é recusado');
select throws_ok($$select public.ride_invite_companion('provider_a@test.local',array['arriving'],false,60,gen_random_uuid())$$,'P0001','invalid_input','ninguém é acompanhante de si mesmo');
select throws_ok($$select public.ride_invite_companion('provider_e@test.local',array['arriving'],false,1,gen_random_uuid())$$,'P0001','invalid_input','validade curta demais é recusada');
insert into t select 'ctok1',public.ride_invite_companion('Provider_E@test.local',array['completed','arriving','arriving'],false,60,pg_temp.u('ck1'))->>'token';
select ok(pg_temp.g('ctok1') ~ '^[a-f0-9]{64}$','o convite de acompanhante devolve o código uma única vez');
select is(public.ride_invite_companion('provider_e@test.local',array['arriving','completed'],false,60,pg_temp.u('ck1'))->>'token',null,'repetir o convite não devolve o código de novo');
select throws_ok($$select public.ride_invite_companion('provider_e@test.local',array['boarded'],false,60,pg_temp.u('ck1'))$$,'P0001','idempotency_conflict','mesma chave com outros avisos é conflito');
select is(public.ride_my_companions()#>>'{invites,0,status}','pending','a pessoa vê o próprio convite pendente');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_answer_companion(pg_temp.g('ctok1'),true)$$,'P0001','ride_invite_unavailable','destinatário errado não vira acompanhante');
select throws_ok($$select public.ride_invite_companion('provider_e@test.local',array['boarded'],false,60,pg_temp.u('ck1'))$$,'P0001','idempotency_conflict','a chave de outra pessoa não é reutilizada');
select is(public.ride_companion_progress(tests.uid('provider_a')),null::jsonb,'quem não é acompanhante não consulta o andamento');
select tests.clear_authentication();
select is((select status from private.ride_companion_invites where id=pg_temp.u('ck1')),'pending','a tentativa errada deixa o convite pendente');
select tests.authenticate_as('provider_e');
select is(public.ride_answer_companion(pg_temp.g('ctok1'),true),'accepted','a pessoa convidada aceita acompanhar');
select is(public.ride_answer_companion(pg_temp.g('ctok1'),true),'accepted','repetir o aceite devolve o mesmo resultado');
select throws_ok($$select public.ride_answer_companion(pg_temp.g('ctok1'),false)$$,'P0001','ride_invite_unavailable','convite usado não muda de resposta');
select is(pg_temp.link(tests.uid('provider_a'),tests.uid('provider_e'))->>'mine','false','quem acompanha vê o vínculo do lado de acompanhante');
select is(pg_temp.link(tests.uid('provider_a'),tests.uid('provider_e'))->'notices','["arriving","completed"]'::jsonb,'quem acompanha vê os avisos escolhidos');
select is(pg_temp.link(tests.uid('provider_a'),tests.uid('provider_e'))->>'label','Prestadora A','quem acompanha vê o nome de quem é acompanhado');
select throws_ok($$select public.ride_set_companion(tests.uid('provider_a'),array['boarded'],false)$$,'P0001','not_allowed','quem acompanha não escolhe os próprios avisos');
select is(public.ride_companion_progress(tests.uid('provider_a')),null::jsonb,'sem corrida em andamento não há o que acompanhar');
select tests.authenticate_as('provider_a');
select is(pg_temp.link(tests.uid('provider_a'),tests.uid('provider_e'))->>'mine','true','a pessoa vê o próprio acompanhante');
select is(pg_temp.link(tests.uid('provider_a'),tests.uid('provider_e'))->>'pays','false','sem pedido de pagamento a própria pessoa paga');
select is(jsonb_array_length(public.ride_my_companions()->'mandates'),0,'acompanhante que não paga não cria mandato');
select is(public.ride_companion_progress(tests.uid('provider_e')),null::jsonb,'o vínculo não vale no sentido contrário');

-- B5.1 · O acompanhante recebe só os avisos escolhidos.
insert into t select 'qb1',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'rb1',public.ride_consent(pg_temp.u('qb1'),true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'b1',id::text from public.ride_legs where ride_id=pg_temp.u('rb1');
select tests.authenticate_as('provider_c');
select lives_ok($$select public.ride_accept_offer(pg_temp.u('b1'),gen_random_uuid())$$,'motorista aceita a corrida da pessoa acompanhada');
select tests.authenticate_as('provider_e');
select is(public.ride_companion_progress(tests.uid('provider_a'))->>'status','accepted','o acompanhante consulta a situação da corrida');
-- B5.5 · O acompanhante nunca recebe o código de embarque nem o trajeto.
select is((select array_agg(k order by k) from jsonb_object_keys(public.ride_companion_progress(tests.uid('provider_a'))) k),array['eta','simulation','status'],
 'o andamento leva só situação, previsão e o aviso de ensaio');
select throws_ok($$select public.ride_issue_pin(pg_temp.u('b1'))$$,'P0001','not_allowed','o acompanhante não recebe o código de embarque');
select throws_ok($$select public.ride_communication(pg_temp.u('b1'))$$,'P0001','not_allowed','o acompanhante não lê a conversa do embarque');
select throws_ok($$select public.ride_progress(pg_temp.u('b1'))$$,'P0001','not_allowed','o acompanhante não abre o andamento completo do trecho');
select throws_ok($$select public.ride_support_contact(pg_temp.u('b1'))$$,'P0001','not_allowed','o acompanhante não abre a ajuda da pessoa');
select is(pg_temp.dash_leg(pg_temp.u('b1')),null::jsonb,'a corrida não aparece no painel do acompanhante');
select tests.clear_authentication();
update public.ride_legs set status='arriving',updated_at=now() where id=pg_temp.u('b1');
update public.ride_legs set status='boarded',updated_at=now() where id=pg_temp.u('b1');
select tests.authenticate_as('provider_e');
select is(public.ride_companion_progress(tests.uid('provider_a'))->>'status','boarded','o andamento acompanha a corrida');
select ok(not (public.ride_companion_progress(tests.uid('provider_a'))::text ~ 'Saúde|Jabaquara|"lat"|"lng"|position|driver|cents'),'o andamento não leva lugar, posição, motorista nem preço');
select tests.clear_authentication();
update public.ride_legs set status='completed',updated_at=now() where id=pg_temp.u('b1');
select is(pg_temp.events(tests.uid('provider_e'),pg_temp.u('b1')),array['arriving','completed'],'o acompanhante recebe só os avisos escolhidos');
select is(pg_temp.events(tests.uid('provider_a'),pg_temp.u('b1')),array['accepted','arriving','boarded','completed','requested'],'a pessoa continua recebendo todos os próprios avisos');
select is(pg_temp.events(tests.uid('provider_b'),pg_temp.u('b1')),'{}'::text[],'quem não acompanha não recebe aviso');
select tests.authenticate_as('provider_e');
select is(jsonb_array_length(public.ride_passenger_updates()->'items'),2,'os avisos chegam pela lista de avisos que já existe');
select ok(not (public.ride_passenger_updates()::text ~ 'Saúde|Jabaquara'),'os avisos do acompanhante não levam o trajeto');
select is(public.ride_companion_progress(tests.uid('provider_a')),null::jsonb,'corrida concluída sai do andamento');

-- A pessoa muda os avisos; fazer alguém pagar exige novo convite aceito por essa pessoa.
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_set_companion(tests.uid('provider_e'),array['boarded'],true)$$,'P0001','not_allowed','ninguém passa a pagar sem aceitar');
select throws_ok($$select public.ride_set_companion(tests.uid('provider_e'),array['nada'],false)$$,'P0001','invalid_input','aviso desconhecido é recusado na mudança');
select throws_ok($$select public.ride_set_companion(tests.uid('provider_b'),array['boarded'],false)$$,'P0001','not_allowed','só se muda o aviso de quem é acompanhante');
select ok(public.ride_set_companion(tests.uid('provider_e'),array['completed','boarded'],false),'a pessoa troca os avisos do acompanhante');
select is(pg_temp.link(tests.uid('provider_a'),tests.uid('provider_e'))->'notices','["boarded","completed"]'::jsonb,'os novos avisos ficam registrados');

-- B5.2 · Com pagamento: o pagador do trecho é o acompanhante e o teto vale.
insert into t select 'ctok2',public.ride_invite_companion('provider_d@test.local',array['requested'],true,60,pg_temp.u('ck2'))->>'token';
select tests.authenticate_as('provider_d');
select is(public.ride_answer_companion(pg_temp.g('ctok2'),true),'accepted','a pessoa convidada aceita acompanhar e pagar');
select is(public.ride_answer_companion(pg_temp.g('ctok2'),true),'accepted','repetir o aceite não cria outro mandato');
select tests.clear_authentication();
select is((select count(*) from private.ride_payer_mandates where kind='companion' and rider_id=tests.uid('provider_a') and payer_id=tests.uid('provider_d') and status='active'),
 1::bigint,'o aceite cria um único mandato de acompanhante');
select tests.authenticate_as('provider_a');
insert into t select 'cm',public.ride_my_companions()#>>'{mandates,0,id}';
select is((public.ride_my_companions()#>>'{mandates,0,ceiling_cents}')::int,15000,'o mandato traz o teto por corrida do ensaio');
select is(public.ride_my_companions()#>>'{mandates,0,payer_label}','Prestador D','a pessoa vê quem paga');
select is(public.ride_my_companions()#>>'{mandates,0,kind}','companion','o mandato é de acompanhante');
insert into t select 'qc1',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('cm'))->>'id';
insert into t select 'rc1',public.ride_consent(pg_temp.u('qc1'),true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'c1',id::text from public.ride_legs where ride_id=pg_temp.u('rc1');
select is((select payer_id from public.ride_legs where id=pg_temp.u('c1')),tests.uid('provider_d'),'o pagador do trecho é o acompanhante');
select is((select passenger_id from public.rides where id=pg_temp.u('rc1')),tests.uid('provider_a'),'a passageira continua sendo a própria pessoa');
update private.ride_payer_mandates set ceiling_cents=pg_temp.n('x')-1 where id=pg_temp.u('cm');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('cm'))$$,'P0001','ride_limit_exceeded','corrida acima do teto do acompanhante é recusada');
select tests.clear_authentication();
update private.ride_payer_mandates set ceiling_cents=15000 where id=pg_temp.u('cm');
select tests.authenticate_as('provider_e');
select throws_ok($$select public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('cm'))$$,'P0001','not_allowed','outra pessoa não usa o mandato do acompanhante');
-- Quem paga recebe, como pagador, só os avisos escolhidos pela pessoa.
select tests.clear_authentication();
update public.ride_legs set status='cancelled',updated_at=now() where id=pg_temp.u('c1');
select is(pg_temp.events(tests.uid('provider_d'),pg_temp.u('c1')),array['requested'],'o acompanhante que paga recebe só o aviso escolhido');
select is(pg_temp.events(tests.uid('provider_e'),pg_temp.u('c1')),'{}'::text[],'o outro acompanhante não recebe aviso fora da própria escolha');
select tests.authenticate_as('provider_a');
insert into t select 'qc2',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('cm'))->>'id';
insert into t select 'rc2',public.ride_consent(pg_temp.u('qc2'),true)->>'ride_id';
insert into t select 'qc3',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('cm'))->>'id';
select throws_ok($$select public.ride_invite_rider(pg_temp.u('qc3'),'client_b@test.local',30,null,gen_random_uuid())$$,'P0001','quote_unavailable','cotação paga por mandato não vira convite');
select tests.clear_authentication();
insert into t select 'c2',id::text from public.ride_legs where ride_id=pg_temp.u('rc2');
select tests.authenticate_as('provider_c');
select lives_ok($$select public.ride_accept_offer(pg_temp.u('c2'),gen_random_uuid())$$,'motorista aceita a corrida paga pelo acompanhante');
select tests.clear_authentication();
update public.ride_legs set status='arriving',updated_at=now() where id=pg_temp.u('c2');
update public.ride_legs set status='boarded',updated_at=now() where id=pg_temp.u('c2');
select is(pg_temp.events(tests.uid('provider_d'),pg_temp.u('c2')),array['requested'],'embarque não escolhido não chega a quem paga');
select is(pg_temp.events(tests.uid('provider_e'),pg_temp.u('c2')),array['boarded'],'a nova escolha de avisos vale para a corrida seguinte');
-- B5.5 · Quem paga como acompanhante também não recebe código nem trajeto.
select tests.authenticate_as('provider_d');
select throws_ok($$select public.ride_issue_pin(pg_temp.u('c2'))$$,'P0001','not_allowed','o acompanhante que paga não recebe o código de embarque');
select throws_ok($$select public.ride_communication(pg_temp.u('c2'))$$,'P0001','not_allowed','o acompanhante que paga não lê a conversa do embarque');
select is(pg_temp.dash_leg(pg_temp.u('c2'))->>'origin','Reservado ao passageiro','o acompanhante que paga não vê o trajeto');
select is(pg_temp.dash_leg(pg_temp.u('c2'))->>'payer','companion','o painel informa que ele paga como acompanhante');
select is(public.ride_companion_progress(tests.uid('provider_a'))->>'status','boarded','o acompanhante que paga consulta o andamento');
insert into t select 'oc2',public.ride_open_payment_order(pg_temp.u('c2'),'pix')::text;

-- B5.3 · Retirada da delegação: sem novos avisos, sem andamento e com o mandato revogado.
select throws_ok($$select public.ride_revoke_companion(null)$$,'P0001','not_allowed','retirada sem pessoa indicada é recusada');
select is(public.ride_revoke_companion(tests.uid('provider_b')),false,'retirar vínculo que não existe não muda nada');
select is(public.ride_revoke_companion(tests.uid('provider_a')),true,'o acompanhante sai do vínculo por conta própria');
select is(public.ride_revoke_companion(tests.uid('provider_a')),false,'sair de novo não muda nada');
select is(public.ride_companion_progress(tests.uid('provider_a')),null::jsonb,'depois de sair o acompanhante não consulta o andamento');
select is(pg_temp.link(tests.uid('provider_a'),tests.uid('provider_d')),null::jsonb,'o vínculo encerrado some da lista');
select ok(public.ride_order_receipt(pg_temp.u('oc2')) is not null,'a cobrança da corrida já pedida continua com quem pagava');
select tests.authenticate_as('provider_b');
select is(public.ride_revoke_companion(tests.uid('provider_e')),false,'pessoa de fora não retira o acompanhante de ninguém');
select tests.authenticate_as('provider_a');
select is(public.ride_revoke_companion(tests.uid('provider_e')),true,'a pessoa retira o acompanhante');
select is(jsonb_array_length(public.ride_my_companions()->'companions'),0,'a pessoa fica sem acompanhantes');
select is(jsonb_array_length(public.ride_my_companions()->'mandates'),0,'a pessoa fica sem mandato de acompanhante');
select throws_ok($$select public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('cm'))$$,'P0001','ride_mandate_revoked','mandato revogado não paga nova corrida');
select throws_ok($$select public.ride_consent(pg_temp.u('qc3'),true)$$,'P0001','ride_mandate_revoked','cotação pendente do mandato revogado não vira corrida');
select throws_ok($$select public.ride_set_companion(tests.uid('provider_e'),array['boarded'],false)$$,'P0001','not_allowed','vínculo encerrado não é alterado');
select tests.authenticate_as('provider_e');
select is(public.ride_companion_progress(tests.uid('provider_a')),null::jsonb,'depois da retirada o acompanhante não consulta o andamento');
select is(jsonb_array_length(public.ride_passenger_updates()->'items'),0,'os avisos copiados somem da lista do acompanhante');
select tests.clear_authentication();
select is((select status from private.ride_payer_mandates where id=pg_temp.u('cm')),'revoked','a retirada revoga o mandato');
select is((select count(*) from private.ride_companions where owner_id=tests.uid('provider_a') and status='revoked' and revoked_at is not null),2::bigint,'os dois vínculos ficam registrados como retirados');
select is((select payer_id from public.ride_legs where id=pg_temp.u('c2')),tests.uid('provider_d'),'a corrida já pedida mantém o pagador');
update public.ride_legs set status='completed',updated_at=now() where id=pg_temp.u('c2');
select is(pg_temp.events(tests.uid('provider_e'),pg_temp.u('c2')),'{}'::text[],'depois da retirada não nasce aviso novo para o acompanhante');
select is(pg_temp.events(tests.uid('provider_d'),pg_temp.u('c2')),array['requested'],'depois de sair quem pagava não recebe aviso novo');
select is((select count(*) from private.ride_passenger_notices where owner_id=tests.uid('provider_e')),0::bigint,'o acompanhante retirado não guarda aviso de corrida alheia');

-- B5.4 · A própria pessoa mantém ajuda, protocolo de segurança e avisos depois da retirada.
select is(pg_temp.events(tests.uid('provider_a'),pg_temp.u('c2')),array['accepted','arriving','boarded','completed','requested'],'a pessoa mantém todos os próprios avisos');
select tests.authenticate_as('provider_a');
select is(public.ride_support_contact(pg_temp.u('c2'))->>'address','plantao@example.test','a pessoa continua vendo o canal do plantão');
select ok(public.ride_open_help(pg_temp.u('c2'),'other') is not null,'a pessoa continua abrindo pedido de ajuda');
select is(jsonb_array_length(public.ride_support_contact(pg_temp.u('c2'))->'requests'),1,'o protocolo de ajuda aparece para a própria pessoa');
select ok(public.ride_safety_case(pg_temp.u('c2'),'other',gen_random_uuid()) is not null,'a pessoa continua abrindo protocolo de segurança');
select ok(jsonb_array_length(public.ride_passenger_updates()->'items')>=5,'a pessoa continua lendo os próprios avisos');
select tests.authenticate_as('provider_d');
select is(jsonb_array_length(public.ride_support_contact(pg_temp.u('c2'))->'requests'),0,'quem pagava não vê o protocolo da pessoa');

-- Novo convite reativa o vínculo; portão fechado e limites recusam.
select tests.authenticate_as('provider_a');
insert into t select 'ctok3',public.ride_invite_companion('provider_e@test.local',array['cancelled'],false,60,gen_random_uuid())->>'token';
insert into t select 'ctok4',public.ride_invite_companion('provider_b@test.local',array['cancelled'],true,60,gen_random_uuid())->>'token';
insert into t select 'ctok5',public.ride_invite_companion('client_b@test.local',array['cancelled'],false,60,gen_random_uuid())->>'token';
select tests.authenticate_as('provider_e');
select is(public.ride_answer_companion(pg_temp.g('ctok3'),true),'accepted','novo convite aceito reativa o acompanhamento');
select is(pg_temp.link(tests.uid('provider_a'),tests.uid('provider_e'))->'notices','["cancelled"]'::jsonb,'o vínculo reativado usa os avisos do novo convite');
select tests.authenticate_as('client_b');
select is(public.ride_answer_companion(pg_temp.g('ctok5'),false),'declined','recusar o convite não cria vínculo');
select is(public.ride_answer_companion(pg_temp.g('ctok5'),false),'declined','repetir a recusa devolve o mesmo resultado');
select is(jsonb_array_length(public.ride_my_companions()->'companions'),0,'quem recusou não acompanha ninguém');
select tests.clear_authentication();
update private.ride_companion_terms set valid_until=now()-interval '1 day' where environment='simulation';
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_answer_companion(pg_temp.g('ctok4'),true)$$,'P0001','ride_invite_unavailable','sem teto vigente ninguém aceita pagar');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_invite_companion('provider_b@test.local',array['cancelled'],true,60,gen_random_uuid())$$,'P0001','ride_feature_disabled','sem teto vigente não há convite com pagamento');
select tests.clear_authentication();
update private.ride_companion_terms set valid_until='infinity' where environment='simulation';
update private.ride_party_rules set enabled=false where environment='simulation' and capability='companion';
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_invite_companion('provider_b@test.local',array['cancelled'],false,60,gen_random_uuid())$$,'P0001','ride_feature_disabled','portão fechado recusa novo acompanhante');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_answer_companion(pg_temp.g('ctok4'),true)$$,'P0001','ride_invite_unavailable','portão fechado recusa o aceite');
select tests.authenticate_as('provider_e');
select is(public.ride_revoke_companion(tests.uid('provider_a')),true,'a retirada funciona mesmo com o portão fechado');
select tests.clear_authentication();
update private.ride_party_rules set enabled=true where environment='simulation' and capability='companion';
update private.ride_companion_invites set expires_at=now()-interval '1 minute' where owner_id=tests.uid('provider_a') and status='pending';
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_answer_companion(pg_temp.g('ctok4'),true)$$,'P0001','ride_invite_unavailable','convite de acompanhante vencido não vale');
select tests.clear_authentication();
select is(private.purge_ride_delegation_invites(),1,'a retenção marca o convite de acompanhante vencido');
insert into private.ride_companion_invites(id,environment,owner_id,notices,pays,token_hash,recipient_hash,request_hash,expires_at)
 select gen_random_uuid(),'simulation',tests.uid('provider_b'),'{}',false,sha256(convert_to('205-limite-'||n,'UTF8')),'\x00','\x00',now()+interval '1 hour' from generate_series(1,12) n;
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_invite_companion('provider_e@test.local',array['cancelled'],false,60,gen_random_uuid())$$,'P0001','rate_limited','o limite de convites por hora é respeitado');

-- Módulo fechado: nada novo começa, e as rotinas privadas não têm concessão a papéis de API.
select tests.clear_authentication();
update private.ride_network set module_enabled=false where environment='simulation';
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_invite_companion('provider_b@test.local',array['cancelled'],false,60,gen_random_uuid())$$,'P0001','ride_feature_disabled','módulo fechado recusa convite de acompanhante');
select throws_ok($$select public.ride_my_rider_invites()$$,'P0001','ride_feature_disabled','módulo fechado recusa a lista de convites');
select tests.clear_authentication();
select is((select count(*) from pg_proc p where p.pronamespace='private'::regnamespace
  and p.proname in ('ride_find_rider_invite','ride_find_companion_invite','ride_companion_notices','ride_companion_notice_filter','ride_companion_notice_fanout','purge_ride_delegation_invites')
  and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('service_role',p.oid,'execute'))),
 0::bigint,'as rotinas privadas deste arquivo não são executáveis por papéis de API');
select is((select count(*) from pg_proc p where p.pronamespace='public'::regnamespace
  and p.proname in ('ride_invite_rider','ride_rider_invite','ride_answer_rider_invite','ride_revoke_rider_invite','ride_my_rider_invites','ride_invite_companion',
   'ride_answer_companion','ride_set_companion','ride_revoke_companion','ride_companion_progress','ride_my_companions')
  and has_function_privilege('authenticated',p.oid,'execute') and not has_function_privilege('anon',p.oid,'execute') and p.prosecdef),
 11::bigint,'as onze rotinas públicas ficam só para contas autenticadas');
select * from finish();
rollback;
