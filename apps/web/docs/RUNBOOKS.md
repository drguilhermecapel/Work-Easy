# Runbooks de operação do WorkEasy

> **Rascunho para revisão de advogado. Não é parecer jurídico.** Os pontos com dados pessoais (itens 9 e 11) e prazos de comunicação estão marcados como **[CONDICIONAL: depende de parecer]**.

| Campo | Valor |
|---|---|
| Data | 2026-11-08 |
| Estado do produto | MVP informado como mesclado no `main` (não conferido nesta sessão), não publicado, sem usuários reais. Asaas, WhatsApp e Resend não foram testados contra serviços reais (`apps/web/docs/ARQUITETURA.md`). |
| Árvore conferida | `/home/user/work-easy`, branch `claude/plano-restante`, HEAD `5805947` (revisado; a primeira versão citava `ed8aa38`, 38 commits antes) |
| Banco usado na validação | Postgres 17.11 local em `127.0.0.1:54322`, sem dados nas tabelas de operação |
| Escopo | Procedimentos. Não altera código, migração, configuração nem dado. |

## Como este documento foi validado

- **Todo bloco SQL foi executado no banco local dentro de `begin; ... rollback;`** em 2026-11-08. Os `<...>` foram trocados por UUID zerado ou texto de teste. Como o banco local está vazio, as consultas retornam zero linhas. O que foi confirmado: sintaxe, nomes de colunas e tipos, e execução sem erro, exceto S09 e S44, que terminam em `not_allowed` (esperado sem atendimento real). Na revisão de 2026-11-08 os 51 blocos foram reexecutados nesse modo, e S43 foi trocada por consulta sobre `audit_log` (item 2).
- **Não confirmado:** o caminho de sucesso das funções de reparo (`transition_booking`, `private.expire_pro_plans`, `vault.update_secret`). Sem atendimento, pagamento ou perfil reais, a validação parou na exceção `not_allowed` (atendimento inexistente), que é o comportamento esperado.
- **Comandos da CLI** (`supabase secrets`, `functions`, `migration repair`, `db dump`, `db push`) conferidos na ajuda da CLI 2.121.0, a mesma versão do workflow `.github/workflows/deploy-supabase.yml`.
- **Atenção:** a base local tem as 36 migrações de HEAD `5805947`. Em `ed8aa38` faltam 21 (`20261108100000` e `20261109000001` a `20261109300006`). As migrações `20261109000001` a `20261109000007` foram aplicadas a partir do worktree `SEG-S1` (branch `plan/seg-S1-nucleo-banco`). Procedimentos que dependem delas estão marcados **[SEG-S1]**: a tag indica a origem, não a ausência no HEAD.

## Fontes abertas nesta revisão

| Fonte | URL | Aberta em | Usada para |
|---|---|---|---|
| Supabase, Backups | https://supabase.com/docs/guides/platform/backups | 2026-11-08 | Retenção de backup diário e PITR, restauração, o que não entra no backup |
| Supabase, API keys | https://supabase.com/docs/guides/api/api-keys | 2026-11-08 | Chaves publicável e secreta, chaves legadas `anon` e `service_role` |
| Asaas, Sobre os webhooks | https://docs.asaas.com/docs/sobre-os-webhooks | 2026-11-08 | Reenvio, fila interrompida após 15 falhas, retenção de 14 dias, cabeçalho `asaas-access-token` |
| Asaas, Webhooks (página complementar) | https://docs.asaas.com/docs/webhooks-1 | 2026-11-08 | Mesmos pontos: penalidade de fila e retenção de 14 dias |
| Asaas, Penalidade de fila | https://docs.asaas.com/docs/queue-penalty | 2026-11-08 | Até 15 tentativas com espera crescente (0 s na 1ª, 3 h na 15ª); alertas nas tentativas 5, 10 e 15 |
| Asaas, Fila pausada | https://docs.asaas.com/docs/fila-pausada e https://docs.asaas.com/docs/webhooks-queue-paused | 2026-11-08 | Após 15 falhas a fila é interrompida; passos antes de reativar; eventos com mais de 14 dias são excluídos |
| Resend, Idempotency keys | https://resend.com/docs/dashboard/emails/idempotency-keys | 2026-11-08 | Cabeçalho `Idempotency-Key`; janela de 24 h; 409 com payload diferente; até 256 caracteres |
| Supabase, Rotate a leaked API key | https://supabase.com/docs/guides/security/rotate-leaked-api-keys | 2026-11-08 | Ordem de troca de chave secreta e service_role; desativação das chaves legadas |
| Supabase CLI 2.121.0 | ajuda local (`supabase <comando> --help`) | 2026-11-08 | Sintaxe de `secrets`, `functions delete`, `migration repair`, `db dump`, `db push` |

Não abertos ou não localizados (ficam como **[incerto]** no texto):

- Pesquisa na web: o limite de buscas da sessão (compartilhado entre agentes) estava esgotado. Nenhuma busca foi feita além das fontes listadas acima.

## Índice por sintoma

| Sintoma | Runbook |
|---|---|
| Asaas mostra falha no webhook, ou o mesmo evento chega de novo | item 1 |
| Cliente pagou e o atendimento continua aceito (ou cancelado com pagamento recebido) | item 2 |
| Prestador preso em "criando", sem chave de cobrança | item 3 |
| Pro ativo sem pagamento, ou quem pagou continua no grátis | item 4 |
| Mensagens em `sending`, fila vencida, ou `failed` e `skipped` | item 5 |
| Troca de segredo planejada ou por vazamento | item 6 |
| Restaurar backup ou PITR | item 7 |
| Migração falhou em produção | item 8 |
| Pedido de exportação ou exclusão de dados | item 9 |
| Suspeita de conta admin comprometida | item 10 |
| Documento de prestador apareceu fora do lugar | item 11 |
| Desligar função ou recurso rápido | item 12 |
| Manutenção planejada | item 13 |

## Antes de qualquer procedimento

1. **Sessão de banco.** As consultas rodam como `postgres` (SQL editor do Supabase ou `psql` com a conta de dono). Nessa sessão, `private.is_service_role()` é verdadeiro, então as funções de serviço funcionam e `private.audit` grava `via: service` com `actor_id` nulo. Coloque o motivo em `data.reason`.
2. **Segredos fora do SQL e do chat.** Ao consultar o Vault, selecione só `name` ou `id`, nunca o valor descriptografado. Um valor digitado em SQL fica no histórico do editor: apague depois.
3. **Substitua todo `<...>`.** Uma consulta com `<...>` literal falha. Os exemplos com `evt_exemplo` e `<uuid>` são placeholders.
4. **Escritas em `begin; ... commit;`.** Se um passo falha, a transação inteira é desfeita. Confira o resultado antes do `commit`.
5. **Antes de escrever:** faça o backup do item 13 e registre o estado com as consultas S16 e S36.
6. **Ordem geral:** contenção, diagnóstico, correção, verificação, registro no `audit_log` (ou no histórico de operação, quando a ação não passa pelo banco), comunicação.

---

## 1. Webhook de pagamento falhando ou duplicado

**Sintoma.** Nos Logs de Webhooks do Asaas aparecem respostas diferentes de 200, timeouts ou erros de rede. Ou o app não reflete um pagamento que o Asaas já mostra como recebido. Ou o mesmo evento aparece de novo.

**O que a função responde** (`supabase/functions/asaas-webhook/handler.ts`):

| Situação | Resposta | O que fica gravado |
|---|---|---|
| Token `asaas-access-token` errado ou ausente | 401 | Nada. Asaas reenvia. |
| `ASAAS_WEBHOOK_TOKEN` ou `ASAAS_API_KEY` não configurado | 503 | Nada. Asaas reenvia. |
| Evento já concluído | 200, `duplicate: true` | Nada muda. |
| Evento sem efeito (`unknown_payment`, `unknown_event`, `account_mismatch`) | 200 | Linha em `payment_events` com `processed_at` preenchido e `payment_id` nulo. Não se reaplica. |
| Cobrança não verificada no Asaas (`unverifiable`) | 200 | Linha concluída e `payment_event.unverified` no `audit_log`. |
| Erro que se repetiria (SQLSTATE 22, 23, 42, P0, PGRST1 e PGRST2; Asaas 400 ou 422) | 200 | `payment_event.failed` no `audit_log`. |
| Falha transitória (rede, timeout, Asaas 5xx, banco) | 500 | Linha sem `processed_at`. Asaas reenvia. |

Regras do Asaas (página "Sobre os webhooks"):

- Quando uma entrega falha, o Asaas faz novas tentativas: até 15, com espera crescente (0 s na 1ª, 30 s na 2ª, até 3 h na 15ª), segundo a página "Penalidade de fila". Alertas por e-mail nas tentativas 5, 10 e 15. A entrega é "at least once": o mesmo evento pode chegar mais de uma vez (página "Sobre os webhooks").
- "Após 15 falhas consecutivas, a fila do Webhook pode ser interrompida". Os eventos continuam sendo gerados, mas não são enviados até a fila ser reativada.
- Eventos ficam guardados por 14 dias. Passado esse prazo, são excluídos.
- A página não descreve reenvio manual. O reprocessamento abaixo usa o corpo guardado em `payment_events.payload`.

