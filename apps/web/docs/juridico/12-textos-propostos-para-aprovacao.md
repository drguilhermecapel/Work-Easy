# Textos propostos para aprovação: T1 a T6

> **Rascunho para advogado e dono. Não é parecer jurídico.** Cada texto abaixo precisa de aprovação antes de ir para o app ou para a Política. Nenhum item conclui como uma norma se aplica a um caso concreto: isso é do advogado.

## Decisões adotadas por delegação (2026-11-09)

Uma opção para cada tema de T1 a T6 foi tomada pelo assistente sob delegação do dono. Cada escolha vale como decisão tomada pelo assistente sob delegação, não como parecer jurídico, e é um **padrão de produto**. **O advogado precisa confirmar cada uma antes de publicar** os textos deste documento ou qualquer alteração nos Termos, na Política ou no app. Os textos propostos e as perguntas abaixo continuam valendo; o que muda é a opção a seguir. Registro completo: `apps/web/docs/DECISOES.md`, seção "Decisões delegadas (2026-11-09)".

| Tema | Opção adotada | Pendência antes de publicar |
|---|---|---|
| T1. Pessoa cuidada sem idade mínima | **A.** Exigir 18 anos completos, com declaração obrigatória no cadastro (DD19) | A declaração de 18 anos já está no cadastro (`apps/web/components/cuidado/RecipientForm.tsx`). O código ainda aceita qualquer ano de nascimento entre 1900 e 2100. Ajustar `03` (10.3), `11` (4.4 e Q6) e o aviso da linha Cuidado |
| T2. Aceite dos Termos: declaração de 18 anos | **B.** Caixa separada só para a declaração de 18 anos, pedida também a contas existentes na próxima entrada (DD20) | A caixa separada já existe em `apps/web/pages/conta/Entrar.tsx` e em `apps/web/components/TermsGate.tsx`. Ajustar 3.3 dos Termos e 10.1 da Política para descrevê-la |
| T3. Aviso nos campos de texto livre | **A.** Aviso e dica por campo; campos mantidos (DD21) | O aviso já aparece nos formulários de plantão e de relatório. Sem reforço da trava por palavras |
| T4. Registro de acesso às contas | **C**, com prazo de 6 meses e acesso restrito a administrador: data, hora e tipo do evento de login. O app não grava IP; o IP fica nos registros do provedor, como complemento da **D** (DD22) | Ativar o hook no painel do provedor. O texto da opção A, que cita IP, não é adotado. A suficiência da opção C segue como pergunta ao advogado |
| T5. Prova do consentimento depois da exclusão | **A.** Registro pseudonimizado, por 5 anos (DD23). O prazo segue o padrão de prescrição do CDC e precisa de validação | O registro pseudonimizado (`consent_proofs`) e o expurgo existem no código (migrações 20261110500001 e 20261118200002). A chave (`consent_proof_links`) só é lida pelo service role. O código conta 5 anos a partir de cada consentimento, não da exclusão. A verificação do agendamento do expurgo em produção é ação do dono |
| T6. Exclusão com atendimento em andamento | **B.** Bloqueia só atendimento pago, em andamento ou em disputa. Atendimento aceito e não pago (inclui plantão atribuído e reserva aceita) é cancelado com aviso à outra parte (DD12) | O código já não bloqueia atendimento aceito: cancela e avisa a outra parte (migrações 20261110600004 e 20261110600007). Plantão em check-in que não terminou é cancelado na exclusão do cuidador (migração 20261118600007). Ajustar o item 3.7 dos Termos depois da confirmação |

As divergências 1 a 5 continuam abertas. Esta seção não corrige nenhuma delas.

- **Data:** 2026-11-09.
- **Número deste documento:** 12. É o primeiro número livre em `apps/web/docs/juridico/` (a pasta vai do 01 ao 11).
- **Base lida:** `00-pacote-para-advogado.md` (A05, A07, A09, A10, A22, A23, A24, B05, B13 e Seção D); `01-termos-de-uso.md` (cláusulas 3 e 7, pontos P5, P6, P8 e P15); `03-politica-de-privacidade.md` (seções 6, 7 e 10; Q1, Q2, Q5, Q7, Q12, Q13, Q18 e Q19); `11-textos-de-consentimento-e-avisos.md` (seções 4.4, 4.5 e 4.8; Q2, Q5, Q6, Q7 e Q16; conflitos C1 a C4); `docs/DECISOES.md` (D7, seção 5 e pergunta 6 da seção 8). Também conferi no código de `apps/web` os pontos citados em cada seção.
- **Fontes de lei:** a consulta ao planalto.gov.br foi bloqueada nesta data, como registrado em `00`, seção E. Nenhum artigo foi conferido no texto oficial. Todo artigo citado aqui está marcado **[incerto]** e indica de qual documento veio a citação.

