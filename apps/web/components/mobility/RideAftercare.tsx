import { useId, useRef, useState } from 'react';
import { formatCents } from '../../lib/money';
import { APP_TIME_ZONE } from '../../lib/timezone';
import { getRideAftercare, rateRide, type AftercareResult, type RideReceipt } from '../../services/rideAftercare';
import ErrorAlert from '../ErrorAlert';
import { RatingInput } from '../cliente/Stars';
import { RideHelp } from './RideSupport';

const stamp = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: APP_TIME_ZONE });
const km = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const action = 'rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium disabled:opacity-50';

function RouteMap({ points }: { points: [number, number][] }) {
  if (points.length < 2) return <p>Trajeto observado insuficiente para desenhar o mapa.</p>;
  const latitudes = points.map(([lat]) => lat);
  const longitudes = points.map(([, lon]) => lon);
  const north = Math.max(...latitudes);
  const south = Math.min(...latitudes);
  const west = Math.min(...longitudes);
  const east = Math.max(...longitudes);
  const latitudeScale = Math.cos(((north + south) / 2) * Math.PI / 180);
  const width = Math.max(0.00001, (east - west) * latitudeScale);
  const height = Math.max(0.00001, north - south);
  const scale = Math.min(280 / width, 140 / height);
  const xy = points.map(([lat, lon]) => [160 + ((lon - (west + east) / 2) * latitudeScale) * scale, 90 + ((north + south) / 2 - lat) * scale]);
  const start = xy[0];
  const end = xy[xy.length - 1];
  return <figure>
    <svg viewBox="0 0 320 180" width="320" height="180" className="max-w-full" role="img" aria-label="Mapa dos pontos observados entre o embarque e o desembarque, com norte para cima">
      <rect width="320" height="180" fill="#f8fafc" stroke="#94a3b8" />
      <polyline points={xy.map(([x, y]) => x.toFixed(1) + ',' + y.toFixed(1)).join(' ')} fill="none" stroke="#145c53" strokeWidth="3" strokeLinejoin="round" />
      <circle cx={start[0]} cy={start[1]} r="5" fill="#fff" stroke="#145c53" strokeWidth="2" />
      <rect x={end[0] - 3} y={end[1] - 3} width="6" height="6" fill="#145c53" />
      <text x="8" y="16" fontSize="11">N ↑</text>
    </svg>
    <figcaption>Primeira posição em círculo e última em quadrado. {points.length} posições observadas durante a viagem. Extensão de {south.toFixed(4)}° a {north.toFixed(4)}° de latitude e de {west.toFixed(4)}° a {east.toFixed(4)}° de longitude.</figcaption>
  </figure>;
}