**Diagnóstico.**

1. Eventos gravados e não concluídos (falha transitória, ou a função morreu no meio):

```sql
select asaas_event_id, event_type, payment_id, created_at
  from public.payment_events
 where processed_at is null
   and created_at < now() - interval '10 minutes'
 order by created_at;
```

2. Eventos concluídos sem cobrança ligada (ignorados). Eles não são reaplicados sozinhos:

```sql
select asaas_event_id, event_type, created_at, processed_at,
       payload -> 'payment' ->> 'id' as asaas_payment_id
  from public.payment_events
 where processed_at is not null
   and payment_id is null
   and left(event_type, 8) = 'PAYMENT_'
 order by created_at desc;
```

3. Falhas e eventos não verificados registrados:

```sql
select at, action, entity_id as asaas_event_id, data ->> 'event' as event,
       data ->> 'code' as code, data ->> 'reason' as reason, data ->> 'message' as message
  from public.audit_log
 where action in ('payment_event.failed', 'payment_event.unverified')
 order by at desc
 limit 100;
```

4. Eventos diferentes do mesmo tipo para a mesma cobrança. Pode ser legítimo, por exemplo quando um recebimento é desfeito e refeito:

```sql
select payment_id, event_type, count(*) as events,
       min(created_at) as first_seen, max(created_at) as last_seen
  from public.payment_events
 where payment_id is not null
 group by payment_id, event_type
having count(*) > 1
 order by last_seen desc;
```

Entrega repetida do **mesmo** evento não cria linha nova, porque `asaas_event_id` é único. Duplicidade de entrega aparece nos Logs de Webhooks do Asaas, não no banco.

**Correção.**

- **Falha transitória (S01 com linhas).** Corrija a causa (secret ausente, banco, Asaas indisponível). Confirme nos Logs de Webhooks que a entrega voltou a 200. Se a fila do Asaas ainda estiver tentando, espere.
- **Fila pausada no Asaas.** Antes de reativar, a página "Fila pausada" pede: conferir os Logs de Webhooks, identificar a causa, corrigir o endpoint, validar que ele recebe e grava o evento, e só então reativar a fila. Reative pelo painel ou pela API, seguindo o guia "Como reativar uma fila interrompida", que não foi aberto **[incerto]**. Eventos com mais de 14 dias são excluídos e não se recuperam; resolva dentro desse prazo.
- **Evento sem efeito que precisa ser reaplicado** (por exemplo, `unknown_payment` porque a cobrança foi gravada depois do evento):
  1. Confirme no Asaas que a cobrança está no status que sustenta o evento.
  2. Reabra a linha, trocando `evt_exemplo` pelo id do evento:

```sql
begin;
update public.payment_events
   set processed_at = null
 where asaas_event_id = 'evt_exemplo'
   and processed_at is not null;
commit;
```

  3. Reenvie o corpo guardado. O handler relê a cobrança no Asaas antes de aplicar qualquer efeito, então um reenvio não muda o pagamento sem confirmação do Asaas. O corpo guardado é o redigido (sem campos de cartão); o handler lê do corpo só `id`, `event`, `payment.id` e `subscription.id`; o resto vem da leitura no Asaas. Para evento da conta raiz, use `ASAAS_WEBHOOK_TOKEN`. Para evento de subconta, use `?acct=<provider_id>` com o token derivado do item 6.

```bash
# evento.json = conteúdo da coluna payload de payment_events para o asaas_event_id
curl -sS -X POST "$SUPABASE_URL/functions/v1/asaas-webhook" \
  -H "asaas-access-token: $TOKEN" \
  -H "Content-Type: application/json" \
  --data @evento.json
```

  Para subconta: acrescente `?acct=<provider_id>` na URL e use o token derivado.

  4. Confirme que a linha ficou com `processed_at` (S01 sem a linha).
- Não altere `payments` para "dar por resolvido" sem a cobrança confirmada no Asaas. Para cobrança paga que não avançou o atendimento, use o item 2.

**Verificação.** S01 sem linhas. S02 sem o evento reprocessado. O status do pagamento avançou (ver S08). O `audit_log` tem `payment.status` ou `payment.received_after_cancel` para a cobrança.

**Prevenção.**
- Consulta diária de S01 e S03 (ou alerta equivalente). Hoje não há alerta automático no repositório.
- Acompanhe os Logs de Webhooks do Asaas, não só o banco.
- Não deixe `ASAAS_WEBHOOK_TOKEN` ou `ASAAS_API_KEY` ausente por mais que uma janela curta (ver item 12). Cada resposta 503 conta como falha para o Asaas.
- Trate `payment_event.failed` como incidente, não como ruído.

---

## 2. Cobrança paga, atendimento não avançou

**Sintoma.** O cliente vê o pagamento confirmado (ou o Asaas mostra como recebido), e o atendimento continua `accepted` ou `requested`. Ou o atendimento está `canceled` com pagamento recebido.

**Diagnóstico.**

1. Pagamentos recebidos cujo atendimento não avançou:

```sql
select p.id as payment_id, p.asaas_payment_id, p.status as payment_status,
       p.updated_at as payment_updated_at,
       b.id as booking_id, b.status as booking_status, b.canceled_reason
  from public.payments p
  join public.bookings b on b.id = p.booking_id
 where p.status in ('received', 'confirmed')
   and b.status in ('requested', 'accepted', 'canceled')
 order by p.updated_at desc;
```

2. Cobranças pendentes em atendimentos aceitos com vencimento passado. O evento pode ter se perdido. Pendente no banco não prova que o cliente não pagou: confirme no Asaas.

```sql
select p.id as payment_id, p.asaas_payment_id, p.due_date,
       b.id as booking_id, b.status as booking_status
  from public.payments p
  join public.bookings b on b.id = p.booking_id
 where p.status = 'pending'
   and b.status = 'accepted'
   and p.due_date < current_date
 order by p.due_date;
```

3. Rastro de uma cobrança. Troque `<payment_id>` e `<booking_id>`:

```sql
select e.asaas_event_id, e.event_type, e.created_at, e.processed_at
  from public.payment_events e
 where e.payment_id = '<payment_id>'
 order by e.created_at;
select a.at, a.action, a.data
  from public.audit_log a
 where a.entity = 'payments'
   and a.entity_id = '<payment_id>'
 order by a.at;
select be.at, be.from_status, be.to_status, be.reason
  from public.booking_events be
 where be.booking_id = '<booking_id>'
 order by be.at;
```

Como ler o resultado:

| O que aparece | Causa provável | Ação |
|---|---|---|
| Nenhum evento em `payment_events` | O webhook não chegou ou foi rejeitado antes de gravar | Item 1, reenvio |
| Evento com `processed_at` e `payment_id` nulo | `unknown_payment`: a cobrança foi gravada depois do evento | Item 1, reprocessamento |
| Evento concluído, pagamento `received`, atendimento `accepted` | Transição recusada por regra do banco (`booking_transition_refused`). **Esse caso não grava nada no `audit_log`.** Só aparece na resposta ao Asaas e nos logs da função. | Logs da função `asaas-webhook` no painel do Supabase; depois o reparo manual abaixo |
| Atendimento `canceled` e pagamento `received` | Pagamento depois do cancelamento. A função pede reembolso total. | S43 e a fila "Exigem atenção" em `/admin/pagamentos` |

4. Pagamentos que pedem ação manual do admin (reembolso recusado ou pagamento depois do cancelamento). A view `admin_payments_attention` filtra por `public.is_admin()`, então na sessão `postgres` ela retorna zero linhas mesmo com pendências. Por isso a consulta lê `audit_log` com a mesma regra da view:

```sql
select pay.id as payment_id, e.action, e.at, pay.method, pay.amount_cents, pay.status, pay.booking_id
  from public.audit_log e
  join public.payments pay on pay.id::text = e.entity_id
 where e.entity = 'payments'
   and e.action in ('payment.refund_failed', 'payment.received_after_cancel')
   and not exists (
     select 1 from public.audit_log h
      where h.entity = 'payments' and h.entity_id = e.entity_id
        and h.action in ('payment.refunded_after_cancel', 'payment.reviewed')
        and h.id > e.id)
 order by e.at desc;
```

**Correção.**

- Se o Asaas confirma o pagamento e o evento pode ser reenviado: item 1, passo 3.
- Se não há como reenviar, faça o reparo manual **somente depois de confirmar no Asaas** o status recebido, o valor e o id da cobrança.
  - Pagamento ainda `pending`: use S09. Ele marca o pagamento como `received`, avança o atendimento para `paid` e grava `payment.manual_repair`.
  - Pagamento já `received` ou `confirmed`: use S44, que só avança o atendimento.
  - Ambas chamam `transition_booking` como `postgres`. Se a transição for recusada, a transação inteira é desfeita.
- **Atendimento `canceled` com pagamento recebido:** não reative o atendimento. Veja se o reembolso foi pedido (`payment.refunded_after_cancel`) ou recusado (`payment.refund_failed`) na segunda consulta de S08 (`audit_log` do pagamento). Depois trate no painel do admin, em "Exigem atenção": reembolso manual ou `admin_review_payment`, que pede motivo. A consulta de S43 lista o que ainda falta tratar.

