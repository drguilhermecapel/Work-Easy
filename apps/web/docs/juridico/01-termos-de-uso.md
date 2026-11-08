# Termos de Uso do WorkEasy (clientes e visitantes)

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| Item | Situação |
|---|---|
| Versão | `2026-10-rascunho` (mesma string de `CONSENT_VERSIONS.terms` em `apps/web/config/legal.ts`) |
| Vigência | [DATA DE VIGÊNCIA] |
| Redigido em | 2026-10-23 |
| Lugar no pacote | Documento 01. Remete aos documentos 02 (Termos do Prestador), 03 (Política de Privacidade), 04 (Política de Cancelamento, Reembolso e Garantia), 05 (Política de Avaliações e Moderação) e 10 (SAC e Atendimento). |
| Estado do produto nesta data | Protótipo mesclado em `main`. Sem implantação e sem usuários reais. Pagamento (Asaas), WhatsApp e e-mail nunca foram testados contra os serviços reais. |
| Revisão | 2026-11-08: produto reconferido no código; leis não reabertas nesta data (ver "Fontes consultadas"). |

## Como ler este rascunho

1. **O que é.** Minuta dos Termos de Uso para clientes e visitantes. Profissionais e empresas têm documento próprio (02).
2. **O que publicar.** As seções "Resumo dos Termos" e "Termos de Uso" são o texto para o público, depois da revisão. "Como ler este rascunho", "Pontos para o advogado" e "Fontes consultadas" são internas: não as publique.
3. **Marcas no texto.**
   - `[CONDICIONAL: depende de parecer]`: só vale se o advogado confirmar. O recurso está desligado hoje, ou o ponto jurídico está em aberto.
   - `[PLANEJADO]`: ainda não existe no produto. Se continuar sem existir na data da publicação, apague a frase.
   - `[incerto]`: não foi confirmado em fonte aberta nesta sessão.
   - `[RAZÃO SOCIAL]`, `[CNPJ]`, `[ENDEREÇO]`, `[E-MAIL DO SAC]`, `[E-MAIL DO ENCARREGADO]`, `[DATA DE VIGÊNCIA]`: dados da empresa, que ainda não existe.
4. **De onde vêm os fatos.** O que o produto faz foi conferido em `apps/web/docs/ARQUITETURA.md` e no código (migrations, Edge Functions e telas) em 2026-10-23. O que a lei diz foi lido nas fontes da última seção, na mesma data. Em 2026-11-08 o produto foi conferido de novo no código; as leis não puderam ser reabertas nessa data (planalto.gov.br bloqueou o acesso), e as citações afetadas estão marcadas [incerto]. Nada aqui foi testado com usuários reais.
5. **Números que podem mudar.** "3 propostas por pedido" e "2 dias por semana" são configurações da plataforma (`platform_settings`). O texto diz o valor inicial. Se o administrador mudar a configuração, o texto precisa mudar (ou a tela deve ler a configuração).
6. **Quem é "nós".** [RAZÃO SOCIAL], empresa de tecnologia a ser criada, separada de qualquer clínica ou atividade médica do dono.
7. **Duas palavras parecidas, dois sentidos.** No catálogo, "conferido" e "a confirmar" dizem se a base legal da regra de uma ocupação foi checada em fonte. No perfil do profissional, "informado pelo profissional" e "confirmado pelo WorkEasy" dizem se o número do registro foi conferido por uma pessoa da equipe. O texto usa cada par no seu sentido.

## Resumo dos Termos (sumário do contrato)

| Tema | Em uma frase | Cláusula |
|---|---|---|
| Quem somos | O WorkEasy aproxima você de profissionais independentes. Quem presta o serviço é o profissional. | 2 |
| Conta | Entrada por código de 6 dígitos, por e-mail ou SMS. Só maiores de 18 anos. Uma conta por pessoa. | 3 |
| Pedidos | Profissionais aprovados do bairro mandam propostas. Não garantimos resposta nem prazo. | 4 |
| Agenda | O horário só vale quando o profissional aceita. No trabalho doméstico, o app limita a 2 dias por semana com o mesmo profissional na mesma casa. | 5 |
| Preço e pagamento | O preço é do profissional. O pagamento pelo app usa o Asaas, quando disponível. Hoje o WorkEasy não soma taxa ao seu preço e não adota pagamento retido [CONDICIONAL: depende de parecer]. | 6 |
| Cancelar | Até o pagamento, você cancela no app. Depois de pagar, fale com o SAC. O direito de arrependimento do CDC é respeitado, nos termos da lei. | 7 |
| Avaliações | Só quem pagou pelo app avalia. Em algumas profissões não há avaliação pública. Hoje não existe posição paga na busca. | 8 |
| Profissões reguladas | O registro aparece como "informado" ou "confirmado". O WorkEasy não substitui o conselho e não dá aconselhamento. Sem telemedicina nem prontuário. | 9 |
| Regras de uso | Nada de fraude, ofensa, dados de saúde ou dados de terceiros nos campos livres. | 10 |
| Responsabilidade | Cada um responde pelo que faz. Seus direitos de consumidor continuam valendo. | 11 |
| Dados e atendimento | Política de Privacidade (documento 03) e SAC em [E-MAIL DO SAC]. Respondemos em até 5 dias. | 13 |
| Foro | O foro do seu domicílio, se você é consumidor. | 14 |

**Cláusulas que limitam direitos** (estão em negrito no texto, como pede o CDC, art. 54, §4º): 2.2 (a, c), 2.4 (f), 3.3, 3.6, 4.3, 5.1, 5.5, 5.6 (a, d), 5.7 (c, d), 6.5, 7.3, 7.5, 8.4, 11.3.

## Termos de Uso

Estes Termos de Uso ("Termos") são um contrato entre você e [RAZÃO SOCIAL] (CNPJ [CNPJ]), que opera o WorkEasy. Leia com calma. Se algo não estiver claro, pergunte ao SAC antes de aceitar. Se uma cláusula tiver mais de um sentido, vale o mais favorável a você, quando você for consumidor (CDC, art. 47).

### Palavras que usamos

| Palavra | Significa |
|---|---|
| WorkEasy | O site, os aplicativos e as telas operados por [RAZÃO SOCIAL] ("nós"). |
| Cliente | Quem tem conta e pede ou agenda um serviço. |
| Visitante | Quem usa o site ou o app sem conta, ou abre um link (por exemplo, de orçamento). |
| Profissional | Pessoa ou empresa independente que oferece serviços pelo WorkEasy. Tem termos próprios (documento 02). |
| Pedido | O texto em que o cliente descreve o que precisa. |
| Proposta | A resposta de um profissional a um pedido, com preço e validade. |
| Atendimento | O serviço combinado entre cliente e profissional, com data, hora e preço, que aparece em "Atendimentos". |
| Política da ocupação | A regra do catálogo que diz o que se exige de quem presta aquele serviço. |

### 1. Aceite, versão e mudanças

**1.1** Estes Termos valem para o seu uso do site, dos aplicativos (Android, iOS, Windows, macOS e Linux) e das telas do WorkEasy, como cliente ou como visitante. Os profissionais aceitam também os Termos do Prestador (documento 02).

**1.2** Para criar conta, você marca a caixa "Li e aceito os Termos de Uso e a Política de Privacidade" e confirma o código que enviamos. Quem entra pelo link do e-mail aceita na tela "Minha conta", antes de continuar. O WorkEasy registra a data, a hora e a versão dos textos que você aceitou. A lista dos seus aceites aparece em "Minha conta", em "Consentimentos".

**1.3** Quem só navega, sem conta, pode ler estes Termos a qualquer momento. O aceite só é registrado para quem tem conta. Se você abrir um link de orçamento, vale também o item 2.3.

**1.4 Mudanças.** Quando mudarmos estes Termos, a versão muda. No primeiro uso depois da mudança, o app pede que você aceite a versão atual antes de pedir ou agendar serviços. Sem aceitar, você continua podendo navegar, baixar seus dados e excluir sua conta. A nova versão não muda atendimentos já confirmados nem pagamentos já feitos: eles seguem as regras da versão em que foram confirmados. Mudanças exigidas por lei valem a partir da data em que a lei as exigir.

**1.5 Cópia e histórico.** Você pode imprimir ou salvar estes Termos. [PLANEJADO: enviar uma cópia por e-mail depois do aceite e publicar as versões anteriores, com a data em que cada uma valeu.]

### 2. O que o WorkEasy é e o que não é

**2.1 O que é.** O WorkEasy é uma plataforma na internet que:

- a) mostra um catálogo de ocupações, com a política de cada uma;
- b) deixa o cliente descrever o que precisa (pedido) e receber propostas de profissionais;
- c) deixa o cliente pedir um horário direto na página de um profissional;
- d) oferece ao profissional ferramentas de gestão: agenda, clientes, orçamentos e cobranças; e
- e) quando estiver disponível, gera a cobrança do atendimento pelo Asaas (cláusula 6).

Hoje só atendemos pedidos para bairros da cidade de São Paulo (SP).

**2.2 O que não é.** O WorkEasy é intermediação e ferramenta de gestão. Isso significa que:

- a) **quem presta o serviço é o profissional**, pessoa ou empresa independente. Ele decide o que oferece, o preço nos campos da plataforma, a agenda e o modo de trabalhar;
- b) o WorkEasy não é empregador do profissional, e o profissional não é funcionário, sócio nem representante do WorkEasy;
- c) **não garantimos** que haja profissional disponível, que ele responda, nem o preço, o prazo, a qualidade ou o resultado do serviço; e
- d) o WorkEasy não é clínica, hospital, escritório de advocacia, banco nem seguradora. Sobre ser ou não instituição de pagamento, ver a cláusula 6 [CONDICIONAL: depende de parecer].

Estas frases descrevem o papel de cada um. Elas não retiram direitos que a lei do consumidor dá a você (cláusula 11).

**2.3 Orçamentos e clientes próprios do profissional.** O profissional pode usar o WorkEasy para atender os clientes dele, sem passar pelo marketplace. Ele pode enviar um orçamento por link, registrar um atendimento e gerar uma cobrança na conta de recebimento dele no Asaas. Nesses casos, o acordo é entre você e o profissional. O WorkEasy fornece a ferramenta e o link, não confere o conteúdo do orçamento e não é parte do acordo. Você não precisa de conta para aceitar ou recusar um orçamento, e a sua resposta fica registrada para o profissional. Aceitar um orçamento não gera cobrança automática: o pagamento é combinado com o profissional.

**2.4 O que a equipe confere.** Cada ocupação tem uma política no catálogo. Ela diz se a profissão é regulamentada, qual é o órgão e o que se exige de quem presta o serviço. Os itens possíveis são: documento com foto e selfie, CPF ou CNPJ, registro no conselho, certidão de antecedentes criminais, certificado de curso, CNH, licença do órgão competente e seguro de responsabilidade civil. Cada ocupação exige só os itens da sua política. Então:

