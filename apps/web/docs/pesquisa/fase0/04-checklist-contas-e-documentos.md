Dossiê de pesquisa. Não é parecer jurídico, contábil, tributário nem de propriedade intelectual; serve de base para a conversa com o profissional competente.

Rascunho para revisão de advogado. Não é parecer jurídico.

# F04: Checklist de contas, documentos e prazos para o lançamento

**Data de referência:** 2026-11-08. **Fase 0, frente F04.** **Revisão humana:** nenhuma até este ponto.

**Legenda:** "[incerto]" = fonte não aberta, aberta sem o texto necessário, ou fontes em conflito. "[estimativa]" = número ou prazo sem fonte. "aberto em 2026-11-08" = texto lido nesta data na fonte indicada. Valores de resultados de busca não são citados como fato.

## Resumo

- **A ordem é ditada pela pessoa jurídica.** Apple, Google Play, Meta e Asaas pedem CNPJ, D-U-N-S (nas lojas) ou site público com os dados da empresa. Pela documentação do Asaas, só conta CNPJ cria subcontas (docs.asaas.com, aberto em 2026-11-08). Contas gratuitas de apoio (GitHub, Supabase Free, Cloudflare Pages, Resend Free) podem ser abertas já, desde que o titular do domínio seja confirmado (F03).
- **Custos fixos com fonte aberta hoje:** Apple 99 USD por ano (valor em reais não conferido); Google Play US$ 25, taxa única; Supabase Pro a partir de US$ 25 por mês (a página mostra só "$", sem moeda nomeada); Resend Pro US$ 20 por mês; GitHub organização gratuita; Asaas com "zero mensalidade" na página (texto truncado); API da Anthropic por uso, com créditos pré-pagos (tabela em "$", sem moeda nomeada). Contabilidade e cartório não foram estimados.
- **Prazos e bloqueios com fonte:** D-U-N-S de até 5 dias úteis mais até 2 dias úteis para a Apple, e até 30 dias para o Google; verificação de pagamento do Google de até 5 dias; avaliação regulatória do Asaas de até 60 dias corridos a partir da primeira subconta em produção; ao atingir algum limite (quantidade, valor ou prazo), novas subcontas e cobranças ficam bloqueadas até o fim do processo; DNS do Resend de 15 minutos a 72 horas.
- **Fontes oficiais de abertura de empresa não foram lidas:** Redesim (bloqueio anti-robô), Receita Federal (página do CNPJ, HTTP 404), Jucesp (PDF da tabela 2026, HTTP 503), CCM da Prefeitura de São Paulo (a página retornada era do CPOM) e Banco Central sobre Pix (só o título). Documentos da PJ, inscrição municipal, custo de abertura e regras de Pix para CNPJ ficam [incerto].
- **Brasil consta na lista de países suportados pela API da Anthropic**, com os campos "Effective" e "Nov 12, 2026" na página lida em 2026-11-08 (a página não diz a que a data se aplica). Vale reler a página antes de faturar.

## Método e limites

**Abertos com texto lido em 2026-11-08:** documentação de subcontas do Asaas (duas páginas) e tabela de taxas do Asaas (truncada); planos do Supabase, regiões e duas páginas de cobrança; planos do Resend; limites do Cloudflare Pages e páginas de planos do Cloudflare (sem preço de Pages); planos do GitHub e página de 2FA da organização; tabela de preços e página de países suportados da Anthropic, e página de pagamento da API; documentação da Meta sobre verificação de empresa (sem lista de documentos); página de preços do WhatsApp Business Platform e página de preços para desenvolvedores; página do CPOM da Prefeitura de São Paulo (não é o CCM).

**Lidos em outras frentes do repositório (não reabertos):** F03 (`apps/web/docs/pesquisa/fase0/03-dominio-e-identidade.md`), que leu as páginas da Apple (inscrição e D-U-N-S), do Google Play (ajudas 6112435, 13628312 e 14151465), do Resend (add-a-domain) e o RDAP do workeasy.com.br, todos em 2026-11-08; e F01 (`apps/web/docs/pesquisa/fase0/01-societario-e-tributacao.md`), para tipo societário e regime. As passagens da Meta (verificação, prazo de 14 dias úteis e moeda BRL) vêm de `apps/web/docs/pesquisa/whatsapp-e-email.md`, seção 6.C, passos 13 a 21, e não foram reabertas aqui.

**Abertos sem o texto necessário:** Banco Central (páginas de Pix e do regulamento: só o título); Meta Business Help (dois artigos: só o título); Redesim no gov.br (verificação anti-robô); Receita Federal, página do CNPJ (HTTP 404); Jucesp, tabela de preços 2026 (HTTP 503); Asaas, página /precos (redireciona para login); Cloudflare, página de preços de Pages (HTTP 404); WhatsApp, calculadora de preços por país (interativa, sem tabela do Brasil).

**Só em resultados de busca (não abertos; [incerto]):** notícias sobre chaves Pix de CNPJ; blogs sobre documentos para conta PJ; valores da tabela Jucesp 2026; blogs sobre inscrição municipal em São Paulo; blog do Asaas com taxas de R$ 1,99 e R$ 0,99; artigo de suporte da Anthropic sobre ativação do Console.

**Sem fonte encontrada:** preço da Apple em reais; preço do plano Free do Cloudflare Pages; moeda da cobrança do Supabase; meios de pagamento aceitos pelo Supabase; CNPJ na nota fiscal do Supabase.

**Fora desta frente:** a escolha societária e tributária (F01), a marca (F02), o domínio e a identidade nas lojas (F03) e o desenho de cobrança (PREAMBLE: comissão e escrow desligados). **Não repeti** o conteúdo de `whatsapp-e-email.md`; a seção sobre Meta está referenciada no item 2.7. O arquivo `apps/web/docs/pesquisa/supabase-producao.md` **não existe** em `apps/web/docs/pesquisa/` (conferido em 2026-11-08); a parte de Supabase de produção não foi coberta por outro dossiê.