Blocos de reparo manual (confirme no Asaas antes de rodar; o `commit` só deve ser dado depois da conferência):

```sql
begin;
update public.payments
   set status = 'received'
 where id = '<payment_id>'
   and status = 'pending';
select public.transition_booking('<booking_id>', 'paid', 'reparo manual: <motivo>');
select private.audit('payment.manual_repair', 'payments', '<payment_id>',
                     jsonb_build_object('reason', 'reparo manual: <motivo>', 'asaas_event_id', '<evento>'));
commit;
```

```sql
begin;
select public.transition_booking('<booking_id>', 'paid', 'reparo manual: <motivo>');
select private.audit('payment.manual_repair', 'bookings', '<booking_id>',
                     jsonb_build_object('reason', 'reparo manual: <motivo>', 'asaas_event_id', '<evento>'));
commit;
```

**Verificação.** S06 sem a linha. Em `booking_events`, o último `to_status` é `paid`, com `reason` `asaas:...` ou `reparo manual: ...` (consulta 3 de S08). O pagamento está no status esperado.

**Prevenção.** S06 e S07 diariamente. Itens 1 e 12 com os alertas indicados. Nenhum reparo sem confirmação no Asaas.

---

## 3. Conta de recebimento do prestador presa

**Sintoma.** O prestador vê a ativação do recebimento travada, ou recebe `onboarding_in_progress` (409), `payment_key_missing` (409) ou `already_onboarded`. Cobranças próprias do prestador falham com `payment_key_missing`.

**Como o código trata os estados** (`supabase/functions/asaas-onboard`). Em `provider_payment_accounts.status`, o código grava `creating`, `active`, `key_not_stored` e `key_not_returned`. O Asaas devolve a chave da subconta uma única vez. Se ela não entra no Vault, a conta é gravada mesmo assim, com um desses dois últimos estados. A reserva `creating` vale 5 minutos. Depois disso, a próxima chamada assume a reserva e chama `createAccount` de novo.

**Diagnóstico.**

1. Contas em estado de reserva ou sem chave:

```sql
select a.provider_id, p.display_name, a.status, a.asaas_account_id, a.asaas_wallet_id,
       a.api_key_secret_id is not null as has_key_ref,
       a.created_at as created_or_claimed_at, now() - a.created_at as age
  from public.provider_payment_accounts a
  join public.providers p on p.id = a.provider_id
 where a.status in ('creating', 'key_not_stored', 'key_not_returned')
    or (a.status = 'active' and a.api_key_secret_id is null)
 order by a.created_at;
```

2. Conta com referência para um segredo que não existe no Vault:

```sql
select a.provider_id, a.status, a.api_key_secret_id
  from public.provider_payment_accounts a
  left join vault.secrets s on s.id = a.api_key_secret_id
 where a.api_key_secret_id is not null
   and s.id is null;
```

3. Cobranças da própria subconta que o webhook não pôde confirmar por falta de chave:

```sql
select created_at, entity_id as asaas_event_id, data ->> 'event' as event,
       data ->> 'reason' as reason, data ->> 'source' as source
  from public.audit_log
 where action = 'payment_event.unverified'
   and data ->> 'reason' = 'subaccount_key_missing'
 order by at desc;
```

Quem depende da chave da subconta: cobranças do próprio prestador (`charges-create`, para clientes próprios e orçamentos). Cobranças da plataforma com split (`payments-create`) usam a carteira (`asaas_wallet_id`, lida por `getProviderWallet`), não a chave.

**Correção.**

| Estado | Ação |
|---|---|
| `creating` com mais de 5 minutos e sem `asaas_wallet_id` | Procure no painel do Asaas uma subconta com o CPF ou CNPJ do prestador. Se não existe, libere a reserva com S13 e peça ao prestador que refaça a ativação. Se existe, a criação não deve ser repetida (ver abaixo). |
| `creating` recente | Espere 5 minutos. A ativação pode estar em andamento. |
| `key_not_stored` ou `key_not_returned` | A chave não pode ser recuperada pelo banco. Abra chamado no Asaas com o `asaas_account_id`. Procedimento de nova chave **[incerto: não localizado na documentação aberta]**. Enquanto isso, o prestador recebe pela plataforma e não tem cobrança própria. |

Liberar a reserva abandonada, só quando não existe subconta no Asaas para o CPF ou CNPJ:

```sql
begin;
delete from public.provider_payment_accounts
 where provider_id = '<provider_id>'
   and status = 'creating'
   and asaas_wallet_id is null;
commit;
```

Se a subconta já existe no Asaas e a reserva está presa, o registro precisa ser completado com os dados do painel do Asaas. O código não sabe reconciliar isso. Não invente o `walletId`:

```sql
begin;
update public.provider_payment_accounts
   set asaas_account_id = '<conta_asaas>',
       asaas_wallet_id = '<carteira_asaas>',
       status = 'key_not_returned'
 where provider_id = '<provider_id>'
   and status = 'creating';
select private.audit('payment_account.manual_repair', 'provider_payment_accounts', '<provider_id>',
                     jsonb_build_object('reason', 'reparo manual: <motivo>', 'status', 'key_not_returned'));
commit;
```

**Verificação.** S10 sem a conta. A resposta de `asaas-onboard` traz `own_charges_enabled: true` quando a chave foi guardada. S12 não cresce mais.

**Prevenção.**
- S10 diariamente. Qualquer `creating` com mais de 5 minutos é alerta.
- Guarde, fora do banco, o CPF ou CNPJ e o `asaas_account_id` de cada subconta. Eles são a forma de reconciliar com o Asaas.
- **Lacuna conhecida** (ver Apêndice A, item 5): se a função cai depois de criar a conta no Asaas e antes de gravar o registro, a chave se perde e a reserva é retomada depois de 5 minutos.

---

## 4. Assinatura Pro fora de sincronia com o Asaas

**Sintoma.** Prestador pagou e continua no plano grátis. Ou não pagou e continua Pro. Ou o Pro não acaba quando o período pago termina.

**Regras que o código aplica** (`subscriptions-manage`, `_shared/subscriptions.ts`, `asaas-webhook`):

| Status em `subscriptions` | `providers.plan` esperado | Quem altera |
|---|---|---|
| `trialing` (teste grátis) | `pro` até o fim do último dia do teste, 23:59:59 de São Paulo | `subscriptions-manage` ao assinar |
| `active` | `pro` | `asaas-webhook` em `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED` |
| `pending` sem período pago | `free` até o primeiro pagamento | `subscriptions-manage` |
| `pending` com período pago (reassinatura) | `pro` até o fim do período | `subscriptions-manage` |
| `past_due` | `pro` até `current_period_end` mais `PRO_GRACE_DAYS`; depois `free` | `asaas-webhook` em `PAYMENT_OVERDUE`. Rebaixamento por job **[SEG-S1]** |
| `canceled` | `pro` até `current_period_end`, sem carência; depois `free` | `subscriptions-manage` ao cancelar; `asaas-webhook` em `SUBSCRIPTION_INACTIVATED` e `SUBSCRIPTION_DELETED`. Rebaixamento por job **[SEG-S1]** |

**Diagnóstico.**

1. Divergências entre `providers.plan` e a regra acima. Antes de rodar, troque `0` em `make_interval` pelo valor de `PRO_GRACE_DAYS` da função. A consulta aplica a carência também a `canceled` (a regra não tem carência) e não checa o fim do teste em `trialing`: trate cada divergência como sinal a conferir no Asaas, não como prova:

```sql
with expected as (
  select p.id as provider_id, p.plan, s.status, s.current_period_end,
         (coalesce(s.status in ('active', 'trialing'), false)
          or coalesce(s.current_period_end + make_interval(days => 0) > now(), false)) as should_be_pro
    from public.providers p
    left join public.subscriptions s on s.provider_id = p.id
)
select provider_id, plan as provider_plan, status as subscription_status,
       current_period_end, should_be_pro
  from expected
 where (plan = 'pro') <> should_be_pro
 order by provider_id;
```

2. Confira no Asaas a assinatura cujo id está em `subscriptions.asaas_subscription_id`. O Asaas é a referência; o banco é corrigido para ele.
3. Confira se o job de rebaixamento existe:

```sql
select jobid, jobname, schedule, active
  from cron.job
 order by jobname;
```

**Correção.**

- Se um evento de assinatura falhou, veja S03 e o item 1.
- **Rebaixamento que não aconteceu** (plano `pro`, período acabou, nenhum evento chegou). O job `workeasy-expire-pro-plans` (`17 * * * *`, migração `20261109000007_pro_plan_expiry.sql`) está no HEAD `5805947` e na base local, mas não em `ed8aa38`; não verifiquei se está aplicado em produção **[SEG-S1]**. Se ele existir, rode a função agora:

```sql
select private.expire_pro_plans();
```

