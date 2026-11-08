# Política de Avaliações e Moderação

> **Rascunho para revisão de advogado. Não é parecer jurídico.**

| Campo | Valor |
|---|---|
| Versão | 2026-10-rascunho (mesma edição de `config/legal.ts`; este documento não tem entrada própria nele) |
| Data do rascunho | 2026-11-08 |
| Vigência | [DATA DE VIGÊNCIA] |
| Controladora | [RAZÃO SOCIAL], [CNPJ], [ENDEREÇO]. Empresa de tecnologia a ser criada pelo titular, separada da clínica dele. |
| Contato para avaliações e contestações (SAC) | [E-MAIL DO SAC] |
| Encarregado (LGPD) | [E-MAIL DO ENCARREGADO] |

---

## Como ler

- Cada regra é uma cláusula numerada (por exemplo, 2.2).
- **Sem marca:** a regra já existe no produto. Conferido no código de `apps/web` em 2026-11-08.
- **[PLANEJADO]:** a regra não existe no produto. A política só vale depois que isso for feito.
- **[CONDICIONAL: depende de parecer]:** a resposta depende de análise jurídica.
- **[incerto]:** não consegui confirmar em fonte primária aberta. A lista completa está em "Pontos para o advogado".
- **[DECISÃO DO DONO]:** prazo ou regra de negócio. O número escrito é uma proposta, não uma exigência legal.
- Os Termos de Uso (documento 01, cláusula 8) e os Termos do Prestador (documento 02, cláusulas 8 e 13.6) repetem estas regras. Se mudar uma regra aqui, mude lá também.

---

## Resumo em uma tela

1. Só quem contratou pelo app avalia, depois que o atendimento foi concluído ou liberado e pago pelo app. Uma avaliação por atendimento.
2. A avaliação é uma nota de 1 a 5 e um comentário opcional de até 1.000 caracteres.
3. Em profissões em que o WorkEasy não classifica por nota, a avaliação fica oculta do público. Ela aparece só para o autor, para o profissional e para a equipe.
4. A busca ordena por nota só onde a ocupação permite. O plano Pro não muda a posição de ninguém.
5. A equipe pode ocultar avaliação que viole as regras ou a lei. O autor não consegue publicá-la de novo.
6. Hoje não há tela de moderação, registro de motivo, aviso ao autor, botão de denúncia nem filtro de conteúdo. Esses itens estão na seção 13.

---

## 1. Quem pode avaliar e quando

### 1.1 Condições (todas precisam ser verdadeiras)

| # | Condição | Onde é conferido | Estado hoje |
|---|---|---|---|
| a | O atendimento foi combinado pelo app (origem `platform`), e não lançado pelo próprio profissional no CRM | `private.check_review()`, trigger `reviews_check` | Conferido no banco |
| b | O atendimento está `completed` ou `released` | idem | Conferido no banco |
| c | Existe pagamento do atendimento com status `received`, `confirmed` ou `released` | idem | Conferido no banco. Os status `pending`, `held`, `refunded`, `failed` e `canceled` não bastam. |
| d | Quem avalia é o cliente do atendimento | política `reviews_insert_own` e `check_review` | Conferido no banco |
| e | Cliente e profissional não são a mesma pessoa | `check_review` | Conferido no banco |
| f | Uma avaliação por atendimento | `reviews.booking_id` é único | Conferido no banco |

### 1.2 Regras

1.1 Uma avaliação é uma nota inteira de 1 a 5. O cliente pode acrescentar um comentário de até 1.000 caracteres.

1.2 Só pode avaliar quem contratou pelo app. O atendimento precisa estar concluído ou liberado e ter pagamento recebido pelo app (tabela 1.1, itens a a c).

1.3 O profissional não avalia o cliente. Não existe essa função hoje.

1.4 Atendimento lançado pelo próprio profissional no CRM (origem `own`) não pode ser avaliado. Isso vale mesmo que tenha sido pago.

1.5 Não se avalia serviço que não aconteceu nem serviço de outra pessoa.

1.6 Pagamento feito fora do app não gera avaliação. O WorkEasy não recebe nem registra esse pagamento (Termos de Uso, cláusula 6.5).

---

## 2. Quando a nota aparece publicamente

2.1 **Ocupação com nota permitida** (`occupation_policies.rating_ranking` verdadeiro): a avaliação entra com `published = true`. Aparece na página pública do profissional e conta na média da busca.

2.2 **Ocupação sem nota** (`rating_ranking` falso): a avaliação é gravada com `published = false`. Aparece só para o cliente que avaliou, para o profissional e para a equipe administradora. Não aparece na página pública, não entra na média da busca e a busca não mostra nota.

2.3 **Ninguém muda isso.** Nem o cliente, nem o administrador. A função `private.check_review()` roda em inserção e em alteração e força `published = false` quando a ocupação não permite nota. O teste `supabase/tests/database/07_quotes_reviews.test.sql` cobre a inserção e a tentativa de publicação pelo cliente. A moderação do administrador (ocultar e reexibir) tem teste no mesmo arquivo ("an admin hides a review", "an admin shows it again"). Não há teste de que o administrador não altere outras colunas (seção 5.1).

