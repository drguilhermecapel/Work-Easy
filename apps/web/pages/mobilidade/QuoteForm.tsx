import { useRef, useState, type FormEvent } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import { formatCents } from '../../lib/money';
import { saoPauloDateTime } from '../../lib/timezone';
import { quoteRideWithAccess } from '../../services/rideSafety';
import { quoteRide, type RideLegInput, type RidePayer } from '../../services/rides';

const field = 'block w-full mt-1 rounded-xl border border-gray-300 bg-white p-2.5 text-gray-900';

interface RouteOption { id: string; origin_area: string; destination_area: string; service_endpoint?: string | null; }
interface ExtraOption { code: string; label: string; cents: number; }
function ExtraChoices({ options, selected, onChange, label }: {
  options: ExtraOption[]; selected: string[]; onChange: (v: string[]) => void; label: string;
}) {
  if (!options.length) return null;
  return <fieldset><legend>{label}</legend>{options.map(extra => <label key={extra.code} className="mr-4 inline-flex items-center gap-2">
    <input type="checkbox" checked={selected.includes(extra.code)} onChange={e => onChange(e.target.checked ? [...selected, extra.code] : selected.filter(code => code !== extra.code))} />
    {extra.label} · {formatCents(extra.cents)}
  </label>)}</fieldset>;
}
function RouteChoice({ routes, value, onChange, label, required }: {
  routes: RouteOption[]; value: string; onChange: (v: string) => void; label: string; required: boolean;
}) {
  if (!routes.length) return required ? <p>Cadastre os pontos e aguarde a medição da operação para cotar este trecho.</p> : null;
  return <label className="block">{label}<select className={field} value={value} required={required} onChange={e => onChange(e.target.value)}>
    <option value="">{required ? 'Selecione uma medição da operação' : 'Usar pontos de encontro do catálogo'}</option>
    {routes.map(r => <option key={r.id} value={r.id}>{r.origin_area} → {r.destination_area} · {r.id.slice(-8)}</option>)}
  </select></label>;
}
interface Props {
  passengerCanRequestAccess?: boolean;
  areas: string[];
  bookingId: string | null;
  replaces?: string;
  requiresRoute?: boolean;
  routes?: RouteOption[];
  nextBookings?: { id: string; label: string }[];
  extras?: ExtraOption[];
  onQuoted: (id: string) => void;
}

function toInstant(value: string): string | null {
  const [day, time] = value.split('T');
  return saoPauloDateTime(day, time)?.toISOString() ?? null;
}

