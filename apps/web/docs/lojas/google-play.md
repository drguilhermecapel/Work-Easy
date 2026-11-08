# Google Play: kit de envio do WorkEasy (Android)

> Rascunho para revisão de advogado. Não é parecer jurídico.

| | |
|---|---|
| Data da pesquisa | 23/10/2026 |
| App | WorkEasy, pacote `br.com.workeasy`, Capacitor 8.5.2, `minSdk` 24, `targetSdk` 36 |
| Estado do produto | MVP na `main`, **não implantado**, sem usuários reais. Nada foi testado contra Asaas, WhatsApp ou Resend |
| Escopo | só Google Play (Android). iOS/macOS e desktop ficam em `docs/lojas/app-store.md` e `docs/lojas/desktop-e-assinatura.md` |
| Código alterado | nenhum. Os ajustes de código estão em lista, na seção 2.3, para quem mexe no app |

**Como ler.** `[PLANEJADO]` = não existe no código hoje. `[CONDICIONAL: depende de parecer]` = depende de opinião jurídica ou de decisão do dono; este documento não decide. `[incerto]` = não consegui confirmar em fonte aberta nesta sessão. "Conferido no código" = li o arquivo citado em 23/10/2026. Os códigos G01 a G35 (Ajuda do Play Console), A01 a A09 (site para desenvolvedores Android), C01, V01, S01 e N01 (norma) apontam para a seção 21, com endereço, data de abertura e trecho lido. L01 a L11 são os documentos jurídicos do plano, em `docs/juridico/` (L01 Termos de Uso, L02 Termos do Prestador, L03 Política de Privacidade, L06 RIPD, L11 textos de consentimento); I02 e I03 são as pesquisas em `docs/pesquisa/` (I02 WhatsApp e e-mail, I03 Supabase em produção). Os nomes de telas do Console seguem a Ajuda em pt-BR.

---

## 0. Resumo em uma página

**Hoje o WorkEasy não pode ser enviado para produção no Google Play.** Quatro bloqueios são críticos (B01, B02, B03 e B08, na seção 1): não há conta de organização, não há Política de Privacidade nem Termos publicados, não há página web para pedir a exclusão da conta e não há back-end de produção para o revisor entrar. Dá para começar o caminho longo agora: o teste interno aceita um pacote assinado antes de a configuração do app estar completa (G29), e o número D-U-N-S, que pode levar até 30 dias, pode ser pedido hoje (G18).

### Caminho crítico

1. Abrir a pessoa jurídica e pedir o D-U-N-S (gratuito, até 30 dias) (G18).
2. Criar a conta de organização, verificar identidade e contatos, ligar a verificação em duas etapas (G16, G17, G19).
3. Em paralelo: publicar Termos, Política de Privacidade e página de exclusão (L01, L03 e seção 10); ajustar o código (seção 2.3); pôr o back-end de produção no ar (I03); definir o canal de login (D3).
4. Gerar a chave de upload e o primeiro pacote assinado (seção 14) e subir no **teste interno** (disponível em minutos, até 100 testadores) (G29).
5. Preencher o Conteúdo do app (seções 7 a 10) e a ficha (seções 5 e 6).
6. **Teste fechado** com o mesmo build que irá para produção. Conta pessoal: 12 testadores por 14 dias seguidos, obrigatório. Conta de organização: não obrigatório, recomendado (G14).
7. Produção. A revisão pode levar até sete dias, ou mais em casos excepcionais (G31). A primeira versão não aceita lançamento em porcentagem (G30).

### Decisões que só o dono toma

| # | Decisão | Recomendação | O que muda |
|---|---|---|---|
| D1 | Tipo de conta | **Organização.** A atividade é comercial, a declaração de saúde provavelmente entra (G16) e o programa de escolha de faturamento exige empresa (G06) | exige D-U-N-S e mostra no Google Play nome, endereço, e-mail e telefone da empresa (G18) |
| D2 | Perfil de lançamento (seção 2.1) | **Perfil A:** sem a linha Cuidado no primeiro envio | tira localização exata, tira dado de saúde, simplifica Segurança dos dados |
| D3 | Canal de login e conta do revisor | decidir **antes** de tirar a aba Celular (seção 13.1) | sem OTP fixo o revisor não entra |
| D4 | Pro no Android | **não vender nem anunciar o Pro dentro do app** na versão 1 (seção 11) | evita violar a política de Pagamentos |
| D5 | Declaração de saúde | declarar "Serviços e administração de saúde" (seção 7.4) | exige aviso na descrição |
| D6 | Países | só Brasil | evita exigências de outros mercados |
| D7 | Nome, marca e pacote | buscar "WorkEasy" no INPI **antes** do primeiro upload | o nome do pacote fica fixo no primeiro upload (G29) |

---

## 1. O que bloqueia a aprovação hoje

| ID | Bloqueio | Evidência | Gravidade | Quem destrava |
|---|---|---|---|---|
| B01 | Não existe conta de organização: a PJ não foi aberta e o D-U-N-S leva até 30 dias | `docs/DECISOES.md` seção 8 (itens 3 e 5); G16, G18 | Crítico | Dono |
| B02 | Política de Privacidade e Termos não estão publicados. `/legal` mostra "Documentos em elaboração"; os dois links do aceite apontam para a mesma rota; `CONSENT_VERSIONS` está em `2026-10-rascunho`. O Google exige a Política em URL público **e dentro do app**, e Termos separados da Política | `pages/LegalDocs.tsx`, `pages/conta/Entrar.tsx`, `components/TermsGate.tsx`, `config/legal.ts`; G03, G24, G28 | Crítico | Advogado (L01 a L03) e dev (M07) |
| B03 | Não há URL web para pedir exclusão de conta. Existe só `/conta` (exige login) e `public/robots.txt` bloqueia `/conta` e `/entrar` | `public/robots.txt`, `pages/conta/routes.tsx`; G02, G03 | Crítico | Dev (M07, M08) e site no ar |
| B04 | Não há denunciar nem bloquear no app. Existe conteúdo de usuário visível a outros: biografia, serviços e avaliações na página pública do profissional. Moderação só pelo admin | busca por `denunc`, `reportar`, `bloquear` e `moderat` em `pages`, `components`, `services`, `lib`, `supabase/migrations` e `supabase/functions`: só o "relatório do dia" do Cuidado e a ocultação de avaliação pelo admin (`reviews_admin_update`); G27, G28 | Alto | Dev (M06) |
| B05 | Conteúdo de demonstração no pacote de produção: faixa "Protótipo de demonstração" em toda tela e no rodapé; médicos fictícios em `/health`, `/search` e nas páginas de área; teleconsulta e prontuário de demonstração; tela de verificação com câmera; cadastro de profissional de demonstração (`/register-provider`, "Nesta demonstração, nenhum dado é enviado"), que é o destino de "Ofereço este serviço" e do link de Minha conta mesmo com backend ligado (o menu já aponta para `/pro/cadastro`). Conferi no bundle de `vite build --mode native` (feito fora do repositório): estão lá "Protótipo de demonstração", "profissionais de demonstração encontrados", "Dr. Roberto Costa (fictício)", "Verificação de identidade (simulação)", "Paciente Fictício (demonstração)" e "Funcionalidade futura" | `AppShell.tsx`, `components/DemoBanner.tsx`, `pages/HealthSearch.tsx`, `pages/Search.tsx`, `pages/AreaPage.tsx`, `pages/Verification.tsx`, `pages/ProviderRegistration.tsx`, `pages/OccupationPage.tsx`, `pages/conta/Conta.tsx`; G35 | Alto | Dev (M01, M02) |
| B06 | Venda do Pro dentro do app, paga no Asaas. A política de Pagamentos manda usar o Play Billing para "novos recursos indisponíveis na versão gratuita" e proíbe levar o usuário a outro meio de pagamento por botões, links e mensagens | `pages/pro/Assinatura.tsx` (link "Abrir a fatura"), `lib/errors.ts` (`free_proposal_limit`); G05 | Alto | Dono (D4) e dev (M05) |
| B07 | A linha Cuidado está no bundle e no menu do cliente, contra a decisão D12 (só abrir ao público com os pré-requisitos). Traz localização exata e muda as declarações de dados e de saúde | `components/navItems.ts`; `docs/DECISOES.md` D12 | Alto | Dono (D2) e dev (M04) |
| B08 | Sem back-end de produção, sem provedor de SMS e sem e-mail transacional configurados: o revisor do Google não consegue entrar | README ("não implantado"); `docs/pesquisa/whatsapp-e-email.md` | Crítico | Dono (I03) |
| B09 | Login do revisor: o Google exige credenciais reutilizáveis que ignorem a senha única. O OTP fixo do Supabase existe só para celular, e a recomendação de lançamento de `whatsapp-e-email.md` tira a aba Celular | G25, S01; `docs/pesquisa/whatsapp-e-email.md` seção 1.1 | Alto | Dono (D3) |
| B10 | Sem chave de upload e sem `signingConfig` de release; `versionCode 1` e `versionName "1.0"` fixos. O `.gitignore` da raiz ignora `*.keystore`, mas não `*.jks`, e as linhas do modelo Android estão comentadas | `android/app/build.gradle`, `.gitignore`, `android/.gitignore` | Médio | Dono e dev (M10, M11) |
| B11 | Não existem capturas de tela nem o gráfico de recursos. O `icon-512.png` do repositório tem cantos transparentes e o Play pede o quadrado inteiro | `public/icons/`; A02 | Médio | Dono/design |
| B12 | `CAMERA` é pedida sem recurso real (só a simulação) e a localização só serve ao Cuidado. A Ajuda manda remover permissões não usadas em apps de saúde | `AndroidManifest.xml`, `pages/Verification.tsx`; G11 | Médio | Dev (M03, M04) |
| B13 | Declaração de saúde: o catálogo tem áreas de saúde e a linha Cuidado. É preciso declarar e pôr na descrição o aviso "não é dispositivo médico" | `catalog/areas.json`; G10, G11 | Médio | Dono (D5) |
| B14 | Se a conta for pessoal: teste fechado com 12 testadores por 14 dias seguidos antes da produção | G14 | Condicional | Dono (D1) |

---

## 2. Perfis de lançamento e mudanças de código

### 2.1 Os dois perfis

O código de hoje é o **perfil B**. O **perfil A** é o recomendado para o primeiro envio porque segue a decisão D12 e deixa as declarações menores. O formulário de Segurança dos dados descreve a **soma de todas as versões distribuídas no Play, em qualquer lugar do mundo** (G01): o build do teste fechado precisa ser do mesmo perfil que irá para produção.

| Tema | Perfil A (recomendado) | Perfil B (código de hoje, com o mínimo para aprovar) |
|---|---|---|
| Linha Cuidado | fora do build de loja | dentro |
| Localização | sem `ACCESS_FINE_LOCATION` e `ACCESS_COARSE_LOCATION` | com as duas, uso só no registro de entrada e saída |
| Dado de saúde nos campos livres do Cuidado | não existe | declarar (seção 8.3) |
| Câmera | sem `CAMERA` | sem `CAMERA` |
| Telas de demonstração | fora | fora |
| Compra do Pro no app | fora | fora |
| Denunciar e bloquear | dentro | dentro |

### 2.2 O que vale para os dois perfis

Demonstrações fora, faixa de protótipo fora com backend ligado, `CAMERA` fora, compra do Pro fora, denúncia e bloqueio dentro, Política, Termos e exclusão publicados, e a descrição da ficha igual ao que o app faz (G35).

### 2.3 Mudanças de código (não feitas; lista para o dev)

| ID | Mudança | Arquivos | Perfil | Bloqueio |
|---|---|---|---|---|
| M01 | Com backend ligado, esconder as demonstrações: rotas `/health`, `/doctor/:id`, `/verification`, `/teleconsultation/:sessionId`, `/medical-records`, `/dashboard`, `/profile/:id`, `/register-provider` (e trocar por `/pro/cadastro` os links "Ofereço este serviço" e "cadastro de profissional"); fixtures `MOCK_PROVIDERS` em `/search`, `AreaPage` e `OccupationPage`; o item "Saúde — médicos" da Home abre `/health` | `AppShell.tsx`, `pages/Home.tsx`, `pages/Search.tsx`, `pages/AreaPage.tsx`, `pages/OccupationPage.tsx`, `pages/conta/Conta.tsx` | A e B | B05 |
| M02 | Faixa `DemoBanner`, rodapé "Protótipo de demonstração" e `meta description` só quando `!backendEnabled` | `components/DemoBanner.tsx`, `AppShell.tsx`, `index.html` | A e B | B05 |
| M03 | Tirar `CAMERA` e `uses-feature camera` do manifesto | `android/app/src/main/AndroidManifest.xml` | A e B | B12 |
| M04 | Esconder o Cuidado no build de loja: item de menu, `pages/cuidado/routes.tsx`, `pages/pro/plantoes/routes.tsx`. Tirar `ACCESS_*_LOCATION` e `uses-feature gps` | `components/navItems.ts`, manifesto | A | B07, B12 |
| M05 | Esconder a compra do Pro em build de loja e reescrever as frases que mandam assinar | `pages/pro/Assinatura.tsx`, `pages/pro/Painel.tsx`, `pages/pro/Cobrancas.tsx`, `lib/errors.ts` (`free_proposal_limit`, `pro_required`) | A e B | B06 |
| M06 | Denunciar e bloquear (conteúdo e usuários), com fila no admin | página do profissional, avaliações, atendimentos; nova tabela e função [PLANEJADO] | A e B | B04 |
| M07 | Rotas `/termos`, `/privacidade`, `/excluir-conta`; separar os dois links de `/legal` no aceite; link da Política no rodapé e em Minha conta; atualizar `CONSENT_VERSIONS` | `AppShell.tsx`, `pages/conta/Entrar.tsx`, `components/TermsGate.tsx`, `config/legal.ts` | A e B | B02, B03 |
| M08 | Não bloquear a página de exclusão no `robots.txt` | `public/robots.txt` | A e B | B03 |
| M09 | Flag de build para as abas de login (E-mail e Celular), conforme D3 | `pages/conta/Entrar.tsx` | A e B | B09 |
| M10 | `versionCode` e `versionName` por propriedade do Gradle e `signingConfig` opcional lendo `keystore.properties` (proposta na seção 14.7) | `android/app/build.gradle` | A e B | B10 |
| M11 | `.gitignore`: `*.jks` e `keystore.properties` | `apps/web/.gitignore` | A e B | B10 |
| M12 | Decidir `android:allowBackup="true"`: o backup do Android copia o armazenamento do WebView, que guarda a sessão do Supabase | manifesto | A e B | nota |

---

## 3. Conta de desenvolvedor