function ReceiptBody({ receipt }: { receipt: RideReceipt }) {
  const j = receipt.journey;
  const m = receipt.money;
  const duration = j?.boarded_at ? Math.max(0, Math.round((Date.parse(j.ended_at) - Date.parse(j.boarded_at)) / 60000)) : null;
  return <article className="space-y-2 rounded-lg border p-3" aria-label="Documento da viagem">
    <h3 className="font-semibold">{receipt.role === 'passenger' ? 'Recibo do trecho' : 'Demonstrativo financeiro do trecho'}</h3>
    {receipt.simulation && <p><strong>Simulação · sem valor fiscal ou pagamento real</strong></p>}
    <p>WorkEasy · {receipt.id}<br />Emissão em {stamp.format(new Date(receipt.issued_at))} (São Paulo)</p>
    {j ? <>
      <p>{j.origin} → {j.destination}</p>
      {j.origin_point && <p>Embarque combinado: {j.origin_point.lat.toFixed(5)}°, {j.origin_point.lng.toFixed(5)}°</p>}
      {j.destination_point && <p>Destino combinado: {j.destination_point.lat.toFixed(5)}°, {j.destination_point.lng.toFixed(5)}°</p>}
      <p>Motorista: {j.driver_name ?? 'não registrado'}{j.driver_number && ' · registro ' + j.driver_number}<br />
        Veículo: {j.vehicle_model ?? j.vehicle_category ?? 'não registrado'}{j.vehicle_plate && ' · placa ' + j.vehicle_plate}</p>
      <p>Embarque: {j.boarded_at ? stamp.format(new Date(j.boarded_at)) : 'não aferido'}<br />
        Término: {stamp.format(new Date(j.ended_at))}<br />
        Duração observada: {duration === null ? 'não aferida' : duration + ' min'}<br />
        Distância entre posições observadas: {j.meters === null ? 'não aferida' : km.format(j.meters / 1000) + ' km'}</p>
      <RouteMap points={j.points} />
    </> : receipt.role === 'passenger' && <p>Os detalhes de trajeto deste trecho estão indisponíveis.</p>}
    {m ? <dl className="grid grid-cols-2 gap-x-2 text-sm">
      <dt>Transporte</dt><dd>{formatCents(m.fare_cents - m.extras_cents)}</dd>
      <dt>Adicionais</dt><dd>{formatCents(m.extras_cents)}</dd>
      <dt>Estornos e reversões</dt><dd>{formatCents(m.reversed_cents)}</dd>
      <dt>Valor final do trecho</dt><dd>{formatCents(m.final_cents)}</dd>
      <dt>Pagamento confirmado líquido</dt><dd>{formatCents(m.paid_cents)}</dd>
      {m.due_cents !== undefined && <><dt>Saldo a receber</dt><dd>{formatCents(m.due_cents)}</dd></>}
      {m.disputed_cents !== undefined && m.disputed_cents > 0 && <><dt>Em disputa</dt><dd>{formatCents(m.disputed_cents)}</dd></>}
      {m.commission_cents !== undefined && <><dt>Comissão do transporte</dt><dd>{formatCents(m.commission_cents)}</dd></>}
      {m.driver_cents !== undefined && <><dt>Remuneração líquida do motorista</dt><dd>{formatCents(m.driver_cents)}</dd></>}
    </dl> : <p>Valores em conciliação.</p>}
    {m?.pending && <p>Há uma operação de pagamento aguardando confirmação.</p>}
  </article>;
}

export function RideAftercare({ legId, completed }: { legId: string; completed: boolean }) {
  // A newly selected leg must not inherit another passenger's visible document.
  return <LegAftercare key={legId} legId={legId} completed={completed} />;
}

function LegAftercare({ legId, completed }: { legId: string; completed: boolean }) {
  const [data, setData] = useState<AftercareResult | null>(null);
  const [stars, setStars] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState<unknown>(null);
  const lock = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  const id = useId();

  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true); setError(null); setNotice('');
    try { await work(); } catch (err) { setError(err); }
    finally { lock.current = false; setBusy(false); }
  }
  function print() {
    if (!body.current) return;
    const sheet = window.open('', '_blank');
    if (!sheet) { setNotice('Permita abrir a janela de impressão deste recibo.'); return; }
    sheet.opener = null;
    sheet.document.title = 'WorkEasy — documento da viagem';
    // Print only this leg, without the dashboard, controls or other passengers.
    sheet.document.body.replaceChildren(body.current.cloneNode(true));
    sheet.focus(); sheet.print();
  }
  return <div className="space-y-2 text-sm">
    {completed && <button type="button" className={action} disabled={busy} onClick={() => void run(async () => {
      const next = await getRideAftercare(legId);
      setData(next); setStars(next.stars ?? 0);
    })}>{data ? 'Atualizar documento do trecho' : 'Consultar recibo e avaliação'}</button>}{' '}
    <RideHelp legId={legId} />
    {data?.document && <><div ref={body}><ReceiptBody receipt={data.document} /></div>
      <button type="button" className={action} onClick={print}>Imprimir este documento</button></>}
    {data && !data.document && <p>Nenhum documento disponível para este perfil.</p>}
    {data?.can_rate && <div><RatingInput value={stars} onChange={setStars} name={id + '-stars'} disabled={busy} />
      <button type="button" className={action} disabled={busy || stars === 0} onClick={() => void run(async () => {
        await rateRide(legId, stars); setNotice('Avaliação registrada.');
      })}>Salvar avaliação do trecho</button></div>}
    {notice && <p role="status">{notice}</p>}<ErrorAlert error={error} />
  </div>;
}
