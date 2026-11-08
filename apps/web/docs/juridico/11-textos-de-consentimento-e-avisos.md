# Textos de consentimento e avisos na interface

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| Campo | Valor |
|---|---|
| Documento | 11 de `apps/web/docs/juridico/` |
| Versão do documento | `2026-10-rascunho` (mesma etiqueta de `CONSENT_VERSIONS.terms` e `CONSENT_VERSIONS.privacy` em `apps/web/config/legal.ts`) |
| Data de elaboração | 2026-11-08 |
| Vigência | [DATA DE VIGÊNCIA] |
| Controlador | [RAZÃO SOCIAL], CNPJ [CNPJ], [ENDEREÇO]. Empresa ainda não constituída, separada de qualquer clínica do responsável. |
| Canal dos titulares | [E-MAIL DO SAC]. Encarregado: [E-MAIL DO ENCARREGADO]. |
| Estado | Rascunho de trabalho, não publicado. Nenhum texto desta lista foi aplicado ao código. |

## Como ler

1. Esta lista traz o texto de cada consentimento e de cada aviso que o app mostra, ou precisa mostrar. Para cada um: tela, finalidade, base legal, versão e o arquivo que deve lê-lo.
2. "Hoje" quer dizer o código em 2026-11-08. Quando um aviso depende de algo que ainda não existe, está marcado como **[PLANEJADO]**.
3. Etiquetas: **[PLANEJADO]** não existe no código. **[CONDICIONAL: depende de parecer]** depende de decisão jurídica. **[incerto]** não foi verificado em fonte aberta (ver "Pontos para o advogado").
4. Textos entre colchetes em maiúsculas são dados da empresa, que ainda não existe.
5. As seções 3 e 4 trazem texto para a tela. As linhas "Base legal" e as perguntas são para o advogado e não vão para o app.
6. Status: **ativo** (existe e está correto), **ajuste** (existe, trocar o texto), **novo** (não existe), **planejado** (depende de função futura).

## 1. Bloqueios antes de qualquer usuário real

| # | Bloqueio | Por quê | O que fazer |
|---|---|---|---|
| B1 | O aceite de Termos e Privacidade leva a `/legal`, que hoje diz "Documentos em elaboração" (`pages/LegalDocs.tsx`, linhas 38 a 41). | Pede-se aceite de um texto que não foi publicado. O CDC, art. 46, diz que o contrato não obriga o consumidor sem a oportunidade de conhecer o conteúdo antes. A LGPD, art. 9º, caput, exige informação prévia, clara, adequada e ostensiva. | Publicar os documentos 01 e 03 e apontar os links do aceite para eles. |
| B2 | A autorização de antecedentes diz "Posso retirar a autorização". Retirar hoje só grava a decisão em `consents`: a certidão continua no bucket e nenhuma regra muda. | Promessa que o produto não cumpre. | Usar o texto da seção 3 (`consent.background_check`), que diz só o que é verdade. Ou implementar o efeito antes de publicar a promessa. |
| B3 | Retirar a localização não impede o envio. `check_in` (`supabase/migrations/20261019000009_care.sql`, linhas 360 a 380) não consulta `consents`. | Idem B2. | Usar o texto da seção 3 (`consent.location`), que fala só do padrão da caixa. |
| B4 | `config/legal.ts` dá a `marketing`, `background_check` e `location` a versão `2026-10`, sem o sufixo `-rascunho`, embora os textos sejam rascunho. | Quem aceitar vê uma versão que parece publicada. | Usar `2026-11-rascunho` nos três (seção 3) e alinhar o TODO de `legal.ts` com a publicação. |

## 2. Mapa: onde cada aviso aparece hoje

| Tela (rota) | Arquivo e linhas | Aviso hoje | Status | Ação |
|---|---|---|---|---|
| `/entrar` | `pages/conta/Entrar.tsx`, linhas 214 a 226 | Um checkbox: "Li e aceito os Termos de Uso e a Política de Privacidade." Os dois links vão para `/legal`. | ajuste | Dois checkboxes (`consent.terms` e `consent.privacy`) e links para os documentos publicados. Hoje `acceptCurrentTerms` grava os dois de uma vez (`services/account.ts`, linhas 92 a 96). |
| Barreira de aceite em `/conta`, `/pedido`, `/agendar/:slug`, `/cuidado/*`, `/pro/*` | `components/TermsGate.tsx`, linhas 46 a 65 | "Para continuar, aceite a versão atual dos termos" e o mesmo checkbox. | ajuste | Os mesmos dois checkboxes. |
| `/conta`, Consentimentos | `pages/conta/Conta.tsx`, linhas 116 a 147 | Descrições das cinco finalidades. O título de `background_check` é "Consulta de antecedentes" (linha 137). | ajuste | Trocar as descrições da seção 3. O WorkEasy não consulta antecedentes: a pessoa envia a certidão. |
| `/conta`, Consentimentos | `pages/conta/Conta.tsx`, linha 412 | "Cada decisão fica registrada com data e versão do texto. Revogar não apaga o histórico." | ativo | Manter. |
| `/conta`, Excluir minha conta | `pages/conta/Conta.tsx`, linhas 290 a 293 | "Seus dados pessoais são apagados e você sai do app..." | ajuste | Seção 4.5. |
| `/pro/cadastro`, passo 3 | `pages/pro/Cadastro.tsx`, linha 395 | "Envie uma foto ou um PDF de até 10 MB para cada item. Os arquivos ficam em um espaço privado..." | ajuste | Manter e acrescentar o aviso do item de documento com selfie (seção 4.1). |
| `/pro/cadastro`, passo 3, item Certidão de antecedentes | `pages/pro/Cadastro.tsx`, linhas 421 a 423 | Checkbox "Autorizo o WorkEasy a usar a certidão de antecedentes para analisar o meu cadastro. Posso retirar a autorização em Minha conta." | ajuste | Seção 3 (`consent.background_check`) e a explicação da seção 4.2, acima do checkbox. |
| `/cuidado` | `components/cuidado/HealthDataNotice.tsx`, linha 9, e `services/care.ts`, linha 158 | "O WorkEasy não guarda dados de saúde." | ajuste | Seção 4.8. A frase é mais forte do que o código garante. |
| `/cuidado`, cadastro da pessoa cuidada | `components/cuidado/RecipientForm.tsx`, linhas 46 a 88 | Só o aviso de saúde e as dicas de campo. | novo | Seção 4.4 (terceiro cadastrado pela família). |
| `/pro/plantoes`, registro de entrada e saída | `components/cuidado/CheckinPanel.tsx`, linhas 97 a 100 | Checkbox "Enviar minha localização neste registro" e explicação. | ajuste | Seção 3 (`consent.location`). |
| `/cuidado`, relatórios | `components/cuidado/ShiftRecords.tsx`, linha 16 | Link "Ver local do registro" abre o OpenStreetMap com as coordenadas. | sem aviso | Citar o terceiro na Política (documento 03). Ver G10. |
| `/pedido`, passo 2 | `pages/cliente/Pedido.tsx` | "Não coloque telefone, endereço completo nem dados de saúde." | ativo | Manter. |
| `/pedido`, login | `pages/cliente/Pedido.tsx`, linha 444 | "O que você preencheu fica guardado neste navegador." | ajuste | Seção 4.7. O rascunho fica na aba (`sessionStorage`), não no navegador. |
| `/pedido`, texto livre com assistente | sem tela | Nenhum | planejado | Seção 4.3. `request-assist` existe no servidor, mas nenhuma tela o chama (busca em `services/` e `pages/`). |
| `/verification` | `pages/Verification.tsx`, linhas 82 a 84 e 108 | "Esta tela é uma simulação do fluxo. Nenhuma imagem é capturada, enviada ou armazenada..." | ativo (demo) | Manter. Ver G12 sobre a permissão de câmera. |
| `/legal` | `pages/LegalDocs.tsx`, linhas 38 a 41 | "Documentos em elaboração." | bloqueio | B1. |
| `/health`, `/dashboard` (aba Telemedicina), `/doctor/:id`, `/teleconsultation/:sessionId` | `pages/HealthSearch.tsx` linha 164, `pages/Dashboard.tsx` linha 223, `pages/DoctorProfile.tsx` linha 238, `pages/TeleconsultationRoom.tsx` linha 179 | Avisos de funcionalidade futura que citam exigências de conselho. | planejado | Seção 4.9. |
| `/medical-records` | `pages/MedicalRecords.tsx`, linha 51 | "Funcionalidade futura. Prontuário eletrônico exige sistema certificado..." | planejado | Seção 4.10. |
| Todo o app (armazenamento no aparelho) | `lib/supabase.ts` (`persistSession`, linhas 34 a 36), `lib/requestDraft.ts`, `vite.config.ts` (linha 44) | Nenhum aviso. | novo | Seção 4.6. |
| Permissões do sistema | `ios/App/App/Info.plist`, `android/app/src/main/AndroidManifest.xml` | Textos do sistema operacional. | ativo | Seção 5. |

