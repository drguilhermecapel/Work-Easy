-- ============================================================================
-- Checagens diárias de operação do WorkEasy. SOMENTE LEITURA.
--
-- Reúne as consultas S01, S03, S06, S07, S10, S14, S16, S17, S18 e S20 de
-- docs/RUNBOOKS.md (numeração do Apêndice B) e acrescenta S21 (chaves do
-- agendador no Vault) e um painel final de contagens.
--
-- Como usar: docs/operacao/12-checagens-diarias.md.
--   - psql: `psql "$DATABASE_URL" -f apps/web/scripts/ops-daily-checks.sql`
--     mostra o resultado de todas as consultas, em ordem.
--   - SQL Editor do Supabase: o editor mostra só o resultado da ÚLTIMA
--     consulta (o painel). Rode o arquivo inteiro para ver o painel e, para
--     investigar uma linha com ATENCAO, selecione só o bloco daquela consulta
--     e use "Run selected".
--
-- Garantias: o arquivo abre com `begin read only` e fecha com `rollback`.
-- Qualquer escrita falha com "cannot execute ... in a read-only transaction".
-- Nenhuma consulta lê o valor de um segredo (S21 lê só o NOME, em
-- vault.secrets) nem chama função de reparo. Um teste (test/ops/) impede que
-- este arquivo ganhe insert, update, delete, alter, create, drop, grant,
-- truncate, e outros comandos de escrita.
--
-- Papel de banco: rode como `postgres` (SQL Editor ou conta de dono). S20 e S21
-- leem cron, net e vault, que o papel `authenticated` não enxerga.
--
-- Regra geral: resultado VAZIO (ou contagem 0) = sem problema. As exceções
-- (S16, S20 e S21) estão marcadas no cabeçalho de cada consulta.
-- ============================================================================

begin read only;


