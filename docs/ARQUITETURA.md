# Arquitetura do MVP

Contrato técnico do backend e do frontend do WorkEasy. Banco, funções de servidor
e telas seguem este documento; uma mudança de contrato muda este arquivo no
mesmo commit.

Princípios:

- **O servidor decide.** Toda regra de negócio que protege alguém (quem vê o
  quê, trava trabalhista, comissão, avaliação só após pagamento) mora no banco
  (RLS, funções `security definer`, triggers) ou numa Edge Function. A tela só
  reflete.
- **Catálogo é dado.** A política de cada ocupação (`catalog/policies.json`)
  vira a tabela `occupation_policies` e é aplicada pelo banco.
- **Nada de segredo no cliente.** O app só conhece a URL do Supabase e a chave
  publicável (`sb_publishable_…`), que é pública por desenho e depende de RLS.
  Chaves secretas (service role, Asaas, WhatsApp, Resend, IA) ficam nas Edge
  Functions.
- **Recursos sensíveis desligados por padrão.** Pagamento retido (escrow) e
  comissão dependem de parecer jurídico: `platform_settings.escrow_enabled` e
  `platform_settings.commission_enabled` começam `false`.
- **Modo demonstração continua funcionando.** Sem `VITE_SUPABASE_URL`, o app
  roda com os dados fictícios atuais (rotas de demonstração intactas).
- **Sem alegações sem lastro.** O teste `test/claims-guard.test.ts` continua
  valendo para todo texto novo.

## Pastas

```
supabase/
  config.toml                 configuração do projeto local
  migrations/                 SQL versionado (um arquivo por domínio, em ordem)
  seed.sql                    gerado: catálogo + bairros (não editar à mão)
  tests/database/*.test.sql   pgTAP: RLS, triggers, funções
  functions/
    _shared/                  lógica pura (sem APIs do Deno), testada com Vitest
    <nome>/index.ts           handler fino de cada Edge Function
scripts/
  generate-seed.mjs           catalog/*.json + data/neighborhoods.json → supabase/seed.sql
  prerender.mjs               páginas estáticas de SEO + sitemap (fase 3)
lib/
  supabase.ts                 cliente único (ou null no modo demonstração)
  database.types.ts           gerado por `supabase gen types typescript --local`
  errors.ts                   tradução de erros do banco para mensagens em pt-BR
services/                     acesso a dados por domínio (funções tipadas)
config/features.ts            flags de build e de runtime
pages/<área>/...              telas novas por área (pro, cliente, admin, cuidado, conta)
```

## Variáveis de ambiente

