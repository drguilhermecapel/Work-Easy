# Consultas a operadores de transporte em São Paulo

**Minutas para revisão comercial e jurídica, 27/11/2026. Envio pendente.** Comercial deve pedir respostas escritas e propostas comparáveis antes de recomendar operador. Esta consulta não constitui pedido de cadastro, contratação, corrida ou exclusividade. [Roadmap e responsáveis](15-mobilidade-de-prestadores.md) · [Decisão D13](../DECISOES.md#d13-mobilidade-opcional-dos-prestadores)

## Premissas para comparação

Anexar às duas consultas os mesmos pares de pontos públicos representativos das microáreas candidatas, com distância, dia, janela, duração e equipamento previstos. Operação escolherá os pares com base na distribuição observada de origens e destinos. Usar dados fictícios identificados para a consulta, sem residências, clientes, telefones pessoais ou detalhes do serviço. Pedir preços em BRL e distinguir estimativa, teto garantido e tarifa final.

| Caso a cotar | Detalhes pedidos |
|---|---|
| Dois trechos independentes | Ida agendada, serviço de três horas, volta a ponto público próximo à origem. Cotar ambas as pernas, embarque e cancelamento separadamente. |
| Serviço mais curto ou mais longo | Mesma ida com término 60 minutos antes ou depois. Comparar retorno remarcado, novo carro e espera de três horas, com tarifa horária e mínimo cobrados. |
| Continuação da agenda | Do primeiro atendimento para um segundo endereço e retorno final. Identificar parte responsável por cada trecho e recibos emitidos. |
| Exceção | Profissional ausente, veículo indisponível, mudança de endereço, cancelamento após embarque, pedágio ou estacionamento. Informar quem absorve cada despesa, autorização necessária e procedimento de disputa. |

## Minuta 1 — Uber para Empresas, Central e Guest Rides

**Assunto sugerido — Condições do Uber Central e do Guest Rides para deslocamento agendado de profissionais independentes em São Paulo**

Olá, equipe Uber para Empresas,

A WorkEasy estuda oferecer transporte opcional a prestadores independentes que já aceitaram um atendimento no endereço de um cliente. O passageiro seria o profissional. Ele pode optar por outro deslocamento. Queremos começar com agendamento assistido em uma ou duas microáreas e compreender os requisitos de eventual integração posterior.

1. A conta WorkEasy pode solicitar corridas para esses profissionais como convidados? Quem figura como contratante e devedor em cada modalidade? Podem identificar o produto, o instrumento aplicável e as cláusulas que permitem ou vedam (a) a WorkEasy pagar a título promocional, (b) o prestador ou o cliente ressarcir o custo exato da viagem e (c) participar de receita, cobrar taxa ou aplicar margem? Consideramos as restrições do §4.5 dos termos brasileiros e a cobrança à conta corporativa no §2.2 do adendo Central. Solicitamos, para eventual exceção, o instrumento comercial específico.
2. Quais perfis de empregado, coordenador e substituto têm acesso permitido a reservas e recibos? Existe perfil permitido para operação terceirizada, com credencial individual e escopo mínimo? Qual canal oficial atende incidentes na janela operacional e como confirmamos cancelamento e custo devidos?
3. Podem cotar os casos anexos e indicar validade, categorias e disponibilidade local para agendamento e volta? Descrevam limite garantido ou ajustável, dinâmica, pedágio, espera, equipamentos como bagagem, condições de no-show, falha do veículo, mudança de horário, contestação e documento final por trecho.
4. Para integração futura, solicitamos requisitos da organização Enterprise, produtos e permissões para sandbox e produção, prazo indicativo, identidade da organização e processo de homologação. Como consultar uma reserva com resposta incerta, identificar duplicação, recuperar estado/cancelamento e obter recibo com ajustes? Quais estados distinguem pedido, confirmação, embarque, conclusão e recibo?
5. Quais dados dos convidados são obrigatórios, que informação de previsão pode ser exibida ao cliente, quais as responsabilidades de privacidade, retenção e notificação de incidentes e como exercer direitos? A WorkEasy pretende apresentar uma previsão ao cliente preservando a origem do profissional. Favor detalhar também quem responde por segurança do passageiro, seguros aplicáveis e tratamento de sinistros.

Agradecemos se puderem responder com minuta, tabela comercial, política de suporte e identificação da área responsável. Nesta consulta solicitamos apenas informações e condições por escrito.

Equipe WorkEasy

**Referências da minuta.** Os termos BR indicam alteração em 06/08/2025 e o adendo Central em 03/12/2025. O §4.2 dos termos limita o cadastro como administrador a empregados. O adendo prevê convidados, informações de viagem e custos devidos pela empresa. A aplicação ao modelo proposto depende das condições contratadas. [Termos do painel](https://www.uber.com/br/pt-br/legal/uber-for-business-dashboard-terms/) · [Adendo Central](https://www.uber.com/br/pt-br/legal/uber-for-business-product-addendum---central/)

O catálogo público da API descreve estimativas, reserva, consulta, cancelamento e recibo. O guia usa `fare_id` na aceitação da tarifa antecipada, `scheduling.pickup_time` para agendamento e `return_trip_params` para solicitar retorno. Confirmar a disponibilidade local e as condições de cada trecho antes de oferecer a opção. A introdução cita tanto `guests.trips` quanto `guest.rides`. O exemplo OAuth usa `guests.trips`. Pedir confirmação escrita e testar o escopo efetivamente concedido em cada ambiente. A página do widget informa disponibilidade da API a clientes Enterprise via equipe comercial. O guia de eventos prevê reentrega, ordem variável e assinatura por HMAC-SHA256. [Guest Rides](https://developer.uber.com/docs/guest-rides/introduction) · [Autenticação](https://developer.uber.com/docs/guest-rides/guides/authentication) · [Solicitação de viagem](https://developer.uber.com/docs/guest-rides/guest-ride-api-build-guide/requesting-a-trip) · [Booking Widget e canal de acesso](https://developer.uber.com/docs/guest-rides/widgets/booking-widget) · [Webhooks](https://developer.uber.com/docs/guest-rides/guides/webhooks)

## Minuta 2 — COOPERTAX

**Assunto sugerido — Proposta corporativa para ida agendada e volta de profissionais independentes em São Paulo**

Olá, equipe comercial da COOPERTAX,

A WorkEasy estuda contratar um operador local para levar prestadores independentes a atendimentos já agendados. A opção de mobilidade é facultativa. Queremos comparar de forma separada a ida, a volta após o serviço e a continuação para outro endereço. Identificamos em seu site a possibilidade de agendamento e faturamento corporativo.

1. Podem enviar proposta para os casos anexos, com área atendida, disponibilidade por faixa horária, tarifa, validade, mínimos, pedágios, estacionamento, bagagem/equipamento, hora de espera, remarcação e eventual garantia de veículo? Informem quando o agendamento passa a estar confirmado e quanto custa um retorno reservado separadamente. Se trabalham com turno dedicado, cotem em linha própria, indicando horas ociosas e mínimas.
2. Que contrato admite como passageiro um prestador independente da empresa contratante? Quem pode pagar ao operador e qual parte emite o recibo/documento fiscal? Pedimos manifestação separada sobre ressarcimento a custo, subsídio temporário e participação paga pela cooperativa ou taxa ao pagador. Indiquem cláusulas, limites de tarifa e instrumentos necessários.
3. Quais canais corporativos e papéis individuais podemos usar para cotar, reservar, alterar ou cancelar, inclusive na ausência de quem solicitou? Há canal humano para exceções e confirmação por protocolo? Qual a responsabilidade e o custo em cancelamento, ausência das partes, veículo indisponível e corrida concluída quando o atendimento é cancelado? Podem compartilhar um exemplo fictício de extrato, recibo e ajuste por viagem?
4. Solicitamos comprovação das habilitações exigidas para o serviço ofertado, cobertura de seguro de acidentes pessoais divulgada, exclusões, procedimentos de sinistro e responsabilidade pelas cooperadas ou subcontratadas. Favor identificar dados obrigatórios, acesso, guarda e canal de incidentes. Como obter previsão de chegada para o cliente sem lhe enviar a origem do passageiro?
5. Qual é a periodicidade de faturamento e o prazo de contestação? Existe interface oficial para integração ou, no piloto, relatório exportável com referência de cada trecho, eventos e custo final? Pedimos prazos, responsável comercial e de plantão e documentos exigidos para uma eventual contratação.

Agradecemos o orçamento e os instrumentos para revisão. Nesta consulta solicitamos apenas informações e condições por escrito.

Equipe WorkEasy

A COOPERTAX anuncia agendamento, canais de solicitação, faturamento corporativo, relatórios e seguro APP. Jurídico deve conferir documentos, alcance territorial e apólice efetiva da proposta. [COOPERTAX, serviços e contato corporativo](https://www.coopertax.com.br/)

## Tratamento das respostas

Comercial arquiva a proposta datada e a versão do instrumento em acesso restrito e registra no roadmap apenas a conclusão e sua referência. Operação testa cobertura e capacidade para os mesmos pares origem–destino, incluindo retorno e plantão no horário pretendido. Financeiro compara caixa, custos por trecho, taxas e acerto final. Engenharia registra as capacidades efetivamente concedidas por ambiente. Uma resposta ambígua sobre preço, credenciais ou ressarcimento mantém a respectiva capacidade desabilitada.

Jurídico verifica obrigações de cada parte segundo a atividade efetiva, distinguindo o operador contratado, o papel proposto da WorkEasy e o regime de táxi ou transporte privado. Na hipótese de intermediar diretamente motoristas, verificar competência municipal, exigências vigentes de credenciamento, condutores, veículos e seguros. O texto consolidado de São Paulo assinala regras alteradas e declaradas inconstitucionais. Para dados pessoais, documentar finalidade, base legal, acesso mínimo, retenção e resposta a incidentes. [Lei 12.587/2012, arts. 11-A e 11-B](https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2012/lei/l12587.htm) · [Decreto municipal 56.981/2016, texto consolidado](https://legislacao.prefeitura.sp.gov.br/decreto-56981-de-10-de-maio-de-2016/consolidado) · [LGPD](https://planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)
