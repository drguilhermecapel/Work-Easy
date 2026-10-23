# Produção versus demonstração e páginas jurídicas

Nota técnica da frente E1. Rascunho para revisão de advogado nos pontos jurídicos; não é parecer jurídico.

## 1. O problema e a regra

Um build com Supabase configurado (`VITE_SUPABASE_URL` e a chave publicável) ainda mostrava o aviso "Protótipo de demonstração" e telas de protótipo com dados fictícios (profissionais, pedidos, prontuários).

Regra desta frente: **com backend, nenhum dado fictício aparece em lugar nenhum**. Sem backend, a demonstração fica como estava.

## 2. Como o app escolhe o modo

- `lib/supabase.ts` exporta `backendEnabled`; `AuthProvider` usa o provedor com sessão real quando há cliente; `useAuth().mode` vale `'demo'` ou `'backend'`.
- `DemoBanner` e `SiteFooter` decidem por `useAuth().mode`. `DemoBanner` não renderiza nada com backend.
- `AppShell.tsx` escolhe a tabela de rotas dos protótipos uma vez, ao carregar o módulo: `features.backendEnabled ? backendRoutes : demoRoutes` (`pages/prototype/routes.tsx`). Ficou assim porque `<Routes>` só aceita `<Route>` ou fragmentos como filhos.
- A lista de rotas de protótipo está em `pages/prototype/paths.ts` (`PROTOTYPE_PATHS`, `isPrototypePath`). Os testes usam essa lista para garantir que o menu de um build com backend nunca aponta para elas.

## 3. Cada rota de protótipo

| Rota | Modo demonstração | Com backend |
|---|---|---|
| `/` | Home como estava | Mesma Home, só com conteúdo do catálogo; ações reais "Pedir um serviço" (`/pedido`) e "Sou profissional" (`/pro/cadastro`); "Como funciona" descreve pedido, propostas e avaliação; a categoria Saúde abre `/categorias/health` |
| `/search` | Profissionais fictícios + serviços | `pages/prototype/CatalogSearch.tsx`: serviços do catálogo (`searchOccupations`), cada um leva a `/servicos/<slug>`; `?category=<área>` redireciona para `/categorias/<área>` |
| `/profile/:id` | Perfil fictício | Redireciona para `/categorias` |
| `/profile/me` | Vai para `/dashboard` | Redireciona para `/conta` |
| `/dashboard` | Painel fictício (cliente ou profissional) | Espera a sessão carregar e redireciona: profissional para `/pro`, os demais para `/pedidos` (visitante cai em `/entrar` pelo `RequireSession`) |
| `/register-provider` | Cadastro fictício | Redireciona para `/pro/cadastro`, mantendo `?ocupacao=` só se o slug existe no catálogo |
| `/verification` | Simulação de selfie | Página "Funcionalidade futura" (exige fornecedor contratado, base legal para dado biométrico e processamento no servidor), com link para o cadastro de profissionais |
| `/health` | Busca de médicos fictícios | Página "Funcionalidade futura" |
| `/doctor/:id` | Perfil de médico fictício | Página "Funcionalidade futura" |
| `/teleconsultation/:sessionId` | Sala fictícia | Página "Funcionalidade futura" |
| `/medical-records` | Prontuários fictícios | Página "Funcionalidade futura" |

As páginas "Funcionalidade futura" (`components/FutureFeature.tsx`, textos em `pages/prototype/FutureFeaturePage.tsx`) dizem que teleconsulta e prontuário exigem empresa registrada no CRM, responsável técnico e prontuário certificado (NGS2/ICP-Brasil), e têm link de volta. Nada de clínico é oferecido.

## 4. Rodapé e identificação da empresa

- Demonstração: o rodapé de antes ("© 2026 WorkEasy. Protótipo de demonstração."), agora com links para `/termos` e `/privacidade`.
- Backend: links Termos de Uso, Privacidade, SAC (todos vindos de `LEGAL_DOCS`) e "Trabalhe conosco" (`/pro/cadastro`), mais a identificação da empresa (`components/CompanyDetails.tsx`) e "© ano nome-da-empresa".
- `company()` em `config/legal.ts` lê `VITE_COMPANY_NAME`, `VITE_COMPANY_CNPJ`, `VITE_COMPANY_ADDRESS`, `VITE_SAC_EMAIL` e `VITE_SAC_WHATSAPP`. Valor vazio é omitido; e-mail mal formado e WhatsApp fora de 12 a 15 dígitos também (para não gerar link quebrado). O WhatsApp é guardado só com dígitos e DDI e vira `https://wa.me/<dígitos>`.
- **Antes de publicar, preencher as cinco variáveis.** Sem elas o rodapé fica sem identificação e nada avisa; o workflow de deploy (frente E9) usa os mesmos nomes.

