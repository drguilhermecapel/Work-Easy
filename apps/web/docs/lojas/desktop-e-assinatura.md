# Desktop (Windows, macOS, Linux): assinatura, atualização e distribuição

> **Rascunho para revisão de advogado. Não é parecer jurídico.**
> Documento S03 do plano. Data de referência: **08/11/2026**. Estado do produto: protótipo (MVP em `main`), **não implantado, sem usuários reais, nada testado contra Asaas, WhatsApp ou Resend reais**. Este guia não afirma que o app é seguro, que tem assinatura reconhecida pelo sistema ou que foi publicado em loja. Trechos de documentação de terceiros são citações literais em inglês; a leitura em português é nossa.

## Como ler

| Marca | Significa |
|---|---|
| **[PLANEJADO]** | Não existe no código hoje. Precisa ser feito antes de depender disso. |
| **[CONDICIONAL: depende de parecer]** | Depende de parecer jurídico ou contábil. |
| **[DECISÃO DO DONO]** | Escolha de negócio. O padrão sugerido vale até o dono decidir. |
| **[recomendação]** | Proposta deste guia. Não é fato de fonte. |
| **[incerto]** | Não confirmei em fonte aberta. Conferir antes de agir. |
| **[NÃO AVALIADO]** | Fora do que foi lido nesta rodada. |

Fontes: **[T1]** a **[T10]** (Tauri), **[AZ1]** e **[AZ2]** (Azure), **[MS1]** a **[MS3]** (Microsoft), **[AP1]** a **[AP4]** (Apple), **[SSL]**, **[FH]**, **[G1]** a **[G4]** (GitHub), **[AI1]**, **[VI]**. A lista completa está na seção 14. Caminhos de arquivo são relativos a `apps/web/`, salvo quando indicado.

---

## 0. Resumo e decisão

Estado verificado no repositório em 08/11/2026:

- Os instaladores que o CI gera **não têm assinatura de código** em Windows e macOS, e **não têm atualização automática**: não há plugin de atualização em `src-tauri/Cargo.toml` nem bloco de atualização em `src-tauri/tauri.conf.json`.
- Os instaladores **rodam em modo demonstração**. O workflow não passa `VITE_SUPABASE_URL`, e `.env.native` só define `VITE_ROUTER`. Quem instalar hoje vê dados fictícios.
- Os pacotes não têm lugar durável. Os artefatos expiram em 7 dias e não existe etapa de release.

Veredito:

1. **Não publicar o desktop em nenhuma loja no lançamento.**
2. **Distribuir só para testadores**, por download direto, depois que o backend estiver no ar, com o aviso de instalação da seção 3.
3. **Windows:** o serviço de assinatura em nuvem da Microsoft (Azure Artifact Signing) não lista o Brasil no texto que lemos. Restam a Microsoft Store (conta de empresa, sem taxa de cadastro, com requisitos) e certificado de autoridade certificadora (custo não verificado).
4. **macOS:** US$ 99 por ano mais notarização. Contratar só quando houver usuário macOS que precise do instalador.
5. **Linux:** `.deb` e `.AppImage` já são gerados. Não há assinatura exigida pelo sistema.
6. **Atualização automática:** adiar para a segunda versão distribuída. Gerar e guardar a chave do updater **antes** do primeiro lançamento público, porque a chave perdida impede atualizar quem já instalou.

As decisões por canal, com motivos e gatilhos de revisão, estão na seção 10.

---

## 1. O que o CI produz hoje

Fonte: `.github/workflows/web-release.yml` (lido em 08/11/2026).

| Job | Runner | Gera | Caminho do artefato | Assinatura |
|---|---|---|---|---|
| `linux-web-android` | ubuntu-22.04 | `dist/` (site/PWA), APK de debug, `.deb`, `.AppImage` | `src-tauri/target/release/bundle/deb/*.deb`, `.../appimage/*.AppImage` | nenhuma |
| `windows` | windows-latest | `.msi` e `.exe` (NSIS) | `.../bundle/msi/*.msi`, `.../nsis/*.exe` | nenhuma |
| `macos-ios` | macos-latest | `.app`, `.dmg`, zip do simulador iOS | `.../bundle/dmg/*.dmg` | nenhuma (iOS com `CODE_SIGNING_ALLOWED=NO`) |

Pontos que mudam decisões:

- **Gatilhos:** só `workflow_dispatch` e tags `v*` (bloco `on:`). Não há gatilho de pull request nem de push de branch.
- **Retenção:** `retention-days: 7` em todos os uploads. Não existe etapa que crie release no GitHub.
- **Segredos e variáveis:** nenhum job passa `secrets.*` nem `VITE_*`.
- **Testes:** só o job Linux roda `npm test` antes do build. Windows e macOS não rodam testes.
- **Comando:** `npm run desktop:build` é `tauri build` (`package.json`).

Divergências na documentação. Não corrigi os arquivos; estão listadas na seção 12.

| Onde | O que o texto diz | O que o arquivo faz |
|---|---|---|
| `docs/DECISOES.md`, linha 90 | Workflow `.github/workflows/release.yml`, "Release builds", roda em pull requests que mudam `src-tauri/` | O arquivo se chama `web-release.yml`, "Web release builds", e não tem gatilho de pull request |
| `web-release.yml`, comentário do topo (linhas 3 a 6) | "e em pull requests que mudam o empacotamento nativo" | O bloco `on:` não tem `pull_request`. O comentário do próprio bloco diz que nenhum pull request inicia a compilação |
| `docs/DECISOES.md`, linha 91 | macOS pede para abrir "pelo menu de contexto" | A página da Apple lida descreve **Privacy & Security > Open Anyway**. Não cita menu de contexto ([AP2]) |

---

## 2. Estado do código desktop

Verificado nos arquivos. Nada disto foi executado nesta rodada.

