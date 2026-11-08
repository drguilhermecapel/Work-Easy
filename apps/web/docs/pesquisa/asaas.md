# Pesquisa: Asaas para o WorkEasy (capacidades, tarifas, sandbox, limites)

> Rascunho para revisão de advogado. Não é parecer jurídico.

**Data da consulta:** 2026-11-08.
**Para quem:** dono do WorkEasy, advogado, quem roda os testes de sandbox.
**Escopo:** o que o Asaas oferece e o que a documentação pública garante, comparado ao que o código de `apps/web/supabase/functions` assume. Nenhum arquivo de código foi alterado. Nenhuma chamada foi feita à sandbox nem à produção.

## Legenda

- **[CONFERIDO]**: a página oficial foi aberta nesta pesquisa e diz isso. A seção 2 traz a URL e a data de atualização.
- **[CÓDIGO]**: afirmação sobre o WorkEasy, conferida no arquivo indicado.
- **[PLANEJADO]**: não existe no código hoje.
- **[CONDICIONAL: depende de parecer]**: tema jurídico. O texto registra fato da documentação, não opinião.
- **[incerto]**: a documentação aberta não diz, ou a fonte não pôde ser aberta. Vai para o plano de testes (seção 12).
- **[derivação]**: conclusão lógica a partir de um fato conferido. Não está escrita em nenhuma página.

## Limites desta pesquisa

- As citações entre aspas vêm do leitor de páginas (WebFetch), que resume o conteúdo com um modelo. Quando a frase não foi conferida palavra por palavra, ela aparece como *paráfrase*. Antes de usar qualquer frase em peça jurídica, conferir a redação exata na página.
- O limite de buscas web do turno foi atingido: uma busca concluiu e a seguinte foi recusada. Por isso as páginas foram localizadas pelos índices `llms.txt` de docs.asaas.com (`/docs/llms.txt` e `/reference/llms.txt`).
- As páginas de tarifas em asaas.com redirecionam para login. Não há tabela de tarifas aberta (seção 9).
- Os `updatedAt` são os do front matter da página, como o leitor os retornou. Quando não havia data absoluta, está indicado.

---

## 1. Resumo para decisão

1. **Bloqueante: conta-raiz PJ e modelo BaaS.** Criar subcontas pela API exige conta-pai de pessoa jurídica (CNPJ) e o modelo BaaS habilitado pelo gerente de contas. Sem isso, a documentação diz que as subcontas são criadas "fora dessa estrutura". [CONFERIDO]. O `DECISOES.md` (seção 8, item 3) ainda lista a abertura da pessoa jurídica como tarefa do dono. [CÓDIGO: `asaas-onboard` não verifica nenhuma das duas condições].
2. **Bloqueante para o lançamento: período de avaliação regulatória.** Para serviços via API, a documentação fala em até 10 subcontas, até R$ 2.000,00 em cobranças por subconta e até 60 dias. Depois disso, a criação de subcontas, cobranças, assinaturas e links fica bloqueada até o fim do processo. A página não diz se o bloqueio atinge também as cobranças e assinaturas emitidas pela conta-raiz, que é onde fica a assinatura Pro. [CONFERIDO; pergunta ao Asaas].
3. **Aprovação da subconta não é tratada.** `asaas-onboard` grava `status = 'active'` logo depois de criar a conta. A documentação diz que a conta só está "integralmente aprovada" quando `general` retorna `APPROVED`. [CONFERIDO; CÓDIGO].
4. **Split: a fórmula confere; quem paga a tarifa não está escrito.** O `percentualValue` é aplicado sobre o `netValue` (valor da cobrança após a tarifa do Asaas). Isso confirma a premissa de `split.ts`. Com comissão desligada, que é o padrão, o código envia 100%. Pela fórmula, o prestador fica com todo o líquido e a tarifa sai dele. [CONFERIDO; derivação; decisão do dono].
5. **Divergência de split sem tratamento.** Em `asaas-events.ts`, `PAYMENT_SPLIT_DIVERGENCE_BLOCK`, `PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED` e `PAYMENT_SPLIT_CANCELLED` não têm efeito. A documentação diz que a correção tem prazo de 2 dias úteis e que, sem correção, o split é cancelado. [CONFERIDO; CÓDIGO].
6. **Estorno gravado como final cedo demais.** O código grava `refunded` assim que o Asaas aceita o pedido. A documentação descreve o estado "estorno em andamento" (`PAYMENT_REFUND_IN_PROGRESS`), e `refunded` é terminal em `nextPaymentStatus`. [CONFERIDO; CÓDIGO].
7. **Cancelar o teste grátis apaga a cobrança pendente.** A documentação diz que `DELETE /v3/subscriptions/{id}` exclui as cobranças pendentes ou vencidas e mantém as pagas. Isso bate com o código. Mas a documentação não diz quando a primeira cobrança é gerada, e o código lê `invoiceUrl` logo após criar a assinatura. [CONFERIDO; CÓDIGO; incerto].
8. **A Conta Escrow do Asaas é outro produto.** Existe uma "Conta Escrow" configurável por subconta pela API, que retém valores recebidos "até o encerramento da garantia". O código não chama essa API. O campo `escrow` e o status `held` são internos ao WorkEasy. A documentação não diz quem detém os valores nem o enquadramento regulatório. [CONFERIDO; CONDICIONAL: depende de parecer].
9. **Pix Automático existe, mas não está no código.** Há autorização do pagador e débito recorrente via Pix. A documentação aberta não diz se funciona com subcontas nem com split. Assinatura com `billingType = PIX` não é Pix Automático. [CONFERIDO; PLANEJADO].
10. **Tarifas não obtidas.** Nenhuma tarifa oficial foi conferida. Os R$ 2 por cobrança citados no `DECISOES.md` (seção 3) continuam sem fonte. [incerto].

---

## 2. Fontes abertas nesta pesquisa

Data de acesso de todas: 2026-11-08.

| Página | updatedAt (front matter) | Usada para |
|---|---|---|
| https://docs.asaas.com/docs/llms.txt | sem data | índice dos guias |
| https://docs.asaas.com/reference/llms.txt | sem data | índice da referência |
| https://docs.asaas.com/docs/sobre-os-webhooks | 2026-08-27T13:46:14Z | header de token, payload, entrega ao menos uma vez |
| https://docs.asaas.com/reference/criar-subconta | n.d. | campos de `POST /v3/accounts` |
| https://docs.asaas.com/reference/criar-nova-assinatura | n.d. | campos de `POST /v3/subscriptions` |
| https://docs.asaas.com/reference/criar-nova-cobranca | n.d. | campos de `POST /v3/payments` (esquema de split não apareceu nesta render) |
| https://docs.asaas.com/reference/criar-nova-cobranca.md | n.d. | esquema de split (`PaymentSplitRequestDTO`) e campos de resposta |
| https://docs.asaas.com/reference/remover-assinatura | n.d. | `DELETE /v3/subscriptions/{id}` |
| https://docs.asaas.com/reference/excluir-cobranca | n.d. | `DELETE /v3/payments/{id}` |
| https://docs.asaas.com/reference/estornar-cobranca | n.d. | `POST /v3/payments/{id}/refund` |
| https://docs.asaas.com/docs/payment-split | 2026-10-09T19:45:54Z | índice da seção de split (sem regras) |
| https://docs.asaas.com/docs/split-faq | 2026-10-09T19:54:10Z | `netValue`, estorno de split, bloqueio por divergência |
| https://docs.asaas.com/docs/split-in-single-payments | 2026-10-13T13:41:13Z | regras de split em cobrança única; `PAYMENT_SPLIT_DONE` |
| https://docs.asaas.com/docs/split-for-accounts-with-escrow-account | 2026-10-09T19:54:46Z | split e Conta Escrow |
| https://docs.asaas.com/docs/webhook-para-cobrancas | "Updated 12 days ago" (sem data absoluta) | lista de eventos de cobrança |
| https://docs.asaas.com/docs/eventos-para-assinaturas | sem front matter | eventos de assinatura |
| https://docs.asaas.com/docs/autenticacao | HTTP 404 | não aberta |
| https://docs.asaas.com/docs/autenticação-1 | 2026-10-13T13:37:54Z | header `access_token` |
| https://docs.asaas.com/docs/chaves-de-api | 2026-10-13T13:03:17Z | chave por ambiente; chave mostrada uma vez; inatividade |
| https://docs.asaas.com/docs/subcontas | 2026-09-24T18:55:50Z | conta-pai PJ; subcontas |
| https://docs.asaas.com/docs/criação-de-subcontas-baas | 2026-10-27T17:18:09Z | BaaS; período de avaliação regulatória |
| https://docs.asaas.com/docs/detalhamento-do-fluxo-de-aprovação-de-subcontas | 2026-08-28T12:50:32Z | `general = APPROVED`; endpoints de status e documentos |
| https://docs.asaas.com/reference/criar-novo-webhook | 2026-09-08T20:05:50Z | campos de `POST /v3/webhooks`; authToken 32 a 255; até 10 webhooks |
| https://docs.asaas.com/docs/tipos-de-envio | 2026-08-28T11:37:19Z | SEQUENTIALLY e NON_SEQUENTIALLY |
| https://docs.asaas.com/docs/penalização-de-filas | 2026-10-27T18:53:51Z | 15 falhas seguidas; 14 dias de retenção; penalidade |
| https://docs.asaas.com/docs/retries-e-idempotência | 2026-10-13T13:03:33Z | repetição, `externalReference`, consulta antes de criar |
| https://docs.asaas.com/docs/requisições-bloqueadas-por-ausência-de-controle-de-limites | 2026-09-01T13:50:42Z | cota, concorrência, 429 |
| https://docs.asaas.com/docs/fluxo-de-bloqueio-de-assinatura-por-divergência-de-split | 2026-08-26T14:53:32Z | bloqueio de assinatura por divergência de split |
| https://docs.asaas.com/docs/como-gerar-novas-cobranças-de-uma-assinatura.md | 2026-08-03T18:56:56Z | geração de cobranças da assinatura; carnê na sandbox |
| https://docs.asaas.com/docs/sandbox.md | 2026-10-27T18:53:35Z | diferenças da sandbox |
| https://docs.asaas.com/docs/como-testar-funcionalidades.md | 2026-10-13T13:03:21Z | índice dos procedimentos de teste |
| https://docs.asaas.com/docs/testar-pagamento-de-qrcodes-pix.md | 2026-08-03T18:46:14Z | Pix na sandbox (QR estático) |
| https://docs.asaas.com/docs/testando-pagamento-com-cartão-de-crédito.md | 2026-11-05T13:42:22Z | cartões de teste |
| https://docs.asaas.com/docs/pix-automatico | 2026-09-25T17:45:23Z | o que é Pix Automático |
| https://docs.asaas.com/docs/pix-automatico-implementacao.md | 2026-09-25T17:43:27Z | endpoint de autorização; `paymentCreationMode` |
| https://docs.asaas.com/docs/diferença-entre-pix-automático-e-assinaturas-1.md | 2026-10-27T18:51:47Z | diferença para assinatura |
| https://docs.asaas.com/docs/introducao-conta-escrow.md | 2026-09-02T12:44:11Z | o que é a Conta Escrow |
| https://docs.asaas.com/docs/cobrança-da-taxa-por-subconta-configurada.md | 2026-08-28T14:15:08Z | mensalidade do escrow; `isFeePayer` |
| https://docs.asaas.com/docs/como-o-asaas-trata-receitas-na-conta.md | 2026-07-31T13:48:42Z | receitas (sem tarifas) |
| https://www.asaas.com/precos | redirecionada para `/login/auth` (302) | não obtida |
| https://www.asaas.com/tarifas | redirecionada para `/login/auth` (302) | não obtida |

Foram abertas 38 páginas (incluindo os dois índices). Não foram abertas: a página `/docs/autenticacao` (404) e as duas páginas de tarifas (redirecionamento para login).

---

## 3. Matriz: o que o produto usa x o que a documentação garante

| ID | Capacidade | No WorkEasy | Documentação garante [fonte] | Código assume | Situação |
|---|---|---|---|---|---|
| C1 | Autenticação | `_shared/asaas-client.ts`, `request` | Header `access_token`. Sem ele, ou com chave inválida ou de outro ambiente, responde 401 [autenticacao-1] | Mesmo header; URL precisa ser `https` | OK |
| C2 | Ambiente | `ASAAS_BASE_URL` (ARQUITETURA) | Sandbox em `https://api-sandbox.asaas.com/v3`. Contas, dados, configurações e chaves não são compartilhados com a produção [sandbox; chaves-de-api] | Padrão é a sandbox | OK |
| C3 | Chave da subconta | `asaas-onboard`, Vault | Chave mostrada uma só vez; se perdida, cria-se outra [chaves-de-api]. Desabilitada após 3 meses sem uso e expirada após 6 (*paráfrase do leitor*) [chaves-de-api] | Guarda no Vault. Não há rotação nem checagem de inatividade | Lacuna (R9) |
| C4 | Criar subconta | `asaas-onboard`, `createAccount` | `POST /v3/accounts`. Campos obrigatórios conferem. Conta-pai PJ (CNPJ). Resposta traz `apiKey` e `walletId` [criar-subconta; subcontas] | Envia os campos. Aceita `apiKey` ou `accessToken.apiKey` | Campos OK. PJ e BaaS não verificados (R1, R2). `accessToken` não aparece na página |
| C5 | Status da subconta | `asaas-onboard` | `GET /v3/myAccount/status`, campo `general`. `APPROVED` = integralmente aprovada. Documentos pendentes em `GET /v3/myAccount/documents`. Webhook `ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED`. Esperar 15 s após criar a conta antes de consultar documentos [detalhamento] | Nada disso. Grava `status: 'active'` e `own_charges_enabled` true | Divergência (R4) |
| C6 | Webhook da subconta | `asaas-onboard`, `subaccountWebhook` | `POST /v3/webhooks` aceita `name`, `url`, `email`, `enabled`, `interrupted`, `sendType`, `events`, `authToken` (32 a 255 caracteres), `apiVersion` (inteiro; exemplo 3). Até 10 webhooks por conta [criar-novo-webhook] | Envia `webhooks[]` dentro de `POST /v3/accounts`. Token derivado com 64 caracteres hex. `webhook_registered` indica só que o campo foi enviado | Não confirmado (R5). A referência de criação não mostra os sub-campos |
| C7 | Cobrança com split | `payments-create`, `_shared/split.ts` | `split[]` com `walletId` e `percentualValue` (ou `fixedValue`). `percentualValue` é calculado sobre `netValue`. `fixedValue` não pode passar do valor líquido [split-faq; criar-nova-cobranca.md] | `percentualValue` truncado em 4 casas. Não usa `fixedValue` | Fórmula OK. Limite de 4 casas e soma até 100% vieram só de resumo de busca (T6, T7). Quem paga a tarifa não está escrito (R8) |
| C8 | Cobrança Pix, cartão e boleto | `BILLING_TYPE`, `payments-create` | `billingType`: `PIX`, `CREDIT_CARD`, `BOLETO`, `UNDEFINED`. Resposta traz `invoiceUrl`, `bankSlipUrl`, `netValue`. Criar cobrança não confirma pagamento [criar-nova-cobranca.md] | Mesmos valores. Grava `invoice_url`. Pix usa `GET /payments/{id}/pixQrCode` | OK. A página do QR code não foi aberta |
| C9 | Cancelar cobrança | `_shared/void-payments.ts`, `payments-void` | `DELETE /v3/payments/{id}` remove a cobrança. Não é estorno para valor já pago. Resposta `{deleted, id}`. Documentados: 200, 400, 401, 404. 409 não está documentado. Cobrança removida pode ser restaurada com o mesmo ID [excluir-cobranca] | 404 conta como feito. 400 e 409 significam "já removida ou já paga" | 409 não confere (R11, T18) |
| C10 | Estorno | `asaas-webhook`, `refundAfterCancel`; `client.refundPayment` | `POST /v3/payments/{id}/refund`: total ou parcial, para cartão de crédito e Pix. Boleto tem endpoint próprio. Sem campos, o estorno é integral. Em cobrança com split, os repasses são estornados [estornar-cobranca; split-faq] | Grava `refunded` ao receber 2xx | Divergência (R10, R11) |
| C11 | Assinatura | `subscriptions-manage`, ação subscribe | `POST /v3/subscriptions`. `nextDueDate` é o "vencimento da primeira cobrança". Ciclo `MONTHLY`. Cobranças são geradas gradualmente. Criar a assinatura não confirma pagamento [criar-nova-assinatura; como-gerar] | `nextDueDate` futura no teste. Lê `invoiceUrl` logo depois | Campos OK. Geração da primeira cobrança incerta (R13, T11) |
| C12 | Cancelar assinatura | `subscriptions-manage`, ação cancel | `DELETE /v3/subscriptions/{id}` encerra a recorrência. Exclui cobranças pendentes ou vencidas. Mantém as pagas. Campo `deleted`. Evento `SUBSCRIPTION_DELETED` [remover-assinatura] | Chama DELETE. Grava `canceled`. Pro vale até o fim do período | OK |
| C13 | Cobranças da assinatura | `subscriptions-manage` | `GET /v3/subscriptions/{id}/payments` (referência citada no código; página não aberta) | Lê `data[0].invoiceUrl` | Formato não conferido (T11) |
| C14 | Webhook: origem | `asaas-webhook` | Header `asaas-access-token`, enviado em todas as notificações. Validar antes de processar [sobre-os-webhooks] | Compara com o token da conta-raiz ou com o token derivado da subconta. Sem match, 401 | OK |
| C15 | Webhook: entrega | `asaas-webhook`, `payment_events` | Entrega "ao menos uma vez". O mesmo `id` pode chegar mais de uma vez. SEQUENTIALLY preserva a ordem, mas não impede reenvio. Responder 200 após persistir [sobre-os-webhooks; tipos-de-envio] | Idempotência pelo `asaas_event_id`. Avanço de status só para frente. Relê a cobrança no Asaas antes de agir | OK |
| C16 | Webhook: fila | ARQUITETURA; `asaas-webhook` | Qualquer resposta fora de 2xx é falha. Após 15 falhas seguidas, a fila é interrompida. Eventos ficam retidos por até 14 dias [penalizacao-de-filas] | 500 só para falha transitória. 200 para erro que se repetiria | Desenho OK. Não há runbook de reativação (R16) |
| C17 | Eventos de cobrança | `_shared/asaas-events.ts`, `PAYMENT_EFFECTS` | 30 nomes na página de eventos de cobrança [webhook-para-cobrancas] | Os 30 nomes estão mapeados. Split e reembolso em `NONE`, exceto estorno e recebimento | Nomes OK. Efeito de split não tratado (R7) |
| C18 | Eventos de assinatura | `asaas-events.ts`, `SUBSCRIPTION_EFFECTS` | 7 nomes [eventos-para-assinaturas] | Os 7 estão mapeados | OK |
| C19 | Eventos da subconta | `SUBACCOUNT_WEBHOOK_EVENTS` (`asaas-onboard`) | Os 11 nomes existem na página de eventos de cobrança | Lista de 11 eventos, sem `PAYMENT_SPLIT_*` e sem `PAYMENT_REFUND_IN_PROGRESS` | OK para cobrança própria (R20) |
| C20 | Webhook da conta-raiz | fora do código | Configurado no painel ou por `POST /v3/webhooks` [criar-novo-webhook] | Assume uma configuração que não está no repositório: URL, `ASAAS_WEBHOOK_TOKEN` e lista de eventos | Não verificável no repositório (R20) |
| C21 | Limites de chamada | `callAsaas` (`_shared/handler-kit.ts`) | Cota de 25 mil requisições em 12 horas por conta. 50 GET simultâneos. Resposta 429 com cabeçalhos `RateLimit-*` [requisicoes-bloqueadas] | Só converte o erro. Não repete nem espera | Lacuna (R18) |
| C22 | Idempotência de criação | `payments-create`; ARQUITETURA | Não há chave de idempotência. Recomenda-se consultar antes de repetir, usar `externalReference` estável e não criar outra entidade para a mesma intenção [retries-e-idempotencia] | `externalReference` = `booking:<id>`. Índice único parcial no banco. Não consulta o Asaas antes de criar | Parcial (R17) |
| C23 | Conta Escrow (Asaas) | não usado | Configurada por subconta pela API. Retém "até o encerramento da garantia". Taxa mensal por subconta; quem paga é definido por `isFeePayer`. Sem webhook de mudança de status do escrow [intro-escrow; split-escrow; taxa-escrow] | Não chama API de escrow. `escrow` e `held` são internos | Não usado. Nome parecido (R19) |
| C24 | Pix Automático | não existe | `POST /v3/pix/automatic/authorizations`. `paymentCreationMode`: `MANUAL` (padrão) ou `SUBSCRIPTION`. QR da primeira cobrança registra o consentimento. Ativa após confirmação da instituição do pagador. A conta precisa ser elegível [pix-automatico-implementacao; pix-automatico] | Nada | [PLANEJADO] |

