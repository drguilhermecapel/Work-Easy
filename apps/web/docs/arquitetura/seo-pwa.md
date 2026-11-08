# SEO e PWA

Contrato técnico das páginas estáticas, dos metadados e do aplicativo instalável. Vale para o build do site
(`npm run build`); os apps nativos (`--mode native`, `VITE_ROUTER=hash`) não geram páginas nem service worker.

> **Estado.** Protótipo não publicado, sem visitantes reais e sem ranking medido. Nada abaixo prova posição em
> buscadores. Os números de Lighthouse são de uma máquina de desenvolvimento compartilhada, em modo móvel
> simulado, e servem para comparar antes e depois, não como promessa de desempenho em produção.

## 1. Mapa de arquivos

| Arquivo | Para quê |
|---|---|
| `scripts/prerender.mjs` | Depois do `vite build`, escreve o HTML estático, o JSON-LD, o sitemap e o `robots.txt` |
| `catalog/prose.mjs` e `prose.d.mts` | Texto das páginas, escrito uma vez: o script e o app usam o mesmo módulo |
| `components/seo/Prose.tsx`, `components/seo/launch.ts`, `lib/useDocumentTitle.ts` | Blocos React das quatro rotas e o título da aba |
| `pages/Categories.tsx`, `AreaPage.tsx`, `OccupationPage.tsx`, `OccupationNeighborhoodPage.tsx` | As rotas que o React monta por cima do HTML estático |
| `index.html`, `index.css`, `public/og-image.png`, `public/robots.txt` | Modelo da página, tags de compartilhamento, correção do salto de layout, imagem, regras de rastreamento |
| `pwa.config.ts`, `components/PwaUpdateNotice.tsx`, `public/offline.html`, `public/offline.css` | Manifesto, regras do service worker, aviso de nova versão, página offline |
| `test/seo/*` | Testes (seção 12) |

## 2. Variáveis de ambiente

| Variável | Efeito neste assunto |
|---|---|
| `VITE_SITE_URL` | Define canonical absoluto, `og:url`, URLs do JSON-LD, imagem de compartilhamento absoluta, sitemap e a linha `Sitemap:` do robots. **Sem ela o build avisa** e escreve canonical relativo, sem sitemap e sem JSON-LD da home. Defina em produção. |
| `VITE_LEGAL_STATUS` | Só o valor exato `vigente` deixa as páginas legais indexáveis. Qualquer outro valor, ou ausência, gera `noindex` e tira do sitemap. Quem decide é o dono, depois da revisão por advogado. |
| `VITE_CONCIERGE_WHATSAPP`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Só decidem se o botão principal é "Pedir este serviço" ou "Procurar profissionais", na página estática e na rota (mesma regra de `config/features.ts`). |

## 3. O que o script gera

| Tipo (`data-prerendered`) | Caminho | Indexável? |
|---|---|---|
| `categorias` | `/categorias` | sim |
| `area` | `/categorias/<área>` | sim |
| `servico` | `/servicos/<ocupação>` | sim, se tiver 3 frases próprias (seção 5); senão `noindex` |
| `bairro` | `/servicos/<ocupação>/<bairro>` (áreas de lançamento x Zona Sul e Centro) | **não**, salvo os pares listados em `data/seo-local.json` |
| `estatica` | caminho de cada item de `data/static-pages.json` | sim |
| `legal` | `/legal/<arquivo>` de cada `content/legal/*.md` | só com `VITE_LEGAL_STATUS=vigente` |
| home | `dist/index.html` | sim (ganha JSON-LD; ver seção 6) |

Todas as páginas usam o mesmo molde (`dist/index.html`) e o mesmo layout (`<main class="max-w-4xl ..." data-prerendered="...">`),
com `<title>`, descrição, canonical, Open Graph, Twitter e JSON-LD próprios. O build falha, sem escrever nada, se uma
página sair sem título, descrição ou canonical, com título ou descrição repetidos, com frase proibida
(`test/claims-guard.test.ts`), com preço ou nota escritos no texto ou com `aggregateRating`, `offers` ou
`price` no JSON-LD.

## 4. O mesmo conteúdo antes e depois do React montar