| Item | O que o Google exige | Fonte |
|---|---|---|
| Idade | 18 anos ou mais | G15 |
| Taxa | US$ 25,00, única. Cartão MasterCard, Visa, American Express (Discover só nos EUA; Visa Electron só fora dos EUA). Pré-pago não vale | G15 |
| Tipo | Organização ou empresa: informar nome público do desenvolvedor, D-U-N-S, nome, endereço, telefone e site da organização, nome do contato, e-mail e telefone de contato (confirmados por código) e e-mail e telefone do desenvolvedor | G16, G17, G18 |
| D-U-N-S | número de 9 dígitos da Dun & Bradstreet, gratuito. Pode levar até 30 dias. Sem ele não se cria conta de organização | G18 |
| O que fica público | nome civil, endereço oficial, e-mail e telefone do desenvolvedor aparecem no Google Play. **Use os dados da empresa, não os pessoais** | G18 |
| E-mail de contato | confirmado por senha única; numa conta de organização não deve ser genérico nem pessoal; deve ser associado à organização | G17 |
| Identidade | verificar nome e endereço antes de publicar | G18 |
| Segurança | verificação em duas etapas para todos os usuários da conta | G19 |
| Verificação de desenvolvedor Android | desde 30/09/2026 as proteções valem para quem instala apps de lojas participantes no Brasil, Indonésia, Singapura e Tailândia, em aparelhos certificados com Android 7 ou mais novo. O Google Play registra automaticamente 99% dos apps; para os demais e para o que for distribuído fora do Play, o Google manda registrar manualmente no Console. **Não distribua APK fora do Play sem registrar o app** | A01 |
| Comerciante no Brasil | só se vender pelo Google Play (apps pagos, compras no app): CNPJ, CPF, beneficiários acima de 25%, executivos, comprovante de endereço | G32 |
| Se a conta for pessoal | teste fechado com 12 testadores por 14 dias seguidos; verificar acesso a um Android pelo app Play Console; aparece o nome civil | G14, G15, G18 |

[incerto] Se trocar o tipo de conta depois preserva o app e o pacote. A Ajuda diz que "será possível alterar o tipo da conta se as circunstâncias mudarem" (G17), mas não diz o efeito sobre apps já criados. Por isso a recomendação é criar já como organização.

---

## 4. Criar o app no Console

Caminho: Início > Criar app (G21).

1. **Nome do app:** `WorkEasy` (até 30 caracteres).
2. **Idioma padrão:** Português (Brasil), escolhido na criação (G21). A mesma página diz que, no upload, o idioma padrão é inglês (Estados Unidos): depois do primeiro envio, confira na ficha que o padrão continua pt-BR.
3. **App ou jogo:** app. **Gratuito ou pago:** gratuito.
4. **E-mail de contato:** `[E-MAIL DO SAC]`.
5. **Declarações:** aceitar as Políticas do programa para desenvolvedores, as leis de exportação dos EUA e os Termos da Assinatura de apps do Google Play (G21).
6. **Nome do pacote:** `br.com.workeasy` (em `capacitor.config.ts` e `android/app/build.gradle`). **É permanente:** o nome fica fixo no primeiro upload de artefato e não pode ser reutilizado (G21, G29). Confirme a marca no INPI e o domínio antes (D7).
7. **Países:** na página de produção, selecionar só Brasil [incerto: nome exato do menu].

---

## 5. Ficha da loja

Limites oficiais (G21): nome do app 30 caracteres, descrição breve 80, descrição completa 4.000, contando todo tipo de caractere. Conferi os textos abaixo com o script do Apêndice A, que lê este próprio arquivo.

| Campo | Limite | Texto | Caracteres |
|---|---|---|---|
| Título | 30 | `WorkEasy` | 8 |
| Título alternativo | 30 | `WorkEasy: serviços locais` | 25 |
| Descrição breve | 80 | ver 5.1 | 72 |
| Descrição completa, base | 4.000 | ver 5.1 | 1.675 |
| Bloco opcional Cuidado | | ver 5.1 | 317 |
| Bloco opcional Pagamento | | ver 5.1 | 243 |
| Base mais os dois blocos | 4.000 | | 2.239 |
| Notas da versão (teste fechado) | 500 por idioma (G30) | ver 15 | 314 |
| Notas da versão 1.0.0 | 500 por idioma | ver 15 | 261 |

### 5.1 Textos para copiar

#### Título

```text
WorkEasy
```

#### Descrição breve

```text
Peça serviços, receba propostas e agende com profissionais de São Paulo.
```

#### Descrição completa, base

```text
O WorkEasy conecta quem precisa de um serviço a profissionais e prestadores de várias áreas: reformas, limpeza, beleza, aulas, tecnologia, pets, serviços automotivos e muito mais. O atendimento começa na cidade de São Paulo (SP).

Para quem pede um serviço
- Entre com um código de 6 dígitos enviado por e-mail ou SMS. Não há senha.
- Escolha o serviço e o bairro e descreva o que precisa e quando.
- Receba propostas de profissionais e aceite a que preferir.
- Ou agende direto, em um horário livre, na página do profissional.
- Acompanhe seus pedidos e atendimentos e avalie o serviço depois.
- Se um profissional enviar um orçamento por link, você aceita ou recusa na própria página, sem precisar de conta.

Para profissionais e prestadores
- Cadastre seus serviços, os bairros que atende e seus horários.
- Envie os documentos que a sua ocupação exige. A equipe do WorkEasy analisa o cadastro antes de você aparecer na busca.
- Responda a pedidos abertos com propostas.
- Monte orçamentos e envie por link.
- Organize sua agenda e o cadastro dos seus clientes.

Sua conta e seus dados
- Em Minha conta você vê os consentimentos que deu, baixa uma cópia dos seus dados e pode excluir a conta.

Avisos
- O WorkEasy é uma plataforma de intermediação. Os serviços são prestados pelos profissionais, que respondem pelo atendimento.
- O WorkEasy não é um dispositivo médico e não faz diagnósticos, tratamentos, não cura e não previne nenhuma condição médica. Para orientação médica, diagnóstico ou tratamento, consulte um profissional de saúde.
- O app é destinado a maiores de 18 anos.

Dúvidas e suporte: [E-MAIL DO SAC]
Política de Privacidade: [URL-POLITICA-DE-PRIVACIDADE]
```

Notas sobre o texto base:

- "por e-mail ou SMS": tirar "ou SMS" se a aba Celular sair do app (D3).
- "A equipe do WorkEasy analisa o cadastro": é regra do banco (profissional só aparece na busca depois de aprovado), mas depende de a operação de análise estar ativa no lançamento [CONDICIONAL: depende de parecer].
- O aviso de dispositivo médico é o que a Ajuda pede para apps de saúde (G11). Use enquanto a declaração de saúde estiver marcada (seção 7.4).
- Não há números ("44 áreas", "1.710 profissões"), nomes de selo, promessa de segurança, de rapidez ou de qualidade, nem preço: a política de metadados proíbe termos de ranking, preço e promoção em título e descrição breve, e o app não tem como provar os outros (G20, G22, G35).

#### Bloco opcional: Cuidado [CONDICIONAL: depende de parecer]

Só no perfil B (com a linha Cuidado no build).

```text
WorkEasy Cuidado
Famílias cadastram a casa e a pessoa cuidada (apenas o primeiro nome), oferecem plantões a cuidadores, acompanham a entrada e a saída (a localização é opcional) e leem o relatório do dia. O Cuidado organiza escalas e registros: não é atendimento clínico nem substitui cuidado médico ou de enfermagem.
```

#### Bloco opcional: Pagamento [CONDICIONAL: depende de parecer]

Só publique depois do teste real com o Asaas e do parecer sobre o split (`docs/DECISOES.md` seção 4).

```text
Pagamento
Quando o profissional ativa o recebimento, você paga por Pix (QR code ou copia e cola, no próprio app), boleto ou cartão. Boleto e cartão são pagos na página do provedor de pagamentos (Asaas). O app não recebe o número do seu cartão.
```

### 5.2 Regras de metadados que os textos seguem

Sem emoji, sem repetição de pontuação, sem palavras todas em maiúsculas para ênfase; sem "melhor", "nº 1", "top", "novo", "desconto", "promoção"; sem "baixe agora" ou "instale agora"; sem depoimento anônimo (G20, G22). As capturas e a descrição precisam descrever a função real; categoria e classificação precisam estar corretas (G35).

### 5.3 Categoria, etiquetas, contato e URLs

| Campo | Valor | Observação |
|---|---|---|
| Categoria | **Negócios** [incerto] | A lista oficial não tem "marketplace de serviços". "Negócios" é a mais próxima pelos exemplos (busca de emprego, gestão). Evite Saúde, Saúde e fitness e Finanças (G33, G35) |
| Etiquetas | até 5 | Escolha na lista "Tags sugeridas" as que descrevem o app (serviços locais, contratação, agendamento, orçamento). A lista é do Console [incerto: nomes exatos] (G33) |
| E-mail de suporte | `[E-MAIL DO SAC]` | obrigatório (G21) |
| Site | `https://[DOMÍNIO]` | recomendado (G21) |
| Telefone | opcional | |
| Política de Privacidade | `[URL-POLITICA-DE-PRIVACIDADE]`, previsto `https://[DOMÍNIO]/privacidade` | HTML público, sem PDF, sem bloqueio geográfico (G03) |
| Termos de Uso | `[URL-TERMOS]`, previsto `https://[DOMÍNIO]/termos` | separado da Política (G28) |
| Exclusão de conta | `[URL-EXCLUSAO-DE-CONTA]`, previsto `https://[DOMÍNIO]/excluir-conta` | seção 10 |
| Nome do desenvolvedor | `[RAZÃO SOCIAL]` (nome público pode ser "WorkEasy") | G16 |

---

## 6. Gráficos

| Gráfico | Obrigatório | Formato e tamanho exatos | Limites | No repositório hoje | Ação |
|---|---|---|---|---|---|
| Ícone do app | Sim | PNG de 32 bits (com alfa), **512 × 512 px**, sRGB | até 1.024 KB; quadrado inteiro, sem cantos arredondados e sem sombra (o Play aplica a máscara) | `apps/web/public/icons/icon-maskable-512.png` serve (512 × 512, RGBA, 44 KB, cantos opacos). `icon-512.png` **não serve** (cantos transparentes) | copiar o `icon-maskable-512.png` |
| Recurso gráfico | Sim | JPEG ou PNG de 24 bits, sem alfa, **1.024 × 500 px** | pontos focais no centro; sem preço, ranking ou "novo" | não existe | criar |
| Capturas de telefone | Sim, no mínimo 2 | JPEG ou PNG de 24 bits, sem alfa; lado menor de pelo menos 320 px; lado maior de no máximo 3.840 px; **o lado maior não pode passar de 2 vezes o menor**; até 8 | para formatos de destaque: pelo menos 4 com lado menor de 1.080 px ou mais, em 9:16 (**1.080 × 1.920 px**) | não existem | capturar |
| Capturas de tablet de 7 e 10 polegadas | Não | 16:9 ou 9:16, entre 1.080 e 7.680 px; recomendado pelo menos 4 | | | opcional |
| Vídeo de prévia | Não | URL do YouTube público ou não listado, sem anúncios | | | opcional |
| Texto alternativo | Recomendado | até 140 caracteres por imagem | sem "foto de" ou "imagem de" | | ver 6.1 |
| Ícone do launcher (APK) | já existe | adaptativo, em `android/app/src/main/res/mipmap-*` | separado do ícone da loja | feito | nenhuma |

O texto oficial em inglês pede "a minimum of two screenshots across different device types" (G20); suba pelo menos duas de telefone e confira na tela de Gráficos [incerto: se as duas precisam ser de tipos de dispositivo diferentes]. Telas de celular com proporção 20:9 (por exemplo 1.080 × 2.400) **passam do limite de 2 vezes**: exporte em 1.080 × 1.920 (emulador com essa tela, ou recorte).

### 6.1 Seis capturas sugeridas (1.080 × 1.920, dados claramente de teste, sem faixa de demonstração)

| # | Tela | Texto alternativo (até 140) | Caracteres |
|---|---|---|---|
| 1 | Home com busca e categorias | `Tela inicial com busca de serviços e categorias` | 47 |
| 2 | `/pedido`, passo do serviço e bairro | `Pedido de serviço: serviço, bairro, descrição e datas` | 53 |
| 3 | `/pedidos/:id` com propostas | `Propostas recebidas para um pedido, com a opção de aceitar` | 58 |
| 4 | `/p/:slug` com serviços e horários | `Página de um profissional com serviços e horários livres` | 56 |
| 5 | `/pro/agenda` | `Agenda do profissional com os atendimentos da semana` | 52 |
| 6 | `/conta` (consentimentos, cópia e exclusão) | `Minha conta: consentimentos, cópia dos dados e exclusão da conta` | 64 |

Regras da Ajuda para as capturas: mostrar o app de verdade, sem moldura de aparelho, sem dedos na tela, barra de status limpa, sem texto promocional, sem frase como "melhor" ou "grátis" (G20). Não use `/health` nem `/search` com profissionais fictícios (B05, G35). Para conferir tudo antes de subir, use o script do Apêndice B (testado com o ícone do repositório e com imagens de teste).

---

## 7. Declarações do Console (Política > Conteúdo do app)

| Declaração | Resposta recomendada | Condição | Fonte |
|---|---|---|---|
| Política de Privacidade | `[URL-POLITICA-DE-PRIVACIDADE]` | publicar antes (B02); checklist em 7.1 | G03, G24 |
| Acesso de apps | instruções com OTP fixo (seção 13) | decisão D3 | G24, G25 |
| Anúncios | **Não** | sem SDK de anúncios (`package.json`) | G24 |
| Classificação de conteúdo | questionário (7.2) | | G23 |
| Público-alvo e conteúdo | **18 anos ou mais**; não é feito para crianças | | G26 |
| Apps de notícias | Não | | G24 |
| Apps de status e rastreamento de COVID-19 | Não | | G24 |
| Segurança dos dados | seção 8 | | G01 |
| Apps governamentais | Não [incerto: declaração existe no Console, texto não aberto] | | |
| Recursos financeiros | "Meu app não oferece recursos financeiros" (7.5) | [CONDICIONAL: depende de parecer] | G08, G09 |
| Apps de saúde | "Serviços e administração de saúde" (7.4) | [CONDICIONAL: depende de parecer] | G10, G11 |
| ID de publicidade | **Não usa** | conferir o manifesto mesclado (seção 14.5) | G34 |
| Permissões sensíveis (SMS, registro de chamadas, localização em segundo plano, fotos e vídeos, todos os arquivos) | **nenhum formulário**: o app não pede essas permissões | | G04, G24 |
| Exclusão de conta | dentro de Segurança dos dados (seção 10) | | G02 |