Itens conferidos na matriz: 24.

---

## 4. Divergências e riscos

Severidade: **B** = bloqueia ativação em produção; **A** = alta, corrigir antes de cobrar dinheiro real; **M** = média; **b** = baixa.

| ID | Sev. | Divergência ou risco | Fonte | Ação sugerida | Teste |
|---|---|---|---|---|---|
| R1 | B | Conta-pai precisa ser PJ para criar subcontas via API. O código não checa o tipo da conta-raiz. O DECISOES lista a abertura da PJ como tarefa do dono | subcontas (2026-09-24): "A criação de subcontas via API é permitida para contas-pai de pessoa jurídica (CNPJ)." | Confirmar a natureza da conta-raiz antes de qualquer teste de onboarding com dados reais | T2 |
| R2 | B | Modelo BaaS precisa estar habilitado pelo gerente de contas. Criar pela API sem isso "resultará na criação de subcontas fora dessa estrutura". O código não verifica | criacao-de-subcontas-baas (2026-10-27) | Pedir por escrito ao gerente de contas a estrutura habilitada para a conta do WorkEasy | T2 |
| R3 | B | Período de avaliação regulatória. Limites: 10 subcontas; R$ 2.000,00 em cobranças por subconta; até 60 dias. Ao atingir qualquer limite, bloqueia criação de subcontas e emissão de cobranças, assinaturas e links até o fim do processo. Homologação pode ser pedida. Não está escrito se a conta-raiz entra. Não há tratamento específico no código | criacao-de-subcontas-baas (2026-10-27) | Perguntar ao Asaas se o limite vale para a conta-raiz (assinatura Pro). Ter um plano para o caso de bloqueio | T29 |
| R4 | A | Status de aprovação ignorado. `asaas-onboard` grava `active` e responde `own_charges_enabled: true` sem consultar `general`. O fluxo de cobrança checa só a existência do `walletId` (a leitura de `getProviderWallet` não foi aberta). A documentação não diz se subconta sem aprovação pode receber split | detalhamento-do-fluxo (2026-08-28) | Consultar `GET /v3/myAccount/status` antes de liberar cobrança própria e de marcar `active`. Assinar `ACCOUNT_STATUS_*` | T4 |
| R5 | A | Webhook da subconta enviado dentro de `POST /v3/accounts`. A referência de criação não mostra os sub-campos. `webhook_registered: true` só diz que o campo foi enviado. Se o Asaas ignorar, eventos de cobrança própria nunca chegam | criar-subconta (sem data); criar-novo-webhook (2026-09-08) | Listar os webhooks da subconta logo após o onboarding e guardar o resultado. Se vazio, registrar via `POST /v3/webhooks` | T3 |
| R6 | M | Comentário em `asaas-onboard` atribui a `accessToken.apiKey` à página de criação de subconta. A página aberta só fala em `apiKey` na resposta. O fallback é inofensivo, mas a fonte citada não confirma | criar-subconta | Corrigir o comentário ou confirmar com a resposta real | T2 |
| R7 | A | Divergência de split e cancelamento de repasse sem efeito no código. A documentação diz que a cobrança pode ficar bloqueada por divergência; a correção tem 2 dias úteis; sem correção, o split é cancelado e chega `..._DIVERGENCE_BLOCK_FINISHED`. Não diz qual é o status da cobrança durante o bloqueio. Se o status ficar `RECEIVED`, o atendimento vai a `paid` e o prestador não recebe o repasse, sem alerta | webhook-para-cobrancas; split-faq (2026-10-09) | Tratar os três eventos: registrar em `audit_log` e entrar em "Exigem atenção" no admin. Assinar `PAYMENT_SPLIT_*` no webhook da conta-raiz | T9 |
| R8 | A | Quem paga a tarifa com split. A documentação aberta não diz. Derivação: com `percentualValue` sobre o líquido, a tarifa se divide na proporção do split. O prestador arca com P × tarifa e a plataforma com (1 − P) × tarifa. Com P = 100% (comissão desligada), o prestador arca com toda a tarifa. O comentário de `split.ts` diz que a plataforma "absorve a parte proporcional da tarifa", o que vale só com comissão | split-faq; split-in-single-payments; comentário de `split.ts` | Decisão do dono sobre quem paga a tarifa no lançamento. Escrever isso nos termos do prestador | T5, T6 |
| R9 | M | Chave da subconta sem rotação. Desabilitada após inatividade (3 meses) e expirada (6 meses), em paráfrase do leitor. `subaccount_key_rejected` vira evento "não verificável". Void e estorno de cobrança própria provavelmente falham | chaves-de-api (2026-10-13) | Job mensal que faz uma chamada `GET` com cada chave. Procedimento de criação de nova chave | T32 |
| R10 | A | Estorno gravado como `refunded` ao receber 2xx. A documentação descreve `PAYMENT_REFUND_IN_PROGRESS` ("será aplicado depois que o seu agendamento de liquidação"). `refunded` é terminal no código | estornar-cobranca; webhook-para-cobrancas (paráfrase do leitor) | Gravar `refund_requested` e só marcar `refunded` em `PAYMENT_REFUNDED`. Ou manter e tratar a reversão | T20 |
| R11 | A | Estorno com split reverte os repasses (documentação). Se a subconta já sacou, o estorno pode falhar. A documentação diz que o estorno falha com 400 quando falta saldo, mas o exemplo é Pix logo após o recebimento. Para subconta não há regra publicada. O código trata falha como `payment.refund_failed` | split-faq (2026-10-09): "The transfers related to the charge are also refunded." | Definir regra de saldo e de cobrança do prestador. Monitorar `refund_failed` | T21, T22 |
| R12 | M | Cancelar cobrança já paga. A documentação diz que `DELETE` "não representa estorno" e não lista 409. O código trata 400 e 409 como "já paga", e depende do webhook para reembolsar | excluir-cobranca (sem data) | Confirmar o código de resposta. Se for 409, nada muda; se for outro, ajustar `payments-void` | T18 |
| R13 | M | Primeira cobrança da assinatura. A documentação não diz quando é gerada. O código lê `listSubscriptionPayments(...)[0].invoiceUrl` logo após criar. O formato `data` não foi conferido. Em trial, pode não existir cobrança e `invoice_url` vem `null`. Em assinatura sem trial, com vencimento hoje, pode acontecer o mesmo, e a tela não teria link | criar-nova-assinatura; como-gerar (2026-08-03) | Testar na sandbox. Se não houver cobrança, buscar por `externalReference` na hora de mostrar o link | T11, T12 |
| R14 | M | Assinatura com cartão. O código manda `billingType = CREDIT_CARD` sem dados de cartão nem token. A página de assinatura com cartão não foi aberta. A documentação diz que, no cartão, "o pagamento pode ser processado automaticamente nos vencimentos", o que exige um cartão cadastrado | diferenca-entre-pix-automatico-e-assinaturas-1 (2026-10-27) | Ler a página de assinatura com cartão e testar. Se exigir cartão, o fluxo de Pro com cartão não existe hoje | T16 |
| R15 | M | Lista de status do Asaas não conferida. `ASAAS_PAID` e `ASAAS_UNPAID` incluem `RECEIVED_IN_CASH`, `DUNNING_RECEIVED`, `AWAITING_RISK_ANALYSIS`, `REFUNDED`, `CHARGEBACK_*`. Na página de criação de cobrança, só `PENDING`, `RECEIVED`, `CONFIRMED` e `OVERDUE` foram conferidos | criar-nova-cobranca.md (lista parcial) | Conferir o enum completo de `status` na referência de cobrança | T14, T15 |
| R16 | A | Fila de webhook. Após 15 falhas seguidas, a fila é interrompida. Intervalos crescem de 30 s até 3 h. Eventos ficam 14 dias. Com `SEQUENTIALLY`, "um evento lento ou com falha pode atrasar os eventos seguintes". O código devolve 500 para falha transitória, então uma queda do banco com 15 tentativas pausa a fila da subconta ou da conta-raiz. Não há runbook | penalizacao-de-filas (2026-10-27); tipos-de-envio (2026-08-28) | Escrever o runbook a partir de "Como reativar fila interrompida" (página não aberta). Monitorar `penalizedRequestsCount` (`GET /v3/webhooks/{id}`) | T27 |
| R17 | M | Criação sem consulta prévia. A documentação recomenda consultar antes de repetir. O código usa só o banco, e a janela entre o `POST` e o `insert` existe (ARQUITETURA reconhece) | retries-e-idempotencia (2026-10-13) | Antes de criar em uma repetição, buscar no Asaas por `externalReference` (endpoint de listagem a confirmar) | T30 |
| R18 | M | Limite de chamadas. Cota de 25 mil requisições em 12 horas por conta, 50 GET simultâneos, 429 com `RateLimit-*`. `callAsaas` não trata 429 | requisicoes-bloqueadas (2026-09-01) | Tratar 429 com espera progressiva e teto de tentativas. Contar chamadas por assinatura por ciclo | T31 |
| R19 | A | Conta Escrow do Asaas e campo `escrow` do WorkEasy têm nomes parecidos e significados diferentes. Se o dono ativar a Conta Escrow no painel de uma subconta, o WorkEasy não sabe, e não há webhook de mudança de status. O status `paid` pode coexistir com saldo indisponível | intro-escrow (2026-09-02); split-escrow (2026-10-09) | Não ativar no painel sem parecer. Incluir no parecer a pergunta da seção 13 (L1) | T35 |
| R20 | M | Webhook da conta-raiz fora do repositório. A lista de eventos precisa incluir `PAYMENT_SPLIT_*`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_PARTIALLY_REFUNDED`, `SUBSCRIPTION_*` e, se usado, `PIX_AUTOMATIC_RECURRING_*`. A subconta recebe só 11 eventos | criar-novo-webhook; eventos-para-assinaturas | Checklist de configuração do webhook da conta-raiz, no repositório (docs) e no painel | T24 |
| R21 | b | `apiVersion` usa 3 (exemplo da documentação). Não há lista de valores permitidos | criar-novo-webhook | Manter e registrar a versão testada | T3 |
| R22 | M | Assinatura com `billingType = PIX` é cobrança manual por ciclo, não Pix Automático. A interface não deve chamar isso de "débito automático" | diferenca-entre-pix-automatico-e-assinaturas-1 | Texto de produto alinhado com a documentação | seção 11 |
| R23 | M | Sandbox não tem a mesma cobertura da produção. Resultados de sandbox são parciais. Pix Automático, escrow e divergência de split podem não ser simulados | sandbox (2026-10-27): "Nem todas as funcionalidades possuem a mesma cobertura ou o mesmo comportamento de Produção." | Marcar no relatório de testes o que foi simulado e o que não foi | todos |
| R24 | b | Pro é liberado em `PAYMENT_CONFIRMED` e em `PAYMENT_RECEIVED`. A documentação descreve `CONFIRMED` como pagamento feito, com valor ainda sem disponibilidade no saldo (*paráfrase*). Liberar em `CONFIRMED` é decisão de negócio | webhook-para-cobrancas | Decidir se a assinatura Pro espera `RECEIVED` | T14 |

---

## 5. Teste grátis (`subscriptions-manage`): passo a passo

| Etapa | O que o código faz | O que o Asaas documenta | Situação |
|---|---|---|---|
| 1. Assinar com teste | `nextDueDate` = hoje + `pro_trial_days` (padrão 30). `cycle` MONTHLY. `billingType` do método. Assinatura gravada como `trialing`. `providers.plan = 'pro'`. `current_period_end` = último dia do teste às 23:59:59 (-03:00) | `nextDueDate` é "vencimento da primeira cobrança". Não há regra de data mínima citada. Criar não confirma pagamento | Campos conferem. Aceitar data futura: T11 |
| 2. Ler o link logo depois | `listSubscriptionPayments(...)[0].invoiceUrl`, gravado em `invoice_url` (vira `null` se não houver cobrança) | Não diz quando a cobrança é gerada. A geração é gradual. Na sandbox há geração de carnê para antecipar cobranças | incerto (R13). T11, T12 |
| 3. Cobrança antes do fim do teste | Nenhum tratamento | Não documentado. `PAYMENT_CREATED` traz o campo `subscription`, o que permite identificar a origem | incerto. T12 |
| 4. Cancelar durante o teste | `DELETE` na assinatura. Grava `canceled`. `planAfterCancel` mantém Pro até `current_period_end` | `DELETE` exclui cobranças pendentes ou vencidas e mantém as pagas. Gera `SUBSCRIPTION_DELETED` | Confere. Falta confirmar se cada cobrança removida gera `PAYMENT_DELETED` (não documentado). T13 |
| 5. Fim do teste sem pagamento | `PAYMENT_OVERDUE` com `subscription` leva a `past_due` (não cai no ramo `first_payment_overdue`, que só vale para `pending`). Plano volta a `free` após o período e `PRO_GRACE_DAYS` | Cobrança vencida tem status `OVERDUE`. Evento `PAYMENT_OVERDUE` | Confere no desenho. Precisa de data simulada na sandbox: T15 |
| 6. Pagamento no fim do teste | `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED` com `subscription`: `active`, `current_period_end` = mês a partir do vencimento | Eventos de cobrança trazem `subscription` | Confere. Ver R24 sobre `CONFIRMED` |
| 7. Pagar com cartão | `billingType = CREDIT_CARD` sem cartão | Página de assinatura com cartão não aberta | incerto (R14). T16 |
| 8. Assinar de novo dentro de período pago | `firstDueDate` = fim do período. Status `pending` | Não citado | Conferir na sandbox |

Resposta do `POST` ao cliente. Com teste: `trial_ends_at` preenchido e `awaiting_payment` `false`. Sem teste: `awaiting_payment` `true`, e `invoice_url` depende de R13.

---

## 6. Divergência de split: fluxo documentado x código

**Em assinatura** [CONFERIDO: fluxo-de-bloqueio-de-assinatura (2026-08-26)]:

1. A divergência é detectada quando o valor configurado do split ultrapassa o valor líquido disponível. A verificação ocorre na criação de nova cobrança, no processamento da cobrança ou quando o líquido cai abaixo do destinado aos participantes.
2. Evento `SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK`. A assinatura fica bloqueada, o split fica desabilitado e novas cobranças não são geradas.
3. Prazo de correção: 2 dias úteis (*a contagem começa não especificada*).
4. Correção: `PUT /v3/subscriptions/{id}` com o novo `split`. A página avisa para não enviar `split` como `null` ou `[]` se a intenção é manter a configuração. Cobranças já geradas precisam de correção separada. Não presumir normalização sem confirmar por webhook ou consulta.
5. Corrigido no prazo: desbloqueio automático. Novas cobranças voltam com split.
6. Sem correção: evento `SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED`. Novas cobranças voltam **sem** split.

**Em cobrança** [CONFERIDO: split-faq (2026-10-09)]:

1. Evento `PAYMENT_SPLIT_DIVERGENCE_BLOCK` (paráfrase: "valor da cobrança bloqueado por divergência de split"). Valor e splits podem ser bloqueados para ajuste.
2. Prazo: 2 dias úteis.
3. Sem correção: split cancelado e evento `PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED`.
4. `PAYMENT_SPLIT_CANCELLED` não é enviado quando o cancelamento vem da validação de saque. Nesse caso, a página manda consultar `cancellationReason` pela API.
5. Não documentado: status da cobrança durante o bloqueio (R7).

**Código**: `asaas-events.ts` trata os três eventos como `NONE`. Não há alerta, não há `audit_log` e não há fila no admin. No fluxo atual o split de cobrança é percentual sobre o líquido, então a divergência não deveria surgir sozinha. Pode surgir com antecipação de recebíveis, com estorno parcial ou com mudança de tarifa (derivação a partir do texto da FAQ).

**Assinatura**: o código não usa `split` em assinatura. Os eventos `SUBSCRIPTION_SPLIT_*` estão mapeados como `NONE`. Isso é consistente com o desenho atual, mas precisa ser revisto se o Pro passar a ter split.

---

## 7. Cancelamento, estorno e reembolso

| Caso | O que o Asaas documenta | O que o WorkEasy faz | Teste |
|---|---|---|---|
| Cobrança pendente, cancelada pelo cliente ou prestador | `DELETE /v3/payments/{id}` remove. Resposta `{deleted, id}`. Evento `PAYMENT_DELETED` | `payments-void`: `DELETE`. 404 conta como feito. Grava `canceled` | T17 |
| Cobrança já paga, `DELETE` | Não é estorno. Resposta não listada (409 ausente da página) | Aceita 400 ou 409 como "já paga". O webhook reembolsa (`payment.void_paid`) | T18 (R12) |
| Estorno de cartão ou Pix | `POST /v3/payments/{id}/refund`. Total ou parcial. Sem campos, integral. 400 quando falta saldo (exemplo Pix logo após o recebimento) | `refundPayment()` com descrição. Grava `refunded` ao receber 2xx | T20 (R10) |
| Estorno com split | Repasses da subconta são estornados. Campo `splitRefunds` permite especificar | Não envia `splitRefunds` | T21, T22 (R11) |
| Estorno em andamento | `PAYMENT_REFUND_IN_PROGRESS`. Aplicado depois da liquidação agendada. `PAYMENT_REFUND_DENIED` aparece só para boleto (*paráfrase*) | Trata como final (`refunded`) | T20 |
| Boleto | Endpoint próprio de estorno de boleto (página `estornar-boleto` listada, não aberta) | Falha vira `payment.refund_failed` para o admin | T23 |
| Cobrança removida e restaurada | Restauração com o mesmo ID. Evento `PAYMENT_RESTORED`. Restauração só se o estado permitir | Reabre `canceled` ou `failed` para `pending`. Não reabre `refunded` | T19 |

Ponto de atenção jurídico: a reversão de repasse de subconta é um efeito que atinge o prestador sem nova ação dele. Ver L3.

---

## 8. Webhook: segurança, ordem, retentativa e fila

**Segurança.** Header `asaas-access-token`, enviado em todas as notificações [CONFERIDO]. O código compara o header com o token da conta-raiz (`ASAAS_WEBHOOK_TOKEN`) ou com o token derivado da subconta (`asaas-onboard`, `subaccountWebhook`). Também relê a cobrança no Asaas antes de aplicar efeito (`verifyPayment`). Isso está alinhado com a documentação, que trata o corpo como aviso e manda validar o header.

**Entrega.** "Ao menos uma vez". O mesmo `id` pode chegar de novo. A idempotência é obrigatória nos dois modos [CONFERIDO]. O código guarda `payment_events` com `asaas_event_id` único.

**Ordem.** `SEQUENTIALLY` preserva a ordem de ocorrência e um evento respeita a sequência dos anteriores. `NON_SEQUENTIALLY` não garante ordem [CONFERIDO]. O código usa `SEQUENTIALLY` na subconta. Não há tipo de envio configurado na conta-raiz no repositório (R20). A escada de status só avança (`RANK`), o que é coerente com entrega fora de ordem.

**Fila.** Uma entrega é bem-sucedida com 2xx. Qualquer outro resultado é falha (400, 403, 404, 408, 500, timeouts) [CONFERIDO]. Os intervalos crescem de 30 s até 3 h. Alertas por e-mail nas tentativas 5, 10 e 15. Após 15 falhas seguidas a fila é interrompida e novos eventos ficam retidos até 14 dias, depois são excluídos. Remover penalidade é outra ação, feita por `POST /v3/webhooks/{id}/removeBackoff` (204). Não confundir com reativação da fila [CONFERIDO].

**Eventos de cobrança.** Os 30 nomes da página de eventos de cobrança aparecem em `PAYMENT_EFFECTS`. Os 7 de assinatura aparecem em `SUBSCRIPTION_EFFECTS`. A lista da subconta tem 11 nomes válidos.

**Conclusão.** O desenho do webhook confere com a documentação. Os riscos são operacionais: fila pausada sem runbook (R16) e webhook da conta-raiz fora do repositório (R20).

---

## 9. Tarifas (não obtidas)

Não foi possível conferir nenhuma tarifa oficial nesta pesquisa.

- https://www.asaas.com/precos e https://www.asaas.com/tarifas redirecionaram para `http://www.asaas.com/login/auth` (302), em 2026-11-08.
- O índice da documentação não tem página de tarifas. A página de receitas (`como-o-asaas-trata-receitas-na-conta`, 2026-07-31) não tem valores. A página de taxa do escrow manda para a tabela de tarifas da conta.