Fonte consultada para a exigência de identificação (registro conforme a regra 2 do PREAMBLE):

- Decreto 7.962/2013, art. 2º, incisos I e II. Lido em https://www2.camara.leg.br/legin/fed/decret/2013/decreto-7962-15-marco-2013-775557-publicacaooriginal-139266-pe.html (texto da publicação original, Câmara dos Deputados). Trecho: "Os sítios eletrônicos ou demais meios eletrônicos utilizados para oferta ou conclusão de contrato de consumo devem disponibilizar, em local de destaque e de fácil visualização, as seguintes informações: I - nome empresarial e número de inscrição do fornecedor, quando houver, no Cadastro Nacional de Pessoas Físicas ou no Cadastro Nacional de Pessoas Jurídicas do Ministério da Fazenda; II - endereço físico e eletrônico, e demais informações necessárias para sua localização e contato;".
- A página do Planalto (https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2013/decreto/d7962.htm) respondeu HTTP 503 duas vezes em 2026-10-23 e não foi aberta. **[incerto]** se houve alteração posterior do artigo; uma busca (fonte secundária) apontou o decreto em vigor, sem revogação expressa.
- Pergunta para o advogado: o rodapé de todas as páginas basta como "local de destaque e de fácil visualização" para o fluxo de pedido?

## 5. Páginas jurídicas

- Registro: `LEGAL_DOCS` em `config/legal.ts` (`id`, `title`, `label`, `route`, `version`, `summary`). Rotas `/termos`, `/privacidade`, `/sac` saem dele (`pages/legal/routes.tsx`), assim como o índice `/legal` e os links do rodapé.
- Textos: `content/legal/termos.md`, `privacidade.md`, `sac.md`, carregados com `?raw` em um chunk próprio (`pages/legal/sources.ts`). Hoje contêm só "Documento em elaboração; será publicado após revisão jurídica." e uma frase de contexto.
- Página (`pages/legal/LegalDocPage.tsx`): título, "Versão ...", aviso "Rascunho em revisão jurídica" enquanto `VITE_LEGAL_STATUS` não for exatamente `vigente`, botão Imprimir (só no site; os shells nativos usam URL com `#` e o `window.print()` pode não fazer nada), CSS de impressão (`print:`), identificação da empresa no fim e, no SAC, a seção "Canais de atendimento" com e-mail e WhatsApp configurados. Falha de carregamento mostra erro e "Tentar de novo".
- Títulos: a página imprime o único `h1`. Um `# Título` no começo do arquivo é descartado e as seções `##` continuam `h2` (ordem de títulos preservada). Um texto sem `#` inicial começa as seções em `#`, que vira `h2`; um `#` extra nunca vira `h1`.
- **Versão e consentimento.** `version = edição + "-rascunho"` enquanto o texto não está vigente. `CONSENT_VERSIONS.terms` e `.privacy` seguem a versão dos documentos correspondentes (as demais finalidades ficaram como estavam). Efeitos: (a) o valor gravado hoje é o mesmo de antes (`2026-10-rascunho`); (b) ao definir `VITE_LEGAL_STATUS=vigente`, a versão perde o sufixo, e quem aceitou o rascunho é consultado de novo; (c) ao trocar o texto por uma nova edição, subir a edição em `config/legal.ts`.

### Como publicar os textos reais

1. Copiar cada rascunho revisado para `content/legal/<id>.md`, começando com `# Título`.
2. Subir a edição do documento em `config/legal.ts` (hoje `2026-10`).
3. Conferir o texto na tela e o `npx vitest run test/legal-config.test.ts test/claims-guard.test.ts` (o guard agora também lê `content/`; o teste de conteúdo recusa link que o renderizador mostraria como texto).
4. Só depois da aprovação do advogado, build com `VITE_LEGAL_STATUS=vigente`.

### Renderizador de Markdown

`lib/markdownParser.ts` (analisador, sem React) e `lib/markdown.tsx` (React). Nenhuma API de HTML cru é usada; um teste lê os dois arquivos e falha se aparecer uma.