- a) uma pessoa da equipe abre cada arquivo enviado e o aceita ou recusa. A recusa leva um motivo;
- b) o profissional só aparece nas buscas, recebe pedidos e pode ser agendado em uma ocupação depois que a equipe a aprova. A aprovação exige os documentos da política aceitos e o registro não recusado;
- c) se um documento aceito for depois recusado ou apagado, a aprovação que dependia dele é retirada e a ocupação sai da busca;
- d) **registro profissional:** o número é digitado pelo profissional e aparece como "informado pelo profissional", isto é, informado e não verificado pelo WorkEasy. Só aparece como "confirmado pelo WorkEasy" depois que uma pessoa da equipe consulta o conselho e anota como conferiu. A aprovação da ocupação não depende dessa confirmação: depende só de o registro não ter sido recusado;
- e) **antecedentes criminais:** quando a política exige, o profissional envia uma certidão e autoriza o WorkEasy a usá-la para analisar o cadastro. Usamos a certidão enviada. Não consultamos bases de dados por conta própria; e
- f) **a equipe não acompanha o serviço no local, não confere preço nem qualidade, não vigia a vida do profissional depois da análise e não reconfere de forma automática documentos que vencem.**

"Aprovado" ou "confirmado pelo WorkEasy" não é recomendação nem garantia de resultado. No catálogo, "conferido" quer dizer que a base legal da regra foi checada em fonte. "A confirmar" quer dizer que ainda não foi, e a regra pode mudar depois de revisão por advogado.

**2.5 Pedidos pelo WhatsApp (modo concierge).** [CONDICIONAL: o botão só aparece quando a operação configura o número do WhatsApp. Se não houver número na publicação, apague este item.] Em alguns períodos, o pedido pode ser feito pelo WhatsApp da operação do WorkEasy. O app abre o WhatsApp com a mensagem pronta, e nada é enviado até você tocar em enviar. A operação responde pelo WhatsApp, que tem termos próprios.

**2.6 Telas de demonstração.** [PLANEJADO: apagar este item quando essas telas saírem do app.] Telas marcadas como "Demonstração" ou "Protótipo" (por exemplo, perfis fictícios de médicos, sala de teleconsulta e prontuários) usam dados fictícios. Segundo o aviso de cada tela, nelas não há serviço real e nada do que você digita é enviado ou guardado.

### 3. Conta, login por código e idade mínima

**3.1 Login sem senha.** Você informa seu e-mail ou seu celular com DDD e recebe um código de 6 dígitos, que vale por tempo limitado, por e-mail ou por SMS. O SMS depende do provedor configurado na plataforma. Se o código não chegar, use o e-mail. Confirmar o código pela primeira vez cria a sua conta.

**3.2 Cuide do seu código.** Quem tem o código entra na sua conta. Não o compartilhe. Mantenha seu e-mail e seu celular sob seu controle. Se achar que alguém entrou na sua conta, fale com o SAC.

**3.3 Idade mínima.** **Para ter conta, você precisa ter 18 anos completos.** Em regra, a lei civil considera a pessoa capaz de todos os atos da vida civil a partir dos 18 anos (Código Civil, art. 5º) [incerto: lei não reaberta]. O WorkEasy não é feito para crianças e adolescentes. Serviços para crianças (como babá ou reforço escolar) são contratados por um adulto responsável. Hoje o app não confere a idade: vale a sua declaração ao aceitar estes Termos. [PLANEJADO: conferir a idade nas ocupações cuja oferta é proibida a menores de 18 anos, como a entrega de bebida alcoólica.] **Se soubermos que uma conta é de menor de 18 anos, podemos suspendê-la e excluí-la.**

**3.4 Uma conta por pessoa; dados verdadeiros.** Cada pessoa tem uma conta. Informe nome e contatos verdadeiros. Não use a conta de outra pessoa e não crie contas para fugir de um bloqueio ou do limite do item 5.6. O telefone do perfil é informativo: as mensagens do WorkEasy vão só para o e-mail ou celular que você confirmou no login.

**3.5 Virar profissional.** Se você quiser oferecer serviços, faça o cadastro de profissional na mesma conta. Aí valem também os Termos do Prestador (documento 02).

**3.6 Suspensão e bloqueio.** **Podemos suspender ou bloquear uma conta, ou remover conteúdo, nestes casos: fraude, uso proibido (cláusula 10), risco à segurança de alguém, ordem de autoridade ou descumprimento destes Termos.** Sempre que possível, avisamos o motivo. Você pode responder pelo SAC. Também pode excluir sua conta quando quiser (item 3.7). A suspensão não tira seu direito de pedir seus dados nem de procurar a Justiça.

**3.7 Excluir a conta e baixar seus dados.** Em "Minha conta" você baixa uma cópia dos seus dados e pode excluir a conta a qualquer momento. Se houver atendimento aceito, pago, em andamento ou em contestação, a exclusão só é possível depois que ele terminar, for cancelado ou for resolvido pela equipe. Seus dados pessoais são apagados ou anonimizados. Os registros de pagamentos e atendimentos ficam sem identificar você, porque a lei fiscal exige guardá-los [incerto: base legal e prazo a confirmar com o contador]. Detalhes na Política de Privacidade (documento 03).

### 4. Pedidos e propostas

**4.1 Como funciona.** Você escolhe o serviço e o bairro, descreve o que precisa (de 10 a 2.000 caracteres) e diz quando e se é urgente. Profissionais aprovados nessa ocupação, que atendem o bairro, veem o pedido sem o seu nome, telefone e e-mail e podem enviar propostas. "Urgente" é só um aviso ao profissional: não garante atendimento rápido nem prazo.

**4.2 Número de propostas.** Cada pedido recebe um número máximo de propostas, definido na configuração da plataforma (o valor inicial é 3). O valor pode mudar. Atingido o limite, outros profissionais não conseguem propor.

**4.3 Sem promessa de resposta.** **Não garantimos que seu pedido receba propostas, nem em quanto tempo.** O pedido fica aberto por 7 dias. Nenhum pedido fica aberto por mais de 30 dias. Depois do prazo, ele é encerrado automaticamente. Quando o envio estiver ativo, avisamos por e-mail ou WhatsApp que chegou uma proposta.

**4.4 Proposta.** A proposta é uma oferta do profissional, com preço, mensagem e validade. Não é uma oferta do WorkEasy. Para aceitar, você informa o dia e os horários (horário de Brasília). Ao aceitar, as outras propostas são recusadas, o pedido deixa de receber propostas e o atendimento é criado com esse profissional. A partir daí, o profissional passa a ver o nome, o telefone e a cidade do seu perfil, e você passa a ver os dados de contato do perfil dele. Antes de aceitar, leia a página do profissional, inclusive o selo do registro (item 2.4).

**4.5 O que não escrever no pedido.** Não escreva telefone, endereço completo nem dados de saúde, seus ou de outra pessoa. A descrição pode ser vista pelos profissionais que atendem o bairro.

**4.6 Inteligência artificial.** [PLANEJADO] O WorkEasy pode vir a oferecer um assistente que transforma o seu texto livre em um pedido organizado. Hoje o app não tem essa tela para o cliente. Hoje há dois recursos de IA, que só funcionam quando a plataforma tem o serviço de IA configurado: a sugestão de orçamento, para o profissional, e o resumo semanal da linha Cuidado, para a família. Quando estão ligados, o texto usado nesses recursos é enviado a um serviço de inteligência artificial de terceiros. O resultado pode ter erros: confira antes de enviar um orçamento ou de usar um resumo. [CONDICIONAL: depende da configuração do serviço e de parecer sobre o tratamento desses dados.]

### 5. Agendamentos, agenda e limite semanal do trabalho doméstico

**5.1 Pedir um horário.** Na página do profissional, em "Agendar", você escolhe o serviço, o dia e um horário livre. O pedido fica "Aguardando o profissional". **O atendimento só fica confirmado quando o profissional aceita.** O app limita quantos pedidos de horário você pode manter abertos ao mesmo tempo. Se o profissional não responder, você pode cancelar o pedido de horário. O profissional vê o nome, o telefone e a cidade do seu perfil assim que você pede o horário. Você vê os dados de contato dele depois que ele aceita.

**5.2 Horários.** Todos os horários são de Brasília. A semana vai de segunda a domingo.

**5.3 Situações do atendimento.**

| Situação no app | O que significa |
|---|---|
| Aguardando o profissional | Você pediu o horário e o profissional ainda não respondeu. |
| Aceito | O profissional aceitou, ou você aceitou a proposta dele. |
| Pago | O pagamento pelo app foi confirmado. |
| Em andamento | O profissional marcou o início. |
| Concluído | O profissional marcou o fim. |
| Liberado | Você confirmou que o serviço foi feito como combinado. Hoje não move dinheiro (item 6.6). |
| Em contestação | Você contestou o atendimento. A equipe analisa. |
| Cancelado | Cancelado por você, pelo profissional ou pela equipe. |

**5.4 Concluído e "Liberar".** O profissional marca o atendimento como "Concluído". Depois disso, você pode "Liberar" (confirmar que o serviço foi feito como combinado) ou contestar.

**5.5 Contestar.** Se o serviço não foi como combinado, **você pode contestar um atendimento "Concluído" em até 7 dias depois do fim do horário**, explicando o que aconteceu. A equipe analisa e registra a decisão, com o motivo, no histórico do atendimento. A decisão da equipe sobre a situação do atendimento no app não impede você de procurar o profissional, o Procon, o Consumidor.gov.br ou a Justiça. Se o profissional não compareceu e o atendimento não foi marcado como concluído, fale com o SAC. Sobre reembolso, ver a Política de Cancelamento, Reembolso e Garantia (documento 04).

**5.6 Trabalho doméstico: limite de dias por semana.**

