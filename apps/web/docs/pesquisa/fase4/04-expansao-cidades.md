Dossiê de pesquisa. Não é parecer jurídico, contábil, tributário nem de propriedade intelectual; serve de base para a conversa com o profissional competente.

Rascunho para revisão de advogado. Não é parecer jurídico.

# Dossiê F10 (fase 4): critérios e candidatas para expansão para outras cidades

**Data da pesquisa:** 08/11/2026. **Escopo:** (a) critérios de entrada numa cidade; (b) cinco candidatas fora de São Paulo; (c) regulação municipal, concorrência observável e risco principal de cada candidata; (d) regra do plano para expansão. **Situação:** pesquisa de mesa. Não houve contato com prestadores, famílias, prefeituras, contadores nem advogados. O WorkEasy não está em produção, então não existe liquidez medida em nenhuma outra cidade.

## Resumo

- **Candidatas:** Rio de Janeiro (6.731.133 habitantes), Brasília (3.009.996), Fortaleza (2.582.360), Salvador (2.559.945) e Belo Horizonte (2.415.451). População é estimativa do IBGE, entre as oito cidades que consultei, sem São Paulo. Renda per capita municipal e população urbana não saíram de fonte oficial: marquei [incerto].
- **Regulação:** o ISS é municipal e tem teto de 5% (LC 116/2003, art. 8º, inciso II). Não confirmei a alíquota de nenhuma das cinco cidades em fonte primária. Segundo a Agência Câmara (06/01/2026), o IBS entra em transição a partir de 2029 e o ISS deve ser extinto em 2033.
- **Concorrência:** as buscas citaram plataformas nacionais (GetNinjas, Parafuzo, Cronoshare, Maria Brasileira, Clickasa) em quatro das cinco cidades, e classificados (OLX, Cronoshare) em quatro; em vários casos a cobertura local não foi confirmada. Em Fortaleza só apareceu o GetNinjas; em Belo Horizonte, operadores locais (Engehall, S.O.S do Lar) e OLX. Apps locais confirmados foram poucos. Ausência nas buscas não prova ausência de concorrente.
- **Regra do plano:** nenhuma cidade deve entrar antes de medir liquidez num bairro-piloto. A regra escrita no O01 vale para distritos de São Paulo (duas semanas seguidas com G3 de 70% ou mais e ao menos 8 pedidos válidos por semana, `[proposta]`). Para outra cidade, não há regra escrita.
- **Recomendação:** não expandir agora. Levantar os dados que faltam (CEMPRE por categoria, painel NFS-e de cada município, Pix por município) e revisar a ordem depois que o piloto de São Paulo tiver liquidez medida. A ordem preliminar da parte (c) é provisória.

## Método e limites

**Abri e li (08/11/2026):**
- IBGE, SIDRA (API), tabela 6579 (estimativas de população), para as cinco candidatas e três reservas. Li a resposta por leitura de página, não o JSON completo. O ano de referência indicado pela tabela é 2026.
- IBGE, SIDRA (API), tabela 5938 (PIB dos municípios), variável "Produto Interno Bruto a preços correntes", ano 2023, em mil reais. O valor do Rio saiu igual em duas leituras; as demais cidades saíram em uma.
- Câmara dos Deputados, texto da LC 116/2003 (publicação original, DOU de 1º/8/2003): art. 3º, caput, e art. 8º, inciso II. Esta versão não traz art. 8º-A.
- Câmara dos Deputados, texto da Lei 13.640/2018 (DOU de 27/3/2018): inciso X do art. 4º da Lei 12.587/2012 (incluído pela lei) e art. 11-A, caput.
- Agência Câmara, notícia de 06/01/2026 sobre a transição da reforma tributária (cronograma de CBS, IBS, ICMS e ISS).
- Cetic.br, nota de imprensa de 31/10/2024 sobre a TIC Domicílios 2024 (conectividade urbana e rural; Pix).
- BCB, Portal de Dados Abertos, conjunto "Estatísticas do Pix" (lista de recursos e licença ODbL). Não li os dados em si.
- Blog de contabilidade (fonte secundária), tabela de ISS das capitais, atualizada em 01/07/2026. Serve só de pista: não traz alíquota padrão por capital.

