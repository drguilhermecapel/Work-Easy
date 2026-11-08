# Política de Cancelamento, Reembolso e Garantia

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| Campo | Conteúdo |
|---|---|
| Versão | 2026-10-rascunho (mesma etiqueta de `CONSENT_VERSIONS.terms` em `apps/web/config/legal.ts`) |
| Data de vigência | [DATA DE VIGÊNCIA] |
| Empresa responsável | [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO] (a empresa ainda não existe) |
| SAC | [E-MAIL DO SAC] |
| Encarregado de dados | [E-MAIL DO ENCARREGADO] |
| Estado do produto | Protótipo. Não publicado, sem usuários reais, sem teste com Asaas, WhatsApp ou Resend. Comissão e pagamento retido desligados. |
| Revisão deste texto | 2026-11-08 |

## Como ler

- Cláusulas numeradas, em frases curtas. Quando a regra é do app, o texto diz "hoje".
- **[PLANEJADO]**: ainda não existe no app.
- **[CONDICIONAL: depende de parecer]**: depende de decisão jurídica que ainda não foi tomada. Não aplique a regra sem o parecer.
- **[PROPOSTA]**: decisão de negócio sugerida. Não é exigência de lei.
- **[incerto]**: não confirmado em fonte aberta nesta revisão. A lista completa está em "Pontos para o advogado".
- Cada norma citada foi aberta em 2026-11-08. Os links e o que foi lido estão em "Fontes consultadas".

## Resumo

| Sua situação | O que acontece hoje | Como pedir | Prazo |
|---|---|---|---|
| Pedi um horário e ainda não há resposta | Você cancela. Nada é cobrado. | Botão "Cancelar atendimento" no app | Não há prazo (cláusula 3) |
| O profissional aceitou e eu ainda não paguei | Você cancela. A cobrança em aberto é cancelada. | Botão "Cancelar atendimento" no app | Não há prazo (cláusula 3) |
| Paguei e quero desistir ou cancelar | O app não tem botão para isso. | SAC: [E-MAIL DO SAC] | Resposta em até 5 dias (proposta, cláusula 9) |
| Paguei um atendimento que já estava cancelado | O WorkEasy pede o estorno total ao Asaas (Pix e cartão). | Automático. Se falhar, a equipe resolve pelo SAC. | Cartão: até 10 dias úteis para aparecer na fatura, segundo o Asaas. Pix: [incerto] |
| Paguei por boleto e o atendimento foi cancelado | O estorno de boleto depende de dados bancários que você envia. O app não faz isso sozinho hoje. | SAC: [E-MAIL DO SAC] | [incerto] |
| O serviço não foi feito como combinado | Você pode contestar. A equipe decide a situação do atendimento no app. Essa decisão não devolve dinheiro. | Botão "Contestar atendimento" (só em "Concluído") | Até 7 dias depois do fim do horário |
| O profissional não compareceu | O app não tem marcação de não comparecimento. | SAC: [E-MAIL DO SAC] | Resposta em até 5 dias (proposta) |
| Quero desistir em até 7 dias da contratação | Direito de arrependimento (CDC, art. 49). Efeito e valor dependem de parecer. | SAC: [E-MAIL DO SAC] | 7 dias (cláusula 6) |
| Quero que o WorkEasy refaça o serviço ou me devolva o valor | O WorkEasy não oferece essa garantia. Seus direitos contra o profissional continuam (cláusula 7). | SAC, para mediação | Não se aplica |

## 1. Quem presta o quê

1.1 O WorkEasy é o aplicativo que conecta clientes e profissionais. O serviço é prestado pelo profissional. O papel do WorkEasy na relação é tema de parecer [CONDICIONAL: depende de parecer] (ver "Pontos para o advogado", A1).

1.2 Esta política vale para atendimentos e cobranças feitos pelo app. Pagamento combinado fora do app não passa pelo WorkEasy (Termos de Uso, cláusula 6.5).

1.3 Atendimento de cliente próprio do profissional segue as mesmas regras de estado. A cobrança é emitida pelo profissional, na conta de recebimento dele, e a cobrança em aberto é cancelada pelo mesmo caminho da cláusula 3.4.

## 2. Estados do atendimento

Só o banco de dados muda o estado de um atendimento. Cada mudança entra no histórico, com o motivo quando houver. O cliente vê esse histórico na tela do atendimento.

