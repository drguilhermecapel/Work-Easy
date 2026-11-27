# Modelo financeiro e de cenários (planilha 09)

> **Rascunho para revisão do dono, do contador e do advogado.** Não é previsão de receita, não é parecer contábil nem jurídico e não é promessa a clientes ou investidores. Todo número é premissa. Os valores do modelo e a mobilidade aguardam validação com usuários reais. O backend foi implantado em 25/11/2026. A pré-release de 26/11 contém pacotes web e desktop. O estado da publicação no domínio final está no [registro de entrega](14-entrega-multiplataforma.md).

A [planilha 09](09-modelo-financeiro.xlsx) preserva o modelo de 36 meses de 08/11/2026. A revisão de 27/11/2026 acrescenta mobilidade, corrige a elegibilidade de D5 e passa a exigir contagens observadas no portão de disputa. Os valores de mobilidade são hipóteses de simulação. A [decisão comercial](../DECISOES.md), os [portões do piloto](08-metricas-e-portoes.md) e o [roadmap](15-mobilidade-de-prestadores.md) orientam o uso.

---

A estratégia atual é a **rede direta D14**, com corridas públicas e transporte opcional vinculado a serviços. Comece pela seção 11 e pelas quatro abas com prefixo `D14`. As seções 1–10 preservam a base e os cenários do arranjo com operador externo, que passou a alternativa.

## 1. Como usar

1. Abra o arquivo e comece pela aba `README`.
2. Escolha o cenário em **`Premissas!D4`**: `Conservador`, `Base` ou `Otimista`. Todas as abas recalculam. O arquivo sai com `Base`. Confirme também o **fator r** em `Premissas!F61` (0 = folha abaixo de 28% da receita, padrão; 1 = acima).
3. Edite só as células **azuis**. As pretas são fórmulas; não as sobrescreva.
4. Preencha as células marcadas **[PREENCHER]** (amarelas): caixa inicial, contabilidade, outros fixos, custo da hora de suporte e renda clínica por hora (C). Com C = 0, a comparação de renda não é calculada.
5. Leia a aba **`Portões`** antes de ligar a comissão (`p_comis_on` = 1) ou o bloco Cuidado (`p_cuid_on` = 1). Os dois começam desligados, como em `DECISOES.md` §1.

Cores: azul = entrada; preto = fórmula; verde = link direto entre abas; amarelo = escolha de cenário ou valor a conferir/preencher. Os nomes `p_...` (Fórmulas > Gerenciar nomes) apontam para o cenário ativo.

## 2. Abas do horizonte original

| Aba | O que mostra | O que você mexe |
|---|---|---|
| README | finalidade, avisos, legenda, fontes e limites | nada |
| Premissas | todas as entradas, com fonte, data e etiqueta; faixas de infraestrutura; tabela do Simples | D4 (cenário); colunas C a E (cenários); coluna F (valores fixos) |
| Funil | por mês: cadastros, aprovados, ativos, testes, pagantes, usuários, atendimentos; modelo de coortes de 36 meses com conferência | nada (só fórmulas) |
| Receita | mensalidade Pro; comissão (interruptor e teto); margem do Cuidado (interruptor) | nada na aba (interruptores em Premissas) |
| Custos | infraestrutura por faixa; tarifas de cobrança; WhatsApp; suporte pago; fixos | nada |
| Resultado | impostos; resultado mensal; caixa; equilíbrio; resumo nas linhas 44 a 61 | nada |
| Sensibilidade | grades de conversão × churn (MRR, meses 12 e 24); cadastros × conversão (pagantes, mês 12); comissão × ticket; absorção da tarifa | valores de eixo (azuis) |
| Portões | semáforo dos portões de `DECISOES.md` §4 e §5; verificações de tarifas e impostos; metas do plano | Sim/Não, contagens reais de serviços pagos e em disputa, evidência e período |

## 3. Lógica das fórmulas

**Funil (um mês por linha, 36 meses).** Os valores abaixo são do cenário ativo.

- Cadastros = `p_c1 × (1 + p_g_cad)^(mês − 1)`.
- Aprovados = cadastros × `p_aprov`. Novos ativos = aprovados × `p_ativ`.
- Prestadores ativos (estoque) = ativos do mês anterior × (1 − `p_churn_ativ`) + novos ativos.
- Iniciam o teste = novos ativos × `p_ts`. Testes que terminam no mês = os que iniciaram no mês anterior (defasagem de um mês, aproximação dos 30 dias).
- Novos pagantes = testes que terminam × `p_tc`.
- Pagantes (estoque) = pagantes do mês anterior × (1 − `p_churn_pag`) + novos pagantes.
- Atendimentos = ativos × `p_atend`. O volume cobrado pelo app é atendimentos × `p_pago`. A coluna N considera cobrados × `p_first` (primeiro cliente novo da plataforma) × `Premissas!F82` (fração com política elegível, 70% ilustrativos). A participação do catálogo e a procura observada medem coisas distintas.
- Usuários = ativos × (1 + `p_cpp`).

**Modelo de coortes** (Funil, linhas 45 a 85): cada coorte que entra num mês contribui com `novos pagantes × (1 − churn)^(meses desde a entrada)`. A soma das coortes é conferida contra o estoque; a célula **B85** mostra "OK".

**Receita.**
- Mensalidade = pagantes × `p_preco` (R$ 49).
- Comissão de D5 por serviço em centavos = `min(15000, piso(preço_em_centavos × 1200 / 10000))`. O modelo parte da comissão desligada. No código, origem própria, ocupação sem `comissao_primeiro_servico` e histórico anterior do par com serviço de plataforma concluído/liberado e pagamento recebido/confirmado/liberado dão zero. O código trata teto configurado em zero como ausência de teto. A aba `Regra D5` exercita truncamento, teto de R$ 150, histórico do par, origem, política e flag global. Para simular a configuração sem teto, alterar `Premissas!F30` e inspecionar a coluna G. A projeção liga a taxa somente aos primeiros elegíveis e aplica o teto por faixa de ticket antes de ponderar (`Premissas!F83:F84`, por padrão 0% com ticket alto). [Regra SQL](../../supabase/migrations/20261022000012_monetization.sql) · [Testes de monetização](../../supabase/tests/database/13_monetization.test.sql)
- Margem do Cuidado = interruptor × plantões × (valor − repasse). Desligado por padrão.

