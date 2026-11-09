-- =============================================================================
-- kpis.sql: consultas das métricas e dos portões do WorkEasy (documento O08,
-- docs/operacao/08-metricas-e-portoes.md). Só leitura.
--
-- Uso (banco de produção ou local; PGURL é a URL de conexão, guarde-a fora do repositório):
--   psql "$PGURL" -X -v desde=2026-11-09 -v ate=2026-12-23 -v janela_g3=2026-11-30 \
--        -v semana_ref=2026-11-23 -v "contas_teste={<uuid>,<uuid>}" -f kpis.sql
--
-- Parâmetros (todos têm padrão, ver os blocos \if abaixo):
--   desde        primeiro dia do período de medição (D1 = 2026-11-09)
--   ate          último dia incluído (D45 = 2026-12-23)
--   janela_g3    início da janela do G3 (D22 = 2026-11-30). Para o acumulado desde o D1,
--                rode de novo com -v janela_g3=2026-11-09
--   semana_ref   segunda-feira da semana de referência da lista de ativação (Q04b)
--   contas_teste array de user ids das contas de teste (planilha contas_de_teste).
--                Padrão {} (nenhuma excluída). Um id de prestador vale também para
--                o cliente e o pagador da mesma conta.
--
-- Regras gerais:
--   - Tudo roda dentro de BEGIN READ ONLY ... ROLLBACK: um comando de escrita falha
--     aqui e nada é gravado.
--   - Semana = ISO (segunda a domingo) no fuso America/Sao_Paulo. Mês = mês civil de São Paulo.
--     Semana sem linha no resultado significa zero.
--   - Pagamento recebido = payments.status em ('received', 'confirmed'). Se o escrow for
--     ligado, 'held' e 'released' também são dinheiro recebido: revise antes.
--   - Valores em centavos na tabela; as consultas de valor já dividem por 100 (reais).
--   - Só nomes UNQUALIFIED de tabela (sem prefixo public.): a verificação roda o mesmo
--     arquivo sobre cópias das tabelas em um schema temporário.
--   - O resultado pode conter nomes de prestadores (Q04b) e de pessoas. Não o cole no
--     repositório: guarde em pasta privada (O01, seção 11.4).
-- =============================================================================

\if :{?desde}
\else
\set desde '2026-11-09'
\endif
\if :{?ate}
\else
\set ate '2026-12-23'
\endif
\if :{?janela_g3}
\else
\set janela_g3 '2026-11-30'
\endif
\if :{?semana_ref}
\else
\set semana_ref '2026-11-23'
\endif
\if :{?contas_teste}
\else
\set contas_teste '{}'
\endif

\set ON_ERROR_STOP on

begin read only;

-- =============================================================================
-- Q01. ESTRELA: serviços concluídos e pagos no app, por mês.
--   Agendamento: status completed ou released e pagamento recebido/confirmado.
--     Mês = data do evento 'completed' em booking_events (conclusão registrada).
--     origem 'agendamento_plataforma' = Trilha A (cobrança com split);
--     origem 'agendamento_proprio'    = agendamento do CRM do prestador (cobrança pela conta dele).
--   Orçamento aceito e pago (Trilha B): não tem ocupação nem etapa de conclusão no banco.
--     Conta-se pelo mês do pagamento (payments.updated_at), uma aproximação.
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
),
concluidos as (
  select e.booking_id, min(e.at) as em
    from booking_events e
   where e.to_status = 'completed'
   group by e.booking_id
),
agendamentos as (
  select case when b.origin = 'platform' then 'agendamento_plataforma'
              else 'agendamento_proprio' end as origem,
         c.em
    from bookings b
    join concluidos c on c.booking_id = b.id
   cross join teste t
   where b.status in ('completed', 'released')
     and exists (select 1 from payments p
                  where p.booking_id = b.id and p.status in ('received', 'confirmed'))
     and not coalesce((b.provider_id = any (t.ids)) or (b.client_id = any (t.ids)), false)
),
orcamentos as (
  select 'orcamento_pago'::text as origem, min(p.updated_at) as em
    from quotes q
    join payments p on p.quote_id = q.id and p.status in ('received', 'confirmed')
   cross join teste t
   where q.status = 'accepted'
     and not coalesce(q.provider_id = any (t.ids), false)
   group by q.id
)
select to_char(date_trunc('month', x.em at time zone 'America/Sao_Paulo'), 'YYYY-MM') as mes,
       x.origem,
       count(*) as servicos
  from (select origem, em from agendamentos
        union all
        select origem, em from orcamentos) x
 cross join periodo pr
 where x.em >= pr.ini and x.em < pr.fim
 group by 1, 2
 order by 1, 2;

