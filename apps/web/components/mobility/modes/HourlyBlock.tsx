import { useState, type FormEvent } from 'react';
import { Clock } from 'lucide-react';
import ErrorAlert from '../../ErrorAlert';
import { formatCents } from '../../../lib/money';
import { useAsync } from '../../../lib/useAsync';
import { getRideDashboard } from '../../../services/rides';
import { rideBlocks, type BlockOption, type ModeQuote } from '../../../services/rideModes';
import { ModeQuoteCard } from './ModeQuoteCard';
import { SIMULATION, banner, card, failureAlert, field, hours, isFuture, primary, secondary, toInstant, useModeAction, whenSP } from './modeState';

interface Quoted {
  quote: ModeQuote;
  option: BlockOption;
  origin: string;
  destination: string;
  start: string;
}

/**
 * A car with driver for a block of time: area, start and block; the block shows the minutes and km
 * it includes, its price and what an extension costs. Time or distance beyond the block is charged
 * only after an extension both sides accepted.
 */
export default function HourlyBlock() {
  const base = useAsync(getRideDashboard, 'hourly-block');
  const [area, setArea] = useState('');
  const [destination, setDestination] = useState('');
  const [start, setStart] = useState('');
  const [block, setBlock] = useState('');
  const [validation, setValidation] = useState('');
  const [quoted, setQuoted] = useState<Quoted | null>(null);
  const instant = start ? toInstant(start) : null;
  const options = useAsync(
    async () => (area && instant ? rideBlocks.options(area, instant) : null),
    JSON.stringify([area, instant]),
  );
  const action = useModeAction();
  const dashboard = base.data;
  const heading = (
    <h2 id="bloco-por-hora" className="flex items-center gap-2 text-lg font-semibold">
      <Clock aria-hidden="true" />
      Carro com motorista por hora
    </h2>
  );
  if (!dashboard) {
    return (
      <section className={card} aria-labelledby="bloco-por-hora">
        {heading}
        {base.loading ? <p role="status">Consultando áreas atendidas…</p> : <ErrorAlert error={base.error} />}
        {!base.loading && (
          <button type="button" className={secondary} onClick={base.reload}>
            Tentar novamente
          </button>
        )}
      </section>
    );
  }
  const list = options.data ?? [];
  const selected = list.find((o) => o.code === block);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!isFuture(instant)) {
      setValidation('Escolha um início futuro, no horário de São Paulo.');
      return;
    }
    if (!selected) {
      setValidation('Escolha um bloco de horas.');
      return;
    }
    setValidation('');
    const option = selected;
    void action.run('quote:' + JSON.stringify([instant, area, destination, option.code]), async (key) => {
      const quote = await rideBlocks.quote(key, instant, area, destination, option.code);
      setQuoted({ quote, option, origin: area, destination, start: instant });
      return ''; // the quote card is the answer
    });
  }

  const areas = dashboard.areas.map((a) => (
    <option key={a} value={a}>
      {a}
    </option>
  ));
  return (
    <section className="space-y-4" aria-labelledby="bloco-por-hora">
      <header className="space-y-2">
        {heading}
        {dashboard.enabled && dashboard.simulation && (
          <p role="status" className={banner}>
            {SIMULATION}
          </p>
        )}
        <p>
          Você contrata um bloco de tempo com quilômetros incluídos. Tempo ou distância além do bloco só são cobrados
          depois de uma extensão aceita por você e pelo motorista.
        </p>
      </header>
      {(!dashboard.enabled || !dashboard.quote_enabled) && <p>Novas cotações estão indisponíveis neste ambiente.</p>}
      {dashboard.enabled && dashboard.quote_enabled && !quoted && (
        <form onSubmit={submit} className={card}>
          <fieldset disabled={action.busy} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                Área de embarque
                <select
                  className={field}
                  required
                  value={area}
                  onChange={(e) => {
                    setArea(e.target.value);
                    setBlock('');
                  }}
                >
                  <option value="">Selecione</option>
                  {areas}
                </select>
              </label>
              <label className="block">
                Área do desembarque final
                <select className={field} required value={destination} onChange={(e) => setDestination(e.target.value)}>
                  <option value="">Selecione</option>
                  {areas}
                </select>
              </label>
            </div>
            <label className="block">
              Início do bloco (São Paulo)
              <input
                className={field}
                type="datetime-local"
                required
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setBlock('');
                }}
              />
            </label>
            {(!area || !instant) && <p className="text-sm text-gray-700">Escolha a área e o início para ver os blocos.</p>}
            {area && instant && options.loading && <p role="status">Consultando blocos…</p>}
            {failureAlert(options.error)}
            {area && instant && !options.loading && !options.error && list.length === 0 && (
              <p>Nenhum bloco de horas está disponível nesta área e horário. Tente outra área ou outro início.</p>
            )}
            {list.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="font-medium">Bloco</legend>
                {list.map((o) => (
                  <label key={o.code} className="block rounded-lg border p-2">
                    <input
                      type="radio"
                      name="bloco-de-horas"
                      required
                      value={o.code}
                      checked={block === o.code}
                      onChange={() => setBlock(o.code)}
                    />{' '}
                    {hours(o.minutes)} · {o.included_km} km incluídos · {formatCents(o.block_cents)}
                    <span className="block text-sm text-gray-700">
                      Extensão, só com aceite: {formatCents(o.extra_15min_cents)} a cada 15 min ·{' '}
                      {formatCents(o.extra_km_cents)} por km adicional
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            {validation && (
              <p role="alert" className="text-red-700">
                {validation}
              </p>
            )}
            <button type="submit" className={primary} disabled={!selected}>
              {action.busy ? 'Cotando…' : 'Consultar preço do bloco'}
            </button>
          </fieldset>
        </form>
      )}
      {quoted && (
        <ModeQuoteCard
          quote={quoted.quote}
          title={`Bloco de ${hours(quoted.option.minutes)}`}
          canRequest={dashboard.dispatch_enabled}
          onAnother={() => setQuoted(null)}
        >
          <p>
            {quoted.origin} → {quoted.destination} · início {whenSP(quoted.start)}
          </p>
          <p>
            Bloco de {hours(quoted.option.minutes)} ({quoted.option.minutes} min) com {quoted.option.included_km} km
            incluídos: {formatCents(quoted.quote.legs[0]?.block_cents ?? quoted.option.block_cents)}
          </p>
          {!!quoted.quote.legs[0]?.empty_return_cents && (
            <p>Retorno do motorista sem passageiro: {formatCents(quoted.quote.legs[0].empty_return_cents)}</p>
          )}
          <p className="text-sm text-gray-700">
            Além do bloco: {formatCents(quoted.option.extra_15min_cents)} a cada 15 min e{' '}
            {formatCents(quoted.option.extra_km_cents)} por km, cobrados apenas depois de uma extensão aceita por você
            e pelo motorista.
          </p>
        </ModeQuoteCard>
      )}
      {action.message}
    </section>
  );
}
