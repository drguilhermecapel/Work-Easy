# RIPD: Relatório de Impacto à Proteção de Dados Pessoais do WorkEasy

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| Campo | Valor |
|---|---|
| Versão | 2026-10-rascunho |
| Data-base do levantamento | 23/10/2026 |
| Em vigor desde | [DATA DE VIGÊNCIA] |
| Controlador | [RAZÃO SOCIAL], CNPJ [CNPJ], [ENDEREÇO]. Empresa de tecnologia a ser constituída pelo dono, separada da clínica médica dele. |
| Encarregado | [E-MAIL DO ENCARREGADO]. Ainda não indicado. |
| Atendimento ao titular | [E-MAIL DO SAC] |
| Estado do produto | MVP mesclado na `main` (PR #2). Não implantado, sem usuários reais. Nada foi testado contra Asaas, WhatsApp ou Resend de verdade. |
| Quem escreveu | Rascunho preparado com apoio de ferramenta de IA, a pedido do dono. Nenhum advogado, encarregado ou contador o revisou. |
| Próxima revisão | Antes do primeiro usuário real e, no máximo, até 23/04/2027 (seção 11) |

## Como ler

1. **O que é.** O RIPD é a documentação do controlador sobre tratamentos que podem gerar risco às liberdades civis e aos direitos fundamentais, com as medidas para reduzir esse risco (LGPD, art. 5º, XVII, e art. 38). A ANPD (Agência Nacional de Proteção de Dados, nome dado pelo art. 55-A da LGPD no texto atualizado) não pediu este relatório. Ele foi escrito antes de existir tratamento real, que é o momento que a página da ANPD recomenda.
2. **Ordem.** Segue o conteúdo que a ANPD recomenda (itens a a l; mapa abaixo) e acrescenta a seção 5, de necessidade e proporcionalidade.
3. **Marcas.** `[PLANEJADO]`: não existe no código hoje. `[CONDICIONAL: depende de parecer]`: escolha jurídica que cabe ao advogado. `[incerto]`: não consegui confirmar em fonte aberta nesta sessão.
4. **Códigos.** T1 a T4: os quatro tratamentos deste relatório. R01 a R23: riscos. S01 a S20: salvaguardas que existem. G01 a G23: lacunas, cada uma com a medida proposta. F1 a F12: finalidades da seção 4. O registro das operações (`07-registro-das-operacoes-de-tratamento.md`, em elaboração) usa outro código, OP-01 a OP-25; a tabela da seção 2.2 liga os dois.
5. **"Hoje"** quer dizer o código da branch `claude/plano-restante` em 23/10/2026 (commit `961af70`). Li migrations, funções, telas e testes. **Não executei os testes** nesta tarefa. Quando digo que um teste "fixa" uma regra, li o arquivo do teste.
6. **Nomes em inglês** (tabelas, funções, arquivos) são os do código, para o desenvolvedor e o advogado acharem a origem.
7. **Uso.** Documento interno. A ANPD diz que publicar o RIPD não é obrigatório, mas é boa prática, e que a versão pública pode diferir da interna para proteger segredo comercial.
8. **Nada aqui garante segurança ou conformidade.** São mecanismos que existem no código, cada um com o limite dito ao lado.
9. **Termos técnicos** (RLS, Edge Function, Vault, MFA etc.) estão explicados no Anexo B.
10. **Números do catálogo** (1.710 ocupações, 631 com certidão etc.) saem de `catalog/policies.json` em 23/10/2026. A revisão das políticas está em andamento (1.057 de 1.710 ainda `a_confirmar`) e pode mudá-los.

## Resumo para decidir

Este relatório cobre os quatro tratamentos de maior risco do WorkEasy. O produto não tem usuários: tudo descreve o desenho e o código de hoje, não uma operação em curso.

| Tratamento | Como classifiquei os dados | Riscos hoje (crítico / alto / médio / baixo) | Riscos no alvo | Recomendação deste rascunho |
|---|---|---|---|---|
| **T1.** Verificação de prestadores (documento, selfie, certidão de antecedentes) | Documento com foto e selfie: tratados como sensíveis por cautela `[CONDICIONAL: depende de parecer]`. Certidão: dado comum (não consta do art. 5º, II), de risco elevado. | 0 / 4 / 0 / 1 | 0 / 0 / 3 / 2 | Pode seguir em teste fechado depois dos itens A da seção 8.2. |
| **T2.** Linha Cuidado | Pode revelar saúde (art. 11, §1º). Envolve idosos e, em alguns casos, crianças. | 1 / 1 / 3 / 0 | 0 / 1 / 1 / 3 | Não abrir ao público. Só piloto em modo concierge (`docs/DECISOES.md`, D12), depois dos itens A e B. R06 continua alto mesmo no alvo. |
| **T3.** Assistente de pedidos (modelo de linguagem) | Texto livre, pode trazer dado pessoal e sensível. Operador no exterior. | 0 / 2 / 1 / 1 | 0 / 0 / 2 / 2 | Manter desligado. Nenhuma tela o chama hoje. Ligar só depois de G08 e G09. |
| **T4.** Pagamentos (CPF/CNPJ do pagador) | Dado comum, financeiro. | 0 / 0 / 3 / 1 | 0 / 0 / 1 / 3 | Pode seguir depois de G16 e do contrato com o Asaas. |
| **Transversais** (R19 a R23) | Acesso do administrador, consentimento, fornecedores, incidente, transparência. | 0 / 5 / 0 / 0 | 0 / 0 / 2 / 3 | Fechar os itens A antes de qualquer usuário real. |
| **Total** | | 1 / 12 / 7 / 3 | 0 / 1 / 9 / 13 | |

### Cinco decisões que dependem do dono, com parecer do advogado

1. Base legal e classificação do documento com selfie (seção 4, F1).
2. Base legal, critérios e lista de ocupações para a certidão de antecedentes (F3, G17).
3. Aceitar, reduzir ou cortar o relatório diário e as observações livres do Cuidado (R06, G05). É o único risco que continua alto no alvo.
4. Usar ou não o modelo de linguagem, e com qual mecanismo de transferência (G08, G09). Existe alternativa sem modelo: a primeira etapa do assistente já escolhe as ocupações candidatas por palavras, no servidor.
5. Prazos de guarda por categoria de dado (G01, G11, G16, G20).

### Antes de qualquer usuário real (itens A da seção 8.2)

- [ ] G01 retenção e expurgo de documentos
- [ ] G02 registro de leitura de documentos
- [ ] G03 MFA e papéis do administrador
- [ ] G04 consentimento conferido pelo banco
- [ ] G12 contratos com operadores, região e transferência
- [ ] G13 textos legais publicados
- [ ] G14 exportação completa (família e arquivos enviados)
- [ ] G15 encarregado e canais
- [ ] G16 pagamentos: papéis, payload e retenção
- [ ] G17 critérios da certidão de antecedentes
- [ ] G19 plano de incidente

Para ligar o assistente: G08 e G09. Para abrir o Cuidado além do piloto: itens B (G05, G06, G07, G10, G11, G18, G21, G23).

## Mapa: estrutura recomendada pela ANPD e seções deste documento

Os itens vêm da página da ANPD sobre o RIPD, na ordem dela.

| Item da ANPD (texto da página) | Onde está aqui |
|---|---|
| a) "Identificação dos agentes de tratamento e do encarregado" | 1.1 e 1.2 |
| b) "Outras partes interessadas/envolvidas. Informar se foram consultadas na elaboração do RIPD e pareceres emitidos" | 1.3 |
| c) "Justificativa da necessidade de elaboração do relatório" | 2.1 |
| d) "Projeto/Processo que justifica a elaboração do RIPD" | 2.2 e 2.3 |
| e) "Sistemas de informação relacionados ao projeto/processo" | 2.4 |
| f) "Tratamento de dados": i. "Descrição do tratamento (desde a coleta até a eliminação)" | 3.1 a 3.4, em "Fluxo" |
| f) ii. dados pessoais; iii. dados pessoais sensíveis | 3.1 a 3.4, nas tabelas de dados |
| f) iv. categorias de titulares; v. "crianças e adolescentes ou de outra categoria de vulneráveis, como idosos"; vi. volume e número de titulares; vii. "Fonte de coleta" | 3.5 |
| f) viii. "Finalidade do tratamento" de cada dado | 3.1 a 3.4 (coluna "Para quê") e 4.1 |
| f) ix. compartilhamentos internos e externos, "inclusive transferência internacional" | 3.6 e 4.3 |
| f) x. "Política de armazenamento (descrever os prazos de retenção e métodos de descarte)" | 3.7 |
| g) "Análise de hipótese legal" | 4 |
| h) "Análise de princípios da LGPD" | 6 |
| i) "Riscos identificados ao titular" | 7 |
| j) "Resultado apurado com base na metodologia utilizada pelo agente de tratamento" | 7.2 e 9 |
| k) "Medidas, salvaguardas e mecanismos de mitigação de risco" | 8 |
| l) "Comentários e aprovações" | 11 |
| Pedido do dono: necessidade e proporcionalidade | 5 |
| Pedido do dono: conclusão, data de revisão e responsável | 10 e 11 |

## 1. Quem trata os dados (itens a e b)

### 1.1 Agentes de tratamento

A empresa ainda não existe. Nenhum contrato abaixo foi assinado por ela.

| Agente | Papel provável | O que recebe | Contrato e situação | Onde fica |
|---|---|---|---|---|
| [RAZÃO SOCIAL] (WorkEasy) | Controlador | Tudo o que este relatório descreve | Não existe ainda | Brasil. Sede: [ENDEREÇO] |
| Supabase | Operador: banco, arquivos, login e funções | Tudo o que está no banco e nos arquivos | DPA padrão do fornecedor (Versão 1, de 01/08/2026, lido em 23/10/2026): fornecedor é operador; avisa o incidente sem demora injustificada e, quando viável, em 48 horas; usa cláusulas-padrão da UE e adendos do Reino Unido e da Suíça; **não vi menção a Brasil nem à LGPD**. Contrato da empresa: `[PLANEJADO]` | Região São Paulo é intenção (`docs/DECISOES.md`, seção 8) `[PLANEJADO]`. As Edge Functions rodam, por padrão, na região mais próxima de quem chama; o código não fixa região |
| Asaas | Operador e, nas obrigações próprias de instituição de pagamento, possivelmente controlador `[incerto]`. Não abri a política do Asaas. O ROPA (`07`, item S2) traz a leitura do Acordo de Processamento feita por outro agente, que não conferi | Dados de pagadores e de prestadores | Contrato da empresa: `[PLANEJADO]` | `[incerto]` |
| Anthropic | Operador (assistente de pedidos) | Texto livre e instruções, sem identificadores do usuário | Termos Comerciais (vigência 17/06/2025) e DPA (vigência 24/02/2025), incorporado automaticamente. O DPA diz: cliente é controlador, Anthropic é operadora. A empresa ainda não aceitou os termos `[PLANEJADO]` | Dados armazenados nos EUA; o tráfego pode ser roteado a EUA, Europa, Ásia e Austrália |
| Meta (WhatsApp Cloud API) | Operador | Telefone e variáveis do modelo de mensagem | Não abri `[incerto]` | `[incerto]` |
| Resend | Operador | E-mail e texto da mensagem | Não abri `[incerto]` | `[incerto]` |
| Prestador Pro | Controlador dos dados dos próprios clientes (CRM, orçamentos, cobranças próprias). O WorkEasy seria operador nessa parte `[CONDICIONAL: depende de parecer]` | Dados dos clientes do prestador | Termos do Prestador (`02-termos-do-prestador.md`, em elaboração) | — |
| Administradores | Pessoas do controlador com acesso privilegiado | Leitura ampla (seção 8.2, G03) | Termo de confidencialidade `[PLANEJADO]` | — |

### 1.2 Encarregado

1. O encarregado ainda não foi indicado, porque a empresa não existe. O canal público será [E-MAIL DO ENCARREGADO].
2. A página da ANPD diz que "é desejável que o encarregado seja consultado na elaboração e na análise das conclusões do RIPD". Isso não aconteceu.
3. A Res. CD/ANPD 2/2022 dispensa agentes de pequeno porte de indicar encarregado (art. 11), mas tira esse benefício de quem faz tratamento de alto risco (art. 3º, I). T1 e T2 provavelmente são de alto risco (seção 2.1). Este rascunho parte da premissa de que haverá encarregado. `[CONDICIONAL: depende de parecer]`

### 1.3 Outras partes consultadas

Nenhuma. Não há parecer de advogado, contador, Apple, Google ou dos titulares (prestadores e famílias). A revisão das políticas do catálogo acontece em paralelo e pode mudar os números da seção 3.

## 2. Por que este relatório existe, o que ele cobre e em quais sistemas (itens c, d e e)

### 2.1 Justificativa

1. **Critério da ANPD.** A página da ANPD usa a Res. CD/ANPD 2/2022, art. 4º, como referência: é de alto risco o tratamento que atende, ao mesmo tempo, a pelo menos um critério geral e um específico. Gerais: larga escala, ou tratamento que possa "afetar significativamente interesses e direitos fundamentais". Específicos: tecnologia emergente ou inovadora; vigilância de zonas acessíveis ao público; decisões só automatizadas; e "utilização de dados pessoais sensíveis ou de dados pessoais de crianças, de adolescentes e de idosos". A página diz que os critérios não esgotam o assunto.
2. **Poder da ANPD.** O art. 38 da LGPD permite à ANPD determinar o relatório, inclusive de dados sensíveis. O art. 10, §3º permite pedi-lo quando o tratamento se funda em legítimo interesse.
3. **Momento.** A ANPD recomenda fazê-lo antes de começar o tratamento ou, não sendo possível, assim que o alto risco for identificado.

| Tratamento | Critério geral (art. 4º, I) | Critério específico (art. 4º, II) | Leitura |
|---|---|---|---|
| T1 | (b) A recusa por certidão pode "impedir o exercício de direitos ou a utilização de um serviço" e causar "discriminação"; arquivos de identidade expostos podem levar a "roubo de identidade" (art. 4º, §2º) | (d) se o advogado entender que documento com foto e selfie são dado sensível | Alto risco, provável |
| T2 | (b) Dano por "discriminação" e "violação à integridade física" (art. 4º, §2º) | (d) idosos, crianças e texto que revela saúde | Alto risco |
| T3 | (b) Texto livre pode trazer dado sensível e vai ao exterior | (a) tecnologia emergente ou inovadora | Alto risco se for ligada `[CONDICIONAL: depende de parecer]` |
| T4 | (b) "fraudes financeiras ou roubo de identidade" (art. 4º, §2º) | Nenhum claro | Provavelmente **não** é alto risco por si só. Entra por prudência: dados financeiros e de autenticação contam como critério de incidente relevante (Res. CD/ANPD 15/2024, art. 5º, III e IV) |