**Nomes de modelos** não aparecem no texto (PREAMBLE, regra 5). A tabela de preços da API foi referida pela posição (entrada, intermediário, topo), e os rótulos devem ser conferidos na página.

**Orçamento:** cerca de 50 chamadas de ferramenta.

**Verificação independente (2026-11-08):** um verificador reabriu 20 páginas citadas (lista ao final, em "Fontes consultadas", item "Reabertas na verificação independente") e corrigiu no texto o que não conferia: moeda e valores de Pix do Asaas, a tabela de preços da API (cinco linhas, não quatro), a vigência da Anthropic, o prazo de 14 dias úteis da Meta (não confirmado), "regras de branch" do GitHub, a citação de CLAUDE.md e as citações entre aspas do Asaas. Itens não reabertos seguem como estavam.

## 1. Ordem de abertura

| Ordem | Conta ou item | Só começa depois de | Prazo típico (fonte) | Custo (fonte, data) |
|---|---|---|---|---|
| 1 | Domínio `workeasy.com.br`: confirmar titular | nada | imediato | renovação [incerto]; vencimento 2027-05-19 (RDAP, F03) |
| 2 | GitHub: conta do dono com 2FA e organização | nada | [estimativa] | organização grátis; Team US$ 4 por usuário por mês, opcional (github.com/pricing, 2026-11-08) |
| 3 | Supabase: organização Free e projeto em `sa-east-1` | nada | [estimativa] | Free $0; Pro a partir de $25 por mês (supabase.com/pricing, 2026-11-08; a página mostra "$" sem nomear a moeda) |
| 4 | API da Anthropic (Console): organização e créditos | nada; papel Admin ou Billing para comprar créditos | [estimativa] | por uso, créditos pré-pagos (claude.com/pricing, 2026-11-08) |
| 5 | Cloudflare Pages (plano Free) | domínio (item 1) para usar domínio próprio | [estimativa] | Free; preço não confirmado [incerto] |
| 6 | Resend: domínio de envio | item 1 e acesso ao DNS | 15 minutos a 72 horas (F03, 2026-11-08) | Free US$ 0; Pro US$ 20 por mês (resend.com/pricing, 2026-11-08) |
| 7 | Pessoa jurídica: CNPJ, contrato social, Junta | decisão societária e tributária (F01) | [incerto] | Jucesp: [incerto]; CNPJ: [incerto] |
| 8 | Inscrição municipal (CCM, São Paulo) | CNPJ | [incerto] | [incerto] |
| 9 | D-U-N-S da PJ | PJ existente | Apple: até 5 dias úteis mais até 2 dias úteis; Google: até 30 dias (F03) | gratuito (página da Apple, lida por F03) |
| 10 | Site público da empresa, política e termos | PJ e domínio | [estimativa] | Cloudflare Pages (linha 5 desta tabela; seção 2.5) |
| 11 | Conta bancária PJ com Pix | CNPJ e contrato social | [incerto] | [incerto] |
| 12 | Apple Developer (organização) | D-U-N-S, site e e-mail no domínio | aprovação [incerto] | US$ 99 por ano (F03) |
| 13 | Google Play (organização) | D-U-N-S, site e contatos da organização | verificação de pagamento até 5 dias (F03) | US$ 25 taxa única (F03) |
| 14 | Meta: portfólio, verificação, conta WhatsApp Business, número | PJ e site HTTPS com os mesmos dados | [incerto]: "até 14 dias úteis" vem só de `whatsapp-e-email.md`, passo 15; a página oficial de verificação não dá prazo | cobrança por mensagem entregue (seção 2.7) |
| 15 | Asaas: conta da plataforma (CNPJ) | PJ | [incerto] | sem mensalidade declarada (seção 2.8) |
| 16 | Asaas: subcontas dos prestadores | conta-pai CNPJ criada | avaliação regulatória de até 60 dias corridos após a primeira subconta em produção | taxas por transação (seção 2.8) |

## 2. Contas, documentos e custos

Para cada item: documentos; quem assina; prazo; custo; dependências; risco de bloqueio.

### 2.1 Domínio (`workeasy.com.br`)

- **Documentos:** CPF (maior de idade) ou CNPJ regular, segundo resultado de busca sobre o Registro.br [incerto]. Detalhes em F03, seção 1 e checklist, itens 1 a 3.
- **Quem assina:** o titular do registro; confirmar se é o dono (F03).
- **Prazo:** registro e transferência [incerto]. O RDAP mostra "active", registro em 2020-05-19 e expiração em 2027-05-19 (F03).
- **Custo:** o preço do `.com.br` não foi conferido na página do Registro.br (vazia); resultado de busca sugere R$ 40 por ano [incerto].
- **Dependências:** nenhuma para a consulta. Antes de contas de loja, Meta e Asaas, o domínio precisa ser o do site da empresa.
- **Risco:** se o titular não for o dono, o domínio e o remetente de e-mail mudam antes de qualquer conta (F03).

### 2.2 GitHub (organização e 2FA)

- **Documentos:** conta pessoal do dono. A página de 2FA não pede documento de empresa.
- **Quem assina:** o dono, como proprietário (owner) da organização.
- **Prazo:** [estimativa], minutos.
- **Custo:** organização grátis (US$ 0; "Unlimited public/private repositories" no plano Free). Team a US$ 4 por usuário por mês, opcional. Algumas funções de repositório privado (regras de repositório, "repository rules", code owners, pull request em rascunho, Pages e wikis) ficam restritas a repositórios públicos no plano Free (github.com/pricing, aberto em 2026-11-08; a página não cita "branch protection" pelo nome).
- **Dependências:** 2FA na conta do dono antes de exigir 2FA dos membros.
- **Risco:** a organização pode exigir 2FA de membros, colaboradores externos e gestores de cobrança. Membros sem 2FA perdem acesso aos recursos e continuam ocupando assento. Colaboradores externos sem 2FA são removidos e podem voltar em três meses se ativarem 2FA (docs.github.com, página de 2FA da organização, aberta em 2026-11-08).