- **Identidade:** `identifier` `br.com.workeasy`, versão `0.1.0`, janela `main` de 1280x860, mínimo 380x600 (`src-tauri/tauri.conf.json`).
- **Titular no aviso de direitos:** `bundle.copyright` diz "© 2026 Guilherme Capel Pasqua. Todos os direitos reservados."; `bundle.publisher` diz "WorkEasy". O nome de pessoa física aparece no aviso de direitos. Alinhar com o titular que vai constar nas lojas [DECISÃO DO DONO].
- **Versões:** `tauri` 2.12.1 e `tauri-build` 2.7.1 fixas em `src-tauri/Cargo.toml`. `@tauri-apps/cli` 2.12.1 em `package.json`.
- **Rust:** `src-tauri/src/lib.rs` não expõe comandos. As únicas dependências são `tauri` e `tauri-build`. Não há plugins.
- **Capacidades:** `src-tauri/capabilities/default.json` tem `"permissions": []` e `"windows": ["main"]`. Nenhum arquivo do frontend (fora de `src-tauri/`) importa `@tauri-apps/*`.
- **Inspetor:** `devtools: false` na janela, e a feature `devtools` não está ligada no `Cargo.toml`.
- **CSP:** definida em `app.security.csp` e `app.security.devCsp` de `tauri.conf.json`. Detalhes na seção 8.
- **Links externos:** `platform/external.ts` abre links com `window.open` (linha 48). `components/admin/DocumentCard.tsx` (linha 52) abre documento por URL temporária com `<a target="_blank">`. O comportamento no Tauri não foi confirmado (seção 13).
- **Permissões do Info.plist:** `NSLocationWhenInUseUsageDescription` (plantão de cuidado) e `NSCameraUsageDescription` (prévia da câmera).
- **Câmera:** `pages/Verification.tsx` chama `getUserMedia` (linha 35) e começa com o comentário "Demo-only flow: no image is captured, sent or stored, and nothing is verified." A rota `/verification` aparece duas vezes em `pages/prototype/routes.tsx` (linhas 29 e 49). O cadastro do prestador (`pages/pro/Cadastro.tsx`) usa `captureFile` de `platform/files`, que abre a câmera no celular e o seletor de arquivos no computador (comentário da linha 380). Não há `getUserMedia` no cadastro.
- **Modo demonstração:** `lib/supabase.ts` deixa o cliente `null` sem `VITE_SUPABASE_URL`. Não há `.env` no repositório, só `.env.example`. `.env.native` define apenas `VITE_ROUTER` (hash nas rotas). O Vite carrega `.env.[mode]` com `--mode native` e expõe ao cliente só variáveis com prefixo `VITE_` [VI].
- **Documentos no Storage:** `services/admin.ts` gera URL assinada de 300 segundos para o bucket privado `provider-documents`.

---

## 3. Avisos de instalação sem assinatura

| Sistema | O que o usuário vê, segundo a fonte | O que não foi confirmado |
|---|---|---|
| **Windows (SmartScreen)** | Arquivo sem reputação "is marked as a higher risk and presents a warning to the user" [MS1]. A reputação considera também a assinatura digital do arquivo [MS1]. | Texto exato do aviso e os cliques para executar mesmo assim [incerto]. |
| **Windows 11 com Smart App Control ligado** | "If the app is unsigned, or the signature is invalid, Smart App Control will consider it untrusted", e o app é bloqueado "for your protection" [MS2]. O usuário pode desligar o recurso, e a Microsoft diz que ele pode se desligar sozinho para alguns usuários [MS2]. | Quantos computadores têm o recurso ligado [incerto]. |
| **macOS (Gatekeeper)** | "By default, macOS Catalina and later also requires software to be notarized" [AP2]. Depois da primeira tentativa, o caminho é Ajustes do Sistema > Privacy & Security > **Open Anyway** [AP2]. | Se o menu de contexto (Control-clique) ainda funciona nas versões novas do macOS: a página lida não cita esse atalho [incerto]. Nomes dos menus em português [incerto]. |
| **Linux (.deb)** | Página de assinatura do Linux não trata de `.deb` [T6]. | Comportamento do gerenciador de pacotes em cada distribuição [NÃO AVALIADO]. |
| **Linux (AppImage)** | "just download them, make them executable and run them" [AI1]. AppImage não precisa de instalação [AI1]. | Comando `chmod` não aparece na página lida [incerto]. |

### Textos prontos para a página de download (pt-BR)

**Windows**

> **Versão de teste para Windows.** Este instalador ainda não tem assinatura de código. Ao abrir, o Windows pode mostrar um aviso do Microsoft Defender SmartScreen. Se você baixou pelo endereço oficial do WorkEasy, pode continuar. Não desative o Microsoft Defender para instalar.

**macOS**

> **Versão de teste para macOS.** Este app ainda não foi notarizado pela Apple, então o macOS bloqueia a primeira abertura. Tente abrir o app uma vez. Depois, em Ajustes do Sistema > Privacidade e Segurança, clique em "Abrir Mesmo Assim" [conferir o rótulo em português no seu Mac]. Não desative o Gatekeeper.

**Linux (AppImage)**

> **Versão de teste para Linux.** Baixe o arquivo `.AppImage`, torne-o executável (propriedades do arquivo, ou `chmod +x` no terminal [comando de shell, não copiado de fonte aberta]) e execute. Ele não precisa de instalação.

---

## 4. Assinatura e notarização: opções ordenadas por custo e esforço

### 4.1 Como a reputação funciona no Windows

- "If a URL, a file, an app, or a certificate has an established reputation, users don't see any warnings" [MS1].
- Desde 2024, certificado EV não dá reputação imediata. OV e EV passaram a construir reputação do mesmo jeito [T2]. A página da SSL diz o mesmo: "EV and OV are treated equally since March 2024" [SSL].
- Assinar todas as versões com o mesmo certificado faz a reputação passar de uma versão para outra. Uma versão nova ainda pode mostrar aviso [T2].
- A própria Tauri diz que o envio manual do arquivo à Microsoft pode remover o aviso para aquele arquivo [T2].
- Os certificados de hoje, segundo a SSL, têm de ficar em token FIPS 140-2 ou em HSM na nuvem [SSL]. O guia de Windows da Tauri para OV só se aplica a certificado comprado antes de 1º de junho de 2023 [T2]. Consequência: o modelo de segredo com PFX (`WINDOWS_CERTIFICATE`) do guia da Tauri **não serve** para uma compra nova [incerto: a relação entre essa data e o token não foi detalhada na página lida].

### 4.2 Windows: opções