### 2.2 Os quatro tratamentos

| ID | Tratamento | Onde está no código | No ROPA (`07`) | Estado hoje |
|---|---|---|---|---|
| T1 | Verificação de identidade e de antecedentes do prestador e conferência dos documentos da ocupação | `pages/pro/Cadastro.tsx` (passo 3), `services/providers.ts`, bucket `provider-documents`, `submit_provider_for_review`, `admin_review_document`, `components/admin/DocumentCard.tsx` | OP-06 (e OP-05 e OP-24, no que toca documentos) | Funciona no ambiente local. A conferência é feita por pessoa. Não implantado |
| T2 | Linha Cuidado: casa, pessoa assistida, plantões, check-in e relatório do dia | `supabase/migrations/20261019000009_care.sql`, `services/care.ts`, `pages/cuidado/*`, `pages/pro/Plantoes.tsx`, `components/cuidado/*` | OP-18 a OP-21 | Funciona localmente. O item "Cuidado" já aparece no menu do cliente com login (`components/navItems.ts`), mas `docs/DECISOES.md` (D12) manda não divulgar antes dos pré-requisitos |
| T3 | Assistente de pedidos com modelo de linguagem | Edge Function `request-assist`, `_shared/assist.ts` | OP-22 | A função e os testes existem. **Nenhuma tela a chama.** Sem a chave `ANTHROPIC_API_KEY` ela responde 503 |
| T4 | Cobrança pelo Asaas: CPF/CNPJ do pagador, conta de recebimento do prestador, assinatura Pro, cobrança de clientes próprios | `payments-create`, `subscriptions-manage`, `asaas-onboard`, `charges-create`, `asaas-webhook` | OP-13 a OP-16 | Nunca testado contra o Asaas real. Comissão (`commission_enabled`) e pagamento retido (`escrow_enabled`) vêm desligados |

### 2.3 O que fica de fora

1. **Telas de demonstração** (`/verification`, `/register-provider`, `/medical-records`, `/teleconsultation/:sessionId`): usam dados fictícios e não enviam nada. A tela `/verification` só mostra a prévia da câmera e diz: "Nenhuma imagem é capturada, enviada ou armazenada". Se algum dia virarem funcionalidade real (verificação por fornecedor, prontuário, teleconsulta), exigem RIPD próprio `[PLANEJADO]`.
2. **Demais tratamentos:** login por código, pedidos e propostas, agenda, avaliações, notificações em geral, CRM do prestador, páginas públicas e de SEO. Entram no registro das operações (`07-registro-das-operacoes-de-tratamento.md`, em elaboração) e na política de privacidade (`03-politica-de-privacidade.md`, em elaboração).
3. **Comissão e pagamento retido.** Desligados por padrão (`platform_settings`). Se forem ligados `[CONDICIONAL: depende de parecer]`, este relatório deve ser revisto antes (seção 11).

### 2.4 Sistemas de informação (item e)

- Aplicativo React (site/PWA, Android e iOS por Capacitor, desktop por Tauri). Só conhece a URL do Supabase e a chave publicável.
- Supabase: Postgres com RLS em todas as tabelas, Auth por código (OTP), Storage (bucket privado `provider-documents`), Edge Functions em Deno, `pg_cron`, Vault.
- Edge Functions: `payments-create`, `payments-void`, `charges-create`, `subscriptions-manage`, `asaas-onboard`, `asaas-webhook`, `notify-dispatch`, `account-export`, `account-delete`, `request-assist`.
- Fornecedores externos: Asaas, Anthropic, WhatsApp Cloud API (Meta), Resend. Link aberto pelo usuário: OpenStreetMap.
- Ambiente de produção: **não existe**. Tudo roda na stack local de desenvolvimento.

## 3. Descrição do tratamento (item f)

Cada tratamento tem o fluxo, da coleta à eliminação, e a tabela de dados. Tudo é o que o código faz hoje.

### 3.1 T1. Verificação de prestadores

**Fluxo**

1. **Coleta.** O prestador cria o cadastro (`become_provider`) e, em `/pro/cadastro`, passo 3, envia um arquivo por item que a política da ocupação exige (`occupation_policies.verification`): foto ou PDF, até 10 MiB. Para a certidão de antecedentes, a tela exige marcar uma autorização e grava `consents` (`background_check`) antes do envio.
2. **Armazenamento.** O arquivo vai para o bucket privado `provider-documents`, na pasta do prestador. Nasce uma linha em `provider_documents` com status `submitted`.
3. **Envio para análise.** `submit_provider_for_review` só aceita se cada item exigido tem arquivo no bucket.
4. **Conferência.** Um administrador abre o arquivo por link assinado de 5 minutos e aceita, ou rejeita com motivo. A tela diz "Aceite só depois de abrir o arquivo e conferir". Não há roteiro escrito do que comparar (G23). **Não há** reconhecimento facial, extração de modelo biométrico, prova de vida nem fornecedor externo de verificação.
5. **Uso da decisão.** Uma ocupação só aparece na busca e só recebe pedidos se estiver aprovada, com todos os itens da política aceitos. Se um documento deixa de estar aceito, a aprovação cai (trigger `provider_documents_revoke_approvals`).
6. **Quem lê.** O dono e os administradores. O prestador lê o motivo de uma rejeição. Número e UF do registro profissional aparecem na página pública do prestador aprovado (`get_provider_page`).
7. **Guarda.** Arquivos e linhas ficam até a exclusão da conta. O dono só apaga o que ainda não foi revisado. Arquivo já revisado, aceito ou rejeitado, fica travado: o código o trata como prova.
8. **Eliminação.** Na exclusão da conta, `account-delete` esvazia a pasta pelo Storage, `anonymize_user` apaga as linhas de `provider_documents` e o usuário do Auth é apagado, nessa ordem.

**Dados**

| Dado | Onde fica | Quem lê | Para quê | Classificação adotada | Guarda hoje |
|---|---|---|---|---|---|
| Foto de documento oficial com foto e selfie (`documento_selfie`; 1.710 de 1.710 ocupações) | Storage `provider-documents/<id>/…` e linha em `provider_documents` | Dono; administradores | Confirmar a identidade para aprovar o cadastro | Sensível por cautela `[CONDICIONAL: depende de parecer]` (seção 4.2) | Até a exclusão da conta |
| Comprovante de CPF ou CNPJ (`cadastro_fiscal`; 1.710) | Idem | Idem | Cadastro fiscal | Comum | Idem |
| Certidão de antecedentes criminais (`antecedentes`; 631) | Idem | Idem | Segurança dos clientes | Comum, de risco elevado (seção 4.2) | Idem |
| Comprovante de registro profissional (778), licença ou alvará (254), certificado de curso (122), CNH (59), seguro de responsabilidade civil (1) | Idem | Idem | Comprovar o requisito da ocupação | Comum. CNH e outros documentos podem trazer anotações que revelam saúde `[incerto]` | Idem |
| Número, UF e situação do registro (`provider_occupations`) | Banco | Dono e admin; o público, se aprovado | Mostrar ao cliente | Comum (dado de conselho) | Até a exclusão da conta |
| Decisão: `status`, `reviewed_by`, `reviewed_at`, `rejection_reason`; eventos `document.accepted` e `document.rejected` | `provider_documents` e `audit_log` | Dono (o motivo); admin | Prestação de contas | Comum | `audit_log`: sem prazo, não se apaga |
| Autorização `background_check` | `consents` | Dono; admin | Registrar a autorização da certidão | Comum | Até a exclusão da conta |

### 3.2 T2. Linha Cuidado

**Fluxo**

1. **Coleta (família).** Cria a casa (nome, bairro, observações) e a pessoa assistida (primeiro nome, ano de nascimento, preferências, contato de emergência) e os plantões (período, valor, observações). As telas dizem para não escrever dados de saúde e bloqueiam algumas palavras no navegador.
2. **Oferta.** A família (ou o admin) oferece o plantão a até 10 cuidadores aprovados (`offer_shift`; no máximo 30 ofertas novas por dia por família). O cuidador recebe WhatsApp ou e-mail, se tiver contato confirmado, com horário e bairro.
3. **O que o cuidador oferecido vê** (`caregiver_shifts()`): período, situação, valor do repasse, observações do plantão, bairro e primeiro nome da pessoa assistida. Ele não lê as tabelas `shifts`, `households` nem `care_recipients`; não vê preferências, contato de emergência nem o valor cobrado da família.
4. **Aceite.** O primeiro que aceita fica com o plantão (`accept_shift_offer`). A partir daí família e cuidador passam a ver nome e telefone um do outro.
5. **No plantão.** O cuidador designado registra entrada e saída (`check_in`), numa janela de 2 horas antes ou depois do horário, com coordenadas opcionais. Ele envia o relatório do dia (`submit_daily_report`: refeições, atividades, humor, observações). Reenviar substitui o anterior.
6. **Leitura.** A família lê os check-ins (com link para mapa) e os relatórios. O cuidador lê os seus. Administradores leem tudo.
7. **Cancelamento.** `cancel_shift` grava o motivo (texto livre) no `audit_log`, que não se apaga.
8. **Guarda e eliminação.** Sem prazo. A exclusão da conta da família apaga casas, pessoas assistidas, plantões, check-ins e relatórios em cascata, depois de `anonymize_user`. A exclusão da conta do cuidador zera as coordenadas dos check-ins dele; check-ins e relatórios continuam com a família, sem identificar o cuidador.

**Dados**

| Dado | Onde fica | Quem lê | Para quê | Classificação adotada | Guarda hoje |
|---|---|---|---|---|---|
| Nome da casa, bairro e observações (até 2.000 caracteres) | `households` | Família; admin | Identificar o local do cuidado e combinar a logística | Comum; o texto livre pode revelar | Até apagar a casa ou a conta |
| Pessoa assistida: primeiro nome, ano de nascimento, preferências (até 2.000), contato de emergência (até 300; nome e telefone de **terceiro**) | `care_recipients` | Família; admin. O cuidador vê só o primeiro nome | O primeiro nome serve para o cuidador chamar a pessoa. Ano, preferências e contato são conveniência da família | Comum. Sensível se revelar saúde (art. 11, §1º). Idosos e crianças são grupos vulneráveis | Idem |
| Plantão: período, valor da família, repasse, situação, observações (até 2.000) | `shifts`, `shift_offers` | Família; admin. O cuidador vê período, repasse e observações por `caregiver_shifts()` | Combinar, oferecer e designar o plantão; aplicar a trava trabalhista | Comum. As observações podem revelar | Idem |
| Entrada e saída: horário e coordenadas opcionais, com 6 casas decimais | `checkins` | Cuidador; família do plantão; admin | Comprovar a presença e informar a família | Localização: dado comum, de risco elevado | Idem. Coordenadas zeradas se o cuidador exclui a conta |
| Relatório do dia: refeições, atividades, humor (até 500), observações | `daily_reports` | Cuidador; família; admin | Informar a família sobre o dia | Pode revelar saúde (art. 11, §1º) | Idem |
| Nome e telefone de cuidador e família, depois da designação | `profiles` | Os dois lados; admin | Permitir o contato direto entre os dois | Comum | Até a exclusão da conta |
| Motivo do cancelamento (texto livre) | `audit_log` | Admin | Prestação de contas e trilha de auditoria | Pode revelar | Sem prazo, imutável |
| Aviso "plantão oferecido": horário e bairro | `notifications`; WhatsApp ou e-mail | Cuidador; Meta ou Resend | Avisar o cuidador da oferta | Comum | Contato e parâmetros zerados na anonimização |

### 3.3 T3. Assistente de pedidos

**Fluxo**

1. **Hoje.** Nenhuma tela chama a função. `[PLANEJADO]`: a tela do pedido ofereceria "organizar com o assistente".
2. **Entrada.** A função exige login. Valida o texto (10 a 2.000 caracteres) e consome uma unidade da cota (padrão: 10 por hora por usuário; o valor 0 desliga o assistente).
3. **Preparo no servidor.** Escolhe até 20 ocupações candidatas do catálogo por palavras em comum com o texto. Esta etapa não usa modelo.
4. **Envio ao fornecedor.** Manda a instrução de sistema, a lista de candidatos e o texto do cliente. **Não manda** nome, e-mail, telefone nem o id do usuário.
5. **Resposta.** Estrutura fixa: ocupação (só entre os candidatos, ou "nenhuma"), urgente (sim ou não) e resumo de até 3 frases (até 500 caracteres). A função valida e devolve ao aplicativo. Não grava o texto nem o resumo. Grava só o contador da cota, apagado depois de 1 dia.
6. **No fornecedor** (páginas do fornecedor lidas em 23/10/2026): entradas e saídas são apagadas automaticamente em 30 dias, com exceções (acordo de retenção zero; retenção maior para aplicar a política de uso, até 2 anos, e 7 anos para notas de classificação; exigência legal); clientes pagos de API não têm exclusão pontual; os dados ficam armazenados nos EUA e o tráfego pode ser roteado a EUA, Europa, Ásia e Austrália; os termos comerciais dizem que o fornecedor não treina modelos com o conteúdo do cliente.
7. **Depois.** Se o cliente aproveitar o resumo no pedido, ele vira `requests.description`, que os prestadores aprovados da ocupação e do bairro leem, sem telefone nem e-mail do cliente.

**Dados**

| Dado | Onde passa ou fica | Quem acessa | Para quê | Classificação adotada | Guarda |
|---|---|---|---|---|---|
| Texto livre do cliente (10 a 2.000 caracteres) | Memória da Edge Function; API do fornecedor | A função; o fornecedor | Gerar o rascunho do pedido | Comum, mas pode trazer dado sensível, endereço, telefone e CPF | Fornecedor: 30 dias, com exceções |
| Instrução de sistema e lista de candidatos | Idem | Idem | Orientar o modelo | Não pessoal | Idem |
| Resposta: ocupação, urgente, resumo | Aplicativo do cliente; depois `requests`, se ele aceitar | Cliente; prestadores | Preencher ocupação, urgência e resumo do pedido | Pode revelar saúde: a instrução manda escrever "situação de saúde urgente" | `requests`: até a exclusão |
| Id do usuário e contagem por hora | `assist_usage` | Só `take_assist_quota` | Limitar o uso por hora (custo e abuso) | Comum | 1 dia (job `workeasy-expire-stale`) |

### 3.4 T4. Pagamentos

**Fluxo**