### 2.3 Supabase (plano, região e cobrança)

- **Documentos:** conta. Para o Pro, a página de cobrança não diz quais documentos ou dados fiscais são pedidos [incerto].
- **Quem assina:** o dono, como responsável pela organização [estimativa].
- **Prazo:** [estimativa], minutos para criar projeto.
- **Custo (supabase.com/pricing, aberto em 2026-11-08, sem data):**
  - Free: a partir de US$ 0.
  - Pro: a partir de US$ 25 por mês (a página mostra "$" e não nomeia a moeda; "cobrado antecipadamente a cada mês" não foi reconfirmado na releitura de 2026-11-08 [incerto]). Inclui 8 GB de disco por projeto (excedente a US$ 0,125 por GB), crédito de compute de US$ 10 por mês (cobre uma instância Micro), 100 mil usuários mensais ativos (depois US$ 0,00325 por usuário), 100 GB de armazenamento (depois US$ 0,0213 por GB).
  - Limite de gasto ("spend cap") ativo por padrão no Pro ("Spend caps are on by default on the Pro Plan"); a possibilidade de desligar não foi reconfirmada [incerto].
  - Impostos ("VAT, GST e outros") aplicados conforme o endereço de cobrança.
  - A página não mostra a moeda da cobrança [incerto].
- **Cobrança por organização:** a assinatura vale para a organização inteira e é cobrada uma vez (docs, org-based-billing, aberto em 2026-11-08). Planos não podem ser misturados dentro da mesma organização. Cada projeto soma custo de compute.
- **Região:** `sa-east-1`, "South America (São Paulo)", listada sem restrição de plano ou de disponibilidade (supabase.com/docs/guides/platform/regions, aberto em 2026-11-08). A página não diz se a região pode ser trocada depois de criada [incerto].
- **Meios de pagamento:** as duas páginas de cobrança lidas não dizem se há cartão, boleto, Pix ou fatura, nem se a nota sai em nome do CNPJ [incerto].
- **Dependências:** dados fiscais e CNPJ, quando a PJ existir. A decisão de produção sobre dados pessoais depende de LGPD (frente jurídica). O arquivo `supabase-producao.md` não existe (ver Método).
- **Risco:** o limite de gasto no Pro pode interromper serviços se for atingido. Mudança de plano e preço podem ocorrer sem aviso ("Pricing may change in the future", página de preços).

### 2.4 Conta da API da Anthropic (assistente)

- **Documentos:** conta no Console, organização e descrição de uso. A página de pagamento lida diz que a organização é criada e o pagamento é feito pelo Console; a lista de documentos de cadastro não foi lida [incerto].
- **Quem assina:** quem tem papel de Admin ou Billing no Console, que é quem compra créditos (support.claude.com, artigo 8977456, aberto em 2026-11-08).
- **Prazo:** [estimativa], minutos. Créditos comprados ficam disponíveis na hora (página de pagamento).
- **Custo (tabela de preços, aberta em 2026-11-08, sem data, preços em "$" por milhão de tokens; a tabela não nomeia a moeda, e a nota "Prices shown don't include applicable tax" está na seção de planos de assinatura, não na tabela da API [incerto para impostos]):**
  - Faixa "Entrada" (primeira linha; rótulo do dossiê, não da página): entrada $10, saída $50, leitura de cache $0,25, escrita de cache $12,50.
  - Faixa "Intermediário" (segunda linha; rótulo do dossiê): entrada $4, saída $20, leitura de cache $0,20, escrita de cache $5.
  - Faixa "Topo" (terceira linha; rótulo do dossiê): entrada $2, saída $10, leitura de cache $0,10, escrita de cache $2,50.
  - Duas linhas finais (quarta e quinta) são do modelo de menor porte, separadas pelo tamanho do prompt: até 100 mil tokens (entrada $0,10; saída $0,50; leitura de cache $0,01; escrita de cache $0,125) e acima de 100 mil tokens (entrada $0,50; saída $2,50; leitura de cache $0,05; escrita de cache $0,625). Não entram nos cálculos acima.
  - Lote ("batch"): a página diz "Save 50% with batch processing."
  - Cálculo ilustrativo, não é estimativa de uso do produto: 1.000 tokens de entrada e 500 de saída na faixa "Topo" dão (1.000 × 2 + 500 × 10) ÷ 1.000.000 = US$ 0,007 por chamada, antes de imposto e sem cache nem lote.
  - Custo mensal do produto: [estimativa, sem dados de uso].
- **Cobrança:** créditos pré-pagos são o padrão. Sem saldo, a API para até nova compra. Créditos expiram um ano após a compra. Recarga automática soma "applicable taxes". Organizações com acordo pela equipe comercial recebem fatura mensal emitida pela Stripe. A moeda e a lista completa de meios de pagamento não constam da página de suporte [incerto].
- **País:** a página de países suportados lista "Brazil" e diz que o uso é restrito em região não listada, inclusive por entidade "incorporated or headquartered" em região não listada (anthropic.com/supported-countries, aberto em 2026-11-08). A página mostra os campos "Effective" e "Nov 12, 2026", sem dizer a que se aplicam. Inferência do dossiê, [estimativa]: como o Brasil está listado, a empresa brasileira não se enquadra nessa restrição. A data de vigência é 12/11/2026.
- **Dependências:** a PJ para faturamento em nome da empresa é pergunta em aberto. A chave da API nunca vai ao cliente (PREAMBLE, regra 4).
- **Risco:** custo por chamada sem teto definido no projeto; é preciso limite de gasto e de chamadas antes de abrir a assistente ao público.

### 2.5 Cloudflare Pages

