# Modelos de WhatsApp Business do WorkEasy (com o e-mail equivalente)

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| | |
|---|---|
| Documento | O05 · versão `2026-10-23` |
| Para quem | o dono do produto (registra os modelos e liga o canal) e o advogado (seções 6, 7, 10 e 12) |
| Estado do produto | protótipo mesclado em `main`, **não implantado**, sem usuários; nada aqui foi testado contra a Meta, o WhatsApp, o Asaas ou o Resend reais |
| Arquivo irmão | [`05-templates-whatsapp.json`](05-templates-whatsapp.json): corpo das requisições de criação, no formato da API da Meta |
| Empresa | [RAZÃO SOCIAL], CNPJ [CNPJ]: ainda não existe (ver `docs/DECISOES.md`) |
| Revisão | 08/11/2026, revisão independente: fontes reabertas na seção 13; correções marcadas no texto; a LGPD não pôde ser reaberta `[incerto]` |

**Como ler**

- `[PLANEJADO]` = não existe no código hoje. `[CONDICIONAL: depende de parecer]` = depende de opinião jurídica. `[incerto]` = não consegui abrir fonte primária ou as fontes se contradizem.
- Toda regra, limite e preço da Meta foi lido em **23/10/2026** e reconferido em **08/11/2026** (fontes na seção 13, com os códigos `[M1]`, `[P1]`, `[S1]`, `[L1]`). Preço só muda no 1º dia de cada trimestre (`Meta may update pricing only on the 1st day of each quarter` [M1]), mas as regras de categoria e de política mudam sem calendário. Releia as páginas antes de registrar.
- Trechos entre aspas em inglês foram reconferidos em 08/11/2026. Onde a página não trouxe a frase citada, o texto foi corrigido ou marcado `[incerto]`. A tradução e o resto são meus.
- Os exemplos de mensagem foram gerados rodando as funções reais do código (`supabase/functions/_shared/notifications.ts`, via Deno), não digitados.

---

## 1. Resumo: o que decide e o que bloqueia

| # | Achado (23/10/2026) | Efeito | O que fazer |
|---|---|---|---|
| 1 | **"Resposta dentro da janela de 24 h é grátis" já não vale sem ressalva.** A página de preços da Meta diz que desde 1º/10/2026 as mensagens de serviço só são grátis até 1.000 por mês por número, e que as de utilidade enviadas em resposta ao usuário (janela aberta) voltaram a ser cobradas [M1][M25]. O site comercial da Meta ainda diz que não cobra nos dois casos [M2]. | Todo aviso entregue pode custar. Sem forma de pagamento, a Meta deixa de entregar mensagens de serviço depois da cota. | Seguir a página de desenvolvedores (mais detalhada e datada). Cadastrar forma de pagamento. Conferir o objeto `pricing` do webhook de status nas primeiras mensagens. `[incerto]`: duas páginas da Meta se contradizem. |
| 2 | **Dois dos seis corpos do código podem não passar na análise.** `proposta_recebida` começa com variável e põe as variáveis fora de ordem (contraria duas regras escritas); `lembrete_atendimento` termina em variável seguida só de ponto final (contraria a regra se o ponto não contar) [M6][M3]. | Sem ajuste, a análise pode recusar o modelo. | Usar o corpo da seção 4 no WhatsApp. O e-mail fica como está. |
| 3 | **Não existe opt-in de WhatsApp nem opt-out.** `private.notify` manda WhatsApp para todo `auth.users.phone` confirmado. Esse número foi confirmado por código no login; o enum `consent_purpose` não tem propósito para avisos por WhatsApp; não há preferência de canal. | A Meta exige opt-in de quem vai receber [P1]; a LGPD exige revogação a qualquer momento (art. 8º, §5º) [L1] `[incerto]`. Hoje não há como parar o WhatsApp de uma pessoa sem apagar o telefone dela. | **Bloqueio de go-live.** Itens G1 a G3 da seção 11. |
| 4 | **WhatsApp só alcança quem entra por celular**, e o canal é fixo na hora de enfileirar. Não achei tela para confirmar celular em conta criada por e-mail (não há `updateUser` no app). Sem credencial do WhatsApp, a linha vira `skipped` e a pessoa fica sem aviso mesmo com e-mail confirmado. | Se o lançamento oferecer só login por e-mail, o canal WhatsApp fica sem destinatários. Se oferecer celular e o WhatsApp falhar, não há fallback. | O dossiê I02 recomenda lançar com login e avisos por e-mail e deixar celular e WhatsApp para a fase 2. Lacunas 1 e 2 (seção 11.4). |
| 5 | **A política da Meta lista bens e serviços proibidos que o catálogo toca**, e a lista de violações cita serviços veterinários, de banho e tosa e de hospedagem de animais [P1][M19]. A área `pets` tem 42 ocupações. | Risco de restrição do número, que também envia os avisos das demais ocupações. | Lista de exclusão (e-mail em vez de WhatsApp) até resposta da Meta e parecer. Seção 10. |
| 6 | **Os modelos levam nome da ocupação, data e nome da outra parte.** Nas 443 ocupações de saúde isso pode ser "dado referente à saúde" (LGPD, art. 5º, II) [L1] `[incerto]`, e a Meta diz para não usar o WhatsApp com informação de saúde quando a regulação proibir [P1]. | Possível dado sensível indo para a Meta. | `[CONDICIONAL: depende de parecer]`. Seções 10 e 12. |
| 7 | **O plano Pro (R$ 49/mês) não pode ser vendido nem renovado por WhatsApp.** A lista de violações proíbe "links to or processing of any subscription sales, renewals, or upgrades" [M19]. | Avisos de fim do teste e de cobrança do Pro ficam em e-mail e no app. | Nenhum dos seis modelos toca no Pro. Não criar modelo novo para isso. |
| 8 | **OTP por WhatsApp é possível com o Send SMS hook** (planos Free e Pro), mas não existe no código: `services/auth.ts` pede `channel: 'sms'` e a tela diz SMS [S1][S2]. | Exige função nova, segredos, modelo de autenticação e textos novos. | Seção 5. O dossiê I02 trata como fase 2. |

**Ordem sugerida:** (1) resolver G1 a G3 no código; (2) registrar os seis modelos pelo JSON; (3) conferir `status` e `category` aprovados; (4) testar com 2 ou 3 pessoas que deram opt-in; (5) só então gravar `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.

---

## 2. O que o código faz hoje (conferido em 23/10/2026)

Fontes lidas: `_shared/notifications.ts`, `_shared/notification-context.ts`, `notify-dispatch/handler.ts`, migrações `20261019000008_notifications.sql` e `20261019000009_care.sql`, `docs/ARQUITETURA.md`.

### 2.1 Os seis tipos

Só existem estes seis; a migração 08 limita `notifications.template` a esta lista com `check`.

| # | Nome (= nome do modelo) | Quem recebe | Quando é enfileirado | Variáveis, na ordem do código |
|---|---|---|---|---|
| 1 | `proposta_recebida` | cliente | `INSERT` em `proposals` (gatilho `proposals_notify`) | `provider_name`, `occupation_name`, `price_cents` |
| 2 | `atendimento_confirmado` | cliente **e** profissional | `bookings` passa a `accepted` (`bookings_50_notify`) | `occupation_name`, `starts_at`, `other_party_name` |
| 3 | `lembrete_atendimento` | cliente **e** profissional | no mesmo evento, agendado para 24 h antes do início, só se faltar mais de 24 h; vira `skipped` se o atendimento for cancelado | as mesmas de `atendimento_confirmado` |
| 4 | `pagamento_recebido` | profissional | `payments` passa a `received` ou `confirmed` (uma vez por pagamento) | `amount_cents`, `client_name` |
| 5 | `orcamento_respondido` | profissional | `quotes` passa a `accepted` ou `declined` | `quote_title`, `response` |
| 6 | `plantao_oferecido` | cuidador | `shift_offers` com status `offered` (`shift_offers_notify`, migração 09) | `starts_at`, `neighborhood_name` |

Um atendimento aceito gera até **4** mensagens (2 confirmações + 2 lembretes).

### 2.2 De onde vem cada variável

| Chave | Origem | Formato final |
|---|---|---|
| `provider_name` | `providers.display_name`, gravado pelo gatilho em `params` | texto |
| `occupation_name` | consulta da função: `occupations.name` pelo `occupation_slug` do pedido (`requests`) ou do atendimento (`bookings`) | texto |
| `price_cents` | `proposals.price_cents` em `params` | `R$ 1.234,56` (`formatBRL`, espaço simples) |
| `starts_at` | `lower(period)` do atendimento ou do plantão, em `params` | `dd/mm/aaaa às HH:MM`, fuso `America/Sao_Paulo` |
| `other_party_name` | consulta: se o destinatário é o profissional, nome do cliente (`profiles.full_name` ou `provider_clients.name`); se é o cliente, `params.provider_name` ou `providers.display_name` | texto |
| `amount_cents` | `payments.amount_cents` em `params` | `R$ 350,00` |
| `client_name` | consulta: `profiles.full_name` de quem pagou; senão `quotes.client_name`; senão `provider_clients.name` do atendimento | texto |
| `quote_title` | `quotes.title` (apelido `title` em `params`); **texto livre digitado pelo profissional** | texto |
| `response` | `quotes.status` (apelido `status`) | `aceito` ou `recusado` |
| `neighborhood_name` | consulta: plantão, casa, bairro (`neighborhoods.name`) | texto |

Os valores de texto passam por `formatParam`: máximo de 300 caracteres, quebras de linha e tabulações viram espaço, 4 ou mais espaços viram 3. O comentário do código atribui isso a uma regra da Meta; não achei essa regra nas páginas que li (a página de erros só traz o 132018, "There's an issue with the parameters in your template") `[incerto]`.

### 2.3 Como a mensagem sai

- **Canal.** `private.notify` escolhe **um** canal: WhatsApp se `auth.users.phone` está confirmado (`phone_confirmed_at`); senão e-mail se `auth.users.email` está confirmado; senão nada. `profiles.phone` (digitado) nunca é destino. Não há fallback entre canais.
- **WhatsApp.** `POST https://graph.facebook.com/v26.0/{WHATSAPP_PHONE_NUMBER_ID}/messages`, `type: "template"`, `language.code: "pt_BR"`, só o componente `body`, parâmetros `text` **posicionais** (sem `parameter_name`), na ordem de `params`. Destino: `55` + DDD + número, só dígitos, **sem `+`**. Versão da Graph API: `v26.0`, ou o valor de `WHATSAPP_GRAPH_VERSION`.
- **O `+` importa.** A Meta diz: "We highly recommend that you include both the plus sign and country calling code when sending a message to a customer. If the plus sign is omitted, your business phone number's country calling code is prepended to the customer's phone number." e que isso "can result in undelivered or misdelivered messages"; para Brasil e México, "the extra added prefix of the phone number may be modified by the Cloud API" [M16]. Não sei o que acontece com `55...` quando o número da empresa também é +55 `[incerto]`: teste com e sem `+` no primeiro envio (dossiê I02, passo 26) e, se precisar, o ajuste fica em `normalizePhoneBR`.
- **E-mail (Resend).** Assunto = campo `subject`. Texto = corpo + linha em branco + `SITE_URL` + linha em branco + `Você recebe esta mensagem porque tem uma conta no WorkEasy.` HTML = `<p>corpo</p>`, `<p><a href="SITE_URL">Abrir o WorkEasy</a></p>` e o rodapé em `<p>` pequeno. Tag `template`. Chave `Idempotency-Key: notification-<id>`.
- **Resultado.** Sem credencial: `skipped`. Erro de rede, 429 ou 5xx: volta para a fila (esperas de 1, 4, 9 e 16 minutos; 5 tentativas). Qualquer outro 4xx: `failed`, sem nova tentativa. O código grava só `http_<status>: <mensagem da Meta>` (200 caracteres), **não** o `error.code`.
- **"Enviado" não é "entregue".** A resposta da API só indica que a requisição foi aceita: `This response only indicates that the API successfully accepted your request` [M16]. O código não tem webhook de status.

