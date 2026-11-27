-- Diagnóstico interno do M0. psql -X -v ON_ERROR_STOP=1 -f mobilidade-diagnostico-m0.sql
-- Usar uma conexão autorizada de leitura. O resultado contém só contagens agregadas.
-- As contagens incluem eventuais contas de teste. Quando positivas, reconciliar
-- com a lista de testes antes de interpretar como demanda ou oferta real.
begin read only;
set local statement_timeout = '15s';

with janela as (
  select now() - interval '90 days' as desde
), ocupacoes as (
  select unnest(array['diarista', 'montador-de-moveis', 'marido-de-aluguel']) as slug
), bairros as (
  select id from public.neighborhoods
  where slug in ('moema', 'vila-mariana', 'saude', 'campo-belo', 'jabaquara')
), pedidos as (
  select count(*) as total,
         count(*) filter (
           where r.created_at >= j.desde
             and r.occupation_slug in (select slug from ocupacoes)
             and r.neighborhood_id in (select id from bairros)
         ) as candidatos_90d
  from public.requests r cross join janela j
), atendimentos as (
  select count(*) filter (where status in ('completed', 'released')) as concluidos
  from public.bookings
  where origin = 'platform'
), oferta as (
  select count(distinct p.id) as prestadores
  from public.providers p
  join public.provider_occupations po on po.provider_id = p.id
  where p.status = 'approved'
    and p.accepts_platform_requests
    and po.approved
    and po.registry_status <> 'rejected'
    and po.occupation_slug in (select slug from ocupacoes)
)
select (now() at time zone 'UTC')::date as data_utc,
       (select count(*) from bairros) as distritos_encontrados,
       pedidos.total as pedidos_total,
       pedidos.candidatos_90d as pedidos_candidatos_90d,
       atendimentos.concluidos as atendimentos_plataforma_concluidos,
       oferta.prestadores as prestadores_candidatos_aprovados_e_aceitando,
       (select value from public.platform_settings where key = 'commission_enabled') as comissao,
       (select value from public.platform_settings where key = 'escrow_enabled') as pagamento_retido
from pedidos cross join atendimentos cross join oferta;

rollback;
