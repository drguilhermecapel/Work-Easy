# F06 - Pagamento para profissional PJ e MEI: pré-requisitos regulatórios de cada pagamento

Dossiê de pesquisa. Não é parecer jurídico, contábil, tributário nem de propriedade intelectual; serve de base para a conversa com o profissional competente.

Rascunho para revisão de advogado. Não é parecer jurídico.

Data de referência: 08/11/2026. Escopo: o que o prestador precisa ter para receber pelo app, por tipo de prestador (pessoa física autônoma sem CNPJ, MEI, ME/EPP do Simples Nacional, empresa com CNPJ e conselho). Não é consultoria tributária individual.

Convenção: [aberto] = fonte primária ou oficial aberta nesta sessão; [secundário] = trecho de busca ou fonte de terceiros, não aberta; [incerto] = não foi possível abrir a fonte ou há divergência entre fontes.

## Resumo

- **Emissão de NFS-e por ME/EPP do Simples**: as notícias oficiais abertas (Receita Federal, 14/08/2026; Portal NFS-e, 11/08/2026 e 29/10/2026) dizem que a emissão pelo Emissor Nacional (web ou API) passa a ser exigida a partir de 01/11/2026, citando a Resolução CGSN nº 191, de 04/08/2026. O texto da resolução não foi aberto. O texto oficial aberto não trata de MEI nem de pessoa física como obrigados.
- **Quem pode emitir em nome do prestador**: a plataforma só deve atuar em nome do prestador com procuração eletrônica válida registrada na Receita Federal ou vínculo no cadastro do CNPJ (Portal NFS-e, 31/10/2026, disponível a partir de 01/11/2026). Sem isso, o app não deve emitir nem assinar nota por ele. A notícia não diz quem responde pela nota emitida por representante.
- **Retenções**: em São Paulo, o tomador pessoa jurídica deve reter ISS em subitens listados, com dispensa para MEI optante do SIMEI e para profissional autônomo estabelecido no município (SF/SP, aberto; página com data de 24/02/2021). Para INSS de 11%, a Receita (aberta) liga a retenção a cessão de mão de obra e empreitada; a Súmula 425 do STJ (aberta) afasta a retenção previdenciária pelo tomador quando o prestador é optante do Simples. IRRF e CSRF (PIS/COFINS/CSLL) não tiveram fonte primária aberta: tratar como pergunta para o contador. Não foi encontrado texto que obrigue a plataforma a reter tributos quando intermedeia pagamento.
- **Limites**: MEI de R$ 81.000 por ano, proporcional a R$ 6.750 por mês de atividade (gov.br/memp, aberto; última modificação 16/09/2026). Há conflito sobre aumento: o gov.br mostra o PLP 186/2026 em tramitação, e uma notícia de 22/10/2026 (secundária) diz que a LC 238/2026 elevaria o teto para R$ 110.000 em 2027. O DOU não abriu (erro 502). Simples: teto de R$ 4.800.000 de receita bruta anual (gov.br, aberto).
- **Asaas**: a documentação aberta diz que o split é calculado sobre o `netValue` (valor após taxas aplicáveis) e não menciona retenção de impostos no split nem quem emite a NFS-e da cobrança com split. A API de NFS-e aceita campos de tributos (ISS, IR, PIS/COFINS, CSLL) e calcula o tipo de retenção PIS/COFINS. Informe de rendimentos: não localizado nas páginas abertas.

## Método e limites

**Abertas com conteúdo utilizável (08/11/2026):**
- Portal NFS-e (gov.br/nfse): página inicial; notícias de 11/08/2026 (prorrogação), 29/10/2026 (diretrizes para optantes do Simples) e 31/10/2026 (representação e alternância de perfis).
- Receita Federal (gov.br/receitafederal): notícia de 14/08/2026 (NFS-e para ME/EPP a partir de 01/11/2026) e notícia de 13/11/2025 (dispensas da retenção previdenciária; cita IN RFB 2.289/2025 e IN RFB 2.110/2022).
- gov.br/memp, "Teto do MEI" (publicado 29/06/2026; modificado 16/09/2026).
- gov.br, "Optar pelo Simples Nacional" (última modificação 21/08/2026).
- STJ, Súmula 425 (via scon.stj.jus.br).
- Prefeitura de São Paulo, Secretaria Municipal da Fazenda, "Imposto sobre Serviços (ISS) - Responsabilidade Tributária" (página iss/2494; data exibida 24/02/2021).
- Asaas (docs.asaas.com): "Emitindo notas fiscais de serviço" (updatedAt 31/08/2026); "Configurações de retenção e situação tributária de PIS/COFINS" (updatedAt 31/08/2026); "Split de pagamentos" (updatedAt 03/11/2026); "FAQ do Split" (aberto em 08/11/2026; sem data na página).
- LexML: metadados da LC 214/2025 (lei de 16/01/2025), da Lei 10.833/2003 (lei de 29/12/2003) e da LC 123/2006 (lei de 14/12/2006). Só ficha catalográfica, sem texto dos artigos.
- Senado Federal: emenda ao PLP 108/2024 (15/07/2025), que propõe alterar o art. 22 da LC 214/2025. É proposta, não lei.
- Senior, Portal de Exigências Legais (22/10/2026): notícia sobre a LC 238/2026. Fonte secundária, usada só como pista.

