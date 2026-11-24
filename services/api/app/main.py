"""API do Work Easy (PROTÓTIPO).

Esta API é um protótipo antigo e NÃO é o produto em produção (o produto é `apps/web`).
Ela falha fechada: sem configuração explícita, sobe só com `/health` e o KYC experimental.

Variáveis de ambiente lidas aqui:
- `ENABLE_DEMO_ROUTES`: "true" monta as rotas de demonstração (custódia Pix e SOS/reputação
  FALSOS). Padrão: desligado. Veja `services/api/README.md`.
- `APP_ENV`: "production" faz o processo se recusar a subir se `ENABLE_DEMO_ROUTES` estiver ligada.
- `CORS_ALLOWED_ORIGINS`: origens permitidas, separadas por vírgula. Padrão vazio: nenhuma
  origem cruzada. "*" é recusado.

Decisão registrada em `apps/web/docs/DECISOES.md` (seção "Pagamento retido").
"""

import logging
import os
from collections.abc import Mapping

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.integrations.biometria_kyc import router as biometria_router

logger = logging.getLogger("workeasy.api")

DEMO_HEADER_NAME = "X-Work-Easy-Demo"
DEMO_HEADER_VALUE = "not-for-production"
_TRUE_VALUES = {"true", "1", "yes", "on"}


def _is_true(value: str | None) -> bool:
    return (value or "").strip().lower() in _TRUE_VALUES


def _parse_origins(raw: str | None) -> list[str]:
    origins = [item.strip() for item in (raw or "").split(",") if item.strip()]
    if "*" in origins:
        raise RuntimeError(
            "CORS_ALLOWED_ORIGINS não aceita '*'. Liste as origens exatas, separadas por vírgula."
        )
    return origins


def create_app(environ: Mapping[str, str] | None = None) -> FastAPI:
    """Monta a aplicação. `environ` existe para os testes; por padrão usa `os.environ`."""
    env = os.environ if environ is None else environ
    demo = _is_true(env.get("ENABLE_DEMO_ROUTES"))
    production = (env.get("APP_ENV") or "").strip().lower() in {"production", "prod"}

    if demo and production:
        raise RuntimeError(
            "Recusando iniciar: ENABLE_DEMO_ROUTES=true com APP_ENV=production. As rotas demo "
            "(custódia Pix, SOS e reputação) são falsas e não podem ir a produção. Remova "
            "ENABLE_DEMO_ROUTES. Veja apps/web/docs/DECISOES.md e services/api/README.md."
        )

    app = FastAPI(title="Work Easy API (protótipo)", version="1.2.0")

    origins = _parse_origins(env.get("CORS_ALLOWED_ORIGINS"))
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
        )

    app.include_router(biometria_router)

    if demo:
        # Importadas só aqui: sem a variável, o código demo nem é carregado.
        from app.routers.marketplace_pix import router as marketplace_router
        from app.routers.reputacao_sos import router as seguranca_router

        app.include_router(marketplace_router)
        app.include_router(seguranca_router)
        logger.warning(
            "ENABLE_DEMO_ROUTES=true: rotas DEMO montadas (custódia Pix, SOS e reputação "
            "FALSOS, em memória, sem integração real). NÃO usar em produção."
        )

        @app.middleware("http")
        async def _marca_demo(request, call_next):
            response = await call_next(request)
            response.headers[DEMO_HEADER_NAME] = DEMO_HEADER_VALUE
            return response

    @app.get("/health")
    async def health_check():
        return {"status": "ok", "repository": "work-easy", "demo_routes": demo}

    return app


app = create_app()