### 2.4 O que isso exige dos modelos

1. Formato **POSITIONAL** (o padrão da Meta quando nada é dito [M3]); variáveis nomeadas não funcionam, porque o código não envia `parameter_name`.
2. **Mesmo número de variáveis** do código, na mesma ordem. Número diferente dá o erro 132000 [M20].
3. Variável só no **corpo**: o código não monta componentes de cabeçalho nem de botão. Rodapé e botões **estáticos** são livres (o exemplo oficial de utilidade com botões de URL, telefone e resposta rápida envia só os componentes de cabeçalho de mídia e de corpo [M7, não reaberto `[incerto]`]).
4. Texto sem promessa de prazo: nada de "em X minutos" ou "agora". A Meta não garante ordem nem prazo de entrega (`the order in which messages are delivered is not guaranteed to match the order of your API requests` [M3]).

---

## 3. Regras da Meta que moldam os modelos (lidas em 23/10/2026)

| Tema | Regra (trecho literal) | Efeito aqui | Fonte |
|---|---|---|---|
| Categorias | "Each template must be categorized as authentication, marketing, or utility." | três categorias; mudam preço e revisão | [M3] |
| Utilidade | "Must be non-promotional, not containing any promotional or persuasive intent." **e** "specific to or requested by the user" **ou** "essential or critical to the user" | critério da seção 4 | [M4] |
| Utilidade não vende | "These messages should not promote, recommend, upsell, or cross-sell products; include offers; or attempt to secure renewals." | nenhum aviso oferece Pro, desconto ou indicação | [M4] |
| Conteúdo misto | "Templates with mixed content (for example, both utility and marketing, such as an order update with a promo ..." são marketing | idem | [M4] |
| Marketing | "Marketing templates are the most flexible." Retargeting, incluindo renovar assinatura, "These are marketing even if requested by users." | novidades e ofertas serão marketing (seção 9) | [M4] |
| Reclassificação | "the template is approved as MARKETING" quando você escolhe UTILITY e a Meta discorda (desde 9/4/2025); aviso de 1 dia, ou nenhum para quem já foi advertido; "You have 60 days to review and appeal these changes in Business Support Home." | conferir `category` depois da análise (4.8) | [M4] |
| Categoria errada repetida | "If a business is detected to be consistently misclassifying marketing templates as utility, WhatsApp may apply escalating restrictions." | não recriar o mesmo texto com outro nome para "ganhar" utilidade | [M4] |
| Autenticação | "you must use an authentication template" (M8) para enviar código de uso único. A frase "Only authentication templates can be used to send a one-time passcode..." não apareceu nas páginas reabertas. Sem URL, mídia nem emoji e limite de 15 caracteres: não confirmados `[incerto]`; validade do código de 1 a 90 min (M8) | seção 5 | [M8][M9] |
| Variáveis posicionais | "Example values in template creation payloads and real values in template send payloads must appear in the order in which their corresponding placeholders appear in the component text string." | `{{1}}`, `{{2}}`... em ordem no texto | [M3] |
| Revisão do texto | "The message template cannot start or end with a parameter (dangling parameters are not allowed)." Variáveis não sequenciais e "too many variable parameters relative to the message length" também reprovam; amostra é obrigatória | corpos da seção 4 | [M6] |
| Limites de componente | corpo até 1.024 caracteres; rodapé até 60; cabeçalho de texto até 60 e 1 variável; até 10 botões; botão de URL aceita 1 variável, no fim | rodapé estático | [M5] |
| Prazo de análise | "It can take up to 24 hours for an approval decision to be made." Editar um modelo aprovado o devolve para análise | sem prazo garantido | [M6][M13] |
| Duplicado | "If a template is submitted with the same wording in the body and footer of an existing template, the duplicate template will be rejected." | corpos distintos | [M6] |
| Validade (TTL) | "The system drops messages that cannot be delivered within the default or customized TTL." Utilidade: padrão de 30 dias, ajustável de 30 s a 12 h. Autenticação: padrão de 10 min, ajustável de 30 s a 15 min | 43.200 s nos seis; evita lembrete que chega depois do atendimento | [M11] |
| Qualidade do modelo | `GREEN`, `YELLOW`, `RED`, `UNKNOWN`. `RED` pausa o modelo: 3 h na 1ª vez, 6 h na 2ª, desativado na 3ª. Depois de uma pausa de utilidade, modelos novos ou sem `GREEN` ficam sujeitos a "pacing" (envio retido para avaliação) por 7 dias | rotina semanal (11.2) | [M12][M13][M14] |
| Limite de envio | "Newly created business portfolios have a messaging limit of 250" contatos únicos por 24 h fora da janela; sobe para 2.000 com verificação do negócio ou com 2.000 entregas de modelos de alta qualidade em 30 dias | o MVP cabe nos 250 | [M15] |
| Limite de modelos | 250 por conta com portfólio sem verificação; até 6.000 com verificação. Modelos parados por 12 meses são arquivados | `plantao_oferecido` pode ficar parado | [M3] |
| Idioma | `pt_BR` consta da lista de idiomas | ok | [M24] |
| Opt-in | seção 6 | | [M17][P1] |

---

## 4. Modelos de utilidade prontos para registrar

**Quadro-resumo**

| # | Nome | Categoria pedida | Destinatário | Variáveis | Corpo no WhatsApp |
|---|---|---|---|---|---|
| 4.1 | `proposta_recebida` | UTILITY | cliente | 3 | **diferente** do código (o do código começa com variável e está fora de ordem) |
| 4.2 | `atendimento_confirmado` | UTILITY | cliente e profissional | 3 | igual ao código |
| 4.3 | `lembrete_atendimento` | UTILITY | cliente e profissional | 3 | **diferente** (o do código termina em variável) |
| 4.4 | `pagamento_recebido` | UTILITY | profissional | 2 | igual ao código |
| 4.5 | `orcamento_respondido` | UTILITY | profissional | 2 | com frase final acrescentada |
| 4.6 | `plantao_oferecido` | UTILITY, com risco alto de virar MARKETING | cuidador | 2 | igual ao código |

Valores comuns a todos: idioma `pt_BR`; formato `POSITIONAL`; sem cabeçalho; sem botões; rodapé `Aviso automático do WorkEasy` (28 caracteres, estático, não promete canal de resposta); validade `message_send_ttl_seconds: 43200`.

### 4.0 Como registrar

**Pelo WhatsApp Manager** (a documentação da Meta descreve: Account tools, ícone de maleta, Message templates; o rótulo em português pode variar): criar modelo, escolher categoria e idioma Português (BR), digitar nome e corpo, **adicionar amostra** das variáveis, enviar. Não conferi se o painel oferece rodapé e validade (TTL); a página de validade só descreve a API [M11].

**Pela API**, usando o JSON deste diretório. Não executado: ainda não existe conta do WhatsApp Business. Token e ID ficam no seu terminal, nunca no repositório nem em `VITE_*`.

