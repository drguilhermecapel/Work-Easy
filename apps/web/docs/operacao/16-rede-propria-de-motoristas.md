# O16 · Rede própria de motoristas

Decisão de 27/11/2026. O WorkEasy cadastra motoristas e intermedeia corridas em veículos deles. O passageiro pode pedir uma corrida avulsa ou agendada. Um prestador pode aceitar transporte opcional para viabilizar um serviço da plataforma. O orçamento do serviço, o consentimento para viajar e a autorização do pagador de cada trecho são atos independentes. O cliente pode manter o atendimento com profissional próximo ou deslocamento próprio.

## Onde consultar

| Decisão | Fonte principal |
|---|---|
| Regra de 10%, transição do Pro, categorias e vigência | [D14 e portões financeiros de serviços](../DECISOES.md) |
| Preço próprio, referência Uber/99, sensibilidade, renda e caixa | [O09](09-modelo-financeiro.md) e [planilha](09-modelo-financeiro.xlsx) |
| Capacidades, autorizações, estados, dados e integrações | [Arquitetura](../ARQUITETURA.md#rede-direta-de-motoristas) |
| Escala e adesão por corredor | [Operação concierge](01-plano-de-45-dias-concierge.md#rede-direta) |
| Experimento e limites | [Portões da rede direta](08-metricas-e-portoes.md#rede-direta) |
| Exceções, controles e recuperação | [Runbook](../RUNBOOKS.md#rede-direta-de-motoristas) |
| Habilitação da empresa e do motorista, termos, recibo, guarda e fiscalização | [Matriz jurídica](../juridico/13-rede-direta-de-motoristas.md) e [minutas de consulta](../juridico/14-minutas-rede-direta.md) |
| Estratégia anterior e medição conciliada | [Transporte contratado](15-mobilidade-de-prestadores.md) e [evidências de campo](15-evidencias-m0.md) |

## Auditoria e escolhas do produto

A base de desenvolvimento foi a main `92b86109a730eaf33271db866d3558932fdb0822`, consultada em 27/11/2026. PRs 45 e 46 integraram D13, O15 e o diagnóstico. A implementação principal é React/Vite, Capacitor e Supabase em apps/web. O registro de implantação do backend de serviços e os ensaios de pré-release têm escopo por canal. O resultado histórico da verificação de Pages, autenticação no domínio público e as pendências de aparelhos físicos constam de O14. A leitura de localização do Cuidado mede um ponto. O novo compartilhamento precisa de sessão do motorista, autorização no servidor e ensaio físico específico. [Commit](https://github.com/drguilhermecapel/Work-Easy/commit/92b86109a730eaf33271db866d3558932fdb0822) · [O14](14-entrega-multiplataforma.md)

Banco e funil do concierge registraram zero pedidos e zero prestadores candidatos aptos. Não há amostra observada de corridas públicas, preço por km local ou teste de recompra. Limpeza, montagem e manutenção leve são hipóteses de recrutamento. Selecionar área e ocupação a partir de solicitações reais, origem e disponibilidade do profissional, ticket, duração e equipamentos transportáveis. Para a rede pública, verificar também aproximação vazia, disponibilidade de retorno e cobertura em cada faixa horária.

| Arranjo | Critério econômico e escolha |
|---|---|
| Motoristas parceiros cadastrados diretamente | Modelo escolhido em D14 para atender público e prestadores. A WorkEasy assume custos de seleção, conformidade, despacho, atendimento e incidentes. Publicar apenas regiões e horários com cobertura observada. |
| Operador existente por trecho | Alternativa de contingência mediante instrumento permissivo e autorização para aquele custo. O benchmark público da Uber/99 não dá acesso a veículos ou a dados comerciais. |
| Capacidade dedicada de terceiro | Comparar valor do turno, espera, quilômetros vazios, seguro e disponibilidade por sentido com o custo integral do despacho próprio. |
| Veículos da WorkEasy | Em M4, avaliar financiamento, seguro, condutor, manutenção, garagem, depreciação e utilização com dados de campo; investimento exige orçamento específico. |

## Backlog e aceite

A referência de R$ 800 por dia-pessoa serve à estimativa de engenharia. Contrato, credenciamento, seguros, homologações de terceiros, aprovação de loja e observação em campo têm calendário próprio. A definição de pronto de todo cartão inclui revisão de código/documento, prova do aceite no ambiente indicado, registro do SHA/execução e indicação das dependências abertas. Nenhuma simulação entra como viagem comercial.

| ID e prioridade | Problema e resultado | Dependências e responsável | Aceite e evidência que encerra o cartão |
|---|---|---|---|
| REDE-01 · M0/P0 · 4–8 d (R$ 3,2–6,4 mil) | A estratégia anterior considerava a rede apenas condicional. Publicar D14 e modelo para os dois mercados. | Produto, Finanças e Jurídico. Base de O15 e consulta municipal. | Documentos e XLSX conciliados, origens medidas, respostas e evidência do enquadramento registradas. PR sozinho conclui a parte documental. |
| REDE-02 · M1/P0 | Cadastro único precisa aceitar motorista e veículo habilitados. | Identidade atual, REDE-01. Engenharia e Operações. | Pessoa pode manter perfil de cliente ou prestador. Motorista pendente, veículo vencido ou revisor da própria ficha ficam bloqueados. Prova por usuário e por papel. |
| REDE-03 · M1/P0 | Passageiro público e prestador precisam solicitar e comparar preços. | 01/02. Produto e Engenharia. M1 total 15–25 d (R$ 12–20 mil). | Testar imediata e agendada, consentimento por pagador, ida/volta, recusa mantendo atendimento, expiração e repetição idempotente. |
| REDE-04 · M2/P0 | Respostas concorrentes ou timeout podem duplicar viagem, posição ou despacho. | 02/03. Engenharia mobile e backend. | Duas sessões concorrentes, conflito com agenda, perda de internet, tela bloqueada, sinal antigo, recusa, indisponibilidade e encerramento do GPS. Logs minimizados e prova física nos dois sistemas. |
| REDE-05 · M2/P0 | Comissão de serviço, dinheiro da viagem e documentos precisam fechar separadamente. | 01/03, jurídico e PSP. Financeiro e Engenharia. M2 total 35–60 d (R$ 28–48 mil). | Verificar primeiro/recorrente, D6, carteira própria, centavos por trecho, parcial/estorno/disputa e cancelamento depois de embarcar. Conferir caixa, repasse e recibo por ID; homologação própria do PSP. |
| REDE-06 · M3/P0 | A operação deve cobrir os dois sentidos sem depender da atividade clínica do fundador. | 04/05, orçamento, seguro, habilitações, caixa e escala. Coordenação e suplente. | Plantão completo até o retorno, ensaio de falta de veículo, marcação de chegada, auditoria de acesso e conciliação diária. Declaração de abertura distinta do deploy. |
| REDE-07 · M3/P0 | A adesão ao preço e o efeito econômico ainda são desconhecidos. | 01–06 e prazo de observação. Dados e Finanças. M3 engenharia 8–15 d (R$ 6,4–12 mil) mais operação. | Sorteio antes de ofertar, recusas no denominador, desfechos completos por mercado e intervalo de incerteza. Emitir parecer operacional e decisão econômica separadamente. |
| REDE-08 · M4/P1 | Expandir com pouca oferta reduz a renda/hora e a pontualidade. | 06/07 e margem incremental sustentável. Produto e Operações. 5–12 d (R$ 4–9,6 mil). | Estudo de capacidade por origem, sentido e hora; comparar custo marginal de expansão e fixos da frota. Abrir um corredor por decisão registrada e com critério de recuo. |

## Registro dos marcos

A escala do concierge conserva G1–G4, um ponto cada, ou três quando a exclusão de G4 estiver documentada em O08. D13 conserva M0–M3 com pesos 15/30/35/20 e **0/100 etapas encerradas** na última medição; documentos e testes têm evidência própria. O estudo condicional de M4 daquele modelo fica fora desse denominador. A rede direta usa 10/20/35/25/10 pontos para M0–M4. Pontuar ao cumprir todos os aceites de uma etapa, inclusive evidência externa quando exigida. No início desta branch, o novo placar era **0/100**. Avanço de engenharia pode ocorrer enquanto a consulta jurídica tramita.

A branch e o PR registram a implementação e as verificações de software. A decisão de encaminhar minutas, o deferimento de credenciamento, a aprovação individual, a homologação de PSP, a publicação, a primeira corrida real, o encerramento do piloto e a demonstração de benefício devem receber datas e fontes próprias. O orçamento autorizado nesta revisão é R$ 0. [PR da rede direta](https://github.com/drguilhermecapel/Work-Easy/pull/47)


### Capacidade e expansão com dados reais

Para cada corredor e faixa, estimar a ocupação do motorista por minutos de viagem remunerada divididos pelos minutos online. Recalcular custo por corrida concluída incluindo aproximação, retorno sem passageiro, espera, custo variável e turnos sem demanda. No estudo de capacidade dedicada, o ponto de equilíbrio em corridas por turno é o custo fixo adicional do turno dividido pela economia variável por corrida em relação à alternativa atual. Se a economia for zero ou negativa, o turno dedicado não se paga com o aumento de volume sob aquelas premissas. Para veículos próprios, incluir depreciação, seguro, motorista, manutenção, financiamento e valor residual, com os mesmos quilômetros vazios e taxa de utilização. A linha de base de 27/11 sustenta manter aquisição de frota e expansão suspensas até haver volume e renda de campo.
