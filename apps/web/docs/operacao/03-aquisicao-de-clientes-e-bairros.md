# Aquisição de clientes e densidade por bairro

> **Rascunho para revisão de advogado. Não é parecer jurídico.** Os pontos marcados `[CONDICIONAL: depende de parecer]` não devem ser executados antes do parecer. Citações legais e de conselho estão na seção 14, com o endereço aberto e a data.

| Campo | Valor |
|---|---|
| Documento | O03 da pasta `docs/operacao/`: aquisição de clientes, densidade por bairro, concierge e linha Cuidado (conversa com hospitais) |
| Data de referência | 08/11/2026. D1 do piloto = segunda, 09/11/2026 (calendário do O01, §6) |
| Para quem | Dono (operação e decisões); advogado (seções 5, 8, 9 e 11); quem revisa as lojas (textos da seção 4) |
| Estado do produto | Protótipo. MVP em `main`, sem implantação, sem usuário real, sem integração testada com Asaas, WhatsApp ou Resend. Nada aqui é promessa de demanda, de prazo ou de resultado |
| Marcas | `[PLANEJADO]` não existe no produto hoje. `[proposta]` decisão a tomar. `[estimativa]` cálculo ou juízo. `[incerto]` não conferido em fonte aberta. `[CONDICIONAL: depende de parecer]` depende de advogado |

---

## 0. Resumo

1. **Demanda sem anúncio pago começa no bairro, com permissão escrita de quem administra o local** (síndico, associação, comércio). Nada de lista comprada, raspada ou exportada de grupo.
2. **Piloto:** os cinco distritos do O01 (Moema, Vila Mariana, Saúde, Campo Belo, Jabaquara). Abre-se primeiro o núcleo de demanda: Moema, Vila Mariana e Saúde. Jabaquara entra só para recrutamento de prestadores (seção 2).
3. **Até o pedido virar proposta, a operação atende pelo WhatsApp**, com mensagens prontas da seção 4. Depois, o cliente segue a Trilha A (pedido e aceite no app) ou a Trilha B (orçamento por link e cobrança na conta do próprio profissional), como no O01, §10.
4. **Páginas por bairro continuam `noindex`.** A regra do README e de `data/seo-local.json` exige dado local real. Hoje a página não tem texto local próprio, então o critério da seção 5 depende de uma mudança de produto antes de ser cumprido.
5. **Liquidez** se mede pelo relógio de 2 horas entre `requests.created_at` e a primeira `proposals.created_at` (mesma regra do G3 do O01). O banco não entrega esse recorte por bairro e categoria hoje. A consulta da seção 6 é rascunho não executado.
6. **Vazamento para fora do app se trata com clareza, não com contrato ou pressão.** O app mostra o contato só depois que o atendimento existe, e o pagamento combinado por fora é descrito honestamente nos termos (seção 7).
7. **Cuidado:** nenhum contato com hospital antes do P11 verde e do checklist da seção 8. O primeiro contato planejado é D25 (quinta, 03/12/2026), como no O01, e só se P11 estiver verde.
8. **Limites éticos:** nenhum paciente, funcionário ou fornecedor do consultório da Pulso Vital entra na demanda; nenhum dado de saúde entra em canal; nenhum depoimento, nota ou número sem fonte (seção 9).

---

## 1. Fatos do produto usados (conferidos no repositório em 08/11/2026)

| Fato | Estado hoje | Onde conferir |
|---|---|---|
| Pedido sem backend | `/pedido` monta a mensagem e abre um link `wa.me` para o número de `VITE_CONCIERGE_WHATSAPP`. O número precisa ter de 12 a 15 dígitos. Nada é enviado antes de a pessoa tocar em enviar | `pages/cliente/Pedido.tsx` (linhas 105, 181 a 192, 425 a 432); `pages/cliente/concierge.ts`; `config/features.ts` |
| Sem número configurado | Sem backend e sem número, `/pedido` mostra "Pedido online ainda não disponível". Por isso o botão de pedido nas páginas de serviço depende da variável | `Pedido.tsx` (linha 105); `pages/OccupationPage.tsx` (linha 104); `pages/OccupationNeighborhoodPage.tsx` (linha 90) |
| Bairros aceitos sem backend | Os 96 bairros de `data/neighborhoods.json`, sem restrição ao piloto. A restrição a cinco distritos é só operacional | `config/neighborhoods.ts`; `Pedido.tsx` (linha 58) |
| Telefone no pedido | A descrição não deve conter telefone nem endereço completo (aviso no formulário). Profissionais veem o pedido sem telefone e sem e-mail do cliente | `Pedido.tsx` (linhas 358 e 482) |
| Pedido no banco | `requests` tem `created_at`, `status` (`open`, `matched`, `closed`, `canceled`) e validade de 7 dias. O cliente não passa de 30 dias | `docs/ARQUITETURA.md`, "Pedidos e propostas"; `supabase/migrations/20261019000004_marketplace.sql` |
| Proposta no banco | `proposals` tem `created_at` e `status` (`sent`, `accepted`, `declined`, `withdrawn`). Até 3 propostas por pedido. Plano grátis: 5 propostas novas por mês | ARQUITETURA; `platform_settings`; DECISOES, D4 |
| Aviso ao prestador sobre pedido novo | **Não existe.** Os gatilhos de notificação são de propostas, atendimentos, pagamentos e orçamentos (e de plantões no Cuidado). Não há gatilho em `requests` | `supabase/migrations/20261019000008_notifications.sql` (`create trigger proposals_notify`, `bookings_50_notify`, `payments_notify`, `quotes_notify`). `[PLANEJADO]` |
| Contato | O telefone do prestador só aparece ao cliente depois que o atendimento existe (estado `requested` em diante). Proposta sozinha não compartilha contato | ARQUITETURA, "Contato (perfil)" |
| Métricas no admin | `admin_metrics` traz contagem geral por semana e por mês. Não tem recorte por bairro, por categoria nem tempo até a primeira proposta | ARQUITETURA, "Tabelas por domínio" (visões do admin) |
| Ensaio | `requests` não tem campo de ensaio. O O01 exclui os pedidos de ensaio manualmente | `20261019000004_marketplace.sql`; O01, §7 (D11) |
| Páginas por bairro | Para as 8 áreas de lançamento, há página para cada um dos bairros de Sul e Centro: 375 ocupações × 30 bairros = 11.250 páginas. Todas saem `noindex` e fora do sitemap, porque `data/seo-local.json` está `[]`. Contagem minha, sobre `catalog/areas.json` e `catalog/policies.json` | `scripts/prerender.mjs` (`LAUNCH_AREA_SLUGS`, `LAUNCH_ZONES`, `withLocalData`, `indexable`); `README.md`, "SEO" |
| Texto da página por bairro | Vem da política da ocupação e do nome do bairro. A frase "nesta fase, a lista pode estar vazia" entra no texto. Os profissionais aparecem só na tela do cliente, não no HTML pré-renderizado | `prerender.mjs` (bloco `intro` da página de bairro) |
| Botão da página por bairro | "Pedir este serviço" leva a `/pedido` com o bairro | `prerender.mjs` (`requestHref`, `cta`) |
| Teste de indexação | Indexa só os pares listados em `data/seo-local.json` | `test/seo/prerender.test.ts` (linha 383) |
| Pro | O Pro é o que permite ao profissional cobrar clientes pelo app. Teste de 30 dias uma vez por conta | DECISOES, D3 (seção 2) |
| Cuidado | Nenhum dos pré-requisitos está cumprido hoje | `docs/operacao/06-manual-do-cuidado.md`, §1.3; DECISOES, seção 5 |
| Notificações da linha Cuidado | Aviso à família sobre aceite, cancelamento, entrada e relatório **não existe** | `docs/operacao/06-manual-do-cuidado.md`, §2 |
| Termos de pagamento fora do app | Pagamento combinado por fora não passa pelo WorkEasy, não gera avaliação e não entra no histórico | `docs/juridico/01-termos-de-uso.md`, cláusula 6.5; `docs/juridico/04-politica-de-cancelamento-e-reembolso.md`, 1.2; `docs/juridico/05-politica-de-avaliacoes-e-moderacao.md`, 1.6 |
| Marketing | Consentimento "Comunicações de novidades" é opcional e revogável. A escolha padrão não foi conferida | `pages/conta/Conta.tsx` (linhas 129 a 133); `config/legal.ts` (`marketing: '2026-10'`) `[incerto]` quanto ao padrão |

