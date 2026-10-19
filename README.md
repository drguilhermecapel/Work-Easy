# WorkEasy

Plataforma para encontrar e contratar serviços e profissionais liberais de todas as áreas e categorias, de reformas e limpeza a aulas, beleza, tecnologia, cuidados e saúde.

> **Status: protótipo de demonstração.** Todos os dados são fictícios. Não há backend, login real, pagamento, verificação de identidade, chat, vídeo, teleconsulta nem prontuário em funcionamento. Nada do que se digita é enviado ou armazenado. Não use para atendimento real.

## O que existe hoje

- Catálogo de 15 categorias e cerca de 170 subcategorias de serviços e profissões.
- Busca por texto (ignora acentos e maiúsculas) e por categoria.
- Perfis de prestadores e de profissionais de saúde, com agenda de demonstração.
- Painéis de cliente, prestador e profissional de saúde, alternados pelo seletor de papel no menu.
- Telas de demonstração de teleconsulta e prontuário, marcadas como funcionalidade futura.

## Rodar localmente

Requer Node.js 22.

```bash
npm ci          # instala exatamente as versões do package-lock.json
npm run dev     # http://localhost:3000
```

| Script | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Typecheck e build de produção em `dist/` |
| `npm run preview` | Serve o build de produção |
| `npm run lint` | ESLint, sem avisos tolerados |
| `npm run typecheck` | TypeScript em modo estrito |
| `npm test` | Testes com Vitest |

## Plataformas

Um único código React é empacotado para seis plataformas.

| Plataforma | Tecnologia | Como gerar | Saída |
|---|---|---|---|
| Site (instalável como PWA) | Vite + `vite-plugin-pwa` | `npm run build` | `dist/` |
| Android | Capacitor | `npm run android:build` (JDK 21 + Android SDK) | `android/app/build/outputs/apk/debug/` |
| iOS | Capacitor | `npm run ios:build` (macOS + Xcode) | build para o simulador em `ios/build/` |
| Windows | Tauri 2 | `npm run desktop:build` (Rust + MSVC) | `.msi` e `.exe` em `src-tauri/target/release/bundle/` |
| macOS | Tauri 2 | `npm run desktop:build` (Rust + Xcode CLT) | `.app` e `.dmg` |
| Linux | Tauri 2 | `npm run desktop:build` (Rust + WebKitGTK 4.1) | `.deb` e `.AppImage` |

- **Modos de build.** O site usa URLs limpas e service worker. Os apps nativos usam o build `--mode native` (`.env.native`), com URLs com `#` e sem service worker, porque são servidos de arquivos locais.
- **CI.** O workflow `Release builds` (`.github/workflows/release.yml`) gera as seis saídas sob demanda ("Run workflow") ou em tags `v*`. Os artefatos ficam anexados à execução por 7 dias.
- **Saídas sem assinatura.** O APK é de debug, o app iOS roda só no simulador e os instaladores desktop não são assinados (o Windows mostra o aviso do SmartScreen e o macOS pede para abrir pelo menu de contexto).
- **Publicação nas lojas.** Exige conta Apple Developer de organização (US$ 99/ano, também usada para notarizar no macOS), conta Google Play de organização (US$ 25, taxa única), política de privacidade publicada e exclusão de conta dentro do app.

O `.npmrc` liga `legacy-peer-deps` por causa de um bug do npm 10 ao resolver os pares opcionais do Vitest; os pares necessários estão declarados explicitamente no `package.json`.

## Segurança e alegações

- **Nenhum segredo no cliente.** Variáveis `VITE_*` vão para o JavaScript público. Chaves de API, tokens e senhas pertencem a funções de servidor. O CI falha se encontrar uma chave no bundle.
- **Nenhuma alegação sem implementação.** O teste `test/claims-guard.test.ts` falha se o código voltar a anunciar criptografia ponta a ponta, assinatura digital, selo de verificado, pagamento retido, estatísticas inventadas ou prazos que não existem. Uma frase só volta junto com a funcionalidade real e com a mudança correspondente no teste.

## Estrutura

```
AppShell.tsx      layout e rotas (cada página é carregada sob demanda)
App.tsx           provedores e roteador (BrowserRouter no site, HashRouter nos apps nativos)
pages/            telas
components/       componentes compartilhados
utils/            datas, moeda e busca (funções puras, testadas)
platform/         integração com os apps nativos (botão voltar do Android)
constants.tsx     catálogo e dados fictícios
test/             testes
android/, ios/    projetos nativos do Capacitor
src-tauri/        app desktop (Tauri) para Windows, macOS e Linux
assets/           ícone-fonte (SVG) usado para gerar os ícones de todas as plataformas
```

## Licença

Proprietária. Todos os direitos reservados. Veja [LICENSE](LICENSE).
