# Nativo: adaptadores de plataforma e endurecimento dos shells

Nota técnica sobre a camada `platform/` e sobre os shells Android, iOS (Capacitor) e
desktop (Tauri). Descreve o que cada mudança faz e o que só pode ser confirmado em
aparelho ou pelo workflow de release da CI. Não é um contrato de API: o contrato do
backend continua em `docs/ARQUITETURA.md`.

Estado: nada disto foi executado em aparelho nem em build nativo. A geração dos
binários acontece na CI, em pull request. Tudo o que está marcado como **a verificar**
depende desse passo.

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
  todos os domínios de backup em nuvem e de transferência entre aparelhos. Hoje não
  copiam nada; as regras ficam válidas caso o backup seja ligado no futuro.
- `usesCleartextTraffic="false"` e `networkSecurityConfig="@xml/network_security_config"`:
  tráfego `http://` é recusado; só a loja de certificados do sistema é confiável. O
  Capacitor serve o app em `https://localhost` (ver `capacitor.config.ts`), então nenhuma
  exceção é necessária.
- Intent filter de **App Links** (`autoVerify="true"`, `https`, host
  `app.workeasy.example`). O host é **de exemplo** (domínio reservado, não resolve). Trocar
  pelo domínio real antes de publicar, nos dois lugares: aqui e em
  `public/.well-known/assetlinks.json`.

### 2.2 Permissões (todas com uso no código)

| Permissão | Por quê | Observação |
|---|---|---|
| `INTERNET` | Supabase, Auth, Storage. | Obrigatória. |
| `CAMERA` | `pages/Verification.tsx` pede `getUserMedia` para a prévia da tela de verificação. | O `<input capture>` do cadastro abre o app de câmera do aparelho por intent; não depende desta permissão. **A verificar** em aparelho. |
| `ACCESS_FINE_LOCATION` e `ACCESS_COARSE_LOCATION` | Check-in de plantão usa `enableHighAccuracy: true`. | No Android 12+, pedir a fina exige também a grosseira. O check-in funciona sem localização (`locationNote`). |

### 2.3 Não alterado de propósito

- `res/xml/file_paths.xml` ainda expõe `external-path path="."` e `cache-path path="."`
  no `FileProvider`. Pode ser mais restrito, mas o Capacitor usa esse provedor para a
  captura de arquivos do WebView. Restringir sem testar pode quebrar a foto do cadastro.
  **A verificar** antes de qualquer ajuste.
- `minifyEnabled false` no release e `versionCode 1` continuam como estavam.

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
   novas regras XML. Validação feita aqui só de estrutura XML (`xml.etree`).

## 3. iOS (`ios/App/App`)

### 3.1 `Info.plist`

- `NSCameraUsageDescription` foi corrigida. O texto antigo dizia que nenhuma imagem era
  enviada, o que deixou de ser verdade com a foto de documento. O texto novo diz as duas
  coisas: a câmera fotografa documentos do cadastro, que sobem para análise, e a prévia da
  verificação não envia imagens.
- `NSPhotoLibraryUsageDescription` (nova): o anexo de documento pode vir da galeria. O
  seletor do WKWebView usa o seletor de fotos do sistema, então o app não acessa a galeria
  inteira. A chave fica para deixar a intenção explícita.
- `NSLocationWhenInUseUsageDescription` mantido: é verdadeiro para o check-in, e o texto diz
  que o registro pode ser feito sem localização.

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

- **Universal Links** não estão configurados: falta o arquivo de entitlements com
  `com.apple.developer.associated-domains` e a capacidade no Xcode. Depende do domínio real
  e do Team ID. O template `apple-app-site-association` está em `public/.well-known/`.
- `ITSAppUsesNonExemptEncryption` não foi declarado. O app usa HTTPS, o que normalmente
  dispensa a declaração de criptografia; a decisão cabe ao responsável pela loja.
