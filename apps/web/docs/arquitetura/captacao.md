# Páginas de captação (frente E7)

Nota técnica da frente E7. Os textos das páginas não são parecer jurídico; os pontos que dependem de advogado estão na seção 8.

Três páginas públicas, sem login, que explicam o produto sem prometer o que ele não tem:

| Rota | Para quem | Botão principal | Destino |
|---|---|---|---|
| `/para-profissionais` | quem presta serviço | Criar meu cadastro | `/pro/cadastro` |
| `/para-familias` | famílias da linha de cuidado | Pedir pela linha de cuidado | `/cuidado` |
| `/como-funciona` | quem contrata | Fazer um pedido | `/pedido` |

Cada página também mostra "Falar com a equipe pelo WhatsApp" quando `VITE_CONCIERGE_WHATSAPP` está configurada (`features.conciergeWhatsApp`); sem número válido, o botão não existe. O link é o mesmo do pedido por concierge (`conciergeLink`, `https://wa.me/<dígitos>?text=…`), com uma mensagem própria de cada página, e abre em outra aba com `rel="noopener noreferrer"`.

## 1. Onde fica cada coisa

```
data/static-pages.json              texto de abertura das 3 páginas (fonte única)
pages/captacao/routes.tsx           exporta captacaoRoutes (3 rotas, páginas em lazy)
pages/captacao/ParaProfissionais.tsx, ParaFamilias.tsx, ComoFunciona.tsx
components/captacao/
  content.ts                        lê o JSON, staticPage(path), documentTitle()
  usePlatformFacts.ts               os números da plataforma (seção 3)
  copy.ts                           frases que levam número, com e sem número (testável sem tela)
  ui.tsx, Cta.tsx, SeeAlso.tsx, FactsNote.tsx, CaptacaoPage.tsx, usePageTitle.ts, styles.ts
test/captacao/                      5 arquivos (seção 7)
```

`AppShell.tsx` recebe duas linhas: o `import { captacaoRoutes }` e `{captacaoRoutes}` dentro de `<Routes>`, depois de `{plantoesRoutes}`. Nada mais do shell foi tocado. Home, Navbar e rodapé não têm link para as páginas: o orquestrador acrescenta, no rodapé de outra frente.

## 2. Texto: uma fonte só, para o HTML estático e para a tela

`data/static-pages.json` é uma lista de `{ path, title, description, h1, paragraphs, links }`. Duas leituras:

- `scripts/prerender.mjs` (frente E4) escreve cada entrada como página estática: `h1`, os parágrafos e a lista "Veja também". Nesta branch o prerender ainda não lê este arquivo; a frente E4 faz essa ligação.
- As páginas do app renderizam **o mesmo `h1` e os mesmos parágrafos**: o `h1` é o da entrada, o primeiro parágrafo abre a página e os outros três abrem as seções de texto, na ordem. O que o rastreador lê no HTML continua na tela depois que o React monta. O teste `expectPageBasics` confere que os quatro parágrafos aparecem inteiros.

Regras do arquivo (o teste `static-pages.test.tsx` aplica as regras de texto do `INVENTED_DATA` do prerender, mais as de caminho):

- `title` até 60 caracteres e `description` até 155; títulos, descrições e `h1` não se repetem. O prerender acrescenta " | WorkEasy" ao título; `documentTitle()` faz o mesmo, e a aba mostra o mesmo texto do HTML estático.
- Exatamente quatro parágrafos distintos (o mínimo pedido era três), cada um com frases de verdade.
- `path` em minúsculas com hífen, fora das telas do app (`/pro`, `/cuidado`, `/pedido`…).
- **Nenhum preço, nota ou contagem de avaliações no arquivo.** O prerender recusa `R$ 49`, "49 reais", "4,5 estrelas" e "10 avaliações". Os números do Pro e dos limites só aparecem na tela, lidos da plataforma.
- Os mesmos termos barrados por `test/claims-guard.test.ts`, que lê o arquivo sozinho. A conferência é **linha a linha**: "informado, não verificado" tem de ficar numa linha só, tanto no JSON quanto no TSX.

Para mudar um texto de abertura, edite o JSON: a página e o HTML estático mudam juntos.

## 3. De onde vêm os números

Regra: **uma página só imprime número que leu da plataforma agora**. Sem leitura, a frase fica sem número e diz onde ver (a tela de assinatura, a página do serviço).

`usePlatformFacts()` junta o que já existe:

| Número | Leitura | Página |
|---|---|---|
| preço do Pro | `getProPriceCents()` (`services/proBilling`) | profissionais |
| dias de teste | `getProTrialDays()` | profissionais |
| propostas novas por mês no grátis | `getFreeProposalsPerMonth()` | profissionais |
| comissão ligada ou não | `loadPublicSettings().commissionEnabled` (`config/features`) | profissionais |
| propostas por pedido | `loadPublicSettings().proposalLimit` | como funciona |
| dias por semana com o mesmo cuidador | `loadPublicSettings().laborLockDaysPerWeek` | famílias |

Todas leem `platform_settings`, cujas chaves não internas são públicas por RLS (inclusive `pro_trial_days` e `free_proposals_per_month`, que entraram sem `internal`). Casos:

- **Demonstração (sem backend):** nada é real, nada é impresso. Aviso: "Nesta demonstração não há valores reais".
- **Backend que não responde:** `loadPublicSettings` devolve o próprio objeto `DEFAULT_SETTINGS` quando não consegue ler. Esses padrões **não são valores lidos**, então `loadPlatformFacts` os descarta comparando a referência (`settings !== DEFAULT_SETTINGS`). Se a frente dona de `config/features.ts` mudar esse retorno para uma cópia, `backend-unreadable.test.tsx` falha e avisa. Aviso na tela: "Não foi possível ler esses valores agora".
- **Valor 0 ou ausente** (sem teste grátis, grátis sem limite): `getProTrialDays` e `getFreeProposalsPerMonth` devolvem `null`, e a frase fica sem número, sem afirmar que existe teste nem que existe limite.
- **Lendo:** a linha mostra "Carregando…", nunca um número antigo.

`loadPublicSettings` guarda a primeira resposta da sessão. Por isso os testes de backend ficam em arquivos separados por cenário.

## 4. O que cada página afirma e o que evita

**Profissionais.** Ferramenta grátis: página própria, serviços e preços, agenda, pedidos e propostas, orçamentos com link, clientes. Pro: cobrança de clientes próprios por Pix, boleto ou cartão na conta de recebimento do Asaas (sem comissão do WorkEasy; tarifas do Asaas são dele) e propostas sem o limite mensal. Cadastro: passos, documentos que a regra da ocupação pode pedir (lista de `VERIFICATION_LABELS`) e duas leituras de "conferido": a **regra** da ocupação (conferida ou a confirmar com advogado, como a página do serviço mostra) e o **registro do profissional** ("informado, não verificado" até a equipe conferir; depois "confirmado pelo WorkEasy"). Não promete clientes, pedidos, renda, pagamento nem posição nas buscas.

**Famílias.** Modelo de plantão (casa, primeiro nome, plantão com valor combinado, oferta a cuidadores aprovados, o primeiro que aceita fica), entrada e saída com localização opcional, relatório do dia não clínico, limite semanal explicado sem tomar partido (o que o app faz, o que a família pode fazer, "isto não é orientação jurídica"), o que a linha não é (sem procedimento de enfermagem, sem medicamento, sem emergência: **192, SAMU**; sem campo para dado de saúde; sem pagamento pelo app; sem vínculo registrado) e perguntas frequentes. O modelo de plantões (`supabase/migrations/20261019000009_care.sql`) não tem ligação com cobrança: o valor combinado é acertado direto entre família e cuidador.

**Como funciona.** Pedido, propostas (até o limite lido), escolha, atendimento. **Pagamento e avaliação aparecem como condicionais**: o pagamento pelo app depende de estar habilitado e de o profissional ter ativado o recebimento; a avaliação só existe depois de atendimento concluído e pago pelo app. Sem isso, valor e forma de pagamento são combinados direto. Nada de pagamento "retido" ou "liberado": `escrow_enabled` segue desligado e não é citado.

Em todas: nada de prazo ("em até N horas"), de cliente, de avaliação ou de depoimento inventado.

## 5. Linha de cuidado: portão D12

`docs/DECISOES.md` (D12 e seção 5) diz que o menu Cuidado não deve ser divulgado antes dos pré-requisitos. A página `/para-familias` existe a pedido do plano, e por isso o **primeiro parágrafo diz que a linha ainda não está aberta ao público em geral**. Esse parágrafo é o `lead` da página e também o do HTML estático. Quando o dono abrir a linha, trocar essa frase no JSON (um lugar só). Enquanto o portão não abrir, **não linkar `/para-familias` no rodapé nem na Home**; o link está só nas outras páginas de captação. A rota passa a existir no app quando o orquestrador integrar esta frente, e a decisão de publicar a página, mesmo sem link, cabe ao dono pelo D12.

