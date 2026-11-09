# Administração: configurações, aprovação de ocupações e métricas

Nota de arquitetura da área administrativa (telas em `pages/admin/`, serviços em `services/admin.ts`,
componentes em `components/admin/`). O contrato técnico geral continua em `docs/ARQUITETURA.md`.

Quem usa: administradores da plataforma. A regra de quem pode executar cada ação está no banco
(`is_admin()` nas políticas RLS e em cada função `admin_*`). A tela só esconde o que não é do
administrador e explica a recusa do banco. Nada aqui é validação clínica nem aprovação
regulatória: a conferência do registro no conselho é feita por uma pessoa, e o sistema só guarda
o que ela informou.

## 1. Configurações da plataforma

Tabela `platform_settings`, escrita apenas por `admin_set_setting(p_key, p_value)`. A função
recusa com `invalid_setting` (classe 23514) quando o tipo ou a faixa não batem. A checagem
existe no banco e também na tela (`NUMBER_LIMITS` em `services/admin.ts`).

| Chave | Tipo e faixa | Zero significa |
| --- | --- | --- |
| `commission_bps` | inteiro, 0 a 5.000 (pontos-base) | comissão zero |
| `pro_price_cents` | inteiro, 100 a 100.000 (centavos) | não se aplica |
| `proposal_limit` | inteiro, 1 a 10 | não se aplica (mínimo 1) |
| `labor_lock_days_per_week` | inteiro, 1 a 7 | não se aplica (mínimo 1) |
| `commission_cap_cents` | inteiro, 0 a 1.000.000 (centavos) | sem teto na comissão |
| `free_proposals_per_month` | inteiro, 0 a 100 | sem limite de propostas no plano gratuito |
| `pro_trial_days` | inteiro, 0 a 90 | sem teste grátis do Pro |
| `commission_enabled`, `escrow_enabled` | verdadeiro ou falso | desligado |

Histórico: as três últimas chaves foram criadas em `20261022000012_monetization.sql` e passavam sem
checagem no `admin_set_setting` original (`20261019000011_admin.sql`). A migração
`20261023200000_admin_settings_and_metrics.sql` recria a função com `create or replace` (o arquivo
antigo não foi editado) e passa a checar as três. Chaves desconhecidas continuam passando, como antes.

Ligar a comissão ou a retenção exige digitar a frase de confirmação (`ENABLE_PHRASES`). As duas
começam desligadas (`DEFAULT_SETTINGS`).

A tela `pages/admin/Configuracoes.tsx` separa duas seções: "Valores e limites" e "Plano Pro, plano
gratuito e teto da comissão". As chaves `commission_cap_cents`, `free_proposals_per_month` e
`pro_trial_days` ficam na segunda, com o zero explicado em cada linha. Valores em reais são digitados
com vírgula (`parseReaisToCents`) e guardados em centavos.

Os padrões do cliente (`DEFAULT_SETTINGS` em `config/features.ts`) são o que as regras usam quando a
chave falta ou está ilegível: sem teto, 5 propostas gratuitas por mês e sem teste. Uma tela de venda
que quiser prometer um número deve ler o valor salvo, não o padrão.

## 2. Aprovação de ocupações

Aprovar o prestador (`admin_set_provider_status`) e aprovar cada ocupação
(`admin_set_occupation_approval`) são ações separadas. Só a ocupação aprovada aparece na busca e
recebe pedidos e agendamentos.

Regras do banco, que a tela repete para poupar uma ida ao servidor (`approvalCheck`):

- a ocupação precisa de política no catálogo (`policy missing`);
- o registro não pode estar rejeitado (`registry rejected`);
- todos os passos que a política exige precisam ter documento aceito (`documents_missing`, com os
  passos em `details`).

Quando a política pede registro profissional e o prestador não informou o número, o trigger
`provider_occupations_registry` recusa a gravação com `registry_required`. A tela mostra antes o aviso
`REGISTRY_NUMBER_MISSING`.

A tela de detalhe (`PrestadorDetalhe.tsx` e `OccupationCard.tsx`) mostra, para cada ocupação: o
registro informado (ou "Sem número"), o conselho e a base legal da política, cada documento exigido
com o estado (aceito, enviado, rejeitado ou faltando), e os botões de confirmar ou rejeitar o
registro e de aprovar ou retirar a aprovação. Toda ação pede um motivo, que fica em `audit_log`.
Retirar a aprovação de uma ocupação que já tem documentos faltando é permitido e a tela avisa.