- a) Algumas ocupações do catálogo são de trabalho doméstico (por exemplo: diarista, babá, cuidador de idosos, cozinheira, motorista particular e caseiro). Para elas, o app limita quantos dias diferentes por semana (segunda a domingo, horário de Brasília) o mesmo profissional pode atender a mesma pessoa ou a mesma casa. **Hoje o limite é de 2 dias por semana** (é uma configuração da plataforma). Se um atendimento passar do limite, o app não o cria e mostra um aviso. Atendimentos cancelados não contam. Os concluídos continuam contando na semana.
- b) **Por que existe.** A Lei Complementar 150/2015 define quem é empregado doméstico (art. 1º) [incerto: lei não reaberta]. É quem presta serviços de forma contínua, subordinada, onerosa e pessoal, sem finalidade lucrativa, à pessoa ou à família, no âmbito residencial, por mais de 2 dias por semana. A lei pode tratar o trabalho doméstico acima desse limite como relação de emprego. O WorkEasy aplica o limite por causa dessa regra.
- c) **O que o limite não é.** Não é orientação trabalhista. Ficar dentro do limite não garante, por si só, que não exista relação de emprego.
- d) **Acordo direto, fora do app.** Se você e o profissional quiserem mais dias, o acerto é feito fora do WorkEasy, entre vocês, e é de responsabilidade de vocês, inclusive as obrigações trabalhistas, previdenciárias e fiscais. **O WorkEasy não participa desse acordo, não registra o vínculo e não calcula encargos.** Procure um contador ou um advogado trabalhista.
- e) É proibido usar mais de uma conta, outro nome ou outro artifício para contornar o limite (cláusula 10).

**5.7 Linha Cuidado.** [CONDICIONAL: depende de parecer. Publicar este item só quando a linha for aberta ao público.]

- a) A linha Cuidado ajuda uma família a organizar plantões de cuidadores independentes. A família cadastra uma casa e a pessoa cuidada (primeiro nome, ano de nascimento, preferências e um contato de emergência), cria plantões e os oferece a cuidadores aprovados. O primeiro que aceita fica com o plantão.
- b) No começo e no fim do plantão, o cuidador registra a entrada e a saída. Se quiser, envia a localização do aparelho, e a família vê onde o registro foi feito. O cuidador pode enviar um relatório do dia sobre refeições, atividades e humor. O relatório não é clínico. Se o resumo semanal com IA estiver ligado (item 4.6), ele é feito a partir da rotina registrada na casa [incerto: conferir quais campos são enviados].
- c) O cuidador é independente. **O WorkEasy não presta cuidado de saúde, não orienta tratamento e não foi feito para guardar dados de saúde.** Não escreva doenças, diagnósticos, remédios, doses, exames ou sintomas no app. Combine esses cuidados direto com o cuidador, fora do app.
- d) **O WorkEasy não recebe nem repassa o pagamento do plantão.** O valor é combinado e pago diretamente entre a família e o cuidador. O cuidador vê o valor combinado no app.
- e) Vale sempre o limite de dias por semana do item 5.6 para o mesmo cuidador na mesma casa.
- f) Cadastre só pessoa de quem você cuida ou por quem responde, e só os dados necessários.
- g) Em emergência, ligue para o SAMU, no 192. O app não atende emergências.

### 6. Preços e pagamentos

**6.1 Preço.** O preço é definido pelo profissional, na página dele, na proposta ou no orçamento. O WorkEasy não define nem garante o preço. Os valores aparecem em reais, por unidade (por hora, por dia, por serviço, por m², por sessão e outras). Despesas extras (materiais, deslocamento, taxas) só devem ser cobradas se estiverem na proposta ou forem combinadas antes do serviço: peça o detalhamento antes de aceitar. No agendamento direto, o atendimento é registrado pelo valor inicial do serviço, que não é multiplicado pela duração do horário. O valor final é combinado com o profissional. A cobrança pelo app usa o valor registrado no atendimento. Confira esse valor antes de pagar.

**6.2 Sem taxa para o cliente.** Hoje o WorkEasy não soma nenhuma taxa ao valor que você paga. Se isso mudar, avisaremos antes, e a mudança constará nestes Termos.

**6.3 Pagamento pelo app.** [CONDICIONAL: depende de parecer] Quando estiver disponível, a cobrança é gerada por meio do Asaas (ASAAS Gestão Financeira Instituição de Pagamento S.A. [incerto: conferir razão social e autorização no Banco Central]). Você escolhe Pix, cartão de crédito ou boleto. Os dados do cartão são digitados na página do Asaas: o WorkEasy não recebe o número do cartão. Na primeira cobrança, o CPF ou CNPJ é obrigatório: sem ele, a cobrança não é criada. Para emitir a cobrança, enviamos ao Asaas seu nome, CPF ou CNPJ, e-mail e celular (Política de Privacidade, documento 03). A cobrança vence no dia seguinte. Se vencer, gere outra. Cobranças de atendimento cancelado são canceladas (cláusula 7).

**6.4 Quem cobra e quem recebe.** [CONDICIONAL: depende de parecer] A cobrança é emitida na conta do WorkEasy no Asaas, com a descrição "WorkEasy: atendimento" seguida do código da ocupação no catálogo (por exemplo, "diarista"). O Asaas divide o valor: a parte do profissional vai para a conta de recebimento dele no Asaas. [Nota ao advogado: se o parecer permitir, acrescentar aqui "O WorkEasy não é instituição de pagamento." Ver ponto P3.]

**6.5 Pagamento fora do app.** Você pode combinar o pagamento direto com o profissional. **Nesse caso, o WorkEasy não recebe, não confere e não registra o pagamento, e os recursos de pagamento, reembolso e avaliação do app não se aplicam a ele.** Atendimentos de "cliente próprio" do profissional são cobrados por ele.

**6.6 Pagamento retido, "Liberar" e comissão.** [CONDICIONAL: depende de parecer] Hoje o WorkEasy não adota o pagamento retido (guardar o valor para liberá-lo depois) e não cobra comissão do profissional. O botão "Liberar atendimento" registra a sua confirmação de que o serviço foi feito como combinado e hoje não move dinheiro. Se esses recursos forem ligados, será depois de parecer jurídico, com instituição autorizada para a custódia quando for o caso, e com aviso destacado e nova versão destes Termos. Se houver comissão, ela não será somada ao preço que você paga.

**6.7 Cobrança errada ou não reconhecida.** Fale com o SAC. Se a cobrança estiver errada, pedimos o estorno ao Asaas.

**6.8 Recibo e nota fiscal.** O profissional é responsável por dar recibo ou nota do serviço, quando a lei exigir: peça a ele. O WorkEasy não emite nota fiscal do serviço do profissional.

### 7. Cancelamento, arrependimento e reembolso

Resumo. As regras completas estão na Política de Cancelamento, Reembolso e Garantia (documento 04).

| Situação | O que fazer |
|---|---|
| O profissional ainda não aceitou ("Aguardando o profissional") e você quer cancelar | Botão "Cancelar atendimento". |
| O profissional aceitou e você ainda não pagou ("Aceito") | Botão "Cancelar atendimento". A cobrança em aberto, se houver, é cancelada. |
| Você já pagou e quer cancelar ou desistir | SAC. O app não tem botão para isso nesta fase. |
| Você pagou um atendimento que já estava cancelado | O WorkEasy pede o reembolso total ao Asaas (Pix e cartão). Boleto: SAC. |
| O serviço não foi como combinado | Contestar em até 7 dias (item 5.5) ou falar com o SAC. |
| O profissional não veio | SAC. |

**7.1 Cancelar.** O cliente pode cancelar enquanto o atendimento está "Aguardando o profissional" ou "Aceito", com um motivo opcional. A ação não pode ser desfeita. O profissional também pode cancelar nesses dois estados (ou recusar o pedido de horário).

**7.2 A cobrança em aberto.** Quando um atendimento é cancelado, a cobrança em aberto é cancelada no Asaas. Não pague uma cobrança de atendimento cancelado. Se você pagar mesmo assim, o WorkEasy pede o reembolso total ao Asaas. Pela integração atual, o WorkEasy pede esse estorno automaticamente só para cobranças de cartão e de Pix. Para boleto, o caso é tratado pelo SAC. Se o Asaas recusar o estorno, a equipe trata o caso pelo SAC. [incerto: a regra do Asaas para estorno de cobrança com divisão (split), quando a subconta já sacou, não está publicada.]

**7.3 Depois do pagamento.** **Hoje o app não tem botão para cancelar um atendimento já pago, nem para o cliente nem para o profissional. Para cancelar, desistir ou pedir reembolso depois de pagar, fale com o SAC.** [PLANEJADO: botão de arrependimento no app, pela mesma ferramenta usada na contratação.]

**7.4 Direito de arrependimento.** [CONDICIONAL: depende de parecer quanto ao serviço já iniciado ou executado] Quando a contratação acontece fora de um estabelecimento comercial, como pela internet, o CDC permite desistir em até 7 dias. O prazo conta da contratação ou do recebimento do serviço. Os valores pagos são devolvidos, atualizados (art. 49) [incerto: lei não reaberta]. O Decreto 7.962/2013 (art. 5º) manda informar de forma clara os meios para exercer esse direito. Ele pode ser exercido pela mesma ferramenta da contratação ou por outro meio. Por enquanto, o meio é o SAC. Como o direito se aplica a serviço já iniciado, e como pedir, está no documento 04.

**7.5 Garantia.** **O WorkEasy não oferece garantia própria de refazer o serviço ou de devolver o valor.** [CONDICIONAL: depende de parecer e de ligar o pagamento retido] Isso não afeta os direitos que a lei dá a você contra quem presta o serviço. Por exemplo, em caso de vício de qualidade, o CDC permite pedir a reexecução do serviço, a restituição da quantia paga ou o abatimento proporcional do preço (art. 20) [incerto: lei não reaberta]. O WorkEasy ajuda como mediador, pelo SAC.

### 8. Avaliações

Resumo. As regras completas estão na Política de Avaliações e Moderação (documento 05).

**8.1 Quem pode avaliar.** Só o cliente do atendimento, depois que ele estiver "Concluído" ou "Liberado" e tiver sido pago pelo app. Cada atendimento pode ter uma avaliação, com nota de 1 a 5 e um comentário opcional de até 1.000 caracteres. O profissional não avalia o cliente.

**8.2 Onde aparecem.** Na página pública do profissional, se a política da ocupação permitir. Em algumas profissões, a política não permite ranking por nota (por regra do conselho profissional) [incerto: depende da matriz por conselho]. Nelas, a avaliação não é exibida ao público e só você, o profissional e a equipe a veem. A tela avisa quando é assim.

**8.3 Regras do conteúdo.** Escreva só sobre o serviço que você recebeu. Diga a verdade. Não coloque dados pessoais (seus ou de outras pessoas), ofensas, ameaças, discriminação, nem pedido ou oferta de vantagem em troca de nota.

**8.4 Moderação.** **A equipe pode ocultar uma avaliação que viole estas regras ou a lei, e o autor não pode republicá-la.** O WorkEasy não edita o texto das avaliações. O profissional pode pedir a revisão de uma avaliação pelo SAC.

**8.5 Como as buscas são ordenadas.** Quando a ocupação permite ranking por nota, os profissionais com pelo menos 3 avaliações publicadas vêm primeiro, pela média das notas, e os demais vêm depois, por ordem de nome. Quando não permite, a ordem muda a cada dia e não depende de nota. **O plano pago do profissional (Pro) não muda a posição na busca.** Hoje não existe posição paga.

