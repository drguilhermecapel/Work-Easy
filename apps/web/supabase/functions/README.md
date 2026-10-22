# Edge Functions

Contrato: `docs/ARQUITETURA.md` (seção "Edge Functions").

```
_shared/            regras puras (sem Deno.*, sem npm:), testadas com Vitest em test/functions
_runtime/           integração Deno: env, clientes Supabase, operações de banco reutilizadas
<nome>/handler.ts   handler(req, deps): toda a lógica da função, com dependências injetadas
<nome>/index.ts     monta as dependências reais e chama Deno.serve
```

Respostas: `{ "ok": true, "data": ... }` ou `{ "ok": false, "error": { "code", "message", "details?" } }`.

## Verificar

```bash
deno check --config supabase/functions/deno.json supabase/functions/*/index.ts
(cd supabase/functions && deno lint)
npx vitest run test/functions
npx eslint test/functions --max-warnings 0   # supabase/functions é do Deno e está fora do eslint
```

O `--config` é necessário: a partir da raiz do app, sem ele o Deno usa o
`package.json` e não acha os pacotes `npm:` das funções.

## Rodar localmente

Com a stack local de pé (`supabase start`) e `supabase/functions/.env` preenchido a partir de `.env.example`:

```bash
supabase functions serve --env-file supabase/functions/.env
```

`asaas-webhook` e `notify-dispatch` não recebem JWT de usuário: rodar com
`--no-verify-jwt` localmente e, no deploy, `verify_jwt = false` para essas duas
em `supabase/config.toml` (ou `supabase functions deploy <nome> --no-verify-jwt`).

Exemplos (`$JWT` é o access token de um usuário logado; `$ANON` a chave publicável):

```bash
BASE=http://127.0.0.1:54321/functions/v1
H=(-H "Authorization: Bearer $JWT" -H "apikey: $ANON" -H 'Content-Type: application/json')

curl "${H[@]}" -d '{"name":"Ana","email":"ana@example.com","cpf_cnpj":"52998224725","birth_date":"1990-05-10","mobile_phone":"11987654321","income_value_cents":500000,"address":"Rua A","address_number":"10","province":"Pinheiros","postal_code":"05422000"}' $BASE/asaas-onboard
curl "${H[@]}" -d '{"booking_id":"<uuid>","method":"pix","cpf_cnpj":"52998224725"}' $BASE/payments-create
curl "${H[@]}" -d '{"quote_id":"<uuid>","method":"boleto","customer":{"cpf_cnpj":"52998224725","name":"Cliente"}}' $BASE/charges-create
curl "${H[@]}" -d '{"booking_id":"<uuid de um atendimento cancelado>"}' $BASE/payments-void
curl "${H[@]}" -d '{"action":"subscribe","method":"pix"}' $BASE/subscriptions-manage
curl "${H[@]}" -d '{"action":"cancel"}' $BASE/subscriptions-manage
curl "${H[@]}" -X POST $BASE/account-export
curl "${H[@]}" -d '{"confirm":"EXCLUIR"}' $BASE/account-delete
curl "${H[@]}" -d '{"text":"Tem um vazamento embaixo da pia, preciso hoje"}' $BASE/request-assist

curl -H "asaas-access-token: $ASAAS_WEBHOOK_TOKEN" -H 'Content-Type: application/json' \
  -d '{"id":"evt_teste_1","event":"PAYMENT_RECEIVED","payment":{"id":"pay_xxx","dueDate":"2026-10-19"}}' $BASE/asaas-webhook
curl -H "x-cron-secret: $CRON_SECRET" -H 'Content-Type: application/json' -d '{"limit":20}' $BASE/notify-dispatch
```

No sandbox do Asaas, configure o webhook da conta raiz (Integrações → Webhooks)
apontando para `<SUPABASE_URL>/functions/v1/asaas-webhook` com o mesmo
`ASAAS_WEBHOOK_TOKEN` (32 a 255 caracteres). As subcontas criadas por
`asaas-onboard` recebem o webhook sozinhas, com a URL `...?acct=<provider_id>` e um
token derivado só daquele prestador; para testar à mão, calcule-o com
`deriveSubaccountToken` (`_shared/secrets.ts`). O webhook confere cada cobrança no
Asaas antes de agir, então no sandbox o `payment.id` do exemplo acima precisa
existir na conta.

## Templates de notificação

Os nomes e a ordem das variáveis de `notifications.params` estão em
`_shared/notifications.ts` (`TEMPLATES`). Cada template precisa ser aprovado
no WhatsApp Manager com o mesmo nome, idioma `pt_BR` e as variáveis nessa ordem.
Chaves terminadas em `_cents` viram valor em reais; em `_at`, data e hora de São Paulo.
