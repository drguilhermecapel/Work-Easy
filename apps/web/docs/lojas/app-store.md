# App Store (iOS e macOS): kit de envio, privacidade e diretrizes

> **Rascunho para revisão de advogado. Não é parecer jurídico.**
> Documento S02 do plano. Versão `2026-11-08-rascunho-1`. Data de referência: **08/11/2026**. Estado do produto: protótipo (MVP em `main`), **não implantado, sem usuários reais, nada testado contra Asaas, WhatsApp ou Resend reais**. Este kit diz o que enviar à Apple quando houver backend no ar e um build de loja. Nada aqui afirma que o app foi enviado, aprovado ou que cumpre qualquer norma. Trechos de diretriz em inglês são citações literais das páginas abertas em 08/11/2026; a leitura em português é nossa.

## Como ler

| Marca | Significa |
|---|---|
| **[PLANEJADO]** | Não existe no código hoje. Precisa ser feito antes de depender disso. |
| **[CONDICIONAL: depende de parecer]** | Depende de parecer do advogado. |
| **[DECISÃO DO DONO]** | Escolha de negócio. O padrão sugerido aqui vale até o dono decidir. |
| **[incerto]** | Não confirmei em fonte primária aberta, ou só a Apple decide. Conferir antes de agir. |

Fontes são citadas como **[A1]** a **[A16]** (seção 16). Caminhos de arquivo são relativos a `apps/web/`.

---

## 0. Veredito e resumo

**Veredito: não enviar à App Review hoje.** Há bloqueios de conteúdo, de produto, de conta e de build. Os oito que decidem o envio:

| # | Bloqueio | Diretriz | Seção |
|---|---|---|---|
| B1 | Termos de Uso, Política de Privacidade e SAC são rascunhos "em elaboração" (`content/legal/*.md`). A ficha exige link da política no App Store Connect e no app. | 5.1.1(i), 1.5 | 3.5 |
| B2 | Backend não implantado. Sem conta de demonstração para o revisor. O login é só por código; o SMS depende de um provedor que não existe. | 2.1(a) | 7 |
| B3 | O plano Pro (R$ 49/mês) é cobrado por fora do app (Asaas, `subscriptions-manage`). Recurso digital tem de usar compra no app. | 3.1.1 | 3.2 |
| B4 | Avaliações, pedidos e propostas são conteúdo de usuário sem denúncia, bloqueio nem filtro. | 1.2 | 9 |
| B5 | A conta Apple precisa ser de **organização**: pessoa jurídica, D-U-N-S e site público no domínio da empresa. A pessoa jurídica ainda não existe. | Inscrição; 5.1.1(ix) | 2 |
| B6 | A build com backend ainda contém rotas de funcionalidade futura (`/verification`, `/health`, `/doctor/:id`, `/teleconsultation/:sessionId`, `/medical-records`) e textos de protótipo. | 2.1(a), 2.5.19 | 3.9 |
| B7 | A ficha de privacidade e o `PrivacyInfo.xcprivacy` não batem com os fluxos reais (faltam endereço, dados financeiros, dados de produto e, se o Sentry for ligado, diagnósticos). | 5.1.1(i); precisão da ficha | 5 |
| B8 | Recursos de IA de terceiros enviam texto ao provedor (resumo do Cuidado e rascunho de orçamento). Há aviso genérico na tela ("serviço de inteligência artificial de terceiros", sem nomear o provedor), sem aceite registrado. | 5.1.2(i) | 3.8 |

**Riscos que podem reprovar mesmo com os bloqueios resolvidos:**

| # | Risco | Diretriz | Situação |
|---|---|---|---|
| R1 | Parecer de web empacotado. O app iOS hoje usa câmera (fotos de documento), localização opcional e o restante é o site. Sem push e sem Universal Links. | 4.2 | **Alto.** Ver 3.3. |
| R2 | Exclusão de conta recusada quando há atendimento ativo (HTTP 409). | 5.1.1(v) | Médio. Ver 8. |
| R3 | Build de Xcode: o Capacitor 8 exige Xcode 26.0 ou mais novo, e o envio exige SDK do iOS 26 desde 28/04/2026. | Requisito de upload | Exige um Mac com Xcode 26. Ver 11. |

**O que já está certo para a Apple (conferido no repositório):**

- Exclusão de conta dentro do app: `pages/conta/Conta.tsx` ("Excluir minha conta") chama `supabase/functions/account-delete`.
- Login próprio por código, sem login social. Por isso Sign in with Apple não é exigido (3.4).
- Localização opcional, com consentimento por registro (`components/cuidado/CheckinPanel.tsx`).
- Nenhum SDK de publicidade ou de rastreamento. Sentry só carrega com `VITE_SENTRY_DSN` (`lib/observability.ts`).
- `PrivacyInfo.xcprivacy` existe e está no alvo do Xcode (`ios/App/App.xcodeproj/project.pbxproj`, linhas 18, 32, 76 e 150).
- Identificador `br.com.workeasy` igual em Capacitor, Tauri e Xcode. Versão mínima de iOS 15.0, a exigida pelo Capacitor 8.
- Ícone de 1024 × 1024 px em RGB, sem canal alfa (conferido no cabeçalho do PNG).

### Decisões que só o dono pode tomar

| # | Decisão | Padrão sugerido aqui | Seção |
|---|---|---|---|
| D1 | Plano Pro no iOS | Primeira versão **sem** venda, upsell nem link de pagamento do Pro no iOS. Depois, escolher entre compra no app (StoreKit, [PLANEJADO]) e outra forma, com parecer. | 3.2 |
| D2 | macOS | Só DMG notarizado, fora da loja. Sem Mac App Store na primeira versão. | 12 e 13 |
| D3 | iPad | Manter (o projeto aceita iPhone e iPad: `TARGETED_DEVICE_FAMILY = "1,2"`). Isso obriga capturas de iPad 13 polegadas. Alternativa: restringir a iPhone. | 4.6 |
| D4 | Linha Cuidado na primeira versão iOS | **Fora.** `docs/DECISOES.md` (seção 5) diz que o menu Cuidado não deve ser divulgado antes dos pré-requisitos. Fora da versão, saem a localização, os relatórios com texto livre e a IA de resumo. | 3, 5, 10 |
| D5 | Área de Saúde na primeira versão iOS | **Fora** da descrição e das categorias. Evita a revisão extra de app médico (1.4.1). | 4.3 |
| D6 | Assistente e resumo com IA na primeira versão iOS | **Fora**, até haver tela de consentimento específica e aceite registrado. | 3.8 |

### Ordem recomendada

1. Decidir D1 a D6.
2. Abrir a pessoa jurídica, o D-U-N-S e o site público no domínio da empresa (seção 2).
3. Publicar Termos, Privacidade e SAC aprovados pelo advogado (B1).
4. Remover da build iOS as rotas de funcionalidade futura e a venda do Pro (B3, B6).
5. Implementar denúncia e bloqueio mínimos (B4, seção 9).
6. Corrigir os textos de permissão e o manifesto (seção 10) e fechar a ficha de privacidade (seção 5).
7. Subir o backend, criar as contas de revisão e testar o login (B2, seção 7).
8. Gerar o build com Xcode 26, enviar ao TestFlight e testar em aparelho (seção 11).
9. Preencher a ficha, as notas de revisão e enviar (seção 15).

---

## 1. Fatos do produto usados neste kit (conferidos em 08/11/2026)

Cada fato abaixo foi conferido no código ou na documentação do repositório. Os que não foram confirmados estão marcados.

| ID | Fato | Onde conferir |
|---|---|---|
| F01 | Login por código de 6 dígitos enviado por e-mail (`signInWithOtp` com `email`). Login por SMS usa `channel: 'sms'`, mas o SMS depende de provedor configurado, ainda não existe. Não há senha em produção. | `services/auth.ts`; `supabase/config.toml` (`[auth.email]`, `[auth.sms]`); `docs/juridico/03-politica-de-privacidade.md` §3.1 |
| F02 | Nenhum login social. Não há `signInWithOAuth` nem login com Apple ou Google no código. | busca em `apps/web` (exclui `test/`) |
| F03 | Pedidos (`requests`), propostas com mensagem (`proposals.message`), agendamentos, orçamentos, avaliações com comentário (`reviews.comment`, até 1.000 caracteres) e relatórios do Cuidado (texto livre). | `docs/ARQUITETURA.md`, "Tabelas por domínio" |
| F04 | Pagamento de serviço por Pix ou cartão. O cartão é digitado na página de pagamento do Asaas (`invoiceUrl`). O app não recebe número de cartão. Split de subconta. Comissão e pagamento retido desligados. | `docs/ARQUITETURA.md`, "Pagamentos e assinaturas"; `components/cliente/PaymentPanel.tsx` |
| F05 | Plano Pro: R$ 49/mês (`pro_price_cents = 4900`), cobrado via `subscriptions-manage` (Asaas). Teste de 30 dias no banco; o fallback do cliente é 0. | `services/proBilling.ts`; `config/features.ts`; `docs/DECISOES.md` |
| F06 | Avaliação só após atendimento concluído e pago pelo app. Moderação só pelo administrador (`reviews_admin_update`, troca `published`). **Não há denúncia, bloqueio nem filtro de conteúdo.** | `supabase/migrations/20261019000007_quotes_reviews.sql`; `docs/juridico/05-politica-de-avaliacoes-e-moderacao.md` §11.3 |
| F07 | Localização: `navigator.geolocation` via `locate()`. Usada só no check-in e check-out de plantão, com consentimento "location" e opção de não enviar. | `platform/geolocation.ts`; `components/cuidado/CheckinPanel.tsx` |
| F08 | Câmera e fotos: `<input type="file" capture>` via `captureFile()`. No cadastro de profissional, só imagens (o botão "Fotografar"). PDF pelo seletor de arquivos. | `platform/files.ts`; `pages/pro/Cadastro.tsx` (linha 52, `CAPTURE_FILES`, e linha 502, botão "Fotografar") |
| F09 | Prévia de câmera (`getUserMedia`) só existe em `pages/Verification.tsx`, que é o fluxo de demonstração. Com backend, `/verification` mostra `FutureFeaturePage`. | `pages/Verification.tsx`; `pages/prototype/routes.tsx` (linhas 29 e 49); `docs/arquitetura/producao-vs-demonstracao.md` §3 |
| F10 | Sem push. As notificações saem por WhatsApp (Cloud API) e e-mail (Resend). `PUSH_NOTIFICATIONS_IMPLEMENTED = false`. | `platform/notifications.ts`; `docs/ARQUITETURA.md`, "Notificações" |
| F11 | Exclusão de conta: "Excluir minha conta" em `/conta`, com a palavra `EXCLUIR`. Recusa com 409 `active_bookings` se houver atendimento `accepted`, `paid`, `in_progress` ou `disputed`. Remove o usuário do Auth e anonimiza. Exportação em JSON em `/conta`. | `pages/conta/Conta.tsx` (linhas 313 e 426); `supabase/functions/account-delete/handler.ts`; `supabase/functions/account-export` |
| F12 | Funções de IA com provedor externo (Anthropic). `care-summary` recebe o texto dos relatórios (sem nomes); `quote-assist` recebe a descrição do trabalho. Ambas aparecem em telas: `components/cuidado/WeekSummary.tsx` e `components/pro/QuoteAssist.tsx`. `request-assist` não tem tela ainda. | `docs/arquitetura/ia-no-servidor.md` §4; `services/aiAssist.ts` |
| F13 | Telemetria própria: tabela `product_events` (migração de 08/11/2026), gravada por gatilhos, com `user_id` (vira nulo na exclusão). Sem pixel e sem SDK de análise (conforme `docs/arquitetura/observabilidade.md`, seção 1). Sentry opcional, sem replay, sem dados de usuário. | `supabase/migrations/20261108100000_product_events.sql`; `docs/arquitetura/observabilidade.md`; `lib/observability.ts` |
| F14 | Modo demonstração quando `VITE_SUPABASE_URL` está vazia. O `.env.native` só define `VITE_ROUTER=hash`, ou seja, **uma build nativa sem as variáveis do backend é uma build de demonstração.** | `lib/supabase.ts`; `.env.native`; `.env.example` |
| F15 | Textos legais em `content/legal/` começam com "Documento em elaboração, ainda sem revisão jurídica." `VITE_LEGAL_STATUS` só vira `vigente` após aprovação. | `content/legal/*.md`; `.env.example` |
| F16 | Rota `/sac` existe em `config/legal.ts` (linha 64), e o documento 10 (de 08/11/2026) confirma a rota, com texto provisório e sem contato. Falta o texto aprovado e o canal real antes de publicar o endereço de suporte. | `config/legal.ts` (linha 64); `docs/juridico/10-sac-e-atendimento.md` (cabeçalho) |
| F17 | Idioma: `CFBundleDevelopmentRegion = pt-BR`. Só há textos em português. | `ios/App/App/Info.plist` |
| F18 | Projeto Xcode: bundle `br.com.workeasy`; `IPHONEOS_DEPLOYMENT_TARGET = 15.0`; `TARGETED_DEVICE_FAMILY = "1,2"`; `MARKETING_VERSION = 1.0`; `CURRENT_PROJECT_VERSION = 1`; `CODE_SIGN_STYLE = Automatic`; **sem `DEVELOPMENT_TEAM`**. | `ios/App/App.xcodeproj/project.pbxproj` |
| F19 | Não há arquivo `.xcscheme` compartilhado no repositório. O script `ios:build` usa `-scheme App`. Pode falhar no `xcodebuild` sem o esquema compartilhado. [incerto] | busca por `*.xcscheme` em `ios/` (nenhum resultado) |
| F20 | Capacitor 8.5.2 (`package.json`). Pacote Swift em `ios/App/CapApp-SPM/Package.swift`, com iOS 15. Não há `entitlements`. Universal Links pendentes. | `package.json`; `docs/arquitetura/nativo.md` §3.4 |
| F21 | Sem fastlane no repositório. | busca em `ios/` |

