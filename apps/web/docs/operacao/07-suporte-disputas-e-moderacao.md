# 07. Playbook de suporte, disputas e moderação

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| Item | Situação |
|---|---|
| Versão | Rascunho 1, redigido em 2026-11-08 |
| Quem opera | Uma pessoa (o dono), pelas telas `/admin` |
| Estado do produto | Protótipo. Não implantado, sem usuários reais. Asaas, WhatsApp e Resend não foram testados com serviços reais (documento 10, cabeçalho). |
| Documentos irmãos | 02 (Termos do Prestador, cláusula 17), 04 (Cancelamento, Reembolso e Garantia), 05 (Avaliações e Moderação), 08 (Incidentes), 10 (SAC). Se um deles mudar, este muda junto. |
| Fora do escopo | Garantia de execução do serviço (documento 04, seção 7). Incidente com dado pessoal além do escalonamento da seção 7 (documento 08). |

**Marcas usadas**

- `[PLANEJADO]`: não existe no produto hoje. Não prometa ao cliente.
- `[PROPOSTA]`: prazo ou regra de operação sugerida aqui, sem decisão do dono.
- `[DECISÃO DO DONO]`: depende de decisão do dono.
- `[CONDICIONAL: depende de parecer]`: só vale depois do parecer do advogado.
- `[incerto]`: não confirmado em fonte aberta nesta sessão.
- `†`: número de sugestão do documento 02, sem norma por trás. Não é prazo legal.

---

## 0. Antes de operar

- [ ] Criar a caixa compartilhada do SAC `[E-MAIL DO SAC]` (`[PLANEJADO]`, documento 10, seção 5.1).
- [ ] Cadastrar a conta de administrador na tabela `admins`. Só a service role escreve nela (ARQUITETURA, seção Administração).
- [ ] Criar a planilha de registro com as colunas da seção 5.3 do documento 10.
- [ ] Criar a pasta restrita para provas, comprovantes e dados bancários de estorno. Ela não fica na planilha.
- [ ] Levar ao advogado os itens da seção 16 marcados como bloqueantes.
- [ ] Decidir se o WorkEasy adere ao Consumidor.gov.br (`[DECISÃO DO DONO]`, documento 10, Q11).

---

## 1. O que as telas fazem hoje

Leia antes de qualquer procedimento. Onde o playbook pede algo que a tela não faz, a coluna da direita diz o que fazer no lugar.

| Tarefa | O que o produto faz hoje (2026-11-08) | O que fazer no lugar |
|---|---|---|
| Receber pedido de suporte | Não há caixa, rota `/sac` nem tabela de chamados. | Caixa do SAC `[PLANEJADO]` e planilha (seção 2). |
| Contestação do cliente | `/admin/disputas` lista os atendimentos em contestação. Duas decisões: liberar ou cancelar, com motivo obrigatório. | Seção 5. |
| Devolver dinheiro | Não há botão de estorno. `payments-void` só cancela cobrança `pending` no Asaas e não devolve nada. | Seção 6, por situação e forma de pagamento. |
| Cancelar atendimento pago | Nenhum dos dois lados cancela pelo app depois do pagamento (documento 04, seção 2.1). A administração tem `transition_booking` com motivo, mas não há tela fora de disputa. | Pelo SAC. Mudar o estado só pela função `transition_booking`, nunca por UPDATE direto: um trigger bloqueia isso (ARQUITETURA). |
| Moderar avaliação | Não há tela (documento 05, seção 6.3). Nenhuma ocorrência de `published` em `pages/admin/`, `components/admin/` e `services/admin.ts`. | Seção 8. |
| Suspender prestador | `/admin/prestadores/:id`, botão "Suspender", motivo obrigatório (`PrestadorDetalhe.tsx`). O app não avisa o prestador. | Seção 9. |
| Pedido de dados (LGPD) | `/admin/lgpd` é só leitura. Cópia e exclusão são feitas pelo próprio usuário em "Minha conta". | Seção 10. |
| Ver o que aconteceu | `/admin/auditoria` é só leitura, com filtro por entidade e por ator. Não tem exportação. | Seção 7.2 e a pendência G-9. |
| Não comparecimento | Não existe marcação (documento 04, seções 4.8 e 4.9). | Seção 13, com as árvores de decisão. |

**Nomes dos estados.** O banco usa um nome e a tela do cliente mostra outro (documento 04, seção 2):

| Banco (`booking_status`) | Tela | Banco (`booking_status`) | Tela |
|---|---|---|---|
| `requested` | Aguardando o profissional | `completed` | Concluído |
| `accepted` | Aceito | `released` | Liberado |
| `paid` | Pago | `disputed` | Em contestação |
| `in_progress` | Em andamento | `canceled` | Cancelado |

---

## 2. Canais de entrada

| Canal | Estado | Quem olha | Observação |
|---|---|---|---|
| E-mail do SAC, caixa compartilhada | `[PLANEJADO]` | Operador | Canal principal. Caixa pessoal não serve: o histórico ficaria preso a uma pessoa (documento 10, seção 5.1). |
| Página `/sac` com formulário | `[PLANEJADO]` | Operador | Mesmo fluxo do e-mail. |
| Contestação do atendimento no app | Existe (documento 04, seções 8.1 e 8.2) | `/admin/disputas` | Só com o atendimento em "Concluído", até 7 dias depois do fim do horário. |
| Excluir conta e copiar dados, no app | Existem, com backend | Sistema | Operador só confere quando há erro. |
| Ofício do Procon-SP | Chega por sistema, correio ou entrega pessoal (Portaria 247/2021, art. 18, §2º) | Operador, com o advogado | A contagem começa no envio. Registre a data do envio. |
| Consumidor.gov.br | `[PLANEJADO]`: adesão voluntária | Operador | Sem adesão, não existe reclamação registrada contra o WorkEasy. Não diga que a empresa participa. |
| Ordem judicial, notificação, pedido de imprensa | Não há canal | Operador, e o advogado no mesmo dia | Ver T12. |
| WhatsApp da operação (`VITE_CONCIERGE_WHATSAPP`) | Existe, não é SAC | Não usar como SAC sem decisão | Documento 10, Q2. |

**Rotina de todo dia útil (checklist)**

- [ ] Abrir a caixa do SAC e registrar cada mensagem na planilha no mesmo dia.
- [ ] Abrir `/admin/disputas`. Ver se há atendimento em contestação parado.
- [ ] Abrir `/admin/pagamentos` e ver a lista "Exigem atenção".
- [ ] Abrir `/admin/lgpd` e ver pedidos com situação "Não terminou" (`failed`).
- [ ] Ver a caixa de ofícios e notificações de órgãos.

---

## 3. Triagem: categorias e prioridades

As categorias T1 a T12 e as prioridades P1 a P3 são as do documento 10 (seções 4.2 e 6). Este playbook acrescenta o dono e a primeira ação.

| Código | Categoria | Prioridade | Primeira ação | Dono |
|---|---|---|---|---|
| T1 | Profissional não compareceu | P3; P2 se houver pagamento envolvido | Conferir o estado do atendimento (seção 13.2) | Operador |
| T2 | Divergência de preço | P2 (cobrança indevida) | Comparar proposta, serviço e pagamento | Operador |
| T3 | Pagamento não reconhecido | P2 | Conferir o pagamento (seção 13.1) | Operador |
| T4 | Reembolso ou desistência | P3 | Abrir a decisão (seção 6) | Operador, com advogado se houver serviço iniciado |
| T5 | Exclusão de conta | P3; P2 se houver dúvida | Verificar bloqueio por atendimento aberto (seção 10) | Operador |
| T6 | Cópia dos dados | P3 | Responder com a declaração (seção 10) | Operador |
| T7 | Contestação de avaliação | P3 | Seção 8 | Operador |
| T8 | Suspeita de fraude | P2; P1 se houver risco a alguém | Seção 7.1 | Operador |
| T9 | Assédio ou ameaça | P2; P1 se houver ameaça | Guardar provas e decidir o escalonamento | Operador |
| T10 | Incidente de segurança na casa | P1 | Número de emergência primeiro (seção 7.1) | Operador e advogado |
| T11 | Reclamação de conselho ou de publicidade regulada | P1 se for pedido de autoridade | Seção 11 | Operador e advogado |
| T12 | Ordem judicial, notificação ou imprensa | P1 para ordem e notificação; P3 para imprensa | Enviar ao advogado no dia do recebimento | Advogado |
| LGPD | Pedido de titular (cópia, exclusão, correção, revogação) | P3; P2 se houver dúvida sobre a exclusão | Seção 10 | Operador |