**Custos.**
- Infraestrutura = total da faixa de usuários em R$ (faixas na Premissas, seção E). O crédito de US$ 10 da Supabase cobre só uma instância Micro; faixas maiores entram pelo preço cheio.
- Tarifa das cobranças do Pro = pagantes × tarifa de Pix do mês (R$ 0,99 nos 3 primeiros meses; depois R$ 1,99), com parcela de cartão (0% até conferir).
- Tarifa dos atendimentos = atendimentos cobrados × tarifa × parcela absorvida (`p_absorcao`, 100% por padrão).
- WhatsApp = (atendimentos × 5 + propostas × 1 + usuários × códigos × parcela por WhatsApp) × US$ 0,0068 × câmbio.
- Suporte pago = (pagantes × 0,35 h − 150 h do fundador), quando positivo, × R$ 50/h.
- Fixos = contabilidade + outros.

**Impostos e resultado.**
- Modo 1 (padrão): com fator r < 28% (`p_r28` = 0), alíquota efetiva do **Anexo V** sobre todas as receitas (mensalidade Pro, comissão e Cuidado); com r ≥ 28% (`p_r28` = 1), Anexo III sobre todas. Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12, com **RBT12 aproximado = receita do mês × 12**. Modo 2: um % único. ISS adicional sobre a receita (0% por padrão).
- Resultado operacional = receita bruta − impostos − custos.
- Caixa acumulado = caixa do mês anterior + resultado (o mês 1 parte do caixa inicial).
- **Equilíbrio sustentado** = mês seguinte ao último mês com resultado negativo. Um mês positivo isolado não conta como equilíbrio.
- Renda por hora do WorkEasy = resultado do mês 12 ÷ horas do fundador (150 h), comparada com C.

## 4. Cenários

Premissas por cenário (valores da planilha; todas são estimativas, salvo a mensalidade e as regras):

| Premissa | Conservador | Base | Otimista |
|---|---|---|---|
| Cadastros de prestadores no mês 1 (por mês) | 120 | 200 | 250 |
| Crescimento mensal dos cadastros | 3% | 4% | 5% |
| Cadastros que viram aprovados | 55% | 60% | 70% |
| Aprovados que viram ativos | 55% | 60% | 70% |
| Churn mensal de prestadores ativos | 15% | 10% | 5% |
| Ativos novos que iniciam o teste | 40% | 50% | 60% |
| Testes que viram pagamento | 8% | 15% | 25% |
| Churn mensal dos pagantes | 7% | 5% | 3% |
| Atendimentos por prestador ativo por mês | 1,5 | 2,0 | 3,0 |
| Atendimentos cobrados pelo app | 30% | 50% | 70% |
| Ticket médio | R$ 150 | R$ 200 | R$ 250 |
| Atendimentos com primeiro cliente da plataforma | 40% | 60% | 75% |
| Propostas por prestador ativo por mês | 2 | 3 | 4 |
| Clientes por prestador ativo | 2 | 3 | 4 |

**Resultados do horizonte original de 36 meses**, com comissão e Cuidado desligados. Nesta visão histórica o fundador fornece até 150 horas antes de contratar suporte. A visão gerencial com coordenação delegada está na seção 10.

| Saída | Conservador | Base | Otimista |
|---|---|---|---|
| Pagantes do Pro no mês 12 | 10,9 | 58,2 | 228,5 |
| Pagantes do Pro no mês 36 | 31,8 | 226,8 | 1.187,9 |
| Mensalidade no mês 12 | R$ 532 | R$ 2.854 | R$ 11.199 |
| Resultado operacional no mês 12 | −R$ 348 | −R$ 65 | +R$ 466 |
| Resultado operacional no mês 36 | −R$ 141 | +R$ 2.707 | −R$ 3.600 |
| Equilíbrio sustentado (mês) | não atinge em 36 | 13 | não atinge em 36 |
| Caixa adicional necessário | R$ 11.903 | R$ 4.787 | R$ 4.452 |
| Caixa acumulado no mês 36 | −R$ 11.903 | R$ 24.445 | R$ 1.035 |

Leitura: no Otimista, o resultado do mês 36 fica negativo (−R$ 3.600). A receita do mês é só a mensalidade (R$ 58.205); saem R$ 28.842 de tarifa absorvida pela plataforma, R$ 13.288 de suporte pago acima das horas do fundador e R$ 10.525 de imposto (Anexo V). Sem a absorção da tarifa, o mesmo mês daria R$ 25.243. No Base, o mês 12 já é negativo (−R$ 65) e o equilíbrio vem no mês 13. A absorção é o maior risco do modelo (ver seção 7).

**Variantes testadas** (base, salvo indicação):

| Variante | Pagantes mês 12 | Resultado mês 12 | Resultado mês 36 | Observação |
|---|---|---|---|---|
| Comissão ligada apenas para simulação | 58,2 | +R$ 5.712 | +R$ 20.120 | R$ 24 por primeiro atendimento elegível, com hipótese de 70% de ocupações elegíveis entre os primeiros do par. A simulação do fluxo financeiro não abre o portão real |
| Cuidado ligado (Otimista, 20 plantões por mês) | 228,5 | +R$ 1.987 | −R$ 2.151 | margem de R$ 90 por plantão |
| Modo 2 (10% da receita) e 30% no cartão (2% + R$ 0,49) | 58,2 | −R$ 407 | +R$ 1.779 | valores do cartão **não verificados**: só mostram sensibilidade |

**Sensibilidade (cenário Base).**
- MRR no mês 12: de R$ 772 (conversão de 5%, churn de 10%) a R$ 5.430 (conversão de 25%, churn de 2%).
- Pagantes no mês 12 com 15% de conversão: 14,6 com 50 cadastros por mês; 58,2 com 200. Para 50 pagantes, seriam cerca de 172 cadastros por mês desde o mês 1 (escala linear).
- Receita de comissão no mês 12, com taxa de 12%: R$ 3.418 com ticket de R$ 100, R$ 6.836 com R$ 200 e R$ 42.723 com R$ 1.250 (teto de R$ 150 aplicado).
- Resultado do mês 36 pela parcela absorvida: R$ 6.884 (0%); R$ 4.795 (50%); R$ 2.707 (100%).