-- =============================================================================
-- Q02. G2: serviços pagos pela plataforma no período (O01, seção 5.1).
--   Um serviço conta uma vez (atendimento ou orçamento com ao menos um pagamento recebido
--   ou confirmado). Reembolso ou estorno tira o serviço, porque o status deixa de ser
--   recebido/confirmado.
--   Momento do pagamento: evento 'paid' em booking_events (atendimento); payments.updated_at
--   (orçamento, aproximação). Valor = soma dos pagamentos recebidos do serviço.
--   Não exclui testes de R$ 1,00, familiares ou o próprio prestador como pagador: isso é da
--   planilha (O01, 5.1). Aqui só saem as contas listadas em contas_teste.
--   Categoria = categoria de lançamento da ocupação. Orçamento sai como "sem categoria de
--   lancamento": o banco não guarda a ocupação do orçamento.
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
),
categorias(ocupacao, categoria) as (values
  ('psicologo', 'liberais'), ('fisioterapeuta', 'liberais'), ('nutricionista', 'liberais'),
  ('personal-trainer', 'liberais'), ('cabeleireiro', 'liberais'),
  ('manicure-e-pedicure', 'liberais'), ('barbeiro', 'liberais'), ('esteticista', 'liberais'),
  ('professor-particular', 'liberais'), ('aulas-de-ingles', 'liberais'),
  ('diarista', 'limpeza'), ('limpeza-pesada-e-pre-mudanca', 'limpeza'),
  ('limpeza-de-estofados', 'limpeza'), ('higienizacao-de-colchao', 'limpeza'),
  ('encanador', 'reparos'), ('pintor', 'reparos'), ('montador-de-moveis', 'reparos'),
  ('tecnico-de-eletrodomesticos', 'reparos'),
  ('cuidador-de-idosos', 'cuidado')
),
servicos as (
  select case when b.origin = 'platform' then 'A (conta da plataforma)'
              else 'B (conta do prestador)' end as trilha,
         'atendimento'::text as tipo,
         b.provider_id,
         b.client_id,
         b.occupation_slug as ocupacao,
         (select min(e.at) from booking_events e
           where e.booking_id = b.id and e.to_status = 'paid') as pago_em,
         (select sum(p.amount_cents) from payments p
           where p.booking_id = b.id and p.status in ('received', 'confirmed')) as valor_cents
    from bookings b
   where exists (select 1 from payments p
                  where p.booking_id = b.id and p.status in ('received', 'confirmed'))
  union all
  select 'B (conta do prestador)'::text, 'orcamento'::text,
         q.provider_id, null::uuid, null::text,
         (select min(p.updated_at) from payments p
           where p.quote_id = q.id and p.status in ('received', 'confirmed')),
         (select sum(p.amount_cents) from payments p
           where p.quote_id = q.id and p.status in ('received', 'confirmed'))
    from quotes q
   where q.status = 'accepted'
     and exists (select 1 from payments p
                  where p.quote_id = q.id and p.status in ('received', 'confirmed'))
)
select s.trilha,
       s.tipo,
       coalesce(cat.categoria, 'sem categoria de lancamento') as categoria,
       count(*) as servicos_pagos,
       count(distinct s.provider_id) as prestadores,
       round(sum(s.valor_cents) / 100.0, 2) as valor_reais
  from servicos s
  left join categorias cat on cat.ocupacao = s.ocupacao
 cross join teste t
 cross join periodo pr
 where s.pago_em >= pr.ini and s.pago_em < pr.fim
   and not coalesce((s.provider_id = any (t.ids)) or (s.client_id = any (t.ids)), false)
 group by 1, 2, 3
 order by 1, 2, 3;