-- ----------------------------------------------------------------------------
-- S01. Eventos de pagamento gravados e não concluídos (RUNBOOKS item 1)
-- Linha = o webhook do Asaas gravou o evento mas não terminou de aplicá-lo há
-- mais de 10 minutos. Duas causas: falha transitória (segredo ausente, banco ou
-- Asaas fora do ar, função que morreu no meio) ou evento de dinheiro sem
-- cobrança local (a função responde 200, deixa processed_at nulo e grava
-- payment_event.unknown_payment no audit_log; ver RUNBOOKS, "Evento de
-- pagamento sem cobrança").
-- Ação: RUNBOOKS item 1 (Correção) e, para unknown_payment, o procedimento do
-- item 3 da rodada de 24/11/2026. Não reaplique sem conferir a cobrança no Asaas.
-- ----------------------------------------------------------------------------
select asaas_event_id, event_type, payment_id, created_at
  from public.payment_events
 where processed_at is null
   and created_at < now() - interval '10 minutes'
 order by created_at;


-- ----------------------------------------------------------------------------
-- S03. Falhas e eventos não verificados do webhook, últimos 2 dias (RUNBOOKS item 1)
-- Linha = payment_event.failed (a função errou ao aplicar) ou
-- payment_event.unverified (evento que não passou na verificação: token,
-- conta ou cobrança que não bate). O runbook lista as 100 mais recentes de
-- sempre; aqui só a janela de 2 dias, para a leitura diária.
-- Ação: veja `reason` e `code`; RUNBOOKS item 1. Uma série de falhas seguidas
-- pode pausar a fila do Asaas (15 falhas): confira os Logs de Webhooks do Asaas.
-- ----------------------------------------------------------------------------
select at, action, entity_id as asaas_event_id, data ->> 'event' as event,
       data ->> 'code' as code, data ->> 'reason' as reason, data ->> 'message' as message
  from public.audit_log
 where action in ('payment_event.failed', 'payment_event.unverified')
   and at > now() - interval '2 days'
 order by at desc
 limit 100;


-- ----------------------------------------------------------------------------
-- S06. Pagamento recebido com atendimento que não avançou (RUNBOOKS item 2)
-- Linha = o pagamento está received/confirmed, mas o atendimento continua
-- requested, accepted ou canceled. Cliente pagou e o serviço não andou (ou foi
-- cancelado com dinheiro recebido: pode exigir estorno).
-- Ação: RUNBOOKS item 2. Confirme o pagamento no Asaas antes de qualquer reparo.
-- ----------------------------------------------------------------------------
select p.id as payment_id, p.asaas_payment_id, p.status as payment_status,
       p.updated_at as payment_updated_at,
       b.id as booking_id, b.status as booking_status, b.canceled_reason
  from public.payments p
  join public.bookings b on b.id = p.booking_id
 where p.status in ('received', 'confirmed')
   and b.status in ('requested', 'accepted', 'canceled')
 order by p.updated_at desc;


-- ----------------------------------------------------------------------------
-- S07. Cobrança pendente vencida com atendimento aceito (RUNBOOKS item 2)
-- Linha = a cobrança segue pending depois do vencimento e o atendimento ainda
-- está accepted. Pode ser só cliente que não pagou; pode ser webhook perdido.
-- Ação: confira a cobrança no Asaas. Se foi paga, trate como S06 (item 2); se
-- não, é caso de atendimento (RUNBOOKS item 2, Prevenção).
-- ----------------------------------------------------------------------------
select p.id as payment_id, p.asaas_payment_id, p.due_date,
       b.id as booking_id, b.status as booking_status
  from public.payments p
  join public.bookings b on b.id = p.booking_id
 where p.status = 'pending'
   and b.status = 'accepted'
   and p.due_date < current_date
 order by p.due_date;


-- ----------------------------------------------------------------------------
-- S10. Conta de recebimento do prestador presa (RUNBOOKS item 3)
-- Linha = a subconta do Asaas está em creating, key_not_stored ou
-- key_not_returned, ou está active sem referência da chave no Vault. O
-- prestador não consegue receber. Qualquer `creating` com mais de 5 minutos é
-- alerta.
-- Ação: RUNBOOKS item 3 (a recuperação da ativação interrompida está no
-- procedimento 7 da rodada de 24/11/2026).
-- ----------------------------------------------------------------------------
select a.provider_id, p.display_name, a.status, a.asaas_account_id, a.asaas_wallet_id,
       a.api_key_secret_id is not null as has_key_ref,
       a.created_at as created_or_claimed_at, now() - a.created_at as age
  from public.provider_payment_accounts a
  join public.providers p on p.id = a.provider_id
 where a.status in ('creating', 'key_not_stored', 'key_not_returned')
    or (a.status = 'active' and a.api_key_secret_id is null)
 order by a.created_at;


-- ----------------------------------------------------------------------------
-- S14. Plano Pro fora de sincronia com a assinatura (RUNBOOKS item 4)
-- Linha = providers.plan diverge da regra: Pro enquanto a assinatura está
-- active/trialing, ou enquanto o período pago (mais a carência
-- platform_settings.pro_grace_days) não acabou. O job
-- workeasy-expire-pro-plans rebaixa de hora em hora; uma linha com plano pro e
-- should_be_pro falso que persiste por mais de uma hora indica job parado.
-- A consulta lê a carência do banco (private.setting_int), como o job: o
-- runbook antigo pedia para trocar um 0 à mão.
-- Não checa o fim do teste em `trialing`: trate cada linha como sinal a conferir
-- no Asaas, não como prova.
-- Ação: RUNBOOKS item 4. O Asaas é a referência; o banco é corrigido para ele.
-- ----------------------------------------------------------------------------
with expected as (
  select p.id as provider_id, p.plan, s.status, s.current_period_end,
         (coalesce(s.status in ('active', 'trialing'), false)
          or coalesce(s.current_period_end
                      + make_interval(days => greatest(private.setting_int('pro_grace_days', 0), 0)) > now(),
                      false)) as should_be_pro
    from public.providers p
    left join public.subscriptions s on s.provider_id = p.id
)
select provider_id, plan as provider_plan, status as subscription_status,
       current_period_end, should_be_pro
  from expected
 where (plan = 'pro') <> should_be_pro
 order by provider_id;


-- ----------------------------------------------------------------------------
-- S16. Fila de notificações por status e canal (RUNBOOKS item 5)
-- NÃO é "vazio = ok": é a distribuição da fila. Normal: queued e sending
-- perto de zero, sent crescendo. Sinal de problema: failed crescendo de um dia
-- para o outro, ou queued com `oldest_scheduled` antigo (veja S17 e S18).
-- Ação: RUNBOOKS item 5.
-- ----------------------------------------------------------------------------
select status, channel, count(*) as n,
       min(scheduled_for) as oldest_scheduled, max(claimed_at) as last_claim
  from public.notifications
 group by status, channel
 order by status, channel;


-- ----------------------------------------------------------------------------
-- S17. Notificações presas em `sending` (RUNBOOKS item 5)
-- Linha = a mensagem foi reivindicada pelo despachante e não saiu do estado
-- `sending` há mais de 10 minutos (ou não tem claimed_at). O próximo ciclo as
-- retoma sozinho depois de 10 minutos; se a linha persiste, o despachante não
-- está rodando ou está falhando.
-- Ação: RUNBOOKS item 5 (Correção). Cuidado: reenviar pode duplicar a mensagem.
-- ----------------------------------------------------------------------------
select id, template, channel, attempts, claimed_at, now() - claimed_at as age
  from public.notifications
 where status = 'sending'
   and (claimed_at is null or claimed_at < now() - interval '10 minutes')
 order by claimed_at nulls first;


-- ----------------------------------------------------------------------------
-- S18. Fila vencida há mais de 5 minutos (RUNBOOKS item 5)
-- `overdue_queued` > 0 = há mensagens `queued` que deviam ter saído e não
-- saíram. O despachante roda a cada minuto: com o agendador em dia o valor é 0.
-- Causas: agendador parado, Vault sem chaves (S21), segredo trocado só de um
-- lado (S20 mostra 401/403), função fora do ar.
-- Ação: veja S20 e S21 abaixo; RUNBOOKS item 5.
-- ----------------------------------------------------------------------------
select count(*) as overdue_queued, min(scheduled_for) as oldest_due
  from public.notifications
 where status = 'queued'
   and scheduled_for < now() - interval '5 minutes';


-- ----------------------------------------------------------------------------
-- S20. Saúde do agendador de envio (RUNBOOKS item 5, Apêndice A item 9)
-- NÃO é "vazio = ok". O job workeasy-dispatch-notifications aparece como
-- `succeeded` em cron.job_run_details MESMO com o Vault vazio, porque a função
-- só retorna sem chamar nada. Só net._http_response mostra a chamada real.
-- Leitura:
--   a) job_runs: o job deve ter uma execução por minuto, todas `succeeded`.
--   b) respostas HTTP: as chamadas ao despachante devem ter status_code 200.
--      401 ou 403 = cron_secret do Vault diferente de CRON_SECRET da função;
--      timed_out ou error_msg = a função não respondeu.
--   c) Sem NENHUMA resposta recente com S18 > 0 = agendador silencioso:
--      confira S21 (chaves ausentes no Vault). Sem fila vencida, a ausência de
--      respostas é normal: o despachante nem chama a função quando não há nada
--      a enviar.
-- Ação: RUNBOOKS item 5 (Vault sem chaves) e item 6 (troca de segredos).
-- ----------------------------------------------------------------------------
select j.jobname, d.status, d.return_message, d.start_time
  from cron.job j
  join cron.job_run_details d on d.jobid = j.jobid
 where j.jobname = 'workeasy-dispatch-notifications'
 order by d.start_time desc
 limit 10;

