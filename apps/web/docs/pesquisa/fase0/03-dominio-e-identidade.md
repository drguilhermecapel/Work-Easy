Dossiê de pesquisa. Não é parecer jurídico, contábil, tributário nem de propriedade intelectual; serve de base para a conversa com o profissional competente.

# F03: Domínio, nome de desenvolvedor e identidade nas lojas

Data de referência: 2026-11-08. Fase 0, frente F03. Idioma: pt-BR. Todas as fontes listadas no fim foram tentadas em 2026-11-08; a coluna de situação diz se a página foi lida, retornou vazia, foi bloqueada ou deu 404.

## Resumo

- **workeasy.com.br está registrado.** O RDAP da Registro.br (consultado em 2026-11-08) mostra status "active", registro em 2020-05-19 e expiração em 2027-05-19. O código do projeto usa esse domínio como canônico (`VITE_SITE_URL`, remetente `avisos@workeasy.com.br`). O dono precisa confirmar se o titular é ele mesmo. Se não for, a escolha do domínio e do remetente muda antes de qualquer conta de loja.
- **Os identificadores `br.com.workeasy` não aparecem como publicados** nas duas consultas feitas (iTunes lookup por bundle ID: 0 resultados; Google Play: HTTP 404). Isso não prova que o ID está livre, porque essas consultas só veem apps publicados. Já o **nome "WorkEasy"** tem pelo menos dois apps publicados no App Store (Brasil) com nome parecido. Esse ponto é de marca e deve cruzar com o dossiê de INPI.
- **Custos oficiais lidos:** Apple Developer Program US$ 99 por ano (valor em reais não conferido); Google Play US$ 25, taxa única. O preço do `.com.br` no Registro.br não foi conferido (página vazia; trecho de busca sugere R$ 40 por ano, [incerto]).
- **Prazos lidos:** D-U-N-S da Apple em até 5 dias úteis, mais até 2 dias úteis para a Apple receber os dados; D-U-N-S do Google em até 30 dias. Conta de organização exige D-U-N-S nas duas lojas. A Apple exige site público no domínio da empresa e e-mail de trabalho no mesmo domínio.
- **Resend:** a verificação exige registros DKIM e SPF copiados exatamente do painel. Costuma verificar em cerca de 15 minutos, mas pode levar até 72 horas. Quem controla o DNS do domínio precisa fazer isso, e a página recomenda enviar por subdomínio.

## Método e limites

- **Foi aberto (WebFetch) com conteúdo lido:** RDAP do `workeasy.com.br`; Apple (inscrição; D-U-N-S; criação de app, FAQ de nome); Google Play (ajudas 6112435, 13628312 e 14151465); Resend (add-a-domain); Capacitor (config); Tauri (reference/config, primeiros 100 mil caracteres de 151 mil).
- **Registro.br: nenhuma página institucional retornou texto.** As páginas de regras, categorias, registro de novos domínios, pagamento, busca de domínio, whois e a página de preços retornaram "page text is empty" no WebFetch. Tudo o que está abaixo sobre regras de titularidade, prazos e preço do Registro.br vem de **trechos de resultados de busca, não abertos**, e está marcado [incerto]. A única parte do Registro.br que respondeu foi o RDAP.
- **Planalto bloqueado.** `planalto.gov.br` respondeu "Esta requisição foi bloqueada" para a LGPD e para o Decreto 7.962/2013. Nenhum artigo de lei foi lido nesta tarefa, e nenhum artigo é citado como texto de lei. Os pontos sobre e-mail de contato e encarregado ficam como [incerto].
- **Consultas de lojas com cobertura limitada.** A busca iTunes (país br) funcionou. A Google Play não tem busca pública de nome aberta aqui, só a página de detalhe por pacote. O portal de desenvolvedor da Apple exige login, e é a única fonte autoritativa de bundle ID já reservado. Não foi possível consultá-lo.
- **Não lido:** o dossiê I02 (citado no pedido como fonte de DKIM/SPF) e o `02-marca-inpi.md` (outro agente, só verificado que existe). Não há cruzamento de marca aqui.
- **Repositório:** só leitura. Usei `grep` em `apps/web` para localizar os identificadores e as referências a domínio e a e-mail. Não alterei nenhum arquivo do repositório nem outro arquivo fora do alvo.

