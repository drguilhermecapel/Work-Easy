# Termos do Prestador (profissionais e empresas)

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| Item | Situação |
|---|---|
| Versão | `2026-10-rascunho` (mesma string de `CONSENT_VERSIONS.terms` em `apps/web/config/legal.ts`) |
| Vigência | [DATA DE VIGÊNCIA] |
| Redigido em | 2026-10-23 |
| Quem opera o WorkEasy | [RAZÃO SOCIAL], CNPJ [CNPJ], [ENDEREÇO]. Empresa de tecnologia a constituir. |
| Contatos | SAC: [E-MAIL DO SAC]. Encarregado pelo tratamento de dados pessoais: [E-MAIL DO ENCARREGADO]. |
| Lugar no pacote | Documento 02. Se soma ao 01 (Termos de Uso), 03 (Política de Privacidade), 04 (Política de Cancelamento, Reembolso e Garantia), 05 (Política de Avaliações e Moderação), 10 (SAC e Atendimento) e 11 (Textos de consentimento e avisos). |
| Estado do produto nesta data | Código da branch `claude/plano-restante`. Não está no ar, não tem usuários reais, e o pagamento (Asaas), o WhatsApp e o e-mail nunca foram testados contra os serviços reais. |

## Como ler este rascunho

1. **O que é.** Minuta dos termos que o prestador aceita. As seções "Resumo dos Termos" e "Termos do Prestador" são o texto para o público, depois da revisão. Os anexos, "Pontos para o advogado" e "Fontes consultadas" são internos: não os publique.
2. **Marcas no texto.**
   - **[CONDICIONAL: depende de parecer]**: só vale se o advogado confirmar. O recurso está desligado hoje, ou o ponto jurídico está em aberto.
   - **[PLANEJADO]**: ainda não existe no produto. Se continuar sem existir na data da publicação, apague a frase.
   - **[incerto]**: não consegui confirmar em fonte aberta nesta sessão. Todos estão na seção B de "Pontos para o advogado".
   - [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO], [E-MAIL DO SAC], [E-MAIL DO ENCARREGADO], [DATA DE VIGÊNCIA]: dados da empresa, que ainda não existe.
3. **Remissões.** "(P7)" manda para a pergunta P7 da seção A de "Pontos para o advogado". "(G5)" manda para o descompasso G5 entre o texto e o produto, na seção C (para o dono).
4. **Prazos com †.** Um número seguido de † (por exemplo, "30 dias†") é sugestão minha, sem norma por trás. Estão todos na seção E.
5. **Números que o dono muda sem novo deploy** (preço do Pro, dias de teste, limites) ficam no Anexo I. O corpo diz "o valor vigente", para o texto não envelhecer.
6. **De onde vêm os fatos.** O que o produto faz foi conferido no código e em `apps/web/docs/ARQUITETURA.md` em 2026-10-23 (Anexo II). O que a lei diz foi lido nas fontes da última seção, na mesma data. Nada foi testado com usuários reais.
7. **Cláusulas que restringem direitos** estão em **negrito** no texto, como no documento 01 (CDC, art. 54, §4º). O CDC só vale para o prestador se ele for consumidor da assinatura (P4), mas o destaque ajuda em qualquer caso. As marcas entre colchetes também aparecem em negrito.
8. **Dois pares de palavras parecidas.** No catálogo, "conferido" e "a confirmar" dizem se a base legal da regra foi checada em fonte. No perfil, "informado pelo profissional" e "confirmado pelo WorkEasy" dizem se uma pessoa da equipe conferiu o número do registro. O texto usa cada par no seu sentido.
9. **Quem é "nós".** [RAZÃO SOCIAL], empresa de tecnologia a ser criada, separada de qualquer clínica ou atividade médica do dono.

## Resumo dos Termos do Prestador (sumário do contrato)

| Tema | Em uma frase | Cláusula |
|---|---|---|
| Autonomia | Você presta o serviço por conta própria. O WorkEasy não é seu empregador, sócio nem representante, e não exige horário, volume nem exclusividade. | 4 |
| Cadastro | Você envia os documentos que a política da ocupação pede. A equipe analisa e aprova ocupação por ocupação. O registro aparece como "informado pelo profissional" até a equipe conferir. | 5 e 6 |
| Preço e agenda | O preço e a agenda são seus. Recusar pedido não gera penalidade. | 7 |
| Busca | O plano e o pagamento não mudam a sua posição. | 8 |
| Planos | Grátis: algumas propostas novas por mês. Pro: propostas sem limite e cobranças de clientes seus pelo app. | 9 |
| Assinatura Pro | O preço aparece antes de assinar. Teste grátis uma vez por conta. Cancele quando quiser e mantenha o Pro até o fim do período pago. Atraso tira o Pro depois da carência. | 10 |
| Recebimento | Conta no Asaas, com as regras e tarifas do Asaas. Hoje não há comissão nem pagamento retido. | 11 e 12 |
| Publicidade | Você responde pelas regras do seu conselho. O app mostra a faixa de preço em todas as ocupações. | 13 |
| Impostos | Tributos e notas fiscais são seus. O WorkEasy não emite nota dos seus serviços. | 14 |
| Trabalho doméstico | O app limita a 2 dias por semana com a mesma casa. Isso não prova que não há vínculo. | 15 |
| Conduta | Nada de fraude, conta duplicada, avaliação falsa ou dado de saúde no CRM. | 16 |
| Suspensão | Só por fraude, risco à segurança, quebra de regra ou ordem de autoridade, com aviso e direito de resposta. | 17 |
| Dados | Você decide sobre os dados dos seus clientes. O WorkEasy guarda o seu CRM por sua conta. | 18 |
| Responsabilidade | Você responde pelo serviço. Há indenização, com limites. | 19 |
| Sair | Excluir a conta apaga seus dados pessoais. O registro financeiro fica, sem identificar você. | 20 |
| Conflitos | SAC primeiro, mediação se as partes quiserem, depois a Justiça. Sem arbitragem obrigatória. | 21 |

**Cláusulas que restringem direitos** (em negrito no texto): 3.3, 8.4, 10.7, 11.2, 11.4, 13.5, 13.6, 14.2, 15.4, 17.1, 17.3, 17.6, 19.3, 19.5, 20.4.

## Termos do Prestador

Estes Termos do Prestador ("Termos") são um contrato entre você e [RAZÃO SOCIAL] (CNPJ [CNPJ]), que opera o WorkEasy. Leia com calma. Se algo não estiver claro, pergunte ao SAC antes de aceitar.

### Palavras que usamos

| Palavra | Significa |
|---|---|
| WorkEasy | O site, os aplicativos e as telas operados por [RAZÃO SOCIAL] ("nós"). |
| Prestador | Pessoa física autônoma, MEI ou empresa que oferece serviços pelo WorkEasy. No app e nos Termos de Uso, aparece como "profissional". Nestes Termos, "você". |
| Cliente | Quem tem conta no WorkEasy e pede ou agenda um serviço. |
| Política da ocupação | A regra do catálogo que diz o que se exige de quem presta aquele serviço: documentos, registro, modelo de cobrança, notas, limite de dias no trabalho doméstico. |
| Pedido, proposta, atendimento | O pedido é o texto em que o cliente descreve o que precisa. A proposta é a resposta de um prestador, com preço e validade. O atendimento é o serviço combinado, com data, hora e preço. |
| Cliente próprio | Cliente que você trouxe e cadastrou em "Clientes" (origem "próprio"). Não passa pelo marketplace. |
| Plano grátis e plano Pro | Os dois planos do prestador (cláusula 9). |
| Conta de recebimento | Sua conta no Asaas, aberta pelo WorkEasy com os dados que você informa (cláusula 11). |
| Equipe | As pessoas do WorkEasy que analisam cadastros, atendem o SAC e decidem contestações. |

### 1. Quem somos e o que são estes Termos

**1.1** O WorkEasy é um site e um conjunto de aplicativos operados por [RAZÃO SOCIAL], CNPJ [CNPJ], com sede em [ENDEREÇO].

**1.2** No WorkEasy, clientes encontram prestadores, pedem propostas e agendam serviços. O prestador também usa ferramentas de gestão: agenda, clientes, orçamentos e cobranças.

**1.3** O serviço é combinado entre você e o seu cliente. O WorkEasy não presta o serviço, não escolhe quem atende e não garante resultado, preço, prazo ou pagamento. O WorkEasy não é seu empregador, sócio, representante nem franqueador. Estas frases descrevem os papéis. Elas não retiram direitos que a lei dá ao cliente consumidor (cláusula 19). *(P1, P20)*

**1.4** Estes Termos valem para quem se cadastra como prestador: profissional autônomo, MEI ou empresa. Eles se somam aos Termos de Uso, à Política de Privacidade, à Política de Cancelamento, Reembolso e Garantia e à Política de Avaliações e Moderação. Se houver conflito sobre a sua atuação como prestador, valem estes Termos.

**1.5** Dúvidas e pedidos: [E-MAIL DO SAC]. Assuntos de dados pessoais: [E-MAIL DO ENCARREGADO].

### 2. Quem pode ser prestador

**2.1 Pessoa física.** Ter 18 anos completos e capacidade para contratar. Hoje o app não confere a idade sozinho: vale a sua declaração. A lei proíbe contratar menor de 18 anos para trabalho doméstico (LC 150/2015, art. 1º, parágrafo único).

**2.2 Empresa, inclusive MEI.** Quem cria o cadastro declara que pode representá-la e responde pelos dados que informa.

**2.3 Ocupações só para empresa licenciada.** Para algumas ocupações, a política diz "somente empresas licenciadas". Nelas, você declara atuar por empresa que tem a licença, o alvará ou a autorização exigidos, e envia os documentos da política. Hoje o app só confere isso pelos documentos: o cadastro não tem campo para o CNPJ nem para a licença do prestador. **[PLANEJADO]** Campos próprios para o CNPJ e a licença. *(G8)*

**2.4 Uma conta por prestador.** Cada pessoa ou empresa tem uma conta de prestador. Não compartilhe o acesso e não abra contas extras para fugir de limite, do teste grátis ou de uma regra destes Termos.

**2.5 O que é seu.** O registro no conselho, a licença, o curso e o seguro que a sua profissão exige são seus. O WorkEasy não concede nenhum deles e não os substitui.

### 3. Aceite, versões e mudanças

**3.1 Aceite.** Ao criar o cadastro de prestador, você marca que leu e aceita estes Termos. **[PLANEJADO]** Hoje o app pede o aceite dos Termos de Uso e da Política de Privacidade, no login e ao abrir a área do prestador, e guarda a data e a versão aceitas. Não há aceite separado destes Termos. *(P3, G1)*

**3.2 Versão.** Cada versão tem um identificador. Esta é a `2026-10-rascunho`.

**3.3 Mudanças.** Quando estes Termos mudarem, a versão muda e o app pede novo aceite antes de você continuar. **Mudança que piora a sua situação (preço, comissão, regras de suspensão) é avisada no app e por e-mail ou mensagem pelo menos 30 dias† antes de valer, e não muda o que já foi combinado com clientes.** Correção de erro e adequação a mudança na lei podem valer na data em que a lei exigir. Se não concordar, você cancela a assinatura e exclui a conta antes da nova versão valer, sem multa. *(P22)*

**3.4 Histórico.** **[PLANEJADO]** Publicar a versão em vigor e as anteriores, cada uma com a data em que valeu. Hoje o app guarda só o identificador da versão que você aceitou, não o texto.

### 4. Autonomia

**4.1** Você presta o serviço por conta própria, com os seus meios e por sua conta e risco. Entre você e o WorkEasy não há relação de emprego, sociedade, agência, representação ou franquia. *(P1)*

**4.2** Na prática, o WorkEasy:

- (a) não define os seus dias nem os seus horários: você cadastra a sua agenda e a muda quando quiser;
- (b) não exige número mínimo de pedidos, de horas ou de tempo no app;
- (c) não obriga você a aceitar pedido, proposta ou agendamento;
- (d) não pune quem recusa: recusar não gera multa, não reduz o que você recebe e não muda a sua posição nas buscas;
- (e) não exige exclusividade: você pode atender por outras plataformas e por clientes seus;
- (f) não diz como executar o serviço e não fornece ferramenta, veículo, local nem uniforme;
- (g) não paga salário nem remuneração: quem paga o serviço é o cliente.

**4.3** O WorkEasy tem regras de plataforma. Elas não são ordens sobre o seu trabalho: cadastro e documentos (cláusulas 5 e 6), limites de propostas (cláusulas 7 e 9), trava de dias do trabalho doméstico (cláusula 15) e regras de conduta (cláusula 16).

**4.4** O preço, a agenda, os bairros e os serviços que você oferece são decisões suas (cláusula 7). Os seus tributos, a sua previdência e os seus seguros também são seus (cláusulas 14 e 19).

### 5. Cadastro, conferências e aprovação

**5.1 Entrada.** Você entra com um código enviado ao seu e-mail ou celular, sem senha. Mantenha esse e-mail ou celular sob seu controle e avise o SAC se perder o acesso. Os avisos do WorkEasy vão para o contato confirmado no login.

**5.2 Passos.** O cadastro tem quatro passos: (1) perfil: nome de exibição, endereço da sua página, ocupação principal e, quando a ocupação exige, o número do registro e a UF; (2) bairros que você atende; (3) documentos que a política da ocupação pede; (4) envio para análise. Até você enviar, a situação é "Rascunho" e você não aparece nas buscas, não recebe pedidos e não cobra clientes.

**5.3 Política da ocupação.** Cada ocupação tem uma política, mostrada nas páginas da ocupação. Ela diz: se a profissão é regulamentada e por qual conselho; que registro e documentos se pedem; se há certidão de antecedentes; o modelo de cobrança (cláusula 12); se as notas aparecem (cláusula 8); se vale a trava do trabalho doméstico (cláusula 15); se o serviço atende crianças ou adolescentes; as unidades de preço; e os locais de atendimento.

**5.4 Política "a confirmar".** Parte das políticas ainda mostra "base legal a confirmar com advogado". Quando uma política mudar, podemos pedir documentos novos, e avisamos você no app.

**5.5 Registro profissional.** O número do registro é informado por você. A página mostra "informado pelo profissional" até uma pessoa da equipe conferir; só então mostra "confirmado pelo WorkEasy". A conferência é feita pela equipe, caso a caso. O WorkEasy não garante que o seu registro continue regular: isso é entre você e o conselho.

**5.6 Certidão de antecedentes criminais.** Só é pedida quando a política da ocupação exige (por exemplo, nas que atendem crianças ou adolescentes). Você mesmo obtém a certidão e a envia. O app só a usa para analisar o seu cadastro, e só depois de você autorizar. O WorkEasy não consulta bases de antecedentes por conta própria. Você pode retirar a autorização em "Minha conta". Se retirar, não usamos mais a certidão e podemos pedir que você a envie de novo ou deixar de aprovar as ocupações que a exigem. Hoje a retirada não apaga o arquivo nem retira a aprovação sozinha. **[PLANEJADO]** *(P18, G11)*