| # | Opção | Custo (dado aberto) | Elegibilidade (texto lido) | Esforço (fundador solo) | Veredito |
|---|---|---|---|---|---|
| W1 | **Microsoft Store**, conta de empresa | Cadastro sem taxa no fluxo novo, a partir de storedeveloper.microsoft.com [MS3] | Empresa: DUNS (recomendado) ou documentos oficiais, e-mail de trabalho com o domínio da empresa, revisão manual de 2 a 5 dias úteis [MS3]. Conta individual serve só para distribuição "not in relation to their business, trade, or profession" [MS3]. | Médio. A Tauri gera só EXE e MSI. O instalador deve ser silencioso (NSIS `/S`), assinado e offline [T5]. | **Candidata depois do lançamento.** Ver seção 10 |
| W2 | **Azure Artifact Signing** (antigo Trusted Signing) | Plano Basic inclui 5.000 assinaturas por mês; o preço mensal em USD não apareceu na extração da página [AZ2] [incerto] | Certificado Public Trust: organizações nos países listados, e indivíduos só nos EUA e Canadá. A lista não inclui o Brasil [AZ1]. | Baixo, se fosse elegível | **Bloqueado.** "Brazil South" é só a região onde o recurso é criado [AZ1] |
| W3 | **Certificado OV** de autoridade certificadora | Não extraído [SSL] [incerto] | Exige entidade empresarial: "Business entity required: Yes" [SSL] | Médio: token físico ou serviço de HSM, e `signCommand` no build [T2] | Candidato se houver CNPJ. Confirmar com contador [CONDICIONAL: depende de parecer] |
| W4 | **Certificado EV de pessoa física** ("EV Sole Proprietor") | Não extraído [SSL] [incerto] | "validated as an individual. No registered business entity required" [SSL]. Elegibilidade no Brasil não confirmada [incerto] | Médio | Só se o dono quiser o próprio nome como editor. [DECISÃO DO DONO] + [CONDICIONAL: depende de parecer] |
| W5 | Sem assinatura | Zero | — | Nenhum | Aceitável só para testadores avisados (seção 3) |

Os certificados Private Trust do Azure não têm a restrição geográfica [AZ1]. Não avaliei se servem para distribuição pública no Windows. Não usar como solução sem confirmação [incerto].

Não encontrei preço aberto de OV ou EV. Não há valor em reais neste guia.

### 4.3 macOS: opções

| # | Opção | Custo (dado aberto) | Elegibilidade e requisitos | Esforço | Veredito |
|---|---|---|---|---|---|
| M1 | **Apple Developer Program** | US$ 99 por ano; a página lida não mostra valor em reais [AP1] | Inscrição como indivíduo ou organização [AP1]. O certificado Developer ID Application só pode ser criado pelo **Account Holder**, até cinco por tipo [AP3]. Notarização com `notarytool` e chave da App Store Connect ou Apple ID [T3] | Médio | **Contratar quando houver usuário macOS que precise do DMG** |
| M2 | Sem assinatura e sem notarização | Zero | macOS bloqueia por padrão [AP2] | Baixo | Só para testadores (seção 3) |

**Notarização.** Os textos conflitam, e o conflito precisa ficar explícito:

- A Tauri diz que a notarização "is required when using a Developer ID Application certificate" [T3] e que distribuir fora da App Store "also requires notarization" [T1].
- A página Developer ID da Apple diz que notarizar dá "even more confidence". Não diz que é obrigatória [AP3].
- O suporte da Apple diz que, por padrão, o macOS exige notarização de software fora da loja [AP2].

Conclusão de trabalho: tratar a notarização como obrigatória para o DMG. Confirmar em teste com um build de verdade antes de prometer abertura sem aviso.

Mac App Store: fora desta fase. A decisão D2 está em `docs/lojas/app-store.md` (DMG só, fora da loja).

### 4.4 Linux: opções

| # | Opção | Custo | Requisitos (texto lido) | Esforço | Veredito |
|---|---|---|---|---|---|
| L1 | `.deb` e `.AppImage` sem assinatura | Zero | "artifact signing is not required for your application to be deployed on Linux" [T6] | Nenhum | **Manter como está** |
| L2 | `.AppImage` assinado com GPG | Zero, mas exige chave GPG | `SIGN=1` e `SIGN_KEY` opcional [T6]. O AppImage não valida a assinatura, e o usuário verifica à mão [T6] | Baixo | **Adiar.** Ganho pequeno para o usuário comum |
| L3 | **Flathub** | Nenhuma taxa citada [FH] | "All content hosted on Flathub must allow legal redistribution" [FH]. A página não diz se software proprietário é aceito; cita "Exceptions may be granted to well-known vendors on a case-by-case basis" [FH]. App ID no formato `{tld}.{vendor}.{product}`, com controle do domínio verificável em HTTPS [FH] | Médio | **Adiar.** Não há caminho claro para software proprietário |
| L4 | RPM, Snap, AUR | — | — | — | [NÃO AVALIADO] |

---

## 5. Segredos no GitHub Actions: passo a passo

### 5.1 Pré-requisitos (dono)

1. Conta Apple Developer ativa, com o dono como Account Holder [AP3].
2. Certificado Developer ID Application exportado como `.p12`, com senha.
3. Chave da App Store Connect API: Issuer ID, Key ID e arquivo `.p8` [T3].
4. Par de chaves do updater (seção 7) [PLANEJADO].
5. Windows: decisão da seção 4.2. Sem decisão, Windows fica sem assinatura.

### 5.2 Ambiente de deploy

Criar um **Environment** chamado `release` no repositório. A documentação do GitHub só cita o assunto "Managing environments for deployment" [G1]; o caminho exato no menu não foi conferido [incerto].

- Colocar os segredos no ambiente, não no nível do repositório [recomendação].
- Restringir o ambiente a tags `v*` e definir revisores [recomendação; regras não conferidas em fonte aberta].
- Segredos não são passados a workflows disparados por fork [G1]. Esta proteção não impede um disparo manual a partir de branch com acesso.

### 5.3 Segredos

