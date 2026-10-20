from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_health_check():
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json()["repository"] == "work-easy"

def test_bloqueio_sem_consentimento_lgpd():
    files = {
        "documento_img": ("rg.jpg", b"doc", "image/jpeg"),
        "selfie_liveness_img": ("selfie.jpg", b"selfie", "image/jpeg"),
    }
    res = client.post("/v1/kyc/liveness-face-match", data={"cpf": "12345678909", "consentimento_lgpd": "false"}, files=files)
    assert res.status_code == 403

def test_split_pix_escrow():
    payload = {
        "contratante_id": "CLI-1",
        "prestador_id": "WE-2026-0891",
        "categoria": "Faxina & Limpeza",
        "data_servico": "2026-10-22",
        "valor_bruto_diaria": "180.00",
        "convenio_prefeitura": True,
    }
    res = client.post("/v1/marketplace/ordens/criar-pix-escrow", json=payload)
    assert res.status_code == 201
    assert res.json()["repasse_liquido_prestador"] == "171.00"