**Não consegui abrir (falha de acesso):**
- IBGE Cidades, painel de Rio de Janeiro (cidades.ibge.gov.br): HTTP 403. Por isso o PIB per capita ficou [incerto].
- SIDRA, metadado da tabela 5938 (apisidra.ibge.gov.br/desc/t/5938): HTTP 403. Sem ele não localizei a variável de PIB per capita.
- SIDRA, tabela 9510 (CEMPRE por divisão da CNAE 2.0): HTTP 400. Por isso não há contagem de prestadores por categoria.
- Seade (seade.gov.br): HTTP 503. O Seade é a fonte estadual de São Paulo; não é necessário para as candidatas fora do estado.
- IBGE Agência (nota de rendimento domiciliar per capita 2022): HTTP 403. Números que apareceram em trecho de busca não foram usados.
- Anatel, "Densidades.pdf" (metadados do conjunto de densidade): o PDF veio comprimido e não foi lido.
- Prefeitura de Salvador, caderno de perguntas e respostas (PDF de março de 2026): não tentei abrir nesta sessão. Só o trecho de busca cita alíquota de 3%.
**Só trechos de resultado de busca (não abri as páginas):** lojas e sites de concorrentes (GetNinjas, Parafuzo, Cronoshare, Engehall, Maria Brasileira, Clickasa, OLX), notícia de preço de diarista em BH, portal da NFS-e (o painel municipal guarda a alíquota de cada município; não há tabela nacional consolidada) e notas sobre a LC 214/2025 e a Lei 13.640. Uso esses trechos só como pista e indico cada um como tal.

**Não li nem pesquisei:**
- texto da LC 214/2025 (só a notícia da Câmara);
- Planalto (não tentei nesta sessão; usei a versão da Câmara);
- ISS de cada município, leis e decretos municipais, código de posturas de cada cidade, regras municipais de transporte por aplicativo;
- Censo 2022 por município (renda domiciliar, população urbana, densidade);
- número de prestadores por categoria em cada cidade;
- regras do Distrito Federal;
- jurisprudência.
- O08: no repositório, o O08 é citado como `operacao/kpis.sql` (O01, linha 334, no D22, "lista do kpis.sql, O08"). Li apenas as referências a ele nos documentos da pasta `operacao/`; não li as consultas SQL. A liquidez por bairro e categoria aparece no O03, §6, como rascunho não executado.

## Parte (a): critérios de entrada numa cidade

Os limiares abaixo são propostas `[proposta]` ou ficam em aberto. Nenhum limiar veio de fonte externa.

