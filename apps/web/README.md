# WorkEasy

Plataforma para encontrar e contratar serviços e profissionais liberais de todas as áreas e categorias, de reformas e limpeza a aulas, beleza, tecnologia, cuidados e saúde.

> **Status: MVP em construção, não validado com usuários e não implantado.** Sem um projeto Supabase configurado, o app roda como demonstração com dados fictícios e nada é enviado ou guardado. Com o Supabase, há cadastro por código, pedidos, propostas, agenda, orçamentos, administração e linha de cuidado, testados contra um banco local. **Pagamento retido e comissão ficam desligados** até haver parecer jurídico, a cobrança depende de conta Asaas configurada, e verificação de identidade, vídeo, teleconsulta e prontuário **não existem**. Não use para atendimento real.

## O que existe hoje

- Catálogo de 44 áreas e 1.710 serviços e profissões, cada um com política própria (o que será exigido, cobrança, limite trabalhista, quem pode prestar). Itens com `confidence: a_confirmar` ainda precisam de conferência por advogado.
- Busca por nome e sinônimos, sugestões na página inicial e páginas por área e por serviço (também geradas como HTML estático para busca).
- Com backend: pedido guiado, propostas, agendamento direto, orçamento por link público, avaliação só após atendimento pago, ferramenta do profissional (agenda, serviços, clientes, cobranças, assinatura), área de administração e linha de cuidado com plantões e check-in. A linha de cuidado fica fora do menu até o dono abri-la (`care_line_open`).
- Também com backend: aviso ao profissional de pedido novo, lista de espera para bairros fora do piloto (`pilot_neighborhoods`), denúncia de perfil, avaliação e pedido, bloqueio entre contas, fila de denúncias em `/admin/denuncias` e a página pública `/excluir-conta`.
- Sem backend: a demonstração anterior (perfis fictícios, painéis alternados pelo seletor de papel) e um pedido por WhatsApp se `VITE_CONCIERGE_WHATSAPP` estiver definido.
- Contrato técnico em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md); banco, funções e testes em `supabase/`.
- Decisões de monetização, portões e perguntas para o advogado em [`docs/DECISOES.md`](docs/DECISOES.md).

## Rodar localmente

Requer Node.js 22.

```bash
npm ci          # instala exatamente as versões do package-lock.json
npm run dev     # http://localhost:3000
```

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Typecheck, build de produção em `dist/` e pré-renderização (`scripts/prerender.mjs`) |
| `npm run build:native` | Build dos apps nativos (`--mode native`, sem páginas pré-renderizadas) |
| `npm run preview` | Serve o build de produção |
| `npm run lint` | ESLint, sem avisos tolerados |
| `npm run typecheck` | TypeScript em modo estrito |
| `npm test` | Testes com Vitest (unitários e de tela; não precisam de banco) |
| `npm run test:integration` | Fluxo do produto contra a stack Supabase real (exige `supabase start`) |
| `npm run test:deno` | Os testes de `test/functions` rodados no Deno 2.9.6 (`supabase/functions/_test/deno.json`, lock próprio, `--frozen`) |
| `npm run test:e2e-functions` | Ponta a ponta das Edge Functions no edge-runtime local, com Asaas, Resend, WhatsApp e Anthropic falsos (`scripts/e2e-functions.mjs`; requisitos em `docs/RUNBOOKS.md`) |
| `npm run check:size` | Orçamento de tamanho do bundle (`scripts/check-bundle-size.mjs`), depois do build |
| `npm run check:store-bundle -- --store android\|ios\|none` | Diz para qual loja o bundle de `dist/` foi gerado e falha se não for o esperado |
| `npm run check:app-links` | Coerência dos arquivos de deep link (App Links e Universal Links); com `-- --strict`, falha enquanto houver host de exemplo, impressão digital ou Team ID `TODO` |
| `npm run db:test` | pgTAP: RLS, triggers e funções do banco (`supabase test db`) |
| `npm run db:types` | Regenera `lib/database.types.ts` a partir do banco local |
| `npm run db:seed` | Regenera `supabase/seed.sql` e `supabase/catalog.sql` a partir de `catalog/*.json` e `data/neighborhoods.json` |

## Testes