**Legenda**

- **[incerto]:** artigo ou vigência não conferido em fonte aberta nesta data.
- **[PRAZO]:** prazo a definir pelo advogado ou pelo dono.
- **[CONTATO]:** canal a definir pelo dono.
- **Redação proposta:** texto para copiar, ainda não aprovado.

---

## Divergências que afetam estes textos

Estas divergências aparecem nos documentos ou entre documento e código. Precisam de decisão antes de publicar. Não foram corrigidas aqui.

1. **Declaração de 18 anos (T2).** Os Termos (3.3) e a Política (10.1) dizem que "vale a sua declaração ao aceitar". A tela de entrada tem a caixa "Li e aceito os Termos de Uso e a Política de Privacidade" e, em caixa separada, "Declaro que tenho 18 anos completos." (`apps/web/pages/conta/Entrar.tsx`). Os Termos (3.3) e a Política (10.1) ainda não descrevem a caixa separada.
2. **Aviso sobre criança e responsável (T1).** O aviso de `11`, 4.4, diz que o cadastro de criança "precisa ser feito por pai, mãe ou responsável legal". O formulário da pessoa cuidada pede a declaração de 18 anos completos (`apps/web/components/cuidado/RecipientForm.tsx`), mas o código ainda aceita ano de nascimento entre 1900 e 2100 (`apps/web/services/care.ts`, `LIMITS`). O aviso promete uma regra que o produto não aplica.
3. **Filtro de palavras de saúde (T3).** `11`, 4.8, diz que o filtro "roda só no navegador". Há também um filtro no servidor, no resumo semanal (`apps/web/supabase/functions/_shared/care-summary.ts`, linhas 205 e 318). O aviso deve refletir os dois.
4. **Escopo da linha Cuidado (T1).** `03`, 10.3, e `11`, 4.4, tratam a pessoa cuidada menor de 18 anos como caso possível. `DECISOES.md` (seção 5) e `00` (A18) tratam a linha como voltada a idosos. O escopo precisa ser fechado antes de escolher uma opção de T1.
5. **"Em disputa" ou "em contestação" (T6).** `03`, 7.2, diz "em contestação". `11`, 4.5, diz "em disputa". O código usa o status `disputed`. O sentido é o mesmo, mas o termo muda entre documentos.

---

## T1. Pessoa cuidada sem idade mínima

**Problema.** O cadastro da pessoa cuidada aceita qualquer ano de nascimento entre 1900 e 2100. Pede a declaração de que a pessoa tem 18 anos completos, mas não confere a idade e não pede declaração de responsável legal.

**Opções**

| Opção | Custo | Risco |
|---|---|---|
| A. Exigir 18 anos completos para a pessoa cuidada | Baixo a médio: uma pergunta e uma regra no cadastro. Exige ajustar `03` (10.3), `11` (4.4 e Q6) e o aviso da linha Cuidado. Deixa de atender menores de 18 anos | Menos dado de criança e de adolescente a justificar (LGPD, art. 14 [incerto]). Não resolve o caso do adulto que não consegue decidir sozinho (ver pergunta abaixo) |
| B. Aceitar menor só com responsável legal declarado e consentimento específico | Médio a alto: pergunta de idade, declaração do responsável, texto de consentimento próprio registrado em `consents` e rotina de correção | Depende de provar que quem declara é o responsável. O consentimento precisa ser específico, em destaque e revogável [incerto]. Mais dado de terceiro |
| C. Manter e documentar | Baixo no produto. Exige parecer por escrito antes de publicar | O aviso de `11` (4.4) já promete uma regra que o formulário não aplica (divergência 2). Fica sem base documentada |

**Redação proposta (rascunho para advogado)**

*Opção A.* Campo no cadastro da pessoa cuidada:

> **A pessoa cuidada tem 18 anos completos?**
> ( ) Sim   ( ) Não
>
> *Ajuda do campo:* A linha Cuidado atende pessoas com 18 anos completos ou mais. Ao marcar "Sim", você declara que a pessoa tem essa idade. Sem essa declaração, o cadastro não é feito.
>
> *Se marcar "Não":* Não podemos fazer este cadastro. A linha Cuidado atende apenas pessoas com 18 anos completos ou mais. [CONTATO: onde a família pode buscar outra forma de atendimento.]

*Opção B,* se for a escolha. Use no lugar do campo acima:

> **A pessoa cuidada tem 18 anos completos?**
> ( ) Sim   ( ) Não
>
> *Se marcar "Não":* Você é o pai, a mãe ou o responsável legal desta pessoa?
> ( ) Sim   ( ) Não. Sem essa confirmação, o cadastro não é feito.
>
> *Se marcar "Sim" na pergunta acima:* Você confirma que tem autoridade legal para informar os dados dela. O consentimento para o tratamento é pedido em texto próprio e destacado. A redação desse texto fica para depois da escolha.

**Normas e fontes a conferir**

- Código Civil, arts. 3º e 4º (capacidade civil, inclusive de quem não consegue expressar a vontade). Redação vigente após a Lei 13.146/2015 [incerto]. Citado no pedido de origem; não conferido.
- Código Civil, art. 5º (a menoridade cessa aos 18 anos completos) [incerto; citado em `01`, 3.3].
- Código Civil, arts. 1.767 e seguintes (curatela) e art. 1.783-A (tomada de decisão apoiada) [incerto; não citados nos documentos lidos]. Conferir se algum deles se aplica ao cuidado de pessoa adulta que não consegue decidir por si.
- Lei 13.146/2015 (Estatuto da Pessoa com Deficiência) [incerto; não citada nos documentos lidos].
- Lei 10.741/2003 (Estatuto da Pessoa Idosa) [incerto; não citada nos documentos lidos]. Conferir se há regra específica para o cadastro de pessoa idosa.
- LGPD, art. 14, caput e § 1º (dados de criança e de adolescente; consentimento de pelo menos um dos pais ou do responsável) [incerto; citado em `03`, 10.3, e em `11`, 4.4].
- LGPD, arts. 7º e 11 (bases para dado pessoal comum e dado sensível) [incerto; citados em `03`, Q5].
- Enunciado da ANPD sobre tratamento de dados de criança e de adolescente, de 24/05/2023. O número não foi conferido: `11`, Q6, cita o Enunciado CD/ANPD nº 1, e `03`, Q5, diz que o número não consta na página consultada [incerto].

**Pergunta para o advogado.** A exigência de 18 anos completos atende ao cadastro da pessoa cuidada? Se não atende, qual regra deve valer para quem informa e autoriza os dados quando a pessoa cuidada não consegue decidir por si?

---

## T2. Aceite dos Termos: declaração de 18 anos

**Problema.** Os Termos (3.3) e a Política (10.1) dizem que vale a declaração de 18 anos feita ao aceitar. A declaração já tem caixa separada na tela de entrada e no `TermsGate` (divergência 1).

**Opções**

| Opção | Custo | Risco |
|---|---|---|
| A. Caixa única, com a declaração de 18 anos, os Termos e a Política | Baixo: uma caixa e um texto | Mistura aceite de contrato, ciência e declaração de idade numa só marcação. A prova fica menos clara (`11`, Q2) |
| B. Caixa separada só para a declaração de 18 anos | Baixo a médio: uma caixa a mais e gravação própria | Prova da idade fica separada. Continua sendo uma declaração, sem conferência |
| C. Data de nascimento, com regra de idade mínima | Médio: campo, validação e regra de retenção. Hoje a data só é pedida para a conta de cobrança de pessoa física no Asaas (`00`, A07) | Coleta um dado que hoje não serve ao cadastro (necessidade, LGPD, art. 6º, III [incerto]). Ligada à decisão B13 do `00` |

**Redação proposta (rascunho para advogado)**

*Opção B.* Caixa separada, acima dos botões de entrar:

> ☐ Declaro que tenho 18 anos completos.
>
> *Ajuda da caixa:* O WorkEasy não é para menores de 18 anos. Hoje não conferimos a idade: esta declaração é sua.
>
> *Se a caixa não for marcada:* Para criar conta, você precisa declarar que tem 18 anos completos.

*Opção A,* se for a escolha. Use no lugar da caixa acima:

> ☐ Declaro que tenho 18 anos completos e li e aceito os Termos de Uso e a Política de Privacidade.

Depois da escolha, os itens 3.3 dos Termos e 10.1 da Política devem descrever a caixa que foi adotada.

**Normas e fontes a conferir**

- Código Civil, art. 5º (menoridade cessa aos 18 anos completos) [incerto; citado em `01`, 3.3].
- Código Civil, arts. 3º e 4º (capacidade) [incerto; citados no pedido de origem, não conferidos].
- LGPD, art. 8º, caput e §§ 1º e 2º (forma do consentimento, cláusula destacada, ônus da prova no controlador) [incerto; citados em `11`, Q2 e Q16]. `11`, Q2, sustenta que o aceite dos Termos é aceite de contrato, e não consentimento. Se for assim, o art. 8º pode não cobrir essa caixa [incerto].
- LGPD, art. 14 (criança e adolescente, se a idade informada for menor de 18 anos) [incerto; citado em `11`, Q6].
- CDC, art. 46 (contrato que o consumidor não teve oportunidade de conhecer) e art. 54, §§ 3º e 4º (destaque de cláusulas) [incerto; citados em `01`, P5].