2.4 Hoje são 462 ocupações sem nota, de 1.710 no catálogo (contagem de `catalog/policies.json` em 2026-11-08; a matriz da Frente A ainda pode mudar). Todas estão marcadas como reguladas. Ver seção 10.

2.5 Quando a nota não é publicada, a tela do cliente diz: "só você e o profissional veem a sua." A equipe administradora também vê, porque a política `reviews_select` permite. **Texto a corrigir:** "só você, o profissional e a equipe do WorkEasy veem a sua." (seção 13.)

---

## 3. Como a nota aparece na busca

3.1 **Ocupação com nota:** (a) os profissionais com pelo menos 3 avaliações publicadas naquela ocupação vêm primeiro, pela média das notas (duas casas decimais). (b) Os demais vêm depois, por ordem alfabética do nome.

3.2 **Ocupação sem nota:** a ordem muda a cada dia. Dentro do mesmo dia ela é igual para quem pesquisa. Ela depende do identificador do profissional e da data em São Paulo. Nenhuma nota entra na ordem.

3.3 **Plano:** o plano Pro não muda a posição na busca. A função `search_providers` não lê o plano. Não há posição paga hoje. A decisão de não vender destaque na busca está em `docs/DECISOES.md` (D11). Se isso mudar, esta cláusula muda antes. [CONDICIONAL: depende de parecer]

3.4 **Média no cartão da busca:** a média aparece assim que há uma avaliação publicada. Um profissional com uma única avaliação de 5,0 aparece com "5,0 (1 avaliação)", mas fica depois dos que têm 3 ou mais. A tela não explica isso. [DECISÃO DO DONO] Escolher entre: (a) explicar na tela a regra das 3 avaliações; ou (b) mostrar a média só a partir de 3 avaliações.

3.5 **Página do profissional:** mostra até 50 avaliações publicadas, as mais recentes. A média exibida é calculada sobre essas 50. A busca usa todas as avaliações publicadas. Quando há mais de 50, a média e o texto "em N avaliações" não batem com a busca. Além disso, a página mistura as avaliações de todas as ocupações do profissional, e a busca calcula por ocupação. Isso é defeito (seção 13). A regra correta é usar o mesmo conjunto da busca, por ocupação.

---

## 4. O que pode e o que não pode no comentário

4.1 **Pode:** falar do serviço recebido. Pode descrever o que foi feito, o cumprimento do combinado, a comunicação e o cuidado, e informar o preço que foi combinado.

4.2 **Não pode** (a maior parte acompanha a cláusula 10.1 dos Termos de Uso, itens b, c, d e f; os itens b (dado de saúde, cláusula 9.6), h (publicidade e convite para contratar por fora) e i (conteúdo que não fala do serviço) não estão nela, e a extorsão do item e só em parte. Ver ponto 22):

- a) dado pessoal seu ou de outra pessoa: telefone, e-mail, endereço, CPF ou CNPJ, nome completo de terceiro, foto de pessoa identificável;
- b) dado de saúde (Termos de Uso, cláusula 9.6);
- c) ofensa, ameaça, assédio ou discriminação, inclusive por raça, cor, religião, origem, gênero, orientação sexual ou deficiência;
- d) conteúdo sexual, de violência, ou de exploração de crianças e adolescentes;
- e) extorsão: exigir dinheiro, desconto ou vantagem para retirar, alterar ou dar a nota;
- f) oferecer ou pedir vantagem em troca de nota ou de avaliação, inclusive quando o pedido vem do profissional;
- g) avaliação falsa, de serviço não contratado, ou escrita por quem não foi o cliente do atendimento;
- h) publicidade do próprio profissional ou de terceiro, link de venda, ou convite para contratar por fora do app;
- i) conteúdo que não fala do serviço.

4.3 **Limites técnicos, hoje:** nota inteira de 1 a 5 (banco); comentário de até 1.000 caracteres (banco e tela); espaços no início e no fim são removidos pelo app (`services/reviews.ts`).

4.4 **Filtro automático de palavras ou de imagens:** não existe hoje. [PLANEJADO] Sem filtro, a moderação depende só de denúncia e da equipe. As lojas exigem filtragem e denúncia (seção 11).

---

## 5. Editar e apagar

5.1 **A equipe não edita o texto nem a nota.** Essa é a regra de produto (Termos de Uso, cláusula 8.4). O banco ainda não garante isso: a política `reviews_admin_update` deixa o administrador alterar qualquer coluna, inclusive nota e comentário. Não há motivo registrado nem log. Ver seção 13.

5.2 **O autor pode alterar nota e comentário a qualquer tempo.** O banco permite (política `reviews_update_own`; existe o teste "the author edits rating and comment" em `07_quotes_reviews.test.sql`). A tela do cliente não oferece edição. [DECISÃO DO DONO] Proposta: edição livre por 7 dias depois da avaliação; depois disso, a nota fica travada. A proposta precisa de parecer se houver regra legal aplicável. [CONDICIONAL: depende de parecer]