**Não abertas (falhas):**
- planalto.gov.br: LC 214/2025 (lcp214.htm e Lcp214.htm), LC 116/2003 (lcp116.htm), Lei 10.833/2003 (l10.833.htm) e LC 123/2006 (lcp123.htm). Todas devolveram "requisição bloqueada".
- Diário Oficial (in.gov.br): página da LC 238/2026. Erro 502.
- Receita Federal, normas (idAto=152781): Resolução CGSN 191/2026. A página só mostrou o título "Normas".
- LegJur e JuruAdocs: art. 22 da LC 214/2025 e IN RFB 2.110/2022. Erro 403.
- Asaas: docs.asaas.com/docs/split e docs.asaas.com/docs/duvidas-frequentes-split (404); central de ajuda sobre Informe de Rendimentos (403).
- Receita Federal, Perguntas e respostas da pessoa jurídica (PDF 2024, 843 páginas): o PDF não tinha texto legível.
- STJ, viewFile da Súmula 425 (404). Usado o endereço scon.stj.jus.br.

**Consequência**: nenhum artigo de lei, instrução normativa ou resolução citado abaixo foi lido no texto integral. Para LC 214/2025, art. 22; Lei 10.833/2003, art. 30; LC 123/2006, arts. 3º e 18-A; Lei 8.212/1991, art. 31; IN RFB 2.110/2022; IN RFB 2.289/2025 e Resolução CGSN 191/2026, o que consta aqui vem de notícia oficial, de página de órgão ou de trecho de busca, e está marcado.

**Fora do escopo ou não pesquisado**: conselhos profissionais (matriz por conselho é outra frente); IRRF sobre serviços entre pessoas jurídicas (sem fonte primária aberta); IBS/CBS em detalhe; imposto de renda do próprio prestador (IRPF/IRPJ); obrigações acessórias (DASN-SIMEI, DAS, EFD-Reinf).

## Corpo

### (a) Nota fiscal de serviço pelo prestador

**ME e EPP do Simples Nacional** [aberto]:
- Receita Federal (14/08/2026): a obrigação atinge "microempresas e empresas de pequeno porte optantes pelo Simples Nacional que prestem serviços sujeitos à emissão de NFS-e"; início "a partir de 1º de novembro de 2026"; a Resolução CGSN nº 191, de 04/08/2026, revoga a Resolução CGSN nº 189/2026, que previa 01/09/2026.
- Portal NFS-e (11/08/2026): a exigência "foi adiada para 1º de novembro de 2026" (Resolução CGSN nº 191, de 4 de agosto de 2026).
- Portal NFS-e (29/10/2026): ME e EPP optantes "devem emitir exclusivamente pelo Emissor Nacional (Web ou API)", a partir de 01/11/2026; a regra vale, segundo o trecho citado, "independentemente de o município possuir emissor próprio"; municípios com emissor próprio devem bloquear emissão para optantes do Simples; o critério de competência é a "Data de Competência do serviço".
- **Divergência**: a notícia da Receita (14/08/2026) fala em serviços "sujeitos à emissão de NFS-e"; a notícia do Portal NFS-e (29/10/2026) fala em validade independentemente do município. Fontes de busca (não abertas) dizem que a obrigação depende da legislação municipal. Tratar como [incerto] até conferir o texto da resolução.
- A data de 01/11/2026 já passou na data de referência (08/11/2026). Pelo texto oficial aberto, a exigência valeria desde então; isso precisa ser conferido pelo contador.
- Receita (14/08/2026): as regras de CBS e IBS para optantes do Simples produzem efeitos "a partir de 1º de janeiro de 2027"; até 31/12/2026, não se aplicam regras de CBS e IBS no Simples.

**MEI e pessoa física** [incerto]:
- As notícias abertas do Portal NFS-e e da Receita não mencionam MEI nem pessoa física como obrigados. Há menção a "MEI e demais empresas" só em menus.
- Trecho de busca (não aberto) afirma que o MEI já estaria na exigência desde 01/09/2023. Não foi confirmado.
- A obrigação de NFS-e do MEI e do autônomo depende, na prática, do município. Não foi aberta fonte municipal de São Paulo sobre emissão (apenas sobre retenção, ver item b).

