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
| `PRO_GRACE_DAYS` | Edge Functions | dias que um Pro com cobrança atrasada mantém o plano depois do fim do período pago (padrão 0, máximo 60) |
| `ASSIST_HOURLY_LIMIT` | Edge Functions | chamadas de `request-assist` por usuário por hora (padrão 10; 0 desliga o assistente) |
| `ALLOW_DEV_ORIGINS` | Edge Functions | `true` libera `http://localhost:3000` e `http://127.0.0.1:3000` no CORS; já vale com o Asaas sandbox e nunca em produção |

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
subscription_status:  pending | trialing | active | past_due | canceled
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
  `deleted_at timestamptz`). Criado por trigger em `auth.users` (insert). O `phone` do
  perfil é informativo e digitado pelo usuário: o trigger só o preenche com o telefone
  do Auth (`auth.users.phone`), nunca com o `phone` do metadado do cadastro, e as
  notificações **não** o usam (ver Notificações).
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
- `platform_settings` (`key text pk`, `value jsonb`, `internal bool default false`
  (chave interna: só admin lê), `updated_at`). Chaves:
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
  `approved bool default false`, pk (`provider_id`, `occupation_slug`)). Trigger: se a
  política exige registro, `registry_status` começa `informed` (com número) ou bloqueia
  sem número; caso contrário `not_required`. Só admin passa para `confirmed`/`rejected`.
  **Aprovação por ocupação:** uma ocupação só aparece na busca e na página pública, só
  recebe pedidos (`open_requests_for_me`), só aceita proposta e só é agendável
  (`book_direct`) quando `approved` é verdadeiro **e** o registro não está `rejected`
  (`private.offers_occupation`). Pela API, a ocupação nasce `approved = false` (o valor
  enviado é ignorado), não pode ser mudada pelo dono, não pode ser incluída com o
  cadastro em análise (`pending_review`) ou suspenso, e um registro `rejected` que recebe
  número novo volta a exigir aprovação. `admin_set_provider_status('approved')` aprova, na
  primeira aprovação (vindo de `draft` ou `pending_review`), só as ocupações que já cumprem a
  mesma regra de `admin_set_occupation_approval` (documento `accepted` para cada passo da
  política da ocupação e registro não `rejected`), e grava no `audit_log` quais entraram
  (`occupations_approved`). As demais, e as incluídas depois, são aprovadas uma a uma por
  `admin_set_occupation_approval`. Reativar um prestador suspenso não aprova nada. A regra dos
  passos mora em `private.occupation_missing_steps(provider, ocupação)`, usada pelas duas funções.
  **A aprovação segue os documentos:** quando um documento `accepted` deixa de estar aceito
  (rejeitado por `admin_review_document(…, false, motivo)` ou apagado), o trigger
  `provider_documents_revoke_approvals` (`private.revoke_approvals_of_lost_document`) volta
  `approved = false` nas ocupações aprovadas do prestador cuja política pede o passo desse
  documento e que nenhum outro documento `accepted` cobre, e grava um `occupation.approval_revoked`
  no `audit_log` por ocupação (`document`, `step`, `cause` = `document_rejected` ou
  `document_removed`). Aceitar o documento de novo não devolve a aprovação: ela volta só por
  `admin_set_occupation_approval`. A ocupação sai da busca e da página pública na hora.
  **Sem política, sem aprovação (falha fechada):** uma ocupação sem linha em `occupation_policies`
  não pode ser incluída (`become_provider` e a inclusão pelo prestador falham no trigger de
  registro, com qualquer escritor), nem aprovada: `admin_set_occupation_approval(…, true)` recusa
  e a primeira aprovação do prestador não a aprova. O erro é `not_allowed` com `detail 'policy
  missing'` (o do contrato mais próximo: a ocupação não pode ser tomada nem aprovada).
  `private.occupation_missing_steps` devolve vazio sem política, por isso quem a chama confere
  antes `private.occupation_has_policy`. `scripts/generate-seed.mjs` recusa um catálogo com
  ocupação sem política, para o seed dar uma política a toda ocupação.
- `provider_neighborhoods` (`provider_id`, `neighborhood_id`, pk composta).
- `provider_documents` (`id`, `provider_id`, `step verification_step`,
  `storage_path`, `status document_status default 'submitted'`, `reviewed_by`,
  `reviewed_at`, `expires_at date`, `rejection_reason`). Arquivos no bucket
  privado `provider-documents/<provider_id>/...` (RLS de storage: dono e admin leem; só
  quem já é prestador envia; **não há UPDATE**, então todo envio é um arquivo novo e um
  documento novo; o dono só apaga arquivo que ainda não foi revisado, ou seja, sem
  documento `accepted`/`rejected` apontando para ele; admin apaga qualquer um).
  `admin_review_document(accept)` exige que o arquivo exista no bucket.
- `services` (`id`, `provider_id`, `occupation_slug`, `title`, `description`,
  `price_min_cents`, `price_max_cents`, `unit price_unit`, `duration_minutes`,
  `active bool`). Trigger: `unit` deve estar em `price_units` da política.
- `availability` (`id`, `provider_id`, `weekday smallint 0-6` (0 = domingo),
  `start_time time`, `end_time time`, check `start_time < end_time`).
- `time_off` (`id`, `provider_id`, `period tstzrange`).
- `provider_clients` (`id`, `provider_id`, `client_id uuid null → profiles`,
  `name`, `phone`, `email`, `notes`, `origin booking_origin`, unique (`id`, `provider_id`)).
  O CRM do Pro. **`client_id` e `origin` são do servidor:** o prestador (API) só escreve
  `name`, `phone`, `email`, `notes` (grants por coluna + trigger `guard_provider_client`);
  só `private.ensure_provider_client` (security definer, chamada por `book_direct` e
  `accept_proposal`) preenche `client_id` com `origin = 'platform'`. Entradas do CRM do
  mesmo prestador com o mesmo telefone (só dígitos) ou o mesmo e-mail são a mesma pessoa
  para a trava trabalhista.
