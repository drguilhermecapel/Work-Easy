# Política de Privacidade do WorkEasy

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| | |
|---|---|
| Controlador | [RAZÃO SOCIAL], CNPJ [CNPJ], [ENDEREÇO] |
| Canal para titulares (SAC) | [E-MAIL DO SAC] |
| Encarregado | [E-MAIL DO ENCARREGADO] |
| Versão | 2026-10-rascunho (mesma etiqueta de `apps/web/config/legal.ts`) |
| Data de vigência | [DATA DE VIGÊNCIA] |
| Conferido contra o código em | 08/11/2026, HEAD `2831d9b` (ramo `claude/plano-restante`; revisão do L03, ver "Fontes consultadas") |
| Estado do produto | Protótipo. Não implantado, sem usuários reais. Tudo marcado [PLANEJADO] ainda não existe no app. |

## Como ler

1. Os números (1.1, 3.4 etc.) são cláusulas. Cite pelo número.
2. **[PLANEJADO]**: ainda não existe no app. Não publique a frase como se já valesse.
3. **[CONDICIONAL: depende de parecer]**: a redação depende de decisão do advogado. Não publique sem resolver.
4. **[incerto]**: não consegui abrir a fonte primária ou ela não diz o que se precisa. Os itens estão na seção "Itens [incerto]".
5. Textos entre colchetes em maiúsculas (por exemplo, [E-MAIL DO SAC]) são dados da empresa, que ainda não existe.

---

## 1. Quem trata seus dados e o que é o WorkEasy

1.1. O WorkEasy é um aplicativo e um site para encontrar profissionais e prestadores de serviço, pedir orçamento, marcar horário e receber pagamento. Também tem a **linha Cuidado**, em que uma família organiza plantões com cuidadores independentes.

1.2. Quem decide sobre o tratamento dos seus dados é a [RAZÃO SOCIAL], CNPJ [CNPJ], [ENDEREÇO]. Essa empresa será criada e será separada de qualquer clínica ou atividade médica. O papel dela em cada tipo de dado (controladora ou operadora) está em aberto: ver Q1.

1.3. O WorkEasy não é clínica. Não faz diagnóstico, não indica tratamento e não guarda prontuário. O cadastro da linha Cuidado não tem campo para diagnóstico nem para medicação.

1.4. Esta política trata de dados pessoais. Os Termos de Uso (documento 01) e os Termos do Prestador (documento 02) tratam das regras de uso.

---

## 2. Quais dados coletamos

### 2.1. Por grupo

| Grupo | Dados | Quando | Pode ser dado sensível (art. 5º, II, LGPD)? |
|---|---|---|---|
| A. Conta | Nome, e-mail, telefone, cidade (padrão São Paulo), data e hora do aceite dos textos e a versão aceita | Cadastro e login por código | Não |
| B. Perfil do profissional | Ocupação, número e UF do registro no conselho, bairros atendidos, nome público, descrição, foto de perfil, endereço da página própria | Cadastro do profissional | Não, salvo o que a foto ou a descrição revelarem |
| C. Documentos do profissional | Documento com foto e selfie; CPF ou CNPJ; certidão de antecedentes criminais (quando a ocupação exige); registro no conselho; certificado de curso; CNH; licença do órgão; seguro de responsabilidade civil (conforme a ocupação) | Análise do cadastro | **Sim** para a selfie, que é dado biométrico quando ligada à pessoa [CONDICIONAL: depende de parecer]. A certidão não aparece na lista do art. 5º, II: tratamos com cuidado [CONDICIONAL] |
| D. Dados para pagamento | Para o profissional (conta de recebimento no Asaas): nome, e-mail, CPF ou CNPJ, data de nascimento (quando CPF), celular, valor de renda informado, endereço, número, complemento, bairro e CEP. Para o cliente que paga: nome, CPF ou CNPJ, e-mail e celular | Cadastro de recebimento e cobrança | Não está na lista do art. 5º, II. Tratamos com cuidado |
| E. Pedidos e propostas | Ocupação, bairro, descrição em texto livre (10 a 2.000 caracteres), datas preferidas, urgência, preço e mensagem da proposta | Uso do app | **Pode**, se o texto livre trouxer dado sensível |
| F. Atendimentos e avaliações | Datas, horários, valores, status, motivos de cancelamento e de contestação; nota e comentário da avaliação | Uso do app | **Pode**, no comentário ou no motivo |
| G. Linha Cuidado | Casa (nome, bairro, observações); pessoa cuidada (primeiro nome, ano de nascimento, preferências, contato de emergência); plantões; check-in e check-out (com coordenadas, se você permitir); relatório do dia (refeições, atividades, humor, notas) | Uso da família e do cuidador | **Pode**: os campos de texto livre podem trazer dado de saúde, mesmo sem campo próprio para isso. A pessoa cuidada pode ser criança (seção 10) |
| H. Consentimentos e pedidos de titular | Cada decisão de consentimento (finalidade, versão, aceite ou recusa, data e hora); pedidos de cópia e de exclusão | Sempre | Não |
| I. Mensagens | Telefone e e-mail usados no envio; modelo da mensagem; nome da ocupação, da outra parte e do bairro no texto; status de envio | Notificações | Não |
| J. Dados técnicos | Sessão de login no navegador (seção 11); registro de ações (ação, entidade, data, quem fez); eventos de funil do produto (tipo do passo, data e identificador de pedido, atendimento ou assinatura; sem nome, telefone, e-mail ou texto livre; seção 6); [PLANEJADO] registros de acesso (data, hora e endereço IP) | Sempre | Não |
| L. Clientes e orçamentos digitados pelo profissional | Nome, telefone, e-mail e observações de cada cliente da lista dele; orçamentos com nome e telefone do cliente, itens e valores. São dados de **terceiros**, que não criam conta | Cadastro e orçamento feitos pelo profissional | Pode, se as observações trouxerem dado sensível. [CONDICIONAL: Q1] |
| K. Localização do aparelho | Latitude e longitude com 6 casas decimais, só no check-in e check-out de plantão, e só se você aceitar o consentimento "Localização" e permitir no aparelho | Plantão | Não está na lista do art. 5º, II. Tratamos com cuidado |

### 2.2. Dados que não coletamos

2.2.1. Não recebemos nem guardamos número de cartão. O pagamento por cartão acontece na página do Asaas. O que o Asaas devolve é gravado sem os dados de cartão.

2.2.2. Não coletamos dado de saúde de propósito. Ainda assim, o texto livre pode trazer. Veja a seção 10 e Q2.

---

## 3. Para que usamos seus dados e qual é a base legal

Art. 7º (dados comuns) e art. 11 (dados sensíveis), da Lei 13.709/2018 (LGPD).