| Estado (nome na tela) | Significado | Cliente pode | Profissional pode |
|---|---|---|---|
| Aguardando o profissional | Pedido de horário, sem resposta | Cancelar | Aceitar ou recusar (recusar cancela) |
| Aceito | O profissional confirmou o horário | Cancelar; gerar a cobrança pelo app | Iniciar ou cancelar |
| Pago | Pagamento pelo app recebido, confirmado pelo Asaas | Nada | Iniciar |
| Em andamento | O atendimento começou | Nada | Concluir |
| Concluído | O profissional marcou como concluído | Liberar, ou contestar em até 7 dias depois do fim do horário | Nada |
| Liberado | O cliente liberou, ou a equipe decidiu a favor do profissional | Nada | Nada |
| Em contestação | Contestação aberta | Nada | Nada (a equipe decide) |
| Cancelado | Cancelado por você, pelo profissional ou pela equipe | Nada | Nada |

2.1 **Hoje, depois do pagamento, nenhum dos dois lados pode cancelar o atendimento pelo app.** O botão não aparece em "Pago". Veja a cláusula 5.5 para o caminho atual.

## 3. Cancelar como cliente

3.1 Você pode cancelar enquanto o atendimento está em "Aguardando o profissional" ou em "Aceito". Use o botão "Cancelar atendimento". O motivo é opcional, com até 1.000 caracteres. O cancelamento não pode ser desfeito.

3.2 O app não cobra multa de cancelamento. Não existe taxa de cancelamento no código que cancela o atendimento. [PROPOSTA: nenhuma multa nesta fase.]

3.3 Hoje, o app não confere o horário ao cancelar. Um atendimento aceito pode ser cancelado depois do horário marcado. [PROPOSTA: regra de horário, quadro 3.5.]

3.4 Se havia uma cobrança em aberto, o app pede ao Asaas que a cancele. Se esse pedido falhar, a tela avisa que a cobrança "será cancelada em breve". O cancelamento do atendimento vale mesmo assim. Não pague cobrança de atendimento cancelado. Se pagar, aplica-se a cláusula 5.2.

3.5 Quadro proposto para o cancelamento pelo cliente. [PROPOSTA: decisão de negócio; ver "Pontos para o advogado", C3.]

| Momento | Efeito proposto | Hoje no app |
|---|---|---|
| Antes do pagamento e antes do horário | Sem custo. A cobrança em aberto é cancelada. | Funciona |
| Depois do pagamento e antes do horário | Devolução do valor pago pelo caminho da cláusula 5 [CONDICIONAL: depende de parecer] | Sem botão. Pedido pelo SAC. |
| Sem pagamento e depois do horário marcado | Não pelo app. Pedido ao SAC, que a equipe analisa. | O app aceita o cancelamento (sem conferência de horário) |
| Com pagamento e depois do horário marcado | Pelo SAC. Se houver contestação, cláusula 8. | Sem botão |

3.6 Um pedido de horário sem resposta não vence sozinho. Ele continua reservando o horário até o profissional responder ou até alguém cancelar. [PLANEJADO: vencimento automático do pedido.]

3.7 Pedido "urgente": o marcador de urgência muda só a ordem em que o profissional vê o pedido. Não muda prazo, multa nem reembolso. [PROPOSTA: nenhuma regra própria para urgência nesta fase.]

## 4. Cancelar como profissional

4.1 O profissional pode recusar um pedido de horário em "Aguardando o profissional". Recusar não gera custo nem penalidade pelo app.

4.2 O profissional pode cancelar um atendimento em "Aceito", pelo botão "Cancelar atendimento", com confirmação. Em "Pago", "Em andamento" ou depois, o app não permite o cancelamento pelo profissional.

4.3 Se havia cobrança em aberto, ela é cancelada, como na cláusula 3.4.

4.4 Hoje o app não envia mensagem ao cliente quando um atendimento é cancelado. Os lembretes pendentes são descartados, e nada é enviado no lugar. O cliente vê o cancelamento e o motivo na tela do atendimento. [PLANEJADO: aviso de cancelamento por WhatsApp ou e-mail.]

4.5 Cancelamentos repetidos e sem motivo podem ser tratados como quebra de regra, com aviso, nos termos do documento 02 (Termos do Prestador, cláusulas 7.7 e 17). [PROPOSTA: o painel ainda não calcula taxa de cancelamento por profissional. Ele conta atendimentos por status.]

4.6 Quando o atendimento já está pago, o profissional fala com o SAC (cláusula 5.5).

4.7 Cancelamentos não entram na ordem das buscas. As buscas usam nota e nome. Nas ocupações em que o ranking por nota não é permitido, a ordem muda a cada dia, por um código calculado a partir do profissional e da data (sem relação com cancelamentos). Ver ARQUITETURA.md, seção de página pública do profissional.

