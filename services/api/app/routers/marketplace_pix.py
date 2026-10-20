import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/marketplace", tags=["Marketplace & Pix Escrow"])

class CriarDiariaRequest(BaseModel):
    contratante_id: str
    prestador_id: str
    categoria: Literal["Faxina & Limpeza", "Pintura & Reparos", "Jardinagem", "Elétrica & Hidráulica", "Cuidador(a)"]
    data_servico: str
    valor_bruto_diaria: Decimal = Field(..., gt=Decimal("50.00"))
    convenio_prefeitura: bool = True

class OrdemDiariaPixResponse(BaseModel):
    ordem_id: str
    status_ordem: str
    valor_total_cobrado: Decimal
    repasse_liquido_prestador: Decimal
    taxa_plataforma_manutencao: Decimal
    pix_copia_e_cola: str
    pin_checkin_seguranca: str
    timestamp_atualizacao: str

ORDENS_DB = {}

@router.post("/ordens/criar-pix-escrow", response_model=OrdemDiariaPixResponse, status_code=status.HTTP_201_CREATED)
async def criar_ordem_diaria_pix(payload: CriarDiariaRequest):
    ordem_id = f"ORD-{uuid.uuid4().hex[:8].upper()}"
    aliquota = Decimal("0.05") if payload.convenio_prefeitura else Decimal("0.12")
    taxa = (payload.valor_bruto_diaria * aliquota).quantize(Decimal("0.01"))
    repasse = (payload.valor_bruto_diaria - taxa).quantize(Decimal("0.01"))
    pin = str(uuid.uuid4().int)[:4]
    reg = {
        "ordem_id": ordem_id,
        "status_ordem": "VALOR_EM_CUSTODIA_ESCROW",
        "valor_total_cobrado": payload.valor_bruto_diaria,
        "repasse_liquido_prestador": repasse,
        "taxa_plataforma_manutencao": taxa,
        "pix_copia_e_cola": f"00020126580014BR.GOV.BCB.PIX0136workeasy-{ordem_id.lower()}",
        "pin_checkin_seguranca": pin,
        "timestamp_atualizacao": datetime.now(timezone.utc).isoformat(),
    }
    ORDENS_DB[ordem_id] = reg
    return OrdemDiariaPixResponse(**reg)
