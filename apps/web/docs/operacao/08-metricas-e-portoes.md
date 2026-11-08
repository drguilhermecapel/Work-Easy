# Métricas, portões e consultas (O08)

Documento O08 · versão de 08/11/2026 · uso interno do dono do WorkEasy, que opera sozinho. Consultas em `kpis.sql`, na mesma pasta.

> **Rascunho para revisão de advogado. Não é parecer jurídico.** Este é um documento operacional. Onde ele toca a regra de comissão, de pagamento retido ou de profissão regulamentada, o trecho vem marcado `[CONDICIONAL: depende de parecer]` e remete a `docs/DECISOES.md`.
>
> **Estado do produto:** o MVP está em `main`, **não está implantado**, não tem usuários reais e nada foi testado contra o Asaas, o WhatsApp ou o Resend de verdade. Comissão e pagamento retido estão desligados (`docs/DECISOES.md`).
>
> **Nenhum número deste documento é resultado.** Os limiares são do plano (O01) ou propostas minhas, marcadas `[proposta]`. Hoje o banco local não tem pedidos nem prestadores reais: as consultas foram conferidas com dados sintéticos (seção 7).

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
- A saída contém nomes (Q04b) e números de pessoas. Fica fora do repositório (O01, 11.4). No repositório entram só números agregados.

---

## 1. Estrela e guardas