---

## 2. Bairros do piloto e ordem de abertura

Lista do O01 (§3.1, decisão 1 de §0, padrão proposto A5). Os slugs estão em `data/neighborhoods.json`.

| Ordem | Bairro (slug) | Zona no arquivo | Hospitais no cadastro municipal (O01, §3.1) | Papel |
|---|---|---|---|---|
| 1 | Moema (`moema`) | Sul | 2 | Núcleo de demanda. Divulgação a partir do D8 |
| 2 | Vila Mariana (`vila-mariana`) | Sul | 3 | Núcleo de demanda. Divulgação a partir do D8 |
| 3 | Saúde (`saude`) | Sul | 1 | Núcleo de demanda. Divulgação a partir do D8 |
| 4 | Campo Belo (`campo-belo`) | Sul | 0 | Núcleo de demanda. Sem hospital no cadastro, então sem conversa de alta |
| 5 | Jabaquara (`jabaquara`) | Sul | 3 | Recrutamento de prestadores. Divulgação ao público só depois do CP2 |

- Se o dono escolher o conjunto B5 (O01, §3.4), a lista vira: Santo Amaro (`santo-amaro`), Campo Belo, Campo Grande (`campo-grande`), Cidade Ademar (`cidade-ademar`) e Jabaquara. Todos estão em Sul no arquivo.
- Os números de hospital e de população vêm do O01 e da Prefeitura. Não os reconferi aqui `[incerto]`.
- Expansão para outro distrito só segue a regra do O01, §3.4 (duas semanas com G3 de 70% ou mais e pelo menos 8 pedidos válidos por semana `[proposta]`).

---

## 3. Canais de demanda sem anúncio pago

### 3.1 Canais, em ordem de início

| Canal | Quem autoriza | O que entra | O que não entra | Início |
|---|---|---|---|---|
| Porteiros, zeladores e síndicos (cartaz com QR do WhatsApp no mural) | Síndico ou administradora, **por escrito** (uma mensagem basta, como no O01, D10) | Cartaz do modelo da seção 3.3, com o número da operação | Lista de moradores, mensagem a moradores, cartaz em área que o síndico não liberou | D10 (18/11): convites. D13 (21/11): cartazes |
| Grupo de WhatsApp do condomínio | Síndico, e só se a convenção e as regras do condomínio permitirem `[CONDICIONAL: depende de parecer]` | Uma publicação, com o texto da seção 3.3 | Marcar pessoas, adicionar pessoas, mensagem privada a quem só reagiu | Só com autorização escrita |
| Associações de moradores e comissões de bairro | Diretoria, por escrito | Cartaz e uma publicação no canal oficial da associação | Lista de associados, uso do nome da associação como apoio | D10 (18/11) |
| Comércio local (padaria, papelaria, casa de material) | Dono do comércio | Cartaz com QR | Oferta de comissão ao comércio; "indicação" do comércio como selo | D13 (21/11) |
| Pet shops | Dono do estabelecimento | Cartaz neutro, sem alegação de saúde | Venda de produto; associação de marca | D25 (03/12), como no O01 |
| Escolas de formação (cursos técnicos e livres) | Coordenação, por escrito | Mural ou cartaz; conversa de 15 minutos com a turma, se a escola permitir | Lista de alunos, nome ou logotipo da escola sem autorização | D25 (03/12) |
| Farmácias | `[CONDICIONAL: depende de parecer]`. Ver nota abaixo | Não definido | Qualquer material ligado a medicamento | **Fora deste plano até o parecer** |
| Grupos de bairro no Facebook, Instagram ou WhatsApp | Administrador do grupo, por escrito | Uma publicação, com a regra do grupo lida antes | Publicação sem autorização; repetição; postagem "para todos" | Só com autorização |
| Indicação de cliente satisfeito | Não se aplica | Pergunta única pós-serviço (seção 4, S9); link para quem o cliente quiser indicar | Recompensa em dinheiro ou desconto sem decisão do dono `[proposta]` | Depois do primeiro serviço pago |
| Páginas de categoria e de serviço (já indexáveis) | Não se aplica | Consulta orgânica de longo prazo, com texto da política | Páginas de bairro sem dado local (seção 5) | Já no ar `[incerto]` quanto ao desempenho |

**Nota sobre farmácias.** O O01 (D25) lista farmácias como ponto de divulgação. O artigo 68 do Código de Ética Médica veda ao médico exercer a profissão "com interação ou dependência de farmácia" (seção 9). O dono é médico. Até o parecer, farmácia fica fora dos cinco primeiros bairros, e nenhuma negociação com farmácia passa pelo dono enquanto o parecer não sair. **Divergência com o O01 a resolver** (seção 13).

### 3.2 Regras que valem para todo canal

1. Permissão escrita de quem administra o local, guardada com data. Sem permissão, sem cartaz.
2. Um convite por pessoa, uma vez. Quem disser "não" ou "pare" sai da lista (seção 4, S10).
3. Nada de lista comprada, raspada, exportada de grupo ou copiada de uma planilha de terceiros. A LGPD exige hipótese legal para cada tratamento (seção 9).
4. Nenhuma promessa de prazo, de resultado, de quantidade de profissionais ou de demanda. Nenhum "vaga" (isso sugere emprego).
5. Nenhum depoimento, nota ou número que não esteja no painel do admin na data do material (O02, seção 12.7).
6. Nenhuma alegação de saúde, de tratamento ou de cuidado clínico em material de demanda (seção 9).
7. Nenhuma conta falsa, nenhum post feito por quem não é da operação, nenhum "pedido de teste" fora da marcação de ensaio.

### 3.3 Textos de cartaz e de publicação (pt-BR, prontos para revisão)

**Cartaz (A5, com QR do WhatsApp):**

```text
WorkEasy: pedido de serviço para profissionais autônomos de {bairro}.

Diarista, eletricista, encanador, pintor, cabeleireiro, professor particular e outros.

Escreva para o nosso WhatsApp e explique o que você precisa. Respondemos pessoalmente, em horário comercial.
Não garantimos prazo nem resultado. O preço é combinado com o profissional.

Para parar de receber mensagens, responda SAIR.
[QR: https://wa.me/{número}]
```

**Publicação única em grupo (só com autorização do administrador):**

```text
Boa tarde, pessoal! Sou {seu nome}, do WorkEasy. É uma ferramenta para pedir serviço a profissionais autônomos que atendem {bairro}.

Não é vaga de emprego. Não garantimos prazo nem resultado. Quem quiser pedir um serviço pode escrever para o WhatsApp da operação: {link wa.me}. Eu só falo com quem escrever primeiro.

Publicado com autorização do administrador do grupo. Se preferirem que eu apague, é só avisar.
```

Regras: uma publicação; sem marcar ninguém; sem adicionar pessoas; sem mensagem privada para quem só reagiu; sem repetir sem pedido do administrador.

---

## 4. Concierge: do primeiro contato ao atendimento marcado

### 4.1 Etapas

