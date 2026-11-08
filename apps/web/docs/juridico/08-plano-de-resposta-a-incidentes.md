# Plano de resposta a incidentes de segurança

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| Campo | Valor |
|---|---|
| Versão | 2026-10-rascunho |
| Vigência | [DATA DE VIGÊNCIA] |
| Controlador (a constituir) | [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO] |
| Canal do SAC | [E-MAIL DO SAC] |
| Encarregado | [E-MAIL DO ENCARREGADO] |
| Uso | Interno. Só a seção 8 (modelos de mensagem) pode sair da empresa, depois de revisão. |
| Estado do produto | Não publicado, sem usuários reais. Tudo marcado [PLANEJADO] ainda não existe. |
| Data de referência | 08/11/2026 |

## Como ler

- Seções e cláusulas são numeradas (1.1, 1.2 e assim por diante). Prazos em dias úteis seguem o texto do regulamento.
- Etiquetas usadas no texto:
  - **[PLANEJADO]**: não existe hoje no código nem na operação.
  - **[CONDICIONAL: depende de parecer]**: depende de enquadramento jurídico.
  - **[incerto]**: não confirmado em fonte aberta nesta revisão. A lista completa está na seção 14.
  - **[PROPOSTA]**: escolha operacional do plano. Não é exigência legal.
- Cada norma citada aparece na seção 15, com URL e data de acesso (08/11/2026). Onde a leitura veio de cópia não oficial, o texto diz isso.
- Os comandos usam o CLI e o painel do Supabase e os nomes reais de tabelas, funções e variáveis do repositório.

## 1. Objetivo e escopo

1.1 Este plano diz o que a equipe faz quando há suspeita ou confirmação de incidente de segurança que afete dados pessoais tratados pelo WorkEasy.

1.2 Incidente de segurança é "qualquer evento adverso confirmado, relacionado à violação das propriedades de confidencialidade, integridade, disponibilidade e autenticidade da segurança de dados pessoais" (Resolução CD/ANPD nº 15/2024, art. 3º, XII). Suspeita não é evento confirmado. A triagem (seção 4) confirma ou descarta. O registro é obrigatório também para incidente que não é comunicado (art. 10).

1.3 Papéis de tratamento: [CONDICIONAL: depende de parecer]. O documento 02 (Termos do Prestador, cláusulas 18.3 e 18.4) trata o WorkEasy como controlador dos dados da conta e como operador dos dados do CRM do prestador. Este plano segue essa leitura até o advogado confirmá-la.

1.4 Fora do escopo: indisponibilidade de terceiro sem dado pessoal afetado. O cenário 9.6 trata só a parte operacional.

## 2. O que existe hoje

| Capacidade | Situação hoje | Fonte |
|---|---|---|
| Registro de ações sensíveis | `audit_log` só aceita inserção, por `log_event` ou `private.audit`. Update, delete e truncate estão revogados de todos os papéis, inclusive da service role. | `supabase/migrations/20261019000010_privacy_audit.sql` |
| Eventos de pagamento | `payment_events` guarda o payload já redigido (`redactAsaasPayload`). | `supabase/functions/asaas-webhook/handler.ts` |
| Documentos de prestador | Bucket `provider-documents` privado (`public = false`), limite de 10 MiB, só imagem ou PDF. Link assinado vale 300 s. | migração `20261019000003_providers.sql`; `services/admin.ts` |
| Login | Por código (OTP). `otp_expiry = 3600`, `jwt_expiry = 3600`, 30 verificações por 5 min por IP. | `supabase/config.toml` |
| MFA | TOTP desligado (`enroll_enabled = false`, `verify_enabled = false`). | `supabase/config.toml` |
| Alertas automáticos | Nenhum no repositório. A busca por Sentry, PagerDuty, uptime e similares não achou nada. | [PLANEJADO] |
| Registro de leitura de documento ou de contato | Não existe. `audit_log` registra `payment.raw_viewed`, mas não leitura de documento. | `services/admin.ts` |
| Reconciliação de eventos do Asaas perdidos | Não existe no código. | [PLANEJADO] |
| Modo manutenção | Não há chave de plataforma que desligue o app. | [PLANEJADO] |

Consequência: hoje o plano é um roteiro de contenção com passos manuais. O titular executa esses passos com acesso ao painel do Supabase e do Asaas. Os passos marcados [PLANEJADO] dependem de código ou de operação que ainda não existem.

## 3. Papéis e RACI

### 3.1 Papéis

| Papel | Função | Com uma pessoa | Com duas ou três pessoas |
|---|---|---|---|
| Responsável pelo incidente (RI) | Abre o registro, decide, aciona os demais, fecha o incidente | Titular | Titular ou sócio técnico |
| Técnico (T) | Contém, preserva evidências, levanta dados e titulares afetados | Titular | Desenvolvedor |
| Jurídico (J) | Enquadra o incidente, confere prazos e o conteúdo das comunicações | Advogado externo, contratado antes do lançamento | O mesmo |
| Comunicação (C) | Redige e envia mensagens a titulares, prestadores e fornecedores | Titular | Pessoa de atendimento |
| Encarregado (E) | Canal com a ANPD. Faz ou representa a comunicação. | [E-MAIL DO ENCARREGADO] | Pessoa designada (ver 3.3) |

3.2 A comunicação à ANPD é feita pelo encarregado ou por representante legalmente constituído do controlador (página da ANPD sobre a comunicação, lida em 08/11/2026). Documentos que provam a representação: ato de designação do encarregado, procuração ou atos constitutivos.

3.3 Encarregado com uma pessoa só: [CONDICIONAL: depende de parecer]. O documento 03, Q15, cita a Resolução CD/ANPD nº 2/2022, art. 11, que dispensa encarregado de agente de pequeno porte, salvo alto risco [incerto: citação do documento 03, não reaberta nesta tarefa]. O plano mantém o papel E mesmo assim, porque a ANPD aceita a comunicação só por encarregado ou representante.

### 3.4 RACI

R = executa. A = aprova (um por linha). C = consultado. I = informado.

| Atividade | RI | T | J | C | E |
|---|---|---|---|---|---|
| Abrir registro do incidente | A | R | I | I | I |
| Triagem e gravidade (seção 4) | A | R | C | I | I |
| Contenção (seção 9) | A | R | C | I | I |
| Preservação de evidências (seção 10) | I | A/R | C | I | I |
| Decisão de comunicar ANPD e titulares | A | C | R | I | C |
| Protocolo na ANPD (seção 7) | I | C | C | I | A/R |
| Mensagens aos titulares (seção 8) | A | C | C (revisa) | R | I |
| Aviso aos prestadores, quando operador | A | C | C | R | I |
| Contato com Asaas e Supabase | A | R | I | I | I |
| Revisão pós-incidente (seção 11) | A | R | C | C | C |

