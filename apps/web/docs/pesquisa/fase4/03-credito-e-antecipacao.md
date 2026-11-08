# F09: Crédito e antecipação de recebíveis via PSP para prestadores

Dossiê de pesquisa. Não é parecer jurídico, contábil, tributário nem de propriedade intelectual; serve de base para a conversa com o profissional competente.

Rascunho para revisão de advogado. Não é parecer jurídico.

Data de referência: 2026-11-08. Escopo: fase 4 do plano WorkEasy, oferta de antecipação de recebíveis ou crédito a prestadores por meio do parceiro de pagamentos. Advogado obrigatório antes de qualquer oferta.

## Resumo

- O produto de antecipação descrito é do Asaas, não da WorkEasy. A página oficial diz que o Asaas é "uma instituição de pagamentos", que a antecipação é "sujeita a análise de crédito" e que as taxas partem de 1,25% ao mês no cartão e de 5,79% ao mês no boleto. A página não diz quem financia. O blog do próprio Asaas, em 26/04/2024, diz que as antecipações de cartão são financiadas por FIDC, com cota sênior de investidores institucionais.
- Correções ao pedido: a norma de correspondentes é a Resolução CMN 4.935/2021 (não "BCB"), vigente desde 1/2/2022. A Resolução CMN 4.656/2018 aparece como revogada a partir de 1/1/2025 (pela Resolução CMN 5.177/2024), mas esse dado veio de trecho de busca, não de página aberta. A norma de SCD e SEP que costuma ser citada hoje é a Resolução CMN 5.050/2022, cujo status atual não foi confirmado.
- Sem licença, o único caminho que as fontes abertas deixam aberto é um encaminhamento neutro ao Asaas, sem comissão, sem receber valores, sem análise de crédito e sem garantia. Se houver comissão por indicação ou um papel de correspondente, o enquadramento muda e nenhuma fonte aberta resolve essa questão. Isso precisa de advogado.
- O CDC exige, na oferta de crédito, informações como a taxa efetiva anual, o custo efetivo total (CET) e a soma total a pagar (arts. 52 e 54-B). Se o prestador é "consumidor" quando toma crédito para a própria atividade é questão aberta. A LGPD exige base legal e transparência para usar dados do app numa análise de crédito (arts. 7, 9 e 20).
- Recomendação: não ofertar nem integrar antecipação ou crédito agora. Não há volume medido de pagamentos pelo app, a viabilidade não pode ser calculada e não há parecer. Se o dono quiser avançar, a primeira etapa é o parecer de advogado sobre o encaminhamento neutro.

## Método e limites

- Como foi lido: buscas (WebSearch) e leituras (WebFetch) em 2026-11-08. O WebFetch devolve texto extraído por ferramenta, não cópia integral. As aspas deste dossiê vêm desse texto extraído e precisam ser conferidas no original antes de qualquer uso jurídico. Cada fonte aberta está listada em "Fontes consultadas", com a data de abertura.
- Abertas com conteúdo utilizável: página do produto do Asaas; três posts do blog do Asaas; CDC consolidado (Câmara); LGPD consolidada (Câmara, HTML); Lei 4.595/1964 (publicação original, Câmara); Resolução CMN 5.050/2022 (cópia de terceiro, não o DOU); resumo jurídico da Felsberg sobre a Resolução CMN 4.935/2021 (secundária); página de dados da Lei 12.414/2011 (Câmara, sem o texto dos artigos).
- Não abertas ou falhas: Resolução CMN 5.177/2024 (página do BCB sem conteúdo); Resolução CMN 4.656/2018 (PDF do BCB ilegível); texto primário da Resolução CMN 4.935/2021 (PDF do BCB ilegível, caminho alternativo com erro 404, cópia do Poder360 bloqueada, resumo do Mattos Filho com erro 403); planalto.gov.br (CDC, LGPD e Lei 4.595 bloqueados por "Acesso Negado" em todas as tentativas); DOU (in.gov.br) com erro 502; LGPD em PDF da Câmara ilegível. Para CDC e LGPD usei as versões consolidadas HTML da Câmara, que abriram.
- Não pesquisado: jurisprudência do STJ sobre consumidor (destinatário final); termos do contrato Asaas sobre indicação, afiliação ou uso de marca; registro de FIDC na CVM; registro de SCD ou SCFI no BCB; Lei 13.506/2017 e as normas de instituição de pagamento. O arquivo DECISOES.md (linha 63) cita a Lei 12.865/2013 e a "Res. BCB 150/2021" como pontos de parecer pendentes; não as verifiquei aqui.
- Busca local no repositório: buscas por crédito, antecipação, correspondente, fintech e recebível em DECISOES.md e ARQUITETURA.md (saída limitada a 30 linhas) não trouxeram menções ao tema. As menções ao Asaas tratam de cobrança, webhook e split.
- Não há dado de uso real: segundo o contexto do projeto (PREAMBLE.md, seção 1), nada foi testado contra o Asaas real, e a comissão e a retenção (escrow) estão desligadas até parecer jurídico.