---

## 2. Conta Apple (pré-requisito de tudo)

A conta precisa ser de **organização** (ver também B5 e a decisão de abrir a pessoa jurídica em `docs/DECISOES.md`, seção 8).

**Por que organização, e não pessoa física:**

- A Apple exige uma **pessoa jurídica** para a organização: "Your organization must be a legal entity that can enter into contracts with Apple. We do not accept DBAs, fictitious business names, trade names, or branches." [A10]
- Para empresa, é preciso um **D-U-N-S**: "Companies and educational institutions must provide a D‑U‑N‑S Number registered to their legal entity." [A11]
- O prazo do D-U-N-S é de até 5 dias úteis para a D&B emitir o número; depois, até 2 dias úteis para a Apple receber a informação. Pedir prioridade não encurta a espera. [A11]
- O site precisa estar público e funcionando, no domínio ligado à organização: "Your organization's website must be publicly available and functional, and its domain name must be associated with your organization." [A10]. **Hoje não há site implantado.**
- A pessoa que inscreve a organização vira *Account Holder* e precisa ter autoridade legal para vincular a empresa: "you'll be the Account Holder and must have the legal authority to bind your organization to legal agreements." [A10]
- A taxa anual do programa é de US$ 99 por ano de filiação. Preços podem variar por região. [A10]
- Apps de setor regulado ou com informação sensível devem ser enviados por uma **pessoa jurídica que presta o serviço**, e não por pessoa física. [A1, 5.1.1(ix)]. O WorkEasy trata CPF, CNPJ, renda, documentos e dados de cuidado: é o caso.
- O papel exigido para criar certificados Developer ID é o de Account Holder; certificados gerenciados na nuvem podem ser criados por administradores com permissão específica. [A12]

**Sequência:**

| Passo | Quem | Pré-condição | Observação |
|---|---|---|---|
| 1. Abrir a pessoa jurídica de tecnologia | Dono | CNPJ | `docs/DECISOES.md`, seção 8, item 3. Separada da Pulso Vital. |
| 2. Pedir o D-U-N-S | Dono | Pessoa jurídica | Até 5 dias úteis, mais até 2 para a Apple receber. [A11] |
| 3. Publicar o site no domínio da empresa | Dono e time | Domínio registrado em nome da empresa | `VITE_SITE_URL` está vazio em `.env.example`; o domínio definitivo ainda não existe. [incerto: domínio] |
| 4. Inscrever a organização | Dono (Account Holder) | 1 a 3 | US$ 99/ano. [A10] |
| 5. Criar o registro do app | Dono | 4 | Bundle `br.com.workeasy`; SKU com letras, números, hífens, pontos e sublinhados, sem começar com hífen, ponto ou sublinhado. [A4] |
| 6. Criar certificados e perfis | Dono | 4 | Ver seção 11. |

**Vendedor (seller):** o nome que aparece na loja é o da conta. Para o WorkEasy, deve ser o nome empresarial. O `tauri.conf.json` traz "© 2026 Guilherme Capel Pasqua" em `copyright`. Isso precisa ser alinhado com a razão social antes do envio. [DECISÃO DO DONO]

---

## 3. Diretrizes que se aplicam ao WorkEasy hoje

### 3.1 Quadro geral

| Diretriz | O que diz (trecho) | Situação no WorkEasy | Ação |
|---|---|---|---|
| **1.2** Conteúdo gerado por usuário | "such apps must include: A method for filtering objectionable material ...; A mechanism to report offensive content and timely responses to concerns; The ability to block abusive users from the service; Published contact information so users can easily reach you" [A1] | Avaliações, pedidos, propostas e relatórios são visíveis a outras pessoas. Não há denúncia, bloqueio nem filtro. Contato publicado: SAC, ainda rascunho. | **B4.** Seção 9. |
| **1.5** Informação do desenvolvedor | "Make sure your app and its Support URL include an easy way to contact you" [A1] | Campo de URL de suporte: sem página publicada. | Publicar `/sac` com canal real (F16). |
| **2.1(a)** Completude | "placeholder text, empty websites, and other temporary content should be scrubbed before submission ... include demo account info (and turn on your back-end service!) if your app includes a login. ... Ensure the demo mode exhibits your app's full features and functionality." [A1] | Backend desligado. Sem conta de revisão. Textos "em elaboração". | **B1, B2, B6.** Seção 7. |
| **2.5.19** Funções ocultas | "Don't include any hidden, dormant, or undocumented features in your app" [A1] | Rotas de funcionalidade futura aparecem na build com backend (F09). | **B6.** Remover da build iOS. |
| **3.1.1** Compra no app | "If you want to unlock features or functionality within your app, (by way of example: subscriptions, ...) you must use in-app purchase." [A1] | Plano Pro cobrado por Asaas fora do app. | **B3.** Seção 3.2. |
| **3.1.3(d)** Serviço em tempo real entre duas pessoas | "If your app enables the purchase of real-time person-to-person services between two individuals (for example tutoring students, medical consultations, real estate tours, or fitness training), you may use purchase methods other than in-app purchase to collect those payments. One-to-few and one-to-many real-time services must use in-app purchase." [A1] | Pode servir para aulas individuais, mas não para aulas em grupo. | Ver 3.2. |
| **3.1.3(e)** Bens e serviços fora do app | "If your app enables people to purchase physical goods or services that will be consumed outside of the app, you must use purchase methods other than in-app purchase to collect those payments, such as Apple Pay or traditional credit card entry." [A1] | Pagamento de pintura, faxina e reparo na casa do cliente, por Pix ou cartão. É o caso previsto. | Ver 3.2 (resposta pronta). |
| **4.2** Funcionalidade mínima | "Your app should include features, content, and UI that elevate it beyond a repackaged website." [A1] | Marketplace com pedidos, propostas, agenda, pagamento e avaliação. Recursos nativos: câmera, seletor de fotos e localização opcional. Sem push. | **R1.** Ver 3.3. |
| **4.8** Login | Exige outra opção de login se houver login de terceiros. Não se aplica se o app "exclusively uses your company's own account setup and sign-in systems." [A1] | Só login próprio por código (F01, F02). | Nada a fazer, enquanto não houver login social. |
| **5.1.1(i)** Política de privacidade | "All apps must include a link to their privacy policy in the App Store Connect metadata field and within the app in an easily accessible manner." [A1] | Política em rascunho (F15). | **B1.** Seção 3.5. |
| **5.1.1(v)** Exclusão de conta | "If your app supports account creation, you must also offer account deletion within the app." [A1] | Existe (F11). Recusa com atendimento ativo. | **R2.** Seção 8. |
| **5.1.1(ix)** Setor regulado ou informação sensível | "should be submitted by a legal entity that provides the services, and not by an individual developer." [A1] | Trata CPF, CNPJ, renda, documentos e dados de cuidado. | **B5.** Seção 2. |
| **5.1.2(i)** Compartilhamento com IA de terceiros | "You must clearly disclose where personal data will be shared with third parties, including with third-party AI, and obtain explicit permission before doing so." [A1] | Texto de relatórios e de descrição vai ao provedor de IA (F12). Sem aceite. | **B8.** Seção 3.8. |
| **5.1.3** Dados de saúde | Regras para dados de saúde, fitness e pesquisa médica (HealthKit, Clinical Health Records) [A1] | O app não usa HealthKit. Texto livre do Cuidado pode trazer informação de saúde (F03). Bloqueio por termos de saúde: `findHealthTerm` em `services/care.ts`. | Decisão da Q2 (seção 17). |
| **1.4.1** Apps médicos | "Medical apps that could provide inaccurate data or information, or that could be used for diagnosing or treating patients may be reviewed with greater scrutiny." [A1] | Não há conteúdo clínico. Teleconsulta e prontuário são futuros. | D5: área de Saúde fora da versão iOS. |
| **2.3.8** Metadados de público infantil | Termos como "for kids" são reservados à categoria Kids [A1, 2.3.8] | O Cuidado trata de pessoas cuidadas, que podem ser crianças. | Não usar termos infantis na ficha. |

### 3.2 Pagamentos: 3.1.3(e) para serviços, 3.1.1 para o plano Pro