---

## 4. Prazos

| # | Prazo | Quando começa | Base | Estado |
|---|---|---|---|---|
| 1 | Resposta ao consumidor pelo SAC: **5 dias corridos** | Recebimento | Decreto 7.962/2013, art. 4º, parágrafo único, como citado nos documentos 04 (seção 9.2) e 10 (seção 4.1). Texto não aberto nesta sessão: o Planalto bloqueou o acesso. | `[PROPOSTA]` `[incerto]` |
| 2 | Demanda não urgente sob o Decreto 13.135/2026: 7 dias corridos | Recebimento | Documento 10, Q3, e documento 04, seção 9.3. Texto não encontrado nesta sessão. | `[incerto]`. Até o parecer, vale o prazo mais curto (5 dias). |
| 3 | Reclamação no Consumidor.gov.br: **10 dias corridos** | Registro da reclamação | Página "Conheça o Consumidor.gov.br" e Termo de Adesão, Cláusula Quarta, item 4 (abertos em 2026-11-08). | Só vale com adesão `[PLANEJADO]` |
| 4 | Resposta à CIP do Procon-SP: **10 dias corridos** | Envio (sistema, correio ou entrega pessoal) | Portaria Normativa Procon-SP 247/2021, art. 18, §2º (aberta). | Pode ser alterado por decisão fundamentada do Diretor da DAOC (art. 18, §3º). |
| 5 | Resposta ao Termo de Notificação ao Fornecedor (TNF) do Procon-SP: **10 dias corridos** | Envio da notificação de abertura de processo | Portaria 247/2021, art. 29 (aberta). | Conferir o ato recebido |
| 6 | Outros Procons e órgãos municipais | Conforme o ato | Não conferido. | `[incerto]`. Conferir o ato recebido. |
| 7 | Contestação do cliente | Fim do horário marcado | `transition_booking`, migração `20261019000005_bookings.sql`, linha 392 (código), e documento 04, seção 8.1 | Vale no sistema |
| 8 | Decisão da equipe sobre a contestação: **5 dias corridos** | Última prova recebida | Proposta deste playbook | `[PROPOSTA]` |
| 9 | Pedido de estorno ao Asaas: **até 5 dias úteis** | Decisão ou aviso de pagamento | Documento 04, seção 5.4 | `[PROPOSTA]` |
| 10 | Prazo para o valor aparecer ao cliente (cartão, Pix) | Pedido de estorno | Documento 04, seção 5.3, cita a documentação do Asaas. Não reaberta aqui. | `[incerto]` |
| 11 | LGPD, declaração completa: **15 dias corridos** | Pedido | LGPD, art. 19, II, como citado no documento 10 (seção 7). Planalto bloqueado; não reaberta. | `[incerto]` |
| 12 | Denúncia ou contestação de avaliação, análise interna: **2 dias úteis** | Recebimento | Documento 05, seção 6.7 | `[PROPOSTA]` |
| 13 | Prazo para contestar avaliação: **7 dias corridos** | Aviso da ocultação | Documento 05, seção 8.3 | `[DECISÃO DO DONO]` |
| 14 | Resposta à contestação de avaliação: **5 dias úteis** | Contestação | Documento 05, seção 8.4 | `[DECISÃO DO DONO]` |
| 15 | Prestador responde ao aviso de suspensão: **10 dias** | Aviso por escrito | Documento 02, cláusula 17.3 | `†` sem norma |
| 16 | Decisão por escrito após a resposta: **10 dias úteis** | Resposta do prestador | Documento 02, cláusula 17.3 | `†` sem norma |
| 17 | Aviso de suspensão cautelar: **até 2 dias úteis** | Suspensão | Documento 02, cláusula 17.4 | `†` sem norma |
| 18 | Resposta ao pedido de revisão de suspensão: **10 dias úteis** | Pedido de revisão | Documento 02, cláusula 17.5 | `†` sem norma |
| 19 | Guarda do histórico do SAC: mensagens por 90 dias; histórico por 6 meses | Encerramento | Documento 10, seção 5.3, cita o Decreto 13.135/2026, arts. 18 e 19 | `[CONDICIONAL: depende de parecer]` `[incerto]` |

**Dois avisos sobre prazos de órgão**

- O prazo de um órgão ou de uma plataforma vale como prazo de resposta, não como prazo de direito material. Quando o ato do órgão fixar outro prazo, vale o do ato.
- A Portaria Procon-SP 21/2005 está revogada pelo art. 55, I, da Portaria 247/2021. Seus prazos (120 dias para concluir a reclamação) e sua regra de confissão por silêncio não valem como orientação. Não os use.

---

## 5. Contestação do cliente (disputa)

### 5.1 Como um atendimento entra em contestação

- Só o cliente abre a contestação, e só com o atendimento em "Concluído" (`completed`), até 7 dias depois do fim do horário (`transition_booking`, linha 392). O profissional marca "Concluído" com `in_progress → completed`.
- A administração pode mudar o estado para qualquer valor, com motivo (`transition_booking`, ramo do admin). Por isso, a fila `/admin/disputas` mostra só o que o cliente abriu, e a administração não tem tela para outras mudanças (pendência G-8).

### 5.2 Passo a passo

1. Abrir o cartão em `/admin/disputas`. Conferir valor, origem ("Pela plataforma" ou "Cliente próprio do profissional"), situação dos pagamentos e a data de contestação.
2. Ler o histórico do atendimento. Ele mostra quem marcou "Concluído", quando, e o motivo escrito pelo cliente.
3. Pedir a prova de cada parte, por escrito, pelo SAC: fotos, comprovante, conversa. Prazo para a parte responder: 5 dias corridos `[PROPOSTA]`. O app não tem chat, e a conversa combinada fora do app não está no sistema (documento 10, T2).
4. Conferir o pagamento em `/admin/pagamentos`. Não abrir o payload bruto (`payments.raw`) sem necessidade: cada acesso gera `payment.raw_viewed` no audit_log.
5. Decidir até 5 dias corridos depois da última prova `[PROPOSTA]`. Escrever um motivo curto. O motivo vai para o histórico do atendimento e para o audit_log (`dispute.resolved`).
6. Anotar na planilha: decisão, motivo, valor e forma de pagamento.
7. Se a decisão envolve dinheiro, seguir a seção 6. A tela não move dinheiro: o texto fixo do cartão diz isso.

### 5.3 Regras

- A tela oferece duas decisões: "Liberar a favor do profissional" (vai a Liberado) e "Cancelar a favor do cliente" (vai a Cancelado). A função `admin_resolve_dispute` aceita qualquer estado de destino válido (pendência G-1). Use só as duas decisões.
- Contestação aberta bloqueia a exclusão da conta: `account-delete` responde 409 `active_bookings` para `disputed` (documento 10, T5).
- Contestação e desistência são pedidos diferentes. Contestação trata do serviço feito. Desistência trata de cancelar a contratação (documento 04, seção 8.7).
- Avaliação não é contestação de disputa. Ver seção 8.

---

## 6. Dinheiro: estornos por situação e forma de pagamento

### 6.1 Correção de premissa

`payments-void` **não devolve dinheiro**. Ele cancela no Asaas as cobranças `pending` de um atendimento que já está `canceled`, e marca `payments.status = 'canceled'` (`supabase/functions/payments-void/handler.ts`). A devolução de valor pago acontece de três jeitos: pelo webhook, quando o pagamento chega depois do cancelamento; pelo estorno manual no painel do Asaas; ou pelo SAC, para desistência. Nenhuma tela do admin chama estorno.

### 6.2 Tabela por situação

| Situação | Quem age | Pix | Cartão | Boleto |
|---|---|---|---|---|
| **A.** Cobrança aberta de atendimento cancelado | Automático (`payments-void`) | Cobrança cancelada no Asaas. Nenhum dinheiro saiu. | Igual ao Pix | Igual ao Pix |
| **B.** Pagamento recebido depois do cancelamento (`payment.received_after_cancel`) | Automático (webhook pede o estorno total) | Asaas aceita. Se recusar (saldo, rede): `payment.refund_failed`, que aparece em "Exigem atenção". | Igual ao Pix | O comentário em `asaas-client.ts` diz que a API só aceita estorno de cartão e Pix. Por isso, o boleto vai para `payment.refund_failed` e fica para o operador. |
| **C.** Pago, e o atendimento foi cancelado pela equipe (decisão de contestação a favor do cliente, ou desistência atendida) | Manual (operador) | Estorno no painel do Asaas `[incerto: procedimento não conferido]`. Depois, o webhook marca `refunded`. | Igual ao Pix. Prazo para a fatura do cliente: `[incerto]`. | Estorno precisa de dados bancários do cliente. O app não tem fluxo para isso (documento 04, seção 5.3, `[PLANEJADO]`). Procedimento manual `[incerto]`. |
| **D.** Liberado a favor do profissional | Ninguém | Sem devolução | Sem devolução | Sem devolução |
| **E.** Desistência (arrependimento) de atendimento pago | Manual, pelo SAC | Documento 04, seção 5.5: `[CONDICIONAL: depende de parecer]` | Igual ao Pix, e a comunicação ao emissor do cartão (Decreto 7.962/2013, art. 5º, §3º) `[CONDICIONAL: quem comunica, documento 10, Q5]` | Igual ao Pix, com dados bancários do cliente |