### 7.1 Checklist para a Política de Privacidade (exigência do Google)

Para quem escreve `docs/juridico/03-politica-de-privacidade.md` (L03). A Política deve (G03):

- [ ] ter o título "Política de Privacidade" e citar o **nome do app** e a **entidade** que aparece na página do app;
- [ ] trazer informações do desenvolvedor e um ponto de contato de privacidade (`[E-MAIL DO ENCARREGADO]`);
- [ ] listar os tipos de dado pessoal e sensível que o app acessa, coleta, usa e compartilha, **e com quais grupos** (as mesmas categorias da tabela da seção 8.3);
- [ ] descrever como os dados são tratados (exigência do Google; escreva só o que o produto faz hoje);
- [ ] dizer a política de **retenção e exclusão**, incluindo o que fica após a exclusão da conta (seção 10.3);
- [ ] estar num URL ativo, público, **não editável** e sem bloqueio geográfico; **não ser PDF**;
- [ ] ser coerente com o formulário de Segurança dos dados (G03);
- [ ] estar linkada no Console **e** dentro do app.

### 7.2 Classificação de conteúdo (IARC)

Caminho: Política > Conteúdo do app > Classificações de conteúdo > Iniciar. Informar e-mail, escolher a categoria, responder, revisar e enviar (G23). Escolha a categoria que descreve utilitário ou serviços, não jogo nem rede social [incerto: os nomes exatos das categorias e das perguntas só aparecem no Console]. Responda pelo comportamento real:

| Tema | Resposta |
|---|---|
| Violência, sangue, medo | Não |
| Conteúdo sexual e nudez | Não |
| Linguagem ofensiva | Não no conteúdo do app (os usuários escrevem texto livre: ver UGC, seção 12) |
| Drogas, álcool e tabaco | Não |
| Jogos de azar e caixas de recompensa | Não |
| Usuários interagem ou trocam conteúdo | **Sim** (pedidos, propostas, avaliações, páginas públicas de profissionais) |
| Compartilha a localização do usuário com outros | Perfil A: **Não**. Perfil B: **Sim** (a família vê o local do registro) |
| Compras digitais | Perfil A: **Não** (sem venda no app). Se vender o Pro no app: Sim |
| Navegação livre na internet | Não (links externos abrem no navegador: fatura do Asaas, mapa, WhatsApp) |
| Anúncios | Não |

Não é possível prever o resultado; não force uma classificação. Duas notas da Ajuda: a classificação indicativa (ClassInd) do Brasil está sendo atualizada e pode ser preciso **reenviar o questionário** (G32); e a Ajuda anuncia que, a partir de março de 2026, o Google Play passa a bloquear ou filtrar no Brasil apps classificados como 18+ para menores de idade (G32). Não responda "18+" por precaução.

### 7.3 Público-alvo

Marcar a faixa "18 anos ou mais" (G26). Não entrar no programa Famílias. A lei do ECA Digital (Lei 15.211/2025) vale desde 17/03/2026 e atinge produto ou serviço "direcionado a crianças e a adolescentes no País ou de acesso provável por eles" (N01, art. 1º); o Play oferece a API Play Age Signals (Beta) no Brasil (G32). Se o WorkEasy é de "acesso provável" por menores é pergunta para o advogado (seção 19, item 4).

### 7.4 Apps de saúde

**Resposta recomendada:** marcar **Serviços e administração de saúde**. A Ajuda descreve essa categoria como ferramentas de marcação de consultas, telessaúde, auxílio na atenção a idosos, e inclui "apps que conectam pacientes a prestadores de cuidados de saúde" (G10). O catálogo tem as áreas `health`, `saude-mental`, `odontologia`, `terapias-e-reabilitacao`, `nutricao`, `enfermagem` e `exames-e-diagnostico`, e o perfil B tem o Cuidado. A política diz que um app que "não é principalmente de saúde, mas tem recursos relacionados" **ainda entra no escopo** (G11). [CONDICIONAL: depende de parecer]

- **Não marcar** "Apps para dispositivos médicos": o app não diagnostica, não indica tratamento, não conversa com hardware médico. Não marcar Conexão Saúde nem pesquisa em seres humanos.
- "Meu app não tem recursos de saúde" só serve se o build de loja não tiver áreas de saúde nem Cuidado; com o catálogo atual seria difícil sustentar (G10).
- Depois de declarar: pôr na descrição o aviso de "não é dispositivo médico" e lembrar o usuário de consultar um profissional de saúde (G11, já está no texto 5.1); remover permissões não usadas (G11); a Política de Privacidade precisa explicar o uso (G11).
- `CAMERA` e as permissões de localização estão na lista de permissões "no escopo dos dados sensíveis relacionados à saúde" e exigem declaração em destaque no app e consentimento (G12). Por isso M03 e M04.
- Pagamento de consulta e de outros serviços clínicos regulamentados **não** usa o Play Billing (G11), o que é coerente com o Asaas.
- Conta de organização (G16).

### 7.5 Recursos financeiros

**Resposta recomendada:** "Meu app não oferece recursos financeiros" (G08). [CONDICIONAL: depende de parecer] Motivo: para o Google, serviço financeiro é o que "está relacionado ao gerenciamento e investimento de moedas e criptomoedas, incluindo consultoria personalizada" (G09). O WorkEasy não guarda saldo, não transfere dinheiro por conta própria, não empresta, não investe; a cobrança é criada na conta do Asaas e paga no Pix em QR ou na página do Asaas, e o app não recebe número de cartão (`pages/pro/Assinatura.tsx`).

Se o advogado concluir que a plataforma atua como arranjo de pagamento, ou se a comissão e o pagamento retido forem ligados (`docs/DECISOES.md` seção 4), refaça a declaração. As opções que poderiam se aplicar em "Pagamentos e transferências" são "Pagamentos com smartphone e carteiras digitais" e "Transferência de dinheiro e serviços de transferência eletrônica"; há também "Outro" (G08).

---

## 8. Segurança dos dados (Data safety)

Caminho: Política > Conteúdo do app > Segurança dos dados > Iniciar (G01). O formulário aceita rascunho e importação por CSV. **Todas as respostas abaixo vêm dos fluxos reais** (conferidos no código); onde há dúvida, escolhi a leitura conservadora e disse por quê.

### 8.1 Regras do Google que decidem as respostas

- **Coletar** é transmitir dado do app para fora do aparelho, inclusive por uma WebView aberta no app cujo código você controla (G01). O app inteiro é uma WebView com código nosso.
- **Compartilhar** é transferir dado coletado a terceiros. **Não conta** como compartilhamento: provedor de serviços que processa em nome e sob instrução do desenvolvedor, fins legais, ação iniciada pelo usuário, dado totalmente anonimizado (G01). Um provedor de nuvem que hospeda o dado "geralmente" é provedor de serviços (G01).
- **Efêmero** (só em memória, pelo tempo da requisição, sem guardar) não precisa ser declarado (G01).
- **Opcional** só se todos os usuários podem escolher enviar ou não, e a coleta não pode ser exigida de ninguém (G01).
- **Serviço de pagamento externo:** não declare número de cartão se o app não o acessa e o serviço o coleta direto do usuário, mas declare histórico de compras e o que o app envia ou recebe (G01).
- O formulário descreve a soma de todas as versões no Play e precisa ser **coerente com a Política de Privacidade** (G01, G03).

### 8.2 Fluxos reais para fora do app (conferido no código)

| Fluxo | Quem recebe | Dados | Como responder |
|---|---|---|---|
| App para Supabase (API, Auth, Storage, Edge Functions) | hospedagem | todos os tipos da tabela 8.3 | provedor de serviços: não é "compartilhado" (G01) |
| Auth para provedor de SMS | provedor de SMS [PLANEJADO: ainda não escolhido] | telefone e código | provedor de serviços |
| `notify-dispatch` e Auth para e-mail transacional (Resend) | provedor de e-mail | e-mail e texto do aviso | provedor de serviços |
| `notify-dispatch` para WhatsApp Cloud API (Meta) [PLANEJADO: fase 2 em `docs/pesquisa/whatsapp-e-email.md`] | Meta | telefone e variáveis do modelo | provedor de serviços [CONDICIONAL: depende de parecer] |
| `asaas-onboard`, `payments-create`, `charges-create`, `subscriptions-manage` para o Asaas | Asaas | nome, e-mail, telefone, CPF/CNPJ, data de nascimento, renda, endereço, valores | **marcar "compartilhado"** (leitura conservadora; ver nota) |
| `request-assist` para a Anthropic | Anthropic | texto do pedido | a função existe, mas **o app não a chama hoje** (busca em `pages`, `components`, `services`). [PLANEJADO]. Ao ligar, reabrir o formulário e a Política (G03: integrações de IA de terceiros continuam sob a política) |
| Links externos tocados pelo usuário | OpenStreetMap (coordenadas na URL), WhatsApp (`wa.me`), fatura do Asaas | o que está no link | ação iniciada pelo usuário: não conta como compartilhamento (G01) |
| SDK de análise, anúncios, falhas ou push | nenhum | | `package.json` só tem Capacitor (`core`, `app`, `android`, `ios`), `@supabase/supabase-js`, `lucide-react`, `react`, `react-dom`, `react-router-dom`; sem `google-services.json` |

Nota sobre o Asaas: ele recebe os dados por chamada de servidor a servidor e também os trata para abrir e manter a conta de recebimento (obrigação dele). Marcar "compartilhado" é a leitura conservadora. Se o advogado entender que o Asaas age só em nome do WorkEasy (provedor de serviços, G01), os tipos marcados abaixo com "Sim (Asaas)" passam para "Não". O fato de o Asaas manter esses cadastros depois da exclusão da conta no WorkEasy (seção 10.3) reforça a leitura conservadora. [CONDICIONAL: depende de parecer]

### 8.3 Respostas por tipo de dado

Perfil: A = sem Cuidado, B = com Cuidado. Se o código ficar como hoje, use todas as linhas. Finalidades possíveis (G01): Funcionalidade do app; Análise; Mensagens do desenvolvedor; Publicidade ou marketing; Segurança, conformidade e prevenção de fraudes; Personalização; Gerenciamento de contas. **Análise, Publicidade ou marketing e Personalização ficam desmarcadas em todos os tipos.**

| Categoria e tipo (como no Console) | Coletado | Compartilhado | Obrigatório ou opcional | Finalidades | Perfil |
|---|---|---|---|---|---|
| Local > Local aproximado | Sim | Não | Obrigatório | Funcionalidade do app | A e B |
| Local > Local exato | Sim | Não | Opcional | Funcionalidade do app | só B |
| Informações pessoais > Nome | Sim | Sim (Asaas) | Obrigatório | Funcionalidade do app; Gerenciamento de contas | A e B |
| Informações pessoais > Endereço de e-mail | Sim | Sim (Asaas) | Obrigatório | Funcionalidade do app; Gerenciamento de contas; Mensagens do desenvolvedor | A e B |
| Informações pessoais > IDs de usuários | Sim | Não | Obrigatório | Funcionalidade do app; Gerenciamento de contas; Segurança, conformidade e prevenção de fraudes | A e B |
| Informações pessoais > Endereço | Sim | Sim (Asaas) | Opcional | Funcionalidade do app; Segurança, conformidade e prevenção de fraudes | A e B |
| Informações pessoais > Número de telefone | Sim | Sim (Asaas) | Obrigatório | Funcionalidade do app; Gerenciamento de contas; Mensagens do desenvolvedor | A e B |
| Informações pessoais > Outras informações | Sim | Sim (Asaas) | Obrigatório | Funcionalidade do app; Segurança, conformidade e prevenção de fraudes | A e B |
| Informações financeiras > Histórico de compras | Sim | Sim (Asaas) | Opcional | Funcionalidade do app; Segurança, conformidade e prevenção de fraudes | A e B |
| Informações financeiras > Outras informações financeiras | Sim | Sim (Asaas) | Opcional | Funcionalidade do app; Segurança, conformidade e prevenção de fraudes | A e B |
| Saúde e fitness > Informações sobre saúde | Sim | Não | Opcional | Funcionalidade do app | só B [CONDICIONAL: depende de parecer] |
| Mensagens > Outras mensagens no app | Sim | Não | Opcional | Funcionalidade do app | A e B |
| Fotos e vídeos > Fotos | Sim | Não | Obrigatório | Funcionalidade do app; Segurança, conformidade e prevenção de fraudes | A e B |
| Arquivos e documentos > Arquivos e documentos | Sim | Não | Obrigatório | Funcionalidade do app; Segurança, conformidade e prevenção de fraudes | A e B |
| Contatos > Contatos | Sim | Não | Opcional | Funcionalidade do app | A e B |
| Atividade em apps > Outro conteúdo gerado pelo usuário | Sim | Não | Obrigatório | Funcionalidade do app | A e B |

Por que cada escolha:

- **Obrigatório** onde alguém precisa do dado para usar a função principal do seu papel (G01: não declare opcional se for obrigatório para qualquer usuário). E-mail e telefone: a pessoa entra por **um dos dois**; declarei os dois como obrigatórios por ser a leitura conservadora.
- **Local aproximado:** o bairro escolhido no pedido, os bairros que o profissional atende e a cidade do perfil. Não vem do GPS. Escolhi declarar porque a definição inclui "cidade em que ele está" (G01).
- **Outras informações:** CPF/CNPJ, data de nascimento, tipo de empresa, número de registro em conselho (obrigatório nas ocupações regulamentadas) e, no perfil B, ano de nascimento da pessoa cuidada.
- **Contatos:** o cadastro de clientes do profissional (Pro) guarda nome, telefone e e-mail digitados por ele. O app **não lê a agenda do aparelho**. Declarei por ser, literalmente, informação sobre contatos do usuário (G01). [CONDICIONAL: depende de parecer]
- **Informações sobre saúde (perfil B):** preferências, contato de emergência e o relatório do dia (refeições, atividades, humor, observações) são texto livre sobre a pessoa cuidada. A tela avisa "O WorkEasy não guarda dados de saúde", mas o campo aceita qualquer texto. Declarar evita divergência com o comportamento real; se o advogado concluir o contrário, retirar. Em qualquer dos casos, a frase do aviso (`components/cuidado/HealthDataNotice.tsx`) e a Política precisam dizer a mesma coisa que o formulário.
- **Outras mensagens no app:** o texto da proposta (`proposals.message`, opcional) e as anotações do atendimento. Não existe chat.
- **Mensagens do desenvolvedor** em e-mail e telefone: os avisos transacionais (proposta recebida, atendimento confirmado, lembrete). **Publicidade ou marketing** fica desmarcada: o consentimento "Comunicações de novidades" é gravado, mas nenhum envio de marketing existe no código. Se passar a existir, marcar.
- **Sem alterar a resposta:** o formulário vale para o app inteiro, em todos os países (G01).