**Serviços contratados pelo cliente (pintura, faxina, reparo, aula individual).** São bens ou serviços consumidos fora do app. A diretriz 3.1.3(e) pede compra fora da compra no app. Isso é o que o WorkEasy faz. Para aulas individuais em tempo real, a 3.1.3(d) também serve. Aulas em grupo precisam de compra no app.

**Plano Pro (R$ 49/mês).** É assinatura de recursos do próprio app: cobrar clientes pelo app, propostas sem limite. A regra é compra no app. Por isso, na versão iOS, não pode haver venda, upsell nem link de pagamento do Pro. Isso vale também para o teste grátis de 30 dias, se for oferecido no iOS. [incerto: a sub-regra de teste em 3.1.1 que li trata de apps sem assinatura (item de preço zero "XX-day Trial"); o trial de assinatura está em 3.1.2(a), que não abri.]

**Caminho para o Pro no iOS [PLANEJADO].** Compra com StoreKit (exige plugin nativo, que hoje não está no `package.json`, e validação no servidor). Antes, D1 precisa ser decidida. Não é opção deixar o Pro no iOS "por fora" e torcer.

**Resposta pronta para a pergunta da Apple sobre 3.1.3(e)** (use a versão em inglês quando for enviar; revisar antes):

> Texto em português (base):
> "O WorkEasy conecta clientes e profissionais de serviços executados fora do aplicativo, como pintura, faxina e reparos na casa do cliente. O pagamento desses serviços é feito pelo app: por Pix (código gerado no próprio app) ou cartão (em página de pagamento de um processador de pagamentos). Essa forma de pagamento corresponde à diretriz 3.1.3(e). Nesta versão, o plano pago para profissionais não é vendido nem oferecido no iOS; não há compra de conteúdo digital nem de recursos digitais dentro do app."

Se a Apple perguntar sobre aulas individuais em tempo real, acrescentar a referência à 3.1.3(d) e a exclusão de aulas em grupo na venda.

### 3.3 Funcionalidade mínima (4.2): risco alto

A diretriz 4.2 pede que o app vá além de um site empacotado. Pelo que o repositório mostra hoje, o argumento é possível, mas é fraco se o revisor testar só a versão de demonstração:

- O app não é um site com links: tem conta, pedidos, propostas, agenda, pagamentos, documentos e histórico. A Apple diz que apps "shouldn't primarily be marketing materials, advertisements, web clippings, content aggregators, or a collection of links" [A1, 4.2.2]. O WorkEasy não é isso, mas só se o backend estiver no ar.
- Recursos do aparelho em uso: câmera para fotografar documentos (F08); seletor de fotos; localização opcional (F07). Em iOS, isso não basta para ser "app-like" por si só.
- **Não há** notificações push nem Universal Links. A ausência de push é um ponto fraco, porque o aviso de nova proposta hoje vai por WhatsApp e e-mail (F10).
- Recomendação: incluir nas notas um texto específico sobre o que o revisor deve testar (seção 7.5) e tratar push e Universal Links como itens do produto [PLANEJADO], não como promessa de nota.

### 3.4 Login (4.8)

O login é próprio, por código enviado pelo WorkEasy por meio do Supabase Auth (F01, F02). A diretriz 4.8 não exige Sign in with Apple nesse caso, porque o app "exclusively uses your company's own account setup and sign-in systems" [A1]. Se algum dia entrar Google ou Facebook, Sign in with Apple passa a ser obrigatório. [CONDICIONAL: a regra vale para o login principal do app.]

### 3.5 Política de privacidade (5.1.1(i))

A Apple pede um link para a política no campo do App Store Connect e dentro do app, e que a política diga: "Identify what data, if any, the app/service collects, how it collects that data, and all uses of that data." Também: confirmar que terceiros que recebem dados dão a mesma proteção; explicar retenção e exclusão; e dizer como revogar consentimento e pedir exclusão [A1].

**Estado:** a política em `content/legal/privacidade.md` diz "Documento em elaboração". O rascunho completo está em `docs/juridico/03-politica-de-privacidade.md`. O texto principal fala em "medição interna de eventos" (seções 6 e 11.4), mas não nomeia o `product_events` (F13); o nome só aparece na Q17. Ele diz que não encontrou ferramenta de análise de terceiros (seção 11.4). Antes de publicar, alinhar as duas coisas.

**Ação:** publicar a política aprovada em URL pública, sem login, e colocar o mesmo link na ficha e no app (`/privacidade`). Não publicar com `VITE_LEGAL_STATUS` diferente de `vigente`.

### 3.6 Exclusão de conta (5.1.1(v))

A Apple exige: "Offer to delete the entire account record, along with associated personal data. ... only offering to temporarily deactivate or disable an account is insufficient." e "apps that make it unnecessarily difficult for someone to delete their account will not pass review" [A9]. Ver seção 8.

### 3.7 Setor regulado (5.1.1(ix))

Ver seção 2. A pessoa jurídica precisa ser a conta que envia o app, e o nome do vendedor precisa ser o da empresa.

### 3.8 IA de terceiros (5.1.2(i))

A função `care-summary` envia ao provedor de IA os campos de texto dos relatórios, com nomes trocados por marcadores. A `quote-assist` envia a descrição do trabalho. Ambas dependem de `ANTHROPIC_API_KEY` no servidor (F12). O próprio documento de arquitetura pede: a política precisa nomear o provedor e o que é enviado, e a decisão sobre consentimento específico ainda está aberta [`docs/arquitetura/ia-no-servidor.md`, seção 12].

**Ação para a primeira versão iOS (D6):** não expor as telas de IA. Se forem expostas, criar tela de consentimento específica, com aceite registrado em `consents`, e nomear o provedor na política. [PLANEJADO]

### 3.9 Conta de demonstração e rotas futuras (2.1(a), 2.5.19)

Na build com backend, o app continua com as rotas de funcionalidade futura. Por exemplo, `/verification` mostra "Verificação de identidade" como funcionalidade futura; `/health`, `/doctor/:id`, `/teleconsultation/:sessionId` e `/medical-records` mostram páginas de aviso (F09; `docs/arquitetura/producao-vs-demonstracao.md` §3).

Não é necessário mostrar essas telas na build de loja. **Ação:** tirar da build iOS as rotas `/verification`, `/health`, `/doctor/:id`, `/teleconsultation/:sessionId`, `/medical-records` e as rotas de protótipo, e fazer a checagem de que nenhum menu aponta para elas. [PLANEJADO]

### 3.10 Demonstração sem backend (F14)

Se a build de loja sair sem `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`, o app vira demonstração: dados fictícios, sem login, com faixa "Protótipo de demonstração". A Apple reprova isso (2.1(a): "Ensure the demo mode exhibits your app's full features"). **Ação:** colocar as variáveis em `.env.native.local` (não versionado) antes do `build:native`, e conferir na primeira tela que o login por código aparece.

---

## 4. Ficha da loja (pt-BR)

### 4.1 Campos e limites oficiais

| Campo | Limite | Fonte |
|---|---|---|
| Nome do app | 2 a 30 caracteres | [A4] |
| Subtítulo | até 30 caracteres | [A4] |
| Texto promocional | até 170 caracteres | [A3] |
| Descrição | até 4.000 caracteres | [A3] |
| Palavras-chave | até 100 **bytes** (não caracteres; acentos ocupam 2 bytes) | [A3] |
| Novidades nesta versão | até 4.000 caracteres | [A3] |
| URL da política de privacidade | obrigatória para iOS e macOS | [A4] |
| URL de suporte | com forma fácil de contato | [A1, 1.5] |
| Categorias | primária e secundária | [A4] |
| Capturas de iPhone | 1290 × 2796 ou 1320 × 2868 (tela grande com Dynamic Island); 1284 × 2778 ou 1242 × 2688 (tela com Face ID) | [A5] |
| Capturas de iPad 13 polegadas | 2064 × 2752 ou 2048 × 2732 (retrato); paisagem invertida | [A5] |
| Quantidade de capturas | pelo menos 1 e até 10 por tamanho | [A5] |
| Formato | JPEG ou PNG, sem canal alfa | [A5] |

### 4.2 Textos prontos

Contagens feitas com o script da seção 18, em 08/11/2026.

**Nome (8 de 30 caracteres):**

```
WorkEasy
```

**Subtítulo (24 de 30):**

```
Profissionais e serviços
```

**Texto promocional (99 de 170):**

```
Peça um serviço, compare propostas de profissionais da sua região e acompanhe o atendimento no app.
```

**Palavras-chave (97 de 100 bytes):**

```
serviços,profissionais,propostas,orçamento,pintor,eletricista,diarista,reforma,reparo,prestador
```

**Novidades (28 de 4.000):**

```
Primeira versão do WorkEasy.
```

**Descrição (1.727 de 4.000 caracteres):**

```
WorkEasy reúne pessoas que precisam de um serviço e profissionais liberais e prestadores de serviço, como pintores, eletricistas e diaristas, em um só lugar.

Para quem contrata
- Descreva o serviço, escolha o bairro e as datas de preferência.
- Profissionais da sua região enviam propostas com preço e mensagem.
- Escolha a proposta, combine o horário e acompanhe o atendimento no app.
- Depois de um atendimento concluído e pago pelo app, avalie o profissional com nota de 1 a 5 e um comentário opcional.

Para quem presta o serviço
- Crie seu perfil com a ocupação, os bairros que atende e os documentos que a sua ocupação exige.
- A equipe do WorkEasy analisa o cadastro. Só aparecem na busca as ocupações aprovadas.
- Veja os pedidos da sua região, envie propostas e organize sua agenda.
- Quando a ocupação exige registro em conselho, a situação do registro (informado ou conferido pela equipe) aparece no perfil.

Pagamento
- O pagamento do serviço é feito pelo app: por Pix (código gerado no próprio app) ou cartão (na página de pagamento do Asaas, empresa que processa as cobranças).
- O WorkEasy não recebe nem guarda número de cartão.

Privacidade e conta
- Você pode pedir a exclusão da sua conta no próprio app, em Conta, na opção Excluir minha conta.
- Os Termos de Uso e a Política de Privacidade estão no app.

Limites
- O WorkEasy conecta pessoas e organiza o atendimento. Não é um serviço de saúde: não faz diagnóstico, não indica tratamento e não oferece consulta médica.
- Preços e prazos vêm dos profissionais. Confira a proposta antes de aceitar.
- Avaliações só podem ser feitas por quem contratou pelo app e teve atendimento concluído e pago.
- Os bairros disponíveis hoje são os da cidade de São Paulo.
```

**Condições para publicar os textos:**

- A linha "Os Termos de Uso e a Política de Privacidade estão no app" só vale depois da publicação aprovada (B1).
- A descrição não cita o plano Pro, o preço do Pro nem a linha Cuidado (D1 e D4).
- A linha sobre bairros só vale se o banco de bairros continuar só com São Paulo: `data/neighborhoods.json` tem 96 bairros em cinco zonas de São Paulo, mas o arquivo não traz campo de cidade [incerto]. As áreas de lançamento são Sul e Centro (`catalog/prose.mjs`, `LAUNCH_ZONES`).
- Os textos precisam ser revistos quando a área de Saúde for liberada (D5). Até lá, a descrição nega consulta médica.
- Nome: há apps com nome parecido na App Store e um site "WorkEasy Software, LLC" (`docs/pesquisa/fase0/02-marca-inpi.md`, `docs/pesquisa/fase0/03-dominio-e-identidade.md`). A marca não está resolvida [incerto].