- Funções:
  - `become_provider(p_display_name text, p_slug text, p_occupation text, p_registry_number text default null, p_registry_uf text default null)`
    cria `providers` (status `draft`) e `provider_occupations` primária (não aprovada) e
    muda `profiles.role`. Slug já usado → `slug_taken`.
  - `submit_provider_for_review()` → `pending_review` se os passos obrigatórios da
    política (`verification`) têm documento `submitted`/`accepted` **com o arquivo
    enviado ao bucket** (registro sem arquivo não conta).
  - `search_providers(p_occupation text, p_neighborhood uuid default null, p_limit int default 20, p_offset int default 0)`
    retorna prestadores `approved` com a ocupação aprovada e sem registro `rejected`
    (e que atendem o bairro, se dado):
    `provider_id, display_name, slug, bio, avatar_path, rating_avg, rating_count, price_min_cents, price_max_cents, unit, registry_status`.
    Ordem: se `rating_ranking` da ocupação é true, por média de nota (com pelo
    menos 3 avaliações) e depois nome; se false, por `md5(provider_id::text || data de São Paulo)`
    (ordem estável no dia, sem ranking por nota) e `rating_*` vem nulo.
  - `get_provider_page(p_slug text)` → dados públicos da página própria
    (prestador aprovado): perfil, ocupações aprovadas com status de registro, serviços
    ativos dessas ocupações, disponibilidade, avaliações publicadas (se a política permitir).
  - `slug_available(p_slug text) returns boolean` (anon e authenticated, `security definer`):
    `true` só se o endereço é um slug válido (até 80 caracteres) e **nenhum** prestador o usa,
    aprovado ou não (rascunho e suspenso seguram o endereço). Responde só sim ou não, sem dizer
    quem é o dono. O cadastro do prestador usa essa função no botão “Verificar”.
- RLS: prestador lê e escreve o que é seu; público lê só por `search_providers`,
  `get_provider_page` e `slug_available` (as tabelas em si não são abertas ao anon); admin lê tudo.

**Pedidos e propostas** (`04_marketplace.sql`)

- `requests` (`id`, `client_id → profiles`, `occupation_slug`, `neighborhood_id`,
  `description text check length between 10 and 2000`, `preferred_dates text`,
  `urgent bool`, `status request_status default 'open'`, `expires_at default now()+7d`).
- `proposals` (`id`, `request_id`, `provider_id`, `price_cents`, `message`,
  `valid_until`, `status proposal_status default 'sent'`, unique (`request_id`,`provider_id`)).
  Trigger: no máximo `proposal_limit` propostas `sent`/`accepted` por pedido;
  pedido precisa estar `open`; prestador `approved`, com a ocupação e o bairro.
- `assist_usage` (`user_id → profiles on delete cascade`, `window_start timestamptz`,
  `count int`, pk (`user_id`, `window_start`)): cota horária do assistente de pedidos.
  RLS ligada, **sem política e sem grant** para `anon`/`authenticated` (exceção declarada
  ao "toda tabela tem política" em `12_rls_matrix`); só `take_assist_quota` a toca.
- Funções:
  - `take_assist_quota(p_user uuid, p_limit int) → boolean` (service role): consome 1
    unidade da hora cheia (UTC) corrente de forma atômica; `false` quando estourou ou
    `p_limit < 1`. Ver "Assistente (`request-assist`)".
  - `open_requests_for_me()` → pedidos `open` e não vencidos cuja ocupação o prestador
    tem aprovada (registro não `rejected`) e cujo bairro ele atende, sem expor
    telefone/e-mail do cliente. Colunas: `id, occupation_slug, neighborhood_id,
    neighborhood_name, description, preferred_dates, urgent, expires_at, created_at,
    proposal_count, my_proposal_id, my_proposal_status`.
  - `accept_proposal(p_proposal uuid, p_period tstzrange)` (cliente dono do pedido):
    proposta `accepted`, outras `declined`, pedido `matched`, cria `bookings`
    (`origin 'platform'`, `status 'accepted'`), cria/atualiza `provider_clients`.
    O pedido precisa estar `open` e dentro de `expires_at`; o período é futuro, de no
    máximo 24 horas e a até 2 anos (senão `slot_unavailable`). A disponibilidade do
    prestador não é exigida (o horário vem combinado na proposta).
  - `requests.expires_at` começa em 7 dias e o cliente não passa de 30 dias.
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
  - `check (client_id is null or provider_id is null or client_id <> provider_id)`:
    ninguém é os dois lados de um atendimento. `updated_at timestamptz` é mantido por trigger.
- `booking_events` (`id`, `booking_id`, `from_status`, `to_status`, `actor_id`, `reason`, `at`).
  `reason` é o motivo livre passado a `transition_booking` (apagado por `anonymize_user`).
- **Trava trabalhista** (trigger em `bookings` e `shifts`): se a ocupação tem
  `labor_lock` (em `shifts`, sempre), conta os dias distintos (fuso São Paulo; um período
  que termina à meia-noite não toca o dia seguinte) na semana ISO com atendimento do
  mesmo prestador para o mesmo cliente (ou `household_id`/`provider_client_id`; entradas
  do CRM com o mesmo telefone ou e-mail são o mesmo empregador). "Ativo" para a trava é
  qualquer status exceto `canceled` (e, em `shifts`, `assigned`/`checked_in`/`completed`):
  concluir um atendimento não libera um terceiro dia. Mais de
  `labor_lock_days_per_week` → `raise exception using errcode = 'P0001', message = 'labor_lock'`.
  Vale para `book_direct`, `accept_proposal`, `create_own_booking`, `accept_shift_offer` e
  para a troca de `period`.
- **Comissão:** `compute_platform_fee(p_booking uuid) returns int`:
  0 se `commission_enabled` é false, se `origin = 'own'`, se a política não é
  `comissao_primeiro_servico`, ou se já existe atendimento **de origem `platform`**
  `completed`/`released` entre o mesmo cliente (ou o mesmo `provider_client_id`) e
  prestador **com pagamento `received`/`confirmed`/`released` pelo app**; senão
  `price_cents * commission_bps / 10000` (truncado). Gravada em `platform_fee_cents`
  quando o atendimento vira `accepted` e não muda depois.
- `transition_booking(p_booking uuid, p_to booking_status, p_reason text default null)`:
  única forma de mudar `status` (update direto de `status` é bloqueado por
  trigger fora dessa função e da service role). Transições:
  - prestador: `requested→accepted`, `requested→canceled`, `accepted→in_progress`,
    `paid→in_progress`, `in_progress→completed`, `accepted→canceled`.
  - cliente: `requested→canceled`, `accepted→canceled`, `completed→disputed`
    (até 7 dias após o fim), `completed→released`.
  - service role (webhook): `accepted→paid`, `paid→released` (escrow), `paid→canceled`
    (reembolso, `PAYMENT_REFUNDED`), `*→disputed` (menos `disputed→disputed`).
  - admin: qualquer transição, com motivo obrigatório (motivo vazio ou só espaços →
    `not_allowed`). O admin não muda `status` por UPDATE direto.
  Cada transição grava `booking_events` e `audit_log`.