| # | Finalidade | Dados | Base legal | Observação |
|---|---|---|---|---|
| 3.1 | Criar conta e entrar por código, por e-mail ou por SMS | A, J | Art. 7º, V (contrato com você, a seu pedido) | O envio por SMS (e por WhatsApp, se configurado) depende de um provedor configurado. [PLANEJADO] |
| 3.2 | Mostrar seu perfil, receber e enviar pedidos, propostas, horários e atendimentos | A, B, E, F | Art. 7º, V | O profissional vê nome, telefone e cidade do seu perfil quando você pede horário ou aceita proposta. Você vê o contato dele depois que ele aceita (Termos de Uso, cláusulas 4.4 e 5.1). |
| 3.3 | Analisar o cadastro do profissional (documentos, CPF ou CNPJ, registro no conselho) | B, C | Art. 7º, V. Quando a regra da ocupação exige registro, também art. 7º, II [CONDICIONAL] | A análise e a aprovação são feitas por administrador do WorkEasy. Não são automáticas. Q3. |
| 3.4 | Verificar identidade com documento e selfie | C | Art. 11, II, "g" (prevenção à fraude e segurança do titular em processos de identificação e autenticação de cadastro em sistemas eletrônicos, ressalvados os direitos e liberdades que prevaleçam) [CONDICIONAL] | O código lido guarda o documento e a selfie para análise. Não encontrei comparação facial automática [a confirmar]. Q2. |
| 3.5 | Analisar a certidão de antecedentes criminais, quando a ocupação exige | C | Consentimento (art. 7º, I), na finalidade "Consulta de antecedentes", ou outra base [CONDICIONAL] | Pelo texto dos Termos de Uso, o WorkEasy usa a certidão que o profissional envia e não consulta bases por conta própria [a confirmar no processo de análise]. Q3. |
| 3.6 | Cobrar, repassar e manter registros de pagamento | D, E, F | Art. 7º, V (contrato) e art. 7º, II (obrigação fiscal) | Prazo de guarda: [incerto]. Q11. |
| 3.7 | Enviar mensagens sobre seus pedidos, atendimentos, pagamentos, orçamentos e plantões, por WhatsApp ou e-mail | I | Art. 7º, V | Só para o contato confirmado no login. |
| 3.8 | Enviar novidades e ofertas | A, I | Art. 7º, I (consentimento) | Opcional e revogável em "Consentimentos" (seção 8). Mensagens sobre os seus pedidos não dependem dele. |
| 3.9 | Registrar localização no check-in e check-out de plantão | K | Art. 7º, I (consentimento) | Opcional. O app pergunta antes de ler a posição. Se você não aceitar, o registro segue sem coordenadas. Revogável. |
| 3.10 | Organizar a linha Cuidado (casa, pessoa cuidada, plantões, relatório) | G | Art. 7º, V (contrato com a família) | Dados de saúde não entram no cadastro, mas o texto livre pode trazê-los. Art. 11 e art. 14: Q2 e Q5. [CONDICIONAL] |
| 3.11 | Segurança, prevenção à fraude e registro de ações | J | Art. 7º, II, para os registros de acesso exigidos pelo art. 15 do Marco Civil da Internet, se aplicável (Q7). Art. 7º, IX (legítimo interesse) para o restante, com teste de balanceamento documentado [PLANEJADO] | Q4 e Q7. |
| 3.12 | Atender pedidos de titular e guardar a prova do seu aceite e dos consentimentos | H | Art. 7º, II [CONDICIONAL] | Q12. |
| 3.13 | Assistentes com IA: sugestão de orçamento para o prestador, resumo semanal da linha Cuidado e, sem tela, assistente de pedidos | E, G, L | Art. 7º, V, quando você usa a função a seu pedido [CONDICIONAL: depende de parecer; Q2 e Q9] | Seção 12. Só funcionam com chave de IA configurada no servidor. |

3.14. **O que acontece se você não quiser.** (art. 18, VIII, LGPD)
- Você pode recusar as finalidades 3.8 e 3.9 sem perder o uso do app. A recusa da 3.9 faz o registro seguir sem localização.
- Os Termos de Uso e esta Política são necessários para criar a conta. O aceite fica registrado com data, hora e versão.
- Sem o cadastro de documentos aprovado, o profissional não aparece na busca e não recebe pedidos.

---

## 4. Com quem compartilhamos

### 4.1. Fornecedores que tratam dados em nosso nome

| Fornecedor | O que recebe | Para quê | Papel descrito pelo fornecedor (texto aberto em 08/11/2026) | Onde | Estado |
|---|---|---|---|---|---|
| **Supabase** (banco de dados, arquivos, login, funções do servidor, agendamento) | Todos os dados das seções 2 e 6 | Hospedagem da aplicação | Processador dos dados de clientes da plataforma, com remissão a um *data processing addendum*; controlador dos dados de conta que trata por conta própria (texto aberto em 08/11/2026) | A política aberta fala em armazenamento nos EUA e em outros países, e em transferências para os EUA e Singapura. Não há região fixada no código. | Região e contrato [a confirmar]. Q8. |
| **Asaas** (pagamentos, contas de recebimento, cobranças e repasses) | Profissional: nome, e-mail, CPF ou CNPJ, data de nascimento, celular, renda informada, endereço. Cliente: nome, CPF ou CNPJ, e-mail, celular. Valor, status e dados do pagamento. | Cobrança, repasse e registro fiscal | [incerto]: a política do Asaas não pôde ser aberta nesta sessão | [incerto] | [CONDICIONAL] Q10. |
| **Resend** (e-mail transacional) | E-mail do destinatário e conteúdo da mensagem | Enviar e-mails | Diz ser "Data Controller" dos dados da conta do próprio cliente. Não diz o papel para os dados de destinatário enviados pela API. | Estados Unidos. O texto diz que transfere os dados para os Estados Unidos e que o processamento ocorre lá, sem nomear mecanismo. | Sem menção à LGPD ou ao Brasil. Q8. |
| **WhatsApp Cloud API (Meta)** | Telefone do destinatário e parâmetros do modelo de mensagem (nome da ocupação, nome da outra parte, bairro, quem pagou) | Enviar mensagens por WhatsApp | Nos Termos do WhatsApp Business (última atualização 22/08/2025), a empresa é controladora e o WhatsApp é operador | Não encontrei menção ao Brasil nesses termos. Usa um "Global Data Transfer Addendum" aplicável às leis nele listadas. | [CONDICIONAL] Q8. |
| **Anthropic** (IA: sugestão de orçamento, resumo semanal da linha Cuidado e, sem tela, assistente de pedidos) | Orçamento: a descrição do serviço e os preços de referência. Resumo: textos dos relatórios da semana, com o nome da pessoa cuidada trocado por marcador e sem os relatórios que mencionam saúde. Pedido: o texto digitado, quando a função tiver tela | Organizar orçamento e resumo; organizar o pedido (ocupação, urgência, resumo) | Página de ajuda do fornecedor (privacy.claude.com), aberta em 08/11/2026: entradas e saídas da API são apagadas no prazo de 30 dias, por padrão, com exceções (até 2 anos quando a conversa é sinalizada por violação da política de uso; 5 anos para feedback enviado). Não diz se há treinamento nem onde os dados são processados | [incerto] | [CONDICIONAL: depende de chave de IA no servidor e de parecer. Q9]. O assistente de pedidos não tem tela hoje [PLANEJADO]. |
| **Cloudflare Pages** (site estático, se for o destino do deploy) | Endereço IP e registros de acesso ao site, como em qualquer servidor de páginas | Entregar o site | Texto do fornecedor não aberto nesta revisão | [incerto] | [a confirmar no deploy]. O comentário de `scripts/check-headers.mjs` cita Cloudflare Pages para `public/_headers`. Q8. |
| **Sentry** (relatório de erros; só se o site for publicado com a chave de relatório configurada) | Erros do app: rastro de execução, endereço sem parâmetros e versão. O app mascara e-mail, CPF, CNPJ e telefone, e não envia dados do usuário, cookies, cabeçalhos, corpos de requisição nem o conteúdo de formulários | Localizar e corrigir falhas | Política do Sentry: controlador só dos dados da conta; os dados de eventos são tratados como do cliente (contrato de cliente não aberto) | EUA e Alemanha (texto aberto); cláusulas-padrão da UE; sem menção ao Brasil | [CONDICIONAL: depende de a chave estar configurada no site publicado]. Q16. |
| **Cloudflare** | Não há uso no código lido | — | — | — | [a confirmar]. Retire esta linha se não houver uso no deploy. |

