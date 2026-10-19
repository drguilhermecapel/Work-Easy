import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, ShieldCheck,
  User, CheckCircle, Info, FileText,
  MessageSquare, Paperclip, Send, X, Image as ImageIcon, File, Download
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { UserType } from '../types';

interface ChatMessage {
  id: string;
  sender: 'me' | 'remote';
  senderName: string;
  text?: string;
  file?: {
    name: string;
    type: 'image' | 'document';
    url: string;
  };
  timestamp: string;
}

const EMR_TAB_LABELS = {
  anamnese: 'Anamnese',
  evolution: 'Evolução',
  prescription: 'Conduta',
} as const;

const TeleconsultationRoom: React.FC = () => {
  const navigate = useNavigate();
  const { sessionId } = useParams();
  const { user } = useAuth();
  
  // Call State
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  
  // UI State
  // Doctors start on the record tab, everyone else on the chat
  const [sidebarView, setSidebarView] = useState<'emr' | 'chat'>(() => (user.isHealthProfessional ? 'emr' : 'chat'));
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // EMR State
  const [activeEmrTab, setActiveEmrTab] = useState<'anamnese' | 'evolution' | 'prescription'>('anamnese');
  const [record, setRecord] = useState({ anamnese: '', evolution: '', prescription: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', sender: 'remote', senderName: 'Sistema', text: 'Sala de demonstração: nenhuma chamada real é feita.', timestamp: '14:00' }
  ]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Object URLs created for local previews; revoked on unmount to free memory
  const objectUrlsRef = useRef<string[]>([]);

  useEffect(() => () => {
    objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    objectUrlsRef.current = [];
  }, []);

  const isDoctor = user.isHealthProfessional;
  // Only doctors can see the record tab, even if the role changes mid-session
  const activeView = isDoctor ? sidebarView : 'chat';
  const remoteParticipantName = isDoctor ? "Paciente Fictício (demonstração)" : "Dr. Roberto Costa (fictício)";

  // --- DEMO-ONLY ROLE GATE (real access control must be enforced server-side) ---
  useEffect(() => {
    if (user.type === UserType.PROVIDER && !user.isHealthProfessional) {
      alert("Área restrita a profissionais de saúde.");
      navigate('/dashboard');
      return;
    }
    if (!sessionId) navigate('/dashboard');

    // Start Timer
    const timer = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [user, navigate, sessionId]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (activeView === 'chat') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeView]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // --- EMR HANDLERS (demo: nothing is persisted or signed) ---
  const handleSaveDraft = () => {
    if (!record.anamnese && !record.evolution && !record.prescription) {
      alert("Preencha ao menos um campo do registro.");
      return;
    }
    setIsSaving(true);
    setTimeout(() => {
      setDraftSaved(true);
      setIsSaving(false);
    }, 600);
  };

  // --- CHAT HANDLERS ---
  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newMessage.trim()) return;

    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'me',
      senderName: 'Você',
      text: newMessage,
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, msg]);
    setNewMessage('');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Simulate upload and URL generation
    const objectUrl = URL.createObjectURL(file);
    objectUrlsRef.current.push(objectUrl);
    const isImage = file.type.startsWith('image/');

    const msg: ChatMessage = {
      id: Date.now().toString(),
      sender: 'me',
      senderName: 'Você',
      file: {
        name: file.name,
        type: isImage ? 'image' : 'document',
        url: objectUrl
      },
      timestamp: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };

    setMessages(prev => [...prev, msg]);
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleEndCall = () => {
    const confirmMsg = isDoctor 
      ? "Deseja encerrar o atendimento? Certifique-se de ter salvo o prontuário." 
      : "Deseja sair da consulta?";
    
    if (window.confirm(confirmMsg)) {
      navigate('/dashboard');
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 overflow-hidden">

      <div role="note" className="bg-amber-100 text-amber-900 text-xs px-4 py-2 text-center">
        <strong>Funcionalidade futura.</strong> Teleconsulta exige empresa registrada no CRM, responsável técnico e
        prontuário certificado (NGS2/ICP-Brasil). Esta sala é só uma demonstração visual.
      </div>

      {/* --- HEADER --- */}
      <div className="h-14 bg-gray-800 flex items-center justify-between px-4 shadow-md z-10 border-b border-gray-700">
        <div className="flex items-center gap-3 text-white">
          <div className="flex items-center gap-2 bg-red-500/10 px-3 py-1 rounded-full border border-red-500/20">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
            <span className="font-bold text-xs text-red-400 uppercase tracking-wider">Demonstração</span>
          </div>
          <span className="font-medium text-sm text-gray-200 border-l border-gray-600 pl-3">
            {remoteParticipantName}
          </span>
          <span className="text-xs bg-gray-700 px-2 py-0.5 rounded-sm text-gray-400 font-mono hidden sm:inline-block">
            {formatDuration(callDuration)}
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-gray-300 text-xs font-medium bg-gray-700/60 px-3 py-1.5 rounded-lg border border-gray-600">
            <Info size={12} />
            <span className="hidden sm:inline">Sem chamada real</span>
          </div>
        </div>
      </div>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        
        {/* VIDEO AREA */}
        <div className={`flex-1 relative bg-black flex items-center justify-center p-2 md:p-4 transition-all duration-300 ${isSidebarOpen ? 'md:mr-0' : ''}`}>
          
          {/* Main Video Stream */}
          <div className="w-full h-full bg-gray-800 rounded-2xl overflow-hidden relative flex items-center justify-center shadow-2xl border border-gray-700">
            <div className="flex flex-col items-center">
              <div className="w-24 h-24 bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <User size={48} className="text-gray-500" />
              </div>
              <p className="text-gray-400 text-sm font-medium animate-pulse">
                {remoteParticipantName} {isVideoOff ? '(Câmera desligada)' : ''}
              </p>
            </div>
          </div>

          {/* Self View (PIP) */}
          <div className="absolute top-8 right-8 w-32 h-48 sm:w-40 sm:h-60 bg-gray-900 rounded-xl border-2 border-gray-700 shadow-2xl overflow-hidden flex items-center justify-center z-10">
             {isVideoOff ? (
               <VideoOff className="text-gray-500" />
             ) : (
               <>
                 <div className="bg-gray-800 w-full h-full relative">
                    <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">Você</div>
                 </div>
                 <div className="absolute bottom-2 left-2 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900"></div>
               </>
             )}
          </div>

          {/* Call Controls Bar */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-4 bg-gray-900/90 backdrop-blur-md px-4 sm:px-6 py-3 rounded-2xl shadow-2xl border border-white/10 z-20">
            <button onClick={() => setIsMuted(!isMuted)} className={`p-3 sm:p-4 rounded-xl transition-all ${isMuted ? 'bg-red-500/20 text-red-500 border border-red-500/50' : 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-700'}`} aria-label={isMuted ? "Desmutar" : "Mutar"}>
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button onClick={() => setIsVideoOff(!isVideoOff)} className={`p-3 sm:p-4 rounded-xl transition-all ${isVideoOff ? 'bg-red-500/20 text-red-500 border border-red-500/50' : 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-700'}`} aria-label={isVideoOff ? "Ligar câmera" : "Desligar câmera"}>
              {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
            </button>
            
            <div className="w-px h-8 bg-gray-700 mx-1"></div>
            
            <button 
              onClick={toggleSidebar} 
              className={`p-3 sm:p-4 rounded-xl transition-all relative ${isSidebarOpen ? 'bg-teal-600 text-white shadow-lg shadow-teal-900/20' : 'bg-gray-800 text-white hover:bg-gray-700 border border-gray-700'}`}
              aria-label="Chat"
            >
              <MessageSquare size={20} />
              {/* Notification dot example */}
              {!isSidebarOpen && <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-gray-900"></span>}
            </button>

            <button onClick={handleEndCall} className="p-3 sm:p-4 rounded-xl bg-red-600 text-white hover:bg-red-700 transition-all shadow-lg shadow-red-900/20" aria-label="Encerrar chamada">
              <PhoneOff size={20} />
            </button>
          </div>
        </div>

        {/* --- RIGHT SIDEBAR (EMR + CHAT) --- */}
        <div className={`
          absolute inset-y-0 right-0 w-full md:w-[450px] bg-white shadow-2xl z-30 transition-transform duration-300 transform flex flex-col
          md:relative
          ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full md:hidden'}
        `}>
          
          {/* Sidebar Header / Tabs */}
          <div className="h-14 bg-gray-50 border-b border-gray-200 flex items-center justify-between px-2">
            
            {isDoctor ? (
              <div className="flex bg-gray-200/50 p-1 rounded-lg">
                <button 
                  onClick={() => setSidebarView('emr')}
                  className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${sidebarView === 'emr' ? 'bg-white text-teal-700 shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <ShieldCheck size={16} /> Prontuário
                </button>
                <button 
                  onClick={() => setSidebarView('chat')}
                  className={`px-4 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-2 ${sidebarView === 'chat' ? 'bg-white text-teal-700 shadow-xs' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  <MessageSquare size={16} /> Chat
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-2 text-gray-700 font-bold">
                <MessageSquare size={20} className="text-teal-600" /> Chat da Consulta
              </div>
            )}

            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-full">
              <X size={20} />
            </button>
          </div>

          {/* --- CONTENT: EMR (DOCTOR ONLY) --- */}
          {activeView === 'emr' && (
            <div className="flex-1 flex flex-col overflow-hidden animate-in fade-in">
              <div className="p-3 bg-teal-50 border-b border-teal-100 flex justify-between items-center">
                <span className="text-xs font-bold text-teal-800 uppercase tracking-wide">Registro (rascunho)</span>
                {!draftSaved ? (
                   <button
                     onClick={handleSaveDraft}
                     disabled={isSaving}
                     className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 hover:bg-teal-700 transition-colors"
                   >
                     {isSaving ? <span className="animate-pulse">Salvando...</span> : <><FileText size={14} /> Salvar rascunho</>}
                   </button>
                ) : (
                   <span className="text-xs font-bold text-gray-600 flex items-center gap-1"><CheckCircle size={14}/> Rascunho — não assinado</span>
                )}
              </div>

              {/* EMR Tabs */}
              <div className="flex text-xs font-medium text-center border-b border-gray-200 bg-white">
                <button onClick={() => setActiveEmrTab('anamnese')} className={`flex-1 p-3 border-b-2 ${activeEmrTab === 'anamnese' ? 'border-teal-500 text-teal-700 bg-teal-50/30' : 'border-transparent text-gray-500'}`}>Anamnese</button>
                <button onClick={() => setActiveEmrTab('evolution')} className={`flex-1 p-3 border-b-2 ${activeEmrTab === 'evolution' ? 'border-teal-500 text-teal-700 bg-teal-50/30' : 'border-transparent text-gray-500'}`}>Evolução</button>
                <button onClick={() => setActiveEmrTab('prescription')} className={`flex-1 p-3 border-b-2 ${activeEmrTab === 'prescription' ? 'border-teal-500 text-teal-700 bg-teal-50/30' : 'border-transparent text-gray-500'}`}>Conduta</button>
              </div>

              <div className="flex-1 p-4 overflow-y-auto bg-gray-50/30 relative">
                 {draftSaved && (
                    <div className="absolute inset-0 z-10 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
                       <div className="bg-white p-4 rounded-xl shadow-lg border border-gray-200 text-center max-w-[250px]">
                         <FileText size={32} className="mx-auto text-gray-400 mb-2"/>
                         <p className="text-sm font-bold text-gray-800">Rascunho — não assinado</p>
                         <p className="text-xs text-gray-500 mt-1">Demonstração: nada é armazenado.</p>
                       </div>
                    </div>
                 )}
                 <textarea
                    className="w-full h-full p-4 border border-gray-200 rounded-xl resize-none focus:ring-2 focus:ring-teal-500 outline-hidden text-sm leading-relaxed"
                    placeholder={`Digite aqui: ${EMR_TAB_LABELS[activeEmrTab].toLowerCase()}...`}
                    value={record[activeEmrTab]}
                    onChange={(e) => setRecord({...record, [activeEmrTab]: e.target.value})}
                    disabled={draftSaved}
                 ></textarea>
              </div>
            </div>
          )}

          {/* --- CONTENT: CHAT (EVERYONE) --- */}
          {activeView === 'chat' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 animate-in fade-in">
              
              {/* Message List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => {
                  const isMe = msg.sender === 'me';
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-2xl p-3 shadow-xs ${isMe ? 'bg-teal-600 text-white rounded-br-none' : 'bg-white text-gray-800 border border-gray-200 rounded-bl-none'}`}>
                        <div className={`text-[10px] font-bold mb-1 ${isMe ? 'text-teal-200' : 'text-teal-600'}`}>{msg.senderName}</div>
                        
                        {/* Text Content */}
                        {msg.text && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>}
                        
                        {/* File Content */}
                        {msg.file && (
                          <div className={`mt-2 p-2 rounded-lg ${isMe ? 'bg-teal-700/50' : 'bg-gray-100'} flex items-start gap-3`}>
                             {msg.file.type === 'image' ? (
                               <div className="space-y-1">
                                 <img src={msg.file.url} alt="attachment" className="w-full max-w-[150px] rounded-md border border-white/10" />
                                 <div className="flex items-center gap-1 text-[10px] opacity-70"><ImageIcon size={10}/> Imagem</div>
                               </div>
                             ) : (
                               <div className="flex items-center gap-3">
                                 <div className="bg-white p-2 rounded-full text-red-500 shadow-xs"><File size={20}/></div>
                                 <div className="flex-1 min-w-0">
                                   <p className="text-xs font-bold truncate">{msg.file.name}</p>
                                   <p className="text-[10px] opacity-70 uppercase">Documento</p>
                                 </div>
                                 <button className="text-white hover:text-gray-200"><Download size={16} /></button>
                               </div>
                             )}
                          </div>
                        )}

                        <div className={`text-[9px] text-right mt-1 ${isMe ? 'text-teal-100' : 'text-gray-400'}`}>{msg.timestamp}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-3 bg-white border-t border-gray-200">
                <form onSubmit={handleSendMessage} className="flex items-end gap-2 bg-gray-100 p-2 rounded-xl border border-gray-200 focus-within:ring-2 focus-within:ring-teal-500/20 focus-within:border-teal-500 transition-all">
                  
                  {/* Hidden File Input */}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={handleFileUpload}
                  />

                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-gray-500 hover:text-teal-600 hover:bg-gray-200 rounded-lg transition-colors"
                    title="Anexar arquivo"
                  >
                    <Paperclip size={20} />
                  </button>
                  
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 bg-transparent border-none outline-hidden text-sm text-gray-800 placeholder-gray-400 resize-none max-h-24 py-2"
                    rows={1}
                    onKeyDown={(e) => {
                      if(e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />
                  
                  <button 
                    type="submit" 
                    disabled={!newMessage.trim()}
                    className="p-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
                  >
                    <Send size={18} />
                  </button>
                </form>
                <p className="text-[10px] text-center text-gray-400 mt-2">
                  Demonstração: mensagens e arquivos não são enviados nem armazenados.
                </p>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default TeleconsultationRoom;