5.3 **Ninguém apaga avaliação pelo app.** O autor não tem permissão de exclusão no banco. O profissional não altera nem apaga avaliação (Termos do Prestador, cláusula 8.4).

5.4 **Conta de cliente excluída** (anonimização, Política de Privacidade, seção 7): a nota continua contando na média do profissional. O comentário é apagado pela função `anonymize_user`, com `update public.reviews set comment = null where client_id = p_user`. O vínculo com o autor (`client_id`) fica nulo só quando a conta sai do Auth (chave estrangeira `on delete set null`; ARQUITETURA, seção de exclusão de conta). [CONDICIONAL: depende de parecer] (ponto 16 da seção de pontos para o advogado).

5.5 **Profissional suspenso ou excluído:** a página pública some enquanto o cadastro estiver suspenso, porque a leitura exige status aprovado. As avaliações continuam gravadas.

---

## 6. Moderação pela equipe

6.1 **Motivos para ocultar (lista fechada):**

- a) a avaliação viola a seção 4;
- b) a avaliação é falsa, retaliatória ou de atendimento sem pagamento pelo app (seção 7);
- c) há ordem judicial ou notificação de autoridade (seção 9);
- d) uma contestação foi aceita (seção 8).

Não se oculta avaliação por nota baixa, nem porque o profissional discorda.

6.2 **Quem pode:** só o administrador (`public.is_admin()`). Ele oculta trocando `published` para falso, pela política `reviews_admin_update`.

6.3 **Estado hoje:** não há tela de moderação em `pages/admin/` (painel, prestadores, disputas, pagamentos, auditoria, LGPD e configurações). A ação é feita direto no banco. [PLANEJADO] Tela com motivo obrigatório, como as ações já existentes de prestador.

6.4 **Efeito:** a avaliação oculta sai da página pública e da média da busca, porque a busca só conta `published`. Ela continua no banco, para registro e para disputa.

6.5 **Reativação:** o autor não consegue publicar de novo (trigger `reviews_05_guard`, função `private.guard_review_update`; teste "the client cannot change the publication"). Só o administrador reativa. Em ocupação sem nota, a reativação é impossível, porque a regra da seção 2.3 força `published = false`.

6.6 **Registro:** hoje ocultar não grava motivo, nem quem ocultou, nem quando, e não entra em `audit_log` (não há trigger de auditoria em `reviews`; há só o trigger de eventos de produto `product_events_reviews`, que registra `review_published` e não guarda motivo nem autor). [PLANEJADO] Antes de a política valer: campos de moderação em `reviews` (motivo, quem, quando) e registro em `audit_log` a cada ocultação e reativação.

6.7 **Prazo interno:** [DECISÃO DO DONO] Proposta: a equipe analisa denúncia e contestação em até 2 dias úteis. Ordem judicial tem o prazo que o juiz fixar, e ele prevalece sobre o prazo interno.

---

## 7. Avaliação falsa ou retaliatória

7.1 **Sinais que a equipe olha** (lista da decisão D8 em `docs/DECISOES.md`):

- a) contas que só avaliam um mesmo profissional;
- b) o mesmo telefone em mais de uma conta. Usar o telefone confirmado no cadastro (Auth, com código de confirmação), e não o campo "telefone" digitado no perfil, que não é confirmado (`docs/ARQUITETURA.md`, seção Identidade);
- c) pares repetidos cliente-profissional: muitas avaliações entre as mesmas duas pessoas.

Propostas, ainda não decididas:

- d) muitas notas 5 ou 1 em pouco tempo para um profissional recém-aprovado;
- e) conta criada e avaliação no mesmo período.

7.2 **Gatilho de revisão:** revisar os sinais ao chegar a 500 avaliações publicadas (D8). Depois disso, em ciclo periódico. [DECISÃO DO DONO] Escolher a periodicidade.

7.3 **Estado hoje:** nenhum sinal é calculado. Não há visão, alerta ou relatório. [PLANEJADO]

7.4 **Dados usados:** a análise de telefone e de pares trata dado pessoal. A base legal é [CONDICIONAL: depende de parecer]. Deve constar na Política de Privacidade (documento 03) e no RIPD (documento 06).

7.5 **Consequência:** a avaliação suspeita é ocultada (seção 6.1, item b). A conta do cliente pode sofrer a medida prevista nos Termos de Uso. Esta política não cria sanção nova. Suspensão de profissional só por decisão de pessoa da equipe (Termos do Prestador, cláusulas 8.5 e 17.1).

---

## 8. Aviso e contestação

8.1 **Aviso.** Quando a avaliação é ocultada por motivo de conteúdo (seção 6.1, itens a, b e d), o autor e o profissional recebem um aviso com: o motivo, em texto curto, a regra violada, a data e o modo de contestar. [PLANEJADO] Hoje não há notificação de avaliação: os modelos de notificação do sistema (lista de `template` em `supabase/migrations/20261019000008_notifications.sql`) não incluem avaliação.

8.2 **Base do aviso ao autor.** O artigo 20 do Marco Civil da Internet manda comunicar os motivos da indisponibilização ao usuário responsável pelo conteúdo, quando houver contato dele, com informações que permitam contraditório e ampla defesa. A aplicação a avaliações de serviço é [CONDICIONAL: depende de parecer].

