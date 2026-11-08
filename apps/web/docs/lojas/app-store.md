# App Store (iOS e macOS): ficha, privacidade e diretrizes

> **Rascunho para revisão de advogado. Não é parecer jurídico.**
> Documento S02 do plano. Estado do produto em 23/10/2026: protótipo (MVP em `main`), **não implantado, sem usuários, nada testado contra Asaas, WhatsApp ou Resend reais**. Este kit diz o que enviar à Apple **quando** houver backend no ar e um build de loja. Nada aqui afirma que o app foi enviado, aprovado, validado ou que cumpre qualquer norma. Texto de diretriz citado em inglês é trecho literal da página oficial lida em 23/10/2026; a leitura em português é nossa.

## Como ler

Marcas usadas no texto:

| Marca | Significa |
|---|---|
| **[PLANEJADO]** | Não existe no código hoje. Precisa ser feito antes de depender disso. |
| **[CONDICIONAL: depende de parecer]** | Depende de parecer do advogado (ou de decisão do dono apoiada nele). |
| **[incerto]** | Não consegui confirmar em fonte primária aberta, ou só o App Review decide. Conferir antes de agir. |

Documentos irmãos do plano que este texto cita (caminhos previstos, relativos a `apps/web/docs/`; alguns podem ainda não existir quando você ler):

| ID | Documento | Caminho |
|---|---|---|
| L01 | Termos de Uso | `juridico/01-termos-de-uso.md` |
| L02 | Termos do Prestador | `juridico/02-termos-do-prestador.md` |
| L03 | Política de Privacidade | `juridico/03-politica-de-privacidade.md` |
| L05 | Política de Avaliações e Moderação | `juridico/05-politica-de-avaliacoes-e-moderacao.md` |
| L06 | RIPD | `juridico/06-ripd-relatorio-de-impacto.md` |
| L10 | SAC e Atendimento | `juridico/10-sac-e-atendimento.md` |
| O07 | Playbook de suporte, disputas e moderação | `operacao/07-suporte-disputas-e-moderacao.md` |
| S01 | Google Play | `lojas/google-play.md` |
| S03 | Desktop e assinatura | `lojas/desktop-e-assinatura.md` |

Todas as URLs e datas das fontes estão na seção 14. Os fatos sobre o produto têm identificador (F01 a F44, seção 1) e apontam o arquivo onde conferir.

## 0. Resumo

**Veredito: não envie à App Review hoje.** Existem bloqueios de produto, de conta e de conteúdo (seção 12). Os seis que decidem tudo:

| # | Bloqueio | Diretriz | Seção |
|---|---|---|---|
| B1 | Termos e Política de Privacidade não existem (a rota `/legal` mostra texto provisório) | 5.1.1(i) | 12 |
| B2 | Conteúdo de demonstração aparece com o backend ligado (faixa "Protótipo de demonstração", pessoas e avaliações fictícias, telas de teleconsulta e prontuário) | 2.1(a), 2.2, 2.3.1 | 12 |
| B3 | A assinatura Pro (R$ 49/mês) é contratada dentro do app e paga fora da Apple | 3.1.1 | 3.2 |
| B4 | Avaliações, apresentações e pedidos são conteúdo de usuário sem denúncia, bloqueio, filtro nem contato publicado | 1.2, 1.5 | 8 |
| B5 | A conta Apple precisa ser de **organização** (PJ + D-U-N-S); a PJ ainda não existe | 5.1.1(ix), inscrição | 2 |
| B6 | Backend não implantado e sem conta de demonstração para o revisor | 2.1(a) | 7 |

Risco que não é bloqueio mas pode reprovar: **4.2 (funcionalidade mínima)**. O app iOS de hoje é o site empacotado mais duas permissões (seção 3.3).

O que já está certo para a Apple: exclusão de conta dentro do app; login próprio por código (sem login social, então Sign in with Apple não é exigido); localização opcional e com consentimento registrado; nenhum SDK de anúncio, de análise ou de falhas; ícone de 1024 px sem canal alfa.

### Decisões que só o dono pode tomar

| # | Decisão | Padrão sugerido aqui | Seção |
|---|---|---|---|
| D1 | Como tratar o plano Pro no iOS | Primeiro envio **sem** compra nem desbloqueio do Pro no iOS; depois escolher entre Apple IAP e a opção do Brasil | 3.2 |
| D2 | macOS: só DMG notarizado, ou também Mac App Store | Só DMG (sem App Review) | 11 |
| D3 | iPad: manter ou restringir a iPhone | Manter; exige capturas de iPad 13" | 4.7 |
| D4 | Linha Cuidado no build iOS | Fora do primeiro envio (DECISOES D12) | 12 |
| D5 | Idade mínima nos Termos (define se a classificação da Apple precisa subir para 18+) | Decidir com o advogado | 6 |
| D6 | Nome do app e marca | "WorkEasy", depois de INPI e de checar o nome no App Store Connect | 4.2 |
| D7 | Disponibilidade | Só Brasil no piloto | 4.8 |

### Ordem recomendada

1. **Fase 0, assim que a conta de organização existir (B5), sem revisão**: TestFlight **interno** (até 100 usuários do App Store Connect) para você e a equipe. A própria Apple manda usar TestFlight para demos e betas (diretriz 2.2). O site já é PWA (`vite-plugin-pwa`) e funciona como alternativa sem loja.
2. **Fase 1**: resolver B1 a B6, o risco 4.2 e as lacunas de Info.plist (seções 9 e 12).
3. **Fase 2**: TestFlight **externo** (o primeiro build passa por Beta App Review).
4. **Fase 3**: envio à App Store, disponibilidade só Brasil, liberação manual.
5. **macOS**: DMG assinado e notarizado, distribuído pelo site (seção 11). Não passa pela App Review.

## 1. O que a Apple vai encontrar no produto (fatos conferidos no repositório)

Todos os caminhos são relativos a `apps/web/`. Conferido em 23/10/2026 no branch `claude/plano-restante`.

| ID | Fato | Onde conferir |
|---|---|---|
| F01 | iOS = Capacitor 8.5.2 (WKWebView), `appId` `br.com.workeasy`, `appName` WorkEasy | `capacitor.config.ts`, `package.json` |
| F02 | O bundle ID do iOS e o `identifier` do Tauri (macOS) são o mesmo: `br.com.workeasy` | `ios/App/App.xcodeproj/project.pbxproj`, `src-tauri/tauri.conf.json` |
| F03 | A interface vai dentro do binário (`webDir: dist`). Não há `server.url`: nada é carregado de site remoto. Os dados vêm da API Supabase depois do login | `capacitor.config.ts` |
| F04 | Único plugin nativo: `@capacitor/app` (só trata o botão voltar do Android). Não há plugin de câmera, geolocalização, push nem compartilhamento | `ios/App/CapApp-SPM/Package.swift`, `platform/native.ts` |
| F05 | iOS 15.0 ou superior; iPhone e iPad (`TARGETED_DEVICE_FAMILY = "1,2"`); versão 1.0, build 1 | `project.pbxproj` |
| F06 | Assinatura `Automatic`, sem `DEVELOPMENT_TEAM`. O CI só gera build de iOS para simulador e instaladores sem assinatura | `project.pbxproj`, `.github/workflows/web-release.yml` (raiz do repo) |
| F07 | Ícone 1024×1024, RGB, sem canal alfa (conferido no PNG) | `ios/App/App/Assets.xcassets/AppIcon.appiconset/` |
| F08 | `Info.plist` do iOS tem `NSLocationWhenInUseUsageDescription` e `NSCameraUsageDescription`. Não tem `ITSAppUsesNonExemptEncryption`. Tem `UIRequiredDeviceCapabilities = armv7` (padrão do Capacitor) | `ios/App/App/Info.plist` |
| F09 | No código-fonte do Capacitor 8.5.2 (`node_modules/@capacitor/ios`), Capacitor e CapacitorCordova trazem `PrivacyInfo.xcprivacy` vazio (sem tipos de dado nem APIs de motivo obrigatório). O projeto Xcode, porém, usa o pacote binário `capacitor-swift-pm` 8.5.2, que não abri. O alvo `App` não tem manifesto próprio. `@capacitor/app` não usa API de motivo obrigatório (busca no código-fonte do plugin) | `node_modules/@capacitor/ios/**/PrivacyInfo.xcprivacy`, `ios/App/CapApp-SPM/Package.swift`, `ios/App/App/` |
| F10 | Login por código de 6 dígitos, por e-mail ou SMS (Supabase Auth), sem senha, com caixa "Li e aceito os Termos de Uso e a Política de Privacidade". Sem login social (`[auth.external.apple] enabled = false`) | `pages/conta/Entrar.tsx`, `supabase/config.toml` |
| F11 | Sem login dá para navegar categorias, busca e páginas de serviço. O pedido pode ser preenchido sem login, mas o envio exige login ("Entrar para enviar") | `AppShell.tsx`, `pages/cliente/Pedido.tsx` |
| F12 | Localização: `navigator.geolocation` (6 casas decimais) só no registro de entrada ou saída de plantão. É opcional (caixa marcada pelo cuidador), o consentimento `location` é gravado antes de ler a posição e, sem localização, o registro vale | `platform/geolocation.ts`, `components/cuidado/CheckinPanel.tsx` |
| F13 | Câmera: `getUserMedia({ video })` só em `/verification`, que é simulação (nada capturado, enviado ou guardado; o perfil não ganha selo) | `pages/Verification.tsx` |
| F14 | Arquivos: `<input type="file">` em `/pro/cadastro` aceita JPG, PNG, WebP, HEIC e PDF, até 10 MB, para o bucket privado `provider-documents`. Sem vídeo, logo sem microfone | `pages/pro/Cadastro.tsx`, `services/providers.ts` |
| F15 | Push não existe. Notificações saem por WhatsApp ou e-mail (`notify-dispatch`); o enum de canal só tem `whatsapp` e `email` | `docs/ARQUITETURA.md`, `supabase/functions/notify-dispatch/` |
| F16 | Pagamento de serviços: Pix, boleto ou cartão pelo Asaas. O Pix mostra o código copia e cola e o QR Code dentro do app; o boleto e o cartão usam a fatura na página do Asaas, aberta fora do app. O app não recebe dados de cartão | `components/cliente/PaymentPanel.tsx`, `docs/ARQUITETURA.md` |
| F17 | O Capacitor iOS abre no sistema (`UIApplication.shared.open`) toda navegação de topo para fora do app (WhatsApp, fatura do Asaas, fontes das políticas) | `node_modules/@capacitor/ios/Capacitor/Capacitor/WebViewDelegationHandler.swift` |
| F18 | Plano Pro: formulário "Assinar o Pro" em `/pro/assinatura`, com link externo "Abrir a fatura do primeiro pagamento". Chamadas para o Pro também em Painel ("Conhecer o plano Pro"), Cobranças ("Ver o plano Pro"), na aba "Assinatura" e na mensagem de `free_proposal_limit` | `pages/pro/Assinatura.tsx`, `pages/pro/Painel.tsx`, `pages/pro/Cobrancas.tsx`, `components/pro/ProNav.tsx`, `lib/errors.ts` |
| F19 | Comissão e pagamento retido existem no servidor e começam desligados (`commission_enabled` e `escrow_enabled` = false por padrão). A tela de administração `/admin/configuracoes` tem os dois interruptores: ligar exige digitar uma frase de confirmação, e a tela avisa que depende de parecer jurídico e de conta Asaas configurada | `docs/ARQUITETURA.md`, `docs/DECISOES.md`, `config/features.ts`, `pages/admin/Configuracoes.tsx`, `components/admin/SettingRows.tsx` |
| F20 | Avaliações: só depois de atendimento pago pelo app; nota de 1 a 5; comentário até 1000 caracteres. A página pública do prestador lista só as publicadas, e só nas ocupações com ranking por nota. O admin pode ocultar por política RLS (`reviews_admin_update`), mas não há tela para isso | `supabase/migrations/20261019000007_quotes_reviews.sql`, `pages/publico/PaginaPrestador.tsx` |
| F21 | Não existem no app: denunciar conteúdo, bloquear usuário, filtro antes de publicar, contato de suporte. Avaliações nascem publicadas (`published default true`) | busca por "denunciar" e "bloquear" no código (sem resultado) |
| F22 | Exclusão: Menu → Minha conta → seção "Excluir minha conta" → digitar EXCLUIR. A função `account-delete` recusa (409 `active_bookings`) se há atendimento aceito, pago, em andamento ou em disputa. Cancela Pro e cobranças abertas, apaga documentos, anonimiza e apaga o usuário do Auth | `pages/conta/Conta.tsx`, `supabase/functions/account-delete/handler.ts` |
| F23 | `anonymize_user` apaga o texto do comentário das avaliações, mas a nota (1 a 5) fica, sem vínculo com a pessoa | `supabase/migrations/20261019000010_privacy_audit.sql` |
| F24 | Minha conta tem "Baixar meus dados" (função `account-export`, arquivo JSON) e a lista de consentimentos com "Revogar" para marketing, consulta de antecedentes e localização (Termos e Política não são revogáveis; a saída é excluir a conta) | `pages/conta/Conta.tsx` |
| F25 | `/legal` mostra "Documentos em elaboração". As versões de consentimento de Termos e Política são `2026-10-rascunho` (as de marketing, antecedentes e localização são `2026-10`) | `pages/LegalDocs.tsx`, `config/legal.ts` |
| F26 | A faixa "Protótipo de demonstração. Dados fictícios…" aparece sempre, inclusive com backend. O rodapé diz "Protótipo de demonstração". A página de cada serviço diz "Nesta demonstração, nada é coletado ou conferido" e mostra "Base legal a confirmar com advogado" em 1.057 das 1.710 ocupações | `AppShell.tsx`, `components/DemoBanner.tsx`, `pages/OccupationPage.tsx`, `pages/OccupationNeighborhoodPage.tsx` |
| F27 | Rotas de demonstração seguem acessíveis com backend ligado: `/search`, `/health`, `/doctor/:id`, `/profile/:id`, `/dashboard`, `/verification`, `/teleconsultation/:sessionId`, `/medical-records`, `/register-provider` (formulário que não envia nada). A categoria "Saúde" da Home leva a `/health` | `AppShell.tsx`, `pages/Home.tsx`, `pages/ProviderRegistration.tsx` |
| F28 | Essas telas usam `MOCK_PROVIDERS`: profissionais fictícios com nota, contagem de opiniões e `verified: true` | `constants.tsx`, `pages/Search.tsx`, `pages/HealthSearch.tsx` |
| F29 | Nenhum SDK de análise, anúncio ou falhas. O cliente nunca chama `log_event` | `package.json`, busca no código |
| F30 | `request-assist` (IA, Anthropic) existe só no servidor. Nenhuma tela do cliente a chama | `supabase/functions/request-assist/`, busca por `invokeFunction` |
| F31 | Dados enviados ao Asaas: do pagador (nome, CPF/CNPJ, e-mail, celular) e, na ativação do recebimento, nome, e-mail, CPF/CNPJ, nascimento, tipo de empresa, celular, renda ou faturamento mensal e endereço. O servidor guarda só ids, status e a chave no Vault; `payments.raw` guarda o retorno do gateway até a anonimização | `supabase/functions/payments-create/handler.ts`, `asaas-onboard/handler.ts` |
| F32 | Catálogo: 44 áreas, 1.710 ocupações; 653 `conferido` e 1.057 `a_confirmar` | `catalog/areas.json`, `catalog/policies.json` |
| F33 | Linha Cuidado: casa, pessoa assistida (`first_name`, `birth_year`, `preferences`, `emergency_contact`), plantões, check-ins e relatório diário (refeições, atividades, humor, observações). O menu "Cuidado" aparece para todo cliente logado e o menu "Plantões" para todo profissional; nenhuma chave de funcionalidade esconde as rotas | `docs/ARQUITETURA.md`, `components/navItems.ts`, `AppShell.tsx` |
| F34 | `.env.native` só define `VITE_ROUTER=hash`. Sem `VITE_SUPABASE_URL`, o build nativo sai em modo demonstração | `.env.native`, `lib/supabase.ts` |
| F35 | O `supabase/config.toml` local tem um par fixo de teste de SMS (`[auth.sms.test_otp]`) e Twilio com valores `local-placeholder` | `supabase/config.toml` |
| F36 | Tauri: CSP com `connect-src 'self' ipc: http://ipc.localhost` (sem o domínio do Supabase); sem entitlements; `Info.plist` com as duas chaves de uso; categoria `Business`; copyright em nome de pessoa física; `longDescription` diz "Protótipo de demonstração"; versão 0.1.0 | `src-tauri/tauri.conf.json`, `src-tauri/Info.plist` |
| F37 | O WebView do Capacitor concede por padrão a captura de mídia pedida pela página (o aviso do sistema continua dependendo do `Info.plist`) | `WebViewDelegationHandler.swift` |
| F38 | Local: bairros escolhidos à mão em pedidos, prestadores e casas. A posição do aparelho só existe no check-in | `docs/ARQUITETURA.md`, F12 |
| F39 | A tela de exclusão afirma que "a lei fiscal obriga a guardar" os registros; o `DECISOES.md` marca o prazo como [incerto] | `pages/conta/Conta.tsx`, `docs/DECISOES.md` |
| F40 | Nenhum canal de suporte (e-mail, telefone, formulário) aparece em qualquer tela, embora várias mensagens do app mandem "Fale com o suporte" (prestador suspenso, falha no recebimento, conta bloqueada) | `components/pro/labels.ts`, `lib/errors.ts`, `pages/pro/Assinatura.tsx`; busca por `mailto:` e `tel:` sem resultado |
| F41 | Perguntas ao advogado já registradas: termos e privacidade (5), exclusão com anonimização (6), teste de 30 dias com cobrança automática (7) | `docs/DECISOES.md` |
| F42 | A busca do catálogo roda no aparelho (catálogo empacotado). `search_providers` só é chamada na página de serviço, com backend | `utils/search.ts`, `services/discovery.ts` |
| F43 | As páginas de serviço mostram a linha "Cobrança da plataforma" com a regra prevista (por exemplo "Comissão só no primeiro serviço com cliente novo trazido pelo WorkEasy"), embora a comissão esteja desligada | `catalog/labels.ts`, `pages/OccupationPage.tsx` |
| F44 | Área de administração em `/admin`, só para quem está na tabela `admins` (o menu "Administração" só aparece para elas): Painel, Prestadores (documentos, registro, aprovação e suspensão, com motivo obrigatório), Disputas, Pagamentos, Configurações, Auditoria e Solicitações de dados (LGPD). Não há tela para avaliações, denúncias nem bloqueio de cliente | `pages/admin/routes.tsx`, `pages/admin/*.tsx`, `components/navItems.ts`, `supabase/migrations/20261019000001_identity.sql` |