select id, status_code, timed_out, error_msg, created
  from net._http_response
 order by created desc
 limit 20;


-- ----------------------------------------------------------------------------
-- S21. Chaves do agendador no Vault, só os NOMES (RUNBOOKS item 5)
-- Esperado em produção: duas linhas, notify_dispatch_url e cron_secret.
-- Menos de duas = o despachante não chama a função (S20, item c). Esta
-- consulta lê vault.secrets (só `name`): nenhum valor é descriptografado.
-- Em banco local sem Vault configurado, vazio é o estado normal.
-- Ação: cadastre as chaves como em docs/arquitetura/infra.md ("Vault do
-- Postgres"), por quem tem acesso ao banco de produção. Nunca grave o valor em
-- arquivo versionado.
-- ----------------------------------------------------------------------------
select name
  from vault.secrets
 where name in ('notify_dispatch_url', 'cron_secret')
 order by name;


-- ----------------------------------------------------------------------------
-- PAINEL. Uma linha por verificação, com a contagem de ocorrências.
-- É o único resultado que o SQL Editor do Supabase mostra ao rodar o arquivo
-- inteiro. `leitura` = ok quando a contagem é 0, ATENCAO caso contrário; para
-- S21 a contagem é o número de chaves ausentes. Cada contagem repete o filtro
-- do bloco de mesmo número acima: mantenha os dois iguais ao mudar um deles.
-- S16 e S20 contam sinais, não a tabela inteira: S16 = notificações failed
-- criadas nas últimas 24 horas; S20 = fila vencida sem nenhuma chamada HTTP
-- nos últimos 10 minutos (agendador silencioso); S20b = respostas HTTP não 200
-- (ou com timeout) nas últimas 24 horas.
-- ----------------------------------------------------------------------------
with panel(id, verificacao, ocorrencias) as (
  select 'S01', 'Eventos de pagamento não concluídos há mais de 10 min',
         (select count(*) from public.payment_events
           where processed_at is null and created_at < now() - interval '10 minutes')
  union all
  select 'S03', 'Falhas e não verificados do webhook (2 dias)',
         (select count(*) from public.audit_log
           where action in ('payment_event.failed', 'payment_event.unverified')
             and at > now() - interval '2 days')
  union all
  select 'S06', 'Pago com atendimento que não avançou',
         (select count(*) from public.payments p
            join public.bookings b on b.id = p.booking_id
           where p.status in ('received', 'confirmed')
             and b.status in ('requested', 'accepted', 'canceled'))
  union all
  select 'S07', 'Cobrança pendente vencida com atendimento aceito',
         (select count(*) from public.payments p
            join public.bookings b on b.id = p.booking_id
           where p.status = 'pending' and b.status = 'accepted' and p.due_date < current_date)
  union all
  select 'S10', 'Conta de recebimento presa',
         (select count(*) from public.provider_payment_accounts a
           where a.status in ('creating', 'key_not_stored', 'key_not_returned')
              or (a.status = 'active' and a.api_key_secret_id is null))
  union all
  select 'S14', 'Plano Pro fora de sincronia',
         (select count(*) from (
            select (p.plan = 'pro') as is_pro,
                   (coalesce(s.status in ('active', 'trialing'), false)
                    or coalesce(s.current_period_end
                                + make_interval(days => greatest(private.setting_int('pro_grace_days', 0), 0)) > now(),
                                false)) as should_be_pro
              from public.providers p
              left join public.subscriptions s on s.provider_id = p.id) x
           where is_pro <> should_be_pro)
  union all
  select 'S16', 'Notificações failed criadas nas últimas 24 horas',
         (select count(*) from public.notifications
           where status = 'failed' and created_at > now() - interval '24 hours')
  union all
  select 'S17', 'Notificações presas em sending',
         (select count(*) from public.notifications
           where status = 'sending'
             and (claimed_at is null or claimed_at < now() - interval '10 minutes'))
  union all
  select 'S18', 'Notificações queued vencidas há mais de 5 min',
         (select count(*) from public.notifications
           where status = 'queued' and scheduled_for < now() - interval '5 minutes')
  union all
  select 'S20', 'Fila vencida e nenhuma chamada HTTP em 10 min (agendador silencioso)',
         (select case when exists (select 1 from public.notifications
                                    where status = 'queued'
                                      and scheduled_for < now() - interval '5 minutes')
                       and not exists (select 1 from net._http_response
                                        where created > now() - interval '10 minutes')
                      then 1 else 0 end)
  union all
  select 'S20b', 'Respostas HTTP do despachante não 200 ou com timeout (24 h)',
         (select count(*) from net._http_response
           where created > now() - interval '24 hours'
             and (status_code is distinct from 200 or timed_out))
  union all
  select 'S21', 'Chaves do agendador ausentes no Vault (de 2)',
         (select 2 - count(*) from vault.secrets
           where name in ('notify_dispatch_url', 'cron_secret'))
)
select id, verificacao, ocorrencias,
       case when ocorrencias = 0 then 'ok' else 'ATENCAO' end as leitura
  from panel
 order by id;

rollback;
