# 10. SAC, atendimento e identificação do fornecedor

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| Item | Situação |
|---|---|
| Versão | `2026-10-rascunho` (mesma string de `CONSENT_VERSIONS.terms` em `apps/web/config/legal.ts`) |
| Vigência | [DATA DE VIGÊNCIA] |
| Redigido em | 2026-11-08 |
| Lugar no pacote | Documento 10. Remete aos documentos 01 (Termos de Uso), 03 (Política de Privacidade), 04 (Cancelamento, Reembolso e Garantia), 05 (Avaliações e Moderação) e 08 (Plano de Resposta a Incidentes). |
| Estado do produto nesta data | Protótipo. Não implantado, sem usuários reais. A rota `/sac` existe, mas com texto provisório ("Documento em elaboração") e sem contato. O rodapé (`components/SiteFooter.tsx`) não mostra CNPJ nem endereço enquanto as variáveis `VITE_COMPANY_*` não estiverem preenchidas; no modo demonstração, mostra só o aviso de protótipo. O `/legal` ainda diz "Documentos em elaboração". Asaas, WhatsApp e e-mail nunca foram testados com os serviços reais. |

## Como ler este documento

1. **O que é.** Três coisas: (a) os dados de identificação e o texto de SAC que o app deve mostrar; (b) a lista do que precisa estar visível no site, no app e nas lojas; (c) as regras internas para responder a quem escreve, com modelos prontos.
2. **O que publicar.** A seção 2 (rodapé e página `/sac`), depois de preenchidos os dados da empresa e da revisão do advogado. As demais seções são internas. A seção "Pontos para o advogado" e "Fontes consultadas" também são internas.
3. **Marcas no texto.**
   - `[CONDICIONAL: depende de parecer]`: só vale se o advogado confirmar, ou se o ponto jurídico ainda está em aberto.
   - `[PLANEJADO]`: não existe no produto hoje. Se continuar sem existir na data da publicação, apague a frase.
   - `[PROPOSTA]`: prazo ou regra que o autor propõe, ainda sem decisão do dono.
   - `[incerto]`: não foi confirmado em fonte aberta nesta sessão. A lista completa está em "Pontos para o advogado".
   - Textos em maiúsculas entre colchetes, como `[E-MAIL DO SAC]`, são dados da empresa, que ainda não existe.
4. **Fatos do produto.** Conferidos em 2026-11-08 no código e em `apps/web/docs/ARQUITETURA.md` e `apps/web/docs/DECISOES.md`. Arquivos citados: `components/SiteFooter.tsx` (rodapé), `AppShell.tsx` (rotas), `config/legal.ts`, `pages/legal/routes.tsx`, `pages/LegalDocs.tsx`, `pages/conta/Conta.tsx`, `pages/conta/Entrar.tsx`, `pages/admin/Lgpd.tsx`, `services/account.ts`, `services/bookings.ts`, `components/cuidado/ReportForm.tsx` (relatório diário do cuidador; não é canal de denúncia).
5. **Lei.** Os textos citados foram lidos em cópias oficiais do portal da Câmara dos Deputados, em 2026-11-08. O Planalto bloqueou o acesso nesta sessão (página "Acesso Negado"). Antes de publicar, confirme cada artigo no Planalto ou no DOU. Veja "Fontes consultadas".

---

## 1. Resumo: o que precisa acontecer antes de publicar

| # | Item | Quem decide | Bloqueia |
|---|---|---|---|
| 1 | Razão social, CNPJ e endereço da empresa (a empresa ainda será criada) | Dono | Rodapé, `/sac`, Termos, Privacidade |
| 2 | E-mail do SAC e e-mail do encarregado, com caixa monitorada | Dono | Rodapé, `/sac`, Apple Support URL |
| 3 | Prazo de resposta do SAC: proposta de 5 dias corridos | Dono, com advogado | Texto do `/sac` |
| 4 | Se o Decreto 13.135/2026 se aplica ao WorkEasy (horário, canal telefônico, cancelamento no primeiro nível, envio de modelos à Senacon) | Advogado | Horário do SAC e botão de cancelamento |
| 5 | Cancelamento de atendimento já pago: só pelo SAC, ou também pelo app | Advogado e dono | Texto da cláusula 7 do `/sac` |
| 6 | Adesão ao Consumidor.gov.br (voluntária) | Dono | Cláusula 10 do `/sac` |
| 7 | Página pública de exclusão de conta, exigida pelo Google Play | Dono e produto | Envio à Google Play |

## 2. Identificação do fornecedor e SAC: textos para publicar

### 2.1 Rodapé (todas as telas públicas)

Texto pronto. Substitui o rodapé de `components/SiteFooter.tsx`. Hoje, no modo demonstração, ele diz só "© 2026 WorkEasy. Protótipo de demonstração." e aponta para `/termos`, `/privacidade` e `/register-provider`. Com backend, aponta para os textos de `config/legal.ts` (Termos de Uso, Privacidade e SAC) e mostra os dados da empresa das variáveis `VITE_COMPANY_*`.

```text
WorkEasy é operado por [RAZÃO SOCIAL], CNPJ [CNPJ], [ENDEREÇO].
SAC: [E-MAIL DO SAC] · Atendimento: [DIAS E HORÁRIO]
Encarregado pelo tratamento de dados pessoais: [E-MAIL DO ENCARREGADO]
Termos de Uso · Política de Privacidade · Cancelamento e reembolso · Atendimento (SAC) · Excluir minha conta
```

Notas:
- O Decreto 7.962/2013, art. 2º, pede que os dados fiquem "em local de destaque e de fácil visualização" (texto lido, ver Fontes). Se o rodapé conta como local de destaque é `[incerto]`. Por isso os mesmos dados também ficam na página `/sac` e nas fichas das lojas.
- Enquanto a empresa não existir, o bloco não vai ao ar com placeholders. Mantenha o aviso honesto de protótipo, como já está hoje.
- Os links "Cancelamento e reembolso" e "Excluir minha conta" não têm página pública hoje `[PLANEJADO]`. Só entram no rodapé quando a página existir.

### 2.2 Página `/sac` (texto para publicar)

Título: **Atendimento ao consumidor (SAC)**

