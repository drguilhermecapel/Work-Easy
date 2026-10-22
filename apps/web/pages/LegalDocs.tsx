import React from 'react';
import { FileText, Shield, Lock, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const DOCUMENTS = [
  {
    icon: FileText,
    title: 'Termos de Uso',
    body: 'Vão descrever o que a plataforma faz e não faz, as regras para clientes e profissionais, cancelamento, reembolso e atendimento ao consumidor.',
  },
  {
    icon: Lock,
    title: 'Política de Privacidade',
    body: 'Vai identificar a empresa responsável e o encarregado de dados, as finalidades e bases legais de cada tratamento, o prazo de guarda e como exercer seus direitos.',
  },
  {
    icon: Shield,
    title: 'Política de Verificação',
    body: 'Vai explicar, por categoria de serviço, quais documentos e registros profissionais são conferidos e por quê.',
  },
];

const LegalDocs: React.FC = () => {
  const navigate = useNavigate();

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
        <div role="note" className="bg-amber-50 border border-amber-100 text-amber-900 rounded-xl p-4 text-sm">
          <strong>Documentos em elaboração.</strong> Este protótipo não presta serviços nem trata dados reais.
          Os documentos abaixo serão publicados, revisados por advogado, antes de qualquer operação real.
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {DOCUMENTS.map(({ icon: Icon, title, body }) => (
            <section key={title} className="bg-white rounded-2xl shadow-xs border border-gray-100 p-6">
              <h2 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
                <Icon size={18} className="text-primary" /> {title}
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LegalDocs;
