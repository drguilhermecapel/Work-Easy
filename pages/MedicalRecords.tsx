import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_MEDICAL_RECORDS } from '../constants';
import { ChevronLeft, Search, FileText, Lock, Calendar, User, ShieldAlert } from 'lucide-react';
import { MedicalRecord } from '../types';
import { useAuth } from '../contexts/AuthContext';

const MedicalRecords: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<MedicalRecord | null>(null);

  // --- ACCESS CONTROL CHECK ---
  useEffect(() => {
    // Only Health Professionals allowed
    if (!user.isHealthProfessional) {
      // If user is client or normal provider, kick them out
      const timeout = setTimeout(() => {
        navigate('/dashboard');
      }, 3000);
      return () => clearTimeout(timeout);
    }
  }, [user, navigate]);

  // Render Access Denied View
  if (!user.isHealthProfessional) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md text-center border-t-4 border-red-500">
          <ShieldAlert size={64} className="mx-auto text-red-500 mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Acesso Negado</h1>
          <p className="text-gray-600 mb-4">
            Esta área contém dados sensíveis protegidos por sigilo médico e LGPD. 
            Apenas profissionais de saúde credenciados têm acesso.
          </p>
          <div className="text-sm text-gray-400">Redirecionando...</div>
        </div>
      </div>
    );
  }

  // --- AUTHORIZED VIEW ---
  const filteredRecords = MOCK_MEDICAL_RECORDS.filter(r => 
    r.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.serviceType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-800">
            <ChevronLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="text-teal-600" /> Prontuários Médicos
          </h1>
        </div>
        <div className="flex items-center gap-2">
           <span className="hidden md:inline text-xs text-gray-500">Dr. {user.name}</span>
           <div className="bg-red-50 border border-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded flex items-center gap-1">
              <Lock size={10} /> DADOS SENSÍVEIS
           </div>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 grid md:grid-cols-3 gap-6">
        
        {/* Sidebar List */}
        <div className="md:col-span-1 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar paciente (Nome/CPF)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-teal-500 outline-none"
            />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-3 bg-gray-50 border-b border-gray-100 text-xs font-bold text-gray-500 uppercase">
              Pacientes Recentes
            </div>
            {filteredRecords.length > 0 ? filteredRecords.map(record => (
              <div 
                key={record.id}
                onClick={() => setSelectedRecord(record)}
                className={`p-4 border-b border-gray-100 cursor-pointer transition-colors hover:bg-teal-50 ${selectedRecord?.id === record.id ? 'bg-teal-50 border-l-4 border-l-teal-500' : ''}`}
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className="font-bold text-gray-800">{record.patientName}</h3>
                  <span className="text-xs text-gray-500">{record.date}</span>
                </div>
                <p className="text-xs text-gray-500 truncate">{record.serviceType}</p>
                <div className="flex items-center gap-1 mt-2 text-[10px] text-gray-400">
                  <Lock size={10} /> LGPD Hash: {record.encryptedHash.substring(0, 8)}...
                </div>
              </div>
            )) : (
              <div className="p-8 text-center text-gray-400">
                Nenhum prontuário encontrado.
              </div>
            )}
          </div>
        </div>

        {/* Detail View */}
        <div className="md:col-span-2">
          {selectedRecord ? (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 md:p-8 animate-in fade-in">
              <div className="flex justify-between items-start border-b border-gray-100 pb-6 mb-6">
                <div>
                   <h2 className="text-2xl font-bold text-gray-900 mb-1">{selectedRecord.patientName}</h2>
                   <div className="flex items-center gap-4 text-sm text-gray-500">
                     <span className="flex items-center gap-1"><Calendar size={14}/> {selectedRecord.date}</span>
                     <span className="flex items-center gap-1"><User size={14}/> {selectedRecord.serviceType}</span>
                   </div>
                </div>
                <div className="bg-teal-100 text-teal-800 text-xs px-3 py-1 rounded-full font-bold">
                  Assinado Digitalmente
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Anamnese</h4>
                  <p className="text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100">
                    {selectedRecord.anamnese}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Evolução</h4>
                  <p className="text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-lg border border-gray-100">
                    {selectedRecord.evolution}
                  </p>
                </div>

                <div>
                  <h4 className="text-sm font-bold text-gray-500 uppercase mb-2">Prescrição / Conduta</h4>
                  <p className="text-gray-700 leading-relaxed bg-blue-50 p-4 rounded-lg border border-blue-100 text-blue-900">
                    {selectedRecord.prescription}
                  </p>
                </div>

                <div className="pt-6 border-t border-gray-100 text-xs text-gray-400 font-mono break-all">
                  <div className="flex items-center gap-2 mb-2 text-yellow-600">
                    <ShieldAlert size={12} />
                    <span>Acesso registrado em log de auditoria para conformidade legal.</span>
                  </div>
                  LGPD Hash Signature: {selectedRecord.encryptedHash}
                  <br/>Timestamp: {new Date().toISOString()}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 p-8 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <FileText size={32} className="opacity-50" />
              </div>
              <h3 className="font-bold text-lg text-gray-600">Selecione um prontuário</h3>
              <p>Escolha um paciente na lista ao lado para visualizar os detalhes do atendimento.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MedicalRecords;