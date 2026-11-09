# Supabase em produção: dossiê e runbook

Documento técnico para o owner e para quem executar a publicação do WorkEasy.
**Não é parecer jurídico.** Nada foi criado nem executado em nenhum projeto Supabase remoto (no banco local, só consultas de leitura),
e nenhum arquivo do repositório foi alterado.

| Campo | Valor |
|---|---|
| Data de consulta das fontes | 2026-11-08. Páginas sem data estão marcadas como "sem data". |
| Escopo | Criar o projeto Supabase de produção a partir deste repositório, com a ordem de operações, a configuração de Auth, os segredos, o Vault, o primeiro admin e os testes de fumaça |
| Como ler | `[S#]` = fonte da seção 12. `[CLI 2.121.0]` = saída do `--help` da CLI local (`apps/web/node_modules/.bin/supabase`, versão 2.121.0, lida em 2026-11-08). `[REPO]` = arquivo do repositório. Tags: `[PLANEJADO]`, `[incerto]` (não confirmado nas fontes abertas), `[CONDICIONAL: depende de parecer]` |

---

## 1. Resumo

1. **Região.** `sa-east-1` ("South America (São Paulo)") está na lista oficial de regiões [S1] e entre as opções da CLI 2.121.0 [CLI 2.121.0]. Não confirmei se a região pode ser trocada depois da criação, nem se há diferença de preço ou de plano entre regiões.
2. **Plano.** Recomendo Pro para produção. No Free não há backup diário, o projeto pausa depois de uma semana de pouca atividade e a proteção contra senha vazada só existe a partir do Pro [S2, S3, S10, S-senha]. Detalhes na seção 5.
3. **Três bloqueios antes de qualquer usuário real.**
   - E-mail de código: o SMTP embutido envia 2 e-mails por hora no projeto [S11, S13]. É preciso um SMTP próprio.
   - SMS de código: o padrão é de 30 SMS por hora no projeto inteiro [S11].
   - Provedor: a Auth só envia código por WhatsApp pela Twilio [S28]. O app pede código por SMS (`channel: 'sms'`, `services/auth.ts`, linha 33), e o `config.toml` diz "SMS/WhatsApp". Falta uma decisão (D3).
4. **Não rode `supabase config push` com este `config.toml`.** A CLI 2.121.0 envia ao projeto as propriedades que o arquivo declara e pede confirmação por recurso; com `--yes` a confirmação é pulada [CLI 2.121.0] (`SUPABASE_YES` não conferida). O arquivo declara o placeholder da Twilio e um código de teste fixo para o telefone `+55 11 99999-0000` [REPO `supabase/config.toml`, linhas 296-297 e 321-325].
5. **Risco no agendador.** O `net.http_post` usa timeout padrão de 2000 ms [S24]. O `notify-dispatch` pode levar até 100 s por lote [REPO `supabase/functions/notify-dispatch/handler.ts`, `DEFAULT_BUDGET_MS`], e a migration 08 não define timeout. Teste em um projeto de ensaio antes da produção (seção 10, item A).
6. **Já existe um workflow de publicação**, `.github/workflows/deploy-supabase.yml`. Ele roda só por disparo manual, só a partir de `main`, simula as migrations por padrão, aplica-as com `--skip-vault`, não aplica o seed e publica as duas funções públicas com `--no-verify-jwt` [REPO]. O runbook da seção 7 usa esse workflow sempre que possível.

---

## 2. Decisões que cabem ao owner

| # | Decisão | Opções | Recomendação técnica | Base |
|---|---|---|---|---|
| D1 | Região do projeto | `sa-east-1` ou outra | `sa-east-1`, pela proximidade dos usuários. A troca depois da criação não foi conferida | [S1], [CLI 2.121.0] |
| D2 | Plano | Free, Pro, Team | Pro. Free não serve para dados reais (seção 5) | [S2], [S3], [S10] |
| D3 | Canal do código de entrada | SMS pela Twilio, SMS por outro provedor, WhatsApp pela Twilio | Decidir antes do lançamento. A Twilio é a única opção de Auth com canal WhatsApp | [S28] |
| D4 | SMTP do código por e-mail | Provedor SMTP próprio | Obrigatório antes do lançamento | [S13] |
| D5 | Limite de SMS por hora no projeto | Padrão 30 ou outro valor | Dimensionar pelo volume de cadastros esperado. O número é decisão do owner | [S11] |
| D6 | CAPTCHA (Turnstile ou hCaptcha) | Desligado ou ligado | Decidir depois do primeiro ensaio. Ligar exige enviar `captchaToken` no app, que hoje não envia | [S12], `services/auth.ts` |
| D7 | Admins no início | 1 ou 2 | Dois, para não depender de uma única conta. A inserção é manual (fase 12) | [REPO `admins`] |
| D8 | Domínio canônico | O de `VITE_SITE_URL` | Mesmo valor em Site URL, no segredo `SITE_URL` e em `VITE_SITE_URL` | [REPO `docs/arquitetura/infra.md`] |
| D9 | Validade do código de entrada | 3600 s (valor atual do `config.toml`) ou outro | Escolha do owner. Nenhuma fonte aberta dá valor recomendado | [REPO `supabase/config.toml`, linha 247] |
| D10 | Retenção de logs | 1 dia (Free) ou 7 dias (Pro) | Pro. Confirmar se 7 dias cobrem a investigação de cobrança e webhook | [S2] |

---

## 3. Estado do repositório (conferido em 2026-11-08)