1. **Quem somos.** O WorkEasy é operado por [RAZÃO SOCIAL], CNPJ [CNPJ], com sede em [ENDEREÇO].
2. **Como falar com a gente.** E-mail: [E-MAIL DO SAC]. [TELEFONE OU WHATSAPP DO SAC, se houver] `[PROPOSTA; ver Pontos para o advogado, Q2]`. Para pedidos sobre a sua conta, use o e-mail cadastrado nela.
3. **Horário.** [DIAS E HORÁRIO DE ATENDIMENTO]. `[CONDICIONAL: depende de parecer. Se o Decreto 13.135/2026 se aplicar, o atendimento humano em tempo real nos canais eletrônicos deve ser das 8h às 20h, todos os dias (art. 12, §1º).]`
4. **Prazo de resposta.** Respondemos às suas demandas em até 5 dias corridos, contados do recebimento. Se o caso depender de informação do profissional ou de análise de pagamento, avisamos você do andamento. Base: Decreto 7.962/2013, art. 4º, parágrafo único.
5. **Confirmação de recebimento.** Confirmamos o recebimento da sua mensagem pelo mesmo canal que você usou. `[PROPOSTA]`
6. **O que resolvemos por aqui.** Informações, dúvidas, reclamações, pedidos de cancelamento ou de suspensão de contrato, pedidos de reembolso, pedidos de desistência, cobrança errada, cópia dos seus dados, exclusão da conta, contestação de atendimento e de avaliação, e denúncias.
7. **Cancelamento.** Se o atendimento ainda não foi pago, você pode cancelá-lo no próprio app enquanto ele estiver aguardando aceite ou aceito. Se já foi pago, peça pelo SAC. `[PLANEJADO: botão no app para atendimento pago. CONDICIONAL: depende de parecer; ver Pontos para o advogado, Q4.]`
8. **Desistência (direito de arrependimento).** Quando a contratação acontece fora de um estabelecimento comercial, como pela internet, você pode desistir em até 7 dias contados da contratação ou do recebimento do serviço (CDC, art. 49). Peça pelo SAC, com o número do atendimento. Quando a cobrança foi no cartão, o pedido é comunicado à administradora do cartão, para que a transação não seja lançada na fatura ou seja estornada (Decreto 7.962/2013, art. 5º, §3º). `[CONDICIONAL: depende de parecer quanto a serviço já iniciado ou executado, e de quem faz a comunicação ao emissor do cartão.]`
9. **Cobrança errada ou serviço que você não pediu.** Fale pelo SAC. `[CONDICIONAL: se o Decreto 13.135/2026 se aplicar, a empresa adota providências imediatas para suspender o serviço ou a cobrança, e assegura a conclusão em até 48 horas (art. 21, §3º).]`
10. **Se não resolvermos.** Você pode procurar o Procon do seu estado ou município. Você também pode registrar a reclamação no Consumidor.gov.br, se a empresa participar da plataforma. `[PLANEJADO: adesão do WorkEasy ao Consumidor.gov.br. Até lá, não diga que a empresa participa.]`
11. **Dados pessoais.** Pedidos sobre os seus dados (cópia, correção, eliminação, revogação de consentimento) também são aceitos aqui. A declaração completa é enviada em até 15 dias corridos do pedido (LGPD, art. 19, II). Encarregado: [E-MAIL DO ENCARREGADO] (LGPD, art. 41).
12. **Excluir a conta.** Você exclui sua conta em "Minha conta", na opção "Excluir minha conta", digitando EXCLUIR para confirmar. Se preferir, peça pelo SAC, usando o e-mail cadastrado. A exclusão fica bloqueada enquanto houver atendimento aceito, pago, em andamento ou em contestação. Depois da exclusão, apagamos ou anonimizamos os seus dados pessoais. Pagamentos e atendimentos ficam sem identificar você, `[incerto: base legal e prazo de guarda a confirmar com o contador e o advogado]`.
13. **Avaliações.** Para contestar uma avaliação, escreva ao SAC com o número do atendimento e o motivo. Veja a Política de Avaliações e Moderação (documento 05). `[DECISÃO DO DONO: prazo para contestar]`
14. **Denúncias.** Para denunciar perfil, anúncio, avaliação ou conduta que viole os Termos ou a lei, escreva ao SAC com o link ou a descrição (Termos de Uso, item 10.2). `[PLANEJADO: botão de denúncia no app. Hoje não há.]`
15. **Emergências.** O SAC não atende emergências. Se houver risco à vida ou à saúde, ligue 192 (SAMU, serviço gratuito, 24 horas por dia) ou o número de emergência da sua região.
16. **Identificação.** [RAZÃO SOCIAL], CNPJ [CNPJ], [ENDEREÇO]. Encarregado: [E-MAIL DO ENCARREGADO]. Versão do texto: 2026-10-rascunho. Vigência: [DATA DE VIGÊNCIA].

### 2.3 Placeholders que faltam

| Placeholder | Quem fornece | Observação |
|---|---|---|
| [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO] | Dono, depois de abrir a pessoa jurídica de tecnologia (`DECISOES.md`, seção 8, item 3) | A empresa é separada da clínica do dono. |
| [E-MAIL DO SAC] | Dono | Precisa de caixa monitorada. Ver seção 5.1. |
| [E-MAIL DO ENCARREGADO] | Dono e advogado | Obrigatório ou dispensado conforme Q7. |
| [TELEFONE OU WHATSAPP DO SAC] | Dono | Se usado como canal de SAC, ver Q2. O número `VITE_CONCIERGE_WHATSAPP` é da operação de pedidos, não do SAC. |
| [DIAS E HORÁRIO] | Dono e advogado | Ver item 3 da seção 2.2 e Q2. |
| [DATA DE VIGÊNCIA] | Dono, na publicação | Data em que a versão passa a valer. |

Os dados da empresa entram no rodapé e nas páginas legais pelas variáveis `VITE_COMPANY_NAME`, `VITE_COMPANY_CNPJ`, `VITE_COMPANY_ADDRESS`, `VITE_SAC_EMAIL` e `VITE_SAC_WHATSAPP` (`config/legal.ts`). Sem elas, nada é mostrado.

---

## 3. Checklist de visibilidade: site, app e lojas

Cada linha diz o que a norma pede, o que o produto faz hoje e a ação. "Conferido" quer dizer que o texto foi lido na fonte.