**Pontos da tabela que o operador precisa saber**

- O Asaas só aceita estorno de cartão e de Pix (`supabase/functions/_shared/asaas-client.ts`, linha 9, e ARQUITETURA, Webhook). O estorno Pix exige saldo na conta, senão responde erro 400 (documento 04, seção 5.3, `[incerto]`).
- Na situação C, **não existe alerta**. "Exigem atenção" lista só `payment.refund_failed` e `payment.received_after_cancel` (ARQUITETURA, seção Administração). O caso precisa ser controlado na planilha (pendência G-2).
- Quando o estorno manual chega ao webhook, o `PAYMENT_REFUNDED` marca o pagamento como `refunded`. Se o atendimento já está `canceled`, o webhook não muda o atendimento (`bookingTransition` devolve nulo para `canceled → canceled`, `supabase/functions/_shared/asaas-events.ts`, linhas 158 a 165). Isso é o esperado.

### 6.3 Checklist antes de qualquer estorno

- [ ] O atendimento está no estado certo, e o motivo está registrado (`booking_events`, `dispute.resolved` ou a transição do admin).
- [ ] O pagamento foi conferido em `/admin/pagamentos`: situação, forma, valor e data.
- [ ] A cobrança certa foi identificada pelo ID no painel do Asaas. Um atendimento tem no máximo uma cobrança `pending` por vez (ARQUITETURA, seção Pagamentos). Não use o payload.
- [ ] O estorno foi feito pela forma de pagamento da linha da tabela.
- [ ] Depois do estorno, `payments.status = refunded` apareceu no app. Se não apareceu, abrir item técnico (seção 16).
- [ ] Só então marcar "tratado" em "Exigem atenção", com um motivo que diga o que foi feito.
- [ ] Anotar data, valor e ID da cobrança na planilha.

### 6.4 Boleto: exceção registrada

O boleto não tem estorno pelo app. Trate cada caso como exceção registrada:

1. Na planilha, registrar: tipo "Exceção de estorno: boleto", ID da cobrança, valor, motivo da decisão, data do pedido e situação "aguardando dados bancários".
2. Pedir os dados bancários só pelo canal do SAC, uma vez, e só o necessário: titular, banco, agência, conta e tipo de conta `[PROPOSTA]`. Guardar na pasta restrita. Não colar na planilha.
3. Enquanto o estorno não foi feito, **não marcar como tratado**. A entrada fica em "Exigem atenção", e esse é o registro visível. (Quando a entrada não é de `payment.refund_failed` ou `payment.received_after_cancel`, o caso não aparece na tela: ver a situação C.)
4. Marcar como tratado só depois do estorno, ou quando a decisão final for não devolver, com o motivo escrito.
5. Pedido de estorno em até 5 dias úteis depois da decisão `[PROPOSTA]`.

### 6.5 Regras de "Exigem atenção" (`/admin/pagamentos`)

- A entrada some quando existe depois dela `payment.refunded_after_cancel` ou `payment.reviewed` do mesmo pagamento (ARQUITETURA).
- "Marcar como tratado" (`admin_review_payment`) **não devolve dinheiro**. Ele só registra o motivo. Use depois da ação, nunca no lugar dela.
- Se nada está aguardando, a função responde `invalid_transition`.

---

## 7. Fraude e segurança

### 7.1 Escalonamento

| Gatilho | Primeira ação | Quem | Prazo |
|---|---|---|---|
| Risco a uma pessoa (agressão, furto, risco durante atendimento ou plantão) | Ligar para o número de emergência. O documento 10 cita 192 (SAMU); não conferido nesta sessão `[incerto]`. Guardar provas. Registrar. | Operador | Na hora |
| Ameaça ou assédio com risco físico (T9) | Guardar provas (prints com data e hora). Avisar o advogado. | Operador | Mesmo dia útil |
| Suspeita de incidente com dado pessoal (conta invadida, vazamento, acesso indevido) | Abrir registro, conforme o documento 08, seção 6 (H0 e D0). Preservar evidências (seção 7.3). | Operador e advogado | Conforme o documento 08. Prazo legal de 3 dias úteis contado do conhecimento (documento 08, seção 6.1). |
| Conta de cliente ou de prestador comprometida (T8) | Limitar o recurso afetado. Não enviar código de acesso por nenhum canal. | Operador | Mesmo dia útil (P2) |
| Conta de administrador suspeita | Encerrar o acesso e revisar o audit_log do período. Procedimento de encerramento de sessão no Supabase Auth: `[incerto]`. Documento 08, cenário 9.2. | Operador | Na hora |
| Pagamento que parece forjado | Não agir sobre o pagamento. A releitura no Asaas recusa evento sem cobrança correspondente (ARQUITETURA, Webhook). Conferir se houve efeito em `payments`. | Operador | Mesmo dia útil |

### 7.2 Evidências no audit_log

Use o filtro de entidade e de ator em `/admin/auditoria`. O filtro de ator pede o identificador completo. Estes são os nomes de ação gravados hoje (conferidos nas migrações e funções):

| Ação (`action`) | Entidade | O que mostra |
|---|---|---|
| `dispute.resolved` | `booking` | Decisão de contestação, com o motivo |
| `payment.received_after_cancel` | `payments` | Pagamento recebido de atendimento já cancelado |
| `payment.refund_failed` | `payments` | Estorno recusado pelo Asaas (código `asaas_<status>`) |
| `payment.refunded_after_cancel` | `payments` | Estorno aceito |
| `payment.reviewed` | `payments` | Tratamento de pagamento, com motivo |
| `payment.void` e `payment.void_paid` | `payments` | Cobrança cancelada, ou paga durante a tentativa de cancelar |
| `payment.status` | `payments` | Mudança de situação vinda do webhook (ator vazio) |
| `payment.raw_viewed` | `payments` | Acesso do admin ao payload bruto, por `admin_get_payment_raw` |
| `payment_event.unverified`, `payment_event.failed` | conforme o registro | Evento não conferido no Asaas, ou erro de processamento |
| `provider.status` | `provider` | Aprovação e suspensão, com motivo |
| `occupation.approval` e `occupation.approval_revoked` | `provider_occupation` | Aprovação por ocupação, e revogação quando um documento deixa de ser aceito |
| `registry.status` | `provider_occupation` | Situação do registro profissional |
| `setting.changed` | `platform_setting` | Mudança de configuração |
| `user.anonymized` | `user` | Exclusão de conta (`anonymize_user`) |
| `client.*` | conforme o registro | Ações do cliente pelo app (o servidor só aceita esse prefixo para usuários do app) |

### 7.3 Preservação de evidências

Regras adaptadas do documento 08, seção 10:

1. Não apagar nem editar nada. O `audit_log` aceita só inserção, e ninguém pode apagá-lo.
2. Anotar data, hora e fuso de São Paulo, com UTC quando possível.
3. Antes de corrigir, registrar o estado atual: IDs, situações e contagens.
4. Não colar dado pessoal em chat, e-mail, planilha ou documento. Use IDs internos (`booking_id`, `payments.id`) e contagens.
5. Prints ou exportações com dado pessoal só na pasta restrita, com registro de quem acessou.
6. A tela de Auditoria não exporta (pendência G-9). Até existir exportação, o registro é leitura, anotada na planilha. Exportar por SQL exige chave de serviço, e não é tarefa de tela.

---

## 8. Moderação de avaliações

### 8.1 Motivos para ocultar (lista fechada, documento 05, seção 6.1)

- a) a avaliação viola a seção 4 do documento 05 (conteúdo);
- b) a avaliação é falsa, retaliatória, ou de atendimento sem pagamento pelo app (seção 7 do documento 05);
- c) há ordem judicial ou notificação de autoridade (seção 9 do documento 05);
- d) uma contestação foi aceita (seção 8 do documento 05).