| Etapa | Quem faz | Relógio (interno) | Saída | Registro |
|---|---|---|---|---|
| E0. Entrada | Cliente, pelo botão de `/pedido` ou pelo cartaz | Começa quando a mensagem chega ao WhatsApp da operação. Se chegar fora da janela, começa na abertura dela | Mensagem recebida | Planilha `pedidos` (código, data, canal, bairro, serviço) |
| E1. Triagem | Operação | Primeira resposta no dia (S1) | Serviço, bairro, o quê, quando, urgência | Planilha |
| E2. Escolha | Operação | Sem prazo para o cliente | De 3 a 5 profissionais aptos (ocupação aprovada e bairro atendido no painel `/admin/prestadores/:id`) | Planilha |
| E3. Proposta | Operação pergunta a cada profissional, um de cada vez | **Relógio para** quando a primeira proposta qualificada chega ao cliente | Preço em reais, dia e horário, nome do profissional (S5) | Planilha; e `proposals` se a Trilha A |
| E4. Aceite | Cliente | Sem prazo | Trilha A: aceite em `/pedidos/:id` (`accept_proposal`). Trilha B: orçamento em `/orcamento/:token` (S6) | `bookings` (Trilha A) ou planilha (Trilha B) |
| E5. Pagamento | Cliente, pelo link | Sem prazo | Pix ou fatura do Asaas | `payments` (Trilha A ou B) |
| E6. Atendimento | Profissional | Lembrete 24 h antes, pela operação (S8) | Atendimento `completed` | Planilha e banco |
| E7. Pós-serviço | Operação | Depois do atendimento | Pergunta única (S9) | Planilha `pedidos` |

- **Janela de atendimento** (proposta do O01, §0, decisão 3): segunda a sexta, das 8h às 17h30; sábado, das 8h às 14h; domingo, só resposta automática `[proposta]`.
- **Trilha B primeiro** (O01, §0, decisão 4): o profissional emite o orçamento em `/pro/orcamentos`, envia o link público, e cobra em `/pro/cobrancas`. Essa cobrança exige o plano Pro (teste de 30 dias, D3) e recebimento ativo. O dinheiro vai para a conta Asaas do profissional, não para a conta da plataforma `[CONDICIONAL: depende de parecer]` (O01, Q1).
- **Trilha A** só depois da resposta do advogado sobre o split em subconta (DECISOES, seção 4, portão 1).

### 4.2 Roteiros (pt-BR)

Os roteiros usam só o que o produto faz hoje ou o que o O01 e os termos já descrevem. Ao usar, troque os campos entre chaves. Não escreva prazo, garantia nem resultado.

**S1. Primeira resposta.** Quando: logo após a mensagem chegar.

```text
Oi, {nome}! Aqui é a operação do WorkEasy. Recebi seu pedido de {serviço} em {bairro}.

Vou fazer algumas perguntas rápidas para achar profissionais que atendem aí. Por favor, não envie telefone de terceiros nem dados de saúde por aqui.
```

**S2. Triagem (uma ou duas perguntas por mensagem).**

```text
1. O que exatamente você precisa? Pode ser em poucas palavras.
2. Qual bairro e um ponto de referência? Não precisa do número da casa.
3. Para quando? Dia e turno de preferência, se tiver.
4. É urgente?
```

**S3. Bairro fora do piloto.** Quando: o bairro não está na lista de abertura (seção 2).

```text
Obrigado por escrever. Por enquanto, estamos atendendo pedidos só em {lista dos bairros abertos}.

Posso guardar seu pedido só para entrar em contato se abrirmos em {bairro}? Você pode pedir para apagar esse registro quando quiser.
```

**S4. Pedido com conteúdo de saúde.** Quando: a pessoa descreve sintoma, doença ou tratamento.

```text
Não damos orientação de saúde nem avaliamos sintomas. Em emergência, ligue 192 (SAMU) agora.

Se o que você quer é contratar um serviço, me diga qual serviço e eu sigo a triagem, sem detalhes de saúde.
```

**S5. Proposta ao cliente.** Quando: a primeira proposta qualificada chega. Mostre no máximo 3 propostas, como o app faz.

```text
Encontrei {número} profissional(is) que atendem {bairro} para {serviço}.

Proposta de {nome do profissional}: preço combinado {valor em reais}; pode ir em {dia e horário que ele informou}; válida até {data}.

O preço é combinado com o profissional. O telefone dele aparece para você quando o atendimento for confirmado. Quer aceitar, ou prefere outra data?
```

**S6. Aceite (Trilha B).**

```text
Ótimo. Peço ao profissional que emita o orçamento. Você recebe um link para ver e aceitar sem criar conta: {link /orcamento/:token}.

O pagamento é feito pelo link, por Pix ou fatura do Asaas. Nesta fase, o valor vai para a conta de recebimento do profissional.
```

**S7. Cliente quer pagar ou combinar fora do app.** Quando: a pessoa pergunta se pode pagar direto ao profissional.

```text
Você pode combinar a forma de pagamento direto com o profissional. Nesse caso, o WorkEasy não recebe nem registra o pagamento, e o serviço não gera avaliação no app.

Se quiser ter o orçamento e o pagamento registrados, o link funciona para isso. A escolha é sua.
```

Fonte do texto: termos de uso, cláusula 6.5; política de cancelamento, 1.2; política de avaliações, 1.6. Não use este roteiro para pressionar. Não ameace, não recuse o pedido por causa disso.

**S8. Lembrete (um só, 24 h antes).** Quando: atendimento marcado.

```text
Oi, {nome}. Lembrete do serviço de {serviço} com {nome do profissional}, {dia} às {horário}, em {bairro}.

Se precisar mudar, responda por aqui até {horário limite}.
```

**S9. Pergunta única depois do serviço.**

```text
Obrigado por usar o WorkEasy. Uma pergunta só: você voltaria a contratar por aqui? Responda sim ou não e, se quiser, uma frase.
```

Resposta vai para a planilha, sem nome nem telefone (O01, §11.2).

**S10. Pedido para parar.** Quando: a pessoa pede para sair, parar ou não receber mensagens. Responda uma vez.

```text
Entendi. Não vou mais enviar mensagens para você.

Vou apagar seu contato da planilha e guardar só o número e a data deste pedido, para não escrever por engano.
```

Registro: a linha do contato é apagada; fica só número e data na lista de não contatar. Essa retenção mínima é `[incerto]` e precisa de confirmação do advogado (O02, 12.4).

**S11. Pedido de garantia ou prazo.**

```text
Não consigo garantir prazo nem resultado. O que posso fazer é te mostrar as propostas assim que os profissionais responderem, e você decide.
```

**S12. Ainda sem resposta dos profissionais.**

```text
Ainda estou aguardando as respostas dos profissionais de {serviço} em {bairro}. Quando chegar a primeira proposta, eu te aviso por aqui.
```

**S13. Pedido de contato direto do profissional antes do aceite.**

```text
O telefone do profissional aparece para você quando o atendimento for confirmado. Até lá, eu sigo passando as mensagens por aqui.
```

Fonte: ARQUITETURA, "Contato (perfil)".

### 4.3 Regras da operação

- Não envie número de profissional a cliente antes do atendimento, e não envie número de cliente a profissional sem o aceite (ARQUITETURA).
- Preço é do profissional. A operação repassa o que ele informa e não tabela preço.
- Não pegue dinheiro. Nenhum pagamento passa pela conta pessoal do dono ou do consultório (O01, §10.4).
- Se o pedido vier de fora da janela de atendimento, responda no próximo horário útil, sem prometer hora.

---

## 5. Abrir um bairro para indexação

### 5.1 Estado hoje

- `data/seo-local.json` contém `[]`. Todas as 11.250 páginas por bairro saem com `<meta name="robots" content="noindex,follow" />` e não entram no sitemap (`scripts/prerender.mjs`, `indexable`; `README.md`, "SEO").
- Testes: `npx vitest run test/seo`. O teste `indexes only the pairs listed in data/seo-local.json` usa o par `encanador/moema`.

### 5.2 O que o próprio produto exige

