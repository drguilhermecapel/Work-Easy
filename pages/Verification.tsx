import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Camera, Fingerprint, CheckCircle, ChevronLeft, ScanFace, Lock } from 'lucide-react';

const Verification: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'intro' | 'face' | 'fingerprint' | 'success'>('intro');
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Initialize Camera for Face Step
  useEffect(() => {
    if (step === 'face') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [step]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      alert("Precisamos de acesso à câmera para verificar sua identidade.");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const handleFaceScan = () => {
    setIsScanning(true);
    // Simulate scanning process
    setTimeout(() => {
      setIsScanning(false);
      setStep('fingerprint');
    }, 3000);
  };

  const handleFingerprintScan = () => {
    setIsScanning(true);
    // Simulate biometric auth
    setTimeout(() => {
      setIsScanning(false);
      setStep('success');
    }, 2000);
  };

  const handleFinish = () => {
    // In a real app, this would update the user context
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm flex items-center">
        <button onClick={() => navigate(-1)} className="text-gray-500 mr-4">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold text-gray-800">Verificação de Segurança</h1>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center max-w-md mx-auto w-full">
        
        {/* STEP 1: INTRO */}
        {step === 'intro' && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4">
            <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
              <Shield size={48} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Vamos proteger sua conta</h2>
            <p className="text-gray-600 mb-8 leading-relaxed">
              Para garantir a segurança de todos no WorkEasy, precisamos verificar sua identidade. Isso ajuda a evitar fraudes e aumenta a confiança dos clientes.
            </p>
            
            <div className="space-y-4 mb-8 text-left bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><ScanFace size={24}/></div>
                <div>
                  <h4 className="font-bold text-gray-800">Reconhecimento Facial</h4>
                  <p className="text-xs text-gray-500">Validaremos se é você mesmo.</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="bg-green-100 p-2 rounded-lg text-green-600"><Fingerprint size={24}/></div>
                <div>
                  <h4 className="font-bold text-gray-800">Biometria Digital</h4>
                  <p className="text-xs text-gray-500">Vincule sua digital ao dispositivo.</p>
                </div>
              </div>
            </div>

            <button 
              onClick={() => setStep('face')}
              className="w-full bg-primary text-white font-bold py-3.5 rounded-xl shadow-lg shadow-purple-200 hover:bg-purple-700 transition-all"
            >
              Começar Verificação
            </button>
          </div>
        )}

        {/* STEP 2: FACE SCAN */}
        {step === 'face' && (
          <div className="w-full flex flex-col items-center animate-in fade-in">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Reconhecimento Facial</h2>
            <p className="text-gray-500 text-sm mb-6">Posicione seu rosto dentro da moldura</p>
            
            <div className="relative w-64 h-80 bg-black rounded-[3rem] overflow-hidden shadow-2xl border-4 border-gray-200 mb-8">
              <video 
                ref={videoRef} 
                autoPlay 
                muted 
                playsInline 
                className="w-full h-full object-cover transform scale-x-[-1]" // Mirror effect
              />
              
              {/* Overlay Frame */}
              <div className="absolute inset-0 border-[3px] border-white/50 rounded-[2.5rem] m-4 pointer-events-none"></div>
              
              {/* Scanning Effect */}
              {isScanning && (
                <div className="absolute inset-0 bg-primary/20 z-10 flex items-center justify-center">
                   <div className="w-full h-1 bg-white/80 absolute top-0 animate-[scan_2s_ease-in-out_infinite]"></div>
                   <span className="text-white font-bold bg-black/20 px-3 py-1 rounded-full backdrop-blur-md">Verificando...</span>
                </div>
              )}
            </div>

            <button 
              onClick={handleFaceScan}
              disabled={isScanning}
              className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl transition-all ${isScanning ? 'bg-gray-200 text-gray-400' : 'bg-primary text-white hover:bg-purple-700 shadow-lg'}`}
            >
              <Camera size={20} />
              {isScanning ? 'Processando...' : 'Capturar Rosto'}
            </button>
          </div>
        )}

        {/* STEP 3: FINGERPRINT */}
        {step === 'fingerprint' && (
          <div className="w-full text-center animate-in fade-in">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Confirmação Biométrica</h2>
            <p className="text-gray-500 text-sm mb-10">Toque no sensor para confirmar sua identidade</p>
            
            <div 
              onClick={handleFingerprintScan}
              className={`relative w-28 h-28 mx-auto mb-12 rounded-full border-2 flex items-center justify-center cursor-pointer transition-all duration-500 ${isScanning ? 'border-primary bg-primary/10 scale-110' : 'border-gray-200 hover:border-primary/50'}`}
            >
              <Fingerprint 
                size={64} 
                className={`transition-colors duration-500 ${isScanning ? 'text-primary animate-pulse' : 'text-gray-400'}`} 
              />
              {isScanning && (
                 <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
              )}
            </div>

            <button 
              onClick={handleFingerprintScan}
              disabled={isScanning}
              className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-xl hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
            >
              <Lock size={18} />
              {isScanning ? 'Autenticando...' : 'Usar Biometria do Celular'}
            </button>
            <p className="text-xs text-gray-400 mt-4">Simulação segura via WorkEasy ID</p>
          </div>
        )}

        {/* STEP 4: SUCCESS */}
        {step === 'success' && (
          <div className="text-center animate-in zoom-in duration-300">
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 text-green-500">
              <CheckCircle size={48} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Identidade Verificada!</h2>
            <p className="text-gray-600 mb-8">
              Seu perfil agora possui o selo de segurança. Você tem 3x mais chances de ser contratado.
            </p>
            
            <button 
              onClick={handleFinish}
              className="w-full bg-primary text-white font-bold py-3.5 rounded-xl shadow-lg shadow-purple-200 hover:bg-purple-700 transition-all"
            >
              Voltar ao Dashboard
            </button>
          </div>
        )}

      </div>
      
      {/* Styles for scan animation */}
      <style>{`
        @keyframes scan {
          0% { top: 0; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default Verification;