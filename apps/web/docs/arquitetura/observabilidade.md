# Observabilidade e medição de funil

Rascunho para revisão de advogado. Não é parecer jurídico.

Este documento descreve o que o WorkEasy mede, o que não mede e por quê, como ativar o relato
de erros e como cada evento de produto se liga aos indicadores (KPIs). Ele é técnico e não
afirma nada sobre validação clínica, certificação ou desempenho em produção: o produto ainda é
um protótipo não implantado e sem usuários reais.

## 1. Princípios

- **Sem rastreadores de terceiros na página.** Não há pixel, script de analytics nem tag de
  publicidade em `index.html`. A medição de funil é própria (tabela `product_events`).
- **Relato de erros opcional.** O Sentry só é carregado quando a variável `VITE_SENTRY_DSN`
  está preenchida. Sem ela, nada sai do navegador para monitoramento e o pacote não cresce
  (o SDK entra por `import()` dinâmico, só nesse caminho).
- **Nenhum dado de conteúdo.** Relatos de erro e eventos de produto não carregam nome, telefone,
  e-mail, documento (CPF/CNPJ), texto livre, corpo de requisição ou resposta.
- **Dados da área da saúde ficam fora.** Pedidos e registros de saúde não entram em nenhum
  evento. O painel e os eventos tratam apenas de identificadores e valores de enum.

## 2. O que é medido

### 2.1 Erros (Sentry, opcional)

Quando ativado, o SDK `@sentry/react` (versão fixada em `apps/web/package.json`) envia:

- exceções não tratadas e rejeições de promessa do navegador;
- exceções capturadas pelo limite de erro da aplicação (`components/ErrorBoundary.tsx`), com o
  nome dos componentes do caminho do erro (`componentStack`);
- nome da versão (`VITE_APP_VERSION`), quando preenchida.

Configuração em `lib/observability.ts`:

- `dataCollection` desligado para usuário, cookies, cabeçalhos, parâmetros de URL, corpos de
  requisição e resposta, variáveis locais das pilhas e conteúdo de IA, GraphQL, MCP e filas;
- `tracesSampleRate: 0` (sem rastreamento de desempenho);
- `replaysSessionSampleRate: 0` e `replaysOnErrorSampleRate: 0` (sem gravação de sessão);
- `beforeSend` que mascara em todas as strings do evento: e-mail, telefone brasileiro, CPF e
  CNPJ (formatados ou só dígitos); remove a query string e o fragmento das URLs; apaga o
  usuário, corpos, cookies, cabeçalhos e a query string da requisição; descarta migalhas de
  navegação (`breadcrumbs`) que carregam valores de formulário.

### 2.2 Eventos de produto (`public.product_events`)

Onze eventos, gravados por gatilhos `security definer` nas tabelas de negócio. Cada etapa é
gravada uma vez: na inserção, ou quando o status (ou a flag) passa a valer a etapa. Uma
atualização que mantém o mesmo status não grava nada.

| Evento | Quando é gravado | Quem (`user_id`) | Sobre o que (`subject_id`) | `props` |
|---|---|---|---|---|
| `request_created` | pedido inserido | cliente | pedido | `occupation_slug` |
| `proposal_sent` | proposta inserida com status `sent` | prestador | pedido | (vazio) |
| `booking_requested` | agendamento inserido com status `requested` | cliente | agendamento | `origin`, `occupation_slug` |
| `booking_accepted` | agendamento inserido ou passado a `accepted` | prestador | agendamento | `origin`, `occupation_slug` |
| `payment_received` | pagamento inserido ou passado a `received`/`confirmed` | pagador | agendamento | `method` |
| `provider_submitted` | prestador inserido ou passado a `pending_review` | prestador | prestador | (vazio) |
| `provider_approved` | prestador inserido ou passado a `approved` | prestador | prestador | (vazio) |
| `occupation_approved` | ocupação do prestador aprovada (`approved = true`) | prestador | prestador | `occupation_slug` |
| `pro_trial_started` | assinatura inserida ou passada a `trialing` | prestador | prestador | `plan` |
| `pro_subscribed` | assinatura inserida ou passada a `active` | prestador | prestador | `plan` |
| `review_published` | avaliação inserida ou publicada (`published = true`) | cliente | agendamento | (vazio) |