4.8 Não comparecimento do profissional: o app não tem marcação de não comparecimento. Você pede pelo SAC, e a equipe analisa (cláusula 8). [PLANEJADO: estado de não comparecimento para atendimento.]

4.9 Não comparecimento do cliente: o app não tem marcação para isso. Para concluir, o profissional precisa primeiro iniciar o atendimento. [PLANEJADO.]

## 5. Pagamento, cobrança e estorno

5.1 Cobrança em aberto de atendimento cancelado: o app pede ao Asaas que a remova. Se o Asaas já a mostra como paga, ela fica pendente até o aviso de pagamento chegar. Nesse caso, aplica-se a cláusula 5.2.

5.2 Pagamento recebido de atendimento já cancelado: o app registra o pagamento, registra a ocorrência e pede ao Asaas o estorno total. Esse pedido só é aceito pelo Asaas para cobrança de cartão ou de Pix (documentação do Asaas, "Estornar cobrança", consultada em 2026-11-08).

5.3 Prazos e canais, conforme a forma de pagamento:

| Forma de pagamento | Como o estorno é pedido | Prazo informado pela fonte | Se falhar |
|---|---|---|---|
| Cartão de crédito | Pelo app, por API, total | O Asaas diz que o cancelamento "pode levar até 10 dias úteis para aparecer na fatura do pagador". O prazo depende do emissor do cartão. [incerto] | O caso aparece na lista "Exigem atenção" da equipe |
| Pix | Pelo app, por API, total | O Asaas não informa prazo. O estorno exige saldo suficiente na conta, senão responde erro 400. [incerto] | Mesmo caminho do cartão |
| Boleto | O app não chama o estorno de boleto hoje. O Asaas tem endpoint próprio, "Estornar boleto", que depende de dados bancários que você envia. [PLANEJADO] | O Asaas não informa prazo. [incerto] | O caso vai para o SAC |

5.4 Prazo proposto para o WorkEasy pedir o estorno: até 5 dias úteis depois da decisão ou do aviso de pagamento. O prazo do banco ou da operadora de cartão vem depois disso (cláusula 5.3). [PROPOSTA]

5.5 Atendimento pago que você quer cancelar ou desistir: hoje o app não tem botão. Você pede pelo SAC. [PLANEJADO: procedimento de devolução pela equipe, com prazo e forma definidos.] Se o pedido for aceito, a devolução segue o que a lei exige (cláusula 6) e o que o parecer definir. [CONDICIONAL: depende de parecer.]

5.6 A decisão da equipe no app muda a situação do atendimento. Ela não devolve nem repassa dinheiro pelo app. A tela de administração diz isso expressamente. Por isso, a devolução depende do procedimento da cláusula 5.5.

5.7 Repasse ao profissional: com a comissão desligada, a taxa da plataforma é zero, e o split envia o valor inteiro à conta de recebimento do profissional (`supabase/functions/_shared/split.ts`). O WorkEasy não retém esse valor. Se o estorno desfaz o repasse que já chegou à conta do profissional, o efeito é [incerto].

5.8 Cobrança errada ou não reconhecida: fale com o SAC. Ver Termos de Uso, cláusula 6.7.

5.9 Se a comissão ou o pagamento retido forem ligados, esta cláusula será revista. [CONDICIONAL: depende de parecer; DECISOES.md, seção 4.] Se houver comissão, ela será descontada do profissional. Não será cobrada do cliente, conforme a decisão D11 em DECISOES.md.

## 6. Direito de arrependimento

6.1 Texto do CDC, art. 49, caput (Lei 8.078/1990): "O consumidor pode desistir do contrato, no prazo de 7 dias a contar de sua assinatura ou do ato de recebimento do produto ou serviço, sempre que a contratação de fornecimento de produtos e serviços ocorrer fora do estabelecimento comercial, especialmente por telefone ou a domicílio."

6.2 Parágrafo único: "Se o consumidor exercitar o direito de arrependimento previsto neste artigo, os valores eventualmente pagos, a qualquer título, durante o prazo de reflexão, serão devolvidos, de imediato, monetariamente atualizados."

6.3 Aplicação ao WorkEasy: a contratação é feita pelo app. Se o art. 49 vale para serviço contratado pelo app é questão de parecer. [CONDICIONAL: depende de parecer.] A notícia do STJ de 2015 diz que a regra vale para compras feitas pela internet. É uma notícia, não o acórdão. Um caso de passagem aérea comprada pela internet (REsp 1.913.986, 4ª Turma) foi suspenso por pedido de vista (cláusula 6.5 e "Pontos para o advogado", B2).