| # | O que deve estar visível | Exigência (fonte) | Hoje no produto | Ação |
|---|---|---|---|---|
| 1 | Nome empresarial e CNPJ | Decreto 7.962/2013, art. 2º, I (conferido) `[CONDICIONAL: se o decreto se aplica ao serviço contratado pelo app]` | Ausente no modo demonstração (`SiteFooter.tsx` diz "Protótipo de demonstração"). Com backend, aparece só se `VITE_COMPANY_NAME` e `VITE_COMPANY_CNPJ` estiverem preenchidos | Rodapé e `/sac`, quando a empresa existir |
| 2 | Endereço físico e eletrônico e demais dados de contato | Decreto 7.962/2013, art. 2º, II (conferido) | Ausente no modo demonstração. Com backend, depende de `VITE_COMPANY_ADDRESS` | Rodapé e `/sac` |
| 3 | Rota de SAC (`/sac`) | Decreto 7.962/2013, art. 4º, V: serviço eletrônico "adequado e eficaz" para informação, dúvida, reclamação, suspensão ou cancelamento (conferido) | Rota `/sac` existe (`config/legal.ts`), com texto provisório de `content/legal/sac.md` e sem canal de contato | Trocar o texto provisório pelo da seção 2.2, com contato real |
| 4 | Sumário do contrato antes da contratação | Decreto 7.962/2013, art. 4º, I (conferido) | Nenhuma menção a sumário em `pages`, `services` e `components` (busca de 2026-11-08) | `[incerto: verificar nas telas de pedido e agendamento]` |
| 5 | Termos de Uso e Política de Privacidade acessíveis | Google Play: link de política de privacidade na Play Console e dentro do app (conferido) | No modo demonstração, o rodapé aponta para `/termos` e `/privacidade`. `pages/conta/Entrar.tsx` e `components/TermsGate.tsx` apontam para `/legal`, que diz "Documentos em elaboração" (`pages/LegalDocs.tsx`) | Publicar os textos dos documentos 01 e 03 |
| 6 | Apple: Support URL | App Store Connect: campo obrigatório. A página precisa ter contato real (e-mail, telefone ou endereço), e a URL completa com protocolo (conferido) | Sem submissão. A rota `/sac` existe, mas sem contato real | Publicar `/sac` com contato real e informar a URL completa, com protocolo |
| 7 | Apple: exclusão de conta dentro do app | Diretriz 5.1.1(v): apps com criação de conta devem oferecer a exclusão no app. Se a exclusão exigir site, o app deve ligar direto à página. Apps fora de setor altamente regulado "não devem exigir" ligação, e-mail, chat ou outro fluxo de suporte (página de ajuda da Apple, conferida) | Existe: "Excluir minha conta" em `/conta` (`pages/conta/Conta.tsx`), com função de servidor `account-delete`. Só funciona com backend ligado (o próprio texto da página diz isso) | Manter. Testar no build iOS. Sem e-mail como único caminho |
| 8 | Google Play: exclusão dentro do app e link web externo | Política da Google Play: opção no app, em lugar de destaque, e link para página web de exclusão, que cite o nome do app ou do desenvolvedor, funcione e permita pedir a exclusão sem voltar ao app (conferido). Se desativar a conta conta como exclusão: `[incerto: a página consultada não trata do assunto]` | Dentro do app: existe, com backend. Página web de exclusão: não existe | Criar página pública de pedido de exclusão, ligada ao `/sac`, com formulário ou instruções |
| 9 | Google Play: política de privacidade com contato do desenvolvedor | Política da Google Play: conteúdo mínimo inclui informações do desenvolvedor e um contato de privacidade (conferido) | Placeholder | Publicar o documento 03 com o e-mail do encarregado |
| 10 | Apple: Privacy Policy URL | Campo de privacidade no App Store Connect (não conferido na página da Apple consultada). Obrigatoriedade `[incerto]` | Placeholder | Mesma página do item 9 |
| 11 | Desistência pela mesma ferramenta da contratação | Decreto 7.962/2013, art. 5º, §1º: pode ser feita pela mesma ferramenta, sem prejuízo de outros meios (conferido) | Cancelamento pelo app só antes do pagamento: o cliente cancela `requested` e `accepted` (`services/bookings.ts`, `transition_booking` em `ARQUITETURA.md`). Depois de pago, não há botão | Decisão do advogado (Q4). Enquanto isso, o texto manda ao SAC |
| 12 | Comunicação do arrependimento à administradora do cartão | Decreto 7.962/2013, art. 5º, §3º (conferido) | Não há fluxo | Procedimento interno, seção 6, modelo T4 |
| 13 | Canal telefônico obrigatório, atendimento humano das 8h às 20h, cancelamento no primeiro nível, até cinco níveis, envio de modelos de atendimento à Senacon | Decreto 13.135/2026, arts. 2º, 12, §1º, 13, §1º, 14, 20, §1º e 21 (lidos em cópia da Câmara). `[CONDICIONAL: depende de parecer quanto ao escopo do art. 1º, parágrafo único, e do art. 2º]` | Não há | Decisão do advogado antes de publicar o `/sac` |
| 14 | Aviso de protótipo | Honestidade com o usuário (não é exigência legal) | Presente no rodapé e no banner de `/legal` | Manter até o lançamento |

---

## 4. Prazos e níveis de serviço

### 4.1 Prazos

| Demanda | Confirmação de recebimento | Primeira resposta de mérito | Encerramento | Base |
|---|---|---|---|---|
| Informação, dúvida, reclamação, cancelamento ou suspensão de contrato | No mesmo dia útil `[PROPOSTA]` | **5 dias corridos** `[PROPOSTA; base: Decreto 7.962/2013, art. 4º, parágrafo único]` | Quando o caso fechar. Avisar o cliente | Decreto 7.962/2013 (conferido). Se o Decreto 13.135/2026 se aplicar, o prazo para demandas não urgentes é de 7 dias corridos (art. 21). Vale o mais curto, 5 dias |
| Cobrança indevida ou serviço não solicitado | No mesmo dia útil `[PROPOSTA]` | Suspensão imediata; conclusão em até 48 horas `[CONDICIONAL: Decreto 13.135/2026, art. 21, §3º]` | Quando a cobrança for cancelada no Asaas | Decreto 13.135/2026, art. 21, §3º (lido na cópia da Câmara, em 2026-11-08) |
| Desistência (arrependimento) | No mesmo dia útil `[PROPOSTA]` | 5 dias corridos | Pagamento devolvido conforme a Política de Cancelamento (documento 04) | CDC, art. 49; Decreto 7.962/2013, art. 5º |
| Pedido de dados (LGPD) | Resposta em formato simplificado, imediatamente (art. 19, I) | **Declaração completa em até 15 dias corridos** do pedido (art. 19, II) | Quando o pedido for atendido | LGPD, art. 19 (conferido). Dobro para agente de pequeno porte: `[incerto: Resolução CD/ANPD nº 2/2022, art. 14, só em fonte secundária]` |
| Ordem judicial, notificação extrajudicial, pedido de autoridade | No dia do recebimento `[PROPOSTA]` | O prazo fixado no próprio documento | Quando cumprido e registrado | Advogado decide. Ver Q10 |
| Incidente com risco a alguém | Na hora, pela emergência (192 ou o número da região). Registro no mesmo dia `[PROPOSTA]` | Análise em até 5 dias corridos `[PROPOSTA]` | Conforme o plano de incidentes (documento 08) | Plano de incidentes (documento 08) |

### 4.2 Prioridades

- **P1 (resposta ao mesmo dia):** risco à pessoa, ordem judicial, notificação de incidente de dados, pedido de autoridade.
- **P2 (até 2 dias úteis para a primeira ação):** cobrança indevida, pagamento não reconhecido, suspeita de fraude, pedido de exclusão de conta com dúvida.
- **P3 (prazo normal de 5 dias corridos):** o restante.

---

## 5. Fluxo de atendimento para uma pessoa

### 5.1 Canais

| Canal | Uso | Estado |
|---|---|---|
| E-mail do SAC em caixa compartilhada (grupo ou alias do domínio da empresa) | Canal principal. Todo registro começa aqui | `[PLANEJADO]`. Caixa pessoal não serve: o histórico fica preso a uma pessoa |
| Página `/sac` com formulário de contato | Mesmo fluxo do e-mail | `[PLANEJADO]` |
| Concierge pelo WhatsApp (`VITE_CONCIERGE_WHATSAPP`) | Não é SAC. É a operação de pedidos sem backend, em `/pedido` | Não usar como SAC sem decisão (Q2) |
| Telefone ou WhatsApp do SAC | Só se o advogado disser que é necessário ou se o dono quiser | `[CONDICIONAL: Decreto 13.135/2026, art. 14, caput, torna o canal telefônico obrigatório se o decreto se aplicar]` |
| Formulário de exclusão ou de dados, na página `/sac` | Pedidos LGPD que não passam pelo app | `[PLANEJADO]`. Ver seção 7 |

### 5.2 Estados de cada demanda

```text
Recebida -> Triada -> Em análise -> Aguardando (cliente ou profissional) -> Resolvida
                                       \-> Encaminhada (advogado, encarregado, Procon, Consumidor.gov.br, autoridade)
                                                                            \-> Fechada
```

- **Triada:** registrar categoria (uma das 12 da seção 6, ou LGPD), prioridade e prazo de resposta.
- **Aguardando:** registrar a data em que o pedido foi feito ao outro lado. O prazo do consumidor não para se a resposta do profissional demorar (Q11 trata disso).
- **Encaminhada:** registrar para quem foi e a data.

### 5.3 Registro (planilha ou tabela interna)

Colunas mínimas:

| Coluna | Conteúdo | Cuidado |
|---|---|---|
| ID | Número sequencial, por ano | |
| Recebido em | Data e hora | |
| Canal | E-mail, formulário, outro | |
| Categoria | Uma das 12 da seção 6, ou LGPD | |
| Prioridade | P1, P2 ou P3 | |
| Atendimento | Número do atendimento (`booking_id`) ou da cobrança (`payments.id`) | Não copie CPF, número de cartão, senha nem código de acesso |
| Prazo de resposta | Data | |
| Situação | Estado da seção 5.2 | |
| Decisão e motivo | Texto curto | |
| Respondido em | Data | |
| Encaminhado a | Advogado, encarregado, órgão | |
| Provas | Link para pasta restrita | Não colar anexos na planilha |

Regras:
- Acesso restrito a quem atende o SAC. A planilha contém dados pessoais, por isso precisa entrar no registro de operações (documento 07) `[PROPOSTA]`.
- Retenção: mensagens por pelo menos 90 dias, e o histórico da demanda por pelo menos 6 meses depois de resolvida. Esses prazos vêm do Decreto 13.135/2026, arts. 18, §4º, II, e 19, e valem se o decreto se aplicar `[CONDICIONAL]`. Sem decreto aplicável, o prazo ainda precisa ser definido pelo advogado.

### 5.4 Quando encaminhar

| Situação | Para quem | Prazo |
|---|---|---|
| Risco à vida, à saúde ou à integridade de alguém | Emergência: 192 (SAMU) ou o número da região. Depois, o advogado | Na hora |
| Ordem judicial, notificação, pedido de imprensa | Advogado | No dia do recebimento |
| Pedido LGPD que negue eliminação ou envolva dados de terceiro | Encarregado | Antes do prazo de 15 dias corridos |
| Suspeita de incidente de segurança com dados | Encarregado e advogado, pelo plano do documento 08 | Conforme o documento 08 |
| Demanda não resolvida depois de 5 dias corridos | Consumidor.gov.br, se a empresa estiver na plataforma, ou Procon | Cliente escolhe |

---

## 6. Modelos de resposta: 12 casos mais prováveis

Cada modelo tem: quando usar, o que conferir antes, o texto e o que **não** escrever. Os textos são para copiar e ajustar. Substitua os colchetes. Não cite a lei na resposta ao cliente, a não ser que a seção peça. Não prometa resultado nem prazo que a equipe não controla.

Regras comuns a todos:
- Nunca peça número de cartão, senha de banco, código de acesso (OTP) ou senha da conta. O WorkEasy não recebe número de cartão: o pagamento acontece na página do Asaas.
- Não revele a outra parte (cliente ou profissional) além do necessário para responder.
- Não diga que o profissional é culpado, nem que é seguro, antes da análise.

### T1. Profissional não compareceu

- **Quando usar:** o cliente diz que o profissional não foi ao horário.
- **Conferir antes:** status do atendimento (`bookings.status`); se houve check-in, no caso de plantão; se houve pagamento (`payments`). **Não existe marcação de não comparecimento no app** (`[PLANEJADO]`, conforme documento 04, cláusula 4.8). A única marcação de falta é `shift_status = no_show`, que vale só para plantão de cuidado.
- **Texto:**
  > Olá, [NOME]. Recebemos seu relato sobre o atendimento de [DATA], número [NÚMERO]. Vamos ouvir o profissional e analisar o caso. Respondemos com a decisão em até 5 dias corridos. Se você já pagou, envie o comprovante do pagamento nesta mesma resposta. `[CONDICIONAL: depende de parecer quanto à devolução neste caso; ver documento 04, cláusula 5.5]`
- **Não escrever:** "vamos devolver o valor" antes da análise; "o profissional foi punido".

### T2. Divergência de preço

- **Quando usar:** o valor cobrado é diferente do combinado ou da proposta.
- **Conferir antes:** `services.price_min_cents` e `price_max_cents`; `proposals.price_cents` da proposta aceita; `payments.amount_cents` cobrado. O combinado no chat fora do app não está no sistema: peça a conversa.
- **Texto:**
  > Olá, [NOME]. Recebemos sua dúvida sobre o valor do atendimento [NÚMERO]. No app, o valor da proposta aceita é R$ [VALOR DA PROPOSTA] e o valor cobrado foi R$ [VALOR COBRADO]. Vamos conferir com o profissional o que foi combinado e responder em até 5 dias corridos. Se houver cobrança errada, tratamos como indicado nos Termos de Uso, item 6.7.
- **Não escrever:** "o preço é fixo"; "o profissional não pode cobrar mais" (depende do acordo).

### T3. Pagamento não reconhecido

- **Quando usar:** o cliente diz que pagou, mas o app mostra cobrança em aberto ou cancelada.
- **Conferir antes:** `payments` pelo `booking_id` (status `pending`, `confirmed`, `received`, `held`, `released`, `refunded`, `failed` ou `canceled`) e o `asaas_payment_id`. **Não use `select *`** nem abra `payments.raw`: o payload pode ter dados do pagador, e o acesso do admin a ele fica registrado (`admin_get_payment_raw`). Confira no painel do Asaas, com o ID da cobrança.
- **Texto:**
  > Olá, [NOME]. Estamos conferindo o pagamento do atendimento [NÚMERO]. Hoje, no app, o status é [STATUS]. Para localizar o pagamento, precisamos de [comprovante, identificador da transação Pix ou o e-mail usado no pagamento]. Não precisamos do número do seu cartão, da senha do banco nem de códigos de acesso, e você não deve enviá-los por e-mail ou WhatsApp.
- **Não escrever:** "o pagamento está garantido"; "seu dinheiro já voltou" antes de conferir.

### T4. Pedido de reembolso ou de desistência

- **Quando usar:** o cliente quer cancelar depois de pagar, ou desistir da contratação.
- **Conferir antes:** data da contratação e data do serviço; forma de pagamento (Pix, cartão ou boleto); se o atendimento já foi cancelado (quando é cancelado depois de pago, o app pede o estorno total ao Asaas: `ARQUITETURA.md`, "Webhook"). O estorno de Pix depende de saldo na conta (documento 04).
- **Texto:**
  > Olá, [NOME]. Recebemos seu pedido de [cancelamento / desistência / reembolso] do atendimento [NÚMERO], feito em [DATA]. Vamos analisar o pedido e responder em até 5 dias corridos. Se o pedido for aceito, a devolução segue a Política de Cancelamento, Reembolso e Garantia (documento 04). `[CONDICIONAL: depende de parecer quanto a serviço já iniciado ou executado.]` Se a cobrança foi no cartão, comunicamos seu pedido à administradora, como exige o Decreto 7.962/2013, art. 5º, §3º `[CONDICIONAL: quem faz a comunicação, ver Q5]`. Se foi boleto, pediremos seus dados bancários para a devolução.
- **Não escrever:** prazos de devolução em dias ou horas que o Asaas não informou (o próprio documento 04 marca o prazo do cartão como `[incerto]`).

### T5. Exclusão de conta

