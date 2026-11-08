# Política de Segurança da Informação e Continuidade do WorkEasy

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| Campo | Conteúdo |
|---|---|
| Versão | 2026-10-rascunho (mesma etiqueta de `apps/web/config/legal.ts`) |
| Data de vigência | [DATA DE VIGÊNCIA] |
| Situação do produto em 08/11/2026 | Protótipo. Não está implantado em produção e não tem usuários reais. |
| Empresa operadora | [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO]. A empresa ainda não existe: estes campos são marcadores. |
| Contato para comunicar falha de segurança | Relatório privado pelo GitHub (aba Security, conforme `.github/SECURITY.md`; a ativar no repositório) ou [E-MAIL DO SAC] |
| Encarregado pelo tratamento de dados | [E-MAIL DO ENCARREGADO] |

## Como ler

1. Esta política descreve o que o WorkEasy faz **hoje**, no código do repositório. O que não existe aparece na coluna "Planejado / lacuna".
2. Nas tabelas de controle, a coluna **Implementado** indica o arquivo, a migração ou a função onde o controle está. Se a coluna estiver vazia, o controle ainda não existe.
3. Marcas usadas no texto:
   - **[PLANEJADO]**: não existe no código nem na operação.
   - **[CONDICIONAL: depende de parecer]**: depende de interpretação jurídica que ainda não foi dada.
   - **[incerto]**: não foi confirmado em fonte aberta nesta data. A lista completa está em "Pontos para o advogado".
4. Este documento não diz que o WorkEasy é seguro, certificado ou aderente a uma norma. Não há certificação de segurança. A ordem dos temas segue a ISO/IEC 27002:2022 apenas como referência de organização (F14).
5. Os códigos F1 a F16 remetem a "Fontes consultadas". Os códigos R1 a R13 remetem aos arquivos do repositório. Trechos entre aspas de páginas da web foram lidos por ferramenta e devem ser conferidos no original antes de citação formal.
6. Caminhos de arquivo são relativos a `apps/web/`, salvo indicação. Os arquivos de `.github/` ficam na raiz do repositório (R11, R13). `ARQUITETURA.md` (R2) é o contrato técnico do projeto.

## 1. Objetivo e escopo

1.1. Esta política define como o WorkEasy protege informações, dados pessoais e sistemas, e como a operação responde a falhas.

1.2. Vale para a empresa operadora, para quem administra a plataforma e para os fornecedores que tratam dados em nome dela (seção 11).

1.3. Não cobre o aparelho dos usuários.

1.4. Documentos relacionados: `03-politica-de-privacidade.md` (seção 9, Segurança), `06-ripd-relatorio-de-impacto.md`, `07-registro-das-operacoes-de-tratamento.md` e o plano de resposta a incidentes (documento 08, `08-plano-de-resposta-a-incidentes.md`, já existe nesta pasta).

## 2. Situação em 08/11/2026

| Fato | Fonte |
|---|---|
| O MVP está no repositório (branch `main`), mas não está implantado. | Estado do projeto |
| Não há projeto Supabase de produção configurado. `supabase/config.toml` é a configuração de desenvolvimento local (`project_id = "workeasy"`). | R1 |
| Não há teste contra os serviços reais de pagamento, WhatsApp e e-mail. | Estado do projeto |
| A operação tem um único operador, com acesso administrativo a todos os serviços. | Estado do projeto |

2.1. As medidas das seções 3 a 10 valem para o código e para o ambiente de desenvolvimento. Antes de receber dados reais, as prioridades da seção 17 precisam estar concluídas.

## 3. Papéis e responsabilidades

| Papel | Quem hoje | Responsabilidade | Ponto do código |
|---|---|---|---|
| Operador de segurança | Fundador | Aprovar mudanças, gerir acessos, responder a incidentes e manter esta política. | [PLANEJADO]: nomeação formal por escrito |
| Administrador do app | Contas listadas em `public.admins` | Revisar prestadores, documentos, pagamentos e pedidos de dados. As ações administrativas gravam `audit_log`. | `admins`, `is_admin()` (R2, Identidade e Administração) |
| Usuário | Cliente, prestador, família, cuidador | Guardar o próprio código de acesso e o aparelho. | Login por código (seção 5) |
| Fornecedor | Ver seção 11 | Tratar dados conforme contrato e política própria. | [incerto]: aceite dos termos dos fornecedores (documento 07, Q28) |

## 4. Controle de acesso e isolamento de dados

| Controle | Implementado (com o ponto do código) | Planejado / lacuna |
|---|---|---|
| Toda tabela de `public` tem RLS ligada. | `supabase/tests/database/12_rls_matrix.test.sql` (R5): "every table in public has RLS enabled". | — |
| Toda tabela tem política explícita. Exceção declarada: `assist_usage`, sem política e sem grant. Só `take_assist_quota` a usa. | R5; R2, Pedidos e propostas. | — |
| Políticas de escrita ligadas a `auth.uid()`, `is_admin()` ou função de posse. | R5: "no write policy is open". | — |
| Usuário anônimo não escreve em nenhuma tabela, nem por coluna. | R5. | — |
| Usuário anônimo lê só o catálogo: `areas`, `neighborhoods`, `occupation_policies`, `occupations` e `platform_settings`. Chaves internas de `platform_settings` ficam ocultas. | R5; R2, Catálogo. | Conferir o mesmo comportamento no projeto hospedado quando existir. |
| Usuário anônimo só pode executar funções da lista pública de oito (`search_providers`, `get_provider_page`, `slug_available`, `available_slots`, `get_quote_by_token`, `respond_quote`, `is_provider_approved`, `is_admin`). O teste reprova qualquer outra função pública executável por anônimo. | R5. | — |
| Funções `security definer` com `search_path` fixo. | R5: "every security definer function pins search_path to empty (or pg_catalog, public)". | — |
| Funções da service role não são executáveis por usuário: `claim_notifications`, `anonymize_user`, `store_provider_payment_secret`, `get_provider_payment_secret`, `take_assist_quota`. | R5: "service-role RPCs are not executable by users". | — |
| Prestador lê e escreve só o que é seu. Outro prestador, cliente e anônimo não leem os dados dele. | R5 (blocos de `provider_a`, `provider_b`, `client_a`, `admin` e `anon`). | — |
| Lista de administradores só é escrita pela service role. | R2, Identidade; R5: "a client cannot make himself admin". | Sem inventário nominal de administradores [PLANEJADO]. |
| Acesso aos painéis do Supabase, GitHub, Asaas, domínio e e-mail. | — | Sem inventário nominal nem revisão periódica [PLANEJADO]. |
| Administrador entra pelo mesmo login por código dos usuários. | `services/auth.ts` (R7). | Sem segundo fator para administrador (seção 5). |

