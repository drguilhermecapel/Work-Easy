# Política de segurança

O WorkEasy é um protótipo: ainda não está publicado para o público, não passou
por auditoria de segurança independente e não tem certificação. Este documento
diz como reportar uma falha; não garante a segurança do produto.

## Como reportar uma vulnerabilidade

O único canal é o **relatório privado de vulnerabilidades do GitHub**
(Private Vulnerability Reporting), já ativo neste repositório:

1. Abra a aba **Security** do repositório `drguilhermecapel/Work-Easy`.
2. Clique em **Report a vulnerability**.
3. Preencha o formulário. Só você e a pessoa responsável pelo repositório veem o relato.

Não abra issue pública, pull request, discussão nem comentário com detalhes da
falha, e não publique a falha em outro lugar antes de a correção sair.

Não há e-mail ou telefone de segurança. Quem não tem conta no GitHub precisa
criar uma para usar o canal.

Inclua, quando possível:

- o caminho do arquivo, da função ou da política afetada;
- os passos para reproduzir a falha;
- o impacto que você observou;
- uma sugestão de correção, se tiver.

## Dados e segredos: não envie

- Não envie dados de usuários, prestadores, clientes ou qualquer pessoa real
  (nomes, CPF, CNPJ, telefones, endereços, documentos, conversas, cobranças).
  Se a falha expôs dados, descreva o tipo de dado e onde ele apareceu, sem copiá-lo.
- Não envie chaves, tokens, senhas ou arquivos de configuração reais.
- Se você encontrar um segredo exposto no repositório ou no histórico do git,
  relate-o pelo canal privado, diga o arquivo e o commit, e não o use.
- Se você já acessou dados de outras pessoas sem querer, pare, não os copie nem
  os guarde, e diga isso no relato.

## Escopo

Dentro do escopo:

- o código em `apps/web/` (site, PWA e as versões empacotadas com Capacitor e Tauri);
- as migrations, as políticas de RLS e as funções do banco em `apps/web/supabase/`;
- as Edge Functions em `apps/web/supabase/functions/`;
- os workflows em `.github/`.

Fora do escopo: falhas em serviços de terceiros usados pelo projeto (Supabase,
Asaas, Cloudflare, WhatsApp, Resend, GitHub). Elas devem ser reportadas
diretamente a cada fornecedor.

## O que não é uma vulnerabilidade

Estes casos não precisam de relato privado (abra uma issue comum se quiser
discutir, ou ignore):

- relatos de scanners automáticos sem prova de impacto no WorkEasy;
- ausência de cabeçalhos ou de políticas que o projeto já define em
  `apps/web/public/_headers`, ou recomendações genéricas sem falha demonstrável;
- chaves **públicas** de propósito (por exemplo, a chave publicável do Supabase
  ou o DSN do Sentry, que vão no bundle do site);
- erros de texto, de layout ou de acessibilidade sem efeito de segurança
  (use uma issue comum);
- ataques que exigem aparelho, navegador ou conta já comprometidos pelo próprio atacante;
- negação de serviço por volume, e engenharia social contra o responsável do projeto;
- versões antigas, forks e commits que não estão na branch `main`.

## Regras para testar

Ao testar, não acesse contas ou dados de outras pessoas, não use engenharia
social, não cause negação de serviço e baixe apenas o necessário para provar a
falha. Teste só contra uma instalação sua (por exemplo, a stack local descrita
em `apps/web/README.md`) e nunca contra serviços de terceiros em nome do
WorkEasy. O projeto ainda não tem usuários reais, mas os testes também não
devem usar dados de pessoas.

## Versões suportadas

Ainda não há versão publicada. Apenas a branch `main` é mantida.

## Prazos de resposta

Prazos a confirmar pelo dono do projeto. O projeto é mantido por uma equipe
pequena e não assumiu nenhum compromisso de prazo (SLA). Até o dono confirmar:

- o relato é lido pelo responsável pelo repositório, sem hora marcada;
- a intenção é dar um primeiro retorno pelo próprio relato do GitHub, mas isso
  **não é uma promessa**;
- não há prazo garantido de correção, nem programa de recompensa.

Quando o dono definir os prazos, este quadro deve ser atualizado com os valores
reais:

| Etapa | Prazo | Situação |
|---|---|---|
| Confirmar o recebimento | a confirmar pelo dono | pendente |
| Primeira avaliação (aceito, recusado ou pedido de mais dados) | a confirmar pelo dono | pendente |
| Correção ou plano de correção | a confirmar pelo dono | pendente |

Se o relato envolver dados pessoais de terceiros, o responsável segue o plano de
resposta a incidentes em `apps/web/docs/juridico/08-plano-de-resposta-a-incidentes.md`.