6.4 Prazo: 7 dias. Quando a contagem começa para um atendimento do app (aceite, pagamento ou data do serviço) é tema de parecer. [CONDICIONAL: depende de parecer.]

6.5 Serviço já começado ou feito: o texto lido não diz se, depois do início, a devolução é integral, parcial ou inexistente. O WorkEasy não promete devolução integral nem recusa o pedido automaticamente. [CONDICIONAL: depende de parecer.]

6.6 Como pedir: pelo SAC, [E-MAIL DO SAC]. [PLANEJADO: botão de arrependimento no próprio app, pela mesma ferramenta da contratação.]

6.7 Decreto 7.962/2013, art. 5º (comércio eletrônico). Texto lido:
- Caput: "O fornecedor deve informar, de forma clara e ostensiva, os meios adequados e eficazes para o exercício do direito de arrependimento pelo consumidor."
- § 1º: "O consumidor poderá exercer seu direito de arrependimento pela mesma ferramenta utilizada para a contratação, sem prejuízo de outros meios disponibilizados."
- § 2º: "O exercício do direito de arrependimento implica a rescisão dos contratos acessórios, sem qualquer ônus para o consumidor."
- § 3º: o exercício do arrependimento é comunicado ao emissor do cartão ou à instituição financeira. O texto completo das hipóteses está truncado na leitura, e não o copiei. [incerto]
- § 4º: "O fornecedor deve enviar ao consumidor confirmação imediata do recebimento da manifestação de arrependimento."

6.8 Aplicação do § 1º ao caso concreto: o pedido pelo SAC basta, ou o app precisa de botão próprio? [CONDICIONAL: depende de parecer.] Ver "Pontos para o advogado", B4.

## 7. Garantia

7.1 O WorkEasy não oferece garantia própria. Não existe "Garantia WorkEasy" de refazer o serviço nem de devolver o valor pelo WorkEasy. [CONDICIONAL: depende de parecer e de ligar o pagamento retido (DECISOES.md, seção 4).]

7.2 Seus direitos contra o profissional continuam:
- O profissional responde, independentemente de culpa, pelos danos causados por defeitos na prestação do serviço e por informações insuficientes ou inadequadas (CDC, art. 14, caput).
- Em caso de vício de qualidade do serviço, você pode exigir, à sua escolha: a reexecução do serviço, sem custo adicional e quando cabível; a restituição imediata da quantia paga, monetariamente atualizada, sem prejuízo de perdas e danos; ou o abatimento proporcional do preço (CDC, art. 20, caput e incisos I a III).
- São impróprios os serviços que se mostrem inadequados para os fins que razoavelmente deles se esperam (CDC, art. 20, § 2º).

7.3 Prazo para reclamar de vício aparente de serviço: 30 dias ou 90 dias, conforme o serviço seja de natureza não durável ou durável (CDC, art. 26, incisos I e II). [CONDICIONAL: classificação de cada tipo de serviço, em parecer.]

7.4 A mediação do WorkEasy (cláusula 8) não substitui esses direitos. O WorkEasy não garante que o profissional cumpra o combinado.

7.5 Responsabilidade do WorkEasy: o CDC prevê responsabilidade solidária quando há mais de um responsável pelo dano (art. 25, § 1º) e quando há mais de um autor da ofensa (art. 7º, parágrafo único). Se o WorkEasy responde junto com o profissional é tema de parecer. [CONDICIONAL: depende de parecer.]

## 8. Contestação e mediação

8.1 Quem: o cliente. Quando: atendimento em "Concluído", em até 7 dias depois do fim do horário marcado. Depois desse prazo, o botão some, e a tela avisa que o prazo terminou.

8.2 Como: o botão "Contestar atendimento" pede o motivo, com pelo menos 5 caracteres.

8.3 Análise: a equipe analisa o atendimento e registra a decisão, com o motivo, no histórico. Hoje há duas decisões possíveis:
- "Liberar a favor do profissional": o atendimento passa para "Liberado".
- "Cancelar a favor do cliente": o atendimento passa para "Cancelado".

8.4 A decisão não move dinheiro pelo app (cláusula 5.6).

8.5 Como mediador, o WorkEasy pode: receber e registrar a contestação; registrar a decisão com o motivo; moderar avaliações (cláusula 10); aplicar as regras de suspensão do documento 02. Hoje não pode: reter valores (cláusula 5.7), obrigar o profissional a refazer o serviço, ou garantir resultado.