Nota baixa não é motivo. Discordância do profissional também não é motivo.

### 8.2 Procedimento hoje (sem tela)

1. Receber a denúncia ou contestação pelo SAC. O app não tem botão de denúncia de avaliação (documento 10, T7 e lacuna L4).
2. Conferir a avaliação e o atendimento: nota, texto, `published`, situação `completed` ou `released`, e pagamento pelo app. A avaliação só existe se o atendimento foi pago pelo app (ARQUITETURA, Orçamentos e avaliações).
3. Decidir pelos motivos a) a d). Sinais de fraude estão na seção 7.1 do documento 05. Hoje nenhum sinal é calculado (documento 05, seção 7.3).
4. Ocultar: trocar `reviews.published` para falso, pela política `reviews_admin_update`, direto no banco (documento 05, seção 6.2). Não há tela nem registro de motivo (pendência G-5). Anote na planilha: motivo, data e quem fez.
5. Avisar o autor e o profissional com o motivo, o trecho da regra e o modo de contestar (macro M16). O aviso é manual, porque não há modelo de notificação para avaliação (documento 05, seção 8.1, `[PLANEJADO]`).
6. Contestação: pelo SAC, em `[DECISÃO DO DONO: proposta de 7 dias corridos do aviso]`. Resposta em `[DECISÃO DO DONO: proposta de 5 dias úteis]`.
7. Com uma pessoa só não há outro administrador para analisar a contestação. O documento 05, seção 8.4, prevê essa separação quando há mais de um administrador. A regra para um operador é `[DECISÃO DO DONO]`.
8. Restaurar: só o administrador, e só em ocupação com nota. Em ocupação sem nota a reativação não é possível (documento 05, seção 6.5).

### 8.3 Limite de ocupação sem ranking

Em ocupação sem ranking por nota, a avaliação fica sempre com `published = false` (ARQUITETURA, Orçamentos e avaliações). Ela nunca aparece publicamente, e não há o que ocultar nem restaurar. Em resposta a um cliente, diga que a avaliação não é publicada nessa profissão, e não que foi removida.

---

## 9. Suspensão de prestador, com aviso

### 9.1 Quando

Só nestas hipóteses (documento 02, cláusula 17.1): (a) fraude; (b) risco à segurança; (c) quebra grave ou repetida de regra, depois de aviso; (d) ordem de autoridade ou do conselho, ou perda do registro ou da licença que a ocupação exige; (e) pedido do próprio prestador.

**Não é motivo** (cláusula 17.2): nota baixa isolada, recusar pedidos, preço, atender também fora do app, ou usar outra plataforma.

### 9.2 Procedimento normal

1. Reunir os fatos com IDs, datas e provas. Não usar o payload do pagamento.
2. Enviar aviso por escrito ao e-mail cadastrado do prestador (macro M14a): fato, regra descumprida e prazo de `10 dias†` para responder.
3. Esperar o prazo. A resposta chega pela caixa do SAC. Registrar.
4. Decidir por escrito, com motivo, em até `10 dias úteis†` depois da resposta (ou do fim do prazo, sem resposta). Macro M15.
5. Se suspender: `/admin/prestadores/:id`, botão "Suspender prestador", confirmar com "Suspender" e motivo obrigatório. O audit_log grava `provider.status`.
6. Enviar a decisão por escrito. O app não avisa o prestador (cláusula 17.8).

### 9.3 Suspensão cautelar

Só em fraude evidente, risco imediato à segurança ou ordem de autoridade (cláusula 17.4):

1. Suspender na hora, pela mesma tela.
2. Avisar em até `2 dias úteis†`, com o motivo e o prazo de resposta de `10 dias†` (macro M14b).
3. Seguir o item 4 da seção 9.2.

### 9.4 Efeitos (cláusula 17.6)

| Efeito | Como está no produto | Observação |
|---|---|---|
| Sai da busca e da página pública | Sim. `search_providers` e `get_provider_page` só mostram aprovados (ARQUITETURA, Prestadores). | |
| Não recebe pedido novo | Sim. `open_requests_for_me` só lista aprovados. | |
| Atendimentos já combinados seguem | O texto da cláusula diz que seguem, e a função de transição não confere `providers.status`. Os atendimentos continuam. | Confirmar se é o desejado (pendência G-7). |
| Assinatura Pro continua cobrada | Sim, até o prestador cancelar (cláusula 17.6; `subscriptions-manage`). | Dizer ao prestador que ele pode cancelar. A devolução proporcional, se a suspensão for desfeita por erro, é `†` (pendência G-7). |
| Reativar | `admin_set_provider_status('approved')`. Reativar não aprova ocupação nova (ARQUITETURA, Prestadores). | |

### 9.5 Revisão e remoção

- Revisão: pedido pelo mesmo e-mail, com o que o prestador quiser juntar. Resposta por escrito em `10 dias úteis†` (cláusula 17.5). Quem analisa é a pessoa responsável, o operador.
- Remoção (cláusula 17.7): exclusão definitiva do cadastro. Não é ação de rotina. Só com parecer do advogado `[CONDICIONAL: depende de parecer]`.

---

## 10. Pedidos de titulares (LGPD)

### 10.1 Canais e estado

| Pedido | Pelo app | Pelo SAC (e-mail) | Prazo | Base |
|---|---|---|---|---|
| Cópia dos dados | `account-export`: JSON na hora. Grava `data_requests` com `completed` (`account-export/handler.ts`, linha 59). | Só depois de confirmar a identidade `[PLANEJADO]` | 15 dias corridos para a declaração completa `[incerto]` | LGPD, art. 19, II, citado no documento 10, §7 |
| Exclusão da conta | `account-delete`. Recusa com 409 `active_bookings` se houver atendimento `accepted`, `paid`, `in_progress` ou `disputed`. Cancela a assinatura Pro e as cobranças `pending` no Asaas, apaga os documentos, anonimiza. | Não excluir por e-mail sem identidade confirmada `[PLANEJADO]` | 15 dias corridos `[incerto]` | LGPD, art. 18, VI, e art. 16 `[incerto]`. Documento 03 e documento 10, §7. |
| Correção | "Minha conta": nome, telefone e cidade | Pelo SAC, para os outros dados | `[PROPOSTA]`. LGPD, art. 18, III, não conferido nesta sessão `[incerto]` | |
| Revogação de consentimento | Sem tela `[PLANEJADO]` | Pelo SAC | `[PROPOSTA]` | Documento 03 |

### 10.2 Procedimento

1. Registrar na planilha, com a categoria LGPD.
2. Identidade: pedido feito dentro do app dispensa confirmação extra. Pedido por e-mail precisa de confirmação pelo endereço cadastrado antes de qualquer envio ou alteração (documento 10, seção 7). Não alterar dados por e-mail.
3. Se a conta tem atendimento aceito, pago, em andamento ou em contestação, a exclusão fica bloqueada. Explicar e indicar o caminho: concluir ou cancelar antes (ou esperar a decisão da contestação). Macro T5.
4. Pedido de eliminação recusado por guarda fiscal ou de registro: a resposta diz o motivo e a base legal, e o encarregado revisa antes de enviar (documento 10, seção 7, item 5). Pedido que envolve dado de terceiro vai ao encarregado (documento 10, seção 5.4).
5. Pedido sobre assistido no módulo de cuidado: quem pede pode não ser o titular. Levar ao advogado (documento 10, Q12).
6. Responder com a declaração completa dentro do prazo. Macro T6.
7. Em `/admin/lgpd`, pedido "Não terminou" (`failed`) pede conferência no audit_log e contato com o usuário (texto da própria tela).

Pedido por e-mail não tem registro no sistema (documento 10, L7). A planilha é o único registro até existir caminho no produto.

---

## 11. Publicidade regulada e reclamações de conselho (T11)

1. Identificar a ocupação na política do catálogo: `occupation_policies.regulated` e `regulator_body`. Conferir também `rating_ranking`.
2. Exigir o pedido por escrito, com o conteúdo, o link e a infração apontada. Conferir se o órgão tem competência.
3. A matriz por conselho não está no repositório (Frente A). Qualquer regra de conselho é `[incerto]` até lá. Não afirmar regra de conselho em resposta.
4. O produto não oculta texto, foto ou preço de um perfil. Não há função de administrador para isso (documento 02, G13). As saídas são:
   - (a) pedir a correção ao profissional, por escrito, com prazo `[PROPOSTA]`;
   - (b) suspender, se houver ordem de autoridade ou do conselho (cláusula 17.1, d), e só com parecer `[CONDICIONAL: depende de parecer]`;
   - (c) nada, se não houver infração apontada.
