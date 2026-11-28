-- PAR-502 (O17 etapa 5): família por adesão e pagador compartilhado, sobre o portão,
-- as contas, os mandatos e o financiamento de 20261127110501. Dados fictícios, sem rede.
begin;
select no_plan();
select tests.setup_fixture();
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
create function pg_temp.dash_quote(p uuid) returns jsonb language sql as $$
 select q from jsonb_array_elements(public.ride_dashboard()->'quotes') q where q->>'id'=p::text$$;
create function pg_temp.line(p_statement jsonb,p_leg uuid) returns jsonb language sql as $$
 select r from jsonb_array_elements(p_statement->'rows') r where r->>'leg_id'=p_leg::text$$;
grant execute on function pg_temp.g(text),pg_temp.u(text),pg_temp.n(text),pg_temp.trip(),pg_temp.point(numeric,numeric,text),
 pg_temp.dash_leg(uuid),pg_temp.dash_quote(uuid),pg_temp.line(jsonb,uuid) to authenticated,anon;
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('provider_c'),'simulation','sedan','approved',current_date+30,tests.uid('admin'),true);
insert into private.ride_method_releases(environment,origin,destination,method,evidence_ref,validity,card_brands,acquirer_profile_ref)
 select 'simulation','Saúde','Jabaquara',m,'ensaio 205b',tstzrange(now()-interval '1 day',now()+interval '1 day'),
  case when m='card' then array['VISA'] else '{}'::text[] end,case when m='card' then 'conta hospedada TESTE' end from unnest(array['card','pix','benefit']) m;

-- Portão: as oito capacidades existem só no ensaio, com referência fictícia.
select is((select count(distinct capability) from private.ride_party_rules where environment='simulation' and enabled and evidence_ref='ficticio-o17-e5'),
 8::bigint,'o ensaio semeia as oito capacidades com evidência fictícia');
select is((select count(*) from private.ride_party_rules where environment='live'),0::bigint,'produção não recebe nenhuma linha de habilitação');
select ok(private.ride_party_allowed('simulation','family','Saúde','Jabaquara',now()+interval '1 day'),'portão aberto no ensaio para as duas praças');
select ok(not private.ride_party_allowed('live','family','Saúde','Jabaquara',now()),'portão fechado em produção');
select ok(not private.ride_party_allowed('simulation','family','Praça desconhecida',null,now()),'praça sem regra fica fechada');
select ok(not private.ride_party_allowed('simulation','outra_capacidade',null,null,now()),'capacidade inexistente fica fechada');

-- Tarifa de referência do trecho, lida de uma cotação comum de quem não é da família.
select tests.authenticate_as('provider_b');
insert into t select 'plain',public.ride_quote(gen_random_uuid(),null,null,pg_temp.trip())->>'id';
insert into t select 'x',(public.ride_dashboard()->'quotes'->0->>'total_cents');
select ok(not (pg_temp.dash_quote(pg_temp.u('plain')) ? 'funding'),'cotação comum não ganha bloco de financiamento');
select tests.clear_authentication();
insert into t select 'limit3',(pg_temp.n('x')*3)::text;
insert into t select 'limit10',(pg_temp.n('x')*10)::text;