- Suportado: títulos (`#` e sublinhados), parágrafos, `*itálico*`, `**negrito**`, listas ordenadas e não ordenadas aninhadas (inclusive recuo de 2 espaços sob `1.`), tabelas, citações, `---`, `` `código` ``, bloco com cercas, `[link](url)`, `<https://...>`, quebra de linha forçada (dois espaços ou `\`). Comentários HTML são descartados (um que nunca fecha fica como texto).
- Tratado como texto: qualquer HTML cru (`<script>`, `<br>`, `<img>`), entidades (`&amp;` aparece como está), link que não seja `http`, `https`, `mailto` ou relativo (`javascript:`, `data:`, `//host`, com espaço ou caractere de controle). O link recusado aparece exatamente como foi escrito. Imagem vira o texto alternativo.
- Limites: aninhamento de citação e lista até 6 níveis; ênfase e link até 10; trabalho por parágrafo proporcional ao tamanho (acima disso o parágrafo vira texto); alvo de link até 2048 caracteres; tabela até 40 colunas.
- Não suportado: código por recuo, links por referência, notas de rodapé, âncoras automáticas nos títulos (um sumário com `[x](#y)` não rola), tarefas, tachado.
- Armadilha de autoria: `---` logo abaixo de uma linha de texto, sem linha em branco, vira título (como no CommonMark). Deixar uma linha em branco antes.
- Links para páginas do app: usar caminho absoluto (`[SAC](/sac)`). Ele passa pelo roteador e funciona nos apps nativos, que usam URL com `#`; um caminho relativo (`sac`) vira âncora comum.

## 6. Variáveis de ambiente novas

| Variável | Uso |
|---|---|
| `VITE_COMPANY_NAME` | Nome empresarial, no rodapé e nas páginas jurídicas |
| `VITE_COMPANY_CNPJ` | CNPJ, como deve ser impresso |
| `VITE_COMPANY_ADDRESS` | Endereço físico |
| `VITE_SAC_EMAIL` | E-mail do SAC |
| `VITE_SAC_WHATSAPP` | WhatsApp do SAC, só dígitos com DDI (ex.: `5511999999999`) |
| `VITE_LEGAL_STATUS` | `vigente` só depois de aprovação do advogado; qualquer outro valor mantém o aviso de rascunho |

Todas vazias em `.env.example`. São informação pública (vão para o JavaScript do site); nunca segredo.

## 7. Testes

- `test/markdown.test.tsx`: cada construção, entrada hostil (links `javascript:` e variações, HTML cru em todo tipo de bloco, quebra de atributo) e linhas enormes ou patológicas com limite de tempo.
- `test/legal-config.test.ts`: `company()`, registro, versões de consentimento, arquivos de `content/legal`.
- `test/web/legal-pages.test.tsx`, `test/web/legal-error.test.tsx`: páginas, aviso de rascunho, `vigente`, SAC, impressão, falha de carregamento.
- `test/web/prod-vs-demo-backend.test.tsx`: com backend simulado, 20 rotas sem banner e sem nome, id ou preço de `constants.tsx`; rodapé; redirecionamentos; busca do catálogo.
- `test/routes.test.tsx` (modo demonstração, agora fixado contra um `.env.local` com Supabase), `test/web/navbar.test.tsx`, `test/claims-guard.test.ts` (agora lê também `content/`).

## 8. Pendências de outros donos

- `pages/AreaPage.tsx` (E4): com backend ainda imprime "Ver profissionais de demonstração" e "Buscar profissionais de saúde". Esconder os dois quando `features.backendEnabled`. A rota `/search?category=` já redireciona para a área.
- `pages/OccupationPage.tsx` (E4): `PolicyDetails` imprime "Nesta demonstração, nada é coletado ou conferido." também com backend, e "Procurar profissionais" leva a uma lista de serviços (a página já mostra os profissionais abaixo).
- `pages/cliente/Pedido.tsx`: o link para `/search?q=` leva agora à busca do catálogo; conferir o texto.
- `components/TermsGate.tsx` e `pages/conta/Entrar.tsx`: "Termos de Uso" e "Política de Privacidade" apontam os dois para `/legal`; trocar por `/termos` e `/privacidade`.
- `scripts/prerender.mjs` (E4): as páginas jurídicas não são pré-renderizadas; devem sair de `content/legal/*.md` com o mesmo subconjunto de Markdown e `noindex` enquanto o status não for `vigente`.
- Links das páginas de captação (E7) no rodapé: acrescentar em `components/SiteFooter.tsx`.
- Tabela de variáveis do `README.md`: acrescentar as seis variáveis acima.

## 9. Limites desta verificação

Os testes rodam em jsdom. Layout, impressão (`print:`) e uso em celular não foram vistos em navegador real.