## 4. Gravidade

4.1 Regra legal. O incidente deve ser comunicado quando "possa acarretar risco ou dano relevante aos titulares" (Resolução CD/ANPD nº 15/2024, art. 4º). O art. 5º diz que isso ocorre quando o incidente "puder afetar significativamente interesses e direitos fundamentais dos titulares e, cumulativamente, envolver, pelo menos, um dos seguintes critérios":

- I: dados pessoais sensíveis;
- II: dados de crianças, de adolescentes ou de idosos;
- III: dados financeiros;
- IV: dados de autenticação em sistemas;
- V: dados protegidos por sigilo legal, judicial ou profissional;
- VI: dados em larga escala.

4.2 Níveis de operação [PROPOSTA]. O enquadramento legal é do J.

| Nível | Quando | O que o plano pede |
|---|---|---|
| G1 Crítico | Dado pessoal afetado, critério do art. 5º preenchido, acesso indevido confirmado ou exposição pública | RI aciona J no mesmo dia útil. O prazo de três dias úteis corre. Preparar comunicação à ANPD e aos titulares. |
| G2 Alto | Dado afetado, critério preenchido, exposição limitada ou ainda não confirmada | J dá parecer no dia útil seguinte. Comunicar se J concluir que há risco relevante. |
| G3 Médio | Sem dado pessoal afetado, só indisponibilidade, ou dado afetado sem critério | Registro obrigatório (art. 10). Sem comunicação, salvo decisão de J. |
| G4 Baixo | Alerta descartado na triagem | Registro curto com o motivo do descarte. |

4.3 Exemplos por cenário (seção 9), com nível inicial [PROPOSTA]:

| Cenário | Dados envolvidos | Critério provável | Nível inicial |
|---|---|---|---|
| 9.1 Arquivos de documentos do Storage | Documentos de prestador: `documento_selfie`, `cnh`, `antecedentes` e demais passos da política | Identidade e imagem. Enquadrar em I ou IV: [incerto] | G1 |
| 9.2 Conta de cliente tomada | Dados de atendimento, casas e assistidos | II, se houver assistido idoso ou criança | G2 |
| 9.2 Conta de administrador tomada | Documentos de prestador e `payments.raw` (nome, CPF/CNPJ e e-mail do pagador) | III, I e II | G1 |
| 9.3 Webhook forjado | Eventos de pagamento | III, se alterar pagamento. Sem efeito se a releitura no Asaas recusar. | G3 sem efeito; G2 com efeito |
| 9.4 RLS ou grant incorreto | Telefone e e-mail de clientes e prestadores | VI, conforme o número de titulares [incerto] | G2; G1 se a exposição for ampla |
| 9.5 Chave secreta vazada | Acesso total ao banco e ao Storage, que ignora RLS | Todos os critérios possíveis | G1 até a revogação |
| 9.6 Indisponibilidade do Asaas | Nenhum dado exposto | Não é incidente por si [CONDICIONAL: depende de parecer] | G3 |
| 9.7 Injeção de instrução no assistente | Texto livre do cliente | Hoje a função não grava o resumo | G3; G2 se um recurso futuro gravar o resumo |

## 5. Detecção: fontes que existem

| Fonte | Onde | O que mostra | Limite |
|---|---|---|---|
| `audit_log` | Tabela `public.audit_log`. Leitura do admin em `/admin/auditoria`. | Ações com `actor_id`, `action`, `entity`, `entity_id`, `data`, `at`. Nomes reais: `payment.status`, `payment.void`, `payment.void_paid`, `payment.refund_failed`, `payment.received_after_cancel`, `payment.refunded_after_cancel`, `payment.reviewed`, `payment.raw_viewed`, `payment_event.unverified`, `payment_event.failed`, `booking.created`, `booking.transition`, `subscription.status`, `provider.created`, `provider.submitted`, `provider.status`, `occupation.approval_revoked`, `setting.changed`, `dispute.resolved`, `user.anonymized`, e `client.*` (ações de usuário). | Não guarda IP nem user agent. Ações da service role têm `actor_id` nulo e `data.via = 'service'`. |
| `payment_events` | Tabela; leitura do admin (`payment_events_select_admin`). | `asaas_event_id` único, `event_type`, `payload` redigido, `processed_at`. | Payload já redigido. A prova completa fica no painel do Asaas [incerto: exportação não verificada]. |
| Logs de Edge Function | Painel do Supabase, tipo "Edge Function". | Nome e mensagem do erro. `logError` grava só `nome: mensagem`, sem corpo da requisição. | Retenção depende do plano e não consta na página lida [incerto]. Exporta CSV ou JSON, até 1.000 linhas por download. |
| Logs de Auth, API Gateway, Postgres, Storage, PostgREST | Mesmo painel de logs. | Eventos de cada serviço. | Mesma retenção. |
| Advisors de segurança | `supabase db advisors` (CLI), Security Advisor no painel, `get_advisors` pelo MCP. | Checks citados pela página: `0013_rls_disabled_in_public`, `0010_security_definer_view`, `0002_auth_users_exposed`, `0023_sensitive_columns_exposed`, `0024_permissive_rls_policy`, `0028` e `0029` (função `SECURITY DEFINER` executável por anônimo ou autenticado). | Roda sob demanda, não é contínuo. Achados podem demorar a sair depois da correção. |
| Histórico do agendador | `cron.job_run_details`. Jobs: `workeasy-dispatch-notifications` e `workeasy-expire-stale` (migração 08). | Execuções dos jobs. | Não é limpo automaticamente. |
| Notificações falhas | Tabela `notifications`, status `failed`. | Mensagens que não saíram. | Só cobre o fluxo do app. |
| Painel "Exigem atenção" | `/admin/pagamentos`. | Reembolso recusado e pagamento recebido depois do cancelamento. | Só casos de pagamento. |
| Canal de relato | E-mail do SAC: [E-MAIL DO SAC]. | Relatos de clientes e prestadores. | Depende de alguém relatar. |
| Testes | `supabase test db` (pgTAP) e `npm run test:integration`. | Falhas de RLS e de regra no pré-lançamento. | É prevenção, não detecção. |

Lacunas, sem fonte de detecção: acesso a documento no bucket (`createDocumentUrl` não tem chamador em `pages/` nem em `services/`, e não grava auditoria); leitura de contatos; login fora do padrão; alertas em tempo real. [PLANEJADO]

## 6. Linha do tempo e prazos

6.1 O prazo de três dias úteis começa "do conhecimento pelo controlador de que o incidente afetou dados pessoais" (art. 6º, §1º). Não começa na data do ataque.

6.2 Cronograma:

| Quando | Ação | Base |
|---|---|---|
| H0: hora em que a equipe soube | Anotar data, hora, fuso (São Paulo, com UTC), quem soube e por qual sinal. | art. 6º, §1º; art. 10 |
| D0: mesmo dia útil | Abrir registro. Triagem. Contenção inicial. Preservar evidências (seção 10). | [PROPOSTA] |
| D+1 útil | J dá parecer sobre gravidade, comunicação e porte. | [PROPOSTA]; arts. 4º e 5º |
| D+2 úteis: meta interna | Enviar comunicação preliminar à ANPD e mensagens aos titulares. | [PROPOSTA]: folga antes do prazo legal |
| D+3 úteis: prazo legal | Comunicação à ANPD (art. 6º, caput) e aos titulares (art. 9º, caput). | Resolução CD/ANPD nº 15/2024 |
| Até três dias úteis após o fim do prazo aos titulares | Juntar ao processo da ANPD a declaração de que a comunicação aos titulares foi feita, com os meios usados. | art. 9º, §4º |
| Até vinte dias úteis da primeira comunicação | Enviar informações complementares, no mesmo processo. | art. 6º, §3º; página da ANPD |
| Três meses | Se não houver contato direto possível, divulgar em canal visível por pelo menos três meses. | art. 9º, §3º |
| Cinco anos | Manter o registro do incidente, mesmo sem comunicação. | art. 10 |

6.3 Prazos em dobro para agente de pequeno porte: art. 6º, §8º (ANPD) e art. 9º, §6º (titulares), com referência à Resolução CD/ANPD nº 2/2022. Só vale se J confirmar o porte [CONDICIONAL: depende de parecer].

6.4 Sobre "72 horas". O prazo legal é de três dias úteis, não 72 horas. A meta de 72 horas que aparece neste plano é interna [PROPOSTA]. Dias úteis não contam fins de semana, então o prazo pode durar mais de 72 horas corridas. Feriados e o início da contagem são pontos para J [incerto].

6.5 A ANPD aceita comunicação em duas etapas: preliminar e complementar. A complementar é protocolada no mesmo processo, por petição intercorrente. Isso é excepcional e precisa de justificativa (página da ANPD).

6.6 Quando não cabe comunicação direta, a comunicação pode ser feita por publicação em meios de comunicação. Isso também é excepcional e precisa de justificativa, com alcance máximo dos titulares (página da ANPD; art. 9º, §3º).

## 7. Comunicação à ANPD: canal e conteúdo

7.1 Canal (página da ANPD, lida em 08/11/2026):

1. Acessar o SEI!ANPD pelo link de peticionamento externo: `https://sei.anpd.gov.br/sei/controlador_externo.php?acao=usuario_externo_logar&id_orgao_acesso_externo=0`. Login com a conta gov.br.
2. Em "Peticionamento", escolher "Processo Novo" e o tipo "ANPD – Comunicados de Incidentes à Agência Nacional de Proteção de Dados".
3. Preencher o "formulário de incidente de segurança – preliminar ou completo" em "Documento Principal".
4. Anexar os documentos de representação (cláusula 3.2).

7.2 A página não lista os campos do formulário [incerto]. A tabela 7.3 segue o conteúdo exigido pelo regulamento. Confira os campos reais antes de usar.

7.3 Conteúdo mínimo (art. 6º, §2º, I a XII), com o modo de preencher no WorkEasy:

| Item | Exigência (texto do regulamento, resumido) | Como preencher no WorkEasy | Observação |
|---|---|---|---|
| I | Natureza e categoria dos dados afetados | Ex.: contatos (nome, e-mail, telefone); imagem de documento; dados de pagamento (nome, CPF/CNPJ) | Levantar por consulta de leitura [PROPOSTA] |
| II | Número de titulares afetados, com crianças, adolescentes ou idosos | Contagem de contas afetadas. Pessoas cuidadas, com `care_recipients.birth_year` quando houver | Consulta a escrever e revisar [PROPOSTA] |
| III | Medidas técnicas e de segurança antes e depois, observados os segredos comercial e industrial | Medidas existentes: RLS, bucket privado, link de 300 s, Vault, `audit_log` só de inserção. Medidas novas após o incidente. | Texto neutro. Não usar "seguro" nem "protegido". |
| IV | Riscos e possíveis impactos aos titulares | Ex.: uso indevido de identidade; contato indesejado; fraude de cobrança | J revisa |
| V | Motivos da demora, se a comunicação não foi no prazo | Só se houver atraso. Descrever o que foi feito antes. | Se não houve atraso, dizer "não se aplica". |
| VI | Medidas adotadas ou a adotar para reverter ou mitigar | Lista da seção 9, com data de cada passo | — |
| VII | Data da ocorrência, quando possível, e data do conhecimento | H0 (seção 6). Início do evento, se os logs mostrarem. | — |
| VIII | Dados do encarregado ou de quem representa o controlador | [E-MAIL DO ENCARREGADO] e nome do encarregado | — |
| IX | Identificação do controlador e declaração de porte, se for o caso | [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO]. Porte: [CONDICIONAL: depende de parecer]. | — |
| X | Identificação do operador, quando aplicável | Supabase (banco, arquivos, login e funções), conforme o documento 06. Asaas (cobrança). | Papel do Asaas [incerto] |
| XI | Descrição do incidente, com a causa principal se for possível | Texto curto, sem conjecturas | — |
| XII | Total de titulares cujos dados são tratados nas atividades afetadas | Total de contas (`profiles`) das atividades afetadas | [PROPOSTA] |

7.4 Modelo para copiar e preencher:

```
Incidente: {título curto}
Conhecimento pelo controlador (São Paulo): {data e hora do H0}
Ocorrência (se apurada): {data e hora, ou "em apuração"}
Dados afetados (natureza e categoria): {I}
Titulares afetados: {total} (crianças, adolescentes ou idosos: {número, ou "nenhum identificado"})
Medidas técnicas e de segurança antes do incidente: {III}
Medidas adotadas ou a adotar: {VI}
Riscos e possíveis impactos: {IV}
Causa principal (se identificada): {XI}
Motivo da demora: {V, ou "não se aplica"}
Encarregado: {nome}, [E-MAIL DO ENCARREGADO]
Controlador: [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO]
Operadores: {lista}
Comunicação aos titulares: {data, meio e alcance}
```

## 8. Modelos de mensagem aos titulares (pt-BR)

8.1 Regras do art. 9º:

- Linguagem simples e de fácil entendimento (§1º, I).
- Comunicação direta e individual quando for possível identificar o titular (§1º, II), pelos meios usuais: telefone, e-mail, mensagem eletrônica ou carta (§2º).
- Conteúdo mínimo (caput, I a VII): natureza e categoria dos dados; medidas técnicas e de segurança, observados os segredos; riscos e possíveis impactos; motivo da demora, se houver; medidas para reverter ou mitigar, quando cabíveis; data do conhecimento; contato para informações e do encarregado.
- O produto só envia mensagem a contato confirmado no Auth: `auth.users.email` com `email_confirmed_at`, ou `auth.users.phone` com `phone_confirmed_at` (ARQUITETURA, Notificações). O telefone digitado no perfil não é destino. Quem não tem contato confirmado só recebe pelo aviso público (§3º).
- Não usar o canal de templates de `notifications` (propostas, agendamentos, pagamentos). O envio por WhatsApp depende de templates aprovados [incerto]. Canal próprio para incidente: [PLANEJADO].
- Não escrever "seus dados estão seguros", "incidente resolvido", "sem riscos" nem prometer prazo de correção.

8.2 Modelo A: e-mail ao titular

```
Assunto: Aviso sobre um incidente que afetou dados da sua conta no WorkEasy

Olá, {NOME}.

Escrevemos para avisar que um incidente de segurança afetou alguns dados da sua conta no WorkEasy.

1. O que aconteceu: {uma ou duas frases, em linguagem simples}.
2. Quais dados foram afetados: {lista simples, por exemplo: nome, e-mail e telefone; imagem de documento enviado para análise}.
3. Quando soubemos: no dia {DATA DO CONHECIMENTO}.
4. O que fizemos: {medidas adotadas, por exemplo: bloqueamos o acesso indevido; retiramos o arquivo; trocamos as chaves de acesso do sistema}.
5. Possíveis riscos: {por exemplo: uso dos seus dados em mensagens falsas; tentativa de acesso à sua conta}.
6. O que você pode fazer: não compartilhe códigos de acesso que receber por mensagem; confira se há atividade estranha na sua conta; se houver cobrança que você não reconhece, avise a sua instituição financeira.
7. Motivo da demora: {só se a mensagem sair depois do prazo; senão, apague esta linha}.
8. Dúvidas: [E-MAIL DO SAC]. Encarregado pelos seus dados: [E-MAIL DO ENCARREGADO].

Atenciosamente,
[RAZÃO SOCIAL]
```

8.3 Modelo B: aviso público (art. 9º, §3º), para página de avisos e canal de atendimento, por pelo menos três meses

```
Aviso de incidente de segurança

Em {DATA DO CONHECIMENTO}, o WorkEasy identificou um incidente de segurança que afetou {categorias de dados, em linguagem simples}. Foram afetados {número, ou "parte dos cadastros"} titulares.

O que fizemos: {medidas}. Possíveis riscos: {riscos}. O que você pode fazer: {orientações}.

Se você acha que foi afetado e não recebeu nosso contato, escreva para [E-MAIL DO SAC]. Esta página ficará disponível por pelo menos três meses.
```

8.4 Modelo C: aviso ao prestador, quando o WorkEasy é operador dos dados do CRM (documento 02, cláusula 18.4)

```
Assunto: Aviso de incidente que pode afetar dados de clientes do seu CRM

Olá, {NOME DO PRESTADOR}.

Um incidente de segurança no WorkEasy pode ter afetado {categorias de dados} de {número} clientes cadastrados por você no CRM.

Você decide como avisar esses clientes. Esta mensagem traz o que você precisa para isso: data do conhecimento, categorias de dados, medidas tomadas e contato para dúvidas em [E-MAIL DO SAC].
```

8.5 Frases que não entram nos modelos: "não se preocupe", "nada grave aconteceu", "seus dados estão protegidos", "imediatamente", "verificado", "ponta a ponta".

## 9. Contenção por cenário

9.0 Regras gerais:

- Preservar antes de corrigir (seção 10).
- Mudar segredo não exige redeploy. As Edge Functions leem o valor novo na hora (página de segredos do Supabase).
- Não desligar a verificação de JWT para contornar um problema. `supabase functions deploy --no-verify-jwt` desliga a verificação da função, e não a para (página da CLI). `--prune` apaga funções remotas que não existem localmente.
- Não editar migração já existente. Criar uma nova (regra do plano).
- Parar o envio de mensagens do agendador, se houver envio em massa indevido:

```sql
select cron.unschedule('workeasy-dispatch-notifications');
-- Para religar, mesmo nome e mesma agenda da migração 08:
select cron.schedule('workeasy-dispatch-notifications', '* * * * *', 'select private.dispatch_notifications()');
```

9.1 Vazamento de arquivos do Storage (`provider-documents`)

- Sinal: link de arquivo acessível sem login; relato de prestador ou de terceiro; arquivo publicado em rede social.
- Ações, na ordem:
  1. Confirmar que o bucket continua privado:
     ```sql
     select id, public from storage.buckets where id = 'provider-documents';
     ```
     Resultado esperado: `public = false`.
  2. Listar os objetos do prestador afetado, com a chave de serviço, no SQL editor e nunca em código do app:
     ```sql
     select name, created_at from storage.objects
     where bucket_id = 'provider-documents' and name like '{provider_id}/%';
     ```
  3. Copiar os objetos para uma área de preservação com acesso restrito, antes de remover. Storage não entra no backup do banco (seção 10).
  4. Links já emitidos valem até 300 s (`SIGNED_URL_SECONDS` em `services/admin.ts`). Não é possível revogar um link antes disso. A remoção do objeto corta o acesso a novos links.
  5. Remover o objeto pela Storage API com a chave de serviço (o método `remove` já é usado em `services/providers.ts`). Não há botão de remoção no painel admin [PLANEJADO].
  6. Se o link saiu do painel admin, registrar a ação à mão no registro do incidente. A tela não grava auditoria (ver seção 5).
  7. Enquadrar a gravidade (seção 4) e seguir a seção 6.
- Evidência: cópia dos objetos; lista de `storage.objects`; relato de quem achou o link.
- Limite hoje: não há log de leitura de documento e não há botão de remoção.

9.2 Conta tomada

- Sinal: login de origem que o titular não reconhece (sem IP no registro, ver seção 13); alteração que o titular não fez; pedido ou atendimento criado sem reconhecimento; ações em `audit_log` com `actor_id` do titular; relato do titular.
- Ações, na ordem:
  1. Revogar as sessões do usuário com `auth.admin.signOut(jwt, scope)`. A página da API de admin mostra os parâmetros `jwt` e `scope`. O significado de cada valor de `scope` e o efeito sobre tokens já emitidos não foram confirmados [incerto]. Execução por script com chave de serviço [PLANEJADO].
  2. Bloquear a conta enquanto se apura. A página mostra `auth.admin.updateUserById(id, { ban_duration: '876000h' })` como exemplo. O efeito sobre sessões existentes não foi confirmado [incerto]. O valor que desfaz o bloqueio não está na página lida [incerto].
  3. Se a conta for de prestador: suspender com `admin_set_provider_status(p_provider, 'suspended', motivo)`. O motivo é obrigatório. Se a ocupação for o problema: `admin_set_occupation_approval(p_provider, p_occupation, false, motivo)`.
  4. Se a conta for de administrador: remover a linha em `public.admins` com a chave de serviço e revisar `audit_log` desde a suspeita. MFA está desligado em `config.toml` (lacuna, seção 13).
  5. Investigar: `audit_log` por `actor_id`, `booking_events` com `actor_id`, e linhas criadas pela conta em `consents` e `data_requests` no período.
  6. Rever o login: `otp_expiry = 3600` e 30 verificações por 5 min por IP em `supabase/config.toml`. Ajustar ou não é decisão do owner [PROPOSTA].
