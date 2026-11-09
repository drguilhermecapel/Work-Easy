# Manual operacional do WorkEasy Cuidado

> **Rascunho para revisão de advogado. Não é parecer jurídico.** Parte das regras também precisa da revisão de um(a) enfermeiro(a) com registro no COREN. Nada aqui é orientação clínica nem promessa de resultado.

| | |
|---|---|
| Versão | 2026-10-rascunho, escrita em 23/10/2026; revisada em 08/11/2026 (ver seção 19, reabertura de fontes) |
| Para quem | O dono (operador único) e quem ele indicar para tocar a escala |
| Estado do produto | Protótipo **não implantado**, sem usuários reais. A linha existe no código (casas, plantões, ofertas, entrada e saída, relatório do dia) e foi testada só contra o banco local |
| Estado da linha | **Fechada ao público** (`docs/DECISOES.md`, D12). Este manual serve para operar em modo concierge com 3 famílias e para cumprir os portões da seção 17 |
| Linha | Não clínica: companhia e apoio à vida diária de pessoas idosas, em casa, por plantão |

**Se você tem 10 minutos:** leia as regras da seção 1.2, o quadro "Pode" e "Nunca" da seção 3.2, o protocolo da seção 10 e o cartão do Anexo C. O resto é consulta.

**Como ler.** As afirmações sobre o produto vêm do código e de `docs/ARQUITETURA.md` (tabelas, funções e telas citadas pelo nome real); o que não consegui conferir está marcado. Marcas usadas:

| Marca | Significa |
|---|---|
| **[PLANEJADO]** | Não existe no produto hoje |
| **[CONDICIONAL: depende de parecer]** | Só vale depois da opinião do advogado (ou do enfermeiro, quando dito) |
| **[estimativa]** | Número ou juízo do plano, não medido |
| **[proposta]** | Regra de negócio sugerida por este manual; o dono decide e pode mudar |
| **[incerto]** | Não consegui abrir a fonte primária ou ela não responde a pergunta |
| **[F00]** | Fonte aberta nesta sessão, listada na seção 19 com endereço, trecho e data |

---

## Sumário

1. Resumo de uma página e regras que não se dobram
2. O que o produto faz hoje na linha Cuidado
3. Definição do serviço e limites duros
4. Ciclo do plantão: no produto e na operação
5. Reposição quando o cuidador cancela (cobertura)
6. Seleção de cuidadores e antecedentes
7. Orientação do primeiro plantão
8. Ficha de entrada da família
9. Relatório do dia (modelo)
10. Protocolo de emergência
11. Incidentes: categorias e registro
12. Trava de 2 dias e Plano Gestão
13. Seguro de responsabilidade civil
14. Referência de preço (uso interno)
15. Proposta a hospitais
16. Métricas de qualidade e rotina de operação
17. Portão de abertura ao público
18. Pontos para o advogado e para o enfermeiro; problemas do produto
19. Fontes consultadas
- Anexo A: consultas SQL (somente leitura) e duas correções administrativas
- Anexo B: mensagens prontas
- Anexo C: cartão de emergência para imprimir
- Anexo D: caderno de incidentes (colunas)

---

## 1. Resumo de uma página e regras que não se dobram

### 1.1 O que é

WorkEasy Cuidado organiza **plantões de cuidadores independentes** para a casa de uma família que cuida de uma pessoa idosa. O cuidador faz companhia e apoia a rotina (comer, higiene com a pessoa colaborando, andar, passear, lembrar horários). **Não faz nada que seja ato de enfermagem, não decide nada de saúde e não administra remédio.** A família cria o plantão, convida cuidadores aprovados, o primeiro que aceita fica com ele, entra e sai com registro de horário, e escreve um relatório do dia em texto simples. O WorkEasy não é empregador do cuidador **[CONDICIONAL: depende de parecer]** e não presta cuidado de saúde.

Hoje o dinheiro do plantão **não passa pelo WorkEasy**: a tela diz "o acerto é direto entre vocês". A margem de R$ 80 a 90 por plantão do plano (seção 14) só existe depois de construir cobrança e repasse e de ter parecer.

### 1.2 As 12 regras que não se dobram

| # | Regra | Por quê / onde |
|---|---|---|
| 1 | **Nada de ato de enfermagem.** Injeção (inclusive insulina), soro, curativo, sonda, estoma, aspiração, oxigênio, nebulização, glicemia, escara e qualquer procedimento técnico ficam fora, mesmo com receita e mesmo se a família pedir | Seção 3.2 [F01][F02][F07] |
| 2 | **Ninguém administra medicamento.** No máximo o cuidador lembra o horário e entrega à pessoa a dose que a família (ou um profissional de saúde) já separou, se a pessoa toma sozinha. Nunca prepara, nunca decide, nunca dá "se necessário" | Seção 3.3 **[CONDICIONAL: depende de parecer]** |
| 3 | **Urgência: 192 na hora, antes de qualquer outra ligação.** Depois avisa a família e o operador. Sem julgamento clínico | Seção 10 [F20] |
| 4 | **Sem dado de saúde no app.** O filtro do app é uma lista de palavras, não uma garantia; o banco só limita o tamanho do texto | Seção 2 (`services/care.ts`) |
| 5 | **A trava de 2 dias por semana não se muda sem parecer.** `labor_lock_days_per_week` está na tela de configurações do admin; não mexa | Seção 12 [F13] |
| 6 | **Só aprovar ocupações do escopo** (quadro 3.5). O banco trata como "cuidado" qualquer ocupação com unidade "plantão": são 67, entre elas médicos e técnicos de enfermagem | Seção 2 |
| 7 | **Nenhum dinheiro, cartão, senha ou Pix da pessoa cuidada passa pela mão do cuidador**, salvo compra com lista escrita e recibo | Seção 3.4 [F14 art. 102] |
| 8 | **Endereço completo só depois que o cuidador aceitou**, por mensagem direta, nunca nas observações do plantão (o cuidador as lê antes de aceitar) | Seção 7 |
| 9 | **O app não avisa a família** quando o cuidador aceita, cancela, entra, sai ou envia o relatório. Quem avisa é você | Seção 2 |
| 10 | **Incidente é registrado no mesmo dia**, em caderno fora do app (o app não tem registro de incidente) | Seção 11 |
| 11 | **Não prometa** garantia, selo de aprovação, proteção do pagamento, prazo ou resultado. Use "conferido", "informado, não verificado", "tentamos repor". A lista de frases que o app recusa está em `test/claims-guard.test.ts` | CDC art. 30 [F18] |
| 12 | **Não divulgue a linha antes do portão** (seção 17). O item "Cuidado" já aparece no menu de todo cliente logado; não há como escondê-lo hoje | `components/navItems.ts` |

### 1.3 O que falta para abrir ao público (D12, resumo)

Pessoa jurídica aberta; seguro de responsabilidade civil cotado; advogado trabalhista validando o fluxo e a trava de 2 dias; pelo menos 3 famílias atendidas em modo concierge, com você (ou alguém seu) no controle da escala. Detalhe e evidências na seção 17. **Nenhum desses itens está cumprido hoje.**

---

## 2. O que o produto faz hoje na linha Cuidado

Conferido no código em 23/10/2026 (`supabase/migrations/20261019000009_care.sql`, `20261019000008_notifications.sql`, `services/care.ts`, `pages/cuidado/*`, `pages/pro/Plantoes.tsx`, `components/cuidado/*`). Sem backend configurado, as telas mostram um aviso de demonstração e não guardam nada.

| Capacidade | Hoje | Onde está | O que isso exige de você |
|---|---|---|---|
| Casa e pessoa cuidada | **Feito.** Casa: nome, bairro, observações. Pessoa: primeiro nome (sem sobrenome), ano de nascimento, preferências, contato de emergência | `households`, `care_recipients`; `/cuidado` | Sem endereço, sem dado de saúde. O contato de emergência **só a família e o admin leem**: o cuidador não lê `care_recipients` |
| Criar plantão | **Feito, só pelo dono da casa.** Dia, início, fim (máximo 24 h e no futuro, regra do app), valor, observações. Fim antes do início vira plantão noturno (termina no dia seguinte) | `shifts_insert_own`; `ShiftForm` | A família cria (você pode acompanhar a tela). O admin **não** cria plantão pelo app |
| Oferecer | **Feito.** Até 10 cuidadores por plantão; 30 ofertas novas por dia por família (admin não tem o limite diário). Só vai a cuidador aprovado em ocupação de cuidado | `offer_shift`; `CaregiverSearch` | Para passar de 10 ofertas, crie outro plantão igual e cancele o antigo |
| Aceite | **Feito.** O primeiro que aceita leva; as outras ofertas expiram. Passa pela trava e pela sobreposição de horário | `accept_shift_offer` | — |
| Contato entre família e cuidador | O banco libera a leitura do perfil (inclusive telefone) de um lado pelo outro **depois do aceite**, mas **nenhuma tela de cuidado mostra** o telefone ou o nome da família ao cuidador; a família vê só o nome de exibição do cuidador | `private.shares_contact`; `PlantaoDetalhe`, `pages/pro/Plantoes.tsx` | Você passa os telefones por mensagem, depois do aceite |
| Aviso ao cuidador | Mensagem `plantao_oferecido` (WhatsApp) **só se** o WhatsApp estiver configurado e o contato confirmado; sem credencial, a linha fica `skipped` | `notifications`, `notify-dispatch` | Hoje, avise cada cuidador por mensagem sua |
| Aviso à família | **Não existe.** Aceite, cancelamento, entrada, saída e relatório não geram mensagem. A tela diz "volte a esta tela para ver quem aceitou" | Lista de gatilhos em `ARQUITETURA.md` | Você avisa. **[PLANEJADO]** |
| Lembrete 24 h antes | **Não existe para plantão** (só para atendimentos agendados) | `08_notifications.sql` | Você lembra os dois lados |
| Entrada e saída | **Feito.** Entrada de 2 h antes a 2 h depois do início; saída de 2 h antes a 2 h depois do fim; localização opcional (marcar a caixa grava o consentimento `location`; sem consentimento vigente, a entrada ou a saída é registrada sem coordenadas) | `check_in`; `CheckinPanel` | Fora da janela o app recusa (`checkin_window`) e o plantão fica parado |
| Falta do cuidador | O estado `no_show` existe e a tela mostra "Cuidador não compareceu", mas **nada no produto o grava** | enum `shift_status` | Anexo A.11 |
| Relatório do dia | **Feito.** 4 campos de texto (refeições, atividades, humor, observações), um relatório por plantão, só depois da entrada; reenviar substitui o anterior | `submit_daily_report`; `ReportForm` | Seção 9 |
| Filtro de saúde | **Heurística no app**: recusa palavras como diagnóstico, remédio, dose, febre, vômito, pressão, exame. O banco **não** confere | `findHealthTerm` em `services/care.ts` | Nunca diga que o app "impede" dado de saúde |
| Cancelar | Cuidador: **só antes da entrada** (plantão designado); o plantão volta a aberto, ou a oferecido quando há ofertas dos outros convidados para reativar, e elas são reativadas. Família ou admin: vira `canceled`. Depois da entrada o cuidador não cancela pelo app | `cancel_shift` | Seção 5 |
| Trava de dias | **Feito no banco, sempre nos plantões.** Padrão 2 dias diferentes por semana ISO (segunda a domingo, horário de São Paulo), mesmo cuidador, mesma casa ou mesmo dono. **Plantão que cruza a meia-noite conta 2 dias** | `check_labor_lock` | Seção 12 |
| Pagamento do plantão | **Não passa pelo WorkEasy.** O formulário grava o mesmo valor em `rate_cents` (cobrado) e `caregiver_payout_cents` (repasse): não há margem no código | `ShiftForm`, `createShift` | Seção 14 |
| Avaliação do plantão | **Não existe.** `reviews` exige atendimento pago pelo app | `07_quotes_reviews.sql` | Pesquisa pós-plantão por mensagem (Anexo B) |
| Tela de admin para casas e plantões | **Não existe.** O admin lê tudo por RLS e `offer_shift`/`cancel_shift` aceitam admin; a tela da família (`/cuidado/plantoes/:id`) deve funcionar para o admin, **a confirmar na stack real** | políticas `is_admin()` | Consultas do Anexo A |
| Registro de incidente | **Não existe** | — | Caderno do Anexo D |
| Ocupações de cuidado | `private.is_care_occupation` é verdadeiro quando a política da ocupação tem a unidade de preço `plantao`. São **67** ocupações (inclui anestesiologista, técnico de enfermagem, home care, vigia, salva-vidas...) | `20261019000003_providers.sql`; `catalog/policies.json` | Quadro 3.5: só aprove as do escopo |
| Documentos do cuidador | Documento com foto e selfie, CPF ou CNPJ e certidão de antecedentes, enviados ao bucket privado e **conferidos por uma pessoa**. O app não faz reconhecimento facial nem consulta base oficial. `expires_at` existe na tabela, mas nenhuma tela o preenche e nada bloqueia certidão velha | `provider_documents`; `/admin/prestadores/:id`; `README.md` | Seção 6 |
| Menu | O item "Cuidado" aparece para qualquer cliente logado | `components/navItems.ts` | D12 manda não divulgar |

---
## 3. Definição do serviço e limites duros

> **Revisão de 08/11/2026.** As leis e normas citadas nesta seção (Lei 7.498, Decreto 94.406, LC 150, Estatuto da Pessoa Idosa, CP, Lei 13.146, LGPD e CDC) não puderam ser reabertas hoje, porque planalto.gov.br recusou o acesso. COFEN, COREN-SP e COREN-DF (F03, F04, F06, F07, F12) também não abriram. Todas as citações literais dessas fontes, em todo o manual, valem como **[incerto]** até conferência (seção 19).

### 3.1 O que o WorkEasy é e não é nesta linha

| É | Não é |
|---|---|
| Organizador de escala: a família cria o plantão e convida cuidadores aprovados | Empregador do cuidador **[CONDICIONAL: depende de parecer]** |
| Quem confere documentos do cuidador antes de aprová-lo (conferência humana, sem biometria) | Serviço de saúde, home care, clínica, agência de enfermagem |
| Quem registra horário de entrada e saída e entrega o relatório do dia à família | Quem supervisiona, treina em técnica ou responde clinicamente pelo cuidador |
| Operador de reposição quando o cuidador falta (seção 5) | Instituição de longa permanência (seção 3.7) |

O cuidador é profissional **independente**. Se a mesma pessoa for chamada para mais de 2 dias por semana na mesma casa, a relação pode virar vínculo doméstico (LC 150/2015, art. 1º) [F13]; por isso a trava (seção 12).

### 3.2 O que o cuidador pode, em que condição, e o que nunca faz

**Pode** (apoio à vida diária de pessoa que colabora; sem técnica):

| # | Atividade | Condição | Base |
|---|---|---|---|
| 1 | Companhia, conversa, leitura, música, jogos, estímulo a atividades e ao contato com a família | — | CBO grupos C e F (lista transcrita em [F08], de segunda mão); Manual do Cuidador, item 3, transcrito em [F07] |
| 2 | Apoiar higiene pessoal e banho de chuveiro, vestir, cuidar de unhas e cabelo | Pessoa colabora; sem técnica especial; sem ferida | COREN-SP 030/2022 (sobre acompanhante em unidade hospitalar; aplicar à casa é extrapolação **[incerto]**): "nada impede que realizem atividades conforme as descritas, desde que contratados pela família ou pelo paciente" [F06]. Atenção: o Decreto 94.406, art. 11, IV, lista higiene, conforto e "alimentá-lo ou auxiliá-lo a alimentar-se" também entre as atividades do auxiliar de enfermagem [F02, **incerto nesta revisão**]; o limite "sem técnica" existe por isso |
| 3 | Preparar e servir refeições, estimular líquidos, ajudar a comer pessoa que engole bem | Seguir restrições alimentares que a **família passou por escrito**; na dúvida, não servir e ligar | CBO grupo D [F08] |
| 4 | Apoiar a mobilidade: levantar, sentar, andar com bengala ou andador; prevenir queda arrumando o ambiente | Pessoa sustenta o próprio peso com ajuda leve | atividades da CBO A.4 e E.4 (não são anexos deste manual) [F08] |
| 5 | Acompanhar a passeios, consultas e exames | Só acompanha e leva informação **da família**; não recebe prescrição nem decide | Manual do Cuidador, item 4 [F07] |
| 6 | Tarefas da casa ligadas à pessoa: roupa dela, louça da refeição, arrumar o quarto | Não é faxina geral (outra ocupação) | CBO grupo E [F08] |
| 7 | Observar e **avisar a família** (apetite, sono, humor, queda, qualquer coisa diferente) | Aviso por telefone; no app, só o fato, sem palavra de saúde (seção 9) | atividades da CBO B.6, B.7 e B.14 [F08] |
| 8 | Acionar o 192 e seguir o médico regulador | Sempre que houver dúvida de urgência | [F20]; CP art. 135 [F15]; Estatuto art. 97 [F14] |
| 9 | Compras pequenas | Lista escrita da família, dinheiro da família, recibo e conta no mesmo dia | Regra deste manual **[proposta]** |

**Só com condição** — **[CONDICIONAL: depende de parecer de enfermeiro e advogado]**:

| Atividade | Condição |
|---|---|
| Lembrar o horário do remédio e entregar a dose já separada | Seção 3.3, inteira |

**Nunca**, mesmo com receita, mesmo se a família pedir e mesmo se o cuidador "já sabe fazer":

| # | O que | Base |
|---|---|---|
| 1 | Injeção de qualquer tipo (músculo, veia, sob a pele; **insulina e anticoagulante incluídos**); instalar ou trocar soro; puncionar | Manual do Cuidador, item 5: "Em caso de injeções, mesmo com receita médica, é proibido ao cuidador aplicá-las" [F07]; Decreto 94.406, art. 11, III, a [F02] |
| 2 | Dar remédio por qualquer via que não seja a oral (injetável, inalatória, nasal, retal, por sonda) | idem; PLC 11/2016 (vetado, não é lei) usava a mesma linha [F12] |
| 3 | Curativo, oxigênio, nebulização, enema; e, pela mesma lógica de procedimento técnico, cuidado de ferida ou escara, troca de bolsa de estoma, sonda vesical, gástrica ou nasogástrica, aspiração, traqueostomia, retirada de ponto | Decreto 94.406, art. 11, III, c e d [F02] para curativo, oxigenoterapia, nebulização e enema. Os demais itens entram por decisão da linha **[proposta]**; o Guia Prático do Cuidador (MS), transcrito em [F07], diz que o cuidador "não deve executar procedimentos técnicos que sejam de competência dos profissionais de saúde, tais como: aplicações de injeção no músculo ou na veia, curativos complexos, instalação de soro e colocação de sondas" |
| 4 | Medir e interpretar pressão, glicemia, temperatura ou saturação para decidir algo | Decisão da linha **[proposta]**. A CBO cita "observar sinais vitais" para a ocupação em geral [F08], mas esta linha é não clínica: quem mede é a família ou um profissional de saúde |
| 5 | Decidir ou mudar dose e horário, suspender, "dar mais um", orientar sobre doença, exame ou tratamento, interpretar resultado | Lei 7.498, art. 2º [F01] |
| 6 | Transferir pessoa que não sustenta o próprio peso, mudar de posição pessoa acamada, ajudar sozinho quem precisa de duas pessoas | Fora do escopo da fase 1 (seção 3.5) |
| 7 | Conter fisicamente, trancar, sedar ou "acalmar" com remédio | Estatuto da Pessoa Idosa, art. 4º: nenhuma pessoa idosa será objeto de negligência, violência, crueldade ou opressão [F14] |

> **Nota de honestidade.** O Guia Prático do Cuidador do Ministério da Saúde, como o COREN-DF o transcreve, lista também "cuidados com sonda vesical", "ostomia", "alimentação por sonda" e "úlcera de pressão" entre os cuidados do cuidador, e o próprio parecer do COREN-DF conclui o contrário: cuidadores "não devem executar atividades da equipe de Enfermagem no ambiente domiciliar" [F07]. As fontes divergem. Esta linha segue a mais restrita. Não consegui abrir o Guia no site do Ministério (a página recusou o acesso) [F26], então a citação é de segunda mão **[incerto]**.