Tradução dos erros do banco (`explainAdminError`):

- `documents_missing`: "O banco recusou a aprovação: falta documento aceito para ...", com os nomes
  dos passos;
- `not_allowed` com `policy missing`, `registry rejected`, `file missing` e os motivos de rejeição:
  frase própria para cada um;
- `registry_required`: pede que o prestador informe o número e tente de novo;
- `invalid_setting`: frase da própria configuração (`NUMBER_LIMITS`).

A fila de prestadores (`admin_provider_queue`) traz `occupations_to_approve`: quantas ocupações do
prestador ainda não estão aprovadas. Aparece como "ocupação a aprovar" na lista e no card "Ocupações
a aprovar" do Painel. A fila reúne os prestadores em análise e os aprovados com alguma ocupação pendente.

## 3. Métricas e funil do Painel

A view `admin_metrics` é a única fonte dos números do Painel. Ela é `security_invoker`, filtra por
`is_admin()` e não tem grant para `anon`. Um usuário comum recebe zero linhas, inclusive o
prestador e o cliente dos próprios registros. Os testes `31_admin_metrics.test.sql` cobrem isso.

Colunas, na ordem: as cinco originais (`entity`, `status`, `this_week`, `this_month`, `total`) e,
acrescidas no fim (a restrição do `CREATE OR REPLACE VIEW`):

- `last_7_days`, `last_30_days`: contagem dos últimos 7 e 30 dias corridos (contínuos, não o calendário);
- `amount_cents`: soma dos valores de pagamentos (nulo nas outras entidades);
- `month_amount_cents`: soma dos valores de pagamentos do mês corrente.

Entidades do Painel: `requests`, `proposals`, `bookings`, `payments`, `providers` (uma linha por
situação). Linhas do funil:

- `requests_with_proposal`: pedidos que receberam ao menos uma proposta, mesmo se ela foi retirada
  depois;
- `subscriptions`: assinaturas Pro por situação (`trialing`, `active`, `past_due`, `pending`,
  `canceled`), contadas pela data de criação;
- `free_allowance`: prestadores do plano gratuito que já enviaram, neste mês, todas as propostas
  permitidas (`free_proposals_per_month`). É uma foto de agora, a mesma em todas as janelas. Com o
  limite em 0 não há linhas.

O funil mostra pagamentos com situação `received`, `held` e `released`. O valor é o que os clientes
pagaram, não a receita da WorkEasy. A assinatura Pro não entra nesse total. Quando não há dado,
o cartão diz "Nenhum ... ainda" em vez de exibir zeros.

Os cartões ficam em `components/admin/FunnelSection.tsx`, em tabelas simples, sem biblioteca de
gráficos.

## 4. Verificação e pendências

- Testes Vitest: `test/admin/*` (inclui `settings`, `funnel`, `providers`, `lists`), `test/web/helpers.test.ts`
  e `test/claims-guard.test.ts`.
- Vitest, TypeScript (`tsc --noEmit`) e ESLint (`--max-warnings 0`) dos arquivos tocados passaram.
- pgTAP: `supabase/tests/database/30_admin_settings.test.sql` (aceitos e recusados, auditoria) e
  `31_admin_metrics.test.sql` (números do funil e leitura só por administrador). Os planos foram
  conferidos à mão, mas as suítes ainda não rodaram contra as migrações: o banco local depende do
  Docker, que estava parado nesta rodada.
- Ainda não executados: `supabase db reset`, `supabase test db` (incluindo `11_admin` e `12_rls_matrix`)
  e `npm run test:integration`.
- `lib/database.types.ts`: a linha da view `admin_metrics` foi ajustada à mão, com as colunas da view.
  A regeneração com `supabase gen types typescript --local` precisa ser feita com o banco no ar e a
  diferença conferida antes de publicar.

Nada disso foi validado com usuários reais, com o Asaas ou com os conselhos profissionais. A consulta
pública de cada conselho é feita à mão, pelo administrador, com o número que o prestador informou.