### Dois fatos que mudam a conversa com a Apple

- **O iOS de hoje não usa nenhum recurso nativo além de permissões** (F04, F12 a F14). Localização e arquivos funcionam por APIs web dentro do WebView. Isso é verdade e deve ser dito assim nas notas (seção 7), sem chamar de "recurso nativo" o que é API web.
- **Os recursos de câmera citados no `Info.plist` hoje só servem a uma tela de simulação** (F13). Se o seletor de arquivos do iOS oferecer "Tirar Foto" no cadastro do profissional, a câmera passa a ser usada para um fim diferente do que o texto atual descreve (seção 9).

## 2. Conta Apple (pré-requisito de tudo)

A diretriz 5.1.1(ix) diz: "Apps that provide services in highly regulated fields (such as banking and financial services, healthcare, gambling, legal cannabis use, air travel and crypto exchanges) or that require sensitive user information should be submitted by a legal entity that provides the services, and not by an individual developer." O WorkEasy intermedeia cobranças por Pix, boleto e cartão, tem profissões de saúde no catálogo e recebe documentos de identidade e certidões. Portanto: **conta de organização**, em nome da PJ do WorkEasy (DECISOES §8, item 3), não em nome de pessoa física nem da Pulso Vital.

O que a Apple verifica na inscrição de organização (página oficial, 23/10/2026):

| Requisito | Texto oficial (trecho) |
|---|---|
| Poder de representação | "you'll be the Account Holder and must have the legal authority to bind your organization to legal agreements" |
| Entidade legal | "Your organization must be a legal entity that can enter into contracts with Apple. We do not accept DBAs, fictitious business names, trade names, or branches." O nome da organização é exibido como vendedor do app |
| D-U-N-S | "Your organization (excluding government entities) must have a D-U-N-S Number" (número de 9 dígitos da Dun & Bradstreet; a Apple diz que dá para pedir um se não houver) |
| E-mail | "Your work email address needs to associated with your organization's domain name" |
| Site | "must be publicly available and functional, and its domain name must be associated with your organization"; páginas de rede social ou com pouco conteúdo "won't be accepted" |
| Preço | "99 USD per membership year" (em moeda local na hora da compra) |

Ordem de execução:

- [ ] PJ aberta, com razão social e CNPJ definitivos (será o "vendedor" na loja e o titular do copyright).
- [ ] D-U-N-S da PJ solicitado e confirmado. Prazo: [incerto], a Apple não informa.
- [ ] Site público no domínio da PJ, com identificação da empresa e contato (serve também ao SAC, documento L10, e à URL de suporte).
- [ ] E-mail no domínio (para o Account Holder e para o contato da App Review).
- [ ] Inscrição no Apple Developer Program como organização, por quem tem poder de representação.
- [ ] O Account Holder aceita o contrato mais recente na seção Business do App Store Connect: "You can't add an app to your account until the Account Holder signs the latest agreement in the Business section."
- [ ] Usuários e papéis (tabela abaixo). Em equipe de uma pessoa só, o Account Holder faz tudo.
- [ ] Busca de marca "WorkEasy" no INPI (DECISOES §8, item 6) **antes** de criar o app. O nome também precisa estar livre no App Store Connect: "You can use an app name for one app per localization."

Papéis mínimos para cada tarefa deste documento (páginas de ajuda do App Store Connect, 23/10/2026):

| Tarefa | Papéis que podem |
|---|---|
| Criar o registro do app | Account Holder, App Manager, Admin |
| Enviar build | Account Holder, Admin, App Manager, Developer |
| Responder App Privacy | Account Holder, Admin, App Manager |
| Classificação etária | Account Holder, Admin, App Manager, Marketing |
| Questionário de bens e serviços digitais | Account Holder, Admin, App Manager |
| Criar certificado Developer ID (macOS fora da loja) | Somente o Account Holder (documentação do Tauri) |

Contas gratuitas do Apple Developer não notarizam: a documentação do Tauri avisa que com conta gratuita não é possível notarizar o app, que então abre no macOS com aviso de aplicativo não reconhecido.

## 3. Diretrizes que se aplicam ao WorkEasy hoje

Fonte: App Review Guidelines, "Last Updated: October 16, 2026", lida em 23/10/2026. Trechos literais em inglês; coluna "Hoje" em português, com os fatos da seção 1.

### 3.1 Quadro geral

| Diretriz | O que diz (trecho oficial) | Hoje | Ação |
|---|---|---|---|
| 2.1(a) | "include demo account info (and turn on your back-end service!) if your app includes a login" e "placeholder text, empty websites, and other temporary content should be scrubbed before submission" | Backend não implantado; `/legal` provisório; textos de demonstração (F25 a F28) | Seções 7 e 12 |
| 2.2 | "Demos, betas, and trial versions of your app don't belong on the App Store – use TestFlight instead." | Faixa e rotas de demonstração (F26, F27) | TestFlight na fase 0; remover do build de loja |
| 2.3.1(a) | "All new features, functionality, and product changes must be described with specificity in the Notes for Review" | Há recursos desligados no servidor (F19) e telas só de admin (F44) | Descrever nas notas (seção 7) |
| 2.5.19 | "Don't include any hidden, dormant, or undocumented features in your app" | Comissão e pagamento retido existem no servidor, desligados, com interruptor na tela de admin (F19, F44) | Citar nas notas; descrever antes de ligar |
| 2.3.6 | "Answer the age rating questions in App Store Connect honestly" | Questionário ainda não respondido; depende da idade mínima dos Termos | Seção 6 |
| 2.3.7 | "App names must be limited to 30 characters"; subtítulos "should not ... make unverifiable product claims" | Nome e subtítulo propostos têm até 24 caracteres e nenhuma promessa | Textos medidos por script (seção 4.2) |
| 2.3.9 | "you should display fictional account information instead of data from a real person" | Capturas de tela | Usar só as contas de demonstração |
| 3.1.1, 3.1.3(e) | "If you want to unlock features or functionality within your app, (by way of example: subscriptions, ...), you must use in-app purchase." E para serviços físicos: "you must use purchase methods other than in-app purchase" | Pro cobrado fora da Apple (F18); pagamento de serviços pelo Asaas (F16) | Seção 3.2 |
| 4.2 | "include features, content, and UI that elevate it beyond a repackaged website" | Risco alto: site empacotado mais permissões (F03, F04) | Seção 3.3 |
| 4.8 | "Another login service is not required if:" e, como primeiro item, "Your app exclusively uses your company's own account setup and sign-in systems." | Login próprio por código (F10) | Nada a fazer. Se um dia houver login Google ou similar, a 4.8 passa a exigir "another login service" equivalente, com três características: limitar a coleta a nome e e-mail, permitir e-mail privado e não coletar interações para anúncio sem consentimento. O texto não nomeia o Sign in with Apple |
| 5.1.1(i) | "All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app in an easily accessible manner" | Política não publicada (F25) | B1 |
| 5.1.1(ii) | "Ensure your purpose strings clearly and completely describe your use of the data." E: "Apps must also provide the customer with an easily accessible and understandable way to withdraw consent." | Texto da câmera impreciso (F08, F13, F14). A revogação existe em Minha conta (F24) | Seção 9 |
| 5.1.1(iii) | "use the out-of-process picker or a share sheet rather than requesting full access to protected resources like Photos or Contacts" | O cadastro usa o seletor do sistema (F14); não há `NSPhotoLibraryUsageDescription` | Manter assim; testar no aparelho |
| 5.1.1(iv) | "if a user declines to share Location, offer the ability to manually enter an address" | O check-in vale sem localização (F12) | Nada a fazer |
| 5.1.1(v) | "If your app supports account creation, you must also offer account deletion within the app." | Existe (F22) | Seção 8.4 |
| 5.1.1(ix) | Citada na seção 2 | Sem PJ | Seção 2 |
| 5.1.2(i) | "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." E o app "may not require users to enable system functionalities (such as push notifications, location services, tracking)" | Localização opcional (F12). IA não exposta (F30). Dados vão ao Asaas, Meta (WhatsApp), Resend e provedor de SMS (F31, F15) | Política de privacidade (L03) deve listar cada um; se a IA for ligada, pedir consentimento explícito antes de enviar o texto |
| 5.1.5 | "Ensure that you notify and obtain consent before collecting, transmitting, or using location data." | Caixa de consentimento + aviso do sistema (F12) | Nada a fazer |
| 1.2 | Quatro exigências para conteúdo de usuário (seção 8) | Nenhuma está completa: só há barreiras indiretas e a suspensão de prestador pelo admin (F20, F21, F40, F44) | B4 |
| 1.5 | "Make sure your app and its Support URL include an easy way to contact you" | Sem canal (F40) | Seção 8.3 |
| 1.4.1 | "Medical apps that could provide inaccurate data or information, or that could be used for diagnosing or treating patients may be reviewed with greater scrutiny." | Telas fictícias de médico, teleconsulta e prontuário acessíveis (F27) | Remover do build de loja |
| 3.2.2(v) | "Arbitrarily restricting who may use the app, such as by location or carrier." (inaceitável) | Disponibilidade só Brasil | Explicar a razão nas notas: área de atendimento é São Paulo e preços em reais |
| 4.5.4 | "Push Notifications must not be required for the app to function" | Não há push (F15) | Vale quando houver push |

### 3.2 Pagamentos: 3.1.3(e) para serviços, 3.1.1 para o plano Pro

O app mistura dois tipos de dinheiro. A Apple trata cada um por uma regra.

| Fluxo no WorkEasy | Natureza | Regra | Conclusão |
|---|---|---|---|
| Cliente paga o profissional por um atendimento marcado no app (Pix, boleto, cartão no Asaas) | Serviço físico, consumido fora do app | 3.1.3(e) | Meio de pagamento que **não** seja IAP. Pode seguir como está |
| Profissional cobra cliente próprio ou orçamento aceito | Idem; a ferramenta de cobrar é do plano Pro | 3.1.3(e) para o pagamento; 3.1.1 para o plano | Ver abaixo |
| Comissão sobre o primeiro serviço (desligada) | Parte do pagamento de serviço físico | 3.1.3(e) | [CONDICIONAL: depende de parecer], pelos portões da DECISOES §4. Descrever nas notas antes de ligar |
| Assinatura Pro, R$ 49/mês, com 30 dias grátis | Desbloqueia funções do app | 3.1.1 | Não pode ser cobrada só pelo Asaas dentro do app, salvo a exceção do Brasil |

**Texto oficial de 3.1.3(e):** "If your app enables people to purchase physical goods or services that will be consumed outside of the app, you must use purchase methods other than in-app purchase to collect those payments, such as Apple Pay or traditional credit card entry."

**Como responder** (já incluído nas notas da seção 7): serviços físicos, consumidos fora do app; Pix, boleto ou cartão no Asaas; o app nunca recebe dados de cartão; por 3.1.3(e) não se usa IAP. Esta resposta cobre os pagamentos entre cliente e profissional. **Ela não cobre o plano Pro.**

**Por que o Pro cai em 3.1.1.** A regra diz: "If you want to unlock features or functionality within your app, (by way of example: subscriptions, ...), you must use in-app purchase." O Pro libera propostas sem limite e a cobrança de clientes próprios (F18). As saídas da 3.1.3 não servem: 3.1.3(c) (serviços corporativos) vale para apps vendidos a organizações e termina com "Consumer, single user, or family sales must use in-app purchase" (o comprador do Pro é um profissional isolado); 3.1.3(b) deixa usar no app o que foi comprado na web só "provided those items are also available as in-app purchases within the app". E a introdução da 3.1.3 proíbe, dentro do app, "encourage users to use a purchasing method other than in-app purchase, except for apps on the United States storefront and as set forth in 3.1.1(a) and 3.1.3(a)". Leitura nossa; quem decide é a App Review [incerto].

**O que mudou para o Brasil.** Em 18/06/2026 a Apple anunciou mudanças no iOS no Brasil por acordo com o CADE: "Beginning with iOS 26.5, developers can ... process app payments for digital goods and services outside of Apple In-App Purchase". A página "Payment options on the App Store in Brazil" (lida em 23/10/2026) descreve duas opções além do IAP: pagamentos dentro do app com outro processador, e "Out-of-app offers that direct users to purchase digital goods and services available on a website in a web browser, whether or not you use an actionable link". Ambas exigem a entitlement `com.apple.developer.storekit.custom-purchase-link.allowed-regions` com o valor `br`, válida só na loja do Brasil, em iPhone com iOS 26.5 ou superior.

**Três caminhos para o Pro no iOS (decisão D1):**

| | A. Sem compra nem desbloqueio do Pro no iOS | B. Apple In-App Purchase | C. Opção do Brasil (processador próprio ou oferta fora do app) |
|---|---|---|---|
| O que muda no app | Esconder no iOS o formulário e o link da fatura (F18), a aba "Assinatura", os botões "Conhecer/Ver o plano Pro" e a frase de `free_proposal_limit` que manda assinar. **Manter** a seção "Recebimento" (conta Asaas para receber de clientes), que é de natureza 3.1.3(e). Detectar o iOS no cliente (`Capacitor.isNativePlatform()` já é usado; para separar iOS de Android, conferir `Capacitor.getPlatform()` na documentação do Capacitor) | Assinatura renovável no App Store Connect; compra e "restaurar compras" no app; Edge Function que receba as notificações do servidor da App Store e atualize `subscriptions` e `providers.plan`. A diretriz 3.1.1 pede "a restore mechanism" | Entitlement + folha de aviso "você está comprando do desenvolvedor, não da Apple"; checar `isEligible`; pedir tokens; **relatório mensal** à Apple pela External Purchase Server API; se houver link ou pagamento alternativo, o IAP precisa aparecer ao lado, "at least as prominently" |
| Comissão da Apple (página lida em 23/10/2026) | Nenhuma, nada é vendido no iOS | 21% de comissão mais 5% de processamento (26%); 10% mais 5% (15%) para quem está no Small Business Program e para assinaturas depois do 1º ano | Pagamento alternativo no app: 21% (10% no Small Business Program). Oferta fora do app com link clicável: 15% sobre vendas até 7 dias depois do toque (10% no programa). Oferta só em texto, sem link: a página não diz a taxa [incerto] |
| Exemplo com R$ 49,00 [estimativa aritmética, sem impostos] | R$ 0 | R$ 12,74 (26%) ou R$ 7,35 (15% no programa) | R$ 7,35 (link, 15%) ou R$ 4,90 (10%); R$ 10,29 (processador alternativo, 21%) |
| Esforço de código | Baixo | Alto: pacote nativo novo (dependência a decidir) e função de servidor [PLANEJADO] | Alto: StoreKit, relatórios, folha de aviso, controle parental [PLANEJADO] |
| Riscos | Quem comprou o Pro na web e usa o iOS pode contar como acesso a "features they have acquired in your app on other platforms or your web site" (3.1.3(b)) [incerto]. Aceitável no lançamento (ninguém tem Pro ainda) | Perde-se parte da margem (DECISOES D2 estimou margem bruta acima de 95% com o Asaas) | Pede que o processador cumpra PCI nível 1 e tenha atendimento a disputas e reembolsos; a situação do Asaas nisso é [incerto]. Para menores de 18 anos, sem oferta fora do app |