**5.7 Prazo e avisos.** A fila de análise é ordenada pela data do cadastro. Não prometemos prazo de análise. O app mostra a situação do cadastro (Rascunho, Em análise, Aprovado, Suspenso), mas não envia mensagem quando ela muda. **[PLANEJADO]** Aviso por mensagem. *(G2)*

**5.8 Aprovação por ocupação.** A aprovação vale para cada ocupação. Só a ocupação aprovada, com registro não recusado, aparece na busca e na sua página pública, recebe pedidos, aceita proposta e pode ser agendada. A primeira aprovação do cadastro aprova as ocupações cujos documentos já foram aceitos. As outras, e as que você incluir depois, são aprovadas uma a uma. Reativar um cadastro suspenso não aprova ocupação nova.

**5.9 Recusa.** Podemos recusar o cadastro, uma ocupação ou um documento se faltar documento, se houver inconsistência ou falsidade, se a ocupação exigir algo que o app ainda não consegue conferir, ou se a lei ou o conselho impedirem. O motivo da recusa de um documento aparece no app. Para a recusa de registro ou de ocupação, peça o motivo ao SAC, que responde por escrito. *(G2)*

### 6. Documentos, validade, recusa e pedido de revisão

**6.1 Arquivos.** Envie foto (JPG, PNG, WebP ou HEIC) ou PDF de até 10 MB por documento. Os arquivos ficam em um espaço privado, visível só para você e para a equipe que analisa o cadastro.

**6.2 Cada envio é um documento novo.** Você pode apagar um arquivo que ainda não foi analisado. Depois de analisado, só a equipe o apaga.

**6.3 Validade.** Mantenha os documentos válidos. O app ainda não controla validade sozinho: não avisa quando um documento vence e não retira a aprovação por vencimento. **[PLANEJADO]** Enquanto isso, podemos pedir a renovação a qualquer momento, e a aprovação pode ser retirada se você não a enviar. *(G4)*

**6.4 Documento que deixa de valer.** Se um documento já aceito passar a ser recusado, ou for apagado pela equipe, o app retira a aprovação das ocupações que dependiam só dele, e elas saem da busca. Aceitar o documento de novo não devolve a aprovação: a equipe precisa aprová-la outra vez.

**6.5 Pedido de revisão.** Se discordar de uma recusa, envie um documento novo ou escreva para [E-MAIL DO SAC] dizendo o que mudou. Respondemos por escrito, com a decisão e o motivo, em até 10 dias úteis†. **[PLANEJADO]** Pedido de revisão dentro do app. *(G3, P22)*

### 7. Preço, agenda, pedidos e recusa

**7.1 Preço.** Você define o preço de cada serviço: valor mínimo, valor máximo (opcional) e unidade. A unidade precisa ser uma das que a política da ocupação permite. Nas propostas, o preço é o que você escrever. O WorkEasy não fixa preço mínimo nem máximo.

**7.2 Agendamento direto.** O agendamento feito pela sua página é registrado pelo menor valor da faixa do serviço escolhido, sem multiplicar pela duração. Cadastre o valor mínimo pensando nisso. O que você publica é oferta sua: cumpra o que ofereceu.

**7.3 Agenda.** Você cadastra os dias e horários em que atende e as suas folgas. O app não deixa dois atendimentos ativos se sobreporem na sua agenda. O agendamento direto só aceita horário livre, dentro da sua agenda e fora das folgas. O pedido de horário fica "Solicitado" até você aceitar ou recusar.

**7.4 Bairros.** Você escolhe os bairros de São Paulo que atende e só recebe pedidos desses bairros.

**7.5 Pedidos e propostas.** Você vê os pedidos abertos da sua ocupação aprovada, nos bairros que atende, sem o nome, o telefone nem o e-mail do cliente. Cada pedido recebe no máximo um número de propostas ativas (Anexo I). Depois de enviada, você pode retirar a proposta; no plano grátis, a vaga do mês não volta (cláusula 9).

**7.6 Recusa sem penalidade.** Você pode ignorar um pedido, recusar um pedido de horário que ainda não aceitou, retirar uma proposta e desligar "Receber pedidos novos de clientes pelo WorkEasy" quando quiser. Nada disso gera multa, desconto, perda de posição na busca ou suspensão. Desligar essa opção não tira sua página do ar nem cancela atendimentos já combinados.

**7.7 Depois de aceitar.** Cancelar um atendimento que você já aceitou é diferente de recusar: o cliente conta com o horário. O cancelamento segue a Política de Cancelamento, Reembolso e Garantia. Depois do pagamento, ou com o atendimento em andamento, o app não deixa você cancelar sozinho: fale com o SAC. Cancelamentos repetidos e sem motivo podem ser tratados como quebra de regra (cláusula 17), sempre com aviso. *(P1)*

**7.8 Clientes próprios.** Atendimentos que você marca com clientes seus (em "Agenda", a partir de "Clientes") são só seus: não passam pelo marketplace, nunca têm comissão e o cliente não vê nada no app. Eles ocupam a sua agenda e contam na trava da cláusula 15.

### 8. Como você aparece nas buscas

**8.1 Quem aparece.** Aparece quem tem o cadastro aprovado na ocupação buscada, com o registro dessa ocupação não recusado, e atende o bairro buscado.

**8.2 Ordem.** Quando a política da ocupação permite ordenar por nota, quem tem pelo menos 3 avaliações publicadas vem primeiro, pela média das notas; os demais vêm depois, em ordem de nome. Quando a política não permite, a ordem é embaralhada a cada dia, igual durante o dia para quem pesquisa, e as notas não entram.

**8.3 Plano e pagamento.** O plano (grátis ou Pro) não muda a sua posição. Hoje o WorkEasy não vende destaque na busca.

**8.4 Avaliações.** Só o cliente de um atendimento concluído e pago pelo app pode avaliar. Onde a política não permite ordenar por nota, as avaliações do seu trabalho ficam visíveis só para você e para a equipe, e a sua página não mostra nota. Você não edita nem apaga avaliações. **A equipe pode ocultar uma avaliação que viole a Política de Avaliações e Moderação.** Se você discordar de uma avaliação, peça moderação ao SAC.

**8.5 O que é automático.** Hoje são automáticos: a ordem da busca (8.2); o limite de propostas (cláusula 9); a retirada da aprovação quando um documento deixa de ser aceito (6.4); e a mudança de plano conforme a situação do pagamento (cláusula 10). A suspensão de um cadastro (cláusula 17) é sempre decisão de uma pessoa da equipe. Hoje não usamos inteligência artificial para decidir sobre o seu cadastro, o seu preço ou a sua posição. *(P2)*

### 9. Plano grátis e plano Pro

**9.1 Dois planos.** Hoje os dois planos incluem perfil e página pública, serviços, agenda, clientes e orçamentos. O que muda entre eles está em 9.2 e 9.3.

**9.2 Plano grátis.** Inclui um número de propostas novas por mês civil (fuso de São Paulo), conforme o Anexo I. Conta a proposta criada: retirar não devolve a vaga. Passado o limite, o app avisa, e as propostas voltam no mês seguinte.

**9.3 Plano Pro.** Hoje inclui: (a) propostas sem limite mensal nos pedidos da plataforma; e (b) cobranças de clientes seus por Pix, boleto e cartão, feitas na sua conta de recebimento (cláusula 11), sem taxa do WorkEasy. O limite de propostas ativas por pedido vale para os dois planos.

**9.4 Mudança do que cada plano inclui.** Podemos mudar o que cada plano inclui. Se tirarmos algo do plano que você já paga, avisamos pelo menos 30 dias† antes (item 3.3).

### 10. Assinatura Pro: preço, teste, cobrança, cancelamento e atraso

**10.1 Preço.** O preço do Pro é definido pelo WorkEasy e aparece na tela "Assinatura" antes de você assinar. O valor vigente nesta versão está no Anexo I. A cobrança é mensal.

**10.2 Mudança de preço.** A nova mensalidade vale para quem assinar depois da mudança. Para quem já assina, vale a partir do ciclo seguinte a um aviso de pelo menos 30 dias†, e você pode cancelar antes sem pagar o novo valor. **[PLANEJADO]** Hoje o app não reajusta uma assinatura em curso. *(P5, G5)*

**10.3 Como assinar.** Na tela "Assinatura", você escolhe a forma de pagamento (Pix, boleto, cartão ou escolher na fatura) e informa o CPF ou CNPJ, que é pedido na primeira assinatura para emitir a cobrança. A cobrança é emitida pelo WorkEasy no Asaas. O cartão é pago na página do Asaas: o app nunca recebe os dados do cartão.

**10.4 Sem teste.** Sem teste, o Pro só liga quando o Asaas confirma o primeiro pagamento. Pix, boleto e cartão podem levar um tempo para confirmar; use "Atualizar situação" na tela. Até lá, a situação é "Aguardando o primeiro pagamento" e você continua no plano grátis.

**10.5 Teste grátis.** Quem nunca teve assinatura tem um teste grátis do Pro, uma vez por conta. A duração está no Anexo I. O Pro começa quando você assina e vale até o fim do último dia do teste, que a tela mostra. A primeira cobrança vence nesse último dia. Se você cancelar antes do fim do teste, não paga nada **[incerto]** e mantém o Pro até o fim dele. Quem já teve assinatura, mesmo cancelada, não recebe novo teste. *(P4)*

**10.6 Cobrança automática.** Se você não cancelar, a assinatura continua e o Asaas cobra todo mês na mesma data. Hoje a data e o valor da primeira cobrança aparecem na tela "Assinatura". **[PLANEJADO]** Aviso por mensagem 3 dias† antes da primeira cobrança depois do teste. *(P4, G5)*

**10.7 Cancelamento.** Cancele quando quiser, em "Assinatura" > "Cancelar assinatura". As próximas cobranças deixam de ser emitidas. Você mantém o Pro até o fim do período já pago (ou do teste); depois, o plano volta ao grátis. **[PLANEJADO]** Rebaixamento automático na data. **A mensalidade do período já pago não é devolvida, salvo se a lei mandar.** **[CONDICIONAL: depende de parecer]** *(P4, G5)*

**10.8 Assinar de novo.** Se você assinar de novo dentro de um período já pago, a cobrança começa no fim desse período, não hoje.

**10.9 Atraso.** Se uma cobrança vence sem pagamento, a assinatura passa a "Pagamento atrasado". Você continua no Pro até o fim do período já pago mais a carência do Anexo I; depois, o plano volta ao grátis. **[PLANEJADO]** Hoje o plano só volta ao grátis quando o Asaas avisa o atraso depois desse prazo: nenhuma rotina rebaixa o plano na data (G5a). Se você pagar depois, o Pro volta e o novo período conta do vencimento da cobrança paga. Um teste que não é pago termina do mesmo jeito. Seus dados continuam: só deixam de valer as vantagens do Pro.

**10.10 Outras cobranças.** Hoje o WorkEasy não cobra de você nada além da mensalidade do Pro. A comissão está desligada (cláusula 12). O Asaas pode cobrar tarifas pelo uso da conta de recebimento (cláusula 11).

**10.11 Nota fiscal da mensalidade.** **[PLANEJADO]** Emitir a nota fiscal da mensalidade, na forma que o contador do WorkEasy definir. O app ainda não emite. *(P15, G15)*

### 11. Conta de recebimento no Asaas e pagamentos

**11.1 O que é.** Para receber pelo app, você ativa a conta de recebimento na tela "Assinatura". O WorkEasy abre essa conta no Asaas com os dados que você informa: nome ou razão social, e-mail, CPF ou CNPJ, data de nascimento (pessoa física) ou tipo de empresa, celular, renda ou faturamento mensal e endereço. Esses dados são usados para abrir a conta. Ela serve para (a) receber os pagamentos de atendimentos da plataforma e (b) cobrar clientes seus (plano Pro).

**11.2 A conta é do Asaas.** **O Asaas pode pedir documentos, recusar ou bloquear a conta e cobrar tarifas, conforme as regras dele, que o WorkEasy não controla.** Leia os termos do Asaas antes de ativar. **[incerto]** Quais termos o Asaas exige do titular de uma subconta. O Asaas pode enviar a você um e-mail de ativação, para definir senha e enviar documentos; a tela "Assinatura" ainda não explica isso. *(P9, G14)*

**11.3 Chave da conta.** Você autoriza o WorkEasy a usar a chave da sua conta de recebimento, guardada no servidor e nunca mostrada a você nem ao app, só para criar, consultar e cancelar as cobranças que você pedir e para receber os avisos de pagamento. Se a chave se perder durante a ativação, o app mostra um erro e você deve falar com o SAC. *(P8)*

**11.4 Atendimentos da plataforma.** O cliente paga pelo Asaas, por Pix, cartão ou boleto. O Asaas divide o valor: o que sobra depois das tarifas do Asaas (o valor líquido) vai para a sua conta de recebimento. Hoje o WorkEasy não fica com comissão (cláusula 12). O prazo para o dinheiro ficar disponível depende do meio de pagamento e das regras do Asaas **[incerto]**. **O WorkEasy não garante que o cliente pague: o atendimento só aparece como "Pago" depois que o Asaas confirma.** *(P7, P9)*

**11.5 Reembolso.** Se o pagamento for devolvido ao cliente (reembolso ou estorno), o repasse correspondente à sua conta é desfeito e o atendimento pago passa a "Cancelado". Se o cliente pagar um atendimento que já estava cancelado, o WorkEasy pede o reembolso total ao Asaas (Pix e cartão; boleto é tratado pelo SAC).

**11.6 Cobranças de clientes seus (Pro).** Você cobra pelo app, na sua conta de recebimento. O WorkEasy não cobra taxa e não é parte dessa venda. Você responde pelo valor, pela entrega do serviço e pela nota fiscal (cláusula 14). Quem tiver o link de um orçamento vê o nome do cliente, os itens, os valores e as observações: envie o link só ao cliente.

**11.7 Contestação.** O cliente pode contestar um atendimento concluído em até 7 dias depois do fim. A equipe analisa e decide a situação do atendimento, com motivo registrado. Reembolso, se houver, segue a Política de Cancelamento, Reembolso e Garantia e é feito pelo Asaas. A decisão não impede ninguém de ir à Justiça.

**11.8 Valor retido e "Liberar".** O valor pago pelo cliente não fica retido até o fim do serviço. **[CONDICIONAL: depende de parecer]** (cláusula 12). O botão "Liberar" do cliente só registra que o serviço foi feito como combinado (no seu app, a situação aparece como "Encerrado"): não move dinheiro.

### 12. Comissão e pagamento retido [CONDICIONAL: depende de parecer]

**12.1 Hoje.** Não há comissão nem pagamento retido. Os dois estão desligados. O WorkEasy ganha só com a mensalidade do Pro.

**12.2 Comissão, se for ligada.** **[CONDICIONAL: depende de parecer]** A regra planejada é esta:

- (a) vale só para ocupações cuja política diz "comissão só no primeiro serviço com cliente novo trazido pelo WorkEasy";
- (b) incide só sobre o primeiro atendimento entre você e um cliente que a plataforma trouxe, pago pelo app. Os seguintes entre vocês dois não têm comissão. **[PLANEJADO]** Hoje o código não distingue um cliente que a plataforma trouxe de um que você já atendia por fora (G17);
- (c) nunca incide sobre clientes seus (origem "próprio");
- (d) tem percentual e teto definidos nas configurações do WorkEasy (programados hoje em 12% e R$ 150,00, e desligados) e é fixada quando o atendimento é aceito;
- (e) não vale para ocupações marcadas "só assinatura" nem "em análise jurídica";
- (f) só passa a valer depois de aviso de pelo menos 30 dias†, para atendimentos aceitos depois do aviso, e com o valor mostrado antes de você aceitar. **[PLANEJADO]** Hoje a tela não mostra a taxa antes de você aceitar. *(P10, G12)*

**12.3 Primeiro serviço.** "Primeiro serviço" é o primeiro atendimento concluído e pago pelo app entre você e o mesmo cliente. Pela regra atual, se já houve um atendimento da plataforma, concluído e pago pelo app, entre vocês dois, o seguinte não tem comissão. *(P10)*

**12.4 Pagamento retido.** **[CONDICIONAL: depende de parecer]** Hoje o valor pago não fica retido. O WorkEasy só considerará reter pagamento por meio de instituição autorizada a fazer a custódia, e só depois de parecer jurídico. Se isso acontecer, estes Termos serão atualizados antes, com as regras de liberação, de prazo e de contestação. *(P7)*


### 13. Publicidade e regras do seu conselho

**13.1 O que é publicidade.** O seu perfil no WorkEasy divulga o seu trabalho, com a sua participação. Isso vale para o nome de exibição, a apresentação, os serviços, as descrições, os preços, os orçamentos e qualquer texto que você publique.

**13.2 Quem responde.** Você responde por cumprir as normas de publicidade do seu conselho ou órgão e a lei. A lei do consumidor proíbe a publicidade enganosa ou abusiva (CDC, art. 37) e exige que a publicidade possa ser identificada como tal (art. 36). Conforme o seu conselho, isso inclui: dados obrigatórios no anúncio; proibição de sensacionalismo e de promessa de resultado; regras sobre preço, desconto e promoção; e regras sobre depoimentos e imagens de clientes.

**13.3 As regras variam de conselho para conselho.** Por exemplo, a norma de publicidade médica do CFM (Resolução CFM 2.336/2023) exige o nome, o número do CRM com a palavra MÉDICO e, quando houver, a especialidade com o número do RQE (art. 4º), e permite informar valores de consulta e anunciar descontos em campanhas (art. 9º, VI e VIII) **[incerto]**. Já o provimento da OAB (Provimento 205/2021) veda a referência a valores de honorários, forma de pagamento, gratuidade, descontos e reduções de preço como forma de captar clientes (art. 3º, I). O WorkEasy não confere os seus anúncios um a um e não decide por você o que o seu conselho permite. *(P11)*

**13.4 Registro mostrado.** A sua página pública mostra o nome do registro, o número, a UF e a situação ("informado pelo profissional" ou "confirmado pelo WorkEasy"). O app ainda não tem campos próprios para outros dados que o seu conselho possa exigir no anúncio (por exemplo, especialidade e número de especialista, ou responsável técnico). Se for o seu caso, escreva esses dados na "Apresentação". **[PLANEJADO]** Campos próprios. *(G7)*

**13.5 Preço sempre público.** O app mostra a faixa de preço dos seus serviços na busca e na sua página, em todas as ocupações, e hoje não há como ocultá-la por política da ocupação. **Se o seu conselho proíbe ou limita divulgar preço, não cadastre serviços no WorkEasy enquanto essa opção não existir; use só propostas, cujo preço apenas o cliente do pedido vê.** **[PLANEJADO]** Ocultar o preço por política da ocupação. **[CONDICIONAL: depende de parecer]** *(P11, G13)*

**13.6 Ocultar conteúdo.** **O WorkEasy pode ocultar avaliações, retirar a aprovação de uma ocupação ou, quando necessário, suspender o cadastro (cláusula 17) quando a política da ocupação ou a regra do conselho exigir, quando o conselho ou uma autoridade pedir, ou quando houver indício de infração.** Avisamos você, com o motivo. Isso não é penalidade. **[PLANEJADO]** Ocultar preço ou texto isoladamente, e avisar por mensagem com o motivo (hoje não há mensagem; G2). *(G13)*

**13.7 Saúde.** Não use o WorkEasy para divulgar serviço, método ou produto que a lei ou o seu conselho proíbem, nem para prometer cura, diagnóstico ou resultado de saúde. O WorkEasy não é plataforma de telemedicina nem de prontuário. **[PLANEJADO]** Telemedicina e prontuário só com os requisitos das normas aplicáveis (a diretriz do produto fala em empresa registrada no CRM, responsável técnico e prontuário certificado) **[incerto]** e com termos próprios. *(P23)*

### 14. Impostos e notas fiscais

**14.1 São seus.** Os tributos e as contribuições do seu trabalho são seus: enquadramento como MEI, Simples Nacional ou outro regime, recolhimento, declarações e previdência. Hoje o WorkEasy não retém nem recolhe tributo em seu nome.

**14.2 Notas fiscais.** Você emite a nota fiscal dos seus serviços quando a lei exigir de você. **O WorkEasy não emite nota fiscal dos serviços que você presta**, e o orçamento do app não substitui nota fiscal.

**14.3 MEI e Simples.** Pela LC 123/2006, o MEI é dispensado de emitir documento fiscal para o consumidor final, mas é obrigado a emitir nas vendas e nas prestações de serviço para destinatário com CNPJ. As demais empresas do Simples Nacional emitem documento fiscal conforme as instruções do Comitê Gestor (art. 26, I, § 1º e § 6º, II). Confirme com o seu contador. *(P14)*

**14.4 Seus dados fiscais.** A tela "Assinatura" pede o CPF ou CNPJ (na assinatura do Pro e na conta de recebimento), e o Asaas pode pedir mais. Informe dados corretos. **[PLANEJADO]** Perguntar se você é MEI, Simples ou outro regime. Hoje o app não pergunta. *(G9)*

**14.5 Informações ao Fisco.** **[CONDICIONAL: depende de parecer]** A lei pode obrigar plataformas digitais a informar à Receita Federal e ao Comitê Gestor do IBS as operações que intermediam, com a identificação do prestador, e a responder pelo tributo junto com o prestador que é contribuinte e não emite nota fiscal (LC 214/2025, art. 22). Se isso se aplicar ao WorkEasy, enviaremos esses dados por obrigação legal (seu nome, CPF ou CNPJ, valor e data das operações) e você concorda em emitir os documentos fiscais exigidos de você. *(P13)*

**14.6 No futuro.** **[PLANEJADO]** O WorkEasy poderá oferecer, só com o seu consentimento, emitir documentos fiscais em seu nome ou recolher o tributo como substituto (LC 214/2025, art. 22, §§ 12 e 13). Isso não existe hoje. **[CONDICIONAL: depende de parecer]** *(P13)*

### 15. Trabalho doméstico e cuidado: a trava semanal

**15.1 Onde vale.** Algumas ocupações são de trabalho doméstico ou de cuidado (por exemplo, diarista, babá, cuidador de idosos, cozinheira e motorista particular). A política da ocupação diz quando a trava vale.

**15.2 Por que existe.** A LC 150/2015 chama de empregado doméstico quem presta serviço de forma contínua, subordinada, onerosa e pessoal, sem finalidade lucrativa, a uma pessoa ou família, no âmbito residencial, por mais de 2 dias por semana (art. 1º). Por isso o app limita os dias por semana entre você e o mesmo cliente ou a mesma casa.

**15.3 Como funciona hoje.**

- O limite é de 2 dias por semana (Anexo I). A semana vai de segunda a domingo, no horário de São Paulo.
- Contam os dias com atendimento não cancelado, inclusive os já concluídos: concluir um atendimento não libera um terceiro dia.
- São a mesma pessoa o mesmo cliente, a mesma casa e as entradas do seu CRM com o mesmo telefone ou e-mail.
- Vale para qualquer jeito de marcar (agendamento direto, proposta aceita, atendimento com cliente seu, plantão) e quando você muda o horário.
- Ao passar do limite, o app não cria o atendimento e mostra um aviso.

**15.4 O que a trava não é.** É uma proteção, não um selo. **Ela não prova que não existe vínculo de emprego e não substitui orientação de advogado ou contador.** Não tente driblá-la (contas extras, nomes ou telefones diferentes, combinar fora do app). Se você atende a mesma família por mais de 2 dias por semana, a lei pode tratar a relação como emprego doméstico. Nesse caso, o acerto é feito fora do WorkEasy, entre vocês, com as obrigações trabalhistas, previdenciárias e fiscais que a lei exigir. O WorkEasy não participa, não registra o vínculo e não calcula encargos. **[CONDICIONAL: depende de parecer]** *(P16)*

**15.5 Plantões de cuidado (linha Cuidado).** **[CONDICIONAL: depende de parecer]** A linha de cuidado depende de parecer trabalhista e ainda não está aberta ao público. Antes de abrir, publicaremos regras próprias **[PLANEJADO]**. O código atual já prevê: (a) você decide se aceita um plantão oferecido, e quem aceita primeiro fica com ele; (b) a trava vale sempre nos plantões; (c) o registro de entrada e saída pode incluir a localização do seu aparelho, o que é opcional e depende da sua autorização, que você pode retirar em "Minha conta"; (d) o relatório do dia é não clínico: não escreva doenças, diagnósticos, remédios, doses, exames ou sintomas. O pagamento do plantão não passa pelo app: é combinado e pago direto entre a família e o cuidador. *(P1, P16)*

### 16. Regras de conduta

**16.1 Você deve:**

- (a) informar dados e documentos verdadeiros e mantê-los atualizados;
- (b) atender dentro da ocupação aprovada e do que a lei e o seu conselho permitem;
- (c) tratar clientes e terceiros com respeito, sem discriminação, assédio ou violência;
- (d) cumprir o que combinou (preço, data, escopo) e avisar com antecedência se não puder;
- (e) emitir os documentos fiscais que a lei exige de você (cláusula 14); e
- (f) proteger os dados dos clientes (cláusula 18).

**16.2 Você não pode:**

- (a) usar documento, registro, nome ou identidade falsos ou de outra pessoa;
- (b) fazer avaliação falsa, pedir nota em troca de vantagem ou pressionar cliente por nota;
- (c) abrir várias contas, repassar a conta ou usar conta de outra pessoa para driblar limite, teste grátis, trava semanal ou suspensão;
- (d) oferecer serviço fora da ocupação aprovada, ou que exija registro, licença ou responsável técnico que você não tem;
- (e) usar o WorkEasy para fraude, lavagem de dinheiro, cobrança indevida ou qualquer atividade ilegal;
- (f) copiar dados do app (lista de prestadores, clientes, preços) por robô ou em massa;
- (g) guardar prontuário ou dados de saúde de clientes no CRM, nas anotações, nos orçamentos ou nos relatórios (itens 13.7 e 18.7); e
- (h) usar o contato de um cliente do WorkEasy para outro fim que não seja atendê-lo (cláusula 18).

### 17. Suspensão e remoção

**17.1 Motivos.** **O WorkEasy só suspende ou remove um cadastro por: (a) fraude (documento ou identidade falsos, cobrança indevida, avaliação falsa, uso de conta alheia); (b) risco à segurança de clientes, de terceiros ou da plataforma; (c) quebra grave ou repetida de regra destes Termos, depois de aviso; (d) ordem de autoridade ou do conselho, ou perda do registro ou da licença que a ocupação exige; ou (e) pedido seu.**

**17.2 O que não é motivo.** Nota baixa isolada, recusar pedidos, preço, atender também fora do app e usar outra plataforma não são motivo de suspensão. Também não suspendemos nem removemos por motivo discriminatório ou ilegal.

**17.3 Aviso e resposta.** **Antes de suspender ou remover, avisamos por escrito, com o fato, a regra que você descumpriu e um prazo de 10 dias† para responder. A decisão vem por escrito, com o motivo, em até 10 dias úteis† depois da sua resposta.** Você responde por e-mail para [E-MAIL DO SAC], com o que quiser juntar.

**17.4 Suspensão cautelar.** Em caso de fraude evidente, risco imediato à segurança ou ordem de autoridade, podemos suspender na hora e avisar em até 2 dias úteis†, com o motivo e o prazo para você responder.

**17.5 Revisão.** Depois da decisão, você pode pedir revisão pelo mesmo e-mail. A revisão é analisada por pessoa responsável do WorkEasy, com o que você enviar, e respondida por escrito em até 10 dias úteis†. **[PLANEJADO]** Aviso e resposta dentro do app. *(G2, G3)*

**17.6 Efeitos.** **O cadastro suspenso sai da busca e deixa de receber pedidos. Atendimentos já combinados seguem as regras normais. A mensalidade do Pro segue sendo cobrada durante a suspensão, a menos que você cancele; se a suspensão for desfeita por erro nosso, devolvemos a mensalidade proporcional†.** Hoje o app não pausa a cobrança durante a suspensão. O WorkEasy não retém valores seus, porque o app não retém pagamento (cláusula 12). *(P6, G6)*

**17.7 Remoção.** Remoção é a exclusão definitiva do cadastro por fraude ou por quebra grave de regra. Ela encerra o seu acesso. Guardamos só o que a lei manda guardar (cláusula 20).

**17.8 O que o app mostra hoje.** O cadastro suspenso mostra a situação "Suspenso" e manda você falar com o suporte; o app não envia mensagem com o motivo. A suspensão de um cadastro é sempre decisão de uma pessoa da equipe, com motivo registrado. *(G2)*

### 18. Dados pessoais: quem decide o quê

**18.1** Esta cláusula resume os papéis. A Política de Privacidade (documento 03) tem os detalhes. Quem é controlador e quem é operador depende de quem decide sobre os dados, não do nome que damos aqui. **[CONDICIONAL: depende de parecer]** *(P17)*

**18.2 Quadro de papéis.**

| Dados | Quem decide por que usar | O WorkEasy é | Você é |
|---|---|---|---|
| Seus dados de cadastro, documentos, assinatura, pagamentos e registros de segurança | O WorkEasy: conferir o cadastro, cobrar, evitar fraude e cumprir a lei | Controlador | Titular dos dados |
| Dados do cliente que chegam pelo WorkEasy (nome, telefone, bairro, pedido, atendimento) | Cada um, para o seu fim: o WorkEasy opera a plataforma; você presta o serviço contratado e cumpre suas obrigações | Controlador, para os fins da plataforma | Controlador, para atender o cliente e cumprir suas obrigações |
| Clientes que você cadastra por conta própria em "Clientes", orçamentos, agenda e cobranças de clientes seus (Pro) | Você: o que guardar, por quê e por quanto tempo | Operador: guarda e mostra a você, segundo as funções do app e as suas instruções | Controlador |
| Perfil público (nome de exibição, apresentação, serviços, preços, bairros, registro) | O WorkEasy mostra o que você escreve, a qualquer pessoa, depois da aprovação | Controlador, para a exibição na plataforma | Titular, e responsável pelo conteúdo |