## 3. Consentimentos (`consent_purpose`)

Resumo:

| ID | Tela | Finalidade | Base legal (para o advogado) | Versão hoje → proposta | Lido em |
|---|---|---|---|---|---|
| `consent.terms` | `/entrar` e barreira de aceite | Aceite dos Termos de Uso | Aceite de contrato. Dados para executar o contrato: art. 7º, V. [CONDICIONAL: depende de parecer] | `2026-10-rascunho` → `2026-10-rascunho` | `Entrar.tsx`, `TermsGate.tsx` |
| `consent.privacy` | idem | Ciência da Política de Privacidade | Informação prévia: art. 9º. [CONDICIONAL: depende de parecer] | `2026-10-rascunho` → `2026-10-rascunho` | idem |
| `consent.marketing` | `/conta` | Novidades e ofertas [PLANEJADO] | Consentimento: art. 7º, I | `2026-10` → `2026-11-rascunho` | `Conta.tsx` (CONSENTS) |
| `consent.background_check` | `/pro/cadastro`, passo 3; `/conta` | Uso da certidão de antecedentes para analisar o cadastro | Consentimento: art. 7º, I. [CONDICIONAL: depende de parecer] | `2026-10` → `2026-11-rascunho` | `Cadastro.tsx`, `Conta.tsx` |
| `consent.location` | `/pro/plantoes` (registro); `/conta` | Localização no registro de entrada e saída | Consentimento: art. 7º, I. [CONDICIONAL: depende de parecer] | `2026-10` → `2026-11-rascunho` | `CheckinPanel.tsx`, `Conta.tsx` |

### 3.1 `consent.terms`

- **Tela:** `/entrar` (checkbox) e barreira de aceite (`TermsGate`).
- **Finalidade:** `terms`.
- **Base legal:** não é consentimento do art. 7º, I. É aceite de contrato. O tratamento necessário para executar o contrato tem base no art. 7º, V. [CONDICIONAL: depende de parecer]
- **Versão:** `2026-10-rascunho`. **Status:** ajuste. **Lido em:** `pages/conta/Entrar.tsx`, `components/TermsGate.tsx`.
- **Checkbox** (o link "Termos de Uso" aponta para o documento publicado, `[URL DOS TERMOS PUBLICADOS]`):

  > Li e aceito os Termos de Uso.

- **Texto de apoio:**

  > Os Termos dizem o que o WorkEasy faz e o que não faz, as regras para clientes e profissionais, cancelamento e reembolso. Sem este aceite, o código não é enviado.

### 3.2 `consent.privacy`

- **Tela:** `/entrar` (checkbox) e barreira de aceite.
- **Finalidade:** `privacy`. Hoje é gravado como consentimento; o termo mais exato é ciência (ver Q2).
- **Base legal:** informação prévia, clara, adequada e ostensiva (LGPD, art. 9º, caput). [CONDICIONAL: depende de parecer]
- **Versão:** `2026-10-rascunho`. **Status:** ajuste. **Lido em:** `pages/conta/Entrar.tsx`, `components/TermsGate.tsx`.
- **Checkbox** (o link aponta para o documento publicado, `[URL DA POLÍTICA PUBLICADA]`):

  > Li a Política de Privacidade.

- **Texto de apoio:**

  > A Política diz quais dados coletamos, para que usamos, com quem compartilhamos, por quanto tempo guardamos e como você exerce seus direitos. Os usos que dependem da sua autorização têm aviso e escolha próprios, separados desta caixa.

### 3.3 `consent.marketing` [PLANEJADO]

- **Tela:** `/conta`, Consentimentos.
- **Finalidade:** `marketing`. Não há envio de marketing no código hoje (busca em `supabase/functions`, `services` e `pages`). Esta escolha não tem efeito até existir o envio.
- **Base legal:** consentimento (LGPD, art. 7º, I). Deve ser específico (art. 8º, §4º) e pode ser revogado a qualquer momento (art. 8º, §5º). Condições do canal (WhatsApp, e-mail) não verificadas. [incerto]
- **Versão:** `2026-11-rascunho` (hoje `2026-10`). **Status:** planejado. **Lido em:** `pages/conta/Conta.tsx` (CONSENTS, `purpose: 'marketing'`).
- **Checkbox:**

  > Quero receber novidades e ofertas do WorkEasy por WhatsApp ou e-mail.

- **Texto de apoio:**

  > Você pode mudar esta escolha em Minha conta. Mensagens sobre seus pedidos, propostas e atendimentos não dependem desta escolha.

### 3.4 `consent.background_check`

- **Tela:** `/pro/cadastro`, passo 3, junto ao item Certidão de antecedentes. Só aparece quando a política da ocupação exige o item e a autorização ainda não foi dada. O envio do arquivo fica bloqueado até marcar a caixa (`Cadastro.tsx`, linhas 401 e 455). Também em `/conta`.
- **Finalidade:** `background_check`.
- **Base legal:** [CONDICIONAL: depende de parecer.] Consentimento (art. 7º, I), se for a base escolhida. A certidão de antecedentes não está na lista de dado sensível do art. 5º, II. Outra base pode ser mais adequada, por exemplo a obrigação legal da ocupação (art. 7º, II), se houver. Como a autorização é condição para o upload, a informação deve ser destacada (art. 9º, §3º). Revogação: art. 8º, §5º.
- **Versão:** `2026-11-rascunho` (hoje `2026-10`). **Status:** ajuste. **Lido em:** `pages/pro/Cadastro.tsx`, `pages/conta/Conta.tsx`.
- **Checkbox:**

  > Autorizo o WorkEasy a usar a minha certidão de antecedentes criminais para analisar o meu cadastro.

- **Texto de apoio:**

  > Você pode retirar esta autorização em Minha conta. Isso registra a sua decisão, mas não apaga a certidão já enviada. Enquanto o arquivo não foi analisado, você pode removê-lo. Depois disso, ele só sai com a exclusão da sua conta.

- **Nota para a Conta:** trocar o título "Consulta de antecedentes" por "Certidão de antecedentes" e a descrição por "Uso da certidão que você enviou para analisar o seu cadastro, quando a sua ocupação exige."

### 3.5 `consent.location`