- Evidência: exportação do `audit_log` da conta; logs de Auth do período.
- Limite hoje: `audit_log` sem IP; alteração de `profiles.phone` e de `profiles.full_name` não tem registro de auditoria nesta leitura [incerto].

9.3 Evento de pagamento forjado ou token de webhook vazado

- Sinal: `payment_event.unverified` (motivos: `subaccount_key_missing`, `payment_not_in_account`, `subaccount_key_rejected`); `payment_event.failed`; `payment.received_after_cancel`; token visível em lugar público.
- Base do código: o webhook relê a cobrança no Asaas antes de qualquer efeito de dinheiro (`verifyPayment` em `handler.ts`). Um evento sozinho não muda pagamento nem atendimento se a leitura do Asaas não confirmar.
- Ações, na ordem:
  1. Trocar o token da conta raiz:
     ```bash
     supabase secrets set ASAAS_WEBHOOK_TOKEN='<novo token>'
     ```
     O token deve ter de 32 a 255 caracteres, sem espaços e sem sequências simples, e não pode ser a chave de API do Asaas (página do Asaas).
  2. Atualizar o webhook de cada subconta. O token de subconta é `HMAC-SHA256(ASAAS_WEBHOOK_TOKEN, "asaas-subaccount:<provider_id>")` em hexadecimal (ARQUITETURA). Subcontas criadas antes dessa regra usam o token antigo e precisam ser reconfiguradas.
  3. Janela de risco. Entre a troca e a reconfiguração, o Asaas recebe 401. A página do Asaas conta qualquer resposta diferente de 200 como falha, e após 15 falhas consecutivas a fila da configuração é interrompida (`docs.asaas.com/docs/fila-pausada`). Preparar a lista de subcontas antes e fazer a troca de uma vez. O código aceita um token por vez (`handler.ts`, linhas 89 a 92). Não há período de dupla aceitação [PLANEJADO].
  4. Se a fila pausar: corrigir o endpoint, confirmar que ele grava e responde 200, e reativar pelo painel ou pela API do Asaas. O guia de reativação não foi lido [incerto]. Eventos guardados por mais de 14 dias são excluídos (página do Asaas).
  5. Se a chave da conta raiz (`ASAAS_API_KEY`) também vazou, seguir 9.5. Sem essa chave o webhook responde 503 (`handler.ts`, linhas 94 a 96), o que também conta como falha para o Asaas.
  6. Revisar `payment_event.unverified` e `payment.status` desde a suspeita.
- Limite hoje: não há reconciliação automática de eventos perdidos [PLANEJADO].

9.4 RLS ou grant incorreto expondo contatos

- Sinal: advisor com `0013`, `0010`, `0023`, `0024`, `0028` ou `0029`; teste pgTAP falhando; relato de terceiro.
- Ações, na ordem:
  1. Reproduzir em ambiente local com usuários de teste. Não testar em produção com dados reais.
     ```bash
     npx supabase db reset
     npx supabase test db
     ```
  2. Corrigir por nova migração, numerada depois da última. Não editar migração já aplicada. Revogar o grant ou ajustar a política dentro da nova migração.
  3. Conferir com `npx supabase db advisors`. Se a assinatura de função mudou, rodar `npm run db:types` (ARQUITETURA, Testes e CI).
  4. Aplicar em produção pelo fluxo de deploy do banco [PLANEJADO: o fluxo não está definido].
  5. Medir a exposição. O banco não registra leitura de contatos, então o log não mostra quem leu. Estimar pelo tempo em que a exposição existiu e pelo número de registros afetados [PROPOSTA].
- Limite hoje: sem registro de leitura; fluxo de deploy não definido.

9.5 Chave secreta vazada

- Chaves do sistema: `SUPABASE_SERVICE_ROLE_KEY` (legada, JWT), chave `sb_secret_...`, `ASAAS_API_KEY` (conta raiz), chaves de subconta guardadas no Vault (`api_key_secret_id`), `ANTHROPIC_API_KEY`.
- Ações, na ordem:
  1. Supabase: em Settings > API Keys, criar primeiro a nova chave secreta e depois desabilitar a comprometida. Criar a nova não revoga as legadas `anon` e `service_role`, que valem até serem desabilitadas. A página avisa que essas duas serão descontinuadas até o fim de 2026. O guia de chave vazada citado pela página não foi lido [incerto].
  2. As Edge Functions recebem `SUPABASE_SECRET_KEYS` e `SUPABASE_SERVICE_ROLE_KEY` da plataforma. Confirmar, depois da troca, que as funções usam a chave nova [incerto].
  3. `ASAAS_API_KEY`: gerar nova chave no painel do Asaas [incerto: passo não lido] e depois:
     ```bash
     supabase secrets set ASAAS_API_KEY='<nova chave>'
     ```
     Até essa troca, webhook e cobranças falham (9.3, item 5).
  4. `ANTHROPIC_API_KEY`: trocar no console do fornecedor [incerto]. Para desligar a função sem trocar a chave:
     ```bash
     supabase secrets unset ANTHROPIC_API_KEY
     ```
     Sem a chave, `request-assist` responde 503 (ARQUITETURA).
  5. Chaves de subconta no Vault: não há rotação no código [PLANEJADO]. Revogar no Asaas e reconfigurar pela função de onboarding [incerto].
  6. Procurar a chave no histórico do repositório e nos logs. Não colar o valor em documento ou ticket. Registrar só o prefixo e o local.
  7. Avaliar uso indevido: a service role grava `audit_log` com `data.via = 'service'` e `actor_id` nulo. Procurar ações de serviço fora do padrão no período.
- Limite hoje: não há rotação periódica [PLANEJADO]. Segredos de produção só podem ser criados ou apagados pelo Owner ou Administrador do projeto (página de segredos do Supabase). Quem executa é o titular.

9.6 Indisponibilidade do Asaas