1. **Primeira cobrança do cliente.** O cliente digita CPF ou CNPJ (só dígitos, conferidos na tela e no servidor). A função exige nome no perfil e cria o cliente no Asaas com nome, CPF/CNPJ, e-mail do login, telefone do perfil e a referência `user:<id>`, com as notificações do Asaas desligadas. Só `asaas_customer_id` é gravado no banco do WorkEasy.
2. **Cobrança.** Cria a cobrança (Pix, cartão ou boleto) com divisão (split) para a conta do prestador. Cartão e boleto usam a página do Asaas; o aplicativo não recebe número de cartão. O Pix devolve o QR code.
3. **Registro.** Grava `payments` (valores, método, status, links, vencimento, `raw` sem chaves `creditCard*`). O webhook do Asaas atualiza o status e grava `payment_events`.
4. **Prestador.** `asaas-onboard` envia ao Asaas nome, e-mail, CPF/CNPJ, data de nascimento (pessoa física) ou tipo de empresa, telefone, renda ou faturamento mensal e endereço para abrir a subconta; o WorkEasy guarda só ids, status e a chave da subconta (Vault). `subscriptions-manage` cria a assinatura Pro com o mesmo cadastro de cliente. `charges-create` (plano Pro) cobra um cliente próprio do prestador: CPF/CNPJ (obrigatório), nome, e-mail e telefone **desse terceiro** vão ao Asaas pela subconta.
5. **Comissão e pagamento retido.** Desligados. Se forem ligados `[CONDICIONAL: depende de parecer]`, revisar este relatório.
6. **Exclusão.** `account-delete` cancela a assinatura e as cobranças em aberto no Asaas. `anonymize_user` reduz `payments.raw` aos campos fiscais, apaga links e QR e os pagamentos ficam sem pagador. O cadastro do cliente e a subconta no Asaas não são apagados pelo WorkEasy.

**Dados**

| Dado | Onde fica | Quem lê | Para quê | Classificação adotada | Guarda |
|---|---|---|---|---|---|
| CPF ou CNPJ do pagador | Pedido → Edge Function → Asaas. Não vai para coluna própria. Pode aparecer em `payments.raw` se o gateway devolver `[incerto]` | Asaas; admin, se estiver no `raw` | Criar o cliente e emitir a cobrança (campo obrigatório da API do Asaas) | Comum, financeiro | No Asaas `[incerto]`; no `raw`, reduzido na exclusão |
| Nome, e-mail e telefone do pagador | `profiles` e Auth → Asaas | Asaas | Identificar e contatar o pagador no Asaas | Comum | No WorkEasy: até a exclusão da conta. No Asaas: `[incerto]` |
| Valor, método, status, datas, links e Pix | `payments` | Pagador, prestador e admin (sem `raw`) | Registrar a cobrança e o recebimento; guarda fiscal | Comum, financeiro | Mantido por obrigação fiscal, sem prazo fixado `[incerto]` |
| Payload do gateway | `payments.raw` e `payment_events.payload` | Admin: `admin_get_payment_raw` registra a leitura; `payment_events` só admin | Suporte e conferência com o Asaas | Comum. Pode conter dados do pagador | `raw` é reduzido na exclusão. `payment_events` não é tratado |
| Dados do prestador na subconta: nome, e-mail, CPF/CNPJ, nascimento, telefone, renda mensal, endereço, CEP | Edge Function → Asaas. O WorkEasy guarda ids e status | Asaas | Abrir a conta de recebimento (campos obrigatórios da API) | Comum, financeiro | No Asaas |
| Chave da subconta | Vault | Só a service role | Cobrar na conta do prestador | Segredo | Enquanto houver subconta |
| Dados do cliente do prestador (terceiro) em cobrança própria | Edge Function → Asaas (subconta) | Asaas; prestador | Emitir a cobrança do prestador ao cliente dele | Comum | No Asaas |

### 3.5 Titulares, grupos vulneráveis e volume

| Categoria | Quem é | De onde vem o dado | Vulnerável? | Tem conta? |
|---|---|---|---|---|
| Prestador | Autônomo, MEI ou empresa; inclui cuidadores | Do próprio prestador: formulários e arquivos | Depende da plataforma para obter trabalho: uma recusa por certidão pode excluí-lo | Sim |
| Cliente ou família | Adulto que contrata | Do próprio cliente | Não | Sim |
| Pessoa assistida | Idoso, pessoa com deficiência, adulto dependente ou criança | De **terceiro**: a família a cadastra e o cuidador escreve o relatório | **Sim.** Idosos e crianças estão no art. 4º, II, d, da Res. CD/ANPD 2/2022 | Não |
| Contato de emergência | Terceiro indicado pela família | Da família | Não | Não |
| Cliente do prestador | Terceiro cobrado por prestador Pro | Do prestador | Não | Nem sempre |
| Administrador | Pessoa do controlador | Criado só pela service role (`admins`) | Não | Sim |

**Volume.** Zero titulares reais hoje. Não há projeção `[incerto]`. O catálogo tem 1.710 ocupações e o seed de bairros cobre a cidade de São Paulo (96 bairros). O critério de partida do Cuidado em `docs/DECISOES.md` é um piloto com pelo menos 3 famílias em modo concierge, o que é uma condição, não uma estimativa de volume.

**Crianças.** Das 1.710 ocupações do catálogo, 165 estão marcadas `audienceMinors` (público de menores) e todas exigem certidão de antecedentes. Entre as 67 ocupações com unidade de preço `plantao`, 9 são marcadas para menores (por exemplo babá e cuidadora de recém-nascido). A pessoa assistida pode, portanto, ser criança.

### 3.6 Compartilhamentos

| Quem recebe | O quê | Como | Observação |
|---|---|---|---|
| Administradores | Documentos, perfis, casas, pessoas assistidas, plantões, check-ins, relatórios, pagamentos (sem `raw`) | Políticas RLS com `is_admin()` | Sem MFA nem registro de leitura (G02, G03) |
| Edge Functions (service role) | Dados de todos os tratamentos | Chave de serviço, só no servidor | — |
| Supabase | Tudo | Hospedagem | Seção 1.1 |
| Asaas | CPF/CNPJ, nome, e-mail, telefone, endereço, renda, nascimento | Chamadas de API das Edge Functions | Seção 1.1 |
| Anthropic | Texto livre do assistente | API, só se o assistente for ligado | Seção 1.1 |
| Meta e Resend | Telefone ou e-mail e texto das mensagens | Edge Function `notify-dispatch` | `[incerto]` |
| OpenStreetMap | Coordenadas do check-in | A família clica em "Ver local do registro"; as coordenadas vão na URL | Site de terceiro, acionado pelo usuário (G11) |
| Cuidador e família entre si | Nome e telefone | Só depois da designação | `shares_contact` |

### 3.7 Retenção e descarte hoje

| Categoria | Prazo hoje | Como se descarta | Observação |
|---|---|---|---|
| Arquivos e linhas de documentos | Até a exclusão da conta | `account-delete` e `anonymize_user` | Sem expurgo por tempo (G01) |
| Casas, pessoas assistidas, plantões, check-ins e relatórios | Até a exclusão da conta ou da casa | Cascata; `anonymize_user` limpa antes | Sem prazo (G11) |
| Consentimentos | Até a exclusão da conta | Cascata | Histórico imutável enquanto a conta existe |
| `audit_log` | Sem prazo | Não se apaga | Inclui texto livre (G20) |
| `payments` | Sem prazo fixado | Anonimizado, não apagado | Obrigação fiscal; prazo `[incerto]` |
| `payment_events` | Sem prazo | Não tratado na exclusão | G16 |
| Notificações | Sem prazo | Contato e parâmetros zerados na exclusão | — |
| `assist_usage` | 1 dia | Job `workeasy-expire-stale`, a cada 15 minutos | É o único expurgo agendado do banco |
| Texto do assistente no fornecedor | 30 dias | Automático | Sem exclusão pontual |
| Backups do Supabase | `[incerto]` | `[incerto]` | A página do fornecedor diz que bancos pagos têm backup diário |

## 4. Hipóteses legais por finalidade (item g)

1. Para cada finalidade: uma hipótese **proposta**, alternativas e a dúvida. Nada aqui é decisão. `[CONDICIONAL: depende de parecer]` vale para a seção inteira.
2. Hoje o código só exige o aceite de `terms` e `privacy` (`REQUIRED_CONSENTS` em `services/account.ts`). `background_check` e `location` são pedidos nas telas, na hora do uso. `marketing` é opcional.
3. Dado sensível só se trata nas hipóteses do art. 11. A ANPD lembra, no estudo sobre biometria, que sem o consentimento específico e destacado "o controlador poderá utilizar uma das hipóteses legais do inciso II, do art. 11 da Lei" (Radar Tecnológico nº 2, p. 22). Para crianças, o Enunciado CD/ANPD 1/2023 admite as hipóteses dos arts. 7º ou 11, "desde que observado e prevalecente o seu melhor interesse".

### 4.1 Finalidades, hipóteses e dúvidas

| ID | Finalidade e dados | Hipótese proposta | Alternativas e dúvidas | Situação no código |
|---|---|---|---|---|
| F1 | Confirmar a identidade do prestador (foto de documento e selfie) | Art. 11, II, "g": "garantia da prevenção à fraude e à segurança do titular, nos processos de identificação e autenticação de cadastro em sistemas eletrônicos", com a ressalva dos direitos do art. 9º e dos direitos e liberdades fundamentais que prevaleçam | (a) Art. 11, I, consentimento específico e destacado: fica frágil se for condição para se cadastrar, porque o art. 5º, XII exige manifestação "livre". (b) Se o advogado entender que a imagem não é dado sensível: art. 7º, V ou IX. **Dúvida:** "g" fala da segurança do **titular**; aqui a conferência também protege o cliente | Nenhuma base é registrada nesse passo. `consents` não tem propósito próprio para ele |
| F2 | Conferir CPF/CNPJ, registro profissional, CNH, licença, curso e seguro | Art. 7º, V ("procedimentos preliminares relacionados a contrato") e, nas ocupações regulamentadas, II (obrigação legal ou regulatória), onde a norma exigir | Art. 7º, IX. A política de cada ocupação diz qual comprovante pedir; 1.057 de 1.710 estão `a_confirmar` | O passo vem da política da ocupação. Base não registrada |
| F3 | Avaliar antecedentes criminais (certidão) | Escolher entre art. 7º, I (consentimento: é o que a tela faz hoje; revogável), art. 7º, IX (legítimo interesse: finalidade concreta, só os dados necessários e transparência, art. 10) e art. 7º, V. O inciso II só se uma norma exigir a certidão | O consentimento é "livre" quando é condição para 631 ocupações? O que acontece com o arquivo e com a aprovação se for revogado (art. 8º, §5º; art. 18, IX)? A analogia com o TST vale (seção 4.2)? | Caixa de autorização na tela e linha em `consents`. Revogar não faz nada no banco (G04) |
| F4 | Registrar decisões e trilha de auditoria | Art. 7º, IX, ligado à responsabilização e prestação de contas (art. 6º, X) | Art. 7º, II onde houver dever legal | `audit_log` |
| F5 | Cadastrar casa, pessoa assistida e plantões | Art. 7º, V (contrato entre a família e o cuidador, intermediado) e IX. Para criança: art. 14, §1º ("consentimento específico e em destaque dado por pelo menos um dos pais ou pelo responsável legal") e Enunciado 1/2023 | Quem consente pela pessoa idosa ou incapaz? A família tem poder para isso e como prová-lo? | Sem base registrada. Sem consentimento do responsável (G06) |
| F6 | Registrar presença com localização (check-in) | Art. 7º, I (consentimento opcional, que já existe na tela) ou art. 7º, V (comprovar a execução do serviço) | Revogação, prazo de guarda, coordenadas arredondadas | `location` em `consents` e caixa na tela. O banco não confere (G04) |
| F7 | Relatório do dia e observações do plantão | Art. 7º, V. Se o texto revelar saúde (art. 11, §1º): art. 11, I (consentimento específico e destacado do titular ou do responsável legal) ou II, "d" ("exercício regular de direitos, inclusive em contrato") | O cuidador escreve sobre a pessoa assistida. Quem consente por ela, e o cuidador sabe que escreve sobre saúde? | Sem base registrada (G05) |
| F8 | Contato de emergência (nome e telefone de terceiro) | Art. 7º, VII ("proteção da vida ou da incolumidade física do titular ou de terceiro") ou IX | Precisa avisar o terceiro? Vale a declaração da família? | Sem aviso ao terceiro (G10) |
| F9 | Assistente de pedidos (texto livre enviado ao fornecedor no exterior) | Art. 7º, I, com opt-in específico antes do primeiro envio. Se houver dado sensível no texto: art. 11, I. Transferência: art. 33 (seção 4.3) | Não ligar o assistente (seção 5) | Desligado. Sem aviso (G08, G09) |
| F10 | Cobrar o cliente (CPF/CNPJ, nome, e-mail, telefone) | Art. 7º, V. Guarda fiscal: art. 7º, II e art. 16, I ("cumprimento de obrigação legal ou regulatória pelo controlador") | Papel do Asaas; prazo de guarda com o contador `[incerto]` | Funciona localmente |
| F11 | Abrir a conta de recebimento e a assinatura do prestador (CPF/CNPJ, nascimento, telefone, renda, endereço) | Art. 7º, V e, para as exigências do instituto de pagamento, II `[incerto]` | A API do Asaas exige esses campos (seção 5) | Funciona localmente |
| F12 | Cobrar clientes do prestador (terceiros) | O prestador é o controlador e o WorkEasy é operador. Hipótese do prestador, em geral art. 7º, V | Os Termos do Prestador devem dizer isso | Funciona localmente. Sem aviso ao terceiro |

### 4.2 Como classifiquei os três grupos difíceis

#### 4.2.1 Documento com foto e selfie