**18.3 Você como controlador.** Quanto aos dados dos clientes que você controla, você: (a) usa os dados só para atender o cliente e cumprir suas obrigações legais; (b) não os vende, não os repassa e não os usa para marketing sem base legal; (c) responde aos pedidos dos titulares sobre os dados que você controla; (d) protege o que guarda; (e) comunica o titular e a ANPD se houver incidente de segurança na sua parte que possa causar risco ou dano relevante (LGPD, art. 48); e (f) informa os clientes que você cadastra ou cobra de que os dados deles ficam no WorkEasy e, na cobrança, vão ao Asaas **[CONDICIONAL: depende de parecer]**. Se você é MEI ou microempresa, a ANPD prevê regras simplificadas para agentes de tratamento de pequeno porte, que não valem para tratamento de alto risco (Resolução CD/ANPD 2/2022, arts. 2º e 3º). *(P17)*

**18.4 O WorkEasy como operador do seu CRM.** Quanto aos clientes próprios, aos orçamentos, à agenda e às cobranças de clientes seus, o WorkEasy trata os dados só para guardá-los e mostrá-los a você, segundo as funções do app. Quando você pede uma cobrança de cliente seu (Pro), o app envia ao Asaas, pela sua conta de recebimento, o nome, o CPF ou CNPJ e, se houver, o e-mail e o telefone dele. Se um incidente no WorkEasy atingir esses dados, avisamos você sem demora, para você cumprir os seus deveres. Para aplicar a trava da cláusula 15, o app compara telefones e e-mails das entradas do seu CRM: essa comparação é uma finalidade do WorkEasy. *(P17, G16)*

**18.5 Contato do cliente.** Você só vê os dados de contato do cliente de um atendimento que ele pediu a você ou que aceitou a sua proposta. Quem só enviou proposta não vê o contato do cliente do pedido. Antes disso, o pedido mostra o bairro e a descrição, sem telefone nem e-mail.

**18.6 Cliente que exclui a conta.** Se um cliente do WorkEasy excluir a conta, o nome, o telefone, o e-mail e as suas anotações sobre ele são apagados do seu CRM, e o nome e o telefone dele saem dos seus orçamentos. *(P19)*

**18.7 O CRM não é prontuário.** Não escreva no CRM, nas anotações, nos orçamentos nem nos relatórios dados de saúde, vida sexual, religião, opinião política, origem racial ou étnica, filiação a sindicato, dado genético ou biometria. A LGPD trata esses dados como sensíveis (art. 5º, II). O WorkEasy não foi feito para guardá-los.

**18.8 Perfil público.** O que você escreve no perfil aparece para qualquer pessoa, sem login, depois da aprovação, na sua página (`/p/` e o seu endereço) e na busca.

**18.9 Terceiros do WorkEasy.** Os fornecedores que o WorkEasy usa para operar (hospedagem, pagamentos, mensagens, e-mail) estão na Política de Privacidade. Pedidos de titulares e dúvidas: [E-MAIL DO ENCARREGADO].

### 19. Responsabilidade e indenização

**19.1 Você responde pelo serviço.** Você responde pela qualidade, pela segurança, pelo prazo e pelo resultado prometido do serviço que presta, pelos danos que causar a clientes e a terceiros e pelo cumprimento da lei e das normas da sua profissão.

**19.2 Lei do consumidor.** Para o cliente consumidor, você é fornecedor de serviços. O CDC diz que o fornecedor de serviços responde, independentemente de culpa, pelos danos causados por defeitos na prestação do serviço e por informações insuficientes ou inadequadas sobre o serviço e seus riscos (art. 14), e que a responsabilidade pessoal dos profissionais liberais é apurada mediante a verificação de culpa (art. 14, § 4º). Como isso se aplica ao seu caso (pessoa física, MEI ou empresa) depende dos fatos. *(P20)*

**19.3 O que o WorkEasy não assume.** **O WorkEasy não responde pelo serviço, pelos atos ou omissões seus ou do cliente, pelo pagamento do cliente nem por falhas de terceiros (Asaas, operadoras de mensagem, internet), salvo quando a lei disser o contrário.** O app pode ficar indisponível por manutenção ou falha, e não garantimos número de pedidos nem que um cliente aceite a sua proposta. Nada aqui limita responsabilidade que a lei não permita limitar. *(P20)*

**19.4 Cobrança do cliente contra o WorkEasy.** A lei do consumidor pode permitir que o cliente cobre também do WorkEasy, junto com você (CDC, art. 7º, parágrafo único; art. 25, § 1º; art. 34). Se isso acontecer por falha do seu serviço ou do que você publicou, o WorkEasy pode cobrar de você o que pagar, na medida da sua responsabilidade (direito de regresso). *(P20)*

**19.5 Indenização.** **Você indeniza o WorkEasy por perdas, custos e condenações, inclusive honorários razoáveis, causados por: (a) descumprimento destes Termos ou da lei por você; (b) conteúdo que você publicou; ou (c) dano que você causou a cliente ou a terceiro. Não há indenização por culpa ou dolo do WorkEasy.** O WorkEasy avisa você do pedido, deixa você colaborar na defesa e não faz acordo em seu nome sem o seu consentimento, salvo se a lei exigir. *(P20)*

**19.6 Seguro.** A sua profissão ou o tipo de serviço podem exigir seguro de responsabilidade civil ou outro. Contrate o que for exigido. O WorkEasy não contrata seguro em seu nome.

### 20. Encerrar a conta e o que fica guardado

**20.1 Sair.** Você pode cancelar a assinatura a qualquer momento (cláusula 10) e excluir a conta em "Minha conta" > "Excluir minha conta", digitando EXCLUIR. Antes, baixe seus dados em "Baixar meus dados".

**20.2 Quando não dá para excluir.** A exclusão é recusada enquanto houver atendimento pago, em andamento ou em contestação. Atendimento aceito e ainda não pago é cancelado, com aviso à outra parte. Conclua ou cancele antes os atendimentos pagos ou em andamento.

**20.3 O que a exclusão faz.** O app: (a) cancela a assinatura Pro e as cobranças em aberto no Asaas; (b) apaga os seus documentos e os arquivos enviados; (c) apaga o seu nome, telefone, bairros, agenda e apresentação, e tira a sua página do ar; (d) apaga os dados dos seus clientes no CRM e nos orçamentos (nome, telefone, e-mail e anotações); e (e) remove o seu acesso. Os seus orçamentos, o estado da assinatura, as notificações e o histórico dos seus aceites são apagados junto com a conta. *(G10)*

**20.4 O que fica guardado.** **Ficam os registros de pagamento e de atendimento, sem o seu nome e contatos, porque a lei fiscal manda guardá-los (LGPD, art. 16, I); os registros de auditoria e de segurança, que não podem ser alterados e podem conter motivos escritos pela equipe; e o pedido de exclusão, com a data.** Dos pagamentos, o app mantém só os campos fiscais. O prazo de guarda é o que a lei exigir **[incerto]**. *(P19)*

**20.5 O que a exclusão não faz.** A exclusão não fecha a sua conta no Asaas: para isso, fale com o Asaas **[incerto]**. Também não apaga o que outras pessoas guardaram por conta própria. *(G10)*

**20.6 Fim do serviço.** Se o WorkEasy encerrar o serviço, avisamos com pelo menos 60 dias† e você poderá baixar seus dados.

### 21. Conflitos e foro

**21.1 Entre você e o cliente.** Tentem resolver entre vocês. O cliente pode contestar um atendimento concluído em até 7 dias depois do fim (item 11.7). A decisão da equipe sobre a situação do atendimento não impede ninguém de ir à Justiça.

**21.2 Entre você e o WorkEasy.** Escreva primeiro para [E-MAIL DO SAC]. Respondemos por escrito em até 10 dias úteis†. Se isso não resolver, qualquer parte pode propor mediação; ninguém é obrigado a aceitá-la. Não há arbitragem obrigatória.

**21.3 Lei e foro.** Estes Termos seguem a lei brasileira. O foro é o da comarca da sede de [RAZÃO SOCIAL], [ENDEREÇO], sem prejuízo do foro que a lei assegure a você como consumidor, quando for o caso. **[CONDICIONAL: depende de parecer]** *(P21)*

### 22. Disposições finais

**22.1 Avisos.** Falamos com você pelo app, pelo e-mail ou pelo celular confirmado no login. Você fala conosco pelo SAC ([E-MAIL DO SAC]). Mantenha seus contatos atualizados.

**22.2 Cessão.** Você não pode ceder os seus direitos e obrigações destes Termos. O WorkEasy pode transferi-los a quem o suceder na operação do serviço, avisando você e sem piorar os seus direitos. *(P21)*

**22.3 Cláusula inválida.** Se uma cláusula for considerada inválida, as outras continuam valendo. Deixar de exigir um direito não é abrir mão dele.

**22.4 Sentido das cláusulas.** Estes Termos são um contrato de adesão. Se uma cláusula tiver mais de um sentido, vale o mais favorável a você, quando a lei mandar (Código Civil, art. 423; CDC, art. 47, se você for consumidor). *(P20)*

**22.5 Identificação da empresa.**

| Campo | Dado |
|---|---|
| Nome empresarial | [RAZÃO SOCIAL] |
| CNPJ | [CNPJ] |
| Endereço físico | [ENDEREÇO] |
| SAC | [E-MAIL DO SAC] |
| Encarregado pelo tratamento de dados pessoais | [E-MAIL DO ENCARREGADO] |
| Vigência destes Termos | [DATA DE VIGÊNCIA] |
| Versão | 2026-10-rascunho |

## Anexo I. Condições vigentes em 2026-10-rascunho

Estes valores são configurações da plataforma. O dono pode mudá-los sem novo deploy. Quando a mudança piorar a situação do prestador, vale o item 3.3. A coluna "Onde está" é para o dono e para o advogado: apague-a na versão publicada.

| Condição | Valor vigente | Cláusula | Onde está (interno) |
|---|---|---|---|
| Preço do Pro | R$ 49,00 por mês | 10.1 | `platform_settings.pro_price_cents` = 4900 (decisão D2 de `DECISOES.md`) |
| Teste grátis do Pro | 30 dias, uma vez por conta | 10.5 | `pro_trial_days` = 30 (0 desliga; máximo 90) |
| Plano grátis | 5 propostas novas por mês civil, no fuso de São Paulo | 9.2 | `free_proposals_per_month` = 5 (0 tira o limite) |
| Propostas ativas por pedido | 3 | 7.5 | `proposal_limit` = 3 |
| Carência depois do vencimento | 0 dia | 10.9 | variável `PRO_GRACE_DAYS` das Edge Functions (padrão 0; máximo 60). Não é um `platform_settings`. |
| Trava do trabalho doméstico | 2 dias por semana com o mesmo cliente ou casa | 15.3 | `labor_lock_days_per_week` = 2 |
| Comissão | Desligada. Programados: 12% e teto de R$ 150,00 | 12 | `commission_enabled` = false; `commission_bps` = 1200; `commission_cap_cents` = 15000 |
| Pagamento retido | Desligado | 12.4 | `escrow_enabled` = false |
| Contestação pelo cliente | Até 7 dias depois do fim do atendimento | 11.7 | regra de `transition_booking` |
| Documentos | JPG, PNG, WebP, HEIC ou PDF, até 10 MB | 6.1 | `DOCUMENT_TYPES` e `DOCUMENT_MAX_BYTES` em `services/providers.ts` |
| Exclusão da conta | Digitar EXCLUIR | 20.1 | `DELETE_CONFIRMATION` em `services/account.ts` |

## Anexo II. O que o produto faz hoje, e onde conferi (2026-10-23)

Li o código e `ARQUITETURA.md`; **não executei** o app, a stack local nem os testes. Revisão de 2026-11-08: conferidas de novo as regras de trava, proposta, comissão, teste, cancelamento, atraso e exclusão; corrigidos 10.9, 12.2(b) e 14.4 (ver G17); a migração `20261108100000_product_events.sql` não altera nenhum fato deste anexo. As migrations são citadas pelo número (`supabase/migrations/2026101900000N_*.sql`, de 01 a 11, e `2026102200001N_*.sql`, 12 e 13). Quando o código e `ARQUITETURA.md` divergem, ficou o código.

