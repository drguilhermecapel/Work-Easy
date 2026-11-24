# Operação concierge do dia a dia: procedimentos (SOPs)

> **Rascunho para revisão de advogado. Não é parecer jurídico.** Os pontos marcados `[CONDICIONAL: depende de parecer]` não devem ser executados antes do parecer. Este documento é de operação: não promete prazo, resultado, devolução nem garantia a ninguém.

| Campo | Valor |
|---|---|
| Documento | O04 da pasta `docs/operacao/`: como operar o marketplace à mão, com as telas e as funções reais |
| Data de referência | 08/11/2026. D1 do piloto = segunda, 09/11/2026 (O01, §6), se o Go da Semana 0 (O01, §2) estiver registrado. Em 08/11/2026 o repositório não registra esse Go |
| Para quem | Você, que opera sozinho. Advogado (seção 12). Quem lê as regras de contato (O02, O05) |
| Estado do produto | Protótipo. MVP em `main`, sem implantação e sem usuário real. Notificações automáticas, WhatsApp, Asaas e Resend não foram testados com contas reais. Onde o produto depende de automação, este documento manda fazer à mão |
| Marcas | `[PLANEJADO]` não existe no produto hoje. `[proposta]` decisão a tomar, sem dado ainda. `[estimativa]` cálculo ou juízo. `[incerto]` não conferido em fonte aberta. `[DECISÃO DO DONO]` só você decide. `[CONDICIONAL: depende de parecer]` depende de advogado |

---

## 0. Resumo

1. **O produto não casa pedido com profissional sozinho.** Você escolhe quem chamar, confere a proposta, leva ao cliente e acompanha até o pagamento (O01, §0 e §10).
2. **Dois caminhos.** Pedido feito no app segue a **Trilha A** (proposta aceita e cobrança no app). Pedido que chegou pelo WhatsApp segue a **Trilha B** (orçamento com link e cobrança na conta Asaas do próprio profissional). Detalhe na seção 3. Há ainda o agendamento direto (`/agendar/:slug`), sem pedido nem proposta (L17).
3. **Você não cria pedido, proposta, aceite, cobrança nem pagamento em nome de ninguém.** Cada ação é feita pelo cliente ou pelo profissional, na própria conta. Você orienta, confere o status e registra.
4. **O painel `/admin` mostra contagens, a fila de prestadores, as disputas e os pagamentos que pedem atenção.** Não mostra a lista de pedidos nem a de atendimentos (lacuna L1, seção 1.2).
5. **Nunca marque nada como pago, cancelado ou devolvido fora do que o app e o Asaas mostram.** Comprovante enviado no WhatsApp não muda status.
6. **Aprovação de prestador:** documentos, depois registro, depois ocupação, depois o prestador. Só de quem está em "Em análise" (seção 5).
7. **Rotina:** 20 minutos por dia (seção 7) e 60 minutos por semana (seção 8). Tudo vai para o log (seção 9).
8. **Dinheiro, dado pessoal, risco à pessoa ou pedido de autoridade: escale** (seção 10). Não decida sozinho o que é `[CONDICIONAL]`.

---

## 1. O que o app faz e o que você faz à mão

### 1.1 Quem faz cada ação hoje

| Ação | Quem faz no app | Você faz? | Fato que decide (onde conferir) |
|---|---|---|---|
| Criar pedido | Cliente, em `/pedido` (login por código) | Não. Pedido de WhatsApp vai para a planilha | Política `requests_insert_own`: só com `client_id = auth.uid()` (`migrations/20261019000004_marketplace.sql`) |
| Enviar proposta | Prestador aprovado, em `/pro/pedidos` | Não | `proposals_insert_own` (`provider_id = auth.uid()`); a tela só envia e retira |
| Mudar preço de proposta enviada | Nenhuma tela | Não | Não se muda. Desde a migration `20261109000001_proposal_integrity.sql`, preço, mensagem e validade ficam congelados quando a proposta está `sent`; só vale `sent → withdrawn`. Retirar e reenviar no mesmo pedido não funciona (`unique (request_id, provider_id)`) |
| Aceitar proposta | Cliente dono do pedido, em `/pedidos/:id` | Orienta | `accept_proposal` (dia, início e fim em horário de São Paulo) |
| Agendamento direto (sem pedido nem proposta) | Cliente, em `/agendar/:slug` (`book_direct`); prestador aceita ou recusa em `/pro/agenda` | Não | Atendimento nasce `requested`. Sem resposta em 48 h, o banco cancela (`expire_booking_requests`, a cada 15 min). Ver L17 |
| Gerar cobrança do atendimento (Trilha A) | Cliente do atendimento, em `/atendimentos/:id` (PaymentPanel) | Orienta | `payments-create`: só o cliente do atendimento e só com status `accepted`; senão 403 ou 409 `booking_not_payable` |
| Gerar cobrança de orçamento aceito ou de cliente próprio (Trilha B) | Profissional com plano Pro, em `/pro/cobrancas` | Orienta | `charges-create`: exige `plan = 'pro'` (403 `pro_required`) e orçamento `accepted` |
| Iniciar, concluir, cancelar atendimento | Profissional, em `/pro/agenda`; cliente, em `/atendimentos/:id` | Orienta | `transition_booking` (matriz na seção 2) |
| Contestar atendimento | Cliente, até 7 dias depois do fim do horário | Não | `completed → disputed` (`BookingActions.tsx`) |
| Decidir contestação | Você, em `/admin/disputas` | Sim | `admin_resolve_dispute`: só de `disputed` para `released` ou `canceled`, com motivo. A tela diz que não move dinheiro |
| Aprovar prestador e ocupação | Você, em `/admin/prestadores/:id` | Sim | `admin_review_document`, `admin_set_registry_status`, `admin_set_occupation_approval`, `admin_set_provider_status` |
| Marcar pagamento como tratado | Você, em `/admin/pagamentos`, seção "Exigem atenção" | Sim, com motivo | `admin_review_payment`: só para pagamento que está na lista `admin_payments_attention` |
| Devolver dinheiro | Painel do Asaas (conta da plataforma) | Não pelo app `[CONDICIONAL: depende de parecer]` | `PaymentsAttention.tsx` manda devolver "no painel do Asaas"; o app pede estorno só no caso de pagamento recebido depois do cancelamento (`refundAfterCancel`, `asaas-webhook`) |
| Mensagens a cliente e profissional | Você, pelo WhatsApp Business no número dedicado | Sim | Notificações automáticas dependem de `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`; sem eles a linha fica `skipped` (ARQUITETURA, variáveis de ambiente). Gates em O05 §11.1 |

### 1.2 Lacunas que mudam a operação

Estas lacunas são do produto. Não foram corrigidas aqui. Cada uma tem o contorno desta SOP até o dono decidir.