- `UIRequiredDeviceCapabilities` ainda lista `armv7`. Não foi alterado: é um resquício,
  mas mexer nele exige checar o mínimo de iOS do Capacitor 8 (hoje 15.0 no projeto).
- `contentInset: 'never'` (Capacitor) faz o conteúdo ir sob a barra de status; as áreas
  seguras dependem do CSS (ver 2.4, item 6). **A verificar** em iPhone com entalhe.

## 4. Tauri (`src-tauri`)

### 4.1 Content Security Policy (`tauri.conf.json`)

Política de release (`app.security.csp`):

- `default-src 'self'`, `script-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
  `form-action 'self'`: só o próprio app executa código e envia formulários.
- `style-src 'self' 'unsafe-inline'`: mantido, porque o React e o Tailwind aplicam estilos
  inline.
- `connect-src 'self' ipc: http://ipc.localhost https://*.supabase.co wss://*.supabase.co`:
  a API do Supabase (REST, Auth, Storage, Edge Functions e Realtime) no projeto. O padrão
  cobre qualquer projeto, porque a URL vem de `VITE_SUPABASE_URL` no build e não pode ser
  escrita no arquivo.
- `img-src 'self' data: blob:`: sem Supabase. Os links para documentos assinados (`DocumentCard`)
  abrem em `<a target="_blank">`, não em imagem.
- `media-src ... mediastream:`: mantido porque a prévia de câmera da verificação pode usar
  `mediastream:` no WebKit (macOS e Linux). **A verificar.**

Política de desenvolvimento (`app.security.devCsp`): acrescenta `'unsafe-inline'` em
`script-src` (o plugin React do Vite injeta um script inline) e `ws://localhost:3000`
para o HMR. Sem ela, o `tauri dev` seria bloqueado pela política de release.

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
   à rota certa (hoje o link abre a tela inicial).
2. **Domínio real**: trocar o host de exemplo do manifesto Android e os valores de
   `public/.well-known/*` (`TODO`). Hospedagem exige `Content-Type: application/json` no
   arquivo `apple-app-site-association` (sem extensão), HTTPS e sem redirecionamento. O
   `public/_redirects` é de Netlify e o `/* /index.html 200` só não engole o `.well-known`
   porque o arquivo existe; a hospedagem final ainda não foi escolhida.
3. **Fingerprint do Android**: o `sha256_cert_fingerprints` precisa ser o do certificado de
   **assinatura do Google Play** (App Signing), não o da chave de upload.
4. **Universal Links e entitlements** (3.4).
5. **Escopo do FileProvider** (2.3), depois de testar a captura no WebView.
6. **Lista de dados do PrivacyInfo** (3.2) revisada pelo advogado e pelo encarregado.
7. **Build nativo**: `cap sync`, `gradlew assembleDebug`, `xcodebuild` e `tauri build` não
   foram executados aqui. O workflow de release da CI é o lugar para isso (não é deste
   trabalho; a CI é mantida por outro agente).
8. **Verificação em aparelho**: itens 2.4 e 3.4 e o botão voltar.
9. **Sem `.github/`**: nenhum workflow foi alterado.

## 7. Como conferir as mudanças sem build nativo

- XML: `python3 -c "import xml.etree.ElementTree as ET; ET.parse('android/app/src/main/AndroidManifest.xml')"`
  (e os dois arquivos em `res/xml/`).
- Plist: `python3 -c "import plistlib; plistlib.load(open('ios/App/App/PrivacyInfo.xcprivacy','rb'))"`.
- JSON do Tauri e dos `.well-known`: `python3 -m json.tool <arquivo>`.
- Web: `npx vitest run test/platform test/pro/cadastro.test.tsx test/web/pedido-concierge.test.tsx`,
  `npx tsc --noEmit -p .`, `npx eslint platform test/platform capacitor.config.ts pages/cliente/Pedido.tsx pages/pro/Cadastro.tsx --max-warnings 0`.