**Criptografia em trânsito e exclusão, por tipo.** O Console pergunta as duas coisas **uma vez para o app inteiro** (seção 8.5), não por tipo. A tabela serve para conferir a Política de Privacidade tipo a tipo. Em trânsito vale o mesmo para os 16 tipos: do app para o Supabase, só por HTTPS; as chamadas das funções ao Asaas e aos outros provedores são de servidor para servidor e ficam fora desta pergunta. Exclusão, na exclusão da conta (seção 10.3):

| Tipo | Apagado com a conta? |
|---|---|
| Local aproximado | Sim: cidade do perfil, bairros do profissional e pedidos saem com o login; o atendimento que fica não guarda bairro |
| Local exato (B) | Sim: as coordenadas dos registros de plantão são apagadas |
| Nome, E-mail, Número de telefone | Sim no WorkEasy. O que foi enviado ao Asaas para o cadastro de pagador e a subconta **fica lá** |
| Endereço, Outras informações financeiras | Não são gravados em tabela do WorkEasy; ficam no Asaas |
| Outras informações | Sim no WorkEasy: registro profissional e ano de nascimento da pessoa cuidada saem; o `payments.raw` (retorno do Asaas) é reduzido aos campos fiscais do pagamento. O que foi enviado ao Asaas **fica lá** |
| IDs de usuários | **Parcial**: o identificador interno continua em `audit_log` e em `booking_events.actor_id` |
| Histórico de compras | **Não**: os pagamentos ficam sem vínculo com a conta (guarda fiscal) |
| Informações sobre saúde (B), Outras mensagens, Fotos, Arquivos e documentos, Contatos | Sim |
| Outro conteúdo gerado pelo usuário | Sim, exceto a nota da avaliação, que fica sem comentário e sem vínculo com a conta |

### 8.4 Onde cada dado nasce no produto (evidência)

| Tipo | Origem no produto |
|---|---|
| Local aproximado | `requests.neighborhood_id`, `provider_neighborhoods`, `providers.base_neighborhood_id`, `households.neighborhood_id` (B), `profiles.city` |
| Local exato (B) | `platform/geolocation.ts` (`navigator.geolocation`, alta precisão, 6 casas) para `components/cuidado/CheckinPanel.tsx` e `checkins.lat`, `checkins.lng` |
| Nome | `profiles.full_name`, `providers.display_name`, `provider_clients.name`, `quotes.client_name`, `care_recipients.first_name` (B) |
| E-mail | login por e-mail (`services/auth.ts`), `provider_clients.email`, conta de recebimento e cobrança no Asaas, `notifications.email` |
| IDs de usuários | `auth.users.id`, `providers.slug` (página pública), sessão do Supabase guardada pelo WebView, `audit_log.actor_id` |
| Endereço | formulário "Recebimento dos clientes" (`/pro/assinatura#recebimento`) enviado a `asaas-onboard`; não é gravado em tabela do WorkEasy |
| Número de telefone | login por SMS, `profiles.phone`, `provider_clients.phone`, `quotes.client_phone`, `notifications.phone`, Asaas |
| Outras informações | `asaas-onboard` (CPF/CNPJ, data de nascimento, tipo de empresa), `payments-create`, `charges-create` e `subscriptions-manage` (CPF/CNPJ do pagador, enviado ao Asaas; a migração `06_payments` diz que o `payments.raw`, coluna só do servidor, guarda o retorno do Asaas com dados fiscais do pagador), `provider_occupations.registry_number` e `registry_uf`, `care_recipients.birth_year` (B) |
| Histórico de compras | `payments`, `subscriptions`, `bookings.price_cents`, `quotes.total_cents` |
| Outras informações financeiras | renda ou faturamento mensal (`income_value_cents`) enviado a `asaas-onboard`; não gravado em tabela |
| Informações sobre saúde (B) | `care_recipients.preferences`, `care_recipients.emergency_contact`, `daily_reports.meals`, `activities`, `mood`, `notes` |
| Outras mensagens no app | `proposals.message`, `bookings.notes` |
| Fotos, Arquivos e documentos | bucket privado `provider-documents` (JPG, PNG, WebP, HEIC e PDF, até 10 MB), tabela `provider_documents` |
| Contatos | `/pro/clientes` (`provider_clients`), digitado pelo profissional |
| Outro conteúdo gerado pelo usuário | `providers.bio`, `services.title` e `description`, `requests.description`, `reviews.comment`, `quotes.items`, `households.notes` (B) |

### 8.5 Práticas de segurança (parte final do formulário)

| Pergunta | Resposta | Por quê |
|---|---|---|
| Todos os dados coletados são criptografados em trânsito? | **Sim** | o app fala só com o Supabase por HTTPS; o Capacitor serve os arquivos em `https://localhost`; sem `server.cleartext` em `capacitor.config.ts`. Confirme que `VITE_SUPABASE_URL` é `https://`. Não afirme mais que isso: o formulário não pergunta de criptografia em repouso e este documento não a afirma |
| Você oferece um jeito de pedir a exclusão dos dados? | **Sim**, com o `[URL-EXCLUSAO-DE-CONTA]` | seção 10 |
| Compromisso com a Política para Famílias | Não | o app não é para crianças (G26) |
| Análise independente de segurança | Não | não existe |

### 8.6 Tipos que **não** se marcam (e por quê)

- Informações de pagamento do usuário: o cartão é pago na página do Asaas e o app nunca o recebe (G01, condições do serviço de pagamento).
- Score de crédito; raça e etnia; posicionamento político ou religioso; orientação sexual.
- E-mails e SMS (o app não lê as mensagens do aparelho); todos os de áudio; vídeos; eventos da agenda do aparelho.
- Histórico de pesquisa no app: a busca do catálogo roda no aparelho; a consulta de profissionais (`search_providers`) recebe a ocupação e o bairro e **não grava** a consulta. É processamento efêmero (G01) [incerto: conferir se o hospedeiro registra consultas]. Informações sobre condicionamento físico: ver nota do perfil B acima.
- Apps instalados; histórico de navegação; registros de falhas, diagnósticos e outros dados de desempenho (sem SDK); identificadores do dispositivo (sem SDK, sem ID de publicidade); interações no app e outras ações (sem análise; `log_event` não é chamado pelo cliente).
- Endereço IP: o WorkEasy não o usa para localização nem para identificar o aparelho. Registros de infraestrutura do hospedeiro e do provedor de SMS ficam fora deste formulário [incerto: confirmar nos documentos deles] (G01 FAQ sobre IP).

### 8.7 Quando reabrir o formulário

Ao ligar o Cuidado; ao chamar `request-assist` no app; ao adotar SDK de análise, falhas ou push; ao enviar marketing; ao escolher o provedor de SMS ou WhatsApp; ao trocar o tratamento do Asaas; ao ligar comissão ou pagamento retido; ao mudar qualquer resposta da Política de Privacidade. As respostas precisam ser precisas e completas, e o Google pode bloquear atualizações ou remover o app por divergência (G01).

---

## 9. Permissões (manifesto) e justificativas

Manifesto de hoje (`apps/web/android/app/src/main/AndroidManifest.xml`): `INTERNET`, `CAMERA`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `uses-feature` de câmera e GPS com `required="false"`. Os plugins do Capacitor em uso são só `@capacitor/app` (botão voltar); os manifestos das bibliotecas `@capacitor/android` e `@capacitor/app` estão vazios.

| Permissão | Uso real | Perfil A | Perfil B | Justificativa (Console, se perguntado) |
|---|---|---|---|---|
| `INTERNET` | toda chamada ao Supabase | manter | manter | normal; sem tela de permissão |
| `CAMERA` | só `pages/Verification.tsx`, simulação em que nada é capturado, enviado ou guardado (`getUserMedia` no WebView) | **remover** | **remover** | recurso não existe na versão de loja. O envio de documentos usa o seletor de arquivos do sistema (sem `capture`); no código do Capacitor a câmera só é pedida quando o campo de arquivo usa `capture` (`BridgeWebChromeClient.onShowFileChooser`) |
| `ACCESS_FINE_LOCATION` | `locate()` com `enableHighAccuracy: true`, só no registro de entrada ou saída de plantão | **remover** | manter | texto abaixo |
| `ACCESS_COARSE_LOCATION` | o Capacitor pede as duas juntas (`onGeolocationPermissionsShowPrompt`); no Android 12 ou mais novo o usuário pode conceder só a aproximada e o registro continua válido | **remover** | manter | texto abaixo |
| Não pedidas | `ACCESS_BACKGROUND_LOCATION`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, `READ_EXTERNAL_STORAGE`, `RECORD_AUDIO`, contatos, SMS, ligações, `POST_NOTIFICATIONS`, `AD_ID` | | | conferir no manifesto mesclado (14.5) |

**Justificativa da localização (perfil B), pt-BR:** "O WorkEasy usa a localização do aparelho somente quando o cuidador toca em Registrar entrada ou Registrar saída de um plantão e marca a opção Enviar minha localização neste registro. É opcional, é lida uma vez, com o app aberto, fica salva junto do registro e é mostrada à família daquele plantão. Sem localização o registro vale do mesmo jeito."

**Em inglês, se o revisor perguntar:** "The app reads the device location once, in the foreground, only when a caregiver taps Check in or Check out on a care shift and ticks the optional box to send the location. It is stored with that record and shown to the family that booked the shift. The record works without it."

Pontos da política que este uso precisa atender:

- **Escopo mínimo:** a política manda pedir a localização aproximada em vez da exata e em primeiro plano em vez de segundo plano, quando o recurso permitir (G04). A exata se justifica por registrar **onde** foi feito o registro; o app trata a concessão só da aproximada sem quebrar. Se o revisor insistir em aproximada, o recurso perde valor: decisão do dono.
- **Declaração em destaque e consentimento:** a divulgação precisa estar no app, no uso normal, descrever o dado, dizer como é usado e compartilhado, e vir **antes** do pedido do sistema (G03). Hoje o `CheckinPanel` mostra a caixa "Enviar minha localização neste registro", com o texto "A família vê onde o registro foi feito. É opcional...", e grava o consentimento `location` antes de ler a posição. Ajuste o texto ao modelo do Google ("O WorkEasy coleta [dado] para [recurso]...") em L11 (`docs/juridico/11-textos-de-consentimento-e-avisos.md`) [PLANEJADO] (G03).
- **Mudança futura:** a Ajuda anuncia que, a partir de **27/01/2027**, o botão de localização passa a ser o escopo mínimo recomendado para localização exata (G04). Reveja este item até lá.

---

## 10. Exclusão de conta

O Google exige as duas coisas: um **caminho no app** e um **link web** no formulário de Segurança dos dados (G02, G03). O WorkEasy tem a primeira e não tem a segunda (B03).

### 10.1 Caminho no app (conferido no código)

Entrar (código por e-mail ou SMS) > no celular, menu de três linhas no topo > "Minha conta" (em tela larga, o avatar no topo) > `/conta` > seção **Excluir minha conta** > digitar `EXCLUIR` > botão "Excluir minha conta". Arquivos: `pages/conta/Conta.tsx` (`DeleteSection`), `services/account.ts` (`deleteMyAccount`, `DELETE_CONFIRMATION`), Edge Function `account-delete`. A mesma tela tem "Baixar meus dados" (função `account-export`).

### 10.2 Regras da função `account-delete`

- Recusa com erro 409 `active_bookings` se há atendimento `accepted`, `paid`, `in_progress` ou `disputed`. A página web precisa dizer isso (G02: "etapas antes de excluir" devem estar descritas).
- Cancela a assinatura Pro e as cobranças `pending` no Asaas. Se uma cobrança é paga nesse intervalo, responde 409 `payment_in_progress`. Sem Asaas configurado e com cobrança ou assinatura, responde 503 `payments_not_configured`. Se faltar a chave da subconta para cancelar uma cobrança do profissional, o erro é registrado, a exclusão segue e a cobrança fica para o suporte cancelar no painel do Asaas.
- Esvazia a pasta `provider-documents/<user_id>/` no Storage, chama `anonymize_user` e apaga o usuário do Auth. A exclusão corre no ato da confirmação, sem fila de análise.

### 10.3 O que é apagado e o que fica (`anonymize_user` e `docs/ARQUITETURA.md`)

| | Itens |
|---|---|
| **Apagado ou esvaziado** | nome, telefone e cidade do perfil; página, nome público, bio e dados do profissional; documentos (arquivos e registros); bairros e disponibilidade; nomes, telefones e e-mails do cadastro de clientes; nome e telefone nos orçamentos; texto dos pedidos e datas preferidas; comentário das avaliações; anotações e motivos de cancelamento dos atendimentos; coordenadas dos registros de plantão; nome, notas e dados das casas e das pessoas cuidadas; contato nas notificações; o login do Auth |
| **Apagado junto com o login (cascata)** | pedidos do cliente e as propostas deles; casas, pessoas cuidadas, plantões, registros de entrada e saída e relatórios da família; orçamentos e estado da assinatura do profissional; documentos; notificações; consentimentos |
| **Fica, sem vínculo com a conta** | atendimentos (`client_id` e `provider_id` ficam vazios; sem anotações nem motivo de cancelamento); eventos do atendimento (sem motivo, mas **com o identificador interno de quem agiu**, `actor_id`); pagamentos (valor, data, situação; o payload do gateway só com campos fiscais); avaliações sem comentário; entradas do cadastro de clientes de **outros** profissionais, como "Cliente removido"; o registro do pedido de exclusão (`data_requests`) |
| **Fica, imutável** | `audit_log` (registro técnico das ações): guarda o identificador interno da conta e dados técnicos de cada ação; o texto livre de motivos de administrador não é apagado |
| **Fica no Asaas, fora do WorkEasy** | o cadastro de pagador criado para a assinatura Pro e a conta de recebimento (subconta) do profissional, com o que o WorkEasy enviou ao abri-los (`payments-create`, `asaas-onboard`). A função cancela a assinatura e as cobranças em aberto, mas o cliente HTTP do Asaas do repositório (`supabase/functions/_shared/asaas-client.ts`) não tem operação para excluir cliente nem subconta, e nenhuma é chamada na exclusão. Prazo e pedido de exclusão no Asaas: [incerto: não abri a política do Asaas] |

