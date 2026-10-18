import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_REQUESTS } from '../constants';
import { RequestStatus, UserType } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { 
  MessageCircle, Clock, XCircle, Send, Phone, ShieldAlert, ChevronRight, 
  Video, FileText, Lock, Activity, Briefcase, Wallet, Calendar, Check, X
} from 'lucide-react';

// --- SUB-COMPONENT: CLIENT DASHBOARD ---
const ClientDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'requests' | 'chat'>('requests');
  const [selectedChat, setSelectedChat] = useState<string | null>(null);

  const getStatusColor = (status: RequestStatus) => {
    switch (status) {
      case RequestStatus.PENDING: return 'bg-yellow-100 text-yellow-800';
      case RequestStatus.ACCEPTED: return 'bg-blue-100 text-blue-800';
      case RequestStatus.CONFIRMED: return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="space-y-6">
       {/* Banner de Verificação para Clientes */}
       <div 
        onClick={() => navigate('/verification')}
        className="bg-white border border-blue-100 rounded-xl p-4 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow"
      >
        <div className="flex items-center gap-4">
          <div className="bg-blue-50 p-3 rounded-full text-blue-600">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h3 className="font-bold text-gray-800">Verifique sua Identidade</h3>
            <p className="text-sm text-gray-600">Aumente sua segurança ao contratar serviços.</p>
          </div>
        </div>
        <ChevronRight className="text-blue-400" />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button 
          onClick={() => setActiveTab('requests')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'requests' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}
        >
          Meus Pedidos
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === 'chat' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}
        >
          Chat <span className="ml-1 bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full text-xs">2</span>
        </button>
      </div>

      {activeTab === 'requests' && (
        <div className="space-y-4">
          {MOCK_REQUESTS.map(req => (
            <div key={req.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wide ${getStatusColor(req.status)}`}>
                    {req.status}
                  </span>
                  <span className="text-xs text-gray-400">#{req.id}</span>
                </div>
                <h3 className="font-bold text-gray-900">{req.serviceTitle}</h3>
                <p className="text-sm text-gray-500">Profissional: <span className="font-medium text-gray-700">{req.providerName}</span></p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><Clock size={12}/> {req.date}</span>
                  {req.price && <span className="font-bold text-gray-900">R$ {req.price}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                 <button 
                   onClick={() => { setActiveTab('chat'); setSelectedChat(req.id); }}
                   className="flex-1 md:flex-none px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-purple-700"
                 >
                   Falar no Chat
                 </button>
                 <button className="flex-1 md:flex-none px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50">
                   Detalhes
                 </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'chat' && <ChatComponent selectedChat={selectedChat} setSelectedChat={setSelectedChat} />}
    </div>
  );
};

// --- SUB-COMPONENT: PROVIDER DASHBOARD ---
const ProviderDashboard: React.FC<{ isHealth: boolean }> = ({ isHealth }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'incoming' | 'chat' | 'telemedicine' | 'financial'>('incoming');
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  
  // Local state to handle accept/reject interaction
  const [requests, setRequests] = useState(MOCK_REQUESTS);

  const handleAction = (id: string, action: 'accept' | 'reject') => {
    // Update local state to simulate action
    setRequests(prev => prev.filter(r => r.id !== id));
    
    if (action === 'accept') {
      alert("Solicitação aceita! O chat com o cliente foi aberto.");
      setActiveTab('chat');
    }
  };

  return (
    <div className="space-y-6">
      {/* Provider Header Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="text-gray-500 text-xs mb-1 uppercase font-bold">Ganhos (Mês)</div>
          <div className="text-2xl font-bold text-gray-900">R$ 3.450</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <div className="text-gray-500 text-xs mb-1 uppercase font-bold">Serviços</div>
          <div className="text-2xl font-bold text-primary">12</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
           <div className="text-gray-500 text-xs mb-1 uppercase font-bold">Avaliação</div>
           <div className="text-2xl font-bold text-yellow-500">4.9 ★</div>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
           <div className="text-gray-500 text-xs mb-1 uppercase font-bold">Visitas</div>
           <div className="text-2xl font-bold text-blue-500">142</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('incoming')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'incoming' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}
        >
          Solicitações
          {requests.length > 0 && <span className="ml-2 bg-yellow-100 text-yellow-800 px-1.5 rounded-full text-xs">{requests.length}</span>}
        </button>
        <button 
          onClick={() => setActiveTab('chat')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'chat' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}
        >
          Mensagens
        </button>
        {isHealth && (
          <button 
            onClick={() => setActiveTab('telemedicine')}
            className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 whitespace-nowrap ${activeTab === 'telemedicine' ? 'border-teal-500 text-teal-600' : 'border-transparent text-gray-500'}`}
          >
            <Activity size={16} /> Telemedicina
          </button>
        )}
        <button 
          onClick={() => setActiveTab('financial')}
          className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'financial' ? 'border-primary text-primary' : 'border-transparent text-gray-500'}`}
        >
          Financeiro
        </button>
      </div>

      {/* INCOMING REQUESTS */}
      {activeTab === 'incoming' && (
        <div className="space-y-4">
           {requests.length > 0 ? requests.map(req => (
            <div key={req.id} className="bg-white border-l-4 border-l-yellow-400 rounded-r-xl p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2">
              <div className="flex justify-between items-start mb-2">
                 <div>
                   <span className="text-xs font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded uppercase">Nova Solicitação</span>
                   <h3 className="font-bold text-gray-900 text-lg mt-1">{req.serviceTitle}</h3>
                 </div>
                 <div className="text-right">
                   <div className="text-sm text-gray-500">{req.date}</div>
                 </div>
              </div>
              <p className="text-sm text-gray-600 mb-4">Cliente solicitou orçamento. Responda rápido para fechar o serviço.</p>
              <div className="flex gap-3">
                 <button 
                   onClick={() => handleAction(req.id, 'accept')}
                   className="flex-1 bg-primary text-white py-2 rounded-lg font-bold text-sm hover:bg-purple-700 flex items-center justify-center gap-2"
                 >
                   <Check size={16} /> Aceitar / Negociar
                 </button>
                 <button 
                   onClick={() => handleAction(req.id, 'reject')}
                   className="px-4 py-2 border border-gray-200 text-gray-500 rounded-lg font-medium text-sm hover:bg-gray-50 flex items-center gap-2"
                 >
                   <X size={16} /> Recusar
                 </button>
              </div>
            </div>
           )) : (
             <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-200">
               <Briefcase size={40} className="mx-auto mb-3 opacity-20" />
               <p>Você não tem novas solicitações pendentes.</p>
             </div>
           )}
        </div>
      )}

      {/* TELEMEDICINE (HEALTH ONLY) */}
      {activeTab === 'telemedicine' && isHealth && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-6 text-teal-900">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-2">
              <Lock size={20} /> Área Restrita: Profissional de Saúde
            </h2>
            <p className="text-sm opacity-80 mb-6">
              Acesso exclusivo para gestão de pacientes e prontuários. Dados protegidos conforme resolução do CRM e LGPD.
            </p>

            <div className="grid md:grid-cols-2 gap-4">
               <button 
                 onClick={() => navigate('/medical-records')}
                 className="bg-white p-4 rounded-lg shadow-sm border border-teal-100 flex items-center gap-3 hover:bg-teal-50 transition-colors"
               >
                 <div className="bg-teal-100 p-3 rounded-full text-teal-600"><FileText size={24}/></div>
                 <div className="text-left">
                   <div className="font-bold text-gray-800">Prontuários Eletrônicos</div>
                   <div className="text-xs text-gray-500">Acessar histórico de pacientes</div>
                 </div>
               </button>
               
               <button 
                 onClick={() => navigate('/teleconsultation/mock-session-id')}
                 className="bg-teal-600 p-4 rounded-lg shadow-sm text-white flex items-center gap-3 hover:bg-teal-700 transition-colors"
               >
                 <div className="bg-white/20 p-3 rounded-full"><Video size={24}/></div>
                 <div className="text-left">
                   <div className="font-bold">Sala de Teleconsulta</div>
                   <div className="text-xs text-teal-100">Iniciar atendimento agora</div>
                 </div>
               </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-gray-100">
            <h3 className="font-bold text-gray-800 mb-4">Agenda do Dia</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-gray-500">14:00</span>
                  <div>
                    <div className="font-bold text-gray-800">Roberto Costa</div>
                    <div className="text-xs text-gray-500">Retorno - Cardiologia</div>
                  </div>
                </div>
                <button className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded font-bold">Confirmado</button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {activeTab === 'chat' && <ChatComponent selectedChat={selectedChat} setSelectedChat={setSelectedChat} />}
      
      {activeTab === 'financial' && (
        <div className="bg-white p-8 rounded-xl border border-gray-100 text-center">
          <Wallet size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-gray-800">Seu Extrato Financeiro</h3>
          <p className="text-gray-500 mb-4">Visualize seus ganhos, saques e taxas.</p>
          <button className="text-primary font-bold hover:underline">Ver detalhes completos</button>
        </div>
      )}
    </div>
  );
};

// --- SHARED CHAT COMPONENT ---
const ChatComponent: React.FC<{selectedChat: string | null, setSelectedChat: (id: string | null) => void}> = ({ selectedChat, setSelectedChat }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm h-[500px] flex overflow-hidden">
      {/* Chat List */}
      <div className={`w-full md:w-1/3 border-r border-gray-200 flex flex-col ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-bold text-gray-700">Conversas</h3>
        </div>
        <div className="overflow-y-auto flex-1">
          {MOCK_REQUESTS.map(req => (
              <div 
                key={req.id} 
                onClick={() => setSelectedChat(req.id)}
                className={`p-4 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${selectedChat === req.id ? 'bg-purple-50 border-l-4 border-l-primary' : ''}`}
              >
                <div className="flex justify-between mb-1">
                  <span className="font-semibold text-sm">{req.providerName}</span>
                  <span className="text-xs text-gray-400">10:30</span>
                </div>
                <p className="text-xs text-gray-500 truncate">{req.serviceTitle}</p>
              </div>
          ))}
        </div>
      </div>

      {/* Chat Window */}
      <div className={`w-full md:w-2/3 flex flex-col ${!selectedChat ? 'hidden md:flex' : 'flex'}`}>
          {selectedChat ? (
            <>
              <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedChat(null)} className="md:hidden text-gray-500"><XCircle size={20}/></button>
                  <div>
                    <h3 className="font-bold text-gray-800">Chat Seguro</h3>
                  </div>
                </div>
              </div>
              
              <div className="flex-1 bg-gray-50 p-4 overflow-y-auto space-y-4">
                 <div className="text-center text-xs text-gray-400 my-4">Atenção: Nunca compartilhe senhas ou dados bancários.</div>
                 {/* Mock Messages */}
                 <div className="flex justify-start">
                   <div className="bg-white border border-gray-200 py-2 px-3 rounded-2xl rounded-tl-none max-w-[80%] text-sm">
                     Olá, podemos agendar?
                   </div>
                 </div>
              </div>

              <div className="p-4 bg-white border-t border-gray-200">
                <div className="flex items-center gap-2">
                    <input type="text" placeholder="Digite sua mensagem..." className="flex-1 bg-gray-100 border-0 rounded-full px-4 py-2.5 text-sm outline-none" />
                    <button className="bg-primary text-white p-2.5 rounded-full"><Send size={18} /></button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
              <MessageCircle size={48} className="mb-4 opacity-20" />
              <p>Selecione uma conversa</p>
            </div>
          )}
      </div>
    </div>
  );
}


// --- MAIN PAGE COMPONENT ---
const Dashboard: React.FC = () => {
  const { user } = useAuth();

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {user.type === UserType.CLIENT ? `Olá, ${user.name}` : `Painel do Profissional`}
        </h1>
        {user.type === UserType.PROVIDER && (
           <span className={`text-xs px-2 py-1 rounded font-bold ${user.isHealthProfessional ? 'bg-teal-100 text-teal-800' : 'bg-purple-100 text-purple-800'}`}>
             {user.isHealthProfessional ? 'MÉDICO VERIFICADO' : 'PROFISSIONAL VERIFICADO'}
           </span>
        )}
      </div>

      {user.type === UserType.CLIENT ? (
        <ClientDashboard />
      ) : (
        <ProviderDashboard isHealth={user.isHealthProfessional} />
      )}
    </div>
  );
};

export default Dashboard;