| Cláusula | O que o texto afirma | Onde conferi |
|---|---|---|
| 2.1 | O app não confere a idade | `become_provider` e `pages/pro/Cadastro.tsx` não pedem nem checam idade |
| 2.3 | O cadastro não tem CNPJ nem licença do prestador; `provider_type` não é imposto | `providers` sem coluna de CNPJ (03); `provider_type` só em `catalog/` e na página de demonstração `pages/ProviderRegistration.tsx` |
| 3.1, 3.3 | O app pede o aceite de Termos de Uso e Privacidade no login e na área do prestador, e de novo quando a versão muda | `pages/conta/Entrar.tsx`; `components/TermsGate.tsx` (usado em `components/pro/ProPage.tsx`); `services/account.ts`; `config/legal.ts` |
| 4.2 | Sem horário mínimo, sem exclusividade, sem instrução de execução | nenhuma regra assim nas migrations nem nas Edge Functions; agenda em `availability` (03) |
| 4.2 (d), 7.6 | Recusar não muda a posição na busca | `search_providers` (03) não usa taxa de resposta nem plano; `transition_booking` (05) permite ao prestador `requested→canceled`; opção "Receber pedidos novos" em `Cadastro.tsx` |
| 5.1 | Login por código, sem senha | `pages/conta/Entrar.tsx` (`signInWithOtp`, `verifyOtp`) |
| 5.2 | Quatro passos; "Rascunho" não aparece na busca | `pages/pro/Cadastro.tsx`; `PROVIDER_STATUS_HELP` em `components/pro/labels.ts` |
| 5.3 | A política aparece nas páginas da ocupação | `pages/OccupationPage.tsx` |
| 5.5, 13.4 | Registro mostrado com nome, número, UF e "informado pelo profissional" ou "confirmado pelo WorkEasy" | `components/cliente/RegistryNote.tsx`; `get_provider_page` (03) |
| 5.6 | Certidão só quando a política pede; consentimento antes do envio; sem consulta externa | `DocumentsStep` e `recordConsent` em `Cadastro.tsx`; as Edge Functions só falam com o Asaas (`asaas-client.ts`), com o WhatsApp e o e-mail (`notify-dispatch`) e, em `request-assist`, com a API de IA; nenhuma consulta bases de antecedentes |
| 5.7, 17.8 | Sem mensagem de mudança de situação; fila por data de cadastro | seis modelos de notificação em 08; `admin_provider_queue` (11) ordena por `created_at` |
| 5.8 | Aprovação por ocupação | `private.offers_occupation`, `admin_set_provider_status`, `admin_set_occupation_approval` (03 e 11; `ARQUITETURA.md`, "Prestadores") |
| 5.9, 6.5 | O motivo da recusa de documento aparece; o de registro não | `DocumentsStep` ("Motivo da recusa"); `admin_set_registry_status` (11) grava o motivo só em `audit_log` |
| 6.1, 6.2 | Formatos, 10 MB, espaço privado, apagar só o não analisado | `DOCUMENT_TYPES`, `DOCUMENT_MAX_BYTES`; RLS do bucket `provider-documents` (03) |
| 6.3 | Sem controle de validade | `expires_at` (03) só é lida (`DOCUMENT_COLUMNS`); o envio não a preenche; nenhum job a usa |
| 6.4 | Documento que deixa de valer retira a aprovação | trigger `provider_documents_revoke_approvals` (11) |
| 7.1, 7.2 | Preço livre; unidade da política; agendamento direto pelo menor valor | tabela `services` e erro `unit_not_allowed` (03); `book_direct` usa `price_min_cents` (05); `pages/publico/Agendar.tsx` |
| 7.3, 7.5 | Agenda sem sobreposição; pedidos sem contato; limite por pedido | `bookings_no_overlap` (05); `open_requests_for_me` (04); `private.check_proposal` (12) |
| 7.7 | Prestador não cancela atendimento pago nem em andamento | `private.booking_transition_allowed` (05) |
| 7.8 | Cliente próprio: invisível, sem comissão, conta na trava | `create_own_booking` (05); `pages/pro/Agenda.tsx` |
| 8.1, 8.2 | Quem aparece e a ordem da busca | `search_providers` (03) |
| 8.4 | Notas ocultas onde não há ranking; moderação pela equipe | `private.check_review`, `reviews_select`, `reviews_admin_update` (07) |
| 8.5 | Suspensão só manual; sem IA no cadastro | `admin_set_provider_status` (11); `request-assist` não é chamada por nenhuma tela |
| 9.1 a 9.3 | O que cada plano inclui | `pages/pro/Assinatura.tsx`; `charges-create` responde `pro_required`; `private.check_proposal` (12); nenhuma outra checagem de plano nas telas |
| 10.1 a 10.4 | Preço na tela, formas de pagamento, CPF/CNPJ, cartão na página do Asaas, `pending` até o pagamento | `Assinatura.tsx`; `subscriptions-manage/handler.ts` |
| 10.5 | Teste uma vez, até o fim do dia, primeira cobrança nesse dia | `subscriptions-manage/handler.ts` (`trialDays`, `nextDueDate`, `T23:59:59-03:00`) |
| 10.7 | Cancelar mantém o Pro até o fim do período; não há rebaixamento por data | `planAfterCancel` (`_shared/subscriptions.ts`); os dois `cron.schedule` de 08 não tocam `providers.plan` |
| 10.8 | Reassinar começa no fim do período pago | `firstDueDate` (`_shared/subscriptions.ts`) |
| 10.9 | Atraso, carência e volta do Pro ao pagar | `asaas-webhook/handler.ts` (`applySubscription`, `planWhileOverdue`); `PRO_GRACE_DAYS` em `_shared/config.ts` |
| 11.1, 11.3 | Dados enviados ao Asaas; chave no Vault que não volta ao app | `ReceivingSection` em `Assinatura.tsx`; `asaas-onboard/handler.ts`; `store_provider_payment_secret` (06) |
| 11.4 | Cobrança na conta do WorkEasy com split sobre o valor líquido | `payments-create/handler.ts`; `_shared/split.ts`; documentação do Asaas (F27) |
| 11.5 | Estorno desfaz o repasse; pagamento de atendimento cancelado é reembolsado | `asaas-webhook/handler.ts`; F27; `ARQUITETURA.md`, "Webhook" |
| 11.6 | O orçamento por link mostra nome do cliente, itens, valores e observações | `get_quote_by_token` (07) |
| 11.7 | Contestação em até 7 dias; decisão da equipe | `transition_booking` (05); `admin_resolve_dispute` (11) |
| 11.8, 12.1 | Sem pagamento retido; "Liberar" não move dinheiro | `escrow: false` em `payments-create`; `platform_settings` (02 e 12) |
| 12.2, 12.3 | Regra da comissão | `private.platform_fee` (12) |
| 13.5 | Preço sempre público; a política não tem campo de preço | `search_providers`, `get_provider_page`; `OccupationPolicy` em `catalog/types.ts` |
| 13.6 | O que a equipe consegue ocultar hoje | `reviews_admin_update` (07); `admin_set_occupation_approval` e `admin_set_provider_status` (11) |
| 14.2 | O app não emite nota fiscal | `components/pro/QuoteDocument.tsx` ("não substitui nota fiscal"); nenhuma emissão no código |
| 15.3 | A trava e suas regras de contagem | `private.check_labor_lock` e `enforce_booking_labor_lock` (05); `lib/errors.ts` (`labor_lock`); `pages/OccupationPage.tsx` |
| 15.5 | Cuidado: pagamento fora do app, localização opcional, relatório não clínico | `ARQUITETURA.md`, "Linha de cuidado"; `components/cuidado/CheckinPanel.tsx`; `HealthDataNotice.tsx` |
| 17.8 | Suspenso: sem mensagem, "fale com o suporte" | `PROVIDER_STATUS_HELP.suspended`; seis modelos de notificação (08) |
| 18.2, 18.4 | Na cobrança Pro, o app envia ao Asaas o nome, o CPF ou CNPJ e, se houver, o e-mail e o telefone do cliente próprio; a página do orçamento não tem aviso de privacidade | `charges-create/handler.ts` (`cpf_cnpj` obrigatório; nome, e-mail e telefone do corpo da chamada ou do CRM); nenhuma menção a privacidade em `pages/publico/Orcamento.tsx` nem em `components/pro/QuoteDocument.tsx` |
| 18.5 | Contato do cliente só depois de pedido ou aceite | `ARQUITETURA.md`, "Contato (perfil)"; `private.shares_contact` |
| 18.6 | Cliente que exclui a conta limpa CRM e orçamentos | `anonymize_user` (10) |
| 20.1 a 20.5 | Exclusão, o que apaga e o que fica | `account-delete/handler.ts`; `anonymize_user` (10); `ARQUITETURA.md`, "LGPD e auditoria"; `services/account.ts` |

## Pontos para o advogado

Esta seção é interna. Cada ponto diz o que o rascunho assume, o que li e o que preciso que você decida. As fontes (F1 a F27) estão na última seção. O documento 01 já discute a posição do WorkEasy na cadeia de consumo (tese do STF sobre o Marco Civil, Tema 1.173 do STJ), a idade mínima, a remoção de conteúdo e o foro do consumidor: não repeti esses pontos, só remeto a eles.

### A. Perguntas jurídicas em aberto

**Quadro: temas do STF e Convenção 193 da OIT em 2026-10-23.** A situação muda; refaça o quadro na data da publicação.

| Item | O que é | Situação lida | Fontes |
|---|---|---|---|
| STF, Tema 1.389 (ARE 1532603, Min. Gilmar Mendes) | Competência e ônus da prova nos processos sobre fraude em contrato civil ou comercial de prestação de serviços, e licitude de contratar pessoa jurídica ou autônomo para essa finalidade | Há repercussão geral; acórdão de repercussão geral publicado em 24/04/2025; a página do tema não traz tese. A suspensão nacional, de abril de 2025, foi retirada para a 1ª e a 2ª instâncias da Justiça do Trabalho (notícia de 18/06/2026): volta a valer depois do julgamento nos TRTs e dura até a tese. A decisão de 27/08/2025 disse que as relações intermediadas por aplicativos não entram nessa suspensão, porque são do Tema 1.291. | F2, F4, F5 |
| STF, Tema 1.291 (RE 1446336, Min. Fachin; a Rcl 64018 da Rappi tramita junto) | Vínculo de emprego entre motorista de aplicativo de transporte e a plataforma | Há repercussão geral (acórdão publicado em 02/07/2024); sem tese. Em 25/06/2026 o presidente do STF retirou o caso da pauta do Plenário, depois que o MPT e a DPU informaram a aprovação da Convenção 193; a Uber e os amici foram intimados a falar em cinco dias; a notícia não traz nova data. | F3, F6 |
| OIT, Convenção 193 (trabalho digno na economia de plataformas) | Primeira norma internacional específica | Adotada em 12/06/2026, com 406 votos a favor, 8 contra e 36 abstenções. Obriga só os países que a ratificarem e entra em vigor 12 meses depois do registro de duas ratificações (art. 27). Ratificação pelo Brasil: não achei **[incerto]**. | F7, F8, F9 |

Nenhum dos dois temas trata de marketplace de serviços gerais. São contexto, não base do texto.

**P1. Vínculo: o que sustenta a autonomia é o comportamento, não o texto.** *(cláusulas 1.3, 4, 7.7, 15.5; F1 a F6)*

- **Assume:** a cláusula 4 descreve condutas do WorkEasy, e o código as cumpre hoje (Anexo II).
- **Li:** a CLT define empregador como quem, "assumindo os riscos da atividade econômica, admite, assalaria e dirige a prestação pessoal de serviço" (art. 2º) e empregado como a pessoa física que presta serviço "de natureza não eventual", "sob a dependência" do empregador "e mediante salário" (art. 3º). O art. 442-B afasta a qualidade de empregado do autônomo contratado "com ou sem exclusividade, de forma contínua ou não", "cumpridas por este todas as formalidades legais". A redação da MP 808/2017, que proibia cláusula de exclusividade, está como "vigência encerrada" no texto compilado: não a use.
- **Pontos do produto para o trabalhista:** (i) ordem da busca por nota; (ii) limite de propostas por pedido e cota mensal; (iii) trava de dias; (iv) cancelamentos repetidos tratados como quebra de regra (7.7); (v) na linha Cuidado, a oferta em que "o primeiro que aceita fica com o plantão", o registro de entrada e saída com localização, o relatório do dia e o valor do plantão definido por fora.
- **Pergunto:** o desenho é compatível com a autonomia nas ocupações de trabalho doméstico e de cuidado? O que muda antes de abrir a linha Cuidado?

**P2. Convenção 193 da OIT: alcance e sinais para o texto.** *(cláusulas 8.5, 17; F7 a F9)*

- **Assume:** o texto não afirma conformidade com a Convenção. As cláusulas 8.5 e 17 seguem a direção dela (informar os automatismos, avisar e deixar responder antes de suspender).
- **Li:** "digital labour platform" é a pessoa que, "using automated decision-making systems", "organizes and/or facilitates work performed by persons for remuneration" (art. 1(a)). O resumo da OIT de 25/09/2026 diz que a Convenção "does not go so far as to cover platforms that are online billboards, search engines or online marketplaces" (nota 5, **[incerto]**: não reaberta). Se valesse: informar sobre sistemas automatizados (art. 13); explicação por escrito e revisão de suspensão, com "appropriate human involvement" (art. 15); vedação de suspensão por motivo discriminatório ou ilícito (art. 17); informação sobre pagamentos e descontos (art. 11); termos claros (art. 18).
- **Pergunto:** o WorkEasy é "marketplace" nesse sentido ou "digital labour platform"? Ele calcula a ordem da busca, aplica limites, cobra pelo app e suspende.

**P3. Aceite próprio destes Termos.** *(cláusula 3; F17)*

- **Assume:** aceite separado no cadastro de prestador (3.1, **[PLANEJADO]**). Hoje o app registra `terms` e `privacy` com a versão `2026-10-rascunho` (G1).
- **Opções:** (a) publicar este texto como parte dos Termos de Uso, com um só aceite e uma só versão; (b) criar a finalidade `provider_terms` (migration nova) e uma caixa no Cadastro.
- **Pergunto:** qual opção? O documento 01 (P5) trata da prova do aceite. Por ser contrato de adesão, as cláusulas ambíguas se interpretam a favor de quem adere e é nula a renúncia antecipada a direito resultante da natureza do negócio (Código Civil, arts. 423 e 424).

**P4. Assinatura Pro e Código de Defesa do Consumidor.** *(cláusulas 3.3, 10; F15, F16)*

- **Assume:** assinatura simples, com preço mostrado antes, cancelamento a qualquer momento e sem devolução do mês pago "salvo se a lei mandar" (10.7).
- **Pergunto:** (a) o prestador é "consumidor" (CDC, art. 2º: "destinatário final") ao assinar uma ferramenta que usa na atividade dele? **[incerto]**, não li jurisprudência. Se for: (b) arrependimento em 7 dias, com devolução (art. 49); o Decreto 7.962/2013 exige sumário do contrato com as cláusulas restritivas enfatizadas (art. 4º, I), meio de cancelamento (art. 4º, V), resposta em até cinco dias (art. 4º, parágrafo único) e meios claros de arrependimento, pela mesma ferramenta da contratação (art. 5º e § 1º); (c) o art. 51 anula cláusula que permita variar o preço unilateralmente (X), cancelar sem igual direito (XI) ou mudar o contrato depois de celebrado (XIII): 3.3 e 10.2 só mudam preço com aviso de 30 dias† e direito de cancelar; (d) forma e antecedência do aviso do fim do teste (pergunta 7 de `DECISOES.md`): hoje só a tela mostra a data (G5); (e) cancelar no teste realmente impede a cobrança? O app só chama `deleteSubscription` no Asaas. Que o Asaas cancele a cobrança pendente é suposição minha **[incerto]**: confirmar no sandbox.

**P5. Reajuste de preço de assinatura em curso.** *(cláusula 10.2)*

- O preço é lido na hora de assinar e vai ao Asaas como valor da assinatura mensal. Mudar `pro_price_cents` não muda quem já assina (G5).
- O texto promete aviso de 30 dias† e direito de cancelar. Para cumprir, o produto precisa de uma função que reajuste ou recrie as assinaturas, e isso é código de dinheiro: decisão do dono. O advogado confirma o aviso.

**P6. Suspensão e cobrança do Pro.** *(cláusula 17.6)*

- A suspensão não pausa a assinatura (G6). O texto diz que a cobrança segue, com devolução proporcional† se a suspensão for desfeita por erro. É uma escolha minha, mais dura para o prestador. Alternativa: pausar a cobrança durante a suspensão (exige código). Qual é defensável?

**P7. Fluxo de pagamento da reserva, mesmo com comissão zero.** *(cláusulas 11.4, 12.4; F22, F27)*

- **Assume:** descrição factual do fluxo, sem dizer que o WorkEasy "não é instituição de pagamento". O código cobra na conta do WorkEasy no Asaas e usa split para a carteira do prestador (`payments-create`). O Asaas calcula o split sobre o valor líquido ("O Split é calculado sobre o `netValue`") e estorna os repasses quando estorna a cobrança (F27).
- **Li:** Lei 12.865/2013, art. 6º, III: instituição de pagamento é a pessoa jurídica que, aderindo a arranjos de pagamento, tem como atividade, entre outras, "executar ou facilitar a instrução de pagamento" (b) e "credenciar a aceitação de instrumento de pagamento" (e). O § 4º deixa fora da lei os arranjos e instituições cujo volume, abrangência e natureza, definidos pelo Banco Central, não ofereçam risco ao normal funcionamento dos pagamentos de varejo. A Resolução BCB 150/2021, citada em `DECISOES.md` §4, não foi aberta **[incerto]**.
- **Pergunto:** a pergunta 1 de `DECISOES.md` vale já para o fluxo sem comissão? E o pagamento retido (12.4)?