8.6 A decisão da equipe no app não impede você de procurar o profissional, os órgãos de defesa do consumidor ou a Justiça.

8.7 Contestação e arrependimento são pedidos diferentes. A contestação trata do serviço feito. O arrependimento trata de desistir da contratação (cláusula 6).

## 9. SAC e prazos de resposta

9.1 Canal: e-mail, [E-MAIL DO SAC]. O app não tem telefone, formulário ou chat de atendimento. [PLANEJADO]

9.2 Prazo de resposta proposto: 5 dias corridos. [PROPOSTA] Base: Decreto 7.962/2013, art. 4º, parágrafo único: "A manifestação do fornecedor às demandas previstas no inciso V do caput será encaminhada em até cinco dias ao consumidor." O inciso V manda manter atendimento eletrônico que permita resolver demandas de "informação, dúvida, reclamação, suspensão ou cancelamento do contrato". [CONDICIONAL: depende de parecer quanto a serviço contratado pelo app.]

9.3 Decreto 13.135/2026 (texto lido na cópia da Câmara):
- Revoga o Decreto 11.034/2022 (art. 24). Os rascunhos 01 e 02 citam o decreto revogado. Ver "Pontos para o advogado", A4.
- Entra em vigor 20 dias após a publicação (art. 25). A cópia indica publicação no DOU de 13/10/2026. Pela contagem, a vigência seria 02/11/2026. [incerto: confirmar a data no DOU.]
- Demandas não urgentes: resposta em até 7 dias corridos (art. 21).
- Histórico: fornecido em até 5 dias úteis, mediante solicitação, e guardado por seis meses (art. 18, § 4º, I e II).
- Cancelamento: efeitos imediatos, salvo processamento técnico justificado (art. 20, § 1º, II). É preciso opção de cancelamento imediato de contratos e serviços no atendimento eletrônico (art. 13, § 1º, I).
- Aplicação ao WorkEasy: [CONDICIONAL: depende de parecer.] O art. 1º, parágrafo único, alcança fornecedores de serviços regulados pelo Poder Executivo federal e serviços financeiros supervisionados pelo Banco Central. O art. 2º alcança operadores de plataformas digitais de intermediação. O texto aberto do art. 2º não define esse termo. [incerto: texto completo do art. 2º.]

9.4 Cancelamento pelo SAC [PROPOSTA]: para atendimento não pago, o SAC faz o mesmo que o botão do app (cláusula 3). Para atendimento pago, aplica-se a cláusula 5.5.

9.5 Registro: [PROPOSTA] cada pedido e cada resposta ficam registrados por seis meses, como o Decreto 13.135/2026 prevê para o histórico (art. 18, § 4º, II). [CONDICIONAL: depende de parecer.]

## 10. Avaliações

10.1 Você só pode avaliar um atendimento "Concluído" ou "Liberado" que tem pagamento recebido pelo app. Atendimento cancelado não pode ser avaliado.

10.2 Cancelamento não altera a nota do profissional. Os cancelamentos não entram na ordem das buscas (cláusula 4.7).

10.3 Na contestação: "Liberar a favor do profissional" permite a avaliação só se houver pagamento recebido pelo app. "Cancelar a favor do cliente" impede a avaliação.

10.4 A publicação e a moderação das avaliações estão no documento 05 (Política de Avaliações e Moderação).

## 11. Conta e atendimentos abertos

11.1 Não é possível excluir a conta enquanto houver atendimento "Aceito", "Pago", "Em andamento" ou "Em contestação". Para excluir, conclua ou cancele o atendimento, quando o app permitir, ou aguarde a decisão da equipe. A regra está em ARQUITETURA.md, seção da função `account-delete`.

11.2 Consequência: um atendimento "Pago" que não pode ser cancelado pelo app pode impedir a exclusão da conta até a equipe agir. [PLANEJADO: caminho de cancelamento para atendimento pago, cláusula 5.5.]

## 12. Mudanças desta política

12.1 Esta é a versão 2026-10-rascunho. Mudança que piora a sua situação será avisada antes de valer, com prazo a definir. [PROPOSTA: ver documento 01, cláusula 1.4.]

12.2 Atendimentos já aceitos seguem a versão desta política em que nasceram. [PROPOSTA]

## Pontos para o advogado

**A. Papel do WorkEasy e aplicação das normas**

