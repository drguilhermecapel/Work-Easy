-- O17 etapa 6 · correções da revisão final (110610). Cada bloco falha sem a correção.
-- Identidades e áreas fictícias do ensaio; sem rede, sem PSP e sem depender da hora do dia.
begin;
select no_plan();
select tests.setup_fixture();
update private.ride_network set module_enabled=true,quote_enabled=true,dispatch_enabled=true where environment='simulation';
create temp table t(k text primary key,id uuid,data jsonb);
grant all on t to authenticated;
create function pg_temp.id(p text) returns uuid language sql stable as $$select id from t where k=p$$;
create function pg_temp.key(p text) returns uuid language sql immutable as $$select md5('206h:'||p)::uuid$$;
create function pg_temp.trip(p_origin text,p_destination text) returns jsonb language sql immutable as
 $$select jsonb_build_array(jsonb_build_object('origin',p_origin,'destination',p_destination,'payer','passenger'))$$;
grant execute on function pg_temp.id(text),pg_temp.key(text),pg_temp.trip(text,text) to authenticated;
create function pg_temp.request(p_label text,p_origin text,p_destination text,p_at timestamptz) returns void language plpgsql as $$
declare q uuid;
begin
 q:=(public.ride_quote(pg_temp.key('quote:'||p_label),null,p_at,pg_temp.trip(p_origin,p_destination))->>'id')::uuid;
 insert into t(k,id) values(p_label||':quote',q),(p_label||':ride',(public.ride_consent(q,true)->>'ride_id')::uuid);
end $$;
create function pg_temp.legs() returns void language sql as $$
 insert into t(k,id) select split_part(t.k,':',1),l.id from t join public.ride_legs l on l.ride_id=t.id where t.k like '%:ride' on conflict do nothing $$;
-- A regra de espera que o encargo de espera lê: price_rules[quote_seq] da cotação de origem.
create function pg_temp.wait(p_leg uuid) returns jsonb language sql stable as $$
 select jsonb_build_array((q.price_rules->(l.quote_seq::text)->>'free_wait_minutes')::int,(q.price_rules->(l.quote_seq::text)->>'assisted_boarding_minutes')::int)
 from public.ride_legs l join private.ride_quotes q on q.id=l.source_quote_id where l.id=p_leg $$;
-- Motorista fictício capacitado para embarque assistido, em turno na Saúde.
select tests.create_user('assist_206h');
insert into public.ride_drivers(id,environment,vehicle,status,valid_until,reviewed_by,online)
 values(tests.uid('assist_206h'),'simulation','sedan','approved',private.sp_date(now())+3,tests.uid('admin'),true);
insert into private.ride_driver_credentials(driver_id,vehicle_identifier,vehicle_category,driver_document_ref,vehicle_document_ref,insurance_ref,
  driver_until,vehicle_until,insurance_until,inspected_by)
 values(tests.uid('assist_206h'),'VEI-206H','sedan','DOC-206H','VEI-206H','SEG-206H',private.sp_date(now())+3,private.sp_date(now())+3,private.sp_date(now())+3,tests.uid('admin'));
insert into private.ride_assist_capabilities values(tests.uid('assist_206h'),'VEI-206H','boarding','CURSO-206H','VIST-206H',now()+interval '1 day');
insert into private.ride_driver_shifts(driver_id,area,period) values(tests.uid('assist_206h'),'Saúde',tstzrange(now()-interval '5 minutes',now()+interval '3 hours'));
-- Regra de demanda fictícia Saúde → Jabaquara: 3 min de espera grátis, R$ 1,00 por minuto depois.
insert into private.ride_demand_rates(environment,origin,destination,validity,multiplier_bps,free_wait_minutes,wait_cents_per_minute,absence_policy,evidence_ref)
 values('simulation','Saúde','Jabaquara',tstzrange(now()-interval '1 hour',now()+interval '1 day'),10000,3,100,'Espera fictícia de ensaio.','ficticio-206h');