```bash
export WABA_ID=...                # ID da conta do WhatsApp Business
export META_ADMIN_TOKEN=...       # token com permissão de gerenciar modelos (ver dossiê I02)
# rode a partir de apps/web
jq -c '.templates[] | select(.category == "UTILITY")' docs/operacao/05-templates-whatsapp.json |
while read -r t; do
  curl -sS -X POST "https://graph.facebook.com/v26.0/$WABA_ID/message_templates" \
    -H "Authorization: Bearer $META_ADMIN_TOKEN" -H "Content-Type: application/json" -d "$t"
  echo
done
# resposta esperada por modelo: {"id": "...", "status": "PENDING", "category": "UTILITY"}
```

**Depois da análise**, conferir estado e categoria (campos `status`, `category`, `correct_category` e `quality_score` constam da API de modelos [M4][M12][M23]):

```bash
curl -sS -G "https://graph.facebook.com/v26.0/$WABA_ID/message_templates" \
  --data-urlencode "fields=name,status,category,correct_category,quality_score" \
  -H "Authorization: Bearer $META_ADMIN_TOKEN"
```

Esperado: `status` = `APPROVED`, `category` = `UTILITY`, `correct_category` vazio.

### 4.1 `proposta_recebida`

| Campo | Valor |
|---|---|
| Categoria | **UTILITY** |
| Corpo | `Olá! {{1}} enviou uma proposta para o seu pedido de {{2}}, no valor de {{3}}. Abra o WorkEasy para ver e responder.` |
| Aparece assim | Olá! Ana Ferreira enviou uma proposta para o seu pedido de Eletricista, no valor de R$ 150,00. Abra o WorkEasy para ver e responder. |
| E-mail, assunto | `Você recebeu uma proposta` |
| E-mail, corpo | `Ana Ferreira enviou uma proposta de R$ 150,00 para o seu pedido de Eletricista. Abra o WorkEasy para ver e responder.` |

| Variável | Chave no código | Exemplo para a Meta |
|---|---|---|
| `{{1}}` | `provider_name` | Ana Ferreira |
| `{{2}}` | `occupation_name` | Eletricista |
| `{{3}}` | `price_cents` | R$ 150,00 |

**Por que utilidade.** É a notícia de que alguém respondeu ao pedido que a própria pessoa criou, com dados dele (quem, serviço, valor). Não tem oferta nossa. Encaixa no grupo "Order Management" [M4]; a frase de exemplo "Confirm, update, or cancel an order..." não foi reconfirmada nesta revisão `[incerto]`. **Risco:** "proposta" com preço pode ser lida como comercial; se a Meta aprovar como MARKETING, ver 4.8.

**Por que o corpo difere do código.** O texto do código (`{provider_name} enviou uma proposta de {price_cents} para o seu pedido de {occupation_name}...`) abre com variável e traz as variáveis na ordem 1, 3, 2: a Meta reprova as duas coisas [M6][M3]. A ordem dos **valores** enviados não muda (`provider_name`, `occupation_name`, `price_cents`).

### 4.2 `atendimento_confirmado`

| Campo | Valor |
|---|---|
| Categoria | **UTILITY** |
| Corpo | `O atendimento de {{1}} em {{2}} com {{3}} foi confirmado. Os detalhes estão no WorkEasy.` |
| Aparece assim | O atendimento de Eletricista em 28/10/2026 às 14:30 com Carlos Lima foi confirmado. Os detalhes estão no WorkEasy. |
| E-mail, assunto | `Atendimento confirmado` |
| E-mail, corpo | igual ao WhatsApp |

| Variável | Chave no código | Exemplo para a Meta |
|---|---|---|
| `{{1}}` | `occupation_name` | Eletricista |
| `{{2}}` | `starts_at` | 28/10/2026 às 14:30 |
| `{{3}}` | `other_party_name` | Carlos Lima |

**Por que utilidade.** Confirmação de transação com detalhes específicos: é o objetivo "Order Management" da Meta [M4]. Para o cliente, `{{3}}` é o profissional; para o profissional, é o cliente.

### 4.3 `lembrete_atendimento`

| Campo | Valor |
|---|---|
| Categoria | **UTILITY** |
| Corpo | `Lembrete: atendimento de {{1}} em {{2}} com {{3}}. Os detalhes estão no WorkEasy.` |
| Aparece assim | Lembrete: atendimento de Eletricista em 28/10/2026 às 14:30 com Carlos Lima. Os detalhes estão no WorkEasy. |
| E-mail, assunto | `Lembrete de atendimento` |
| E-mail, corpo | `Lembrete: atendimento de Eletricista em 28/10/2026 às 14:30 com Carlos Lima.` |

| Variável | Chave no código | Exemplo para a Meta |
|---|---|---|
| `{{1}}` | `occupation_name` | Eletricista |
| `{{2}}` | `starts_at` | 28/10/2026 às 14:30 |
| `{{3}}` | `other_party_name` | Carlos Lima |

**Por que utilidade.** Objetivo "Account Alerts": "Send important or time-sensitive updates or alerts" (a frase completa sobre produtos comprados não foi reconfirmada `[incerto]`). O exemplo oficial da Meta é um lembrete de cobrança mensal ("Reminder: Your monthly payment for ... will be billed on ...") [M4]. Não acrescente texto de venda ("indique", "aproveite").

**Por que o corpo difere do código.** O do código termina em `{other_party_name}.`; a Meta proíbe terminar com variável [M6] e não diz se um ponto final depois dela basta (`[incerto]`). A frase final elimina a dúvida.

**Validade.** A Meta descarta o que não entregar em 12 h (`43200`), então o lembrete não chega depois do atendimento. Sem webhook de status, o WorkEasy não fica sabendo dessa perda.

### 4.4 `pagamento_recebido`

| Campo | Valor |
|---|---|
| Categoria | **UTILITY** |
| Corpo | `O pagamento de {{1}} de {{2}} foi recebido pelo Asaas. Os detalhes estão no WorkEasy.` |
| Aparece assim | O pagamento de R$ 350,00 de Carlos Lima foi recebido pelo Asaas. Os detalhes estão no WorkEasy. |
| E-mail, assunto | `Pagamento recebido` |
| E-mail, corpo | igual ao WhatsApp |

| Variável | Chave no código | Exemplo para a Meta |
|---|---|---|
| `{{1}}` | `amount_cents` | R$ 350,00 |
| `{{2}}` | `client_name` | Carlos Lima |

**Por que utilidade.** Confirmação de transação do próprio destinatário (valor e pagador): "Order Management" [M4]. **Cuidado com o texto:** o gatilho dispara em `received` **e** em `confirmed`, e o texto diz "recebido pelo Asaas" nos dois. Se `confirmed` significar apenas confirmação (por exemplo, de cartão), sem saldo disponível, o texto afirma mais do que se sabe. Não conferi o significado dos status na documentação do Asaas (dossiê I01) `[incerto]`.

### 4.5 `orcamento_respondido`

| Campo | Valor |
|---|---|
| Categoria | **UTILITY** |
| Corpo | `O orçamento "{{1}}" foi {{2}} pelo cliente. Os detalhes estão no WorkEasy.` |
| Aparece assim | O orçamento "Troca da fiação da cozinha" foi aceito pelo cliente. Os detalhes estão no WorkEasy. |
| E-mail, assunto | `Orçamento respondido` |
| E-mail, corpo | `O orçamento "Troca da fiação da cozinha" foi aceito pelo cliente.` |

| Variável | Chave no código | Exemplo para a Meta |
|---|---|---|
| `{{1}}` | `quote_title` (apelido de `title`) | Troca da fiação da cozinha |
| `{{2}}` | `response` (apelido de `status`) | aceito |

**Por que utilidade.** Atualização sobre um orçamento enviado pelo próprio destinatário. **Por que a frase final:** o texto do código tem 2 variáveis em cerca de 33 caracteres fixos; a Meta reprova "too many variable parameters relative to the message length" [M6] e não vi o limite publicado nas páginas que li. A frase final sobe os fixos para 64 sem mudar o sentido. `quote_title` é texto livre do profissional e vai para a Meta (seção 12).

### 4.6 `plantao_oferecido`

| Campo | Valor |
|---|---|
| Categoria | **UTILITY**, com risco alto de ser aprovada como MARKETING |
| Corpo | `Há um plantão oferecido para você em {{1}}, em {{2}}. Abra o WorkEasy para aceitar ou recusar.` |
| Aparece assim | Há um plantão oferecido para você em 30/10/2026 às 07:00, em Vila Mariana. Abra o WorkEasy para aceitar ou recusar. |
| E-mail, assunto | `Plantão oferecido` |
| E-mail, corpo | igual ao WhatsApp |

| Variável | Chave no código | Exemplo para a Meta |
|---|---|---|
| `{{1}}` | `starts_at` | 30/10/2026 às 07:00 |
| `{{2}}` | `neighborhood_name` | Vila Mariana |

**Por que utilidade, e por que o risco.** A oferta é individual, ligada ao cadastro do cuidador, sem desconto nem propaganda. Mas a Meta trata como marketing (retargeting) mensagens que recomendam ou oferecem algo: o exemplo "We found a {{car}} that meets your saved search. Log in to our app to view." está nessa lista, que diz "These are marketing even if requested by users." [M4]. Uma oferta de trabalho se parece mais com isso do que com a atualização de um pedido. Outro ponto: a política de comércio da Meta diz "Commerce content may not promote job opportunities" [P2]; ela fala de conteúdo de comércio (anúncios de produtos), então `[incerto]` se alcança um aviso de plantão. Registrar como UTILITY, aceitar o resultado e seguir 4.8.

