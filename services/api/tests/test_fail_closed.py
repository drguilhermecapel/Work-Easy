"""Trava o comportamento "falhar fechado" da API protótipo."""

import logging
import os
import re
import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.integrations import biometria_kyc
from app.main import DEMO_HEADER_NAME, DEMO_HEADER_VALUE, DEV_ENVIRONMENTS, create_app

API_DIR = Path(__file__).resolve().parent.parent

PIX_PAYLOAD = {
    "contratante_id": "CLI-1",
    "prestador_id": "WE-2026-0891",
    "categoria": "Faxina & Limpeza",
    "data_servico": "2026-10-22",
    "valor_bruto_diaria": "180.00",
    "convenio_prefeitura": True,
}
SOS_PAYLOAD = {
    "ordem_id": "ORD-1",
    "reportante_id": "CLI-1",
    "perfil": "CONTRATANTE",
    "latitude": -23.5,
    "longitude": -46.6,
    "motivo_emergencia": "teste",
}
AVALIACAO_PAYLOAD = {
    "ordem_id": "ORD-1",
    "avaliador_tipo": "CONTRATANTE",
    "avaliado_id": "WE-2026-0891",
    "nota_estrelas": 5,
}
DEMO_REQUESTS = [
    ("/v1/marketplace/ordens/criar-pix-escrow", PIX_PAYLOAD),
    ("/v1/seguranca/sos/acionar", SOS_PAYLOAD),
    ("/v1/seguranca/avaliacoes/registrar", AVALIACAO_PAYLOAD),
]


# Desde o DD101 as rotas demo exigem, além da variável, APP_ENV numa lista explícita de desenvolvimento.
DEV_DEMO = {"APP_ENV": "development", "ENABLE_DEMO_ROUTES": "true"}
# Valores de APP_ENV que NÃO são desenvolvimento: contam como publicado (falha fechada).
APP_ENVS_PUBLICADOS = [
    None, "", "   ", "production", "PRODUCTION", " prod ", "prd", "live", "staging", "homolog",
    "preview", "qa", "desenvolvimento", "development-prod", "dev2", "test,production",
]


def _client(env: dict[str, str]) -> TestClient:
    return TestClient(create_app(env))


def _env(app_env: str | None, **extra: str) -> dict[str, str]:
    env = dict(extra)
    if app_env is not None:
        env["APP_ENV"] = app_env
    return env


# --- rotas demo -----------------------------------------------------------------------------

@pytest.mark.parametrize("env", [{}, {"ENABLE_DEMO_ROUTES": ""}, {"ENABLE_DEMO_ROUTES": "false"}, {"ENABLE_DEMO_ROUTES": "talvez"}])
@pytest.mark.parametrize("path,payload", DEMO_REQUESTS)
def test_rotas_demo_nao_existem_sem_a_variavel(env, path, payload):
    res = _client(env).post(path, json=payload)
    assert res.status_code == 404
    assert DEMO_HEADER_NAME.lower() not in {k.lower() for k in res.headers}


def test_openapi_sem_a_variavel_nao_lista_rotas_demo():
    # Premissa atualizada (DD101): o /openapi.json só existe em desenvolvimento; aqui a demo continua desligada.
    paths = _client({"APP_ENV": "development"}).get("/openapi.json").json()["paths"]
    assert "/health" in paths
    assert not any(p.startswith(("/v1/marketplace", "/v1/seguranca")) for p in paths)


@pytest.mark.parametrize("path,payload", DEMO_REQUESTS)
def test_rotas_demo_existem_com_a_variavel_e_trazem_o_aviso(path, payload):
    res = _client(DEV_DEMO).post(path, json=payload)
    assert res.status_code == 201
    assert res.headers[DEMO_HEADER_NAME] == DEMO_HEADER_VALUE == "not-for-production"


def test_cabecalho_de_aviso_aparece_em_todas_as_respostas_com_a_demo_ligada():
    c = _client(DEV_DEMO)
    assert c.get("/health").headers[DEMO_HEADER_NAME] == "not-for-production"
    assert c.get("/rota-que-nao-existe").headers[DEMO_HEADER_NAME] == "not-for-production"
    assert c.get("/health").json()["demo_routes"] is True


def test_demo_ligada_escreve_aviso_no_log(caplog):
    with caplog.at_level(logging.WARNING, logger="workeasy.api"):
        create_app(DEV_DEMO)
    assert any("DEMO" in r.getMessage() and "produção" in r.getMessage() for r in caplog.records)


def test_sem_a_variavel_nao_ha_aviso_nem_cabecalho(caplog):
    with caplog.at_level(logging.WARNING, logger="workeasy.api"):
        c = _client({})
    assert not caplog.records
    assert DEMO_HEADER_NAME.lower() not in {k.lower() for k in c.get("/health").headers}