**Problema encontrado.** O React usa `createRoot`, que troca o conteúdo de `<div id="root">`. As rotas mostravam menos
que o HTML estático: sem as frases de "como se contrata", "o que será exigido" e "profissão regulamentada?", sem os
links para as páginas de bairro e para serviços relacionados, e com outros títulos de seção. Para o Google, que
indexa o DOM depois do JavaScript, essas frases e links sumiam.

**Decisão.** Manter `createRoot` e fazer as rotas renderizarem o mesmo texto e os mesmos links, a partir da mesma
fonte (`catalog/prose.mjs`). Hidratar o HTML (`hydrateRoot`) exigiria que o servidor renderizasse os componentes
React de verdade (SSR da casca com `AppShell`, `Navbar` e contextos), o que muda o build e arquivos de outras
frentes; ficou fora.

O que mudou nas rotas (todas as mudanças são visíveis para o usuário):

- `OccupationPage`: "Também procurado como" virou frase; a lista "Preço combinado / Onde / Quem pode prestar" foi
  trocada por frases ("Como se contrata"); o texto de escopo do catálogo (`notes`) aparece como parágrafo; novas
  seções "<serviço> por bairro" e "Outros serviços de <área>"; seção "Profissão regulamentada?".
- `OccupationNeighborhoodPage`: parágrafos de abertura, as três seções de política, "Veja também", e os links
  "Procurar profissionais" e "Ofereço este serviço".
- `AreaPage`: título "Serviços desta área", frases com a contagem e o aviso das áreas de lançamento (depois da lista,
  para nada acima dela se mexer quando as políticas chegarem).
- `Categories`: a frase de abertura da página estática.
- Todas: o aviso final ("O WorkEasy está em fase inicial...") e o título da aba por rota (`useDocumentTitle`).

**Como se verifica.**

1. `test/seo/hydration-parity.test.tsx` monta o app de verdade (jsdom) em categorias, quatro áreas, 14 ocupações que
   cobrem cada jeito de a política mudar o texto (trabalho doméstico, regulamentada, menores, antecedentes, só
   empresa licenciada, base legal a confirmar...) e páginas de bairro, com e sem o número do concierge. Falha se
   um link, um parágrafo ou um título da página estática não existir no DOM depois da montagem, ou se o título da
   aba for outro. Há um controle que precisa perder coisas, para o teste não passar à toa.
2. No navegador (Chromium, Playwright), sobre o build de produção: cinco rotas (`/categorias`, duas áreas, uma ocupação e
   uma ocupação em bairro), com o HTML sem JavaScript comparado com a página depois de montar. Nenhum link, parágrafo ou
   título some; o título é o mesmo; não há erro no console. A conferência de links usa caminho e rótulo. Em `/categorias`
   a página montada tem mais links (352 contra 44), então o teste confere a presença do que existia, não a igualdade.
   Servido por `vite preview` com barra final, o resultado é o mesmo.

**Limite honesto.** Durante o carregamento (JavaScript baixando), o usuário vê o HTML estático; quando o React monta,
o conteúdo é trocado por um equivalente. Layout e classes são os mesmos nas listas de ocupações; nas demais seções
o texto é igual, o desenho é parecido. Não há hidratação.

## 5. Guarda de conteúdo próprio ("3 frases próprias")

O teste antigo contava frases de qualquer `<p>`, inclusive o aviso que toda página carrega, e passava sempre.
Agora uma frase só conta como **própria** da página de uma ocupação se for:

1. **distinta** dentro da página (a repetição conta uma vez);
2. **longa o bastante**: pelo menos 6 palavras (`MIN_SENTENCE_WORDS`);
3. **fora dos avisos** que toda página carrega e do texto da área, que todas as ocupações dela repetem;
4. **única entre as ocupações** depois de trocar por marcadores o nome da página (ocupação, área, bairro) e os números.
   "O atendimento de Pintor acontece na casa do cliente" e "O atendimento de Encanador acontece na casa do cliente"
   são o mesmo modelo, e nenhuma das duas é própria.

