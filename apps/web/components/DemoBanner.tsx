import React from 'react';
import { Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

/** Warns that the app is a prototype. Only the demo mode (no backend) shows it: with a backend nothing on screen is fictitious. */
const DemoBanner: React.FC = () => {
  if (useAuth().mode !== 'demo') return null;
  return (
    <div
      role="note"
      className="bg-amber-100 text-amber-900 text-xs sm:text-sm text-center px-4 py-2 flex items-center justify-center gap-2 print:hidden"
    >
      <Info size={14} className="shrink-0" aria-hidden="true" />
      <span>
        <strong>Protótipo de demonstração.</strong> Dados fictícios, sem atendimento,
        pagamento ou verificação reais.
      </span>
    </div>
  );
};

export default DemoBanner;
