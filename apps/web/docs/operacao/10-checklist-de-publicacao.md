# Checklist de publicação em produção

> Rascunho operacional. Não é parecer jurídico nem contábil. Descreve o que o repositório comprova e não confirma painéis externos (Supabase, Cloudflare, Asaas, Apple, Google, Sentry, WhatsApp, Resend). Nenhum valor real aparece aqui: só nomes.

| Campo | Valor |
|---|---|
| Data de referência | 2026-11-09 |
| Base | commit `329b0cd`, branch `wt/deploy-checklist` |
| Caminhos | Sem prefixo, relativos a `apps/web/`. Os demais são da raiz do repositório (`.github/`, `services/`, `docker-compose.yml`, `render.yaml`, `cloudbuild.yaml`). |
| Status | **Feito no repositório**: código, configuração ou workflow existe neste commit. **Depende de conta ou ação do dono**: exige conta, painel ou decisão fora do repositório. **Pendente**: falta no repositório, está em conflito entre documentos ou não foi verificado. |
| Responsáveis | **Técnico**, **Dono**, **Contador**. Assuntos jurídicos ficam com o dono, com parecer de advogado. |
| Limites desta revisão | Leitura de arquivos, busca e consulta à ajuda da CLI do Supabase 2.121.0. Não foram executados build, testes completos, workflows nem chamadas a serviços externos. |

## Bloqueios antes da primeira publicação

1. **Credencial versionada.** `docker-compose.yml` (raiz) traz senha de banco em texto claro, em variável de ambiente de um banco nomeado como produção. O repositório é público. Remover do arquivo, trocar a senha em todo ambiente em que ela tenha sido usada e não reproduzir o valor em lugar nenhum. Responsável: Técnico. **Pendente.**
2. **Catálogo vazio em produção.** O workflow de banco aplica só migrações. Áreas, ocupações, políticas e bairros estão em `supabase/seed.sql`, e a migração `20261019000002_catalog.sql` declara que as linhas vêm desse arquivo. A flag `--include-seed` existe na CLI 2.121.0 (conferida na ajuda) e o workflow não a usa. Responsável: Técnico. **Pendente.**
3. **Asaas no sandbox por padrão.** Sem `ASAAS_BASE_URL`, as funções usam `https://api-sandbox.asaas.com/v3` e liberam CORS para localhost. Definir o endereço de produção antes da primeira publicação. Responsável: Técnico. **Pendente.**
4. **Configuração de Auth não vai para produção.** `supabase/config.toml` descreve só o ambiente local (Site URL em localhost, redirecionamentos, templates, provedor de SMS de teste). O workflow não executa `supabase config push`. Configurar no painel. Responsável: Técnico. **Depende de ação.**
5. **Textos legais e lojas.** Termos, Privacidade e SAC em `content/legal/` são textos de elaboração (menos de 400 bytes cada). Sem `VITE_LEGAL_STATUS=vigente`, após parecer, todas as páginas jurídicas mostram aviso de rascunho. Responsável: Dono, com advogado. **Pendente.**
6. **Contas e ambiente.** Nenhum ambiente de produção existe ainda (`apps/web/docs/arquitetura/infra.md`, passos 1 a 13). Responsáveis: Dono e Técnico. **Depende de ação.**

---

## 1. Variáveis e segredos

### 1.1 Variáveis de build (`VITE_*`, entram no JavaScript público)

Todas são lidas no código. Para o build de produção, são definidas como variáveis do ambiente `production` do GitHub (`.github/workflows/deploy-web.yml`).

| Nome | Definida em | Tipo | Dono | Status | Evidência |
|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | variável `production` | pública | Técnico | Depende de conta (projeto Supabase) | `deploy-web.yml`; `vite-env.d.ts` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | variável `production` | pública por desenho (depende de RLS) | Técnico | Depende de conta. Ver achado abaixo | `deploy-web.yml`; `lib/supabaseKey.ts` |
| `VITE_SITE_URL` | variável `production` | pública | Técnico e Dono (domínio) | Depende de domínio | `deploy-web.yml`; `scripts/prerender.mjs` (sem valor: sem sitemap e canonical relativo) |
| `VITE_CONCIERGE_WHATSAPP` | variável `production` | pública | Dono | Depende de ação (número da operação) | `deploy-web.yml`; `.env.example` |
| `VITE_COMPANY_NAME`, `VITE_COMPANY_CNPJ`, `VITE_COMPANY_ADDRESS` | variável `production` | pública | Contador | Depende de ação (dados da pessoa jurídica) | `deploy-web.yml`; `config/legal.ts` (`company()`) |
| `VITE_SAC_EMAIL`, `VITE_SAC_WHATSAPP` | variável `production` | pública | Dono | Depende de ação | `deploy-web.yml`; `config/legal.ts` |
| `VITE_LEGAL_STATUS` | variável `production` | pública | Dono, com advogado | **Pendente** (parecer) | `deploy-web.yml`; `config/legal.ts` |
| `VITE_SENTRY_DSN` | não repassada pelo workflow | pública (não é segredo, mas não se versiona) | Técnico e Dono (região) | **Pendente** | `lib/observability.ts`; `observabilidade.md` §5 |
| `VITE_APP_VERSION` | não repassada pelo workflow | pública | Técnico | **Pendente** (opcional) | `lib/observability.ts` |
| `VITE_ROUTER` | `.env.native` (nativos usam `hash`); padrão `browser` | pública | Técnico | Feito no repositório | `.env.native`; `vite-env.d.ts` |

