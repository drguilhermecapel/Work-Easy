import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, ChevronRight, User, Briefcase, ShieldCheck, Upload, AlertCircle, Loader2 } from 'lucide-react';
import { CATEGORIES } from '../constants';

const ProviderRegistration: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isChecking, setIsChecking] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    phone: '',
    category: '',
    experience: '',
    agreedToBackgroundCheck: false,
    agreedToTerms: false
  });

  const handleNext = () => {
    if (!isStepValid()) return;

    if (step === 3 && !isChecking) {
      // Simulate Background Check Process
      setIsChecking(true);
      setTimeout(() => {
        setIsChecking(false);
        setStep(step + 1);
      }, 3000);
    } else {
      setStep(step + 1);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value;
    setFormData({ ...formData, [e.target.name]: value });
  };

  const isStepValid = () => {
    if (step === 1) return formData.name && formData.cpf.length >= 11 && formData.phone;
    if (step === 2) return formData.category && formData.experience;
    if (step === 3) return formData.agreedToBackgroundCheck && formData.agreedToTerms;
    return true;
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Simple Header */}
      <div className="bg-white p-4 shadow-sm text-center">
        <h1 className="text-xl font-bold text-primary">Cadastro de Profissional</h1>
      </div>

      <div className="flex-1 max-w-lg mx-auto w-full p-6">
        
        {/* Progress Steps */}
        <div className="flex justify-between mb-8 relative">
          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-200 -z-10"></div>
          {[1, 2, 3, 4].map((s) => (
            <div 
              key={s}
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors border-4 border-gray-50 ${
                step >= s ? 'bg-primary text-white' : 'bg-gray-200 text-gray-500'
              }`}
            >
              {step > s ? <CheckCircle size={16} /> : s}
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 md:p-8">
          
          {/* STEP 1: Personal Info */}
          {step === 1 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <User size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Dados Pessoais</h2>
                <p className="text-sm text-gray-500">Vamos começar pelo básico.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <input 
                  type="text" 
                  name="name" 
                  value={formData.name} 
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-primary" 
                  placeholder="Ex: Maria Silva" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CPF (apenas números)</label>
                <input 
                  type="text" 
                  name="cpf" 
                  value={formData.cpf} 
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-primary" 
                  placeholder="000.000.000-00" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Celular com WhatsApp</label>
                <input 
                  type="text" 
                  name="phone" 
                  value={formData.phone} 
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-primary" 
                  placeholder="(11) 99999-9999" 
                />
              </div>
            </div>
          )}

          {/* STEP 2: Professional Info */}
          {step === 2 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Briefcase size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Seu Trabalho</h2>
                <p className="text-sm text-gray-500">O que você faz de melhor?</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Categoria Principal</label>
                <select 
                  name="category" 
                  value={formData.category} 
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-primary bg-white"
                >
                  <option value="">Selecione...</option>
                  {CATEGORIES.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tempo de Experiência</label>
                <select 
                  name="experience" 
                  value={formData.experience} 
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 rounded-xl outline-none focus:border-primary bg-white"
                >
                  <option value="">Selecione...</option>
                  <option value="1">Menos de 1 ano</option>
                  <option value="1-3">1 a 3 anos</option>
                  <option value="3-5">3 a 5 anos</option>
                  <option value="5+">Mais de 5 anos</option>
                </select>
              </div>
              
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-500 hover:bg-gray-50 cursor-pointer transition-colors">
                <Upload className="mx-auto mb-2" />
                <span className="text-sm">Toque para adicionar uma foto de perfil profissional</span>
              </div>
            </div>
          )}

          {/* STEP 3: Background Check */}
          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-yellow-50 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ShieldCheck size={32} />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Verificação de Segurança</h2>
                <p className="text-sm text-gray-500">Segurança para você e para os clientes.</p>
              </div>

              <div className="bg-yellow-50 p-4 rounded-xl text-sm text-yellow-800 border border-yellow-100">
                <h4 className="font-bold mb-2 flex items-center gap-2">
                  <AlertCircle size={16} />
                  O que vamos verificar?
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-yellow-700">
                  <li>Validação do seu CPF na Receita Federal.</li>
                  <li>Consulta de antecedentes criminais em bases públicas.</li>
                  <li>Verificação de identidade biométrica.</li>
                </ul>
                <p className="mt-3 text-xs italic opacity-80">
                  Seus dados estão protegidos e são usados exclusivamente para validação de segurança, conforme nossa Política de Privacidade.
                </p>
              </div>

              <div className="space-y-3">
                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input 
                    type="checkbox" 
                    name="agreedToTerms"
                    checked={formData.agreedToTerms}
                    onChange={handleChange as any}
                    className="mt-1 w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary" 
                  />
                  <span className="text-sm text-gray-700">
                    Li e aceito os <span className="text-primary font-medium hover:underline" onClick={(e) => {e.preventDefault(); navigate('/legal');}}>Termos de Uso</span> e <span className="text-primary font-medium hover:underline" onClick={(e) => {e.preventDefault(); navigate('/legal');}}>Política de Privacidade</span>.
                  </span>
                </label>

                <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input 
                    type="checkbox" 
                    name="agreedToBackgroundCheck"
                    checked={formData.agreedToBackgroundCheck}
                    onChange={handleChange as any}
                    className="mt-1 w-5 h-5 text-primary border-gray-300 rounded focus:ring-primary" 
                  />
                  <span className="text-sm text-gray-700">
                    <strong>Autorizo</strong> o WorkEasy a realizar a consulta de meus antecedentes criminais e validação de dados para fins de cadastro na plataforma.
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* STEP 4: Success */}
          {step === 4 && (
            <div className="text-center animate-in zoom-in duration-300 py-6">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-500 animate-bounce">
                <CheckCircle size={48} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Cadastro em Análise!</h2>
              <p className="text-gray-600 mb-8">
                Recebemos seus dados e a verificação de segurança está em andamento. Você receberá uma notificação no WhatsApp assim que seu perfil for aprovado (geralmente em até 2 horas).
              </p>
              
              <button 
                onClick={() => navigate('/')}
                className="w-full bg-white border-2 border-primary text-primary font-bold py-3.5 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Voltar para Início
              </button>
            </div>
          )}

          {/* Navigation Buttons */}
          {step < 4 && (
             <button 
               onClick={handleNext}
               disabled={!isStepValid() || isChecking}
               className={`w-full mt-6 flex items-center justify-center gap-2 font-bold py-4 rounded-xl shadow-lg transition-all ${
                 !isStepValid() || isChecking ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-primary text-white hover:bg-purple-700 shadow-purple-200'
               }`}
             >
               {isChecking ? (
                 <>
                   <Loader2 className="animate-spin" /> Verificando Dados...
                 </>
               ) : (
                 <>
                   {step === 3 ? 'Finalizar Cadastro' : 'Continuar'} <ChevronRight size={20} />
                 </>
               )}
             </button>
          )}

        </div>
      </div>
    </div>
  );
};

export default ProviderRegistration;