-- Conta familiar: criação idempotente e convites por adesão.
select tests.authenticate_as('client_a');
insert into t values('fam_key',gen_random_uuid()::text);
insert into t select 'fam',public.ride_create_family('Família de ensaio',pg_temp.n('limit3'),'pix',pg_temp.u('fam_key'))::text;
select is(public.ride_create_family('Família de ensaio',pg_temp.n('limit3'),'pix',pg_temp.u('fam_key')),pg_temp.u('fam'),'repetir a criação devolve a mesma conta');
select throws_ok($$select public.ride_create_family('Outro nome',pg_temp.n('limit3'),'pix',pg_temp.u('fam_key'))$$,'P0001','idempotency_conflict','mesma chave com outro pedido é conflito');
select throws_ok($$select public.ride_create_family(' ',1000,'pix',gen_random_uuid())$$,'P0001','invalid_input','nome vazio é recusado');
select throws_ok($$select public.ride_create_family('Família',1000,'dinheiro',gen_random_uuid())$$,'P0001','invalid_input','meio de pagamento fora da lista é recusado');
insert into t values('inv_b_key',gen_random_uuid()::text),('inv_e_key',gen_random_uuid()::text),('inv_a_key',gen_random_uuid()::text),('inv_a2_key',gen_random_uuid()::text);
insert into t select 'inv_b',public.ride_invite_member(pg_temp.u('fam'),'Client_B@test.local','member',60,pg_temp.u('inv_b_key'))->>'token';
select ok(pg_temp.g('inv_b') ~ '^[a-f0-9]{64}$','o convite devolve o código uma única vez');
select is(public.ride_invite_member(pg_temp.u('fam'),'Client_B@test.local','member',60,pg_temp.u('inv_b_key'))->>'token',null,'repetir o convite não devolve o código de novo');
select throws_ok($$select public.ride_invite_member(pg_temp.u('fam'),'provider_e@test.local','member',60,pg_temp.u('inv_b_key'))$$,'P0001','idempotency_conflict','mesma chave para outro destinatário é conflito');
select throws_ok($$select public.ride_invite_member(pg_temp.u('fam'),'provider_e@test.local','manager',60,gen_random_uuid())$$,'P0001','invalid_input','família só convida participante');
select throws_ok($$select public.ride_invite_member(pg_temp.u('fam'),'client_a@test.local','member',60,gen_random_uuid())$$,'P0001','invalid_input','ninguém convida a si mesmo');
select throws_ok($$select public.ride_invite_member(pg_temp.u('fam'),'sem-arroba','member',60,gen_random_uuid())$$,'P0001','invalid_input','e-mail inválido é recusado');
insert into t select 'inv_e',public.ride_invite_member(pg_temp.u('fam'),'provider_e@test.local','member',60,pg_temp.u('inv_e_key'))->>'token';
insert into t select 'inv_a',public.ride_invite_member(pg_temp.u('fam'),'provider_a@test.local','member',5,pg_temp.u('inv_a_key'))->>'token';
select tests.clear_authentication();
select is((select token_hash from private.ride_account_invites where id=pg_temp.u('inv_b_key')),sha256(convert_to(pg_temp.g('inv_b'),'UTF8')),'só o resumo do código é guardado');
select is((select count(*) from information_schema.columns where table_schema='private' and table_name='ride_account_invites' and column_name ~ 'mail'),0::bigint,'o convite não guarda e-mail');
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_invite_member(pg_temp.u('fam'),'provider_e@test.local','member',60,gen_random_uuid())$$,'P0001','ride_account_role_required','quem não é da conta não convida');
select is(public.ride_account_invite(pg_temp.g('inv_b')),null::jsonb,'destinatário errado não lê o convite');
select throws_ok($$select public.ride_join_account(pg_temp.g('inv_b'),true)$$,'P0001','ride_invite_unavailable','destinatário errado não entra na conta');
select tests.clear_authentication();
select is((select status from private.ride_account_invites where id=pg_temp.u('inv_b_key')),'pending','a tentativa errada deixa o convite pendente para a pessoa certa');
select tests.authenticate_as('client_b');
select is(public.ride_account_invite(pg_temp.g('inv_b'))->>'account_name','Família de ensaio','a pessoa convidada lê para qual conta é o convite');
select is(public.ride_join_account(pg_temp.g('inv_b'),true),'accepted','a pessoa convidada entra por adesão');
select is(public.ride_join_account(pg_temp.g('inv_b'),true),'accepted','repetir a adesão devolve o mesmo resultado');
select throws_ok($$select public.ride_join_account(pg_temp.g('inv_b'),false)$$,'P0001','ride_invite_unavailable','convite já usado não muda de resposta');
insert into t select 'm_b',public.ride_my_accounts()->0->>'mandate_id';
select is(public.ride_my_accounts()->0->>'role','member','participante vê o próprio papel');
select is(public.ride_my_accounts()->0->>'monthly_limit_cents',null,'participante não vê o limite da conta');
select is(jsonb_array_length(public.ride_my_accounts()->0->'members'),0,'participante não vê a lista de pessoas');
select tests.authenticate_as('provider_e');
select is(public.ride_join_account(pg_temp.g('inv_e'),false),'declined','recusar o convite não cria vínculo');
select tests.clear_authentication();
select is((select count(*) from private.ride_account_members where account_id=pg_temp.u('fam')),2::bigint,'a conta tem a administradora e uma participante');
select is((select count(*) from private.ride_payer_mandates where account_id=pg_temp.u('fam') and status='active' and payer_id=tests.uid('client_a')),1::bigint,
 'a adesão cria um único mandato com a dona da conta como pagadora');
update private.ride_account_invites set expires_at=now()-interval '1 minute' where id=pg_temp.u('inv_a_key');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_join_account(pg_temp.g('inv_a'),true)$$,'P0001','ride_invite_unavailable','convite vencido não vale');
select tests.authenticate_as('client_a');
insert into t select 'inv_a2',public.ride_invite_member(pg_temp.u('fam'),'provider_a@test.local','member',60,pg_temp.u('inv_a2_key'))->>'token';
select tests.authenticate_as('provider_a');
select is(public.ride_join_account(pg_temp.g('inv_a2'),true),'accepted','novo convite permite a adesão');
insert into t select 'm_a',public.ride_my_accounts()->0->>'mandate_id';
select throws_ok($$select public.ride_set_member_limit(pg_temp.u('fam'),tests.uid('provider_a'),100000)$$,'P0001','ride_account_role_required','participante não define limites');
select throws_ok($$select public.ride_set_account_limit(pg_temp.u('fam'),100000,'pix')$$,'P0001','ride_account_role_required','participante não muda o limite da conta');
select throws_ok($$select public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_b'))$$,'P0001','not_allowed','ninguém usa o mandato de outra pessoa');
select tests.authenticate_as('provider_d');
insert into t select 'fam2',public.ride_create_family('Outra família',50000,'card',gen_random_uuid())::text;
select throws_ok($$select public.ride_account_statement(pg_temp.u('fam'),null)$$,'P0001','ride_account_role_required','administradora de outra conta não lê este extrato');
select throws_ok($$select public.ride_set_member_limit(pg_temp.u('fam'),tests.uid('client_b'),1)$$,'P0001','ride_account_role_required','administradora de outra conta não mexe nos limites');
select throws_ok($$select public.ride_remove_member(pg_temp.u('fam'),tests.uid('client_b'),gen_random_uuid())$$,'P0001','ride_account_role_required','administradora de outra conta não remove ninguém');
select tests.authenticate_anon();
select throws_ok($$select public.ride_my_accounts()$$,'42501',null,'visitante sem sessão não chama as contas');
select throws_ok($$select public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),gen_random_uuid())$$,'42501',null,'visitante sem sessão não cota com mandato');
select tests.authenticate_as('client_b');
select throws_ok($$select private.ride_apply_mandate(gen_random_uuid(),gen_random_uuid())$$,'42501',null,'rotina privada não é chamada pelo cliente');
select throws_ok($$select * from private.ride_accounts$$,'42501',null,'as tabelas de contas não são lidas pelo cliente');
select throws_ok($$select * from private.ride_leg_funding$$,'42501',null,'o financiamento não é lido pelo cliente');

