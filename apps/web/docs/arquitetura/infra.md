# Infraestrutura como código

Este documento descreve a infraestrutura de entrega do WorkEasy: o que está no
repositório, quais variáveis e segredos cada ambiente precisa e quais passos são
manuais. O passo a passo de publicação fica no `DEPLOY.md` e não é repetido aqui.

Estado: nada disto foi publicado. Não há ambiente de produção em uso, não há
usuários reais e os workflows de publicação ainda não foram executados.

## O que existe

| Item | Caminho | Papel | Estado |
| --- | --- | --- | --- |
| Cabeçalhos HTTP | `apps/web/public/_headers` | CSP, HSTS, permissões, políticas de origem e cache do site no Cloudflare Pages | Testado em Chromium com um servidor local que aplica o arquivo; não testado no Cloudflare |
| Verificador de cabeçalhos | `apps/web/scripts/check-headers.mjs` | Confere as regras do `_headers` e, com `--dist`, o HTML gerado | Usado pelo workflow de publicação do site |
| Publicação do site | `.github/workflows/deploy-web.yml` | Build e publicação no Cloudflare Pages, só a partir de `main` | Não executado |
| Publicação do banco e das funções | `.github/workflows/deploy-supabase.yml` | Migrations (com simulação por padrão) e Edge Functions | Não executado |
| Atualizações de dependências | `.github/dependabot.yml` | npm em `apps/web` (semanal) e GitHub Actions (mensal) | Ativo ao entrar na `main` |
| Donos do código | `.github/CODEOWNERS` | Revisão dos donos em `apps/web`, `apps/web/supabase` e `.github` | Vale só com a proteção da branch configurada |
| Política de segurança | `.github/SECURITY.md` | Como reportar falhas e o escopo | Contato ainda a definir |
| Checklist de PR | `.github/pull_request_template.md` | Lembretes de testes, alegações, migrations e segredos | Ativo |

Workflows que já existiam e não foram alterados: `.github/workflows/web-ci.yml`
(qualidade, banco e funções em PR e `main`), `.github/workflows/web-release.yml`
(builds de site, Android, Windows, macOS, iOS e Linux) e
`.github/workflows/ci-security.yml` (`services/api`, código do owner).

Nenhum workflow novo tem gatilho `push` ou `pull_request`. Um branch ou um PR
nunca publica nada.

## Cabeçalhos HTTP

A política está em `apps/web/public/_headers`. O Vite copia `public/` para a raiz
de `dist/`, e o Cloudflare Pages lê o arquivo dali.

Política de conteúdo (`Content-Security-Policy`, valor em todas as rotas):

| Diretiva | Valor | Motivo |
| --- | --- | --- |
| `default-src` | `'self'` | Base restrita à própria origem |
| `script-src` | `'self'` | Sem `unsafe-inline` nem `unsafe-eval`. O HTML gerado não tem script inline executável: o único bloco inline é JSON-LD, que o navegador não executa |
| `style-src` | `'self' 'sha256-ezHv…' 'sha256-bT1t…'` | O CSS sai em arquivo próprio (Tailwind); o React define estilos por CSSOM, que a CSP não bloqueia. As duas folhas de impressão (`<style>` em `components/pro/QuoteDocument.tsx` e `pages/publico/Orcamento.tsx`) entram por hash do texto exato, sem `unsafe-inline`. Se o texto mudar, o hash muda: o teste `test/platform/web-headers.test.ts` avisa |
| `img-src` | `'self' data: blob:` | Ícones locais; QR do Pix em `data:`; anexo da sala de teleconsulta (demonstração) em `blob:`. Sem Supabase: os documentos assinados abrem em link (`DocumentCard`), não em imagem. Se uma tela passar a mostrar imagem do Storage, inclua o host aqui e no verificador |
| `connect-src` | `'self' https://*.supabase.co` e os hosts de ingestão do Sentry | API do Supabase (Auth, REST, Storage, Edge Functions). Sem Realtime: o app não abre canal, então não há websocket; se um canal for criado, acrescente `wss://*.supabase.co` aqui e no verificador. Os hosts do Sentry (`*.ingest.sentry.io`, `*.ingest.de.sentry.io` para a UE e `*.ingest.us.sentry.io`) só são usados com `VITE_SENTRY_DSN`; sem DSN o app não os contata |
| `font-src`, `manifest-src`, `worker-src` | `'self'` | Fontes locais, manifest e service worker do PWA |
| `frame-src`, `frame-ancestors` | `'none'` | Nenhum iframe; o site não pode ser emoldurado |
| `object-src`, `base-uri`, `form-action` | `'none'`, `'self'`, `'self'` | Sem plugins, sem troca de base, formulários só para a própria origem |

