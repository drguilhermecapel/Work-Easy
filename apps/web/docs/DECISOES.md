# Decisões de monetização do WorkEasy

Registro das decisões tomadas em 22/10/2026, por delegação do dono ("tome por mim as melhores decisões que beneficiem a plataforma e aumentem a rentabilidade"). Cada decisão diz o que foi escolhido, por quê, o que muda em receita, o risco e como desfazer. **Nada aqui é parecer jurídico ou contábil**, e nenhum número de receita é promessa: são premissas para o dono revisar.

Marcas: **[fonte]** vem de fonte citada no plano estratégico privado; **[estimativa]** é cálculo ou juízo; **[incerto]** precisa de conferência antes de decidir em cima.

## 1. Resumo

| # | Decisão | Estado |
|---|---|---|
| D1 | Receita sem custódia primeiro: assinatura Pro agora; comissão e pagamento retido ficam desligados até os portões da seção 4 | mantido, já era o padrão |
| D2 | Pro a R$ 49,00/mês, configurável (`pro_price_cents`) | mantido |
| D3 | Teste grátis de 30 dias do Pro, uma vez por conta (`pro_trial_days`) | **implementado** |
| D4 | Plano grátis com 5 propostas novas por mês; Pro sem limite (`free_proposals_per_month`) | **implementado** |
| D5 | Comissão de 12% só no primeiro serviço com cliente novo da plataforma, com teto de R$ 150,00 (`commission_cap_cents`) | **teto implementado**; comissão segue desligada |
| D6 | Profissões reguladas: só assinatura, sem comissão e sem ranking por nota onde o conselho veda | mantido (política por ocupação) |
| D7 | Exclusão de conta anonimiza e **não** apaga em cascata | mantido, decisão fechada |
| D8 | Avaliações: sem piso de valor; risco aceito no lançamento, com moderação e gatilho de revisão | decisão fechada |
| D9 | Sem limite de orçamentos no grátis por enquanto | adiado com gatilho |
| D10 | Sem plano anual por enquanto | adiado com gatilho |
| D11 | Sem venda de lead, sem anúncio pago, sem taxa ao cliente | rejeitado |
| D12 | Linha "Cuidado": só abrir ao público quando os pré-requisitos da seção 5 estiverem cumpridos | portão |

## 2. O que foi implementado nesta rodada

Tudo configurável em `platform_settings`, sem novo deploy. Contrato em `docs/ARQUITETURA.md`.

**D3. Teste grátis de 30 dias.**
- *Por quê:* hoje o Pro só liga depois de um pagamento, e o profissional ainda não viu o produto funcionar. O que ele compra é cobrar clientes pelo app e propostas sem limite; o teste deixa ele usar isso antes de pagar.
- *Como funciona:* quem nunca assinou fica `trialing` e Pro de imediato. A primeira cobrança do Asaas vence quando o teste acaba. Pagou: vira `active`. Não pagou: o atraso tira o Pro (carência configurável). Cancelar no teste mantém o Pro até o fim dele.
- *Contra abuso:* um teste por conta. Para cobrar, o profissional precisa de conta de recebimento no Asaas, que pede CPF/CNPJ; criar contas falsas sai caro para o ganho [estimativa].
- *Risco:* teste sem cartão converte menos que teste com cartão [incerto]. Aceito porque o cartão é cobrado na página do Asaas, não no app, e porque no começo a prioridade é uso, não conversão.
- *Desfazer:* `pro_trial_days = 0`.

**D4. Cinco propostas por mês no grátis.**
- *Por quê:* o profissional grátis só sente o limite quando há demanda, ou seja, quando o WorkEasy já entrega valor a ele. Quem mais recebe pedido é quem mais paga; um serviço fechado de R$ 200 já cobre a mensalidade [estimativa]. Sem demanda, o limite é invisível e não atrapalha o recrutamento de oferta.
- *Detalhes:* conta propostas **criadas** no mês civil de São Paulo; retirar não devolve a vaga; a service role (suporte, sementes) não é limitada.
- *Gatilhos de revisão (com dados, não antes):* se depois de 90 dias com 100 ou mais prestadores grátis ativos a conversão para Pro ficar abaixo de 3%, baixar para 3; se menos de 30% dos prestadores aprovados enviarem a primeira proposta, subir para 8 [estimativa].
- *Desfazer:* `free_proposals_per_month = 0` tira o limite.

