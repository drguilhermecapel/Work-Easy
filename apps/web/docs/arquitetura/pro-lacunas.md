# Lacunas do plano Pro: auditoria e o que a frente E2 entregou

Estado em 23/10/2026. O WorkEasy é um protótipo: não está publicado, não tem usuários reais e **nada abaixo foi
testado contra WhatsApp, Resend ou Asaas de verdade**. O que foi exercitado: o banco local (pgTAP) e as telas com um
Supabase simulado (Vitest).

O plano Pro (R$ 49/mês, teste de 30 dias uma vez por conta; o plano grátis envia 5 propostas novas por mês) promete:
agenda completa com lembretes por WhatsApp, orçamento ou proposta em PDF ou link, cobranças por Pix ou cartão,
histórico do cliente, link de avaliação e um atalho para o emissor nacional de NFS-e.

## 1. Auditoria: o que existia

| Promessa | Antes | Onde estava | Depois desta frente |
| --- | --- | --- | --- |
| Agenda completa (horários da semana, folgas, atendimentos com cliente próprio, aceitar, iniciar, concluir, cancelar) | existe | `pages/pro/Agenda.tsx`, `services/proAgenda.ts`, RPCs `transition_booking` e `create_own_booking` | sem mudança, além do link de avaliação (linha 10) |
| Lembrete 24 h antes | parcial | gatilho `bookings_50_notify` (migração 08): enfileira quando o atendimento é aceito, mas só se o início estiver a mais de 24 h; um atendimento aceito em cima da hora não recebia nenhum | mantido; a varredura nova cobre o caso em que o gatilho não enfileirou |
| Lembrete 2 h antes | ausente | nada enfileirava | migração `20261023100000_booking_reminders.sql` e job `workeasy-booking-reminders` |
| Entrega do lembrete por WhatsApp | parcial, nunca testada | `notify-dispatch`, `_shared/notifications.ts` (modelo `lembrete_atendimento`) | sem mudança (ver seção 8) |
| Orçamento em PDF | existe | "Imprimir ou salvar em PDF" do navegador, `QuoteDocument.tsx` | sem mudança |
| Orçamento por link | existe | `/orcamento/:token`, RPC `get_quote_by_token` | sem mudança |
| Orçamento por WhatsApp | existe, só dentro do editor | `quoteWhatsAppUrl` (`wa.me` com mensagem pronta; a plataforma não envia nada) | botão agora chamado "Enviar por WhatsApp" e atalho na lista de orçamentos enviados |
| Cobrança por Pix, boleto e cartão | existe | `Cobrancas.tsx`, função `charges-create` | sem mudança, além do atalho de NFS-e e da exportação |
| Histórico do cliente | parcial: o CRM guardava contato e só contava atendimentos para o aviso de exclusão | `Clientes.tsx`, `countBookingsByClient` | "Histórico" por cliente (atendimentos e orçamentos) |
| Link de avaliação | ausente para o profissional; o formulário do cliente existe | `/atendimentos/:id`, `ReviewPanel.tsx` | "Peça uma avaliação ao cliente" no atendimento concluído e pago |
| Atalho para a NFS-e nacional | ausente | nada | link "Emitir nota fiscal (NFS-e)" em cobranças recebidas e orçamentos aceitos |
| Cota do plano grátis visível | parcial: só o limite aparecia, na tela de assinatura | `getFreeProposalsPerMonth` | "Você usou X de N propostas grátis neste mês" no painel e em Pedidos |
| Exportar dados | ausente (só o JSON da LGPD em Conta) | nada | "Exportar CSV" de cobranças e de clientes |

## 2. Lembretes de atendimento

Regras da varredura `private.enqueue_booking_reminders(p_now)`, executada pelo pg_cron a cada 15 minutos:

- **Quem**: cliente e profissional de um atendimento `accepted` ou `paid`, cada um por `private.notify`. Essa função só usa
  telefone ou e-mail confirmados pelo Auth (código de uso único) e não enfileira nada para uma conta sem contato
  confirmado. O telefone digitado no perfil, ou no cadastro de clientes do profissional, nunca recebe mensagem. Um
  atendimento com cliente próprio (`client_id` nulo) lembra só o profissional.
- **Quando**: 24 h e 2 h antes do início (durações absolutas; o Brasil não tem horário de verão desde 2019, e o despachante
  mostra o horário de São Paulo). Cada execução enfileira os lembretes cujo momento está a até 30 minutos à frente,
  agendados para o momento exato; o despachante, que roda a cada minuto, envia na hora certa. Um momento perdido por
  até 30 minutos (agendador parado) ainda é enviado, logo em seguida; um mais antigo é descartado.