## 1. Domínio .com.br (Registro.br)

### 1.1 Titularidade e regras de uso (todas [incerto]: trechos de busca, página não aberta)

- Pessoa física (CPF) e jurídica (CNPJ) podem registrar sob `.br`, desde que estejam legalmente representadas ou estabelecidas no Brasil e regulares na Receita Federal. Empresa estrangeira precisa de procurador no Brasil. Fonte citada no trecho: `https://registro.br/dominio/regras/`.
- Pessoa física registra só se for maior de idade (o trecho diz que a data de nascimento é pedida por isso).
- Categorias têm regras próprias: algumas só aceitam CPF, outras só CNPJ. O trecho diz que COM.BR é a categoria de atividades comerciais. Fonte: `https://registro.br/dominio/categorias/`.
- Nome: de 2 a 26 caracteres sem contar a categoria; não pode ser só números nem começar ou terminar com hífen.
- Registro é recusado se existir domínio equivalente de outro titular. O trecho não diz se "equivalente" inclui outras categorias (com.br, net.br). Esse ponto importa para os alternativos da seção 1.3.
- O CNPJ ou CPF do titular não muda online. Exige transferência formal, com documento e assinatura gov.br (pessoa física) ou e-CNPJ (empresa).
- Registro.br pode cancelar o domínio se o CPF/CNPJ ou o nome empresarial estiver incorreto ou desatualizado.
- Dados públicos: para pessoa jurídica, o trecho diz que nome empresarial, CNPJ, endereço, telefone e contatos aparecem publicamente. Para pessoa física, só parte do CPF.

Fontes: resultados de busca de 2026-11-08 para `https://registro.br/dominio/regras/`, `https://registro.br/ajuda/procedimentos-administrativos/transferencia-de-titularidade/` e `https://registro.br/dominio/categorias/`. Tentativas de abertura: `https://registro.br/dominio/regras/` e `https://registro.br/dominio/regras` (ambas vazias).

### 1.2 Preço e prazo

- **Preço [incerto].** O trecho de busca diz R$ 40,00 por ano para `.com.br`, com pagamento de até 10 anos (tabela de R$ 40 a R$ 364). O mesmo trecho diz que a tabela tem data de 2017 e que o câmbio de 5,50 R$/USD é para 2026. As informações não batem, então a página oficial precisa ser conferida antes de qualquer pagamento. Tentativas: `https://registro.br/dominio/`, `https://registro.br/ajuda/pagamento-de-dominio/` (vazias).
- **Prazo de liberação [incerto].** O texto da página de registro não abriu. Não há prazo confirmado.
- **Renovação [incerto].** Não confirmada.

### 1.3 Disponibilidade (RDAP da Registro.br, consultado em 2026-11-08)

| Domínio | Resposta RDAP (`rdap.registro.br/domain/...`) | Leitura |
|---|---|---|
| `workeasy.com.br` | registro ativo; registro em 2020-05-19; última alteração em 2025-06-06; expira em 2027-05-19; DNSSEC assinado | **Indisponível.** O titular não é reproduzido aqui (dado pessoal, e o RDAP da consulta omitiu os contatos). |
| `workeasy.net.br` | HTTP 404 | Sem registro encontrado. Não basta para afirmar que está livre (ver regra de domínio equivalente, seção 1.1). |
| `workeasyapp.com.br` | HTTP 404 | Idem. |
| `workeasybr.com.br` | HTTP 404 | Idem. |
| `meuworkeasy.com.br` | HTTP 404 | Idem. |

Leitura: o RDAP mostra registro ausente, mas não diz se o Registro.br aceitaria o registro (regras de categoria e de domínio equivalente, que não abri). A consulta pública do Registro.br não abriu, então essa checagem continua para o dono.

**Impacto no repositório** (leitura por `grep`):
- `apps/web/vite-env.d.ts`, linha 12: URL canônica `https://workeasy.com.br` (`VITE_SITE_URL` em `docs/ARQUITETURA.md`, linha 57).
- `apps/web/test/functions/notifications.test.ts`, linha 80: remetente `WorkEasy <avisos@workeasy.com.br>`. Também em `webhook-notify.test.ts`, linha 609.
- `apps/web/test/functions/clients-http.test.ts`, linhas 66 a 81: origens de CORS que incluem `https://workeasy.com.br`.

