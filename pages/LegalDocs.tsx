import React, { useState } from 'react';
import { FileText, Shield, Lock, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const LegalDocs: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'terms' | 'privacy' | 'background'>('terms');

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center">
          <button onClick={() => navigate(-1)} className="mr-4 text-gray-500 hover:text-primary">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-lg font-bold text-gray-800">Central Legal e Transparência</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col md:flex-row min-h-[600px]">
          
          {/* Sidebar Tabs */}
          <div className="w-full md:w-64 bg-gray-50 border-r border-gray-100 flex flex-row md:flex-col overflow-x-auto">
            <button 
              onClick={() => setActiveTab('terms')}
              className={`p-4 text-left flex items-center gap-3 border-b md:border-b-0 md:border-l-4 transition-colors whitespace-nowrap ${activeTab === 'terms' ? 'bg-white border-primary text-primary font-bold' : 'border-transparent text-gray-600 hover:bg-gray-100'}`}
            >
              <FileText size={18} /> Termos de Uso
            </button>
            <button 
              onClick={() => setActiveTab('privacy')}
              className={`p-4 text-left flex items-center gap-3 border-b md:border-b-0 md:border-l-4 transition-colors whitespace-nowrap ${activeTab === 'privacy' ? 'bg-white border-primary text-primary font-bold' : 'border-transparent text-gray-600 hover:bg-gray-100'}`}
            >
              <Lock size={18} /> Política de Privacidade
            </button>
            <button 
              onClick={() => setActiveTab('background')}
              className={`p-4 text-left flex items-center gap-3 border-b md:border-b-0 md:border-l-4 transition-colors whitespace-nowrap ${activeTab === 'background' ? 'bg-white border-primary text-primary font-bold' : 'border-transparent text-gray-600 hover:bg-gray-100'}`}
            >
              <Shield size={18} /> Background Check
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 p-8 overflow-y-auto max-h-[800px]">
            {activeTab === 'terms' && (
              <div className="prose prose-purple max-w-none text-gray-600 text-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Termos de Uso do WorkEasy</h2>
                <p>Última atualização: 28 de Outubro de 2023</p>
                
                <h3>1. Natureza da Plataforma</h3>
                <p>O WorkEasy é uma plataforma de intermediação digital que conecta Prestadores de Serviços independentes a Clientes. Não possuímos vínculo empregatício com os profissionais cadastrados.</p>
                
                <h3>2. Responsabilidades</h3>
                <p>O Prestador é o único responsável pela qualidade, prazo e execução do serviço. O Cliente é responsável pelo pagamento acordado e por fornecer condições para a realização do trabalho.</p>

                <h3>3. Pagamentos e Taxas</h3>
                <p>A plataforma retém uma taxa de serviço (10-12%) sobre o valor transacionado para cobrir custos operacionais, processamento de pagamentos e manutenção da infraestrutura tecnológica.</p>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="prose prose-purple max-w-none text-gray-600 text-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Política de Privacidade (LGPD)</h2>
                
                <h3>1. Coleta de Dados</h3>
                <p>Coletamos dados estritamente necessários para a prestação do serviço: Nome, CPF, Telefone, E-mail e Dados de Localização.</p>

                <h3>2. Uso das Informações</h3>
                <p>Seus dados são utilizados para: identificação na plataforma, processamento de pagamentos, segurança (prevenção a fraudes) e comunicação sobre pedidos.</p>

                <h3>3. Compartilhamento</h3>
                <p>Não vendemos seus dados. Compartilhamos informações mínimas necessárias entre Cliente e Prestador apenas após a confirmação de um serviço (Ex: Endereço do serviço).</p>
                
                <h3>4. Seus Direitos</h3>
                <p>Você pode solicitar a exclusão de seus dados ou exportação de seu histórico a qualquer momento através do painel de configurações.</p>
              </div>
            )}

            {activeTab === 'background' && (
              <div className="prose prose-purple max-w-none text-gray-600 text-sm">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">Política de Verificação de Antecedentes</h2>
                
                <div className="bg-yellow-50 border border-yellow-100 p-4 rounded-lg mb-6 flex items-start gap-3">
                  <Shield className="text-yellow-600 shrink-0 mt-1" size={20} />
                  <div>
                    <h4 className="font-bold text-yellow-800 m-0">Segurança em Primeiro Lugar</h4>
                    <p className="m-0 text-yellow-700 text-xs">Para garantir a segurança da comunidade, realizamos verificações em bases de dados públicas.</p>
                  </div>
                </div>

                <h3>1. O que verificamos?</h3>
                <p>Ao se cadastrar como Prestador, solicitamos consentimento para consultar:</p>
                <ul>
                  <li>Antecedentes Criminais (Esferas Federal e Estadual)</li>
                  <li>Processos Judiciais em aberto</li>
                  <li>Situação cadastral do CPF na Receita Federal</li>
                  <li>Validação de identidade facial</li>
                </ul>

                <h3>2. Consentimento</h3>
                <p>A verificação só é realizada mediante autorização expressa do usuário durante o cadastro.</p>

                <h3>3. Resultado da Análise</h3>
                <p>O WorkEasy reserva-se o direito de recusar cadastros que apresentem apontamentos graves incompatíveis com a prestação de serviços residenciais. A decisão é baseada em critérios de segurança e não discriminatórios.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegalDocs;