# Work Easy (`work-easy`)

Monorepo B2C/B2G. **O produto real é `apps/web`** (com backend em Supabase). `services/api`, `apps/mobile` e
`apps/web-prefeitura` são **protótipos antigos**, sem integração real: não são produção.

## Estado verdadeiro dos protótipos

- **Custódia Pix (escrow/split) não existe de verdade e não pode ir a produção.** A rota de `services/api` só calcula uma
  taxa e devolve um Pix inventado; custódia na própria plataforma depende de parecer jurídico (Lei 12.865/2013;
  Res. BCB 150/2021). Veja `apps/web/docs/DECISOES.md`, seção "Pagamento retido".
- **As rotas de custódia, SOS e reputação ficam desligadas por padrão** e só sobem com `ENABLE_DEMO_ROUTES=true` (uso
  local, com `APP_ENV` de desenvolvimento). O SOS demo não notifica ninguém. Com a demo ligada e `APP_ENV` fora da lista
  `development`/`dev`/`local`/`test` (inclusive ausente), a API se recusa a subir; `/docs` só existe em desenvolvimento.
- **O KYC com Gemini é experimental e só sobe com `ENABLE_DEMO_ROUTES=true`**: não é verificação oficial de identidade, envia
  as imagens ao Google e **não consulta antecedentes** (o resultado é sempre revisão manual). Sem autenticação nem limite de
  uso, ele não pode ficar exposto numa URL pública.
- **CORS fechado por padrão**: defina `CORS_ALLOWED_ORIGINS` com as origens exatas.
- **Toda resposta leva `X-Work-Easy-Demo`**, inclusive um erro 500 não tratado (DD107).
- **Não há destino de publicação da API.** `render.yaml` e `cloudbuild.yaml` foram removidos (DD95); se existir um
  serviço antigo no painel do Render ou um gatilho no Cloud Build, desligá-lo é ação do dono. O `docker-compose.yml` da
  raiz é só para uso local e lê a senha do banco do `.env` (ignorado pelo git).
- Detalhes, variáveis e como ligar a demo: [`services/api/README.md`](services/api/README.md).

## Estrutura do monorepo

| Pasta | O que é |
|---|---|
| `services/api` | Protótipo FastAPI: sobe só com `/health`; KYC experimental (Gemini), custódia Pix, reputação e SOS são demo, desligadas por padrão |
| `apps/mobile` | Protótipo de app Expo (sem verificação real) |
| `apps/web-prefeitura` | Protótipo do portal municipal (B2G), com dados fictícios |
| `apps/web` | App React com o catálogo de serviços e profissões liberais de todas as áreas. Roda como site (PWA), Android, iOS, Windows, macOS e Linux, e tem backend próprio em Supabase (`apps/web/supabase`). Veja [`apps/web/README.md`](apps/web/README.md) |

`apps/web` é independente do restante: sem as variáveis do Supabase ele roda com dados de demonstração. Recursos que
dependem de parecer jurídico, como pagamento retido e comissão, ficam desligados por padrão nele (`platform_settings`).

## Workflows (`.github/workflows/`)

| Workflow | Quando roda | O que faz |
|---|---|---|
| `web-ci.yml` | push em `main`/`develop` e pull request que mudam `apps/web/**` (ou o próprio arquivo) | jobs `web` (lint, typecheck, Vitest, build e verificadores), `database` (pgTAP, integração e tipos do banco) `functions` (`deno check`, `deno lint`, `deno test`) e `functions-e2e` (ponta a ponta das Edge Functions no edge-runtime, com serviços externos falsos). Detalhes em [`apps/web/README.md`](apps/web/README.md) |
| `web-release.yml` | sob demanda, tags `v*` e pull requests que mudam o empacotamento nativo | builds sem assinatura de site, Android, iOS, Windows, macOS e Linux |
| `ci-security.yml` | push em `main`/`develop` e pull request que mudam `services/api/**` | `pytest` do protótipo `services/api` (Python 3.12) |
| `deploy-web.yml` | só manual, a partir de `main`, digitando `DEPLOY` e com aprovação do ambiente `production` | build e publicação do site no Cloudflare Pages |
| `deploy-supabase.yml` | só manual, com aprovação do ambiente `production` | migrações, catálogo e Edge Functions; com `dry_run` (padrão) nada é publicado |

Nenhum dos dois workflows de publicação foi executado até hoje: não há ambiente de produção. O que falta para publicar,
em ordem, está no topo de [`apps/web/docs/operacao/10-checklist-de-publicacao.md`](apps/web/docs/operacao/10-checklist-de-publicacao.md).