Uma página de ocupação precisa de **3** (`MIN_OWN_SENTENCES`) para ser indexável. Se tiver menos, o script escreve a
página com `noindex,follow`, a deixa fora do sitemap e avisa no console (não derruba o build: os dados do catálogo
mudam por outras frentes). O texto próprio de uma ocupação vem de duas fontes: a frase de "também procurado como"
(a lista de sinônimos é única por ocupação) e o campo `notes` da política (texto escrito à mão sobre o escopo).

Números do catálogo atual (1.710 ocupações): **1.144 passam** (3 ou mais frases próprias) e **566 ficam `noindex`**,
quase todas porque o `notes` tem uma ou duas frases. A saída é editorial: escrever mais frases próprias em `notes`
(o que cada serviço faz e o que não faz); a página volta ao sitemap no build seguinte, sem mexer em código.

Páginas de bairro seguem a regra de páginas-porta: o texto é o da ocupação com outro nome, então saem `noindex` e fora
do sitemap. Para indexar um par, liste `"<ocupação>/<bairro>"` em `data/seo-local.json` quando houver cadastro
aprovado ou pedido real naquele bairro. Uma ocupação indexável não torna indexáveis as suas páginas de bairro.

## 6. Dados estruturados (JSON-LD)

| Página | Blocos |
|---|---|
| categorias | `Service` (com `OfferCatalog` das áreas, sem preço) |
| área | `Service` + `BreadcrumbList` |
| ocupação | `Service` + `BreadcrumbList` |
| bairro | `Service` (com `areaServed`) + `BreadcrumbList` |
| estática e legal | `WebPage` |
| home | `Organization` e `WebSite` (só com `VITE_SITE_URL`) |

O `BreadcrumbList` repete a trilha visível (`<nav aria-label="Caminho">`), com posições 1..n e URL absoluta; o último
item é a própria página. A home é o `dist/index.html`, que a hospedagem também entrega para as rotas do app; por isso
ela **não** recebe canonical nem `og:url` (apontariam essas rotas para a home) e o bloco fica entre os marcadores
`<!--home-seo-->` e `<!--/home-seo-->`, que o script remove e reescreve a cada execução.

`Organization` tem só nome, URL, logo (`/icons/icon-512.png`) e a descrição do `index.html`. Não há `sameAs`,
telefone, endereço, e-mail, nota, avaliação nem preço, porque o projeto não tem esses dados.
O teste `prerender-head.test.ts` fixa as chaves permitidas.

## 7. Tags de compartilhamento e imagem

- `index.html` traz `og:*` e `twitter:*` genéricos, `theme-color` (`#667eea`, igual ao manifesto), `lang="pt-BR"`.
- O script **troca** as tags do molde em vez de somar (nunca há dois `og:title`), escreve canonical, `og:url`,
  `og:image` absoluta (com `VITE_SITE_URL`) e `robots` `noindex,follow` quando for o caso.
- `public/og-image.png`: 1200x630, 56 kB (WhatsApp ignora previews acima de ~300 kB; `share-assets.test.ts`
  confere o limite), formas chapadas nas cores da marca, logo de `assets/logo.svg` e a frase "Conectando quem
  precisa com quem sabe fazer." Inclui "Protótipo de demonstração", como a descrição do site. Foi gerada com o
  Chromium pré-instalado, via o módulo global do Playwright, num script descartável (não versionado: ele só
  monta um HTML 1200x630 com o SVG, a cor `#667eea`, um círculo `#764ba2` e três textos, e tira um screenshot).
  Para trocar a imagem no lançamento, regere com a mesma receita.

## 8. Sitemap e robots.txt

- Só entram páginas indexáveis (sem bairros, sem ocupações com pouco texto próprio, sem documentos legais em
  rascunho). Acima de 50 mil URLs o `sitemap.xml` vira índice de `sitemap-N.xml`.
- `lastmod` é o dia em que o **conteúdo** mudou, não o do build: data do último commit dos arquivos de onde a página
  sai (`catalog/*.json`, `data/*.json`, `catalog/prose.mjs`, `scripts/prerender.mjs`, `index.html`, ou o `.md` do
  documento legal); sem Git, a data de modificação do arquivo. Um `lastmod` que muda a cada build não diz nada
  ao rastreador. Em clone raso de CI, todas as datas viram a do commit do clone.