- **Reparo manual**, só com a assinatura confirmada no Asaas. O webhook confirma o evento pela cobrança lida no Asaas (`remote.status` em `RECEIVED` ou `CONFIRMED` para `active`, `OVERDUE` para `past_due`), não pelo status da assinatura. Ajuste `subscriptions` e `providers.plan` pela tabela acima. O exemplo abaixo mostra a assinatura ativa com fim de período em 2026-12-08. Troque o id, a data e o status conforme o Asaas:

```sql
begin;
update public.subscriptions
   set status = 'active',
       current_period_end = '2026-12-08T23:59:59-03:00'
 where provider_id = '<provider_id>';
update public.providers
   set plan = 'pro'
 where id = '<provider_id>';
select private.audit('subscription.manual_repair', 'subscriptions', '<provider_id>',
                     jsonb_build_object('reason', 'reparo manual: <motivo>', 'asaas_status', 'ACTIVE'));
commit;
```

**Verificação.** S14 sem linhas. A linha `subscriptions` e `providers.plan` batem com a tabela. O `audit_log` tem `subscription.manual_repair` (ou `provider.plan_expired`, se veio do job).

**Prevenção.**
- S14 diariamente quando o job [SEG-S1] estiver publicado. Antes disso, S14 é a única detecção.
- Mantenha `PRO_GRACE_DAYS` (variável das funções) e `pro_grace_days` (configuração no banco, usada pelo job [SEG-S1]) com o mesmo valor. Hoje são duas fontes e nada as sincroniza. O comentário da migração [SEG-S1] manda manter igual.

---

## 5. Notificações presas em `sending` ou com falha

**Sintoma.** Usuário não recebe WhatsApp ou e-mail. A fila tem linhas `queued` vencidas, `sending` antigas ou `failed`.

**Como o envio funciona** (`claim_notifications`, `private.dispatch_notifications`, `notify-dispatch`):

- O agendador `workeasy-dispatch-notifications` roda todo minuto. Ele só chama `notify-dispatch` se existem linhas vencidas ou presas **e** o Vault tem `notify_dispatch_url` e `cron_secret`. Sem essas duas chaves, não faz nada, e o job ainda aparece como `succeeded`.
- `claim_notifications` pega lotes de `queued` vencidos, e também linhas em `sending` com `claimed_at` nulo ou com mais de 10 minutos. Reivindicação fresca soma 1 em `attempts`. Retomada de linha presa não soma.
- Depois de cada envio:
  - entregue: `sent`;
  - sem credencial: `skipped` (não é reenviado automaticamente);
  - erro retriável (429, 5xx ou rede) com menos de 5 tentativas: volta a `queued` com atraso de 1, 4, 9 e 16 minutos;
  - erro não retriável (4xx como 401 ou 403, template inválido): `failed` na hora;
  - 5ª tentativa com erro retriável: `failed`.

**Diagnóstico.**

1. Visão geral da fila:

```sql
select status, channel, count(*) as n,
       min(scheduled_for) as oldest_scheduled, max(claimed_at) as last_claim
  from public.notifications
 group by status, channel
 order by status, channel;
```

2. Linhas presas em `sending`:

```sql
select id, template, channel, attempts, claimed_at, now() - claimed_at as age
  from public.notifications
 where status = 'sending'
   and (claimed_at is null or claimed_at < now() - interval '10 minutes')
 order by claimed_at nulls first;
```

3. Fila vencida (sinal de que o agendador não está rodando):

```sql
select count(*) as overdue_queued, min(scheduled_for) as oldest_due
  from public.notifications
 where status = 'queued'
   and scheduled_for < now() - interval '5 minutes';
```

4. Falhas e puladas, por motivo:

```sql
select status, channel, template, error, attempts, count(*) as n,
       max(created_at) as last_created
  from public.notifications
 where status in ('failed', 'skipped')
 group by status, channel, template, error, attempts
 order by n desc, last_created desc;
```

5. Saúde do agendador. `succeeded` no cron não prova envio, porque o job retorna sem chamar a função se o Vault está vazio. O código HTTP real aparece em `net._http_response`:

```sql
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
```

6. Presença das chaves do agendador (só nomes):

```sql
select name
  from vault.decrypted_secrets
 where name in ('notify_dispatch_url', 'cron_secret')
 order by name;
```

**Correção.**

- **Vault sem chaves** (S21 vazio): cadastre `notify_dispatch_url` e `cron_secret`, pelo SQL, por quem tem acesso ao banco de produção, usando `vault.create_secret` como descrito em `apps/web/docs/arquitetura/infra.md`. Não grave valores em arquivo versionado.
- **Linhas presas em `sending`:** o próximo ciclo as retoma depois de 10 minutos. Para acelerar, chame o despachante agora, com o segredo do agendador:

```bash
curl -sS -X POST "$SUPABASE_URL/functions/v1/notify-dispatch" \
  -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" \
  -d '{"limit":20}'
```

- **`failed` por 401 ou 403** (credencial trocada, revogada ou errada): corrija a credencial primeiro (item 6), depois reenfileire:

```sql
begin;
update public.notifications
   set status = 'queued', attempts = 0, error = null, scheduled_for = now()
 where status = 'failed'
   and (error like 'http_401%' or error like 'http_403%')
   and created_at > now() - interval '2 days';
commit;
```

- **`skipped` por `whatsapp_not_configured`** (o canal não estava configurado): depois de configurar, reenfileire. A consulta deixa de fora lembretes de atendimento que já passaram:

```sql
begin;
update public.notifications
   set status = 'queued', attempts = 0, error = null, scheduled_for = now()
 where status = 'skipped'
   and channel = 'whatsapp'
   and error = 'whatsapp_not_configured'
   and (params ->> 'starts_at' is null or (params ->> 'starts_at')::timestamptz > now());
commit;
```

- **Não reenvie cobranças e lembretes antigos em massa** sem olhar o conteúdo. Lembrete de atendimento passado não deve sair.

**Verificação.** S18 sem linhas. S17 sem linhas. S16 mostra `sent` crescendo. S20 com `status_code` 200 nas últimas chamadas.

**Prevenção.**
- Alerta com S18 (fila vencida há mais de 5 minutos) e S17.
- Configure os canais antes de publicar a primeira notificação. Sem credencial, a mensagem vira `skipped` e não volta sozinha.
- Antes de rotacionar WhatsApp ou Resend, leia o item 6: 401 durante a troca gera `failed` definitivo.
- **Risco conhecido (ver Apêndice A, item 8):** se a linha não consegue gravar o resultado depois do envio, ela fica em `sending` e é enviada de novo depois de 10 minutos. WhatsApp: não confirmei se a Cloud API aceita chave de idempotência **[incerto]**. O Resend recebe `Idempotency-Key: notification-<id>` (`notify-dispatch`), com janela de deduplicação de 24 horas (página "Idempotency keys" do Resend, aberta em 2026-11-08).

---

## 6. Rotação de segredos

**Regra geral.** Gere o novo valor, configure-o nas funções, teste uma chamada e só então revogue o antigo. Nunca cole o valor em chat, em arquivo versionado ou em SQL que fique no histórico.

**Como trocar um segredo das Edge Functions:**

```bash
# arquivo fora do repositório, com uma linha NOME=valor; apague o arquivo depois
supabase secrets set --project-ref "$SUPABASE_PROJECT_ID" --env-file /caminho/fora/do/repositorio/novo.env
supabase secrets unset --project-ref "$SUPABASE_PROJECT_ID" NOME_DO_SEGREDO   # só para remover
```

O código lê as variáveis na inicialização do módulo (`config` em `supabase/functions/_runtime/supabase.ts`). Se uma instância já estiver rodando, pode haver intervalo com o valor antigo. Confirme com uma chamada de teste depois da troca **[incerto: propagação do secret sem redeploy não verificada]**.