| # | Métrica | Definição | Fórmula | Fonte (tabela.coluna) | Meta ou limite | Cadência | Consulta |
|---|---|---|---|---|---|---|---|
| E | **Serviços concluídos e pagos no app** (estrela, por mês) | Atendimento que chegou a `completed` ou `released`, de origem `platform` ou `own`, com pagamento `received` ou `confirmed`; mais orçamento aceito com pagamento recebido | contagem por mês de `booking_events.at` onde `to_status = 'completed'`; orçamento pelo mês de `payments.updated_at` (aproximação) | `bookings.status`, `bookings.origin`, `booking_events.to_status/at`, `payments.booking_id/quote_id/status/updated_at`, `quotes.status` | Sem meta mensal no plano. No D45, G2 ≥ 20 acumulados (seção 2). A meta mensal sai do memorando do D45 `[proposta]` | mensal; semanal na revisão | Q01 |
| G1 | **Prestadores ativos na agenda por semana** (guarda: prestadores ativos semanais) | Prestador aprovado com ao menos um evento de agenda na semana ISO (seção 2) | `count(distinct prestador)` por semana | `booking_events.actor_id/at`, `availability.provider_id/created_at`, `time_off.provider_id/created_at`, `providers.status` | ≥ 30 nas semanas 5 e 6 (O01, G1) | semanal | Q04 (lista: Q04b) |
| G3 | **Liquidez por categoria e distrito** (guarda: pedidos com proposta em 2 h) | Pedido válido com proposta em até 2 h do relógio (seção 2) | `pedidos com proposta em 2 h ÷ pedidos válidos`, por categoria e distrito | `requests.created_at/occupation_slug/neighborhood_id/status/client_id`, `proposals.created_at/request_id`, `neighborhoods.slug` | ≥ 70% com ≥ 30 pedidos válidos (O01, G3). Abaixo de 30 pedidos o resultado é "sem prova" | semanal; em cada CP | Q03; demanda fora do escopo: Q03b |
| G2 | **Serviços pagos pela plataforma** (guarda: caixa) | Serviço com pagamento recebido ou confirmado (seção 2) | contagem e soma de `payments.amount_cents` por trilha, categoria e prestador | `booking_events` (`to_status = 'paid'`), `payments.status/amount_cents/booking_id/quote_id`, `quotes.status` | ≥ 20 no D45 (O01, G2) | semanal | Q02 |
| P1 | **Parcela paga no app** (indício de vazamento) | Atendimentos de origem `platform` concluídos no período que têm pagamento recebido ou confirmado | pagos no app ÷ concluídos (só origem `platform`) | `bookings.origin/status`, `booking_events` (`completed`), `payments` | Sem meta no plano. Sinal de investigação: queda de 10 pontos em duas semanas seguidas `[proposta]`. Não há tática contra o cliente (O01, 10.4) | semanal | Q06 |
| P2 | **Conversão do teste do Pro** | Quem começou o teste (`trialing`) e virou pagante (`active`), ou não pagou ao fim (`past_due`) | virou ÷ (virou + não pagou ao fim do teste) | `audit_log` (`entity = 'subscriptions'`): `subscription.create` (`trial_days`), `subscription.status` (`from`/`to`) | Abaixo de 15% dos que chegaram ao fim: revisar o que o Pro entrega, não baixar o preço (DECISOES, seção 7) | semanal a partir do D34 | Q07 |
| P3 | **Churn mensal do Pro** | Pagante no início do mês que cancela ou entra em inadimplência no mês | cancelamentos do mês ÷ pagantes no início do mês | `audit_log` (`subscription.cancel`, `subscription.status` para `canceled`/`past_due`) | Acima de 5% no mês: revisar a entrega do Pro `[proposta]`. Subir o preço só depois de 100 pagantes com churn abaixo de 5% (DECISOES, D2) | mensal | Q08 |
| P4 | **Pagantes sobre aprovados** (conversão para Pro) | Pagantes ativos ÷ prestadores aprovados (estado atual) | `subscriptions.status = 'active'` ÷ `providers.status = 'approved'` | `subscriptions.status/provider_id`, `providers.status` | Abaixo de 3% após 90 dias com 100 ou mais prestadores grátis ativos: limite de propostas de 5 para 3 (DECISOES, D4). Aproximação: o denominador inclui os pagantes | mensal | Q07 (última linha) |
| C1 | **Custo por prestador aprovado e por serviço pago** (CAC) | (gasto de aquisição + horas do fundador × valor da hora) ÷ prestadores aprovados no período (ou serviços pagos) | fórmula ao lado; os numeradores ficam fora do banco | Denominadores: `audit_log` (`provider.status` de `draft`/`pending_review` para `approved`), Q02. Numeradores: planilhas `dinheiro` e `horas` (O01, 11.2) | Sem meta no repositório. O memorando do D45 fixa o teto `[proposta]` | D45 e mensal | Q11 + planilhas |
| I1 | **Incidentes** | Ocorrências com gravidade (O01, 11.1) | contagem por gravidade | planilha `incidentes` e `cuidado`; sinais do banco: suspensões e alertas da seção 1 (Q10) | Dano físico ou conduta grave: suspender o prestador e pausar a linha (O01, 13.4) | semanal | Q10 + planilha |
| V1 | **Violações de regra** | Promessa proibida, documento fora do app, dinheiro fora do Asaas (O01, 11.1). Só a parte de dinheiro aparece no banco | contagem | planilha `incidentes`; Q10 para alertas de dinheiro | 0 | semanal | planilha + Q10 |
| D1 | **Disputas** (coorte de pagos) | Atendimentos com pagamento confirmado no período que alguma vez foram para `disputed` | disputados ÷ pagos no período | `booking_events.to_status = 'disputed'`, `bookings.status`, `payments.status` | Abaixo de 10% (DECISOES, seção 4, item 4: condição da comissão). Fora da Fase 1 pelo O01, mas medida desde o D1 | semanal | Q10 |
| H1 | **Horas do fundador** | Soma das horas por semana, por categoria (R, O, D, C, E, P, M, A, B) | soma da planilha `horas` | planilha `horas` (não está no banco) | Teto de 60 h por semana. Duas semanas seguidas acima: corte (O01, 13.4 item 6 e 13.5) | diária e semanal | planilha (Q13 explica) |
| O1 | **Oferta por ocupação e distrito** (cobertura e freio) | Prestadores aprovados por ocupação e distrito, contra pedidos dos últimos 14 dias | contagem de aprovados e de pedidos por par | `provider_occupations.approved/registry_status`, `provider_neighborhoods`, `providers.status`, `requests` | Menos de 5 aprovados: recrutar reposição (O01, D24). 8 ou mais aprovados e menos de 3 pedidos em 14 dias: freio, não recrutar mais (O01, seção 4) | semanal | Q12 |
| F1 | **Funil de prestadores** | Etapas do O01, 5.2 | contagem por etapa (acumulado) | `audit_log` (`provider.submitted`), `providers.status`, `availability`, `services`, `provider_neighborhoods`, `provider_clients`, `bookings` (`origin = 'own'`), `provider_payment_accounts.status`, `proposals`, `bookings`/`quotes` com pagamento | 50 aprovados no D45 (O01, 5.2). Agenda ativa: 5 dos 6 itens do banco | semanal | Q05 |
| A1 | **Alertas de dinheiro** | Entradas do `audit_log` que dizem que o dinheiro saiu do esperado | contagem por tipo; "em aberto" = sem tratamento depois | `audit_log.action` (`payment.refund_failed`, `payment.received_after_cancel`, `payment.void_paid`, `payment_event.failed`, `payment_event.unverified`) | 0 em aberto. Qualquer alerta pausa o fluxo afetado até a causa (O01, 13.4 item 2) | semanal e a cada alerta | Q10 |