**Pergunta para o advogado.** A declaração de 18 anos deve ficar em caixa separada do aceite dos Termos e da Política?

---

## T3. Aviso nos campos de texto livre

**Problema.** Preferências, contato de emergência, observações e relatório diário aceitam texto livre. O texto pode trazer dado de saúde, que é dado pessoal sensível.

**Fatos conferidos.** Os limites estão em `apps/web/services/care.ts`: preferências, observações da casa, observações do plantão e relatório, 2.000 caracteres cada; contato de emergência, 300; humor, 500. Há uma trava por palavras no cliente (`services/care.ts`) e outra no resumo semanal, no servidor (`supabase/functions/_shared/care-summary.ts`). O próprio código diz que a trava é uma heurística e não promete pegar tudo.

**Opções**

| Opção | Custo | Risco |
|---|---|---|
| A. Só aviso e dica por campo | Baixo: texto e lembrete | O aviso não impede o envio de dado de saúde e não resolve a base legal |
| B. Aviso, mais uma trava por palavras reforçada | Médio: ajustar a lista e testar | A trava por palavras não pega todo texto de saúde. Pode dar sensação de controle que não existe |
| C. Consentimento específico e destacado por campo (LGPD, art. 11, I) | Alto: consentimento por campo, revogação e prova | Quem consente, a família ou o cuidador? Exige base e registro para cada campo |
| D. Trocar os campos de saúde por opções fechadas | Médio: formulário e experiência de uso | Perde informação útil. Reduz a exposição, mas o campo de observações continua livre |

**Redação proposta (rascunho para advogado)**

Opção A: dois textos de dica por campo. Os textos evitam a expressão "não guarda dados de saúde", que o próprio produto já proíbe (`11`, conflito C2).

**Preferências da pessoa cuidada** (até 2.000 caracteres)

- *Dica 1:* "Descreva rotina e gostos gerais: horários, comidas de que gosta, o que a acalma. Não escreva diagnósticos, remédios, doses, exames nem sintomas."
- *Dica 2:* "Escreva só o que ajuda no dia a dia. Se algum cuidado de saúde for necessário, combine com o cuidador fora do app."

**Contato de emergência** (até 300 caracteres)

- *Dica 1:* "Nome e telefone de uma pessoa que pode ser avisada em caso de urgência. Antes de informar, confirme que ela concorda."
- *Dica 2:* "Você passa dados de outra pessoa ao informar este contato. Não escreva informações de saúde sobre ela."

**Observações da casa e do plantão** (até 2.000 caracteres)

- *Dica 1:* "O que o cuidador precisa saber para o trabalho, como acesso e combinados. Não escreva diagnósticos, remédios, doses, exames nem sintomas."
- *Dica 2:* "Evite nomes e dados de outras pessoas. Escreva só o necessário para o plantão."

**Relatório diário: refeições, atividades, humor e observações** (até 2.000; humor, até 500)

- *Dica 1:* "Registre o que aconteceu no plantão, em frases curtas. Exemplo: almoçou bem e caminhou no jardim."
- *Dica 2:* "Em caso de urgência, ligue 192 (SAMU). Este registro não substitui atendimento de saúde."

*Nota para o advogado, fora do texto de tela:* não conferi se as observações do plantão entram no resumo semanal por IA (`03`, Q2 (c), fala de relatórios). Também não conferi, campo a campo, quem vê cada campo. `11`, 4.4, diz que preferências e contato de emergência ficam só com a família.

**Normas e fontes a conferir**

- LGPD, art. 5º, II (dado de saúde é dado pessoal sensível) [incerto; citado em `03`, Q2, e em `11`, 4.8].
- LGPD, art. 11, caput, I e II (consentimento específico e destacado; hipóteses sem consentimento, entre elas a alínea "f", tutela da saúde por profissionais e serviços de saúde, que precisa ser lida com cuidado para cuidadores) [incerto; citados em `03`, Q2, e em `00`, A10].
- LGPD, art. 11, § 4º (vedação de uso de dado de saúde para obter vantagem econômica, com exceções) [incerto; não citado nos documentos lidos]. Conferir se o relatório ou o resumo se enquadra.
- LGPD, art. 6º, III (necessidade) [incerto; não citado nos documentos lidos].
- CDC, art. 6º, III (informação clara) [incerto; citado em `00`, A45].

**Pergunta para o advogado.** Para os campos de texto livre, o aviso por campo (opção A) é suficiente, ou o dado de saúde que pode aparecer exige consentimento específico (opção C) ou a troca do campo (opção D)?

