-- O17 stage 6: market and modality catalog. A market states language, currency and
-- IANA timezone; a modality is requestable only with an operational flow in this
-- schema AND an unexpired authorization row for the market. Nothing is enabled in
-- live: it gets inventory rows only. The base car modality keeps the O16 gates.
create table private.ride_markets(
 environment text not null references private.ride_network(environment),code text not null check(code ~ '^[a-z0-9-]{2,40}$'),
 country text not null check(country ~ '^[A-Z]{2}$'),city text not null check(length(trim(city)) between 1 and 80),
 language text not null check(language ~ '^[a-z]{2}(-[A-Z]{2})?$'),currency text not null check(currency ~ '^[A-Z]{3}$'),
 minor_unit smallint not null check(minor_unit between 0 and 3),timezone text not null check(length(timezone) between 1 and 64),
 primary key(environment,code)
);
create function private.check_ride_market() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select from pg_catalog.pg_timezone_names z where z.name=new.timezone) then raise exception 'invalid_input'; end if;
 return new;
end $$;
create trigger ride_market_timezone before insert or update of timezone on private.ride_markets
 for each row execute function private.check_ride_market();
create table private.ride_market_areas(
 environment text not null,market text not null,area text not null check(length(trim(area)) between 1 and 120),
 primary key(environment,area),foreign key(environment,market) references private.ride_markets(environment,code)
);
-- The operational list is a schema fact: giving a flow to another code takes a
-- reviewed migration, never a data edit or an authorization row.
create table private.ride_modalities(
 code text primary key check(code ~ '^[a-z_]{2,24}$'),par text not null check(par ~ '^PAR-60[1-9]$'),
 label text not null check(length(trim(label)) between 1 and 80),operational boolean not null default false,
 flow text check(flow is null or flow ~ '^[a-z_]{2,24}$'),position smallint not null unique,
 constraint ride_modalities_flow_pinned check((not operational and flow is null) or (operational and flow is not null
   and code in ('car','assist','wav','reserve','airport','van','shuttle_seat','hourly','intercity')))
);
create table private.ride_market_modalities(
 environment text not null,market text not null,modality text not null references private.ride_modalities(code),
 status text not null default 'inventory' check(status in ('inventory','pilot','authorized')),
 source_url text not null check(source_url ~ '^https://' and length(source_url)<=300),consulted_on date not null,
 note text not null check(length(trim(note)) between 1 and 300),
 authorization_ref text check(authorization_ref is null or length(trim(authorization_ref)) between 1 and 160),valid_until timestamptz,
 open_from time,open_until time,
 roles text[] not null default '{passenger}' check(cardinality(roles) between 1 and 2 and roles <@ array['passenger','driver']),
 primary key(environment,market,modality),foreign key(environment,market) references private.ride_markets(environment,code),
 check(status='inventory' or (authorization_ref is not null and valid_until is not null)),
 check((open_from is null and open_until is null) or (open_from is not null and open_until is not null and open_from<>open_until))
);
-- The chosen modes of a quoted leg and their frozen copy on the leg. A leg with
-- no row is the base car ride and is never checked here.
create table private.ride_quote_modes(
 quote_id uuid not null references private.ride_quotes(id) on delete cascade,seq smallint not null check(seq between 1 and 4),
 modality text not null,environment text not null,market text not null,authorization_ref text not null,
 attached_at timestamptz not null default now(),primary key(quote_id,seq,modality),
 foreign key(environment,market,modality) references private.ride_market_modalities(environment,market,modality)
);
create table private.ride_leg_modes(
 leg_id uuid not null references public.ride_legs(id) on delete cascade,modality text not null,
 environment text not null,market text not null,authorization_ref text not null,quote_id uuid,
 frozen_at timestamptz not null default now(),primary key(leg_id,modality),
 foreign key(environment,market,modality) references private.ride_market_modalities(environment,market,modality)
);
do $$ declare t text; begin
 foreach t in array array['ride_markets','ride_market_areas','ride_modalities','ride_market_modalities','ride_quote_modes','ride_leg_modes'] loop
   execute format('alter table private.%I enable row level security',t);
   execute format('revoke all on private.%I from public,anon,authenticated,service_role',t);
 end loop;