O motivo de manter pagamentos e atendimentos é a guarda fiscal e a resolução de disputas (`docs/DECISOES.md` D7, com prazo marcado como [incerto: confirmar com o contador]). **A Política de Privacidade precisa dizer isso** (G02: reter dado por razão legítima exige informar a prática de retenção; G03). Backups do hospedeiro [incerto: prazo em `docs/pesquisa/supabase-producao.md`]. Para o dev (fora do escopo desta entrega): a chave de API da subconta do Asaas fica no Vault do Supabase e, na busca por `vault` em migrações e funções, não achei código que a apague na exclusão (a linha de `provider_payment_accounts` sai em cascata; o segredo no Vault não).

### 10.4 Página web de exclusão (`[URL-EXCLUSAO-DE-CONTA]`) [PLANEJADO]

Requisitos da Ajuda (G02): o link precisa carregar sem erro; o caminho para excluir precisa estar **em destaque**; precisa citar o **nome do app ou do desenvolvedor** como aparecem no Play; precisa permitir o pedido **sem reinstalar o app**; se há etapas antes (como cancelar assinatura), precisam estar descritas; precisa existir fluxo de suporte. O site do WorkEasy é o mesmo código React, então `/conta` funciona no navegador. Duas formas de publicar a página: rota `/excluir-conta` no app web, ou arquivo estático `public/excluir-conta.html` (o `_redirects` com `/* /index.html 200` não atrapalha arquivo estático existente [incerto: depende do hospedeiro]). Em ambos, **tire `/excluir-conta` do `robots.txt`**.

Texto sugerido (rascunho para o advogado):

```text
Excluir conta do WorkEasy

Esta página explica como excluir a sua conta no WorkEasy e os dados ligados a ela. O WorkEasy é o aplicativo e o site de [RAZÃO SOCIAL] (CNPJ [CNPJ]).

Como excluir
1. Entre em https://[DOMÍNIO]/entrar com o e-mail ou o celular da conta. Você recebe um código de 6 dígitos.
2. Abra Minha conta e vá até a seção "Excluir minha conta".
3. Digite EXCLUIR e toque em "Excluir minha conta".
[Botão: Entrar e excluir minha conta]  (leva a /entrar?next=/conta)
Você também pode fazer o mesmo no aplicativo, em Minha conta.

Antes de excluir
- Se você tem atendimentos aceitos, pagos, em andamento ou em disputa, conclua ou cancele esses atendimentos primeiro. Enquanto houver algum, a exclusão é recusada e o app explica o motivo.
- A assinatura do plano Pro, se houver, e as cobranças em aberto são canceladas por nós no momento da exclusão. Você não precisa fazer isso antes.
- Se um pagamento estiver sendo confirmado, a exclusão pede para você tentar de novo em alguns minutos.

O que é apagado
Nome, telefone e cidade do perfil, página e dados de profissional, documentos enviados, textos de pedidos, avaliações e anotações, coordenadas de registros de plantão, dados de casas e de pessoas cuidadas e o login.

O que fica guardado, e por quê
Pagamentos e atendimentos já realizados ficam registrados sem o seu nome nem seus contatos, porque a obrigação fiscal exige guardar esses registros. Um registro técnico das ações da plataforma, que não pode ser alterado, mantém o código interno da conta e dados técnicos das ações. O Asaas, empresa que processa os pagamentos, guarda por conta própria o cadastro de pagador e a conta de recebimento: a exclusão no WorkEasy cancela a assinatura e as cobranças em aberto, mas não pede ao Asaas que apague esses cadastros. Como pedir a exclusão a ele: [CONTATO: definir com o advogado]. Prazos de guarda: [PRAZO: definir com o advogado].

Não consegue entrar?
Escreva para [E-MAIL DO ENCARREGADO] com o nome e o e-mail ou o celular da conta. Confirmamos a sua identidade e respondemos em [PRAZO: definir com o advogado].
```

### 10.5 No Console

Segurança dos dados > "Você oferece um jeito de pedir a exclusão dos dados?" = **Sim**, e o campo de URL da exclusão de conta com `[URL-EXCLUSAO-DE-CONTA]`. O selo vale mesmo com retenção por motivo legal ou prevenção de abuso (G01). Depois de publicado, **abra o link num navegador sem sessão** e confira que a página carrega e mostra o caminho.

---

## 11. Pagamentos e a política de faturamento do Google

### 11.1 O que a política oficial diz

- O Play Billing é obrigatório para pagamento de "recursos ou serviços, incluindo funcionalidades do app", como "novos recursos indisponíveis na versão gratuita" e "software e serviços em nuvem ... software de gerenciamento financeiro" (G05).
- O Play Billing **não pode** ser usado quando o pagamento é principalmente "para a compra de serviços físicos (como serviços de transporte, limpeza, passagem aérea, academia, entrega de comida, ingressos para eventos ao vivo)" (G05). Essa é a **declaração oficial** que isenta o pagamento do serviço contratado.
- Fora essas exceções, o app **não pode levar o usuário a outro meio de pagamento** por botões, links, mensagens, WebViews ou fluxos de tela (G05).
- Transações de serviços clínicos regulamentados não usam o Play Billing (G11).
- Em países elegíveis há programas: faturamento alternativo no app e direcionamento para fora do app (G05). **O Brasil está na lista do piloto de escolha de faturamento do usuário**; exige desenvolvedor registrado como empresa, oferecer o Play Billing junto, integrar as APIs de faturamento alternativo, ter suporte e disputa de transação, e pagar taxa de serviço (padrão reduzida em 4%) (G06).

### 11.2 Aplicação ao WorkEasy

| Fluxo | Regra | Situação |
|---|---|---|
| Cliente paga o profissional por serviço presencial (limpeza, reforma, beleza, aula em casa) via Asaas | isento: serviço físico (G05) | pode seguir fora do Play Billing |
| Serviço prestado **só à distância** (aula online, tradução, design, consultoria, telessaúde) | o texto cita serviços físicos e pagamentos entre pessoas; serviço remoto **não está listado** [incerto] | perguntar ao suporte do Play Console por escrito antes do lançamento, e guardar a resposta. Opção prudente: no build de loja, não cobrar pelo app serviços só online |
| Profissional cobra **cliente dele** (Pro, "Cobranças") | pagamento por serviço do profissional, via Asaas | isento se o serviço for físico (G05) |
| **Assinatura do Pro** (R$ 49,00 por mês, teste de 30 dias, propostas sem limite e cobranças) | funcionalidade do app indisponível no plano grátis: **exige Play Billing** (G05). Hoje é vendida dentro do app e paga no Asaas (`pages/pro/Assinatura.tsx`); o erro `free_proposal_limit` manda o usuário ao Pro; `pages/pro/Painel.tsx` tem "Conhecer o plano Pro" | **viola** a política no build de loja (B06) |

### 11.3 Opções para o Pro (decisão D4)

| Opção | Como fica | Custo e risco |
|---|---|---|
| **A. Não vender no Android (recomendada para a versão 1)** | tirar a compra e as frases de incentivo do build de loja (M05); o Pro continua vendido no site | nenhuma integração nova. [incerto] se o Google aceita o app **usar** uma assinatura comprada fora: o texto aberto proíbe levar o usuário ao pagamento, mas não trata desse consumo. Pergunte ao suporte |
| B. Play Billing para o Pro | plugin nativo, validação da compra no servidor e sincronização com `providers.plan` | trabalho de código [PLANEJADO]; taxa do Google; rever a divulgação do teste de 30 dias (G07) |
| C. Piloto de escolha de faturamento | Asaas **ao lado** do Play Billing | exige a opção B e empresa (G06) |
| D. Sem Pro no Android | plano grátis só | menos receita no Android |

Se adotar B ou C, a política de Assinaturas pede termos, preço, ciclo, renovação automática e **como e quando o teste vira cobrança**, tudo antes da inscrição, e um jeito fácil de cancelar dentro do app (G07). O app já tem o botão "Cancelar assinatura". A pergunta 7 do advogado em `docs/DECISOES.md` (aviso e cancelamento do teste de 30 dias) vale também aqui.

---

## 12. Conteúdo gerado pelo usuário (UGC)

A política define UGC como a contribuição do usuário visível a pelo menos um grupo de usuários, e cita avaliações em apps de comércio eletrônico como exemplo (G27, G28). No WorkEasy: bio, título e descrição dos serviços, avaliações, propostas e relatórios do Cuidado.

O que a política exige (G27, G28) e como está:

| Exigência | Situação hoje |
|---|---|
| Aceitar os Termos antes de criar conteúdo | **Existe**: caixa no `/entrar` e `TermsGate` registram o aceite em `consents`. Os Termos ainda não estão publicados (B02) |
| Termos definem conteúdo e comportamento censurável, separados da Política | **Em elaboração**: a minuta `docs/juridico/01-termos-de-uso.md` (L01) traz a cláusula "Conduta e usos proibidos" (hoje a 10). Falta publicar (B02) e fazer o mesmo nos Termos do Prestador (L02) |
| Sistema **no app** para denunciar conteúdo e usuários | **Falta** (B04, M06). A minuta (hoje 10.2, "Como denunciar") manda escrever ao SAC; o Google pede um sistema dentro do app (G27), então, ao fazer a M06, atualize essa cláusula |
| Bloquear usuário em interação individual (proposta, atendimento) | **Falta** (M06) |
| Moderação contínua e ação em tempo hábil | existe o admin (`reviews_admin_update`, `admin_set_provider_status`); falta a fila de denúncias |

A Ajuda recomenda dois controles separados e claramente rotulados para denunciar e bloquear (G28).

---

## 13. Acesso para o revisor (conta de teste)

### 13.1 O que o Google exige

Se o app é restrito por login, informar tudo o que for preciso (até cinco conjuntos de instruções) (G24). Os dados de login precisam estar **sempre acessíveis, reutilizáveis e válidos**; se o app usa senha única, informe credenciais reutilizáveis que possam ignorar esse requisito, em **inglês** (G25). Sem isso o app pode ser recusado (G25). Se há conteúdo atrás de assinatura, dar acesso livre a ele (G25).

**Conflito a decidir (D3, B09).** O OTP fixo do Supabase só existe para **celular**. A pesquisa de canais (`docs/pesquisa/whatsapp-e-email.md` seção 1.1) recomenda lançar só com e-mail e **tirar a aba Celular**. Sem a aba, o revisor não tem como entrar. Escolha uma:

| Opção | O que fazer | Custo e risco |
|---|---|---|
| **1. Manter a aba Celular com o OTP fixo para o revisor** | ligar o canal de celular (SMS por provedor ou, na fase 2, WhatsApp pelo hook) com CAPTCHA e limites antes (`docs/pesquisa/whatsapp-e-email.md`, seções 1.1 a 1.3) | a pesquisa recomenda **não** lançar com SMS (custo por código e fraude de tarifa); sem CAPTCHA o risco de abuso é alto (hoje não há CAPTCHA) |
| 2. Entrada de revisão por senha | código novo e protegido, só para contas de teste [PLANEJADO] | caminho extra de login: exige revisão de segurança |
| 3. Aba Celular ligada só enquanto durar a revisão | flag de build (M09) | o app que passa na revisão não é o app de produção: **não recomendado** |

A opção 1 é a que usa mecanismo suportado pelo Supabase e segue o texto do Google.

### 13.2 OTP fixo no Supabase (celular)

O Supabase expõe `sms_test_otp` e `sms_test_otp_valid_until` em `PATCH /v1/projects/{ref}/config/auth` (S01). `sms_test_otp` aceita só `número=código`, separados por vírgula (padrão `^([0-9]{1,15}=[0-9]+,?)*$`); o número vai **só com dígitos, com 55 e DDD** (13 dígitos, no formato do exemplo local abaixo) e o código tem **6 dígitos** (o app confere 6, `services/auth.ts`; no projeto hospedado, `sms_otp_length` e `mailer_otp_length` precisam continuar em 6, como o `otp_length = 6` do `config.toml` local). O app só aceita celular brasileiro de 11 dígitos, com o 9 depois do DDD (`toE164MobileBR` em `lib/phone.ts`), e o envia ao Auth como `+55DDDNNNNNNNNN`. O stack local do repositório tem o mesmo recurso em `[auth.sms.test_otp]`, com o comentário "Never copy this block to a hosted project" (o número local `5511999990000` com código `123456` é só de desenvolvimento) e avisa que, localmente, **o Auth recusa o login por celular sem provedor de SMS habilitado, mesmo para o número de teste**.

```bash
# NÃO commite o token. SUPABASE_ACCESS_TOKEN é um token pessoal da sua conta Supabase.
export SUPABASE_ACCESS_TOKEN="..."      # guardado no gerenciador de senhas
export PROJECT_REF="[REF-DO-PROJETO]"
curl -sS -X PATCH "https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sms_test_otp":"[CELULAR-1]=[CODIGO-1],[CELULAR-2]=[CODIGO-2],[CELULAR-3]=[CODIGO-3]","sms_test_otp_valid_until":"[DATA-LIMITE-ISO]"}'
```

Conferi o formato no esquema OpenAPI do Supabase (S01); **não testei** num projeto hospedado (não há projeto). [incerto] O que `sms_test_otp_valid_until` faz exatamente depois do prazo: o esquema só diz que é data e hora. Teste no projeto de homologação: depois do prazo, o código fixo deve parar de valer.

**Números.** Use celulares **que você controla** (chips da empresa), nunca números de terceiros: não há faixa de celular reservada que eu tenha confirmado [incerto], e, quando o código fixo expirar ou for removido, um pedido de código **manda SMS de verdade** ao titular do número.

**Com o hook Send SMS.** Se o celular for ligado pelo hook Send SMS (fase 2 de `docs/pesquisa/whatsapp-e-email.md`), não sei se os números de teste passam por cima do hook [incerto]. Teste na homologação antes de depender disso.

### 13.3 Contas de teste

| Conta | Papel | Estado | Para quê |
|---|---|---|---|
| 1 | cliente | criada pelo primeiro login | pedir serviço, propostas, atendimentos, Minha conta |
| 2 | profissional | cadastro completo, ocupação e documentos de exemplo (nada real), situação `approved`; plano Pro ligado **por quem tem a service role**, pelo mesmo caminho de `setProviderPlan` (sem pagar); nome "Conta de teste Google Play (não contratar)" | área do profissional sem paywall (G25) |
| 3 | cliente descartável | criada pelo primeiro login | testar "Excluir minha conta" |

Pontos de atenção: o profissional aprovado aparece na busca pública; deixe-o **sem horários de disponibilidade** e com nome claro de teste, e desative-o antes do lançamento público se não for mais necessário [incerto: efeito sobre o fluxo do revisor]. Ao excluir a conta 3 o revisor a perde: **recrie-a** a cada ciclo de revisão. O Console aceita até cinco conjuntos de instruções (G24).

### 13.4 Texto para o campo "Acesso de apps" (em inglês, G25)

