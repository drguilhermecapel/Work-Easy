import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Route as RouteIcon } from 'lucide-react';
import ErrorAlert from '../../ErrorAlert';
import { formatCents } from '../../../lib/money';
import { useAsync } from '../../../lib/useAsync';
import { getRideDashboard } from '../../../services/rides';
import { rideIntercity, type Corridor, type ModeQuote } from '../../../services/rideModes';
import { ModeQuoteCard } from './ModeQuoteCard';
import { SIMULATION, banner, card, field, isFuture, primary, secondary, toInstant, useModeAction, whenSP } from './modeState';

interface Quoted {
  quote: ModeQuote;
  origin: string;
  destination: string;
  start: string;
  corridor?: Corridor;
}

/**
 * A trip between municipalities. Only an authorized corridor can be quoted; the price shows the
 * driver's empty return apart from the trip with the passenger.
 */
export default function Intercity() {
  const base = useAsync(async () => {
    // The corridor list narrows the choice. Without it the areas are offered and the server decides.
    const [dashboard, corridors] = await Promise.all([getRideDashboard(), rideIntercity.corridors().catch(() => null)]);
    return { dashboard, corridors };
  }, 'intercity');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [start, setStart] = useState('');
  const [validation, setValidation] = useState('');
  const [quoted, setQuoted] = useState<Quoted | null>(null);
  const action = useModeAction();
  const heading = (
    <h2 id="entre-municipios" className="flex items-center gap-2 text-lg font-semibold">
      <RouteIcon aria-hidden="true" />
      Viagem entre municípios
    </h2>
  );
  if (!base.data) {
    return (
      <section className={card} aria-labelledby="entre-municipios">
        {heading}
        {base.loading ? <p role="status">Consultando corredores…</p> : <ErrorAlert error={base.error} />}
        {!base.loading && (
          <button type="button" className={secondary} onClick={base.reload}>
            Tentar novamente
          </button>
        )}
      </section>
    );
  }
  const { dashboard, corridors } = base.data;
  const origins = corridors ? [...new Set(corridors.map((c) => c.origin))] : dashboard.areas;
  const destinations = corridors
    ? corridors.filter((c) => c.origin === origin).map((c) => c.destination)
    : dashboard.areas.filter((a) => a !== origin);
  const corridor = corridors?.find((c) => c.origin === origin && c.destination === destination);
  const quoting = dashboard.enabled && dashboard.quote_enabled;

  function submit(event: FormEvent) {
    event.preventDefault();
    const instant = toInstant(start);
    if (!isFuture(instant)) {
      setValidation('Escolha uma saída futura, no horário de São Paulo.');
      return;
    }
    setValidation('');
    void action.run('quote:' + JSON.stringify([instant, origin, destination]), async (key) => {
      const quote = await rideIntercity.quote(key, instant, [
        { origin, destination, payer: 'passenger', pickup_at: instant },
      ]);
      setQuoted({ quote, origin, destination, start: instant, corridor });
      return ''; // the quote card is the answer
    });
  }

  const leg = quoted?.quote.legs[0];
  const emptyReturn = leg?.empty_return_cents ?? quoted?.corridor?.empty_return_cents ?? null;
  const fare = leg?.fare_cents ?? quoted?.quote.total_cents ?? 0;
  return (
    <section className="space-y-4" aria-labelledby="entre-municipios">
      <header className="space-y-2">
        {heading}
        {dashboard.enabled && dashboard.simulation && (
          <p role="status" className={banner}>
            {SIMULATION}
          </p>
        )}
        <p>
          Só cotamos corredores autorizados. O preço mostra em separado o retorno do motorista sem passageiro, que faz
          parte da viagem.
        </p>
      </header>
      {!quoting && <p>Novas cotações estão indisponíveis neste ambiente.</p>}
      {quoting && corridors?.length === 0 && (
        <p role="status" className={card}>
          Nenhum corredor entre municípios está autorizado agora, então esta modalidade não pode ser cotada. Para
          trajetos dentro da cidade, use{' '}
          <Link className="text-primary underline" to="/corridas">
            Corridas
          </Link>
          .
        </p>
      )}
      {quoting && corridors?.length !== 0 && !quoted && (
        <form onSubmit={submit} className={card}>
          <fieldset disabled={action.busy} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                Área de origem
                <select
                  className={field}
                  required
                  value={origin}
                  onChange={(e) => {
                    setOrigin(e.target.value);
                    setDestination('');
                  }}
                >
                  <option value="">Selecione</option>
                  {origins.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Área de destino
                <select
                  className={field}
                  required
                  disabled={!origin}
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                >
                  <option value="">{origin ? 'Selecione' : 'Escolha a origem primeiro'}</option>
                  {destinations.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {corridor && (
              <p className="text-sm text-gray-700">
                Competência: {corridor.origin_jurisdiction} na origem e {corridor.destination_jurisdiction} no destino.
                O motorista volta sem passageiro por cerca de {corridor.return_minutes} min; esse retorno custa{' '}
                {formatCents(corridor.empty_return_cents)} e aparece separado na cotação.
              </p>
            )}
            <label className="block">
              Data e hora da saída (São Paulo)
              <input
                className={field}
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            {validation && (
              <p role="alert" className="text-red-700">
                {validation}
              </p>
            )}
            <button type="submit" className={primary}>
              {action.busy ? 'Cotando…' : 'Consultar preço da viagem'}
            </button>
          </fieldset>
        </form>
      )}
      {quoted && (
        <ModeQuoteCard
          quote={quoted.quote}
          title="Viagem entre municípios"
          canRequest={dashboard.dispatch_enabled}
          onAnother={() => setQuoted(null)}
        >
          <p>
            {quoted.origin} → {quoted.destination} · saída {whenSP(quoted.start)}
          </p>
          {emptyReturn != null ? (
            <>
              <p>Viagem com passageiro: {formatCents(fare - emptyReturn)}</p>
              <p>Retorno do motorista sem passageiro: {formatCents(emptyReturn)}</p>
            </>
          ) : (
            <p>O preço inclui o retorno do motorista sem passageiro.</p>
          )}
          {quoted.corridor && (
            <p className="text-sm text-gray-700">
              Competência: {quoted.corridor.origin_jurisdiction} na origem e {quoted.corridor.destination_jurisdiction}{' '}
              no destino.
            </p>
          )}
        </ModeQuoteCard>
      )}
      {action.message}
    </section>
  );
}