-- B4.5 · Participante vê o trajeto, sem preço; administradora vê preço, recibo e previsão, sem trajeto.
insert into t values('k1',gen_random_uuid()::text);
insert into t select 'q1',public.ride_quote_sponsored(pg_temp.u('k1'),null,pg_temp.trip(),pg_temp.u('m_b'))->>'id';
select is((public.ride_quote_sponsored(pg_temp.u('k1'),null,pg_temp.trip(),pg_temp.u('m_b'))->>'id')::uuid,pg_temp.u('q1'),'repetir a cotação devolve a mesma cotação');
select is(pg_temp.dash_quote(pg_temp.u('q1'))->>'total_cents',null,'participante não vê o total da cotação');
select is(pg_temp.dash_quote(pg_temp.u('q1'))#>>'{legs,0,fare_cents}',null,'participante não vê o preço do trecho');
select is(pg_temp.dash_quote(pg_temp.u('q1'))#>>'{legs,0,origin}','Saúde','participante vê o próprio trajeto');
select is(pg_temp.dash_quote(pg_temp.u('q1'))#>>'{funding,role}','rider','participante é quem viaja');
select is(pg_temp.dash_quote(pg_temp.u('q1'))#>>'{funding,mandate_kind}','family','a cotação informa o perfil familiar');
select is(pg_temp.dash_quote(pg_temp.u('q1'))#>>'{funding,account_name}','Família de ensaio','a cotação informa a conta pagadora');
select tests.clear_authentication();
select is((select count(*) from private.ride_quote_funding where quote_id=pg_temp.u('q1')),1::bigint,'a repetição não duplica o financiamento');
insert into t select 'other_mandate',private.ride_grant_mandate('companion',tests.uid('client_b'),tests.uid('provider_e'),100000,null,null)::text;
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_quote_sponsored(pg_temp.u('k1'),null,pg_temp.trip(),pg_temp.u('other_mandate'))$$,'P0001','idempotency_conflict','mesma chave com outro mandato é conflito');
select tests.authenticate_as('client_a');
select is((pg_temp.dash_quote(pg_temp.u('q1'))->>'total_cents')::int,pg_temp.n('x'),'administradora vê o total que vai pagar');
select is(pg_temp.dash_quote(pg_temp.u('q1'))#>>'{legs,0,origin}','Reservado ao passageiro','administradora não vê o trajeto na cotação');
select is(pg_temp.dash_quote(pg_temp.u('q1'))#>>'{funding,role}','payer','administradora é quem paga');
select is(pg_temp.dash_quote(pg_temp.u('q1'))->>'accepted_by_me','true','o mandato registra o aceite permanente da pagadora dentro do limite');
select tests.authenticate_as('client_b');
insert into t select 'r1',public.ride_consent(pg_temp.u('q1'),true)->>'ride_id';
select ok(pg_temp.g('r1') is not null,'o aceite de quem viaja basta para pedir a corrida');
select tests.clear_authentication();
insert into t select 'leg1',id::text from public.ride_legs where ride_id=pg_temp.u('r1');
select is((select passenger_id from public.rides where id=pg_temp.u('r1')),tests.uid('client_b'),'passageira é quem cotou');
select is((select payer_id from public.ride_legs where id=pg_temp.u('leg1')),tests.uid('client_a'),'pagadora é a dona da conta');
select is((select account_id from private.ride_leg_funding where leg_id=pg_temp.u('leg1')),pg_temp.u('fam'),'o financiamento fica congelado no trecho');
select tests.authenticate_as('provider_c');
select lives_ok($$select public.ride_accept_offer(pg_temp.u('leg1'),gen_random_uuid())$$,'motorista do ensaio aceita a oferta');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))->'funding',null::jsonb,'motorista não recebe dado de financiamento');
select tests.authenticate_as('client_b');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))->>'fare_cents',null,'participante não vê o preço da corrida');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))->>'origin','Saúde','participante vê o trajeto da corrida');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))#>>'{funding,role}','rider','a corrida mostra à participante que ela viaja');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))->>'payer','family','a corrida mostra que a família paga');
select lives_ok($$select public.ride_issue_pin(pg_temp.u('leg1'))$$,'só quem viaja recebe o código de embarque');
select throws_ok($$select public.ride_open_payment_order(pg_temp.u('leg1'),'pix')$$,'P0001','not_allowed','participante não abre o pagamento da família');
select tests.authenticate_as('client_a');
select is((pg_temp.dash_leg(pg_temp.u('leg1'))->>'fare_cents')::int,pg_temp.n('x'),'administradora vê o preço da corrida');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))->>'origin','Reservado ao passageiro','administradora não vê o trajeto da corrida');
select ok((pg_temp.dash_leg(pg_temp.u('leg1'))->>'pickup_estimate') is not null,'administradora vê a previsão de chegada');
select is(pg_temp.dash_leg(pg_temp.u('leg1'))#>>'{funding,role}','payer','a corrida mostra à administradora que ela paga');
select throws_ok($$select public.ride_issue_pin(pg_temp.u('leg1'))$$,'P0001','not_allowed','a pagadora não recebe o código de embarque');
insert into t select 'o1',public.ride_open_payment_order(pg_temp.u('leg1'),'pix')::text;
select ok(public.ride_order_receipt(pg_temp.u('o1')) is not null,'administradora consulta o recibo do pagamento');
select is((pg_temp.line(public.ride_account_statement(pg_temp.u('fam'),null),pg_temp.u('leg1'))->>'order_id')::uuid,pg_temp.u('o1'),'o extrato liga a corrida ao pagamento da administradora');
select tests.authenticate_as('client_b');
select is(public.ride_order_receipt(pg_temp.u('o1')),null::jsonb,'participante não consulta o recibo da pagadora');
select is(jsonb_array_length(public.ride_account_statement(pg_temp.u('fam'),null)->'rows'),1,'participante vê só as próprias corridas no extrato');
select is(pg_temp.line(public.ride_account_statement(pg_temp.u('fam'),null),pg_temp.u('leg1'))->>'fare_cents',null,'o extrato da participante não mostra preço');
select is(public.ride_account_statement(pg_temp.u('fam'),null)->>'total_cents',null,'o extrato da participante não mostra total');
select ok(not (public.ride_account_statement(pg_temp.u('fam'),null)::text ~ 'Saúde|Jabaquara'),'o extrato não leva local de embarque ou destino');

-- B4.1 · Dois participantes disputam a última parcela do limite: só um passa.
select tests.authenticate_as('provider_a');
insert into t select 'q2',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_a'))->>'id';
insert into t select 'r2',public.ride_consent(pg_temp.u('q2'),true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg2',id::text from public.ride_legs where ride_id=pg_temp.u('r2');
select tests.authenticate_as('client_b');
insert into t select 'q3',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_b'))->>'id';
select tests.authenticate_as('provider_a');
insert into t values('k_lost',gen_random_uuid()::text);
select throws_ok($$select public.ride_quote_sponsored(pg_temp.u('k_lost'),null,pg_temp.trip(),pg_temp.u('m_a'))$$,'P0001','ride_limit_exceeded',
 'a segunda pessoa a pedir a última parcela do limite é recusada');
select tests.clear_authentication();
select is((select count(*) from private.ride_quotes where request_key=pg_temp.u('k_lost')),0::bigint,'a recusa por limite não deixa cotação para trás');
select tests.authenticate_as('client_b');
insert into t select 'r3',public.ride_consent(pg_temp.u('q3'),true)->>'ride_id';
select throws_ok($$select public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_b'))$$,'P0001','ride_limit_exceeded','limite esgotado recusa nova corrida da mesma pessoa');
select tests.clear_authentication();
insert into t select 'leg3',id::text from public.ride_legs where ride_id=pg_temp.u('r3');

-- B4.2 · O extrato respeita o limite e fecha com a soma das tarifas dos trechos.
select tests.authenticate_as('client_a');
select is(jsonb_array_length(public.ride_account_statement(pg_temp.u('fam'),null)->'rows'),3,'administradora vê as corridas de todas as pessoas');
select ok((public.ride_account_statement(pg_temp.u('fam'),null)->>'total_cents')::int<=(public.ride_account_statement(pg_temp.u('fam'),null)->>'monthly_limit_cents')::int,
 'o total autorizado no extrato não passa do limite');
select is((public.ride_my_accounts()->0->>'committed_cents')::int,pg_temp.n('limit3'),'a conta mostra o limite todo comprometido');
select is(jsonb_array_length(public.ride_my_accounts()->0->'members'),3,'administradora vê as três pessoas da conta');
insert into t select 'o2',public.ride_open_payment_order(pg_temp.u('leg2'),'pix')::text;
insert into t select 'total_1',public.ride_account_statement(pg_temp.u('fam'),null)->>'total_cents';
select tests.clear_authentication();
select is(pg_temp.g('total_1')::bigint,
 (select sum(l.fare_cents) from public.ride_legs l join private.ride_leg_funding f on f.leg_id=l.id where f.account_id=pg_temp.u('fam') and l.status<>'cancelled'),
 'o total do extrato é a soma das tarifas dos trechos');
select is((select sum(l.fare_cents) from public.ride_legs l join private.ride_leg_funding f on f.leg_id=l.id where f.account_id=pg_temp.u('fam')),
 pg_temp.n('limit3')::bigint,'as três corridas somam exatamente o limite');

-- Limite por pessoa e limite reduzido entre a cotação e o aceite.
select tests.authenticate_as('client_a');
select ok(public.ride_set_account_limit(pg_temp.u('fam'),pg_temp.n('limit10'),'card'),'administradora aumenta o limite e troca o meio de pagamento');
select ok(public.ride_set_member_limit(pg_temp.u('fam'),tests.uid('provider_a'),pg_temp.n('x')),'administradora define o limite de uma pessoa');
select throws_ok($$select public.ride_set_member_limit(pg_temp.u('fam'),tests.uid('provider_b'),100)$$,'P0001','invalid_input','limite só para quem é da conta');
select throws_ok($$select public.ride_set_account_limit(pg_temp.u('fam'),-1,'pix')$$,'P0001','invalid_input','limite negativo é recusado');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_a'))$$,'P0001','ride_limit_exceeded','o limite da pessoa é respeitado');
select is((public.ride_my_accounts()->0->>'member_limit_cents')::int,pg_temp.n('x'),'a pessoa vê o próprio limite');
select tests.authenticate_as('client_a');
select ok(public.ride_set_member_limit(pg_temp.u('fam'),tests.uid('provider_a'),null),'administradora retira o limite da pessoa');
select tests.authenticate_as('provider_a');
insert into t select 'q5',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_a'))->>'id';
select tests.authenticate_as('client_b');
insert into t select 'q6',public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_b'))->>'id';
select tests.authenticate_as('client_a');
select ok(public.ride_set_account_limit(pg_temp.u('fam'),pg_temp.n('limit3'),'card'),'administradora reduz o limite com cotações pendentes');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_consent(pg_temp.u('q6'),true)$$,'P0001','ride_limit_exceeded','limite reduzido vale também no aceite da cotação pendente');
select tests.authenticate_as('client_a');
select ok(public.ride_set_account_limit(pg_temp.u('fam'),pg_temp.n('limit10'),'card'),'administradora restaura o limite');
select tests.clear_authentication();
update private.ride_party_rules set enabled=false where environment='simulation' and capability='family' and area='Jabaquara';
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_b'))$$,'P0001','ride_feature_disabled','praça sem habilitação fecha o perfil familiar');
select tests.clear_authentication();
update private.ride_party_rules set enabled=true where environment='simulation' and capability='family' and area='Jabaquara';

-- B4.3 e B4.4 · Pessoa removida perde o acesso; corridas e cobranças anteriores ficam.
insert into t select 'legs_before',count(*)::text from public.ride_legs l join private.ride_leg_funding f on f.leg_id=l.id where f.account_id=pg_temp.u('fam');
insert into t values('rk',gen_random_uuid()::text);
select tests.authenticate_as('provider_b');
select throws_ok($$select public.ride_remove_member(pg_temp.u('fam'),tests.uid('provider_a'),gen_random_uuid())$$,'P0001','ride_account_role_required','quem não é da conta não remove ninguém');
select tests.authenticate_as('client_b');
select throws_ok($$select public.ride_remove_member(pg_temp.u('fam'),tests.uid('provider_a'),gen_random_uuid())$$,'P0001','ride_account_role_required','participante não remove outra pessoa');
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_remove_member(pg_temp.u('fam'),tests.uid('client_a'),gen_random_uuid())$$,'P0001','ride_account_role_required','a dona da conta não se remove');
select ok(public.ride_remove_member(pg_temp.u('fam'),tests.uid('provider_a'),pg_temp.u('rk')),'administradora remove a pessoa');
select ok(public.ride_remove_member(pg_temp.u('fam'),tests.uid('provider_a'),pg_temp.u('rk')),'repetir a remoção devolve o mesmo resultado');
select throws_ok($$select public.ride_remove_member(pg_temp.u('fam'),tests.uid('client_b'),pg_temp.u('rk'))$$,'P0001','idempotency_conflict','mesma chave para outra pessoa é conflito');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_quote_sponsored(gen_random_uuid(),null,pg_temp.trip(),pg_temp.u('m_a'))$$,'P0001','ride_mandate_revoked','pessoa removida não cota mais pela família');
select throws_ok($$select public.ride_account_statement(pg_temp.u('fam'),null)$$,'P0001','ride_account_role_required','pessoa removida não lê mais o extrato');
select throws_ok($$select public.ride_consent(pg_temp.u('q5'),true)$$,'P0001','ride_mandate_revoked','cotação pendente da pessoa removida não vira corrida');
select is(jsonb_array_length(public.ride_my_accounts()),0,'pessoa removida não vê mais a conta');
select tests.clear_authentication();
select is((select status from private.ride_payer_mandates where id=pg_temp.u('m_a')),'revoked','a remoção revoga o mandato');
select is((select count(*)::text from public.ride_legs l join private.ride_leg_funding f on f.leg_id=l.id where f.account_id=pg_temp.u('fam')),pg_temp.g('legs_before'),
 'a remoção não apaga corridas nem financiamento anteriores');