---

## 2. Portões G1 a G4 (O01, seção 5.1)

As metas vêm do O01. As definições operacionais abaixo são as do banco. Cada portão é verde quando a consulta indicada atinge a meta.

### 2.1 Definições

| Portão | Meta | Conta | Não conta | Janela | Consulta e linha |
|---|---|---|---|---|---|
| **G1** | ≥ 30 prestadores ativos em cada uma das semanas 5 (07/12 a 13/12) e 6 (14/12 a 20/12) | Prestador **aprovado** com ao menos um evento de agenda na semana ISO (segunda a domingo, horário de São Paulo): (a) `booking_events` com `actor_id` = prestador (criou, aceitou, iniciou ou concluiu um atendimento); (b) `availability.created_at` (horário cadastrado); (c) `time_off.created_at` (folga cadastrada). Semana sem linha conta como zero | Ação de cliente; eventos de atendimentos de contas de teste (cliente ou prestador na lista); plantão do Cuidado (`shifts`), que não é agenda; evento feito por você no aparelho do prestador | D1 a D45 | Q04: linhas `2026-12-07` e `2026-12-14` |
| **G2** | ≥ 20 serviços pagos pela plataforma (acumulado até o D45) | Atendimento ou orçamento aceito com ao menos um pagamento `received` ou `confirmed`. Conta uma vez por serviço. Reembolso ou estorno tira o serviço (o status deixa de ser recebido) | Testes de R$ 1,00; contas de teste; você, familiares, funcionários e o próprio prestador como pagador (a lista de contas é da planilha, porque CPF não está no banco); plantões do Cuidado; divisão de um serviço em vários pagamentos | D1 a D45 | Q02: soma das linhas |
| **G3** | ≥ 70% dos pedidos válidos com proposta em até 2 h, com no mínimo 30 pedidos válidos | Pedido válido: categoria de lançamento, distrito do piloto, criado na janela, sem conta de teste, sem status `canceled`. Relógio: `requests.created_at`, ou a abertura da janela de atendimento se chegou fora dela (seg. a sex. 8h a 17h30; sáb. 8h a 14h; domingo abre na segunda 8h). Proposta: `proposals.created_at` | Pedido de ensaio; pedido cancelado pelo cliente; pedido sem resposta sua a uma pergunta por 2 h (registre o motivo na planilha). Trilha B (orçamento e cobrança pela conta do prestador) não tem pedido no banco: vai na planilha `pedidos` | D22 a D45 (30/11 a 23/12) | Q03: linha `TOTAL` |
| **G4** | ≥ 3 famílias na linha Cuidado | Casa (`households`) com ao menos um plantão `completed` no período, com check-in `in` e check-out `out` (`checkins`) e relatório do dia (`daily_reports`) | Casa de teste ou de familiar seu; incidente grave aberto (não está no banco: confira a planilha `cuidado` antes de contar) | D1 a D45 | Q09: primeira linha |

**Regra de conta (O01, 13.3).** g = número de portões verdes. Um portão não testado por falta de P11 sai da conta. m = menor percentual da meta entre os portões que não ficaram verdes (G1: prestadores ÷ 30; G2: serviços ÷ 20; G3: percentual ÷ 70; G4: famílias ÷ 3).

### 2.2 Como ler G3

- O banco mede o **teto**: conta toda proposta do pedido. O banco não guarda se a proposta diz "quando pode ir" (o critério de "qualificada" do O01). Confira uma amostra de 10 propostas por semana na planilha.
- Feriados não são descontados do relógio. Em feriado, ajuste na planilha.
- Q03 usa `janela_g3` (padrão 30/11). Para o acumulado desde o D1, rode com `janela_g3=2026-11-09`.

### 2.3 Diferenças em relação ao O01 (o O01 deve ser corrigido)