-- =============================================================================
-- Q03. LIQUIDEZ E G3: pedidos válidos por categoria e distrito, e tempo até a primeira proposta.
--   Janela: pedidos criados de janela_g3 até ate (G3 = D22 a D45).
--   Pedido válido: ocupação de categoria de lançamento, distrito do piloto, sem contas de
--     teste, sem status 'canceled' (cancelado pelo cliente, O01 5.1).
--   Relógio: requests.created_at, ou a abertura da janela de atendimento se o pedido chegou
--     fora dela (segunda a sexta 8h a 17h30; sábado 8h a 14h; domingo, abre na segunda 8h).
--     Feriados não são descontados: ajuste à mão nesses dias.
--   Proposta: qualquer proposta de prestador que não é conta de teste (proposals.created_at). O banco não sabe se a
--     proposta diz "quando pode ir"; o resultado é um teto. Confira uma amostra na planilha.
--   Linha TOTAL: numerador e denominador do G3. Passa com percentual >= 70 e pedidos >= 30.
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'janela_g3')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
),
categorias(ocupacao, categoria) as (values
  ('psicologo', 'liberais'), ('fisioterapeuta', 'liberais'), ('nutricionista', 'liberais'),
  ('personal-trainer', 'liberais'), ('cabeleireiro', 'liberais'),
  ('manicure-e-pedicure', 'liberais'), ('barbeiro', 'liberais'), ('esteticista', 'liberais'),
  ('professor-particular', 'liberais'), ('aulas-de-ingles', 'liberais'),
  ('diarista', 'limpeza'), ('limpeza-pesada-e-pre-mudanca', 'limpeza'),
  ('limpeza-de-estofados', 'limpeza'), ('higienizacao-de-colchao', 'limpeza'),
  ('encanador', 'reparos'), ('pintor', 'reparos'), ('montador-de-moveis', 'reparos'),
  ('tecnico-de-eletrodomesticos', 'reparos'),
  ('cuidador-de-idosos', 'cuidado')
),
piloto(slug) as (values
  ('moema'), ('vila-mariana'), ('saude'), ('campo-belo'), ('jabaquara')
),
pedidos_base as (
  select r.id,
         cat.categoria,
         n.slug as distrito,
         (r.created_at at time zone 'America/Sao_Paulo') as local_ts
    from requests r
    join categorias cat on cat.ocupacao = r.occupation_slug
    join neighborhoods n on n.id = r.neighborhood_id
    join piloto pl on pl.slug = n.slug
   cross join teste t
   cross join periodo pr
   where r.created_at >= pr.ini and r.created_at < pr.fim
     and r.status <> 'canceled'
     and not coalesce(r.client_id = any (t.ids), false)
),
pedidos as (
  select b.id,
         b.categoria,
         b.distrito,
         case
           when extract(isodow from b.local_ts) between 1 and 5 and b.local_ts::time < time '08:00'
             then date_trunc('day', b.local_ts) + interval '8 hours'
           when extract(isodow from b.local_ts) between 1 and 5 and b.local_ts::time >= time '17:30'
             then date_trunc('day', b.local_ts) + interval '1 day 8 hours'
           when extract(isodow from b.local_ts) = 6 and b.local_ts::time < time '08:00'
             then date_trunc('day', b.local_ts) + interval '8 hours'
           when extract(isodow from b.local_ts) = 6 and b.local_ts::time >= time '14:00'
             then date_trunc('day', b.local_ts) + interval '2 days 8 hours'
           when extract(isodow from b.local_ts) = 7
             then date_trunc('day', b.local_ts) + interval '1 day 8 hours'
           else b.local_ts
         end as relogio_local
    from pedidos_base b
),
primeira_proposta as (
  select pr.request_id, min(pr.created_at) as primeira
    from proposals pr
   cross join teste t
   where not coalesce(pr.provider_id = any (t.ids), false)
   group by pr.request_id
),
resultado as (
  select p.id,
         p.categoria,
         p.distrito,
         (p.relogio_local at time zone 'America/Sao_Paulo') as relogio,
         pp.primeira as proposta_em,
         greatest(0, extract(epoch from (pp.primeira - (p.relogio_local at time zone 'America/Sao_Paulo'))) / 60.0)
           as minutos_ate_proposta,
         (pp.primeira is not null
           and pp.primeira <= (p.relogio_local at time zone 'America/Sao_Paulo') + interval '2 hours')
           as em_2h
    from pedidos p
    left join primeira_proposta pp on pp.request_id = p.id
)
select coalesce(categoria, 'TOTAL') as categoria,
       coalesce(distrito, 'TODOS') as distrito,
       count(*) as pedidos_validos,
       count(*) filter (where em_2h) as com_proposta_em_2h,
       round(100.0 * count(*) filter (where em_2h) / nullif(count(*), 0), 1) as percentual_2h,
       round((percentile_cont(0.5) within group (order by minutos_ate_proposta)
              filter (where proposta_em is not null))::numeric, 0) as mediana_minutos
  from resultado
 group by rollup (categoria, distrito)
 order by 1, 2;

-- =============================================================================
-- Q03b. DEMANDA FORA DO ESCOPO: pedidos do período que não entram no G3 (ocupação fora das
--   categorias de lançamento ou distrito fora do piloto). Conte à parte como demanda
--   (O01, seção 5.1). Mesmas exclusões de teste e de cancelados do Q03.
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
),
categorias(ocupacao, categoria) as (values
  ('psicologo', 'liberais'), ('fisioterapeuta', 'liberais'), ('nutricionista', 'liberais'),
  ('personal-trainer', 'liberais'), ('cabeleireiro', 'liberais'),
  ('manicure-e-pedicure', 'liberais'), ('barbeiro', 'liberais'), ('esteticista', 'liberais'),
  ('professor-particular', 'liberais'), ('aulas-de-ingles', 'liberais'),
  ('diarista', 'limpeza'), ('limpeza-pesada-e-pre-mudanca', 'limpeza'),
  ('limpeza-de-estofados', 'limpeza'), ('higienizacao-de-colchao', 'limpeza'),
  ('encanador', 'reparos'), ('pintor', 'reparos'), ('montador-de-moveis', 'reparos'),
  ('tecnico-de-eletrodomesticos', 'reparos'),
  ('cuidador-de-idosos', 'cuidado')
),
piloto(slug) as (values
  ('moema'), ('vila-mariana'), ('saude'), ('campo-belo'), ('jabaquara')
)
select to_char(date_trunc('week', (r.created_at at time zone 'America/Sao_Paulo')), 'YYYY-MM-DD') as semana_inicio,
       count(*) as pedidos_fora_do_escopo
  from requests r
  left join categorias cat on cat.ocupacao = r.occupation_slug
  left join neighborhoods n on n.id = r.neighborhood_id
  left join piloto pl on pl.slug = n.slug
 cross join teste t
 cross join periodo pr
 where r.created_at >= pr.ini and r.created_at < pr.fim
   and r.status <> 'canceled'
   and not coalesce(r.client_id = any (t.ids), false)
   and (cat.categoria is null or pl.slug is null)
 group by 1
 order by 1;