- **Quando usar:** o usuário pede a exclusão pelo e-mail.
- **Conferir antes:** a função `account-delete` recusa com 409 `active_bookings` se houver atendimento `accepted`, `paid`, `in_progress` ou `disputed`. Ela cancela a assinatura Pro e as cobranças abertas no Asaas. Pagamentos e atendimentos ficam anonimizados (`anonymize_user`). Os pedidos ficam em `data_requests`.
- **Texto:**
  > Olá, [NOME]. Você pode excluir sua conta sozinho: em "Minha conta", na opção "Excluir minha conta", digite EXCLUIR para confirmar. Antes disso, a conta precisa estar sem atendimento aceito, pago, em andamento ou em contestação. Ao excluir, apagamos ou anonimizamos seus dados pessoais. Pagamentos e atendimentos continuam guardados, sem identificar você, `[incerto: base legal e prazo de guarda a confirmar]`. Se você não consegue entrar na conta, responda este e-mail. Antes de fazer qualquer alteração, vamos confirmar a sua identidade `[PLANEJADO: processo de confirmação]`.
- **Não escrever:** "excluímos tudo" (não é verdade: pagamentos ficam); "a lei fiscal obriga 5 anos" (prazo não conferido).

### T6. Cópia dos dados

- **Quando usar:** o titular pede uma cópia dos seus dados.
- **Conferir antes:** a cópia sai pela função `account-export`, em JSON, e é pedida em "Minha conta". Só o titular logado recebe a própria cópia. Pedido por e-mail: confirmar a identidade antes de enviar.
- **Texto:**
  > Olá, [NOME]. Você pode baixar uma cópia dos seus dados em "Minha conta", na seção de cópia dos dados. O arquivo sai em JSON, no formato do WorkEasy. Se não consegue entrar na conta, responda este e-mail e confirmaremos a sua identidade antes de enviar qualquer dado. Responderemos em até 15 dias corridos, pela declaração completa prevista na LGPD, art. 19, II.
- **Não escrever:** "enviamos em 24 horas"; "é o formato padrão da LGPD" (o JSON é formato próprio, `[incerto]`).

### T7. Contestação de avaliação

- **Quando usar:** o profissional ou o cliente quer contestar uma avaliação.
- **Conferir antes:** a avaliação em `reviews` (texto, nota, `published`). Só o admin muda `published`. O autor edita nota e texto. **Não há botão de denúncia de avaliação no app** (busca em `pages/` e `components/`). Pedido só pelo SAC. Política: documento 05.
- **Texto:**
  > Olá, [NOME]. Recebemos sua contestação da avaliação do atendimento [NÚMERO]. Vamos analisá-la com base na Política de Avaliações e Moderação e nas provas que você enviou. Não editamos o texto de quem avaliou. Se a avaliação violar as regras ou a lei, a equipe pode ocultá-la, e quem a escreveu não consegue publicá-la de novo. Respondemos em até 5 dias corridos.
- **Não escrever:** "a avaliação será removida" antes da análise; "avaliação verificada" (a palavra "verificada" não pode aparecer como selo).

### T8. Suspeita de fraude

- **Quando usar:** alguém relata golpe, conta invadida, ou o sistema sinaliza atividade estranha.
- **Conferir antes:** `booking_events`, `audit_log` (ações do cliente e do prestador) e o status do prestador (`providers.status`). Não revele os critérios de análise para não facilitar fraude.
- **Texto para a conta afetada:**
  > Olá, [NOME]. Recebemos um aviso de atividade suspeita na sua conta. Por segurança, limitamos [o recurso] enquanto analisamos. Não enviaremos seu código de acesso por nenhum canal. Para recuperar o acesso, responda este e-mail pelo endereço cadastrado. A suspensão e o bloqueio seguem os Termos de Uso, item 3.6.
- **Texto para quem denunciou:**
  > Olá, [NOME]. Recebemos sua denúncia sobre [PERFIL OU ATENDIMENTO]. Analisamos o caso. Se houver violação dos Termos, tomamos a medida prevista neles. Não compartilhamos dados de terceiros nesta resposta.
- **Não escrever:** "sua conta foi invadida" sem prova; "é golpe" antes da análise.

### T9. Assédio ou ameaça

- **Quando usar:** alguém relata ofensa, ameaça ou perseguição, dentro ou fora do app.
- **Conferir antes:** se há conteúdo dentro do app (mensagens e avaliações). Conversa fora do app (WhatsApp, por exemplo) não fica no sistema: peça as provas. Se houver risco imediato, use T10.
- **Texto:**
  > Olá, [NOME]. Lamentamos o que você passou. Pedimos que guarde as provas: prints com data e hora, nome do perfil e número do atendimento. Vamos analisar a conduta com base nos Termos de Uso, item 10, e podemos suspender a conta envolvida. Se houver ameaça, você pode registrar boletim de ocorrência. Só entregamos registros de conta a uma autoridade quando a lei ou uma ordem judicial exigir. `[CONDICIONAL: depende de parecer sobre a identificação do autor, ver Q9.]`
- **Não escrever:** "vamos identificar quem fez isso"; "a pessoa será banida" antes da análise.

### T10. Incidente de segurança na casa

- **Quando usar:** acidente, agressão, furto, risco ou ocorrência durante um atendimento ou plantão em domicílio.
- **Primeira resposta, sempre:** se alguém precisa de socorro, ligue 192 (SAMU, gratuito, 24 horas) ou o número de emergência da sua região. Em caso de crime, ligue para a polícia (190) `[incerto: número não conferido nesta sessão]`.
- **Conferir antes:** atendimento ou plantão (`bookings` ou `shifts`), profissional envolvido, horário, local (check-in tem latitude e longitude só em plantão de cuidado). Preserve as provas. Se houver dado pessoal de terceiros, avise o encarregado e o advogado, pelo plano de incidentes (documento 08).
- **Texto:**
  > Olá, [NOME]. Sentimos muito pelo que aconteceu. Se alguém está em risco, ligue 192 ou o número de emergência da sua região. Guarde as provas: mensagens, fotos, nome do profissional e horário. Registramos o caso. [Se aplicável: suspendemos o profissional enquanto apuramos.] Vamos responder em até 5 dias corridos. Este canal não substitui atendimento médico nem policial. `[CONDICIONAL: a cobertura de seguro depende de decisão do dono e de parecer. Não há apólice registrada no repositório. Não diga que há cobertura.]`
- **Não escrever:** "o profissional é seguro ou verificado"; "estamos cobertos por seguro"; nenhum dado de saúde ou diagnóstico (o módulo de cuidado não guarda dados clínicos).

### T11. Reclamação de conselho profissional ou de publicidade regulada

- **Quando usar:** um conselho de classe, um órgão de defesa ou o próprio profissional questiona um anúncio, um perfil ou a oferta de uma ocupação regulada.
- **Conferir antes:** a ocupação na política (`occupation_policies.regulated`, `regulator_body`); o perfil ou anúncio; o pedido por escrito; a competência do órgão. **A matriz por conselho (Frente A) não está no repositório**, então qualquer afirmação sobre regra de conselho fica `[incerto]`.
- **Texto:**
  > Olá, [NOME DO ÓRGÃO]. Recebemos sua comunicação sobre [PERFIL OU ANÚNCIO] [link]. Pedimos que a comunicação seja por escrito e indique o conteúdo e a infração apontada. Analisamos o pedido. Se ele identificar a infração, podemos ocultar o conteúdo, e avisamos o profissional com o motivo. Respondemos em até 5 dias corridos ou no prazo fixado pelo órgão. `[CONDICIONAL: depende de parecer por conselho.]`
- **Não escrever:** que o WorkEasy "é aprovado" ou "está em conformidade" com um conselho.

### T12. Imprensa, ordem judicial ou notificação extrajudicial