**P8. Autorização para usar a chave da subconta.** *(cláusula 11.3)*

- O WorkEasy guarda no Vault a chave de API da subconta de cada prestador e a usa para criar e cancelar cobranças em nome dele (`charges-create`, `payments-void`, `account-delete`). A cláusula 11.3 pede autorização expressa e limitada à finalidade.
- **Pergunto:** isso é mandato? Basta a cláusula de adesão ou precisa de aceite destacado? O Asaas devolve a chave uma única vez; se ela se perder, a conta fica sem cobrança até o suporte agir.

**P9. Termos do Asaas e ativação da subconta.** *(cláusulas 11.1, 11.2; F25, F26)*

- Não li os termos do Asaas para o titular de subconta: a URL de termos que testei redirecionou para a tela de login **[incerto]**. A pesquisa I01 deve cobrir.
- **Li na documentação do Asaas:** subcontas são contas do Asaas vinculadas a uma conta-pai; a criação por API é permitida só a conta-pai de pessoa jurídica (CNPJ), então o WorkEasy precisa da empresa antes; no modelo não-BaaS o titular recebe e-mail de ativação, define a senha e envia a documentação pela interface do Asaas; a conta-pai deve manter os dados da subconta atualizados; em produção, no período de avaliação, há limites (até 10 subcontas, R$ 2.000,00 em cobranças por subconta e 60 dias; resumo do leitor de páginas, confirmar em I01).
- **Pergunto:** qual modelo (BaaS ou não-BaaS)? Isso muda quem aceita quais termos e o que a cláusula 11 precisa dizer.

**P10. Comissão.** *(cláusula 12; `DECISOES.md`, pergunta 2)*

- **Assume:** descrição neutra e condicional (12.2). No código, a comissão nunca incide em ocupação "só assinatura" nem "em análise jurídica" (`private.platform_fee`).
- **Pergunto:** (a) compatibilidade com as regras de cada conselho; (b) "primeiro serviço": o código usa "atendimento da plataforma, concluído, com pagamento recebido pelo app, entre o mesmo cliente e o mesmo prestador". Um cliente que o prestador já atendia por fora (origem "próprio") e depois pede pela plataforma seria tratado como cliente novo. É justo? (c) aviso prévio de 30 dias† e valor mostrado antes de aceitar (G12); (d) cláusula de não-contorno (fechar o primeiro serviço por fora): deixei de fora, como o documento 01 (P16). Se entrar, só junto com a comissão; o advogado diz se vale; (e) nota fiscal da comissão: contador.

**P11. Publicidade em plataforma, preço público e responsabilidade do prestador.** *(cláusulas 8.4, 13; F15, F23, F24)*

- **Assume:** o prestador responde pela própria publicidade (13.1, 13.2).
- **Li:** a norma do CFM define publicidade médica como comunicação ao público "com iniciativa, participação e/ou anuência do médico" (art. 1º) e põe a responsabilidade no médico como pessoa física (art. 3º, I); os dados do art. 4º devem estar na página principal do perfil (art. 6º); as publicações de terceiros e de pacientes com elogios à técnica e ao resultado, quando reiteradas, "devem ser investigadas" (art. 8º, § 4º). O provimento da OAB diz que as informações são "de exclusiva responsabilidade das pessoas físicas identificadas" (art. 1º, § 1º). Exemplos de variação: preço e desconto (CFM art. 9º, VI e VIII, permite; OAB art. 3º, I, veda).
- **Problema de produto:** o app mostra preço em todas as ocupações e a política não tem campo de preço (G13); mostra o registro, mas não especialidade nem RQE (G7).
- **Pergunto:** (a) ao exibir o anúncio, o WorkEasy responde junto (anuência, participação)? (b) para quais conselhos é preciso ocultar preço, nota, depoimento ou imagem? (a matriz por conselho é da Frente A, não daqui); (c) 13.5 ("não cadastre serviços") serve como solução provisória? (d) avaliações públicas de médicos têm risco para o médico? Hoje 140 ocupações CFM/CRM estão sem ranking por nota.

**P12. Assinatura fixa e captação de clientela.** *(cláusulas 8.3, 9, 10; F23, F24)*

- Mesmo sem comissão, pagar para aparecer numa busca e enviar propostas pode ser visto como pagamento por captação. O provimento da OAB diz que a publicidade profissional deve ter caráter informativo, "não podendo configurar captação de clientela ou mercantilização da profissão" (art. 3º, caput) e veda pagar para aparecer em rankings (art. 5º, § 1º). A norma do CFM trata de "redes próprias" do médico (art. 8º, § 1º e § 2º) e da compra de espaço em veículos de comunicação (art. 13, II); não está claro onde cai um perfil em plataforma de terceiros **[incerto]**.
- O WorkEasy não vende destaque (8.3). O Pro dá propostas sem limite (acesso a pedidos). **Pergunto:** a assinatura é compatível com cada conselho, principalmente OAB e CFM?

**P13. LC 214/2025, art. 22: plataformas digitais e IBS/CBS.** *(cláusulas 14.5, 14.6; F11 a F13; `DECISOES.md`, pergunta 3)*

- **Assume:** 14.5 e 14.6 só informam e ficam condicionais.
- **Li (texto compilado do Planalto, com a redação da LC 227/2026, art. 174):** § 1º: plataforma digital é a que "atua como intermediária entre fornecedores e adquirentes nas operações e importações realizadas de forma não presencial ou por meio eletrônico" e controla um ou mais elementos essenciais da operação: cobrança, pagamento, definição dos termos e condições ou entrega. Pelo caput e pelo inciso II, a plataforma responde pelo pagamento do IBS e da CBS solidariamente com o fornecedor residente e domiciliado no País se (a) não fornecer as informações do § 5º, ou (b) o fornecedor for contribuinte, mesmo sem inscrição, e não emitir documento fiscal eletrônico no valor da operação. § 5º: informar ao Comitê Gestor do IBS e à RFB as operações, "inclusive identificando o fornecedor". § 6º: informações para o split payment, "quando disponível". § 7º: não há responsabilidade por diferenças se a plataforma apresentar as informações do § 5º e, quando o split payment for possível, as do § 6º. § 11: sem responsabilidade nas operações em que a plataforma não controla nenhum elemento essencial. §§ 12 e 13: com a anuência do fornecedor, pode emitir documentos fiscais em nome dele e pagar, ou ser substituta tributária. Art. 23: a plataforma "deverá se inscrever no cadastro do IBS e da CBS no regime regular".
- **Decreto 12.955/2026 (CBS), art. 20:** repete a regra e deixa a forma de informar para "ato conjunto da RFB e do CGIBS" (§ 4º), que não li **[incerto]**. O inciso II traz uma alínea "c" ("não registre a operação em documento fiscal") que a redação da LC 227/2026 não tem, e o compilado do Planalto ainda a mostra sem marca de revogação. A redação vigente fica por confirmar **[incerto]**.
- **Vigência:** o art. 544, VI, manda produzir efeitos desde 1º/1/2026 os dispositivos não listados nos incisos I a V. Os arts. 21 a 23 não estão listados, então a leitura é de efeitos desde 1º/1/2026. Isso fica por confirmar **[incerto]**. A cobrança é escalonada: 2026 é ano de teste (CBS 0,9% e IBS 0,1%, arts. 346 e 343), compensado e com recolhimento dispensado a quem cumprir as obrigações acessórias (art. 348, I e § 1º), e as alíquotas de teste "não serão aplicadas" às operações de optantes pelo Simples Nacional (art. 348, III, "c").
- **Pergunto:** (a) o WorkEasy é plataforma digital nos atendimentos pagos pelo app? E nas cobranças do Pro feitas na subconta do prestador (o WorkEasy dá a ferramenta, mas não "cobra")? (b) precisa se inscrever e informar operações já? (c) vale oferecer a opção do § 12 ou do § 13? (d) o que coletar do prestador (regime, CPF ou CNPJ, inscrição municipal): é o portão 5 de `DECISOES.md` §4.

**P14. MEI, Simples e nota fiscal.** *(cláusula 14.3; F14)*

- **Li:** LC 123/2006, art. 26: as empresas do Simples emitem documento fiscal conforme o Comitê Gestor (I); o MEI fica "dispensado" (§ 1º), mas a emissão é obrigatória nas vendas e nas prestações de serviço do MEI para destinatário cadastrado no CNPJ (§ 6º, II). O art. 18-B mantém para a empresa que contrata MEI em hidráulica, eletricidade, pintura, alvenaria, carpintaria e manutenção ou reparo de veículos as obrigações de contratante de contribuinte individual, salvo se presentes os elementos da relação de emprego (§§ 1º e 2º).
- **Pergunto:** o app deve avisar o MEI quando o cliente é empresa e avisar a empresa cliente do art. 18-B? Várias políticas têm o local "empresa do cliente". A LC 238/2026 aparece como "Vide" no art. 18-A, § 1º; não a li **[incerto]** e por isso não cito o limite do MEI.

**P15. Nota fiscal da mensalidade e tributos do WorkEasy.** *(cláusula 10.11)*

- O app não emite nota da mensalidade (G15). O contador define município, tipo de nota e configuração. O WorkEasy também é contribuinte pelo que cobra do prestador; fica com o contador.

**P16. Trava do trabalho doméstico e LC 150/2015.** *(cláusula 15; F10; documento 01, P10)*

- **Assume:** 15.2 a 15.4 seguem as telas e o documento 01.
- **Li:** LC 150/2015, art. 1º: empregado doméstico é quem presta serviços "de forma contínua, subordinada, onerosa e pessoal e de finalidade não lucrativa à pessoa ou à família, no âmbito residencial destas, por mais de 2 (dois) dias por semana". Parágrafo único: "É vedada a contratação de menor de 18 (dezoito) anos".
- **Pergunto (lado do prestador):** (a) contar dias não cobre "subordinação", que depende dos fatos (P1): o texto 15.4 diz isso com clareza suficiente? (b) o aviso de erro do app manda "contratar diretamente" (`labor_lock` em `lib/errors.ts`): para o prestador, isso empurra o vínculo? (c) a trava só reconhece a mesma pessoa por `client_id`, `household_id` ou telefone e e-mail iguais no CRM: duas pessoas da mesma família com contas diferentes não são vistas como a mesma casa; (d) o app não confere a idade (2.1).

**P17. Papéis na LGPD.** *(cláusula 18; F19 a F21)*

- **Assume:** o quadro de 18.2: o WorkEasy é controlador dos dados do prestador; controlador, ao lado do prestador, dos dados do cliente que chegam pela plataforma; operador do CRM, dos orçamentos e das cobranças de clientes próprios. O documento 07 (OP-10 e OP-15) parte da mesma hipótese e a deixa como pergunta (Q1 e Q13).
- **Li:** LGPD, art. 5º, VI e VII (controlador decide; operador trata "em nome do controlador"), art. 39 (o operador segue as instruções), art. 42 e § 1º (o operador responde solidariamente se descumprir a lei ou as instruções lícitas; os controladores "diretamente envolvidos" no tratamento respondem solidariamente). Guia da ANPD v2.0: o agente é definido por operação (§ 8); a pessoa natural é controladora quando age no próprio interesse e decide as finalidades e os elementos essenciais (§ 9); os papéis são funcionais, não só contratuais (§ 17); a controladoria conjunta exige poder de decisão de mais de um controlador, interesse mútuo e decisões comuns ou convergentes, e todos os critérios (§§ 49 e 50); o mesmo conjunto de dados com finalidades distintas não é controladoria conjunta (§ 45); exemplo 1: a médica profissional liberal é controladora dos dados dos pacientes.
- **Pergunto:** (a) controladores independentes ou controladoria conjunta nos dados do cliente que chegam pelo pedido? O WorkEasy decide o canal, o prazo e o que o prestador vê. (b) A trava usa telefone e e-mail do CRM do prestador: finalidade do WorkEasy, então ele é controlador desses campos? (c) O contrato de operação (o guia, § 55, o recomenda) cabe em 18.4 ou precisa de anexo (objeto, duração, tipos de dado, instruções, suboperadores)? (d) A Resolução CD/ANPD 2/2022 trata como agentes de pequeno porte as microempresas, empresas de pequeno porte (inclui MEI), startups e pessoas naturais (art. 2º), dispensa o encarregado, mas exige canal de comunicação (art. 11), e não vale para tratamento de alto risco (art. 3º, I); o art. 4º, II, "d", lista dados de crianças, adolescentes e idosos. Vale para o WorkEasy, dada a linha Cuidado? (e) Os clientes próprios são terceiros sem conta, que não veem estes Termos nem a política. Quem os informa e com qual base legal, se o WorkEasy é só operador? A página pública do orçamento e a cobrança não mostram aviso de privacidade (G16; documento 07, Q13). O item 18.3 (f) põe o dever de informar no prestador.

**P18. Certidão de antecedentes criminais.** *(cláusula 5.6; F19)*

- **Assume:** consentimento específico, pedido quando o prestador envia a certidão, revogável em "Minha conta". A retirada não dispara nada no código (G11).
- **Li:** consentimento é "manifestação livre, informada e inequívoca ... para uma finalidade determinada" (art. 5º, XII); por escrito, em cláusula destacada (art. 8º, § 1º); o ônus da prova é do controlador (§ 2º); é vedado o tratamento com vício de consentimento (§ 3º); revogável a qualquer momento (§ 5º). Antecedentes criminais não estão na lista de dados sensíveis do art. 5º, II, mas pedem cuidado.
- **Pergunto:** condicionar a aprovação ao consentimento tira a liberdade? Nas ocupações em que a certidão é exigida por norma (crianças e adolescentes), outra base legal serve melhor (art. 7º, II)? O histórico de consentimentos é apagado com a conta (G10): como provar depois?

**P19. Exclusão, retenção e prova.** *(cláusulas 18.6, 20; F14, F18, F19)*

- **Assume:** ficam registros de pagamento e de atendimento, sem nome e contatos; a auditoria, que é imutável e pode ter texto livre; e o pedido de exclusão.
- **Li:** LGPD, art. 16, I (conservação para cumprir obrigação legal ou regulatória); CTN, arts. 173 e 174 (5 anos para constituir e para cobrar o crédito tributário) e art. 195, parágrafo único (livros e comprovantes conservados até a prescrição); LC 123/2006, art. 26, II (Simples: documentos guardados "enquanto não decorrido o prazo decadencial e não prescritas eventuais ações"). O prazo exato e quais registros ficam são **[incerto]**.
- **Pergunto:** (a) o `audit_log`, que ninguém altera nem apaga, é compatível com os direitos do art. 18 da LGPD? (b) a exclusão apaga o histórico de consentimentos (G10); (c) a chave da subconta no Vault não é apagada e a subconta do Asaas não é fechada (G10); (d) as anotações do prestador sobre um cliente somem quando o cliente exclui a conta (18.6): o prestador pode precisar delas para se defender?