### 9. Profissões regulamentadas e saúde

**9.1 Registro mostrado.** Nas profissões regulamentadas, a página do profissional mostra o registro como "informado pelo profissional" ou "confirmado pelo WorkEasy" (item 2.4). Nenhum dos dois substitui a sua própria conferência. Para conferir um registro, consulte o conselho da profissão.

**9.2 O WorkEasy não substitui o conselho.** Não fiscalizamos o exercício da profissão nem julgamos conduta ética. Reclamações éticas e técnicas contra um profissional regulamentado podem ser feitas ao conselho dele.

**9.3 Sem aconselhamento.** O WorkEasy não oferece aconselhamento médico, jurídico, psicológico, contábil nem de outra profissão regulamentada. Não faz triagem, não faz diagnóstico e não indica tratamento. Os textos do app e do catálogo são informativos e não substituem um profissional habilitado. A relação de consulta, tratamento ou orientação é só entre você e o profissional.

**9.4 Emergências.** O WorkEasy não atende emergências. Em urgência de saúde, ligue para o SAMU, no 192.

**9.5 Telemedicina e prontuário.** O WorkEasy não oferece telemedicina nem prontuário eletrônico. [PLANEJADO] Se um dia oferecer, será só com os requisitos das normas aplicáveis [incerto: requisitos a confirmar com advogado] e com termos próprios. As telas de teleconsulta e de prontuário que existem hoje são demonstrações com dados fictícios (item 2.6).

**9.6 Dados de saúde.** Não escreva dados de saúde em pedidos, observações, avaliações ou mensagens. O app não foi feito para guardá-los.

### 10. Conduta e usos proibidos

**10.1** Use o WorkEasy de boa-fé e de acordo com a lei. É proibido:

- a) dar informação falsa, usar a identidade de outra pessoa, ou criar contas para fugir de bloqueio, de limite (como o do item 5.6) ou de regra destes Termos;
- b) ofender, ameaçar, assediar ou discriminar qualquer pessoa, em pedidos, mensagens, avaliações ou perfis;
- c) publicar conteúdo sexual, de violência ou de exploração de crianças e adolescentes;
- d) escrever nos campos livres dados de saúde, telefone, endereço completo ou outros dados pessoais de terceiros;
- e) pedir ou oferecer serviço ilegal, perigoso ou que exija uma habilitação que o profissional não tem, inclusive trabalho infantil;
- f) fazer avaliação falsa, trocar nota por vantagem ou usar a avaliação para pressionar o profissional;
- g) usar robôs, raspagem de dados ou outro meio automático para copiar o catálogo, as páginas dos profissionais ou dados de usuários;
- h) tentar acessar dados de outras pessoas, testar falhas de segurança sem autorização ou introduzir código malicioso; e
- i) usar o WorkEasy para fraude, lavagem de dinheiro ou qualquer crime.

**10.2 Como denunciar.** Para denunciar conteúdo, perfil ou conduta que viole estes Termos ou a lei, escreva ao SAC com o link ou a descrição. Analisamos e, havendo ilicitude ou violação, removemos o conteúdo. Quando removermos conteúdo seu, informamos o motivo, salvo se a lei ou uma ordem judicial disser o contrário (Marco Civil da Internet, art. 20) [incerto: lei não reaberta].

**10.3 Ordens judiciais e proteção de crianças e adolescentes.** Cumprimos ordens judiciais de remoção, no âmbito e nos limites técnicos do serviço. Se detectarmos conteúdo de aparente exploração ou abuso sexual de criança ou adolescente, sequestro ou aliciamento, vamos removê-lo e comunicá-lo às autoridades competentes, como a lei exige (Lei 15.211/2025, art. 27) [incerto: lei não reaberta].

**10.4 Consequências.** Podem ser: remoção do conteúdo, suspensão ou bloqueio da conta (item 3.6) e, quando a lei exigir, comunicação às autoridades.

### 11. Responsabilidades

**11.1 Cada um responde pelo que faz.** O profissional responde pelo serviço que presta: execução, qualidade, prazo, segurança no local e preço combinado. O WorkEasy responde pelo que ele próprio faz. Isso inclui o funcionamento da plataforma, as informações que ele mesmo publica, a análise de cadastro descrita no item 2.4, as cobranças que emite e a proteção dos dados que trata, nos termos da lei. Você responde pelas informações que dá e pelo uso que faz da sua conta.

**11.2 Seus direitos de consumidor continuam valendo.** **Nada nestes Termos exclui ou reduz direito que a lei do consumidor dá a você.** O CDC prevê, por exemplo, duas regras. A primeira: o fornecedor de serviços responde, independentemente de culpa, pelos danos causados por defeitos na prestação do serviço (art. 14). A segunda: havendo mais de um responsável pelo dano, todos respondem solidariamente (art. 25, §1º) [incerto: lei não reaberta]. Quando a lei atribuir responsabilidade ao WorkEasy, ela será observada. [CONDICIONAL: depende de parecer quanto à posição do WorkEasy na cadeia de fornecimento]

**11.3 O que não controlamos.** **O WorkEasy pode ficar indisponível por manutenção, por falha de internet ou de serviços de terceiros, e por caso fortuito ou força maior.** Os serviços de terceiros incluem hospedagem, Asaas, e-mail, SMS e WhatsApp. Avisamos quando possível. Isso não afasta responsabilidade que a lei imponha.

**11.4 Cuidado no serviço em casa.** Antes do serviço, confira se quem chegou é o profissional do seu atendimento, combine preço e horário por escrito, não deixe objetos de valor à vista e avise alguém de confiança. Se algo sair errado, procure ajuda no local e depois fale com o SAC. Estas dicas não substituem os seus cuidados e não criam garantia.

### 12. Conteúdo e propriedade intelectual

**12.1 O que é do WorkEasy.** O software, o design, o catálogo e as políticas escritas pelo WorkEasy são de [RAZÃO SOCIAL] ou de quem as licenciou a ela. Você pode usar o app para uso pessoal, sem exclusividade, enquanto cumprir estes Termos. Não pode copiar, vender nem criar obra derivada do app, salvo o que a lei permitir. O nome e a identidade visual "WorkEasy" são usados por [RAZÃO SOCIAL] [incerto: busca e registro da marca no INPI ainda não feitos].

**12.2 O que é seu.** O que você escreve (pedidos, observações, avaliações) continua sendo seu. Você autoriza o WorkEasy a guardar, tratar e mostrar esse conteúdo a quem precisa vê-lo para o serviço funcionar. Por exemplo: os profissionais que recebem seu pedido e, no caso de uma avaliação publicada, o público. A equipe também o vê, para suporte e moderação. A autorização termina quando o conteúdo é apagado. Ficam de fora o que já foi entregue a outras pessoas e o que a lei mandar guardar.

**12.3 Conteúdo dos profissionais.** Perfil, serviços e textos dos profissionais são deles. Não os copie.

**12.4 Direitos de terceiros.** Se achar que algo no WorkEasy viola direito autoral ou outro direito seu, escreva ao SAC com a descrição e o link.

### 13. Privacidade, comunicações e atendimento (SAC)

**13.1 Dados pessoais.** O que coletamos, para quê, com quem compartilhamos, por quanto tempo guardamos e como exercer seus direitos está na Política de Privacidade (documento 03). O controlador é [RAZÃO SOCIAL]. O encarregado pelo tratamento de dados pessoais atende em [E-MAIL DO ENCARREGADO]. Em "Minha conta" você baixa uma cópia dos seus dados, revoga consentimentos (novidades, localização, antecedentes) e exclui a conta.

**13.2 Mensagens.** Mensagens sobre pedidos, propostas, atendimentos e pagamentos vão para o e-mail ou celular confirmado no seu login, por e-mail ou WhatsApp, quando o envio estiver ativo. Mensagens de novidades e ofertas só com o seu consentimento, que você pode revogar em "Minha conta".

**13.3 Registros de acesso.** A lei manda guardar os registros de acesso à aplicação, sob sigilo, por 6 meses. A regra vale para o provedor de aplicações constituído como empresa, que atua de forma organizada, profissional e com fins econômicos (Marco Civil da Internet, art. 15) [incerto: lei não reaberta]. Os registros só são entregues a quem pede com autorização judicial (art. 15, §3º). [PLANEJADO: definir onde esses registros ficam e quem os acessa. Ver documento 03.]

**13.4 SAC.** Fale com o atendimento pelo e-mail [E-MAIL DO SAC]. [PLANEJADO: página própria do SAC, telefone ou WhatsApp e horário de atendimento (documento 10).] Logo que recebermos seu contato, confirmamos o recebimento pelo mesmo meio que você usou. Respondemos em até 5 dias (Decreto 7.962/2013, art. 4º, parágrafo único) [incerto: decreto não reaberto]. Pelo SAC você pode pedir informação, esclarecer dúvida, reclamar e pedir a suspensão ou o cancelamento do contrato.

**13.5 Se não resolvermos.** Você pode procurar o Procon e registrar a reclamação no Consumidor.gov.br, serviço público e gratuito de solução alternativa de conflitos de consumo pela internet. Sobre dados pessoais, ver também o documento 03.

### 14. Lei aplicável, foro e disposições gerais

**14.1 Lei.** Estes Termos seguem a lei brasileira.

**14.2 Foro.** Se você é consumidor, qualquer ação entre você e o WorkEasy pode ser proposta no foro do seu domicílio (CDC, art. 101, I) [incerto: lei não reaberta]. Para quem usa o WorkEasy sem ser consumidor (por exemplo, uma empresa que contrata o serviço para a própria atividade), o foro é o da comarca da sede de [RAZÃO SOCIAL], [ENDEREÇO] [CONDICIONAL: depende de parecer].

**14.3 Sem arbitragem obrigatória.** Estes Termos não obrigam você a usar arbitragem e não limitam o seu acesso à Justiça.

**14.4 Solução amigável.** Antes de ir à Justiça, você pode procurar o SAC, o Procon e o Consumidor.gov.br. É uma opção sua, não uma condição.

**14.5 Cláusula inválida.** Se uma cláusula destes Termos for considerada inválida, as outras continuam valendo, salvo se a falta dela causar ônus excessivo a uma das partes (CDC, art. 51, §2º) [incerto: lei não reaberta].

**14.6 Comunicações.** Falamos com você pelo app, pelo e-mail ou pelo celular confirmado no login. Você fala conosco pelo SAC (item 13.4).

### 15. Identificação da empresa