- **Tela:** `/pro/plantoes`, registro de entrada e saída (`CheckinPanel.tsx`). Também `/conta`.
- **Finalidade:** `location`, só para o registro de plantão.
- **Base legal:** consentimento (LGPD, art. 7º, I). A localização é opcional, o que torna o consentimento a base natural. Localização não está no art. 5º, II. [CONDICIONAL: depende de parecer] Revogação: art. 8º, §5º.
- **Versão:** `2026-11-rascunho` (hoje `2026-10`). **Status:** ajuste. **Lido em:** `components/cuidado/CheckinPanel.tsx`, `pages/conta/Conta.tsx`.
- **Checkbox:**

  > Enviar minha localização neste registro

- **Texto de apoio:**

  > A localização é lida só neste momento, quando você registra entrada ou saída, e fica gravada no registro. A família vê o local no mapa. Se você não enviar, o registro vale do mesmo jeito. Se o aparelho bloquear a localização, o registro sai sem ela, e a família vê isso. Retirar a autorização em Minha conta desmarca esta opção por padrão e não apaga a localização de registros já feitos.

## 4. Avisos (não são consentimento)

### 4.1 Documento com foto e selfie (cadastro do profissional) · `notice.provider.documents`

- **Tela:** `/pro/cadastro`, passo 3, item "Documento com foto e selfie" (`catalog/labels.ts`).
- **Base legal:** informação prévia (art. 9º, caput). Selfie vinculada a uma pessoa é dado biométrico (art. 5º, II). Hoje o código não faz tratamento biométrico. Se houver conferência automática, será preciso consentimento específico e destacado (art. 11, I). [PLANEJADO]
- **Versão:** `2026-11-rascunho`. **Status:** ajuste. **Lido em:** `pages/pro/Cadastro.tsx`, acima do campo de arquivo.

> Envie uma foto ou um PDF de até 10 MB para cada item. Os arquivos ficam em um espaço privado, visível só para você e para a equipe que analisa o cadastro. Este item pede um documento com foto e uma selfie. Hoje o WorkEasy não faz reconhecimento facial e não compara o seu rosto com nenhuma base: a equipe confere o arquivo à mão.

### 4.2 Certidão de antecedentes: o que é pedido, de quem, por quê e por quanto tempo · `notice.provider.background_detail`

- **Tela:** `/pro/cadastro`, passo 3, acima do checkbox da seção 3.4.
- **Base legal:** informação prévia e destacada (art. 9º, caput e §3º). Prazo de guarda e base: [CONDICIONAL: depende de parecer]. Ver Q3 e Q4.
- **Versão:** `2026-11-rascunho`. **Status:** novo. **Lido em:** `pages/pro/Cadastro.tsx`.

> **Certidão de antecedentes criminais.**
>
> - **O que é pedido:** um arquivo da certidão que você já tem, em foto ou PDF de até 10 MB.
> - **De quem:** você envia. O WorkEasy não consulta órgãos públicos nem bases de antecedentes.
> - **Por quê:** a sua ocupação exige a certidão para o cadastro. A lista de exigências por ocupação virá na Política de Verificação. [PLANEJADO]
> - **Quem vê:** você e a equipe do WorkEasy que analisa o cadastro. Nenhum cliente vê o arquivo.
> - **Guarda:** no espaço privado até você excluir a sua conta. Hoje não há prazo automático para apagar a certidão.
> - **Sem o arquivo:** o cadastro não vai para análise.

### 4.3 Assistente de texto para pedidos [PLANEJADO] · `notice.llm.assistant`

- **Tela:** `/pedido`, passo 2, quando a chamada ao assistente for ligada à interface.
- **Base legal:** execução de contrato a pedido do titular (art. 7º, V). [CONDICIONAL: depende de parecer] O fornecedor de IA é, em regra, operador da plataforma. [CONDICIONAL: depende de parecer] Nome, país, prazo de guarda e uso do texto para treinar modelos precisam estar no contrato. [incerto]
- **Versão:** `2026-11-rascunho`. **Status:** planejado. **Lido em:** `pages/cliente/Pedido.tsx`.
- **Fatos do código:** `supabase/functions/request-assist` aceita de 10 a 2.000 caracteres, devolve ocupação, urgência e resumo de até 500 caracteres, e tem limite de chamadas por hora (`ASSIST_HOURLY_LIMIT`, padrão 10). Sem chave no servidor, responde 503.

> Seu texto será processado por um serviço de IA para sugerir a ocupação e um resumo do pedido. Não escreva telefone, endereço completo nem dados de saúde. Você confere a sugestão antes de enviar o pedido. Se preferir, preencha o pedido à mão. Há um limite de pedidos organizados pelo assistente por hora.

### 4.4 Cadastro de terceiro (pessoa cuidada) · `notice.care.recipient`

- **Tela:** `/cuidado`, formulário de pessoa cuidada (`RecipientForm.tsx`), no topo.
- **Base legal:** a família cadastra dados de uma terceira pessoa. Quem é o controlador desses dados? [CONDICIONAL: depende de parecer]. Se a pessoa for criança, o consentimento precisa ser "específico e em destaque dado por pelo menos um dos pais ou pelo responsável legal" (LGPD, art. 14, §1º). Para adolescentes e idosos, a base depende de parecer (Q6).
- **Versão:** `2026-11-rascunho`. **Status:** novo. **Lido em:** `components/cuidado/RecipientForm.tsx`.
- **Fatos do código:** sobre a pessoa cuidada, `caregiver_shifts()` devolve só `recipient_first_name` ao cuidador, e o bairro vem de `neighborhood_name` (`supabase/migrations/20261019000009_care.sql`, linhas 470 a 480). Preferências e contato de emergência ficam com a família.

> Você está cadastrando alguém que recebe o cuidado. Informe só o necessário para organizar os plantões. Se a pessoa for criança, o cadastro precisa ser feito por pai, mãe ou responsável legal. Ao informar um contato de emergência, você passa dados de outra pessoa: confirme que ela concorda. O cuidador vê só o primeiro nome da pessoa e o bairro da casa. Preferências e contato de emergência ficam só com a família.

### 4.5 Confirmação de exclusão da conta · `notice.account.delete`

- **Tela:** `/conta`, seção Excluir minha conta (`Conta.tsx`, linhas 290 a 293). A confirmação continua sendo digitar `EXCLUIR`.
- **Fatos do código:** `account-delete` apaga a pasta de documentos, cancela a assinatura Pro e as cobranças em aberto, chama `anonymize_user` e apaga o usuário do Auth. Recusa com 409 `active_bookings` se há atendimento `accepted`, `paid`, `in_progress` ou `disputed`. Pelo cascade do banco, também saem consentimentos, casas, pessoas cuidadas e plantões da família. Pagamentos e atendimentos ficam anonimizados.
- **Base legal:** eliminação, art. 18, VI. Conservação permitida, art. 16, I e IV. Guarda fiscal: CTN, art. 195, parágrafo único, sujeita a parecer (Q7 e I3). [CONDICIONAL: depende de parecer]
- **Versão:** `2026-11-rascunho`. **Status:** ajuste. **Lido em:** `pages/conta/Conta.tsx`, e a mensagem de 409 em `supabase/functions/account-delete/handler.ts`.

> Excluir a conta é definitivo e não pode ser desfeito. Ao confirmar, o WorkEasy:
>
> - apaga seus dados pessoais, seu perfil, os documentos que você enviou e o seu histórico de consentimentos;
> - cancela a sua assinatura Pro e as cobranças em aberto;
> - se você é da família, apaga as suas casas, as pessoas cuidadas e os plantões. Um cuidador com plantão confirmado deixa de ver esse plantão. Cancele antes e avise o cuidador por fora;
> - mantém pagamentos e atendimentos já feitos, sem nome nem contatos, para registro fiscal.
>
> Você não consegue excluir a conta enquanto houver atendimento aceito, pago, em andamento ou em disputa. Conclua ou cancele esses atendimentos antes. Antes de excluir, você pode baixar seus dados em Cópia dos seus dados.