| # | Lacuna (fato do código) | Efeito na operação | Contorno desta SOP |
|---|---|---|---|
| L1 | Não há tela de admin com a lista de pedidos nem de atendimentos. `admin_metrics` mostra só contagens. O admin lê `requests` por RLS (`requests_select` inclui `is_admin()`), mas nenhuma tela usa isso | Você não vê o texto de um pedido feito no app pelo painel | Para o texto de um pedido do app, peça ao cliente pelo WhatsApp (roteiro S2 do O03). Acesso de leitura ao banco só se o dono definir `[CONDICIONAL: depende de parecer]` |
| L2 | Não há formulário para registrar no banco um pedido que chegou pelo WhatsApp (O01, §9: `[PLANEJADO]`) | Prestador não vê pedido de WhatsApp em `/pro/pedidos` | Trilha B: o profissional emite orçamento |
| L3 | Não há gatilho em `requests`. O prestador não é avisado de pedido novo (O03, §1) | Quem não abre `/pro/pedidos` não sabe que há pedido | Você avisa por WhatsApp (MS-01), só a quem deu consentimento |
| L4 | Proposta enviada não muda de preço, mensagem nem validade (migration `20261109000001`), e a tela não tem edição. Depois de retirada, o mesmo prestador não reenvia no mesmo pedido (`unique (request_id, provider_id)`) | Mudança de preço não tem caminho na Trilha A | Mudança de preço vira orçamento novo na Trilha B (SOP-04, seção 6.4) |
| L5 | `/admin/prestadores/:id` mostra "Aprovar prestador" também para cadastro em `draft` (`firstApproval`), e `admin_set_provider_status` não checa `pending_review` | Dá para aprovar cadastro que nunca foi enviado para análise | Só aprove quem está em "Em análise" (seção 5). `[DECISÃO DO DONO]` se o banco deve recusar |
| L6 | `admin_set_provider_status('approved')` não exige ocupação aprovada | Prestador aprovado sem ocupação aprovada não aparece na busca | Aprove o prestador só depois de aprovar ao menos uma ocupação |
| L7 | O painel não mostra os bairros atendidos de cada prestador. `PrestadorDetalhe.tsx` não exibe `provider_neighborhoods` | Você não confere o bairro pela tela | Confira na planilha `prestadores` (O02, §13) e pergunte ao prestador |
| L8 | Fora da contestação, não há cancelamento administrativo de atendimento pela tela. Resolver contestação para `canceled` não cancela cobrança em aberto nem devolve dinheiro (`admin_resolve_dispute` só move `status`) | Cobrança pode continuar aberta ou paga depois do cancelamento | Peça ao cliente ou ao profissional que cancele pelo app (remove a cobrança aberta). Ver SOP-10 |
| L9 | Não existe marca de "não compareceu" para atendimento. `no_show` existe só em `shifts` (plantão de Cuidado) | Falta do profissional não tem estado próprio | SOP-12 (6.3) |
| L10 | Não há expiração automática de atendimento `accepted` sem pagamento. `PAYMENT_OVERDUE` não muda o atendimento (`asaas-events.ts`) | Atendimento aceito pode ficar parado para sempre | SOP-07 e 6.2 |
| L11 | O profissional pode iniciar a partir de `accepted`, antes do pagamento (`Agenda.tsx` mostra "Iniciar" para `accepted` e `paid`) | Serviço pode começar sem cobrança paga | Regra desta SOP: decida caso a caso e registre (SOP-07) |
| L12 | Estorno do Asaas com atendimento já `disputed` ou `canceled`: `bookingTransition` (`asaas-events.ts`, linhas 158 a 165) só leva a `canceled` a partir de `paid`, então o webhook (`PAYMENT_REFUNDED`) não pede a transição. A matriz do banco também recusa `disputed → canceled` para o serviço (`private.booking_transition_allowed`, conferido por consulta de leitura em transação revertida). Não testado com webhook real | Pagamento devolvido pode deixar o atendimento em contestação, sem aviso na tela | Não devolva no painel do Asaas sem conferir o status do atendimento e registrar. Ver 6.6 |
| L13 | Admin pode aplicar qualquer transição com motivo (ramo `v_admin` de `transition_booking`), inclusive `accepted → paid`, sem pagamento | Marcar pago sem dinheiro é possível por SQL | Proibido nesta SOP: ninguém muda `status` fora do app. `[DECISÃO DO DONO]` restringir no banco |
| L14 | Lembretes automáticos de 24 h e de 2 h, com varredura a cada 15 min (`private.enqueue_booking_reminders`, migration `20261023100000`). Saem só com contato confirmado e credenciais de WhatsApp ou Resend; sem credencial, a linha fica `skipped`. Cliente sem login (CRM do prestador) não recebe | Você não sabe se o aviso saiu sem olhar a tabela `notifications` | Conferir o status em `notifications`; se não saiu, MS-07 manual, uma vez (SOP-08) |
| L15 | Não há campo de endereço em `requests` nem em `bookings` | Endereço é combinado fora do app | Não grave endereço completo na planilha. Combine só entre cliente e profissional (SOP-06) `[CONDICIONAL: depende de parecer]` |
| L16 | O01, §10.1 fala em "3 a 5" prestadores. Na Trilha A o banco aceita `proposal_limit` propostas por pedido (padrão 3, faixa 1 a 10 em `platform_settings`) | A quarta proposta no mesmo pedido recebe `proposal_limit`: a conta é de propostas `sent` ou `accepted`, não de prestadores acionados (faixa 1 a 10 em `platform_settings`) | Na Trilha A, acione 3 (SOP-02). Na Trilha B não há limite do banco: 3 a 5 vale |
| L17 | Agendamento direto (`book_direct`, `/agendar/:slug`) não está nas trilhas A e B. O atendimento nasce `requested`, sem pedido nem proposta; o prestador recebe aviso (`agendamento_solicitado`, migration `20261109300006`) e aceita ou recusa em `/pro/agenda`. Sem resposta em 48 h, cancela sozinho (`expire_booking_requests`) | Você não vê esse atendimento no admin (L1) e não tem roteiro para ele | Não aceite nem recuse por ninguém. Se o cliente perguntar, diga que o prestador responde em `/pro/agenda` e que, sem resposta em 48 h, o pedido cai sozinho. Escale só se houver cobrança ou incidente |

---

## 2. Fatos do produto que as SOPs usam

Conferidos no código em 08/11/2026. Se o código mudar, esta tabela muda junto.

| Fato | Valor | Onde conferir |
|---|---|---|
| Pedido | Descrição de 10 a 2.000 caracteres; `open` por 7 dias; fecha sozinho (`closed`) a cada 15 min quando vence | `requests`; `private.expire_stale` (`migrations/20261019000008_notifications.sql`) |
| Pedido no sem-backend | `/pedido` monta a mensagem e abre `wa.me` para `VITE_CONCIERGE_WHATSAPP`. Com backend, o botão de WhatsApp não aparece | `pages/cliente/Pedido.tsx` (bloco `!online`) |
| Propostas por pedido | Até `proposal_limit` (padrão 3) contando `sent` e `accepted`. Só prestador aprovado, com a ocupação aprovada e o bairro atendido | ARQUITETURA, "Pedidos e propostas" |
| Plano grátis | 5 propostas **novas** por mês civil de São Paulo (`free_proposals_per_month`); retirar não devolve a vaga; Pro sem limite | ARQUITETURA; DECISÕES, D4 |
| Aceite | `accept_proposal`: cliente escolhe dia, início e fim (São Paulo). O período deve ser futuro, ter no máximo 24 h de duração e começar no máximo 2 anos à frente. Cria atendimento `accepted`, proposta `accepted`, outras `declined`, pedido `matched` | `migrations/20261019000004_marketplace.sql` (linhas 203 a 287) |
| Proposta vencida | `valid_until` passado impede o aceite (`invalid_transition`) | mesmo arquivo |
| Aprovação no aceite | O prestador precisa estar aprovado para a ocupação; senão, `not_allowed` | `migrations/20261109000004_acceptance_gate.sql` |
| Horário | Sem checagem da agenda do profissional no aceite. Choque de horário com outro atendimento dele: `slot_unavailable` | ARQUITETURA, "Pedidos e propostas" |
| Matriz de atendimento | Profissional: `requested → accepted/canceled`, `accepted → in_progress/canceled`, `paid → in_progress`, `in_progress → completed`. Cliente: `requested/accepted → canceled`, `completed → released/disputed`. Webhook: `accepted → paid`, `paid → canceled` (reembolso), `→ disputed` em `PAYMENT_CHARGEBACK_REQUESTED`, exceto de `canceled` ou `disputed`. Admin: qualquer, com motivo | `private.booking_transition_allowed` e `transition_booking` (`migrations/20261019000005_bookings.sql`) |
| Contestação | Cliente, de `completed`, até 7 dias depois do fim do horário; motivo com pelo menos 5 caracteres na tela | `transition_booking`; `BookingActions.tsx` |
| Cancelamento | Cliente e profissional cancelam `accepted` pelo app, com confirmação. Depois de `paid`, o app não cancela pelo botão | `services/bookings.ts`; `pages/cliente/labels.ts`; juridico/04, §2.1 e §4.2 |
| Cobrança da Trilha A | Só o cliente do atendimento, só `accepted`, só atendimento de origem `platform`. Vence amanhã (hoje + 1 dia, São Paulo). Pix com QR e copia e cola, ou fatura do Asaas para cartão e boleto. CPF ou CNPJ só na primeira cobrança | `supabase/functions/payments-create/handler.ts` (função `handler`); `components/cliente/PaymentPanel.tsx` |
| Pagamento confirmado | `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED` leva o atendimento a `paid`. `PAYMENT_OVERDUE` não move o atendimento | `supabase/functions/_shared/asaas-events.ts` |
| Cobrança cancelada | Ao cancelar pelo app, a cobrança aberta é removida no Asaas (`payments-void`). A chamada vem do app do cliente e do profissional, não do painel admin | `services/bookings.ts` (`voidOpenCharges`) |
| Cobrança do profissional | `charges-create`: plano Pro, recebimento ativo, CPF ou CNPJ do cliente, orçamento `accepted` (ou atendimento próprio `accepted`, `in_progress` ou `completed`, por `booking_id`). Sem taxa do WorkEasy e sem split | `supabase/functions/charges-create/handler.ts`; `pages/pro/Cobrancas.tsx` |
| Orçamento | Link público `/orcamento/:token`, sem login. Aceita ou recusa se `sent` e dentro da validade. Vence sozinho (`expired`) depois de `valid_until`. O aceite leva o total que o cliente viu: página com total antigo é recusada (`respond_quote`, migration `20261109300002`) | ARQUITETURA, "Orçamentos e avaliações"; `private.expire_stale` |
| Lembrete automático | Ao aceitar, o gatilho cria o de 24 h só se o início for mais de 24 h depois. Cancelamento marca os pendentes como `skipped`. A varredura a cada 15 min cria o de 24 h e o de 2 h (L14) | `private.notify_booking_status` (`migrations/20261019000008_notifications.sql`); `private.enqueue_booking_reminders` (`migrations/20261023100000_booking_reminders.sql`) |
| Suspensão do prestador | Propostas `sent` viram `withdrawn`; pedidos diretos `requested` são cancelados; orçamentos `sent` voltam a rascunho. Atendimentos já aceitos não são tocados e ficam para decisão sua | `private.withdraw_unapproved_offers` (`migrations/20261109000005_suspension_cascade.sql`) |
| Plano Pro | Sem pagamento e sem período pago, o plano volta a `free` sozinho, de hora em hora (`private.expire_pro_plans`, carência `pro_grace_days` = 0). Teste de 30 dias (`pro_trial_days`) vale uma vez por conta | `migrations/20261109000007_pro_plan_expiry.sql`; DECISOES, D3 |
| Envio automático | Sem credenciais do WhatsApp e do Resend, as linhas viram `skipped`. Hoje nada foi enviado em produção | ARQUITETURA, variáveis; O05, §1 e §11.1 |
| Avaliação | Só para atendimento de origem `platform`, `completed` ou `released`, com pagamento `received`, `confirmed` ou `released` pelo app | ARQUITETURA, "Orçamentos e avaliações" |
| Fila de prestadores | `admin_provider_queue`: cadastros em `pending_review` e aprovados com ocupação ainda a aprovar; ordem de chegada | `pages/admin/Prestadores.tsx`; `services/admin.ts` |
| Documento | Aceito só se o arquivo estiver no bucket (`file missing` caso contrário). Rejeição exige motivo, que o prestador vê | `admin_review_document` (`migrations/20261019000011_admin.sql`) |
| Aprovação do prestador | Na primeira aprovação, o banco aprova sozinho as ocupações com todos os passos aceitos e registro não rejeitado, e grava quais | `admin_set_provider_status` (mesmo arquivo) |
| Registro profissional | "Confirmar registro" exige escrever como você conferiu; "Rejeitar registro" tira a ocupação da busca e retira a aprovação | `components/admin/OccupationCard.tsx`; O02, §8.3 |
| Pagamentos que pedem atenção | `payment.refund_failed` e `payment.received_after_cancel` ficam na lista até um `payment.refunded_after_cancel` ou um `payment.reviewed` | `admin_payments_attention` (mesmo arquivo) |
| Contestação no admin | Duas saídas: "Liberar a favor do profissional" (`released`) ou "Cancelar a favor do cliente" (`canceled`), ambas com motivo obrigatório | `components/admin/DisputeCard.tsx` |
| Limite de trava | Mais de `labor_lock_days_per_week` (padrão 2) dias distintos na semana ISO com o mesmo profissional e o mesmo cliente, em ocupação com `labor_lock` (ex.: doméstica). Erro `labor_lock`. Editável em `/admin/configuracoes` (1 a 7; a tela pede parecer jurídico) | ARQUITETURA, "Agenda e atendimentos" |

