# Checagens diárias do banco

> Rotina de leitura para quem opera o projeto. Não altera nenhum dado. Nenhum valor real aparece aqui.

| Campo | Valor |
|---|---|
| Arquivo | `apps/web/scripts/ops-daily-checks.sql` |
| Quando | Uma vez por dia útil, e logo depois de cada publicação |
| Quem | Quem tem acesso ao banco de produção (papel `postgres`) |
| Tempo | Cerca de 5 minutos, com tudo em ordem |
| Origem das consultas | `docs/RUNBOOKS.md`, Apêndice B: S01, S03, S06, S07, S10, S14, S16, S17, S18 e S20. O arquivo acrescenta S21 (chaves do agendador) e um painel final |

## Garantia de somente leitura

O arquivo abre com `begin read only` e fecha com `rollback`. Se alguém acrescentar uma escrita, o banco recusa (`cannot execute INSERT in a read-only transaction`). Um teste do repositório (`test/ops/daily-checks-sql.test.ts`) também falha se o arquivo ganhar `insert`, `update`, `delete`, `alter`, `create`, `drop`, `grant`, `truncate` ou outro comando de escrita, ou se ler o valor de um segredo.

## Como rodar no SQL Editor do Supabase

1. Abra o projeto de produção no painel do Supabase, depois **SQL Editor**, depois **New query**.
2. Cole o conteúdo inteiro de `apps/web/scripts/ops-daily-checks.sql`.
3. Clique em **Run**. O SQL Editor mostra só o resultado da **última** consulta: o **painel**, com uma linha por verificação (`id`, `verificacao`, `ocorrencias`, `leitura`).
4. Linhas `ok` não pedem nada. Para cada linha `ATENCAO`, abra o cabeçalho da consulta de mesmo número no arquivo: ele diz o que o resultado significa e qual runbook seguir.
5. Para ver as linhas de uma consulta, selecione só o bloco dela (do `select` ao `;`) e use **Run selected**. O SQL Editor roda a seleção sem o `begin read only`, mas as consultas só leem.
6. Não salve o resultado fora do banco se ele tiver dado pessoal (nomes de prestadores aparecem em S10). Os segredos do Vault nunca aparecem: S21 mostra só o nome.

Quem prefere o terminal: `psql "$DATABASE_URL" -f apps/web/scripts/ops-daily-checks.sql` mostra o resultado de todas as consultas, na ordem. A string de conexão é um segredo: não a grave em arquivo versionado nem no histórico do terminal.

## O que cada linha do painel quer dizer

| Id | Verificação | Resultado fora do normal | Runbook |
|---|---|---|---|
| S01 | Eventos de pagamento gravados e não concluídos há mais de 10 minutos | O webhook falhou no meio, ou chegou evento de dinheiro sem cobrança local | item 1 |
| S03 | Falhas e eventos não verificados do webhook (2 dias) | Webhook com erro ou recusado; muitas falhas seguidas podem pausar a fila do Asaas | item 1 |
| S06 | Pago com atendimento que não avançou | O cliente pagou e o serviço não andou | item 2 |
| S07 | Cobrança pendente vencida com atendimento aceito | Cliente não pagou, ou webhook perdido | item 2 |
| S10 | Conta de recebimento do prestador presa | O prestador não consegue receber | item 3 |
| S14 | Plano Pro fora de sincronia | Plano diverge da assinatura, ou o job de rebaixamento parou | item 4 |
| S16 | Notificações `failed` criadas nas últimas 24 horas (no arquivo, a consulta S16 mostra a fila por status) | Falhas de envio crescendo | item 5 |
| S17 | Notificações presas em `sending` | O despachante não conclui as mensagens | item 5 |
| S18 | Notificações `queued` vencidas há mais de 5 minutos | Mensagens que deviam ter saído e não saíram | item 5 |
| S20 | Fila vencida e nenhuma chamada HTTP em 10 minutos (**agendador silencioso**) | O job aparece como `succeeded` mas não chama a função | item 5 e S21 |
| S20b | Respostas HTTP do despachante diferentes de 200, ou com timeout (24 h) | 401 e 403: `cron_secret` do Vault diferente de `CRON_SECRET` | item 5 e item 6 |
| S21 | Chaves do agendador ausentes no Vault (de 2) | `notify_dispatch_url` ou `cron_secret` não cadastrado | item 5 |

Em um banco local ou de teste, S21 acusa 2 (o Vault não tem as chaves) e S03 pode acusar eventos de testes antigos: é esperado. Em produção, o esperado é tudo `ok`.

### O agendador silencioso (por que S20 e S21 existem)

O job `workeasy-dispatch-notifications` roda a cada minuto e aparece como `succeeded` em `cron.job_run_details` mesmo quando o Vault não tem as chaves: a função de banco só retorna, sem chamar a Edge Function (`RUNBOOKS`, Apêndice A, item 9). Só `net._http_response` mostra a chamada real. Por isso:

- logo depois de cada publicação, confira S21 (as duas chaves existem) e S20 (nenhuma linha em ATENCAO);
- sem fila vencida, a ausência de respostas HTTP é normal: o despachante nem chama a função quando não há o que enviar. O sinal de problema é **fila vencida sem chamada**, que é o que a linha S20 do painel mede.

## Rotina sugerida

1. Rodar o arquivo e olhar o painel.
2. Anotar no histórico de operação: data, quem rodou, linhas em ATENCAO, ação tomada.
3. Tratar o que estiver em ATENCAO pelo runbook, nunca com um reparo à mão sem confirmar no Asaas.
4. Depois de uma publicação, conferir de novo ao final (S01, S18, S20 e S21 em particular).

## O que esta rotina não faz

- Não avisa ninguém: alguém precisa abrir o SQL Editor. Alerta automático e monitor externo estão em `docs/operacao/13-alertas-e-monitor.md` e dependem de conta do dono.
- Não cobre S02, S04 a S05, S08 e S09 nem as demais consultas do `RUNBOOKS`, que são de diagnóstico de um caso, nem as que escrevem (reparos).
- Não foi executada contra dados reais de produção (o projeto ainda não tem usuários). Foi executada contra o banco local, sem erro, e a lógica de várias linhas do painel foi vista com dados de teste dentro de uma transação desfeita (`rollback`).

## Manutenção do arquivo

- Cada consulta repete o filtro do runbook. Se uma coluna mudar numa migração, o runbook e este arquivo mudam juntos; rode o arquivo no banco local (`supabase start`) antes de abrir o PR: `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f apps/web/scripts/ops-daily-checks.sql`.
- O painel final repete os filtros dos blocos acima dele. Mantenha os dois iguais.
