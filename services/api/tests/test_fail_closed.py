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
from app.main import DEMO_HEADER_NAME, DEMO_HEADER_VALUE, create_app

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


def _client(env: dict[str, str]) -> TestClient:
    return TestClient(create_app(env))


# --- rotas demo -----------------------------------------------------------------------------

@pytest.mark.parametrize("env", [{}, {"ENABLE_DEMO_ROUTES": ""}, {"ENABLE_DEMO_ROUTES": "false"}, {"ENABLE_DEMO_ROUTES": "talvez"}])
@pytest.mark.parametrize("path,payload", DEMO_REQUESTS)
def test_rotas_demo_nao_existem_sem_a_variavel(env, path, payload):
    res = _client(env).post(path, json=payload)
    assert res.status_code == 404
    assert DEMO_HEADER_NAME.lower() not in {k.lower() for k in res.headers}


def test_openapi_sem_a_variavel_nao_lista_rotas_demo():
    paths = _client({}).get("/openapi.json").json()["paths"]
    assert "/health" in paths
    assert not any(p.startswith(("/v1/marketplace", "/v1/seguranca")) for p in paths)


@pytest.mark.parametrize("path,payload", DEMO_REQUESTS)
def test_rotas_demo_existem_com_a_variavel_e_trazem_o_aviso(path, payload):
    res = _client({"ENABLE_DEMO_ROUTES": "true"}).post(path, json=payload)
    assert res.status_code == 201
    assert res.headers[DEMO_HEADER_NAME] == DEMO_HEADER_VALUE == "not-for-production"


def test_cabecalho_de_aviso_aparece_em_todas_as_respostas_com_a_demo_ligada():
    c = _client({"ENABLE_DEMO_ROUTES": "true"})
    assert c.get("/health").headers[DEMO_HEADER_NAME] == "not-for-production"
    assert c.get("/rota-que-nao-existe").headers[DEMO_HEADER_NAME] == "not-for-production"
    assert c.get("/health").json()["demo_routes"] is True


def test_demo_ligada_escreve_aviso_no_log(caplog):
    with caplog.at_level(logging.WARNING, logger="workeasy.api"):
        create_app({"ENABLE_DEMO_ROUTES": "true"})
    assert any("DEMO" in r.getMessage() and "produção" in r.getMessage() for r in caplog.records)


def test_sem_a_variavel_nao_ha_aviso_nem_cabecalho(caplog):
    with caplog.at_level(logging.WARNING, logger="workeasy.api"):
        c = _client({})
    assert not caplog.records
    assert DEMO_HEADER_NAME.lower() not in {k.lower() for k in c.get("/health").headers}


# --- recusa de iniciar em produção -----------------------------------------------------------

@pytest.mark.parametrize("app_env", ["production", "PRODUCTION", " prod "])
def test_producao_com_demo_recusa_subir(app_env):
    with pytest.raises(RuntimeError, match="ENABLE_DEMO_ROUTES"):
        create_app({"APP_ENV": app_env, "ENABLE_DEMO_ROUTES": "true"})


def test_producao_sem_demo_sobe():
    assert _client({"APP_ENV": "production"}).get("/health").status_code == 200


def test_desenvolvimento_com_demo_sobe():
    assert _client({"APP_ENV": "development", "ENABLE_DEMO_ROUTES": "true"}).get("/health").status_code == 200


def test_processo_real_recusa_subir_em_producao_com_demo():
    """Importar app.main (o que o uvicorn faz) tem que falhar com erro claro."""
    env = {**os.environ, "APP_ENV": "production", "ENABLE_DEMO_ROUTES": "true"}
    proc = subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=API_DIR, env=env, capture_output=True, text=True, timeout=60,
    )
    assert proc.returncode != 0
    assert "Recusando iniciar" in proc.stderr


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