**Proibido em qualquer campo da ficha:** frases de garantia, de selo ou de prazo. Os termos bloqueados pelo teste `test/claims-guard.test.ts` (seção 18) valem para a ficha também. Não usar "garantido", "certificado", "aprovado por", "com seguro" ou "entrega imediata".

### 4.3 Regras que os textos seguem

1. Descrevem só o que existe hoje. Nada de "em breve" nem de "ao vivo".
2. Não citam preço do Pro nem da comissão (a comissão está desligada, F04).
3. Não dizem que o profissional é certificado. Dizem o que o app faz: a equipe analisa o cadastro e o registro aparece como informado ou conferido.
4. Não citam número, estatística, cliente ou avaliação. Não há dados públicos ainda.
5. Não usam termos infantis (2.3.8) nem nomes de outras plataformas (2.3.10).

### 4.4 Categorias [DECISÃO DO DONO]

Proposta: **primária** Negócios (Business), **secundária** Estilo de vida (Lifestyle). Os nomes exatos aparecem na lista da App Store Connect e não foram conferidos em fonte aberta. [incerto] Evitar Saúde e forma física e Medicina, por causa de D5 e da revisão extra de 1.4.1.

### 4.5 Ícone

`ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`: 1024 × 1024 px, RGB, sem canal alfa (conferido no cabeçalho do PNG). O arquivo é o único ícone; o Xcode gera os demais tamanhos.

### 4.6 Capturas de tela

- O repositório **não tem capturas**. [PLANEJADO]
- Como o projeto aceita iPhone e iPad (D3), é obrigatório enviar capturas de iPad 13 polegadas, ou restringir o app a iPhone.
- Capturar só de build com backend e sem rotas de protótipo (seção 3.9). Texto de demonstração na captura conta como conteúdo de demonstração.
- Mostrar a ficha de um profissional de teste, não de pessoa real. Sem rostos de terceiros sem autorização.

### 4.7 URLs

| Campo | Valor | Estado |
|---|---|---|
| URL de suporte | Página de contato pública (SAC) | [PLANEJADO]: o domínio e a rota `/sac` ainda precisam ser confirmados (F16) |
| URL da política de privacidade | Política aprovada, pública e sem login | B1 |
| URL de marketing | opcional | — |

### 4.8 Disponibilidade e preço

- Gratuito. O Pro não é vendido no iOS nesta versão (D1).
- Países: [DECISÃO DO DONO]. Sugestão: só o Brasil, porque os termos, o Asaas e a LGPD são brasileiros.

---

## 5. Privacidade do App Store (App Privacy, "etiquetas de nutrição")

### 5.1 Regras e definições (conferidas em [A2])

- "Collect" é: "transmitting data off the device in a way that allows you and/or your third-party partners to access it for a period longer than what is necessary to service the transmitted request in real time." Dados que saem do aparelho para o backend do WorkEasy contam como coletados.
- Dados coletados muitas vezes são vinculados ao usuário, a menos que haja proteção de anonimização antes da coleta. Dados pessoais, pela LGPD, contam como vinculados (leitura nossa, não do texto da Apple) [A2].
- "Tracking" é ligar dados do app a dados de terceiros para publicidade ou medição de publicidade, ou vender dados a intermediário. **O WorkEasy não faz rastreamento.** Por isso `NSPrivacyTracking` é falso e nenhum tipo é marcado como rastreamento.
- A ficha tem as categorias: Contact Info, Health & Fitness, Financial Info, Location, Sensitive Info, Contacts, User Content, Browsing History, Search History, Identifiers, Purchases, Usage Data, Diagnostics, Surroundings, Body e Other Data. [A2]

### 5.2 Respostas recomendadas (para a build com backend)

Finalidades usadas: **App Functionality** (funcionalidade do app) e **Analytics** (medição de funil, própria, sem terceiros).

| Categoria | Tipo | Coletado? | Vinculado ao usuário | Rastreamento | Finalidade | Origem no código | Situação |
|---|---|---|---|---|---|---|---|
| Contact Info | Name | Sim | Sim | Não | App Functionality | `profiles.full_name`; `providers.display_name` | Declarado no manifesto |
| Contact Info | Email Address | Sim | Sim | Não | App Functionality | login por código (F01); avisos por e-mail | Declarado |
| Contact Info | Phone Number | Sim | Sim | Não | App Functionality | `profiles.phone`; WhatsApp de avisos | Declarado. SMS é [PLANEJADO]. |
| Contact Info | Physical Address | Sim (profissional) | Sim | Não | App Functionality | endereço e CEP no cadastro de recebimento (Asaas, `docs/juridico/03` §2.1 D) | **Falta no manifesto** |
| Contact Info | Other User Contact Info | Sim | Sim | Não | App Functionality | `provider_clients` (nome, telefone e e-mail de clientes, digitados pelo profissional); contato de emergência de `care_recipients` | Declarado |
| Financial Info | Other Financial Info | Sim (profissional) | Sim | Não | App Functionality | renda informada e CPF/CNPJ no cadastro de recebimento | **Falta no manifesto.** [incerto: categoria para CPF/CNPJ; ver seção 17] |
| Financial Info | Payment Info | **Não** | — | — | — | cartão digitado na página do Asaas; o app não recebe o número (F04) | — |
| Identifiers | User ID | Sim | Sim | Não | App Functionality | `auth.uid()` | Declarado |
| Identifiers | Device ID | Não encontrado | — | — | — | busca no código | — |
| Location | Precise Location | Sim, só com consentimento e só se o Cuidado estiver na build | Sim | Não | App Functionality | `checkins.lat`, `checkins.lng` (F07) | Declarado. Se D4 excluir o Cuidado: **Não**. |
| Location | Coarse Location | Não | — | — | — | — | — |
| User Content | Photos or Videos | Sim (profissional) | Sim | Não | App Functionality | fotos de documentos no bucket `provider-documents` (F08) | Declarado. Se houver selfie, mesma categoria. |
| User Content | Other User Content | Sim | Sim | Não | App Functionality | `requests.description`, `proposals.message`, `reviews.comment`, `daily_reports`, itens de orçamento | Declarado |
| User Content | Emails or Text Messages | Não | — | — | — | o app envia WhatsApp e e-mail, não recebe | [incerto] |
| User Content | Customer Support | Não, se o SAC for só e-mail externo | — | — | — | — | [incerto] |
| Purchases | Purchase History | Sim | Sim | Não | App Functionality | `payments`, `bookings`, `subscriptions` | Declarado |
| Usage Data | Product Interaction | Sim | Sim (`user_id`; vira nulo na exclusão) | Não | **Analytics** | `product_events` (F13) | **Falta no manifesto e na política** |
| Health & Fitness | Health | Não de propósito; texto livre pode conter | — | — | — | `findHealthTerm`; F03 | Decisão (seção 17, Q2) |
| Sensitive Info | Sensitive Info | Decisão | — | — | — | selfie como biometria e certidão de antecedentes (`docs/juridico/03`, Q2 e Q3) | Decisão jurídica |
| Diagnostics | Crash Data; Other Diagnostic Data | Só se `VITE_SENTRY_DSN` estiver no build de loja | Não (`userInfo: false`) [incerto: IP] | Não | App Functionality | `lib/observability.ts` | Decisão do dono (seção 5.4) |
| Contacts | Contacts | Não | — | — | — | nenhum acesso à agenda | — |
| Browsing History; Search History | — | Não | — | — | — | busca não é registrada | — |
| Advertising Data | — | Não | — | — | — | nenhum SDK de publicidade | — |

### 5.3 O que o app não coleta (para responder "não")

Agenda de contatos, identificador de publicidade, histórico de navegação, histórico de busca, dados de saúde por HealthKit, gravação de tela, sessão de replay (`replaysSessionSampleRate: 0`), rastreamento entre apps. [A2 e F13]

### 5.4 Itens com decisão

| Item | Por que pede decisão | Padrão sugerido |
|---|---|---|
| Health | O campo de texto livre do Cuidado pode trazer dado de saúde, apesar do bloqueio de termos (`docs/juridico/03`, Q2). | Fora da versão iOS (D4). Quando voltar, declarar se o advogado concluir que o texto pode conter saúde. |
| Sensitive Info | Selfie com documento (biometria, se ligada à pessoa) e certidão de antecedentes (`docs/juridico/03`, Q2 e Q3). | Decisão do advogado antes do envio. |
| Diagnostics | Sentry só entra no build se o dono configurar `VITE_SENTRY_DSN`. | Se o DSN entrar na build de loja: declarar Crash Data e Other Diagnostic Data, **não vinculados** (o SDK está com `userInfo: false`). Confirmar se o endereço IP entra na conta do Sentry [incerto]. |
| Product Interaction | Gravado por `product_events` e declarado como Analytics. | Declarar. Ajustar a política (F13). |

### 5.5 Manifesto de privacidade (`ios/App/App/PrivacyInfo.xcprivacy`)

O arquivo existe e está no alvo do Xcode (`project.pbxproj`, linhas 18, 32, 76 e 150). Ele declara 9 tipos, todos vinculados, sem rastreamento e com finalidade `AppFunctionality`: e-mail, telefone, nome, identificador, localização precisa, fotos, outro conteúdo do usuário, outro contato e histórico de compras.

**Faltam para bater com a ficha (seção 5.2):** `NSPrivacyCollectedDataTypePhysicalAddress`, `NSPrivacyCollectedDataTypeOtherFinancialInfo`, `NSPrivacyCollectedDataTypeProductInteraction` (finalidade Analytics) e, se o Sentry entrar, `NSPrivacyCollectedDataTypeCrashData` e `NSPrivacyCollectedDataTypeOtherDiagnosticData`. [incerto: os identificadores seguem o padrão do arquivo atual; a página de dados do manifesto não abriu, então conferir os nomes exatos antes de enviar.]

**Requisitos gerais:** o manifesto precisa estar no pacote do app; APIs de motivo obrigatório precisam de motivo aprovado, inclusive as de SDK de terceiros. Desde 01/05/2024, a Apple exige motivos aprovados para essas APIs no envio [A7]. O comentário do arquivo diz que nenhuma API de motivo obrigatório é usada pelo Capacitor nem pelo plugin `@capacitor/app`.

### 5.6 Link da política

A política precisa estar em URL pública e aparecer no app (5.1.1(i)). Hoje ela existe só como rascunho em `content/legal/privacidade.md` (B1).

---

## 6. Classificação etária

A Apple pergunta categoria por categoria e gera a classificação. A lista exata de perguntas não abriu nas fontes lidas (ver seção 16). As categorias e as faixas abaixo vêm da página de valores e definições [A6]; "Made for Kids" vem da página de definição da classificação [A6b]. Os nomes das respostas precisam ser conferidos na tela da App Store Connect.