### 4.7 Cabeçalho, rodapé e botões

| Item | Decisão | Motivo |
|---|---|---|
| Cabeçalho | nenhum | o código não envia parâmetros de cabeçalho |
| Rodapé | `Aviso automático do WorkEasy` | não promete resposta nem opt-out que não existem. Trocar por "Para parar de receber, responda SAIR" **só depois** de existir o webhook de entrada (seção 7); trocar o rodapé de um modelo em uso o devolve para análise [M13] |
| Botão de link estático | opcional, `Abrir o WorkEasy` (16 caracteres; limite de 25) | não exige mudança no código (botão estático não pede componente no envio [M7]). Exige o domínio final: `[DOMÍNIO DO WORKEASY]` |
| Botão de resposta rápida "Parar de receber avisos" (23 caracteres) | **só com o webhook de entrada** `[PLANEJADO]` | tocar no botão gera uma mensagem de entrada que alguém precisa tratar. Resposta rápida junto com outro tipo de botão não abre no WhatsApp para computador [M5, não reconfirmado `[incerto]`] |

Os dois componentes opcionais estão em `optional_components` no JSON.

### 4.8 Se a Meta aprovar como MARKETING

1. Veja `category` e `correct_category` (comando de 4.0). Mudança de UTILITY para MARKETING mantém o modelo `APPROVED`. A validade de 43.200 s (12 h) continua dentro da faixa de marketing, de 12 h a 30 dias [M11]; se a Meta a zera nesse caso, não está nas páginas reabertas `[incerto]`.
2. A cobrança passa à tarifa de marketing do Brasil (valor `[incerto]`, seção 9) e passam a valer limites por usuário para marketing [M20]; o erro 131049, "This message was not delivered to maintain healthy ecosystem engagement", remete a esses limites [M20].
3. Opções: aceitar; reescrever sem nenhum convite e pedir revisão de categoria (prazo de 60 dias, pelo WhatsApp Manager, em Business Support Home) [M4]; ou mover essa mensagem para e-mail e app.
4. **Não** recriar o mesmo texto com outro nome para tentar utilidade (ver "Categoria errada repetida", seção 3).

---

## 5. Código de acesso (OTP) por WhatsApp `[PLANEJADO]`

**Situação hoje.** O login por celular pede `channel: 'sms'` (`services/auth.ts`); `Entrar.tsx` fala em SMS; o README do app diz que o envio por WhatsApp não é oferecido. Nada abaixo existe no código. A escolha entre SMS, WhatsApp e e-mail é do dossiê **I02** (`docs/pesquisa/whatsapp-e-email.md`): ele recomenda e-mail no lançamento e o código por WhatsApp, pelo hook Send SMS, na fase 2 (a função que ele chama de `auth-send-sms`, o passo a passo dos segredos e do painel Meta e os limites de abuso estão lá). Aqui ficam o modelo, o contrato do hook e as regras da Meta.

### 5.1 Modelo `codigo_de_verificacao`

| Campo | Valor |
|---|---|
| Categoria | **AUTHENTICATION** (a única que pode levar OTP [M4][M8]) |
| Idioma | `pt_BR` (consta da lista [M24]) |
| Corpo | texto **fixo e gerado pela Meta** (em inglês: "`<VERIFICATION_CODE>` is your verification code."); a tradução em pt_BR não pode ser editada. Opção `add_security_recommendation: true` acrescenta a frase "For your security, do not share this code." traduzida [M8] |
| Rodapé | `code_expiration_minutes` (1 a 90) acrescenta "This code expires in <NUM_MINUTES> minutes." traduzida [M8] |
| Botão | tipo `otp`, com `otp_type` `copy_code` (grafia do exemplo de [M9]), texto de até 25 caracteres (`Copiar código`) [M9]. A Meta pode gravar o tipo como `URL` ao criar: conferir na análise |
| Validade da mensagem | `message_send_ttl_seconds` de 30 a 900 s; padrão de 10 min [M11]; no JSON, 600 |
| Restrições | sem URL, mídia nem emoji, e limite de 15 caracteres: não encontrados em [M8] nem [M9] `[incerto]` |
| Entrega | só no aparelho principal da pessoa; nos aparelhos vinculados aparece mascarado [M8] |

**Antes de registrar:** veja a prévia exata em pt_BR com `GET /{WABA_ID}/message_template_previews?category=AUTHENTICATION&language=pt_BR&add_security_recommendation=true&code_expiration_minutes=10&button_types=OTP` [M8]. Não executei. O JSON usa 10 minutos; **iguale ao prazo real do código no Supabase**. A página de login por celular do Supabase diz que o código expira em 1 hora e, em outro trecho da mesma página, que a pessoa precisa confirmar o código "within 60 seconds" [S3]. Não confirmei se o painel permite reduzir `[incerto]`. Se não permitir, use 60 minutos no modelo (o máximo da Meta é 90) e a mesma validade no JSON antes de enviar.

### 5.2 Como o Supabase envia por WhatsApp

O suporte nativo existe só para quem usa Twilio ou Twilio Verify: "At this time, WhatsApp is only supported as a channel for the Twilio and Twilio Verify Providers" [S3]. Para falar direto com a Cloud API da Meta, o caminho é o **Send SMS hook**, que "replaces Supabase's built-in SMS sending" e serve para "Use alternate messaging channels such as WhatsApp" [S1]. Disponível nos planos Free e Pro [S2].

| Passo | Contrato (fonte [S1][S2]) |
|---|---|
| 1. Ativar o hook | Painel do Supabase, Authentication, Hooks. No ambiente local: `[auth.hook.send_sms]` com `enabled = true`, `uri = "http://host.docker.internal:54321/functions/v1/auth-send-sms"` (nome sugerido no dossiê I02), `secrets = "env(SEND_SMS_HOOK_SECRETS)"` |
| 2. Função nova `[PLANEJADO]` | Edge Function que recebe `POST` com `user` (inclui `phone`) e `sms.otp` (6 dígitos). Sem outros campos: **o canal escolhido pelo app não vem no payload**, então o hook decide por todos os logins por celular |
| 3. Autenticidade | Padrão Standard Webhooks: cabeçalhos `webhook-id`, `webhook-timestamp` e `webhook-signature`; segredo no formato `v1,whsec_<base64>` em `SEND_SMS_HOOK_SECRETS`. Deploy com `--no-verify-jwt`, porque o hook roda antes de existir JWT `[incerto: não verificado]`. Limite de 20 KB no payload |
| 4. Telefone | Normalizar com `normalizePhoneBR` (o exemplo da documentação mostra `+` no JSON e `+${...}` no código; não dependa do formato) `[incerto]`. O dossiê I02 (passo 7) usa `to` com `+` no modelo de autenticação; os exemplos do JSON deste documento não usam. Decidir antes do G7 |
| 5. Envio | `POST /{PHONE_NUMBER_ID}/messages`, modelo `codigo_de_verificacao`, com o código **duas vezes**: no corpo e no botão `sub_type: "url"`, `index: "0"` [M9]. Exemplo pronto em `send_examples.codigo_de_verificacao` no JSON |
| 6. Resposta | Sucesso: corpo vazio com status 200 ("An empty response with a status code of 200 is taken as a successful response") `[incerto: não reaberto]`. Erro: status 400 ou mais com JSON `error`. `429` ou `503` com `retry-after` repete até 3 vezes |
| 7. Tempo | "We have a time budget of 5s for the entire webhook invocation, including retry requests": o `fetch` ao Graph precisa de limite bem menor que 5 s (o dossiê I02 sugere 3,5 s) |

**Regras da Meta que valem aqui [M8][M10]:** (a) quem oferece código por WhatsApp "must use an authentication template"; (b) a Meta recomenda oferecer "a choice of authentication channels (such as WhatsApp, email, and SMS)" e deixar a pessoa confirmar o número do WhatsApp, porque "WhatsApp does not enforce ownership of the phone number past initial registration"; (c) recomendação nossa, não da Meta (M10 não diz isso): deixar claro na tela que o código vai por WhatsApp. No WorkEasy isso significa rotular a opção como "Celular (código por WhatsApp)" e manter o e-mail para quem não tem WhatsApp.

**Pontos abertos:** o hook não tem fallback automático para SMS, a menos que a função o implemente (o uso "Fall back to another provider if your primary one fails" consta de [S1]); a página [M9] diz "you must first initiate a handshake between your app and the WhatsApp client" e remete a uma seção Handshake, cujos passos não foram reabertos `[incerto]`: teste com um número real; abuso e custo por pedido (limites do Supabase, captcha) ficam no dossiê I02.

---

## 6. Opt-in: o que coletar antes de enviar

### 6.1 O que a Meta exige

- "Businesses are required to obtain opt-in before messaging people on WhatsApp." [M17]
- Só se pode contatar quem deu o número **e** "you have received opt-in permission from the recipient confirming that they wish to receive subsequent messages or calls from you" [P1].
- O opt-in "can be general and not specifically for WhatsApp, as long as businesses comply with all local laws" [M17]. Requisitos: dizer claramente que a pessoa aceita receber mensagens, **dizer o nome da empresa** e cumprir a lei local [M17].
- Boa prática: opt-in separado por categoria de mensagem ("Obtaining separate opt-in by specific message category") e instrução clara de saída [M17][P1].

### 6.2 O que o WorkEasy tem hoje

