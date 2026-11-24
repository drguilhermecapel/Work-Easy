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

1. **Credencial versionada.** `docker-compose.yml` (raiz) não traz mais a senha: desde o commit `0f8c4fd`, `POSTGRES_PASSWORD` vem do `.env`, que o git ignora. O valor antigo continua no histórico do git (introduzido em `97e8dd5`), e o repositório é público. Trocar a senha em todo ambiente em que ela tenha sido usada e não reproduzir o valor em lugar nenhum. Responsável: Técnico e Dono (pendência 24). **Pendente** (a troca; o arquivo já está corrigido).
2. **Catálogo vazio em produção.** O workflow aplicava só migrações. Feito no repositório: depois das migrações, o workflow aplica `supabase/catalog.sql` (só com `dry_run` desligado). O arquivo sai do mesmo gerador do seed e tem só as quatro tabelas de catálogo. Falta a primeira execução e a conferência das contagens (44 áreas, 1.710 ocupações, 1.710 políticas, 96 bairros). Responsável: Técnico. **Pendente de execução.**
3. **Asaas no sandbox por padrão.** Feito no repositório: em produção (`APP_ENV=production`, ou `SITE_URL` público sem `APP_ENV`), `ASAAS_BASE_URL` é obrigatória e o sandbox é recusado. Sem ela, as funções que falam com o Asaas respondem 503 e registram `ConfigError`. Em produção, CORS para localhost fica fechado. Falta definir `APP_ENV=production` e `ASAAS_BASE_URL=https://api.asaas.com/v3` nos segredos de produção. Responsável: Técnico. **Depende de ação.**
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
| `VITE_SENTRY_DSN` | variável `production`, repassada pelo workflow desde 24/11/2026 | pública (não é segredo, mas não se versiona) | Dono (conta e região) | Feito no repositório; **depende de conta ou ação do dono** (criar a variável) | `lib/observability.ts`; `observabilidade.md` §5 |
| `VITE_APP_VERSION` | o workflow envia o commit publicado (`github.sha`) | pública | Técnico | Feito no repositório | `lib/observability.ts` |
| `VITE_ROUTER` | `.env.native` (nativos usam `hash`); padrão `browser` | pública | Técnico | Feito no repositório | `.env.native`; `vite-env.d.ts` |

Achados:

