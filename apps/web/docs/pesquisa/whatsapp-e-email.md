# Pesquisa: WhatsApp Cloud API, OTP por WhatsApp e e-mail transacional

> Rascunho para revisão de advogado. Não é parecer jurídico.

**Data da pesquisa:** 23/10/2026. **Escopo:** decidir os canais de login (código de acesso) e de notificação do WorkEasy. **Código alterado:** nenhum.

**Estado do produto:** MVP fundido na `main`, **não implantado**, sem usuários reais. Nada foi testado contra a WhatsApp Cloud API, o Resend ou um provedor de SMS de verdade. O que está aqui vem de duas fontes: leitura do código do repositório (arquivos citados) e documentação oficial aberta nesta data (seção 10). O que não consegui abrir está na seção 11.

Documentos irmãos, em preparação por outros agentes: `docs/operacao/05-templates-whatsapp.md` (textos e JSON dos modelos de mensagem; o `.json` já existe ao lado), `docs/pesquisa/supabase-producao.md` e `docs/pesquisa/asaas.md`. Este documento usa os nomes e textos do `05-templates-whatsapp.json` para não divergir.

---

## 1. Decisão em uma página

| | (a) SMS por provedor do Supabase | (b) WhatsApp pelo hook Send SMS | (c) Código por e-mail (Resend SMTP) |
|---|---|---|---|
| Custo por código no Brasil | US$ 0,0599 ≈ **R$ 0,30** (Twilio). Com Twilio Verify ≈ R$ 0,55 [estimativa] | ≈ US$ 0,0068 ≈ **R$ 0,03** direto na Meta [incerto: valor em BRL não aberto]. Via Twilio ≈ R$ 0,06 [estimativa] | **R$ 0** até 3.000 e-mails/mês e 100/dia; depois ≈ R$ 0,002 (plano Pro) |
| 1.000 códigos por mês | ≈ R$ 302 (Verify: ≈ R$ 554) | ≈ R$ 34 | R$ 0 |
| Risco de abuso | alto (cada envio custa dinheiro) | médio (custo menor; risco de bombardear terceiros e derrubar a qualidade do número) | baixo em custo; risco para a reputação do domínio |
| Aprovações externas | conta Twilio; remetente é opcional | Meta: verificação da empresa, número, nome de exibição, modelos de mensagem | domínio e DNS |
| Código novo no repositório | nenhum | função Edge `auth-send-sms` [PLANEJADO] | nenhum |
| Papel recomendado | só como reserva, atrás do mesmo hook | **fase 2: canal de celular** | **lançamento: canal principal** |

Conversão: dólar PTAX de venda de 22/10/2026 = R$ 5,0383 (Banco Central, fonte B1). Preços de fornecedores mudam sem aviso: reabra as páginas da seção 10 antes de contratar.

### 1.1 Recomendação

1. **Lançamento (beta fechado com concierge): e-mail.** Login por código de e-mail (c) e avisos por e-mail (`notify-dispatch` + Resend). A aba "Celular" sai da tela enquanto o canal de celular não existir [PLANEJADO: flag de build]. Motivos: custo ≈ zero por código; nenhuma fila de aprovação externa; a tela `/entrar` já abre na aba E-mail; o Supabase recomenda código em vez de link porque filtros de e-mail pré-abrem links e os consomem (S8); a operação inicial é concierge, com atendimento manual por WhatsApp (`VITE_CONCIERGE_WHATSAPP`; `docs/DECISOES.md`, seção 5), então o WhatsApp automático não é o gargalo.
2. **Fase 2: WhatsApp como canal de celular**, pelo hook Send SMS (b) com modelo de autenticação, e avisos por WhatsApp com os seis modelos de utilidade. O e-mail continua disponível como reserva. Motivos: cerca de 9 vezes mais barato que SMS [estimativa]; o hook deixa o servidor decidir (só celular +55, limite por número, sem confiar na validação do navegador); e login por WhatsApp prova que o número recebe WhatsApp, que é o que `private.notify` já supõe ao mandar avisos para telefone confirmado (seção 3, linha 9).
3. **SMS (a) não entra no lançamento.** É o canal mais caro por código, o mais exposto a fraude de tarifa e o menos coerente com os avisos por WhatsApp. Fica como reserva atrás do mesmo hook (a função tenta SMS se a Meta recusar o envio).
4. **Reserva:** e-mail sempre disponível. Se a Meta pausar o número ou os modelos, desligar a aba Celular pela flag e manter só o e-mail. Se o Resend falhar, trocar o SMTP do Supabase para um segundo provedor já configurado (o Supabase recomenda ter outro SMTP em espera, S5).

### 1.2 Portões para a fase 2 (todos, antes de ligar o celular)

- [ ] Verificação da empresa aprovada pela Meta e número registrado na Cloud API (passos 14 a 21).
- [ ] Modelo de autenticação e os modelos de utilidade com status `APPROVED`, e `category` igual a `correct_category` (passos 22 a 26).
- [ ] Função `auth-send-sms` construída, testada com a assinatura Standard Webhooks e ligada no painel (passos 30 a 33).
- [ ] CAPTCHA e limites de envio ativos no Supabase Auth (passos 7 e 8, que já fazem parte da fase 1). Hoje não existe CAPTCHA no app.
- [ ] Texto de aceite para receber mensagens por WhatsApp revisado pelo advogado (seção 8.3) e controle para parar os avisos [PLANEJADO].
- [ ] Parecer sobre transferência internacional de dados para Meta, Resend e, se usado, Twilio (seção 8).

### 1.3 Cinco coisas que mudam o plano

1. **O app não tem CAPTCHA.** `services/auth.ts` não envia `captchaToken` e `[auth.captcha]` está comentado no `config.toml`. Antes de ligar qualquer canal que cobra por mensagem, é preciso widget + configuração no Auth (passo 8).
2. **A validação "só celular brasileiro" existe só no navegador** (`lib/phone.ts`). Quem chamar a API do Auth direto pode pedir código para qualquer número. Só o hook (ou a geografia do provedor) barra isso no servidor.
3. **O login por e-mail só mostra o código se os modelos "Confirm signup" e "Magic Link" tiverem `{{ .Token }}`.** Isso é um ajuste manual no painel, descrito só no `README.md`; sem ele o usuário recebe apenas um link (passo 6).
4. **`private.notify` manda WhatsApp para qualquer telefone confirmado**, inclusive um confirmado por SMS, sem provar que o número tem WhatsApp, e não há segundo canal se a entrega falhar (seção 3).
5. **Sem webhook de status e sem controle para parar avisos.** `sent` significa "a API aceitou", não "entregue", e o usuário não consegue pedir para parar (seções 3 e 9).

---

## 2. Como ler

| Marca | Significado |
|---|---|
| **[PLANEJADO]** | não existe no código hoje |
| **[CONDICIONAL: depende de parecer]** | depende de opinião jurídica; este documento não decide |
| **[incerto]** | não consegui confirmar em fonte aberta nesta sessão |
| **[estimativa]** | conta feita aqui a partir de números das fontes |
| **B1, S1, M1, R1, T1, O1, L1** | fontes da seção 10 (Banco Central, Supabase, Meta, Resend, Twilio, outras, legislação) |

- "Conferido no código" = li o arquivo citado em 23/10/2026. "Fonte aberta" = li a página citada na mesma data, sem usar memória.
- "Custo por código" = custo de um código enviado; um login pode gastar mais de um (reenvio).
- Valores em reais usam a PTAX acima e não incluem impostos, IOF nem tarifas de cartão.
- A cota de buscas na web da sessão acabou no meio da pesquisa. O que dependia de busca e não tinha endereço direto conhecido ficou como [incerto] (seção 11).

---

## 3. O que o produto faz hoje (conferido no código)

| # | Fato | Onde |
|---|---|---|
| 1 | `/entrar` abre na aba **E-mail**; a aba **Celular** pede "celular com DDD". O botão "Enviar código" exige marcar o aceite dos Termos e da Política. O código tem 6 dígitos e há "Reenviar código". | `pages/conta/Entrar.tsx` |
| 2 | E-mail: `signInWithOtp({ email, shouldCreateUser: true, emailRedirectTo: <SITE>/conta })`; confirma com `verifyOtp({ type: 'email' })`. | `services/auth.ts` |
| 3 | Celular: `signInWithOtp({ phone, shouldCreateUser: true, channel: 'sms' })`; confirma com `verifyOtp({ type: 'sms' })`. O canal `'sms'` está fixo. | `services/auth.ts` |
| 4 | Só aceita celular móvel: `+55`, DDD e 9 dígitos começando em 9. Fixo é recusado com mensagem própria. A regra roda **só no navegador**. | `lib/phone.ts`, `services/auth.ts` |
| 5 | Nota na aba Celular: "O envio por SMS depende do provedor de SMS configurado na plataforma. Se o código não chegar, entre pelo e-mail." | `pages/conta/Entrar.tsx` |
| 6 | Sem CAPTCHA: nenhum `captchaToken` é enviado; só existe o texto de erro para `captcha_failed`. | `services/auth.ts`, `lib/errors.ts` |
| 7 | `config.toml`: `[auth.rate_limit] email_sent = 2` e `sms_sent = 30` (por hora); `[auth.email] otp_length = 6`, `otp_expiry = 3600`, `max_frequency = "1s"`; `[auth.sms] template = "Seu código WorkEasy: {{ .Code }}"`, `max_frequency = "5s"`; `[auth.sms.test_otp]` com o celular de teste local; `[auth.sms.twilio] enabled = true` com valores `local-placeholder`; `[auth.captcha]`, `[auth.hook.*]`, `[auth.email.smtp]` e modelos de e-mail **comentados**. | `supabase/config.toml` |
| 8 | `README`: no Supabase Auth, os modelos "Confirm signup" e "Magic Link" precisam conter `{{ .Token }}` para mostrar o código; o celular "só por SMS e só para celular"; "O envio por WhatsApp não é oferecido nesta versão". | `README.md` (linhas 72 e 73) |
| 9 | `private.notify` escolhe **um** canal: WhatsApp se `auth.users.phone` tem `phone_confirmed_at`; senão e-mail se `auth.users.email` tem `email_confirmed_at`; nunca usa `profiles.phone`; sem contato confirmado não enfileira nada. | `migrations/…08_notifications.sql` |
| 10 | Seis modelos (`TEMPLATES`): `proposta_recebida`, `atendimento_confirmado`, `lembrete_atendimento`, `pagamento_recebido`, `orcamento_respondido`, `plantao_oferecido`. A coluna `notifications.template` tem `check` com esses seis nomes. | `_shared/notifications.ts`, migração 08 |
| 11 | `notify-dispatch` (agendador): aceita `x-cron-secret` ou `Authorization: Bearer`; responde 503 sem `CRON_SECRET` e 401 se o segredo não confere; reivindica até 50 linhas (máx. 100); orçamento de 100 s; cada chamada limitada a 10 s. | `notify-dispatch/handler.ts` |
| 12 | WhatsApp: `POST https://graph.facebook.com/v26.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`, `Authorization: Bearer`, tipo `template`, idioma `pt_BR`, só componente `body`, `to` = `55` + DDD + número, **sem "+"**. Sem token ou ID: `skipped`. | `_shared/notifications.ts` |
| 13 | E-mail: `POST https://api.resend.com/emails` com `Idempotency-Key: notification-<id>`, `tags` e rodapé "Você recebe esta mensagem porque tem uma conta no WorkEasy." Sem chave ou `EMAIL_FROM`: `skipped`. | `_shared/notifications.ts`, `handler.ts` |
| 14 | Repetição: só HTTP 429 e 5xx e falha de rede; 5 tentativas, espera de 1, 4, 9 e 16 minutos. Qualquer outro 4xx vira `failed` na hora. `sent` = a API aceitou. | `_shared/notifications.ts` |
| 15 | Agendador: `pg_cron` roda a cada minuto e chama a função por `pg_net` **se** o Vault tiver `notify_dispatch_url` e `cron_secret`; localmente não faz nada. | migração 08 |
| 16 | Não existe controle de avisos (opt-out), nem consentimento próprio para WhatsApp (`consent_purpose`: terms, privacy, marketing, background_check, location), nem webhook de entrega, nem segundo canal por falha. | busca no repositório; `10_privacy_audit.sql` |
| 17 | Os parâmetros dos modelos trazem **nome da ocupação** e **nome da outra parte** (ex.: "atendimento de Psicólogo em … com Maria"). | `_shared/notification-context.ts` |