| Item | Valor | Fonte | Situação |
|---|---|---|---|
| Pix, por cobrança recebida | não obtido | página de preços (login) | incerto |
| Boleto, por boleto pago | não obtido | página de preços (login) | incerto |
| Cartão de crédito, 1x | não obtido | página de preços (login) | incerto |
| Cartão de crédito, parcelado | não obtido | página de preços (login) | incerto |
| Transferência para conta bancária | não obtido | página de preços (login) | incerto |
| Subconta (criação e manutenção) | não obtido | docs de subcontas não citam tarifa | incerto |
| Split | não obtido | docs de split não citam tarifa | incerto |
| Estorno | não obtido | docs de estorno não citam tarifa | incerto |
| Conta Escrow, mensalidade por subconta | valor não publicado na página aberta; quem paga é `isFeePayer` | cobranca-da-taxa-por-subconta-configurada (2026-08-28) | incerto |
| Pix Automático | não obtido | não há página de tarifa aberta | incerto |

**Efeito nos números do produto.** O `DECISOES.md` (seções 3 e 6) usa "custo de cobrança de cerca de R$ 2 por mensalidade" para a margem de 95%. Essa premissa não tem fonte conferida. A margem por cobrança e a comissão líquida dependem da tarifa de Pix ou cartão, que também não foi conferida.