Elegibilidade ao Small Business Program: até US$ 1 milhão em "proceeds" no ano anterior e no corrente (página do programa, 23/10/2026). Para o Brasil, as taxas do programa estão na tabela de comissões da página acima.

**Recomendação para o primeiro envio: caminho A**, com estas providências: (1) a resposta "Não" à pergunta "Can customers consume digital goods and services in this app?" no questionário do App Store Connect só vale se nenhuma tela do iOS vender ou desbloquear o Pro [incerto]; se esse questionário não aparecer para o app, a Apple diz "no action is required"; (2) ficha da loja sem menção a plano pago (a regra 2.3.2 pede indicar compras adicionais quando existem; a página do Brasil diz que a ficha "may not include information about purchasing on your website or with alternative payment processing"); (3) pedir à Apple uma conversa antes de escolher B ou C: a notícia de 18/06/2026 oferece "a 30-minute online appointment". Perguntas para levar: 3.1.3(b) vale para Pro comprado na web? Oferta só em texto tem comissão e relatório? O Asaas atende ao requisito de PSP?

Para o Android o Google Play tem regras próprias de cobrança; ver `google-play.md` (documento S01).

### 3.3 Funcionalidade mínima (4.2): risco alto hoje

Texto: "Your app should include features, content, and UI that elevate it beyond a repackaged website. If your app is not particularly useful, unique, or 'app-like,' it doesn't belong on the App Store."

**Autoavaliação honesta.** O app iOS é o site empacotado (F03) mais duas permissões que usam APIs web (F12 a F14). Não há recurso nativo próprio (F04). O site já faz tudo isso. Em contrapartida: a interface vai no binário, o app tem contas, papéis, agenda, pedidos, propostas, orçamentos e cobranças, e não é "marketing material" nem "collection of links" (4.2.2). O App Review decide caso a caso [incerto]. Se rejeitar por 4.2, responda com a lista de funções do app e, se preciso, acrescente as da lista abaixo.

**O que reforça o app sem inventar nada** (cada item é [PLANEJADO]: exige dependência nova no projeto e decisão do dono):

1. Notificações push por APNs (proposta recebida, atendimento aceito, lembrete 24 h antes): hoje saem por WhatsApp e e-mail. Exige capability de push, chave APNs, plugin e novo canal `push` no servidor. Diretriz 4.5.4: o app não pode depender de push nem usá-lo para marketing sem consentimento.
2. Compartilhar orçamento pela folha de compartilhamento do sistema (hoje usa link `wa.me`).
3. Seletor de foto com câmera nativa para documentos, em vez do campo de arquivo web.

**Caminho sem risco 4.2 enquanto isso:** a fase 0 (TestFlight interno) e o site, que já gera manifesto e service worker de PWA (`vite-plugin-pwa`) e abre no Safari do iPhone sem passar pela App Review.

### 3.4 Login e IA de terceiros

- **4.8:** não exige segundo serviço de login (nem o Sign in with Apple), porque o login é só da casa (F10). A configuração local tem `[auth.external.apple] enabled = false`; se alguém ligar login social, a conclusão muda.
- **5.1.2(i) e IA:** `request-assist` envia texto livre do cliente à Anthropic pelo servidor (F30). Hoje nenhuma tela chama. Se for ligada: aviso claro de que o texto vai a um terceiro de IA, consentimento explícito antes do envio, menção na política de privacidade e atualização das respostas de App Privacy.

## 4. Ficha da loja (pt-BR)

### 4.1 Campos e limites oficiais

Fonte: App Store Connect Help, "App information" e "Platform version information", lidas em 23/10/2026.

| Campo | Limite oficial | Obrigatório |
|---|---|---|
| Nome | 2 a 30 caracteres; único por idioma ("one app per localization") | Sim |
| Subtítulo | até 30 caracteres | Não |
| Texto promocional | até 170 caracteres; muda sem nova versão | Não |
| Descrição | até 4000 caracteres, texto simples (sem HTML) | Sim |
| Palavras-chave | até **100 bytes** (cada uma com mais de 2 caracteres); não repetir nome do app nem da empresa; sem nomes de outros apps ou empresas | Sim |
| URL de suporte | deve levar a contato real: "legal address, email address, telephone number, as may be required by local law" | Sim |
| URL de marketing | opcional | Não |
| URL da política de privacidade | "Required for iOS and macOS apps" | Sim |
| Copyright | ano e nome de quem detém os direitos (o símbolo © é automático) | Sim |
| O que há de novo | até 4000 caracteres; indisponível na primeira versão | A partir da 2ª versão |
| Notas para a revisão | até **4000 bytes**, em qualquer idioma | Recomendado |
| Capturas de tela | de 1 a 10 por tamanho de aparelho, JPEG ou PNG, sem canal alfa nem transparência | Sim |
| Bundle ID | não muda depois do primeiro build enviado; deve ser igual ao do Xcode | Sim |

Como acentos ocupam 2 bytes em UTF-8, **palavras-chave e notas são medidas em bytes**, não em caracteres. O script do apêndice A mede tudo.

### 4.2 Textos prontos

Os blocos abaixo são lidos pelo script do apêndice A (`campo=`, `limite=`, `unidade=`). Se alterar um texto, rode o script de novo. Nada aqui foi publicado: os textos descrevem o que o app fará **quando** o backend estiver no ar e o build de loja estiver limpo (seção 12).

**Nome** (opção A recomendada; confirmar INPI e disponibilidade no App Store Connect):

```text campo=nome-opcao-a limite=30 unidade=caracteres
WorkEasy
```

```text campo=nome-opcao-b limite=30 unidade=caracteres
WorkEasy Serviços
```

**Subtítulo**:

```text campo=subtitulo-opcao-a limite=30 unidade=caracteres
Serviços e profissionais
```

```text campo=subtitulo-opcao-b limite=30 unidade=caracteres
Peça e ofereça serviços
```

**Texto promocional**:

```text campo=texto-promocional limite=170 unidade=caracteres
Peça um serviço, receba propostas de profissionais e combine os detalhes. Quem presta serviço tem agenda, orçamentos e cadastro de clientes no mesmo app.
```

**Palavras-chave** (sem repetir o nome nem as palavras do subtítulo):

```text campo=palavras-chave limite=100 unidade=bytes
diarista,eletricista,pedreiro,pintor,reforma,limpeza,aulas,beleza,orçamento,agenda,autônomo
```

**Descrição** (versão base: sem plano pago, sem pagamento pelo app, sem linha Cuidado):

```text campo=descricao-base limite=4000 unidade=caracteres
O WorkEasy reúne serviços e profissionais de várias áreas num só lugar. Peça o que você precisa e receba propostas, ou ofereça os seus serviços e organize o seu dia no mesmo app. Início na cidade de São Paulo (SP).

PARA QUEM PRECISA DE UM SERVIÇO
• Navegue por 44 áreas e 1.710 serviços e profissões, de reformas e limpeza a aulas, beleza e tecnologia.
• Veja, em cada serviço, o que o WorkEasy pede de quem presta (documentos e registro profissional, quando a profissão exige).
• Faça um pedido guiado: serviço, bairro, descrição e datas de preferência.
• Receba propostas de profissionais cadastrados e aceite a que combina com você.
• Quando o profissional oferece, agende direto em um horário livre da agenda dele.
• Acompanhe seus pedidos e atendimentos.

PARA QUEM PRESTA SERVIÇO
• Cadastre-se com os documentos que a sua ocupação exige. A equipe do WorkEasy analisa o cadastro antes de você receber pedidos.
• Receba pedidos do seu bairro e da sua ocupação e envie propostas.
• Organize agenda, serviços e preços, e cadastre os seus próprios clientes.
• Monte orçamentos e envie por link para o cliente aceitar ou recusar.
• Tenha uma página própria para divulgar o seu trabalho.

SEUS DADOS
• Você entra com um código enviado por e-mail ou SMS, sem senha.
• Dentro do app, em Minha conta, você baixa uma cópia dos seus dados e pode excluir a sua conta.
• Não há anúncios no app.

IMPORTANTE
• Os serviços são prestados pelos profissionais cadastrados, não pelo WorkEasy.
• O registro profissional é informado pelo próprio profissional e conferido pela equipe conforme a regra de cada ocupação.
• O WorkEasy não faz diagnóstico, triagem nem orientação médica.

Suporte: <e-mail de suporte>
```

Linhas extras, para acrescentar à base **só se forem verdade no dia do envio** (a base mais as duas extras somam menos de 2.200 caracteres, folga larga sobre o limite de 4.000):

```text campo=descricao-extra-pagamento limite=600 unidade=caracteres
• Pague pelo app com Pix, boleto ou cartão quando o profissional tiver ativado o recebimento. O cartão é pago na página do provedor de pagamento; o app não guarda dados de cartão. Depois de um atendimento concluído e pago pelo app, você pode avaliar o profissional.
```

```text campo=descricao-extra-cuidado limite=600 unidade=caracteres
• Na linha Cuidado, a família registra casa, pessoa assistida e plantões, e o cuidador registra entrada e saída. A localização é opcional e só é enviada quando o cuidador escolhe enviá-la.
```

| Linha extra | Condição para incluir |
|---|---|
| Pagamento pelo app | Só depois de um pagamento real de teste, do início ao fim, com o Asaas de produção, conferido no painel do Asaas (DECISOES §4, item 2). Hoje nada foi testado contra o Asaas real. [CONDICIONAL: depende de parecer] para a forma de cobrança, pelas perguntas 1 e 2 do advogado em `DECISOES.md` |
| Cuidado | Só se a linha Cuidado entrar no build (decisão D4). `DECISOES.md` D12 manda não divulgar o menu antes dos pré-requisitos |

Dois pontos de texto que o advogado confere: "Os serviços são prestados pelos profissionais cadastrados, não pelo WorkEasy" deve estar de acordo com os Termos (L01 e L02), e a frase sobre o registro "conferido pela equipe" só vale se a rotina de conferência existir (hoje é a tela de admin, `admin_set_registry_status`). [CONDICIONAL: depende de parecer]

**Dados da ficha que não são texto livre:**

| Campo | Valor sugerido |
|---|---|
| Idioma principal | Português (Brasil) |
| Copyright | `2026 <razão social da PJ>` (não usar o nome pessoal que está hoje em `tauri.conf.json`) |
| URL de suporte | `https://<domínio da PJ>/suporte` com razão social, CNPJ, endereço, e-mail e telefone (L10) |
| URL da política | `https://<domínio da PJ>/privacidade` (texto do documento L03, página estática e pública) |
| URL de marketing | `https://<domínio da PJ>` (opcional) |
| Categoria principal / secundária | Decisão do dono, ver 4.4 |
| Preço | Gratuito |
| Liberação | Manual na primeira versão |

### 4.3 Regras que os textos seguem

- **Só o que existe.** 2.3.1(a): promover "content or services that it does not actually offer" é motivo de remoção. A descrição acima descreve o que o código faz com backend ligado.
- **Sem plataformas concorrentes.** 2.3.10: "don't include names, icons, or imagery of other mobile platforms or alternative app marketplaces in your app or metadata". Nada de "também no Android".
- **Sem valor nem preço no nome ou no subtítulo** (2.3.7) e sem afirmação que não dê para comprovar. Sem "o melhor", "mais rápido", "garantido".
- **Sem Apple como avalista.** 5.2.4(a): "Don't suggest or imply that Apple is a source or supplier of the App, or that Apple endorses any particular representation".
- **Sem compra do Pro na ficha** no caminho A da seção 3.2.
- **Adequada a todos os públicos** (2.3.8): ícone, capturas e texto "adhere to a 4+ age rating even if your app is rated higher".
- **Frases bloqueadas** pelo `test/claims-guard.test.ts` do projeto (promessas de segurança, de prazo, de verificação e de pagamento que o produto não cumpre): o script do apêndice A confere cada bloco com a mesma lista.

### 4.4 Categorias (decisão do dono)

Definições da Apple (página de categorias, 23/10/2026): **Lifestyle** é "Apps relating to a general-interest subject matter or service" (exemplos: imóveis, reformas); **Business** é "Apps that assist with running a business" (exemplo: gestão de clientes); **Shopping** é "purchase of consumer goods", que não serve a serviços.

- Opção 1 (sugerida): principal **Lifestyle** (a definição da Apple fala em "subject matter or service" e cita "home improvement"), secundária **Business** (a ferramenta do profissional: agenda, orçamentos, clientes).
- Opção 2: principal **Business**, secundária **Lifestyle**. Casa com `category: "Business"` do `tauri.conf.json`. Para apps de Mac a Apple pede que a categoria principal do App Store Connect "should match the category you set in Xcode".

### 4.5 Ícone

`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`: 1024×1024, RGB, sem alfa (F07). Não precisa de ajuste. A tela de abertura (`Splash.imageset`) já existe. O ícone da loja é o mesmo arquivo; confira no Xcode (Validate App) antes de enviar.

### 4.6 Capturas de tela

Tamanhos exigidos (página "Screenshot specifications", 23/10/2026): "At least one screenshot for iPhone with Dynamic Island (medium display)" e, se o app roda em iPad, "iPad 13-inch display". Os demais tamanhos são reduzidos automaticamente a partir do maior, se a interface é a mesma.

| Aparelho | Tamanhos aceitos (retrato / paisagem) |
|---|---|
| iPhone Dynamic Island (médio) | 1179×2556, 1206×2622 / 2556×1179, 2622×1206 |
| iPhone Dynamic Island (grande) | 1260×2736, 1290×2796, 1320×2868 / invertidos |
| iPad 13" | 2064×2752, 2048×2732 / 2752×2064, 2732×2048 |
| Mac (16:10) | 1280×800, 1440×900, 2560×1600, 2880×1800 |

Roteiro de 9 telas (2.3.3: "Screenshots should show the app in use, and not merely the title art, login page, or splash screen"; 2.3.9: dados fictícios). Todas com as **contas de demonstração** (seção 7), sem a faixa "Protótipo de demonstração":

1. Início: busca e categorias.
2. Página de um serviço: o que será pedido a quem presta e como é a cobrança.
3. Pedido guiado preenchido.
4. Propostas recebidas, com "Aceitar proposta".
5. Detalhe do atendimento (período e situação).
6. Painel do profissional: pedidos recebidos.
7. Agenda do profissional.
8. Orçamento em documento.
9. Minha conta: consentimentos, baixar dados, excluir conta.

O apêndice B tem um script que confere tamanho e ausência de alfa nos PNG antes do envio.

### 4.7 iPad (decisão D3)

O projeto declara iPhone e iPad (F05) e as quatro orientações no iPad. A Apple incentiva (2.4.1: "iPhone apps should run on iPad whenever possible"). Se mantiver: testar no simulador de iPad 13" e fazer capturas de 2064×2752. Se restringir a iPhone: `TARGETED_DEVICE_FAMILY = 1`; as capturas de iPad deixam de ser exigidas.

### 4.8 Disponibilidade

Só **Brasil** no piloto. Razão para constar nas notas: área de atendimento em São Paulo, preços e pagamento em reais (3.2.2(v) condena restrição "arbitrária"). Efeito colateral: o App Store Connect só pede a declaração de "trader" da Lei de Serviços Digitais da UE para quem distribui na UE ("in order to distribute apps in the EU"); sem distribuição na UE, não se aplica [leitura nossa].

## 5. Privacidade do App Store (App Privacy, as "etiquetas de nutrição")

Fonte: "App privacy details on the App Store", lida em 23/10/2026. Quem responde no App Store Connect: Account Holder, Admin ou App Manager. As respostas podem ser mudadas a qualquer momento: "you do not need to submit an app update in order to change your answers".

### 5.1 Regras da Apple que usei