### 3.3 Medicamento: a zona cinzenta, com a regra mais restrita

**O que cada fonte que abri diz:**

| Fonte | Trecho | O que significa |
|---|---|---|
| Decreto 94.406/1987, art. 11, III, a [F02] | Ao auxiliar de enfermagem cabe "ministrar medicamentos por via oral e parenteral" | Administrar remédio está na lista de atividades da enfermagem |
| Lei 7.498/1986, art. 2º [F01] | A enfermagem e suas atividades auxiliares "somente podem ser exercidas por pessoas legalmente habilitadas e inscritas no Conselho Regional" | Quem não é da enfermagem não exerce atividade de enfermagem |
| Manual do Cuidador da Pessoa Idosa (SDH, 2008), item 5, transcrito em [F07] | "Cuidar da medicação oral da pessoa idosa, em dose e horário prescritos pelo médico" | Tolera cuidar da medicação oral, sem dizer "administrar" |
| CBO 5162, atividade B.9, transcrita em [F08] | "Controlar guarda, horário e ingestão de medicamentos" | Controlar, não preparar nem decidir |
| COREN-DF, Parecer 006/2023, conclusão 4 [F07] | Cuidado de vida diária inclui "participar da terapêutica (medicação oral e tópica) prescrita pelos profissionais de saúde" | Participar, sob prescrição |
| COREN-DF, Parecer 006/2023, conclusão 5 [F07] | Cuidadores formais "não pertencem à categoria da Enfermagem" e "não lhes compete" as técnicas das profissões legalmente estabelecidas | Teto do que o cuidador faz |
| COFEN, Código de Ética (Res. 564/2017), art. 92 [F03] | Proíbe ao profissional de enfermagem "delegar atribuições ... para acompanhantes e/ou responsáveis pelo paciente"; o parágrafo único exclui o "autocuidado apoiado" em atenção domiciliar | Se houver enfermeiro na casa, ele não delega tarefa de enfermagem ao cuidador |
| COFEN, notícia de 25/05/2019 sobre o PLC 11/2016, depois vetado [F12] | "está proibido ao cuidador administrar medicamentos que não seja por via oral e com orientação por prescrição médica" | Mostra a direção do debate; o texto foi vetado, então **não é lei** |

**O que não encontrei:** nenhum texto de lei que autorize expressamente o cuidador contratado a "administrar" remédio, e nenhum que o proíba de lembrar o horário ou de entregar uma dose já separada. É zona cinzenta.

**Regra do WorkEasy Cuidado** (a mais restrita que essas fontes toleram) **[CONDICIONAL: depende de parecer]**:

1. **Quem prepara:** a família ou um profissional de saúde, num organizador ou embalagem identificada, com o horário escrito por eles (copiado da receita). O cuidador **não** abre cartela, não parte, não tritura, não mistura na comida e não conta gota.
2. **O que o cuidador faz:** avisa que é a hora, entrega a dose já separada e acompanha que a pessoa tomou. Anota "tomou" ou "não quis" na **folha de rotina de papel** que fica na casa (a palavra "remédio" é recusada pelo relatório do app).
3. **Pare e ligue para a família** (e 192 se for urgência) quando a pessoa não consegue tomar sozinha, recusa, cospe, vomita, engasga, tomou duas vezes, ou a dose ou o horário parecem errados. O cuidador **não decide**.
4. **Fora da linha:** remédio "se necessário", controlado, injetável, gotas que exigem contar, comprimido que precisa partir. A família administra ou contrata enfermagem.
5. **Ciência por escrito:** o item 3 do texto de aceite da família (seção 8.4) diz que o cuidador "não administra medicamento".

> Peça a um(a) enfermeiro(a) inscrito(a) no COREN que aprove ou corrija este texto **antes do primeiro plantão** e guarde a resposta por escrito.

### 3.4 Conduta, dinheiro e privacidade

| Regra | Por quê |
|---|---|
| Nada de dinheiro, cartão, senha, token ou chave Pix da pessoa. Compra só com lista da família e recibo | Estatuto, art. 102: "Apropriar-se de ou desviar bens, proventos, pensão ou qualquer outro rendimento da pessoa idosa" é crime [F14] |
| Não assinar documento, não receber procuração, não aceitar presente de valor, herança ou doação | Evita conflito e acusação |
| Não fotografar nem filmar a pessoa; não postar nada; não repassar foto por grupo | Dado pessoal e dignidade; dado de saúde é sensível (LGPD art. 5º, II) [F17] |
| Não levar visitas, não usar a casa para fins próprios, não dirigir veículo da família | Regra do manual **[proposta]** |
| Não esconder da família nenhum acidente, queda ou recusa | Seção 11 |
| Câmeras: a família avisa que existem e onde; câmera em banheiro e quarto de dormir, nunca | Regra do manual **[proposta]**; confirmar com o advogado |
| Conflito com a família ou mal-estar com o ambiente: sair do local e ligar ao operador | Segurança do cuidador |

### 3.5 Quem fica dentro e quem fica fora

**Ocupações que você pode aprovar** (`admin_set_occupation_approval`). Lembre: o banco chama de "cuidado" qualquer ocupação com unidade de preço "plantão".

| Ocupação (slug) | Escopo | Motivo |
|---|---|---|
| `cuidador-de-idosos` | **Sim, é o núcleo** | Política: sem registro profissional; exige documento com selfie, CPF/CNPJ e antecedentes; trava ligada; confiança `a_confirmar` |
| `acompanhante-hospitalar-idosos` | **Sim, na segunda etapa** | Seção 15; local domicílio ou estabelecimento; confiança `a_confirmar` |
| `folguista` | **Só como reposição** | Cobre folga de cuidador ou doméstica; trava ligada |
| `cuidador-pessoa-com-deficiencia` | Não na fase 1 | `audienceMinors: true` (pode atender menores): exige outra análise |
| `cuidador-de-acamados-pos-operatorio` | Não na fase 1 | A CBO diz que "elevado grau de dependência" exige formação na área de saúde [F05] |
| `baba`, `cuidadora-de-recem-nascido-puerpera`, `doula` | Não | Outro público |
| `tecnico-de-enfermagem`, `auxiliar-de-enfermagem`, `enfermagem-*`, `home-care`, médicos, psicólogos, nutricionistas, fisioterapeutas etc. | **Não** | Profissões reguladas ou empresa licenciada. Não os aprove em ocupação de cuidado: eles apareceriam na oferta de plantão |
| `porteiro-e-controle-de-acesso`, `bombeiro-civil...`, `vigia-noturno...`, `salva-vidas...`, `seguranca-pessoal...`, `recreador...` | Não | Também têm unidade "plantão", mas são outra linha |

**Pessoas e casas fora do escopo da fase 1** (a triagem da seção 8 aplica isto):

- precisa de **qualquer item "Nunca"** na rotina (injeção, curativo, sonda, oxigênio...). Encaminhar para home care licenciado ou enfermagem; eventualmente combinar companhia **só** se houver profissional de saúde responsável **[CONDICIONAL: depende de parecer]**;
- fica acamada, precisa de duas pessoas para levantar ou depende de ajuda em todas as atividades do dia (a RDC 502 chama isso de "grau de dependência III" no contexto de ILPI [F19]; a CBO manda classificar como técnico ou auxiliar de enfermagem [F05]);
- mais de uma pessoa idosa **sem parentesco** morando na casa, ou casa que recebe idosos pagantes (seção 3.7);
- risco de sair de casa sozinha e se perder, agressividade ou queda frequente: **só com ressalva**, cuidador experiente e conversa prévia com o dono **[proposta]**;
- a pessoa cuidada é criança ou adolescente: não é esta linha.

### 3.6 O que a lei diz e o que ela não diz

| Fonte | O que li | Efeito |
|---|---|---|
| Lei 7.498/1986, art. 2º e parágrafo único [F01] | "A enfermagem é exercida privativamente pelo Enfermeiro, pelo Técnico de Enfermagem, pelo Auxiliar de Enfermagem e pela Parteira" | A linha não pratica atividade de enfermagem |
| Decreto 94.406/1987, arts. 1º, 11 e 13 [F02] | Exercício privativo de inscrito no COREN; lista de atividades do auxiliar (medicamento oral e parenteral, curativo, oxigenoterapia...); tudo "sob supervisão, orientação e direção de Enfermeiro" | Define o que é "Nunca" |
| COFEN Res. 582/2018, art. 1º [F04] | "É vedado ao Enfermeiro o ensino de práticas de Enfermagem que exija aplicação de conhecimentos técnico-científicos" na formação de cuidador de idosos | O briefing do WorkEasy **não ensina técnica** |
| COREN-SP Parecer 004/2025 [F05] | "cuidadores não fazem parte de uma profissão regulamentada"; "não compete ao enfermeiro supervisionar ou responsabilizar-se pela atuação dos cuidadores de pessoas idosas"; na CBO, "elevado grau de dependência" exige formação na área de saúde | Nenhum enfermeiro "supervisiona" o cuidador da linha; casos de alta dependência ficam fora |
| COREN-SP Parecer 030/2022 [F06] | Em instituição de saúde com enfermagem, a atuação do cuidador "deve ficar restrita a 'acompanhante de pacientes'", contratado pela família; os acompanhantes "não podem e nem devem receber ou aceitar qualquer atividade delegada por nenhum dos profissionais da instituição" | Base da seção 15 |
| COREN-DF Parecer Técnico 006/2023 [F07] | "cuidadores não fazem parte de uma profissão regulamentada, tratando-se de uma ocupação com descrição na CBO"; "cuidadores não devem executar atividades da equipe de Enfermagem no ambiente domiciliar", com exceção de acompanhante ou responsável legal quando delegado, orientado, capacitado e supervisionado pelo enfermeiro | Limites da seção 3.2 |
| CBO 5162-10 (MTE), lida em segunda mão [F05][F08] (a consulta oficial pede reCAPTCHA [F25]) | Descrição sumária: "Cuidam de bebês, crianças, jovens, adultos e idosos, a partir de objetivos estabelecidos por instituições especializadas ou responsáveis diretos, zelando pelo bem-estar, saúde, alimentação, higiene pessoal, educação, cultura, recreação e lazer da pessoa assistida." A família "não compreende 3222 - técnicos e auxiliares de enfermagem" | É ocupação, não profissão. O cuidador não é classificado como pessoal de enfermagem |
| Mensagem 289/2019 e Veto 25/2019 [F09][F10] | O PLC 11/2016, que criava as profissões de cuidador, foi **vetado integralmente** ("por inconstitucionalidade", art. 5º, XIII da Constituição) e o veto foi **mantido em 02/10/2019** | **Não há lei da profissão**: nenhum requisito de curso, idade ou antecedentes é obrigatório por lei. Os requisitos da seção 6 são do WorkEasy |
| PL 76/2020, Senado [F11] | Em 23/10/2026: "Em tramitação"; último estado em 10/03/2026, "aguardando designação do relator" na Comissão de Assuntos Sociais | Reconferido em 08/11/2026 no Senado: mesmo estado, último registro em 10/03/2026. Pode mudar o quadro; reveja este item a cada trimestre. Outros projetos apareceram nas leituras: PL 731/2024 (unificado ao PL 1488/2024, sobre certidão de antecedentes de quem cuida de pessoa idosa) só pela notícia da Câmara [F23], e PL 203/2025, citado numa moção municipal juntada à página do PL 76/2020, sem que eu tenha identificado a casa legislativa. Nenhuma página de tramitação foi aberta **[incerto]** |
| Lei 13.146/2015, art. 3º, XII [F16] | "Atendente pessoal": quem presta "cuidados básicos e essenciais à pessoa com deficiência ... excluídas as técnicas ou os procedimentos identificados com profissões legalmente estabelecidas" | É a única redação em lei, que achei, da mesma lógica. Vale para pessoa com deficiência, não para toda pessoa idosa |

### 3.7 Casa, não instituição

A RDC 502/2021 da Anvisa trata da "Instituição de Longa Permanência para Idosos, de caráter residencial", definida como "domicílio coletivo de pessoas com idade igual ou superior a 60 (sessenta) anos" (art. 3º, VI), com alvará sanitário (art. 8º), Responsável Técnico de nível superior (arts. 10 e 11) e equipe com vínculo formal (art. 16) [F19]. O texto está marcado "Vigente" no AnvisaLegis.

Esta linha atende **a casa da própria família**, uma pessoa (ou um casal) por casa. Para não virar uma ILPI de fato:

- cadastre como "pessoa cuidada" só quem mora ali com a família ou a pessoa idosa que vive ali;
- não escale cuidadores para uma casa que receba vários idosos sem parentesco como moradores;
- se a família quiser levar a pessoa para morar em local coletivo, encaminhe a uma ILPI com alvará (consulta à vigilância sanitária do município **[incerto]**: não abri norma municipal).

---
## 4. Ciclo do plantão: no produto e na operação

### 4.1 Estados e transições (como o banco as faz)

```
aberto ──oferecer──▶ oferecido ──primeiro aceite──▶ designado ──entrada──▶ em andamento ──saída──▶ concluído
  │                      │                              │
  └────── família ou admin cancela ────────────────────┴──▶ cancelado
                                         cuidador cancela (só designado) ──▶ volta a aberto/oferecido
nunca gravado pelo produto: no_show
```

| Estado (código) | Texto na tela | Quem muda | Função no banco | O que o produto faz junto | Seu trabalho |
|---|---|---|---|---|---|
| `open` | Aberto, sem ofertas | Família cria; o banco força `open` e sem cuidador | `shifts_insert_own` + `guard_shift` | — | Escolher convidados (Anexo A.2) |
| `offered` | Oferecido a cuidadores | Família ou admin | `offer_shift` | Grava `shift.offered`; mensagem `plantao_oferecido` a cada cuidador novo (se o WhatsApp estiver ligado) | Avisar cada convidado por mensagem sua |
| `assigned` | Cuidador confirmado | Cuidador | `accept_shift_offer` | Primeiro aceite leva; demais ofertas viram `expired`; o banco passa a permitir que cada lado leia o perfil do outro (nenhuma tela de cuidado o mostra); grava `shift.accepted` | Avisar a família; passar os telefones; mandar o endereço ao cuidador; lembrete 24 h |
| `checked_in` | Em andamento | Cuidador | `check_in(..., 'in')` | Grava hora e, se autorizado, localização | Conferir início |
| `completed` | Concluído | Cuidador | `check_in(..., 'out')` | Grava hora da saída | Cobrar relatório; pesquisa pós-plantão |
| `canceled` | Cancelado | Família ou admin (aberto, oferecido ou designado) | `cancel_shift` | Ofertas abertas expiram; grava `shift.canceled` com o motivo | Se havia cuidador, avisá-lo |
| `open` ou `offered` de novo | — | Cuidador (só `assigned`) | `cancel_shift` | A oferta dele vira `declined`; as dos outros (`offered` ou `expired`) voltam a `offered` e **cada um recebe nova mensagem** | Seção 5 |
| `no_show` | Cuidador não compareceu | **Ninguém** | — | — | Anexo A.11 |

### 4.2 Linha do tempo de um plantão (T = hora de início)

| Quando | Quem | O que | Onde |
|---|---|---|---|
| Criação | Família (você acompanha, se preciso) | Dia, início, fim, valor combinado, pessoa cuidada, observações **sem endereço** | `/cuidado/plantoes` |
| Criação + 30 min | Você | Escolhe 3 a 6 cuidadores do banco (A.2); a família (ou você, como admin) oferece; você **avisa cada um** | `/cuidado/plantoes/:id` |
| Aceite | Você | Avisa a família (nome do cuidador); passa os telefones; manda ao cuidador endereço e acesso | WhatsApp |
| T − 72 h | Você | Plantão ainda sem cuidador? Ampliar convites (seção 5) | A.1 |
| T − 24 h | Você | Lembrete aos dois lados (B.2) | WhatsApp |
| T − 2 h até T + 2 h | Cuidador | Registra a **entrada** (a única janela que o banco aceita) | `/pro/plantoes` |
| T + 15 min | Você | Sem entrada? Ligar para o cuidador | A.1 "ATRASO" |
| T + 30 min | Você | Sem resposta: avisar a família e iniciar reposição | Seção 5 |
| T + 2 h | Você | A janela fechou: o app não aceita mais a entrada. Se o cuidador chegou, anote no caderno; se não, marque falta | A.1 "SEM ENTRADA"; A.11 |
| Durante | Cuidador | Relatório (só depois da entrada) | `/pro/plantoes` |
| Fim − 2 h até Fim + 2 h | Cuidador | Registra a **saída** | `/pro/plantoes` |
| Fim + 2 h | Você | Plantão ainda "em andamento"? Confirmar a hora real com os dois e encerrar | A.1 "SAÍDA NÃO REGISTRADA"; A.12 |
| Fim + 12 h | Você | Sem relatório? Cobrar o cuidador | A.7 (lista) |
| Dia seguinte | Você | Duas perguntas à família (B.7) | WhatsApp |

**Tempo de operador:** cerca de 10 a 15 minutos por plantão sem incidente **[estimativa]**. Meça nas duas primeiras semanas e ajuste a capacidade antes de pegar mais famílias.

### 4.3 Regras do relógio que pegam de surpresa

- **Chegou mais de 2 h depois do início?** O app recusa a entrada (`checkin_window`). O plantão continua `assigned` e continua contando na trava de dias.
- **Saída antecipada** (mais de 2 h antes do fim): o app não tem como registrar. O plantão fica "em andamento" até você encerrar (A.12). Depois da entrada o cuidador não cancela pelo app.
- **Plantão noturno** (cruza a meia-noite) conta **2 dias** na trava de dias e dá 1 noite por semana por cuidador na mesma casa (seção 12).
- **Mudar horário ou valor depois do aceite não dá**: o banco bloqueia. Cancele e crie outro plantão.
- **Ofertas expiram no início do plantão** (tarefa `workeasy-expire-stale`, a cada 15 minutos), mas o plantão continua "oferecido" ou "aberto", sem alerta. A fila A.1 mostra esse caso.

---

## 5. Reposição quando o cuidador cancela (cobertura)

### 5.1 O que se pode dizer à família

Hoje: **"Se o cuidador escalado não puder ir, nós tentamos repor e avisamos você."** Não escreva "garantia de cobertura", "reposição garantida" nem prazo de reposição em tela, anúncio ou mensagem.

Por quê: qualquer informação "suficientemente precisa" veiculada "obriga o fornecedor que a fizer veicular ou dela se utilizar e integra o contrato" (CDC, art. 30) [F18, **incerto nesta revisão**]; e quem promete a reposição passa a se parecer com o prestador do serviço, não com o intermediário (leitura deste manual; o advogado confirma): o CDC trata da responsabilidade do fornecedor de serviços sem culpa (art. 14), da solidariedade entre os responsáveis pelo dano (art. 25, § 1º) e da responsabilidade pelos atos de prepostos ou representantes autônomos (art. 34) [F18]. Uma "Garantia WorkEasy" (reexecução ou reembolso pela plataforma) é só uma ideia do plano: depende de parecer e de ligar o pagamento retido, que hoje está desligado (`docs/DECISOES.md`, seção 4); a política de cancelamento e reembolso trata do tema (`docs/juridico/04-politica-de-cancelamento-e-reembolso.md`) **[CONDICIONAL: depende de parecer e de ligar o pagamento retido]**.

Metas internas, só para você **[proposta]**: cobertura efetiva de pelo menos 95% dos plantões marcados nas primeiras 8 semanas (métrica A.3); toda falta ou cancelamento com menos de 6 h avisado à família até 30 minutos depois que você souber.

### 5.2 Banco de reserva