| Categoria | Resposta sugerida | Motivo |
|---|---|---|
| Parental Controls, Age Assurance | Não | O app não tem controle parental. |
| Unrestricted Web Access | Não | Navegação restrita às telas do app. [incerto: links externos, como o de mapa do Cuidado, abrem fora do app] |
| User-Generated Content | **Sim** | Pedidos, propostas, avaliações e relatórios são visíveis a outras pessoas (F03). |
| Messaging and Chat | Não | Não há chat em tempo real entre usuários. Mensagem de proposta não é chat. [incerto: busca não conclusiva] |
| Social Media | Não | Sem feed nem perfil público de rede social. |
| Advertising | Não | Sem anúncio. |
| Mature Themes; Profanity or Crude Humor; Horror; Alcohol, Tobacco, Drug Use | Não | Nenhum conteúdo desse tipo. |
| Medical or Treatment Information; Health or Wellness Topics | Não | Sem informação médica nem de bem-estar. O Cuidado não é clínico. Se D5 for revertida, reavaliar. |
| Sexual Content or Nudity | Não | Nenhum. |
| Violence; Guns or Other Weapons | Não | Nenhum. |
| Gambling; Simulated Gambling; Contests; Loot Boxes | Não | Nenhum. |
| Made for Kids | Não se aplica | O app não é voltado a crianças (2.3.8 e 5.1.4). |

**Resultado esperado:** a faixa de 4+, porque a página de valores coloca o conteúdo gerado por usuário e o chat na faixa 4+ [A6]. [incerto: depende das respostas.] O app não pode ficar sem classificação ("Unrated" não pode ser publicado) [A6].

**Brasil:** a página diz que há pictogramas separados para classificação oficial e para apps autoclassificados. [A6] Conferir o que a App Store Connect mostra no envio. [incerto]

---

## 7. Notas para a revisão e conta de demonstração

### 7.1 O que a Apple pede

- Conta de demonstração "and turn on your back-end service!" se o app tem login (2.1(a) [A1]).
- Recurso que não é de demonstração não pode ficar oculto: "All new features, functionality, and product changes must be described with specificity in the Notes for Review section of App Store Connect (generic descriptions will be rejected) and accessible for review." [A1, 2.3.1]
- Modo de demonstração só substitui conta se houver aprovação prévia da Apple e se exibir todos os recursos (2.1(a) [A1]; a parte sobre aprovação prévia não foi conferida no texto lido [incerto]). O modo demonstração atual não tem login e usa dados fictícios. **Não serve.**

### 7.2 Estratégia da conta de demonstração

O login é só por código. Por isso o revisor precisa receber um código. Opções:

| Opção | Como funciona | Vantagem | Risco | Recomendação |
|---|---|---|---|---|
| **A. Caixa de e-mail controlada pela equipe** | Conta de revisão com um e-mail que a equipe acompanha durante a revisão. O código chega nessa caixa. | Não exige mudar a segurança do backend. | Atraso se a equipe não responder. Precisa de horário de acompanhamento. | **Recomendada**, com acompanhamento combinado nas notas. |
| B. Código fixo por telefone de teste | O `supabase/config.toml` tem `[auth.sms.test_otp]` com um telefone de teste e código fixo. O próprio arquivo diz: "Never copy this block to a hosted project." | Simples. | Não pode ir para o projeto hospedado. Não é solução para produção. | **Não usar** em produção. |
| C. Porta de entrada só para revisão | Endpoint ou flag que aceita código fixo para a conta de revisão. | Automático. | Enfraquece o login. Viola a regra de não reduzir segurança para passar teste (`PREAMBLE`, regra 4). | **Não usar.** |

**Condições para a opção A:**

- Caixa de e-mail própria, de domínio da empresa, com dono nomeado.
- Horário de acompanhamento anunciado nas notas (em horário de Brasília), cobrindo a janela de revisão.
- Teste do fluxo completo antes do envio: pedir código, receber, entrar.
- Conta de revisão **sem avaliações falsas** e com profissional de teste identificado como conta de revisão (ver 7.3). Não criar registro profissional de conselho fictício.

### 7.3 Contas de revisão

| Conta | Estado necessário | Observação |
|---|---|---|
| Cliente de revisão | Conta criada, com perfil completo, sem pedido aberto. | Permite criar pedido, ver propostas e agendar. |
| Profissional de revisão | Cadastro `approved` (aprovação da equipe), com ocupação **não regulamentada** aprovada e documentos aceitos pela equipe. | Ocupação regulamentada exige registro no conselho: evitar. O nome público precisa dizer "conta de revisão". |
| Conta para excluir | Conta criada só para testar a exclusão. | Permite testar 5.1.1(v) sem perder as outras contas. |
| Família e cuidador | **Não incluir** na versão iOS (D4). | — |

Não há como o revisor pagar sem cobrança real. Nas notas, dizer que a revisão não exige pagamento. Se exigir, o caminho é o sandbox do Asaas, pela variável `ASAAS_BASE_URL` (`https://api-sandbox.asaas.com/v3`), e **nunca** a conta de produção. [`docs/ARQUITETURA.md`, "Variáveis de ambiente"]

### 7.4 Texto para colar em "Notes for Review" (base em português)

Traduzir para inglês antes de colar, se for usar o campo em inglês. Revisar os colchetes.

```
WorkEasy conecta pessoas que precisam de um serviço a profissionais liberais e prestadores de serviço. Fluxo: o cliente descreve o pedido; profissionais da mesma região enviam propostas; o cliente aceita uma proposta; o atendimento é agendado; o pagamento é feito pelo app; depois do atendimento, o cliente pode avaliar.

LOGIN: não há senha. Digite o e-mail da conta de teste. O código de 6 dígitos chega nessa caixa de e-mail. A equipe acompanha a caixa durante a revisão, de [HORÁRIO] a [HORÁRIO] (horário de Brasília), e responde por [CONTATO] se o código atrasar.

CONTAS DE TESTE
- Cliente: [E-MAIL DO CLIENTE DE REVISÃO]
- Profissional: [E-MAIL DO PROFISSIONAL DE REVISÃO] (conta identificada como de revisão)
- Conta para testar exclusão: [E-MAIL DA CONTA PARA EXCLUIR]

ROTEIRO SUGERIDO
1. Cliente: em "Pedir um serviço", descreva um pedido e escolha um bairro de São Paulo. Em "Meus pedidos", veja as propostas.
2. Profissional: em "Pedidos", veja pedidos abertos da sua região e envie uma proposta. Em "Meu perfil", veja os documentos exigidos.
3. Documentos: em "Cadastro de profissional", o botão "Fotografar" abre a câmera do aparelho e envia a foto para análise. Nenhum documento de pessoa real deve ser usado.
4. Exclusão: com a conta para excluir, abra Conta > Excluir minha conta e digite EXCLUIR. Ver o aviso se houver atendimento ativo.

NÃO FAZ PARTE DESTA VERSÃO
- Venda de assinatura do plano para profissionais (não há compra, upsell nem link de pagamento de assinatura no iOS).
- Linha de cuidado de pessoas (a família e o cuidador não aparecem nesta versão).
- Assistente de texto com IA e resumos com IA.
- Teleconsulta, prontuário e verificação de identidade: são funções futuras e não existem nesta versão.

PAGAMENTOS: os serviços são executados fora do app (pintura, faxina, reparo). O pagamento é feito pelo app: por Pix (código no próprio app) ou cartão (em página do processador de pagamentos). Essa forma corresponde à diretriz 3.1.3(e). Não é necessário pagar para testar a revisão.

RECURSOS NATIVOS: câmera (fotos de documentos no cadastro de profissional), seletor de fotos e localização opcional (usada só no registro de plantão, que não existe nesta versão).

CONTATO: [E-MAIL DE SUPORTE] | Política de privacidade: [URL]
```

### 7.5 Recursos nativos que o revisor deve testar

| Recurso | Caminho | O que esperar |
|---|---|---|
| Câmera | Cadastro de profissional > documento > Fotografar | Abre a câmera do iPhone; a foto aparece como anexo. |
| Seletor de fotos | Mesmo lugar, opção de escolher arquivo | Abre o seletor do sistema; o app não lê outras fotos. |
| Localização | Não há na versão sem Cuidado | Se D4 for revertida, testar o registro de entrada com permissão negada: registra sem coordenadas. |

---

## 8. Exclusão de conta (5.1.1(v))

**Caminho:** Conta > "Excluir minha conta" > digitar `EXCLUIR` > confirmar. A função `account-delete`:

1. Exige a confirmação `EXCLUIR` (400 `confirmation_required` se faltar). [F11]
2. Recusa com 409 `active_bookings` se houver atendimento `accepted`, `paid`, `in_progress` ou `disputed`. A mensagem manda concluir ou cancelar esses atendimentos. [F11]
3. Cancela a assinatura Pro e as cobranças pendentes no Asaas.
4. Esvazia a pasta de documentos no Storage, anonimiza a conta (`anonymize_user`) e apaga o usuário do Auth. Mantém registros fiscais anonimizados. [`docs/ARQUITETURA.md`, "LGPD e auditoria"]

**Pontos de atenção:**

- A Apple quer que a exclusão apague "the entire account record, along with associated personal data" e aceita confirmação, mas não aceita dificuldade desnecessária [A9]. A recusa por atendimento ativo é uma dificuldade. A mensagem precisa dizer quais atendimentos bloqueiam e oferecer o atalho para cancelar. [PLANEJADO]
- A retenção de registros fiscais anonimizados precisa de parecer (`docs/juridico/03`, Q11 e a seção 7.5). Nas notas, explicar: "A conta é apagada do sistema de login e os dados pessoais são apagados; registros fiscais de pagamentos são mantidos sem identificação, por obrigação legal." [CONDICIONAL: depende de parecer]
- O caminho principal é dentro do app. Pedido só por e-mail ou telefone não basta em apps fora de setor regulado [A9]. O WorkEasy trata informação sensível (seção 2): a exceção de 5.1.1(ix) permite fluxo extra de atendimento, sem substituir o caminho no app.

**Texto para o revisor:** "Excluir a conta: Conta > Excluir minha conta > digite EXCLUIR. Se houver atendimento em andamento, a exclusão é recusada e o app lista o que precisa ser concluído ou cancelado."

---

## 9. Conteúdo de usuários (1.2): lacunas e o mínimo