1. **Fato.** O aplicativo recebe um arquivo de imagem ou PDF. Ninguém extrai modelo facial e nenhum programa compara rostos. Uma pessoa confere (seção 3.1).
2. **Biometria, segundo a ANPD:** "análise técnica, realizada por meios matemáticos e estatísticos" das características fisiológicas ou comportamentais (Radar nº 2, p. 6). A verificação consiste em "realizar a comparação de dois templates biométricos" (p. 13). Esse passo não existe no WorkEasy.
3. **Mesmo assim:** (i) o art. 5º, II inclui "dado genético ou biométrico, quando vinculado a uma pessoa natural"; (ii) o art. 11, §1º aplica o regime dos sensíveis a "qualquer tratamento de dados pessoais que revele dados pessoais sensíveis e que possa causar dano ao titular"; (iii) a ANPD observa que "uma imagem bruta de uma biometria facial pode revelar informações de saúde" (p. 21).
4. **Adotado:** tratar como sensível por cautela, **sem afirmar** que é dado biométrico. Efeitos pretendidos: base do art. 11, acesso mínimo, guarda curta e nenhum reaproveitamento da imagem. Hoje faltam o acesso mínimo e a guarda curta (G01 a G03). A busca no código não achou outro uso da imagem além da conferência do administrador. `[CONDICIONAL: depende de parecer]`
5. **Se entrar um fornecedor de verificação com reconhecimento facial** `[PLANEJADO]`, este relatório deve ser refeito. O comentário da tela de demonstração já registra que isso exige fornecedor contratado, base legal documentada (LGPD, art. 11) e tratamento no servidor.

#### 4.2.2 Certidão de antecedentes criminais

1. **Lista do art. 5º, II.** Origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, saúde, vida sexual, dado genético ou biométrico. **Antecedentes e condenações não estão na lista.**
2. **Classificação adotada:** dado comum (art. 5º, I) **de risco elevado**, com salvaguardas iguais às de dado sensível: acesso mínimo, guarda curta e, depois da conferência, só o resultado. São medidas propostas (G01 a G03 e G17). Hoje a certidão fica guardada até a exclusão da conta.
3. **Por que risco elevado.**
   - A recusa pode "impedir o exercício de direitos ou a utilização de um serviço" e causar "discriminação" (Res. CD/ANPD 2/2022, art. 4º, §2º).
   - O princípio da não discriminação (art. 6º, IX) impede tratamento para fins discriminatórios ilícitos ou abusivos.
   - O TST (IRR, Tema 1) diz que exigir a certidão de candidato a emprego não é legítimo e gera dano moral quando "traduzir tratamento discriminatório ou não se justificar" por lei, pela natureza do ofício ou pela "fidúcia" especial. A mesma tese admite a exigência, "a exemplo de empregados domésticos, cuidadores de menores, idosos ou deficientes".
   - **414 das 631 ocupações** que exigem a certidão não são regulamentadas: nenhum conselho a exige, a escolha é da plataforma. 373 das 631 têm política `a_confirmar`.
4. **Limite da analogia.** O precedente é trabalhista e trata de candidato a emprego. O WorkEasy intermedeia autônomos. Os exemplos do TST se parecem com a linha Cuidado; para as demais ocupações a justificativa tem de ser feita ocupação por ocupação. `[CONDICIONAL: depende de parecer]`

#### 4.2.3 Texto livre do Cuidado

1. **Fato.** As telas dizem para não escrever saúde e o navegador barra 17 grupos de palavras (`HEALTH_TERMS` em `services/care.ts`). O banco só limita o tamanho. "Humor", "refeições" e "observações" descrevem o dia de uma pessoa, muitas vezes idosa.
2. **Leitura.** Se o texto revelar saúde, aplica-se o art. 11 (art. 11, §1º). Trato como sensível o que o texto revelar e o cadastro da pessoa assistida como dado de idoso ou de criança (Res. CD/ANPD 2/2022, art. 4º, II, d).
3. **Consequência.** A frase "O WorkEasy não guarda dados de saúde", exibida nas telas, **não pode ser garantida** pelo sistema (G05).

### 4.3 Transferência internacional

1. Enviar o texto à Anthropic é transferência internacional: o art. 5º, XV define a "transferência de dados pessoais para país estrangeiro ou organismo internacional". O fornecedor diz que os dados ficam armazenados nos EUA.
2. O art. 33 só permite a transferência em casos listados. Interessam: I (país ou organismo com grau de proteção adequado); II (quando o controlador "oferecer e comprovar garantias de cumprimento dos princípios, dos direitos do titular" etc., por exemplo com cláusulas-padrão); e VIII (consentimento "específico e em destaque para a transferência").
3. A Res. CD/ANPD 19/2024 (Anexo I, art. 9º, II) lista os mecanismos válidos: decisão de adequação; cláusulas-padrão, normas corporativas globais ou cláusulas específicas; ou as hipóteses do art. 33 (II, "d", e III a IX). A transferência amparada em cláusulas-padrão "pressupõe a adoção integral e sem alteração do texto disponibilizado no Anexo II" (art. 16). O prazo de 12 meses para incorporar essas cláusulas aos contratos, contado da publicação da resolução (agosto de 2024), já terminou (Res. 19/2024, art. 2º, parágrafo único).
4. O DPA da Anthropic que li cita as cláusulas-padrão da União Europeia (módulos 2 e 3) e adendos do Reino Unido e da Suíça. **Não vi menção ao Brasil nem à LGPD** `[incerto]: leitura da página, confirmar no texto integral`. O DPA da Supabase tem a mesma estrutura. Sem cláusulas da ANPD firmadas, nenhum mecanismo do art. 33 está demonstrado para esses fornecedores (G09, G12).

## 5. Necessidade e proporcionalidade

| Tratamento | Dado ou etapa | Para que serve | Alternativa menos invasiva | Avaliação |
|---|---|---|---|---|
| T1 | Foto de documento e selfie | Reduzir fraude de identidade e dar ao cliente, que recebe alguém em casa, um mínimo de confiança | (1) Conferência por pessoa, que é a atual. (2) Fornecedor com reconhecimento facial: mais invasivo. (3) Só o número do documento: não confirma quem é | Proporcional na finalidade e no método (sem biometria automática). **Excessivo** na guarda sem prazo (G01) e na regra única para as 1.710 ocupações (G18) |
| T1 | Comprovante de CPF ou CNPJ | Cadastro fiscal e cobrança | O Asaas também colhe esses dados ao abrir a subconta (seção 3.4) | Há duplicidade: o WorkEasy guarda a imagem e o Asaas guarda o cadastro. Avaliar guardar só a decisão (G01) |
| T1 | Certidão de antecedentes | Segurança dos clientes, sobretudo crianças, idosos e entrada em casa | (1) Pedir só nas ocupações que lidam com vulneráveis ou entram na casa. (2) Guardar só "nada consta" e a data. (3) Declaração do prestador e certidão sob demanda do cliente | **Desproporcional se aplicada às 631 ocupações sem justificativa por ocupação.** Mais defensável para babá, cuidador de idosos e de pessoas com deficiência (G17) |
| T1 | Documentos da ocupação (registro, CNH, licença etc.) | Provar o requisito da ocupação | Consulta pública do conselho. O painel já abre a busca sem enviar o número do prestador (`registryLookupUrl` em `services/admin.ts`) | Proporcional quando a política da ocupação exige. 1.057 políticas ainda `a_confirmar` |
| T2 | Primeiro nome, bairro, valor | Combinar o plantão | — | Proporcional |
| T2 | Ano de nascimento, preferências, contato de emergência | Conveniência da família. O cuidador não os vê | Combinar fora do aplicativo | Opcionais, e a plataforma não os usa para entregar o serviço. Necessidade baixa: manter opcionais ou retirar |
| T2 | Observações do plantão (texto livre) | Logística (portaria, hora do almoço) | Campos fechados; texto curto | Até 2.000 caracteres é mais que o necessário (G07) |
| T2 | Check-in com coordenadas | Comprovar presença e dar tranquilidade à família | Check-in sem coordenadas (já permitido); guardar só "dentro ou fora do raio"; coordenadas arredondadas | **Desproporcional** na precisão (6 casas decimais) e na guarda sem prazo (G11) |
| T2 | Relatório do dia | Informar a família | Opções fechadas; telefonema; sem relatório | O formato livre convida a dado de saúde. Decisão do dono e do advogado (G05) |
| T3 | Texto livre enviado ao modelo | Transformar a descrição em pedido estruturado: ocupação, urgência, resumo | (1) O formulário manual, que já existe. (2) A etapa local que escolhe candidatos por palavras, sem modelo | **Necessidade baixa.** O ganho extra do modelo é o resumo e a urgência. Se mantido, só com aviso e opt-in (G08, G09) |
| T4 | CPF ou CNPJ do pagador | A API do Asaas exige `cpfCnpj` para criar o cliente (documentação "Criar novo cliente") | Nenhuma dentro do Asaas | Necessário. Pedir só na primeira cobrança e não gravar em coluna própria, como já é |
| T4 | Dados do prestador na subconta | A API do Asaas exige nome, e-mail, CPF/CNPJ, telefone, renda, endereço e CEP; data de nascimento só para pessoa física (documentação "Criar subconta") | Nenhuma dentro do Asaas | Necessário para esta forma de cobrança. O código pede só o que a API pede |
| T4 | `payments.raw` | Suporte (o admin lê por `admin_get_payment_raw`) | Guardar só campos fiscais | Mais que o necessário: `anonymize_user` já reduz `raw` aos campos fiscais, o que mostra que o resto não é preciso depois (G16) |

## 6. Análise dos princípios da LGPD (item h)

| Princípio (art. 6º) | Como os tratamentos respondem hoje | Lacuna |
|---|---|---|
| I. Finalidade | Cada dado tem um passo e um motivo no fluxo (documento para aprovar, localização para o check-in) | O texto formal ao titular ainda não existe (G13) |
| II. Adequação | Os documentos pedidos seguem a política da ocupação. O Cuidado prevê relato "não clínico" | O relato livre pode virar clínico (R06) |
| III. Necessidade | Ano de nascimento, preferências e contato de emergência são opcionais. O assistente envia só texto e candidatos | Guarda sem prazo, selfie e documento para todas as ocupações, precisão das coordenadas, `raw` (G01, G11, G16, G18) |
| IV. Livre acesso | `account-export` e a tela Minha conta | Exportação incompleta (família; arquivos enviados só como caminho); pessoa assistida sem canal (G14, G15) |
| V. Qualidade | Perfil editável. O relatório reenviado substitui o anterior | Sem canal de correção para terceiros (G15) |
| VI. Transparência | Avisos nas telas de upload e de check-in; o pedido manda não colocar saúde | Política e termos não publicados; consentimentos gravados contra a versão "rascunho" (G13) |
| VII. Segurança | RLS, bucket privado, link curto, Vault, cota, auditoria (seção 8.1) | MFA, registro de leitura, backup, plano de incidente (G02, G03, G19, G22) |
| VIII. Prevenção | Travas no banco (limites de oferta, janela de check-in, cota) e testes pgTAP | Sem monitoramento (G19) |
| IX. Não discriminação | Rejeitar documento exige motivo, que o prestador lê | Sem critério para a certidão; texto livre do Cuidado pode servir a discriminação (R03, R06; G17) |
| X. Responsabilização e prestação de contas | `audit_log` imutável, histórico de consentimentos, este RIPD | Leitura de documento sem registro; texto livre no log (G02, G20) |

## 7. Riscos aos titulares (itens i e j)

### 7.1 Método

1. A ANPD deixa a metodologia a critério do controlador e pede, "para cada fator identificado", a estimativa da "probabilidade de materialização do risco e o impacto inerente". Usei uma escala qualitativa de três níveis, fácil de revisar. O advogado ou o encarregado podem trocá-la.
2. **Probabilidade (P)** no primeiro ano de operação real. 1 = remota: exige falha múltipla ou ato deliberado difícil. 2 = possível: basta um erro comum ou o abuso de quem já tem algum acesso. 3 = provável: acontece com o uso normal ou com uma falha simples.
3. **Impacto (I)** sobre o titular, se acontecer. 1 = baixo: incômodo reversível. 2 = médio: dano limitado, reversível com esforço. 3 = alto: dano grave ou difícil de reverter, como discriminação, exposição de dado sensível, de criança ou de idoso, fraude ou roubo de identidade, risco físico.
4. **Nota = P × I.** 1 a 2: baixo. 3 a 4: médio. 6: alto. 9: crítico.
5. **Três leituras.** *Inerente*: sem as salvaguardas da seção 8.1. *Hoje*: com as que existem no código. *Alvo*: com as medidas da seção 8.2 feitas.
6. **Consequências consideradas**, as da página da ANPD: perda de confidencialidade, de integridade ou de disponibilidade; uso incompatível; tratamento ilícito ou inadequado.
7. **Riscos que se somam**, porque a ANPD pede que se olhe a interação entre eles: R06 com R19 e R22 (texto de saúde, acesso amplo do administrador e nenhum plano de incidente); R01 com R02 e R19 (arquivos que se acumulam, acesso amplo e nenhum registro de leitura).

### 7.2 Matriz

| ID | Tratamento | Risco | Inerente (P×I) | Hoje | Alvo |
|---|---|---|---|---|---|
| R01 | T1 | Acesso indevido aos arquivos de identidade, selfie e certidão | 3×3=9 crítico | 2×3=6 alto | 1×3=3 médio |
| R02 | T1 | Coleta e guarda além do necessário (documento inteiro, arquivos recusados, sem prazo) | 3×2=6 alto | 3×2=6 alto | 1×2=2 baixo |
| R03 | T1 | Recusa ou discriminação com base na certidão de antecedentes | 3×3=9 crítico | 2×3=6 alto | 2×2=4 médio |
| R04 | T1 | Conferência manual errada ou fraudada | 2×3=6 alto | 2×3=6 alto | 1×3=3 médio |
| R05 | T1 | Perda, troca ou adulteração de arquivo ou registro | 2×2=4 médio | 1×2=2 baixo | 1×2=2 baixo |
| R06 | T2 | Texto livre do Cuidado revela saúde | 3×3=9 crítico | 3×3=9 crítico | 2×3=6 alto |
| R07 | T2 | Exposição da pessoa assistida, da rotina ou da casa a cuidadores oferecidos | 2×3=6 alto | 2×2=4 médio | 1×2=2 baixo |
| R08 | T2 | Localização do cuidador coletada e guardada em excesso | 3×2=6 alto | 2×2=4 médio | 1×2=2 baixo |
| R09 | T2 | Dados de criança sem consentimento do responsável | 3×3=9 crítico | 3×2=6 alto | 2×2=4 médio |
| R10 | T2 | Contato de emergência de terceiro sem ciência dele | 3×1=3 médio | 3×1=3 médio | 2×1=2 baixo |
| R11 | T3 | Texto livre ao exterior sem aviso, sem consentimento específico e sem mecanismo de transferência | 3×3=9 crítico | 3×2=6 alto | 2×2=4 médio |
| R12 | T3 | Retenção e exclusão fora do controle do WorkEasy | 3×2=6 alto | 3×2=6 alto | 2×2=4 médio |
| R13 | T3 | Resumo gerado revela saúde ou dado pessoal aos prestadores | 2×2=4 médio | 2×2=4 médio | 1×2=2 baixo |
| R14 | T3 | Falhas técnicas do assistente (classificação errada, injeção de comando, texto em log) | 2×2=4 médio | 2×1=2 baixo | 1×1=1 baixo |
| R15 | T4 | CPF/CNPJ e dados do pagador no Asaas e, talvez, em `payments.raw` | 2×2=4 médio | 1×2=2 baixo | 1×2=2 baixo |
| R16 | T4 | Dados do prestador na abertura da subconta | 2×3=6 alto | 1×3=3 médio | 1×3=3 médio |
| R17 | T4 | Dados de clientes do prestador (terceiros) em cobranças próprias | 3×2=6 alto | 2×2=4 médio | 2×1=2 baixo |
| R18 | T4 | Retenção e anonimização incompletas de dados de pagamento | 3×2=6 alto | 3×1=3 médio | 2×1=2 baixo |
| R19 | Transversal | Administrador com acesso amplo, sem registro de leitura e sem MFA | 3×3=9 crítico | 2×3=6 alto | 1×3=3 médio |
| R20 | Transversal | Consentimento e revogação só valem na tela | 3×2=6 alto | 3×2=6 alto | 1×2=2 baixo |
| R21 | Transversal | Operadores sem contrato, sem região e sem mecanismo de transferência | 3×2=6 alto | 3×2=6 alto | 1×2=2 baixo |
| R22 | Transversal | Incidente sem plano nem monitoramento | 2×3=6 alto | 2×3=6 alto | 2×2=4 médio |
| R23 | Transversal | Transparência e direitos dos titulares não atendidos | 3×2=6 alto | 3×2=6 alto | 1×2=2 baixo |