| Camada | Comando | Precisa de |
|---|---|---|
| Unitários e telas (Vitest, jsdom) | `npm test` | só Node |
| Banco (pgTAP) | `npm run db:test` | stack local de pé |
| Integração (Vitest, node, API real) | `npm run test:integration` | stack local de pé |
| Edge Functions (tipos e lint) | `deno check --frozen --config supabase/functions/deno.json supabase/functions/*/index.ts` e `deno lint --config supabase/functions/deno.json supabase/functions` | Deno 2.9.6 |
| Edge Functions no Deno | `npm run test:deno` | Deno 2.9.6 |
| Edge Functions ponta a ponta | `npm run test:e2e-functions` | stack local de pé (com o edge-runtime), Docker, `psql`, `openssl` e a porta 443 livre (no CI, `setcap` no node) |

Em 25/11/2026 o Vitest tem 147 arquivos e 4.111 testes; o banco tem 109 migrações em `supabase/migrations/` e 89 arquivos pgTAP em `supabase/tests/database/`.

Stack local (Docker): `npx supabase start -x studio,imgproxy,logflare,vector,supavisor,realtime,edge-runtime` aplica as migrations e o `supabase/seed.sql`. Para recomeçar do zero: `npx supabase db reset`. `npx supabase` usa a CLI 3.4.0 fixada no `package.json` (a mesma dos workflows). Na CLI 3 os comandos de banco são locais por padrão; para o projeto vinculado use `--remote` (`--linked` é obsoleto).

**Teste de integração.** Os arquivos de `test/integration/` falam com o Supabase de verdade por `@supabase/supabase-js`, pela mesma API que a interface usa, e cobrem o caminho completo: pedido do cliente, cadastro e aprovação do prestador, propostas e `proposal_limit`, aceite, trava trabalhista, pagamento como o webhook faz, avaliação, vazamento entre contas, orçamento público e LGPD. A URL e as chaves vêm de `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY`; sem elas, o teste lê `npx supabase status -o env`. Com a stack parada ele falha logo no início e diz como subir.

- Os usuários são criados pela API admin do Auth, com e-mail confirmado e senha de teste, e removidos no fim de cada arquivo, junto com pagamentos, atendimentos e arquivos de teste. A chave de serviço só aparece nesses testes.
- As ocupações são escolhidas pela política do catálogo (uma doméstica com `labor_lock`, uma regulamentada com `registro_profissional`), então os testes servem ao catálogo pequeno e ao grande. O que cada arquivo assume está no comentário do topo.
- O Auth local limita os logins a 30 a cada 5 minutos por IP; uma execução usa cerca de 10. Se o limite for atingido, o teste espera e tenta de novo.
- `npm test` não executa esses arquivos.

**CI.** `.github/workflows/web-ci.yml` tem quatro jobs, todos com os mesmos filtros de caminho: `web` (lint, typecheck, testes, build, `npm run check:size`, `scripts/check-bundle-secrets.mjs`, que recusa chave de servidor no bundle, inclusive JWT com papel `service_role`, `npm run check:store-bundle -- --store none`, que confirma que o site não é build de loja, e `npm run check:app-links`, que acusa contradição entre os arquivos de deep link e só lista as pendências do dono), `database` (Supabase CLI 3, a mesma versão do `package.json`; stack local, `supabase test db`, `npm run test:integration` e a conferência de que `lib/database.types.ts` está igual ao gerado), `functions` (`deno check`, `deno lint` e `deno test`, o mesmo que `npm run test:deno`) e `functions-e2e`, que sobe a stack local com o edge-runtime e roda `npm run test:e2e-functions` (Asaas, Resend, WhatsApp e Anthropic falsos em HTTPS local; nada sai para a internet). As actions de terceiros ficam fixadas por SHA de commit, e os workflows são lidos com parser de YAML em `test/ops/workflows.test.ts`. Mudou algo no banco: crie uma migration nova (migration aplicada ou mesclada não se edita; `docs/ARQUITETURA.md`, "Testes e CI"), rode `npx supabase db reset`, `npm run db:test` e `npm run db:types`, e faça o commit do arquivo gerado.

## Backend e variáveis de ambiente

Sem variáveis, o app roda no **modo demonstração** (dados fictícios, seletor de papel no menu, nada é guardado). O contrato técnico do backend está em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

Copie `.env.example` para `.env.local` e preencha:

| Variável | Uso |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase. Vazia = modo demonstração. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Chave publicável (`sb_publishable_…`). |
| `VITE_CONCIERGE_WHATSAPP` | Número da operação concierge, só dígitos com DDI (ex.: `5511999999999`). Sem backend, `/pedido` monta a mensagem e abre o WhatsApp para esse número; vazio = o pedido online aparece como ainda não disponível. |
| `VITE_SITE_URL` | URL canônica do site (SEO, links dos e-mails de login e links abertos no app nativo). |
| `VITE_LOGIN_METHODS` | Abas de login: `email`, `phone` ou `email,phone`. Vazia = as duas. Use `email` enquanto não houver provedor de SMS. |
| `VITE_STORE_BUILD` | `android` ou `ios` num build feito para loja: sem venda do Pro dentro do app e sem a linha de cuidado. Vazia nos demais. |
| `VITE_SENTRY_DSN` | DSN do relato de erros (Sentry). Vazia = nada é enviado. |
| `VITE_APP_VERSION` | Nome da versão enviado com o relato de erro; na publicação, o workflow usa o commit. |
| `VITE_COMPANY_NAME`, `VITE_COMPANY_CNPJ`, `VITE_COMPANY_ADDRESS`, `VITE_SAC_EMAIL`, `VITE_SAC_WHATSAPP` | Dados da empresa e do SAC nas páginas jurídicas (`config/legal.ts`). |
| `VITE_LEGAL_STATUS` | `vigente` só depois do parecer do advogado; vazia = as páginas jurídicas mostram aviso de rascunho. |

- **A chave publicável é pública por desenho.** Ela vai para o JavaScript que qualquer pessoa baixa; o que cada usuário pode ler ou gravar é decidido pelo banco (RLS e funções). Nunca use no app a chave secreta (`sb_secret_…`) nem a service role.
- **Segredos ficam nas Edge Functions** (`supabase secrets set`): Asaas, WhatsApp Cloud API, Resend e IA. O teste `test/claims-guard.test.ts` reprova o código do cliente que citar essas chaves.
- **Login por código** (`/entrar`): no Supabase Auth (Authentication → Email Templates), os modelos **"Confirm signup"** (primeiro acesso: a conta é criada no envio do código) e **"Magic Link"** (acessos seguintes) precisam conter `{{ .Token }}` para mostrar o código de 6 dígitos. Se só um deles tiver o código, quem cai no outro recebe apenas um link. Quem entra pelo link vai para `/conta`, que pede o aceite dos Termos e da Política de Privacidade antes de liberar novos pedidos (o mesmo vale para `/pedido`).
- **Celular:** o código vai só por SMS e só para celular (11 dígitos com DDD); depende de um provedor de SMS configurado no Supabase Auth. O envio por WhatsApp não é oferecido nesta versão.
- Com backend: `/entrar`, `/conta` (dados, consentimentos, bloqueios, cópia dos dados, exclusão da conta), `/excluir-conta` (pública), `/pedido`, `/pedidos` e `/pedidos/:id`. Camada de dados em `lib/` (cliente único, erros em pt-BR), `services/` (uma função por operação) e `config/` (flags).

## Plataformas

Um único código React é empacotado para seis plataformas.

| Plataforma | Tecnologia | Como gerar | Saída |
|---|---|---|---|
| Site (instalável como PWA) | Vite + `vite-plugin-pwa` | `npm run build` | `dist/` |
| Android | Capacitor | `npm run android:build` (JDK 21 + Android SDK) | `android/app/build/outputs/apk/debug/` |
| iOS | Capacitor | `npm run ios:build` (macOS + Xcode) | build para o simulador em `ios/build/` |
| Windows | Tauri 2 | `npm run desktop:build` (Rust + MSVC) | `.msi` e `.exe` em `src-tauri/target/release/bundle/` |
| macOS | Tauri 2 | `npm run desktop:build` (Rust + Xcode CLT) | `.app` e `.dmg` |
| Linux | Tauri 2 | `npm run desktop:build` (Rust + WebKitGTK 4.1) | `.deb` e `.AppImage` |

- **Modos de build.** O site usa URLs limpas e service worker. Os apps nativos usam o build `--mode native` (`.env.native`), com URLs com `#` e sem service worker, porque são servidos de arquivos locais.
- **CI.** O workflow `Release builds` (`.github/workflows/web-release.yml`) gera as seis saídas sob demanda ("Run workflow"), em tags `v*` e em pull requests que mudam o empacotamento nativo (`android/`, `ios/`, `src-tauri/`, dependências e configuração de build). Os artefatos ficam anexados à execução por 7 dias.
- **Saídas sem assinatura.** O APK é de debug, o app iOS roda só no simulador e os instaladores desktop não são assinados (o Windows mostra o aviso do SmartScreen e o macOS bloqueia a primeira abertura até a pessoa liberar em Ajustes do Sistema > Privacidade e Segurança; ver `docs/lojas/desktop-e-assinatura.md`).
- **Publicação nas lojas.** Exige conta Apple Developer de organização (US$ 99/ano, também usada para notarizar no macOS), conta Google Play de organização (US$ 25, taxa única), política de privacidade publicada e exclusão de conta dentro do app.