## 5. Autenticação

| Controle | Implementado (com o ponto do código) | Planejado / lacuna |
|---|---|---|
| Login por código de 6 dígitos enviado por e-mail ou SMS. | `services/auth.ts` (`signInWithOtp`, `verifyOtp`); `config.toml`: `[auth.email] otp_length = 6` (R1). | Validade do código: `otp_expiry = 3600` (1 hora) na configuração local. Valor de produção não definido [PLANEJADO]. |
| Cadastro por senha. | Não existe no código do app: não há `signInWithPassword` nem `signUp` fora dos testes de integração (R7). | No projeto hospedado, desligar o cadastro por senha ou exigir confirmação (R2, Notificações) [PLANEJADO]. A configuração local ainda tem `enable_signup = true` e `minimum_password_length = 6`. |
| Mensagem só para contato confirmado. | Só `auth.users.phone` com `phone_confirmed_at` e e-mail com `email_confirmed_at` recebem notificação (R2, Notificações). | — |
| Conta anônima. | `enable_anonymous_sign_ins = false` (R1). | — |
| Validação do token no servidor. | `supabase/functions/_runtime/supabase.ts`, função `authenticate`: `auth.getUser(token)` (R8). | — |
| Rotação do refresh token. | `enable_refresh_token_rotation = true`, `refresh_token_reuse_interval = 10` (R1, local). | Valores de produção [PLANEJADO]. |
| Limite de tentativas. | `[auth.rate_limit]` local: 30 entradas e 30 verificações por 5 minutos e por IP; 2 e-mails por hora (R1). | Valores do projeto hospedado [incerto]. |
| Proteção contra robôs (CAPTCHA). | `[auth.captcha]` comentado: não ativo (R1). | [PLANEJADO]. |
| Segundo fator (MFA) para usuários e administradores. | `[auth.mfa.totp]` com `enroll_enabled = false` e `verify_enabled = false` (R1). | [PLANEJADO]. Ver a seção 15 para a conta do operador. |
| Prazo e inatividade de sessão. | `[auth.sessions]` comentado (R1). | [PLANEJADO]. |
| Sessão guardada no navegador. | `lib/supabase.ts`: `persistSession: true`, ou seja, o token fica no navegador (R7). | Um script injetado na página poderia ler a sessão. Cabeçalhos de segurança: seção 10. |
| Dados de teste de login. | `[auth.sms.test_otp]` aceita o número `5511999990000` com o código `123456`. `[auth.sms.twilio]` tem valores de exemplo (R1). | O próprio `config.toml` avisa que o bloco de teste não pode ir ao projeto hospedado, e que o provedor de SMS do projeto hospedado é configurado no painel. Checklist de produção [PLANEJADO]. |
| Provedor real de SMS. | Não escolhido. | [PLANEJADO] (documento 07, Q31). |

## 6. Segredos e chaves

| Controle | Implementado (com o ponto do código) | Planejado / lacuna |
|---|---|---|
| O navegador recebe só a URL do Supabase e a chave publicável. | `lib/supabaseKey.ts` (`checkPublicKey`) aceita `sb_publishable_…` ou JWT com `role: anon` e recusa qualquer outra chave (R7). `.env.example` explica a regra (R9). | — |
| Chaves secretas ficam só nas funções do servidor. | R2, Variáveis de ambiente: `SUPABASE_SERVICE_ROLE_KEY`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `WHATSAPP_TOKEN`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `CRON_SECRET`. | — |
| Teste que reprova segredo no código do cliente. | `test/claims-guard.test.ts` (R4) reprova `service_role`, `sb_secret_`, `ASAAS_API_KEY`, `WHATSAPP_TOKEN`, `RESEND_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` e outros. Reprova também segredo em variável `VITE_*` de arquivo `.env*`. | O teste lê o código-fonte, não o pacote final. As pastas `docs/` e `test/` ficam fora de todas as varreduras. `supabase/` e `scripts/` ficam fora só da varredura de segredos do cliente; entram na varredura de alegações. |
| Arquivos `.env` ignorados pelo Git. | `apps/web/.gitignore` ignora `.env` e `.env.*`; só `.env.example` e `.env.native` ficam fora dessa regra (R9). | — |
| Chave da conta de recebimento de cada prestador. | Guardada no Vault do Supabase pelas RPCs `store_provider_payment_secret` e `get_provider_payment_secret`, só para `service_role` (R6, `06_payments.sql`). A coluna `api_key_secret_id` não é lida pelo usuário. | Sem procedimento escrito de rotação [PLANEJADO]. |
| Verificação do webhook do Asaas. | `_shared/secrets.ts` (R8): comparação em tempo constante (`timingSafeEqual`) e token por subconta derivado por HMAC-SHA256 (`deriveSubaccountToken`). | Trocar `ASAAS_WEBHOOK_TOKEN` exige registrar de novo o webhook de cada subconta (R2). |
| Verificação do agendador. | `notify-dispatch/handler.ts` (R8) aceita `x-cron-secret` ou `Authorization: Bearer`. Sem `CRON_SECRET`, responde 503. | — |
| Varredura do pacote de produção. | `.github/workflows/web-ci.yml` (R11, só manual), passo "No secrets in the bundle": `grep -rIiE "gemini|api_key" dist/`. `.github/workflows/deploy-web.yml` (R13) procura `sb_secret_` e `SUPABASE_SERVICE_ROLE` em `dist/` antes de publicar. | O padrão do web-ci é estreito: não procura `service_role`, `sb_secret_` nem `ASAAS`. O do deploy não procura `ASAAS`, `WHATSAPP` nem `RESEND`. [PLANEJADO]: ampliar. |
| Varredura de segredos no repositório. | Nos workflows não há gitleaks, trufflehog nem CodeQL (R11). | [PLANEJADO]. |
| Segredos de publicação no GitHub. | `deploy-supabase.yml` e `deploy-web.yml` leem `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD` e `CLOUDFLARE_API_TOKEN` do ambiente `production` (R13). Não ficam no código. | Aprovação de revisores do ambiente não verificada [incerto]. Rotação sem procedimento escrito [PLANEJADO]. |

## 7. Proteção dos dados pessoais