-- ── Espera: a assistência pedida no trecho à espera de motorista não vira espera cobrada.
select tests.authenticate_as('client_a');
select pg_temp.request('plain','Saúde','Jabaquara',null);
insert into t(k,id) values('qb',(public.ride_quote_accessible(pg_temp.key('qb'),null,null,pg_temp.trip('Saúde','Jabaquara'),'boarding',false)->>'id')::uuid);
insert into t(k,id) values('door:ride',(public.ride_consent(pg_temp.id('qb'),true)->>'ride_id')::uuid);
select tests.clear_authentication();
select pg_temp.legs();
select is(pg_temp.wait(pg_temp.id('plain')),'[3,null]'::jsonb,'sem assistência a franquia é a da regra');
select tests.authenticate_as('client_a');
select is(public.ride_set_access(pg_temp.id('plain'),'text','boarding',false)->>'available','true','o trecho à espera de motorista recebe o embarque assistido');
select tests.clear_authentication();
select is((select boarding_minutes::int from private.ride_access_preferences where leg=pg_temp.id('plain')),3,'o trecho guarda os 3 minutos de embarque da área');
select is(pg_temp.wait(pg_temp.id('plain')),'[6,3]'::jsonb,'a franquia de espera soma os 3 minutos de embarque aos 3 da regra');
select tests.authenticate_as('client_a');
select public.ride_set_access(pg_temp.id('plain'),'visual','boarding',true);
select tests.clear_authentication();
select is(pg_temp.wait(pg_temp.id('plain')),'[6,3]'::jsonb,'repetir a mesma assistência não soma de novo');
select tests.authenticate_as('client_a');
select public.ride_set_access(pg_temp.id('plain'),'text','none',false);
select tests.clear_authentication();
select is(pg_temp.wait(pg_temp.id('plain')),'[3,null]'::jsonb,'sem assistência a regra volta à própria franquia');
select tests.authenticate_as('client_a');
select public.ride_set_access(pg_temp.id('plain'),'text','boarding',false);
select tests.clear_authentication();
select is(pg_temp.wait(pg_temp.id('plain')),'[6,3]'::jsonb,'pedir de novo concede os minutos uma única vez');
select is(pg_temp.wait(pg_temp.id('door')),'[6,3]'::jsonb,'o trecho cotado pela porta acessível já chega com a franquia somada');
select tests.authenticate_as('client_a');
select public.ride_set_access(pg_temp.id('door'),'text','none',false);
select tests.clear_authentication();
select is(pg_temp.wait(pg_temp.id('door')),'[3,null]'::jsonb,'retirar a assistência cotada devolve a franquia da regra, sem ficar negativa nem dobrada');

-- ── Terminal: a corrida agendada que desembarca no terminal pode mudar o destino para uma área comum.
select tests.authenticate_as('client_a');
select pg_temp.request('air','Saúde','Terminal de ensaio',now()+interval '10 hours');
insert into t(k,id) values('rj',(public.ride_prepare_route(pg_temp.key('rj'),null,'Saúde','Jabaquara',
 '{"lat":-23.6172244,"lng":-46.6304177,"label":"Ponto Saúde (ensaio)"}','{"lat":-23.64,"lng":-46.64,"label":"Ponto Jabaquara (ensaio)"}',null)->>'id')::uuid);
select tests.authenticate_as('admin');
select public.ride_claim_route(pg_temp.id('rj')),public.ride_verify_route(pg_temp.id('rj'),3000,9,'t206h/rj');
select tests.clear_authentication();
select pg_temp.legs();
select is((select airport||' / '||terminal||' / '||state from private.ride_reserve_terms where leg_id=pg_temp.id('air')),
 'Aeroporto de ensaio / Terminal de ensaio / awaiting_driver','o desembarque no terminal congela aeroporto e terminal da reserva');
select tests.authenticate_as('client_a');
select lives_ok($$insert into t(k,id) values('amend',(public.ride_propose_amendment(pg_temp.id('air'),pg_temp.id('rj'),pg_temp.key('air-amend'))->>'id')::uuid)$$,
 'antes do embarque a reserva ao terminal muda o destino para uma área comum, como nas etapas 1 a 5');
select is(public.ride_amendment_state(pg_temp.id('air'))#>>'{changes,0,status}','pending','a mudança passa pelos consentimentos da etapa 1');
select is(public.ride_decide_amendment(pg_temp.id('amend'),true)->>'status','applied','o consentimento de quem viaja e paga aplica a mudança');
select tests.clear_authentication();
select is((select destination from public.ride_legs where id=pg_temp.id('air')),'Jabaquara','o trecho passa ao novo destino');
select is((select (airport is null and terminal is null)::text from private.ride_reserve_terms where leg_id=pg_temp.id('air')),'true',
 'fora do terminal a reserva deixa de ter aeroporto e terminal');

select * from finish();
rollback;