8.3 **Contestação.** O autor ou o profissional contesta pelo [E-MAIL DO SAC], em [DECISÃO DO DONO: proposta de 7 dias corridos a partir do aviso]. A contestação deve explicar o motivo e pode trazer prova, por exemplo o atendimento e o pagamento.

8.4 **Análise e resposta.** A análise é feita por administrador diferente de quem ocultou, quando houver mais de um administrador [DECISÃO DO DONO]. A resposta é escrita, em [DECISÃO DO DONO: proposta de 5 dias corridos, como no SAC (documento 10)]. Referência: o Decreto 7.962/2013, artigo 4º, V, e parágrafo único, exige manifestação em até cinco dias para as demandas do inciso V (informação, dúvida, reclamação, suspensão ou cancelamento do contrato). A aplicação a contestações desta política é [CONDICIONAL: depende de parecer].

8.5 **Resultado.** A equipe mantém a avaliação oculta ou a restaura. A restauração volta `published` para verdadeiro, e só é possível em ocupação com nota. Toda decisão é registrada e comunicada, com o motivo. [PLANEJADO]

8.6 **Resposta pública do profissional.** O produto não tem resposta do profissional, e esta política não a prevê. [DECISÃO DO DONO] Decidir se entra. Se entrar, a resposta passa pela mesma moderação da seção 4.

8.7 **Estado hoje.** O Termos de Uso (cláusula 8.4) manda o profissional pedir revisão pelo SAC. O canal é o placeholder [E-MAIL DO SAC]. Não há fluxo, registro ou prazo no produto.

---

## 9. Ordem judicial, notificação e pedidos de autoridade

9.1 **Regra geral (Marco Civil da Internet, Lei 12.965/2014, artigo 19).** O provedor de aplicações só responde civilmente por conteúdo gerado por terceiro se, após ordem judicial específica, não tomar as providências para tornar o conteúdo indisponível, no prazo fixado. A ordem deve identificar o conteúdo de forma clara e específica, sob pena de nulidade (artigo 19, §1º).

9.2 **O que mudou pelo STF (Tema 987, RE 1.037.396).** Em 26/06/2025, o STF decidiu que a regra do artigo 19 é "parcialmente inconstitucional". Pela notícia do próprio STF:

- a) os provedores só respondem por indenização se descumprirem ordem judicial de remoção; a notícia diz que "nada impede" que as plataformas removam publicações com base apenas em notificação extrajudicial, mas não liga isso expressamente a crimes contra a honra (escopo em aberto, ponto 1);
- b) cópias idênticas de conteúdo já reconhecido como ofensivo por decisão devem sair após notificação judicial ou extrajudicial;
- c) para crimes graves, a responsabilização pode ocorrer por falha sistêmica na retirada. A notícia de 26/06/2025 diz que a lista "inclui, entre outros" crimes; a de 17/06/2026 fala em "rol taxativo" (conflito, ponto 1);
- d) as plataformas devem adotar autorregulação com sistema de notificações, devido processo e relatórios anuais de transparência sobre notificações extrajudiciais.

Em 17/06/2026, o STF concluiu o julgamento dos embargos de declaração e fixou 60 dias para medidas estruturais, contados do fim do julgamento (notícia do STF de 17/06/2026). [incerto] Não abri a redação final publicada da tese. A data de início de efeitos citada em fonte secundária não foi conferida.

9.3 **Procedimento.**

- a) **Ordem judicial.** Chega em [E-MAIL DO SAC] ou no canal jurídico que for definido. A equipe confere o órgão, o número do processo, a identificação clara do conteúdo (artigo 19, §1º) e o prazo. Cumpre no prazo e registra. [PLANEJADO] Pedido de identificação de autor é outro tema, tratado na Política de Privacidade (documento 03) e não aqui.
- b) **Notificação extrajudicial** (por exemplo, alegação de crime contra a honra; escopo em aberto, ponto 1). A equipe pode ocultar só quando a notificação aponta a avaliação e o trecho e descreve a ofensa. O autor é avisado (seção 8.1). [CONDICIONAL: depende de parecer]
- c) **Nudez ou ato sexual de caráter privado** divulgado sem autorização (Marco Civil, artigo 21). A notificação precisa conter elementos que identifiquem o material (artigo 21, parágrafo único). A equipe age de forma diligente. [CONDICIONAL: depende de parecer]
- d) **Pedido de autoridade** (conselho profissional, Procon, Senacon ou outra). A equipe confere a competência e exige o pedido por escrito. Oculta se o pedido identifica a avaliação e a infração, e avisa o profissional com o motivo (Termos do Prestador, cláusula 13.6). [PLANEJADO]

9.4 **Relatório de transparência.** [PLANEJADO] Publicar uma vez por ano a quantidade de avaliações ocultadas por (i) ordem judicial, (ii) notificação extrajudicial, (iii) regra interna e (iv) autoridade, e o resultado das contestações. A data do primeiro relatório será definida pelo dono.