1. **G1, "atendimento criado por ele"**: o O01 cita `bookings.created_at`, mas `bookings` não guarda quem criou. O quem está em `booking_events.actor_id`, gravado pelo trigger de histórico em todo `INSERT` e `UPDATE` de status (`private.log_booking_status`, `20261019000005_bookings.sql`).
2. **G1, contas de teste**: o O01 exclui contas de teste. Aqui também saem os eventos de atendimentos de conta de teste, porque o prestador real que atende um teste não faz agenda de verdade.
3. **P1 (parcela paga)**: o O01 não diz a origem. Aqui vale só a origem `platform`: o CRM do próprio prestador não é o marketplace.
4. **Estrela (E)**: o O01 não define o indicador mensal. A estrela exige conclusão; G2 exige só pagamento.
5. **D1 (disputa)**: o O01 diz "atendimentos `disputed`". Aqui é a coorte de pagos, que é o denominador do DECISOES, seção 4.

---

## 3. Fases e portões

**Atenção com a palavra "fase".** O repositório usa "fase" em dois sentidos: fase de construção (`ARQUITETURA.md`: prerender de SEO e assistente de IA são "fase 3") e fase de lançamento (O01: "Fase 1" é o concierge de 45 dias). Este documento usa o segundo.

**Confirme antes de usar:** o plano estratégico privado não estava acessível (O01, 16.3). As fases 2 e 3 abaixo são a sequência que os documentos do repositório permitem: o "continuar" do O01 (13.3) abre "segundo conjunto de distritos ou novas categorias"; o DECISOES coloca a comissão e o pagamento retido depois. `[incerto: confirmar com o plano privado]`.

| Fase | Objetivo | Portões e limiares | Consultas | Quando decidir |
|---|---|---|---|---|
| **1. Concierge de 45 dias** (D1 09/11/2026 a D45 23/12/2026) | Provar o ciclo completo com dinheiro real, uso semanal da agenda e demanda | G1 ≥ 30 nas semanas 5 e 6; G2 ≥ 20 acumulados; G3 ≥ 70% com ≥ 30 pedidos válidos; G4 ≥ 3 famílias (só com P11 verde) | Q04, Q02, Q03, Q09 | D45, pela regra da seção 5 (O01, 13.3) |
| **2. Ampliação de território e categorias** (só se a Fase 1 disse "continuar") | Crescer a oferta e a demanda sem mexer em dinheiro | Novo distrito: 2 semanas seguidas com G3 ≥ 70% e ≥ 8 pedidos válidos por semana (O01, 3.4) `[proposta: vem do O01]`. Nova categoria: ≥ 5 aprovados na ocupação e no distrito e ≥ 3 pedidos em 14 dias `[proposta]` | Q03, Q03b, Q12 | Por distrito ou categoria, com o mesmo semáforo |
| **3. Dinheiro na plataforma e Cuidado aberto ao público** | Comissão, depois pagamento retido; menu Cuidado divulgado | Comissão: os cinco portões de DECISOES, seção 4 (parecer escrito; split real de R$ 1,00 conferido no painel do Asaas; termos e política publicados; ≥ 20 serviços pagos com menos de 10% em disputa; cadastro fiscal coletado). Pagamento retido: parecer, instituição autorizada fazendo a custódia e ≥ 12 meses de operação. Cuidado: pessoa jurídica aberta, seguro de responsabilidade civil cotado, parecer trabalhista e ≥ 3 famílias atendidas em modo concierge (DECISOES, seção 5) `[CONDICIONAL: depende de parecer]` | Q02 (serviços pagos), Q10 (disputas), Q07 e Q08 (Pro), Q09 (famílias) | Só com todos os itens. Nenhum número do banco substitui parecer |

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

