# Nativo: adaptadores de plataforma e endurecimento dos shells

Nota técnica sobre a camada `platform/` e sobre os shells Android, iOS (Capacitor) e
desktop (Tauri). Descreve o que cada mudança faz e o que só pode ser confirmado em
aparelho ou pelo workflow de release da CI. Não é um contrato de API: o contrato do
backend continua em `docs/ARQUITETURA.md`.

Estado em 24/11/2026: o Android foi compilado de verdade (`assembleDebug`, `assembleRelease`
e `bundleRelease`, ver `docs/lojas/google-play.md`, seção 14.4 e o fim do documento); nada
foi executado em aparelho ou emulador, e o iOS não compila neste ambiente (sem macOS). Tudo
o que está marcado como **a verificar** depende de aparelho, do Xcode ou da CI.

## 1. Adaptadores em `platform/`

Cada adaptador é uma função pequena, não lança exceção e tem teste unitário em
`test/platform/` (jsdom, sem rede). A lista de uso reflete o código atual.

| Arquivo | O que faz | Onde é usado hoje | Limite conhecido |
|---|---|---|---|
| `files.ts` | `pickFile` e `captureFile`: abrem um `<input type="file">` oculto (com `accept` e, se pedido, `capture`) e resolvem com o `File` ou com `null` (cancelou ou o navegador recusou). | `pages/pro/Cadastro.tsx`, botão **Fotografar** ao lado de cada documento. O input de arquivo original continua no lugar. | Alguns navegadores não disparam `cancel`; nesse caso a promessa fica pendente e o input oculto permanece no DOM até a próxima escolha. |
| `share.ts` | `sharePayload`: usa a folha de compartilhamento (Web Share) quando existe e `canShare` aceita os dados; senão copia o texto (com o link) para a área de transferência. Resultado: `shared`, `copied`, `cancelled` ou `unavailable`. | Ainda sem tela que o use. | A cópia depende de gesto do usuário em alguns navegadores. |
| `external.ts` | `parseExternalUrl`, `externalLinkProps`, `openExternalLink`: aceitam só `https:`, `http:`, `tel:` e `mailto:`, absolutos, sem credenciais em links web. Links web saem com `rel="noopener noreferrer"`. | `pages/cliente/Pedido.tsx`, link **Abrir o WhatsApp** (`wa.me`). | Não há plugin `@capacitor/browser` (não foi adicionado, por regra de não criar dependência). No Android/iOS e no Tauri, `window.open` pode não abrir o navegador externo. **A verificar.** |
| `storage.ts` | `localStore` e `sessionStore`: `get`, `set`, `remove`, `getJson`, `setJson`. Qualquer falha (cota, janela privada, acesso bloqueado) vira `null` ou `false`. | Ainda sem uso. `lib/requestDraft.ts` continua com `sessionStorage` direto e é o candidato natural. | Só para preferências do aparelho (rascunho, aba lembrada). Estado que precisa sobreviver ou ser compartilhado vai para o servidor. |
| `notifications.ts` | `detectNotificationSupport`: detecta as APIs `Notification`, `PushManager` e `serviceWorker`. A constante `PUSH_NOTIFICATIONS_IMPLEMENTED` é `false`. | Ainda sem uso. | **Web push não está implementado.** Não há assinatura, handler de push no service worker nem envio. As notificações atuais saem por WhatsApp e e-mail (`docs/ARQUITETURA.md`, "Notificações"). |
| `geolocation.ts` | Sem alteração. | Check-in de cuidado. | Ver item 2.2 (permissão de localização). |
| `native.ts` | Sem mudança de comportamento: no Android, o botão voltar faz `history.back()` quando o WebView pode voltar, e fecha o app na primeira tela. Agora coberto por `test/platform/native.test.ts`. | `index.tsx`. | **A verificar** (ver item 2.4, passo 2). |

Decisões dos adaptadores:

- Nenhuma dependência nova. `files` usa só o DOM; `share` usa a Web Share API quando existe.
- O `<input>` original de `Cadastro.tsx` foi mantido porque os testes de cadastro localizam o
  campo pelo rótulo. O botão **Fotografar** é uma adição, não uma troca de fluxo.
- Só a captura de foto usa `capture`. Documentos em PDF continuam pelo seletor de arquivos.

## 2. Android (`android/app/src/main`)

### 2.1 Manifesto

- `allowBackup="false"`: o app não entra em backup automático.
- `dataExtractionRules="@xml/data_extraction_rules"`: regras de Android 12+ que excluem
  todos os domínios de backup em nuvem e de transferência entre aparelhos: `root`, `file`,
  `database`, `sharedpref`, `external` e os `device_*` (armazenamento protegido por
  dispositivo). Hoje não copiam nada; as regras ficam válidas caso o backup seja ligado no
  futuro. Teste de contrato: `test/platform/android-backup.test.ts`.
- `usesCleartextTraffic="false"` e `networkSecurityConfig="@xml/network_security_config"`:
  tráfego `http://` é recusado; só a loja de certificados do sistema é confiável. O
  Capacitor serve o app em `https://localhost` (ver `capacitor.config.ts`), então nenhuma
  exceção é necessária.
- O filtro de **App Links** verifica links HTTPS de `workeasy.ia.br` com
  `autoVerify="true"`. O Android aceita qualquer caminho desse host. No iOS os caminhos
  autorizados constam no `apple-app-site-association`. A associação de cada plataforma
  depende da identidade de assinatura da seção 8 e de um teste em aparelho.