**P20. Responsabilidade, indenização, regresso e adesão.** *(cláusulas 1.3, 19, 22.4; F15, F17, F19)*

O documento 01 (P1 e P2) trata da posição do WorkEasy perante o consumidor. Aqui:

- (a) 19.3 (o WorkEasy não responde) convive com o CDC, art. 25 (nula a cláusula que exonere ou atenue o dever de indenizar) e art. 51, I. Isso vale para o cliente consumidor. Entre o WorkEasy e o prestador, o Código Civil presume contratos "paritários e simétricos" (art. 421-A), mas este é de adesão (arts. 423 e 424).
- (b) Regresso (19.4): CDC, art. 7º, parágrafo único, art. 25, § 1º e art. 34; para dados, LGPD, art. 42, § 4º.
- (c) 19.5 (indenização com honorários): precisa de limite? A exceção por culpa ou dolo do WorkEasy já está no texto.
- (d) CDC, art. 14, § 4º (responsabilidade pessoal do profissional liberal por culpa): como se aplica ao MEI e à empresa?
- (e) Seguro: o catálogo exige seguro de responsabilidade civil em uma só ocupação (motorista de aplicativo).

**P21. Foro, mediação, arbitragem e cessão.** *(cláusulas 21, 22.2; F15, F17)*

- Segue o documento 01 (P9): sem arbitragem obrigatória; foro da sede, ressalvado o do consumidor. Para prestador empresa, a eleição de foro é, em tese, possível; o documento 01 (P9) cita o CPC, art. 63, § 1º, que não reabri. O Código Civil fala em "liberdade contratual" (art. 421) e em "intervenção mínima" nas relações privadas (art. 421, parágrafo único). A mediação é só convite. A cessão (22.2) é limitada ao sucessor, com aviso; o documento 01 deixou de fora a cessão livre para consumidor.

**P22. Prazos e valores que eu sugeri.** Ver a seção E.

**P23. Telemedicina e prontuário.** *(cláusula 13.7)*

- O texto diz que o WorkEasy não oferece e que, se oferecer, será com termos próprios. A diretriz do produto (empresa registrada no CRM, responsável técnico, prontuário certificado) não foi conferida em norma **[incerto]**. O documento 01 (9.5) diz o mesmo.

### B. Itens marcados [incerto]

| # | O que não consegui confirmar | Onde aparece | Como resolver |
|---|---|---|---|
| 1 | Ratificação da Convenção 193 pelo Brasil | quadro, P2 | NORMLEX da OIT (devolveu erro 403 para mim) e site do Congresso |
| 2 | Andamento do mérito dos Temas 1.389 e 1.291 depois de 2026-10-23 | quadro, P1 | Portal do STF, na data da publicação |
| 3 | Termos do Asaas para o titular de subconta; tarifas; prazos de liquidação por meio de pagamento; encerramento de conta | 11.2, 11.4, 20.5, P9 | Pesquisa I01 e contrato do Asaas |
| 4 | Se o prestador é consumidor na assinatura do Pro | P4 | Advogado, com jurisprudência |
| 5 | Se o Asaas cancela a cobrança pendente quando a assinatura é apagada (promessa "cancele antes e não paga") | 10.5, P4 | Teste no sandbox do Asaas |
| 6 | Prazo de guarda do registro financeiro | 20.4, P19 | Contador e advogado |
| 7 | Atos conjuntos RFB/CGIBS sobre a informação das plataformas; leitura do art. 544, VI, da LC 214 sobre os arts. 21 a 23 | P13 | Contador e advogado tributarista |
| 8 | Resolução BCB 150/2021 | P7 | Advogado |
| 9 | Regras de publicidade dos conselhos além do CFM e da OAB; o texto oficial do CFM (a cópia do CRM-ES não pôde ser relida em 2026-11-08: PDF ilegível; a página oficial do CFM pede senha) | 13.3, P11, P12 | Matriz por conselho (Frente A) |
| 10 | Requisitos de telemedicina e prontuário | 13.7, P23 | Advogado de saúde |
| 11 | Redação vigente do art. 22, II, da LC 214 (alínea "c") | P13 | Texto da LC 227/2026 e do regulamento |
| 12 | Se o WorkEasy é "plataforma digital" (LC 214) e "digital labour platform" (C193) | P2, P13 | Advogado |
| 13 | Se um perfil em plataforma de terceiros é "rede própria" do médico (CFM, art. 8º) | P12 | Advogado, com o CFM |
| 14 | LC 238/2026 (aparece como "Vide" no art. 18-A, § 1º, da LC 123) | P14 | Contador |
| 15 | Leis lidas no planalto.gov.br em 2026-10-23 (CLT, CDC, LC 150/2015, LC 123/2006, LC 214/2025, LC 227/2026, Decretos 7.962/2013 e 12.955/2026, LGPD, Lei 12.865/2013, CTN, Código Civil). Não reabertas em 2026-11-08: a página de bloqueio da Presidência respondeu às tentativas feitas (LC 150, LC 214, LC 227 e CDC) e as demais não foram tentadas. Os artigos citados valem como lidos em 2026-10-23 | 2.1, 14.3, 14.5, 15.2, 18.3, 19.2, 19.4, 20.4, P4, P13, P16, P17, P19 | Reabrir cada lei no planalto.gov.br ou no DOU, ou pedir ao advogado a conferência, antes de publicar |
| 16 | Convenção 193 (F7) e nota 5 do resumo da OIT (F9) não reabertas: PDFs ilegíveis para a ferramenta. O P2 cita a nota 5 ("online marketplaces") e o art. 1(a) | P2, quadro | Ler o texto oficial em formato de texto e conferir antes de publicar |

### C. O que o texto pressupõe e o produto ainda não faz (para o dono)

Cada item diz o que o texto assume e o que o código faz. Os itens G5(a), G1, G2 e G3 devem ser resolvidos antes de aceitar prestadores reais. O item G16, antes de ativar as cobranças de clientes seus.

- **G1. Aceite próprio e páginas legais.** O app registra só `terms` e `privacy`. `consent_purpose` não tem finalidade para estes Termos. Os dois links da caixa de aceite apontam para `/legal`, que é um texto provisório ("Documentos em elaboração"). *(3.1)*
- **G2. Avisos ao prestador.** Não há modelo de notificação para aprovação, recusa ou suspensão. O motivo da suspensão e o da recusa de registro ou de ocupação ficam só no `audit_log` e na tela do administrador. A tela do prestador manda "falar com o suporte". *(5.7, 5.9, 17.8)*
- **G3. Revisão e resposta.** Não há canal no app para pedir revisão nem para responder a aviso. Só e-mail para o SAC, que ainda não existe como página. *(6.5, 17.3 a 17.5)*
- **G4. Validade de documentos.** `provider_documents.expires_at` existe, mas o envio não a preenche, nenhuma tela a edita e nenhum job a usa. O administrador só vê "Validade informada" se houver valor. *(6.3)*
- **G5. Assinatura Pro.**
  - (a) **Nada rebaixa `providers.plan` quando `current_period_end` passa.** Quem cancela, inclusive no teste, fica com `plan = 'pro'` por tempo indeterminado, a menos que um evento do Asaas chegue depois da data. É falha de receita: falta um job (pg_cron) que volte o plano a `free`. *(10.5, 10.7)*
  - (b) Não há aviso antes da primeira cobrança depois do teste. *(10.6)*
  - (c) Mudar `pro_price_cents` não reajusta assinaturas em curso. *(10.2)*
  - (d) A carência é a variável `PRO_GRACE_DAYS` (padrão 0) e a tela não a mostra. *(10.9)*
  - (e) `create_own_booking` diz "Pro" no comentário, mas não confere o plano; o texto 9.1 segue o código.
- **G6. Suspensão não pausa a assinatura** nem cancela as cobranças do Pro. *(17.6)*
- **G7. Dados exigidos por conselho.** O cadastro não tem especialidade, número de especialista nem responsável técnico. A página mostra registro, número, UF e situação, e não mostra o CNPJ de empresas. *(13.4)*
- **G8. Prestador pessoa jurídica.** Sem campo de CNPJ nem de licença em `providers`; `provider_type` não é imposto. *(2.3)*
- **G9. Regime tributário** (MEI, Simples ou outro) não é coletado. É o portão 5 de `DECISOES.md` §4. *(14.4)*
- **G10. Exclusão de conta.** (a) O histórico de consentimentos é apagado em cascata. (b) A chave da subconta fica no Vault: não há `vault.delete_secret` no código. (c) A subconta do Asaas não é fechada. (d) As anotações do prestador sobre um cliente somem quando o cliente exclui a conta. *(18.6, 20)*
- **G11. Consentimento de antecedentes.** Retirá-lo não revoga documento nem aprovação. *(5.6)*
- **G12. Comissão.** A taxa só é calculada quando o atendimento vira "aceito" e só aparece como "Taxa da plataforma" na cobrança já criada (`Cobrancas.tsx`). Falta mostrá-la antes de o prestador aceitar. Hoje não afeta, porque a comissão está desligada. *(12.2)*
- **G13. Preço público.** A política não tem campo para ocultar preço. `search_providers` e `get_provider_page` devolvem preço para todas as ocupações. Não existe função de administrador para ocultar preço ou texto de um perfil; só avaliação, aprovação de ocupação e suspensão. *(13.5, 13.6)*
- **G14. Ativação no Asaas.** A tela não avisa que o Asaas pode enviar e-mail de ativação e pedir documentos. O modelo (BaaS ou não-BaaS) não está definido. Os limites do período de avaliação do Asaas afetam o beta (P9). *(11.2)*
- **G15. Nota fiscal da mensalidade.** O app não emite. *(10.11)*
- **G16. Cliente próprio sem aviso.** A página pública do orçamento (`pages/publico/Orcamento.tsx`) e a cobrança não mostram aviso de privacidade ao cliente próprio, que é terceiro sem conta. O nome, o CPF ou CNPJ, o e-mail e o telefone dele vão ao Asaas pela subconta do prestador (`charges-create`). *(18.3, 18.4)*
- **G17. Comissão e "cliente trazido".** O código cobra a taxa em todo atendimento de origem plataforma que não tenha antes um atendimento pago pela plataforma com o mesmo cliente ou a mesma entrada do CRM. Não verifica se a plataforma trouxe o cliente nem se você já o atendia por fora. *(12.2, P10)*

### D. Números do catálogo (calculados de `apps/web/catalog/policies.json` em 2026-10-23)

Outros agentes estão ajustando o catálogo em paralelo: recalcule antes de publicar.

| Dado | Quantidade |
|---|---|
| Ocupações | 1.710 |
| Política "a confirmar" / "conferido" | 1.057 / 653 |
| Ocupações regulamentadas | 778 |
| Que exigem certidão de antecedentes | 631 |
| Que atendem crianças ou adolescentes | 165 |
| Sem ranking por nota (por regulador: CFM/CRM 140, CFO/CRO 37, OAB 36, CFP/CRP 25, outros 34) | 272 |
| Cobrança: comissão no primeiro serviço / só assinatura / em análise jurídica | 1.111 / 324 / 275 |
| Com trava de trabalho doméstico | 32 |
| Tipo de prestador: só autônomo / autônomo ou empresa / só empresa licenciada | 331 / 1.297 / 82 |
| Que exigem seguro de responsabilidade civil | 1 |

### E. Prazos e valores que eu sugeri (marcados com †)

Nenhum tem norma por trás. São decisões de negócio do dono, com o advogado.

| Onde | Sugestão | Por quê |
|---|---|---|
| 3.3, 9.4, 10.2, 12.2 (f) | Aviso de 30 dias antes de mudança que piora a situação do prestador | Dá tempo de cancelar sem perder o que já foi combinado |
| 6.5 | Resposta em 10 dias úteis a pedido de revisão de recusa de cadastro | Prazo de fila de um operador pequeno |
| 10.6 | Aviso de mensagem 3 dias antes da primeira cobrança depois do teste | Tempo de cancelar |
| 17.3 | 10 dias para o prestador responder ao aviso; decisão em 10 dias úteis | Direito de resposta antes da suspensão |
| 17.4 | Aviso em até 2 dias úteis depois de suspensão cautelar | Suspensão na hora, aviso logo depois |
| 17.5 | Revisão respondida em 10 dias úteis | Igual aos demais |
| 17.6 | Devolução proporcional da mensalidade se a suspensão for desfeita por erro | Escolha minha (P6) |
| 20.6 | Aviso de 60 dias se o WorkEasy encerrar o serviço | Tempo de baixar os dados |
| 21.2 | Resposta do SAC ao prestador em 10 dias úteis | O documento 10 fixa 5 dias corridos para o SAC (base: Decreto 7.962/2013, art. 4º, parágrafo único); o documento 04 lê 7 dias corridos no Decreto 13.135/2026, art. 21, para demandas não urgentes (a confirmar). Alinhar antes de publicar |

### F. Antes de publicar

1. Preencher os seis dados da empresa e apagar toda marca **[PLANEJADO]** que ainda não exista no produto.
2. Resolver cada **[CONDICIONAL: depende de parecer]**: manter com o texto aprovado, ou apagar o recurso do produto e do texto.
3. Decidir o aceite próprio (P3) e, se for o caso, criar a finalidade em migration nova e atualizar `CONSENT_VERSIONS` em `apps/web/config/legal.ts`.
4. Corrigir no produto, antes de aceitar prestadores reais: G5(a), G2 e G3. Os demais G dizem o que o texto não pode prometer enquanto não existirem.
5. Conferir, na data da publicação, o quadro do STF e da OIT, o catálogo (seção D) e os valores do Anexo I.
6. Alinhar números e nomes com os documentos 01, 03, 04, 05, 10 e 11 (prazo do SAC, contestação em 7 dias, ordem da busca, trava de 2 dias). Também: a mensalidade do Pro (10.7 e 10.9) não tem regra no documento 04 (reembolso e arrependimento).
7. Retirar do texto público os anexos, esta seção e as fontes.
8. Rodar `test/claims-guard.test.ts` depois de copiar qualquer trecho deste texto para o código do app.

## Fontes consultadas

Todas abertas em 2026-10-23. **Revisão de 2026-11-08:** reabertas e conferidas as fontes F2, F3, F4, F5, F6, F8, F21, F24, F26 e F27, sem divergência com o texto. **Não reabertas nesta revisão:** F1 (não tentada), F10 a F19 e F22 (planalto.gov.br devolveu a página de bloqueio da Presidência para F10, F11, F12 e F15, sem texto de lei; as demais leis desse site não foram tentadas; camara.leg.br devolveu 404 para a LC 150/2015); F7 e F9 (PDFs da OIT ilegíveis para a ferramenta); F20 (não tentada); F23 (PDF do CFM protegido por senha ou ilegível). Esses trechos seguem como lidos em 2026-10-23 e estão em B.15 e B.16. As leis, decretos e normas (F1, F2, F7, F9 a F24) foram baixados e lidos no original, artigo por artigo, do site oficial (exceto F23, cópia hospedada por um conselho regional). As páginas F3 a F6, F8 e F25 a F27 foram lidas por uma ferramenta de leitura de páginas, que devolve resumo e trechos curtos: os trechos dessas fontes, abaixo, são curtos e vale reconferi-los. Resultados de busca, blogs e a notícia do Poder360 sobre o Tema 1.389 serviram só para achar as fontes primárias; não são base de nenhuma afirmação.