| # | Critério | O que mede | Fonte e limite | Situação nesta pesquisa |
|---|---|---|---|---|
| 1 | Densidade de demanda | População e renda das famílias que compram serviços residenciais | IBGE, estimativas de população (SIDRA 6579): população total, não demanda. Censo 2022 por município (renda domiciliar): não acessei. Anatel, densidade: PDF não lido. | População obtida. Renda municipal [incerto]. Limiar: a definir pelo dono. |
| 2 | Prestadores por categoria | Empresas e MEI por CNAE no município | IBGE, CEMPRE. O conteúdo das tabelas 9510 e 9528 não foi verificado (a 9510 falhou com HTTP 400; a 9528 não foi aberta). Limite: CNAE não é ocupação, e parte dos prestadores atua sem CNPJ. | Extração falhou (HTTP 400). [incerto] |
| 3 | Regulação municipal | ISS (alíquota e lugar da incidência), código de posturas e, se a categoria incluir transporte, licença de transporte por aplicativo | LC 116/2003 (art. 3º, caput; art. 8º, II); Lei 13.640/2018 (art. 11-A: competência exclusiva dos Municípios e do Distrito Federal); painel NFS-e (alíquota por município). Leis municipais não abertas. | Parcial. Ver parte (c). |
| 4 | Pagamento Pix | Volume de transações Pix por município e penetração | BCB, recurso "Transações Pix por Município" (conjunto com atualização mensal, licença ODbL). Dá contagem, não penetração; a penetração exige a população como divisor. Nacional, Cetic 2024: Pix citado por 84% no ambiente digital, contra 66% em 2022 (nota de 31/10/2024). | Fonte existe e é aberta. Números municipais não extraídos. |
| 5 | Conectividade | Domicílios com internet | Cetic TIC 2024 (nota de 31/10/2024): 85% dos domicílios urbanos e 74% dos rurais. Dado por situação do domicílio, não por município. Anatel: conjunto de acessos existe, leitura não feita. | Nacional, urbano e rural obtidos. Municipal [incerto]. |
| 6 | Liquidez medida no bairro-piloto | Pedidos válidos com proposta qualificada dentro de 2 h (G3, meta interna, nunca prometida ao cliente) | O01, linha 38 e linha 219: G3 de 70% ou mais, com no mínimo 30 pedidos válidos na janela. Regra de expansão de distrito: duas semanas seguidas com G3 de 70% ou mais e ao menos 8 pedidos válidos por semana (O01, linha 180, §3.4, `[proposta]`). Liquidez por categoria e distrito: O03, §6 (rascunho não executado). | Regra existe só para distritos de São Paulo. |
| 7 | Oferta de prestadores aptos | Quantos prestadores aprovados por ocupação e bairro | O01, linha 201, estimativa do próprio plano: entre 5 e 7,5 aptos por ocupação e distrito para o pedido chegar a 3 propostas (resposta de 40% a 60%). Não há medição. | Ponto de partida, por categoria. |
| 8 | Concorrência observável | Apps e plataformas que já atendem a categoria no município | Buscas (ver parte c). Não há base que liste isso por cidade. | Só pistas. |
| 9 | Política da ocupação | Se a ocupação é regulamentada por conselho | O catálogo define a política por ocupação (PREAMBLE, §1). O critério não depende da cidade. | Não aplicado nesta pesquisa. |

Regra de decisão proposta (`[proposta]`, não aprovada):
- Entrar numa cidade só depois de a liquidez (critério 6) estar medida e atendida no bairro-piloto da cidade de origem, e de haver um novo bairro-piloto na cidade candidata.
- Para cada categoria a ser ativada, ter no bairro-piloto prestadores aptos dentro da faixa do critério 7 (5 a 7,5 por ocupação e bairro).
- Ter a alíquota de ISS e o lugar da incidência confirmados pelo contador para as categorias ativadas (critério 3).
- Ter a leitura de Pix e de conectividade do município (critérios 4 e 5) antes de definir o canal de pagamento e de atendimento.

Não defini limiares numéricos de população, PIB ou Pix. Isso depende de dados ainda não obtidos.

## Parte (b): candidatas

A lista se baseia na população estimada pelo IBGE. Entre as oito cidades que consultei, sem São Paulo (cidade-sede), as cinco maiores são as abaixo. Não varri todos os municípios brasileiros; a afirmação vale só para o conjunto consultado.

| Cidade (UF) | População estimada (ano de referência 2026, SIDRA 6579) | PIB 2023, R$ mil (SIDRA 5938) | PIB per capita | Nota |
|---|---:|---:|---|---|
| Rio de Janeiro (RJ) | 6.731.133 | 418.462.360 | [incerto] | Maior escala entre as candidatas |
| Brasília (DF) | 3.009.996 | 365.669.108 | [incerto] | Distrito Federal; regras próprias [incerto] |
| Fortaleza (CE) | 2.582.360 | 86.939.832 | [incerto] | |
| Salvador (BA) | 2.559.945 | 76.698.777 | [incerto] | |
| Belo Horizonte (MG) | 2.415.451 | 130.197.671 | [incerto] | |

Reservas, pela mesma fonte: Manaus (AM), 2.327.101 habitantes, PIB 127.649.795 mil; Curitiba (PR), 1.832.183, PIB 120.065.276 mil; Recife (PE), 1.588.983, PIB 66.351.305 mil.