- `robots.txt` (a cópia de `public/` mais a linha `Sitemap:` quando há `VITE_SITE_URL`) bloqueia `/entrar`,
  `/conta`, `/pedido`, `/dashboard`, `/atendimentos`, `/cuidado`, `/admin`, `/pro/`, `/orcamento/` e `/search`.
  Bloquear não esconde nada: é só para o rastreador não gastar tempo ali.

## 9. Contrato para quem escreve as páginas estáticas e os documentos legais

### 9.1 `data/static-pages.json`

Lista de objetos. O script **não** cria nem sobrescreve este arquivo.

```json
[
  {
    "path": "/como-funciona",
    "title": "Como funciona",
    "description": "Entenda como o WorkEasy conecta clientes e profissionais.",
    "h1": "Como funciona o WorkEasy",
    "paragraphs": ["Primeiro parágrafo.", "Segundo parágrafo."],
    "links": [{ "to": "/categorias", "label": "Ver as categorias" }]
  }
]
```

Regras (o build falha, dizendo qual item está errado, antes de escrever qualquer arquivo): `path` em minúsculas, com
letras, números e hífens separados por `/`, sem barra final, e que não seja uma tela do app (`/entrar`, `/conta`,
`/pedido`, `/pedidos`, `/atendimentos`, `/dashboard`, `/pro`, `/admin`, `/cuidado`, `/orcamento`, `/agendar`, `/p`)
nem esteja sob `/servicos/` ou `/categorias/`; `title`, `description` e `h1` não vazios; ao menos um parágrafo, sem
vazios; `links[].to` caminho interno (`/...`), `links[].label` não vazio (`links` é opcional). O título ganha
` | WorkEasy` se ainda não citar o site; a descrição é cortada em 160 caracteres. As páginas passam pelas
mesmas verificações de frases proibidas e de preço. Saem indexáveis e no sitemap.

### 9.2 `content/legal/*.md`

Um arquivo por documento; o nome vira o caminho: `termos-de-uso.md` gera `/legal/termos-de-uso`. Nomes fora do
padrão `a-z`, `0-9` e hífen são ignorados com aviso; `README.md` e arquivos que começam com `_` são notas, não páginas.

- Título: `title:` do front matter (opcional, `chave: valor`), senão o primeiro `# `, senão o nome do arquivo.
  Descrição: `description:` do front matter, senão o primeiro parágrafo comum (não título, citação, lista ou tabela).
- O banner "Rascunho para revisão de advogado. Não é parecer jurídico." deve estar no próprio `.md`
  (por exemplo como citação `>` no início); o script não o acrescenta.
- Markdown aceito (função pequena, sem dependência): títulos, parágrafos, listas (aninhadas), citações, tabelas,
  blocos de código, regra horizontal, negrito, itálico, riscado, código em linha e links. HTML cru é escrito como
  texto. Links só com `http(s)`, `mailto`, `tel`, caminho (`/...`, `../`) ou âncora (`#...`); qualquer outro
  esquema (`javascript:`, `data:`) vira texto sem link. O primeiro `# ` é o único `h1`.
- Indexação: `noindex,follow` e fora do sitemap, a menos que `VITE_LEGAL_STATUS` seja exatamente `vigente`.
- O texto passa pela verificação de frases proibidas: "verificado" só como "não verificado".

### 9.3 Atenção: a rota precisa existir no app

O script só gera o HTML. Se o React não tiver uma rota para o caminho, o curinga de `AppShell.tsx`
(`<Route path="*" element={<Navigate to="/" replace />}>`) leva o visitante para a home assim que o JavaScript carrega,
e o rastreador também. Quem cria as páginas estáticas e os documentos legais precisa registrar as rotas
correspondentes (por exemplo, uma tela que renderize o mesmo item de `static-pages.json` ou o mesmo `.md`).
Isso não foi feito nesta frente (`AppShell.tsx` é de outra) e **não há teste que cubra a rota de uma página estática**.

## 10. Lighthouse (modo móvel)