```text
Sign-in uses a one-time code (no password). For review we provide three accounts whose code is fixed and reusable, so no SMS or e-mail is needed. The app UI is in Brazilian Portuguese; the service area is Sao Paulo, Brazil.

Account 1 - Client
1. Open the app, open the menu (three-line icon, top right) and tap "Entrar".
2. Tap the "Celular" tab and type [CELULAR-1] (format: (11) 9XXXX-XXXX).
3. Tick the box accepting the Terms of Use and the Privacy Policy, then tap "Enviar código".
4. Type the code [CODIGO-1] and tap "Entrar".

Account 2 - Professional (registration already approved, Pro plan already active, no payment needed)
Same steps with [CELULAR-2] and the code [CODIGO-2].

Account 3 - Disposable client, only to test account deletion
Same steps with [CELULAR-3] and the code [CODIGO-3]. Deletion path: menu (top right) > "Minha conta" > "Excluir minha conta" > type EXCLUIR. If this account is deleted we recreate it.

Notes
- No payment is required to review any screen. Card and boleto payments use a third-party hosted page; please do not enter real payment data.
- Account deletion can also be requested on the web: [URL-EXCLUSAO-DE-CONTA].
- Support: [E-MAIL DO SAC].
```

### 13.5 Riscos e como remover

| Risco | Mitigação |
|---|---|
| Quem souber número e código entra naquela conta | contas sem dado real, sem papel de admin, sem dado de pagamento; prazo curto em `sms_test_otp_valid_until`; trocar o código a cada ciclo |
| O Google pode reanalisar **cada atualização** e as credenciais precisam continuar válidas (G25) | não remova enquanto houver atualização em revisão; renove o prazo a cada envio |
| Pedido de código depois da expiração manda SMS de verdade | usar só números seus; remover da lista antes de vencer |
| Conta 2 aprovada visível na busca | sem disponibilidade, nome claro, ocultar ao fim |

**Para remover:** `PATCH` no mesmo endereço com `{"sms_test_otp":"","sms_test_otp_valid_until":null}` (o padrão do esquema aceita texto vazio e os dois campos são `nullable`) [incerto: não testado], conferir no painel do Supabase, e apagar as três contas com a função de serviço ou pelo fluxo de exclusão. Atualize o Console (Acesso de apps) quando mudar.

---

## 14. Build: pacote AAB assinado, versão e chaves

### 14.1 Estado do projeto Android (conferido nos arquivos)

| Item | Valor | Arquivo |
|---|---|---|
| Pacote | `br.com.workeasy` | `capacitor.config.ts`, `android/app/build.gradle` |
| `minSdk`, `compileSdk`, `targetSdk` | 24, 36, 36 | `android/variables.gradle` |
| Android Gradle Plugin, Gradle, Java | 8.13.0, 8.14.3, Java 21 | `android/build.gradle`, `gradle-wrapper.properties`, `capacitor.build.gradle` |
| `versionCode`, `versionName` | 1, `"1.0"` fixos | `android/app/build.gradle` |
| Build de release | `minifyEnabled false`, sem `signingConfig` | `android/app/build.gradle` |
| Versão do web app | `0.1.0` | `package.json` |

O `targetSdk` 36 atende o requisito vigente: desde 31/08/2026, apps novos e atualizações precisam mirar o Android 16 (API 36) (G13). Sem código nativo próprio (só Java e WebView), o app já atende a regra de páginas de 16 KB, que vale para atualizações a partir de 01/02/2027 (A09); confirme no Analisador de APK que não há `.so`.

### 14.2 Esquema de versão

`versionName` é o texto que o usuário vê; `versionCode` é inteiro, **sempre maior** que o anterior, **nunca reutilizado**, no máximo 2.100.000.000 (A03, G21). A numeração vale entre todas as faixas.

Proposta: `versionName = MAJOR.MINOR.PATCH` (igual ao `version` do `package.json`) e `versionCode = MAJOR*1.000.000 + MINOR*10.000 + PATCH*100 + BUILD`, com `BUILD` de 01 a 99 para reenvios da mesma versão.

| versionName | BUILD | versionCode | Uso |
|---|---|---|---|
| 0.1.0 | 1 | 10.001 | primeiro teste interno |
| 0.1.0 | 2 | 10.002 | correção de teste interno |
| 0.2.0 | 1 | 20.001 | teste fechado |
| 1.0.0 | 1 | 1.000.001 | primeira produção |
| 1.0.1 | 1 | 1.000.101 | correção |
| 1.2.3 | 1 | 1.020.301 | exemplo |

### 14.3 Chave de upload e regras do keystore

Com a Assinatura de apps do Google Play, você assina o pacote com uma **chave de upload** (RSA de 2.048 bits ou mais) e o Google guarda a **chave de assinatura do app**. Para apps novos, o app é registrado automaticamente com chaves geradas pelo Google (G19). **Aceite esse padrão.** As chaves precisam ser diferentes (G19).

```bash
# Gere FORA do repositório (por exemplo em ~/workeasy-signing). Conferi estes comandos com JDK 21.0.12 e uma chave descartável.
mkdir -p ~/workeasy-signing && chmod 700 ~/workeasy-signing
keytool -genkeypair -v -keystore ~/workeasy-signing/workeasy-upload.jks \
  -alias workeasy-upload -keyalg RSA -keysize 2048 -validity 10000
# Validade de 10.000 dias, cerca de 27 anos: a documentação pede pelo menos 25 anos (A05).
# Guarde a senha no gerenciador de senhas. O keystore PKCS12 usa a mesma senha para o keystore e para a chave.

# Impressão digital SHA-256 (para conferir o que o Console mostra depois)
keytool -list -v -keystore ~/workeasy-signing/workeasy-upload.jks -alias workeasy-upload | grep SHA256

# Certificado público em PEM (necessário só para pedir redefinição da chave de upload, G19)
keytool -export -rfc -keystore ~/workeasy-signing/workeasy-upload.jks \
  -alias workeasy-upload -file ~/workeasy-signing/upload_certificate.pem
```

**Regras do keystore**

1. **Nunca no Git.** O `.gitignore` da raiz ignora `*.keystore` e `*.aab`, mas **não ignora `*.jks`** (e as linhas do modelo Android em `apps/web/android/.gitignore` estão comentadas). Guarde o arquivo fora da árvore do repositório e adicione `*.jks` e `keystore.properties` ao `.gitignore` (M11).
2. **Duas cópias criptografadas** em lugares diferentes (gerenciador de senhas da empresa e um disco offline). Perder a chave de upload **não** impede de publicar: o Play permite pedir redefinição com um novo certificado PEM (G19). Perder o gerenciador **e** o acesso à conta, sim.
3. **Nada de senha em chat, ticket, log de CI ou histórico do shell.** Se automatizar, use segredos do CI, nunca arquivos no repositório.
4. **Verificação em duas etapas** em toda conta com acesso ao Play Console (G19).
5. Não crie a chave de assinatura do app por conta própria: se for gerenciada fora do Google, não pode ser redefinida (G19).
6. Não use este keystore em outros apps.

### 14.4 Gerar o AAB assinado

Pré-requisitos: Node 22, JDK 21 (Temurin, como em `.github/workflows/web-release.yml`), Android SDK com a plataforma 36 e `ANDROID_HOME` definido (ou `android/local.properties` com `sdk.dir`). **Não executei o build do Android nesta sessão**: não há Android SDK neste ambiente. Executei só `vite build --mode native` em pasta de rascunho (4 s, 3,2 MB) e os comandos de `keytool` e `jarsigner`.

```bash
set -euo pipefail
cd apps/web

# 1. Variáveis de produção (públicas por desenho; nunca coloque chave secreta aqui)
export VITE_SUPABASE_URL="https://[REF-DO-PROJETO].supabase.co"
export VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
export VITE_SITE_URL="https://[DOMÍNIO]"
# VITE_CONCIERGE_WHATSAPP só se for usar o pedido pelo WhatsApp sem backend (não é o caso com backend)
# Variáveis já definidas no shell têm prioridade sobre arquivos .env (V01); .env.native.local também funcionaria e é ignorado pelo Git.

# 2. Guarda: sem URL, ou com uma chave que o app recusa (`lib/supabaseKey.ts` aceita a publicável e a anon legada), o app cai SOZINHO no modo demonstração.
#    Esta guarda é mais estrita que o app: aceita só a chave publicável.
: "${VITE_SUPABASE_URL:?defina a URL do projeto}"
: "${VITE_SUPABASE_PUBLISHABLE_KEY:?defina a chave publicável}"
case "$VITE_SUPABASE_URL" in https://*) ;; *) echo "A URL do Supabase precisa ser https"; exit 1;; esac
case "$VITE_SUPABASE_PUBLISHABLE_KEY" in sb_publishable_*) ;; *) echo "Use a chave publicável (sb_publishable_...)"; exit 1;; esac

# 3. Build web em modo native (rotas com #, sem service worker) e cópia para o projeto Android
npm ci
npm run build:native          # tsc --noEmit && vite build --mode native
# Sem segredo no bundle. O supabase-js contém o texto "sb_secret_" como prefixo, por isso o padrão exige o valor da chave.
if grep -rIEq "sb_secret_[A-Za-z0-9_-]{16,}|service_role|SERVICE_ROLE|ASAAS_API_KEY|WHATSAPP_TOKEN|RESEND_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY" dist; then echo "Segredo no bundle"; exit 1; fi
grep -rIlF "$VITE_SUPABASE_URL" dist >/dev/null || { echo "Bundle sem a URL do Supabase: build em modo demonstração"; exit 1; }
npx cap sync android

# 4. AAB de release (sem signingConfig, sai sem assinatura)
cd android
./gradlew :app:bundleRelease --no-daemon
AAB=app/build/outputs/bundle/release/app-release.aab     # caminho padrão do Gradle do Android; o log mostra o caminho real

# 5. Assinar com a chave de upload (A04). O jarsigner pede as senhas no terminal.
jarsigner -keystore ~/workeasy-signing/workeasy-upload.jks "$AAB" workeasy-upload
# (O apksigner NÃO assina AAB, A04.)

# 6. Conferir a assinatura
jarsigner -verify "$AAB"      # deve terminar em "jar verified."
```

A guarda do passo 3 foi testada contra o bundle de rascunho: passa no bundle limpo e falha quando se injeta uma chave `sb_secret_` completa. O CI do repositório já faz outra varredura (`grep -rIiE "gemini|api_key" dist/` em `web-ci.yml`). [incerto] O caminho do AAB e as mensagens do Gradle: conferir no primeiro build real.

Avisos esperados do `jarsigner`: certificado autoassinado e ausência de carimbo de tempo. É normal para chave de upload.

### 14.5 Conferir o pacote antes de subir

```bash
# Permissões do manifesto mesclado (A06, A07)
bundletool build-apks --bundle="$AAB" --output=/tmp/workeasy.apks --mode=universal
unzip -p /tmp/workeasy.apks universal.apk > /tmp/workeasy-universal.apk
aapt2 dump permissions /tmp/workeasy-universal.apk
# Perfil A: só INTERNET (e a permissão interna de assinatura de DYNAMIC_RECEIVER_NOT_EXPORTED, se aparecer).
# Não pode aparecer com.google.android.gms.permission.AD_ID (G34), CAMERA, READ_MEDIA_*, RECORD_AUDIO.
```

Alternativa sem linha de comando: Android Studio > Build > Analyze APK, abrir o `.aab` e ver o `AndroidManifest.xml` mesclado (A08). Procure `.so`: não deve haver (A09).

### 14.6 Primeiro upload

Testar e lançar > Teste > **Teste interno** > Criar nova versão. Na primeira versão, aceite a Assinatura de apps do Google Play, envie o `.aab`, dê um nome à versão, cole as notas (seção 15), salve, avance e inicie o lançamento (G30). Crie a lista de e-mails dos testadores e copie o link de adesão (G29). Lembre: **ao subir o primeiro artefato o nome do pacote fica fixo** (G29).

### 14.7 Ajustes propostos no Gradle (não aplicados, não testados)

```groovy
// android/app/build.gradle (proposta M10)
def keystorePropertiesFile = rootProject.file("keystore.properties")   // fora do Git
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) keystoreProperties.load(new FileInputStream(keystorePropertiesFile))

android {
    defaultConfig {
        versionCode (project.findProperty('versionCode') ?: '1').toInteger()
        versionName project.findProperty('versionName') ?: '1.0'
    }
    signingConfigs {
        release {
            if (keystorePropertiesFile.exists()) {
                storeFile file(keystoreProperties['storeFile'])
                storePassword keystoreProperties['storePassword']
                keyAlias keystoreProperties['keyAlias']
                keyPassword keystoreProperties['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            if (keystorePropertiesFile.exists()) { signingConfig signingConfigs.release }
        }
    }
}
// uso: ./gradlew :app:bundleRelease -PversionName=1.0.0 -PversionCode=1000001
```

O padrão com `keystore.properties` é o da documentação do Android Studio (A05). Com ele o passo 5 da seção 14.4 some.

Sobre o Capacitor: a documentação do projeto diz que o app é enviado à Google Play Store "just like any other native Android app" (C01). O fluxo acima (AAB, chave de upload, Console) é o de um app Android comum.

---

## 15. Notas da versão (até 500 caracteres por idioma, G30)

Não use as notas para promoção nem para pedir ação (G30). Formato com etiqueta de idioma.

#### Notas da versão 0.1.0 (teste fechado)

```text
<pt-BR>
Versão de teste 0.1.0.
- Pedir serviço, receber e aceitar propostas, agendar com profissionais.
- Área do profissional: cadastro, agenda, propostas e orçamentos por link.
- Minha conta: consentimentos, cópia dos dados e exclusão da conta.
Envie seu feedback pelo canal indicado na página de teste.
</pt-BR>
```

#### Notas da versão 1.0.0

```text
<pt-BR>
Primeira versão do WorkEasy.
- Peça serviços, receba propostas e agende com profissionais de São Paulo.
- Profissionais: cadastro, agenda, propostas e orçamentos por link.
- Minha conta: consentimentos, cópia dos seus dados e exclusão da conta.
</pt-BR>
```

---

## 16. Plano de teste: interno, fechado, produção

| Fase | Quando | Quem | Critério para sair |
|---|---|---|---|
| Interno | dia 0 a 3 | você e até 5 pessoas de confiança (o teste interno aceita até 100 testadores, G29) | entra por e-mail ou SMS; pedido, proposta, agendamento e exclusão funcionam; sem tela de demonstração |
| Fechado | dia 3 a 17 (14 dias seguidos) | 15 a 20 testadores, para sobrar margem sobre os 12 (G14) | pelo menos 12 inscritos nos 14 dias anteriores ao pedido; feedback resumido; **mesmo perfil do build de produção** (seção 2.1) |
| Pedido de produção | dia 17 | dono | só obrigatório em conta pessoal: responder o formulário "Solicitar a produção" (sobre o teste fechado, o app e a prontidão) (G14) |
| Revisão | dia 17 a 24 | Google | pode levar até sete dias, ou mais (G14, G31) |
| Produção | depois | todos no Brasil | a primeira versão não aceita lançamento em porcentagem (G30) |

