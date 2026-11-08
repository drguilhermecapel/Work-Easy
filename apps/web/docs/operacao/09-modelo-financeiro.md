# Modelo financeiro e de cenários (planilha 09)

> **Rascunho para revisão do dono, do contador e do advogado.** Não é previsão de receita, não é parecer contábil nem jurídico e não é promessa a clientes ou investidores. Todo número é premissa. Nada aqui é validado com usuários reais: o produto não está implantado.

Arquivo: `apps/web/docs/operacao/09-modelo-financeiro.xlsx` (referência: 08/11/2026). Este documento explica a planilha; não repete todas as premissas, que estão em `Premissas`, com fonte e data.

---

## 1. Como usar

1. Abra o arquivo e comece pela aba `README`.
2. Escolha o cenário em **`Premissas!D4`**: `Conservador`, `Base` ou `Otimista`. Todas as abas recalculam. O arquivo sai com `Base`.
3. Edite só as células **azuis**. As pretas são fórmulas; não as sobrescreva.
4. Preencha as células marcadas **[PREENCHER]** (amarelas): caixa inicial, contabilidade, outros fixos, custo da hora de suporte e renda clínica por hora (C). Com C = 0, a comparação de renda não é calculada.
5. Leia a aba **`Portões`** antes de ligar a comissão (`p_comis_on` = 1) ou o bloco Cuidado (`p_cuid_on` = 1). Os dois começam desligados, como em `DECISOES.md` §1.

Cores: azul = entrada; preto = fórmula; verde = link direto entre abas; amarelo = escolha de cenário ou valor a conferir/preencher. Os nomes `p_...` (Fórmulas > Gerenciar nomes) apontam para o cenário ativo.

## 2. Abas

| Aba | O que mostra | O que você mexe |
|---|---|---|
| README | finalidade, avisos, legenda, fontes e limites | nada |
| Premissas | todas as entradas, com fonte, data e etiqueta; faixas de infraestrutura; tabela do Simples | D4 (cenário); colunas C a E (cenários); coluna F (valores fixos) |
| Funil | por mês: cadastros, aprovados, ativos, testes, pagantes, usuários, atendimentos; modelo de coortes de 36 meses com conferência | nada (só fórmulas) |
| Receita | mensalidade Pro; comissão (interruptor e teto); margem do Cuidado (interruptor) | nada na aba (interruptores em Premissas) |
| Custos | infraestrutura por faixa; tarifas de cobrança; WhatsApp; suporte pago; fixos | nada |
| Resultado | impostos; resultado mensal; caixa; equilíbrio; resumo nas linhas 44 a 61 | nada |
| Sensibilidade | grades de conversão × churn (MRR, meses 12 e 24); cadastros × conversão (pagantes, mês 12); comissão × ticket; absorção da tarifa | valores de eixo (azuis) |
| Portões | semáforo dos portões de `DECISOES.md` §4 e §5; verificações de tarifas e impostos; metas do plano | Sim/Não e % de disputa |

## 3. Lógica das fórmulas

**Funil (um mês por linha, 36 meses).** Os valores abaixo são do cenário ativo.

- Cadastros = `p_c1 × (1 + p_g_cad)^(mês − 1)`.
- Aprovados = cadastros × `p_aprov`. Novos ativos = aprovados × `p_ativ`.
- Prestadores ativos (estoque) = ativos do mês anterior × (1 − `p_churn_ativ`) + novos ativos.
- Iniciam o teste = novos ativos × `p_ts`. Testes que terminam no mês = os que iniciaram no mês anterior (defasagem de um mês, aproximação dos 30 dias).
- Novos pagantes = testes que terminam × `p_tc`.
- Pagantes (estoque) = pagantes do mês anterior × (1 − `p_churn_pag`) + novos pagantes.
- Atendimentos = ativos × `p_atend`; cobrados pelo app = atendimentos × `p_pago`; com primeiro cliente da plataforma = cobrados × `p_first`.
- Usuários = ativos × (1 + `p_cpp`).

**Modelo de coortes** (Funil, linhas 45 a 85): cada coorte que entra num mês contribui com `novos pagantes × (1 − churn)^(meses desde a entrada)`. A soma das coortes é conferida contra o estoque; a célula **B85** mostra "OK".

**Receita.**
- Mensalidade = pagantes × `p_preco` (R$ 49).
- Comissão por atendimento = `MIN(ticket × 12%, teto de R$ 150)`; sem teto se o teto for 0. Receita de comissão = interruptor × atendimentos com primeiro cliente da plataforma × comissão por atendimento. A regra segue `ARQUITETURA.md` (`compute_platform_fee`).
- Margem do Cuidado = interruptor × plantões × (valor − repasse). Desligado por padrão.

