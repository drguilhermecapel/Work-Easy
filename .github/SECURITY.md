# Política de segurança

O WorkEasy é um protótipo: ainda não está publicado para o público, não passou
por auditoria de segurança independente e não tem certificação. Este documento
diz como reportar uma falha; não garante a segurança do produto.

## Como reportar uma vulnerabilidade

Não abra issue pública nem pull request com detalhes da falha. Use o relatório
privado do GitHub: aba **Security** do repositório, depois **Report a vulnerability**.
Esse recurso precisa estar ativo nas configurações do repositório (passo manual,
descrito em `apps/web/docs/arquitetura/infra.md`).

Contato alternativo: [CONTATO A DEFINIR PELO RESPONSÁVEL DO PROJETO]

Inclua, quando possível:

- o caminho do arquivo, da função ou da política afetada;
- os passos para reproduzir a falha;
- o impacto que você observou;
- uma sugestão de correção, se tiver.

Não envie chaves, tokens, senhas ou dados pessoais reais no relatório. Se você
encontrar um segredo exposto no repositório, relate-o pelo canal privado e não o use.

## Escopo

Dentro do escopo:

- o código em `apps/web/` (site, PWA e as versões empacotadas com Capacitor e Tauri);
- as migrations, as políticas de RLS e as funções do banco em `apps/web/supabase/`;
- as Edge Functions em `apps/web/supabase/functions/`;
- os workflows em `.github/`.

Fora do escopo: falhas em serviços de terceiros usados pelo projeto (Supabase,
Asaas, Cloudflare, WhatsApp, Resend). Elas devem ser reportadas diretamente a
cada fornecedor.

Ao testar, não acesse contas ou dados de outras pessoas, não use engenharia
social, não cause negação de serviço e baixe apenas o necessário para provar a falha.
O projeto ainda não tem usuários reais, mas os testes também não devem usar dados de pessoas.

## Versões suportadas

Ainda não há versão publicada. Apenas a branch `main` é mantida.

## Prazos

Não há prazo garantido de resposta: o projeto é mantido por uma equipe pequena.
Você receberá retorno pelo canal de reporte.