**Emissão em nome do prestador por terceiro** [aberto]:
- Portal NFS-e (31/10/2026, disponível a partir de 01/11/2026): o usuário poderá atuar em nome de pessoas físicas ou jurídicas que represente "legitimamente". Situações citadas: responsável legal da empresa; alternância entre estabelecimentos com a mesma raiz de CNPJ; "atuação em nome de terceiros mediante procuração eletrônica válida para os serviços da NFS-e".
- Formas de autorização: "procuração eletrônica cadastrada nos serviços da Receita Federal do Brasil" ou "vínculos existentes na base cadastral do CNPJ".
- As APIs de emissão e distribuição também podem ser usadas em nome de terceiros com essas autorizações.
- A notícia não diz quem responde pela nota emitida por representante.

**O que a plataforma não pode fazer em nome do prestador** (leitura das fontes abertas; não é norma expressa):
- Emitir, assinar ou cancelar NFS-e do prestador sem que ele tenha dado procuração eletrônica ou vínculo no CNPJ (item acima).
- Presumir o regime tributário do prestador. A documentação do Asaas exige que as informações fiscais da conta estejam configuradas conforme as exigências do município; o campo `simplesNacional` é lido do cadastro (Asaas, aberto).
- Prometer emissão automática da nota sem essa autorização e sem o cadastro municipal do prestador.
- Declarar a plataforma como emitente da nota. Não há fonte que a torne emitente.

**Asaas e emissão** [aberto]:
- "Antes de começar": confirmar que as informações fiscais da conta foram configuradas conforme as exigências do município.
- "Contas que utilizam o Portal Nacional não recebem a lista de serviços municipais pela API"; nesse caso usa-se apenas `municipalServiceCode`.
- Quem emite a nota não está dito de forma explícita; a página sugere que é a conta configurada no agendamento (inferência, não afirmação).

### (b) Retenções na fonte quando o tomador é pessoa jurídica

**(b1) INSS de 11% (contribuição previdenciária)**:
- Receita Federal (13/11/2025) [aberto]: a IN RFB nº 2.110/2022 "prevê a retenção de 11%". Em contratações públicas, na empreitada parcial e na cessão de mão de obra "há retenção". A IN RFB nº 2.289/2025 (de 30/10/2025) reúne hipóteses de dispensa (a notícia diz sete e nomeia cinco: avulsos via sindicato ou Ogmo; entidades beneficentes imunes; empreitada total; transporte de cargas; serviços executados nas instalações do próprio prestador).
- A mesma notícia diz que a IN "alinha regra aplicável às empresas do Simples Nacional" e que cessão ou locação de mão de obra "só enseja exclusão do regime nas hipóteses previstas em lei".
- Súmula 425 do STJ [aberto]: "A retenção da contribuição para a seguridade social pelo tomador do serviço não se aplica às empresas optantes pelo Simples." Julgada em 10/03/2010 (Primeira Seção); DJe de 13/05/2010.
- Trecho de busca (não aberto): anexo III do Simples não sofre retenção, mas é excluído do regime se fizer cessão de mão de obra; anexo IV sofre retenção. Não foi confirmado.
- MEI: nenhuma fonte aberta trata do MEI nesse ponto. [incerto].
- Consequência para o app: em um serviço comum prestado por PF ou MEI, sem cessão de mão de obra ou empreitada, a retenção de 11% não aparece nas fontes abertas. Confirmar com o contador, com o tipo de serviço e com a natureza da plataforma.

**(b2) ISS (São Paulo)** [aberto, com ressalva de data]:
- SF/SP, página iss/2494 (data exibida 24/02/2021, sem campo de atualização): a retenção do ISS está nos arts. 7º, 9º, 9º-A e 13 da Lei 13.701/2003.
- Art. 9º: responsáveis pela retenção (inclui pessoas jurídicas, inclusive imunes ou isentas, e condomínios) "desde que estabelecidos no município de São Paulo", para subitens listados. Quando o prestador é de fora, a retenção se aplica se não houver inscrição no CPOM (art. 9º-A).
- Art. 7º: o tomador responde pelo ISS se o prestador deveria emitir nota e não emitiu, ou se estava dispensado mas não entregou recibo com dados mínimos.
- Art. 13: responsabilidade solidária (não retenção), em hipóteses como a de obras sem documentação.
- Dispensas (art. 9º, item 5): o responsável fica desobrigado quando o prestador é: profissional autônomo estabelecido no Município de São Paulo; sociedade de profissionais habilitados; prestador isento estabelecido em SP; prestador imune; MEI optante do SIMEI.
- Comprovação: autônomos e sociedades de profissionais comprovam pela Declaração Cadastral. Se o enquadramento deixar de existir, o prestador responde pelo imposto integral, com multa e acréscimos, desde a data em que deixou de atender às condições. A página não diz quem comprova o enquadramento de MEI e de ME/EPP.
- ME e EPP optantes do Simples: sem dispensa; os serviços sujeitam-se à retenção com alíquotas dos Anexos III a VI da LC 123/2006; sem alíquota na nota, aplica-se a maior alíquota do anexo.
- Divergência: trecho de busca diz "autônomo inscrito no CCM"; a página aberta diz "estabelecido no Município de São Paulo". Usar a página aberta, com ressalva.
- Trecho de busca (não aberto): manual da NFTS (tomador e intermediário, 2026) diz que o MEI fica desobrigado da NFTS. Não confirmado; é outra obrigação.
- Fora de São Paulo: a regra depende do município do tomador e do prestador. Não pesquisado.