| Item | Regra **[proposta]** |
|---|---|
| Tamanho | Para cada casa com escala recorrente, pelo menos **2 cuidadores aprovados, com dia livre na semana naquela casa**; no geral, 1 reserva para cada 3 titulares |
| Quem entra | Cuidador aprovado em `cuidador-de-idosos` ou `folguista`, que já conheceu a casa ou aceitou ser reserva por escrito |
| Confirmação | Todo domingo à noite você pergunta quem está livre na semana (B.6) e atualiza a planilha do banco (nome, telefone, bairros, dias livres, última confirmação) |
| Pagamento por ficar de prontidão | **Não pague** sem parecer: disponibilidade remunerada aproxima a relação de um vínculo **[CONDICIONAL: depende de parecer]** |
| Quem cabe | Rode A.2 para o plantão: ele lista quem atende o bairro, quantos dias teria na semana, se cabe na trava e se já tem plantão no horário |

### 5.3 Escada de reposição (H = horas até o início, quando você fica sabendo)

| Situação | O que fazer | Prazo **[proposta]** |
|---|---|---|
| H ≥ 72 | O produto já reoferece sozinho aos convidados que não recusaram. Conferir se alguém aceitou; se não, rodar A.2 e convidar mais | Mesmo dia |
| 24 ≤ H < 72 | A.2 → ligar para os 3 melhores do banco. Avisar a família no mesmo dia: "estamos repondo" (B.3) | Ligações em 2 h |
| 6 ≤ H < 24 | Avisar a família; ligar para o banco; dar opções (reposição, familiar cobre, adiar) | Família em 30 min; reposição em 2 h |
| H < 6, ou **sem entrada em T + 30 min** | Avisar a família **na hora**; ela decide se espera, chama outro familiar ou cancela. A pessoa cuidada nunca fica sem que a família saiba | Telefone, não mensagem |

### 5.4 O que trava a reposição

| Trava | Efeito | Como lidar |
|---|---|---|
| Trava de dias (padrão 2 por semana) | Substituto que já tem 2 dias na semana naquela casa é recusado (`labor_lock`) | A.2 mostra `cabe_na_trava`. Prefira quem ainda não trabalhou ali na semana. **Nunca suba o limite** |
| Plantão noturno | Em regra, um cuidador cobre no máximo 1 noite por semana na mesma casa (seção 12.3) | Tenha reserva por noite |
| Sobreposição | Quem já tem plantão designado no horário é recusado (`slot_unavailable`) | A.2 coluna `sobreposto` |
| Limite de 10 ofertas por plantão | Passou do décimo, não convida mais | Crie outro plantão igual e cancele o antigo |
| Aprovação | Só cuidador aprovado em ocupação de cuidado recebe oferta | Fila `/admin/prestadores` |
| Reoferta automática | Quando o cuidador cancela, o produto reativa também as ofertas que tinham expirado, inclusive se o plantão já começou, e manda nova mensagem | Avise os reservas por mensagem: "só aceite depois de falar comigo" |
| Aviso à família | O app não manda | Mensagem sua (B.3) |

### 5.5 Se ninguém cobre

1. Fale com a família com franqueza (B.4): o que aconteceu, o que você já tentou, o que ela pode escolher.
2. Opções: outro horário no dia, outro dia, um familiar, outro cuidador de fora da plataforma (a família contrata por conta própria).
3. Registre no caderno (Anexo D), categoria "plantão sem cobertura". Cancele o plantão no app (como admin ou pela família), com motivo curto e **sem palavra de saúde**.
4. Dinheiro: nenhum valor do plantão passa pelo WorkEasy hoje, então a família não paga plantão que não aconteceu. Qualquer compensação é **[CONDICIONAL: depende de parecer]**.

### 5.6 Reincidência do cuidador **[proposta]**

| Ocorrência | Resposta |
|---|---|
| 1º cancelamento com menos de 24 h, ou atraso acima de 60 min | Conversa e registro no caderno |
| 2º em 90 dias | Pausa de 30 dias: `admin_set_occupation_approval(provider, 'cuidador-de-idosos', false, motivo)` |
| 3º, ou **falta sem aviso**, ou conduta fora do escopo | Suspensão: `admin_set_provider_status(provider, 'suspended', motivo)` e revisão do caso |

Cuidado: pausar ou suspender **não cancela** ofertas já abertas, e `accept_shift_offer` não confere a aprovação na hora do aceite. Antes de pausar alguém, avise-o por mensagem para não aceitar ofertas abertas e revise os plantões `assigned` dele: se ele puder, deve cancelar pelo app (o plantão volta para a fila de ofertas); se não puder, o cancelamento feito por você como admin encerra o plantão (`canceled`) e a família precisa criar outro, porque o admin não cria plantão.

**Alinhamento com os Termos do Prestador (rascunho).** `docs/juridico/02-termos-do-prestador.md` só prevê suspensão ou remoção por fraude, risco à segurança, quebra grave ou repetida de regra **depois de aviso**, ordem de autoridade ou pedido do próprio prestador (cláusula 17.1), com aviso por escrito e prazo para responder (17.3); a suspensão cautelar sem aviso prévio fica para fraude evidente, risco imediato à segurança ou ordem de autoridade, com aviso em até 2 dias úteis (17.4). A cláusula 15.5 diz que a linha Cuidado terá "regras próprias" antes de abrir. Por isso a escada acima só pode ser aplicada se essas regras próprias trouxerem cancelamento tardio e falta sem aviso como regra do plantão; a "pausa de 30 dias" é, na prática, uma suspensão da ocupação e segue o aviso do 17.3; e a pausa cautelar por conduta fora do escopo ou risco à pessoa cuidada se apoia no 17.4, com o motivo registrado **[CONDICIONAL: depende de parecer]**.

A multa ou o prazo de cancelamento da **família** não está neste manual: veja `docs/juridico/04-politica-de-cancelamento-e-reembolso.md`.

---
## 6. Seleção de cuidadores e antecedentes

### 6.1 Critérios

| Critério | Tipo | Como conferir | Base |
|---|---|---|---|
| Cadastro aprovado e ocupação `cuidador-de-idosos` (ou `folguista`) aprovada | Produto | `/admin/prestadores/:id`; só então a pessoa recebe oferta (`private.is_care_provider`) | `ARQUITETURA.md`, Prestadores |
| Documento com foto e selfie | Produto | Você compara o rosto da selfie com o do documento. **O app não faz biometria** | `README.md`: verificação de identidade automática não existe |
| CPF ou CNPJ (MEI) | Produto | Número legível e nome igual ao do documento | Política da ocupação |
| Certidão de antecedentes criminais, com consentimento `background_check` | Produto | Seção 6.3 | Política da ocupação (`antecedentes`); consentimento registrado no upload |
| Idade mínima de 18 anos | Manual **[proposta]** | Data de nascimento do documento | LC 150, art. 1º, parágrafo único: "É vedada a contratação de menor de 18 (dezoito) anos para desempenho de trabalho doméstico" [F13]. Não há lei da profissão que fixe idade (seção 3.6) |
| Telefone próprio com WhatsApp; contato de emergência do **cuidador** (nome e telefone) guardado por você | Manual **[proposta]** | Mensagem de teste | O app não guarda o contato de emergência do cuidador |
| Atende bairros declarados e mora perto o bastante para chegar a tempo | Manual **[proposta]** | `provider_neighborhoods`; conversa | Reduz atraso |
| Entrevista concluída e 2 referências conferidas | Manual **[proposta]** | 6.5 | — |
| Briefing de limites feito e declaração de ciência recebida | Manual **[proposta]** | 6.6 | — |
| Experiência com pessoa idosa (6 meses ou mais) | Desejável **[proposta]** | Entrevista e referências | — |
| Curso de cuidador ou de primeiros socorros | Desejável | Certificado | Não é exigido por lei. A regra continua: 192 primeiro |

**Eliminatórios:** documento que não confere ou parece alterado; recusa em apresentar a certidão; referência que não existe; dizer que "aplica injeção, cuida de ferida" como parte do serviço e não aceitar o escopo; pedir pagamento por fora da escala; histórico de abandonar a pessoa cuidada. (Na fase 1, quem tem registro de profissional de saúde não entra nesta linha **[proposta]**: evita a dúvida sobre se estaria exercendo a profissão. É ponto para o enfermeiro e o advogado, seção 18.)

### 6.2 Funil e tempo de operador **[estimativa]**

| Etapa | O que acontece | Tempo |
|---|---|---|
| 1. Triagem por mensagem | 6 perguntas: idade, bairro, experiência, disponibilidade semanal, aceita as regras de escopo, tem os documentos | 5 min |
| 2. Cadastro no app | O candidato faz sozinho em `/pro/cadastro`: ocupação, bairros, documentos, consentimento da certidão, envio para análise | — |
| 3. Conferência dos documentos | Seção 6.3 | 15 min |
| 4. Entrevista | Vídeo ou presencial, roteiro 6.5 | 30 min |
| 5. Referências | 2 ligações | 20 min |
| 6. Briefing e declaração | 6.6 | 45 a 60 min |
| 7. Aprovação no admin | Aceitar os 3 documentos; aprovar prestador e ocupação | 5 min |
| 8. Primeiro plantão acompanhado | Seção 7 | — |

Total: cerca de 3 horas por cuidador aprovado. Se o candidato não passa, você gasta menos; registre o motivo.

### 6.3 Conferência dos documentos

1. **Documento com foto e selfie:** legível, dentro da validade, nome igual ao do cadastro, rosto compatível. Se a foto está escura, rejeite com motivo ("foto escura, envie outra"): `admin_review_document(…, false, motivo)` exige o motivo.
2. **CPF ou CNPJ:** número e nome legíveis.
3. **Certidão de antecedentes criminais:**
   - emissor oficial. A Polícia Federal emite "gratuitamente, pela Internet" e a certidão "vale por 90 dias" [F22]; use 90 dias como prazo máximo de emissão que você aceita **[proposta, alinhada ao prazo da certidão da PF]**;
   - valide a autenticidade no serviço "Validar Certidão de Antecedentes Criminais" do gov.br (link na página da PF) [F22];
   - nome, CPF e data de nascimento batem com o documento;
   - a certidão da PF "informa a existência de registros criminais ... nos sistemas informatizados da Polícia Federal" [F22]: ela **não cobre** necessariamente registros estaduais. Peça também a certidão estadual e confirme com o advogado qual emissor e qual conteúdo aceitar **[incerto]** (não abri as páginas do estado).
4. **Consentimento:** o app registra `background_check` quando o candidato marca "Autorizo o WorkEasy a usar a certidão de antecedentes para analisar o meu cadastro". Sem a caixa, o upload da certidão fica bloqueado.
5. **Registre a decisão** (planilha: data, quem decidiu, resultado, motivo).

Regras de proteção do dado: os arquivos ficam no bucket privado; **não baixe** para o celular nem mande pelo WhatsApp; não tire captura de tela; se precisar compartilhar com o advogado, use o canal que ele indicar e apague depois. Prazo de guarda de candidatos recusados: **[CONDICIONAL: depende de parecer]** (a conta excluída tem os documentos apagados por `account-delete`).

### 6.4 O que fazer com um registro na certidão **[CONDICIONAL: depende de parecer]**

- **Sem registro:** segue.
- **Com qualquer registro:** não decida no mesmo dia. Anote tipo, data e situação do que consta e leia o que a certidão realmente diz.
- **Critérios de peso** **[proposta]**: gravidade; tempo decorrido; ligação com o ofício (violência, crime contra pessoa idosa ou vulnerável, apropriação de bens ou dinheiro, tráfico). Registro ligado a esses temas: recusa. Os demais: caso a caso, com o advogado.
- Dê ao candidato a chance de explicar. Comunique a decisão de forma neutra e por escrito (B.9).
- **Certidão limpa não é garantia.** Nunca apresente o cuidador como alguém que passou por checagem completa nem como "sem antecedentes". Diga: "documentos conferidos pela equipe".
- Base para pedir a certidão: não há lei que a exija do cuidador (seção 3.6). O Projeto de Lei 731/2024, unificado ao 1488/2024, quer dizer expressamente que o contratante pode exigi-la; foi aprovado na Comissão de Defesa dos Direitos da Pessoa Idosa, e a notícia da Câmara de 17/08/2026 diz que ele "continua em análise na Câmara dos Deputados" [F23]. Existe também jurisprudência do TST sobre exigir certidão de candidato a emprego, que **não abri** **[incerto]**: peça ao advogado a base atual e o limite de uso (só para esta finalidade).

### 6.5 Roteiro de entrevista (30 min) e referências

| # | Pergunta | O que ouvir |
|---|---|---|
| 1 | Conte da última pessoa idosa de quem você cuidou: rotina, o que foi mais difícil, por que saiu | Detalhe real, respeito, sem raiva |
| 2 | A pessoa recusa o banho ou a refeição. O que você faz? | Paciência, não força, avisa a família |
| 3 | A família pede "só uma insulina rapidinho". O que você responde? | **Não aplico; a família ou um profissional faz.** Qualquer outra resposta elimina |
| 4 | Quem separa os remédios? E se, na hora, parecer errado? | Quem separa é a família; ele liga e não decide |
| 5 | Você encontra a pessoa no chão e ela se queixa de dor. O que faz, em ordem? | Liga 192 e segue o médico regulador; avisa a família. Sem improvisar conduta |
| 6 | A família pede para ficar um dia a mais ou combina pagamento por fora da escala. E agora? | Avisa o operador; entende a trava de dias |
| 7 | O que você nunca faz no trabalho? | Percebe os próprios limites |
| 8 | Já teve problema com família, polícia ou processo? | Franqueza |
| 9 | Se precisar faltar, como e com quanta antecedência você avisa? | Avisa cedo, por telefone |
| 10 | Quais bairros, quais dias, quantos dias por semana numa mesma casa? | Compreende que são no máximo 2 dias diferentes por semana na mesma casa |

**Sinais de alerta:** "faço injeção sim, já fiz muito"; fala mal de todas as famílias anteriores; foge de dar referência; quer receber adiantado; promete "curar" ou "melhorar a doença"; histórico de sumir.

**Referências (2 ligações, 10 min):** (a) em que período e em que função trabalhou com a pessoa; (b) pontualidade e faltas; (c) como tratava a pessoa e a família; (d) houve algum incidente (queda, desacordo, falta); (e) contrataria de novo? Registre nome e telefone de quem informou. Não diga a quem ligou que o candidato "foi aprovado".

### 6.6 Briefing e declaração de ciência

**Briefing de 45 a 60 minutos, em oito pontos:** (1) o que é e o que não é o serviço; (2) tabela "Nunca" (3.2); (3) medicamento (3.3); (4) emergência: 192 primeiro (seção 10) e o cartão; (5) relatório do dia: o que escrever e o que não escrever (seção 9); (6) privacidade: sem fotos, sem repasse; (7) dinheiro e presentes; (8) trava de dias, aviso de falta e consequências (seções 5 e 12). **Não ensine técnica de enfermagem** (a COFEN 582/2018 veda isso ao enfermeiro, e o WorkEasy não tem como supervisionar) [F04].

**Declaração de ciência** (rascunho; a resposta "Li e concordo" por WhatsApp, com data, fica arquivada) **[CONDICIONAL: depende de parecer]**:

> **Declaração de ciência dos limites do serviço.** Eu, [NOME COMPLETO], CPF [CPF], declaro que li, entendi e vou cumprir as regras do WorkEasy Cuidado:
> 1. Presto apoio à vida diária e companhia. Não presto cuidado de saúde.
> 2. Não aplico injeção, não faço curativo, não mexo em sonda, bolsa, oxigênio ou soro e não meço nem interpreto sinais de saúde para decidir qualquer coisa.
> 3. Não administro medicamento. Só aviso o horário e entrego a dose que a família ou um profissional de saúde já separou, se a pessoa toma sozinha. Se algo parecer errado, ligo para a família e não decido.
> 4. Em qualquer dúvida de urgência, ligo para o SAMU (192) e sigo o que o médico regulador disser. Depois aviso a família e o WorkEasy.
> 5. Não guardo nem uso dinheiro, cartão, senha ou Pix da pessoa. Compras só com lista e recibo.
> 6. Não tiro foto nem filmo a pessoa, a casa ou documentos, e não repasso informação da família a terceiros.
> 7. Sou profissional independente, o WorkEasy não é meu empregador, e entendo que não posso ser escalado por mais de 2 dias diferentes por semana na mesma casa.
> 8. Se não puder ir a um plantão, aviso o operador o quanto antes, por telefone.
> 9. Posso ser pausado ou suspenso se descumprir estas regras.

### 6.7 Aprovação no produto, passo a passo

1. O candidato cria a conta (código por e-mail ou WhatsApp), aceita termos e privacidade, faz `become_provider` (ocupação `cuidador-de-idosos`), declara os bairros, envia os documentos e pede análise (`submit_provider_for_review`).
2. Você revisa cada documento em `/admin/prestadores/:id` (`admin_review_document`). Aceitar ou rejeitar grava `audit_log`.
3. `admin_set_provider_status(…, 'approved')` aprova o prestador e, na primeira aprovação, **só as ocupações cujos documentos exigidos estão aceitos**. Para as demais, ou depois, `admin_set_occupation_approval(provider, 'cuidador-de-idosos', true, motivo)`.
4. Confirme que ele aparece na busca "Tipo de cuidador" para o bairro (`search_providers`) e que você tem o telefone dele (o campo do perfil é digitado pelo usuário e pode estar vazio).
5. **Não aprove** nenhuma ocupação fora do quadro 3.5.

### 6.8 Reconferência **[proposta]**

- Certidão: a cada 180 dias e depois de qualquer incidente grave. Lista: Anexo A.10.
- O app **não bloqueia** certidão velha (nenhuma tela preenche `expires_at`). Para forçar a atualização, rejeite o documento antigo com o motivo "vencido": o produto retira a aprovação que dependia dele até haver documento novo aceito e nova aprovação sua.
- Registre a data da reconferência no cadastro de cuidadores (planilha).

---
## 7. Orientação do primeiro plantão

### 7.1 Antes (você, 48 h antes do início)

- [ ] Ficha de entrada da família completa e ciência recebida (seção 8).
- [ ] Cuidador aprovado, declaração de ciência recebida (6.6) e plantão aceito no app.
- [ ] Telefones passados por você, **depois do aceite**: ao cuidador, o do responsável da família e os dois contatos de emergência; à família, o do cuidador. O banco permite ler o perfil do outro depois do aceite, mas nenhuma tela de cuidado mostra o telefone.
- [ ] Endereço completo e instruções de acesso enviados ao cuidador **depois do aceite**, por mensagem direta. O app só mostra o bairro; nunca escreva o endereço nas observações do plantão (o cuidador as lê antes de aceitar).
- [ ] Cartão de emergência (Anexo C) preenchido pela família, colado em lugar visível (porta da geladeira), com cópia para o cuidador.
- [ ] Folha de rotina de papel pela família: horários de refeição e banho, restrições alimentares e **horários de remédio copiados da receita**. O cuidador lê; não escreve nem altera os horários.
- [ ] Lembrete de 24 h aos dois lados (B.2).
- [ ] Combinado: quem recebe o cuidador, e pelo menos 1 hora de sobreposição com alguém da família no primeiro dia **[proposta]**.

### 7.2 No primeiro plantão, com a família presente (30 a 60 min)

**A casa**
- [ ] Apresentar a pessoa cuidada pelo primeiro nome e pelo jeito dela (o que gosta, o que a deixa nervosa).
- [ ] Percorrer a casa: banheiro, cozinha, quarto, saídas, escadas, tapetes soltos, degraus, luz. Combinar o que a pessoa faz sozinha e o que precisa de apoio.
- [ ] Onde ficam: cartão de emergência, folha de rotina, chaves.
- [ ] Documentos e objetos de valor ficam guardados pela família.
- [ ] Animais, visitas habituais, quem pode entrar (porteiro, vizinho de confiança).
- [ ] Câmeras: a família mostra onde estão.

**A rotina**
- [ ] Horários de refeição e preferências; restrições alimentares conforme a folha da família.
- [ ] Higiene: como a pessoa gosta; o que faz sozinha.
- [ ] Mobilidade: quanto de ajuda; bengala ou andador.
- [ ] Remédios: onde fica o organizador, **quem o preencheu** (família ou profissional de saúde) e os horários da folha. O cuidador entrega, não prepara (3.3). Se a pessoa recusar, o cuidador liga para a família.