| Exigência da Apple [A1] | Estado no repositório | O que falta |
|---|---|---|
| Filtro de material ofensivo | Só o bloqueio de termos de saúde no Cuidado (`findHealthTerm`). Sem filtro de palavras nas avaliações ou nos pedidos. [docs/juridico/05, 4.4 e 11.3] | Filtro de palavras ou revisão manual antes de publicar. [PLANEJADO] |
| Mecanismo para denunciar conteúdo, com resposta em tempo adequado | **Não existe.** Não há botão de denúncia. | Botão "Denunciar" em avaliação, pedido, proposta e perfil, com motivo e registro. Fila de moderação para o administrador. [PLANEJADO] |
| Bloquear usuário abusivo | **Não existe.** | Bloqueio que impede pedidos, propostas e avaliações entre as duas partes. [PLANEJADO] |
| Contato publicado | Configurado por `VITE_SAC_EMAIL` e `VITE_SAC_WHATSAPP`, vazios por padrão. Rota `/sac` em `config/legal.ts` (F16). | Preencher as variáveis, publicar `/sac` com texto aprovado e canal real (o documento 10 confirma a rota, com texto provisório). |
| Prazo de resposta | Proposta de 2 dias úteis para análise de denúncia e 5 dias corridos para contestação, ainda como [DECISÃO DO DONO] (`docs/juridico/05`, 6.7 e 8.4; o playbook 07 ainda diz 5 dias úteis). | Escolher o prazo e escrever na política. |
| Termos aceitos antes de publicar | `components/TermsGate.tsx` é usado em `CuidadoPage`, `ProPage`, `pages/cliente/Pedido.tsx`, `pages/publico/Agendar.tsx`, `pages/conta/Conta.tsx` e `pages/conta/Entrar.tsx`. [incerto: não confirmei se o aceite é gravado em `consents` antes do primeiro pedido] | Confirmar o registro em `consents` e o bloqueio antes do primeiro pedido. |

**Estado do produto para as lojas:** `docs/juridico/05`, seção 11.3, diz que não há botão de denúncia, bloqueio nem filtro, e que a decisão de enviar avaliações visíveis depende disso. **Conclusão:** para a versão iOS, ou se implementa o mínimo, ou as avaliações saem da versão de loja. [DECISÃO DO DONO]

---

## 10. Info.plist, manifesto e entitlements

### 10.1 iOS (`ios/App/App/Info.plist`)

| Chave | Estado atual | Uso no código | Situação | Ação |
|---|---|---|---|---|
| `CFBundleDevelopmentRegion` | `pt-BR` | — | Correto | Nenhuma |
| `CFBundleDisplayName` | `WorkEasy` | — | Correto | Nenhuma |
| `NSCameraUsageDescription` | "A câmera serve para fotografar um documento no seu cadastro de prestador, que é enviado para análise logo depois. **Também mostra a prévia na tela de verificação de identidade, sem enviar imagens.**" | Sim, `captureFile` no cadastro. A prévia só existe na demonstração. | **A segunda frase é falsa na build com backend** (F09). | Trocar pelo texto abaixo. |
| `NSLocationWhenInUseUsageDescription` | "A localização é usada apenas quando você registra a entrada ou a saída de um plantão ..." | Sim, `locate()` no check-in. | Verdadeiro, mas só se o Cuidado estiver na build. | Manter se D4 for revertida. Se não, remover a chave (sem uso, sem texto). |
| `NSPhotoLibraryUsageDescription` | "Você escolhe uma foto da galeria para anexar um documento ao seu cadastro. O WorkEasy não lê as outras fotos." | Seletor de arquivos aceita imagem. [incerto: se o seletor do WebKit usa a biblioteca de fotos] | Correto. | Manter. |
| `UIRequiredDeviceCapabilities` | `armv7` | — | Resquício apontado em `docs/arquitetura/nativo.md`, 3.4. [incerto: efeito na lista de aparelhos] | Não mudar sem testar em TestFlight. |
| `ITSAppUsesNonExemptEncryption` | **Ausente** | — | A página da chave não abriu. [incerto] | Decidir na App Store Connect. Se o app só usa HTTPS padrão, a chave costuma ser `false`. Confirmar. |
| `UIBackgroundModes`, `aps-environment` | Ausentes | — | Sem push (F10) | Nenhuma, até haver push [PLANEJADO]. |
| Entitlements `com.apple.developer.associated-domains` | Ausente | — | Universal Links pendentes (F20) | [PLANEJADO]: depende do domínio real e do Team ID. |

**Texto proposto para `NSCameraUsageDescription` (build com backend):**

```
O WorkEasy usa a câmera para fotografar os documentos exigidos no seu cadastro de profissional. As fotos são enviadas para análise da equipe.
```

### 10.2 macOS (`src-tauri/Info.plist`)

| Chave | Estado | Ação |
|---|---|---|
| `NSCameraUsageDescription` | "A câmera é usada apenas para mostrar a prévia na tela de verificação de identidade. **Nenhuma imagem é enviada ou armazenada.**" | **Falsa na build com backend**: a prévia de verificação não existe nela (F09). No desktop, o cadastro usa o seletor de arquivos e não há `getUserMedia` (`docs/lojas/desktop-e-assinatura.md`). Uso de câmera no Mac [incerto]: remover a chave, ou trocar só se o teste no Mac mostrar a câmera. |
| `NSLocationWhenInUseUsageDescription` | Mesmo texto do iOS | Mesma decisão de D4. |
| `NSPhotoLibraryUsageDescription` | Ausente | Não é necessária se não houver acesso à biblioteca. [incerto] |

**Texto proposto para o macOS (só se a câmera for usada no Mac):**

```
O WorkEasy usa a câmera para fotografar os documentos do seu cadastro de profissional. As fotos são enviadas para análise da equipe.
```

### 10.3 Manifesto de privacidade

Ver seção 5.5. Alinhar a lista com a ficha antes de enviar.

### 10.4 Entitlements

O repositório não tem arquivo de entitlements, nem para iOS nem para macOS. Para Universal Links, para push e para a Mac App Store, o arquivo precisa ser criado. [PLANEJADO]

---

## 11. iOS: assinatura, TestFlight e envio

### 11.1 Pré-requisitos

| Item | Requisito | Fonte |
|---|---|---|
| Mac | Xcode 26.0 ou mais novo. | Capacitor 8 [A13] |
| Node | 22 ou mais novo. | Capacitor 8 [A13] |
| SDK de envio | Build com Xcode 26 e SDK do iOS 26 ou mais novo, para envio à App Store Connect desde 28/04/2026. | [A7] |
| Alvo mínimo | iOS 15.0 no projeto (`IPHONEOS_DEPLOYMENT_TARGET`), igual ao exigido pelo Capacitor 8. A App Store Connect exige iOS 13 ou mais novo desde 09/09/2026. | [A7, A13], F18 |
| Conta | Organização aprovada (seção 2). | [A10] |
| Certificado | Certificado de distribuição e perfil de App Store. Na prática, o Xcode cria com *Automatic signing* quando o time está selecionado. [incerto: nomes exatos no Xcode] | — |
| Registro do app | App criado na App Store Connect com `br.com.workeasy` e SKU válido. | [A4] |

### 11.2 Passo a passo

A partir de `apps/web/`. Comandos marcados **[conferido]** estão na documentação ou no `package.json`. Os demais **[incerto]** precisam ser conferidos no próprio Xcode antes de automatizar.

**Passo 1. Dependências e build web nativo [conferido: `package.json`].**

```bash
npm ci
npm run build:native          # tsc --noEmit && vite build --mode native (modo sem service worker, hash URLs)
```

Antes, criar `.env.native.local` (não versionado) com as variáveis do backend: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL`, `VITE_COMPANY_NAME`, `VITE_COMPANY_CNPJ`, `VITE_COMPANY_ADDRESS`, `VITE_SAC_EMAIL`, `VITE_SAC_WHATSAPP`, e `VITE_LEGAL_STATUS=vigente` **só** depois do parecer. `VITE_SENTRY_DSN` só se o dono decidir (seção 5.4). Nunca colocar chave secreta em `VITE_*` (F14, `lib/supabaseKey.ts`).

**Passo 2. Copiar o build para o projeto iOS [conferido: script `cap:sync` existe; `cap sync ios` é o comando da CLI do Capacitor, [incerto] para a versão 8].**

```bash
npx cap sync ios
```

**Passo 3. Abrir no Xcode [incerto: comando exato].**

```bash
open ios/App/App.xcodeproj
```

No Xcode, em **Target App > Signing & Capabilities**:
- Marcar **Automatically manage signing** e escolher o **Team** da organização. O projeto não tem `DEVELOPMENT_TEAM` (F18), então o time precisa ser escolhido em cada máquina; não gravar o Team ID no repositório.
- Conferir o Bundle Identifier: `br.com.workeasy`.
- Conferir a identidade: o projeto define `CODE_SIGN_IDENTITY = "iPhone Developer"` em duas configurações (`project.pbxproj`, perto das linhas 222 e 279). Com *Automatic signing*, o Xcode usa a identidade de distribuição no arquivamento; confirmar na configuração **Release**.
- Versão: `MARKETING_VERSION = 1.0` e `CURRENT_PROJECT_VERSION = 1`. **Aumentar o número do build a cada envio** (1, 2, 3...).

**Passo 4. Esquema compartilhado [incerto: F19].** O repositório não tem `.xcscheme`. Antes do comando de arquivo, abrir *Product > Scheme > Manage Schemes* e marcar **Shared** no esquema `App`, ou conferir com `xcodebuild -list -project ios/App/App.xcodeproj`. Se o esquema não aparecer, o arquivamento por linha de comando falha.

**Passo 5. Arquivar [incerto: comando; a página de referência não abriu].**

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath ios/build/WorkEasy.xcarchive \
  -allowProvisioningUpdates archive
```

`ios/build/` está no `ios/.gitignore` (linha `build/`), então o arquivo não entra no git.

**Passo 6. Enviar à App Store Connect [incerto: chaves do plist].** Criar `ios/build/ExportOptions.plist` (fora do git) com:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>SEU_TEAM_ID</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>uploadSymbols</key>
  <true/>
  <key>destination</key>
  <string>upload</string>
</dict>
</plist>
```

Depois:

```bash
xcodebuild -exportArchive -archivePath ios/build/WorkEasy.xcarchive \
  -exportOptionsPlist ios/build/ExportOptions.plist \
  -exportPath ios/build/export -allowProvisioningUpdates