Medição de antes e depois com o Lighthouse 13.6.0 (versão fixada, instalada numa pasta fora do repositório) e o Chromium
que já existe no ambiente. Build de produção (`npm run build`, sem `VITE_SITE_URL`), servido por um servidor estático com
URLs limpas, como a Netlify (arquivo, depois `pasta/index.html`, depois a casca). Três passagens por página, perfil móvel
simulado; a tabela traz a mediana. A máquina é compartilhada, e duas passagens da mesma página variam até 6 pontos de
desempenho: diferenças menores que isso são ruído.

| Página | Desempenho antes (faixa) | Desempenho depois (faixa) | LCP antes → depois (ms) | SEO antes → depois | Acessibilidade antes → depois | CLS antes → depois |
|---|---|---|---|---|---|---|
| `/` | 68 (67–68) | 74 (67–74) | 5919 → 5696 | 100 → 100 | 96 → 96 | 0 → 0 |
| `/categorias` | 64 (64) | 64 (64) | 5852 → 5851 | 92 → 92 | 96 → 96 | 0 → 0 |
| `/categorias/arquitetura-e-engenharia` | 61 (60–65) | 60 (60–61) | 12003 → 12002 | 92 → 92 | 96 → 96 | 0 → 0 |
| `/servicos/encanador` | 60 (60) | 60 (60–66) | 12313 → 12302 | 92 → 92 | 96 → 96 | 0 → 0 |
| `/servicos/encanador/moema` | 61 (61) | 61 (61) | 11851 → 11853 | 58 → 58 | 96 → 96 | 0 → 0 |
| `/entrar` | 87 (86–87) | 86 (86–87) | 3366 → 3369 | 63 → 63 | 95 → 95 | 0 → 0 |

**O que os números mostram.**

- Nas páginas de conteúdo, o HTML estático pinta em cerca de 5,6 a 6,1 s (FCP) no perfil simulado. Quando o React
  monta, o maior bloco de texto é trocado, e o LCP vai para cerca de 12 s nas áreas, ocupações e bairros. O custo é de
  JavaScript: o pacote de entrada tem cerca de 135 a 146 KiB de código não usado, e o pacote de políticas
  (`policies-*.js`) tem 1,2 MB sem compactação e é carregado para montar as rotas.
- O SEO fica em 92 nas páginas indexáveis porque o canonical é relativo neste build (sem `VITE_SITE_URL`). Com a variável
  definida, o auditor deveria passar, mas isso não foi medido. Os 58 do bairro e os 63 de `/entrar` vêm de decisões
  deliberadas: o bairro é `noindex`, e `/entrar` está no `robots.txt`.
- A acessibilidade fica em 95 a 96. A auditoria de contraste ainda falha em todas as páginas, pelos motivos da seção 13.

**O que foi feito (ganhos baratos).**

1. Salto de layout do rodapé (`index.css`, commit `ae598bd`): o rodapé fica oculto enquanto a tela de carregamento está
   sozinha em `<main>`. CLS 0 em todas as páginas medidas. O valor anterior à regra não foi medido nesta sessão.
2. Contraste dos links de texto (`pages/Categories.tsx` e `pages/AreaPage.tsx`, commit `8a5042a`): em `/categorias`, o
   número de nós com falha caiu de 48 para 4 (sobram os do rodapé). O desempenho não muda com isso.
3. Preload, tamanho de imagem e metadados: nenhuma auditoria apontou imagem de LCP sem precarga, imagem sem dimensão ou
   origem a pré-conectar (o site usa uma origem só). O CSS de bloqueio de renderização (67 KB, cerca de 450 ms
   estimados) continua como está. As tags de compartilhamento e a meta estão em `index.html` e no molde.

**O que não foi feito, e por quê.**

- Tirar o pacote de políticas e o catálogo do caminho crítico (carregamento sob demanda), ou hidratar o HTML estático
  (`hydrateRoot`). São as alavancas reais do LCP, mas mexem em `catalog/` e no `AppShell`, que estão fora desta frente.
- Contraste da cor da marca: `#667eea` sobre branco dá cerca de 3,7:1, abaixo de 4,5:1 para texto pequeno. Os botões
  principais das ocupações (`bg-primary` com texto branco) e os links da home falham. Trocar a cor é decisão do dono do
  produto, e não foi feito.