---

## T4. Registro de acesso às contas

**Problema.** Decidiu-se a opção C (DD22): registro de data, hora e tipo do evento de login, pelo prazo de 6 meses e com acesso restrito a administrador. O código já tem a tabela `access_events` e a função do hook de login (migração 20261110500002). Ela não grava endereço IP (`03`, Q7).

**Opções**

| Opção | Custo | Risco |
|---|---|---|
| A. Tabela própria de registros, com prazo de 6 meses, acesso restrito e registro de quem consulta | Médio: tabela nova, rotina de apagamento, controle de acesso e auditoria | Cumpre a obrigação se ela se aplicar. Se não se aplicar, guarda IP sem necessidade (LGPD, art. 6º, III [incerto]) |
| B. Não guardar registros de acesso | Baixo | Se o art. 15 do Marco Civil se aplicar, há descumprimento. A consequência não foi conferida [incerto] |
| C. Guardar só o evento de login (data e hora), sem IP | Baixo a médio | A definição de registro de acesso citada em `03`, Q7, inclui o endereço IP. Um evento sem IP pode não cumprir a obrigação. Pergunta ao advogado |
| D. Usar os logs do fornecedor de banco e autenticação | Baixo para o produto; depende de contrato e do prazo do fornecedor | Não é claro que esses logs sejam os registros do art. 15. Prazo e acesso do fornecedor não conferidos (`03`, Q13) |

**Redação proposta (rascunho para advogado)**

*Opção A, não adotada (DD22).* Só para usar se o advogado confirmar a aplicação do art. 15 e a decisão mudar. Este texto cita IP, que o app não grava. Seção nova na Política (ou item 13.3 dos Termos):

> **Registros de acesso à sua conta.** Guardamos registros de acesso à sua conta, com data, hora e endereço de origem (IP), pelo prazo de 6 (seis) meses. Eles ficam em ambiente controlado, com acesso restrito, e são apagados depois desse prazo. Entregamos esses registros somente quando a lei exigir.

*Se o advogado concluir que a obrigação não se aplica,* e a equipe confirmar que nenhum registro com IP é guardado, inclusive pelos fornecedores, use no lugar:

> **Registros de acesso à sua conta.** Não guardamos registros de acesso à sua conta com endereço de origem (IP). [CONFERIR antes de publicar: logs dos fornecedores.]

**Normas e fontes a conferir**

- Marco Civil da Internet (Lei 12.965/2014), art. 15, caput: provedor de aplicações constituído como pessoa jurídica, de forma organizada, profissional e com fins econômicos, deve guardar os registros por 6 meses, sob sigilo [incerto; citado em `03`, Q7, e em `01`, P15]. A aplicação ao WorkEasy não foi confirmada.
- Marco Civil, art. 5º, VIII (definição de registro de acesso) [incerto; citado em `03`, Q7].
- Marco Civil, art. 15, § 3º (entrega dos registros) [incerto; citado em `03`, Q7].
- Marco Civil, art. 7º, VI (o contrato deve detalhar o regime de proteção dos registros) [incerto; citado em `01`, P15].
- Sanção aplicável em caso de descumprimento do art. 15 [incerto; não conferido].
- LGPD, art. 6º, III, e art. 37 (registro das operações de tratamento) [incerto; citados em `03`, Q1, e art. 37 em `00`, A22].

**Pergunta para o advogado.** O art. 15 do Marco Civil se aplica ao WorkEasy como provedor de aplicações e, se sim, um registro só com data e hora, sem IP, cumpre a obrigação?

---

## T5. Prova do consentimento depois da exclusão

**Problema.** A exclusão apaga os consentimentos junto com a conta (`03`, Q12, e seção 6). Desde a migração 20261110500001, ela também copia para um registro pseudonimizado as decisões de consentimento ainda dentro de 5 anos. A empresa pode precisar provar, depois da exclusão, que a pessoa aceitou os Termos e a Política.

**Fatos conferidos.** O `audit_log` mantém o código da conta, sem chave estrangeira (`03`, Q12). `11`, Q7, sugere manter um registro mínimo e anonimizado para defesa do controlador (LGPD, art. 16, IV).

**Opções**

| Opção | Custo | Risco |
|---|---|---|
| A. Registro pseudonimizado pelo prazo a definir | Médio: código no lugar do nome; chave de ligação guardada à parte, com acesso restrito; rotina de apagamento | Dado pseudonimizado ainda pode ser dado pessoal [incerto; conferir art. 13, § 4º]. A chave é o ponto de maior risco. O prazo precisa de base |
| B. Apagar tudo, inclusive o registro de aceite | Baixo | Sem prova em caso de disputa. A conservação do art. 16 pode ser permitida em hipóteses específicas [incerto] |
| C. Manter o aceite sem vínculo com a pessoa (sem chave) | Baixo a médio | Não prova que aquela pessoa aceitou. A anonimização precisa ser real (LGPD, art. 5º, XI [incerto]) |