| Controle | Implementado (com o ponto do código) | Planejado / lacuna |
|---|---|---|
| Documentos e selfie ficam em bucket privado. | Bucket `provider-documents`: `public = false`, limite de 10 MB, só JPEG, PNG, WEBP, HEIC e PDF (R6, `03_providers.sql`). Leitura só pelo dono e por administrador. Envio só por prestador. Sem `UPDATE`. | Prazo de guarda e regra de eliminação desses arquivos não definidos [PLANEJADO]. Ver documento 06 e a pergunta P8. |
| O dono só apaga arquivo que ainda não foi revisado. | Função `private.document_object_locked` na política de `delete` (R6). | — |
| O número do cartão não passa pelo app. | Pagamento na página do Asaas (`invoiceUrl`). `creditCard*` é removido de `payments.raw` e de `payment_events.payload` (R2, Edge Functions). | — |
| Dados do pagador fora de consulta direta. | `payments` tem `select` por coluna, sem `raw` (R6, `06_payments.sql`). Teste: "authenticated cannot select payments.raw" (R5). | Administrador lê o payload por `admin_get_payment_raw`, que grava `audit_log`. |
| Cuidado sem diagnóstico e sem medicação. | Tabelas `care_recipients` e `daily_reports` (R6, `09_care.sql`). Campos de texto livre existem (`preferences`, `emergency_contact`, `meals`, `activities`, `mood`, `notes`). | Se esses campos forem dado de saúde, o tratamento depende de parecer [CONDICIONAL: depende de parecer]. Pergunta P9. |
| Localização no check-in. | `checkins` guarda `lat` e `lng` (R6, `09_care.sql`). Consentimento de finalidade `location` existe (R6, `consents`). | — |
| Contato só entre as partes de um atendimento. | `private.is_counterpart` e `private.shares_contact` (R6, `05_bookings.sql`), e só com dados escritos pelo servidor. | — |
| Histórico de consentimento. | `consents`: só insert, pelo próprio usuário. `user_id`, `at` e `created_at` vêm do servidor (R6, `10_privacy_audit.sql`). | — |
| Pedido de cópia e de exclusão. | Tabela `data_requests`; `account-export` (JSON); `account-delete` (R8). | Prazo de atendimento do pedido [PLANEJADO]. |
| Exclusão de conta na ordem certa. | `account-delete`: 1) apaga a pasta de documentos no Storage; 2) `anonymize_user`, que recusa com `storage_not_empty` enquanto houver arquivo; 3) apaga o usuário no Auth. Pagamentos e atendimentos ficam anonimizados (R8, R6; R2, LGPD e auditoria). | Apagar uma casa leva junto os plantões dela, inclusive os de cuidador confirmado, sem avisar o cuidador (R2). Lacuna de produto. |
| Mensagens não usam o telefone digitado no perfil. | `profiles.phone` nunca é destino de mensagem (R2, Notificações). | — |
| Logs de erro sem corpo de requisição. | `_runtime/supabase.ts`, função `logError`: grava só nome e mensagem do erro (R8). | A mensagem não é filtrada e pode conter dado. Retenção dos logs do Supabase depende do plano [incerto] (documento 03, Q13). |
| Dados no aparelho. | Sessão em `localStorage` (`persistSession`, R7). Rascunho do pedido em `sessionStorage` (`lib/requestDraft.ts`, R7). | Sem limpeza forçada no aparelho [PLANEJADO]. |
| Criptografia em repouso e em trânsito. | — | A página de responsabilidade compartilhada do Supabase diz que os dados são criptografados em repouso e em trânsito pelo Supabase (F8). Não há verificação independente. A página de backups não diz se as cópias são criptografadas (F7). [incerto] |
| Cópias de segurança cobrem os arquivos do Storage. | — | Não cobrem. A página de backups diz que os backups do banco não incluem objetos guardados pela API de Storage (F7). Os documentos de `provider-documents` não têm cópia própria. [PLANEJADO]: cópia própria, com procedimento e teste. |

## 8. Pagamentos: controles técnicos

| Controle | Implementado (com o ponto do código) | Planejado / lacuna |
|---|---|---|
| O evento do Asaas é só uma dica. | `asaas-webhook` relê a cobrança no Asaas antes de agir. Cobrança que não existe naquela conta é ignorada e registrada em `audit_log` (R2, Webhook). | — |
| Webhook com token próprio por subconta. | URL com `?acct=<provider_id>` e token derivado (R8, `_shared/secrets.ts`). | Subcontas criadas antes dessa regra precisam ser reconfiguradas (R2). |
| Eventos repetidos não geram efeito duplo. | `payment_events.asaas_event_id` é único (R2, Pagamentos). Só uma cobrança `pending` por atendimento (índices únicos parciais, R6). | — |
| Eventos fora de ordem. | `payments.status` só avança. `refunded` é final (R2, Webhook). | — |
| Pagamento recebido depois do cancelamento. | A função pede o reembolso total (só para cartão e Pix). Se o Asaas recusa, grava `payment.refund_failed` em `audit_log` e a cobrança aparece em `/admin/pagamentos` (R2). | Reembolso recusado depende de tratamento manual. |
| Retenção de valores (escrow) e comissão. | `platform_settings.escrow_enabled = false` e `commission_enabled = false` por padrão (R2, Catálogo). | [CONDICIONAL: depende de parecer]: qualquer cláusula sobre retenção ou comissão. |
| Chave da conta de recebimento. | Ver seção 6. | — |

## 9. Registros, auditoria e monitoramento

| Controle | Implementado (com o ponto do código) | Planejado / lacuna |
|---|---|---|
| Trilha de auditoria só de inserção. | `audit_log` (R6, `10_privacy_audit.sql`): triggers `audit_log_no_update_delete` e `audit_log_no_truncate` lançam exceção. `update`, `delete` e `truncate` estão revogados de todos os papéis, inclusive `service_role`. `insert` está revogado de `anon` e `authenticated`. | Quem tem acesso de administrador ao banco pode, em tese, alterar o trigger. Isso não é prova externa de imutabilidade. Exportação para armazenamento externo [PLANEJADO]. |
| Escrita só por função. | `log_event` e `private.audit`. Usuário só registra ações `client.*`, com até 4 KB e 60 registros por minuto (R6). | — |
| Leitura do log. | Só administrador (`audit_log_select_admin`). Tela `/admin/auditoria` (R2, Rotas). | — |
| Ações de dinheiro e de administração gravam o log. | R2, Edge Functions e Administração. | — |
| Alerta automático. | Não existe. | [PLANEJADO]: aviso ao operador em falha de webhook, reembolso recusado e pico de tentativas de login. |
| Logs do Postgres e de conexão. | Não configurados no repositório. A configuração do projeto hospedado não foi verificada [incerto]. | Guia "Postgres connection logging" aparece na lista de guias do Supabase (F10). [PLANEJADO]. |