| Segredo | Conteúdo | Usado por |
|---|---|---|
| `APPLE_CERTIFICATE` | `.p12` em base64 (conteúdo do arquivo de texto gerado) | Tauri, macOS [T3] |
| `APPLE_CERTIFICATE_PASSWORD` | Senha do `.p12` | Tauri, macOS [T3] |
| `APPLE_SIGNING_IDENTITY` | Ex.: `Developer ID Application: NOME DA EMPRESA (TEAMID)` | Tauri, macOS [T3] |
| `APPLE_API_ISSUER` | Issuer ID da App Store Connect | Notarização por chave de API [T3] |
| `APPLE_API_KEY` | Key ID | Notarização por chave de API [T3] |
| `APPLE_API_KEY_P8` | Conteúdo do `.p8`. O workflow grava em arquivo temporário | Nome deste guia [recomendação] |
| `TAURI_SIGNING_PRIVATE_KEY` | Conteúdo da chave privada do updater | Assinatura dos artefatos de atualização [T4] |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Senha da chave, se houver | [T4] |

**Não são segredos:** `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`. A documentação do projeto diz que a chave publicável é pública por desenho (`docs/ARQUITETURA.md`). Usar variáveis do repositório ou do ambiente, não segredos [recomendação; a sintaxe `vars.` não foi conferida em fonte aberta]. Nunca colocar valor em `.env` versionado.

### 5.4 Ordem de execução

1. **Gerar a chave do updater fora do repositório:** `npm run tauri signer generate -- -w ~/.tauri/workeasy.key` [T4]. Guardar o arquivo em dois lugares seguros, fora do computador de trabalho [recomendação]. A página diz: "if you lose this key you will NOT be able to publish new updates to the users that have the app already installed" [T4].
2. **Copiar a chave pública** para `plugins.updater.pubkey` depois de adicionar o plugin. A página diz que tem de ser o conteúdo, não um caminho [T4] [PLANEJADO].
3. **Gerar o base64 do `.p12`** com um comando de shell (`base64 -i DeveloperID.p12 -o certificate-base64.txt`, com o nome de arquivo usado pela Tauri [T3]). O comando não foi copiado de fonte aberta [incerto].
4. **Cadastrar os segredos** no ambiente `release`, pela interface ou pela CLI `gh` [incerto: flags não conferidas]. Nunca colar segredo em chat, issue ou arquivo versionado.
5. **Testar só o macOS** com `workflow_dispatch` antes de qualquer tag. O workflow todo gasta minutos de runner, e o repositório é privado [AGENTS.md]. Não criar pull request só para testar CI, conforme `AGENTS.md`.
6. **Conferir a assinatura** do `.app` e do `.dmg` com as ferramentas da Apple [incerto: comandos não conferidos em fonte aberta].

---

## 6. Patch do workflow (proposto, não aplicado)

Este bloco **não edita** `.github/workflows/web-release.yml`. Aplicar só por decisão do dono, em branch própria. Antes de editar, conferir se o arquivo consta na lista `LOCKED_WORKFLOW_MAPPING_SHA256` do validador de workflows: `AGENTS.md` e `CLAUDE.md` tratam de gates confiáveis, mas não citam este arquivo [incerto].

**A. Assinatura e notarização do macOS e chave do updater**

```diff
--- a/.github/workflows/web-release.yml
+++ b/.github/workflows/web-release.yml
@@ jobs.macos-ios
   macos-ios:
     name: macOS, iOS
     runs-on: macos-latest
     timeout-minutes: 60
+    environment: release
     steps:
@@
+      - name: Chave de notarização em arquivo temporário
+        env:
+          APPLE_API_KEY_P8: ${{ secrets.APPLE_API_KEY_P8 }}
+        run: printf '%s' "$APPLE_API_KEY_P8" > "${{ runner.temp }}/AuthKey.p8"
+
       - name: macOS desktop (dmg)
+        env:
+          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
+          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
+          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
+          APPLE_API_ISSUER: ${{ secrets.APPLE_API_ISSUER }}
+          APPLE_API_KEY: ${{ secrets.APPLE_API_KEY }}
+          APPLE_API_KEY_PATH: ${{ runner.temp }}/AuthKey.p8
+          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
+          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
         run: npx tauri build --bundles app,dmg
```

Notas da parte A:

- As variáveis `APPLE_*` seguem a página da Tauri [T3]. O exemplo de CI da página também usa um passo de chaveiro com `KEYCHAIN_PASSWORD`. Esse passo não foi copiado aqui. Se o build não encontrar a identidade de assinatura, incluí-lo [incerto].
- `environment: release` faz o job ler os segredos do ambiente. Como o mesmo job compila iOS, o iOS também passa a receber esses segredos. Separar em job próprio se isso incomodar [recomendação].

**B. Windows: espaço reservado**

```diff
@@ jobs.windows
       - name: Windows desktop (msi, exe)
+        # PLACEHOLDER: se o comando de assinatura do Windows precisar de variáveis
+        # (seção 4.2), declarar aqui com `env:` e segredos próprios do provedor.
         run: npx tauri build --bundles msi,nsis
```

A assinatura do Windows entra por configuração, não pelo workflow (bloco abaixo). Por isso o job não precisa de mudança além do espaço reservado.

**C. Job de release em rascunho [PLANEJADO]**

```diff
+  release:
+    name: Release em rascunho
+    needs: [linux-web-android, windows, macos-ios]
+    if: startsWith(github.ref, 'refs/tags/v')
+    runs-on: ubuntu-22.04
+    timeout-minutes: 15
+    environment: release
+    permissions:
+      contents: write
+    steps:
+      - uses: actions/download-artifact@v4
+        with:
+          pattern: workeasy-*     # [incerto: parâmetros não conferidos]
+          path: release/
+          merge-multiple: true
+      # PLANEJADO: gerar latest.json com a versão, as URLs e o conteúdo de cada .sig
+      - name: Criar release em rascunho
+        env:
+          GH_TOKEN: ${{ github.token }}
+        run: gh release create "$GITHUB_REF_NAME" --draft --title "WorkEasy $GITHUB_REF_NAME" release/*   # [incerto: flags]
```

Notas da parte C:

- O bloco de topo `permissions: contents: read` continua valendo para os outros jobs. Só este job recebe escrita.
- Rascunho não aparece para quem não tem acesso. A publicação é manual, depois de conferir os instaladores [recomendação].