Os nomes lidos de variáveis de ambiente estão na seção 7.

---

## 4. Comparação detalhada dos três caminhos

### 4.0 Contrato do hook Send SMS (documentação oficial)

Fontes: S1 (página do hook), S2 (visão geral de hooks), S10, S12, S14.

| Item | O que a documentação diz |
|---|---|
| O que faz | "The Send SMS Hook replaces Supabase's built-in SMS sending." Serve para usar provedor regional, **outros canais, como o WhatsApp**, cair para outro provedor se o principal falhar e ajustar o texto (S1). |
| Quando é chamado | "Each time an SMS is sent" (S2). |
| Entrada (JSON) | Dois campos obrigatórios. `user`: o objeto do usuário (`id`, `aud`, `role`, `email`, `phone`, `phone_confirmed_at`, `confirmation_sent_at`, `confirmed_at`, `phone_change_sent_at`, `last_sign_in_at`, `app_metadata`, `user_metadata`, `identities`, `created_at`, `updated_at`, `is_anonymous`). `sms`: objeto com `otp`, texto de 6 dígitos (`^[0-9]{6}$`). **O payload não traz o canal pedido nem o IP do cliente** (S1). |
| Saída | "No outputs are required. An empty response with a status code of 200 is taken as a successful response." (S1) |
| Assinatura (hook HTTP) | Padrão Standard Webhooks: cabeçalhos `webhook-id`, `webhook-timestamp` e `webhook-signature`; segredo no formato `v1,whsec_<base64>` (S2). O conteúdo assinado é `id.timestamp.corpo`, o algoritmo é HMAC-SHA256 e o cabeçalho pode trazer várias assinaturas separadas por espaço (S14). |
| Limites | Corpo de até 20 KB. Orçamento de 5 s para a chamada inteira, repetições incluídas. Toda resposta, inclusive de erro, precisa de `Content-Type: application/json`, senão o Auth devolve erro 500 (S2). |
| Códigos HTTP | 200, 202 e 204 seguem. 400 e 403 viram erro 500 para o cliente. 429 e 503 com `retry-after` não vazio são repetidos até 3 vezes, com espera de 2 s (S2). |
| Planos | Disponível nos planos Free e Pro (S2). |
| Configuração local | `[auth.hook.send_sms]` com `enabled`, `uri` (`http://host.docker.internal:54321/functions/v1/<nome>`) e `secrets = "env(SEND_SMS_HOOK_SECRETS)"` (S2, S12). No projeto hospedado: painel Authentication > Hooks (S2). |
| Função Edge | Rodar com `--no-verify-jwt`, porque o hook roda antes de existir JWT (S2, S10). |
| Armadilha nos exemplos | O exemplo da Twilio monta `+${toNumber}` (supõe número **sem** "+"); o exemplo de WhatsApp lê o código do país supondo número **com** "+" (S1). Normalize o número dentro da função. |
| Código de erro no cliente | A lista de erros do Auth tem `hook_timeout`, `hook_timeout_after_retry` e `sms_send_failed` (S11). Qual deles chega quando o hook responde erro: [incerto]. O app já traduz os três (`lib/errors.ts`). |

### 4.1 (a) SMS por provedor suportado pelo Supabase

**Como funciona.** O Auth gera o código e o provedor entrega o SMS. Provedores suportados: MessageBird, Twilio, Vonage e TextLocal (este mantido pela comunidade) (S3). O CLI também lista `twilio_verify` (S12). A tela de hoje já usa esse caminho (`channel: 'sms'`).

**Passos.**
1. Criar a conta no provedor. Para a Twilio e a Twilio Verify, o Supabase pede Account SID, Auth Token e Message Service SID (S12).
2. Remetente no Brasil (T4): ID alfanumérico tem pré-registro **opcional**, só para TIM, Claro e Vivo, com 10 semanas de provisionamento informadas pela Twilio; código curto (short code) leva de 2 a 4 semanas; número longo internacional **não preserva** o remetente; número longo brasileiro só serve para mensagens pessoa a pessoa.
3. Painel do Supabase: Authentication > Providers > Phone, habilitar e colar as credenciais (S3).
4. Limites e CAPTCHA (passos 7 e 8).
5. Trocar o texto do SMS para **sem acento** (por exemplo, "Seu codigo WorkEasy: {{ .Code }}"): a Twilio informa que várias operadoras brasileiras trocam acentos por ASCII e que Oi, NEXTEL e CTBC não suportam unicode (T4). O texto de hoje tem "código".

**Custo por código (23/10/2026).**
- Twilio, SMS de saída para o Brasil: **US$ 0,0599 por segmento** ≈ R$ 0,30. A página diz "Pricing current as of October 2026", avisa que podem existir taxas de operadora e cobra US$ 0,001 por mensagem que termina em falha (T1).
- Twilio Verify: US$ 0,05 por verificação **bem-sucedida** mais o canal ≈ US$ 0,11 ≈ R$ 0,55 [estimativa: a página do Verify só lista a tarifa do canal SMS nos EUA; somei a do SMS do Brasil]. Não cobra a taxa base de verificações que falham ou expiram. A taxa base inclui a proteção automática contra "SMS pumping" (Verify Fraud Guard) (T2).
- MessageBird e Vonage: preço para o Brasil [incerto: não consegui abrir página oficial].

**Entrega no Brasil.** Sem estatística pública aberta [incerto]. Limitações que a Twilio informa (T4): a Oi não suporta relatório de entrega; Oi, NEXTEL e CTBC não suportam unicode; várias operadoras trocam acentos por ASCII; não se envia SMS para telefone fixo; entrega a números M2M é "best effort".

**Abuso.**
- O Supabase avisa: para manter o custo de SMS sob controle, ajuste os limites do projeto e configure CAPTCHA (S3).
- Padrão do Auth: 30 SMS por hora no projeto inteiro (S4). No teto, 720 SMS por dia ≈ US$ 43 ≈ **R$ 217 por dia** de exposição máxima [estimativa]. O mesmo teto trava logins legítimos se houver mais de 30 códigos por hora.
- Sem CAPTCHA e com a regra de celular só no navegador, nada impede um pedido para número estrangeiro caro (fraude de tarifa). O que a Twilio chama de "SMS pumping" aparece como tráfego de códigos para destinos incomuns, que o Fraud Guard tenta bloquear. A trava geográfica fica no provedor: o Verify tem Geo Permissions por país e o Fraud Guard bloqueia prefixos suspeitos, só para SMS (T5).

**Regulatório.** LGPD e transferência internacional (seção 8). A política da Twilio para o Brasil pede consentimento prévio, proíbe mensagens de marketing fora de 09h–22h e aos domingos, e proíbe contatar quem está em lista de não perturbe (T4). Código de acesso não é marketing, mas o texto não pode carregar promoção. O DPA da Twilio (atualizado em 09/04/2026) cita a LGPD e aplica cláusulas-padrão brasileiras da Resolução CD/ANPD nº 19/2024 (T6): é o único dos três fornecedores cujos termos abertos citam o Brasil. Regras da Anatel para SMS de aplicativo: [incerto].

**O que muda no repositório** [PLANEJADO]:
- Nenhuma Edge Function. As credenciais ficam no Auth do Supabase.
- `supabase/config.toml`: `[auth.sms.twilio]` (ou `twilio_verify`) com `auth_token = "env(SUPABASE_AUTH_SMS_TWILIO_AUTH_TOKEN)"` (nome do CLI, S12) só para a stack local; `[auth.sms] template` sem acento; `[auth.rate_limit] sms_sent`.
- CAPTCHA: widget em `pages/conta/Entrar.tsx` e `captchaToken` nas duas chamadas de `signInWithOtp` em `services/auth.ts`.
- Texto da nota do celular em `Entrar.tsx` e `README.md` (linha 73).
- `lib/errors.ts` já traduz `sms_send_failed`, `over_sms_send_rate_limit` e `captcha_failed`.

**Quando faz sentido.** Como reserva atrás do hook, ou se a Meta restringir o número. É o único caminho que alcança quem não tem WhatsApp.

### 4.2 (b) WhatsApp pelo hook Send SMS + modelo de autenticação

**Como funciona.** O Auth continua gerando e conferindo o código (`verifyOtp({ type: 'sms' })`, igual ao SMS). Muda quem envia: o Auth chama a função `auth-send-sms` [PLANEJADO], que manda o **modelo de autenticação** pela Cloud API. O texto é fixo e gerado pela Meta ("<código> is your verification code", localizado), com aviso de segurança e validade opcionais e um botão "Copiar código" (M2, M3). A Meta exige modelo de autenticação para OTP: "Only authentication templates can be used to send a one-time passcode for identity verification" (M5).

**Passos.** Partes C a G do runbook (passos 13 a 35): conta Meta e verificação da empresa, número, modelo `codigo_de_verificacao`, função e segredo do hook, CAPTCHA e limites, ligar no painel.

