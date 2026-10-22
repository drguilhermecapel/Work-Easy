import React, { ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck2 } from 'lucide-react';
import { useAsync } from '../lib/useAsync';
import { acceptCurrentTerms, fetchMissingRequiredConsents } from '../services/account';
import ErrorAlert from './ErrorAlert';

/**
 * Renders its children only after the signed-in user has accepted the current
 * Terms of Use and Privacy Policy; otherwise asks for the acceptance and records
 * it in `consents`. Covers whoever signed in without passing through /entrar
 * (e.g. the link in the login e-mail) or when recording the acceptance failed there.
 */
const TermsGate: React.FC<{ userId: string; children?: ReactNode; onAccepted?: () => void }> = ({ userId, children, onAccepted }) => {
  const missing = useAsync(() => fetchMissingRequiredConsents(userId), userId);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (missing.loading && !missing.data) {
    return <p role="status" className="text-sm text-gray-400">Conferindo seus consentimentos…</p>;
  }
  if (missing.data && missing.data.length === 0) return <>{children}</>;

  const accept = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await acceptCurrentTerms(userId);
      missing.reload();
      onAccepted?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={accept}
      className="space-y-3 bg-amber-50 border border-amber-100 rounded-2xl p-4"
      aria-labelledby={`termos-${userId}`}
    >
      <p id={`termos-${userId}`} className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        <FileCheck2 size={16} className="text-primary shrink-0" aria-hidden="true" />
        Para continuar, aceite a versão atual dos termos
      </p>
      {/* Without the answer we do not know: ask again instead of letting the user through */}
      <ErrorAlert error={missing.data ? null : missing.error} />
      <label className="flex items-start gap-2 text-sm text-gray-700">
        <input type="checkbox" className="mt-1" checked={checked} onChange={e => setChecked(e.target.checked)} />
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
      <button
        type="submit"
        disabled={!checked || busy}
        className="inline-flex items-center justify-center gap-2 bg-primary text-white text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {busy ? 'Registrando…' : 'Aceitar e continuar'}
      </button>
    </form>
  );
};

export default TermsGate;
