"use client";
import React, { useState } from "react";

export default function PrefeituraB2GDashboard() {
  const [providers, setProviders] = useState([
    { id: "WE-2026-0891", nome: "Maria Aparecida dos Santos", cpfMascarado: "***.452.898-**", categoria: "Faxina & Limpeza", statusKyc: "APROVADO", livenessScore: 0.98, faceMatchScore: 0.96, statusAntecedentes: "APTO", protocoloCertidao: "PF-2026-99812341" },
    { id: "WE-2026-0892", nome: "João Batista de Oliveira", cpfMascarado: "***.719.302-**", categoria: "Pintura & Reparos", statusKyc: "REVISAO_MANUAL", livenessScore: 0.94, faceMatchScore: 0.72, statusAntecedentes: "APTO", protocoloCertidao: "PF-2026-99812789" }
  ]);
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Work Easy B2G — Portal Municipal (0 MB Retenção de Imagens Brutas)</h1>
      <ul>
        {providers.map(p => (
          <li key={p.id}>{p.nome} ({p.cpfMascarado}) - {p.statusKyc} - Certidão: {p.statusAntecedentes}</li>
        ))}
      </ul>
    </div>
  );
}
