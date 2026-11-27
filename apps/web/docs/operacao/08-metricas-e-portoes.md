# Métricas, portões e consultas (O08)

Documento O08 · métricas do concierge de 08/11 e protocolo de mobilidade proposto em 27/11/2026. As consultas do concierge ficam em [kpis.sql](kpis.sql).

> **Rascunho para revisão de advogado. Não é parecer jurídico.** Este é um documento operacional. Onde ele toca a regra de comissão, de pagamento retido ou de profissão regulamentada, o trecho vem marcado `[CONDICIONAL: depende de parecer]` e remete a `docs/DECISOES.md`.
>
> **Base em 27/11/2026.** O backend de produção foi implantado em 25/11 e a prerelease v0.1.1 acessou seu catálogo público. A publicação HTTPS e o teste de login têm pendências. Os registros consultados não trazem resultados de um piloto de viagens reais nem comprovam ativação de comissão ou pagamento retido. [Entrega O14](14-entrega-multiplataforma.md) · [Prerelease v0.1.1](https://github.com/drguilhermecapel/Work-Easy/releases/tag/v0.1.1) · [Decisões](../DECISOES.md)
>
> **Nenhum número deste documento é resultado.** Os limiares são do plano (O01) ou propostas minhas, marcadas `[proposta]`. A conferência local documentada em novembro usou dados sintéticos (seção 7). O experimento da seção 9 requer observações reais.

| Marca | Significa |
|---|---|
| `[PLANEJADO]` | não existe no produto hoje |
| `[CONDICIONAL: depende de parecer]` | só vale depois de resposta de advogado, contador ou conselho |
| `[estimativa]` | cálculo ou juízo meu, com a premissa ao lado |
| `[incerto]` | não consegui confirmar, ou o dado pode estar desatualizado |
| `[proposta]` | regra que eu sugiro; não vem do plano nem de `docs/DECISOES.md` |

**Como este documento se relaciona com o O01.** O O01 (plano de 45 dias) manda: "se uma definição aqui divergir do O08, vale o O08". As definições deste arquivo substituem as de O01 §5.1 e §11.1. As diferenças estão na seção 2.3, e a lista de correções ao O01 está na seção 8.

---

## 0. Como usar

| Quando | O que rodar | O que olhar |
|---|---|---|
| Toda sexta (revisão de 60 min, O01 §12) | `kpis.sql` com `ate` na sexta da semana | semáforo da seção 4; blocos A a G |
| 30/11 (D22) | `kpis.sql` com `semana_ref=2026-11-23` | Q04b, lista de ativação de quem não teve agenda na semana anterior |
| CP2, CP3... (O01 §5.3) | `kpis.sql` com `janela_g3=2026-11-09` | G3 acumulado desde o D1 (a janela padrão começa no D22) |
| 21/12 (D43) | `kpis.sql` com `ate=2026-12-20` | semanas 5 e 6 fechadas: G1 e tabela de semanas |
| 23/12 (D45) | `kpis.sql` com `ate=2026-12-23` | os quatro portões (seção 2) e a decisão (seção 5) |

Comando (guarde a URL do banco fora do repositório e do histórico do shell):

```bash
psql "$PGURL" -X --csv \
  -v desde=2026-11-09 -v ate=2026-12-20 -v janela_g3=2026-11-30 \
  -v semana_ref=2026-11-23 -v "contas_teste={<uuid>,<uuid>}" \
  -f docs/operacao/kpis.sql > ~/privado/kpis-2026-12-20.csv
```

- `contas_teste`: os `user id` de todas as contas de teste, da planilha `contas_de_teste` (O01, 11.3). Inclua as suas contas, as de familiares e as de funcionários. Sem essa lista, a consulta conta testes como clientes e prestadores.
- O arquivo roda dentro de `BEGIN READ ONLY ... ROLLBACK`: um comando de escrita falha e nada é gravado.
- Requer psql 12 ou superior (`--csv`); o `\if` do arquivo pede 10. Antes de rodar: `mkdir -p ~/privado`.
- A saída contém nomes (Q04b) e números de pessoas. Fica fora do repositório (O01, 11.4). No repositório entram só números agregados.

---

## 1. Estrela e guardas

| # | Métrica | Definição | Fórmula | Fonte (tabela.coluna) | Meta ou limite | Cadência | Consulta |
|---|---|---|---|---|---|---|---|
| E | **Serviços concluídos e pagos no app** (estrela, por mês) | Atendimento que chegou a `completed` ou `released`, de origem `platform` ou `own`, com pagamento `received` ou `confirmed`; mais orçamento aceito com pagamento recebido | contagem por mês de `booking_events.at` onde `to_status = 'completed'`; orçamento pelo mês do primeiro `coalesce(payments.received_at, payments.updated_at)` elegível | `bookings.status`, `bookings.origin`, `booking_events.to_status/at`, `payments.booking_id/quote_id/status/updated_at`, `quotes.status` | Sem meta mensal no plano. No D45, G2 ≥ 20 acumulados (seção 2). A meta mensal sai do memorando do D45 `[proposta]` | mensal; semanal na revisão | Q01 |
| G1 | **Prestadores ativos na agenda por semana** (guarda: prestadores ativos semanais) | Prestador aprovado com ao menos um evento de agenda na semana ISO (seção 2) | `count(distinct prestador)` por semana | `booking_events.actor_id/at`, `availability.provider_id/created_at`, `time_off.provider_id/created_at`, `providers.status` | ≥ 30 nas semanas 5 e 6 (O01, G1) | semanal | Q04 (lista: Q04b) |
| G3 | **Liquidez por categoria e distrito** (guarda: pedidos com proposta em 2 h) | Pedido válido com proposta dentro de 2 h do relógio (seção 2) | `pedidos com proposta em 2 h ÷ pedidos válidos`, por categoria e distrito | `requests.created_at/occupation_slug/neighborhood_id/status/client_id`, `proposals.created_at/request_id`, `neighborhoods.slug` | ≥ 70% com ≥ 30 pedidos válidos (O01, G3). Abaixo de 30 pedidos o resultado é "sem prova" | semanal; em cada CP | Q03; demanda fora do escopo: Q03b |
| G2 | **Serviços pagos pela plataforma** (guarda: caixa) | Serviço com pagamento recebido ou confirmado (seção 2) | contagem e soma de `payments.amount_cents` por trilha, categoria e prestador | `booking_events` (`to_status = 'paid'`), `payments.status/amount_cents/booking_id/quote_id`, `quotes.status` | ≥ 20 no D45 (O01, G2) | semanal | Q02 |
| P1 | **Parcela paga no app** (indício de vazamento) | Atendimentos de origem `platform` concluídos no período que têm pagamento recebido ou confirmado | pagos no app ÷ concluídos (só origem `platform`) | `bookings.origin/status`, `booking_events` (`completed`), `payments` | Sem meta no plano. Sinal de investigação: queda de 10 pontos em duas semanas seguidas `[proposta]`. Não há tática contra o cliente (O01, 10.4) | semanal | Q06 |
| P2 | **Conversão do teste do Pro** | Quem começou o teste (`trialing`) e virou pagante (`active`), ou não pagou ao fim (`past_due`) | virou ÷ (virou + não pagou ao fim do teste) | `audit_log` (`entity = 'subscriptions'`): `subscription.create` (`trial_days`), `subscription.status` (`from`/`to`) | Abaixo de 15% dos que chegaram ao fim: revisar o que o Pro entrega, não baixar o preço (DECISOES, seção 7) | semanal a partir do D34 | Q07 |
| P3 | **Churn mensal do Pro** | Pagante no início do mês que cancela no mês (inadimplentes do mês são contados à parte) | cancelamentos do mês ÷ pagantes no início do mês | `audit_log` (`subscription.cancel`, `subscription.status` para `canceled`/`past_due`) | Acima de 5% no mês: revisar a entrega do Pro `[proposta]`. Subir o preço só depois de 100 pagantes com churn abaixo de 5% (DECISOES, D2) | mensal | Q08 |
| P4 | **Pagantes sobre aprovados** (conversão para Pro) | Pagantes ativos ÷ prestadores aprovados (estado atual) | `subscriptions.status = 'active'` ÷ `providers.status = 'approved'` | `subscriptions.status/provider_id`, `providers.status` | Abaixo de 3% após 90 dias com 100 ou mais prestadores grátis ativos: limite de propostas de 5 para 3 (DECISOES, D4). Aproximação: o denominador é todo prestador aprovado, e não só os grátis ativos da regra do DECISOES (D4) | mensal | Q07 (última linha) |
| C1 | **Custo por prestador aprovado e por serviço pago** (CAC) | (gasto de aquisição + horas do fundador × valor da hora) ÷ prestadores aprovados no período (ou serviços pagos) | fórmula ao lado; os numeradores ficam fora do banco | Denominadores: `audit_log` (`provider.status` de `draft`/`pending_review` para `approved`), Q02. Numeradores: planilhas `dinheiro` e `horas` (O01, 11.2) | Sem meta no repositório. O memorando do D45 fixa o teto `[proposta]` | D45 e mensal | Q11 + planilhas |
| I1 | **Incidentes** | Ocorrências com gravidade (O01, 11.1) | contagem por gravidade | planilha `incidentes` e `cuidado`; sinais do banco: suspensões e alertas da seção 1 (Q10) | Dano físico ou conduta grave: suspender o prestador e pausar a linha (O01, 13.4) | semanal | Q10 + planilha |
| V1 | **Violações de regra** | Promessa proibida, documento fora do app, dinheiro fora do Asaas (O01, 11.1). Só a parte de dinheiro aparece no banco | contagem | planilha `incidentes`; Q10 para alertas de dinheiro | 0 | semanal | planilha + Q10 |
| D1 | **Disputas** (coorte de pagos) | Atendimentos com pagamento confirmado no período que alguma vez foram para `disputed` | disputados ÷ pagos no período | `booking_events.to_status = 'disputed'`, `bookings.status`, `payments.status` | Abaixo de 10% (DECISOES, seção 4, item 4: condição da comissão). Fora da Fase 1 pelo O01, mas medida desde o D1 | semanal | Q10 |
| H1 | **Horas do fundador** | Soma das horas por semana, por categoria (R, O, D, C, E, P, M, A, B) | soma da planilha `horas` | planilha `horas` (não está no banco) | Teto de 60 h por semana. Duas semanas seguidas acima: corte (O01, 13.4 item 6 e 13.5) | diária e semanal | planilha (Q13 explica) |
| O1 | **Oferta por ocupação e distrito** (cobertura e freio) | Prestadores aprovados por ocupação e distrito, contra pedidos dos últimos 14 dias | contagem de aprovados e de pedidos por par | `provider_occupations.approved/registry_status`, `provider_neighborhoods`, `providers.status`, `requests` | Menos de 5 aprovados: recrutar reposição (O01, D24). 8 ou mais aprovados e menos de 3 pedidos em 14 dias: freio, não recrutar mais (O01, seção 4) | semanal | Q12 |
| F1 | **Funil de prestadores** | Etapas do O01, 5.2 | contagem por etapa (acumulado) | `audit_log` (`provider.submitted`), `providers.status`, `availability`, `services`, `provider_neighborhoods`, `provider_clients`, `bookings` (`origin = 'own'`), `provider_payment_accounts.status`, `proposals`, `bookings`/`quotes` com pagamento | 50 aprovados no D45 (O01, 5.2). Agenda ativa: 5 dos 6 itens do banco | semanal | Q05 |
| A1 | **Alertas de dinheiro** | Entradas do `audit_log` que dizem que o dinheiro saiu do esperado | contagem por tipo; "em aberto" = sem tratamento depois | `audit_log.action` (`payment.refund_failed`, `payment.received_after_cancel`, `payment.void_paid`, `payment_event.failed`, `payment_event.unverified`) | 0 em aberto. Qualquer alerta pausa o fluxo afetado até a causa (O01, 13.4 item 2) | semanal e a cada alerta | Q10. Em aberto só para `payment.refund_failed` e `payment.received_after_cancel`; os outros três entram como contagem. O bloco de integridade do Q10 também lista `occupation.approval_revoked`, que não é dinheiro |

---

## 2. Portões G1 a G4 (O01, seção 5.1)

As metas vêm do O01. As definições operacionais abaixo são as do banco. Cada portão é verde quando a consulta indicada atinge a meta.

### 2.1 Definições

| Portão | Meta | Conta | Não conta | Janela | Consulta e linha |
|---|---|---|---|---|---|
| **G1** | ≥ 30 prestadores ativos em cada uma das semanas 5 (07/12 a 13/12) e 6 (14/12 a 20/12) | Prestador **aprovado** com ao menos um evento de agenda na semana ISO (segunda a domingo, horário de São Paulo): (a) `booking_events` com `actor_id` = prestador (criou, aceitou, iniciou ou concluiu um atendimento); (b) `availability.created_at` (horário cadastrado); (c) `time_off.created_at` (folga cadastrada). Semana sem linha conta como zero | Ação de cliente; eventos de atendimentos de contas de teste (cliente ou prestador na lista); plantão do Cuidado (`shifts`), que não é agenda; evento feito por você no aparelho do prestador | D1 a D45 | Q04: linhas `2026-12-07` e `2026-12-14` |
| **G2** | ≥ 20 serviços pagos pela plataforma (acumulado até o D45) | Atendimento ou orçamento aceito com ao menos um pagamento `received` ou `confirmed`. Conta uma vez por serviço. Reembolso ou estorno tira o serviço (o status deixa de ser recebido) | Testes de R$ 1,00; contas de teste; você, familiares, funcionários e o próprio prestador como pagador (a lista de contas é da planilha, porque CPF não está no banco); plantões do Cuidado; divisão de um serviço em vários pagamentos | D1 a D45 | Q02: soma das linhas |
| **G3** | ≥ 70% dos pedidos válidos com proposta dentro de 2 h, com no mínimo 30 pedidos válidos | Pedido válido: categoria de lançamento, distrito do piloto, criado na janela, sem conta de teste, sem status `canceled`. Relógio: `requests.created_at`, ou a abertura da janela de atendimento se chegou fora dela (janela `[proposta]` do O01, seção 8.3: seg. a sex. 8h a 17h30; sáb. 8h a 14h; o domingo não está no O01, e aqui abre na segunda 8h `[proposta]`). Proposta: `proposals.created_at`, só de prestador que não é conta de teste | Pedido de ensaio; pedido cancelado pelo cliente; pedido sem resposta sua a uma pergunta por 2 h (registre o motivo na planilha). Trilha B (orçamento e cobrança pela conta do prestador) não tem pedido no banco: vai na planilha `pedidos` | D22 a D45 (30/11 a 23/12) | Q03: linha `TOTAL` |
| **G4** | ≥ 3 famílias na linha Cuidado | Casa (`households`) com ao menos um plantão `completed` no período, com check-in `in` e check-out `out` (`checkins`) e relatório do dia (`daily_reports`) | Casa de teste ou de familiar seu; incidente grave aberto (não está no banco: confira a planilha `cuidado` antes de contar) | D1 a D45 | Q09: primeira linha |

**Regra de conta (O01, 13.3).** g = número de portões verdes. Um portão não testado por falta de P11 sai da conta. m = menor percentual da meta entre os portões que não ficaram verdes (G1: prestadores ÷ 30; G2: serviços ÷ 20; G3: percentual ÷ 70; G4: famílias ÷ 3).

### 2.2 Como ler G3

- O banco mede o **teto**: conta toda proposta do pedido. A disponibilidade `proposals.available_from` é opcional e Q03 não a exige. Confira uma amostra de 10 propostas por semana na planilha.
- Feriados não são descontados do relógio. Em feriado, ajuste na planilha.
- Q03 usa `janela_g3` (padrão 30/11). Para o acumulado desde o D1, rode com `janela_g3=2026-11-09`.

### 2.3 Correspondência com os indicadores do O01

1. **G1, "atendimento criado por ele"**: o O01 §5.1 usa `booking_events.actor_id` e remete a este item. `bookings` não guarda quem criou. Quem fez a mudança fica em `booking_events.actor_id`, gravado pelo trigger de histórico em todo `INSERT` e `UPDATE` de status (`private.log_booking_status`, `20261019000005_bookings.sql`).
2. **G1, contas de teste**: o O01 §5.1 e esta consulta excluem eventos de um atendimento cujo cliente ou prestador seja de teste, mesmo se o outro participante for real.
3. **P1 (parcela paga)**: o indicador usa os atendimentos concluídos de origem `platform`, conforme O01 §11.1; excluir participantes de teste.
4. **Estrela (E)**: o O01 (§11.1) dá o mesmo nome ao G2, acumulado e sem exigir conclusão. A estrela é mensal e exige conclusão; G2 exige só pagamento.
5. **D1 (disputa)**: o O01 diz "atendimentos `disputed`". Aqui é a coorte de pagos, que é o denominador do DECISOES, seção 4.

---

## 3. Fases e portões

**Atenção com a palavra "fase".** O repositório usa "fase" pelo menos em dois sentidos: fase de construção (`ARQUITETURA.md`: prerender de SEO e assistente de IA são "fase 3") e fase de lançamento (O01: "Fase 1" é o concierge de 45 dias). Este documento usa o segundo.

**Datas.** D1 = 09/11/2026 e D45 = 23/12/2026 são o calendário de referência do O01 (seção 2, "Regra do relógio"). O D1 real é a primeira segunda-feira com os itens P1, P3, P4, P6 a P10 e P13 verdes; se ele mudar, mudam as datas deste documento.

**Confirme antes de usar:** o plano estratégico privado não estava acessível (O01, 16.3). As fases 2 e 3 abaixo são a sequência que os documentos do repositório permitem: o "continuar" do O01 (13.3) abre "segundo conjunto de distritos ou novas categorias"; o DECISOES coloca a comissão e o pagamento retido depois. `[incerto: confirmar com o plano privado]`.

| Fase | Objetivo | Portões e limiares | Consultas | Quando decidir |
|---|---|---|---|---|
| **1. Concierge de 45 dias** (D1 09/11/2026 a D45 23/12/2026) | Provar o ciclo completo com dinheiro real, uso semanal da agenda e demanda | G1 ≥ 30 nas semanas 5 e 6; G2 ≥ 20 acumulados; G3 ≥ 70% com ≥ 30 pedidos válidos; G4 ≥ 3 famílias (só com P11 verde) | Q04, Q02, Q03, Q09 | D45, pela regra da seção 5 (O01, 13.3) |
| **2. Ampliação de território e categorias** (só se a Fase 1 disse "continuar") | Crescer a oferta e a demanda sem mexer em dinheiro | Novo distrito: 2 semanas seguidas com G3 ≥ 70% e ≥ 8 pedidos válidos por semana (regra do O01, 3.4, que ele marca como proposta). Nova categoria: ≥ 5 aprovados na ocupação e no distrito e ≥ 3 pedidos em 14 dias `[proposta]` | Q03, Q03b, Q12 | Por distrito ou categoria, com o mesmo semáforo |
| **3. Dinheiro na plataforma e Cuidado aberto ao público** | Comissão, depois pagamento retido; menu Cuidado divulgado | Comissão: os cinco portões de DECISOES, seção 4 (parecer escrito; conta Asaas de produção aprovada e split real de R$ 1,00 conferido no painel do Asaas; termos e política publicados; ≥ 20 serviços pagos com menos de 10% em disputa; cadastro fiscal coletado). Pagamento retido: parecer, instituição autorizada fazendo a custódia e ≥ 12 meses de operação. Cuidado: pessoa jurídica aberta, seguro de responsabilidade civil cotado, parecer trabalhista e ≥ 3 famílias atendidas em modo concierge (DECISOES, seção 5) `[CONDICIONAL: depende de parecer]` | Q02 (serviços pagos), Q10 (disputas), Q07 e Q08 (Pro), Q09 (famílias) | Só com todos os itens. Nenhum número do banco substitui parecer |

---

## 4. Painel da revisão semanal

Layout para a revisão de sexta (O01, seção 12). Uma tela, na ordem de leitura. Os valores vêm do CSV de `kpis.sql`; os campos manuais vêm da planilha.

| Bloco | Conteúdo | Fonte | Regra de cor |
|---|---|---|---|
| **Linha 0: semáforo** | G1 (ativos na semana 5 e 6), G2 (acumulado), G3 (percentual em 2 h, com número de pedidos válidos), G4 (famílias). Para cada um: valor, ritmo do CP (O01, 5.3), limite vermelho | Q04, Q02, Q03 (TOTAL), Q09 | Verde: no ritmo ou acima. Amarelo: de 70% a 99% do ritmo. Vermelho: abaixo de 70% do ritmo (O01, 13.1). G3 com menos de 30 pedidos válidos: "sem prova", cinza |
| **A. Oferta** | Funil do O01, 5.2 (cadastros, aprovados, agenda ativa, recebimento ativo, primeira proposta, primeiro pago). Cobertura por ocupação e distrito com alerta de freio ou reposição | Q05, Q12 | Freio e reposição em destaque |
| **B. Demanda e liquidez** | G3 por categoria e distrito, com mediana em minutos. Demanda fora do escopo, contada à parte | Q03, Q03b | Célula com menos de 3 pedidos válidos: cinza (amostra pequena) |
| **C. Dinheiro** | Serviços pagos por trilha e categoria (Q02). Estrela por mês (Q01). Parcela paga no app (Q06). Disputas da coorte (Q10). Alertas em aberto (Q10). Custo (C1, planilha) | Q01, Q02, Q06, Q10, Q11 | Alerta em aberto: vermelho. Disputa de 10% ou mais: amarelo |
| **D. Uso** | Prestadores ativos por semana (Q04). Lista de ativação: quem não teve agenda na semana anterior (Q04b) | Q04, Q04b | Q04b só na pasta privada |
| **E. Cuidado** | Famílias com plantão concluído e relatório (Q09). Plantões por semana: marcados, concluídos, cancelados, faltas, sem cuidador | Q09 | Sem cuidador em semana com plantão marcado: amarelo |
| **F. Pro** | Testes iniciados e virados (Q07). Churn e inadimplência por mês (Q08). Pagantes sobre aprovados (Q07) | Q07, Q08 | Conforme P2 a P4 (seção 1) |
| **G. Qualidade, incidentes e horas** | Suspensões no período e alertas por tipo (Q10). Incidentes (planilha `incidentes`). Violações (planilha, meta zero). Horas por categoria e total (planilha `horas`) | Q10, planilhas | Qualquer incidente grave: seção 5, gatilho imediato. Horas acima de 60: amarelo |
| **H. Decisão desta semana** | Uma alavanca. Regra aplicada (continuar, corrigir, pivotar, parar). O que deixo de fazer | manual (O01, 12) | Uma alavanca por semana |

---

## 5. O que cada resultado decide

### 5.1 Regra do D45 (O01, 13.3) `[proposta]`

| Decisão | Regra | O que fazer |
|---|---|---|
| **Continuar** | g = 4 | Abrir a Fase 2 (seção 3). Comissão e pagamento retido seguem desligados até os portões do DECISOES, seção 4 |
| **Corrigir** (uma vez, até 15 dias, uma alavanca) | g ≥ 2 **e** m ≥ 50% | Escolher uma alavanca no D45. Nenhum escopo novo. Reavaliar com a mesma regra |
| **Pivotar** | g ≤ 1 **ou** m < 50% | Mudar uma variável estrutural (distritos, mistura de categorias, canal ou modelo). Um ciclo de 30 dias com os mesmos portões |
| **Parar ou hibernar** | pivotar **e** vermelho nas últimas três revisões **e** nenhuma hipótese testável dentro do orçamento; ou um gatilho imediato (5.3) | Parar de captar. Atender quem já está no app. Preservar dados e caixa. Reler em 30 dias |

### 5.2 Leitura de cada resultado

| Resultado | Quer dizer | Próxima decisão |
|---|---|---|
| G1 abaixo de 30 numa das semanas 5 ou 6 | Pouca agenda usada | Abaixo de 70% do ritmo por duas semanas: mudar a causa (canal ou categoria), não o esforço (O01, 13.1). Usar Q04b para ativar |
| G3 com 70% ou mais e 30 pedidos válidos | Liquidez suficiente no piloto | Continuar. Ver Q12 antes de recrutar |
| G3 entre 50% e 69% (faixa minha, `[proposta]`) | Proposta lenta | Acionar 5 prestadores em vez de 3, encurtar a janela de resposta, trocar quem responde devagar (O01, CP3) |
| G3 abaixo de 35% no CP3 | Demanda sem oferta (risco R8) | Reserva de 3 a 5 prestadores por categoria; recusar pedido fora do escopo (O01, risco R8) |
| G3 com menos de 30 pedidos válidos | Amostra pequena | "Sem prova": não decide. Acumule até o próximo CP |
| Alerta `freio` em Q12 | 8 ou mais aprovados e menos de 3 pedidos em 14 dias | Parar de recrutar naquela ocupação e distrito |
| Alerta `reposicao` em Q12 | Menos de 5 aprovados | Recrutar reposição (O01, D24) |
| Parcela paga no app caindo | Possível combinação por fora, ou pagamento que falha | Investigar antes de agir. Facilitar o link e o histórico; não adotar tática hostil (O01, 10.4) |
| Conversão do teste abaixo de 15% | O Pro não entrega o que promete | Revisar a entrega do Pro. Não baixar preço (DECISOES, seção 7) |
| Churn acima de 5% no mês | Pagantes saem | Revisar a entrega do Pro `[proposta]`. Não subir preço (DECISOES, D2) |
| Pagantes sobre aprovados abaixo de 3% depois de 90 dias com 100 ou mais grátis | Conversão fraca | Baixar o limite de propostas de 5 para 3 (DECISOES, D4). Se menos de 30% dos aprovados enviarem a primeira proposta, subir para 8 |
| Disputa da coorte de 10% ou mais | Problema de qualidade | Não ligar comissão (DECISOES, seção 4). Rever o caso a caso pelo procedimento de disputas (O07) |
| Alerta de dinheiro em aberto | Dinheiro fora do esperado | Pausar o fluxo afetado até entender a causa (O01, 13.4 item 2) |
| Violação de regra (meta zero) | Promessa, documento ou dinheiro fora do app | Registrar na planilha `incidentes`, corrigir o material, reler a regra (O01, 11.1) |
| Horas acima de 60 em duas semanas seguidas | Teto estourado | Corte da seção 13.5 do O01 |
| CAC sem meta | Custo ainda não medido | Calcular uma vez no D45 e fixar teto no memorando `[proposta]` |

### 5.3 Gatilhos imediatos (qualquer dia, O01, 13.4)

1. Incidente com dano físico ou conduta grave: suspender o prestador em `/admin/prestadores/:id` (motivo obrigatório) e pausar a linha. Avisar advogado e seguradora.
2. Divergência de dinheiro (cobrança em duplicidade, split divergente, valor errado): pausar o fluxo afetado.
3. Acesso indevido a documentos: plano de incidente ("L08" no O01: `docs/juridico/08-plano-de-resposta-a-incidentes.md`) `[CONDICIONAL: depende de parecer]`.
4. Notificação formal de conselho, autoridade ou órgão de defesa do consumidor: pausar a categoria envolvida e consultar o advogado `[CONDICIONAL: depende de parecer]`.
5. Gasto acima de 120% do orçamento do O01 (seção 14): congelar os gastos opcionais `[proposta]`.
6. Mais de 60 h por semana em duas semanas seguidas: corte de escopo.

---

## 6. O que o banco não vê

| Limite | Efeito | O que fazer |
|---|---|---|
| Trilha B (orçamento e cobrança pela conta do prestador) não tem pedido nem proposta no banco | G3 da trilha B não entra em Q03 | Planilha `pedidos` (O01, 11.2) |
| Datas de recebimento anteriores à migração podem estar vazias | Q01 e Q02 usam `received_at` ou, para o legado, `updated_at` | Quantificar e sinalizar a aproximação se afetar a janela |
| Orçamentos aceitos podem receber `completed_at` | A estrela Q01 ainda usa o pagamento como aproximação para orçamento | Para mobilidade usar atendimento com evento de conclusão do serviço |
| A data opcional `proposals.available_from` pode estar vazia | G3 ainda aproxima proposta qualificada | Conferir disponibilidade na amostra semanal (§2.2) |
| `providers.approved_at` registra a primeira aprovação | Q04/G1 ainda usa o status atual e Q11 considera registros de auditoria | Expor a aproximação para a série histórica |
| `subscription_status_history` guarda transições | Q07 e Q08 ainda dependem do `audit_log` | Ver o alcance de registros anteriores à migração (§8.2) |
| Incidente grave e "família com incidente aberto" | Não estão no banco | Planilha `incidentes` e `cuidado` |
| Contas de teste | Só os `user id` de `contas_teste` saem. O banco não reconhece uma pessoa pelo CPF | Manter a planilha `contas_de_teste` completa (O01, 11.3) |
| Feriados | O relógio do G3 não os desconta | Ajustar na planilha |
| Horas e gastos | Não estão no banco | Planilhas `horas` e `dinheiro` |

---

## 7. O que foi conferido

**Execução no banco local** (PostgreSQL 17.11, `127.0.0.1:54322`, base `postgres`):

- O arquivo inteiro rodou sem erro, com as variáveis padrão, dentro de `BEGIN READ ONLY ... ROLLBACK`. Na revisão de 08/11/2026 o banco tinha 0 pedidos, 0 atendimentos, 0 pagamentos e 0 assinaturas, mas 1 prestador aprovado de teste de integração ("QA Cuidadora", criado por outras frentes; o id muda entre execuções), 69 linhas de `audit_log` do dia 08/11 e os 96 bairros e 1.710 ocupações da semente. Por isso Q04b, Q05 e Q07 devolvem 1 onde a conta real seria 0: é o caso que `contas_teste` existe para excluir. O resto devolve zero ou linha vazia.
- Um `CREATE TABLE` dentro da transação de leitura falha ("cannot execute CREATE TABLE in a read-only transaction"). A proteção funciona.
- O banco local aplica todas as migrações do repositório neste branch, incluídas `booking_reminders`, `admin_settings_and_metrics` e `product_events` (migrações 20261023100000, 20261023200000 e 20261108100000). As consultas usam só tabelas criadas nas migrações 01 a 11.

**Teste lógico com dados sintéticos.** Copiei 21 tabelas para o schema temporário `kpi_fx` (com `LIKE`), inseri cerca de 190 linhas sintéticas (prestadores, pedidos, atendimentos, pagamentos, assinaturas, casas, plantões e auditoria), além de 96 bairros copiados da semente e rodei todo o `kpis.sql` dentro de uma transação terminada em `ROLLBACK`. Nenhuma tabela de `public` foi escrita. Os resultados batem com os valores que calculei à mão, com duas contas de teste excluídas `[incerto]`: não há script nem saída no repositório, o schema `kpi_fx` não existe mais no banco, e esta revisão não reproduziu o teste. O teste apontou uma falha, corrigida antes de fechar (Q04 contava eventos de atendimentos de conta de teste). Outras três correções saíram de revisão, antes do teste: a contagem de cadastros (Q05) não excluía contas de teste; a visão semanal do Cuidado (Q09) não excluía cuidadores de teste; e a coorte de disputas e o custo (Q10 e Q11) contavam pagamento reembolsado.

**Não conferido:**

- Desempenho com volume real. Não há dados reais.
- Os registros de auditoria que o webhook grava com o Asaas real (`subscription.status`, `payment.refund_failed`). Li o código de `asaas-webhook/handler.ts` e `subscriptions-manage/handler.ts`, mas não rodei contra o Asaas.
- Horário de verão e feriados (o relógio do G3 não desconta feriados).
- Saída em CSV com `psql --csv` (a linha `BEGIN` aparece no arquivo).
- psql anterior à versão 12 (o `--csv` do comando da seção 0 é da versão 12; o `\if` do arquivo, da 10). Conferido na documentação do PostgreSQL: `--csv` na nota da versão 12; `\if` na página do psql 10.

---

## 8. Pendências e lacunas

### 8.1 Correções incorporadas ao O01

1. O O01 §5.1 usa `booking_events.actor_id` e remete ao §2.3, item 1.
2. O O01 remete às exclusões do §2.3 em P1 e identifica contas de teste de ambas as partes em G1.
3. O O01 §11.1 restringe a parcela paga no app à origem `platform`.

### 8.2 Lacunas do produto

Os itens 1 a 6 foram corrigidos no código em 24/11/2026 (migrações `20261124100003` e `20261124100004`; `docs/DECISOES.md`, DD65 e DD66). Linhas anteriores à migração ficam sem as datas novas: não houve backfill.

1. Recebimento. O banco grava `payments.received_at` na primeira vez em que o pagamento fica pago. `kpis.sql` usa `updated_at` quando a data está ausente no legado.
2. Conclusão do orçamento. O prestador marca `quotes.completed_at` em `/pro/orcamentos` (`mark_quote_completed`), mantendo `status = accepted`. As consultas ainda usam o pagamento como aproximação.
3. Aprovação. `providers.approved_at` registra a primeira aprovação. As consultas ainda usam a situação atual.
4. Assinatura. `subscription_status_history` registra `from_status`, `to_status` e `changed_at`. As consultas de assinatura ainda leem o `audit_log`.
5. Disponibilidade. `proposals.available_from` é uma data opcional exibida na proposta. Q03 aceita propostas sem a data; a amostra semanal do §2.2 verifica quando o prestador pode ir.
6. Aviso de pedido do marketplace. O modelo `pedido_novo` e o gatilho `requests_60_notify_providers` foram adicionados em 24/11 e se somaram ao aviso de agendamento direto. A entrega em canal humano/externo exige configuração e prova de recebimento. [Migrações de métricas](../../supabase/migrations/20261124100003_metrics_data.sql) · [Aviso de novo pedido](../../supabase/migrations/20261124100004_new_request_notice.sql)
7. A migração de `product_events` e `admin_funnel_daily()` integra o conjunto implantado em 25/11 segundo O14. As consultas do concierge não usam esses eventos. Faltam evidências de medição em pedidos reais e instrumentação própria de mobilidade. [Migração](../../supabase/migrations/20261108100000_product_events.sql) · [Implantação](14-entrega-multiplataforma.md)
8. `ARQUITETURA.md` usa "fase" com sentido de construção, e o O01 com sentido de lançamento. Padronizar o termo.
9. A lista de contas de teste é uma planilha. Nenhuma consulta a acessa; se a planilha não for completa, as métricas saem infladas.

### 8.3 Pendências da conferência

- Confirmar com o plano estratégico privado os nomes e os limiares das fases 2 e 3 (seção 3).
- Rodar `kpis.sql` com dados reais no primeiro ensaio (O01, P10) e comparar a planilha com o banco (O01, 11.3, item 3).
- CSV: decidir se o `BEGIN` e o `ROLLBACK` devem sair da saída.

---

## 9. Experimento de mobilidade

Protocolo proposto, com limites a registrar antes da primeira atribuição real. G1–G4 medem o concierge com as definições da seção 2. O módulo terá um registro próprio de cada solicitação elegível, ainda a implementar. O G3 exclui cancelamentos e, por isso, seu denominador não serve para avaliar a oferta de transporte. [Operação O01](01-plano-de-45-dias-concierge.md) · [Roadmap O15](15-mobilidade-de-prestadores.md)

### População e comparação

- Registrar uma vez por solicitação real e única, antes da cotação ou da resposta do cliente, sua elegibilidade, data, microárea, ocupação aprovada, janela coberta, prestador disponível e alternativas viáveis. Excluir duplicatas, equipe/testes e simulações com motivo registrado. Pedidos que dependem inteiramente de transporte podem seguir pelo suporte dentro das autorizações e do orçamento. Medir esse grupo à parte, pois não dispõe de alternativa comparável.
- Onde ambas as opções forem viáveis, atribuir 1:1, aleatoriamente em blocos por categoria, área e janela, **oferta opcional do operador** ou **serviço com prestador próximo/deslocamento próprio**. Registrar atribuição, preço exibido e versão da proposta antes do aceite. No acompanhamento, usar o braço de origem inclusive para recusa, troca de meio, ausência, falha da reserva, cancelamento e falha de pagamento. Registrar desvios, sem atribuir a aceitação ao preço subsidiado a uma oferta a preço integral.
- Registrar o canal de entrada, origem aproximada, ticket, duração e primeira contratação elegível versus recorrência no serviço. Em ausência de randomização, parear solicitações comparáveis nas mesmas janelas e documentar diferenças de composição, seleção, demanda reprimida e incerteza. Uma decisão comercial exige evidência capaz de separar o efeito da oferta do perfil dos participantes.

### Registro e denominadores

A operação documenta uma linha por solicitação e registros vinculados por atendimento, trecho e tentativa. Guarda horários de eventos com fuso e agrega em `America/Sao_Paulo`. Restringe identificadores e comprovantes ao ambiente operacional. O painel publica agregados, valores ausentes e quantidade de observações por braço. Conciliação financeira usa recibos do operador e registros do PSP. O registro do atendimento confirma o serviço. A leitura pontual de localização do app não acompanha corrida ou produz prova de chegada. [Atendimentos](../../services/bookings.ts) · [Eventos no banco](../../supabase/migrations/20261019000005_bookings.sql) · [Geolocalização pontual](../../platform/geolocation.ts)

| Indicador | Cálculo e leitura |
|---|---|
| Aceitação e conversão | Aceites de mobilidade com preço e consentimentos ÷ ofertas de mobilidade efetivamente apresentadas; exibir também propostas apresentadas ÷ atribuídas. Serviços concluídos ÷ todas as solicitações elegíveis do braço, incluindo recusas e cancelamentos. |
| Pontualidade e perdas | Chegadas do profissional ao endereço dentro da janela aceita ÷ atendimentos confirmados com janela encerrada. Registrar separadamente atrasos, ausência, cancelamento após confirmação e chegada sem comprovação. Calcular cancelamentos por solicitante/causa ÷ elegíveis e corridas concluídas sem serviço ÷ corridas concluídas, mais o custo. |
| Contribuição e discrepância | Por braço, somar MC de todos os pedidos, perdas, suporte e ajustes de cancelamento e dividir pelo número de solicitações elegíveis, incluindo as de contribuição zero. Comparar a diferença oferta menos controle. Isolar recebimento e remuneração autorizados, custo e despesas variáveis de mobilidade por trecho, e final menos cotado em R$ e % quando cotação positiva. Expor adicionais autorizados, cobranças contestadas e autorizações excedidas. |
| Prestador e recompra | Renda líquida/h por profissional = (soma de repasses − soma de custos próprios) ÷ soma das horas de serviço, deslocamento de todos os trechos e espera. Apresentar mediana por braço, distribuição e cobertura de registro de tempo e custos. Para recompra, clientes com outro serviço concluído em 30 dias ÷ clientes únicos com primeiro serviço concluído e 30 dias completos de observação. |
| Capacidade e caixa | Minutos do coordenador e do fundador por elegível e por pedido, turnos cobertos e gasto com subsídio por solicitação e por pedido. Mostrar pico diário de caixa necessário, reserva de obrigações pendentes, exposição a estornos e prazos de efetivo desembolso e recebimento. Por par origem–destino e slot, contar elegíveis/concluídos e medir distância, duração, retorno/continuação, espera e concentração (% dos elegíveis no par mais frequente). |

A planilha apresenta MC do pedido sem assinatura rateada e resultado por coorte/mês com assinaturas efetivas. O processamento e os demais custos são apropriados uma vez. Recalcular o resultado com subsídio encerrado e validar com oferta a preço integral, pois elasticidade a preço não é conhecida. [Modelo financeiro O09](09-modelo-financeiro.md)

### Avanço e interrupção

| Decisão | Regra proposta e prova |
|---|---|
| Abrir M1 | Instrumento e canal do operador validados, responsabilidades e pagadores definidos, escala com titular e suplente até o último retorno, autorizações e conciliação testadas e caixa reservado. Arquivar evidência do ensaio por cenário no ambiente identificado e aprovações de operação. Habilitar monetização requer a sua permissão comercial específica. |
| Limitar exposição | Janela de quatro semanas, capacidade exploratória de 50–100 elegíveis. Encerrar inclusão ao atingir 100 ou o fim da janela. O limite proposto de **R$ 5.000** cobre todo o caixa incremental da operação M1, inclusive escala remunerada do coordenador e suplente, demais custos operacionais e obrigações futuras assumidas. O subsídio promocional está dentro desse teto, com **até R$ 10 por solicitação e R$ 300 no total**, e encerra ao consumir R$ 300 ou terminar a janela. Engenharia tem orçamento separado a aprovar; o PR documental não autoriza esses gastos. No caixa consolidado, atribuir cada desembolso uma vez à operação ou à engenharia e baixar a obrigação reservada ao pagá-la. Antes de reservar, somar desembolsos e obrigações pendentes (ida, retorno, adicionais autorizados, cancelamentos); se o próximo compromisso romper o teto, suspender novas reservas. Registrar desembolso e recebimento separadamente e honrar os compromissos assumidos. |
| Parar e recuperar | Um acesso indevido a localização, reserva/cobrança duplicada, despesa sem autorização ou liberação indevida de repasse suspende novas reservas na rota afetada, com bloqueio mais amplo se a abrangência for desconhecida. Se faltar cobertura humana para a janela ou o último retorno, suspender imediatamente novas reservas e acionar a contingência para os compromissos em curso. Manter reservado o custo ainda incerto até a reconciliação. Nomear responsável, atender viagens em curso, conciliar e testar a correção antes de reabrir. [Runbook](../RUNBOOKS.md) |
| Encerrar o piloto operacional | Todas as solicitações incluídas têm desfecho ou acompanhamento identificado, todos os trechos e obrigações têm custo/estado reconciliado para o fechamento financeiro e restam zero incidentes críticos abertos. Relatar quantidade real e lacunas mesmo abaixo de 50. Em cada revisão semanal observar pontualidade ≥90% e queda máxima de 5 pontos percentuais frente ao controle, renda/h mediana ≥95% da mediana de controle e suporte médio ≤15 min por elegível. Desvio requer revisão da escala/área e congela expansão. Dado ausente ou controle sem observações deixa o indicador inconclusivo. |
| Demonstrar benefício econômico e expandir | Usar braço comparável, horizonte completo de ajustes e recompra, contribuição incremental por elegível com limite inferior do IC de 95% acima de R$ 0 a preço sustentável, guardas de qualidade/renda/suporte cumpridas e caixa compatível. Para comercializar margem de transporte, exigir também autorização e margem de mobilidade positiva após custos e sem subsídio permanente. Publicar motivos de divergências e cobertura da amostra. Se o intervalo incluir zero ou a seleção impedir atribuição confiável, manter ou encerrar o escopo limitado e indicar a próxima evidência necessária. |

Os 50–100 elegíveis dimensionam o trabalho inicial. Para a etapa confirmatória, pré-registrar a diferença mínima economicamente relevante em R$ por elegível e em conversão. Para contribuição, com alocação equilibrada, usar aproximadamente `2 × (1,96 + 0,84)² × variância / efeito²` observações por braço com variância estimada no piloto. Para conversão, uma hipótese ilustrativa de 60% para 70%, teste bilateral de 5% e poder de 80%, exige cerca de **356 por braço** antes de perdas. Escolher o maior tamanho necessário, ajustar para repetição de clientes/prestadores, perdas e escassez por estrato; estimar intervalos respeitando essa dependência. Recompras ainda sem 30 dias de observação aguardam fechamento.

---

## Apêndice. Parâmetros de `kpis.sql`

| Variável | Padrão | Uso |
|---|---|---|
| `desde` | `2026-11-09` (D1) | início do período de medição |
| `ate` | `2026-12-23` (D45) | último dia incluído |
| `janela_g3` | `2026-11-30` (D22) | início da janela de G3 |
| `semana_ref` | `2026-11-23` | segunda da semana da lista de ativação (Q04b) |
| `contas_teste` | `{}` | array de `user id` das contas de teste |

Consultas: Q01 estrela; Q02 G2; Q03 G3 e liquidez; Q03b demanda fora do escopo; Q04 G1; Q04b lista de ativação (privada); Q05 funil; Q06 parcela paga no app; Q07 Pro (teste e base); Q08 churn; Q09 Cuidado (G4 e plantões); Q10 disputas e alertas; Q11 custo (denominadores); Q12 cobertura e freio. Q13 é só texto: horas, gastos e a lista de contas de teste estão fora do banco.

## Rede direta

Pré-registrar mercado, categoria, corredor de origem e destino, janela, preço, atribuição, hipótese, desfechos e duração antes da oferta. Em serviços comparáveis, sortear oferta de transporte versus alternativas viáveis e medir por intenção de oferta. Em avulsas, registrar solicitações antes da cotação, incluindo desistências e falta de motorista. O painel administrativo registra referência idempotente, grupo comparável e braço original; a operação concilia valores da solicitação inteira, custos de cancelamento e minutos de suporte antes de fechar. O painel conserva desfechos em aberto e exibe contribuição por elegível somente após fechamento do grupo. Analisar recompra aos 30 dias e renda por hora com observações de distância e tempo efetivos. Comparações observacionais exigem declaração de seleção, estratificação e limites de inferência.

| Decisão | Evidência exigida |
|---|---|
| Abrir campo | Habilitação jurídica, empresa e motoristas aptos, seguro, PSP, turno titular/suplente e origem/destino autorizados. Medir tempo até aceite e até embarque. Fixar piso líquido por hora **online** do motorista com renda local e custos do veículo antes da primeira oferta. Registrar versão e valor no protocolo. |
| Limitar gasto | Proposta de até R$ 5.000 brutos em quatro semanas (autorização corrente R$ 0), incluindo equipe e compromissos futuros. O banco reserva o total dos trechos dentro do turno antes do despacho. Finanças inclui gastos externos previamente assumidos ao abrir o orçamento. Nenhum subsídio permanente. Promoção limitada a R$ 10 por solicitação e R$ 300 no total, dentro do teto e somente com aprovação específica. |
| Encerrar inclusões | Quatro semanas, até 100 elegíveis; 50–100 servem ao planejamento. Suspender em falta de cobertura, incidente crítico de segurança/privacidade/dinheiro ou risco de exceder o caixa. Honrar e conciliar obrigações abertas. |
| Encerrar operacionalmente | Todas as inclusões têm desfecho e todas as obrigações têm recibo ou resolução documentada. Zero incidente crítico aberto. Por mercado e por braço, reportar aceitação ao preço, conversão, pontualidade, cancelamentos, trajeto sem serviço, margem, renda/hora, tempo sem passageiro, divergência de preço, subsídio, suporte, caixa e concentração. |
| Demonstrar benefício | Em serviços, pontualidade ≥90%, queda máxima de 5 p.p. sobre controle, renda/h mediana ≥95% do controle e suporte médio ≤15 min por elegível. Em avulsas exigir piso do motorista e margem positiva a preço integral. Expandir sob contribuição incremental sustentável, limite inferior de IC95% positivo, caixa e escala suficientes. Reestimar amostra com variância do piloto, efeito mínimo e repetição de usuários. Com dados inconclusivos, manter o corredor limitado e apontar a evidência faltante. |

[Definições e abas econômicas](09-modelo-financeiro.md) · [Roadmap e denominadores](16-rede-propria-de-motoristas.md)