### 4.6 Armazenamento no aparelho e cookies · `notice.storage`

- **Tela:** `/conta`, seção Seus dados, e `/legal` (seção de cookies e armazenamento da Política, documento 03, seção 11).
- **Fatos do código:** o Supabase guarda a sessão em `localStorage` (`lib/supabase.ts`, `persistSession: true`). O rascunho do pedido fica em `sessionStorage` e é apagado ao enviar, ao sair da conta e ao excluir a conta (`lib/requestDraft.ts`, `contexts/AuthContext.tsx`). O PWA guarda em cache só arquivos estáticos (`vite.config.ts`, linha 44). Não há script de publicidade nem de medição de terceiros em `index.html` nem nas pastas de código.
- **Base legal:** armazenamento necessário para o serviço pedido pelo titular (art. 7º, V). [CONDICIONAL: depende de parecer] Guia orientativo da ANPD sobre cookies: conteúdo não lido nesta entrega. [incerto]
- **Versão:** `2026-11-rascunho`. **Status:** novo.

> Hoje o app não tem cookies de publicidade nem ferramentas de medição de terceiros. Seu navegador ou aparelho guarda a sua conexão, para você continuar entrado. Na aba aberta, também guarda o rascunho do pedido. O rascunho some quando você envia o pedido, sai da conta, exclui a conta ou fecha a aba. O app guarda arquivos da própria tela para abrir mais rápido.

### 4.7 Rascunho do pedido (texto corrigido) · `notice.pedido.draft`

- **Tela:** `/pedido`, bloco "Entre na sua conta para enviar o pedido" (`Pedido.tsx`, linha 444).
- **Base legal:** transparência (art. 9º, caput). Ver também 4.6.
- **Versão:** `2026-11-rascunho`. **Status:** ajuste.

> Entre na sua conta para enviar o pedido. O que você preencheu fica guardado nesta aba do navegador até você enviar, sair da conta ou fechar a aba.

### 4.8 Dados de saúde (ajuste do aviso atual) · `notice.health.care`

- **Tela:** `/cuidado` (todas as telas com `HealthDataNotice`) e a constante `HEALTH_DATA_NOTICE` em `services/care.ts`, linha 158, usada nas mensagens de erro.
- **Fatos do código:** há um filtro de palavras (`services/care.ts`, `HEALTH_TERMS` e `findHealthTerm`). O próprio comentário diz que é "A heuristic, not a promise to catch everything". A frase atual "não guarda" afirma mais do que o código garante. Os campos de texto livre (preferências, contato de emergência, observações, relatório diário) existem.
- **Base legal:** dado de saúde é dado sensível (art. 5º, II). Tratá-lo exige o art. 11. O produto não deve tratá-lo. [CONDICIONAL: depende de parecer]
- **Versão:** `2026-11-rascunho`. **Status:** ajuste.

> O WorkEasy não pede dados de saúde. Não escreva doenças, diagnósticos, remédios, doses, exames ou sintomas. O app bloqueia algumas dessas palavras, mas não todas. Combine esses cuidados direto com o cuidador, fora do app.

### 4.9 Teleconsulta [PLANEJADO] · `notice.future.telemedicine`

- **Telas:** `/health` (linha 164), aba Telemedicina de `/dashboard` (linha 223), `/doctor/:id` (linha 238), `/teleconsultation/:sessionId` (linha 179).
- **Base legal:** [PLANEJADO]. Exigências profissionais e regulatórias para teleconsulta não foram verificadas nesta entrega. Os textos atuais citam CRM e prontuário certificado; isso não foi conferido em fonte primária. [incerto]
- **Versão:** `2026-11-rascunho`. **Status:** planejado.

> Teleconsulta: funcionalidade futura. Ela não existe nesta versão do WorkEasy. Nenhuma consulta acontece aqui e nada é gravado. Depende de requisitos profissionais e regulatórios que esta versão ainda não tem. Quando existir, as regras e o aviso de privacidade desse serviço aparecem antes do uso.

### 4.10 Prontuário [PLANEJADO] · `notice.future.medical_records`

- **Tela:** `/medical-records` (`pages/MedicalRecords.tsx`, linha 51).
- **Fatos do código:** não há tabela de prontuário nas migrations. Os registros da tela são de demonstração.
- **Base legal:** [PLANEJADO]. Dado de saúde: art. 5º, II e art. 11. Requisitos de sistema e assinatura citados no app (NGS2 e ICP-Brasil) não foram verificados. [incerto]
- **Versão:** `2026-11-rascunho`. **Status:** planejado.

> Prontuário: funcionalidade futura. Nesta versão, o WorkEasy não guarda prontuário nem dados de pacientes. Os registros desta tela são de demonstração.

## 5. Permissões do sistema (iOS e Android)

| Plataforma | Chave ou permissão | Texto hoje (fonte) | Quando o sistema pede | Usado hoje | Avaliação e ação |
|---|---|---|---|---|---|
| iOS | `NSLocationWhenInUseUsageDescription` | "A localização é usada apenas quando você registra a entrada ou a saída de um plantão, para a família saber onde o registro foi feito. Você pode negar e registrar sem localização." (`ios/App/App/Info.plist`) | Na primeira leitura de localização, no registro de plantão | Sim (`CheckinPanel.tsx`, via `platform/geolocation.ts`) | Coerente com o uso. Diretriz 5.1.1 (ii) pede propósito "clearly and completely" descrito, e o texto cumpre. Manter. |
| iOS | `NSCameraUsageDescription` | "A câmera é usada apenas para mostrar a prévia na tela de verificação de identidade. Nenhuma imagem é enviada ou armazenada." (`Info.plist`) | Só ao abrir a simulação em `/verification` | Só na simulação (`pages/Verification.tsx`) | O texto confere com o código da simulação. Se a versão de loja não tiver a simulação, retirar a chave e o uso. Se um dia a câmera capturar selfie real, reescrever o texto. [incerto: efeito na revisão da loja não verificado] |
| iOS | (sem chave de fotos) | Não há `NSPhotoLibraryUsageDescription`. | Upload de arquivo em `/pro/cadastro` | Sim, pelo campo de arquivo | Diretriz 5.1.1 (iii) recomenda o seletor fora do processo quando possível. Como o campo se comporta no WebView do Capacitor, não foi verificado. [incerto: testar no aparelho] |
| Android | `android.permission.ACCESS_FINE_LOCATION` | Sem texto. O sistema mostra o pedido padrão. (`AndroidManifest.xml`) | Na leitura de localização | Sim | Manter. A política da Google Play pede o escopo mínimo (ver Fontes). Sem localização em segundo plano, não há declaração de background location. |
| Android | `android.permission.ACCESS_COARSE_LOCATION` | Sem texto. | Igual à anterior | Redundante: o app pede alta precisão (`enableHighAccuracy: true`, `platform/geolocation.ts`, linha 40) | Avaliar remover. [CONDICIONAL: teste no aparelho] |
| Android | `android.permission.CAMERA` | Sem texto. Comentário do manifesto: "Camera preview on the identity-verification demo screen". | Só na simulação | Só na simulação | Se a simulação não vai à loja, remover. Ver G12. |

## 6. Bloco pronto para colar (TypeScript)

Proposta de forma para um arquivo novo, `apps/web/config/legal-texts.ts`. Nada foi aplicado ao código. As versões de consentimento continuam sendo as de `config/legal.ts`, que precisam ser alinhadas (B4). Os links marcados entre colchetes são dados da publicação.