end $$;

insert into private.ride_modalities(code,par,label,operational,flow,position) values
 ('car','PAR-601','Carro',true,'quote',1),('assist','PAR-602','Assistência no embarque',true,'access',2),
 ('wav','PAR-602','Veículo acessível',true,'access',3),('reserve','PAR-604','Reserva',true,'reserve',4),
 ('airport','PAR-604','Aeroporto',true,'airport',5),('van','PAR-604','Van individual',true,'class',6),
 ('shuttle_seat','PAR-604','Assento em linha de van',true,'shuttle',7),('hourly','PAR-606','Por hora',true,'block',8),
 ('intercity','PAR-606','Entre municípios',true,'intercity',9),
 ('taxi','PAR-603','Táxi',false,null,10),('moto','PAR-603','Moto',false,null,11),
 ('shared','PAR-605','Viagem compartilhada',false,null,12),('route_share','PAR-605','Corredor compartilhado',false,null,13),
 ('transit_info','PAR-607','Informação de transporte público',false,null,14),
 ('transit_ticket','PAR-607','Bilhete de transporte público',false,null,15),
 ('bike','PAR-607','Bicicleta',false,null,16),('scooter','PAR-607','Patinete',false,null,17),('boat','PAR-607','Barco',false,null,18),
 ('rental','PAR-608','Locação sem motorista',false,null,19),('autonomous','PAR-609','Veículo autônomo de parceiro',false,null,20);
insert into private.ride_markets(environment,code,country,city,language,currency,minor_unit,timezone)
 select e,'sao-paulo','BR','São Paulo','pt-BR','BRL',2,'America/Sao_Paulo' from unnest(array['simulation','live']) e;
-- Only the synthetic rehearsal areas belong to the simulation market. Live areas are provisioned with their authorization.
insert into private.ride_market_areas(environment,market,area)
 select 'simulation','sao-paulo',a.area from (
   select origin as area from private.ride_routes where environment='simulation'
   union select destination from private.ride_routes where environment='simulation'
   union select area from private.ride_route_areas where environment='simulation') a;
-- Inventory with the public references of O17 (consulted on 2026-11-27). Simulation
-- alone gets a fictitious pilot authorization, and only for modalities with a flow.
insert into private.ride_market_modalities(environment,market,modality,status,source_url,consulted_on,note,authorization_ref,valid_until)
select e.environment,'sao-paulo',m.code,case when e.environment='simulation' and m.operational then 'pilot' else 'inventory' end,
 s.source_url,date '2026-11-27',
 case when not m.operational then 'Somente catálogo, sem fluxo operacional. '
      when e.environment='simulation' then 'Ensaio com dados fictícios, sem operação real. '
      else 'Sem autorização registrada nesta praça. ' end||s.note,
 case when e.environment='simulation' and m.operational then 'ficticio-o17-e6' end,
 case when e.environment='simulation' and m.operational then 'infinity'::timestamptz end
