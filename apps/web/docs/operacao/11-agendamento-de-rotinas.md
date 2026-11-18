# Agendamento da remoção dos antecedentes

> **Ação do dono.** O repositório não cria este agendamento: ele depende de um segredo e do projeto Supabase de produção, que só o dono configura. Nenhum valor real aparece aqui; só nomes.

| Campo | Valor |
|---|---|
| Função | `background-check-purge` (Edge Function, `apps/web/supabase/functions/background-check-purge`) |
| Banco | `background_check_purge_candidates` e `mark_background_check_purged` (migração `20261118400002_background_check_purge.sql`) |
| Frequência | Uma vez por dia, às 03:20 UTC (00:20 em Brasília) |
| Prazo | 30 dias após a retirada do consentimento. A constante `retention_days` fica em `background_check_purge_candidates`. O prazo padrão ainda precisa ser validado com o advogado; mudá-lo exige nova migração. |

## O que a rotina faz

1. Busca as linhas de `provider_documents` com `deletion_requested_at` há mais de 30 dias e que ainda têm arquivo.
2. Remove cada arquivo do bucket `provider-documents`.
3. Chama `mark_background_check_purged` para a linha. Se o documento tem revisão (`reviewed_at`) ou registro em `audit_log`, a linha fica, sem `storage_path` e com status `purged`. Caso contrário, a linha é apagada.
4. Responde `{ "purged": n, "failed": m }`. Uma falha em um arquivo é registrada e não impede os demais; a linha continua candidata e tenta de novo na rodada seguinte.

Cada expurgo grava `document.purged` em `audit_log`, com `kept` indicando se a linha foi mantida.

## Ações do dono, nesta ordem

### 1. Segredo da função (`CRON_SECRET`)

Use o mesmo valor que o `notify-dispatch` já usa. Sem ele a função responde 503.

```bash
supabase secrets set CRON_SECRET='<valor>' --project-ref <ref>
```

Não grave o valor no repositório.

### 2. Endereço da função no Vault

No SQL do projeto de produção, por quem tem acesso ao banco, cadastre o endereço da função com `vault.create_secret`, como descrito em `docs/arquitetura/infra.md`:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/background-check-purge', 'background_check_purge_url');
```

A chave `cron_secret` do Vault precisa ter o mesmo valor de `CRON_SECRET`. Ela já existe se o agendamento do `notify-dispatch` estiver ativo. Se o valor mudar, troque os dois.

### 3. Agendamento

Só depois dos passos 1 e 2:

```sql
select cron.schedule(
  'workeasy-background-check-purge',
  '20 3 * * *',
  $$select net.http_post(
      url := (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'background_check_purge_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select ds.decrypted_secret from vault.decrypted_secrets ds where ds.name = 'cron_secret')),
      body := '{}'::jsonb
  )$$
);
```

Se o Vault não tiver `background_check_purge_url`, a URL fica nula e a execução aparece como falha em `cron.job_run_details`. Não há envio silencioso.

### 4. Conferir

Depois da primeira execução (03:20 UTC), veja o código HTTP da chamada:

```sql
select id, status_code, content, created
  from net._http_response
 order by id desc
 limit 5;
```

A resposta esperada é `200`, com `{"ok":true,"data":{"purged":n,"failed":m}}`. Um `401` indica que o `cron_secret` do Vault difere de `CRON_SECRET`. Um `503` indica que `CRON_SECRET` não está configurado na função.

Para testar à mão, sem esperar a rodada:

```bash
curl -sS -X POST "https://<ref>.supabase.co/functions/v1/background-check-purge" \
  -H "x-cron-secret: $CRON_SECRET"
```

Sem o cabeçalho a resposta é `401`. Com o cabeçalho certo e nenhuma linha vencida, a resposta é `200` com `purged` e `failed` zerados.

## Desligar e religar

Para desligar:

```sql
select cron.unschedule('workeasy-background-check-purge');
```

Para religar, rode o bloco do passo 3.

## Efeitos que o dono precisa conhecer

- **Aprovação das ocupações.** Ao expurgar um antecedente aceito, o gatilho `provider_documents_revoke_approvals` retira a aprovação das ocupações que exigem esse documento (evento `occupation.approval_revoked`, causa `document_purged`). A retirada do consentimento, sozinha, não faz isso: o efeito acontece na data do expurgo.
- **Painel do admin.** Documentos expurgados não são listados, porque não têm arquivo para abrir. O registro continua em `audit_log` (`document.viewed`, `document.purged`, e os demais eventos do documento).
- **Cadastro do prestador.** Um documento expurgado não conta como etapa entregue: a etapa volta a aparecer como não enviada.
- **Volume.** Cada rodada processa todas as linhas vencidas. Se o volume crescer e a função estourar o limite de tempo da Edge Function, as linhas não processadas ficam para a rodada seguinte.