- `src/release/AndroidManifest.xml` (só no build `release`) remove `CAMERA`, `uses-feature
  camera`, as duas permissões de localização e `uses-feature gps`. O manifesto mesclado do
  `.aab` de release declara só `INTERNET` e a permissão interna do próprio pacote
  (`br.com.workeasy.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, que o AndroidX acrescenta).

### 2.2 Permissões (todas com uso no código)

| Permissão | Por quê | Observação |
|---|---|---|
| `INTERNET` | Supabase, Auth, Storage. | Obrigatória. |
| `CAMERA` | `pages/Verification.tsx` pede `getUserMedia` para a prévia da tela de verificação, que só existe no modo demonstração (com backend, `/verification` é "funcionalidade futura"). | O `<input capture>` do cadastro abre o app de câmera do aparelho por intent; não depende desta permissão. **Só no build `debug`**: o `release` remove (`src/release`). **A verificar** em aparelho que a foto do cadastro funciona sem ela. |
| `ACCESS_FINE_LOCATION` e `ACCESS_COARSE_LOCATION` | Check-in de plantão usa `enableHighAccuracy: true`. | No Android 12+, pedir a fina exige também a grosseira. O check-in funciona sem localização (`locationNote`). **Só no build `debug`**: a linha Cuidado não entra em build de loja, então o `release` remove as duas. |

### 2.3 Não alterado de propósito

- `res/xml/file_paths.xml` ainda expõe `external-path path="."` e `cache-path path="."`
  no `FileProvider`. Pode ser mais restrito, mas o Capacitor usa esse provedor para a
  captura de arquivos do WebView. Restringir sem testar pode quebrar a foto do cadastro.
  **A verificar** antes de qualquer ajuste.
- `minifyEnabled false` no release continua como estava. O `versionCode` e o `versionName` vêm de
  `-PappVersionCode` e `-PappVersionName` (padrão 1 e "1.0"); a assinatura, de `android/keystore.properties`.

### 2.4 A verificar em aparelho (Android)

1. Links: `adb shell pm get-app-links br.com.workeasy` deve mostrar o host após a
   verificação, e `adb shell am start -a android.intent.action.VIEW -d "https://<host>/p/teste"`
   deve abrir o app. Hoje o app abre na tela inicial: o `appUrlOpen` do Capacitor ainda não
   é tratado (pendência, item 6).
2. Botão voltar: confirmar que, depois de navegar pelo app (rotas do React Router, que
   usam `pushState`), o botão volta de tela em vez de fechar. Se o WebView não contar as
   entradas de `pushState` em `canGoBack`, o app fecha cedo demais. A correção, se
   necessária, fica em `platform/native.ts`.
3. Captura de foto no cadastro: o botão **Fotografar** abre a câmera e o documento sobe
   para `provider-documents`. Testar com Android atual.
4. Verificação de identidade: a prévia pede a permissão de câmera e aparece.
5. Localização: check-in com permissão negada registra sem coordenadas, com a mensagem
   de `LOCATION_MESSAGES`.
6. Barra de status e áreas seguras: `targetSdk` 36 (`variables.gradle`) desenha a tela
   atrás da barra de status a partir do Android 15. O `index.html` já usa
   `viewport-fit=cover`, mas o CSS que aplica `env(safe-area-inset-*)` está em
   `index.css`, `AppShell` e `Navbar`, que não são deste trabalho. **A verificar** se
   botões de topo e de rodapé ficam sob as barras do sistema.
7. Build: `npm run android:build` na CI e `./gradlew assembleDebug` devem passar com as
   novas regras XML. Em 24/11/2026 o `assembleDebug`, o `assembleRelease` e o `bundleRelease`
   passaram num ambiente com JDK 21 e Android SDK 36 (não na CI).

## 3. iOS (`ios/App/App`)

### 3.1 `Info.plist`

- `NSCameraUsageDescription` foi corrigida. O texto antigo dizia que nenhuma imagem era
  enviada, o que deixou de ser verdade com a foto de documento. O texto novo diz as duas
  coisas: a câmera fotografa documentos do cadastro, que sobem para análise, e a prévia da
  verificação não envia imagens.
- `NSPhotoLibraryUsageDescription` (nova): o anexo de documento pode vir da galeria. O
  seletor do WKWebView usa o seletor de fotos do sistema, então o app não acessa a galeria
  inteira. A chave fica para deixar a intenção explícita.
- `NSLocationWhenInUseUsageDescription` **removida em 24/11/2026**: só servia ao check-in de
  plantão da linha Cuidado, que a build iOS de loja não tem (`VITE_STORE_BUILD=ios`; D4 de
  `docs/lojas/app-store.md`). O `PrivacyInfo.xcprivacy` também deixou de declarar localização
  precisa. Quando o Cuidado entrar no iOS, restaurar as duas coisas (o comentário do
  `PrivacyInfo.xcprivacy` lembra).
- `NSCameraUsageDescription` de novo corrigida em 24/11/2026: a frase sobre a prévia da
  verificação de identidade saiu, porque essa prévia só existe no modo demonstração. O texto
  agora fala só da foto de documento do cadastro de profissional (`<input capture>`).

### 3.2 `PrivacyInfo.xcprivacy` (nova, incluída no alvo `App`)

> Rascunho para revisão de advogado e do encarregado de dados. Não é parecer jurídico.
> A lista foi derivada do código, não de uma análise jurídica.

- `NSPrivacyTracking` falso, sem domínios de rastreamento: não há SDK de análise, de
  publicidade nem de rastreamento entre apps.
- Dados declarados (todos vinculados ao usuário, finalidade `AppFunctionality`, sem
  rastreamento): e-mail (login por código), telefone (login e contato), nome, identificador
  da conta, localização precisa (check-in), fotos (documentos em imagem), outro conteúdo do
  usuário (documentos em PDF e textos de pedido), contato de emergência do assistido
  (`OtherUserContactInfo`) e histórico de compras (atendimentos e pagamentos).
- **Não declarados, para decisão jurídica:** antecedentes criminais e documentos de
  identidade podem exigir a categoria de dado sensível. Dados de saúde não são coletados:
  `services/care.ts` bloqueia termos de saúde (`findHealthTerm`).
- `NSPrivacyAccessedAPITypes` vazio, com justificativa: o código nativo do app é o modelo
  padrão do Capacitor, e o próprio Capacitor e o plugin `@capacitor/app` não usam APIs de
  motivo obrigatório (conferido nos fontes em `node_modules`). Se um plugin passar a usar
  `UserDefaults`, datas de arquivo, uptime, espaço em disco ou lista de teclados, declarar
  aqui com o motivo aprovado.

### 3.3 Projeto Xcode

- `PrivacyInfo.xcprivacy` foi adicionado ao projeto (`PBXFileReference`, `PBXBuildFile`,
  grupo `App` e fase Resources), no mesmo padrão de `public` e `Info.plist`. Sem essa
  referência o arquivo não entra no pacote.
- **A verificar:** o `xcodebuild` da CI (`ios:build`) precisa abrir o projeto. A validação
  daqui foi só de estrutura (contagem de IDs e chaves). Não há Xcode neste ambiente.

### 3.4 Pendências iOS

- O entitlement de **Universal Links** define `applinks:workeasy.ia.br`. O alvo
  `App` referencia `App/App.entitlements` em Debug e Release. Para distribuir,
  preencha o Team ID no `apple-app-site-association`, habilite Associated Domains no
  App ID da conta Apple e teste em aparelho. O Capacitor 8 repassa o link pelo
  `SceneDelegateProxy` ao listener de `appUrlOpen` em `platform/native.ts`.
- `ITSAppUsesNonExemptEncryption` não foi declarado. O app usa HTTPS, o que normalmente
  dispensa a declaração de criptografia; a decisão cabe ao responsável pela loja.
- `UIRequiredDeviceCapabilities` ainda lista `armv7`. Não foi alterado: é um resquício,
  mas mexer nele exige checar o mínimo de iOS do Capacitor 8 (hoje 15.0 no projeto).
- `contentInset: 'never'` (Capacitor) faz o conteúdo ir sob a barra de status; as áreas
  seguras dependem do CSS (ver 2.4, item 6). **A verificar** em iPhone com entalhe.
- Botão **Fotografar** do cadastro: o `<input>` criado por `platform/files.ts` fica oculto
  (`hidden`) e é aberto por `click()` dentro do toque. Em iOS antigos isso pode não abrir a
  câmera. **A verificar** em iPhone com iOS atual e, se necessário, mudar o input para
  visível fora da tela.

## 4. Tauri (`src-tauri`)

### 4.1 Content Security Policy (`tauri.conf.json`)

Política de release (`app.security.csp`):

- `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`: só o próprio app executa código e envia formulários.
- `style-src 'self' 'unsafe-inline'`: mantido, porque o React e o Tailwind aplicam estilos
  inline. Trocar por hashes, como no site (`public/_headers`), exige testar a janela
  desktop antes. **A verificar.**
- `connect-src`, host por host:
  - `'self'`: a própria página (`tauri://localhost`, e `http://tauri.localhost` no Windows).
  - `ipc:` e `http://ipc.localhost`: canal interno do Tauri (macOS e Linux, e Windows). A
    página não chama comandos: `src-tauri/src/lib.rs` não registra nenhum, o `package.json`
    não tem `@tauri-apps/api` e as capabilities estão vazias. Mantido como canal do runtime;
    remover só depois de testar a janela desktop. **A verificar.**
  - `https://*.supabase.co`: a API do projeto (Auth, REST, Storage e Edge Functions). O padrão
    cobre qualquer projeto, porque a URL vem de `VITE_SUPABASE_URL` no build e não pode ser
    escrita no arquivo.
  - `https://*.ingest.sentry.io` e `https://*.ingest.us.sentry.io` (EUA), e
    `https://*.ingest.de.sentry.io` (UE): ingestão de erros do Sentry. Só são usados com
    `VITE_SENTRY_DSN` no build; sem DSN, nada é enviado.
  - Não há `wss://`: o app não abre canal Realtime do Supabase. Se um canal for criado,
    acrescente `wss://*.supabase.co` aqui e na política de desenvolvimento.
- `img-src 'self' data: blob:`: sem Supabase. Os links para documentos assinados (`DocumentCard`)
  abrem em `<a target="_blank">`, não em imagem.
- `media-src ... mediastream:`: mantido porque a prévia de câmera da verificação pode usar
  `mediastream:` no WebKit (macOS e Linux). **A verificar.**

Política de desenvolvimento (`app.security.devCsp`): acrescenta `'unsafe-inline'` em
`script-src` (o plugin React do Vite injeta um script inline), `ws://localhost:3000` e
`http://localhost:3000` para o HMR. Os hosts de `connect-src` são os da política de release.
Sem ela, o `tauri dev` seria bloqueado pela política de release.

Sem `frame-ancestors`: em `<meta>` a diretiva é ignorada pelo navegador.

### 4.2 Janela e devtools

- Janela `main` com `label` explícito (a capacidade aponta para ela).
- `devtools: false`: o inspetor fica desligado também no build de desenvolvimento. Para
  depurar, troque localmente e não faça commit da troca. Sem a feature `devtools` no
  `Cargo.toml`, o inspetor já não entra em build de release; a configuração explícita
  garante isso mesmo se a feature for ligada depois.
- `useHttpsScheme` não foi alterado (padrão). A origem `http://tauri.localhost` no Windows é
  a que as Edge Functions aceitam em CORS (`docs/ARQUITETURA.md`). Mudar para `https`
  quebra as chamadas do desktop.

### 4.3 Capacidades (`src-tauri/capabilities/default.json`)

- Antes: `core:default`. Agora: nenhuma permissão. A página não chama APIs do Tauri
  (`src-tauri/src/lib.rs` não expõe comandos; nenhum `@tauri-apps` aparece em `src/`).
- **A verificar** no `tauri build` de cada sistema: a janela abre, carrega, e nenhuma
  permissão faltante aparece no console.

### 4.4 Pendências desktop

- Links externos (`wa.me`, documentos assinados) abrem com `target="_blank"`. No Tauri
  isso não é garantido sair para o navegador do sistema. A solução habitual é o plugin
  `tauri-plugin-opener`, que é uma dependência nova (Rust) e precisa de aprovação.
  **A verificar** em cada sistema.
- Identificadores: `tauri.conf.json` (`identifier`), `capacitor.config.ts` (`appId`),
  `applicationId` do Android e `PRODUCT_BUNDLE_IDENTIFIER` do iOS são todos
  `br.com.workeasy`. Não há divergência, e nada foi renomeado.

## 5. Capacitor (`capacitor.config.ts`)

- `server.androidScheme: 'https'` e `server.iosScheme: 'capacitor'` fixam as origens do
  WebView, que já estão na lista de CORS das Edge Functions. `cleartext: false`.
- `contentInset: 'never'` mantido (ver 3.4).

## 6. Pendências e itens não feitos

1. **App Links no app**: tratar `appUrlOpen` do plugin `@capacitor/app` para levar o usuário
   à rota certa. **Feito em 24/11/2026:** `platform/native.ts` ouve `appUrlOpen` e
   `platform/deepLinks.ts` (`routeFromAppUrl`) aceita só links `https` para o host de
   `VITE_SITE_URL` e devolve a rota; o resto é ignorado. Testado em jsdom
   (`test/platform/deep-links.test.ts`), não em aparelho. O build nativo precisa ter
   `VITE_SITE_URL` definida para tratar os links.
2. **Hospedagem das associações**. Sirva os arquivos de `public/.well-known/` em
   `https://workeasy.ia.br` com HTTPS. O AASA precisa responder diretamente com
   HTTP 200 e `Content-Type: application/json`. O build web de distribuição publica
   uma associação vazia para cada plataforma cuja identidade ainda está pendente.
3. **Fingerprint do Android**: o `sha256_cert_fingerprints` precisa ser o do certificado de
   **assinatura do Google Play** (App Signing), não o da chave de upload.
4. **Universal Links e entitlements** (3.4): arquivo e projeto feitos; falta o dono (seção 8).
5. **Escopo do FileProvider** (2.3), depois de testar a captura no WebView.
6. **Lista de dados do PrivacyInfo** (3.2) revisada pelo advogado e pelo encarregado.
7. **Build nativo**: `cap sync`, `assembleDebug`, `assembleRelease` e `bundleRelease` foram
   executados em 24/11/2026 (Android, JDK 21, AGP 8.13.0); `xcodebuild` e `tauri build` não
   (sem macOS neste ambiente). O `web-release.yml` gera só o APK de depuração: o `.aab`
   assinado sai por `scripts/android-release.sh` (ver `docs/lojas/google-play.md`, 14.4).
8. **Verificação em aparelho**: itens 2.4 e 3.4 e o botão voltar.
9. **Sem `.github/`**: nenhum workflow foi alterado.

## 7. Como conferir as mudanças sem build nativo

- XML: `python3 -c "import xml.etree.ElementTree as ET; ET.parse('android/app/src/main/AndroidManifest.xml')"`
  (e os dois arquivos em `res/xml/`).
- Plist: `python3 -c "import plistlib; plistlib.load(open('ios/App/App/PrivacyInfo.xcprivacy','rb'))"`.
- JSON do Tauri e dos `.well-known`: `python3 -m json.tool <arquivo>`.
- Web: `npx vitest run test/platform test/pro/cadastro.test.tsx test/web/pedido-concierge.test.tsx`,
  `npx tsc --noEmit -p .`, `npx eslint platform test/platform capacitor.config.ts pages/cliente/Pedido.tsx pages/pro/Cadastro.tsx --max-warnings 0`.

## 8. Links profundos: o que o dono preenche e como conferir

Um link `https` do site só abre o app quando cinco coisas dizem o mesmo. O comando
`node scripts/check-app-links.mjs` confere isso nos arquivos (teste:
`test/platform/check-app-links.test.ts`):

- **sem `--strict`** (o que o CI pode rodar): falha só se os arquivos se contradizem (host
  diferente entre o manifesto Android e o entitlement iOS, pacote ou bundle id diferente do
  `appId` do Capacitor, impressão digital ou Team ID malformados, `server.url` ou
  `server.hostname` no `capacitor.config.ts`, entitlements fora do projeto Xcode). Enquanto
  houver placeholder, apenas lista as pendências (`PENDENTE`) e sai com 0.
- **com `--strict`**: falha também enquanto houver host de exemplo, `TODO` na impressão
  digital ou `TODO-TEAM-ID`. É o portão antes de enviar o primeiro pacote às lojas.
- `--site-url https://<domínio>` (ou `VITE_SITE_URL`) compara o host do manifesto com o do
  site, porque o app só trata links do host de `VITE_SITE_URL` (`platform/deepLinks.ts`).

O `capacitor.config.ts` **não** leva o host dos links: a origem do WebView é
`https://localhost` no Android e `capacitor://localhost` no iOS (lista de CORS das Edge
Functions). O script só confere nele o `appId` e que não haja `server.url`/`server.hostname`.

O domínio configurado no manifesto Android e no entitlement iOS é `workeasy.ia.br`.
Confira as identidades de assinatura antes de distribuir.

| Arquivo | Campo | Origem |
|---|---|---|
| `public/.well-known/assetlinks.json` | `sha256_cert_fingerprints` (hoje `TODO`) | Impressão digital SHA-256 do certificado de **assinatura do app**: Play Console > Integridade do app > Assinatura de apps (não é a da chave de upload). Uma chave de upload autoassinada se lê com `keytool -list -v -keystore <arquivo>.jks -alias <alias>` ou, do próprio `.aab`, `keytool -printcert -jarfile app-release.aab`; essas duas servem só para teste interno sem a Assinatura do Play. Formato `AA:BB:...` (32 pares maiúsculos). Se o app também for distribuído por outro canal, a impressão digital dele entra como segundo item da lista. |
| `public/.well-known/apple-app-site-association` | `TODO-TEAM-ID` | Team ID de 10 caracteres: developer.apple.com > Membership details. |

Depois de publicar o site (os dois arquivos precisam responder em
`https://workeasy.ia.br/.well-known/...`, `200`, sem redirecionamento, o AASA com
`Content-Type: application/json`):

1. `node scripts/check-app-links.mjs --strict --site-url https://workeasy.ia.br` deve terminar em 0.
2. Android: `adb shell pm get-app-links br.com.workeasy` mostra o host como `verified`;
   `adb shell am start -a android.intent.action.VIEW -d "https://workeasy.ia.br/p/teste"` abre o app.
3. iOS: em aparelho, abrir um link do domínio pelo app Notas ou Mensagens abre o app
   (não vale colar na barra do Safari). Em desenvolvimento, usar `?mode=developer` no
   entitlement.
4. Não commitar `keystore.properties` nem `.jks`: o `.gitignore` já os ignora.

Nada disso foi executado em aparelho: o que está provado é a coerência dos arquivos, a
presença do filtro `autoVerify` e do host no manifesto mesclado do `.aab` e o listener
`appUrlOpen` em jsdom.
## 9. Política de versionamento (Android, iOS e Desktop)

- **Versionamento SemVer (`MAJOR.MINOR.PATCH`) sincronizado:** manter a mesma versão semântica entre `apps/web/package.json`, `apps/web/src-tauri/tauri.conf.json`, `apps/web/src-tauri/Cargo.toml`, Android `versionName` (`-PappVersionName`) e iOS `MARKETING_VERSION`.
- **Números de build inteiros estritamente crescentes:** usar inteiros estritamente crescentes a cada pacote publicado para Android `versionCode` (`-PappVersionCode`) e iOS `CURRENT_PROJECT_VERSION`.
- **Regra de incremento e tag git:** incrementar `PATCH` para correções, `MINOR` para novas funcionalidades retrocompatíveis e `MAJOR` para quebras de contrato; registrar a tag git `vX.Y.Z` por release publicada (acompanhando o gatilho `v*` de `.github/workflows/web-release.yml`).

### Rede de motoristas (D14, 27/11/2026)

A partir desta revisão, o app móvel declara localização precisa para o compartilhamento voluntário por trecho de motorista. Android usa serviço de localização com notificação visível; iOS declara o uso em segundo plano e o manifesto de privacidade inclui localização e identificador do aparelho para alertas. A função de Cuidado conserva o escopo anterior. O driver só transmite se o servidor confirmar projeto real, permissão de localização, trecho atribuído e estado ativo. A expiração da autenticação interrompe o envio. Em simulador ficam ausentes GPS e registro de dispositivo real. Push para ofertas usa FCM ou APNs e um payload sem endereço, valor ou nome de passageiro. [Controles e credenciais](../ARQUITETURA.md#rede-direta-de-motoristas)

Para aceitar um build em campo, testar em Android e iOS físicos com permissão concedida e recusada. Cobrir tela bloqueada, retorno ao app, perda de rede, posição desatualizada, sessão encerrada e troca de conta. Confirmar no backend quem pode consultar a ETA e o ponto, expurgo operacional e recibo. Registrar aparelho, SO, revisão do app e horário em O14. Build, emulador e cadastro de revisão da loja têm evidências distintas. O diretório dos motoristas e dos documentos está descrito no [dossiê](dossie-de-motoristas.md).
