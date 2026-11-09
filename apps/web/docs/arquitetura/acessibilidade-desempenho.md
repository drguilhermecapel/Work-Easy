# Acessibilidade e desempenho

Estado em 2026-11-08, no commit `714f58a` da branch `plan/e5-acessibilidade-desempenho`, mais o
commit `35f6b93` (uma linha de tamanho de imagem, sem efeito nas medições). Não é auditoria de
acessibilidade nem laudo de desempenho: são medições automáticas e testes de contrato, com os
limites descritos no fim.

## 1. Acessibilidade

### Como foi medido

- **Varredura automática (axe-core 4.14.0)** em build de demonstração (sem as variáveis do
  Supabase), servido com `vite preview` na porta 4165 e aberto com Playwright. Regras WCAG 2.0 A/AA,
  2.1 A/AA, 2.2 AA e boas práticas. Foram 21 cenários: 12 em desktop (1280 × 800) e 9 em celular
  (375 × 812), nas telas sem sessão: `/`, `/categorias` (com e sem filtro), uma área, uma ocupação,
  uma ocupação regulada, uma ocupação com bairro, `/pedido`, `/entrar`, `/pro/cadastro` e `/legal`.
  As regras são as padrão do axe-core 4.14.0, sem filtro `runOnly`: WCAG 2.x (A, AA e 2.2 AA) e
  boas práticas, nas que o axe ativa por padrão. O harness (axe e Playwright) fica fora do
  repositório, em pasta de rascunho, como pedido.
- **Telas autenticadas** (pro, cliente, cuidado, admin, conta): testes Vitest com os fakes já
  existentes, em `test/a11y/`. Eles conferem nomes, papéis e rótulos dos formulários principais e
  das mensagens de erro. Não calculam contraste (jsdom não tem layout), por isso não contam na
  varredura.

### Números (axe-core, nós com violação)

| Regra                              | Antes | Agora |
|------------------------------------|------:|------:|
| `color-contrast`                   |   185 |   114 |
| `label-content-name-mismatch`      |    12 |    12 |
| `region`                           |    21 |    21 |
| **Total**                          | **218** | **147** |

Itens `incomplete` (o axe não consegue calcular o fundo, como texto sobre gradiente da home) não
entram no total. O "antes" é o build da base da frente (`961af70`), antes das mudanças desta frente.

Os 147 nós restantes estão **fora dos arquivos desta frente** (ver seção 5):

- 90 nós: links do rodapé em `AppShell.tsx`, `text-gray-400` (2,60:1 sobre branco). Com
  `text-gray-500` ficam em 4,84:1.
- 24 nós: botões Prestador e Médico do alternador de papel em `components/Navbar.tsx`,
  `text-gray-500` sobre `bg-gray-100` (4,39:1). Com `text-gray-600` ficam em 6,87:1.
- 12 nós: link de perfil na `Navbar`, com `aria-label` ("Perfil de ...") que não contém o texto
  visível. Afeta o critério de rótulo no nome (WCAG 2.5.3).
- 21 nós: aviso de demonstração em `DemoBanner.tsx`, fora de qualquer marco (`region`).

### O que foi feito

- **Contraste** (`index.css`, `ff0086b`): a cor primária passou de `#667eea` (3,66:1 sobre branco)
  para `#3e5ce5` (5,43:1 sobre branco; 4,68:1 sobre o fundo `primary/10`). É uma mudança visual
  de marca: depende de decisão do dono. Textos cinza-400 de telas de produto passaram a cinza-500.
- **Foco visível** para o que não desenha o próprio foco (anel de 2 px com halo branco), e
  `scroll-padding-top` para a navbar fixa não cobrir o elemento focado.
- **Movimento reduzido**: `prefers-reduced-motion` encurta animações e transições e desliga o scroll
  suave. Os indicadores de carregamento param na primeira volta; o texto ao lado diz o estado.