**Contrato de envio** (M3):

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "+5511900000000",
  "type": "template",
  "template": {
    "name": "codigo_de_verificacao",
    "language": { "code": "pt_BR" },
    "components": [
      { "type": "body", "parameters": [{ "type": "text", "text": "123456" }] },
      { "type": "button", "sub_type": "url", "index": "0", "parameters": [{ "type": "text", "text": "123456" }] }
    ]
  }
}
```

O código aparece duas vezes (corpo e botão), com no máximo 15 caracteres. URLs, mídia e emojis não são permitidos em modelo de autenticação (M3, M5).

**Custo por código (23/10/2026).**
- A Meta cobra por mensagem **entregue**, por categoria e pelo país do destinatário (M8). O Brasil tem tarifa própria no cartão de preços.
- O único valor do Brasil em texto na página da Meta é **0,68 centavo de dólar por mensagem**, na nota de rodapé "Based on Meta's current rate for utility and authentication messages to users in Brazil" (M8) ≈ R$ 0,034. [incerto: os valores oficiais em BRL estão nos arquivos "BRL list rates" (CSV) e "BRL rates and volume tiers" (PDF) da página, que não consegui abrir; confira lá antes de contar com este número.]
- Utilidade e autenticação têm faixas de desconto por volume mensal, por mercado (M8). O Brasil **não** está entre os mercados com tarifa "authentication-international" (M9).
- Avisos (utilidade): desde 01/10/2026 a Meta também cobra a mensagem de utilidade enviada dentro da janela de 24 h aberta pelo usuário (M8); não conte com aviso gratuito. Um atendimento com 5 avisos (2 confirmações, 2 lembretes, 1 pagamento) ≈ R$ 0,17 se a tarifa do rodapé valer também para utilidade [estimativa, sem descontos].
- Pelo canal nativo da Twilio (variante b', abaixo): taxa da Twilio de US$ 0,005 por mensagem somada à tarifa da Meta (T3) ≈ R$ 0,06 [estimativa].

**Entrega no Brasil.** Sem estatística pública aberta [incerto]. O que as fontes dizem:
- Falha típica: número sem WhatsApp, ou versão antiga do aplicativo (erro 131026). A Meta informa que os erros chegam na resposta da API, por webhook ou pelos dois (M16): sem o webhook de status (passo 27), o produto pode não saber que a mensagem não foi entregue.
- Mensagem de autenticação é entregue só ao aparelho principal ("linked device security") (M2).
- Validade da tentativa de entrega (TTL) do modelo de autenticação: padrão de 10 minutos, ajustável de 30 s a 15 min (M7).
- A Meta avisa que o WhatsApp não confere a posse do número depois do cadastro e que números reciclados pelas operadoras podem continuar ligados à conta antiga (M4). O mesmo risco existe no SMS. A Meta recomenda oferecer mais de um canal (WhatsApp, e-mail, SMS) e deixar o usuário conferir o número antes do envio (M4, M2).

**Abuso.**
- Custo: no teto padrão do Auth (30 por hora), 720 mensagens por dia ≈ US$ 4,90 ≈ R$ 25 [estimativa].
- O risco principal é outro: alguém digitar o número de **terceiros** e disparar códigos que ninguém pediu. Quem recebe pode bloquear ou denunciar, e a Meta limita a taxa de empresas de baixa qualidade por tempo prolongado (M11) e pode pausar modelos com retorno ruim (M1).
- Mitigações: CAPTCHA; o limite do Auth de uma solicitação a cada 60 s por usuário (S4); cota por número dentro da função (poucos códigos por hora e por dia); recusar tudo que não seja celular +55.
- O payload do hook não tem IP (S1). Limite por IP só no CAPTCHA e nos limites do Auth (S4).

**Regulatório.**
- Política de mensagens da Meta (M19): só contatar quem deu o número **e** deu opt-in; honrar pedidos para parar; iniciar conversa só com modelo aprovado; não usar o WhatsApp para enviar ou pedir informação de saúde quando a regra aplicável proíbe; lista de setores proibidos.
- Opt-in (M11): pode ser geral, mas precisa dizer com clareza que a pessoa aceita receber mensagens da empresa, citar o **nome da empresa** e cumprir a lei aplicável.
- Termos de tratamento de dados do WhatsApp (M20, 22/08/2025): o negócio é controlador e o WhatsApp é operador; transferências por "Global Data Transfer Addendum", que os termos incorporam por referência; os termos não citam Brasil nem LGPD e o aditivo em si não foi aberto [incerto]. [CONDICIONAL: depende de parecer]
- Faturamento em reais pela Meta: passo 16.

**O que muda no repositório** [PLANEJADO]:
- `supabase/functions/auth-send-sms/{index.ts,handler.ts}` e lógica pura em `_shared/` (verificação Standard Webhooks, montagem do envio), com testes em `test/functions/`. Segue o padrão do repositório: handler fino, regra em `_shared`, sem `npm:` em `_shared`.
- Migração **nova** (nunca editar as existentes) com a cota por número, no estilo de `take_assist_quota`, e teste pgTAP.
- `supabase/config.toml`: bloco `[auth.hook.send_sms]` presente mas **desligado**; ligar no painel do projeto hospedado (o CI sobe a stack sem `edge-runtime`, então um hook ligado no arquivo versionado quebraria qualquer teste de login por celular).
- `supabase/functions/.env.example` e a tabela de variáveis em `docs/ARQUITETURA.md` ganham os nomes novos (seção 7).
- `pages/conta/Entrar.tsx`: dizer que o código vai por WhatsApp e pedir para conferir o número (boa prática da Meta, M2, M4); `services/auth.ts` não muda (o canal `'sms'` continua e o hook decide); `lib/errors.ts` mapeia o erro que o hook devolver.

**Variante b': canal `whatsapp` nativo do Supabase.** O Supabase só aceita WhatsApp como canal com Twilio ou Twilio Verify (S3), e o `auth-js` 2.118.0 do repositório já aceita `channel: 'whatsapp'` (conferido nos tipos). Não exige função, mas custa Twilio + Meta, não deixa o servidor recusar números e depende de remetente de WhatsApp na Twilio [incerto: pré-requisitos não abertos]. Não recomendado.

**Quando faz sentido.** Fase 2, depois dos portões da seção 1.2.

### 4.3 (c) Código por e-mail com Resend SMTP

**Como funciona.** O Auth envia o e-mail pelo SMTP configurado e o usuário digita o código de 6 dígitos (`verifyOtp({ type: 'email' })`). O código só aparece se o modelo tiver `{{ .Token }}`: "Email OTPs share an implementation with Magic Links" (S7). Conta nova usa o modelo "Confirm signup"; conta existente usa "Magic Link" (`README.md`).

**Por que SMTP próprio é obrigatório.** O SMTP padrão do Supabase só entrega a endereços da equipe do projeto (os demais recebem "Email address not authorized"), limita a 2 mensagens por hora e não tem SLA (S5, S4).

**Passos.** Parte A do runbook (passos 1 a 8).

**Custo (23/10/2026).**
- Resend (R6, R5): Free US$ 0, com 3.000 e-mails por mês e 100 por dia (contam enviados e recebidos; vários destinatários no mesmo envio contam separado). Pro: US$ 20 por mês com 50.000 e-mails, ou US$ 35 com 100.000; excedente de US$ 0,90 por mil.
- Por e-mail, usando o Pro de US$ 20 por inteiro: US$ 0,0004 ≈ R$ 0,002 [estimativa].
- Limite de taxa: 10 requisições por segundo por equipe, somando todas as chaves e o SMTP (R4, R7). Domínios: 3 no Free, 10 no Pro (R6).
- O limite de 100 por dia do Free soma códigos de login e avisos (cada login novo gasta ao menos um e cada aviso mais um). Com poucas dezenas de usuários ativos por dia ele pode estourar [estimativa]; planeje o Pro (US$ 20 por mês) antes de abrir o beta.

**Entrega no Brasil.** Sem estatística aberta [incerto]. Requisitos que existem: o Gmail exige SPF **ou** DKIM de todos os remetentes e, acima de 5.000 mensagens por dia para contas Gmail, SPF, DKIM e DMARC, com taxa de spam abaixo de 0,3% (O1); o Resend exige bounce abaixo de 4% e spam abaixo de 0,08%, sob risco de pausa (R5). Região de envio São Paulo disponível (R10).

**Abuso.** O Supabase descreve o ataque: robôs cadastram e-mails alheios para queimar a reputação do domínio ou negar o serviço de login. Mitigação principal: CAPTCHA; preferir código único a senha; não desligar a confirmação sob pressão (S5). Depois de configurar SMTP próprio, o Auth impõe 30 mensagens por hora até você ajustar (S5). O custo do abuso é desprezível, a reputação não: use subdomínio exclusivo para o login.

**Regulatório.** LGPD (seção 8). O DPA do Resend (R13, atualizado em 31/12/2025): processamento principal nos EUA; cláusulas-padrão da UE e do Reino Unido e Data Privacy Framework; **não cita** Brasil nem LGPD; os dados da conta ficam nos EUA mesmo com a região São Paulo (R10). [CONDICIONAL: depende de parecer] Lei brasileira específica sobre e-mail comercial: [incerto: não encontrei nem consegui buscar nesta sessão].

**O que muda no repositório.** Nada de código. Opcional [PLANEJADO]: versionar os modelos (`[auth.email.template.confirmation]` e `[auth.email.template.magic_link]` com `content_path`, S12) para a stack local mostrar o código, e aplicar no projeto hospedado pela API de gestão (campos `mailer_templates_confirmation_content` e `mailer_templates_magic_link_content`, S8). Não versionar `[auth.email.smtp]` com credenciais.

**Quando faz sentido.** Lançamento. É o único caminho sem custo por código e sem aprovação externa além do DNS.

---

## 5. Reserva e gatilhos de revisão

| Situação | O que fazer |
|---|---|
| Resend fora do ar ou domínio bloqueado | Trocar o SMTP do Auth e o `RESEND_API_KEY`/`EMAIL_FROM` dos avisos para um segundo provedor já configurado, com DNS pronto (S5 lista Postmark, AWS SES, Brevo e outros). Deixe esse segundo provedor montado antes do lançamento. |
| Meta pausa ou desativa um modelo (erros 132015, 132016) ou restringe o número (131031, 368, 131048) (M16) | Desligar a aba Celular pela flag. Hoje, quem entrou por celular fica sem avisos, porque `private.notify` só tenta WhatsApp: o segundo canal por falha [PLANEJADO] fecha esse buraco. |
| Modelo de utilidade reclassificado para MARKETING | Muda preço e limites. Pedir revisão em até 60 dias pelo WhatsApp Manager ou reescrever o texto sem apelo promocional (M5). |
| Token revogado ou expirado (erro 190) (M16) | O código recebe HTTP 401, marca `failed` e não tenta de novo. Gerar novo token, atualizar `WHATSAPP_TOKEN` e reenfileirar à mão o que falhou. Vigiar `notifications.error` com `http_401`. |
| Muitas falhas 131026 (número sem WhatsApp) | Oferecer e-mail ou SMS na tela; mandar o aviso por e-mail quando o usuário tiver os dois contatos. O limite aceitável é do dono e vem dos dados do beta. |
| Preço da Meta mudou | A Meta só muda preço no 1º dia de janeiro, abril, julho ou outubro, com aviso mínimo de 1 mês para tarifas (M8). Reabra a página de preços a cada trimestre. |
| Alguém reclama de código não pedido | Ver cota por número, CAPTCHA e limites (passos 7, 8 e 30). |

Reabra a decisão se: (i) a verificação da empresa for negada ou demorar além do planejado; (ii) a categoria dos modelos de utilidade mudar para marketing; (iii) o beta mostrar que a maioria dos usuários prefere celular e não tem e-mail ativo; (iv) o parecer do advogado barrar o uso de algum fornecedor.

---

## 6. Runbook numerado

Ordem de execução: **fase 1** (e-mail, passos 1 a 12) é o que o lançamento precisa; **fase 2** (WhatsApp, passos 13 a 35) só depois do aval da seção 1.2. Cada passo diz onde clicar, o que colar e como conferir. Nada aqui foi executado: são instruções para o dono.

Convenções: `<ref>` = identificador do projeto Supabase; `<dominio>` = domínio do WorkEasy; comandos `supabase …` rodam na pasta `apps/web` com o projeto ligado (`supabase link`).

### Fase 1: lançamento por e-mail

#### A. E-mail (Resend) e login por código

**Passo 1. Domínios e região no Resend.**
1. Criar a conta no Resend e abrir Domains > Add Domain.
2. Adicionar **dois subdomínios**: `auth.<dominio>` (códigos de login) e `notificacoes.<dominio>` (avisos). O Resend recomenda subdomínio por finalidade para isolar reputação (R1, R2) e o Supabase recomenda separar o e-mail de autenticação dos demais (S5). O plano Free comporta 3 domínios (R6).
3. Região: **São Paulo (sa-east-1)**, a mais próxima da maioria dos destinatários (R2, R10). Os dados da conta ficam nos EUA de qualquer forma (R10).
4. Deixar desligado o rastreio de abertura e de clique nos dois: o Supabase avisa que rastreio de links deforma os links dos e-mails de login (S13).
- Conferência: os dois domínios aparecem em Domains com status "Pending".

**Passo 2. DNS e verificação.**
1. Na aba Records de cada domínio, copiar os registros **exatamente** como o Resend gera: SPF e DKIM (TXT ou CNAME) e o MX do Return-Path (por padrão `send.<domínio>`) (R2).
2. Cadastrar no provedor de DNS. Se for Cloudflare, deixar cada CNAME **sem proxy** (nuvem laranja desligada), senão a verificação não termina (R2).
3. Aguardar: o domínio costuma verificar em cerca de 15 minutos; às vezes leva até 72 horas. Conferir a propagação em dns.email; passadas 72 horas, usar "Restart verification" (R2).
- Conferência: os dois domínios com a verificação de DNS concluída no painel do Resend.

**Passo 3. DMARC.**
1. Depois da verificação, criar um TXT em `_dmarc.<dominio>` com `v=DMARC1; p=none; rua=mailto:dmarc@<dominio>;` (R3). O endereço do `rua` precisa receber e-mail de verdade.
2. Mandar um e-mail de teste, abrir os cabeçalhos da mensagem recebida (no Gmail, "Mostrar original") e conferir `dmarc=pass` (R3); SPF e DKIM aparecem no mesmo cabeçalho.
3. Com os relatórios mostrando que tudo legítimo passa, subir para `p=quarantine` e, depois, `p=reject` (R3). Não pule o `p=none`.

**Passo 4. Duas chaves de API do Resend.** API keys > Create API Key, permissão **Sending access**, restrita a um domínio (R11):
- `supabase-auth`, restrita a `auth.<dominio>`;
- `notify-dispatch`, restrita a `notificacoes.<dominio>`.
A chave só aparece uma vez (R11): guardar no gerenciador de senhas. Nunca em `VITE_*`, em arquivo versionado ou em código do app. O limite de 10 requisições por segundo é da equipe inteira (R4).

**Passo 5. SMTP do Supabase Auth.** Painel do projeto: Authentication > Emails > SMTP Settings (S13, R8). Preencher:

| Campo | Valor |
|---|---|
| Sender email | `nao-responda@auth.<dominio>` |
| Sender name | `WorkEasy` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | a chave `supabase-auth` |

(R7, R8). Salvar. Conferência: pedir um código para um e-mail **fora** da equipe do projeto; o SMTP padrão recusaria com "Email address not authorized" (S5).

**Passo 6. Modelos "Confirm signup" e "Magic Link" com `{{ .Token }}`.** Authentication > Email Templates (S8). Colar nos **dois** modelos (o primeiro acesso usa "Confirm signup" e os seguintes usam "Magic Link"; se só um tiver o código, quem cair no outro recebe só um link: `README.md` linha 72):

- Assunto: `Seu código de acesso ao WorkEasy`
- Corpo:

```html
<h2>Seu código de acesso</h2>
<p>Use o código abaixo para entrar no WorkEasy:</p>
<p style="font-size:24px;letter-spacing:4px"><strong>{{ .Token }}</strong></p>
<p>Se você não pediu este código, ignore esta mensagem.</p>
```

Texto curto, sem propaganda e sem rodapé de marketing, como o Supabase recomenda para e-mails de autenticação (S5). Conferência: criar uma conta nova e depois entrar de novo com o mesmo e-mail; os dois e-mails precisam mostrar os 6 dígitos.

**Passo 7. Limites de envio do Auth.** Authentication > Rate Limits (S4, S5):
- "Emails sent" (`rate_limit_email_sent`): depois de ligar o SMTP próprio o Auth impõe 30 por hora; ajuste ao tamanho do beta e ao plano do Resend (Free = 100 por dia).
- "Send OTPs or magic links": padrão de 1 pedido a cada 60 s por usuário; manter.
- "Sign-ups and sign-ins" (30 por 5 minutos por IP): atenção a redes compartilhadas (um escritório ou uma rede móvel com muitos usuários pode estourar).
- Expiração do código de e-mail: o padrão é 1 hora (`otp_expiry = 3600`); defina o prazo que o dono aceita (S13). Valor acima de 1 dia é desaconselhado (S7). A mesma configuração vale para links de e-mail (S7).

**Passo 8. CAPTCHA.**
1. Escolher o provedor: Cloudflare Turnstile (plano gratuito, até 20 widgets, desafios ilimitados: O2) ou hCaptcha (S6).
2. Criar o widget e copiar **Sitekey** (pública) e **Secret key** (S6).
3. Supabase: Settings > Authentication > Bot and Abuse Protection > Enable CAPTCHA protection (caminho citado em S6); escolher o provedor, colar o Secret, salvar. O Secret fica só no painel do Supabase.
4. Código [PLANEJADO]: componente do widget (`@marsidev/react-turnstile` ou `@hcaptcha/react-hcaptcha`, S6) em `pages/conta/Entrar.tsx` e `options.captchaToken` nas duas chamadas de `signInWithOtp` em `services/auth.ts` (o tipo existe no `auth-js` 2.118.0). Nova dependência: fixar a versão exata, sem `^`.
5. **Antes de fazer o item 3**, testar o widget em todos os empacotamentos (web, Capacitor com origem `https://localhost` no Android e `capacitor://localhost` no iOS, Tauri com `tauri://localhost`): depois de ligado, toda chamada sem token falha com `captcha_failed`. Se Turnstile ou hCaptcha aceitam essas origens: [incerto, não abri a documentação deles].
- Conferência: pedir código sem o token (por `curl` na API do Auth) e receber `captcha_failed`.