5. Responder com T11. Não dizer que o WorkEasy tem aval de conselho profissional, nem que cumpre regra de conselho sem parecer.

---

## 12. Procon-SP e Consumidor.gov.br

### 12.1 Procon-SP (Portaria Normativa 247/2021, consolidada com a 099/2022)

- **Como chega:** por sistema, correio ou entrega pessoal (art. 18, §2º). A contagem começa no envio. Guarde o comprovante de envio.
- **Resposta à CIP (Carta de Informações Preliminares):** 10 dias corridos (art. 18, §2º). O Diretor da DAOC pode alterar o prazo por decisão fundamentada (art. 18, §3º).
- **Resposta ao TNF (Termo de Notificação ao Fornecedor):** 10 dias corridos a contar do envio da notificação de abertura de processo (art. 29).
- **Consumidor:** tem 10 dias corridos para informar se o problema foi resolvido (art. 19). Sem resposta, a CIP é encerrada (art. 19, §2º, resumo da página consolidada).
- **Ação:** registrar a data do envio; levar ao advogado no dia; responder dentro do prazo do ato. Modelo na macro M19.
- **Outros Procons e órgãos municipais:** não conferidos. `[incerto]`. Conferir o ato recebido.

### 12.2 Consumidor.gov.br (somente se aderir: `[PLANEJADO]`, `[DECISÃO DO DONO]`)

- A adesão é voluntária e exige aceite formal: "a participação de empresas é voluntária e só é permitida àquelas que aderem formalmente ao serviço" (página "Conheça o Consumidor.gov.br").
- Acompanhar as reclamações todos os dias e responder em até 10 dias, contados do registro (Termo de Adesão, Cláusula Quarta, item 4).
- Pedido de informação complementar **não suspende** o prazo (Cláusula Quarta, item 6).
- Depois da resposta, o consumidor tem até 20 dias para avaliar e marcar como resolvida ou não resolvida (página "Conheça").
- Motivos para recusar uma reclamação e prazo de 15 dias do órgão gestor: vieram de resultado de busca, não de texto aberto `[incerto]`.
- Enquanto não aderir, não diga que a empresa participa do Consumidor.gov.br (documento 10, seção 2.2, item 10).

---

## 13. Árvores de decisão

### 13.1 "O profissional diz que o cliente não pagou"

1. **Achar o pagamento.** Em `/admin/pagamentos`, o filtro só aceita situação, datas e o ID do pagamento. Não há busca por atendimento (pendência G-10). Use a data do atendimento e o atendimento curto mostrado na entrada.
2. **Há cobrança pelo app?**
   - **Não há nenhum pagamento.** O cliente nunca gerou a cobrança. Não há estorno. Pedir ao profissional o combinado. Se o atendimento foi iniciado sem pagamento, é a pendência G-3. Orientar o cliente a pagar pelo app.
   - **Cobrança `pending`.** O cliente ainda não pagou. Nada a devolver. Se o atendimento foi cancelado, `payments-void` já cancelou a cobrança. Macro T2 ou T3 conforme o caso.
   - **Cobrança `confirmed`, `received` ou `released`.** O Asaas confirmou o recebimento. A afirmação do profissional está errada, ou o app está atrasado. Conferir o ID no painel do Asaas. Se o Asaas mostra pago e o app não mostra pago, abrir item técnico (pendência G-3 e webhook). Não forçar mudança de estado sem essa conferência.
   - **Cobrança `refunded` ou `canceled`.** Conferir no painel do Asaas. Explicar o que aconteceu com o ID e a data.
3. **Responder** com a macro certa (T2 ou T3). Não confirmar nem negar pagamento antes da conferência.
4. **Registrar** na planilha: ID, situação, o que foi conferido e a resposta enviada.

### 13.2 "O cliente diz que o profissional não compareceu"

1. **Ler o estado e o histórico** do atendimento. Se estiver em contestação, o cartão de `/admin/disputas` mostra o histórico.
2. **Conforme o estado:**
   - **`requested` ou `accepted`, nunca iniciado.** Se não pago, o cliente cancela pelo app, sem multa (documento 04, seção 3.2). Se pago, não há botão: pedido pelo SAC, decisão da equipe e estorno manual (seção 6, situação C). A pendência G-8 se aplica.
   - **`paid` ou `in_progress`, sem conclusão.** O profissional precisa concluir para o cliente contestar. Sem marcação de não comparecimento (documento 04, seções 4.8 e 4.9). Pedir a versão de cada parte e decidir pelo SAC. A administração pode mudar o estado com motivo, mas sem tela (pendência G-8).
   - **`completed`.** O cliente pode contestar até 7 dias depois do fim do horário. Se ainda cabe, a contestação é do cliente. Se já passou, o caso vai pelo SAC. Quem marcou "Concluído", e quando, está no histórico (`booking_events.actor_id`).
   - **`disputed`.** Seção 5.
   - **Plantão de cuidado.** Os check-ins (com janela de ±2 h, documento 10, T1 e ARQUITETURA) são a prova principal. A única marcação de falta é `shift_status = no_show`. Conferir se a rotina de marcação existe antes de usá-la `[incerto]`.
3. **Responder** com T1.
4. **Registrar** na planilha, com o estado encontrado e a decisão.

---

## 14. Biblioteca de macros (pt-BR)

Como usar: substitua os colchetes. Os textos T1 a T12 são os do documento 10 (seção 6), com ajuste de processo. Os M13 a M20 são novos. Não cite lei na resposta ao cliente, a não ser que a macro peça. Não prometa resultado nem prazo que a equipe não controla. **Não use** selos nem afirmações de aval.

### T1. Profissional não compareceu

- **Usar quando:** o cliente diz que o profissional não foi ao horário.
- **Conferir antes:** estado do atendimento; check-in, no caso de plantão; pagamento.
- **Texto:**
  > Olá, [NOME]. Recebemos seu relato sobre o atendimento de [DATA], número [NÚMERO]. Vamos ouvir o profissional e analisar o caso. Respondemos com a decisão em até 5 dias corridos. Se você já pagou, envie o comprovante do pagamento nesta mesma resposta. `[CONDICIONAL: depende de parecer quanto à devolução neste caso, documento 04, seção 5.5]`
- **Não escreva:** que a devolução será feita antes da análise; que o profissional foi punido.

### T2. Divergência de preço

- **Usar quando:** o valor cobrado é diferente do combinado ou da proposta.
- **Conferir antes:** preço do serviço, valor da proposta aceita e valor cobrado. O que foi combinado fora do app não está no sistema: peça a conversa.
- **Texto:**
  > Olá, [NOME]. Recebemos sua dúvida sobre o valor do atendimento [NÚMERO]. No app, o valor da proposta aceita é R$ [VALOR DA PROPOSTA] e o valor cobrado foi R$ [VALOR COBRADO]. Vamos conferir com o profissional o que foi combinado e responder em até 5 dias corridos. Se houver cobrança errada, tratamos como indicado nos Termos de Uso, item 6.7.
- **Não escreva:** que o preço é fixo; que o profissional não pode cobrar mais.

### T3. Pagamento não reconhecido

- **Usar quando:** o cliente diz que pagou, mas o app mostra cobrança em aberto ou cancelada.
- **Conferir antes:** situação e ID do pagamento, no painel do Asaas. Não use o payload.
- **Texto:**
  > Olá, [NOME]. Estamos conferindo o pagamento do atendimento [NÚMERO]. Hoje, no app, o status é [STATUS]. Para localizar o pagamento, precisamos de [comprovante, identificador da transação Pix ou o e-mail usado no pagamento]. Não precisamos do número do seu cartão, da senha do banco nem de códigos de acesso, e você não deve enviá-los por e-mail ou WhatsApp.
- **Não escreva:** que o pagamento está garantido; que o dinheiro já voltou antes de conferir.

### T4. Pedido de reembolso ou de desistência

- **Usar quando:** o cliente quer cancelar depois de pagar, ou desistir da contratação.
- **Conferir antes:** data da contratação e data do serviço; forma de pagamento; se o atendimento já foi cancelado (seção 6).
- **Texto:**
  > Olá, [NOME]. Recebemos seu pedido de [cancelamento / desistência / reembolso] do atendimento [NÚMERO], feito em [DATA]. Vamos analisar o pedido e responder em até 5 dias corridos. Se o pedido for aceito, a devolução segue a Política de Cancelamento, Reembolso e Garantia. `[CONDICIONAL: depende de parecer quanto a serviço já iniciado ou executado.]` Se a cobrança foi no cartão, comunicamos seu pedido à administradora, como exige o Decreto 7.962/2013, art. 5º, §3º `[CONDICIONAL: quem comunica, documento 10, Q5]`. Se foi boleto, pediremos seus dados bancários para a devolução.