```ts
// Rascunho para revisão de advogado. Não é parecer jurídico.
// Textos propostos (não aplicados). Local sugerido: apps/web/config/legal-texts.ts (arquivo novo).
// Campos legalBasis e status são para a equipe e o advogado, não para a tela.

export type LegalTextStatus = 'ativo' | 'ajuste' | 'novo' | 'planejado';

export interface LegalText {
  id: string;
  /** Rota ou componente onde o texto aparece. */
  screen: string;
  /** Finalidade de consentimento (consent_purpose), quando for um consentimento. */
  purpose?: 'terms' | 'privacy' | 'marketing' | 'background_check' | 'location';
  /** Rótulo do checkbox, quando houver. */
  label?: string;
  /** Texto de apoio para a tela. */
  body: string;
  /** Base legal, para revisão do advogado. */
  legalBasis: string;
  /** Etiqueta gravada em consents.version, quando for um consentimento. */
  version: string;
  status: LegalTextStatus;
  /** Arquivos que devem ler este texto. */
  readBy: string[];
}

export const LEGAL_TEXTS: Record<string, LegalText> = {
  'consent.terms': {
    id: 'consent.terms',
    screen: '/entrar (checkbox); barreira de aceite (TermsGate)',
    purpose: 'terms',
    label: 'Li e aceito os Termos de Uso.',
    body: 'Os Termos dizem o que o WorkEasy faz e o que não faz, as regras para clientes e profissionais, cancelamento e reembolso. Sem este aceite, o código não é enviado.',
    legalBasis: 'Aceite de contrato; não é consentimento do art. 7º, I. Dados para executar o contrato: art. 7º, V. [CONDICIONAL: depende de parecer]',
    version: '2026-10-rascunho',
    status: 'ajuste',
    readBy: ['pages/conta/Entrar.tsx', 'components/TermsGate.tsx'], // link: [URL DOS TERMOS PUBLICADOS]
  },
  'consent.privacy': {
    id: 'consent.privacy',
    screen: '/entrar (checkbox); barreira de aceite (TermsGate)',
    purpose: 'privacy',
    label: 'Li a Política de Privacidade.',
    body: 'A Política diz quais dados coletamos, para que usamos, com quem compartilhamos, por quanto tempo guardamos e como você exerce seus direitos. Os usos que dependem da sua autorização têm aviso e escolha próprios, separados desta caixa.',
    legalBasis: 'Informação prévia, clara, adequada e ostensiva: art. 9º, caput. [CONDICIONAL: depende de parecer]',
    version: '2026-10-rascunho',
    status: 'ajuste',
    readBy: ['pages/conta/Entrar.tsx', 'components/TermsGate.tsx'], // link: [URL DA POLÍTICA PUBLICADA]
  },
  'consent.marketing': {
    id: 'consent.marketing',
    screen: '/conta (Consentimentos)',
    purpose: 'marketing',
    label: 'Quero receber novidades e ofertas do WorkEasy por WhatsApp ou e-mail.',
    body: 'Você pode mudar esta escolha em Minha conta. Mensagens sobre seus pedidos, propostas e atendimentos não dependem desta escolha.',
    legalBasis: 'Consentimento: art. 7º, I; finalidade específica: art. 8º, §4º; revogação: art. 8º, §5º. [PLANEJADO: sem envio de marketing no código]',
    version: '2026-11-rascunho',
    status: 'planejado',
    readBy: ['pages/conta/Conta.tsx'],
  },
  'consent.background_check': {
    id: 'consent.background_check',
    screen: '/pro/cadastro (passo 3); /conta',
    purpose: 'background_check',
    label: 'Autorizo o WorkEasy a usar a minha certidão de antecedentes criminais para analisar o meu cadastro.',
    body: 'Você pode retirar esta autorização em Minha conta. Isso registra a sua decisão, mas não apaga a certidão já enviada. Enquanto o arquivo não foi analisado, você pode removê-lo. Depois disso, ele só sai com a exclusão da sua conta.',
    legalBasis: 'Consentimento: art. 7º, I, se for a base escolhida; a certidão não está no art. 5º, II; informação destacada: art. 9º, §3º. [CONDICIONAL: depende de parecer]',
    version: '2026-11-rascunho',
    status: 'ajuste',
    readBy: ['pages/pro/Cadastro.tsx', 'pages/conta/Conta.tsx'],
  },
  'consent.location': {
    id: 'consent.location',
    screen: '/pro/plantoes (registro de entrada e saída); /conta',
    purpose: 'location',
    label: 'Enviar minha localização neste registro',
    body: 'A localização é lida só neste momento, quando você registra entrada ou saída, e fica gravada no registro. A família vê o local no mapa. Se você não enviar, o registro vale do mesmo jeito. Se o aparelho bloquear a localização, o registro sai sem ela, e a família vê isso. Retirar a autorização em Minha conta desmarca esta opção por padrão e não apaga a localização de registros já feitos.',
    legalBasis: 'Consentimento: art. 7º, I; revogação: art. 8º, §5º. [CONDICIONAL: depende de parecer]',
    version: '2026-11-rascunho',
    status: 'ajuste',
    readBy: ['components/cuidado/CheckinPanel.tsx', 'pages/conta/Conta.tsx'],
  },
  'notice.provider.documents': {
    id: 'notice.provider.documents',
    screen: '/pro/cadastro (passo 3)',
    body: 'Envie uma foto ou um PDF de até 10 MB para cada item. Os arquivos ficam em um espaço privado, visível só para você e para a equipe que analisa o cadastro. Este item pede um documento com foto e uma selfie. Hoje o WorkEasy não faz reconhecimento facial e não compara o seu rosto com nenhuma base: a equipe confere o arquivo à mão.',
    legalBasis: 'Informação prévia: art. 9º, caput. Dado biométrico: art. 5º, II; conferência automática futura: art. 11, I. [PLANEJADO]',
    version: '2026-11-rascunho',
    status: 'ajuste',
    readBy: ['pages/pro/Cadastro.tsx'],
  },
  'notice.provider.background_detail': {
    id: 'notice.provider.background_detail',
    screen: '/pro/cadastro (passo 3, acima do checkbox de antecedentes)',
    body: 'Certidão de antecedentes criminais. O que é pedido: um arquivo da certidão que você já tem, em foto ou PDF de até 10 MB. De quem: você envia. O WorkEasy não consulta órgãos públicos nem bases de antecedentes. Por quê: a sua ocupação exige a certidão para o cadastro. Quem vê: você e a equipe do WorkEasy que analisa o cadastro. Nenhum cliente vê o arquivo. Guarda: no espaço privado até você excluir a sua conta. Hoje não há prazo automático para apagar a certidão. Sem o arquivo, o cadastro não vai para análise.',
    legalBasis: 'Informação prévia e destacada: art. 9º, caput e §3º. Prazo de guarda e base: [CONDICIONAL: depende de parecer]',
    version: '2026-11-rascunho',
    status: 'novo',
    readBy: ['pages/pro/Cadastro.tsx'],
  },
  'notice.llm.assistant': {
    id: 'notice.llm.assistant',
    screen: '/pedido (passo 2), quando o assistente for ligado à tela',
    body: 'Seu texto será processado por um serviço de IA para sugerir a ocupação e um resumo do pedido. Não escreva telefone, endereço completo nem dados de saúde. Você confere a sugestão antes de enviar o pedido. Se preferir, preencha o pedido à mão. Há um limite de pedidos organizados pelo assistente por hora.',
    legalBasis: 'Execução de contrato a pedido do titular: art. 7º, V. [CONDICIONAL: depende de parecer]. Fornecedor de IA: [incerto]. [PLANEJADO]',
    version: '2026-11-rascunho',
    status: 'planejado',
    readBy: ['pages/cliente/Pedido.tsx'],
  },
  'notice.care.recipient': {
    id: 'notice.care.recipient',
    screen: '/cuidado (formulário de pessoa cuidada), no topo',
    body: 'Você está cadastrando alguém que recebe o cuidado. Informe só o necessário para organizar os plantões. Se a pessoa for criança, o cadastro precisa ser feito por pai, mãe ou responsável legal. Ao informar um contato de emergência, você passa dados de outra pessoa: confirme que ela concorda. O cuidador vê só o primeiro nome da pessoa e o bairro da casa. Preferências e contato de emergência ficam só com a família.',
    legalBasis: 'Terceiro cadastrado pela família: [CONDICIONAL: depende de parecer]. Criança: art. 14, §1º.',
    version: '2026-11-rascunho',
    status: 'novo',
    readBy: ['components/cuidado/RecipientForm.tsx'],
  },
  'notice.account.delete': {
    id: 'notice.account.delete',
    screen: '/conta (Excluir minha conta)',
    body: 'Excluir a conta é definitivo e não pode ser desfeito. Ao confirmar, o WorkEasy: apaga seus dados pessoais, seu perfil, os documentos que você enviou e o seu histórico de consentimentos; cancela a sua assinatura Pro e as cobranças em aberto; se você é da família, apaga as suas casas, as pessoas cuidadas e os plantões, e um cuidador com plantão confirmado deixa de ver esse plantão (cancele antes e avise o cuidador por fora); mantém pagamentos e atendimentos já feitos, sem nome nem contatos, para registro fiscal. Você não consegue excluir a conta enquanto houver atendimento aceito, pago, em andamento ou em disputa. Antes, você pode baixar seus dados em Cópia dos seus dados.',
    legalBasis: 'Eliminação: art. 18, VI; conservação: art. 16, I e IV; guarda fiscal: CTN, art. 195, parágrafo único. [CONDICIONAL: depende de parecer]',
    version: '2026-11-rascunho',
    status: 'ajuste',
    readBy: ['pages/conta/Conta.tsx', 'supabase/functions/account-delete/handler.ts'],
  },
  'notice.storage': {
    id: 'notice.storage',
    screen: '/conta (Seus dados); /legal (Política, seção de cookies)',
    body: 'Hoje o app não tem cookies de publicidade nem ferramentas de medição de terceiros. Seu navegador ou aparelho guarda a sua conexão, para você continuar entrado. Na aba aberta, também guarda o rascunho do pedido. O rascunho some quando você envia o pedido, sai da conta, exclui a conta ou fecha a aba. O app guarda arquivos da própria tela para abrir mais rápido.',
    legalBasis: 'Armazenamento necessário para o serviço: art. 7º, V. [CONDICIONAL: depende de parecer]. Guia da ANPD sobre cookies: [incerto]',
    version: '2026-11-rascunho',
    status: 'novo',
    readBy: ['pages/conta/Conta.tsx', 'lib/requestDraft.ts'],
  },
  'notice.pedido.draft': {
    id: 'notice.pedido.draft',
    screen: '/pedido (login para enviar)',
    body: 'Entre na sua conta para enviar o pedido. O que você preencheu fica guardado nesta aba do navegador até você enviar, sair da conta ou fechar a aba.',
    legalBasis: 'Transparência: art. 9º, caput.',
    version: '2026-11-rascunho',
    status: 'ajuste',
    readBy: ['pages/cliente/Pedido.tsx'],
  },
  'notice.health.care': {
    id: 'notice.health.care',
    screen: '/cuidado (HealthDataNotice); services/care.ts (HEALTH_DATA_NOTICE)',
    body: 'O WorkEasy não pede dados de saúde. Não escreva doenças, diagnósticos, remédios, doses, exames ou sintomas. O app bloqueia algumas dessas palavras, mas não todas. Combine esses cuidados direto com o cuidador, fora do app.',
    legalBasis: 'Dado de saúde: art. 5º, II; tratamento exige art. 11. [CONDICIONAL: depende de parecer]',
    version: '2026-11-rascunho',
    status: 'ajuste',
    readBy: ['components/cuidado/HealthDataNotice.tsx', 'services/care.ts'],
  },
  'notice.future.telemedicine': {
    id: 'notice.future.telemedicine',
    screen: '/health; /dashboard (Telemedicina); /doctor/:id; /teleconsultation/:sessionId',
    body: 'Teleconsulta: funcionalidade futura. Ela não existe nesta versão do WorkEasy. Nenhuma consulta acontece aqui e nada é gravado. Depende de requisitos profissionais e regulatórios que esta versão ainda não tem. Quando existir, as regras e o aviso de privacidade desse serviço aparecem antes do uso.',
    legalBasis: '[PLANEJADO]. Requisitos profissionais e regulatórios: [incerto]',
    version: '2026-11-rascunho',
    status: 'planejado',
    readBy: ['pages/HealthSearch.tsx', 'pages/Dashboard.tsx', 'pages/DoctorProfile.tsx', 'pages/TeleconsultationRoom.tsx'],
  },
  'notice.future.medical_records': {
    id: 'notice.future.medical_records',
    screen: '/medical-records',
    body: 'Prontuário: funcionalidade futura. Nesta versão, o WorkEasy não guarda prontuário nem dados de pacientes. Os registros desta tela são de demonstração.',
    legalBasis: '[PLANEJADO]. Dado de saúde: art. 5º, II e art. 11. Requisitos de sistema: [incerto]',
    version: '2026-11-rascunho',
    status: 'planejado',
    readBy: ['pages/MedicalRecords.tsx'],
  },
};
```