Demais cabeçalhos em todas as rotas:

- `Strict-Transport-Security: max-age=31536000`. Sem `includeSubDomains` e sem
  `preload`, até o responsável listar os subdomínios do domínio.
- `X-Content-Type-Options: nosniff` e `X-Frame-Options: DENY`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: geolocation=(self), camera=(self), microphone=(), payment=()`.
- `Cross-Origin-Opener-Policy: same-origin-allow-popups`. Não há
  `Cross-Origin-Embedder-Policy`: com ele, as imagens do Supabase Storage
  precisariam de cabeçalhos CORP que não controlamos.
- `Cross-Origin-Resource-Policy: same-origin` para as respostas do site.

Cache (`Cache-Control`):

- `/assets/*` e `/workbox-*.js`: `public, max-age=31536000, immutable` (nomes com hash).
- `/`, `/index.html`, `/categorias/*`, `/servicos/*`, `/sw.js`, `/registerSW.js` e
  `/manifest.webmanifest`: `no-cache`.

Regra de montagem: quando duas regras casam com o mesmo caminho, o Cloudflare
junta os valores de um mesmo cabeçalho com vírgula. Por isso o bloco `/*` só
define os cabeçalhos de segurança, e cada cabeçalho de cache aparece em um
caminho que não se sobrepõe a outro. O verificador recusa uma sobreposição.

### Como validar

```bash
cd apps/web
npm run build                        # gera dist/ com _headers copiado
node scripts/check-headers.mjs       # confere public/_headers
node scripts/check-headers.mjs --dist dist   # confere também o HTML gerado
```

O verificador recusa: linha com mais de 2.000 caracteres, mais de 100 regras,
CRLF, asterisco duplo, `unsafe-inline` ou `unsafe-eval` em `script-src`, HSTS
com `preload`, cabeçalho combinado de duas regras, `connect-src` ou `img-src`
com hosts além dos listados acima, `style-src` com qualquer valor além de
`'self'` e hashes `sha256`, e no HTML gerado: `<script>`
inline executável, `<style>`, atributo `style`, script ou link externo.

Resultado da validação local (8 de novembro de 2026): zero violações de CSP
em Chromium, para o build de demonstração (13.005 páginas pré-renderizadas,
incluindo rotas de categoria, serviço e bairro, `/entrar`, `/pedido` e uma
rota inexistente) e para o build com backend. O service worker registra em
todos os casos. O teste de controle com `script-src 'none'` acusou seis
violações, então a medição detecta falhas.

Essa medição é anterior às alterações de 9 de novembro de 2026 (hosts do
`connect-src` e `img-src`, hashes de `style-src`) e cobre só as rotas
pré-renderizadas. As telas de orçamento e de impressão montam o `<style>` no
navegador, então não entraram na medição: por isso as folhas de impressão
têm hash e o teste de cabeçalhos confere o hash contra o código.

Limites desta validação:

- O servidor de teste aplica o `_headers` com as mesmas regras do verificador.
  Ele não reproduz o Cloudflare. Depois da primeira publicação, confira com
  `curl -sI https://<domínio>/` que os cabeçalhos chegaram.
- Rotas sem regra própria (por exemplo `/pedido` e `/pro`, respondidas pelo
  fallback `/* /index.html 200`) recebem o padrão de cache do Cloudflare. Esse
  padrão não foi verificado.
- O projeto não tem Pages Functions (não há diretório `functions/` em `apps/web`). Os
  cabeçalhos do `_headers` valem para as respostas estáticas do site.

## Ambientes e variáveis

Um único ambiente do GitHub, `production`, serve os dois workflows. Configure-o
em Settings, Environments, com:

- revisores obrigatórios (pelo menos uma pessoa diferente de quem dispara);
- regra de branch: somente `main`.

### Variáveis (`vars`, visíveis, sem segredo)

| Nome | Usado por | Observação |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | build do site | URL do projeto. Vazia gera o modo demonstração, e o workflow recusa |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | build do site | Chave publicável (`sb_publishable_...`). Pública por desenho; nunca a chave `sb_secret_` |
| `VITE_SITE_URL` | build do site | Domínio canônico, por exemplo `https://<domínio>`. Obrigatória |
| `VITE_CONCIERGE_WHATSAPP` | build do site | Número da operação, só dígitos com código do país |
| `VITE_COMPANY_NAME`, `VITE_COMPANY_CNPJ`, `VITE_COMPANY_ADDRESS` | build do site | Dados da empresa. O código ainda não os lê (busca feita em 8/11/2026); o workflow já os repassa |
| `VITE_SAC_EMAIL`, `VITE_SAC_WHATSAPP` | build do site | Canais de atendimento. Mesma observação |
| `VITE_LEGAL_STATUS` | build do site | Situação jurídica exibida. Mesma observação |
| `CLOUDFLARE_ACCOUNT_ID` | publicação do site | ID da conta no Cloudflare |
| `CLOUDFLARE_PAGES_PROJECT` | publicação do site | Nome do projeto Pages de tipo Direct Upload |
| `SUPABASE_PROJECT_ID` | publicação do banco | Referência do projeto (`abcdefghijklmnopqrst`) |

Todo `VITE_*` entra no bundle público. Por isso são variáveis, não segredos, e
nenhum deles pode carregar uma chave privada. O workflow do site recusa uma
`VITE_SUPABASE_PUBLISHABLE_KEY` que comece com `sb_secret_` e falha se o bundle
contiver `sb_secret_` ou `SUPABASE_SERVICE_ROLE`.

### Segredos (`secrets`)

| Nome | Usado por | Como obter |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | publicação do site | Token de API no Cloudflare com permissão Account, Cloudflare Pages, Edit |
| `SUPABASE_ACCESS_TOKEN` | publicação do banco | Token pessoal de acesso à API do Supabase (conta do responsável) |
| `SUPABASE_DB_PASSWORD` | publicação do banco | Senha do Postgres do projeto de produção |

### Segredos das Edge Functions (no Supabase, não no GitHub)

Os workflows nunca definem estes valores. Eles ficam no projeto Supabase,
definidos à mão com `supabase secrets set` ou pelo painel. Lista do
`supabase/functions/.env.example`:

- Obrigatórios para o fluxo de pagamento e notificação: `ASAAS_API_KEY`,
  `ASAAS_BASE_URL` (produção: `https://api.asaas.com/v3`), `ASAAS_WEBHOOK_TOKEN`,
  `CRON_SECRET`, `SITE_URL`.
- Opcionais, conforme o canal ligado: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_GRAPH_VERSION`, `RESEND_API_KEY`, `EMAIL_FROM`, `ANTHROPIC_API_KEY`
  (função `request-assist`), `ASSIST_HOURLY_LIMIT`, `PRO_GRACE_DAYS`.
- Não defina `ALLOW_DEV_ORIGINS` em produção.
- Injetados pelo próprio Supabase: `SUPABASE_URL`, a chave publicável e a chave
  secreta do projeto.

### Vault do Postgres (agendador)

O `pg_cron` chama `notify-dispatch` somente quando o Vault tem as duas chaves
`notify_dispatch_url` (`https://<ref>.supabase.co/functions/v1/notify-dispatch`)
e `cron_secret`. O valor de `cron_secret` precisa ser igual ao `CRON_SECRET` da
função. Grave-as pelo SQL, por quem tem acesso ao banco de produção, com a
função `vault.create_secret`. Nunca em arquivo versionado. Veja a seção
"Notificações" de `docs/ARQUITETURA.md`.

## Passos manuais

Ordem sugerida para a primeira publicação. Nenhum passo é automático.

1. Criar o projeto Supabase de produção. Anotar a referência (vai em `SUPABASE_PROJECT_ID`).
2. Criar o token de acesso e definir a senha do banco. Guardar só nos secrets do ambiente `production`.
3. No painel do Supabase, em Authentication: Site URL igual a `VITE_SITE_URL`;
   redirecionamentos permitidos com o domínio de produção (o `config.toml` só
   descreve o ambiente local); provedor de SMS ou WhatsApp e de e-mail para o
   OTP. O `config.toml` traz valores de teste locais e não devem ser copiados.
4. Definir os secrets das Edge Functions (lista acima) com
   `supabase secrets set --project-ref <ref> --env-file <arquivo fora do repositório>`.
   Não versione esse arquivo.
5. Rodar **Publicar Supabase** com `dry_run` ligado e revisar a lista de migrations.
   Depois, com `dry_run` desligado e `deploy_functions` ligado. Os dois passos pedem
   a aprovação do ambiente `production`.
6. Gravar no Vault as chaves do agendador (seção acima).
7. Configurar o webhook da conta raiz do Asaas para
   `https://<ref>.supabase.co/functions/v1/asaas-webhook`, com o mesmo
   `ASAAS_WEBHOOK_TOKEN`. As subcontas recebem o webhook pelo `asaas-onboard`.
8. Criar o projeto Pages no Cloudflare como **Direct Upload**, porque o workflow envia
   o `dist/` pelo wrangler. Não foi verificado aqui se um projeto com integração Git
   aceita esse envio: conferir antes da primeira publicação. Definir `main` como
   branch de produção e adicionar o domínio customizado.
9. Criar as variáveis e os segredos do ambiente `production` (tabelas acima).
10. Rodar **Publicar site (Cloudflare Pages)** e conferir com `curl -sI https://<domínio>/`
    os cabeçalhos `content-security-policy`, `strict-transport-security` e
    `cache-control`.
11. Ligar, em Settings do repositório, "Private vulnerability reporting" e
    preencher o contato em `.github/SECURITY.md`.
12. Proteger a branch `main`: exigir revisão, exigir revisão dos donos
    (CODEOWNERS), exigir os checks do `web-ci`, bloquear force-push.
13. Confirmar que o Dependabot está ativo em Settings, Code security.

## Riscos e limites

- Nenhum workflow novo foi executado: não há runner do GitHub Actions nesta sessão. Os YAML foram validados com `yaml.safe_load`. O `actionlint`
  não estava disponível para uma checagem mais profunda.
- Os inputs de `actions/checkout@v4`, `actions/setup-node@v4` e
  `supabase/setup-cli@v3.0.1` foram conferidos nos `action.yml` oficiais. A CLI
  do Supabase foi conferida com `--help` na versão 2.121.0 (a do `package.json`):
  `functions deploy --no-verify-jwt`, `db push --linked --dry-run --skip-vault --yes`.
- O wrangler está fixado em `4.152.0`, publicado em 22/10/2026. A escolha segue
  a regra de versão com pelo menos duas semanas. As flags `--project-name`,
  `--branch` e `--commit-hash` foram conferidas com `wrangler pages deploy --help`.
- O `supabase/config.toml` não tem entradas `[functions]` com `verify_jwt`. Por
  isso o workflow passa `--no-verify-jwt` a cada publicação das duas funções
  públicas. Se alguém publicar a função sem a flag, o webhook do Asaas deve passar
  a ser recusado, porque o Asaas não envia JWT. Vale registrar essas duas funções no `config.toml`, em mudança
  própria.
- O Docker estava parado nesta sessão, então a stack local do Supabase não subiu.
  O teste do modo com backend usou um build apontado para
  `http://127.0.0.1:54321` (com essa origem liberada só na cópia de teste do
  `_headers`) e um build apontado para um domínio `supabase.co` inexistente, com
  a política de produção. Nos dois casos não houve violação de CSP; as falhas de
  rede são de conexão recusada e de DNS.
- A proteção de branch, o ambiente com revisores e o Pages Direct Upload
  dependem de configuração no GitHub e no Cloudflare. Nada disso é verificável
  pelo repositório.

## Recomendações para os workflows existentes (não aplicadas)

`web-ci.yml`:

- O job `database` sobe a stack inteira do Supabase com Docker em todo PR que
  toca `apps/web/**`. Um filtro de `paths` mais estreito (migrations, `supabase/**`,
  `lib/database.types.ts`) reduz o custo sem perder o que ele testa.
- O job `web` roda `npm run build`, que pré-renderiza cerca de 13 mil páginas. Em
  PR, `tsc` mais `vite build` bastam; o build completo fica para `main` e para a
  publicação. A checagem de segredo do bundle (`gemini|api_key`) pode passar a
  incluir `sb_secret_` e rodar `scripts/check-headers.mjs --dist dist`.
- Os `checkout` podem receber `persist-credentials: false`, já que nenhum job
  faz push.
- Vale fixar as actions por SHA de commit, não só por tag, e testar
  `npm ci --ignore-scripts` antes de adotar. Esta última não foi verificada.

`web-release.yml`:

- Os jobs macOS e Windows rodam em todo PR que toca os caminhos nativos. O
  minuto de runner macOS custa bem mais que o Linux. Sugestão: deixar esses
  dois jobs só em `workflow_dispatch` e em tags `v*`.
- `macos-latest` e `windows-latest` mudam de versão sem aviso. Fixar a versão
  do runner deixa o build reproduzível.
- `dtolnay/rust-toolchain@stable` não fixa a versão do Rust. Fixar um
  `toolchain` explícito.
- A permissão `contents: read` no topo está correta. Se a publicação de releases
  for criada, dar `contents: write` só ao job que a faz.
- `npm test` roda de novo aqui, depois de `web-ci`. Manter em tags e remover dos PRs.
- Os `checkout` podem receber `persist-credentials: false`.