Notas:
- São Paulo está fora da lista porque é a cidade-sede.
- População urbana: não obtida. Os números são população total. A parcela urbana fica [incerto].
- PIB per capita: não consegui. Não calculei por conta própria, porque os anos das duas tabelas não batem (PIB de 2023, população de 2026). Não usar como dado.

## Parte (c): cada candidata

### Rio de Janeiro (RJ)

- **Regulação municipal relevante:**
  - ISS: alíquota da cidade [incerto]. Uma tabela secundária dá 2% a 5% e não cita lei municipal. Outro blog indica 5% para o Rio (só trecho de busca; não abri a página nem a fonte primária).
  - Código de posturas para serviço a domicílio: [incerto]. Não pesquisei.
  - Transporte por aplicativo: a competência é exclusiva dos Municípios e do Distrito Federal, cada um em seu território (Lei 13.640/2018, art. 11-A, caput). A lei carioca não foi aberta.
- **Concorrência observável:**
  - GetNinjas tem páginas de diarista e de eletricista no Rio (trechos de busca). As páginas mostram média de avaliação e número de avaliações, que são declarações da própria empresa; não conferi.
  - Parafuzo aparece em loja de app com diarista e menção a eletricista e encanador (mwm.ai, trecho de busca).
  - Engehall, empresa de eletricista, declara mais de 20 anos de mercado em site próprio (trecho de busca). É declaração da empresa.
  - OLX tem categoria de serviços no Rio, com anúncios individuais e sem triagem (trecho de busca).
- **Risco principal:** concorrência de plataformas nacionais já presentes, com custo de aquisição de cliente não medido. Pela estimativa do O01 (critério 7), cada categoria precisaria de 5 a 7,5 prestadores aptos por bairro. Na escala do Rio, a oferta necessária multiplica-se pelo número de bairros ativados.

### Brasília (DF)

- **Regulação municipal relevante:**
  - ISS: [incerto]. A tabela secundária diz que o DF "acumula competência estadual e municipal" e traz só a faixa de 2% a 5%, sem alíquota específica do DF.
  - Transporte por aplicativo: a Lei 13.640/2018, art. 11-A, dá competência exclusiva de regulamentação e fiscalização aos Municípios e ao Distrito Federal, no âmbito de cada território. Regra distrital não aberta.
  - Código de posturas: [incerto].
- **Concorrência observável:**
  - Não achei app local confirmado de eletricista ou diarista no DF.
  - Parafuzo: artigo do Olhar Digital de 12/03/2021 descreve limpeza e outros serviços. Cobertura no DF não confirmada (trecho de busca).
  - Maria Brasileira: app de limpeza e cuidados, com contratação pelo celular, segundo a App Store (trecho de busca). Cobertura no DF não confirmada.
  - Clickasa Services: app para cuidar da casa e pequenos reparos, segundo a App Store (trecho de busca). Função e cobertura não confirmadas.
  - Classificados (OLX, Cronoshare) e vagas de diarista dominam os resultados.
- **Risco principal:** a ausência de apps visíveis nas buscas pode indicar oferta menor ou menor visibilidade, e as fontes não permitem distinguir os dois casos. Soma-se a regra tributária e de regulação do DF, ainda não aberta.

### Fortaleza (CE)

- **Regulação municipal relevante:**
  - ISS: [incerto]. Tabela secundária dá 2% a 5% e remete à lista municipal, sem alíquota.
  - Transporte por aplicativo: competência municipal (Lei 13.640/2018, art. 11-A). Lei de Fortaleza não aberta.
  - Código de posturas: [incerto].
- **Concorrência observável:**
  - GetNinjas é um site nacional de diaristas e outros serviços, e declara mais de 250 mil pedidos por mês (declaração própria, trecho de busca). Não achei página específica de Fortaleza nos resultados.
  - Não achei app local confirmado de diarista ou eletricista em Fortaleza.
  - Como referência de outro estado, o governo do Paraná lançou um app para contratar trabalhadores autônomos, incluindo diaristas (bemparana.com.br, trecho de busca). Não se aplica a Fortaleza.