- Login por celular confirma o número por código. Isso prova posse do número, não consentimento para avisos por WhatsApp.
- A caixa de aceite de Termos e Política (`Entrar.tsx`) não diz que a pessoa aceita receber mensagens. O rascunho dos Termos (documento L01, `docs/juridico/01-termos-de-uso.md`, item 13.2) diz que os avisos sobre pedidos, propostas, atendimentos e pagamentos vão "por e-mail ou WhatsApp" ao contato confirmado no login. O advogado pode entender que isso, aceito junto com os Termos, basta como opt-in geral: a Meta aceita opt-in "general" se disser com clareza que a pessoa aceita receber mensagens e citar o nome da empresa `[CONDICIONAL: depende de parecer]`. O texto A abaixo é a alternativa mais segura (opt-in separado e específico).
- A tabela `consents` aceita `terms`, `privacy`, `marketing`, `background_check` e `location`. `marketing` é só para "novidades e ofertas" e a tela diz "Mensagens sobre seus pedidos não dependem disto".

### 6.3 Textos prontos (pt-BR)

Alinhar com o documento L11 (`docs/juridico/11-textos-de-consentimento-e-avisos.md`) quando existir.

**Texto A: avisos por WhatsApp** (caixa **não marcada por padrão**, separada do aceite de Termos, na tela de cadastro por celular e em Conta):

> Quero receber avisos do WorkEasy por WhatsApp, no número que informei, sobre os meus pedidos, propostas, atendimentos e pagamentos. Posso parar quando quiser em Conta, na seção Consentimentos.

Texto de apoio, logo abaixo (informação do art. 9º da LGPD [L1]):

> O WorkEasy ([RAZÃO SOCIAL], CNPJ [CNPJ]) envia esses avisos pela plataforma WhatsApp Business, da Meta, que recebe seu número e o texto do aviso para entregá-lo. Os avisos não trazem propaganda. Veja a Política de Privacidade. Contato do encarregado: [E-MAIL DO ENCARREGADO].

Só publique o texto A quando o interruptor em Conta existir (portão G2); ele promete esse caminho. Depois que o webhook de entrada existir, acrescentar ao texto A: "ou respondendo SAIR a qualquer aviso".

**Texto B: código de acesso por WhatsApp** (junto da opção "Celular", antes de enviar o código):

> Vamos enviar o código de 6 dígitos para o WhatsApp do número informado. Confira se ele tem WhatsApp. Se não tiver, entre com o e-mail.

Este texto não vale como texto A: pedir o código não ativa os avisos.

**Texto C: novidades e ofertas.** Já existe o propósito `marketing` (revogável) em Conta. Continua separado e só vale para modelos de marketing, que ainda não existem. **Atenção:** o L11 (linha 106) propõe "Quero receber novidades e ofertas do WorkEasy por WhatsApp ou e-mail.", o que mistura o canal WhatsApp ao propósito `marketing`. Alinhar com o L11 antes de publicar; até lá, o Texto C não vale para WhatsApp.

**Texto D: confirmação de ativação** (modelo `avisos_ativados`, `[PLANEJADO]`; a própria Meta dá "Thanks for confirming opt-in! You'll now receive notifications via WhatsApp." como exemplo de utilidade, objetivo "Opt-In Management on WhatsApp" [M4]):

> Olá! Você ativou os avisos do WorkEasy por WhatsApp neste número, sobre pedidos, propostas, atendimentos e pagamentos. Para parar de receber, responda SAIR.

Só existe no JSON em `planned_templates`: exige novo nome na lista do código e na restrição `check` da migração (nova migração, nunca editar a 08), e o webhook de entrada que trata "SAIR".

### 6.4 O que gravar `[PLANEJADO]`

Hoje não existe onde gravar. Mínimo para provar o consentimento (a LGPD põe o ônus no controlador: art. 8º, §2º [L1] `[incerto]`):

| Dado | Onde |
|---|---|
| quem, propósito, versão do texto, aceitou ou revogou, horário do servidor | tabela `consents`, com **novo valor** no enum `consent_purpose` (por exemplo `whatsapp_notifications`) e nova entrada em `CONSENT_VERSIONS` (`config/legal.ts`) |
| o número que recebeu o aviso naquele momento | ainda sem coluna; `auth.users.phone` muda |
| o texto exato exibido | pela versão: o texto A fica versionado no repositório |

**Número novo = opt-in novo.** Se `auth.users.phone` mudar, o consentimento anterior não vale para o número novo, que pode ser de outra pessoa (a Meta alerta que números são reciclados [M10]).

---

## 7. Opt-out: como parar e quem trata

### 7.1 Regras

- Meta: "You must respect all requests (either on or off WhatsApp) by a person to block, discontinue, or otherwise opt out of communications from you via WhatsApp" [P1]. Boa prática: "Provide clear instructions for how people can opt out ... and honor these requests" [M17].
- LGPD: o consentimento "pode ser revogado a qualquer momento mediante manifestação expressa do titular, por procedimento gratuito e facilitado" (art. 8º, §5º; art. 18, IX) [L1] `[incerto: não reaberto]`.
- Se a base legal dos avisos transacionais for a execução de contrato (art. 7º, V) e não o consentimento, a revogação do art. 8º, §5º pode não se aplicar a eles; a regra da Meta de respeitar pedidos de saída continua valendo `[CONDICIONAL: depende de parecer]`.

### 7.2 Caminhos de saída e estado atual

| Caminho | Como detectar | Estado hoje |
|---|---|---|
| Interruptor em Conta (revogar o propósito de WhatsApp) | linha em `consents` com `granted = false` | `[PLANEJADO]` |
| Responder SAIR (ou PARAR, CANCELAR, STOP, "não quero receber") | webhook de mensagens de entrada | `[PLANEJADO]`: não existe função de webhook |
| Tocar no botão "Parar de receber avisos" | mesmo webhook (mensagem de entrada do tipo botão) | `[PLANEJADO]` |
| E-mail ao SAC | caixa do SAC (L10, `docs/juridico/10-sac-e-atendimento.md`) | manual, mas **sem como executar**: não há preferência de canal |
| Bloquear o número no WhatsApp | sem sinal confiável para o WorkEasy; a Meta mede por bloqueios e denúncias e baixa a qualidade [M16] | monitorar a qualidade |
| Excluir a conta | `anonymize_user` apaga as linhas `queued` e zera `phone`, `email` e `params` | existe (migração 10) |

### 7.3 O que fazer quando alguém sai `[PLANEJADO]`

1. Gravar a revogação (linha em `consents`, `granted = false`).
2. Pular o que já está na fila para o canal, pois os lembretes ficam enfileirados com até dias de antecedência:

```sql
update public.notifications
   set status = 'skipped', error = 'whatsapp_opt_out'
 where user_id = :user_id and channel = 'whatsapp' and status = 'queued';
```

3. `private.notify` passa a consultar a última linha de `consents` desse propósito: só `granted = true` habilita WhatsApp; sem isso, usa o e-mail confirmado, se houver, e se não houver, não envia.
4. Se a saída veio por mensagem, responder com texto livre dentro da janela aberta pela própria pessoa (seção 8). Sem modelo; conta como mensagem de serviço (seção 9):

> Pronto: você não receberá mais avisos do WorkEasy por WhatsApp neste número. [Se houver e-mail cadastrado: Os avisos passam a ir para o seu e-mail.] Para voltar a receber, ative em Conta, na seção Consentimentos.

---

## 8. Janela de atendimento de 24 horas

### 8.1 Regras da Meta (23/10/2026)

| Regra | Trecho / detalhe | Fonte |
|---|---|---|
| Abre e renova | "When a WhatsApp user messages you or calls you, a 24-hour timer called a customer service window starts. If the user messages or calls you again before the timer expires, the timer resets to 24 hours." Mensagem **nossa** não abre janela | [M16] |
| Dentro da janela | mensagens livres (texto, imagem, interativas) sem aprovação prévia, e também modelos | [M16][M1] |
| Fora da janela | só modelos aprovados: "You may only initiate conversations using an approved Message Template" | [P1] |
| Opt-in continua | "you can only send messages to WhatsApp users who have opted in" mesmo dentro da janela | [M16] |
| Automação | "You may use automation when responding during the 24-hour window, but must also have available prompt, clear, and direct escalation paths" (por exemplo e-mail ou site) | [P1] `[incerto: não reconfirmado]` |
| Perfil | manter perfil do WhatsApp Business com contato de suporte: e-mail, site ou telefone | [P1] |
| Qualidade | o modelo pesa feedback negativo de usuários e baixa taxa de leitura [M12]. Bloqueios, denúncias, silenciamentos, janela de 7 dias e "Avoid sending too many messages per day" não foram reconfirmados em [M16] `[incerto]` | [M12][M16] |
| Custo (muda em 1º/10/2026) | resposta livre = categoria **serviço**: 1.000 por mês por número sem cobrança, depois cobrada pela mesma tarifa de utilidade e autenticação do país, sem desconto por volume. Modelo de utilidade dentro da janela: cobrado. Antes: serviço sem cobrança desde 1º/11/2024; utilidade em janela sem cobrança desde 1º/7/2025 | [M1][M25] |

### 8.2 O que o WorkEasy faz hoje

Só envia modelos. Não recebe nada: não existe webhook de entrada, então a janela nunca é usada e **toda resposta de uma pessoa a um aviso fica sem tratamento**. Não há erro 131047 ("More than 24 hours have passed since the recipient last replied") porque o código nunca manda texto livre [M20].

### 8.3 Decisão para quando alguém responder `[PLANEJADO]`

