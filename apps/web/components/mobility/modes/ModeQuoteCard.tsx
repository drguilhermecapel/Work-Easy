import { useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import ErrorAlert from '../../ErrorAlert';
import { formatCents } from '../../../lib/money';
import { consentToRide } from '../../../services/rides';
import type { ModeQuote } from '../../../services/rideModes';
import { card, primary, secondary, whenSP } from './modeState';

/**
 * A quote of an hourly block or of an intercity trip, with its price lines and the passenger's
 * decision. The consent is the same one of every ride quote; the quote also shows under Corridas.
 */
export function ModeQuoteCard({
  quote,
  title,
  canRequest,
  children,
  onAnother,
}: {
  quote: ModeQuote;
  title: string;
  /** Dispatch is open: without it the quote can be read and declined, not accepted. */
  canRequest: boolean;
  children: ReactNode;
  onAnother: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<'' | 'requested' | 'waiting' | 'declined'>('');
  const sending = useRef(false);
  async function decide(accept: boolean) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await consentToRide(quote.id, accept);
      setOutcome(!accept ? 'declined' : result.ride_id ? 'requested' : 'waiting');
    } catch (err) {
      setError(err);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return (
    <article className={card}>
      <h3 className="font-semibold">
        {title} · {formatCents(quote.total_cents)}
      </h3>
      <div className="space-y-1">{children}</div>
      <p className="font-medium">Total: {formatCents(quote.total_cents)}</p>
      <p className="text-sm text-gray-700">Proposta válida até {whenSP(quote.expires_at)}. Nada é solicitado antes do seu aceite.</p>
      {outcome === '' && (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={primary} disabled={busy || !canRequest} onClick={() => void decide(true)}>
            Aceitar e solicitar
          </button>
          <button type="button" className={secondary} disabled={busy} onClick={() => void decide(false)}>
            Recusar proposta
          </button>
        </div>
      )}
      {outcome === '' && !canRequest && <p className="text-sm">Reservas e chamadas de motoristas estão desativadas agora.</p>}
      {outcome !== '' && (
        <p role="status">
          {outcome === 'requested' && 'Solicitação registrada. O pedido aguarda um motorista. '}
          {outcome === 'waiting' && 'Seu aceite foi registrado. Aguardando os demais participantes. '}
          {outcome === 'declined' && 'Proposta recusada. Nada foi solicitado. '}
          {outcome !== 'declined' && (
            <Link className="text-primary underline" to="/corridas">
              Acompanhar em Corridas
            </Link>
          )}
        </p>
      )}
      <ErrorAlert error={error} />
      <button type="button" className="text-sm underline" disabled={busy} onClick={onAnother}>
        Fazer outra cotação
      </button>
    </article>
  );
}