**Redação proposta (rascunho para advogado)**

*Opção A.* Trecho para a seção 7 da Política, sobre o que fica depois da exclusão:

> Na exclusão, limpamos as notas dos plantões e os textos do relatório diário (refeições, atividades, humor e observações) dos plantões das casas da sua conta. Os demais dados seguem a regra de retenção desta Política. Depois da exclusão, guardamos a prova das suas decisões de consentimento: a finalidade, a versão do texto, se você concordou, a data e a hora. Esse registro inclui o aceite dos Termos de Uso e da Política de Privacidade, e usa um código no lugar do seu nome. A ligação com a sua conta fica guardada separada, com acesso restrito, e é usada só para responder a uma disputa sobre o aceite. Esse registro é apagado 5 (cinco) anos depois da exclusão da conta. [CONFERIR antes de publicar: o código ainda conta 5 anos a partir da data de cada consentimento, não da exclusão.]

**Normas e fontes a conferir**

- LGPD, art. 16, caput e incisos I a IV (conservação autorizada; o inciso IV trata de uso exclusivo do controlador, com dados anonimizados) [incerto; citados em `03`, Q12, `11`, Q7, e `00`, A22].
- LGPD, art. 8º, § 2º (ônus da prova do consentimento no controlador) [incerto; citado em `11`, Q2].
- LGPD, art. 8º, § 5º (revogação; tratamentos anteriores ficam válidos até o pedido de eliminação) [incerto; citado em `11`, Q5].
- LGPD, art. 18, VI (eliminação de dado tratado com consentimento, ressalvado o art. 16) [incerto; citado em `03`, seção 6, e em `11`, 4.5].
- LGPD, art. 7º, VI (exercício regular de direitos em processo) [incerto; não citado nos documentos lidos. Base possível para guardar a prova].
- LGPD, art. 5º, XI (anonimização) e art. 13, § 4º (pseudonimização) [incerto; não citados nos documentos lidos].
- CDC, art. 27 (prazo de cinco anos para reparação por fato do serviço) [incerto; não citado nos documentos lidos. Aplicação à prova do aceite não conferida].

**Pergunta para o advogado.** A opção A, adotada pelo assistente sob delegação, sustenta a prova do aceite sem manter dado pessoal além do necessário? O prazo de 5 anos depois da exclusão tem base suficiente?

---

## T6. Exclusão com atendimento em andamento

**Problema.** A exclusão é recusada enquanto houver atendimento pago, em andamento ou em disputa (`apps/web/supabase/functions/account-delete/handler.ts`; `11`, 4.5; `03`, 7.2). O texto não diz o que a pessoa pode fazer nem o que acontece com a outra parte.

**Fatos conferidos.** Quando a família exclui a conta, o plantão confirmado que ainda não começou é cancelado, e o cuidador recebe o aviso. Ele continua vendo o período e o status do plantão, como histórico, sem as notas, o primeiro nome da pessoa cuidada nem o bairro (migrações 20261110600007 e 20261118600005; `11`, 4.5, a ajustar). A exclusão também cancela a assinatura Pro e as cobranças em aberto (`03`, 7.3). Não há ação de cancelamento para atendimento pago, nem do cliente nem do profissional (`00`, A05).

**Opções**

| Opção | Custo | Risco |
|---|---|---|
| A. Manter o bloqueio, com prazo máximo e um caminho de saída | Baixo a médio: texto, prazo e encerramento assistido pela equipe | A pessoa fica presa à conta pelo prazo. Precisa de prazo definido (`00`, B05) e de um caminho quando a outra parte não responde. Pode ser visto como barreira ao direito de eliminação |
| B. Bloquear só o que depende de dinheiro ou de outra pessoa (pago, em andamento, em disputa). Atendimento apenas aceito e não pago pode ser cancelado, com aviso | Médio: regra de cancelamento, aviso à outra parte e ajuste na função de exclusão | O cancelamento de atendimento aceito afeta o profissional. Precisa de regra de multa e de aviso (`00`, A05; Decreto 7.962/2013, art. 5º [incerto]) |
| C. Permitir a exclusão sempre e cancelar os atendimentos com aviso | Alto: cancelamento automático, estorno e aviso às partes. Atendimento pago exige estorno (`00`, A06) | Repasse já feito, estorno e possível reclamação. Pode dificultar a defesa em disputa. Maior custo operacional |

**Redação proposta (rascunho para advogado)**