| Segredo | Quem usa | O que quebra durante a troca | Ordem recomendada | Como confirmar |
|---|---|---|---|---|
| `ASAAS_API_KEY` (conta raiz) | Funções que cobram pela plataforma, `payments-void`, `account-delete`, `asaas-onboard`, `subscriptions-manage`, e o webhook (releitura de cobranças da raiz) | Chamadas à raiz respondem 401. No webhook, a releitura da raiz falha com 401, que não é erro determinístico: a função responde 500 e o Asaas reenvia. Após 15 falhas seguidas, a fila pode parar. | 1) gerar nova chave no painel do Asaas **[incerto: caminho exato não aberto]**; 2) `supabase secrets set ASAAS_API_KEY`; 3) testar uma cobrança em sandbox; 4) revogar a antiga. Subcontas não mudam: a chave delas fica no Vault. | Chamada de teste; S03 sem `payment_event.failed` novo |
| `ASAAS_WEBHOOK_TOKEN` | `asaas-webhook` valida o cabeçalho. Deriva o token de cada subconta (HMAC). | **Tudo** que usa o token antigo responde 401: webhook da raiz e de **todas** as subcontas, porque o token delas é derivado deste. A fila do Asaas pode parar. | Janela de baixo movimento: 1) gerar token novo de 32 a 255 caracteres (`apps/web/supabase/functions/README.md`); 2) `supabase secrets set ASAAS_WEBHOOK_TOKEN`; 3) atualizar o webhook da conta raiz no Asaas; 4) em cada subconta, atualizar o token com o derivado (comando abaixo). `asaas-onboard` registra o webhook só na criação; não há rotina que reregistre subcontas existentes **[lacuna]**. | Com token correto, `ASAAS_API_KEY` configurada e corpo `{}`, o webhook responde 200 (`invalid_payload`). Com token antigo, 401. |
| Token derivado de subconta | Só o webhook daquela subconta | Ao trocar `ASAAS_WEBHOOK_TOKEN`, todos mudam (linha anterior) | Recalcule com o comando abaixo e atualize no painel de cada subconta | Como na linha anterior |
| `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEYS` | Todas as funções que usam service role | A plataforma injeta a chave (`apps/web/docs/arquitetura/infra.md`). Procedimento (guia "Rotate a leaked or compromised API key", aberto em 2026-11-08): trocar por uma chave secreta nova em todos os componentes, confirmar que nenhum usa a antiga, e só então desativar a legada. Ao desativar a `service_role` legada, o guia também manda revogar o JWT secret legado. Chaves legadas continuam válidas até serem desativadas em Settings > API Keys, e criar uma chave nova não revoga a legada. O Supabase está descontinuando `anon` e `service_role` até o fim de 2026 (página "API keys"). O código lê `SUPABASE_SERVICE_ROLE_KEY` antes de `SUPABASE_SECRET_KEYS` (`_shared/config.ts`). | 1) criar a chave secreta nova; 2) confirmar qual variável a plataforma injeta nas funções; 3) testar; 4) só então desativar a legada. Use uma chave secreta por componente. | Chamada de teste com service role; sem 401 ou 403 nos logs |
| `ANTHROPIC_API_KEY` | `request-assist`, `quote-assist`, `care-summary` | Chamadas com a chave antiga falham. A cota da hora já foi consumida antes da chamada (`takeQuota`), então o usuário perde uma unidade. | Nova chave no console da Anthropic **[incerto: caminho não aberto]**; `supabase secrets set`; revogar a antiga depois do teste. | Uma chamada ao assistente sem 503 |
| `WHATSAPP_TOKEN` (e `WHATSAPP_PHONE_NUMBER_ID`) | `notify-dispatch` | 401 e 403 não são retriáveis: a linha vai direto para `failed` (`nextNotificationState`). Isso fica definitivo até reenfileirar. | Gerar o token novo antes de revogar o antigo; `supabase secrets set`; depois, S22. | S16 e S19 depois do teste |
| `RESEND_API_KEY` (e `EMAIL_FROM`) | `notify-dispatch` (e-mail) | Mesmo efeito: 401 e 403 viram `failed`. | Igual ao WhatsApp. | Igual |
| `CRON_SECRET` (função) e `cron_secret` (Vault) | `notify-dispatch` confere antes de reivindicar lotes; `private.dispatch_notifications` envia | Valores diferentes: o despachante recusa a chamada antes de reivindicar nada (`notify-dispatch/handler.ts`), então **as linhas ficam em `queued`** e não se perdem. S20 mostra o código HTTP em `net._http_response`. | 1) atualizar o Vault com S50 (usar o id de S47); 2) `supabase secrets set CRON_SECRET` com o mesmo valor. Faça as duas em sequência curta. | S20 com 200 depois da troca |
| Segredos de CI (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, ambiente `production`) | `deploy-supabase.yml` | O workflow de publicação falha até o segredo do GitHub ser atualizado. | Atualizar no GitHub antes de rodar o workflow de novo. | Dry run do workflow |

**Derivar o token de uma subconta** (mesma regra de `deriveSubaccountToken`, `_shared/secrets.ts`: HMAC-SHA256 com o token da plataforma como chave, sobre a string `asaas-subaccount:` seguida do id do prestador em minúsculas, saída em hexadecimal). Conferido pelo revisor em 2026-11-08: o resultado bate com `deriveSubaccountToken` (Deno) para um token e um id de teste:

```bash
PID="$(echo '<provider_id>' | tr 'A-Z' 'a-z')"
printf '%s' "asaas-subaccount:$PID" | openssl dgst -sha256 -hmac "$ASAAS_WEBHOOK_TOKEN" | awk '{print $NF}'
```

**Trocar o segredo do agendador no Vault.** Pegue o id com esta consulta:

```sql
select id, name
  from vault.secrets
 where name in ('notify_dispatch_url', 'cron_secret')
 order by name;
```

Depois rode:

```sql
begin;
select vault.update_secret('<secret_id>', '<novo valor>');
commit;
```

A validação mostrou que `vault.update_secret` não acusa erro com um id inexistente. Confira depois com S47 e com S20.

**Verificação geral.** Depois de qualquer troca: S16 e S18 sem sinal novo de falha; S03 sem `payment_event.failed` novo; uma chamada de teste em cada função afetada; o histórico de operação registra a data, o segredo (pelo nome, nunca pelo valor) e quem trocou.

---

## 7. Restauração de backup ou PITR

**O que o Supabase informa** (página "Backups", aberta em 2026-11-08):

- Backup diário: projetos Pro guardam os últimos 7 dias; Team, 14; Enterprise, até 30. O plano free não aparece entre os projetos com backup diário automático, e a página recomenda exportar com `db dump`.
- PITR é complemento pago em Pro, Team e Enterprise, com retenção de 7, 14 ou 28 dias (a página lista essas opções sem associá-las a cada plano). RPO de dois minutos. Ativar PITR desliga o backup diário.
- Restaurar para um ponto anterior **substitui o estado atual**. Para preservar os dados atuais, restaure antes para um **projeto novo**. O projeto fica inacessível durante a restauração **[incerto: não conferido na página]**.
- Não entram no backup: objetos do Storage (o banco só guarda metadados), objetos apagados depois do backup (não voltam), e senhas de papéis customizados (é preciso redefinir). Assinaturas e slots de replicação precisam ser removidos antes e recriados depois **[incerto: não conferido na página]**.
- **Não consta na página:** se Vault e Auth entram no backup **[incerto]**. Trate como não garantido até checar.

**Procedimento.**

1. **Contenha escritas arriscadas** enquanto decide. Desligue o disparo de mensagens (S37) e o assistente (item 12). Não desligue o webhook do Asaas (item 12 explica o motivo).
2. **Escolha o alvo.** Restaure para um projeto novo, sempre que possível. Só sobrescreva o projeto de produção com decisão registrada do dono.
3. **Depois do restauro, confira** (no projeto restaurado):
   - Migrações e agendamentos: S40, S39, e a checagem geral de S34.
   - **Segredos das funções:** são do projeto e não estão no banco. Recrie com `supabase secrets set` (item 6). Não presuma que vieram com o backup.
   - **Webhooks do Asaas:** a URL contém o ref do projeto. Reconfigure a raiz e **cada subconta**, porque a subconta guarda `…/functions/v1/asaas-webhook?acct=<provider_id>` desde a criação (`asaas-onboard`).
   - **Vault:** confirme se as chaves das subcontas existem. S34 (última consulta) lista contas com referência sem segredo.
   - **Storage:** documentos sem arquivo. Use S32. Esses prestadores precisam reenviar; as aprovações que dependiam deles seguem valendo até o admin revisar (ver Apêndice A, item 10).
   - **Auth:** compare `auth.users` com `profiles` em S34.

Consultas de conferência pós-restauro (além de S40 e S39):

```sql
select max(version) as last_migration from supabase_migrations.schema_migrations;
select jobname, schedule, active from cron.job order by jobname;
select (select count(*) from auth.users) as auth_users,
       (select count(*) from public.profiles) as profiles,
       (select max(created_at) from public.payments) as last_payment,
       (select max(at) from public.audit_log) as last_audit;
select a.provider_id, a.status
  from public.provider_payment_accounts a
 where a.api_key_secret_id is not null
   and not exists (select 1 from vault.secrets s where s.id = a.api_key_secret_id);
```

4. **Reconcilie o que aconteceu entre o ponto restaurado e o incidente:**
   - Cobranças criadas no Asaas depois do ponto restaurado não existem no banco. O webhook delas responde 200 como `unknown_payment` e não se reaplica (item 1).
   - Liste no Asaas as cobranças com referência externa `booking:<id>` (campo gravado por `payments-create`). A forma exata de busca no painel **[incerto]**.
   - Para cada cobrança paga, siga o item 2 com o id do atendimento. Se a linha de `payments` não existe, recriá-la exige valor, método e id que só o Asaas tem. Faça com o time técnico, sem SQL padronizado aqui.
   - Assinaturas: rode S14 e compare com a tabela do item 4.
   - Compare o horário do incidente com `last_payment` e `last_audit` de S34: o que aconteceu depois desse ponto não está no banco restaurado. O `audit_log` também volta ao ponto escolhido, então o registro do restauro fica fora do banco.

**Verificação.** S34 com os contadores coerentes com o ponto escolhido. S14 sem linhas. S32 com a lista explicada. Cobranças do Asaas do período conferidas uma a uma.

