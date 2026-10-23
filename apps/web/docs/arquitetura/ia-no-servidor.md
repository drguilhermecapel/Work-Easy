# IA no servidor: rascunho de orçamento e resumo semanal do Cuidado

Contrato das duas funções de IA opcional que o plano permite **somente no servidor**:

| Função | Quem usa | O que faz | Onde aparece |
|---|---|---|---|
| `quote-assist` | prestador | propõe itens de orçamento e um texto de abertura a partir da descrição do trabalho | botão "Sugerir itens com IA" em `/pro/orcamentos` |
| `care-summary` | família (linha de cuidado) | resume, em linguagem simples e **sem conteúdo clínico**, os relatórios dos plantões dos últimos 7 dias de uma casa | botão "Resumo da semana" em `/cuidado/relatorios` |

Ambas seguem o padrão de `request-assist` (assistente de pedidos, `docs/ARQUITETURA.md`, "Assistente"):
`handler.ts` com dependências injetadas, `index.ts` que monta as dependências reais, saída estruturada,
tratamento de recusa e de resposta incompleta, 503 sem `ANTHROPIC_API_KEY`, cota por usuário e por hora
consumida de forma atômica **antes** de chamar o modelo, CORS pelo `handler-kit` e registro de auditoria sem o texto.

Estado: protótipo, **não implantado** e **não testado contra a API real** (não há chave neste repositório). O que
foi exercitado são os handlers com modelo simulado (Vitest), a checagem de tipos e o lint do Deno. Os limites
do que isso prova estão na seção "O que não foi testado nem conferido".

## 1. Princípios

1. **Só no servidor, só opcional.** A chave não existe no app. Sem `ANTHROPIC_API_KEY` as funções respondem
   503 e as telas mostram que a IA não está ativada; todo o resto do app funciona igual.
2. **Nada é salvo nem enviado por conta própria.** O orçamento sugerido só preenche o formulário, que o
   prestador edita e salva como sempre. O resumo é mostrado e descartado. As funções não escrevem em tabela
   de negócio; a única escrita é a linha de auditoria e o contador da cota.
3. **O texto das pessoas é dado, nunca instrução.** Vai ao modelo dentro de blocos delimitados, com `<` e `>`
   trocados por `‹` e `›` para que o texto não consiga fechar o bloco. As instruções ficam no `system` e
   nunca contêm dados.
4. **O modelo não tem ferramentas e responde um esquema JSON.** A requisição (`messageParams`,
   `_shared/ai-model.ts`) não leva `tools` nem `tool_choice`; o formato aceito é só `output_config.format`
   (JSON Schema). Pensamento desligado, esforço baixo.
5. **A saída é validada de novo no servidor.** Esquema, limites, listas fechadas (unidades, referências de
   preço), e recusa de qualquer texto com link, marcação, contato, frase que mande o modelo ou o leitor fazer
   algo fora do escopo, vocabulário clínico ou de urgência (resumo) e nomes conhecidos (resumo).
   Se algo falha, a resposta inteira é descartada (502) e a pessoa faz à mão.
6. **Preço nunca é inventado.** O modelo só aponta (`price_ref`) para um preço de referência que o próprio
   prestador mandou; o servidor preenche o valor. Sem referência, o preço volta `null`.
7. **Não clínico, sempre.** O resumo não diagnostica, não interpreta saúde, não opina sobre remédio, dose ou
   tratamento e não julga gravidade nem urgência. Relatório que cita saúde nem chega ao modelo. A orientação de
   saúde (ligar 192, SAMU, ou procurar um médico) é um texto fixo escrito pelo servidor, não pelo modelo.

## 2. `quote-assist`

### Requisição

`POST /functions/v1/quote-assist` com o JWT do usuário (`Authorization: Bearer ...`).

```json
{
  "description": "Pintar sala e corredor, uns 40 m² de parede, duas demãos, material incluso",
  "occupation_slug": "pintor",
  "reference_prices": [
    { "label": "Pintura de parede", "unit_price_cents": 3500, "unit": "m2" }
  ]
}
```