9.1. **Marco Civil da Internet.** Se a empresa for enquadrada como provedora de aplicações de internet constituída como pessoa jurídica, que exerce atividade de forma organizada, profissional e com fins econômicos, o art. 15 da Lei 12.965/2014 manda manter os registros de acesso sob sigilo, em ambiente controlado e de segurança, pelo prazo de 6 meses, nos termos do regulamento (F2). Registro de acesso é o conjunto de informações sobre data e hora de uso de uma aplicação a partir de um endereço IP (art. 5º, VIII; F2). O documento 03 (Q7) afirma que o código não grava IP. Uma busca por campos de IP (`x-forwarded-for`, `cf-connecting-ip`, `remote_addr`, `ip_address`) em `supabase/`, `lib/` e `services/` não achou nada em 08/11/2026. A busca não é exaustiva, e a plataforma do Supabase pode registrar IP por conta própria [incerto]. **[CONDICIONAL: depende de parecer].** Quem guarda os registros e onde: [PLANEJADO].

## 10. Vulnerabilidades, dependências e testes

| Controle | Implementado (com o ponto do código) | Planejado / lacuna |
|---|---|---|
| CI do site. | `.github/workflows/web-ci.yml` (R11), só por disparo manual (`workflow_dispatch`): lint com `--max-warnings 0`, typecheck, testes e build. Nenhum push ou pull request o dispara. | Gate automático antes de mesclar [PLANEJADO]. |
| CI do banco. | Job `database`: sobe a stack local, roda `supabase test db` (pgTAP, inclusive a matriz de RLS), testes de integração contra a stack local do Supabase (não o projeto hospedado) e confere os tipos gerados (R11, no mesmo workflow manual). | — |
| CI das funções. | Job `functions`: `deno check --frozen` e `deno lint` com Deno 2.9.6 (R11). | — |
| Permissão mínima no CI. | `permissions: contents: read` em `web-ci.yml` e `web-release.yml` (R11). | — |
| Versões travadas. | `package-lock.json` com `npm ci`; `deno.lock` com `--frozen` (R11, R3). | — |
| Atualização de dependências. | `.github/dependabot.yml` (R13): atualização semanal dos pacotes npm de `apps/web` e mensal das versões de Actions. Não há `npm audit` no CI. | Alertas de vulnerabilidade do Dependabot não verificados nas configurações do repositório [incerto]. Varredura de vulnerabilidades no CI [PLANEJADO]. |
| Análise estática de segurança. | Não há CodeQL nem outra ferramenta. | [PLANEJADO]. |
| Teste de invasão e revisão externa. | Não há. Nenhuma auditoria independente ou teste de invasão está registrado (documento 03, 9.2). | [PLANEJADO]: antes de dados reais. |
| Cabeçalhos de segurança (CSP, HSTS e outros). | `public/_headers` (R10) define `Content-Security-Policy` (com `default-src 'self'` e `frame-ancestors 'none'`), `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options: DENY` e políticas de cache. `index.html` não tem CSP. `scripts/check-headers.mjs`, citado por `deploy-web.yml`, confere o site gerado (R13). | Testado só em Chromium com servidor local que aplica o arquivo; não testado no Cloudflare Pages (R13). Ver seção 17. |
| Build para lojas. | `web-release.yml` (manual ou por tag `v*`) gera APK de depuração, app iOS só para simulador e instaladores de desktop sem assinatura de código, conforme o próprio workflow (R11). | Assinatura para lojas [PLANEJADO]. |
| Workflow da API. | `.github/workflows/ci-security.yml` roda, só por disparo manual, testes de `services/api`, que é código do dono e está fora do escopo do site (R11). | — |

10.1. **Mapeamento com o OWASP Top 10:2025 (F13).** Serve como lista de checagem, não como certificação.

| Categoria | Como o projeto trata hoje | Lacuna |
|---|---|---|
| A01 Broken Access Control | RLS em todas as tabelas e matriz de testes por papel (seção 4). | Revisão externa [PLANEJADO]. |
| A02 Security Misconfiguration | Configuração local com comentários de endurecimento (R1); cabeçalhos em `public/_headers` (seção 10). | Checklist de produção (seção 17). CSP não testada na hospedagem. |
| A03 Software Supply Chain Failures | Lockfiles e `npm ci` (R11); Dependabot semanal (R13). | Sem varredura de vulnerabilidades no CI. |
| A04 Cryptographic Failures | Segredos fora do cliente; Vault para a chave de subconta (seção 6). | Criptografia declarada pelo Supabase, não verificada (seção 7). |
| A05 Injection | Acesso ao banco pela API do Supabase com RLS; funções com `search_path` fixo (R5). | Sem teste de injeção [PLANEJADO]. |
| A07 Authentication Failures | Login por código e limites de tentativa locais (seção 5). | MFA, CAPTCHA e segundo fator para administrador. |
| A09 Security Logging and Alerting Failures | `audit_log` só de inserção (seção 9). | Sem alerta automático. |
| A06 Insecure Design e A08 Software or Data Integrity Failures | Regras de negócio no banco e nas funções, não na tela (R2, "O servidor decide"). | — |
| A10 Mishandling of Exceptional Conditions | O webhook responde 200 para erro que se repetiria e 500 para falha transitória (R2, Webhook). | — |

10.2. **ASVS 5.0.0 (F12).** Lista de requisitos para revisar o site e as funções. Não foi aplicada: [PLANEJADO].

## 11. Fornecedores

| Fornecedor | O que faz | Dados que recebe | Divisão de responsabilidade | Situação |
|---|---|---|---|---|
| Supabase | Banco, Auth, Storage, Edge Functions e agendador (pg_cron). | Todos os dados da plataforma. | Infraestrutura e backups do banco, não dos arquivos do Storage (F7). RLS, chaves e dados são do cliente (F8). | Conta de produção [PLANEJADO]. Contrato e suboperadores: documento 07, S1. |
| Asaas | Cobrança, subcontas, divisão de valores e webhook. | Dados fiscais e de contato de prestadores e pagadores. | Política de segurança do Asaas não aberta nesta sessão (acesso negado, documento 03). | [incerto]. |
| Meta (WhatsApp Cloud API) | Mensagens por modelo aprovado. | Telefone e texto do modelo. | Termos não abertos nesta sessão. Ver documento 07. | [PLANEJADO]: sem credencial, as mensagens ficam como `skipped` (R2). |
| Resend | E-mail transacional. | E-mail e texto da mensagem. | Termos não abertos nesta sessão. Ver documento 07. | [PLANEJADO]: sem credencial, `skipped` (R2). |
| Anthropic | Assistente de pedidos (`request-assist`). | Texto livre digitado pelo cliente. | Termos não abertos nesta sessão. | Sem chave, a função responde 503 (R2). Uso em produção [PLANEJADO] (documento 03, seção 12). |
| Cloudflare | Hospedagem do site: `deploy-web.yml` publica `dist/` no Cloudflare Pages, manualmente e só a partir de `main` (R13). | Arquivos estáticos do site. As variáveis `VITE_*` são públicas por desenho. | Cloudflare cuida da segurança física dos data centers; o cliente configura os serviços (F15, FAQ APRA, não é a página geral). | Conta, plano e termos não verificados [incerto]. O documento 03 ainda diz que não há uso (ver I6). |
| GitHub | Repositório e CI. | Código e configurações. | Contas com 2FA disponível (F16). | Ver seção 15. |