**Prevenção.**
- Escolha a retenção de PITR conforme a janela de perda aceitável. Não encontrei um RPO definido no repositório nesta revisão **[lacuna]**.
- Exporte periodicamente com `supabase db dump --linked -f <caminho fora do repositório>` (o dump tem dados pessoais: não o versione).
- Ensaie um restauro em projeto novo antes de precisar. Não encontrei frequência definida no repositório nesta revisão.

---

## 8. Migração falhou em produção

**Sintoma.** O workflow "Publicar Supabase" falhou no passo de migrações ou o banco ficou em estado que o código não espera.

**Como o deploy funciona** (`.github/workflows/deploy-supabase.yml`): execução manual, dry run por padrão. Aplica com `supabase db push --linked --skip-vault --yes` e, depois, o catálogo de produção (`supabase/catalog.sql`, com `supabase db query --linked -f`, em uma transação). `supabase/seed.sql` (desenvolvimento) nunca é aplicado. O catálogo sobrescreve áreas, ocupações, políticas e bairros com os valores do repositório: altere o catálogo só no repositório. Publica funções em outro passo; `asaas-webhook` e `notify-dispatch` com `--no-verify-jwt`. Grupo de concorrência único, sem cancelar execução em andamento.

**Diagnóstico.**

1. Migrações registradas. Compare com o que o workflow tentou aplicar:

```sql
select version, name
  from supabase_migrations.schema_migrations
 order by version desc
 limit 5;
```

2. Estado do objeto que a migração criaria. Troque `<tabela>` pelo nome da tabela:

```sql
select to_regclass('public.<tabela>') as tabela_existe;
```

3. Lista do que falta aplicar, sem aplicar nada:

```bash
supabase db push --linked --skip-vault --dry-run
```

**Correção.**

1. **Não rode o workflow de novo** antes de entender o estado.
2. **Não altere migração já aplicada.** A regra é criar uma migração nova, não editar uma já aplicada. Atenção: `ARQUITETURA.md`, na seção "Testes e CI", manda editar a migração quando muda assinatura do banco. Essa contradição está no Apêndice A. Até ser resolvida, prefira migração nova. Se o arquivo que falhou tem erro, o correto é uma migração nova com o timestamp seguinte, que trate o estado parcial.
3. **Estado parcial.** Não verifiquei se a CLI aplica cada arquivo numa transação só **[incerto]**. Presuma estado parcial até conferir os objetos com S41.
4. **Histórico do banco.** Só use `supabase migration repair --status applied|reverted <versão> --linked` depois de decidir o estado real. `reverted` apenas marca o histórico; não desfaz o SQL.

```bash
supabase migration repair --status applied <versão> --linked
```

5. **Publicação de funções incompleta.** Rode de novo. Mantenha a flag `--no-verify-jwt` para `asaas-webhook` e `notify-dispatch`, como o workflow faz. Ela também está em `supabase/config.toml` (`[functions.asaas-webhook]` e `[functions.notify-dispatch]`, `verify_jwt = false`), e o README das funções diz isso.
6. **Reteste.** Rode o workflow com dry run ligado, depois com a publicação de funções, conforme o caso. Os dois passos pedem a aprovação do ambiente `production` (`infra.md`).

**Verificação.** S40 mostra a migração nova na lista. S41 confirma o objeto. Os testes pgTAP rodam em banco local (`supabase test db`), nunca no de produção.

**Prevenção.**
- Faça backup antes (item 13). Em Pro, o backup diário vale para os últimos 7 dias.
- Rode `supabase db reset` e `supabase test db` localmente antes de abrir o PR, como o CI faz (`ARQUITETURA.md`, "Testes e CI").
- Mantenha o dry run como primeiro passo sempre.

---

## 9. Pedido de exportação ou exclusão de dados do titular

**Canais.** Dentro do app: `/conta` chama `account-export` (JSON com os dados do próprio usuário) e `account-delete` (exige `{"confirm":"EXCLUIR"}`). Fora do app: pedido pelo canal de atendimento. O conteúdo de `docs/juridico/10-sac-e-atendimento.md` não foi aberto nesta revisão. Prazos e forma de resposta: **[CONDICIONAL: depende de parecer]**. Procedimento de verificação de identidade para pedido fora do app: **[incerto: não definido nesta revisão]**.

**Exportação, passo a passo.**

1. Peça ao titular que gere pelo app. A função grava `data_requests` com `kind = 'export'`.
2. Se o app não entregar, gere manualmente. A lista de tabelas e o filtro do dono estão em `supabase/functions/_shared/lgpd-export.ts` (`EXPORT_PLAN`). Para pagamentos, use as colunas autorizadas:

```sql
select id, booking_id, quote_id, provider_id, payer_id, asaas_payment_id, method,
       amount_cents, platform_fee_cents, status, escrow, invoice_url, pix_qr_code,
       pix_payload, due_date, created_at, updated_at
  from public.payments
 where payer_id = '<uuid>'
    or provider_id = '<uuid>'
 order by created_at;
```

3. **Defeito conhecido (ver Apêndice A, item 1).** `account-export` lê `payments` e `provider_payment_accounts` com `select *`. O papel `authenticated` não tem permissão para `select *` nessas tabelas: a consulta falha com `permission denied`. A função não para. Ela coloca as tabelas no campo `unavailable` do JSON. Confira esse campo. Se aparecer `payments` ou `provider_payment_accounts`, complete a exportação com a consulta do passo 2. Para contas de recebimento, use as colunas do grant (`provider_id`, `asaas_account_id`, `asaas_wallet_id`, `status`, `created_at`), nunca `api_key_secret_id`.
4. Entregue ao titular por canal que confirme identidade. Não envie o JSON completo por mensagem sem controle.
5. Consulte os pedidos abertos:

```sql
select id, user_id, kind, status, created_at, completed_at
  from public.data_requests
 where status in ('processing', 'failed')
 order by created_at desc;
```

**Exclusão, passo a passo.**

1. **Pré-checagem.** Atendimentos em `accepted`, `paid`, `in_progress` ou `disputed` bloqueiam a exclusão (`active_bookings`, 409). Plantões (`shifts`) não entram nessa checagem: o bloqueio por plantão não foi integrado `[decisão do dono]`. Resolva antes:

```sql
select count(*) as blocking_bookings
  from public.bookings
 where (client_id = '<uuid>' or provider_id = '<uuid>')
   and status in ('accepted', 'paid', 'in_progress', 'disputed');
```

2. **Pedido pelo app.** Ordem no código (`account-delete/handler.ts`):
   1. grava `data_requests` `kind = 'delete'`, `status = 'processing'`;
   2. cancela a assinatura Pro e as cobranças `pending` no Asaas. Cobrança de subconta sem chave é pulada e registrada no log: o suporte cancela no painel;
   3. apaga a pasta `provider-documents/<user_id>/` pela API de Storage;
   4. chama `anonymize_user`, que recusa com `storage_not_empty` se restar arquivo;
   5. grava `account.delete` no `audit_log`;
   6. apaga o usuário no Auth;
   7. marca `completed`.
3. **Falha.** Se falhar nos passos 2 a 4, a função marca `failed`. Se falhar no passo 6, a função responde 500 e **a linha fica em `processing`**: a anonimização já aconteceu (Apêndice A, item 4). Diagnóstico e reparo:

```sql
select count(*) as processing
  from public.data_requests
 where status = 'processing'
   and created_at < now() - interval '1 hour';
```

   - Peça ao titular que refaça a chamada. **[incerto: repetir é seguro depois da anonimização; confirmar em homologação antes]**.
   - Se o login não puder ser removido pelo app, remova o usuário pelo painel do Auth **[incerto: caminho não aberto]** e feche o pedido:

```sql
begin;
update public.data_requests
   set status = 'completed',
       completed_at = now()
 where id = '<uuid>'
   and status = 'processing';
commit;
```

4. **Cobranças pendentes que sobraram** (especialmente de subconta sem chave). Liste, cancele no painel do Asaas e registre:

```sql
select id, asaas_payment_id, provider_id, quote_id
  from public.payments
 where status = 'pending'
   and (payer_id = '<uuid>' or provider_id = '<uuid>');
```

5. **Arquivos que sobraram.** Não deve haver nenhum antes da anonimização:

```sql
select count(*) as files_left
  from storage.objects
 where bucket_id = 'provider-documents'
   and (storage.foldername(name))[1] = '<uuid>';
```

6. **Conferência final:**

```sql
select (select count(*) from auth.users u where u.id = '<uuid>') as auth_users_left,
       (select count(*) from public.profiles p where p.id = '<uuid>') as profiles_left,
       (select count(*) from public.data_requests r
         where r.user_id = '<uuid>' and r.kind = 'delete' and r.status <> 'completed') as open_delete_requests;
```

**Verificação.** S28 com zeros em `auth_users_left` e `profiles_left`, e nenhum pedido `delete` aberto. S27 zero. S49 sem linhas.

**Prevenção.**
- Teste o fluxo de exclusão em homologação antes de cada publicação que mexa em `anonymize_user` ou em `account-delete`.
- Os dados que ficam são registros fiscais de pagamentos e atendimentos, anonimizados (`ARQUITETURA.md`, "LGPD e auditoria"). A base legal e o prazo de guarda são questões para o parecer **[CONDICIONAL: depende de parecer]**.