Se o domínio não for do dono, a troca é de configuração e de testes, mas atinge o remetente de e-mail e as origens de CORS.

## 2. Identificadores do app

### 2.1 Valores atuais no repositório (leitura por `grep`)

| Identificador | Valor | Onde está |
|---|---|---|
| Capacitor `appId` | `br.com.workeasy` | `apps/web/capacitor.config.ts`, linha 6 |
| iOS bundle ID (`PRODUCT_BUNDLE_IDENTIFIER`) | `br.com.workeasy` | `apps/web/ios/App/App.xcodeproj/project.pbxproj`, linhas 312 e 333 |
| Android `applicationId` / `namespace` | `br.com.workeasy` | `apps/web/android/app/build.gradle`, linhas 4 e 7 |
| Tauri `identifier` | `br.com.workeasy` | `apps/web/src-tauri/tauri.conf.json`, linha 5 |
| Nome de exibição | `WorkEasy` | `capacitor.config.ts` (`appName`) e `tauri.conf.json` (`productName`, não lido linha a linha) |

O repositório já tem um kit de lojas (`apps/web/docs/lojas/app-store.md`, linha 76, F02) que diz que o bundle iOS e o `identifier` do Tauri (macOS) são o mesmo. Isso bate com o código.

### 2.2 O que as fontes oficiais dizem (abertas em 2026-11-08)

- **Capacitor** (`https://capacitorjs.com/docs/config`, Version v8): `appId` é "The unique identifier of your packaged app", em notação de domínio reverso, "generally representing a domain name that you or your company owns". Vale como Bundle ID no iOS e Application ID no Android. A página não lista caracteres nem tamanho máximo. `appName` "should be what you'd see in the App Store" e pode ser mudado depois em cada plataforma.
- **Tauri** (`https://v2.tauri.app/reference/config/`): `identifier` deve ser "unique across applications", com só letras, números, hífen e ponto. O valor padrão `com.tauri.dev` é recusado pelo `tauri build`. A página não diz nada sobre terminar em `.app` no macOS. Essa regra [não verificado]; não deve ser afirmada sem outra fonte.

### 2.3 Conflito com apps publicados

- **App Store (iTunes Lookup, `bundleId=br.com.workeasy`, país br, 2026-11-08):** `resultCount: 0`. Não há app publicado com esse bundle ID nesse país.
- **Google Play (`play.google.com/store/apps/details?id=br.com.workeasy`, 2026-11-08):** HTTP 404. Não há app publicado com esse pacote.
- **Limitação:** essas consultas só veem apps publicados. Um ID reservado no portal da Apple ou no console do Google não aparece. Não há fonte aberta que confirme a regra de unicidade do bundle ID na conta do desenvolvedor.
- **Nome "WorkEasy" na App Store (busca iTunes, `term=workeasy`, país br, `entity=software`, 2026-11-08):** 6 resultados. Os mais próximos: "WorkEasy Software" (`com.workeasysoftware.app`, vendedor "EasyWorkforce Software Inc."), "WorkEasy.Team" (`com.easyworkforce.workeasy`, mesmo vendedor), "WorkEasy Software Time Kiosk" (`com.workeasysoftware.kiosk`, mesmo vendedor). Também aparecem "Work e-asy HK" e "办公易" (`com.kaishing.workeasy`). Isso é risco de nome e de marca, não prova de colisão legal. A análise cabe ao dossiê de INPI.
- **Regra de nome da Apple** (`https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/`, aberta em 2026-11-08, FAQ "What can I do if the app name I want to use on the App Store is unavailable?"): "You can use an app name for one app per localization." Se um app da própria conta já usa o nome, dá para atualizar esse app ou removê-lo. Se outro desenvolvedor usa o nome e o dono tem direitos de marca, cabe reclamação pelo formulário indicado na página. A página não diz que o nome é único na loja inteira, e não diz se a Apple recusa o cadastro quando outro desenvolvedor usa o nome [incerto]. O risco com os apps "WorkEasy" de terceiros é, portanto, de marca, e a análise cabe ao dossiê de INPI.
- **Google Play:** sem busca de nome aberta. [incerto]