11.1. Regra da operação: contratar apenas fornecedor cujos termos de segurança e de tratamento de dados tenham sido lidos e aceitos, e registrar esse aceite. Hoje o registro está no documento 07. Registro próprio [PLANEJADO].

## 12. Gestão de mudanças

| Controle | Implementado (com o ponto do código) | Planejado / lacuna |
|---|---|---|
| Mudança no banco por arquivo de migração versionado. | `supabase/migrations/`, 36 arquivos, de `20261019000001` a `20261109300006` (R6). | O fim do contrato técnico (R2, Testes e CI) manda editar a migração existente. A regra do projeto manda criar nova migração. Uniformizar [PLANEJADO]. |
| Testes do banco e tipos gerados no CI. | Job `database` roda `supabase test db`. Diferença em `lib/database.types.ts` faz o job falhar (R11). Só roda por disparo manual. | — |
| Revisão por par antes de mesclar. | `.github/CODEOWNERS` pede revisão dos donos em `apps/web/`, `apps/web/supabase/` e `.github/`, e `.github/pull_request_template.md` traz lista de verificação (R13). A revisão só é obrigatória se a proteção do branch exigir, o que não foi verificado. | [PLANEJADO]: exigir revisão de dono e CI na proteção do `main`. |
| Proteção do branch principal no GitHub. | [incerto]: configuração não verificada nesta sessão. | [PLANEJADO]. |
| Publicação de produção a partir do `main`. | Há workflows manuais: `deploy-supabase.yml` (migrations e Edge Functions, simulação por padrão) e `deploy-web.yml` (site no Cloudflare Pages, com a palavra `DEPLOY`). Os dois só rodam a partir de `main` e usam o ambiente `production`. Nada foi executado (R13). Não há evidência de que a opção "Deploy to production" do Supabase, descrita em F9, esteja ligada. | Projeto de produção, variáveis e aprovação do ambiente `production` não verificados [PLANEJADO]. |
| Ambiente de teste separado da produção. | Desenvolvimento local com `supabase start`. | Projeto de produção não criado [PLANEJADO]. |
| Migração em produção só depois de teste. | — | [PLANEJADO]. |

## 13. Backups e continuidade

13.1. **O que o fornecedor oferece (F7, página lida em 08/11/2026).**

| Plano Supabase | Backup diário | Retenção do backup diário | Recuperação pontual (PITR) |
|---|---|---|---|
| Free | Não descrito como incluído. | Não informada. | Não mencionada. O fornecedor recomenda exportar o banco com `db dump` e guardar cópia fora. A página não diz se backups do plano Free podem ser baixados (F7). |
| Pro | Incluído. | 7 dias. | Complemento pago. |
| Team | Incluído. | 14 dias. | Complemento pago. |
| Enterprise | Incluído. | Até 30 dias. | Complemento pago. |

- Com PITR, o fornecedor declara RPO de 2 minutos no pior caso. Com backup diário, não declara RPO. A leitura da página não encontrou aviso de perda de até um dia de dados [incerto].
- Ao ativar PITR, o backup diário deixa de ser feito.
- Restaurar substitui o estado atual do banco. A página recomenda restaurar primeiro em projeto novo.
- Depois de restaurar, senhas de papéis personalizados precisam ser redefinidas.
- Não confirmei se os backups são criptografados. A página não diz [incerto].
- Os backups do banco não cobrem os objetos do Storage, inclusive o bucket `provider-documents` (F7). Restaurar um backup antigo também não devolve objetos apagados depois dele.

13.2. **Plano escolhido.** Nenhum. O projeto de produção ainda não existe [PLANEJADO].

13.3. **Metas propostas para decisão do fundador (não são medidas).**

| Item | Meta proposta | Situação |
|---|---|---|
| RPO (perda máxima de dados) | Plano Pro com backup diário: até 24 horas. Com PITR: 2 minutos, valor declarado pelo fornecedor no pior caso. | [PLANEJADO]. O valor de 24 horas vem do intervalo do backup diário, não de medição. |
| RTO (tempo para voltar a operar) | A definir. | [PLANEJADO]. Nunca medido. |
| Teste de restauração | Restaurar em projeto novo antes do lançamento e depois a cada trimestre. | [PLANEJADO]. |

13.4. **Continuidade sem o sistema.**
- Sem backend, a rota `/pedido` gera uma mensagem de WhatsApp para a operação, com o número de `VITE_CONCIERGE_WHATSAPP` (R2, Rotas novas; R9). É o caminho de contingência para pedidos que existe hoje.
- Fila de notificações: até 5 tentativas, com esperas de 1, 4, 9 e 16 minutos. Linhas presas em `sending` há mais de 10 minutos são retomadas (R2, Notificações).
- Expiração de pedidos e orçamentos a cada 15 minutos, por `pg_cron` (R2, Notificações).
- Código: no Git. O esquema do banco pode ser recriado pelas migrações. Os dados, não (R6).
- Dependência de uma pessoa: só o operador tem acesso administrativo. [PLANEJADO]: procedimento de acesso de emergência para um segundo responsável, guardado em cofre de senhas.

## 14. Incidentes de segurança (referência)

14.1. **O que a lei e a regulamentação dizem (fontes F1, F3 e F5).**
- LGPD, art. 48, caput: o controlador comunica à ANPD e ao titular a ocorrência de incidente de segurança que possa acarretar risco ou dano relevante aos titulares (F1). O §1º diz que a comunicação será feita em prazo razoável, conforme definido pela ANPD, e deverá mencionar, no mínimo: a natureza dos dados afetados; as informações sobre os titulares; as medidas técnicas e de segurança, observados os segredos comercial e industrial; os riscos; os motivos da demora, se a comunicação não foi imediata; e as medidas para reverter ou mitigar o prejuízo (F1).
- Resolução CD/ANPD nº 15/2024 (F3), na cópia do Ministério da Justiça:
  - comunicação à ANPD em três dias úteis (art. 6º, caput), contados do conhecimento pelo controlador de que o incidente afetou dados pessoais (art. 6º, §1º), ressalvada legislação específica com outro prazo;
  - comunicação ao titular em três dias úteis (art. 9º, caput), contados do conhecimento pelo controlador;
  - complementação de informações em vinte dias úteis (art. 6º, §3º);
  - o controlador mantém o registro do incidente "pelo prazo mínimo de cinco anos, contado a partir da data do registro" (art. 10, caput).