select is((select status from public.ride_legs where id=pg_temp.u('leg2')),'requested','a corrida anterior da pessoa removida segue como estava');
select is((select count(*) from private.ride_payment_orders where id=pg_temp.u('o2') and payer=tests.uid('client_a')),1::bigint,'a cobrança anterior continua existindo');
select tests.authenticate_as('client_a');
select is((pg_temp.line(public.ride_account_statement(pg_temp.u('fam'),null),pg_temp.u('leg2'))->>'order_id')::uuid,pg_temp.u('o2'),'administradora ainda vê a corrida e a cobrança da pessoa removida');
select is(jsonb_array_length(public.ride_order_desk(pg_temp.u('leg2'))->'orders'),1,'administradora ainda abre o pagamento anterior');
select is((select m->>'status' from jsonb_array_elements(public.ride_my_accounts()->0->'members') m where m->>'member_id'=tests.uid('provider_a')::text),'removed','a lista registra a pessoa como removida');
insert into t values('inv_a3_key',gen_random_uuid()::text);
insert into t select 'inv_a3',public.ride_invite_member(pg_temp.u('fam'),'provider_a@test.local','member',60,pg_temp.u('inv_a3_key'))->>'token';
select ok(public.ride_revoke_account_invite(pg_temp.u('inv_a3_key')),'administradora revoga um convite pendente');
select tests.authenticate_as('provider_a');
select throws_ok($$select public.ride_join_account(pg_temp.g('inv_a3'),true)$$,'P0001','ride_invite_unavailable','convite revogado não permite voltar');
select tests.authenticate_as('client_a');
insert into t select 'inv_a4',public.ride_invite_member(pg_temp.u('fam'),'provider_a@test.local','member',60,gen_random_uuid())->>'token';
select tests.authenticate_as('provider_a');
select is(public.ride_join_account(pg_temp.g('inv_a4'),true),'accepted','nova adesão devolve o acesso');
select ok((public.ride_my_accounts()->0->>'mandate_id')::uuid<>pg_temp.u('m_a'),'a nova adesão cria outro mandato');
select tests.authenticate_as('client_a');
select ok(public.ride_remove_member(pg_temp.u('fam'),tests.uid('provider_a'),pg_temp.u('rk')),'a chave antiga de remoção continua devolvendo o resultado guardado');
select tests.clear_authentication();
select is((select status from private.ride_account_members where account_id=pg_temp.u('fam') and member_id=tests.uid('provider_a')),'active','a repetição antiga não remove de novo');