- **Coletar** é "transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time". Dado só no aparelho não conta (o rascunho do pedido em `lib/requestDraft.ts` fica no aparelho).
- Declara-se também o dado coletado só para funcionar: "if you collect data solely for the purpose of app functionality, declare the data on your label and indicate that it is only being used for that purpose".
- **Divulgação opcional** exige todos os critérios, entre eles que o dado seja coletado "only in infrequent cases that are not part of your app's primary functionality". Nenhum dado do WorkEasy cumpre tudo, então declaro tudo.
- **Pagamento:** "If your app uses a payment service, the payment information is entered outside your app, and you as the developer never have access to the payment information, it is not collected". É o caso do cartão (F16).
- **Campos livres:** marque "Other User Content", mas "if you ask a user to input a specific data type into a text field, such as their name or email, or if you have a feature that enables users to upload a particular media type, such as photos or videos, then you'll need to disclose the specific type of data".
- **Rastreamento** é ligar dado do app a dado de terceiros para anúncio, ou repassá-lo a corretor de dados. O WorkEasy não faz (F29).

### 5.2 Respostas recomendadas (para o build com backend ligado)

"Vinculado" = ligado à identidade da conta. Finalidade = "App Functionality" em todos os casos, salvo nota. Rastreamento = Não em todos.

| Tipo de dado (Apple) | Coletado? | De onde vem no código |
|---|---|---|
| Nome | Sim | `profiles.full_name`, `providers.display_name`, clientes cadastrados pelo profissional (`provider_clients.name`), orçamentos (`client_name`), assistido (`first_name`, só com Cuidado) |
| E-mail | Sim | Login por e-mail (Auth), `provider_clients.email`, ativação do recebimento (Asaas) |
| Telefone | Sim | Login por SMS (Auth), `profiles.phone`, `provider_clients.phone`, pagador no Asaas |
| Endereço físico | Sim, só profissional que ativa o recebimento | Formulário "Recebimento" (rua, número, complemento, bairro, CEP), repassado ao Asaas (F31) |
| Outro contato do usuário | Sim, só com Cuidado | `care_recipients.emergency_contact` |
| Saúde | Não, mas ver 5.3 | Nenhum campo pede dado de saúde; as telas da linha Cuidado mandam não escrevê-los |
| Condicionamento físico | Não | n/a |
| Dados de pagamento | **Não** | O cartão é digitado na página do Asaas (F16) |
| Informação de crédito | Não | n/a |
| Outras informações financeiras | Sim, só profissional | Renda ou faturamento mensal na ativação do recebimento (F31) |
| Localização precisa | Sim, só se o cuidador marcar a caixa no check-in | `checkins.lat`, `checkins.lng` (6 casas decimais) (F12) |
| Localização aproximada | Sim | Bairros informados em pedido, atendimento, cadastro de prestador e casa (F38) |
| Informações sensíveis | Condicional, ver 5.3 | Documentos do cadastro (`provider_documents`) |
| Contatos | Não | O app não lê a agenda do aparelho |
| E-mails ou mensagens de texto | Sim (conservador) | Mensagem da proposta (`proposals.message`), observações de atendimento e de orçamento |
| Fotos ou vídeos | Sim, só profissional | Fotos de documentos no cadastro (F14) |
| Áudio, conteúdo de jogo | Não | n/a |
| Atendimento ao cliente | Não hoje | Sem canal no app (F40). Vira Sim se criar formulário de suporte |
| Outro conteúdo do usuário | Sim | Descrição de pedido, apresentação, serviços, avaliações, observações, relatórios, PDFs |
| Histórico de navegação e de busca | Não | A busca roda no aparelho (F42) [verificar os registros do Supabase] |
| ID do usuário | Sim | Id da conta (Auth) em todas as linhas |
| ID do dispositivo | Não hoje | Um token de push criaria este item |
| Histórico de compras | Sim | Atendimentos, pagamentos e assinatura (`bookings`, `payments`, `subscriptions`) |
| Dados de uso e de diagnóstico | Não | Sem SDK de análise nem de falhas (F29). Endereço IP: ver 5.3 |
| Ambiente e corpo | Não | n/a |
| Outros tipos de dados | Sim | CPF/CNPJ (pagador, profissional, assinatura), data de nascimento (pessoa física no recebimento), número de registro profissional e UF, consentimentos |

**Dados usados para rastrear você: nenhum.** Parceiros de terceiros com código no app: só o Capacitor, que no código-fonte da 8.5.2 declara não coletar dado nenhum (F09).

### 5.3 Itens que pedem decisão ou conferência

1. **Informações sensíveis.** A lista da Apple inclui "biometric data". Selfie e documento de identidade são vistos por uma pessoa da equipe; não há reconhecimento facial automático no código. Se a política de privacidade (L03) e o RIPD (L06) tratarem a selfie como dado biométrico, marque o item. [CONDICIONAL: depende de parecer]
2. **Saúde.** O relatório diário da linha Cuidado pede "humor" do assistido, e há campo "preferências" (F33). Pela regra de campo específico, o conservador é declarar Saúde se a linha Cuidado entrar no build, ou tirar esses campos. [incerto]
3. **Endereço IP.** O Supabase vê o IP para limitar requisições; a documentação de erros do Auth cita limite por "client (IP address)". Se o projeto guarda IP em logs ou sessões, a Apple manda declarar conforme o uso (por exemplo "Other Diagnostic Data" ou "Device ID"). Conferir os registros do projeto de produção antes de responder. [incerto]
4. **Marketing.** O consentimento `marketing` existe (F25), mas nenhuma função envia novidades (modelos só transacionais, F15). Se passar a enviar, acrescente a finalidade "Developer's Advertising or Marketing" a e-mail e telefone.
5. **Dados repassados ao Asaas pelo servidor.** O conceito de "coletar" da Apple fala de dado que você "and/or your third-party partners" acessam. Como o endereço, a renda e o CPF passam pelo seu servidor para o Asaas, declarar é o caminho conservador. [incerto]
6. **IA e push.** Se ligar `request-assist` ou push, atualizar as respostas na mesma data (itens 3.4 e 3.3).

### 5.4 Quem recebe os dados (lista para a política de privacidade, L03)

A diretriz 5.1.1(i) exige que a política identifique "what data, if any, the app/service collects, how it collects that data, and all uses of that data"; "Confirm that any third party with whom an app shares user data ... will provide the same or equal protection of user data as stated in the app's privacy policy"; e "Explain its data retention/deletion policies and describe how a user can revoke consent and/or request deletion of the user's data".

| Provedor | Dados | Para quê |
|---|---|---|
| Supabase (Auth, Postgres, Storage, Edge Functions) | Todos os dados da conta | Hospedagem e execução do serviço |
| Asaas | Pagador (nome, CPF/CNPJ, e-mail, celular); profissional (dados da ativação do recebimento) | Cobrança, split e assinatura |
| Meta (WhatsApp Cloud API) | Telefone confirmado e parâmetros do modelo (ocupação, outra parte, bairro) | Avisos transacionais |
| Resend | E-mail confirmado e conteúdo do modelo | Avisos transacionais |
| Provedor de SMS ligado ao Supabase Auth | Telefone e código | Código de login. Produção ainda não definida; o config local usa Twilio com valores de teste (F35) |
| Anthropic | Texto do pedido | **Só se** `request-assist` for ligado (F30) |

### 5.5 Manifesto de privacidade do app (`PrivacyInfo.xcprivacy`)

- Apple: "Starting May 1, 2024, apps that don't describe their use of required reason API in their privacy manifest file aren't accepted by App Store Connect." O código Swift do app e o plugin `@capacitor/app` não usam essas APIs (F09). A Apple lista o Capacitor entre os SDKs que exigem manifesto; o código-fonte da 8.5.2 traz o arquivo, mas o projeto usa o pacote binário `capacitor-swift-pm`, então confirme no Generate Privacy Report (abaixo) que o manifesto do Capacitor aparece. [incerto]
- O alvo `App` não tem manifesto. Não vi regra que o torne obrigatório sem uso de API de motivo obrigatório, mas é boa prática e evita surpresa em atualizações. Crie `ios/App/App/PrivacyInfo.xcprivacy` e inclua no alvo (Xcode: File > New > File > App Privacy):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key>
  <false/>
  <key>NSPrivacyTrackingDomains</key>
  <array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array/>
</dict>
</plist>
```

- O array `NSPrivacyCollectedDataTypes` pode ser preenchido no editor do Xcode (cada item tem `NSPrivacyCollectedDataType`, `NSPrivacyCollectedDataTypeLinked`, `NSPrivacyCollectedDataTypeTracking` e `NSPrivacyCollectedDataTypePurposes`). A Apple avisa que os valores devem ser os da lista oficial; não invente nomes. Depois do Archive, use **Generate Privacy Report** no Organizer e compare com a tabela 5.2.

### 5.6 Links de privacidade

Política de privacidade: obrigatória no App Store Connect e dentro do app, "in an easily accessible manner" (hoje o app leva a `/legal`, texto provisório: bloqueio B1). "Privacy Choices" (opcional): página pública onde a pessoa vê, pede exclusão ou muda escolhas; pode apontar para a página do site que explica Minha conta.

## 6. Classificação etária

Fonte: "Age ratings values and definitions" e "Set an app age rating", lidas em 23/10/2026. O questionário tem sete grupos: controles no app, capacidades, temas maduros, medicina e bem-estar, sexualidade ou nudez, violência e atividades de azar. A nota é do app inteiro e vale para todas as plataformas do registro.

| Grupo | Descritor (Apple) | Resposta | Motivo |
|---|---|---|---|
| Controles | Controles parentais | Não | Não existem |
| Controles | Verificação de idade | Não | Não existe |
| Capacidades | Acesso irrestrito à web | Não | Links externos abrem no navegador do sistema (F17); o WebView só carrega o app |
| Capacidades | Conteúdo gerado por usuário | **Sim** | Avaliações públicas, apresentações, serviços e pedidos (F20) |
| Capacidades | Rede social (e a versão "desligada para menores de 13") | Não | Não há feed nem amplificação |
| Capacidades | Mensagens e chat | **Sim** (conservador) | A proposta leva mensagem livre do profissional ao cliente. Não é chat em tempo real; responder "Não" é defensável, mas arrisca "mis-rated" (2.3.6) |
| Capacidades | Publicidade | Não | Sem anúncios (DECISOES D11) |
| Temas maduros | Palavrões, horror, álcool, tabaco, drogas | Nenhum | O conteúdo do app não os trata |
| Medicina e bem-estar | Informação médica ou de tratamento | Nenhum | O app não orienta saúde (regra do projeto e aviso `HealthDataNotice`). O catálogo lista profissões, que é diferente de orientação |
| Medicina e bem-estar | Temas de saúde e bem-estar | Nenhum | Idem |
| Sexualidade, violência, azar | Todos os descritores | Nenhum | n/a |

**Resultado esperado:** 4+ no mundo (a lista de 4+ da Apple inclui conteúdo de usuário e mensagens). No Brasil a Apple usa pictogramas próprios para apps autoavaliados: conteúdo de usuário aparece em **A6**; mensagens e chat aparecem em **A12**. Com as duas respostas "Sim", espere **A12**.

**Idade mínima dos Termos (decisão D5).** Regra da Apple: "If your app has a EULA with minimum age requirements that exceed the rating that Apple calculated, you must override to a rating that adheres to the requirements." Se os Termos (L01 e L02) exigirem 18 anos, a nota deve subir para 18+. Efeito no Brasil, pela notícia de 24/02/2026: "Apple will block users in Australia, Brazil, and Singapore from downloading apps rated 18+ unless they have been confirmed to be adults through reasonable methods", e "developers may have separate obligations to independently confirm that their users are adults". A Apple oferece a Declared Age Range API para isso. A idade mínima e as obrigações de confirmação de idade são matéria do advogado. [CONDICIONAL: depende de parecer]

Outros campos do mesmo bloco: **Made for Kids** = não marcar; **Age Suitability URL** (opcional); **Regulated Medical Devices** só é pedido a quem está na UE, Reino Unido ou EUA com categoria Health & Fitness ou Medical, ou com informação médica "frequent": não se aplica ao piloto só no Brasil.

## 7. Notas para a revisão e conta de demonstração

### 7.1 O que a Apple pede

- 2.1(a): "include demo account info (and turn on your back-end service!) if your app includes a login". A Apple admite "a built-in demo mode in lieu of a demo account" só com aprovação prévia e se ele "exhibits your app's full features and functionality". O modo demonstração que o projeto já tem (sem backend, dados fictícios, faixa de aviso) **não** mostra as funções reais; não use.
- Campos do App Review Information: contato (nome, e-mail, telefone **com "+" e código do país**), "Sign-in required" (usuário e senha) e "Notes". A conta de demonstração "must not expire", e contas adicionais vão nas Notes. As Notes aceitam "up to 4000 bytes" em qualquer idioma.
- 2.3.1(a): funções novas e mudanças "must be described with specificity in the Notes for Review section of App Store Connect (generic descriptions will be rejected)".
- Anexos: a seção App Review Information tem campo de anexo (a página de classificação etária o cita para documentos de licença). Use-o para um vídeo curto do fluxo de pagamento em ambiente de teste. [incerto: formatos e tamanho aceitos]

### 7.2 Estratégia da conta de demonstração (login só por código)

O revisor não recebe SMS nem e-mail do dono. A saída limpa é **número de telefone de teste com código fixo** no Supabase Auth.

| Fonte | O que diz |
|---|---|
| Documentação do Supabase (auto-hospedagem) | "When a test phone number requests an OTP, the Auth service skips SMS delivery and accepts only the mapped code. Other phone numbers continue to use the real SMS provider." E: "Remove test OTPs before deploying to production. You can also set an expiration with `SMS_TEST_OTP_VALID_UNTIL`" |
| Referência do `config.toml` do CLI | `auth.sms.test_otp`: "Use pre-defined map of phone number to OTP for testing." (o repo usa isso só no ambiente local, F35) |
| Projeto hospedado | O pull request nº 52118 do Supabase (marcado como pronto para revisão em 22/10/2026 e ainda não mesclado em 23/10/2026; trechos citados pelo leitor de páginas, confira no PR) descreve configurar números de teste "in the Dashboard, `config.toml`, or the Management API" e diz que o formulário do provedor de telefone só salva números de teste com os campos do provedor de SMS e **Test OTPs Valid Until** preenchidos. A página oficial ainda não existe: conferir no painel do seu projeto. [incerto] |

Como fazer:

1. Ativar o login por telefone no projeto de produção, com um provedor de SMS configurado (o README já diz que o código por SMS depende disso).
2. Cadastrar **três** números fictícios com código fixo (cliente, profissional, teste de exclusão). **Não reutilizar** o par que está em `supabase/config.toml` (`5511999990000`): ele está no histórico do Git.
3. Definir validade longa o bastante para cobrir a fila de revisão e eventuais reenvios (a Apple exige que a conta não expire) e renovar a cada novo envio.
4. Risco que você aceita: um código fixo é uma porta aberta para quem souber o número. Mitigação: contas só de demonstração, sem dado real, **sem recebimento ativado**, e remover os pares depois da aprovação (a própria documentação manda remover antes de produção).
5. Declarar isso nas Notes (2.5.19: nada escondido). O texto abaixo já declara.

Alternativas e por que não: caixa de e-mail ou telefone do dono recebendo códigos (pela documentação do Supabase o código expira em 1 hora por padrão, e a revisão pode acontecer a qualquer hora: inviável); modo demonstração embutido (precisa de aprovação prévia e mostrar as funções completas: não atende).

### 7.3 Como preparar as três contas (com as telas que já existem)

| Conta | Passos |
|---|---|
| **A. Cliente** | Entrar com o número de teste; aceitar os Termos; em Minha conta, nome fictício ("Cliente Demonstração"); em "Pedir serviço", criar um pedido aberto |
| **B. Profissional** | Entrar; `/pro/cadastro`: perfil com nome fictício, bairros, documentos de teste (arquivos fictícios, nunca de pessoa real, 2.3.9) para cada passo que a política da ocupação escolhida pede; "Enviar para análise". Você, como admin (linha em `admins`, que só a service role escreve), abre `/admin/prestadores`, aceita cada documento de teste, marca o registro como conferido se a ocupação exigir um, aprova o prestador (com motivo) e, se a ocupação não entrar junto, aprova a ocupação no mesmo cartão (F44); depois a conta B cadastra serviço e agenda e envia proposta ao pedido da conta A. **Não ativar o recebimento (Asaas)** |
| **C. Exclusão** | Entrar com o terceiro número; aceitar os Termos; nenhum pedido nem atendimento. Serve só para o revisor testar "Excluir minha conta" sem destruir A e B |

Cuidados: enquanto B estiver aprovada ela aparece na busca pública da ocupação e dos bairros escolhidos. Escolha ocupação e bairro de pouco uso e um nome que deixe claro que é demonstração. Depois da aprovação: suspender B (`admin_set_provider_status`), excluir A e C pelo próprio app, remover os números de teste.

### 7.4 Texto para colar no campo Notes

Inglês primeiro (é o que se cola), português logo depois (para você conferir o que está enviando; a Apple aceita qualquer idioma). Substitua os símbolos `9XXXX-XXXX`, `NNNNNN` e tudo entre `<` e `>`. **Não cole nada que não seja verdade no dia do envio.**

**Notas em inglês** (campo Notes; 3.367 bytes antes de preencher):

```text campo=notas-revisao-en limite=4000 unidade=bytes
WorkEasy is a services marketplace (initial area: the city of São Paulo; prices in BRL; Brazil storefront only). The interface is in Brazilian Portuguese. Clients describe a service they need and receive proposals from professionals. Professionals receive matching requests, send proposals and quotes, and manage their schedule and clients.