- **Documentos:** conta Cloudflare. A página de limites não pede documento de empresa [incerto].
- **Quem assina:** o dono da conta [estimativa].
- **Prazo:** [estimativa], minutos.
- **Custo:** a página de limites trata de "Free plan" e não de preço. A página de planos e a página de Pages não mostram o preço do plano Free (cloudflare.com/plans e cloudflare.com/developer-platform/products/pages, abertas em 2026-11-08). O preço do Free ficou [incerto].
- **Limites do plano Free (developers.cloudflare.com/pages/platform/limits, reconferida em 2026-11-08; última atualização da página: 5 de setembro de 2026):** 100 projetos por conta; 500 builds por mês; um build simultâneo; builds cortados após 20 minutos; até 20 mil arquivos por site; 25 MiB por arquivo; 100 domínios personalizados por projeto. Projetos novos têm restrições nas primeiras 48 horas de uso.
- **Ponto de atenção:** o projeto gera cerca de 13 mil páginas estáticas no prerender (PREAMBLE, seção 4). Com os arquivos de apoio, o total pode se aproximar do limite de 20 mil arquivos do plano Free. Conferir antes do lançamento [estimativa].
- **Dependências:** domínio e DNS (item 2.1).
- **Risco:** o limite de 500 builds por mês pode bloquear o ritmo de publicação se houver muitos deploys; o limite de arquivos é o mais próximo do uso real.

### 2.6 Resend (domínio de envio e planos)

- **Documentos:** conta e domínio. Acesso ao DNS para registros DKIM e SPF, copiados exatamente do painel (F03, seção 4.1, lido em 2026-11-08).
- **Quem assina:** quem controla o DNS do domínio [estimativa].
- **Prazo:** "often verify within 15 minutes"; pode levar "up to 72 hours" (resend.com/docs/add-a-domain, lido por F03).
- **Custo (resend.com/pricing, aberta em 2026-11-08, sem data):**
  - Free: 3.000 e-mails por mês, 3 domínios personalizados, limite de 100 e-mails por dia.
  - Pro: US$ 20 por mês para 50.000 e-mails; 10 domínios incluídos; sem limite diário.
  - Segunda faixa Pro: US$ 35 por mês para 100.000 e-mails.
  - Complemento de US$ 20 por mês para mais 100 domínios.
- **Dependências:** item 2.1 (domínio) e decisão de usar a raiz ou um subdomínio para envio (F03 recomenda subdomínio; o código usa `avisos@workeasy.com.br`).
- **Risco:** o limite de 100 e-mails por dia no Free pode bloquear avisos em dia de pico. O e-mail de contato de organização Google "should not be generic or a personal email address" (F03), o que afeta o endereço que se usa.

### 2.7 Meta: portfólio, verificação da empresa, conta WhatsApp Business e número

- **Roteiro completo:** `apps/web/docs/pesquisa/whatsapp-e-email.md`, seção 6.C, passos 13 a 21, e seção 7 (variáveis). Não repito aqui.
- **Documentos:** razão social, endereço, telefone e site "exatamente iguais" aos da entidade legal, e site que carregue por HTTPS (whatsapp-e-email.md, passos 13 e 15). Se a Meta não encontrar a empresa, enviar documentos oficiais (por exemplo licença ou contrato social) (passo 15). A lista de documentos aceitos não foi lida [incerto]: os artigos da Central de Ajuda da Meta abertos mostraram só o título.
- **Quem assina:** a verificação só pode ser feita por quem tem papel de administrador do negócio, dentro do Business Manager (developers.facebook.com, "Business verification", aberto em 2026-11-08).
- **Prazo:** não confirmado. A página de verificação de negócio, aberta em 2026-11-08, não dá prazo nem lista de documentos. "Até 14 dias úteis" vem só de whatsapp-e-email.md, passo 15 (fonte original não reaberta) [incerto].
- **Moeda:** a página de preços para desenvolvedores (developers.facebook.com/docs/whatsapp/pricing, releitura de 2026-11-08) diz que provedores e empresas elegíveis com país de faturamento Brasil podem criar contas de mensagens em BRL, faturadas pela Facebook Brasil, e que as tarifas estão em "rate cards" com vigência em 1º de outubro de 2026. Que a moeda não muda depois é afirmação de whatsapp-e-email.md, passo 16 [incerto nesta frente].
- **Custo (duas páginas, abertas em 2026-11-08):**
  - Cobrança quando a mensagem é entregue, não quando é enviada (whatsappbusiness.com/products/platform-pricing).
  - A página de desenvolvedores diz "one free tier of 1,000 delivered service messages per month" por número, com cobrança a partir da 1.001ª mensagem de atendimento entregue, "as of 12am by Messaging account timezone on October 1, 2026". Confirmado na releitura de 2026-11-08; só vale para mensagens de atendimento.
  - Tarifas de utilidade e de autenticação para o Brasil: a página cita, numa tabela comparativa, "0.68 ¢ per message" para o Brasil, sem moeda declarada, e remete às tabelas em BRL (CSV e PDF). Tabelas não lidas [incerto].
  - Custo fixo de número: [incerto].
- **Dependências:** PJ (item 2.9, D-U-N-S não é exigido pela Meta nesta página, mas a razão social é), site HTTPS (item 2.13), política de privacidade e termos publicados (frente jurídica), número dedicado (não pode estar em uso no WhatsApp comum sem ser apagado antes; whatsapp-e-email.md, M12), forma de pagamento no Billing Hub antes do primeiro envio (passo 17).
- **Risco:** alterar dados da empresa depois da verificação exige refazer a verificação (passo 15). O prazo de 14 dias úteis, não confirmado na página oficial, pode atrasar o item de WhatsApp e não o lançamento do site.

### 2.8 Asaas: conta da plataforma e subcontas