- `book_direct(p_provider uuid, p_service uuid, p_period tstzrange, p_notes text)`
  (cliente): cria `requested` com `origin 'platform'` se o horário é futuro, está dentro
  da disponibilidade e fora de `time_off`, e a ocupação do serviço está aprovada.
  No máximo 3 `requested` abertos por cliente e prestador e 10 por cliente
  (`booking_limit`).
- `create_own_booking(p_provider_client uuid, p_occupation text, p_period tstzrange, p_price_cents int, p_notes text)`
  (prestador): cria `accepted` com `origin 'own'` (sem comissão nunca) para uma entrada
  do CRM com `origin = 'own'`. O atendimento próprio **não tem conta do outro lado**
  (`client_id` sempre nulo): ninguém o vê, ele não abre acesso a perfil, não é
  avaliável e não zera comissão de atendimento da plataforma. A trava trabalhista o
  conta pela entrada do CRM.
- `available_slots(p_provider uuid, p_day date, p_duration_minutes int)` →
  `tstzrange[]` livres no dia.
- RLS: cliente e prestador veem os atendimentos de que participam; admin vê tudo.
- **Contato (perfil):** `profiles_select_counterpart` usa `private.shares_contact`; a
  linha de `providers` usa `private.is_counterpart`. Ambas só olham dados escritos pelo
  servidor (`bookings.client_id/provider_id` de atendimentos `origin 'platform'`,
  propostas, plantões designados), nunca coluna que o outro lado digitou. O cliente
  recebe o perfil (telefone) do prestador depois que o atendimento passa de `requested`
  (a linha de `providers`, para mostrar o nome, vem desde o pedido ou desde a proposta,
  mas uma proposta **não** compartilha o perfil: só `private.is_counterpart` olha
  propostas, `private.shares_contact` não); o prestador vê o cliente que pediu, nunca o
  cliente do pedido em que só propôs; quem só recebeu uma oferta de plantão não vê ninguém.

**Pagamentos e assinaturas** (`06_payments.sql`)

- `provider_payment_accounts` (`provider_id pk`, `asaas_account_id`,
  `asaas_wallet_id`, `api_key_secret_id uuid` (Supabase Vault), `status text`).
- `customer_payment_profiles` (`user_id pk`, `asaas_customer_id`).
- `payments` (`id`, `booking_id null`, `quote_id null`, `provider_id`,
  `payer_id null → profiles`, `asaas_payment_id text unique`, `method payment_method`,
  `amount_cents`, `platform_fee_cents`, `status payment_status`, `escrow bool`,
  `invoice_url`, `pix_qr_code text`, `pix_payload text`, `due_date date`,
  `raw jsonb`, `updated_at`). Índices únicos parciais
  `payments (booking_id) where status = 'pending' and booking_id is not null` e
  `payments (quote_id) where status = 'pending' and quote_id is not null`: no máximo uma
  cobrança `pending` por atendimento e por orçamento (cobranças pagas, canceladas etc. não
  contam; `pending` sem atendimento nem orçamento não é limitado).
- `payment_events` (`id`, `asaas_event_id text unique`, `payment_id null`,
  `event_type`, `payload jsonb`, `processed_at`). Idempotência do webhook.
- `subscriptions` (`provider_id pk`, `plan plan_code`, `status subscription_status`,
  `asaas_subscription_id`, `current_period_end`, `canceled_at`). `status = 'pending'`:
  assinatura criada no Asaas e ainda não paga (sem período); `past_due` fica só para
  pagamento atrasado. Não há `check` nem política que enumere estados: a leitura é por
  `provider_id`/admin, e nenhuma função do banco filtra por `status`.
- Escrita só pela service role (Edge Functions); leitura pelo dono (pagador ou
  prestador) e admin. Nada de dado de cartão no banco. `payments.raw` (payload do
  gateway, com nome, CPF/CNPJ e e-mail do pagador) **não é legível pela API**: o grant de
  `select` em `payments` é por coluna, sem `raw`, então o app lista as colunas (`select *`
  é negado). O admin lê o payload por `admin_get_payment_raw(p_payment)`, que grava
  `audit_log`.
- RPCs da service role: `store_provider_payment_secret(p_provider, p_secret) returns uuid`
  e `get_provider_payment_secret(p_provider) returns text` (chave da subconta no Vault).

**Orçamentos e avaliações** (`07_quotes_reviews.sql`)

- `quotes` (`id`, `provider_id`, `provider_client_id null`, `client_name`,
  `client_phone`, `title`, `items jsonb` (`[{description, quantity, unit_price_cents}]`),
  `total_cents` (calculado por trigger), `valid_until date`, `notes`,
  `status quote_status default 'draft'`, `public_token uuid unique default gen_random_uuid()`).
- `get_quote_by_token(p_token uuid)` (anon): orçamento + nome público do prestador;
  sem dados de outros clientes. `respond_quote(p_token uuid, p_accept bool)`
  (anon) muda para `accepted`/`declined` se `sent` e dentro da validade (a data de
  validade é a de São Paulo; vale até o último dia). Itens inválidos (não é lista, sem
  `description`, `quantity` ≤ 0, preço não inteiro) → `quote_items_invalid`.
  `provider_client_id` só aponta para entrada do CRM do mesmo prestador (FK composta).
- `reviews` (`id`, `booking_id unique`, `client_id`, `provider_id`,
  `rating smallint 1-5`, `comment text <= 1000`, `published bool default true`).
  Insert só se o atendimento é do cliente, é de origem `platform`, está
  `completed`/`released` e tem pagamento `received`/`confirmed`/`released` pelo app. Se a
  ocupação tem `rating_ranking = false`, `published` é forçado a false (fica só para o
  prestador e o admin). O autor edita `rating` e `comment`; só o admin muda `published`
  (uma avaliação ocultada pela moderação continua oculta).

**Notificações** (`08_notifications.sql`)

- `notifications` (`id`, `user_id null`, `phone`, `email`, `channel`,
  `template text`, `params jsonb`, `status notification_status default 'queued'`,
  `scheduled_for timestamptz default now()`, `sent_at`, `attempts int`, `error`,
  `claimed_at timestamptz null` — horário da última reivindicação).