### Lista de fontes

| Id | Fonte | Partes lidas | URL | Aberta em |
|---|---|---|---|---|
| F1 | Decreto-Lei 5.452/1943 (CLT), texto compilado | arts. 2º, 3º e 442-B (e as redações da MP 808/2017 marcadas "vigência encerrada") | https://www.planalto.gov.br/ccivil_03/decreto-lei/del5452.htm | 2026-10-23 |
| F2 | STF, página do Tema 1.389 | título, descrição, relator, situação | https://portal.stf.jus.br/jurisprudenciaRepercussao/tema.asp?num=1389 | 2026-10-23 |
| F3 | STF, página do Tema 1.291 (o acesso direto devolveu 403; lida pelo leitor de páginas) | título, descrição, relator, situação | https://portal.stf.jus.br/jurisprudenciaRepercussao/tema.asp?num=1291 | 2026-10-23 |
| F4 | STF, notícia de 18/06/2026, "STF retira suspensão de processos sobre 'pejotização' na primeira instância e nos TRTs" | texto inteiro | https://noticias.stf.jus.br/postsnoticias/stf-retira-suspensao-de-processos-sobre-pejotizacao-na-primeira-instancia-e-nos-trts/ | 2026-10-23 |
| F5 | STF, notícia de 28/08/2025, "Julgamento sobre 'pejotização' não abrange relações de trabalho intermediadas por aplicativos" | texto inteiro | https://noticias.stf.jus.br/postsnoticias/julgamento-sobre-pejotizacao-nao-abrange-relacoes-de-trabalho-intermediadas-por-aplicativos/ | 2026-10-23 |
| F6 | STF, notícia de 25/06/2026, "STF retira de pauta julgamento sobre trabalho em plataformas digitais após aprovação de convenção da OIT" | texto inteiro | https://noticias.stf.jus.br/postsnoticias/a-pedido-da-dpu-e-do-mpt-stf-retira-de-pauta-julgamento-sobre-relacoes-de-trabalho-em-plataformas-digitais/ | 2026-10-23 |
| F7 | OIT, Convenção 193, texto adotado em 12/06/2026 (PDF em inglês) | arts. 1 a 33 | https://www.ilo.org/sites/default/files/2026-06/ILC114-Instrument%20C.193-EN.pdf | 2026-10-23 |
| F8 | OIT, notícia de 16/06/2026, "New ILO convention on platform work offers important safeguards for workers in Türkiye" | adoção, votos, classificação como questão nacional | https://www.ilo.org/resource/news/new-ilo-convention-platform-work-offers-important-safeguards-workers | 2026-10-23 |
| F9 | OIT, "Decent Work in the Platform Economy Convention No. 193 at a glance", 25/09/2026 (PDF) | definições, escopo (nota 5), arts. 13, 15, 17 e 18 | https://www.ilo.org/sites/default/files/2026-09/Convention%20No%20193%20at%20a%20glance.pdf | 2026-10-23 |
| F10 | Lei Complementar 150/2015 | art. 1º e parágrafo único | https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp150.htm | 2026-10-23 |
| F11 | Lei Complementar 214/2025, texto compilado | arts. 21 a 23, 343, 346, 348 e 544 | https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp214.htm | 2026-10-23 |
| F12 | Lei Complementar 227/2026 | art. 174 (alterações ao art. 22 da LC 214) | https://www.planalto.gov.br/ccivil_03/leis/lcp/Lcp227.htm | 2026-10-23 |
| F13 | Decreto 12.955/2026 (regulamento da CBS) | art. 20 | https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12955.htm | 2026-10-23 |
| F14 | Lei Complementar 123/2006, texto compilado | arts. 18-A, 18-B, 18-E e 26 | https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp123.htm | 2026-10-23 |
| F15 | Lei 8.078/1990 (CDC), texto compilado | arts. 2º, 3º, 7º, 14, 25, 34, 36 a 38, 47, 49, 51, 54 e 101 | https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm | 2026-10-23 |
| F16 | Decreto 7.962/2013 (comércio eletrônico) | arts. 1º a 6º | https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm | 2026-10-23 |
| F17 | Lei 10.406/2002 (Código Civil), texto compilado | arts. 421, 421-A, 422 a 424, 593 e 594 | https://www.planalto.gov.br/ccivil_03/leis/2002/l10406compilada.htm | 2026-10-23 |
| F18 | Lei 5.172/1966 (Código Tributário Nacional), texto compilado | arts. 173, 174 e 195 | https://www.planalto.gov.br/ccivil_03/leis/l5172compilado.htm | 2026-10-23 |
| F19 | Lei 13.709/2018 (LGPD), texto compilado | arts. 5º, 7º, 8º, 16, 18, 37 a 39, 41, 42 e 48 | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm | 2026-10-23 |
| F20 | ANPD, Guia orientativo para definições dos agentes de tratamento de dados pessoais e do encarregado, versão 2.0, abril de 2022 (PDF) | §§ 6 a 9, 17, exemplo 1, 43 a 55, 61 e 62 | https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_agentes_de_tratamento_e_encarregado___defeso_eleitoral.pdf (página: https://www.gov.br/anpd/pt-br/documentos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado) | 2026-10-23 |
| F21 | ANPD, Resolução CD/ANPD 2/2022 (texto do site, que registra a alteração pela Resolução 15/2024) | arts. 1º a 4º e 11 a 13 | https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-2-de-27-de-janeiro-de-2022 | 2026-10-23 |
| F22 | Lei 12.865/2013 | art. 6º | https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/lei/l12865.htm | 2026-10-23 |
| F23 | CFM, Resolução 2.336/2023 (publicidade e propaganda médicas). Li a cópia hospedada pelo CRM-ES; a página oficial do CFM mostrou o PDF protegido por senha | arts. 1º a 9º e 11 a 14 | https://crmes.org.br/wp-content/uploads/2023/09/Resolucao-2336-2023-publicidade-e-propaganda-medica.pdf (oficial, não lida: https://sistemas.cfm.org.br/normas/visualizar/resolucoes/BR/2023/2336) | 2026-10-23 |
| F24 | OAB, Provimento 205/2021 (publicidade e informação da advocacia) | arts. 1º a 6º e Anexo Único | https://www.oab.org.br/leisnormas/legislacao/provimentos/205-2021 | 2026-10-23 |
| F25 | Asaas, documentação, "Subcontas" (fonte do próprio Asaas; leitor de páginas) | visão geral dos modelos | https://docs.asaas.com/docs/subcontas | 2026-10-23 |
| F26 | Asaas, documentação, "Criação de subcontas" (leitor de páginas) | campos, e-mail de ativação, chave, deveres da conta-pai, limites do período de avaliação | https://docs.asaas.com/docs/criacao-de-subcontas | 2026-10-23 |
| F27 | Asaas, documentação, "Introdução - Split de pagamento" (leitor de páginas) | cálculo sobre o valor líquido, estorno | https://docs.asaas.com/docs/split-de-pagamentos | 2026-10-23 |

### Trechos lidos (curtos, como estão nas fontes)

- **F1, art. 2º, caput:** "Considera-se empregador a empresa, individual ou coletiva, que, assumindo os riscos da atividade econômica, admite, assalaria e dirige a prestação pessoal de serviço."
- **F1, art. 3º, caput:** "Considera-se empregado toda pessoa física que prestar serviços de natureza não eventual a empregador, sob a dependência deste e mediante salário."
- **F1, art. 442-B:** "A contratação do autônomo, cumpridas por este todas as formalidades legais, com ou sem exclusividade, de forma contínua ou não, afasta a qualidade de empregado prevista no art. 3º desta Consolidação." (Lei 13.467/2017)
- **F2:** Tema 1.389, "Competência e ônus da prova nos processos que discutem a existência de fraude no contrato civil/comercial de prestação de serviços; e a licitude da contratação de pessoa jurídica ou trabalhador autônomo para essa finalidade." Situação: "Acórdão de Repercussão Geral publicado - Publicado em: 24/04/2025".
- **F3 (leitor de páginas):** Tema 1.291, "Reconhecimento de vínculo empregatício entre motorista de aplicativo de prestação de serviços de transporte e a empresa administradora de plataforma digital"; leading case RE 1446336; relator Min. Edson Fachin; acórdão de repercussão geral publicado em 02/07/2024.
- **F4 (leitor de páginas):** a retirada da suspensão vale "apenas para a primeira e a segunda instâncias da Justiça do Trabalho"; houve "significativo represamento" de processos; a suspensão volta depois do julgamento pelos TRTs, até a tese do STF.
- **F6 (leitor de páginas):** o presidente do STF retirou o RE 1446336 da pauta porque o MPT e a DPU informaram a aprovação, em 12/6, da Convenção 193 da OIT; Uber e amici foram intimados a falar em cinco dias; sem nova data.
- **F7, art. 1(a):** "digital labour platform" é a pessoa que, "through digital technologies, using automated decision-making systems", "organizes and/or facilitates work performed by persons for remuneration or payment".
- **F7, art. 15(1)(b):** os trabalhadores devem ter acesso a "a review of decisions, as appropriate, that result in ... the suspension or deactivation of their account".
- **F7, art. 17:** os países devem proibir a suspensão ou desativação "when it is based on discriminatory or otherwise unlawful grounds".
- **F7, art. 27, 1 e 2:** "binding only upon those Members ... whose ratifications have been registered"; "It shall come into force twelve months after the date on which the ratifications of two Members have been registered".
- **F9, nota 5:** "The Convention does not go so far as to cover platforms that are online billboards, search engines or online marketplaces as well as those that sell or rent assets."
- **F10, art. 1º:** "[...] aquele que presta serviços de forma contínua, subordinada, onerosa e pessoal e de finalidade não lucrativa à pessoa ou à família, no âmbito residencial destas, por mais de 2 (dois) dias por semana [...]".
- **F11, art. 22, § 1º:** "[...] atua como intermediária entre fornecedores e adquirentes nas operações e importações realizadas de forma não presencial ou por meio eletrônico; e [...] controla um ou mais dos seguintes elementos essenciais à operação: a) cobrança; b) pagamento; c) definição dos termos e condições; ou d) entrega."
- **F11, art. 23:** "A plataforma digital [...] deverá se inscrever no cadastro do IBS e da CBS no regime regular para fins de cumprimento do disposto no art. 22."
- **F11, art. 544, VI:** produz efeitos "a partir de 1º de janeiro de 2026, em relação aos demais dispositivos".
- **F14, art. 26, § 1º:** o MEI fica "dispensado da emissão do documento fiscal previsto no inciso I do caput, ressalvadas as hipóteses de emissão obrigatória previstas pelo referido Comitê"; **§ 6º, II:** "será obrigatória a emissão de documento fiscal nas vendas e nas prestações de serviços realizadas pelo MEI para destinatário cadastrado no Cadastro Nacional da Pessoa Jurídica (CNPJ), ficando dispensado desta emissão para o consumidor final."
- **F15, art. 14, caput e § 4º:** "O fornecedor de serviços responde, independentemente da existência de culpa, pela reparação dos danos causados aos consumidores por defeitos relativos à prestação dos serviços, bem como por informações insuficientes ou inadequadas sobre sua fruição e riscos."; "A responsabilidade pessoal dos profissionais liberais será apurada mediante a verificação de culpa."
- **F15, art. 37:** "É proibida toda publicidade enganosa ou abusiva."
- **F16, art. 4º, I:** "apresentar sumário do contrato antes da contratação, [...] enfatizadas as cláusulas que limitem direitos"; **art. 5º, § 1º:** "O consumidor poderá exercer seu direito de arrependimento pela mesma ferramenta utilizada para a contratação [...]".
- **F17, art. 423:** "Quando houver no contrato de adesão cláusulas ambíguas ou contraditórias, dever-se-á adotar a interpretação mais favorável ao aderente."
- **F18, art. 195, parágrafo único:** "Os livros obrigatórios de escrituração comercial e fiscal e os comprovantes dos lançamentos nêles efetuados serão conservados até que ocorra a prescrição dos créditos tributários decorrentes das operações a que se refiram."
- **F19, art. 5º, VI e VII:** controlador é quem decide sobre o tratamento; operador é quem "realiza o tratamento de dados pessoais em nome do controlador". **Art. 16, I:** conservação autorizada para "cumprimento de obrigação legal ou regulatória pelo controlador".
- **F20, § 8:** "o agente de tratamento é definido para cada operação de tratamento de dados pessoais, portanto, a mesma organização poderá ser controladora e operadora [...]". **Exemplo 1:** "A médica, pessoa natural, é a controladora dos dados pessoais."
- **F21, art. 11:** "Os agentes de tratamento de pequeno porte não são obrigados a indicar o encarregado [...]"; § 1º: devem "disponibilizar um canal de comunicação com o titular de dados".
- **F22, art. 6º, III, "b" e "e":** "executar ou facilitar a instrução de pagamento relacionada a determinado serviço de pagamento"; "credenciar a aceitação de instrumento de pagamento".
- **F23, art. 4º, I e II:** os anúncios devem conter "nome, número(s) de registro(s) no(s) CRM(s) [...], acompanhados da palavra MÉDICO" e a especialidade com o RQE; **art. 9º, VI e VIII:** é permitido "informar sobre valores de consultas" e "anunciar abatimentos e descontos em campanhas promocionais".
- **F24, art. 3º, I:** é vedada a "referência, direta ou indireta, a valores de honorários, forma de pagamento, gratuidade ou descontos e reduções de preços como forma de captação de clientes".
- **F26 (leitor de páginas):** "A criação de subcontas via API é permitida para contas-pai de pessoa jurídica (CNPJ)." No modelo não-BaaS, "o Asaas envia um e-mail de ativação para o endereço informado no cadastro".
- **F27 (leitor de páginas):** "O Split é calculado sobre o `netValue`, ou seja, o valor da cobrança após o desconto das taxas aplicáveis." "Quando uma cobrança com Split é estornada, os repasses relacionados também são estornados."

### O que não foi aberto

NORMLEX da OIT (erro 403); termos de uso do Asaas para titular de subconta (a URL de termos redirecionou para o login); Resolução BCB 150/2021; atos conjuntos da RFB e do CGIBS sobre as plataformas digitais; LC 238/2026; acórdãos do STF (Temas 1.389 e 1.291) e do STJ; jurisprudência sobre consumidor "destinatário final" na contratação de ferramentas profissionais; normas de publicidade dos conselhos além do CFM (cópia) e da OAB; regras de telemedicina e prontuário; CPC art. 63, Marco Civil da Internet e ECA Digital (lidos no documento 01, não reabertos aqui); Decreto 13.135/2026 (que revogou o Decreto 11.034/2022, art. 24, segundo o documento 04; ver também o documento 10). Os fatos do produto estão no Anexo II.
