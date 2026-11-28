-- O17 · DD122: teto de remarcações da reserva depois da contingência, por área.
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
create function pg_temp.key(p text) returns uuid language sql immutable as $$select md5('207b:'||p)::uuid$$;
create function pg_temp.request(p_label text,p_origin text,p_destination text,p_at timestamptz) returns void language plpgsql as $$
declare q uuid;
begin
 q:=(public.ride_quote(pg_temp.key('quote:'||p_label),null,p_at,jsonb_build_array(jsonb_build_object('origin',p_origin,'destination',p_destination,'payer','passenger')))->>'id')::uuid;
 insert into t values(p_label||':quote',q),(p_label||':ride',(public.ride_consent(q,true)->>'ride_id')::uuid);
end $$;
create function pg_temp.legs() returns void language sql as $$
 insert into t select split_part(t.k,':',1),l.id from t join public.ride_legs l on l.ride_id=t.id where t.k like '%:ride' on conflict do nothing $$;
-- Força a perda do prazo de confirmação do trecho, como o job de minuto faria.
create function pg_temp.miss(p_label text) returns void language plpgsql as $$
begin
 update private.ride_reserve_terms set confirm_by=now()-interval '1 minute' where leg_id=pg_temp.id(p_label);
 perform private.ride_reservation_check();
end $$;
insert into w values('r',now()+interval '2 hours'),('r1',now()+interval '4 hours'),('r2',now()+interval '5 hours'),('r3',now()+interval '6 hours'),
 ('z',now()+interval '3 hours'),('z1',now()+interval '7 hours');

-- Política: coluna com padrão 2, faixa 0 a 10, ensaio semeado e ao vivo sem linha.
select has_column('private','ride_reserve_policies','max_rebooks','a política da área tem o teto de remarcações');
select is((select count(*)::int from private.ride_reserve_policies where environment='simulation' and enabled and max_rebooks=2),
 (select count(*)::int from private.ride_reserve_policies where environment='simulation'),'o ensaio recebe o teto padrão de duas remarcações');
select is((select count(*)::int from private.ride_reserve_policies where environment='live'),0,'ao vivo continua sem política de reserva');
select throws_ok($$update private.ride_reserve_policies set max_rebooks=11 where environment='simulation'$$,'23514',null,'teto acima de 10 é recusado');
select throws_ok($$update private.ride_reserve_policies set max_rebooks=-1 where environment='simulation'$$,'23514',null,'teto negativo é recusado');

-- Trecho agendado que perde o prazo de confirmação.
select tests.authenticate_as('client_b');
select pg_temp.request('r','Jabaquara','Vila Mariana',pg_temp.at('r'));
select tests.clear_authentication();
select pg_temp.legs();
select pg_temp.miss('r');
select is((select state from private.ride_reserve_terms where leg_id=pg_temp.id('r')),'contingency','o trecho entra em contingência');

select tests.authenticate_as('client_b');
select is((public.ride_reserve_state(pg_temp.id('r'))->>'rebooks_left')::int,2,'antes de remarcar restam duas remarcações');
select is(public.ride_reserve_state(pg_temp.id('r'))->'choices','["keep_searching","rebook","cancel"]'::jsonb,'abaixo do teto as três escolhas são oferecidas');
select is((public.ride_reserve_state(pg_temp.id('r'))->>'max_rebooks')::int,2,'o estado informa o teto da área');
select is(public.ride_reserve_contingency(pg_temp.id('r'),'rebook',pg_temp.at('r1'),pg_temp.key('r-1'))->>'state','awaiting_driver','primeira remarcação aceita');
select is(public.ride_reserve_contingency(pg_temp.id('r'),'rebook',pg_temp.at('r1'),pg_temp.key('r-1'))->>'replayed','true','repetir a primeira remarcação devolve o resultado guardado');
select is((public.ride_reserve_state(pg_temp.id('r'))->>'rebooks_left')::int,1,'a repetição não conta de novo: resta uma');
select is(public.ride_reserve_state(pg_temp.id('r'))->'choices','[]'::jsonb,'fora da contingência não há escolhas a oferecer');
select tests.clear_authentication();
select pg_temp.miss('r');
select tests.authenticate_as('client_b');
select is(public.ride_reserve_contingency(pg_temp.id('r'),'rebook',pg_temp.at('r2'),pg_temp.key('r-2'))->>'state','awaiting_driver','segunda remarcação aceita');
select is((public.ride_reserve_state(pg_temp.id('r'))->>'rebooks_used')::int,2,'duas remarcações usadas');
select tests.clear_authentication();
select pg_temp.miss('r');
select tests.authenticate_as('client_b');
select is((public.ride_reserve_state(pg_temp.id('r'))->>'rebooks_left')::int,0,'no teto não resta remarcação');
select is(public.ride_reserve_state(pg_temp.id('r'))->'choices','["keep_searching","cancel"]'::jsonb,'no teto a remarcação some das escolhas');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('r'),'rebook',pg_temp.at('r3'),pg_temp.key('r-3'))$$,'P0001','ride_rebook_limit',
 'a terceira remarcação é recusada pelo teto');