- `deploy-web.yml` não repassa `VITE_SENTRY_DSN` nem `VITE_APP_VERSION`. Mesmo que a variável seja criada no ambiente, o build de produção sai sem relato de erros. **Corrigido em 24/11/2026:** o workflow repassa as duas, e também `VITE_LOGIN_METHODS`. Falta o dono criar `VITE_SENTRY_DSN` no ambiente.
- `apps/web/docs/arquitetura/infra.md` diz que o código ainda não lê `VITE_COMPANY_*`, `VITE_SAC_*` e `VITE_LEGAL_STATUS`. Isso está desatualizado: `config/legal.ts` lê todas elas. Atualizar o documento. **Corrigido em 24/11/2026.**
- A checagem do workflow recusa só `sb_secret_` em `VITE_SUPABASE_PUBLISHABLE_KEY`, e o varrimento do bundle procura `sb_secret_` e `SUPABASE_SERVICE_ROLE`. Uma chave `service_role` legada (JWT) passa pelas duas checagens. O app a recusa em tempo de execução (`lib/supabaseKey.ts`), mas a chave já estaria no JavaScript público. Estender a checagem do workflow para ler o papel do JWT. Responsável: Técnico. **Corrigido em 24/11/2026:** `scripts/check-bundle-secrets.mjs` recusa `sb_secret_`, o nome `SUPABASE_SERVICE_ROLE` e qualquer JWT com papel `service_role`, na variável (antes do build) e nos arquivos de `dist/`; roda em `web-ci.yml` e em `deploy-web.yml`.

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
| `ASAAS_BASE_URL` | sim em produção | endereço da API. Em produção é obrigatória, sem padrão; o sandbox é recusado | Técnico | Feito no repositório (falha fechada). Falta o valor (bloqueio 3) | `_shared/config.ts` (`asaasBaseUrl`); `_runtime/supabase.ts` (`asaasClient`) |
| `ASAAS_WEBHOOK_TOKEN` | sim | valida o cabeçalho do webhook e deriva o token de cada subconta | Técnico | Depende de ação (gerar valor de 32 a 255 caracteres) | `asaas-webhook/index.ts`; `.env.example` |
| `CRON_SECRET` | sim | `notify-dispatch` e `background-check-purge` recusam chamada sem ele; deve ser igual a `cron_secret` no Vault | Técnico | Depende de ação | `notify-dispatch/index.ts`; `background-check-purge/handler.ts`; `infra.md` |
| `SITE_URL` | sim | origem permitida no CORS | Técnico | Depende de domínio | `_shared/config.ts`; `infra.md` |
| `ALLOW_DEV_ORIGINS` | não definir em produção | libera `localhost:3000` no CORS | Técnico | Feito no repositório: em produção é ignorado; fora dela, liga com o sandbox ou com `true` | `_shared/config.ts` |
| `APP_ENV` | recomendado em produção (`production`) | define o ambiente: em produção, sem sandbox e sem localhost no CORS | Técnico | Depende de ação (definir `production`) | `_shared/config.ts` (`isProductionEnv`); `.env.example` |
| `PRO_GRACE_DAYS` | opcional (padrão 0; máximo 60) | carência do Pro em atraso | Dono (decisão) | Feito no repositório (24/11/2026): a fonte única é `platform_settings.pro_grace_days`; a variável só vale quando a chave não pode ser lida | `.env.example`; migração `20261109000007_pro_plan_expiry.sql` |
| `ASSIST_HOURLY_LIMIT` | opcional (padrão 10; 0 desliga) | cota de IA por usuário em janela deslizante de 60 minutos, com uma contagem só para `request-assist`, `quote-assist` e `care-summary` | Dono (custo) | Decisão do dono | `_shared/config.ts`; `_shared/assist.ts` |
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
| Migrações | Feito no repositório (workflow) | 95 arquivos em `supabase/migrations/` no HEAD `cef8acc` (40 no commit `329b0cd`, base desta revisão): 11 de 2026-10-19, 2 de 2026-10-22, 2 de 2026-10-23, 1 de 2026-11-08, 24 de 2026-11-09, 35 de 2026-11-10 e 20 de 2026-11-18. Aplicadas pela ordem do nome. **Não há migração de reversão.** Workflow: dry run por padrão e, depois, `supabase db push --linked --skip-vault --yes`. CLI fixada em 2.121.0 (`package.json`, `deploy-supabase.yml`). |
| Contagem de migrações | **Pendente** | O `RUNBOOKS` foi conferido no commit `5805947`, com 36 migrações. No HEAD `cef8acc` são 95 (40 em `329b0cd`). Conferir a lista com a consulta S40 antes e depois do dry run. |
| Carga do catálogo | **Feito no repositório** (bloqueio 2); falta a primeira execução | O workflow aplica `supabase/catalog.sql` depois das migrações, só com `dry_run` desligado. O arquivo tem 44 áreas, 1.710 ocupações, 1.710 políticas e 96 bairros, nas quatro tabelas de catálogo, e sai do mesmo gerador do seed (`scripts/generate-seed.mjs`). Não usa `--include-seed`: o seed de desenvolvimento pode ganhar dados de teste. Testes em `test/seed.test.ts`. |
| Configuração de Auth | Depende de ação (painel) | Tabela própria logo abaixo. |
| `verify_jwt` por função | Feito no repositório; teste pendente | `supabase/config.toml` linhas 407 a 415: `asaas-webhook`, `notify-dispatch` e `background-check-purge` com `verify_jwt = false`. O workflow passa `--no-verify-jwt` só às duas primeiras; `background-check-purge` vai sem a flag e depende do `config.toml`. Conferir no painel do Supabase que a verificação de JWT dela está desligada: uma chamada sem JWT dá 401 nos dois casos, então não serve de teste. As outras onze usam o padrão, que exige JWT. Após a publicação, chamar cada uma das onze sem JWT e esperar 401. |
| Edge Functions | Feito no repositório | Catorze funções em `supabase/functions/`: `account-delete`, `account-export`, `asaas-onboard`, `asaas-webhook`, `background-check-purge`, `care-summary`, `charges-create`, `notify-dispatch`, `payments-create`, `payments-void`, `provider-document-upload`, `quote-assist`, `request-assist` e `subscriptions-manage`. `_shared` e `_runtime` são bibliotecas. Publicação em passo separado (`deploy_functions`). |
| Bucket de documentos | Feito no repositório | Bucket privado `provider-documents`, criado pela migração de prestadores (comentário em `config.toml`, linhas 121 e 122). Limite de arquivo local de 50 MiB (`config.toml`, linha 119). Conferir no painel. |
| Agendamentos (`pg_cron`) | Feito no repositório; conferir após publicar | Oito agendamentos nas migrações: `notification-counts-retention`, `product-events-retention`, `retention-purge-daily` (03:00 UTC, chama `run_retention_purge()`), `workeasy-booking-reminders`, `workeasy-dispatch-notifications`, `workeasy-expire-booking-requests`, `workeasy-expire-pro-plans` e `workeasy-expire-stale`. O `retention-purge-daily` só é criado se o `pg_cron` estiver instalado; sem ele, a migração emite aviso. `background-check-purge` não tem agendamento nas migrações: é ação do dono (`docs/operacao/11-agendamento-de-rotinas.md`). `docs/ARQUITETURA.md` atualizado (8 agendamentos + `workeasy-background-check-purge` `20 3 * * *`). Conferir com S39. |
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
| Padrão sem `ASAAS_BASE_URL` | Feito no repositório; falta o valor (bloqueio 3) | Em produção não há padrão. Sem `ASAAS_BASE_URL`, o cliente não é criado: as funções que falam com o Asaas respondem 503 `payments_not_configured` e o `ConfigError` aparece no log. O sandbox é recusado em produção. Definir `https://api.asaas.com/v3` no ambiente de produção e conferir com uma chamada de leitura. Testes em `test/functions/asaas-environment.test.ts`. |
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
| Publicação | Feito no repositório | `wrangler pages deploy dist --branch main` (wrangler 4.164.0 pelo lock em `tools/wrangler`), só a partir de `main`, com a palavra `DEPLOY` digitada e aprovação do ambiente `production` (`deploy-web.yml`). |
| Projeto Pages | Depende de conta | Tipo Direct Upload, branch de produção `main`, domínio customizado. Não verificado se um projeto com integração Git aceita esse envio (`infra.md`, passo 8). |
| Cabeçalhos (`public/_headers`) | Feito no repositório; teste em produção pendente | CSP, HSTS de um ano sem subdomínios, `nosniff`, `X-Frame-Options: DENY`, `Permissions-Policy` (geolocalização e câmera só do próprio site), COOP, CORP e cache. Validado localmente com `check-headers.mjs` e Chromium (`infra.md`), não no Cloudflare. Depois de publicar: `curl -sI https://<domínio>/`. |
| Política de conteúdo: pontos abertos | **Pendente** | (a) `connect-src` já libera `*.ingest.sentry.io`, `*.ingest.de.sentry.io` e `*.ingest.us.sentry.io`; ligar o relato de erros depende de conta Sentry e de `VITE_SENTRY_DSN` no workflow (seção 1.1). (b) `connect-src` libera só `*.supabase.co` e os hosts do Sentry, e `img-src` não libera `*.supabase.co` (libera `'self'`, `data:` e `blob:`); domínio próprio para a API exige mudança. (c) `public/.well-known/apple-app-site-association` já configurado com `Content-Type: application/json` em `public/_headers` (`e8ba931`). |
| Redirecionamentos (`public/_redirects`) | Feito no repositório | `/* /index.html 200` (aplicação de página única). Rotas sem regra própria, como `/pedido` e `/pro`, usam o cache padrão do Cloudflare, não verificado (`infra.md`). |
| `robots.txt` | Feito no repositório | `Allow: /`, com bloqueio de áreas privadas (`/conta`, `/admin`, `/pro/`, `/orcamento/`, `/search`, entre outras). |
| Domínio | Depende de ação do dono | Não há domínio de produção no repositório (`infra.md` usa `<domínio>`). `VITE_SITE_URL`, `SITE_URL` e os arquivos de App Links e Universal Links dependem dele. |
| HTTPS | Depende de conta | Certificado gerenciado pelo Cloudflare. Não verificado no repositório. |
| Modo demonstração | Feito no repositório | O workflow exige `VITE_SUPABASE_URL` e recusa build sem ela. |
| Textos jurídicos | **Pendente** (bloqueio 5) | Com `VITE_LEGAL_STATUS` vazio, todas as páginas jurídicas mostram aviso de rascunho. |
| Reversão do site | Feito no repositório | Procedimento de rollback no Cloudflare Pages documentado em `RUNBOOKS.md` (`2afb1b3`). O workflow só publica a partir de `main`. Reverter exige nova publicação de um commit anterior, como passo manual. |