- Triggers enfileiram: proposta recebida (cliente), atendimento aceito (os dois),
  lembrete 24 h antes (os dois), pagamento recebido (prestador, uma vez por pagamento,
  também em `received → confirmed`), orçamento respondido (prestador), plantão oferecido
  (cuidador). **Só contato confirmado pelo Auth recebe mensagem:** WhatsApp para
  `auth.users.phone` com `phone_confirmed_at`, e-mail para `auth.users.email` com
  `email_confirmed_at`. O `profiles.phone` digitado pelo usuário nunca é destino; sem
  contato confirmado nada é enfileirado. Em produção, o cadastro por senha fica desligado
  (login por código) ou exige confirmação.
- `claim_notifications(p_limit int)` (service role): marca `sending`, grava
  `claimed_at = now()`, soma 1 em `attempts` e devolve um lote vencido, com
  `for update skip locked`. Também retoma linhas em `sending` com `claimed_at` de mais de
  10 minutos (ou nulo): a função de envio foi encerrada à força. A retomada renova
  `claimed_at` e **não soma tentativa** (a reivindicação perdida já contou). Uma linha
  `sending` reivindicada há menos de 10 minutos não é tocada. `dispatch_notifications`
  também dispara o despachante quando só há linhas paradas.
- Agendador (`pg_cron`): `workeasy-dispatch-notifications` (chama a função `notify-dispatch`
  se o Vault tem `notify_dispatch_url` e `cron_secret`) e `workeasy-expire-stale` (a cada
  15 min fecha pedidos vencidos, expira orçamentos `sent` vencidos e ofertas de plantão
  que já começaram, e apaga contadores `assist_usage` com mais de 1 dia).
- Templates (nomes que precisam existir no WhatsApp Business):
  `proposta_recebida`, `atendimento_confirmado`, `lembrete_atendimento`,
  `pagamento_recebido`, `orcamento_respondido`, `plantao_oferecido`.

**Linha de cuidado** (`09_care.sql`)

- `households` (`id`, `owner_id → profiles`, `name`, `neighborhood_id`, `notes`).
- `care_recipients` (`id`, `household_id`, `first_name`, `birth_year`,
  `preferences text`, `emergency_contact text`, unique (`id`, `household_id`)). Sem
  diagnóstico, sem medicação: dados de saúde não entram.
- `shifts` (`id`, `household_id`, `care_recipient_id`, `provider_id null`,
  `period tstzrange`, `rate_cents`, `caregiver_payout_cents`, `status shift_status`,
  `notes`). Exclusão de sobreposição por prestador; trava trabalhista sempre ativa.
  FK composta (`care_recipient_id`, `household_id`) → `care_recipients`: o plantão só
  nomeia assistido da própria casa.
- `shift_offers` (`shift_id`, `provider_id`, `status text check in ('offered','accepted','declined','expired')`, pk composta).
- `checkins` (`id`, `shift_id`, `provider_id`, `kind text check in ('in','out')`,
  `at`, `lat numeric`, `lng numeric`).
- `daily_reports` (`id`, `shift_id unique`, `provider_id`, `meals text`,
  `activities text`, `mood text`, `notes text`). Relatório não clínico.
- **Ocupação de cuidado:** a política tem a unidade de preço `plantao`
  (`private.is_care_occupation`). Prestador de cuidado = `approved`, com ocupação de
  cuidado aprovada e registro não `rejected`.
- Funções: `offer_shift(p_shift, p_providers uuid[])` (admin ou dono) oferece **só a
  prestadores de cuidado**, nunca ao dono da casa, com no máximo 10 ofertas por plantão e
  30 ofertas novas por dia por família (`offer_limit`; o admin não tem o limite diário);
  `accept_shift_offer(p_shift)` (cuidador; primeiro que aceita leva, demais
  `expired`; passa pela trava trabalhista e pela exclusão de sobreposição),
  `check_in(p_shift, p_kind, p_lat, p_lng)` (cuidador designado, dentro de ±2 h do
  início/fim, senão `checkin_window`; check-out antes do check-in → `invalid_transition`),
  `submit_daily_report(...)` (um relatório por plantão; reenviar substitui),
  `cancel_shift(p_shift, p_reason)` (cuidador: volta a `open` e reoferece, a oferta dele
  vira `declined` e as outras voltam a `offered` com nova notificação; família: `canceled`),
  `caregiver_shifts()` (o cuidador lê assim: `shift_id, period, status, offer_status,
  caregiver_payout_cents, notes, neighborhood_name, recipient_first_name`, sem valor
  cobrado da família, sem contato e sem preferências).
- RLS: a família lê só o que é dela e o admin tudo. O cuidador **não** lê a tabela
  `shifts` (nem oferecido nem designado: ela traz `rate_cents` e ids da casa e do
  assistido); lê `caregiver_shifts()`, as próprias ofertas, check-ins e relatórios. A
  família só lê o perfil do cuidador depois que ele aceitou (designado), e o cuidador só
  lê o da família depois de designado; uma oferta não compartilha nada.

**LGPD e auditoria** (`10_privacy_audit.sql`)

- `consents` (`id`, `user_id`, `purpose consent_purpose`, `version text`,
  `granted bool`, `at`). Só insert pelo próprio usuário (histórico, nunca update). O grant
  de insert é por coluna (`purpose`, `version`, `granted`): `user_id`, `at` e `created_at`
  vêm do servidor, então o histórico não é forjável nem retroativo.
- `data_requests` (`id`, `user_id`, `kind data_request_kind`, `status text`,
  `completed_at`, `result_path`). O usuário só informa `kind` (insert por coluna);
  `status` (começa `pending`), `completed_at` e `result_path` são da service role.
- `audit_log` (`id bigserial`, `actor_id`, `action text`, `entity text`,
  `entity_id text`, `data jsonb`, `at`). Só insert, via `log_event(...)` security
  definer e triggers; `update`/`delete` revogados de todos, inclusive authenticated;
  leitura só admin. `log_event` com a service role grava qualquer ação; com um usuário do
  app só aceita ações `client.<nome>`, `data` objeto de até 4 KB e no máximo 60 entradas
  por minuto, para que uma entrada de usuário nunca pareça uma do sistema (`booking.*`,
  `payment.*`, `provider.*`, `user.*`). O texto livre que entrou em `audit_log` (motivos de
  admin) não é apagado: o log é imutável.
- `anonymize_user(p_user uuid)` (service role): apaga dados pessoais de
  `profiles`, `providers`, `provider_clients`, casas e assistidos do usuário, apaga os
  registros de `provider_documents`, mantém pagamentos e atendimentos anonimizados
  (obrigação fiscal; `notes`, `canceled_reason` e `booking_events.reason` são apagados,
  e `payments.raw` fica só com os campos fiscais, sem dados do pagador), grava
  `audit_log`. **Ordem obrigatória da exclusão de conta:** (1) `account-delete` remove a
  pasta `provider-documents/<user_id>/` pela Storage API (o SQL não apaga objetos);
  (2) `anonymize_user`, que falha com `storage_not_empty` enquanto houver arquivo na
  pasta; (3) apaga o usuário do Auth.