- Sinal: erros vindos do Asaas em `payments-create`, `charges-create` ou `subscriptions-manage`; `payment_event.failed` com `asaas_5xx`.
- Estado em 08/11/2026: a página de status (status.asaas.com) mostrou todos os componentes operacionais. A última ocorrência encerrada foi "Instabilidades em serviços Pix", resolvida em 04/11/2026 às 20:06 (GMT-03:00). A leitura foi automática, então confira antes de usar [incerto].
- Ações, na ordem:
  1. Não repetir cobranças à mão. `payments-create` devolve a cobrança `pending` existente quando o método é o mesmo (ARQUITETURA), então repetir o pedido não gera cobrança dupla.
  2. Avisar o usuário pelo canal disponível. Aviso dentro do app [PLANEJADO].
  3. Ao voltar, conferir a fila de webhook do Asaas. Se o endpoint do WorkEasy falhou em 15 entregas seguidas, a fila está pausada. Reativar (9.3, item 4).
  4. Eventos não entregues: reler as cobranças no Asaas, na conta certa, e atualizar `payments` com a mesma regra do webhook. Não há reconciliação automática [PLANEJADO].
- Enquadramento: indisponibilidade de terceiro, sem dado exposto, não é por si incidente com dado pessoal [CONDICIONAL: depende de parecer].

9.7 Injeção de instrução no assistente (`request-assist`)

- Fatos conferidos no código:
  - O prompt de sistema diz que o texto do cliente é dado, não instrução (`_shared/assist.ts`).
  - O modelo só pode escolher ocupações da lista de candidatos, e a resposta é validada de novo (`parseAssistOutput`).
  - O resumo é limitado a 500 caracteres.
  - A função não grava o resumo no banco.
  - Nenhuma tela lida chama `request-assist`. A busca em `services/` e `pages/` não achou chamada.
- Sinal: resumo com conteúdo fora do pedido; ocupação fora da lista (`occupation_slug is not a candidate`); aumento de `assist_usage`; erros `request-assist incomplete` nos logs.
- Ações, na ordem:
  1. Desligar o assistente sem redeploy:
     ```bash
     supabase secrets set ASSIST_HOURLY_LIMIT=0
     ```
     Com zero, a função responde 429 antes de consultar o banco (ARQUITETURA; `handler.ts`). A mensagem diz "nesta hora", o que confunde quando o assistente está desligado (lacuna, seção 13).
  2. Se for preciso retirar a função: `supabase functions delete request-assist`. A página da CLI diz que isso não remove o código local.
- Limite hoje: se um recurso futuro gravar o resumo para o prestador, este cenário sobe para G2 [PLANEJADO].

9.8 Phishing ou falsificação de identidade contra cliente ou prestador

1. Publicar aviso no canal oficial (modelo 8.3) pedindo que ninguém responda mensagem que peça código.
2. Denúncia ao CERT.br, facultativa. A página do CERT.br aceita relato por e-mail como canal principal, com telefone como alternativa e formulário web para usuário final. Recomenda logs completos com data, hora e fuso, dados pessoais removidos, texto simples e 70 a 80 caracteres por linha (página lida em 08/11/2026). Em phishing, o contato a usar é o da rede do IP ou do registrador do domínio, e não o do próprio domínio [incerto: trecho de busca, não lido na página]. Para órgão federal (.gov.br), a notificação também vai ao CTIR Gov [incerto].
3. A denúncia ao CERT.br não substitui a comunicação do art. 48. Ela é facultativa.

## 10. Preservação de evidências

10.1 Regras:

1. Não apagar nem editar registros do período. `audit_log` já aceita só inserção (migração 10).
2. Anotar tudo com data, hora e fuso de São Paulo, com UTC quando possível.
3. Copiar antes de corrigir. Ordem: copiar, conter, corrigir.
4. Não colar dados pessoais em chat, ticket, planilha ou documento. Usar contagens e identificadores internos.
5. Quem acessa uma cópia registra o acesso no registro do incidente.

10.2 Evidências e como obter:

| Evidência | Como obter | Limite |
|---|---|---|
| `audit_log` do período | SQL com chave de serviço, ou exportação em `/admin/auditoria` | Imutável no banco |
| `payment_events` do período | SQL com chave de serviço | Payload já redigido |
| Logs de Edge Function, Auth, Storage e Postgres | Painel de logs, em CSV ou JSON (até 1.000 linhas por download). Log drain para exportação contínua. | Retenção depende do plano, não informada [incerto] |
| Histórico do agendador | `select * from cron.job_run_details` | Não é limpo automaticamente |
| Estado dos advisors | `npx supabase db advisors`, com saída guardada | Sob demanda |
| Objetos do Storage afetados | Cópia por script com chave de serviço [PLANEJADO] | Storage não entra no backup do banco |
| Cópia do banco antes da correção | `supabase db dump` (cópia lógica, página da CLI) | Contém dados pessoais: guardar com acesso restrito |
| Configuração antes da troca | Copiar `config.toml` e os nomes dos segredos, nunca os valores | — |

10.3 Retenção de backup do banco (página do Supabase lida em 08/11/2026): planos Pro, Team e Enterprise têm backup diário, com 7, 14 e até 30 dias de acesso. No plano gratuito a página não informa retenção e recomenda exportação regular. PITR é complemento pago nos planos Pro, Team e Enterprise. O plano do projeto ainda não foi escolhido [PLANEJADO].

10.4 Cada exportação recebe um hash SHA-256, anotado no registro do incidente [PROPOSTA].

10.5 O registro e as evidências ficam guardados por cinco anos, mesmo quando não houve comunicação (art. 10).

## 11. Revisão pós-incidente (modelo)

Preencher até dez dias úteis depois do encerramento [PROPOSTA]. Sem culpar pessoas.

```
Incidente: {código, por exemplo INC-2026-001}
Gravidade final: {G1 a G4}. Inicial: {G}.
Responsável: {nome}. Registro aberto em {H0}, encerrado em {data}.

1. Resumo, em três frases.
2. Linha do tempo: H0, detecção, contenção, decisão, comunicações, encerramento. Com fuso.
3. Dados afetados e número de titulares, com crianças, adolescentes ou idosos.
4. Causa principal e cadeia de causas (cinco porquês).
5. O que funcionou.
6. O que não funcionou ou faltou (incluir as lacunas da seção 13).
7. Decisões jurídicas e justificativa (J).
8. Comunicações feitas: ANPD (protocolo e data), titulares (data, meio, alcance), prestadores e operadores.
9. Ações corretivas: ação, dono, prazo, estado.
10. Evidências guardadas: lista, local e hash.
11. Mudanças no plano ou no produto (novas migrações, segredos trocados).
12. Revisado por: {nome}, {data}.
```

## 12. Exercício de mesa (tabletop)

12.1 Objetivo: testar, com dados fictícios, se a equipe cumpre o plano dentro do prazo.