**Os limites**
- [ ] Ler em voz alta a tabela "Nunca" (3.2); a família confirma que não vai pedir.
- [ ] Emergência: 192 primeiro; telefone da família; endereço completo para dizer ao regulador; hospital de preferência, se houver (quem decide o destino é o médico regulador).

**O app**
- [ ] Entrada no horário (a caixa de localização é opcional; marcar grava o consentimento); como enviar o relatório; onde a família lê (`/cuidado/relatorios`).
- [ ] Combinar como o cuidador avisa se algo sair do combinado: telefone, não mensagem.

**Fechamento do dia (5 min):** família e cuidador dizem o que funcionou e o que ajustar. Você anota na ficha.

### 7.3 Depois (você)

- Ligação ao cuidador no fim do dia (10 min): como foi, algo fora do combinado.
- Mensagem à família no dia seguinte (B.7).
- Qualquer coisa que preocupe: caderno de incidentes (seção 11).
- Primeiras 4 semanas: ligação semanal de 10 minutos com a família.

---

## 8. Ficha de entrada da família

### 8.1 Princípios

- **Mínimo necessário.** Pergunte só o que muda a escala, a segurança ou a decisão de atender.
- **Sem diagnóstico e sem lista de remédios.** O app diz "O WorkEasy não guarda dados de saúde" e sua ficha deve ser coerente. A única informação de saúde que você pergunta é se há **procedimento técnico na rotina** (sim ou não), para saber se atende.
- **A ficha é sua, fora do app.** Guarde em arquivo com senha e verificação em duas etapas, só você acessa; nada em grupo de WhatsApp.
- Restrições alimentares e alergias importam para a segurança, mas **a família as escreve na folha de rotina em casa** e conta direto ao cuidador (é o que o próprio app orienta). O WorkEasy não as guarda.

### 8.2 Campos

| Campo | Por que perguntamos | Obrigatório | Onde fica |
|---|---|---|---|
| **A. Responsável** (quem contrata e recebe os avisos) | | | |
| Nome completo | Saber com quem se combina | Sim | Ficha e perfil do app |
| Telefone com WhatsApp | Contato principal; você o repassa ao cuidador depois do aceite | Sim | Perfil do app |
| E-mail | Entrar com código; recuperar acesso | Recomendado | Perfil do app |
| Relação com a pessoa cuidada e se decide pelos cuidados | Saber a quem recorrer. O produto **não confere** representação legal **[CONDICIONAL: depende de parecer]** | Sim | Ficha |
| CPF | **Não coletar nesta fase.** Só se houver cobrança ou contrato pela plataforma **[PLANEJADO]** | Não | — |
| **B. Pessoa cuidada** | | | |
| Primeiro nome | Plantão e relatório (o cuidador vê só o primeiro nome) | Sim | App (`care_recipients.first_name`) |
| Ano de nascimento | Conferir que tem 60 anos ou mais; ajustar a conversa | Recomendado | App (`birth_year`) |
| Mora com a família, com cônjuge ou sozinha | Triagem de escopo e de ILPI (3.7) | Sim | Ficha |
| Gostos, hábitos, o que acalma e o que irrita | Acolhimento e rotina | Recomendado | App (`preferences`; só família e admin leem) e folha de rotina |
| **C. Casa** | | | |
| Bairro | A oferta mostra o bairro | Sim | App (`households.neighborhood_id`) |
| Endereço completo | O cuidador precisa chegar | Sim | **Ficha; enviado ao cuidador só depois do aceite; não existe no app** |
| Acesso: portaria, interfone, chave, escada ou elevador | Chegar e sair com segurança | Sim | Mensagem depois do aceite |
| Animais, outros moradores, câmeras (onde) | Segurança e aviso ao cuidador | Sim | Ficha |
| **D. Necessidade** | | | |
| Para que precisa (companhia, refeições, apoio na rotina, acompanhar passeios ou consultas, noites) | Dimensionar e escolher o perfil | Sim | Ficha |
| Dias e horários; se há noites | Montar a escala **dentro da trava** (seção 12) | Sim | Ficha |
| Início e duração prevista | Planejar reservas | Sim | Ficha |
| **E. Triagem de escopo** | 8.3 | Sim | Ficha (só "sim" ou "não") |
| **F. Emergência** | | | |
| Dois contatos (nome, parentesco, telefone) | Cartão de emergência; o cuidador **não lê** o campo do app | Sim | App (`emergency_contact`, **um campo de texto livre**; o app não separa dois contatos) **e** cartão impresso (dois contatos) |
| Hospital de preferência e convênio, se houver | Informar à família; quem decide o destino é o médico regulador | Opcional | Cartão |
| **G. Outros profissionais em casa** (enfermeiro, técnico, fisioterapeuta): quem e que função | Deixar claro quem faz o quê | Opcional | Ficha (só a função) |
| **H. Acerto** | | | |
| Valor combinado por plantão e forma de pagamento ao cuidador | Hoje o app grava o valor, mas **o acerto é direto entre família e cuidador** | Sim | App (`rate_cents`) e ficha |
| **I. Aceites por escrito** | 8.4 | Sim | Resposta "ciente" arquivada |

### 8.3 Triagem de escopo (perguntas de sim ou não) e decisão

| # | Pergunta | Se "sim" |
|---|---|---|
| 1 | Na rotina de hoje, alguém (família ou profissional) faz injeção, curativo, sonda, oxigênio, aspiração ou troca de bolsa? | **Fora do escopo.** Encaminhar (B.8). Não registre qual |
| 2 | A pessoa fica na cama o dia todo, ou precisa de duas pessoas para levantar? | Fora da fase 1 |
| 3 | Precisa de ajuda em todas as atividades do dia (comer, banho, andar)? | Fora da fase 1 |
| 4 | Há outras pessoas idosas, sem parentesco, morando na casa? | **Pare.** Alerta ILPI (3.7); fale com o dono |
| 5 | Já saiu de casa sozinha e se perdeu, ou já foi agressiva com quem cuida? | Atende com ressalva: cuidador experiente e conversa prévia |
| 6 | Caiu mais de uma vez nos últimos 3 meses? | Atende com ressalva: cuidador experiente, ambiente revisto na visita |
| 7 | Ninguém separa os remédios em organizador, ou a família espera que o cuidador os separe? | A família resolve antes de começar (3.3) |
| 8 | Quer cuidador morando ou dormindo na casa todos os dias? | Não pelo plantão (trava e LC 150): Plano Gestão (seção 12) |
| 9 | Há câmeras na casa? | Registrar onde e avisar o cuidador |

Itens 1 a 3 são limites desta linha **[proposta]**, com apoio na CBO, que diz que atendimento a pessoa com "elevado grau de dependência" exige formação em saúde [F05]. Os critérios exatos precisam da revisão do enfermeiro.

### 8.4 Aceites da família (texto para enviar; a resposta "ciente" fica arquivada) **[CONDICIONAL: depende de parecer]**

> Para começarmos, confirme cada item respondendo **"ciente"**:
> 1. Li e aceito os Termos de Uso e a Política de Privacidade do WorkEasy.
> 2. O WorkEasy organiza a escala. O cuidador é profissional independente; não é empregado do WorkEasy.
> 3. O cuidador faz companhia e apoio à vida diária. Ele não faz procedimento de saúde e **não administra medicamento**.
> 4. Em urgência, o cuidador liga para o SAMU (192) e depois para a família.
> 5. O app não guarda dados de saúde. Informações de saúde, alergias e remédios ficam na folha de rotina em casa, e eu as repasso direto ao cuidador.
> 6. O mesmo cuidador não pode ser escalado por mais de 2 dias diferentes por semana na minha casa; mais que isso pode ser vínculo de emprego doméstico (LC 150/2015). Se eu quiser mais dias, a contratação é minha, fora do WorkEasy.
> 7. Hoje o WorkEasy não recebe nem repassa o pagamento do plantão: o acerto é direto entre mim e o cuidador.
> 8. A pessoa cuidada, ou quem decide por ela, sabe que o primeiro nome, o ano de nascimento e as preferências dela serão usados para organizar o cuidado.
> 9. Há câmeras nos seguintes lugares: [____]. Não há câmera em banheiro nem em quarto de dormir.

---

## 9. Relatório do dia (modelo)

### 9.1 O que o app tem

Quatro campos de texto, todos opcionais, mas **ao menos um** precisa estar preenchido: **Refeições** (até 2000 caracteres), **Atividades** (2000), **Humor** (500) e **Observações** (2000). Só depois da entrada. Um relatório por plantão; reenviar substitui. A família lê em `/cuidado/relatorios` e na página do plantão.

### 9.2 Como preencher

| Campo | Escreva | Exemplo |
|---|---|---|
| Refeições | O que comeu e bebeu, quanto aceitou e a hora. Sem avaliar | "Café às 8h30: pão com queijo e chá, comeu tudo. Almoço às 12h: arroz, feijão e frango, comeu metade e pediu mais suco. Lanche às 16h: bolo e chá." |
| Atividades | O que fez e com quem | "Caminhou 15 minutos no corredor com o andador, ouviu rádio, regou as plantas e ligou para a neta às 15h." |
| Humor | Palavras simples, descritivas | "Animada de manhã, mais quieta à tarde; pediu para ver fotos antigas." |
| Observações | Fatos que a família precisa saber, com a hora | "Visita do filho às 17h. Pediu para trocar a TV de lugar. Falta filtro de café." |

### 9.3 O que não escrever

- **Nenhuma palavra de saúde.** O app recusa o texto e mostra qual palavra pegou. A lista atual: diagnóstico, medicamento, medicação, remédio, dose e dosagem (e "mg", "mcg", "ml", "gotas"; a lista completa está em `HEALTH_TERMS` de `services/care.ts`), receita médica, insulina, doença, sintoma, exame, laudo, prontuário, CID, pressão (arterial, alta, baixa), glicemia, hipertensão, diabetes, demência, Alzheimer, Parkinson, AVC, derrame, infarto, câncer, tumor, febre, vômito, tontura. Não tente driblar com outra grafia: o objetivo é o WorkEasy não guardar dado de saúde.
- **Se tomou ou não o remédio**: anote na folha de rotina de papel da casa.
- Sobrenome, endereço, telefone, CPF, nome de terceiros, fotos.
- Opinião sobre a família ou sobre a pessoa ("preguiçosa", "difícil").

> As frases-modelo desta seção foram conferidas contra a lista de palavras do app (cópia dela, não o app em execução). O filtro é uma lista de palavras: ele não pega tudo, e dado de saúde pode aparecer sem palavra da lista ("não quis comer", "dormiu mal"). Trate os relatórios como dado pessoal com cuidado (`docs/juridico/06-ripd-relatorio-de-impacto.md`).

### 9.4 Quando algo preocupar

1. **Ligue para a família.** Se for urgente, **192** antes (seção 10).
2. No relatório, escreva só o **fato**, com a hora, sem diagnóstico e sem palavra de saúde:

> "Às 14h10 a pessoa escorregou no banheiro e ficou sentada no chão. Liguei para o SAMU (192) às 14h12 e para a filha às 14h14. Os socorristas chegaram às 14h30 e a levaram ao hospital; fui junto."

3. Avise o operador no mesmo dia. Ele abre o registro de incidente (seção 11).

### 9.5 Padrão de qualidade **[proposta]**

- Enviado até 2 horas depois da saída. Três ou mais campos preenchidos. Objetivo, sem adjetivo negativo, coerente com os horários.
- **Auditoria semanal:** você lê todos os relatórios nas 4 primeiras semanas e, depois, 5 por semana. Marque: preenchimento, tom, dado de saúde, dado de terceiro, horário coerente. Devolva o retorno ao cuidador.
- Métricas de envio e atraso: Anexo A.7.

### 9.6 Como a família deve entender

O relatório é o que o **cuidador escreveu**, em texto simples. Não é laudo, não é avaliação de saúde. Se a família ficar preocupada, ela conversa com um profissional de saúde, não com o cuidador.

---
## 10. Protocolo de emergência

### 10.1 Princípio

O cuidador **não faz julgamento clínico**. Quem decide se é urgência e o que fazer é o médico regulador do SAMU. O Ministério da Saúde diz: o SAMU 192 é "gratuito, acessado pelo número 192, funciona 24 horas por dia e 07 dias por semana"; a ligação é gratuita de telefone fixo ou móvel; os técnicos coletam as primeiras informações e passam o chamado ao médico regulador, que "presta orientações de socorro às vítimas e aciona as ambulâncias quando necessário"; e a orientação ao público é "Ligue para o 192 e siga as orientações do Médico Regulador" [F20].

**Regra da linha:** na dúvida se é urgência, **ligue 192 na hora**, antes de qualquer outra ligação. Não meça nada para decidir, não espere a família responder.

Por que sem hesitar: o Código Penal, art. 135, pune quem deixa de "prestar assistência, quando possível fazê-lo sem risco pessoal, ... à pessoa inválida ou ferida, ao desamparo ou em grave e iminente perigo; ou não pedir, nesses casos, o socorro da autoridade pública" [F15]; o Estatuto da Pessoa Idosa, art. 97, pune quem deixa de prestar assistência à pessoa idosa em situação de iminente perigo ou "não pedir, nesses casos, o socorro de autoridade pública" [F14]. Isto é o texto das normas, não parecer sobre o caso concreto.

### 10.2 Quando ligar

A página do SAMU lista, entre os motivos para chamar: problemas cardiorrespiratórios; intoxicação e envenenamento; queimaduras graves; **maus-tratos**; crises hipertensivas e dor no peito de aparecimento súbito; acidentes e traumas com vítimas; choque elétrico; "suspeita de infarto ou AVC (alteração súbita na fala, perda de força em um lado do corpo e desvio da comissura labial são os sintomas mais comuns)"; crises convulsivas; e "outras situações consideradas de urgência ou emergência, com risco de morte, sequela ou sofrimento intenso" [F20]. A mesma página lista situações em que o SAMU não é o caminho (por exemplo febre prolongada, dores crônicas, vômito e diarreia, troca de sonda) e diz que nelas a pessoa pode ser encaminhada ao posto de saúde ou à UPA [F20].

Para o **cuidador** isso se resume numa frase, no cartão (Anexo C): "Se você não tem certeza, ligue e conte o que vê. O médico regulador decide." Para os demais casos, ele liga para a família.

### 10.3 Passos

| # | Quem | O que |
|---|---|---|
| 1 | Cuidador | Fica com a pessoa. Se houver perigo no local (fogo, fumaça, gás), sai com ela se for possível e chama os Bombeiros |
| 2 | Cuidador | **Liga 192.** Diz: endereço completo (do cartão), primeiro nome da pessoa, "o que estou vendo" em palavras simples, telefone de onde liga. **Faz só o que o médico regulador mandar ao telefone** e não desliga antes de ele liberar |
| 3 | Cuidador | Liga para a família (contato 1; se não atender, contato 2). Depois avisa o operador |
| 4 | Cuidador | Deixa a porta ou a portaria avisada para os socorristas entrarem. Deixa à mão o cartão e os documentos da pessoa (que a família guarda) |
| 5 | Cuidador | Anota os horários: ligação, chegada, nome de quem atendeu, hospital de destino |
| 6 | Cuidador | Se a pessoa for levada, só acompanha se a família autorizar por telefone. Sem autorização, informa e fica; quem decide é a família |
| 7 | Cuidador | No relatório do dia, só o **fato**, sem palavra de saúde (modelo em 9.4) |
| 8 | Operador | Confirma que a família foi avisada, o destino, quem acompanha, e **cobre o resto do plantão** se o cuidador sair (seção 5) |
| 9 | Operador | Abre o registro de incidente no mesmo dia (seção 11, Anexo D) e marca a revisão em 48 h |
| 10 | Operador | Se há dúvida sobre a conduta do cuidador, **pausa as novas escalas dele** até apurar (pausa cautelar, com aviso por escrito: seção 5.6) |

O cuidador **não** dá remédio, comida ou água por conta própria e **não** faz manobra que não tenha sido mandada pelo médico regulador ao telefone. Isso não é treino clínico: é o limite da linha.

### 10.4 Outros números

| Número | Para quê | Fonte |
|---|---|---|
| **192** | SAMU: urgência de saúde | [F20] |
| **100** | Disque Direitos Humanos: denúncia de violação contra pessoa idosa. Funciona diariamente, 24 h, incluindo sábados, domingos e feriados; discagem gratuita; também por WhatsApp, +55 61 9 9611-0100 | [F21] |
| 193 (Bombeiros) e 190 (Polícia Militar) | Fogo, resgate, crime em curso | **[incerto]**: são os números que conheço, mas não abri página oficial nesta sessão. Confirme antes de imprimir o cartão |

---

## 11. Incidentes: categorias e registro

### 11.1 O que é incidente

Qualquer evento que (a) machucou ou poderia ter machucado a pessoa cuidada ou o cuidador, (b) quebrou uma regra desta linha, (c) deixou a pessoa sem cuidador sem a família saber, (d) envolveu dinheiro ou bens, (e) expôs dado pessoal, ou (f) gerou reclamação séria. **Anote também o que quase aconteceu.** O produto não tem registro de incidente: use o caderno do Anexo D.

### 11.2 Categorias

| Cód. | Categoria | Exemplos | Gravidade típica | Registrar além dos campos comuns | Quem avisar |
|---|---|---|---|---|---|
| I1 | Urgência com SAMU | Queda com socorro; mal súbito | G3 ou G4 | Hora da ligação, quem atendeu, destino, quem acompanhou, hora do aviso à família | Família na hora; dono assume |
| I2 | Queda ou acidente sem socorro | Escorregão, batida leve | G2 | Onde, o que fazia, quem viu, como ficou depois | Família no mesmo dia |
| I3 | Plantão sem cobertura ou falta | Cuidador não chegou; ninguém aceitou | G2; G3 se a pessoa ficou sozinha sem a família saber | Horário combinado, avisos feitos, hora da reposição | Família na hora |
| I4 | Atraso acima de 60 min, saída antes do horário, abandono | | G2 ou G3 | Horas | Conversa com o cuidador; família |
| I5 | Fora do escopo | Cuidador fez procedimento de enfermagem ou deu remédio por conta própria; a família pediu | G3 | O que foi feito (fato), quem pediu, consequência | Dono; suspensão preventiva; enfermeiro se houve dano |
| I6 | Medicamento | Entrega fora do horário, recusa, dúvida sobre dose | G3 | Fato, quem preparou, hora, quem foi avisado | Família na hora; 192 se urgência |
| I7 | Suspeita de maus-tratos, negligência ou violência | Física, psicológica, financeira, sexual; por cuidador, família ou terceiro | G4 | Fato objetivo, quem relatou, sinais observados (sem diagnóstico) | Dono na hora; seção 11.5 |
| I8 | Furto, dano ou suspeita de apropriação de bens ou dinheiro | | G3 | O que, quando, quem tinha acesso, se houve boletim de ocorrência | Família faz o B.O.; suspensão preventiva do cuidador envolvido |
| I9 | Conduta inadequada com o cuidador | Assédio, exigência fora do combinado, ambiente inseguro | G2 ou G3 | Fato, testemunhas | O cuidador pode sair do local; dono conversa com a família |
| I10 | Acidente do cuidador no trabalho | | G2 ou G3 | Fato, atendimento recebido | Dono; seguro, se houver |
| I11 | Privacidade e dados | Foto ou vídeo da pessoa, vazamento, relatório com dado de saúde, documento perdido | G2 ou G3 | O que vazou, para quem, quando | `docs/juridico/08-plano-de-resposta-a-incidentes.md` |
| I12 | Tentativa de contornar a trava de dias | Mesmo cuidador acima do limite, conta duplicada, acerto "por fora" | G2 | Fato | Recusar; oferecer Plano Gestão |
| I13 | Reclamação de qualidade, sem dano | Pontualidade, tratamento, relatório fraco | G1 ou G2 | O quê e quando | Conversa; troca de cuidador |
| I14 | Falha técnica do app | Entrada recusada, relatório não enviou, mensagem não chegou | G1 ou G2 | Tela, hora, mensagem de erro | Corrigir à mão (A.11, A.12); abrir problema de produto |
| I15 | Caso saiu do escopo | A pessoa passou a precisar de procedimento técnico | G2 ou G3 | Fato e decisão | Encaminhar com a família; parar a escala se não for seguro |