## 7. Lacunas do produto encontradas na leitura (não corrigidas)

Esta tarefa é de texto. As lacunas abaixo estão listadas e não foram corrigidas.

| # | Onde | Lacuna | Efeito | Sugestão |
|---|---|---|---|---|
| G1 | `pages/LegalDocs.tsx`, linhas 38 a 41; `AppShell.tsx`, linha 55 | `/legal` diz "Documentos em elaboração". Todos os aceites apontam para ele. | Aceite sem texto publicado (B1). | Publicar 01 e 03 antes de ligar os aceites. |
| G2 | `pages/conta/Entrar.tsx`, linhas 214 a 226; `components/TermsGate.tsx`; `services/account.ts`, linhas 92 a 96 | Um checkbox grava `terms` e `privacy` juntos. | Não há ciência separada da Política. | Dois checkboxes, dois registros. |
| G3 | `pages/pro/Cadastro.tsx`, linhas 364 a 365 e 421 a 423; `pages/conta/Conta.tsx` | Revogar a autorização de antecedentes não muda o arquivo nem a análise. O arquivo já analisado só sai com a exclusão da conta (`ARQUITETURA.md`, seção de documentos). | Promessa do texto antigo não se cumpre (B2). | Texto da seção 3.4 ou regra de efeito no servidor. |
| G4 | `components/cuidado/CheckinPanel.tsx`, linha 44 e linhas 74 e 81; migration `20261019000009_care.sql` | A caixa vem marcada depois de um consentimento anterior (`useLocation = locationGranted`). `check_in` não consulta `consents`. | Caixa pré-marcada por consentimento antigo; revogação não bloqueia o envio (B3). | Caixa começar desmarcada a cada registro; checagem no servidor se a revogação deve valer. |
| G5 | `pages/conta/Conta.tsx`, linha 132 | Marketing grava consentimento sem envio. | Consentimento sem uso. | Esconder até haver envio ou marcar [PLANEJADO]. |
| G6 | `config/legal.ts` | `marketing`, `background_check` e `location` com versão `2026-10`, sem `-rascunho`. TODO de alinhamento com `/legal`. | Versão parece publicada (B4). | Versão `2026-11-rascunho` até o parecer. |
| G7 | `components/cuidado/HealthDataNotice.tsx`, linha 9; `services/care.ts`, linha 158 | "O WorkEasy não guarda dados de saúde." | Afirmação mais forte do que o filtro heurístico garante (seção 4.8). | Trocar pelo texto da seção 4.8. |
| G8 | `pages/cliente/Pedido.tsx`, linha 444 | "fica guardado neste navegador" | O rascunho fica na aba (`sessionStorage`). | Texto da seção 4.7. |
| G9 | `pages/conta/Conta.tsx`, linhas 290 a 293 | A exclusão de conta da família apaga plantões com cuidador confirmado, sem aviso. O aviso só existe na exclusão de casa (`Casas.tsx`, `caregiverWarning`). | O cuidador perde o plantão sem aviso. | Aviso da seção 4.5 e, se possível, bloqueio com plantão confirmado. |
| G10 | `components/cuidado/ShiftRecords.tsx`, linha 16 | O link "Ver local do registro" envia as coordenadas ao OpenStreetMap. | Terceiro recebe a localização ao clicar; sem aviso. | Citar na Política; aviso curto no link. [incerto: se é transferência] |
| G11 | Retenção, geral | Não há regra de prazo para coordenadas, documentos ou consentimentos. Os únicos `cron.schedule` são de envio de notificações e de limpeza de `assist_usage` (migrations `…000008_notifications.sql`, linhas 276 a 277). | A Política não pode prometer prazo que o código não cumpre. | Definir prazos com o advogado (Q4) e implementar. |
| G12 | `android/app/src/main/AndroidManifest.xml`, linha 36; `ios/App/App/Info.plist`, linhas 11 e 12 | Câmera declarada para uma simulação. | Permissão sem uso real na versão de loja. | Retirar se a simulação não vai à loja. |
| G13 | `ACCESS_COARSE_LOCATION` no manifesto | O app pede alta precisão. | Permissão redundante. | Avaliar remover. |
| G14 | `AppShell.tsx`, linhas 57 a 58 | Rotas de prontuário e teleconsulta ficam acessíveis na demo, com dados de demonstração. | Pode parecer funcionalidade de saúde. | Mostrar o aviso da seção 4.9 e 4.10 ou esconder na build de loja. |
| G15 | `pages/conta/Conta.tsx`, linhas 137 e 138 | "Consulta de antecedentes" sugere consulta a órgãos. | Engano sobre o que o WorkEasy faz. | Título da seção 3.4. |
| G16 | Assistente (`supabase/functions/request-assist`) | Função existe, sem tela. Não há aviso de IA na interface. | Nada a expor hoje; quando a tela existir, o aviso da seção 4.3 é obrigatório. | Ligar o aviso junto com a tela. |