| Opção | Efeito | Recomendação |
|---|---|---|
| A. Ignorar | deixa "SAIR" e qualquer pedido de ajuda sem resposta; a política da Meta manda respeitar pedidos de saída [P1] | só até o go-live; não ligar o canal assim |
| B. Webhook de entrada + resposta automática + tratamento de SAIR | cumpre opt-out e o caminho de escalonamento | **recomendada** |
| C. Caixa humana no aplicativo WhatsApp Business no mesmo número | atende pessoas, mas não vi a regra de convivência entre aplicativo e API no mesmo número `[incerto]` | só depois de ler a regra; usar número separado para o concierge |

Resposta automática única da opção B (mensagem de serviço, dentro da janela):

> Este número envia avisos automáticos do WorkEasy e não recebe atendimento por aqui. Para falar com a gente: [E-MAIL DO SAC]. Para parar de receber avisos por WhatsApp, responda SAIR.

---

## 9. Mensagem, categoria e fatores de custo

**Fonte e data:** [M1] (página "Pricing on the WhatsApp Business Platform") e [M25] (página "Upcoming pricing updates for Meta Business Agent, service and utility messages"), lidas em **23/10/2026**; [M1] diz refletir as mudanças em vigor desde **1º/10/2026**. As tarifas por país ficam em arquivos CSV e PDF por moeda que **não consegui abrir** (os links dos arquivos não aparecem no texto da página que obtive). A tabela do site comercial é montada por JavaScript e também não trouxe números [M2]. Por isso não há tarifa em reais neste documento.

**Único número que achei para o Brasil:** [M25] diz "The 0.68 USD cent message delivery rate is based on the current rate (as of July 1, 2026) for utility and authentication messages to users in Brazil" e que, por mercado, "rates for service messages will be the same as the rates for utility and authentication messages". [M1] repete "0.68 ¢ per message" numa tabela comparativa. São **0,68 centavo de dólar** por mensagem entregue (US$ 0,0068), tarifa de lista. [M1] lista as mudanças de tarifa de 1º/10/2025 a 1º/10/2026 e o Brasil não aparece em nenhuma `[incerto: não reconfirmado nesta revisão]`. Tarifa em reais e tarifa de marketing do Brasil: `[incerto]`.

| Mensagem | Quem recebe e quando | Categoria Meta | Fatores de custo | Observação |
|---|---|---|---|---|
| `proposta_recebida` | cliente; 1 por proposta | Utilidade | 1 mensagem entregue × tarifa de utilidade (mercado +55) | só quem entrou por celular |
| `atendimento_confirmado` | cliente e profissional; 2 por atendimento | Utilidade | 2 × tarifa | |
| `lembrete_atendimento` | idem, 24 h antes; até 2 | Utilidade | 2 × tarifa; pulado se o atendimento for cancelado; validade evita entrega tardia | |
| `pagamento_recebido` | profissional; 1 por pagamento | Utilidade | 1 × tarifa | não repete em `received` para `confirmed` |
| `orcamento_respondido` | profissional; 1 por resposta | Utilidade | 1 × tarifa | |
| `plantao_oferecido` | cuidador; 1 por oferta | Utilidade, risco de Marketing | 1 × tarifa de utilidade; se reclassificado, tarifa de marketing | ver 4.6 e 4.8 |
| `codigo_de_verificacao` `[PLANEJADO]` | quem pede código por celular; 1 por pedido | Autenticação | 1 × tarifa de autenticação; **reenvios e abuso multiplicam** | a tarifa "authentication-international" só se aplica a empresa sediada em outro país que passe de 750 mil mensagens em 30 dias para países que a têm; a página não cita o Brasil [M22] |
| `avisos_ativados` `[PLANEJADO]` | quem ativa o WhatsApp; 1 por ativação | Utilidade | 1 × tarifa | |
| Resposta livre a quem escreveu (SAIR, aviso automático) | quem escreveu | Serviço | 1.000 por mês por número sem cobrança; depois, a tarifa de utilidade do país [M25] | depois da cota, exige forma de pagamento cadastrada |
| Novidades e ofertas (consentimento `marketing`) `[PLANEJADO]` | quem consentiu | Marketing | tarifa de marketing `[incerto]`; limites por usuário | ainda sem modelo; nunca para o Pro (seção 10) |
| E-mail (Resend) | quem tem e-mail confirmado e não tem celular | não é da Meta | fora deste documento | dossiê I02 |

**Regras de custo que valem para todas** [M1]:

- Cobra-se por mensagem **entregue**: "Businesses are only charged when a message is delivered." Mensagem de pessoa para empresa não é cobrada.
- A tarifa depende da categoria e do **país do telefone de destino** (+55 = Brasil).
- Desconto por volume só para utilidade e autenticação, por mês, por país e categoria, somando o portfólio; só mensagens cobradas contam. Irrelevante no volume do MVP `[incerto: não reconfirmado]`.
- Janela de entrada por anúncio de clique para WhatsApp (FEP): sem cobrança por 72 horas, segundo a página comercial [M2]. A página de desenvolvedores reaberta ([M1][M25]) não dá a duração, e os 7 dias não aparecem nas páginas reabertas `[incerto]`. O WorkEasy não usa anúncios desse tipo.
- Moeda: desde 1º/7/2026 existe conta de mensagens em reais, faturada pela Facebook Brasil [M1]. A página de moedas [M25] diz que empresas no Brasil só podem escolher a moeda local. A data de 1º/7/2027 para contas em outra moeda e a regra de não mudança não aparecem nas páginas reabertas `[incerto]`. **Crie a conta já em BRL.**
- Sem forma de pagamento, a Meta entrega mensagens de serviço só dentro da cota gratuita [M1]. O erro 131042 indica problema de pagamento [M20].

**Ordem de grandeza `[estimativa]`:** um atendimento com as 4 mensagens entregues custa 4 × 0,68 ¢ ≈ 2,7 centavos de dólar; 1.000 atendimentos por mês, cerca de US$ 27, **se** todas as pessoas tiverem WhatsApp e a tarifa de lista for a do exemplo. Não é cotação.

**Como ver o custo real:** o webhook de status traz o objeto `pricing` (`type`, `category`, `pricing_model`; `billable` está marcado como descontinuado [M21]) e aceita `biz_opaque_callback_data`, devolvido no webhook, útil para amarrar à linha de `notifications` [M21]. O WorkEasy não tem esse webhook `[PLANEJADO]`.

---

## 10. Limites de política da Meta para os serviços do catálogo

Catálogo em 23/10/2026: 1.710 ocupações em 44 áreas (`catalog/areas.json`). As políticas abaixo são da Meta; **nenhuma delas é lei brasileira** e nenhuma decide se o WorkEasy pode operar no Brasil.

| Tema | O que a Meta escreve | Onde toca o WorkEasy | Proposta |
|---|---|---|---|
| Aplicação da política | para quem reincide: bloqueio de 1 ou 3 dias de modelos, depois de 5, 7 ou 30 dias de qualquer mensagem, "An account lock, which is an indefinite block on sending any messages; can only be removed via an appeal" [M18, não reaberto `[incerto]`] | um número só envia os avisos de todas as ocupações | manter o e-mail como canal de reserva |
| Saúde | "Don't use WhatsApp for telemedicine or to send or request any health related information, if applicable regulations prohibit distribution of such information to systems that do not meet heightened requirements to handle health related information." [P1] | 8 áreas de saúde somam **443** ocupações: `health` 118, `saude-mental` 46, `odontologia` 37, `terapias-e-reabilitacao` 61, `nutricao` 43, `enfermagem` 49, `exames-e-diagnostico` 54, `terapias-integrativas` 35. Mais a área `cuidados` (33: cuidador de idosos, de pessoas com deficiência, babá etc.) e a linha de cuidado (plantões). Os modelos levam ocupação, data e contraparte | `[CONDICIONAL: depende de parecer]`: variante sem o nome da ocupação e da contraparte para essas áreas, ou só e-mail e app. Telemedicina por WhatsApp está fora do escopo (é demonstração de futuro) |
| Serviços de saúde | a lista de violações diz: "Manufacturers and healthcare services who do not engage in direct sale are allowed" [M19]; a política de comércio proíbe "medical and healthcare products and services" em conteúdo de comércio [P2] | idem | as duas páginas não se alinham: perguntar à Meta `[incerto]` |
| Animais | `ANIMALS`: "Businesses may not transact in the sale of any animals", com exemplos "Veterinary services", "Grooming services", "Boarding services" [M19]. A política principal lista "Live non-endangered animals excluding livestock" [P1] | área `pets`: **42 ocupações** (veterinários, banho e tosa, hospedagem, passeador, creche) | lista de exclusão: e-mail em vez de WhatsApp, até resposta da Meta |
| Cobrança de dívidas | "Payday loans, paycheck advances, peer-to-peer lending, debt collection, and bail bonds"; vale "irrespective of the global or local licenses, registrations, or other approvals your business may hold" [P1] `[incerto: cláusula não reconfirmada]` | `cobranca-de-dividas`, `advogado-de-cobranca-e-execucao-de-credito` | lista de exclusão |
| Armas | lista "Firearms"; exemplos de violação "Promoting safety training or licenses for legal weapons" e "Gun ranges" [P1][M19] | `instrutor-de-tiro-esportivo-e-clube-de-tiro`, `seguranca-pessoal-e-escolta` (escolta armada), `avaliacao-psicologica-porte-de-arma` | lista de exclusão |
| Álcool | "Alcohol and tobacco" na lista [P1]; `ALCOHOL`: "may not transact in the sale of alcohol" [M19] | `cervejeiro-e-bebidas-artesanais`; `bartender` e `sommelier` são serviço, não venda `[incerto]` | lista de exclusão para a primeira; as outras, dúvida para a Meta |
| Assinaturas digitais | `DIGITAL_SERVICES_PRODUCTS`: "including links to or processing of any subscription sales, renewals, or upgrades" [M19] | plano **Pro** | nunca vender, renovar nem cobrar o Pro por WhatsApp; fim de teste só por e-mail e app |
| Identificadores sensíveis | "Don't share or ask people to share full length individual payment card numbers, financial account numbers, personal ID card numbers, or other sensitive identifiers." [P1] | os seis modelos não levam nada disso | nunca pôr CPF, CNPJ, chave Pix ou cartão em variável |
| Comércio | "When you offer goods or services for sale, Meta considers all messages and media related to your goods or services, including any descriptions, prices, fees, taxes, and/or any required legal disclosures, to constitute transactions." [M6]. A política diz que vale para quem usa Catálogo ou "any other commerce experiences to sell goods or services" [P1]. "Commerce content may not promote the buying, selling, or trading of services, except on the WhatsApp Business app or through Appointments in Facebook or Instagram." [P2] | `proposta_recebida` e `pagamento_recebido` citam preço de serviços de terceiros. O WorkEasy não usa Catálogo, nem pagamento pelo WhatsApp | `[incerto]` se um aviso de preço é "commerce experience". Mitigação: nenhum catálogo, nenhum link de pagamento, nenhuma lista de preços no WhatsApp. Perguntar à Meta |
| Emprego | "Commerce content may not promote job opportunities." [P2] | `plantao_oferecido`; ocupações `recrutamento-e-selecao`, `agencia-de-empregos-trabalho-temporario-e-terceirizacao` | `[incerto]`, ver 4.6 |
| Perfil e suporte | "Maintain a WhatsApp Business profile with customer support contact information" [P1] | exige e-mail do SAC e site | `[E-MAIL DO SAC]`, `[DOMÍNIO DO WORKEASY]` |