4.1.1. Os fornecedores acima recebem só o necessário para a função deles. Nenhum deles recebe o número do cartão.

4.1.2. Não há anúncios de terceiros nem ferramenta de análise de uso de terceiros no código lido. Há medição interna de eventos (seções 2.1, J, e 6) e relatório de erros opcional (seção 11.4).

### 4.2. Outras pessoas que veem seus dados

- **Profissional**: vê nome, telefone e cidade do perfil do cliente quando o cliente pede horário ou aceita proposta.
- **Cliente**: vê nome e cidade do profissional desde o pedido ou a proposta. Vê o telefone e os dados de contato do perfil dele depois que o profissional aceita (Termos de Uso, cláusulas 4.4 e 5.1).
- **Família e cuidador**: o cuidador vê o primeiro nome da pessoa cuidada e o bairro da casa. Não vê contato, preferências nem o valor pago pela família. A família vê o perfil do cuidador só depois que ele aceita o plantão.
- **Equipe do WorkEasy**: vê o que a função de administrador precisa para analisar cadastro, disputas e pagamentos. Essas ações ficam no registro de ações.
- **Operação por WhatsApp**: na página de pedido, o app monta uma mensagem de WhatsApp para o número da operação configurado no site. Quem envia é você, pelo próprio WhatsApp. A mensagem leva o serviço, o bairro e a cidade, o prazo e a urgência informados, a descrição do pedido e o nome, se você tiver preenchido (código: `pages/cliente/concierge.ts`).
- **Autoridades**: quando a lei ou uma ordem judicial exigir. Os registros de acesso só são entregues com autorização judicial (Marco Civil da Internet, art. 15, § 3º).

4.3. A política não prevê venda de dados pessoais. [CONDICIONAL: confirmar com a empresa.]

---

## 5. Transferência para fora do Brasil

5.1. Alguns fornecedores guardam ou processam dados fora do Brasil: Supabase (EUA e Singapura, pelo texto aberto) e Resend (EUA), pelo que li nos textos deles; Anthropic (sugestão de orçamento e resumo semanal, quando a chave de IA estiver configurada; local não informado); Sentry (EUA e Alemanha, se o relatório de erros estiver ativo); Meta e Asaas, [incerto].

5.2. A LGPD permite a transferência internacional só nos casos do art. 33 (incisos I a IX). Entre eles: país com nível de proteção adequado; garantias do controlador, como cláusulas contratuais específicas, cláusulas-padrão ou normas corporativas globais; consentimento específico e em destaque, com aviso prévio do caráter internacional (art. 33, VIII).

5.3. O regulamento da ANPD (Resolução CD/ANPD nº 19/2024, Anexo I, art. 1º, II) reconhece três instrumentos de garantia: cláusulas contratuais específicas, cláusulas-padrão contratuais e normas corporativas globais. As cláusulas-padrão precisam ser adotadas integralmente e sem alteração (Anexo I, art. 16).

5.4. Mecanismo escolhido para cada fornecedor: **[CONDICIONAL: depende de parecer. Q8.]** Texto a usar quando houver decisão:

> Quando seus dados saírem do Brasil, a transferência segue o mecanismo de [MECANISMO] com [FORNECEDOR], conforme o art. 33 da Lei 13.709/2018 e a Resolução CD/ANPD nº 19/2024.

5.5. Nos textos que li, Supabase cita cláusulas-padrão aprovadas pela Comissão Europeia, não as da ANPD. Resend e os termos da Meta não citam a LGPD nem as cláusulas-padrão da ANPD. A página de Cloud API da Meta cita a LGPD só numa pergunta de FAQ, sem detalhar o mecanismo.

---

## 6. Por quanto tempo guardamos

| Dado | Enquanto a conta existe | Depois da exclusão (seção 7) |
|---|---|---|
| Nome, telefone e e-mail do perfil | Até você editar ou excluir a conta | Nome e telefone são apagados. O perfil sai com o login. |
| Arquivos de documentos do profissional | Você pode apagar arquivo que ainda não foi analisado. Arquivo já analisado fica até a exclusão. | Apagados. A pasta é esvaziada antes da anonimização. |
| Pedidos | Abertos até o vencimento: 7 dias por padrão, no máximo 30. Depois ficam fechados. | Descrição trocada por texto padrão e datas preferidas apagadas antes; depois o pedido sai com o login (cascata do banco). |
| Propostas | Enquanto existirem | Apagadas com o login (cascata a partir do pedido e do prestador). |
| Atendimentos e eventos | Enquanto existirem | Mantidos sem identificação. Observações, motivos de cancelamento e motivos de evento são apagados. |
| Avaliações | Enquanto existirem | Nota mantida. Comentário apagado. |
| Pagamentos | Enquanto existirem | Mantidos. O registro do Asaas fica só com os campos fiscais (número, status, valor, datas, número da nota). Links e códigos de pagamento são apagados. |
| Casa, pessoa cuidada, plantões, check-ins e relatórios da família | Enquanto existirem | Apagados junto com a casa ou com a conta de quem a criou. |
| Coordenadas de check-in do cuidador | Enquanto existirem | Apagadas quando a conta do cuidador é excluída. |
| Mensagens | Enquanto existirem | Pendentes são apagadas; telefone, e-mail e parâmetros são apagados antes; o restante sai com o login. |
| Consentimentos | Histórico completo | Apagados com a conta (Q12). |
| Pedidos de cópia e de exclusão | Registro | Mantido sem vínculo com a conta. |
| Registro de ações (`audit_log`) | Sempre | Mantido. O código da conta continua. Texto livre digitado pela equipe não é apagado. |
| Eventos de funil (medição interna do produto) | Até 400 dias, com apagamento automático diário | Mantidos sem o código da conta (fica nulo). Não guardam nome, telefone, e-mail nem texto livre. |
| Conteúdo de mensagens na Meta | — | Até 30 dias, segundo a Meta. Identificadores de envio são apagados em até 30 dias após o último status. |
| Mensagens no Resend | — | Prazo não informado no texto aberto. |
| Cópias de segurança e registros do Supabase | — | [incerto]. Q13. |
| Registro fiscal de pagamento | — | Prazo a definir [incerto]. Q11. |

