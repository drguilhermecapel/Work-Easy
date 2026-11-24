import hashlib, os, uuid
from datetime import datetime, timezone
from typing import Literal, List
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

router = APIRouter(prefix="/v1/kyc", tags=["Biometria Facial, Liveness & Antecedentes"])

AVISO_PROTOTIPO = (
    "Protótipo. Não é verificação de identidade oficial: as imagens são enviadas à API Gemini "
    "(Google) e a análise é uma estimativa de modelo de IA, não prova de vida certificada. "
    "Os antecedentes criminais NÃO foram consultados: o resultado fica sempre em revisão manual."
)


class BiometricKycSchema(BaseModel):
    liveness_aprovado: bool
    liveness_score: float = Field(ge=0.0, le=1.0)
    face_match_aprovado: bool
    face_match_score: float = Field(ge=0.0, le=1.0)
    indicadores_fraude_detectados: List[str] = Field(default_factory=list)
    status_recomendado: Literal["APROVADO", "REVISAO_MANUAL", "REJEITADO"]
    orientacao_voz_prestador: str

class BiometricKycResponse(BaseModel):
    protocolo_kyc: str
    timestamp_utc: str
    hash_auditoria_lgpd: str
    biometria: BiometricKycSchema
    status_antecedentes: Literal["APTO", "REVISAO_MANUAL"]
    protocolo_certidao: str
    imagens_descartadas_ram: bool
    aviso: str = AVISO_PROTOTIPO

def consultar_antecedentes_boolean(cpf: str) -> tuple[Literal["APTO", "REVISAO_MANUAL"], str]:
    # Nenhuma base de antecedentes é consultada aqui. Nunca devolver "APTO" nem um protocolo de
    # certidão inventado: o resultado honesto é revisão manual.
    apenas_digitos = "".join(filter(str.isdigit, cpf))
    if len(apenas_digitos) != 11:
        raise HTTPException(status_code=422, detail="CPF inválido.")
    return "REVISAO_MANUAL", "NAO_CONSULTADO"

@router.post("/liveness-face-match", response_model=BiometricKycResponse)
async def validar_biometria_e_antecedentes(
    cpf: str = Form(...),
    consentimento_lgpd: bool = Form(...),
    documento_img: UploadFile = File(...),
    selfie_liveness_img: UploadFile = File(...),
):
    if not consentimento_lgpd:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Consentimento LGPD obrigatório.")
    doc_bytes = b""
    selfie_bytes = b""
    try:
        doc_bytes = await documento_img.read()
        selfie_bytes = await selfie_liveness_img.read()
        hash_combinado = hashlib.sha256(doc_bytes + selfie_bytes).hexdigest()
        # Só a variável de servidor GEMINI_API_KEY. Nunca uma variável pública (NEXT_PUBLIC_*,
        # EXPO_PUBLIC_*, VITE_*), que iria para o pacote do cliente.
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="GEMINI_API_KEY ausente.")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[
                types.Part.from_bytes(data=doc_bytes, mime_type=documento_img.content_type or "image/jpeg"),
                types.Part.from_bytes(data=selfie_bytes, mime_type=selfie_liveness_img.content_type or "image/jpeg"),
                "Compare o documento oficial com a selfie de prova de vida.",
            ],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=BiometricKycSchema,
                temperature=0.1,
            ),
        )
        biometria_res = BiometricKycSchema.model_validate_json(response.text)
        st_ant, prot = consultar_antecedentes_boolean(cpf)
        return BiometricKycResponse(
            protocolo_kyc=f"KYC-{uuid.uuid4().hex[:10].upper()}",
            timestamp_utc=datetime.now(timezone.utc).isoformat(),
            hash_auditoria_lgpd=f"sha256:{hash_combinado}",
            biometria=biometria_res,
            status_antecedentes=st_ant,
            protocolo_certidao=prot,
            imagens_descartadas_ram=True,
        )
    finally:
        del doc_bytes
        del selfie_bytes
        await documento_img.close()
        await selfie_liveness_img.close()