| Item | Fato | Onde |
|---|---|---|
| Migrations | 36 arquivos, de `20261019000001_identity.sql` a `20261109300006_booking_request_notice.sql` | `supabase/migrations/` |
| Extensões | `btree_gist` e `pg_net` no schema `extensions`; `pg_cron` no schema `pg_catalog`. Nenhuma migration cria `supabase_vault`, mas a migration 06 usa `vault.create_secret`, `vault.update_secret` e `vault.decrypted_secrets` | `20261019000001_identity.sql` (início); `20261019000006_payments.sql` |
| Agendamentos | 7 chamadas a `cron.schedule`, em 6 migrations: `workeasy-dispatch-notifications` (`* * * * *`), `workeasy-expire-stale` (`*/15 * * * *`), `workeasy-booking-reminders` (`*/15 * * * *`), `workeasy-expire-booking-requests` (`*/15 * * * *`), `workeasy-expire-pro-plans` (`17 * * * *`), `product-events-retention` (`17 3 * * *`) e `notification-counts-retention` (`23 3 * * *`); no banco local, `cron.job` tem as mesmas 7 linhas | `20261019000008_notifications.sql`; `20261023100000_booking_reminders.sql`; `20261108100000_product_events.sql`; `20261109000006_booking_requests.sql`; `20261109000007_pro_plan_expiry.sql`; `20261109100001_notification_daily_cap.sql` |
| Despachante | `private.dispatch_notifications` só chama `notify-dispatch` se o Vault tem `notify_dispatch_url` **e** `cron_secret`; sem as duas, retorna sem erro | `20261019000008_notifications.sql` |
| Funções | 12 pastas com `index.ts`, mais `_shared/` e `_runtime/` (bibliotecas) | `supabase/functions/` |
| Chaves de runtime | `_runtime/supabase.ts` lê as chaves novas (`SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`) ou as antigas (`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) | `supabase/functions/_shared/config.ts`, linhas 57-61 |
| Funções sem JWT de usuário | `asaas-webhook` exige `asaas-access-token` (401 `invalid_token`; 503 sem `ASAAS_WEBHOOK_TOKEN`). `notify-dispatch` exige `x-cron-secret` ou `Authorization: Bearer` (401 `unauthorized`; 503 sem `CRON_SECRET`) | `asaas-webhook/handler.ts`, linhas 80-91; `notify-dispatch/handler.ts`, linhas 116-120 |
| Config de funções | `config.toml` tem `[functions.asaas-webhook]` e `[functions.notify-dispatch]` com `verify_jwt = false` (linhas 407-411); `test/functions/functions-config.test.ts` confere | `supabase/config.toml` |
| Seed | 10 instruções `insert` (1 em `areas`, 4 em `occupations`, 4 em `occupation_policies`, 1 em `neighborhoods`), 10 cláusulas `on conflict ... do update`, 0 `delete`, 0 `truncate`. O cabeçalho informa 44 áreas, 1.710 ocupações, 1.710 políticas e 96 bairros. Nenhum insert toca `auth.users` | `supabase/seed.sql` (1,82 MB; 1.824.152 bytes) |
| Bucket | `provider-documents`, privado, limite de 10.485.760 bytes, tipos `image/jpeg`, `image/png`, `image/webp`, `image/heic` e `application/pdf`, com políticas em `storage.objects`. Criado pela migration (`on conflict do nothing`) | `20261019000003_providers.sql` |
| Cadastro | Trigger `on_auth_user_created` cria `profiles` a cada insert em `auth.users`. `admins` tem RLS, uma política de leitura e `grant select` só para `authenticated`. Não há trigger em `admins` | `20261019000001_identity.sql` |
| Login no app | `signInWithOtp` com `shouldCreateUser: true`; e-mail com `emailRedirectTo`; telefone com `channel: 'sms'`. O app não chama `signInWithPassword` e não envia `captchaToken` | `services/auth.ts`, linhas 25-35 |
| Segredos previstos | Lista em `supabase/functions/.env.example` | `.env.example` |
| Publicação | `deploy-supabase.yml`: manual, ambiente `production`, só `main`, `dry_run` padrão `true`, `deploy_functions` padrão `false` | `.github/workflows/deploy-supabase.yml` |
| Procedimento manual | `docs/arquitetura/infra.md`, seção "Passos manuais" (13 passos). Remete a um `DEPLOY.md` que não existe no repositório | `apps/web/docs/arquitetura/infra.md` |
| CLI | `supabase` 2.121.0 como devDependency e no workflow; `supabase-js` 2.118.0 | `apps/web/package.json` |

---

## 4. Dossiê Supabase

### 4.1 Região

- A lista oficial traz "South America (São Paulo)", `sa-east-1` [S1, sem data]. A página não diz se a região pode ser trocada depois; diz só que cada projeto tem uma região primária, onde ficam os dados [S1].
- `supabase projects create --region` aceita `sa-east-1` [CLI 2.121.0].
- Não conferido: se todos os recursos (Edge Functions, `pg_cron`, Vault) estão disponíveis em `sa-east-1` e se o preço é o mesmo [incerto].
- Edge Functions: a página diz que rodam o mais perto possível do usuário e que são replicadas no mundo; não diz se a conexão ao banco sai da região do projeto [S30, sem data] [incerto]. Medir a latência em um ensaio.

### 4.2 Planos e custos

| Item | Free | Pro | Fonte |
|---|---|---|---|
| Preço mensal | US$ 0 | a partir de US$ 25 (inclui micro compute coberto por crédito de US$ 10/mês) | [S2, sem data] |
| Team | a partir de US$ 599/mês | — | [S2] |
| Banco | 500 MB por projeto | 8 GB de disco; excedente US$ 0,125/GB | [S2] |
| Egress | 5 GB | 250 GB; excedente US$ 0,09/GB | [S2] |
| Storage | 1 GB | 100 GB; excedente US$ 0,0213/GB | [S2] |
| Invocações de Edge Functions | 500 mil | 2 milhões; excedente US$ 2 por milhão | [S2] |
| Usuários ativos mensais | 50 mil | 100 mil; excedente US$ 0,00325/MAU | [S2] |
| Backup diário | não incluso | mantido por 7 dias | [S2], [S3] |
| PITR | não incluso | complemento pago. A página de backups dá valor aproximado de US$ 100/mês para 7 dias (US$ 200 para 14 e US$ 400 para 28); confirmar no painel antes de contratar | [S2], [S3] |
| Retenção de logs | 1 dia | 7 dias | [S2] |
| Pausa por inatividade | pausa após 1 semana com pouca atividade | nunca pausa | [S2], [S10] |
| Branching | não citado para Free | citado para Pro | [S10], [S19] |

- Conversão para real: não feita. O câmbio e a forma de pagamento não foram consultados.

### 4.3 Backups e restauração

- Backup diário: incluído em Pro (7 dias), Team (14 dias) e Enterprise (até 30 dias) [S3]. Free não tem backup automático [S2]; a página de backups recomenda exportar os dados regularmente com `db dump` e manter cópias fora da plataforma [S3].
- PITR: complemento para Pro, Team e Enterprise. Janelas de 7, 14 e 28 dias. RPO de dois minutos: não reconferido nesta revisão [incerto]. Ativar PITR desliga os backups diários [S3].
- Restauração: pelo painel; caminho de menu não conferido [incerto]. A restauração por PITR substitui o estado atual do banco; a página sugere restaurar primeiro em um projeto novo para não perder dados recentes [S3].
- Free: os backups não podem ser baixados [S10].
- Página de checklist: se o banco deve passar de 4 GB, a página recomenda ativar o add-on PITR [S10].
- Testar uma restauração exige um projeto de teste ou janela de manutenção; a decisão fica para o owner [PLANEJADO].

### 4.4 Edge Functions

**Limites** [S4, sem data]:

| Limite | Free | Pago |
|---|---|---|
| Duração (relógio) | 150 s | 400 s |
| CPU por requisição | 2 s (não inclui I/O assíncrono) | 2 s |
| Espera sem resposta | 150 s, depois 504 | 150 s, depois 504 |
| Memória | 256 MB | 256 MB |
| Bundle | 20 MB com CLI local; 5 MB se empacotado no servidor (API ou painel) | mesmo |
| Funções por projeto | 100 | 1.000 (Pro), 2.000 (Team) |

- O lote do `notify-dispatch` tem orçamento de 100 s [REPO `notify-dispatch/handler.ts`, `DEFAULT_BUDGET_MS`]. Cabe no limite de duração dos dois planos.
- Cold start: sem número oficial. A página fala em "milissegundos" e, em outro trecho, diz que "a new V8 isolate is spun up for each invocation", enquanto outra passagem fala em isolates que ficam ativos [S30]. [incerto]. Medir em ensaio.

**Publicação** [S20, CLI 2.121.0]:

- `supabase functions deploy [nome]`: publica no projeto vinculado.
- `--no-verify-jwt`: desliga a verificação de JWT da função.
- `--use-api`: empacota no servidor, sem Docker. Atenção ao limite de 5 MB do empacotamento no servidor [S4]. Se o bundle passar disso, usar o empacotamento local (exige Docker) [incerto: não confirmei que `--use-api` cai nesse limite].
- `--prune`: apaga do projeto as funções que não existem localmente. Não usar em produção sem revisão.
- `verify_jwt` pode ser definido em `config.toml`, na forma `[functions.<nome>] verify_jwt = false` [S5]. O repositório tem essa seção para as duas funções sem JWT (linhas 407-411); o workflow repete a flag em cada publicação [REPO `deploy-supabase.yml`]. A página de deploy não diz explicitamente que `functions deploy` aplica o `config.toml` [incerto].
- Não conferido: se o empacotamento usa `supabase/functions/deno.json` e `deno.lock` [incerto]. A página de deploy cita só `--import-map`.

**Quais funções exigem JWT** (regra da ARQUITETURA: "Toda função valida o JWT do usuário (exceto webhook e cron)" [REPO `docs/ARQUITETURA.md`]):

| Função | `verify_jwt` | Motivo |
|---|---|---|
| `asaas-webhook` | **false** | Chamada do Asaas, com token próprio no cabeçalho |
| `notify-dispatch` | **false** | Chamada do agendador, com `CRON_SECRET` |
| `account-delete`, `account-export`, `asaas-onboard`, `care-summary`, `charges-create`, `payments-create`, `payments-void`, `quote-assist`, `request-assist`, `subscriptions-manage` | true (padrão) | Usuário logado. `care-summary` e `quote-assist` não aparecem na tabela de funções da ARQUITETURA; a regra geral vale para elas [incerto: conferir no handler] |

- Se `asaas-webhook` ou `notify-dispatch` for publicada sem a flag, o gateway tende a recusar a chamada antes do handler, porque o segredo não é um JWT. Isso é raciocínio a partir de [S5] e [S20], não um teste feito aqui. Como o `config.toml` declara a mesma flag, o risco só existe se a CLI não aplicar o `config.toml` na publicação [incerto]; por isso a flag fica no workflow. Os pagamentos deixariam de ser registrados.

**Segredos** [S6, CLI 2.121.0]:

- `supabase secrets set --project-ref <ref> --env-file <arquivo>` lê os segredos de um arquivo. `NAME=VALUE` também funciona, mas o valor fica no histórico do shell. Usar arquivo fora do repositório, apagado depois do uso.
- As funções leem o segredo na hora, sem redeploy [S6].
- Nome que começa com `SUPABASE_` é recusado [S6].
- Injetados pelo próprio Supabase: `SUPABASE_URL`, `SUPABASE_DB_URL`, `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS`, `SUPABASE_JWKS`; legados `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` [S6].
- `supabase secrets list` lista os nomes [S6]. Comando de remoção: não conferido [incerto].

### 4.5 pg_cron, pg_net e Vault

- **pg_cron.** A página diz que a plataforma suporta a extensão e que ela cria o schema `cron`. Jobs ficam em `cron.job`; histórico em `cron.job_run_details`; intervalo de um segundo ou mais [S25, S8]. Disponibilidade por plano: não conferida [incerto]. A migration 01 cria `pg_cron` com `schema pg_catalog`; a documentação aberta não diz em qual schema fica no projeto hospedado [incerto]. No banco local (stack do CLI, 2026-11-08), `pg_cron` está em `pg_catalog` e `cron.job` tem 7 linhas.
- **pg_net.** `net.http_post(url, body, params, headers, timeout_milliseconds)`. Timeout padrão de 2000 ms. A requisição só sai depois do commit da transação. A resposta fica 6 horas em `net._http_response` [S24, sem data]. A página marca a API como beta e avisa que as assinaturas podem mudar [S24].
- **Exemplo oficial** de agendamento com `cron.schedule` e `net.http_post`, com o segredo lido de `vault.decrypted_secrets`; o exemplo envia o segredo em `apikey`, e a migration 08 usa `Authorization: Bearer` [S8; REPO]. Aviso da página: "Any role that can log in to your database can read the secret key while the request waits." [S8, sem data]. Por isso, só o dono do banco deve ter login.
- **Vault.** Exemplos: `vault.create_secret('valor', 'nome', 'descrição')`, que devolve um UUID. A página não nomeia os parâmetros, só mostra essa ordem [S7]. `vault.update_secret(uuid, ...)`. A view `vault.decrypted_secrets` dá acesso aos valores a quem puder consultá-la [S7]. Disponibilidade por plano: não citada [incerto].
- No banco local, `anon` e `authenticated` não têm `SELECT` em `vault.decrypted_secrets` (consulta de 2026-11-08). No projeto novo, não conferido: conferir na fase 3.

### 4.6 CLI 2.121.0: comandos usados no runbook

| Comando | Flags relevantes | Observação |
|---|---|---|
| `projects create [nome]` | `--org-id`, `--db-password`, `--region` (inclui `sa-east-1`), `--size`, `--high-availability` | [CLI 2.121.0]. A página não lista os obrigatórios [S21, sem data] |
| `link` | `--project-ref`, `-p`. Senha por prompt, por flag ou por `SUPABASE_DB_PASSWORD` (recomendado em CI) | [S16, sem data] |
| `db push` | `--linked`, `--dry-run`, `--skip-vault`, `--include-seed`, `--include-roles`, `--include-all`, `--db-url` (percent-encoded), `--yes` | [CLI 2.121.0]; [S15, sem data]. `--skip-vault`: o CLI atualiza os segredos do Vault a partir do `config.toml` antes das migrations, a não ser que a flag esteja presente [CLI 2.121.0]. O seed só entra com `--include-seed` [S15] |
| `functions deploy [nome...]` | ver 4.4 | [S20], [CLI 2.121.0] |
| `secrets set` | `--project-ref`, `--env-file`, `NAME=VALUE` | [CLI 2.121.0] |
| `config diff` | — | Mostra o que um `config push` mudaria [CLI 2.121.0] |
| `config push` | `--project-ref` | "Pushes the properties your local config.toml declares"; propriedades não declaradas ficam como estão; pede confirmação por recurso; `--yes` pula a confirmação [CLI 2.121.0] (`SUPABASE_YES` não conferida). Documentação: [S9, sem data] |
| `db advisors` | `--linked`, `--type all\|security\|performance` | [CLI 2.121.0]; [S18] |
| `migration list` | — | Citado para divergências entre histórico local e remoto [S15]. Flags não conferidas |

### 4.7 Auth

**Limites de taxa** [S11, sem data; S10, nota com data de 3 Sep 2024]:

| Limite | Padrão | Escopo | Ajustável |
|---|---|---|---|
| E-mails de autenticação | 2 por hora (SMTP embutido) | projeto | Sim. Com SMTP próprio, o padrão passa a 30 por hora [S13, S10] |
| SMS | 30 por hora | projeto | Sim [S11] |
| Envio de OTP ou magic link | 1 pedido a cada 60 s | usuário | Sim [S11] |
| Cadastro e login | 30 a cada 5 min (rajada 30) | IP, exceto anônimos | Sim [S11] |
| Verificação de OTP | 30 a cada 5 min (rajada 30) | IP | Sim [S11] |
| Renovação de token | 150 a cada 5 min (rajada 30) | IP | Sim [S11] |
| Login anônimo | 30 por hora | IP | Sim [S11]. O repo desliga login anônimo |
| MFA (desafio e verificação) | 15 por minuto | IP | Não [S11] |

- Os números de verificação e renovação aparecem em outra unidade na página de checklist (360 e 1.800 por hora) [S10]. São equivalentes: 30 a cada 5 min = 360/h; 150 a cada 5 min = 1.800/h.
- Ajuste: Authentication, Rate Limits, no painel [S11].

**CAPTCHA** [S12, sem data]: Cloudflare Turnstile e hCaptcha. A página cita cadastro, login e recuperação de senha; não cita OTP nem magic link [incerto para OTP]. O cliente envia o token em `options.captchaToken`. Plano exigido: não citado [incerto].

**SMTP próprio** [S13, sem data]: o SMTP embutido "is not meant for production use" e tem 2 mensagens por hora. Para o SMTP próprio: escolher um provedor com protocolo SMTP, obter host, porta, usuário e senha, definir o remetente e ativar no painel (ou pela Management API). Depois de salvar, o limite fica em 30 por hora até ser ajustado [S13]. Plano Free: não citado [incerto].

**Senha** [S-senha, sem data]: a página diz que menos de 8 caracteres "is not recommended". Oferece exigência de dígitos, minúsculas, maiúsculas e símbolos; reautenticação para trocar a senha; proteção contra senha vazada "available on the Pro Plan and above" (a página não cita o nome do serviço). Configuração no painel de Auth; a página não cita `config.toml`.

**Telefone** [S28, sem data]: provedores de SMS listados: MessageBird, Twilio, Vonage e TextLocal (comunitário). WhatsApp como canal de código: "only supported as a channel for the Twilio and Twilio Verify Providers". Hook de SMS não citado. Plano Free: não citado.

### 4.8 Storage

- Acesso controlado por políticas RLS em `storage.objects` [S22, sem data]. Bucket público não precisa de política de leitura [S22].
- Teto do limite global de upload (Storage Settings): no Free, 50 MB; no Pro, até 500 GB. O limite de cada bucket não pode ser maior que o global [S23].
- No repositório, o bucket `provider-documents` tem 10 MiB, abaixo dos 50 MB do Free [REPO].
- Não conferido: se URLs assinadas funcionam para bucket privado [incerto]. A página aberta não trata desse caso.

### 4.9 Rede e conexões

- Conexão direta, `db.<ref>.supabase.co:5432`: IPv6. Para IPv4 é preciso o complemento IPv4, que troca o registro AAAA pelo A e deixa o endpoint só em IPv4 [S29, sem data].
- Pooler compartilhado: host `aws-[INDEX]-[REGION].pooler.supabase.com`, usuário `postgres.<ref>`; sessão na porta 5432 e transação na porta 6543. IPv4 não reconferido nesta revisão [incerto]. O modo transação não aceita prepared statements [S29].
- Para migrations, `pg_dump` e restauração, a página recomenda a conexão direta; o modo sessão também serve para sessões longas [S29].
- Restrições de rede: valem para Postgres e pooler, não para PostgREST, Storage, Auth nem supabase-js. Com restrições ligadas, Edge Functions perdem o acesso direto ao banco e devem usar supabase-js [S14, sem data]. Padrão: tudo liberado. Plano exigido: não citado [incerto].
- O repositório usa supabase-js nas funções; nenhuma função usa `SUPABASE_DB_URL` (busca em `supabase/functions` sem resultado) [REPO]. Pela regra de [S14], restringir o acesso direto não deve afetar as funções. É inferência, não teste [incerto].

### 4.10 Papéis e RLS

- `postgres` tem privilégios administrativos. As queries do painel rodam como `postgres` [S17, sem data].
- `service_role` contorna RLS [S17].
- Dono da tabela contorna RLS, a menos que a tabela use `FORCE ROW LEVEL SECURITY`. Superusuários e papéis com `BYPASSRLS` sempre contornam [S31, PostgreSQL 18.6]. O repositório não usa `FORCE` (busca sem resultado) [REPO]. Logo, o `postgres` que roda as migrations consegue inserir em `admins` pelo SQL.
- A página de papéis diz que `anon` e `authenticated` são usados pelo PostgREST para usuário sem login e com login, mas não descreve como o RLS age sobre eles [S17]. O comportamento vem das políticas do repositório (`docs/ARQUITETURA.md`).

### 4.11 Exposição pela Data API

- Supabase está mudando o padrão para revogar grants automáticos em `public`, de modo que a exposição passe a ser opt-in [S26, sem data]. Os padrões variam por projeto, conforme a data de criação [S26].
- O repositório já revoga os `default privileges` de `public` para `anon` e `authenticated` no início de `20261019000001_identity.sql` [REPO].
- `config.toml` deixa `auto_expose_new_tables` comentado e diz que um projeto novo cai no padrão `true` [REPO, linha 23]. Conferir o ajuste "Automatically expose new tables" no painel da Data API [PLANEJADO].
- A página recomenda RLS em toda tabela exposta, e diz que tabelas criadas pelo painel já vêm com RLS [S26].

### 4.12 Advisors, checklist e branching

- **Security Advisor** [S18, sem data]: RLS desligada em tabela pública (0013, erro), view que expõe `auth.users` (0002, erro), view `security definer` (0010, erro), `search_path` mutável (0011, aviso). Também: políticas permissivas (0024), funções `SECURITY DEFINER` chamáveis por `anon` ou `authenticated` (0028 e 0029).
- **Performance Advisor** [S18]: chaves estrangeiras sem índice (0001), políticas RLS lentas por reavaliar `auth` a cada linha (0003), várias políticas permissivas (0006), índices duplicados (0009), entre outros.
- Acesso: painel (Advisors), `supabase db advisors` [CLI 2.121.0] e MCP [S18]. A página avisa que alguns achados podem ser intencionais.
- **Checklist de produção** [S10; data de 3 Sep 2024 numa nota de limite de e-mails]: segurança (RLS, SSL e rede, acesso, Auth, ameaças); desempenho (advisor, índices, teste de carga em staging); disponibilidade (SMTP próprio, pausa do Free, PITR); deploy (GitHub conectado, "Deploy to production" a partir de `main`, branching no Pro); abuso (CAPTCHA em cadastro, login e recuperação de senha).
- **Branching** [S19, sem data]: cria um banco de preview a partir das migrations do repositório. Branches persistentes servem a staging e não são apagadas quando o PR fecha. Planos: a página de branching não cita; a checklist cita o Pro [S10] [incerto].

---

## 5. O que o plano Free não faz

| Recurso | Free | Pro | Efeito no WorkEasy | Fonte |
|---|---|---|---|---|
| Backup diário | não incluso | 7 dias | Sem backup, uma falha de banco não tem volta. Pagamentos e atendimentos são dados fiscais | [S2], [S3] |
| PITR | não | complemento pago | Sem restauração pontual | [S3] |
| Download de backup | não | — | Não há cópia para levar para fora | [S10] |
| Pausa | pausa após 1 semana de pouca atividade | nunca pausa | Um projeto pausado derruba o app | [S2], [S10] |
| Retenção de logs | 1 dia | 7 dias | Investigar um webhook de pagamento de uma semana atrás não é possível | [S2] |
| Senha vazada | não | sim | Só importa se houver login por senha | [S-senha] |
| Banco | 500 MB | 8 GB | Acima de 4 GB, a página de checklist recomenda ativar PITR | [S2], [S10] |
| Edge Functions | 100 por projeto; 150 s de duração | 1.000; 400 s | As 12 funções cabem nos dois | [S4] |
| Invocações | 500 mil por mês | 2 milhões | Ver seção 10, item L | [S2] |
| Branching | não citado | citado | Ensaio de migrations | [S10], [S19] |
| SMTP próprio, CAPTCHA, restrições de rede, pg_cron, Vault, SMS | planos não citados nas fontes | — | Conferir no painel antes de contratar | [incerto] |

**Conclusão técnica:** para dado real de clientes e pagamento, o mínimo é o Pro. A página de checklist aponta na mesma direção: Pro não pausa por inatividade e PITR é recomendado acima de 4 GB [S10].

---

## 6. `config.toml`: o que muda em produção

O `config.toml` é do ambiente local. Nenhum valor abaixo deve ser enviado ao projeto por `config push`. Ajustes em produção são feitos no painel ou pela Management API, ou em um arquivo de configuração separado (decisão em D11, abaixo).

| Chave | Local (`config.toml`) | Produção | Motivo | Fonte |
|---|---|---|---|---|
| `auth.site_url` | `http://localhost:3000` (linha 162) | `https://<domínio>` (D8) | Base dos links dos e-mails e redirecionamentos | [REPO `infra.md`, passo 3] |
| `auth.additional_redirect_urls` | inclui `http://localhost:3000` (linhas 168-174) | remover o localhost; manter `capacitor://localhost`, `https://localhost`, `http://tauri.localhost`, `tauri://localhost` (apps nativos) e o domínio | Origens de desenvolvimento não devem ser aceitas em produção | [REPO `config.toml`] |
| `auth.enable_anonymous_sign_ins` | `false` | `false` | O app não usa login anônimo | [REPO] |
| `auth.enable_signup` | `true` | `true` | O código cria a conta no primeiro uso (`shouldCreateUser: true`) | [REPO `services/auth.ts`] |
| `auth.email.enable_confirmations` | `true` | manter; decidir | O código já prova o e-mail. Notificações só vão para contato confirmado pelo Auth | [REPO `ARQUITETURA.md`, Notificações] |
| `auth.minimum_password_length` | `6` (linha 193) | 8 ou mais, se houver login por senha | Menos de 8 não é recomendado | [S-senha] |
| `auth.password_requirements` | `""` | a opção mais forte disponível, se houver senha | — | [S-senha] |
| `auth.email.secure_password_change` | `false` | `true`, se houver senha | Reautenticação para trocar a senha | [S-senha] |
| `auth.email.otp_expiry` | `3600` (linha 247) | D9 | Sem valor recomendado nas fontes abertas | [REPO] [incerto] |
| `auth.rate_limit.email_sent` | `2` (linha 210) | ajustar após SMTP próprio | Padrão do SMTP embutido | [S11], [S13] |
| `auth.rate_limit.sms_sent` | `30` (linha 212) | D5 | Limite do projeto | [S11] |
| `auth.rate_limit.sign_in_sign_ups` | `30` por 5 min por IP | manter; observar | Redes móveis podem compartilhar IP. Risco de raciocínio, não testado | [S11] |
| `auth.captcha` | comentado | D6 | Exige `captchaToken` no app | [S12] |
| `auth.sms` (canal) | `enable_signup = true`; texto "SMS/WhatsApp" | D3 | Canal real decide o provedor | [S28], `services/auth.ts` |
| `auth.sms.twilio` | placeholders `local-placeholder` (linhas 321-325, com `enabled = true`) | remover do arquivo de produção | Placeholder não é credencial | [REPO] |
| `auth.sms.test_otp` | `5511999990000 = "123456"` (linhas 296-297) | **nunca** | Código fixo que valeria em produção. O próprio arquivo avisa | [REPO] |
| `auth.mfa.totp` | desligado | decidir para admins | — | [REPO] [incerto: plano exigido] |
| `db.major_version` | `17` (linha 41) | conferir com `SHOW server_version;` no projeto | O comentário do config manda igualar | [REPO] |
| `db.network_restrictions` | desligado | avaliar | Padrão liberado; supabase-js é compatível | [S14] |
| `api.auto_expose_new_tables` | comentado (linha 23) | conferir no painel | Ver 4.11 | [S26] |
| `storage.file_size_limit` | `50MiB` (linha 119) | conferir no painel | Limite global; Free não passa de 50 MB | [S23] |
| `functions.*.verify_jwt` | `false` em `asaas-webhook` e `notify-dispatch` (linhas 407-411) | manter; a flag também vai no deploy | Ver seção 9, item 1 | [S5], [REPO] |
| `db.seed` | `sql_paths = ["./seed.sql"]` | não aplicar por `db push` | Seed é de catálogo; ver fase 5 | [S15], [REPO workflow] |

**D11 (decisão):** manter o `config.toml` só para o local e fazer ajustes de produção no painel, ou criar um diretório de configuração separado para produção. A CLI tem `--workdir` (diretório que contém a pasta `supabase/`) [CLI 2.121.0]. Essa segunda opção não foi testada.

---

## 7. Runbook: ordem de operações

Use a versão da CLI do projeto. Dentro de `apps/web`, `npx supabase --version` deve dar `2.121.0` [CLI 2.121.0]. Guarde a referência do projeto (20 letras minúsculas) em `SUPABASE_PROJECT_ID`, que é o nome que o workflow já usa [S9 para o formato; `docs/arquitetura/infra.md`].

Não cole senhas, tokens, `CRON_SECRET`, `ASAAS_*` nem a chave `sb_secret_` em chat, em issue, em PR ou em arquivo versionado.

### Fase 0: pré-requisitos

1. Conta Supabase do owner, com organização e faturamento no Pro (D2).
2. Token pessoal de acesso à API e senha do Postgres, guardados só nos segredos do ambiente `production` do GitHub [REPO `infra.md`, passo 2].
3. Decisões D1 a D10 registradas.

### Fase 1: criar o projeto

Pelo painel do Supabase, ou pela CLI. A CLI pede a senha por flag, que fica no histórico do shell; prefira o painel ou uma variável preenchida com `read -rs`.

```bash
cd apps/web
npx supabase login
npx supabase projects create "workeasy-prod" \
  --org-id <ID_DA_ORGANIZACAO> \
  --region sa-east-1 \
  --size <tamanho> \
  --db-password "$DB_PASSWORD"
```

- `--size` tem vários valores aceitos (`micro`, `small`, `medium`, `large` etc.) [CLI 2.121.0]. O tamanho é decisão de custo e não foi conferido com o plano.
- Anote a referência do projeto e grave em `SUPABASE_PROJECT_ID` no ambiente `production` [REPO `infra.md`, passo 1].

### Fase 2: vincular

```bash
npx supabase link --project-ref "$SUPABASE_PROJECT_ID"
```

- Pede a senha do banco por prompt, ou aceita `-p` ou `SUPABASE_DB_PASSWORD` [S16].
- O vínculo é feito pela CLI, na pasta do projeto [S16].

### Fase 3: extensões e Vault (antes das migrations)

No painel, procure `pg_net`, `pg_cron` e `supabase_vault` e confirme que estão ativas. A página de `pg_net` diz para pesquisar a extensão no painel e ativá-la [S24]; o caminho exato do menu não foi conferido [incerto].

- Motivo: a migration 06 usa Vault, e nenhuma migration cria `supabase_vault` [REPO]. As migrations 01 e 08 usam `pg_cron` e `pg_net` [REPO].
- Se alguma não estiver disponível no plano escolhido, parar aqui.

### Fase 4: migrations

Pelo workflow, em **Actions > Publicar Supabase (migrations e Edge Functions) > Run workflow**, com `dry_run = true` e `deploy_functions = false`. Revise a lista. Depois repita com `dry_run = false`. O arquivo do workflow declara o ambiente `production`; se há aprovação manual, isso depende da regra do ambiente no GitHub, não conferida [REPO `infra.md`, passo 5; incerto].

Equivalente pela CLI:

```bash
npx supabase db push --linked --skip-vault --dry-run
npx supabase db push --linked --skip-vault --yes
```

- As flags vêm do `--help` da CLI 2.121.0 [CLI 2.121.0].
- Um projeto novo recebe as 36 migrations. Não editar migration já aplicada: crie outra (regra adotada pelo projeto; não localizada em `CLAUDE.md` nem em `AGENTS.md`).
- Se o `dry-run` ou a aplicação falhar em `pg_cron` ou em `vault`, voltar à fase 3.

### Fase 5: catálogo (seed), sem reset

O seed não entra no `db push` por padrão [S15; REPO workflow]. Ele é idempotente: 10 `insert ... on conflict do update` e nenhum `delete` ou `truncate` (grep de 2026-11-08). Por isso pode ser rodado de novo, com uma ressalva: `do update` sobrescreve o que foi alterado no banco. Não repetir depois de edição manual do catálogo sem revisar antes. Não usar `--include-seed` sem ensaio: a página não diz se o seed roda em transação [S15] [incerto].

Carregue o arquivo com `psql`, em uma única transação e parando no primeiro erro [S32, sem data; PostgreSQL 18.6]:

```bash
# A senha não vai para o histórico do shell. Digite quando pedido.
read -rs -p "Senha do Postgres: " DBPW; echo
# Conexão direta (IPv6). Sem IPv6 na rede, use o pooler de sessão: host `aws-[INDEX]-[REGION].pooler.supabase.com`, porta 5432, usuário `postgres.<ref>` [S29; o host exato vem do painel].
psql "postgresql://postgres:<senha-codificada-na-URL>@db.${SUPABASE_PROJECT_ID}.supabase.co:5432/postgres" \
  -1 -v ON_ERROR_STOP=1 -f supabase/seed.sql
unset DBPW
```

- `-1` (`--single-transaction`) envolve tudo em `BEGIN`/`COMMIT` e faz `ROLLBACK` no primeiro erro com `ON_ERROR_STOP` [S32].
- A senha precisa estar codificada na URL (percent-encoded), como a CLI exige para `--db-url` [S15]. A regra vale aqui por analogia [incerto].
- Conferir depois, no SQL editor, que roda como `postgres` [S17]:

```sql
select
  (select count(*) from public.areas)                 as areas,             -- esperado 44
  (select count(*) from public.occupations)           as ocupacoes,         -- esperado 1710
  (select count(*) from public.occupation_policies)   as politicas,         -- esperado 1710
  (select count(*) from public.neighborhoods)         as bairros,           -- esperado 96
  (select count(*) from public.occupations o
    where not exists (select 1 from public.occupation_policies p
                       where p.occupation_slug = o.slug))                   as sem_politica; -- esperado 0
```

- Os valores esperados vêm do cabeçalho do `seed.sql` [REPO]. No banco local de 2026-11-08 (catálogo já carregado), a consulta deu 44, 1710, 1710, 96 e 0. Ocupação sem política não pode ser tomada nem aprovada [REPO `ARQUITETURA.md`, Prestadores]; por isso o último número precisa ser zero.

### Fase 6: Auth no painel

Em **Authentication** do painel [REPO `infra.md`, passo 3]:

1. Site URL: o domínio de produção (D8).
2. Redirect URLs: a lista da seção 6.
3. SMTP próprio (D4) e limite de e-mails (ver 4.7).
4. Canal de SMS ou WhatsApp e provedor (D3). Se Twilio, preencher com as credenciais da conta de produção, direto no painel, nunca no arquivo.
5. Rate Limits (D5) [S11].
6. CAPTCHA, só depois de o app enviar `captchaToken` (D6) [S12].
7. Senha: se houver login por senha, mínimo de 8 e exigências fortes [S-senha]. Se não houver, manter o login por código.
8. Proteção contra senha vazada: Pro [S-senha].

Não usar `supabase config push` para isso (ver seção 6 e 9).

### Fase 7: Storage

- O bucket `provider-documents` já vem da migration 03 (privado, 10 MiB, tipos de arquivo). Conferir no painel que existe, está privado e tem o limite certo [REPO].
- Conferir o limite global de upload em Storage Settings. No Free o teto é 50 MB; no Pro, até 500 GB [S23].

### Fase 8: segredos das Edge Functions

Crie um arquivo **fora do repositório** com os valores de produção, a partir de `supabase/functions/.env.example` [REPO]:

| Nome | Valor de produção | Obs. |
|---|---|---|
| `SITE_URL` | `https://<domínio>` | Igual a `VITE_SITE_URL`. CORS e links de e-mail [REPO] |
| `ASAAS_API_KEY` | chave da conta raiz (produção) | Nunca no cliente |
| `ASAAS_BASE_URL` | `https://api.asaas.com/v3` | O padrão do código (`_shared/config.ts`) é o sandbox [REPO] |
| `ASAAS_WEBHOOK_TOKEN` | 32 a 255 caracteres | Mesmo valor cadastrado no webhook do Asaas [REPO `functions/README.md`] |
| `CRON_SECRET` | aleatório e longo (tamanho mínimo não localizado no repositório [incerto]) | Igual ao `cron_secret` do Vault (fase 10) [REPO] |
| `PRO_GRACE_DAYS` | ex.: `0` | Padrão 0, máximo 60 [REPO `ARQUITETURA.md`] |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION` | se o canal estiver ligado | Sem eles, mensagens ficam `skipped` [REPO] |
| `RESEND_API_KEY`, `EMAIL_FROM` | se o e-mail estiver ligado | Sem eles, ficam `skipped` [REPO] |
| `ANTHROPIC_API_KEY`, `ASSIST_HOURLY_LIMIT` | opcionais | Sem chave, a função responde 503 [REPO] |
| `ALLOW_DEV_ORIGINS` | **não definir** | Libera `localhost` no CORS; com sandbox é automático [REPO] |

Depois:

```bash
npx supabase secrets set --project-ref "$SUPABASE_PROJECT_ID" --env-file <arquivo-fora-do-repo>
```

- Os valores passam a valer na hora, sem redeploy [S6].
- Não definir nomes que começam com `SUPABASE_` [S6].
- Apagar o arquivo com segredos logo depois do `set`. No Linux, `shred -u <arquivo>`; a ferramenta de apagamento seguro depende do sistema operacional [incerto].

### Fase 9: publicar as Edge Functions

Pelo workflow, com `dry_run = false` e `deploy_functions = true`. O workflow publica `asaas-webhook` e `notify-dispatch` com `--no-verify-jwt`, e as outras 10 com verificação de JWT [REPO `deploy-supabase.yml`].

Equivalente manual (ver 4.4 sobre `--use-api`):

```bash
for fn in asaas-webhook notify-dispatch; do
  npx supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_ID" --no-verify-jwt --use-api
done
for fn in account-delete account-export asaas-onboard care-summary charges-create \
          payments-create payments-void quote-assist request-assist subscriptions-manage; do
  npx supabase functions deploy "$fn" --project-ref "$SUPABASE_PROJECT_ID" --use-api
done
```

- Não usar `--prune` (ver 4.4).

### Fase 10: Vault e agendador

Execute como `postgres` (SQL editor ou psql). Os valores não devem ficar no histórico do editor nem em chat; prefira um método que não grave o valor. A forma de passar uma variável para dentro do SQL do psql não foi conferida na seção de variáveis, que não consegui abrir até o fim [incerto].

```sql
select vault.create_secret(
  'https://<ref>.supabase.co/functions/v1/notify-dispatch',
  'notify_dispatch_url',
  'Despachante de notificações'
);
select vault.create_secret(
  '<mesmo valor de CRON_SECRET>',
  'cron_secret',
  'Segredo do agendador'
);
select name from vault.secrets order by name;  -- só nomes, sem valores
```

- A ordem dos argumentos (valor, nome, descrição) confere com os exemplos de [S7], reabertos em 2026-11-08.
- Enquanto as duas chaves não existirem, o agendador não chama a função e não erra [REPO `notifications.sql`].
- Quem tem login no banco consegue ler o `cron_secret` enquanto a requisição espera [S8]. Por isso só o owner deve ter login no banco de produção.
- O valor de `cron_secret` tem de ser igual ao `CRON_SECRET` da fase 8. Diferente, o despachante responde 401 `unauthorized` [REPO `notify-dispatch/handler.ts`].

### Fase 11: webhook do Asaas

Registrar, na conta raiz do Asaas, a URL `https://<ref>.supabase.co/functions/v1/asaas-webhook` com o mesmo `ASAAS_WEBHOOK_TOKEN` [REPO `infra.md`, passo 7; `ARQUITETURA.md`, Webhook]. As subcontas recebem o webhook pelo `asaas-onboard`. Esta fase é do fluxo de pagamento; detalhes ficam fora deste documento.

### Fase 12: primeiro admin

`admins` só aceita escrita pela service role ou pelo dono do banco [REPO]. Não há tela para criar admin. O caminho é:

1. O owner entra pelo app em `/entrar`, com o próprio e-mail ou telefone. Isso cria `auth.users` e, pelo trigger, `profiles` [REPO].
2. No SQL editor (que roda como `postgres` [S17]), ache o UUID:

```sql
select id, email, phone, created_at
  from auth.users
 order by created_at desc
 limit 5;
```

3. Insira o admin:

```sql
insert into public.admins (user_id) values ('<uuid do passo 2>');
select user_id, created_at from public.admins;
```

- Insert direto no SQL não passa por `log_event`: não aparece em `audit_log`. Não há trigger em `admins` [REPO]. Registrar a inserção à parte (data, quem, motivo).
- `is_admin()` consulta a tabela a cada chamada, com `auth.uid()` [REPO]. Não é preciso emitir token novo.
- Remover: `delete from public.admins where user_id = '<uuid>';` (também sem `audit_log`).
- O dono consegue inserir porque é o dono da tabela, e RLS não se aplica a ele sem `FORCE` [S31; REPO].

### Fase 13: testes de fumaça

Ver seção 8.

### Fase 14: advisors

```bash
npx supabase db advisors --linked --type security
npx supabase db advisors --linked --type performance
```

[CLI 2.121.0]. Triar cada achado. Alguns podem ser intencionais [S18].

---

## 8. Testes de fumaça

Rodar depois da fase 14. Nenhum teste de `supabase/tests/database` (pgTAP) ou de integração (`npm run test:integration`) roda contra produção: eles criam usuários e admins de teste (`supabase/tests/database/00_helpers.test.sql`, linha 189) e não foram feitos para banco de produção [REPO `ARQUITETURA.md`, Testes e CI].

| # | Teste | Como | Resultado esperado | Fonte |
|---|---|---|---|---|
| 1 | Migrations aplicadas | `npx supabase migration list --linked` | 36 aplicadas | [S15] (flags não conferidas) |
| 2 | Catálogo | consulta da fase 5 | 44, 1710, 1710, 96 e 0 | [REPO `seed.sql`] |
| 3 | Leitura pública do catálogo | cliente com a chave publicável, sem login, `select` em `areas` | linhas retornadas | [REPO `ARQUITETURA.md`] |
| 4 | Bloqueio de tabelas privadas | mesmo cliente, `select` em `payments`, `admins`, `provider_documents`, `profiles` | nenhuma linha ou erro de permissão | [REPO `ARQUITETURA.md`] |
| 5 | Colunas de pagamento | `select *` em `payments` | erro (regra da ARQUITETURA) | [REPO `ARQUITETURA.md`] [incerto: não testado] |
| 6 | Advisor de segurança | fase 14 | sem RLS desligada em tabela pública | [S18] |
| 7 | Agendamentos | `select jobname, schedule, active from cron.job order by jobname;` | 7 linhas, todas ativas (no banco local: notification-counts-retention, product-events-retention, workeasy-booking-reminders, workeasy-dispatch-notifications, workeasy-expire-booking-requests, workeasy-expire-pro-plans, workeasy-expire-stale) | [REPO] |
| 8 | Execuções | `select status, start_time from cron.job_run_details order by start_time desc limit 10;` após 2 min (colunas `status` e `start_time` confirmadas no banco local em 2026-11-08) | `succeeded`. Não prova entrega de mensagem | [S25] |
| 9 | Vault | `select name from vault.secrets order by name;` | `cron_secret` e `notify_dispatch_url`, sem valores | [REPO] |
| 10 | Despachante sem segredo certo | `curl -i -X POST "https://<ref>.supabase.co/functions/v1/notify-dispatch" -H "x-cron-secret: errado" -H 'Content-Type: application/json' -d '{}'` | 401, código `unauthorized` | [REPO `notify-dispatch/handler.ts`, linha 120] |
| 11 | Webhook sem token | `curl -i -X POST "https://<ref>.supabase.co/functions/v1/asaas-webhook" -H 'Content-Type: application/json' -d '{}'` | 401, código `invalid_token` | [REPO `asaas-webhook/handler.ts`, linhas 88-91] |
| 12 | Despachante com segredo certo | só com fila vazia, ou com contato do próprio owner. A função envia mensagem de verdade | 200 com resumo | [REPO] |
| 13 | Segredos | `npx supabase secrets list --project-ref "$SUPABASE_PROJECT_ID"` | só nomes, sem valores | [S6] |
| 14 | Código de entrada | owner entra em `/entrar` com e-mail e com telefone | código chega pelo SMTP e pelo canal decidido | [REPO] |
| 15 | Notificação | com contato confirmado do owner, uma proposta de teste | linha em `notifications` vai a `sent` ou a `skipped`, conforme credenciais | [REPO `ARQUITETURA.md`] |
| 16 | Site | `curl -sI https://<domínio>/` | cabeçalhos de segurança presentes | [REPO `infra.md`, passo 10] |
| 17 | Fluxo do produto | cadastro, pedido e proposta, como no plano de operação | sem erro | [REPO `docs/operacao/01-plano-de-45-dias-concierge.md`, linha 111] |

---

## 9. Divergências entre repositório e documentação

1. **Verificação de JWT.** Resolvida no repositório: `supabase/config.toml` (linhas 407-411) tem `[functions.asaas-webhook]` e `[functions.notify-dispatch]` com `verify_jwt = false`, como diz `supabase/functions/README.md` (linhas 34-36); `test/functions/functions-config.test.ts` confere. O workflow mantém `--no-verify-jwt` na publicação [REPO]. Documentos irmãos ainda dizem o contrário (item 12).
2. **Agendamentos.** `docs/ARQUITETURA.md` (seção Notificações) lista dois jobs de `pg_cron`. Há sete `cron.schedule` nas migrations e sete jobs no banco local: também `workeasy-booking-reminders`, `product-events-retention`, `workeasy-expire-pro-plans`, `workeasy-expire-booking-requests` e `notification-counts-retention` [REPO; consulta local].
3. **Funções.** A tabela de Edge Functions da `ARQUITETURA.md` cita 10 funções. Há 12 pastas: não aparecem `care-summary` nem `quote-assist` [REPO; `grep` sem resultado].
4. **Versão do Postgres.** `ARQUITETURA.md` (linha 76) diz "Postgres 15+ do Supabase". `config.toml` (linha 41) diz `major_version = 17`, com comentário que manda igualar ao projeto remoto [REPO].
5. **DEPLOY.md.** `infra.md` (linha 5) remete ao `DEPLOY.md`. O arquivo não existe no repositório [REPO].
6. **Canal de código.** `config.toml` (linha 282) diz "Sign-in by code over SMS/WhatsApp". O app pede código só por SMS (`services/auth.ts`, linha 33). WhatsApp pela Auth exige Twilio [S28].
7. **Documento de WhatsApp.** `docs/pesquisa/whatsapp-e-email.md` cita `auth-send-sms`, `SEND_SMS_HOOK_SECRETS`, `WHATSAPP_OTP_TEMPLATE`, `WHATSAPP_APP_SECRET` e `WHATSAPP_VERIFY_TOKEN`. Nada disso existe em `supabase/` (busca em 2026-11-08, sem resultado). É documento de proposta ou está desatualizado. Decidir antes da fase 8.
8. **Cabeçalho do agendador.** `.env.example` diz que o segredo vai no cabeçalho `x-cron-secret`. A migration 08 envia `Authorization: Bearer`. O handler aceita os dois [REPO]. Sem defeito funcional; a descrição está incompleta.
9. **Nomes das migrations.** `ARQUITETURA.md` cita `01_identity.sql`, `08_notifications.sql` etc. Os arquivos têm prefixo de data (`20261019000001_identity.sql`). Cosmético.
10. **Sandbox por padrão.** `ARQUITETURA.md` (linha 68) diz que `ALLOW_DEV_ORIGINS` "já vale com o Asaas sandbox". Se `ASAAS_BASE_URL` ficar no sandbox em produção, o CORS abre para `localhost`. Mitigação: fase 8.
11. **Deploy: workflow e passo manual diferem.** O workflow publica sem `--use-api` (empacotamento com Docker no runner `ubuntu-24.04`); a fase 9 deste documento usa `--use-api` em todas as funções. Escolher um dos dois caminhos e usá-lo nos dois [incerto: qual é o aceito pelo projeto].
12. **Documentos irmãos com afirmações antigas (não editados aqui).** `docs/RUNBOOKS.md` (linha 1047) diz que o `config.toml` não tem a seção `[functions]` e que o banco local tem seis agendamentos; `docs/pesquisa/whatsapp-e-email.md` (linha 673) diz o mesmo sobre `[functions.*]`. O `config.toml` atual tem a seção e o banco local tem sete jobs.
13. **Consistência com `DECISOES.md` e `juridico/`.** `DECISOES.md` (seção de modelo financeiro) estima infraestrutura em cerca de R$ 135/mês sem uso [estimativa do plano]; o Pro do Supabase começa em US$ 25 (página de 2026-11-08, sem conversão). Não há contradição, mas a conta em real não foi feita aqui. `juridico/08` (seção 10.3) e este documento descrevem backups por plano da mesma forma, e `juridico/08` (linha 504) deixa plano e retenção de logs como [PLANEJADO], como aqui. Neste documento, "Pro" é o plano do Supabase, não o plano Pro do WorkEasy (R$ 49/mês, `DECISOES.md`, D2). `juridico/06` diz ter lido o DPA do Supabase em 23/10/2026; esse DPA não foi reaberto aqui.

---

## 10. Riscos e itens em aberto

Nenhum destes itens foi corrigido. São registros para o owner e para quem for implementar.

- **A. Timeout do despachante.** `net.http_post` usa 2000 ms por padrão [S24]. A migration 08 não passa `timeout_milliseconds`. O lote pode levar até 100 s [REPO]. Não está documentado nas fontes abertas se a função segue rodando depois que o cliente de `pg_net` desiste [incerto]. Ensaiar em projeto de teste, medir e decidir: definir o timeout explicitamente ou reduzir o tamanho do lote.
- **B. Vault.** Nenhuma migration cria `supabase_vault`. A migration 06 depende dela [REPO]. Disponibilidade por plano: não citada [S7] [incerto]. Conferir na fase 3.
- **C. `pg_cron` e `pg_net` no plano.** Disponibilidade por plano não confirmada [S25, S24]. A migration 01 cria `pg_cron` com `schema pg_catalog`, e o schema no projeto hospedado não foi confirmado [incerto]. Um ensaio com `db push --dry-run` em projeto de teste do mesmo plano resolve.
- **D. Funções com `--use-api`.** Limite de 5 MB do empacotamento no servidor [S4]. Medir o bundle de `request-assist` e de `notify-dispatch` (dependências npm). [incerto: não confirmei a relação com `--use-api`].
- **E. Cold start e região das funções.** Sem número oficial [S30]. A página não diz se a chamada ao banco sai da região do projeto [S30]. Medir em ensaio.
- **F. `config push` com este arquivo.** Envia placeholder e código fixo se confirmado [CLI 2.121.0; REPO]. Não rodar. Se alguém rodar, `config diff` antes e nunca `--yes` (ver seção 6, D11).
- **G. `--skip-vault`.** A flag aparece no `--help` da CLI 2.121.0, mas não está na página de referência `db push` que consultei [S15 vs CLI 2.121.0]. Mantida no workflow. Conferir com a CLI do projeto.
- **H. SMTP e SMS no lançamento.** Padrões de 2 e-mails por hora e 30 SMS por hora no projeto [S11, S13]. Bloqueiam o cadastro em escala. Decisões D4 e D5.
- **I. Restauração não testada.** Backup de Pro existe [S3], mas não há restauração ensaiada. Um ensaio exige projeto de teste ou janela de manutenção [PLANEJADO].
- **J. Admin sem auditoria.** A inserção em `admins` não gera `audit_log` [REPO]. Registro manual (fase 12).
- **K. Vault e grants.** No banco local, `anon` e `authenticated` não podem ler `vault.decrypted_secrets` (consulta de 2026-11-08). No projeto hospedado, não conferido [incerto]. Conferir na fase 3 com uma consulta a `information_schema` ou ao `pg_roles`.
- **L. Invocações.** Pelo código, o `notify-dispatch` só é chamado quando há linha `queued` vencida ou `sending` parada [REPO, migration 08]. No teto de um disparo por minuto, são 43.200 chamadas em 30 dias, abaixo do limite do Free (500 mil) [S2] e do Pro. Isso é conta de raciocínio, não medição.
- **M. Validade do código.** `otp_expiry` de 3600 s (uma hora) [REPO, linha 247]. Não há valor recomendado nas fontes abertas (D9).
- **N. CAPTCHA.** Ligar sem o app enviar `captchaToken` quebra o login por código [S12; REPO `services/auth.ts`]. Fazer as duas mudanças juntas, em ambiente de ensaio.
- **O. Região fora do Brasil.** Se a região escolhida for fora do Brasil, a análise sobre transferência internacional de dados é matéria de parecer jurídico. [CONDICIONAL: depende de parecer]. Este documento não interpreta lei.
- **P. Retenção.** Logs do Pro: 7 dias [S2]. Quanto tempo manter logs, backups e registros de pagamento é decisão jurídica e operacional. [CONDICIONAL: depende de parecer].
- **Q. Divergências da seção 9.** Corrigir em mudanças próprias, uma por vez. Pelo `AGENTS.md`, o arquivo de confiança do CI (`ci.yml` e afins) não entra nessa lista.

---

## 11. O que não foi verificado

- Disponibilidade de `pg_cron`, `pg_net` e Vault por plano e por região.
- Preço por região, câmbio, impostos e forma de pagamento.
- Se a região pode ser trocada depois da criação.
- Existência de um caminho de menu para cada ação do painel (Authentication, Database, Extensions, Storage Settings). Só o nome geral aparece em `infra.md` e nas páginas.
- Comportamento de `--use-api`, de `deno.json` e de `deno.lock` no empacotamento.
- Comportamento do seed em transação dentro do `db push --include-seed`.
- Duração real do lote do `notify-dispatch` no ambiente do Supabase.
- Latência entre funções e banco.
- Conteúdo da seção de variáveis do psql (`:'nome'`) e a regra exata de codificação da senha na URL.
- Dois itens da lista de CAPTCHA: se cobre OTP e magic link.
- Se o login por senha está desligado no painel. O repositório não tem essa chave em `config.toml`.
- Nenhum comando foi executado contra projeto Supabase remoto. A CLI foi usada só com `--help`. No banco local (`127.0.0.1:54322`), houve só consultas de leitura em transação `READ ONLY` com `ROLLBACK`; o `seed.sql` não foi reexecutado. Host exato e IPv4 do pooler, e o DPA do Supabase, não conferidos.

---

## 12. Fontes

Todas abertas em 2026-11-08. "Sem data" = a página não tem data visível.

| Id | URL | O que foi lido | Limite |
|---|---|---|---|
| S1 | https://supabase.com/docs/guides/platform/regions | Lista de regiões; `sa-east-1` | Sem data; sem nota de disponibilidade |
| S2 | https://supabase.com/pricing | Planos, preços e quotas; retenção de logs; pausa | Sem data; preço em dólar; PITR lido em resumo |
| S3 | https://supabase.com/docs/guides/platform/backups | Backups diários, PITR, restauração | Sem data |
| S4 | https://supabase.com/docs/guides/functions/limits | Duração, CPU, memória, bundle, funções por projeto | Sem data |
| S5 | https://supabase.com/docs/guides/functions/deploy | `verify_jwt` em `config.toml` | Sem data; não mostra padrão |
| S6 | https://supabase.com/docs/guides/functions/secrets | `secrets set`, reservas `SUPABASE_`, variáveis injetadas | Sem data |
| S7 | https://supabase.com/docs/guides/database/vault | `create_secret`, `update_secret`, `decrypted_secrets` | Sem data; sem planos |
| S8 | https://supabase.com/docs/guides/functions/schedule-functions | Exemplo pg_cron + pg_net; aviso sobre roles | Sem data |
| S9 | https://supabase.com/docs/reference/cli/supabase-config-push | Descrição de `config push` | Sem data; lida em resumo |
| S10 | https://supabase.com/docs/guides/platform/going-into-prod | Checklist de produção; limites de Auth; branching no Pro | Data de 3 Sep 2024 numa nota sobre o limite de e-mails, não de publicação; reaberta em 2026-11-08 |
| S11 | https://supabase.com/docs/guides/auth/rate-limits | Limites de Auth, escopo e ajuste | Sem data |
| S12 | https://supabase.com/docs/guides/auth/auth-captcha | Provedores; formulários; `captchaToken` | Sem data; sem planos |
| S13 | https://supabase.com/docs/guides/auth/auth-smtp | SMTP embutido e próprio; limites | Sem data; plano Free não citado |
| S14 | https://supabase.com/docs/guides/platform/network-restrictions | Escopo das restrições; padrão | Sem data; plano não citado |
| S15 | https://supabase.com/docs/reference/cli/supabase-db-push | Flags de `db push`; seed só com `--include-seed` | Sem data; `--skip-vault` ausente |
| S16 | https://supabase.com/docs/reference/cli/supabase-link | Senha: prompt, flag, `SUPABASE_DB_PASSWORD` | Sem data |
| S17 | https://supabase.com/docs/guides/database/postgres/roles | `postgres`, `service_role`, SQL do painel como `postgres` | Sem data; `anon` e `authenticated` sem detalhe |
| S18 | https://supabase.com/docs/guides/database/database-advisors | Checks dos advisors; acesso pelo painel, MCP e CLI | Sem data; planos não citados |
| S19 | https://supabase.com/docs/guides/deployment/branching | Branches a partir de migrations; persistentes | Sem data; planos não citados |
| S20 | https://supabase.com/docs/reference/cli/supabase-functions-deploy | Flags de deploy, incluindo `--no-verify-jwt` e `--use-api` | Sem data; versão não citada |
| S21 | https://supabase.com/docs/reference/cli/supabase-projects-create | Flags de criação | Sem data; regiões não listadas na página |
| S22 | https://supabase.com/docs/guides/storage/security/access-control | RLS em `storage.objects`; bucket público | Sem data; URL assinada não tratada |
| S23 | https://supabase.com/docs/guides/storage/uploads/file-limits | Limites por plano; limite do bucket | Sem data |
| S24 | https://supabase.com/docs/guides/database/extensions/pg_net | Assinatura de `net.http_post`; timeout padrão; retenção | Sem data; plano não citado |
| S25 | https://supabase.com/docs/guides/cron | Schema `cron`; `cron.job`; `cron.job_run_details` | Sem data; plano e fuso não citados |
| S26 | https://supabase.com/docs/guides/api/securing-your-api | Exposição automática e default privileges; RLS | Sem data |
| S27 | https://supabase.com/docs/guides/auth/passwords | Aberta; não trata de política de senha | Sem data; sem conteúdo útil para o tema |
| S28 | https://supabase.com/docs/guides/auth/phone-login | Provedores de SMS; WhatsApp só com Twilio | Sem data |
| S29 | https://supabase.com/docs/guides/database/connecting-to-postgres | Conexão direta, sessão e transação; IPv6 e IPv4 | Sem data |
| S30 | https://supabase.com/docs/guides/functions/architecture | Cold start; onde rodam as funções | Sem data; trechos contraditórios |
| S31 | https://www.postgresql.org/docs/current/ddl-rowsecurity.html | Dono contorna RLS; `FORCE`; `BYPASSRLS` | PostgreSQL 18.6 |
| S32 | https://www.postgresql.org/docs/current/app-psql.html | `-v`, `-1`, `ON_ERROR_STOP` | PostgreSQL 18.6; a seção de variáveis e de ambiente não foi lida até o fim |
| S-senha | https://supabase.com/docs/guides/auth/password-security | 8 caracteres; exigências; proteção contra senha vazada, Pro | Sem data |
| CLI 2.121.0 | Saída local de `--help`: `db push`, `config push`, `config diff` (citada), `secrets set`, `projects create`, `db advisors`, `functions deploy` | Flags e descrições | Versão local, lida em 2026-11-08 |

Reabertas em 2026-11-08 nesta revisão: S1, S2, S3, S4, S5, S6, S7, S8, S10, S11, S12, S13, S17, S18, S23, S24, S28, S29, S30 e S-senha. Não reabertas: S9, S14, S16, S19, S21, S22, S25, S26, S27 e S31; S15 e S20 tiveram as flags conferidas no `--help` da CLI; S32 teve `-1` e `-v` conferidos no `psql --help`.

Página aberta sem conteúdo útil para o tema: `supabase.com/docs/guides/database/extensions/pg_cron` (apenas um título e um link). A política de senha está em `password-security` (S-senha), não em `passwords` (S27).

**Repositório** (caminhos citados no texto): `apps/web/supabase/config.toml`, `apps/web/supabase/functions/deno.json`, `apps/web/supabase/functions/README.md`, `apps/web/supabase/functions/_shared/config.ts`, `apps/web/supabase/functions/asaas-webhook/handler.ts`, `apps/web/supabase/functions/notify-dispatch/handler.ts`, `apps/web/supabase/migrations/*` (todas as 16), `apps/web/supabase/seed.sql`, `apps/web/supabase/tests/database/00_helpers.test.sql`, `apps/web/docs/ARQUITETURA.md`, `apps/web/docs/arquitetura/infra.md`, `apps/web/docs/pesquisa/whatsapp-e-email.md`, `apps/web/docs/operacao/01-plano-de-45-dias-concierge.md`, `apps/web/services/auth.ts`, `apps/web/package.json`, `.github/workflows/deploy-supabase.yml`.
