import React from 'react';
import { ShieldAlert } from 'lucide-react';

/** The rule of the care line, said in plain words next to every field that takes free text. */
const HealthDataNotice: React.FC<{ className?: string; children?: React.ReactNode }> = ({ className = '', children }) => (
  <p role="note" className={`flex items-start gap-2 text-sm text-gray-700 bg-amber-50 border border-amber-100 rounded-xl p-3 ${className}`}>
    <ShieldAlert size={16} className="text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
    <span>
      <strong>O WorkEasy não guarda dados de saúde.</strong>{' '}
      {children ?? 'Não escreva doenças, diagnósticos, remédios, doses, exames ou sintomas. Combine esses cuidados direto com o cuidador, fora do app.'}
    </span>
  </p>
);

export default HealthDataNotice;