Achados:

- `deploy-web.yml` não repassa `VITE_SENTRY_DSN` nem `VITE_APP_VERSION`. Mesmo que a variável seja criada no ambiente, o build de produção sai sem relato de erros. **Pendente.**
- `apps/web/docs/arquitetura/infra.md` diz que o código ainda não lê `VITE_COMPANY_*`, `VITE_SAC_*` e `VITE_LEGAL_STATUS`. Isso está desatualizado: `config/legal.ts` lê todas elas. Atualizar o documento.
- A checagem do workflow recusa só `sb_secret_` em `VITE_SUPABASE_PUBLISHABLE_KEY`, e o varrimento do bundle procura `sb_secret_` e `SUPABASE_SERVICE_ROLE`. Uma chave `service_role` legada (JWT) passa pelas duas checagens. O app a recusa em tempo de execução (`lib/supabaseKey.ts`), mas a chave já estaria no JavaScript público. Estender a checagem do workflow para ler o papel do JWT. Responsável: Técnico. **Pendente.**

### 1.2 Segredos e variáveis do GitHub (ambiente `production`)

| Nome | Tipo | Usado por | Dono | Status | Evidência |
|---|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | segredo | `deploy-web.yml` (wrangler) | Técnico | Depende de conta Cloudflare | `infra.md` (segredos) |
| `SUPABASE_ACCESS_TOKEN` | segredo | `deploy-supabase.yml` | Técnico (conta do responsável) | Depende de conta | `deploy-supabase.yml`; `infra.md` |
| `SUPABASE_DB_PASSWORD` | segredo | `deploy-supabase.yml` | Técnico | Depende de conta | `deploy-supabase.yml` |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_PROJECT` | variáveis | `deploy-web.yml` | Técnico | Depende de conta | `infra.md` |
| `SUPABASE_PROJECT_ID` | variável | `deploy-supabase.yml` | Técnico | Depende de conta | `infra.md` |

O ambiente `production` precisa de revisores obrigatórios e de regra de branch `main` (`infra.md`, "Ambientes e variáveis"). Os dois workflows de publicação exigem aprovação desse ambiente. **Depende de ação no GitHub.**

### 1.3 Segredos das Edge Functions (no Supabase)

Definidos com `supabase secrets set` ou pelo painel. Os workflows nunca os definem. Lista de nomes: `supabase/functions/.env.example` e `supabase/functions/_shared/config.ts`.

| Nome | Obrigatório | Uso | Dono | Status | Evidência |
|---|---|---|---|---|---|
| `ASAAS_API_KEY` | sim | cobranças da conta raiz, onboarding e releitura do webhook | Técnico e Contador | Depende de conta Asaas de produção | `_shared/config.ts`; `.env.example` |
| `ASAAS_BASE_URL` | sim em produção | endereço da API. **Sem valor, usa o sandbox** | Técnico | **Pendente** (bloqueio 3) | `_shared/config.ts`; `_shared/asaas-client.ts` linha 151 |
| `ASAAS_WEBHOOK_TOKEN` | sim | valida o cabeçalho do webhook e deriva o token de cada subconta | Técnico | Depende de ação (gerar valor de 32 a 255 caracteres) | `asaas-webhook/index.ts`; `.env.example` |
| `CRON_SECRET` | sim | `notify-dispatch` recusa chamada sem ele; deve ser igual a `cron_secret` no Vault | Técnico | Depende de ação | `notify-dispatch/index.ts`; `infra.md` |
| `SITE_URL` | sim | origem permitida no CORS | Técnico | Depende de domínio | `_shared/config.ts`; `infra.md` |
| `ALLOW_DEV_ORIGINS` | não definir em produção | libera `localhost:3000` no CORS | Técnico | Feito no repositório (padrão desligado). Com sandbox, liga sozinho (bloqueio 3) | `_shared/config.ts` |
| `PRO_GRACE_DAYS` | opcional (padrão 0; máximo 60) | carência do Pro em atraso | Dono (decisão) | **Pendente**: há outra fonte, `platform_settings.pro_grace_days` | `.env.example`; migração `20261109000007_pro_plan_expiry.sql` |
| `ASSIST_HOURLY_LIMIT` | opcional (padrão 10; 0 desliga) | cota horária de IA por usuário | Dono (custo) | Decisão do dono | `_shared/config.ts`; `_shared/assist.ts` |
| `ANTHROPIC_API_KEY` | opcional (sem ela: 503) | `request-assist`, `quote-assist`, `care-summary` | Dono (conta e custo) e Técnico | Depende de conta. Chamada real não testada | `request-assist/index.ts`; `care-summary/index.ts` (comentário) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | opcionais (sem elas: `skipped`) | envio por WhatsApp Cloud API | Dono (conta Meta) | Depende de conta e de templates aprovados | `_shared/config.ts`; `supabase/functions/README.md` |
| `WHATSAPP_GRAPH_VERSION` | opcional (padrão `v26.0`) | versão da API | Técnico | Feito no repositório | `.env.example` |
| `RESEND_API_KEY`, `EMAIL_FROM` | opcionais (sem elas: `skipped`) | e-mail transacional | Dono (domínio de envio) | Depende de conta e de domínio | `_shared/config.ts` |

Injetadas pelo próprio Supabase (não definir): `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEYS` ou `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ou `SUPABASE_SECRET_KEYS`. **Feito (plataforma).**