Pelo `README.md` e pelo código: um par `"<ocupação>/<bairro>"` só entra em `data/seo-local.json` **quando houver cadastro aprovado ou demanda real ali**. Sem isso, a página é "o mesmo texto com o nome trocado".

### 5.3 O que este documento propõe como critério mínimo `[proposta]`

Todos os cinco critérios precisam valer ao mesmo tempo. Nenhum é número de promessa.

| Critério | Como se confere | Por quê |
|---|---|---|
| **C1. Oferta real** | Pelo menos 2 profissionais com a ocupação aprovada (`provider_occupations.approved`) e o bairro em `provider_neighborhoods`, com registro não `rejected`. Conferido no painel do admin | Sem oferta, a página não leva a nenhum atendimento |
| **C2. Demanda real** | Pelo menos 1 pedido válido para o par nos últimos 90 dias (não ensaio, não cancelado). Conferido na consulta da seção 6 | Sem pedido, o par não tem história local |
| **C3. Texto próprio do par** | Pelo menos 2 parágrafos escritos para aquele par, com dado local verificável e datado (por exemplo: "Em {mês/ano}, {n} profissionais aprovados atendiam {bairro}"). Revisado por uma pessoa | Evita páginas que o Google trata como "substancialmente semelhantes" (seção 14, fonte 1) |
| **C4. Registro** | Uma linha por par em planilha: quem revisou, data, dados usados, critério atingido | Permite reverter e explicar a decisão |
| **C5. Saída** | Se o par cair abaixo de C1 ou C2 por dois meses seguidos, sai da lista | Mantém o índice alinhado com a oferta |

### 5.4 Limitação do produto que impede C3 hoje

O texto pré-renderizado da página por bairro é só o do template (seção 1). Os profissionais aparecem na tela do cliente, depois que a página carrega, e não entram no HTML que o rastreador lê. Por isso, mesmo com C1 e C2 atendidos, **não há como cumprir C3 sem uma mudança de produto**. Isso vai para a seção 13 e não é resolvido aqui.

### 5.5 Como abrir um par, quando C1 a C4 estiverem cumpridos

1. Adicionar `"<ocupação>/<bairro>"` em `data/seo-local.json` (formato de `test/seo/prerender.test.ts`).
2. Rodar `npx vitest run test/seo`. Não avance se algum teste falhar.
3. Confirmar no build que só os pares listados saem sem `noindex` e entram no sitemap.
4. Anotar a decisão na planilha de C4.

### 5.6 O que não fazer

- Abrir um bairro por causa de tráfego previsto, de volume de páginas ou de "cobertura" de palavras-chave.
- Abrir por bairro sem prestador aprovado naquela ocupação.
- Colocar texto gerado por IA em massa para o par (o Google chama isso de abuso de conteúdo em escala, seção 14, fonte 1).
- Copiar um texto de um par para outro trocando o nome.

---

## 6. Liquidez por categoria e bairro

### 6.1 Definições (as do O01, §5.1, G3, para que os números batam)

| Indicador | Definição | Fonte | Leitura |
|---|---|---|---|
| Pedido válido | Categoria e bairro dentro do piloto, com o quê, onde e quando; pessoa real; sem duplicidade; não é ensaio | `requests` (Trilha A); planilha `pedidos` (Trilha B) | Base de todos os outros |
| Proposta qualificada | De profissional aprovado naquela ocupação e bairro, com preço em reais e dia ou horário, entregue ao cliente. No banco, qualquer `proposals` que não seja `withdrawn` | `proposals` (`status <> 'withdrawn'`) | Numerador |
| Relógio de 2 horas | Do `requests.created_at` (ou da abertura da janela, se chegou fora dela) até a primeira proposta qualificada entregue | `requests.created_at`; `proposals.created_at`; planilha | Meta interna. **Nunca prometida ao cliente** |
| Taxa em 2 horas | Pedidos válidos com a primeira proposta qualificada entregue até 2 horas depois do pedido, ÷ pedidos válidos da janela | Consulta da seção 6.3 | Passa com 70% ou mais e no mínimo 30 pedidos válidos na janela. Abaixo disso, o resultado é "sem prova" |
| Cobertura | Profissionais aprovados e com agenda ativa por categoria e bairro | `provider_occupations`, `provider_neighborhoods`, `availability` | Mapa semanal. Freio de oferta do O01, §4: passar de cerca de 8 aprovados por ocupação e distrito sem pelo menos 3 pedidos nas últimas duas semanas |
| Propostas por pedido | Média e distribuição de `proposals` por `requests` | `proposals` | Se a média ficar perto de 1, a demanda não atrai concorrência |
| Parcela paga no app | Atendimentos com pagamento pelo app ÷ atendimentos concluídos, por categoria | `payments`, `bookings` | Indício de vazamento (seção 7) |

**Leitura de amostra pequena.** Com 30 pedidos válidos no piloto inteiro, cada célula categoria × bairro quase nunca passa de poucas unidades nas primeiras semanas. Por isso, o recorte por célula é **indício para decidir onde recrutar ou divulgar**, não prova. A prova é o agregado do piloto, com o mínimo de 30 (regra do O01).

### 6.2 Limite atual do produto

`admin_metrics` (ARQUITETURA) só conta pedidos, propostas e atendimentos por status, na semana e no mês. Não há recorte por bairro ou categoria, nem tempo até a primeira proposta. Até existir uma consulta ou visão nova, a leitura sai do banco por consulta e da planilha. Criar uma visão exige migration nova, sem editar as existentes (regra do próprio projeto: nunca editar migration existente, criar uma nova).

### 6.3 Rascunho de consulta (não executado; validar no stack local antes de usar)

```sql
-- RASCUNHO. NÃO EXECUTADO. Rodar no stack local (supabase) com perfil admin ou service role.
-- Parâmetros: :inicio e :fim (timestamptz). Pedidos de ensaio precisam ser retirados à mão.
with pedidos as (
  select
    r.id as request_id,
    r.occupation_slug,
    n.slug as bairro_slug,
    r.created_at as pediu_em,
    (
      select min(p.created_at)
      from public.proposals p
      where p.request_id = r.id
        and p.status <> 'withdrawn'
    ) as primeira_proposta_em
  from public.requests r
  join public.neighborhoods n on n.id = r.neighborhood_id
  where r.created_at >= :inicio
    and r.created_at < :fim
    and r.status <> 'canceled'
)
select
  occupation_slug,
  bairro_slug,
  count(*) as pedidos,
  count(*) filter (
    where primeira_proposta_em is not null
      and primeira_proposta_em - pediu_em <= interval '2 hours'
  ) as com_proposta_em_2h
from pedidos
group by occupation_slug, bairro_slug
order by pedidos desc;
```

Pontos a conferir antes de usar: (a) pedidos fora da janela de atendimento precisam ser ajustados na planilha, porque a consulta não conhece a janela; (b) o campo `status` de `proposals` não inclui um estado "qualificada", então a regra usa `<> 'withdrawn'`; (c) pedido de ensaio não tem marca no banco.

### 6.4 Leitura semanal (10 minutos, sexta)

1. Pedidos válidos da semana, por bairro e por categoria (mínimo 30 no agregado do piloto).
2. Taxa em 2 horas, agregado e por bairro (com a ressalva da seção 6.1).
3. Pedidos sem proposta em 24 horas: listar, com o motivo. Ausência de profissional na categoria → recrutamento; profissional sem resposta → S12 e o contato do O02.
4. Cobertura: categorias com pedido e zero aprovado no bairro → não divulgar aquela categoria ali.
5. Decisão da semana: uma alavanca (divulgar, recrutar ou pausar), registrada no formato da revisão semanal do O01, §12.

---

## 7. Sair do app sem tática hostil

### 7.1 O que o produto já faz