`props` contém apenas identificadores (slug da ocupação, que é chave do catálogo) e valores de
enum (`origin`, `method`, `plan`). O banco recusa `props` com 512 bytes ou mais e recusa
qualquer evento fora da lista acima.

Dois eventos têm regra além da inserção, decidida para que o funil reflita o que acontece de
fato:

- `pro_subscribed` também é gravado quando a assinatura passa de `pending` ou `trialing` para
  `active`. O fluxo real insere a assinatura como `pending` ou `trialing` e só depois a torna
  `active`, então gravar apenas na inserção nunca registraria uma assinatura paga.
- `payment_received` não é gravado de novo quando o pagamento passa de `confirmed` para
  `received` (o gateway envia os dois avisos).

A coluna `day` é o dia do calendário de São Paulo, calculado a partir de `occurred_at`.

### 2.3 Leitura pelo administrador

- A tabela só tem permissão de leitura para `authenticated`, e a política de linha permite a
  leitura apenas quando `is_admin()` é verdadeiro. Anônimos não leem nem escrevem.
- `public.admin_funnel_daily(p_from, p_to)` devolve a contagem por dia e por evento, no máximo
  para 400 dias por chamada. Só administradores podem executá-la.
- Não há painel nesta frente. A tela de administração (`admin_metrics`) será estendida em outro
  trabalho.

## 3. O que não é medido e por quê

- **Nada de identificação por publicidade.** Não há identificador de dispositivo, cookie de
  terceiro, pixel nem perfil de publicidade. Os eventos não servem para perfilar pessoas.
- **Nenhuma gravação de sessão ou de tela.** Gravar a tela expõe o que a pessoa digita e os
  dados de saúde que aparecem na página.
- **Nenhum texto livre.** Descrições de pedidos, mensagens de propostas, avaliações e notas
  nunca entram em `props` nem no relato de erros. Quando a mensagem de um erro traz dados
  pessoais, o `beforeSend` os mascara, mas o texto original não sai do navegador.
- **Nenhum tempo de tela, rolagem ou clique.** Não há necessidade operacional comprovada, e
  esses dados revelam comportamento individual.
- **Nenhuma medição de conversão de publicidade.** O produto não compra tráfego pago nesta fase.
- **Nenhum evento de login ou de navegação.** O funil começa no pedido e termina na avaliação.

## 4. Base legal e retenção

`[incerto]` Esta seção descreve a intenção do desenho. Os artigos da Lei nº 13.709/2018 (LGPD)
não foram conferidos no texto oficial: a consulta ao planalto.gov.br foi bloqueada na sessão em
que este documento foi escrito. Antes de depender desta seção, o advogado deve confirmar o
enquadramento, inclusive a hipótese de legítimo interesse para métricas operacionais e a
necessidade de aviso de privacidade específico.

Intenção do desenho:

- **Finalidade:** medir a operação (quantos pedidos viram propostas, agendamentos, pagamentos e
  avaliações) e detectar falhas do produto. Não há finalidade publicitária.
- **Hipótese:** legítimo interesse do controlador para métricas operacionais agregadas, sem
  perfil de publicidade. `[incerto]` quanto ao enquadramento legal exato.
- **Necessidade:** só identificadores e enums; nenhum dado pessoal em `props`; nenhum conteúdo
  de formulário.
- **Retenção:** eventos são apagados após 400 dias por um job do `pg_cron` (`product-events-retention`,
  todo dia às 03:17 UTC). Quando a conta é excluída, `user_id` vira nulo; `subject_id` é um
  identificador sem vínculo direto com o titular.
- **Dados de saúde:** nenhum evento ou relato de erro deve conter dado de saúde. Esta regra é
  verificada pelo teste de `props` no pgTAP (`supabase/tests/database/40_product_events.test.sql`)
  e pelos testes de mascaramento em `test/observability/`.
