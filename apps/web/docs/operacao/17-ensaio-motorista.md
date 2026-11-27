# Ensaio técnico da jornada do motorista

A etapa 2 do [roadmap O17](17-paridade-funcional-de-mobilidade.md) pode ser exercitada com usuários e viagens sintéticos no projeto de simulação. Entrar em **Corridas → Área do motorista**, enviar o veículo à revisão e abrir o turno. A conta conserva os acessos de passageiro e prestador. Pausar interrompe a oferta de trabalho e mantém disponíveis os trechos assumidos.

## Oferta, reserva e substituição

A solicitação, a recusa e a mudança de disponibilidade acionam o despacho. O servidor verifica novamente a elegibilidade na atribuição. O radar aceita interesse simultâneo e a reserva se confirma no aceite exclusivo. O painel mostra repasse, distância e duração da aproximação e da viagem. O custo estimado usa os centavos por km declarados pelo motorista e considera os dois percursos. O interesse e a preferência de destino ficam privados.

A configuração `private.ride_dispatch_rules` controla tamanho e duração dos grupos de ofertas por ambiente. A migração habilita o ensaio e mantém a regra nova de produção desligada. Para operar um corredor real, Despacho deve provisionar minutos, distância em metros, referência e validade em `private.ride_approach_routes`. A revisão exata de área, veículo, agenda e autorização continua valendo. O aplicativo recebe um aviso Realtime privado para reler as ofertas. Push requer o canal nativo, dispositivo autorizado, credenciais e configuração O16. O cron `workeasy-recover-driver-offers` trata vencimento, falta de motorista e partidas de reserva atrasadas a cada minuto.

Antes da saída de uma reserva, o motorista pode devolvê-la ao despacho. Após o horário de partida, Operações confere a ocorrência, tenta contato e confirma a ausência antes de procurar suplente. Uma movimentação financeira ou um embarque anterior interrompem essa substituição. O passageiro vê apenas a previsão de embarque de seu próprio trecho. Se a busca termina sem motorista, fica disponível o plantão para reagendamento ou cancelamento.

## Navegação e terminal

Na janela de partida, o motorista atribuído vê o ponto e a instrução autorizados. Na viagem, confirma as paradas na ordem combinada. **Recalcular** usa o OSRM configurado em `OSRM_URL` e a posição indicada naquele momento. O ensaio usa um ponto fixo do grafo local. No aparelho em ambiente real, a posição exige ação e permissão do motorista. Uma medição bem-sucedida permite enviar a estimativa de chegada. A autorização do trecho é conferida novamente após a resposta do roteador. O navegador externo só aparece com a liberação por ambiente e o motorista escolhe o aplicativo que poderá receber o ponto. Após a reconexão, o painel relê a etapa no servidor. As chaves de tentativas ainda incertas duram até 24 horas e permitem a repetição idempotente da ação sem guardar o endereço.

A simulação inclui um terminal fictício. Para produção, Operações e Jurídico devem aprovar em `private.ride_airport_rules` a área exclusiva de embarque daquele terminal, a zona circular de espera, a autoridade, sua validade e a instrução de chamada. A região e o horário do corredor também precisam estar autorizados. A entrada considera a precisão do ponto e a posição exata fica fora da fila persistida. A presença vale até dez minutos e pode ser renovada. A fila chama uma pessoa elegível por vez na ordem de entrada. Ao sair e voltar, a pessoa entra no fim. Uma oferta aceita, recusada ou expirada encerra a entrada daquela chamada.

## Extrato e ensaio de campo

O painel oferece extrato diário e semanal em São Paulo, diário de distância e despesas, incentivo, saldo e contestação do trecho. A renda por hora comprometida usa a união dos intervalos de serviço e viagem. Dados faltantes e períodos de medição incompleta ficam identificados. A projeção agregada exige o mínimo de participantes definido no banco.

Antes da homologação em campo, Operações deve repetir uma chegada e um desvio em aparelhos Android e iOS, verificar a oferta com tela bloqueada, a recusa da permissão de posição, a perda de rede e o fim da coleta. Registrar atraso de entrega, diferença entre previsão e chegada, chamados ao suporte e conciliação entre diário e extrato. O aceite local tem testes de banco, UI e roteador com dados sintéticos. Homologação nativa, autorização do terminal e validação do custo e da demanda local continuam como marcos próprios. [Testes de despacho](../../supabase/tests/database/202_driver_dispatch.test.sql) · [Testes do extrato](../../supabase/tests/database/202_driver_economics.test.sql)