12.2 Frequência [PROPOSTA]: uma vez por trimestre, e depois de qualquer mudança grande no banco ou nas chaves.

12.3 Participantes: RI, T, J, C e E. Com uma pessoa só, ela faz todos os papéis e marca o tempo com relógio.

12.4 Duração: 60 a 90 minutos.

12.5 Cenário, com dados fictícios: "Numa quinta-feira às 17h, uma prestadora avisa que consegue abrir o arquivo de CNH de outra prestadora pelo endereço que recebeu por e-mail."

Roteiro (o facilitador lê cada inject no tempo indicado):

| Tempo | Inject | Pergunta para a equipe | Resposta esperada |
|---|---|---|---|
| 0 min | Relato da prestadora, com print sem dado real. | Qual é o H0? Quem é o RI? | H0 é o momento em que há indício. O RI abre o registro. |
| 10 min | A cópia do link funciona. | Como confirmar que o bucket está privado? | Seção 9.1, item 1 |
| 20 min | A consulta mostra 312 contas com documentos. Três são de pessoas cuidadas de 80 anos ou mais (ficção). | Qual é o nível? Qual é o prazo? | G1; D+3 úteis |
| 30 min | Asaas informa fila de webhook pausada. | O que muda na contenção? | Seção 9.3, itens 3 e 4 |
| 45 min | Jornalista pergunta por e-mail. | Quem responde? Com qual texto? | C responde com o aviso público (8.3). Sem frases da seção 8.5. |
| 60 min | Chave secreta aparece num repositório público. | Quais segredos trocar, e em que ordem? | Seção 9.5 |
| 75 min | Encerramento. | Quais itens do art. 6º, §2º, ninguém sabe preencher? | Viram ações na seção 11. |

12.6 Critérios de aprovação:

- Cada item I a XII do art. 6º, §2º, tem resposta ou dono.
- Cada passo de contenção do cenário tem comando ou local.
- O prazo legal foi calculado com a data certa, em dias úteis.
- Nenhum modelo da seção 8 usa frase proibida (8.5).

## 13. Limites e lacunas

| Item | Situação hoje | Tag | Ação sugerida |
|---|---|---|---|
| Alertas em tempo real | Não existem | [PLANEJADO] | Definir fonte e canal de alerta |
| Registro de leitura de documento | Não existe. `createDocumentUrl` não grava auditoria e não tem chamador nas telas lidas. | [PLANEJADO] | Decisão do owner e mudança de código |
| Registro de leitura de contato | Não existe | [PLANEJADO] | Idem |
| IP e user agent no `audit_log` | Não existem | [PLANEJADO] | Nova migração e mudança em `log_event` |
| MFA para administradores | TOTP desligado em `config.toml` | [PLANEJADO] | Decisão do owner |
| Remoção de documento pelo admin | Não existe botão | [PLANEJADO] | — |
| Dupla aceitação do token de webhook | Não existe. O código aceita um token por vez. | [PLANEJADO] | Mudança em `asaas-webhook` |
| Reconciliação de eventos do Asaas | Não existe | [PLANEJADO] | — |
| Aviso de incidente pelo app | Não existe | [PLANEJADO] | — |
| Modo manutenção | Não existe | [PLANEJADO] | — |
| Plano do Supabase e retenção de logs | Não definidos | [PLANEJADO] | Decidir antes do lançamento |
| Rotação periódica de chaves | Não existe | [PLANEJADO] | — |
| Mensagem do assistente quando desligado | Diz "nesta hora" | Lacuna | Ajustar texto |

## 14. Pontos para o advogado

14.1 Questões abertas:

- **Q1. Papel do WorkEasy.** Controlador ou operador, para os dados que chegam pelo pedido e pelo CRM do prestador (documento 02, cláusulas 18.3 e 18.4). Isso define quem comunica o titular.
- **Q2. Início do prazo.** O "conhecimento" de que dados pessoais foram afetados (art. 6º, §1º) começa com indício ou só com confirmação? A definição de incidente fala em "evento adverso confirmado" (art. 3º, XII). Como conciliar?
- **Q3. Dia útil.** Definição e feriados. Não localizei o texto que define dia útil nesta revisão [incerto].
- **Q4. Porte.** Elegibilidade de agente de pequeno porte, e prazos em dobro (art. 6º, §8º; art. 9º, §6º). Ver também o documento 03, Q15.
- **Q5. Dever do operador.** A cláusula 18.4 do documento 02 diz "sem demora". O documento 06 diz ter lido, no DPA da Supabase, um aviso "quando viável, em 48 horas". Essa leitura não foi reconferida nesta revisão.
- **Q6. Critérios do art. 5º.** "Dados de autenticação em sistemas" (IV) cobre código de acesso e sessão? "Dados financeiros" (III) cobre `payments.raw`, que tem nome e CPF/CNPJ do pagador?
- **Q7. Documentos de identidade.** `documento_selfie` e `antecedentes` são dado sensível (art. 5º, II, e art. 11) ou dado biométrico? Ver documento 06.
- **Q8. Banco Central.** Resultados de busca apontam a Resolução BCB nº 85/2021 como regra de política de segurança cibernética para instituições de pagamento. O WorkEasy não é instituição de pagamento hoje. Se comissão ou pagamento retido forem ligados [CONDICIONAL: depende de parecer], reavaliar. Prazo de comunicação ao BCB não verificado [incerto]. Papel regulatório do Asaas [incerto].
- **Q9. Publicação em meios de comunicação** (art. 9º, §3º). Quando é aceita e como registrar.
- **Q10. Boletim de ocorrência** para acesso indevido ou extorsão. Não pesquisado [incerto].
- **Q11. Retenção.** Registro de incidente por cinco anos (art. 10) e regras de eliminação do documento 03.
- **Q12. Texto oficial.** A leitura da Resolução CD/ANPD nº 15/2024 veio de cópia do Ministério da Justiça e de um agregador (LegisWeb, cópia não oficial). O DOU retornou erro 502 nesta revisão. Confirmar no DOU. As cópias dão 24/04/2024. Um glossário da ANPD, visto em busca, cita 27/04/2024 [incerto].
- **Q13. Formulário.** Confirmar no formulário real os campos e se o SEI exige e-mail do encarregado.

14.2 Lista consolidada de [incerto]:

- Campos do formulário de incidente no SEI (7.2).
- Efeito de `signOut` e de `ban_duration` sobre sessões e tokens já emitidos; significado dos valores de `scope`; valor que desfaz o bloqueio (9.2).
- Retenção dos logs do Supabase por plano (seção 5).
- Procedimento de chave vazada no Supabase (9.5, item 1) e no Asaas (9.5, item 3).
- Procedimento de reativação de fila no Asaas (9.3, item 4).
- Dia útil e feriados (Q3).
- Texto oficial da Resolução CD/ANPD nº 15/2024 (Q12).
- Templates de WhatsApp para comunicação de incidente (8.1).
- CTIR Gov e contato do CERT.br para phishing (9.8).
- Leitura automática de status.asaas.com (9.6).
- Papel do Asaas como operador ou controlador (7.3, item X).
- Classificação de templates de documento como dado sensível ou biométrico (Q7).