**D5. Teto de R$ 150,00 na comissão.**
- *Por quê:* o risco central de marketplace local é o cliente e o profissional fecharem por fora (61% dos brasileiros contratam direto pelo WhatsApp [fonte]). Percentual puro cobra R$ 600 numa reforma de R$ 5.000: é aí que fechar por fora mais compensa. O teto aparece só acima de R$ 1.250, onde a comissão sem teto seria quase toda hipotética [estimativa].
- *Efeito:* nenhum enquanto `commission_enabled` for falso. Prepara a regra para quando os portões abrirem.
- *Desfazer:* `commission_cap_cents = 0`.

## 3. Decisões fechadas sem código novo

**D2. Preço do Pro.** R$ 49,00 fica entre Simples Agenda (R$ 39,90) e Booksy (R$ 99,99) [fonte]. Custo de cobrança do Asaas em torno de R$ 2 por mensalidade [fonte, tarifa a reconferir], então a margem bruta passa de 95% [estimativa]. Subir para R$ 69 só depois de 100 pagantes com churn mensal abaixo de 5%.

**D7. Exclusão de conta.** Fica a anonimização que já existe (`anonymize_user`): apaga nome, telefone, documentos, localização, textos e dados de saúde da família; mantém valores e datas de pagamento sem os dados do pagador. Motivo: guarda fiscal e resolução de disputas pedem o registro financeiro (LGPD, art. 16, I, cumprimento de obrigação legal [incerto: confirmar prazo com o contador]), e a Apple e o Google exigem exclusão dentro do app, não apagar o livro-caixa. A cascata apagaria a contabilidade do próprio prestador. Se o advogado achar insuficiente, o ajuste é só nesta função.

**D8. Avaliações por conta falsa.** Já exige serviço concluído e pago pelo app, partes diferentes e uma avaliação por atendimento. Um piso de valor não muda o custo da fraude, que é a tarifa de Pix (cerca de R$ 2) e a abertura de uma conta de recebimento com CPF, e barraria avaliações legítimas de serviços baratos. Decisão: aceitar o risco residual no lançamento, usar a moderação do admin (`reviews_admin_update`) e revisar com 500 avaliações, olhando contas que só avaliam um prestador, telefone repetido e pares cliente-prestador repetidos.

**D9. Limite de orçamentos no grátis.** Adiado. Sem tráfego, só adicionaria atrito na entrada de oferta. Gatilho: 100 prestadores ativos por semana e conversão para Pro abaixo de 3% depois de D3 e D4.

**D10. Plano anual.** Adiado. O webhook calcula o período sempre como um mês (`periodEndFrom`); anual exige ciclo registrado na assinatura e ajuste desse cálculo, que é código de dinheiro. Faz sentido com 50 ou mais pagantes e churn acima de 5% ao mês [incerto]; preço sugerido: 10 vezes o mensal (R$ 490).

**D11. Rejeitados.** Venda de lead (GetNinjas gasta 43–51% da receita em marketing e vale menos que o caixa [fonte]); anúncio pago (custo de aquisição sem teto, com demanda ainda não medida); taxa ao cliente (reduz conversão num marketplace novo).

## 4. Portões para ligar o que está desligado

**Comissão (`commission_enabled`).** Só liga quando todos forem verdade:
1. Parecer escrito de advogado de que o split em subconta do Asaas não configura custódia de dinheiro de terceiros (Lei 12.865/2013; Res. BCB 150/2021) e sobre as obrigações de "plataforma digital" na LC 214/2025, art. 22 [incerto].
2. Conta Asaas de produção aprovada e um split real de R$ 1,00 conferido de ponta a ponta no painel do Asaas.
3. Termos de uso e política de privacidade publicados, com razão social e CNPJ.
4. Pelo menos 20 serviços pagos pelo app, com menos de 10% em disputa.
5. Cadastro fiscal do prestador (MEI, Simples ou outro) coletado.

**Pagamento retido (`escrow_enabled`).** Continua desligado. Só considerar com instituição autorizada fazendo a custódia (por exemplo conta escrow do PSP, com tarifa e contrato conferidos) e pelo menos 12 meses de operação. O `marketplace_pix.py` do `services/api` fala em custódia na própria plataforma: não usar em produção antes desse parecer.

## 5. Linha "Cuidado"