- Agentes de pequeno porte: prazos em dobro (art. 6º, §8º, e art. 9º, §6º, da Resolução 15/2024; art. 14, II, da Resolução 2/2022, na redação dada pela Resolução 15/2024 (F3, F5)). O art. 2º, I, da Resolução 2/2022 inclui microempresas, empresas de pequeno porte e startups (F5). **[CONDICIONAL: depende de parecer]**: enquadramento e exclusões do art. 3º (F5): tratamento de alto risco (ressalvado o art. 8º); receita bruta acima do limite da LC 123/2006 (no caso de startups, o da LC 182/2021); e grupo econômico cuja receita global ultrapasse esses limites.
- A ressalva sobre integridade física ou moral e segurança nacional não aparece na redação atual do inciso II do art. 14 da Resolução 2/2022, dada pela Resolução 15/2024. A página lida diz que ela constava na versão anterior (F5). Conferir no Diário Oficial (I10).

14.2. **Marco inicial da contagem.** Pela cópia lida da Resolução 15/2024, o prazo de três dias úteis conta do conhecimento pelo controlador de que o incidente afetou dados pessoais (art. 6º, §1º, e art. 9º, caput; F3). Conferir no Diário Oficial antes de citar (I10). Resumos secundários não foram usados como base.

14.3. **Procedimento hoje.**
- Não há plano de resposta, contato de incidente nem registro de incidentes. [PLANEJADO]: documento 08.
- Registros que ajudam a investigar: `audit_log` (ações de dinheiro e administração), `payment_events` e `booking_events` (R2). Logs de acesso do Supabase não foram verificados [incerto].
- Ações de contenção possíveis hoje: suspender prestador (`admin_set_provider_status`, R2, Administração). O app passa o motivo (`services/admin.ts`, `setProviderStatus`), mas a função do banco aceita motivo vazio (`11_admin.sql`): a obrigatoriedade não está no banco [lacuna]. Rotação de chave: procedimento não escrito [PLANEJADO].

14.4. **Comunicação ao titular.** Texto-modelo [PLANEJADO]. A política de privacidade (documento 03, seção 9.3) já prevê a comunicação à ANPD e ao titular conforme o art. 48 da LGPD.

## 15. Higiene de contas e dispositivos do operador

Marque cada item quando estiver feito. Os itens sem fonte indicada são recomendações da operação, não obrigações legais.

- [ ] **GitHub:** 2FA ativo, com aplicativo autenticador ou chave de segurança. Códigos de recuperação guardados fora do aparelho. O GitHub exige 2FA de quem contribui com código em github.com desde março de 2023 (F16).
- [ ] **Supabase (login do painel):** MFA por aplicativo autenticador (TOTP). É o único fator suportado. Em planos Pro, Team e Enterprise, o dono da organização pode exigir MFA dos membros (F11).
- [ ] **E-mail do operador:** 2FA ativo. Esse e-mail recebe códigos de acesso do Supabase, do GitHub e do Asaas. Confirmar a opção em cada serviço [incerto].
- [ ] **Asaas:** 2FA ativo no painel [incerto: não verificado].
- [ ] **Registrador do domínio:** 2FA ativo [incerto: não verificado].
- [ ] **Cloudflare, se for usada:** 2FA ativo [incerto: uso não confirmado].
- [ ] Chaves (`service_role`, `ASAAS_API_KEY`, tokens) guardadas só em cofre de senhas e nas configurações de função do Supabase. Nunca em chat, e-mail, arquivo do repositório ou variável `VITE_*`.
- [ ] A chave `service_role` fica só nas funções do servidor e nos testes de integração (R2, Testes e CI).
- [ ] Aparelho do operador com bloqueio de tela e atualizações automáticas.
- [ ] Sessões do painel do Supabase e do GitHub encerradas em computador compartilhado.
- [ ] Inventário de quem tem acesso a cada serviço [PLANEJADO].
- [ ] Conta de administração do app separada da conta de uso comum [PLANEJADO].

## 16. Treinamento e conscientização

16.1. Não há programa formal. O operador relê esta política antes de cada revisão.

16.2. Regra para o login por código, aplicável a toda a equipe: nenhum integrante pede o código de acesso de um usuário, por mensagem, ligação ou e-mail. Quem recebe o código não o compartilha. Registro de leitura dessa regra por cada novo integrante [PLANEJADO].

## 17. Lacunas antes de receber dados reais

Em ordem de prioridade:

1. Criar o projeto Supabase de produção. Desligar o cadastro por senha. Não copiar `[auth.sms.test_otp]` nem `[auth.sms.twilio]` com valores de exemplo. Escolher provedores de SMS e de e-mail (seção 5).
2. MFA por aplicativo autenticador para o operador e para todo administrador (seções 5 e 15).
3. Escolher o plano de backup, criar cópia própria dos arquivos do Storage (o backup do banco não os inclui) e testar a restauração (seção 13).
4. Confirmar com o fornecedor a criptografia dos backups e os detalhes por plano (seção 7) [incerto].
5. Testar os cabeçalhos de `public/_headers` no Cloudflare Pages, com CSP e HSTS (seção 10).
6. Incluir varredura de dependências e de segredos no CI (seção 10).
7. Concluir o canal e o registro de incidentes previstos no documento 08 e na seção 14.
8. Fazer o inventário de acessos e definir a revisão periódica (seções 3 e 15).
9. Criar alertas para falha de webhook, reembolso recusado e pico de tentativas de login (seção 9).
10. Definir prazo de guarda e regra de eliminação para documentos sensíveis (seção 7).
11. Revisão externa ou teste de invasão antes de dados reais (seção 10).
12. Uniformizar a regra de migrações no contrato técnico (seção 12).

## 18. Revisão desta política

18.1. Revisar antes do lançamento, depois de cada troca de fornecedor ou de plano de hospedagem, e a cada mudança de área de atuação. Revisão ao menos anual [PLANEJADO: periodicidade proposta].

18.2. A etiqueta de versão deve ser atualizada junto com `apps/web/config/legal.ts`, que hoje usa "2026-10-rascunho" para as finalidades `terms` e `privacy` (R12).