- **A1.** O WorkEasy atua como intermediário, como fornecedor do serviço, ou em outra posição? A resposta muda a aplicação dos arts. 3º, 7º, parágrafo único, 14 e 25, § 1º do CDC. Hoje o WorkEasy não recebe nem retém o valor pago (cláusula 5.7).
- **A2.** O Decreto 13.135/2026 alcança o WorkEasy pelo art. 1º, parágrafo único, ou pelo art. 2º (plataforma digital de intermediação)? Se alcança, há obrigações de cancelamento com efeitos imediatos, opção de cancelamento em todos os níveis do atendimento eletrônico, e envio de modelos de atendimento à Senacon (art. 2º). Preciso o texto completo do art. 2º. [incerto]
- **A3.** O Decreto 7.962/2013 trata de "contratação no comércio eletrônico" (art. 1º). O texto lido não define o termo. Um serviço contratado pelo app entra nele?
- **A4.** Os rascunhos 01 (Termos de Uso) e 02 (Termos do Prestador), além do documento 10 (SAC), citam o Decreto 11.034/2022. Esse decreto foi revogado pelo art. 24 do Decreto 13.135/2026. As referências devem ser atualizadas antes de publicar. O decreto revogado não foi aberto nesta revisão, porque o planalto.gov.br bloqueou o acesso.

**B. Arrependimento**

- **B1.** O art. 49 do CDC vale para o serviço contratado pelo app? Qual evento inicia a contagem de 7 dias: o aceite, o pagamento, ou a data do serviço?
- **B2.** Serviço já começado ou feito: qual é a devolução? Não encontrei decisão do STJ que trate desse caso. Há um caso pendente, REsp 1.913.986 (4ª Turma), sobre passagens aéreas. A notícia de 18/11/2025 diz que o relator votou pela aplicação do art. 49 e que o julgamento foi suspenso por pedido de vista. A notícia também cita o art. 740 do Código Civil e um índice de retenção de até 5% para compras a menos de 7 dias do embarque. Não abri o Código Civil nem o acórdão. [incerto: andamento do REsp depois de 18/11/2025.]
- **B3.** O § 3º do art. 5º do Decreto 7.962/2013 manda comunicar o exercício do arrependimento ao emissor do cartão. Quem faz essa comunicação: o WorkEasy, o Asaas, ou o profissional, quando a cobrança é da conta dele? O texto completo das hipóteses do § 3º não foi lido. [incerto]
- **B4.** O pedido pelo SAC é "meio adequado e eficaz" (art. 5º, caput), ou o § 1º exige que o app ofereça o arrependimento pela mesma ferramenta da contratação?

**C. Cancelamento e multas**

- **C1.** Uma multa de cancelamento, para cliente ou profissional, seria lícita? O CDC, art. 51, incisos II e XI, declara nulas cláusulas que subtraiam o reembolso ou que permitam ao fornecedor cancelar sem igual direito ao consumidor. A proposta é nenhuma multa. Confirmar.
- **C2.** O cancelamento de um atendimento aceito pelo profissional equivale à recusa de cumprimento de oferta (CDC, art. 35)? Se sim, o cliente pode exigir o cumprimento, aceitar outro serviço equivalente, ou rescindir com restituição e perdas e danos (art. 35, incisos I a III).
- **C3.** Qual janela de cancelamento adotar? O quadro 3.5 propõe duas coisas: cancelamento sem custo antes do horário, e devolução integral depois do pagamento. A proposta de restringir o cancelamento depois do horário, com análise pelo SAC, cria assimetria? Ela pode ser cláusula abusiva?
- **C4.** Não comparecimento: é possível cobrar ou devolver sem multa, e qual procedimento a lei exige? Não há regra no app.

**D. Reembolso**

- **D1.** Boleto: o Asaas documenta o estorno de boleto (dados bancários do pagador e permissão `PAYMENT_REFUND:WRITE`). O app hoje não chama esse endpoint. Se o app não oferece devolução por boleto, isso afeta o direito de reembolso (CDC, art. 51, inciso II)? [incerto: a documentação do app afirma o contrário, ver nota técnica abaixo.]
- **D2.** O estorno desfaz o repasse que a subconta do profissional já recebeu? [incerto: confirmar no Asaas.]
- **D3.** Atendimento pago que a equipe decide cancelar, ou contestação decidida a favor do cliente, sem movimento de dinheiro: a regra é aceitável? Quem devolve, e em que prazo? Proposta: 5 dias úteis (cláusula 5.4).
- **D4.** Pix com saldo insuficiente: o Asaas recusa o estorno (erro 400). Quem arca com o custo, e como o caso é tratado? [incerto: prazo do estorno de Pix.]