## 5. Verificações feitas

- **Histórico de 08/11/2026. Recálculo** com LibreOffice (`recalc.py`, do skill xlsx): 3.522 fórmulas e **0 erros** no arquivo entregue e em nove variantes (Conservador, Base, Otimista, comissão ligada, Cuidado ligado, modo 2 com cartão e três de absorção), após as correções de 08/11/2026 listadas abaixo.
- A réplica independente do modelo completo de 08/11 não está no repositório. Na revisão de 27/11, as novas contas por solicitação foram conferidas por aritmética independente e comparação com as células recalculadas (seção 10).
- **Coortes = estoque** de pagantes (Funil, B85 = "OK").
- **Grade de MRR = Receita** do mês 12 no cenário ativo (Sensibilidade, B21 = "OK").
- Valores em cache: o arquivo mostra os números mesmo sem recálculo.
- **Correções de 08/11/2026** (revisão externa): (1) mensalidade Pro com r < 28% passa ao Anexo V (LC 123, art. 18, §5º-M, II), com o interruptor `p_r28`; (2) infraestrutura: o crédito de US$ 10 da Supabase cobre só o Micro, e faixas maiores pagam o preço cheio; (3) `Resultado!E58` somava a tarifa cheia e agora soma a tarifa absorvida (só mudava o valor quando a absorção não era 100%); (4) fontes: a tabela do Asaas conflita com o blog no Pix, a data "as of July 1, 2026" do WhatsApp não foi confirmada, e a seção 5.2 citada na Premissas G11 não existe em `operacao/02`.

## 6. Fontes

Todas abertas em **08/11/2026**, salvo indicação.

