import { lazy, Suspense, useState } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import { secondaryButton } from '../../components/admin/styles';

import { useAsync } from '../../lib/useAsync';
import {
  devicePoint,
  reachWaypoint,
  readNavigation,
  recalculateRoad,
  shareDriverEta,
} from '../../services/driverJourney';

const LocalRideMap = lazy(() => import('../../components/mobility/LocalRideMap'));

export default function DriverNavigation({ leg, phase }: { leg: string; phase: string }) {
  const view = useAsync(() => readNavigation(leg), leg + phase);
  const [road, setRoad] = useState<Awaited<ReturnType<typeof recalculateRoad>> | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const ctx = view.data;
  if (!ctx) return <ErrorAlert error={view.error} />;
  if (ctx.phase === 'scheduled') {
    return <p>Os pontos de navegação ficam disponíveis 30 minutos antes do embarque.</p>;
  }
  const target = ctx.target;
  if (!target) return <p>O ponto exato deste trecho está indisponível. Consulte o plantão.</p>;
  const url = new URL('https://www.google.com/maps/dir/');
  url.search = new URLSearchParams({
    api: '1',
    destination: target.lat + ',' + target.lng,
    travelmode: 'driving',
  }).toString();
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className='space-y-2' aria-label='Navegação do trecho'>
      <h3 className='font-semibold'>
        {ctx.phase === 'boarded' ? ctx.index < ctx.stops.length ? 'Próxima parada' : 'Destino' : 'Embarque'} ·
        {' '}
        {target.label}
      </h3>
      {ctx.instruction && <p>{ctx.instruction}</p>}
      <Suspense fallback={<p>Carregando o mapa…</p>}>
        <LocalRideMap
          label='Percurso do motorista'
          points={[target]}
          route={road?.geometry.coordinates ?? ctx.geometry?.coordinates}
        />
      </Suspense>
      <button
        className={secondaryButton}
        disabled={busy}
        onClick={() =>
          void run(async () => {
            const p = ctx.simulation ? undefined : await devicePoint();
            const route = await recalculateRoad(leg, ctx, p ? { lat: p.lat, lng: p.lng } : undefined);
            setRoad(route);
            setStatus('Trajeto atualizado.');
          })}
      >
        {ctx.simulation ? 'Recalcular com posição de ensaio' : 'Usar minha posição e recalcular o caminho'}
      </button>
      {road && (
        <p>
          {(road.meters / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km · {road.minutes}
          {' '}
          min estimados pelo mapa viário.
          {['arriving', 'boarded'].includes(ctx.phase) && (
            <button
              className={secondaryButton}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await shareDriverEta(leg, road.minutes);
                  setStatus('Previsão enviada ao passageiro.');
                })}
            >
              Enviar previsão
            </button>
          )}
        </p>
      )}
      {ctx.external_allowed && (
        <details>
          <summary>Usar navegador externo</summary>
          <p>Ao escolher um aplicativo você envia as coordenadas deste ponto ao navegador escolhido.</p>
          <a className='underline mr-4' href={url.href} target='_blank' rel='noopener noreferrer'>
            Google Maps
          </a>
          <a
            className='underline'
            href={'https://maps.apple.com/?daddr=' + target.lat + ',' + target.lng + '&dirflg=d'}
            target='_blank'
            rel='noopener noreferrer'
          >
            Apple Mapas
          </a>
        </details>
      )}
      {ctx.phase === 'boarded' && ctx.index < ctx.stops.length && (
        <button
          className={secondaryButton}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await reachWaypoint(leg, ctx.index);
              setRoad(null);
              view.reload();
            })}
        >
          Confirmar parada alcançada
        </button>
      )}
      {ctx.pickup_deviation_seconds != null && (
        <p>
          Diferença entre previsão e chegada ao embarque: {Math.round(ctx.pickup_deviation_seconds / 60)} min.
        </p>
      )}
      <p role='status'>{status}</p>
      <ErrorAlert error={error ?? view.error} />
    </section>
  );
}