-- =============================================================================
-- Q04. G1 E GUARDA: prestadores ativos na agenda, por semana ISO (O01, 5.1).
--   Ativo na semana = prestador APROVADO com ao menos um evento de agenda na semana:
--     booking_events.actor_id = prestador (criou, aceitou, iniciou ou concluiu um atendimento);
--     availability.created_at (horário cadastrado); time_off.created_at (folga cadastrada).
--   Não conta: ação do cliente, eventos de atendimentos de contas de teste (cliente ou prestador
--   na lista), plantão do Cuidado (shifts), evento feito por você no aparelho do prestador.
--   Aprovação é a atual (providers.status = 'approved'): não há histórico.
--   G1 passa com 30 ou mais prestadores nas semanas 5 (07/12) e 6 (14/12) do D1 ao D45.
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
),
aprovados as (
  select p.id
    from providers p
   cross join teste t
   where p.status = 'approved'
     and not coalesce(p.id = any (t.ids), false)
),
eventos_agenda as (
  select e.actor_id as prestador_id, e.at as em
    from booking_events e
    join bookings b on b.id = e.booking_id
   cross join teste t
   where e.actor_id is not null
     and not coalesce((b.client_id = any (t.ids)) or (b.provider_id = any (t.ids)), false)
  union all
  select a.provider_id, a.created_at from availability a
  union all
  select f.provider_id, f.created_at from time_off f
)
select to_char(date_trunc('week', (ev.em at time zone 'America/Sao_Paulo')), 'YYYY-MM-DD') as semana_inicio,
       count(distinct ev.prestador_id) as prestadores_ativos
  from eventos_agenda ev
  join aprovados ap on ap.id = ev.prestador_id
 cross join periodo pr
 where ev.em >= pr.ini and ev.em < pr.fim
 group by 1
 order by 1;

-- =============================================================================
-- Q04b. LISTA DE ATIVAÇÃO (D22, O01 seção 13): aprovados sem evento de agenda na semana de
--   referência (semana_ref, segunda a domingo). DADO PESSOAL: não sai da pasta privada.
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
semana as (
  select ((:'semana_ref')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'semana_ref')::date + 7)::timestamp at time zone 'America/Sao_Paulo') as fim
),
eventos_agenda as (
  select e.actor_id as prestador_id, e.at as em
    from booking_events e
    join bookings b on b.id = e.booking_id
   cross join teste t
   where e.actor_id is not null
     and not coalesce((b.client_id = any (t.ids)) or (b.provider_id = any (t.ids)), false)
  union all
  select a.provider_id, a.created_at from availability a
  union all
  select f.provider_id, f.created_at from time_off f
)
select p.id as prestador_id,
       p.display_name as nome,
       (select string_agg(po.occupation_slug, ', ' order by po.occupation_slug)
          from provider_occupations po
         where po.provider_id = p.id and po.approved) as ocupacoes_aprovadas
  from providers p
 cross join teste t
 cross join semana s
 where p.status = 'approved'
   and not coalesce(p.id = any (t.ids), false)
   and not exists (select 1 from eventos_agenda ev
                    where ev.prestador_id = p.id and ev.em >= s.ini and ev.em < s.fim)
 order by p.display_name;

-- =============================================================================
-- Q05. FUNIL DE PRESTADORES (O01, 5.2), acumulado até ate.
--   Cadastro enviado: audit_log 'provider.submitted' no período (distinto por prestador).
--   Aprovado: providers.status = 'approved' hoje (sem histórico de datas).
--   Agenda ativa: 5 dos 6 itens do checklist, os que o banco vê:
--     (1) availability; (2) services ativo com duração; (3) distrito do piloto em
--     provider_neighborhoods; (5) ao menos 3 provider_clients; (6) ao menos 1 atendimento
--     origem 'own' criado pelo prestador. O item 4 (página lida pelo prestador) não está no banco.
--   Recebimento ativo: provider_payment_accounts.status = 'active'.
--   1ª proposta: proposals do prestador. 1º serviço pago: atendimento ou orçamento com
--     pagamento recebido ou confirmado.
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
),
piloto(slug) as (values
  ('moema'), ('vila-mariana'), ('saude'), ('campo-belo'), ('jabaquara')
),
aprovados as (
  select p.id
    from providers p
   cross join teste t
   where p.status = 'approved'
     and not coalesce(p.id = any (t.ids), false)
),
agenda_ativa as (
  select a.id
    from aprovados a
   where exists (select 1 from availability av where av.provider_id = a.id)
     and exists (select 1 from services s
                  where s.provider_id = a.id and s.active and s.duration_minutes is not null)
     and exists (select 1 from provider_neighborhoods pn
                   join neighborhoods n on n.id = pn.neighborhood_id
                   join piloto pl on pl.slug = n.slug
                  where pn.provider_id = a.id)
     and (select count(*) from provider_clients pc where pc.provider_id = a.id) >= 3
     and exists (select 1 from bookings b where b.provider_id = a.id and b.origin = 'own')
),
pagou as (
  select b.provider_id as prestador_id
    from bookings b
   where exists (select 1 from payments p
                  where p.booking_id = b.id and p.status in ('received', 'confirmed'))
  union
  select q.provider_id
    from quotes q
   where exists (select 1 from payments p
                  where p.quote_id = q.id and p.status in ('received', 'confirmed'))
)
select 1 as ordem,
       'cadastro enviado para analise (no periodo)' as etapa,
       (select count(distinct x.entity_id)
          from audit_log x, periodo pr, teste t
         where x.action = 'provider.submitted'
           and x.at >= pr.ini and x.at < pr.fim
           and not coalesce(
                 (case when x.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                       then x.entity_id::uuid end) = any (t.ids), false)) as prestadores