from (values
 ('car','https://www.uber.com/global/pt-br/r/cities/sao-paulo-sp-br/','Segue as liberações de módulo, cotação, despacho e área da rede direta.'),
 ('assist','https://www.uber.com/gb/en/ride/uberwav/','Depende de capacitação do motorista conferida pela operação e de política de embarque da área.'),
 ('wav','https://www.uber.com/gb/en/ride/uberwav/','Depende de veículo com rampa ou plataforma, fixação vistoriada e treinamento do motorista.'),
 ('reserve','https://www.uber.com/br/pt-br/ride/how-it-works/reserve/','Depende de política de antecedência, confirmação e contingência aprovada para a área.'),
 ('airport','https://www.uber.com/global/en/r/airports/jfk/shuttle/','Depende de terminal e ponto de embarque permitidos pelo aeroporto ou pela concessionária.'),
 ('van','https://www.uber.com/global/en/r/airports/jfk/shuttle/','Depende de veículo de maior capacidade com assentos e bagagem conferidos pela operação.'),
 ('shuttle_seat','https://www.uber.com/global/en/r/airports/jfk/shuttle/','Depende de linha, operador e inventário de assentos autorizados.'),
 ('hourly','https://www.uber.com/in/en/legal/rentals-and-intercity-saas-rider-terms-addendum/','Depende de tarifa por bloco de tempo e quilometragem aprovada para a área.'),
 ('intercity','https://www.uber.com/in/en/r/intercity/mumbai-maharashtra-to-pune-maharashtra/','Depende de corredor com competência regulatória, cobertura no destino e custo de retorno definidos.'),
 ('taxi','https://www.uber.com/br/pt-br/r/cities/taxi/sao-paulo-sp-br/','Exige permissão municipal e taxímetro ou regra tarifária admitida.'),
 ('moto','https://legislacao.prefeitura.sp.gov.br/decreto-64811-de-10-de-dezembro-de-2025/detalhe','Exige condutor e veículo habilitados, capacetes, seguro e vias permitidas pelo município.'),
 ('shared','https://www.uber.com/us/en/newsroom/uberx-share/','Exige agrupamento com aceite individual, limite de desvio e contas separadas.'),
 ('route_share','https://www.uber.com/us/en/blog/route-share/','Exige corredor fixo com ponto, caminhada e horário informados.'),
 ('transit_info','https://www.uber.com/br/pt-br/newsroom/fatos-e-dados-sobre-uber/','Exige licença dos dados de linhas do operador.'),
 ('transit_ticket','https://www.uber.com/gb/en/u/uberboat/','A venda de bilhete exige contrato e confirmação do operador.'),
 ('bike','https://www.uber.com/br/pt-br/newsroom/bicicletasnauber/','Exige inventário, operador responsável e área de operação.'),
 ('scooter','https://www.uber.com/br/pt-br/newsroom/bicicletasnauber/','Exige inventário, operador responsável e área de operação.'),
 ('boat','https://www.uber.com/gb/en/u/uberboat/','Exige operador fluvial, bilhete e embarque acessível.'),
 ('rental','https://www.uber.com/au/en/r/cities/car-rentals/sydney-nsw-au/','Exige locadora habilitada, caução, cobertura e suporte em avaria.'),
 ('autonomous','https://www.uber.com/us/en/autonomous/waymo/','Exige autorização local, seguro, integração homologada e supervisão do parceiro.')
) s(modality,source_url,note) join private.ride_modalities m on m.code=s.modality
cross join (values('simulation'),('live')) e(environment);

-- The market of a corridor: the one holding the origin, else the destination, else the first of the environment.
create function private.ride_market_for(p_env text,p_origin text,p_destination text) returns private.ride_markets
language sql stable security definer set search_path='' as $$
 select k from private.ride_markets k where k.environment=p_env
 order by exists(select from private.ride_market_areas a where a.environment=k.environment and a.market=k.code and a.area=p_origin) desc,
   exists(select from private.ride_market_areas a where a.environment=k.environment and a.market=k.code and a.area=p_destination) desc,k.code limit 1
$$;
-- Null means allowed; otherwise the first reason. A null area is skipped, for the
-- catalog only. Opening hours are read at the pickup (at p_until when none is given).
create function private.ride_modality_issue(p_env text,p_modality text,p_origin text,p_destination text,p_until timestamptz,p_pickup timestamptz default null)
returns text language plpgsql stable security definer set search_path='' as $$
declare m private.ride_modalities; k private.ride_markets; a private.ride_market_modalities;
 v_until timestamptz:=greatest(now(),coalesce(p_until,now())); v_local time;