**(b3) PIS, COFINS e CSLL (CSRF, 4,65%)**:
- Base legal citada: Lei 10.833/2003, art. 30. Texto não aberto (LexML trouxe só a ficha da lei). [incerto].
- Trechos de busca (não abertos): percentual de 4,65% (CSLL 1%, COFINS 3%, PIS/Pasep 0,65%) sobre o valor bruto da nota; optantes do Simples que são fonte pagadora ficam dispensados; optantes que recebem continuam tendo o pagamento sujeito à retenção, salvo declaração. Não confirmado.
- Asaas, NFS-e (aberto): o campo `csll` é "Percentual de CSLL retido"; o tipo de retenção de PIS/COFINS (`pisCofinsRetentionType`) é calculado pelo Asaas a partir dos percentuais informados, e não deve ser enviado pela integração.
- Não se encontrou fonte aberta que diga se a retenção se aplica a pagamento a pessoa física. Trechos de busca indicam que a CSRF é cobrada em pagamentos entre pessoas jurídicas. [incerto].

**(b4) IRRF (imposto de renda retido na fonte)**:
- Sem fonte primária aberta. A IN RFB nº 1.234/2012, citada em trechos de busca, trata de pagamentos feitos por órgãos públicos federais a pessoas jurídicas; não é a regra para pagador privado. Ver também trecho de busca sobre IN RFB 765/2007 (dispensa de IRRF a Simples) e Solução de Consulta Cosit 263 (entendimento de que o Simples tomador deve reter IRRF em serviços de não optante). Fontes divergentes. [incerto].
- Asaas, NFS-e (aberto): o exemplo de chamada de emissão inclui um campo de IR (exemplo com valor 1,5). A página não diz quando esse campo é obrigatório nem qual a base. [incerto].

**(b5) Quando a plataforma intermedeia o pagamento**:
- Não foi encontrado texto de lei aberto que obrigue a plataforma, como tal, a reter INSS, IRRF, ISS ou CSRF sobre pagamentos intermediados. Se a plataforma for "fonte pagadora" ou tomadora, as regras acima passam a incidir sobre ela; se for só intermediadora com split, a responsabilidade de quem contrata continua em análise. Pergunta para o contador.
- **LC 214/2025, art. 22** (IBS e CBS): a lei é de 16/01/2025 (DOU, edição extra, LexML aberto). O texto do art. 22 não foi aberto. Trechos de busca dizem que plataformas digitais respondem pelo recolhimento de IBS e CBS quando intermedeiam operações de fornecedores não inscritos e que a responsabilidade pode ser solidária; afirmam também que a LC 227/2026 acrescentou os §§ 13 a 15. Não confirmado. [incerto].
- Emenda ao PLP 108/2024 (Senado, 15/07/2025, aberta): propõe redação para o art. 22, com responsabilidade solidária e hipóteses de afastamento com split payment. É proposta, não lei. Não usar como fonte de direito vigente.

### (c) Limites de faturamento que afetam o prestador

**MEI** [aberto]:
- gov.br/memp, "Teto do MEI" (publicado 29/06/2026; modificado 16/09/2026): limite anual vigente de R$ 81 mil; valor proporcional de R$ 6.750 por mês de atividade para quem inicia no ano.
- Mesma página: PLP 186/2026 "em tramitação no Congresso Nacional"; propostas de R$ 110 mil (2027) e R$ 140 mil (2028), "ainda não em vigor".
- Notícia da Senior (22/10/2026) [secundária]: diz que a LC 238/2026 foi publicada no DOU de 21/10/2026 e eleva o teto do MEI para R$ 110 mil em 2027 e R$ 140 mil em 2028, dependendo de previsão de renúncia de receita na lei orçamentária; vigência "majoritariamente em 1º de janeiro de 2027".
- Conflito: a página do gov.br foi modificada em 16/09/2026, antes da data da LC 238/2026 que a notícia cita, por isso não resolve o conflito. O DOU não abriu (erro 502). Status: [incerto]. Não codificar o valor do teto sem conferir o DOU.

**Simples Nacional** [aberto]:
- gov.br, "Optar pelo Simples Nacional" (última modificação 21/08/2026): "Ter receita bruta anual igual ou inferior a R$ 4.800.000,00" (página aplica o limite a ME e EPP em conjunto).
- Faixa de ME (receita de até R$ 360 mil): citada em trecho de busca de página do gov.br não aberta. [incerto] até conferir a LC 123/2006, art. 3º, I.
- Sublimites estaduais de ICMS e, por consequência, de ISS: mencionados em trechos de busca, sem valores conferidos. Uma página da SEFAZ-BA citada em busca traz R$ 3.600.000 (anterior a 2018); não usar. [incerto].
- Trecho de busca (não aberto): receitas de matriz e filial somam-se para o teto; empresas com o mesmo sócio entram na mesma conta; excesso de até 20% leva a efeitos no ano seguinte. Não confirmado.