```

**Alternativa sem linha de comando:** no Xcode, *Product > Archive* e depois *Distribute App > App Store Connect > Upload*.

**Passo 7. Conferir os plists antes do envio [ferramenta padrão do macOS; comando não conferido em documentação lida].**

```bash
plutil -lint ios/App/App/Info.plist
plutil -lint ios/App/App/PrivacyInfo.xcprivacy
```

### 11.3 Bloqueios técnicos do build hoje

| Item | Estado | Ação |
|---|---|---|
| Esquema compartilhado (F19) | Ausente no repositório | Marcar como compartilhado (passo 4). |
| `DEVELOPMENT_TEAM` (F18) | Ausente | Escolher o time no Xcode (passo 3). |
| `CODE_SIGN_IDENTITY = "iPhone Developer"` (duas configurações) | Pode conflitar com distribuição | Conferir na configuração Release. |
| Build number `1` | Repetido em cada envio é recusado | Aumentar a cada envio. |
| Xcode 26 | Necessário [A13, A7] | Conferir com `xcodebuild -version`. |
| `npm run ios:build` | Compila só para o simulador, sem assinatura (`CODE_SIGNING_ALLOWED=NO`) | Serve como teste de compilação, não gera o arquivo para a loja. |

### 11.4 fastlane (opcional)

Não há fastlane no repositório (F21). Se for usado, o `Fastfile` deve ficar fora do repositório ou em `ios/fastlane/` com revisão [PLANEJADO]. Não é necessário para o primeiro envio.

### 11.5 TestFlight

- Após o processamento, o build aparece em TestFlight na App Store Connect. Adicionar testadores internos (membros da conta). [incerto: nomes exatos das telas]
- Testadores externos exigem revisão de beta da Apple. [incerto: não confirmado em fonte aberta.] Não é o mesmo que a revisão da loja.
- Testar em aparelho: login por código (e-mail), câmera no cadastro, exclusão de conta com a conta para excluir, e a tela de pedido com build de loja (sem rotas de protótipo).

### 11.6 Enviar para a revisão

Só depois da seção 15. Na App Store Connect: escolher o build, preencher ficha (seção 4), privacidade (seção 5), classificação etária (seção 6), notas de revisão (seção 7), conferência de exportação de criptografia (seção 10.1, `ITSAppUsesNonExemptEncryption`) e enviar. [incerto: a ordem exata das telas.]

---

## 12. macOS fora da loja: Developer ID e notarização (Tauri)

Decisão padrão: **D2**. Distribuir só como DMG, fora da Mac App Store.

### 12.1 Requisitos

| Item | Fonte |
|---|---|
| Certificado **Developer ID Application** para assinar o app. Pode haver até cinco. | [A12] |
| Certificado **Developer ID Installer** só se for usar `.pkg`. Não é o caso do DMG. | [A12] |
| Criação do certificado pelo **Account Holder**. | [A12] |
| Notarização: a página diz que o desenvolvedor "can ... submit their software for notarization" e que o ticket de notarização deixa o Gatekeeper verificar o software. A página não diz que é obrigatória. A página do Tauri diz que "Notarization is required when using a Developer ID Application certificate" [A14]; tratar como obrigatória para o DMG, como em `docs/lojas/desktop-e-assinatura.md` (seção 4.3). [incerto: se o app abre sem notarização] | [A12, A14] |
| Conta de notarização: chave da API do App Store Connect **ou** Apple ID com senha específica do app e Team ID. | [A14] |

### 12.2 Passo a passo

**Passo 1. Criar o certificado.** No portal da conta da organização, criar o *Developer ID Application*. Instalar no chaveiro de login do Mac.

**Passo 2. Achar a identidade.**

```bash
security find-identity -v -p codesigning
```

Copiar o nome completo da identidade `Developer ID Application: ...` para `APPLE_SIGNING_IDENTITY`. [A14]

**Passo 3. Variáveis de ambiente (no terminal, nunca no repositório) [A14].**

Para assinar:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: NOME DA EMPRESA (TEAM_ID)"
```

Para notarizar, uma das opções:

```bash
# Opção A: chave da API do App Store Connect
export APPLE_API_ISSUER="<issuer id>"
export APPLE_API_KEY="<key id>"
export APPLE_API_KEY_PATH="/caminho/AuthKey_XXXX.p8"

# Opção B: Apple ID com senha específica do app
export APPLE_ID="<e-mail do Apple ID>"
export APPLE_PASSWORD="<senha específica do app>"
export APPLE_TEAM_ID="<TEAM_ID>"
```

Para CI, a página também cita `APPLE_CERTIFICATE` (o `.p12` em base64) e `APPLE_CERTIFICATE_PASSWORD`. [A14]

**Passo 4. Build (no Mac) [conferido: `package.json` e o comando da página de DMG].**

```bash
npm run desktop:build                       # tauri build: gera os formatos configurados
npm run tauri build -- --bundles dmg        # só o DMG [A15]
```

Antes, o script `beforeBuildCommand` do `tauri.conf.json` roda `npm run build:native` (conferido no arquivo).

**Passo 5. Onde fica o DMG [incerto].** A página de DMG não diz o caminho de saída. A documentação antiga deste kit dizia `bundle/macos/`, e o padrão do Tauri costuma ser `src-tauri/target/release/bundle/dmg/`. Conferir na primeira build.

**Passo 6. Notarização e conferência [incerto: comandos de verificação não conferidos na documentação aberta].** A página do Tauri diz que é preciso rodar o build de novo depois de definir as variáveis, e cita a opção `--skip-stapling`. Conferir com:

```bash
spctl --assess --type execute -vv "caminho/WorkEasy.app"
xcrun stapler validate "caminho/WorkEasy.dmg"
```

**Passo 7. Testar em um Mac limpo.** Abrir o DMG, arrastar para Aplicativos, abrir pelo Launchpad. Sem alerta de origem desconhecida.

### 12.3 Pontos em aberto

- Hardened runtime e entitlements: o repositório não tem entitlements (seção 10.4). [incerto]
- Universal binary (Apple Silicon e Intel): não conferido na documentação lida. [incerto]
- Identidade do app de desktop: o `copyright` do `tauri.conf.json` cita uma pessoa física. Alinhar com a razão social (seção 2).
- Textos de permissão do desktop: seção 10.2.

---

## 13. Mac App Store (opcional, D2)

Não recomendado na primeira versão. Não abri a página do Tauri sobre Mac App Store, então não confirmei: exigência de *sandbox*, entitlements específicos, certificados de distribuição da Mac App Store e revisão. [incerto] Sem isso, o caminho é só o DMG (seção 12).

---

## 14. Bloqueios do iOS hoje, por ordem de dependência

1. **Conta de organização** (B5). Sem ela, não há envio. Depende da pessoa jurídica, do D-U-N-S e do site no domínio.
2. **Backend no ar e conta de revisão** (B2). Depende de infraestrutura e da forma de acesso do revisor (seção 7.2). Não depende da Apple, mas o revisor depende dele.
3. **Política, termos e SAC aprovados** (B1). Depende do advogado.
4. **Build sem rotas de protótipo e sem venda do Pro** (B3, B6). Depende de código, não de Apple.
5. **Denúncia e bloqueio mínimos** (B4). Depende de código.
6. **Ficha de privacidade e manifesto alinhados** (B7). Depende de (3) e das decisões da seção 5.4.
7. **IA fora da versão ou com consentimento** (B8, D6).
8. **Build com Xcode 26, TestFlight e teste em aparelho** (R3, seção 11).

---

## 15. Checklist pré-envio (em ordem)

**Conta e build**

- [ ] Pessoa jurídica aberta; D-U-N-S recebido; site público no domínio da empresa. (seção 2)
- [ ] Organização inscrita no programa; Account Holder confirmado. (seção 2)
- [ ] Registro do app criado com `br.com.workeasy` e SKU válido. (seção 11.1)
- [ ] Mac com Xcode 26.0 ou mais novo; Node 22 ou mais novo. (seção 11.1)
- [ ] Build com `.env.native.local` de produção; sem `VITE_*` secreta; app abre com login por código. (seções 3.10, 11.2)
- [ ] Esquema `App` marcado como compartilhado; Team escolhido; build number aumentado. (seção 11.3)
- [ ] Arquivo gerado, enviado e processado; TestFlight com build testado em aparelho. (seção 11.5)

**Conteúdo e rotas**

- [ ] Rotas de protótipo e de funcionalidade futura fora da build iOS. (seção 3.9)
- [ ] Venda, upsell e link de pagamento do Pro fora da build iOS (D1). (seção 3.2)
- [ ] Cuidado, IA e área de Saúde fora da versão (D4, D5, D6). (seções 3.8 e 14)
- [ ] Termos, Privacidade e SAC aprovados e publicados (`VITE_LEGAL_STATUS=vigente`). (B1)
- [ ] Rota `/sac` com texto aprovado e canal real (o documento 10 confirma a rota, com texto provisório). (F16)

**UGC e conta**

- [ ] Denúncia e bloqueio mínimos implementados, ou avaliações fora da versão. (seção 9)
- [ ] Aceite dos Termos antes do primeiro pedido, com registro. (seção 9)
- [ ] Exclusão de conta testada com a conta para excluir, incluindo o caminho com atendimento ativo. (seção 8)

**Privacidade e permissões**

- [ ] Ficha de privacidade (seção 5.2) igual ao manifesto (seção 5.5). Decisões de Health, Sensitive Info e Diagnostics fechadas.
- [ ] `NSCameraUsageDescription` trocado pelo texto da seção 10.1. Chave de localização mantida ou removida conforme D4.
- [ ] `ITSAppUsesNonExemptEncryption` decidido. (seção 10.1)
- [ ] Texto de permissão do desktop corrigido. (seção 10.2)

**Ficha e revisão**

- [ ] Textos da seção 4.2 revisados, com contagem refeita pelo script (seção 18).
- [ ] Capturas de iPhone e de iPad 13 polegadas, sem dados de pessoa real e sem texto de protótipo. (seção 4.6)
- [ ] Ícone 1024 × 1024 sem alfa. (conferido)
- [ ] Categorias escolhidas. (seção 4.4)
- [ ] Classificação etária respondida; resultado conferido. (seção 6)
- [ ] Notas de revisão com contas que funcionam, horário de acompanhamento e roteiro testado. (seção 7)
- [ ] Contas de revisão sem avaliação falsa e sem registro profissional fictício. (seção 7.2)
- [ ] URL de suporte e URL de privacidade públicas, sem login e sem "em elaboração". (seção 4.7)

**Depois do envio**

- [ ] Nada de prometer prazo de aprovação ou data de lançamento ao público.

---

## 16. Fontes consultadas e limites desta pesquisa

### 16.1 Fontes abertas em 08/11/2026