- A proposta sozinha não compartilha contato. O telefone do profissional aparece para o cliente quando o atendimento existe (ARQUITETURA, "Contato (perfil)").
- O orçamento de Trilha B (`/orcamento/:token`) é aceito pelo cliente sem criar conta.
- A agenda, o histórico de atendimentos e o lembrete de 24 horas (quando o WhatsApp estiver configurado) ficam no app.
- O pagamento pelo link é do Asaas. Não passa pela conta pessoal de ninguém.

### 7.2 O que a operação faz

- Mostrar o que o app guarda e o que ele entrega (S5, S6, S8). Sem comparação com concorrente e sem crítica a quem combina por fora.
- Dizer a verdade sobre o que fica de fora: pagamento combinado por fora não tem registro, não gera avaliação e não entra no histórico (S7, com a fonte dos termos).
- Medir a parcela paga no app por categoria (seção 6.1). Esse número é o indício, não o objetivo.

### 7.3 O que não fazer

- Não criar cláusula de não contorno para cliente nem para profissional. Os termos rascunhados a deixaram de fora de propósito, e o advogado precisa decidir (`docs/juridico/01-termos-de-uso.md`, P16, sobre o risco de abusividade no CDC, art. 51, IV).
- Não cobrar multa, suspender ou tirar visibilidade de profissional por combinar fora. A própria regra do termo do prestador diz que atender "também fora do app" não é motivo de suspensão (`docs/juridico/02-termos-do-prestador.md`, 17.2).
- Não ocultar o telefone do profissional depois do atendimento confirmado.
- Não pedir ao profissional que denuncie o cliente que pagou por fora.
- Não contar como "venda do WorkEasy" o que foi pago por fora.

---

## 8. Linha Cuidado: conversa com hospitais e convite de famílias

### 8.1 Gates que valem antes de qualquer contato

Do DECISOES, seção 5, e do O06, §1.3:

1. Pessoa jurídica aberta.
2. Seguro de responsabilidade civil cotado (P11 do O01).
3. Advogado trabalhista validando o fluxo e a trava de 2 dias por semana.
4. Pelo menos 3 famílias atendidas em modo concierge, com o dono ou alguém dele no controle da escala.
5. **Antes disso, o menu "Cuidado" não é divulgado.** Uma conversa com hospital é divulgação da linha, então ela também espera o gate.

**Hoje, nenhum item está cumprido** (O06, §1.3). Por isso, nas semanas 1 e 2 do calendário (seção 10), a linha Cuidado só tem preparação interna: lista de hospitais, roteiro revisado pelo advogado, one-pager em rascunho.

### 8.2 Quem procurar no hospital

- Procurar o **serviço social** ou o núcleo de alta, não médicos da equipe. A função de quem orienta a família na alta varia de hospital para hospital `[incerto]`: confirmar por telefone ou no site de cada um antes de escrever.
- Não procurar quem atende em pronto-socorro nem a equipe de um setor de internação específico, para não parecer que o WorkEasy está pedindo acesso a pacientes.
- Não procurar médicos ou enfermeiros do consultório da Pulso Vital, nem contatos ligados à clínica (O02, 12.9).

### 8.3 Escolha de 2 a 3 hospitais

- Ponto de partida: os hospitais dos cinco distritos do piloto, no cadastro municipal (O01, §3.1 e apêndice A). O O01 registra 9 hospitais nesses distritos. Os nomes não estão no repositório e precisam ser extraídos do cadastro `[incerto]`.
- Preferir, no início, hospital privado ou filantrópico. Hospital da rede pública (SUS) só com parecer, por causa do artigo 64 do Código de Ética Médica (seção 9).
- Não escolher por tamanho ou por proximidade pessoal com a equipe do hospital.

### 8.4 Sequência de contato (só depois dos gates)

| Passo | O que acontece | Pronto para usar quando |
|---|---|---|
| H1 | Ligação curta ao serviço social: perguntar como as famílias recebem orientação na alta quando precisam de alguém em casa, e se o hospital aceita material informativo | Roteiro H-A revisado pelo advogado |
| H2 | Envio do one-pager (H-B) por e-mail, se pedido | One-pager revisado pelo advogado e aprovado pelo dono |
| H3 | Conversa de 20 minutos, presencial ou por vídeo, se o hospital aceitar | Mesmo roteiro H-A |
| H4 | Registro: data, função de quem atendeu, o que foi dito, material enviado, resposta (sem dados de paciente) | Planilha `hospitais` |

**Roteiro H-A (ligação ou primeiro e-mail):**

```text
Bom dia. Meu nome é {nome}, sou do WorkEasy, uma plataforma para contratar cuidadores autônomos de plantão em casa, em São Paulo. Estamos em fase de testes.

Estou conversando com serviços sociais de hospitais de {bairros} para entender como as famílias são orientadas depois da alta quando precisam de alguém para ficar com a pessoa em casa.

Não estou oferecendo nada agora e não preciso de nenhum dado de paciente. Posso enviar uma página explicando o que é o WorkEasy e o que ele não faz? Se o hospital tiver regra para material de divulgação, eu sigo a regra.
```

**Roteiro para a conversa (pode ser lido antes):** não ofereça preço; não prometa vaga de cuidador; não peça lista; não peça encaminhamento com incentivo.

### 8.5 One-pager (H-B) para a equipe de alta

```text
WorkEasy: o que é e o que não é

O que é
Uma plataforma em fase de testes, em São Paulo, para a família combinar um plantão de cuidador autônomo em casa. A família escolhe o cuidador, o dia, o horário e o valor combinado com ele. O WorkEasy organiza a oferta do plantão, o aceite, o registro de entrada e saída e um relatório do dia, que não é clínico.

O que não é
Não presta cuidado de saúde. Não faz enfermagem, não aplica medicamento, não faz curativo, não emite laudo, não orienta tratamento e não faz triagem. O cuidador é independente e não é do WorkEasy. O WorkEasy não tem vínculo com hospital, não é indicado por hospital e não tem parceria com hospital.

Estado atual
A linha de cuidado ainda não está aberta ao público. Não temos número de atendimento para divulgar e não há avaliação publicada. Esta conversa serve para entender o processo de alta e avaliar se faz sentido para as famílias.

Dados
O WorkEasy não recebe lista de pacientes nem dados de pacientes do hospital. A família decide se procura um cuidador e se cadastra.

Contato
{nome}, {cargo}. {e-mail}. {telefone da operação}.
```

**O que o one-pager não diz, e o que não pode entrar em conversa com hospital:**

| Não prometer | Por quê |
|---|---|
| Prazo de envio de cuidador, "em até N horas" ou "imediato" | Texto bloqueado pelo teste de frases proibidas (`apps/web/test/claims-guard.test.ts`) |
| "Seguro", "verificado", "qualificado", "treinado" | Não há conferência clínica; a conferência é de documento, conforme a política |
| Acompanhamento médico, supervisão de enfermagem, "segurança do paciente" | Não existe (O06, §3.1 e §3.6) |
| Parceria, indicação, selo ou aprovação do hospital | Só com autorização escrita e parecer `[CONDICIONAL: depende de parecer]` |
| Preço da linha | Não definido; o valor é combinado entre família e cuidador, e a margem é número interno (DECISOES, seção 5; O01, §4) |
| Comissão, bônus ou qualquer remuneração por encaminhamento | Vedado a médicos pelo artigo 59 do Código de Ética Médica (seção 9). Para outros profissionais, a regra é do conselho deles `[incerto]` |
| Números de famílias ou de cuidadores | Só o que o painel mostrar na data, com data (O02, 12.7) |
| Qualquer ligação com a Pulso Vital | Separação de marca e de pessoas (O02, 12.9; DECISOES, seção 8, item 3) |

### 8.6 Quando parar