| Campo | Dado |
|---|---|
| Nome empresarial | [RAZÃO SOCIAL] |
| CNPJ | [CNPJ] |
| Endereço físico | [ENDEREÇO] |
| Endereço eletrônico do SAC | [E-MAIL DO SAC] |
| Encarregado pelo tratamento de dados pessoais | [E-MAIL DO ENCARREGADO] |
| O que é | Empresa de tecnologia que opera o WorkEasy. Não é clínica e não presta serviços de saúde. |
| Vigência destes Termos | [DATA DE VIGÊNCIA] |
| Versão | 2026-10-rascunho |

[PLANEJADO: repetir estes dados em local de destaque, no rodapé do site e do app, e na ficha das lojas de aplicativos (Decreto 7.962/2013, art. 2º, I e II; documento 10).]

## Pontos para o advogado

Esta seção é interna. Cada ponto diz o que o rascunho assume e o que precisa de decisão. As fontes (F1 a F18) estão na última seção.

### A. Perguntas jurídicas em aberto

| # | Pergunta | O que o rascunho assume e por quê | Cláusula | Fontes |
|---|---|---|---|---|
| P1 | O WorkEasy "funciona como marketplace" e responde pelo CDC junto com o profissional? Como escrever 2.2 e 11 sem negar o que a lei atribui à plataforma e sem assumir o que ela não atribui? | O texto não exclui responsabilidade: descreve os papéis e preserva os direitos do consumidor. Base: CDC, arts. 3º (fornecedor), 7º (parágrafo único), 14, 25 e 34 (o §4º do art. 14 trata a responsabilidade pessoal dos profissionais liberais como dependente de culpa: isso é do profissional, e se alcança a plataforma é questão sua); Marco Civil, art. 7º, XIII (manda aplicar a defesa do consumidor às relações de consumo na internet). Fatos do produto que pesam: a equipe aprova profissionais, o WorkEasy mantém catálogo e ordem da busca, e (quando ligado) emite a cobrança na conta Asaas da plataforma. A tese do STF diz que marketplaces respondem pelo CDC (item 6) e que não haverá responsabilidade objetiva na aplicação da tese (item 11): como os dois itens se combinam para um marketplace de serviços é questão de interpretação [incerto]. O STJ, no Tema 1.173 (corretor de imóveis), afastou a responsabilidade do intermediário "em regra"; se isso vale por analogia a plataforma de serviços é [incerto]. | 2.2, 11 | F1, F3, F11, F15 |
| P2 | Vale incluir teto de indenização? | Não há teto para consumidor. O art. 51, I, do CDC permite limitar a indenização, "em situações justificáveis", só quando o consumidor é pessoa jurídica. O art. 25 veda cláusula que exonere ou atenue o dever de indenizar. | 11 | F1 |
| P3 | A estrutura de pagamento (cobrança na conta Asaas da plataforma, com split para o profissional) deixa o WorkEasy fora do conceito de instituição de pagamento? O que dizer ao consumidor sobre quem cobra? | O código emite a cobrança na conta raiz do WorkEasy no Asaas (descrição "WorkEasy: atendimento ..."), com split para a carteira do profissional. Sem comissão e sem retenção hoje. A Lei 12.865/2013, art. 6º, III, define instituição de pagamento por atividades como "executar ou facilitar a instrução de pagamento" (b) e "credenciar a aceitação de instrumento de pagamento" (e). Esta é a pergunta 1 de `DECISOES.md`. Quando houver comissão: nota fiscal sobre ela. A Res. BCB 150/2021, citada em `DECISOES.md` §4, não foi aberta aqui [incerto]. | 2.2(d), 6 | F10, F18 |
| P4 | Cancelar depois de pagar e arrependimento. | O app não tem botão para cancelar atendimento pago (cliente nem profissional) nem botão de arrependimento. O texto manda ao SAC (7.3). O CDC, art. 49, e o Decreto 7.962/2013, art. 5º e §1º, falam em meios claros e na "mesma ferramenta" da contratação. O SAC basta nesta fase? E para serviço já iniciado? (documento 04). | 7 | F1, F2 |
| P5 | Aceite e prova do aceite. | Uma só caixa para Termos e Privacidade; os dois links apontam para `/legal`, hoje um texto provisório. O registro guarda usuário, finalidade, versão e hora do servidor; não guarda o texto, o IP nem o aparelho. O aceite do visitante só por navegação tem pouco valor [incerto]. O Decreto 7.962/2013, art. 4º, I, pede sumário do contrato com as cláusulas restritivas enfatizadas (por isso o Resumo) e o inciso IV pede cópia que permita conservação e reprodução. O CDC, art. 46, diz que o contrato não obriga o consumidor que não teve oportunidade de conhecer o conteúdo, e o art. 54, §§3º e 4º, trata de fonte e destaque. | 1 | F1, F2 |
| P6 | Idade mínima e ECA Digital. | O texto exige 18 anos por declaração; o app não confere. A Lei 15.211/2025 vale desde 17/03/2026 (art. 41-A) e o Decreto 12.880/2026 (18/03/2026) a regulamenta. O art. 18 do decreto manda quem "oferte ou intermedeie a compra e a venda" de produtos e serviços proibidos a menores (art. 15, §1º, I a VII, que inclui bebidas alcoólicas e fogos) adotar verificação de idade efetiva, sem autodeclaração (a Lei 15.211/2025, art. 9º, §1º, também veda a autodeclaração para conteúdo, produto ou serviço impróprio ou proibido a menores de 18 anos). O catálogo tem "Gelo e bebidas para festas" (a política diz: bebida alcoólica só a maiores de 18 anos, conferir a idade na entrega) e "Fogos de artifício e pirotecnia", entre outras. O app é "de acesso provável" por menores (art. 1º, parágrafo único)? Intermediar essas ocupações exige verificação de idade no cadastro? A autoridade administrativa é a ANPD (Decreto 12.622/2025, art. 2º). | 3.3 | F5, F6, F7 |
| P7 | Remoção de conteúdo, notificação e reporte. | Itens 10.2 e 10.3. O STF declarou o art. 19 do Marco Civil parcialmente inconstitucional (notícia de 26/06/2025) e concluiu os ajustes da tese em 17/06/2026, com efeitos desde 5/8/2025 (item 13 da tese). O texto segue o art. 20 do Marco Civil (informar o autor do motivo) e a tese do STF (itens 3, 3.2, 7 a 10). A Lei 15.211/2025, art. 27, vale para todo fornecedor disponível no país, e o Decreto 12.880/2026 (arts. 36 a 39) manda reportar ao Centro Nacional de Triagem de Notificações, da Polícia Federal. Os itens 7 a 10 da tese (autorregulação, canal de atendimento, representante no país) valem para provedor de pequeno porte? Notícia do STF de 11/06/2026 diz que o dever de cuidado fica restrito a provedores de grande porte [incerto: li a notícia, não o acórdão; a notícia de 17/06/2026 não repete essa frase]. O processo interno de remoção e reporte precisa de dono e de roteiro (documentos 05 e 08). | 10 | F3, F5, F6, F11, F12, F13, F14 |
| P8 | Mudança unilateral dos Termos e suspensão unilateral da conta. | 1.4: a nova versão só vale depois de novo aceite, e atendimentos já confirmados mantêm a versão em que nasceram. 3.6: motivo avisado, meio de resposta e exclusão livre da conta. O CDC, art. 51, XIII e XI, anula cláusulas que permitam ao fornecedor mudar o contrato depois de celebrado ou cancelá-lo sem igual direito ao consumidor. Prazos de resposta do WorkEasy são decisão de negócio. | 1.4, 3.6 | F1 |
| P9 | Foro e arbitragem. | Consumidor: foro do domicílio, sem arbitragem. Não consumidor: comarca da sede (a definir). CDC, art. 101, I; art. 51, VII e XVII. CPC, art. 63, §1º (redação da Lei 14.879/2024): o foro de eleição exige pertinência com o domicílio de uma das partes ou com o local da obrigação, "ressalvada a pactuação consumerista, quando favorável ao consumidor"; §3º: o juiz pode reputar ineficaz de ofício, antes da citação, a cláusula de foro abusiva. | 14 | F1, F9 |
| P10 | Limite semanal do trabalho doméstico. | Texto alinhado às telas (`LaborLockNotice.tsx`, `pages/pro/Agenda.tsx`, `lib/errors.ts`): "a lei pode tratar ... como relação de emprego (LC 150/2015)". Perguntas: (a) o texto pode ser lido como orientação trabalhista, ou como "porto seguro"? (b) as telas mandam "contratar diretamente" quando o limite é atingido: aceitável? (c) o limite vale por profissional e por casa, então a família pode revezar profissionais: há risco? (d) o parágrafo único do art. 1º da LC 150 proíbe contratar menor de 18 anos para trabalho doméstico (tratar no documento 02). | 5.6 | F4 |
| P11 | Saúde e profissões reguladas. | O catálogo tem 778 ocupações regulamentadas e áreas de saúde, e o produto tem telas de teleconsulta e prontuário só como demonstração. O texto diz: sem aconselhamento, sem telemedicina, sem prontuário. Faltam: regras de publicidade e captação de cada conselho (matriz por conselho, Frente A); se o selo "confirmado pelo WorkEasy" cria expectativa de garantia (CDC, art. 30: informação suficientemente precisa obriga o fornecedor; art. 37); data da consulta no selo (o admin anota como conferiu, mas a tela pública não mostra quando). A regra "sem ranking por nota" (272 ocupações) vem da política, e 1.057 de 1.710 políticas ainda estão "a confirmar". | 2.4, 8, 9 | F1 |
| P12 | Linha Cuidado. | Item 5.7 marcado. Decisão D12 de `DECISOES.md`: abrir só com pessoa jurídica, seguro de responsabilidade civil cotado, advogado trabalhista validando o fluxo e a trava, e 3 famílias atendidas em modo concierge. Hoje o pagamento do plantão é direto entre família e cuidador (a tela do plantão diz isso). A família cadastra dados de terceiro (pessoa cuidada); localização do cuidador é opcional e tem consentimento próprio. | 5.7 | F4 |
| P13 | Preço final no agendamento direto. | O agendamento registra o valor inicial do serviço (`book_direct`) e a tela diz que o valor final é combinado com o profissional. O banco não deixa o cliente nem o profissional mudar o valor registrado, e a cobrança usa esse valor. O texto (6.1) avisa isso. CDC, art. 6º, III e art. 31 (informação clara sobre preço); Decreto 7.962/2013, art. 2º, IV e V. | 6.1 | F1, F2 |
| P14 | Identificação da empresa e da marca. | Decreto 7.962/2013, art. 2º, I e II (nome empresarial, CNPJ e endereços em local de destaque). Hoje o rodapé não traz esses dados e não há página de SAC. A tese do STF (item 10) pede sede e representante no país com contato acessível: uma empresa brasileira atende. O art. 3º, III, do decreto (identificar o fornecedor responsável pelo site e o fornecedor do serviço ofertado) vale para compras coletivas e "modalidades análogas": se um marketplace de serviços é modalidade análoga é [incerto]. As páginas de profissionais mostram o nome de exibição, não CPF ou CNPJ. A marca "WorkEasy" não foi pesquisada no INPI (`DECISOES.md` §8, item 6): o texto não afirma que é marca registrada. | 12.1, 15 | F2, F11 |
| P15 | Registros de acesso. | Marco Civil, art. 15 (6 meses, sob sigilo) e art. 7º, VI (o contrato deve detalhar o regime de proteção desses registros). O item 13.3 só afirma o que a lei exige. Onde os registros ficam (hospedagem, CDN), por quanto tempo e quem acessa precisa ser decidido com o documento 03. | 13.3 | F3 |
| P16 | Cláusulas deixadas de fora de propósito. | (a) Não-contorno para clientes (fechar fora do app): risco de abusividade, CDC, art. 51, IV. (b) Indenização do cliente ao WorkEasy em termos amplos. (c) Cessão livre do contrato. (d) Inversão do ônus da prova contra o consumidor (art. 51, VI). O advogado concorda? | 10, 11 | F1 |