- **Não escreva:** prazos de devolução em dias ou horas que o Asaas não informou.

### T5. Exclusão de conta

- **Usar quando:** o usuário pede a exclusão pelo e-mail.
- **Conferir antes:** atendimentos aceitos, pagos, em andamento ou em contestação (bloqueiam a exclusão); assinatura Pro; cobranças abertas.
- **Texto:**
  > Olá, [NOME]. Você pode excluir sua conta sozinho: em "Minha conta", na opção "Excluir minha conta", digite EXCLUIR para confirmar. Antes disso, a conta precisa estar sem atendimento aceito, pago, em andamento ou em contestação. Ao excluir, apagamos ou anonimizamos seus dados pessoais. Pagamentos e atendimentos continuam guardados, sem identificar você, `[incerto: base legal e prazo de guarda a confirmar]`. Se você não consegue entrar na conta, responda este e-mail. Antes de fazer qualquer alteração, vamos confirmar a sua identidade `[PLANEJADO: processo de confirmação]`.
- **Não escreva:** que tudo foi excluído (pagamentos ficam); que a lei fiscal exige 5 anos (prazo não conferido).

### T6. Cópia dos dados

- **Usar quando:** o titular pede uma cópia dos seus dados.
- **Conferir antes:** a cópia sai em "Minha conta", em JSON. Pedido por e-mail: confirmar a identidade antes de enviar.
- **Texto:**
  > Olá, [NOME]. Você pode baixar uma cópia dos seus dados em "Minha conta", na seção de cópia dos dados. O arquivo sai em JSON, no formato do WorkEasy. Se não consegue entrar na conta, responda este e-mail e confirmaremos a sua identidade antes de enviar qualquer dado. Responderemos em até 15 dias corridos, pela declaração completa prevista na LGPD `[incerto: art. 19, II, não reaberto]`.
- **Não escreva:** que o envio sai em 24 horas; que o JSON é o formato padrão da LGPD.

### T7. Contestação de avaliação

- **Usar quando:** o profissional ou o cliente quer contestar uma avaliação.
- **Conferir antes:** a avaliação (nota, texto, publicada ou não). Seção 8.
- **Texto:**
  > Olá, [NOME]. Recebemos sua contestação da avaliação do atendimento [NÚMERO]. Vamos analisá-la com base na Política de Avaliações e Moderação e nas provas que você enviou. Não editamos o texto de quem avaliou. Se a avaliação violar as regras ou a lei, a equipe pode ocultá-la, e quem a escreveu não consegue publicá-la de novo. Respondemos em até 5 dias corridos. `[DECISÃO DO DONO: prazo]`
- **Não escreva:** que a avaliação será removida antes da análise; selo de verificação.

### T8. Suspeita de fraude

- **Usar quando:** alguém relata golpe, conta invadida, ou o sistema sinaliza atividade estranha.
- **Conferir antes:** eventos do atendimento e audit_log (seção 7.2). Não revele os critérios de análise.
- **Texto para a conta afetada:**
  > Olá, [NOME]. Recebemos um aviso de atividade suspeita na sua conta. Por segurança, limitamos [o recurso] enquanto analisamos. Não enviaremos seu código de acesso por nenhum canal. Para recuperar o acesso, responda este e-mail pelo endereço cadastrado. A suspensão e o bloqueio seguem os Termos de Uso, item 3.6.
- **Texto para quem denunciou:**
  > Olá, [NOME]. Recebemos sua denúncia sobre [PERFIL OU ATENDIMENTO]. Analisamos o caso. Se houver violação dos Termos, tomamos a medida prevista neles. Não compartilhamos dados de terceiros nesta resposta.
- **Não escreva:** que a conta foi invadida sem prova; que é golpe antes da análise.

### T9. Assédio ou ameaça

- **Usar quando:** alguém relata ofensa, ameaça ou perseguição, dentro ou fora do app.
- **Conferir antes:** conteúdo dentro do app. Conversa fora do app não fica no sistema: peça as provas. Se houver risco imediato, use T10.
- **Texto:**
  > Olá, [NOME]. Lamentamos o que você passou. Pedimos que guarde as provas: prints com data e hora, nome do perfil e número do atendimento. Vamos analisar a conduta com base nos Termos de Uso, item 10, e podemos suspender a conta envolvida. Se houver ameaça, você pode registrar boletim de ocorrência. Só entregamos registros de conta a uma autoridade quando a lei ou uma ordem judicial exigir. `[CONDICIONAL: depende de parecer sobre a identificação do autor, documento 10, Q9.]`
- **Não escreva:** que vamos identificar quem fez isso; que a pessoa será banida antes da análise.

### T10. Incidente de segurança na casa

- **Usar quando:** acidente, agressão, furto, risco ou ocorrência durante um atendimento ou plantão em domicílio.
- **Primeira resposta, sempre:** se alguém precisa de socorro, ligue para o número de emergência da sua região (no documento 10, 192, `[incerto: não conferido]`). Em caso de crime, a polícia (`190`, `[incerto: não conferido]`).
- **Texto:**
  > Olá, [NOME]. Sentimos muito pelo que aconteceu. Se alguém está em risco, ligue para o número de emergência da sua região. Guarde as provas: mensagens, fotos, nome do profissional e horário. Registramos o caso. [Se aplicável: suspendemos o profissional enquanto apuramos.] Vamos responder em até 5 dias corridos. Este canal não substitui atendimento médico nem policial. `[CONDICIONAL: a cobertura de seguro depende de decisão do dono e de parecer. Não diga que há cobertura.]`
- **Não escreva:** qualquer selo ou afirmação sobre a qualidade do profissional; que há cobertura de seguro; nenhum dado de saúde ou diagnóstico.

### T11. Reclamação de conselho profissional ou de publicidade regulada

- **Usar quando:** um conselho, um órgão de defesa ou o próprio profissional questiona um anúncio, um perfil ou a oferta de uma ocupação regulada.
- **Conferir antes:** seção 11.
- **Texto:**
  > Olá, [NOME DO ÓRGÃO]. Recebemos sua comunicação sobre [PERFIL OU ANÚNCIO] [link]. Pedimos que a comunicação seja por escrito e indique o conteúdo e a infração apontada. Analisamos o pedido. Se ele identificar a infração, podemos ocultar o conteúdo, e avisamos o profissional com o motivo. Respondemos em até 5 dias corridos ou no prazo fixado pelo órgão. `[CONDICIONAL: depende de parecer por conselho.]`
- **Não escreva:** que o WorkEasy é aprovado ou tem aval de um conselho.

### T12. Imprensa, ordem judicial ou notificação extrajudicial

- **Usar quando:** chega uma ordem de juiz, uma notificação de advogado de outra parte, ou um pedido de jornalista.
- **Conferir antes:** órgão, número do processo, data, prazo e a identificação clara do conteúdo. Encaminhe ao advogado no dia do recebimento `[PROPOSTA]`. Não responda sobre o mérito sem ele.
- **Texto, ordem judicial:**
  > Recebemos a ordem do [ÓRGÃO], processo [NÚMERO], de [DATA], com prazo de [PRAZO]. Encaminhamos ao nosso advogado, que responderá no prazo. Se a ordem não identificar com clareza o conteúdo, pedimos que ela seja complementada.
- **Texto, notificação extrajudicial:**
  > Recebemos sua notificação. Ela foi encaminhada à nossa equipe jurídica, que responderá pelos canais indicados. Este recebimento não implica reconhecimento de nenhum fato. `[CONDICIONAL: depende de parecer.]`
- **Texto, imprensa:**
  > Obrigado pelo contato. O WorkEasy não comenta casos individuais. Para perguntas institucionais, use [CANAL DE IMPRENSA, decisão do dono].
- **Não escreva:** dados pessoais de quem pediu ou de quem é citado; especulação sobre o caso.

### M13. Confirmação de recebimento (qualquer demanda)

- **Usar quando:** toda mensagem nova do SAC, no mesmo dia útil.
- **Texto:**
  > Olá, [NOME]. Recebemos sua mensagem sobre [ASSUNTO], registrada sob o número [NÚMERO], em [DATA]. Respondemos em até 5 dias corridos. Se precisarmos de mais informação, pediremos por esta mesma conversa.

### M14a. Aviso prévio de suspensão (cláusula 17.3)

