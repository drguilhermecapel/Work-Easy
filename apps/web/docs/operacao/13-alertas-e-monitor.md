# Alertas e monitor de disponibilidade

> **Ação do dono.** O repositório traz a verificação (`scripts/healthcheck.mjs`), mas não liga nada sozinho: um agendador ou um monitor externo depende de conta, de segredo e do endereço de produção, que ainda não existem. Nenhum valor real aparece aqui; só nomes.

| Campo | Valor |
|---|---|
| Verificação | `apps/web/scripts/healthcheck.mjs` (Node 22, sem dependências, só `GET`) |
| Testes | `apps/web/test/ops/healthcheck.test.ts`, contra um servidor HTTP local |
| Endereço | `--url`, ou a variável `VITE_SITE_URL` |
| Resultado | Código de saída 0 (tudo certo), 1 (alguma página falhou), 2 (uso errado) |
| Criado por esta frente | Nenhum workflow agendado, nenhuma conta, nenhum alerta |

## O que a verificação confere

Para cada página pedida (`/` por padrão):

1. resposta HTTP 200, depois de no máximo 3 redirecionamentos dentro da mesma origem (o Cloudflare Pages redireciona `/servicos` para `/servicos/`);
2. tipo `text/html` e um corpo que parece uma página HTML;
3. os cabeçalhos de segurança iguais aos de `public/_headers`, o arquivo que o Cloudflare serve: `Content-Security-Policy`, `Strict-Transport-Security` (só em https), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` e `Cross-Origin-Resource-Policy`. O `Cache-Control` não é comparado;
4. resposta dentro do prazo (`--timeout`, 10 segundos por padrão).

Cada falha aparece em uma linha com o motivo, e o processo termina com código 1. Ela não confere o conteúdo do app (login, dados do Supabase) nem o certificado além do que o `fetch` já recusa.

## Como rodar à mão

```bash
cd apps/web
VITE_SITE_URL=https://<domínio-do-site> node scripts/healthcheck.mjs
node scripts/healthcheck.mjs --url https://<domínio-do-site> --paths /,/servicos/
```

Saída com tudo certo:

```
ok     https://<domínio-do-site>/ (HTTP 200)
ok     https://<domínio-do-site>/servicos/ (HTTP 200)
Healthcheck ok: 2 página(s).
```

Se `public/_headers` mudar, o script passa a exigir o valor novo: publique o site antes de rodar (ou rode e espere a falha até a publicação terminar).

## Como ligar a um agendador

O repositório **não** traz um workflow com `schedule`: ele dependeria do endereço de produção, que ainda não existe, e geraria uma execução com falha por dia. Duas formas de ligar, quando houver endereço.

### Opção A. Monitor externo (recomendado)

Um serviço de monitoramento de terceiros (a escolha e a conta são do dono) consulta o site de fora, de vários pontos, e avisa por e-mail ou mensagem. Configure:

- URL: `https://<domínio-do-site>/` e `https://<domínio-do-site>/servicos/`;
- esperado: HTTP 200, intervalo de 1 a 5 minutos, aviso após 2 falhas seguidas;
- destinatário: um e-mail ou número que o dono leia (não o do repositório).

Vantagem: continua avisando se o GitHub estiver fora do ar. Limite: não confere os cabeçalhos de segurança; para isso, use a opção B de vez em quando ou depois de cada publicação.

### Opção B. Workflow agendado no GitHub (desligado por padrão)

Crie o arquivo só quando houver o endereço. Modelo, para o dono revisar antes de usar. O `schedule` é a **única** diferença de um workflow comum e fica comentado:

```yaml
name: Monitor do site

on:
  workflow_dispatch:
  # schedule:
  #   - cron: '17 */2 * * *'   # a cada 2 horas; descomente só depois de testar com o botão Run workflow

permissions:
  contents: read

jobs:
  healthcheck:
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Conferir o site
        working-directory: apps/web
        env:
          VITE_SITE_URL: ${{ vars.VITE_SITE_URL }}
        run: node scripts/healthcheck.mjs --paths /,/servicos/
```

Notas:

- Nenhum segredo é necessário: a verificação só faz `GET` em páginas públicas. O endereço vem da variável `VITE_SITE_URL`. O `deploy-web.yml` a lê do ambiente `production`, e um job sem `environment` não enxerga variáveis de ambiente: crie a mesma variável também no nível do repositório (Settings, Secrets and variables, Actions, Variables), para o job não esperar a aprovação do ambiente `production`. É um endereço público, não um segredo.
- Quando o job falha, o GitHub envia e-mail a quem criou ou editou o `schedule` por último, e mostra a falha na aba Actions. Isso é um alerta fraco: confira em Settings, Notifications, se esse e-mail é lido.
- GitHub pode atrasar ou pular execuções agendadas em horários de pico, e desliga o agendamento de repositórios sem atividade por 60 dias. Por isso a opção A é a recomendada para disponibilidade.
- O repositório tem um teste que impede o `deploy-supabase.yml` de ganhar `schedule`; o workflow do monitor é um arquivo novo e separado.

## Alertas automáticos do banco

O banco não avisa ninguém sozinho. O que existe é a rotina diária de leitura (`docs/operacao/12-checagens-diarias.md`): alguém precisa abri-la. Para alerta de verdade, as saídas dependem de conta e decisão do dono, em ordem de esforço:

1. **E-mails do Asaas.** O Asaas avisa por e-mail nas tentativas 5, 10 e 15 de um webhook com falha (`RUNBOOKS`, item 1). Cadastrar no Asaas um e-mail que o dono leia. Sem código.
2. **Alertas do Supabase** (painel, depende do plano) para uso de banco e erros das Edge Functions.
3. **Relato de erros do app** (Sentry): código pronto, ativação depende de conta (`docs/arquitetura/observabilidade.md`).
4. **Consulta periódica das checagens por um agendador próprio** (por exemplo, um job do `pg_cron` que grava o painel numa tabela, ou uma Edge Function que lê o painel e avisa): exige decisão sobre onde enviar o aviso e sobre dados pessoais no aviso. Não está feito. Registrar como decisão antes de construir.

## O que ainda precisa do dono

| Item | Quem | Observação |
|---|---|---|
| Endereço de produção (`VITE_SITE_URL`) | Dono | Sem ele nenhuma das opções liga |
| Escolher e contratar um monitor externo, ou criar o workflow da opção B | Dono | A opção A não usa o repositório |
| E-mail ou número que receba os avisos | Dono | |
| Cadastrar o e-mail de alerta no Asaas | Dono | `RUNBOOKS`, item 1 |
| Decidir se quer alerta automático do banco (item 4 acima) | Dono e técnico | |