---

## 10. Conta admin comprometida

**Sintoma.** Ação administrativa que o admin não fez, configuração alterada sem registro, ou acesso suspeito.

**Como as ações ficam registradas.** Ações administrativas passam por funções que gravam `audit_log` com `actor_id = auth.uid()`, então são atribuíveis ao admin. Ações feitas com service role têm `actor_id` nulo e não se atribuem a ninguém.

**Contenção (imediata).**

1. Retire o admin e as sessões. Troque `<uuid>` pelo id da conta comprometida. Access tokens já emitidos continuam válidos até expirar (`jwt_expiry = 3600` em `supabase/config.toml`, ou seja, 1 hora) **[incerto: efeito sobre a sessão revogada não confirmado]**:

```sql
begin;
delete from public.admins
 where user_id = '<uuid>';
select private.audit('admin.revoked', 'admins', '<uuid>', jsonb_build_object('reason', 'reparo manual: <motivo>'));
delete from auth.sessions
 where user_id = '<uuid>';
delete from auth.refresh_tokens
 where user_id = '<uuid>';
commit;
```

2. Troque a senha ou o método de entrada da conta **[incerto: caminho no painel de Auth não aberto]**. A configuração local (`supabase/config.toml`) deixa MFA TOTP desligado: não conferi se a produção exige MFA para admin. Tratar como lacuna até conferir.

**Inventário.**

1. Resumo das ações por tipo:

```sql
select action, count(*) as n, min(at) as first_at, max(at) as last_at
  from public.audit_log
 where actor_id = '<uuid>'
 group by action
 order by n desc;
```

2. Linha do tempo desde o início da suspeita. Ajuste a data em `at >=`:

```sql
select at, action, entity, entity_id, data
  from public.audit_log
 where actor_id = '<uuid>'
   and at >= '2026-11-01T00:00:00-03:00'
 order by at;
```

3. Reverta o que for indevido, com prioridade:
   - `setting.changed`: volte o valor anterior (campo `from`) pela tela de configurações, com outro admin.
   - `document.accepted`, `occupation.approval`, `provider.status`: revise prestador por prestador. Use a tela de cada prestador.
   - `payment.raw_viewed`: o admin viu o payload de pagamento, que contém dados do pagador. Trate como possível incidente de dados pessoais: plano de incidente interno em `docs/juridico/08-plano-de-resposta-a-incidentes.md` (consultado só em trecho) **[CONDICIONAL: depende de parecer]**.
   - `dispute.resolved` e `payment.reviewed`: revise o motivo registrado.

**Verificação.** Contagem de `admins` para o id zero; `auth.sessions` sem a conta; S29 e S30 batem com o que foi revisado. Nenhuma alteração indevida ficou pendente.

**Prevenção.** Admin novo só depois de MFA conferida em produção. Revisão mensal de S30 por admin. Sugestão, não existente hoje: exigir dois admins para mudanças de configuração de risco, como a comissão. Hoje `admin_set_setting` aceita um admin só.

---

## 11. Documento vazado no Storage

**Sintoma.** Um documento de prestador (identidade, registro, certidão) apareceu em lugar não autorizado.

**Como o acervo é guardado.** Bucket privado `provider-documents`, caminho `<provider_id>/...`. Leem o dono e o admin. O dono só apaga arquivo ainda não revisado. Admin apaga qualquer arquivo (`ARQUITETURA.md`, "Prestadores"). SQL não apaga objeto do Storage.

**Diagnóstico.**

1. Localize o objeto e o documento. Troque o caminho pelo caminho do arquivo:

```sql
select o.name, o.created_at, d.id as document_id, d.provider_id, d.status
  from storage.objects o
  left join public.provider_documents d on d.storage_path = o.name
 where o.bucket_id = 'provider-documents'
   and o.name = '<caminho>';
```

2. Documentos que já perderam o arquivo:

```sql
select d.id, d.provider_id, d.step, d.status, d.storage_path, o.id as object_id
  from public.provider_documents d
  left join storage.objects o
         on o.bucket_id = 'provider-documents' and o.name = d.storage_path
 where o.id is null;
```

**Correção.**

1. **Contenha.** Remova o arquivo pela API de Storage, como `account-delete` faz (`bucket.remove`), ou pelo painel do Storage **[incerto: caminho no painel não aberto]**. Não apague só a linha de `storage.objects`: o comentário de `anonymize_user` (`20261019000010_privacy_audit.sql`) diz que o SQL não consegue apagar objetos do Storage, então a linha sozinha deixa o conteúdo para trás.
2. **Trate o documento no banco pela tela do admin**, não por SQL. Em `/admin/prestadores/:id`, use "Rejeitar documento" (`components/admin/DocumentCard.tsx`) e recuse com motivo ("arquivo removido por incidente"). Isso muda o status para `rejected`, e o trigger `provider_documents_revoke_approvals` retira a aprovação das ocupações que dependiam do documento (`occupation.approval_revoked`, causa `document_rejected`). Se o registro deve sumir, a exclusão também revoga (causa `document_removed`).
3. **Peça novo envio** ao prestador. O registro novo passa pela análise normal.
4. **Avaliação de incidente.** Se o documento é de identidade de pessoa, trate como incidente de dados pessoais: `docs/juridico/08-plano-de-resposta-a-incidentes.md` (consultado só em trecho). Comunicações a titular e à autoridade **[CONDICIONAL: depende de parecer]**.

**Verificação.** S33 sem o objeto. S32 com o documento recusado e sem arquivo. Nenhuma aprovação ativa apoiada no documento.

**Prevenção.** Bucket privado (já). Links assinados de vida curta e registro de acesso ao Storage **[incerto: recursos da plataforma não conferidos]**. Admin revisa documentos antes de aprovar (regra já existente).

---

## 12. Desligar função ou recurso rapidamente

Alavancas que existem hoje. Confira o efeito de cada uma antes de acionar.

| Alavanca | Efeito verificado no código | Como acionar | Como desfazer | Como confirmar |
|---|---|---|---|---|
| Assistente de IA (`request-assist`, `quote-assist`, `care-summary`) | 429 `assist_rate_limited` antes de qualquer consulta (`takeQuota`, `hourlyLimit < 1`) | `supabase secrets set --project-ref "$SUPABASE_PROJECT_ID" ASSIST_HOURLY_LIMIT=0` | `ASSIST_HOURLY_LIMIT=10` (padrão) | Chamada de teste responde 429 |
| Comissão | `compute_platform_fee` devolve 0 quando `commission_enabled` é falso. Já é o padrão. | Tela `/admin/configuracoes`, ou `admin_set_setting('commission_enabled', 'false'::jsonb)` | Só com parecer jurídico e conta Asaas configurada (ARQUITETURA) | S36 |
| Teste grátis do Pro | Quem nunca assinou deixa de receber teste quando `pro_trial_days` é 0 | `admin_set_setting('pro_trial_days', '0'::jsonb)` logado como admin. Há o campo "Dias de teste" em `/admin/configuracoes` (`components/admin/settingDefs.ts`). Sem sessão de admin, use S35. | `admin_set_setting('pro_trial_days', '30'::jsonb)` | S36 |
| Disparo de mensagens | Para de chamar `notify-dispatch`. Linhas ficam `queued`, vencidas. | S37 | S38 | S39 e S18 |
| Cobrança de um tipo (ex.: `payments-create`) | Sem nova cobrança enquanto a função não existir | `supabase functions delete payments-create --project-ref "$SUPABASE_PROJECT_ID"`. A CLI não remove o arquivo local. | `supabase functions deploy payments-create --project-ref "$SUPABASE_PROJECT_ID"` | Chamada responde 404 |
| Prestador | Sai da busca e da página pública | Tela `/admin/prestadores/:id`: suspender com motivo | Reativar pela mesma tela. Reativar não aprova ocupação. | Busca não lista o prestador |
| Ocupação de um prestador | Sai da busca e para de receber pedidos daquela ocupação | Tela de prestador: retirar aprovação da ocupação, com motivo | Aprovar de novo (exige documentos da política) | Busca |
| Webhook do Asaas (`asaas-webhook`) | **Não recomendado.** Sem `ASAAS_WEBHOOK_TOKEN` ou `ASAAS_API_KEY` a função responde 503 antes de gravar. O Asaas reenvia; após 15 falhas seguidas a fila pode parar. | Remover o secret (`supabase secrets unset`) | Recolocar o secret | S01 e S03 depois do retorno |

Regras que valem para todas as linhas:

- **Não desligue a verificação de JWT de uma função** para contornar um problema. A flag só existe na publicação (`--no-verify-jwt`). A regra está no plano de incidente interno (`docs/juridico/08-plano-de-resposta-a-incidentes.md`, trecho lido nesta revisão).
- **Não há chave em `platform_settings` que desligue cobranças ou o webhook.** `commission_enabled` e `escrow_enabled` só mudam comissão e retenção, e estão `false` (S36). A alavanca de cobrança é o webhook e as credenciais descritas acima.
- **Conta de titular não tem alavanca.** A exclusão é pedido do próprio titular (item 9).