---

## 3. Os dois caminhos

| | **Trilha A: pedido e aceite no app** | **Trilha B: WhatsApp, orçamento e cobrança do profissional** |
|---|---|---|
| Quando usar | Cliente criou o pedido em `/pedido` | Pedido chegou pelo WhatsApp, ou o cliente não quer criar conta |
| Entrada | `requests` (o cliente vê o pedido em `/pedidos`) | Planilha `pedidos`, com código `R-###` |
| Quem casa | Você escolhe até 3 prestadores (banco aceita 3) | Você escolhe de 3 a 5 prestadores (sem limite do banco) |
| Proposta | Prestador envia em `/pro/pedidos` (preço, mensagem, validade) | Prestador responde por WhatsApp; você confere e repassa. O prestador também pode emitir o orçamento direto |
| Aceite | Cliente, em `/pedidos/:id`, com dia, início e fim (até 24 h, futuro) | Cliente aceita o orçamento em `/orcamento/:token`, sem login |
| Cobrança | Cliente, em `/atendimentos/:id`: Pix ou fatura do Asaas. Vai para a conta da plataforma com split `[CONDICIONAL: depende de parecer (Q1)]` | Profissional Pro, em `/pro/cobrancas`. Vai para a conta Asaas do profissional, sem split |
| Conta do profissional | Recebimento ativo (`provider_payment_accounts`) | Plano Pro e recebimento ativo |
| Avaliação | Sim, depois de concluído e pago pelo app | Não (não há atendimento) |
| Status | `accepted → paid → in_progress → completed → released` (ou `disputed`); `requested` só no agendamento direto (L17) | Orçamento `sent → accepted`; pagamento `pending → received` |

**Regra de uso até a resposta da Q1 do advogado (O01, decisão 4).** O produto permite a cobrança da Trilha A já hoje. Até o parecer, cobre pela Trilha B. Se o cliente já aceitou pelo app e quer pagar pelo app, peça que ele cancele o atendimento em `/atendimentos/:id` (cancelamento pelo cliente remove a cobrança aberta) e refaça o combinado como orçamento da Trilha B. `[CONDICIONAL: depende de parecer]`

**Trilha B exige Pro do profissional.** Plano grátis não cobra pelo app. Sem Pro, não há cobrança pela plataforma. O teste de 30 dias vale uma vez por conta (DECISÕES, D3). Não combine cobrança fora do app (6.8).

**Ordem de pagamento.** O brief deste documento colocava o pagamento depois do serviço. O produto não faz assim: a Trilha A só cobra atendimento `accepted`, e a Trilha B só cobra orçamento `accepted`. Por isso a cobrança vem antes do serviço (SOP-07).

---

## 4. Procedimentos passo a passo

### 4.0 Checklist de um pedido, do início ao fim

Copie esta lista para a planilha `pedidos` de cada pedido. Marque a data e a hora em cada item.

- [ ] Pedido recebido, relógio de 2 h iniciado (SOP-01)
- [ ] Dados estruturados: ocupação, distrito, urgência, quando, descrição sem dado pessoal (SOP-01)
- [ ] Dentro do piloto e da lista de ocupações liberadas (SOP-01)
- [ ] Até 3 prestadores aptos escolhidos (Trilha A) ou 3 a 5 (Trilha B) (SOP-02)
- [ ] Convite enviado, um a um, com consentimento (SOP-03)
- [ ] Primeira proposta qualificada levada ao cliente. Relógio parado (SOP-04)
- [ ] Aceite feito pelo cliente, com horário conferido com o profissional (SOP-05)
- [ ] Confirmação enviada aos dois lados (SOP-06)
- [ ] Cobrança gerada pelo cliente (Trilha A) ou pelo profissional Pro (Trilha B) e status "Pago" conferido no app (SOP-07)
- [ ] Lembrete de 24 h enviado, se o atendimento começa depois de 24 h do aceite (SOP-08)
- [ ] Atendimento marcado "Concluído" pelo profissional (SOP-09)
- [ ] Pergunta única feita ao cliente (SOP-09)
- [ ] Avaliação (Trilha A) ou encerramento registrado no log (SOP-09)

### SOP-01. Entrada e estruturação do pedido

- **Quem:** você. **Onde:** WhatsApp Business (número dedicado, O01 P8) e planilha `pedidos`.
- **Prazo:** primeira resposta dentro da janela de atendimento: segunda a sexta, 8h às 17h30; sábado, 8h às 14h; domingo, só resposta automática (O01, §8.3) `[proposta]`. Fora da janela, o relógio começa na abertura seguinte.
- **Passos:**
  1. Responda com o roteiro S1 do O03 (primeira resposta).
  2. Colete, em uma ou duas perguntas por vez, os dados do roteiro S2: serviço, bairro e ponto de referência, quando, urgência.
  3. Confira o escopo. Serviço fora da lista liberada do O01 (§4) não entra no piloto. Bairro fora dos distritos abertos: roteiro S3 do O03. Pedido com conteúdo de saúde: roteiro S4 do O03 e não faça triagem.
  4. Peça que o cliente não envie telefone de terceiros, endereço completo nem dado de saúde (o formulário de `/pedido` já avisa).
  5. Registre na planilha `pedidos` os campos do O01, §11.2: `id` (código `R-###`), `canal`, `trilha`, `recebido_em`, `relogio_inicio`, `dentro_da_janela`, `valido`, `categoria`, `ocupacao` (slug do catálogo), `distrito` (slug), `urgente`.
  6. Se o pedido é do app (Trilha A), ele já está no banco e você só vê a contagem em `/admin` (lacuna L1). Peça o texto por WhatsApp com o roteiro S2 e registre o código do pedido.
- **Falhas:** bairro fora (6.10), conteúdo de saúde (6.11), cliente some antes da triagem (6.2).

### SOP-02. Escolha dos prestadores

- **Quem:** você. **Onde:** `/admin/prestadores` (filtro "Todos" ou "Aprovados") para ver ocupações e situação; planilha `prestadores` (O02, §13) para bairros.
- **Critérios (todos):**
  - situação `Aprovado` no cadastro;
  - ocupação aprovada (o painel mostra "ocupações aprovadas" no cabeçalho do cadastro);
  - bairro do pedido marcado pelo prestador (confirme na planilha, lacuna L7);
  - registro não rejeitado, quando a ocupação exige registro;
  - para o plano grátis: ainda com propostas no mês. Se não, o banco recusa com `free_proposal_limit`.
- **Quantidade:** Trilha A, 3 (limite do banco, L16). Trilha B, de 3 a 5 (O01, §10.2).
- **Ocupação com trava** (ex.: diarista, em `labor_lock`): o banco recusa o terceiro dia da semana para o mesmo cliente. Pergunte ao profissional se o cliente já tem dois dias com ele na semana (planilha `pedidos`), antes de acionar.
- **Não escolha por nota.** Não há critério de nota na operação do piloto. Use disponibilidade, bairro e ocupação.
- **Registro:** `prestadores_acionados` (n) e os códigos `P-###` na planilha.

### SOP-03. Convite ao prestador

- **Quem:** você, WhatsApp Business, uma conversa por vez, sem grupo e sem lista (O02, §12.3).
- **Quem pode receber:** só quem pediu contato ou deu consentimento (O05, §6; O02, §12.1). Sem lista comprada, raspada ou exportada de grupo.
- **Passos:**
  1. Envie o modelo MS-01 com o resumo do pedido. Tire nome e telefone do cliente antes de enviar.
  2. Etiqueta no WhatsApp Business: `aguardando-prestador`.
  3. Se a proposta não chegar em 2 h, envie MS-03 uma única vez. Depois, chame o próximo apto.