**Impacto para o app** (leitura, não norma): o app precisa de uma forma de acompanhar a receita bruta anual do prestador e do CNPJ vinculado para não pagar prestador acima do teto sem aviso; o contador deve dizer quais receitas contam (inclui receitas de outras atividades, de filiais e de outros clientes).

### (d) O que o Asaas faz automaticamente e o que fica para a plataforma

**Automático, conforme documentação aberta** [aberto]:
- Split: "após o recebimento, o Asaas calcula o Split sobre o valor líquido da cobrança"; "o Split é calculado sobre o `netValue`, ou seja, o valor da cobrança após o desconto das taxas aplicáveis" (split de pagamentos, updatedAt 03/11/2026; FAQ do split).
- Split: percentual ou valor fixo; cada recebedor precisa de conta Asaas e de `walletId` (FAQ do split, aberto); a antecipação reduz o líquido (FAQ do split, aberto). [secundário, trecho de busca] A soma dos percentuais não passa de 100% e há evento de webhook por split liquidado.
- NFS-e pela API: campos de tributos (ISS, IR, PIS/COFINS, CSLL) e `retainIss`; cálculo do tipo de retenção PIS/COFINS pelo Asaas; NT-007 para Regime Normal desde 30/06/2026; clientes do Simples não precisam mudar o payload por causa da NT-007.
- [secundário, trecho de busca] Eventos `INVOICE_AUTHORIZED` e `INVOICE_ERROR` para acompanhar a emissão; deduções não mudam o total da nota, mas mudam a base de cálculo do ISS. Confirmar na documentação antes de usar.

**Não automático ou não documentado nas páginas abertas**:
- Retenção de IR, ISS, INSS ou CSRF sobre o valor repassado no split: não mencionada na página de split nem no FAQ.
- Quem emite a NFS-e da cobrança com split: não informado.
- Relação entre o desconto de impostos na nota e a base do split: não informada (a documentação só fala em "taxas aplicáveis").
- Informe de rendimentos: não localizado. Trecho de busca da central de ajuda (página bloqueada) diz que o Asaas não emite Informe de Rendimentos (DIRF) e que oferece Informe de Saldo para contas de pessoa física. [incerto].
- Trecho de blog (não oficial) afirma que a receita fiscal da plataforma seria só a comissão. Não usar.

**Fica para a plataforma (a confirmar com o contador)**:
- Definir a natureza da plataforma no pagamento (intermediária, fonte pagadora, tomadora ou só recebedora de split), que muda quem retém.
- Decidir o regime de retenção por tipo de prestador, com as dispensas e os documentos de comprovação.
- Decidir se emite NFS-e em nome do prestador (com procuração eletrônica ou vínculo no CNPJ) ou se só orienta o prestador a emitir.
- Coletar e guardar os comprovantes de enquadramento (Declaração Cadastral, certidão, opção pelo SIMEI, enquadramento no Simples).
- Acompanhar teto de faturamento e o aviso de desenquadramento.
- Guardar dados para informes de rendimentos ou demonstrativos de retenção que o Asaas não emite.

### Mapa: tipo de prestador x obrigação x quem cumpre x fonte

Legenda do status: [aberto] = fonte oficial aberta; [incerto] = não confirmado ou conflitante.