---

## 5. Apps nativos (Capacitor e Tauri)

| Item | Status | Evidência e detalhe |
|---|---|---|
| Identificadores | Feito no repositório | `br.com.workeasy` em `capacitor.config.ts` (`appId`), `src-tauri/tauri.conf.json` (`identifier`), `android/app/build.gradle` (`applicationId`) e no projeto Xcode (`PRODUCT_BUNDLE_IDENTIFIER`). Consistente. Não mudar depois do primeiro envio às lojas (`google-play.md`, D7). Confirmação do dono. |
| Versões | Feito no repositório | Android: desde 24/11/2026 o build aceita `-PappVersionCode` e `-PappVersionName` e assina com `android/keystore.properties` quando o arquivo existe (fora do repositório; `*.jks`, `*.keystore` e `keystore.properties` estão no `.gitignore`); sem as propriedades continuam `versionCode 1` e `versionName "1.0"`. iOS: `MARKETING_VERSION 1.0` e `CURRENT_PROJECT_VERSION 1`. Desktop: `0.1.0` (`package.json`, `tauri.conf.json`, `Cargo.toml`). Política documentada em `nativo.md` (DD112). |
| Assinatura Android | Depende de conta | `android/app/build.gradle` assina o release quando existe `android/keystore.properties` (fora do repositório). Provado em 24/11/2026 com uma chave descartável: `bundleRelease` gera o `.aab` e `jarsigner -verify` passa; sem o arquivo sai sem assinatura. A chave de upload real não existe e não está no repositório. O CI gera só APK de depuração (`web-release.yml`); o `.aab` sai por `scripts/android-release.sh`. Depende de conta Google Play de organização e de chave guardada fora do repositório. |
| Assinatura iOS | Depende de conta | Projeto sem `DEVELOPMENT_TEAM`, com assinatura automática. O CI gera build de simulador sem assinatura. Depende de conta Apple Developer de organização e de Xcode 26 (`app-store.md`, seção 2 e R3). |
| Desktop | Decisão do dono | Instaladores de Windows e macOS sem assinatura de código e sem atualizador automático (`desktop-e-assinatura.md`, seção 0). Linux gera `.deb` e `.AppImage`. O documento recomenda não publicar nas lojas no lançamento. |
| Chave do atualizador | **Pendente** | Gerar fora do repositório antes do primeiro lançamento público. Chave perdida impede atualizar quem já instalou (`desktop-e-assinatura.md`, 5.4). |
| App Links (Android) | **Pendente** (dono) | O filtro `autoVerify` existe, inclusive no manifesto mesclado do `.aab` (conferido em 24/11/2026), mas com o host de exemplo `app.workeasy.example` (`AndroidManifest.xml`), e `public/.well-known/assetlinks.json` tem `TODO` na impressão digital do certificado de assinatura do Google Play. Depende do domínio e do primeiro envio ao Console. `node scripts/check-app-links.mjs` confere a coerência dos arquivos (hoje coerente, 4 pendências); com `--strict` falha enquanto houver placeholder. Como preencher: `nativo.md`, seção 8. Não verificado em aparelho. |
| Universal Links (iOS) | **Pendente** (dono) | Desde 24/11/2026 há `ios/App/App/App.entitlements` com `applinks:` de exemplo, ligado ao alvo no projeto Xcode (edição à mão, não aberta no Xcode). `public/.well-known/apple-app-site-association` continua com `TODO-TEAM-ID`. Faltam domínio real, Team ID, capacidade "Associated Domains" no App ID e teste em iPhone (`nativo.md`, 3.4 e seção 8). |
| Permissões Android | Feito no repositório; falta o dono decidir o perfil e testar em aparelho | O build `release` tira `CAMERA` e localização (`android/app/src/release/AndroidManifest.xml`; o `debug` mantém). Provado em 24/11/2026 no manifesto mesclado do `.aab` de release: só `INTERNET` (mais a permissão interna do pacote). Continua dependendo da decisão D2 do dono (perfil sem a linha Cuidado) e de teste em aparelho de que a foto do cadastro funciona sem `CAMERA` (`google-play.md`, B12 e 14.5). |
| Privacidade iOS | Feito parcialmente | `PrivacyInfo.xcprivacy` existe e está no alvo do Xcode; em 24/11/2026 saiu dele a localização precisa e do `Info.plist` a chave de localização (o Cuidado não entra na build de loja), e o texto de câmera passou a falar só da foto de documento. Lista de dados depende de revisão do advogado e do encarregado (`nativo.md`, 3.2; `app-store.md`, 5.5). `ITSAppUsesNonExemptEncryption` não declarado: decisão do responsável pela loja. |
| Rede nativa | Feito no repositório | `cleartext: false` no Capacitor; origens de CORS fixas nas funções (`docs/ARQUITETURA.md`, "CORS"). |
| Bloqueios de loja | **Pendente** (dono e técnico) | Apple: B1 a B8 (`app-store.md`, seção 0). Google Play: B01 a B14 (`google-play.md`, seção 1). Os principais: textos legais, backend de produção, venda do Pro dentro do app, denúncia e bloqueio de conteúdo, conteúdo de demonstração no build, página web de exclusão de conta e login do revisor. |
| Build e release nativos | Feito no repositório | `web-release.yml` (manual ou tag `v*`) gera seis alvos sem assinatura. Não executado nesta sessão. |
| Verificação em aparelho | **Pendente** | Lista em `nativo.md`, seções 2.4, 3.4 e 6. |
| CSP do Tauri | Risco aceito, registrado (DD111) | `style-src 'unsafe-inline'` mantido por React e Tailwind (`nativo.md`, 4.1). |

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
| Alertas automáticos | Depende de conta ou ação do dono | Nenhum alerta automático existe, e o repositório não cria nenhum: depende de conta e de destino do aviso. O que cabe no repositório está pronto: rotina de leitura (linha abaixo) e `scripts/healthcheck.mjs`. Opções e passos do dono em `docs/operacao/13-alertas-e-monitor.md` (`RUNBOOKS`, itens 1 e 5). |
| Rotina diária de checagem | Feito no repositório; a execução diária depende do dono | `scripts/ops-daily-checks.sql`: S01, S03, S06, S07, S10, S14, S16, S17, S18 e S20 do `RUNBOOKS`, mais S21 e um painel de contagens, tudo em `begin read only`. Executado sem erro contra o banco local (109 migrações); teste em `test/ops/daily-checks-sql.test.ts`. Como rodar: `docs/operacao/12-checagens-diarias.md`. Alguém precisa abrir o SQL Editor todo dia: não há aviso automático. Não foi executado em produção. |
| Agendador silencioso | Feito no repositório (detecção); conferir após publicar | O job de envio continua aparecendo como `succeeded` mesmo com o Vault vazio (`RUNBOOKS`, apêndice A, item 9): o comportamento não mudou. O painel de `scripts/ops-daily-checks.sql` detecta o sinal (S20: fila vencida sem chamada HTTP em 10 minutos; S21: chaves ausentes no Vault, só pelo nome). Falta rodar logo após a primeira publicação e cadastrar as chaves (ação do dono). |
| Monitor externo de disponibilidade | Depende de conta ou ação do dono | A verificação está no repositório (`scripts/healthcheck.mjs`: HTTP 200 e cabeçalhos de `public/_headers`, com testes em `test/ops/healthcheck.test.ts`), mas nada a executa de forma agendada: não há workflow com `schedule` (dependeria do endereço de produção e de variável que ainda não existem). Ligar a um monitor externo ou a um workflow agendado: `docs/operacao/13-alertas-e-monitor.md`. |
| Retenção | Parcial; decisão jurídica **pendente** | `product_events` é apagado após 400 dias (cron diário às 03:17 UTC, `observabilidade.md`, §4). `run_retention_purge()` (job `retention-purge-daily`, 03:00 UTC) apaga provas de consentimento após `retain_until`, eventos de acesso após 6 meses e eventos de uso do assistente após 1 dia. `audit_log` é imutável e não tem job de retenção (decisão jurídica). Há job de contagem de notificações (`notification-counts-retention`). |
| Indicadores (KPIs) | Feito no repositório | Tabela de `observabilidade.md` (§6) reconciliada com `08-metricas-e-portoes.md` (`c0fc203`). |

