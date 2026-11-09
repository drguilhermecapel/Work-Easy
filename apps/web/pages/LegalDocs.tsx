import React from 'react';
import { FileText, Lock, MessageCircle, ChevronLeft, type LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { LEGAL_DOCS, legalInForce, type LegalDocId } from '../config/legal';
import { useAuth } from '../contexts/AuthContext';

const ICONS: Record<LegalDocId, LucideIcon> = {
  termos: FileText,
  privacidade: Lock,
  sac: MessageCircle,
};

/** Index of the legal texts (config/legal.ts); each one has its own page. */
const LegalDocs: React.FC = () => {
  const navigate = useNavigate();
  const demo = useAuth().mode === 'demo';

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white shadow-xs sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-4 text-gray-500 hover:text-primary" aria-label="Voltar">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-bold text-gray-800">Documentos legais</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {demo ? (
          <div role="note" className="bg-amber-50 border border-amber-100 text-amber-900 rounded-xl p-4 text-sm">
            <strong>Documentos em elaboração.</strong> Este protótipo não presta serviços nem trata dados reais.
            Os documentos abaixo serão publicados, revisados por advogado, antes de qualquer operação real.
          </div>
        ) : (
          !legalInForce() && (
            <div role="note" className="bg-amber-50 border border-amber-100 text-amber-900 rounded-xl p-4 text-sm">
              <strong>Documentos em elaboração.</strong> Os textos abaixo são rascunhos em revisão jurídica e podem mudar antes de
              passar a valer.
            </div>
          )
        )}

        <ul className="grid gap-4 md:grid-cols-3">
          {LEGAL_DOCS.map(doc => {
            const Icon = ICONS[doc.id];
            return (
              <li key={doc.id} className="bg-white rounded-2xl shadow-xs border border-gray-100 p-6">
                <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
                  <Icon size={18} className="text-primary shrink-0" aria-hidden="true" />
                  <Link to={doc.route} className="hover:text-primary hover:underline">
                    {doc.title}
                  </Link>
                </h2>
                <p className="text-sm text-gray-600 leading-relaxed">{doc.summary}</p>
                <p className="text-xs text-gray-400 mt-3">Versão {doc.version}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default LegalDocs;