9.5 **Prevalência.** Ordem judicial vale sobre qualquer prazo ou regra interna desta política.

---

## 10. Nota por profissão (regra do catálogo)

10.1 Cada ocupação tem `rating_ranking` (verdadeiro ou falso) em `catalog/policies.json`, e o banco o aplica pela tabela `occupation_policies`. Conferido em 2026-11-08:

| Grupo | Ocupações |
|---|---|
| Não regulada, com nota | 923 |
| Regulada, com nota | 325 |
| Regulada, sem nota | 462 |
| Total | 1.710 |

10.2 Das 462 sem nota, 179 têm a base marcada como conferida (`confidence = conferido`). As outras 283 têm a base marcada como a confirmar (`a_confirmar`).

10.3 Conselhos das 462 ocupações (contagem pelo campo `regulatorBody`): CFM/CRM 140; CFO/CRO 37; OAB 37; CFP/CRP 27; outros grupos e combinações 221.

10.4 **O que os textos que abri dizem** (2026-11-08):

- **CFM, Resolução 2.336/2023.** Não há proibição expressa de avaliação ou nota. O artigo 11, XIII, veda permitir ou não impedir que o nome entre em listas de premiações, homenagens ou concursos "com a finalidade de escolher ou indicar profissional" para títulos como "melhor médico", com foco promocional ou de propaganda patrocinada. O artigo 11, XVI, veda sensacionalismo, concorrência desleal e conteúdo inverídico. O artigo 14, II, g, admite depoimentos sobre a atuação do médico, desde que "sóbrios, sem adjetivos que denotem superioridade ou induzam a promessa de resultado".
- **OAB, Provimento 205/2021.** O artigo 3º, I, veda referir valores de honorários, forma de pagamento, gratuidade ou descontos como forma de captação de clientes. O artigo 5º, §1º, veda pagar ou patrocinar aparição em rankings ou prêmios que visem "destacar ou eleger profissionais". Não há menção a avaliações nem a depoimentos.
- **CFP, Resolução 9/2024** (cópia na normasbrasil, não no DOU). Não encontrei regra sobre avaliação, depoimento ou ranking. O artigo 2º dessa cópia não tem alíneas o e p (ponto 8). O artigo 3º, §2º, diz que é responsabilidade da profissional "as manifestações públicas em relação aos serviços prestados", quanto à divulgação por meio de TDICs.

10.5 **Consequência para o produto.** O catálogo registra "preço público nem ranking (Prov. 205); sem nota, por cautela" para advogado, "Sem avaliação pública" para psicólogo e "sem ranking ou depoimentos (CFM)" para médico. Os textos que abri não trazem essas proibições expressas. Por isso, a nota desligada é hoje uma decisão de cautela do produto, não uma regra de conselho comprovada. [CONDICIONAL: depende de parecer] A página de ocupação diz "Os profissionais não são ordenados por nota, por regra do conselho." Esse texto vale também para as 283 com base a confirmar. Até o parecer, deve dizer que a regra é de cautela do WorkEasy e que a base está em confirmação.

---

## 11. Lojas de aplicativo

11.1 **Apple, App Store Review Guidelines, item 1.2** (aberto em 2026-11-08). Apps com conteúdo gerado por usuário devem ter: (i) método para filtrar material ofensivo; (ii) mecanismo para denunciar conteúdo ofensivo, com respostas em tempo adequado; (iii) possibilidade de bloquear usuários abusivos; (iv) contato publicado.

11.2 **Google Play, política de conteúdo gerado por usuário** (aberto em 2026-11-08). O app precisa: moderação contínua e efetiva; termos do usuário que definam e proíbam o conteúdo inaceitável, aceitos antes de publicar; e um sistema no próprio app para denunciar e bloquear conteúdo e usuários, com ação sobre as denúncias.

11.3 **Estado hoje.** Não há botão de denúncia de avaliação, não há bloqueio de usuário e não há filtro de conteúdo no app. [PLANEJADO] A decisão de enviar versões nativas com avaliações visíveis depende disso. [DECISÃO DO DONO]

---

## 12. Resumo público para o app (texto pronto)

> **Avaliações no WorkEasy**
>
> Quem contratou um profissional pelo WorkEasy pode avaliar o serviço depois que ele for concluído e pago pelo app. Cada serviço pode ter uma avaliação.
>
> - A avaliação tem uma nota de 1 a 5 e um comentário opcional de até 1.000 caracteres.
> - Escreva sobre o serviço que você recebeu. Não coloque dados pessoais, ofensas, ameaças, discriminação, nem pedidos de dinheiro ou vantagem em troca de nota.
> - [Edição pela pessoa que avaliou: texto a definir conforme a seção 5.2.] Você não pode apagar a avaliação.
> - Em algumas profissões, o WorkEasy não classifica os profissionais por nota. Nesses casos, a avaliação não aparece para o público. Só você, o profissional e a equipe do WorkEasy a veem.
> - Na busca, aparecem primeiro os profissionais com pelo menos 3 avaliações publicadas, pela média das notas. Os demais aparecem depois, por nome. Em profissões sem classificação por nota, a ordem muda a cada dia e não depende de nota.
> - O plano Pro não muda a posição de ninguém na busca.
> - Se uma avaliação viola as regras ou a lei, a equipe pode ocultá-la. A pessoa que escreveu não consegue publicá-la de novo. Quem for afetado pode contestar pelo [E-MAIL DO SAC].