### 5.1 Regra do D45 (O01, 13.3)

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
| G3 entre 50% e 69% | Proposta lenta | Acionar 5 prestadores em vez de 3, encurtar a janela de resposta, trocar quem responde devagar (O01, CP3) |
| G3 abaixo de 35% no CP3 | Demanda sem oferta (risco R8) | Reserva de 3 a 5 prestadores por categoria; recusar pedido fora do escopo (O01, risco R8) |
| G3 com menos de 30 pedidos válidos | Amostra pequena | "Sem prova": não decide. Acumule até o próximo CP |
| Alerta `freio` em Q12 | Oferta acima de 8 sem pedidos | Parar de recrutar naquela ocupação e distrito |
| Alerta `reposicao` em Q12 | Menos de 5 aprovados | Recrutar reposição (O01, D24) |
| Parcela paga no app caindo | Possível combinação por fora, ou pagamento que falha | Investigar antes de agir. Facilitar o link e o histórico; não adotar tática hostil (O01, 10.4) |
| Conversão do teste abaixo de 15% | O Pro não entrega o que promete | Revisar a entrega do Pro. Não baixar preço (DECISOES, seção 7) |
| Churn acima de 5% no mês | Pagantes saem | Revisar a entrega do Pro `[proposta]`. Não subir preço (DECISOES, D2) |
| Pagantes sobre aprovados abaixo de 3% depois de 90 dias com 100 ou mais grátis | Conversão fraca | Baixar o limite de propostas de 5 para 3 (DECISOES, D4). Se menos de 30% dos aprovados enviarem a primeira proposta, subir para 8 |
| Disputa da coorte de 10% ou mais | Problema de qualidade | Não ligar comissão (DECISOES, seção 4). Rever o caso a caso com O07 |
| Alerta de dinheiro em aberto | Dinheiro fora do esperado | Pausar o fluxo afetado (`docs/operacao` I04 explica como desligar) até entender a causa (O01, 13.4 item 2) |
| Violação de regra (meta zero) | Promessa, documento ou dinheiro fora do app | Registrar na planilha `incidentes`, corrigir o material, reler a regra (O01, 11.1) |
| Horas acima de 60 em duas semanas seguidas | Teto estourado | Corte da seção 13.5 do O01 |
| CAC sem meta | Custo ainda não medido | Calcular uma vez no D45 e fixar teto no memorando `[proposta]` |

### 5.3 Gatilhos imediatos (qualquer dia, O01, 13.4)

1. Incidente com dano físico ou conduta grave: suspender o prestador em `/admin/prestadores/:id` (motivo obrigatório) e pausar a linha. Avisar advogado e seguradora.
2. Divergência de dinheiro (cobrança em duplicidade, split divergente, valor errado): pausar o fluxo afetado.
3. Acesso indevido a documentos: plano de incidente (L08) `[CONDICIONAL: depende de parecer]`.
4. Notificação formal de conselho, autoridade ou órgão de defesa do consumidor: pausar a categoria envolvida e consultar o advogado `[CONDICIONAL: depende de parecer]`.
5. Gasto acima de 120% do orçamento do O01 (seção 14): congelar os gastos opcionais `[proposta]`.
6. Mais de 60 h por semana em duas semanas seguidas: corte de escopo.

---

## 6. O que o banco não vê

| Limite | Efeito | O que fazer |
|---|---|---|
| Trilha B (orçamento e cobrança pela conta do prestador) não tem pedido nem proposta no banco | G3 da trilha B não entra em Q03 | Planilha `pedidos` (O01, 11.2) |
| `payments` não guarda a data de recebimento | Orçamento usa `payments.updated_at` (aproximação). Atendimento usa o evento `paid`, que é exato | Quando houver recebimento datado, trocar a aproximação |
| Orçamento aceito não tem etapa de conclusão | A estrela conta orçamento pelo pagamento | Registrar a conclusão na planilha por ora |
| Proposta não guarda "quando pode ir" | G3 é um teto | Conferir amostra semanal (seção 2.2) |
| Não há data de aprovação de prestador | A primeira aprovação vem do `audit_log` | Já coberto por Q11 |
| Assinatura guarda só o estado atual | Churn e conversão dependem do `audit_log` | Já coberto por Q07 e Q08; `subscription.cancel` não guarda o estado anterior |
| "Aprovado" é o estado atual de `providers.status` | G1 e o funil não têm histórico de aprovação | Aceitar como aproximação até o fim do D45 |
| Incidente grave e "família com incidente aberto" | Não estão no banco | Planilha `incidentes` e `cuidado` |
| Contas de teste | Só os `user id` de `contas_teste` saem. CPF não é conferido | Manter a planilha `contas_de_teste` completa (O01, 11.3) |
| Feriados | O relógio do G3 não os desconta | Ajustar na planilha |
| Horas e gastos | Não estão no banco | Planilhas `horas` e `dinheiro` |

---

## 7. O que foi conferido

**Execução no banco local** (PostgreSQL 17.11, `127.0.0.1:54322`, base `postgres`):

