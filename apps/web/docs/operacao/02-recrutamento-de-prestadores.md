# Recrutamento de prestadores: playbook dos primeiros 50

Documento O02 · versão de 23/10/2026 · uso interno do dono do WorkEasy, que opera sozinho.

> **Rascunho para revisão de advogado. Não é parecer jurídico.** As notas de conformidade (seção 12) resumem fontes abertas em 23/10/2026. Quem decide o que é permitido é o advogado.
>
> **Estado do produto:** MVP integrado ao `main` (PR #2), **não implantado**, sem usuários reais e sem nada testado contra Asaas, WhatsApp ou Resend de verdade. Este playbook descreve o que o código faz hoje. O que ainda não existe leva `[PLANEJADO]`; o que depende de parecer leva `[CONDICIONAL: depende de parecer]`.

| Marca | Significa |
|---|---|
| `[PLANEJADO]` | não existe no produto hoje |
| `[CONDICIONAL: depende de parecer]` | só vale depois de parecer jurídico |
| `[incerto]` | não consegui confirmar em fonte aberta |
| `[estimativa]` | juízo de trabalho, não dado medido |
| `[DECISÃO DO DONO]` | escolha sua que muda um texto |
| `{chaves}` e `[COLCHETES]` | campos a preencher antes de enviar |

Campos fixos dos textos: `[RAZÃO SOCIAL]`, `[CNPJ]`, `[E-MAIL DO SAC]`, `[E-MAIL DO ENCARREGADO]`, `[SITE]` (o endereço do app, o mesmo de `VITE_SITE_URL`) e `[WHATSAPP DA OPERAÇÃO]` (o número de `VITE_CONCIERGE_WHATSAPP`).

**Conteúdo:** 1 Leia primeiro · 2 Portões antes do primeiro contato · 3 Quem recrutar · 4 Canais · 5 Quando posso escrever · 6 Roteiros prontos · 7 Triagem em 10 perguntas · 8 Onboarding · 9 Folha "o que você recebe e quanto custa" · 10 Objeções · 11 Pedido de indicação · 12 Conformidade · 13 Planilha de acompanhamento · 14 Pontos para o advogado e lacunas · 15 Fontes · Apêndices A e B.

---

## 1. Leia primeiro

### 1.1 Objetivo

Cadastrar e aprovar prestadores nos bairros-piloto (de 3 a 5 bairros contíguos da Zona Sul, escolhidos no plano de 45 dias, documento O01; meta de referência do plano: 50 prestadores) sem prometer o que o produto não entrega e sem contatar ninguém de um jeito que a LGPD ou o WhatsApp não aceitem.

### 1.2 O funil

`contatado → respondeu → triagem → onboarded → aprovado → 1ª proposta → 1º serviço pago`

"Onboarded" neste documento é o cadastro **enviado para análise** (situação "Em análise" no app). Cada etapa tem uma prova dentro do produto, listada na seção 13.

### 1.3 Oito regras que valem para tudo

1. **Não prometa** clientes, quantidade de pedidos, posição na busca, nota, renda nem prazo de aprovação. O produto não sustenta nada disso. O teste `test/claims-guard.test.ts` recusa no código as frases desse tipo; aplique a mesma disciplina aqui.
2. **WhatsApp só para quem escreveu primeiro, ou deu o número e disse que pode chamar.** Para todos os outros, use outro canal (seção 5).
3. **Na primeira mensagem**, diga quem você é, de onde veio o contato, o que vai guardar e como parar (LGPD, art. 9).
4. **No máximo um lembrete por pessoa.** "Não" ou "SAIR" encerra, apaga e vai para a lista de não contatar.
5. **Conte o plano como ele é:** gratuito, com 5 propostas novas por mês; Pro opcional por R$ 49,00 por mês, com 30 dias de teste; hoje sem comissão. Esses valores são configurações da plataforma: confira em `/pro/assinatura` antes de mandar a folha da seção 9.
6. **Profissão regulamentada:** nada de promessa de pacientes ou clientes, ranking, preço, promoção, depoimento nem bônus por indicação.
7. **Nunca crie conta, aceite termos ou dê consentimento no lugar da pessoa.** Nunca peça código de login, senha, foto de documento ou certidão por WhatsApp: documento só no app.
8. **Nada que você não possa provar:** depoimento, "já temos N profissionais", logotipo, parceria, "aprovado por".

### 1.4 Para onde mandar a pessoa

O link certo é `[SITE]/pro/cadastro`. Ele pede login por código de 6 dígitos, enviado por e-mail ou por SMS (o envio por WhatsApp não é oferecido). Três lugares do app ainda levam à página de demonstração `/register-provider`, que **não guarda nada**: o rodapé "Trabalhe Conosco", o botão "Ofereço este serviço" nas páginas de serviço e o link em "Minha conta". Enquanto isso não for corrigido (seção 14), nunca diga "procure no site": mande o link direto. Hoje o caminho é o navegador do celular (o site é instalável como PWA); os apps das lojas dependem de publicação `[PLANEJADO]`.

---

## 2. Portões antes do primeiro contato

O que cada portão libera quando estiver **cumprido**:

- **Qualquer contato, até o de pré-lançamento:** portões 3, 4 e 7.
- **Abrir cadastros reais:** portões 1, 2 e 5, mais a decisão (a) do portão 8.
- **Falar de Pro, cobrança ou recebimento:** portão 6.
- **Recrutar uma categoria:** o restante do portão 8; para cuidadores, também o 9.

| # | Portão | Por quê | Como conferir | Hoje |
|---|---|---|---|---|
| 1 | Produto no ar, com login funcionando | Sem backend o app é demonstração e não guarda nada. O código por SMS depende de provedor configurado; o por e-mail depende dos modelos de e-mail do Supabase Auth (README). | Entrar em `[SITE]/entrar` com uma conta sua de teste | Não implantado |
| 2 | Termos de Uso e Política de Privacidade publicados | O aceite de `/entrar` e o `TermsGate` mandam para `/legal`, que hoje diz "Documentos em elaboração. Este protótipo não presta serviços nem trata dados reais." Consentimento sem informação prévia clara é nulo (LGPD, art. 9, § 1º) [F1]. | `/legal` mostra os textos publicados | Pendente (documentos L01, L02, L03 e L11) |
| 3 | Pessoa jurídica aberta e identificada nos textos | A mensagem precisa identificar o controlador e dar contato (LGPD, art. 9, III e IV) [F1]. DECISOES, seção 8, item 3. Não recrute em nome pessoal. | `[RAZÃO SOCIAL]` e `[CNPJ]` preenchidos | Pendente |
| 4 | Canais de contato e de parada funcionando | A pessoa precisa conseguir falar com você e mandar parar. | O número de WhatsApp da operação e os e-mails respondem; teste uma mensagem "SAIR" | Pendente |
| 5 | Fluxo completo testado por você | Login, cadastro, documento, análise, aprovação, serviço, agenda, proposta, com conta e documentos **fictícios** (nunca de uma pessoa real). | Roteiro da seção 8 | Só testado em banco local (testes de integração) |
| 6 | Cobrança real testada | Para falar de Pro e de cobrança: conta Asaas de produção aprovada e um Pix real de R$ 1,00 conferido no painel do Asaas. Até lá, as frases de cobrança ficam `[PLANEJADO]`. | Painel do Asaas | Pendente |
| 7 | Planilha e lista de não contatar criadas | Seção 13. | Acesso só seu | Pendente |
| 8 | Decisões do dono que mudam textos | (a) qual certidão de antecedentes aceitar (federal ou estadual) e a idade máxima dela; (b) recompensa por indicação (padrão deste documento: nenhuma); (c) preço na página pública para profissões cujo conselho restringe o uso de preço; (d) quem atende o suporte e quando. | Responder e anotar aqui | `[DECISÃO DO DONO]` |
| 9 | Pré-requisitos da linha Cuidado | DECISOES D12 e seção 5: a linha só abre ao público com pessoa jurídica, seguro de responsabilidade civil cotado, advogado trabalhista validando o fluxo e a trava de 2 dias, e ao menos 3 famílias atendidas em modo concierge. Recrutamento de cuidadores: só em conversa individual (seção 3.3). | Checklist de DECISOES seção 5 | Pendente |

**Pré-lançamento** (portões 3, 4 e 7 cumpridos; 1, 2 e 5 ainda pendentes): você só conversa com quem escreveu primeiro ou autorizou o contato (seção 5), anota o interesse com a data e não abre cadastro real. Use as variantes `PRÉ-LANÇAMENTO` dos roteiros.

---

## 3. Quem recrutar

Os dados de política abaixo são do `catalog/policies.json` em 23/10/2026 (tabela completa no apêndice A). A Frente A (matriz por conselho e conferência das políticas) pode mudar valores: antes de usar o texto de uma profissão, releia a política atual com o comando do apêndice A. Critérios de encaixe marcados como `[critério sugerido]` são juízo de trabalho, não regra do produto.

Regra de proporção `[critério sugerido]`: recrute para a demanda que você já tem em mãos. Nenhum bairro precisa de 30 diaristas e nenhum encanador. Siga os pedidos reais do documento O03.

### 3.1 Limpeza: `diarista`

- **Perfil que encaixa** `[critério sugerido]`: faz diárias avulsas em mais de uma casa; aceita no máximo 2 dias por semana com o mesmo cliente; atua nos bairros-piloto ou ao lado deles; tem celular com internet e WhatsApp; consegue fotografar documentos; tem 18 anos ou mais.
- **Não recrutar agora:** quem quer vaga fixa com carteira ou 5 dias por semana na mesma casa. A LC 150/2015, art. 1º, aplica as regras do emprego doméstico a quem trabalha de forma contínua, subordinada, onerosa e pessoal na casa "por mais de 2 (dois) dias por semana" [F8]; o app recusa o terceiro dia na mesma semana com o mesmo cliente.
- **O cadastro pede (política `diarista`, conferido):** documento com foto e selfie; CPF ou CNPJ; certidão de antecedentes criminais.
- **Onde procurar primeiro:** porteiros, zeladores e síndicos (que conhecem quem trabalha bem no prédio); grupos de bairro com autorização; indicação de quem já entrou.

### 3.2 Reparos em casa: `encanador`, `eletricista-residencial-e-comercial`, `pintor`, `montador-de-moveis`

- **Atenção ao nome:** não existe a ocupação `eletricista` no catálogo. `eletricista` é o slug da **área** "Elétrica, energia e climatização"; as ocupações são, por exemplo, `eletricista-residencial-e-comercial` e `instalacao-eletrica`.
- **Perfil que encaixa** `[critério sugerido]`: autônomo de chamados e pequenos serviços em casas e comércios pequenos; tem ferramentas e transporte; sabe orçar por visita ou por serviço; conhece o limite do próprio escopo.
- **Limites de escopo que as políticas citam:** rede de gás, desentupimento e caça-vazamento têm item próprio (nota do `encanador`); obra nova ou aumento de carga elétrica pode exigir projeto com ART/TRT (nota do `eletricista-residencial-e-comercial`); obra estrutural exige engenheiro ou arquiteto (nota do `pedreiro`). Pergunte na triagem; não prometa o que a política não cobre.
- **Não recrutar agora:** quem só faz obra grande ou estrutural; eletricista sem o certificado de curso que a política pede.
- **O cadastro pede:** `encanador`, `pintor`, `montador-de-moveis`: documento com foto e selfie; CPF ou CNPJ; certidão de antecedentes. `eletricista-residencial-e-comercial` (política ainda `a_confirmar`): os mesmos três, **mais** certificado de curso (a nota da política cita a NR-10; não conferi a norma).
- **Onde procurar primeiro:** lojas de material de construção e porteiros; egressos de curso de eletricista. O SENAI-SP lista "Eletricista Instalador Predial", 160 horas, como curso livre de qualificação profissional [F14]; concluir o curso **não substitui** o que a política pede.

### 3.3 Cuidado de idosos: `cuidador-de-idosos` (política `a_confirmar`)

- **Perfil que encaixa** `[critério sugerido]`: experiência com idosos e referências que você consiga conferir; entende que não faz ato de enfermagem; aceita a trava de 2 dias por semana por casa; tem 18 anos ou mais. O Senac SP oferece o curso livre "Cuidador de Idoso" (160 horas; exige ensino fundamental 2 concluído e 18 anos ou mais) [F12]; a política do WorkEasy **não** exige curso para essa ocupação.
- **Escopo (nota da política):** "Sem lei federal confirmada para a profissão. Não aplica injetáveis nem faz curativos (atos de enfermagem, COREN)." Repita isso na triagem.
- **O cadastro pede:** documento com foto e selfie; CPF ou CNPJ; certidão de antecedentes criminais.
- **Não recrutar agora:** quem quer vínculo CLT; quem quer fazer curativo, injeção ou outro ato de enfermagem; quem não aceita a trava de dias.
- **Cuidado com o discurso:** a linha Cuidado (plantões, check-in, relatório do dia) continua fechada ao público até o portão 9 ser cumprido. Recrute cuidadores **em conversa individual**, sem folheto e sem post de grupo `[DECISÃO DO DONO]`; não prometa plantão nem valor. As faixas de repasse de DECISOES seção 5 são estimativas internas do plano.

### 3.4 Profissionais liberais: `psicologo`, `nutricionista`, `fisioterapeuta`, `personal-trainer`

- **Perfil que encaixa** `[critério sugerido]`: autônomo com registro ativo no conselho, que atende online, em consultório ou em domicílio, e quer uma ferramenta de agenda, cadastro e orçamento. **Não** espera volume de clientes.
- **Não recrutar agora:** registro suspenso, cancelado ou "em processo"; quem pede garantia de pacientes ou de ranking; quem quer divulgar preço, promoção, sorteio, depoimento ou "antes e depois".
- **O cadastro pede (políticas com confiança `conferido` no catálogo em 23/10/2026):** documento com foto e selfie; CPF ou CNPJ; registro profissional (número e UF no passo 1, comprovante no passo 3). Mais certidão de antecedentes para `nutricionista`, `fisioterapeuta` e `personal-trainer` (não para `psicologo`).
- **Regras que mudam por profissão** (política atual, ver apêndice A): `psicologo` tem só assinatura e **sem avaliação pública**; `fisioterapeuta` tem só assinatura; `nutricionista` tem modelo de cobrança "em análise jurídica"; `personal-trainer` aparece com comissão no primeiro serviço, o que a matriz do CREF pode mudar. Em todas, a comissão está desligada hoje.
- **Texto pronto:** seção 6.7. **Limites de divulgação dos conselhos:** seção 12.5.

---

## 4. Canais, em ordem de custo e velocidade

Ordem para começar. Custo em dinheiro: só o que está citado. Velocidade, alcance e risco são `[estimativa]` de trabalho, não dado medido; revise com as suas taxas da planilha (seção 13) depois das primeiras semanas.

| Pos. | Canal | Custo em dinheiro | Velocidade até as primeiras conversas | Alcance | Risco de conformidade |
|---|---|---|---|---|---|
| 1 | Sua rede pessoal e indicação de quem já entrou | R$ 0 | Dias | Pequeno, confiança alta | Baixo |
| 2 | Porteiros, zeladores, síndicos e comércio local (padaria, casa de material, papelaria) com cartão ou QR | Impressão (cotar em duas gráficas; sem preço aqui) | Dias | Médio | Baixo |
| 3 | Grupos de bairro (WhatsApp, Facebook), com autorização do administrador | R$ 0 | Dias | Médio | Médio: remoção do grupo, percepção de spam |
| 4 | Escolas de formação (Senac SP, SENAI-SP, outras) | R$ 0 | De 1 a 3 semanas `[estimativa]` | Médio; bom para cuidador e eletricista | Baixo se não pedir lista de alunos |
| 5 | Apoio ao MEI: CATe da Prefeitura, Sebrae | R$ 0 | Semanas a meses `[estimativa]` | Alto, institucional | Baixo; nunca alegar parceria sem escrito |
| 6 | Profissionais regulamentados: colegas que você conhece e contato profissional público | R$ 0 | Semanas | Pequeno | Alto: regras de conselho e base do contato |
| 7 | Perfis públicos de Instagram e Google, um a um | R$ 0 | Lento | Pequeno | Médio `[incerto]`: regras das plataformas não conferidas |
| 8 | Sites de vagas | Variável `[incerto]` | n/d | n/d | Alto: "vaga" sugere emprego. Não use no começo |
| n/d | Anúncio pago | n/d | n/d | n/d | Fora do plano enquanto a demanda não for medida (mesma lógica de DECISOES D11) |

### Como usar cada canal sem passar do limite

**1. Rede pessoal e indicação.** Converse, mostre o app, peça que a pessoa repasse **o seu contato** a quem ela confia (seção 11). Não peça o telefone de terceiros. Não use contatos da Pulso Vital (seção 12.9).

**2. Porteiros, síndicos e comércio.** Deixe cartão ou cartaz com QR (seção 6.4) **com a autorização de quem administra o local**. Se o porteiro conhece um profissional bom, peça que ele entregue o seu cartão: **não** peça o telefone do profissional, porque ele não deu o número a você (seção 5).

**3. Grupos de bairro.** Leia a descrição e as regras fixadas. Se divulgar serviço é proibido, não poste. Se for permitido, ou se o administrador autorizar (seção 6.5), faça uma única publicação, sem marcar ninguém, sem adicionar pessoas ao grupo e sem chamar no privado quem apenas reagiu. Responda dúvidas no próprio grupo e chame no privado só quem pedir. Apague o post se o administrador pedir. Regras de Facebook e Instagram: `[incerto]`, não conferi.

**4. Escolas.** Use o texto da seção 6.6. Ofereça uma conversa de 15 minutos com a turma ou um cartão no mural, se a escola permitir. **Não peça lista** de alunos, e-mails ou telefones: a escola é quem trata esses dados, e cada aluno decide se procura você. Não use nome nem logotipo da escola sem autorização por escrito. O Senac SP mantém um espaço para empresas divulgarem **vagas de emprego, estágio e jovem aprendiz** (Senac Conecta e um mural digital pelo e-mail centralsenac@sp.senac.br; a página diz: "As vagas precisam ter relação com nossas áreas de atuação") [F13]. O que você oferece **não é vaga**: diga isso na primeira linha e pergunte se existe canal para oportunidades de trabalho autônomo, sem tentar enquadrar como vaga.

**5. CATe e Sebrae.** O CATe é um serviço da Secretaria de Desenvolvimento Econômico e Trabalho da Prefeitura de São Paulo; orienta a formalização do MEI e tem busca de vagas; aceita parceiros de conteúdo pelo e-mail portalcate@prefeitura.sp.gov.br [F15]. Só escreva quando tiver razão social, Termos publicados e produto no ar, e não diga que há parceria até receber confirmação por escrito. Sebrae: a página sobre MEI abriu, mas o conteúdo útil carrega por script e não consegui ler cursos nem pontos de atendimento [F17]; trate como `[incerto]`, confira a programação atual no site do Sebrae SP e conheça MEIs como participante de eventos abertos, conversando um a um, sem distribuir material sem autorização da organização.

**6. Profissionais regulamentados.** Comece por colegas que você conhece pessoalmente e que queiram ver o produto. Não peça a conselhos, sindicatos ou associações que divulguem o WorkEasy como indicação ou "selo". Use o texto da seção 6.7.

**7. Perfis públicos.** Mande **uma** mensagem, no canal que a pessoa publica para contato profissional (e-mail comercial, formulário do site). **Não** use WhatsApp na primeira mensagem (seção 5). Registre fonte, data e o teste de balanceamento (seção 12.2). Sem resposta, não insista.

**8. Sites de vagas.** Evite no começo. O anúncio entra como oferta de emprego; o WorkEasy não contrata, e a palavra "vaga" cria expectativa de salário e chefe. As regras de cada site não foram consultadas `[incerto]`.

---

## 5. Quando posso escrever?

A política do WhatsApp Business diz: "You may only contact people on WhatsApp if: (a) they have given you their mobile phone number or username; and (b)" [permissão da pessoa para receber mensagens seguintes]. As duas condições valem juntas, e a política cobre o app WhatsApp Business e a plataforma (API) [F4]. Com isso, e com a LGPD [F1][F2], a regra prática é:

| Situação | WhatsApp na primeira mensagem? | Roteiro | Base (rascunho para o advogado) | O que registrar na planilha |
|---|---|---|---|---|
| A pessoa escreveu primeiro (QR, link, cartaz, post) | Sim | 6.1-A | LGPD, art. 7, V (a pedido do titular, procedimentos preliminares) | Data, canal, o texto do pedido |
| A pessoa deu o número pessoalmente e disse que você pode chamar | Sim | 6.1-B | LGPD, art. 7, I (consentimento) e V | Data, local, quem ouviu a autorização |
| Número passado por terceiro (indicação) | **Não** | 11 | Sem base própria ainda | Quem indicou. Peça ao indicador que apresente você ou entregue o seu contato; quem escreve primeiro é o indicado |
| Contato profissional público (site, Instagram, Google) | **Não**; use o canal que a pessoa publica para contato profissional | 6.7 | LGPD, art. 7, IX e art. 10, I, com teste de balanceamento [F1][F2] | Fonte pública, data, teste de balanceamento |
| Lista comprada, raspada ou exportada de grupo | **Nunca** | n/d | Sem base. A primeira sanção da ANPD foi sobre uma empresa que oferecia lista de contatos de WhatsApp [F3] | n/d |
| Já pediu para parar | **Nunca mais** | 6.8 | LGPD, art. 8, § 5º e art. 18 [F1] | Data do pedido, lista de não contatar |

Ligação de triagem: só com quem respondeu e aceitou conversar. Ligação fria em massa está fora deste playbook.

---

## 6. Roteiros prontos

Sempre do WhatsApp Business da operação, uma conversa por vez, escrita ou gravada por você. Sem lista de transmissão para quem não pediu, sem programa de disparo, sem cliente de WhatsApp não oficial (seção 12.3). Horário sugerido: dias úteis, de 9h às 18h `[critério sugerido]`.

`{ESTADO}` = escolha uma linha:
- **NO AR:** "O cadastro já está aberto em [SITE]/pro/cadastro (entra com código enviado ao seu e-mail)."
- **PRÉ-LANÇAMENTO:** "Ainda não abrimos o cadastro. Posso anotar seu interesse e te avisar quando abrir?"

### 6.1 Primeiro contato no WhatsApp

**A. A pessoa escreveu primeiro:**

```text
Olá, {nome}! Aqui é {seu nome}, do WorkEasy ([RAZÃO SOCIAL], CNPJ [CNPJ]). Obrigado por escrever.

O WorkEasy é um aplicativo para profissionais autônomos organizarem agenda, orçamentos e clientes, e responderem a pedidos de clientes do bairro. Estamos começando em {bairros}: não consigo garantir clientes nem quantidade de pedidos.

Para falar do seu cadastro vou guardar seu nome, telefone, profissão e bairro. Uso só para isso, e apago quando você pedir: é só responder SAIR ou escrever para [E-MAIL DO ENCARREGADO].

{ESTADO}

Posso te explicar em 2 minutos o que é e o que o cadastro pede? Você prefere mensagem ou áudio?
```

**B. A pessoa deu o número pessoalmente e autorizou:**

```text
Olá, {nome}! Aqui é {seu nome}, do WorkEasy ([RAZÃO SOCIAL], CNPJ [CNPJ]). Conversamos {onde e quando} e você disse que eu podia te chamar por aqui. Por isso estou escrevendo.

O WorkEasy é um aplicativo para profissionais autônomos organizarem agenda, orçamentos e clientes, e responderem a pedidos de clientes do bairro. Estamos começando em {bairros}: não consigo garantir clientes nem quantidade de pedidos.

Vou guardar seu nome, telefone, profissão e bairro só para falar do seu cadastro, e apago quando você pedir: é só responder SAIR ou escrever para [E-MAIL DO ENCARREGADO].

{ESTADO}

Posso te explicar em 2 minutos?
```

### 6.2 Lembrete (um só)

Envie uma vez, de 3 a 5 dias depois, **só** a quem o roteiro 6.1 já alcançou. Sem resposta, marque "sem resposta" e pare.

```text
Oi, {nome}, é {seu nome}, do WorkEasy, de novo. Só confirmando se você ainda quer saber do cadastro. Se não for o momento, sem problema: responda SAIR e eu não escrevo mais.
```

### 6.3 Roteiro de áudio (de 35 a 45 segundos)

Use só com quem escreveu primeiro ou autorizou o contato. Fale devagar e diga seu nome e a empresa logo no começo.

```text
Oi, {nome}, tudo bem? Aqui é {seu nome}, do WorkEasy. Você {me escreveu / conversou comigo em {lugar}}, por isso estou mandando este áudio.

O WorkEasy é um aplicativo pra quem trabalha por conta própria, como {ocupação}. Dá pra guardar seus clientes, montar orçamento, marcar horário, e ver pedidos de clientes do bairro e mandar sua proposta.

Estamos começando agora, então eu não prometo cliente nem quantidade de pedido. O cadastro é gratuito e pede seus documentos, porque a equipe confere antes de liberar.

Vou guardar só seu nome, telefone, profissão e bairro, pra falar do seu cadastro. Se quiser que eu apague, é só mandar SAIR.

Posso te explicar com calma, por mensagem ou por ligação? Obrigado!
```

### 6.4 Texto de cartaz ou folheto (A5)

Coloque só onde quem administra o local autorizou. Não cole em poste, muro ou ponto de ônibus `[incerto: regras municipais de publicidade em via pública não foram conferidas]`. O QR abre uma conversa em que **a pessoa escreve primeiro**. Monte o link assim, com o número em dígitos e DDI (o mesmo formato que o app usa em `pages/cliente/concierge.ts`):

`https://wa.me/55DDDNUMERO?text=Quero%20saber%20do%20cadastro%20de%20profissionais%20do%20WorkEasy`

```text
VOCÊ TRABALHA POR CONTA PRÓPRIA EM {BAIRRO}?

Conheça o WorkEasy, aplicativo para profissionais autônomos:
• Página com seus serviços, horários e bairros
• Agenda, orçamento por link e cadastro dos seus clientes
• Pedidos de clientes do bairro: você vê e envia sua proposta
• Cadastro gratuito. O plano Pro é opcional

Não é vaga de emprego. Não garantimos clientes nem quantidade de pedidos.
Pedimos documentos, conforme a sua profissão.

Quer saber mais? Escaneie o QR ou chame no WhatsApp.
[QR]

Se você escrever, vamos responder por este número e guardar seu nome e telefone só para falar do cadastro. Para parar, é só avisar.
[RAZÃO SOCIAL] · CNPJ [CNPJ] · [E-MAIL DO SAC]
```

Variante `PRÉ-LANÇAMENTO`: troque a lista de benefícios por "Estamos preparando a abertura do cadastro em {bairros}. Escreva para entrar na lista de aviso." Não imprima preço nem prazo de teste: eles são configurações e podem mudar.

### 6.5 Grupo de bairro

**Passo 1. Peça permissão** ao administrador, se a descrição do grupo mandar falar com ele ou se você já tem um canal legítimo com ele (por exemplo, um conhecido em comum que apresente você):

```text
Olá, {nome do administrador}. Sou {seu nome}, atuo em {bairro} e estou montando o WorkEasy, um aplicativo para profissionais autônomos do bairro. Posso fazer uma única publicação no grupo avisando que estamos cadastrando profissionais? Se o grupo não permite divulgação, sem problema. Se permitir, mostro o texto antes.
```

**Passo 2. Publicação única**, só depois do "pode":

```text
Boa tarde, pessoal! Sou {seu nome}, do WorkEasy, aplicativo para profissionais autônomos. Estamos cadastrando quem presta serviço em {bairros}: {diarista, eletricista, encanador, pintor...}.

Não é vaga de emprego e não garantimos clientes: é uma ferramenta de agenda, orçamento e cadastro de clientes, com acesso a pedidos do bairro.

Quem tiver interesse pode escrever neste link: {link wa.me}. Eu só falo com quem escrever primeiro.

(Publicado com autorização do administrador. Se não puder ficar no grupo, é só avisar que eu apago.)
```

Regras: uma publicação; sem marcar ninguém; sem adicionar pessoas; sem mensagem privada para quem só curtiu; sem repetir o post enquanto o administrador não pedir.

### 6.6 Coordenação de escola de formação

```text
Assunto: Pedido de orientação: divulgação de cadastro de profissionais autônomos aos alunos

Olá, {nome}. Sou {seu nome}, do WorkEasy ([RAZÃO SOCIAL], CNPJ [CNPJ]).

Estamos montando um aplicativo para profissionais autônomos (agenda, orçamentos, cadastro de clientes e acesso a pedidos de clientes do bairro), começando por {bairros}, em São Paulo. Escrevo porque alunos do curso {curso} podem querer trabalhar por conta própria depois da formação.

Quero ser claro: não estamos oferecendo vaga de emprego nem contratação. O cadastro é gratuito, pede documentos, e não garantimos clientes nem quantidade de pedidos.

Posso pedir sua orientação sobre o que a escola permite?
1. Uma conversa de 15 minutos com a turma, ou um cartão no mural, se a escola aceitar divulgação externa;
2. Se existir um canal da escola para esse tipo de aviso (mural, boletim, e-mail aos alunos enviado pela própria escola), como solicitar.

Não peço lista de alunos nem dados pessoais: se a escola concordar, o aviso sai pelo canal dela e cada aluno decide se me procura. Também não vou usar o nome ou a marca da escola sem autorização por escrito.

Posso enviar o material para sua análise antes. Obrigado!
{seu nome} · {telefone} · [E-MAIL DO SAC]
```

### 6.7 Profissional regulamentado (CRP, CRN, CREFITO, CREF)

Use em resposta a quem escreveu primeiro, a colegas que autorizaram o contato, ou por **e-mail ou formulário profissional público** (seção 5). Escolha a linha de origem:

- `{origem A}`: "Você me escreveu pelo cartaz, por isso estou respondendo."
- `{origem B}`: "Encontrei este contato em {fonte pública}, que você divulga para contato profissional."

```text
Olá, {Dr./Dra. sobrenome}. Aqui é {seu nome}, do WorkEasy ([RAZÃO SOCIAL], CNPJ [CNPJ]). {origem}

O WorkEasy oferece a profissionais autônomos uma página com nome, profissão e número do {CRP/CRN/CREFITO/CREF}, agenda, cadastro de clientes e orçamentos. O número do registro aparece como "informado pelo profissional" até a nossa conferência no conselho.

Quero ser claro sobre o que não posso prometer: quantidade de clientes ou pacientes, posição em busca, avaliações públicas, ganho ou prazo de aprovação. Hoje o WorkEasy não cobra comissão; qualquer modelo de cobrança para a sua profissão só entra depois de conferir as regras do seu conselho.

A sua divulgação continua sujeita ao código do seu conselho, e a responsabilidade por cumpri-lo é sua. Confira com o conselho antes de publicar qualquer informação.

Se fizer sentido, mostro o aplicativo em 15 minutos, sem compromisso. Guardo seu nome e contato só para esta conversa; para eu apagar, basta responder SAIR.
```

**Não escreva nunca** a profissionais regulamentados: "mais pacientes", "mais clientes", "vagas", "ranking", "melhor avaliado", preço, desconto, promoção, sorteio, depoimento, "indique e ganhe". Evite usar o seu título profissional para dar autoridade ao convite `[DECISÃO DO DONO]`. A tabela abaixo é o que **omitir** por profissão, a partir das políticas atuais:

| Profissão | Omitir | Dizer, se perguntarem |
|---|---|---|
| Psicólogo | Qualquer fala sobre nota, ranking ou pagamento pelo app | "Na sua profissão a política prevê só assinatura e não mostra avaliação pública. Cobrança pelo app só depois de parecer jurídico." `[CONDICIONAL: depende de parecer]` |
| Nutricionista | Preço, promoção, sorteio | "O modelo de cobrança da sua profissão está em análise jurídica; hoje não há comissão." |
| Fisioterapeuta | Depoimento de paciente, comissão | "Hoje não há comissão. A política prevê só assinatura." |
| Educação física (CREF) | Comissão | "Hoje não há comissão. A regra do CREF será conferida antes de qualquer cobrança." |

### 6.8 Quando a pessoa diz não ou pede para parar

```text
Combinado, {nome}. Apaguei seu contato e não escrevo mais. Se mudar de ideia, o endereço é [SITE]. Obrigado pelo seu tempo!
```

Depois: apague a linha da planilha, mantenha só o número na aba "não contatar" (seção 13) e registre a data. Responda no mesmo dia útil `[critério sugerido]`.

### 6.9 Depois que a pessoa enviou o cadastro

```text
{nome}, vi que seu cadastro foi enviado. Agora eu analiso os documentos e te aviso se faltar algo ou se algum for recusado; o motivo aparece na tela Cadastro. Não tenho um prazo fixo para prometer.

Enquanto isso, você já pode preencher Serviços e Agenda. Pedidos e Cobranças só abrem depois da aprovação.

Um aviso: eu nunca peço dinheiro, nem senha, nem o código que chega por e-mail ou SMS. Documento só pelo app.
```

### 6.10 Documento recusado

Ao rejeitar no painel, o motivo é obrigatório e a pessoa o vê na tela. Escreva fatos que ela consiga corrigir: "A foto está cortada: envie o documento inteiro, com os quatro cantos visíveis." Não escreva dado pessoal do documento no motivo. Se precisar falar por WhatsApp, só avise que há motivo na tela Cadastro.

---

## 7. Triagem em 10 perguntas

Ligação ou chamada de vídeo de uns 10 minutos, **só** com quem respondeu e aceitou conversar.

**Abertura (30 segundos):** "Oi, {nome}, é {seu nome}, do WorkEasy. Combinamos esta conversa de uns 10 minutos. Vou anotar suas respostas numa planilha só minha, com nome, telefone, profissão e bairro, só para acompanhar seu cadastro. Você pode pedir para apagar quando quiser. Posso continuar?" Se a resposta for não, encerre e apague.

| # | Pergunta | O que você quer saber | Sinal de alerta | Campo da planilha |
|---|---|---|---|---|
| 1 | "O que você faz hoje e há quanto tempo?" | Ocupação e slug certos; escopo | Faz algo fora da política (gás, obra estrutural, ato de enfermagem) | `ocupacao_slug` |
| 2 | "Em quais bairros você atende e como se desloca?" | Bairros do piloto; o app só lista bairros da cidade de São Paulo | Atende só fora de São Paulo | `bairros` |
| 3 | "Hoje, como os clientes chegam até você e como você cobra? O que você faz quando um cliente reclama?" | Ponto de partida; organização; trato com cliente | Depende de um único empregador; relata conflito sem resolução | `observacao` |
| 4 | "Você atua com CPF ou tem MEI ou CNPJ?" | Passo de cadastro fiscal (CPF ou CNPJ). Os dois servem | Nenhum documento | `observacao` |
| 5 | "Só para registro: você tem 18 anos ou mais?" | Maioridade (a LC 150/2015, art. 1º, parágrafo único, veda o trabalho doméstico a menor de 18 anos [F8]) | Menor de 18 | `observacao` |
| 6 | "Quais destes você consegue fotografar hoje: documento com foto, selfie, CPF ou CNPJ, certidão de antecedentes, registro no conselho, certificado de curso?" (só os itens da política da ocupação) | Prontidão de documentos; quem precisa tirar a certidão | Recusa-se a enviar documento | `observacao` |
| 7 | "Você tem celular com internet e usa WhatsApp? Prefere fazer o cadastro sozinho ou com uma chamada comigo ao lado?" | Capacidade de usar o app; você acompanha **sem** operar a conta dela | Sem celular com internet | `observacao` |
| 8 | (só ocupações com trava: `diarista`, `cuidador-de-idosos`) "Você atende o mesmo cliente mais de 2 dias por semana na mesma casa?" | A trava de 2 dias por semana por cliente | Quer 3 dias ou mais com a mesma família pelo app | `observacao` |
| 9 | "O que você espera do WorkEasy?" Depois, diga em 3 frases o plano (seção 9) | Expectativas | Espera cliente garantido, renda fixa ou vínculo | `triagem_resultado` |
| 10 | "Quem mais presta serviço aqui no bairro e você confia? Posso te mandar uma mensagem que você repassa a essas pessoas?" | Indicação sem pegar telefone de terceiros | n/d | `indicacoes_geradas` |

**Fechamento:** repita o próximo passo ("você cria o cadastro em [SITE]/pro/cadastro, envia os documentos e eu analiso"), confirme que pode mandar o link por WhatsApp e que haverá **no máximo um lembrete**, e lembre que ela pode mandar parar a qualquer momento. Anote no mesmo dia: `encaixa`, `encaixa_depois` ou `nao_encaixa`, e o motivo (lista fechada, seção 13).

---

## 8. Onboarding: o que a pessoa faz, o que o banco exige, o que você faz

### 8.1 Etapas e telas reais

| # | Etapa | Tela ou rota | A pessoa faz | Regra do produto | Você faz | Planilha |
|---|---|---|---|---|---|---|
| 0 | Entrar | `/entrar` | Escolhe E-mail ou Celular, marca "Li e aceito os Termos de Uso e a Política de Privacidade", recebe e digita o código de 6 dígitos | Sem senha. O aceite grava os consentimentos `terms` e `privacy` (versão `2026-10-rascunho`). O SMS depende de provedor configurado; se não chegar, entra pelo e-mail | Nunca peça o código. Sugira o e-mail se o SMS falhar | n/d |
| 1 | Perfil | `/pro/cadastro`, "1. Seu perfil" | Nome de exibição (2 a 120 caracteres), endereço da página (botão "Verificar"; só minúsculas, números e hífens, até 80 caracteres), ocupação principal; se a política pede, número do registro e UF | Cria o prestador em **rascunho**. Endereço já usado dá `slug_taken`. Registro exigido sem número dá `registry_required` | Ajude a escolher nome e endereço, sem escolher por ela | `cadastro_criado_em` |
| 1b | Apresentação | mesmo cartão, "Dados da página" | Apresentação (até 2000 caracteres) e a caixa "Receber pedidos novos de clientes pelo WorkEasy" | Desmarcada, deixa de ver e responder pedidos novos | Explique a caixa | n/d |
| 2 | Bairros | "2. Bairros atendidos" | Marca os bairros de São Paulo | Sem bairro marcado, não recebe pedidos | Sugira os bairros-piloto, sem forçar | n/d |
| 3 | Documentos | "3. Documentos" | Envia um arquivo por item da política (foto JPG, PNG, WebP ou HEIC, ou PDF, até 10 MB). Para antecedentes, marca a autorização de uso da certidão | Cada passo da política precisa de documento. Mais de um arquivo por item é aceito. Só remove arquivo ainda não revisado. Arquivos ficam em espaço privado, visível só para a pessoa e para a equipe | Nunca receba documento por WhatsApp | n/d |
| 4 | Enviar para análise | "4. Enviar para análise" | Botão "Enviar para análise" | Só passa se todo passo da política tem documento enviado; senão `documents_missing` e a tela lista os que faltam | n/d | `enviado_analise_em` (onboarded) |
| 5 | Análise | `/admin/prestadores` e `/admin/prestadores/:id` (você) | Aguarda | Veja 8.3 | Veja 8.3 | `aprovado_em` |
| 6 | Serviços | `/pro/servicos` | Nome do serviço, descrição, preço, preço máximo opcional, unidade (só as da política), duração opcional | A unidade precisa estar na política da ocupação. Pode ser preenchido antes da aprovação | Ajude a escolher unidade | n/d |
| 7 | Agenda | `/pro/agenda`, "Horários da semana" | Dias e horários (horário de Brasília) e folgas | Cliente só marca dentro dos horários. Ocupações com trava mostram o aviso dos 2 dias | n/d | n/d |
| 8 | Pedidos | `/pro/pedidos` | Vê "Pedidos abertos" e envia proposta (preço, mensagem, validade opcional) | Exige prestador aprovado, ocupação aprovada e bairro atendido. Cada pedido aceita no máximo 3 propostas (padrão). Plano gratuito: 5 propostas novas por mês | Não crie pedido falso para "testar" com conta real | `primeira_proposta_em` |
| 9 | Recebimento | `/pro/assinatura`, "Recebimento dos clientes" | Dados para abrir a conta de recebimento no Asaas (nome, e-mail, CPF ou CNPJ, nascimento ou tipo de empresa, celular, renda ou faturamento mensal, endereço) | Só depois do portão 6. A tela diz que os dados são usados só para abrir essa conta | Explique antes por que pede renda | n/d |
| 10 | Pro (opcional) | `/pro/assinatura`, "Plano" | Assina o Pro com CPF ou CNPJ; escolhe forma de pagamento da assinatura | Teste de 30 dias, uma vez por conta; cancelar no teste mantém o Pro até o fim dele | Não empurre; só explique | `plano` |
| 11 | 1º serviço pago | `/atendimentos` e `/pro/cobrancas` | Atende e recebe | Pagamento `received` ou `confirmed` de atendimento de origem plataforma | n/d | `primeiro_servico_pago_em` |

### 8.2 Documentos por ocupação (política atual)

| Ocupação | Documento com foto e selfie | CPF ou CNPJ | Antecedentes | Registro | Curso |
|---|---|---|---|---|---|
| `diarista`, `cuidador-de-idosos`, `encanador`, `pintor`, `montador-de-moveis` | Sim | Sim | Sim | Não | Não |
| `eletricista-residencial-e-comercial` | Sim | Sim | Sim | Não | Sim |
| `psicologo` | Sim | Sim | Não | Sim | Não |
| `nutricionista`, `fisioterapeuta`, `personal-trainer` | Sim | Sim | Sim | Sim | Não |

Nomes que a tela usa: "Documento com foto e selfie", "CPF ou CNPJ (MEI, Simples ou empresa)", "Certidão de antecedentes criminais", "Registro no conselho ou órgão da profissão", "Certificado do curso exigido por norma".

### 8.3 Checklist do revisor (você, em `/admin/prestadores/:id`)

- [ ] **Ver arquivo** de cada documento (o endereço vale por 5 minutos; abra de novo se vencer). Não copie nem guarde fora do app.
- [ ] **Documento com foto e selfie:** legível, nome compatível com o cadastro, selfie corresponde ao documento `[critério sugerido]`.
- [ ] **CPF ou CNPJ:** comprovante legível, nome ou razão social compatível `[critério sugerido]`.
- [ ] **Antecedentes:** certidão legível, de quem se cadastra, dentro da idade máxima que você definir `[DECISÃO DO DONO]`. O app guarda `expires_at`, mas **nada preenche esse campo**; anote a validade por conta própria (seção 14). Na planilha, registre só "aceito" ou "recusado", nunca o conteúdo.
- [ ] **Registro profissional:** consulte o cadastro público do conselho (endereços na matriz por conselho, `[caminho a definir na integração]`). O botão "Confirmar registro" **exige escrever como você conferiu** (por exemplo, a data da consulta). Divergência de nome, número ou situação: "Rejeitar registro" (a ocupação sai da busca e deixa de receber pedidos).
- [ ] **Certificado de curso** (eletricista): legível, entidade e carga horária compatíveis com o que a política exige `[critério sugerido]`.
- [ ] **Aceitar documento** (observação opcional) ou **Rejeitar documento** (motivo obrigatório, visível à pessoa).
- [ ] **Aprovar prestador.** Na primeira aprovação, o banco já aprova as ocupações que cumprem a regra (documento aceito em cada passo e registro não rejeitado) e registra no histórico quais. As demais você aprova uma a uma em **Aprovar ocupação**.
- [ ] **Atenção ao "Desfazer aceite":** o texto da tela diz que a ocupação continua aprovada, mas o banco retira a aprovação das ocupações que dependiam daquele documento (gatilho `provider_documents_revoke_approvals`, ARQUITETURA, seção Prestadores). Conte com a retirada (lacuna na seção 14).

### 8.4 Definições de "pronto"

| Nível | Quer dizer | Prova no produto |
|---|---|---|
| Enviado | Cadastro entregue | Situação "Em análise" |
| Aprovado | Conta liberada | Situação "Aprovado" |
| Aparece e recebe pedidos | Ocupação aprovada, ao menos 1 bairro, caixa "Receber pedidos novos" marcada | Pedidos abertos em `/pro/pedidos` |
| Agendável | Serviço ativo e horário definido | Botão "Agendar" na página `/p/<endereço>` |
| Pode cobrar | Pro ativo e recebimento ativo | `/pro/cobrancas` libera "Nova cobrança" |

### 8.5 Primeira semana depois de aprovado

- [ ] Abrir `/pro` e zerar "Pendências do cadastro".
- [ ] Cadastrar ao menos um serviço com preço e definir os horários.
- [ ] Abrir "Ver minha página" e ler como um cliente leria.
- [ ] Abrir Pedidos. Se houver pedido compatível, enviar a primeira proposta (o telefone do cliente só aparece se ele a escolher).
- [ ] Se não houver pedido, **dizer a verdade**: o que existe é a ferramenta (agenda, orçamento, clientes próprios). Não invente pedido.
- [ ] Opcional, só depois do portão 6: Pro e recebimento.

---

## 9. Folha "o que você recebe e quanto custa"

Envie a quem pedir por escrito. Confira os valores em `/pro/assinatura` antes (preço, dias de teste e limite de propostas são configurações da plataforma). Enquanto o portão 6 estiver pendente, apague a seção "Plano Pro", a linha "Pro" de "Quanto custa" e a de tarifas do Asaas; depois que for cumprido, apague só a marca `[PLANEJADO...]`. Não adicione promessa.

```text
WORKEASY PARA PROFISSIONAIS AUTÔNOMOS
O que você recebe e quanto custa · versão de {data} · confira os valores na tela Assinatura do app

O QUE É
Aplicativo (funciona no navegador do celular) para quem trabalha por conta própria organizar serviços, agenda, orçamentos e clientes, e responder a pedidos de clientes do bairro. Está no começo: {ESTADO}

O QUE VOCÊ TEM NO CADASTRO GRATUITO
• Página própria com seu nome, profissão, serviços, horários e bairros. Ela só fica pública depois que a equipe aprova o cadastro.
• Pedidos de clientes dos bairros que você marcar, nas ocupações aprovadas no seu cadastro. Você vê o pedido (sem o telefone do cliente) e envia sua proposta. Se o cliente escolher, o atendimento entra na sua agenda.
• Agenda com horários, folgas e atendimentos com clientes seus.
• Orçamento por link: o cliente aceita ou recusa pelo celular. O orçamento do app não substitui nota fiscal.
• Cadastro dos seus clientes.
• Até 5 propostas novas por mês nos pedidos da plataforma.

PLANO PRO (OPCIONAL): R$ 49,00 POR MÊS
• Propostas sem limite nos pedidos da plataforma.
• Cobrança dos seus clientes por Pix, boleto e cartão, em uma conta de recebimento no Asaas aberta em seu nome. [PLANEJADO até o teste real de cobrança; o cartão é pago na página do Asaas: o app nunca recebe dados de cartão]
• 30 dias de teste na primeira assinatura, uma vez por conta. Cancelando antes do fim do teste, você não paga. Cancelando depois, mantém o Pro até o fim do período já pago.

QUANTO CUSTA
• Cadastro: R$ 0. Plano gratuito: R$ 0. Pro: R$ 49,00 por mês.
• Comissão sobre seus serviços: hoje não existe. Se um dia for ligada, a regra prevista é de 12% só sobre o primeiro serviço com um cliente novo trazido pelo WorkEasy, com teto de R$ 150,00, e não nas profissões em que o conselho veda. [CONDICIONAL: depende de parecer] Só valerá como estiver escrito nos Termos do Prestador.
• Tarifas do Asaas: quem recebe pelo Asaas paga as tarifas dele por cobrança recebida; o WorkEasy não soma taxa própria às cobranças de clientes seus. Veja a tabela atual do Asaas.
• Impostos e nota fiscal: o app não emite nota fiscal dos seus serviços. O que isso significa para os seus impostos, os Termos do Prestador (em elaboração) vão explicar.

O QUE NÃO PROMETEMOS
Quantidade de clientes ou de pedidos · posição na busca · avaliações · ganho mensal · prazo para aprovar o cadastro.
Valores e limites são configurações da plataforma e podem mudar; o que valer estará nos Termos do Prestador.

O QUE PEDIMOS
Documento com foto e selfie e CPF ou CNPJ; e, conforme a sua ocupação, certidão de antecedentes criminais, registro no seu conselho ou certificado de curso. Os arquivos ficam em um espaço privado do app, visível só para você e para a equipe que analisa o cadastro.
Se a sua profissão tem conselho, a divulgação que você faz continua sujeita às regras dele.

SEUS DADOS
Você pode excluir a conta no app (Minha conta). Seus dados pessoais são apagados; pagamentos e atendimentos já realizados continuam registrados de forma anonimizada, porque a lei fiscal obriga a guardar esses registros.

[RAZÃO SOCIAL] · CNPJ [CNPJ] · [E-MAIL DO SAC] · [WHATSAPP DA OPERAÇÃO] · [SITE]
```

**De onde cada linha vem (para você conferir):** página própria `/p/<endereço>` (`pages/publico/PaginaPrestador.tsx`); pedidos sem contato do cliente (`pages/pro/Pedidos.tsx`); 5 propostas por mês (`free_proposals_per_month`, migration 12, DECISOES D4); Pro a R$ 49,00 e teste de 30 dias, uma vez por conta (`pro_price_cents`, `pro_trial_days`, DECISOES D2 e D3, `pages/pro/Assinatura.tsx`); "sem taxa do WorkEasy" nas cobranças de clientes próprios (texto de `pages/pro/Assinatura.tsx`; só plano Pro: `charges-create`); orçamento que não substitui nota fiscal (`components/pro/QuoteDocument.tsx`); texto de exclusão de conta (`pages/conta/Conta.tsx`; a frase sobre a lei fiscal é a da tela, e DECISOES D7 pede conferir o prazo de guarda com o contador `[incerto]`).

**Tarifas do Asaas (página aberta em 23/10/2026) [F16]:** a página lista, por cobrança recebida, dois valores para Pix e para boleto, R$ 1,99 e R$ 0,99, com a observação "Válido por 3 meses" (as perguntas frequentes falam de taxa promocional de 3 meses para contas novas); para cartão de crédito à vista, R$ 0,49 + 2,99% e R$ 0,49 + 1,99%; diz que "no Asaas, não há mensalidade ou taxa de adesão" e que "as taxas apresentadas são padrão". `[incerto]`: o texto da página não deixa claro qual coluna é a padrão em cada linha, nem se as subcontas dos prestadores têm as mesmas condições da conta raiz (depende do contrato do WorkEasy com o Asaas; ver o documento I01). **Não imprima esses números para o prestador** até confirmá-los na sua conta Asaas (menu do usuário, "Taxas").

---

## 10. Objeções

Respostas curtas, para falar ou escrever. Se a resposta depende de documento ainda em elaboração (Termos, Política), diga isso.

| Objeção | O que costuma estar por trás | Resposta | Não diga |
|---|---|---|---|
| "Já tenho clientes pelo WhatsApp." | Medo de perder o que funciona | "Ótimo, não precisa mudar. O WorkEasy não tira seus clientes do WhatsApp. Você pode cadastrar seus clientes, marcar horário na agenda e mandar orçamento por link. Se quiser, também vê pedidos de clientes novos do bairro. Usa só o que ajudar." | "O WhatsApp é bagunça." "Você perde cliente sem o app." |
| "Por que eu pagaria?" | Desconfiança de taxa escondida | "Cadastro e plano gratuito não custam nada. O Pro é opcional, R$ 49,00 por mês (confira na tela), e só faz diferença se você quiser mandar mais de 5 propostas novas por mês nos pedidos da plataforma ou cobrar seus clientes por Pix, boleto ou cartão pelo app. Tem 30 dias de teste; se cancelar antes do fim, não paga." (cobrança: `[PLANEJADO]` até o portão 6) | "Se paga sozinho." "Você vai ganhar mais." |
| "É uma empresa que depois me manda embora? Vou ser empregado?" | Medo de vínculo e de perder o trabalho | "Não é emprego. Você define seus preços, seus horários e quais pedidos responde, e pode desmarcar a caixa de receber pedidos novos quando quiser. O sistema não aplica multa por você não responder a um pedido. Os Termos do Prestador, ainda em elaboração, vão dizer isso por escrito." Para cuidadores: "As ofertas de plantão você aceita ou recusa uma a uma." | "Não existe vínculo nenhum" (isso é conclusão jurídica). "Você é seu próprio patrão." |
| "Quanto vocês ficam de cada serviço?" | Medo de comissão | "Hoje o WorkEasy não cobra comissão. Se um dia ela for ligada, a regra prevista é de 12%, só sobre o primeiro serviço com um cliente novo trazido pelo WorkEasy, com teto de R$ 150,00, e não nas profissões em que o conselho veda. Isso depende de parecer jurídico e só valeria como estiver escrito nos Termos." `[CONDICIONAL: depende de parecer]` | "Nunca vamos cobrar comissão." "Sempre vai ser de graça." |
| "Quantos clientes eu vou ter?" | Quer previsão | "Não sei dizer e não prometo. Estamos começando em {bairros}. Cada pedido aceita no máximo 3 propostas (hoje), e o limite vale por ordem de envio. O que existe com certeza é a ferramenta." | Número de pedidos, de clientes ou de ganho. "Você vai aparecer em primeiro." |
| "Vou ser avisado quando tiver pedido novo?" | Quer não perder pedido | "Hoje o app não manda aviso de pedido novo por WhatsApp nem e-mail: você vê na tela Pedidos e no Painel. Os avisos que existem são de atendimento confirmado, lembrete, pagamento recebido, orçamento respondido e plantão oferecido, e ainda não estão ligados em produção: dependem de configurar o WhatsApp Business e o e-mail." | "Você recebe tudo no WhatsApp." |
| "Por que pedem documento, selfie e antecedentes?" | Receio com os dados | "É o que a política da sua ocupação pede, principalmente para quem entra na casa do cliente. Os arquivos ficam em um espaço privado, visível só para você e para a equipe que analisa. A certidão só é usada com a sua autorização, que você pode retirar em Minha conta. Eu não peço documento por WhatsApp." | "É 100% protegido." Qualquer promessa de proteção além do texto da tela |
| "Não tenho MEI nem CNPJ." | Medo de burocracia | "Você pode se cadastrar com CPF; o item é 'CPF ou CNPJ'. O app não emite nota fiscal dos seus serviços, e o que isso significa para os seus impostos os Termos do Prestador, ainda em elaboração, vão explicar. Se quiser se formalizar, o CATe da Prefeitura orienta sobre MEI." [F15] | Orientação tributária |
| "Tenho medo de golpe. Nunca ouvi falar de vocês." | Desconfiança legítima | "Faz sentido. Somos novos e não tenho histórico para mostrar. Cadastro é gratuito, eu nunca peço dinheiro, nem senha, nem o código que chega por e-mail ou SMS, e a empresa é [RAZÃO SOCIAL], CNPJ [CNPJ]. Você pode começar no plano gratuito e sair quando quiser." | Depoimento, número de profissionais ou parceria que não existe |
| "Quanto tempo leva para aprovar?" | Ansiedade | "Eu analiso cada cadastro pessoalmente e não tenho um prazo fixo para prometer. Se faltar algo, o motivo aparece na tela Cadastro." | Qualquer prazo |
| "E se um cliente me avaliar mal?" | Medo de nota | "Só quem contratou e pagou pelo app pode avaliar. Em algumas profissões, por regra do conselho, a avaliação nem aparece publicamente. Existe moderação." | "Nota não pesa." "Vou apagar avaliação ruim." |
| "Sou psicólogo(a) ou nutricionista. Posso anunciar aí?" | Medo do conselho | "A sua divulgação segue o código do seu conselho, e essa responsabilidade é sua. Confira com o conselho antes de publicar. Hoje o app pede um preço no serviço e o mostra na página; para a sua profissão isso é uma decisão ainda em aberto." | "Está tudo de acordo com o conselho." |
| "Não sei mexer em aplicativo." | Receio de errar | "A gente faz juntos por chamada. Você mesmo(a) digita, aceita os termos e envia os documentos; eu só oriento. Não preciso do seu código nem da sua senha." | Entrar na conta da pessoa |
| "Posso atender 5 dias por semana na mesma casa?" (diarista, cuidador) | Quer renda fixa | "Por aqui, não. O app não deixa marcar mais de 2 dias diferentes na mesma semana com o mesmo cliente, porque a lei pode tratar mais de 2 dias por semana na mesma casa como emprego doméstico (LC 150/2015)." [F8] | "Dá para driblar." |
| "Posso fazer o teste grátis de novo?" | Quer repetir | "O teste é um por conta. Quem já teve assinatura, mesmo cancelada, não recebe outro." | n/d |

---

## 11. Pedido de indicação

**Quando pedir:** depois que a pessoa foi aprovada, ou depois da primeira proposta enviada. Nunca antes de ela ver o produto funcionar.

**Regras:** peça que ela repasse **o seu contato** ou o material; não peça o telefone de ninguém. Quem escreve primeiro é o indicado. Sem recompensa por padrão `[DECISÃO DO DONO]`: o produto não tem crédito, desconto nem bônus de indicação, e dar benefício por indicação a profissional de saúde regulamentado esbarra em regras de conselho (seção 12.5) `[CONDICIONAL: depende de parecer]`.

```text
{nome}, obrigado por ter entrado. Posso te pedir um favor? Se você conhece 1 ou 2 profissionais de confiança aqui no bairro (de qualquer ocupação) que possam querer conhecer o WorkEasy, pode mandar a mensagem abaixo para eles. Não preciso do telefone de ninguém: quem tiver interesse me escreve primeiro.

Mensagem para encaminhar:
"Oi! Conheci o WorkEasy, um aplicativo para profissional autônomo organizar agenda, orçamento e clientes. O cadastro é gratuito (tem um plano Pro opcional), eles não prometem cliente e pedem documentos no cadastro. Se quiser saber mais, escreve para eles: {link wa.me}"
```

Variante para cuidadores (confiança): "Se você conhece colegas cuidadores de confiança, pode dizer que existe um cadastro individual; eu converso com cada um separadamente." Não mencione plantão nem valor.

Variante para profissional regulamentado: peça apenas que ele **comente com colegas** que existe a ferramenta. Não peça que indique pacientes nem que divulgue o WorkEasy a pacientes.

---

## 12. Conformidade

> **Rascunho para revisão de advogado. Não é parecer jurídico.** Cada afirmação abaixo vem de fonte aberta em 23/10/2026 (seção 15). O que não consegui abrir está marcado `[incerto]`.

### 12.1 Contato com quem não é cliente: LGPD

- A LGPD só permite tratar dados pessoais em hipóteses listadas. Aqui entram: consentimento (art. 7, I); procedimentos preliminares **a pedido do titular** (art. 7, V); interesse legítimo (art. 7, IX) [F1].
- **Consentimento** deve se referir a finalidades determinadas (as autorizações genéricas são nulas, art. 8, § 4º), pode ser revogado a qualquer momento por procedimento gratuito e facilitado (art. 8, § 5º), e o ônus de provar que foi obtido é seu (art. 8, § 2º) [F1]. Por isso a planilha registra quando e como a pessoa pediu ou autorizou.
- **Informação ao titular (art. 9):** finalidade específica, forma e duração do tratamento, identificação e contato do controlador, uso compartilhado, responsabilidades e direitos [F1]. É o que o texto 6.1 resume.
- **Interesse legítimo (art. 10):** serve para "apoio e promoção de atividades do controlador", só com os dados estritamente necessários e com transparência (§§ 1º e 2º) [F1]. O guia da ANPD (v1.0, fev/2024) diz que o teste de balanceamento é "uma boa prática e medida recomendável"; lista fatores de legítima expectativa (relação prévia; fonte dos dados: diretamente do titular, fonte pública ou compartilhamento de terceiros); traz como exemplo (Exemplo 5) mensagens promocionais com mecanismo de descadastramento; pede canal fácil para descadastrar e opor-se; e afirma que essa hipótese **não se aplica a dados sensíveis** [F2].
- **Dados de acesso público:** o tratamento deve considerar a finalidade, a boa-fé e o interesse público que justificaram a disponibilização (art. 7, § 3º); a dispensa de consentimento para dados manifestamente públicos preserva direitos e princípios (§ 4º) e não desobriga as demais obrigações (§ 6º) [F1].
- **Oposição:** o titular pode opor-se ao tratamento feito sem consentimento "em caso de descumprimento ao disposto nesta Lei" (art. 18, § 2º) [F1]. Na prática, trate qualquer "pare" como pedido a cumprir.
- **Lista de contatos de WhatsApp:** a primeira sanção da ANPD (jul/2023) foi contra uma empresa que oferecia uma listagem de contatos de WhatsApp; a ANPD constatou tratamento "sem respaldo legal" e aplicou multa por inexistência de hipótese legal (art. 7) [F3]. Por isso: nada de lista comprada, raspada ou exportada de grupo.
- **Lei específica de mensagem comercial não solicitada:** não encontrei, nas fontes que abri, norma brasileira específica sobre mensagem comercial não solicitada por WhatsApp ou e-mail. `[incerto]`: o advogado deve confirmar se há norma setorial ou estadual aplicável.

### 12.2 Teste de balanceamento em 6 linhas (só para contato profissional público)

Modelo simplificado, inspirado nas partes do modelo da ANPD [F2]; não substitui o modelo completo. Guarde uma cópia por canal, não por pessoa.

1. **Interesse e finalidade:** convidar profissionais autônomos a conhecer uma ferramenta de agenda e cadastro (apoio e promoção da atividade da empresa, art. 10, I).
2. **Necessidade:** dados usados: nome, canal de contato público e ocupação. Nada além.
3. **Legítima expectativa:** a pessoa divulgou o contato **para contato profissional**? Há relação prévia? De onde veio o dado (direto, público, terceiro)?
4. **Riscos:** o convite é intrusivo? Pode causar dano? (Um único convite, em canal profissional, sem insistência.)
5. **Salvaguardas:** quem sou, de onde veio o contato, como parar, canal de oposição, apagar no primeiro "não".
6. **Conclusão:** pode ou não contatar. Se alguma resposta for "não sei", não contate.

### 12.3 Regras do WhatsApp (plataforma)

- Política de mensagens do WhatsApp Business (página com "Last updated: September 23, 2026"): só se pode contatar quem deu o número e deu permissão para receber mensagens seguintes; é preciso respeitar qualquer pedido, dentro ou fora do WhatsApp, de bloquear, interromper ou sair; fora da janela de 24 horas só se envia por modelos aprovados; quem usa o serviço de forma não autorizada para mensagens em escala pode ter o acesso limitado ou removido [F4].
- Termos de Serviço do WhatsApp (vigência "January 4, 2021" na página): proíbem comunicações ilegais ou não permitidas, como mensagens em massa, mensagens automáticas e discagem automática, e uso não pessoal sem autorização [F5].
- Diretrizes de mensagens (atualizadas em "September 23, 2026"): tratam como comportamento adversarial o uso de clientes não oficiais, mensagens em massa e automação para prejudicar o WhatsApp ou usuários; incluem "contato repetido indesejado"; as medidas vão de aviso a suspensão da conta [F6].
- **Prática:** use o app WhatsApp Business no número da operação; escreva e grave você mesmo; uma conversa por vez; sem programa de disparo; sem adicionar pessoas a grupos; no máximo um lembrete. Não consegui abrir as páginas de ajuda sobre listas de transmissão e sobre o link de conversa direta (`wa.me`); o formato do link usado neste documento é o do próprio app (`pages/cliente/concierge.ts`) `[incerto]`.
- Se o mesmo número vai ao mesmo tempo no app WhatsApp Business e na API de notificações, isso depende de regra do WhatsApp que não conferi `[incerto]`. O documento O05 recomenda, enquanto a regra não for lida, usar um número separado para o concierge; siga essa linha também para o recrutamento (ver O05 e I02).

### 12.4 Cancelar, apagar, lista de não contatar

- Ao receber "SAIR", "pare" ou equivalente: responda uma vez (6.8), apague a linha e mantenha **só** o número e a data do pedido numa aba "não contatar", para não escrever de novo por engano. `[incerto]`: confirmar com o advogado se essa lista mínima é adequada.
- Depois que a pessoa tem conta, promoções por WhatsApp ou e-mail dependem do consentimento "Comunicações de novidades" (em Minha conta); mensagens sobre os pedidos dela não dependem dele (texto de `pages/conta/Conta.tsx`).

### 12.5 Limites de divulgação dos conselhos (amostra de três códigos)

O que vale para o profissional vale para o seu texto: se o WorkEasy convida ou ajuda o profissional a divulgar algo que o código dele veda, o risco é compartilhado. Amostra dos três códigos abertos (a matriz por conselho da Frente A, `[caminho a definir na integração]`, é a referência para os demais):

| Tema | Nutrição (Res. CFN 599/2018) [F9] | Psicologia (Res. CFP 010/2005) [F10] | Fisioterapia (Res. COFFITO 424/2013) [F11] |
|---|---|---|---|
| Preço e promoção como propaganda | Art. 57: vedado usar o valor de honorários, promoções e sorteios como forma de publicidade | Art. 20, d: não utilizará o preço do serviço como forma de propaganda | Art. 40, I: proibido afixar valor de honorários fora do local da assistência ou promover sua divulgação de forma incompatível com a dignidade da profissão |
| Promessa de resultado | Art. 56: vedado alegar exclusividade ou garantia dos resultados | Art. 20, e: não fará previsão taxativa de resultados | Art. 46: vedada a promessa de resultado infalível |
| Comissão ou vantagem por encaminhamento; intermediação | Art. 49: vedado receber comissão, remuneração, gratificação ou benefício que não corresponda a serviços prestados | Art. 2º, o: vedado pleitear ou receber comissões e vantagens além dos honorários, **assim como intermediar transações financeiras**; p: vedado receber ou pagar remuneração ou porcentagem por encaminhamento de serviços | Art. 40, III: proibido obter vantagem pelo encaminhamento de procedimentos |
| Depoimento de paciente | Art. 58: vedado divulgar imagem corporal atribuindo resultados, mesmo com autorização | n/d na amostra | Art. 10, V: vedado divulgar, para autopromoção, declaração, imagem, áudio ou carta de agradecimento de paciente, salvo autorização expressa (redação da Res. COFFITO 532/2021) |
| Identificação | n/d na amostra | Art. 20, a: informar nome completo, CRP e número | Art. 48: nome, profissão e número de inscrição no Conselho Regional |

**O que isso muda para o recrutamento:**

1. Nenhum texto de recrutamento a esses profissionais traz preço, desconto, promoção, sorteio, "mais pacientes", garantia ou depoimento (seção 6.7).
2. Sem bônus por indicação a profissionais de saúde regulamentados `[CONDICIONAL: depende de parecer]`.
3. Não ofereça "cobrar pacientes pelo app" a psicólogos antes do parecer: o art. 2º, o, do código veda "intermediar transações financeiras", e hoje o app **não** consulta o modelo de cobrança da política ao criar cobranças (seção 14).
4. A página pública do WorkEasy mostra preço de serviço para todas as ocupações; o art. 57 do CFN, o art. 20, d, do CFP e o art. 40, I, do COFFITO restringem o uso do valor na divulgação. Decisão pendente (seção 14).
5. O texto do CFN consultado indica alterações de 2020 e 2021; confira as versões vigentes `[incerto]`.

### 12.6 A divulgação do próprio WorkEasy (CDC, arts. 36 e 37)

O art. 36 do CDC exige que a publicidade seja identificável como tal. O art. 37 proíbe a publicidade enganosa, entendida como a "inteira ou parcialmente falsa" ou que, "mesmo por omissão", induza a erro sobre natureza, características, qualidade, preço e outros dados, e o § 3º a define como enganosa por omissão quando deixa de informar "dado essencial do produto ou serviço" [F7]. Aplicação prática: diga que não é vaga de emprego, que não há garantia de clientes, quais são os limites do plano gratuito, o preço do Pro e que a comissão é uma possibilidade condicional. `[incerto]`: se o CDC alcança a relação com o prestador (ele contrata um serviço de plataforma), é ponto para o documento L02; trate a regra como piso.

### 12.7 Depoimentos, números e marcas de terceiros

- **Hoje não existe depoimento real nem número de prestadores para citar.** Nada de nomes inventados, fotos de banco de imagens como se fossem profissionais, "mais de N profissionais", nem prints de conversa fabricados.
- Quando existir depoimento real: autorização **por escrito** da pessoa, para aquele texto e aquele uso; para profissões reguladas, confira antes o código do conselho (por exemplo, COFFITO, art. 10, V) [F11].
- Número de prestadores: só o que o painel do admin mostra no dia, com a data.
- Senac, SENAI, Sebrae, CATe, Prefeitura, conselhos: não use nome nem logotipo, nem diga "parceiro", "apoiado por" ou "aprovado por" sem autorização escrita `[CONDICIONAL: depende de parecer]`.

### 12.8 Os dados da planilha

- Mínimo necessário: id, nome, WhatsApp, ocupação, bairros, datas e estágio. Nunca registre conteúdo de documento, resultado de certidão, saúde, motivo de saúde ou qualquer dado sensível (art. 5, II) [F1].
- Acesso só seu; sem link compartilhado; sem anexar documentos; sem enviar para ferramenta de terceiros antes de contrato `[incerto: operadores e transferência internacional, ponto para o advogado]`.
- Prazo de guarda: quem ficou sem interação por {N} meses é apagado `[DECISÃO DO DONO]` (não conferi prazo legal).
- Quem pedir acesso, correção ou eliminação (art. 18) [F1]: responda pelo mesmo canal e por [E-MAIL DO ENCARREGADO].

### 12.9 Separação da Pulso Vital

Não use pacientes, funcionários ou fornecedores da clínica para recrutar: o dado foi coletado para outra finalidade e outro controlador (LGPD, art. 6, I e II, finalidade e adequação [F1]). Colegas que você conhece **pessoalmente** podem ser convidados como qualquer outro contato. Não pressione ninguém que dependa de você: o guia da ANPD lembra que, em relação de emprego, a pessoa está em posição de maior vulnerabilidade e sem meios efetivos de oposição [F2].

### 12.10 Linguagem sobre autonomia

Descreva o que o app faz (a pessoa define preço, horário e quais pedidos responde; pode desmarcar o recebimento de pedidos; o sistema não aplica multa por não responder). **Não** conclua "não há vínculo": isso é conclusão jurídica e depende dos fatos. A trava de 2 dias por semana por cliente existe por causa do art. 1º da LC 150/2015 [F8]. Alinhe o discurso com os Termos do Prestador (documento L02).

---

## 13. Planilha de acompanhamento

Colunas com ★ são o mínimo. Datas no formato AAAA-MM-DD. Uma linha por pessoa. Aba separada "nao_contatar" só com o número e a data do pedido.

### 13.1 Colunas

| # | Campo | Valores | Para quê | Prova ou onde conferir |
|---|---|---|---|---|
| 1 ★ | `id` | R-001, R-002... | Chave sem dado pessoal | n/d |
| 2 ★ | `nome` | Como a pessoa pediu para ser chamada | Atendimento | n/d |
| 3 ★ | `whatsapp` | Só dígitos com DDI | Contato (acesso restrito) | n/d |
| 4 ★ | `ocupacao_slug` | Slug do catálogo | Política aplicável | `catalog/policies.json` |
| 5 | `categoria` | limpeza, reparos, cuidado, liberal | Cortes do funil | n/d |
| 6 | `bairros` | Texto curto | Cobertura do piloto | Passo "2. Bairros atendidos" |
| 7 ★ | `canal_origem` | indicacao, qr_cartaz, grupo_bairro, escola, cate_sebrae, colega, perfil_publico, outro | Custo e conversão por canal | n/d |
| 8 | `indicado_por_id` | `id` de quem indicou | Cadeia de indicação | n/d |
| 9 ★ | `como_obtive` | Frase curta e verdadeira | Prova da base | n/d |
| 10 ★ | `base_contato` | pediu, deu_numero_e_autorizou, publico_profissional | Base (seção 5) | n/d |
| 11 ★ | `data_base` | Data do pedido ou da autorização | Ônus da prova (LGPD, art. 8, § 2º) | Conversa arquivada |
| 12 | `teste_balanceamento` | sim, nao, n.a. | Só para `publico_profissional` | Cópia do modelo da seção 12.2 |
| 13 ★ | `contatado_em` | Data | Etapa 1 | n/d |
| 14 ★ | `respondeu_em` | Data | Etapa 2 | n/d |
| 15 ★ | `triagem_em` e `triagem_resultado` | encaixa, encaixa_depois, nao_encaixa | Etapa 3 | Seção 7 |
| 16 | `cadastro_criado_em` | Data | Pessoa criou o prestador | "Cadastro em" no detalhe do admin |
| 17 ★ | `enviado_analise_em` | Data | **Onboarded** | Situação "Em análise" |
| 18 ★ | `aprovado_em` | Data | **Aprovado** | Situação "Aprovado" |
| 19 | `ocupacao_aprovada_em` | Data | Aparece e recebe pedidos | "Aprovar ocupação" |
| 20 ★ | `primeira_proposta_em` | Data | **1ª proposta** | Lista "Propostas enviadas" em `/pro/pedidos` |
| 21 ★ | `primeiro_servico_pago_em` | Data | **1º serviço pago pelo app** | Pagamento `received` ou `confirmed` de atendimento de origem plataforma |
| 22 | `primeira_cobranca_propria_em` | Data | Uso do Pro com cliente próprio | `/pro/cobrancas` |
| 23 | `plano` | gratis, teste, pro | Receita | `/pro/assinatura` |
| 24 ★ | `estagio_atual` | contatado, respondeu, triagem, onboarded, aprovado, primeira_proposta, primeiro_pago, perdido, nao_contatar | Funil | n/d |
| 25 | `proximo_passo` e `proximo_contato_em` | Texto e data | Rotina | n/d |
| 26 ★ | `lembrete_enviado_em` | Data | Limite de 1 lembrete | n/d |
| 27 ★ | `perdido_motivo` | sem_interesse, sem_documentos, nao_encaixa, sem_tempo, desconfianca, fora_da_area, outro | Aprender onde perde | n/d |
| 28 ★ | `pediu_para_parar_em` | Data | Opt-out | Ao preencher, apague os campos pessoais e mova o número para "nao_contatar" |
| 29 | `indicacoes_geradas` | Número | Efeito do pedido de indicação | n/d |
| 30 | `observacao` | Texto curto, sem dado sensível | Contexto | n/d |

### 13.2 Cabeçalho para colar (separador `;`, abre direto no Excel em português)

```csv
id;nome;whatsapp;ocupacao_slug;categoria;bairros;canal_origem;indicado_por_id;como_obtive;base_contato;data_base;teste_balanceamento;contatado_em;respondeu_em;triagem_em;triagem_resultado;cadastro_criado_em;enviado_analise_em;aprovado_em;ocupacao_aprovada_em;primeira_proposta_em;primeiro_servico_pago_em;primeira_cobranca_propria_em;plano;estagio_atual;proximo_passo;proximo_contato_em;lembrete_enviado_em;perdido_motivo;pediu_para_parar_em;indicacoes_geradas;observacao
```

### 13.3 Revisão semanal

| Semana | Contatados | Responderam | Triagens | Enviaram para análise | Aprovados | 1ª proposta | 1º pago |
|---|---|---|---|---|---|---|---|
| (por canal e por categoria) | | | | | | | |

- **Taxas por etapa:** resposta = respondeu ÷ contatado; triagem = triagem ÷ respondeu; envio = enviou para análise ÷ triagem; aprovação = aprovado ÷ enviou; proposta = 1ª proposta ÷ aprovado; pago = 1º pago ÷ aprovado.
- **Contatos necessários** = meta de aprovados ÷ (taxa de resposta × taxa de envio × taxa de aprovação). Use as **suas** taxas depois dos primeiros 20 contatos por canal; não use taxa de mercado.
- **Regra de DECISOES seção 7 (30 dias):** se menos de 30% dos aprovados enviaram proposta, o problema é demanda ou onboarding, não preço. Olhe também o tempo entre etapas e onde as pessoas se perdem.
- **Qualidade antes de volume:** não acelere a análise para bater número; recuse documento ilegível com motivo claro.

---

## 14. Pontos para o advogado e lacunas

### 14.1 Perguntas

1. Base e forma do primeiro contato (art. 7, V, I e IX; art. 10): o fluxo da seção 5 está adequado? O teste de balanceamento da seção 12.2 basta para contato profissional público?
2. A lista mínima de não contatar (número e data) é adequada para impedir novo contato?
3. Enquanto a pessoa jurídica não existe, quem é o controlador dos dados do funil? (Portão 3: não recrutar em nome pessoal.)
4. Bônus por indicação: permitido para profissões não regulamentadas? Para saúde regulamentada, há vedação (CFN art. 49; CFP art. 2º, o e p; COFFITO art. 40, III)?
5. Preço na página pública para profissões em que o conselho restringe o uso de valor na divulgação (CFN art. 57; CFP art. 20, d; COFFITO art. 40, I): ocultar, mostrar "sob consulta" ou deixar ao profissional?
6. Cobrança pelo app (pagamento do cliente pela plataforma e `charges-create` do Pro) para profissões `so_assinatura`: o art. 2º, o, do código do psicólogo ("intermediar transações financeiras") alcança esse fluxo?
7. Uso do nome de escolas e órgãos (Senac, SENAI, Sebrae, CATe): o que se pode dizer sem autorização?
8. Linguagem sobre autonomia nos convites, alinhada ao documento L02.
9. Prazo de guarda da planilha de recrutamento.
10. Aplicabilidade do CDC (arts. 36 e 37) à comunicação com o prestador.
11. Anúncios em sites de vagas e a palavra "vaga".

### 14.2 Lacunas do produto que afetam o recrutamento (não corrigidas aqui)

1. `/register-provider` (demonstração, não guarda nada) é o destino de "Trabalhe Conosco" no rodapé (`AppShell.tsx`), do botão "Ofereço este serviço" (`pages/OccupationPage.tsx`) e do link em Minha conta (`pages/conta/Conta.tsx`). O caminho real é `/pro/cadastro`.
2. `/legal` mostra "Documentos em elaboração" enquanto o login pede "Li e aceito os Termos de Uso e a Política de Privacidade".
3. Nenhum gatilho avisa o prestador de **pedido novo**: só existem seis modelos de notificação (`proposta_recebida`, `atendimento_confirmado`, `lembrete_atendimento`, `pagamento_recebido`, `orcamento_respondido`, `plantao_oferecido`) e nenhum é para o prestador sobre pedido novo. O prestador precisa abrir `/pro/pedidos`.
4. `provider_documents.expires_at` existe e a tela do admin mostra "Validade informada", mas a tela de envio não preenche o campo e `admin_review_document` não recebe validade.
5. A página pública e o formulário de serviço sempre mostram e exigem preço, para qualquer ocupação.
6. `payments-create` e `charges-create` não consultam o modelo de cobrança da política: um psicólogo (`so_assinatura`) poderia receber pagamento pela plataforma ou cobrar pelo Pro.
7. O texto de "Desfazer aceite" (`components/admin/DocumentCard.tsx`) diz que a ocupação continua aprovada, mas o gatilho do banco retira a aprovação.
8. Não existe a ocupação `eletricista` no catálogo (é o slug da área); `cuidador-de-idosos` e as ocupações de eletricista estão `a_confirmar`.
9. `personal-trainer` aparece com comissão no primeiro serviço apesar de ser profissão com conselho; confira com a matriz do CREF.
10. Não há recurso de indicação, crédito, lista de espera nem origem do prestador no produto: tudo isso é manual (planilha).
11. Mesmo número de WhatsApp no app Business e na API: não conferi se coexistem.

### 14.3 O que não consegui conferir

- Páginas de ajuda do WhatsApp sobre listas de transmissão e conversa direta (`wa.me`): o conteúdo veio truncado.
- Texto vigente do código de ética do CONFEF (redirecionamento sem fim no endereço do catálogo). Sem ele, Educação Física ficou fora da tabela 12.5.
- Sebrae SP (cursos, pontos "Sebrae Aqui"): conteúdo carregado por script.
- Regras de Facebook, Instagram, Google e de sites de vagas.
- Tarifas do Asaas aplicadas às subcontas.
- Pesquisas adicionais na web foram interrompidas durante a tarefa porque o limite compartilhado de buscas acabou; as fontes abaixo foram abertas por endereço direto.

---

## 15. Fontes consultadas

Todas abertas em **2026-10-23**. "Citação" é trecho copiado da página; para as páginas do WhatsApp, os trechos vieram da ferramenta de leitura de páginas e devem ser reconferidos no original antes de entrar em contrato.

| ID | Fonte e endereço | O que li | Citação curta |
|---|---|---|---|
| F1 | Lei 13.709/2018 (LGPD), texto compilado, planalto.gov.br. `https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/L13709compilado.htm` | Arts. 5, 6, 7, 8, 9, 10 e 18 | Art. 7, V: "quando necessário para a execução de contrato ou de procedimentos preliminares relacionados a contrato do qual seja parte o titular, a pedido do titular dos dados". Art. 7, § 3º: "O tratamento de dados pessoais cujo acesso é público deve considerar a finalidade, a boa-fé e o interesse público que justificaram sua disponibilização." Art. 8, § 4º: "As autorizações genéricas para o tratamento de dados pessoais serão nulas." Art. 10, I: "apoio e promoção de atividades do controlador". Art. 18, § 2º: "O titular pode opor-se a tratamento realizado com fundamento em uma das hipóteses de dispensa de consentimento, em caso de descumprimento ao disposto nesta Lei." |
| F2 | ANPD, Guia Orientativo "Hipóteses legais de tratamento de dados pessoais: legítimo interesse", v1.0, fev/2024. `https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf` (arquivo em `.../guia_legitimo_interesse.pdf/@@download/file`) | Exemplo 5; seção sobre legítima expectativa; modelo de teste de balanceamento; limite para dados sensíveis | "O teste de balanceamento é, pois, uma boa prática e medida recomendável para demonstrar o atendimento dos requisitos para enquadramento no legítimo interesse." Exemplo 5: a instituição "prevê um mecanismo de descadastramento da lista de envios ao final dos e-mails". |
| F3 | ANPD, Comunicado à Imprensa sobre a primeira sanção (jul/2023). `https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aplica-a-primeira-multa-por-descumprimento-a-lgpd/comunicado-a-imprensa-jul-2023.pdf` | Caso Telekall Infoservice | "ofertando uma listagem de contatos de WhatsApp de eleitores"; "A ANPD verificou que o tratamento de dados pessoais denunciado estava ocorrendo sem respaldo legal." |
| F4 | WhatsApp Business Messaging Policy (a página `business.whatsapp.com/policy` redireciona para a abaixo). `https://whatsappbusiness.com/policy/` | Seção 1 (permissão), opt-out, janela de 24 horas, mensagens em escala; abrangência | "You may only contact people on WhatsApp if: (a) they have given you their mobile phone number or username; and (b)". "Outside the 24-hour customer service window, you may only send messages via approved Message Templates." Abrange "The WhatsApp Business App" e "The WhatsApp Business Platform". |
| F5 | WhatsApp, Terms of Service. `https://www.whatsapp.com/legal/terms-of-service` | Uso aceitável | "involve sending illegal or impermissible communications such as bulk messaging, auto-messaging, auto-dialing, and the like" |
| F6 | WhatsApp, Messaging Guidelines. `https://www.whatsapp.com/legal/messaging-guidelines` | Comportamento adversarial; spam; medidas | "use unofficial clients, bulk messaging, auto-messaging, auto-dialing, or automation to harm WhatsApp or our users"; "repeated unwanted contact with WhatsApp users" |
| F7 | Lei 8.078/1990 (CDC), compilado, planalto.gov.br. `https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm` | Arts. 36 e 37 | Art. 37, § 1º: "É enganosa qualquer modalidade de informação ou comunicação de caráter publicitário, inteira ou parcialmente falsa, ou, por qualquer outro modo, mesmo por omissão, capaz de induzir em erro o consumidor". § 3º: "enganosa por omissão quando deixar de informar sobre dado essencial do produto ou serviço". |
| F8 | Lei Complementar 150/2015, planalto.gov.br. `https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp150.htm` | Art. 1º e parágrafo único | "por mais de 2 (dois) dias por semana, aplica-se o disposto nesta Lei". Parágrafo único: "É vedada a contratação de menor de 18 (dezoito) anos para desempenho de trabalho doméstico". |
| F9 | Resolução CFN 599/2018 (Código de Ética e de Conduta do Nutricionista), cfn.org.br. `https://cfn.org.br/wp-content/uploads/resolucoes/Res_599_2018.html` | Arts. 49, 56, 57, 58 (a página registra alterações até 2021) | Art. 57: "É vedado ao nutricionista utilizar o valor de seus honorários, promoções e sorteios de procedimentos ou serviços como forma de publicidade e propaganda para si ou para seu local de trabalho." |
| F10 | Código de Ética Profissional do Psicólogo (Res. CFP 010/2005, edição ago/2005), site.cfp.org.br. `https://site.cfp.org.br/wp-content/uploads/2012/07/codigo-de-etica-psicologia.pdf` | Art. 2º, o e p; art. 20, a, d, e | Art. 2º, o: "assim como intermediar transações financeiras". p: "Receber, pagar remuneração ou porcentagem por encaminhamento de serviços". Art. 20, d: "Não utilizará o preço do serviço como forma de propaganda". |
| F11 | Resolução COFFITO 424/2013 (Código de Ética e Deontologia da Fisioterapia), texto com as alterações da Res. COFFITO 532/2021, coffito.gov.br. `https://www.coffito.gov.br/nsite/?p=3187` | Arts. 10 (V), 40 (I e III), 46, 48 | Art. 40, III: "obter vantagem pelo encaminhamento de procedimentos". Art. 46: "vedada a promessa de resultado infalível". Art. 48: devem constar "o nome do profissional, da profissão e o número de inscrição no Conselho Regional". |
| F12 | Senac SP, curso livre "Cuidador de Idoso". `https://www.sp.senac.br/cursos-livres/curso-de-cuidador-de-idoso` | Carga horária e requisitos | "160 horas"; "Você deve ter concluído o ensino fundamental 2 e ser maior de 18 anos." |
| F13 | Senac SP, "Anúncio de vagas". `https://www.sp.senac.br/anuncio-de-vagas` | Espaço para empresas; mural digital | "Espaço para sua empresa ou organização divulgar vagas de emprego para estudantes e ex-estudantes do Senac."; mural pelo e-mail centralsenac@sp.senac.br; "As vagas precisam ter relação com nossas áreas de atuação." |
| F14 | SENAI-SP, curso "Eletricista Instalador Predial". `https://www.sp.senai.br/curso/eletricista-instalador-predial/108288` | Carga horária e tipo | "Carga horária: 160 horas"; classificado como curso livre, "Qualificação Profissional" |
| F15 | CATe, Prefeitura de São Paulo. `https://cate.prefeitura.sp.gov.br/o-cate/` | Serviços e parcerias | "serviço da Secretaria de Desenvolvimento Econômico e Trabalho da Prefeitura de São Paulo"; serviços incluem "Formalização do Microempreendedor Individual (MEI)" e "Busca de vagas"; "Para ser parceiro de conteúdo da plataforma, envie um e-mail para portalcate@prefeitura.sp.gov.br" |
| F16 | Asaas, preços e taxas. `https://www.asaas.com/precos-e-taxas` | Tabela de tarifas e perguntas frequentes | "No Asaas, não há mensalidade ou taxa de adesão."; "As taxas apresentadas são padrão. Para conferir as condições aplicadas ao seu contrato, consulte-as diretamente na sua conta Asaas."; Pix e boleto: "R$ 1,99 R$ 0,99 por transação recebida (Válido por 3 meses)" |
| F17 | Sebrae, página sobre MEI. `https://www.sebrae.com.br/sites/PortalSebrae/mei` | Apenas a introdução (o resto carrega por script) | "Tudo que você precisa saber sobre o MEI, em um só lugar." |

Documentos do repositório usados: `apps/web/docs/DECISOES.md` (D2 a D7, D11, D12, seções 4, 5, 7 e 8), `apps/web/docs/ARQUITETURA.md`, `apps/web/README.md`, `apps/web/catalog/policies.json`.

---

## Apêndice A. Política atual das ocupações de lançamento

Valores do `catalog/policies.json` em 23/10/2026. "Nota pública" quer dizer `ratingRanking`: avaliações exibidas e ordem de busca por nota. A comissão está **desligada** em todas (`commission_enabled` falso).

| Ocupação | Confiança | Passos exigidos | Cobrança (política) | Nota pública | Trava de 2 dias | Locais | Unidades de preço |
|---|---|---|---|---|---|---|---|
| `diarista` | conferido | doc+selfie, CPF/CNPJ, antecedentes | comissão no 1º serviço (desligada) | sim | sim | domicílio | hora, dia, servico |
| `cuidador-de-idosos` | a confirmar | doc+selfie, CPF/CNPJ, antecedentes | comissão no 1º serviço (desligada) | sim | sim | domicílio | hora, dia, plantao |
| `encanador` | conferido | doc+selfie, CPF/CNPJ, antecedentes | comissão no 1º serviço (desligada) | sim | não | domicílio, empresa do cliente | hora, servico, projeto, visita |
| `eletricista-residencial-e-comercial` | a confirmar | doc+selfie, CPF/CNPJ, antecedentes, curso | comissão no 1º serviço (desligada) | sim | não | domicílio, empresa do cliente | hora, dia, servico, visita |
| `pintor` | conferido | doc+selfie, CPF/CNPJ, antecedentes | comissão no 1º serviço (desligada) | sim | não | domicílio, empresa do cliente | hora, dia, servico, m2 |
| `montador-de-moveis` | conferido | doc+selfie, CPF/CNPJ, antecedentes | comissão no 1º serviço (desligada) | sim | não | domicílio, empresa do cliente | hora, dia, servico, visita |
| `psicologo` | conferido | doc+selfie, CPF/CNPJ, registro | só assinatura | não | não | online, estabelecimento | sessao, mes, pacote |
| `nutricionista` | conferido | doc+selfie, CPF/CNPJ, registro, antecedentes | em análise jurídica | sim | não | domicílio, online, estabelecimento | sessao, mes, pacote, visita |
| `fisioterapeuta` | conferido | doc+selfie, CPF/CNPJ, registro, antecedentes | só assinatura | sim | não | domicílio, online, estabelecimento | sessao, mes, pacote, visita |
| `personal-trainer` | conferido | doc+selfie, CPF/CNPJ, registro, antecedentes | comissão no 1º serviço (desligada) | sim | não | domicílio, online, estabelecimento, externo | hora, sessao, mes, pacote |

Para reler a política atual antes de usar um texto (a partir de `apps/web`):

```bash
node -e "const p=require('./catalog/policies.json');for(const s of ['diarista','cuidador-de-idosos','encanador','eletricista-residencial-e-comercial','psicologo','nutricionista','fisioterapeuta','personal-trainer']){const x=p[s];console.log(s,x.confidence,x.verification.join('+'),x.billing,x.ratingRanking,x.laborLock)}"
```

---

## Apêndice B. Fatos do produto usados e onde conferir

| # | Fato | Onde conferir |
|---|---|---|
| 1 | O cadastro real é `/pro/cadastro`, em 4 passos: "1. Seu perfil", "2. Bairros atendidos", "3. Documentos", "4. Enviar para análise" | `pages/pro/Cadastro.tsx` |
| 2 | Nome de exibição de 2 a 120 caracteres; endereço da página até 80 caracteres, só minúsculas, números e hífens | `services/providers.ts` (`becomeProvider`, `SLUG_PATTERN`) |
| 3 | Número de registro e UF só quando a política tem o passo de registro profissional | `pages/pro/Cadastro.tsx` (`BecomeProviderForm`); `PolicyView.requiresRegistry` |
| 4 | Arquivos JPG, PNG, WebP, HEIC ou PDF de até 10 MB; remoção só de arquivo ainda não revisado | `services/providers.ts` (`DOCUMENT_TYPES`, `DOCUMENT_MAX_BYTES`); `pages/pro/Cadastro.tsx` |
| 5 | A autorização de antecedentes grava o consentimento `background_check` | `pages/pro/Cadastro.tsx` (`DocumentsStep`) |
| 6 | O envio para análise exige documento enviado em cada passo da política | ARQUITETURA, `submit_provider_for_review`; `pages/pro/Cadastro.tsx` (`ReviewStep`) |
| 7 | Situações Rascunho, Em análise, Aprovado, Suspenso e seus textos de ajuda | `components/pro/labels.ts` |
| 8 | Login por código de 6 dígitos (e-mail ou SMS) com aceite de termos; WhatsApp não é oferecido | `pages/conta/Entrar.tsx`; README |
| 9 | `/legal` diz "Documentos em elaboração" | `pages/LegalDocs.tsx` |
| 10 | Ações do admin: aceitar e rejeitar documento, confirmar e rejeitar registro, aprovar ocupação, aprovar prestador | `components/admin/DocumentCard.tsx`, `components/admin/OccupationCard.tsx`, `pages/admin/PrestadorDetalhe.tsx` |
| 11 | Primeira aprovação aprova as ocupações que cumprem a regra; documento aceito que deixa de ser aceito retira aprovações dependentes | ARQUITETURA (`provider_occupations`); migration `..._11_admin.sql` |
| 12 | Pedidos só para prestador aprovado, com ocupação aprovada e bairro atendido; sem telefone do cliente | `pages/pro/Pedidos.tsx`; ARQUITETURA (`open_requests_for_me`) |
| 13 | Máximo de propostas por pedido (`proposal_limit`, padrão 3); plano gratuito com 5 propostas novas por mês civil de São Paulo; retirar não devolve a vaga | ARQUITETURA; migration `..._12_monetization.sql`; `config/features.ts` |
| 14 | Pro a R$ 49,00 (`pro_price_cents` 4900), teste de 30 dias uma vez por conta, cancelar mantém o Pro até o fim do período pago | ARQUITETURA; `pages/pro/Assinatura.tsx`; DECISOES D2 a D4 |
| 15 | Cobrar cliente próprio exige Pro e conta de recebimento no Asaas | `supabase/functions/charges-create/handler.ts`; `pages/pro/Cobrancas.tsx` |
| 16 | Comissão e retenção desligadas; teto de R$ 150,00 implementado | DECISOES seções 1 a 4 |
| 17 | Trava de 2 dias por semana com o mesmo cliente nas ocupações com `laborLock` | `pages/pro/Agenda.tsx`; `lib/errors.ts` |
| 18 | Seis modelos de notificação; nenhum avisa o prestador de pedido novo | migration `..._08_notifications.sql` |
| 19 | Página pública: serviços com preço, horários, bairros, registro "informado" ou "confirmado pelo WorkEasy", avaliações só onde a política permite | `pages/publico/PaginaPrestador.tsx`; `components/cliente/RegistryNote.tsx` |
| 20 | Ordem da busca: por nota (com ao menos 3 avaliações) onde `ratingRanking`; senão ordem estável por dia, sem nota | ARQUITETURA (`search_providers`) |
| 21 | Avaliação só após atendimento pago pelo app | ARQUITETURA (`reviews`) |
| 22 | Exclusão de conta anonimiza e mantém o registro financeiro | `pages/conta/Conta.tsx`; DECISOES D7 |
| 23 | `/register-provider` é demonstração que não guarda nada | `pages/ProviderRegistration.tsx` |
| 24 | Serviço e agenda podem ser preenchidos antes da aprovação | migration `..._03_providers.sql` (`services_insert_own`, `availability_insert_own`) |
| 25 | `expires_at` do documento não é preenchido pela tela de envio | `services/providers.ts` (`uploadProviderDocument`); ARQUITETURA (`admin_review_document`) |
| 26 | Orçamento do app "não substitui nota fiscal"; o app não emite nota | `components/pro/QuoteDocument.tsx` |
| 27 | Link de conversa direta no formato `https://wa.me/<número>?text=` | `pages/cliente/concierge.ts` |
| 28 | Dados pedidos para abrir a conta de recebimento | `pages/pro/Assinatura.tsx` (`ReceivingSection`) |
| 29 | Consentimento "Comunicações de novidades" separado das mensagens sobre pedidos | `pages/conta/Conta.tsx` |
| 30 | Não há recurso de indicação, crédito, bônus nem lista de espera | busca por esses termos no código de `apps/web` |