union all
select 2, 'aprovados (hoje)', (select count(*) from aprovados)
union all
select 3, 'agenda ativa (5 dos 6 itens que o banco ve)', (select count(*) from agenda_ativa)
union all
select 4, 'recebimento ativo (conta Asaas active)',
       (select count(*) from aprovados a
          join provider_payment_accounts pa on pa.provider_id = a.id and pa.status = 'active')
union all
select 5, '1a proposta enviada',
       (select count(distinct pr.provider_id)
          from proposals pr join aprovados a on a.id = pr.provider_id)
union all
select 6, '1o servico pago (atendimento ou orcamento)',
       (select count(distinct w.prestador_id)
          from pagou w join aprovados a on a.id = w.prestador_id)
order by 1;

-- =============================================================================
-- Q06. PARCELA PAGA NO APP (indício de vazamento; O01, 11.1), por semana.
--   Só agendamentos de origem 'platform' concluídos no período (evento 'completed').
--   Pago no app = pagamento recebido ou confirmado do atendimento. Orçamento não entra
--   (sem etapa de conclusão no banco).
--   Leitura: queda da parcela pede investigação (combinado por fora? pagamento falhou?)
--   antes de qualquer ação. Não há tática contra o cliente (O01, 10.4).
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
),
concluidos as (
  select b.id,
         b.provider_id,
         b.client_id,
         min(e.at) as em,
         exists (select 1 from payments p
                  where p.booking_id = b.id and p.status in ('received', 'confirmed')) as pago
    from bookings b
    join booking_events e on e.booking_id = b.id and e.to_status = 'completed'
   where b.origin = 'platform'
     and b.status in ('completed', 'released')
   group by b.id, b.provider_id, b.client_id
)
select to_char(date_trunc('week', (c.em at time zone 'America/Sao_Paulo')), 'YYYY-MM-DD') as semana_inicio,
       count(*) as concluidos,
       count(*) filter (where c.pago) as pagos_no_app,
       round(100.0 * count(*) filter (where c.pago) / nullif(count(*), 0), 1) as parcela_paga_no_app_pct
  from concluidos c
 cross join teste t
 cross join periodo pr
 where c.em >= pr.ini and c.em < pr.fim
   and not coalesce((c.provider_id = any (t.ids)) or (c.client_id = any (t.ids)), false)
 group by 1
 order by 1;

-- =============================================================================
-- Q07. PRO: teste, conversão e base atual (DECISOES, D3 e seção 7).
--   Eventos vêm de audit_log (entity 'subscriptions'): subscription.create (trial_days),
--   subscription.status (de/para) e subscription.cancel. A base atual vem de subscriptions.
--   Taxa de conversão do teste = virou pagante / (virou pagante + não pagou ao fim do teste).
--   Cancelou sem pagar = cancelamento de prestador sem nenhum 'active' no audit (aproximação).
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
),
eventos as (
  select (case when a.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then a.entity_id::uuid end) as prestador,
         a.at,
         a.action,
         a.data->>'from' as de,
         a.data->>'to' as para,
         coalesce((a.data->>'trial_days')::int, 0) as dias_teste
    from audit_log a
   where a.entity = 'subscriptions'
),
resumo as (
  select count(*) filter (where e.action = 'subscription.create' and e.dias_teste > 0)
           as testes_iniciados,
         count(distinct e.prestador) filter (where e.action = 'subscription.status'
           and e.de = 'trialing' and e.para = 'active') as virou_pagante,
         count(distinct e.prestador) filter (where e.action = 'subscription.status'
           and e.de = 'trialing' and e.para = 'past_due') as nao_pagou_fim_do_teste,
         count(distinct e.prestador) filter (
           where (e.action = 'subscription.cancel'
                  or (e.action = 'subscription.status' and e.para = 'canceled'))
             and not exists (select 1 from eventos x
                              where x.prestador = e.prestador
                                and x.action = 'subscription.status' and x.para = 'active')
         ) as cancelou_sem_pagar
    from eventos e
   cross join teste t
   cross join periodo pr
   where e.at >= pr.ini and e.at < pr.fim
     and not coalesce(e.prestador = any (t.ids), false)
)
select 'testes iniciados (no periodo)'::text as metrica, testes_iniciados::numeric as valor from resumo
union all
select 'viraram pagantes (trialing -> active)', virou_pagante from resumo
union all
select 'nao pagaram ao fim do teste (trialing -> past_due)', nao_pagou_fim_do_teste from resumo
union all
select 'cancelaram sem nunca pagar (aprox.)', cancelou_sem_pagar from resumo
union all
select 'taxa de conversao do teste (%)',
       round(100.0 * virou_pagante / nullif(virou_pagante + nao_pagou_fim_do_teste, 0), 1) from resumo
union all
select 'pagantes ativos agora (subscriptions.status = active)',
       (select count(*) from subscriptions s, teste t
         where s.status = 'active' and not coalesce(s.provider_id = any (t.ids), false))
union all
select 'em teste agora (subscriptions.status = trialing)',
       (select count(*) from subscriptions s, teste t
         where s.status = 'trialing' and not coalesce(s.provider_id = any (t.ids), false))