#### B. Avisos por e-mail (`notify-dispatch`)

**Passo 9. Segredos das Edge Functions (e-mail).**

```bash
# supabase/functions/.env.prod fica fora do Git: o .gitignore do app ignora .env.* (só .env.example e .env.native entram)
supabase secrets set --env-file supabase/functions/.env.prod
```

com o arquivo contendo:

```dotenv
SITE_URL=https://<dominio-do-app>
RESEND_API_KEY=<chave notify-dispatch>
EMAIL_FROM="WorkEasy <nao-responda@notificacoes.<dominio>>"
CRON_SECRET=<valor aleatório longo>
```

O nome de um segredo não pode começar com `SUPABASE_`; criar ou apagar exige papel Owner ou Administrator; a função lê o valor novo sem redeploy (S9). `supabase secrets list` confere os nomes (não os valores). Apague o arquivo `.env.prod` depois.

**Passo 10. Publicar `notify-dispatch` sem verificação de JWT.**

```bash
supabase functions deploy notify-dispatch --no-verify-jwt
```

O `pg_cron` autentica com `Bearer <cron_secret>`, que não é um JWT; sem a opção o gateway recusa a chamada antes de a função rodar (README das funções; S10). Hoje o `config.toml` não tem `[functions.notify-dispatch] verify_jwt = false`: a opção na linha de comando é obrigatória a cada publicação (ver seção 9, item 12).

**Passo 11. Vault: `notify_dispatch_url` e `cron_secret`.** No SQL Editor do projeto:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/notify-dispatch', 'notify_dispatch_url');
select vault.create_secret('<mesmo valor de CRON_SECRET>', 'cron_secret');
```

O repositório usa `vault.create_secret(segredo, nome, …)` na migração 06; confira a assinatura no painel do Vault. Sem os dois, o job `workeasy-dispatch-notifications` não chama a função (migração 08). Localmente continuam ausentes de propósito.

**Passo 12. Testar o despacho por e-mail.**
1. Gerar um aviso real: com um usuário de e-mail confirmado, criar um pedido e uma proposta (trigger `proposta_recebida`), ou aceitar um atendimento.
2. Esperar o `pg_cron` (a cada minuto) ou chamar à mão:

```bash
curl -sS -X POST "https://<ref>.supabase.co/functions/v1/notify-dispatch" \
  -H "x-cron-secret: $CRON_SECRET" -H "Content-Type: application/json" -d '{"limit":5}'
```

3. Esperado: `{"ok":true,"data":{"claimed":1,"sent":1,"skipped":0,"retried":0,"failed":0,"released":0}}`. Conferir `notifications.status = 'sent'`, o e-mail na caixa de entrada e `dmarc=pass` no cabeçalho.
4. Sem `CRON_SECRET` a função responde 503; com segredo errado, 401 (`handler.ts`).

### Fase 2: WhatsApp

#### C. Conta Meta e Cloud API

**Passo 13. Pré-requisitos e decisões antes de abrir qualquer conta.**
- Pessoa jurídica aberta (razão social, CNPJ, endereço) e domínio próprio com site em HTTPS no ar mostrando os mesmos dados. A Meta pede razão social, endereço, telefone e site exatamente iguais aos da entidade legal, e site que carregue por HTTPS (M17).
- Política de Privacidade e Termos publicados (frente jurídica).
- **Um número exclusivo para a API, diferente do número do concierge.** Número já em uso no WhatsApp só pode ser registrado se for apagado de lá antes (M12). O número precisa receber SMS ou ligação para o código de confirmação; a Meta recomenda número móvel (M12).
- Nome de exibição decidido depois de buscar a marca no INPI (`docs/DECISOES.md`, seção 8, item 6), seguindo as diretrizes da Meta (M13).
- Quem será o administrador: o dono, com verificação em duas etapas na conta pessoal.

**Passo 14. Portfólio empresarial (Business Portfolio).** Criar em Meta Business Suite com o nome e os dados oficiais da empresa. Só quem tem controle total do portfólio pode iniciar a verificação (M17). Portfólio novo registra no máximo 2 números até a empresa passar pela verificação (M12).

**Passo 15. Verificação da empresa** (M17).
1. Meta Business Suite > Security Center > Start verification.
2. Informar razão social, endereço, telefone e site, iguais aos da entidade legal; o site precisa carregar em HTTPS.
3. Confirmar os dados. Se a Meta não achar o registro ("My business isn't listed"), enviar documentos oficiais, como licença ou contrato social.
4. Escolher como provar a ligação com a empresa: e-mail, telefone, SMS, WhatsApp ou verificação de domínio (meta tag ou registro DNS).
5. Aguardar: a Meta informa que a decisão pode levar até 14 dias úteis. **Alterar os dados depois exige refazer a verificação.**
- Efeito: sobe o limite de destinatários de 250 para 2.000 por 24 horas (M10) e o teto de modelos de 250 para 6.000, desde que haja número com nome de exibição aprovado (M1). Esse limite conta números de destinatários únicos que recebem mensagem fora da janela de atendimento de 24 horas; códigos de acesso e avisos enviados por modelo entram nessa conta (M10).

**Passo 16. App, conta do WhatsApp Business (WABA) e moeda** (M14, M8).
1. developers.facebook.com > Create App > caso de uso **Connect with customers through WhatsApp** > escolher o portfólio > criar ou conectar a conta do WhatsApp Business.
2. **Moeda: escolha BRL ao criar a conta.** A moeda não muda depois (existe uma API de migração). Empresas de integração direta cujo país de cobrança ("Sold-To") no Billing Hub é o Brasil podem criar contas em BRL desde 01/07/2026, são faturadas em BRL pela Facebook Brasil, e as contas **não** BRL desses clientes deixam de entregar mensagens a partir de 01/07/2027 (M8). Que a empresa se enquadre como "Sold-To Brasil": [CONDICIONAL: depende dos dados cadastrados e do contador].
3. Anotar o **ID da conta do WhatsApp Business** (`WABA_ID`), usado para criar modelos.

**Passo 17. Forma de pagamento.** Billing Hub: cadastrar a forma de pagamento antes do primeiro envio; a falta dela é uma das causas do erro 131042 (M16). A Meta cobra apenas mensagens **entregues** (M8). Limite de gasto ou alerta de gasto: [incerto: não abri o procedimento].

**Passo 18. Adicionar e confirmar o número.** WhatsApp Manager > Account tools > Phone numbers > adicionar o número, informar o nome de exibição e confirmar a posse com o código por SMS ou voz (M12, M13).

**Passo 19. Token permanente e IDs** (M14).
1. Business Settings > System users > Add.
2. Assign Assets: o app com **Manage app** e a conta do WhatsApp com **Manage WhatsApp Business accounts**, ambos com controle total.
3. Generate token com as permissões `business_management`, `whatsapp_business_messaging` e `whatsapp_business_management`.
4. Guardar o token no gerenciador de senhas: ele vira `WHATSAPP_TOKEN` (passos 20, 23, 24, 26 e 34).
5. `WHATSAPP_PHONE_NUMBER_ID` é o **ID do número** (só dígitos; aparece em API Setup e em `GET /<WABA_ID>/phone_numbers`, M12). Não é o telefone, não é o `WABA_ID`.
- Nunca em `VITE_*`, nunca no app, nunca em arquivo versionado.

**Passo 20. Registrar o número na Cloud API** (M12). Use o token do passo 19.

```bash
curl -sS "https://graph.facebook.com/v26.0/<PHONE_NUMBER_ID>/register" \
  -H "Authorization: Bearer ${WHATSAPP_TOKEN}" -H 'Content-Type: application/json' \
  -d '{"messaging_product":"whatsapp","pin":"<6 dígitos>"}'