def test_cabecalho_de_aviso_aparece_no_500_nao_tratado():
    """Exceção não tratada vira 500 no ServerErrorMiddleware, por fora dos middlewares comuns: o aviso tem que sair."""
    for env in (DEV_DEMO, {**DEV_DEMO, "CORS_ALLOWED_ORIGINS": "https://app.workeasy.example"}):
        app = create_app(env)

        @app.get("/explode")
        async def explode():
            raise ValueError("falha proposital do teste")

        res = TestClient(app, raise_server_exceptions=False).get(
            "/explode", headers={"Origin": "https://app.workeasy.example"}
        )
        assert res.status_code == 500
        assert res.headers[DEMO_HEADER_NAME] == "not-for-production"


def test_cabecalho_de_aviso_aparece_em_erros_tratados_e_preflight():
    c = _client({**DEV_DEMO, "CORS_ALLOWED_ORIGINS": "https://app.workeasy.example"})
    respostas = [
        c.post("/v1/seguranca/sos/acionar", json={}),  # 422
        c.get("/v1/seguranca/sos/acionar"),  # 405
        c.options("/health", headers={"Origin": "https://app.workeasy.example", "Access-Control-Request-Method": "GET"}),
        c.options("/health", headers={"Origin": "https://invasor.example", "Access-Control-Request-Method": "GET"}),
    ]
    assert [r.status_code for r in respostas[:2]] == [422, 405]
    for res in respostas:
        assert res.headers[DEMO_HEADER_NAME] == "not-for-production"
        # o valor sai uma vez só, sem duplicar
        assert res.headers.get_list(DEMO_HEADER_NAME) == ["not-for-production"]


# --- recusa de iniciar fora de desenvolvimento -------------------------------------------------
# Premissa atualizada (DD101): antes só "production"/"prod" recusavam; agora recusa todo APP_ENV fora da lista
# explícita de desenvolvimento, inclusive ausente ou vazio. Os casos antigos continuam na lista.

@pytest.mark.parametrize("app_env", APP_ENVS_PUBLICADOS)
def test_fora_de_desenvolvimento_com_demo_recusa_subir(app_env):
    with pytest.raises(RuntimeError, match="Recusando iniciar: ENABLE_DEMO_ROUTES=true"):
        create_app(_env(app_env, ENABLE_DEMO_ROUTES="true"))


@pytest.mark.parametrize("app_env", APP_ENVS_PUBLICADOS)
def test_fora_de_desenvolvimento_sem_demo_sobe(app_env):
    res = _client(_env(app_env)).get("/health")
    assert res.status_code == 200
    assert res.json()["demo_routes"] is False


def test_lista_de_desenvolvimento_e_exatamente_a_decidida():
    assert DEV_ENVIRONMENTS == {"development", "dev", "local", "test"}


@pytest.mark.parametrize("app_env", ["development", "dev", "local", "test", " DEV ", "Development"])
def test_desenvolvimento_com_demo_sobe(app_env):
    c = _client({"APP_ENV": app_env, "ENABLE_DEMO_ROUTES": "true"})
    assert c.get("/health").status_code == 200
    assert c.get("/health").json()["demo_routes"] is True


@pytest.mark.parametrize("app_env", ["production", "prd", None])
def test_processo_real_recusa_subir_fora_de_desenvolvimento_com_demo(app_env):
    """Importar app.main (o que o uvicorn faz) tem que falhar com erro claro."""
    env = {k: v for k, v in os.environ.items() if k != "APP_ENV"}
    env["ENABLE_DEMO_ROUTES"] = "true"
    if app_env is not None:
        env["APP_ENV"] = app_env
    proc = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=API_DIR, env=env, capture_output=True, text=True, timeout=60,
    )
    assert proc.returncode != 0
    assert "Recusando iniciar" in proc.stderr


# --- documentação interativa só em desenvolvimento ---------------------------------------------

DOC_PATHS = ["/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"]


@pytest.mark.parametrize("app_env", APP_ENVS_PUBLICADOS)
def test_documentacao_desligada_fora_de_desenvolvimento(app_env):
    c = _client(_env(app_env))
    for path in DOC_PATHS + [p + "/" for p in DOC_PATHS]:
        assert c.get(path).status_code == 404, path


@pytest.mark.parametrize("env", [{"APP_ENV": "development"}, DEV_DEMO])
def test_documentacao_ligada_em_desenvolvimento(env):
    c = _client(env)
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert c.get(path).status_code == 200, path


# --- tentativa de romper por requisição com a configuração de produção -------------------------