Testadores precisam de Conta Google (G29). Os testes fechados aceitam listas de e-mail (até 200 listas de até 2.000 pessoas, 50 listas por faixa) ou Grupos do Google (G29). Informe um e-mail ou URL de feedback (G29). O feedback dos testes não afeta a nota pública (G29).

Mix sugerido: 5 clientes, 5 profissionais (inclua 2 de ocupação regulamentada), aparelhos com Android 7 a 9 (o `minSdk` é 24) e telas pequenas.

Roteiro a enviar aos testadores (pt-BR):

```text
Obrigado por testar o WorkEasy. Instale pelo link de teste e use uma conta Google para entrar no teste.
1. Entre com o seu e-mail (ou celular) e o código de 6 dígitos.
2. Peça um serviço: escolha o serviço, o bairro e descreva o que precisa.
3. Se for profissional: faça o cadastro, envie os documentos pedidos e responda a um pedido com uma proposta.
4. Agende um horário na página de um profissional.
5. Abra Minha conta, baixe a cópia dos seus dados e teste Excluir minha conta com uma conta de teste.
Não envie documentos nem dados pessoais reais além dos necessários ao seu papel. Conte o que travou, confundiu ou parecia faltar: [E-MAIL OU URL DE FEEDBACK].
```

---

## 17. Calendário de políticas que afetam o app

| Data | O que muda | Efeito no WorkEasy | Fonte |
|---|---|---|---|
| 17/03/2026 | ECA Digital em vigor; a Ajuda anuncia que o Play passa a bloquear ou filtrar apps 18+ para menores no Brasil | decidir se o app é de "acesso provável" por menores; não classificar como 18+ | N01, G32 |
| 31/08/2026 | apps novos e atualizações devem mirar o Android 16 (API 36) | já atendido (`targetSdk` 36) | G13 |
| 30/09/2026 | verificação de desenvolvedor Android no Brasil | distribuir só pelo Play ou registrar o desenvolvedor | A01 |
| 27/01/2027 | botão de localização como escopo mínimo recomendado para localização exata; política de contatos | rever a localização do Cuidado (perfil B) | G04 |
| 01/02/2027 | atualizações precisam suportar páginas de 16 KB | sem código nativo: atendido; conferir `.so` | A09 |

---

## 18. Checklist de pré-envio

**Fase 0: pessoas e contas**
- [ ] Pessoa jurídica aberta; CNPJ; endereço e telefone da empresa.
- [ ] D-U-N-S pedido (gratuito, até 30 dias) e recebido.
- [ ] INPI: busca de "WorkEasy" feita (D7).
- [ ] Conta de organização criada, e-mail de contato da empresa e verificação em duas etapas ligada.
- [ ] Identidade e contatos confirmados no Console.

**Fase 1: código (seção 2.3)**
- [ ] M01 a M12 feitas ou decididas, no perfil escolhido.
- [ ] Nenhuma tela de demonstração, nenhuma faixa de protótipo, nenhum médico fictício no build de loja.
- [ ] Sem compra nem incentivo do Pro no app (ou Play Billing pronto).
- [ ] Denunciar e bloquear funcionando.
- [ ] Manifesto: só `INTERNET` (perfil A) ou `INTERNET` e localização (perfil B).

**Fase 2: documentos e site**
- [ ] Termos publicados (`[URL-TERMOS]`) e Política publicada (`[URL-POLITICA-DE-PRIVACIDADE]`), com o checklist da seção 7.1.
- [ ] Página de exclusão publicada (`[URL-EXCLUSAO-DE-CONTA]`), aberta num navegador sem sessão.
- [ ] Links da Política e dos Termos dentro do app (rodapé, `/entrar`, `/conta`); `CONSENT_VERSIONS` atualizado.
- [ ] `robots.txt` sem bloquear a página de exclusão.

**Fase 3: back-end**
- [ ] Projeto Supabase de produção no ar; funções implantadas; `https://localhost` e demais origens do app liberadas (CORS e redirecionamentos).
- [ ] Provedor de SMS e de e-mail ligados (D3); limites e CAPTCHA conforme `docs/pesquisa/whatsapp-e-email.md`.
- [ ] Contas de revisão criadas e OTP fixo configurado (seção 13).

**Fase 4: pacote**
- [ ] Chave de upload gerada e guardada em dois lugares; fora do Git.
- [ ] `versionCode` e `versionName` definidos (seção 14.2).
- [ ] AAB gerado pelo roteiro da seção 14.4, com a guarda sem erro.
- [ ] Permissões conferidas no manifesto mesclado (seção 14.5); sem `AD_ID`.
- [ ] Teste interno com o AAB em pelo menos dois aparelhos reais.

**Fase 5: Console**
- [ ] App criado (seção 4), idioma pt-BR, gratuito, só Brasil.
- [ ] Ficha: título, descrição breve e completa (limites conferidos com o Apêndice A), ícone, recurso gráfico, 4 a 8 capturas, textos alternativos.
- [ ] Categoria e etiquetas; e-mail, site e telefone.
- [ ] Conteúdo do app: Política, Acesso de apps, Anúncios, Classificação, Público-alvo, Saúde, Recursos financeiros, Segurança dos dados, ID de publicidade.
- [ ] Segurança dos dados coerente com a Política (seção 8) e URL de exclusão preenchida.
- [ ] Declaração de saúde e aviso na descrição (seção 7.4).

**Fase 6: teste e produção**
- [ ] Teste fechado com o build final (12 testadores por 14 dias, se conta pessoal).
- [ ] Pedido de produção respondido.
- [ ] Credenciais do revisor testadas no dia do envio.
- [ ] Após aprovado: guardar o certificado de assinatura do app e a impressão digital do Console.

---

## 19. Pontos para o advogado

1. **Asaas e compartilhamento.** Para o formulário, o Asaas é "provedor de serviços" (não compartilhado) ou terceiro (compartilhado)? Hoje marquei compartilhado (seção 8.2). A resposta deve bater com a Política (G03). [CONDICIONAL: depende de parecer]
2. **Retenção.** Pagamentos e atendimentos anonimizados ficam por quanto tempo? O `audit_log` é imutável e guarda o identificador da conta: isso atende o direito de exclusão e a exigência do Google de excluir "os dados associados"? Os consentimentos são apagados por cascata na exclusão: há necessidade de guardar prova do aceite? Os cadastros que ficam no Asaas depois da exclusão (seção 10.3) precisam de aviso e de um jeito de pedir a exclusão a ele? (`docs/DECISOES.md` D7 e pergunta 6; G02, G03.)
3. **Dado de saúde nos campos livres do Cuidado.** Marcar "Informações sobre saúde" no formulário (perfil B)? E a frase "O WorkEasy não guarda dados de saúde" precisa mudar? (seção 8.3.)
4. **ECA Digital.** O WorkEasy é de "acesso provável" por crianças e adolescentes (Lei 15.211/2025, art. 1º e parágrafo único)? Se sim, o art. 14 manda adotar medidas para receber o sinal de idade que a loja fornece (art. 12), e o Play oferece a API Play Age Signals (Beta). A política de dados do Google restringe o uso desse sinal a obrigação legal (G04). A política do catálogo tem o campo `audience_minors`. (N01, G32.)
5. **Idade mínima.** Texto dos Termos para "18 anos ou mais" e como o app a faz valer (hoje só a declaração).
6. **Teste de 30 dias com cobrança automática.** Aviso e cancelamento exigidos pelo CDC; se for adotado o Play Billing, os avisos da política de Assinaturas (G07). (`docs/DECISOES.md` pergunta 7.)
7. **Marketing.** O consentimento "Comunicações de novidades" existe, mas nenhum envio de marketing existe: manter assim até haver texto e canal aprovados (seção 8.3).
8. **IA de terceiros.** Quando `request-assist` for ligado, a política do Google mantém a responsabilidade com o desenvolvedor, inclusive uso limitado, divulgação e consentimento (G03).
9. **Documentos sensíveis do profissional** (documento com foto, certidão de antecedentes): base legal e retenção, na Política e no RIPD (L06).
10. **Venda do Pro e serviços só online.** Parecer sobre o enquadramento nas regras de pagamentos do Google (seção 11) não é jurídico, mas o dono deve decidir D4 com o advogado, junto com as perguntas 1 e 2 de `docs/DECISOES.md` seção 8.
11. **Comerciante no Brasil.** Se um dia vender pelo Google Play: CNPJ, beneficiários finais e executivos (G32).

---

## 20. O que não consegui verificar

- **Telas do Console.** Não tenho acesso ao Play Console. Nomes de menus e passos vêm da Ajuda em pt-BR. As perguntas exatas do questionário IARC, a lista de etiquetas e o nome do menu de países só aparecem no Console.
- **Build do Android.** Não executei `./gradlew :app:bundleRelease` (sem Android SDK no ambiente). Verifiquei só: `vite build --mode native` em pasta de rascunho (sem escrever no repositório), `keytool` e `jarsigner` com uma chave descartável (já apagada) e um pacote de mentira, o script do Apêndice B com imagens reais e de teste, e o script do Apêndice A contra este arquivo.
- **OTP fixo no Supabase hospedado.** Conferi só o esquema OpenAPI (S01). Não há projeto de produção para testar, nem a semântica de `sms_test_otp_valid_until`, nem se o Auth hospedado exige provedor de SMS ligado (o `config.toml` local diz que exige). A página de login por celular do Supabase (`/docs/guides/auth/phone-login`) que abri não trata de números de teste.
- **Política de faturamento.** Li o texto oficial (G05, G06), mas não encontrei no texto aberto uma regra para app que apenas **usa** assinatura comprada fora, nem para serviço só online. Ficam como [incerto].
- **Pesquisa na web.** O limite de buscas da sessão acabou no meio do trabalho; as páginas foram abertas por endereço direto. O que dependia de busca ficou [incerto].
- **Provedores.** SMS, e-mail e WhatsApp ainda não foram escolhidos (`docs/pesquisa/whatsapp-e-email.md`); o formulário de dados deve ser revisto na escolha.
- **Gráficos.** Não produzi capturas nem o recurso gráfico.
- **Documentos irmãos.** Estão em elaboração por outros agentes. `docs/pesquisa/whatsapp-e-email.md` foi lido (as seções citadas conferem). Da minuta `docs/juridico/01-termos-de-uso.md` li só as cláusulas 3, 8 e 10 e a parte C. `docs/juridico/03-politica-de-privacidade.md`, `docs/juridico/11-textos-de-consentimento-e-avisos.md`, `docs/lojas/app-store.md`, `docs/lojas/desktop-e-assinatura.md` e `docs/pesquisa/supabase-producao.md` ainda não existiam quando conferi: os nomes são os previstos e podem mudar.

---

## 21. Fontes consultadas

Todas abertas em **23/10/2026**. Páginas da Ajuda do Play Console: `https://support.google.com/googleplay/android-developer/answer/<número>?hl=pt-BR`, salvo indicação. O trecho é copiado da página aberta.