### 7.3 Por que dei essas notas (probabilidade e impacto inerentes)

**T1. Verificação de prestadores**

| ID | Probabilidade, e por quê | Impacto, e por quê |
|---|---|---|
| R01 | **3.** Conjuntos de documentos de identidade são alvo comum de fraude. Sem controle de acesso, o acesso indevido é quase certo com o tempo | **3.** Roubo de identidade, fraude financeira e extorsão. A Res. CD/ANPD 2/2022 (art. 4º, §2º) cita "fraudes financeiras ou roubo de identidade". A certidão soma estigma |
| R02 | **3.** Pelo desenho, todo arquivo enviado fica até a exclusão da conta, inclusive os recusados. Um documento inteiro traz mais campos do que a conferência usa | **2.** O dano só aparece com mau uso ou incidente, mas multiplica o que se expõe e fere o princípio da necessidade (art. 6º, III) |
| R03 | **3.** Sem critério escrito, 631 ocupações exigem a certidão e o administrador decide caso a caso. Homônimo, registro antigo e exigência sem relação com a ocupação são situações comuns | **3.** Perda do acesso ao trabalho, estigma e dano moral. O TST trata a exigência injustificada como dano moral em candidato a emprego (analogia) |
| R04 | **2.** Uma pessoa confere uma imagem, sem roteiro, sem prova de vida e sem segunda revisão. Erro ou fraude são possíveis, não rotina | **3.** Quem tem o documento usado por outra pessoa sofre uso indevido da identidade. A recusa errada tira alguém do trabalho |
| R05 | **2.** Falha de armazenamento ou de código é possível | **2.** O prestador reenvia e perde tempo. Aprovação sem arquivo seria pior, mas o banco recusa aceitar sem arquivo |

**T2. Linha Cuidado**

| ID | Probabilidade, e por quê | Impacto, e por quê |
|---|---|---|
| R06 | **3.** Observações, preferências e relatório são texto livre. Humor e refeições de uma pessoa idosa dizem muito sobre a saúde dela. É o uso normal, não um abuso | **3.** Dado de saúde de pessoa vulnerável (art. 11, §1º): discriminação, constrangimento e exposição a quem não precisa saber |
| R07 | **2.** Até 10 cuidadores veem a oferta antes de aceitar e as observações são livres. Depende do que a família escreve | **3.** Rotina e local de uma pessoa vulnerável nas mãos de estranhos: furto, golpe, assédio |
| R08 | **3.** Cada check-in com localização grava coordenadas com precisão de cerca de 10 cm e as guarda sem prazo | **2.** São dois pontos por plantão, não rastreio contínuo. Mesmo assim mostram onde a pessoa estava e, em geral, a casa da pessoa assistida |
| R09 | **3.** Babá e cuidadora de recém-nascido são usos centrais. O formulário não pergunta a idade | **3.** Criança é grupo vulnerável (art. 14). O melhor interesse precisa ser avaliado |
| R10 | **3.** Acontece em todo cadastro que preenche o campo | **1.** Nome e telefone de um parente, lidos só pela família e pelo administrador |

**T3. Assistente de pedidos**

| ID | Probabilidade, e por quê | Impacto, e por quê |
|---|---|---|
| R11 | **3.** Ao ligar a tela, todo uso envia texto livre. A instrução do modelo até prevê relato de emergência de saúde. Não há aviso, consentimento nem mecanismo do art. 33 demonstrado | **3.** Dado pessoal, possivelmente sensível, fora do Brasil, sem controle do titular e difícil de reverter |
| R12 | **3.** Os termos do fornecedor dizem 30 dias de retenção automática e que não há exclusão pontual para clientes pagos de API | **2.** O titular pede exclusão (art. 18) e o controlador não consegue antecipar o prazo. O apagamento automático é curto, o que limita o dano |
| R13 | **2.** Só se o cliente escrever isso. O modelo costuma seguir a instrução de omitir nome e telefone, mas isso não é garantia | **2.** Todos os prestadores aprovados da ocupação e do bairro leem o pedido |
| R14 | **2.** Modelos erram e podem ser induzidos por texto malicioso | **2.** Sem validação, a saída poderia carregar conteúdo arbitrário. Com o esquema fixo, o pior caso é uma categoria errada ou um resumo estranho |

**T4. Pagamentos**

| ID | Probabilidade, e por quê | Impacto, e por quê |
|---|---|---|
| R15 | **2.** Dado de cadastro de pagamento é alvo de fraude. Fica em terceiro e talvez em coluna do banco | **2.** O CPF permite fraude financeira, mas não é dado sensível |
| R16 | **2.** Os dados atravessam a função e ficam no Asaas | **3.** Reúne CPF, nascimento, endereço, telefone e faixa de renda: perfil para fraude e roubo de identidade |
| R17 | **3.** Todo uso do recurso Pro envia CPF/CNPJ e contato de um terceiro | **2.** O terceiro não tem relação com o WorkEasy e o WorkEasy não o informa |
| R18 | **3.** Pelo desenho, os pagamentos ficam. O payload de eventos e o cadastro no Asaas não são tratados na exclusão | **2.** Dados financeiros que o titular espera ver apagados continuam, sem prazo definido |

**Transversais**

| ID | Probabilidade, e por quê | Impacto, e por quê |
|---|---|---|
| R19 | **3.** Sem registro de leitura e sem MFA, um abuso ou uma conta invadida passam sem rastro | **3.** O administrador lê documentos, casas, relatórios e perfis de todos |
| R20 | **3.** Revogar a autorização não apaga nem bloqueia nada: toda revogação cai nisso. Quem usa a API sem a tela também passa pelo banco sem consentimento | **2.** Perda de controle sobre o dado e tratamento sem base válida (art. 8º, §5º) |
| R21 | **3.** A empresa ainda não existe e nada foi assinado. Os DPAs padrão que li citam cláusulas da UE, do Reino Unido e da Suíça, não o Brasil | **2.** O dado vai a fornecedores sem cláusulas aplicáveis, e reparar o dano é difícil |
| R22 | **2.** Incidente com dados pessoais é possível. Sem alertas, ninguém percebe cedo | **3.** A Res. CD/ANPD 15/2024 manda comunicar a ANPD e os titulares em três dias úteis. Sem plano o prazo estoura e os titulares ficam sem saber que precisam se proteger |
| R23 | **3.** Os textos legais não estão publicados e o aceite grava versões "rascunho". A exportação é incompleta (família e arquivos enviados). A pessoa assistida não tem canal | **2.** Os titulares não sabem o que se faz com seus dados nem conseguem exercer os direitos do art. 18 |

## 8. Medidas, salvaguardas e mecanismos (item k)

### 8.1 Salvaguardas que existem hoje

Cada linha aponta o mecanismo real no código. A coluna "Teste" diz o arquivo que fixa a regra. **Li os arquivos, alguns só em parte, e não os executei.**

| ID | Salvaguarda | Mecanismo no código | Teste | Limite | Riscos |
|---|---|---|---|---|---|
| S01 | Segurança por linha (RLS) em todas as tabelas; nenhuma política de escrita aberta; o papel anônimo não escreve | `enable row level security` nas migrations; políticas explícitas | `12_rls_matrix.test.sql`: "every table in public has RLS enabled" (exceção declarada: `assist_usage`); "anon has no write privilege" | Protege de outros usuários. Não limita o administrador (R19) nem o fornecedor | R01, R07, R19 |
| S02 | Bucket privado de documentos: 10 MiB; só JPG, PNG, WebP, HEIC e PDF; leitura só do dono e de administrador; envio só na pasta própria e só por prestador; sem UPDATE; o dono só apaga o que não foi revisado | `storage.buckets`; políticas `provider_documents_objects_select`, `_insert` e `_delete` (migration 03); `document_object_locked` | `03_providers.test.sql`: bucket privado; só prestador envia; outros não leem; administrador lê; objeto revisado não é trocado | Não limita o tempo de guarda nem registra leitura | R01, R05 |
| S03 | Caminho do arquivo preso à pasta do dono | Check `provider_documents_path_in_own_folder` | `03_providers.test.sql` (insert com pasta alheia falha) | — | R01 |
| S04 | Conferência por administrador, com motivo e trilha. A aprovação cai se o documento deixa de valer. Aceitar exige o arquivo no bucket | `admin_review_document` (exige `is_admin()`, motivo para rejeitar, arquivo existente); trigger `provider_documents_revoke_approvals`; eventos `document.accepted` e `document.rejected` | `11_admin.test.sql` | Registra a decisão, não a leitura. Não há critério escrito (G17, G23) | R03, R04, R05 |
| S05 | Link assinado de 5 minutos para o administrador abrir o arquivo | `SIGNED_URL_SECONDS = 300` e `createDocumentUrl` em `services/admin.ts` | `test/admin/providers.test.tsx` (o pedido do link usa 300 segundos) | Gerado no navegador do administrador, sem registro (G02) | R01 |
| S06 | Só se pede o item que a política da ocupação exige | `occupation_policies.verification`; `submit_provider_for_review`; `occupation_missing_steps` | `03_providers.test.sql`; `11_admin.test.sql` | Selfie, documento e CPF/CNPJ valem para as 1.710 ocupações; 373 das 631 que pedem certidão estão `a_confirmar` | R02, R03 |
| S07 | Histórico de consentimentos que não se altera. Caixa de autorização na tela antes de enviar a certidão e antes de enviar a localização | `consents`: insert só em `purpose`, `version` e `granted`; hora do servidor; UPDATE e DELETE revogados; `Cadastro.tsx`; `CheckinPanel.tsx` | `10_privacy_audit.test.sql` (não se edita, não se forja, não se data para trás) | **Só a tela confere.** O banco não consulta o consentimento (G04) | R03, R08, R20 |
| S08 | Registro de auditoria só de inserção; usuário só grava eventos `client.*`; só administrador lê | Trigger `audit_log_immutable`; `log_event`; revokes | `10_privacy_audit.test.sql` | Guarda texto livre para sempre (G20) | R19, R22 |
| S09 | Exclusão de conta em ordem: Storage, `anonymize_user`, Auth. Recusa se há atendimento em andamento. Cancela cobranças e assinatura no Asaas | `account-delete`; `anonymize_user` (apaga linhas de documentos, zera coordenadas, limpa casas e pessoas assistidas, reduz `payments.raw`, zera contato das notificações) | `10_privacy_audit.test.sql`; `test/functions/account-assist.test.ts` | Não trata `payment_events.payload`, `audit_log` nem o cadastro no Asaas (G16, G20) | R02, R18 |
| S10 | Exportação dos dados do titular em JSON (art. 18, II), sem `payments.raw` e sem o ponteiro do Vault | `account-export`; `lgpd-export.ts` (`EXPORT_PLAN`) | `test/functions/assist-export.test.ts`; `account-assist.test.ts` | A família não recebe check-ins nem relatórios. Os documentos enviados saem só como caminho (G14) | R15, R23 |
| S11 | Visão restrita do cuidador | `caregiver_shifts()`; RLS de `shifts`, `households` e `care_recipients` | `09_care.test.sql` (colunas da função; contagem zero nas tabelas) | As observações do plantão são texto livre (G07) | R06, R07, R09, R10 |
| S12 | A pessoa assistida não tem coluna de saúde. Aviso e bloqueio de palavras de saúde na tela | Colunas de `care_recipients`; `HealthDataNotice.tsx`; `findHealthTerm` | `09_care.test.sql` (`columns_are`); `test/cuidado/rules.test.ts` | Bloqueio só no navegador, lista curta, campos livres (G05) | R06 |
| S13 | Ofertas só a cuidadores aprovados, nunca ao dono da casa; até 10 por plantão e 30 novas por dia por família; contato só depois da designação | `offer_shift`; `is_care_provider`; `shares_contact` | `09_care.test.sql` | "Cuidador" é qualquer ocupação com unidade `plantao`: 67 (G21) | R07 |
| S14 | Check-in: só o cuidador designado; janela de 2 horas; uma entrada e uma saída por plantão; coordenadas opcionais e dentro da faixa válida; pedido de permissão do sistema com o motivo escrito | `check_in`; `unique (shift_id, kind)`; `NSLocationWhenInUseUsageDescription` (iOS); permissões no `AndroidManifest.xml`; `locate()` | `09_care.test.sql`; `test/cuidado/geolocation.test.ts` | O banco não confere o consentimento; 6 casas decimais (G04, G11) | R08 |
| S15 | Aviso no pedido ("Não coloque telefone, endereço completo nem dados de saúde") e pedido sem telefone nem e-mail do cliente para os prestadores | `pages/cliente/Pedido.tsx`; `open_requests_for_me()` | Não conferi | O aviso não impede o texto | R13 |
| S16 | Assistente: chave só no servidor; cota por usuário e hora; carga mínima (texto e candidatos, sem identificadores); saída restrita e validada; nenhum corpo em log; pode ser desligado | `request-assist/*`; `_shared/assist.ts`; `take_assist_quota`; `ASSIST_HOURLY_LIMIT`; `logError` | `test/functions/account-assist.test.ts` e `assist-export.test.ts`; `12_rls_matrix.test.sql` (`assist_usage` sem grant) | Sem aviso, sem consentimento, sem tela (G08, G09) | R11 a R14 |
| S17 | Pagamento: nada de cartão no WorkEasy; `raw` fora do alcance da API, com leitura de administrador registrada; chaves das subcontas no Vault; webhook confere o token e relê a cobrança no Asaas; CPF/CNPJ não vai para coluna própria | `redactAsaasPayload`; grants de `payments`; `admin_get_payment_raw` (grava `payment.raw_viewed`); `store_provider_payment_secret`; `asaas-webhook` | `06_payments.test.sql` (pagador e prestador não leem `raw`; `select *` negado; leitura do administrador registrada); `10_privacy_audit.test.sql` | `raw` e `payment_events.payload` guardam o que o gateway devolver, exceto chaves `creditCard*` (G16) | R15 a R18 |
| S18 | Nenhum segredo no aplicativo. O texto do aplicativo não pode prometer segurança que não existe | `test/claims-guard.test.ts` (bloqueia `service_role`, chaves do Asaas, WhatsApp, Resend e Anthropic no código do cliente e uma lista de promessas sem lastro) | O próprio teste | Cobre o código do cliente. Não pega a frase "O WorkEasy não guarda dados de saúde" (G05) | R01, R11 |
| S19 | Mensagens só para contato confirmado no Auth. O modelo "plantão oferecido" leva só horário e bairro | `08_notifications.sql`; `TEMPLATES.plantao_oferecido` | `08_notifications.test.sql` (só contato confirmado no Auth recebe) | Meta e Resend são operadores `[incerto]` | R07 |
| S20 | As telas de demonstração não capturam nem enviam nada | Comentários e código de `Verification.tsx` e `ProviderRegistration.tsx` | — | — | R04 |