**Próximo passo para o dono:** copiar a tabela de tarifas do painel do Asaas, na conta dele, com a data, e substituir esta tabela. Esta pesquisa não acessou o painel.

---

## 10. Sandbox: o que a documentação diz e como simular

**Confirmado** [CONFERIDO: sandbox (2026-10-27); testando-pagamento-com-cartao (2026-11-05); testar-pagamento-de-qrcodes-pix (2026-08-03)]:

- Base: `https://api-sandbox.asaas.com/v3`. Conta, dados, configurações e chaves são separados da produção. Não movimenta dinheiro real.
- "Não informe uma chave de Produção" nas chamadas feitas a partir da documentação.
- Cartões de aprovação (simulam processamento bem-sucedido): Visa `4539 6560 4839 2220`; Mastercard `5263 8372 5327 8275`; American Express `3471 756966 23141`; Discover `6011 6650 7493 0565`.
- Cartões de recusa: Mastercard `5184019740373151`; Visa `4916561358240741`. A página não lista códigos de erro de recusa.
- Validade: qualquer data futura. CVV fictício. Nenhuma adquirente é acionada. "A utilização de outros números ainda não é tecnicamente restringida pelo Sandbox."
- Pix: criar um QR estático na conta de destino (`Criar QR Code estático`), guardar `payload` e pagar com `POST /v3/pix/qrCodes/pay` (`qrCode.payload`, `value`) a partir de outra conta sandbox. A conta de destino precisa de chave Pix cadastrada. Sem chave: erro 404 (página `tentar-pagar-qr-code-pix-no-sandbox-sem-chave-cadastrada-erro-404`, listada).
- Geração de carnê de assinatura antecipa a criação de cobranças futuras (carnê). "A geração de um período extenso pode criar muitas cobranças na conta Sandbox." Carnê não confirma pagamento.
- Webhooks: a página implica que são enviados, mas não diz com todas as letras.
- Aprovação automática de contas quando os dados obrigatórios são válidos (paráfrase). A página de aprovação na sandbox existe (`aprovar-conta`, listada, não aberta).