| Campo | Regra |
|---|---|
| `description` | obrigatório, texto de 10 a 2000 caracteres (sem espaços nas pontas) |
| `occupation_slug` | opcional; identificador `^[a-z0-9][a-z0-9-]{0,99}$` que exista em `occupations`; senão 400 (`occupation_slug: ocupação desconhecida`). Dá ao modelo o nome da ocupação e restringe as unidades às de `occupation_policies.price_units` (mais `unidade`) |
| `reference_prices` | opcional; até 20 itens `{ label, unit_price_cents, unit? }`: `label` de 1 a 80 caracteres, `unit_price_cents` inteiro de 0 a 10 000 000 (R$ 100.000,00), `unit` uma das unidades abaixo |

Unidades: `unidade` (peças e materiais) e as do catálogo (`price_unit`): `hora`, `dia`, `servico`, `m2`, `sessao`,
`plantao`, `mes`, `projeto`, `km`, `pacote`, `pagina`, `palavra`, `aula`, `evento`, `visita`.

### Resposta 200

```json
{
  "ok": true,
  "data": {
    "intro": "Olá! Segue a proposta para a pintura da sala e do corredor.",
    "items": [
      { "description": "Pintura de parede, duas demãos", "quantity": 40, "unit": "m2", "unit_price_cents": 3500 },
      { "description": "Tinta e material", "quantity": 1, "unit": "unidade", "unit_price_cents": null }
    ],
    "ai_generated": true,
    "notice": "Sugestão feita por inteligência artificial. Confira ..."
  }
}
```

Limites de cada item, espelhando `private.compute_quote_total` / `quote_items_invalid` (`07_quotes_reviews.sql`):

- de 1 a 20 itens (a tabela aceita até 200; um rascunho não precisa de mais);
- `description`: texto de 2 a 160 caracteres, sem link, marcação, contato, frase de instrução nem valor em reais;
- `quantity`: número maior que zero, até 100 000, arredondado a 3 casas (o formulário aceita até 3);
- `unit`: da lista permitida (a da ocupação, quando informada);
- `unit_price_cents`: **somente** o preço de uma referência enviada (a unidade da referência prevalece sobre a que o
  modelo escolheu) ou `null`. O banco exige preço em todo item (`quote_items_invalid`), então o formulário deixa o
  campo vazio e o prestador precisa preenchê-lo antes de salvar;
- a soma dos itens com preço (`round(quantidade x preço)`, meio para cima, como o banco) não passa de 2 147 483 647 centavos
  (`quotes.total_cents` é `int`);
- `intro`: até 500 caracteres, sem valores, links ou contatos.

### Erros

Envelope `{ "ok": false, "error": { "code", "message", "details?" } }`.

| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_input` | corpo fora das regras acima (a lista de campos vem em `details`) |
| 400 | `invalid_json` | corpo que não é JSON |
| 401 | `unauthorized` | sem sessão válida |
| 405 | `method_not_allowed` | método diferente de POST (OPTIONS responde 204 com CORS) |
| 422 | `assist_declined` | o modelo recusou (`stop_reason: refusal`) |
| 429 | `assist_rate_limited` | a cota da hora acabou (ou `ASSIST_HOURLY_LIMIT=0`) |
| 502 | `assist_unavailable` | resposta cortada (`max_tokens`), sem texto, ou saída inválida pelas regras acima, ou falha da API |
| 503 | `assist_not_configured` | sem `ANTHROPIC_API_KEY`, ou chave recusada pela API |
| 503 | `assist_busy` | limite de taxa da API |
| 504 | `assist_timeout` | a API não respondeu a tempo (30 s, uma nova tentativa) |
| 500 | `internal` | erro inesperado (inclui falha do banco ao consumir a cota: o modelo não é chamado) |

A ordem das verificações é: sessão (401), chave (503), corpo (400), ocupação (400), **cota (429)**, modelo. Nada
disso consome cota antes da etapa da cota.

## 3. `care-summary`

### Requisição

`POST /functions/v1/care-summary` com o JWT do usuário.

```json
{ "household_id": "7d3f0c52-6b0b-4a64-9d5e-0c8f6c6a1a10" }
```

A casa tem de ser **do próprio usuário** (`households.owner_id = auth.uid()`). Casa que não existe, casa de outra
pessoa e casa que um administrador enxerga pelo RLS recebem a mesma resposta: **403 `not_allowed`**, sem ler nenhum
relatório e sem consumir cota.

### O que o servidor lê (RLS vale em tudo)

Todas as leituras usam o cliente com o JWT do chamador (`authenticate()` em `_runtime/supabase.ts`), nunca a chave de serviço:

- `households` (id, dono) para a conferência de propriedade;
- `shifts` da casa, em `checked_in`, `completed` ou `no_show`, cujo período **se sobrepõe** aos últimos 7 dias
  (`period=ov.[agora-7d,agora)`), no máximo 100 linhas lidas; o resumo usa os 21 mais recentes e até 60 000
  caracteres de texto (o que sobra é contado em `reports_truncated`);
- `daily_reports` desses plantões (`meals`, `activities`, `mood`, `notes`);
- `care_recipients` da casa (**só** o primeiro nome, para trocá-lo no texto);
- `providers.display_name` e `profiles.full_name` dos cuidadores dos plantões e `profiles.full_name` do próprio usuário
  (só para trocar esses nomes no texto; o que o RLS não mostrar a esta família não pode ser trocado).

### Resposta 200

```json
{
  "ok": true,
  "data": {
    "period": { "from": "2026-10-16", "to": "2026-10-23" },
    "shifts": 4,
    "reports_used": 3,
    "reports_omitted": 1,
    "reports_missing": 0,
    "reports_truncated": 0,
    "summary": {
      "overview": "Houve 3 plantões com relatório e a rotina seguiu tranquila.",
      "activities": ["A pessoa cuidada passeou no jardim com o cuidador."],
      "routine": ["Almoço com arroz e frango.", "O humor foi descrito como animado."],
      "follow_up": ["Perguntar ao cuidador se a pessoa cuidada gostou da novela."]
    },
    "mentions_health": true,
    "notice": "Resumo automático feito por inteligência artificial ...",
    "health_notice": "Há relatórios que citam saúde ou bem-estar. O WorkEasy não interpreta saúde. Para qualquer preocupação, ligue 192 (SAMU) ou procure um médico.",
    "ai_generated": true
  }
}
```

- `summary` é `null` (e **nenhuma chamada ao modelo, cota ou linha de auditoria** é feita) quando não há texto a resumir: sem plantões
  iniciados, sem relatórios enviados ou todos os relatórios citam saúde.
- `reports_omitted`: relatórios que **não foram enviados ao modelo** porque contêm vocabulário de saúde (`HEALTH_TERMS`
  em `_shared/care-summary.ts`). Aparecem como "(relatório não incluído neste resumo)" e a família lê o original na tela.
- `mentions_health` é verdadeiro se o modelo marcou o campo **ou** se algum relatório foi omitido; o modelo não consegue
  desligar o aviso. Com ele, `health_notice` traz a orientação fixa de 192/SAMU ou médico.
- Limites do texto: `overview` até 500 caracteres; `activities` até 6, `routine` até 5, `follow_up` até 5 itens de até 300
  caracteres (excesso é cortado, item vazio é descartado, item fora das regras invalida tudo).

### Erros

Os mesmos de `quote-assist` (o `message` fala de relatórios em vez de itens), mais:

| Status | `code` | Quando |
|---|---|---|
| 400 | `invalid_input` | `household_id` ausente ou que não é UUID |
| 403 | `not_allowed` | a casa não é do usuário (inclui administrador e casa inexistente) |

Ordem: sessão (401), chave (503), corpo (400), propriedade (403), leitura da semana, **cota (429)**, modelo.

## 4. Dados enviados ao modelo

O provedor é a Anthropic, pela API. Modelo: constante `MODEL` de cada `index.ts` (hoje `claude-haiku-5-5`, o
mesmo de `request-assist`; trocar exige novo deploy). Nada é enviado por quem não esteja autenticado.

### `quote-assist`

| Enviado | Não enviado |
|---|---|
| a descrição digitada no painel, limpa de caracteres invisíveis, com links, e-mails, CPF/CNPJ e telefones trocados por marcadores | título, cliente, telefone, observações e itens do formulário |
| o nome da ocupação (do catálogo) e a lista de unidades permitidas | identificador, nome, e-mail ou telefone do prestador |
| o **rótulo** dos preços de referência marcados | os **valores** dos preços de referência (o servidor os aplica depois) |

### `care-summary`

| Enviado | Não enviado |
|---|---|
| intervalo de datas, contagens, e por plantão: dia da semana e data, horário, situação (concluído, em andamento, cuidador não compareceu) | nome da casa, bairro, observações da casa, ano de nascimento, preferências, contato de emergência |
| os campos do relatório (refeições, atividades, humor, observações) com nomes trocados por `[PESSOA_CUIDADA]`, `[CUIDADOR]`, `[FAMILIAR]` e contatos por marcadores | horários e coordenadas de entrada e saída, valores do plantão, identificadores, e-mails, telefones |
| marcador de quem é a pessoa cuidada e quem é o cuidador de cada plantão | relatório que cita saúde (omitido por inteiro) |

Os marcadores que o modelo repetir na resposta viram "a pessoa cuidada", "o cuidador" e "um familiar"; **nenhum nome é
devolvido ao texto**. Se a resposta contiver um nome conhecido, é descartada.

## 5. Endurecimento contra injeção de prompt

| Medida | Onde | Teste |
|---|---|---|
| texto de pessoas só em blocos delimitados; `<` e `>` neutralizados; instruções fora dos dados | `dataBlock`, `neutralizeDelimiters`, prompts | `quote-assist.test.ts`, `care-summary-assist.test.ts` ("is data, not instructions") |
| caracteres invisíveis, de controle, bidirecionais e "tag" removidos | `cleanUserText` | `ai-assist-guard.test.ts` |
| contatos trocados por marcadores antes do envio | `scrubContacts` | idem |
| sem `tools`, sem `tool_choice`; esquema JSON como único formato | `messageParams` | `ai-assist-guard.test.ts` ("sends no tools") e os testes de handler (a requisição só tem `system`, `user`, `schema`) |
| saída recusada se tiver link, marcação, contato ou frase de instrução (pt-BR e inglês) | `unsafeReason`, `findInstruction` | tabelas de casos nos três arquivos de teste |
| preço só por referência (`price_ref` é enum dos ids enviados); resposta com id inexistente é recusada | `quoteSchema`, `parseQuoteOutput` | `quote-assist.test.ts` |
| vocabulário clínico e de urgência e nomes conhecidos recusados na saída; aviso de saúde não depende do modelo | `HEALTH_TERMS`, `nameMatcher`, `mentions_health` | `care-summary-assist.test.ts` |
| custo das verificações limitado (sem regex quadrática) | repetições limitadas em `ai-guard.ts` | `ai-assist-guard.test.ts` ("cost of the checks") |
| sinal de texto suspeito vai para a auditoria (`suspicious_input`), sem o texto | handlers | testes de auditoria |

Texto suspeito **não é bloqueado na entrada** (um prestador pode escrever "ignore" sem querer mal); ele é tratado como dado
e o que o modelo devolver passa pelas verificações acima.

## 6. Cota por hora

As três funções de IA (`request-assist`, `quote-assist`, `care-summary`) chamam a mesma `take_assist_quota(p_user, p_limit)`
(`04_marketplace.sql`): **um contador por usuário e por hora cheia em UTC**, compartilhado, com o mesmo limite
`ASSIST_HOURLY_LIMIT` (padrão 10; 0 desliga as três). Quem usa duas funções na mesma hora divide as chamadas. Separar
por função pediria uma coluna no `assist_usage` (nova migração, não feita aqui). A cota só é consumida quando o modelo
vai de fato ser chamado.

## 7. Variáveis de ambiente

Nenhuma variável nova. As funções usam as já descritas em `docs/ARQUITETURA.md`:

| Variável | Para quê |
|---|---|
| `ANTHROPIC_API_KEY` | chave da API; ausente = 503 `assist_not_configured`. Nunca em `VITE_*` nem no app |
| `ASSIST_HOURLY_LIMIT` | chamadas de IA por usuário por hora, somando as três funções (padrão 10; 0 desliga) |
| `SITE_URL`, `ALLOW_DEV_ORIGINS` | origens permitidas pelo CORS |
| `SUPABASE_URL`, `SUPABASE_*_KEY` | injetadas pelo Supabase; a chave de serviço só consome a cota e grava a auditoria |

`supabase/config.toml` não lista as funções existentes, então estas também não foram listadas. Deploy: `supabase functions deploy quote-assist care-summary`
(com JWT; não usam `--no-verify-jwt`).

## 8. Auditoria

Cada chamada que chegou ao modelo grava uma linha por `log_event` (service role, `data.via = 'service'`,
`data.requested_by` = usuário). Nunca vão o texto digitado, os relatórios, os nomes nem a resposta.

| Função | `action` | `entity` / `entity_id` | `data` |
|---|---|---|---|
| `quote-assist` | `ai.quote_assist` | `profiles` / id do usuário | `outcome`, `model`, `description_chars`, `occupation_slug`, `reference_prices`, `suspicious_input`, `items` |
| `care-summary` | `ai.care_summary` | `households` / id da casa | `outcome`, `model`, `window_days`, `input_chars`, `suspicious_input`, `shifts`, `reports_used`, `reports_omitted`, `reports_missing`, `reports_truncated`, `mentions_health` |

`outcome`: `ok`, `refusal` (com `category`), `incomplete`, `invalid_output`, `error`. Chamadas recusadas antes do modelo (401,
403, 400, 429) não geram linha. Falha ao gravar a auditoria é registrada no log e **não** derruba a resposta.

## 9. Telas

- **Orçamentos** (`components/pro/QuoteAssist.tsx`, `services/aiAssist.ts`): o botão "Sugerir itens com IA" abre um painel
  com o aviso de que o texto é processado por um serviço de IA de terceiros, o campo de descrição e, opcionalmente, os
  serviços ativos do prestador que têm preço, como preços de referência (desmarcados; faixa de preço usa o menor valor). "Gerar sugestão"
  preenche o formulário: itens novos entram depois dos que já existiam (o item vazio inicial sai), a unidade vai entre
  parênteses na descrição ("Pintura de parede (por m²)"), preço sem referência fica em branco, e o texto de abertura entra à frente das
  observações (uma vez só). Nada é salvo.
- **Relatórios do Cuidado** (`components/cuidado/WeekSummary.tsx`): cartão "Resumo da semana com IA" acima da lista, com o
  aviso do que é e do que não é enviado, um botão por casa quando há várias, o resumo com as contagens (relatórios usados, sem
  relatório, não enviados por citarem saúde) e os avisos do servidor. Aparece só se já houver plantão iniciado.
- Mensagens de erro em `services/aiAssist.ts` (por código do servidor, com "monte os itens manualmente" ou "leia os relatórios abaixo").
  `lib/errors.ts` não mudou: nenhum código novo foi criado.

## 10. Como verificar

```bash
# funções (Deno)
deno check --config supabase/functions/deno.json supabase/functions/*/index.ts
deno lint --config supabase/functions/deno.json supabase/functions

# testes
npx vitest run test/functions/quote-assist.test.ts test/functions/care-summary-assist.test.ts test/functions/ai-assist-guard.test.ts
npx vitest run test/pro/orcamentos-assist.test.tsx test/cuidado/resumo-assist.test.tsx
npx vitest run test/claims-guard.test.ts

# chamada à mão (stack local; $JWT é o token de um usuário logado, $ANON a chave publicável)
BASE=http://127.0.0.1:54321/functions/v1
H=(-H "Authorization: Bearer $JWT" -H "apikey: $ANON" -H 'Content-Type: application/json')
curl "${H[@]}" -d '{"description":"Pintar sala e corredor, uns 40 m² de parede, duas demãos","occupation_slug":"pintor"}' $BASE/quote-assist
curl "${H[@]}" -d '{"household_id":"<uuid de uma casa sua>"}' $BASE/care-summary
```

## 11. O que não foi testado nem conferido

- **Nenhuma chamada à API real.** Prompts, esquemas e o comportamento do Haiku 5.5 (qualidade do texto, recusas, taxa de
  respostas descartadas pelas verificações) não foram medidos. As verificações podem descartar respostas boas
  (falso positivo custa uma tentativa e uma unidade da cota); é preciso olhar a taxa de `invalid_output` na auditoria
  nas primeiras semanas e afinar `HEALTH_TERMS` e `INSTRUCTION_PATTERNS`.
- **Troca de nomes é heurística.** Pega os nomes cadastrados (completos e cada palavra, com ou sem acento, em qualquer caixa).
  Apelidos, diminutivos, erros de digitação, nomes de terceiros e nomes de cuidador que o RLS não mostre à família seguem no texto.
  Telefones, e-mails, CPF/CNPJ e links também são trocados por padrões, não por reconhecimento perfeito.
- **Lista de saúde é do português** e propositalmente ampla ("dor", "queda", "consulta", "médico"...): um relatório inofensivo
  pode ser omitido do resumo (a família ainda o lê na tela). O front já barra essas palavras na escrita (`findHealthTerm`); aqui é a segunda camada.
- **A consulta por sobreposição de período** (`period=ov.[...)`) foi aceita pelo PostgREST local (200, e erro 22P02 para um valor
  malformado), mas a tabela `shifts` estava vazia: o casamento com linhas reais e o RLS de cuidador/perfil (nomes legíveis para a
  família) não foram exercitados de ponta a ponta. Os testes de handler usam leituras simuladas.
- **A cota é única para as três funções** (seção 6) e a janela é a hora cheia em UTC, não uma janela deslizante.
- **Sem cache e sem histórico:** cada clique é uma chamada nova (e uma unidade de cota); o resumo não é guardado.
- **Custo:** por preço de tabela do Haiku 5.5 (US$ 0,10 por milhão de tokens de entrada e US$ 0,50 de saída, até 100 mil tokens de
  prompt, conforme a documentação da API em 2026-10-06), cada chamada custa uma fração de centavo; é estimativa, não medida. Confira o preço vigente.

## 12. Antes de ligar em produção

Rascunho para revisão de advogado. Não é parecer jurídico. Nenhuma norma foi consultada para esta lista; são perguntas, não conclusões.

1. A política de privacidade e o registro das operações de tratamento precisam citar o provedor de IA e o que é enviado (seção 4).
   O texto das telas diz "serviço de inteligência artificial de terceiros" sem nomear o provedor; ajuste se a política nomear.
2. O envio de texto de relatórios de cuidado a um provedor de IA no exterior e a retenção de dados da API (não conferida aqui)
   precisam de análise do advogado antes de os relatórios de pessoas reais passarem por essa função.
3. Decidir se o consentimento específico para o resumo é exigido (hoje o aviso aparece antes do clique, mas não há aceite registrado).
4. Definir quem responde por conteúdo errado no resumo e no orçamento sugerido (hoje: aviso de que a IA pode errar e revisão obrigatória pelo prestador).

Checklist técnico: `supabase secrets set ANTHROPIC_API_KEY=...`; conferir `ASSIST_HOURLY_LIMIT`; implantar as duas funções; fazer
poucas chamadas com dados de teste; acompanhar `audit_log` (`action like 'ai.%'`) e a taxa de `outcome != 'ok'`.
