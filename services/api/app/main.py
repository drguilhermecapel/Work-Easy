from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.integrations.biometria_kyc import router as biometria_router
from app.routers.marketplace_pix import router as marketplace_router
from app.routers.reputacao_sos import router as seguranca_router

app = FastAPI(title="Work Easy API", version="1.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(biometria_router)
app.include_router(marketplace_router)
app.include_router(seguranca_router)

@app.get("/health")
async def health_check():
    return {"status": "ok", "repository": "work-easy", "lgpd_zero_storage": True}
