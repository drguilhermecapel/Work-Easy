import React, { useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { CONSENT_VERSIONS } from '../config/legal';
import { useAuth } from '../contexts/AuthContext';
import { useAsync } from '../lib/useAsync';
import { latestConsents, listConsents, recordConsent } from '../services/account';
import ErrorAlert from './ErrorAlert';

/** What the person agrees to, whichever assistant asks. The assistant adds its own details next to it. */
export const AI_CONSENT_TEXT =
  'Esta ajuda envia o que você escrever a um serviço de inteligência artificial de terceiros, que devolve uma sugestão. O uso é opcional: tudo o que ela faz você também pode fazer à mão. Você pode retirar este consentimento quando quiser em Minha conta.';

/**
 * Shows an AI assistant only after the account agreed, in the current version of the text, to
 * send content to the third-party AI service. The agreement is one row of the consent history
 * (purpose ai_assist). A failed read never counts as agreement: it offers to try again.
 */
const AiConsent: React.FC<{ children: ReactNode }> = ({ children }) => {
  const auth = useAuth();
  const userId = auth.mode === 'backend' ? (auth.authUser?.id ?? null) : null;
  const consents = useAsync(async () => (userId ? latestConsents(await listConsents(userId)) : null), userId ?? 'anonymous');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [agreed, setAgreed] = useState(false);

  if (!userId) return null;
  const current = consents.data?.ai_assist;
  const granted = agreed || (current?.granted === true && current.version === CONSENT_VERSIONS.ai_assist);
  if (granted) return <>{children}</>;
  if (consents.loading && !consents.data && !consents.error) {
    return <p role="status" className="text-sm text-gray-500">Carregando…</p>;
  }

  const agree = async () => {
    setBusy(true);
    setError(null);
    try {
      await recordConsent(userId, 'ai_assist', true);
      setAgreed(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-3">
      <p className="text-sm text-gray-700 flex items-start gap-2">
        <Sparkles size={16} className="text-primary shrink-0 mt-0.5" aria-hidden="true" />
        <span>{AI_CONSENT_TEXT}</span>
      </p>
      <ErrorAlert error={consents.error ?? error} />
      {consents.error ? (
        <button type="button" onClick={consents.reload} className="text-sm font-semibold text-primary underline">
          Tentar de novo
        </button>
      ) : (
        <button
          type="button"
          onClick={agree}
          disabled={busy}
          className="inline-flex items-center min-h-11 bg-primary text-white text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-purple-700 disabled:opacity-50"
        >
          {busy ? 'Registrando…' : 'Concordo e quero usar'}
        </button>
      )}
    </div>
  );
};

export default AiConsent;
