import uuid
from datetime import datetime, timezone
from typing import Literal, Optional
from fastapi import APIRouter, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/v1/seguranca", tags=["Reputação Bilateral & Alerta SOS"])

class AvaliacaoBilateralRequest(BaseModel):
    ordem_id: str
    avaliador_tipo: Literal["CONTRATANTE", "PRESTADOR"]
    avaliado_id: str
    nota_estrelas: int = Field(..., ge=1, le=5)
    tags_destaque: list[str] = Field(default_factory=list)
    comentario_audio_transcrito: Optional[str] = None

class AcionamentoSosRequest(BaseModel):
    ordem_id: str
    reportante_id: str
    perfil: Literal["CONTRATANTE", "PRESTADOR"]
    latitude: float
    longitude: float
    motivo_emergencia: str

@router.post("/avaliacoes/registrar", status_code=status.HTTP_201_CREATED)
async def registrar_avaliacao(payload: AvaliacaoBilateralRequest):
    return {"protocolo_avaliacao": f"REV-{uuid.uuid4().hex[:8].upper()}", "status": "PUBLICADO_NO_PERFIL"}

@router.post("/sos/acionar", status_code=status.HTTP_201_CREATED)
async def acionar_botao_sos(payload: AcionamentoSosRequest):
    return {
        "protocolo_sos": f"SOS-{uuid.uuid4().hex[:8].upper()}",
        "prioridade": "CRITICA_IMEDIATA",
        "central_notificada": "Central Integrada B2G / Guarda Civil Municipal",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
    }