*Opção B.* Substitui o parágrafo 3.7 dos Termos:

> Você pode pedir a exclusão da conta a qualquer momento, em "Minha conta". Se houver atendimento pago, em andamento ou em contestação, a exclusão espera o fim dele ou a solução pela equipe. Se houver atendimento aceito e ainda não pago, ou plantão atribuído, a exclusão cancela esse atendimento ou plantão, conforme o item 7, e avisamos a outra parte. Se você é cuidador e tem plantão com check-in feito que ainda não terminou, esse plantão é cancelado com a exclusão, e a família recebe o mesmo aviso de cancelamento dos demais. Plantão já encerrado fica como histórico. Na exclusão, também limpamos as notas dos plantões e os textos do relatório diário (refeições, atividades, humor e observações) dos plantões das casas da sua conta; os demais dados seguem a Política de Privacidade. Avisamos você quando a exclusão for concluída. Se a exclusão ficar pendente por mais de [PRAZO], a equipe entra em contato pelo canal cadastrado.

*Nota:* o código já cancela o atendimento aceito e avisa a outra parte, e já cancela o plantão com check-in na exclusão do cuidador (migrações 20261110600004, 20261110600007 e 20261118600007). Também usa "em contestação", e não "em disputa" (divergência 5).

**Normas e fontes a conferir**

- LGPD, art. 18, VI e art. 16 (eliminação e conservação autorizada) [incerto; citados em `03`, seção 7, e em `11`, 4.5].
- LGPD, art. 18, IV (anonimização, bloqueio ou eliminação de dado desnecessário) [incerto; citado em `03`, Q13].
- LGPD, art. 7º, V (execução de contrato) [incerto; base provável dos atendimentos, não conferida].
- CDC, art. 51, XI e XIII (cláusulas que permitem ao fornecedor cancelar o contrato sem igual direito ao consumidor) [incerto; citados em `01`, P8].
- Decreto 7.962/2013, art. 5º (arrependimento e meio de cancelamento) [incerto; citado em `00`, A05].
- Código Civil, arts. 421 e 422 (função social e boa-fé na execução do contrato) [incerto; não citados nos documentos lidos].

**Pergunta para o advogado.** Quando a base do tratamento é o contrato (art. 7º, V), o pedido de exclusão deve ser atendido só depois do fim do atendimento, ou bastam a regra do art. 16 e o item 7 dos Termos?

---

## Itens novos da rodada de 24/11/2026 para o advogado

Textos e tratamentos que entraram no app em 24/11/2026 (`docs/DECISOES.md`, DD59 a DD74). Estão no código como proposta; nenhum foi validado. Os documentos 03 (Política de Privacidade) e 07 (registro das operações) **não foram alterados**: a lista do item N3 diz o que falta neles.

### N1. Aceite antes de usar um assistente de IA (DD62)

**Onde aparece.** Na primeira vez que a conta abre a sugestão de itens do orçamento ou o resumo da semana, antes de qualquer envio (`components/AiConsent.tsx`). O botão é "Concordo e quero usar". O aceite fica no histórico de consentimentos como finalidade `ai_assist`, versão `2026-11`. O aviso específico de cada assistente (o que é enviado) continua aparecendo depois do aceite.

**Texto do aceite:**

> Esta ajuda envia o que você escrever a um serviço de inteligência artificial de terceiros, que devolve uma sugestão. O uso é opcional: tudo o que ela faz você também pode fazer à mão. Você pode retirar este consentimento quando quiser em Minha conta.

**Texto em Minha conta, na lista de consentimentos** (título "Ajuda com inteligência artificial"):

> Enviar o texto que você escreve nos assistentes (sugestão de orçamento, resumo da semana) a um serviço de inteligência artificial de terceiros. Sem este consentimento os assistentes ficam desligados para você; o resto do app funciona igual.

**Limites.** O texto não nomeia o provedor. A conferência do aceite é feita na tela; as funções de servidor não a repetem. O assistente de pedidos (`request-assist`) não tem tela e segue desligado.

**Perguntas para o advogado.** (a) O consentimento é a base adequada, ou o tratamento cabe em outra base e o aceite é só transparência? (b) O texto precisa nomear o provedor e o país? (c) Para o resumo da semana, que lê relatórios sobre a pessoa cuidada, o aceite da família basta, já que a pessoa cuidada e o cuidador não aceitam nada? (d) A retirada do consentimento precisa apagar algo além de desligar o uso?

### N2. Página pública "Excluir a conta do WorkEasy" (DD72)

**Onde aparece.** `/excluir-conta`, sem login, com link no rodapé (`pages/conta/ExcluirConta.tsx`). As lojas exigem um endereço público que explique a exclusão. Texto da página:

> **Excluir a conta do WorkEasy**
>
> Você pode excluir a sua conta a qualquer momento, pelo site ou pelo aplicativo, sem falar com ninguém.
>
> **Como excluir**
>
> 1. Entre na sua conta com o código enviado ao seu e-mail ou celular.
> 2. Abra a página “Minha conta”.
> 3. Na seção “Excluir minha conta”, digite a palavra de confirmação e toque em “Excluir minha conta”.
>
> **O que é apagado**
>
> - Nome, telefone, e-mail de acesso, cidade e localização.
> - Documentos enviados e textos escritos por você, como descrições de pedidos e mensagens.
> - Casas, pessoas cuidadas, notas de plantões e textos do relatório diário da linha de cuidado.
>
> **O que continua guardado**
>
> - Valores e datas de pagamentos e atendimentos já realizados, sem os seus dados de identificação, porque a lei fiscal obriga a guardar esses registros.
> - O registro de que você aceitou os termos, guardado sem identificação direta, como prova do consentimento.
>
> Os prazos e os detalhes estão na Política de Privacidade. Atendimentos e plantões ainda em aberto são cancelados, e a outra parte é avisada.
>
> **Não consegue entrar na conta?**
>
> Peça a exclusão pelo atendimento ao consumidor. Vamos confirmar que a conta é sua antes de excluir.

**Pontos a conferir.** (a) A lista "O que é apagado" foi escrita a partir do texto de Minha conta e de DD37; não foi conferida linha a linha contra `anonymize_user`. "Mensagens" e "localização" precisam de confirmação técnica antes de publicar [incerto]. (b) "A lei fiscal obriga" não cita norma (ver T5 e DD41). (c) Atendimento pago, em andamento ou em disputa **bloqueia** a exclusão (DD12), e a página não diz isso. (d) A exclusão pedida pelo SAC, sem login, não tem procedimento escrito de confirmação de identidade.

### N3. Tratamentos novos que faltam na Política de Privacidade (03) e no registro (07)

| Tratamento | Dados | Quem vê | Guarda hoje | O que falta decidir |
|---|---|---|---|---|
| Denúncias (`content_reports`) | quem denunciou, o que foi denunciado, motivo, relato em texto livre, decisão do operador | quem denunciou (as suas) e administradores; o denunciado não vê | sem prazo de expurgo; na exclusão da conta de quem denunciou, o relato e a autoria são apagados | base legal, prazo de guarda, se o denunciado tem direito de saber e de responder, prazo de resposta do operador |
| Bloqueios (`user_blocks`) | quem bloqueou, quem foi bloqueado, origem (perfil ou pedido), data | só quem bloqueou e administradores | até o desbloqueio ou a exclusão de uma das contas (apagados na anonimização) | se precisa constar da Política; efeito sobre atendimentos em curso |
| Lista de espera (`waitlist_entries`) | conta, bairro, serviço desejado, data | a própria conta e administradores | sem prazo de expurgo; sai quando o login é removido no fim da exclusão da conta (cascata do banco), não pela anonimização | base legal, prazo, e se usar a lista para avisar a pessoa depende do consentimento de comunicações |
| Histórico de estados da assinatura (`subscription_status_history`) | prestador, estado anterior, estado novo, data | o próprio prestador e administradores | sem prazo de expurgo; sai quando o login do prestador é removido no fim da exclusão (cascata do banco) | prazo de guarda (registro financeiro?) |
| Datas operacionais | data de recebimento do pagamento, primeira aprovação do prestador, conclusão do orçamento, data em que o prestador pode ir | as partes do atendimento e administradores | junto com a linha a que pertencem | nenhum ponto novo conhecido; listar no registro |
| Aviso de pedido novo (`pedido_novo`) | ocupação e bairro do pedido, enviados por e-mail ou WhatsApp a até 30 prestadores | os prestadores avisados | como as demais notificações | o nome da ocupação vai ao provedor de mensagens, inclusive em saúde e cuidado (mesmo ponto das outras notificações) |
| Consentimento `ai_assist` | finalidade, versão, decisão, data | a própria conta e administradores | como os demais consentimentos (prova pseudonimizada depois da exclusão, DD39) | ver N1 |

---

## Antes de publicar

1. Escolher uma opção por tema (T1 a T6) e registrar a decisão em `docs/DECISOES.md` ou no `00`.
2. Corrigir as divergências 1 a 5 nos documentos 01, 03 e 11, e no código, conforme a decisão. Isso não foi feito aqui.
3. Conferir cada [incerto] no texto oficial (planalto.gov.br e DOU) antes de publicar.
4. Preencher [PRAZO] e [CONTATO].
5. Este documento não altera o app nem os textos publicados.