- **Uma vez só**: um lembrete por destinatário, atendimento e antecedência. A chave (`params.booking_id` e
  `params.reminder_hours`) é um índice único parcial; a varredura também confere antes de inserir e roda sob um
  *advisory lock*. Os lembretes de 24 h que o gatilho já enfileirou (sem `reminder_hours`) são reconhecidos pelo horário
  (início menos 24 h) e não são duplicados.
- **Aceito depois do momento**: um atendimento aceito depois do momento de uma antecedência não recebe o lembrete dela,
  porque a confirmação enviada no aceite já informou data e hora.
- **Cancelamento**: o gatilho de cancelamento (migração 08) pula os lembretes ainda enfileirados, os da varredura
  inclusive. Um atendimento que deixou de ser `accepted`/`paid` não é selecionado.
- **Sem Vault**: a varredura só escreve na fila; não usa `pg_net` nem segredo, e roda igual no ambiente local. O envio
  continua dependendo de `private.dispatch_notifications`, que só chama a função quando o Vault tem
  `notify_dispatch_url` e `cron_secret`.
- O modelo de mensagem é o mesmo `lembrete_atendimento` para as duas antecedências (a mensagem traz data e hora, sem
  "amanhã" nem "em 2 horas"). Um modelo novo exigiria nova aprovação no WhatsApp Manager.

Testes: `supabase/tests/database/20_booking_reminders.test.sql` (34 verificações: fila uma vez e não duas, atendimentos
cancelados, solicitados, iniciados e concluídos ignorados, `paid` incluído, horário de São Paulo, contatos não
confirmados, cliente próprio, chave única, privilégios).

## 3. Cota de propostas do plano grátis

- N vem de `platform_settings.free_proposals_per_month` (`getFreeProposalsPerMonth`: vazio quando 0 ou ilegível).
- X conta as propostas do próprio profissional criadas desde as 00:00 do primeiro dia do mês em São Paulo, a mesma
  fronteira que `check_proposal` usa no banco (a contagem vale na criação, qualquer que seja o destino da proposta).
- Plano Pro: "Propostas ilimitadas no plano Pro." Sem limite ou com leitura falha, a linha some: nenhum número é inventado.
  No painel, uma leitura que falha aparece no aviso de erro de sempre.
- Quem barra de verdade é o banco (`free_proposal_limit`); a tela só explica.

## 4. Atalho para a NFS-e: fontes lidas em 23/10/2026

O app não emite nota fiscal e não envia dado nenhum ao emissor: o link só abre a ferramenta do governo.
As páginas foram lidas por uma ferramenta que resume o conteúdo; os trechos abaixo vêm desse resumo, então confira no
site antes de reaproveitar o texto em material jurídico.

