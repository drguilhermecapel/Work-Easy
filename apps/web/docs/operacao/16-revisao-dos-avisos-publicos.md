# Revisão dos avisos públicos do piloto

Proposta preparada em 27/11/2026 a partir de `a8223ee5de9df52d303cbccf52890cea80594e8d`. Não registra parecer jurídico nem autoriza alteração de `VITE_LEGAL_STATUS`, merge ou publicação.

## Mudança proposta

Os textos curtos de `content/legal/` eram somente placeholders, embora a entrada exigisse aceite e a página de exclusão remetesse à política para explicar conservação. Esta proposta apresenta fatos de funcionamento e um canal de atendimento, conserva o estado de rascunho e muda a edição dos três documentos para `2026-11`. A versão exibida continua `2026-11-rascunho` com o status de produção vazio. Os aceites anteriores não são reutilizados como aceite da nova edição.

A página de exclusão deixa de prometer exclusão incondicional, anonimização completa ou uma obrigação fiscal específica não demonstrada. O alcance dos dados de cuidado passa a ser associado às casas sob responsabilidade da conta. Não há alteração de banco, regra de retenção, permissões, integrações, cobrança ou workflow.

## Evidências técnicas

| Fato | Fonte |
|---|---|
| OTP e sessão persistente | `services/auth.ts`, `lib/supabase.ts` |
| Cadastro e consentimentos por finalidade, versão e data | `services/account.ts`, `config/legal.ts` |
| Pedidos, propostas, estados e dados de atendimento | `services/requests.ts`, `services/bookings.ts` |
| Pagamento por Asaas e cartão fora do formulário WorkEasy | `services/payments.ts`, `supabase/functions/payments-create/` |
| Exclusão autenticada, bloqueios, remoção e limitações externas | `supabase/functions/account-delete/handler.ts`, `index.ts` |
| Exportação JSON parcial e referências de arquivos | `supabase/functions/account-export/handler.ts`, `_shared/lgpd-export.ts` |
| Acesso por 6 meses e uso de IA por 1 dia | Migration `20261118200002_retention_purge.sql` e sucessoras |
| Provas de consentimento por 5 anos desde a exclusão | Migration `20261118600010_consent_proof_retention_from_deletion.sql` |
| Dados removidos e campos conservados | Migrations `20261124100008_deletion_clears_more.sql`, `20261124100010_deletion_clears_titles.sql` |
| Consentimento para IA e fornecedores condicionais | `components/AiConsent.tsx`, `supabase/functions/_shared/notifications.ts`, `_shared/ai-model.ts` |
| Relato de erros condicionado ao DSN, sem replay | `lib/observability.ts` |

A auditoria somente leitura de produção em 27/11/2026 confirmou 8 agendamentos ativos e nenhuma falha nas últimas 24 horas. As três rotinas de expurgo observadas concluíram com sucesso às 03:00, 03:17 e 03:23 UTC naquele dia. Isso não comprova eliminação de todas as classes de dado, backups ou registros dos fornecedores. Nenhum identificador de conta ou dado de usuário é reproduzido aqui.

## Fontes oficiais para a descrição dos direitos

Consultadas em 27/11/2026:
- [LGPD, texto atualizado da Câmara, artigos 16 e 18](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html).
- [ANPD, direitos dos titulares](https://www.gov.br/anpd/pt-br/assuntos/titular-de-dados/direito-dos-titulares).

A redação informa direitos gerais e suas condições. Não conclui a base jurídica de cada tratamento, o prazo fiscal de cada registro, o papel contratual de cada fornecedor ou a conformidade da operação.

## Pendências preservadas

- Revisão dos termos contratuais, responsabilidades, cancelamentos e adequação da identificação da operação.
- Confirmação das bases, dos demais prazos de retenção, dos contratos, das regiões e das transferências dos fornecedores.
- Procedimento operacional para identidade/representação no SAC, tratamento de dados ausentes da exportação e acompanhamento de exclusões incompletas.
- Atualizar minutas internas antigas sem tratá-las como texto aprovado.
- Revisar os termos apresentados no aceite antes de declarar os textos vigentes. Esta proposta mantém o aviso de rascunho e não muda o status.

## Validação

Os testes existentes de versão e rotas foram atualizados para a nova edição. O estado de rascunho, os testes de links e a separação entre edição e vigência são preservados. Testes automatizados devem ser confirmados pelo CI do PR; o executor e o navegador não estavam disponíveis durante a preparação.

## Adendo operacional de 27/11/2026

A publicação da revisão `a8223ee5de9df52d303cbccf52890cea80594e8d` foi concluída com sucesso no GitHub Actions e permanece a revisão de produção durante esta preparação. Esta proposta é isolada em PR e não altera a aplicação publicada.

O ambiente de navegador e executor ficou indisponível neste turno. Os conectores permitem consultar o repositório e preparar a correção, mas não confirmam a sessão informada pelo usuário nos painéis, não permitem atualizar os secrets por este conector e não substituem o teste de recebimento e uso do código de acesso. A validação completa da entrega de e-mail, autenticação, persistência e saída continua pendente de evidência. A consulta de logs identificou uma solicitação `POST /otp` com resposta 200 às 18:07:20, horário de Brasília, e nenhuma chamada `/verify` ou `/token` até 18:48:37. Também foram observadas 19 requisições com resposta 200, sem reprodução de dados pessoais neste documento. Esses resultados não comprovam recebimento do código nem sessão autenticada. Nenhum código de acesso ou endereço de usuário foi registrado.

O relatório anterior no Drive não foi atualizado neste turno porque sua atualização exige um arquivo acessível ao ambiente de execução. Este adendo registra os fatos disponíveis e não representa publicação de uma nova versão nem encerramento de todas as pendências.