---

## 13. O que falta para esta política valer (estado do produto)

| Item | Hoje (código, 2026-11-08) | O que a política exige | Tag |
|---|---|---|---|
| Tela de moderação | Não existe em `pages/admin/`. A ação é feita no banco. | Tela com motivo obrigatório | [PLANEJADO] |
| Motivo, autor e data da ocultação | Não existem em `reviews` | Campos ou tabela de moderação | [PLANEJADO] |
| Registro em auditoria | Nenhum trigger de auditoria em `reviews`; só o evento de produto `review_published`. `audit_log` existe e é imutável. | Registrar cada ocultação e reativação | [PLANEJADO] |
| Administrador altera nota e comentário | `reviews_admin_update` não restringe colunas | Restringir a `published` e aos campos de moderação | Correção recomendada |
| Autor altera nota e comentário a qualquer tempo | `reviews_update_own` permite; a tela não oferece | Prazo ou trava | [DECISÃO DO DONO] |
| Aviso ao autor e ao profissional | Sem modelo de notificação para avaliação | Aviso com motivo | [PLANEJADO] |
| Contestação | Só texto nos Termos (SAC) | Canal, prazo e registro | [PLANEJADO] |
| Denúncia e bloqueio no app | Não existem | Botões e fluxo (seção 11) | [PLANEJADO] |
| Filtro de conteúdo | Só o limite de 1.000 caracteres | Filtro e moderação contínua | [PLANEJADO] |
| Sinais de fraude | Não calculados | Visão ou relatório (seção 7) | [PLANEJADO] |
| Média da página x média da busca | A página usa as 50 mais recentes e mistura ocupações; a busca usa todas, por ocupação | Mesmo conjunto e mesma ocupação | Defeito |
| Regra das 3 avaliações | Não explicada na tela | Explicar ou mudar a exibição (seção 3.4) | [DECISÃO DO DONO] |
| Texto "só você e o profissional veem" | Omite a equipe | Incluir a equipe | Correção de texto |
| Texto "por regra do conselho" | Na página de ocupação, inclusive nas 283 com base a confirmar | Texto de cautela até o parecer | [CONDICIONAL: depende de parecer] |
| Relatório de transparência | Não existe | Anual (seção 9.4) | [PLANEJADO] |
| Resposta do profissional | Não existe | Decidir se entra | [DECISÃO DO DONO] |

---

## Pontos para o advogado

### A. Fundamentos

1. **Tese do STF no Tema 987 após os embargos (17/06/2026).** Obter a redação final publicada. Confirmar quais crimes contra a honra entram e como a tese se aplica a avaliação de cliente em plataforma de serviços. A notícia de 26/06/2025 diz que o rol de crimes graves "inclui, entre outros"; a de 17/06/2026 diz "rol taxativo". [incerto]
2. **Data de início de efeitos da tese.** Fonte secundária cita 05/08/2025. Não conferi. [incerto]
3. **Conteúdo mínimo da notificação extrajudicial.** A tese exige "sistema de notificações e devido processo". Quais elementos o WorkEasy deve exigir do notificante? [incerto]
4. **Texto vigente do Marco Civil.** Li os artigos 19, 20 e 21 na versão de origem da compilação da Câmara. O índice do Senado mostra alterações em outros dispositivos. Confirmar se os artigos 19 a 21 mudaram depois. [incerto]
5. **Artigo 20 (aviso ao autor).** Aplica-se a avaliação de serviço contratado? Qual conteúdo do aviso basta? [CONDICIONAL: depende de parecer]

### B. Nota por profissão

6. **CFM.** O artigo 11, XIII, e o artigo 14, II, g, se aplicam à nota de cliente no app? A avaliação de cliente é "depoimento" ou "lista para escolher ou indicar profissional"? Se não é, a regra de nota desligada para médicos é cautela ou exigência? [CONDICIONAL: depende de parecer]
7. **OAB.** Ordenar por nota é "ranqueamento" no sentido do artigo 5º, §1º, ou só a paga é vedada? [CONDICIONAL: depende de parecer]
8. **CFP.** A Resolução 9/2024 que li não trata de avaliação. O catálogo cita "art. 2º, o e p" para comissão e intermediação de pagamento, e o texto que li não tem esses itens. Confirmar no DOU e verificar se há outra norma do CFP sobre avaliação. [incerto]
9. **As 283 ocupações com base a confirmar.** Qual norma sustenta cada uma? Depende da matriz por conselho (Frente A). [CONDICIONAL: depende de parecer]
10. **Os outros conselhos (221 das 462 sem nota).** Não abri as fontes deles. [incerto]

### C. Consumidor