**D. Configuração em `src-tauri/tauri.conf.json` (não é workflow)**

```json
"bundle": {
  "createUpdaterArtifacts": true,
  "windows": {
    "signCommand": "PLACEHOLDER-COMANDO-DO-PROVEDOR %1",
    "digestAlgorithm": "sha256",
    "timestampUrl": "PLACEHOLDER-URL-DE-CARIMBO"
  }
},
"plugins": {
  "updater": {
    "pubkey": "PLACEHOLDER-CONTEUDO-DA-CHAVE-PUBLICA",
    "endpoints": ["PLACEHOLDER-URL-HTTPS-DO-LATEST-JSON"]
  }
}
```

- Os nomes das chaves vêm de [T2] (`signCommand`, `digestAlgorithm`, `timestampUrl`, em `bundle.windows`), de [T4] (`pubkey`, `endpoints`) e de [T4] (`createUpdaterArtifacts`). A página lida mostrou só a linha de `createUpdaterArtifacts`; o bloco pai está como [incerto].
- `%1` é o marcador do arquivo a assinar nos exemplos da Tauri [T2].
- Só o `signCommand` depende do provedor escolhido. Não existe valor pronto.

---

## 7. Atualização automática (design)

### 7.1 Situação

Nenhum app instalado se atualiza hoje. Não há plugin nem chave. Adicionar o plugin é dependência Rust nova, e `docs/arquitetura/nativo.md` exige aprovação do dono para isso.

### 7.2 Chaves

- A assinatura dos pacotes de atualização "cannot be disabled" [T4].
- A chave pública vai no config como **conteúdo**. A chave privada vai no ambiente. Arquivo `.env` não funciona para isso [T4].
- Chave perdida: sem novas atualizações para quem já instalou [T4]. Por isso o backup é pré-requisito, não opcional.

### 7.3 Endpoint

- Formato: JSON estático. Chaves de plataforma no formato `OS-ARCH` (`windows-x86_64`, `linux-x86_64`, `darwin-aarch64`, `darwin-x86_64` e outras) [T4]. Campos obrigatórios: `version`, `platforms.[target].url` e `platforms.[target].signature`. A assinatura é o conteúdo do arquivo `.sig`, não um caminho nem uma URL [T4].
- Transporte: em produção, o TLS é obrigatório [T4]. Não usar `dangerousInsecureTransportProtocol` [T4].

Exemplo com marcadores (os valores são de exemplo):

```json
{
  "version": "0.1.1",
  "notes": "Texto curto em português sobre a mudança.",
  "pub_date": "2026-11-20T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<conteúdo do .sig do instalador Windows>",
      "url": "https://<host-publico>/<caminho>/<instalador-windows>"
    },
    "linux-x86_64": {
      "signature": "<conteúdo do .sig do AppImage>",
      "url": "https://<host-publico>/<caminho>/<arquivo>.AppImage"
    }
  }
}
```

Onde hospedar:

- **Opção A, GitHub Releases:** `https://github.com/<dono>/<repo>/releases/latest/download/latest.json` [G2]. O padrão de URL foi confirmado. Sem marcação manual, o rótulo de "latest" segue a versão semântica [G4]. Pré-release existe como opção [G4]. **Risco:** `AGENTS.md` diz que o repositório é privado. Não verifiquei se ativos de release de repositório privado podem ser baixados sem login [incerto]. Testar antes de escolher.
- **Opção B, host público próprio:** [PLANEJADO]. O domínio de produção não está confirmado (`docs/lojas/app-store.md` cita o mesmo ponto) [incerto].

Recomendação: testar a Opção A. Se exigir login, usar a Opção B.

### 7.4 Instalação no Windows

O `installMode` padrão é `passive`, com uma barra de progresso. Existem `basicUi` e `quiet`. A página diz que `passive` é o recomendado [T4].

### 7.5 Reversão (rollback)

- A página diz que, por padrão, o updater só instala versão maior que a atual. Diz também que é possível instalar a versão enviada pelo servidor, o que serviria para reverter. O mecanismo não está detalhado no trecho lido [incerto] [T4].
- **Recomendação:** reversão para frente. Publicar uma versão maior, por exemplo `0.1.3`, com o código da `0.1.1`. Nunca apagar ativos antigos nem os `.sig`. Nunca reapontar `latest.json` para uma versão menor antes de testar o comparador em máquina real [recomendação].
- **Rotação de chave:** trocar a chave pública exige uma versão que traga a chave nova, assinada pela chave antiga. Esse mecanismo não foi confirmado em fonte aberta [incerto] [recomendação].

### 7.6 Pré-requisitos para ligar o updater

- [ ] Plugin adicionado com aprovação do dono (dependência Rust nova).
- [ ] Chave gerada, com backup em dois lugares, e segredos cadastrados.
- [ ] Endpoint HTTPS testado sem login (seção 7.3).
- [ ] Teste de ponta: instalar `0.1.0`, publicar `0.1.1`, ver a atualização em Windows, macOS e Linux.
- [ ] Teste de reversão: publicar versão maior com código antigo e ver o resultado.
- [ ] Textos das notas de versão em português, sem alegação de prazo ou de segurança.

---

## 8. Revisão de privilégio mínimo: capacidades e CSP

### 8.1 Estado atual