| Tipo de prestador | Obrigação | Quem cumpre (segundo a fonte) | Fonte | Status |
|---|---|---|---|---|
| Autônomo PF sem CNPJ, estabelecido em SP | Emitir NFS-e | Não localizado para PF; depende do município | - | [incerto] |
| Autônomo PF sem CNPJ, estabelecido em SP | Retenção de ISS pelo tomador PJ | Dispensa do tomador se o prestador comprovar enquadramento por Declaração Cadastral; sem comprovação, o prestador responde pelo imposto integral | SF/SP, iss/2494 (página de 24/02/2021) | [aberto] |
| Autônomo PF sem CNPJ | INSS de 11% | Só em cessão de mão de obra ou empreitada, segundo a Receita; PF em serviço comum não aparece | Receita, 13/11/2025 | [incerto] para PF |
| Autônomo PF sem CNPJ | IRRF e CSRF | CSRF é regra de pagamento entre PJ (texto não aberto); IRRF sem fonte primária | Lei 10.833/2003, art. 30 (metadados) | [incerto] |
| MEI | Emitir NFS-e no padrão nacional | Não consta no texto aberto da resolução; depende do município | Portal NFS-e, 29/10/2026 (silencioso sobre MEI) | [incerto] |
| MEI | Teto de faturamento | Prestador: R$ 81 mil/ano (R$ 6.750/mês proporcional). Possível aumento para R$ 110 mil em 2027 (LC 238/2026, fonte secundária) | gov.br/memp (29/06/2026; mod. 16/09/2026); Senior (22/10/2026) | [aberto] para R$ 81 mil; [incerto] para o aumento |
| MEI | Retenção de ISS pelo tomador PJ em SP | Dispensa para MEI optante do SIMEI | SF/SP, iss/2494 | [aberto] |
| MEI | INSS, IRRF e CSRF | Sem fonte aberta sobre MEI | - | [incerto] |
| ME/EPP Simples | Emitir NFS-e | ME/EPP, pelo Emissor Nacional (web ou API), a partir de 01/11/2026 | Receita, 14/08/2026; Portal NFS-e, 11/08 e 29/10/2026; Resolução CGSN 191/2026 (não aberta) | [aberto], com divergência sobre a dependência do município |
| ME/EPP Simples | Retenção de ISS pelo tomador PJ em SP | Tomador PJ retém em subitens listados; sem dispensa para ME/EPP; alíquotas dos Anexos III a VI | SF/SP, iss/2494 (página de 24/02/2021) | [aberto], com ressalva de data |
| ME/EPP Simples | INSS de 11% | Sem retenção pelo tomador (Súmula 425); IN RFB 2.289/2025 trata das dispensas (texto não aberto) | STJ, Súmula 425; Receita, 13/11/2025 | [aberto] |
| ME/EPP Simples | CSRF e IRRF | Sem fonte primária aberta; fontes divergem | Lei 10.833/2003, art. 30 (metadados); busca | [incerto] |
| ME/EPP Simples | Teto de receita | Até R$ 4.800.000 (ME e EPP em conjunto); faixa de ME até R$ 360 mil em trecho não aberto | gov.br/optar (21/08/2026) | [aberto] para R$ 4,8 mi; [incerto] para R$ 360 mil |
| Empresa com CNPJ (Lucro Presumido ou Real), com ou sem conselho | Emitir NFS-e | Prestador, conforme o município; no Regime Normal, emissão pelo Portal Nacional exige campos de PIS/COFINS (NT-007) | Asaas, PIS/COFINS (31/08/2026); Portal NFS-e | [aberto] para o campo do Asaas; [incerto] para a regra municipal |
| Empresa com CNPJ | Retenção de ISS pelo tomador PJ em SP | Tomador PJ retém em subitens listados quando o prestador é de SP ou de fora sem CPOM | SF/SP, iss/2494 | [aberto] |
| Empresa com CNPJ | INSS de 11% | Só em cessão de mão de obra ou empreitada | Receita, 13/11/2025 | [aberto] para a hipótese; [incerto] para a aplicação |
| Empresa com CNPJ | IRRF e CSRF | Sem fonte primária aberta | - | [incerto] |
| Profissional com conselho (qualquer tipo) | Regras do conselho, sociedade uniprofissional, emissão | Fora do escopo desta pesquisa; não pesquisado | - | não pesquisado |
| Plataforma (split via Asaas) | Retenção de tributos sobre o valor do split | Não mencionada na documentação do split; natureza da plataforma por definir | Asaas, split (03/11/2026); FAQ | [aberto] para o silêncio da documentação; [incerto] para a obrigação |
| Plataforma | Emissão de NFS-e em nome do prestador | Só com procuração eletrônica ou vínculo no CNPJ; disponível a partir de 01/11/2026 | Portal NFS-e, 31/10/2026 | [aberto] |
| Plataforma | IBS e CBS (LC 214/2025, art. 22) | Responsabilidade do intermediador segundo fontes de busca; texto do art. 22 não aberto. Para optantes do Simples, IBS e CBS só a partir de 01/01/2027 | LexML (metadados, 16/01/2025); Receita, 14/08/2026 | [incerto] para o art. 22; [aberto] para a data do Simples |

## Perguntas para o profissional