- **Pré-requisito:** "Contas de pessoa física (CPF) não podem criar subcontas" e "a criação de subcontas é permitida apenas para contas de pessoa jurídica (CNPJ)" (docs.asaas.com, "Criação de subcontas", página atualizada em 2026-10-27, aberta em 2026-11-08; o texto é em português, conferido em 2026-11-08). A conta da plataforma é, portanto, uma conta de pessoa jurídica.
- **Campos de subconta (exemplo oficial de CNPJ; campos de CPF não confirmados):**
  - `incomeValue`: "O campo `incomeValue` é obrigatório" (para os dois tipos, sem restrição declarada).
  - `birthDate`: a página diz que o campo "não é enviado" e "é aplicável somente quando o titular da subconta for pessoa física" (conferido em 2026-11-08).
  - `cpfCnpj`, `name`, `email`, `phone`/`mobilePhone`, `address`, `addressNumber`, `complement`, `province`, `postalCode`.
  - `companyType` e `taxRegime`: `taxRegime` só para CNPJ e é opcional.
  - `webhooks`: opcional.
  - Cidade e estado, site e documentos não aparecem nesse exemplo [incerto].
  - A página manda consultar a API Reference para os campos obrigatórios vigentes.
- **Documentos:** a página de fluxo diz que, normalmente, a análise cadastral inclui "documento de identificação e selfie do titular ou responsável" (conferido em 2026-11-08); associações podem precisar de mais (exemplo: ata de eleição) (docs.asaas.com, "Detalhamento do fluxo de aprovação de subcontas", updatedAt 2026-08-28, aberta em 2026-11-08). Documentos da própria empresa (contrato social, cartão CNPJ) não aparecem nas páginas lidas [incerto].
- **Envio:** na subconta padrão, o titular envia os documentos pela interface do Asaas. Na BaaS, pelo `onboardingUrl` ou pela API, e "Nunca tente enviar via API um documento que possui onboardingUrl" (o envio é recusado). Aguardar 15 segundos após a criação antes de consultar documentos pendentes.
- **Quem assina:** titular ou responsável, segundo a página de fluxo.
- **Prazo:**
  - Não há prazo de aprovação declarado. Conta totalmente aprovada quando `general` retorna `APPROVED`.
  - Avaliação regulatória "pode durar até 60 dias corridos" a partir da primeira subconta criada em produção (conferido em 2026-11-08). Após atingir qualquer limite (quantidade, valor ou prazo), a criação de novas subcontas e a emissão de cobranças adicionais são bloqueadas até a conclusão do processo.
- **Custo (asaas.com/precos-e-taxas, aberta em 2026-11-08, texto truncado, sem data):**
  - Conta sem mensalidade ("zero mensalidade e taxa de emissão"); abertura e manutenção listadas como grátis.
  - Pix recebido: na releitura de 2026-11-08, R$ 1,99 e R$ 0,99 "por transação recebida"; a página não diz qual vale para cada caso. A leitura original deste dossiê citava R$ 2,15 e R$ 1,08. Conflito não resolvido [incerto].
  - Boleto: os mesmos dois valores do Pix na releitura de 2026-11-08, por transação recebida [incerto quanto a qual valor].
  - Cartão de débito: R$ 0,35 mais 1,89% por transação recebida. Taxas de crédito não aparecem no trecho lido [incerto].
  - Pix e transferência de saída: grátis, "válido somente para cadastros de pessoa física". Para saída de conta PJ, a taxa não consta [incerto].
  - Resultado de busca de blog do Asaas fala em R$ 1,99 e R$ 0,99 por Pix recebido, com taxas reduzidas nos três primeiros meses. Esses valores batem com a releitura da página, mas não com a leitura original. Taxa vigente não confirmada [incerto].
- **Dependências:** PJ (item 2.9); site da empresa (item 2.13); decisão de ativar ou não comissão (PREAMBLE: comissão e escrow desligados até parecer jurídico); definição F01 sobre ISS.
- **Risco:** o bloqueio de subcontas durante a avaliação regulatória de até 60 dias corridos; a dúvida sobre o modelo (BaaS, padrão ou white label, com e sem painel para o prestador) afeta quem envia os documentos; taxa de saída de PJ não conferida.

### 2.9 Pessoa jurídica: CNPJ, contrato social e Junta Comercial

- **Tipo societário e regime:** decisão em F01. F01 recomenda não usar MEI para a plataforma e trata SLU ou LTDA e o Simples Nacional como hipóteses.
- **Documentos (lista da base bancária, não da Receita; ver item 2.11):** contrato social assinado; documentos pessoais dos sócios; comprovante de endereço da sede. Lista oficial da Redesim não foi lida [incerto].
- **Quem assina:** os sócios com poderes conforme o contrato social [estimativa].
- **Prazo:** resultados de busca citam 1 dia útil (Jucemg, Minas Gerais) e 24 horas (São José dos Campos), ambos condicionais ao atendimento dos requisitos. Não são fontes do estado de São Paulo [incerto].
- **Custo:**
  - Jucesp, tabela 2026 (Portaria 146, de 19/12/2025, segundo resultado de busca; PDF não aberto, HTTP 503): alteração ou contrato de sociedade limitada, R$ 273,55; ME e EPP, R$ 218,99; valores reajustados pela UFESP [incerto].
  - CNPJ: custo não conferido; resultado de busca não diz se é grátis [incerto].
  - Contabilidade: não estimada (F01).
- **Dependências:** F01 (tipo, CNAE, regime tributário); endereço; nome empresarial (a Apple não aceita nome fictício, DBA ou nome comercial como nome da organização, F03).
- **Risco:** segundo resultado de busca sobre a Redesim, a escolha de regime tributário passou a ser obrigatória antes da emissão do CNPJ, e o acesso ao módulo de regime precisa ocorrer em 90 dias após o registro na Junta, sob pena de cancelamento do protocolo [incerto]. A Receita não foi lida.

### 2.10 Inscrição municipal (CCM, São Paulo)

- **Documentos:** [incerto]. Resultados de busca falam em ficha de dados cadastrais emitida pelo portal da Fazenda, sem fonte oficial aberta.
- **Quem assina:** o representante legal [estimativa].
- **Prazo:** resultados de busca, não oficiais, falam em 30 dias após o início das atividades para pessoa jurídica (secundária, [incerto]).
- **Custo:** [incerto]. Taxa de Fiscalização de Estabelecimento (TFE) é cobrança municipal separada (resultado de busca, [incerto]).
- **Dependências:** CNPJ (item 2.9). A atividade e o ISS dependem de F01.
- **Risco:** a página oficial do CCM não foi lida. O endereço retornado pela busca (`prefeitura.sp.gov.br/fazenda/w/servicos/cpom/2388`) trata do CPOM, que é outro cadastro.