## 3. Contas de desenvolvedor

### 3.1 Apple Developer Program (organização)

- **Taxa:** "The Apple Developer Program is 99 USD per membership year. Prices may vary by region and are listed in local currency during the enrollment process." Fonte: `https://developer.apple.com/programs/enroll/`, aberta em 2026-11-08. Valor em reais: [incerto]. A página `developer.apple.com/br/programs/` retornou 404.
- **Organização:** precisa de D-U-N-S, exceto entidade governamental. A entidade precisa ser pessoa jurídica que assina contratos. "We do not accept DBAs, fictitious business names, trade names, or branches." O nome da organização vira o nome do vendedor na App Store. Fonte: mesma página.
- **Site e e-mail:** o site precisa estar público e funcionar, e o domínio precisa estar associado à organização. O e-mail de trabalho precisa estar associado ao domínio da organização. Links de redes sociais ou sites com pouco conteúdo não são aceitos. Fonte: mesma página.
- **Quem inscreve:** o titular da conta precisa ter poder legal para vincular a organização a contratos. Se não for o dono ou fundador, precisa de referência que confirme a autoridade. Fonte: mesma página.
- **Prazo da aprovação da inscrição:** a página não informa. [incerto]. O kit do repo também marca como [incerto] (`app-store.md`, linha 143).

### 3.2 D-U-N-S (usado pela Apple e pelo Google)

- Fonte: `https://developer.apple.com/help/account/membership/D-U-N-S/`, aberta em 2026-11-08.
- "please allow up to 5 business days to receive your number from D&B. Expediting your D‑U‑N‑S Number creation process will not shorten this waiting period. If your application has taken longer than two weeks to process, please email D&B."
- Gratuito: "you'll have the option to submit your information to Dun & Bradstreet for a free D‑U‑N‑S Number." Antes de pedir, dá para checar se a empresa já tem número.
- "Once you receive your D‑U‑N‑S Number, please allow up to 2 business days for Apple to receive your information from D&B."

### 3.3 Google Play Console

- **Taxa:** "There is a US$25 one-time registration fee." Fonte: `https://support.google.com/googleplay/android-developer/answer/6112435?hl=en`, aberta em 2026-11-08. A página diz que a taxa não é devolvida se as informações de identidade forem consideradas inválidas.
- **Tipos de conta:** pessoal e de organização. "Verification requirements depend on the account type chosen." Fonte: mesma página.
- **Organização** (`https://support.google.com/googleplay/android-developer/answer/13628312?hl=en`, aberta em 2026-11-08): "You will not be able to create a developer account for an organization without one" (D-U-N-S). O D-U-N-S "can take up to 30 days". Itens exigidos: nome do desenvolvedor, D-U-N-S e nome e endereço da organização (conforme o perfil de pagamento), telefone e site da organização, contato com nome, e-mail e telefone, e e-mail e telefone do perfil do desenvolvedor. O e-mail de contato "should not be generic or a personal email address". Não diz se um `contato@` no domínio próprio é "genérico" [incerto].
- **Verificação de pagamento:** "Verification can take up to 5 days". Fonte: mesma página 13628312.
- **Pessoal** (mesma página 13628312): nome legal e endereço vêm do perfil de pagamento.
- **Pessoal, testes** (`https://support.google.com/googleplay/android-developer/answer/14151465?hl=en`, aberta em 2026-11-08): "Google Play requires personal developer accounts created after November 13, 2023, to test their apps." O teste fechado precisa de "minimum of 12 testers who have been opted in continuously for at least 14 days". Antes do pedido de produção, "you must run a closed test that meets Google Play criteria". A revisão "usually takes seven days or less".
- **Pessoal, dispositivo** (`https://support.google.com/googleplay/android-developer/answer/6112435?hl=en`, aberta em 2026-11-08): "personal account owners must verify access to an Android device" antes de publicar. A página 14151465 não trata desse ponto.

### 3.4 Qual conta

