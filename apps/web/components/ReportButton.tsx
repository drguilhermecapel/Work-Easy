import React, { useId, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Flag } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import ErrorAlert from './ErrorAlert';
import { REPORT_DETAILS_MAX, REPORT_REASONS, REPORT_REASON_LABELS, reportContent, type ReportReason, type ReportTarget } from '../services/safety';

interface Props {
  target: ReportTarget;
  /** Text of the control, e.g. "Denunciar este perfil". */
  label: string;
  className?: string;
}

/**
 * Reports a profile, a review or a request to the administration. The form opens in place;
 * a visitor is sent to sign in first, because a report belongs to an account.
 */
const ReportButton: React.FC<Props> = ({ target, label, className = '' }) => {
  const auth = useAuth();
  const location = useLocation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (auth.mode !== 'backend') return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      await reportContent(target, reason, details);
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p role="status" className={`text-xs text-green-700 ${className}`}>
        Denúncia recebida. A nossa equipe vai analisar.
      </p>
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={`${id}-form`}
        onClick={() => setOpen(value => !value)}
        className="inline-flex items-center gap-1 min-h-11 sm:min-h-0 text-xs text-gray-500 underline hover:text-gray-700"
      >
        <Flag size={12} aria-hidden="true" /> {label}
      </button>
      {open && (
        <div id={`${id}-form`} className="mt-2 bg-gray-50 border border-gray-100 rounded-xl p-3">
          {!auth.isAuthenticated ? (
            <Link to={`/entrar?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`} className="text-sm text-primary underline">
              Entre na sua conta para denunciar
            </Link>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label htmlFor={`${id}-motivo`} className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo
                </label>
                <select
                  id={`${id}-motivo`}
                  required
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white"
                  value={reason}
                  onChange={e => setReason(e.target.value as ReportReason | '')}
                >
                  <option value="">Escolha o motivo</option>
                  {REPORT_REASONS.map(value => (
                    <option key={value} value={value}>
                      {REPORT_REASON_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-detalhes`} className="block text-sm font-medium text-gray-700 mb-1">
                  O que aconteceu? <span className="font-normal text-gray-500">(opcional)</span>
                </label>
                <textarea
                  id={`${id}-detalhes`}
                  rows={3}
                  maxLength={REPORT_DETAILS_MAX}
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white"
                  value={details}
                  onChange={e => setDetails(e.target.value)}
                />
              </div>
              <ErrorAlert error={error} />
              <button
                type="submit"
                disabled={!reason || busy}
                className="inline-flex items-center min-h-11 bg-white border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl px-4 py-2.5 hover:bg-gray-50 disabled:opacity-50"
              >
                {busy ? 'Enviando…' : 'Enviar denúncia'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default ReportButton;
