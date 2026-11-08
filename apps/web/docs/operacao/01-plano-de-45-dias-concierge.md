# Plano de 45 dias: concierge e beta da ferramenta

Documento O01 · versão de 23/10/2026 · uso interno do dono do WorkEasy, que opera sozinho.

> **Rascunho para revisão de advogado. Não é parecer jurídico.** Este é um plano operacional. Onde ele encosta em lei, conselho profissional, contrato ou tributo, o trecho vem marcado `[CONDICIONAL: depende de parecer]` e não substitui advogado nem contador.
>
> **Estado do produto:** o MVP está em `main` (PR #2), **não está implantado**, não tem usuários reais e nada foi testado contra o Asaas, o WhatsApp ou o Resend de verdade (README e `docs/DECISOES.md`). Comissão e pagamento retido estão desligados. Por isso o plano começa numa Semana 0 de preparação (seção 2): sem ela, os 45 dias não têm onde rodar.
>
> **Nenhum número deste documento é resultado nem previsão.** As metas vêm do plano. Ritmos, faixas de decisão, horas e custos são propostas e estimativas, com a premissa escrita ao lado, para você trocar pelo número real assim que ele existir.

| Marca | Significa |
|---|---|
| `[PLANEJADO]` | não existe no produto hoje |
| `[CONDICIONAL: depende de parecer]` | só vale depois de resposta de advogado, contador ou conselho |
| `[estimativa]` | cálculo ou juízo meu, com a premissa ao lado |
| `[incerto]` | não consegui abrir a fonte, ou o dado pode estar desatualizado |
| `[proposta]` | regra que eu sugiro; não vem do plano estratégico nem de `docs/DECISOES.md` |
| `[fonte: Fn]` | fato externo; URL, data de leitura e trecho na seção 17 |

**De onde vêm as metas.** Os quatro portões e a meta de 50 prestadores vêm do enunciado desta tarefa ("portões do plano"). O plano estratégico privado não estava acessível a mim. Reabri `docs/DECISOES.md`, `docs/ARQUITETURA.md`, o `README.md` e o código citado em cada ponto.

**Conteúdo:** Resumo · 1 Premissas, escopo e conduta · 2 Semana 0: portão de partida · 3 Geografia do piloto · 4 Categorias de lançamento · 5 Metas, portões e ritmo · 6 Semana a semana · 7 Dia a dia (D1 a D45) · 8 Rotina diária e orçamento de horas · 9 Construir ou fazer à mão · 10 Fluxos mínimos · 11 O que medir desde o dia 1 · 12 Revisão semanal (modelo) · 13 Regras de continuar, corrigir, pivotar e parar · 14 Orçamento · 15 Registro de riscos · 16 Lacunas do produto e pendências · 17 Fontes · Apêndices A e B.

**Documentos do plano citados** (pasta `docs/operacao/`, salvo indicação): O02 `02-recrutamento-de-prestadores.md` · O03 `03-aquisicao-de-clientes-e-bairros.md` · O04 `04-operacao-concierge-do-dia-a-dia.md` · O05 `05-templates-whatsapp.md` · O06 `06-manual-do-cuidado.md` · O07 `07-suporte-disputas-e-moderacao.md` · O08 `08-metricas-e-portoes.md` e `kpis.sql` · O09 `09-modelo-financeiro.xlsx` · I01 `../pesquisa/asaas.md` · I02 `../pesquisa/whatsapp-e-email.md` · I03 `../pesquisa/supabase-producao.md` · I04 `../RUNBOOKS.md` · L01 a L11 em `../juridico/` · Frente A = matriz por conselho e conferência das políticas do catálogo.

---

## Resumo

**O que este plano faz.** Transforma a Fase 1 em rotina: 45 dias corridos, um fundador em tempo integral (teto de 60 h por semana) e gasto mínimo, em cinco distritos contíguos da Zona Sul: Moema, Vila Mariana, Saúde, Campo Belo e Jabaquara. Você é o motor de casamento entre pedidos e prestadores: recebe pedidos pelo formulário do app e pelo WhatsApp Business, escolhe quem chamar, acompanha a proposta e entrega o link de pagamento (Pix ou fatura do Asaas).

**O que precisa ser verdade no dia 45 (portões do plano)**

| Portão | Meta | Em uma linha (definição completa na seção 5) |
|---|---|---|
| G1 | 30 ou mais prestadores usando a agenda em cada semana | prestador aprovado com ao menos 1 evento de agenda na semana |
| G2 | 20 ou mais serviços pagos pela plataforma | pagamento `received` ou `confirmed` de serviço real, sem teste |
| G3 | 70% ou mais dos pedidos com proposta qualificada dentro de 2 h | meta interna, nunca prometida ao cliente |
| G4 | 3 ou mais famílias na linha Cuidado | casa com plantão concluído e relatório do dia enviado |

Meta de recrutamento (não é portão): **50 prestadores aprovados**, com este desenho de mistura: 22 profissionais liberais pela ferramenta, 12 de limpeza, 10 de reparos e 6 cuidadores.

**Como, em cinco linhas**

1. Semana 0 (cerca de duas semanas): empresa, conta Asaas de produção, Supabase de produção, login por e-mail, termos publicados, número de WhatsApp dedicado. O relógio dos 45 dias só começa com tudo isso verde.
2. Semanas 1 e 2: recrutar e aprovar à mão, começando pela sua rede pessoal e por indicação. Nunca pela lista do consultório.
3. Semanas 3 a 6: abrir a demanda por convite (síndicos, zeladores, associações), atender pedidos dentro da janela de atendimento, cobrar pelo link e fechar famílias do Cuidado.
4. Toda sexta: revisão de 60 minutos com os números (seção 12) e uma única alavanca por semana.
5. Dia 45: decisão por regras escritas antes (seção 13): continuar, corrigir, pivotar ou parar.

**Dinheiro e horas.** Caixa operacional de **R$ 1,4 mil a R$ 5,1 mil** nos 45 dias `[estimativa]`, fora jurídico e abertura da empresa (R$ 5 mil a R$ 25 mil `[incerto]`, sem cotação) e fora o valor da sua hora: 349 h planejadas, teto de 60 h por semana (seção 8).

**Sete decisões que só você pode tomar antes do D1**

| # | Decisão | Padrão proposto | Detalhe |
|---|---|---|---|
| 1 | Cluster do piloto | os cinco distritos acima; alternativa B5 se a sua rede for mais forte lá | seção 3 |
| 2 | Data do D1 e regra de pausa do relógio | D1 só quando os itens bloqueantes da seção 2 estiverem verdes; pausa máxima de 14 dias | seção 2 |
| 3 | Janela de atendimento | segunda a sexta 8h às 17h30, sábado 8h às 14h; domingo só resposta automática | seção 8 |
| 4 | Como o cliente paga no piloto | Trilha B (cobrança na conta do prestador) desde o primeiro dia; Trilha A (conta da plataforma com split) só depois da resposta de Q1 do advogado `[CONDICIONAL: depende de parecer]` | seção 10 |
| 5 | Cuidado | só começa com empresa aberta, seguro cotado e parecer trabalhista; dinheiro do plantão fora do app `[CONDICIONAL: depende de parecer]` | seções 4 e 10 |
| 6 | Eletricista e demais ocupações `a_confirmar` | fora do mínimo do plano até a Frente A conferir a política; exceção só por escrito | seção 4 |
| 7 | Teto de 60 h | conta todo trabalho, inclusive clínica; definir quem cobre o consultório | seção 8 |

**Os três riscos que mais podem derrubar o plano:** o produto nunca rodou em produção (risco R5); o dinheiro do Cuidado e o split da plataforma dependem de parecer (R1 a R3); e o seu tempo (R10). Registro completo na seção 15.

---

## 1. Premissas, escopo e conduta

### 1.1 Premissas

1. **Fundador único, dedicação integral.** O teto de 60 h por semana conta qualquer trabalho remunerado, inclusive clínica `[proposta de leitura da regra]`. Se você mantiver plantões, corte escopo (seção 13), não sono.
2. **Concierge.** Você faz à mão o que o produto ainda não faz: avisar prestadores de pedido novo, escolher 3 a 5 deles, conferir a proposta, mandar o link de pagamento e acompanhar. Sem anúncio pago (DECISOES D11).
3. **Dinheiro desligado.** `commission_enabled` e `escrow_enabled` ficam `false` nos 45 dias. Nenhuma frase ao público promete comissão zero para sempre.
4. **Nenhuma promessa de prazo ao público.** A meta de 2 h é interna. O teste `test/claims-guard.test.ts` recusa "em até N horas" e frases parecidas no código; aplique a mesma disciplina a cartaz, mensagem e post.
5. **Preço é do prestador.** O WorkEasy não tabela preço; você não sugere valor a ninguém.

### 1.2 Fora do escopo dos 45 dias

| Item | Por quê |
|---|---|
| Lojas Apple e Google | o site é instalável como PWA (README); publicação é outro trabalho (S01 a S03) |
| Páginas de SEO por bairro | saem `noindex` até existir dado local; `data/seo-local.json` está `[]` (README) |
| Telemedicina, prontuário, verificação de identidade, vídeo | não existem (README) |
| Assistente de pedidos por IA (`request-assist`) | sem chave a função responde 503; o concierge humano é o assistente |
| Comissão, pagamento retido, plano anual, venda de lead, taxa ao cliente | DECISOES D1, D5, D10, D11 e seção 4 |
| Médicos e dentistas | a matriz por conselho (Frente A) ainda está em elaboração; conflito de interesse com a sua profissão `[CONDICIONAL: depende de parecer]` |

### 1.3 Regras de conduta do piloto

1. Escreva só a quem pediu contato ou deu o número e autorizou. Guarde a origem e a data (regras completas no O02, seção 5).
2. **Nada do consultório.** Nenhum cadastro, agenda, prontuário ou lista de contatos do consultório entra em recrutamento, convite de família ou divulgação. O WorkEasy é outra empresa (DECISOES, seção 8, item 3). Se um paciente perguntar, responda; antes de indicar ativamente, consulte o advogado `[CONDICIONAL: depende de parecer]`.
3. **Nada de orientação de saúde** em nenhuma conversa. Em emergência, SAMU 192 ou serviço de urgência. A linha Cuidado é não clínica.
4. Sem depoimento, nota, número ou parceria que você não possa provar. Sem "garantido", sem "seguro" e sem selo de verificação: diga "conferido" ou "informado, não verificado".
5. **Dinheiro de cliente só passa pelo Asaas.** Nunca pela sua conta pessoal nem pela do consultório; nunca repasse dinheiro do seu bolso.
6. **Documento só pelo app** (espaço privado). Não receba foto de RG, CPF ou certidão por WhatsApp; apague o que chegar.
7. Dado de saúde de família ou assistido: nem no app (o cliente já recusa) nem na planilha.
8. Um prestador de profissão com conselho recebe a ferramenta, não promessa de clientes nem de posição (O02, seções 1.3 e 12.5).

---

## 2. Semana 0: portão de partida

Duas semanas de preparação, de **26/10 a 06/11/2026** se tudo correr sem atraso (nove dias úteis: 02/11 é feriado nacional [F13]). Esta seção só diz o que precisa estar verde para o D1, e onde está o detalhe. Q1 a Q7 são as perguntas numeradas ao advogado em `docs/DECISOES.md`, seção 8. O O02 (seção 2) tem os portões específicos de recrutamento; a tabela abaixo acrescenta demanda, pagamento e medição. A coluna "Pronto quando" é `[proposta]`.

| # | Item | Bloqueia | Pronto quando | Detalhe |
|---|---|---|---|---|
| P1 | Pessoa jurídica aberta e contador contratado | tudo (contas em nome da empresa, termos com razão social) | CNPJ ativo | DECISOES, seção 8, item 3 |
| P2 | Advogado contratado e Q1, Q4, Q5 e Q7 enviadas | Q1: pagamentos pela conta da plataforma (Trilha A); Q4: Cuidado; Q5: coleta de documentos; Q7: oferta do teste de 30 dias | e-mail enviado e prazo de resposta combinado por escrito | DECISOES, seção 8 (perguntas) |
| P3 | Supabase de produção no ar: migrações, seed do catálogo, buckets, funções, Vault, primeiro admin | tudo | teste rápido (cadastro, pedido, proposta) verde | I03 e I04 |
| P4 | Código de login chegando por e-mail (modelos com `{{ .Token }}`) | qualquer cadastro | 5 códigos recebidos em 3 provedores de e-mail diferentes | README ("Login por código"); I02 |
| P5 | Conta Asaas de produção aprovada, webhook configurado, Pix de R$ 1,00 conferido | qualquer cobrança | cobrança de R$ 1,00 paga e vista no painel do Asaas e em `/admin/pagamentos` | I01; DECISOES, seção 4, item 2 |
| P6 | Site publicado com `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL` e `VITE_CONCIERGE_WHATSAPP` | tudo | `/pedido` abre no celular com 4G | README; hospedagem sem documento no plano (seção 16) |
| P7 | Termos de Uso e Política de Privacidade publicados em `/legal` e revisados | coleta de documentos e pedidos | `/legal` deixa de dizer "Documentos em elaboração" | L01, L02, L03 e L11; O02, seção 14.2, item 2 |
| P8 | WhatsApp Business (aplicativo) no número dedicado do concierge: perfil, saudação, ausência, respostas rápidas, etiquetas. Se um dia ligar a API, ela usa **outro** número (I02) | demanda | teste com 2 contatos seus | O05; I02; [F10] |
| P9 | Planilhas criadas (seção 11) e lista de contas de teste | medição e integridade dos portões | modelos copiados e acesso só seu | seção 11 |
| P10 | Ensaio completo por você, com contas e documentos fictícios | tudo | roteiro de login a pagamento sem erro | O02, seção 8; O04 |
| P11 | Cuidado: seguro de responsabilidade civil cotado e parecer trabalhista sobre o fluxo e a trava de 2 dias | só o Cuidado | documentos arquivados | DECISOES, seção 5; O06 |
| P12 | Políticas das ocupações de lançamento conferidas | recrutamento dessas ocupações | lista de slugs `conferido` (seção 4) | Frente A |
| P13 | Canais de atendimento e plano de incidente publicados | tudo | e-mail e WhatsApp respondendo; plano lido | L08, L10; O07 |
| P14 | Três correções pequenas no app, ou decisão de conviver | recrutamento e demanda | ver abaixo | seção 9 |

**P14, as três correções pequenas** `[PLANEJADO]`: (a) "Trabalhe Conosco" no rodapé, "Ofereço este serviço" nas páginas de serviço e o link em Minha conta levam a `/register-provider`, página de demonstração que não guarda nada (conferi em `AppShell.tsx`, `pages/OccupationPage.tsx` e `pages/conta/Conta.tsx`; mesmo achado do O02, seção 14.2); (b) com backend ligado, o app não mostra o WhatsApp do concierge em lugar nenhum: `VITE_CONCIERGE_WHATSAPP` só é usada quando não há backend (`pages/cliente/Pedido.tsx`); (c) o item "Cuidado" aparece no menu de todo cliente logado (`components/navItems.ts`), e DECISOES, seção 5, manda não divulgar o menu antes dos pré-requisitos. Se não houver quem corrija, conviva: mande sempre o link direto `[SITE]/pro/cadastro` e passe o WhatsApp por cartaz e QR.

**Regra do relógio.** O D1 é a primeira segunda-feira em que P1, P3, P4, P6, P7, P8, P9, P10 e P13 estão verdes. P5 (Asaas) pode atrasar: sem ele você recruta, mas não fala de Pro nem de cobrança (O02, seção 2), e o relógio do G2 fica pausado até P5 ficar verde. Em qualquer bloqueio externo depois do D1 (aprovação do Asaas, resposta do advogado), o relógio **pausa** só para o portão afetado, por no máximo 14 dias; passado isso, replaneje por escrito. Calendário de referência deste documento: **D1 = segunda 09/11/2026, D45 = quarta 23/12/2026**; se o D1 mudar, mude as datas e marque os feriados da janela (lista na seção 7).

---

## 3. Geografia do piloto

### 3.1 Escolha

Piloto: **Moema, Vila Mariana, Saúde, Campo Belo e Jabaquara** (slugs `moema`, `vila-mariana`, `saude`, `campo-belo`, `jabaquara` em `data/neighborhoods.json`, todos com `zone: Sul`). O mapa do app tem 96 distritos de São Paulo; 22 estão em `Sul`.

| Distrito | Moradores | Domicílios | km² | Moradores por km² (arredondado) | Moradores por domicílio | IPVS 1 e 2 | IPVS 5 e 6 | Hospitais no cadastro | Estações de metrô |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Moema | 81.899 | 46.035 | 9,08 | 9.000 | 1,78 | 99,6% | 0,0% | 2 | 3 |
| Vila Mariana | 127.286 | 70.691 | 8,60 | 14.800 | 1,80 | 95,5% | 1,0% | 3 | 6 |
| Saúde | 128.469 | 65.598 | 9,31 | 13.800 | 1,96 | 95,3% | 1,0% | 1 | 3 |
| Campo Belo | 71.034 | 36.663 | 8,77 | 8.100 | 1,94 | 90,0% | 7,9% | 0 | 0 |
| Jabaquara | 214.991 | 96.292 | 14,01 | 15.300 | 2,23 | 62,9% | 20,2% | 3 | 2 |
| **Conjunto** | **623.679** | **315.279** | **49,8** | **12.500** | **1,98** | **84,1%** | **8,3%** | **9** | **14** |
| *Núcleo de demanda (sem Jabaquara)* | *408.688* | *218.987* | *35,8* | *11.400* | *1,87* | *95,3%* | *2,0%* | *6* | *12* |

Como ler: moradores e domicílios são do Censo 2022, somados pelos setores censitários da camada "Densidade Demográfica 2022" do GeoSampa; cada setor foi atribuído ao distrito que contém o seu ponto interno (2 setores, com 1.257 moradores, ficaram fora de qualquer distrito e foram ignorados). **IPVS** é o Índice Paulista de Vulnerabilidade Social da Fundação Seade por setor, na camada do GeoSampa: grupos 1 e 2 são "baixíssima" e "muito baixa" vulnerabilidade, e 5 e 6 são "alta" e "muito alta" (legenda da própria camada). As colunas de IPVS são a **parcela dos moradores** em setores desses grupos. Hospitais vêm do cadastro de estabelecimentos de saúde da Prefeitura; estações, da camada de estações ativas do Metrô (contei por nome: estação de duas linhas conta uma vez). Tudo isso é contagem minha sobre dados da Prefeitura [F1 a F5]; método e script no Apêndice A.

### 3.2 As sete divisas que ligam os cinco distritos

| Par | Divisa em comum (km) |
|---|---:|
| Moema e Vila Mariana | 3,5 |
| Moema e Saúde | 2,5 |
| Moema e Campo Belo | 1,9 |
| Vila Mariana e Saúde | 2,8 |
| Saúde e Campo Belo | 2,2 |
| Saúde e Jabaquara | 2,1 |
| Campo Belo e Jabaquara | 4,2 |

Medi as divisas a partir dos polígonos oficiais dos distritos (camada "Distrito" do GeoSampa), contando como vizinhos os pares com pelo menos 50 m de divisa. Os cinco distritos formam um conjunto conectado: Moema, Vila Mariana e Saúde fazem divisa entre si; Campo Belo toca Moema e Saúde; Jabaquara toca Saúde e Campo Belo. Vila Mariana não toca Campo Belo nem Jabaquara.

### 3.3 Por que este conjunto `[proposta]`

1. **É Zona Sul pelo app e pela Prefeitura.** Conferi os 96 distritos de `data/neighborhoods.json` contra o campo `nm_regiao_05` da camada "Distrito": a classificação coincide em todos (22 em Sul) [F1].
2. **Contíguo e compacto.** Conectado pelas divisas acima, 49,8 km² e 12,5 mil moradores por km². Prestador e você andam pouco; campo de sábado cabe em meio período.
3. **Demanda com capacidade de contratar, em hipótese.** 84,1% dos moradores vivem em setores de vulnerabilidade baixíssima ou muito baixa, e 95,3% no núcleo sem Jabaquara. IPVS **não mede renda**: é um indício, a validar com o preço que os pedidos reais aceitarem.
4. **Oferta por perto, em hipótese.** 8,3% dos moradores do conjunto vivem em setores de vulnerabilidade alta ou muito alta, e 84% deles em Jabaquara (43.416 de 51.507). Se a hipótese valer, Jabaquara e os distritos que fazem divisa com o conjunto (Cursino, Cidade Ademar, Ipiranga e Santo Amaro) fornecem prestadores que atendem o núcleo. A planilha de prestadores guarda `distrito_onde_mora` para testar isso (seção 11).
5. **Domicílios pequenos no núcleo.** 1,78 a 1,96 moradores por domicílio em Moema, Vila Mariana, Saúde e Campo Belo, contra 2,23 em Jabaquara. Hipótese: mais gente morando só ou em casal, o que combina com limpeza e cuidado. A idade **não** foi medida (não abri dados por faixa etária).
6. **Saúde e transporte.** O cadastro da Prefeitura lista 9 hospitais nos cinco distritos (nenhum em Campo Belo), base para a conversa com equipes de alta do Cuidado (O03). As linhas 1-Azul, 2-Verde e 5-Lilás do Metrô passam pelo conjunto, o que ajuda quem vai sem carro `[estimativa]`.

**Desenho de campanha:** concentre pedidos e divulgação ao público no **núcleo de demanda** (Moema, Vila Mariana, Saúde, Campo Belo) e o recrutamento em **Jabaquara e nas divisas**. Regra de entrada do prestador: atender pelo menos um dos cinco distritos no campo "bairros atendidos" (`provider_neighborhoods`), mesmo que more fora.

### 3.4 Alternativa B5 e regras para mudar

| Conjunto | Distritos | Moradores | Domicílios | km² | Moradores por domicílio | IPVS 1 e 2 | IPVS 5 e 6 |
|---|---|---:|---:|---:|---:|---:|---:|
| **A5 (recomendado)** | Moema, Vila Mariana, Saúde, Campo Belo, Jabaquara | 623.679 | 315.279 | 49,8 | 1,98 | 84,1% | 8,3% |
| B5 | Santo Amaro, Campo Belo, Campo Grande, Cidade Ademar, Jabaquara | 735.501 | 327.891 | 64,1 | 2,24 | 64,3% | 21,4% |

B5 também é conexo, mas mistura mais demanda e oferta no mesmo território (e é 29% maior em área). Use B5 se a sua rede de prestadores ou de famílias for claramente mais forte ali. Para trocar de conjunto, rode o script do Apêndice A e exija: grafo conexo pelas divisas, área até cerca de 65 km² `[proposta]` e as colunas de demanda e oferta acima. **Expansão:** só acrescente um distrito depois de 2 semanas seguidas com G3 em 70% ou mais e ao menos 8 pedidos válidos por semana `[proposta]`. Vizinhos naturais: Cursino, Cidade Ademar, Ipiranga e Santo Amaro (Sul no arquivo); Itaim Bibi e Jardim Paulista fazem divisa com Moema e Campo Belo, mas estão em `Oeste` no arquivo e na Prefeitura.

### 3.5 Limites destes dados

- Dados da Prefeitura (GeoSampa) lidos em 23/10/2026: camada de distritos atualizada em 20/03/2026, Censo 2022 e IPVS com ano de referência 2022. O cadastro de hospitais pode estar incompleto ou desatualizado `[incerto]`.
- A legenda do IPVS veio da própria camada; o site da Seade (método) bloqueou meu acesso, e o do IBGE (conferência do total do município) retornou 403. A soma dos 27.301 setores é 11.451.999 moradores.
- Nada aqui mede renda, idade, nem preço. São indícios para escolher onde começar, não prova de demanda.

---

## 4. Categorias de lançamento

Quatro categorias, cada uma com um modo de entrada. A mistura de 50 aprovados é `[proposta]` e foi pensada para fechar o G1 (agenda), que depende de profissões com atendimento recorrente. Os dados de política são de `catalog/policies.json` em 23/10/2026; a Frente A pode mudá-los: releia antes de recrutar.

| Categoria | Ocupações de lançamento (slug · política) | Meta de aprovados | Como entra | Restrições do produto e da política |
|---|---|---:|---|---|
| **Profissionais liberais, pela ferramenta** | `psicologo` (conferido; só assinatura; sem nota pública) · `fisioterapeuta` (conferido; só assinatura) · `nutricionista` (conferido; cobrança "em análise jurídica") · `personal-trainer` (conferido; comissão no 1º serviço, desligada) · beleza: `cabeleireiro`, `manicure-e-pedicure`, `barbeiro`, `esteticista` (conferido) · aulas: `professor-particular`, `aulas-de-ingles` (conferido) | **22** (psicologia 5, fisioterapia 4, nutrição 3, personal 3, beleza 5, aulas 2) | Indicação e relacionamento (O02). A oferta é a **ferramenta**: agenda, página própria `/p/<endereço>`, orçamento por link e cobrança por Pix; não é "clientes". Também recebem pedidos quando houver | Registro profissional: você consulta o cadastro público do conselho e confirma em `/admin/prestadores/:id` (a tela exige escrever como conferiu). Sem nota nem ranking onde `rating_ranking = false` (`psicologo`). Sem depoimento, preço ou promoção que o conselho restrinja (O02, 12.5). Matriz por conselho (Frente A) antes de falar de clientes `[CONDICIONAL: depende de parecer]` |
| **Limpeza** | `diarista` (conferido; trava trabalhista) · `limpeza-pesada-e-pre-mudanca`, `limpeza-de-estofados`, `higienizacao-de-colchao` (conferido) | **12** (8 diaristas, 4 pontuais) | Pedidos no app (Trilha A) e por WhatsApp (Trilha B); você escolhe de 3 a 5 prestadores por pedido | O banco recusa o 3º dia na mesma semana ISO com o mesmo cliente (`labor_lock_days_per_week = 2`, `diarista`): explique na ativação. Pede documento com foto e selfie, CPF ou CNPJ, antecedentes |
| **Reparos** | `encanador`, `pintor`, `montador-de-moveis`, `tecnico-de-eletrodomesticos` (todas conferido) | **10** (3, 3, 2, 2) | Idem; serviço maior por orçamento com link | `eletricista-residencial-e-comercial` e **as 42 ocupações da área `eletricista` estão `a_confirmar`** (0 conferidas) e a primeira pede certificado de curso. O O02 (3.2) admite eletricista com cautela; aqui ele fica fora do mínimo até a Frente A conferir a política `[proposta]`. Gás, desentupimento e obra estrutural têm item próprio nas políticas: pergunte o escopo na triagem |
| **Cuidado de idosos, gerido** | `cuidador-de-idosos` (**a_confirmar**; trava trabalhista) | **6 cuidadores e 3 famílias** | Sem divulgação pública do menu (DECISOES, seção 5). Família por convite; cuidador em conversa individual (O02, 3.3). Você oferece o plantão (`offer_shift`); a família cria casa, assistido e plantão; o cuidador aceita, faz check-in e check-out e envia o relatório do dia | P11 verde antes do primeiro plantão pago. Trava de 2 dias por semana por casa. O app recusa dado de saúde em texto livre. Cobrança da família e repasse ao cuidador ficam **fora do app** `[CONDICIONAL: depende de parecer]`. A margem de DECISOES, seção 5, é número interno de planejamento e não aparece em material ao público |

**Cobertura mínima `[estimativa]`.** O banco aceita até 3 propostas por pedido (`proposal_limit = 3`). Se cada prestador apto responde de 40% a 60% das vezes, você precisa de 3 ÷ 0,6 = 5 a 3 ÷ 0,4 = 7,5 aptos por ocupação e distrito para o pedido chegar a 3 propostas. Doze diaristas atendendo 2 ou 3 dos cinco distritos dão cerca de 5 a 7 por distrito: no limite. Nos reparos, com 2 ou 3 por ocupação, o realista é 1 proposta qualificada, que é o que o G3 pede.

**Freio de oferta `[proposta]`.** Não passe de cerca de 8 aprovados por ocupação e distrito sem ao menos 3 pedidos naquela ocupação nas últimas 2 semanas: aprovado que nunca recebe pedido vai embora (risco R7).

**Atenção ao G1.** Trinta usuários semanais em 50 aprovados exigem 60% de atividade. Os 22 liberais e os 8 diaristas com clientes recorrentes são os candidatos naturais: são 30 pessoas, então **todas** teriam de usar a agenda toda semana. Por isso o plano conta também com os 20 de reparos e de limpeza pontual para cobrir as faltas. Se no CP2 a atividade real estiver abaixo do ritmo, troque vagas de reparos por profissões de agenda recorrente, não o contrário.

---

## 5. Metas, portões e ritmo

### 5.1 Os quatro portões com definição operacional `[proposta]`

As metas são do plano; as definições abaixo são minhas, para que "contar" tenha uma regra. As fórmulas finais e as consultas SQL ficam no O08 (`08-metricas-e-portoes.md` e `kpis.sql`). **Se uma definição aqui divergir do O08, vale o O08** e este documento deve ser corrigido.

| Portão | Meta do plano | Definição operacional | Fonte | Não conta | Janela |
|---|---|---|---|---|---|
| **G1** | 30 ou mais prestadores usando a agenda toda semana | Prestador aprovado com ao menos 1 **evento de agenda** na semana ISO (segunda a domingo, horário de São Paulo): atendimento criado por ele (`bookings.created_at`), status de atendimento mudado por ele (`booking_events.actor_id`), horário (`availability.created_at`) ou folga (`time_off.created_at`) cadastrados. Passa com 30 ou mais prestadores distintos **em cada uma** das duas últimas semanas completas antes do D45 (semanas 5 e 6) | banco (`kpis.sql`, O08) | contas de teste; cuidador por plantão (plantão não é agenda); eventos feitos por você no aparelho do prestador durante uma sessão de ajuda | semanas 5 e 6 |
| **G2** | 20 ou mais serviços pagos pela plataforma | Serviço = atendimento ou orçamento aceito com ao menos um pagamento `received` ou `confirmed` em `payments`, de cliente real, no valor real do serviço. Conta uma vez por atendimento ou orçamento; reembolso ou estorno retira. Relate à parte: por trilha (A ou B), por prestador, por categoria e valor total | banco (`payments`, `bookings`, `quotes`) | testes de R$ 1,00; contas de teste; você, familiares, funcionários e o próprio prestador como pagador (mesmo CPF); plantões do Cuidado (não há pagamento no app); divisão de um serviço em vários pagamentos | D1 a D45 |
| **G3** | 70% ou mais dos pedidos com proposta qualificada dentro de 2 h | **Pedido válido:** categoria e distrito dentro do piloto, com o quê, onde e quando, de pessoa real, sem duplicidade e sem ser ensaio. **Proposta qualificada:** de prestador aprovado naquela ocupação e distrito, com preço em reais e quando pode ir, **entregue ao cliente**. **Relógio:** do recebimento do pedido (ou da abertura da janela de atendimento, se chegou fora dela) até a entrega da primeira proposta qualificada. Passa com 70% ou mais dos pedidos válidos da janela, **com no mínimo 30 pedidos válidos**; abaixo disso o resultado é "sem prova", não "verde" | Trilha A: `requests.created_at` e `proposals.created_at` (o banco já exige prestador aprovado, ocupação, bairro e preço maior que zero); Trilha B: planilha `pedidos` | pedidos de ensaio; pedido que o cliente cancelou ou deixou sem resposta a uma pergunta sua por 2 h (registre o motivo); fora do escopo (conte à parte como demanda) | D22 a D45 |
| **G4** | 3 ou mais famílias na linha Cuidado | Família = casa (`households`) com ao menos 1 plantão concluído (`shifts.status = 'completed'`, com check-in e check-out) e relatório do dia enviado (`daily_reports`), sem incidente grave aberto. Passa com 3 casas distintas. Se a família ou o cuidador não conseguir usar o app, registre na planilha `cuidado` com a marca "fora do app": conta para o portão, mas é falha de produto a anotar | banco e planilha `cuidado` | casa de teste ou de familiar seu | D1 a D45 |

**G4 depende de P11.** Se P11 não estiver verde no CP2 (D11), o G4 fica "não testado" nesta rodada (por falta de pré-requisito, não por falta de família) e a decisão do D45 usa G1 a G3 mais um plano separado para o Cuidado.

**Duas observações sobre a regra dos 30% de DECISOES, seção 7.** Ela conta propostas enviadas no app. No concierge, a resposta do prestador muitas vezes sai por WhatsApp, então o número do banco **subestima** a responsividade. No CP5, calcule a regra duas vezes: só com propostas no app e com as respostas qualificadas registradas na planilha. A regra de 60 dias e a de 90 contam a partir do primeiro prestador real aprovado e ficam fora desta janela.

### 5.2 Funil de prestadores

Mesmas etapas do O02 (seção 1.2), com duas marcas de uso a mais.

| Etapa | Definição | Prova |
|---|---|---|
| Contatado | você escreveu a quem pediu contato ou autorizou | planilha (O02, seção 13) |
| Respondeu | a pessoa respondeu | planilha |
| Triagem | ligação de 10 min feita (O02, seção 7) | planilha |
| **Onboarded** | cadastro **enviado para análise** (situação "Em análise") | `providers.status = 'pending_review'` |
| **Aprovado** | situação "Aprovado" e ao menos 1 ocupação aprovada | `providers.status = 'approved'` e `provider_occupations.approved` |
| Agenda ativa | horários, serviço com preço, bairros e página no ar (checklist abaixo) | `availability`, `services`, `provider_neighborhoods` |
| Recebimento ativo | conta de recebimento no Asaas ativa | `provider_payment_accounts.status = 'active'` |
| 1ª proposta | primeira proposta no app, ou primeira resposta qualificada registrada | `proposals` ou planilha |
| 1º serviço pago | primeiro pagamento `received` ou `confirmed` | `payments` |

**Meta de recrutamento:** 50 **aprovados** em D45 (o O02 usa "onboarded" para o envio; aqui a meta é a aprovação, porque só aprovado recebe pedido). Para isso, mire em cerca de 58 enviados `[estimativa]`: parte do envio é recusada na análise de documentos.

**Checklist de agenda ativa (6 itens)** `[proposta]`: (1) horários da semana preenchidos em `/pro/agenda`; (2) ao menos 1 serviço com preço e duração em `/pro/servicos`; (3) bairros atendidos marcados, incluindo ao menos 1 distrito do piloto; (4) página `/p/<endereço>` aberta e lida pelo próprio prestador; (5) ao menos 3 clientes próprios em `/pro/clientes`; (6) ao menos 1 atendimento criado na agenda.

**Contatos necessários** = 50 ÷ (taxa de contato até aprovado). Estas taxas são **hipóteses**, não dados `[estimativa]`; troque pelas suas depois dos primeiros 20 contatos por canal (O02, seção 13.3):

| Cenário | Taxa contato até aprovado | Contatos para 50 aprovados | Horas de contato (5 a 8 min cada) |
|---|---:|---:|---:|
| Indicação quente | 25% | 200 | cerca de 17 a 27 h |
| Misto | 15% | 334 | cerca de 28 a 45 h |
| Canal frio | 8% | 625 | cerca de 52 a 83 h |

Se a taxa medida no CP2 ficar abaixo de 8%, mensagem fria não fecha 50 em 45 dias: troque de canal (O02, seção 4) em vez de aumentar o volume.

### 5.3 Ritmo ao longo dos 45 dias `[proposta]`

Interpolação dos portões, não vem do plano. Cada célula é **ritmo (vermelho abaixo de x)**, com x = 70% do ritmo, arredondado para cima. Os checkpoints (CP) são as revisões de sexta-feira (a do CP2 é na quinta, porque D12 é feriado).

| CP | Dia | Cadastros enviados (acum.) | Aprovados (acum.) | Ativos na agenda (na semana) | Pedidos válidos (acum.) | Pedidos com proposta qualificada em 2 h | Serviços pagos (acum.) | Famílias com plantão concluído |
|---|---|---:|---:|---:|---:|---|---:|---|
| CP1 | D5 | 8 (<6) | 4 (<3) | n/d | 1 | n/d | 0 | 0 |
| CP2 | D11 | 18 (<13) | 12 (<9) | 6 (<5) | 8 (<6) | medir, sem meta | 1 | 0 |
| CP3 | D19 | 30 (<21) | 22 (<16) | 14 (<10) | 22 (<16) | 50% ou mais (<35%) | 4 (<3) | 0, com família 1 e plantão marcado |
| CP4 | D26 | 40 (<28) | 32 (<23) | 22 (<16) | 42 (<30) | 60% ou mais (<42%) | 9 (<7) | 1 |
| CP5 | D33 | 50 (<35) | 42 (<30) | 30 (<21) | 68 (<48) | 70% ou mais (<49%) | 15 (<11) | 2 |
| CP6 | D40 | 56 (<40) | 48 (<34) | 32 (<23) | 92 (<65) | 70% ou mais (<49%) | 19 (<14) | 3 |
| **D45** | D45 | 58 | **50** | **30 ou mais nas semanas 5 e 6** | 30 ou mais na janela D22 a D45 | **70% ou mais** | **20 ou mais** | **3** |

Os pedidos acumulados partem de uma conversão de pedido para serviço pago de cerca de 20% `[estimativa]` (pedidos necessários = serviços pagos ÷ taxa de conversão: com 35% bastariam cerca de 57 pedidos; com 15%, cerca de 133). Parte dos serviços pagos virá de cliente próprio do prestador, sem pedido; por isso a taxa real é a que vale.

---

## 6. Semana a semana

Datas do calendário de referência (D1 = segunda 09/11/2026). Horas são as planejadas na seção 8.

| Semana | Dias | Objetivo | Resultados-chave | Não fazer | Horas | CP |
|---|---|---|---|---|---:|---|
| **1** | D1 a D7 (09 a 15/11) | Abrir com poucos e provar o ciclo completo com dinheiro de verdade | Go registrado; teste completo em produção; 8 cadastros enviados e 4 aprovados no CP1; 12 enviados no fim da semana; 1 pedido real com os tempos anotados; planilhas em uso | Divulgar o número ao público; recrutar além de cerca de 12; falar de Pro e cobrança com quem ainda não foi aprovado | 56 | CP1 (D5) |
| **2** | D8 a D14 (16 a 22/11) | Escalar a oferta e abrir a demanda por convite | 18 enviados e 12 aprovados no CP2; 6 ativos na agenda; 2 ou 3 locais autorizados a divulgar o número; ensaio de 2 h feito; taxa real de contato até cadastro calculada | Ampliar categorias; aceitar pedido fora dos cinco distritos | 56 | CP2 (D11) |
| **3** | D15 a D21 (23 a 29/11) | Demanda real e disciplina das 2 horas | Número divulgado nos locais autorizados; 22 pedidos válidos; 50% ou mais com proposta qualificada em 2 h; 4 serviços pagos; mapa de cobertura; Cuidado: família 1 com plantão marcado (se P11 verde) | Construir funcionalidade; mexer em preço ou no teste do Pro | 55 | CP3 (D19) |
| **4** | D22 a D28 (30/11 a 06/12) | Densidade e agenda toda semana | Janela do G3 aberta; 32 aprovados; 22 ativos na agenda; 9 serviços pagos; família 1 com plantão concluído; família 2 em andamento | Abrir novo distrito; recrutar categoria nova | 55 | CP4 (D26) |
| **5** | D29 a D35 (07 a 13/12) | Estabilizar e aprender (30 dias) | 30 ativos na agenda (primeira semana do G1); 15 serviços pagos; 2 famílias; decisão sobre notificações automáticas; 10 entrevistas com prestadores e 5 com clientes; regra dos 30% calculada | Mudar preço, teste ou limite de propostas | 53 | CP5 (D33) |
| **6** | D36 a D42 (14 a 20/12) | Prova: fechar os portões | 32 ativos; 19 serviços pagos; 3 famílias; auditoria planilha contra banco; previsão por portão; decisão antecipada sobre extensão | Iniciativa nova de qualquer tipo | 48 | CP6 (D40) |
| **7** | D43 a D45 (21 a 23/12) | Fechamento e decisão | Semanas 5 e 6 fechadas; `kpis.sql` rodado; evidências arquivadas; memorando de uma página; decisão no D45 | Qualquer escopo novo | 26 | D45 |

---

## 7. Dia a dia (D1 a D45)

Calendário de referência: **D1 = segunda 09/11/2026**. Feriados nacionais na janela: domingo 15/11 (D7) e sexta 20/11 (D12) [F13, fonte secundária]. O Natal (25/12) cai depois do D45. Se o D1 mudar, refaça as datas e remarque as revisões. A rotina fixa de cada dia (abertura, janelas, registro) está na seção 8 e não se repete aqui. "Feito quando" diz como você sabe que o dia cumpriu o que devia.

### Semana 1 (D1 a D7): abrir com poucos e provar o ciclo com dinheiro de verdade

| Dia | Foco | Feito quando |
|---|---|---|
| **D1** Seg 09/11 | Go ou No-Go da Semana 0 (seção 2). Teste completo em produção com contas de teste: pedido, proposta, aceite, cobrança de R$ 1,00 por Pix (se P5 estiver verde), conferência no painel do Asaas e em `/admin/pagamentos`, cancelamento. Conferir em `/admin/configuracoes` que comissão e pagamento retido estão desligados, e o teste de 30 dias e o limite de 5 propostas em `/pro/assinatura` com uma conta de teste. Configurar o WhatsApp Business e abrir planilhas e lista de contas de teste | Relatório do teste com prints e ids; Go ou No-Go escrito |
| **D2** Ter 10/11 | Lista quente de 40 prestadores de confiança que atendem os cinco distritos (sua rede pessoal, nunca o cadastro do consultório). 20 contatos por áudio (O02, seção 6.3). Marcar 8 triagens de 10 min | 20 contatos e 8 triagens na planilha `prestadores` |
| **D3** Qua 11/11 | 8 triagens (O02, seção 7). Cadastro assistido dos 4 primeiros: login por código, `/pro/cadastro`, bairros atendidos, documentos só pelo app | 4 cadastros em análise |
| **D4** Qui 12/11 | Analisar documentos em `/admin/prestadores` e aprovar quem cumpre a política. Com 3 aprovados: serviço com preço em `/pro/servicos`, horários em `/pro/agenda`, teste do Pro e "Ativar recebimento" em `/pro/assinatura`; 1 orçamento real e 1 cobrança de teste pela conta do prestador (os dois últimos só com P5 verde) | 3 ou mais aprovados; 2 ou mais com recebimento ativo, se P5 estiver verde |
| **D5** Sex 13/11 | Primeiro pedido real, de alguém do seu círculo que não seja paciente nem familiar direto: rodar a Trilha A ou B (seção 10) com todos os tempos anotados. **Revisão #1 (CP1)** | 1 pedido com tempos no log; revisão arquivada |
| **D6** Sáb 14/11 | Campo: 4 conversas presenciais com prestadores indicados; mais 20 contatos. Nada de divulgação ao público | 12 cadastros enviados (acum.) |
| **D7** Dom 15/11 | Descanso (feriado nacional). Resposta automática ligada | n/d |

### Semana 2 (D8 a D14): escalar a oferta e abrir a demanda por convite

| Dia | Foco | Feito quando |
|---|---|---|
| **D8** Seg 16/11 | Ler os números da semana 1 e calcular a taxa real por etapa do funil (seção 5.2). Pedir 2 indicações a cada aprovado (O02, seção 11). 30 contatos novos e 6 cadastros assistidos | Taxa contato até cadastro calculada |
| **D9** Ter 17/11 | Fila do admin: aprovar. Checklist de agenda ativa (seção 5.2) com cada aprovado. Treinar "como responder um pedido em 10 minutos" (O04). Foco em limpeza e reparos | 8 ou mais aprovados (acum.); 5 ou mais com agenda ativa |
| **D10** Qua 18/11 | Demanda por convite: 5 conversas com síndicos, zeladores ou associações de moradores dos cinco distritos, para pedir autorização de divulgar o número do WhatsApp (O03) | 2 ou 3 locais com autorização por escrito (uma mensagem basta) |
| **D11** Qui 19/11 | Ensaio de 2 h: 5 pedidos de ensaio, com prestadores avisados, marcados como ensaio e fora das métricas. **Revisão #2 adiantada (CP2)**, porque amanhã é feriado | Tempo do ensaio medido; CP2 lido |
| **D12** Sex 20/11 | Feriado nacional. Dia curto (até 4 h): fila do admin e pedidos que chegarem | n/d |
| **D13** Sáb 21/11 | Campo: 4 conversas presenciais; divulgar o número nos locais autorizados (cartaz com QR do WhatsApp, sem promessa de prazo). Se P11 está verde, começar a recrutar cuidadores, um a um (O06) | Cartazes colocados |
| **D14** Dom 22/11 | Descanso | n/d |

### Semana 3 (D15 a D21): demanda real e disciplina das 2 horas

| Dia | Foco | Feito quando |
|---|---|---|
| **D15** Seg 23/11 | Primeira semana com o número divulgado. Janela de atendimento completa e regra de interrupção (seção 8). 20 contatos para os buracos da matriz de cobertura | Log do dia fechado às 17:30 |
| **D16** Ter 24/11 | Mapa de cobertura (ocupação por distrito: aprovados e ativos). Recrutar para os buracos; freio onde passar de 8 sem pedidos. 6 cadastros assistidos | Matriz de cobertura na planilha |
| **D17** Qua 25/11 | Cuidado, só se P11 estiver verde: entrevistas com 6 candidatos a cuidador (referências; antecedentes e documentos no app; explicar a trava de 2 dias) (O06) | 4 ou mais cuidadores em análise |
| **D18** Qui 26/11 | Cuidado: primeira família, por convite (O03). Conversa de 60 a 90 min; o responsável cria conta, casa e assistido (sem dado de saúde); combinar um primeiro plantão curto | Família 1 com plantão marcado |
| **D19** Sex 27/11 | Conferir recebimentos, disputas e a lista "Exigem atenção" (`/admin/pagamentos`, `/admin/disputas`). **Revisão #3 (CP3)** | CP3 medido |
| **D20** Sáb 28/11 | Campo e atendimento. Acompanhar o plantão da família 1 se cair no sábado | n/d |
| **D21** Dom 29/11 | Descanso | n/d |

### Semana 4 (D22 a D28): densidade e agenda toda semana

| Dia | Foco | Feito quando |
|---|---|---|
| **D22** Seg 30/11 | Abre a janela de medição do G3. Campanha de ativação: ligar para cada aprovado sem evento de agenda na semana anterior (lista do `kpis.sql`, O08) | Lista de inativos zerada, ou com o motivo de cada um |
| **D23** Ter 01/12 | Cuidado: família 2 por convite; escala com 2 cuidadores por família (a trava de 2 dias); segundo plantão da família 1 | Família 2 com plantão marcado |
| **D24** Qua 02/12 | Recrutamento de reposição onde a cobertura caiu abaixo de 5. Conversar com quem saiu e anotar o motivo | Motivos de saída na planilha |
| **D25** Qui 03/12 | Demanda, segundo ciclo: pet shops, farmácias e escolas do bairro como pontos de divulgação, sem alegação de saúde (O03). Cuidado: primeira conversa com uma equipe de hospital, só se P11 estiver verde | 2 novos pontos; 1 conversa de hospital marcada |
| **D26** Sex 04/12 | **Revisão #4 (CP4)** | CP4 medido |
| **D27** Sáb 05/12 | Campo e atendimento | n/d |
| **D28** Dom 06/12 | Descanso | n/d |

### Semana 5 (D29 a D35): estabilizar e aprender (30 dias)

| Dia | Foco | Feito quando |
|---|---|---|
| **D29** Seg 07/12 | Avisos automáticos: ligar `notify-dispatch` **por e-mail** (fase 1 do I02) depois de um teste de envio. O WhatsApp automático fica para a fase 2, depois dos portões do O05 (seção 11.1) e do I02. Senão, manter o aviso manual | Decisão registrada, com o motivo |
| **D30** Ter 08/12 | Quem assinou o teste do Pro no D4 vence no D34. Ligar para quem está perto do fim do teste e perguntar o que a ferramenta fez por ele; não vender. O WhatsApp não vende nem renova o Pro (O05, seção 10) | 5 conversas registradas |
| **D31** Qua 09/12 | 10 entrevistas de 20 min com prestadores: 5 ativos e 5 inativos (por que usa ou não a agenda) | Notas das 10 |
| **D32** Qui 10/12 | 5 conversas curtas com clientes depois do serviço: voltaria a contratar por aqui? o que faltou? Sinal qualitativo, sem estatística | Notas das 5 |
| **D33** Sex 11/12 | **CP5, revisão dos 30 dias** (DECISOES, seção 7): regra dos 30% calculada das duas formas (seção 5.1). **Revisão #5** | Diagnóstico escrito: oferta, demanda ou onboarding |
| **D34** Sáb 12/12 | Campo e atendimento | n/d |
| **D35** Dom 13/12 | Descanso | n/d |

### Semana 6 (D36 a D42): prova, fechar os portões

| Dia | Foco | Feito quando |
|---|---|---|
| **D36** Seg 14/12 | Mapa de lacunas por portão (quanto falta em cada). Definir as 3 ações de maior efeito. Congelar ideias novas | 1 página |
| **D37** Ter 15/12 | Cuidado: terceira família, ou segundo plantão concluído nas duas primeiras | Plantões concluídos com relatório do dia |
| **D38** Qua 16/12 | Auditoria de dados: cada serviço pago da planilha confere com `payments` (id, valor, data); excluir testes | Diferença entre planilha e banco de até 5% `[proposta]`, ou explicada linha a linha |
| **D39** Qui 17/12 | Disputas, reembolsos e incidentes: fechar pendências com resposta ao cliente (O07) | Nenhuma pendência com mais de 7 dias |
| **D40** Sex 18/12 | **CP6 e revisão #6**: previsão de cada portão; se algum não fecha, decidir já a extensão (seção 13) | Previsão por portão |
| **D41** Sáb 19/12 | Campo e atendimento | n/d |
| **D42** Dom 20/12 | Descanso | n/d |

### Semana 7 (D43 a D45): fechamento e decisão

| Dia | Foco | Feito quando |
|---|---|---|
| **D43** Seg 21/12 | Fechar as semanas 5 e 6 (G1). Rodar o `kpis.sql` (O08). Exportar as evidências (seção 11.4) | Arquivo de evidências datado |
| **D44** Ter 22/12 | Calcular os quatro portões com as regras da seção 5.1; rever as exclusões. Memorando de uma página: resultado, causas, decisão proposta. Pedir leitura crítica de uma pessoa de confiança (advogado, contador ou mentor) | Memorando v1 |
| **D45** Qua 23/12 | **Decisão** (seção 13): continuar, corrigir, pivotar ou parar. Avisar prestadores e clientes ativos do que acontece depois. Agradecer | Decisão e próximos 30 dias escritos |

---

## 8. Rotina diária e orçamento de horas

### 8.1 Dia útil padrão (9,0 h)

| Horário | Horas | Bloco | O que fazer |
|---|---:|---|---|
| 07:30 a 08:00 | 0,5 | Abertura | `/admin` (Prestadores na fila, Disputas abertas), `/admin/pagamentos` ("Exigem atenção"), caixa do WhatsApp Business por etiqueta, planilha do dia |
| 08:00 a 09:00 | 1,0 | Janela 1 | pedidos novos, avisar prestadores, propostas em andamento |
| 09:00 a 11:30 | 2,5 | Bloco A | recrutamento, onboarding assistido ou campo, conforme a semana |
| 11:30 a 12:00 | 0,5 | Janela 2 | pedidos, propostas, retornos |
| 12:00 a 13:00 | n/d | Pausa | fora da conta |
| 13:00 a 13:30 | 0,5 | Janela 3 | pedidos, cobranças e recebimentos |
| 13:30 a 16:30 | 3,0 | Bloco B | demanda, Cuidado, análise de documentos, produto |
| 16:30 a 17:30 | 1,0 | Janela 4 e fechamento | pedidos; registro do dia nas planilhas `pedidos` e `horas`; plano de amanhã. Na sexta, a **revisão semanal** (seção 12) ocupa este bloco |
| **Total** | **9,0** | | |

### 8.2 Sábado (7,0 h) e domingo

| Horário | Horas | Bloco |
|---|---:|---|
| 08:00 a 09:00 | 1,0 | Janela 1 |
| 09:00 a 13:00 | 4,0 | Campo (conversas presenciais, cartazes, acompanhar serviço) |
| 13:00 a 14:00 | 1,0 | Janela 2 e registro |
| 14:00 a 15:00 | 1,0 | Fechar a semana e preparar a segunda |
| **Total** | **7,0** | |

Domingo sem trabalho; a resposta automática avisa que o atendimento volta na segunda. O WorkEasy não é serviço de emergência: a regra de emergência do Cuidado (O06) manda ligar 192.

**Semana-padrão = 5 × 9 + 7 = 52 h.** O planejado vai de 48 a 56 h porque noites e imprevistos somam 2 a 4 h. **60 h é teto, não meta.**

### 8.3 Janela de atendimento, interrupção e capacidade

- **Janela `[proposta]`:** segunda a sexta, 8h às 17h30; sábado, 8h às 14h. Fora dela, resposta automática, e o relógio da meta de 2 h começa na abertura seguinte. Se o registro mostrar muitos pedidos entre 17h30 e 21h, acrescente uma janela noturna de 30 min no CP3.
- **Regra de interrupção:** pedido novo (etiqueta "novo") interrompe o bloco A ou B. Em 15 min você acolhe o cliente e aciona de 3 a 5 prestadores. O relógio de 2 h conta desde o recebimento.
- **Capacidade `[estimativa]`:** cerca de 35 min por pedido, do recebimento ao pagamento (média entre uns 25 min na Trilha A e uns 45 na B). Com 15 h de concierge por semana (semana 5) cabem cerca de 26 pedidos. Se entrarem mais de 8 por dia durante 3 dias seguidos, pare de **captar** demanda (não de atender) e conserte o processo antes de seguir.

### 8.4 Horas planejadas por semana e por atividade `[estimativa]`

R recrutamento (contato, triagem, campo) · O onboarding assistido e análise de documentos · D demanda e parcerias · C concierge (pedidos, casamento, cobrança, acompanhamento) · E Cuidado · P produto e configuração · M métricas, registro e revisão · A administrativo, jurídico e finanças · B buffer.

| Semana | R | O | D | C | E | P | M | A | B | Total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 16 | 10 | 4 | 3 | 2 | 6 | 4 | 7 | 4 | **56** |
| 2 | 16 | 10 | 6 | 5 | 3 | 4 | 4 | 4 | 4 | **56** |
| 3 | 12 | 8 | 8 | 9 | 5 | 3 | 4 | 2 | 4 | **55** |
| 4 | 9 | 6 | 8 | 12 | 7 | 3 | 4 | 2 | 4 | **55** |
| 5 | 6 | 4 | 7 | 15 | 7 | 3 | 5 | 2 | 4 | **53** |
| 6 | 4 | 3 | 6 | 14 | 7 | 2 | 6 | 2 | 4 | **48** |
| 7 (3 dias) | 1 | 1 | 1 | 8 | 4 | 1 | 6 | 2 | 2 | **26** |
| **Total** | **64** | **42** | **40** | **66** | **35** | **22** | **33** | **21** | **26** | **349** |

Conferências `[estimativa]`: recrutamento mais onboarding somam 106 h, cerca de 2,1 h por prestador aprovado (contato, triagem, cadastro assistido, análise de documentos e ativação). Concierge soma 66 h; a 35 min por pedido dão cerca de 113 pedidos, na ordem dos 105 do ritmo (seção 5.3). Nenhuma semana planeja mais de 56 h: a sobra até 60 h é a margem para erro de estimativa.

### 8.5 Como controlar o teto de 60 h

1. Registre as horas todo dia na planilha `horas` (categoria e tempo), no fechamento das 16:30.
2. A revisão de sexta mostra o total da semana. Acima de 60 h numa semana: na seguinte, corte um item da ordem da seção 13.5.
3. Acima de 60 h em duas semanas seguidas: aplique o corte inteiro da seção 13.5 e registre a decisão.
4. Horas de clínica, se houver, entram no total (seção 1.1).

---

## 9. Construir ou fazer à mão

Princípio: **nos 45 dias você não programa dentro das janelas de atendimento.** As horas de produto somam 22 (seção 8.4) e só cabem itens pequenos. Item médio ou grande só entra se outra pessoa construir. Esforço `[estimativa]`: **S** até 1 dia, **M** de 2 a 4 dias, **L** mais de uma semana.

| Necessidade | Fazer à mão (agora) | Construir? | Quando | Esforço | Estado hoje no produto |
|---|---|---|---|:-:|---|
| Entrada pelo WhatsApp | Número em cartaz, QR e locais autorizados; saudação e ausência | Mostrar o link do WhatsApp também com backend ligado | Semana 0 | S | Sem backend, `/pedido` abre o WhatsApp com a mensagem pronta; com backend, o app não mostra o número (`pages/cliente/Pedido.tsx`) `[PLANEJADO]` |
| Avisar prestadores de pedido novo | Mensagem 1:1 no WhatsApp Business para 3 a 5 aptos | Modelo `pedido_novo`, gatilho e envio | Só se o CP3 mostrar proposta lenta por falta de aviso, e depois dos portões do O05 | M | Só existem 6 modelos e nenhum é de pedido novo; o prestador só vê o pedido ao abrir `/pro/pedidos` `[PLANEJADO]` |
| Registrar pedidos vindos do WhatsApp | Planilha `pedidos` | Formulário no admin gravando em tabela própria | Só com mais de 10 pedidos por dia, ou erro de registro acima de 5% `[proposta]` | M | Não existe `[PLANEJADO]` |
| Manter o pedido dentro do piloto | Responder "ainda não atendemos esse bairro", anotar e oferecer lista de espera à mão | Filtro de distritos em `/pedido` e lista de espera | Se mais de 20% dos pedidos vierem de fora `[proposta]` | S ou M | `/pedido` oferece os 96 distritos `[PLANEJADO]` |
| Casamento entre pedido e prestador | Você escolhe de 3 a 5 por pedido (cobertura, seção 4) | Não construir | n/d | n/d | O banco aceita até 3 propostas por pedido e só de prestador apto |
| Lembrete 24 h antes | Mensagem manual no dia anterior | Ligar `notify-dispatch` por e-mail (fase 1 do I02); WhatsApp automático só na fase 2, com modelos aprovados | Semana 5, depois de um teste de envio | S, de configuração | O gatilho existe; sem credencial a fila vira `skipped`; nada foi testado de verdade |
| Cobrança | Trilha B (`/pro/orcamentos` e `/pro/cobrancas`) e Trilha A (`/atendimentos/:id`) | Nada | n/d | n/d | Existe; testado só contra banco local |
| Aprovar prestadores | `/admin/prestadores` e `/admin/prestadores/:id` | Nada | n/d | n/d | Existe |
| Métricas | `/admin` (contagens por situação), planilhas e `kpis.sql` (O08) | Painel de tempo de resposta e de agenda no admin | Depois do D45 | L | `admin_metrics` conta por entidade e situação, na semana, no mês e no total; não mede tempo nem agenda `[PLANEJADO]` |
| Cuidado: plantão em nome da família | O responsável cria conta e plantão com você ao telefone | Admin cria plantão em nome da família | Se 2 ou mais famílias não conseguirem usar o app | M | Só o dono da casa insere em `shifts` (política `shifts_insert_own`); o admin lê e oferece `[PLANEJADO]` |
| Cuidado: valor da família diferente do repasse; cobrança e repasse | Fora do app, com contador e advogado `[CONDICIONAL: depende de parecer]` | Modelar tarifa, repasse e pagamento de plantão | Depois do parecer; fora dos 45 dias | L | `createShift` grava o mesmo valor em `rate_cents` e `caregiver_payout_cents`; nenhum pagamento da plataforma se liga a plantão `[PLANEJADO]` |
| Menu "Cuidado" | Convidar famílias por link direto | Esconder o item para quem não foi convidado | Semana 0 | S | O item aparece para todo cliente logado (`components/navItems.ts`); DECISOES, seção 5, manda não divulgar |
| Links para `/register-provider` | Mandar sempre `[SITE]/pro/cadastro` | Trocar os 3 links | Semana 0 | S | Levam à página de demonstração (seção 2, P14) |
| Avaliações | Pergunta única depois do serviço (seção 11) | Não construir | n/d | n/d | Avaliação só existe para atendimento de origem plataforma pago pelo app: a Trilha B não gera avaliação pública |
| Ordem da busca pública | A busca não é canal no piloto; o casamento é manual | Corrigir a ordem | Depois do D45 | S | Com `rating_ranking` e menos de 3 avaliações, a busca ordena por nome (`search_providers`) `[PLANEJADO]` |
| Lojas, SEO por bairro, assistente de IA, comissão, pagamento retido | Nada | Nada nos 45 dias | n/d | n/d | Seção 1.2 |

---

## 10. Fluxos mínimos

Esta seção só fixa o caminho e onde o relógio de 2 h começa e para. Os passos detalhados, os modelos de mensagem e os ramos de falha (ninguém responde, cliente some, prestador não aparece, disputa de preço, pagamento não reconhecido) estão no O04, no O05 e no O07.

### 10.1 Trilha A: pedido no app

1. O cliente entra em `/pedido` (login por código, aceite de Termos e Privacidade) e descreve serviço, distrito, o que precisa e quando (de 10 a 2.000 caracteres). **Relógio começa:** `requests.created_at`.
2. O pedido fica `open` por 7 dias. Prestadores aprovados na ocupação e no distrito o veem em `/pro/pedidos`; **não são avisados** `[PLANEJADO]`.
3. Você avisa de 3 a 5 prestadores por WhatsApp Business.
4. O prestador envia proposta (preço em reais, mensagem, validade). O banco aceita até 3 por pedido e recusa quem não é apto. **Relógio para:** `proposals.created_at` da primeira proposta qualificada.
5. O cliente aceita (`accept_proposal`): nasce o atendimento `accepted` e o cliente passa a ver o contato do prestador.
6. O cliente paga em `/atendimentos/:id` (Pix com QR e copia-e-cola, ou fatura para cartão e boleto). Pede nome no perfil e CPF ou CNPJ no primeiro pagamento. O dinheiro entra na conta Asaas da plataforma e é dividido para a carteira do prestador, que precisa ter feito "Ativar recebimento". **Esta etapa usa o fluxo de split `[CONDICIONAL: depende de parecer]` (Q1).**
7. O atendimento segue `paid`, `in_progress`, `completed`. O cliente pode avaliar (só atendimento de origem plataforma, pago pelo app).

### 10.2 Trilha B: WhatsApp, orçamento e cobrança pela conta do prestador

1. O cliente escreve no WhatsApp Business. Você qualifica (serviço, distrito, o quê, quando, urgência) e confere se está no escopo. **Relógio começa:** mensagem completa, ou abertura da janela.
2. Você escolhe de 3 a 5 prestadores aptos e pergunta preço e horário, um a um.
3. Você confere a resposta (preço em reais e quando pode ir) e a entrega ao cliente. **Relógio para.**
4. O prestador emite o orçamento em `/pro/orcamentos` e envia o link público `/orcamento/:token` (botão "Abrir no WhatsApp"). O cliente aceita **sem criar conta**.
5. O prestador cria a cobrança em `/pro/cobrancas` (exige plano Pro, que o teste de 30 dias dá, e recebimento ativo; pede o CPF ou CNPJ do cliente). Pix com QR e copia-e-cola, ou link de fatura. O dinheiro cai na conta Asaas do prestador, sem taxa do WorkEasy e sem split.
6. O webhook registra o pagamento em `payments`. Depois do serviço, faça ao cliente a pergunta única (seção 11).

**Por que a Trilha B vem primeiro:** o cliente não precisa de login, o dinheiro não passa pela conta da plataforma e é o caminho de menor exposição enquanto Q1 não for respondida `[CONDICIONAL: depende de parecer]`. **O custo:** não nascem `requests` nem `proposals`, então o G3 dessa trilha vive na planilha, e não há avaliação pública.

### 10.3 Trilha C: Cuidado, gerido

1. A família entra por convite (O03). O responsável cria a conta e aceita os termos; você explica o que o app guarda e o que não guarda (nenhum dado de saúde).
2. O responsável cria a casa, o assistido (primeiro nome, ano de nascimento, preferências, contato de emergência) e o plantão (até 24 h, valor combinado).
3. Você oferece o plantão a até 10 cuidadores aprovados (`offer_shift`). O primeiro que aceita leva; os demais expiram. A trava de 2 dias por semana na mesma casa vale.
4. O cuidador faz check-in e check-out (janela de 2 h para cada lado do horário) e envia o relatório do dia (refeições, atividades, humor e notas; não clínico).
5. A família lê o relatório. **Cobrança da família e repasse ao cuidador ficam fora do app** `[CONDICIONAL: depende de parecer]`.
6. Se o cuidador cancelar, o plantão volta a `open` e é reoferecido (processo e garantia de cobertura no O06).

### 10.4 Regras comuns

- **Dinheiro só pelo Asaas.** Peça o pagamento pelo link e diga a verdade: "estamos em fase de testes e pagar pelo link nos ajuda a validar". Nunca receba na sua conta.
- **Contato.** O app só mostra o telefone do prestador ao cliente depois que o atendimento é aceito, e o do cliente ao prestador depois do aceite da proposta ou do agendamento direto; a proposta sozinha não compartilha contato (e o formulário pede para não escrever telefone na mensagem). Não adiante contato por fora.
- **Vazamento sem tática hostil.** Facilite o link, o lembrete e o histórico na agenda; meça a parcela paga no app. Com a comissão desligada, vazamento não custa receita: ele só mede se o app serve.
- **Preço é do prestador.** Você repassa o que ele cobra e não tabela.

---

## 11. O que medir desde o dia 1

Regra: **registre no mesmo dia.** As fontes são três: o banco (`/admin` agora, `kpis.sql` do O08), as planilhas e as etiquetas do WhatsApp Business. As fórmulas finais, as consultas SQL e as faixas de cada indicador estão no [O08](08-metricas-e-portoes.md) (com o arquivo `kpis.sql` na mesma pasta); aqui está só o que precisa ser registrado desde o primeiro dia para que ele funcione.

### 11.1 Indicadores e de onde vêm

| Indicador | Definição curta | Fonte | Cadência |
|---|---|---|---|
| Serviços concluídos e pagos no app | G2 (seção 5.1) | banco | semanal |
| Prestadores ativos na semana | G1 (seção 5.1) | banco | semanal |
| Liquidez por categoria e distrito | G3 (seção 5.1) | banco e planilha `pedidos` | log diário; leitura semanal |
| Parcela paga no app (indício de vazamento) | serviços pagos no app ÷ serviços concluídos | planilha e banco | semanal |
| Funil de prestadores | seção 5.2 | planilha `prestadores` e banco | semanal |
| Cuidado | G4, plantões concluídos, cancelamentos e cobertura | banco e planilha `cuidado` | semanal |
| Incidentes e violações de regra (meta: zero violação) | contagem com gravidade; violação = promessa proibida, documento fora do app, dinheiro fora do Asaas | planilha e `audit_log` | semanal |
| Disputas | atendimentos `disputed` e `/admin/disputas`; a meta de menos de 10% de DECISOES, seção 4, é do portão da comissão e fica fora da Fase 1 | banco | semanal |
| Teste e conversão do Pro | testes iniciados, terminados, pagos (primeiros fins de teste em D34) | banco (`subscriptions`) | semanal |
| Custo por prestador aprovado e por serviço pago | (gastos + horas × valor da sua hora) ÷ quantidade | planilhas `dinheiro` e `horas` | cálculo único no D45 `[estimativa]` |
| Horas do fundador | por categoria (R, O, D, C, E, P, M, A, B) | planilha `horas` | diária e semanal; teto 60 h |
| Pergunta única pós-serviço | "Voltaria a contratar por aqui? (sim ou não) e uma frase" | planilha `pedidos` | por serviço; sinal qualitativo |

### 11.2 Planilhas e campos mínimos

Sem nome nem telefone nas planilhas de pedidos e de Cuidado: use códigos; o contato fica só no WhatsApp Business. A planilha `prestadores` segue o O02 (seção 13), com `categoria`, `ocupacao_slug`, `canal_origem` e as datas de cada etapa; acrescente aqui `distrito_onde_mora`, `distritos_atendidos`, `agenda_ativa_em` e `recebimento_ativo_em`.

| Planilha | Campos mínimos |
|---|---|
| `pedidos` (um por pedido) | `id` · `canal` (app, whatsapp, indicacao, outro) · `trilha` (A ou B) · `recebido_em` · `dentro_da_janela` (s ou n) · `relogio_inicio` · `valido` (s ou n) · `motivo_invalido` · `categoria` · `ocupacao` (slug) · `distrito` (slug) · `urgente` · `prestadores_acionados` (n) · `primeira_resposta_em` (sua resposta ao cliente) · `primeira_proposta_qualificada_em` · `propostas_qualificadas` (n) · `aceito_em` · `pago_em` · `valor_reais` · `prestador` (código) · `cliente` (código) · `resultado` (pago, aceito, perdido, cancelado, ensaio) · `motivo_perda` · `voltaria` (s, n ou vazio) · `observacoes` (sem dado de saúde) |
| `cuidado` (uma por família) | `familia` (código) · `origem_do_convite` · `intake_em` · `cuidadores_candidatos` (n) · `primeiro_plantao_em` · `plantoes_concluidos` (n) · `relatorios_enviados` (n) · `dentro_do_app` (s ou n) · `incidentes` (n e gravidade) · `cobranca_fora_do_app` (valor e data) · `repasse` (valor e data) · `observacoes` (sem dado de saúde) |
| `horas` | `data` · `categoria` (R, O, D, C, E, P, M, A, B) · `horas` |
| `dinheiro` | `data` · `item` · `linha_do_orcamento` (seção 14) · `valor_reais` · `comprovante` |
| `contas_de_teste` | `identificador` · `papel` (cliente, prestador, admin) · `criado_em` · `motivo` |

### 11.3 Disciplina de dados

1. Marque toda conta de teste em `contas_de_teste` no dia em que criar. O `kpis.sql` (O08) precisa excluí-las por essa lista; se não excluir, subtraia à mão.
2. Ensaio e pedido de teste levam `resultado = ensaio` e ficam fora de G2 e G3.
3. Toda semana, reconcilie planilha e banco (pedidos, pagos, aprovados). Diferença acima de 5% `[proposta]` pede explicação linha a linha.
4. Nunca copie documento de prestador nem dado de saúde para planilha ou conversa.

### 11.4 Evidências do D45

Guarde numa pasta privada, **fora do repositório** (há dado pessoal): saída do `kpis.sql` em CSV; exportação das planilhas; lista de `payments.id` contados no G2; lista de `shifts.id` e `daily_reports.id` do G4; capturas de `/admin`; as 6 revisões semanais; a lista de exclusões com o motivo de cada uma; o memorando de decisão. No repositório entram só números agregados.

---

## 12. Revisão semanal (modelo)

Toda sexta, 60 minutos, no último bloco do dia (a de D11 é na quinta). **Uma única alavanca por semana.** Copie o modelo abaixo.

```markdown
# Revisão semanal nº __ (semana de __/__ a __/__; D__ a D__)

## 1. Horas (teto 60 h)
| Categoria | Planejado | Real |
|---|---:|---:|
| R recrutamento | | |
| O onboarding e documentos | | |
| D demanda e parcerias | | |
| C concierge | | |
| E Cuidado | | |
| P produto e configuração | | |
| M métricas e revisão | | |
| A administrativo e jurídico | | |
| B buffer | | |
| **Total** | | |
Passou de 60 h? ( ) não ( ) sim. Se sim, o que corto na próxima semana: ____

## 2. Portões e ritmo
| Indicador | Valor | Ritmo deste CP | Vermelho abaixo de | Semáforo |
|---|---:|---:|---:|---|
| Cadastros enviados (acum.) | | | | |
| Aprovados (acum.) | | | | |
| Ativos na agenda (na semana) | | | | |
| Pedidos válidos (acum.) | | | | |
| Pedidos com proposta qualificada em 2 h (%) | | | | |
| Serviços pagos (acum.) | | | | |
| Famílias com plantão concluído | | | | |

## 3. Funil de prestadores (semana / acumulado)
contatados · responderam · triagem · onboarded · aprovados · agenda ativa · recebimento ativo · 1ª proposta · 1º pago
Taxas por etapa e canal que mais rendeu: ____

## 4. Liquidez por categoria e distrito
| Categoria | Distrito | Pedidos válidos | Com proposta em 2 h | % | Mediana (min) |
|---|---|---:|---:|---:|---:|

## 5. Dinheiro
Serviços pagos (n e R$): ___  Parcela paga no app: ___%  Reembolsos: ___  Disputas abertas/resolvidas: ___/___
Gasto da semana: R$ ___  Acumulado: R$ ___  Orçamento do período: R$ ___

## 6. Cuidado
Famílias: ___  Plantões marcados/concluídos/cancelados: ___/___/___  Relatórios enviados: ___  Incidentes: ___

## 7. Qualidade e incidentes
(lista curta; gravidade; o que mudou no processo)

## 8. O que aprendi (3 itens, cada um com a evidência)
1.
2.
3.

## 9. Decisão desta semana
Alavanca única: ____
Regra aplicada (seção 13): ( ) continuar ( ) corrigir ( ) pivotar ( ) parar
O que deixo de fazer: ____

## 10. Próxima semana
3 objetivos: ____ / ____ / ____    Horas previstas: ___

## 11. Riscos (seção 15) que mudaram de nota
```

---

## 13. Regras de continuar, corrigir, pivotar e parar

As metas dos portões vêm do plano; as faixas abaixo são `[proposta]`, escritas antes de ver qualquer resultado para que a decisão não dependa do humor do dia 45.

### 13.1 Semáforo semanal

| Cor | Regra | O que fazer |
|---|---|---|
| Verde | no ritmo da tabela 5.3 ou acima | seguir |
| Amarelo | de 70% a 99% do ritmo | escolher **uma** alavanca para a semana |
| Vermelho | abaixo de 70% do ritmo | aplicar a alavanca da linha do CP (13.2); no mesmo indicador, 2 semanas seguidas em vermelho pedem mudar a **causa** (canal, categoria ou processo), não o esforço |

### 13.2 O que cada checkpoint decide

| CP | Pergunta | Se vermelho |
|---|---|---|
| CP1 (D5) | O ciclo completo funciona com dinheiro de verdade? | Pare o recrutamento novo e conserte; o relógio pausa só para o portão afetado, no máximo 14 dias |
| CP2 (D11) | A oferta anda? (12 aprovados; taxa de contato até aprovado acima de 8%, o cenário de canal frio da seção 5.2; 2 ou mais com recebimento ativo) | Troque de canal (O02, seção 4). Recebimento travado na conta Asaas: registre o caso e escale (I01). Sem P11 verde, o G4 passa a "não testado" |
| CP3 (D19) | A demanda chega e as 2 h são possíveis? (22 pedidos; 50% ou mais em 2 h) | Demanda baixa: canais do plano B do O03. Proposta lenta: acionar 5 em vez de 3, encurtar a janela, trocar quem responde devagar, rever o aviso automático (seção 9) |
| CP4 (D26) | Há densidade e hábito? (22 ativos na agenda; 9 serviços pagos; família 1 concluída) | Campanha de ativação; trocar vagas de reparos por profissões de agenda recorrente; revisar a escala do Cuidado |
| CP5 (D33) | Regra dos 30% de DECISOES, seção 7: se menos de 30% dos aprovados deram resposta qualificada, o problema é demanda ou onboarding, **não preço** | Não mexa em preço, teste de 30 dias nem limite de propostas; ache a causa (oferta sem pedido ou pedido sem resposta) |
| CP6 (D40) | Os quatro portões fecham até o D45? | Para o que não fecha, decida já a extensão (13.3) |

### 13.3 Decisão do D45

Defina **g** = número de portões verdes (um portão "não testado" por falta de P11 sai da conta) e **m** = o menor percentual da meta entre os portões que não ficaram verdes (G1: prestadores ÷ 30; G2: serviços ÷ 20; G3: percentual ÷ 70%; G4: famílias ÷ 3).

| Decisão | Regra `[proposta]` | O que fazer |
|---|---|---|
| **Continuar** | g = 4 | Fase seguinte do plano (fora deste documento): segundo conjunto de distritos ou novas categorias. Comissão e pagamento retido seguem desligados até os portões de DECISOES, seção 4 |
| **Corrigir** (uma vez, até 15 dias, uma única alavanca) | g ≥ 2 **e** m ≥ 50% (G1 ≥ 15; G2 ≥ 10; G3 ≥ 35%; G4 ≥ 2 famílias) | Defina a alavanca no D45; nenhum escopo novo; ao fim, reavalie com a mesma regra; se ainda falhar, pivotar ou parar |
| **Pivotar** | g ≤ 1 **ou** m < 50% | Mude **uma** variável estrutural (conjunto de distritos, mistura de categorias, canal ou modelo) e rode um ciclo de 30 dias com os mesmos portões |
| **Parar ou hibernar** | a regra de pivotar **e** vermelho nas últimas 3 revisões **e** nenhuma hipótese testável dentro do orçamento; ou um gatilho imediato (13.4) | Pare de captar; atenda quem já está no app; preserve dados e caixa; releia em 30 dias e decida por escrito |

### 13.4 Gatilhos imediatos de parar, a qualquer momento

1. **Incidente com dano físico ou conduta grave** em qualquer serviço: suspender o prestador em `/admin/prestadores/:id` (o motivo é obrigatório) e a linha afetada; seguir L08 e O06; avisar advogado e seguradora.
2. **Divergência de dinheiro** (cobrança em duplicidade, split divergente, valor errado): pausar o fluxo afetado (I04 diz como desligar função ou chave) até entender a causa.
3. **Acesso indevido a documentos:** plano de incidente (L08) e comunicação conforme o advogado `[CONDICIONAL: depende de parecer]`.
4. **Notificação formal** de conselho, autoridade ou órgão de defesa do consumidor: pausar a categoria envolvida e consultar o advogado `[CONDICIONAL: depende de parecer]`.
5. **Gasto acima de 120% do orçamento** da seção 14: congelar gastos opcionais `[proposta]`.
6. **Mais de 60 h por semana em 2 semanas seguidas:** corte de escopo (13.5).

### 13.5 Ordem de corte quando as horas passam de 60 `[proposta]`

Corte nesta ordem, parando quando as horas voltarem ao teto: (1) recrutamento fora do mínimo (beleza e aulas; depois reparos acima de 8); (2) campo presencial, trocado por conversa remota; (3) entrevistas dos dias D31 e D32, pela metade; (4) Cuidado: parar em 2 famílias e registrar o G4 como não testado nesta rodada; (5) novos pontos de divulgação. **Nunca cortar:** análise de documentos de quem já se cadastrou, janela de atendimento dos pedidos em curso, conferência de pagamentos, tratamento de incidente e o registro do dia.

---

## 14. Orçamento

Reais por item, em faixa. Tudo `[estimativa]`, exceto onde há `[fonte]`. Cobre a Semana 0 e os 45 dias (cerca de 2,5 meses, 3 faturas mensais). Câmbio usado: **US$ 1 = R$ 5,0383**, PTAX de venda de 22/10/2026 [F12].

### 14.1 Caixa operacional

| # | Item | Base de cálculo | Faixa (R$) | Rótulo |
|---|---|---|---:|---|
| A1 | Supabase Pro | US$ 25 por mês × 3 faturas × 5,04. O plano inclui US$ 10 de crédito de computação (cobre uma instância Micro). O Free pausa o projeto após 1 semana sem uso e limita a 2 projetos ativos [F6] | 378 a 450 | fonte e cálculo; a faixa alta inclui câmbio e tributos do cartão |
| A2 | Domínio .com.br | 1 ano | 40 a 100 | estimativa; não abri o preço (o Registro.br exige JavaScript) |
| A3 | Hospedagem do site (PWA) | provedor ainda não escolhido | 0 a 300 | incerto (seção 16) |
| A4 | E-mail (Resend) | Free: US$ 0, 3.000 e-mails por mês e 100 por dia. Pro: US$ 20 por mês (R$ 101) [F11]. O login por código também usa e-mail | 0 a 302 | fonte |
| A5 | Número dedicado do WhatsApp Business | chip R$ 15 a 40 e recarga R$ 30 a 60 por mês × 3. O app é gratuito [F10]. Aparelho não incluído | 105 a 220 | estimativa |
| A6 | WhatsApp Cloud API (só se ligar os avisos automáticos) | até 1.500 mensagens de utilidade × R$ 0,035 (tarifa do Brasil em reais, vigente desde 01/10/2026; marketing R$ 0,3217) [F9] | 0 a 53 | fonte e premissa de volume; base: desligado |
| A7 | Tarifas do Asaas pagas pelo WorkEasy | até 30 mensalidades Pro × R$ 1,99 (Pix ou boleto; a página mostra promoção de R$ 0,99 por 3 meses) [F7]. Nas cobranças de serviço a tarifa é descontada de quem recebe (ARQUITETURA, "Split": o split é percentual do valor líquido) | 0 a 60 | fonte e premissa de volume |
| **A** | **Subtotal recorrentes** | | **523 a 1.485** | |
| B1 | Material impresso (cartaz, cartão, QR) | 500 a 1.000 unidades × R$ 0,15 a 0,50 | 75 a 500 | estimativa |
| B2 | Deslocamento | 20 a 28 dias de campo × R$ 25 a 60 | 500 a 1.680 | estimativa |
| B3 | Cafés e reuniões | 10 a 25 encontros × R$ 15 a 25 | 150 a 625 | estimativa |
| **B** | **Subtotal campo** | | **725 a 2.805** | |
| C | Contingência | 15% (faixa baixa) a 20% (faixa alta) sobre A e B | 187 a 858 | estimativa |
| **A+B+C** | **Caixa operacional** | | **1.435 a 5.148** | |

### 14.2 Estruturação, à parte (pré-requisitos, não gasto dos 45 dias)

| # | Item | Faixa (R$) | Rótulo |
|---|---|---:|---|
| D1 | Advogado: pareceres Q1, Q4, Q5 e Q7 e revisão dos termos | 4.000 a 20.000 | incerto; sem cotação. Peça escopo fechado a 3 escritórios |
| D2 | Contador, abertura da pessoa jurídica e 3 primeiros meses | 1.000 a 5.000 | incerto; sem cotação |
| D3 | Seguro de responsabilidade civil (Cuidado) | cotação gratuita; prêmio a cotar | incerto; não estimado |
| D4 | Contas Apple e Google | fora dos 45 dias (S01 e S02); o README cita US$ 99 por ano e US$ 25 uma vez, que não reabri | n/d |

### 14.3 Seu tempo

349 h planejadas (seção 8.4) × valor da sua hora. O O09 reserva a célula "renda clínica por hora (C)" para você preencher. Custo de oportunidade dos 45 dias = 349 × C: **C = ____**.

### 14.4 Leitura da conta

- **Receita nos 45 dias: pequena e incerta.** O teste de 30 dias adia a primeira mensalidade: quem assinou o Pro no D4 paga a primeira no D34, e só quem assinou até o D15 chega ao fim do teste antes do D45. O plano não conta com essa receita para fechar a conta `[estimativa]`; as 30 mensalidades de A7 são um teto de custo, não uma previsão.
- O caixa operacional é pequeno perto dos itens D e do valor da sua hora. O que decide se o caixa aguenta é o jurídico e a abertura da empresa.
- Fora do orçamento: prêmio de seguro, tarifas do Asaas cobradas dos prestadores e dos clientes, tributos sobre receita futura, remuneração do fundador.

---

## 15. Registro de riscos

P = probabilidade e I = impacto, em B (baixa), M (média) ou A (alta), por juízo meu `[estimativa]`. Revise a coluna P e I em toda revisão semanal.

| # | Risco | P | I | Sinal precoce | Resposta | Quem |
|---|---|:-:|:-:|---|---|---|
| R1 | Split pela conta da plataforma (Trilha A) com dinheiro real antes do parecer | M | A | Primeira cobrança pela Trilha A sem resposta de Q1 | Trilha B primeiro; Trilha A só com clientes conhecidos e valores baixos até o parecer; decisão registrada | Dono e advogado `[CONDICIONAL: depende de parecer]` |
| R2 | Cuidado: vínculo trabalhista e responsabilidade civil (LC 150/2015 e idosos, citados em DECISOES, seção 5) | M | A | Cuidador com mais de 2 dias por semana na mesma casa; família tratando o cuidador como empregado; qualquer incidente | Sem plantão pago antes de P11; trava de 2 dias no banco; termos revisados; seguro; alternativa de contratação direta pela família no O06 | Dono e advogado trabalhista `[CONDICIONAL: depende de parecer]` |
| R3 | Dinheiro do Cuidado fora do app, sem modelagem fiscal | M | A | Primeira cobrança de plantão | Definir com contador e advogado antes; nunca usar conta pessoal; registrar cada valor em `dinheiro` e `cuidado` | Dono e contador `[CONDICIONAL: depende de parecer]` |
| R4 | Regras de divulgação e captação dos conselhos | M | M | Prestador pede "garantia de clientes" ou ranking; reclamação de conselho | Vender a ferramenta, não clientes; sem ranking onde `rating_ranking = false`; sem depoimento; seguir a matriz da Frente A | Dono e Frente A `[CONDICIONAL: depende de parecer]` |
| R5 | O produto nunca rodou em produção (Asaas, WhatsApp, Resend, login) | A | A | Falha no ensaio da Semana 0; código de login não chega; webhook com erro | Semana 0 com o plano de testes do I01 e os runbooks do I04; pausa do relógio; plano B manual (cobrar no painel do Asaas, avisar à mão) | Dono |
| R6 | Login por código trava quem não usa e-mail no celular | M | A | Mais de 20% dos cadastros iniciados param no login `[proposta]` | Onboarding assistido, lado a lado; criar ou recuperar o e-mail no celular; SMS só depois do I02 | Dono |
| R7 | Oferta sem demanda: aprovados que nunca recebem pedido saem | A | M | Menos de 30% dos aprovados com resposta qualificada no CP5 | Freio de oferta (seção 4); dar a cada aprovado uma tarefa de agenda; priorizar demanda | Dono |
| R8 | Demanda sem oferta: pedido sem proposta em 2 h | M | A | Abaixo de 35% no CP3 | Reserva de 3 a 5 prestadores por categoria; acionar 5 em vez de 3; encurtar a janela; recusar o que está fora do escopo | Dono |
| R9 | Vazamento: cliente e prestador combinam por fora depois do 1º serviço | A | M | A parcela paga no app cai; prestador pede o telefone cedo | Sem tática hostil: link fácil, lembretes e histórico na agenda; medir. Com a comissão desligada, vazamento não custa receita | Dono |
| R10 | Sobrecarga ou indisponibilidade do fundador | A | A | Mais de 60 h por 2 semanas; respostas fora da janela | Janela fixa, resposta automática, ordem de corte (13.5), pausa do relógio, uma pessoa de confiança para avisar clientes em caso de ausência | Dono |
| R11 | Incidente de segurança com pessoa (furto, acidente, conduta imprópria, idoso) | B | A | Qualquer relato | Antecedentes e documentos conferidos antes de aprovar; seguro cotado; protocolo de emergência e incidente (O06, L08); suspender com motivo; guardar evidências do `audit_log` | Dono e advogado |
| R12 | Fraude: conta falsa, documento adulterado, teste inflando portão | M | M | Selfie não confere; o mesmo documento em duas contas; pagamentos de teste | Revisão manual do documento; lista de contas de teste; regras de integridade do G2 | Dono |
| R13 | LGPD: documento, endereço e dados de família por WhatsApp | M | A | Foto de RG no WhatsApp; dado de saúde em texto livre | Documento só no app (espaço privado); minimizar; avisar no onboarding; apagar prints; RIPD (L06). O app já recusa dado de saúde no texto livre do Cuidado | Dono e advogado `[CONDICIONAL: depende de parecer]` |
| R14 | Número de WhatsApp restringido por mensagem sem consentimento ou em massa | M | A | Bloqueios e denúncias | Só falar com quem pediu ou consentiu; sem lista comprada; volume gradual; respeitar "SAIR"; número dedicado (não o do consultório); regras do O02 (12.3) e do O05 (seção 10). Se ligar a API, use um número exclusivo, diferente do número do concierge (I02, fase 2) | Dono |
| R15 | Estouro de caixa por custos jurídicos e contábeis | M | M | Cotações acima da seção 14 | Escopo fechado; priorizar Q1, Q4, Q5 e Q7; adiar o que não bloqueia | Dono |
| R16 | Reputação: má primeira experiência de pessoas reais | M | A | Reclamação; cliente sem retorno | Piloto pequeno; acompanhamento pessoal dos primeiros 20 serviços; dizer que é fase de testes; reembolso rápido; zero promessa de prazo | Dono |
| R17 | Conflito de interesse com o consultório | B | A | Qualquer uso de lista ou indicação a paciente | Proibir o uso de dados; empresa separada; consultar o advogado antes de indicar | Dono `[CONDICIONAL: depende de parecer]` |
| R18 | Medição enviesada: planilha incompleta, portão inflado | M | M | Diferença entre planilha e banco acima de 5% | Reconciliar toda semana; regras de exclusão; auditoria no D38 | Dono |
| R19 | Feriados e fim de ano distorcem o ritmo | A | B | Semana com feriado abaixo do ritmo | Marcar feriados; comparar semanas cheias; estender a janela se necessário | Dono |
| R20 | Dependência de terceiros: aprovação do Asaas para subcontas, aprovação de modelos da Meta | M | M | Subcontas pendentes; modelos recusados | Ativar cedo; acompanhar `provider_payment_accounts.status`; plano B manual; e-mail como canal de reserva | Dono |

---

## 16. Lacunas do produto e pendências

### 16.1 Lacunas do produto encontradas (não corrigidas aqui)

Complementam as do O02 (seção 14.2) e do O05 (seção 11.4).

1. **WhatsApp sem porta de entrada no app com backend ligado.** `VITE_CONCIERGE_WHATSAPP` só é usada quando não há backend; com backend, `/pedido` exige login por código (`pages/cliente/Pedido.tsx`, `config/features.ts`).
2. **Nenhum aviso de pedido novo ao prestador.** Só existem 6 modelos de notificação; o prestador só vê o pedido ao abrir `/pro/pedidos`. A meta de 2 h depende, hoje, do seu aviso manual.
3. **`/pedido` oferece os 96 distritos,** sem filtro do piloto nem lista de espera.
4. **Cuidado: o admin não cria plantão por uma família.** A inserção em `shifts` é só do dono da casa (`shifts_insert_own`).
5. **Cuidado: a margem do plano não existe no app.** `createShift` grava o mesmo valor em `rate_cents` e `caregiver_payout_cents`, e nenhum pagamento se liga a plantão.
6. **O item "Cuidado" aparece no menu de todo cliente logado** (`components/navItems.ts`), contra DECISOES, seção 5.
7. **Três links levam a `/register-provider`,** página de demonstração que não guarda nada (`AppShell.tsx`, `pages/OccupationPage.tsx`, `pages/conta/Conta.tsx`; mesmo achado do O02).
8. **O painel `/admin` não mede tempo de resposta nem uso da agenda:** `admin_metrics` só conta por entidade e situação.
9. **A busca ordena por nome** quando `rating_ranking` é verdadeiro e o prestador tem menos de 3 avaliações (`search_providers`): quem começa com "A" aparece primeiro.
10. **A Trilha B não gera avaliação pública:** o banco só aceita avaliação de atendimento de origem plataforma, pago pelo app.
11. **A regra dos 30% (DECISOES, seção 7) conta propostas no app** e subestima o concierge, em que a resposta sai por WhatsApp.
12. **"Ativar recebimento" pede cerca de 10 campos obrigatórios** (nome, e-mail, CPF ou CNPJ, nascimento ou tipo de empresa, celular, renda mensal, CEP, endereço, número, bairro): atrito no cadastro assistido.
13. **O pagador precisa informar CPF ou CNPJ** nas duas rotas de cobrança (`payments-create` no primeiro pagamento; `charges-create` sempre): na Trilha B é o prestador quem digita esse dado do cliente.
14. **Hospedagem do site (PWA) não tem documento no plano.**
15. **Dependências de política:** `cuidador-de-idosos` e toda a área `eletricista` (0 de 42) estão `a_confirmar`.

### 16.2 Pontos para o advogado e para o contador

1. **Q1, Q4, Q5 e Q7** de `docs/DECISOES.md`, seção 8, nesta ordem de urgência para o plano: Q1 (libera a Trilha A), Q4 (libera o Cuidado), Q5 (libera a coleta de documentos) e Q7 (libera o teste de 30 dias com cobrança automática).
2. **Fluxo do dinheiro do plantão** (família, empresa, cuidador): modelo contratual e tributário, emissão de nota e retenções `[CONDICIONAL: depende de parecer]`.
3. **Conflito de interesse** do médico-fundador ao divulgar o WorkEasy, recrutar famílias e indicar a pacientes, mesmo com empresa separada.
4. **Captação e divulgação por conselho** para as profissões do mix (Frente A): o que a ferramenta pode dizer sobre agenda, cobrança e página própria.
5. **Guarda das planilhas** com dados de contato (prazo e eliminação) e base legal do primeiro contato (O02, seção 14.1).

### 16.3 O que não verifiquei

- O plano estratégico privado: os portões e a meta de 50 vieram do enunciado.
- Não abri: IBGE (HTTP 403), Seade (bloqueio do Cloudflare), Planalto (HTTP 503) e o preço do Registro.br (página exige JavaScript). A pesquisa na web parou porque o limite compartilhado de buscas acabou; as fontes da seção 17 foram abertas por endereço direto.
- Nada foi testado contra Asaas, WhatsApp ou Resend. Li o código; não rodei a suíte do repositório.
- As taxas de conversão, os tempos por pedido, as horas planejadas e os custos de campo são premissas minhas.
- O cadastro de hospitais da Prefeitura pode estar incompleto. A legenda do IPVS veio da própria camada, não do método da Seade.
- Os documentos O02 a O09, I01 a I04 e L01 a L11 estão sendo escritos em paralelo; defina na integração qual definição vale se algum divergir deste (principalmente G1 a G4, nomes de etapas e janela de atendimento).

---

## 17. Fontes consultadas

Todas abertas em **23/10/2026**. Os endereços de GeoSampa devem ser usados com `https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/ows?service=WFS&version=2.0.0` seguido do que está na coluna "Endereço".

| Cód. | Fonte | Endereço | O que li | Trecho |
|---|---|---|---|---|
| F1 | GeoSampa, camada "Distrito" | `&request=GetCapabilities` (descrição) e `&request=GetFeature&typeNames=geoportal:distrito_municipal&outputFormat=application/json&srsName=EPSG:31983` | 96 polígonos; campos `nm_distrito_municipal`, `nm_regiao_05`, `nm_regiao_08`, `qt_area_quilometro`; `dt_atualizacao` = 20/03/2026 em todos | "Os distritos foram criados mediante a Lei nº 11.220/1992. Seus limites foram estabelecidos a partir de estudos elaborados por diversos órgãos do Executivo municipal…" |
| F2 | GeoSampa, "Densidade Demográfica 2022" | `&request=GetFeature&typeNames=geoportal:densidade_demografica` (paginado, 5.000 por página) | 27.301 setores; `qt_populacao`, `qt_domicilio`, `cd_indice_vulnerabilidade_social`; soma de `qt_populacao` = 11.451.999 | "Mapa temático produzido a partir dos setores censitários e da população relativos ao censo. É o resultado da divisão do total de habitantes pela área territorial." |
| F3 | GeoSampa, IPVS | `&request=GetCapabilities` (descrição) e legenda em `https://wms.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/wms?service=WMS&version=1.1.1&request=GetLegendGraphic&layer=geoportal:indice_paulista_vulnerabilidadesocial&format=application/json` | Legenda dos códigos 1 a 6 e "Não Classificado" | "Índice elaborado pela Fundação SEADE…"; legenda: "1 - Baixíssima Vulnerabilidade", "2 - Muito Baixa Vulnerabilidade", "5 - Alta Vulnerabilidade", "6 - Muito Alta Vulnerabilidade" |
| F4 | GeoSampa, "Hospital" | `&request=GetFeature&typeNames=geoportal:equipamento_saude_hospital` | 98 estabelecimentos na cidade; contagem por distrito (minha) | "Hospitais do cadastro de estabelecimentos de saúde municipais, estaduais, federais e privados da Cidade de São Paulo." |
| F5 | GeoSampa, "Metrô - Estação" | `&request=GetFeature&typeNames=geoportal:estacao_metro` | 94 estações operando; contagem por distrito (minha) | "Estações ativas da Companhia do Metropolitano de São Paulo - Metrô." |
| F6 | Supabase, preços | https://supabase.com/pricing | Planos Free e Pro | "Pro … From $ 25 / month"; "Paid plans include $10/mo in compute credits, enough to cover one Micro instance"; "Free projects are paused after 1 week of inactivity. Limit of 2 active projects." |
| F7 | Asaas, preços e taxas | https://www.asaas.com/precos-e-taxas | Tarifas padrão | Pix: "R$ 1,99" riscado e "R$ 0,99 por transação recebida (Válido por 3 meses)"; cartão de crédito à vista "R$ 0,49 + 2,99%" riscado e "R$ 0,49 + 1,99%"; "As taxas apresentadas são padrão. Para conferir as condições aplicadas ao seu contrato, consulte-as diretamente na sua conta Asaas." |
| F8 | Meta, preços da WhatsApp Business Platform | https://developers.facebook.com/docs/whatsapp/pricing/ (atualizada em 30/09/2026) | Cobrança por mensagem, categorias, faixa gratuita | "Meta charges on a per-message basis"; "Businesses are only charged when a message is delivered"; "Rate cards … effective October 1, 2026"; 1.000 mensagens de serviço gratuitas por mês por número |
| F9 | Meta, tabela de tarifas em BRL | link "BRL list rates" da página F8 (arquivo de planilha com extensão .csv; o endereço do arquivo é temporário) | Linha "Brazil" | "Cost per message in BRL on the WhatsApp Business Platform, effective October 1, 2026"; Brazil: Marketing 0,3217; Utility 0,035; Authentication 0,035; Service 0,035 |
| F10 | WhatsApp Business, recursos do aplicativo | https://business.whatsapp.com/products/business-app-features | Recursos do app | "Greeting", "Away Messages", "Quick Replies", "Labels"; "Business Broadcasts … Available to eligible users in select countries" |
| F11 | Resend, preços | https://resend.com/pricing | Planos Free e Pro | "Free … $0 / mo 3,000 emails / mo 100 emails a day"; "Pro … $20 / mo 50,000 emails / mo" |
| F12 | Banco Central, PTAX | `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='10-15-2026'&@dataFinalCotacao='10-23-2026'&$format=json` | Cotações de 15 a 22/10/2026 | 22/10/2026 13:12: `cotacaoVenda` 5,03830 |
| F13 | BrasilAPI, feriados nacionais (**fonte secundária**) | https://brasilapi.com.br/api/feriados/v1/2026 | Lista de 2026 | 02/11 Finados; 15/11 Proclamação da República; 20/11 Dia da consciência negra; 25/12 Natal. Confira no calendário oficial antes de fixar datas |

Internos: `docs/DECISOES.md`, `docs/ARQUITETURA.md`, `README.md` e os arquivos de código do Apêndice B. Documentos paralelos lidos para manter a coerência: O02 (`02-recrutamento-de-prestadores.md`) e O05 (`05-templates-whatsapp.md`).

---

## Apêndice A. Método e script da geografia

1. **Distritos e divisas.** Baixei a camada `distrito_municipal` (96 polígonos, SIRGAS 2000 / UTM 23S, EPSG:31983). Dois distritos são vizinhos se a divisa em comum tem 50 m ou mais (tolerância de 2 m).
2. **Moradores e domicílios.** Somei `qt_populacao` e `qt_domicilio` dos 27.301 setores da camada `densidade_demografica`; cada setor foi para o distrito que contém o seu ponto interno (`representative_point`).
3. **IPVS.** Somei os moradores por código `cd_indice_vulnerabilidade_social` e dividi pelo total (o código "sem classificação" fica no denominador). Os percentuais da seção 3 são parcela de moradores, não de setores.
4. **Hospitais e estações.** Ponto dentro do polígono do distrito. Estação de duas linhas conta uma vez.
5. **Zona.** Comparei o `zone` de cada distrito de `data/neighborhoods.json` com `nm_regiao_05` da Prefeitura.

Reprodução (Python 3 com `pip install shapely`; leva cerca de 1 minuto): `python3 geo_pilot.py "MOEMA,VILA MARIANA,SAUDE,CAMPO BELO,JABAQUARA"`. Os nomes dos distritos são os da camada, em maiúsculas e sem acento.

<details>
<summary>Script geo_pilot.py</summary>

```python
#!/usr/bin/env python3
"""Pilot geography check for WorkEasy, from the Prefeitura de Sao Paulo WFS (GeoSampa).

Usage: python3 geo_pilot.py "MOEMA,VILA MARIANA,SAUDE,CAMPO BELO,JABAQUARA"
Needs: pip install shapely. Prints adjacency, population, households and the vulnerability mix.
"""
import itertools
import json
import sys
import urllib.parse
import urllib.request
from collections import Counter

from shapely.geometry import shape
from shapely.strtree import STRtree

WFS = "https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/ows"

def fetch(layer, **extra):
    query = {"service": "WFS", "version": "2.0.0", "request": "GetFeature", "typeNames": f"geoportal:{layer}",
             "outputFormat": "application/json", "srsName": "EPSG:31983", **extra}
    with urllib.request.urlopen(f"{WFS}?{urllib.parse.urlencode(query)}", timeout=170) as response:
        return json.load(response)["features"]

def fetch_all(layer, properties):
    rows, start = [], 0
    while True:
        page = fetch(layer, sortBy="cd_identificador", count=5000, startIndex=start, propertyName=properties)
        rows += page
        if len(page) < 5000:
            return rows
        start += 5000

names = [n.strip() for n in sys.argv[1].split(",")]
districts = {}
for feature in fetch("distrito_municipal"):
    geometry = shape(feature["geometry"])
    districts[feature["properties"]["nm_distrito_municipal"]] = geometry if geometry.is_valid else geometry.buffer(0)

# Neighbours: at least 50 m of shared boundary (2 m tolerance), so a touch at one point does not count
print("Divisas (m):")
for a, b in itertools.combinations(names, 2):
    shared = districts[a].boundary.buffer(2).intersection(districts[b].boundary).length
    if shared >= 50:
        print(f"  {a} - {b}: {shared:,.0f}")

# Census 2022 tracts -> district by the tract's representative point
index = STRtree(list(districts.values()))
by_name = list(districts)
total = {"pop": 0, "dom": 0, "area": 0.0}
mix = Counter()
for feature in fetch_all("densidade_demografica",
                         "cd_original_setor_censitario,qt_populacao,qt_domicilio,cd_indice_vulnerabilidade_social,ge_poligono"):
    point = shape(feature["geometry"]).representative_point()
    hit = index.query(point, predicate="within")
    if len(hit) and by_name[int(hit[0])] in names:
        p = feature["properties"]
        total["pop"] += p["qt_populacao"] or 0
        total["dom"] += p["qt_domicilio"] or 0
        mix[p["cd_indice_vulnerabilidade_social"]] += p["qt_populacao"] or 0
total["area"] = sum(districts[n].area for n in names) / 1e6
share = lambda *codes: sum(mix[c] for c in codes) / sum(mix.values())
print(f"Moradores {total['pop']:,}; domicilios {total['dom']:,}; area {total['area']:.1f} km2; "
      f"hab/domicilio {total['pop'] / total['dom']:.2f}")
print(f"IPVS 1-2: {share(1, 2):.1%}; 3: {share(3):.1%}; 4: {share(4):.1%}; 5-6: {share(5, 6):.1%}")
```

</details>

Saída conferida em 23/10/2026 para o conjunto A5: divisas 3.463, 2.490, 1.857, 2.794, 2.246, 2.112 e 4.214 m; 623.679 moradores; 315.279 domicílios; 49,8 km²; 1,98 morador por domicílio; IPVS 1 e 2 = 84,1%; 5 e 6 = 8,3%. Para B5: 735.501; 327.891; 64,1 km²; 2,24; 64,3%; 21,4%. As contagens de hospitais e estações e a comparação de zonas foram feitas com a mesma lógica em passos separados (ponto dentro do polígono; `zone` contra `nm_regiao_05`) e não estão no script.

---

## Apêndice B. Conferências no código

O que afirmei sobre o produto e onde conferi, em 23/10/2026. Caminhos a partir de `apps/web/`.

| # | O que o plano afirma | Onde conferi |
|---|---|---|
| 1 | MVP em `main`, não implantado, sem validação com usuários; comissão e pagamento retido desligados | `README.md`; `docs/DECISOES.md` |
| 2 | `commission_enabled` e `escrow_enabled` falsos; `proposal_limit` 3; `labor_lock_days_per_week` 2; `pro_price_cents` 4900 | `supabase/migrations/20261019000002_catalog.sql` |
| 3 | `commission_cap_cents` 15000; `free_proposals_per_month` 5; `pro_trial_days` 30 | `supabase/migrations/20261022000012_monetization.sql` |
| 4 | Teste de 30 dias: `trialing`, plano Pro, primeira cobrança no último dia do teste | `supabase/functions/_shared/subscriptions.ts`; `pages/pro/Assinatura.tsx` |
| 5 | 44 áreas, 1.710 ocupações, 653 com política `conferido` | `catalog/areas.json`; `catalog/policies.json` (contagem) |
| 6 | Política de cada ocupação de lançamento (confiança, cobrança, trava, documentos, ranking) | `catalog/policies.json` |
| 7 | Área `eletricista`: 42 ocupações, nenhuma `conferido` | `catalog/policies.json` |
| 8 | 96 distritos, 22 em `Sul`, slugs dos cinco do piloto | `data/neighborhoods.json` |
| 9 | Rotas `/pedido`, `/pro/*`, `/admin/*`, `/cuidado/*`, `/p/:slug`, `/agendar/:slug`, `/orcamento/:token`, `/atendimentos/:id` | `pages/*/routes.tsx`; `AppShell.tsx` |
| 10 | `/pedido` com backend exige login, 4 passos, descrição de 10 a 2.000 caracteres, 96 distritos; sem backend abre o WhatsApp | `pages/cliente/Pedido.tsx`; `services/requests.ts`; `pages/cliente/concierge.ts` |
| 11 | `VITE_CONCIERGE_WHATSAPP` só é usada sem backend | `config/features.ts`; `pages/cliente/Pedido.tsx` |
| 12 | Pedido `open` por 7 dias (cliente até 30) | `docs/ARQUITETURA.md` (Pedidos e propostas) |
| 13 | Prestador vê pedidos ao abrir `/pro/pedidos` (`open_requests_for_me`); não há aviso | `docs/ARQUITETURA.md`; `pages/pro/Pedidos.tsx` |
| 14 | Seis modelos de notificação, nenhum de pedido novo | `supabase/functions/_shared/notifications.ts`; `supabase/migrations/20261019000008_notifications.sql` |
| 15 | Sem credencial, o despachante marca `skipped` | `docs/ARQUITETURA.md` (Variáveis; Notificações) |
| 16 | Proposta com preço maior que zero; até 3 por pedido; 5 novas por mês no grátis; aviso de não escrever telefone | `supabase/migrations/20261019000004_marketplace.sql`; `docs/ARQUITETURA.md`; `pages/pro/Pedidos.tsx` |
| 17 | Contato do prestador ao cliente só depois do atendimento aceito; proposta sozinha não compartilha | `docs/ARQUITETURA.md` (Agenda e atendimentos, "Contato") |
| 18 | `payments-create`: conta raiz com split, exige carteira do prestador, nome no perfil e CPF ou CNPJ | `supabase/functions/payments-create/handler.ts`; `_shared/split.ts` |
| 19 | `charges-create`: exige Pro; atendimento próprio ou orçamento aceito; conta do prestador; sem taxa; CPF ou CNPJ do cliente | `supabase/functions/charges-create/handler.ts` |
| 20 | "Ativar recebimento": campos obrigatórios | `pages/pro/Assinatura.tsx`; `supabase/functions/asaas-onboard/handler.ts` |
| 21 | Pix com QR, copia-e-cola e link de fatura | `components/pro/PixBox.tsx`; `pages/pro/Cobrancas.tsx` |
| 22 | Orçamento por link público, aceite sem conta, botão de WhatsApp | `docs/ARQUITETURA.md` (Orçamentos); `pages/pro/Orcamentos.tsx` |
| 23 | Avaliação só de atendimento de origem plataforma, pago pelo app | `docs/ARQUITETURA.md` (`reviews`) |
| 24 | Cuidado: `offer_shift` por admin ou dono, até 10 ofertas; check-in com janela de 2 h; relatório não clínico | `supabase/migrations/20261019000009_care.sql`; `services/care.ts` |
| 25 | Só o dono insere plantão; `createShift` grava valor igual em `rate_cents` e `caregiver_payout_cents`; nenhum pagamento ligado a plantão | `supabase/migrations/20261019000009_care.sql` (`shifts_insert_own`); `services/care.ts`; `docs/ARQUITETURA.md` |
| 26 | O cliente recusa dado de saúde em texto livre | `services/care.ts` (`assertNoHealthData`); `components/cuidado/HealthDataNotice.tsx` |
| 27 | Item "Cuidado" no menu de todo cliente logado | `components/navItems.ts` |
| 28 | Três links para `/register-provider` | `AppShell.tsx`; `pages/OccupationPage.tsx`; `pages/conta/Conta.tsx` |
| 29 | Fila e detalhe de prestadores; confirmar registro exige motivo; aprovação por ocupação | `pages/admin/PrestadorDetalhe.tsx`; `components/admin/OccupationCard.tsx` |
| 30 | `admin_metrics` conta por entidade e situação na semana, no mês e no total | `supabase/migrations/20261019000011_admin.sql` |
| 31 | Seções da agenda: horários, folgas, atendimento com cliente seu, próximos e anteriores | `pages/pro/Agenda.tsx` |
| 32 | `availability` e `time_off` têm `created_at`; `booking_events` tem `actor_id` e `at` | `supabase/migrations/20261019000003_providers.sql`; `20261019000005_bookings.sql` |
| 33 | Busca ordena por nome com `rating_ranking` e menos de 3 avaliações | `search_providers` em `20261019000003_providers.sql` |
| 34 | Páginas por bairro `noindex`; `data/seo-local.json` vazio | `README.md`; `data/seo-local.json` |
| 35 | Frases proibidas no código do cliente | `test/claims-guard.test.ts` |
| 36 | Versão de consentimento `2026-10-rascunho` | `config/legal.ts` |
| 37 | `request-assist` responde 503 sem chave | `docs/ARQUITETURA.md` (Variáveis; Edge Functions) |
| 38 | Site instalável como PWA; lojas fora do escopo | `README.md` |
| 39 | Trava trabalhista: dias distintos por semana ISO, mesmo cliente | `docs/ARQUITETURA.md` (Agenda e atendimentos) |
| 40 | Zonas do app iguais a `nm_regiao_05` da Prefeitura | comparação própria (Apêndice A) |
| 41 | Pré-requisitos do Cuidado | `docs/DECISOES.md`, seção 5 |
| 42 | Lista "Exigem atenção" em `/admin/pagamentos`; "Disputas abertas" em `/admin` | `components/admin/PaymentsAttention.tsx`; `pages/admin/Painel.tsx` |