```

- O registro só se faz pela API; adicionar e confirmar o número no painel não basta (M12).
- O PIN de 6 dígitos é a verificação em duas etapas, obrigatória. Guardar no gerenciador de senhas: sem ele não dá para trocar o PIN nem apagar o número (M12).
- Limite de 10 tentativas por 72 horas por número; passou disso, erro 133016 (M12).
- Conferência: `GET https://graph.facebook.com/v26.0/<PHONE_NUMBER_ID>?fields=status,verified_name,name_status` com `status = CONNECTED` (M12, M13).

**Passo 21. Nome de exibição.** Segue as diretrizes da Meta e passa por análise automática quando o limite sobe (M13). Mudança: até 10 vezes em 30 dias, e depois da aprovação é preciso registrar o número de novo em até 14 dias (M13).

#### D. Modelos de mensagem

**Passo 22. Ordem de registro.** Os textos e o JSON de cada modelo estão em `docs/operacao/05-templates-whatsapp.json` (documento irmão, em preparação). A categoria pesa em preço e limites, e a Meta só aceita como utilidade o que for "non-promotional" **e** "specific to or requested by the user" (M5). Registre nesta ordem e só o que for usar:

| Ordem | Modelo | Quando é necessário | Risco de a Meta aprovar como MARKETING [incerto: a Meta decide na análise] |
|---|---|---|---|
| 1 | `codigo_de_verificacao` (AUTHENTICATION) | só se for ligar o hook (parte F) | não se aplica (categoria própria) |
| 2 | `atendimento_confirmado` | primeiro atendimento fechado | baixo (confirmação de pedido) |
| 3 | `lembrete_atendimento` | idem | baixo |
| 4 | `proposta_recebida` | primeiro pedido com proposta | médio: tem chamada para abrir o app |
| 5 | `pagamento_recebido` | quando o Asaas de produção estiver ligado | baixo |
| 6 | `orcamento_respondido` | quando prestadores Pro usarem orçamentos | baixo |
| 7 | `plantao_oferecido` | só quando a linha Cuidado abrir (`docs/DECISOES.md`, D12) | maior: oferta de trabalho que a pessoa não pediu naquele momento |

Se um gatilho enfileirar um modelo que não foi aprovado, a Meta recusa o envio (erro 132001, M16) e, como é erro 4xx, o código marca `failed` sem repetir.

**Passo 23. Criar os modelos.**
- Opção A (painel): WhatsApp Manager > Account tools > Message templates > Create template; categoria, idioma **Portuguese (BR)** (`pt_BR`, M18), nome, corpo, exemplos de cada variável e Submit.
- Opção B (API), com o JSON do documento irmão:

```bash
export WABA_ID=<ID da conta do WhatsApp Business>
export WHATSAPP_TOKEN=<token do usuário do sistema>   # não grave em arquivo versionado
# um modelo por vez, na ordem da tabela (troque o nome no filtro):
jq -c '.templates[] | select(.name == "atendimento_confirmado")' docs/operacao/05-templates-whatsapp.json |
  curl -sS "https://graph.facebook.com/v26.0/${WABA_ID}/message_templates" \
    -H "Authorization: Bearer ${WHATSAPP_TOKEN}" -H 'Content-Type: application/json' -d @-
```

Regras da Meta que os textos precisam cumprir (M6, M1, M18), e que explicam por que `proposta_recebida` e `lembrete_atendimento` têm texto diferente do e-mail:
- variáveis sequenciais (`{{1}}`, `{{2}}`, `{{3}}`) e, no formato posicional, valores na ordem em que os marcadores aparecem no texto; o código envia na ordem de `TEMPLATES[…].params`, então o texto do modelo precisa manter essa ordem;
- o corpo **não pode começar nem terminar com variável**; variáveis demais para o tamanho do texto também reprovam;
- exemplo obrigatório para cada variável; texto duplicado de outro modelo é recusado; corpo de até 1.024 caracteres;
- o nome tem só letras minúsculas, números e sublinhado.
Limite de 100 modelos criados por hora (M1). `message_send_ttl_seconds` de 30 a 43.200 s para utilidade e de 30 a 900 s para autenticação; mensagem não entregue nesse prazo é descartada (M7).

**Passo 24. Acompanhar aprovação e categoria.**
1. Status `PENDING` até `APPROVED`. A Meta informa que a decisão pode levar até 24 horas e avisa por e-mail, WhatsApp Manager e webhook (M1, M6).
2. Conferir a categoria depois da aprovação:

```bash
curl -sS "https://graph.facebook.com/v26.0/${WABA_ID}/message_templates?fields=name,status,category,correct_category" \
  -H "Authorization: Bearer ${WHATSAPP_TOKEN}"
```

`category` igual a `correct_category` (ou `correct_category` vazio) = sem problema. Se divergirem, a Meta reclassifica no primeiro dia do mês seguinte (M5).
3. Desde 09/04/2025, um modelo pedido como utilidade que a Meta julgue marketing é **aprovado como marketing**. Pedido de revisão: até 60 dias, só pelo WhatsApp Manager > Business Support Home > Template Category Updates (M5).
4. Quem usa utilidade para promoção sofre aviso, limite de volume de utilidade e, depois, recategorização de todos os modelos de utilidade (M5). Mantenha os textos transacionais e sem oferta.

**Passo 25. Conferir o modelo de autenticação.**
1. Prévia do texto fixo: `GET /<WABA_ID>/message_template_previews?category=AUTHENTICATION&language=pt_BR&add_security_recommendation=true&code_expiration_minutes=10&button_types=OTP` (M2).
2. `code_expiration_minutes` (1 a 90) precisa ser **igual à validade real do código** no Auth. O padrão do Auth para OTP de celular é 1 hora (S3): reduza a expiração do código de celular para 10 minutos no painel do Auth [incerto: onde fica esse campo na versão atual do painel] ou aumente `code_expiration_minutes` para 60 no modelo.
3. Botão `COPY_CODE`: os botões de um toque e de zero toque exigem código nativo Android (M2) e não funcionam em PWA nem em Capacitor sem integração [PLANEJADO]. No iOS 26 ou superior a sugestão do teclado funciona sem integração (M2), e o campo do código já usa `autoComplete="one-time-code"`.

**Passo 26. Teste de envio manual.**

```bash
curl -sS "https://graph.facebook.com/v26.0/<WHATSAPP_PHONE_NUMBER_ID>/messages" \
  -H "Authorization: Bearer ${WHATSAPP_TOKEN}" -H 'Content-Type: application/json' \
  -d '{"messaging_product":"whatsapp","recipient_type":"individual","to":"+5511900000000","type":"template","template":{"name":"atendimento_confirmado","language":{"code":"pt_BR"},"components":[{"type":"body","parameters":[{"type":"text","text":"Eletricista"},{"type":"text","text":"28/10/2026 às 14:30"},{"type":"text","text":"Carlos Lima"}]}]}}'
```

Enviar ao número do dono **com** e **sem** o "+" e anotar qual chega. A Meta recomenda sempre "+" e código do país; sem o "+", o código do país do **seu** número de envio pode ser prefixado, e para Brasil e México o prefixo adicionado "may be modified" pela Cloud API (M12). O código de hoje envia **sem** "+" (seção 3, linha 12). A resposta traz `contacts[].input` e `wa_id`, que podem ser diferentes (M3).

#### E. Webhook de status de entrega [PLANEJADO]

**Passo 27. Construir `whatsapp-webhook`.**
- **GET** (verificação): comparar `hub.verify_token` com `WHATSAPP_VERIFY_TOKEN`; se bater, responder 200 com o valor de `hub.challenge`; senão, resposta 4xx (M15).
- **POST** (eventos): conferir `X-Hub-Signature-256` = `sha256=` + HMAC-SHA256 do **corpo bruto** com o *app secret* do app (`WHATSAPP_APP_SECRET`), em comparação de tempo constante (já existe `timingSafeEqual` em `_shared/secrets.ts`); responder 200 logo (M15).
- A Meta reenvia por até 7 dias se não receber 200 e pode duplicar; agrupa até 1.000 atualizações por POST. Deduplicar por `statuses[].id` + `status` (M15).
- `statuses[]` traz `sent`, `delivered`, `read` ou `failed`, com `errors[].code` e `pricing`. O campo `biz_opaque_callback_data` devolve o texto que a empresa mandou no envio: usar o `id` da notificação para ligar o evento à linha (M15).
- Publicar com `--no-verify-jwt` (a Meta não envia JWT do Supabase).
- Em `failed`: gravar o código; se o usuário tem e-mail confirmado, enfileirar o mesmo aviso por e-mail; o código 131026 indica número sem WhatsApp (M16).

**Passo 28. Registrar o webhook no painel da Meta.** App Dashboard > WhatsApp > Configuration (ou Use cases > Customize > Configuration): Callback URL `https://<ref>.supabase.co/functions/v1/whatsapp-webhook`, Verify token igual a `WHATSAPP_VERIFY_TOKEN`. Assinar os campos `messages`, `message_template_status_update`, `message_template_quality_update`, `template_category_update`, `account_update` e `account_alerts` (M15, M5). O app precisa estar em modo **Live**: alguns webhooks não são enviados em modo Dev (M15). mTLS é opcional (M15).

**Passo 29. Guardar o status (migração nova).** Colunas novas em `notifications` (por exemplo `provider_message_id`, `delivered_at`, `provider_error`) em **nova** migração (não editar as existentes), com teste pgTAP e `lib/database.types.ts` regenerado. Atualizar `docs/ARQUITETURA.md`.

#### F. Código de acesso por WhatsApp (hook) [PLANEJADO]

