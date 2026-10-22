import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { KeyRound, Mail, Smartphone } from 'lucide-react';
import { useAuth, type OtpTarget } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { safeNext } from '../../lib/navigation';
import { formatPhoneBR, toE164BR } from '../../lib/phone';
import { acceptCurrentTerms } from '../../services/account';
import { normalizeTarget } from '../../services/auth';
import BackendNotice from '../../components/BackendNotice';
import ErrorAlert from '../../components/ErrorAlert';

type Channel = OtpTarget['kind'];

const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-base focus:outline-hidden focus:ring-2 focus:ring-primary/40 focus:border-primary';
const primaryButton =
  'w-full bg-primary text-white font-semibold rounded-xl px-4 py-3 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed';

const describeTarget = (target: OtpTarget) => (target.kind === 'email' ? target.email : formatPhoneBR(target.phone));

const Entrar: React.FC = () => {
  const auth = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [channel, setChannel] = useState<Channel>('email');
  const [contact, setContact] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [target, setTarget] = useState<OtpTarget | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [resent, setResent] = useState(false);
  /** Signed in, but recording the acceptance of the terms failed: retry before going on. */
  const [consentUserId, setConsentUserId] = useState<string | null>(null);

  if (!backendEnabled || auth.mode !== 'backend') {
    return (
      <BackendNotice title="Login ainda não disponível">
        <p>Esta versão é uma demonstração: não há contas reais e nada do que você digita é armazenado.</p>
        <p>Para ver as telas de cliente, prestador e médico, use o seletor de papel no menu.</p>
      </BackendNotice>
    );
  }

  if (auth.isAuthenticated && !busy && !consentUserId) return <Navigate to={next} replace />;

  const currentTarget = (): OtpTarget =>
    channel === 'email' ? { kind: 'email', email: contact } : { kind: 'phone', phone: contact };

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const normalized = normalizeTarget(currentTarget());
      await auth.signInWithOtp(normalized);
      setTarget(normalized);
      setCode('');
      setResent(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (!target) return;
    setError(null);
    setBusy(true);
    try {
      await auth.signInWithOtp(target);
      setResent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!target) return;
    setError(null);
    setBusy(true);
    let userId: string | null;
    try {
      userId = await auth.verifyOtp(target, code);
    } catch (err) {
      setError(err);
      setBusy(false);
      return;
    }
    // Without a user id the acceptance is asked again by the screens that need it (TermsGate)
    if (userId) await recordTerms(userId);
    else navigate(next, { replace: true });
  };

  /** The box was checked before sending the code; the acceptance is recorded once the session exists. */
  const recordTerms = async (userId: string) => {
    setError(null);
    setBusy(true);
    try {
      await acceptCurrentTerms(userId);
      setConsentUserId(null);
      navigate(next, { replace: true });
    } catch (err) {
      setConsentUserId(userId);
      setError(err);
      setBusy(false);
    }
  };

  const signOutInstead = async () => {
    setError(null);
    try {
      await auth.signOut();
      setConsentUserId(null);
      setTarget(null);
      setCode('');
    } catch (err) {
      setError(err);
    }
  };

  const phoneHint = channel === 'phone' && contact.length > 0 && !toE164BR(contact);

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-xs">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <KeyRound size={22} className="text-primary" aria-hidden="true" /> Entrar
        </h1>

        {consentUserId ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-gray-700">
              Você entrou, mas não conseguimos registrar o aceite dos Termos de Uso e da Política de Privacidade. Sem esse
              registro, não é possível continuar.
            </p>
            <ErrorAlert error={error} />
            <button type="button" className={primaryButton} disabled={busy} onClick={() => recordTerms(consentUserId)}>
              {busy ? 'Registrando…' : 'Tentar registrar de novo'}
            </button>
            <button type="button" className="w-full text-sm text-gray-500 hover:underline" onClick={signOutInstead} disabled={busy}>
              Sair da conta
            </button>
          </div>
        ) : !target ? (
          <form onSubmit={send} className="mt-4 space-y-4" noValidate>
            <p className="text-sm text-gray-600">
              Receba um código de 6 dígitos para entrar ou criar sua conta. Não há senha.
            </p>

            <div role="group" aria-label="Receber o código por" className="grid grid-cols-2 gap-2 bg-gray-100 rounded-xl p-1">
              {(
                [
                  ['email', 'E-mail', Mail],
                  ['phone', 'Celular', Smartphone],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={channel === value}
                  onClick={() => {
                    setChannel(value);
                    setContact('');
                    setError(null);
                  }}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium ${
                    channel === value ? 'bg-white shadow-sm text-primary' : 'text-gray-500'
                  }`}
                >
                  <Icon size={16} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>

            <div>
              <label htmlFor="entrar-contato" className="block text-sm font-medium text-gray-700 mb-1">
                {channel === 'email' ? 'Seu e-mail' : 'Seu celular com DDD'}
              </label>
              <input
                id="entrar-contato"
                className={inputClass}
                type={channel === 'email' ? 'email' : 'tel'}
                inputMode={channel === 'email' ? 'email' : 'tel'}
                autoComplete={channel === 'email' ? 'email' : 'tel'}
                placeholder={channel === 'email' ? 'voce@exemplo.com' : '(11) 98765-4321'}
                value={contact}
                onChange={e => setContact(e.target.value)}
                required
                aria-describedby={channel === 'phone' ? 'entrar-sms-nota' : undefined}
              />
              {channel === 'phone' && (
                <p id="entrar-sms-nota" className="text-xs text-gray-500 mt-1">
                  {phoneHint ? 'Informe DDD e número, por exemplo (11) 98765-4321. ' : ''}
                  O envio por SMS depende do provedor de SMS configurado na plataforma. Se o código não chegar, entre
                  pelo e-mail.
                </p>
              )}
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="mt-1"
                checked={acceptedTerms}
                onChange={e => setAcceptedTerms(e.target.checked)}
              />
              <span>
                Li e aceito os{' '}
                <Link to="/legal" className="text-primary underline">
                  Termos de Uso
                </Link>{' '}
                e a{' '}
                <Link to="/legal" className="text-primary underline">
                  Política de Privacidade
                </Link>
                .
              </span>
            </label>

            <ErrorAlert error={error} />

            <button type="submit" className={primaryButton} disabled={busy || !acceptedTerms || contact.trim() === ''}>
              {busy ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-4 space-y-4" noValidate>
            <p className="text-sm text-gray-600" aria-live="polite">
              Enviamos um código de 6 dígitos para <strong className="text-gray-800 break-all">{describeTarget(target)}</strong>.
              {target.kind === 'email' && ' Confira também a caixa de spam.'}
            </p>
            <div>
              <label htmlFor="entrar-codigo" className="block text-sm font-medium text-gray-700 mb-1">
                Código
              </label>
              <input
                id="entrar-codigo"
                className={`${inputClass} tracking-[0.4em] text-center font-mono text-lg`}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
              />
            </div>

            <ErrorAlert error={error} />
            {resent && !error && (
              <p role="status" className="text-sm text-green-700">
                Enviamos um novo código.
              </p>
            )}

            <button type="submit" className={primaryButton} disabled={busy || code.length !== 6}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <button type="button" className="text-primary hover:underline disabled:opacity-50" onClick={resend} disabled={busy}>
                Reenviar código
              </button>
              <button
                type="button"
                className="text-gray-500 hover:underline"
                onClick={() => {
                  setTarget(null);
                  setCode('');
                  setError(null);
                }}
              >
                {target.kind === 'email' ? 'Usar outro e-mail' : 'Usar outro celular'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default Entrar;