## Pontos para o advogado

### Perguntas abertas

- **Q1. Papel da empresa.** O WorkEasy é controlador, operador ou os dois, em cada tratamento? O texto usa "controlador" para a empresa. Isto muda a Política (documento 03, seção 1) e este documento.
- **Q2. Aceite e consentimento.** Aceitar os Termos é aceite de contrato, não consentimento do art. 7º, I. A Política é ciência, não consentimento. O código grava os dois na tabela `consents`, que é de consentimento. Vale manter o nome `privacy` no enum? Como fica a prova (art. 8º, §2º, que põe o ônus no controlador)?
- **Q3. Base da certidão de antecedentes.** Consentimento (art. 7º, I), obrigação legal da ocupação (art. 7º, II), ou outra? A certidão não está no art. 5º, II. O consentimento é condição para o upload (`Cadastro.tsx`, linhas 455 e 419 a 421). Isso afeta a liberdade da escolha e a validade: ver art. 9º, §3º (condição para o serviço), art. 8º, §3º (vício de consentimento) e art. 9º, §1º (consentimento nulo sem informação clara). Os trechos foram lidos no texto compilado (ver Fontes).
- **Q4. Prazos de guarda.** Qual prazo para a certidão após reprovação, após aprovação e após retirada da autorização? Hoje não há prazo no código (G11). A eliminação por revogação (art. 18, VI) vale para esse dado?
- **Q5. Revogação sem efeito técnico.** Pode o texto dizer que a retirada "registra a decisão" (seção 3.4), ou é preciso que o código faça a retirada valer (B2 e B3)? O art. 8º, §5º diz que os tratamentos anteriores ficam ratificados até o pedido de eliminação. Como isso se aplica a localização e certidão?
- **Q6. Terceiros cadastrados pela família.** Quem responde pelos dados da pessoa cuidada e do contato de emergência? Para adolescentes e pessoas idosas, qual base vale? O art. 14, §1º exige consentimento de pai, mãe ou responsável para criança. O Enunciado CD/ANPD nº 1 (citado em requerimento do Senado, ver Fontes) permite outras bases com o melhor interesse. Qual interpretação adotar? [incerto] Há também o PL 2628/2022, que propõe mudar o art. 14 (citado no mesmo requerimento; situação atual não verificada). [incerto]
- **Q7. Exclusão e guarda fiscal.** A plataforma guarda registros fiscais? O CTN, art. 195, parágrafo único, fala em livros e comprovantes de escrituração comercial e fiscal até a prescrição dos créditos tributários. Aplica-se a pagamentos e atendimentos da plataforma? Qual prazo? Além disso, a exclusão apaga o histórico de consentimentos (cascade). Manter um registro mínimo e anonimizado para defesa do controlador (art. 16, IV)? [CONDICIONAL: depende de parecer]
- **Q8. Dados de localização.** Base e prazo da localização do plantão. O link para o OpenStreetMap transfere dados a terceiro? (G10) [incerto]
- **Q9. Assistente de IA.** Nome e país do fornecedor, prazo de guarda do texto enviado, uso para treinamento, e transferência internacional, se houver. Hoje nada disso está verificado. [incerto]
- **Q10. Selfie.** Quando houver conferência automática, qual base e qual consentimento (art. 11, I)? Antes disso, o texto da seção 4.1 vale. Pode-se pedir um RIPD específico? (ver documento 06)
- **Q11. Padrões de interface (dark patterns).** Não foi encontrado guia oficial da ANPD sobre padrões obscuros. Há comentário secundário (ver Fontes). O que se considera engano na tela de consentimento? A caixa pré-marcada da localização (G4) é um problema? [incerto]
- **Q12. Armazenamento e banner.** O app não tem banner de cookies, porque não há armazenamento não necessário. O guia da ANPD sobre cookies é aplicável, e o que diz? Conteúdo não lido (I5).
- **Q13. Permissões de loja.** Se a simulação de verificação não vai para a loja, retirar a câmera do manifesto e do Info.plist (seção 5)? [incerto: revisão da Apple e da Google não verificada]

### Itens [incerto] (não verificados nesta entrega)