**Não encontrado na documentação aberta:**

- Como simular confirmação de boleto ou de recebimento em dinheiro (endpoint `confirmar-recebimento-em-dinheiro` está listado, não aberto).
- Como avançar datas na sandbox para ver `OVERDUE` ou o fim do trial.
- Como simular confirmação de autorização do Pix Automático.
- Se a sandbox aceita subconta de PF como conta-pai.

---

## 11. Pix Automático: pode substituir boleto ou cartão em assinatura?

**O que a documentação diz** [CONFERIDO: pix-automatico (2026-09-25); pix-automatico-implementacao (2026-09-25); diferenca (2026-10-27)]:

- "O Pix Automático permite realizar cobranças recorrentes via Pix após uma autorização prévia do pagador."
- Autorização: `POST /v3/pix/automatic/authorizations`. Campo `paymentCreationMode`: `MANUAL` (padrão; o app cria cada cobrança com `POST /v3/payments` e `pixAutomaticAuthorizationId`, entre 2 e 10 dias úteis antes do vencimento) ou `SUBSCRIPTION` (o Asaas gera as cobranças; exige `value` na autorização).
- O QR Code inicial (`immediateQrCode`) reúne o primeiro pagamento e o consentimento para os ciclos seguintes.
- A autorização vira `ACTIVE` só depois que a instituição do pagador confirma. Sem confirmação, a autorização é recusada mesmo com o pagamento inicial recebido.
- Eventos citados: `PAYMENT_RECEIVED` e `PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED` (*paráfrase*), além de eventos de instrução, cancelamento e recusa.
- Assinatura com `billingType = PIX` não equivale a Pix Automático. Na assinatura, o pagador paga cada fatura. No Pix Automático, a autorização ativa permite débito sem nova confirmação a cada ciclo.
- A página não trata: o que acontece se o pagador não autorizar ou cancelar, se ele pode cancelar, nova tentativa após falha, dependência do banco do pagador, suporte a split e a subconta.
- Elegibilidade: "confirme que a conta está elegível para utilizar Pix Automático".
- A referência de subscription tem `pixAutomaticAuthorizationMode` com um único valor permitido, `DISABLED` ("Pix Automático não oferecido") [criar-nova-assinatura]. O campo de criação da autorização é outro (`paymentCreationMode`). A relação entre os dois não está explicada (incerto).

**Resposta curta.** Pode substituir o Pix avulso mensal da assinatura Pro, para quem tem o banco habilitado e autoriza no app do banco, desde que a conta seja elegível. Não substitui boleto nem cartão para quem não usa Pix Automático. Pela documentação aberta, não há prova de que funcione com subconta e com split. Como o Pro é cobrado da conta-raiz e sem split, o caso de uso natural seria a assinatura Pro.

**O que seria preciso** [PLANEJADO]:

1. Confirmar elegibilidade da conta com o Asaas (R2, R3).
2. Integrar `POST /v3/pix/automatic/authorizations` com `paymentCreationMode` escolhido. Testar `SUBSCRIPTION` e `MANUAL` na sandbox (T34).
3. Tratar estados da autorização (`ACTIVE`, recusa, cancelamento) e os eventos `PIX_AUTOMATIC_RECURRING_*` no webhook da conta-raiz. O código não conhece esses eventos (R20).
4. Guardar o estado da autorização. Exige tabela nova em migração nova, sem alterar migração existente.
5. Texto de consentimento e de cancelamento para o prestador (ver L8).
6. Teste completo na sandbox, com o limite de que a sandbox pode não simular a confirmação da instituição do pagador.

---

## 12. Plano de testes na sandbox (antes da produção)

Pré-requisitos: duas contas de sandbox (uma PJ para conta-pai, uma subconta de prestador). Chaves guardadas no cofre de teste, nunca no repositório. Cada teste registra: data, endpoint, corpo, resposta HTTP, corpo da resposta e eventos recebidos. Resultado pode ser "conforme", "divergente" ou "não testável na sandbox".

**Autenticação e conta**

- **T1.** `GET /v3/myAccount/status` sem header `access_token` → esperado 401 (autenticacao-1). Repetir com chave de produção no host da sandbox → esperado 401.
- **T2.** `POST /v3/accounts` com conta-pai PF → esperado recusa (subcontas: "somente CNPJ"). Repetir com conta-pai PJ → esperado 200 com `id`, `walletId` e `apiKey`. Anotar se a chave vem no topo, em `accessToken` ou nos dois (R1, R2, R6).
- **T3.** Com a chave da subconta, listar webhooks (`GET /v3/webhooks`; caminho a confirmar na referência de listagem). Esperado, se `webhooks[]` foi aceito: um webhook com `apiVersion` 3, `sendType` `SEQUENTIALLY`, `hasAuthToken` true e a lista de eventos enviada. Lista vazia confirma R5.
- **T4.** `GET /v3/myAccount/status` com a chave da subconta, antes e depois da aprovação na sandbox (`aprovar-conta`, caminho a confirmar). Esperado: `general` diferente de `APPROVED` antes, `APPROVED` depois, e evento `ACCOUNT_STATUS_GENERAL_APPROVAL_APPROVED` (R4).

**Split**

- **T5.** Cobrança de R$ 100,00 com `split: [{walletId: <subconta>, percentualValue: 88}]`, paga com cartão de aprovação. Depois `GET /v3/payments/{id}` (`netValue`) e a consulta de splits recebidos (caminho a confirmar). Esperado: a subconta recebe 88% do `netValue` (split-faq).
- **T6.** Cobrança de R$ 100,00 com `percentualValue: 100`. Esperado (derivação): aceita, subconta recebe o `netValue`, saldo da conta-raiz do split fica zerado. Registrar a diferença entre bruto e líquido, que mostra quem arcou com a tarifa (R8). Se recusar, registrar a mensagem.
- **T7.** Dois casos de recusa. (a) `percentualValue` 60 + 50 na mesma cobrança: esperado recusa, por soma acima de 100% (regra vinda de resumo de busca, não de página aberta). (b) `fixedValue` igual ao valor da cobrança: esperado recusa ou bloqueio por divergência (split-faq: fixo não pode passar do líquido).
- **T8.** Cobranças de R$ 1,00 e R$ 5,00 com `percentualValue` 88. Registrar se aceita e qual é o `netValue`. Se `netValue` for zero ou negativo, registrar a mensagem. Os números do comentário de `split.ts` (R$ 10,00 com líquido perto de R$ 8,01) são premissa do código, não conferidos.
- **T9.** Divergência de split em cobrança: tentar antecipar uma cobrança com split (se a sandbox permitir). Esperado: `PAYMENT_SPLIT_DIVERGENCE_BLOCK`, valor bloqueado, depois correção ou `PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED`. Se não for possível, marcar "não testável" e manter R7.
- **T10.** Divergência em assinatura: assinatura com split fixo acima do líquido. Esperado ao gerar a cobrança: `SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK`, sem novas cobranças. `PUT /v3/subscriptions/{id}` com `split` corrigido: desbloqueio automático. Sem correção em 2 dias úteis: `SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED` e cobranças seguintes sem split.

