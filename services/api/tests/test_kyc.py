from fastapi.testclient import TestClient
from app.main import create_app

# Os testes montam o app com um ambiente explícito, sem depender de os.environ.
client = TestClient(create_app({}))
demo_client = TestClient(create_app({"ENABLE_DEMO_ROUTES": "true"}))

def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["repository"] == "work-easy"
    assert res.json()["demo_routes"] is False

def test_kyc_nao_existe_sem_a_demo():
    # Sem autenticação nem limite, o KYC gastaria a cota do Gemini de quem achasse a URL: só com a demo ligada
    files = {"documento_img": ("rg.jpg", b"doc", "image/jpeg"), "selfie_liveness_img": ("selfie.jpg", b"selfie", "image/jpeg")}
    res = client.post("/v1/kyc/liveness-face-match", data={"cpf": "12345678909", "consentimento_lgpd": "true"}, files=files)
    assert res.status_code == 404


def test_bloqueio_sem_consentimento_lgpd():
    files = {
        "documento_img": ("rg.jpg", b"doc", "image/jpeg"),
        "selfie_liveness_img": ("selfie.jpg", b"selfie", "image/jpeg"),
    }
    res = demo_client.post("/v1/kyc/liveness-face-match", data={"cpf": "12345678909", "consentimento_lgpd": "false"}, files=files)
    assert res.status_code == 403

def test_split_pix_escrow():
    # Rota DEMO: só existe com ENABLE_DEMO_ROUTES=true.
    payload = {
        "contratante_id": "CLI-1",
        "prestador_id": "WE-2026-0891",
        "categoria": "Faxina & Limpeza",
        "data_servico": "2026-10-22",
        "valor_bruto_diaria": "180.00",
        "convenio_prefeitura": True,
    }
    res = demo_client.post("/v1/marketplace/ordens/criar-pix-escrow", json=payload)
    assert res.status_code == 201
    assert res.json()["repasse_liquido_prestador"] == "171.00"