**Passo 30. Escrever a função `auth-send-sms`.** Contrato da função (fontes S1, S2, S14, M3):
1. Aceitar só POST; ler o corpo **bruto** (`await req.text()`) antes de interpretar.
2. Verificar Standard Webhooks: montar `${webhook-id}.${webhook-timestamp}.${corpo}`, calcular HMAC-SHA256 com a chave decodificada da parte base64 de `SEND_SMS_HOOK_SECRETS` (sem o prefixo `v1,whsec_`), codificar o resultado em base64 e comparar em tempo constante com cada assinatura `v1,<base64>` do cabeçalho (separadas por espaço). Recusar se o `webhook-timestamp` estiver fora de uma tolerância (a especificação não fixa o valor; sugestão de 5 minutos). Resposta de recusa: 401 (o Auth a trata como erro).
3. Ler `user.id`, `user.phone` e `sms.otp`; exigir `otp` de 6 dígitos.
4. Normalizar o telefone (só dígitos) e **aceitar apenas celular brasileiro** (`55` + DDD + `9` + 8 dígitos); o resto é recusado.
5. Cota por número, no banco, com função `security definer` e `search_path` fixo, no padrão de `take_assist_quota`; guardar só um *hash* do telefone, não o número.
6. Deduplicar por `webhook-id` (o Auth repete a chamada em 429 e 503, S2).
7. Enviar o modelo de autenticação (JSON da seção 4.2) com `AbortSignal.timeout(3500)`, para caber no orçamento de 5 s (S2); `to` com "+"; `biz_opaque_callback_data` com um identificador sem dado pessoal.
8. Sucesso: `200` com corpo `{}` e `Content-Type: application/json`. Falha do provedor: resposta JSON `{"error":{"http_code":500,"message":"…"}}` (formato dos exemplos de S1/S2).
9. **Nunca registrar o código nem o telefone inteiro** nos logs.
10. Reserva por SMS: se a Meta recusar o envio de forma síncrona, tentar o SMS (Twilio) dentro do mesmo orçamento [opcional].

**Passo 31. Segredo do hook.** Authentication > Hooks > Send SMS > HTTP: gerar o segredo (formato `v1,whsec_<base64>`, S2). Guardar com `supabase secrets set SEND_SMS_HOOK_SECRETS='v1,whsec_…'` (S2).

**Passo 32. Publicar e ligar.**

```bash
supabase functions deploy auth-send-sms --no-verify-jwt
```

No painel: Authentication > Hooks > Send SMS, tipo HTTP, URL `https://<ref>.supabase.co/functions/v1/auth-send-sms`, habilitar (S2). Se o painel ainda exigir um provedor de SMS ativo mesmo com o hook ligado: [incerto, testar].

**Passo 33. Testar o hook.**
- Assinatura errada ou ausente: o Auth recebe recusa e devolve erro ao app; conferir qual mensagem o usuário vê (`lib/errors.ts`) e ajustar o mapa se for preciso.
- Celular brasileiro válido com WhatsApp: a mensagem chega com o código e o botão "Copiar código"; `verifyOtp` entra.
- Número fixo, estrangeiro ou sem 9º dígito: recusado sem custo na Meta.
- Pedir de novo em menos de 60 s: bloqueado pelo Auth (S4). Pedir muitas vezes por hora: bloqueado pela cota própria.
- Resposta acima de 5 s: o Auth devolve `hook_timeout` (S11); medir o tempo real.
- Conferir nos logs da função que não aparece nenhum código OTP.

#### G. Ligar o WhatsApp nos avisos

**Passo 34. Segredos do WhatsApp.**

```bash
supabase secrets set WHATSAPP_TOKEN=<token do passo 19> WHATSAPP_PHONE_NUMBER_ID=<id do passo 19> \
  WHATSAPP_GRAPH_VERSION=v26.0
# só para o hook e o webhook (partes E e F):
supabase secrets set WHATSAPP_OTP_TEMPLATE=codigo_de_verificacao WHATSAPP_APP_SECRET=<app secret> WHATSAPP_VERIFY_TOKEN=<texto aleatório>
```

A partir daí `notify-dispatch` passa a enviar WhatsApp; antes disso as linhas de WhatsApp saíam como `skipped: whatsapp_not_configured`, e **não são reenviadas** depois (a linha já terminou).

**Passo 35. Aceite da fase 2.**
- [ ] `GET /<PHONE_NUMBER_ID>?fields=status,name_status,quality_rating` com `CONNECTED` e nome aprovado.
- [ ] Todos os modelos em uso com `APPROVED` e `category = correct_category`.
- [ ] Envio manual (passo 26) recebido; formato do `to` decidido (com ou sem "+").
- [ ] `notify-dispatch` com uma linha real de WhatsApp: `sent: 1`, mensagem recebida.
- [ ] Número de teste **sem** WhatsApp: a falha aparece no webhook (131026) e o lote não para.
- [ ] Hook: celular válido entra; fixo e estrangeiro são recusados; nada do código OTP nos logs.
- [ ] CAPTCHA funcionando nos quatro empacotamentos.
- [ ] Texto de aceite (seção 8.3) publicado e revisado pelo advogado.

---

## 7. Variáveis e segredos

### 7.1 Lidas hoje pelo código

O código lê o ambiente em um único ponto: `readConfig(name => Deno.env.get(name))` em `supabase/functions/_runtime/supabase.ts`, com os nomes definidos em `_shared/config.ts` (busca por `Deno.env` feita em 23/10/2026: nenhuma outra chamada).

| Nome | Para que serve | Quem usa | Onde se define | Sem ela |
|---|---|---|---|---|
| `SUPABASE_URL` | URL do projeto, para criar os clientes Supabase | todas as funções | injetada pelo Supabase | erro `SUPABASE_URL / service key missing` |
| `SUPABASE_PUBLISHABLE_KEYS` (JSON `{"default":"sb_publishable_…"}`) ou `SUPABASE_ANON_KEY` (legado) | chave pública usada com o JWT de quem chama, para a RLS valer | funções com usuário | injetadas | quem chama não é autenticado |
| `SUPABASE_SERVICE_ROLE_KEY` (legado, tem prioridade no código) ou `SUPABASE_SECRET_KEYS` (JSON) | chave de serviço: ignora a RLS; só para escritas do servidor | todas | injetadas | erro acima |
| `SITE_URL` | origem do app: entra no CORS e no link "Abrir o WorkEasy" dos e-mails de aviso | `notify-dispatch` (link) e CORS de todas | `supabase secrets set` | e-mail sai sem o link |
| `ALLOW_DEV_ORIGINS` | `true` libera `localhost:3000` no CORS (também liga sozinho com o Asaas sandbox) | todas | só em desenvolvimento | nunca definir em produção |
| `CRON_SECRET` | segredo do agendador; `notify-dispatch` aceita `x-cron-secret` ou `Authorization: Bearer` | `notify-dispatch` | `supabase secrets set` **e** o mesmo valor no Vault (`cron_secret`) | a função responde 503 |
| `WHATSAPP_TOKEN` | token do usuário do sistema da Meta (Bearer na Graph API) | `notify-dispatch` | `supabase secrets set` | linhas de WhatsApp saem `skipped: whatsapp_not_configured` |
| `WHATSAPP_PHONE_NUMBER_ID` | ID numérico do número de envio; entra na URL `/{id}/messages` (a função recusa valor não numérico) | `notify-dispatch` | idem | idem |
| `WHATSAPP_GRAPH_VERSION` | versão da Graph API; padrão `v26.0`; formato `vNN.N` | `notify-dispatch` | idem (opcional) | usa `v26.0` |
| `RESEND_API_KEY` | chave do Resend (Bearer em `POST /emails`) | `notify-dispatch` | `supabase secrets set` | linhas de e-mail saem `skipped: email_not_configured` |
| `EMAIL_FROM` | remetente, `Nome <endereço@domínio-do-Resend>` | `notify-dispatch` | idem | idem |
| `ASAAS_API_KEY`, `ASAAS_BASE_URL`, `ASAAS_WEBHOOK_TOKEN`, `PRO_GRACE_DAYS` | pagamentos e assinatura Pro | funções de pagamento | idem | fora deste assunto (ver `docs/pesquisa/asaas.md`) |
| `ANTHROPIC_API_KEY`, `ASSIST_HOURLY_LIMIT` | assistente de pedidos | `request-assist` | idem | fora deste assunto |

Nota: a tabela de variáveis de `docs/ARQUITETURA.md` não lista `SITE_URL` nem `WHATSAPP_GRAPH_VERSION`, que o código lê.

### 7.2 Previstas neste plano [PLANEJADO]

| Nome | Para que serve | Quem usaria |
|---|---|---|
| `SEND_SMS_HOOK_SECRETS` | segredo `v1,whsec_…` do hook Send SMS (S2) | `auth-send-sms` |
| `WHATSAPP_OTP_TEMPLATE` | nome do modelo de autenticação (`codigo_de_verificacao`) | `auth-send-sms` |
| `WHATSAPP_APP_SECRET` | *app secret* do app Meta, para conferir `X-Hub-Signature-256` | `whatsapp-webhook` |
| `WHATSAPP_VERIFY_TOKEN` | texto aleatório da verificação GET do webhook | `whatsapp-webhook` |
| credenciais da Twilio (nomes a definir) | reserva por SMS dentro do hook | `auth-send-sms` |

### 7.3 Fora das Edge Functions