**Lista de exclusão, ponto de partida (revisar com a Meta e o advogado)** `[PLANEJADO]`: exige filtro por `occupation_slug` em `private.notify` (e-mail em vez de WhatsApp):

```text
área inteira:  pets
ocupações:     cobranca-de-dividas, advogado-de-cobranca-e-execucao-de-credito,
               instrutor-de-tiro-esportivo-e-clube-de-tiro, seguranca-pessoal-e-escolta,
               avaliacao-psicologica-porte-de-arma, cervejeiro-e-bebidas-artesanais
```

A busca por palavras-chave foi minha, não uma revisão do catálogo: pode haver outras ocupações na mesma situação.

---

## 11. Antes de ligar o canal

### 11.1 Portões de go-live

Não grave `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` em produção antes de G1 a G3. Sem os dois, o despachante marca `skipped` e nada sai.

| # | Portão | Como saber que passou | Estado |
|---|---|---|---|
| G1 | Opt-in de WhatsApp com texto A, gravado em `consents` | linha com `granted = true` e versão do texto | `[PLANEJADO]` |
| G2 | Opt-out funcionando (interruptor e pular `queued`) | revogar e conferir que a fila ficou `skipped` | `[PLANEJADO]` |
| G3 | `private.notify` respeita G1, G2 e a lista de exclusão, com e-mail como reserva | teste de banco (pgTAP) novo | `[PLANEJADO]` |
| G4 | Seis modelos `APPROVED` e `category` = `UTILITY` | comando de 4.0 | pendente |
| G5 | Conta de mensagens **em BRL**, forma de pagamento no Billing Hub, perfil do WhatsApp Business com e-mail do SAC e site, verificação do negócio (sobe de 250 para 2.000 contatos únicos por 24 h) | painel da Meta | dossiê I02 |
| G6 | Segredos no Supabase (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `SITE_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`) e no Vault (`notify_dispatch_url`, `cron_secret`) | `docs/RUNBOOKS.md` (I04) e dossiê I02 | pendente |
| G7 | Teste com 2 ou 3 pessoas que deram opt-in, em número com WhatsApp e em número sem; enviar com e sem o `+` no destino (2.3) | conferir `notifications.status` e, no webhook, `pricing` | pendente |
| G8 | Resposta da Meta sobre a seção 10 e parecer sobre saúde e base legal (seção 12) | por escrito | pendente |
| G9 | Webhook de entrada e de status (SAIR, resposta automática, `pricing`, qualidade e estado dos modelos) | função nova | `[PLANEJADO]`; recomendado antes de escalar |

### 11.2 Rotina semanal (10 minutos)

1. WhatsApp Manager, modelos: algum fora de `Active` ou com qualidade `Medium` ou `Low`? Pausa por qualidade: 3 h, depois 6 h, depois desativado [M13].
2. WhatsApp Manager, números: qualidade do número e limite de envio [M15][M16].
3. Billing Hub: forma de pagamento ativa e gasto da semana.
4. Banco, como administrador:

```sql
select template, channel, status, left(coalesce(error, ''), 60) as motivo, count(*) as total
  from public.notifications
 where created_at > now() - interval '7 days'
 group by 1, 2, 3, 4
 order by total desc;
```

5. Comando de 4.0 para `status`, `category`, `correct_category`.

### 11.3 Erros da Meta que importam (página de códigos de erro [M20])

O despachante só olha o status HTTP; o `error.code` não é gravado. Para investigar, leia o texto em `notifications.error`.

| Código | Significado | Ação |
|---|---|---|
| 131026 | não entregue: "The recipient phone number is not a WhatsApp phone number", ou versão antiga do app | esperado em número de SMS sem WhatsApp; hoje não há fallback |
| 132000, 132012, 132018 | variáveis em número, formato ou validação diferentes do modelo | conferir 4.1 a 4.6 contra o código |
| 132001 | "The template does not exist in the specified language or the template has not been approved" | conferir nome, `pt_BR` e `status` |
| 132015, 132016 | modelo pausado por baixa qualidade; desativado | seção 11.2; criar texto novo |
| 131042 | problema de pagamento da conta | Billing Hub |
| 190, 0 | token vencido ou inválido | trocar o token (I04) |
| 130429 | limite de vazão da Cloud API atingido | o despachante só repete se a resposta vier como 429 ou 5xx; a página de erros não informa o status HTTP `[incerto]` |
| 131056 | muitas mensagens do mesmo número para o mesmo destinatário em pouco tempo | aguardar |
| 131049 | "This message was not delivered to maintain healthy ecosystem engagement"; a página liga ao limite por usuário de modelos de marketing | esperar pelo menos 24 h antes de reenviar, segundo a página |
| 131050 | destinatário parou de receber **marketing** da empresa | não repetir |

### 11.4 Lacunas do produto encontradas (não corrigidas aqui)

1. `private.notify` envia WhatsApp a qualquer `auth.users.phone` confirmado: sem opt-in de WhatsApp, sem preferência de canal, sem opt-out.
2. Canal fixo na hora de enfileirar e sem fallback: sem credencial vira `skipped` e a pessoa fica sem aviso, mesmo com e-mail confirmado.
3. O despachante grava a mensagem de erro, não o `error.code`; erros de modelo e de pagamento da conta ficam como `failed` sem alerta.
4. Não existe webhook de entrada nem de status (sem tratar SAIR, sem `pricing`, sem alerta de modelo pausado). "Enviado" não prova entrega [M16].
5. O destino sai sem `+` (`normalizePhoneBR` devolve `55...`), contra a recomendação da Meta (2.3). Não sei o efeito real num número da empresa também +55 `[incerto]`.
6. Sem chave de idempotência no envio por WhatsApp (o e-mail usa `Idempotency-Key`): um tempo esgotado depois de a Meta aceitar a mensagem gera nova tentativa e possível duplicata. Não vi se a Cloud API oferece idempotência `[incerto]`.
7. Nenhum teste compara os modelos registrados com `TEMPLATES`; o teste atual só confere que cada chave aparece em `body`.
8. `pagamento_recebido` diz "recebido pelo Asaas" também em `confirmed` (ver 4.4).
9. Ocupação, contraparte e `quote_title` (texto livre) vão para a Meta, inclusive nas áreas de saúde e cuidado; não há variante genérica.
10. Não há lista de exclusão por ocupação.
11. OTP por WhatsApp não existe (seção 5); o README diz que o envio por WhatsApp não é oferecido, e as notificações usam WhatsApp: vale esclarecer a frase. Além disso, `docs/ARQUITETURA.md`, linha 798 (rota `/entrar`), diz "e-mail ou WhatsApp/SMS", e o L01 (item 14) já registra essa divergência.

---

## 12. Pontos para o advogado

Os artigos da LGPD citados nesta seção não foram reconferidos: o Planalto bloqueou a leitura em 08/11/2026.