## 15. Fontes consultadas

Todas as datas de acesso são 08/11/2026.

| # | URL ou arquivo | Norma ou fonte | O que foi lido | Observação |
|---|---|---|---|---|
| 1 | https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-publicacaooriginal-156212-pl.html | Lei nº 13.709/2018 (LGPD), publicação original | Art. 48, caput e §§ 1º e 2º | Texto original. O Planalto não foi usado. |
| 2 | https://bibliotecadigital.mj.gov.br/bitstream/1/12879/2/RES_ANPD_2024_15.html | Resolução CD/ANPD nº 15, de 24/04/2024 | Arts. 3º, XII; 4º; 5º; 6º (caput, §§1º, 2º I–XII, 3º, 8º); 9º (caput I–VII, §§1º a 4º, 6º); 10 | Cópia de reprodução (SEI/MJ), que diz não substituir o DOU. Conferir no DOU. |
| 3 | https://legisweb.com.br/legislacao/?id=458235 | Resolução CD/ANPD nº 15/2024 | Art. 6º, §2º I–XII (conferência cruzada) | Cópia não oficial de agregador. Usada só para conferir a lista da fonte 2. |
| 4 | https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-15-de-24-de-abril-de-2024-556243024 | DOU, Resolução nº 15/2024 | Não lido: retornou HTTP 502 | Confirmar no DOU (Q12). |
| 5 | https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis | ANPD, página do Comunicado de Incidente de Segurança (CIS) | Prazos; canal SEI!ANPD; "Processo Novo"; formulário preliminar ou completo; representação; comunicação em etapas; publicação em meios de comunicação | Página "Modificado em 26/08/2026". Não lista os campos do formulário. |
| 6 | https://cert.br/docs/notificacoes/ | CERT.br, Recomendações para notificações de incidentes de segurança | Canais; conteúdo do relato; dados pessoais; formato; modelos | Versão 1.4, 14/11/2025. Lida até o limite da ferramenta. |
| 7 | https://supabase.com/docs/guides/functions/secrets | Supabase, segredos de Edge Functions | Segredo lido na hora, sem redeploy; segredos padrão; papel para criar ou apagar | — |
| 8 | https://supabase.com/docs/reference/cli/supabase-secrets-set | Supabase CLI, `secrets set`, `list`, `unset` | Sintaxe; `--env-file`; `--project-ref` | — |
| 9 | https://supabase.com/docs/reference/cli/supabase-functions-delete | Supabase CLI, `functions delete` e `deploy` | Sintaxe; não remove o código local; `--no-verify-jwt`; `--prune` | — |
| 10 | https://supabase.com/docs/reference/javascript/auth-admin-signout | Supabase Auth, `signOut` | Parâmetros `jwt` e `scope` | Significado de `scope` não confirmado. |
| 11 | https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid | Supabase Auth, `updateUserById` | Exemplo com `ban_duration: '876000h'` | Efeito do bloqueio não confirmado. |
| 12 | https://supabase.com/docs/guides/database/database-advisors | Supabase, advisors | Checks citados; execução sob demanda; `supabase db advisors` | — |
| 13 | https://supabase.com/docs/guides/api/api-keys | Supabase, chaves de API | Tipos de chave; legadas válidas até desabilitar; aviso sobre chave secreta | Passo a passo de chave vazada não lido. |
| 14 | https://supabase.com/docs/guides/platform/logs | Supabase, logs | Tipos de log; exportação; log drains | Retenção não informada. |
| 15 | https://supabase.com/docs/guides/cron/quickstart | Supabase, pg_cron | `cron.unschedule`; `cron.job_run_details`; `cron.alter_job` | — |
| 16 | https://supabase.com/docs/guides/platform/backups | Supabase, backups | Retenção por plano; PITR; Storage fora do backup; `db dump` | — |
| 17 | https://docs.asaas.com/docs/fila-pausada | Asaas, fila pausada | 15 falhas seguidas; qualquer código diferente de 200 conta como falha; eventos excluídos após 14 dias | Página datada de 28/08/2026 pelos metadados. |
| 18 | https://docs.asaas.com/docs/receba-eventos-do-asaas-no-seu-endpoint-de-webhook | Asaas, webhook | authToken no header `asaas-access-token`; 32 a 255 caracteres; resposta 200; entrega ao menos uma vez | — |
| 19 | https://docs.asaas.com/docs/autentica%C3%A7%C3%A3o-1 | Asaas, autenticação | Chave no header `access_token`; URLs de sandbox e produção | — |
| 20 | https://status.asaas.com/ | Asaas, status | Componentes; última ocorrência resolvida em 04/11/2026 | Leitura automática, confirmar antes de usar. |
| 21 | Busca em normativos.bcb.gov.br | Resolução BCB nº 85/2021 | Não aberto. Só trechos de resultado de busca. | [incerto] (Q8). |
| 22 | `apps/web/supabase/migrations/20261019000010_privacy_audit.sql` | Repositório | `audit_log`, `log_event`, `anonymize_user`, grants | Estado do working tree em 08/11/2026. |
| 23 | `apps/web/supabase/functions/asaas-webhook/handler.ts` | Repositório | `verifyPayment`, token por subconta, 500 e 200, 503 sem chave | — |
| 24 | `apps/web/supabase/functions/request-assist/handler.ts` e `_shared/assist.ts` | Repositório | Limite 0, validação de candidatos, resumo de até 500 caracteres | — |
| 25 | `apps/web/services/admin.ts`, `services/providers.ts` | Repositório | `SIGNED_URL_SECONDS = 300`, `createDocumentUrl`, `remove` | — |
| 26 | `apps/web/supabase/config.toml` | Repositório | `jwt_expiry`, `otp_expiry`, limites, MFA desligado | — |
| 27 | `apps/web/supabase/migrations/20261019000003_providers.sql` e `…08_notifications.sql` | Repositório | Bucket privado; jobs do pg_cron | — |
| 28 | `apps/web/docs/ARQUITETURA.md` | Repositório | Tabelas, funções, regras de token, notificações, backups | — |
| 29 | `apps/web/docs/juridico/02-termos-do-prestador.md`, `03-politica-de-privacidade.md` (Q15), `06-ripd-relatorio-de-impacto.md` | Repositório | Cláusulas 18.3 e 18.4; porte; operadores | Citadas como referência interna, não reabertas. |