É a de maior margem por unidade (plantão de 12 h: repasse de R$ 210–230 sobre R$ 290–330 [estimativa do plano]) e a de maior risco (idosos, LC 150/2015, responsabilidade civil). Abrir ao público só com: pessoa jurídica aberta; seguro de responsabilidade civil cotado; advogado trabalhista validando o fluxo e a trava de 2 dias por semana; pelo menos 3 famílias atendidas em modo concierge, com você ou alguém seu no controle da escala. Antes disso, o menu "Cuidado" não deve ser divulgado.

## 6. Contas simples (premissas, não promessas)

Receita da mensalidade por número de pagantes, a R$ 49,00 e custo de cobrança de cerca de R$ 2 [estimativa]:

| Pagantes | Receita bruta/mês | Líquida da cobrança |
|---|---|---|
| 10 | R$ 490 | R$ 470 |
| 50 | R$ 2.450 | R$ 2.350 |
| 100 | R$ 4.900 | R$ 4.700 |
| 250 | R$ 12.250 | R$ 11.750 |
| 500 | R$ 24.500 | R$ 23.500 |

Infraestrutura estimada em cerca de R$ 135/mês sem uso e R$ 470–710 com 1.000 ativos [estimativa do plano]. O ponto de equilíbrio da infraestrutura fica perto de 3 a 15 pagantes; **o limite real é o seu tempo e o suporte**, que o plano estima exigir ajuda paga acima de 400–500 pagantes. Conversão do grátis para o Pro de 3% a 8% e churn mensal de 3% a 7% são faixas de mercado [incerto]: meça as suas antes de planejar em cima delas.

Comissão (quando abrir): a R$ 200 de ticket, 12% rendem R$ 24; com o teto, um serviço de R$ 5.000 rende R$ 150, e não R$ 600.

## 7. Metas de revisão (30, 60 e 90 dias depois do primeiro prestador real)

| Quando | Olhar | Regra |
|---|---|---|
| 30 dias | prestadores que enviaram proposta; testes iniciados | se menos de 30% dos aprovados propuseram, o problema é demanda ou onboarding, não preço |
| 60 dias | testes que viraram pagamento | abaixo de 15% dos que chegaram ao fim do teste: revisar o que o Pro entrega, não baixar o preço |
| 90 dias | pagantes, serviços pagos pelo app, disputas | ≥ 20 serviços pagos e < 10% de disputas liberam a conversa sobre comissão (seção 4) |

## 8. O que só você pode fazer (nesta ordem)

1. Tornar o repositório privado: o catálogo de 1.710 ocupações com políticas e este documento são ativos.
2. Rotacionar a chave do Gemini se algum build público já a usou.
3. Abrir a pessoa jurídica de tecnologia e intermediação, separada da Pulso Vital, e contratar contador.
4. Contratar advogado e levar as perguntas abaixo.
5. Abrir as contas: Supabase (região São Paulo), Asaas (produção), WhatsApp Business, Apple Developer (organização) e Google Play.
6. Buscar a marca "WorkEasy" no INPI antes de publicar nas lojas.
7. Criar a tag `arquivo/prototipo-ai-studio` (o push de tags é bloqueado para mim).

### Perguntas para o advogado (copie e envie)

1. O fluxo em que o cliente paga por Pix ou cartão e o Asaas divide o valor entre o profissional e a plataforma (split em subconta) mantém a plataforma fora da atividade de instituição de pagamento ou subcredenciador? O que muda se houver retenção até a liberação?
2. Uma comissão de 12% (teto de R$ 150) cobrada só no primeiro serviço com cliente novo trazido pela plataforma é compatível com as regras de publicidade e captação dos conselhos de profissões reguladas? Em quais (CFM, CRP, CRN, COFFITO, CREF, CFO, CRMV, OAB, CRC, CREA) deve ficar só a assinatura?
3. Quais obrigações a LC 214/2025, art. 22, cria para a plataforma que controla cobrança e termos, e o que precisamos coletar de cada prestador?
4. Para a linha de cuidado de idosos: como estruturar plantões de cuidadores autônomos sem caracterizar vínculo (LC 150/2015, trava de 2 dias por semana na mesma casa) e qual seguro e cláusula de responsabilidade são necessários?
5. Termos de uso e política de privacidade: o que precisa constar sobre dados sensíveis (saúde, biometria, antecedentes), encarregado, RIPD e plano de incidente?
6. Exclusão de conta com anonimização e retenção do registro financeiro: o prazo e o conteúdo mantidos atendem à LGPD e à guarda fiscal?
7. Teste grátis de 30 dias com cobrança automática ao fim: que aviso e que forma de cancelamento o CDC exige?