## 6. Acessibilidade

- Um `h1` por página (o do JSON), seções em `h2`, itens em `h3`; sem salto de nível. Listas com `role="list"` onde o Tailwind tira os marcadores.
- Perguntas frequentes em `<details>/<summary>` nativos.
- Link externo (WhatsApp) diz "abre em outra aba" para leitor de tela.
- Avisos (`role="note"`) para o estado da demonstração e para o número de emergência.
- A aba recebe o título da entrada (`usePageTitle`) e devolve o anterior ao sair. Se a frente E4 trouxer um hook de título equivalente, ele pode substituir `usePageTitle` na integração.

## 7. Testes

`npx vitest run test/captacao test/claims-guard.test.ts test/routes.test.tsx`: 7 arquivos, 95 testes, todos passando nesta branch. Os cinco arquivos de `test/captacao`:

- `static-pages.test.tsx`: forma do JSON e limites; regras do prerender (caminho, reservados, nenhum preço/nota); uma rota por entrada; cada página registrada no `AppShell` com o seu `h1` dentro de `<main>`; cada link da lista leva a uma tela que existe (rota desconhecida redireciona para `/`, e a localização mostra).
- `demo.test.tsx`: sem backend, as três páginas; sem `R$` nem número de dias ou propostas; botão e mensagem do WhatsApp; número malformado; título da aba.
- `backend.test.tsx`: com `platform_settings` simulada, imprime preço, teste, limite grátis, limite por pedido e limite semanal; singular; zero; preço que não é número; só `select` em `platform_settings`.
- `backend-unreadable.test.tsx`: leitura com erro; nenhum padrão de `config/features` aparece.
- `copy.test.ts`: cada frase com número, com e sem número.

Também: `npx vitest run test/claims-guard.test.ts test/routes.test.tsx`, `npx tsc --noEmit -p .` e `npx eslint components/captacao pages/captacao test/captacao AppShell.tsx --max-warnings 0`.

Os testes simulam o Supabase (`test/web/fakeSupabase.ts`). Ainda não há verificação de que eles falham quando um padrão vaza como se fosse lido: isso fica como pendência.

## 8. Para o advogado, o dono e o orquestrador

- **Citação não conferida.** As páginas **não citam lei nem artigo**, e nesta frente não foi aberta nenhuma fonte primária. Qualquer norma sobre o trabalho doméstico fica `[incerto]` até o advogado confirmar na fonte oficial. Se confirmada, o ponto de inclusão é o parágrafo 3 de `/para-familias` e o componente `LimitDetail`.
- **Textos para revisão jurídica:** o limite semanal e a contratação direta (`LimitDetail`, FAQ "Posso contratar o cuidador diretamente?"), "linha ainda não aberta ao público", "o WorkEasy não cobra comissão" (só quando a plataforma diz que está desligada), a lista do que o WorkEasy não promete.
- **Sitemap:** as três rotas entram pelo prerender (frente E4) assim que o JSON for lido; nada a fazer aqui.
- **Rodapé:** `/para-profissionais` e `/como-funciona` podem ser linkados no rodapé de outra frente; `/para-familias` só depois do portão D12 (seção 5).
- **Pendências de dado:** `PlatformFacts` não traz o preço do Pro pelo `loadPublicSettings` (usa `getProPriceCents`, que devolve `null` se ilegível). Se `config/features.ts` passar a expor teste e limite grátis, `usePlatformFacts` pode ler tudo de lá.

## 9. Limites desta verificação

Testes em jsdom. Os fatos de produto citados nas páginas (ordem nas buscas, telefone visível só após aceite, prazo de aceite do horário, limite semanal de plantões, documentos e quem os lê, cancelamento do teste, cartão na página do Asaas) foram conferidos nas migrações e funções de `supabase/`. **Layout, quebra de linha em celular e contraste não foram vistos em navegador real.** Os botões usam as mesmas classes do resto do app (`bg-primary` com texto branco), cujo contraste a frente de acessibilidade avalia. O backend e o Asaas não foram exercitados: os testes simulam o Supabase. Nenhuma das frases sobre pagamento, WhatsApp ou aprovação foi vista em operação real; elas descrevem o que o código e o contrato (`docs/ARQUITETURA.md`) fazem.