## 1. Produto de antecipação do Asaas (a)

Fonte principal: página oficial https://asaas.com/antecipacao-de-recebiveis, aberta em 2026-11-08 por extração. A página não mostra data de atualização; o rodapé traz "© Copyright 2026".

**Recebíveis elegíveis**

- Cartão de crédito: cobranças à vista ou parceladas (todas as parcelas ou só uma), assinaturas recorrentes e vendas pelo Asaas Tap.
- Boleto bancário: cobrança à vista, uma parcela ou cobranças recorrentes.
- Pix, débito e link de pagamento aparecem na página como meios de cobrança, não como recebíveis antecipáveis.

**Quem pode**

- MEI e pessoa física podem contratar, "é necessário cumprir alguns requisitos", que a página não detalha.
- Excluídos: empresas ligadas a doação, sorteio ou rifa.

**Requisitos extraídos da página**

- Cartão: vencimento não inferior a 8 dias úteis; cadastro aprovado no Asaas; selfie aprovada ou primeira transferência (Pix ou TED) concluída pela plataforma.
- Boleto: vencimento superior a 8 dias úteis; vencimento que não pode ser maior que 90 dias (trecho cortado na extração, conferir); cobrança com NF-e ou contrato.
- Prazo de espera: a extração indica 45 dias após a primeira transferência para PJ (FAQ de boleto) e 90 dias para PF. Trecho truncado, conferir [incerto].
- Análise: "Antecipação sujeita a análise de crédito." Um post do blog do Asaas, visto só em resultado de busca, diz que há consulta a bureaus de crédito. Não aberto [incerto].

**Taxas e prazos (extraídos da página, que diz que as taxas são "padrão" e remete à conta Asaas)**

| Item | Valor informado na página |
|---|---|
| Cartão, cobranças online | "A partir de 1,25% ao mês" |
| Boleto | "A partir de 5,79% ao mês", mais "taxa de R$ 0,79" no simulador |
| Antecipação automática | "as taxas são de 1,15%" (período não informado) |
| Asaas Tap, à vista | "taxa zero de antecipação para crédito à vista" |
| Asaas Tap, parcelado | "a partir de 1,25% ao mês" |
| Imposto | "O Asaas não cobra taxa de IOF." Afirmação do Asaas; o tratamento tributário não foi verificado |
| Prazo de recebimento | "Receba em até 2 dias úteis para cartão e 3 dias úteis para boleto", sujeito a análise |

Exemplo da própria página: cobrança de R$ 990,00 com vencimento em 32 dias, antecipada em 2 dias úteis, com recebimento de R$ 932,43. Cálculo nosso: a diferença de R$ 57,57 equivale a 5,8% do valor. É o custo total do exemplo, não uma taxa anualizada.

**Quem financia**