| Item | Estado (arquivo) | Risco | Ação |
|---|---|---|---|
| `capabilities/default.json`: `permissions: []` | Nenhuma permissão. Nenhum comando nativo exposto (`lib.rs`) | Baixo | **Manter** até existir a primeira chamada nativa. A Tauri recomenda dar a cada janela só o que ela usa [T9] |
| `windows: ["main"]` | Uma janela, rótulo explícito | Baixo | Manter. Janela nova ganha capacidade própria [T9] |
| `connect-src` com `https://*.supabase.co wss://*.supabase.co` | Qualquer projeto Supabase é aceito pela CSP | Médio: a página aceita destino amplo | Restringir ao host de produção (ação 2) |
| `media-src ... mediastream:` | Câmera só usada pela rota de demonstração `/verification` | Médio: permissão sem uso real | Remover junto com a rota (ação 3) |
| `img-src 'self' data: blob:` | Documentos por URL temporária abrem em `<a target="_blank">`, não em imagem | Baixo | **Manter**; não precisa de Supabase |
| `style-src 'self' 'unsafe-inline'` | React e Tailwind aplicam estilos inline [docs/arquitetura/nativo.md] | Baixo | **Manter**; não mexer agora |
| `script-src 'self'` na release | Sem CDN nem script remoto. A Tauri injeta hashes e nonces em tempo de compilação [T10] | Baixo | **Manter**. A página recomenda evitar CDN [T10] |
| `devCsp` | Tem `'unsafe-inline'` e `localhost` | Baixo, só em dev | Conferir que o artefato de release usa só `csp` (ação 6) |
| `devtools: false`, sem feature `devtools` | Inspetor desligado | Baixo | **Manter** |
| `Info.plist`: `NSCameraUsageDescription` | Texto diz que a câmera serve à prévia de verificação | Médio: texto de permissão para função demonstrativa | Remover do build nativo (ação 3) |
| `Info.plist`: `NSLocationWhenInUseUsageDescription` | Texto de plantão de cuidado | Médio: permissão sem uso no desktop | Remover do build de desktop se o desktop não tiver check-in (ação 4) |
| Links externos com `window.open` | Sem plugin de abertura de URL | Funcional: pode não abrir o navegador do sistema | Testar; se falhar, adicionar o plugin (ação 1) |

### 8.2 Ações, por ordem de prioridade

1. **Links externos.** Se o teste mostrar que `window.open` não abre o navegador do sistema, adicionar `tauri-plugin-opener` e conceder **somente** `opener:allow-open-url`. A página diz que "all potentially dangerous plugin commands and scopes are blocked" por padrão [T8]. Não conceder permissão mais ampla. A dependência é nova e pede aprovação [docs/arquitetura/nativo.md].
2. **Restringir `connect-src`** ao host de produção (`https://<ref>.supabase.co` e `wss://<ref>.supabase.co`). O `tauri.conf.json` é estático. Exige um passo de build que escreva o host a partir de `VITE_SUPABASE_URL` [recomendação; mecanismo a definir].
3. **Tirar a câmera do desktop:** remover `/verification` do build nativo, remover `mediastream:` da CSP de release e remover `NSCameraUsageDescription`, até existir um fluxo real. O próprio arquivo diz que é "Demo-only" [repositório].
4. **Tirar a localização do desktop** se o desktop não tiver check-in de plantão. Remover `NSLocationWhenInUseUsageDescription` do build de desktop [recomendação].
5. **Manter** `script-src 'self'` sem CDN e `devtools: false`. Não ligar a feature `devtools` nos builds de release.
6. **Conferir o artefato:** o build de release deve usar `csp`, não `devCsp`. Verificar no instalador gerado, não só no arquivo de configuração [recomendação; teste].

Observação sobre o Info.plist: `docs/lojas/app-store.md` (seção 10.2) classifica o texto da câmera como "Falsa" porque o cadastro usaria a mesma tela. A leitura do código acima não confirma isso: o cadastro usa seletor de arquivos, não `getUserMedia`. As duas leituras precisam ser alinhadas antes do envio [DECISÃO DO DONO].

---

## 9. Papel do desktop no negócio

### 9.1 Fatos

- O desktop é o mesmo bundle da web, gerado com `--mode native` e com rotas por hash (`VITE_ROUTER`). Não encontrei funcionalidade exclusiva do desktop no código lido.
- As rotas do prestador (`/pro/*`) e do admin (`/admin/*`) já existem na web (`docs/ARQUITETURA.md`, "Rotas novas").
- Notificação web push não está implementada: `PUSH_NOTIFICATIONS_IMPLEMENTED` é `false` (`docs/arquitetura/nativo.md`).
- O site já é PWA: `vite-plugin-pwa` está em `package.json` e existe `pwa.config.ts` [repositório]. Se o PWA é instalável no computador do prestador, não foi testado nesta rodada [incerto].

### 9.2 Balcão do prestador

O que um app de desktop traria (janela própria, ícone, notificações nativas) não existe hoje. Manter três sistemas, assinatura e atualização custa mais do que o ganho atual.

**Decisão:** o balcão do prestador não é canal de entrada. Usar a web (PWA, se instalável). Reavaliar quando houver demanda medida, por exemplo prestadores pedindo notificação que a web não entrega.

### 9.3 Console admin

O admin concentra disputas, pagamentos e pedidos de dados (`docs/ARQUITETURA.md`, `/admin/*`). Um instalador a mais aumenta a superfície e cria um caminho de atualização para dados sensíveis.

**Decisão:** admin só pela web, sem desktop no MVP. [recomendação]

---

## 10. Decisão por canal e gatilhos

| Canal | Decisão | Motivo | Gatilho para revisar |
|---|---|---|---|
| Site (PWA) | **Lançar.** É o canal principal | Já existe; não depende de assinatura de sistema | — |
| Download direto Windows (`.msi`/`.exe`) e Linux (`.deb`/`.AppImage`), só para testadores | **Lançar para testadores**, depois do backend no ar, com o aviso da seção 3 | Sem custo de assinatura; testadores aceitam o aviso | Primeiro prestador real ou primeiro pedido de instalação público |
| Download direto macOS (`.dmg`) | **Adiar** | US$ 99 por ano e notarização; sem usuário macOS medido | Primeiro usuário macOS ou decisão de contratar a Apple |
| Microsoft Store | **Adiar.** Preparar a conta quando houver empresa constituída | Exige DUNS ou documentos de empresa e instalador silencioso; não confirmei se a Store assina o pacote | Após o primeiro ciclo de testes e com empresa constituída [DECISÃO DO DONO] [CONDICIONAL: depende de parecer] |
| Azure Artifact Signing | **Não usar** | Brasil fora da lista do texto lido [AZ1] | Se a Microsoft ampliar a lista |
| Flathub | **Adiar** | Software proprietário sem caminho claro [FH]; domínio precisa ser controlado | Se o dono decidir abrir parte do código |
| RPM, Snap, AUR | [NÃO AVALIADO] | Não lidos nesta rodada | Quando houver usuário pedindo |
| Atualização automática | **Adiar** para a segunda versão distribuída. Gerar e guardar a chave antes do primeiro lançamento público | Chave perdida impede atualizar quem já instalou | Segunda versão pronta |
| Desktop para admin | **Não** no MVP | Superfície de ataque e manutenção sobre dados sensíveis | Só se a equipe crescer e houver necessidade medida |