---

## 7. Exclusão da conta: o que é apagado e o que fica

7.1. **Como excluir.** Em "Excluir minha conta", na página Conta, digite EXCLUIR e confirme.

7.2. **Quando a exclusão é recusada.** Se você tem atendimento aceito, pago, em andamento ou em contestação, a exclusão é recusada. Conclua ou cancele esses atendimentos e tente de novo.

7.3. **O que o app faz**, nesta ordem:
1. Cancela sua assinatura Pro e as cobranças em aberto no Asaas.
2. Apaga os arquivos de documentos do profissional.
3. Anonimiza os seus dados e os registros que ficam.
4. Apaga o login.

7.4. **Apagado**: nome e telefone do perfil; comentário das avaliações; observações e motivos de cancelamento; pedidos, propostas e orçamentos; casas, pessoas cuidadas, plantões e relatórios da família; documentos; mensagens; consentimentos; sua lista de clientes. Antes de sair, são trocados por texto padrão a descrição dos pedidos e os nomes dos clientes na sua lista, que também perdem telefone e e-mail. Os itens ligados ao seu login saem com ele, pela própria exclusão em cascata do banco.

7.5. **Fica sem identificar você**: atendimentos e eventos; pagamentos, só com os campos fiscais (o nome, o CPF ou CNPJ e o e-mail do pagador são retirados); notas de avaliação; eventos de funil, sem o código da conta; o pedido de exclusão. O registro de ações permanece com o código da conta. O motivo: obrigação fiscal [prazo e base a confirmar, Q11] e a imutabilidade do registro de ações.

7.6. **Fora do alcance do app**: cópias de segurança e registros mantidos pelos fornecedores (Supabase, Meta, Resend, Asaas e Sentry, se ativo). Prazos [incerto]. O cadastro de cliente no Asaas não é removido pelo app (Q10).

---

## 8. Seus direitos e como exercê-los

8.1. A LGPD dá a você os direitos do art. 18, incisos I a IX. Veja como exercer cada um:

| Direito (art. 18, LGPD) | Como exercer | Prazo |
|---|---|---|
| I. Confirmação de tratamento; II. Acesso | Em "Cópia dos seus dados", na página Conta, baixe um arquivo JSON com os seus dados. O arquivo não inclui o registro de ações nem os eventos de funil (Q18) | Na hora, no app |
| III. Correção | Em "Seus dados", corrija nome, telefone e cidade. Para os demais dados, peça pelo SAC | Prazo da seção 8.3 |
| IV. Anonimização, bloqueio ou eliminação de dados desnecessários ou em desacordo | Pelo SAC | Prazo da seção 8.3 |
| V. Portabilidade | O arquivo JSON de "Cópia dos seus dados". É formato próprio do WorkEasy, não um padrão regulamentado [incerto] | Na hora, no app |
| VI. Eliminação dos dados tratados com o seu consentimento | Excluir a conta (seção 7) ou revogar o consentimento. Há exceções para a guarda por obrigação legal (art. 16) | Na hora, no app, ou prazo da seção 8.3 |
| VII. Informação sobre compartilhamento | Seção 4 desta política | — |
| VIII. Informação sobre não consentir | Seção 3.14 | — |
| IX. Revogação de consentimento | Em "Consentimentos", na página Conta, revogue "Comunicações de novidades", "Consulta de antecedentes" ou "Localização" | Na hora, no app |

8.2. Os termos "Termos de Uso" e "Política de Privacidade" não são revogáveis no app. Sem esse aceite não há conta.

8.3. **Prazo para os pedidos pelo SAC.** A declaração clara e completa do art. 19, II, da LGPD tem prazo de até 15 dias contados do pedido. Para agente de pequeno porte, a Resolução CD/ANPD nº 2/2022 (art. 14, III) dobra esse prazo [CONDICIONAL: Q15].

8.4. Canal: [E-MAIL DO SAC]. Encarregado: [E-MAIL DO ENCARREGADO] (seção 13).

8.5. Se a resposta não atender você, pode peticionar à ANPD contra a empresa, como prevê o art. 18, § 1º, da LGPD.

---

## 9. Segurança

9.1. **Medidas que existem no código hoje** (`supabase/` e `docs/ARQUITETURA.md`):
- Todas as tabelas têm regras por linha (RLS). Cada pessoa lê o que é seu. O administrador lê o que a função dele precisa.
- Os documentos do profissional ficam em área de armazenamento privada, legível só pelo próprio profissional e pela equipe.
- Chaves secretas (Asaas, WhatsApp, e-mail, IA e chave de serviço) ficam só nas funções do servidor. O app do navegador recebe apenas a chave pública.
- A chave da conta de recebimento de cada profissional fica no cofre de segredos do Supabase (Vault), acessado só pelo servidor.
- O número do cartão não passa pelo app.
- O registro de ações não pode ser alterado nem apagado, nem pela equipe.
- As mensagens só vão para e-mail ou telefone que você confirmou no login.

9.2. **O que isto não é.** Nenhuma medida elimina todo risco. Não há certificação de segurança, auditoria independente nem teste de invasão registrados no repositório em 08/11/2026. O app não foi implantado e não tem usuários reais.

9.3. **Incidente de segurança.** Se houver incidente que possa causar risco ou dano relevante a você, comunicaremos a ANPD e você, como manda o art. 48 da LGPD. [incerto: o prazo e o conteúdo do Regulamento de Comunicação de Incidente de Segurança (Resolução CD/ANPD nº 15, de 24/04/2024, citada no art. 14, II, da Resolução nº 2/2022) não foram lidos. A página da Resolução nº 2/2022 tem uma observação com data de 25/04/2024.]

---

## 10. Crianças, adolescentes e pessoas cuidadas

10.1. **O WorkEasy não é para crianças e adolescentes.** Para criar conta, é preciso ter 18 anos completos (Termos de Uso, cláusula 3.3). **Hoje o app não confere a idade.** Vale a sua declaração ao aceitar os Termos.

10.2. Serviços para crianças, como babá ou reforço escolar, são contratados por um adulto responsável.

