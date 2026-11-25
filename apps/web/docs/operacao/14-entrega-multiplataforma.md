# Entrega multiplataforma do WorkEasy

Registro de 25/11/2026. Base auditada `be246506cea810184d4b4e0c5a6526bd1af18a48`. O produto usa React/Vite, Capacitor e Tauri em `apps/web`. Os protótipos Expo, Web Prefeitura e FastAPI permanecem em suas pastas.

## Situação da entrega em 25/11/2026

| Plataforma | Versão/arquitetura | Pacote disponível | Backend validado | Assinatura/canal | Instalação e testes | Link | Pendência |
|---|---|---|---|---|---|---|---|
| Android | 1.0 (1) · debug | APK debug no Actions | BLOQUEADO no app instalado | Distribuição de produção pendente | BLOQUEADO para APK release e AAB | [APK de desenvolvimento](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45521105565/artifacts/14980381808) | Verificar a identidade no Play, obter a chave de assinatura autorizada e testar APK e AAB no canal interno. |
| iOS/iPadOS | 1.0 (1) · simulador arm64 e x86_64 | App de simulador no Actions | BLOQUEADO em aparelho | TestFlight pendente | PASSOU inspeção do binário e do `Info.plist`. BLOQUEADO em iPhone e iPad. | [App de simulador](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45521105565/artifacts/14980151772) | Confirmar Team ID e provisionamento, exportar IPA assinada e testar em aparelhos pelo TestFlight. |
| Windows | 0.1.0 · x64 | EXE e MSI no Actions | BLOQUEADO no pacote de produção | Authenticode `NotSigned` | PASSOU instalação limpa, abertura e remoção dos dois formatos no Windows Server 2025 x64. A janela apareceu em 275 ms no MSI e 277 ms no EXE. | [Instaladores de verificação](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45681999670/artifacts/15055366885) | Assinatura, atualização e ensaio autenticado com o pacote final. |
| macOS | 0.1.0 · arm64 e x86_64 | DMG universal no Actions | BLOQUEADO no pacote de produção | Developer ID e notarização pendentes | PASSOU inspeção das duas arquiteturas no DMG. BLOQUEADO para execução nativa em ambas. | [DMG de verificação](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45670330059/artifacts/15048584888) | Assinar, notarizar e testar em Macs Apple Silicon e Intel. |
| Linux | 0.1.0 · amd64 | DEB e AppImage no Actions | BLOQUEADO no pacote de produção | Canal durável pendente | PASSOU instalação e remoção do DEB em Ubuntu 22.04.5 x64. AppImage abriu após extração. FUSE e atualização continuam pendentes. | [Pacotes de verificação](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45521105565/artifacts/14981470922) | Gerar o candidato de produção e validar os pacotes finais no ambiente suportado. |
| Web/PWA | Navegador Chromium · viewport de 390 px | Build local | PASSOU catálogo público no Supabase de produção. FALHOU o ensaio de login por código. | Deploy HTTPS pendente | PASSOU diagnóstico de instalabilidade, ativação do service worker e teste local offline/reconexão | [Execução de correção do login](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45670522755) | Aplicar os modelos de e-mail, validar login em conta controlada e confirmar projeto e origem canônica do Pages. |

Os arquivos com hash confirmado abaixo são artefatos temporários de verificação. As execuções usam revisões diferentes e ainda não há uma GitHub Release disponível.

| Arquivo | Commit | SHA-256 |
|---|---|---|
| APK debug Android | `d0c4502da25ed2a8b4d2c9e1d8d9afd399ee8ea3` | `5a8438ce0b1c12acb770251ad1e3eec62e0abce031ae65c3b621d4d5ec6a3574` |
| ZIP iOS de simulador | `d0c4502da25ed2a8b4d2c9e1d8d9afd399ee8ea3` | `1bf1dbcb09561e30d97fab148fcb99cdfc51b070d1be4d4a7edd8f0320c15363` |
| MSI Windows x64 | `edffc626ba2dad693e4271c6a19f8d58b7806715` | `bac3f520c9046e8401effdf88245a3caa1bf8851230e0d11f8eded74ffa58c3c` |
| EXE Windows x64 | `edffc626ba2dad693e4271c6a19f8d58b7806715` | `e28d4cba45995596cd3c78a595813f49a350fdf98263ffe87fc039204635471a` |
| DMG macOS universal | `dd678714d912fd2d87583b683800a575d9df6fd7` | `41a966e75ef7a6cc972f8fea575f24db7dbf045fa7ff8dc65cc112bcaeb420e1` |