- **Usar quando:** antes de suspender, nos casos da cláusula 17.1 (exceto cautelar).
- **Antes de usar:** os prazos de 10 dias são sugestão do documento 02 (†), sem norma. O advogado confirma.
- **Texto:**
  > Olá, [NOME]. Vamos suspender seu cadastro no WorkEasy porque [REGRA DESCUMPRIDA: Termos do Prestador, cláusula 17.1, alínea [X]]. Fatos: [FATOS COM DATAS E NÚMEROS DE ATENDIMENTO]. Você pode responder em até [10 dias] a contar do recebimento deste aviso, com o que quiser juntar, respondendo a este e-mail. Depois da sua resposta, decidiremos por escrito, com o motivo, em até [10 dias úteis].

### M14b. Aviso de suspensão cautelar (cláusula 17.4)

- **Usar quando:** a suspensão já foi feita, por fraude evidente, risco imediato à segurança ou ordem de autoridade. Enviar em até 2 dias úteis.
- **Texto:**
  > Olá, [NOME]. Suspendemos seu cadastro no WorkEasy em [DATA], por [MOTIVO: fraude evidente / risco imediato à segurança / ordem de autoridade], porque [FATO]. Você pode responder em até [10 dias] com o que quiser juntar, respondendo a este e-mail. Esta suspensão será decidida por escrito, com o motivo, depois da sua resposta.

### M15. Decisão por escrito (suspensão ou revisão)

- **Usar quando:** ao fim da análise da resposta, ou do pedido de revisão.
- **Texto:**
  > Olá, [NOME]. Analisamos sua resposta de [DATA]. Decidimos [manter a suspensão / reativar o cadastro], porque [MOTIVO EM 1 A 3 FRASES]. [Se mantida: Você pode pedir revisão respondendo a este e-mail, com documentos novos. Respondemos por escrito em até 10 dias úteis.]
- **Não escreva:** que o cadastro "foi aprovado de novo" quando só a suspensão acabou: reativar não aprova ocupação nova (seção 9.4).

### M16. Aviso de avaliação ocultada (documento 05, seção 8.1)

- **Usar quando:** logo depois de ocultar uma avaliação, pelos motivos a), b) ou d).
- **Texto:**
  > Olá, [NOME]. Ocultamos a avaliação do atendimento [NÚMERO], de [DATA], porque [MOTIVO EM TEXTO CURTO, com a letra a), b) ou d) da Política de Avaliações e Moderação]. Você pode contestar respondendo a este e-mail, em até [7 dias corridos, DECISÃO DO DONO], explicando o motivo e enviando provas. Respondemos por escrito em até [5 dias úteis, DECISÃO DO DONO].

### M17. Pedido de dados bancários para estorno de boleto

- **Usar quando:** estorno de boleto, situação C ou E da seção 6.2.
- **Antes de usar:** o fluxo de estorno de boleto não existe no app (`[PLANEJADO]`). Confirmar o procedimento com o advogado e com a documentação do Asaas `[incerto]`.
- **Texto:**
  > Olá, [NOME]. A devolução do atendimento [NÚMERO] será feita por transferência, porque o pagamento foi por boleto. Para isso, precisamos apenas de: titular, banco, agência, conta e tipo de conta. Envie esses dados por esta mesma conversa, somente estes. Não pedimos senha, código de acesso nem número de cartão.

### M18. Estorno aceito (Pix ou cartão)

- **Usar quando:** o estorno foi pedido ao Asaas, situação B ou C da seção 6.2.
- **Texto:**
  > Olá, [NOME]. Aceitamos seu pedido de [desistência / cancelamento] do atendimento [NÚMERO]. Pedimos a devolução de R$ [VALOR] pela mesma forma de pagamento, em [DATA]. O banco ou a operadora do cartão informa o prazo para o valor aparecer `[PRAZO: não conferido, seção 4, item 10]`.

### M19. Resposta ao Procon-SP (CIP ou TNF)

- **Usar quando:** houver ofício do Procon-SP. Conferir o ato, o prazo e a forma de envio.
- **Texto:**
  > Recebemos a [Carta de Informações Preliminares / notificação] [NÚMERO], enviada em [DATA] por [SISTEMA / CORREIO / ENTREGA PESSOAL]. Nossa resposta segue neste ato, dentro do prazo de [10 dias corridos, a contar do envio]. [CORPO DA RESPOSTA, após parecer do advogado.]

### M20. Decisão de contestação (a favor de cada lado)

- **Usar quando:** a decisão de `/admin/disputas` foi registrada.
- **Texto:**
  > Olá, [NOME]. Encerramos a contestação do atendimento [NÚMERO] [a favor do profissional: o atendimento foi marcado como liberado / a favor do cliente: o atendimento foi cancelado], pelo motivo: [MOTIVO]. A decisão registra a situação do atendimento. Ela não devolve nem repassa valores pelo app. `[CLIENTE, se houver estorno: O pedido de devolução de R$ [VALOR] foi feito em [DATA], pela mesma forma de pagamento.]`

---

## 15. Relatório mensal

Preencher no dia 5 do mês seguinte. Fontes: a planilha (seção 2 e documento 10, seção 5.3), as telas `/admin` e as métricas da visão `admin_metrics`.

```markdown
# Relatório de atendimento: [MÊS/ANO]

## 1. Volume por categoria
| Categoria | Recebidas | Respondidas no prazo | Fora do prazo | Em aberto |
|---|---|---|---|---|
| T1 a T12 e LGPD | | | | |

## 2. Contestações de atendimento
- Abertas no mês: [ ]; decididas: [ ]; a favor do profissional: [ ]; a favor do cliente: [ ]
- Prazo médio de decisão, em dias corridos: [ ]

## 3. Dinheiro
- Estornos pedidos: [ ] (Pix [ ], cartão [ ], boleto [ ]); concluídos: [ ]; recusados (`refund_failed`): [ ]
- Exceções de boleto abertas: [ ]
- Atendimentos cancelados pela equipe com pagamento (controle manual, situação C): [ ]
- "Exigem atenção" no fim do mês: [ ]

## 4. Pedidos de titulares (LGPD)
- Cópias: [ ]; exclusões: [ ]; recusas por guarda fiscal: [ ]
- Prazo médio de resposta, em dias corridos: [ ]

## 5. Avaliações
- Ocultadas: [ ] (a: [ ], b: [ ], c: [ ], d: [ ]); contestações: [ ]; restauradas: [ ]

## 6. Prestadores
- Suspensões cautelares: [ ]; suspensões com aviso prévio: [ ]
- Pedidos de revisão: [ ]; reativações: [ ]

## 7. Órgãos e autoridades
- Procon-SP: [ ] recebidos; respondidos no prazo: [ ]
- Consumidor.gov.br: [ ] (somente se houver adesão)
- Ordens judiciais e notificações: [ ]

## 8. Métricas da plataforma (`admin_metrics`, mês)
- Atendimentos por situação: [ ]
- Pagamentos por situação: [ ]
- Prestadores por situação: [ ]

## 9. Pendências e decisões
- [ ]
```

---

## 16. Lacunas do produto e pendências

Não corrigidas aqui. Cada item diz onde está e o que o dono ou o advogado decide.