SIGN IN (one-time code, no password)
Menu > "Entrar" > "Celular". Tick the Terms box, enter the phone number, tap "Enviar código", then type the code. These are fixed test pairs: no SMS is sent and they do not expire.
- Client: +55 11 9XXXX-XXXX, code NNNNNN (has one open request with one proposal)
- Provider (already approved): +55 11 9XXXX-XXXX, code NNNNNN
- Account-deletion test (new account, safe to delete): +55 11 9XXXX-XXXX, code NNNNNN

WHAT TO TRY
Client: "Pedir serviço" > choose a service and a neighborhood, describe the need > "Enviar pedido". "Meus pedidos" > open the request > "Aceitar proposta".
Provider: "Painel Pro" > tabs "Pedidos", "Agenda", "Orçamentos", "Clientes", "Cadastro".

NOT A REPACKAGED WEBSITE (Guideline 4.2)
The whole interface ships inside the app binary (no remote site is loaded); only data comes from our API after sign-in. Device features used: the iOS system picker (Photos, Files and, where iOS offers it, the camera) to attach registration documents. Not implemented in this version: push notifications, background location, in-app chat. Notices go out by WhatsApp or e-mail.

PAYMENTS (Guideline 3.1.3(e))
Clients pay professionals for physical services performed outside the app. Payments use Pix (code and QR shown in the app), boleto or card (on the page of our payment provider Asaas, opened in Safari); the app never receives card data. Per 3.1.3(e) ("Goods and Services Outside of the App"), In-App Purchase is not used for them. The demo provider has no receiving account, so the payment step only shows an informational message and no real charge can happen.

DIGITAL GOODS
This version sells no subscription or other digital good, and no screen offers one.

ACCOUNT DELETION (Guideline 5.1.1(v))
Menu > "Minha conta" > last section "Excluir minha conta" > type EXCLUIR > confirm. Personal data is erased or anonymized; payment and booking records stay anonymized, as the screen explains. Deletion is refused only while a booking is accepted, paid, in progress or in dispute; the message says what to do.

USER-GENERATED CONTENT (Guideline 1.2)
Users write requests, proposals, profile texts and reviews (reviews only after a booking paid through the app). Reporting and blocking: <describe the screens that exist on the submission date>. Filtering before publication: <describe>. Support: <e-mail and URL shown in the app>.

LOGIN (Guideline 4.8)
Own e-mail/SMS one-time-code accounts; no third-party or social login, so Sign in with Apple is not required.

SERVER-SIDE SETTINGS (Guideline 2.5.19)
The backend has switches for platform commission and held payments. Both are OFF: no commission is charged and no payment is held. Only our staff can change them, on an admin screen that requires a typed confirmation. Service pages show the billing rule planned for each occupation. Other staff-only admin screens: provider review, disputes, payments, audit log. Any change will be described in a new submission.

CONTACT
<name>, <phone with country code>, <e-mail>
```

**Mesmo texto em português**, só para conferência:

```text campo=notas-revisao-pt limite=4000 unidade=bytes
O WorkEasy é um marketplace de serviços (área inicial: cidade de São Paulo; preços em reais; só na loja do Brasil). A interface está em português do Brasil. Clientes descrevem um serviço de que precisam e recebem propostas de profissionais. Profissionais recebem pedidos compatíveis, enviam propostas e orçamentos e organizam a agenda e os clientes.

ENTRAR (código de uso único, sem senha)
Menu > "Entrar" > "Celular". Marque a caixa dos Termos, informe o telefone, toque em "Enviar código" e digite o código. São pares fixos de teste: nenhum SMS é enviado e eles não expiram.
- Cliente: +55 11 9XXXX-XXXX, código NNNNNN (tem um pedido aberto com uma proposta)
- Profissional (já aprovado): +55 11 9XXXX-XXXX, código NNNNNN
- Teste de exclusão de conta (conta nova, pode ser excluída): +55 11 9XXXX-XXXX, código NNNNNN

O QUE TESTAR
Cliente: "Pedir serviço" > escolha um serviço e um bairro, descreva a necessidade > "Enviar pedido". "Meus pedidos" > abra o pedido > "Aceitar proposta".
Profissional: "Painel Pro" > abas "Pedidos", "Agenda", "Orçamentos", "Clientes", "Cadastro".

NÃO É UM SITE REEMPACOTADO (diretriz 4.2)
Toda a interface vai dentro do binário (nenhum site remoto é carregado); só os dados vêm da nossa API depois do login. Recursos do aparelho usados: o seletor do sistema do iOS (Fotos, Arquivos e, onde o iOS oferecer, a câmera) para anexar documentos do cadastro. Não implementados nesta versão: notificações push, localização em segundo plano, chat no app. Os avisos saem por WhatsApp ou e-mail.

PAGAMENTOS (diretriz 3.1.3(e))
Clientes pagam profissionais por serviços físicos prestados fora do app. O pagamento usa Pix (código e QR Code exibidos no app), boleto ou cartão (na página do nosso provedor de pagamento, o Asaas, aberta no Safari); o app nunca recebe dados de cartão. Pela 3.1.3(e) ("Goods and Services Outside of the App"), não se usa In-App Purchase nesses pagamentos. O profissional de demonstração não tem conta de recebimento: a etapa de pagamento só mostra uma mensagem informativa e nenhuma cobrança real é possível.

BENS DIGITAIS
Esta versão não vende assinatura nem outro bem digital, e nenhuma tela oferece isso.

EXCLUSÃO DE CONTA (diretriz 5.1.1(v))
Menu > "Minha conta" > última seção "Excluir minha conta" > digite EXCLUIR > confirme. Os dados pessoais são apagados ou anonimizados; pagamentos e atendimentos ficam anonimizados, como a tela explica. A exclusão só é recusada enquanto há atendimento aceito, pago, em andamento ou em disputa; a mensagem diz o que fazer.

CONTEÚDO DE USUÁRIOS (diretriz 1.2)
Usuários escrevem pedidos, propostas, apresentações e avaliações (avaliação só depois de atendimento pago pelo app). Denúncia e bloqueio: <descreva as telas que existirem na data do envio>. Filtro antes de publicar: <descreva>. Suporte: <e-mail e URL exibidos no app>.

LOGIN (diretriz 4.8)
Contas próprias, com código por e-mail ou SMS; não há login social nem de terceiros, então Sign in with Apple não é exigido.

AJUSTES DO SERVIDOR (diretriz 2.5.19)
O backend tem interruptores para comissão da plataforma e pagamento retido. Os dois estão DESLIGADOS: nenhuma comissão é cobrada e nenhum pagamento é retido. Só a nossa equipe pode mudá-los, numa tela de administração que exige uma confirmação digitada. As páginas de serviço mostram a regra de cobrança prevista para cada ocupação. Outras telas de administração, só da equipe: análise de cadastros, disputas, pagamentos e auditoria. Qualquer mudança será descrita em novo envio.

CONTATO
<nome>, <telefone com código do país>, <e-mail>
```

**Antes de colar, confirme** (cada item muda uma frase):

- [ ] No iPhone real (TestFlight), veja o que o seletor de arquivos do cadastro oferece (Fotos, Arquivos, câmera) e ajuste a frase de 4.2 ao que aparecer. [incerto: depende do iOS]
- [ ] Os três pares de telefone e código funcionam num build de TestFlight, não só no simulador.
- [ ] A conta B não tem recebimento ativado e a mensagem de pagamento é a descrita ("O recebimento pelo Asaas ainda não foi ativado para este profissional.").
- [ ] A conta A tem um pedido aberto com uma proposta da conta B.
- [ ] A frase "no screen offers one" é verdade: nenhuma tela do iOS vende ou chama para o Pro (seção 3.2, caminho A).
- [ ] O trecho de conteúdo de usuários só cita telas e prazos que existem (seção 8).
- [ ] O script do apêndice A dá "ok" depois de preenchido (limite de 4.000 **bytes**).

**Trecho da linha Cuidado** (só se D4 = sim; acrescente ao fim do bloco em inglês; com ele a nota fica em 3.694 bytes):

```text campo=notas-trecho-cuidado-en limite=700 unidade=bytes
CARE LINE (only if enabled in this build)
Families register a home, the person cared for and shifts; the caregiver checks in and out. Location (While Using) is optional: asked only if the caregiver ticks "Enviar minha localização neste registro"; check-in works without it. Forms tell users not to enter health information.
```

**Variante B: Apple IAP** (substitui o parágrafo "DIGITAL GOODS" do bloco em inglês). Só se o IAP existir no build [PLANEJADO]:

```text campo=notas-bens-digitais-b-en limite=900 unidade=bytes
DIGITAL GOODS
Professionals can subscribe to a paid plan ("Pro", monthly) with Apple In-App Purchase. "Restaurar compras" is in Assinatura. Deleting an account tells subscribers that billing continues through Apple until they cancel in Settings.
```

**Variante C: opção do Brasil** (idem). Só se a entitlement estiver aprovada e implementada [PLANEJADO]. Com Cuidado e variante C juntos a nota chega a 3.905 bytes (95 bytes abaixo do limite): reconte depois de preencher:

```text campo=notas-bens-digitais-c-en limite=900 unidade=bytes
DIGITAL GOODS
Professionals can subscribe to a paid plan ("Pro", monthly). In Brazil we use the External Purchase entitlement for Brazil with the in-app disclosure sheet; Apple In-App Purchase is offered alongside. Payment provider: Asaas. Sales are reported monthly through the External Purchase Server API.
```

## 8. Conteúdo de usuários, contato e exclusão de conta

### 8.1 Diretriz 1.2: o que exige e o que existe

A 1.2 vale para "apps that enable users to create, generate, upload, share, or otherwise contribute content". No WorkEasy isso é: avaliações (públicas nas ocupações em que a regra permite), apresentação e serviços do profissional (página pública), descrição do pedido e mensagem da proposta (vistas por quem participa). O texto oficial pede quatro coisas:

| Exigência oficial | O que existe hoje | O que falta |
|---|---|---|
| "A method for filtering objectionable material from being posted to the app" | Barreiras indiretas: só avalia quem teve atendimento pago pelo app; uma avaliação por atendimento; comentário até 1000 caracteres; nas ocupações sem ranking por nota a avaliação nasce oculta (`published` forçado a false) | Filtro antes de publicar (palavras, links, telefones). Hoje a avaliação nasce publicada (`default true`) quando a ocupação permite ranking (F20, F21) |
| "A mechanism to report offensive content and timely responses to concerns" | Nada no app. O admin consegue ocultar uma avaliação por política RLS (`reviews_admin_update`, com a qual o `DECISOES.md` D8 conta), mas não há tela | Botão **Denunciar** (avaliação, página do prestador, pedido, proposta), fila no admin e prazo de resposta (documentos L05 e O07) |
| "The ability to block abusive users from the service" | O admin suspende prestador com motivo obrigatório (`admin_set_provider_status`), o que o tira da busca e da página pública (F44). O login do Supabase tem o estado "banido" (`banned_until`, citado na página de códigos de erro do Auth) e o app já traduz o erro `user_banned` ("Esta conta está bloqueada. Fale com o suporte."), mas nenhuma tela nem função do app aplica o banimento; não conferi como a operação o aplicaria (painel ou API de administração) [incerto] | Bloqueio entre usuários e suspensão de conta de **cliente** pelo app (não existe função). A leitura da exigência é da App Review [incerto] |
| "Published contact information so users can easily reach you" | Nada (F40) | E-mail e URL de suporte dentro do app e na ficha (1.5: "Make sure your app and its Support URL include an easy way to contact you") |

A Apple avisa o custo de falhar: "Developers who fail to implement appropriate safeguards or fail to remediate identified violations after notice may be considered in violation of the Developer Code of Conduct."

### 8.2 Mínimo sugerido [PLANEJADO]

Nada disto foi feito aqui. É a lista para o agente de código e para a operação (o texto de política vem de L05 e o procedimento de O07):

1. **Denúncias:** tabela `content_reports` (quem denunciou, tipo e id do conteúdo, motivo, detalhe curto, situação, quem tratou e quando) com RLS de inserção só do próprio usuário e leitura de admin; função `report_content`; tela `/admin/denuncias` com as ações "ocultar avaliação" (a política RLS já permite) e "suspender prestador" (já existe).
2. **Bloqueio:** o cliente bloqueia um prestador (some das listas e das propostas dele) e o prestador bloqueia um cliente (deixa de receber pedidos dele); suspensão de conta de cliente pelo admin, com motivo e `audit_log`.
3. **Filtro:** verificação no servidor de avaliações, apresentações e pedidos antes de publicar, inclusive na edição (a política `reviews_update_own` deixa o autor editar a avaliação depois de publicada); o que for marcado vai para a fila com `published = false` até alguém aprovar.
4. **Contato:** e-mail e página de suporte em Minha conta e no rodapé, com o mesmo conteúdo da URL de suporte da ficha (L10).
5. **Prazo de resposta** escrito na política e cumprido pela operação.

### 8.3 Contato e suporte

A URL de suporte da ficha "must lead to actual contact information (legal address, email address, telephone number)". Use a página do SAC (L10) com razão social, CNPJ, endereço, e-mail e telefone da PJ. O mesmo endereço de e-mail vai no campo de contato da App Review (com telefone no formato internacional, "+55…").

### 8.4 Exclusão de conta (5.1.1(v))

**Caminho no app:** menu → **Minha conta** → rolar até **Excluir minha conta** → digitar **EXCLUIR** → botão "Excluir minha conta" (F22). Não há e-mail, telefone nem site no meio do caminho.

**Conferência com o guia oficial** ("Offering account deletion in your app", lido em 23/10/2026):

| Orientação da Apple | Situação |
|---|---|
| "Make the account deletion option easy to find in your app. Typically, it's included in the app's account settings." | Atende: está em Minha conta |
| "Offer to delete the entire account record, along with associated personal data ... only offering to temporarily deactivate or disable an account is insufficient." | Atende: apaga documentos, anonimiza dados pessoais e apaga o usuário do Auth |
| "If you're legally required to retain some user information, let people know what information will and won't be retained." | Atende em parte: a tela diz que pagamentos e atendimentos ficam anonimizados. **Não diz que a nota (estrelas) das avaliações fica**; o texto do comentário é apagado (F23) |
| Confirmação: "It's appropriate to confirm the user genuinely intends to delete their account" | Atende: digitar EXCLUIR |
| Conteúdo de usuário: "People expect that all data associated with their account will be deleted ... includes ... reviews. If local laws or regulations require you to maintain some data, let people know." | Divergência a decidir: a nota fica porque a exclusão anonimiza em vez de apagar (D7 do `DECISOES.md`, que fala em registros financeiros e não cita as notas). Ou apagar a avaliação inteira na exclusão, ou dizer na tela que a nota anônima fica e por quê. [CONDICIONAL: depende de parecer] |
| Quem tem assinatura renovável da Apple: avisar que a cobrança continua pela Apple | Só importa no caminho B da seção 3.2 (hoje o Pro é cancelado no Asaas pela própria função) |

**Risco de revisão:** com atendimento aceito, pago, em andamento ou em disputa a função recusa (409 `active_bookings`: "Você tem atendimentos em andamento. Conclua ou cancele esses atendimentos antes de excluir a conta."). A Apple diz que apps que tornam a exclusão "unnecessarily difficult" não passam. A recusa tem motivo (a outra parte e o dinheiro dependem do atendimento) e a mensagem diz o que fazer, mas é o ponto em que um revisor pode reclamar [incerto]. Por isso as contas de demonstração não têm atendimento em andamento e as Notes explicam a regra (seção 7.4).

**Texto da tela de exclusão:** afirma que "a lei fiscal obriga a guardar esses registros". O `DECISOES.md` (pergunta 6 ao advogado) ainda não tem resposta sobre prazo e conteúdo mantidos. [CONDICIONAL: depende de parecer]

## 9. Info.plist, manifesto e entitlements

Regras da Apple (documentação de "purpose string", 23/10/2026): a chave é obrigatória quando o app usa a API ("This key is required if your app uses APIs that access the device's camera"); o texto deve ser "accurate, meaningful, and specific about why the app needs to access the protected resource"; e "App Review checks for the use of protected resources, and rejects apps that contain code accessing those resources without a purpose string".

### 9.1 iOS (`ios/App/App/Info.plist`)

| Chave | Hoje | Veredito | O que fazer |
|---|---|---|---|
| `NSLocationWhenInUseUsageDescription` | Presente, pt-BR | Correta para o check-in (F12), que só existe na linha Cuidado (F33) | Manter o texto atual (abaixo) se a linha Cuidado entrar no build (D4). Sem essa linha, a chave fica sem uso e a revisão pode perguntar |
| `NSCameraUsageDescription` | Presente, mas diz que a câmera serve só à "prévia na tela de verificação de identidade" e que "nenhuma imagem é enviada ou armazenada" | **Imprecisa.** Essa tela é simulação (F13) e sai do build de loja. Se o seletor de arquivos oferecer "Tirar Foto", a foto do documento **é enviada e guardada** (F14) | Trocar pelo texto abaixo |
| `NSMicrophoneUsageDescription` | Ausente | Não necessária: `getUserMedia` pede só vídeo e o seletor só aceita imagem e PDF (F13, F14) | Não adicionar. Se o build realmente usar o microfone, a Apple aponta a falta com o código ITMS-90683 ("Missing purpose string in Info.plist") |
| `NSPhotoLibraryUsageDescription` | Ausente | Provavelmente desnecessária: o app usa o seletor do sistema, que a diretriz 5.1.1(iii) prefere ao acesso total. Comportamento exato do WebView do iOS: [incerto] | Testar no aparelho; só adicionar se o sistema pedir |
| `ITSAppUsesNonExemptEncryption` | Ausente | Sem a chave, o App Store Connect faz as perguntas de conformidade a cada nova versão enviada | Adicionar `NO` (abaixo), depois de confirmar que o app só usa o HTTPS do sistema |
| `UIRequiredDeviceCapabilities` | `armv7` (padrão do Capacitor) | A Apple exige a chave presente no binário enviado | Manter |
| `NSUserTrackingUsageDescription` | Ausente | Correto: não há rastreamento | Não adicionar |
| `UIBackgroundModes`, `NSLocationAlways…` | Ausentes | Correto: sem push e sem localização em segundo plano | Se um dia houver push, rever |
| `PrivacyInfo.xcprivacy` do app | Ausente | Recomendado (seção 5.5) | Criar |

Textos:

```text campo=info-plist-localizacao limite=4000 unidade=bytes
A localização é usada apenas quando você registra a entrada ou a saída de um plantão, para a família saber onde o registro foi feito. Você pode negar e registrar sem localização.
```

```text campo=info-plist-camera limite=4000 unidade=bytes
A câmera é usada só quando você escolhe tirar a foto de um documento do seu cadastro de profissional. A foto é enviada ao WorkEasy para a análise do cadastro; só você e a equipe de análise podem vê-la.
```

Limite de 4.000 bytes por purpose string, conforme a documentação da Apple. A frase de visibilidade ("só você e a equipe de análise") reflete as políticas do bucket privado (dono e admin leem, `docs/ARQUITETURA.md`) e deve combinar com o texto da política de privacidade (L03).

Criptografia (documentação da Apple: o uso de "encryption that's built into the operating system—for example, when your app makes HTTPS connections using URLSession—is exempt"):

```xml
<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