- **Prazo:** meta interna de 2 h para a primeira proposta qualificada entregue ao cliente (G3, O01 §5.1). Não prometa esse prazo ao cliente nem ao profissional.
- **Limite do banco (Trilha A):** proposta retirada não conta mais para o limite de 3, mas o mesmo prestador não reenvia no mesmo pedido (L4). Depois de uma retirada, chame outro prestador.

### SOP-04. Proposta recebida: conferir e levar ao cliente

- **Quem:** você. **Onde:** a proposta aparece em `/pro/pedidos` (prestador) e em `/pedidos/:id` (cliente, Trilha A). Na Trilha B, o prestador manda o orçamento pelo link `/orcamento/:token`.
- **Conferência antes de repassar (cinco itens):**
  1. Preço em reais, e a unidade (hora, serviço, dia, etc.) se houver.
  2. Dia e horário de início e de fim, com a data. Se o prestador disse "amanhã de manhã", peça o horário.
  3. Validade, se houver.
  4. Mensagem sem telefone, e-mail ou endereço.
  5. Prestador apto (aprovado, ocupação, bairro).
- **Relógio para:** quando a primeira proposta qualificada chega ao cliente (O01, G3).
- **Repasse:** roteiro S5 do O03 (no máximo 3 propostas). O preço é do profissional: você não tabela (O01, §10.4).
- **Prazo de resposta do cliente:** você acompanha em 24 h `[proposta]`. Depois disso, mensagem curta de acompanhamento escrita por você. O O03 não tem roteiro para cliente que não respondeu (o S12 é para profissional que não respondeu) `[proposta]`.
- **Mudança de preço pelo profissional:** a proposta enviada não muda de preço, mensagem nem validade (migration `20261109000001`), e a tela não edita (L4). Na Trilha A, o contorno é o profissional emitir um orçamento da Trilha B com o preço novo, e o cliente escolher. A proposta antiga continua `sent` com o preço original até o pedido fechar ou vencer. Diga ao cliente qual das duas vale, antes de ele aceitar.

### SOP-05. Aceite do cliente

- **Quem:** o cliente. Você orienta. **Onde:** Trilha A, `/pedidos/:id`, "Aceitar proposta", com dia, início e fim; Trilha B, `/orcamento/:token`.
- **Regras que o banco aplica (Trilha A):** o horário é futuro, dura no máximo 24 h e começa em até 2 anos. Se não couber, o banco responde `slot_unavailable`. Pedido vencido responde `request_not_open`.
- **Oriente o cliente:** escolha, no aceite, o mesmo dia e horário que o profissional informou. O banco não confere a agenda do profissional além de sobreposição com outro atendimento dele (`slot_unavailable`). Prestador que perdeu a aprovação da ocupação recebe `not_allowed`.
- **Se der `slot_unavailable`:** volte ao profissional, confirme o horário livre dele e peça ao cliente outro horário.
- **Prazo:** o cliente não tem prazo, mas você acompanha em 24 h `[proposta]`. O pedido fecha sozinho em 7 dias.
- **Registro:** `aceito_em`, `atendimento_id` (o `booking_id`, quando o cliente informar) e `valor_reais`.

### SOP-06. Confirmação do atendimento aceito

- **Quem:** você. **Onde:** WhatsApp Business, para cliente e profissional, com o modelo MS-04.
- **Prazo:** até 2 h depois do aceite, dentro da janela de atendimento `[proposta]`.
- **Por que manual:** o aviso automático `atendimento_confirmado` depende de credenciais do WhatsApp. Sem elas, a linha fica `skipped` (ARQUITETURA).
- **Endereço:** o produto não guarda endereço (L15). Os dois combinam o endereço entre si, por WhatsApp, só do que for necessário para o serviço. Não grave endereço na planilha. `[CONDICIONAL: depende de parecer]`
- **Confira o estado:** peça ao profissional que confirme o estado "Aceito" em `/pro/agenda`. Você não vê a agenda dele.

### SOP-07. Cobrança e pagamento

- **Quem:** o cliente (Trilha A) ou o profissional Pro (Trilha B). Você orienta e confere.
- **Trilha A, passo a passo:**
  1. O cliente abre `/atendimentos/:id`, escolhe Pix ou cartão ou boleto e toca em "Gerar cobrança". Na primeira vez, informa CPF ou CNPJ.
  2. Pix: QR Code e copia e cola. Cartão e boleto: página de fatura do Asaas. O WorkEasy não recebe dado de cartão (ARQUITETURA, Asaas).
  3. O vencimento é amanhã (São Paulo). Cobrança vencida pede nova geração ("Gerar nova cobrança").
  4. O atendimento vira "Pago" quando o webhook confirma. Nenhum comprovante muda o status.
- **Trilha B, passo a passo:**
  1. O profissional Pro abre `/pro/cobrancas` (ou "Cobrar este orçamento" logo depois do aceite) e informa o CPF ou CNPJ do cliente.
  2. A cobrança cai na conta Asaas do profissional. Pix ou link de fatura.
  3. Confira a situação na mesma tela do profissional, e no painel `/admin/pagamentos` quando for o caso.
- **Regra de conferência:** o estado que vale é o que o app mostra. Comprovante no WhatsApp não é prova de pagamento para o app. Se o cliente diz que pagou, siga 6.5.
- **Prazo de acompanhamento:** 24 h depois de gerada a cobrança `[proposta]`. Se ainda não houver pagamento, pergunte ao cliente, com MS-05.
- **Serviço antes do pagamento:** o profissional pode iniciar a partir de `accepted` (L11). Regra desta SOP `[proposta]`: não combine início antes de a cobrança estar gerada. Se o início for antes de o pagamento aparecer como "Pago", registre o caso no log e decida com o profissional e o cliente por escrito.
- **Pagamento fora do app:** não receba dinheiro na sua conta (O01, §10.4). Pagamento combinado por fora não aparece no app, não gera avaliação e não entra no histórico (juridico/01, cláusula 6.5). Use o roteiro S7 do O03.

### SOP-08. Lembrete e início

- **Quem:** você (lembrete) e o profissional (início). **Onde:** WhatsApp Business (MS-07); `/pro/agenda` (botão "Iniciar").
- **Lembrete:** o app agenda lembretes automáticos de 24 h e de 2 h (L14). Eles só saem com contato confirmado e credenciais de WhatsApp ou Resend. Confira o status em `notifications`. Se não saiu, envie MS-07 manualmente, uma vez, no dia anterior, até o fim da janela `[proposta]`.
- **Início:** o profissional toca em "Iniciar" (`accepted` ou `paid` vira `in_progress`). Não há estado de "chegou".
- **Prazo de cancelamento:** se alguém precisar cancelar, quem cancela é quem tem o botão no app (SOP-10).

### SOP-09. Conclusão, liberação e pergunta única

- **Quem:** o profissional marca "Concluir" (`in_progress → completed`). O cliente pode "Liberar atendimento" (`completed → released`, motivo opcional) ou "Contestar atendimento" (até 7 dias depois do fim).
- **Você:** 24 h depois do fim do horário sem "Concluir", envie MS-08 ao profissional `[proposta]`. Não há liberação automática: o atendimento fica `completed` sem prazo, e isso não impede a avaliação.
- **Pergunta única:** no dia útil seguinte ao serviço, roteiro S9 do O03, por WhatsApp. Registre `voltaria` (s, n ou vazio) e a frase, sem nome nem telefone (O01, §11.2) `[proposta]`.
- **Avaliação:** só o cliente, pelo app, na Trilha A, depois de concluído e pago (ARQUITETURA). Não a empurre. Não peça nota por WhatsApp.
- **Registro:** `resultado` (pago, aceito, perdido, cancelado, ensaio) e `valor_reais`.

### SOP-10. Cancelamento

- **Quem pode cancelar pelo app:** cliente e profissional, em `requested` ou `accepted`, com confirmação. Depois de `paid`, nenhum dos dois cancela pelo botão (juridico/04, §2.1 e §4.2).
- **Cancelamento de atendimento `accepted`:** pelo app, a cobrança aberta é removida no Asaas (`payments-void`). Se o cancelamento foi só pelo WhatsApp, ele não vale até alguém cancelar pelo app. Use MS-09.
- **Você não cancela pela tela.** A tela de admin não tem cancelamento de atendimento aceito (L8). Não faça `update` em `bookings` nem `transition_booking` por SQL. Se for preciso, escale (seção 10).
- **Cancelamento de atendimento pago:** não há procedimento aprovado. Veja 6.10.

---

## 5. Fila de aprovação de prestadores (`/admin`)

A ordem é a da fila: a mais antiga primeiro (`Prestadores.tsx`). Meta de primeira decisão: 3 dias úteis a partir do envio `[proposta]`.

### 5.1 Passo a passo

1. **Entrar na fila.** `/admin`, bloco "Pendências", card "Prestadores na fila". Abra `/admin/prestadores`. O filtro padrão é "Fila de análise" (cadastros "Em análise" e aprovados com ocupação ainda a aprovar).
2. **Abrir o cadastro.** `/admin/prestadores/:id`. Confira nome, situação, ocupações, registro e documentos. A tela mostra o telefone da conta: use-o só para falar com a pessoa pelo WhatsApp, e não o copie para a planilha.
3. **Documentos (um por um).** Em cada um, "Ver arquivo". O endereço vale 5 minutos (`SIGNED_URL_SECONDS` = 300), e cada "Ver arquivo" grava `document.viewed` no audit_log antes de o link ser criado. Confira com o critério do O02, §8.3. Depois:
   - "Aceitar documento" (observação opcional). O banco recusa se o arquivo não estiver no armazenamento (`file missing`).
   - "Rejeitar documento" (motivo obrigatório; o prestador vê). Use MS-12.
   - Nunca baixe, copie ou tire print de documento (O01, §11.3, item 4).