### 8.2 Lacunas encontradas e medidas propostas

Todas as medidas abaixo são `[PLANEJADO]`. **Quando:** A = antes de qualquer usuário real. B = antes de abrir o Cuidado além do piloto. C = até a primeira revisão semestral.

| ID | Lacuna e evidência | Medida proposta | Reduz | Quando |
|---|---|---|---|---|
| G01 | **Guarda sem prazo de documentos, selfie e certidão.** Arquivos aceitos e rejeitados ficam até a exclusão da conta (`document_object_locked`, políticas de delete). O único expurgo agendado do banco é o de `assist_usage` (`private.expire_stale`) | Política de retenção por tipo de arquivo, com prazo definido pelo advogado. Depois da conferência, guardar só decisão, data, validade e revisor, e apagar a imagem. Para a certidão, guardar só o resultado. Job de expurgo. Dizer o prazo na política de privacidade | R01, R02, R03 | A |
| G02 | **Leitura de documento não deixa rastro.** `createDocumentUrl` roda no navegador do administrador; o `audit_log` só tem `document.accepted` e `document.rejected`. A leitura de `payments.raw` já é registrada (`payment.raw_viewed`); a de documento não | Emitir o link por uma função do servidor que grava `document.viewed` (quem, qual documento, quando) antes de devolver a URL | R01, R19 | A |
| G03 | **Administrador sem MFA, sem papéis separados e com leitura ampla.** `admins` é uma lista só. `is_admin()` libera leitura de documentos, perfis, casas, pessoas assistidas, plantões, check-ins e relatórios. O `supabase/config.toml` local mantém o MFA desligado e o código não usa MFA. A configuração de produção não existe | MFA obrigatório para administrador; papéis (revisor de documentos, financeiro, suporte) com visão mínima; revisão periódica da lista de `admins`; termo de confidencialidade | R01, R19 | A |
| G04 | **Consentimento só na tela.** `check_in` aceita coordenadas sem consultar `consents`; o envio de `antecedentes` não consulta `background_check`; revogar não apaga nem bloqueia | O banco confere o último consentimento: descarta coordenadas sem `location` e recusa `antecedentes` sem `background_check`. Fluxo de revogação: parar de usar, apagar ou bloquear o arquivo e dizer à pessoa o efeito na aprovação. Decidir junto com a base legal (F1, F3, F6) | R03, R08, R20 | A |
| G05 | **Texto livre do Cuidado sem controle no servidor.** Colunas livres só com limite de tamanho (`households.notes`, `care_recipients.preferences`, `shifts.notes`, `daily_reports.*`). `findHealthTerm` roda só no navegador. `HealthDataNotice` afirma "O WorkEasy não guarda dados de saúde" | Mesma validação no servidor (gatilho ou RPC). Trocar relato livre por opções fechadas onde der e reduzir tamanhos. Reescrever o aviso para "O WorkEasy não pede dados de saúde", que o produto sustenta. Parecer sobre o art. 11 e sobre quem consente | R06 | B |
| G06 | **Criança como pessoa assistida, sem consentimento do responsável.** `RecipientForm.tsx` aceita qualquer nome e ano; `consent_purpose` não tem propósito para o responsável; 9 ocupações de plantão são marcadas para menores | Perguntar se a pessoa assistida é menor de 18 anos. Para menor: registrar a declaração do responsável (novo propósito em `consents`), coletar o mínimo (sem preferências livres) e avaliar o melhor interesse (art. 14) com o advogado | R09 | B |
| G07 | **Observações do plantão chegam aos cuidadores oferecidos antes do aceite.** `caregiver_shifts()` devolve `s.notes` a quem tem oferta; a dica do campo cita portaria e almoço e não proíbe endereço nem senha | Limitar o tamanho (valor a decidir), avisar para não colocar endereço, telefone nem senha de portaria, e deixar detalhes para depois da designação | R07 | B |
| G08 | **Assistente sem tela, aviso, consentimento nem opt-in; o prompt manda escrever "situação de saúde urgente" no resumo.** Nenhum serviço chama `request-assist`. Ver `ASSIST_SYSTEM_PROMPT` | Ligar só com: (i) aviso e consentimento específico antes do primeiro envio; (ii) texto "não escreva CPF, endereço, telefone nem informações de saúde"; (iii) rascunho mostrado ao cliente antes de virar pedido; (iv) instrução de saúde retirada do prompt; (v) filtro de telefone, CPF e e-mail no texto e no resumo. Modelo de aviso no Anexo A | R11, R13, R14 | A, para ligar |
| G09 | **Transferência internacional sem mecanismo demonstrado.** O DPA lido cita cláusulas da UE e adendos do Reino Unido e da Suíça; não vi Brasil nem LGPD. A Res. CD/ANPD 19/2024 exige as cláusulas-padrão do Anexo II sem alteração, ou outra hipótese do art. 33. Os dados ficam nos EUA | O advogado escolhe: cláusulas da ANPD firmadas com o fornecedor; ou consentimento específico para a transferência (art. 33, VIII); ou não usar o modelo. Perguntar ao fornecedor sobre acordo de retenção zero `[incerto]`. Registrar a decisão | R11, R12, R21 | A, para ligar |
| G10 | **Contato de emergência de terceiro sem ciência dele** | Campo com declaração da família ("tenho autorização para informar este contato"), remoção a pedido e explicação na política. Avaliar se o campo é necessário: o cuidador não o vê | R10 | B |
| G11 | **Localização com precisão excessiva e sem prazo.** `locate()` arredonda a 6 casas decimais (cerca de 10 cm, diz o comentário do código); `checkins.lat` e `.lng` ficam até a exclusão; `ShiftRecords.tsx` abre o OpenStreetMap com as coordenadas na URL | Arredondar para menos casas (valor a decidir) ou guardar só "dentro ou fora do raio"; prazo curto; avisar que o link abre site de terceiro | R08 | B |
| G12 | **Operadores sem contrato, sem região e sem mecanismo de transferência.** Não há produção. `invokeFunction` não fixa a região das Edge Functions. O DPA da Supabase (Versão 1, 01/08/2026) cita cláusulas da UE, do Reino Unido e da Suíça, não o Brasil. Asaas, Meta e Resend não foram abertos | Contratar pela empresa já constituída; projeto Supabase em São Paulo; fixar a região das Edge Functions (a documentação do fornecedor lista `sa-east-1`); listar suboperadores; registrar no ROPA; saber onde ficam backups e arquivos `[incerto]` | R01, R16, R21 | A |
| G13 | **Textos legais não publicados.** `/legal` diz "Documentos em elaboração". `CONSENT_VERSIONS.terms` e `.privacy` valem `2026-10-rascunho`, com um TODO em `config/legal.ts`. `TermsGate` grava o aceite dessas versões | Publicar termos, política e textos de consentimento (`01`, `03`, `11`) antes de qualquer usuário real e só então fixar a versão | R23 | A |
| G14 | **Exportação incompleta.** `EXPORT_PLAN` lê `checkins` e `daily_reports` só por `provider_id`; `HOUSEHOLD_CHILDREN` cobre `care_recipients` e `shifts`. Os arquivos de documentos saem no JSON só como caminho. O texto do próprio export diz que "o conteúdo pode ser baixado pelo app", mas só o administrador gera link de arquivo (`services/admin.ts`); o prestador não tem essa função no aplicativo | Incluir check-ins e relatórios dos plantões da família. Dar ao prestador um modo de baixar os próprios arquivos, ou corrigir o texto do export. Cobrir com teste | R23 | A |
| G15 | **Sem encarregado e sem canal para a pessoa assistida e o contato de emergência** | Indicar encarregado `[CONDICIONAL: depende de parecer]`; publicar [E-MAIL DO ENCARREGADO]; aceitar pedido por representante; fixar prazo de resposta | R23 | A |
| G16 | **Pagamentos: papéis e retenção indefinidos.** `redactAsaasPayload` só remove chaves `creditCard*`; `raw` e `payment_events.payload` guardam o resto. `anonymize_user` limpa `raw` e não toca `payment_events`. `account-delete` não remove o cliente nem a subconta no Asaas. O prazo fiscal está "a confirmar com o contador" (`docs/DECISOES.md`, D7) | Confirmar com o Asaas o papel de cada parte e o contrato; guardar de `raw` só o necessário; tratar `payment_events.payload`; pedir a remoção do cliente no Asaas onde a regra permitir; fixar o prazo com o contador | R15 a R18 | A |
| G17 | **Certidão sem critério escrito.** 631 ocupações exigem; 414 não são regulamentadas; 373 estão `a_confirmar`; as 165 voltadas a menores exigem. O administrador decide caso a caso, com motivo livre | Matriz "ocupação, exige a certidão?, por quê", aprovada pelo advogado e ligada à revisão do catálogo; critérios objetivos do que impede e do que não impede; segunda revisão humana e canal de contestação antes de recusar; guardar só o resultado (G01) | R03 | A |
| G18 | **Regra única para todas as ocupações.** As 1.710 pedem documento com selfie e CPF/CNPJ | Avaliar graduar por risco (entra na casa, público vulnerável, ocupação regulamentada). Decisão do dono com o advogado | R02, R04 | B |
| G19 | **Sem plano de incidente nem monitoramento** | Plano (`08-plano-de-resposta-a-incidentes.md`, em elaboração) com contatos e modelos. Comunicar a ANPD e os titulares em três dias úteis quando houver risco ou dano relevante (Res. CD/ANPD 15/2024, arts. 5º, 6º e 9º) e registrar o incidente por cinco anos (art. 10). Alertas mínimos: picos de download no bucket e acesso de administrador fora do padrão | R22 | A |
| G20 | **Registro imutável com texto livre.** `cancel_shift` grava o motivo no `audit_log`; os motivos de administrador também; nada se apaga (`docs/ARQUITETURA.md`) | Limitar o tamanho do motivo, usar lista de motivos e proibir dado pessoal no campo. Definir com o advogado a retenção do log | R06, R19 | C |
| G21 | **"Prestador de cuidado" é qualquer ocupação com unidade `plantao`.** `private.is_care_occupation` alcança 67 ocupações, entre elas médicos, porteiro, vigia, segurança e salva-vidas. Só 27 exigem certidão | Lista fechada das ocupações que podem receber plantão em domicílio (cuidador, babá, técnico de enfermagem etc.), definida com o advogado e com a revisão do catálogo | R07 | B |
| G22 | **Backup, restauração, varredura de arquivos e revisão de segurança.** O código não faz varredura dos arquivos enviados antes de o administrador abri-los. Não há teste de restauração de backup `[incerto]` | Teste de restauração; varredura dos arquivos; revisão de segurança antes do lançamento | R01, R05 | C |
| G23 | **Conferência sem roteiro.** A tela manda "abrir o arquivo e conferir" e não diz o que comparar | Roteiro escrito (Anexo A); segunda pessoa para ocupações de risco alto; orientar o prestador a enviar só o necessário; avaliar fornecedor de verificação só com RIPD próprio | R04 | B |

## 9. Risco residual (item j)

### 9.1 Residual por risco

