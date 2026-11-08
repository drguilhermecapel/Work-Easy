# Modelo financeiro e de cenários (planilha 09)

> **Rascunho para revisão do dono, do contador e do advogado.** Não é previsão de receita, não é parecer contábil nem jurídico e não é promessa a clientes ou investidores. Todo número é premissa. Nada aqui é validado com usuários reais: o produto não está implantado.

Arquivo: `apps/web/docs/operacao/09-modelo-financeiro.xlsx` (referência: 08/11/2026). Este documento explica a planilha; não repete todas as premissas, que estão em `Premissas`, com fonte e data.

---

## 1. Como usar

1. Abra o arquivo e comece pela aba `README`.
2. Escolha o cenário em **`Premissas!D4`**: `Conservador`, `Base` ou `Otimista`. Todas as abas recalculam. O arquivo sai com `Base`. Confirme também o **fator r** em `Premissas!F61` (0 = folha abaixo de 28% da receita, padrão; 1 = acima).
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

**Resultados do modelo** (comissão e Cuidado desligados, padrão):

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
| Comissão ligada, portões marcados "Sim" | 58,2 | +R$ 8.187 | +R$ 27.419 | R$ 24 por primeiro atendimento (ticket R$ 200, teto não atingido) |
| Cuidado ligado (Otimista, 20 plantões por mês) | 228,5 | +R$ 1.987 | −R$ 2.151 | margem de R$ 90 por plantão |
| Modo 2 (10% da receita) e 30% no cartão (2% + R$ 0,49) | 58,2 | −R$ 407 | +R$ 1.779 | valores do cartão **não verificados**: só mostram sensibilidade |

**Sensibilidade (cenário Base).**
- MRR no mês 12: de R$ 772 (conversão de 5%, churn de 10%) a R$ 5.430 (conversão de 25%, churn de 2%).
- Pagantes no mês 12 com 15% de conversão: 14,6 com 50 cadastros por mês; 58,2 com 200. Para 50 pagantes, seriam cerca de 172 cadastros por mês desde o mês 1 (escala linear).
- Receita de comissão no mês 12, com taxa de 12%: R$ 4.883 com ticket de R$ 100; R$ 9.765 com R$ 200; R$ 61.032 com R$ 1.250 (teto de R$ 150 aplicado).
- Resultado do mês 36 pela parcela absorvida: R$ 6.884 (0%); R$ 4.795 (50%); R$ 2.707 (100%).

## 5. Verificações feitas

- **Recálculo** com LibreOffice (`recalc.py`, do skill xlsx): 3.522 fórmulas e **0 erros** no arquivo entregue e em nove variantes (Conservador, Base, Otimista, comissão ligada, Cuidado ligado, modo 2 com cartão e três de absorção), após as correções de 08/11/2026 listadas abaixo.
- **Réplica independente** em Python: não encontrei o script no repositório e não o reexecutei nesta revisão. Esta afirmação **não está verificada**.
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

**Não modelado:** pagamento retido (escrow, desligado); IBS e CBS da LC 214/2025; seguros, inclusive o de responsabilidade civil do Cuidado; folha e pró-labore; depreciação; capital de giro dos repasses; inadimplência, disputas e reembolsos; a fase concierge de 45 dias como custo separado; domínio; custos de abertura do CNPJ e de jurídico; o limite de 100 Pix gratuitos por mês do Asaas; o Cloudflare Pages (assumido sem custo, plano Free). Hospedagem do site não está confirmada no repositório [incerto].

**Infraestrutura.** As faixas usam os planos da Supabase e do Resend. A página da Supabase diz que o crédito de US$ 10 cobre só uma instância Micro e que tamanhos maiores pagam o preço cheio; a planilha segue isso [confirmar na fatura]. `DECISOES.md` §6 estima R$ 470 a 710 por mês com 1.000 ativos; a planilha dá R$ 330 na faixa de 1.000 a 4.999 usuários. A diferença não foi reconciliada; o plano pode incluir itens que a planilha não tem.

**Impostos.** A alíquota efetiva usa RBT12 aproximado (receita do mês × 12); a lei usa a soma dos 12 meses anteriores. Sem dado de folha, assumi fator r = 0. Pela LC 123, art. 18, §5º-M, II, com r < 28% o licenciamento de programas (§5º-D) também vai ao Anexo V; por isso a mensalidade Pro, a comissão e o Cuidado pagam a alíquota do Anexo V (15,5% na primeira faixa). Com r ≥ 28%, `p_r28` = 1 aplica o Anexo III. Não confirmei se a LC 227/2026, citada nas notas do texto consolidado, alterou as tabelas [incerto]. O enquadramento (anexos, ISS, LC 227/2026) é decisão do contador.

**Câmbio e moeda.** Uma cotação (06/11/2026). Supabase e Resend mostram "$" sem código de moeda; tratei como US$ [incerto]. A tarifa do WhatsApp em R$ não foi conferida.

**Placeholders.** Caixa inicial, contabilidade (R$ 300/mês, sem cotação), outros fixos (R$ 0), custo da hora de suporte (R$ 50), horas do fundador (150) e renda clínica por hora (C = 0) são premissas do modelo. Estão marcados e devem ser substituídos.

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