- Pedido de lista de pacientes, de alta ou de contato de familiares: parar e registrar. Não responder com dados.
- Pedido de comissão, bônus ou "taxa de indicação": parar e levar ao advogado.
- Pedido de atendimento pelo SUS: parar, e não ativar a conversa sem parecer (artigo 64).
- Pedido de resultado, de garantia ou de "acompanhamento clínico": explicar o limite (seção 8.5) e encerrar se insistirem.
- P11 ainda não verde: não enviar nada.

### 8.7 Convite de famílias (O01, §10.3)

Fontes permitidas para convidar uma família:

1. Pessoas que pediram cuidado pelo concierge (S1 a S3), com consentimento para contato.
2. Rede pessoal do dono, sem usar lista do consultório.
3. Indicação de família que já é cliente (sem recompensa).

**Não convidar pacientes, familiares de pacientes ou funcionários do consultório da Pulso Vital.** Ver seção 9.

Convite (pt-BR), uma vez, só para quem pediu contato:

```text
Oi, {nome}. Você pediu informação sobre cuidador em casa pelo WorkEasy. Estamos chamando algumas famílias para uma conversa de 60 a 90 minutos, para entender a necessidade e explicar o que o app faz e o que não faz.

Não há prazo, preço fechado nem garantia. Se você não quiser, é só responder e eu apago o seu registro de contato.
```

Conversa: o responsável cria conta, casa e assistido (primeiro nome, ano de nascimento, preferências, contato de emergência), sem dados de saúde. O app recusa palavras de saúde em texto livre (O06, §9.3).

---

## 9. Limites éticos e legais

| Tema | Regra | Fonte aberta em 08/11/2026 | Estado |
|---|---|---|---|
| Lista de pacientes do consultório da Pulso Vital | Não usar para divulgação, recrutamento nem convite. A informação foi obtida em razão da profissão de médico, e sigilo continua mesmo se o fato for público (parágrafo único) | Código de Ética Médica, art. 73 e parágrafo único (seção 14, fonte 4). LGPD, art. 6, I (finalidade) e art. 11, caput (dados de saúde são sensíveis) | Regra firme. Aplicação prática ao WorkEasy `[CONDICIONAL: depende de parecer]` |
| Pacientes e imagens em publicidade | Não fazer referência a caso clínico identificável, nem exibir paciente ou imagem que o identifique, mesmo com autorização do paciente, em anúncio ou divulgação | Código de Ética Médica, art. 75 (fonte 4) | Obrigação do médico. Material do WorkEasy que leve o nome do dono como médico segue a mesma regra `[CONDICIONAL: depende de parecer]` |
| Remuneração por paciente encaminhado | Vedado oferecer ou aceitar remuneração ou vantagem por paciente encaminhado | Código de Ética Médica, art. 59 (fonte 4) | Vale ao médico. Outros profissionais: conselho próprio `[incerto]` |
| Desvio de paciente do SUS | Vedado agenciar, aliciar ou desviar paciente atendido pelo sistema público para clínica particular **ou instituições de qualquer natureza**, para obter vantagem pessoal | Código de Ética Médica, art. 64 (fonte 4) | Hospitais do SUS só com parecer |
| Farmácia | Vedado exercer a profissão com interação ou dependência de farmácia ou de organização que promova ou comercialize produtos de prescrição | Código de Ética Médica, art. 68 (fonte 4) | Farmácia fora até parecer (seção 3.1) |
| Dado de saúde em canal de demanda | Não tratar dado de saúde sem hipótese do art. 11. Legítimo interesse **não** se aplica a dado sensível | LGPD, art. 5, II; art. 11, caput e inciso II, alínea "f" (fonte 2). ANPD, guia de legítimo interesse, avaliação preliminar e Exemplo 1 (clínica), p. 8 (fonte 5) | Regra firme. Hipótese para a linha Cuidado `[CONDICIONAL: depende de parecer]` |
| Contato por WhatsApp | Só com a pessoa que deu o número e permitiu receber mensagens seguintes. Opt-out tem de ser respeitado, dentro ou fora do WhatsApp. Fora da janela de 24 horas, só modelo aprovado | WhatsApp Business Messaging Policy (fonte 3), itens (a), (b) e (c) | Regra firme. A operação responde dentro da janela, por conversa iniciada pela pessoa |
| Base legal para contato | Consentimento, com finalidade determinada; autorização genérica é nula; o dono tem o ônus da prova; revogação gratuita e facilitada. Pedido feito pela própria pessoa: procedimento preliminar | LGPD, art. 5, XII; art. 7, I e V; art. 8, §§ 2º, 4º e 5º (fonte 2) | Regra firme |
| Legítimo interesse para divulgação | Só para apoio e promoção da atividade do controlador, com dados estritamente necessários; exige descadastramento fácil | LGPD, art. 7, IX; art. 10, caput e § 1º (fonte 2). ANPD, Exemplo 5, pp. 17 a 18 (fonte 5) | Não usar para lista de contatos. Divulgação por cartaz e por quem escreve primeiro |
| Oposição | O titular pode opor-se a tratamento feito sem consentimento, em caso de descumprimento da lei | LGPD, art. 18, § 2º (fonte 2) | Tratar qualquer "pare" como pedido a cumprir (S10) |
| Retenção do registro | Art. 16, I: conservação autorizada para cumprimento de obrigação legal ou regulatória pelo controlador, mesmo depois do fim do tratamento | LGPD, art. 16, I (fonte 2) | Prazo de retenção do dono `[DECISÃO DO DONO]`; conferir com o contador |
| Publicidade enganosa | É enganosa qualquer informação publicitária inteira ou parcialmente falsa, inclusive por omissão. Deixar de informar dado essencial também é enganoso | CDC, art. 37, §§ 1º e 3º (fonte 6) | Base para a proibição de avaliação falsa e de número sem fonte |
| Avaliação falsa | Proibida. Avaliação só de serviço concluído e pago pelo app (O01 e política de avaliações, 05, 1.6) | CDC, art. 37 (acima) e política interna | Regra firme |
| Depoimento e nota | Não publicar sem fonte e sem autorização escrita, e não criar nota | O02, 12.7 | Regra firme |
| Alegação de saúde | Nenhuma em material de demanda: nada de "cuidado", "tratamento", "bem-estar" ligado a sintoma ou doença | O01, §1.3 (regra 3); DECISOES, seção 5 | Regra firme |
| Páginas em massa | Página gerada em escala sem valor próprio é abuso de conteúdo em escala; página de passagem para uma funil também | Google Search Central, spam policies, "Doorway abuse" e "Scaled content abuse" (fonte 1) | Ver seção 5 e seção 13 |

---

## 10. Calendário de quatro semanas (D8 a D35)

Calendário do O01, §6 e §7 (D1 = 09/11/2026). Este calendário começa no D8, porque a semana 1 do O01 (D1 a D7) não permite divulgar o número ao público. Os dias de D1 a D7 são só de preparação: revisar roteiros e cartazes, levantar os nomes de hospitais, pedir autorização dos primeiros síndicos e associações.

Pré-condição de tudo: **D1 só começa se os itens bloqueantes do O01 (seção 2) estiverem verdes.**