- O arquivo inteiro rodou sem erro, com as variáveis padrão, dentro de `BEGIN READ ONLY ... ROLLBACK`. O banco local está vazio de pedidos, perfis e prestadores (96 bairros e 1.710 ocupações da semente). Todas as consultas devolveram linhas vazias ou zero, como esperado.
- Um `CREATE TABLE` dentro da transação de leitura falha ("cannot execute CREATE TABLE in a read-only transaction"). A proteção funciona.
- O banco local tem migrações de outras frentes que não estão neste branch (`booking_reminders`, `admin_settings_and_metrics`, `product_events`). As consultas usam só tabelas das migrações 01 a 11 deste branch.

**Teste lógico com dados sintéticos.** Copiei 20 tabelas para o schema temporário `kpi_fx` (com `LIKE`), inseri cerca de 250 linhas (prestadores, pedidos, atendimentos, pagamentos, assinaturas, casas, plantões e auditoria) e rodei todo o `kpis.sql` dentro de uma transação terminada em `ROLLBACK`. Nenhuma tabela de `public` foi escrita. Os resultados batem com os valores que calculei à mão, com duas contas de teste excluídas. O teste apontou uma falha, corrigida antes de fechar (Q04 contava eventos de atendimentos de conta de teste). Outras três correções saíram de revisão, antes do teste: a contagem de cadastros (Q05) não excluía contas de teste; a visão semanal do Cuidado (Q09) não excluía cuidadores de teste; e a coorte de disputas e o custo (Q10 e Q11) contavam pagamento reembolsado.

**Não conferido:**

- Desempenho com volume real. Não há dados reais.
- Os textos de auditoria que o webhook grava com dados reais (`subscription.status`, `payment.refund_failed`). Li o código de `asaas-webhook/handler.ts` e `subscriptions-manage/handler.ts`, mas não rodei contra o Asaas.
- Horário de verão e feriados (o relógio do G3 não desconta feriados).
- Saída em CSV com `psql --csv` (a linha `BEGIN` aparece no arquivo).
- psql anterior à versão 10 (o arquivo usa `\if`).

---

## 8. Pendências e lacunas

### 8.1 Correções ao O01

1. Seção 5.1, G1: trocar "atendimento criado por ele (`bookings.created_at`)" por "evento de atendimento com `booking_events.actor_id` = prestador".
2. Seção 5.1, G1 e P1: incluir as exclusões da seção 2.3 deste documento.
3. Seção 11.1: a parcela paga no app vale só para origem `platform`.
4. Seção 16.1, item 8: o admin não mede agenda nem tempo de resposta, o que é verdade; a consulta de agenda desta página é feita pelo `kpis.sql`.

### 8.2 Lacunas do produto (não corrigidas aqui)

1. Não há data de recebimento em `payments` (só `updated_at`). Orçamento depende de aproximação.
2. Orçamento aceito não tem estado de conclusão (`quotes.status` não vai além de `accepted`).
3. Não há data de aprovação em `providers`. A primeira aprovação só existe no `audit_log` (`provider.status`).
4. Assinatura não tem histórico de estados. `subscription.cancel` não guarda o estado anterior (`from`).
5. Proposta não tem campo estruturado de disponibilidade ("quando pode ir").
6. O evento de "pedido novo" não avisa o prestador: ele só vê o pedido ao abrir `/pro/pedidos` (O01, 16.1 item 2).
7. A medição de eventos de produto (`product_events`, com `admin_funnel_daily`) existe em outra frente de trabalho e no banco local, mas não está neste branch. Quando entrar, pode dar datas exatas de recebimento e de primeira proposta. `[PLANEJADO]`.
8. `ARQUITETURA.md` usa "fase" com sentido de construção, e o O01 com sentido de lançamento. Padronizar o termo.
9. A lista de contas de teste é uma planilha. Nenhuma consulta a acessa; se a planilha não for completa, as métricas saem inflados.

### 8.3 Pendências da conferência

- Confirmar com o plano estratégico privado os nomes e os limiares das fases 2 e 3 (seção 3).
- Rodar `kpis.sql` com dados reais no primeiro ensaio (O01, P10) e comparar a planilha com o banco (O01, 11.3, item 3).
- CSV: decidir se o `BEGIN` e o `ROLLBACK` devem sair da saída.

CI footprint: PRs opened=0; PR heads pushed=0; dispatches=0; runs cancelled=0.

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