**Custos.**
- Infraestrutura = total da faixa de usuários em R$ (faixas na Premissas, seção E).
- Tarifa das cobranças do Pro = pagantes × tarifa de Pix do mês (R$ 0,99 nos 3 primeiros meses; depois R$ 1,99), com parcela de cartão (0% até conferir).
- Tarifa dos atendimentos = atendimentos cobrados × tarifa × parcela absorvida (`p_absorcao`, 100% por padrão).
- WhatsApp = (atendimentos × 5 + propostas × 1 + usuários × códigos × parcela por WhatsApp) × US$ 0,0068 × câmbio.
- Suporte pago = (pagantes × 0,35 h − 150 h do fundador), quando positivo, × R$ 50/h.
- Fixos = contabilidade + outros.

**Impostos e resultado.**
- Modo 1 (padrão): alíquota efetiva do Anexo III sobre a mensalidade e do Anexo V sobre comissão e Cuidado. Alíquota efetiva = (RBT12 × alíquota nominal − parcela a deduzir) ÷ RBT12, com **RBT12 aproximado = receita do mês × 12**. Modo 2: um % único. ISS adicional sobre a receita (0% por padrão).
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

**Resultados do modelo** (comissão e Cuidado desligados, padrão):

| Saída | Conservador | Base | Otimista |
|---|---|---|---|
| Pagantes do Pro no mês 12 | 10,9 | 58,2 | 228,5 |
| Pagantes do Pro no mês 36 | 31,8 | 226,8 | 1.187,9 |
| Mensalidade no mês 12 | R$ 532 | R$ 2.854 | R$ 11.199 |
| Resultado operacional no mês 12 | −R$ 298 | +R$ 262 | +R$ 1.585 |
| Resultado operacional no mês 36 | +R$ 62 | +R$ 3.818 | +R$ 593 |
| Equilíbrio sustentado (mês) | 34 | 10 | 7 |
| Caixa adicional necessário | R$ 8.325 | R$ 3.109 | R$ 2.092 |
| Caixa acumulado no mês 36 | −R$ 8.207 | R$ 43.229 | R$ 69.365 |

Leitura: no Otimista, o resultado do mês 36 cai para R$ 593 porque a tarifa absorvida e o suporte pago crescem com os atendimentos. Sem a absorção da tarifa, o mesmo mês daria R$ 29.435. O efeito da absorção é o maior risco do modelo (ver seção 7).

**Variantes testadas** (base, salvo indicação):

| Variante | Pagantes mês 12 | Resultado mês 12 | Resultado mês 36 | Observação |
|---|---|---|---|---|
| Comissão ligada, portões marcados "Sim" | 58,2 | +R$ 8.513 | +R$ 28.314 | R$ 24 por primeiro atendimento (ticket R$ 200, teto não atingido) |
| Cuidado ligado (Otimista, 20 plantões por mês) | 228,5 | +R$ 3.106 | +R$ 2.022 | margem de R$ 90 por plantão |
| Modo 2 (10% da receita) e 30% no cartão (2% + R$ 0,49) | 58,2 | −R$ 352 | +R$ 1.834 | valores do cartão **não verificados**: só mostram sensibilidade |

**Sensibilidade (cenário Base).**
- MRR no mês 12: de R$ 772 (conversão de 5%, churn de 10%) a R$ 5.430 (conversão de 25%, churn de 2%).
- Pagantes no mês 12 com 15% de conversão: 14,6 com 50 cadastros por mês; 58,2 com 200. Para 50 pagantes, seriam cerca de 172 cadastros por mês desde o mês 1 (escala linear).
- Receita de comissão no mês 12, com taxa de 12%: R$ 3.255 com ticket de R$ 100; R$ 6.510 com R$ 200; R$ 40.688 com R$ 1.250.
- Resultado do mês 36 pela parcela absorvida: R$ 7.995 (0%); R$ 5.906 (50%); R$ 3.818 (100%).

## 5. Verificações feitas

- **Recálculo** com LibreOffice (`recalc.py`): 3.522 fórmulas e **0 erros** no arquivo entregue e em cinco variantes (Conservador, Otimista, comissão ligada, Cuidado ligado, modo 2 com cartão).
- **Réplica independente** em Python, com as mesmas fórmulas: pagantes, receita, custos, impostos, resultado e caixa conferem com a planilha nos três cenários e nas variantes de comissão e Cuidado (diferença inferior a 1% nos testes; no Base, até os centavos exibidos).
- **Coortes = estoque** de pagantes (Funil, B85 = "OK").
- **Grade de MRR = Receita** do mês 12 no cenário ativo (Sensibilidade, B21 = "OK").
- Valores em cache: o arquivo mostra os números mesmo sem recálculo.