- **Organização** exige CNPJ e D-U-N-S. O repositório diz que a PJ ainda não existe (`app-store.md`, B5; `google-play.md`, B01). Então o caminho de organização depende da abertura da empresa.
- **Pessoal** não exige PJ, mas tem as etapas extras acima. Se a loja vai vender serviços como marketplace, a escolha entre tipo pessoal e organização é uma decisão de dono com aconselhamento; não é recomendação desta pesquisa.

## 4. E-mails oficiais e domínio transacional

### 4.1 Resend (domínio de envio)

Fonte: `https://resend.com/docs/add-a-domain`, aberta em 2026-11-08.

- Passos: adicionar o domínio no painel, "enter a domain that includes a subdomain", escolher a região de envio, opcionalmente definir subdomínio Return-Path (padrão `send.<domínio>`).
- Registros: "Provide the DKIM and SPF configurations" em TXT e MX ou CNAME. Os valores "must match exactly what Resend generated". Se aparecer CNAME, não usar proxy (como o do Cloudflare).
- Tempo: "your domain will often verify within 15 minutes"; pode levar "up to 72 hours"; depois disso, o botão "Restart verification".
- DMARC é um passo separado, depois da verificação.
- A página não diz se o registro vai no domínio raiz ou no subdomínio; manda conferir a aba Records.

Resultado: o remetente atual do código (`avisos@workeasy.com.br`) usa o domínio raiz. A página do Resend recomenda subdomínio para envio. A escolha (raiz ou subdomínio, por exemplo `avisos.`) é do dono e precisa ser conferida com o Resend antes de ajustar o código. Registro DNS só pode ser feito por quem controla o domínio.

### 4.2 Endereços (contato@, sac@, privacidade@)

- Não há fonte aberta que diga qual endereço é exigido. A LGPD e o Decreto 7.962/2013 não puderam ser abertos (planalto bloqueado). [incerto] Qualquer afirmação sobre obrigação de endereço de encarregado, SAC ou e-mail de contato precisa de leitura do texto oficial.
- Apple (seção 3.1): e-mail de trabalho associado ao domínio da organização. Isso favorece endereços no domínio próprio.
- Google (seção 3.3): e-mail de contato da organização "should not be generic or a personal email address". Não está claro se `contato@` conta como genérico.
- Repositório: `app-store.md`, linha 1071, lista "e-mail no domínio" como item de checklist; `google-play.md`, linha 368, cita Resend como provedor de e-mail transacional; `ARQUITETURA.md`, linha 576, cita Resend no `notify-dispatch`.

## 5. Checklist: custo, prazo, dependências

| # | Item | Custo | Prazo | Depende de | Quem |
|---|---|---|---|---|---|
| 1 | Confirmar titular de `workeasy.com.br` (e se o dono tem acesso à conta de registro) | 0 | Imediato | Nada | Dono |
| 2 | Se o titular for terceiro: escolher nome alternativo e conferir na consulta pública do Registro.br (página não aberta) | [incerto] | [incerto] | Item 1; regra de domínio equivalente | Dono |
| 3 | Registrar `.com.br` no Registro.br | [incerto]: trecho de busca diz R$ 40/ano, não conferido | [incerto] | CPF (maior de idade) ou CNPJ regular na Receita; titular conferido | Dono |
| 4 | Decidir se `br.com.workeasy` fica ou muda, antes de qualquer build enviado | 0 | Antes do primeiro upload | Decisões dos itens 2 e 5 | Dono |
| 5 | Checar a marca "WorkEasy" (apps parecidos na App Store) | [incerto] | [incerto] | Dossiê de INPI | Dono com advogado |
| 6 | Abrir a PJ (CNPJ) | [fora do escopo] | [fora do escopo] | Contador e advogado | Dono |
| 7 | Pedir o D-U-N-S da PJ | 0 (gratuito, segundo a Apple) | Apple: até 5 dias úteis, mais até 2 dias úteis para a Apple. Google: até 30 dias | PJ existente; dados da empresa | Dono |
| 8 | Conta Apple de organização | US$ 99 por ano (BRL [incerto]) | Aprovação [incerto]; D-U-N-S e +2 dias úteis | D-U-N-S; site público no domínio; e-mail no domínio; titular com poder legal | Dono (Account Holder) |
| 9 | Conta Google Play de organização | US$ 25, taxa única | D-U-N-S até 30 dias; verificação de pagamento até 5 dias | D-U-N-S; site da organização; e-mails | Dono |
| 10 | Alternativa: conta Google Play pessoal | US$ 25, taxa única | Teste de 12 testadores por 14 dias para produção; verificação de dispositivo Android | Dispositivo Android; testadores | Dono |
| 11 | Domínio de envio no Resend | [incerto] (plano não conferido) | 15 min a 72 h | Acesso ao DNS; decisão raiz ou subdomínio | Dono ou quem gerencia o DNS |
| 12 | DMARC depois da verificação do Resend | 0 | Após item 11 | Item 11 | Dono ou quem gerencia o DNS |
| 13 | Endereços contato@, sac@, privacidade@ | 0 | Após o domínio | Item 1; conferir exigências legais | Dono |