### 11.3 Gravidade e prazos **[proposta]**

| Nível | Quando | Quem decide | Registro | Revisão |
|---|---|---|---|---|
| G1 leve | Sem risco nem dano | Operador | No mesmo dia | Reunião semanal |
| G2 moderado | Risco evitado, dano pequeno ou regra quebrada sem dano | Operador | No mesmo dia | Em 7 dias |
| G3 grave | Lesão, socorro acionado, pessoa sozinha sem aviso, furto, descumprimento de escopo, vazamento de dado | **Dono assume** | No mesmo dia | Em 48 h; decidir sobre suspensão preventiva (seção 5.6) |
| G4 crítico | Morte, lesão grave, violência ou crime confirmado ou em curso | **Dono assume na hora** | No mesmo dia | Revisão formal em 7 dias; avisar advogado e seguradora; congelar as escalas da casa e do cuidador |

### 11.4 Como registrar

- **Fatos, não opiniões.** Hora, local, quem, o que foi feito, resultado. Sem diagnóstico, sem culpa.
- Campos fixos no Anexo D. O vínculo com o app é o `id` do plantão, quando houver.
- **O caderno guarda dado pessoal e pode guardar dado de saúde** (uma queda com socorro é dado "referente à saúde": LGPD, art. 5º, II [F17]). Acesso só seu, arquivo com senha e verificação em duas etapas, nada em grupo de WhatsApp.
- Base legal (LGPD, art. 11 [F17]) e prazo de guarda do caderno: pergunta ao advogado **[CONDICIONAL: depende de parecer]**. Ponto de partida **[proposta]**: o CDC prescreve em cinco anos a pretensão de reparação por dano causado por fato do serviço (art. 27) [F18]; guarde os registros G3 e G4 por esse prazo e os demais por menos, até o advogado decidir.
- O motivo de cancelamento que o cuidador ou a família digitam fica no `audit_log`, que **não se apaga**. Oriente: sem dado pessoal e sem palavra de saúde no motivo.
- Apagar uma casa no app apaga em cascata plantões, entradas, saídas e relatórios dela. Por isso o caderno existe e **não deve** depender do app.

### 11.5 Comunicação para fora

- **Suspeita de violência contra pessoa idosa:** "É dever de todos prevenir a ameaça ou violação aos direitos da pessoa idosa" (Estatuto, art. 4º, § 1º); "Todo cidadão tem o dever de comunicar à autoridade competente qualquer forma de violação a esta Lei que tenha testemunhado ou de que tenha conhecimento" (art. 6º). O art. 19 se dirige aos **serviços de saúde**, públicos e privados: notificação compulsória à autoridade sanitária e comunicação a qualquer dos órgãos que ele lista (autoridade policial, Ministério Público e conselhos da pessoa idosa) [F14]. Canal: **Disque 100** [F21]; crime em curso, polícia. A obrigação específica do WorkEasy como empresa é pergunta ao advogado **[incerto]**.
- **Furto e outros crimes:** o boletim de ocorrência é da vítima (família ou cuidador). Você apoia com o mínimo de dado.
- **Dado pessoal:** siga o plano de incidentes de segurança.
- **Seguradora:** avise conforme a apólice, que costuma ter prazo curto **[incerto]**.

---

## 12. Trava de 2 dias e Plano Gestão

### 12.1 O que a lei diz

LC 150/2015, art. 1º **[incerto nesta revisão]**: "Ao empregado doméstico, assim considerado aquele que presta serviços de forma contínua, subordinada, onerosa e pessoal e de finalidade não lucrativa à pessoa ou à família, no âmbito residencial destas, por mais de 2 (dois) dias por semana, aplica-se o disposto nesta Lei" [F13].

Até 2 dias por semana, a LC 150 não alcança o trabalhador. **Isso não é salvo-conduto**: o mesmo artigo lista continuidade, subordinação, onerosidade e pessoalidade. Se um padrão fixo de 2 dias toda semana, com a plataforma controlando horário, entrada e relatório, muda a análise, é pergunta ao advogado **[incerto]**. "Semana" na trava é a semana ISO (segunda a domingo); a lei só diz "por semana" **[incerto]**.

### 12.2 Como a trava funciona no banco (conferido no código e no teste pgTAP `09_care.test.sql`)

- Roda em `private.check_labor_lock` ao **designar** (aceite), ao inserir plantão já designado e ao mudar período, casa ou cuidador.
- Conta **dias de calendário de São Paulo**, na semana ISO, do mesmo cuidador na mesma casa **ou com o mesmo dono** (casas do mesmo dono contam juntas), somando os atendimentos (`bookings`) de ocupação com trava para o mesmo cliente.
- Contam plantões `assigned`, `checked_in` e `completed`. **Não contam:** `open`, `offered`, `canceled` e `no_show`.
- **Plantão que cruza a meia-noite conta 2 dias** (o teste diz: "an overnight shift counts both days").
- O limite vem de `platform_settings.labor_lock_days_per_week` (padrão 2). A tela de configurações do admin permite editar (1 a 7) e avisa "mude só com parecer jurídico". **Não mude.**
- O que a trava **não vê**: o mesmo cuidador com duas contas; famílias diferentes que são a mesma; trabalho combinado fora da plataforma.

### 12.3 O que isso faz com a escala

| Necessidade da família | Cuidadores diferentes por semana, no mínimo |
|---|---|
| 1 plantão diurno por dia, 7 dias | 4 (2 + 2 + 2 + 1) |
| Segunda a sexta, 1 plantão diurno | 3 (2 + 2 + 1) |
| 3 dias alternados | 2 |
| 1 noite por dia que cruza a meia-noite, 7 noites, escala que se repete toda semana | **7** (cada noite toca 2 dias; duas noites seguidas tocam 3 dias na mesma semana ISO; duas separadas, 4. A virada de domingo para segunda pode permitir duas noites seguidas uma vez, mas não se sustenta semana após semana) |
| Plantão que termina até a meia-noite | Conta 1 dia |

Poucos cuidadores por casa baixa a continuidade de quem cuida. A métrica está em A.8 e A.9. É o motivo do Plano Gestão.

### 12.4 Plano Gestão: a oferta, descrita como serviço a validar **[PLANEJADO]** **[CONDICIONAL: depende de parecer]**

> Não há código nem documento de produto para o Plano Gestão (busca em `components/`, `pages/`, `services/` e `docs/` em 08/11/2026). Tudo abaixo é desenho, não funcionalidade.

**Quando:** a família quer o mesmo cuidador em 3 dias ou mais por semana, ou noites todos os dias.

**Estrutura:** a família contrata o cuidador diretamente, como **empregado doméstico (LC 150/2015)**, com carteira assinada e registro no eSocial. O plano fala em "CLT": para o doméstico, a CLT só se aplica **subsidiariamente** (LC 150, art. 19) [F13]. Neste manual: "contratação com carteira assinada pela LC 150".

**O que o WorkEasy faz:**

| # | Entrega |
|---|---|
| 1 | Entrevista de necessidades com a família (30 min) |
| 2 | Até 3 candidatos pré-selecionados, com documentos conferidos (seção 6) e referências |
| 3 | Diária de teste pela plataforma (no máximo 2 dias diferentes na semana) |
| 4 | Indicação do caminho oficial: eSocial Doméstico no gov.br (Manual do Empregador Doméstico, guia DAE, telefone 0800 730 0888) [F24]. **Não calcula folha, não preenche o eSocial e não assina nada pela família**; encaminha a um contador |
| 5 | Reposição de folgas e faltas pela plataforma, com cuidadores diferentes, dentro da trava |
| 6 | Ligação de acompanhamento aos 7, 30 e 90 dias |

**O que não faz:** ser empregador; assinar a carteira; calcular ou pagar salário e encargos; garantir que o empregado fique; avaliar a saúde da pessoa.

**O que a família assume** (LC 150 [F13]): jornada normal de até 8 horas por dia e 44 por semana (art. 2º); 12 horas seguidas por 36 de descanso **só com acordo escrito** (art. 10); registro do horário de trabalho obrigatório (art. 12); intervalo (art. 13); trabalho noturno das 22 h às 5 h, hora de 52 minutos e 30 segundos e acréscimo de pelo menos 20% (art. 14); 11 horas entre jornadas (art. 15); descanso semanal (art. 16); férias de 30 dias com um terço (art. 17); FGTS e 3,2% de indenização (arts. 21 e 22); aviso prévio (art. 23); recolhimento mensal único (Simples Doméstico, art. 34): 8% de contribuição patronal, 0,8% de seguro de acidente, 8% de FGTS e 3,2% = **20% sobre a remuneração**, mais a contribuição do empregado, descontada do salário (art. 34, § 2º). A alíquota atual do empregado e o custo total são do contador (o art. 34 traz uma faixa de 8% a 11%; não a use sem conferir). Maus-tratos a pessoa idosa sob cuidado é justa causa (art. 27, I) **[incerto nesta revisão]**.

**Preço:** a definir depois do parecer; o plano não traz faixa. Cobrar da **família**, nunca do candidato **[proposta]**.

**Perguntas ao advogado:** seção 18, itens 5 a 9.

### 12.5 Quando a família contrata direto

- Pare de escalar aquele cuidador naquela casa acima de 2 dias pelo app.
- Folga e falta do contratado: cobrir com outros cuidadores da plataforma.
- Registre no caderno que a família contratou diretamente (data, quem).
- O próprio app diz à família que a contratação direta é feita **fora do WorkEasy**, que "a plataforma não registra o vínculo nem calcula encargos" e que procure um contador ou advogado trabalhista (`components/cuidado/LaborLockNotice.tsx`).

---
## 13. Seguro de responsabilidade civil

D12 exige seguro de responsabilidade civil **cotado** antes de abrir ao público. Esta seção é um roteiro para pedir cotação. Não obtive fonte oficial útil sobre seguros nesta sessão (a página educativa da SUSEP que abri é genérica e não trata de responsabilidade civil): é uma **lista de trabalho**, e o corretor e o advogado confirmam cada item **[incerto]**.

**Atenção ao calendário:** o modo concierge com as 3 famílias acontece **antes** do portão. Nesse período o risco sem apólice é do dono. Considere contratar antes do primeiro plantão **[proposta]**. O plano de 45 dias já põe a apólice cotada e o parecer trabalhista como pré-requisito (P11) do primeiro plantão pago (`docs/operacao/01-plano-de-45-dias-concierge.md`).

### 13.1 O que pedir

| Cobertura | Para quê | Pergunta ao corretor |
|---|---|---|
| Responsabilidade civil geral ou de operações (danos corporais e materiais a terceiros) | Queda, dano ao patrimônio da família, lesão à pessoa cuidada durante o plantão | Vale quando o dano é causado pelo cuidador independente que a empresa organiza? Quem é o "segurado" e quem é "terceiro"? |
| Responsabilidade profissional ou erros e omissões | Falha na conferência de documentos, na escala ou na orientação | Cobre falha de seleção? |
| Danos morais | Reclamação sem dano físico | Incluídos? Limite? |
| Despesas de defesa | Processo | Dentro ou fora do limite? |
| Infidelidade ou furto por pessoal | Apropriação de bens da família | Existe para prestadores autônomos? Que exigências? |
| Acidentes pessoais do cuidador | O cuidador se machuca no plantão | Apólice coletiva para autônomos? |
| Dados pessoais (cibernético) | Vazamento de relatório, documento ou certidão | Cobre dado sensível e a LGPD? |

### 13.2 Perguntas que decidem se a apólice serve

- A apólice **nomeia a atividade**: "organização de escala de cuidadores independentes, não clínicos, para pessoas idosas, no domicílio da família"?
- **Exclusões:** atos dolosos; exercício ilegal de profissão (ato de enfermagem); violência e abuso; idade da pessoa assistida (60 anos ou mais); medicação; atividade em domicílio.
- **Base da cobertura:** por ocorrência ou por reclamação feita na vigência? Retroatividade? Período complementar?
- Limite máximo de garantia por sinistro e por ano; franquia; participação.
- **Condições que o segurado precisa cumprir:** antecedentes, treinamento, registro de incidentes, relatórios.
- Prazo para avisar um sinistro; foro; abrangência territorial (São Paulo).
- **Prêmio:** por plantão, por faturamento ou por número de cuidadores.
- Peça pelo menos **2 cotações por escrito** **[proposta]**.

### 13.3 O que levar para a cotação

Descrição da atividade (seções 1 a 3), fluxo de seleção (6), modelo de relatório (9), protocolo de emergência (10), caderno de incidentes (11), volume previsto **[estimativa]**, estrutura societária (a pessoa jurídica) e declaração de que a linha é não clínica.

### 13.4 Critério para aceitar **[proposta]**

Apólice que (a) nomeia a atividade, (b) não exclui pessoa idosa nem o domicílio, (c) cobre danos corporais e materiais a terceiros com limite que o advogado considere adequado, e (d) inclui defesa. Sem isso, o portão da seção 17 continua fechado.

---

## 14. Referência de preço (uso interno)

> **Não é preço público.** Hoje o app deixa a família digitar qualquer valor e diz que o acerto do plantão é direto entre família e cuidador. Não publique esta faixa. Ao falar com famílias, diga "valor combinado entre a família e o cuidador".

Premissa do plano, para plantão de 12 horas **[estimativa do plano]**: a família paga R$ 290 a 330 e o cuidador recebe R$ 210 a 230 (`docs/DECISOES.md`, seção 5, traz só essas duas faixas). A margem bruta de R$ 80 a 90 por plantão é a que o plano de trabalho usa; ela sai da diferença entre as faixas, como mostra a tabela.

| Combinação | Família paga | Repasse | Margem bruta | % do valor cobrado |
|---|---|---|---|---|
| Piso do plano | R$ 290 | R$ 210 | R$ 80 | 27,6% |
| Ponto central | R$ 310 | R$ 220 | R$ 90 | 29,0% |
| Teto do plano | R$ 330 | R$ 230 | R$ 100 | 30,3% |
| Pior cruzamento | R$ 290 | R$ 230 | R$ 60 | 20,7% |
| Melhor cruzamento | R$ 330 | R$ 210 | R$ 120 | 36,4% |

A faixa "R$ 80 a 90" do plano corresponde às duas primeiras linhas; os extremos das faixas dão de R$ 60 a R$ 120.

**Ilustração aritmética, não previsão** (margem de R$ 85 por plantão **[estimativa]**):

| Plantões por mês | Margem bruta mensal |
|---|---|
| 8 (2 por semana) | R$ 680 |
| 16 | R$ 1.360 |
| 24 (3 famílias × 8) | R$ 2.040 |
| 40 | R$ 3.400 |

**O que essa margem não inclui:** seguro, tarifa de pagamento, impostos, custo de reposição, tempo seu (cerca de 10 a 15 min por plantão, **[estimativa]**), WhatsApp e ferramentas.

**Ela não existe no produto hoje.** Para cobrar margem seria preciso:

| O que falta | Estado |
|---|---|
| Valor cobrado diferente do repasse, definido pela plataforma. Hoje o formulário grava o mesmo valor nos dois campos, e `caregiver_payout_cents` é editável pela família | **[PLANEJADO]** |
| Cobrança da família e repasse ao cuidador no plantão. O fluxo de cobrança com divisão (Asaas) existe para atendimentos, não para plantões | **[PLANEJADO]** |
| Estrutura jurídica: a família passaria a contratar o WorkEasy (que vira fornecedor perante ela, CDC) e a relação com o cuidador muda de natureza | **[CONDICIONAL: depende de parecer]** |
| As regras de comissão (12% no primeiro serviço, teto de R$ 150, D5 e D6) **não se aplicam a plantões no código**: `compute_platform_fee` trata de atendimentos | Informação |

Valide também o repasse: nem o plano nem este manual trazem fonte de mercado para o valor pago ao cuidador. Pergunte a 5 a 10 cuidadores da região na etapa de recrutamento **[proposta]**.

---

## 15. Proposta a hospitais

### 15.1 Antes de qualquer reunião

- O que se pode oferecer é **acompanhante** contratado pela **família**, nunca cuidador contratado pelo hospital. O COREN-SP diz que, em instituição de saúde com serviço de enfermagem, a atuação do cuidador "deve ficar restrita a 'acompanhante de pacientes'", e que a contratação de "cuidadores" para atividades "dentro do ambiente hospitalar é proibida pela legislação"; os acompanhantes "não podem e nem devem receber ou aceitar qualquer atividade delegada por nenhum dos profissionais da instituição" [F06].
- O direito da pessoa idosa a acompanhante está no Estatuto, art. 16: "À pessoa idosa internada ou em observação é assegurado o direito a acompanhante, devendo o órgão de saúde proporcionar as condições adequadas para a sua permanência em tempo integral, segundo o critério médico"; e, no parágrafo único, "Caberá ao profissional de saúde responsável pelo tratamento conceder autorização para o acompanhamento ... ou, no caso de impossibilidade, justificá-la por escrito" [F14].
- O produto **não tem a figura do hospital**: seria uma casa da família com o hospital nas observações do plantão, sem palavra de saúde. A ocupação `acompanhante-hospitalar-idosos` existe (domicílio e estabelecimento), com confiança `a_confirmar`.
- **Só procure hospital com oferta depois** que a linha domiciliar rodar com as 3 famílias (seção 17) **[proposta]**. O plano de 45 dias prevê uma primeira conversa com equipe de hospital em torno do D25 (`docs/operacao/01-plano-de-45-dias-concierge.md`): trate-a como **conversa de escuta** (quem autoriza acompanhante externo, que identificação o hospital exige), sem oferta, sem material e sem promessa.
- **Quem contrata importa.** O mesmo parecer, ao tratar de cuidadores contratados pelo hospital, diz que a "responsabilidade principal recairia diretamente sobre a contratadora da mão de obra" [F06]. É mais um motivo para o texto sempre dizer que **a família contrata** o acompanhante. Se isso também vale para o WorkEasy quando organiza a escala, é a pergunta 1 ao advogado (seção 18.1).

### 15.2 Roteiro de uma página

| # | Bloco | Conteúdo |
|---|---|---|
| 1 | Problema | **Hipótese a validar na conversa, não é dado:** famílias podem ter dificuldade de manter acompanhante em tempo integral para a pessoa idosa internada. O Estatuto garante o direito (art. 16) [F14]. **Sem número inventado**: se a pergunta vier, "ainda não temos dados" |
| 2 | Oferta | Organizamos acompanhantes **não clínicos**, contratados pela família, por turno, com documentos conferidos, relatório não clínico à família e tentativa de reposição |
| 3 | O que não somos | Não prestamos cuidado de enfermagem, não recebemos tarefa delegada do hospital, não substituímos a equipe, não temos acesso a prontuário e não informamos estado de saúde |
| 4 | Como funciona | A família nos procura (por indicação do serviço social) → combinamos os turnos → o acompanhante segue a regra de autorização e identificação do hospital → o relatório vai à **família**, não ao hospital |
| 5 | O que pedimos | (a) quem autoriza acompanhante externo e que documentos ou crachá; (b) regras de horário e troca de turno; (c) um contato para ocorrências; (d) se a política permitir, deixar material informativo no serviço social |
| 6 | Conduta | Sem comissão, indicação paga ou favor a profissionais do hospital. O hospital não nos passa dado do paciente; o que sabemos vem da família |
| 7 | Piloto | 1 unidade, 4 semanas, até 5 famílias. Medidas: cobertura dos turnos, ocorrências, satisfação da família, queixas do hospital. Critério de parada combinado de antemão |
| 8 | Quem somos | [RAZÃO SOCIAL], [CNPJ]; seguro (quando houver); contato do operador |

Quem procurar: serviço social, gestão de altas, ouvidoria, coordenação de enfermagem, diretoria assistencial.

### 15.3 Objeções