-- B4.6 · Alteração que aumenta a tarifa exige o aceite expresso da administradora.
select tests.authenticate_as('client_b');
insert into t select 'route1',public.ride_prepare_route(gen_random_uuid(),null,'Saúde','Jabaquara',
 pg_temp.point(-23.60,-46.64,'Embarque de ensaio'),pg_temp.point(-23.61,-46.65,'Destino de ensaio'),null)->>'id';
insert into t select 'route2',public.ride_prepare_route(gen_random_uuid(),null,'Saúde','Jabaquara',
 pg_temp.point(-23.60,-46.64,'Embarque de ensaio'),pg_temp.point(-23.62,-46.66,'Destino alterado'),null)->>'id';
select tests.authenticate_as('admin');
select public.ride_claim_route(pg_temp.u('route1'));
select public.ride_verify_route(pg_temp.u('route1'),2000,12,'ensaio/205b-1');
select public.ride_claim_route(pg_temp.u('route2'));
select public.ride_verify_route(pg_temp.u('route2'),3500,14,'ensaio/205b-2');
select tests.authenticate_as('client_b');
insert into t select 'q7',public.ride_quote_sponsored(gen_random_uuid(),null,
 jsonb_build_array(jsonb_build_object('origin','Saúde','destination','Jabaquara','route_id',pg_temp.g('route1'),'payer','passenger')),pg_temp.u('m_b'))->>'id';