A Apple avisa que quem usa criptografia isenta "might alternatively be required to submit a year-end self-classification report to the U.S. government". Se isso se aplica à PJ é questão para o advogado. [CONDICIONAL: depende de parecer]

Valide o arquivo depois de editar: `plutil -lint ios/App/App/Info.plist` (utilitário citado na documentação da Apple para validar listas de propriedades).

### 9.2 macOS (`src-tauri/Info.plist` e `tauri.conf.json`)

| Item | Hoje | O que fazer |
|---|---|---|
| Localização | Usa a chave de iOS `NSLocationWhenInUseUsageDescription` | A Apple diz: "If you need location information in a macOS app, use `NSLocationUsageDescription` instead". Acrescentar essa chave com o mesmo texto, se o check-in for permitido no desktop |
| Câmera | `NSCameraUsageDescription` presente | Só é preciso se a câmera for usada no desktop; trocar o texto como no iOS |
| Criptografia | Ausente | Acrescentar `ITSAppUsesNonExemptEncryption` = `NO` (a documentação do Tauri pede isso para a Mac App Store) |
| Entitlements | Nenhum arquivo | Fora da loja basta o Hardened Runtime, que o Tauri liga por padrão (`hardenedRuntime: true`). Para a Mac App Store, ver 11.4 |
| CSP | `connect-src 'self' ipc: http://ipc.localhost` | **Bloqueia chamadas ao Supabase.** Antes de qualquer build desktop com backend, a política precisa permitir o domínio do projeto (F36) |
| Copyright, descrição, versão | Pessoa física; "Protótipo de demonstração"; 0.1.0 | Atualizar para a PJ, texto de produção e versão de lançamento |

## 10. Assinatura, TestFlight e envio (iOS)

### 10.1 O que é preciso ter

| Item | Para quê | Observação |
|---|---|---|
| Conta de organização | Tudo | Seção 2 |
| Mac com **Xcode 26 ou superior** | Compilar e assinar | O Capacitor 8 diz "Xcode 26.0+ is required". A página "Upcoming Requirements" da Apple diz, desde 28/04/2026: "Apps uploaded to App Store Connect must be built with Xcode 26 or later using an SDK for iOS 26, iPadOS 26, tvOS 26, visionOS 26, or watchOS 26." |
| Node 22 e `npm ci` | Gerar o bundle | `package.json` e o pacote local `CapApp-SPM` apontam para `node_modules/@capacitor/app` |
| Registro do app no App Store Connect | Receber o build | O Bundle ID `br.com.workeasy` não muda depois do primeiro build |
| Certificado de distribuição ("Apple Distribution") e perfil de provisionamento de distribuição | Assinar para a loja | Com assinatura automática o Xcode gerencia: "Xcode uses cloud-managed signing certificates to automatically code sign your app". Para TestFlight o perfil precisa conter identificadores de aplicativo |
| Chave de API do App Store Connect (`.p8`, ID da chave, ID do emissor) | Assinar e enviar pela linha de comando ou CI sem senha | Gerada pelo Account Holder em Users and Access, aba Integrations |
| Variáveis públicas de produção | O build sair com backend | `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` (públicas por desenho). Sem elas o build sai em modo demonstração (F34) |

### 10.2 Passo a passo (primeira vez)

1. **Criar o app** no App Store Connect: Apps → botão + → New App; plataforma iOS; nome; idioma principal Português (Brasil); Bundle ID `br.com.workeasy`; SKU (livre, "not visible to customers"); acesso. Perfil necessário: Account Holder, App Manager ou Admin.
2. **Preparar o projeto:** aplicar as mudanças das seções 9 e 12 (principalmente remover o conteúdo de demonstração). A faixa e as rotas de demonstração são código do app e precisam sair **antes** do build.
3. **Gerar o bundle e sincronizar o projeto Xcode:**

```bash
cd apps/web
npm ci
# Valores públicos de produção. Nunca chaves secretas aqui (regra do projeto e do claims-guard).
export VITE_SUPABASE_URL="https://<ref>.supabase.co"
export VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_<chave publicável>"
npm run build:native        # tsc + vite build --mode native → dist/
npx cap sync ios            # copia dist/ para ios/App/App/public e atualiza os pacotes
```

As variáveis `VITE_*` já presentes no ambiente têm a maior prioridade e não são sobrescritas pelos arquivos `.env` (documentação do Vite); `.env.native.local` também serve e fica fora do Git.

4. **Caminho A, pelo Xcode (o mais simples na primeira vez):** abrir `ios/App/App.xcodeproj`; no alvo `App`, aba Signing & Capabilities, escolher o Team e deixar "Automatically manage signing"; em General, conferir versão (`MARKETING_VERSION`) e build (`CURRENT_PROJECT_VERSION`); destino "Any iOS Device"; **Product → Archive**; no Organizer, **Validate App** e depois **Distribute App → TestFlight & App Store → Distribute** (segundo a Apple, essa opção atualiza o número de build do conteúdo do archive, assina automaticamente e envia com símbolos).
5. **Caminho B, pela linha de comando** (reproduzível; os comandos seguem o `man xcodebuild`):

```bash
cd apps/web
export TEAM_ID="<ID da equipe, 10 caracteres>"
export BUILD=1                                            # sobe a cada envio (CFBundleVersion)
export ASC_KEY="$HOME/.appstoreconnect/AuthKey_<KEY_ID>.p8"
export ASC_KEY_ID="<KEY_ID>"
export ASC_ISSUER="<ISSUER_ID>"

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath ios/build/WorkEasy.xcarchive \
  DEVELOPMENT_TEAM="$TEAM_ID" CURRENT_PROJECT_VERSION="$BUILD" MARKETING_VERSION=1.0 \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER" \
  archive

xcodebuild -exportArchive \
  -archivePath ios/build/WorkEasy.xcarchive \
  -exportOptionsPlist ios/ExportOptions.plist \
  -exportPath ios/build/export \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER"
```

`ios/build/` já está no `.gitignore` de `ios/`. Arquivo `ios/ExportOptions.plist` (sem segredo; pode ir ao Git):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>teamID</key>
  <string>TEAM_ID_AQUI</string>
  <key>signingStyle</key>
  <string>automatic</string>
</dict>
</plist>
```

A Apple diz que as chaves aceitas em `-exportOptionsPlist` aparecem em `xcodebuild -help`, e que o produto "can either be uploaded to Apple or exported locally". Os nomes `method`, `destination`, `teamID` e `signingStyle` e o valor `app-store-connect` vêm do uso corrente do Xcode e da documentação do Tauri (`--export-method app-store-connect`); a do fastlane ainda lista `app-store`. **Confira com `xcodebuild -help` no seu Xcode 26.** [incerto] Se preferir exportar e enviar separado, use `destination` = `export` e depois `xcrun altool --upload-app -f ios/build/export/App.ipa -t ios --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER"` (formato igual ao do Tauri para macOS) ou o app Transporter.

6. **Aguardar o processamento:** "the build needs to be processed in Apple's system before it appears in App Store Connect. You'll receive an email when this process is complete." Cada build é identificado por Bundle ID, versão e **string de build**: suba o `BUILD` a cada envio.

### 10.3 fastlane (opcional, não está no repo)

Esboço montado só com parâmetros que a documentação do fastlane lista (`project`, `scheme`, `export_method`, `xcargs`, `output_directory`; `api_key_path`, `skip_waiting_for_build_processing`, `changelog`). Teste num Mac antes de confiar nele. [incerto]

```ruby
# ios/fastlane/Fastfile (opcional)
default_platform(:ios)

platform :ios do
  desc "Gera o IPA e envia ao TestFlight"
  lane :beta do |options|
    build_app(
      project: "App/App.xcodeproj",
      scheme: "App",
      configuration: "Release",
      export_method: "app-store",
      output_directory: "build",
      xcargs: "DEVELOPMENT_TEAM=#{ENV['TEAM_ID']} CURRENT_PROJECT_VERSION=#{options[:build]} -allowProvisioningUpdates"
    )
    upload_to_testflight(
      api_key_path: ENV["ASC_KEY_JSON"],
      skip_waiting_for_build_processing: true,
      changelog: options[:changelog]
    )
  end
end
```

`ASC_KEY_JSON` aponta para um arquivo no formato que o fastlane documenta: `{"key_id": "<KEY_ID>", "issuer_id": "<ISSUER_ID>", "key_filepath": "AuthKey_<KEY_ID>.p8"}`. A documentação do fastlane avisa que o perfil **Developer** envia builds mas não atualiza informações de build nem testadores: para isso o perfil precisa ser App Manager ou Admin. Execução: `cd apps/web/ios && fastlane beta build:2`.

### 10.4 TestFlight

Fonte: "TestFlight overview" (23/10/2026).

1. **Test Information:** descrição do beta, o que testar, e-mail de retorno e, se houver login, a conta de demonstração.
2. **Grupo interno:** até 100 usuários do App Store Connect com acesso ao conteúdo. Sem Beta App Review. É a fase 0 deste documento.
3. **Grupo externo:** até 10.000 pessoas. "When you add the first build of your app to a group, the build gets sent to App Review ... A review is required only for the first build." A diretriz 2.2 acrescenta que o app em TestFlight "should be intended for public distribution and should comply with the App Review Guidelines": **o build externo não pode carregar a faixa nem as rotas de demonstração**.
4. O build fica disponível por **90 dias**; expire o build quando acabar o teste.
5. Testadores instalam o app TestFlight e aceitam o convite por e-mail ou link público; enviam feedback pelo app ou por captura de tela.

### 10.5 Enviar à App Store

1. App Store Connect → o app → versão 1.0: preencher textos e capturas (seção 4), URLs, copyright, categoria, **App Privacy** (5), **classificação etária** (6), **questionário de bens e serviços digitais** (3.2), preço gratuito e disponibilidade só Brasil (4.8), **App Review Information** com contato, conta de demonstração e Notes (7).
2. Escolher o build processado, marcar liberação **manual** e **Submit for Review**.
3. Acompanhar pelo App Store Connect. Em caso de rejeição, a Apple orienta: "please use App Store Connect to communicate directly with the App Review team"; há também recurso formal (Appeals). Não reenvie sem corrigir o motivo.

## 11. macOS: distribuir fora da loja (Developer ID e notarização com Tauri)

Fonte: documentação da Apple sobre notarização e documentação do Tauri 2 ("macOS Code Signing", atualizada em 17/05/2026), lidas em 23/10/2026. Esta é a rota recomendada para o macOS no piloto (decisão D2): o DMG sai do seu site e **não passa pela App Review**. A Apple descreve: "Notarization of macOS software is not App Review. The Apple notary service is an automated system that scans your software for malicious content, checks for code-signing issues, and returns the results to you quickly." E exige: "all software built after June 1, 2019, and distributed with Developer ID must be notarized".

### 11.1 Requisitos da Apple para notarizar

Assinar com certificado **Developer ID** (não vale Mac Distribution, ad hoc nem de desenvolvimento), ligar o Hardened Runtime (o Tauri liga por padrão: `hardenedRuntime: true`), incluir selo de tempo seguro, não ter a entitlement `com.apple.security.get-task-allow` e compilar contra o SDK 10.9 ou superior.

### 11.2 Passo a passo

1. **Antes de tudo, corrigir o desktop** (seção 9.2): CSP que libera o domínio do Supabase, copyright da PJ, descrição de produção, versão de lançamento e a chave `NSLocationUsageDescription`. Sem a CSP, o app com backend não consegue chamar a API.
2. **Mac** com Xcode Command Line Tools, Rust e Node 22 (README do app). O Tauri avisa que a assinatura exige um aparelho Apple, por força dos termos da Apple.
3. **Certificado "Developer ID Application"** (só o Account Holder cria): no Keychain Access, gerar o pedido de assinatura (CSR); no portal Certificates, Identifiers & Profiles, Create a certificate, tipo *Developer ID Application*, enviar o CSR e baixar o `.cer`; abrir o arquivo para instalar no chaveiro "login".
4. **Identidade:** `security find-identity -v -p codesigning` e copiar o nome completo, no formato `Developer ID Application: <Razão Social> (<TEAM_ID>)`. Pode ir em `bundle > macOS > signingIdentity` do `tauri.conf.json` ou na variável `APPLE_SIGNING_IDENTITY`.
5. **Credenciais de notarização**, uma das duas (Tauri):
   - Chave de API: App Store Connect → Users and Access → Integrations → Add (nome e acesso Developer); anote o *Issuer ID* e o *Key ID* e baixe o `.p8` (só é possível uma vez).
   - Apple ID: e-mail do Apple ID, **senha específica de app** (a 2FA é obrigatória) e Team ID.
6. **Build assinado e notarizado:**