union all
select 'prestadores aprovados agora (base para a taxa)',
       (select count(*) from providers p, teste t
         where p.status = 'approved' and not coalesce(p.id = any (t.ids), false))
union all
select 'pagantes sobre aprovados (%)',
       round(100.0 * (select count(*) from subscriptions s, teste t
                       where s.status = 'active' and not coalesce(s.provider_id = any (t.ids), false))
             / nullif((select count(*) from providers p, teste t
                        where p.status = 'approved' and not coalesce(p.id = any (t.ids), false)), 0), 1);

-- =============================================================================
-- Q08. CHURN PRO MENSAL (O01, 11.1; DECISOES, D2).
--   Pagantes no início do mês = prestadores que tiveram 'active' antes do mês e nenhum
--     cancelamento antes dele.
--   Cancelamentos no mês = entre os pagantes do início, os que cancelaram no mês
--     (subscription.cancel pelo app, ou subscription.status para 'canceled' vindo do Asaas).
--   Inadimplentes no mês = subscription.status para 'past_due' (contado à parte: pode voltar).
--   Limite: o audit não guarda o estado de origem de subscription.cancel; um pagante que
--     voltou de past_due conta como ativo. Sem histórico de estado: é aproximação.
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
eventos as (
  select (case when a.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then a.entity_id::uuid end) as prestador,
         a.at,
         case
           when a.action = 'subscription.status' and a.data->>'to' = 'active' then 'ativou'
           when a.action = 'subscription.cancel' then 'cancelou'
           when a.action = 'subscription.status' and a.data->>'to' = 'canceled'
                and a.data->>'from' is distinct from a.data->>'to' then 'cancelou'
           when a.action = 'subscription.status' and a.data->>'to' = 'past_due' then 'inadimplente'
         end as tipo
    from audit_log a
   where a.entity = 'subscriptions'
),
meses as (
  select g as mes_ini,
         g at time zone 'America/Sao_Paulo' as ini,
         (g + interval '1 month') at time zone 'America/Sao_Paulo' as fim
    from generate_series(date_trunc('month', (:'desde')::date::timestamp),
                         (:'ate')::date::timestamp,
                         interval '1 month') as g
),
contagem as (
  select m.mes_ini,
         (select count(distinct a.prestador) from eventos a, teste t
           where a.tipo = 'ativou' and a.at < m.ini
             and not coalesce(a.prestador = any (t.ids), false)
             and not exists (select 1 from eventos c
                              where c.prestador = a.prestador and c.tipo = 'cancelou' and c.at < m.ini)
         ) as pagantes_no_inicio,
         (select count(distinct a.prestador) from eventos a, teste t
           where a.tipo = 'cancelou' and a.at >= m.ini and a.at < m.fim
             and not coalesce(a.prestador = any (t.ids), false)
             and exists (select 1 from eventos x
                          where x.prestador = a.prestador and x.tipo = 'ativou' and x.at < m.ini)
             and not exists (select 1 from eventos c
                              where c.prestador = a.prestador and c.tipo = 'cancelou' and c.at < m.ini)
         ) as cancelamentos_no_mes,
         (select count(distinct a.prestador) from eventos a, teste t
           where a.tipo = 'inadimplente' and a.at >= m.ini and a.at < m.fim
             and not coalesce(a.prestador = any (t.ids), false)
         ) as inadimplentes_no_mes
    from meses m
)
select to_char(c.mes_ini, 'YYYY-MM') as mes,
       c.pagantes_no_inicio,
       c.cancelamentos_no_mes,
       round(100.0 * c.cancelamentos_no_mes / nullif(c.pagantes_no_inicio, 0), 1) as churn_pct,
       c.inadimplentes_no_mes
  from contagem c
 order by c.mes_ini;

-- =============================================================================
-- Q09. CUIDADO: G4 e plantões por semana (O01, 5.1 e 12).
--   Família G4 = casa com ao menos 1 plantão concluído no período (status completed, com
--     check-in 'in' e check-out 'out') e relatório do dia (daily_reports).
--     Incidente grave aberto não está no banco: confira a planilha cuidado antes de contar.
--   Plantões por semana ISO do início do plantão. Marcado = com cuidador designado
--     (assigned, checked_in, completed, no_show).
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
),
familias_g4 as (
  select h.id as casa
    from households h
   cross join teste t
   cross join periodo pr
   where not coalesce(h.owner_id = any (t.ids), false)
     and exists (
       select 1
         from shifts s
        where s.household_id = h.id
          and s.status = 'completed'
          and lower(s.period) >= pr.ini and lower(s.period) < pr.fim
          and not coalesce(s.provider_id = any (t.ids), false)
          and exists (select 1 from checkins c where c.shift_id = s.id and c.kind = 'in')
          and exists (select 1 from checkins c where c.shift_id = s.id and c.kind = 'out')
          and exists (select 1 from daily_reports r where r.shift_id = s.id)
     )
)
select 'familias com plantao concluido e relatorio (G4)'::text as metrica,
       (select count(*) from familias_g4)::numeric as valor
union all
select 'casas cadastradas no periodo',
       (select count(*) from households h, teste t, periodo pr
         where h.created_at >= pr.ini and h.created_at < pr.fim
           and not coalesce(h.owner_id = any (t.ids), false))::numeric;