- **Quando usar:** chega uma ordem de juiz, uma notificação de advogado de outra parte, ou um pedido de jornalista.
- **Conferir antes:** órgão, número do processo, data, prazo e a identificação clara do conteúdo. Envie o documento ao advogado no dia do recebimento `[PROPOSTA]`. Não responda sobre o mérito sem ele. O texto do art. 19 do Marco Civil da Internet não foi conferido nesta sessão (`[incerto]`, ver Q9 e a nota do documento 05).
- **Texto, ordem judicial:**
  > Recebemos a ordem do [ÓRGÃO], processo [NÚMERO], de [DATA], com prazo de [PRAZO]. Encaminhamos ao nosso advogado, que responderá no prazo. Se a ordem não identificar com clareza o conteúdo, pedimos que ela seja complementada.
- **Texto, notificação extrajudicial:**
  > Recebemos sua notificação. Ela foi encaminhada à nossa equipe jurídica, que responderá pelos canais indicados. Este recebimento não implica reconhecimento de nenhum fato. `[CONDICIONAL: depende de parecer.]`
- **Texto, imprensa:**
  > Obrigado pelo contato. O WorkEasy não comenta casos individuais. Para perguntas institucionais, use [CANAL DE IMPRENSA, decisão do dono].
- **Não escrever:** dados pessoais de quem pediu ou de quem é citado; nenhuma especulação sobre o caso.

---

## 7. Pedidos de titulares (LGPD) no mesmo fluxo

Os pedidos de dados entram pelo mesmo SAC, mas em categoria própria. O encarregado recebe as reclamações dos titulares e adota providências (LGPD, art. 41, §2º, I, conferido).

| Pedido | Como é atendido hoje | Prazo | Base |
|---|---|---|---|
| Confirmação de existência ou acesso aos dados | SAC (resposta) | Imediatamente, em formato simplificado (art. 19, I); declaração completa em até 15 dias corridos (art. 19, II) | LGPD, art. 18, II, e art. 19, I e II (conferido) |
| Cópia dos dados (portabilidade) | "Minha conta", cópia em JSON. Pedido por SAC só com confirmação de identidade | 15 dias corridos, se pedido pelo SAC | LGPD, art. 18, V (conferido) |
| Correção | Em "Minha conta": nome, telefone e cidade. Outros dados pelo SAC | `[PROPOSTA]` | LGPD, art. 18, III (conferido: "correção de dados incompletos, inexatos ou desatualizados") |
| Eliminação | "Minha conta", "Excluir minha conta". Pedido por SAC com confirmação de identidade | 15 dias corridos para a resposta | LGPD, art. 18, VI, conferido: vale para dados tratados com consentimento, ressalvado o art. 16 |
| Revogação de consentimento | Não há tela própria. O histórico de consentimentos é só de inclusão (`consents`), e uma nova decisão registra a revogação | `[PLANEJADO: tela de revogação]` | Política de Privacidade (documento 03) |

Procedimento:
1. **Entrada.** O pedido chega ao SAC ou ao formulário de `/sac` e recebe a categoria "LGPD".
2. **Identidade.** Pedido feito por quem está logado no app dispensa confirmação extra. Pedido por e-mail precisa de confirmação pelo endereço cadastrado. Ninguém altera dados pelo e-mail sem essa confirmação `[PLANEJADO: processo de confirmação de identidade]`.
3. **Registro.** Anote na planilha. Quando o pedido passa pelo app, o registro também fica em `data_requests` (`kind` = `export` ou `delete`, `status` = `pending`, `processing`, `completed` ou `failed`). Hoje o pedido feito fora do app não tem registro no sistema `[PLANEJADO]`. A tela `/admin/lgpd` é só leitura.
4. **Resposta.** Declaração completa em até 15 dias corridos. Se o advogado confirmar o prazo em dobro para agente de pequeno porte (Resolução CD/ANPD nº 2/2022, não reaberta), o prazo muda `[incerto]`.
5. **Recusa.** Se a eliminação for recusada (por exemplo, pela guarda de registros fiscais), a resposta diz o motivo e a base legal, e o encarregado revisa antes de enviar.
6. **Incidente.** Se o pedido revelar vazamento ou acesso indevido, aplique o plano do documento 08.

Atenção: no módulo de cuidado, a família cadastra o nome e o ano de nascimento de um assistido, além de contato de emergência. Quando um pedido de dados envolve esse assistido, quem pede pode não ser o titular. Ver Q12.

---

## 8. Lacunas do produto hoje (não corrigidas aqui)

Esta seção lista o que o código não faz, para o dono decidir. Este documento não altera código.

| # | Lacuna | Onde | Efeito |
|---|---|---|---|
| L1 | Rodapé sem CNPJ, endereço nem SAC enquanto as variáveis `VITE_COMPANY_*` não estiverem preenchidas; no modo demonstração, nenhum dado | `apps/web/components/SiteFooter.tsx` | Não atende o Decreto 7.962/2013, art. 2º (se aplicável) |
| L2 | Rota `/sac` existe, mas com texto provisório ("Documento em elaboração") e sem canal de contato | `config/legal.ts`, `content/legal/sac.md` | Não há página de atendimento de verdade |
| L3 | `pages/conta/Entrar.tsx` e `components/TermsGate.tsx` apontam para `/legal`, que diz "Documentos em elaboração" | `pages/LegalDocs.tsx`, `pages/conta/Entrar.tsx`, `components/TermsGate.tsx` | Usuário não lê o texto |
| L4 | Não há botão para denunciar perfil ou avaliação | busca em `pages/` e `components/` | A denúncia só funciona por e-mail, sem registro |
| L5 | Não há cancelamento de atendimento pago pelo app | `transition_booking` (cliente só `requested` e `accepted`) | Depende do SAC |
| L6 | Não há marcação de "profissional não compareceu" para atendimento | `booking_status` não tem esse estado | Não há prova no sistema |
| L7 | Pedido de dados fora do app não tem caminho no sistema | `/admin/lgpd` é só leitura | Pedido por e-mail fica só na planilha |
| L8 | Não há página pública de exclusão de conta, exigida pela Google Play | Google Play, política de exclusão | Bloqueia a publicação no Android |
| L9 | Exclusão e exportação só funcionam com backend ligado | `pages/conta/Conta.tsx` (texto de demonstração) | Em demonstração, o botão não age |
| L10 | Não há fluxo de comunicação à administradora do cartão quando há arrependimento (Decreto 7.962/2013, art. 5º, §3º) | `DECISOES.md` e documento 04 | Quem comunica o cartão fica indefinido |
| L11 | Decreto 11.034/2022 (SAC), revogado pelo Decreto 13.135/2026, art. 24, aparece só nas listas internas de fontes dos documentos 01 e 02. Nenhum texto para publicar o cita | `docs/juridico/01-termos-de-uso.md` (lista de fontes não abertas), `02-termos-do-prestador.md` (nota de fontes); `04` (A4) diz o contrário | Divergência entre documentos: o documento 04, A4, deve ser corrigido. Não corrigido aqui (documentos de outra frente) |

---

## Pontos para o advogado

### A. Perguntas abertas

**Q1. Escopo do Decreto 7.962/2013.** A ementa diz que ele regulamenta o CDC "para dispor sobre a contratação no comércio eletrônico" (lida na Câmara, sem revogação expressa). O serviço contratado pelo app entra nesse conceito? Os arts. 1º e 3º não foram lidos nesta sessão `[incerto]`.