### B. Itens marcados `[incerto]`

1. Se o WorkEasy "funciona como marketplace" na acepção do item 6 da tese do STF (a tese não define o termo) e como combinar os itens 6 e 11 (P1).
2. Alcance do Tema 1.173 do STJ para plataforma de serviços (li só a notícia do STJ, não o acórdão) (P1).
3. Aplicação dos itens 7 a 10 da tese a provedor de pequeno porte (li a notícia de 11/06/2026 e o PDF da tese, não o acórdão) (P7).
4. Razão social e autorização do Asaas no Banco Central: li só o site do próprio Asaas, que se declara "instituição de pagamento e SCFI autorizada pelo Banco Central do Brasil" (item 6.3).
5. Base legal e prazo de guarda dos registros de pagamento e atendimento depois da exclusão da conta. `DECISOES.md` (D7) já marca "[incerto: confirmar prazo com o contador]"; a tela de exclusão diz que "a lei fiscal obriga" (item 3.7).
6. Resolução BCB 150/2021 e LC 214/2025, art. 22, citadas em `DECISOES.md` §4: não abertas aqui (P3).
7. Valor jurídico do aceite do visitante por navegação (P5).
8. Requisitos legais para oferecer telemedicina e prontuário (item 9.5). A regra "empresa registrada no CRM, responsável técnico e prontuário certificado", das diretrizes do produto, não foi conferida em norma.
9. Marca "WorkEasy" no INPI (item 12.1).
10. Se a regra "sem ranking por nota por regra do conselho" vale de fato para cada uma das 272 ocupações marcadas (item 8.2). Depende da matriz por conselho (Frente A).
11. Aplicação do direito de arrependimento (CDC, art. 49) a serviço já iniciado ou executado (item 7.4; documento 04).
12. Se um marketplace de serviços é "modalidade análoga" de compra coletiva para o art. 3º, III, do Decreto 7.962/2013 (P14).
13. Leis e decretos não reabertos em 2026-11-08: planalto.gov.br bloqueou o acesso ("Esta requisição foi bloqueada") para F1 a F6, F9 e F10. Conferir o texto de cada artigo marcado [incerto] antes da publicação. O PDF da tese do STF (F11) não pôde ser lido: os itens 3.2, 6, 8, 10, 11 e 13 não foram reconferidos, e isso afeta também P1, P7 e P8.
14. Decreto 12.880/2026 e art. 41-A da Lei 15.211/2025 ("incluído pela Lei 15.352/2026", vigência em 17/03/2026): não reconferidos. Se a verificação de idade (P6) for exigida, o item 3.3 muda antes da publicação.
15. Prazo do SAC: o documento 10 cita o Decreto 13.135/2026, art. 21, com 7 dias corridos para demandas não urgentes, e adota o prazo mais curto. Este texto (13.4) diz 5 dias, o prazo do Decreto 7.962/2013, art. 4º. Confirmar se o decreto de 2026 se aplica.
16. Estorno com split: a regra do Asaas para estorno de cobrança com divisão, quando a subconta do profissional já sacou, não está publicada (pesquisa/asaas.md, R11). O item 7.2 foi corrigido para o que a integração faz hoje (cartão e Pix), mas esse ponto segue [incerto].
17. Inteligência artificial (itens 4.6 e 5.7): a sugestão de orçamento (quote-assist) e o resumo semanal da linha Cuidado (care-summary) enviam texto a um serviço de IA de terceiros quando a chave está configurada. Confirmar quais campos saem do produto, se o provedor fica fora do Brasil e se o aviso e a informação do texto bastam. O documento 03 já cita o provedor.
18. Edição de avaliação: a ARQUITETURA diz que o autor edita nota e comentário sem prazo. O documento 05 propõe edição livre por 7 dias. Este texto não fala de edição. Decidir e incluir no item 8.

### C. O que o texto pressupõe e o produto ainda não faz

1. **Páginas legais.** `/legal` é um texto provisório ("Documentos em elaboração. Este protótipo não presta serviços nem trata dados reais"). As caixas de aceite em `Entrar.tsx` e `TermsGate.tsx` apontam as duas para `/legal`.
2. **Aviso de protótipo.** `DemoBanner` e o rodapé ("Protótipo de demonstração") dizem que não há serviço real. Precisam sair no lançamento. As telas de demonstração (`/health`, `/doctor`, `/teleconsultation`, `/medical-records`, `/verification`, `/register-provider`, `/dashboard`) continuam nas rotas (item 2.6).
3. **Identificação e SAC.** Não há SAC, nem dados da empresa no rodapé (itens 13.4 e 15).
4. **Cancelar depois de pagar.** Cliente e profissional não têm ação para atendimento "Pago" (`ALLOWED_TRANSITIONS` em `services/bookings.ts`). Depois do pagamento, também não há ação para o cliente quando o profissional não comparece e nunca marca o atendimento como concluído: a contestação só existe a partir de "Concluído" (itens 5.5 e 7.3).
5. **Idade.** Nada no código pede ou confere a idade (item 3.3). A regra de uma conta por pessoa também não é imposta pelo sistema (item 3.4).
6. **Valor final.** Não há como alterar o valor registrado de um atendimento depois de criado (item 6.1).
7. **Pedido.** O banco deixa o cliente cancelar pedido aberto, mas não há função nem botão no app. O texto só diz que o pedido se encerra em 7 dias (item 4.3).
8. **Documentos que vencem.** `provider_documents.expires_at` existe, mas nada o aplica nem avisa (item 2.4, f).
9. **Histórico dos Termos.** Só a string da versão fica registrada, não o texto de cada versão (item 1.5).
10. **Registros de acesso.** Não há definição de onde ficam (item 13.3).
11. **Pagamento retido na tela.** Se `escrow_enabled` for ligado, `PaymentPanel.tsx` passa a dizer "Pagamento retido: o valor só é repassado ao profissional depois que o atendimento é concluído e liberado", mas `payments-create` nunca retém o valor. Ligar a chave sem implementar a retenção faria a tela prometer o que o sistema não faz (item 6.6).
12. **Menu Cuidado.** `navModelFor` (`components/navItems.ts`) mostra "Cuidado" a todo cliente com sessão, enquanto `DECISOES.md` (D12) manda não divulgar o menu antes dos pré-requisitos (item 5.7).
13. **Dados de saúde na linha Cuidado.** A tela diz "O WorkEasy não guarda dados de saúde", mas campos de texto livre (preferências, contato de emergência, observações do plantão, descrição do pedido) podem receber esse tipo de dado. O item 5.7 (c) diz só que o app "não foi feito para guardar" tais dados.
14. **Documento de arquitetura.** A tabela de rotas de `ARQUITETURA.md` diz que o login é "por código (e-mail ou WhatsApp/SMS)", mas `services/auth.ts` envia o código só por e-mail ou SMS. O texto (item 3.1) segue o código.
15. **Textos das lojas.** `docs/lojas/app-store.md` descreve o perfil como "informado" ou "conferido pela equipe", enquanto o produto e estes Termos dizem "confirmado pelo WorkEasy". Alinhar as lojas com o produto.

### D. Números do catálogo (calculados de `apps/web/catalog/policies.json` em 2026-10-23)

| Dado | Quantidade |
|---|---|
| Ocupações | 1.710 (em 44 áreas) |
| Política "a confirmar" / "conferido" | 1.057 / 653 |
| Ocupações regulamentadas | 778 |
| Com limite de dias do trabalho doméstico | 32 |
| Que exigem certidão de antecedentes | 631 |
| Sem ranking por nota | 272 |
| Que atendem crianças ou adolescentes | 165 |
| Cobrança: comissão no primeiro serviço / só assinatura / em análise jurídica | 1.111 / 324 / 275 |

### E. Configurações citadas no texto

| Chave de `platform_settings` | Valor inicial | Onde aparece |
|---|---|---|
| `proposal_limit` | 3 | 4.2 |
| `labor_lock_days_per_week` | 2 | 5.6, 5.7 |
| `commission_enabled` | false | 6.6 |
| `escrow_enabled` | false | 6.6. Hoje só muda um texto da tela de pagamento: `payments-create` grava `escrow: false` sempre. |

### F. Antes de publicar

1. Preencher os seis dados da empresa e apagar toda marca `[PLANEJADO]` que ainda não exista no produto.
2. Resolver cada `[CONDICIONAL: depende de parecer]`: manter com o texto aprovado, ou apagar o recurso do produto e do texto.
3. Publicar o texto em página própria, com a versão no topo, e atualizar `CONSENT_VERSIONS.terms` em `apps/web/config/legal.ts` para a versão publicada (isso faz o app pedir novo aceite).
4. Separar os dois links da caixa de aceite (Termos e Privacidade), cada um para o seu texto.
5. Mostrar o texto em fonte de pelo menos corpo 12 (CDC, art. 54, §3º) e com as cláusulas restritivas em destaque (art. 54, §4º).
6. Colocar identificação da empresa e SAC no rodapé do site, do app e das lojas.
7. Remover `DemoBanner`, o "Protótipo de demonstração" do rodapé e as telas de demonstração, ou mantê-las com o aviso que o item 2.6 descreve.
8. Rodar `test/claims-guard.test.ts` depois de copiar qualquer trecho deste texto para o código do app.

## Fontes consultadas