- **Vault (banco):** `notify_dispatch_url` e `cron_secret` (migração 08).
- **Painel do Supabase Auth:** senha do SMTP (a chave `supabase-auth` do Resend), segredo do CAPTCHA e, se a opção (a) for usada, as credenciais do provedor de SMS.
- **Cliente (públicas):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_CONCIERGE_WHATSAPP`, `VITE_SITE_URL`. A *sitekey* do CAPTCHA é pública e pode ir em uma variável `VITE_*`; o Secret, nunca.
- **Regra:** nenhum segredo em `VITE_*`. O teste `test/claims-guard.test.ts` reprova `WHATSAPP_TOKEN`, `RESEND_API_KEY`, `service_role` e afins no código do cliente.

---

## 8. Privacidade e regras de mensagens (rascunho para o advogado)

### 8.1 Pontos, fontes e o que falta decidir

| # | Ponto | Fonte (aberta em 23/10/2026) | Aplicação ao WorkEasy | Marca |
|---|---|---|---|---|
| 1 | Telefone e e-mail são dado pessoal (art. 5º, I). "Dado referente à saúde" é dado pessoal sensível (art. 5º, II). | L1 | Aviso com ocupação de saúde + nome da pessoa (ex.: "atendimento de Psicólogo… com Maria") pode revelar dado de saúde; a linha Cuidado envolve idosos. | [CONDICIONAL: depende de parecer] |
| 2 | Princípios: finalidade, adequação, necessidade, transparência, segurança, prevenção (art. 6º, I a VIII). | L1 | Mensagem de código e de aviso com o mínimo necessário; política de privacidade deve listar Meta, Resend, Twilio (se usada) e Supabase. | |
| 3 | Bases legais: consentimento (art. 7º, I), execução de contrato ou procedimentos preliminares a pedido do titular (art. 7º, V), legítimo interesse (art. 7º, IX). | L1 | Qual base cobre (i) o código de acesso e (ii) os avisos de pedido, proposta, atendimento e pagamento. Marketing, se existir um dia, é outra conversa. | [CONDICIONAL: depende de parecer] |
| 4 | Consentimento: por escrito ou outro meio que demonstre a vontade; ônus da prova do controlador; finalidades determinadas; revogável a qualquer momento por procedimento gratuito e facilitado (art. 8º, caput, §2º, §4º, §5º). | L1 | Se o aceite do WhatsApp for por consentimento, é preciso registrar (a tabela `consents` não tem finalidade própria para isso) e oferecer revogação (hoje não existe). | [CONDICIONAL: depende de parecer] |
| 5 | Direitos do titular, inclusive oposição ao tratamento sem consentimento e revogação (art. 18, §2º e IX). | L1 | Controle de avisos na conta [PLANEJADO]. | |
| 6 | Transferência internacional (art. 33) e Regulamento da ANPD (Resolução CD/ANPD nº 19/2024, DOU de 23/08/2024): mecanismos válidos são decisão de adequação, cláusulas-padrão, normas corporativas, cláusulas específicas ou as hipóteses do art. 33; as cláusulas-padrão da ANPD valem se adotadas "integral e sem alteração" (art. 16); quem já usava cláusulas contratuais tinha 12 meses da publicação para incorporá-las (art. 2º, parágrafo único). A transferência se limita ao mínimo necessário (art. 9º, parágrafo único). | L1, L2 | Meta/WhatsApp, Resend (EUA) e Twilio são importadores de telefone e e-mail. | [CONDICIONAL: depende de parecer] |
| 7 | Contratos dos fornecedores: WhatsApp (termos de 22/08/2025): negócio controlador, WhatsApp operador, transferência por "Global Data Transfer Addendum" (incorporado por referência; não abri o aditivo), sem citar Brasil nem LGPD nos termos. Resend (DPA de 31/12/2025): processamento nos EUA, cláusulas-padrão da UE/UK e Data Privacy Framework, sem citar Brasil. Twilio (DPA de 09/04/2026): cita a LGPD e aplica cláusulas-padrão brasileiras da Res. CD/ANPD nº 19/2024. | M20, R13, T6 | O advogado define se basta o que cada fornecedor oferece ou se é preciso aditivo. | [CONDICIONAL: depende de parecer] |
| 8 | Política de mensagens da Meta: só contatar quem deu o número e deu opt-in; respeitar pedidos para parar; iniciar conversa só com modelo aprovado; não usar o WhatsApp para telemedicina ou para enviar/pedir informação de saúde se a regra aplicável proíbe; lista de setores proibidos ou restritos. | M19, M11 | Ver 8.2 e 8.3. | |
| 9 | Regras da Twilio para SMS no Brasil: consentimento antes de qualquer comunicação; marketing só entre 09h e 22h e nunca aos domingos; sem SMS para quem está em lista de não perturbe; sem SMS para telefone fixo. | T4 | Valem só se a opção (a) for usada. Código de acesso não é marketing. | |
| 10 | Anatel, CONAR e qualquer lei brasileira específica sobre SMS e e-mail comerciais. | — | Não consegui abrir fonte primária. | [incerto] |

### 8.2 O que a política da Meta pede e o produto ainda não faz

- **Opt-in com o nome da empresa** (M11): a tela de login só tem o aceite dos Termos; não diz que o número receberá mensagens por WhatsApp nem quem as envia.
- **Opt-out** (M19, M11): "You must respect all requests… to block, discontinue, or otherwise opt out"; hoje não há como pedir para parar [PLANEJADO]. O modelo `avisos_ativados` e a resposta "SAIR", previstos no documento irmão, também dependem de um webhook de entrada que não existe.
- **Saúde** (M19): a Meta proíbe usar o WhatsApp para enviar ou pedir informação de saúde "if applicable regulations prohibit distribution of such information to systems that do not meet heightened requirements". Ocupações de saúde e a linha Cuidado exigem texto genérico nos avisos até o parecer. [CONDICIONAL: depende de parecer]
- **Setores proibidos** (M19): a lista inclui, entre outros, produtos médicos e de saúde, serviços para adultos, namoro e cobrança de dívidas, "irrespective of the global or local licenses". O catálogo tem 1.710 ocupações; conferir se alguma cai nessa lista antes de pedir a verificação da empresa [incerto: não fiz a varredura].
- **Perfil comercial**: manter e-mail, site ou telefone de suporte no perfil do WhatsApp Business (M19).

### 8.3 Texto-rascunho de aceite para a aba Celular [PLANEJADO]

Para o advogado revisar. A primeira frase atende à exigência da Meta de dizer que a pessoa aceita receber mensagens e de citar a empresa (M11); a segunda só entra quando existir o controle de avisos.

> Ao informar seu celular, você aceita receber por WhatsApp o código de acesso e os avisos de pedidos, propostas, atendimentos e pagamentos do WorkEasy, enviados por [RAZÃO SOCIAL], CNPJ [CNPJ]. Saiba quais fornecedores recebem seu número na Política de Privacidade.
>
> [Só com o controle pronto:] Você pode parar de receber os avisos em Conta > Avisos.

Quando o canal de celular for WhatsApp, a nota da aba (hoje "O envio por SMS depende do provedor…") deve dizer que o código vai por WhatsApp e permitir conferir o número antes de enviar (M2, M4).

### 8.4 Perguntas para o advogado

1. Que base legal da LGPD (art. 7º) cobre o código de acesso e os avisos transacionais por WhatsApp e por e-mail? O aceite dos Termos na tela de login basta ou o WhatsApp exige aceite separado e registrado (art. 8º)?
2. Meta (WhatsApp), Resend e Twilio recebem telefone e e-mail no exterior. Quais mecanismos do art. 33 da LGPD e da Resolução CD/ANPD nº 19/2024 cobrem cada um, dado que os termos do WhatsApp e do Resend não citam o Brasil e o da Twilio cita? É preciso aditivo com as cláusulas-padrão da ANPD? O caráter internacional precisa constar da política de privacidade?
3. Avisos com nome da ocupação e da outra parte (psicólogo, fisioterapeuta, cuidador) podem revelar dado de saúde (art. 5º, II)? Podemos manter esses nomes ou usamos texto genérico para ocupações de saúde?
4. A política da Meta sobre informação de saúde e a linha Cuidado (idosos) cria risco de restrição da conta? O que o advogado recomenda excluir das mensagens?
5. Que forma e prazo de "parar de receber avisos" a LGPD (art. 8º, §5º; art. 18, §2º e IX) e a política da Meta exigem para mensagens transacionais?
6. Por quanto tempo guardar os registros de envio (tabela `notifications`, com telefone, e-mail e parâmetros) e como isso se encaixa na exclusão de conta? Hoje a exclusão do usuário apaga as notificações em cascata.
7. Existe obrigação específica da Anatel, do CONAR ou de outra norma brasileira para SMS ou e-mail transacional (identificação do remetente, horário, descadastro)? Não consegui verificar.
8. Tributação da fatura da Meta em reais (emitida pela Facebook Brasil) e da cobrança de Resend e Twilio como serviço do exterior: tratar com o contador.
9. Incluir Meta, Resend, Twilio e Supabase no RIPD e no registro das operações de tratamento (documentos L06 e L07 da frente jurídica).

---

## 9. Pendências do produto (encontradas ao ler o código; nenhuma foi corrigida aqui)

1. **Sem CAPTCHA** em `/entrar`: `services/auth.ts` não envia `captchaToken`; `[auth.captcha]` está comentado no `config.toml`.
2. **Regra "só celular brasileiro" apenas no navegador** (`lib/phone.ts`, `services/auth.ts`): a API do Auth aceita outros números.
3. **Texto do SMS com acento** (`[auth.sms] template = "Seu código WorkEasy: {{ .Code }}"`) e limites locais de `email_sent = 2` e `sms_sent = 30` por hora, que precisam de valores próprios em produção.
4. **Modelos de e-mail do login só no painel** (`README.md`, linha 72); `[auth.email.template.*]` está comentado, então nada garante o `{{ .Token }}` em produção.
5. **`to` sem "+"** em `buildWhatsAppTemplate`, contra a recomendação da Meta; os testes `test/functions/notifications.test.ts` e `webhook-notify.test.ts` fixam `5511987654321`.
6. **`sent` quer dizer "a API aceitou"**: sem webhook de status e sem coluna para o id da mensagem (migração 08).
7. **Sem segundo canal**: `private.notify` escolhe um canal só; falha de WhatsApp não vira e-mail.
8. **`private.notify` trata "telefone confirmado" como "tem WhatsApp"**; só vale se o telefone foi confirmado por WhatsApp.
9. **Sem opt-out nem consentimento próprio para WhatsApp** (`consent_purpose` não tem a finalidade; não há preferências de aviso).
10. **Nome da ocupação e da outra parte nas mensagens** (`_shared/notification-context.ts`): risco de dado de saúde (seção 8).
11. **Repetição só por status HTTP** (`isRetryableStatus`: 429 e 5xx): erros de limite que a Meta devolva com outro 4xx (por exemplo 130429 ou 131056) viram `failed` [incerto: não confirmei o status HTTP desses erros].
12. **`verify_jwt = false` só no README das funções**: o `config.toml` não tem `[functions.*]`; `notify-dispatch` e `asaas-webhook` dependem de `--no-verify-jwt` a cada publicação.
13. **`docs/ARQUITETURA.md` não lista `SITE_URL` nem `WHATSAPP_GRAPH_VERSION`.**
14. **`config.toml` versionado tem o celular de teste com código fixo (`[auth.sms.test_otp]`) e a Twilio com valores `local-placeholder`.** Se o arquivo for aplicado a um projeto hospedado (por exemplo com `supabase config push` [incerto: não confirmei o que esse comando envia]), o código fixo passaria a valer em produção. O próprio arquivo avisa "Never copy this block to a hosted project". Usar arquivo separado para produção.
15. **Texto da aba Celular e do `README.md` falam só em SMS** (`Entrar.tsx`, linhas 199–205; `README.md`, linha 73): mudam quando o canal for WhatsApp.
16. **Validade do código**: `otp_expiry = 3600` para e-mail; o padrão para celular é 1 hora (S3), mas o modelo de autenticação sugerido diz 10 minutos.
17. **`lib/errors.ts` não conhece o erro que o hook devolve** [incerto qual seja].
18. **Sem tratamento de bounce nem de reclamação do Resend** (R12): o Resend exige bounce abaixo de 4% e spam abaixo de 0,08% (R5) e, sem webhook, só o painel mostra as taxas.

---

## 10. Fontes consultadas

Todas abertas em **23/10/2026**. Quando a página existe em versão Markdown (`.md`), li essa versão. "Fornecedor" = página do próprio fornecedor, fonte primária só para o preço e a política dele. Nenhuma fonte secundária (blog, escritório de advocacia, revendedor) foi usada para fato: a busca devolveu guias de terceiros sobre verificação da empresa, e usei no lugar a página oficial da Meta (M17).

### Banco Central

| ID | URL | O que li |
|---|---|---|
| B1 | https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='10-22-2026'&$format=json | PTAX de 22/10/2026: `cotacaoCompra` 5,0377 e `cotacaoVenda` 5,0383 (23/10/2026 ainda sem cotação) |

### Supabase e Standard Webhooks

| ID | URL | O que li (trecho) |
|---|---|---|
| S1 | https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook | contrato do hook; "No outputs are required. An empty response with a status code of 200 is taken as a successful response." |
| S2 | https://supabase.com/docs/guides/auth/auth-hooks | cabeçalhos Standard Webhooks; "20KB payload limit"; "time budget of 5s for the entire webhook invocation"; Send SMS nos planos Free e Pro |
| S3 | https://supabase.com/docs/guides/auth/phone-login | "WhatsApp is only supported as a channel for the Twilio and Twilio Verify Providers"; aviso de custo de SMS: ajustar limites e CAPTCHA |
| S4 | https://supabase.com/docs/guides/auth/rate-limits | "2 emails per hour with the built-in email provider"; "Defaults to 30 SMS messages per hour." |
| S5 | https://supabase.com/docs/guides/auth/auth-smtp | SMTP padrão só para a equipe, 2 por hora, sem SLA; 30 por hora ao ligar SMTP próprio; abuso; DKIM, DMARC, SPF; separar e-mail de autenticação |
| S6 | https://supabase.com/docs/guides/auth/auth-captcha | hCaptcha e Cloudflare Turnstile; caminho no painel |
| S7 | https://supabase.com/docs/guides/auth/auth-email-passwordless | "Email OTPs share an implementation with Magic Links."; expiração de 1 hora |
| S8 | https://supabase.com/docs/guides/auth/auth-email-templates | variável `{{ .Token }}`; pré-visualização de links; campos `mailer_templates_*` da API de gestão |
| S9 | https://supabase.com/docs/guides/functions/secrets | `supabase secrets set`; "A secret name can't start with SUPABASE_." |
| S10 | https://supabase.com/docs/guides/functions/function-configuration | `verify_jwt = false`; `--no-verify-jwt` |
| S11 | https://supabase.com/docs/guides/auth/debugging/error-codes | `hook_timeout`, `hook_timeout_after_retry`, `sms_send_failed`, `over_sms_send_rate_limit`, `captcha_failed` |
| S12 | https://supabase.com/docs/guides/local-development/cli/config | chaves `auth.hook.<nome>.enabled/uri/secrets`, `auth.sms.<provedor>.*`, `auth.email.template.<tipo>.*`, `auth.email.smtp.*` |
| S13 | https://supabase.com/docs/guides/deployment/going-into-prod | lista de produção: SMTP próprio, expiração do OTP, CAPTCHA, desligar rastreio de links |
| S14 | https://raw.githubusercontent.com/standard-webhooks/standard-webhooks/main/spec/standard-webhooks.md | `msg_id.timestamp.payload`, HMAC-SHA256, `whsec_`, cabeçalhos, tolerância de timestamp, comparação em tempo constante |

### Meta (WhatsApp Business Platform)

Base: https://developers.facebook.com/documentation/business-messaging/whatsapp/

| ID | Caminho | O que li (trecho) |
|---|---|---|
| M1 | `templates/overview` | categorias; nomes; parâmetros posicionais "in the order in which their corresponding placeholders appear"; "up to 100 templates… per hour"; 250 ou 6.000 modelos |
| M2 | `templates/authentication-templates/authentication-templates` | texto fixo; botões; "linked device security"; `code_expiration_minutes` 1 a 90; iOS 26 |
| M3 | `templates/authentication-templates/copy-code-button-authentication-templates` | JSON de criação e de envio; o código "must appear twice"; máximo de 15 caracteres |
| M4 | `templates/authentication-templates/authentication-best-practices` | números reciclados; opt-in; deixar o usuário conferir o número |
| M5 | `templates/template-categorization` | critérios de utilidade; "Only authentication templates can be used to send a one-time passcode"; reclassificação desde 09/04/2025; revisão em 60 dias; restrições por abuso |
| M6 | `templates/template-review` | "It can take up to 24 hours…"; motivos de recusa: variáveis fora de ordem, corpo que começa ou termina com variável |
| M7 | `templates/time-to-live` | TTL: autenticação 10 min (30 s a 15 min); utilidade 30 dias (30 s a 12 h) |
| M8 | `pricing` | cobrança por mensagem entregue; rodapé do Brasil (0,68 centavo); BRL desde 01/07/2026; fim das contas não BRL em 01/07/2027; calendário de preços; utilidade em janela de atendimento cobrada desde 01/10/2026 |
| M9 | `pricing/authentication-international-rates` | lista de mercados; o Brasil não consta |
| M10 | `messaging-limits` | 250 destinatários únicos por 24 h; 2.000 com verificação; escala automática |
| M11 | `getting-opt-in` | opt-in obrigatório; precisa citar o nome da empresa; qualidade e limite de taxa |
| M12 | `business-phone-numbers/phone-numbers` e `…/registration` | requisitos do número; "+" e código do país; Brasil e México; registro só pela API; PIN; 10 tentativas por 72 h; teto de 2 números |
| M13 | `display-names` | nome de exibição; 10 mudanças em 30 dias; registrar de novo em 14 dias |
| M14 | `get-started` | app com caso de uso WhatsApp; usuário do sistema; permissões do token |
| M15 | `webhooks/overview`, `webhooks/create-webhook-endpoint`, `webhooks/reference/messages/status` | verificação GET; `X-Hub-Signature-256`; reenvio por 7 dias; lotes de 1.000; `statuses`, `errors`, `biz_opaque_callback_data` |
| M16 | `support/error-codes` | 131026, 131042, 131048, 132001, 132015, 132016, 133016, 190, 368 e demais |
| M17 | https://www.facebook.com/business/help/2058515294227817 | verificação da empresa: passos, dados, "may take up to 14 business days" |
| M18 | `templates/components` e `templates/supported-languages` | corpo de até 1.024 caracteres; `pt_BR` |
| M19 | https://www.whatsapp.com/legal/business-policy/ | opt-in; modelos; saúde; setores proibidos |
| M20 | https://www.whatsapp.com/legal/business-data-processing-terms | controlador e operador; transferências por aditivos incorporados por referência (aditivos não abertos); "Last updated: 22 August 2025" |

### Resend

Base: https://resend.com/docs/

| ID | Caminho | O que li (trecho) |
|---|---|---|
| R1 | `dashboard/domains/introduction` | domínio próprio; subdomínio recomendado |
| R2 | `add-a-domain` | passos de DNS; região; verificação em ~15 min, até 72 h; CNAME sem proxy |
| R3 | `dashboard/domains/dmarc` | `p=none`, `quarantine`, `reject`; `rua` |
| R4 | `api-reference/rate-limit` | "10 requests per second per team"; cotas diária e mensal |
| R5 | `knowledge-base/resend-sending-limits` | Free: 100 por dia e 3.000 por mês; bounce abaixo de 4%; spam abaixo de 0,08%; retenção de 30 dias |
| R6 | `knowledge-base/what-is-resend-pricing` | Free, Pro US$ 20 e US$ 35, excedente US$ 0,90 por mil; domínios por plano |
| R7 | `send-with-smtp` | `smtp.resend.com`, portas, usuário `resend`; mesmo limite da API |
| R8 | `send-with-supabase-smtp` | passo a passo no painel do Supabase |
| R9 | `dashboard/emails/idempotency-keys` | cabeçalho `Idempotency-Key`; 24 horas |
| R10 | `dashboard/domains/regions` | São Paulo (sa-east-1); dados da conta nos EUA |
| R11 | `create-an-api-key` | "Sending access" e restrição por domínio |
| R12 | `webhooks/introduction` | eventos de entrega, bounce e reclamação (não implementado no produto) |
| R13 | https://resend.com/legal/dpa | processador; EUA; cláusulas-padrão UE/UK; DPF; sem citar Brasil; 31/12/2025 |
| R14 | `api-reference/errors` | códigos 403 e 429 de domínio e cota |

### Twilio (fornecedor)

| ID | URL | O que li |
|---|---|---|
| T1 | https://www.twilio.com/en-us/sms/pricing/br | "Pricing current as of October 2026"; SMS de saída US$ 0,0599; falha US$ 0,001 |
| T2 | https://www.twilio.com/en-us/verify/pricing | US$ 0,05 por verificação bem-sucedida mais canal; Fraud Guard na taxa base |
| T3 | https://www.twilio.com/en-us/whatsapp/pricing | "Pricing current as of September 2026"; US$ 0,005 por mensagem somados à tarifa da Meta |
| T4 | https://www.twilio.com/en-us/guidelines/br/sms | remetentes, opt-in, horário de marketing, fixo, acentos, Oi, unicode |
| T5 | https://www.twilio.com/docs/verify/preventing-toll-fraud/sms-fraud-guard | bloqueio de prefixos suspeitos; só SMS; Geo Permissions por país |
| T6 | https://www.twilio.com/en-us/legal/data-protection-addendum | atualizado em 09/04/2026; LGPD; cláusulas brasileiras da Res. CD/ANPD nº 19/2024 |

### Outras

| ID | URL | O que li |
|---|---|---|
| O1 | https://support.google.com/a/answer/81126 | requisitos de remetente do Gmail desde 01/02/2024 |
| O2 | https://developers.cloudflare.com/turnstile/plans/ | plano gratuito: até 20 widgets, desafios ilimitados |

### Legislação e regulação

| ID | URL | O que li |
|---|---|---|
| L1 | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm | Lei 13.709/2018 (LGPD), texto compilado: arts. 5º, 6º, 7º, 8º, 9º, 10, 11, 18 e 33 |
| L2 | https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024 | Resolução CD/ANPD nº 19/2024: arts. 2º (parágrafo único), 3º, 5º, 6º, 7º, 9º, 15 e 16 |
| L3 | https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd | índice das resoluções da ANPD (usei para localizar a nº 19/2024; as demais, como a nº 15/2024 sobre incidentes, só tiveram o título lido) |

### Repositório (leitura)

`apps/web/docs/ARQUITETURA.md`, `apps/web/docs/DECISOES.md`, `apps/web/README.md`, `apps/web/supabase/config.toml`, `supabase/functions/README.md`, `supabase/functions/.env.example`, `notify-dispatch/{handler,index}.ts`, `_shared/{notifications,notification-context,config,secrets,validate,dates,money}.ts`, `_runtime/supabase.ts`, `pages/conta/Entrar.tsx`, `services/{auth,account}.ts`, `lib/{phone,errors}.ts`, `config/{features,legal}.ts`, `supabase/migrations/20261019000008_notifications.sql`, `test/claims-guard.test.ts`, `test/functions/notifications.test.ts`, `docs/operacao/05-templates-whatsapp.json`, e os tipos de `node_modules/@supabase/auth-js` 2.118.0.

---

## 11. O que não consegui verificar

- **Tarifas da Meta em reais** para autenticação e utilidade no Brasil: os valores estão em CSV e PDF cujos endereços não aparecem no texto da página; só há um número em texto (nota de rodapé). Também não abri a página interativa de preços (carrega por script).
- **Preço de SMS da MessageBird e da Vonage** no Brasil, e a tarifa do canal SMS dentro do Twilio Verify para o Brasil.
- **Regras da Anatel, do CONAR ou de lei específica** sobre SMS e e-mail comerciais; a cota de buscas da sessão acabou antes dessa parte, e os endereços diretos que tentei (Anatel, páginas da ANPD) não trouxeram o texto.
- **Textos de resoluções da ANPD além da nº 19/2024** (incidentes, agentes de pequeno porte, encarregado): só vi os títulos no índice.
- **Taxa de entrega** de SMS, WhatsApp e e-mail no Brasil, e a penetração do WhatsApp entre os usuários-alvo: nenhuma fonte primária aberta.
- **Se o hook dispensa um provedor de SMS ativo** no painel do Supabase, **se conta no limite `sms_sent`**, **onde se ajusta a expiração do OTP de celular** e **qual código de erro o Auth devolve** quando o hook falha.
- **Que categoria a Meta atribuirá** a cada modelo; **formato do `to`** (com ou sem "+") para números brasileiros; procedimento de **limite de gasto** no Billing Hub.
- **Turnstile e hCaptcha dentro de WebView** (origens `capacitor://localhost`, `tauri://localhost`) e pré-requisitos do WhatsApp na Twilio.
- **Se `supabase config push`** enviaria o bloco de teste do `config.toml` para um projeto hospedado.
- **Nada foi executado** contra serviços reais: toda conta, URL e comando acima é instrução, não resultado.