- **O que a exclusão do usuário do Auth mantém** (FKs `on delete set null`, anonimizados):
  atendimentos, eventos, pagamentos, avaliações, entradas do CRM, `data_requests`. **O que
  apaga junto** (`on delete cascade`): casas, assistidos, plantões, check-ins e relatórios
  da família (nenhum pagamento da plataforma está ligado a um plantão, então não são
  registro fiscal), orçamentos e estado de assinatura do prestador (as cobranças ficam em
  `payments`), documentos, notificações e consentimentos. O teste `10_privacy_audit` fixa
  essa tabela de regras. **Apagar uma casa** leva junto os plantões dela, inclusive os que têm
  cuidador confirmado e ainda não terminaram: o app não avisa o cuidador, que deixa de ver o
  plantão. A tela da família avisa quantos são antes de confirmar e pede para cancelar antes
  (cancelar libera o cuidador) e avisá-lo por fora.

**Administração** (`11_admin.sql`)

- `admin_review_document(p_document uuid, p_accept bool, p_reason text)`,
  `admin_set_registry_status(p_provider, p_occupation, p_status, p_reason)`,
  `admin_set_provider_status(p_provider, p_status, p_reason)`,
  `admin_set_setting(p_key, p_value jsonb)` (as chaves editadas pela tela têm tipo e faixa checados
  no banco, erro `23514`/`invalid_setting`: `commission_enabled` e `escrow_enabled` booleanos;
  `commission_bps` 0 a 5000, `pro_price_cents` 100 a 100000, `proposal_limit` 1 a 10,
  `labor_lock_days_per_week` 1 a 7, todos inteiros; outras chaves passam),
  `admin_resolve_dispute(p_booking, p_to, p_reason)`,
  `admin_set_occupation_approval(p_provider, p_occupation, p_approved bool, p_reason)` (aprovar
  exige política da ocupação, documento `accepted` em cada passo dela e registro não `rejected`;
  sem política, `not_allowed` com `policy missing`),
  `admin_get_payment_raw(p_payment)`,
  `admin_review_payment(p_payment, p_reason)` (marca como tratado um pagamento que exigia ação
  manual: grava `payment.reviewed` com o motivo, obrigatório; recusa `not_allowed` sem motivo ou
  com pagamento inexistente e `invalid_transition` quando nada está aguardando).
  Todas exigem `is_admin()` e gravam `audit_log`. `admin_review_document(false)` exige o motivo e
  retira a aprovação que dependia do documento (ver `provider_occupations`).
- Visões para o painel (security invoker + RLS de admin, e filtro `is_admin()` na própria
  visão porque participantes leem parte das linhas de origem):
  `admin_provider_queue` (prestadores `pending_review` e `approved` com ocupação ainda a
  aprovar; coluna `occupations_to_approve`), `admin_open_disputes`, `admin_metrics`
  (pedidos, propostas, atendimentos por status, pagamentos por status, prestadores
  por status, na semana e no mês), `admin_payments_attention` (entradas do `audit_log`
  `payment.refund_failed` e `payment.received_after_cancel`, com os dados do pagamento, que ainda
  não foram tratadas; "tratada" = existe depois dela um `payment.refunded_after_cancel` ou um
  `payment.reviewed` do mesmo pagamento, ambos com `entity 'payments'`).

### Erros do banco

Funções e triggers sinalizam regras com `raise exception` e mensagens-código:
`labor_lock`, `proposal_limit`, `request_not_open`, `not_allowed`,
`invalid_transition`, `slot_unavailable`, `registry_required`,
`documents_missing`, `review_not_allowed`, `quote_expired`, `unit_not_allowed`,
`quote_items_invalid` (itens do orçamento), `slug_taken` (endereço da página já usado),
`checkin_window` (check-in/out fora de ±2 h), `booking_limit` (pedidos de agendamento
abertos demais), `offer_limit` (ofertas de plantão demais), `storage_not_empty` (a conta
ainda tem arquivos no Storage; só a service role vê). Todos com `errcode P0001`.
`lib/errors.ts` traduz cada código para uma frase em pt-BR: os do banco acima (menos
`storage_not_empty`) e os códigos de conflito das Edge Functions (`already_paid`,
`booking_not_canceled`, `booking_not_chargeable`, `booking_not_payable`, `quote_not_accepted`,
`platform_booking`, `own_booking`, `price_missing`, `payment_in_progress`,
`provider_payment_account_missing`, `payment_key_missing`, `already_onboarded`,
`onboarding_in_progress`, `already_subscribed`, `no_subscription`). `services/proErrors.ts` só
troca a frase quando o texto do prestador difere do geral (hoje, `provider_payment_account_missing`).

## Edge Functions

Handlers finos em `supabase/functions/<nome>/index.ts`; regras puras em
`supabase/functions/_shared/*.ts` (sem `Deno.*`, sem imports `npm:`), testadas
com Vitest a partir de `test/functions/*.test.ts`. Toda função valida o JWT do
usuário (exceto webhook e cron), responde JSON `{ ok, data | error }` e grava
`audit_log` nas ações de dinheiro.