- **I1.** Redação exigida pela Apple para `NSCameraUsageDescription` e `NSLocationWhenInUseUsageDescription`. As páginas da Apple abriram sem o texto (ver Fontes). Só a diretriz 5.1.1 foi lida.
- **I2.** Diretriz da Apple sobre o seletor de arquivo fora do processo e a necessidade de chave de fotos no WebView do Capacitor.
- **I3.** Aplicação do CTN, art. 195, parágrafo único, à plataforma, e os prazos de prescrição. Não foi aberta a versão atual do CTN nem a orientação da Receita sobre armazenamento eletrônico (Ato Declaratório Interpretativo RFB nº 4/2019, citado em comentário secundário).
- **I4.** Texto do art. 46 do CDC e do art. 54, §4º: lido na publicação original de 1990. Alterações posteriores não foram conferidas.
- **I5.** Guia orientativo da ANPD sobre cookies: a página foi aberta, mas o PDF não pôde ser lido. Data de criação: 18/10/2022; modificação: 23/01/2025 (metadados da página).
- **I6.** Enunciado CD/ANPD nº 1: o texto foi lido apenas na citação feita por um requerimento do Senado, de 21/11/2024. A data do enunciado é 22/05/2023 segundo esse requerimento; outras fontes secundárias dizem 24 ou 25/05/2023. O texto oficial da ANPD não foi aberto.
- **I7.** Lei 15.352/2026: as alterações estão no texto compilado impresso em 27/04/2026. Mudanças posteriores a essa data não foram conferidas.
- **I8.** Requisitos da Google Play para localização e câmera: a página sobre permissões sensíveis foi lida por um leitor de páginas, que devolveu trechos. As aspas desses trechos não foram conferidas palavra por palavra.
- **I9.** Exigências para teleconsulta e prontuário (CFM, NGS2, ICP-Brasil). Não foram verificadas. Os textos da seção 4.9 e 4.10 não afirmam essas exigências.
- **I10.** Condições do WhatsApp Business e do e-mail para marketing. Não foram abertas.

## Fontes consultadas

Todas as fontes foram abertas em 2026-11-08.

| # | Fonte (URL) | Norma ou trecho | Como foi lida | Observação |
|---|---|---|---|---|
| 1 | https://www.gov.br/governodigital/pt-br/identidade/identificacao-do-cidadao-e-carteira-de-identidade-nacional/camara-executiva-federal-de-identificacao-do-cidadao-cefic/L13709.pdf | Lei 13.709/2018 (LGPD), texto compilado do Planalto, impresso em 27/04/2026. Arts. 5º, I, II, V, VI; 6º, I, III, VI; 7º, I, II, V, IX; 8º, §§1º, 2º, 3º, 4º, 5º, 6º; 9º, caput, I a VII, §§1º e 3º; 11, I; 14, caput e §1º; 16, I e IV; 18, VI e VIII; 41, §1º. | PDF baixado e lido com `pdftotext`. | Cópia oficial do texto do Planalto. Os originais em planalto.gov.br estavam bloqueados (I7). |
| 2 | https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-publicacaooriginal-1-pl.html | Lei 8.078/1990 (CDC), arts. 46 e 54, §4º. | Página da Câmara, em trechos de 125 caracteres. | Publicação original (I4). Planalto bloqueado. |
| 3 | https://www2.camara.leg.br/legin/fed/lei/1960-1969/lei-5172-25-outubro-1966-358971-publicacaooriginal-1-pl.html | Lei 5.172/1966 (CTN), art. 195, caput e parágrafo único. | Página da Câmara, em trechos. | Publicação original, de 1966 (I3). |
| 4 | https://developer.apple.com/app-store/review/guidelines/ | Diretrizes da App Store, 5.1.1 (i) a (v). | Página lida. | Citações usadas: (ii) propósito claro e opção de retirar consentimento; (iii) seletor fora do processo; (iv) alternativa se recusar localização; (v) exclusão de conta no app. |
| 5 | https://developer.apple.com/documentation/bundleresources/information_property_list/nscamerausagedescription | `NSCameraUsageDescription`. | Página aberta. | Só o título apareceu (I1). |
| 6 | https://developer.apple.com/documentation/bundleresources/information_property_list/nslocationwheninuseusagedescription | `NSLocationWhenInUseUsageDescription`. | Página aberta. | Só o título apareceu (I1). |
| 7 | https://developer.apple.com/design/human-interface-guidelines/privacy | Diretrizes de privacidade da Apple. | Página aberta. | Só o título apareceu (I1). |
| 8 | https://support.google.com/googleplay/android-developer/answer/9888170 | Política da Google Play sobre permissões e APIs sensíveis: seção de localização. Não há seção de câmera nos trechos lidos. | Página lida por leitor de páginas. | Trechos devolvidos pelo leitor (I8). |
| 9 | https://support.google.com/googleplay/android-developer/answer/13327111 | Google Play, exclusão de conta no app: (a) caminho no app ou link web; (b) o que apagar; (d) retenção por razões legítimas. | Página lida por leitor de páginas. | Trechos devolvidos pelo leitor (I8). |
| 10 | https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-cookies-e-protecao-de-dados-pessoais.pdf | Guia orientativo da ANPD sobre cookies. | Página aberta; PDF não lido. | Só metadados (I5). |
| 11 | https://legis.senado.leg.br/sdleg-getter/documento?dm=9846335 | Requerimento do Senado, de 21/11/2024, que cita o Enunciado CD/ANPD nº 1 e o PL 2628/2022. | PDF lido. | Texto do enunciado citado, não o oficial (I6). |
| 12 | https://www.gov.br/anpd/pt-br/assuntos/deliberacoes-do-conselho-diretor-1/cds-ano-2023/cd-11-2023-votos.pdf | Votos do Conselho Diretor de 2023. | Página lida. | Não contém o enunciado; não usado. |

Tentativas que falharam: `planalto.gov.br` (LGPD, CDC e CTN) respondeu com aviso de requisição bloqueada; a versão da Câmara para a LGPD devolveu 404 e a página da ANPD sobre a LGPD também.

Fontes secundárias, usadas só como pista e não como base de citação:
- Comentário sobre dark patterns: https://www.conjur.com.br/2026-mai-21/dark-patterns-e-o-paradoxo-do-consentimento-na-lgpd//?print=1 (sem guia oficial da ANPD encontrado; I não verificado).
- Comentários sobre o art. 8º e o ônus da prova: https://confidata.com.br/blog/lgpd-comentada-07-consentimento-informacao (não usado como citação).

Fatos do produto, verificados no código em 2026-11-08 (não são fontes legais):
- `apps/web/docs/ARQUITETURA.md`: tabela `consents` e seção "LGPD e auditoria" (linhas 463 a 498); seção "Assistente (request-assist)" (linhas 752 a 770); seção "Linha de cuidado" (linhas 425 a 462); tabela de Edge Functions (linhas 568 a 578).
- `supabase/migrations/20261019000010_privacy_audit.sql`: `consents` (linhas 4 a 14), grants (linhas 240 a 249), `anonymize_user` (linhas 150 a 200).
- `supabase/migrations/20261019000009_care.sql`: `check_in` (linhas 360 a 380), `caregiver_shifts` (linhas 470 a 480), RLS de check-ins (linhas 551 a 553).
- `supabase/migrations/20261019000008_notifications.sql`: `cron.schedule` (linhas 276 a 277).
- `apps/web/services/care.ts`: `HEALTH_TERMS` e `findHealthTerm` (linhas 136 a 151), `HEALTH_DATA_NOTICE` (linha 158).
- `apps/web/supabase/functions/account-delete/handler.ts`: 409 `active_bookings`, cancelamento no Asaas, `anonymizeUser`.
- `apps/web/supabase/functions/request-assist/handler.ts` e `_shared/assist.ts`: limites de texto (10 a 2.000 caracteres) e de resumo (500).
- `apps/web/lib/supabase.ts` (linhas 34 a 36), `lib/requestDraft.ts`, `contexts/AuthContext.tsx` (linhas 147 e 165), `vite.config.ts` (linha 44).
- `apps/web/platform/geolocation.ts` (linha 40, `enableHighAccuracy`).
- `apps/web/ios/App/App/Info.plist` (linhas 9 a 12) e `apps/web/android/app/src/main/AndroidManifest.xml` (linhas 34 a 41).