### 2.11 Conta bancária PJ com Pix

- **Documentos (resultados de busca de blogs de bancos, não abertos; varia por instituição [incerto]):** CNPJ ativo; contrato social; documentos dos sócios (RG ou CNH); comprovante de endereço da empresa; procuração se a conta for movimentada por alguém que não seja administrador, com validade confirmada anualmente quando não tem prazo; em alguns casos, cartão CNPJ.
- **Quem assina:** os administradores com poderes conforme o contrato social [estimativa].
- **Prazo:** [incerto]. Resultados de busca dizem que bancos tradicionais costumam pedir presença física com documentos originais.
- **Custo:** mensalidade e tarifa de Pix para PJ [incerto]. Resultados de busca dizem que o Banco Central autoriza cobrança de Pix para CNPJ e que MEI e EI são isentos (secundária, não conferida no Banco Central).
- **Chave Pix de CNPJ:** resultados de busca (notícias de 2025) dizem que chave de CNPJ só pode ficar vinculada a conta do mesmo titular e que o nome é checado na Receita Federal antes de criar ou alterar chave. Regulamento do Pix não lido (página do BCB sem texto) [incerto].
- **Dependências:** CNPJ e contrato social (item 2.9); a conta do Asaas é separada, e se a plataforma precisa de conta bancária PJ para repasses fica para perguntar ao Asaas [incerto].
- **Risco:** CNPJ com pendências pode ter a chave Pix retirada, segundo resultados de busca [incerto]. O nome do titular precisa coincidir com o cadastro da Receita.

### 2.12 D-U-N-S da pessoa jurídica

- **Documentos:** dados da empresa como constam na Receita (número, razão social, endereço) [estimativa].
- **Quem assina:** o representante que faz a solicitação [estimativa].
- **Prazo (página da Apple, lida por F03 em 2026-11-08):** "allow up to 5 business days" do D&B; expediting "will not shorten this waiting period". Depois de receber, "allow up to 2 business days for Apple to receive your information". Se passar de duas semanas, a Apple recomenda contatar o D&B. Google: "can take up to 30 days" (página 13628312, lida por F03).
- **Custo:** gratuito, "submit your information to Dun & Bradstreet for a free D-U-N-S Number" (Apple, lida por F03). Antes de pedir, dá para checar se a empresa já tem número.
- **Dependências:** item 2.9 (PJ existente).
- **Risco:** é o item mais longo depois da PJ. Sem D-U-N-S não há conta de organização na Apple nem no Google.

### 2.13 Site público da empresa (exigido por Apple, Google e Meta)

- **Conteúdo:** site público, funcionando, no domínio da empresa (Apple); "site da organização" com telefone e site (Google); site HTTPS com os mesmos dados da entidade legal (Meta). Política de privacidade e termos publicados (whatsapp-e-email.md, passo 13; frente jurídica).
- **Quem assina:** o dono [estimativa].
- **Custo:** hospedagem (item 2.5) e domínio (item 2.1).
- **Dependências:** item 2.9 (dados da empresa) e item 2.1 (domínio).
- **Risco:** links de redes sociais ou sites com pouco conteúdo não são aceitos pela Apple (F03). Site incompleto atrasa três contas ao mesmo tempo.

### 2.14 Apple Developer Program (organização)

- **Documentos:** D-U-N-S; nome legal da entidade (sem DBA, nome fictício, nome comercial ou filial, segundo a página); site público no domínio; e-mail de trabalho no domínio da empresa; titular com poder legal para vincular a organização a contratos. Se o titular não for dono, fundador, membro do time executivo ou líder sênior de projeto, a autoridade precisa ser concedida por um funcionário sênior (página de inscrição, releitura de 2026-11-08). A página não pede documento de referência para isso.
- **Quem assina:** o titular da conta, com poder legal (F03).
- **Prazo:** a página não informa o prazo de aprovação [incerto].
- **Custo:** "99 USD per membership year" na página (releitura de 2026-11-08); a página diz que os preços variam por região e aparecem em moeda local durante a inscrição. O valor em reais não foi conferido.
- **Dependências:** itens 2.9, 2.12 e 2.13.
- **Risco:** o nome do vendedor na App Store é o nome da organização. O nome do app não pode ser decidido sem o dossiê de marca (F02) e o de identidade (F03).

### 2.15 Google Play (organização ou pessoal)

- **Documentos (organização):** nome do desenvolvedor; D-U-N-S; nome e endereço da organização, conforme o perfil de pagamento; telefone e site da organização; contato com nome, e-mail e telefone; e-mail e telefone do perfil. O e-mail "should not be generic or a personal email address" (F03, página 13628312). Se `contato@` conta como genérico, está [incerto].
- **Quem assina:** [incerto]. A página lida não diz.
- **Prazo:** D-U-N-S de até 30 dias; verificação de pagamento de até 5 dias (F03).
- **Custo:** US$ 25, taxa única; não é devolvida se as informações de identidade forem consideradas inválidas (F03, página 6112435).
- **Alternativa pessoal:** exige verificar acesso a dispositivo Android antes de publicar (página 6112435); para produção, teste fechado com ao menos 12 testadores por 14 dias, e revisão "usually takes seven days or less" (página 14151465) (F03).
- **Dependências:** item 2.9, item 2.12 e item 2.13 para organização; dispositivo e testadores para conta pessoal.
- **Risco:** organização exige D-U-N-S. Não encontrei fonte sobre migrar de conta pessoal para conta de organização depois de criada [incerto].

### 2.16 Documentos do dono (pessoa física)