- A página não informa a origem dos recursos. Afirma que o Asaas é "uma instituição de pagamentos" (resposta de FAQ) e menciona uma "licença para atuar como sociedade de crédito, financiamento e investimento". O título "Use seu próprio dinheiro e liberte-se de outras fontes de crédito" é frase de marketing e não responde à pergunta.
- Blog do Asaas, "Publicado em 26 de abril de 2024" (https://blog.asaas.com/?p=266806): a segunda emissão de FIDC, de R$ 50 milhões, serve para "acelerar o processo de antecipação de recebíveis de cartão de crédito". A cota sênior foi comprada por "investidores institucionais". O Asaas detém "100% da cota subordinada". A estruturação foi do Itaú BBA e a gestão da Oliveira Trust. O post não diz quem é o cedente nem o servicer.
- Blog do Asaas, "Publicado em 13 de agosto de 2024" (https://blog.asaas.com/release/asaas-sociedade-de-credito-direto/?noamp=mobile): a licença de SCD permite "operações de crédito com recursos próprios". O post não menciona antecipação de recebíveis nem FIDC. Em resultado de busca havia a informação de que essa licença foi em 2022; o post aberto é de 2024, e não abri a fonte de 2022.
- Blog do Asaas, "Publicado em 20 de janeiro de 2026" (https://blog.asaas.com/release/licenca-scfi/?noamp=mobile): licença de SCFI "concedida pelo Banco Central", com novas fontes de captação (CDB, LC e RDB). Não liga a licença à antecipação.
- Em resultado de busca, sem abrir a fonte, aparece uma nova emissão de FIDC de R$ 300 milhões noticiada em outubro de 2026. Não verificado [incerto].
- Conclusão: pelas fontes do próprio Asaas, a antecipação de cartão é financiada por FIDC, com cota subordinada do Asaas. Se parte vem de recursos próprios, não está declarado. O registro do fundo na CVM e a licença no BCB não foram verificados.

## 2. Regulação aplicável (b)

### 2.1 Correções ao pedido

- "Resolução BCB 4.935/2021 sobre correspondentes": o nome correto, nas fontes vistas, é Resolução CMN nº 4.935, de 29/7/2021. Vigência: 1/2/2022 (resumo Felsberg, aberto em 2026-11-08). A numeração BCB não aparece nas fontes.
- "Resolução CMN 4.656/2018 para SCD": a cópia do BCB em resultado de busca indica "Documento normativo revogado, a partir de 1º/1/2025, pela Resolução CMN nº 5.177, de 26/9/2024". Não consegui abrir essa cópia nem a 5.177 [incerto]. A cópia aberta da 5.050 (art. 34) revoga, desde 1/1/2023, os arts. 1 a 26, 47 e 48 da 4.656 e a Resolução 4.792/2020.
- A resolução de SCD e SEP vigente hoje não está confirmada. A 5.050/2022 (vigência 1/1/2023, art. 35) pode ter sido revogada ou consolidada pela 5.177/2024; não verifiquei. A 5.159/2024, que alterou a 5.050 para permitir que o SCD financie por cessão de créditos, foi vista só em resultado de busca [incerto].

### 2.2 Quadro das normas

| Norma | O que diz (texto aberto ou trecho) | Situação |
|---|---|---|
| Lei 4.595/1964, art. 17 caput | Consideram-se instituições financeiras as pessoas jurídicas "que tenham como atividade principal ou acessória a coleta, intermediação ou aplicação de recursos financeiros próprios ou de terceiros" | Texto da publicação original, aberto. Não é o texto consolidado; alterações posteriores não conferidas |
| Lei 4.595/1964, art. 18 caput | "As instituições financeiras sòmente poderão funcionar no País mediante prévia autorização do Banco Central" | Mesma observação |
| Res. CMN 4.656/2018 (SCD e SEP) | Substituída. Arts. 1 a 26, 47 e 48 revogados desde 1/1/2023 (5.050, art. 34) | Revogação integral a partir de 1/1/2025 segundo trecho de busca [incerto] |
| Res. CMN 5.050/2022 (SCD e SEP) | Art. 7 caput: SCD opera "exclusivamente por meio de plataforma eletrônica", com funding de "capital próprio" ou cessão de créditos (art. 8). Art. 10, I: SCD não pode "captar recursos do público, exceto mediante emissão de ações". Art. 15 caput: SEP opera "exclusivamente por meio de plataforma eletrônica". Art. 22, I: SEP não pode "realizar operações de empréstimo e de financiamento com recursos próprios". Art. 2, II: plataforma é o "sistema eletrônico que conecta credores e devedores por meio de sítio na internet ou de aplicativo" | Cópia de terceiro (normasbrasil), não o DOU. Vigência em 1/1/2023. Status atual [incerto] |
| Res. CMN 5.159/2024 | Altera a 5.050 para permitir financiamento de SCD por cessão de créditos | Só em trecho de busca [incerto] |
| Res. CMN 4.935/2021 (correspondentes) | Resumo Felsberg: instituições contratantes precisam de política escrita aprovada pela diretoria ou órgão executivo e de controles internos. Atividades citadas: recepção e encaminhamento de propostas de abertura de contas de depósito e de pagamento; movimentação dessas contas; atendimento por sítio, aplicativo ou outra plataforma em rede. Trecho de busca (cópia do DOU, não aberto) indica que o art. 2 §1º exige correspondente no País para serviços "de forma pessoal ou por meio de plataforma eletrônica" e que o art. 2 §2º define a plataforma do correspondente | Texto primário não aberto. Não encontrei no que foi lido que o correspondente possa encaminhar propostas de crédito [incerto] |
| Lei 12.414/2011 (cadastro positivo) | Página de dados da norma (Câmara) mostra alteração do caput e dos §§ 4º a 8º do art. 4 pela LC 166/2019 e revogação parcial dos §§ 1º e 2º | Texto dos artigos não obtido [incerto] |
| CDC, Lei 8.078/1990, arts. 2, 7, 25, 34, 52 e 54-B | Ver item 3.2 | Consolidado da Câmara, aberto |
| LGPD, Lei 13.709/2018, arts. 7, 9 e 20 | Ver item 4 | Consolidado da Câmara (HTML), aberto. Ementa com alteração da Lei 13.853/2019 |

## 3. Encaminhar ou ser parte (c)

### 3.1 O que as fontes abertas permitem concluir

- Pela página, a antecipação é oferecida pelo Asaas, e a WorkEasy não aparece como parte da operação. Isso favorece o encaminhamento, mas não resolve o enquadramento.
- A indicação pode cair em três categorias, e nenhuma fonte aberta diz qual é a correta:
  1. Mera informação ou link para o site de terceiro, sem remuneração. A única hipótese que as fontes não contrariam.
  2. Indicação remunerada (comissão por contrato fechado). Aqui cabe a dúvida sobre intermediação de recursos (Lei 4.595, art. 17) e sobre remuneração de correspondente.
  3. Papel de correspondente, por contrato com o Asaas ou outra instituição autorizada. Exige o cumprimento da Resolução CMN 4.935/2021, incluindo a política e os controles da contratante. Não há no texto lido a extensão ao encaminhamento de crédito.
- Os textos do SCD e do SEP (Res. CMN 5.050) tratam a plataforma como canal da instituição autorizada. Não há regra aberta sobre indicação de prestador por plataforma terceira. Não tomar essa ausência como permissão.
- A Lei 4.595 (art. 17) define como instituição financeira quem exerce "coleta, intermediação ou aplicação de recursos financeiros", e o art. 18 exige autorização prévia do BCB para funcionar. Se a indicação envolver receber, reter ou repassar recursos do crédito, a análise muda. Esse é o ponto mais sensível, e a fonte aberta não resolve.

### 3.2 CDC: o que a oferta de crédito precisa informar

Fonte: Código de Defesa do Consumidor, versão consolidada da Câmara dos Deputados (https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html), aberta em 2026-11-08.

- Art. 52, caput: quem outorga crédito ou concede financiamento ao consumidor deve informá-lo "prévia e adequadamente" sobre, entre outros, o preço em moeda nacional (I), "os juros de mora e a taxa efetiva anual de juros" (II), os "acréscimos legalmente previstos" (III), o "número e periodicidade das prestações" (IV) e a "soma total a pagar, com e sem financiamento" (V). O texto aberto não traz inciso VI.
- Art. 54-B, caput: o fornecedor deve informar o consumidor "prévia e adequadamente, no momento da oferta". O §1º exige que essas informações constem "de forma clara e resumida" do contrato, da fatura ou de instrumento apartado. O §2º diz que o custo efetivo total "consistirá em taxa percentual anual". O artigo foi inserido pela Lei 14.181/2021, segundo a nota de alteração do texto aberto.
- Consumidor ou não: o art. 2 define consumidor como "toda pessoa física ou jurídica que adquire ou utiliza produto ou serviço como destinatário final". O prestador que toma crédito para a própria atividade pode ou não ser consumidor nessa operação. A jurisprudência não foi pesquisada [incerto].
- Responsabilidade: o art. 7, parágrafo único, o art. 25, §1º, e o art. 34 tratam de responsabilidade solidária. O art. 34 diz que "o fornecedor do produto ou serviço é solidariamente responsável pelos atos de seus prepostos ou representantes autônomos". Se a WorkEasy atuar como representante do fornecedor de crédito, essa regra pode alcançá-la. Isso precisa de parecer.

## 4. Inadimplência e avaliação de crédito com dados (d)

**Quem assume o risco**

- No produto do Asaas, a análise e o risco são descritos como da operação do Asaas e do fundo. A página não diz que a WorkEasy tem risco.
- A WorkEasy passaria a ter risco de crédito se garantisse o recebível, pagasse a antecipação, recomprasse o título ou retivesse valores para cobrir inadimplência. Esses cenários estão fora do escopo permitido pelo plano (comissão e escrow desligados).

**Dados do app em uma análise de crédito**

Os dados do próprio app (atendimentos, valores recebidos, avaliações) são dados pessoais do prestador, pessoa física ou MEI. Fonte: LGPD, versão consolidada da Câmara (https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html), aberta em 2026-11-08.

- Art. 7, caput: o tratamento "somente poderá ser realizado nas seguintes hipóteses". Entre elas: I, "mediante o fornecimento de consentimento pelo titular"; II, "para o cumprimento de obrigação legal ou regulatória pelo controlador"; V, "quando necessário para a execução de contrato ou de procedimentos preliminares"; X, "para a proteção do crédito, inclusive quanto ao disposto na legislação pertinente".
- Art. 9, caput: o titular tem "direito ao acesso facilitado às informações sobre o tratamento de seus dados" (finalidade, forma, duração, controlador, compartilhamento).
- Art. 20, caput: o titular pode "solicitar a revisão de decisões tomadas unicamente com base em tratamento automatizado", incluídas as que definam perfil "de consumo e de crédito". §1º: o controlador deve fornecer, quando solicitado, "informações claras e adequadas a respeito dos critérios" usados, ressalvados segredos comercial e industrial.
- Lei 12.414/2011 (cadastro positivo) regula bancos de dados de adimplemento para formação de histórico de crédito. Não sei se uma plataforma não financeira pode consultá-los. Não verificado [incerto].
- Ponto em aberto: a hipótese do art. 7, X (proteção do crédito) não tem, nas fontes lidas, aplicação confirmada a uma plataforma que não é credora. O consentimento específico (art. 7, I) é a base mais conservadora a considerar. A escolha cabe ao advogado.

## 5. Métricas mínimas (e)

- Nenhuma fonte aberta traz número de viabilidade. Não vou propor um limiar sem base.
- O cálculo que importa é o volume mensal de recebíveis elegíveis pagos por meio do Asaas, por prestador, multiplicado pelo número de prestadores que atendem aos requisitos do Asaas (cadastro aprovado, primeira transferência, vencimento acima de 8 dias úteis, boleto com NF-e ou contrato) e pela fração que quer antecipar.
- Hoje esse dado não existe: os pagamentos não foram testados contra o Asaas real e não há usuários reais (PREAMBLE.md, seção 1).
- Se algum dia houver remuneração por indicação, a conta muda: entram a receita de comissão, o risco regulatório e o custo de conformidade. Nada disso foi modelado.
- Gatilho proposto, sem número: só voltar ao tema depois de pagamentos reais em produção, medição de volume por prestador e parecer de advogado.

## 6. Pré-requisitos

| Pré-requisito | Motivo | Situação |
|---|---|---|
| Parecer de advogado sobre o papel da WorkEasy (informação, indicação remunerada ou correspondente) | Itens 2 e 3 | Pendente, obrigatório antes de qualquer oferta |
| Termos do contrato com o Asaas sobre indicação, afiliação e uso de marca | Não foi aberto | Pendente |
| Status vigente de 4.656, 5.050, 5.159, 5.177 e 4.935 conferido no BCB | Divergências do item 2 | Pendente |
| Texto primário da Res. CMN 4.935/2021, art. 12 (atividades de correspondente) | Não foi aberto | Pendente |
| Base legal LGPD e texto de consentimento específico para análise de crédito | Item 4 | Pendente |
| Pagamentos reais em produção com volume medido por prestador | Item 5 | Não existe hoje |
| Comunicação sem promessa de prazo ou taxa em nome da WorkEasy | PREAMBLE.md, seção 2 | A fazer |
| Análise tributária de eventual receita por indicação | Não pesquisado | Contador, a definir |

## 7. Riscos

- Regulatório: se houver intermediação de recursos ou remuneração com captação de crédito, o enquadramento como atividade financeira sem autorização (Lei 4.595, arts. 17 e 18). Risco alto se houver remuneração combinada com intermediação de recursos. Nenhuma sanção foi pesquisada.
- Consumidor: sem as informações do art. 52 e do art. 54-B na tela da WorkEasy, a comunicação fica incompleta. Responsabilidade solidária se a WorkEasy for representante do fornecedor (arts. 7, 25 e 34).
- Dados: uso de dados do app para score (LGPD, arts. 7, 9 e 20). Decisões automatizadas do Asaas que a WorkEasy não controla, mas cujas consequências recairiam sobre o app.
- Inadimplência: se a WorkEasy garantir, pagar ou reter valores, passa a ter risco de crédito. Sem garantia, o risco é reputacional, com prestador superendividado. A nota de alteração do art. 54-B cita a Lei 14.181/2021; o alcance sobre superendividamento não foi verificado.
- Dependência do parceiro: a página diz que as taxas são "padrão" e remete à conta. Mudanças de taxa ou de requisitos ficam fora do controle do app.
- Comunicação: qualquer promessa de prazo ("em até 2 dias úteis") ou de taxa, se publicada pela WorkEasy, vira oferta da WorkEasy. O PREAMBLE.md proíbe frases como "imediatamente" e "em até N horas".
- Parceiro: o enquadramento do Asaas (instituição de pagamento e financeira) vem da própria página e dos posts do blog. Não confirmei no registro do BCB [incerto].

## 8. O que parece possível sem licença (a confirmar)

Hipótese mais estreita, que o advogado precisa confirmar:

- Um bloco informativo que diga, em linguagem neutra, que o prestador pode pedir antecipação diretamente ao Asaas, com link para a página oficial do Asaas. Sem comissão, sem receber ou reter valores, sem análise ou pré-análise de crédito pela WorkEasy, sem garantia, sem coleta de dados para o Asaas, e com aviso de que condições e decisão são do Asaas.

Fora dessa hipótese, precisa de parecer antes:

- Indicação remunerada; "elegibilidade" ou pré-análise calculada pelo app; simulação de taxa ou prazo; coleta de dados destinada ao parceiro; qualquer papel de correspondente.

Não possível sem licença, segundo as normas lidas:

- Captar recursos do público, emprestar com recursos próprios, ser parte do contrato de crédito ou reter valores para pagar a antecipação (Res. CMN 5.050, arts. 10, I e 22, I, na cópia lida).

## 9. Recomendação

1. Não ofertar nem integrar antecipação ou crédito agora. Motivos: não há parecer, não há volume medido de pagamentos, o produto não foi testado contra o Asaas real e as normas aplicáveis não estão confirmadas.
2. Antes de qualquer oferta, parecer de advogado com as perguntas abaixo. A ordem sugerida: primeiro o papel da WorkEasy (item 3), depois LGPD (item 4), depois o CDC (item 3.2).
3. Se o dono decidir avançar depois do parecer, começar pelo encaminhamento neutro do item 8, sem remuneração por indicação. Medir pelo menos um ciclo de pagamentos reais antes de pensar em oferta própria.
4. Não definir meta numérica sem dados próprios. Não publicar prazo ou taxa em nome da WorkEasy; citar o Asaas como fonte quando a informação for mencionada.
5. Manter fora do escopo qualquer papel de credor, garantidor ou retentor de valores.

## Perguntas para o profissional

1. Um link informativo para a página do Asaas, sem comissão e sem participação na contratação, é correspondência (Res. CMN 4.935/2021), intermediação (Lei 4.595, art. 17) ou apenas divulgação de terceiro? Qual o texto vigente do art. 12 da Res. CMN 4.935/2021?
2. Uma comissão por contrato fechado muda a resposta? Quando a indicação remunerada passa a ser intermediação de recursos ou remuneração de correspondente?
3. Qual é a norma vigente de SCD e SEP hoje? A Res. CMN 5.050/2022 foi revogada pela 5.177/2024? A Res. CMN 4.656/2018 está integralmente revogada desde 1/1/2025?
4. Um prestador que toma crédito para a própria atividade profissional é consumidor (CDC, art. 2)? Se for, valem os deveres dos arts. 52 e 54-B, e em que formato?
5. Se a WorkEasy for considerada representante do fornecedor de crédito, a responsabilidade solidária (arts. 7, parágrafo único, 25, §1º, e 34) a alcança?
6. Qual base legal da LGPD (art. 7, I, II, V ou X) serve para usar dados do app numa análise de crédito? Precisa de consentimento específico? Como cumprir a transparência do art. 9 e a revisão do art. 20?
7. A plataforma pode consultar bancos de dados de crédito (Lei 12.414/2011, texto vigente após a LC 166/2019)? Quais limites?
8. O contrato com o Asaas permite indicação de terceiros, comissão de afiliado e uso da marca Asaas na WorkEasy?
9. Como confirmar, no BCB, o registro do Asaas (instituição de pagamento e SCFI) e do FIDC que financia as antecipações? Quem é o cedente e o servicer?
10. Quais frases sobre taxa e prazo do Asaas podem aparecer na WorkEasy sem caracterizar oferta própria?
11. Algum tratamento tributário muda se houver receita por indicação? Isso é para o contador; registrar a dúvida.

## Fontes consultadas

Todas as fontes abertas em 2026-11-08, salvo indicação.

Abertas com conteúdo utilizável:

- https://asaas.com/antecipacao-de-recebiveis: página oficial do produto de antecipação do Asaas. Seções: recebíveis, requisitos, taxas, prazo, FAQ. Leitura por extração (WebFetch). Sem data de atualização na página.
- https://blog.asaas.com/?p=266806: post do próprio Asaas, "Publicado em 26 de abril de 2024", sobre a segunda emissão de FIDC de R$ 50 milhões. Fonte da própria empresa.
- https://blog.asaas.com/release/asaas-sociedade-de-credito-direto/?noamp=mobile: post do Asaas, "Publicado em 13 de agosto de 2024", sobre a licença de SCD. Fonte da própria empresa.
- https://blog.asaas.com/release/licenca-scfi/?noamp=mobile: post do Asaas, "Publicado em 20 de janeiro de 2026", sobre a licença de SCFI. Fonte da própria empresa.
- https://www.normasbrasil.com.br/norma/resolucao-5050-2022_438930.html: cópia de terceiro da Resolução CMN 5.050/2022, arts. 2, II; 7; 8; 10, I; 15; 22, I e IV; 34; 35. Não é o DOU.
- https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html: Lei 8.078/1990 (CDC), versão consolidada. Arts. 2, caput; 7, parágrafo único; 25, §1º; 34; 52, caput e incisos I a V; 54-B, caput e §§ 1º e 2º. Nota de alteração do art. 54-B pela Lei 14.181/2021.
- https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html: Lei 13.709/2018 (LGPD), versão consolidada em HTML. Arts. 7, caput e incisos I, II, V e X; 9, caput; 20, caput e §1º. Ementa com redação da Lei 13.853/2019.
- https://www2.camara.leg.br/legin/fed/lei/1960-1969/lei-4595-31-dezembro-1964-353886-publicacaooriginal-1-pl.html: Lei 4.595/1964, publicação original. Arts. 17, caput; 18, caput e §1º. Não consolidado.
- https://www2.camara.leg.br/legin/fed/lei/2011/lei-12414-9-junho-2011-610758-norma-pl.html: Lei 12.414/2011, página de dados da norma. Sem o texto dos artigos; mostra alteração pela LC 166/2019.
- https://www.felsberg.com.br/cmn-aperfeicoa-regulacao-de-correspondentes-bancarios-no-brasil/: resumo de 23/08/2021 sobre a Res. CMN 4.935/2021. Fonte secundária, usada como apoio.

Consultadas só em resultado de busca, não abertas (marcadas [incerto] no texto):

- Res. CMN 4.656/2018, cópia do BCB (normativos.bcb.gov.br, Res_4656_v8_P.pdf): cabeçalho "revogado, a partir de 1º/1/2025, pela Resolução CMN nº 5.177, de 26/9/2024".
- Res. CMN 4.935/2021, art. 2, caput, §1º e §2º: trecho de busca de cópia do DOU (pesquisa.in.gov.br, 02/08/2021), não aberto.
- Res. CMN 5.159/2024 e Res. CMN 5.177/2024: menções em resultado de busca.
- Post do blog do Asaas de 2026 sobre SCFI e nota de FIDC III de R$ 300 milhões (outubro de 2026): resultado de busca, não aberto.
- Post do blog do Asaas sobre a licença de SCD datado de 2022: resultado de busca, não aberto; o post aberto é de 2024.
- Consulta a bureaus de crédito pelo Asaas: resultado de busca, não aberto.

Não abertas ou com falha:

- https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolução%20CMN&numero=5177: retornou só o cabeçalho "Banco Central do Brasil". Resolução CMN 5.177/2024 não lida.
- https://normativos.bcb.gov.br/Lists/Normativos/Attachments/50579/Res_4656_v8_P.pdf: PDF binário ilegível. Resolução CMN 4.656/2018 não lida.
- https://www.bcb.gov.br/content/publicacoes/air/Res%20CMN%204935%20AIR_Correspondentes_no_Pais.pdf: PDF binário ilegível (análise de impacto da Res. CMN 4.935/2021).
- https://www.bcb.gov.br/pre/normativos/res/2021/pdf/res_4935_v1_O.pdf: erro 404.
- https://static.poder360.com.br/2021/07/Resolu%C3%A7%C3%A3o-CMN-n4.935-de-29_7_2021.pdf: bloqueado pelo ambiente de leitura. Resolução CMN 4.935/2021 não lida.
- https://www.mattosfilho.com.br/unico/cmn-regras-contratacao-correspondentes/: erro 403.
- https://www.planalto.gov.br/ccivil_03/leis/l4595.htm e https://www.planalto.gov.br/ccivil_03/leis/l4595compilado.htm: "Acesso Negado". Versão consolidada da Lei 4.595 não lida.
- https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm: "Acesso Negado". CDC lido pela versão da Câmara.
- https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm e https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709.htm: "Acesso Negado". LGPD lida pela versão da Câmara.
- https://www.in.gov.br/materia/-/asset_publisher/Kujrw0TZC2Mb/content/id/36849373/do1-2018-08-15-lei-no-13-709-de-14-de-agosto-de-2018-36849337: erro 502 em duas tentativas.
- https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.pdf: PDF binário ilegível (a versão HTML foi usada).
- Texto dos artigos da Lei 12.414/2011: não obtido nas páginas lidas.