**Assinatura e teste grátis (`subscriptions-manage`)**

- **T11.** `POST /v3/subscriptions` com `value` 49.00, `cycle` MONTHLY, `billingType` PIX, `nextDueDate` = hoje + 30 dias, `externalReference` = `subscription:<id-de-teste>`. Esperado: 200 com `id`, nenhum pagamento pago. Em seguida `GET /v3/subscriptions/{id}/payments`: registrar quantidade de cobranças e se há `invoiceUrl`. Resultado define R13.
- **T12.** Gerar carnê na sandbox para antecipar a cobrança do fim do teste (página `como-gerar-novas-cobrancas-de-uma-assinatura`, caminho a confirmar). Esperado: `PAYMENT_CREATED` com `subscription` preenchido.
- **T13.** `DELETE /v3/subscriptions/{id}` durante o teste. Esperado: 200 com `{deleted: true, id}`; cobrança pendente com `deleted: true` em `GET /v3/payments/{id}`; `SUBSCRIPTION_DELETED`. Registrar se cada cobrança removida gera `PAYMENT_DELETED` (não documentado). Esperado no código: `canceled`, Pro até `current_period_end`.
- **T14.** Pagar a primeira cobrança da assinatura (Pix estático, T33, ou simulação equivalente). Esperado: `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED` com `subscription`; código grava `active` e nova `current_period_end` a partir do vencimento. Comparar `PAYMENT_CONFIRMED` antes e depois de `PAYMENT_RECEIVED` (R24).
- **T15.** Não pagar após o vencimento. Esperado: status `OVERDUE` e `PAYMENT_OVERDUE`; código grava `past_due`. Se a sandbox não avançar datas, marcar "não testável" e registrar a exigência.
- **T16.** `POST /v3/subscriptions` com `billingType` `CREDIT_CARD` sem dados de cartão. Registrar a resposta. Ler antes a página de assinatura com cartão (R14).

**Cancelamento, void e estorno**

- **T17.** `POST /v3/payments` com `externalReference` de teste, depois `DELETE /v3/payments/{id}`. Esperado: 200 com `{deleted: true, id}`; `PAYMENT_DELETED`; código grava `canceled`.
- **T18.** `DELETE /v3/payments/{id}` em cobrança `RECEIVED`. Registrar código HTTP e corpo. A página não lista 409 (R12). Esperado do código: 400 ou 409, e a cobrança segue como paga.
- **T19.** Restaurar a cobrança do T17 com o mesmo ID (caminho a confirmar). Esperado: `PAYMENT_RESTORED`; código reabre para `pending`.
- **T20.** `POST /v3/payments/{id}/refund` sem corpo, em cobrança Pix paga. Esperado: 200. Registrar o `status` imediato (`REFUNDED` ou em andamento) e os eventos `PAYMENT_REFUND_IN_PROGRESS` e `PAYMENT_REFUNDED`. Código grava `refunded` já na resposta (R10).
- **T21.** Estorno da cobrança com split do T5, sem corpo. Esperado (split-faq): repasse da subconta estornado. Registrar o saldo da subconta antes e depois.
- **T22.** Sacar o saldo da subconta antes de estornar a cobrança do T5. Registrar a resposta. Esperado: 400 por saldo insuficiente, se a regra for a mesma do Pix (não confirmada para subconta). Código grava `payment.refund_failed`.
- **T23.** Estorno de boleto pelo endpoint próprio (caminho a confirmar). Registrar requisitos (dados bancários, prazo). O código não usa.

**Webhook**

- **T24.** `POST` em `…/functions/v1/asaas-webhook` (sandbox): sem `asaas-access-token` → 401; com token de subconta usado com `acct` de outro prestador → 401; com token da conta-raiz → 200. Esperado do código.
- **T25.** Reenviar o mesmo evento (mesmo `id`) duas vezes. Esperado: a segunda não gera efeito; uma linha em `payment_events`.
- **T26.** Entregar `PAYMENT_CONFIRMED` depois de `PAYMENT_RECEIVED` para a mesma cobrança. Esperado: status continua `received`.
- **T27.** Apontar webhook de teste para endpoint que responde 500. Após 15 entregas seguidas, esperado: fila interrompida; e-mails nas tentativas 5, 10 e 15; eventos retidos por 14 dias. Depois de corrigir o endpoint, reativar pela página "Como reativar fila interrompida" (não aberta). `POST /v3/webhooks/{id}/removeBackoff` → 204. Registrar `penalizedRequestsCount` (R16).
- **T28.** `POST /v3/webhooks` com `authToken` de 31 caracteres → esperado 400 (mínimo 32). Com 64 caracteres → aceito (limite 255).

**Limites e concorrência**

- **T29.** Criar 11 subcontas na sandbox com conta-pai PJ. Esperado: bloqueio na 11ª (limite de 10 no período). Depois, cobrança acima de R$ 2.000,00 em uma subconta e em outra. Registrar se a conta-raiz é atingida (R3).
- **T30.** Criar duas cobranças com o mesmo `externalReference`. Registrar se o Asaas cria duas. A documentação não oferece chave de idempotência (R17).
- **T31.** Disparar 50 `GET` simultâneos. Esperado: 429 em algum ponto, com cabeçalhos `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`. Registrar o limite real (R18).
- **T32.** Chave inativa: não testável em prazo de sandbox. Monitorar em produção (R9).

**Pix e Pix Automático**

- **T33.** Criar QR estático na conta de destino (com chave Pix cadastrada) e pagar com `POST /v3/pix/qrCodes/pay` a partir de outra conta de sandbox. Registrar o status da cobrança e os eventos. Sem chave cadastrada: esperado 404.
- **T34.** `POST /v3/pix/automatic/authorizations` com `paymentCreationMode` `MANUAL` e depois `SUBSCRIPTION` (com `value`). Registrar `immediateQrCode`, status inicial e erro se a conta não for elegível. Registrar como a sandbox simula a confirmação da instituição do pagador (não documentado).

**Escrow**

- **T35.** Habilitar Conta Escrow em uma subconta de teste (endpoint não aberto; caminho a confirmar) com `daysToExpire` pequeno. Receber R$ 10,00. Registrar se o valor fica indisponível no saldo, quando libera e quem paga a mensalidade (`isFeePayer`). Não usar em produção antes do parecer (R19, L1).

---

## 13. Itens para o advogado

Todos os itens abaixo são fatos de documentação ou perguntas. Nenhum é parecer. Citações: leitor de páginas, ver nota na seção "Limites desta pesquisa".

**L1. Custódia e Conta Escrow** [CONDICIONAL: depende de parecer]
- Asaas, Conta Escrow (intro-escrow, 2026-09-02): "A Conta Escrow permite reter temporariamente valores recebidos por uma subconta até o encerramento da garantia." (citação do leitor)
- Mesma página: "Enquanto a garantia estiver ativa, o recebimento existe, mas o valor não fica disponível no saldo da subconta." (citação do leitor)
- Mesma página: "Um recebimento sob garantia deve ser considerado recebido, mas ainda indisponível no saldo da subconta." (paráfrase)
- Não consta na página: quem detém os valores, se a atividade é regulada, qual instituição faz a custódia, ou os termos do contrato.
- Pergunta: a retenção feita pelo Asaas altera a análise do item 1 do `DECISOES.md` (seção 4, "Comissão")? E a análise do "Pagamento retido"?

**L2. Fluxo de valores com split** [CONDICIONAL: depende de parecer]
- Split FAQ (2026-10-09), paráfrase: o `percentualValue` é calculado sobre o `netValue`, valor da cobrança após as tarifas aplicáveis.
- Split FAQ e split-in-single-payments (2026-10-13), paráfrase: "O saldo líquido não alocado aos recebedores permanece na conta que criou a cobrança."
- Pergunta: com split, o saldo que sobra na conta-raiz é do WorkEasy? Isso muda a análise do item 1 do `DECISOES.md`?

