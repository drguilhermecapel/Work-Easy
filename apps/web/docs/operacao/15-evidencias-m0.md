# M0 — Primeira medição e decisão de passagem

**27/11/2026 · execução iniciada.** A decisão operacional é manter M0 aberto e aguardar evidência de demanda, oferta e condições comerciais antes de selecionar corredor ou iniciar viagens. A decisão de produto e o modelo já estão publicados. [Roadmap](15-mobilidade-de-prestadores.md) · [PR #45](https://github.com/drguilhermecapel/Work-Easy/pull/45)

## O que foi medido

A consulta foi executada em produção em transação de leitura. O SQL permite repetir a mesma verificação. A saída tem somente agregados. [Consulta M0](mobilidade-diagnostico-m0.sql)

| Indicador em 27/11/2026 UTC | Resultado |
|---|---:|
| Distritos candidatos encontrados no catálogo | 5 de 5 |
| Pedidos registrados no marketplace, em todo o histórico | 0 |
| Pedidos das três ocupações candidatas nos cinco distritos, últimos 90 dias | 0 |
| Atendimentos de origem plataforma concluídos ou liberados | 0 |
| Prestadores candidatos aprovados, com ocupação aprovada e aceitando pedidos | 0 |
| Comissão e pagamento retido | Desligados |

Os agregados medem registros no aplicativo. Conferi também, com acesso interno de leitura, a planilha Funil Comercial e Metas do Piloto SP (45 Dias). O painel tinha zero serviços pagos e zero prestadores aprovados. Nas linhas preenchidas dos registros, os campos de bairro/categoria/status de pedidos e etapa de recrutamento estavam vazios. A planilha ainda não fornece uma matriz de origens, destinos e horários para escolher o corredor. Registros que estejam em outros canais precisam ser conciliados com Operações. Cadastro de bairro-base e área atendida não identificam o ponto efetivo de saída. A futura matriz deve trazer janela, deslocamento e equipamentos reais nas unidades de agregação de O01. Se a consulta retornar linhas positivas, conferir a lista de contas de teste antes de usá-las para tomar decisão. [Plano concierge](01-plano-de-45-dias-concierge.md) · [Definições de medição](08-metricas-e-portoes.md)

O último workflow de publicação web consultado falhou em duas verificações: projeto/domínio do Pages e remetente/modelos de login. O responsável pela captação pode usar registros autorizados do concierge enquanto Infraestrutura confirma o canal e faz um ensaio autenticado controlado. [Execução](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45742108646) · [Registro de entrega](14-entrega-multiplataforma.md)

## Cesta sintética para consultar os dois operadores

Os trajetos abaixo servem para comparar condições. A escolha foi feita com pontos públicos nos distritos candidatos. Pedir ao operador distância e duração pela rota utilizada. A confirmação de cobertura comercial e a seleção da microárea real dependem dos dados de Operações.

| Caso | Comparação solicitada |
|---|---|
| Ida e volta independentes | Terça, chegada às 9h30 da estação Jabaquara à estação Saúde. Volta após três horas. Pedir categoria para um passageiro e uma caixa de ferramentas portátil de 45 × 30 × 20 cm, com 5 kg. |
| Término antecipado ou tardio | Para o mesmo trajeto, simular volta 60 minutos antes ou depois da prevista. Comparar dois veículos, volta reagendada e três horas de espera cotada por hora. |
| Continuação da agenda | Quinta, origem na estação Saúde e chegada às 9h30 à estação Vila Mariana. Após três horas, continuação à estação Moema, com retorno final à Saúde antes do fim da cobertura proposta. Discriminar recibos e preço por trecho. |
| Falha ou cancelamento | Pedir custo, pagador e prazo de confirmação para ausência no embarque, falta de carro, mudança do destino e cancelamento já embarcado. Incluir regras para extras e contingência. |

Usar a cesta com as duas minutas e guardar eventual resposta comercial em acesso interno. [Minutas](15-consulta-a-operadores.md)

## Ensaio econômico realizado

Usei os valores recalculados do XLSX de O09, com D5 desligada e repasse a custo como hipótese. A tabela mede quanto faltaria para equilibrar cada visão **se a única variável alterada fosse a contribuição líquida adicional por viagem com serviço concluído**, mantendo a conversão, os custos e o volume do cenário. Os valores são uma medida da lacuna, sem prescrever taxa ou modalidade ao operador.

| Cenário | Viagens com serviço na oferta, valor esperado | Δ MC por elegível | Adicional por viagem para zerar Δ MC unitária | Adicional por viagem para zerar resultado gerencial da coorte |
|---|---:|---:|---:|---:|
| Conservador | 15 | −R$ 3,24 | R$ 10,80 | R$ 176,97 |
| Base | 20 | −R$ 2,06 | R$ 5,15 | R$ 131,61 |
| Favorável | 27,5 | −R$ 0,91 | R$ 1,65 | R$ 95,45 |

O cálculo unitário divide o déficit por elegível pela fração de elegíveis com viagem e serviço concluído. O cálculo da coorte divide o déficit total pelo número esperado dessas viagens. Os valores exibidos estão arredondados. No Base, a necessidade de giro é R$ 2.724 e o gasto bruto comprometido é R$ 3.271,50. Recebimentos posteriores não devolvem capacidade ao limite bruto aprovado. Nesta escala, reduzir custo de plantão, aumentar volume comparável ou obter preço e conversão diferentes pode mudar mais o resultado do que mexer na margem por trecho. É preciso medir essas variáveis antes de comprometer caixa. [Modelo e planilha](09-modelo-financeiro.md)

## Evidências ainda necessárias

| Responsável | Evidência que fecha a próxima decisão |
|---|---|
| Comercial e Jurídico | Respostas escritas da Uber e da COOPERTAX, com instrumento, vigência, pagador, papéis permitidos, modalidade de cobrança, seguro e contingência. A consulta pede informação e cotação. A decisão de contratar é posterior. |
| Operações | Agregados autorizados do concierge ou do app, separados de testes, e oferta observada nos dois sentidos. Confirmar um corredor, uma categoria, alternativa viável e escala de titular e suplente até o último retorno. |
| Financeiro e responsável pelo orçamento | Cotação real por trecho, tarifa e prazo do PSP, recebível e forma fiscal, custo da escala, caixa bruto e giro. Aprovar o limite de M1 por escrito. |
| Engenharia, Produto e Operações | Com as evidências anteriores, pré-registrar análise, validar o canal de atendimento, ensaiar consentimento, cancelamento incerto e conciliação, e obter a decisão de abertura de M1. M2 depende também de acesso homologado. M3 e M4 dependem da evidência operacional e econômica prevista no roadmap. |

Nesta rodada, MOB-01 tem publicação verificada. MOB-03 tem diagnóstico inicial do banco e conferência da planilha do concierge, ainda sem dados de campo para selecionar o corredor. MOB-04 tem simulação conferida, ainda sem preços e condições de um parceiro. Os demais cartões mantêm as dependências de O15. [Critérios do roadmap](15-mobilidade-de-prestadores.md)