10.3. **A pessoa cuidada pode ser criança ou adolescente.** Nesse caso, o adulto responsável é quem informa os dados. [PLANEJADO: pergunta de idade e declaração do responsável no cadastro da pessoa cuidada.] O cadastro atual aceita qualquer nome e ano de nascimento. [CONDICIONAL: o art. 14, § 1º, da LGPD pede consentimento específico e em destaque de um dos pais ou do responsável legal para tratar dados de criança. O enunciado da ANPD sobre o tema (publicado em 24/05/2023) admite as bases dos arts. 7º e 11, desde que prevaleça o melhor interesse. Q5.]

10.4. **Lei 15.211/2025 (ECA Digital).** A lei se aplica a produto ou serviço de tecnologia direcionado a crianças e adolescentes ou de "acesso provável" por eles (art. 1º, caput). Para isso, o texto considera a probabilidade de uso e a atratividade, a facilidade de acesso e o risco à privacidade ou ao desenvolvimento (art. 1º, parágrafo único, I a III). [CONDICIONAL: se o WorkEasy se enquadra, depende de parecer. Q6. O texto da Câmara indica vigência em 17/03/2026.]

---

## 11. Cookies, armazenamento no aparelho e rastreadores

11.1. **Sessão de login.** A biblioteca de autenticação do Supabase guarda a sessão no navegador ou no aparelho (configuração `persistSession: true`). A sessão some quando você sai da conta. [a confirmar na versão instalada da biblioteca]

11.2. **Rascunho do pedido.** O formulário de pedido fica guardado na sessão do navegador (`sessionStorage`, chave `workeasy:pedido-rascunho`) para não se perder ao entrar na conta. É apagado ao sair e ao excluir a conta.

11.3. **Localização.** O navegador ou o aparelho pede permissão ao sistema. O app não guarda posição fora do check-in e do check-out de plantão.

11.4. **Publicidade e rastreadores.** Não encontrei, no código lido em 08/11/2026, pixels de publicidade nem ferramentas de análise de uso de terceiros. A busca incluiu gtag, fbq, pixel, google-analytics e posthog. Há dois itens que não são pixel: (a) a medição interna de eventos de funil (seção 6); (b) o relatório de erros do Sentry, que só roda se o site for publicado com a chave de relatório configurada. Nesse caso, o app mascara e-mail, CPF, CNPJ e telefone e não envia dados do usuário, cookies nem o conteúdo de formulários (Q16). [a confirmar na versão publicada]

---

## 12. Assistentes com IA

12.1. Hoje há três funções com IA no servidor. Duas têm tela: a sugestão de orçamento, para o prestador, e o resumo semanal, para a família na linha Cuidado. Elas enviam texto à Anthropic (seção 4.1) e só funcionam com a chave de IA configurada. A terceira, o assistente de pedidos, não tem tela [PLANEJADO].

12.2. **Se for ligado**, o texto que você digitar no pedido será enviado à [PROVEDOR DE IA] para organizar o pedido (ocupação, urgência e resumo). Você confere o resultado antes de enviar o pedido.

12.3. **Antes de ligar**: [CONDICIONAL: Q9.] Texto a usar:

> Se você usar o assistente, o texto que digitar será enviado à [PROVEDOR DE IA], que o processa para organizar o pedido. Segundo o fornecedor, as entradas e saídas são apagadas no prazo de 30 dias, salvo exceções previstas no contrato e na lei. Não digite dados de saúde, documentos nem informações de terceiros no texto.

12.4. **Orçamento e resumo semanal (já no código).** Ao usar a sugestão de orçamento, a descrição do serviço vai à Anthropic. Ao pedir o resumo da semana, os textos dos relatórios de plantão vão à Anthropic, com o nome da pessoa cuidada trocado por marcador e sem os relatórios que mencionam saúde. [CONDICIONAL: depende de chave de IA no servidor e de parecer. Q2 e Q9.] Texto a usar:

> Se você pedir o resumo semanal ou a sugestão de orçamento, o texto correspondente será enviado à Anthropic para ser organizado. O nome da pessoa cuidada não segue no texto, e relatórios que mencionam saúde não são enviados. Segundo o fornecedor, as entradas e saídas são apagadas em até 30 dias, salvo exceções. Não escreva dados de saúde nos relatórios.

---

## 13. Encarregado e canal

13.1. Pedidos, dúvidas e reclamações: [E-MAIL DO SAC].

13.2. Encarregado pelo tratamento de dados: [E-MAIL DO ENCARREGADO]. [CONDICIONAL: a indicação é obrigatória ou dispensada conforme Q15.]

---

## 14. Mudanças nesta política

14.1. Quando o texto mudar de forma que afete os consentimentos, a versão muda e o app pede novo aceite. A etiqueta da versão está em `apps/web/config/legal.ts` (`CONSENT_VERSIONS`).

14.2. Versões anteriores ficam publicadas com a data em que cada uma valeu. [PLANEJADO]

14.3. Data de vigência desta versão: [DATA DE VIGÊNCIA].

---

## Anexo A. Resumo para os formulários das lojas (rascunho)

Use este resumo para preencher a declaração de privacidade da Google Play e da App Store. Só depois de resolver Q2, Q5, Q6, Q8, Q9 e Q16.

- **Contato**: nome, e-mail e telefone da conta. Usado para entrar, para as mensagens do app e para o contato do suporte.
- **Identificação e documentos**: CPF ou CNPJ; documento com foto e selfie (só profissional); certidão de antecedentes, quando a ocupação exige; registro no conselho.
- **Informações financeiras**: dados de pagamento e de conta de recebimento tratados pelo Asaas. O número do cartão não passa pelo app.
- **Localização**: precisa, opcional e com consentimento, só no check-in e check-out de plantão.
- **Conteúdo criado pelo usuário**: pedidos, propostas, avaliações, relatórios de plantão.
- **Dados de saúde**: não coletamos de propósito. O texto livre pode trazer informação de saúde. [CONDICIONAL: Q2]
- **Publicidade e rastreamento**: nenhum de terceiros encontrado no código lido. Relatório de erros (Sentry) só se configurado. [a confirmar]
- **Compartilhamento com fornecedores**: Supabase, Asaas, Resend, Meta (WhatsApp) e Sentry (se configurado). [+ Anthropic: sugestão de orçamento e resumo semanal, com chave de IA configurada]
- **Exclusão**: pelo próprio app (seção 7).

---

## Pontos para o advogado

**Q1. Papel de cada parte.** O texto diz que a empresa é controladora (1.2). Confirme o papel para: (a) cadastro, pedidos e atendimentos; (b) lista de clientes e orçamentos que o profissional digita; (c) dados da pessoa cuidada e relatórios, digitados pela família e pelo cuidador; (d) dados do cliente enviados ao Asaas em nome dele; (e) clientes e orçamentos digitados pelo prestador, que são dados de terceiros (grupo L). O papel define o registro de operações (art. 37), quem responde a pedido do titular e quem informa o compartilhamento (art. 9º, V).