## Pontos para o advogado

As perguntas abaixo precisam de parecer. Os itens [incerto] também estão listados aqui, para conferência.

**Perguntas abertas**

- **P1. Papel da empresa.** A empresa operadora será controladora ou operadora de cada tratamento descrito neste documento? [CONDICIONAL: depende de parecer]
- **P2. Agente de pequeno porte.** A empresa se enquadra como agente de pequeno porte (art. 2º, I, da Resolução 2/2022)? O dobro dos prazos da seção 14 depende disso. Quais exclusões do art. 3º se aplicam (alto risco, receita acima do limite da LC 123/2006, grupo econômico)? [CONDICIONAL: depende de parecer].
- **P3. Marco inicial dos três dias úteis.** O texto lido diz que a contagem parte do conhecimento pelo controlador de que o incidente afetou dados pessoais (art. 6º, §1º, e art. 9º, caput, da Resolução 15/2024). Confirmar no Diário Oficial (I10) e definir como a empresa registra esse momento. [incerto até conferência]
- **P4. Risco ou dano relevante.** Qual critério define "risco ou dano relevante" (art. 48, caput, da LGPD)? Os itens mínimos da comunicação estão no §1º do art. 48, lido na publicação da Câmara (F1). [incerto: o critério de risco não está no texto lido]
- **P5. Ressalva do inciso II do art. 14 da Resolução 2/2022.** A página lida mostra que essa exceção não está na redação atual (dada pela Resolução 15/2024), mas constava na anterior. Confirmar no Diário Oficial (I10). [incerto até conferência]
- **P6. Guia da ANPD para pequeno porte.** O guia é orientativo, como indica o título, e nenhum ponto dele é obrigação? O conteúdo do PDF não foi lido [incerto].
- **P7. Registros de acesso.** O art. 15 do Marco Civil se aplica? Quem guarda, onde e por quanto tempo? Os logs do Supabase contam como registros? [CONDICIONAL: depende de parecer]
- **P8. Documentos sensíveis.** Selfie, documento de identidade e certidão de antecedentes: qual base legal, qual prazo de guarda e qual regra de eliminação? O art. 16 da LGPD manda eliminar após o fim do tratamento, com as hipóteses dos incisos I a IV (F1). Selfie é dado biométrico? [CONDICIONAL: depende de parecer]
- **P9. Dados de saúde no cuidado.** Os campos de texto livre (`preferences`, `emergency_contact`, `meals`, `mood`, `notes`) podem conter dado de saúde? Se sim, o caput do art. 11 da LGPD diz que o tratamento de dado sensível "somente poderá ocorrer nas seguintes hipóteses" (F1) [CONDICIONAL: depende de parecer].
- **P10. Responsabilidade do operador único.** Qual é a responsabilidade pessoal do fundador, com acesso administrativo a todos os serviços, frente à empresa e aos usuários? [CONDICIONAL: depende de parecer]
- **P11. Fornecedores fora do Brasil.** O mecanismo de transferência internacional para Supabase, Cloudflare, Anthropic e outros é o da documento 07, Q14. Este documento não analisou esse mecanismo [incerto].
- **P12. Alegações de segurança ao consumidor.** O teste `test/claims-guard.test.ts` (R4) reprova uma lista fixa de expressões, como "ponta a ponta" e "pagamento seguro"; não cobre toda alegação possível. O comentário dele cita os arts. 37 e 38 do CDC. O texto do CDC não foi aberto nesta sessão [incerto]. Como estas seções podem aparecer em loja, site ou selo?
- **P13. Incidente de fornecedor.** Quem responde perante o usuário por incidente no Supabase ou no Asaas? O aceite online dos termos dos fornecedores basta? (documento 07, Q28 e Q29) [incerto]
- **P14. Backups e exclusão.** Dados apagados continuam em backups até expirarem (7 a 30 dias, conforme o plano pago, F7). Como informar o titular sobre esse prazo? [CONDICIONAL: depende de parecer]
- **P15. Retenção e comissão.** A retenção de valores (escrow) e a comissão estão desligadas. Qualquer cláusula de segurança sobre custódia de dinheiro depende de parecer, como indica o documento de decisões (`apps/web/docs/DECISOES.md`) [CONDICIONAL: depende de parecer].

**Itens [incerto] consolidados**

- **I1.** Criptografia dos backups (F7 não diz) e confirmação, por plano, da declaração de F8 sobre dados em repouso e em trânsito.
- **I2.** Os backups do banco não cobrem o Storage (F7). Cópia própria dos objetos ainda não existe [PLANEJADO].
- **I3.** Retenção dos logs do Supabase por plano (documento 03, Q13; F7 a F10 não tratam do tema).
- **I4.** Valores de limite de tentativa e de validade de código no projeto hospedado.
- **I5.** Políticas de segurança e termos de Asaas, Meta (WhatsApp), Resend e Anthropic. Não foram abertos nesta sessão.
- **I6.** Conta, plano e termos da Cloudflare Pages, usada por `deploy-web.yml`. O documento 03 ainda diz que não há uso no código (divergência a corrigir no documento 03).
- **I7.** Proteção do branch principal no GitHub e 2FA de cada serviço, não verificados.
- **I8.** ISO/IEC 27002:2022: a página da ISO retornou 403 também nesta revisão. Só o título apareceu em listagem de busca (F14).
- **I9.** Guia da ANPD para pequeno porte: só título e metadados foram lidos. O corpo do PDF não foi extraído (F6).
- **I10.** Resolução CD/ANPD nº 15/2024: o texto foi lido na cópia do Ministério da Justiça (F3). A página do gov.br do ato retornou 404, e o Diário Oficial não foi aberto. Conferir no Diário Oficial antes de citar.
- **I11.** Resolução CD/ANPD nº 2/2022: os arts. 2º, 3º e 14 foram lidos por ferramenta, em trechos (F5). Conferir no Diário Oficial antes de citar.
- **I12.** Lei 13.709/2018: o texto foi lido na publicação da Câmara, pois o Planalto não foi aberto nesta sessão. O §1º do art. 48 foi lido na mesma publicação (F1).
- **I13.** Cloudflare: não encontrei página geral de responsabilidade compartilhada. Usei a FAQ de conformidade APRA (F15).
- **I14.** Trechos entre aspas de páginas da web foram lidos por ferramenta. Conferir no original antes de citação formal.
- **I15.** Marco inicial da contagem de prazo (P3): texto lido em F3; conferir no Diário Oficial.

## Fontes consultadas

Todas as fontes abaixo foram abertas em 08/11/2026, salvo indicação.