| ID | Página | Endereço | Trecho lido |
|---|---|---|---|
| G01 | Fornecer informações para a seção "Segurança dos dados" | `.../answer/10787469` | significa transmitir informações do seu app para fora do dispositivo do usuário |
| G01 | (idem, compartilhamento) | | Transferência de dados do usuário para um "provedor de serviços" que os processa em nome do desenvolvedor. |
| G01 | (idem, opcional) | | Você só pode declarar que a coleta de determinados dados pelo app é opcional se todos os usuários podem escolher se querem ou não enviar essas informações |
| G01 | (idem, formulário global) | | a seção "Segurança dos dados" descreve a soma da coleta e do compartilhamento de dados do app em todas as versões atualmente distribuídas no Google Play |
| G02 | Requisitos de exclusão de contas de apps | `.../answer/13327111` | sem enviar a pessoa de volta ao app nem exigir que ela faça o download novamente para enviar a solicitação |
| G03 | Dados do usuário (política) | `.../answer/10144311` | Sua política precisa estar disponível de forma não editável em um URL ativo, publicamente acessível e sem fronteira geográfica virtual. Não use PDFs. |
| G04 | Permissões e APIs que acessam informações sensíveis | `.../answer/9888170` | Os apps precisam solicitar o escopo mínimo necessário (ou seja, localização aproximada em vez de exata e em primeiro plano em vez de segundo plano) |
| G04 | (idem, aviso de mudança) | | (em vigor a partir de 27 de janeiro de 2027) |
| G04 | (idem, API Age Signals) | | Você só pode usar os dados acessados pela API Age Signals para cumprir obrigações legais e regulatórias aplicáveis |
| G05 | Pagamentos (política) | `.../answer/9858738` | para a compra de serviços físicos (como serviços de transporte, limpeza, passagem aérea, academia, entrega de comida, ingressos para eventos ao vivo) |
| G05 | (idem) | | conteúdo ou funcionalidade do app (como uma versão sem anúncios de um app ou novos recursos indisponíveis na versão gratuita) |
| G06 | Piloto da escolha de faturamento do usuário | `.../answer/12570971` | O desenvolvedor precisa estar registrado como uma empresa. |
| G06 | (idem) | | a taxa de serviço padrão paga pelo desenvolvedor é reduzida em 4% |
| G07 | Assinaturas (política) | `.../answer/9900533` | Antes de os usuários se inscreverem na sua assinatura: é preciso indicar de maneira clara e precisa os termos do que é oferecido |
| G08 | Declaração de recursos financeiros | `.../answer/13849271` | Meu app não oferece recursos financeiros |
| G09 | Serviços financeiros (política) | `.../answer/9876821` | são considerados produtos e serviços financeiros aqueles que estão relacionados ao gerenciamento e investimento de moedas e criptomoedas, incluindo consultoria personalizada |
| G10 | Formulário de declaração de apps de saúde | `.../answer/14738291` | Serviços e administração de saúde |
| G10 | (idem) | | auxílio na atenção a idosos |
| G11 | Conteúdo e serviços relacionados à saúde | `.../answer/16555673` | Quando o app não é principalmente de saúde, mas tem recursos relacionados e acessa dados de saúde, ele ainda entra no escopo da política de Apps de Saúde. |
| G11 | (idem) | | não é um dispositivo médico e não faz diagnósticos, tratamentos, não cura e não previne nenhuma condição médica |
| G11 | (idem) | | as permissões que não são usadas precisam ser removidas |
| G11 | (idem) | | As transações que envolvem serviços clínicos regulamentados não devem usar o sistema de faturamento do Google Play. |
| G12 | Categorias de apps de saúde | `.../answer/13996367` | As seguintes permissões são consideradas no escopo dos dados sensíveis relacionados à saúde (não é uma lista completa): |
| G13 | Requisitos de nível desejado da API | `.../answer/11926878` | Os novos apps e as atualizações precisarão ser direcionados ao Android 16 (nível 36 da API) ou versões mais recentes |
| G14 | Teste para novas contas pessoais | `.../answer/14151465` | devem realizar um teste fechado do app com, no mínimo, 12 testadores inscritos por pelo menos 14 dias consecutivos |
| G15 | Como começar a usar o Play Console | `.../answer/6112435` | Há uma taxa de inscrição única de US$ 25,00 |
| G15 | (idem) | | É preciso ter pelo menos 18 anos para criar uma conta do Play Console. |
| G16 | Escolher um tipo de conta de desenvolvedor | `.../answer/13634885` | Para criar uma conta de desenvolvedor para uma organização, é necessário ter um número D-U-N-S. |
| G17 | Requisitos de dados de contato | `.../answer/10840893` | O endereço de e-mail de contato de uma conta empresarial ou de uma organização não deve ser genérico nem pessoal. |
| G18 | Informações necessárias para criar a conta | `.../answer/13628312` | Esse processo pode levar até 30 dias. |
| G18 | (idem) | | o Google exibe seu nome civil, endereço oficial, endereço de e-mail do desenvolvedor e número de telefone do desenvolvedor no Google Play |
| G19 | Usar a Assinatura de apps do Google Play | `.../answer/9842756` | seu app será registrado automaticamente com chaves geradas pelo Google |
| G19 | (idem) | | proteja seu acesso ao Play Console aplicando a verificação em duas etapas a todos os usuários |
| G20 | Adicionar recursos de pré-visualização | `.../answer/9866151` (e `?hl=en`) | Dimensões: 1.024 px por 500 px |
| G20 | (idem, em inglês) | | The maximum dimension of your screenshot can't be more than twice as long as the minimum dimension. |
| G20 | (idem) | | PNG de 32 bits (com Alfa) |
| G20 | (idem, em inglês) | | You must provide a minimum of two screenshots across different device types to publish your store listing |
| G21 | Criar e configurar seu app | `.../answer/9859152` | Os nomes dos pacotes para arquivos de app são exclusivos e permanentes. |
| G21 | (idem) | | Limite de 4.000 caracteres. |
| G22 | Metadados (política) | `.../answer/9898842` | O título do seu app precisa ter até 30 caracteres. |
| G23 | Requisitos de classificação de conteúdo | `.../answer/9859655` | Selecione uma categoria e clique em Próxima. |
| G24 | Preparar seu app para revisão | `.../answer/9859455` | você pode adicionar até cinco conjuntos de instruções |
| G25 | Detalhes de login para análise | `.../answer/15748846` | se o app geralmente exige um código de verificação em duas etapas ou uma senha única, informe credenciais de login reutilizáveis que possam ignorar esses requisitos |
| G25 | (idem) | | Seus dados de login precisam ser fornecidos em inglês. |
| G26 | Público-alvo e conteúdo | `.../answer/9867159` | A seleção de determinadas faixas etárias, como apenas usuários com mais de 18 anos |
| G27 | Conteúdo gerado pelo usuário (política) | `.../answer/9876937` | Isso inclui oferecer um sistema no app para denunciar e bloquear UGC e usuários questionáveis |
| G28 | Moderação em apps de UGC | `.../answer/12923286` | Qualquer app que hospede UGC, seja uma pequena fração ou o app inteiro, é responsável por implementar e manter um sistema de moderação robusto, eficaz e contínuo. |
| G29 | Configurar teste aberto, fechado ou interno | `.../answer/9845334` | É possível iniciar um teste interno antes de concluir a configuração do app. |
| G29 | (idem) | | Assim que você fizer upload de um artefato, o nome do pacote desse app será fixado e não poderá ser alterado. |
| G29 | (idem, interno) | | Teste interno: gerenciar até 100 testadores |
| G29 | (idem, fechado) | | É possível criar até 200 listas, e cada uma delas pode ter até 2.000 usuários. Crie até 50 listas por faixa. |
| G30 | Preparar e lançar uma versão | `.../answer/9859348` | As opções de porcentagem de lançamento não estão disponíveis para uma primeira versão. |
| G30 | (idem) | | é possível inserir notas da versão usando até 500 caracteres Unicode por idioma |
| G31 | Publicar o app | `.../answer/6334282` | Isso pode aumentar o prazo da análise para até sete dias (ou mais, em casos excepcionais). |
| G32 | Requisitos para distribuição em países específicos | `.../answer/6223646` | Essa nova lei entra em vigor em 17 de março de 2026. |
| G32 | (idem) | | A classificação indicativa da ClassInd para o Brasil está sendo atualizada. |
| G32 | (idem, 18+) | | A partir de março de 2026, o Google Play vai começar a bloquear ou filtrar apps e jogos com classificação +18 para usuários menores de idade no Brasil |
| G32 | (idem, Age Signals) | | A API Play Age Signals (Beta) pode ser usada para receber informações de faixa etária de usuários no Brasil, de acordo com o ECA digital. |
| G32 | (idem, comerciante) | | Beneficiários: todos os indivíduos que possuem ou controlam mais de 25% das ações ou dos direitos de voto. |
| G32 | (idem, comerciante) | | Validação de endereço: documentos que comprovem o endereço comercial. |
| G33 | Categoria e tags | `.../answer/9859673` | O app ou jogo pode ter no máximo cinco tags. |
| G34 | ID de publicidade | `.../answer/6048248` | com.google.android.gms.permission.AD_ID |
| G35 | Comportamento enganoso (política) | `.../answer/9888077` | Garantir que o título, o ícone e a descrição do app reflitam com precisão a funcionalidade real dele. |
| A01 | Android developer verification | `https://developer.android.com/developer-verification` | Protections begin for all users who install apps from participating stores in Brazil, Indonesia, Singapore, and Thailand on certified devices running Android 7+. |
| A01 | (idem) | | Google Play automatically registers 99% of apps. |
| A01 | (idem, data) | | Effective September 30, 2026 Protections begin for users installing apps from participating stores in select regions on certified Android devices. |
| A02 | Especificações do ícone do Google Play | `https://developer.android.com/distribute/google-play/resources/icon-design-specifications` | Shape: Full square – Google Play dynamically handles masking. |
| A03 | Versionamento | `https://developer.android.com/studio/publish/versioning` | The greatest value Google Play allows for versionCode is 2100000000. |
| A03 | (idem) | | You can't upload an APK to the Play Store with a versionCode you have already used for a previous version. |
| A04 | Compilar pela linha de comando | `https://developer.android.com/build/building-cmdline` | jarsigner -keystore pathToKeystore app-release.aab keyAlias |
| A04 | (idem) | | Note: You cannot use apksigner to sign your app bundle. |
| A05 | Assinar o app (Android Studio) | `https://developer.android.com/studio/publish/app-signing` | Your key should be valid for at least 25 years |
| A06 | bundletool | `https://developer.android.com/tools/bundletool` | bundletool build-apks --bundle=/MyApp/my_app.aab --output=/MyApp/my_app.apks |
| A07 | aapt2 | `https://developer.android.com/tools/aapt2` | Prints the permissions extracted from the APK's manifest. |
| A08 | Analisador de APK | `https://developer.android.com/studio/debug/apk-analyzer` | Select Build > Analyze APK in the menu bar, then select your APK or app bundle. |
| A09 | Páginas de memória de 16 KB | `https://developer.android.com/guide/practices/page-sizes` | Starting February 1, 2027, if your app updates don't support 16 KB memory page sizes, you won't be able to release these updates. |
| A09 | (idem) | | If your app only uses code written in the Java programming language or in Kotlin, including all libraries or SDKs, then your app already supports 16 KB devices. |
| C01 | Capacitor: Deploying to Google Play | `https://capacitorjs.com/docs/android/deploying-to-google-play` | the way they are deployed to the Google Play Store is just like any other native Android app. |
| V01 | Vite: variáveis de ambiente e modos | `https://vite.dev/guide/env-and-mode` | environment variables that already exist when Vite is executed have the highest priority and will not be overwritten by .env files. |
| S01 | Supabase Management API (OpenAPI) | `https://api.supabase.com/api/v1-json` | "sms_test_otp_valid_until" |
| N01 | Lei 15.211, de 17/09/2025 (ECA Digital) | `https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/L15211.htm` | Os provedores de lojas de aplicações de internet e de sistemas operacionais de terminais deverão: |
| N01 | (idem, art. 1º) | | aplica-se a todo produto ou serviço de tecnologia da informação direcionado a crianças e a adolescentes no País ou de acesso provável por eles |
| N01 | (idem, art. 14) | | deverão adotar medidas técnicas e organizacionais para garantir o recebimento das informações de idade de que trata o art. 12 desta Lei |
| N01 | (idem, vigência) | | Esta Lei entra em vigor em 17 de março de 2026. |

Documentos do repositório lidos: `apps/web/docs/ARQUITETURA.md`, `apps/web/docs/DECISOES.md`, `apps/web/README.md`, `apps/web/docs/pesquisa/whatsapp-e-email.md`, `capacitor.config.ts`, `vite.config.ts`, `package.json`, `android/` (manifesto, Gradle, recursos), `supabase/config.toml`, funções `account-delete`, `account-export`, `asaas-onboard`, `payments-create`, `request-assist`, a função `anonymize_user` (`10_privacy_audit`), as chaves estrangeiras (`references`) das migrações `01` a `10`, `_shared/asaas-client.ts`, partes da minuta `docs/juridico/01-termos-de-uso.md` (cláusulas 3, 8 e 10 e a parte C) e as telas citadas.

---

## Apêndice A. Conferir os limites da ficha

Salve como `confere_ficha.py` e rode `python3 -I confere_ficha.py apps/web/docs/lojas/google-play.md`. Ele lê os blocos de texto sob os títulos da seção 5.1 e da seção 15 e compara com os limites oficiais (G21, G30).

```python
import re, sys, unicodedata

LIMITES = {
    "Título": 30,
    "Descrição breve": 80,
    "Descrição completa, base": 4000,
    "Notas da versão 0.1.0 (teste fechado)": 500,
    "Notas da versão 1.0.0": 500,
}
EXTRAS = ["Bloco opcional: Cuidado", "Bloco opcional: Pagamento"]

def n(texto):
    return len(unicodedata.normalize("NFC", texto))

doc = open(sys.argv[1], encoding="utf-8").read()
blocos = {}
for m in re.finditer(r"^#### (.+?)\n(?:.*?\n)*?```text\n(.*?)\n```", doc, re.M | re.S):
    blocos.setdefault(m.group(1).split(" [")[0].strip(), m.group(2))

erro = False
for nome, limite in LIMITES.items():
    texto = blocos.get(nome)
    if texto is None:
        print(f"FALTA   {nome}"); erro = True; continue
    ok = n(texto) <= limite
    erro |= not ok
    print(f"{'OK    ' if ok else 'ESTOURA'} {nome}: {n(texto)} de {limite}")
base = blocos.get("Descrição completa, base", "")
extras = [blocos[e] for e in EXTRAS if e in blocos]
total = n("\n\n".join([base] + extras))
print(f"{'OK    ' if total <= 4000 else 'ESTOURA'} Base mais blocos opcionais: {total} de 4000")
raise SystemExit(1 if erro or total > 4000 else 0)
```

## Apêndice B. Conferir os gráficos

Salve como `checa_graficos.py` (requer `pip install pillow`). Uso: `python3 -I checa_graficos.py icone icone.png recurso recurso.png tela tela1.png tela2.png`. Código de saída 1 se houver ERRO. Testado com `public/icons/icon-maskable-512.png` (passa), `public/icons/icon-512.png` (reprova por cantos transparentes) e imagens de teste de 1.024 × 500, 1.080 × 1.920, 720 × 1.280 (aviso) e 1.080 × 2.400 com alfa (reprova).

```python
import os
import sys
from PIL import Image

def tem_alfa(im):
    return im.mode in ("RGBA", "LA", "PA") or "transparency" in im.info

def confere(tipo, caminho):
    im = Image.open(caminho)
    w, h = im.size
    kb = os.path.getsize(caminho) / 1024
    erros, avisos = [], []
    if tipo == "icone":
        if (w, h) != (512, 512): erros.append(f"tamanho {w}x{h}, esperado 512x512")
        if im.format != "PNG" or im.mode != "RGBA": erros.append(f"formato {im.format}/{im.mode}, esperado PNG de 32 bits (RGBA)")
        if kb > 1024: erros.append(f"{kb:.0f} KB, máximo 1024 KB")
        if im.mode == "RGBA" and any(im.getpixel(p)[3] < 255 for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]):
            erros.append("cantos transparentes: o Play quer o quadrado inteiro, sem cantos arredondados nem sombra")
    elif tipo in ("recurso", "tela"):
        if im.format not in ("PNG", "JPEG") or tem_alfa(im):
            erros.append(f"{im.format}/{im.mode}: precisa ser JPEG ou PNG de 24 bits, sem canal alfa (converta para RGB)")
        if tipo == "recurso" and (w, h) != (1024, 500): erros.append(f"tamanho {w}x{h}, esperado 1024x500")
        if tipo == "tela":
            menor, maior = min(w, h), max(w, h)
            if menor < 320 or maior > 3840: erros.append(f"{w}x{h}: cada lado precisa ficar entre 320 e 3840 px")
            if maior > 2 * menor: erros.append(f"{w}x{h}: o lado maior não pode passar de 2 vezes o menor")
            if menor < 1080: avisos.append(f"{w}x{h}: lado menor abaixo de 1080 px; vale, mas não habilita formatos com capturas grandes")
    else:
        raise SystemExit("o tipo deve ser icone, recurso ou tela")
    print(("OK    " if not erros else "ERRO  ") + f"{tipo:8} {caminho} {w}x{h} {im.format}/{im.mode} {kb:.0f} KB")
    for e in erros: print("      - ERRO:", e)
    for a in avisos: print("      - AVISO:", a)
    return not erros

args = sys.argv[1:]
if len(args) < 2 or len(args) % 2:
    raise SystemExit("uso: checa_graficos.py icone <arquivo> | recurso <arquivo> | tela <arquivo> [...]")
ok = all([confere(args[i], args[i + 1]) for i in range(0, len(args), 2)])
raise SystemExit(0 if ok else 1)
```