**Q2. Dados sensíveis.** (a) A selfie com documento é dado biométrico quando ligada à pessoa (art. 5º, II). A base proposta é o art. 11, II, "g". O código lido guarda a foto e a selfie para revisão pelo administrador; não encontrei comparação facial automática. Confirme esse fato. (b) Os campos de texto livre (preferências, contato de emergência, relatório, pedido, avaliação) podem trazer dado de saúde. Opções: aviso e limite na tela; consentimento específico e em destaque (art. 11, I, não aberto nesta revisão); ou guardar só o mínimo. (c) O resumo semanal envia à Anthropic textos de relatórios de plantão que podem trazer informação de saúde. O filtro do app não envia relatório que mencione saúde, mas o filtro é por palavras, não por análise. Confirme se esse desenho basta ou se o resumo precisa de base própria.

**Q3. Certidão de antecedentes.** A certidão não consta da lista do art. 5º, II. A base pode ser consentimento (art. 7º, I), obrigação regulatória (art. 7º, II, se o conselho exigir) ou contrato (art. 7º, V). Um consentimento dado como condição para o serviço é adequado? Muitas políticas de ocupação ainda estão marcadas como a_confirmar (ARQUITETURA.md, `occupation_policies.confidence`).

**Q4. Legítimo interesse.** A segurança e a prevenção à fraude podem usar o art. 7º, IX. Isso exige teste de balanceamento documentado. Quem faz, quando e onde fica guardado?

**Q5. Pessoa cuidada menor de 18 anos.** Opções: (a) proibir no cadastro; (b) aceitar com declaração do responsável e consentimento específico e em destaque (art. 14, § 1º), com finalidade própria em `consents`; (c) usar as bases dos arts. 7º e 11 com melhor interesse prevalecente, como sugere o enunciado da ANPD [número não consta na página de notícia, de 24/05/2023; o PDF não foi aberto].

**Q6. ECA Digital (Lei 15.211/2025).** O WorkEasy é produto de "acesso provável" por crianças e adolescentes (art. 1º, parágrafo único, I a III)? Argumentos a favor de não ser: cadastro de 18 anos ou mais e serviço não direcionado. Argumentos contra: facilidade de acesso e interesse em serviços de cuidado. O texto da Câmara, reaberto nesta revisão, diz no art. 41-A: "Esta Lei entra em vigor em 17 de março de 2026", com a nota "Artigo acrescido pela Lei nº 15.352, de 25/2/2026". A mesma página traz notas de alteração posteriores (por exemplo, Lei nº 15.504, de 15/9/2026, no art. 36-A). Confirme a vigência e a versão consolidada no Planalto e no DOU. Também: o guia da ANPD sobre o escopo foi publicado no fim de outubro de 2026; a data é incerta (I8).

**Q7. Marco Civil da Internet, art. 15.** Como pessoa jurídica que exerce atividade de forma organizada, profissional e com fins econômicos, a empresa deve manter registros de acesso às aplicações pelo prazo de 6 meses, sob sigilo, em ambiente controlado e de segurança, nos termos do regulamento. Confirme a aplicação. Defina quem guarda os registros e onde. A definição do art. 5º, VIII, lida nesta revisão, é "o conjunto de informações referentes à data e hora de uso de uma determinada aplicação de internet a partir de um determinado endereço IP". Hoje o código não grava IP. O § 3º do art. 15 trata da entrega dos registros, que exige autorização judicial, como a seção 4.2 diz.

**Q8. Transferência internacional, por fornecedor.** Supabase: EUA e Singapura, com cláusulas-padrão da Comissão Europeia e sem menção à LGPD no texto aberto. Resend: EUA, sem mecanismo nomeado; a política trata a aceitação dela como concordância com a transferência (ponto a avaliar). Meta: termos sem menção ao Brasil. Sentry: EUA e Alemanha, com cláusulas da UE. Anthropic: local não informado. Asaas: [incerto]. Opções: cláusulas-padrão da ANPD adotadas integralmente (Resolução nº 19/2024, Anexo I, art. 16 e Anexo II); cláusulas contratuais específicas (art. 33, II, "a"); consentimento específico e em destaque (art. 33, VIII), que pode ser inadequado para tratamento rotineiro. A Resolução nº 19/2024 deu prazo de 12 meses, contados da publicação em 23/08/2024, para incorporar as cláusulas (art. 2º, parágrafo único). Contado da publicação no DOU (23/08/2024), esse prazo terminou por volta de 23/08/2025 (cálculo nosso). Se e como ele vale para uma empresa nova, é decisão sua [incerto].

**Q9. Anthropic.** (a) A página aberta (1º de julho de 2026) não diz se os dados da API são usados para treinamento nem onde são processados. Confirme no contrato comercial e no DPA. (b) Defina o mecanismo de transferência. (c) Decida o aviso na tela antes do envio, para orçamento e resumo, que já estão no código. (d) A página também prevê retenção de até 2 anos quando a conversa é sinalizada por violação da política de uso, e de 5 anos para feedback enviado. Decida se isso entra na política. (e) Atualize as seções 4.1 e 12 antes de publicar, porque as funções já estão no código.

**Q10. Asaas.** A política não pôde ser aberta (HTTP 403). Confirme: (a) se o Asaas é operador ou controlador dos dados de cadastro do profissional e do pagador; (b) prazo de guarda; (c) se a conta do cliente no Asaas é removida na exclusão (hoje não é); (d) onde o Asaas hospeda os dados.

**Q11. Prazo fiscal.** Hoje pagamentos e atendimentos são mantidos sem identificação. A base é o art. 16, I (obrigação legal) e o prazo vem da lei tributária. Defina o prazo com o contador e com o advogado. Não cite prazo sem fonte.

**Q12. Prova do aceite após a exclusão.** Consentimentos e pedidos de titular são apagados em cascata com o login. O `audit_log` mantém o código da conta, sem chave estrangeira. Decida se a prova do aceite deve sobreviver à exclusão, por quanto tempo e com que base (art. 16, I). Decida também se o texto livre digitado pela equipe no registro de ações pode ser reduzido.

**Q13. Cópias de segurança e logs.** Prazo de retenção de backups e logs do Supabase. Confirme se a exclusão chega às cópias e em quanto tempo (art. 16 e art. 18, IV).

**Q14. Comissão e pagamento retido.** Ambos estão desligados (`platform_settings`: `commission_enabled` e `escrow_enabled` = `false`). Qualquer cláusula sobre eles é [CONDICIONAL]. A cobrança do cliente já é dividida com a conta do profissional no Asaas (`payments-create`, split). Revise essa redação.