---

## 7. Rollback e incidente

| Item | Status | Evidência e detalhe |
|---|---|---|
| Quem decide | Feito no documento; nomes **pendentes** | Responsável pelo incidente (`docs/juridico/08-plano-de-resposta-a-incidentes.md`, seção 3.1): com uma pessoa, o titular; com duas ou três, o titular ou o sócio técnico. |
| Encarregado (LGPD) | Depende de ação do dono | Não indicado: "ainda não indicado" (`docs/juridico/06-ripd-relatorio-de-impacto.md`, linhas 11 e 112). |
| Contato de segurança | Feito no repositório; prazos dependem do dono | `.github/SECURITY.md` aponta para o relatório privado de vulnerabilidades do GitHub (aba Security, Report a vulnerability), com escopo, o que não é vulnerabilidade e a regra de não enviar dados de usuários. O dono informou que ativou o recurso: **não verificado a partir do repositório** (conferir que a aba Security mostra o botão). Os prazos de resposta estão marcados "a confirmar pelo dono"; nenhum e-mail foi inventado. |
| Desligar recurso | Feito como procedimento; teste **pendente** | `RUNBOOKS`, item 12: `ASSIST_HOURLY_LIMIT=0`; comissão desligada; `pro_trial_days` em 0; desligar o agendador de envio; `supabase functions delete`; suspender prestador. Não desligar o webhook do Asaas nem a verificação de JWT. |
| Reverter banco | Feito como procedimento | Não há arquivo de reversão. Correção por migração nova. `supabase migration repair` só ajusta o histórico (`RUNBOOKS`, item 8). |
| Restaurar banco | Depende de plano | Restaurar primeiro em projeto novo, depois conferir (`RUNBOOKS`, item 7). |
| Reverter Edge Functions | Feito no repositório; ensaio no GitHub **pendente** | Continua sem artefato versionado: reverter é publicar de novo a partir de um commit anterior. O workflow `deploy-supabase.yml` ganhou o campo opcional `ref` (commit, tag ou branch): checkout nesse ref, só funções, recusa commit fora do histórico de `main`, `dry_run` não publica nada e o SHA publicado vai para o resumo do job. Procedimento e ensaio: `RUNBOOKS`, "Reverter Edge Functions". A lógica do `ref` foi ensaiada só em repositório local; falta o primeiro ensaio (com `dry_run` ligado) no GitHub Actions, que pede o ambiente `production`. |
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
| 12 | WhatsApp Business: os dez templates aprovados com os nomes exatos (um por nome em `TEMPLATES`, `_shared/notifications.ts`); provedor de código por SMS ou WhatsApp | Conta | Dono | Depende de ação | `supabase/functions/README.md`; `_shared/notifications.ts`; `app-store.md`, B2 |
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
| 23 | Destino da API em `services/`: `render.yaml` e `cloudbuild.yaml` foram **removidos** (DD95); o serviço `workeasy-api` é protótipo e não tem destino de publicação. Se existir um serviço no painel do Render ou um gatilho no Cloud Build criado antes, desligue-o: o repositório já não o descreve [incerto: o painel não é visível daqui] | Técnico e decisão | Dono | **Decidido; conferir painéis** | `services/api/` |
| 24 | Rotação das credenciais nas contas do provedor: chave de API do Asaas, senha do banco de produção e segredo do webhook. A troca é obrigatória; reescrever o histórico do repositório não a substitui. Ver também o bloqueio 1 e a lacuna de rotação do token do webhook (seção 3) | Segurança | Dono e Técnico | **Pendente** | `DECISOES.md`, seção "Decisões delegadas (2026-11-09)", DD06; seção 7 ("Segredo comprometido") |
| 25 | Ativar o hook de autenticação no painel, para o registro de data, hora e tipo de evento de login. Os dois blocos de hook de autenticação do `config.toml` (`before_user_created`, linha 307, e `custom_access_token`, linha 312) estão comentados | Configuração | Dono e Técnico | **Pendente** | `supabase/config.toml`, linha 312; `DECISOES.md`, DD22 |
| 26 | Conferir em produção o agendamento `retention-purge-daily` (pg_cron, 03:00 UTC) e o expurgo de `run_retention_purge()`: provas de consentimento após `retain_until` (5 anos a partir da exclusão, na cópia pseudonimizada), eventos de acesso após 6 meses e eventos de uso do assistente após 1 dia. Já feito no repositório (migrações `20261118200002`, `20261118600002` e `20261118600010`) | Retenção | Dono e Técnico | **Depende de ação** (verificar no painel) | `DECISOES.md`, DD22, DD23 e DD39; seção 6 ("Retenção") |
| 27 | Teste em aparelho Android da captura de foto com a pasta restrita (FileProvider), antes da publicação | Teste | Técnico | **Pendente** | Commit `49cef45`; seção 5 ("Permissões Android" e "Verificação em aparelho"); `DECISOES.md`, DD08 |
| 28 | Tornar o repositório privado antes da publicação. É a recomendação registrada; a decisão de publicar fica com o dono (ver pendência 20) | Ação | Dono | **Pendente** | `DECISOES.md`, DD07; pendência 20 acima |