1. A plataforma, ao receber o valor do cliente e repassar ao prestador pelo split, é fonte pagadora, tomadora, intermediária ou só recebedora? Essa definição muda quem deve reter.
2. Para um serviço comum prestado por pessoa física sem CNPJ, em São Paulo, há algum tributo federal ou municipal que o tomador (ou a plataforma) deve reter? Qual a documentação de comprovação que o app deve pedir?
3. Para MEI, qual é a obrigação de NFS-e no município do prestador e do cliente, e o app pode ser responsável por emiti-la?
4. Para ME e EPP do Simples, a Resolução CGSN nº 191/2026 exige emissão pelo Emissor Nacional para todos os serviços ou só para os que o município já exige NFS-e? Qual o efeito para o app se o prestador não emitir?
5. Procuração eletrônica (Receita) ou vínculo no CNPJ: é suficiente para o app emitir NFS-e em nome do prestador pela API? Quem responde pela nota, o prestador ou a plataforma? Como cancelar ou substituir?
6. Retenção de ISS em São Paulo: a página da Prefeitura aberta data de 2021. Qual é o texto atual e os subitens de serviços que o app oferece estão listados?
7. INSS de 11%: o serviço do app pode caracterizar cessão de mão de obra ou empreitada em algum caso? Como a IN RFB nº 2.289/2025 se aplica a prestadores do Simples?
8. A Súmula 425 do STJ se aplica a todo serviço de ME/EPP optante do Simples contratado por empresa, ou depende de algum requisito?
9. CSRF (4,65%) e IRRF: incidem sobre pagamento que a plataforma faz a um prestador PJ? E sobre pagamento a pessoa física? Em que valores e com quais códigos de recolhimento?
10. LC 238/2026: já está em vigor? Qual é o teto do MEI que vale hoje, e qual o prazo de aplicação? Esses dados devem ser parametrizados no app ou fixos?
11. LC 214/2025, art. 22: em quais hipóteses a plataforma responde pelo recolhimento de IBS e CBS, e se a responsabilidade é solidária? O que muda para prestadores do Simples a partir de 01/01/2027?
12. Informe de rendimentos: para prestadores que recebem pelo split, quem emite o informe ou demonstrativo anual? O Asaas emite, ou o app precisa gerar?
13. O teto de faturamento do prestador soma receitas de outras atividades, de filiais e de outros clientes? Qual o procedimento quando o prestador ultrapassa o limite?
14. Para profissionais com conselho (sociedades uniprofissionais, regras de emissão e de retenção), quais regras se aplicam e onde ficam documentadas? Esta pergunta fica fora do escopo desta pesquisa.

## Fontes consultadas

Abertas (data de abertura: 08/11/2026):

1. https://www.gov.br/nfse/pt-br - Portal NFS-e, página inicial. Sem texto normativo; usada só para localizar as notícias.
2. https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/agosto/simples-nacional-nfs-e-nacional-sera-obrigatoria-para-me-e-epp-a-partir-de-1o-de-novembro-de-2026/ - Receita Federal, notícia de 14/08/2026; cita Resolução CGSN nº 191/2026 (04/08/2026); início em 01/11/2026; CBS e IBS para o Simples a partir de 01/01/2027.
3. https://www.gov.br/nfse/pt-br/noticias/comite-gestor-do-simples-nacional-prorroga-a-obrigatoriedade-de-emissao-de-notas-fiscais-de-servico-pelo-emissor-nacional-da-nfs-e - Portal NFS-e, notícia de 11/08/2026; prorrogação de 01/09/2026 para 01/11/2026.
4. https://www.gov.br/nfse/pt-br/noticias/nfs-e-informa-diretrizes-sobre-a-obrigatoriedade-da-emissao-da-nfs-e-nacional-para-optantes-do-simples-nacional - Portal NFS-e, notícia publicada em 29/10/2026; ME e EPP optantes, Emissor Nacional (web ou API), a partir de 01/11/2026.
5. https://www.gov.br/nfse/pt-br/noticias/nova-funcionalidade-possibilita-representacao-e-alternancia-de-perfis-na-nfs-e - Portal NFS-e, notícia publicada em 31/10/2026; procuração eletrônica e vínculo no CNPJ; disponível a partir de 01/11/2026.
6. https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2025/novembro/receita-federal-consolida-hipoteses-de-dispensa-da-retencao-previdenciaria-em-contratos-de-servicos-e-obras - Receita Federal, notícia publicada em 13/11/2025 (página mostra também "atualizado em 28/10/2026", data que parece inconsistente); cita IN RFB nº 2.289/2025 (de 30/10/2025) e IN RFB nº 2.110/2022 (retenção de 11%).
7. https://www.gov.br/memp/pt-br/teto-do-mei - gov.br, "Teto do MEI"; publicado 29/06/2026; modificado 16/09/2026; R$ 81 mil; PLP 186/2026 em tramitação.
8. https://www.gov.br/pt-br/servicos/optar-pelo-simples-nacional - gov.br, "Optar pelo Simples Nacional"; última modificação 21/08/2026; limite de R$ 4.800.000.
9. https://scon.stj.jus.br/SCON/sumstj/toc.jsp?livre=%27425%27.num.&O=JT - STJ, Súmula 425 (enunciado; julgada em 10/03/2010; DJe de 13/05/2010).
10. https://prefeitura.sp.gov.br/web/fazenda/w/servicos/iss/2494 - Prefeitura de São Paulo, Secretaria Municipal da Fazenda, "Imposto sobre Serviços (ISS) - Responsabilidade Tributária"; arts. 7º, 9º, 9º-A e 13 da Lei 13.701/2003; data exibida 24/02/2021.
11. https://docs.asaas.com/docs/emitindo-notas-fiscais-de-servico - Asaas, "Emitindo notas fiscais de serviço"; updatedAt 31/08/2026.
12. https://docs.asaas.com/docs/configura%C3%A7%C3%B5es-de-reten%C3%A7%C3%A3o-e-situa%C3%A7%C3%A3o-tribut%C3%A1ria-de-piscofins - Asaas, "Configurações de retenção e situação tributária de PIS/COFINS"; updatedAt 31/08/2026.
13. https://docs.asaas.com/docs/split-de-pagamentos - Asaas, "Split de pagamentos"; updatedAt 03/11/2026.
14. https://docs.asaas.com/docs/faq-do-split - Asaas, "FAQ do Split"; aberto em 08/11/2026 (sem data na página).
15. https://www.lexml.gov.br/urn/urn:lex:br:federal:lei.complementar:2025-01-16;214 - LC 214/2025, metadados apenas (lei de 16/01/2025; DOU edição extra de 16/01/2025; veto parcial rejeitado publicado em 02/07/2025). Texto dos artigos não aberto.
16. https://www.lexml.gov.br/urn/urn:lex:br:federal:lei:2003-12-29;10833 - Lei 10.833/2003, metadados apenas (lei de 29/12/2003; DOU de 30/12/2003). Texto do art. 30 não aberto.
17. https://www.lexml.gov.br/urn/urn:lex:br:federal:lei.complementar:2006-12-14;123 - LC 123/2006, metadados apenas (lei de 14/12/2006). Texto dos arts. 3º e 18-A não aberto.
18. https://legis.senado.leg.br/sdleg-getter/documento?dm=9997193 - Senado Federal, emenda do Senador Fernando Farias ao PLP 108/2024 (15/07/2025), propondo alterar o art. 22 da LC 214/2025. Proposta, não lei.
19. https://documentacao.senior.com.br/exigenciaslegais/noticias/federal/2026/2026-10-22-simples-nacional-lei-complementar-no-238-2026-nova-lei-amplia-limite-de-faturamento-do-mei-e-preve-perdao-de-dividas - Senior, Portal de Exigências Legais, notícia de 22/10/2026 sobre a LC 238/2026. Fonte secundária; cita o DOU, sem confirmação.