| ID | Hoje (P×I) e por quê | Alvo (P×I) e por quê | Decisão proposta |
|---|---|---|---|
| R01 | **2×3=6.** Bucket privado, RLS por pasta e link de 5 minutos fecham o acesso público (S02, S03, S05). Sobram a conta de administrador sem MFA, os arquivos que se acumulam e o fornecedor sem contrato | **1×3=3.** Retenção curta (G01), leitura registrada (G02), MFA (G03) e contrato (G12) tornam o acesso indevido remoto. O impacto continua alto porque o conteúdo é documento de identidade | Reduzir |
| R02 | **3×2=6.** Nada limita a guarda. S06 só limita quais itens se pedem | **1×2=2** com G01, G17 e G18 | Reduzir |
| R03 | **2×3=6.** Rejeitar exige motivo, que o prestador lê (S04), mas não há critério escrito nem segunda revisão, e a certidão fica guardada | **2×2=4.** Critérios, lista de ocupações, segunda revisão, contestação e guarda só do resultado reduzem o impacto. A decisão continua discricionária, por isso a probabilidade não cai a 1 | Reduzir. O advogado valida a lista de ocupações |
| R04 | **2×3=6.** Sem roteiro nem segunda revisão. S04 só exige motivo e arquivo | **1×3=3** com G23 e G18 | Reduzir |
| R05 | **1×2=2.** O banco recusa aceitar sem arquivo, o dono não troca arquivo revisado e não há UPDATE no Storage (S02, S04) | **1×2=2.** G22 cobre a restauração | Aceitar |
| R06 | **3×3=9.** S11 limita quem lê e S12 bloqueia palavras óbvias no navegador, mas o conteúdo continua livre e o filtro não existe no servidor | **2×3=6.** Campos fechados, filtro no servidor, texto honesto e prazos reduzem a chance. O relato do dia de uma pessoa idosa continua revelando saúde. **Fica alto** | Reduzir e decidir se aceita o que sobra. Sem essa decisão, não abrir o Cuidado |
| R07 | **2×2=4.** S11 mostra só bairro e primeiro nome. As observações do plantão são livres | **1×2=2** com G07 e G21 | Reduzir |
| R08 | **2×2=4.** A localização é opcional na tela e o sistema pede permissão (S14), mas o banco não confere o consentimento e guarda 6 casas sem prazo | **1×2=2** com G04 e G11 | Reduzir |
| R09 | **3×2=6.** S11 mostra só o primeiro nome ao cuidador. Nada pergunta a idade nem registra o responsável | **2×2=4** com G06. O melhor interesse exige análise do advogado | Reduzir |
| R10 | **3×1=3.** S11 esconde o contato do cuidador | **2×1=2** com G10 | Aceitar, com G10 |
| R11 | **3×2=6.** Carga mínima, sem identificadores, sem treino e com apagamento automático em 30 dias (S16 e termos do fornecedor) reduzem o dano. Faltam aviso, consentimento e mecanismo (G08, G09) | **2×2=4.** Com consentimento e cláusulas, a transferência fica regular. O usuário ainda pode digitar dado sensível | Evitar até G08 e G09 |
| R12 | **3×2=6.** Nada no WorkEasy muda a retenção do fornecedor | **2×2=4.** Um acordo de retenção zero, se o fornecedor oferecer `[incerto]`, levaria a 1×2=2. Sem ele, a mitigação é aviso e consentimento | Reduzir, ou aceitar com consentimento |
| R13 | **2×2=4.** As regras do prompt e o esquema ajudam, mas não garantem. Ainda não há tela de revisão | **1×2=2** com G08 | Reduzir |
| R14 | **2×1=2.** Saída restrita e validada, recusa tratada e corpo fora do log (S16) | **1×1=1** | Aceitar |
| R15 | **1×2=2.** CPF não vai para coluna própria; `raw` fora da API; leitura de administrador registrada (S17); exportação sem `raw` (S10); anonimização reduz `raw` (S09) | **1×2=2.** G16 define papéis e reduz o que `raw` guarda | Aceitar |
| R16 | **1×3=3.** O WorkEasy não guarda esses dados e a chave da subconta fica no Vault (S17) | **1×3=3.** Depende do Asaas e do contrato (G12, G16). O impacto alto não muda | Aceitar, com contrato |
| R17 | **2×2=4.** O prestador digita e o WorkEasy repassa ao Asaas sem gravar o CPF (S17), mas o terceiro não é informado | **2×1=2.** Os Termos do Prestador dizem quem é o controlador (G16) | Reduzir |
| R18 | **3×1=3.** A anonimização reduz `raw` e apaga links (S09). `payment_events` e o cadastro no Asaas continuam | **2×1=2** com G16 | Reduzir |
| R19 | **2×3=6.** Só quem está em `admins` (escrita só pela service role) lê, e as decisões ficam no `audit_log` (S01, S04, S08). Leituras e abertura de documentos, não | **1×3=3** com G02, G03 e G20 | Reduzir |
| R20 | **3×2=6.** A tela confere; o banco não (S07) | **1×2=2** com G04 | Reduzir |
| R21 | **3×2=6.** Nada foi contratado | **1×2=2** com G12 e G09 | Reduzir |
| R22 | **2×3=6.** O `audit_log` ajuda a reconstruir ações, mas não há plano, contatos nem alertas | **2×2=4.** O plano reduz o impacto, não a chance | Reduzir |
| R23 | **3×2=6.** Textos não publicados, exportação incompleta, sem canal. S10 cobre só parte | **1×2=2** com G13, G14 e G15 | Reduzir |

### 9.2 Leitura por tratamento

1. **T1** fica em risco médio no alvo. O que decide é a retenção (G01), o registro de leitura (G02), o MFA (G03) e os critérios da certidão (G17).
2. **T2** é a única com risco que continua alto (R06) mesmo com todas as medidas. A escolha é do dono, com parecer: cortar o texto livre, trocá-lo por campos fechados ou aceitar o risco com consentimento e prazos.
3. **T3** é a que mais depende de decisão jurídica (G09) e a mais fácil de evitar: está desligada.
4. **T4** fica em risco baixo a médio e depende do contrato com o Asaas.

## 10. Conclusão e recomendação

1. **Conclusão deste rascunho**, a validar pelo advogado, pelo encarregado e pelo dono: os quatro tratamentos justificam relatório. T1 e T2 são, com boa probabilidade, de alto risco no sentido da Res. CD/ANPD 2/2022. T3 será, se for ligada. T4 provavelmente não é, e entra por prudência.
2. **Por tratamento.**
   - **T1.** Seguir só em teste fechado, depois dos itens A. As decisões jurídicas que mais pesam são a classificação do documento com selfie (F1) e a certidão de antecedentes (F3, G17).
   - **T2.** Não abrir ao público. Piloto com famílias conhecidas, em modo concierge (`docs/DECISOES.md`, D12), só depois dos itens A e B e com decisão escrita do dono sobre o risco que sobra em R06.
   - **T3.** Manter desligado. Antes de ligar: G08 e G09, e decidir se o ganho justifica enviar texto ao exterior, já que a etapa local de candidatos funciona sem modelo.
   - **T4.** Pode seguir com G16 e o contrato com o Asaas. Se comissão ou pagamento retido forem ligados `[CONDICIONAL: depende de parecer]`, rever antes.
3. **Sinais para parar e rever.** Vazamento ou suspeita de vazamento de documento ou de texto de saúde. Pedido da ANPD. Reclamação de titular sobre a certidão. Qualquer ligação do assistente. Troca de fornecedor.
4. **O que este relatório não diz.** Não diz que o produto cumpre a LGPD, nem que é seguro. Diz o que o código faz, o que falta e o que decidir. Os testes não foram executados por mim. A empresa não existe e nada foi contratado.

## 11. Revisão, responsáveis e aprovações (item l)

### 11.1 Quando rever

A ANPD recomenda "a revisão contínua do RIPD, em especial, quando houver fatos novos". Rever sempre que ocorrer:

1. Antes do primeiro usuário real.
2. Troca de fornecedor ou de região (Supabase, Asaas, Anthropic, Meta, Resend).
3. Ligação do assistente de pedidos.
4. Ligação de comissão ou pagamento retido `[CONDICIONAL: depende de parecer]`.
5. Abertura do Cuidado além do piloto.
6. Entrada de fornecedor de verificação de identidade ou qualquer reconhecimento facial.
7. Incidente de segurança com dados pessoais.
8. Pedido da ANPD ou norma nova sobre o RIPD. O art. 38 remete a "regulamento" e não procurei se já existe um específico `[incerto]`.
9. Mudança no catálogo que altere a lista de ocupações que exigem certidão.

### 11.2 Calendário

| Marco | Data |
|---|---|
| Elaboração do rascunho | 23/10/2026 |
| Revisão obrigatória | No dia em que o último item A for fechado e antes do primeiro usuário real |
| Revisão periódica | No máximo até 23/04/2027 (seis meses). É sugestão do autor, não exigência da ANPD. O encarregado confirma o prazo |

### 11.3 Responsáveis

| Papel | Quem | Situação |
|---|---|---|
| Elaboração do rascunho | Ferramenta de IA, a pedido do dono | Feito em 23/10/2026 |
| Responsável pelo conteúdo e pelas decisões | Dono, como administrador da [RAZÃO SOCIAL] | Pendente |
| Encarregado | [E-MAIL DO ENCARREGADO] | Não indicado |
| Revisão jurídica | Advogado | Pendente |
| Revisão contábil (prazos fiscais) | Contador | Pendente |

### 11.4 Comentários e aprovações

A ANPD diz que registrar opiniões divergentes e o motivo da escolha é boa prática.

| Nome | Papel | Parecer (aprovo / aprovo com condições / não aprovo) | Comentários e condições | Data | Assinatura |
|---|---|---|---|---|---|
| | Dono, administrador da [RAZÃO SOCIAL] | | | | |
| | Encarregado | | | | |
| | Advogado | | | | |

## Anexo A. Textos e roteiros sugeridos

São propostas `[PLANEJADO]`. Os textos finais ao titular ficam em `11-textos-de-consentimento-e-avisos.md` (em elaboração).

### A.1 Aviso do assistente de pedidos (G08)

Só vale depois de G09 resolvido.

> **Assistente de pedidos (opcional)**
> Se você usar o assistente, o texto que escrever será enviado a um serviço de inteligência artificial de um fornecedor no exterior, só para sugerir a categoria e um resumo do seu pedido.
> Não escreva CPF, endereço completo, telefone nem informações de saúde.
> Segundo os termos do fornecedor, o texto é apagado automaticamente em 30 dias, com exceções, e não é usado para treinar modelos. O fornecedor não apaga um texto antes desse prazo, a pedido.
> Você pode preencher o pedido sem o assistente.
> [ ] Li e concordo em enviar o texto ao assistente. Você pode retirar a concordância em Minha conta.

### A.2 Roteiro de conferência de documentos (G23)

Depende de G01, G02 e G17.

1. Abrir o arquivo pelo link de 5 minutos. Não baixar nem encaminhar.
2. Ver se está legível, inteiro e dentro da validade.
3. Comparar: o nome do documento é o do cadastro e o rosto do documento é o da selfie.
4. Certidão de antecedentes: olhar só nome, data e resultado ("nada consta" ou "consta"). Se "consta", não decidir sozinho: levar à segunda revisão, com os critérios de G17.
5. Registrar a decisão com motivo objetivo, sem copiar dado do documento.
6. Depois da decisão, o arquivo segue a regra de retenção (G01).

## Anexo B. Termos técnicos em uma linha

| Termo | O que quer dizer aqui |
|---|---|
| RLS (segurança por linha) | Regra do banco de dados que decide, linha por linha, quem pode ler ou escrever. |
| Edge Function | Programa que roda no servidor do Supabase e guarda as chaves secretas. O aplicativo só o chama. |
| Service role | Chave de serviço, usada só no servidor. Passa por cima das regras de linha. |
| Storage e bucket | Armazenamento de arquivos. O bucket `provider-documents` é privado. |
| Link assinado | Endereço temporário que dá acesso a um arquivo privado por poucos minutos. |
| Vault | Cofre do Supabase para segredos, como a chave da subconta do Asaas. |
| Trigger (gatilho) | Regra do banco que roda sozinha quando uma linha muda. |
| pgTAP | Testes automáticos do banco de dados. |
| MFA | Segunda etapa de login, por exemplo um código gerado no celular. |
| OTP | Login por código de uso único, enviado por e-mail ou mensagem. |
| Webhook | Aviso que o Asaas envia ao WorkEasy quando um pagamento muda de situação. |
| Split | Divisão do valor pago entre o prestador e a plataforma, feita pelo Asaas. |
| Subconta | Conta de recebimento do prestador dentro do Asaas. |
| DPA | Contrato de tratamento de dados entre quem decide (controlador) e quem trata por conta dele (operador). |
| ROPA | Registro das operações de tratamento (`07-registro-das-operacoes-de-tratamento.md`). |

## Pontos para o advogado

### Perguntas abertas (copie e envie)

Papéis, transferência internacional e retenção também aparecem nas perguntas do ROPA (`07-registro-das-operacoes-de-tratamento.md`, seção 14.1). Vale levar as duas listas juntas.

1. **Documento com foto e selfie.** O WorkEasy recebe a imagem e uma pessoa a confere, sem extrair modelo facial. Isso é dado biométrico (art. 5º, II) ou só um dado que "revela" dado sensível (art. 11, §1º)? A hipótese do art. 11, II, "g" (prevenção à fraude e à segurança do titular no cadastro) cobre essa conferência, sabendo que ela também protege o cliente, e não só o titular? Se não cobrir, qual a alternativa que não dependa de um consentimento que é condição para se cadastrar?
2. **Certidão de antecedentes.** Classificar como dado comum de risco elevado está correto? Qual hipótese usar (art. 7º, I, V, IX ou II)? O consentimento é "livre" quando é condição para 631 ocupações? O que fazer com o arquivo e com a aprovação se a pessoa revogar (art. 8º, §5º)? A tese do TST (Tema 1) serve de apoio para um marketplace de autônomos? Em quais ocupações a exigência se justifica? 414 das 631 não são regulamentadas e 373 estão com política `a_confirmar`.
3. **Cuidado e saúde.** "Humor" e "refeições" de uma pessoa idosa revelam saúde (art. 11, §1º). Qual hipótese do art. 11 sustenta o relatório diário e as observações do plantão? Quem consente pela pessoa assistida idosa ou incapaz e como provar a representação? A frase "O WorkEasy não guarda dados de saúde" pode continuar nas telas?
4. **Crianças.** Em ocupações como babá e cuidadora de recém-nascido, a pessoa assistida é criança. Como cumprir o art. 14, §1º (consentimento específico e em destaque de ao menos um dos pais ou do responsável)? O Enunciado CD/ANPD 1/2023 basta para usar outra hipótese dos arts. 7º ou 11? Há norma recente sobre serviços digitais acessíveis a crianças e adolescentes que alcance o WorkEasy? `[incerto]`: tentei abrir uma no Planalto e o site respondeu HTTP 503.
5. **Contato de emergência.** Qual a base (art. 7º, VII ou IX)? É preciso avisar o terceiro? Vale a declaração da família?
6. **Localização.** Consentimento (como está hoje) ou execução do contrato? A família pode ver as coordenadas do cuidador? Há risco trabalhista de monitoramento? `[incerto]`: não pesquisei. Qual o prazo de guarda?
7. **Assistente com modelo de linguagem.** O fornecedor guarda os dados nos EUA e o DPA dele que li cita cláusulas da UE, do Reino Unido e da Suíça, não o Brasil. Qual mecanismo do art. 33 e da Res. CD/ANPD 19/2024 usar: cláusulas-padrão da ANPD (Anexo II, sem alteração), consentimento específico para a transferência (art. 33, VIII) ou não usar o modelo? Vale tratar texto livre que pode conter dado sensível?
8. **Pagamentos.** O Asaas é operador, controlador independente ou ambos? O contrato padrão dele atende? Qual o prazo de guarda fiscal dos dados de pagamento (perguntar ao contador)? O cadastro do cliente no Asaas deve ser apagado quando a conta é excluída?
9. **Papéis.** O WorkEasy é operador dos dados que o prestador Pro guarda no CRM, nos orçamentos e nas cobranças próprias? Há controle conjunto nas cobranças da plataforma?
10. **Encarregado.** É obrigatório aqui? A Res. CD/ANPD 2/2022 dispensa o pequeno porte (art. 11), mas exclui quem faz tratamento de alto risco (art. 3º, I). Quem será e qual o canal?
11. **Retenção.** Definir prazos por categoria: documentos, selfie, certidão, check-ins, relatórios, `audit_log`, notificações, `payments`, `payment_events` e backups.
12. **Titulares sem conta.** Pessoa assistida, contato de emergência e cliente do prestador: como exercem os direitos do art. 18 e em que prazo?
13. **Incidentes.** Aplicar ao produto os critérios de "risco ou dano relevante" da Res. CD/ANPD 15/2024, art. 5º (dado sensível; criança, adolescente ou idoso; financeiro; autenticação). Quem comunica e como?
14. **Este RIPD.** Precisa ser publicado, enviado ou apenas guardado? Convém ter versão pública?
15. **Risco residual do Cuidado.** Com R06 ainda alto no alvo, o dono pode aceitar o risco que sobra? Com que condições (consentimento, prazos, campos fechados)?