**Passos que só o dono pode fazer:**
- Confirmar quem é o titular de `workeasy.com.br` e se pode adquirir ou usar outro nome.
- Escolher o nome comercial e o identificador (`br.com.workeasy` ou outro). O repo afirma que o identificador fica fixo depois do primeiro upload (`google-play.md`, linha 134; `app-store.md`, linha 810). **Não verificado** em fonte oficial aberta: a página da Apple sobre criação de app não trata do assunto (aberta em 2026-11-08), e a documentação do Google sobre o nome do pacote não foi aberta com esse texto.
- Abrir a PJ e obter o D-U-N-S, com dados que só ele tem.
- Ser o titular da conta Apple (Account Holder) e aceitar os termos. Pagar a taxa e concluir a verificação de identidade.
- Entrar no Registro.br com gov.br ou certificado e-CNPJ, e pedir o registro ou a transferência.
- Configurar o DNS (registros do Resend e, se o caso, o DMARC).
- Para conta pessoal: verificar o dispositivo Android e recrutar os testadores.

## Perguntas para o profissional

1. O titular atual de `workeasy.com.br` é o próprio dono? Se não for, há caminho legal para adquirir o domínio ou só resta escolher outro nome? (Registro.br: regras de titularidade, [incerto])
2. Uma pessoa jurídica pode registrar `.com.br` na categoria de atividade comercial, com quais documentos e em quanto tempo? (Registro.br, [incerto])
3. A regra de "domínio equivalente" do Registro.br impede `workeasy.net.br` ou outros se `workeasy.com.br` pertencer a terceiros? (Registro.br, [incerto])
4. Quais endereços de contato são obrigatórios publicamente no site e no app (encarregado, SAC, atendimento)? Os textos da LGPD e do Decreto 7.962/2013 precisam ser lidos e interpretados. [incerto]
5. "WorkEasy" pode ser o nome do app nas lojas, dado que há apps publicados com nome parecido? Isso cruza com o pedido de marca no INPI (dossiê 02). (advogado de marca)
6. Para a conta de organização, o dono deve usar um e-mail do domínio próprio (`contato@`) ou um e-mail de pessoa responsável? A Google diz que o e-mail "should not be generic". (perguntar ao suporte do Google Play, com a resposta por escrito)
7. O remetente de e-mail transacional deve ficar no domínio raiz (`avisos@workeasy.com.br`) ou em subdomínio, como recomenda o Resend? Há impacto em reputação de envio? (técnico, com base na documentação do Resend)

## Fontes consultadas

Todas as datas são de abertura em 2026-11-08. "Aberta" = WebFetch retornou conteúdo lido. "Vazia" = WebFetch retornou texto vazio. "404" = HTTP 404. "Bloqueada" = página de bloqueio. "Busca" = trecho de resultado de busca, não aberto.