- **Documentos:** CPF, RG ou CNH, comprovante de endereço do dono. São exigidos nas contas de organização, na conta bancária e como responsável em Asaas (quando a conta não é da própria empresa) [estimativa].
- **Quem assina:** o dono.
- **Custo:** nenhum declarado.
- **Risco:** dados pessoais do dono e dos prestadores entram nas contas (Asaas coleta `incomeValue`, documento de identidade e, para pessoa física, `birthDate`). Coleta e finalidade devem passar pela frente jurídica e pela LGPD (ver perguntas).

## 3. Perguntas para o profissional

**Contador:**

1. Para o tipo societário e o CNAE escolhidos (F01), qual é a sequência real na Redesim? A escolha de regime tributário precisa ser feita antes da emissão do CNPJ, como indicam resultados de busca?
2. Qual é o custo total de abertura em São Paulo (Junta, CNPJ, CCM, TFE e taxas de cartório, se houver), e qual é o prazo do CCM depois do CNPJ?
3. Qual é o custo mensal de contabilidade e de obrigações acessórias, que não foi estimado aqui? Isso muda o modelo de pagamento com prestadores?

**Advogado:**

4. Os dados que o Asaas pede (CPF, data de nascimento, renda e documento de identidade com selfie, para prestadores e para o dono) precisam de aviso ou consentimento específico na política de privacidade? Qual é a base legal para cada um?
5. A conta de organização da Apple e a do Google podem ser abertas pelo dono sozinho, ou exigem sócio com poderes registrados no contrato?
6. A assistente que chama a API da Anthropic (com dados de usuário) exige qual cláusula nova na política de privacidade ou nos termos? Os termos comerciais da API para empresa brasileira não foram lidos neste dossiê: qual é o texto vigente?

**Banco:**

7. Quais documentos a conta PJ exige, e a procuração é necessária para quem for movimentar a conta? Há tarifa de Pix para CNPJ nessa conta, e qual?
8. A chave Pix de CNPJ pode ser cadastrada logo após o CNPJ e o contrato social? Qual é o texto atual do Regulamento do Pix sobre isso (página do Banco Central não lida)?

**Asaas (suporte comercial e documentação):**

9. Qual é a lista atual de documentos da empresa (contrato social, cartão CNPJ) para a conta da plataforma e para as subcontas de prestadores CPF e CNPJ? A página lida não tem essa lista.
10. Qual é a taxa de Pix de saída para conta PJ, já que a página só fala de pessoa física? Qual par de valores de Pix recebido vale para a conta: R$ 1,99 e R$ 0,99 (releitura de 2026-11-08) ou R$ 2,15 e R$ 1,08 (leitura original)?
11. Qual é o prazo típico de aprovação das subcontas, e que status a conta da plataforma e o prestador veem durante a avaliação regulatória?
12. A conta da plataforma precisa de conta bancária PJ própria para repasses, ou o saldo fica no Asaas?

**Supabase, Anthropic e Meta:**

13. Supabase: quais meios de pagamento são aceitos para o Pro, a moeda da cobrança, e a nota fiscal pode sair em nome do CNPJ? A região `sa-east-1` pode ser trocada depois de criada?
14. Anthropic: a cobrança é feita em reais ou em dólares, e há nota fiscal mensal para empresa brasileira sem acordo com a equipe comercial? A página de países suportados mostra vigência em 12/11/2026: o que muda nessa data?
15. Meta: a conta WhatsApp Business pode ser criada em BRL para a PJ do dono? Qual é a tarifa de utilidade e de autenticação para o Brasil, na tabela oficial em BRL?

**Apple e Google:**

16. Apple: o nome da organização na loja precisa ser idêntico ao da PJ? Há prazo de aprovação da conta de organização?
17. Google: o e-mail `contato@` do domínio da empresa é aceito como contato da organização?

## Fontes consultadas

Todas as datas são de abertura em 2026-11-08. "Lido" significa texto lido na página; "aberta, sem texto" significa que a página retornou só o título ou página de verificação; "não aberta" indica resultado de busca.

**Lidas com texto:**

1. https://docs.asaas.com/docs/criacao-de-subcontas: criação de subcontas (página atualizada em 2026-10-27 segundo a própria página); campos, `incomeValue`, `birthDate`, "Only a CNPJ account can create subaccounts".
2. https://docs.asaas.com/docs/detalhamento-do-fluxo-de-aprova%C3%A7%C3%A3o-de-subcontas: fluxo de aprovação (updatedAt 2026-08-28); documentos, `general` APPROVED, avaliação regulatória de até 60 dias corridos.
3. https://www.asaas.com/precos-e-taxas: taxas (texto truncado, sem data); valores de Pix divergentes entre leituras, ver 2.8.
4. https://supabase.com/pricing: planos Free e Pro, spend cap, cobrança, impostos (sem data).
5. https://supabase.com/docs/guides/platform/regions: região São Paulo (`sa-east-1`) listada sem restrição.
6. https://supabase.com/docs/guides/platform/org-based-billing: cobrança por organização.
7. https://supabase.com/docs/guides/platform/billing-on-supabase: cobrança de uso; meios de pagamento não citados.
8. https://resend.com/pricing: planos Free e Pro (sem data).
9. https://developers.cloudflare.com/pages/platform/limits/: limites do plano Free (última atualização indicada como 5 de setembro de 2026 no texto lido).
10. https://www.cloudflare.com/plans/: lido; sem preço de Pages nem do Free.
11. https://www.cloudflare.com/developer-platform/products/pages/: lido; sem preço de Pages.
12. https://github.com/pricing: planos de organização (US$ 0 Free; US$ 4 por usuário por mês no Team); rodapé de 2026.
13. https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization: 2FA obrigatório na organização (sem data).
14. https://claude.com/pricing (redirecionado de https://www.anthropic.com/pricing): tabela de preços da API, cache, lote e impostos (sem data).
15. https://www.anthropic.com/supported-countries: "Brazil" listado; campos "Effective" e "Nov 12, 2026" (sem frase única).
16. https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage: créditos pré-pagos, papéis Admin ou Billing, faturamento mensal por acordo comercial; "Updated over a week ago" (sem data).
17. https://developers.facebook.com/docs/development/release/business-verification: verificação de negócio, papel de administrador, Business Manager.
18. https://developers.facebook.com/docs/whatsapp/pricing/: BRL para contas elegíveis no Brasil; 1.000 mensagens de atendimento entregues; cobrança a partir de 1º de outubro de 2026 (confirmado na releitura de 2026-11-08).
19. https://whatsappbusiness.com/products/platform-pricing/ (redirecionado de https://business.whatsapp.com/products/platform-pricing): cobrança na entrega; janela de atendimento de 24 horas sem cobrança; tarifa por calculadora interativa.
20. https://prefeitura.sp.gov.br/fazenda/w/servicos/cpom/2388: CPOM, não CCM (página datada de 7 de junho de 2022 no texto).
21. Repositório: `apps/web/docs/pesquisa/fase0/03-dominio-e-identidade.md`, seções 1, 3, 4 e 5 (leitura local). Cita páginas da Apple (developer.apple.com/programs/enroll/ e developer.apple.com/help/account/membership/D-U-N-S/), do Google Play (support.google.com/googleplay/android-developer/answer/6112435, 13628312 e 14151465), do Resend (resend.com/docs/add-a-domain) e o RDAP do Registro.br para workeasy.com.br, abertas por F03 em 2026-11-08.
22. Repositório: `apps/web/docs/pesquisa/fase0/01-societario-e-tributacao.md` (leitura local), para tipo societário e regime.
23. Repositório: `apps/web/docs/pesquisa/whatsapp-e-email.md`, seção 6.C, passos 13 a 21, e seção 7 (leitura local); fontes M12, M13, M14, M16, M17 não reabertas.
24. Brief do orquestrador: `PREAMBLE.md` (fora do repositório; escopo, regras e número de páginas do prerender). `CLAUDE.md` não existe na raiz de /home/user/work-easy (conferido em 2026-11-08), por isso a citação dele foi retirada do texto.