- **Pular para o conteúdo** (`components/AccessibilityLayer.tsx`, `6986b82`): é o primeiro item de
  tabulação; move o foco por script para o `<main id="conteudo-principal">`. Não usa âncora com `#`,
  porque o `HashRouter` dos aplicativos nativos a leria como rota.
- **Anúncio de troca de página**: uma região `role="status"` (`aria-live="polite"`) lê o `h1` da
  página nova e move o foco para `<main>`, como um carregamento de página faria.
- **Rótulos, dicas e erros ligados aos campos** (`components/fieldA11y.ts`, `828f774`): `aria-invalid`
  e `aria-describedby` nos formulários de cuidado, pro, admin, conta (entrar) e pedido. Mensagens de
  erro e de estado usam `role="alert"` ou `role="status"`.
- **Alvos de toque de 44 px no celular** (até 639,98 px): botões, `[role=button]`, `summary` e rótulos
  de checkbox e rádio, em `index.css`. Telas públicas de categorias e serviços também (`cff5335`),
  com a página atual nomeada.
- **Testes** (`test/a11y/`, 9 arquivos, `714f58a`): estrutura da página (um `main`, navegação rotulada),
  pular para o conteúdo, anúncio de rota, prefetch, contrato dos formulários principais.

### Lacunas conhecidas

- Não foi testado com leitor de tela (NVDA, VoiceOver, TalkBack). O que há é a checagem estrutural
  do axe e dos testes de contrato.
- Navegação só por teclado foi checada nas telas públicas pela varredura e nos testes de foco; não
  há passagem manual completa nas telas autenticadas.
- Links dentro de frases e de listas ("Ver todos os 43") têm cerca de 20 px de altura, e os links
  do rodapé têm 16 px. A meta de 44 px do CSS cobre botões, não links. A regra `target-size` do
  axe (24 px, WCAG 2.2) está ativa na varredura e não reportou violação; o motivo dos links de 16 px
  não foi investigado.
- Há um modal sem foco preso em `pages/Profile.tsx`, que é protótipo e está fora desta frente.
  Nenhum modal das telas do escopo precisa de foco preso.

## 2. Desempenho

### Medições (gzip de `node:zlib`, kB, `scripts/check-bundle-size.mjs`)

| Medida    | Build com Supabase | Build demo | Orçamento |
|-----------|-------------------:|-----------:|----------:|
| initial (scripts e css do `index.html`) | 164,3 | 109,4 | 190 |
| home (initial + Home + catálogo)        | 281,1 | 226,3 | 325 |
| route (maior página sob demanda)        | 6,9 (AtendimentoDetalhe) | 5,6 (admin) | 15 |
| catalog (`areas.json`)                  | 114,7 | 114,7 | 135 |
| policies (`policies.json`)              | 134,9 | 134,9 | 155 |
| css                                     | 11,9  | 11,9  | 16  |
| total (todo o JavaScript)               | 594,6 | 515,6 | 680 |

O build "com Supabase" usa `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` de teste. O build
demo não tem essas variáveis. Ambos passam.

### Orçamento e script

- `npm run check:size` lê `dist/index.html` e `dist/assets` (não lê as 13 mil páginas pré-renderizadas)
  e falha (código 1) quando alguma medida passa do orçamento. Sem build, sai com código 2.
- Os orçamentos são a medida atual mais cerca de 15% de folga, arredondada. Os números e o motivo
  estão no cabeçalho de `scripts/check-bundle-size.mjs`. Para subir um limite, muda-se o cabeçalho
  e o pull request explica por quê.
- `test/check-bundle-size.test.ts` roda o script em pastas `dist` temporárias: dentro do orçamento,
  acima dele e sem build.
- **Passo de CI proposto (não aplicado, a pedido da frente de CI):** depois de `npm run build`,
  rodar `npm run check:size`. O script só lê `dist/`, então pode vir logo após o build do
  workflow. Sugerido: `npm run build && npm run check:size`.

### O que já está otimizado