```bash
cd apps/web
npm ci
export VITE_SUPABASE_URL="https://<ref>.supabase.co"
export VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_<chave publicável>"
export APPLE_SIGNING_IDENTITY="Developer ID Application: <Razão Social> (<TEAM_ID>)"
# Notarização, opção A (chave de API)
export APPLE_API_ISSUER="<ISSUER_ID>"
export APPLE_API_KEY="<KEY_ID>"
export APPLE_API_KEY_PATH="$HOME/.appstoreconnect/AuthKey_<KEY_ID>.p8"
# Notarização, opção B (Apple ID): em vez das três linhas acima
#   export APPLE_ID="<e-mail do Apple ID>"
#   export APPLE_PASSWORD="<senha específica de app>"
#   export APPLE_TEAM_ID="<TEAM_ID>"
npm run tauri build -- --bundles dmg
# Para Apple Silicon e Intel no mesmo app, acrescente: --target universal-apple-darwin
```

O `beforeBuildCommand` do `tauri.conf.json` roda `npm run build:native` e lê as variáveis `VITE_*` do ambiente. Segundo o Tauri, a notarização é obrigatória com certificado Developer ID e, com as variáveis acima, o próprio `tauri build` a executa; `--skip-stapling` pula só o grampeamento numa primeira passada. Para o alvo universal pode ser preciso instalar os dois alvos do Rust (`rustup target add x86_64-apple-darwin aarch64-apple-darwin`) [incerto: o Tauri cita só o alvo Apple Silicon para builders Intel].

7. **Conferir a assinatura** (comandos da Apple em "Resolving common notarization issues"):

```bash
# O .app fica em bundle/macos/ [incerto: o Tauri monta o .app antes do .dmg; confira a pasta]
# Com --target universal-apple-darwin, troque target/release por target/universal-apple-darwin/release
APP=src-tauri/target/release/bundle/macos/WorkEasy.app
codesign -vvv --deep --strict "$APP"        # assinatura válida, incluindo conteúdo aninhado
spctl -vvv --assess --type exec "$APP"      # o sistema aceitaria rodar?
codesign -dvv "$APP"                        # a saída deve ter "Timestamp"
```

8. **Notarizar e grampear o DMG à mão**, se o log do build não mostrar que o Tauri notarizou também o `.dmg` [incerto]. A Apple aceita imagens de disco (UDIF), pacotes e ZIPs:

```bash
# O nome do DMG leva versão e arquitetura. Com --target universal-apple-darwin, troque target/release por target/universal-apple-darwin/release
DMG=$(ls src-tauri/target/release/bundle/dmg/*.dmg)
xcrun notarytool store-credentials "workeasy-notary" --apple-id "<Apple ID>" --team-id "<TEAM_ID>" --password "<senha específica de app>"
xcrun notarytool submit "$DMG" --keychain-profile "workeasy-notary" --wait
xcrun notarytool log <ID da submissão> --keychain-profile "workeasy-notary" log.json
xcrun stapler staple "$DMG"
```

A Apple recomenda ler o log mesmo quando a notarização é aceita ("Always check the log file, even if notarization succeeds"), recomenda não passar de 75 notarizações por dia, para evitar demora, e diz que "altool" não notariza mais desde 01/11/2023.

9. **Testar como o usuário:** baixar o DMG do próprio site (com quarentena), num Mac que nunca viu o app; arrastar para Aplicativos e abrir sem aviso de segurança.
10. **Publicar:** DMG em HTTPS no site, com versão, requisitos e a mesma política de privacidade. O projeto não tem atualizador automático (o `Cargo.toml` só depende de `tauri`): cada versão nova é baixada de novo. Windows, Linux e atualização estão em `desktop-e-assinatura.md` (documento S03).

### 11.3 Automação em CI (opcional)

Hoje o job de macOS do `web-release.yml` gera DMG sem assinatura. Para assinar no CI, o Tauri documenta guardar como segredos o `.p12` em base64 (`APPLE_CERTIFICATE`), a senha dele (`APPLE_CERTIFICATE_PASSWORD`), a identidade e as credenciais de notarização, importar o certificado num chaveiro temporário e chamar o `tauri build`. Isso muda `.github/workflows/`, fora deste documento: decida os segredos primeiro e peça a mudança como tarefa própria.

### 11.4 Mac App Store (opcional, decisão D2)

Só vale a pena se a distribuição pela loja for desejada. Pontos de decisão e passos do Tauri ("App Store"):

- **Registro único:** com o iOS já cadastrado, adicione a plataforma macOS ao **mesmo** registro ("All platforms will share the same bundle ID"). Depois que a App Review aprovar duas plataformas, o app vira compra universal e "stays as universal purchase": não dá para remover uma plataforma. Registros que já existem separados não podem ser fundidos ("you can't merge them"). Bundle ID e SKU passam a ser os mesmos nas duas plataformas, e a classificação etária é do app inteiro ("applied across all platforms").
- **Diretriz 2.4.5 (Mac App Store):** o app deve estar "appropriately sandboxed", ser empacotado com tecnologias do Xcode e não instalar código adicional.
- **Certificados e perfil:** *Apple Distribution* e *Mac Installer Distribution* (este assina o `.pkg`); perfil *Mac App Store Connect* para o App ID `br.com.workeasy`, embutido como `embedded.provisionprofile`.
- **Arquivos de configuração:** `src-tauri/tauri.appstore.conf.json` com `entitlements` e o perfil (o Tauri sugere um arquivo separado para não afetar o build fora da loja), `Info.plist` com `ITSAppUsesNonExemptEncryption` e `Entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.app-sandbox</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-only</key>
  <true/>
  <key>com.apple.application-identifier</key>
  <string>TEAM_ID_AQUI.br.com.workeasy</string>
  <key>com.apple.developer.team-identifier</key>
  <string>TEAM_ID_AQUI</string>
</dict>
</plist>
```

As três primeiras chaves vêm da Apple: `network.client` "allow your sandboxed app to connect to a server process running on another machine" (sem ela o app sandboxed não chega ao Supabase); `files.user-selected.read-only` dá leitura aos arquivos escolhidos no seletor. As duas últimas, do Tauri. Câmera (`com.apple.security.device.camera`) e localização (`com.apple.security.personal-information.location`) só entram se essas funções forem mantidas no desktop.

- **Build e envio** (Tauri):

```bash
npm run tauri build -- --no-bundle
npm run tauri bundle -- --bundles app --target universal-apple-darwin --config src-tauri/tauri.appstore.conf.json
xcrun productbuild --sign "<identidade Mac Installer Distribution>" \
  --component "src-tauri/target/universal-apple-darwin/release/bundle/macos/WorkEasy.app" /Applications WorkEasy.pkg
xcrun altool --upload-app --type macos --file WorkEasy.pkg --apiKey "<KEY_ID>" --apiIssuer "<ISSUER_ID>"
```

- Capturas de Mac: 1280×800, 1440×900, 2560×1600 ou 2880×1800. A categoria principal precisa ser a mesma do Xcode (`Business` hoje).
- Os riscos 4.2 e 3.1.1 valem para o Mac também.

## 12. Bloqueios do iOS hoje

Nenhum foi corrigido aqui (este documento não altera o código). "Esforço" é [estimativa] relativa, não prazo.

| ID | Bloqueio | Evidência | Diretriz | O que fazer | Esforço |
|---|---|---|---|---|---|
| B1 | Termos e Política de Privacidade inexistentes; `/legal` é provisório | F25 | 5.1.1(i) | Publicar L01 a L03 em URL pública; ligar no login, em Minha conta e no rodapé; trocar `CONSENT_VERSIONS` | Médio (jurídico) |
| B2 | Conteúdo de demonstração com backend ligado | F26 a F28, F43, F13 | 2.1(a), 2.2, 2.3.1, 1.4.1 | Build de loja sem `DemoBanner`; sem as rotas `/search`, `/health`, `/doctor/:id`, `/profile/:id`, `/dashboard`, `/verification`, `/teleconsultation/:sessionId`, `/medical-records`, `/register-provider`; sem os links "Ver profissionais de demonstração" e "Buscar profissionais de saúde"; trocar "Nesta demonstração…" e "Base legal a confirmar com advogado" por texto de produção; ajustar a linha "Cobrança da plataforma" (F43), que descreve comissão enquanto ela está desligada; ligar "Trabalhe Conosco", "Ofereço este serviço" e o link "cadastro de profissional" de Minha conta a `/pro/cadastro` | Médio |
| B3 | Assinatura Pro contratada no app e paga no Asaas | F18 | 3.1.1 | Seção 3.2 (caminho A no primeiro envio) | Baixo (A) a alto (B, C) |
| B4 | Conteúdo de usuário sem denúncia, bloqueio, filtro e contato | F20, F21, F40, F44 | 1.2, 1.5 | Seção 8.2 | Médio a alto |
| B5 | Sem conta Apple de organização | – | 5.1.1(ix) | Seção 2 | Externo; prazo [incerto] |
| B6 | Backend não implantado; sem SMS de produção; sem contas de demonstração | F34, F35 | 2.1(a) | Implantação (outros documentos do plano), seção 7 | Externo |
| B7 | `Info.plist` e manifesto incompletos | F08, F09 | 5.1.1(ii), exportação | Seção 9.1 | Baixo |
| B8 | Ambiente de assinatura inexistente | F05, F06 | – | Seção 10 | Baixo a médio |
| B9 | Risco de reprovação por 4.2 | F03, F04 | 4.2 | Seção 3.3 | Médio a alto |
| B10 | Linha Cuidado visível para todo usuário logado (menu "Cuidado" do cliente e "Plantões" do profissional) | F33 | `DECISOES.md` D12, 5.1.1(ix) | Esconder menus e rotas (`/cuidado`, `/pro/plantoes`) do build iOS até os pré-requisitos de D12, ou assumir a linha e incluir o trecho Cuidado nas Notes (seção 7.4) | Baixo |
| B11 | Exclusão: nota fica; recusa com atendimento em andamento; frase sobre lei fiscal | F22, F23, F39 | 5.1.1(v) | Seção 8.4 | Baixo mais jurídico |
| B12 | Nome e marca não conferidos | – | 2.3.7, 5.2.1 | INPI e disponibilidade no App Store Connect | Externo |
| B13 | Idade mínima dos Termos pode obrigar 18+ | – | 2.3.6 | Seção 6, decisão D5 | Jurídico |

**Bloqueios só do macOS desktop** (F36): CSP sem o domínio do Supabase; copyright em nome de pessoa física; descrição e versão de protótipo; `Info.plist` sem a chave de localização do macOS e sem a de criptografia; nenhum entitlement (Mac App Store).

**Não é bloqueio hoje:** Sign in with Apple (F10), IA de terceiros (F30, não exposta), rastreamento (F29), ícone (F07), localização opcional (F12), exclusão de conta existente (F22). **Não bloqueia, mas declare:** as telas de administração dentro do pacote do app, incluindo a que liga comissão e pagamento retido (F19, F44), estão descritas nas Notes (2.5.19); para reduzir a superfície, o build nativo pode ficar sem `/admin`.

## 13. Checklist de pré-envio

Marque na ordem. O que não puder ser marcado, não envie.

**Conta e contratos**
- [ ] PJ aberta; D-U-N-S emitido; site público no domínio da PJ; e-mail no domínio
- [ ] Apple Developer Program de organização ativo; contrato mais recente assinado na seção Business
- [ ] Usuários e papéis criados; chave de API do App Store Connect guardada fora do repositório
- [ ] Marca no INPI conferida; nome livre no App Store Connect

**Jurídico e privacidade**
- [ ] Termos e Política de Privacidade publicados em URL pública e ligados dentro do app; versões de consentimento atualizadas
- [ ] Política lista Supabase, Asaas, Meta (WhatsApp), Resend e o provedor de SMS (e a IA, se ligada)
- [ ] Idade mínima definida e classificação etária coerente com ela
- [ ] Texto da tela de exclusão validado pelo advogado (retenção, nota das avaliações)
- [ ] Parecer sobre pagamento recebido; comissão e pagamento retido seguem desligados (conferir em `/admin/configuracoes` no projeto de produção)

**Build de loja**
- [ ] Sem faixa, rotas, textos ou profissionais de demonstração; sem "Base legal a confirmar" na tela; "Cobrança da plataforma" coerente com a comissão desligada
- [ ] Plano Pro: caminho escolhido e aplicado (A: nenhuma tela do iOS vende, desbloqueia ou chama para o Pro)
- [ ] Denunciar, bloquear, filtro e contato de suporte funcionando; processo de resposta definido
- [ ] Decisão D4 aplicada (dentro: trecho Cuidado nas Notes; fora: sem "Cuidado" nem "Plantões" nos menus e sem as rotas)
- [ ] `Info.plist` com texto de câmera correto e `ITSAppUsesNonExemptEncryption`; `PrivacyInfo.xcprivacy` incluído; Generate Privacy Report conferido com a seção 5.2
- [ ] Backend de produção no ar; build gerado **com** `VITE_SUPABASE_URL` e a chave publicável; o app não abre em modo demonstração
- [ ] Login por telefone com SMS de produção; três números de teste com código fixo e validade longa
- [ ] Contas A, B e C prontas (B sem recebimento; A com pedido e proposta; C limpa)

**Testes**
- [ ] Archive com Xcode 26 ou superior e assinatura de distribuição; número de build novo
- [ ] TestFlight interno em iPhone **e** iPad reais: login, pedido, proposta, seletor de arquivos (com câmera?), localização (se Cuidado), exclusão de conta, link do Asaas abrindo no Safari
- [ ] (Opcional) TestFlight externo aprovado na Beta App Review

**Ficha**
- [ ] Script do apêndice A: todos os campos "ok"
- [ ] Capturas conferidas pelo apêndice B (iPhone 1206×2622, iPad 2064×2752); sem faixa de demonstração; só dados fictícios
- [ ] URLs de suporte, de política e de marketing abrem e mostram o contato real
- [ ] Copyright com a razão social; categoria; preço gratuito; disponibilidade só Brasil; liberação manual
- [ ] App Privacy respondido (5.2) e classificação etária respondida (6)
- [ ] Questionário de bens e serviços digitais respondido, se aparecer
- [ ] App Review Information: contato com "+55", conta de demonstração, Notes coladas e conferidas (7.4)

**Depois da aprovação**
- [ ] Suspender a conta B, excluir A e C pelo app, remover os números de teste do Supabase
- [ ] Reverificar tudo quando mudar: preço, Pro, Cuidado, IA, push ou qualquer coleta de dado (as respostas de App Privacy e as Notes precisam acompanhar)

## 14. Fontes abertas, itens incertos e limites desta pesquisa

Todas as páginas abaixo foram abertas em **23/10/2026** (algumas páginas de documentação da Apple e do Supabase foram lidas na versão em Markdown da mesma URL, com o sufixo `.md`). As páginas da Apple, do Tauri, do Capacitor, do Supabase, do fastlane e do Vite são fonte primária para os fatos citados; o espelho do `man xcodebuild` e o PR do Supabase são fontes secundárias, marcadas.

### 14.1 Fontes