11. **CDC, artigo 37, §1º e §3º, e artigo 38.** A média exibida pela plataforma é "informação" ou "publicidade"? O artigo 38 põe o ônus de provar a veracidade de informação publicitária em quem a patrocina. Isso se aplica a avaliações de clientes? [CONDICIONAL: depende de parecer]
12. **Avaliação falsa.** Não encontrei norma nem decisão brasileira específica sobre avaliação falsa em plataforma. Também não achei guia da Senacon aberto. Confirmar se existe. [incerto]
13. **Decreto 7.962/2013, artigo 4º, V, e parágrafo único.** O prazo de cinco dias vale para o canal de contestação desta política? [CONDICIONAL: depende de parecer]
14. **Projeto que altera o artigo 37.** Fonte secundária diz que um projeto aprovado no Senado altera o artigo 37 e voltou à Câmara. Não conferi o número nem a situação. [incerto]

### D. Dados pessoais

15. **Base legal** para a análise de telefone repetido e de pares, e para o uso do telefone confirmado no cadastro. [CONDICIONAL: depende de parecer]
16. **Retenção.** Prazo de guarda da avaliação oculta (para disputa) e da nota de conta excluída. Base legal. [CONDICIONAL: depende de parecer]

### E. Produto, lojas e comissão

17. **Edição pelo autor.** Há exigência legal de prazo, ou a regra é só de política? [DECISÃO DO DONO]
18. **Lojas.** Quais itens dos guidelines da Apple (1.2) e da política do Google Play são obrigatórios para as versões nativas com avaliações visíveis? [CONDICIONAL: depende de parecer]
19. **Comissão e pagamento retido.** Se forem ligados, muda a condição "pago pelo app" da seção 1? O status `held` não conta hoje. [CONDICIONAL: depende de parecer]

### F. Consistência com outros documentos

20. **Números do catálogo.** Este documento usa a contagem do arquivo `catalog/policies.json` em 2026-11-08 (462 sem nota). Os documentos 01 (Termos de Uso, pontos de pendência e tabela de números) e 02 (Anexo II) ainda usam 272 sem nota e 1.057 / 653 para a base, e o PREAMBLE do projeto cita 1.057 "a confirmar". O arquivo hoje tem 1.102 "a_confirmar" e 608 "conferido". Sincronizar quando a matriz da Frente A fechar. [DECISÃO DO DONO]
21. **Prazo de resposta à contestação.** A seção 8.4 propõe 5 dias corridos, a mesma base do SAC (documento 10, seção 4.1). O playbook de suporte (documento 07, prazo 14) ainda diz 5 dias úteis. Decidir um só prazo e alinhar os três. [DECISÃO DO DONO]
22. **Lista de condutas.** A seção 4.2 não coincide com a cláusula 10.1 dos Termos de Uso. Os itens b (dado de saúde), h e i não estão nela, e o item e só em parte. Incluir nos Termos de Uso, ou nos Termos do Prestador (cláusula 16), antes de valer. [CONDICIONAL: depende de parecer]

### Lista de itens [incerto]

Pontos 1, 2, 3, 4, 8, 10, 12 e 14. A data de abertura e a versão exata dos guidelines da Apple e da política do Google Play não ficaram visíveis na página.

---

## Fontes consultadas

Todas foram abertas em 2026-11-08, salvo indicação. Quando o site bloqueou o acesso, a fonte está marcada.