VARIACOES_DE_CAMINHO = [
    "/v1/marketplace/ordens/criar-pix-escrow",
    "/v1/marketplace/ordens/criar-pix-escrow/",
    "//v1/marketplace/ordens/criar-pix-escrow",
    "/V1/MARKETPLACE/ORDENS/CRIAR-PIX-ESCROW",
    "/v1/marketplace/ordens/criar-pix-escrow%2F",
    "/v1%2Fmarketplace%2Fordens%2Fcriar-pix-escrow",
    "/v1/marketplace/./ordens/criar-pix-escrow",
    "/v1/x/../marketplace/ordens/criar-pix-escrow",
    "/v1/seguranca/sos/acionar",
    "/v1/seguranca/sos/acionar;x=1",
    "/v1/seguranca/avaliacoes/registrar",
    "/v1/kyc/liveness-face-match",
    "/health/../v1/seguranca/sos/acionar",
]


@pytest.mark.parametrize("path", VARIACOES_DE_CAMINHO)
@pytest.mark.parametrize("method", ["GET", "POST", "PUT", "OPTIONS", "HEAD"])
def test_producao_nao_expoe_rota_demo_por_variacao_de_caminho_ou_metodo(path, method):
    c = _client({"APP_ENV": "production", "CORS_ALLOWED_ORIGINS": "https://app.workeasy.example"})
    res = c.request(
        method, path, json=SOS_PAYLOAD if method in {"POST", "PUT"} else None,
        headers={"Origin": "https://invasor.example", "Access-Control-Request-Method": "POST",
                 "Host": "invasor.example", "X-Forwarded-Host": "app.workeasy.example"},
    )
    # Preflight de origem hostil é barrado pelo CORS antes do roteamento (400 "Disallowed CORS origin").
    esperado = {400} if method == "OPTIONS" else {404, 405}
    assert res.status_code in esperado, (method, path, res.status_code)
    if method == "OPTIONS":
        assert res.text == "Disallowed CORS origin"
    assert "protocolo" not in res.text.lower() and "pix" not in res.text.lower()
    assert DEMO_HEADER_NAME.lower() not in {k.lower() for k in res.headers}
    assert "access-control-allow-origin" not in res.headers


# --- CORS ------------------------------------------------------------------------------------

def _preflight(c: TestClient, origin: str):
    return c.options(
        "/health",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )


@pytest.mark.parametrize("env", [{}, {"CORS_ALLOWED_ORIGINS": ""}, {"CORS_ALLOWED_ORIGINS": " , "}])
def test_cors_sem_origem_configurada_nao_devolve_allow_origin(env):
    c = _client(env)
    for res in (c.get("/health", headers={"Origin": "https://qualquer.site"}), _preflight(c, "https://qualquer.site")):
        assert "access-control-allow-origin" not in res.headers


def test_cors_com_origem_listada_devolve_so_ela():
    c = _client({"CORS_ALLOWED_ORIGINS": "https://app.workeasy.example, https://b2g.workeasy.example"})
    ok = c.get("/health", headers={"Origin": "https://app.workeasy.example"})
    assert ok.headers["access-control-allow-origin"] == "https://app.workeasy.example"
    pre = _preflight(c, "https://b2g.workeasy.example")
    assert pre.headers["access-control-allow-origin"] == "https://b2g.workeasy.example"
    outra = c.get("/health", headers={"Origin": "https://invasor.example"})
    assert "access-control-allow-origin" not in outra.headers
    assert _preflight(c, "https://invasor.example").headers.get("access-control-allow-origin") is None


def test_cors_asterisco_e_recusado():
    with pytest.raises(RuntimeError, match="CORS_ALLOWED_ORIGINS"):
        create_app({"CORS_ALLOWED_ORIGINS": "*"})
    with pytest.raises(RuntimeError, match="CORS_ALLOWED_ORIGINS"):
        create_app({"CORS_ALLOWED_ORIGINS": "https://a.example,*"})


# --- KYC: nada de afirmação falsa nem chave pública --------------------------------------------

def test_antecedentes_nunca_diz_apto_nem_inventa_certidao():
    status_ant, protocolo = biometria_kyc.consultar_antecedentes_boolean("123.456.789-09")
    assert status_ant == "REVISAO_MANUAL"
    assert protocolo == "NAO_CONSULTADO"


def test_resposta_do_kyc_traz_aviso_de_prototipo():
    assert "Protótipo" in biometria_kyc.AVISO_PROTOTIPO
    assert "NÃO foram consultados" in biometria_kyc.AVISO_PROTOTIPO


def test_chave_do_gemini_so_de_variavel_de_servidor():
    codigo = "\n".join(p.read_text(encoding="utf-8") for p in (API_DIR / "app").rglob("*.py"))
    assert not re.search(r"(NEXT_PUBLIC|EXPO_PUBLIC|VITE)_\w*(GEMINI|API_KEY)", codigo)
    assert 'os.getenv("GEMINI_API_KEY")' in codigo