| # | Fonte | URL | Usei para |
|---|---|---|---|
| 1 | App Review Guidelines ("Last Updated: October 16, 2026") | https://developer.apple.com/app-store/review/guidelines/ | 1.2, 1.4.1, 1.5, 2.1 a 2.5, 3.1, 3.2.2, 4.2, 4.5.4, 4.8, 5.1, 5.2.4 |
| 2 | Payment options on the App Store in Brazil | https://developer.apple.com/support/payment-options-on-the-app-store-in-brazil | Opções de pagamento, comissões, entitlement, relatórios |
| 3 | StoreKit: External Purchase | https://developer.apple.com/documentation/storekit/external-purchase | Fluxo do Brasil (iOS 26.5) |
| 4 | StoreKit: ExternalPurchaseCustomLink | https://developer.apple.com/documentation/storekit/externalpurchasecustomlink | Confirmar o fluxo do Brasil |
| 5 | Notícia "Changes to iOS in Brazil" (18/06/2026) | https://developer.apple.com/news/?id=dhwadr2x | Contexto CADE, consulta de 30 minutos |
| 6 | Notícia "Age requirements for apps distributed in Brazil, Australia, Singapore, Utah, and Louisiana" (24/02/2026) | https://developer.apple.com/news/?id=f5zj08ey | Apps 18+ no Brasil, Declared Age Range API |
| 7 | Índice de notícias da Apple Developer | https://developer.apple.com/news/ | Localizar as duas notícias |
| 8 | Upcoming Requirements | https://developer.apple.com/news/upcoming-requirements/ | Xcode 26 e SDK de iOS 26 exigidos desde 28/04/2026 |
| 9 | App Store Connect Help: Platform version information | https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information | Limites de campos, Notes, conta de demonstração |
| 10 | App Store Connect Help: App information | https://developer.apple.com/help/app-store-connect/reference/app-information/app-information | Nome, subtítulo, política, Bundle ID, categoria |
| 11 | App Store Connect Help: Screenshot specifications | https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications | Tamanhos de captura |
| 12 | App Store Connect Help: Age ratings values and definitions | https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions | Descritores e valores (global e Brasil) |
| 13 | App Store Connect Help: Set an app age rating | https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating | Regra de idade mínima do EULA |
| 14 | App Store Connect Help: Complete the Digital Goods and Services questionnaire | https://developer.apple.com/help/app-store-connect/manage-app-information/complete-the-digital-goods-and-services-questionnaire | Questionário de bens digitais |
| 15 | App Store Connect Help: Add a new app | https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app | Criar o registro do app |
| 16 | App Store Connect Help: Add platforms | https://developer.apple.com/help/app-store-connect/create-an-app-record/add-platforms | Compra universal iOS e macOS |
| 17 | App Store Connect Help: Upload builds | https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds | Altool, Transporter, processamento do build |
| 18 | App Store Connect Help: TestFlight overview | https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview | Fluxo do TestFlight, 90 dias |
| 19 | App Store Connect Help: Add internal testers | https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers | Grupo interno (até 100) |
| 20 | App Store Connect Help: Invite external testers | https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers | Grupo externo (até 10.000) |
| 21 | App privacy details on the App Store | https://developer.apple.com/app-store/app-privacy-details/ | Tipos de dado, finalidades, regras de coleta |
| 22 | Offering account deletion in your app (redireciona para `/help/app-review/guideline-reference/5-1-1-account-deletion`) | https://developer.apple.com/support/offering-account-deletion-in-your-app/ | Exclusão de conta |
| 23 | Apple Developer Program: Enroll | https://developer.apple.com/programs/enroll/ | Requisitos de organização, D-U-N-S, preço |
| 24 | Enrollment (Account Help) | https://developer.apple.com/help/account/membership/program-enrollment | Site e domínio da organização |
| 25 | App Store Small Business Program | https://developer.apple.com/app-store/small-business-program/ | Elegibilidade |
| 26 | App Store categories | https://developer.apple.com/app-store/categories/ | Definição das categorias |
| 27 | Third-party SDK requirements | https://developer.apple.com/support/third-party-SDK-requirements/ | Capacitor na lista de SDKs |
| 28 | Required Device Capabilities | https://developer.apple.com/support/required-device-capabilities/ | `UIRequiredDeviceCapabilities` |
| 29 | Complying with Encryption Export Regulations | https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations | Criptografia isenta |
| 30 | `ITSAppUsesNonExemptEncryption` | https://developer.apple.com/documentation/bundleresources/information-property-list/itsappusesnonexemptencryption | Chave de criptografia |
| 31 | Privacy manifest files | https://developer.apple.com/documentation/bundleresources/privacy-manifest-files | Manifesto de privacidade |
| 32 | Describing use of required reason API | https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api | APIs de motivo obrigatório; regra de 01/05/2024 |
| 33 | Describing data use in privacy manifests | https://developer.apple.com/documentation/bundleresources/describing-data-use-in-privacy-manifests | Chaves de dados coletados |
| 34 | Requesting access to protected resources | https://developer.apple.com/documentation/uikit/requesting-access-to-protected-resources | Regras das purpose strings |
| 35 | `NSCameraUsageDescription` | https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription | Chave da câmera |
| 36 | `NSLocationWhenInUseUsageDescription` | https://developer.apple.com/documentation/bundleresources/information-property-list/nslocationwheninuseusagedescription | Chave de localização (e a chave de macOS) |
| 37 | `UIRequiredDeviceCapabilities` | https://developer.apple.com/documentation/bundleresources/information-property-list/uirequireddevicecapabilities | Chave obrigatória no Info.plist enviado |
| 38 | Entitlements do App Sandbox: `app-sandbox`, `network.client`, `files.user-selected.read-only`, `device.camera`, `device.audio-input`, `personal-information.location` | https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.network.client (os outros seguem o mesmo padrão, com `com.apple.security.` e o nome) | Sandbox do macOS (Mac App Store) |
| 39 | Distributing your app for beta testing and releases | https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases | Archive, Validate App e Distribute App no Xcode |
| 40 | Notarizing macOS software before distribution | https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution | Requisitos e fluxo de notarização |
| 41 | Customizing the notarization workflow | https://developer.apple.com/documentation/security/customizing-the-notarization-workflow | `notarytool`, `stapler`, 75 por dia |
| 42 | Resolving common notarization issues | https://developer.apple.com/documentation/security/resolving-common-notarization-issues | `codesign` e `spctl` para conferir |
| 43 | `man xcodebuild` (espelho de terceiros, **secundária**) | https://keith.github.io/xcode-man-pages/xcodebuild.1.html | Opções de `xcodebuild` |
| 44 | Tauri 2: macOS Code Signing (atualizada em 17/05/2026) | https://v2.tauri.app/distribute/sign/macos/ | Developer ID, variáveis `APPLE_*`, notarização |
| 45 | Tauri 2: App Store | https://v2.tauri.app/distribute/app-store/ | Mac App Store |
| 46 | Tauri 2: DMG | https://v2.tauri.app/distribute/dmg/ | Pacote DMG |
| 47 | Tauri 2: Configuration reference | https://v2.tauri.app/reference/config/ | `hardenedRuntime`, `entitlements`, `infoPlist` |
| 48 | Capacitor: Getting Started (iOS) | https://capacitorjs.com/docs/ios | Xcode 26, iOS 15 |
| 49 | Capacitor: Deploying to App Store | https://capacitorjs.com/docs/ios/deploying-to-app-store | Fluxo de envio |
| 50 | Capacitor: Privacy Manifest | https://capacitorjs.com/docs/ios/privacy-manifest | Manifesto do Capacitor |
| 51 | Capacitor: Configuration | https://capacitorjs.com/docs/config | `server.url` e `webDir` |
| 52 | fastlane: `build_app` | https://docs.fastlane.tools/actions/build_app/ | Parâmetros do esboço |
| 53 | fastlane: `upload_to_testflight` | https://docs.fastlane.tools/actions/upload_to_testflight/ | Parâmetros do esboço, chave de API |
| 54 | Supabase: Phone Login | https://supabase.com/docs/guides/auth/phone-login | Código expira em 1 hora |
| 55 | Supabase: self-hosted phone (`SMS_TEST_OTP`) | https://supabase.com/docs/guides/self-hosting/self-hosted-phone-mfa | Números de teste |
| 56 | Supabase: CLI config (`auth.sms.test_otp`) | https://supabase.com/docs/guides/local-development/cli/config | Mapa de números de teste |
| 57 | Supabase: Auth error codes | https://supabase.com/docs/guides/auth/debugging/error-codes | `user_banned`, limite por IP |
| 58 | Supabase: Going into prod | https://supabase.com/docs/guides/deployment/going-into-prod | Limites de taxa por IP |
| 59 | Supabase PR nº 52118 (**secundária**, aberto) | https://github.com/supabase/supabase/pull/52118 | Configuração hospedada de números de teste |
| 60 | Vite: Env Variables and Modes | https://vite.dev/guide/env-and-mode | Prioridade de `VITE_*` |
| 61 | Código do repositório e de `node_modules/@capacitor` | caminhos da seção 1 | F01 a F44 |

### 14.2 Itens [incerto] reunidos

1. Decisão da App Review sobre o Pro comprado na web usado no iOS (3.1.3(b)) e sobre oferta só em texto, com taxa e relatório (3.2).
2. Se o Asaas atende ao requisito de PSP (PCI nível 1 e atendimento a disputas) (3.2).
3. Tela exata do painel do Supabase para números de teste em projeto hospedado (7.2).
4. Se o seletor de arquivos do WebView do iOS oferece "Tirar Foto" e se pede acesso à fototeca (9.1, 7.4).
5. Como o aviso de localização aparece no WKWebView (um aviso do sistema ou dois): testar em aparelho.
6. Nomes de chave e valor de `-exportOptionsPlist` no Xcode 26 (10.2).
7. Se o projeto de produção guarda endereço IP (5.3).
8. Prazos do D-U-N-S e da aprovação da inscrição (2).
9. Alvos do Rust para o app universal (11.2).
10. Formatos de anexo aceitos em App Review Information (7.1).
11. Se o `tauri build` notariza também o `.dmg` (11.2).
12. Leitura da App Review sobre "block abusive users" (8.1) e sobre "Messaging and chat" (6).
13. Se dado repassado ao Asaas entra como "coletado" (5.3).
14. Obrigação de relatório anual de autoclassificação de criptografia (9.1).
15. Como a operação aplicaria o banimento de conta do Supabase Auth (`banned_until`) sem tela do app (8.1).

### 14.3 O que não verifiquei

- **Nenhum comando de Xcode, Tauri ou fastlane foi executado**: esta máquina não é um Mac. Os comandos vêm da documentação citada; teste-os no Mac antes de confiar.
- Li o código das telas, das funções e das migrações; não executei o app, os testes nem o banco. Os fatos F01 a F44 dizem o que o código faz, não o que um aparelho mostra.
- Não abri a legislação brasileira sobre confirmação de idade (a notícia da Apple fala em "upcoming U.S. and regional laws, including in Brazil" sem nomear a lei) nem o texto do contrato de desenvolvedor da Apple; tudo o que depende deles ficou como [CONDICIONAL: depende de parecer].
- Não vi o comportamento real do app num iPhone (seletor de arquivos, aviso de localização, link do Asaas).
- A página do fastlane sobre a chave da API do App Store Connect respondeu erro 503 e não foi usada.
- Não li os documentos irmãos do plano (lista no início); este texto aponta para eles sem depender do conteúdo.

## Apêndice A. Script que mede os textos (`verificar-ficha.py`)

Salve fora do repositório (por exemplo na sua pasta de ferramentas) e rode `python3 -I verificar-ficha.py apps/web/docs/lojas/app-store.md`. Ele lê os blocos com a marca ` ```text campo=… limite=… unidade=… `, mede em caracteres ou bytes, procura as frases bloqueadas pelo `claims-guard` e avisa de espaço no fim de linha. Sai com código 1 se algum bloco falhar.

```python
#!/usr/bin/env python3
"""Checks the store listing blocks of docs/lojas/app-store.md.

Blocks look like:   ```text campo=<nome> limite=<n> unidade=<caracteres|bytes>
Usage: python3 -I verificar-ficha.py docs/lojas/app-store.md
"""
import re
import sys
import unicodedata

BLOCK = re.compile(
    r"^```text +campo=(?P<campo>\S+) +limite=(?P<limite>\d+) +unidade=(?P<unidade>caracteres|bytes) *\n(?P<corpo>.*?)\n```",
    re.S | re.M,
)

# Same phrases as apps/web/test/claims-guard.test.ts (matched after removing accents and lowercasing).
# Written in pieces so that this file does not trip its own check.
FORBIDDEN = [
    "ponta.a" + ".ponta|end.to" + ".end",
    "assinado " + "digitalmente",
    "lgpd " + "hash",
    "registrado em log " + "de auditoria",
    "(?<!nao )verific" + "ad[oa]s?\\b",
    "liberado apos o " + "servico|pagamento " + "seguro",
    "\\d+x mais " + "chances",
    "em ate \\d+ " + "horas",
    "imediata" + "mente",
    "gratis e " + "seguro",
    "pacientes " + "reais",
    "720" + "p",
    "crm " + "ativo",
]


def normalize(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c)
    ).lower()


def main(path: str) -> int:
    text = open(path, encoding="utf-8").read()
    blocks = list(BLOCK.finditer(text))
    if not blocks:
        print("nenhum bloco encontrado")
        return 2
    failed = 0
    print(f"{'campo':<34} {'tamanho':>8} {'limite':>7}  unidade     situação")
    for match in blocks:
        campo, limite, unidade = match["campo"], int(match["limite"]), match["unidade"]
        corpo = unicodedata.normalize("NFC", match["corpo"])
        tamanho = len(corpo) if unidade == "caracteres" else len(corpo.encode("utf-8"))
        problemas = []
        if tamanho > limite:
            problemas.append(f"EXCEDE em {tamanho - limite}")
        norm = normalize(corpo)
        for pattern in FORBIDDEN:
            if re.search(pattern, norm):
                problemas.append(f"frase bloqueada /{pattern}/")
        if re.search(r"[ \t]+$", corpo, re.M):
            problemas.append("espaço no fim de linha")
        status = "ok" if not problemas else "; ".join(problemas)
        failed += bool(problemas)
        print(f"{campo:<34} {tamanho:>8} {limite:>7}  {unidade:<10}  {status}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
```

Resultado da última execução (23/10/2026), sobre este próprio arquivo:

| Campo | Tamanho | Limite | Unidade | Situação |
|---|---|---|---|---|
| `nome-opcao-a` | 8 | 30 | caracteres | ok |
| `nome-opcao-b` | 17 | 30 | caracteres | ok |
| `subtitulo-opcao-a` | 24 | 30 | caracteres | ok |
| `subtitulo-opcao-b` | 23 | 30 | caracteres | ok |
| `texto-promocional` | 153 | 170 | caracteres | ok |
| `palavras-chave` | 93 | 100 | bytes | ok |
| `descricao-base` | 1.697 | 4.000 | caracteres | ok |
| `descricao-extra-pagamento` | 265 | 600 | caracteres | ok |
| `descricao-extra-cuidado` | 188 | 600 | caracteres | ok |
| `notas-revisao-en` | 3.367 | 4.000 | bytes | ok |
| `notas-revisao-pt` | 3.656 | 4.000 | bytes | ok |
| `notas-trecho-cuidado-en` | 325 | 700 | bytes | ok |
| `notas-bens-digitais-b-en` | 245 | 900 | bytes | ok |
| `notas-bens-digitais-c-en` | 308 | 900 | bytes | ok |
| `info-plist-localizacao` | 188 | 4.000 | bytes | ok |
| `info-plist-camera` | 211 | 4.000 | bytes | ok |

Saída do terminal: código 0 (nenhum bloco falhou).

## Apêndice B. Script que confere as capturas (`verificar-capturas.py`)

Confere se cada PNG tem um dos tamanhos aceitos pela Apple (página lida em 23/10/2026) e se não tem canal alfa nem transparência (percorre os blocos do PNG até o primeiro `IDAT`, onde o bloco `tRNS` precisa estar). Testado com PNG gerados de cada caso (RGB, RGBA, paleta com e sem `tRNS`, tamanho errado, arquivo que não é PNG). Rode `python3 -I verificar-capturas.py captura1.png captura2.png …`. Exporte as capturas em PNG.

```python
#!/usr/bin/env python3
"""Checks PNG screenshots against App Store Connect sizes (page read on 2026-10-23).
Usage: python3 -I verificar-capturas.py shot1.png shot2.png ...
"""
import struct
import sys

SIZES = {
    "iPhone Dynamic Island (médio)": {(1179, 2556), (2556, 1179), (1206, 2622), (2622, 1206)},
    "iPhone Dynamic Island (grande)": {(1260, 2736), (2736, 1260), (1290, 2796), (2796, 1290), (1320, 2868), (2868, 1320)},
    "iPad 13 polegadas": {(2064, 2752), (2752, 2064), (2048, 2732), (2732, 2048)},
    "Mac": {(1280, 800), (1440, 900), (2560, 1600), (2880, 1800)},
}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def png_info(path):
    """Returns (width, height, color_type, has_trns), or None when the file is not a PNG."""
    with open(path, "rb") as f:
        data = f.read()
    if data[:8] != PNG_SIGNATURE:
        return None
    width, height = struct.unpack(">II", data[16:24])
    color_type = data[25]
    has_trns = False
    pos = 8
    while pos + 8 <= len(data):  # walk the chunks; tRNS must come before the first IDAT
        length, kind = struct.unpack(">I4s", data[pos:pos + 8])
        if kind == b"tRNS":
            has_trns = True
        if kind in (b"IDAT", b"IEND"):
            break
        pos += 12 + length
    return width, height, color_type, has_trns


def main(paths):
    bad = 0
    for path in paths:
        info = png_info(path)
        if info is None:
            print(f"{path}: não é PNG")
            bad += 1
            continue
        width, height, color_type, has_trns = info
        grupos = [nome for nome, tamanhos in SIZES.items() if (width, height) in tamanhos]
        alpha = color_type in (4, 6) or has_trns
        problemas = []
        if not grupos:
            problemas.append("tamanho fora da lista da Apple")
        if alpha:
            problemas.append("tem canal alfa/transparência (a Apple não aceita)")
        print(f"{path}: {width}x{height} -> {', '.join(grupos) or '-'}; {'; '.join(problemas) or 'ok'}")
        bad += bool(problemas)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
```