| Função | Quem chama | O que faz |
|---|---|---|
| `asaas-onboard` | prestador | cria subconta Asaas (`POST /accounts`) com os dados fiscais enviados; guarda `walletId`; a chave da subconta vai para o Vault (`store_provider_payment_secret`); registra na subconta um webhook com token próprio (ver "Webhook") |
| `payments-create` | cliente | cobra um atendimento `accepted`: garante o cliente no Asaas (`POST /customers`), cria a cobrança (`POST /payments`) com `split` para a carteira do prestador (percentual do valor líquido que corresponde a valor − taxa); Pix devolve QR (`GET /payments/{id}/pixQrCode`) |
| `charges-create` | prestador Pro | cobrança de cliente próprio ou de orçamento aceito, na subconta do prestador, sem taxa |
| `payments-void` | cliente ou prestador do atendimento | depois que o atendimento está `canceled`, remove no Asaas (`DELETE /payments/{id}`) as cobranças `pending` dele, na conta certa (raiz para `platform`, subconta para `own`), e marca `payments.status = 'canceled'` (a escrita só atinge pagamento ainda `pending`: um pagamento que o webhook confirmou ou recebeu entre a leitura e a escrita não é sobrescrito); idempotente; chamada por `services/bookings.ts` e `services/proAgenda.ts` depois de um cancelamento bem-sucedido |
| `asaas-webhook` | Asaas | valida `asaas-access-token`, grava `payment_events` (idempotente por id do evento), confere a cobrança no Asaas, atualiza `payments` e chama `transition_booking` (`PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED` → `paid`; `PAYMENT_REFUNDED` → `payments.refunded` e atendimento `paid` → `canceled`); pagamento recebido de atendimento já `canceled` não reativa o atendimento e é reembolsado (ver "Webhook") |
| `subscriptions-manage` | prestador | assina ou cancela o Pro (`POST /subscriptions`, ciclo mensal) e atualiza `subscriptions`/`providers.plan` |
| `notify-dispatch` | agendador (`CRON_SECRET`) | consome `claim_notifications` e envia por WhatsApp Cloud API (template) ou Resend; sem credencial → `skipped` |
| `account-export` | usuário | devolve JSON com os dados do próprio usuário |
| `account-delete` | usuário | recusa (409 `active_bookings`) se há atendimento `accepted`, `paid`, `in_progress` ou `disputed`; cancela a assinatura Pro e as cobranças `pending` no Asaas; registra `data_requests`, chama `anonymize_user` e apaga o usuário do Auth |
| `request-assist` | cliente (fase 3) | transforma texto livre em pedido estruturado (ocupação, urgência, resumo) com Claude Haiku 5.5 no servidor; limite por usuário por hora (429); responde 503 sem chave |