**Q15. Porte e encarregado.** A Resolução CD/ANPD nº 2/2022 dispensa o encarregado (art. 11) apenas para agente de pequeno porte. Ela exclui o agente que faz tratamento de alto risco (art. 3º, I). O alto risco exige um critério geral (larga escala ou afetar significativamente direitos) e um específico, que inclui dado sensível, de crianças, de adolescentes ou de idosos (art. 4º). O limite de receita bruta está no art. 3º, II, da LC 123/2006 [valor não conferido]. A dispensa do art. 11 não elimina o canal com o titular (art. 41, § 2º, I). Decida se a empresa indica encarregado desde o início (art. 41) e se usa os prazos em dobro (art. 14).

**Q16. Relatório de erros (Sentry).** Só roda se o site for publicado com a chave configurada. Se for ligado: (a) confirme o papel: o texto aberto trata os dados de eventos como do cliente (contrato não aberto), sem falar em operador; (b) confirme a região (EUA e Alemanha no texto aberto) e o contrato; (c) confirme o mascaramento de e-mail, CPF, CNPJ e telefone e a lista de dados enviados.

**Q17. Medição interna (`product_events`).** Não é terceiro, mas trata dados de uso: tipo do passo, data e identificadores de pedido, atendimento ou assinatura, sem nome, telefone, e-mail ou texto livre. Apaga-se sozinho em 400 dias (cron diário). Após a exclusão, o código do usuário fica nulo. Confirme a base (art. 7º, IX, com teste de balanceamento, ou outra) e se o registro entra na seção 3.

**Q18. Cópia dos dados (art. 18, II e V).** O arquivo de "Cópia dos seus dados" não inclui o registro de ações (`audit_log`) nem os eventos de funil. Confirme se isso atende ao art. 18, II, ou se os dados que identificam o titular devem entrar no arquivo.

**Q19. Exclusão em cascata.** Ao excluir o login, o banco apaga por cascata pedidos, propostas, orçamentos, clientes do prestador, casa, linha Cuidado e notificações. Mantém atendimentos e pagamentos sem identificação. A seção 6 foi reescrita nesse sentido. Confirme se propostas e pedidos precisam de prazo próprio, por exemplo para disputa (art. 16, I).

---

## Itens [incerto]

| # | Item | Motivo |
|---|---|---|
| I1 | Papel, prazo de guarda e local de hospedagem do Asaas | Política não aberta (HTTP 403). Os resultados de busca são só pistas. |
| I2 | Prazo fiscal de guarda de pagamentos e atendimentos | Não consultei a lei tributária. |
| I3 | Região, backups e logs do Supabase | Não há região no código. Não há texto de backup no documento aberto. |
| I4 | Treinamento com dados da API e local de processamento da Anthropic | A página aberta não diz. |
| I5 | Mecanismo de transferência da Meta para o Brasil | Nos textos abertos (Cloud API e termos de negócio) não há mecanismo nomeado para o Brasil. A FAQ da Cloud API cita a LGPD sem detalhar. |
| I6 | Prazo e conteúdo da comunicação de incidente (Resolução nº 15/2024) | Citada pela Resolução nº 2/2022, não aberta. |
| I7 | Número do enunciado da ANPD sobre crianças e adolescentes, e texto integral | A página de notícia (24/05/2023) não informa o número. O PDF (Enunciado1ANPD.pdf) não foi aberto. |
| I8 | Data do guia da ANPD sobre o ECA Digital | A página indica 29/10/2026 e o texto diz "quarta-feira (28)". |
| I9 | Art. 8º e art. 11, I da LGPD | Não abertos nesta revisão. Conferidos: art. 5º, VIII do Marco Civil; art. 5º, II, art. 11, II, "g" (só o início), art. 14, § 1º, art. 16, art. 18 e § 1º, art. 19, II, art. 33, VIII e art. 48 da LGPD. |
| I10 | Valor do limite de receita bruta da LC 123/2006 | Não consultado. |
| I11 | Vigência do ECA Digital | Texto da Câmara: art. 41-A, vigência em 17/03/2026, acrescido pela Lei nº 15.352, de 25/2/2026. Confirmar no Planalto e no DOU. |
| I12 | Retificação da Resolução nº 19/2024 (DOU de 18/08/2025; cláusula 15.4(b) do Anexo II) | A página confirma a retificação. O texto retificado não foi aberto. |
| I13 | Art. 14, II da Resolução nº 2/2022 e data da Resolução nº 15/2024 | A redação atual cita a Resolução nº 15, de 24/04/2024. Uma observação da própria página diz 25/04/2024. O regulamento não foi aberto. |
| I14 | Uso da Cloudflare Pages | O comentário de `scripts/check-headers.mjs` cita Cloudflare Pages para `public/_headers`. Não confirmado no deploy. |
| I15 | Sentry: papel, região e contrato de cliente | Texto aberto: dados de eventos sob controle do cliente; EUA e Alemanha. O contrato de cliente não foi aberto. |

---

## Fontes consultadas

Todas abertas em 08/11/2026, salvo indicação.

| # | Fonte (URL) | Norma e trecho lido | Observação |
|---|---|---|---|
| 1 | https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-publicacaooriginal-156212-pl.html | Lei 13.709/2018 (LGPD): art. 5º, I, II, V, VI; art. 6º, caput e I, II, III, VI, VII, X; art. 7º, caput e I, II, V, VI, IX, X; art. 9º, caput e I a V; art. 11, caput e II (a a g); art. 14, caput e § 1º; art. 16, caput e I a IV; art. 18, caput e I a IX; art. 19, I e II; art. 33, caput e I a IX; art. 34; art. 35, caput e § 1º; art. 36; art. 37; art. 38, caput; art. 41, caput e § 2º; art. 48, caput | Planalto bloqueado para o bot ("requisição bloqueada") em 08/11/2026. Texto obtido da publicação original da Câmara. |
| 2 | https://www2.camara.leg.br/legin/fed/lei/2014/lei-12965-23-abril-2014-778630-normaatualizada-pl.html | Lei 12.965/2014 (Marco Civil): art. 15, caput e §§ 1º a 4º | Texto atualizado. |
| 3 | https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024 | Resolução CD/ANPD nº 19/2024: Anexo I, art. 1º, I e II; art. 9º, II; art. 16. Art. 2º, parágrafo único, prazo de 12 meses. Anexo II (cláusulas-padrão). | A página diz DOU de 23/08/2024. Página modificada em 16/09/2026. A página do DOU retornou 502. |
| 4 | https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022 | Resolução CD/ANPD nº 2/2022: art. 3º, I e II; art. 4º, I e II, d; art. 6º; art. 11, caput, § 1º e § 2º; art. 14, I a IV | Texto de anexo, com ressalvas de extração (ver I13). A página do DOU retornou 502. |
| 5 | https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes | Enunciado da ANPD sobre o tratamento de dados de crianças e adolescentes (página de notícia, publicada em 24/05/2023) | O texto do enunciado está no PDF, não aberto (I7). |
| 6 | https://www.gov.br/mdh/pt-br/assuntos/noticias/2026/outubro/anpd-publica-guia-sobre-responsabilidades-das-plataformas-na-protecao-de-criancas-e-adolescentes | Notícia do MDH sobre o guia da ANPD "Fornecedores de produtos ou serviços de tecnologia da informação: escopo e obrigações gerais do ECA Digital" | Notícia, não o guia. Data incerta (I8). |
| 7 | https://www2.camara.leg.br/legin/fed/lei/2025/lei-15211-17-setembro-2025-797997-normaatualizada-pl.html | Lei 15.211/2025 (ECA Digital): art. 1º, caput e parágrafo único, I a III; art. 41-A (vigência em 17/03/2026) | Texto atualizado da Câmara (I11). |
| 8 | https://privacy.claude.com/en/articles/7996866-is-my-data-used-for-model-training | Anthropic: exclusão em 30 dias de entradas e saídas da API, por padrão, e exceções | Página com data de 1º de julho de 2026. Resposta sobre treinamento não consta do texto aberto (I4). |
| 9 | https://supabase.com/privacy | Supabase: papel de processador, referência a *data processing addendum*, armazenamento nos EUA e em outros países, transferências para EUA e Singapura, sem menção ao Brasil | Sem data. |
| 10 | https://resend.com/legal/privacy-policy | Resend: papel como controlador da conta; transferência para os EUA sem mecanismo nomeado; sem prazo de retenção de conteúdo; sem menção à LGPD | Atualizada em 27/08/2026, segundo os metadados da página. |
| 11 | https://www.whatsapp.com/legal/business-data-processing-terms | WhatsApp Business: empresa como controladora e WhatsApp como processador; exclusão conforme os termos de negócio; sem menção ao Brasil | Última atualização em 22/08/2025. |
| 12 | https://developers.facebook.com/documentation/business-messaging/whatsapp/data-privacy-and-security/ | Meta Cloud API: conteúdo de mensagens em até 30 dias; identificadores de envio apagados em até 30 dias após o último status; Meta como processador | Sem data. |