- Rodapé (`AppShell.tsx`) e home: fora das pastas desta frente.

## 11. PWA

### 11.1 Manifesto (`pwa.config.ts`)

`id`, `name`, `short_name`, `description`, `lang`, `dir`, `start_url`, `scope`, `display: standalone`, cores,
`categories`, ícones (192 e 512 `any`, 512 `maskable`, SVG) e **quatro atalhos** (procurar profissionais,
categorias, pedir um serviço, minha conta). O teste confere que todo arquivo citado existe e que cada atalho
aponta para uma rota que existe. O Chromium, via DevTools, não encontrou erro de manifesto nem de
instalabilidade no build.

### 11.2 Service worker

- **Pré-cache**: só arquivos do build (`js, css, html, png, svg`), sem `og-image.png`. As páginas de SEO (13 mil)
  não entram; o app instalado abre qualquer rota do catálogo pela casca (`/index.html`) e renderiza pelos dados
  que já estão no pacote.
- **Nunca guarda** resposta do Supabase, de API ou com credenciais. Todas as rotas de `runtimeCaching` são
  `NetworkOnly` (sem escrita em cache); uma delas cobre outras origens, os caminhos `/rest|auth|functions|storage|realtime/v1/`
  (Supabase atrás do domínio do site) e qualquer requisição com `Authorization` ou `apikey`. O teste executa os
  *matchers* do jeito que o worker os executa (convertidos em texto e recriados num escopo vazio), e falha se o
  código-fonte citar uma estratégia que escreve em cache (`CacheFirst`, `StaleWhileRevalidate`, `NetworkFirst`...).
  No navegador: depois de requisições com credenciais, o cache não muda.
- **Navegação**: a casca atende as rotas do app, exceto arquivos (`sitemap.xml`, `robots.txt`, manifesto...), que
  vão ao servidor como são, e as telas que dependem do servidor.
- **Página offline** (`/offline.html`, com `offline.css` e sem código inline, para uma futura
  Content-Security-Policy): aparece quando o visitante está sem conexão e abre `/entrar`, `/conta`, `/pedidos`,
  `/atendimentos`, `/pro`, `/admin`, `/cuidado`, `/orcamento`, `/agendar` ou `/p`. Essas navegações nunca saem do cache.
  `/pedido` não está na lista: o formulário e o rascunho funcionam sem conexão. O catálogo abre offline.
- **Atualização** (`registerType: 'prompt'`): uma nova versão fica esperando; `components/PwaUpdateNotice.tsx`
  pergunta ("Há uma versão nova do WorkEasy. Atualize para usá-la.") e só recarrega quando a pessoa aceita.
  Antes era `autoUpdate` com `skipWaiting`: o worker novo assumia as abas abertas enquanto elas ainda rodavam os
  *chunks* da versão antiga, que o pré-cache novo não tinha mais (a aba quebrava ao abrir uma rota ainda não
  visitada). Com o aviso, a aba antiga continua com os arquivos da sua versão. O script de registro deixou de ser
  injetado no `<head>` (bloqueava a renderização); o app registra o worker depois de iniciar.

### 11.3 Verificação no navegador

Conferido no Chromium (Playwright), sobre o build de produção, servido por um servidor estático com URLs limpas:

- **Manifesto**: responde 200. Tem `id`, `start_url`, `scope`, `display: standalone`, `lang: pt-BR`, `dir`, `categories`,
  quatro ícones (192 e 512 `any`, 512 `maskable`, SVG) e quatro atalhos (`/search`, `/categorias`, `/pedido`, `/conta`).
- **Service worker**: o `sw.js` gerado só tem `NetworkOnly`. Não há `CacheFirst`, `StaleWhileRevalidate`, `NetworkFirst`
  nem `CacheOnly`. Com o worker ativo, o único cache é o de pré-cache, com 155 entradas, incluindo `/offline.html`. Nenhuma
  entrada é de Supabase, de API ou de página pré-renderizada.
