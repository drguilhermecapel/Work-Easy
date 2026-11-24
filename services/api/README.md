# API do Work Easy (`services/api`): protótipo

**Estado verdadeiro: isto é um protótipo antigo, não o produto.** O produto real do Work Easy é o
`apps/web` (com backend próprio em Supabase). Esta API não tem autenticação, não tem banco ligado
ao código (o `db/schema.sql` não é usado por nenhuma rota) e não deve ser publicada na internet
como serviço de pagamento, segurança ou identidade.

Por isso ela **falha fechada**: sem configuração explícita, sobe somente com `/health`, sem CORS aberto e sem
documentação interativa (`/docs`, `/redoc` e `/openapi.json` só existem em desenvolvimento). As rotas demo só sobem
num ambiente de desenvolvimento declarado (`APP_ENV` numa lista explícita); qualquer outro valor, inclusive ausente,
conta como publicado (DD101).
O KYC com Gemini também só existe com `ENABLE_DEMO_ROUTES=true`: sem autenticação nem limite de uso, ele
gastaria a cota da chave do Gemini de qualquer pessoa que achasse a URL e enviaria imagens de documento e
selfie ao Google sem contrato de operador nem base legal registrados.

## O que existe

| Rota | O que faz de verdade | O que NÃO faz |
|---|---|---|
| `GET /health` | Diz que a API está de pé e se as rotas demo estão ligadas. | |
| `POST /v1/kyc/liveness-face-match` (**demo**) | Envia documento e selfie à API Gemini (Google) e devolve a estimativa do modelo. Exige consentimento LGPD no formulário. | Não é prova de vida certificada nem verificação oficial de identidade. **Não consulta antecedentes**: o resultado é sempre `REVISAO_MANUAL`, com protocolo `NAO_CONSULTADO`. As imagens saem do servidor para o Google. Não há autenticação nem limite de uso (qualquer um que alcance a rota gasta a cota da chave). |
| `POST /v1/marketplace/ordens/criar-pix-escrow` (**demo**) | Calcula taxa (5% com convênio, 12% sem, valores fixos no código) e devolve um "Pix copia e cola" inventado. | Não cobra nada, não fala com gateway nem banco, não guarda dinheiro. O pedido fica num dicionário em memória e some ao reiniciar. |
| `POST /v1/seguranca/sos/acionar` (**demo**) | Devolve um protocolo de SOS inventado. | **Não notifica ninguém.** Nenhuma central, nenhuma guarda. Um botão SOS que parece funcionar e não aciona ninguém é perigoso. |
| `POST /v1/seguranca/avaliacoes/registrar` (**demo**) | Devolve um protocolo de avaliação inventado. | Não grava a avaliação nem publica em perfil algum. |

## Por que a custódia Pix não pode ir a produção

A rota de "escrow" fala em valor "em custódia" na própria plataforma. Manter dinheiro de terceiros
em custódia, ou arranjar pagamento por conta própria, pode caracterizar atividade de instituição de
pagamento (Lei 12.865/2013 e regulamentação do Banco Central, como a Res. BCB 150/2021), que exige
autorização. Isso depende de parecer jurídico, que ainda não existe. A decisão está registrada em
`apps/web/docs/DECISOES.md` (seção "Pagamento retido"): só considerar com instituição autorizada
fazendo a custódia. Isto não é parecer jurídico; é o motivo de a rota estar desligada.

## Variáveis de ambiente

| Variável | Efeito | Padrão |
|---|---|---|
| `ENABLE_DEMO_ROUTES` | `true` monta as rotas demo (KYC, custódia Pix, SOS, reputação), **só** se `APP_ENV` for de desenvolvimento. Com ela ligada, a API escreve um aviso no log e **toda resposta** leva o cabeçalho `X-Work-Easy-Demo: not-for-production`, inclusive erros 4xx, preflight de CORS e o 500 de exceção não tratada. | ausente = desligado (essas rotas respondem 404 e nem são carregadas) |
| `APP_ENV` | Lista **explícita** de desenvolvimento: `development`, `dev`, `local`, `test` (sem diferença de maiúsculas nem espaços nas pontas). Só nela as rotas demo podem subir e `/docs`, `/redoc` e `/openapi.json` existem. **Qualquer outro valor, inclusive ausente ou vazio** (`production`, `prd`, `live`, `staging`...), conta como publicado: com `ENABLE_DEMO_ROUTES` ligada a API **se recusa a subir** com erro claro, e a documentação responde 404. | ausente = publicado |
| `CORS_ALLOWED_ORIGINS` | Origens permitidas, separadas por vírgula (ex.: `http://localhost:3000,https://app.exemplo.com`). Só elas recebem `access-control-allow-origin`. `*` é recusado com erro. | vazio = nenhuma origem cruzada |
| `GEMINI_API_KEY` | Chave do KYC. Só variável de servidor; nunca `NEXT_PUBLIC_*`, `EXPO_PUBLIC_*` ou `VITE_*`. Sem ela o KYC responde 500. | ausente |

## Como ligar a demo localmente

```bash
cd services/api
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
APP_ENV=development ENABLE_DEMO_ROUTES=true CORS_ALLOWED_ORIGINS=http://localhost:3000 \
  uvicorn app.main:app --port 8000
# aviso no log e cabeçalho X-Work-Easy-Demo em todas as respostas; /docs lista as rotas demo
```

Sem `APP_ENV` de desenvolvimento, `ENABLE_DEMO_ROUTES=true` faz a API recusar subir. Nunca defina
`ENABLE_DEMO_ROUTES` nem um `APP_ENV` de desenvolvimento em qualquer ambiente publicado. Os arquivos `render.yaml` e `cloudbuild.yaml` foram removidos (DD95): este serviço é protótipo e não tem destino de publicação.

## Testes

```bash
cd services/api && python -m pytest
```

Os testes (`tests/test_fail_closed.py`) travam: rotas demo respondem 404 sem a variável; com ela (em
desenvolvimento) existem e trazem o cabeçalho, inclusive no 500 não tratado; qualquer `APP_ENV` fora da lista de
desenvolvimento (inclusive ausente) com a variável recusa subir, também no processo real; `/docs`, `/redoc` e
`/openapi.json` só existem em desenvolvimento; com a configuração de produção, variações de caminho, método,
`Host` e `Origin` hostis não alcançam rota demo; CORS sem origem não devolve
`access-control-allow-origin`, e com origem listada devolve só ela; o KYC nunca diz `APTO` nem
inventa certidão. Use Python 3.12 (o `Dockerfile` usa 3.12; o `asyncpg==0.29.0` não compila no 3.13).