4. **Registro profissional (quando a ocupação exige).** Abra a consulta pública do conselho pelo link que a tela oferece. O link é uma busca com o nome do registro e do conselho, sem o número (`services/admin.ts`, `registryLookupUrl`). Digite o número você mesmo na consulta do conselho. O que o site do conselho faz com a consulta não foi conferido aqui. Depois:
   - "Confirmar registro": o app exige que você escreva como conferiu (data da consulta, por exemplo).
   - "Rejeitar registro": divergência de nome, número ou situação. A ocupação sai da busca, deixa de receber pedidos e perde a aprovação. Para voltar, o registro precisa sair de `rejected` e a ocupação ser aprovada de novo.
5. **Aprovar a ocupação.** "Aprovar ocupação" aparece enquanto a ocupação não está aprovada. Fica desabilitado, com a dica do que falta, até que todos os passos da política tenham documento **aceito** (não só enviado), o registro não esteja rejeitado e, se a política pede registro, o número esteja informado. Sem política no catálogo, o banco recusa (`policy missing`). Com a ocupação aprovada, o botão vira "Retirar aprovação", que desfaz com motivo.
6. **Aprovar o prestador.** "Aprovar prestador" (motivo obrigatório). Use só quando a situação for "Em análise" (L5). Na primeira aprovação, o banco aprova sozinho as ocupações que já cumprem a regra, e grava quais no histórico. As demais você aprova uma a uma (L6: aprove só depois de ao menos uma).
7. **Avisar.** MS-13 (aprovado) ou MS-12 (documento rejeitado). Registre no log.
8. **Suspender ou reativar** (motivo obrigatório). Suspenso, o prestador não aparece na busca nem recebe pedido. Ao suspender, as propostas `sent` são retiradas, os pedidos diretos `requested` são cancelados e os orçamentos `sent` voltam a rascunho. Atendimentos já aceitos não mudam e ficam para sua decisão (migration `20261109000005`). Reativar não aprova ocupação nova. Só com decisão registrada: `[DECISÃO DO DONO]` sobre os motivos (seção 10).

### 5.2 O que a aprovação muda

- Aprovado com ocupação aprovada: aparece na busca e na página `/p/<endereço>`, e recebe pedidos dos bairros marcados (`/pro/pedidos`).
- Pode cobrar pelo app só com plano Pro e recebimento ativo (`/pro/assinatura`).
- Não há aviso automático de aprovação. MS-13 é o aviso.

### 5.3 Quando um documento aceito é rejeitado depois

Se você rejeita um documento que estava aceito, o banco tira a aprovação das ocupações que dependiam dele (`provider_documents_revoke_approvals`, com registro no `audit_log`). Aceitar de novo não devolve a aprovação: ela volta só por "Aprovar ocupação". Avise o prestador (MS-12) e diga que ele fica fora da busca dessas ocupações até a nova aprovação.

### 5.4 Regras da fila

- Não aprove cadastro seu, de familiar ou de conhecido sem o mesmo processo, e sem outra pessoa conferindo `[proposta]`.
- Não aprove sem ter visto o arquivo.
- Cada decisão leva motivo. O motivo entra no histórico e fica na trilha de auditoria.
- Cadastro sem o arquivo de um passo da política não chega a "Em análise" (o envio responde `documents_missing`). Não faça exceção por WhatsApp: o O02 (§1.3, regra 7) veda receber documento pelo WhatsApp.

---

## 6. Ramos de falha

Cada ramo tem: o sinal, o que conferir, o que fazer, o prazo, quem decide e o que registrar.

### 6.1 Nenhum prestador responde

- **Sinal:** nenhuma proposta em 2 h, na janela.
- **Conferir:** `/pro/pedidos` do prestador (ele viu o pedido?); se o bairro e a ocupação estão marcados (planilha, L7).
- **Fazer:** MS-03 uma vez, para quem não respondeu. Depois, chame o próximo apto (até 3 na Trilha A). Se nenhum responder em 24 h, abra a Trilha B com outros prestadores aptos e avise o cliente com o roteiro S12 do O03.
- **Ao cliente:** roteiro S12 do O03. Não prometa prazo.
- **Decide:** você. **Registra:** `prestadores_acionados`, `primeira_resposta_em`, motivo de perda.

### 6.2 Cliente some

- **Antes do aceite:** uma mensagem de acompanhamento em 24 h, escrita por você (o O03 não tem roteiro para isso; o S12 é para profissional que não respondeu) `[proposta]`. Sem resposta em 48 h, marque o pedido como `perdido: sem resposta`. O pedido fecha sozinho em 7 dias (`closed`).
- **Depois do aceite, sem pagamento:** o atendimento fica `accepted` sem prazo, porque nenhum processo automático o fecha (L10). Sinal: sem cobrança em 24 h. Você pergunta ao cliente com MS-05. Sem resposta em 48 h, peça que o cliente cancele pelo app (SOP-10). Se o início já passou e não há cancelamento, escale (seção 10).
- **Depois do pagamento e sem início:** o profissional marca "Iniciar" ou "Cancelar". Sem nenhum dos dois em 24 h do horário, envie MS-08 ao profissional.
- **Registro:** o motivo na planilha, sem o nome do cliente.

### 6.3 Profissional não comparece (falta)

- **Sinal:** o cliente relata que o profissional não foi, ou o profissional não marca "Iniciar" perto do horário.
- **Conferir:** estado do atendimento em `/atendimentos` (cliente) e `/pro/agenda` (profissional); se houve pagamento, pela cobrança (SOP-07). Não existe marca de "não compareceu" (L9).
- **Fazer no mesmo dia:** ouvir o profissional por escrito. Se a falta for confirmada:
  - atendimento `accepted` (sem pagamento): peça ao profissional que cancele pelo app (SOP-10);
  - atendimento `paid` (com pagamento): não há cancelamento pelo app para o profissional. Escale ao dono (seção 10). `[CONDICIONAL: depende de parecer]`. Juridico/10, T1: não escreva "vamos devolver o valor" antes da análise.
- **Ao cliente:** responda com o texto da T1 de `juridico/10-sac-e-atendimento.md` (sem prometer devolução). Prazo de resposta: 5 dias corridos (juridico/10, §4.1) `[proposta]`.
- **Decide:** o dono, em qualquer caso com pagamento. **Registra:** incidente `I-###`, sem dado de saúde.

### 6.4 Divergência de preço

- **Antes do aceite:** o preço da proposta é o que vale. Se o profissional muda, o contorno é o orçamento da Trilha B (SOP-04). A proposta antiga não pode ser reeditada pela tela (L4).
- **Depois do aceite (`accepted`):** o preço do atendimento é o da proposta aceita (`price_cents`). Nenhuma tela o muda. Se as partes querem outro preço, a saída é cancelar pelo app (SOP-10) e refazer o combinado como orçamento novo.
- **Depois do pagamento:** o preço cobrado é o do atendimento. Divergência é caso de contestação ou SAC. Juridico/10, T2, com o valor da proposta e o valor cobrado, sem prometer nada.
- **Não escreva:** "o preço é fixo" nem "o profissional não pode cobrar mais". Depende do acordo.
- **Decide:** você, antes do aceite. O dono, depois do pagamento. **Registra:** `valor_reais` antes e depois.

### 6.5 Pagamento não reconhecido

- **Sinal:** o cliente diz que pagou, mas o app mostra "Aceito" ou a cobrança aparece como pendente ou cancelada.
- **Conferir, nesta ordem:**
  1. `/admin/pagamentos`: pelo id da cobrança, ou pelo filtro de período. Veja a situação (`pending`, `confirmed`, `received`, `held`, `released`, `refunded`, `failed`, `canceled`; juridico/10, T3).
  2. `/admin/pagamentos`, "Exigem atenção": se houver entrada `payment.refund_failed` ou `payment.received_after_cancel`, siga 6.6.
  3. `/admin/auditoria`: procure a entrada do pagamento. Evite abrir `payments.raw` (a tela de admin usa `admin_get_payment_raw`, que grava auditoria e traz dados do pagador).
  4. Com o id da cobrança, confira no painel do Asaas, se você tiver acesso. Se não tiver, é o dono.
- **Fazer:** peça ao cliente só o que serve para localizar, como o identificador da transação Pix ou o e-mail usado no pagamento (juridico/10, T3). Nunca peça número de cartão, senha ou código de acesso, por nenhum canal.
- **Não faça:** não marque o atendimento como pago; não use `admin_review_payment` para "resolver" caso que não está em "Exigem atenção"; não aceite comprovante como prova. Nenhuma tela move o atendimento para `paid` (mas o banco aceita a transição por SQL, L13: não faça).
- **Prazo:** primeira ação em 2 dias úteis `[proposta; juridico/10, §4.2, P2]`.
- **Se o Asaas mostra pago e o app não:** é falha de entrega do aviso (webhook). Não há reprocessamento pela tela. Escale ao dono com o id da cobrança e o horário. `[CONDICIONAL: depende de parecer quanto a dados do pagador]`
- **Decide:** o dono. **Registra:** `G-###` (id da cobrança), horário, o que foi conferido, sem dado do pagador.

