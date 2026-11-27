import { useRef, useState, type FormEvent } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import { saoPauloDateTime } from '../../lib/timezone';
import { quoteRide, type RideLegInput, type RidePayer } from '../../services/rides';

const field = 'block w-full mt-1 rounded-xl border border-gray-300 bg-white p-2.5 text-gray-900';

interface Props {
  areas: string[];
  bookingId: string | null;
  onQuoted: (id: string) => void;
}

function toInstant(value: string): string | null {
  const [day, time] = value.split('T');
  return saoPauloDateTime(day, time)?.toISOString() ?? null;
}

export default function QuoteForm({ areas, bookingId, onQuoted }: Props) {
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [scheduled, setScheduled] = useState(Boolean(bookingId));
  const [departure, setDeparture] = useState('');
  const [anotherLeg, setAnotherLeg] = useState(false);
  const [nextPlace, setNextPlace] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [firstPayer, setFirstPayer] = useState<RidePayer>(bookingId ? 'client' : 'passenger');
  const [nextPayer, setNextPayer] = useState<RidePayer>(bookingId ? 'client' : 'passenger');
  const [validation, setValidation] = useState('');
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const request = useRef<{ payload: string; key: string } | null>(null);
  const sending = useRef(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current) return;
    setFailure(null);
    const first = scheduled ? toInstant(departure) : null;
    const next = anotherLeg ? toInstant(nextTime) : null;
    const now = Date.now();
    const last = now + 30 * 24 * 60 * 60 * 1000;
    if (!origin || !destination || origin === destination || (anotherLeg && (!nextPlace || destination === nextPlace))) {
      setValidation('Escolha pontos diferentes para o início e o fim de cada trecho.');
      return;
    }
    if ((scheduled && (!first || Date.parse(first) <= now || Date.parse(first) > last)) ||
        (anotherLeg && (!next || Date.parse(next) > last || Date.parse(next) <= (first ? Date.parse(first) : now)))) {
      setValidation('Escolha datas nos próximos 30 dias e marque o próximo trecho depois da ida, no horário de São Paulo.');
      return;
    }
    const legs: RideLegInput[] = [{ origin, destination, payer: firstPayer }];
    if (first) legs[0].pickup_at = first;
    if (anotherLeg && next) legs.push({ origin: destination, destination: nextPlace, pickup_at: next, payer: nextPayer });
    const payload = JSON.stringify([bookingId, first, legs]);
    if (request.current?.payload !== payload) request.current = { payload, key: crypto.randomUUID() };
    sending.current = true;
    setBusy(true);
    setValidation('');
    try {
      const quote = await quoteRide(request.current.key, bookingId, first, legs);
      request.current = null;
      onQuoted(quote.id);
    } catch (error) {
      setFailure(error);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const options = areas.map(area => <option key={area} value={area}>{area}</option>);
  const payers = <><option value="client">Cliente</option><option value="provider">Profissional</option></>;
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold">{bookingId ? 'Trajeto do profissional' : 'Cotar corrida'}</h2>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block">Saída
          <select className={field} value={scheduled ? 'scheduled' : 'now'} onChange={e => setScheduled(e.target.value === 'scheduled')}>
            <option value="now">Agora</option><option value="scheduled">Agendar</option>
          </select>
        </label>
        {scheduled && <label className="block">Data e hora da ida (São Paulo)
          <input required className={field} type="datetime-local" value={departure} onChange={e => setDeparture(e.target.value)} />
        </label>}
        <div className="grid gap-4 sm:grid-cols-2">
          <label>Ponto de origem<select className={field} required value={origin} onChange={e => setOrigin(e.target.value)}><option value="">Selecione</option>{options}</select></label>
          <label>Ponto de destino<select className={field} required value={destination} onChange={e => setDestination(e.target.value)}><option value="">Selecione</option>{options}</select></label>
        </div>
        {bookingId && <label className="block">Quem paga a ida?<select className={field} value={firstPayer} onChange={e => setFirstPayer(e.target.value as RidePayer)}>{payers}</select></label>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={anotherLeg} onChange={e => { setAnotherLeg(e.target.checked); if (e.target.checked) setNextPlace(origin); }} /> Incluir retorno ou continuação</label>
        {anotherLeg && <div className="space-y-4">
          <label className="block">Destino do próximo trecho<select className={field} required value={nextPlace} onChange={e => setNextPlace(e.target.value)}><option value="">Selecione</option>{options}</select></label>
          <label className="block">Data e hora do próximo trecho (São Paulo)<input className={field} required type="datetime-local" value={nextTime} onChange={e => setNextTime(e.target.value)} /></label>
          {bookingId && <label className="block">Quem paga o próximo trecho?<select className={field} value={nextPayer} onChange={e => setNextPayer(e.target.value as RidePayer)}>{payers}</select></label>}
        </div>}
        {validation && <p role="alert" className="text-red-700">{validation}</p>}
        <ErrorAlert error={failure} />
        <button type="submit" className="rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Cotando…' : 'Consultar preço'}</button>
      </fieldset>
    </form>
  );
}