- **Titular:** o titular pode pedir acesso e eliminação pelos canais já previstos no produto.
  `[incerto]` Se os eventos precisam entrar na exportação LGPD da conta (`lgpd-export`) é uma
  decisão a tomar; hoje não entram.

## 5. Como ativar o relato de erros

1. Crie um projeto no Sentry na região escolhida pelo responsável (União Europeia ou Estados
   Unidos). A escolha é do dono do produto.
2. Copie o DSN do projeto.
3. Defina no ambiente de build (não no repositório):
   - `VITE_SENTRY_DSN` com o DSN;
   - `VITE_APP_VERSION` com o identificador da versão (por exemplo, o hash do commit), opcional.
4. Gere um novo build. As variáveis `VITE_*` são embutidas no JavaScript público, por isso o DSN
   é visível para quem abre o site. Ele não é segredo, mas também não deve ser versionado.
5. Verifique, em um ambiente de teste, que um erro provocado aparece no projeto e que o evento
   não contém e-mail, telefone ou URL com query string.

A política de conteúdo já libera os hosts de ingestão do Sentry da UE
(`*.ingest.de.sentry.io`) e dos EUA (`*.ingest.sentry.io` e `*.ingest.us.sentry.io`), no site
(`public/_headers`) e no desktop (`src-tauri/tauri.conf.json`). Outra região exige acrescentar
o host nas duas políticas e em `SENTRY_INGEST` de `scripts/check-headers.mjs`. Sem essa
alteração, o navegador bloqueia o envio em silêncio.

Sem `VITE_SENTRY_DSN`, o comportamento é o de sempre: nenhuma chamada ao Sentry, nenhum
carregamento do SDK.

## 6. Mapa dos eventos para os KPIs

`docs/operacao/08` não existe na árvore de trabalho desta frente (`apps/web`) e não foi lido.
O mapa abaixo usa os nomes dos indicadores como descritos no pedido de trabalho. `[incerto]`:
conferir cada linha contra `docs/operacao/08` quando o arquivo estiver disponível.

| Indicador (nome de trabalho) | Eventos usados | Como calcular |
|---|---|---|
| Demanda: pedidos por dia | `request_created` | contagem por `day` |
| Oferta: propostas por pedido | `proposal_sent` por `subject_id` | propostas ÷ pedidos |
| Agendamentos solicitados e aceitos | `booking_requested`, `booking_accepted` | aceitos ÷ solicitados, por `origin` |
| Pagamentos recebidos | `payment_received` | contagem por dia e método |
| Avaliações publicadas | `review_published` | avaliações ÷ agendamentos aceitos |
| Entrada de prestadores | `provider_submitted`, `provider_approved` | aprovados ÷ enviados |
| Ocupações habilitadas | `occupation_approved` | ocupações aprovadas por dia |
| Início do Pro | `pro_trial_started` | contagem por dia |
| Conversão para Pro pago | `pro_trial_started`, `pro_subscribed` | assinaturas ativas ÷ trials iniciados |

Os cálculos são feitos com `admin_funnel_daily`. Nenhum número é publicado como resultado
até que existam dados reais; o produto não foi implantado.

## 7. Limites conhecidos

- O `day` é calculado por uma função marcada como `immutable` para permitir coluna gerada. O
  fuso de São Paulo não tem horário de verão desde 2019; se a regra mudar, a coluna deve ser
  recalculada por migração nova.
- A inscrição de um gatilho usa `security definer` com `search_path` vazio. Um erro de gravação
  em um desses gatilhos aborta a operação de negócio que o disparou. A tabela aceita apenas
  valores pequenos e válidos, então isso é raro, mas não é zero.
- Relatos de erro enviados antes do carregamento assíncrono do SDK não são reenviados.
- Os testes do banco (pgTAP) e a migração não foram executados nesta sessão de trabalho; ver o
  relatório da entrega.