Todas abertas em 2026-10-23. Os textos de lei (F1 a F10) e o PDF da tese do STF (F11) foram baixados do site oficial e lidos no original, artigo por artigo. As páginas do STF (F12 a F14), do STJ (F15), do Ministério da Saúde (F16), do Consumidor.gov.br (F17) e do Asaas (F18) foram lidas por uma ferramenta de leitura de páginas, que devolve resumo e trechos curtos; por isso os trechos dessas fontes, abaixo, são curtos. Resultados de busca na internet (sites de escritórios de advocacia e de entidades) serviram só para achar as fontes primárias: não foram abertos nem usados como base.

### Lista de fontes

| Id | Fonte | Partes lidas | URL | Aberta em (UTC) |
|---|---|---|---|---|
| F1 | Lei 8.078/1990 (Código de Defesa do Consumidor), texto compilado | arts. 2, 3, 6, 7, 14, 20, 25, 30, 31, 34, 35, 37, 46, 47, 49, 51, 54, 101 | https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm | 2026-10-23 14:24 |
| F2 | Decreto 7.962/2013 (comércio eletrônico) | arts. 1 a 6 | https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm | 2026-10-23 14:24 |
| F3 | Lei 12.965/2014 (Marco Civil da Internet) | arts. 7, 15, 19, 20, 21 | https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm | 2026-10-23 14:25 |
| F4 | Lei Complementar 150/2015 (trabalho doméstico) | art. 1 e parágrafo único | https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp150.htm | 2026-10-23 14:27 |
| F5 | Lei 15.211/2025 (ECA Digital) | arts. 1 a 15, 22, 23, 26 a 28, 32, 40 e 41-A (art. 2 lido em parte) | https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm | 2026-10-23 14:27 |
| F6 | Decreto 12.880/2026 (regulamenta a Lei 15.211/2025) | arts. 1, 2, 14 a 19, 36 a 40 | https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12880.htm | 2026-10-23 14:34 |
| F7 | Decreto 12.622/2025 (ANPD como autoridade do ECA Digital) | arts. 1 e 2 | https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12622.htm | 2026-10-23 14:34 |
| F8 | Lei 10.406/2002 (Código Civil), texto compilado | arts. 3 a 5 | https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm | 2026-10-23 14:28 |
| F9 | Lei 13.105/2015 (Código de Processo Civil), texto compilado | art. 63 | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13105.htm | 2026-10-23 14:29 |
| F10 | Lei 12.865/2013 | art. 6 | https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12865.htm | 2026-10-23 14:30 |
| F11 | STF, tese de repercussão geral dos Temas 987 e 533 (RE 1.037.396 e RE 1.057.258), redação final (PDF de 4 páginas, ligado na notícia de 17/06/2026) | itens 1 a 14 | https://noticias-stf-wp-prd.s3.sa-east-1.amazonaws.com/wp-content/uploads/wpallimport/uploads/2026/06/17180658/MCI_tese.pdf | 2026-10-23 14:26 |
| F12 | STF, notícia de 26/06/2025, "STF define parâmetros para responsabilização de plataformas por conteúdos de terceiros" | decisão sobre o art. 19 do Marco Civil | https://noticias.stf.jus.br/postsnoticias/stf-define-parametros-para-responsabilizacao-de-plataformas-por-conteudos-de-terceiros/ | 2026-10-23 |
| F13 | STF, notícia de 17/06/2026, "Plataformas terão 60 dias para implementar medidas estruturais, decide STF" | conclusão dos embargos, prazo de 60 dias, efeitos desde 5/8/2025 | https://noticias.stf.jus.br/postsnoticias/plataformas-terao-60-dias-para-implementar-medidas-estruturais-decide-stf/ | 2026-10-23 |
| F14 | STF, notícia de 11/06/2026, "STF avança na discussão de ajustes na tese do Marco Civil da Internet" | dever de cuidado restrito a provedores de grande porte | https://noticias.stf.jus.br/postsnoticias/stf-avanca-na-discussao-de-ajustes-na-tese-do-marco-civil-da-internet/ | 2026-10-23 |
| F15 | STJ, notícia de 26/01/2026, "Corretor não é responsável por danos causados por construtora" (Tema 1.173, REsp 2.008.542) | regra geral e exceções | https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/2026/26012026-Em-regra--corretor-de-imoveis-nao-responde-por-descumprimento-de-obrigacoes-da-construtora.aspx | 2026-10-23 |
| F16 | Ministério da Saúde, "SAMU 192" | número e horário | https://www.gov.br/saude/pt-br/composicao/saes/samu-192 | 2026-10-23 |
| F17 | Consumidor.gov.br, "Conheça o Consumidor.gov.br" | o que é o serviço | https://www.consumidor.gov.br/pages/conteudo/publico/1 | 2026-10-23 |
| F18 | Asaas, página "Sobre nós" (fonte do próprio Asaas, não é registro oficial) | autodeclaração de instituição de pagamento; rodapé com razão social e CNPJ | https://www.asaas.com/sobre-nos | 2026-10-23 |

### Reabertura em 2026-11-08

- **Reabertas e conferidas (7 de 18):** F12 (STF, 26/06/2025: art. 19 do Marco Civil "parcialmente inconstitucional", confirmado); F13 (STF, 17/06/2026: conclusão dos aperfeiçoamentos, prazo de 60 dias e efeitos desde 5/8/2025, confirmados); F14 (STF, 11/06/2026: frase sobre "dever de cuidado" e "grande porte" confirmada, mas a notícia de 17/06/2026 não a repete); F15 (STJ, 26/01/2026: Tema 1.173, REsp 2.008.542, regra geral e exceções, confirmados); F16 (SAMU 192: gratuito, 24 horas, 7 dias por semana, confirmado); F17 (Consumidor.gov.br: serviço público e gratuito, confirmado); F18 (Asaas: autodeclaração de instituição de pagamento e razão social no rodapé, confirmadas; não é registro do Banco Central, que segue [incerto]).
- **Não reabertas (11):** F1 a F6, F9 e F10 (planalto.gov.br respondeu "Esta requisição foi bloqueada"; a leitura de 2026-10-23 não foi reconferida); F11 (PDF da tese: conteúdo comprimido, não legível); F7 e F8 (não tentadas nesta data). As citações de lei afetadas estão marcadas [incerto].
- **Busca de novas fontes:** o limite de buscas da sessão foi atingido; nenhuma fonte nova foi usada.

### Trechos lidos (curtos, como estão nas fontes)