### Itens marcados `[incerto]`

| # | Item | Por que é incerto | Como fechar |
|---|---|---|---|
| I1 | Papel e local de tratamento do Asaas | Não abri a política de privacidade do Asaas: de quatro tentativas, três foram redirecionadas para a página de login e uma deu HTTP 404. O ROPA (`07`, item S2) registra uma leitura do Acordo de Processamento feita por outro agente, que não conferi | Ler a política e o Acordo de Processamento no original e fechar o papel com o advogado |
| I2 | Meta (WhatsApp) e Resend: papéis, locais e contratos | Não abri | Ler termos e DPAs e registrar no ROPA |
| I3 | Região e backups do Supabase para banco e arquivos | A página de segurança diz que bancos pagos têm backup diário; nada diz sobre arquivos. Região ainda não escolhida | Escolher São Paulo e confirmar o backup do Storage |
| I4 | Criptografia em repouso | O fornecedor declara "AES-256" em repouso e TLS em trânsito. É declaração dele, que não verifiquei | Ler o relatório SOC 2 (clientes Team e Enterprise) ou pedir confirmação por escrito |
| I5 | `payments.raw` e `payment_events.payload` trazem CPF/CNPJ? | O teste do repositório usa um objeto de exemplo que traz; o payload real do Asaas não foi visto | Testar contra o sandbox do Asaas |
| I6 | Anotações em documentos (CNH etc.) que revelem saúde | Depende do modelo do documento | Conferir os modelos e orientar o envio |
| I7 | Menção ao Brasil no DPA da Anthropic | Li a página por ferramenta de leitura automática. "Não vi menção" não prova ausência | Ler o texto integral e perguntar ao fornecedor |
| I8 | Acordo de retenção zero | A página só cita que existe a possibilidade | Perguntar ao fornecedor |
| I9 | Prazo fiscal de guarda dos pagamentos | Depende do contador | `docs/DECISOES.md` (D7) já pede |
| I10 | Data da Res. CD/ANPD 15/2024 | A página da Res. 2/2022 cita 24 e 25 de abril de 2024. Usei 24/04/2024, data que consta no texto da própria resolução | Conferir no DOU |
| I11 | Norma recente sobre serviços digitais para crianças e adolescentes | Não consegui abrir o texto (Planalto, HTTP 503). Existência e alcance ficam incertos | Advogado |
| I12 | Aspectos trabalhistas do monitoramento do cuidador; Estatuto da Pessoa Idosa | Não pesquisei | Advogado |
| I13 | Volume de titulares | Não há projeção | Dono |
| I14 | Texto oficial da LGPD no Planalto | O Planalto respondeu HTTP 503 nas quatro tentativas de abrir a LGPD (três endereços). Usei o texto atualizado da Câmara dos Deputados | Conferir no Planalto |
| I15 | Publicação oficial (DOU) das resoluções e do enunciado | Abri cópias (páginas da ANPD e Biblioteca Digital do Ministério da Justiça) que dizem não substituir o DOU | Conferir no DOU |
| I16 | Base legal do Asaas para os dados de subconta (art. 7º, II) | Depende das regras do instituto de pagamento, que não li | Advogado e contrato com o Asaas |

## Fontes consultadas

Todas foram abertas em **23/10/2026**, como diz a coluna "Aberta em". Cada citação entre aspas é um trecho curto lido na página.

### Normas, orientações e decisões

| # | Fonte | Norma e artigos ou trechos usados | URL | Aberta em | Trecho lido |
|---|---|---|---|---|---|
| 1 | ANPD, página "Relatório de Impacto à Proteção de Dados Pessoais (RIPD)" (publicada em 06/04/2023 e modificada em 23/09/2026, segundo a página) | Itens a a l do conteúdo recomendado; método de risco; revisão; consulta ao encarregado; publicação | https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd | 23/10/2026 | "recomenda-se ao controlador a revisão contínua do RIPD, em especial, quando houver fatos novos" |
| 2 | Lei nº 13.709/2018 (LGPD), texto atualizado, Câmara dos Deputados. Última alteração indicada na página: Lei nº 15.352, de 25/02/2026 | Arts. 5º (II, XII, XV, XVII), 6º, 7º, 8º, 10, 11, 14, 16, 18, 33, 38 e 55-A | https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html | 23/10/2026 | Art. 5º, II: "dado genético ou biométrico, quando vinculado a uma pessoa natural". Art. 11, §1º: "qualquer tratamento de dados pessoais que revele dados pessoais sensíveis e que possa causar dano ao titular". Art. 38, p. único: "o relatório deverá conter, no mínimo, a descrição dos tipos de dados coletados". Art. 55-A: "Fica criada a Agência Nacional de Proteção de Dados (ANPD), autarquia de natureza especial" |
| 3 | Resolução CD/ANPD nº 2, de 27/01/2022 (a página informa alteração pela Res. CD/ANPD nº 15/2024) | Art. 3º, I; art. 4º (caput, I, II, §§1º e 2º); art. 11 | https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022 | 23/10/2026 | Art. 4º, II, d: "utilização de dados pessoais sensíveis ou de dados pessoais de crianças, de adolescentes e de idosos". §2º: "puder impedir o exercício de direitos ou a utilização de um serviço" |
| 4 | Resolução CD/ANPD nº 15, de 24/04/2024, cópia na Biblioteca Digital do Ministério da Justiça | Arts. 5º, 6º, 9º e 10 | https://bibliotecadigital.mj.gov.br/bitstream/1/12879/2/RES_ANPD_2024_15.html | 23/10/2026 | Art. 6º: "no prazo de três dias úteis". Art. 10: "pelo prazo mínimo de cinco anos" |
| 5 | ANPD, página "Comunicação de Incidente de Segurança" (modificada em 26/08/2026, segundo a página) | Prazo e quem comunica | https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis | 23/10/2026 | "no prazo de três (3) dias úteis" |
| 6 | Resolução CD/ANPD nº 19, de 23/08/2024 (Regulamento de Transferência Internacional de Dados) | Art. 2º, parágrafo único; Anexo I, arts. 9º, II, e 16 | https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024 | 23/10/2026 | Art. 16: "pressupõe a adoção integral e sem alteração do texto disponibilizado no Anexo II" |
| 7 | Enunciado CD/ANPD nº 1, de 22/05/2023, cópia na Biblioteca Digital do Ministério da Justiça | Texto integral | https://bibliotecadigital.mj.gov.br/bitstream/1/10215/2/Enunciado_ANPD_2023_1.html | 23/10/2026 | "desde que observado e prevalecente o seu melhor interesse" |
| 8 | ANPD, Radar Tecnológico nº 2, "Biometria e reconhecimento facial: estudos preliminares" (jun/2024) | pp. 6, 13, 21, 22 | https://www.gov.br/anpd/pt-br/centrais-de-conteudo/documentos-tecnicos-orientativos/radar-tecnologico-biometria-anpd-1.pdf/@@display-file/file | 23/10/2026 | p. 21: "uma imagem bruta de uma biometria facial pode revelar informações de saúde". p. 22: "o controlador poderá utilizar uma das hipóteses legais do inciso II, do art. 11 da Lei" |
| 9 | TST, IRR Tema 1 (TST-IRR-243000-58.2013.5.13.0023), tese firmada, cópia no portal do TRT-3 | Itens 1 a 3 da tese | https://portal.trt3.jus.br/internet/jurisprudencia/incidentes-suscitados-irr-iac-arginc-tst/downloads/TST_IRR_Tese_firmada___TEMA_1.pdf | 23/10/2026 | "a exemplo de empregados domésticos, cuidadores de menores, idosos ou deficientes" |
| 10 | TST, acórdão TST-E-RR-141200-84.2013.5.13.0023 (segunda fonte do trecho acima) | Cita o "Tema Repetitivo nº 0001, item II" | https://jurisprudencia-backend2.tst.jus.br/rest/documentos/4faf07588e255c33372de4a434d9616c | 23/10/2026 | "a exemplo de empregados domésticos, cuidadores de menores, idosos ou deficientes" |

### Fornecedores

| # | Fonte | Uso | URL | Aberta em | Trecho lido |
|---|---|---|---|---|---|
| 11 | Anthropic, Commercial Terms of Service (vigência 17/06/2025) | Sem treino com conteúdo do cliente; DPA incorporado | https://www.anthropic.com/legal/commercial-terms | 23/10/2026 | "Anthropic may not train models on Customer Content from Services." |
| 12 | Anthropic, Data Processing Addendum (vigência 24/02/2025) | Papéis, cláusulas de transferência, suboperadores, devolução e exclusão, aviso de incidente em 48 horas | https://www.anthropic.com/legal/data-processing-addendum | 23/10/2026 | "Customer is the controller and Anthropic is Customer's processor." |
| 13 | Anthropic Privacy Center, "How long do you store my organization's data?" (atualizado em 01/07/2026) | Retenção de 30 dias; exceções | https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data | 23/10/2026 | "we automatically delete inputs and outputs on our backend within 30 days of receipt or generation" |
| 14 | Anthropic Privacy Center, "Where are your servers located…" (atualizado em 15/06/2026) | Local dos dados | https://privacy.claude.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers | 23/10/2026 | "Note that data is stored in the US." |
| 15 | Anthropic Privacy Center, "Can you delete data that I sent via API?" (16/03/2026) | Sem exclusão pontual | https://privacy.claude.com/en/articles/7996875-can-you-delete-data-that-i-sent-via-api | 23/10/2026 | "For paid API customers, we do not support ad hoc deletion." |
| 16 | Anthropic Privacy Center, "How do I view and sign your DPA?" (16/03/2026) | DPA incorporado aos termos | https://privacy.claude.com/en/articles/7996862-how-do-i-view-and-sign-your-data-processing-addendum-dpa | 23/10/2026 | "is automatically incorporated into our Commercial Terms of Service" |
| 17 | Supabase, "Security at Supabase" (sem data na página) | Declarações de criptografia e backup | https://supabase.com/security | 23/10/2026 | "All customer data is encrypted at rest with AES-256 and in transit via TLS." |
| 18 | Supabase, Data Processing Addendum (Versão 1, 01/08/2026) | Papéis, cláusulas de transferência, aviso de incidente | https://supabase.com/legal/dpa | 23/10/2026 | "where feasible, within forty-eight (48) hours, after becoming aware of any Security Incident" |
| 19 | Supabase, documentação "Regional Invocations" | Região padrão das Edge Functions e opção `sa-east-1` | https://supabase.com/docs/guides/functions/regional-invocation | 23/10/2026 | "Edge Functions automatically execute in the region closest to the user making the request." |
| 20 | Asaas, documentação "Criar novo cliente" | `cpfCnpj` obrigatório | https://docs.asaas.com/reference/criar-novo-cliente | 23/10/2026 | Campos obrigatórios: `name` e `cpfCnpj` |
| 21 | Asaas, documentação "Criar subconta" | Campos obrigatórios da subconta | https://docs.asaas.com/reference/criar-subconta | 23/10/2026 | Obrigatórios: `name`, `email`, `cpfCnpj`, `mobilePhone`, `incomeValue`, `address`, `addressNumber`, `province`, `postalCode` |

### Tentativas que falharam

- planalto.gov.br (cinco tentativas em quatro endereços: a LGPD compilada, em duas grafias do endereço, a LGPD no texto original e uma lei sobre serviços digitais para crianças e adolescentes): HTTP 503 em todas.
- Política de privacidade do Asaas (quatro tentativas: três em `www.asaas.com`, que redirecionaram para a página de login, e uma em `docs.asaas.com`, que deu HTTP 404).
- ANPD, página própria da Res. CD/ANPD 15/2024: HTTP 404; usei a cópia do Ministério da Justiça. O link do DOU informado pela página da ANPD (`https://www.in.gov.br/en/web/dou/-/resolucao-cd/anpd-n-15-de-24-de-abril-de-2024-556243024`) não foi aberto.
- Anthropic `/legal/dpa`: HTTP 404; usei `/legal/data-processing-addendum`.
- Página de notícia do TST sobre o Tema 1: veio vazia.

### Repositório lido em 23/10/2026

Li o que importa para este relatório; alguns arquivos só em parte ou por busca. Não executei nada.

`docs/ARQUITETURA.md`; `docs/DECISOES.md`; `config/legal.ts`; `supabase/config.toml`; migrations `…01_identity`, `…03_providers`, `…04_marketplace` (`assist_usage`), `…06_payments`, `…08_notifications` (`expire_stale`), `…09_care`, `…10_privacy_audit`, `…11_admin`; Edge Functions `request-assist`, `payments-create`, `charges-create`, `asaas-onboard`, `account-export`, `account-delete` e `_shared` (`assist`, `lgpd-export`, `asaas-events`, `notifications`, `notification-context`); `services/` (`account`, `admin`, `care`, `client`, `providers`, `payments`); `pages/pro/Cadastro.tsx`, `pages/pro/Plantoes.tsx`, `pages/cliente/Pedido.tsx`, `pages/Verification.tsx`, `pages/ProviderRegistration.tsx`, `pages/LegalDocs.tsx`; `components/cuidado/*`, `components/admin/DocumentCard.tsx`, `components/TermsGate.tsx`; `catalog/policies.json`; `ios/App/App/Info.plist`; `android/app/src/main/AndroidManifest.xml`; testes pgTAP `03`, `06`, `08`, `09`, `10`, `11`, `12` e Vitest `claims-guard`, `account-assist`, `assist-export`, `cuidado/rules`, `cuidado/geolocation`, `admin/providers`.