- **Sem conexão**: com o worker controlando a página, o servidor foi parado. `/entrar` e `/conta` mostram a página
  "Sem conexão"; `/categorias` abre pela casca, com o conteúdo do catálogo.
- **Limite do método**: o `context.setOffline` do Playwright não interrompe as requisições do próprio service worker.
  Numa primeira tentativa, `/entrar` veio do servidor (a casca), o que não prova nada. Por isso o teste parou o servidor.
- **Atualização**: o aviso (`components/PwaUpdateNotice.tsx`) não foi exercitado no navegador, porque exige duas versões
  publicadas em sequência. Coberto por `test/seo/pwa-update-notice.test.tsx`.
- **Instalabilidade**: o Lighthouse 13 não tem mais a categoria PWA. A instalação não foi medida.

## 12. Como verificar

```bash
cd apps/web
npx vitest run test/seo                      # tudo desta frente (jsdom + node)
npx vitest run test/claims-guard.test.ts     # frases proibidas nos fontes
npx tsc --noEmit -p .
npx eslint <caminhos> --max-warnings 0
npm run build                                # inclui o prerender; com VITE_SITE_URL para sitemap e JSON-LD da home
```

`vite preview` não serve as páginas pré-renderizadas: reescreve toda URL sem extensão para a casca. Para ver o
que a Netlify ou a Cloudflare Pages entregariam (arquivo, depois `<pasta>/index.html`, depois a casca com 200), use
um servidor estático que faça isso, ou abra a URL com barra final (`/servicos/encanador/`).

Testes: `prerender.test.ts` (geração, escapes, canonical, falhas), `prerender-content.test.ts` (guarda de frases
próprias e regra dos bairros, também sobre o catálogo real), `prerender-head.test.ts` (tags, JSON-LD, home,
sitemap, `lastmod`, robots), `prerender-pages.test.ts` (páginas estáticas, legais, markdown, *chunks*),
`hydration-parity.test.tsx`, `share-assets.test.ts`, `pwa-config.test.ts`, `pwa-update-notice.test.tsx`,
`neighborhood-page.test.tsx`.

Testes existentes alterados de propósito: em `prerender.test.ts`, os blocos de JSON-LD passaram de 1 para 2
(`BreadcrumbList`), os documentos exigidos viraram lista (com a primeira letra maiúscula, como no app), o aviso da
regra entrou na lista de parágrafos repetidos permitidos, a introdução de bairro é a frase que começa com
"Procura" (antes de ter a linha da zona), e o teste fraco de "3 frases próprias" saiu, trocado por
`prerender-content.test.ts`. As políticas de teste ganharam `notes`, como as do catálogo real.

## 13. Limites e pendências

- **Não publicado.** Nenhum número desta seção é de produção. Lighthouse em máquina compartilhada, com perfil simulado.
- **Hidratação.** Não há `hydrateRoot`: o React troca o conteúdo pré-renderizado depois de montar. Texto, links e títulos
  são os mesmos (seção 4), mas a troca é visível e atrasa o LCP (seção 10).
- **Conferência da seção 4.** Um rascunho anterior desta nota citava 69 páginas comparadas. Essa conferência não foi
  refeita nesta sessão, e o número saiu do texto. A conferência atual cobre cinco rotas.
- **Conteúdo de outras frentes.** `data/static-pages.json` e `content/legal/*.md` ainda não existem: as páginas estáticas
  e as legais são testadas só com fixtures. As rotas de páginas estáticas não estão em `AppShell.tsx` (seção 9.3).
- **Build sem `VITE_SITE_URL`.** Sitemap, JSON-LD da home e canonical absoluto foram conferidos só por testes com fixtures,
  não num build com a variável.
- **`index.css`.** A regra do rodapé está num arquivo que não estava na lista de arquivos desta frente. É pequena e isolada,
  e `test/seo/share-assets.test.ts` a confere junto com `AppShell.tsx`.
- **Ordem do build.** O pré-cache é calculado pelo `vite build`, antes de o `prerender` escrever as páginas. Conferi isso só
  no build atual. Se a ordem mudar, as páginas de SEO entram no pré-cache.
- **Atualização do PWA** não exercitada no navegador (seção 11.3).