with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
)
select to_char(date_trunc('week', (lower(s.period) at time zone 'America/Sao_Paulo')), 'YYYY-MM-DD') as semana_inicio,
       count(*) filter (where s.status in ('assigned', 'checked_in', 'completed', 'no_show')) as marcados,
       count(*) filter (where s.status = 'completed') as concluidos,
       count(*) filter (where s.status = 'canceled') as cancelados,
       count(*) filter (where s.status = 'no_show') as faltas,
       count(*) filter (where s.status in ('open', 'offered')) as sem_cuidador
  from shifts s
  join households h on h.id = s.household_id
 cross join teste t
 cross join periodo pr
 where lower(s.period) >= pr.ini and lower(s.period) < pr.fim
   and not coalesce(h.owner_id = any (t.ids), false)
   and not coalesce(s.provider_id = any (t.ids), false)
 group by 1
 order by 1;

-- =============================================================================
-- Q10. DISPUTAS, ALERTAS DE DINHEIRO E SUSPENSÕES (O01, 11.1 e 13.4; DECISOES, seção 4).
--   Taxa de disputa (coorte): atendimentos com pagamento confirmado no período (evento 'paid')
--     que alguma vez foram para 'disputed'. Meta do DECISOES, seção 4: menos de 10%.
--   Alertas de dinheiro (audit_log, sem filtro de teste: são integridade): ver a lista abaixo.
--     Em aberto = sem payment.refunded_after_cancel nem payment.reviewed depois, no mesmo pagamento.
--   Suspensões: provider.status para 'suspended' no período (gatilho 13.4, item 1).
--   A meta de zero violação de regra não está no banco: promessa proibida e documento fora
--   do app vêm da planilha incidentes.
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
),
pagos_no_periodo as (
  select e.booking_id
    from booking_events e, periodo pr
   where e.to_status = 'paid' and e.at >= pr.ini and e.at < pr.fim
     and exists (select 1 from payments p
                  where p.booking_id = e.booking_id and p.status in ('received', 'confirmed'))
   group by e.booking_id
),
coorte as (
  select b.id,
         exists (select 1 from booking_events d
                  where d.booking_id = b.id and d.to_status = 'disputed') as foi_disputado
    from bookings b
    join pagos_no_periodo p on p.booking_id = b.id
   cross join teste t
   where not coalesce((b.provider_id = any (t.ids)) or (b.client_id = any (t.ids)), false)
)
select 'atendimentos pagos no periodo (coorte)'::text as metrica,
       count(*)::numeric as valor
  from coorte
union all
select 'desses, alguma vez em disputa', count(*) filter (where foi_disputado)::numeric from coorte
union all
select 'taxa de disputa da coorte (%)',
       round(100.0 * count(*) filter (where foi_disputado) / nullif(count(*), 0), 1) from coorte
union all
select 'disputas abertas agora (todo o banco)',
       (select count(*) from bookings where status = 'disputed')::numeric
union all
select 'alerta de dinheiro em aberto (refund_failed ou received_after_cancel)',
       (select count(*)
          from audit_log e
         where e.entity = 'payments'
           and e.action in ('payment.refund_failed', 'payment.received_after_cancel')
           and not exists (select 1 from audit_log h
                            where h.entity = 'payments' and h.entity_id = e.entity_id
                              and h.action in ('payment.refunded_after_cancel', 'payment.reviewed')
                              and h.id > e.id))::numeric
union all
select 'suspensoes no periodo (provider.status = suspended)',
       (select count(*)
          from audit_log a, periodo pr
         where a.action = 'provider.status' and a.data->>'to' = 'suspended'
           and a.at >= pr.ini and a.at < pr.fim)::numeric;

-- Alertas de integridade por tipo, no período (sem filtro de teste de propósito).
-- Entradas que o banco grava quando algo sai do esperado (O01, 13.4 item 2 e 11.1).
with periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
)
select a.action as alerta,
       count(*) as ocorrencias
  from audit_log a, periodo pr
 where a.at >= pr.ini and a.at < pr.fim
   and a.action in ('payment.refund_failed', 'payment.received_after_cancel', 'payment.void_paid',
                    'payment_event.failed', 'payment_event.unverified',
                    'occupation.approval_revoked')
 group by 1
 order by 1;