### 6.6 Pagamento recebido depois do cancelamento

- **Sinal:** entrada `payment.received_after_cancel` em "Exigem atenção".
- **O que o app já fez:** registrou o pagamento e pediu o estorno total ao Asaas (asaas-webhook, `refundAfterCancel`). O código diz que o Asaas só aceita estorno de Pix e de cartão (comentário em `asaas-webhook/handler.ts`; O07, §6.2, cita `asaas-client.ts`). `[incerto: não conferido na documentação do Asaas; a página de referência consultada deu 404 nesta revisão]`. Se o Asaas aceitou, vira `payment.refunded_after_cancel`. Se recusou (boleto, saldo, rede), vira `payment.refund_failed`.
- **Fazer:** para `refund_failed`, o estorno é manual, no painel do Asaas, e só depois de o dono decidir `[CONDICIONAL: depende de parecer]`. Depois, em "Exigem atenção", "Marcar como tratado" com o motivo (`admin_review_payment`). A entrada some quando existir `payment.refunded_after_cancel` ou `payment.reviewed`.
- **Atenção:** atendimento `disputed` com estorno: veja L12. Não devolva sem o dono conferir o status. Caso C do O07, §6.2 (pago, e a equipe cancelou o atendimento): não aparece em "Exigem atenção". Controle na planilha, com o ID da cobrança.
- **Decide:** o dono. **Registra:** o motivo do "tratado", em uma linha.

### 6.7 Horário não cabe, ou a trava trabalhista impede

- **Sinal:** o banco responde `slot_unavailable` (horário ocupado, ou período fora da regra) ou `labor_lock` (dias por semana).
- **Fazer:** `slot_unavailable`: volte ao profissional e confirme o horário livre, depois peça ao cliente outro (SOP-05). `labor_lock`: a ocupação está em regra de trava. Ofereça outra data, ou outro prestador de outra ocupação, se o pedido permitir. Não tente contornar a trava por outro cadastro.
- **Decide:** você. **Registra:** o código do erro.

### 6.8 Cliente quer pagar fora do app

- **Sinal:** "posso pagar direto para o profissional?"
- **Resposta:** roteiro S7 do O03. Você diz o que o app registra e o que não registra. Não aconselhe a fazer, nem a não fazer. Não recuse o pedido por isso.
- **Se o pagamento já foi combinado por fora:** o pagamento não aparece no app. Não há avaliação nem histórico. Registre o caso como "combinado por fora" no log e avise o dono, sem julgar.
- **Base:** juridico/01, cláusula 6.5 (rascunho, lida nesta sessão); O03, S7.

### 6.9 Contestação aberta

- **Sinal:** atendimento em "Em contestação" e a tela `/admin/disputas` com o item. Chargeback no cartão também leva o atendimento a "Em contestação" sozinho (`PAYMENT_CHARGEBACK_REQUESTED`).
- **Prazo:** primeiro contato com as duas partes no mesmo dia útil `[proposta]`; decisão em até 5 dias corridos `[proposta; juridico/10, §4.1]`.
- **Passos:**
  1. MS-10 para as duas partes, pedindo o relato em poucas linhas, sem dado sensível de terceiro.
  2. Confira o atendimento (data, valor, proposta aceita, histórico de status). Confira o pagamento pela tela (6.5).
  3. Decida e registre o motivo:
     - "Liberar a favor do profissional" (`released`): para quando o serviço foi feito como combinado.
     - "Cancelar a favor do cliente" (`canceled`): para quando o serviço não foi feito ou foi feito fora do combinado.
  4. A própria tela avisa que a decisão muda a situação do atendimento e não move dinheiro. Por isso, MS-11 deve dizer isso.
- **Dinheiro:** se a decisão exige devolução ou repasse, escale. Não faça estorno por conta própria `[CONDICIONAL: depende de parecer]`.
- **Decide:** você, para a situação do atendimento. O dono, para qualquer dinheiro. **Registra:** `C-###`, motivo, data da decisão.

### 6.10 Pedido de devolução, desistência ou arrependimento

- **Sinal:** o cliente pede o dinheiro de volta, ou quer desistir de um atendimento pago.
- **Fato:** o app não tem botão de devolução para atendimento pago. O procedimento está em rascunho (juridico/04, cláusula 5.5: `[PLANEJADO]` e `[CONDICIONAL: depende de parecer]`).
- **Fazer:** responda que o pedido foi registrado e será analisado; não prometa devolução nem prazo. Registre. Escale ao dono e ao advogado.
- **Antes da cobrança ser paga:** cancelar pelo app (cliente, em `accepted`) remove a cobrança aberta. É o caminho que não depende de devolução.

### 6.11 Conteúdo de saúde ou risco à pessoa

- **Sinal:** o pedido ou a conversa descreve sintoma, doença, tratamento ou risco.
- **Fazer:** não faça triagem nem orientação (O03, S4). Se há risco agora, oriente a procurar o serviço de emergência, como no protocolo de emergência do O06 (seção 10). O número `192` foi conferido em fonte oficial nesta revisão (gov.br, SAMU 192): "O serviço é gratuito, acessado pelo número 192, funciona 24 horas por dia e 07 dias por semana".
- **Registro:** `I-###` sem o conteúdo de saúde. Só a categoria e a ação.
- **Decide:** o dono, na hora. Advogado no mesmo dia (juridico/10, §5.4).

### 6.12 Suspeita de fraude ou de conta falsa

- **Sinal:** cadastro com documento de outra pessoa, avaliação sem atendimento, pagamento em nome de terceiro, pedido de teste em conta real.
- **Fazer:** não aprove, ou suspenda com motivo (seção 5.1, passo 8). Não avise a pessoa do motivo com detalhe que ajude a fraude. Escale ao dono.
- **Registro:** `I-###`, categoria e ação. Pedidos de teste vão para `contas_de_teste` (O01, §11.3) e ficam fora dos portões.
- **Decide:** o dono. `[DECISÃO DO DONO]` critério de suspensão.

---

## 7. Rotina diária (20 minutos)

Faça no bloco de abertura (O01, §8.1, 07h30 a 08h), e feche o que sobrar no registro da tarde.

| Min | Bloco | O que fazer | Onde |
|---|---|---|---|
| 0 a 2 | Pendências | Veja "Prestadores na fila" e "Disputas abertas". Só registre o que mudou desde ontem | `/admin` |
| 2 a 4 | Dinheiro | "Exigem atenção": só o que aparece. Siga 6.5 e 6.6 | `/admin/pagamentos` |
| 4 a 10 | WhatsApp | Responda o que está em `novo`. Etiquetas: `novo`, `aguardando-prestador`, `aguardando-cliente`, `proposta-enviada`, `aceito`, `pago`, `lembrete-hoje`, `disputa` `[proposta]` | WhatsApp Business |
| 10 a 14 | Atendimentos | Aceite sem confirmação (MS-04); lembrete de amanhã (MS-07); concluído pendente há 24 h (MS-08) | Planilha `pedidos` |
| 14 a 16 | Pedidos parados | Pedido sem proposta há 2 h (SOP-03); proposta a levar ao cliente (SOP-04); aceite sem resposta há 24 h (SOP-05) | Planilha `pedidos` |
| 16 a 18 | Registro | Lance o dia no log (seção 9) e as horas na planilha `horas` | Planilhas |
| 18 a 20 | Amanhã | Escreva três linhas: o que é urgente amanhã, quem precisa de resposta, o que você não vai fazer | Planilha `pedidos` |

Se algum item passar de 20 minutos, não corte o registro. Corte a resposta de baixa prioridade e registre a fila.

---

## 8. Revisão semanal (60 minutos, sexta)

Use o modelo do O01, §12, com estes blocos.

| Min | Passo | Fonte |
|---|---|---|
| 0 a 10 | Números do banco: pedidos, propostas, aceites, pagos, atendimentos por situação. Compare com o ritmo do O01, §5.3 | `/admin` (`admin_metrics`), planilha `pedidos` |
| 10 a 20 | Funil de prestadores: contatados, aprovados, com agenda ativa | Planilha `prestadores` (O02, §13.3) |
| 20 a 30 | Disputas, pagamentos em atenção, incidentes e violações de regra (meta: zero) | `/admin/disputas`, `/admin/pagamentos`, `/admin/auditoria`, log |
| 30 a 40 | Horas (teto de 60 h, O01 §8.5) e reconciliação entre planilha e banco. Diferença acima de 5% pede explicação linha a linha (O01, §11.3) | Planilhas `horas` e `pedidos` |
| 40 a 50 | Escolha uma alavanca para a semana seguinte (O01, §12), com a evidência da semana | Planilha |
| 50 a 60 | Registre a decisão no modelo do O01, §12, e o que mudou nos riscos (O01, §15) | Documento de revisão |

Métricas e portões de decisão ficam no O08 (`08-metricas-e-portoes.md`), que existe nesta pasta. Onde o O08 corrige o O01 (§2.3 dele), vale o O08. Até a revisão, valem as definições do O01, §5.1.

---

## 9. Log e planilhas

### 9.1 Regras

1. Registre no mesmo dia (O01, §11).
2. Use códigos, não nomes nem telefones. Nenhum dado de saúde. Nenhum documento de prestador, nem cópia, nem print.
3. Decisão tem motivo escrito. Sem motivo, não é decisão.
4. Planilhas ficam fora do repositório (O01, §11.4).