Vault do Postgres (gravado por SQL, nunca em arquivo):

| Nome | Uso | Status | Evidência |
|---|---|---|---|
| `notify_dispatch_url` | URL de `notify-dispatch` para o agendador | **Pendente** (gravar em produção) | `infra.md` ("Vault do Postgres"); `RUNBOOKS` S21 |
| `cron_secret` | igual a `CRON_SECRET` | **Pendente** | `infra.md`; `RUNBOOKS` item 6 |

As chaves das subcontas Asaas entram no Vault pela RPC `store_provider_payment_secret`, sem ação manual (`docs/ARQUITETURA.md`, "Conta de recebimento").

Proteção: `.env` e `.env.*` estão no `.gitignore`. Só `.env.example` e `.env.native` são versionados (`apps/web/.gitignore`). **Feito.**

---

## 2. Supabase de produção

| Item | Status | Evidência e detalhe |
|---|---|---|
| Projeto de produção | Depende de conta | Ainda não criado (`infra.md`, passo 1). A região está registrada como decisão em `apps/web/docs/DECISOES.md`, seção 8, item 5 ("região São Paulo"). Não conferido no painel. |
| Versão do Postgres | Depende de conta (conferir) | `supabase/config.toml` linha 41: `major_version = 17`. Conferir com `SHOW server_version` no projeto de produção, porque o arquivo pede que as duas versões sejam iguais. |
| Plano, backup e PITR | **Pendente** (decisão do dono) | Backup diário: 7 dias no plano Pro e 14 no Team (`RUNBOOKS` item 7). PITR é pago e não consta como contratado. Não há RPO nem frequência de ensaio de restauração no repositório. |
| Migrações | Feito no repositório (workflow) | 40 arquivos em `supabase/migrations/`: 11 de 2026-10-19, 2 de 2026-10-22, 2 de 2026-10-23, 1 de 2026-11-08 e 24 de 2026-11-09. Aplicadas pela ordem do nome. **Não há migração de reversão.** Workflow: dry run por padrão e, depois, `supabase db push --linked --skip-vault --yes`. CLI fixada em 2.121.0 (`package.json`, `deploy-supabase.yml`). |
| Contagem de migrações | **Pendente** | O `RUNBOOKS` foi conferido no commit `5805947`, com 36 migrações. Neste commit são 40. Conferir a lista com a consulta S40 antes e depois do dry run. |
| Carga do catálogo | **Pendente** (bloqueio 2) | `supabase/seed.sql` tem 44 áreas, 1.710 ocupações, 1.710 políticas e 96 bairros (cabeçalho do arquivo). Só insere nessas quatro tabelas, sem dados de prestador, cliente ou pedido. Usa `on conflict` em 10 instruções. Opção: `supabase db push --include-seed` numa carga controlada, depois de conferir que as quatro tabelas estão vazias. O comentário do workflow fala em "dados de demonstração", o que não corresponde ao arquivo. |
| Configuração de Auth | Depende de ação (painel) | Tabela própria logo abaixo. |
| `verify_jwt` por função | Feito no repositório; teste pendente | `supabase/config.toml` linhas 407 a 411: `asaas-webhook` e `notify-dispatch` com `verify_jwt = false`. O workflow também passa `--no-verify-jwt` às duas. As outras dez usam o padrão, que exige JWT. Após a publicação, chamar cada uma sem JWT e esperar 401. |
| Edge Functions | Feito no repositório | Doze funções em `supabase/functions/`: `account-delete`, `account-export`, `asaas-onboard`, `asaas-webhook`, `care-summary`, `charges-create`, `notify-dispatch`, `payments-create`, `payments-void`, `quote-assist`, `request-assist` e `subscriptions-manage`. `_shared` e `_runtime` são bibliotecas. Publicação em passo separado (`deploy_functions`). |
| Bucket de documentos | Feito no repositório | Bucket privado `provider-documents`, criado pela migração de prestadores (comentário em `config.toml`, linhas 121 e 122). Limite de arquivo local de 50 MiB (`config.toml`, linha 119). Conferir no painel. |
| Agendamentos (`pg_cron`) | Feito no repositório; conferir após publicar | Sete agendamentos nas migrações: `notification-counts-retention`, `product-events-retention`, `workeasy-booking-reminders`, `workeasy-dispatch-notifications`, `workeasy-expire-booking-requests`, `workeasy-expire-pro-plans` e `workeasy-expire-stale`. `docs/ARQUITETURA.md` lista só dois (desatualizado). Conferir com S39. |
| Testes de banco e integração | Feito (workflow manual); não executado aqui | pgTAP em `supabase/tests/database/`; integração em `test/integration/`. `web-ci.yml` é só `workflow_dispatch`. Não rodado nesta sessão (sem Docker). |