1. **Base legal dos avisos por WhatsApp.** Consentimento (LGPD art. 7º, I e art. 8º) ou execução de contrato (art. 7º, V)? A Meta exige opt-in de qualquer forma. O item 13.2 do rascunho dos Termos (L01) já fala em avisos por WhatsApp: isso basta como opt-in, ou vale o texto A, separado? Se for consentimento por escrito, precisa de cláusula destacada (art. 8º, §1º)? [L1] A L03 (item 3.7) já usa a base do art. 7º, V, para esses avisos, e o Texto A pede consentimento: o conflito precisa de resposta antes do G1.
2. **Dado de saúde nas mensagens.** Nome de ocupação de saúde + data + contraparte em aviso constitui "dado referente à saúde" (art. 5º, II) e exige consentimento específico e destacado (art. 11, I)? Existe regulação brasileira que proíba esse envio a sistemas sem "heightened requirements" (regra da Meta)? Não pesquisei normas de conselhos profissionais sobre mensagens por aplicativo.
3. **Meta como operadora, transferência internacional e Política de Privacidade.** A Meta recebe número e texto dos avisos. Tratar na L03 (`docs/juridico/03-politica-de-privacidade.md`).
4. **Texto livre.** `quote_title` e nomes digitados por terceiros vão para a Meta. Limitar o conteúdo?
5. **Revogação.** Prazo para cumprir o pedido, registro da revogação e por quanto tempo guardar a prova do opt-in e do opt-out.
6. **Número novo.** O consentimento acompanha o titular ou o número?
7. **Mensagem de oferta de plantão** a prestador autônomo: tem implicação além da política da Meta? (vínculo e LC 150: ver pergunta 4 de `docs/DECISOES.md`.)
8. **Risco de restrição pela Meta** e a dependência do número de WhatsApp para avisos; manter o e-mail como reserva.
9. **Itens `[incerto]`:** conflito entre páginas de preço da Meta; tarifa de marketing e tarifa em reais; semântica de `confirmed` no Asaas; alcance da política de comércio sobre avisos de preço; convivência entre aplicativo WhatsApp Business e API no mesmo número; idempotência da Cloud API; ponto final depois de variável; prazo de validade do código por celular no Supabase.

---

## 13. Fontes consultadas

Todas abertas em **23/10/2026** e reabertas em **08/11/2026** pelo revisor, salvo a LGPD (L1). Páginas da Meta lidas no texto original em Markdown (`.md`) obtido pelo mesmo endereço da página; as sem `.md` foram lidas em HTML.

| Código | Endereço | O que li | Trecho ou dado usado |
|---|---|---|---|
| M1 | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing | página inteira | "Meta charges on a per-message basis"; 1.000 mensagens de serviço grátis por mês; "Meta resumed charging ... for messages that were previously free"; BRL desde 1º/7/2026; "0.68 ¢ per message" |
| M2 | https://whatsappbusiness.com/products/platform-pricing/ | texto da página (tabela de tarifas é JavaScript) | "do not charge for service messages, or for utility messages businesses send in response to users"; "3 days (72 hours)" |
| M3 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview | página inteira | formato posicional; ordem dos valores; limites de modelos; arquivamento |
| M4 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization | página inteira | definições de utilidade, marketing e autenticação; exemplos; reclassificação; restrições |
| M5 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components | seções de cabeçalho de texto, corpo, rodapé e botões (inclui URL) | limites de corpo, rodapé, cabeçalho e botões |
| M6 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-review | página inteira | regras de variáveis; política de comércio; 24 horas; duplicados |
| M7 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/utility-templates/utility-templates | página inteira | componentes de utilidade; envio com botões estáticos |
| M8 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-templates | página inteira | texto fixo; segurança; validade 1 a 90 min; aparelho principal |
| M9 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/copy-code-button-authentication-templates | página inteira | criação e envio do modelo de copiar código; "handshake" |
| M10 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/authentication-templates/authentication-best-practices | página inteira | escolha de canais; propriedade do número |
| M11 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/time-to-live | página inteira | faixas e padrões de validade |
| M12 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-quality | página inteira | GREEN, YELLOW, RED, UNKNOWN |
| M13 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pausing | página inteira | pausa de 3 h, 6 h, desativação; edição volta à análise |
| M14 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-pacing | página inteira | pacing de utilidade só depois de uma pausa, por 7 dias |
| M15 | https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits (e `upcoming-messaging-limits-changes`, na mesma pasta) | páginas inteiras | 250, 2.000; limite por portfólio (a página não traz data de vigência) |
| M16 | https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages | página inteira | janela de 24 h; qualidade; "only indicates that the API successfully accepted your request"; formatos de número de telefone (o `+`); validade das mensagens |
| M17 | https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in | página inteira | requisitos de opt-in |
| M18 | https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement | página inteira | escada de bloqueios |
| M19 | https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement-violations | página inteira | `ANIMALS`, `HEALTHCARE`, `DIGITAL_SERVICES_PRODUCTS`, `WEAPONS`, `ALCOHOL`, `MISLEADING` |
| M20 | https://developers.facebook.com/documentation/business-messaging/whatsapp/support/error-codes | linhas dos códigos citados | 131026, 131042, 131047, 131049, 131050, 131056, 132000, 132001, 132012, 132015, 132016, 132018, 130429, 190 |
| M21 | https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/messages/status | trecho do exemplo e dos parâmetros | objeto `pricing`; `biz_opaque_callback_data` |
| M22 | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/authentication-international-rates | início e busca por "Brazil" | critérios; a página não cita o Brasil |
| M23 | https://developers.facebook.com/documentation/business-messaging/whatsapp/reference/whatsapp-business-account/message-template-api | lista de campos e valores | `parameter_format`, `message_send_ttl_seconds`, `sub_category` (não usado: efeito não documentado nessa página) |
| M24 | https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/supported-languages | linha do português | "Portuguese (BR)" com o código `pt_BR` |
| M25 | https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages | início até a seção de tarifas de serviço (o restante trata do Meta Business Agent) | serviço cobrado desde 1º/10/2026 com a tarifa de utilidade e autenticação; "0.68 USD cent" para o Brasil |
| P1 | https://whatsappbusiness.com/policy/ (redireciona de whatsapp.com/legal/business-policy/) | política inteira, "Last updated: September 23, 2026" | opt-in; saída; modelos; saúde; identificadores; lista de proibidos |
| P2 | https://www.facebook.com/policies_center/commerce | página inteira, sem data | "Services", "Jobs", "Medical and Healthcare Products" |
| S1 | https://supabase.com/docs/guides/auth/auth-hooks/send-sms-hook (código-fonte da página no repositório supabase/supabase, ramo master, e a página publicada) | página inteira | entradas, saída, WhatsApp como canal alternativo |
| S2 | https://supabase.com/docs/guides/auth/auth-hooks (código-fonte no mesmo repositório) | página inteira | planos; Standard Webhooks; 5 s; 20 KB; configuração local |
| S3 | https://supabase.com/docs/guides/auth/phone-login | página publicada e código-fonte | "WhatsApp is only supported as a channel for the Twilio and Twilio Verify Providers"; validade do código |
| L1 | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm | texto compilado da Lei 13.709/2018 (**não reaberto em 08/11/2026**: o Planalto bloqueou a leitura nas duas URLs tentadas) | arts. 5º (II, XII), 6º, 7º (I, V), 8º, 9º, 11 (I), 18 (IX) |

Artefatos do repositório lidos: `apps/web/supabase/functions/_shared/{notifications,notification-context,dates,money,validate,config}.ts`, `notify-dispatch/{handler,index}.ts`, migrações 08, 09 e 10, `supabase/config.toml`, `services/auth.ts`, `pages/conta/{Entrar,Conta}.tsx`, `config/legal.ts`, `catalog/areas.json`, `test/claims-guard.test.ts`, `docs/ARQUITETURA.md`, `docs/DECISOES.md`.

---

## 14. O que não verifiquei

- Nenhuma chamada à API da Meta, ao Supabase hospedado, ao Asaas ou ao Resend foi feita: não há conta. Registro, aprovação, categoria final, prévia pt_BR do modelo de autenticação e entrega são **hipóteses até o primeiro teste**.
- Tarifas em reais e a de marketing: arquivos CSV e PDF de tarifas não abertos.
- Regras do Supabase hospedado para a validade do código por celular e para limites de envio.
- Semântica dos status `received` e `confirmed` do Asaas.
- Normas de conselhos profissionais sobre mensagens por aplicativo e dado de saúde.
- Se o painel do WhatsApp Manager permite definir validade (TTL) e rodapé na criação manual.
- A lista de exclusão da seção 10 vem de busca por palavras-chave no catálogo, não de revisão ocupação por ocupação.
- LGPD: os artigos citados (L1) não foram reconferidos; o Planalto devolveu "Acesso Negado" nas duas URLs tentadas.
- Revisão de 08/11/2026: as consultas das seções 7.3 e 11.2 foram executadas no banco local dentro de transação revertida; os seis exemplos da seção 2 e 4 foram gerados pelo código real via Deno e batem com o texto; o JSON foi validado e `jq` seleciona os seis modelos de utilidade.
- Não reconfirmados em 08/11/2026: M5 (resposta rápida com outro botão), M7, M18, a cláusula de P1 sobre cobrança de dívidas e a automação em P1, M20 (códigos 132012 e 132018), desconto por volume, tarifas do Brasil e a regra de aviso de 1 dia da reclassificação.
- Divergências com documentos irmãos, não corrigidas aqui: L11 linha 106 (novidades "por WhatsApp ou e-mail") frente ao Texto C; L03 item 3.7 (base do art. 7º, V) frente ao Texto A (consentimento); `docs/ARQUITETURA.md` linha 798 (login "e-mail ou WhatsApp/SMS") frente ao código e ao README; I02 passo 7 (`to` com "+") frente aos exemplos do JSON (sem "+"); O01 linha 445 (modelo `pedido_novo`, que não existe aqui) e linha 683 (tarifa em reais de R$ 0,035 derivada de US$ 0,68 ¢, câmbio não citado; este documento não tem tarifa em reais).