| URL | Norma, seção ou item | Situação |
|---|---|---|
| `https://rdap.registro.br/domain/workeasy.com.br` | RDAP do domínio | Aberta |
| `https://rdap.registro.br/domain/workeasy.net.br` | RDAP do domínio | 404 |
| `https://rdap.registro.br/domain/workeasyapp.com.br` | RDAP do domínio | 404 |
| `https://rdap.registro.br/domain/workeasybr.com.br` | RDAP do domínio | 404 |
| `https://rdap.registro.br/domain/meuworkeasy.com.br` | RDAP do domínio | 404 |
| `https://registro.br/dominio/regras/` | Regras do domínio (titularidade, nome, equivalência, uso) | Vazia; trechos em Busca |
| `https://registro.br/dominio/regras` | Idem | Vazia |
| `https://registro.br/dominio/` | Preço e sobre domínios | Vazia; trecho em Busca |
| `https://registro.br/dominio/categorias/` | Categorias (COM.BR) | Vazia; trecho em Busca |
| `https://registro.br/ajuda/registro-de-novos-dominios/` | Procedimento de registro | Vazia; trecho em Busca |
| `https://registro.br/ajuda/pagamento-de-dominio/` | Pagamento | Vazia |
| `https://registro.br/busca-dominio/` | Busca de disponibilidade | Vazia |
| `https://registro.br/tecnologia/ferramentas/whois/` | Consulta pública (whois) | Vazia |
| `https://registro.br/ajuda/procedimentos-administrativos/transferencia-de-titularidade/` | Transferência de titularidade | Busca (não aberta) |
| `https://developer.apple.com/programs/enroll/` | Inscrição; taxa US$ 99; organização; D-U-N-S; titular | Aberta |
| `https://developer.apple.com/help/account/membership/D-U-N-S/` | D-U-N-S: até 5 dias úteis; +2 dias úteis; gratuito | Aberta |
| `https://developer.apple.com/br/programs/` | Preço em BRL | 404 |
| `https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/` | Nome do app: um app por localização; reclamação por marca. Nada sobre bundle ID | Aberta |
| `https://support.google.com/googleplay/android-developer/answer/6112435?hl=en` | Taxa US$ 25, taxa única; tipos de conta; dispositivo Android em conta pessoal | Aberta |
| `https://support.google.com/googleplay/android-developer/answer/13628312?hl=en` | Dados exigidos; D-U-N-S até 30 dias; pagamento até 5 dias | Aberta |
| `https://support.google.com/googleplay/android-developer/answer/14151465?hl=en` | Teste para conta pessoal (12 testadores, 14 dias) | Aberta |
| `https://play.google.com/store/apps/details?id=br.com.workeasy` | Existência do pacote na loja | 404 |
| `https://itunes.apple.com/lookup?bundleId=br.com.workeasy&country=br` | Bundle ID publicado no Brasil | Aberta: `resultCount: 0` |
| `https://itunes.apple.com/search?term=workeasy&country=br&entity=software&limit=25` | Nomes parecidos publicados no Brasil | Aberta: 6 resultados |
| `https://resend.com/docs/add-a-domain` | Verificação de domínio, DKIM, SPF, DMARC | Aberta |
| `https://capacitorjs.com/docs/config` | `appId` e `appName` | Aberta (Version v8) |
| `https://v2.tauri.app/reference/config/` | `identifier`, `productName` | Aberta (100 mil de 151 mil caracteres) |
| `https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm` | LGPD (encarregado, contato) | Bloqueada |
| `https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm` | Decreto 7.962/2013 (e-commerce; atendimento) | Bloqueada |
| Repositório: `apps/web/capacitor.config.ts`, `apps/web/src-tauri/tauri.conf.json`, `apps/web/ios/App/App.xcodeproj/project.pbxproj`, `apps/web/android/app/build.gradle` | Identificadores atuais | Leitura por `grep` |
| Repositório: `apps/web/docs/lojas/app-store.md` (linhas 42, 76, 135, 143, 493, 810, 1071), `apps/web/docs/lojas/google-play.md` (linhas 19, 23, 35, 49, 112, 134, 368, 924), `apps/web/docs/ARQUITETURA.md` (linhas 57, 576) | Kit de lojas e documentação já escritos | Leitura por `grep` |
| Repositório: `apps/web/test/functions/notifications.test.ts` (linha 80), `webhook-notify.test.ts` (linha 609), `clients-http.test.ts` (linhas 66 a 81) | Uso de `avisos@workeasy.com.br` e origens de CORS | Leitura por `grep` |
