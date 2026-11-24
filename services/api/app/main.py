"""API do Work Easy (PROTÓTIPO).

Esta API é um protótipo antigo e NÃO é o produto em produção (o produto é `apps/web`).
Ela falha fechada: sem configuração explícita, sobe só com `/health`. O KYC com Gemini, a custódia Pix
e o SOS/reputação são todos de demonstração e dependem de `ENABLE_DEMO_ROUTES=true`.

Variáveis de ambiente lidas aqui:
- `ENABLE_DEMO_ROUTES`: "true" monta as rotas de demonstração (KYC experimental com Gemini, custódia Pix
  e SOS/reputação FALSOS). Padrão: desligado. Veja `services/api/README.md`.
- `APP_ENV`: só os valores da lista explícita de desenvolvimento (`development`, `dev`, `local`, `test`)
  permitem as rotas demo e a documentação interativa (`/docs`, `/redoc`, `/openapi.json`). Qualquer outro
  valor, inclusive ausente ou vazio (`production`, `prd`, `staging`, `live`...), conta como publicado: com
  `ENABLE_DEMO_ROUTES` ligada o processo se recusa a subir, e a documentação fica desligada (decisão DD101).
- `CORS_ALLOWED_ORIGINS`: origens permitidas, separadas por vírgula. Padrão vazio: nenhuma
  origem cruzada. "*" é recusado.

Decisão registrada em `apps/web/docs/DECISOES.md` (seção "Pagamento retido").
"""

import logging
import os
from collections.abc import Mapping

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.types import ASGIApp, Message, Receive, Scope, Send


logger = logging.getLogger("workeasy.api")

DEMO_HEADER_NAME = "X-Work-Easy-Demo"
DEMO_HEADER_VALUE = "not-for-production"
_TRUE_VALUES = {"true", "1", "yes", "on"}
# Lista EXPLÍCITA de ambientes de desenvolvimento. Fora dela (inclusive APP_ENV ausente), o ambiente conta como
# publicado: falhar fechado não pode depender de alguém escrever "production" do jeito certo (DD101).
DEV_ENVIRONMENTS = frozenset({"development", "dev", "local", "test"})


def _is_true(value: str | None) -> bool:
    return (value or "").strip().lower() in _TRUE_VALUES


def _parse_origins(raw: str | None) -> list[str]:
    origins = [item.strip() for item in (raw or "").split(",") if item.strip()]
    if "*" in origins:
        raise RuntimeError(
            "CORS_ALLOWED_ORIGINS não aceita '*'. Liste as origens exatas, separadas por vírgula."
        )
    return origins


def _is_dev_environment(value: str | None) -> bool:
    return (value or "").strip().lower() in DEV_ENVIRONMENTS


class _DemoHeaderASGI:
    """Põe o cabeçalho de aviso em TODA resposta HTTP, inclusive no 500 gerado pelo tratamento de erro do
    Starlette. Fica por fora de toda a pilha (veja `_DemoFastAPI`); um middleware `@app.middleware("http")`
    roda dentro do `ServerErrorMiddleware` e não vê o 500 de exceção não tratada."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_com_aviso(message: Message) -> None:
            if message["type"] == "http.response.start":
                name = DEMO_HEADER_NAME.lower().encode("latin-1")
                headers = [(k, v) for k, v in message.get("headers", []) if k.lower() != name]
                headers.append((name, DEMO_HEADER_VALUE.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_com_aviso)


class _DemoFastAPI(FastAPI):
    """FastAPI cuja pilha inteira (incluindo o `ServerErrorMiddleware`) fica dentro de `_DemoHeaderASGI`."""

    def build_middleware_stack(self) -> ASGIApp:
        return _DemoHeaderASGI(super().build_middleware_stack())


def create_app(environ: Mapping[str, str] | None = None) -> FastAPI:
    """Monta a aplicação. `environ` existe para os testes; por padrão usa `os.environ`."""
    env = os.environ if environ is None else environ
    demo = _is_true(env.get("ENABLE_DEMO_ROUTES"))
    app_env = (env.get("APP_ENV") or "").strip()
    dev = _is_dev_environment(app_env)

    if demo and not dev:
        raise RuntimeError(
            f"Recusando iniciar: ENABLE_DEMO_ROUTES=true com APP_ENV={app_env or '(ausente)'!s}. As rotas demo "
            "(KYC experimental, custódia Pix, SOS e reputação) só sobem com APP_ENV numa lista explícita de "
            f"desenvolvimento ({', '.join(sorted(DEV_ENVIRONMENTS))}); qualquer outro valor, inclusive ausente, "
            "conta como publicado. Remova ENABLE_DEMO_ROUTES ou, só no seu computador, defina APP_ENV=development. "
            "Veja apps/web/docs/DECISOES.md e services/api/README.md."
        )

    # Documentação interativa só em desenvolvimento: fora dele, /docs, /redoc e /openapi.json respondem 404.
    docs = {} if dev else {"docs_url": None, "redoc_url": None, "openapi_url": None}
    app_class = _DemoFastAPI if demo else FastAPI
    app = app_class(title="Work Easy API (protótipo)", version="1.2.0", **docs)

    origins = _parse_origins(env.get("CORS_ALLOWED_ORIGINS"))
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
        )

    if demo:
        # Importadas só aqui: sem a variável, o código demo nem é carregado. O KYC entra junto: sem autenticação
        # nem limite de uso, ele gasta a cota da GEMINI_API_KEY de quem alcançar a URL e envia imagens de documento
        # e selfie ao Google sem contrato de operador nem base legal registrados (decisão DD92).
        from app.integrations.biometria_kyc import router as biometria_router
        from app.routers.marketplace_pix import router as marketplace_router
        from app.routers.reputacao_sos import router as seguranca_router

        app.include_router(biometria_router)
        app.include_router(marketplace_router)
        app.include_router(seguranca_router)
        logger.warning(
            "ENABLE_DEMO_ROUTES=true: rotas DEMO montadas (KYC experimental, custódia Pix, SOS e "
            "reputação FALSOS, em memória, sem integração real). NÃO usar em produção."
        )

    @app.get("/health")
    async def health_check():
        return {"status": "ok", "repository": "work-easy", "demo_routes": demo}

    return app


app = create_app()