| Objeção | Resposta |
|---|---|
| "Já temos acompanhantes credenciados" | Atendemos famílias que não encontram. Não competimos com a equipe do hospital |
| "Quem responde se algo acontecer?" | O acompanhante não executa atividade do hospital; a responsabilidade pelos internados é institucional [F06]. Nossos limites estão por escrito. Seguro: quando houver |
| "Vocês fazem banho, curativo, remédio?" | Curativo e medicamento, não. Higiene e conforto só como a regra do hospital permitir; a equipe do hospital decide |
| "Vocês compartilham dados?" | Não recebemos dado clínico. O relatório vai à família e é não clínico |
| "Quanto custa para o hospital?" | Nada. A família contrata. Não pagamos nem recebemos comissão **[proposta: confirmar com o advogado e com `DECISOES.md`, D5, antes da conversa]** |
| "Que resultados vocês têm?" | Ainda nenhum: estamos começando. Por isso propomos um piloto pequeno |

### 15.4 O que não prometer

Redução de tempo de internação ou de readmissão, melhora clínica, selo de aprovação do acompanhante, reposição garantida, prazo de atendimento, preço fixo.

### 15.5 E-mail de acompanhamento (texto pronto)

> **Assunto:** Piloto de acompanhantes não clínicos para famílias
>
> Prezada [NOME], obrigado(a) pela conversa de [DATA].
> Resumindo o que combinamos: a [RAZÃO SOCIAL] ([CNPJ]) organiza acompanhantes não clínicos, contratados pela própria família, para pessoas idosas internadas. Eles não executam atividade do hospital nem recebem tarefa delegada, e o relatório vai à família.
> Proposta de piloto: [UNIDADE], 4 semanas, até 5 famílias, sem custo para o hospital. Avaliaremos juntos cobertura dos turnos, ocorrências e satisfação das famílias.
> Para avançar, precisamos saber: quem autoriza acompanhante externo, que identificação o hospital exige e quem é o contato para ocorrências.
> Atenciosamente, [NOME], [TELEFONE]

---

## 16. Métricas de qualidade e rotina de operação

### 16.1 Métricas

As consultas estão no Anexo A. As métricas gerais da plataforma ficam em `docs/operacao/08-metricas-e-portoes.md`.

| # | Métrica | Definição | Fonte | Meta inicial **[proposta]** | Cadência |
|---|---|---|---|---|---|
| M1 | Cobertura efetiva | Plantões não cancelados, já passada a janela de entrada, com entrada registrada ÷ todos esses plantões | A.3 | 95% ou mais | Semanal |
| M2 | Tempo até aceitar e antecedência | Horas da primeira oferta ao primeiro aceite (p50, p90); horas entre o aceite e o início | A.4 | Medir 20 plantões antes de fixar meta | Semanal |
| M3 | Cancelamentos pelo cuidador | Por faixa de antecedência | A.5 | Nenhum com menos de 6 h | Semanal |
| M4 | Pontualidade | Entrada dentro de 15 min do início | A.6 | 90% ou mais | Semanal |
| M5 | Relatório | % de plantões concluídos com relatório; horas até o primeiro envio | A.7 | 95% ou mais; p50 de até 2 h | Semanal |
| M6 | Continuidade | Cuidadores diferentes por casa por semana | A.8 | Informativa (a trava empurra para 3 a 4) | Semanal |
| M7 | Proximidade da trava | Cuidadores com o limite de dias usado na semana | A.9 | Planejar a semana seguinte com esta lista | Semanal |
| M8 | Incidentes | G3 e G4 por 100 plantões; tempo até a revisão | Caderno | Nenhum G3 ou G4 sem revisão no prazo | Semanal |
| M9 | Satisfação da família | Nota de 1 a 5 no dia seguinte | B.7 | 4,5 ou mais | Por plantão |
| M10 | Reconferências em dia | Certidões com mais de 180 dias | A.10 | Nenhuma vencida | Mensal |
| M11 | Tempo de operador por plantão | Minutos | Cronômetro | 15 ou menos | Semanal |
| M12 | Aceitação das ofertas | Ofertas aceitas ÷ ofertas feitas | `shift_offers` | Informativa | Mensal |

O produto **não registra** recusas por `labor_lock` nem quanto tempo o cuidador levou para responder a uma oferta (só `created_at` da oferta e o `audit_log` do aceite).

### 16.2 Rotina diária (20 min)

1. Rodar **A.1** e agir na ordem da coluna "ação".
2. Amanhã: todo plantão tem cuidador? Lembretes (B.2) enviados?
3. Relatórios de ontem: cobrar quem falta (lista em A.7).
4. Incidentes abertos: algum com prazo vencendo?
5. Fila de `/admin/prestadores`: candidatos de cuidado esperando análise.
6. Mensagens de famílias e cuidadores.

### 16.3 Rotina semanal (60 min)

1. **A.3 a A.9** e a tabela da seção 16.1.
2. Auditoria de relatórios (9.5).
3. Incidentes G2 ou mais: revisão e ação corretiva.
4. **Domingo à noite:** banco de reserva (B.6) e plano da semana seguinte, olhando A.9 e A.2.
5. Ligação de 10 min com cada família nas 4 primeiras semanas.
6. Atualizar a lista de motivos de recusa e as perguntas da entrevista.

### 16.4 Mensal e trimestral

- Mensal: reconferência de certidões (A.10); revisão de todos os cuidadores com mais de 1 cancelamento tardio.
- Trimestral: rever a situação do PL 76/2020 e dos demais projetos da profissão de cuidador; rever a lista de palavras do filtro de saúde com o enfermeiro.

### 16.5 Piloto das 3 famílias: continuar, corrigir, parar **[proposta]**

| Decisão | Quando |
|---|---|
| **Continuar** | Cobertura de 90% ou mais por 4 semanas seguidas; nenhum G4; todo G3 revisado em 48 h; nota das famílias de 4 ou mais; tempo de operador sustentável |
| **Corrigir** | Cobertura de 80% a 90%; reclamações repetidas; banco de reserva curto |
| **Parar** | Qualquer G4 com conduta do cuidador não apurada; cobertura abaixo de 80% por 2 semanas; impossibilidade de repor; parecer jurídico contrário |

---

## 17. Portão de abertura ao público

Origem: `docs/DECISOES.md`, seção 5 (D12): "pessoa jurídica aberta; seguro de responsabilidade civil cotado; advogado trabalhista validando o fluxo e a trava de 2 dias por semana; pelo menos 3 famílias atendidas em modo concierge, com você ou alguém seu no controle da escala. Antes disso, o menu 'Cuidado' não deve ser divulgado."

| # | Item | Evidência que fecha o item | Status em 23/10/2026 |
|---|---|---|---|
| 1 | Pessoa jurídica aberta | Cartão CNPJ e contrato social | Pendente |
| 2 | Seguro de RC cotado | 2 cotações por escrito (seção 13) | Pendente |
| 3 | Advogado trabalhista valida fluxo e trava | Parecer escrito (seção 18.1) | Pendente |
| 4 | 3 famílias atendidas em concierge | 3 fichas, 4 semanas ou mais cada, métricas M1 a M5, caderno em dia | Pendente |
| 5 | Enfermeiro revisou escopo e medicamento (seção 3) | Resposta por escrito | Pendente **[proposta]** |
| 6 | Banco de reserva | Pelo menos 2 reservas por casa (5.2) | Pendente **[proposta]** |
| 7 | Cartão de emergência impresso, caderno e planilhas criados | Anexos C e D | Pendente **[proposta]** |
| 8 | Termos e Política de Privacidade publicados com razão social e CNPJ | `docs/juridico/01-termos-de-uso.md`, `02-termos-do-prestador.md`, `03-politica-de-privacidade.md` | Pendente |
| 9 | Aviso ao cuidador e à família: rotina manual definida (o app não avisa a família) ou WhatsApp configurado | Anexo B | Pendente **[proposta]** |
| 10 | Item "Cuidado" do menu escondido até o portão | Mudança de produto | **[PLANEJADO]** |
| 11 | RIPD e plano de incidentes de segurança revisados | `docs/juridico/06-ripd-relatorio-de-impacto.md`, `08-plano-de-resposta-a-incidentes.md` | Pendente |
| 12 | Decisão sobre o pagamento do plantão (direto ou pela plataforma) | Seção 14 | Pendente |

**Relação com o plano de 45 dias.** O portão G4 daquele plano (`docs/operacao/01-plano-de-45-dias-concierge.md`) conta uma casa como atendida com 1 plantão concluído e o relatório do dia enviado, sem incidente grave aberto; ele decide o plano de 45 dias. O portão acima decide **abrir ao público**, e a evidência que proponho aqui (4 semanas ou mais por família, métricas M1 a M5, caderno em dia) é mais exigente **[proposta]**. Cumprir G4 não fecha o item 4.

**Próximos 14 dias, nesta ordem** **[proposta]:** (1) mandar a seção 3 ao enfermeiro; (2) mandar a seção 18.1 ao advogado; (3) pedir as duas cotações de seguro; (4) imprimir o cartão de emergência e criar o caderno e as planilhas; (5) recrutar 6 cuidadores (playbook `docs/operacao/02-recrutamento-de-prestadores.md`); (6) escolher as 3 famílias (de preferência conhecidas, com triagem da seção 8 limpa); (7) ensaiar uma falta com um amigo no papel de cuidador (seção 5).

---
## 18. Pontos para o advogado e para o enfermeiro; problemas do produto

### 18.1 Perguntas ao advogado (copie e envie)

1. **Papel do WorkEasy e promessa de reposição.** Na linha de cuidado o WorkEasy é intermediário ou fornecedor do serviço perante a família? O que muda se ele prometer tentar repor o cuidador que faltar? Qual texto ele pode usar hoje (CDC, arts. 14, 25, 30 e 34)?
2. **Vínculo.** O cuidador é independente quando trabalha até 2 dias por semana numa casa, mas com escala recorrente, horário controlado pela plataforma, entrada e saída registradas e relatório obrigatório? Existe risco de vínculo com a plataforma ou com a família? "Semana" é a semana ISO ou outra?
3. **Trava.** O limite de 2 dias diferentes por semana, a contagem de plantão noturno como 2 dias, a soma de casas do mesmo dono e a soma com atendimentos comuns estão corretos? A trava deve contar também dias combinados fora da plataforma?
4. **Margem.** O modelo "a família paga R$ 290 a 330 ao WorkEasy e o cuidador recebe R$ 210 a 230" é viável? Como estruturar contrato, tributação e responsabilidade, e como ele conversa com a pergunta 1 de `docs/DECISOES.md`, seção 8 (divisão de pagamento sem custódia)?
5. **Plano Gestão: natureza e remuneração.** Seleção e indicação de cuidador para a família contratar é atividade livre? Pode cobrar da família? Pode-se vedar a cobrança do candidato? Exige registro?
6. **Plano Gestão: eSocial.** Orientar a família sobre o eSocial Doméstico sem calcular a folha nem preencher o sistema evita invadir atividade privativa de contador?
7. **Plano Gestão: responsabilidade.** Qual a responsabilidade do WorkEasy por seleção que deu errado? Cabe cláusula de período de teste e de substituição?
8. **Plano Gestão: contrato.** "Carteira assinada pela LC 150" (CLT só subsidiária, art. 19): jornada de 12 horas só em 12x36 com acordo escrito (art. 10); adicional noturno (art. 14); quem responde por acidente de trabalho do doméstico?
9. **Plano Gestão: burla.** Diária de teste pela plataforma seguida de contratação direta: convém cláusula ou taxa de conversão, ou isso pesa contra o modelo?
10. **Antecedentes.** Qual a base legal para pedir a certidão ao cuidador autônomo e qual certidão estadual aceitar? Critérios de recusa sem discriminação. Existe tese do TST sobre exigir certidão de candidato **[incerto: não abri a fonte]** e ela alcança cuidadores? Prazo de guarda e descarte.
11. **Medicamento e ciência.** Validar com o enfermeiro a regra da seção 3.3, o texto da declaração de ciência (6.6) e a validade do "Li e concordo" por WhatsApp.
12. **LGPD.** Base legal para os dados da pessoa cuidada, que não aceitou os termos; para o caderno de incidentes (dado de saúde); prazo de guarda; encarregado; RIPD.
13. **Dever de comunicar.** Qual é a obrigação específica da empresa, e de quem trabalha nela, diante de suspeita de violência contra pessoa idosa (Estatuto, arts. 4º, 6º e 19)? Em que prazo?
14. **Hospitais.** Acompanhante contratado pela família, material informativo no hospital, vedação de comissão a profissionais, responsabilidade.
15. **Seguro.** Há exigência legal de seguro? Que coberturas e limites são razoáveis?
16. **Pausa e suspensão do cuidador.** Cláusulas, aviso e direito de resposta (seção 5.6).
17. **Cancelamento e arrependimento.** Prazos de cancelamento da família e direito de arrependimento em contratação à distância (Política de Cancelamento, Reembolso e Garantia, `docs/juridico/04-politica-de-cancelamento-e-reembolso.md`).

### 18.2 Perguntas ao enfermeiro (profissional inscrito no COREN)

1. Aprovar ou corrigir as tabelas "Pode" e "Nunca" (3.2) e a regra de medicamento (3.3).
2. Critérios de dependência da triagem (8.3, itens 1 a 3) e o limite "sem técnica" para higiene, banho e mobilidade.
3. Texto do briefing (6.6) e do cartão de emergência (Anexo C): há algo clínico escondido?
4. Profissional de enfermagem pode atuar na linha como cuidador? (Na fase 1, não.) Em que condições, se um dia puder?
5. Acompanhante hospitalar e higiene em hospital: o que as regras do hospital costumam permitir?
6. A lista de palavras do filtro de saúde (9.3): faltam termos?

### 18.3 Itens marcados **[incerto]**, reunidos

| Item | Por quê |
|---|---|
| Descrição oficial da CBO 5162-10 | A consulta no site do MTE exige reCAPTCHA; o texto vem de transcrições dos pareceres COREN-SP 004/2025 e 01/2019 |
| Guia Prático do Cuidador (Ministério da Saúde) | A página recusou o acesso (HTTP 503); o texto vem do parecer COREN-DF 006/2023 |
| Certidão estadual de antecedentes | Não abri a página do estado |
| Números 193 e 190 | Não abri página oficial |
| Tese do TST sobre certidão de antecedentes | Não abri a fonte |
| Vigilância sanitária municipal sobre ILPI de fato | Não abri norma municipal |
| PL 731/2024 e PL 1488/2024 (Câmara) e PL 203/2025 | Dos dois primeiros só li a notícia da Câmara de 17/08/2026. Do PL 203/2025 só li a citação numa moção de câmara municipal juntada à página do PL 76/2020 no Senado, e não identifiquei a casa legislativa. Não abri nenhuma página de tramitação |
| Prazo de aviso à seguradora | Depende da apólice |
| "Semana" da LC 150 como semana ISO | A lei só diz "por semana" |
| Obrigação de comunicar violência específica da empresa | Pergunta 13 |

### 18.4 Problemas do produto que encontrei (não corrigi nenhum)

| # | O que | Evidência | Efeito na operação |
|---|---|---|---|
| P1 | A família **não é avisada** quando o cuidador aceita, cancela, entra, sai ou envia relatório; só o cuidador recebe mensagem, e só na oferta | `08_notifications.sql` (gatilhos e modelos); `ARQUITETURA.md` | Você avisa à mão |
| P2 | **Sem lembrete de 24 h** para plantão (só para atendimentos) | `08_notifications.sql`, função de lembrete ligada a `bookings` | Você lembra à mão |
| P3 | `no_show` **nunca é gravado**; plantão designado sem entrada fica `assigned` para sempre e segue contando na trava | enum `shift_status`; nenhuma RPC | Anexo A.11 |
| P4 | Saída só de 2 h antes a 2 h depois do fim; saída antecipada ou esquecida deixa `checked_in` para sempre; o cuidador não cancela depois da entrada | `check_in`, `cancel_shift` | Anexo A.12 |
| P5 | **67 ocupações** contam como "cuidado" por terem unidade "plantão" (inclui médicos, enfermagem, home care, vigia, salva-vidas) e a lista "Tipo de cuidador" da família as mostra todas | `private.is_care_occupation`; `listCareOccupations`; `catalog/policies.json` | Só aprovar o quadro 3.5 |
| P6 | **Sem tela de admin** para casas e plantões; admin não cria plantão | Políticas `shifts_insert_own`; `pages/admin/*` | Usar a conta da família ou SQL |
| P7 | O formulário grava o mesmo valor em `rate_cents` e `caregiver_payout_cents`; a família pode editar o repasse enquanto o plantão está aberto ou oferecido; o pagamento não passa pela plataforma; regras de comissão não valem para plantões | `ShiftForm`, `createShift`, `guard_shift`, `compute_platform_fee` | Seção 14 |
| P8 | O cuidador **não lê** o contato de emergência (`care_recipients` é só da família); não há campo de endereço; as observações do plantão são lidas pelo cuidador **antes** de aceitar | `caregiver_shifts()`; `RecipientForm`; `HouseholdForm` | Cartão de emergência; endereço depois do aceite |
| P9 | Nenhuma tela mostra o telefone ou o nome da família ao cuidador designado, nem o telefone do cuidador à família, embora o banco permita ler | `private.shares_contact`; telas de cuidado | Você passa os contatos |
| P10 | O filtro de saúde roda só no app; o banco aceita qualquer texto vindo da API; a lista é curta | `services/care.ts`; `submit_daily_report` | Seção 9.3 |
| P11 | Máximo de 10 ofertas por plantão. As ofertas expiram quando o plantão começa, mas o plantão continua "oferecido" ou "aberto" sem alerta | `offer_shift`; `private.expire_stale` | Seção 5.4; fila A.1 |
| P12 | `accept_shift_offer` não confere a aprovação do cuidador na hora do aceite: quem foi pausado ainda aceita oferta aberta | `accept_shift_offer` | Seção 5.6 |
| P13 | Quando o cuidador cancela, o produto reativa também as ofertas expiradas, inclusive depois do início do plantão, e manda nova mensagem | `cancel_shift` | Seção 5.4 |
| P14 | `provider_documents.expires_at` existe, mas nenhuma tela o preenche; certidão vencida não bloqueia | `uploadProviderDocument`; `admin_review_document` | Anexo A.10 |
| P15 | O item "Cuidado" do menu aparece para todo cliente logado; D12 manda não divulgar e não há flag para esconder | `components/navItems.ts` | Seção 17, item 10 |
| P16 | Não há avaliação do plantão pela família nem registro de incidente. O motivo de cancelamento, digitado livremente, fica no `audit_log`, que não se apaga | `reviews` (exige atendimento pago); `audit_log` | Anexos B.7 e D |
| P17 | Plantão de até 24 horas e começo no futuro são regras do app, não do banco | `createShift` x constraints de `shifts` | Chamada direta à API passa |
| P18 | `labor_lock_days_per_week` é editável por qualquer admin (1 a 7), com só uma dica na tela | `components/admin/settingDefs.ts`; `admin_set_setting` | Regra 5 da seção 1.2 |
| P19 | O catálogo marca `cuidador-de-idosos` com cobrança por comissão e ranking por nota, mas plantão não tem comissão nem avaliação | `catalog/policies.json` | Texto da política destoa do comportamento |

---

## 19. Fontes consultadas

Abertas em **23/10/2026**. "Trecho" é o que li; aspas indicam transcrição literal.