**E. Garantia e responsabilidade**

- **E1.** Uma "Garantia WorkEasy" só pode ser oferecida depois de ligar o pagamento retido (DECISOES.md, seção 4) e de parecer. Até lá, a palavra "garantia" em telas, anúncios ou lojas pode criar obrigação própria? Qual é a regra?
- **E2.** Quanto de responsabilidade o WorkEasy assume como intermediário, sem reter valores (arts. 7º, parágrafo único, 14 e 25, § 1º)?

**F. SAC**

- **F1.** Prazo de resposta: 5 dias (Decreto 7.962/2013, art. 4º, parágrafo único) ou 7 dias corridos (Decreto 13.135/2026, art. 21)? A proposta adota 5 dias, o prazo mais curto que li.
- **F2.** O e-mail basta como canal? Se o Decreto 13.135/2026 se aplica, quais canais e horários são exigidos? Não li esses dispositivos com atenção. [incerto]

**Itens [incerto], lista completa**

1. Prazo do estorno de Pix e efeito do saldo insuficiente (cláusulas 5.3 e D4).
2. Prazo do estorno de cartão: o Asaas fala em até 10 dias úteis para aparecer na fatura, sem dizer como o emissor trata o prazo (cláusula 5.3).
3. Prazo e forma do estorno de boleto (cláusula 5.3 e D1).
4. Efeito do estorno sobre o repasse já recebido pelo profissional (cláusula 5.7 e D2).
5. Andamento do REsp 1.913.986 depois de 18/11/2025 (cláusula 6.3 e B2).
6. Data de vigência do Decreto 13.135/2026: contagem para 02/11/2026, a confirmar no DOU (cláusula 9.3).
7. Texto completo do art. 2º do Decreto 13.135/2026 e das hipóteses do § 3º do art. 5º do Decreto 7.962/2013, lidos apenas em trecho (cláusula 6.7 e 9.3).
8. Texto oficial do CDC, do Decreto 7.962/2013, do Decreto 13.135/2026 e do Decreto 11.034/2022. O planalto.gov.br bloqueou o acesso desta revisão. Os textos foram lidos nas cópias do portal da Câmara, que avisam não substituir o DOU. Conferir antes de publicar.

**Nota técnica para a equipe (não é parecer)**

Duas divergências entre o código e a fonte, que a equipe precisa resolver antes de o texto virar regra:
- `supabase/functions/_shared/asaas-client.ts` diz que o estorno da API vale só para cartão e Pix. A documentação do Asaas tem um endpoint separado de estorno de boleto. O código de `asaas-webhook` pede o estorno também para boleto e, quando falha, registra `payment.refund_failed`.
- A documentação do Asaas para estorno de boleto não diz que o procedimento é impossível pela API. Ele depende de dados bancários do pagador.

## Fontes consultadas

Todas foram abertas em 2026-11-08, salvo indicação.