export default function QuoteForm({ areas, bookingId, passengerCanRequestAccess = !bookingId, replaces, routes = [], nextBookings = [], extras = [], requiresRoute = false, onQuoted }: Props) {
  const [assistance,setAssistance]=useState('none');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [scheduled, setScheduled] = useState(Boolean(bookingId));
  const [departure, setDeparture] = useState('');
  const [anotherLeg, setAnotherLeg] = useState(false);
  const [nextPlace, setNextPlace] = useState('');
  const [nextTime, setNextTime] = useState('');
  const [firstPayer, setFirstPayer] = useState<RidePayer>(bookingId ? 'client' : 'passenger');
  const [nextPayer, setNextPayer] = useState<RidePayer>(bookingId ? 'client' : 'passenger');
  const [routeId, setRouteId] = useState('');
  const [nextRouteId, setNextRouteId] = useState('');
  const [nextBooking, setNextBooking] = useState('');
  const [firstExtras, setFirstExtras] = useState<string[]>([]);
  const [nextExtras, setNextExtras] = useState<string[]>([]);
  const measured = routes.find(r => r.id === routeId);
  const measuredNext = routes.find(r => r.id === nextRouteId);
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
    const from = measured?.origin_area ?? origin;
    const to = measured?.destination_area ?? destination;
    const onward = measuredNext?.destination_area ?? nextPlace;
    if ((routeId && !measured) || (anotherLeg && nextRouteId && !measuredNext)) {
      setValidation('A medição perdeu a validade. Escolha outra rota.');
      return;
    }
    if (requiresRoute && (!measured || (anotherLeg && !measuredNext))) {
      setValidation('É preciso selecionar uma medição da operação para cada trecho.');
      return;
    }
    if (!from || !to || (!measured && from === to) || (anotherLeg && (!onward || (!measuredNext && to === onward) || (measuredNext && measuredNext.origin_area !== to)))) {
      setValidation('Escolha pontos diferentes para o início e o fim de cada trecho.');
      return;
    }
    if ((scheduled && (!first || Date.parse(first) <= now || Date.parse(first) > last)) ||
        (anotherLeg && (!next || Date.parse(next) > last || Date.parse(next) <= (first ? Date.parse(first) : now)))) {
      setValidation('Escolha datas nos próximos 30 dias e marque o próximo trecho depois da ida, no horário de São Paulo.');
      return;
    }
    if (nextBooking && requiresRoute && (anotherLeg ? measuredNext : measured)?.service_endpoint !== 'origin') {
      setValidation('Para seguir a outro atendimento, selecione a medição que parte do endereço do atendimento atual.');
      return;
    }
    const legs: RideLegInput[] = [{ origin: from, destination: to, payer: firstPayer }];
    if (measured) legs[0].route_id = measured.id;
    if (firstExtras.length) legs[0].extras = firstExtras;
    if (replaces) legs[0].replaces = replaces;
    if (first) legs[0].pickup_at = first;
    if (anotherLeg && next) {
      const second: RideLegInput = { origin: to, destination: onward, pickup_at: next, payer: nextPayer };
      if (measuredNext) second.route_id = measuredNext.id;
      if (nextExtras.length) second.extras = nextExtras;
      legs.push(second);
    }
    if (nextBooking && nextBookings.some(b => b.id === nextBooking)) legs[legs.length - 1].next_booking_id = nextBooking;
    const payload = JSON.stringify([bookingId, first, legs, assistance]);
    if (request.current?.payload !== payload) request.current = { payload, key: crypto.randomUUID() };
    sending.current = true;
    setBusy(true);
    setValidation('');
    try {
      const quote = passengerCanRequestAccess && assistance !== 'none'
        ? await quoteRideWithAccess(request.current.key, bookingId, first, legs, assistance)
        : await quoteRide(request.current.key, bookingId, first, legs);
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
      {passengerCanRequestAccess && <label className="block">Assistência no transporte <select className={field} value={assistance} onChange={e=>setAssistance(e.target.value)}>
        <option value="none">Sem assistência especial</option><option value="boarding">Ajuda para embarcar</option><option value="folding_equipment">Equipamento portátil ou dobrável</option>
        <option value="wheelchair_vehicle">Veículo adaptado para viajar na cadeira</option></select> Sem adicional. Se faltar capacidade, o plantão pode combinar outra janela.</label>}

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
        <RouteChoice required={requiresRoute} routes={routes} value={routeId} onChange={setRouteId} label="Medição para a ida" />
        {!requiresRoute && !measured && <div className="grid gap-4 sm:grid-cols-2">
          <label>Ponto de origem<select className={field} required value={origin} onChange={e => setOrigin(e.target.value)}><option value="">Selecione</option>{options}</select></label>
          <label>Ponto de destino<select className={field} required value={destination} onChange={e => setDestination(e.target.value)}><option value="">Selecione</option>{options}</select></label>
        </div>}
        <ExtraChoices options={extras} selected={firstExtras} onChange={setFirstExtras} label="Adicionais da ida" />
        {bookingId && <label className="block">Quem paga a ida?<select className={field} value={firstPayer} onChange={e => setFirstPayer(e.target.value as RidePayer)}>{payers}</select></label>}
        {!replaces && <label className="flex items-center gap-2"><input type="checkbox" checked={anotherLeg} onChange={e => { setAnotherLeg(e.target.checked); if (e.target.checked) setNextPlace(measured?.origin_area ?? origin); }} /> Incluir retorno ou continuação</label>}
        {anotherLeg && <div className="space-y-4">
          <RouteChoice required={requiresRoute} routes={routes.filter(r => r.origin_area === (measured?.destination_area ?? destination))} value={nextRouteId} onChange={setNextRouteId} label="Medição para o próximo trecho" />
          {!requiresRoute && !measuredNext && <label className="block">Destino do próximo trecho<select className={field} required value={nextPlace} onChange={e => setNextPlace(e.target.value)}><option value="">Selecione</option>{options}</select></label>}
          <ExtraChoices options={extras} selected={nextExtras} onChange={setNextExtras} label="Adicionais do próximo trecho" />
          <label className="block">Data e hora do próximo trecho (São Paulo)<input className={field} required type="datetime-local" value={nextTime} onChange={e => setNextTime(e.target.value)} /></label>
          {bookingId && <label className="block">Quem paga o próximo trecho?<select className={field} value={nextPayer} onChange={e => setNextPayer(e.target.value as RidePayer)}>{payers}</select></label>}
        </div>}
        {nextBookings.length > 0 && <label className="block">Atendimento seguinte do profissional
          <select className={field} value={nextBooking} onChange={e => setNextBooking(e.target.value)}>
            <option value="">Sem vínculo com outro atendimento</option>
            {nextBookings.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
          <span className="text-sm text-gray-600">O último trecho leva ao compromisso escolhido. O segundo cliente não paga este deslocamento.</span>
        </label>}
        {validation && <p role="alert" className="text-red-700">{validation}</p>}
        <ErrorAlert error={failure} />
        <button type="submit" className="rounded-xl bg-primary px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Cotando…' : 'Consultar preço'}</button>
      </fieldset>
    </form>
  );
}