| ID | Documento | Endereço aberto | Trecho ou uso |
|---|---|---|---|
| F01 | Lei 7.498/1986 (exercício da enfermagem) | https://www.planalto.gov.br/ccivil_03/leis/l7498.htm | Arts. 1º, 2º, 11, 12, 13, 15 e 23. Art. 2º: "A enfermagem e suas atividades auxiliares somente podem ser exercidas por pessoas legalmente habilitadas e inscritas no Conselho Regional de Enfermagem com jurisdição na área onde ocorre o exercício." |
| F02 | Decreto 94.406/1987 | https://www.planalto.gov.br/ccivil_03/decreto/1980-1989/d94406.htm | Arts. 1º, 8º, 10, 11 e 13. Art. 11, III, a: "ministrar medicamentos por via oral e parenteral"; c: "fazer curativos"; d: "aplicar oxigenoterapia, nebulização, enteroclisma, enema e calor ou frio". Art. 13: "somente poderão ser exercidas sob supervisão, orientação e direção de Enfermeiro" |
| F03 | COFEN, Resolução 564/2017 (Código de Ética) | https://www.cofen.gov.br/resolucao-cofen-no-5642017_59145.html (redireciona para `/resolucao-cofen-no-5642017/`) | Art. 92: "Delegar atribuições dos(as) profissionais de enfermagem, previstas na legislação, para acompanhantes e/ou responsáveis pelo paciente. Parágrafo único. O dispositivo no caput não se aplica nos casos da atenção domiciliar para o autocuidado apoiado." |
| F04 | COFEN, Resolução 582/2018 | https://cofen.gov.br/resolucao-cofen-no-582-2018/ | Art. 1º: "É vedado ao Enfermeiro o ensino de práticas de Enfermagem que exija aplicação de conhecimentos técnico-científicos ... em atividades de formação de Cuidador de Idosos." Não verifiquei se foi alterada depois |
| F05 | COREN-SP, Parecer 004/2025 (revoga o 001/2019; aprovado em 05/02/2025, homologado em 10/04/2025) | https://ouvidoria.cofen.gov.br/coren-sp/transparencia/134171/download/PDF | "cuidadores não fazem parte de uma profissão regulamentada"; transcrição da CBO 5162 ("No caso de atendimento a indivíduos com elevado grau de dependência, exige-se formação na área de saúde, devendo o profissional ser classificado na função de técnico/auxiliar de enfermagem"); conclusão: "não compete ao enfermeiro supervisionar ou responsabilizar-se pela atuação dos cuidadores de pessoas idosas" |
| F06 | COREN-SP, Parecer 030/2022 (cuidador em unidade hospitalar) | https://ouvidoria.cofen.gov.br/coren-sp/transparencia/75626/download/PDF | "nada impede que realizem atividades conforme as descritas, desde que contratados pela família ou pelo paciente"; atuação "restrita a 'acompanhante de pacientes'"; acompanhantes "não podem e nem devem receber ou aceitar qualquer atividade delegada por nenhum dos profissionais da instituição" |
| F07 | COREN-DF, Parecer Técnico 006/CTA/2023 | https://coren-df.gov.br/wp-content/uploads/2023/05/Parecer-Tecnico_-06-23_Exercicio-ilegal-da-atuacao-dos-cuidadores-na-realizacao-de-procedimentos-de-Enfermagem-no-ambito-do-cuidado-domiciliar_Rinaldo.pdf | Quadros 1 a 5 e conclusões 2, 4 e 5. **Transcreve** o Manual do Cuidador da Pessoa Idosa (SDH, 2008) e o Guia Prático do Cuidador (MS, 2008): citações de segunda mão |
| F08 | COREN-SP, Parecer 01/2019 (**revogado** pelo 004/2025) | https://portal.coren-sp.gov.br/wp-content/uploads/2019/03/Parecer-001_2019.pdf | Usado **só** pela transcrição da lista de atividades da CBO (grupos A a G e Z). A conclusão dele não é usada |
| F09 | Mensagem nº 289, de 08/07/2019 (veto) | http://www.planalto.gov.br/ccivil_03/_ato2019-2022/2019/msg/vet/vet-289.htm | "decidi vetar integralmente, por inconstitucionalidade, o Projeto de Lei de nº 11, de 2016"; razão: "ofende direito fundamental previsto no art. 5º, XIII da Constituição da República" |
| F10 | Congresso Nacional, Veto 25/2019 | https://www.congressonacional.leg.br/materias/vetos/-/veto/detalhe/12446 e https://www.congressonacional.leg.br/materias/pesquisa/-/materia/137625/pdf | "25.19.000 - Veto total \| Mantido \| Painel - Sessão de 02/10/2019"; situação "VETO DELIBERADO PELO PLENÁRIO" em 02/10/2019 (reaberta em 08/11/2026; a página não tem campo "Último estado") |
| F11 | Senado, PL 76/2020 | https://www25.senado.leg.br/web/atividade/materias/-/materia/140481 | Campo "Situação Atual": "Em tramitação"; "Último estado: 10/03/2026 - AGUARDANDO DESIGNAÇÃO DO RELATOR" (Comissão de Assuntos Sociais) |
| F12 | COFEN, notícias sobre o PLC 11/2016 | https://www.cofen.gov.br/regulamentacao-do-cuidador-de-idosos-nao-interfere-na-enfermagem/ (25/05/2019) e https://www.cofen.gov.br/projeto-de-lei-do-cuidador-e-vetado/ (10/07/2019) | "está proibido ao cuidador administrar medicamentos que não seja por via oral e com orientação por prescrição médica" (texto aprovado pelo Senado); "vetou integralmente" |
| F13 | Lei Complementar 150/2015 | https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp150.htm | Arts. 1º, 2º, 10, 12 a 17, 19, 21 a 23, 27, 32 a 34, no texto compilado (que traz o Capítulo I-A, incluído pela Lei 15.455/2026, sem relação com este tema) |
| F14 | Lei 10.741/2003 (Estatuto da Pessoa Idosa) | https://www.planalto.gov.br/ccivil_03/leis/2003/l10.741.htm | Arts. 4º, 6º, 16, 19, 97, 98 e 102, na redação da Lei 14.423/2022 |
| F15 | Código Penal (Decreto-Lei 2.848/1940) | https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm | Art. 135 (omissão de socorro) |
| F16 | Lei 13.146/2015 | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm | Art. 3º, XII ("atendente pessoal") |
| F17 | Lei 13.709/2018 (LGPD) | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm | Art. 5º, II (dado "referente à saúde" é sensível); art. 11 |
| F18 | Lei 8.078/1990 (CDC) | https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm | Arts. 2º, 3º, 7º (parágrafo único), 14, 25 (§ 1º), 27, 30, 34 e 35 |
| F19 | Anvisa, RDC 502/2021 | https://anvisalegis.datalegis.net/action/ActionDatalegis.php?acao=abrirTextoAto&tipo=RDC&numeroAto=00000502&seqAto=000&valorAno=2021&orgao=RDC%2FDC%2FANVISA%2FMS&codTipo=&desItem=&desItemFim=&cod_menu=1696&cod_modulo=134&pesquisa=true | Arts. 1º a 3º, 8º, 10, 11, 16, 40 e 42; página marcada "Vigente". Art. 3º, VI: "domicílio coletivo de pessoas com idade igual ou superior a 60 (sessenta) anos" |
| F20 | Ministério da Saúde, SAMU 192 | https://www.gov.br/saude/pt-br/composicao/saes/samu-192 | "gratuito, acessado pelo número 192, funciona 24 horas por dia e 07 dias por semana"; listas "Quando chamar" e "Quando não chamar"; "Ligue para o 192 e siga as orientações do Médico Regulador" |
| F21 | gov.br, Disque 100 | https://www.gov.br/pt-br/servicos/denunciar-violacao-de-direitos-humanos (modificada em 15/12/2025) | "O serviço funciona diariamente, 24 horas, por dia, incluindo sábados, domingos e feriados"; "basta discar 100"; WhatsApp +55 61 9 9611-0100; denúncias de violações contra pessoas idosas |
| F22 | Polícia Federal, antecedentes criminais | https://www.gov.br/pf/pt-br/assuntos/antecedentes-criminais | "A certidão é emitida gratuitamente, pela Internet e vale por 90 dias"; serviço "Validar Certidão de Antecedentes Criminais" |
| F23 | Agência Câmara, 17/08/2026 | https://www.camara.leg.br/noticias/1297670-comissao-aprova-exigencia-de-antecedentes-criminais-para-cuidadores-de-pessoas-idosas | PL 731/2024 (unificado ao PL 1488/2024): "No âmbito doméstico, o texto estabelece que é lícito ... ao contratante exigir a certidão de antecedentes criminais"; "O projeto continua em análise na Câmara dos Deputados" |
| F24 | eSocial, orientações ao empregador doméstico | https://www.gov.br/esocial/pt-br/empregador-domestico/orientacoes | Manual do Empregador Doméstico; guia DAE; "FALE CONOSCO - 0800 730 0888" |
| F25 | MTE, site da CBO | https://cbo.mte.gov.br/cbosite/pages/pesquisas/BuscaPorCodigo.jsf | **Não consegui ler a ocupação 5162-10**: a consulta pede reCAPTCHA e não contornei. A CBO foi lida em F05 e F08 |
| F26 | Ministério da Saúde, Guia Prático do Cuidador | https://bvsms.saude.gov.br/bvs/publicacoes/guia_pratico_cuidador.pdf | **Não consegui abrir** (HTTP 503). Lido só por F07 |

**Documentos do repositório lidos:** `docs/ARQUITETURA.md` (inteiro), `docs/DECISOES.md`, `README.md`, `supabase/migrations/20261019000009_care.sql` (inteira) e trechos das migrations `01`, `03`, `05`, `08` e `10` (as migrations `11`, `12` e `13` só pelo `ARQUITETURA.md`), `supabase/tests/database/00_helpers.test.sql` e `09_care.test.sql`, `services/care.ts`, `pages/cuidado/*`, `pages/pro/Plantoes.tsx`, `components/cuidado/*`, `components/navItems.ts`, `components/admin/settingDefs.ts`, `pages/pro/Cadastro.tsx`, `pages/conta/Conta.tsx`, `catalog/policies.json`, `test/claims-guard.test.ts`.

**Reabertura de fontes em 08/11/2026 (revisão).** Reabertas e conferidas (8): F10 (com ressalva de texto), F11, F19, F20, F21, F22, F23 e F24. Não reabertas, com o motivo: F01, F02, F13, F14 e F18 (planalto.gov.br, "Acesso Negado", 5 tentativas; pelo mesmo domínio ficam F09, F15, F16 e F17, não tentadas); F03, F04 e F12 (cofen.gov.br, HTTP 403); F06 (ouvidoria.cofen.gov.br, HTTP 403); F07 (coren-df.gov.br, HTTP 503). Tudo que depende delas fica **[incerto]** até conferência por quem tenha acesso; advogado e enfermeiro devem conferir as citações literais antes do uso. Achados da reabertura: F10 não tem campo "Último estado" (corrigido acima); F19 confere, exceto o art. 16, não conferido; F11 confere e não mudou desde 10/03/2026.

**Limites desta pesquisa:** o limite de buscas na web da sessão de pesquisa acabou antes de eu terminar; por isso itens como os números 190 e 193, a certidão estadual e o TST ficaram sem fonte aberta e estão marcados **[incerto]**. Páginas do Ministério da Saúde (bvsms) e a consulta da CBO não abriram.

---
## Anexo A. Consultas SQL (somente leitura) e duas correções administrativas

**Onde rodar:** no editor SQL do painel do Supabase, que entra como administrador do banco. Funções `private.*` só existem para esse papel: **não** funcionam pela API do app. Nunca copie estes comandos para tela do app nem use a chave de serviço no navegador. Todas leem, exceto A.11 e A.12.

**Como foram validadas:** executei todas em 23/10/2026 contra o banco local (migrations 01 a 13), dentro de uma transação desfeita ao final, com os dados de teste do pgTAP (`tests.setup_fixture()`) mais plantões, entradas, relatórios, documentos e eventos de auditoria inseridos só para o teste. **Não foram executadas contra dados reais.** Os nomes de colunas e funções vêm das migrations. **Reexecutadas em 08/11/2026:** 12 de 12 blocos sem erro, cada um numa transação com ROLLBACK, no banco local com as migrations 01 a 16. As métricas gerais da plataforma ficam em `docs/operacao/08-metricas-e-portoes.md`.

---

### A.1 Fila de ação: o que decidir agora

Roda todo dia. A coluna `acao` vem em ordem de urgência: **1** sem cuidador e já começou; **2** designado e sem entrada com a janela de 2 h fechada; **3** em andamento com a saída não registrada e a janela fechada; **4** atraso de mais de 15 minutos; **5** sem cuidador, a cobrir; **6** acompanhar. Para mudar a janela de 72 h, altere `horas_a_frente`.

```sql
-- 1. FILA DE AÇÃO: plantões que pedem uma decisão agora.
-- Mostra os plantões abertos, oferecidos, designados ou em andamento que começam nas
-- próximas N horas, mais os que já começaram e ficaram sem cobertura, sem entrada ou
-- sem saída. Ordene por "ação": o número 1 é o mais urgente.
with params as (select 72 as horas_a_frente),
base as (
  select s.id,
         h.name as casa,
         lower(s.period) as inicio,
         upper(s.period) as fim,
         s.status,
         p.display_name as cuidador,
         round(extract(epoch from (lower(s.period) - now())) / 3600.0, 1) as horas_para_iniciar,
         (select count(*) from public.shift_offers o where o.shift_id = s.id and o.status = 'offered') as ofertas_abertas,
         (select count(*) from public.shift_offers o where o.shift_id = s.id) as ofertas_total
    from public.shifts s
    join public.households h on h.id = s.household_id
    left join public.providers p on p.id = s.provider_id
   where s.status in ('open', 'offered', 'assigned', 'checked_in')
     and lower(s.period) <= now() + make_interval(hours => (select horas_a_frente from params))
)
select case
         when status in ('open', 'offered') and inicio <= now() then '1 SEM CUIDADOR E JÁ COMEÇOU'
         when status = 'assigned' and inicio + interval '2 hours' < now() then '2 SEM ENTRADA: janela de 2 h fechada'
         when status = 'checked_in' and fim + interval '2 hours' < now() then '3 SAÍDA NÃO REGISTRADA: janela de 2 h fechada'
         when status = 'assigned' and inicio + interval '15 minutes' < now() then '4 ATRASO: ligar para o cuidador'
         when status in ('open', 'offered') then '5 SEM CUIDADOR: cobrir'
         else '6 ACOMPANHAR'
       end as acao,
       id as plantao,
       casa,
       to_char(inicio at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as inicio_sp,
       to_char(fim at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as fim_sp,
       horas_para_iniciar,
       status,
       cuidador,
       ofertas_abertas,
       ofertas_total
  from base
 order by 1, inicio;
```

### A.2 Quem pode cobrir um plantão

Troque o UUID em `alvo` pelo `plantao` que veio de A.1. Mostra cuidadores aprovados em ocupação de cuidado, com telefone do perfil, se atendem o bairro, quantos dias diferentes teriam na semana ISO nessa casa se aceitassem (`dias_na_semana_se_aceitar`) contra o limite, e se já têm plantão no horário. `cabe_na_trava = false` corresponde à recusa `labor_lock` do banco (conferi com um caso de teste de 3 dias contra o limite de 2, que o banco recusou com `labor_lock`). A conta **não** soma atendimentos comuns (`bookings`) que o banco também soma: a palavra final é do banco.

```sql
-- 2. REPOSIÇÃO: quem pode cobrir um plantão sem esbarrar na trava de dias por semana.
-- Troque o UUID em "alvo". Lista os cuidadores aprovados em ocupação de cuidado, com o
-- telefone do perfil, se atendem o bairro da casa, quantos dias diferentes ele teria na
-- semana ISO nesta casa se aceitasse (a trava recusa acima do limite) e se já tem outro
-- plantão no mesmo horário. A decisão final é do banco: aceitar pode ser recusado.
with alvo as (select '00000000-0000-0000-0000-000000000000'::uuid as shift_id),
s as (
  select sh.id, sh.period, sh.household_id, h.owner_id, h.neighborhood_id
    from public.shifts sh
    join public.households h on h.id = sh.household_id
    join alvo a on a.shift_id = sh.id
),
limite as (select private.setting_int('labor_lock_days_per_week', 2) as dias),
dias_alvo as (select x::date as dia from s, private.local_days(s.period) x),
cand as (
  select p.id as provider_id, p.display_name, pf.phone, p.base_neighborhood_id
    from public.providers p
    join public.profiles pf on pf.id = p.id
   where private.is_care_provider(p.id)
     and p.id <> (select owner_id from s)
),
dias_usados as (
  select c.provider_id, d::date as dia
    from cand c
    join public.shifts o
      on o.provider_id = c.provider_id
     and o.status in ('assigned', 'checked_in', 'completed')
     and o.id <> (select id from s)
    join public.households oh on oh.id = o.household_id
    cross join lateral private.local_days(o.period) d
   where oh.id = (select household_id from s) or oh.owner_id = (select owner_id from s)
),
por_semana as (
  select c.provider_id,
         date_trunc('week', u.dia)::date as semana,
         count(distinct u.dia) as dias
    from cand c
    cross join (select distinct date_trunc('week', dia)::date as semana_alvo from dias_alvo) w
    cross join lateral (
      select dia from dias_usados du where du.provider_id = c.provider_id
      union
      select dia from dias_alvo
    ) u
   where date_trunc('week', u.dia)::date = w.semana_alvo
   group by c.provider_id, date_trunc('week', u.dia)::date
)
select c.display_name as cuidador,
       c.phone as telefone,
       (c.base_neighborhood_id = (select neighborhood_id from s)
        or exists (select 1 from public.provider_neighborhoods pn
                    where pn.provider_id = c.provider_id and pn.neighborhood_id = (select neighborhood_id from s))) as atende_o_bairro,
       coalesce(max(ps.dias), 0) as dias_na_semana_se_aceitar,
       (select dias from limite) as limite,
       coalesce(max(ps.dias), 0) <= (select dias from limite) as cabe_na_trava,
       exists (select 1 from public.shifts o2
                where o2.provider_id = c.provider_id
                  and o2.status in ('assigned', 'checked_in')
                  and o2.period && (select period from s)) as sobreposto
  from cand c
  left join por_semana ps on ps.provider_id = c.provider_id
 group by c.provider_id, c.display_name, c.phone, c.base_neighborhood_id
 order by cabe_na_trava desc, sobreposto, atende_o_bairro desc, dias_na_semana_se_aceitar, c.display_name;
```

### A.3 Cobertura por semana (M1)

Plantões que já passaram da janela de entrada, sem os cancelados. `sem_entrada` junta designado sem entrada e `no_show`.

```sql
-- 3. COBERTURA POR SEMANA: dos plantões que já passaram da janela de entrada (início + 2 h)
-- e não foram cancelados, quantos tiveram um cuidador que registrou a entrada.
-- "sem_entrada" junta o plantão designado em que ninguém entrou e o status no_show, que
-- o produto não grava sozinho.
with params as (select now() - interval '8 weeks' as desde),
base as (
  select date_trunc('week', lower(s.period) at time zone 'America/Sao_Paulo')::date as semana,
         case
           when s.status in ('checked_in', 'completed') then 'coberto'
           when s.status in ('open', 'offered') then 'sem_cuidador'
           else 'sem_entrada'
         end as resultado
    from public.shifts s
   where lower(s.period) >= (select desde from params)
     and lower(s.period) + interval '2 hours' < now()
     and s.status <> 'canceled'
)
select semana,
       count(*) as plantoes,
       count(*) filter (where resultado = 'coberto') as cobertos,
       count(*) filter (where resultado = 'sem_cuidador') as sem_cuidador,
       count(*) filter (where resultado = 'sem_entrada') as sem_entrada,
       round(100.0 * count(*) filter (where resultado = 'coberto') / nullif(count(*), 0), 1) as pct_cobertos
  from base
 group by semana
 order by semana desc;
```

### A.4 Tempo até cobrir (M2)

Da primeira oferta ao primeiro aceite, e a antecedência do aceite. O aceite vem do `audit_log` (`shift.accepted`), porque `shift_offers` não guarda a hora da resposta.