O `.npmrc` liga `legacy-peer-deps` por causa de um bug do npm 10 ao resolver os pares opcionais do Vitest; os pares necessários estão declarados explicitamente no `package.json`.

## SEO

`npm run build` termina com `scripts/prerender.mjs`, que lê `dist/index.html` e gera páginas estáticas a partir de `catalog/areas.json`, `catalog/policies.json` e `data/neighborhoods.json`:

- `dist/categorias/`, `dist/categorias/<área>/` e `dist/servicos/<ocupação>/`;
- `dist/servicos/<ocupação>/<bairro>/` para as áreas de lançamento (cuidados, limpeza, reformas, eletricista, beleza, aulas, pets e autos) nos bairros da Zona Sul e do Centro;
- `dist/sitemap.xml` (vira índice com `sitemap-N.xml` acima de 50 mil URLs) e `dist/robots.txt`, que ganha a linha `Sitemap:`. Os dois só saem quando `VITE_SITE_URL` está definida, porque um sitemap precisa de URLs absolutas.

Cada página tem `<title>`, descrição e `canonical` próprios, Open Graph, JSON-LD do tipo `Service` e texto real dentro de `<div id="root">`, que o React substitui ao carregar. O texto sai da política da ocupação (como se contrata, unidades de preço, onde é atendido, o que será exigido, se a profissão é regulamentada); não há preço, nota ou avaliação, e o texto passa pelas mesmas frases proibidas do `test/claims-guard.test.ts`. O build falha se uma página sair sem título, descrição ou canonical, ou com título repetido.

- Sem `VITE_SITE_URL`, o canonical usa caminho relativo, não há sitemap e o script avisa no console. Em produção, defina a variável.
- `npm run build:native` e `--mode native` não geram páginas.
- **Páginas por bairro saem `noindex` e fora do sitemap.** Sem dado local (profissionais ou pedidos naquele bairro), elas são o mesmo texto com o nome trocado, e o Google trata isso como página de entrada sem valor. Para indexar um par, liste `"<ocupação>/<bairro>"` em `data/seo-local.json` (hoje `[]`) quando houver cadastro aprovado ou demanda real ali.
- Testes: `npx vitest run test/seo`.

## Segurança e alegações

- **Nenhum segredo no cliente.** Variáveis `VITE_*` vão para o JavaScript público. Chaves de API, tokens e senhas pertencem a funções de servidor. O CI falha se encontrar uma chave no bundle (`scripts/check-bundle-secrets.mjs`).
- **Nenhuma alegação sem implementação.** O teste `test/claims-guard.test.ts` falha se o código voltar a anunciar criptografia ponta a ponta, assinatura digital, selo de verificado, pagamento retido, estatísticas inventadas ou prazos que não existem. Uma frase só volta junto com a funcionalidade real e com a mudança correspondente no teste.

## Estrutura

```
AppShell.tsx      layout e rotas (cada página é carregada sob demanda)
App.tsx           provedores e roteador (BrowserRouter no site, HashRouter nos apps nativos)
index.tsx         montagem; nas páginas pré-renderizadas, troca o HTML estático pelo React (lib/staticHandoff.ts)
pages/            telas (cada área exporta suas rotas em pages/<área>/routes.tsx)
components/       componentes compartilhados
lib/, services/   cliente Supabase, erros em pt-BR e uma função por operação
config/           flags de build e de execução, textos legais, bairros
utils/            datas, moeda e busca (funções puras, testadas)
platform/         integração com os apps nativos (botão voltar do Android, deep links, arquivos)
constants.tsx     catálogo e dados fictícios
supabase/         migrations, pgTAP, seed, catálogo e Edge Functions
scripts/          pré-renderização, verificadores do CI, seed, healthcheck e checagens diárias
docs/             arquitetura, decisões, runbooks, lojas, operação e textos jurídicos
test/             testes
android/, ios/    projetos nativos do Capacitor
src-tauri/        app desktop (Tauri) para Windows, macOS e Linux
assets/           ícone-fonte (SVG) usado para gerar os ícones de todas as plataformas
```

## Licença

Proprietária. Todos os direitos reservados. Veja [LICENSE](LICENSE).