- **F1, art. 3º:** "Fornecedor é toda pessoa física ou jurídica, pública ou privada, nacional ou estrangeira, [...] que desenvolvem atividade de [...] prestação de serviços."
- **F1, art. 6º, III:** "a informação adequada e clara sobre os diferentes produtos e serviços, com especificação correta de quantidade, características, composição, qualidade, tributos incidentes e preço, bem como sobre os riscos que apresentem;"
- **F1, art. 7º, parágrafo único:** "Tendo mais de um autor a ofensa, todos responderão solidariamente pela reparação dos danos previstos nas normas de consumo."
- **F1, art. 14, caput:** "O fornecedor de serviços responde, independentemente da existência de culpa, pela reparação dos danos causados aos consumidores por defeitos relativos à prestação dos serviços, bem como por informações insuficientes ou inadequadas sobre sua fruição e riscos."
- **F1, art. 14, §4º:** "A responsabilidade pessoal dos profissionais liberais será apurada mediante a verificação de culpa."
- **F1, art. 20, caput e incisos:** "[...] podendo o consumidor exigir, alternativamente e à sua escolha: I - a reexecução dos serviços, sem custo adicional e quando cabível; II - a restituição imediata da quantia paga, monetariamente atualizada, sem prejuízo de eventuais perdas e danos; III - o abatimento proporcional do preço."
- **F1, art. 25:** "É vedada a estipulação contratual de cláusula que impossibilite, exonere ou atenue a obrigação de indenizar prevista nesta e nas seções anteriores. § 1° Havendo mais de um responsável pela causação do dano, todos responderão solidariamente [...]."
- **F1, art. 30:** "Toda informação ou publicidade, suficientemente precisa, veiculada por qualquer forma ou meio de comunicação com relação a produtos e serviços oferecidos ou apresentados, obriga o fornecedor que a fizer veicular ou dela se utilizar e integra o contrato que vier a ser celebrado."
- **F1, art. 34:** "O fornecedor do produto ou serviço é solidariamente responsável pelos atos de seus prepostos ou representantes autônomos."
- **F1, art. 46:** "Os contratos que regulam as relações de consumo não obrigarão os consumidores, se não lhes for dada a oportunidade de tomar conhecimento prévio de seu conteúdo, ou se os respectivos instrumentos forem redigidos de modo a dificultar a compreensão de seu sentido e alcance."
- **F1, art. 49:** "O consumidor pode desistir do contrato, no prazo de 7 dias a contar de sua assinatura ou do ato de recebimento do produto ou serviço, sempre que a contratação de fornecimento de produtos e serviços ocorrer fora do estabelecimento comercial, especialmente por telefone ou a domicílio." Parágrafo único: "[...] os valores eventualmente pagos, a qualquer título, durante o prazo de reflexão, serão devolvidos, de imediato, monetariamente atualizados."
- **F1, art. 51 (trechos):** I "impossibilitem, exonerem ou atenuem a responsabilidade do fornecedor por vícios de qualquer natureza dos produtos e serviços ou impliquem renúncia ou disposição de direitos. Nas relações de consumo entre o fornecedor e o consumidor pessoa jurídica, a indenização poderá ser limitada, em situações justificáveis"; VII "determinem a utilização compulsória de arbitragem"; XI "autorizem o fornecedor a cancelar o contrato unilateralmente, sem que igual direito seja conferido ao consumidor"; XIII "autorizem o fornecedor a modificar unilateralmente o conteúdo ou a qualidade do contrato, após sua celebração"; XVII "condicionem ou limitem de qualquer forma o acesso aos órgãos do Poder Judiciário"; §2º "A nulidade de uma cláusula contratual abusiva não invalida o contrato, exceto quando de sua ausência, apesar dos esforços de integração, decorrer ônus excessivo a qualquer das partes."
- **F1, art. 54, §§3º e 4º:** "Os contratos de adesão escritos serão redigidos em termos claros e com caracteres ostensivos e legíveis, cujo tamanho da fonte não será inferior ao corpo doze [...]"; "As cláusulas que implicarem limitação de direito do consumidor deverão ser redigidas com destaque, permitindo sua imediata e fácil compreensão."
- **F1, art. 101, I:** "a ação pode ser proposta no domicílio do autor;"
- **F2, art. 2º, I e II:** (I) "nome empresarial e número de inscrição do fornecedor, quando houver, no Cadastro Nacional de Pessoas Físicas ou no Cadastro Nacional de Pessoas Jurídicas do Ministério da Fazenda;" (II) "endereço físico e eletrônico, e demais informações necessárias para sua localização e contato;" tudo "em local de destaque e de fácil visualização".
- **F2, art. 4º, I e V:** "apresentar sumário do contrato antes da contratação, com as informações necessárias ao pleno exercício do direito de escolha do consumidor, enfatizadas as cláusulas que limitem direitos;"; "manter serviço adequado e eficaz de atendimento em meio eletrônico, que possibilite ao consumidor a resolução de demandas referentes a informação, dúvida, reclamação, suspensão ou cancelamento do contrato;". Parágrafo único: "A manifestação do fornecedor às demandas previstas no inciso V do caput será encaminhada em até cinco dias ao consumidor."
- **F2, art. 5º, caput e §1º:** "O fornecedor deve informar, de forma clara e ostensiva, os meios adequados e eficazes para o exercício do direito de arrependimento pelo consumidor."; "O consumidor poderá exercer seu direito de arrependimento pela mesma ferramenta utilizada para a contratação, sem prejuízo de outros meios disponibilizados."
- **F3, art. 7º, VI e XIII:** "informações claras e completas constantes dos contratos de prestação de serviços, com detalhamento sobre o regime de proteção aos registros de conexão e aos registros de acesso a aplicações de internet [...]"; "aplicação das normas de proteção e defesa do consumidor nas relações de consumo realizadas na internet."
- **F3, art. 15, caput:** "O provedor de aplicações de internet constituído na forma de pessoa jurídica e que exerça essa atividade de forma organizada, profissionalmente e com fins econômicos deverá manter os respectivos registros de acesso a aplicações de internet, sob sigilo, em ambiente controlado e de segurança, pelo prazo de 6 (seis) meses, nos termos do regulamento."
- **F3, art. 19, caput (texto da lei):** "[...] somente poderá ser responsabilizado civilmente por danos decorrentes de conteúdo gerado por terceiros se, após ordem judicial específica, não tomar as providências [...]". O STF declarou o artigo parcialmente inconstitucional (F11, item 1).
- **F3, art. 20, caput:** "Sempre que tiver informações de contato do usuário diretamente responsável pelo conteúdo a que se refere o art. 19, caberá ao provedor de aplicações de internet comunicar-lhe os motivos e informações relativos à indisponibilização de conteúdo [...], salvo expressa previsão legal ou expressa determinação judicial fundamentada em contrário."
- **F4, art. 1º:** "Ao empregado doméstico, assim considerado aquele que presta serviços de forma contínua, subordinada, onerosa e pessoal e de finalidade não lucrativa à pessoa ou à família, no âmbito residencial destas, por mais de 2 (dois) dias por semana, aplica-se o disposto nesta Lei." Parágrafo único: "É vedada a contratação de menor de 18 (dezoito) anos para desempenho de trabalho doméstico [...]."
- **F5, art. 1º:** "[...] aplica-se a todo produto ou serviço de tecnologia da informação direcionado a crianças e a adolescentes no País ou de acesso provável por eles [...]." Parágrafo único, I a III: "suficiente probabilidade de uso e atratividade [...]"; "considerável facilidade ao acesso e utilização [...]"; "significativo grau de risco à privacidade, à segurança ou ao desenvolvimento biopsicossocial de crianças e de adolescentes [...]".
- **F5, art. 9º, §1º:** "[...] deverão ser adotados mecanismos confiáveis de verificação de idade a cada acesso do usuário ao conteúdo, produto ou serviço de que trata o caput deste artigo, vedada a autodeclaração."
- **F5, art. 27, caput:** "Os fornecedores de produtos ou serviços de tecnologia da informação disponíveis no território nacional deverão remover e comunicar os conteúdos de aparente exploração, de abuso sexual, de sequestro e de aliciamento detectados em seus produtos ou serviços, direta ou indiretamente, às autoridades nacionais e internacionais competentes, na forma de regulamento."
- **F5, art. 41-A (incluído pela Lei 15.352/2026):** "Esta Lei entra em vigor em 17 de março de 2026."
- **F6, art. 2º, VII:** "autodeclaração de idade - método limitado à indicação da idade, da faixa etária ou de outro dado pessoal fornecido pelo próprio usuário, sem evidências adicionais para confirmar a veracidade ou a titularidade da informação."
- **F6, art. 15, §1º (incisos II e V):** "bebidas alcoólicas, nos termos do disposto nos art. 81, caput, inciso II, e art. 243 da Lei nº 8.069 [...]"; "fogos de estampido e de artifício, exceto aqueles que, pelo seu reduzido potencial, sejam incapazes de provocar qualquer dano físico em caso de utilização indevida [...]".
- **F6, art. 18, caput:** "O fornecedor que oferte ou intermedeie a compra e a venda de produtos e serviços proibidos para crianças e adolescentes a que se refere o art. 15, § 1º, incisos I a VII, deverá implementar mecanismos efetivos de verificação de idade, nos termos estabelecidos pela ANPD [...]." Incisos I e II: no cadastro, "vedado o desbloqueio por autodeclaração", ou na aquisição.
- **F6, art. 39 (resumo):** os fornecedores comunicam ao Centro Nacional de Triagem de Notificações, da Polícia Federal (arts. 36 e 37), as violações do art. 27 da Lei 15.211/2025.
- **F8, art. 5º, caput:** "A menoridade cessa aos dezoito anos completos, quando a pessoa fica habilitada à prática de todos os atos da vida civil."
- **F9, art. 63, §1º (redação da Lei 14.879/2024):** "A eleição de foro somente produz efeito quando constar de instrumento escrito, aludir expressamente a determinado negócio jurídico e guardar pertinência com o domicílio ou a residência de uma das partes ou com o local da obrigação, ressalvada a pactuação consumerista, quando favorável ao consumidor." §3º: "Antes da citação, a cláusula de eleição de foro, se abusiva, pode ser reputada ineficaz de ofício pelo juiz [...]."
- **F10, art. 6º, III, alíneas b e e:** "instituição de pagamento - pessoa jurídica que, aderindo a um ou mais arranjos de pagamento, tenha como atividade principal ou acessória, alternativa ou cumulativamente: [...] b) executar ou facilitar a instrução de pagamento relacionada a determinado serviço de pagamento [...]; [...] e) credenciar a aceitação de instrumento de pagamento;"
- **F11, item 3.2:** "Nas hipóteses de crime ou ato ilícito civil contra a honra, aplica-se o art. 19 do MCI, sem prejuízo da possibilidade de remoção por notificação extrajudicial."
- **F11, item 6 (Marketplaces):** "Os provedores de aplicações de internet que funcionarem como marketplaces respondem civilmente de acordo com o Código de Defesa do Consumidor (Lei nº 8.078/90)."
- **F11, item 8:** "Deverão, igualmente, disponibilizar a usuários e a não usuários canais específicos de atendimento, preferencialmente eletrônicos, que sejam acessíveis e amplamente divulgados nas respectivas plataformas de maneira permanente."
- **F11, item 10 (início):** "Os provedores de aplicações de internet com atuação no Brasil devem constituir e manter sede e representante no país, cuja identificação e informações para contato deverão ser disponibilizadas e estar facilmente acessíveis nos respectivos sítios."
- **F11, item 11:** "Não haverá responsabilidade objetiva na aplicação da tese aqui enunciada."
- **F11, item 13:** efeitos "ex nunc, a partir da data da publicação da ata de julgamento (em 5/8/25)", salvo atos continuados ou permanentes.
- **F12:** o STF decidiu que "é parcialmente inconstitucional a regra do artigo 19 do Marco Civil da Internet".
- **F13:** o STF "concluiu, nesta quarta-feira (17), os aperfeiçoamentos na tese de repercussão geral"; "as plataformas terão 60 dias, a partir do final deste julgamento,".
- **F14:** "A implementação de medidas sobre o dever de cuidado ficará restrita provedores de aplicações de internet de grande porte" (descrito como ponto de consenso na sessão de 11/06/2026, antes da conclusão de 17/06/2026).
- **F15:** "o corretor de imóveis, pessoa física ou jurídica, não é, em regra, responsável por danos causados ao consumidor" (com exceções: envolvimento direto em incorporação e construção, mesmo grupo econômico, confusão ou desvio patrimonial); "atua apenas como intermediário na concretização do negócio".
- **F16:** "O serviço é gratuito, acessado pelo número 192, funciona 24 horas por dia e 07 dias por semana,".
- **F17:** "O Consumidor.gov.br é um serviço público e gratuito que permite a interlocução direta entre consumidores e empresas" [...] "para solução alternativa de conflitos de consumo pela internet."
- **F18:** "Somos uma instituição de pagamento e SCFI autorizada pelo Banco Central do Brasil." Rodapé: "ASAAS Gestão Financeira Instituição de Pagamento S.A. CNPJ: 19.540.550/0001-21".

### Fatos do produto usados (onde conferir)

`apps/web/docs/ARQUITETURA.md` (tabelas, funções, regras de trava, comissão, pagamentos, avaliações, exclusão de conta); `apps/web/docs/DECISOES.md` (D7, D11, D12, §4, §8); `apps/web/config/legal.ts`; `pages/conta/Entrar.tsx`, `pages/conta/Conta.tsx`, `components/TermsGate.tsx`, `services/auth.ts`, `services/account.ts`; `pages/cliente/Pedido.tsx`, `PedidoDetalhe.tsx`, `AtendimentoDetalhe.tsx`, `components/cliente/BookingActions.tsx`, `PaymentPanel.tsx`, `ReviewPanel.tsx`, `RegistryNote.tsx`; `services/bookings.ts` (`ALLOWED_TRANSITIONS`, `DISPUTE_WINDOW_DAYS`); `pages/publico/PaginaPrestador.tsx`, `Agendar.tsx`, `Orcamento.tsx`; `components/cuidado/LaborLockNotice.tsx`, `HealthDataNotice.tsx`, `CheckinPanel.tsx`, `ShiftForm.tsx`; `pages/OccupationPage.tsx`; `components/admin/OccupationCard.tsx`; `supabase/migrations/20261019000003_providers.sql` (`search_providers`), `…05_bookings.sql` (trava, `transition_booking`, `book_direct`, `guard_booking_update`, contato), `…04_marketplace.sql`, `…11_admin.sql` (`admin_resolve_dispute`); `supabase/functions/payments-create/handler.ts`, `_shared/split.ts`; `catalog/policies.json`.

### O que não foi aberto

Acórdão completo do Tema 987 (só a tese em PDF e as notícias do STF); acórdão do Tema 1.173 do STJ (só a notícia); Decreto 11.034/2022 (SAC, documento 10); LGPD e regras da ANPD (documentos 03 e 11); normas e códigos de ética dos conselhos (Frente A); termos de uso do Asaas (pesquisa I01); Resolução BCB 150/2021 e LC 214/2025; registro da marca no INPI; página de autorizações do Banco Central.