begin
 select * into m from private.ride_modalities where code=p_modality;
 if not found then return 'unknown_modality'; end if;
 if m.code<>'car' then
   k:=private.ride_market_for(p_env,p_origin,p_destination);
   if k.code is null then return 'outside_market'; end if;
   select * into a from private.ride_market_modalities where environment=p_env and market=k.code and modality=m.code;
   if not found or a.status='inventory' or (p_env<>'simulation' and a.status<>'authorized') or not 'passenger'=any(a.roles) then return 'not_authorized'; end if;
   if not m.operational or m.flow is null then return 'no_operational_flow'; end if;
   if a.valid_until is null or a.valid_until<v_until then return 'authorization_expired'; end if;
   if a.open_from is not null then
     v_local:=(coalesce(p_pickup,p_until,now()) at time zone k.timezone)::time;
     if (a.open_from<a.open_until and not (v_local>=a.open_from and v_local<a.open_until))
        or (a.open_from>a.open_until and not (v_local>=a.open_from or v_local<a.open_until)) then return 'outside_hours'; end if;
   end if;
   if exists(select from (values(p_origin,true),(p_destination,m.code<>'intercity')) x(area,needed) where x.area is not null and x.needed
      and not exists(select from private.ride_market_areas ma where ma.environment=p_env and ma.market=k.code and ma.area=x.area)) then return 'outside_market'; end if;
 end if;
 if not exists(select from private.ride_network n where n.environment=p_env and n.module_enabled and n.quote_enabled) then return 'network_disabled'; end if;
 if exists(select from unnest(array[p_origin,p_destination]) x(area) where x.area is not null and not private.ride_area_allowed(p_env,x.area,'quote')) then return 'area_not_authorized'; end if;
 return null;
end $$;
create function private.ride_modality_allowed(p_env text,p_modality text,p_origin text,p_destination text,p_until timestamptz) returns boolean
language sql stable security definer set search_path='' as $$
 select p_env is not null and p_origin is not null and p_destination is not null and p_until is not null
   and private.ride_modality_issue(p_env,p_modality,p_origin,p_destination,p_until) is null
$$;
-- For a flow that sells without a quote (a seat, for example).
create function private.require_ride_modality(p_modality text,p_origin text,p_destination text,p_until timestamptz,p_pickup timestamptz default null) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if p_modality is null or p_origin is null or p_destination is null or p_until is null
   or private.ride_modality_issue(private.ride_env(),p_modality,p_origin,p_destination,p_until,p_pickup) is not null then
   raise exception 'ride_modality_unavailable'; end if;
end $$;

-- Quote wrappers call this after the quote row holds its final legs. Every leg
-- (or only p_seq) is checked through its own end. A replay adds nothing.
create function private.ride_attach_quote_mode(p_quote uuid,p_modality text,p_seq int default null) returns void
language plpgsql security definer set search_path='' as $$
declare q private.ride_quotes; leg jsonb; k private.ride_markets; v_pickup timestamptz; v_ref text; v_legs int:=0; v_missing int:=0;
begin
 select * into q from private.ride_quotes where id=p_quote for update;
 if not found or p_modality is null or not exists(select from private.ride_modalities where code=p_modality) then raise exception 'ride_modality_unavailable'; end if;
 select count(*),count(*) filter(where not exists(select from private.ride_quote_modes x where x.quote_id=q.id and x.seq=(l->>'seq')::int and x.modality=p_modality))
   into v_legs,v_missing from jsonb_array_elements(q.legs) l where p_seq is null or (l->>'seq')::int=p_seq;
 if v_legs=0 then raise exception 'invalid_input'; end if;
 if p_modality='car' or v_missing=0 then return; end if;
 if q.status<>'awaiting_consent' or q.expires_at<=now() then raise exception 'requote_required'; end if;
 for leg in select value from jsonb_array_elements(q.legs) loop
   continue when (p_seq is not null and (leg->>'seq')::int<>p_seq)
     or exists(select from private.ride_quote_modes x where x.quote_id=q.id and x.seq=(leg->>'seq')::int and x.modality=p_modality);
   v_pickup:=(leg->>'pickup_at')::timestamptz;
   if private.ride_modality_issue(q.environment,p_modality,leg->>'origin',leg->>'destination',
      v_pickup+make_interval(mins=>(leg->>'duration_minutes')::int),v_pickup) is not null then raise exception 'ride_modality_unavailable'; end if;
   k:=private.ride_market_for(q.environment,leg->>'origin',leg->>'destination');
   select authorization_ref into strict v_ref from private.ride_market_modalities where environment=q.environment and market=k.code and modality=p_modality;
   insert into private.ride_quote_modes(quote_id,seq,modality,environment,market,authorization_ref)
     values(q.id,(leg->>'seq')::int,p_modality,q.environment,k.code,v_ref);
 end loop;
