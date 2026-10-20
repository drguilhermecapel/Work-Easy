CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE TABLE IF NOT EXISTS prestadores (
    id VARCHAR(20) PRIMARY KEY,
    nome VARCHAR(150) NOT NULL,
    cpf_hash_unico CHAR(64) NOT NULL UNIQUE,
    cpf_mascarado VARCHAR(14) NOT NULL CHECK (cpf_mascarado ~ '^\*\*\*\.[0-9]{3}\.[0-9]{3}-\*\*\$'),
    categoria VARCHAR(40) NOT NULL,
    regiao VARCHAR(120) NOT NULL,
    status_kyc VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
    liveness_score NUMERIC(4, 3) NOT NULL,
    face_match_score NUMERIC(4, 3) NOT NULL,
    status_antecedentes VARCHAR(20) NOT NULL DEFAULT 'REVISAO_MANUAL',
    protocolo_certidao VARCHAR(40) NOT NULL,
    consentimento_lgpd BOOLEAN NOT NULL DEFAULT TRUE CHECK (consentimento_lgpd IS TRUE),
    hash_auditoria_lgpd VARCHAR(80) NOT NULL UNIQUE,
    imagens_descartadas_ram BOOLEAN NOT NULL DEFAULT TRUE CHECK (imagens_descartadas_ram IS TRUE),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