| Item | Fonte (URL) | Data ou atualização da fonte | O que foi usado |
|---|---|---|---|
| Pix e boleto (Asaas) | https://blog.asaas.com/taxas-asaas/ (blog oficial, não é a tabela de tarifas) | publicado em 26/09/2025; atualizado em 23/04/2026 | Pix: R$ 0,99 nos 3 primeiros meses e R$ 1,99 depois, por cobrança recebida. 100 Pix gratuitos por mês para chave ou QR estático (não modelado). Boleto sem taxa de emissão. |
| Asaas (tabela oficial) | https://www.asaas.com/precos-e-taxas | lida em 08/11/2026, **parcial** | Pix e boleto: "R$ 1,59" e "R$ 0,79" por transação recebida (sem rótulo; duas leituras em 08/11/2026), **em conflito** com o blog (R$ 1,99 e R$ 0,99); cartão de débito "R$ 0,35 + 1,89%". **A seção de cartão de crédito não apareceu.** |
| Supabase | https://supabase.com/pricing | sem data na página | Pro a partir de US$ 25 por organização; US$ 10 de crédito cobrem só um Micro, e tamanhos maiores pagam o preço cheio; Small US$ 15, Medium US$ 60, Large US$ 110. Moeda assumida como US$ pelo símbolo [incerto]. |
| Resend | https://resend.com/pricing | sem data na página | Free: 3.000 e-mails por mês e 100 por dia; Pro US$ 20 (50 mil) e US$ 35 (100 mil); excedente US$ 0,90 por mil. Moeda assumida como US$ [incerto]. |
| Cloudflare Pages | https://developers.cloudflare.com/pages/platform/limits/ | atualizado em 05/09/2026 | Free: 500 builds por mês; Pages Functions cobradas como Workers. |
| Cloudflare Workers | https://developers.cloudflare.com/workers/platform/pricing/ | atualizado em 02/10/2026 | Workers Paid: US$ 5 por mês (mínimo). |
| WhatsApp (Meta) | https://developers.facebook.com/docs/whatsapp/pricing e https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages | vigência das tabelas a partir de 1º/10/2026; a data "as of July 1, 2026" **não foi confirmada** | Brasil: 0,68 centavo (moeda não rotulada) por mensagem de utilidade e autenticação; utilidade dentro da janela de 24 h cobrada a partir de 1º/10/2026; 1.000 mensagens de serviço gratuitas por número por mês; tabela em R$ **não aberta** (cartões CSV/PDF). A segunda URL não foi reaberta. |
| Câmbio | API PTAX do Banco Central (https://olinda.bcb.gov.br, CotacaoDolarDia, 06/11/2026) | cotação das 13:06:13 de 06/11/2026 | venda R$ 5,5013. Converter na data de uso. |
| Simples Nacional | LC 123/2006, art. 18, §§ 5º-B, 5º-D, 5º-I, 5º-J, 5º-M e tabelas dos Anexos III e V: https://www2.camara.leg.br/legin/fed/leicom/2006/leicomplementar-123-14-dezembro-2006-548099-normaatualizada-pl.html | texto consolidado; as notas citam LC 155/2016, LC 214/2025 e LC 227/2026 | faixas e alíquotas dos Anexos III e V (conferidas nesta revisão); fator r de 28% (§5º-J); intermediação no Anexo V (§5º-I, VII); licenciamento de programas (§5º-D, V) vai ao Anexo V quando o fator r é menor que 28% (§5º-M, II) |
| ISS | LC 116/2003, art. 8, II: https://www2.camara.leg.br/legin/fed/leicom/2003/leicomplementar-116-31-julho-2003-492028-publicacaooriginal-1-pl.html; art. 8-A (inserido pela LC 157/2016): https://www2.camara.leg.br/legin/fed/leicom/2016/leicomplementar-157-29-dezembro-2016-784155-publicacaooriginal-151767-pl.html | texto original (2003); inserção (2016) | teto de 5% (art. 8, II) e piso de 2% (art. 8-A) |
| Repositório | `DECISOES.md` §1 a §7; `ARQUITETURA.md` (`platform_settings`, `compute_platform_fee`, cobranças, assinatura Pro, `shifts`); `operacao/01-plano-de-45-dias-concierge.md` (linhas 30 e 41); `operacao/05-templates-whatsapp.md`; `pesquisa/whatsapp-e-email.md` | — | regras do produto, premissas e limites |

**Tentativas que não deram o texto:** o Planalto (`lcp123.htm`) bloqueou a leitura automatizada (página de acesso negado; por isso usei o texto consolidado da Câmara). As páginas `asaas.com/precos`, `asaas.com/taxas` redirecionaram para login; `docs.asaas.com/docs/taxas-e-tarifas` deu 404.

## 7. Limites do modelo

**Premissas não medidas.** Nenhuma taxa de aquisição, aprovação, conversão ou churn foi medida. A faixa de 50 a 250 pagantes no mês 12 é a encomenda desta planilha: não consta em `operacao/` nem em `DECISOES.md`, e não é resultado.

**Aquisição necessária.** O cenário Base parte de 200 cadastros por mês. A meta do plano de 45 dias é 50 prestadores aprovados em 45 dias (`operacao/01`, linha 41), ou seja, cerca de 55 cadastros por mês com aprovação de 60%. Com as demais premissas do Base, isso daria cerca de 16 pagantes no mês 12 (escala linear de 58,2 × 55,6 ÷ 200). Ou seja: **a faixa pedida exige 3,6 vezes o ritmo de recrutamento previsto para os 45 dias.** O semáforo em `Portões` marca isso.

**Absorção da tarifa.** `ARQUITETURA.md` diz que "a plataforma absorve a parte proporcional da tarifa" do split, mas não define a proporção quando a comissão é zero. Assumi 100%, o pior caso. Com comissão desligada, o custo de tarifa cresce com os atendimentos e pode anular o resultado (no Otimista, o mês 36 fica negativo; seção 4 e Sensibilidade, grade E).

**Fora do horizonte histórico (o piloto usa os livros adicionais da seção 10):** pagamento retido (escrow, desligado); IBS e CBS da LC 214/2025; seguros, inclusive o de responsabilidade civil do Cuidado; folha e pró-labore; depreciação; capital de giro dos repasses; inadimplência, disputas e reembolsos; a fase concierge de 45 dias como custo separado; domínio; custos de abertura do CNPJ e de jurídico; o limite de 100 Pix gratuitos por mês do Asaas; o Cloudflare Pages (assumido sem custo, plano Free). O fluxo de hospedagem do site usa Cloudflare Pages. A disponibilidade no domínio final continua sujeita à verificação da entrega.

**Infraestrutura.** As faixas usam os planos da Supabase e do Resend. A página da Supabase diz que o crédito de US$ 10 cobre só uma instância Micro e que tamanhos maiores pagam o preço cheio; a planilha segue isso [confirmar na fatura]. `DECISOES.md` §6 estima R$ 470 a 710 por mês com 1.000 ativos; a planilha dá R$ 330 na faixa de 1.000 a 4.999 usuários. A diferença não foi reconciliada; o plano pode incluir itens que a planilha não tem.

**Impostos.** A alíquota efetiva usa RBT12 aproximado (receita do mês × 12); a lei usa a soma dos 12 meses anteriores. Sem dado de folha, assumi fator r = 0. Pela LC 123, art. 18, §5º-M, II, com r < 28% o licenciamento de programas (§5º-D) também vai ao Anexo V; por isso a mensalidade Pro, a comissão e o Cuidado pagam a alíquota do Anexo V (15,5% na primeira faixa). Com r ≥ 28%, `p_r28` = 1 aplica o Anexo III. Não confirmei se a LC 227/2026, citada nas notas do texto consolidado, alterou as tabelas [incerto]. O enquadramento (anexos, ISS, LC 227/2026) é decisão do contador.

**Câmbio e moeda.** Uma cotação (06/11/2026). Supabase e Resend mostram "$" sem código de moeda; tratei como US$ [incerto]. A tarifa do WhatsApp em R$ não foi conferida.

**Entradas pendentes do horizonte original.** Caixa inicial, contabilidade (R$ 300/mês, sem cotação), outros fixos (R$ 0), custo da hora de suporte (R$ 50), horas do fundador (150) e renda clínica por hora (C = 0) são premissas do modelo. Estão marcados e devem ser substituídos.

## 8. Pendências

1. **Tarifa de cartão de crédito do Asaas** (taxa percentual e parcela fixa): não verificada. Preencher em `Premissas` (`p_card_pct`, `p_card_fixo`) com o valor do painel. Portões, item 13.
2. **Tarifa de Pix**: o blog do Asaas diz R$ 0,99 nos 3 primeiros meses e R$ 1,99 depois; a tabela oficial, lida em 08/11/2026, mostra R$ 1,59 e R$ 0,79 sem rótulo. Conferir no painel da conta de produção e ajustar `p_pix_promo` e `p_pix_reg` em `Premissas`. Portões, item 14.
3. **Tarifa do WhatsApp em R$** (cartão de preços do Brasil): não aberta; a data "as of July 1, 2026" não foi confirmada. Portões, item 15.
4. **Quem paga a tarifa do split** quando a comissão é zero: a ARQUITETURA não define. Decisão de produto e de contrato com o Asaas antes de ligar pagamento pelo app em escala. Portões, item 12.
5. **Enquadramento Simples (anexos III e V), fator r e ISS** com o contador; o modelo usa o Anexo V com fator r < 28% (LC 123, art. 18, §5º-M, II). Portões, item 16.
6. **Medir o funil real** (cadastro, aprovação, ativação, teste, pagamento) e substituir as premissas. Até lá, a faixa do plano é uma hipótese.
7. **Caixa inicial e custos fixos** (contador, domínio, ferramentas, seguro) com cotação real.

## 9. Achados sobre o produto (registrados, não corrigidos)

- A ARQUITETURA não define quem arca com a tarifa do split quando a comissão é zero (ver seção 7).
- `DECISOES.md` §6 (infraestrutura de R$ 470 a 710 com 1.000 ativos) não bate com os planos da Supabase e do Resend lidos aqui (cerca de R$ 330 nessa faixa). Não sei de onde vem a estimativa do plano.
- A meta de 50 aprovados em 45 dias (`operacao/01`) não leva à faixa de 50 a 250 pagantes no mês 12 (faixa da encomenda, não encontrada no repositório) com as taxas de conversão e churn de `DECISOES.md` §6–§7. A distância é de cerca de 3,6 vezes no cadastro (ver seção 7).


## 10. Histórico D13 — piloto com operador externo

### Como reproduzir

Abra a [planilha](09-modelo-financeiro.xlsx). As colunas C, D e E de `Mobilidade` mostram os três cenários simultaneamente. F segue `Premissas!D4`, onde o nome histórico **Otimista** seleciona o cenário **Favorável**. As entradas são sintéticas. A linha 101 verifica coerência aritmética, a 102 indica dados econômicos provisórios, a 112 verifica orçamento bruto e a 121 mostra o estado contratual. Os valores de um arranjo sem instrumento representam exclusivamente o que aconteceria sob aquela hipótese.

| Aba | Pergunta que responde |
|---|---|
| Mobilidade | Quanto cada fluxo custa por pedido, por solicitação elegível e no conjunto de quatro semanas? |
| Regra D5 e Modelos de serviço | O valor em centavos segue a regra do par e da ocupação? Quanto o prestador paga com cada alternativa? |
| Sens piloto | Como mudam cotação, margem e contribuição ao variar um fator ou o contrato? As colunas auxiliares H:T de Mobilidade usam as mesmas fórmulas dos três cenários. |
| Coortes Pro | Quanto cada coorte mensal gera após cobrança, suporte delegado e CAC dos novos pagantes? A linha 46 concilia a assinatura reconhecida com Receita em cada mês. |
| Mensal gerencial | Qual resultado do negócio em 36 meses sob coordenação delegada? Qual o incremento de uma coorte da oferta sobre o controle já representado no funil? |
| Caixa piloto e Compromissos | Em que dia falta caixa e qual orçamento bruto já foi consumido ou comprometido, mesmo que o principal seja posteriormente reembolsado? |

### Preço, recibo e contribuição

O prestador recebe o preço do serviço menos a comissão aplicável. Os volumes de serviço e mobilidade permanecem separados. No cenário de repasse a custo, o valor recebido de mobilidade sai para o operador. No subsídio, o pagador entrega menos que o custo e a diferença aparece uma vez. Na hipótese de margem, o acréscimo autorizado acompanha a cobrança do deslocamento. Na indicação paga pelo parceiro, o passageiro paga o operador diretamente. O livro da plataforma registra só a comissão contratada como entrada de mobilidade. A comparação de R$ 5 assume uma remuneração por pedido com transporte e serviço concluídos, incluindo os trechos previstos. Se o contrato pagar por trecho, calcular o valor a partir dos trechos elegíveis e de seus recibos antes de somar por pedido. Nos exemplos de indicação, o operador assume a despesa do transporte cancelado e a WorkEasy ainda incorre em suporte. Outro instrumento exige adaptar estes fluxos.

```text
MC_pedido = comissão de serviço + entrada de mobilidade no livro da plataforma
            − saída de mobilidade ao operador − custos variáveis do pedido
MC_por_elegível = soma das contribuições dos pedidos, recusas, tentativas e cancelamentos
                  / todas as solicitações elegíveis atribuídas ao braço
renda_líquida_hora = (repasse do serviço − custos próprios)
                     / (horas de serviço + deslocamento total + espera)
```

Registrar as receitas/despesas por componente e a retenção do PSP. O reconhecimento contábil bruto ou líquido, as notas fiscais, a base tributável e os impostos dependem de quem contrata, cobra e assume a obrigação. O contador fornece os valores aplicáveis ao fluxo. `Mobilidade!45:46` registra custo incremental e confirmação. Uma entrada fiscal provisória em zero mantém a conclusão econômica pendente. A MC é gerencial. O resultado mensal também deduz aquisição e fixos. Para declarar lucro líquido, conciliar livros, tributos, folha, provisões e encerramento contábil.

Com R$ 200 por serviço e dois serviços no mês para o mesmo par, após a liberação de D5 a comissão isolada soma R$ 24. As hipóteses do D13 geram R$ 24 na recorrente de 6% (teto R$ 75), R$ 49 na assinatura isolada e R$ 37 no híbrido de R$ 29/mês mais 4% só no primeiro elegível (teto R$ 50). Em categoria restrita, a comissão permanece zero, inclusive na recorrência. Testar cada preço separadamente, com transparência sobre renda/h, retenção e conversão. [Decisões de produto](../DECISOES.md)

### Cenários de quatro semanas

Cada célula abaixo é hipótese. O exemplo usa 50 solicitações por braço, ticket de R$ 200, 50% de primeiros do par, 100% de política elegível **entre os primeiros desta coorte simulada** e R$ 2 de custo variável por serviço concluído. O cenário de 36 meses usa outro mix, explicitado na seção 3. Nenhuma assinatura entra no pedido. Nas três colunas a hipótese comercial é repasse permitido a custo e duas reservas, com volta ou continuação. Os adiantamentos, tarifas reais e política de extras devem ser obtidos antes de contratar.

| Por solicitação elegível, salvo indicação | Conservador | Base | Favorável |
|---|---:|---:|---:|
| Conversão sem oferta | 50% | 60% | 65% |
| Incremento da conversão com oferta | +2 pp | +8 pp | +15 pp |
| Viagem com serviço / elegíveis | 30% | 40% | 55% |
| Viagem onerosa sem serviço / elegíveis | 5% | 3% | 1% |
| Coordenação incremental por viagem com serviço | R$ 8 | R$ 4 | R$ 1 |
| Perda líquida por viagem sem serviço, com coordenação | R$ 16 | R$ 10 | R$ 6 |
| **ΔMC oferta menos controle, D5 desligada** | **−R$ 3,24** | **−R$ 2,06** | **−R$ 0,91** |
| **ΔMC oferta menos controle, D5 ligada após portões** | **−R$ 3,00** | **−R$ 1,10** | **+R$ 0,89** |

No Base, a MC de serviço é −R$ 2 com D5 desligada. A diferença entre os braços é `0,08 × (−2) − 0,40 × 4 − 0,03 × 10 = −2,06`. Após habilitar D5, a MC média de serviço passa a `0,5 × 24 − 2 = 10`, e a diferença passa a −R$ 1,10. O primeiro elegível gera R$ 24 de comissão e a recorrência gera zero. Um ticket de R$ 100,09 gera R$ 12,01, e tanto R$ 1.250 quanto R$ 5.000 geram R$ 150,00. Cliente próprio, política restrita e flag desligada também dão zero.

A cotação Base é R$ 18,00 de ida e R$ 18,50 pelo segundo trecho ponderado entre volta e continuação. O custo final de R$ 36,50 passa pelos livros de mobilidade. Se o condutor aguardar as três horas de serviço a R$ 40/h, a cotação passa a R$ 156,50 e excede a autorização ilustrativa de R$ 120. A operação solicita nova autorização ou oferece outro transporte. Uma diferença posterior já incorrida entra pelo custo final, com ônus em aberto até conciliação. No Base a renda/h do prestador com D5 desligada é `(200 − 10) / (3 + 0,75 + 0,20) = R$ 48,10` com transporte e `(200 − 18) / (3 + 1 + 0,25) = R$ 42,82` sem oferta. `Mobilidade!84:91` mostra primeiro serviço e recorrência independentemente.

As despesas usam R$ 50/h de operador e R$ 100/h como hipótese substituta da hora do fundador enquanto a renda clínica em `Premissas!F57` estiver em branco ou zero. Informar C substitui o valor provisório e é condição de decisão. A escala reserva 48 horas remuneradas (terças e quintas, 9h–15h durante quatro semanas). O custo pago em cada viagem é descontado do saldo de cobertura da escala para evitar dupla contagem. Acrescentar o sobreaviso do suplente se for adicional, duas horas fixas de supervisão e, se aplicável, tempo de cotação/recusa de **todas** as solicitações em `Mobilidade!116:117`. O cenário-base supõe zero minutos incrementais de contato geral além do processo de controle. A aba de sensibilidade testa mais dois minutos por elegível. Agendar apenas quando titular e suplente puderem cobrir o ciclo completo.

Em `Sens piloto`, o retorno integral eleva a cotação Base a R$ 38,00. Continuação integral resulta em R$ 32,00. Dinâmica ×1,5 leva a R$ 48,75. Com recuperação integral, variações de distância podem não alterar a MC unitária, mas mudam teto, caixa e aceitação do preço. Mais cinco minutos de operador por viagem reduzem o delta Base de −R$ 2,06 para −R$ 3,73 com D5 desligada. Subsidiar R$ 10/viagem o reduz a −R$ 6,06. Margem de R$ 5 expressamente permitida leva a −R$ 0,06. Na indicação de R$ 5, o delta é +R$ 0,21 quando o operador absorve o custo do seu próprio transporte cancelado e a plataforma conserva o suporte. O instrumento padrão sem autorização de remuneração mantém a receita comercial zero. Essas diferenças são hipóteses para negociar e testar.

### Resultado mensal, competência e caixa

A aba `Coortes Pro` agrupa pagantes pelo mês de entrada e desconta tarifa do PSP, suporte e aquisição uma vez. A soma das mensalidades das coortes reconcilia com a assinatura reconhecida no mês. Os custos por coorte medem sua contribuição antes de tributos e fixos. A aba `Mensal gerencial` parte do resultado original, estorna o suporte já lançado, precifica todas as horas de suporte delegadas e desconta CAC. Com `B3=0` a mobilidade fica fora do resultado mensal. Com `B3=12` o mês 12 recebe uma única coorte de quatro semanas, pelo **incremento da oferta sobre o controle**. Se os públicos do funil e do piloto forem independentes, manter livros separados até conciliá-los.

| Com D5, Cuidado e coorte piloto desligados | Conservador | Base | Favorável |
|---|---:|---:|---:|
| Resultado gerencial no mês 12 | −R$ 538,04 | −R$ 1.083,79 | −R$ 3.533,23 |
| Resultado gerencial no mês 36 | −R$ 697,01 | −R$ 1.262,15 | −R$ 11.099,53 |
| Resultado gerencial acumulado nos 36 meses | −R$ 22.074,32 | −R$ 39.346,88 | −R$ 190.345,96 |

No mês escolhido para o piloto, o delta gerencial Base inclui 50 elegíveis na oferta, reservas de escala e supervisão. São **−R$ 2.632,25** com D5 desligada, sob estas premissas. O custo de oportunidade do fundador é econômico. O fluxo de caixa registra eventual desembolso efetivo a ele separadamente.

`Caixa piloto` distribui o volume esperado por oito turnos e mostra os dois braços. A hipótese é serviço liquidado pelo PSP em split e principal do prestador creditado diretamente na subconta. A plataforma recebe sua comissão de serviço e os valores de mobilidade contratados. Entradas estão em D+7, transporte em D+0 e estornos de serviços em D+14, todos editáveis em 0–30 dias. A maior necessidade acumulada do Base é **R$ 2.724,00** partindo de caixa zero. Conciliar datas, falhas de pagamento, adiantamentos, disputas, perdas e recuperações por ocorrência. Lançar o estorno líquido após reversão do repasse evita deduzir o mesmo valor duas vezes. O caixa é volátil mesmo com igual resultado por competência.

O orçamento operacional de quatro semanas é R$ 5.000 **brutos**. Inclui coordenação/suplência, todo pagamento ao operador e obrigações futuras, inclusive retorno, extras e cancelamento incerto. A exposição para novas reservas é `desembolso bruto já feito + compromissos ainda não pagos + próximo compromisso`. Ao pagar, baixar o saldo da obrigação pelo mesmo ID. Recebimentos e reembolsos obtidos têm coluna própria. A folha de caixa compara gasto bruto e pico de giro separadamente. O subsídio admite até R$ 10 por solicitação e até R$ 300 dentro do orçamento. Encerrar ao atingir prazo ou saldo. A aba `Compromissos` comporta 300 obrigações, calcula o saldo pendente por ID, soma subsídios dos trechos do mesmo pedido e bloqueia IDs duplicados ou tabela cheia. A reserva proposta usa as linhas 306–311. O gasto bruto Base é R$ 3.271,50. Um estresse com transporte mais caro e recuperação no mesmo dia exige R$ 2.541,50 de giro, mas consome R$ 6.261,50 de orçamento e interrompe novas reservas. Os limites de engenharia pertencem a outro orçamento. [Portões](08-metricas-e-portoes.md)

### Verificação desta revisão

A planilha final foi salva após recálculo real no LibreOffice e reaberta para inspeção das 16 abas, 59 nomes definidos e 8.941 fórmulas. Foram conferidos os valores em cache, inclusive os retornos vazios intencionais das linhas livres de `Compromissos`. A revisão percorreu 16 casos distintos, incluindo o arquivo padrão, e verificou os seguintes resultados.

- Conservador, Base e Favorável reproduzem os seis deltas da tabela. Os 36 meses de mensalidades por coorte conciliam ao centavo com `Receita`. O gasto bruto diário concilia com `Mobilidade!111`.
- D5 ligada apenas para projeção, ticket alto, corte em centavos, recorrência e política restrita preservam a regra. Com 50% de tickets de R$ 2.000 e 50% de R$ 200, a comissão média do primeiro elegível é `(150 + 24) / 2 = R$ 87`.
- O portão permanece amarelo com 19 serviços reais informados, fica verde em seu item de volume/disputa com 20 pagos e 1 em disputa e vermelho com 20 pagos e 2 em disputa. Testes usam referências fictícias identificadas. Os demais portões continuam independentes.
- Indicação hipotética de R$ 5 registra apenas R$ 5 recebidos e zero de desembolso ao operador. Sem a permissão comercial, registra zero nos dois fluxos. A promoção de R$ 30 pretendidos fica limitada a R$ 7,50 em 40 viagens, R$ 300 no total.
- Zero solicitações mantém o custo da escala já comprometida. A MC unitária de cenário permanece uma estimativa; contribuição empírica com denominador zero é indeterminada. Duração total zero produz “n/d”. Retorno, espera de três horas, custo clínico informado e estorno em D+14 alteram apenas os componentes correspondentes.
- Custo superior ao autorizado bloqueia a hipótese. R$ 4.950 já pagos ou comprometidos mais R$ 51 na próxima reserva interrompem o piloto mesmo com ressarcimento. Subsídios de R$ 6 na ida e R$ 5 na volta do mesmo pedido ultrapassam o teto individual e exigem correção. O caso de R$ 6.261,50 de gasto bruto interrompe mesmo com giro inferior ao teto.

Usar simulação para escolher quais dados levantar. Para a decisão comercial, substituir hipóteses por cotação e recibo de cada parceiro, tarifa efetiva do PSP, enquadramento do contador, custos de escala/suplência e tempo clínico, separando simulações, perdas em disputa e fatos conciliados. O portão dos 20 serviços e menos de 10% em disputa exige contagens observadas e referência do período em `Portões!C33:C36`.

## 11. D14 — rede direta de motoristas

As corridas públicas avulsas e os trechos vinculados ao atendimento usam a mesma regra de 10% da tarifa comissionável, truncada em centavos em cada trecho, sem teto. Extras discriminados e aprovados, como pedágio, passam ao motorista. Os serviços intermediados de ocupação e versão expressamente habilitadas cobram somente 10% em **cada serviço**, inclusive recorrente, sem teto ou assinatura nesse regime. Clientes próprios permanecem fora. Ocupações restritas mantêm a política aplicável e transações antigas mantêm D5. A projeção simula condições pós-portão. A evidência M0 registra zero pedidos no app e zero serviços pagos no funil inspecionado. [Regra comercial D14](../DECISOES.md#d14-rede-direta-de-motoristas-e-comissão-recorrente-de-10) · [Medição de campo e limites](15-evidencias-m0.md)

### Preço próprio, comparáveis e renda

Em `D14 Preço`, a tarifa própria antes de extras é o maior entre o mínimo e a soma de base, quilômetros ocupados × preço/km e minutos × preço/min. A tabela de simulação do app é versionada e a distância é do servidor. A planilha permite variar os parâmetros. Os exemplos econômicos de R$ 6 de base, R$ 2/km, R$ 0,40/min e mínimo de R$ 12 constituem uma hipótese distinta da tarifa sintética do app. Na cesta ilustrativa, ida de 8 km/20 min e volta de 6,5 km/15 min custam R$ 30 e R$ 25. A comparação sintética UberX/99Pop de R$ 32/R$ 28 na ida e R$ 27/R$ 23 na volta serve apenas para testar a análise. Não há preço real de Uber ou 99 medido nessa planilha.

Para calibrar, comparar preços de passageiros em viagens equivalentes, separadas por rota, data, horário, antecedência, modalidade, extras e subsídios. Registrar fonte, permissão de uso, amostra, dispersão, validade e preço efetivo por km. Usar dados licenciados ou pesquisa independente permitida. Frente a ausência de dado utilizável, manter tarifa interna identificada e informar a lacuna. O acesso a endpoints de estimativa de outra plataforma exige verificar as condições para o uso pretendido. [Uber, formação de preço](https://www.uber.com/br/pt-br/marketplace/pricing/) · [99, preço variável](https://99app.com/ajuda/passageiro/como-funciona-o-preco-variavel/) · [Termos da API Uber](https://developer.uber.com/docs/businesses/terms-of-use)

O motorista precisa cobrir quilômetros com passageiro, aproximação e reposicionamento, além de tempo de espera e ociosidade. Na ida de R$ 30, o motorista recebe R$ 27. Com 12 km totais a R$ 0,70 e 35 minutos online atribuídos, a renda é `(27 − 12 × 0,70) / (35/60) = R$ 31,89/h`. Para uma meta ilustrativa de R$ 25/h, o piso conservador é R$ 25,54. O piso da plataforma, com R$ 2 variáveis/trecho e zero custo proporcional, é R$ 20. O piso geral deve considerar ambos e os custos fixos. Se os custos variáveis percentuais sobre a tarifa consumirem os 10%, o piso da plataforma aparece como inviável. O ensaio com custo ad valorem de 12% leva a MC da ida pública a **−R$ 2,60**. Reavaliar rota, custo e tarifa antes de qualquer oferta com novo preço. [Tabela e despacho no servidor](../../supabase/migrations/20261127000101_direct_ride_network.sql)

### Dois mercados, três cenários

No exemplo Base, o cliente paga R$ 255 por um serviço de R$ 200, ida de R$ 30 e volta de R$ 25. O prestador recebe R$ 180, os motoristas recebem R$ 27 e R$ 22,50 e a plataforma tem R$ 20 do serviço e R$ 5,50 de viagens. A soma fecha em R$ 255. Se o prestador pagar os dois trechos, seu saldo após o transporte cai a R$ 125 antes de outros custos próprios. Se o serviço for restrito, sua comissão é zero e a comissão de transporte se aplica apenas às viagens efetivamente contratadas. Uma corrida pública de R$ 30 gera uma comissão de R$ 3, sem serviço. Em R$ 30,09 mais R$ 25,09, os centavos truncados por trecho produzem R$ 3 + R$ 2,50.

`D14 Mercados` calcula os cenários simultaneamente. A coorte hipotética tem 60 solicitações de serviço e 40 de corridas avulsas. O custo variável ilustrativo é R$ 2 por serviço concluído e R$ 2 por trecho. Em D14 o split preserva o repasse contratado e a plataforma absorve a tarifa integral do PSP. A linha 59 de D14 Mercados aceita a parcela percentual sobre o **preço cheio do serviço**, além da parcela fixa/risco da linha 14. No Base, 2% sobre R$ 7.200 adicionam R$ 144 ao custo. D5 conserva o tratamento anterior. No Base, 36 serviços são concluídos, 12 usam ida e volta e o público completa 30 corridas. Cada segmento sofre uma perda de cancelamento de R$ 6. O GMV é R$ 7.200 de serviços e R$ 1.560 de viagens. Os repasses somam R$ 6.480 aos prestadores e R$ 1.404 aos motoristas. A plataforma recebe comissões de R$ 720 e R$ 156. O caixa devido a terceiros não é receita. A abordagem de reconhecimento por agente/principal depende do contrato e do contador.

| Saídas da coorte, em reais | Conservador | Base | Favorável |
|---|---:|---:|---:|
| MC do serviço e viagens vinculadas por solicitação de serviço | 8,95 | 11,00 | 12,91 |
| MC por solicitação avulsa pública | 0,25 | 0,60 | 0,78 |
| MC ponderada por solicitação de ambos os mercados | 5,47 | 6,84 | 8,05 |
| MC total da coorte antes de aquisição e fixos | 547,00 | 684,00 | 805,42 |
| Resultado gerencial parcial da coorte | −2.053,00 | −1.916,00 | −1.794,58 |

As duas comissões não garantem viabilidade. No Base, a MC das viagens vinculadas isoladas é R$ 12 e a do público é R$ 24. As 48 horas de coordenação a R$ 50/h e duas horas de supervisão a R$ 100/h custam R$ 2.600 no mês. As linhas 5–29 permitem variar conversão, viagens por atendimento, retorno ou continuação, cancelamentos, custo por turno, CAC, subsídio, chargeback e quem financia a viagem. `D14 Preço` varia distância vazia, tempo online e incidência variável. A coorte é uma projeção antes de confirmar escala/suplência, seguros, tributos e tarifas locais. Um denominador zero produz “n/d”.

### Migração, caixa e validação

`D14 Mensal` projeta 36 meses e traz a assinatura do funil uma vez por conta e mês, sem ratear por corrida nem somar D5+D14 ao mesmo serviço. A coluna B escolhe quantas coortes independentes considerar em cada mês. Cada coorte tem seu próprio plantão. A coluna L informa o estoque de contas migradas que deixaram de pagar Pro naquele mês, após terminar o período já pago. A receita remanescente aparece em M. Preservar os Pro restritos e os planos ainda devidos em contas mistas. O resultado ajusta a contribuição do Pro que saiu e mantém CAC de períodos anteriores. Somar os custos de aquisição/recrutamento, tributos e despesas realmente aplicáveis antes de concluir sobre lucro. Em dois serviços de R$ 200 para o mesmo par, D5 anterior ligada cobraria R$ 24 no primeiro e zero no segundo. A versão D14 elegível após aceite e vigência cobra R$ 20 em cada. Serviço de R$ 5.000 elegível gera R$ 500 sob D14. [Aceite e elegibilidade no banco](../../supabase/migrations/20261127000201_service_commission_agreements.sql)

`D14 Caixa` separa o crédito direto ao prestador/motorista no PSP do dinheiro que efetivamente entra/sai da conta da operação. O Base pressupõe split direto, recebíveis em D+7, eventual obrigação de desembolso ao motorista em D+0 e perdas por estornos em D+14. Com caixa inicial zero, o maior giro ilustrativo é R$ 1.935 e os desembolsos brutos somam R$ 2.592. O resultado de caixa de −R$ 1.716 difere do gerencial em R$ 200 de oportunidade clínica sem desembolso. A alternativa de financiamento bruto é um teste de estresse. Ela exige arranjo contratual adequado, custeio e reconciliação, e não autoriza custódia. O teto D13 de M1 pertencia ao arranjo com operador externo. O orçamento da rede direta, o seguro e a escala precisam de autorização própria.

O livro do trecho registra competência apenas na conclusão, preserva a tarifa e os destinatários aceitos e separa captura de repasse. O ensaio administrativo registra falha ou estado incerto, bloqueia uma segunda operação até conciliar a primeira e mantém a referência estável na reentrega. No reembolso/chargeback, reverte extras e parte comissionável nos centavos originais. Após repasse, eventual saldo do motorista a recuperar é contabilizado separadamente de uma nova transferência. O cancelamento com motorista atribuído abre revisão de custo. Um desfecho incerto conserva a pendência. Após confirmação, Operações registra despesa comprovada assumida pela plataforma e referência interna, inclusive para valor zero. A despesa fica separada da cobrança do passageiro e da comissão. O ensaio manual e o adaptador de PSP em homologação são mutuamente exclusivos por trecho. Nenhuma dessas operações muda o estado ou o pagamento do atendimento de serviço. [Migração do livro financeiro](../../supabase/migrations/20261127000301_direct_ride_ledger.sql) · [Cenários de integração](../../supabase/tests/database/20261127_direct_ride_ledger.test.sql)

A planilha final tem **20 abas e 10.185 fórmulas**, recalculadas no LibreOffice. A leitura dos caches confirmou ausência de erros e preservação de todos os valores numéricos das 16 abas anteriores com os parâmetros originais. A conciliação dos dois GMVs e o fechamento do caixa contra competência zeram nos cenários conferidos. O ensaio inclui três cenários, custo ad valorem acima de 10%, split direto ou financiamento, migração de assinantes, piso de renda, ambos os mercados com volume zero, serviço restrito, recálculo sem teto, retorno versus continuação e dedução de duas corridas do líquido do prestador.
