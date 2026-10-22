import React from 'react';
import { Info } from 'lucide-react';

const DemoBanner: React.FC = () => (
  <div
    role="note"
    className="bg-amber-100 text-amber-900 text-xs sm:text-sm text-center px-4 py-2 flex items-center justify-center gap-2"
  >
    <Info size={14} className="shrink-0" aria-hidden="true" />
    <span>
      <strong>Protótipo de demonstração.</strong> Dados fictícios, sem atendimento,
      pagamento ou verificação reais.
    </span>
  </div>
);

export default DemoBanner;