### 9.2 Códigos

| Código | Coisa |
|---|---|
| `P-###` | Prestador (código interno da sua planilha, não o id do banco) |
| `R-###` | Pedido (da planilha `pedidos`; o id do banco vai na coluna `ref_banco` quando existir) |
| `A-###` | Atendimento (coluna `atendimento_id` com o `booking_id`) |
| `Q-###` | Orçamento (`quote_id`) |
| `G-###` | Pagamento (`payment_id` ou o id da cobrança no Asaas) |
| `C-###` | Contestação |
| `I-###` | Incidente |

### 9.3 Formato da linha do log

Uma linha por evento. Campos separados por ` | `. Campos vazios ficam vazios.

```text
data_hora_sp | tipo | ref | ação | resultado | próximo passo | prazo | motivo
```

Exemplos (códigos fictícios):

```text
2026-11-09 08:42 | pedido | R-001 | entrou pelo WhatsApp; roteiro S2 | aberto | acionar 3 prestadores | 10:42 |
2026-11-09 10:50 | proposta | R-001 | P-004 enviou preço e horário; levada ao cliente (S5) | proposta entregue | aceite do cliente | 12:50 |
2026-11-10 17:00 | atendimento | A-012 | lembrete manual MS-07 enviado a cliente e profissional | enviado | nenhum | — | atendimento começa em menos de 24 h do aceite
2026-11-12 09:15 | prestador | P-007 | documento rejeitado (MS-12) | rejeitado | aguardar novo arquivo | 3 dias úteis | arquivo ilegível
```

### 9.4 Planilhas

- `pedidos`: campos do O01, §11.2, mais `ref_banco` e `atendimento_id`.
- `prestadores`: O02, §13, mais `distritos_atendidos` e `agenda_ativa_em` (O01, §5.2).
- `horas`: `data`, `categoria` (R, O, D, C, E, P, M, A, B), `horas`.
- `log`: o formato da seção 9.3.
- `contas_de_teste`: `identificador`, `papel`, `criado_em`, `motivo` (O01, §11.2).

### 9.5 Conversas do WhatsApp

Não há regra de descarte nem de cópia de segurança aprovada. O inventário (juridico/07, OP-23) aponta essa lacuna (Q32). `[DECISÃO DO DONO]` depois do parecer: prazo de guarda de conversas de pedido e de cópia de segurança. Até lá, não exporte conversas para planilha, e apague o que já não for necessário para a operação `[proposta]`.

---

## 10. Escalonamento

| Gatilho | Primeiro a agir | Prazo | Quem decide | Base |
|---|---|---|---|---|
| Risco à saúde ou à integridade de alguém | Emergência, como no O06 (seção 10). Depois, o advogado | Na hora | Dono e advogado | O06; juridico/10, §5.4 |
| Pagamento não reconhecido com mais de 2 dias úteis | Dono, com o id da cobrança | 2 dias úteis | Dono | juridico/10, §4.2 (P2) |
| Pagamento recebido depois do cancelamento, sem estorno aceito | Dono | Mesmo dia | Dono | asaas-webhook; 6.6 |
| Pedido de devolução ou desistência de atendimento pago | Dono e advogado | Mesmo dia | Advogado | juridico/04, cláusula 5.5 `[CONDICIONAL]` |
| Contestação que exige dinheiro | Dono | 5 dias corridos | Dono | juridico/04, cláusulas 5.6 e 8.4 |
| Falta confirmada com pagamento feito | Dono | Mesmo dia | Dono | 6.3 |
| Suspeita de fraude ou conta falsa | Dono | Mesmo dia | Dono `[DECISÃO DO DONO]` | 6.12 |
| Pedido de titular de dados (exclusão, cópia) | Encarregado | 15 dias corridos `[incerto]` | Encarregado `[DECISÃO DO DONO]: quem é` | juridico/10, §4.1 e §7. A LGPD, art. 19, II, fixa 15 dias para a declaração de acesso; o prazo para exclusão e cópia não foi conferido no texto da lei (planalto bloqueado nesta revisão) |
| Suspeita de incidente de segurança com dados | Plano de incidentes | Conforme o plano | Encarregado e advogado | juridico/08 |
| Ordem judicial, notificação, pedido de imprensa ou de autoridade | Advogado | No dia do recebimento | Advogado | juridico/10, T12 |
| Reclamação de conselho profissional | Advogado | No dia | Advogado | juridico/10, T11 |
| Qualquer evento na linha Cuidado | O06 (não tratado aqui) | Conforme o O06 | Dono | O06 |

**Parar a captação.** Se entrarem mais de 8 pedidos por dia durante 3 dias seguidos, pare de captar e conserte o processo antes de seguir (O01, §8.3). Pare o atendimento de ocupação com incidente grave aberto até o dono decidir `[DECISÃO DO DONO]`.

---

## 11. Modelos de mensagem

Use com a conta do WhatsApp Business no número dedicado, uma conversa por vez. Troque os campos entre chaves. Não escreva prazo, garantia nem resultado. O cliente recebe o horário e o preço já escolhidos pelo profissional e pelo cliente.

Modelos de cliente do primeiro contato e da triagem estão no O03 (roteiros S1 a S13). Os avisos automáticos do app estão no O05.

**MS-01. Convite ao profissional (um pedido, uma conversa, com consentimento).** Quando: logo depois de a triagem estar completa.

```text
Oi, {nome}. Entrou um pedido de {ocupação} em {bairro}, para {quando}.
Resumo, sem dados do cliente: {resumo}.

Se tiver interesse e puder atender, abra /pro/pedidos no app e envie sua proposta, com preço e dia e horário em que pode ir. O pedido fica aberto até {data}.

Se não puder, não precisa responder.
```

**MS-02. Pedido de preço e horário (Trilha B, quando o profissional não usa o app).** Quando: o profissional aceitou ver o pedido, mas não respondeu pelo app.

```text
Oi, {nome}. Para o pedido de {ocupação} em {bairro}, pode me dizer o preço em reais e o dia e horário em que consegue ir? Se preferir, emita o orçamento pelo app, em /pro/orcamentos.
```

**MS-03. Lembrete único ao profissional.** Quando: 2 h sem proposta, uma vez só.

```text
Oi, {nome}. Só lembrando do pedido de {ocupação} em {bairro}, aberto até {data}. Ainda não recebi sua proposta.
```

**MS-04. Aceite confirmado (para o cliente e para o profissional, um texto para cada).** Quando: até 2 h depois do aceite.

```text
{nome}, o atendimento de {ocupação} está aceito no app: {dia}, das {início} às {fim}, com {nome do outro}.
A cobrança é gerada pelo app, em Atendimentos (cliente) ou em Cobranças (profissional Pro).
Endereço e detalhes do serviço vocês combinam entre si, por aqui.
```

**MS-05. Cobrança ainda não paga.** Quando: 24 h depois de gerada a cobrança, ou antes do início, se não houver pagamento.

```text
Oi, {nome}. Vi que a cobrança do atendimento de {dia} ainda não aparece como paga no app. A cobrança é gerada em Atendimentos, pelo app.
Não é preciso enviar comprovante por aqui: o app atualiza sozinho quando o pagamento chega.
Se preferir cancelar, faça pelo app, em Atendimentos, com o motivo.
```

**MS-06. Pagamento que o cliente diz ter feito, mas o app não mostra.** Quando: 6.5.

```text
Oi, {nome}. Estou conferindo o pagamento do atendimento de {dia}. Hoje, no app, o status é {status}.
Para localizar o pagamento, preciso de {identificador da transação Pix ou e-mail usado no pagamento}.
Não preciso do número do seu cartão, nem da senha do banco, nem de nenhum código de acesso. Não envie esses dados por aqui nem por e-mail.
```

**MS-07. Lembrete de 24 h (cliente e profissional, um texto para cada).** Quando: no dia anterior, até o fim da janela.

```text
Lembrete: {ocupação} com {nome do outro}, amanhã, das {início} às {fim}.
Se precisar mudar, combinem entre vocês. Se for cancelar, faça pelo app, em Atendimentos, com o motivo.
```

**MS-08. Marcar como concluído (profissional).** Quando: 24 h depois do fim, sem "Concluir".

```text
Oi, {nome}. O atendimento de {dia} ainda aparece como em andamento no app. Quando terminar, toque em Concluir na sua Agenda, em /pro/agenda.
```

**MS-09. Cancelamento pedido por WhatsApp.** Quando: alguém pede cancelamento por aqui.

```text
Recebi o pedido de cancelamento do atendimento de {dia}. O cancelamento precisa ser feito pelo app, em Atendimentos, com o motivo, para que a cobrança aberta também seja removida.
```

**MS-10. Contestação aberta (cliente e profissional, um texto para cada).** Quando: 6.9, passo 1.

```text
Foi aberta uma contestação do atendimento de {dia}. Preciso ouvir vocês dois.
Respondam, em poucas linhas, o que aconteceu, sem dados pessoais de terceiros. Prazo para resposta: {data}.
A decisão aparece no app, na situação do atendimento. Ela não move dinheiro pelo app.
```

**MS-11. Decisão da contestação (cliente e profissional, um texto para cada).** Quando: 6.9, passo 3.