Configuração de Auth (o que o `config.toml` descreve x o que deve existir no painel de produção):

| Ajuste | Local (`config.toml`) | Produção (painel) | Status |
|---|---|---|---|
| Site URL | `http://localhost:3000` (linha 162) | igual a `VITE_SITE_URL` | **Pendente** |
| Redirecionamentos | localhost, `https://localhost`, `capacitor://localhost`, `http://tauri.localhost`, `tauri://localhost` (linhas 168 a 174) | domínio de produção e as origens dos apps | **Pendente** |
| Confirmação de e-mail e de telefone | ligada (linhas 238 e 287) | manter ligada | Confirmar |
| Cadastro por senha | `enable_signup = true` (linha 187) | `ARQUITETURA.md` ("Notificações") diz que em produção fica desligado ou exige confirmação. Login é por código | **Decisão** do dono e técnico |
| Templates de e-mail | `magic_link` e `confirmation`, com `{{ .Token }}` (linhas 259 a 267); arquivos em `supabase/templates/` | colar assunto e HTML no painel | Arquivos feitos; ação **pendente** |
| Provedor de SMS ou WhatsApp para o código | placeholders `local-placeholder` e número de teste fixo (linhas 296 a 325) | provedor real. Não copiar o bloco local | Depende de conta. Não existe hoje (`app-store.md`, B2 e B8) |
| SMTP de e-mail | sem SMTP próprio no arquivo (bloco comentado) | definir o provedor no painel | **Decisão pendente** |
| MFA para administradores | TOTP desligado (linhas 333 a 335) | exigir em produção? | **Pendente** (`RUNBOOKS`, apêndice A, item 15) |
| Validade do token | 3600 s (linha 176) | padrão | Feito |

---

## 3. Asaas

| Item | Status | Evidência e detalhe |
|---|---|---|
| Endereços dos ambientes | Feito no repositório | Sandbox `https://api-sandbox.asaas.com/v3`; produção `https://api.asaas.com/v3` (`_shared/asaas-client.ts`, linhas 23 e 24). |
| Padrão sem `ASAAS_BASE_URL` | **Pendente** (bloqueio 3) | Cai no sandbox (`_shared/asaas-client.ts`, linha 151; `_shared/config.ts`). Efeitos: cobranças e subcontas no sandbox, e CORS liberado para localhost. Definir `https://api.asaas.com/v3` no ambiente de produção e conferir com uma chamada de leitura. |
| Conta Asaas de produção | Depende de conta | Contrato, verificação de identidade e conta bancária da conta raiz. Responsáveis: Dono e Contador (`DECISOES.md`, seção 8, item 5). |
| Chave de API de produção | Depende de conta | Gerar no painel e gravar em `ASAAS_API_KEY`. O caminho exato no painel não foi aberto (`RUNBOOKS`, item 6, marcado como incerto). |
| Webhook da conta raiz | Depende de ação (painel) | URL `<endereço do projeto>/functions/v1/asaas-webhook`, com o mesmo token de `ASAAS_WEBHOOK_TOKEN` (`infra.md`, passo 7; `supabase/functions/README.md`). |
| Token do webhook | Depende de ação | Gerar valor de 32 a 255 caracteres. Não versionar. |
| Subcontas dos prestadores | Feito no repositório; não testado contra o Asaas real | `asaas-onboard` cria a subconta (`POST /accounts`), grava o `walletId`, guarda a chave no Vault e registra o webhook com `?acct=<provider_id>` e token derivado por HMAC. O `RUNBOOKS` informa que Asaas, WhatsApp e Resend não foram testados contra serviços reais. |
| Virada do sandbox para produção | **Pendente** | Não há migração de dados no repositório. Subcontas e cobranças de teste do sandbox não devem ser levadas para produção. Inferência a confirmar no painel: subcontas criadas no sandbox não existem em produção. Limpar dados de teste antes da abertura e registrar o procedimento. |
| Teste em produção | Regra documentada | Não cobrar de verdade para testar (`RUNBOOKS`, item 13). |
| Rotação do `ASAAS_WEBHOOK_TOKEN` | **Lacuna conhecida** | Exige registrar de novo o webhook de cada subconta. O código não faz isso (`RUNBOOKS`, apêndice A, item 11). |
| Fila de webhooks | Depende de ação do dono | Após 15 falhas seguidas, o Asaas pode pausar a fila. Eventos são guardados por 14 dias. Alertas por e-mail nas tentativas 5, 10 e 15 (`RUNBOOKS`, item 1). Cadastrar no Asaas um e-mail que o dono leia. |
| Preço e teste do Pro | Decisão do dono | Preço de R$ 49,00 (`pro_price_cents` = 4900; padrão em `subscriptions-manage`). Teste grátis: ajuste `pro_trial_days`, gravado em 30 dias; sem valor legível, 0 (`ARQUITETURA.md`, "Administração"). |
| Comissão e pagamento retido | Decisão jurídica e financeira | `commission_enabled` e `escrow_enabled` ficam desligados. Ligar depende de parecer e de conta Asaas configurada (`ARQUITETURA.md`, tabela de rotas). |
| Divisão (split) do pagamento | **Pendente** | Percentual sobre o valor líquido (`ARQUITETURA.md`, "Cobranças"). Validar com o contador e com o Asaas antes da primeira cobrança real. |