| # | Lacuna | Onde | Efeito no playbook |
|---|---|---|---|
| G-1 | `admin_resolve_dispute` aceita qualquer estado de destino válido. A tela oferece só liberar ou cancelar. | `supabase/migrations/20261019000011_admin.sql`, linhas 326 a 346 | Risco de decisão fora do fluxo. Recomendação: restringir a `released` e `canceled`. |
| G-2 | Cancelamento pela equipe de atendimento pago não gera estorno nem alerta. "Exigem atenção" lista só `refund_failed` e `received_after_cancel`. | `admin_payments_attention`, ARQUITETURA | Situação C fica só na planilha. |
| G-3 | O prestador pode mudar `accepted → in_progress` sem pagamento. | `private.booking_transition_allowed`, migração 05 | Árvore 13.1 (cobrança ausente). Pergunta de produto: pagamento deve ser pré-requisito para iniciar? |
| G-4 | Sem marcação de não comparecimento para atendimento (só `no_show` em plantão). | Documento 04, seções 4.8 e 4.9; documento 10, L6 | Árvore 13.2. Decisão só pelo SAC. |
| G-5 | Sem tela de moderação de avaliações. Ocultar não grava motivo, autor nem data, e não entra no audit_log. | Documento 05, seções 6.3 e 6.6 | Seção 8 é manual. |
| G-6 | Sem aviso ao prestador de suspensão, e sem aviso ao autor de avaliação oculta. Nenhum modelo de notificação para isso. | ARQUITETURA (Notificações), documento 02, G2 | Avisos são manuais (M14 a M16). |
| G-7 | Suspensão não bloqueia transições de atendimentos existentes (`transition_booking` não confere `providers.status`), e não pausa a cobrança do Pro. | `transition_booking`, migração 05; documento 02, cláusula 17.6 e G6 | Confirmar se é o desejado. Ver seção 9.4. |
| G-8 | Não há tela para mudar o estado de atendimento fora de disputa. | `transition_booking` só por função; `pages/admin/` | Cancelar atendimento pago ou aceito sem cobrança não tem caminho pela tela. |
| G-9 | `/admin/auditoria` não tem exportação. O documento 08, seção 10.2, diz "exportação em /admin/auditoria". | `pages/admin/Auditoria.tsx`; documento 08 | Inconsistência entre documentos. A evidência é por leitura. |
| G-10 | `/admin/pagamentos` não busca por atendimento. Filtro só por ID do pagamento, situação e datas. | `pages/admin/Pagamentos.tsx` | Árvore 13.1, passo 1. |
| G-11 | Estorno de boleto sem fluxo no app. Procedimento manual no painel do Asaas não conferido. | Documento 04, seção 5.3 (`[PLANEJADO]`) | Seção 6.4 e M17. |
| G-12 | Pedido de dados fora do app não tem registro. `account-export` grava `completed` na hora, então `pending` não é usado nesse fluxo. | Documento 10, L7; `account-export/handler.ts`, linha 59 | Seção 10 usa a planilha. |
| G-13 | Não existe rota `/sac`, caixa de atendimento nem tabela de chamados. | Documento 10, L2 | Toda a triagem é manual. |
| G-14 | Não há botão de denúncia de avaliação nem de perfil. | Documento 10, L4 | Denúncia só pelo SAC. |
| G-15 | Não há cancelamento de atendimento pago pelo app. | Documento 04, seção 2.1; documento 10, L5 | Seção 6, situação E. |
| G-16 | Uma só conta de administrador. A separação de quem oculta e quem analisa não existe. | Documento 05, seção 8.4 | `[DECISÃO DO DONO]`. |
| G-17 | Os documentos 01 e 02 citam o Decreto 11.034/2022, revogado pelo Decreto 13.135/2026, art. 24, conforme o documento 10, L11. | Documentos 01 e 02 | Referência a corrigir no texto para publicar. Não corrigido aqui. |
| G-18 | Texto dos decretos 7.962/2013 e 13.135/2026 e das leis LGPD e CDC não foi aberto. O Planalto bloqueou o acesso e a Câmara não trouxe o texto. | Seção 17 | Todas as referências a esses textos ficam `[incerto]` até conferência no DOU ou no Planalto. |

**Bloqueantes para operar (levar ao advogado)**

1. Escopo do Decreto 7.962/2013 e do Decreto 13.135/2026 (documento 10, Q1 e Q2). Define o prazo de 5 dias e o horário do SAC.
2. Cancelamento de atendimento pago: pelo SAC ou pelo app (documento 10, Q4).
3. Quem comunica o arrependimento ao emissor do cartão (documento 10, Q5).
4. Base legal da retenção de registros financeiros e do SAC (documento 10, Q13).
5. Procedimento de suspensão e de prazo de resposta do prestador (documento 02, cláusula 17, itens com †).

---

## 17. Fontes consultadas

### 17.1 Externas (abertas em 2026-11-08)

| Fonte | URL | O que foi lido | Uso |
|---|---|---|---|
| Consumidor.gov.br, Termo de Adesão | https://www.consumidor.gov.br/pages/principal/termo-adesao-compromisso | Cláusula Quarta, itens 4 e 6; Cláusula Sexta, parágrafo único; Cláusula Oitava | Prazo de 10 dias, acompanhamento diário, informação complementar não suspende o prazo, e órgão gestor. Não tem data no texto. |
| Consumidor.gov.br, "Conheça o Consumidor.gov.br" | https://www.consumidor.gov.br/pages/conteudo/publico/1 | Prazos de resposta e de avaliação; contagem a partir do registro; adesão voluntária | Seções 4 e 12.2 |
| Procon-SP, Portaria Normativa 247/2021 (consolidada com a 099/2022) | https://www.procon.sp.gov.br/portaria-normativa-247-2021/ | Arts. 18, §§2º e 3º; 19 e §2º; 29; 55. Postada em 11/11/2021. | Seção 4, itens 4 e 5; seção 12.1 |
| Cópia do texto da Portaria 247/2021 (não oficial, usada para cruzar) | https://www.normasbrasil.com.br/norma/portaria-normativa-247-2021-sp_422759.html | Arts. 18, 29 e 55; vigência; publicação no DOE em 11/11/2021 segundo o cabeçalho | Conferência. Confirmar no DOE antes de citar. |
| Procon-SP, Portaria Normativa 21/2005 (revogada) | https://www.procon.sp.gov.br/?p=20342 | Só a data e o status de revogação, pelo art. 55, I, da 247/2021 | Não usada como norma em vigor. |
| Procon-SP, Espaço Consumidor | https://www.procon.sp.gov.br/espaco-consumidor/ | Aberta, mas o texto veio truncado | Nenhum número usado. |

**Tentativas bloqueadas ou sem texto (não lidas)**

- Planalto, Decreto 7.962/2013: "Acesso Negado". Não lido.
- Planalto, Lei 13.709/2018 (LGPD): "Acesso Negado". Não lido.
- Planalto, Lei 8.078/1990 (CDC): "Acesso Negado". Não lido.
- Câmara dos Deputados, Decreto 13.135/2026: página de busca, sem o texto do decreto. Não lido.
- Resultados de busca sobre o Consumidor.gov.br (motivos de recusa e prazo de 15 dias do órgão gestor): só resumo, não aberto. `[incerto]`.

### 17.2 Repositório (lidos)

| Arquivo | Partes lidas |
|---|---|
| `apps/web/docs/ARQUITETURA.md` | Integral, linhas 1 a 865 (Banco, Pagamentos, Administração, Webhook, Cobranças, Frontend) |
| `apps/web/docs/DECISOES.md` | Integral |
| `apps/web/docs/juridico/01-termos-de-uso.md` | Cláusulas 3.6, 6.7 e 10.2, por busca |
| `apps/web/docs/juridico/02-termos-do-prestador.md` | Cláusula 17, tabela de prazos com †, legenda, e os itens G2, G6 e G13 |
| `apps/web/docs/juridico/04-politica-de-cancelamento-e-reembolso.md` | Seções 2 a 9 |
| `apps/web/docs/juridico/05-politica-de-avaliacoes-e-moderacao.md` | Seções 6, 7, 8, 9 e 13 |
| `apps/web/docs/juridico/08-plano-de-resposta-a-incidentes.md` | Seções 4, 6 e 10 |
| `apps/web/docs/juridico/10-sac-e-atendimento.md` | Integral, linhas 1 a 414 |
| `apps/web/pages/admin/Disputas.tsx`, `Pagamentos.tsx`, `Auditoria.tsx`, `Lgpd.tsx`, `routes.tsx` | Integral |
| `apps/web/pages/admin/PrestadorDetalhe.tsx` | Trecho de suspensão e reativação, linhas 95 a 124 |
| `apps/web/components/admin/DisputeCard.tsx` | Integral |
| `apps/web/services/admin.ts` | Busca de funções de disputa, pagamento e auditoria |
| `supabase/migrations/20261019000005_bookings.sql` | `transition_booking` e `booking_transition_allowed` (linhas 198 a 216 e 357 a 417) |
| `supabase/migrations/20261019000011_admin.sql` | `admin_resolve_dispute`, `admin_review_payment`, `admin_open_disputes` (linhas 326 a 449) |
| `supabase/functions/asaas-webhook/handler.ts` | Trecho de reembolso, linhas 260 a 300 |
| `supabase/functions/_shared/asaas-events.ts` | `bookingTransition`, linhas 158 a 165 |
| `supabase/functions/_shared/asaas-client.ts` | Comentário do estorno, linha 9 e linhas 212 a 218 |
| `supabase/functions/payments-void/handler.ts` | Cabeçalho |
| `supabase/functions/account-export/handler.ts` | Linha 59 (grava `completed`) |

---

## Anexo: campos da planilha de registro

Os mesmos do documento 10, seção 5.3: ID, recebido em, canal, categoria, prioridade, atendimento (ID), prazo de resposta, situação, decisão e motivo, respondido em, encaminhado a, e provas (link para a pasta restrita). Não copie CPF, número de cartão, senha ou código de acesso. Não cole anexos na planilha.
