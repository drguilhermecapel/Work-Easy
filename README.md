# Work Easy (`work-easy`)

Monorepo B2C/B2G. **O produto real é `apps/web`** (com backend em Supabase). `services/api`, `apps/mobile` e
`apps/web-prefeitura` são **protótipos antigos**, sem integração real: não são produção.

## Estado verdadeiro dos protótipos

- **Custódia Pix (escrow/split) não existe de verdade e não pode ir a produção.** A rota de `services/api` só calcula uma
  taxa e devolve um Pix inventado; custódia na própria plataforma depende de parecer jurídico (Lei 12.865/2013;
  Res. BCB 150/2021). Veja `apps/web/docs/DECISOES.md`, seção "Pagamento retido".
- **As rotas de custódia, SOS e reputação ficam desligadas por padrão** e só sobem com `ENABLE_DEMO_ROUTES=true` (uso
  local). O SOS demo não notifica ninguém. Com `APP_ENV=production` a API se recusa a subir com a demo ligada.
- **O KYC com Gemini é experimental**: não é verificação oficial de identidade, envia as imagens ao Google e **não consulta
  antecedentes** (o resultado é sempre revisão manual).
- **CORS fechado por padrão**: defina `CORS_ALLOWED_ORIGINS` com as origens exatas.
- Detalhes, variáveis e como ligar a demo: [`services/api/README.md`](services/api/README.md).

## Estrutura do monorepo

| Pasta | O que é |
|---|---|
| `services/api` | Protótipo FastAPI: KYC experimental (Gemini); custódia Pix, reputação e SOS só como demo falsa, desligada por padrão |
| `apps/mobile` | Protótipo de app Expo (sem verificação real) |
| `apps/web-prefeitura` | Protótipo do portal municipal (B2G), com dados fictícios |
| `apps/web` | App React com o catálogo de serviços e profissões liberais de todas as áreas. Roda como site (PWA), Android, iOS, Windows, macOS e Linux, e tem backend próprio em Supabase (`apps/web/supabase`). Veja [`apps/web/README.md`](apps/web/README.md) |

`apps/web` é independente do restante: sem as variáveis do Supabase ele roda com dados de demonstração, e a CI dele
(`.github/workflows/web-ci.yml`) só dispara quando algo em `apps/web` muda. Recursos que dependem de parecer jurídico,
como pagamento retido e comissão, ficam desligados por padrão nele (`platform_settings`).