---

## 4. Hospedagem web (Cloudflare Pages)

| Item | Status | Evidência e detalhe |
|---|---|---|
| Build de produção | Feito no repositório | `npm ci`, lint, testes e `npm run build` (tsc, vite e prerender), com Node 22 (`deploy-web.yml`). Não executado nesta sessão. |
| Pré-renderização | Feito; depende de variável | 13.005 páginas medidas em 8 de novembro (`infra.md`, "Cabeçalhos HTTP"). Sitemap, canonical e linha `Sitemap:` do robots dependem de `VITE_SITE_URL`. |
| Publicação | Feito no repositório | `wrangler@4.152.0 pages deploy dist --branch main`, só a partir de `main`, com a palavra `DEPLOY` digitada e aprovação do ambiente `production` (`deploy-web.yml`). |
| Projeto Pages | Depende de conta | Tipo Direct Upload, branch de produção `main`, domínio customizado. Não verificado se um projeto com integração Git aceita esse envio (`infra.md`, passo 8). |
| Cabeçalhos (`public/_headers`) | Feito no repositório; teste em produção pendente | CSP, HSTS de um ano sem subdomínios, `nosniff`, `X-Frame-Options: DENY`, `Permissions-Policy` (geolocalização e câmera só do próprio site), COOP, CORP e cache. Validado localmente com `check-headers.mjs` e Chromium (`infra.md`), não no Cloudflare. Depois de publicar: `curl -sI https://<domínio>/`. |
| Política de conteúdo: pontos abertos | **Pendente** | (a) `connect-src` não libera o host do Sentry; ligar o relato de erros exige mudar a política. (b) `connect-src` e `img-src` liberam só `*.supabase.co`; domínio próprio para a API exige mudança. (c) `public/.well-known/apple-app-site-association` precisa de `Content-Type: application/json`, e não há regra para ele (`nativo.md`, 6.2). |
| Redirecionamentos (`public/_redirects`) | Feito no repositório | `/* /index.html 200` (aplicação de página única). Rotas sem regra própria, como `/pedido` e `/pro`, usam o cache padrão do Cloudflare, não verificado (`infra.md`). |
| `robots.txt` | Feito no repositório | `Allow: /`, com bloqueio de áreas privadas (`/conta`, `/admin`, `/pro/`, `/orcamento/`, `/search`, entre outras). |
| Domínio | Depende de ação do dono | Não há domínio de produção no repositório (`infra.md` usa `<domínio>`). `VITE_SITE_URL`, `SITE_URL` e os arquivos de App Links e Universal Links dependem dele. |
| HTTPS | Depende de conta | Certificado gerenciado pelo Cloudflare. Não verificado no repositório. |
| Modo demonstração | Feito no repositório | O workflow exige `VITE_SUPABASE_URL` e recusa build sem ela. |
| Textos jurídicos | **Pendente** (bloqueio 5) | Com `VITE_LEGAL_STATUS` vazio, todas as páginas jurídicas mostram aviso de rascunho. |
| Reversão do site | **Pendente** | Procedimento no Cloudflare Pages não documentado no repositório. O workflow só publica a partir de `main`. Reverter exige nova publicação de um commit anterior, como passo manual. |

---

## 5. Apps nativos (Capacitor e Tauri)