- `https://www.nfse.gov.br/` responde 301 para `https://www.gov.br/nfse/` ("Portal da Nota Fiscal de Serviço
  eletrônica"). O botão "Emitir Nota Fiscal" e o item "Emissor de NFS-e WEB" (menu "MEI e demais empresas") levam a
  `https://www.nfse.gov.br/EmissorNacional`. É o endereço usado no app (`services/proNfse.ts`).
- `https://www.gov.br/pt-br/servicos/emitir-nota-fiscal-de-servico-eletronica` (serviço da Secretaria Especial da
  Receita Federal do Brasil). Quem pode emitir: "Microempreendedores Individuais (MEI) - Obrigatório para operações com
  Pessoas Jurídicas."; "Empresas (Pessoas Jurídicas) em geral, estabelecidas em municípios conveniados"; "Pessoas
  Físicas (autônomos), conforme legislação municipal." Acesso: "Realize o login com sua conta gov.br ou certificado
  digital." e "Você precisa ter uma conta nível Prata ou Ouro para acessar este serviço."
- `https://www.gov.br/empresas-e-negocios/pt-br/empreendedor/servicos-para-mei/nota-fiscal`: aberta, mas a pergunta
  "MEI é obrigado a emitir Nota Fiscal?" estava sem texto; não foi usada.
- Uma busca (fonte secundária) citou prazos de obrigatoriedade para ME e EPP do Simples Nacional em 2026. Não abri a
  fonte primária, então o app não afirma data nem obrigação nenhuma `[incerto]`.

A frase que acompanha o link: "O WorkEasy não emite nota fiscal: o atalho abre o Emissor Nacional do governo (gov.br),
usado por MEI, por empresas de municípios conveniados e, conforme a regra do município, por autônomos; confira com o
seu contador se a nota é obrigatória no seu caso."

Onde aparece: em cada cobrança com pagamento recebido, confirmado ou liberado (`Cobrancas.tsx`) e no orçamento aceito
(`Orcamentos.tsx`).

## 5. Link de avaliação

- O formulário já existe no lado do cliente: `/atendimentos/:id` (`ReviewPanel.tsx`). O banco só aceita a avaliação do
  cliente do atendimento, concluído ou liberado, de origem plataforma, com pagamento recebido, confirmado ou liberado
  pelo app (`check_review`).
- O profissional vê "Peça uma avaliação ao cliente" quando o atendimento cumpre isso **e** a política da ocupação permite
  avaliação pública (`occupation_policies.rating_ranking`). Em ocupações sem avaliação pública (por exemplo, profissões
  com regra do conselho), o app não estimula o pedido. Sem a política, sem o pagamento ou sem o atendimento da
  plataforma, nada é oferecido.
- O link só leva ao atendimento, atrás do login: o banco mostra o atendimento apenas às duas partes. A nota e o
  comentário são do cliente. O WhatsApp abre com a mensagem pronta e sem número; nada é enviado pela plataforma.

## 6. Exportação CSV

Gerada no navegador (nada é enviado), UTF-8 com marca de ordem de bytes, separador `;`, linhas CRLF, cabeçalhos em
português, datas dd/mm/aaaa e valores com vírgula decimal. Células que começam com `=`, `+`, `-`, `@`, tabulação ou
retorno de carro recebem um apóstrofo à frente (nomes vêm de terceiros). Cobranças: criação, origem, forma, valor,
situação, vencimento e taxa da plataforma. Clientes: nome, celular, e-mail, origem e data de cadastro; as anotações
privadas ficam de fora.

## 7. Contrato (para o `ARQUITETURA.md`, a cargo do orquestrador)

- **Banco** (`20261023100000_booking_reminders.sql`):
  - `private.enqueue_booking_reminders(p_now timestamptz default now()) returns int` e
    `private.booking_reminder_queued(uuid, uuid, int, timestamptz) returns boolean`, ambas `security definer` com
    `search_path` vazio e sem `EXECUTE` para os papéis da API;
  - índice único parcial `notifications_booking_reminder_once_idx` em
    `notifications (user_id, (params ->> 'booking_id'), (params ->> 'reminder_hours'))` para `lembrete_atendimento`;
  - índice parcial `bookings_reminder_scan_idx` em `bookings ((lower(period)))` para `status in ('accepted', 'paid')`;
  - job pg_cron `workeasy-booking-reminders`, `*/15 * * * *`, sem Vault;
  - `notifications.params` de `lembrete_atendimento` ganha `reminder_hours` (24 ou 2) quando vem da varredura; o do
    gatilho da migração 08 continua sem ele;
  - `04_marketplace.test.sql` agora espera três jobs `workeasy-*`.
- Nenhuma tabela, RPC pública, função Edge, modelo de mensagem nem tipo gerado (`lib/database.types.ts`) mudou.
- **Telas** (`pages/pro`, `components/pro`, `services/pro*.ts`): linha de cota em `/pro` e `/pro/pedidos`; atalho de
  NFS-e em `/pro/cobrancas` e `/pro/orcamentos`; "Enviar por WhatsApp" no editor e na lista de orçamentos; pedido de
  avaliação em `/pro/agenda`; "Histórico" e "Exportar CSV" em `/pro/clientes`; "Exportar CSV" em `/pro/cobrancas`.

## 8. Limites e o que não foi verificado

- **Entrega**: nunca rodou contra WhatsApp ou Resend. Para o WhatsApp chegar é preciso o modelo `lembrete_atendimento`
  aprovado em pt_BR com 3 variáveis, as credenciais na função e o Vault com `notify_dispatch_url` e `cron_secret`.
  Sem isso a linha fica `skipped`. Nos testes só a função foi chamada, com horários escolhidos; o disparo pelo
  pg_cron, a cada 15 minutos, não foi observado.
- **Sem janela de silêncio**: um lembrete de 2 h para um atendimento às 6h sai de madrugada. É decisão de produto, não
  tomada aqui.
- **Remarcação**: não existe hoje. Se vier, os lembretes já enfileirados guardam o horário antigo em `params.starts_at` e
  precisam ser reagendados.
- **Cota**: contada no cliente, a partir das propostas do próprio profissional. Se o dono mudar o limite no meio do mês,
  a tela mostra o limite novo.
- **Histórico**: usa as 500 reservas mais recentes que `listMyBookings` lê; mostra as 10 linhas mais recentes de cada
  cliente.
- **Interface**: testada com um Supabase simulado e no jsdom; nada foi aberto num navegador real, nem em Android, iOS ou
  desktop.
- **Pendências desta frente**: lembrete para o cliente próprio sem conta (ele não tem contato confirmado; seria um
  aviso manual do profissional); envio da cobrança (Pix e fatura) por WhatsApp, que o orçamento já tem.