Checklist antes de qualquer distribuição desktop:

- [ ] Backend no ar e build com `VITE_SUPABASE_URL` de produção. Sem isso o instalador é demonstração.
- [ ] Aviso de instalação da seção 3 na página de download, na versão do sistema correspondente.
- [ ] Termos e política de privacidade publicados e acessíveis pelo app. Os textos em `docs/juridico/` ainda são minutas [CONDICIONAL: depende de parecer].
- [ ] Capacidades e CSP da seção 8 aplicadas e conferidas no instalador.
- [ ] Teste em Windows, macOS e Linux: a janela abre, o login por código funciona e os links externos abrem o navegador.
- [ ] Chave do updater guardada em dois lugares.
- [ ] Editor e direitos autorais iguais ao titular escolhido [DECISÃO DO DONO].
- [ ] Textos sem "seguro", "verificado", "imediatamente" nem prazos inventados (`test/claims-guard.test.ts` e as regras do projeto).

---

## 11. Custos resumidos (só o que foi aberto)

| Item | Valor | Fonte | Situação |
|---|---|---|---|
| Apple Developer Program | US$ 99 por ano | [AP1] | Aberto |
| Microsoft Store, cadastro | Sem taxa de registro no fluxo novo | [MS3] | Aberto |
| Azure Artifact Signing | Plano Basic: 5.000 assinaturas por mês incluídas | [AZ2] | Preço mensal não extraído [incerto] |
| Certificado OV ou EV | Não obtido | [SSL] | [incerto] |
| Flathub | Nenhuma taxa citada | [FH] | Aberto |
| Assinatura de AppImage | Chave GPG própria | [T6] | Aberto |

---

## 12. Problemas encontrados (não corrigidos)

1. **Documentação do workflow desatualizada.** `docs/DECISOES.md` (linhas 90 e 91) cita `release.yml`, "Release builds", com gatilho de pull request. O arquivo real é `web-release.yml`, sem gatilho de pull request.
2. **Comentário enganoso no workflow.** O topo de `web-release.yml` (linhas 3 a 6) diz que há disparo em pull request que muda o empacotamento. O bloco `on:` não tem isso.
3. **Instaladores de CI em modo demonstração.** O workflow não passa `VITE_SUPABASE_URL`. Qualquer instalador baixado do CI mostra dados fictícios.
4. **Nada é publicado.** Artefatos expiram em 7 dias e não há release. Não existe canal durável de distribuição.
5. **Modo de macOS.** `docs/DECISOES.md` (linha 91) cita menu de contexto. A página da Apple lida descreve Privacy & Security > Open Anyway [AP2].
6. **Texto de câmera no Info.plist.** O texto diz que a câmera serve só à prévia de verificação. A rota `/verification` (linhas 29 e 49 de `pages/prototype/routes.tsx`) está declarada duas vezes; não investiguei qual vale no build nativo [incerto]. O cadastro usa seletor de arquivos. `docs/lojas/app-store.md` classifica o texto como falso por outro motivo. As leituras precisam ser alinhadas.
7. **Permissão de localização sem uso no desktop.** `NSLocationWhenInUseUsageDescription` serve ao plantão de cuidado, que não é escopo do desktop.
8. **CSP com host amplo.** `connect-src` aceita qualquer `*.supabase.co`, não só o projeto do produto.
9. **Links externos sem teste no Tauri.** `window.open` em `platform/external.ts` e `<a target="_blank">` em `DocumentCard.tsx` não foram confirmados no desktop. `docs/arquitetura/nativo.md` já marca isso como "A verificar".
10. **Dependências apt do Linux diferentes da página da Tauri.** O workflow instala `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev` e `patchelf`. A página de pré-requisitos lista também `libxdo-dev`, `libssl-dev`, `build-essential`, `curl`, `wget` e `file` [T7]. `patchelf` não aparece na página. Se o runner de ubuntu-22.04 não trouxer os pacotes faltantes, o job falha. Conferir o último log antes de mudar [incerto].
11. **Testes só no Linux.** Só o job `linux-web-android` roda `npm test`. Windows e macOS compilam sem testes.
12. **Titular e editor.** `bundle.copyright` cita pessoa física; `bundle.publisher` é "WorkEasy". Lojas exigem alinhamento com o titular escolhido [DECISÃO DO DONO].
13. **Repositório privado e updater.** O endpoint de atualização precisa ser público. Se o repositório for privado, a Opção A da seção 7.3 pode não funcionar. Testar antes de escolher.

---

## 13. O que não foi verificado nesta rodada

- **Busca na web indisponível.** O limite de buscas do turno foi atingido. Nada foi pesquisado além das páginas listadas na seção 14.
- **Nenhum build rodado.** Não executei `tauri build` nem abri os instaladores em sistema nenhum. Nada aqui é teste de funcionamento.
- **Preços não obtidos:** Azure Artifact Signing (mensal), certificados OV e EV, e o valor da Apple em reais.
- **Textos e comportamentos não confirmados:** texto exato do aviso do SmartScreen; nomes dos menus em português no macOS; Gatekeeper nas versões mais novas do macOS; atalho Control-clique; comportamento de `window.open` no Tauri; comparador de versão do updater; regras de revisores e de branches nos ambientes do GitHub; acesso a release de repositório privado; regra da Microsoft Store sobre atualização automática; assinatura de `.deb`.
- **Não avaliados:** RPM, Snap, AUR.
- **Permissão de geolocalização e notificações no WebView** do desktop: não testado.

---

## 14. Fontes (todas abertas em 08/11/2026)

**Tauri 2 (documentação oficial)**