| Item | Status | Evidência e detalhe |
|---|---|---|
| Identificadores | Feito no repositório | `br.com.workeasy` em `capacitor.config.ts` (`appId`), `src-tauri/tauri.conf.json` (`identifier`), `android/app/build.gradle` (`applicationId`) e no projeto Xcode (`PRODUCT_BUNDLE_IDENTIFIER`). Consistente. Não mudar depois do primeiro envio às lojas (`google-play.md`, D7). Confirmação do dono. |
| Versões | **Pendente** (técnico) | Android: `versionCode 1` e `versionName "1.0"`. iOS: `MARKETING_VERSION 1.0` e `CURRENT_PROJECT_VERSION 1`. Desktop: `0.1.0` (`package.json`, `tauri.conf.json`, `Cargo.toml`). Não há política de versão. |
| Assinatura Android | Depende de conta | `android/app/build.gradle` não tem `signingConfig` de release, e a chave de upload não está no repositório. O CI gera só APK de depuração (`web-release.yml`). Depende de conta Google Play de organização e de chave guardada fora do repositório. |
| Assinatura iOS | Depende de conta | Projeto sem `DEVELOPMENT_TEAM`, com assinatura automática. O CI gera build de simulador sem assinatura. Depende de conta Apple Developer de organização e de Xcode 26 (`app-store.md`, seção 2 e R3). |
| Desktop | Decisão do dono | Instaladores de Windows e macOS sem assinatura de código e sem atualizador automático (`desktop-e-assinatura.md`, seção 0). Linux gera `.deb` e `.AppImage`. O documento recomenda não publicar nas lojas no lançamento. |
| Chave do atualizador | **Pendente** | Gerar fora do repositório antes do primeiro lançamento público. Chave perdida impede atualizar quem já instalou (`desktop-e-assinatura.md`, 5.4). |
| App Links (Android) | **Pendente** | `android/app/src/main/AndroidManifest.xml`, linha 33, com host de exemplo (`app.workeasy.example`). `public/.well-known/assetlinks.json` com `TODO` na impressão digital do certificado de assinatura do Google Play. |
| Universal Links (iOS) | **Pendente** | `public/.well-known/apple-app-site-association` com `TODO-TEAM-ID`. Não há arquivo de entitlements (`nativo.md`, 3.4). |
| Permissões Android | **Pendente** (decisão) | `INTERNET`, `CAMERA`, localização fina e grosseira (`nativo.md`, 2.2). A câmera é pedida sem uso real hoje (`google-play.md`, B12). |
| Privacidade iOS | Feito parcialmente | `PrivacyInfo.xcprivacy` existe e está no alvo do Xcode. Lista de dados depende de revisão do advogado e do encarregado (`nativo.md`, 3.2). `ITSAppUsesNonExemptEncryption` não declarado: decisão do responsável pela loja. |
| Rede nativa | Feito no repositório | `cleartext: false` no Capacitor; origens de CORS fixas nas funções (`docs/ARQUITETURA.md`, "CORS"). |
| Bloqueios de loja | **Pendente** (dono e técnico) | Apple: B1 a B8 (`app-store.md`, seção 0). Google Play: B01 a B14 (`google-play.md`, seção 1). Os principais: textos legais, backend de produção, venda do Pro dentro do app, denúncia e bloqueio de conteúdo, conteúdo de demonstração no build, página web de exclusão de conta e login do revisor. |
| Build e release nativos | Feito no repositório | `web-release.yml` (manual ou tag `v*`) gera seis alvos sem assinatura. Não executado nesta sessão. |
| Verificação em aparelho | **Pendente** | Lista em `nativo.md`, seções 2.4, 3.4 e 6. |
| CSP do Tauri | Risco aceito, registrar | `style-src 'unsafe-inline'` mantido por React e Tailwind (`nativo.md`, 4.1). |

---

## 6. Observabilidade

| Item | Status | Evidência e detalhe |
|---|---|---|
| Relato de erros (Sentry) | Feito no código; ativar **pendente** | `lib/observability.ts`. Sem DSN, nada é enviado. Para ligar: conta Sentry (região escolhida pelo dono), variável repassada no workflow e host liberado na CSP. |
| Mascaramento de dados | Feito no código | `beforeSend` mascara e-mail, telefone, CPF e CNPJ; remove query, corpo, cookies e usuário. Sem replay e sem traces. Testes em `test/observability/`. |
| Teste de ativação do Sentry | **Pendente** | Erro de teste aparece no projeto sem dado pessoal (`observabilidade.md`, §5, passo 5). |
| Rastreadores | Feito no repositório | Nenhum script de terceiros em `index.html` (`observabilidade.md`, §1). Funil próprio em `product_events`, com 11 eventos, sem painel nesta frente. |
| Logs de funções e de banco | Depende de conta e de plano | Painel do Supabase. A retenção depende do plano e não está no repositório. |
| Logs de webhook do Asaas | Depende de ação do dono | Painel "Logs de Webhooks". Eventos guardados por 14 dias no Asaas (`RUNBOOKS`, item 1). |
| Alertas automáticos | **Pendente** | Não existem no repositório (`RUNBOOKS`, itens 1 e 5). |
| Rotina diária de checagem | **Pendente** | Consultas S01, S03, S06, S07, S10, S14, S16, S17 e S18 do `RUNBOOKS`. |
| Agendador silencioso | **Pendente** | O job de envio aparece como `succeeded` mesmo com o Vault vazio (`RUNBOOKS`, apêndice A, item 9). Conferir S20 e o Vault logo após a publicação. |
| Monitor externo de disponibilidade | **Pendente** | Não há no repositório. |
| Retenção | Parcial; decisão jurídica **pendente** | `product_events` é apagado após 400 dias (cron diário às 03:17 UTC, `observabilidade.md`, §4). `audit_log` é imutável e não tem job de retenção (decisão jurídica). Há job de contagem de notificações (`notification-counts-retention`). |
| Indicadores (KPIs) | **Pendente** | `observabilidade.md`, §6, marca o mapeamento como incerto e cita `docs/operacao/08`, que existe neste commit (`apps/web/docs/operacao/08-metricas-e-portoes.md`). Conferir a tabela contra esse arquivo. |

---

## 7. Rollback e incidente