- Cada página é um chunk separado (`lazy`). O maior chunk de página mede 6,9 kB gz.
- O prefetch começa quando o ponteiro ou o teclado chega a um link (`pointerover`, `focusin`,
  `touchstart`), uma vez por rota. Respeita `saveData` e conexões 2G. Links para área ou serviço
  também pré-carregam `policies.json`, que é o maior arquivo.
- `policies.json` e `areas.json` já são chunks separados; `policies.json` só carrega por `loadPolicies()`.
- Ícones: há 64 linhas de import do `lucide-react`, todas por nome (nenhum `import * as`). O chunk
  compartilhado tem 3,9 kB gz. Nenhuma ação.
- Imagens: o QR code do Pix tem largura e altura fixas (`35f6b93`). Os ícones do PWA em
  `public/icons` (512 px: 59 kB; maskable: 46 kB) só são baixados pelo manifesto. O
  `assets/icon-1024.png` (445 kB) não é referenciado pelo código web. Não entram no primeiro carregamento.

### O que mais pesa (fora desta frente)

1. **`policies.json` (134,9 kB gz) é um arquivo só.** As telas de área e de serviço carregam o
   arquivo inteiro para mostrar as regras de uma ocupação. A solução é dividir por área.
   O arquivo está em `catalog/`, que não é desta frente.
2. **`areas.json` (114,7 kB gz) entra na home.** A home usa só as áreas em destaque e a busca.
   A solução é um índice leve (slug, nome, ícone, quantidade) e as ocupações por área. Também em `catalog/`.
3. **O chunk inicial cresce 54,9 kB gz com as variáveis do Supabase** (de 109,4 para 164,3). Não
   isolei a causa; o número é a diferença entre os dois builds. Um candidato é `lib/supabase.ts`
   carregar o cliente sob demanda, se o primeiro paint não depender dele. Em `lib/`, fora desta frente.

## 3. Como reproduzir

```bash
cd apps/web
nice -n 10 npx vite build --outDir /caminho/fora/do/repo/dist-demo --emptyOutDir   # build demo
VITE_SUPABASE_URL=https://stub.supabase.test VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_teste \
  nice -n 10 npx vite build --outDir /caminho/fora/do/repo/dist-backend --emptyOutDir
node scripts/check-bundle-size.mjs --dist /caminho/fora/do/repo/dist-demo
npx vitest run test/a11y test/check-bundle-size.test.ts
```

O build de produção completo (`npm run build`) inclui a pré-renderização de SEO, que demora minutos.
As medidas acima não dependem dela.

## 4. Regras que valem para as próximas mudanças

- Texto com menos de 4,5:1 sobre o fundo real não entra. Use `text-gray-500` ou mais escuro sobre
  branco e `text-gray-600` ou mais escuro sobre `gray-100`. Cores de marca passam pelo cálculo de contraste.
- Todo campo tem rótulo visível, dica e erro ligados por `aria-describedby`, e `aria-invalid` quando há erro.
- Toda mensagem de estado assíncrono vai para `role="status"` (educado) ou `role="alert"` (erro).
- Todo botão novo tem, no celular, pelo menos 44 px de altura e de largura.
- Nenhuma dependência nova só para isso. Teste novo usa Vitest e jsdom, como os outros.

## 5. Arquivos fora desta frente

Estas partes do problema estão em arquivos que esta frente não pode editar. Cada uma tem a
correção indicada acima.

- `AppShell.tsx`: rodapé em `text-gray-400`. A `6986b82` já mudou este arquivo (pular para o conteúdo,
  anúncio de rota, prefetch). Ele não estava na lista de arquivos desta frente.
- `components/Navbar.tsx` e `components/DemoBanner.tsx`: alternador de papel, rótulo do perfil,
  aviso de demonstração e o logotipo com 32 px de altura no celular.
- `catalog/`, `lib/supabase.ts`: divisão de `policies.json`, `areas.json` e do cliente do Supabase.
- `pages/Home.tsx` e as outras telas de protótipo: texto sobre gradiente (incompleto no axe) e o
  modal de `Profile.tsx`.