| ID | Página | Data indicada | O que foi usado |
|---|---|---|---|
| A1 | https://developer.apple.com/app-store/review/guidelines/ | Sem data na página (© 2026) | Textos de 1.2, 1.5, 2.1(a), 2.3.1, 2.5.19, 3.1.1, 3.1.3(d) e (e), 4.2, 4.8, 5.1.1(i), (v) e (ix), 5.1.2(i), 5.1.3 e 1.4.1 (trechos citados). 5.1.1(i), 5.1.2(i), 5.1.3, 5.1.4 e 2.3.8 conferidos na reabertura de 08/11/2026. |
| A2 | https://developer.apple.com/app-store/app-privacy-details/ | Sem data (© 2026) | Categorias, definições de "collect" e "tracking", regra de dados vinculados. |
| A3 | https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information | Sem data (© 2026) | Limites de texto promocional (170), descrição (4.000), palavras-chave (100 bytes), novidades (4.000). |
| A4 | https://developer.apple.com/help/app-store-connect/reference/app-information/app-information | Sem data (© 2026) | Nome (2 a 30), subtítulo (30), URL de política obrigatória, categorias, SKU. |
| A5 | https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications | Sem data (© 2026) | Tamanhos de capturas de iPhone, iPad 13 e Mac; formatos; quantidade. |
| A6 | https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions | Sem data (© 2026) | Categorias do questionário e faixas de classificação. A página de perguntas (A6b, abaixo) não trouxe a lista de perguntas. |
| A6b | https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating | Sem data (© 2026) | Estrutura: "Made for Kids", "Override" e "Age Suitability URL". Lista de perguntas não aparece no texto lido. |
| A7 | https://developer.apple.com/news/upcoming-requirements/ | "Since ..." por item; sem data de publicação | SDK obrigatório (Xcode 26 / iOS 26 desde 28/04/2026); requisito de iOS 13 desde 09/09/2026; motivos aprovados de APIs desde 01/05/2024; respostas ao questionário etário até 31/01/2026. |
| A9 | https://developer.apple.com/support/offering-account-deletion-in-your-app/ | Sem data (© 2026) | Requisitos de exclusão de conta: caminho no app, deleção completa, sem dificuldade desnecessária, confirmação aceita. |
| A10 | https://developer.apple.com/programs/enroll/ | Sem data (© 2026) | Taxa anual (US$ 99), requisitos de organização (pessoa jurídica, D-U-N-S, site público, Account Holder). |
| A11 | https://developer.apple.com/help/account/membership/D-U-N-S/ | Sem data (© 2026) | D-U-N-S obrigatório para empresa; pessoa jurídica; até 5 dias úteis (D&B) e até 2 dias úteis para a Apple receber. |
| A12 | https://developer.apple.com/support/developer-id/ | Sem data (© 2026) | Developer ID para distribuição fora da loja; notarização; tipos de certificado; Account Holder. |
| A13 | https://capacitorjs.com/docs/updating/8-0 | "Version: v8" (sem data) | Xcode 26.0+; iOS 15.0; Node 22+; SPM por padrão. |
| A14 | https://v2.tauri.app/distribute/sign/macos/ | "Last updated: May 17, 2026" | Variáveis `APPLE_*` de assinatura e notarização; "Notarization is required when using a Developer ID Application certificate"; rebuild após definir as variáveis. |
| A15 | https://v2.tauri.app/distribute/dmg/ | "Last updated: Jul 21, 2025" | Comando `tauri build --bundles dmg`. |
| A16 | https://capacitorjs.com/docs/ios/deploying-to-app-store | "Version: v8" (sem data) | Só aponta para a documentação da Apple. Nenhum comando. |

Todas foram abertas com a ferramenta de leitura de páginas em 08/11/2026. Trechos citados em inglês são do texto que a ferramenta devolveu, não de cópia manual. Para a versão final, conferir cada trecho na página original antes de enviar.

### 16.2 Páginas abertas sem o texto (não conferidas)

- Manifesto de privacidade (`privacy-manifest-files`, `describing-data-use-in-privacy-manifests`): só o título. Os identificadores de dados e o formato exato ficam [incerto].
- `ITSAppUsesNonExemptEncryption`: só o título. Regra de exportação [incerto].
- Notarização (`notarizing-macos-software-before-distribution`, `customizing-the-notarization-workflow`): só o título. Os comandos `notarytool` e `stapler` são de conhecimento geral, não da fonte. [incerto]
- Distribuição de apps para testes e lançamento (`distributing-your-app-for-beta-testing-and-releases`): só o título. Os comandos `xcodebuild archive` e `-exportArchive`, e as chaves do `ExportOptions.plist`, são de conhecimento geral. [incerto]
- Página de D-U-N-S (`enroll/duns-lookup`): redireciona para login. Usei a página de ajuda de D-U-N-S (A11).
- Documentação de exportação de criptografia (`help/app-store-connect/reference/export-compliance-information`): página não encontrada. [incerto]
- Perguntas do questionário de classificação etária: não aparecem nas páginas lidas (A6, A6b). As respostas da seção 6 são sugestões a conferir na tela.
- Mac App Store no Tauri: não aberta (seção 13).

### 16.3 Itens [incerto] reunidos

1. Nomes exatos das categorias da App Store (seção 4.4).
2. Sentido de "Other Financial Info" para CPF e CNPJ (seção 5.2).
3. IP em Diagnostics do Sentry (seção 5.4).
4. Se links externos abrem fora do app (seção 6).
5. Efeito de `UIRequiredDeviceCapabilities` `armv7` (seção 10.1).
6. Chave `ITSAppUsesNonExemptEncryption` (seção 10.1).
7. Comandos `xcodebuild` e `ExportOptions.plist` (seção 11.2).
8. Esquema compartilhado do Xcode (seção 11.2, passo 4).
9. Testadores externos e revisão de beta (seção 11.5).
10. Caminho do DMG e comandos de verificação de notarização (seção 12.2).
11. Hardened runtime e universal binary no Tauri (seção 12.3).
12. Domínio da empresa (seção 2).

### 16.4 O que não verifiquei

- Não há Xcode nem macOS neste ambiente. Nenhum build, arquivamento, assinatura, notarização ou TestFlight foi feito.
- Não testei o login por código contra o Supabase real.
- Não testei nenhum caminho de pagamento contra o Asaas real.
- Não abri a tela do app em aparelho nem em simulador.
- Não conferi a lista de perguntas do questionário etário.
- Não li o texto integral da diretriz 3.1.1 (li os subitens de trial e de login na reabertura de 08/11/2026). A A16 (Capacitor, deploy) não foi reaberta.
- Não conferi se o Capacitor 8 traz plugin de compra (StoreKit) disponível.

---

## 17. Pontos para o advogado (copiar para a lista de perguntas)

| # | Pergunta | Onde pesa |
|---|---|---|
| Q-AP1 | A exclusão de conta que mantém registros fiscais anonimizados atende ao pedido de exclusão da Apple (5.1.1(v)) e à LGPD? Qual o texto para o revisor? | Seção 8 |
| Q-AP2 | O texto livre do Cuidado (relatórios, preferências, contato de emergência) pode conter dado de saúde? Declarar Health na ficha? | Seção 5.4 |
| Q-AP3 | A selfie no cadastro de profissional é dado biométrico? Declarar Sensitive Info? O mesmo para a certidão de antecedentes. | Seção 5.4 |
| Q-AP4 | CPF, CNPJ e renda informada: em qual categoria da ficha da Apple entram? | Seção 5.2 |
| Q-AP5 | O uso de IA de terceiros com texto de pessoas exige consentimento específico e aceite registrado? Nomear o provedor na política. | Seção 3.8 |
| Q-AP6 | Pagamento de serviço por Pix ou cartão, na página do processador (Asaas), com divisão automática para o profissional: a descrição do fluxo sustenta a regra 3.1.3(e)? | Seção 3.2 |
| Q-AP7 | A venda da assinatura do Pro no iOS por compra no app, com teste de 30 dias: aviso e cancelamento exigidos pelo CDC? | Seção 3.2 |
| Q-AP8 | O texto de "Notes for Review" (seção 7.4) dá informação completa sobre dados enviados para revisão? | Seção 7 |

---

## 18. Conferência de limites (script)

Os números da seção 4.2 foram conferidos com este script em 08/11/2026. Ele lê os padrões proibidos de `test/claims-guard.test.ts` (sem copiá-los para este texto) e mede os limites.

```python
import re, unicodedata
from pathlib import Path

TEXTS = {
    "nome": ("WorkEasy", 2, 30, "chars"),
    "subtitulo": ("Profissionais e serviços", 1, 30, "chars"),
    "texto_promocional": ("Peça um serviço, compare propostas de profissionais da sua região e acompanhe o atendimento no app.", 1, 170, "chars"),
    "palavras_chave": ("serviços,profissionais,propostas,orçamento,pintor,eletricista,diarista,reforma,reparo,prestador", 1, 100, "bytes"),
    "novidades": ("Primeira versão do WorkEasy.", 1, 4000, "chars"),
    # "descricao": colar o texto da seção 4.2
}

src = Path("test/claims-guard.test.ts").read_text(encoding="utf-8")
pats = re.findall(r"\[\s*'[^']*',\s*(/.+?/)\s*\]", src)

def norm(t):
    return unicodedata.normalize("NFD", t).encode("ascii", "ignore").decode().lower()

for name, (text, lo, hi, unit) in TEXTS.items():
    n = len(text) if unit == "chars" else len(text.encode("utf-8"))
    hits = [p for p in pats if re.search(p.strip("/"), norm(text))]
    print(name, n, unit, "OK" if lo <= n <= hi else "FORA", "proibidos:", hits or "nenhum")
```

Resultado em 08/11/2026: nome 8/30; subtítulo 24/30; texto promocional 99/170; palavras-chave 97/100 bytes; novidades 28/4.000; descrição 1.727/4.000. Nenhum padrão proibido em nenhum texto.

Observação: a palavra-chave "orçamento" tem acento e ocupa 2 bytes. A conta é feita em bytes UTF-8, como a Apple descreve o limite.

---

## 19. Pontos abertos no repositório (não corrigidos aqui)

Esta seção lista o que encontrei e não mexi, porque este kit é só de documentação. Cada item precisa de dono.

1. `src-tauri/Info.plist`: texto de câmera falso para o desktop (seção 10.2).
2. `ios/App/App/Info.plist`: frase sobre prévia de verificação falsa na build com backend (seção 10.1).
3. `ios/App/App/PrivacyInfo.xcprivacy`: faltam endereço, dados financeiros, dados de produto e, se o Sentry entrar, diagnósticos (seção 5.5).
4. `docs/juridico/03-politica-de-privacidade.md`: o texto principal não nomeia `product_events` (só a Q17 nomeia) e diz que não encontrou ferramenta de análise de terceiros (seção 5.2 e F13).
5. `supabase/migrations/20261108100000_product_events.sql`: novo, não aparece em `docs/ARQUITETURA.md` (que lista as tabelas por domínio).
6. `.env.native`: sem variáveis do backend. A build nativa padrão é de demonstração (F14).
7. `ios/App/App.xcodeproj`: sem esquema compartilhado (F19) e sem `DEVELOPMENT_TEAM` (F18).
8. `ios/App/App/Info.plist`: `UIRequiredDeviceCapabilities` com `armv7` (seção 10.1).
9. `config/legal.ts` tem `/sac`, e `docs/juridico/10-sac-e-atendimento.md` diz que a rota existe, com texto provisório (F16).
10. `docs/ARQUITETURA.md` diz que o login é por e-mail ou WhatsApp/SMS. O código usa e-mail e SMS, e o doc 03 diz que o SMS depende de provedor (F01).
11. Rotas de funcionalidade futura (`/verification`, `/health`, `/doctor/:id`, `/teleconsultation/:sessionId`, `/medical-records`) continuam na build com backend (seção 3.9).
12. `components/TermsGate.tsx` é usado também em Pedido (cliente), Agendar, Conta e Entrar. Falta conferir se o aceite é gravado em `consents` antes do primeiro pedido (seção 9).
13. `pages/conta/Entrar.tsx` aponta "Termos de Uso" e "Política de Privacidade" para `/legal`, não para `/termos` e `/privacidade` (`docs/arquitetura/producao-vs-demonstracao.md`, seção 8).
14. `tauri.conf.json`: `copyright` cita pessoa física (seção 2).
15. `docs/lojas/app-store.md` anterior (de 23/10/2026) foi substituído por este documento. Afirmações antigas, como "nenhum SDK de análise ou de falhas", não valem mais: existe `product_events` e o Sentry pode ser ligado.

**Próximo passo sugerido:** decidir D1 a D6, depois abrir a conta da organização (seção 2). O resto depende das duas coisas.