**Abertas sem texto útil (tentadas em 2026-11-08):**

25. https://www.bcb.gov.br/estabilidadefinanceira/pix: título apenas. [incerto] para regras de Pix.
26. https://www.bcb.gov.br/estabilidadefinanceira/pix_regulamento: título apenas. [incerto].
27. https://www.facebook.com/business/help/2058515294227817 e https://www.facebook.com/business/help/1095661473946872: título apenas. [incerto] para documentos aceitos pela Meta.
28. https://www.gov.br/empresas-e-negocios/pt-br/redesim: verificação anti-robô. [incerto].
29. https://www.gov.br/receitafederal/pt-br/assuntos/cnpj: HTTP 404. [incerto] para custo e documentos do CNPJ.
30. https://www.institucional.jucesp.sp.gov.br/downloads/Portaria%20n%C2%BA%20146%20-%20Tabela%20de%20Pre%C3%A7os%202026.pdf: HTTP 503. Valores de 2026 citados só como resultado de busca.
31. https://www.asaas.com/precos: redireciona para login. Substituída por 3.
32. https://developers.cloudflare.com/pages/platform/pricing/: HTTP 404. [incerto] para preço do Free de Pages.

**Resultados de busca, não abertos (apenas pistas, [incerto]):**

33. Notícias de 2025 sobre chaves Pix de CNPJ (por exemplo https://istoedinheiro.com.br/cpf-cnpj-chave-pix-regras e https://acionista.com.br/bcb-altera-mecanismos-do-pix-e-bane-quem-tiver-pendencia-na-receita-federal/).
34. Blogs de documentos para conta PJ (https://www.omie.com.br/blog/documentos-para-abrir-conta-pj/, https://www.c6bank.com.br/blog/documentos-necessarios-conta-pj, https://www.cora.com.br/blog/documentos-para-abrir-conta-pj/).
35. Blog do Asaas com taxas (https://blog.asaas.com/taxas-asaas/) e página https://asaas.com/pix-asaas, com R$ 1,99 e R$ 0,99 por Pix recebido.
36. Redesim (https://www.enat.receita.economia.gov.br/pt-br/area_nacional/noticias/destaques/novos-sistemas-redesim-ajudam-a-diminuir-o-tempo-de-abertura-de-pessoa-juridica-no-brasil) e Jucemg (https://jucemg.mg.gov.br/servicos/14/SOLICITAR+ABERTURA+DE+UMA+EMPRESA).
37. Apoio da Anthropic sobre ativação do Console (https://support.claude.com/en/articles/8114531-i-created-a-claude-console-organization-how-do-i-start-using-the-claude-api).
38. Blogs de inscrição municipal em São Paulo (sem fonte oficial aberta).

**Buscas sem resultado útil:** preço da Apple em reais; moeda e meios de pagamento do Supabase.

**Reabertas na verificação independente (2026-11-08):** docs.asaas.com (criação de subcontas e fluxo de aprovação); asaas.com/precos-e-taxas; supabase.com/pricing; supabase.com/docs/guides/platform/regions; supabase.com/docs/guides/platform/org-based-billing; resend.com/pricing; developers.cloudflare.com/pages/platform/limits; anthropic.com/supported-countries; claude.com/pricing; support.claude.com/en/articles/8977456; developers.facebook.com/docs/whatsapp/pricing; developers.facebook.com/docs/development/release/business-verification; github.com/pricing; docs.github.com (2FA obrigatório na organização); developer.apple.com/help/account/membership/D-U-N-S/; developer.apple.com/programs/enroll/; support.google.com/googleplay/android-developer/answer/6112435, 13628312 e 14151465. Confirmados sem alteração: Resend, Cloudflare Pages, Supabase (preços, região e cobrança por organização), Google (US$ 25, D-U-N-S de até 30 dias, verificação de pagamento de até 5 dias), Apple (D-U-N-S de até 5 e 2 dias úteis). Não reabertos: F03, F01, whatsapp-e-email.md, páginas da Receita, Redesim, Jucesp, Banco Central, Cloudflare Plans e a página do CPOM.