end $$;
create function private.ride_quote_has_mode(p_quote uuid,p_modality text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_quote_modes where quote_id=p_quote and modality=p_modality)
$$;
create function private.ride_leg_has_mode(p_leg uuid,p_modality text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select from private.ride_leg_modes where leg_id=p_leg and modality=p_modality)
$$;
-- First reason why a frozen mode of the leg no longer covers it through p_until (default: the planned end).
create function private.ride_leg_mode_issue(l public.ride_legs,p_until timestamptz default null) returns text
language sql stable security definer set search_path='' as $$
 select i.issue from private.ride_leg_modes m cross join lateral (select private.ride_modality_issue(l.environment,m.modality,
   l.origin,l.destination,coalesce(p_until,upper(l.slot)),l.pickup_at) as issue) i
 where m.leg_id=l.id and i.issue is not null order by m.modality limit 1
$$;

-- Creation, assignment, departure, boarding and any change of place or time are
-- rechecked through the planned end. Cancelling and completing stay possible.
create function private.check_ride_leg_mode() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
   if exists(select from private.ride_quote_modes q
      where q.quote_id=coalesce(new.source_quote_id,(select r.quote_id from public.rides r where r.id=new.ride_id)) and q.seq=coalesce(new.quote_seq,new.seq)
        and private.ride_modality_issue(new.environment,q.modality,new.origin,new.destination,upper(new.slot),new.pickup_at) is not null) then
     raise exception 'ride_modality_unavailable'; end if;
 elsif private.ride_leg_mode_issue(new) is not null then raise exception 'ride_modality_unavailable';
 end if;
 return new;
end $$;
create trigger ride_mode_when_requested before insert on public.ride_legs for each row execute function private.check_ride_leg_mode();
create trigger ride_mode_when_travelling before update of status,driver_id,slot,pickup_at,origin,destination on public.ride_legs for each row
 when(new.status in ('requested','accepted','arriving','boarded') and (
   (new.driver_id is not null and new.driver_id is distinct from old.driver_id)
   or (new.status is distinct from old.status and new.status<>'requested')
   or new.slot is distinct from old.slot or new.pickup_at is distinct from old.pickup_at
   or new.origin is distinct from old.origin or new.destination is distinct from old.destination))
 execute function private.check_ride_leg_mode();
-- Named to run before the other AFTER INSERT triggers, which may read the frozen modes.
create function private.freeze_ride_leg_mode() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.ride_leg_modes(leg_id,modality,environment,market,authorization_ref,quote_id)
 select new.id,q.modality,q.environment,q.market,coalesce(a.authorization_ref,q.authorization_ref),q.quote_id
 from private.ride_quote_modes q join private.ride_market_modalities a on a.environment=q.environment and a.market=q.market and a.modality=q.modality
 where q.quote_id=coalesce(new.source_quote_id,(select r.quote_id from public.rides r where r.id=new.ride_id)) and q.seq=coalesce(new.quote_seq,new.seq);
 return null;
end $$;
create trigger a_ride_freeze_mode after insert on public.ride_legs for each row execute function private.freeze_ride_leg_mode();
create function private.ride_mode_frozen() returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'ride_mode_frozen'; end $$;
create trigger ride_quote_mode_frozen before update on private.ride_quote_modes for each row execute function private.ride_mode_frozen();
create trigger ride_leg_mode_frozen before update on private.ride_leg_modes for each row execute function private.ride_mode_frozen();