| Item | Status | Evidência e detalhe |
|---|---|---|
| Quem decide | Feito no documento; nomes **pendentes** | Responsável pelo incidente (`docs/juridico/08-plano-de-resposta-a-incidentes.md`, seção 3.1): com uma pessoa, o titular; com duas ou três, o titular ou o sócio técnico. |
| Encarregado (LGPD) | Depende de ação do dono | Não indicado: "ainda não indicado" (`docs/juridico/06-ripd-relatorio-de-impacto.md`, linhas 11 e 112). |
| Contato de segurança | **Pendente** | `.github/SECURITY.md` com "CONTATO A DEFINIR". Reporte privado de vulnerabilidades do GitHub não ligado (`infra.md`, passo 11). |
| Desligar recurso | Feito como procedimento; teste **pendente** | `RUNBOOKS`, item 12: `ASSIST_HOURLY_LIMIT=0`; comissão desligada; `pro_trial_days` em 0; desligar o agendador de envio; `supabase functions delete`; suspender prestador. Não desligar o webhook do Asaas nem a verificação de JWT. |
| Reverter banco | Feito como procedimento | Não há arquivo de reversão. Correção por migração nova. `supabase migration repair` só ajusta o histórico (`RUNBOOKS`, item 8). |
| Restaurar banco | Depende de plano | Restaurar primeiro em projeto novo, depois conferir (`RUNBOOKS`, item 7). |
| Reverter Edge Functions | **Pendente** | Não há artefato versionado. Reverter é publicar de novo a partir de um commit anterior, com as mesmas flags (`deploy-supabase.yml`). Procedimento a ensaiar. |
| Reverter o site | **Pendente** | Ver seção 4. |
| Segredo comprometido | **Pendente** | Ordem de troca em `RUNBOOKS`, item 6. Vários caminhos estão marcados como incertos. |
| Administrador comprometido | **Pendente** | `RUNBOOKS`, item 10. MFA para administradores não confirmado. |
| Comunicação de incidente | **Pendente** | Titulares e ANPD, com prazos condicionados a parecer (`docs/juridico/08`). |
| Janela de manutenção | Feito como procedimento | Checklist antes, durante e depois em `RUNBOOKS`, item 13. |

---

## 8. Pendências do dono

| # | Pendência | Tipo | Responsável | Status | Evidência |
|---|---|---|---|---|---|
| 1 | Pessoa jurídica de tecnologia, separada de outra empresa do dono, e contador contratado | Conta e contrato | Dono e Contador | Depende de ação | `DECISOES.md`, seção 8, item 3 |
| 2 | Dados da empresa: nome, CNPJ, endereço e SAC (`VITE_COMPANY_*`, `VITE_SAC_*`) | Dados públicos | Contador e Dono | **Pendente** | `config/legal.ts`; `producao-vs-demonstracao.md`, §4 |
| 3 | Termos, Privacidade e SAC aprovados pelo advogado; `VITE_LEGAL_STATUS=vigente` | Jurídico | Dono e advogado | **Pendente** | `content/legal/`; `docs/juridico/` |
| 4 | Respostas às sete perguntas ao advogado (split, comissão, LC 214/2025, cuidado, LGPD, exclusão de conta, teste grátis) | Jurídico | Dono e advogado | **Pendente** | `DECISOES.md`, seção 8, "Perguntas para o advogado" |
| 5 | Encarregado indicado e canal público | Jurídico | Dono | **Pendente** | `docs/juridico/06`, linhas 11, 112 e 619 |
| 6 | Comissão e pagamento retido: manter desligados ou ativar com parecer | Jurídico e financeiro | Dono, advogado e contador | **Decisão pendente** (ambos desligados) | `platform_settings`; `ARQUITETURA.md` |
| 7 | Preço (R$ 49), teste grátis (30 dias) e aviso de cobrança automática | Financeiro e jurídico | Dono e advogado | **Pendente** | `ARQUITETURA.md`, "Administração"; `DECISOES.md`, pergunta 7 |
| 8 | Conta Supabase de produção, plano e backup ou PITR | Conta e financeiro | Dono e Técnico | Depende de ação | `infra.md`, passo 1; `RUNBOOKS`, item 7 |
| 9 | Conta Cloudflare, projeto Pages, domínio e HTTPS | Conta | Dono e Técnico | Depende de ação | `infra.md`, passos 8 e 10 |
| 10 | GitHub: ambiente `production` com revisores, regra para `main`, proteção de branch, reporte privado e Dependabot | Ação | Técnico e Dono | Depende de ação | `infra.md`, passos 11 a 13 |
| 11 | Conta Asaas de produção: contrato, verificação e conta bancária | Conta e contrato | Dono e Contador | Depende de ação | `DECISOES.md`, seção 8, item 5 |
| 12 | WhatsApp Business: os seis templates aprovados com os nomes exatos; provedor de código por SMS ou WhatsApp | Conta | Dono | Depende de ação | `supabase/functions/README.md`; `_shared/notifications.ts`; `app-store.md`, B2 |
| 13 | Resend: domínio de envio e remetente | Conta | Técnico e Dono | Depende de ação | `_shared/config.ts` |
| 14 | Anthropic: chave, faturamento e teto de uso | Conta e financeiro | Dono | Depende de ação | `request-assist/index.ts` |
| 15 | Sentry: conta e região (União Europeia ou Estados Unidos) | Conta e decisão | Dono | **Pendente** | `observabilidade.md`, §5 |
| 16 | Apple Developer de organização (taxa anual de US$ 99, D-U-N-S, Xcode 26) | Conta | Dono e Contador | Depende de ação | `app-store.md`, seção 2 |
| 17 | Google Play Console de organização (D-U-N-S e verificação de identidade) | Conta | Dono e Contador | Depende de ação | `google-play.md`, seções 0 e 3 |
| 18 | Decisões de loja: D1 a D6 (iOS) e D1 a D7 (Android), incluindo busca da marca no INPI | Decisão | Dono | **Pendente** | `app-store.md`, seção 0; `google-play.md`, seção 0; `DECISOES.md`, seção 8, item 6 |
| 19 | Desktop: distribuição direta ou loja, assinatura de Windows e macOS, atualizador | Decisão e custo | Dono | **Pendente** | `desktop-e-assinatura.md`, seção 0 |
| 20 | Repositório público ou privado | Decisão | Dono | **Pendente** | `DECISOES.md`, seção 8, item 1, pede repositório privado. O pedido de trabalho trata o repositório como público |
| 21 | Chave do Gemini: confirmar se algum build público a usou e rotacionar, se for o caso | Segurança | Dono e Técnico | **Pendente** | `DECISOES.md`, seção 8, item 2 |
| 22 | IA de terceiros: aviso que nomeie o provedor e aceite registrado | Jurídico e produto | Dono e advogado | **Pendente** | `app-store.md`, B8 |
| 23 | Destino da API em `services/`: `render.yaml` e `cloudbuild.yaml` apontam para `services/api/Dockerfile`. O arquivo não declara deploy automático; conferir no painel se há publicação a cada push [incerto] | Técnico e decisão | Técnico e Dono | **Pendente** | `render.yaml`; `cloudbuild.yaml`; `services/api/` |