- **Risco principal:** a oferta de prestadores aptos por categoria não foi medida. Sem esse número, o modelo de duas a três propostas por pedido não tem base.

### Salvador (BA)

- **Regulação municipal relevante:**
  - ISS: um PDF da Prefeitura de Salvador (caderno de perguntas e respostas de março de 2026, sucop.salvador.ba.gov.br) cita alíquota de 3%, segundo trecho de busca. Não abri o PDF nesta sessão, então [incerto]. A menção está em documento de licitação, não em tabela geral.
  - Transporte por aplicativo e código de posturas: [incerto].
- **Concorrência observável:**
  - GetNinjas tem página de diarista para faxina padrão em Salvador (trecho de busca).
  - Cronoshare tem página de faxineira em Salvador com estimativa de preço da própria plataforma: mediana perto de R$ 87, faixa de R$ 69 a R$ 108 (trecho de busca). Não conferi.
  - Parafuzo declara atender mais de 200 cidades brasileiras, mas o trecho de busca não cita Salvador. Cobertura não confirmada.
  - Classificados em OLX e Cronoshare.
- **Risco principal:** a cobertura dos concorrentes em Salvador não foi confirmada. Se a faixa de preço de referência ficar perto de R$ 87 por faxina, a assinatura Pro de R$ 49 por mês pesa mais para o prestador. Isso só se resolve com dado de piloto. A alíquota de ISS também precisa ser confirmada.

### Belo Horizonte (MG)

- **Regulação municipal relevante:**
  - ISS: [incerto]. Uma tabela secundária dá 2% a 5%, sem alíquota de BH. Outro blog (só trecho de busca, não aberto) cita 5% para BH, sem lei citada. As duas fontes são secundárias: a aberta dá a faixa de 2% a 5%, sem alíquota de BH.
  - Transporte por aplicativo: competência municipal (Lei 13.640/2018, art. 11-A). Lei de BH não aberta.
  - Código de posturas: [incerto].
- **Concorrência observável:**
  - Engehall oferece função de despacho "Eletricista Perto de Mim" (site próprio, trecho de busca). A empresa declara chegada média de 60 a 90 minutos. É dado dela; não conferi.
  - S.O.S do Lar aparece na Solutudo como prestador de eletricista e de eletrodomésticos (trecho de busca).
  - Classificados da OLX para serviços em BH (trecho de busca).
  - Preço de referência de diarista: o Diário do Comércio (trecho de busca) informa média de R$ 190, com alta de 3,26% em 12 meses a partir de R$ 184 em agosto de 2025. Fonte secundária; não conferi.
- **Risco principal:** operadores locais com despacho próprio, sobretudo em eletricista, que já atendem demanda de urgência. Uma entrada do WorkEasy teria de competir com eles em preço e tempo de chegada, sem dado de liquidez.

## Parte (c): ordem preliminar

A ordem abaixo é uma proposta `[proposta]`, não um ranking estatístico. Ela se apoia em dados parciais; em especial, a primeira posição de Brasília depende da ausência de concorrência encontrada nas buscas, o que é evidência fraca.

1. **Brasília (DF):** escala grande (3,0 milhões de habitantes) e PIB de 2023 de R$ 365,7 bilhões. Nas buscas, não achei app local confirmado. Pesa contra: regra tributária e de regulação do DF não aberta.
2. **Belo Horizonte (MG):** 2,4 milhões de habitantes e PIB de 2023 de R$ 130,2 bilhões. Há operador local com despacho de eletricista, o que pode indicar demanda e concorrência ao mesmo tempo.
3. **Rio de Janeiro (RJ):** maior escala (6,7 milhões de habitantes; PIB de 2023 de R$ 418,5 bilhões), mas com plataformas nacionais já presentes. Deve ter o maior custo de aquisição de cliente das cinco, mas isso não foi medido.
4. **Fortaleza (CE):** 2,6 milhões de habitantes e PIB de 2023 de R$ 86,9 bilhões. Poucas evidências de concorrência local.
5. **Salvador (BA):** 2,6 milhões de habitantes e PIB de 2023 de R$ 76,7 bilhões. Cobertura de concorrentes não confirmada e ISS em aberto.