A correção de propostas valida o registro persistido quando a resposta de envio se perde. O ensaio controlado verificou a recuperação da proposta enviada, a rejeição de termos diferentes e o bloqueio de envio offline. O ensaio autenticado em produção continua pendente. [PR #36](https://github.com/drguilhermecapel/Work-Easy/pull/36)

As auditorias npm da aplicação web e do Wrangler retornaram zero alertas. A consulta OSV do `Cargo.lock` encontrou um aviso sobre `glib::VariantStrIter` na dependência transitiva `glib` 0.18.5 do Linux. A correção está em `glib` 0.20.0 e a versão estável do Tauri consultada ainda depende de GTK 0.18. A busca por `VariantStrIter` e `array_iter_str` no código Rust do aplicativo e dos 19 crates travados que dependem direta ou indiretamente de `glib` não encontrou referências. O ensaio com o pacote Linux final continua pendente. OSV também indica ausência de manutenção em `chrono` e `proc-macro-error`. [Aviso de `glib`](https://osv.dev/vulnerability/GHSA-wrw7-89jp-8q8g)

O revisor aprovou a execução dos modelos de e-mail. O primeiro GET da configuração Auth retornou HTTP 403 antes de qualquer escrita. Os jobs de modelos e de publicação web aceitam o secret opcional `SUPABASE_AUTH_CONFIG_TOKEN` no ambiente `production` e usam `SUPABASE_ACCESS_TOKEN` quando ele está ausente. Configure uma credencial de gerenciamento existente com acesso ao projeto WorkEasy. A consulta usa a autorização de leitura de Auth e a aplicação dos modelos exige também atualização de Auth (escopos OAuth `auth:read` e `auth:write`). Para corrigir apenas o Auth, use `auth_templates_only`. Para corrigir o Auth e publicar o site na mesma execução protegida, selecione `sync_auth_templates` no deploy Pages da `main`. O script relê a configuração após aplicar qualquer diferença. Confirme depois a chegada do código e a sessão em uma conta controlada. [Execução aprovada e falha no GET](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45670522755)

## Matriz de partida

| Plataforma | Código e compilação | Pacote e assinatura | Backend no pacote | Instalação e distribuição |
|---|---|---|---|---|
| Android | Capacitor, `br.com.workeasy`, API mínima 24 e alvo 36 | APK debug da CI | Perfil de demonstração | BLOQUEADO para release. Faltam chave do proprietário, versão de loja, domínio e teste do APK e AAB. |
| iOS/iPadOS | Capacitor, `br.com.workeasy`, alvo iOS 15, famílias iPhone e iPad | App de simulador, sem assinatura de distribuição | Perfil de demonstração | BLOQUEADO. Faltam Team ID, provisionamento, aparelhos e acesso ao TestFlight. |
| Windows | Tauri, compilação x64 | EXE e MSI sem assinatura de distribuição | Perfil de demonstração | BLOQUEADO para entrega. Faltam assinatura, teste de instalação e canal durável. |
| macOS | Tauri, compilação arm64 | DMG sem Developer ID/notarização | Perfil de demonstração | BLOQUEADO. Faltam teste nativo arm64 e Intel, assinatura, notarização e canal. |
| Linux | Tauri, compilação amd64 | DEB e AppImage | Perfil de demonstração | BLOQUEADO para entrega. Faltam candidato de produção, ensaio nos sistemas alvo e canal durável. |
| Web/PWA | Vite, manifest e service worker | Bundle da CI | Perfil de demonstração | BLOQUEADO para acesso público. Nenhuma execução do workflow Pages encontrada na inspeção inicial. |

A compilação histórica e os artefatos acima pertencem à execução [45521105565](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45521105565), revisão `d0c4502da25ed2a8b4d2c9e1d8d9afd399ee8ea3`. Expiram em 01/12/2026, entre 21h52 e 22h00 de Brasília. Os hashes da API de artefatos identificam os ZIPs do Actions. A versão inicial do pacote Tauri é 0.1.0.

Windows ARM64 e Linux ARM64 ficam fora da entrega atual. A validação nativa e o suporte operacional exigiriam runners ou dispositivos próprios e demanda confirmada. O pacote macOS universal exige execução nos dois tipos de Mac, mesmo depois de aprovada a inspeção arm64/x86_64 com `lipo`.

## Backend

- PASSOU. O Supabase `hlzdgbxygtaklqaoihlq` está ativo em São Paulo. Os 109 IDs de migração e os 15 slugs ativos, incluindo a configuração de verificação JWT de cada função, correspondem ao repositório. Nenhum ambiente remoto de desenvolvimento foi encontrado na conta conectada. A stack local é o destino dos testes de integração.
- PASSOU. A execução [45656602447](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45656602447) executou o dry-run e pulou aplicação. A execução [45657389421](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45657389421) aplicou migrações e catálogo e implantou as 15 funções do commit auditado.
- PASSOU no recorte anônimo. A chave publicável foi aceita pela Data API em `platform_settings`. O endpoint público de Auth anunciou e-mail como provedor habilitado e confirmação de e-mail ativa. A consulta administrativa encontrou RLS habilitada nas tabelas do schema público e um bucket privado. A política efetiva de acesso entre usuários em produção requer testes autenticados. Comissão, custódia e abertura da linha de cuidado estão desabilitadas nas configurações remotas.
- PASSOU no preflight da função `account-export`. As origens configuradas `https://localhost`, `capacitor://localhost`, `tauri://localhost` e `http://tauri.localhost` retornaram HTTP 204 com a origem liberada. A origem `https://tauri.localhost` não foi liberada e o projeto Tauri usa o esquema HTTP padrão do WebView no Windows.
- BLOQUEADO em produção. Ainda é preciso confirmar a URL canônica e as URLs de Auth, o hook e a entrega de OTP em contas de teste, refresh e exclusão, upload e isolamento entre cliente, prestador e administrador. Asaas, WhatsApp, e-mail, IA e Sentry requerem identificação do ambiente e testes controlados. Nenhuma cobrança ou mensagem externa foi disparada.

## Ensaios executados

| Verificação | Resultado | Evidência |
|---|---|---|
| Consulta pública ao backend de produção | PASSOU | O navegador pediu `neighborhoods` e `platform_settings` ao projeto `hlzdgbxygtaklqaoihlq` e recebeu HTTP 200 nas duas chamadas. |
| Build e navegador web local | PASSOU | Chromium, viewport de 390 px, usando preview Vite em loopback e uma origem canônica de teste. Home, tela de login e pedido abriram. Manifest com quatro ícones e modo standalone, service worker ativado e zero erros de instalabilidade no diagnóstico Chromium. Um ensaio registrou DOM pronto em 559 ms e 1,4 s até o verificador detectar a Home. |
| Cabeçalhos, segredo, perfil e tamanho do bundle web | PASSOU | 13.013 arquivos HTML inspecionados. Carga inicial de 173,9 kB gzip para o limite vigente de 190 kB. Sem padrões de segredo identificados. |
| Banco e Edge Functions | PASSOU | pgTAP, integração com a stack Supabase isolada, tipos, Deno e ensaios com substitutos de serviços na CI do PR. Nenhum teste de serviços externos reais. |
| Download histórico Linux | PASSOU | ZIP da execução 45521105565 igual ao digest do Actions. DEB 0.1.0 amd64 SHA-256 `acb875048bab3de484104f8601c05449143286160b736b8648966fb29009788f`. AppImage 0.1.0 x64 SHA-256 `b004b70f0bb4ed924f424c12f6408ac74abc4ffc93958ad709d4cff23ac7ac79`. |
| Login com envio de código, sessão, logout, persistência e papéis em produção | BLOQUEADO | Ainda faltam contas de teste e configuração de domínio e Auth confirmadas. |
| PWA no domínio final, pacotes finais instalados e atualização | BLOQUEADO | Ainda faltam domínio e acesso à publicação, aprovação do ambiente, credenciais de assinatura e dispositivos dos canais. |

## Configuração e canais

No ambiente GitHub `production`, use `VITE_SUPABASE_URL` do projeto acima, a chave `sb_publishable_`, e `VITE_SITE_URL` como origem HTTPS canônica. Os workflows usam `5511997594545` para Concierge e SAC e `email` para login quando as variáveis correspondentes estão vazias. O e-mail de SAC, os dados públicos da empresa, a situação dos textos legais e o DSN Sentry são lidos da configuração existente quando definidos. Publique textos legais com status `vigente` somente após a decisão registrada pela operação.

Nos builds manuais exporte também `VITE_LOGIN_METHODS=email`, `VITE_SAC_WHATSAPP=5511997594545` e `VITE_CONCIERGE_WHATSAPP=5511997594545`. Os scripts móveis fixam o perfil de loja, roteador e SHA. Cada alteração em valores `VITE_*` requer recompilação. O perfil sem configuração continua disponível para desenvolvimento e CI de smoke. Tokens administrativos, senhas, chaves de assinatura e segredos de integrações ficam fora de `VITE_*`.

O workflow Pages preserva o destino Direct Upload existente e a aprovação do ambiente `production`. Configure o nome e ID da conta no GitHub e use o token Pages já autorizado. Os arquivos públicos de associação permanecem vazios enquanto dependerem de valores de exemplo. Associação Android exige o certificado do APK direto e o certificado de assinatura de apps do Google Play. Associação iOS exige o Team ID do proprietário e a entitlement correspondente.

A tag é `vX.Y.Z`, com a versão de `apps/web/package.json` e `tauri.conf.json`, em uma revisão integrada à `main`. A tag pede aprovação de `production` e gera uma prerelease de PWA/desktop. O manifesto registra nome, bytes, SHA-256, arquitetura, commit, ambiente e assinatura. O workflow confere de novo os arquivos baixados da prerelease e inclui o SBOM npm e o inventário de licenças declarado pelo Cargo. O deploy em HTTPS tem fluxo próprio e valida o domínio canônico ao final.

Para Android, instale as dependências travadas com `npm ci` e execute `bash scripts/android-release.sh` com `APP_VERSION_CODE`, `APP_VERSION_NAME`, SDK 36, build-tools 36.0.0 e `android/keystore.properties` da chave existente. O script confere a assinatura e lê o bundle de dentro de ambos os pacotes. Para iOS, execute `bash scripts/ios-release.sh` em macOS com o Xcode compatível com a loja, Team ID, `IOS_BUILD_NUMBER`, certificado e provisionamento válidos e o plist de exportação App Store Connect. O script confere assinatura, arm64 e configuração na IPA exportada. TestFlight e Google Play recebem os pacotes por suas contas proprietárias. Preserve a identidade do pacote e os números já utilizados.

Em 25/11/2026, o Google Play exige alvo Android 16/API 36 para novos apps e atualizações de telefone. O App Store Connect exige Xcode 26 ou superior com SDK iOS/iPadOS 26 ou superior. Essas exigências de compilação são independentes das versões mínimas dos aparelhos definidas no projeto. [Google Play](https://support.google.com/googleplay/android-developer/answer/11926878) · [Apple](https://developer.apple.com/news/upcoming-requirements/)

A função de venda Pro e a linha de cuidado são ocultadas nos perfis móveis de loja. A IA da primeira versão fica desabilitada no perfil iOS. O verificador de bundle identifica o perfil, e os testes de interface verificam o comportamento. O código dos recursos permanece no bundle. Cadastro, conta, busca, pedido, proposta, aceite, agenda, orçamento, avaliação, suporte e exclusão precisam de ensaio instalado em cada perfil. Pagamentos, upload, administração e recursos restritos precisam de papéis e configuração compatíveis com cada ensaio.

## Atualização e recuperação

- **Android e iOS.** Atualize pelo canal original com a mesma identidade, assinatura compatível e número de build crescente. Teste o APK direto e a versão distribuída pela Play separadamente. Com Play App Signing, a assinatura da versão distribuída pode ser diferente da assinatura do APK direto. O downgrade pode ser impedido pelo sistema. Publique uma correção com número maior quando precisar recuperar uma versão nas lojas.
- **Desktop.** Execute o instalador EXE/MSI ou DEB sobre a instalação anterior pelo mesmo formato e identidade, substitua o AppImage ou atualize o app no macOS pelo DMG. Compare o SHA-256 da distribuição e teste a presença de sessão e dados após reiniciar. Registre um ensaio de instalação limpa, atualização e remoção por sistema e arquitetura. Use os mecanismos normais de confiança do sistema.
- **Web/PWA.** Valide a versão depois da ativação do service worker e reabertura da PWA. Para recuperar o site, selecione um deploy anterior no Pages somente depois de verificar compatibilidade com o banco e as funções que permanecem em produção.
- **Backend.** Identifique a revisão implantada e verifique o ponto de recuperação antes de qualquer alteração. Preserve o histórico de migrações e encaminhe reparos por migração nova. A reversão do frontend não reverte o banco. Use a versão anterior de uma Edge Function apenas se a configuração e o esquema atuais forem compatíveis.

Para todos os ensaios, anote data, versão, sistema, arquitetura, dispositivo, SHA-256, ambiente, ação, duração observada e resultado PASSOU, FALHOU, BLOQUEADO ou NÃO APLICÁVEL. Para escrita e pagamentos, confira retomada após queda de rede e a ocorrência de uma única operação. Registre instalação, sessão, permissões, links, arquivos, atualização e remoção no pacote do canal.

Nenhuma despesa adicional foi autorizada ou realizada nesta fase. Certificados, contas de loja e capacidade extra dependem de confirmar o que já está contratado pelo proprietário.

## Modelos de e-mail de produção

O ensaio de 25/11/2026 recebeu no alias controlado a confirmação padrão por link. O app pede um código numérico de seis dígitos. O usuário temporário permaneceu sem sessão e foi removido após o ensaio.

O workflow Supabase tem o modo `auth_templates_only`. Selecione esse modo com `dry_run=true` para listar os campos divergentes ou com `dry_run=false` para aplicar os dois modelos versionados. Use a branch `main` e o ambiente `production`. O token de gerenciamento precisa ter acesso à leitura e atualização de Auth no projeto WorkEasy. O job limita a atualização aos assuntos e corpos de confirmação e login. Após a publicação, renove o ensaio com um alias controlado para validar o código recebido, a sessão e a remoção da conta de teste.

O deploy web verifica se os dois modelos remotos correspondem ao repositório antes de publicar. Também confirma que a origem canônica pertence ao projeto Pages, que a branch de produção é `main` e que o domínio personalizado, quando usado, está ativo. Ao final, o workflow verifica que o endereço público serve o SHA publicado em `/.well-known/workeasy-release.json` e repete as sondagens das rotas.

Em nova verificação de produção, oito agendamentos do banco estavam ativos. Os cinco de frequência subdiária tinham última execução bem-sucedida. A consulta não retornou execução para os três agendamentos diários. O cofre do projeto ainda precisa das entradas `notify_dispatch_url` e `cron_secret` para o despachante de notificações. O agendamento de `background-check-purge` também precisa de configuração antes de uso operacional.

A função Asaas retornou 503 com `webhook_not_configured` a uma sonda sem credencial e sem evento. Comissão e custódia permanecem desligadas. A validação de cobrança e reentrega no Asaas depende da configuração do ambiente e de credenciais de sandbox.

## Ensaio dos instaladores Windows

O modo manual `windows_install_smoke=true` em Web release builds usa um runner descartável Windows x64. O job gera EXE e MSI, registra SHA-256 e Authenticode e executa cada instalador em um diretório próprio. O ensaio exige a abertura de uma janela do executável instalado e a remoção desse executável após rodar o desinstalador. O tempo observado mede até a abertura da janela. Esse ensaio usa o perfil de verificação. Os testes com backend e assinatura, a atualização entre versões e o uso em máquinas dos usuários permanecem como etapas de aceitação dos pacotes finais.

## Ensaios dos pacotes móveis no Actions

O workflow de distribuição instala o APK debug em Android 15 (API 35, x86_64). A verificação procura o campo de busca dentro do WebView instalado, toca no campo, digita pelo Android, toca em Buscar e confere a rota e o título dos resultados. O ensaio repete o fluxo após encerrar o processo e verifica a remoção do pacote. O acesso de depuração do WebView é o disponibilizado pelo Capacitor na compilação debug. Consulte o resultado do job para o APK e o SHA-256 de cada execução.

Em iOS 26.4, o mesmo ZIP foi baixado, instalado, aberto, reaberto e removido em simuladores de iPhone 17 Pro e iPad Pro de 13 polegadas (M5). Ambos os ensaios passaram para o ZIP com SHA-256 `a91d920cd7f43b4ad3999993c08fae28f4fea8eae96109e667ff4c398b93a140`. TestFlight, aparelhos físicos e login em produção continuam pendentes. [Ensaio iPhone](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45698844719/job/139505743143) · [Ensaio iPad](https://github.com/drguilhermecapel/Work-Easy/actions/runs/45698844719/job/139505743164)