insert into t select 'r7',public.ride_consent(pg_temp.u('q7'),true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg7',id::text from public.ride_legs where ride_id=pg_temp.u('r7');
insert into t select 'fare7',fare_cents::text from public.ride_legs where id=pg_temp.u('leg7');
select tests.authenticate_as('client_b');
insert into t select 'change',public.ride_propose_amendment(pg_temp.u('leg7'),pg_temp.u('route2'),gen_random_uuid())->>'id';
select is(public.ride_decide_amendment(pg_temp.u('change'),true)->>'status','pending','o aceite de quem viaja não basta para aumentar a tarifa');
select is(public.ride_amendment_state(pg_temp.u('leg7'))#>>'{changes,0,fare_cents}',null,'participante não vê o novo preço');
select tests.clear_authentication();
select is((select fare_cents::text from public.ride_legs where id=pg_temp.u('leg7')),pg_temp.g('fare7'),'sem o aceite da administradora a tarifa não muda');
insert into t select 'tight',(private.ride_account_commitment(pg_temp.u('fam'),null,private.ride_month(now()),tests.uid('client_b'))+100)::text;
select tests.authenticate_as('client_a');
select ok((public.ride_amendment_state(pg_temp.u('leg7'))#>>'{changes,0,fare_cents}')::int>pg_temp.n('fare7'),'administradora vê a tarifa maior antes de decidir');
select is(public.ride_amendment_state(pg_temp.u('leg7'))#>>'{changes,0,may_decide}','true','a decisão cabe também à administradora');
select ok(public.ride_set_account_limit(pg_temp.u('fam'),pg_temp.n('tight'),'card'),'administradora aperta o limite antes de decidir');
select throws_ok($$select public.ride_decide_amendment(pg_temp.u('change'),true)$$,'P0001','ride_limit_exceeded','nem o aceite expresso passa do limite autorizado');
select ok(public.ride_set_account_limit(pg_temp.u('fam'),pg_temp.n('limit10'),'card'),'administradora volta a autorizar o valor');
select is(public.ride_decide_amendment(pg_temp.u('change'),true)->>'status','applied','o aceite expresso da administradora aplica a alteração');
select tests.clear_authentication();
select ok((select fare_cents from public.ride_legs where id=pg_temp.u('leg7'))>pg_temp.n('fare7'),'a tarifa maior só vale depois do aceite da administradora');
select is((select payer_id from public.ride_legs where id=pg_temp.u('leg7')),tests.uid('client_a'),'a alteração mantém a pagadora');
select tests.authenticate_as('client_a');
select is((pg_temp.line(public.ride_account_statement(pg_temp.u('fam'),null),pg_temp.u('leg7'))->>'fare_cents')::int,
 (public.ride_amendment_state(pg_temp.u('leg7'))->>'current_cents')::int,'o extrato passa a mostrar a tarifa alterada');
insert into t select 'total_2',public.ride_account_statement(pg_temp.u('fam'),null)->>'total_cents';
select tests.clear_authentication();
select is(pg_temp.g('total_2')::bigint,
 (select sum(l.fare_cents) from public.ride_legs l join private.ride_leg_funding f on f.leg_id=l.id where f.account_id=pg_temp.u('fam') and l.status<>'cancelled'),
 'depois da alteração o extrato continua igual à soma das tarifas');

-- Corrida cancelada devolve a parcela ao limite, sem apagar a linha do extrato.
select tests.authenticate_as('client_a');
insert into t select 'before_cancel',public.ride_my_accounts()->0->>'committed_cents';
select lives_ok($$select public.ride_transition(pg_temp.u('leg3'),'cancelled',gen_random_uuid())$$,'a pagadora pode cancelar a corrida que financia');
select is((public.ride_my_accounts()->0->>'committed_cents')::int,pg_temp.n('before_cancel')-pg_temp.n('x'),'o cancelamento libera a parcela do limite');
select is(pg_temp.line(public.ride_account_statement(pg_temp.u('fam'),null),pg_temp.u('leg3'))->>'counted','false','a corrida cancelada fica no extrato sem somar');

-- Contas que dependem de conferência: organização só opera depois da revisão.
select tests.clear_authentication();
insert into private.ride_accounts(id,environment,kind,owner_id,name,request_key,request_hash)
 values(md5('org-205b')::uuid,'simulation','organization',tests.uid('provider_d'),'Empresa de ensaio',gen_random_uuid(),'\x00');
insert into private.ride_account_members(account_id,member_id,role) values(md5('org-205b')::uuid,tests.uid('provider_d'),'admin');
insert into t values('org',md5('org-205b')::uuid::text);
select tests.authenticate_as('provider_d');
select throws_ok($$select public.ride_invite_member(pg_temp.u('org'),'provider_e@test.local','member',60,gen_random_uuid())$$,'P0001','ride_feature_disabled','organização sem conferência não convida');
select throws_ok($$select public.admin_verify_ride_account(pg_temp.u('org'),'CONTRATO-205B',now()+interval '30 days')$$,'P0001','not_allowed','a própria empresa não se confere');
select tests.authenticate_as('admin');
select throws_ok($$select public.admin_verify_ride_account(pg_temp.u('fam'),'CONTRATO-205B',now()+interval '30 days')$$,'P0001','invalid_input','família não passa por conferência');
select throws_ok($$select public.admin_verify_ride_account(pg_temp.u('org'),'CONTRATO-205B',now()-interval '1 day')$$,'P0001','invalid_input','validade passada é recusada');
select ok(public.admin_verify_ride_account(pg_temp.u('org'),'CONTRATO-205B',now()+interval '30 days'),'a operação confere a organização com referência e validade');
select tests.clear_authentication();
select is((select count(*) from public.audit_log where action='ride.account_verify' and entity_id=pg_temp.g('org')),1::bigint,'a conferência fica na trilha de auditoria');
select tests.authenticate_as('provider_d');
select is((select a->>'verified' from jsonb_array_elements(public.ride_my_accounts()) a where a->>'id'=pg_temp.g('org')),'true','a organização passa a constar como conferida pela operação');
select ok((public.ride_invite_member(pg_temp.u('org'),'provider_e@test.local','operator',60,gen_random_uuid())->>'token') is not null,'organização conferida convida operador');
select tests.authenticate_as('admin');
select ok(not public.admin_verify_ride_account(pg_temp.u('org'),'CONTRATO-205B',null),'a operação retira a conferência');
select tests.authenticate_as('provider_d');
select throws_ok($$select public.ride_invite_member(pg_temp.u('org'),'provider_e@test.local','member',60,gen_random_uuid())$$,'P0001','ride_feature_disabled','sem conferência vigente a organização volta a ficar fechada');

-- Ponto único de reescrita e leitura genérica do financiamento (usados pelos próximos pacotes).
select tests.clear_authentication();
select throws_ok($$select private.ride_requote_legs(pg_temp.u('q1'),(select legs from private.ride_quotes where id=pg_temp.u('q1')),array[tests.uid('client_b')])$$,
 'P0001','quote_unavailable','cotação já aceita não é reescrita');
select throws_ok($$select private.ride_requote_legs(pg_temp.u('plain'),jsonb_set((select legs from private.ride_quotes where id=pg_temp.u('plain')),'{0,origin}','"Vila Mariana"'),array[tests.uid('provider_b')])$$,
 'P0001','invalid_input','a reescrita não muda o itinerário');
select throws_ok($$select private.ride_requote_legs(pg_temp.u('plain'),jsonb_set((select legs from private.ride_quotes where id=pg_temp.u('plain')),'{0,fare_cents}','1'),array[tests.uid('provider_b')])$$,
 'P0001','invalid_input','a reescrita mantém tarifa igual a comissão mais repasse');
select throws_ok($$select private.ride_requote_legs(pg_temp.u('plain'),(select legs from private.ride_quotes where id=pg_temp.u('plain')),array[tests.uid('client_a')])$$,
 'P0001','invalid_input','quem viaja continua obrigado a aceitar');
select is((private.ride_requote_legs(pg_temp.u('plain'),(select legs from private.ride_quotes where id=pg_temp.u('plain')),array[tests.uid('provider_b')])).total_cents,
 pg_temp.n('x'),'reescrita sem mudança recalcula o mesmo total');
select is((private.ride_fund_voucher_quote(pg_temp.u('plain'),pg_temp.u('org'),null,null,null,
  jsonb_build_object('1',jsonb_build_object('voucher_cents',1000,'excess_cents',pg_temp.n('x')-1000)))).payer_id,tests.uid('provider_b'),
 'no financiamento corporativo quem viaja continua sendo o pagador');
select is((private.ride_fund_voucher_quote(pg_temp.u('plain'),pg_temp.u('org'),null,null,null,
  jsonb_build_object('1',jsonb_build_object('voucher_cents',1000,'excess_cents',pg_temp.n('x')-1000)))).quote_id,pg_temp.u('plain'),
 'repetir a declaração de financiamento devolve a mesma linha');
select throws_ok($$select private.ride_fund_voucher_quote(pg_temp.u('plain'),pg_temp.u('org'),null,null,null,'{"1":{"voucher_cents":1}}')$$,
 'P0001','idempotency_conflict','financiamento diferente para a mesma cotação é conflito');
select throws_ok($$select private.ride_fund_voucher_quote(pg_temp.u('q1'),pg_temp.u('org'),null,null,null,'{}')$$,
 'P0001','idempotency_conflict','cotação com mandato não vira voucher');
select tests.authenticate_as('provider_b');
select is((pg_temp.dash_quote(pg_temp.u('plain'))#>>'{legs,0,voucher_cents}')::int,1000,'a cotação mostra o valor coberto pelo voucher planejado');
select is((pg_temp.dash_quote(pg_temp.u('plain'))#>>'{funding,excess_cents}')::int,pg_temp.n('x')-1000,'a cotação mostra o excedente antes do aceite');
select is((pg_temp.dash_quote(pg_temp.u('plain'))->>'total_cents')::int,pg_temp.n('x'),'quem paga o excedente continua vendo o total');
insert into t select 'r_plain',public.ride_consent(pg_temp.u('plain'),true)->>'ride_id';
select tests.clear_authentication();
insert into t select 'leg_plain',id::text from public.ride_legs where ride_id=pg_temp.u('r_plain');
select is((select planned from private.ride_leg_funding where leg_id=pg_temp.u('leg_plain')),
 jsonb_build_object('voucher_cents',1000,'excess_cents',pg_temp.n('x')-1000),'o trecho congela o planejado do próprio trecho');
select tests.authenticate_as('provider_b');
select is((pg_temp.dash_leg(pg_temp.u('leg_plain'))#>>'{funding,voucher_cents}')::int,1000,'a corrida mostra o voucher planejado a quem paga');
select is(pg_temp.dash_leg(pg_temp.u('leg_plain'))#>>'{funding,kind}','voucher','a corrida informa o tipo de financiamento');
select tests.clear_authentication();
select * from finish();
rollback;