| Variável | Onde | Uso |
|---|---|---|
| `VITE_SUPABASE_URL` | app (pública) | URL do projeto; vazia = modo demonstração |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | app (pública) | chave publicável |
| `VITE_CONCIERGE_WHATSAPP` | app (pública) | número da operação concierge, só dígitos com DDI (ex.: 5511999999999) |
| `VITE_SITE_URL` | app (pública) | URL canônica para SEO (ex.: https://workeasy.com.br) |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge Functions | já injetada pelo Supabase |
| `ASAAS_API_KEY` | Edge Functions | chave da conta raiz da plataforma |
| `ASAAS_BASE_URL` | Edge Functions | `https://api-sandbox.asaas.com/v3` (sandbox) ou `https://api.asaas.com/v3` |
| `ASAAS_WEBHOOK_TOKEN` | Edge Functions | token que o Asaas envia no cabeçalho `asaas-access-token` |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Edge Functions | WhatsApp Cloud API; ausentes = mensagens marcadas `skipped` |
| `RESEND_API_KEY`, `EMAIL_FROM` | Edge Functions | e-mail transacional; ausentes = `skipped` |
| `ANTHROPIC_API_KEY` | Edge Functions | IA opcional (fase 3); ausente = função responde 503 |
| `CRON_SECRET` | Edge Functions | protege funções chamadas pelo agendador |

`claims-guard` passa a reprovar no código do cliente: `service_role`,
`SERVICE_ROLE`, `sb_secret_`, `ASAAS_API_KEY`, `WHATSAPP_TOKEN`,
`RESEND_API_KEY`, `ANTHROPIC_API_KEY`.

## Banco de dados

Postgres 15+ do Supabase. Extensões: `btree_gist`, `pg_cron` (agendamentos),
`pg_net` (chamar funções). Dinheiro em centavos (`integer`, `*_cents`). Datas em
`timestamptz`; regras por semana usam o fuso `America/Sao_Paulo` e a semana ISO
(segunda a domingo). Todas as tabelas têm RLS ligada; nenhuma tabela fica sem
política explícita.

### Tipos (enums)

```
user_role:            client | provider            (admin é tabela à parte)
provider_status:      draft | pending_review | approved | suspended
registry_status:      not_required | informed | confirmed | rejected
document_status:      submitted | accepted | rejected
verification_step:    documento_selfie | cadastro_fiscal | registro_profissional | antecedentes
                      | certificado_curso | cnh | licenca_orgao | seguro_rc
billing_model:        comissao_primeiro_servico | so_assinatura | sob_consulta_juridica
provider_kind:        autonomo | autonomo_ou_empresa | somente_empresa_licenciada
price_unit:           hora | dia | servico | m2 | sessao | plantao | mes | projeto | km | pacote
                      | pagina | palavra | aula | evento | visita
service_location:     domicilio | online | estabelecimento | empresa_cliente | externo
request_status:       open | matched | closed | canceled
proposal_status:      sent | accepted | declined | withdrawn
booking_status:       requested | accepted | paid | in_progress | completed | released | canceled | disputed
booking_origin:       platform | own
payment_status:       pending | confirmed | received | held | released | refunded | failed | canceled
payment_method:       pix | credit_card | boleto | undefined
quote_status:         draft | sent | accepted | declined | expired
plan_code:            free | pro
subscription_status:  trialing | active | past_due | canceled
notification_channel: whatsapp | email
notification_status:  queued | sending | sent | failed | skipped
shift_status:         open | offered | assigned | checked_in | completed | canceled | no_show
consent_purpose:      terms | privacy | marketing | background_check | location
data_request_kind:    export | delete
```

### Tabelas por domínio

Colunas listadas sem `created_at timestamptz default now()`, que toda tabela tem.

**Identidade** (`01_identity.sql`)

- `profiles` (`id uuid pk → auth.users on delete cascade`, `full_name text`,
  `phone text`, `role user_role not null default 'client'`, `city text default 'São Paulo'`,
  `deleted_at timestamptz`). Criado por trigger em `auth.users` (insert).
- `admins` (`user_id uuid pk → profiles`). Só a service role escreve.
- Funções: `is_admin() returns boolean` (stable, security definer, olha `admins`
  com `auth.uid()`); `is_provider_approved(uuid)`.
- Regra: o usuário atualiza o próprio perfil, exceto `role`, `deleted_at` e `id`
  (trigger rejeita mudança desses campos fora da service role). `role` muda só
  por `become_provider()`.

**Catálogo** (`02_catalog.sql`)

- `areas` (`slug text pk`, `name`, `description`, `icon`, `sort int`).
- `occupations` (`slug text pk`, `area_slug → areas`, `name`, `synonyms text[]`).
- `occupation_policies` (`occupation_slug pk → occupations`, `regulated bool`,
  `regulator_body`, `registry_name`, `legal_basis`, `verification verification_step[]`,
  `background_check bool`, `billing billing_model`, `rating_ranking bool`,
  `labor_lock bool`, `provider_type provider_kind`, `audience_minors bool`,
  `price_units price_unit[]`, `locations service_location[]`, `notes text`,
  `confidence text check in ('conferido','a_confirmar')`, `sources text[]`).
- `neighborhoods` (`id uuid pk`, `city text`, `name text`, `slug text unique`,
  `zone text`). Semente: bairros de São Paulo (`data/neighborhoods.json`).
- `platform_settings` (`key text pk`, `value jsonb`, `updated_at`). Chaves:
  `commission_enabled` (false), `commission_bps` (1200), `escrow_enabled` (false),
  `pro_price_cents` (4900), `proposal_limit` (3), `labor_lock_days_per_week` (2).
- RLS: leitura pública (anon e authenticated) de catálogo, bairros e das chaves
  de `platform_settings` que não são internas; escrita só admin.

**Prestadores** (`03_providers.sql`)

- `providers` (`id uuid pk → profiles`, `display_name`, `slug text unique` (página
  própria), `bio`, `avatar_path`, `status provider_status default 'draft'`,
  `plan plan_code default 'free'`, `base_neighborhood_id → neighborhoods`,
  `accepts_platform_requests bool default true`).
- `provider_occupations` (`provider_id`, `occupation_slug`, `is_primary bool`,
  `registry_number text`, `registry_uf char(2)`, `registry_status registry_status`,
  pk (`provider_id`, `occupation_slug`)). Trigger: se a política exige registro,
  `registry_status` começa `informed` (com número) ou bloqueia sem número; caso
  contrário `not_required`. Só admin passa para `confirmed`/`rejected`.
- `provider_neighborhoods` (`provider_id`, `neighborhood_id`, pk composta).
- `provider_documents` (`id`, `provider_id`, `step verification_step`,
  `storage_path`, `status document_status default 'submitted'`, `reviewed_by`,
  `reviewed_at`, `expires_at date`, `rejection_reason`). Arquivos no bucket
  privado `provider-documents/<provider_id>/...` (RLS de storage: dono e admin).
- `services` (`id`, `provider_id`, `occupation_slug`, `title`, `description`,
  `price_min_cents`, `price_max_cents`, `unit price_unit`, `duration_minutes`,
  `active bool`). Trigger: `unit` deve estar em `price_units` da política.
- `availability` (`id`, `provider_id`, `weekday smallint 0-6` (0 = domingo),
  `start_time time`, `end_time time`, check `start_time < end_time`).
- `time_off` (`id`, `provider_id`, `period tstzrange`).
- `provider_clients` (`id`, `provider_id`, `client_id uuid null → profiles`,
  `name`, `phone`, `email`, `notes`, `origin booking_origin`). O CRM do Pro.
- Funções:
  - `become_provider(p_display_name text, p_slug text, p_occupation text, p_registry_number text default null, p_registry_uf text default null)`
    cria `providers` (status `draft`) e `provider_occupations` primária e muda `profiles.role`.
  - `submit_provider_for_review()` → `pending_review` se os passos obrigatórios da
    política (`verification`) têm documento `submitted`/`accepted`.
  - `search_providers(p_occupation text, p_neighborhood uuid default null, p_limit int default 20, p_offset int default 0)`
    retorna prestadores `approved` com a ocupação (e que atendem o bairro, se dado):
    `provider_id, display_name, slug, bio, avatar_path, rating_avg, rating_count, price_min_cents, price_max_cents, unit, registry_status`.
    Ordem: se `rating_ranking` da ocupação é true, por média de nota (com pelo
    menos 3 avaliações) e depois nome; se false, por `md5(provider_id::text || current_date)`
    (ordem estável no dia, sem ranking por nota) e `rating_*` vem nulo.
  - `get_provider_page(p_slug text)` → dados públicos da página própria
    (prestador aprovado): perfil, ocupações com status de registro, serviços
    ativos, disponibilidade, avaliações publicadas (se a política permitir).
- RLS: prestador lê e escreve o que é seu; público lê só por `search_providers`
  e `get_provider_page` (as tabelas em si não são abertas ao anon); admin lê tudo.

**Pedidos e propostas** (`04_marketplace.sql`)

- `requests` (`id`, `client_id → profiles`, `occupation_slug`, `neighborhood_id`,
  `description text check length between 10 and 2000`, `preferred_dates text`,
  `urgent bool`, `status request_status default 'open'`, `expires_at default now()+7d`).
- `proposals` (`id`, `request_id`, `provider_id`, `price_cents`, `message`,
  `valid_until`, `status proposal_status default 'sent'`, unique (`request_id`,`provider_id`)).
  Trigger: no máximo `proposal_limit` propostas `sent`/`accepted` por pedido;
  pedido precisa estar `open`; prestador `approved`, com a ocupação e o bairro.
- Funções:
  - `open_requests_for_me()` → pedidos `open` cuja ocupação o prestador oferece e
    cujo bairro ele atende, sem expor telefone/e-mail do cliente.
  - `accept_proposal(p_proposal uuid, p_period tstzrange)` (cliente dono do pedido):
    proposta `accepted`, outras `declined`, pedido `matched`, cria `bookings`
    (`origin 'platform'`, `status 'accepted'`), cria/atualiza `provider_clients`.
- RLS: cliente vê os próprios pedidos e as propostas recebidas; prestador vê as
  próprias propostas e os pedidos por `open_requests_for_me()`.

**Agenda e atendimentos** (`05_bookings.sql`)

- `bookings` (`id`, `client_id → profiles null` (null para cliente próprio sem
  conta), `provider_client_id → provider_clients null`, `provider_id`,
  `occupation_slug`, `service_id null`, `request_id null`, `proposal_id null`,
  `household_id null`, `period tstzrange not null`, `price_cents`,
  `status booking_status`, `origin booking_origin`, `platform_fee_cents int default 0`,
  `notes`, `canceled_reason`).
  - `exclude using gist (provider_id with =, period with &&) where (status in ('requested','accepted','paid','in_progress'))`.
- `booking_events` (`id`, `booking_id`, `from_status`, `to_status`, `actor_id`, `at`).
- **Trava trabalhista** (trigger em `bookings` e `shifts`): se a ocupação tem
  `labor_lock` (em `shifts`, sempre), conta os dias distintos (fuso São Paulo) na
  semana ISO com atendimento ativo do mesmo prestador para o mesmo cliente
  (ou `household_id`/`provider_client_id`). Mais de `labor_lock_days_per_week` →
  `raise exception using errcode = 'P0001', message = 'labor_lock'`.
- **Comissão:** `compute_platform_fee(p_booking uuid) returns int`:
  0 se `commission_enabled` é false, se `origin = 'own'`, se a política não é
  `comissao_primeiro_servico`, ou se já existe atendimento `completed`/`released`
  entre o mesmo cliente e prestador; senão `price_cents * commission_bps / 10000`.
  Gravada em `platform_fee_cents` quando o atendimento vira `accepted`.
- `transition_booking(p_booking uuid, p_to booking_status, p_reason text default null)`:
  única forma de mudar `status` (update direto de `status` é bloqueado por
  trigger fora dessa função e da service role). Transições:
  - prestador: `requested→accepted`, `requested→canceled`, `accepted→in_progress`,
    `paid→in_progress`, `in_progress→completed`, `accepted→canceled`.
  - cliente: `requested→canceled`, `accepted→canceled`, `completed→disputed`
    (até 7 dias após o fim), `completed→released`.
  - service role (webhook): `accepted→paid`, `paid→released` (escrow), `*→disputed`.
  - admin: qualquer transição, com motivo obrigatório.
  Cada transição grava `booking_events` e `audit_log`.
- `book_direct(p_provider uuid, p_service uuid, p_period tstzrange, p_notes text)`
  (cliente): cria `requested` com `origin 'platform'` se o horário está dentro da
  disponibilidade e fora de `time_off`.
- `create_own_booking(p_provider_client uuid, p_occupation text, p_period tstzrange, p_price_cents int, p_notes text)`
  (prestador): cria `accepted` com `origin 'own'` (sem comissão nunca).
- `available_slots(p_provider uuid, p_day date, p_duration_minutes int)` →
  `tstzrange[]` livres no dia.
- RLS: cliente e prestador veem os atendimentos de que participam; admin vê tudo.

**Pagamentos e assinaturas** (`06_payments.sql`)

- `provider_payment_accounts` (`provider_id pk`, `asaas_account_id`,
  `asaas_wallet_id`, `api_key_secret_id uuid` (Supabase Vault), `status text`).
- `customer_payment_profiles` (`user_id pk`, `asaas_customer_id`).
- `payments` (`id`, `booking_id null`, `quote_id null`, `provider_id`,
  `payer_id null → profiles`, `asaas_payment_id text unique`, `method payment_method`,
  `amount_cents`, `platform_fee_cents`, `status payment_status`, `escrow bool`,
  `invoice_url`, `pix_qr_code text`, `pix_payload text`, `due_date date`,
  `raw jsonb`, `updated_at`).
- `payment_events` (`id`, `asaas_event_id text unique`, `payment_id null`,
  `event_type`, `payload jsonb`, `processed_at`). Idempotência do webhook.
- `subscriptions` (`provider_id pk`, `plan plan_code`, `status subscription_status`,
  `asaas_subscription_id`, `current_period_end`, `canceled_at`).
- Escrita só pela service role (Edge Functions); leitura pelo dono (pagador ou
  prestador) e admin. Nada de dado de cartão no banco.

**Orçamentos e avaliações** (`07_quotes_reviews.sql`)

- `quotes` (`id`, `provider_id`, `provider_client_id null`, `client_name`,
  `client_phone`, `title`, `items jsonb` (`[{description, quantity, unit_price_cents}]`),
  `total_cents` (calculado por trigger), `valid_until date`, `notes`,
  `status quote_status default 'draft'`, `public_token uuid unique default gen_random_uuid()`).
- `get_quote_by_token(p_token uuid)` (anon): orçamento + nome público do prestador;
  sem dados de outros clientes. `respond_quote(p_token uuid, p_accept bool)`
  (anon) muda para `accepted`/`declined` se `sent` e dentro da validade.
- `reviews` (`id`, `booking_id unique`, `client_id`, `provider_id`,
  `rating smallint 1-5`, `comment text <= 1000`, `published bool default true`).
  Insert só se o atendimento é do cliente, está `completed`/`released` e tem
  pagamento `received`/`confirmed`/`released` pelo app. Se a ocupação tem
  `rating_ranking = false`, `published` é forçado a false (fica só para o
  prestador e o admin).

**Notificações** (`08_notifications.sql`)

- `notifications` (`id`, `user_id null`, `phone`, `email`, `channel`,
  `template text`, `params jsonb`, `status notification_status default 'queued'`,
  `scheduled_for timestamptz default now()`, `sent_at`, `attempts int`, `error`).
- Triggers enfileiram: proposta recebida (cliente), atendimento aceito (os dois),
  lembrete 24 h antes (os dois), pagamento recebido (prestador), orçamento
  respondido (prestador), plantão oferecido (cuidador).
- `claim_notifications(p_limit int)` (service role): marca `sending` e devolve um
  lote vencido, com `for update skip locked`.
- Templates (nomes que precisam existir no WhatsApp Business):
  `proposta_recebida`, `atendimento_confirmado`, `lembrete_atendimento`,
  `pagamento_recebido`, `orcamento_respondido`, `plantao_oferecido`.

**Linha de cuidado** (`09_care.sql`)

- `households` (`id`, `owner_id → profiles`, `name`, `neighborhood_id`, `notes`).
- `care_recipients` (`id`, `household_id`, `first_name`, `birth_year`,
  `preferences text`, `emergency_contact text`). Sem diagnóstico, sem
  medicação: dados de saúde não entram.
- `shifts` (`id`, `household_id`, `care_recipient_id`, `provider_id null`,
  `period tstzrange`, `rate_cents`, `caregiver_payout_cents`, `status shift_status`,
  `notes`). Exclusão de sobreposição por prestador; trava trabalhista sempre ativa.
- `shift_offers` (`shift_id`, `provider_id`, `status text check in ('offered','accepted','declined','expired')`, pk composta).
- `checkins` (`id`, `shift_id`, `provider_id`, `kind text check in ('in','out')`,
  `at`, `lat numeric`, `lng numeric`).
- `daily_reports` (`id`, `shift_id unique`, `provider_id`, `meals text`,
  `activities text`, `mood text`, `notes text`). Relatório não clínico.
- Funções: `offer_shift(p_shift, p_providers uuid[])` (admin ou dono),
  `accept_shift_offer(p_shift)` (cuidador; primeiro que aceita leva, demais
  `expired`), `check_in(p_shift, p_kind, p_lat, p_lng)` (cuidador designado,
  dentro de ±2 h do início/fim), `submit_daily_report(...)`, `cancel_shift(p_shift, p_reason)`
  (cuidador: volta a `open` e reoferece; família: `canceled`).
- RLS: família vê o que é dela; cuidador vê plantões oferecidos/designados a ele e
  o primeiro nome do assistido; admin vê tudo.

**LGPD e auditoria** (`10_privacy_audit.sql`)

- `consents` (`id`, `user_id`, `purpose consent_purpose`, `version text`,
  `granted bool`, `at`). Só insert pelo próprio usuário (histórico, nunca update).
- `data_requests` (`id`, `user_id`, `kind data_request_kind`, `status text`,
  `completed_at`, `result_path`).
- `audit_log` (`id bigserial`, `actor_id`, `action text`, `entity text`,
  `entity_id text`, `data jsonb`, `at`). Só insert, via `log_event(...)` security
  definer e triggers; `update`/`delete` revogados de todos, inclusive authenticated;
  leitura só admin.
- `anonymize_user(p_user uuid)` (service role): apaga dados pessoais de
  `profiles`, `providers`, `provider_clients` do usuário, mantém pagamentos e
  atendimentos anonimizados (obrigação fiscal), grava `audit_log`.

**Administração** (`11_admin.sql`)

- `admin_review_document(p_document uuid, p_accept bool, p_reason text)`,
  `admin_set_registry_status(p_provider, p_occupation, p_status, p_reason)`,
  `admin_set_provider_status(p_provider, p_status, p_reason)`,
  `admin_set_setting(p_key, p_value jsonb)`, `admin_resolve_dispute(p_booking, p_to, p_reason)`.
  Todas exigem `is_admin()` e gravam `audit_log`.
- Visões para o painel (security invoker + RLS de admin):
  `admin_provider_queue`, `admin_open_disputes`, `admin_metrics`
  (pedidos, propostas, atendimentos por status, pagamentos por status, prestadores
  por status, na semana e no mês).

### Erros do banco

Funções e triggers sinalizam regras com `raise exception` e mensagens-código:
`labor_lock`, `proposal_limit`, `request_not_open`, `not_allowed`,
`invalid_transition`, `slot_unavailable`, `registry_required`,
`documents_missing`, `review_not_allowed`, `quote_expired`, `unit_not_allowed`.
`lib/errors.ts` traduz cada código para uma frase em pt-BR.

## Edge Functions

Handlers finos em `supabase/functions/<nome>/index.ts`; regras puras em
`supabase/functions/_shared/*.ts` (sem `Deno.*`, sem imports `npm:`), testadas
com Vitest a partir de `test/functions/*.test.ts`. Toda função valida o JWT do
usuário (exceto webhook e cron), responde JSON `{ ok, data | error }` e grava
`audit_log` nas ações de dinheiro.

| Função | Quem chama | O que faz |
|---|---|---|
| `asaas-onboard` | prestador | cria subconta Asaas (`POST /accounts`) com os dados fiscais enviados; guarda `walletId`; a chave da subconta vai para o Vault |
| `payments-create` | cliente | cobra um atendimento `accepted`: garante o cliente no Asaas (`POST /customers`), cria a cobrança (`POST /payments`) com `split` para a carteira do prestador (valor − taxa); Pix devolve QR (`GET /payments/{id}/pixQrCode`) |
| `charges-create` | prestador Pro | cobrança de cliente próprio ou de orçamento aceito, na subconta do prestador, sem taxa |
| `asaas-webhook` | Asaas | valida `asaas-access-token`, grava `payment_events` (idempotente por id do evento), atualiza `payments` e chama `transition_booking` (`PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` → `paid`; `PAYMENT_REFUNDED` → reembolso) |
| `subscriptions-manage` | prestador | assina ou cancela o Pro (`POST /subscriptions`, ciclo mensal) e atualiza `subscriptions`/`providers.plan` |
| `notify-dispatch` | agendador (`CRON_SECRET`) | consome `claim_notifications` e envia por WhatsApp Cloud API (template) ou Resend; sem credencial → `skipped` |
| `account-export` | usuário | devolve JSON com os dados do próprio usuário |
| `account-delete` | usuário | registra `data_requests`, chama `anonymize_user` e apaga o usuário do Auth |
| `request-assist` | cliente (fase 3) | transforma texto livre em pedido estruturado (ocupação, urgência, resumo) com IA no servidor; responde 503 sem chave |

Asaas: autenticação pelo cabeçalho `access_token`; valores em reais com duas
casas (converter de centavos); conferir a documentação oficial
(https://docs.asaas.com) antes de cada chamada. O pagamento por cartão usa a
página de pagamento do Asaas (`invoiceUrl`): o app nunca recebe número de
cartão.

## Frontend

### Camada de dados

- `lib/supabase.ts`: `export const supabase: SupabaseClient<Database> | null`
  (null sem `VITE_SUPABASE_URL`). `export const backendEnabled: boolean`.
- `contexts/AuthContext.tsx`: com backend, sessão real do Supabase Auth
  (`user`, `profile`, `provider`, `isAdmin`, `signInWithOtp`, `verifyOtp`,
  `signOut`); sem backend, o seletor de papéis da demonstração continua.
- `services/*.ts`: uma função por operação, sempre tipada, sempre lançando
  `AppError` (`lib/errors.ts`) com mensagem pt-BR. Ex.: `services/requests.ts`
  exporta `createRequest`, `listMyRequests`, `listProposals`, `acceptProposal`.
- Leitura de dados nas telas: hooks simples (`useAsync`) ou `use()` com
  Suspense; nada de biblioteca nova sem necessidade.

### Rotas novas

| Rota | Quem | Tela |
|---|---|---|
| `/entrar` | todos | login por código (e-mail ou WhatsApp/SMS) |
| `/conta` | logado | dados, consentimentos, exportar dados, excluir conta |
| `/pedido` | cliente | pedido guiado: ocupação (busca), bairro, descrição, datas; sem backend gera mensagem de WhatsApp para a operação |
| `/pedidos`, `/pedidos/:id` | cliente | meus pedidos, propostas recebidas, aceitar |
| `/atendimentos`, `/atendimentos/:id` | cliente/prestador | detalhes, pagar, cancelar, concluir, avaliar |
| `/p/:slug` | público | página própria do prestador |
| `/agendar/:slug` | cliente | agendamento direto em horário livre |
| `/orcamento/:token` | público | orçamento para o cliente aceitar ou recusar; versão para imprimir/salvar PDF |
| `/pro` | prestador | painel: hoje, próximos atendimentos, pedidos abertos, pendências do cadastro |
| `/pro/cadastro` | prestador | onboarding: ocupação, registro, bairros, documentos exigidos pela política |
| `/pro/servicos`, `/pro/agenda`, `/pro/pedidos`, `/pro/orcamentos`, `/pro/clientes`, `/pro/cobrancas`, `/pro/assinatura` | prestador | ferramenta Pro |
| `/pro/plantoes` | cuidador | plantões oferecidos, check-in/out, relatório do dia |
| `/cuidado` | família | casa, assistido, plantões, relatórios |
| `/admin` | admin | fila de prestadores, documentos, disputas, pagamentos, métricas, configurações |
| `/servicos/:slug/:bairro` | público | página de SEO por ocupação e bairro (pré-renderizada) |

As rotas de demonstração atuais continuam. Telas novas vivem em
`pages/<área>/` e cada área exporta seu bloco de rotas em
`pages/<área>/routes.tsx`, ligado em `AppShell.tsx`.

## Testes e CI

- **pgTAP** (`supabase test db`): para cada tabela, RLS de leitura e escrita por
  papel (anon, cliente, outro cliente, prestador, outro prestador, admin); cada
  trigger e cada função de regra (trava trabalhista, limite de propostas,
  transições, comissão, avaliação, exclusão de sobreposição, orçamento por token,
  anonimização, auditoria só-insert).
- **Vitest**: serviços (cliente Supabase simulado), lógica pura das Edge
  Functions, telas principais com Testing Library.
- **Integração** (`npm run test:integration`, exige `supabase start`): fluxos
  reais pela API (cliente pede → prestador propõe → cliente aceita → trava →
  webhook simulado → avaliação).
- **CI**: job `database` no `ci.yml` com `supabase/setup-cli`, `supabase start`,
  `supabase test db` e testes de integração.