Pré-condições para qualquer cidade, antes de estudo de campo:
- Liquidez de São Paulo medida: G3 de 70% ou mais por duas semanas seguidas, com ao menos 8 pedidos válidos por semana (regra `[proposta]` do O01, linha 180).
- Dados municipais que faltam: contagem de prestadores por categoria (CEMPRE), alíquota de ISS confirmada em fonte primária, Pix e conectividade por município.
- Parecer sobre ISS e intermediação (ver perguntas).

## Parte (d): regra do plano

- O O01 define a regra de expansão para distritos de São Paulo: duas semanas seguidas com G3 de 70% ou mais e ao menos 8 pedidos válidos por semana (`[proposta]`, linha 180, §3.4).
- O O03 repete a regra (linha 68) e pede que a liquidez seja medida pelo relógio do G3 (linha 21).
- Para outra cidade, o plano não escreve regra. A proposta é aplicar a mesma regra a um bairro-piloto da nova cidade e só depois ativar mais categorias.
- A liquidez por bairro e categoria ainda não existe no banco: o O03 diz que a consulta da seção 6 é rascunho não executado (linha 21).

## Perguntas para o profissional

**Advogado (tributário e municipal):**
1. O art. 3º, caput, da LC 116/2003 diz que o serviço é tributado "no local do estabelecimento prestador ou, na falta do estabelecimento, no local do domicílio do prestador", com exceções nos incisos I a XXII. Quais exceções valem para serviços feitos na casa do cliente? A versão que li é a original de 2003. Quais alterações posteriores valem hoje?
2. Como intermediária, a WorkEasy tem obrigação de inscrição ou de retenção de ISS em cada município onde houver pedido?
3. Como fica a transição do ISS para o IBS (LC 214/2025) para uma plataforma que intermedeia serviços em cidades diferentes?
4. Se alguma categoria incluir transporte, qual lei municipal exige licença, conforme o art. 11-A da Lei 13.640/2018?
5. Quais leis municipais e códigos de posturas precisam ser checados antes de abrir uma cidade?

**Contador:**
6. Qual é a alíquota de ISS de cada cidade para os itens da lista da LC 116/2003 que as categorias do catálogo usam? Como conferir no painel NFS-e de cada município?
7. Como a cobrança da assinatura e a retenção de tributos afetam a apuração de um prestador que atua em mais de uma cidade?

**Especialista em dados (fonte oficial):**
8. Qual tabela do IBGE dá renda domiciliar per capita e população urbana por município, no Censo 2022? Qual variável de PIB per capita existe na tabela 5938?
9. A tabela 9510 do CEMPRE permite contar prestadores por classe de CNAE nas cinco candidatas? Se não, qual tabulação personalizada usar?

**Dono (decisões, não parecer):**
10. Qual o limiar de população, de prestadores e de Pix para entrar numa cidade? Hoje está em aberto.

## Fontes consultadas

Abertas em 08/11/2026:

| # | URL | Norma, artigo ou seção | Resultado |
|---|---|---|---|
| 1 | https://apisidra.ibge.gov.br/values/t/6579/n6/3304557,5300108,2927408,2304400,3106200,1302603,4106902,2611606/v/9324/p/last | IBGE, SIDRA, tabela 6579 (estimativas de população), última referência | Reaberta em 08/11/2026 na verificação independente: população 2026 confere nas oito cidades |
| 2 | https://apisidra.ibge.gov.br/values/t/5938/n6/3304557,5300108,2927408,2304400,3106200,1302603,4106902,2611606/v/37/p/last | IBGE, SIDRA, tabela 5938 (PIB dos municípios), PIB a preços correntes, 2023 | Reaberta na verificação: valores das oito cidades conferem (mil reais) |
| 3 | https://apisidra.ibge.gov.br/values/t/5938/n6/3304557/v/all/p/last | IBGE, SIDRA, tabela 5938, Rio de Janeiro, todas as variáveis | Lida; confirmou o PIB do Rio (R$ 418.462.360 mil) e que nenhuma variável retornada para o Rio tem 'per capita' no nome |
| 4 | https://apisidra.ibge.gov.br/values/t/5938/n6/3304557,5300108,2927408,2304400,3106200,1302603,4106902,2611606/v/498/p/last | IBGE, SIDRA, tabela 5938, variável 498 | Retornou 'Valor adicionado bruto a preços correntes total', não PIB per capita (reconferido) |
| 5 | https://www2.camara.leg.br/legin/fed/leicom/2003/leicomplementar-116-31-julho-2003-492028-publicacaooriginal-1-pl.html | LC 116/2003, art. 3º, caput; art. 8º, inciso II | Lida. Publicação original (DOU de 1/8/2003, data não reconferida). Art. 3º, caput, art. 8º, II, e ausência de art. 8º-A reconferidos |
| 6 | https://www2.camara.leg.br/legin/fed/lei/2018/lei-13640-26-marco-2018-786385-publicacaooriginal-155125-pl.html | Lei 13.640/2018: inciso X do art. 4º da Lei 12.587/2012 (incluído); art. 11-A, caput | Lida. DOU de 27/3/2018 |
| 7 | https://www.camara.leg.br/noticias/1237089-reforma-tributaria-comeca-fase-de-transicao-com-testes-de-novos-impostos-em-2026/ | Agência Câmara, notícia sobre a transição da reforma tributária | Lida. Publicada em 06/01/2026 |
| 8 | https://www.cetic.br/pt/noticia/em-duas-decadas-proporcao-de-lares-urbanos-brasileiros-com-internet-passou-de-13-para-85-aponta-tic-domicilios-2024/ | Cetic.br, TIC Domicílios 2024 | Lida. Publicada em 31/10/2024 |
| 9 | https://dadosabertos.bcb.gov.br/dataset/pix | BCB, Portal de Dados Abertos, "Estatísticas do Pix" | Lida: lista de recursos e licença. Dados não lidos |
| 10 | https://www.bcb.gov.br/estabilidadefinanceira/pixstatistics | BCB, página de estatísticas do Pix | Abriu sem números (a captura trouxe só o título 'Banco Central do Brasil') |
| 11 | https://www.contabilidadezen.com.br/blog/tabela-iss-capitais-brasileiros-2026/ | Fonte secundária: tabela de ISS das capitais, atualizada em 01/07/2026 | Lida. Sem alíquota padrão por capital |

**Falhas de acesso:** cidades.ibge.gov.br (panorama de Rio, HTTP 403); apisidra.ibge.gov.br/desc/t/5938 (HTTP 403); apisidra.ibge.gov.br, tabela 9510 (HTTP 400); seade.gov.br (HTTP 503); agenciadenoticias.ibge.gov.br (nota de rendimento per capita 2022, HTTP 403); anatel.gov.br/dadosabertos/PDA/Acessos/Densidades.pdf (PDF comprimido, ilegível).

**Só em trecho de resultado de busca (não abertos, usados como pista):** sucop.salvador.ba.gov.br (caderno de perguntas e respostas de março de 2026, alíquota de ISS de 3%); getninjas.com.br (páginas de diarista no RJ e em Salvador, e de eletricista no RJ); mwm.ai (Parafuzo); olhardigital.com.br (artigo de 12/03/2021 sobre o Parafuzo); engehall.com.br (RJ e BH); cronoshare.com.br (faxineira em Salvador); apps.apple.com (Maria Brasileira e Clickasa); diariodocomercio.com.br (preço de diarista em BH); bemparana.com.br (app do Paraná); gov.br/nfse (painel municipal e API de alíquotas do ISS); gov.br/anatel (dados abertos); sidra.ibge.gov.br/pesquisa/cempre/tabelas (tabelas do CEMPRE).

**Citados como referência, sem abrir o texto:** LC 214/2025 (texto no Planalto e na Câmara); LC 116/2003 consolidada no Planalto, onde a busca mostrou um art. 8º-A com piso de 2% (não aberto; [incerto]).