**Não abertos (e por quê):**
- Política de privacidade do Asaas, em `central.ajuda.asaas.com` e `asaas.com`: HTTP 403 e redirecionamento para login.
- Planalto (`planalto.gov.br`): bloqueado para o bot. Textos obtidos pela Câmara.
- Páginas do DOU (`in.gov.br`): HTTP 502.
- Resultados de busca sobre Resolução nº 19/2024, Resolução nº 2/2022, Meta e Asaas: usados só como pistas, não como base de citação.

**Fontes do repositório:**
- `apps/web/docs/ARQUITETURA.md` (contrato técnico: tabelas, funções, exclusão, auditoria).
- `apps/web/supabase/functions/_shared/lgpd-export.ts`, `account-delete/handler.ts`, `account-export`, `request-assist/handler.ts`, `payments-create/handler.ts`, `asaas-onboard/handler.ts`.
- `apps/web/supabase/migrations/20261019000009_care.sql`, `20261019000010_privacy_audit.sql`, `20261019000008_notifications.sql`.
- `apps/web/pages/conta/Conta.tsx`, `apps/web/components/cuidado/CheckinPanel.tsx`, `apps/web/platform/geolocation.ts`, `apps/web/lib/requestDraft.ts`, `apps/web/config/legal.ts`, `apps/web/supabase/config.toml`.
- `apps/web/docs/juridico/01-termos-de-uso.md` (cláusulas 1.2, 3.1, 3.3, 3.7, 4.4, 4.6, 5.1), usadas para coerência, não como fonte jurídica.
- Código reconferido na revisão de 08/11/2026 (HEAD `2831d9b`): `supabase/functions/_shared/lgpd-export.ts`, `account-delete/handler.ts`, `request-assist/handler.ts`, `care-summary`, `quote-assist`, `_runtime/anthropic.ts`, `migrations/20261019000010_privacy_audit.sql`, `20261108100000_product_events.sql`, `20261019000003_providers.sql`, `20261019000009_care.sql`, `lib/observability.ts`, `lib/requestDraft.ts`, `pages/cliente/concierge.ts`, `config/legal.ts`.

**Revisão de 08/11/2026 (fontes reabertas pelo revisor):**
- Marco Civil (Câmara, Lei 12.965/2014): art. 5º, VIII (definição de registro de acesso) e art. 15, caput e §§ 1º a 4º conferidos. O § 3º trata da entrega dos registros, com autorização judicial. Nenhum prazo mudou.
- LGPD (Câmara, Lei 13.709/2018): art. 5º, II ("dado genético ou biométrico, quando vinculado a uma pessoa natural"); art. 11, II, "g" (só o início lido); art. 14, § 1º; art. 16, I a IV; art. 18, I a IX e § 1º; art. 19, II (15 dias); art. 33, VIII; art. 48. Citações do rascunho conferidas.
- Resolução CD/ANPD nº 2/2022 (gov.br): art. 3º, I e II; art. 4º, I e II; art. 11; art. 14, I a IV. Confirma Q15 e 8.3. Art. 14, II cita a Resolução nº 15, de 24/04/2024.
- Resolução CD/ANPD nº 19/2024 (gov.br): publicação no DOU em 23/08/2024; Anexo II contém as cláusulas-padrão; art. 1º, II; art. 2º, parágrafo único; art. 9º, II; art. 16. Retificação de 18/08/2025 anotada na página, texto retificado não aberto.
- Notícia da ANPD sobre o enunciado (24/05/2023): sem número na página; PDF não aberto.
- ECA Digital, Lei 15.211/2025 (Câmara): art. 1º, caput e parágrafo único, I a III; art. 41-A (vigência em 17/03/2026; acrescido pela Lei nº 15.352, de 25/2/2026).
- Anthropic (privacy.claude.com, texto de 1º de julho de 2026): exclusão em 30 dias, com exceções; sem texto sobre treinamento nem sobre região.
- Supabase (supabase.com/privacy, sem data): processador para dados de clientes; controlador dos dados de conta; EUA e Singapura; cláusulas da Comissão Europeia; sem menção ao Brasil.
- Resend (resend.com/legal/privacy-policy, atualizada em 27/08/2026 pelo metadado): controlador da conta; não trata de destinatários enviados pela API; EUA sem mecanismo nomeado.
- WhatsApp Business (termos de dados, atualizados em 22/08/2025): empresa controladora; WhatsApp operador; sem menção ao Brasil.
- Meta Cloud API (developers.facebook.com, sem data): conteúdo de mensagens em até 30 dias; identificadores apagados em até 30 dias após o último status; Meta como processador; LGPD só numa pergunta de FAQ.
- Sentry (sentry.io/privacy, sem data): controlador só dos dados da conta; EUA e Alemanha; cláusulas da UE; contrato de cliente não aberto.
- Não reabertos nesta revisão: política do Asaas (HTTP 403 antes), Planalto (bloqueado antes), DOU (HTTP 502 antes) e o texto da Resolução nº 15/2024.