```text
A contestação do atendimento de {dia} foi encerrada: {liberado a favor do profissional | cancelado a favor do cliente}.
Motivo: {motivo}.
A decisão muda a situação do atendimento no app. Sobre dinheiro, respondo em separado.
```

**MS-12. Documento rejeitado ou ocupação retirada (prestador).** Quando: 5.1, passo 3, e 5.3.

```text
Oi, {nome}. O documento {tipo} não foi aceito: {motivo}.
Você pode enviar outro arquivo em /pro/cadastro, na seção Documentos. Enquanto isso, a ocupação {ocupação} fica fora da busca e dos pedidos.
```

**MS-13. Cadastro aprovado (prestador).** Quando: 5.1, passo 7.

```text
Oi, {nome}. Seu cadastro foi aprovado para {ocupação}. Você aparece na busca dos bairros que marcou e recebe pedidos da sua ocupação em /pro/pedidos.
Antes disso, confira serviços e horários em /pro. Pode haver pedido depois, ou não: a aprovação não garante pedidos.
```

**MS-14. Cadastro suspenso (prestador).** Quando: 5.1, passo 8, com motivo decidido.

```text
Oi, {nome}. Seu cadastro foi suspenso, pelo motivo: {motivo}.
Enquanto estiver suspenso, você não aparece na busca e não recebe pedidos. Para contestar esta decisão, escreva para {e-mail do SAC} `[DECISÃO DO DONO: e-mail do SAC]`.
```

---

## 12. Perguntas para o advogado e para o dono

Antes do D1, estas perguntas precisam de resposta. Ligue o que depender delas só depois do parecer.

| # | Pergunta | Quem | Onde está |
|---|---|---|---|
| P1 | Devolução de atendimento pago, pedida pelo cliente ou pelo profissional: procedimento, prazo e forma | Advogado | juridico/04, cláusula 5.5 |
| P2 | Quem é o encarregado (LGPD) e qual o e-mail do SAC | Dono | juridico/10, §2.3 |
| P3 | Acesso de leitura de pedidos e de dados pessoais pelo operador, no banco e no WhatsApp | Advogado e dono | L1; juridico/07, Q32 |
| P4 | Prazo de guarda das conversas do WhatsApp e cópia de segurança | Advogado e dono | juridico/07, OP-23 e Q32; seção 9.5 |
| P5 | Endereço do serviço trocado por WhatsApp: é necessário e como se registra | Advogado | L15 |
| P6 | Procedimento para atendimento pago que não compareceu (falta) | Advogado | 6.3; juridico/10, T1 |
| P7 | Critérios de suspensão e quem decide | Dono | seção 5.1, passo 8; 6.12 |
| P8 | Se o banco deve recusar aprovação de prestador em `draft` e sem ocupação aprovada | Dono | L5, L6 |
| P9 | Se o admin pode aplicar qualquer transição (L13) e se o estorno do Asaas em atendimento `disputed` é aceito pelo banco (L12) | Dono | L12, L13 |
| P10 | Número de propostas por pedido na Trilha A (3 pelo banco, 3 a 5 no O01) | Dono | L16 |

---

## 13. O que não verifiquei

- **Não rodei o app nem fluxos de escrita.** Rodei consultas só de leitura no banco local (transação revertida): matriz de transições, limites, constraints, cron e colunas de `requests` e `bookings`. As demais regras foram lidas no código e nas migrations, não testadas. Em especial: o estorno com atendimento `disputed` (L12), a expiração de atendimento aceito (L10) e o comportamento do webhook em falha.
- **Não consegui abrir a documentação do Asaas** nesta revisão: a página de referência consultada deu 404 e a busca estava esgotada. Qualquer afirmação sobre estorno, vencimento de Pix ou status de cobrança vem do código deste repositório, não do Asaas.
- **Não confirmei as regras do WhatsApp Business (aplicativo) para mensagens manuais e para o mesmo número.** O O02, §12.3 marca isso como `[incerto]`, e o O05 (opção C) pede número separado. Este documento usa número dedicado.
- **Número de emergência (192):** conferido na página do gov.br nesta revisão (ver 6.11).
- **LGPD e Decreto 7.962/2013 não conferidos.** As páginas do planalto.gov.br devolveram aviso de acesso negado nesta revisão. Os prazos de titular (§10) e os de SAC continuam `[incerto]` até o advogado conferir o texto.
- **Não confirmei o efeito do estorno do Asaas** sobre atendimento já em contestação, em produção.
- **Os prazos de SLA** (2 h, 24 h, 2 dias úteis, 3 dias úteis) são propostas internas, não promessas aos clientes, e não foram medidos.
- **As etiquetas do WhatsApp Business** (seção 7) são uma convenção proposta, não um recurso verificado do aplicativo.

---

## 14. Fontes consultadas nesta sessão

Fontes externas abertas na revisão de 08/11/2026: gov.br, página do SAMU 192 (lida; confirma 192, gratuito, 24 h). Não consegui abrir: planalto.gov.br (Lei 13.709, arts. 18 e 19; Decreto 7.962/2013), que devolveu aviso de acesso negado; docs.asaas.com (404). Este documento cita a LGPD só por referência aos prazos do juridico/10 (§10).

Repositório (caminhos a partir de `/home/user/work-easy/apps/web/`):

- `docs/ARQUITETURA.md` (tabelas, RPCs, regras de pedido, propostas, atendimentos, cobranças, notificações, admin, erros)
- `pages/cliente/Pedido.tsx`, `pages/cliente/concierge.ts`, `pages/cliente/PedidoDetalhe.tsx`, `pages/cliente/labels.ts`
- `pages/admin/Painel.tsx`, `pages/admin/Prestadores.tsx`, `pages/admin/PrestadorDetalhe.tsx`, `pages/admin/Disputas.tsx`, `pages/admin/Pagamentos.tsx`, `pages/admin/routes.tsx`, `pages/admin/Lgpd.tsx`
- `pages/pro/Pedidos.tsx`, `pages/pro/Agenda.tsx`, `pages/pro/Orcamentos.tsx`, `pages/pro/Cobrancas.tsx`, `pages/pro/Cadastro.tsx`, `pages/pro/Assinatura.tsx`
- `components/cliente/BookingActions.tsx`, `components/cliente/PaymentPanel.tsx`, `components/cliente/ReviewPanel.tsx`
- `components/admin/DisputeCard.tsx`, `components/admin/DocumentCard.tsx`, `components/admin/OccupationCard.tsx`, `components/admin/PaymentsAttention.tsx`, `components/admin/labels.ts`
- `components/pro/labels.ts`
- `services/admin.ts`, `services/bookings.ts`, `services/requests.ts`
- `supabase/migrations/20261019000004_marketplace.sql`, `…000005_bookings.sql`, `…000008_notifications.sql`, `…000011_admin.sql`
- `supabase/functions/payments-create/handler.ts`, `supabase/functions/charges-create/handler.ts`, `supabase/functions/asaas-webhook/handler.ts`, `supabase/functions/_shared/asaas-events.ts`

Documentos do plano (leitura interna, não são fonte primária):

- `docs/operacao/01-plano-de-45-dias-concierge.md` (§0, §3, §4, §5, §8, §9, §10, §11, §12)
- `docs/operacao/02-recrutamento-de-prestadores.md` (§8, §12, §13)
- `docs/operacao/03-aquisicao-de-clientes-e-bairros.md` (§0, §1, §4)
- `docs/operacao/05-templates-whatsapp.md` (§1, §6, §8, §11)
- `docs/operacao/06-manual-do-cuidado.md` (linhas sobre emergência)
- `docs/DECISOES.md` (D3, D4, seção 4)
- `docs/juridico/01-termos-de-uso.md` (cláusula 6.5, referência)
- `docs/juridico/04-politica-de-cancelamento-e-reembolso.md` (§2, §4, §5, §8, §9; rascunho)
- `docs/juridico/07-registro-das-operacoes-de-tratamento.md` (OP-23, Q32)
- `docs/juridico/08-plano-de-resposta-a-incidentes.md` (índice)
- `docs/juridico/10-sac-e-atendimento.md` (§4, §5, T1 a T3; rascunho)

---

## Apêndice: relação com outros documentos

| Documento | Relação com este O04 |
|---|---|
| O01, plano de 45 dias | Define as trilhas, a janela de atendimento, a rotina e os portões. Este O04 segue as trilhas e a rotina; a regra "3 a 5 prestadores" é corrigida pelo L16 |
| O02, recrutamento | Onboarding do prestador e checklist do revisor (§8.3). Este O04 cobre só o lado admin |
| O03, aquisição e concierge | Roteiros de cliente S1 a S13. Este O04 não repete esses textos |
| O05, modelos de WhatsApp | Avisos automáticos do app e regras de opt-in e de janela. Este O04 usa o número dedicado e modelos manuais |
| O06, Cuidado | Emergência e linha Cuidado. Não tratados aqui |
| O07, suporte, disputas e moderação | Existe (`07-suporte-disputas-e-moderacao.md`). Para estorno por situação, vale o O07, §6; esta SOP cita o O07 e não o repete. O caso C (pago, cancelado pela equipe) não aparece em "Exigem atenção" |
| O08, métricas e portões | Existe (`08-metricas-e-portoes.md`). Corrige o O01 no §2.3 e no §8.1 dele |
| juridico/04, cancelamento e reembolso | Rascunho. Estados e cancelamento usados aqui |
| juridico/10, SAC | Rascunho. Prazos de resposta e modelos T1 a T3 |