Asaas: autenticação pelo cabeçalho `access_token`; valores em reais com duas
casas (converter de centavos); conferir a documentação oficial
(https://docs.asaas.com) antes de cada chamada. O pagamento por cartão usa a
página de pagamento do Asaas (`invoiceUrl`): o app nunca recebe número de
cartão, e o que o Asaas devolve é gravado sem `creditCard*` (nem o
`creditCardToken`) em `payments.raw` e `payment_events.payload`.

### Regras das funções e dependências do banco

O que o código faz além (ou diferente) da tabela acima, e o que ele espera do
banco. Mudou aqui, muda `supabase/functions` no mesmo commit.

**Webhook (`asaas-webhook`)**

- O corpo do evento é só uma dica. Antes de qualquer efeito de dinheiro, a função
  lê a cobrança de novo (`GET /payments/{id}`) com a chave da conta de onde o
  evento veio e só aplica se o `status` devolvido sustenta o evento. A assinatura
  Pro vem do `subscription` da resposta do Asaas, nunca do corpo. Cobrança que
  não existe naquela conta (404) é ignorada (`ignored: unverifiable`) e vai para
  `audit_log` (`payment_event.unverified`).
- Dois tokens: a conta raiz usa `ASAAS_WEBHOOK_TOKEN`. Cada subconta recebe, de
  `asaas-onboard`, a URL `…/asaas-webhook?acct=<provider_id>` e o token
  `HMAC-SHA256(ASAAS_WEBHOOK_TOKEN, "asaas-subaccount:<provider_id>")` em hex.
  O prestador lê esse token no painel dele; ele só vale para eventos com o
  próprio `acct`, não revela o token da plataforma e não altera assinaturas Pro
  (que são cobranças da conta raiz). Trocar `ASAAS_WEBHOOK_TOKEN` exige
  registrar de novo o webhook de cada subconta. Subcontas criadas antes desta
  regra usam o token antigo e precisam ser reconfiguradas.
- Ordem: o Asaas entrega ao menos uma vez e fora de ordem. `payments.status` só
  avança (`pending → confirmed → received`); `PAYMENT_CREATED` e
  `PAYMENT_UPDATED` não mudam nada; `PAYMENT_RESTORED` só reabre cobrança
  `canceled`/`failed`; só `PAYMENT_RECEIVED_IN_CASH_UNDONE` volta um pagamento
  recebido para `pending`. Pagamento `refunded` é final.
- Pago depois do cancelamento (rede de segurança): `PAYMENT_RECEIVED`/`PAYMENT_CONFIRMED`
  confirmado no Asaas para atendimento que já está `canceled` não muda o atendimento. O
  pagamento fica gravado como recebido (`payments.raw` sem dados de cartão, como sempre), o
  `audit_log` recebe `payment.received_after_cancel` e a função pede o reembolso total
  (`POST /v3/payments/{id}/refund`, com a chave da conta de onde veio o evento; a API aceita
  só cobrança de cartão ou Pix). Se o Asaas aceita, o pagamento vira `refunded`
  (`payment.refunded_after_cancel`). Se recusa (boleto, saldo, rede), o pagamento continua
  `received` e o `audit_log` recebe `payment.refund_failed` (com o código `asaas_<status>`) para o
  administrador resolver; o evento é dado como tratado (200), não fica em repetição. Esses
  casos aparecem na lista "Exigem atenção" de `/admin/pagamentos` até o reembolso ser concluído
  (`payment.refunded_after_cancel`) ou o administrador marcar como tratado, com o motivo
  (`payment.reviewed`).
- Erros: payload inválido, evento desconhecido, cobrança desconhecida e erro que
  se repetiria a cada tentativa (SQLSTATE 22/23/42/P0, `transition_booking`
  recusando, Asaas 400/422) respondem 200 e ficam registrados (`audit_log`,
  `payment_event.failed`), para a fila sequencial do Asaas não parar. Só falha
  transitória (rede, timeout, Asaas 5xx) responde 500 e deixa `processed_at`
  nulo, para o Asaas tentar de novo.
- Assinatura Pro: `PAYMENT_RECEIVED`/`CONFIRMED` de assinatura paga ativa o Pro e
  estende `current_period_end` (nunca encurta). Pagamento atrasado de
  assinatura já `canceled` estende o período pago mas não a reativa.
  `PAYMENT_OVERDUE` grava `past_due` e `providers.plan` volta a `free` quando
  o período pago mais `PRO_GRACE_DAYS` acaba.

**Cobranças (`payments-create`, `charges-create`)**

- Idempotência: uma cobrança `pending` por atendimento (ou orçamento). A função
  devolve a existente se o método é o mesmo e o vencimento não passou; se o
  método mudou ou venceu, remove a antiga no Asaas (`DELETE /payments/{id}`),
  marca `canceled` e cria outra. Se o Asaas recusa remover (já paga), devolve a
  existente. Se o `insert` falha, a cobrança criada no Asaas é removida, para não
  restar cobrança sem linha em `payments`.
- Item já pago não é cobrável: `payments-create` e `charges-create` respondem 409
  `already_paid` quando já existe pagamento `confirmed`, `received`, `held` ou `released` para o
  mesmo `booking_id` (ou `quote_id`), antes de qualquer chamada ao Asaas. A tela de cobranças do
  prestador também não lista esses itens.
- Cancelar o atendimento cancela a cobrança aberta (`payments-void`): JWT do usuário, corpo
  `{ "booking_id" }`. Confere que o chamador é o cliente ou o prestador e que o atendimento está
  `canceled` (senão 409 `booking_not_canceled`); sem `ASAAS_API_KEY`, 503
  `payments_not_configured`. Para cada cobrança `pending`: `DELETE` no Asaas (404 conta como
  feito; 400/409 com a cobrança já removida também); se o Asaas mostra a cobrança paga, ela
  fica `pending` e o webhook a reembolsa (`payment.void_paid` no `audit_log`); cada cobrança
  removida grava `payment.void`. Qualquer falha de uma cobrança é devolvida como erro depois de
  tentar as outras, e repetir a chamada termina o serviço. Atendimento `own` sem chave da
  subconta no Vault → 409 `payment_key_missing`. Resposta:
  `{ booking_id, canceled, awaiting_confirmation }`. O app não chama a função quando o
  atendimento só estava `requested` (nunca teve cobrança); se a chamada falha, o cancelamento
  vale e a tela avisa “A cobrança em aberto será cancelada em breve.”.
- Índices únicos parciais no banco (`06_payments.sql`):
  `payments (booking_id) where status = 'pending'` e
  `payments (quote_id) where status = 'pending'`. A função trata a violação
  `23505` (apaga a cobrança que acabou de criar e devolve a vencedora), então dois
  cliques simultâneos não criam duas cobranças.
  Risco residual: se a função morrer entre `POST /payments` e o `insert`, a cobrança
  fica no Asaas sem linha (o `externalReference` `booking:<id>` permite
  conferir manualmente).
- Split: `percentualValue` (4 casas, arredondado para baixo) sobre o valor
  líquido, nunca `fixedValue`. Com valor fixo de `valor − comissão`, uma comissão
  menor que a tarifa do Asaas (R$ 10,00 a 12% pede R$ 8,80 de um líquido de
  cerca de R$ 8,01) era recusada ou bloqueada (`PAYMENT_SPLIT_DIVERGENCE_BLOCK`).
  A plataforma absorve a parte proporcional da tarifa.

**Assinatura Pro (`subscriptions-manage`)**

- `subscription_status` tem `pending` (assinatura criada, ainda não paga, sem mudar
  `providers.plan`); `past_due` é só "pagamento atrasado". `subscriptions-manage` grava
  `pending` ao assinar. O webhook ativa a assinatura no primeiro pagamento (`pending` →
  `active`); `PAYMENT_OVERDUE` de uma assinatura `pending` sem período pago (o primeiro
  pagamento nunca foi feito) não a muda para `past_due`: continua `pending` e a resposta traz
  `ignored: first_payment_overdue`. Quem reassina dentro de um período já pago também fica
  `pending` até o novo pagamento, com `current_period_end` mantido. A tela mostra “aguardando o
  primeiro pagamento” para `pending` e “pagamento atrasado” só para `past_due`.
- O registro da nova assinatura é condicional (`claimSubscription`: insert, ou
  update só se a linha ainda é a lida): se outra requisição gravou antes, a
  assinatura recém-criada no Asaas é removida e a resposta é 409 `already_subscribed`.
- Assinar de novo dentro do período já pago (depois de cancelar) começa a cobrar
  no fim desse período, não hoje.

**Conta de recebimento (`asaas-onboard`)**

- `provider_payment_accounts.status` (texto livre) assume `creating` (reserva
  durante a criação; vira `active` ou apaga se o Asaas recusa; reserva com mais
  de 5 minutos é retomada; a tela de Assinatura mostra o formulário de novo depois desse
  prazo, a partir de `created_at`), `active`, `key_not_stored` e `key_not_returned`. Nos
  dois últimos a subconta existe no Asaas, mas a chave (devolvida uma única vez)
  se perdeu: a função tenta o Vault 3 vezes, grava a conta assim mesmo e as
  chamadas seguintes respondem 409 `payment_key_missing` (suporte), não
  `already_onboarded`.
- Vault: RPCs `store_provider_payment_secret(p_provider uuid, p_secret text)`
  (devolve o id do segredo e grava `api_key_secret_id`) e
  `get_provider_payment_secret(p_provider uuid)`, só `service_role`. O dado vai
  por id de prestador, nunca por nome de segredo.

**Notificações (`notify-dispatch`)**

- `claim_notifications` já soma 1 em `attempts`; a função grava esse valor sem
  somar de novo (5 tentativas no total, espera de 1, 4, 9 e 16 minutos). O lote
  tem orçamento de 100 s (`budgetMs`) e cada requisição é limitada pelo que
  sobra; as linhas reivindicadas e não enviadas voltam para `queued` sem gastar
  tentativa (`released` no resumo). Falha ao gravar uma linha é registrada e não
  derruba o lote.
- `notifications.params` vem dos gatilhos do banco e não traz tudo que o modelo
  usa. A função completa por id (`booking_id`, `request_id`, `payment_id`,
  `shift_id`): nome da ocupação, da outra parte (visto de quem recebe), de quem
  pagou e do bairro; `orcamento_respondido` lê `title`/`status`. O valor que já
  estiver em `params` com o nome do modelo tem prioridade. Entidade que sumiu
  falha a linha uma vez; erro de banco na consulta é tentado de novo.
- Linhas que ficaram em `sending` (função encerrada à força) são retomadas pelo próprio
  `claim_notifications` quando `claimed_at` tem mais de 10 minutos (sem somar tentativa);
  a função não precisa tratá-las de forma especial: elas chegam como qualquer lote, com o
  `attempts` já contado.

**Conta (`account-delete`, `account-export`)**

- `data_requests.status` é `pending | processing | completed | failed`.
  `account-delete` cria `processing`, termina em `completed` (ou `failed` se algo
  para antes de anonimizar). Não existe status `anonymized`.
- A pasta `provider-documents/<user_id>/` é esvaziada pela função (Storage API,
  qualquer profundidade) depois de cancelar o dinheiro e antes de `anonymize_user`,
  que recusa com `storage_not_empty` enquanto houver arquivo.
- Cancelar no Asaas vem antes de anonimizar e pode ser repetido (404 conta como
  feito). Cobrança paga nesse intervalo responde 409 `payment_in_progress`.

**Auditoria**

- Toda função grava por `log_event(p_action, p_entity, p_entity_id, p_data)`,
  nunca por insert direto em `audit_log`. Com a service role o `actor_id` fica
  nulo e `data.via = 'service'`; quem pediu a ação vai em `data.requested_by`.

**Assistente (`request-assist`)**

- Modelo `claude-haiku-5-5` (classificação curta), sem raciocínio, esforço
  baixo, `max_tokens` 700, saída estruturada (`output_config.format`). O Haiku
  5.5 não tem fallback de recusa no servidor: recusa vira "preencha
  manualmente" (422).
- Limite de `ASSIST_HOURLY_LIMIT` chamadas por usuário por hora (429
  `assist_rate_limited`; limite 0 desliga o assistente sem consultar o banco). A cota é
  consumida **antes** da chamada ao modelo por `take_assist_quota(p_user uuid, p_limit int)
  returns boolean` (`04_marketplace.sql`, só `service_role`, `security definer`,
  `search_path` vazio): um único `insert ... on conflict do update ... where count < limit`
  na tabela `assist_usage` (`user_id`, `window_start`, `count`, pk composta; RLS ligada e
  nenhuma política nem grant para usuários). Devolve `true` e soma 1, ou `false` sem
  consumir nada quando a hora esgotou; por ser atômico, uma rajada simultânea não passa do
  limite. A janela é a hora cheia em UTC (não uma janela deslizante de 60 minutos).
  Falha do banco ao consumir a cota vira erro 500 e o modelo não é chamado. As linhas
  de `assist_usage` com mais de 1 dia são apagadas por `workeasy-expire-stale`.
- O catálogo é lido em páginas de 1000 linhas (`max_rows` do PostgREST), até
  20 000 linhas.

**CORS**

- Origens fixas: apps nativos (`capacitor://localhost`, `https://localhost`,
  `http://tauri.localhost`, `tauri://localhost`) e `SITE_URL`. Os servidores de
  desenvolvimento (`localhost:3000`, `127.0.0.1:3000`) só entram com o Asaas
  sandbox ou `ALLOW_DEV_ORIGINS=true`.

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
| `/admin` | admin | painel com as métricas |
| `/admin/prestadores` | admin | lista pesquisável de prestadores (nome, situação, ocupações): fila de análise (padrão) ou todos, por situação |
| `/admin/prestadores/:id` | admin | detalhe: documentos que a política exige por ocupação e o estado de cada um, registro informado, aprovar ocupação, aprovar, suspender e reativar prestador (motivo obrigatório), revisar documentos |
| `/admin/disputas`, `/admin/pagamentos`, `/admin/auditoria`, `/admin/lgpd` | admin | contestações, cobranças (no topo, "Exigem atenção": reembolso recusado e pagamento recebido depois do cancelamento ainda sem tratamento, com link para o pagamento e a ação "marcar como tratado" com motivo), histórico de ações (o prestador de cada linha leva ao detalhe), pedidos de dados |
| `/admin/configuracoes` | admin | `platform_settings`; comissão e pagamento retido ficam desligados e dependem de parecer jurídico e de conta Asaas configurada |
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
- **Integração** (`npm run test:integration`, exige a stack local de pé: `supabase start`):
  Vitest com `vitest.integration.config.ts` (ambiente node, `test/integration/**/*.test.ts`, um
  arquivo por vez) falando com o Supabase real por `@supabase/supabase-js`, sem mocks. A URL e as chaves
  vêm de `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY`; se faltar alguma, o
  teste roda `supabase status -o env` e, com a stack parada, falha antes de começar com uma mensagem
  que diz como subir. A chave de serviço existe só nesses testes (ela reproduz o webhook e a
  anonimização, que são da service role). Cada arquivo cria os próprios usuários pela API admin do Auth
  (e-mail confirmado, senha de teste) e remove tudo no fim, inclusive pagamentos, atendimentos e arquivos
  do Storage de teste; o `audit_log` é só de inserção e guarda a trilha. As ocupações vêm da política
  (`occupation_policies`), não de slugs fixos: uma doméstica (`labor_lock`, sem registro profissional) e
  uma regulamentada (`registro_profissional`), então os mesmos testes valem para o catálogo pequeno e
  para o grande. Os testes não entram em `npm test` (o `vite.config.ts` os exclui).
  - `marketplace-flow.test.ts`: pedido do cliente; cadastro do prestador, documentos da política,
    análise e aprovação por um admin; `open_requests_for_me` sem contato do cliente; propostas e
    `proposal_limit`; `accept_proposal`; trava trabalhista na semana ISO de São Paulo (2 dias passam, o
    terceiro e o domingo à noite falham com `labor_lock`, a semana seguinte passa, outro cliente não é
    barrado); pagamento como o webhook faz (service role grava `payments` e chama `transition_booking`),
    conclusão, liberação e avaliação só depois do pagamento; vazamento (outro cliente, outro prestador
    e anônimo não leem `profiles`, `bookings`, `payments`, `provider_documents`, `requests` nem os
    arquivos do Storage); orçamento público por token; pedidos de exportação e exclusão, e
    `anonymize_user` preservando o registro financeiro.
  - `regulated-provider.test.ts`: ocupação regulamentada, registro informado/confirmado/rejeitado,
    documentos exigidos, revogação da aprovação quando um documento é rejeitado.
  - Limites: o Auth local aceita 30 logins por 5 minutos por IP (`[auth.rate_limit]`); uma execução usa
    cerca de 10, e o helper espera e tenta de novo se o limite for atingido. As Edge Functions não sobem
    nesse teste (têm Vitest próprio, `deno check` e `deno lint`).
- **CI** (`.github/workflows/web-ci.yml`, com os mesmos filtros de caminho): `web` (lint, typecheck,
  Vitest, build); `database` (`supabase/setup-cli` na versão do `package.json`, `supabase start -x
  studio,imgproxy,logflare,vector,supavisor,realtime,edge-runtime`, `supabase test db`,
  `npm run test:integration` com as variáveis de `supabase status -o env`, e a conferência de que
  `lib/database.types.ts` é igual ao que `supabase gen types typescript --local` gera agora; o
  teste falha com a diferença) e `functions` (`deno check --frozen` e `deno lint` com
  `supabase/functions/deno.json`, Deno 2.9.6). Mudou assinatura no banco: edite a migration, rode
  `supabase db reset`, `supabase test db` e `npm run db:types`, e faça o commit do arquivo gerado.