select is(public.ride_reserve_contingency(pg_temp.id('r'),'rebook',pg_temp.at('r2'),pg_temp.key('r-2'))->>'replayed','true',
 'repetir a segunda remarcação no teto devolve o resultado guardado');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('r'),'rebook',pg_temp.at('r3'),pg_temp.key('r-2'))$$,'P0001','idempotency_conflict',
 'a mesma chave com outro horário continua sendo conflito');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('r'),'cancel',null,pg_temp.key('r-1'))$$,'P0001','idempotency_conflict',
 'reusar a chave de uma remarcação para cancelar é conflito');
select tests.clear_authentication();
select is((select count(*)::int from private.ride_reserve_events where leg_id=pg_temp.id('r') and action='rebook'),2,'a trilha tem exatamente duas remarcações');
select is((select pickup_at=pg_temp.at('r2') from public.ride_legs where id=pg_temp.id('r')),true,'a recusa pelo teto não move o trecho');
select is((select count(*)::int from private.ride_reserve_shifts where id=pg_temp.key('r-3')),0,'a recusa pelo teto não grava mudança de horário');

-- Permissões: outra pessoa não descobre o teto; auxiliares fechados a clientes; anônimo recusado.
select tests.authenticate_as('client_a');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('r'),'rebook',pg_temp.at('r3'),pg_temp.key('r-a'))$$,'P0001','not_allowed',
 'outra pessoa recebe not_allowed, não o teto');
select throws_ok($$select private.ride_rebooks_left(pg_temp.id('r'))$$,'42501',null,'cliente não executa o contador');
select throws_ok($$select private.ride_reserve_contingency_before_rebook_cap(pg_temp.id('r'),'cancel',null,gen_random_uuid())$$,'42501',null,
 'cliente não chama a função envolvida e contorna o teto');
select throws_ok($$select private.ride_reserve_state_before_rebook_cap(pg_temp.id('r'))$$,'42501',null,'cliente não chama a leitura envolvida');
select tests.authenticate_anon();
select throws_ok($$select public.ride_reserve_contingency(gen_random_uuid(),'rebook',now()+interval '1 day',gen_random_uuid())$$,'42501',null,'anônimo não remarca');
select throws_ok($$select public.ride_reserve_state(gen_random_uuid())$$,'42501',null,'anônimo não lê o teto');
select tests.clear_authentication();
select is((select array_agg(r.rolname::text order by r.rolname) from pg_proc p cross join pg_roles r
 where p.oid in ('private.ride_rebooks_left(uuid)'::regprocedure,'private.ride_reserve_contingency_before_rebook_cap(uuid,text,timestamptz,uuid)'::regprocedure,
   'private.ride_reserve_state_before_rebook_cap(uuid)'::regprocedure)
   and r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.oid,p.oid,'execute')),null,
 'os auxiliares do teto não são executáveis por anon, authenticated nem service_role');

-- No teto continuar buscando e cancelar seguem disponíveis.
select tests.authenticate_as('client_b');
select is(public.ride_reserve_contingency(pg_temp.id('r'),'keep_searching',null,pg_temp.key('r-keep'))->>'state','contingency','no teto continuar buscando segue aceito');
select is(public.ride_reserve_contingency(pg_temp.id('r'),'cancel',null,pg_temp.key('r-cancel'))->>'state','released','no teto cancelar segue aceito');
select is(public.ride_reserve_state(pg_temp.id('r'))->'choices','[]'::jsonb,'reserva encerrada não oferece escolhas');
select tests.clear_authentication();

-- Teto zero na área: nenhuma remarcação, mesmo na primeira contingência.
update private.ride_reserve_policies set max_rebooks=0 where environment='simulation' and area='Saúde';
select tests.authenticate_as('client_b');
select pg_temp.request('z','Saúde','Jabaquara',pg_temp.at('z'));
select tests.clear_authentication();
select pg_temp.legs();
select pg_temp.miss('z');
select tests.authenticate_as('client_b');
select is(public.ride_reserve_state(pg_temp.id('z'))->'choices','["keep_searching","cancel"]'::jsonb,'com teto zero a área não oferece remarcação');
select throws_ok($$select public.ride_reserve_contingency(pg_temp.id('z'),'rebook',pg_temp.at('z1'),pg_temp.key('z-1'))$$,'P0001','ride_rebook_limit',
 'com teto zero a primeira remarcação é recusada');
select tests.clear_authentication();
-- Subir o teto da área libera a remarcação do mesmo trecho: o teto é lido da política vigente.
update private.ride_reserve_policies set max_rebooks=1 where environment='simulation' and area='Saúde';
select tests.authenticate_as('client_b');
select is(public.ride_reserve_contingency(pg_temp.id('z'),'rebook',pg_temp.at('z1'),pg_temp.key('z-1'))->>'state','awaiting_driver',
 'com o teto ajustado a mesma chave é aceita, pois a recusa não guardou resposta');
select tests.clear_authentication();

select * from finish();
rollback;