-- Radar, waves and accept stop offering a leg whose mode lapsed, before the assignment trigger refuses it.
alter function private.ride_offer_eligible(uuid,public.ride_legs) rename to ride_before_catalog_eligible;
create function private.ride_offer_eligible(p_driver uuid,l public.ride_legs) returns boolean language sql stable security definer set search_path='' as $$
 select private.ride_leg_mode_issue(l) is null and private.ride_before_catalog_eligible(p_driver,l)
$$;

-- Read-only catalog: it writes nothing and receives area labels, never a position.
create function public.ride_market_catalog(p_origin text default null,p_destination text default null,p_at timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_env text:=private.ride_env(); v_at timestamptz:=coalesce(p_at,now());
 n private.ride_network; k private.ride_markets; v_areas text[];
begin
 if not private.ride_active_user(v_uid) then raise exception 'not_allowed'; end if;
 if length(p_origin)>120 or length(p_destination)>120 or v_at>now()+interval '90 days' then raise exception 'invalid_input'; end if;
 select * into strict n from private.ride_network where environment=v_env;
 k:=private.ride_market_for(v_env,p_origin,p_destination);
 if k.code is null then raise exception 'ride_feature_disabled'; end if;
 v_areas:=array(select x from unnest(array[p_origin,p_destination]) x where x is not null);
 return jsonb_build_object('environment',v_env,'market',jsonb_build_object('code',k.code,'country',k.country,'city',k.city),
  'language',k.language,'currency',k.currency,'minor_unit',k.minor_unit,'timezone',k.timezone,'at',v_at,
  'roles',to_jsonb(array['passenger']||case when exists(select from public.ride_drivers d where d.id=v_uid and d.environment=v_env and d.status='approved')
     then array['driver'] else array[]::text[] end),
  'gates',jsonb_build_object('module',n.module_enabled,
    'quote',n.module_enabled and n.quote_enabled and not exists(select from unnest(v_areas) x where not private.ride_area_allowed(v_env,x,'quote')),
    'dispatch',n.module_enabled and n.quote_enabled and n.dispatch_enabled and not exists(select from unnest(v_areas) x where not private.ride_area_allowed(v_env,x,'dispatch')),
    'monetization',n.module_enabled and n.monetization_enabled and not exists(select from unnest(v_areas) x where not private.ride_area_allowed(v_env,x,'monetize'))),
  'vehicles',coalesce((select jsonb_agg(jsonb_build_object('category',v.vehicle,'seats',v.seats) order by v.vehicle) from (
     select c.vehicle,max(c.seats) as seats from private.ride_vehicle_capacity c join public.ride_drivers d on d.id=c.driver_id and d.vehicle=c.vehicle
     where n.module_enabled and d.environment=v_env and d.status='approved' and c.valid_until>v_at group by c.vehicle) v),'[]'),
  'classes',coalesce((select jsonb_agg(to_jsonb(c)-array['environment','evidence_ref','valid_until'] order by c.area,c.surcharge_cents,c.code)
     from private.ride_class_policies c where n.module_enabled and c.environment=v_env and c.valid_until>v_at
       and (c.area=p_origin or (p_origin is null and exists(select from private.ride_market_areas a where a.environment=v_env and a.market=k.code and a.area=c.area)))),'[]'),
  'methods',coalesce((select jsonb_agg(jsonb_build_object('method',g.method,'origin',g.origin,'destination',g.destination,
       'valid_until',upper(g.validity),'card_brands',to_jsonb(g.card_brands)) order by g.origin,g.destination,g.method)
     from private.ride_method_releases g where n.module_enabled and g.environment=v_env and g.method in ('card','cash','pix','benefit') and g.validity @> v_at
       and (g.origin=p_origin or (p_origin is null and exists(select from private.ride_market_areas a where a.environment=v_env and a.market=k.code and a.area=g.origin)))
       and (p_destination is null or g.destination=p_destination)
       and private.ride_method(jsonb_populate_record(null::public.ride_legs,
         jsonb_build_object('environment',g.environment,'origin',g.origin,'destination',g.destination)),g.method) is not null),'[]'),
  'modalities',(select jsonb_agg(jsonb_build_object('code',m.code,'par',m.par,'label',m.label,'operational',m.operational,'flow',m.flow,
       'status',case when m.code<>'car' then coalesce(a.status,'inventory') when i.issue is not null then 'inventory'
          when v_env='simulation' then 'pilot' else 'authorized' end,
       'available',i.issue is null,'reason',i.issue,'source',a.source_url,'consulted_on',a.consulted_on,'note',a.note,
       'valid_until',case when a.status<>'inventory' and isfinite(a.valid_until) then a.valid_until end,
       'open_from',a.open_from,'open_until',a.open_until,'roles',coalesce(to_jsonb(a.roles),'[]')) order by m.position)
     from private.ride_modalities m
     left join private.ride_market_modalities a on a.environment=v_env and a.market=k.code and a.modality=m.code
     cross join lateral (select private.ride_modality_issue(v_env,m.code,p_origin,p_destination,v_at,v_at) as issue) i));
end $$;
-- The single door before any modality flow. A code without an operational flow
-- is refused whatever its authorization row says; p_at is the intended pickup.
create function public.ride_request_modality(p_modality text,p_origin text,p_destination text,p_at timestamptz default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_env text:=private.ride_env(); v_at timestamptz:=coalesce(p_at,now());
 m private.ride_modalities; k private.ride_markets; a private.ride_market_modalities;
begin
 if not private.ride_active_user(v_uid) then raise exception 'not_allowed'; end if;
 if p_modality is null or length(p_modality)>24 or length(p_origin)>120 or length(p_destination)>120 then raise exception 'invalid_input'; end if;
 select * into m from private.ride_modalities where code=p_modality;
 if not found or not m.operational or m.flow is null or p_origin is null or p_destination is null
   or private.ride_modality_issue(v_env,m.code,p_origin,p_destination,v_at,v_at) is not null then raise exception 'ride_modality_unavailable'; end if;
 k:=private.ride_market_for(v_env,p_origin,p_destination);
 select * into a from private.ride_market_modalities where environment=v_env and market=k.code and modality=m.code;
 return jsonb_build_object('modality',m.code,'par',m.par,'flow',m.flow,'environment',v_env,'market',k.code,
   'status',case when m.code<>'car' then a.status when v_env='simulation' then 'pilot' else 'authorized' end,
   'valid_until',case when m.code<>'car' and isfinite(a.valid_until) then a.valid_until end);
end $$;

revoke all on function private.check_ride_market(),private.ride_market_for(text,text,text),
 private.ride_modality_issue(text,text,text,text,timestamptz,timestamptz),private.ride_modality_allowed(text,text,text,text,timestamptz),
 private.require_ride_modality(text,text,text,timestamptz,timestamptz),private.ride_attach_quote_mode(uuid,text,int),
 private.ride_quote_has_mode(uuid,text),private.ride_leg_has_mode(uuid,text),private.ride_leg_mode_issue(public.ride_legs,timestamptz),
 private.check_ride_leg_mode(),private.freeze_ride_leg_mode(),private.ride_mode_frozen(),
 private.ride_before_catalog_eligible(uuid,public.ride_legs),private.ride_offer_eligible(uuid,public.ride_legs)
 from public,anon,authenticated,service_role;
revoke all on function public.ride_market_catalog(text,text,timestamptz),public.ride_request_modality(text,text,text,timestamptz)
 from public,anon,authenticated,service_role;
grant execute on function public.ride_market_catalog(text,text,timestamptz),public.ride_request_modality(text,text,text,timestamptz) to authenticated;
