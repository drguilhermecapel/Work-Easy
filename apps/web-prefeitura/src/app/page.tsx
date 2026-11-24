"use client";
import React, { useState } from "react";

// PROTÓTIPO: os prestadores abaixo são FICTÍCIOS (dados fixos no código), não vêm de API nem de banco.
// Nenhuma biometria, certidão de antecedentes ou política de retenção de imagens é verificada aqui.
// O produto real é apps/web. Veja services/api/README.md.

export default function PrefeituraB2GDashboard() {
  const [providers, setProviders] = useState([
    { id: "WE-2026-0891", nome: "Maria Aparecida dos Santos", cpfMascarado: "***.452.898-**", categoria: "Faxina & Limpeza", statusKyc: "APROVADO", livenessScore: 0.98, faceMatchScore: 0.96, statusAntecedentes: "APTO", protocoloCertidao: "PF-2026-99812341" },
    { id: "WE-2026-0892", nome: "João Batista de Oliveira", cpfMascarado: "***.719.302-**", categoria: "Pintura & Reparos", statusKyc: "REVISAO_MANUAL", livenessScore: 0.94, faceMatchScore: 0.72, statusAntecedentes: "APTO", protocoloCertidao: "PF-2026-99812789" }
  ]);
  return (
    <div className="p-6">
      <p role="note" className="mb-2 font-bold text-red-700">PROTÓTIPO com dados fictícios. Não é um sistema em produção.</p>
      <h1 className="text-2xl font-bold">Work Easy B2G — Portal Municipal (protótipo)</h1>
      <ul>
        {providers.map(p => (
          <li key={p.id}>{p.nome} ({p.cpfMascarado}) - {p.statusKyc} - Certidão: {p.statusAntecedentes}</li>
        ))}
      </ul>
    </div>
  );
}