| # | Fonte (URL) | Norma ou documento | O que foi lido |
|---|---|---|---|
| 1 | https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html | Lei 8.078/1990 (CDC), texto atualizado, portal da Câmara | Arts. 3º, caput e § 2º; 7º, parágrafo único; 14, caput; 20, caput, incisos I a III e §§ 1º e 2º; 25, § 1º; 26, caput e incisos I e II; 35, caput e incisos I a III; 39, caput, incisos VIII, IX e XII; 49, caput e parágrafo único; 51, caput, incisos I, II, XI, XIII e § 2º. Art. 18, § 1º foi lido, mas não é aplicável a serviço e não foi usado. |
| 2 | https://www2.camara.leg.br/legin/fed/decret/2013/decreto-7962-15-marco-2013-775557-publicacaooriginal-139266-pe.html | Decreto 7.962/2013 (comércio eletrônico), publicação original segundo a própria página (DOU de 15/03/2013) | Art. 1º, caput e incisos I a III; art. 2º (só o caput); art. 4º, caput, inciso V e parágrafo único; art. 5º, caput e §§ 1º a 4º. O § 3º foi lido só até o início das hipóteses. |
| 3 | https://www2.camara.leg.br/legin/fed/decret/2026/decreto-13135-9-outubro-2026-800053-publicacaooriginal-181591-pe.html | Decreto 13.135/2026 (data 9/10/2026; DOU de 13/10/2026, seção 1, p. 5, segundo a página) | Art. 1º, caput e parágrafo único; art. 2º, caput (trecho); art. 8º; art. 13, § 1º, I; art. 18, § 4º, I e II; art. 20, § 1º, II; art. 21; art. 24 (revoga o Decreto 11.034/2022); art. 25 (vigência em 20 dias). A página avisa que não substitui o DOU. |
| 4 | https://www.gov.br/mj/pt-br/assuntos/noticias-1/novo-decreto-do-sac-amplia-protecao-ao-consumidor-e-estabelece-regras-de-atendimento | Notícia do Ministério da Justiça sobre o Decreto 13.135/2026, publicada em 13/10/2026 | Confirma a revogação do Decreto 11.034/2022. É referência oficial, não o texto da norma. |
| 5 | https://docs.asaas.com/reference/estornar-cobranca | Asaas, "Estornar cobrança" (última atualização 08/09/2026, segundo a página) | Endpoint `POST /v3/payments/{id}/refund`; cartão e Pix; prazo de até 10 dias úteis para o cancelamento aparecer na fatura; saldo exigido no Pix (erro 400). |
| 6 | https://docs.asaas.com/reference/estornar-boleto | Asaas, "Estornar boleto" | Estorno de cobrança paga por boleto; depende de dados bancários do pagador; permissão `PAYMENT_REFUND:WRITE`; concluído quando o status for `DONE`. Sem prazo. |
| 7 | https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias-antigas/2015/2015-05-03_08-00_Consumidor-que-compra-pela-internet-tem-assegurado-o-direito-de-se-arrepender.aspx | Notícia do STJ sobre arrependimento em compras pela internet, com referência ao REsp 1.340.604 (2ª Turma) | Notícia, não acórdão. Datas exibidas: 03/05/2015, 12/04/2019 e 13/04/2019. Não se sabe qual é a data de publicação. |
| 8 | https://www.stj.jus.br/sites/portalp/Paginas/Comunicacao/Noticias/2025/18112025-Passagem-aerea-pela-internet-relator-da-sete-dias-para-desistencia-com-devolucao-do-dinheiro.aspx | Notícia do STJ de 18/11/2025 sobre o REsp 1.913.986 (4ª Turma) | Voto do relator, Min. Marco Buzzi, pela aplicação do art. 49; julgamento suspenso por pedido de vista. Não conferi o andamento depois dessa data. |

**Não consegui abrir** (acesso bloqueado pelo planalto.gov.br nesta sessão): texto oficial da Lei 8.078/1990, do Decreto 7.962/2013, do Decreto 13.135/2026 e do Decreto 11.034/2022. Os textos foram lidos nas cópias da Câmara (fontes 1 a 3). O Código Civil, art. 740, aparece apenas como citação em notícia (fonte 8) e não foi aberto.

**Repositório lido** (caminhos relativos a `/home/user/work-easy/`):
- `apps/web/docs/ARQUITETURA.md` (seções de bookings, pagamentos, Edge Functions, webhook, cobranças, conta e administração)
- `apps/web/docs/DECISOES.md` (seções 1 a 4)
- `apps/web/config/legal.ts`
- `apps/web/services/bookings.ts` (`ALLOWED_TRANSITIONS`, `transitionBooking`)
- `apps/web/services/proAgenda.ts`
- `apps/web/components/cliente/BookingActions.tsx`, `apps/web/components/cliente/PaymentPanel.tsx`
- `apps/web/pages/cliente/labels.ts`
- `apps/web/pages/pro/Agenda.tsx`
- `apps/web/components/admin/DisputeCard.tsx`
- `apps/web/supabase/functions/payments-void/handler.ts`
- `apps/web/supabase/functions/_shared/payment-cancel.ts`, `apps/web/supabase/functions/_shared/void-payments.ts`, `apps/web/supabase/functions/_shared/asaas-client.ts`, `apps/web/supabase/functions/_shared/split.ts`
- `apps/web/supabase/functions/asaas-webhook/handler.ts` (`refundAfterCancel`)
- `apps/web/supabase/functions/account-delete/handler.ts`
- `apps/web/supabase/migrations/20261019000005_bookings.sql` (`transition_booking`, `private.booking_transition_allowed`, restrição de sobreposição)
- `apps/web/supabase/migrations/20261019000008_notifications.sql` (`private.expire_stale`, gatilhos de cancelamento)
- `apps/web/supabase/migrations/20261019000011_admin.sql` (`admin_resolve_dispute`, `admin_review_payment`)
- `apps/web/docs/juridico/01-termos-de-uso.md` e `02-termos-do-prestador.md` (lidos para consistência; não editados)
- `apps/web/docs/lojas/app-store.md` (item F40, sem canal de suporte no app)