---

## Documentos desatualizados ou em conflito

Estes pontos não bloqueiam a publicação, mas podem levar a uma decisão errada. Corrigir os documentos no mesmo commit das mudanças.

| Documento | Afirmação | Situação neste commit |
|---|---|---|
| `apps/web/docs/arquitetura/infra.md` | `config.toml` não tem entradas `[functions]` | Tem, nas linhas 407 a 411 |
| `apps/web/docs/arquitetura/infra.md` | Código não lê `VITE_COMPANY_*`, `VITE_SAC_*` e `VITE_LEGAL_STATUS` | `config/legal.ts` lê todas |
| `apps/web/docs/arquitetura/infra.md` | Passo a passo de publicação em `DEPLOY.md` | O arquivo não existe no repositório |
| `.github/workflows/deploy-supabase.yml` (comentário) | Seed tem "dados de demonstração" | Seed tem catálogo e bairros |
| `.github/workflows/deploy-supabase.yml` (comentário) | `config.toml` sem entradas de função | Tem |
| `apps/web/docs/ARQUITETURA.md` ("Notificações") | Dois agendamentos | Sete em `pg_cron` nas migrações |
| `apps/web/docs/operacao/08` (citado em `observabilidade.md`, §6) | Arquivo não existe na árvore de trabalho | Existe neste commit |
| `apps/web/docs/RUNBOOKS.md` | 36 migrações, commit `5805947` | 40 migrações neste commit |
| `apps/web/docs/ARQUITETURA.md` ("Testes e CI") x `RUNBOOKS` (apêndice A, item 16) | Editar migração aplicada x criar migração nova | Regra conflitante |
| `apps/web/docs/lojas/google-play.md`, B05 | Faixa de protótipo em toda tela | `producao-vs-demonstracao.md` registra a correção com backend, com pendências na seção 8. Conferir no build |

---

## Verificação após a primeira publicação

- `curl -sI https://<domínio>/`: CSP, HSTS e `cache-control` (`infra.md`, passo 10).
- Chamada sem JWT às dez funções de usuário: espera-se 401. Webhook com token errado: 401. `notify-dispatch` sem `x-cron-secret`: recusado.
- Contagem de áreas, ocupações, políticas e bairros: 44, 1.710, 1.710 e 96.
- Consultas do `RUNBOOKS`: S40 (migrações), S39 (agendamentos), S21 (Vault), S20 (respostas HTTP), S18 (fila vencida).
- Login por código chega ao e-mail real com o template certo.
- Webhook de teste no sandbox não aparece como cobrança de produção.
- Nenhuma ocorrência de `sb_secret_` nem de `SUPABASE_SERVICE_ROLE` em `dist/` (já checado pelo workflow; repetir após qualquer mudança).

---

## Notas sobre este documento

- Os caminhos seguem a convenção do início. Os valores de segredos, IDs de projeto e identificadores de conta não aparecem aqui.
- A ausência de um item no repositório está marcada como pendente. Itens marcados como incertos não foram conferidos.