```sql
-- 4. TEMPO ATÉ COBRIR: da primeira oferta ao primeiro aceite (horas) e com quanta
-- antecedência o aceite aconteceu em relação ao início do plantão.
with params as (select now() - interval '8 weeks' as desde),
primeira_oferta as (
  select o.shift_id, min(o.created_at) as ofertado_em
    from public.shift_offers o
   group by o.shift_id
),
primeiro_aceite as (
  select a.entity_id::uuid as shift_id, min(a.at) as aceito_em
    from public.audit_log a
   where a.action = 'shift.accepted' and a.entity = 'shift'
   group by a.entity_id
)
select count(*) as plantoes_com_aceite,
       round((percentile_cont(0.5) within group (order by extract(epoch from (pa.aceito_em - po.ofertado_em)) / 3600.0))::numeric, 1) as horas_ate_aceitar_p50,
       round((percentile_cont(0.9) within group (order by extract(epoch from (pa.aceito_em - po.ofertado_em)) / 3600.0))::numeric, 1) as horas_ate_aceitar_p90,
       round((percentile_cont(0.5) within group (order by extract(epoch from (lower(s.period) - pa.aceito_em)) / 3600.0))::numeric, 1) as antecedencia_horas_p50
  from public.shifts s
  join primeira_oferta po on po.shift_id = s.id
  join primeiro_aceite pa on pa.shift_id = s.id
 where lower(s.period) >= (select desde from params);
```

### A.5 Cancelamentos pelo cuidador (M3)

Conta por faixa de antecedência e lista os 30 últimos. O motivo é texto livre do cuidador; trate-o como dado pessoal.

```sql
-- 5. CANCELAMENTOS PELO CUIDADOR (antes da entrada): quantos e com que antecedência.
-- O motivo escrito fica em audit_log.data ->> 'reason' (texto livre, não apague nem copie
-- para fora do banco sem necessidade).
select case
         when horas < 6 then '1 a menos de 6 h'
         when horas < 24 then '2 de 6 a 24 h'
         when horas < 72 then '3 de 24 a 72 h'
         else '4 mais de 72 h'
       end as antecedencia,
       count(*) as cancelamentos
  from (
    select extract(epoch from (lower(s.period) - a.at)) / 3600.0 as horas
      from public.audit_log a
      join public.shifts s on s.id = a.entity_id::uuid
     where a.action = 'shift.canceled' and a.entity = 'shift'
       and (a.data ->> 'by_caregiver')::boolean
       and a.at >= now() - interval '8 weeks'
  ) t
 group by 1
 order by 1;

-- Detalhe: quem cancelou, quando e com que antecedência (últimos 30).
select to_char(a.at at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as cancelado_em,
       p.display_name as cuidador,
       round((extract(epoch from (lower(s.period) - a.at)) / 3600.0)::numeric, 1) as horas_antes_do_inicio,
       a.data ->> 'reason' as motivo
  from public.audit_log a
  join public.shifts s on s.id = a.entity_id::uuid
  left join public.providers p on p.id = a.actor_id
 where a.action = 'shift.canceled' and a.entity = 'shift'
   and (a.data ->> 'by_caregiver')::boolean
 order by a.at desc
 limit 30;
```

### A.6 Pontualidade da entrada (M4)

Minutos entre o início e a entrada registrada. `sem_localizacao` conta entradas sem coordenadas (a localização é opcional).

```sql
-- 6. PONTUALIDADE DA ENTRADA: minutos entre o início do plantão e a entrada registrada.
-- Negativo = chegou antes. O banco aceita a entrada de 2 h antes a 2 h depois do início.
select count(*) as entradas,
       count(*) filter (where atraso_min between -15 and 15) as dentro_de_15_min,
       count(*) filter (where atraso_min > 15 and atraso_min <= 60) as atraso_de_15_a_60_min,
       count(*) filter (where atraso_min > 60) as atraso_acima_de_60_min,
       count(*) filter (where atraso_min < -15) as chegou_mais_de_15_min_antes,
       round(100.0 * count(*) filter (where atraso_min between -15 and 15) / nullif(count(*), 0), 1) as pct_pontual,
       count(*) filter (where sem_local) as sem_localizacao
  from (
    select extract(epoch from (c.at - lower(s.period))) / 60.0 as atraso_min,
           (c.lat is null or c.lng is null) as sem_local
      from public.checkins c
      join public.shifts s on s.id = c.shift_id
     where c.kind = 'in' and lower(s.period) >= now() - interval '8 weeks'
  ) t;
```

### A.7 Relatório do dia (M5)

A primeira consulta dá a taxa e o atraso mediano; a segunda é a lista de cobrança.

```sql
-- 7. RELATÓRIO DO DIA: parte dos plantões concluídos que tem relatório e quanto tempo
-- depois do fim ele foi enviado pela primeira vez (reenviar não muda created_at).
select count(*) as concluidos,
       count(r.id) as com_relatorio,
       round(100.0 * count(r.id) / nullif(count(*), 0), 1) as pct_com_relatorio,
       round((percentile_cont(0.5) within group (order by extract(epoch from (r.created_at - upper(s.period))) / 3600.0))::numeric, 1) as horas_apos_o_fim_p50
  from public.shifts s
  left join public.daily_reports r on r.shift_id = s.id
 where s.status = 'completed' and upper(s.period) >= now() - interval '8 weeks';

-- Lista de cobrança: plantões iniciados ou concluídos, sem relatório, que terminaram há mais de 12 h.
select s.id as plantao,
       h.name as casa,
       p.display_name as cuidador,
       to_char(upper(s.period) at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') as fim_sp
  from public.shifts s
  join public.households h on h.id = s.household_id
  left join public.providers p on p.id = s.provider_id
  left join public.daily_reports r on r.shift_id = s.id
 where s.status in ('checked_in', 'completed') and r.id is null and upper(s.period) < now() - interval '12 hours'
 order by upper(s.period);
```

### A.8 Continuidade (M6)

Cuidadores diferentes por casa por semana ISO.

```sql
-- 8. CONTINUIDADE: quantos cuidadores diferentes cada casa teve em cada semana ISO.
select h.name as casa,
       date_trunc('week', lower(s.period) at time zone 'America/Sao_Paulo')::date as semana,
       count(*) as plantoes,
       count(distinct s.provider_id) as cuidadores_diferentes
  from public.shifts s
  join public.households h on h.id = s.household_id
 where s.status in ('assigned', 'checked_in', 'completed')
   and lower(s.period) >= now() - interval '8 weeks'
 group by h.id, h.name, 2
 order by 2 desc, 1;
```

### A.9 Proximidade da trava (M7)

Cuidador e casa em que o limite de dias já foi usado na semana passada ou na atual. Use para planejar a semana seguinte.

```sql
-- 9. TRAVA DE DIAS: cuidadores que já usaram o limite de dias diferentes na semana ISO
-- em uma casa (semana passada e a atual). Quem aparece aqui não cabe em outro dia da
-- mesma semana nessa casa. Um plantão que cruza a meia-noite conta dois dias.
select p.display_name as cuidador,
       h.name as casa,
       date_trunc('week', d)::date as semana,
       count(distinct d) as dias
  from public.shifts s
  join public.households h on h.id = s.household_id
  join public.providers p on p.id = s.provider_id
  cross join lateral private.local_days(s.period) d
 where s.status in ('assigned', 'checked_in', 'completed')
   and date_trunc('week', d)::date >= date_trunc('week', (now() at time zone 'America/Sao_Paulo')::date)::date - 7
 group by p.id, p.display_name, h.id, h.name, date_trunc('week', d)::date
having count(distinct d) >= private.setting_int('labor_lock_days_per_week', 2)
 order by semana desc, cuidador;
```

### A.10 Reconferência de certidões (M10)

Cuidadores aprovados cuja certidão aceita mais recente tem mais de 180 dias. Para forçar a atualização, veja a seção 6.8.

```sql
-- 10. RECONFERÊNCIA: cuidadores aprovados cuja última certidão de antecedentes aceita
-- foi analisada há mais de 180 dias (troque o número para mudar o prazo). O app não
-- guarda validade (provider_documents.expires_at não é preenchido): o controle é a data
-- de análise.
with ultima as (
  select d.provider_id, max(d.reviewed_at) as aceita_em
    from public.provider_documents d
   where d.step = 'antecedentes' and d.status = 'accepted'
   group by d.provider_id
)
select p.display_name as cuidador,
       pf.phone as telefone,
       u.aceita_em::date as certidao_aceita_em,
       current_date - u.aceita_em::date as dias
  from ultima u
  join public.providers p on p.id = u.provider_id
  join public.profiles pf on pf.id = p.id
 where private.is_care_provider(p.id)
   and u.aceita_em < now() - interval '180 days'
 order by u.aceita_em;
```

### A.11 Marcar falta do cuidador (escreve)

Troque o UUID (duas vezes) e o motivo. Só o dono, só depois de início + 2 h e depois de ligar para o cuidador e avisar a família. Primeiro grava o evento no `audit_log`, depois muda o status. O `no_show` deixa de contar na trava.

```sql
-- A. MARCAR FALTA (no_show) de um plantão designado em que ninguém registrou a entrada.
-- Use só depois de início + 2 h (a janela do banco já fechou) e depois de ligar para o
-- cuidador e avisar a família. Troque o UUID e o texto do motivo.
select public.log_event(
  'care.shift_no_show_marked', 'shift', '00000000-0000-0000-0000-000000000000',
  jsonb_build_object('motivo', 'sem entrada até 2 h após o início; família avisada às 09:05', 'por', 'dono'));
update public.shifts
   set status = 'no_show'
 where id = '00000000-0000-0000-0000-000000000000' and status = 'assigned';
```

### A.12 Encerrar plantão com saída não registrada (escreve)

Troque o UUID (três vezes) e o horário (duas vezes, com fuso). Só o dono e só quando o cuidador **e** a família confirmarem o horário real. Grava o evento, insere a saída sem localização e conclui o plantão. Nunca use para apagar ou alterar uma entrada que existe.

```sql
-- B. ENCERRAR PLANTÃO COM SAÍDA NÃO REGISTRADA (status checked_in depois de fim + 2 h).
-- Use só quando o cuidador e a família confirmarem o horário real de saída. Troque o UUID
-- e o horário (com fuso). A saída entra sem localização.
select public.log_event(
  'care.shift_closed_by_admin', 'shift', '00000000-0000-0000-0000-000000000000',
  jsonb_build_object('saida_em', '2026-10-23T20:10:00-03:00', 'confirmado_por', 'cuidador e família', 'por', 'dono'));
insert into public.checkins (shift_id, provider_id, kind, at)
select id, provider_id, 'out', '2026-10-23T20:10:00-03:00'::timestamptz
  from public.shifts
 where id = '00000000-0000-0000-0000-000000000000' and status = 'checked_in';
update public.shifts
   set status = 'completed'
 where id = '00000000-0000-0000-0000-000000000000' and status = 'checked_in';
```

---
## Anexo B. Mensagens prontas

Mensagens **suas**, enviadas à mão por WhatsApp ou telefone (não são os modelos do WhatsApp Business, que ficam em `docs/operacao/05-templates-whatsapp.md`). Troque o que está entre colchetes. Elas evitam promessa de resultado, prazo e palavra de saúde.

**B.1 Primeiro contato com a família**

> Olá, [NOME]! Aqui é [SEU NOME], do WorkEasy Cuidado. Obrigado por nos procurar. Para você saber como funciona: organizamos plantões de cuidadores independentes para a casa de quem precisa de companhia e apoio no dia a dia. O cuidador não faz procedimento de saúde (injeção, curativo, sonda) e não administra remédio. Se a pessoa precisa disso, indicamos outros caminhos. Posso te fazer umas perguntas rápidas, uns 5 minutos, para ver se conseguimos ajudar?

**B.2 Lembrete de 24 h**

*Para o cuidador:*
> Oi, [NOME]! Lembrete: amanhã, [DIA], das [INÍCIO] às [FIM], na casa de [PRIMEIRO NOME DA PESSOA]. Endereço e acesso eu já te enviei. Registre a entrada no app quando chegar. Se tiver qualquer imprevisto, me ligue o quanto antes.

*Para a família:*
> Oi, [NOME]! Lembrete: amanhã, [DIA], das [INÍCIO] às [FIM], quem vai é [NOME DO CUIDADOR]. Deixe o cartão de emergência e a folha de rotina à vista. Se algo mudar, me avise.

**B.3 Cuidador cancelou: aviso à família**

> Oi, [NOME]. [NOME DO CUIDADOR] precisou cancelar o plantão de [DIA e HORA]. Já estou ligando para outros cuidadores e te aviso por volta das [HORA]. Ainda não tenho certeza de que conseguiremos repor. Se preferir, você pode escolher: outro horário, outro dia ou um familiar cobrir. O que prefere?

**B.4 Plantão sem cobertura**

> Oi, [NOME]. Infelizmente não consegui cuidador para [DIA e HORA]. Tentei [N] pessoas. O que você prefere: (1) mudar o horário para [OPÇÃO]; (2) outro dia; (3) um familiar cobre este turno? Se nenhuma opção servir, cancelo o plantão no app. O pagamento desse turno é direto entre vocês; o WorkEasy não cobra nem repassa nada por ele **[CONDICIONAL: depende de parecer]**. Peço desculpas pelo transtorno.

**B.5 Convite a cuidador reserva**

> Oi, [NOME]! Preciso de cobertura para [DIA], das [INÍCIO] às [FIM], na região de [BAIRRO], para uma pessoa idosa que precisa de companhia e apoio na rotina. Valor: R$ [VALOR]. Você consegue? Se sim, aceite a oferta no app, em "Plantões". Só aceite depois de falar comigo.

**B.6 Domingo à noite: disponibilidade**

> Oi, [NOME]! Para a semana de [DATAS], quais dias e horários você tem livres? Se puder ficar de reserva, me diga os dias. Lembrete: o limite é de 2 dias diferentes por semana na mesma casa.

**B.7 Dia seguinte: pesquisa de duas perguntas à família**

> Oi, [NOME]! Como foi o plantão de ontem com [NOME DO CUIDADOR]? 1) De 1 a 5, que nota você dá? 2) Algo que devemos ajustar? Se alguma coisa te preocupou, me ligue.

**B.8 Caso fora do escopo: recusa e encaminhamento**

> Obrigado por contar a situação de [PRIMEIRO NOME]. Pelo que você descreveu, [PRECISA DE UM PROCEDIMENTO TÉCNICO / FICA ACAMADA], e isso pede um profissional de saúde. O WorkEasy Cuidado é um serviço de companhia e apoio no dia a dia, sem procedimento de saúde, e não conseguimos atender esse caso adequadamente. Sugiro procurar [uma empresa de home care licenciada / a equipe de saúde que já acompanha / a unidade de saúde]. Se mais adiante a necessidade mudar, será um prazer conversar de novo.

**B.9 Candidato: decisão sobre o cadastro**

> Olá, [NOME]. Analisamos o seu cadastro. Neste momento não vamos seguir com o seu perfil na linha de cuidado para pessoas idosas. [MOTIVO NEUTRO: documento ilegível / referência não confirmada / critério da linha]. Se quiser reenviar [DOCUMENTO] ou conversar, é só me chamar. Agradecemos o seu interesse.

**B.10 A família pediu algo fora do escopo ao cuidador**

*À família:*
> Oi, [NOME]. Fiquei sabendo que foi pedido ao cuidador [aplicar uma injeção / fazer um curativo / separar os remédios]. No WorkEasy Cuidado o cuidador não faz isso, mesmo com receita: é um limite do nosso serviço. Peço que a família ou um profissional de saúde cuide dessa parte. Podemos continuar apenas com companhia e apoio à rotina. Combinado?

*Ao cuidador:*
> Você fez bem em recusar. Se isso se repetir, me avise.

**B.11 Incidente: aviso à família (fato, sem culpa, sem diagnóstico)**

> Oi, [NOME]. Preciso te contar o que aconteceu hoje às [HORA]: [FATO, em uma ou duas frases]. O que foi feito: [AÇÃO, por exemplo: o SAMU foi chamado às HH:MM]. Agora: [SITUAÇÃO]. Posso te ligar agora? Vou registrar tudo e te dou retorno às [HORA].

**B.12 Cuidador faltou sem avisar**

> Oi, [NOME]. Hoje o plantão das [HORA] na casa de [PRIMEIRO NOME] ficou sem você e eu não fui avisado. Preciso entender o que aconteceu. Pode me ligar? Por enquanto não vou te escalar em novos plantões. **[CONDICIONAL: depende de parecer]**

**B.13 Cobrança de relatório**

> Oi, [NOME]! O relatório do plantão de [DIA] ainda não chegou. Pode enviar pelo app, em "Plantões"? Lembrando: texto simples, sem remédio, dose ou sintoma.

---

## Anexo C. Cartão de emergência para imprimir

Preenchido pela **família**, colado em lugar visível na casa (porta da geladeira), com uma cópia para o cuidador. O texto é fixo; o médico regulador decide a conduta. **Confira 190 e 193 antes de imprimir** (seção 10.4). **A frase do cartão sobre remédio (bloco "O CUIDADOR NÃO") é a regra da seção 3.3 e depende de revisão do enfermeiro e do advogado [CONDICIONAL: depende de parecer]: imprima só depois dela.**

```
CARTÃO DE EMERGÊNCIA: [PRIMEIRO NOME DA PESSOA]

EM URGÊNCIA, LIGUE 192 (SAMU) PRIMEIRO.
Faça só o que o médico regulador disser ao telefone.
Se você não tem certeza se é urgência, ligue e conte o que está vendo.
O médico regulador decide.

ENDEREÇO PARA DIZER AO TELEFONE:
[RUA, NÚMERO, COMPLEMENTO, BAIRRO, CEP, PONTO DE REFERÊNCIA]

DEPOIS DE LIGAR PARA O 192, AVISE:
1) [NOME / PARENTESCO] ....... [TELEFONE]
2) [NOME / PARENTESCO] ....... [TELEFONE]
Operador WorkEasy Cuidado: [NOME] ....... [TELEFONE]

Hospital de preferência, se houver (quem decide é o médico regulador): [______]
Documentos da pessoa ficam em: [LOCAL]

O CUIDADOR NÃO: aplica injeção, faz curativo, mexe em sonda, bolsa, oxigênio ou soro,
nem dá remédio por conta própria. No máximo lembra o horário e entrega a dose que a família já separou.

Suspeita de maus-tratos contra pessoa idosa: Disque 100 (24 horas).
Bombeiros / Polícia Militar: [CONFIRMAR OS NÚMEROS ANTES DE IMPRIMIR]
```

---

## Anexo D. Caderno de incidentes e planilhas (colunas)

Crie como planilha com senha e verificação em duas etapas, só você acessa. Não use grupo de WhatsApp. Não escreva diagnóstico.

**D.1 Incidentes**

| Coluna | Conteúdo |
|---|---|
| `id` | `I-AAAAMMDD-NN` |
| `evento_em` / `registrado_em` | Data e hora do evento / do registro |
| `registrado_por` | Quem escreveu |
| `plantao_id` | UUID do plantão, se houver (A.1) |
| `casa` / `cuidador` | Apelido interno, não o nome completo |
| `categoria` | I1 a I15 (seção 11.2) |
| `gravidade` | G1 a G4 (seção 11.3) |
| `resumo` | Fatos, em ordem, com horas. Sem opinião, sem diagnóstico |
| `socorro` | Sim ou não; hora; quem atendeu; destino |
| `avisados` | Quem foi avisado e quando |
| `desfecho` | Como terminou |
| `acao_corretiva` / `responsavel` / `prazo` | O que muda, quem faz, até quando |
| `status` / `fechado_em` | Aberto, em revisão ou fechado |
| `comunicacao_externa` | Disque 100, polícia, seguradora, ANPD: quando e por quem |

**D.2 Famílias:** `id`, responsável, telefone, relação, início, escala combinada, triagem 1 a 9 (sim ou não), data dos aceites, próxima ligação, notas.

**D.3 Cuidadores:** `id`, nome, telefone, contato de emergência do cuidador, bairros, entrada no banco, data dos documentos aceitos, emissão e reconferência da certidão, data do briefing e da declaração, cancelamentos tardios, faltas, status (ativo, pausado, suspenso), notas.

**D.4 Banco semanal:** semana, cuidador, dias livres, casas já usadas na semana, observações.

**D.5 Decisões sobre candidatos:** data, candidato, decisão, motivo, quem decidiu.

**D.6 Pesquisa pós-plantão:** data, casa, nota de 1 a 5, comentário.

---

*Fim do manual.*