| Semana | Datas | Demanda (bairros abertos) | Concierge | Cuidado | Medição | Não fazer |
|---|---|---|---|---|---|---|
| **1** | D8 a D14 (16 a 22/11) | D10 (18/11): cinco conversas com síndicos, zeladores ou associações dos núcleos, pedindo autorização por escrito. D13 (21/11): cartazes nos locais autorizados | S1 a S3 em uso. Ensaio de 2 horas no D11 (5 pedidos de ensaio, marcados fora das métricas) | Nenhum contato com hospital. Preparar a lista de hospitais (seção 8.3) | Taxa de contato até cadastro (O01, D8). Primeiro registro de C4 | Pedir lista de moradores. Postar em grupo sem autorização. Anúncio pago |
| **2** | D15 a D21 (23 a 29/11) | Número divulgado nos locais autorizados. Mapa de cobertura no D16. Comércio local, se autorizado | S1 a S12. Relógio de 2 horas medido desde o D15 | Conversa com família por convite (seção 8.7), **sem plantão pago antes de P11 verde** (O01, D18) | Pedidos válidos da semana. Taxa em 2 horas (sem prova até 30 pedidos) | Divulgar fora dos cinco distritos. Mudar preço ou o teste do Pro |
| **3** | D22 a D28 (30/11 a 06/12) | Janela de medição do G3 abre no D22. D25 (03/12): pet shops e escolas autorizadas. Farmácia **não** entra, até o parecer | S1 a S13. Cobertura: categoria com pedido e zero aprovado não é divulgada | Primeira conversa com hospital (H1) **só se P11 estiver verde e o checklist da seção 8.1 estiver completo**. Um hospital, no máximo | Leitura semanal (seção 6.4) | Abrir bairro novo. Recrutar categoria nova |
| **4** | D29 a D35 (07 a 13/12) | Consolidar os núcleos. Entrevistas com 5 clientes (O01, semana 5) com a pergunta única ampliada | S1 a S13. Revisão dos pares para a seção 5, mas sem abrir nenhum sem C3 atendido | Continuar só com hospitais que responderam. Registrar cada conversa (H4) | Regra dos 30% do O01 (proposta enviada ÷ aprovado) | Mudar texto de página sem registro. Abrir C3 sem texto próprio |

**Checklist antes de cada canal novo (vale para toda semana):**

- [ ] Permissão escrita de quem administra o local, com data.
- [ ] Texto revisado (seção 3.3 ou S1 a S13).
- [ ] Nenhum dado de terceiro no material.
- [ ] Nenhuma alegação de saúde, de prazo, de resultado ou de parceria.
- [ ] Registro na planilha de canal, com número de contatos, respostas e opt-outs.

**Checklist antes do primeiro contato com hospital:**

- [ ] P11 verde (seguro de responsabilidade civil cotado e parecer trabalhista) `[CONDICIONAL: depende de parecer]`.
- [ ] Pessoa jurídica aberta.
- [ ] Roteiro H-A e one-pager revisados pelo advogado.
- [ ] Hospital escolhido fora da rede pública, ou parecer escrito para a rede pública.
- [ ] Nenhum item do conjunto de "não prometer" da seção 8.5 presente no material.
- [ ] Dono de acordo em registrar a conversa em planilha, sem dados de paciente.

---

## 11. Perguntas para o advogado (copie e envie)

1. O convite por WhatsApp a quem pediu contato pelo concierge (S1 a S3) se apoia no art. 7, V, da LGPD (procedimento preliminar a pedido do titular)? Qual o texto mínimo de informação que deve acompanhar a primeira resposta?
2. A lista mínima de não contatar (número e data, sem outros dados) é adequada, e por quanto tempo pode ficar?
3. Cartaz com QR de WhatsApp em comércio e em prédio precisa de algum aviso específico? Há norma de condomínio ou municipal aplicável que eu deva conferir?
4. Grupo de bairro e grupo de condomínio: a publicação de um serviço com autorização do administrador tem algum limite legal além da regra do grupo?
5. A conversa com equipe de alta do hospital, para oferecer informação sobre a linha Cuidado, é divulgação da linha no sentido do DECISOES, seção 5? Mesmo sem preço?
6. Hospital da rede pública: o art. 64 do Código de Ética Médica se aplica a uma empresa que não é clínica do médico, quando o médico é o dono da empresa? Qual o limite de conduta recomendável para o dono?
7. Farmácia: pode haver material do WorkEasy em farmácia, sendo o dono médico? O art. 68 se aplica?
8. Para os profissionais de outras áreas que trabalhem em hospital (enfermagem, serviço social), qual o código de conselho que se aplica a receber ou oferecer remuneração por encaminhamento? `[incerto]`
9. A hipótese de tratamento de dados de saúde da linha Cuidado (contato de emergência, relatório do dia, nome do assistido) é qual, dada a regra de dado sensível do art. 11?
10. A cláusula de não contorno (P16) deve entrar ou não? O art. 51, IV, do CDC impede?
11. Qual o texto correto para a retenção de registro de contato sem consentimento depois de uma recusa (S10)?

---

## 12. O que não verifiquei

- **Texto oficial do Código de Ética Médica.** Li o texto de 2018 reproduzido numa edição comentada (fonte 4). O PDF do CFM (`portal.cfm.org.br`) veio sem camada de texto, e a página `sistemas.cfm.org.br` pediu senha. Alterações posteriores, citadas em comentário, não conferi `[incerto]`.
- **LGPD e CDC na versão original.** Os textos que li são as publicações originais de 2018 e de 1990. O próprio site avisa que podem não refletir alterações posteriores `[incerto]`. O endereço planalto.gov.br bloqueou o acesso.
- **Guia da ANPD.** Li a versão de fevereiro de 2024 por extração do PDF. Conferi os trechos citados, não o guia inteiro.
- **Regras de Facebook e Instagram para grupos.** Não li. Toda regra de grupo deve ser lida no próprio grupo `[incerto]`.
- **Regras de condomínio e convenção.** Não li. Pedir ao síndico ou à administradora.
- **Regras de conselho de enfermagem e de serviço social.** Não li. Não cito nenhuma.
- **Nome e função de quem atende o serviço social em cada hospital.** Não verifiquei. Precisa de ligação ou do site de cada hospital.
- **Lista nominal dos 9 hospitais** nos cinco distritos. O O01 contou pelo cadastro municipal. Não extraí os nomes.
- **Política de WhatsApp de diretrizes de mensagens e termos.** Usei só a política de mensagens (fonte 3). Não reabri as diretrizes nem os termos nesta sessão.
- **Dados de População e de vulnerabilidade** do O01 não foram reconferidos.
- **Desempenho real das páginas de categoria** no buscador. Não há dado.
- **Consulta da seção 6.3** não foi executada no banco.
- **Padrão de consentimento de marketing** em `Conta.tsx` não foi conferido na lógica de estado.

---

## 13. Pendências e lacunas do produto (não corrigidas aqui)

1. **Páginas por bairro sem texto local.** O HTML pré-renderizado usa só o template. Os profissionais aparecem no cliente, não no HTML. C3 (seção 5.3) não se cumpre sem mudança de produto.
2. **Geração em massa.** `prerender.mjs` gera 11.250 páginas por bairro com texto de template, todas `noindex`. Avaliar se só os pares de `seo-local.json` devem ser gerados. Não alterei o gerador.
3. **Páginas de bairro levam a `/pedido`.** O botão "Pedir este serviço" funciona como funil, o padrão de passagem que o Google descreve.
4. **Páginas de ocupação indexáveis** (`/servicos/<slug>`) são geradas a partir do texto da política. Não avaliei se a qualidade delas é suficiente para o critério de conteúdo em escala.
5. **`/pedido` sem backend aceita os 96 bairros.** A restrição ao piloto é só operacional.
6. **Sem aviso ao prestador sobre pedido novo.** Não há gatilho em `requests`. Está marcado como `[PLANEJADO]` no O01.
7. **Sem campo de ensaio em `requests`.** A exclusão é manual.
8. **`admin_metrics` sem recorte** por bairro, categoria ou tempo até a primeira proposta.
9. **Divergência com o O01 (D25):** farmácias como ponto de divulgação. Este documento deixa farmácia fora até parecer. Decisão do dono.
10. **Divergência de calendário:** o O01 (D18) marca a primeira família por convite sem condicionar a P11. Este documento só permite conversa, sem plantão pago antes de P11 verde. Alinhar com o O01 antes do D18.
11. **Hospitais:** o O01 (D25) prevê uma conversa de hospital com P11 verde. Este documento acrescenta o checklist da seção 8.1 e a regra "rede pública só com parecer". Alinhar.
12. **Retenção de contato recusado (S10).** Precisa de parecer.
13. **Cláusula de não contorno (P16)** segue aberta no termo de uso, como decisão do advogado.

