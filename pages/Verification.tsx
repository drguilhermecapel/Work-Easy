import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Camera, CheckCircle, ChevronLeft, ScanFace, Info } from 'lucide-react';

// Demo-only flow: no image is captured, sent or stored, and nothing is verified.
// A real identity check needs a contracted provider, a documented legal basis
// (LGPD art. 11) and server-side processing.
const Verification: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'intro' | 'face' | 'done'>('intro');
  const [isScanning, setIsScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // A ref (not state) so the cleanup always sees the live stream and the
  // camera is released when the user leaves this step or the page.
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    if (step !== 'face') return;
    let cancelled = false;

    const startCamera = async () => {
      setCameraError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Este dispositivo não oferece acesso à câmera pelo navegador.');
        return;
      }
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        if (cancelled) {
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }
        streamRef.current = mediaStream;
        if (videoRef.current) videoRef.current.srcObject = mediaStream;
      } catch {
        setCameraError('Não foi possível abrir a câmera. Você pode continuar a demonstração sem ela.');
      }
    };

    startCamera();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [step, stopCamera]);

  const handleFaceStep = () => {
    setIsScanning(true);
    setTimeout(() => {
      setIsScanning(false);
      stopCamera();
      setStep('done');
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white p-4 shadow-sm flex items-center">
        <button onClick={() => navigate(-1)} className="text-gray-500 mr-4" aria-label="Voltar">
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-lg font-bold text-gray-800">Verificação de identidade (simulação)</h1>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center max-w-md mx-auto w-full">

        {step === 'intro' && (
          <div className="text-center animate-in fade-in slide-in-from-bottom-4">
            <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6 text-primary">
              <Shield size={48} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Como será a verificação</h2>
            <p className="text-gray-600 mb-6 leading-relaxed">
              Esta tela é uma simulação do fluxo. Nenhuma imagem é capturada, enviada ou armazenada,
              e nenhuma verificação real é feita.
            </p>

            <div className="space-y-4 mb-8 text-left bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="bg-blue-100 p-2 rounded-lg text-blue-600"><ScanFace size={24}/></div>
                <div>
                  <h3 className="font-bold text-gray-800">Documento e selfie</h3>
                  <p className="text-xs text-gray-500">Na versão final, feitos por fornecedor contratado, com aviso de privacidade próprio.</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('face')}
              className="w-full bg-primary text-white font-bold py-3.5 rounded-xl shadow-lg shadow-purple-200 hover:bg-purple-700 transition-all"
            >
              Ver a simulação
            </button>
          </div>
        )}

        {step === 'face' && (
          <div className="w-full flex flex-col items-center animate-in fade-in">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Selfie (simulação)</h2>
            <p className="text-gray-500 text-sm mb-6">A imagem aparece só na sua tela e não sai do aparelho.</p>

            <div className="relative w-64 h-80 bg-black rounded-[3rem] overflow-hidden shadow-2xl border-4 border-gray-200 mb-4">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover transform scale-x-[-1]"
              />
              <div className="absolute inset-0 border-[3px] border-white/50 rounded-[2.5rem] m-4 pointer-events-none"></div>
              {isScanning && (
                <div className="absolute inset-0 bg-primary/20 z-10 flex items-center justify-center">
                  <span className="text-white font-bold bg-black/20 px-3 py-1 rounded-full backdrop-blur-md">Simulando...</span>
                </div>
              )}
            </div>

            {cameraError && (
              <p role="status" className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg p-3 mb-4">
                <Info size={16} className="shrink-0 mt-0.5" /> {cameraError}
              </p>
            )}

            <button
              onClick={handleFaceStep}
              disabled={isScanning}
              className={`w-full flex items-center justify-center gap-2 font-bold py-3.5 rounded-xl transition-all ${isScanning ? 'bg-gray-200 text-gray-400' : 'bg-primary text-white hover:bg-purple-700 shadow-lg'}`}
            >
              <Camera size={20} />
              {isScanning ? 'Simulando...' : 'Concluir simulação'}
            </button>
          </div>
        )}

        {step === 'done' && (
          <div className="text-center animate-in zoom-in duration-300">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6 text-gray-500">
              <CheckCircle size={48} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Simulação concluída</h2>
            <p className="text-gray-600 mb-8">
              Nenhuma verificação real foi feita e o perfil não recebeu selo.
            </p>

            <button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-primary text-white font-bold py-3.5 rounded-xl shadow-lg shadow-purple-200 hover:bg-purple-700 transition-all"
            >
              Voltar ao painel
            </button>
          </div>
        )}

      </div>
    </div>
  );
};

export default Verification;