---

## Documentos desatualizados ou em conflito

Estes pontos não bloqueiam a publicação, mas podem levar a uma decisão errada. Corrigir os documentos no mesmo commit das mudanças.

| Documento | Afirmação | Situação neste commit |
|---|---|---|
| `apps/web/docs/arquitetura/infra.md` | `config.toml` não tem entradas `[functions]` | Tem, nas linhas 407 a 415 (inclui `background-check-purge`). Documento corrigido em 24/11/2026 |
| `apps/web/docs/arquitetura/infra.md` | Código não lê `VITE_COMPANY_*`, `VITE_SAC_*` e `VITE_LEGAL_STATUS` | `config/legal.ts` lê todas. Documento corrigido em 24/11/2026 |
| `apps/web/docs/arquitetura/infra.md` | Passo a passo de publicação em `DEPLOY.md` | O arquivo não existe no repositório. Referência corrigida em 24/11/2026 |
| `.github/workflows/deploy-supabase.yml` (comentário) | Seed tem "dados de demonstração" | Corrigido: o comentário agora diz que `supabase/seed.sql` é o seed de desenvolvimento e nunca é aplicado aqui; o catálogo de produção é `supabase/catalog.sql` |
| `.github/workflows/deploy-supabase.yml` (comentário) | `config.toml` sem entradas de função | Tem. Comentário corrigido em 24/11/2026 |
| `apps/web/docs/ARQUITETURA.md` ("Notificações") | Dois agendamentos | Oito em `pg_cron` nas migrações (inclui `retention-purge-daily`). `ARQUITETURA.md` ganhou a tabela dos oito em 24/11/2026 |
| `apps/web/docs/operacao/08` (citado em `observabilidade.md`, §6) | Arquivo não existe na árvore de trabalho | Existe neste commit |
| `apps/web/docs/RUNBOOKS.md` | 36 migrações, commit `5805947` | 95 migrações no HEAD `cef8acc` (40 em `329b0cd`) |
| `apps/web/docs/ARQUITETURA.md` ("Testes e CI") x `RUNBOOKS` (apêndice A, item 16) | Editar migração aplicada x criar migração nova | Resolvido em 24/11/2026: regra única em `ARQUITETURA.md` (migração aplicada não se edita) |
| `apps/web/docs/lojas/google-play.md`, B05 | Faixa de protótipo em toda tela | `producao-vs-demonstracao.md` registra a correção com backend, com pendências na seção 8. Conferir no build |

