# Work Easy (`work-easy`)

Monorepo B2C/B2G com KYC Biométrico Multimodal (Gemini 2.5 Flash), Descarte Efêmero em RAM (Art. 11 LGPD), Portal Municipal B2G, App Mobile (Expo) e Custódia Pix (Escrow/Split 95%/5%).

## Estrutura do monorepo

| Pasta | O que é |
|---|---|
| `services/api` | API FastAPI: KYC biométrico, marketplace com Pix e reputação/SOS |
| `apps/mobile` | App Expo |
| `apps/web-prefeitura` | Portal municipal (B2G) |
| `apps/web` | App React com o catálogo de serviços e profissões liberais de todas as áreas. Roda como site (PWA), Android, iOS, Windows, macOS e Linux, e tem backend próprio em Supabase (`apps/web/supabase`). Veja [`apps/web/README.md`](apps/web/README.md) |

`apps/web` é independente do restante: sem as variáveis do Supabase ele roda com dados de demonstração, e a CI dele
(`.github/workflows/web-ci.yml`) só dispara quando algo em `apps/web` muda. Recursos que dependem de parecer jurídico,
como pagamento retido e comissão, ficam desligados por padrão nele (`platform_settings`).