- **[T1]** https://v2.tauri.app/distribute/ — visão geral de distribuição. Lido: "Most platforms requires code signing"; "distributing outside the App Store also requires notarization".
- **[T2]** https://v2.tauri.app/distribute/sign/windows/ — assinatura no Windows. Data exibida na página: 27/10/2026. Lido: chaves `signCommand`, `digestAlgorithm`, `timestampUrl` em `bundle.windows`; guia de OV só para certificados antes de 1º de junho de 2023; sobre reputação do SmartScreen.
- **[T3]** https://v2.tauri.app/distribute/sign/macos/ — assinatura e notarização no macOS. Lido: variáveis `APPLE_*`; "Notarization is required when using a Developer ID Application certificate".
- **[T4]** https://v2.tauri.app/plugin/updater/ — atualização. Lido: `tauri signer generate`; `pubkey` como conteúdo; `endpoints`; formato estático; `OS-ARCH`; "cannot be disabled"; perda da chave; `installMode` padrão `passive`; `createUpdaterArtifacts`.
- **[T5]** https://v2.tauri.app/distribute/microsoft-store/ — Microsoft Store. Lido: "Currently Tauri only generates EXE and MSI installers"; instalador silencioso com `/S`; "offline, handle auto-updates and be code signed".
- **[T6]** https://v2.tauri.app/distribute/sign/linux/ — assinatura no Linux. Lido: "artifact signing is not required"; `SIGN`, `SIGN_KEY`; "AppImage does not validate the signature".
- **[T7]** https://v2.tauri.app/start/prerequisites/ — pré-requisitos. Lido: lista de pacotes do Debian e Ubuntu.
- **[T8]** https://v2.tauri.app/plugin/opener/ — plugin de abertura. Lido: `openUrl`, `tauri-plugin-opener`, permissão `opener:allow-open-url`, bloqueio por padrão.
- **[T9]** https://v2.tauri.app/security/capabilities/ — capacidades. Lido: definição por rótulo de janela; recomendação de privilégio mínimo.
- **[T10]** https://v2.tauri.app/security/csp/ — CSP. Lido: hashes e nonces em tempo de compilação; evitar CDN.

**Azure e Microsoft**

- **[AZ1]** https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart — elegibilidade. Data: ms.date 21/05/2026; atualizado em 08/10/2026. Lido: lista de países para Public Trust; indivíduos só EUA e Canadá; regiões incluindo "Brazil South".
- **[AZ2]** https://azure.microsoft.com/en-us/pricing/details/artifact-signing/ — preços. Lido: 5.000 e 100.000 assinaturas incluídas; BRL só referência, IOF, "An eNF will not be issued". Preço mensal não extraído.
- **[MS1]** https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/ — SmartScreen. Data: ms.date 23/04/2026. Lido: reputação e aviso para arquivo sem reputação.
- **[MS2]** https://support.microsoft.com/en-us/topic/what-is-smart-app-control-285ea03d-fa88-4d56-882e-6698afdb7003 — Smart App Control. Sem data na página. Lido: app sem assinatura é "untrusted"; ligar e desligar; Windows 11.
- **[MS3]** https://learn.microsoft.com/en-us/windows/apps/publish/partner-center/open-a-developer-account — conta de desenvolvedor. Data: ms.date 29/10/2026. Lido: sem taxa de registro no fluxo novo; individual x empresa; DUNS; revisão manual de 2 a 5 dias.

**Apple**

- **[AP1]** https://developer.apple.com/programs/ — programa. Lido: "$99 annual membership" (USD); inscrição como indivíduo ou organização.
- **[AP2]** https://support.apple.com/en-us/102445 — abrir app de desenvolvedor não identificado. Lido: "Open Anyway" após a primeira tentativa; "By default, macOS Catalina and later also requires software to be notarized". Não cita menu de contexto nem Sequoia.
- **[AP3]** https://developer.apple.com/support/developer-id/ e https://developer.apple.com/developer-id/ — Developer ID. Lido: Account Holder; até cinco certificados Developer ID Application; notarização apresentada como opção que "gives people even more confidence".
- **[AP4]** https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution — **só o título foi obtido**. Não usada para afirmações.

**Outros fornecedores e padrões**

- **[SSL]** https://www.ssl.com/code-signing/ — tipos de certificado. Lido: IV, OV e EV; token FIPS 140-2 ou HSM; "Business entity required"; EV Sole Proprietor; "EV and OV are treated equally since March 2024". Preços não extraídos.
- **[FH]** https://docs.flathub.org/docs/for-app-authors/requirements — requisitos do Flathub. Lido: redistribuição legal; exceções para fornecedores conhecidos; ID de app e controle de domínio. Sem taxa citada.

**GitHub**

- **[G1]** https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions — segredos. Lido: não são passados a workflows de fork; limite de 48 KB. Não encontrei a recomendação de revisores.
- **[G2]** https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases — links de release. Lido: `/releases/latest/download/<nome>`.
- **[G3]** https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication — token. Lido: "grant the GITHUB_TOKEN the least required access". Não encontrei o padrão de permissão de forks.
- **[G4]** https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository — gerenciar releases. Lido: rascunho antes de publicar; pré-release; rótulo "latest" pela versão semântica se não marcado. Nada sobre acesso a release de repositório privado.

**Outras**

- **[AI1]** https://docs.appimage.org/user-guide/run-appimages.html — AppImage. Lido: "just download them, make them executable and run them"; não precisa de instalação.
- **[VI]** https://vite.dev/guide/env-and-mode — modos do Vite. Lido: `.env.[mode]`; só `VITE_` vai ao cliente.

**Repositório (lidos nesta rodada)**

`docs/ARQUITETURA.md`; `docs/DECISOES.md`; `docs/arquitetura/nativo.md`; `docs/lojas/app-store.md` (só seções 10 e 12); `README.md`; `src-tauri/tauri.conf.json`; `src-tauri/Cargo.toml`; `src-tauri/Info.plist`; `src-tauri/src/lib.rs`; `src-tauri/capabilities/default.json`; `.github/workflows/web-release.yml`; `package.json`; `.env.native`; `.env.example`; `lib/supabase.ts`; `platform/external.ts`; `components/admin/DocumentCard.tsx`; `services/admin.ts`; `pages/Verification.tsx`; `pages/prototype/routes.tsx`; `pages/pro/Cadastro.tsx`; `vite.config.ts`; `AGENTS.md`.