## 6. Fontes

Todas abertas em **08/11/2026**, salvo indicação.

| Item | Fonte (URL) | Data ou atualização da fonte | O que foi usado |
|---|---|---|---|
| Pix e boleto (Asaas) | https://blog.asaas.com/taxas-asaas/ (blog oficial, não é a tabela de tarifas) | publicado em 26/09/2025; atualizado em 23/04/2026 | Pix: R$ 0,99 nos 3 primeiros meses e R$ 1,99 depois, por cobrança recebida. 100 Pix gratuitos por mês para chave ou QR estático (não modelado). Boleto sem taxa de emissão. |
| Asaas (tabela oficial) | https://www.asaas.com/precos-e-taxas | lida em 08/11/2026, **parcial** | Pix "R$ 1,99 e R$ 0,99 por transação recebida" (sem rótulo); boleto igual; cartão de débito "R$ 0,35 + 1,89%". **A seção de cartão de crédito não apareceu.** |
| Supabase | https://supabase.com/pricing | sem data na página | Pro a partir de US$ 25 por organização; US$ 10 de crédito cobrem um Micro; Small US$ 15, Medium US$ 60, Large US$ 110. Moeda assumida como US$ pelo símbolo [incerto]. |
| Resend | https://resend.com/pricing | sem data na página | Free: 3.000 e-mails por mês e 100 por dia; Pro US$ 20 (50 mil) e US$ 35 (100 mil); excedente US$ 0,90 por mil. Moeda assumida como US$ [incerto]. |
| Cloudflare Pages | https://developers.cloudflare.com/pages/platform/limits/ | atualizado em 05/09/2026 | Free: 500 builds por mês; Pages Functions cobradas como Workers. |
| Cloudflare Workers | https://developers.cloudflare.com/workers/platform/pricing/ | atualizado em 02/10/2026 | Workers Paid: US$ 5 por mês (mínimo). |
| WhatsApp (Meta) | https://developers.facebook.com/docs/whatsapp/pricing e https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages | "as of July 1, 2026" (página sem data própria) | Brasil: "0.68 USD cent" por mensagem de utilidade e autenticação; serviço cobrado a partir de 1º/10/2026 (1.000 gratuitas por número por mês); cobrança no Brasil em R$. Tabela em R$ **não aberta**. |
| Câmbio | API PTAX do Banco Central (https://olinda.bcb.gov.br, CotacaoDolarDia, 06/11/2026) | cotação das 13:06:13 de 06/11/2026 | venda R$ 5,5013. Converter na data de uso. |
| Simples Nacional | LC 123/2006, art. 18, §§ 5º-B, 5º-D, 5º-I, 5º-J, 5º-M e tabelas dos Anexos III e V: https://www2.camara.leg.br/legin/fed/leicom/2006/leicomplementar-123-14-dezembro-2006-548099-normaatualizada-pl.html | texto consolidado; as notas citam LC 155/2016, LC 214/2025 e LC 227/2026 | faixas e alíquotas; fator r de 28%; intermediação no Anexo V; programas de computador no Anexo III |
| ISS | LC 116/2003, art. 8, II: https://www2.camara.leg.br/legin/fed/leicom/2003/leicomplementar-116-31-julho-2003-492028-publicacaooriginal-1-pl.html; art. 8-A (inserido pela LC 157/2016): https://www2.camara.leg.br/legin/fed/leicom/2016/leicomplementar-157-29-dezembro-2016-784155-publicacaooriginal-151767-pl.html | texto original (2003); inserção (2016) | teto de 5% (art. 8, II) e piso de 2% (art. 8-A) |
| Repositório | `DECISOES.md` §1 a §7; `ARQUITETURA.md` (`platform_settings`, `compute_platform_fee`, cobranças, assinatura Pro, `shifts`); `operacao/01-plano-de-45-dias-concierge.md` (linhas 30 e 41); `operacao/05-templates-whatsapp.md`; `pesquisa/whatsapp-e-email.md` | — | regras do produto, premissas e limites |

**Tentativas que não deram o texto:** o Planalto (`lcp123.htm`) bloqueou a leitura automatizada (página de acesso negado; por isso usei o texto consolidado da Câmara). As páginas `asaas.com/precos`, `asaas.com/taxas` redirecionaram para login; `docs.asaas.com/docs/taxas-e-tarifas` deu 404.

## 7. Limites do modelo

**Premissas não medidas.** Nenhuma taxa de aquisição, aprovação, conversão ou churn foi medida. A faixa de 50 a 250 pagantes no mês 12 é expectativa do plano (enunciado desta tarefa), não resultado.

**Aquisição necessária.** O cenário Base parte de 200 cadastros por mês. A meta do plano de 45 dias é 50 prestadores aprovados em 45 dias (`operacao/01`, linha 41), ou seja, cerca de 55 cadastros por mês com aprovação de 60%. Com as demais premissas do Base, isso daria cerca de 16 pagantes no mês 12 (escala linear de 58,2 × 55,6 ÷ 200). Ou seja: **a faixa do plano exige 3,6 vezes o ritmo de recrutamento previsto para os 45 dias.** O semáforo em `Portões` marca isso.

**Absorção da tarifa.** `ARQUITETURA.md` diz que "a plataforma absorve a parte proporcional da tarifa" do split, mas não define a proporção quando a comissão é zero. Assumi 100%, o pior caso. Com comissão desligada, o custo de tarifa cresce com os atendimentos e pode anular o resultado (seção 4 e Sensibilidade, grade E).

**Não modelado:** pagamento retido (escrow, desligado); IBS e CBS da LC 214/2025; seguros, inclusive o de responsabilidade civil do Cuidado; folha e pró-labore; depreciação; capital de giro dos repasses; inadimplência, disputas e reembolsos; a fase concierge de 45 dias como custo separado; domínio; custos de abertura do CNPJ e de jurídico; o limite de 100 Pix gratuitos por mês do Asaas; o Cloudflare Pages (assumido sem custo, plano Free). Hospedagem do site não está confirmada no repositório [incerto].

**Infraestrutura.** As faixas usam os planos da Supabase e do Resend. O compute acima do Micro é uma interpretação do texto da Supabase [incerto; confirmar na fatura]. `DECISOES.md` §6 estima R$ 470 a 710 por mês com 1.000 ativos; a planilha dá R$ 275 na faixa de 1.000 a 4.999 usuários. A diferença não foi reconciliada; o plano pode incluir itens que a planilha não tem.

**Impostos.** A alíquota efetiva usa RBT12 aproximado (receita do mês × 12); a lei usa a soma dos 12 meses anteriores. Sem dado de folha, assumi fator r = 0, o que põe a comissão no Anexo V. O enquadramento (anexos, ISS, LC 227/2026) é decisão do contador. Não confirmei se a LC 227/2026, citada nas notas do texto consolidado, alterou as tabelas [incerto].

**Câmbio e moeda.** Uma cotação (06/11/2026). Supabase e Resend mostram "$" sem código de moeda; tratei como US$ [incerto]. A tarifa do WhatsApp em R$ não foi conferida.

**Placeholders.** Caixa inicial, contabilidade (R$ 300/mês, sem cotação), outros fixos (R$ 0), custo da hora de suporte (R$ 50), horas do fundador (150) e renda clínica por hora (C = 0) são premissas do modelo. Estão marcados e devem ser substituídos.

## 8. Pendências

1. **Tarifa de cartão de crédito do Asaas** (taxa percentual e parcela fixa): não verificada. Preencher em `Premissas` (`p_card_pct`, `p_card_fixo`) com o valor do painel. Portões, item 13.
2. **Tarifa de Pix** (R$ 0,99 e R$ 1,99): a fonte é o blog do Asaas; conferir no painel da conta de produção. Portões, item 14.
3. **Tarifa do WhatsApp em R$** (cartão de preços do Brasil): não aberta. Portões, item 15.
4. **Quem paga a tarifa do split** quando a comissão é zero: a ARQUITETURA não define. Decisão de produto e de contrato com o Asaas antes de ligar pagamento pelo app em escala. Portões, item 12.
5. **Enquadramento Simples (anexos III e V), fator r e ISS** com o contador. Portões, item 16.
6. **Medir o funil real** (cadastro, aprovação, ativação, teste, pagamento) e substituir as premissas. Até lá, a faixa do plano é uma hipótese.
7. **Caixa inicial e custos fixos** (contador, domínio, ferramentas, seguro) com cotação real.

## 9. Achados sobre o produto (registrados, não corrigidos)

- A ARQUITETURA não define quem arca com a tarifa do split quando a comissão é zero (ver seção 7).
- `DECISOES.md` §6 (infraestrutura de R$ 470 a 710 com 1.000 ativos) não bate com os planos da Supabase e do Resend lidos aqui (cerca de R$ 275 nessa faixa). Não sei de onde vem a estimativa do plano.
- A meta de 50 aprovados em 45 dias (`operacao/01`) não leva à faixa de 50 a 250 pagantes no mês 12 com as taxas de conversão e churn de `DECISOES.md` §6–§7. A distância é de cerca de 3,6 vezes no cadastro (ver seção 7).