---

## Verificação após a primeira publicação

- `curl -sI https://<domínio>/`: CSP, HSTS e `cache-control` (`infra.md`, passo 10).
- Chamada sem JWT às onze funções de usuário: espera-se 401. Webhook com token errado: 401. `notify-dispatch` e `background-check-purge` sem `x-cron-secret`: recusados.
- Contagem de áreas, ocupações, políticas e bairros: 44, 1.710, 1.710 e 96.
- Consultas do `RUNBOOKS`: S40 (migrações), S39 (agendamentos), S21 (Vault), S20 (respostas HTTP), S18 (fila vencida).
- Login por código chega ao e-mail real com o template certo.
- Webhook de teste no sandbox não aparece como cobrança de produção.
- Nenhuma ocorrência de `sb_secret_` nem de `SUPABASE_SERVICE_ROLE` em `dist/` (já checado pelo workflow; repetir após qualquer mudança).

---

## Notas sobre este documento

- Os caminhos seguem a convenção do início. Os valores de segredos, IDs de projeto e identificadores de conta não aparecem aqui.
- A ausência de um item no repositório está marcada como pendente. Itens marcados como incertos não foram conferidos.

---

## Itens concluídos em 24/11/2026 (GitHub e documentação)

- [x] Reporte privado de vulnerabilidades (Private vulnerability reporting) ativado
- [x] Dependency graph, Dependabot alerts e Dependabot security updates ativados
- [x] Ambiente `production` criado com revisor obrigatório `drguilhermecapel`
- [x] Regra `Content-Type: application/json` para `/.well-known/apple-app-site-association` adicionada em `apps/web/public/_headers` (commit `e8ba931`)
- [x] `apps/web/docs/RUNBOOKS.md` atualizado com 109 migrações e procedimento de reversão no Cloudflare Pages (commit `2afb1b3`)
- [x] `apps/web/docs/ARQUITETURA.md` atualizado com agendamento `workeasy-background-check-purge` e referência ao contrato Pro (commit `c26f2c0`)
- [x] `apps/web/docs/arquitetura/observabilidade.md` (§6) reconciliado com `08-metricas-e-portoes.md` (commit `c0fc203`)
