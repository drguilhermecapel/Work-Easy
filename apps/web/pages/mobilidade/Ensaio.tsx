import { lazy, Suspense, useState } from 'react';
import { formatCents } from '../../lib/money';
import route from '../../maps/saude-example.json';
const LocalRideMap = lazy(() => import('../../components/mobility/LocalRideMap'));
const sampleRoute: [number, number][] = route.coordinates.map(([lng, lat]) => [lng, lat]);

const primary = 'rounded-xl bg-primary px-4 py-2 font-semibold text-white';
const secondary = 'rounded-xl border border-gray-300 px-4 py-2 font-semibold';

export default function Ensaio() {
  const [mapOpen, setMapOpen] = useState(false);
  const [back, setBack] = useState(false);
  const [status, setStatus] = useState<'draft' | 'quoted' | 'accepted' | 'declined'>('draft');
  const total = back ? 5500 : 3000;
  return <section className="mx-auto max-w-2xl space-y-5 px-4 py-8">
    <h1 className="text-2xl font-bold text-gray-900">Ensaio de corrida</h1>
    <p className="rounded-xl bg-amber-50 p-4 text-amber-900">Exemplo local com pontos e valores fictícios. As ações não chamam um motorista, cobram ou alteram um atendimento.</p>
    <div>
      <button type="button" className={secondary} aria-expanded={mapOpen} onClick={() => setMapOpen(open => !open)}>
        {mapOpen ? 'Ocultar mapa de exemplo' : 'Explorar mapa de exemplo em Saúde'}
      </button>
      {mapOpen && <div className="mt-3 space-y-2">
        <Suspense fallback={<p role="status">Carregando mapa…</p>}>
          <LocalRideMap label="Percurso de exemplo em São Paulo" points={[
            { label: 'Italianinho VB', lat: -23.6206567, lng: -46.6367045 },
            { label: 'Oggi Sorvetes', lat: -23.6179524, lng: -46.6355272 },
          ]} route={sampleRoute} />
        </Suspense>
        <p className="text-sm">{Math.round(route.meters)} m por vias · cerca de {Math.ceil(route.seconds / 60)} min.
          Estimativa do roteador local, sem trânsito em tempo real.</p>
      </div>}
    </div>
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Ida do profissional</h2>
      <p>Ponto de encontro A → Ponto de atendimento B</p>
      {status === 'draft' && <>
        <label className="flex gap-2"><input type="checkbox" checked={back} onChange={e => setBack(e.target.checked)} /> Incluir retorno ao ponto A</label>
        <button className={primary} onClick={() => setStatus('quoted')}>Ver cotação fictícia</button>
      </>}
      {status !== 'draft' && <>
        <p>Ida: {formatCents(3000)}. {back && <>Retorno: {formatCents(2500)}.</>} Extras: {formatCents(0)}.</p>
        <p>Cliente pagaria {formatCents(total)}. No exemplo com comissão de 10%, a plataforma receberia {formatCents(total / 10)} e o motorista, {formatCents(total * 9 / 10)}.</p>
        {status === 'quoted' ? <div className="flex flex-wrap gap-2">
          <button className={primary} onClick={() => setStatus('accepted')}>Ensaiar aceite</button>
          <button className={secondary} onClick={() => setStatus('declined')}>Ensaiar recusa</button>
        </div> : <>
          <p role="status">{status === 'accepted' ? 'Aceite fictício concluído.' : 'Transporte recusado no ensaio. O prestador pode combinar outro trajeto.'}</p>
          <button className={secondary} onClick={() => { setBack(false); setStatus('draft'); }}>Reiniciar ensaio</button>
        </>}
      </>}
    </div>
  </section>;
}