Falhas (não abertas; tratadas como [incerto]):

- https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm; https://www.planalto.gov.br/ccivil_03/leis/lcp/Lcp214.htm (LC 214/2025, art. 22) - "requisição bloqueada".
- https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp116.htm (LC 116/2003, art. 6º e §2º) - "requisição bloqueada".
- https://www.planalto.gov.br/ccivil_03/_ato2004-2006/2004/lei/l10.833.htm (Lei 10.833/2003, art. 30) - "requisição bloqueada".
- https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm (LC 123/2006, arts. 3º e 18-A) - "requisição bloqueada".
- https://www.in.gov.br/web/dou/-/lei-complementar-n-238-de-21-de-outubro-de-2026-739686316 (LC 238/2026) - erro 502.
- https://normas.receita.fazenda.gov.br/sijut2consulta/link.action?idAto=152781 (Resolução CGSN nº 191/2026) - página sem texto ("Normas").
- https://www.legjur.com/legislacao/art/lec_00002142025-22 (LC 214/2025, art. 22) e https://www.juruadocs.com/legislacao/art/lec_00002142025-22 - erro 403.
- https://www.legjur.com/legislacao/art/out_2404202400021102022-0 (IN RFB 2.110/2022, ementa) - erro 403.
- https://docs.asaas.com/docs/split e https://docs.asaas.com/docs/duvidas-frequentes-split - erro 404.
- https://central.ajuda.asaas.com/hc/pt-br/articles/32058240871579-O-Asaas-disponibiliza-o-Informe-de-Rendimentos (Informe de Rendimentos) - erro 403; trecho de busca usado com [incerto].
- https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/ecf/2024-perguntas-e-respostas-da-pessoa-juridica.pdf (CSRF e Simples) - PDF sem texto legível.
- https://www.stj.jus.br/publicacaoinstitucional/index.php/sumstj/article/viewFile/5282/5408 (Súmula 425) - erro 404; usada a fonte scon.stj.jus.br.

Trechos de busca, não abertos (usados só como pista, sempre marcados [secundário] ou [incerto]):
- Textos sobre IN RFB 2.110/2022 e IN RFB 1.234/2012, IN RFB 765/2007, Solução de Consulta Cosit 263, IN SRF 459/2004 (retenções federais, CSRF e IRRF).
- Notícias de escritórios e portais contábeis sobre a Resolução CGSN 191/2026 e a LC 238/2026 (contmatic, coad, jornalcontabil, amdjus, notagateway, fenacon, crcma, lookuptax, tecnospeed).
- Manuais de NFTS e NFS-e da Prefeitura de São Paulo (2026) e manuais municipais (Belo Horizonte, Londrina, Curitiba) sobre emissão por procuração.
- Página de desenquadramento e teto do MEI (gov.br/empresas-e-negocios) e tabela de limites de estados (SEF/MG, SEFAZ-BA, SEF/SC).
- Blog de Asaas sobre split e comentário de usuário sobre receita da plataforma (não oficial).