-- =============================================================================
-- Q11. CUSTO POR PRESTADOR APROVADO E POR SERVIÇO PAGO (O01, 11.1; cálculo único no D45).
--   O banco só dá os denominadores. Os numeradores estão fora do banco:
--     gasto de aquisição: planilha dinheiro (linha de aquisição);
--     horas: planilha horas (categorias R e O, e D se for aquisição).
--   Custo por prestador = (gasto + horas x valor da hora) / prestadores aprovados.
--   Custo por serviço pago = (gasto + horas x valor da hora) / serviços pagos.
--   Aprovado no período = primeira aprovação (audit 'provider.status' de draft ou
--   pending_review para approved). Reativação de suspenso não conta.
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
periodo as (
  select ((:'desde')::date::timestamp at time zone 'America/Sao_Paulo') as ini,
         (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') as fim
)
select 'prestadores aprovados no periodo (primeira aprovacao)'::text as metrica,
       count(distinct a.entity_id)::numeric as valor
  from audit_log a, periodo pr, teste t
 where a.action = 'provider.status'
   and a.data->>'to' = 'approved'
   and a.data->>'from' in ('draft', 'pending_review')
   and a.at >= pr.ini and a.at < pr.fim
   and not coalesce(
         (case when a.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
               then a.entity_id::uuid end) = any (t.ids), false)
union all
select 'servicos pagos no periodo (atendimento e orcamento; sem a regra de categoria)',
       ((select count(distinct e.booking_id)
           from booking_events e
           join bookings b on b.id = e.booking_id
          cross join teste t, periodo pr
          where e.to_status = 'paid' and e.at >= pr.ini and e.at < pr.fim
            and exists (select 1 from payments p
                         where p.booking_id = b.id and p.status in ('received', 'confirmed'))
            and not coalesce((b.provider_id = any (t.ids)) or (b.client_id = any (t.ids)), false))
        + (select count(distinct p.quote_id)
             from payments p
             join quotes q on q.id = p.quote_id
            cross join teste t, periodo pr
            where p.quote_id is not null and p.status in ('received', 'confirmed')
              and p.updated_at >= pr.ini and p.updated_at < pr.fim
              and not coalesce(q.provider_id = any (t.ids), false)))::numeric;

-- =============================================================================
-- Q12. COBERTURA E FREIO DE OFERTA (O01, seção 4 e D16/D24).
--   Oferta = prestadores aprovados na ocupação e no distrito (registro não rejeitado).
--   Demanda = pedidos dos 14 dias até 'ate' na mesma ocupação e distrito (sem cancelados e testes).
--   freio    : 8 ou mais aprovados e menos de 3 pedidos em 14 dias (não recrutar mais).
--   reposicao: menos de 5 aprovados (recrutar reposição).
--   Pares sem nenhum aprovado não aparecem aqui: aparecem como pedidos sem proposta no Q03.
-- =============================================================================
with teste as (
  select :'contas_teste'::uuid[] as ids
),
piloto(slug) as (values
  ('moema'), ('vila-mariana'), ('saude'), ('campo-belo'), ('jabaquara')
),
categorias(ocupacao, categoria) as (values
  ('psicologo', 'liberais'), ('fisioterapeuta', 'liberais'), ('nutricionista', 'liberais'),
  ('personal-trainer', 'liberais'), ('cabeleireiro', 'liberais'),
  ('manicure-e-pedicure', 'liberais'), ('barbeiro', 'liberais'), ('esteticista', 'liberais'),
  ('professor-particular', 'liberais'), ('aulas-de-ingles', 'liberais'),
  ('diarista', 'limpeza'), ('limpeza-pesada-e-pre-mudanca', 'limpeza'),
  ('limpeza-de-estofados', 'limpeza'), ('higienizacao-de-colchao', 'limpeza'),
  ('encanador', 'reparos'), ('pintor', 'reparos'), ('montador-de-moveis', 'reparos'),
  ('tecnico-de-eletrodomesticos', 'reparos'),
  ('cuidador-de-idosos', 'cuidado')
),
oferta as (
  select po.occupation_slug as ocupacao,
         n.slug as distrito,
         count(distinct p.id) as aprovados
    from providers p
    join provider_occupations po
      on po.provider_id = p.id and po.approved and po.registry_status <> 'rejected'
    join categorias cat on cat.ocupacao = po.occupation_slug
    join provider_neighborhoods pn on pn.provider_id = p.id
    join neighborhoods n on n.id = pn.neighborhood_id
    join piloto pl on pl.slug = n.slug
   cross join teste t
   where p.status = 'approved'
     and not coalesce(p.id = any (t.ids), false)
   group by 1, 2
),
demanda as (
  select r.occupation_slug as ocupacao,
         n.slug as distrito,
         count(*) as pedidos_14d
    from requests r
    join neighborhoods n on n.id = r.neighborhood_id
    join piloto pl on pl.slug = n.slug
   cross join teste t
   where r.created_at >= (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo') - interval '14 days'
     and r.created_at < (((:'ate')::date + 1)::timestamp at time zone 'America/Sao_Paulo')
     and r.status <> 'canceled'
     and not coalesce(r.client_id = any (t.ids), false)
   group by 1, 2
)
select cat.categoria,
       o.distrito,
       o.ocupacao,
       o.aprovados,
       coalesce(d.pedidos_14d, 0) as pedidos_14d,
       case
         when o.aprovados >= 8 and coalesce(d.pedidos_14d, 0) < 3 then 'freio'
         when o.aprovados < 5 then 'reposicao'
         else 'ok'
       end as alerta
  from oferta o
  join categorias cat on cat.ocupacao = o.ocupacao
  left join demanda d on d.ocupacao = o.ocupacao and d.distrito = o.distrito
 order by 1, 2, 3;

-- =============================================================================
-- Q13. HORAS DO FUNDADOR, CAIXA E CONVERSÃO DA PLANILHA: fora do banco.
--   Horas (planilha horas, teto de 60 h por semana), gastos (planilha dinheiro) e a
--   lista de contas de teste (planilha contas_de_teste) não estão no banco. Nenhuma
--   consulta deste arquivo as lê. Use os totais da planilha no memorando do D45.
-- =============================================================================

rollback;