| # | Fonte (URL) | Norma e trecho | Como foi aberta e observação |
|---|---|---|---|
| 1 | https://www2.camara.leg.br/legin/fed/lei/2014/lei-12965-23-abril-2014-778630-publicacaooriginal-143980-pl.html | Lei 12.965/2014 (Marco Civil), artigos 19 (caput e §1º), 20 (caput e parágrafo único), 21 (caput e parágrafo único) | Portal da Câmara, texto de publicação original. Reaberta em 2026-11-08 por WebFetch: art. 19 (caput, §1º), art. 20 (caput, parágrafo único) e art. 21 (caput, parágrafo único) conferem com o texto citado. A página não traz notas de alteração (ponto 4). |
| 2 | https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm | Mesma lei | Não aberta. Reaberta em 2026-11-08: o Planalto bloqueou (página "Esta requisição foi bloqueada") por WebFetch e por download direto. Não usei o texto dali. |
| 3 | https://legis.senado.leg.br/norma/584776 | Lei 12.965/2014: índice de dispositivos alterados | Só índice. Os artigos 19 e 21 não aparecem na lista de alterados. Não traz o texto. |
| 4 | https://noticias.stf.jus.br/postsnoticias/stf-define-parametros-para-responsabilizacao-de-plataformas-por-conteudos-de-terceiros/ | STF, Tema 987, decisão de 26/06/2025 (página datada de 26/06/2025) | Reaberta em 2026-11-08 por WebFetch: data 26/06/2025 confere; "parcialmente inconstitucional" confere; "nada impede" (notificação extrajudicial) confere, mas o texto não liga isso expressamente a crimes contra a honra, e o rol "inclui, entre outros". A redação final da tese não foi aberta. |
| 5 | https://noticias.stf.jus.br/postsnoticias/plataformas-terao-60-dias-para-implementar-medidas-estruturais-decide-stf/ | STF, notícia de 17/06/2026 sobre os embargos | Reaberta em 2026-11-08 por WebFetch: data 17/06/2026 confere; prazo de 60 dias "a partir do final deste julgamento" confere; "rol taxativo" confere. A redação dos embargos e a tese não foram abertas. |
| 6 | https://noticias.stf.jus.br/postsnoticias/stf-avanca-em-analise-de-recursos-sobe-normas-do-marco-civil-da-internet/ | STF, notícia de 11/06/2025 | Não trouxe decisão. Só para contexto. |
| 7 | https://teletime.com.br/17/06/2026/stf-conteudos-marco-civil-internet/ | Teletime, 17/06/2026 | Fonte secundária. Usada só como pista para o item 2 e a seção 9.2. Não é citação do acórdão. |
| 8 | https://www2.camara.leg.br/legin/fed/lei/1990/lei-8078-11-setembro-1990-365086-publicacaooriginal-1-pl.html | Lei 8.078/1990 (CDC), artigos 6º (III e IV), 37 (caput e §§1º, 2º e 3º), 38, 67 | Portal da Câmara, publicação original. Reaberta em 2026-11-08 por WebFetch: art. 37 (caput, §1º, §3º) e art. 38 conferem; nenhum deles trata de avaliação ou ranking. |
| 9 | https://www2.camara.leg.br/legin/fed/decret/2013/decreto-7962-15-marco-2013-775557-publicacaooriginal-139266-pe.html | Decreto 7.962/2013, artigos 1º (I a III), 4º (V e VI e parágrafo único), 9º | Portal da Câmara. Reaberta em 2026-11-08 por WebFetch: art. 4º, V e parágrafo único conferem ("em até cinco dias", sem dizer se úteis ou corridos). Não traz avaliação de consumidor. |
| 10 | https://crmes.org.br/wp-content/uploads/2023/09/Resolucao-2336-2023-publicidade-e-propaganda-medica.pdf | CFM, Resolução 2.336/2023, artigos 11 (XIII, XVI, §§2º a 5º) e 14 (II, g) | PDF com cabeçalho do CFM, hospedado em crmes.org.br (cópia de terceiro, não o site do CFM). Reaberta em 2026-11-08: o WebFetch não lê o PDF; texto extraído localmente com pdftotext. Art. 11, XIII e XVI e art. 14, alínea g conferem. O art. 17 prevê entrada em vigor em 180 dias. Vigência atual [incerto]. |
| 11 | https://www.oab.org.br/leisnormas/legislacao/provimentos/205-2021 | OAB, Provimento 205/2021, artigos 3º (I) e 5º (§1º) | Reaberta em 2026-11-08 por WebFetch: art. 3º, I e art. 5º, §1º conferem. Não há menção a avaliação, depoimento ou nota. A página não diz se está em vigor. |
| 12 | https://www.normasbrasil.com.br/norma/resolucao-9-2024_462577.html | CFP, Resolução 9/2024, artigos 2º, 3º (§2º) | Cópia de terceiro, não o DOU (página: "Resolução CFP n° 9 DE 18/07/2024", "Publicado no DO em 30 jul 2024"). Reaberta em 2026-11-08: art. 3º, §2º confere; o art. 2º não tem alíneas o e p (ponto 8). |
| 13 | https://developer.apple.com/app-store/review/guidelines/ | Apple App Store Review Guidelines, item 1.2 | Reaberta em 2026-11-08 por WebFetch: item 1.2 confere (filtro, denúncia com resposta em tempo adequado, bloqueio de usuários abusivos, contato publicado). Sem data de atualização visível. |
| 14 | https://support.google.com/googleplay/android-developer/answer/9876937?hl=en | Google Play, política de conteúdo gerado por usuário | Reaberta em 2026-11-08 por WebFetch: moderação, termos aceitos antes de publicar, denúncia e bloqueio no app e ação sobre denúncias conferem. Só há "©2026 Google" no rodapé, sem data de atualização. |

**Buscas sem fonte primária encontrada:** avaliação falsa em norma brasileira; guia da Senacon sobre avaliações; projeto de lei específico sobre avaliações de consumidores. Ponto 12.

**Código do produto lido** (`apps/web`): `supabase/migrations/20261019000007_quotes_reviews.sql`; `supabase/migrations/20261019000003_providers.sql` (`search_providers`, `get_provider_page`); `supabase/migrations/20261019000010_privacy_audit.sql` (`anonymize_user`); `supabase/migrations/20261019000008_notifications.sql`; `supabase/tests/database/07_quotes_reviews.test.sql`; `services/reviews.ts`; `components/cliente/ReviewPanel.tsx`; `components/cliente/ProvidersSection.tsx`; `pages/publico/PaginaPrestador.tsx`; `pages/OccupationPage.tsx`; `catalog/policies.json`; `docs/ARQUITETURA.md`; `docs/DECISOES.md` (D7, D8, D11); `docs/juridico/01-termos-de-uso.md`; `docs/juridico/02-termos-do-prestador.md`; `supabase/migrations/20261108100000_product_events.sql` (`track_review`).