**Placeholders que o dono precisa preencher:** `{nome}`, `{bairro}`, `{serviço}`, `{link wa.me}`, `{e-mail}`, `{telefone da operação}`, `{nome do profissional}`, `{valor em reais}`, `{data}`, `{horário limite}`, `[DECISÃO DO DONO]` (prazo de retenção do registro de contato).

---

## 14. Fontes abertas em 08/11/2026

| # | Fonte e endereço | O que li | Trecho citado |
|---|---|---|---|
| 1 | Google Search Central, "Spam policies for Google Web Search". `https://developers.google.com/search/docs/essentials/spam-policies` | Seções "Doorway abuse" e "Scaled content abuse". A página não mostra data | "Doorway abuse is when sites or pages are created to rank for specific, similar search queries." "Creating substantially similar pages that are closer to search results than a clearly defined, browseable hierarchy" (exemplo de doorway). Scaled content abuse: "Creating many pages where the content makes little or no sense to a reader but contains search keywords" |
| 2 | Lei 13.709/2018 (LGPD), texto original na Câmara. `https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-publicacaooriginal-156212-pl.html`. A página avisa que pode não refletir alterações posteriores | Arts. 5 (II, XII), 6 (I), 7 (I, V, IX, § 4º), 8 (§§ 2º, 4º, 5º), 10 (caput, § 1º), 11 (caput; II, f), 16 (I), 18 (§ 2º) | Art. 5, XII: "manifestação livre, informada e inequívoca pela qual o titular concorda com o tratamento de seus dados pessoais para uma finalidade determinada". Art. 8, § 4º: "as autorizações genéricas para o tratamento de dados pessoais serão nulas". Art. 11, II, f: "tutela da saúde, em procedimento realizado por profissionais da área da saúde ou por entidades sanitárias" |
| 3 | WhatsApp Business Messaging Policy. `https://whatsappbusiness.com/policy/`. A página mostra "Last updated: September 23, 2026" | Itens (a) permissão, (b) opt-out, (c) janela de 24 horas e modelos; aplicação em escala | "You may only contact people on WhatsApp if: (a) they have given you their mobile phone number or username; and (b) you have received opt-in permission from the recipient confirming that they wish to receive subsequent messages or calls from you." "You must respect all requests (either on or off WhatsApp) by a person to block, discontinue, or otherwise opt out of communications from you via WhatsApp" |
| 4 | Código de Ética Médica, Resolução CFM 2.217/2018, texto reproduzido em "Código de Ética Médica: comentado e interpretado", de Edmilson de Almeida Barros Júnior (2019). PDF: `https://saude.ufpr.br/epmufpr/wp-content/uploads/sites/42/2019/05/CEM-2018-EDMILSON-PROTEGIDO.pdf`. Aberto por extração local de texto. Edição comentada, não o texto oficial do CFM | Arts. 59, 64, 68, 73 e 75 | Art. 59: "Oferecer ou aceitar remuneração ou vantagens por paciente encaminhado ou recebido, bem como por atendimentos não prestados." Art. 64: "Agenciar, aliciar ou desviar, por qualquer meio, para clínica particular ou instituições de qualquer natureza, paciente atendido pelo sistema público de saúde ou dele utilizar-se..." Art. 68: "Exercer a profissão com interação ou dependência de farmácia..." Art. 73: "Revelar fato de que tenha conhecimento em virtude do exercício de sua profissão, salvo por motivo justo, dever legal ou consentimento, por escrito, do paciente." Art. 75: "Fazer referência a casos clínicos identificáveis, exibir pacientes ou imagens que os tornem reconhecíveis em anúncios profissionais ou na divulgação de assuntos médicos em meios de comunicação em geral, mesmo com autorização do paciente." |
| 5 | ANPD, Guia orientativo "Hipóteses legais de tratamento de dados pessoais: legítimo interesse", fev/2024 (53 p.). `https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_legitimo_interesse.pdf/@@download/file` | Avaliação preliminar; Exemplo 1 (p. 8); Exemplo 5 (pp. 17 a 18) | Sobre dado sensível: a hipótese do legítimo interesse "não é aplicável ao tratamento de dados pessoais sensíveis" (avaliação preliminar). Exemplo 1 (clínica): "a hipótese legal do legítimo interesse não pode ser aplicada" para dados de saúde. Exemplo 5: "prevê um mecanismo de descadastramento" |
| 6 | Lei 8.078/1990 (CDC), texto original na Câmara. `https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-publicacaooriginal-1-pl.html`. Mesmo aviso de versão original | Art. 37, §§ 1º e 3º | Art. 37, § 1º: "É enganosa qualquer modalidade de informação ou comunicação de caráter publicitário, inteira ou parcialmente falsa". § 3º: a publicidade é enganosa por omissão quando deixar de informar sobre dado essencial do produto ou serviço |

**Tentativas que não deram texto legível:** `planalto.gov.br` (LGPD, bloqueio de acesso); `sistemas.cfm.org.br` (PDF com senha); `portal.cfm.org.br/images/PDF/cem2019.pdf` (sem camada de texto); `cem.cfm.org.br` (HTTP 503); `transparencia.crmmt.org.br` (domínio fora da rede permitida); `gov.br/anpd` página de apresentação (sem o texto do guia, que foi lido pelo arquivo).

**Documentos do repositório lidos:** `apps/web/docs/DECISOES.md`; `apps/web/docs/ARQUITETURA.md` (partes indicadas); `apps/web/data/neighborhoods.json`; `apps/web/data/seo-local.json`; `apps/web/scripts/prerender.mjs` (partes indicadas); `apps/web/pages/cliente/concierge.ts`; `apps/web/pages/cliente/Pedido.tsx` (partes indicadas); `apps/web/config/features.ts`; `apps/web/config/neighborhoods.ts`; `apps/web/README.md`; `apps/web/test/seo/prerender.test.ts` (linha 383); `apps/web/pages/conta/Conta.tsx` (partes); `apps/web/docs/operacao/01-plano-de-45-dias-concierge.md` (§§0, 1.3, 3, 4, 5.1, 6, 7, 10, 11); `apps/web/docs/operacao/02-recrutamento-de-prestadores.md` (§§4, 5, 6.5, 12); `apps/web/docs/operacao/05-templates-whatsapp.md` (partes); `apps/web/docs/operacao/06-manual-do-cuidado.md` (§§1.3, 2); `apps/web/docs/juridico/01-termos-de-uso.md` (cláusula 6.5; P16); `apps/web/docs/juridico/02-termos-do-prestador.md` (17.2); `apps/web/docs/juridico/04-politica-de-cancelamento-e-reembolso.md` (1.2); `apps/web/docs/juridico/05-politica-de-avaliacoes-e-moderacao.md` (1.6); `apps/web/supabase/migrations/20261019000001_identity.sql` (enum `proposal_status`); `20261019000004_marketplace.sql`; `20261019000008_notifications.sql`.

---

## Apêndice: relação com outros documentos do plano

- O01 (45 dias): calendário, metas G1 a G4, janela, Trilhas A, B e C. Este documento segue o O01 e não o altera.
- O02 (recrutamento): canais de profissionais, LGPD de contato profissional, regras de WhatsApp, conselhos. Referenciado, não repetido.
- O05 (modelos WhatsApp): modelos de utilidade do sistema. Os roteiros S1 a S13 são de atendimento manual.
- O06 (manual do Cuidado): operação do plantão e tabela de "nunca". Referenciado para a seção 8.
- O08 (métricas e portões): fórmulas finais e `kpis.sql`. Se houver divergência com a seção 6, vale o O08, como diz o O01 (§5.1).