**Q2. Escopo do Decreto 13.135/2026.** O art. 1º, parágrafo único, alcança fornecedores de serviços regulados pelo Poder Executivo federal e serviços financeiros de pagamento ou crédito digitais sujeitos ao Banco Central. O art. 2º alcança os "fornecedores que operem plataformas digitais de intermediação da oferta ou comercialização de produtos ou serviços por terceiros", lido na cópia da Câmara. O WorkEasy se enquadra no art. 2º? Se sim:
- Enviar à Senacon os modelos de atendimento, com número de reclamações, taxa de resolução, índice de reclamações em órgãos do SNDC e grau de satisfação `[incerto: os incisos foram lidos em resumo]`.
- Atendimento humano em tempo real, 8h às 20h, todos os dias, nos canais eletrônicos (art. 12, §1º), e canal telefônico obrigatório (art. 14, caput; o §1º não foi lido).
- Se WhatsApp ou e-mail contam como canal eletrônico com atendimento em tempo real `[incerto]`.
- Fontes secundárias divergem sobre o escopo: a ALMG fala em setores regulados federais, e o MJ não traz essa limitação. Confirmar no DOU de 13/10/2026, Seção 1, p. 5 `[incerto]`.

**Q3. Prazo de resposta.** O Decreto 7.962/2013, art. 4º, parágrafo único, dá cinco dias. O Decreto 13.135/2026, art. 21, dá sete dias corridos para demandas não urgentes. A proposta de cinco dias atende aos dois. Confirmar.

**Q4. Cancelamento de atendimento pago.** O Decreto 7.962/2013, art. 5º, §1º, fala em "mesma ferramenta utilizada para a contratação, sem prejuízo de outros meios". O Decreto 13.135/2026, art. 20, §1º, I, diz que o pedido deve ser recebido e processado pelo SAC e por todos os meios e canais usados para a contratação, "pelo mesmo menu eletrônico ou pela mesma modalidade de atendimento", vedada a exigência de "acesso a outro menu, atendente ou canal". O art. 20, §1º, II, diz que os efeitos são imediatos, salvo processamento técnico justificado. O SAC por e-mail basta, ou o app precisa de botão? Isso vale para serviço já iniciado?

**Q5. Arrependimento e comunicação ao cartão.** O CDC, art. 49, dá 7 dias da contratação ou do recebimento do serviço, quando a contratação é fora do estabelecimento. Vale para serviço já começado ou feito? O Decreto 7.962/2013, art. 5º, §3º, manda o fornecedor comunicar a desistência ao emissor do cartão. Quem comunica: o WorkEasy, o Asaas, ou o profissional, quando a cobrança é da conta dele?

**Q6. Papel do WorkEasy.** O WorkEasy é intermediário, fornecedor do serviço, ou outra posição? A resposta muda quem responde pelo SAC sobre a execução do serviço (documento 04, A1).

**Q7. Encarregado.** A LGPD, art. 41, exige encarregado. A Resolução CD/ANPD nº 2/2022 dispensa o encarregado para agente de pequeno porte, fora do alto risco, segundo fontes secundárias `[incerto: art. 11 não lido]`. A Resolução CD/ANPD nº 18/2024 regula o encarregado (não aberta). A empresa indica encarregado desde o início?

**Q8. Prazo LGPD.** A declaração completa tem 15 dias (art. 19, II, conferido). A Resolução CD/ANPD nº 2/2022, art. 14, daria prazo em dobro a pequeno porte. Só fonte secundária `[incerto]`. Para o WorkEasy, qual regime vale, dado o art. 3º da resolução, que exclui alguns agentes?

**Q9. Identificação de autor e remoção de conteúdo.** Quando é possível entregar a identidade de quem avaliou ou assediou? O art. 19 do Marco Civil da Internet não foi conferido nesta sessão (Planalto bloqueado, PDF da Câmara ilegível) `[incerto]`. O STF discute a regra do art. 19: o documento 05 traz o que foi lido, e o status segue `[incerto]`.

**Q10. Pedidos de autoridades e ordens judiciais.** Qual é o formulário mínimo para um pedido de conselho ou do Procon? Quais são os prazos das ordens judiciais?

**Q11. Consumidor.gov.br.** Pelo termo de adesão (cláusula Quarta, itens 4 e 6, conferido), a empresa deve acompanhar as reclamações todo dia e responder em até 10 dias, contados do registro, sem suspensão por pedido de informação complementar. A adesão é voluntária, segundo resultado de busca `[incerto]`. Vale aderir antes do lançamento?

**Q12. Dados de assistido no módulo de cuidado.** Quando a família cadastra um assistido (idoso), quem é o titular, quem é controlador e quem é operador? Pedidos sobre esses dados vêm da família ou do próprio assistido?

**Q13. Registros do SAC.** A planilha de atendimento guarda dados pessoais. Qual prazo de guarda vale: 90 dias para mensagens e 6 meses para o histórico (Decreto 13.135/2026, arts. 18, §4º, II, e 19, se aplicável), ou outro prazo? Como ficam a minimização e o acesso restrito?

**Q14. Contestação de avaliação.** O prazo para contestar avaliação (`[DECISÃO DO DONO]`, proposta de 7 dias corridos do documento 05) precisa de parecer?

### B. Itens [incerto] (lista completa)

1. Resolução CD/ANPD nº 2/2022, art. 14 (prazo em dobro) e art. 11 (dispensa de encarregado): só fontes secundárias, não abri o texto oficial.
2. Resolução CD/ANPD nº 18/2024 (encarregado): não aberta.
3. Decreto 13.135/2026: reaberto na cópia da Câmara em 2026-11-08, mas lido em resumo da ferramenta, não no texto integral. Conferir no DOU de 13/10/2026, Seção 1, p. 5. Vigência de 2/11/2026 é cálculo de 20 dias corridos (art. 25), e uma notícia de MG dá a mesma data.
4. Decreto 13.135/2026, art. 15, I (20 segundos para 80% das demandas e 300 segundos para as demais): lido em resumo na cópia da Câmara. Conferir no DOU.
5. Decreto 13.135/2026, art. 18, §4º, I (histórico em cinco dias úteis, quando pedido): lido em resumo na cópia da Câmara. Não se confunde com a resposta do SAC em 5 dias corridos, mas o advogado deve confirmar a regra. Conferir.
6. Decreto 13.135/2026, art. 1º, parágrafo único: divergência entre ALMG e MJ sobre o escopo.
7. Decreto 7.962/2013, arts. 1º e 3º: não lidos (só a ementa).
8. CDC, art. 49 para serviço já iniciado ou executado: não resolvido.
9. LGPD, art. 18, III (correção): conferido na cópia da Câmara em 2026-11-08. Sem pendência.
10. Prazo de guarda fiscal de pagamentos: não aberto. LGPD, art. 16, I, lido em 2026-11-08, só remete à obrigação legal, sem prazo.
11. Marco Civil da Internet, art. 19: Planalto bloqueado e PDF da Câmara ilegível. Status do STF: não conferido.
12. Número 190 (polícia): não conferido nesta sessão.
13. Consumidor.gov.br: a cláusula Quarta, itens 4 e 6 (10 dias; sem suspensão) foi conferida em 2026-11-08, mas o termo não diz que a adesão é voluntária (regra de resultado de busca). O prazo de 20 dias para o consumidor avaliar a resposta não foi conferido.
14. Apple: se o campo Privacy Policy URL é obrigatório. Não conferido.
15. Google Play: campo de URL de exclusão no formulário de segurança de dados (Data safety). Visto só em resultado de busca.
16. Lojas: regras mudam. Conferir de novo na data da submissão.
17. Procon municipal: base legal da estrutura municipal não conferida.
18. Sumário do contrato antes da contratação (Decreto 7.962/2013, art. 4º, I): nenhuma menção a sumário nas buscas em `pages`, `services` e `components`; telas de pedido e agendamento não abertas.
19. Custos e prazos de estorno (Pix, cartão, boleto): não conferidos com o Asaas.
20. Decreto 11.034/2022 (SAC): não aberto. A revogação pelo art. 24 do Decreto 13.135/2026 foi lida na cópia da Câmara; se o advogado aplicar o 11.034, o texto precisa ser conferido.
21. LGPD, art. 19, II: o texto diz "até 15 (quinze) dias", sem "corridos". Os prazos deste documento usam "dias corridos" por cautela; confirmar.
22. Apple, 5.1.1: a página de ajuda diz que apps fora de setor altamente regulado "should not require" ligação, e-mail, chat ou outro fluxo de suporte. A página principal da diretriz não traz essas frases.
23. Resolução CD/ANPD nº 2/2022 (arts. 11 e 14) e nº 18/2024: não reabertas nesta revisão (busca de fontes esgotada; sem URL primária aberta). Continuam só como pista.