Consultas de apoio:

```sql
select key, value, updated_at
  from public.platform_settings
 where key in ('commission_enabled', 'escrow_enabled', 'pro_trial_days', 'pro_grace_days')
 order by key;
```

Ajuste de `pro_trial_days` sem sessão de admin (use só se a tela de admin estiver indisponível; grava o mesmo `audit_log` com a origem de serviço). **Este bloco não passa por `admin_set_setting`**: não tem a checagem de faixa, e o papel `authenticated` não tem mais escrita em `platform_settings` (migração `20261109400001`), então o bloco só roda com a service role ou no SQL editor. `[decisão do dono]`: manter este procedimento ou retirá-lo.

```sql
begin;
update public.platform_settings
   set value = '0'::jsonb
 where key = 'pro_trial_days';
select private.audit('setting.changed', 'platform_setting', 'pro_trial_days',
                     jsonb_build_object('to', 0, 'reason', 'reparo manual: <motivo>'));
commit;
```

Para o agendador, ler o estado e desligar:

```sql
select jobid, jobname, schedule, active
  from cron.job
 order by jobname;
```

```sql
select cron.unschedule('workeasy-dispatch-notifications');
```

Religar (guarde este bloco antes de desligar):

```sql
select cron.schedule('workeasy-dispatch-notifications', '* * * * *', 'select private.dispatch_notifications()');
```

---

## 13. Checklist de manutenção planejada

**Antes (um a dois dias antes).**

- [ ] Confirme o backup: plano do projeto e janela de retenção (item 7).
- [ ] Faça um dump manual: `supabase db dump --linked -f <caminho fora do repositório>`. O arquivo tem dados pessoais: guarde fora do repositório.
- [ ] Registre o estado: S39 (agendamentos), S40 (migrações), S36 (chaves), S16 (fila), S01 (eventos parados).
- [ ] Dry run: `supabase db push --linked --skip-vault --dry-run`.
- [ ] Teste local: `supabase db reset` e `supabase test db`.
- [ ] Avise quem opera. Defina a janela.

**Durante.**

- [ ] Pause o disparo de mensagens (S37). Guarde o bloco de religamento (S38).
- [ ] Aplique as migrações pelo workflow: dry run primeiro, depois a aplicação.
- [ ] Publique as funções pelo workflow, com as flags de `asaas-webhook` e `notify-dispatch`.
- [ ] Não troque token ou chave sem o procedimento do item 6.

**Depois.**

- [ ] Religue o disparo (S38) e confirme em S39.
- [ ] S01 sem linhas. S18 sem linhas depois de dois minutos.
- [ ] S10 sem conta `creating` antiga. S14 sem divergências.
- [ ] S40 mostra a versão nova.
- [ ] Teste de fumaça só em homologação. Não faça cobrança real em produção para testar.
- [ ] Registre no histórico de operação: horário, versão publicada, resultado de cada consulta, quem executou.

---

## Apêndice A. Lacunas e defeitos encontrados (não corrigidos)

Estes pontos foram encontrados ao ler o código e conferir o banco. Não foram corrigidos, porque a tarefa é documentação. Cada um vai para a fila de correção.

1. **Exportação do titular sempre omite pagamentos.** `account-export` usa `select *` em `payments` e `provider_payment_accounts`. O papel `authenticated` não tem esse privilégio (conferido: `permission denied for table payments`). A consulta falha mesmo sem linhas, então toda exportação sai com essas tabelas em `unavailable`. Uma correção em `EXPORT_PLAN` deve listar as colunas autorizadas, sem `raw`.
2. **Evento sem cobrança não se reaplica.** Quando a cobrança ainda não existe no banco, o webhook responde 200 como `unknown_payment` e marca o evento como concluído. A corrida é real: `payments-create` grava a linha **depois** do `POST /payments` no Asaas. Não há reprocessamento automático nem alerta.
3. **Transição recusada some.** Em `asaas-webhook`, quando a regra do banco recusa a transição do atendimento, a função só registra no log e na resposta. Não grava `payment_event` nem `audit_log`. O pagamento fica `received` e o atendimento fica para trás sem trilha no banco.
4. **Exclusão de conta pode parar em `processing`.** Se `deleteAuthUser` falha depois da anonimização, a função responde 500 e não marca `failed`. A linha de `data_requests` fica em `processing`. A anonimização já aconteceu.
5. **Ativação de conta pode criar subconta duplicada.** Se a função cai depois de `createAccount` e antes de `savePaymentAccount`, a chave se perde e a reserva é retomada depois de 5 minutos, chamando `createAccount` de novo. Comportamento do Asaas para CPF ou CNPJ repetido **[incerto]**.
6. **Pro não rebaixa sem job.** Em `ed8aa38`, `providers.plan` não volta a `free` quando o período pago acaba e nenhum evento chega. O job que faz isso (`workeasy-expire-pro-plans`) está no HEAD `5805947` e na base local, mas não em `ed8aa38`; não verifiquei a aplicação em produção.
7. **Duas fontes para a carência do Pro.** `PRO_GRACE_DAYS` (função) e `platform_settings.pro_grace_days` (job [SEG-S1]) precisam ser iguais, e nada as sincroniza.
8. **Duplicata de notificação.** Se a gravação do resultado falha depois do envio, a linha fica em `sending` e é reenviada depois de 10 minutos. Não confirmei se a Cloud API do WhatsApp aceita chave de idempotência **[incerto]**.
9. **Agendador silencioso.** O job de disparo aparece como `succeeded` mesmo com o Vault vazio (conferido localmente: execuções `succeeded` sem chaves). Só `net._http_response` mostra a chamada real.
10. **Aprovação sobrevive a arquivo perdido.** Restauro ou sumiço de arquivo não revoga a aprovação. O trigger `provider_documents_revoke_approvals` (disparado por mudança de `status`, `step` ou `provider_id`, e por exclusão) revoga só quando o passo deixa de estar coberto por documento aceito.
11. **Reregistro de webhook de subconta não existe.** Trocar `ASAAS_WEBHOOK_TOKEN` exige atualizar cada subconta, e nada no código faz isso.
12. **Documentação desatualizada.** `supabase/functions/README.md` está correto: `verify_jwt = false` para `asaas-webhook` e `notify-dispatch` está em `supabase/config.toml` (linhas 408 a 411). Errado é o comentário do workflow `deploy-supabase.yml` ("config.toml has no [functions] entries"); a flag `--no-verify-jwt` é redundante, mas não quebra. `ARQUITETURA.md` (linhas 417 a 418) lista dois agendamentos; o banco local tem sete: `notification-counts-retention`, `product-events-retention`, `workeasy-booking-reminders`, `workeasy-dispatch-notifications`, `workeasy-expire-booking-requests`, `workeasy-expire-pro-plans` e `workeasy-expire-stale`. Cinco não estão listados no `ARQUITETURA.md`, todos com migração no HEAD.
13. **Entrega do Asaas.** `ARQUITETURA.md` afirma que o Asaas "entrega ao menos uma vez e fora de ordem". A página "Sobre os webhooks" confirma entrega "at least once" (o mesmo evento pode chegar mais de uma vez). Sobre ordem, ela só remete à página de tipos de envio (sequencial ou não sequencial), não aberta **[incerto]**.
14. **Deriva da base local.** O banco local tem as 36 migrações de HEAD `5805947`; em `ed8aa38` faltam 21 (`20261108100000` e `20261109000001` a `20261109300006`). Testes e consultas feitos nele refletem o HEAD, não necessariamente o `main` nem a produção.
15. **Verificação de MFA para admin não conferida.** A configuração local desliga MFA TOTP. Não verifiquei a exigência em produção.
16. **Regra de migração contraditória.** O plano de trabalho diz para nunca editar migração aplicada. `ARQUITETURA.md`, na seção "Testes e CI", diz para editar a migração, rodar `supabase db reset` e gerar os tipos quando a assinatura do banco muda. Vale definir uma regra única.

## Apêndice B. Lista de consultas

Os 51 blocos SQL deste documento correspondem a 50 consultas distintas, numeradas S01 a S50 (mapa abaixo). A consulta de S39 aparece duas vezes, nas seções 4 e 12. S43 foi trocada pela consulta sobre `audit_log` descrita no item 2. Dois blocos (S09 e S44) terminam com a exceção `not_allowed` quando o atendimento não existe, o que confirma a checagem. Nenhum bloco foi executado com dado real.

| Seção | Consultas |
|---|---|
| 1. Webhook | S01 a S05 |
| 2. Cobrança paga | S06 a S09, S43, S44 |
| 3. Conta de recebimento | S10 a S13, S45 |
| 4. Assinatura Pro | S14, S15, S39, S46 |
| 5. Notificações | S16 a S23 |
| 6. Segredos | S47, S50 |
| 7. Restauração | S34 |
| 8. Migração | S40, S41 |
| 9. Titular | S24 a S28, S42, S48, S49 |
| 10. Admin | S29 a S31 |
| 11. Storage | S32, S33 |
| 12. Alavancas | S35 a S39 |