**L3. Estorno que reverte repasse** [CONDICIONAL: depende de parecer]
- Split FAQ, paráfrase: "As transferências relacionadas à cobrança também são estornadas." E "Contas que receberam valores pelo Split terão as respectivas transferências revertidas."
- Pergunta: os termos do prestador devem prever reversão do repasse? O que vale se o prestador já sacou? Isso se aplica ao estorno feito por cancelamento (`payments-void`, `refundAfterCancel`)?

**L4. Divergência e bloqueio de valores** [CONDICIONAL: depende de parecer]
- Split FAQ, paráfrase: a divergência pode bloquear "valor e splits" para ajuste; prazo de 2 dias úteis.
- Evento `PAYMENT_SPLIT_DIVERGENCE_BLOCK` (página de eventos, citação do leitor): "Valor da cobrança bloqueado por divergência de Split."
- Pergunta: durante o bloqueio, de quem é o valor? Quem responde perante o cliente e o prestador?

**L5. Modelo BaaS e "instituição prestadora"** [CONDICIONAL: depende de parecer]
- criacao-de-subcontas-baas (2026-10-27), citação do leitor: o modelo BaaS "antigo White Label" serve para "fornecimento de serviços bancários para terceiros".
- Mesma página: "O modelo também passa a exigir a identificação do Asaas como instituição prestadora".
- Mesma página: "é obrigatório evidenciar a marca, os links e os textos de responsabilidade do Asaas" nos pontos de contato com o cliente final.
- Pergunta: o que muda para os termos de uso e para a interface do WorkEasy? O WorkEasy se apresenta como intermediário, e isso é compatível com a identificação do Asaas como prestadora? Ligar à pergunta 1 do `DECISOES.md`.

**L6. Titular da subconta e dados do prestador** [incerto: sem fonte aberta sobre LGPD nesta pesquisa]
- detalhamento-do-fluxo (2026-08-28), paráfrase: a análise cadastral normalmente inclui documento de identificação e selfie do titular ou responsável.
- O WorkEasy coleta CPF/CNPJ, data de nascimento (PF), endereço, renda mensal e telefone para criar a subconta (`asaas-onboard`).
- Pergunta: base legal, aviso ao prestador e compartilhamento com o Asaas. Ligar à pergunta 5 do `DECISOES.md`.

**L7. Período de avaliação regulatória** [CONDICIONAL: depende de parecer]
- criacao-de-subcontas-baas (2026-10-27), citação do leitor: "podem ser criadas até 10 subcontas"; "cada subconta pode emitir até R$ 2.000,00 em cobranças"; "o período pode durar até 60 dias corridos a partir da primeira subconta criada".
- Pergunta: o WorkEasy pode operar com esses limites? Como comunicar ao prestador um bloqueio? Os limites valem para a conta-raiz (assinatura Pro)?

**L8. Pix Automático e consentimento** [incerto: sem fonte aberta sobre CDC nesta pesquisa]
- diferenca-entre-pix-automatico-e-assinaturas-1 (2026-10-27), paráfrase: "Pix Automático realiza débitos recorrentes via Pix após autorização do pagador."
- Pergunta: texto de consentimento e de cancelamento para cobrança recorrente. Ligar à pergunta 7 do `DECISOES.md` (teste grátis e cobrança automática).

**L9. Taxa recorrente do escrow** [incerto]
- cobranca-da-taxa-por-subconta-configurada (2026-08-28): "A mensalidade da Conta Escrow é cobrada por subconta enquanto a funcionalidade estiver habilitada." "Subcontas sem a Conta Escrow habilitada não geram essa mensalidade."
- Pergunta: se o escrow entrar, quem paga a mensalidade e como isso aparece para o prestador (`isFeePayer`)?

---

## 14. Lacunas (o que não foi verificado)

1. Tarifas de Pix, boleto, cartão, transferência, subconta, split e estorno (seção 9).
2. Quando a primeira cobrança de uma assinatura é gerada, e se a cobrança do fim do teste aparece antes (R13).
3. Formato de `GET /v3/subscriptions/{id}` (`status`, `nextDueDate`, `deleted`) e de `GET /v3/subscriptions/{id}/payments` (`data`). A página de referência não mostrou o esquema de resposta.
4. Sub-campos de `webhooks[]` em `POST /v3/accounts` (R5).
5. Se `accessToken.apiKey` existe na resposta (R6).
6. Código de erro e tratamento de cobrança já paga em `DELETE /v3/payments/{id}` (409 não documentado).
7. Enum completo de `status` de cobrança (R15).
8. Limite de 4 casas em `percentualValue` e soma máxima de 100%: vieram de resumo de busca, não de página aberta.
9. Página "Como reativar fila interrompida" e página de restauração de cobrança: não abertas.
10. Página de estorno de boleto, página de confirmação de recebimento em dinheiro, página de Conta Escrow com endpoints de configuração: não abertas.
11. Página de assinatura com cartão: não aberta (R14).
12. Pix Automático: lista de status da autorização e de eventos além dos citados; relação entre `pixAutomaticAuthorizationMode` (assinatura) e `paymentCreationMode` (autorização).
13. Restrições específicas para marketplace: o índice não tem página dedicada. As restrições conferidas são as de conta-pai PJ, BaaS e avaliação regulatória.
14. Limite por segundo ou por minuto: a página só dá cota de 12 horas e 50 GET simultâneos.
15. Cabeçalho `Authorization: Bearer`: não documentado. Não é usado.
16. Se a sandbox aceita avançar datas (vencimento, OVERDUE, fim do trial).
17. Chave de subconta: redação exata das regras de inatividade (3 e 6 meses, paráfrase do leitor).

---

## 15. Achados de código (não corrigidos)

Todos abaixo são de produto ou de código, registrados sem alteração. Corrigir está fora deste escopo.

1. `asaas-onboard` grava `active` sem consultar `GET /v3/myAccount/status` (R4).
2. `asaas-onboard` não verifica CNPJ da conta-raiz nem habilitação BaaS (R1, R2).
3. `asaas-onboard` diz `webhook_registered: true` com base no envio, não na confirmação (R5).
4. Comentário de `asaas-onboard` cita `accessToken.apiKey` como fonte, sem confirmação (R6).
5. `asaas-events.ts` mapeia `PAYMENT_SPLIT_DIVERGENCE_BLOCK`, `..._FINISHED` e `PAYMENT_SPLIT_CANCELLED` como sem efeito (R7).
6. `asaas-webhook` grava `refunded` ao receber 2xx do estorno (R10).
7. `refundAfterCancel` não usa `splitRefunds` e não trata saldo insuficiente de subconta de forma específica (R11).
8. `payments-void` trata 409 como "já paga" sem confirmação na documentação (R12).
9. `subscriptions-manage` lê `invoiceUrl` logo após criar a assinatura, sem confirmar geração da cobrança (R13).
10. `subscriptions-manage` manda `CREDIT_CARD` sem dados de cartão (R14).
11. `ASAAS_PAID` e `ASAAS_UNPAID` incluem status não conferidos (R15).
12. Fila de webhook sem runbook de reativação (R16).
13. `callAsaas` não trata 429 nem repete (R18).
14. Nenhum código consulta o Asaas por `externalReference` antes de criar cobrança (R17).
15. Webhook da conta-raiz não aparece no repositório (R20).
16. `SUBACCOUNT_WEBHOOK_EVENTS` não inclui `PAYMENT_SPLIT_*` nem `PAYMENT_REFUND_IN_PROGRESS` (consistente com cobrança própria sem split; revisar se mudar).

---

## 16. Pedidos ao Asaas (por escrito, para o gerente de contas)

1. Estrutura BaaS habilitada para a conta do WorkEasy e obrigações resultantes (R2, L5).
2. Se o limite de avaliação regulatória (10 subcontas; R$ 2.000,00 por subconta; 60 dias) vale para a conta-raiz (R3, L7).
3. Quem arca com a tarifa de cobrança com split, e como ela aparece no `netValue` (R8).
4. Tabela de tarifas por meio de pagamento, com data (seção 9).
5. Quem detém os valores retidos pela Conta Escrow e qual é o enquadramento (L1).
6. Elegibilidade de Pix Automático e suporte a subconta e a split (seção 11).
7. Confirmação de que `webhooks[]` em `POST /v3/accounts` é aceito e como conferir (R5).
8. Código de resposta de `DELETE /v3/payments/{id}` em cobrança paga (R12).