---

## Fontes consultadas

Todas abertas em 2026-11-08. Quando o texto foi lido em resumo de ferramenta, a coluna "Trecho" diz isso. Os textos devem ser conferidos no original antes da publicação.

| # | URL | Norma ou página | Trecho usado | Situação |
|---|---|---|---|---|
| 1 | https://www2.camara.leg.br/legin/fed/decret/2013/decreto-7962-15-marco-2013-775557-publicacaooriginal-139266-pe.html | Decreto nº 7.962, de 15/03/2013 (texto original, Câmara) | Art. 2º caput e I, II; art. 4º caput, I, V e parágrafo único; art. 5º caput, §1º, §3º | Texto lido |
| 2 | https://www2.camara.leg.br/legin/fed/decret/2013/decreto-7962-15-marco-2013-775557-norma-pe.html | Decreto 7.962/2013, página de metadados (Câmara) | Ementa; publicação no DOU de 15/03/2013; "não consta revogação expressa" | Metadados |
| 3 | https://www2.camara.leg.br/legin/fed/decret/2026/decreto-13135-9-outubro-2026-800053-publicacaooriginal-181591-pe.html | Decreto nº 13.135, de 9/10/2026 (texto original, Câmara) | Art. 1º (caput e parágrafo único); art. 2º; art. 12, §1º; art. 13, caput e §1º, I e II; art. 14, caput (§1º não lido); art. 15, I; art. 18, §4º, I e II; art. 19; art. 20, §1º, I e II; art. 21, caput e §3º; art. 24 (revoga o Decreto 11.034/2022); art. 25 (vigência de 20 dias) | Reaberto em 2026-11-08 (quatro consultas), em resumo da ferramenta sobre a cópia da Câmara. Conferir no DOU |
| 4 | https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d13135.htm | Decreto 13.135/2026 (Planalto) | Tentativa de acesso | Bloqueado ("Acesso Negado") |
| 5 | https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm | Decreto 7.962/2013 (Planalto) | Tentativa de acesso | Bloqueado |
| 6 | https://www.planalto.gov.br/ccivil_03/leis/l8078compilado.htm | Lei 8.078/1990 (Planalto) | Tentativa de acesso | Bloqueado |
| 7 | https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-normaatualizada-pl.html | Lei 8.078/1990 (CDC), texto atualizado (Câmara) | Art. 49, caput e parágrafo único; art. 55, caput; art. 56, caput. A página é longa: li até o caractere 100.000 | Texto lido |
| 8 | https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html | Lei 13.709/2018 (LGPD), texto atualizado (Câmara) | Art. 16, caput e I; art. 18, II, III, V e VI; art. 19, I e II; art. 41, §2º, I a IV (reabertos em 2026-11-08); art. 48, caput (não reaberto) | Texto lido |
| 9 | https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm | LGPD (Planalto) | Tentativa de acesso | Bloqueado |
| 10 | https://www2.camara.leg.br/legin/fed/lei/2014/lei-12965-23-abril-2014-778833-normaatualizada-pl.html | Marco Civil da Internet (Câmara) | Tentativa de acesso | Erro 404 (Câmara). Planalto (Lei 12.965, 2026-11-08): "Acesso Negado" |
| 11 | https://bd-rest.camara.leg.br/server/api/core/bitstreams/ea28a381-b25f-4b37-946d-993b1f9c9560/content | Marco Civil da Internet, publicação da Câmara (PDF) | Art. 19 | PDF ilegível; não usado |
| 12 | https://www.consumidor.gov.br/pages/principal/termo-adesao-compromisso | Termo de adesão do fornecedor, Consumidor.gov.br | Cláusula Quarta, itens 4 e 6 | Texto lido |
| 13 | https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/ | Apple App Review Guideline 5.1.1(v) | Exclusão no app (diretriz 5.1.1(v), texto em developer.apple.com/app-store/review/guidelines/); na página de ajuda: link direto ao site quando a exclusão exige site; apps fora de setor altamente regulado "should not require" ligação, e-mail, chat ou outro fluxo de suporte | Texto lido em 2026-11-08 |
| 14 | https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/ | Apple App Store Connect, Support URL | Campo obrigatório; página com contato real; URL com protocolo | Texto lido |
| 15 | https://developer.apple.com/help/app-store-connect/reference/app-information/required-localizable-and-editable-properties | Apple App Store Connect, propriedades obrigatórias | Não trouxe a descrição de Privacy Policy URL | Lido sem resultado |
| 16 | https://support.google.com/googleplay/android-developer/answer/13327111?hl=en | Google Play, requisitos de exclusão de conta | Opção no app em lugar de destaque; link web funcional que cita o app ou o desenvolvedor e permite pedir a exclusão sem voltar ao app. Não trata de desativação | Texto lido em 2026-11-08 (limite de citação) |
| 17 | https://support.google.com/googleplay/android-developer/answer/10144311?hl=en | Google Play, política de dados do usuário | Link de política de privacidade na Play Console e no app; conteúdo mínimo | Texto lido (limite de citação) |
| 18 | https://www.gov.br/saude/pt-br/assuntos/saude-de-a-a-z/s/samu-192 | Ministério da Saúde, SAMU 192 | "gratuito, acessado pelo número 192, funciona 24 horas por dia e 07 dias por semana" | Texto lido |
| 19 | https://www.lexml.gov.br/urn/urn:lex:br:federal:decreto:2013-03-15;7962 | Lexml, Decreto 7.962/2013 | Ementa e publicação. Sem texto dos artigos | Metadados |

Fontes secundárias usadas só como pista, sem texto lido (não citar como norma):
- Mattos Filho, Teletime, Consumidor Moderno, KLA Law, LegJur (403), Atlas Público: notícias sobre o Decreto 13.135/2026.
- ALMG, notícia sobre vigência em 2/11/2026 e escopo.
- MJ, notícia "Novo decreto do SAC amplia proteção ao consumidor" (gov.br/mj), resultado de busca.
- Demarest, Felsberg, Velloza, Migalhas, Confidata, Lefosse: resumos da Resolução CD/ANPD nº 2/2022.