| Código | URL | Norma ou página | O que foi lido | Observação |
|---|---|---|---|---|
| F1 | https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-publicacaooriginal-156212-pl.html | Lei 13.709/2018 (LGPD), texto da Câmara | Arts. 5º, II (início); 11, caput (início); 16, caput e incisos I a IV; 46 (caput, §§ 1º e 2º); 47; 48 (caput e §1º, incisos I a VI); 49. | Planalto não aberto nesta sessão. Ver I12. |
| F2 | https://www2.camara.leg.br/legin/fed/lei/2014/lei-12965-23-abril-2014-778630-normaatualizada-pl.html | Lei 12.965/2014 (Marco Civil), texto atualizado da Câmara | Art. 5º, VIII; art. 15, caput e §§ 1º e 2º. | — |
| F3 | https://bibliotecadigital.mj.gov.br/bitstream/1/12879/2/RES_ANPD_2024_15.html | Resolução CD/ANPD nº 15, de 24/04/2024, cópia na Biblioteca Digital do Ministério da Justiça | Arts. 6º, caput, §§ 1º, 3º e 8º; 9º, caput e § 6º; 10, caput (trechos lidos por ferramenta). | Conferir no Diário Oficial (I10). |
| F4 | https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-aprova-o-regulamento-de-comunicacao-de-incidente-de-seguranca | Notícia da ANPD, 26/04/2024 | Confirma a publicação da Resolução 15/2024, que aprovou o regulamento. Diz que o regulamento traz os prazos, sem informá-los. | Usada só para existência do ato e para a referência aos prazos. |
| F5 | https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022 | Resolução CD/ANPD nº 2, de 27/01/2022 | Art. 2º, I; art. 3º, I a III; art. 14, caput e inciso II, com a redação dada pela Resolução 15/2024. A página mostra também a versão anterior do inciso II. Data da Resolução 15 citada como 24/04/2024 e, em observação, 25/04/2024. | I11. |
| F6 | https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-vf.pdf | Guia Orientativo sobre Segurança da Informação para Agentes de Tratamento de Pequeno Porte (ANPD) | Título e metadados: criado em 04/10/2021 e modificado em 23/01/2025. | Corpo do PDF não extraído (I9). |
| F7 | https://supabase.com/docs/guides/platform/backups | Supabase, Backups | Tipos de backup; retenção por plano; PITR; RPO de 2 minutos; restauração; senhas de papéis personalizados; backups do banco não cobrem objetos do Storage; no plano Free, recomenda `db dump`. | Criptografia dos backups não citada (I1). |
| F8 | https://supabase.com/docs/guides/security/shared-responsibility-model | Supabase, Shared Responsibility Model | Responsabilidades: RLS, chaves e dados (cliente); backups do banco (Supabase); "Data is encrypted at rest and in transit by Supabase." Auth não aparece expressamente. | Criptografia também aparece na seção sobre HIPAA. |
| F9 | https://supabase.com/docs/guides/platform/going-into-prod | Supabase, Going into production | Seções de segurança, desempenho, disponibilidade e implantação; "Deploy to production" ligado ao `main`; branching para testar migrações; PITR para RPO menor. | Checklist completo não aberto. |
| F10 | https://supabase.com/docs/guides/security/product-security | Supabase, configuração segura dos produtos | Lista de guias por produto (Auth, Database, Storage, Realtime), com "Postgres connection logging". Não trata de backups. | Conteúdo de cada guia não aberto. |
| F11 | https://supabase.com/docs/guides/platform/multi-factor-authentication | Supabase, MFA da conta | MFA por TOTP para a conta do operador; exigência por organização nos planos Pro, Team e Enterprise. | Não trata do MFA de usuários do app. |
| F12 | https://asvs.owasp.org/ (redireciona de https://owasp.org/www-project-application-security-verification-standard/) | OWASP ASVS 5.0.0 | Versão 5.0.0, publicada em 30/05/2025, segundo a página; finalidade. | Os níveis de verificação não apareceram na página lida. |
| F13 | https://top10.owasp.org/2025 | OWASP Top 10:2025 | Títulos das categorias A01 a A10. | — |
| F14 | https://www.iso.org/standard/75652.html | ISO/IEC 27002:2022 | Não aberta: retornou 403 também nesta revisão. Só o título apareceu em listagem de busca. | I8. |
| F15 | https://www.cloudflare.com/trust-hub/compliance-resources/apra/ | Cloudflare, FAQ de conformidade APRA, seção Shared Responsibility Model | Divisão de responsabilidades: infraestrutura física do fornecedor; configuração pelo cliente. | Não é página geral (I13). |
| F16 | https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/about-two-factor-authentication | GitHub, sobre 2FA | Métodos (aplicativo, SMS, chave de segurança, passkey); códigos de recuperação; exigência para contribuidores desde março de 2023. | — |

**Arquivos do repositório (R1 a R12)**

| Código | Caminho |
|---|---|
| R1 | `apps/web/supabase/config.toml` |
| R2 | `apps/web/docs/ARQUITETURA.md` |
| R3 | `apps/web/supabase/functions/README.md` |
| R4 | `apps/web/test/claims-guard.test.ts` |
| R5 | `apps/web/supabase/tests/database/12_rls_matrix.test.sql` |
| R6 | `apps/web/supabase/migrations/` (`20261019000003_providers.sql`, `…05_bookings.sql`, `…06_payments.sql`, `…09_care.sql`, `…10_privacy_audit.sql`) |
| R7 | `apps/web/lib/supabase.ts`, `apps/web/lib/supabaseKey.ts`, `apps/web/lib/requestDraft.ts`, `apps/web/services/auth.ts` |
| R8 | `apps/web/supabase/functions/_shared/secrets.ts`, `_runtime/supabase.ts`, `asaas-webhook/handler.ts`, `notify-dispatch/handler.ts`, `account-delete/handler.ts` |
| R9 | `apps/web/.gitignore`, `apps/web/.env.example`, `apps/web/.env.native` |
| R10 | `apps/web/index.html`, `apps/web/public/_headers`, `apps/web/public/_redirects` |
| R11 | `.github/workflows/web-ci.yml`, `.github/workflows/web-release.yml`, `.github/workflows/ci-security.yml` |
| R12 | `apps/web/config/legal.ts` |
| R13 | `.github/workflows/deploy-web.yml`, `.github/workflows/deploy-supabase.yml`, `.github/dependabot.yml`, `.github/CODEOWNERS`, `.github/SECURITY.md`, `.github/pull_request_template.md`, `apps/web/docs/arquitetura/infra.md`, `apps/web/scripts/check-headers.mjs` |
