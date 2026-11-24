import React, { useState } from 'react';
import { Ban } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ErrorAlert from './ErrorAlert';

interface Props {
  /** Does the block (services/safety). */
  onBlock: () => Promise<void>;
  label: string;
  /** What changes for the user, said before confirming. */
  consequence: string;
  /** Called after the block is recorded (e.g. to reload a list). */
  onBlocked?: () => void;
  className?: string;
}

/** Blocks an account after one confirmation. Only signed-in users see it; it can be undone in Minha conta. */
const BlockButton: React.FC<Props> = ({ onBlock, label, consequence, onBlocked, className = '' }) => {
  const auth = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (auth.mode !== 'backend' || !auth.isAuthenticated) return null;

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      await onBlock();
      setDone(true);
      onBlocked?.();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p role="status" className={`text-xs text-green-700 ${className}`}>
        Bloqueio feito. Para desfazer, abra Minha conta.
      </p>
    );
  }

  return (
    <div className={className}>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-xs text-gray-500 underline hover:text-gray-700"
        >
          <Ban size={12} aria-hidden="true" /> {label}
        </button>
      ) : (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
          <p className="text-sm text-gray-700">{consequence}</p>
          <ErrorAlert error={error} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={run}
              disabled={busy}
              className="inline-flex items-center min-h-11 bg-red-600 text-white text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-red-700 disabled:opacity-50"
            >
              {busy ? 'Bloqueando…' : 'Confirmar bloqueio'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="inline-flex items-center min-h-11 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default BlockButton;
