import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import ErrorAlert from '../ErrorAlert';
import { formatCents } from '../../lib/money';
import { saoPauloDateTime } from '../../lib/timezone';
import { amendmentState, decideAmendment, proposeAmendment, type AmendmentState } from '../../services/rideAmendments';
import { listRideRouteCases, type RidePoint, type RideRouteCase } from '../../services/rideRoutes';
const RidePointInput = lazy(async () => ({ default: (await import('./RidePointInput')).RidePointInput }));

type Draft = { label: string; lat: string; lng: string };
const blank = (): Draft => ({ label: '', lat: '', lng: '' });
const button = 'rounded-lg border border-gray-300 px-3 py-2 font-semibold disabled:opacity-50';
const statuses = { pending: 'Aguardando decisões', applied: 'Aplicada', declined: 'Recusada', superseded: 'Substituída', expired: 'Expirada' };
function point(value: Draft): RidePoint {
  const lat = Number(value.lat), lng = Number(value.lng);
  if (value.label.trim().length < 3 || !value.lat.trim() || !value.lng.trim() || !Number.isFinite(lat) ||
    !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new Error('Confira o endereço e o pino de cada parada e do destino.');
  return { label: value.label.trim(), lat, lng };
}
const dateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

export function RideAmendmentPanel({ legId, legStatus, areas = [], onChanged }: {
  legId: string; legStatus: string; areas?: string[]; onChanged: () => void;
}) {
  const activeLeg = ['requested', 'accepted', 'arriving', 'boarded'].includes(legStatus);
  const [open, setOpen] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [state, setState] = useState<AmendmentState | null>(null);
  const [routes, setRoutes] = useState<RideRouteCase[]>([]);
  const [routeId, setRouteId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [dest, setDest] = useState<Draft>(blank);
  const [stops, setStops] = useState<Draft[]>([]);
  const [instruction, setInstruction] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState('');
  const intent = useRef<{ payload: string; key: string } | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (!open && !activeLeg) return;
    let active = true;
    async function load() {
      try {
        const next = await amendmentState(legId);
        if (!active) return;
        setState(next);
        setFrom(prev => prev || next.origin_area || '');
        setTo(prev => prev || next.destination_area || '');
        if (open && next.can_propose) {
          const cases = await listRideRouteCases();
          if (active) setRoutes(cases.filter(c => c.can_quote && c.booking_id === null && c.status === 'verified'));
        }
      } catch (err) { if (active) setError(err); }
    }
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 20000);
    return () => { active = false; clearInterval(timer); };
  }, [open, activeLeg, legId, epoch]);

  async function action(work: () => Promise<void>) {
    if (sending.current) return;
    sending.current = true; setBusy(true); setError(null); setNotice('');
    try { await work(); onChanged(); } catch (err) { setError(err); } finally { setEpoch(v => v + 1); sending.current = false; setBusy(false); }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!state?.anchor) return;
    const anchor = state.anchor;
    await action(async () => {
      const [d,t] = time.split('T');
      const instant = time ? saoPauloDateTime(d,t) : null;
      if (time && (!instant || instant.getTime() <= Date.now())) throw new Error('Escolha um horário futuro de São Paulo.');
      const selected = routes.find(c => c.id === routeId);
      if (routeId && !selected) throw new Error('A medição perdeu a validade.');
      const data = { leg: legId, anchor, fromArea: from, toArea: to, stops: selected ? [] : stops.map(point),
        destination: selected?.destination ?? point(dest), pickup: instant?.toISOString(), instruction };
      const payload = JSON.stringify([data, routeId]);
      if (intent.current?.payload !== payload) intent.current = { payload, key: crypto.randomUUID() };
      await proposeAmendment({ ...data, key: intent.current.key }, routeId || undefined);
      intent.current = null; setNotice('Confira a revisão antes de aceitar. A rota anterior continua válida até a última autorização.');
    });
  }
  const areaSelect = (label: string, value: string, onChange: (s: string) => void) => <label className="block">{label}
    <select className="ml-2 border p-2" required value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Selecione a área</option>{areas.map(a => <option key={a}>{a}</option>)}
    </select></label>;
  return <section className="space-y-3">
    <button type="button" className={button} aria-expanded={open} onClick={() => setOpen(!open)}>Alterações do trecho</button>
    {!open && state?.changes.some(c => c.status === 'pending' && c.may_decide && !c.accepted_by_me)
      && <p role="status">Uma revisão do trajeto aguarda sua decisão.</p>}
    {open && <><ErrorAlert error={error} />{notice && <p role="status">{notice}</p>}
      {!state && !error && <p>Consultando alterações…</p>}
      {state?.changes.map(change => <article key={change.id} className="space-y-2 rounded-lg border p-3">
        <h4 className="font-semibold">Revisão de {dateTime(change.created_at)} · {statuses[change.status]}</h4>
        <p>Embarque previsto para {dateTime(change.pickup_at)} (São Paulo).</p>
        {change.is_current && <p>Esta é a versão em uso no trecho.</p>}
        {change.previous_destination && <p>Destino anterior · {change.previous_destination}</p>}
        {change.destination && <p>Destino proposto · {change.destination}</p>}
        {!!change.stops?.length && <p>Ordem das paradas · {change.stops.join(' → ')}</p>}
        {change.remaining_minutes != null && <p>Percurso proposto de {change.remaining_minutes} min.</p>}
        {change.fare_cents != null && change.old_cents != null && <p>Preço anterior {formatCents(change.old_cents)} · Novo total e limite {formatCents(change.fare_cents)}</p>}
        {change.consumed_variable_cents != null && change.consumed_variable_cents > 0 && <p>O total inclui {formatCents(change.consumed_variable_cents)} de distância e tempo já registrados a bordo.</p>}
        {change.driver_cents != null && <p>Repasse proposto de {formatCents(change.driver_cents)}</p>}
        {change.status === 'pending' && <p>Válida até {dateTime(change.expires_at)}. A corrida vigente segue conforme a última autorização.</p>}
        {change.may_decide && change.status === 'pending' && <div className="flex flex-wrap gap-2">
          {!change.accepted_by_me && <button className={button} disabled={busy} onClick={() => void action(async () => {
            const result=await decideAmendment(change.id,true);
            setNotice(result.status === 'applied' ? 'Revisão aplicada à mesma corrida.' : 'Aceite registrado. Aguardando os demais participantes.');
          })}>Aceitar nova rota e condições</button>}
          <button className={button} disabled={busy} onClick={() => void action(async () => {
            await decideAmendment(change.id,false); setNotice('Revisão recusada. A última rota aceita continua vigente.');
          })}>{change.accepted_by_me ? 'Retirar aceite da revisão' : 'Recusar revisão'}</button>
        </div>}
      </article>)}
      {state?.can_propose && !state.anchor && <p>Não há ponto confirmado para calcular a alteração. Consulte o plantão antes de mudar o percurso.</p>}
      {state?.can_propose && state.anchor && <form onSubmit={submit} className="space-y-3 rounded-lg border p-3">
        <h4 className="font-semibold">Propor destino, paradas ou horário</h4>
        <p>Cálculo a partir de {state.anchor.label}. {state.status === 'boarded' && 'O total inclui o deslocamento já registrado a bordo.'}</p>
        {!!routes.length && <label className="block">Medição do novo percurso
          <select className="block border p-2" value={routeId} onChange={e => setRouteId(e.target.value)}><option value="">Calcular novo percurso</option>
            {routes.map(c => <option value={c.id} key={c.id}>{c.origin?.label} → {c.destination?.label} · {c.id.slice(-6)}</option>)}
          </select></label>}
        {!routeId && <Suspense fallback={<p role="status">Carregando os pontos do percurso…</p>}>
          {areaSelect('Área do ponto de partida',from,setFrom)}
          {areaSelect('Área de destino',to,setTo)}
          {stops.map((s,i) => <fieldset key={i} className="space-y-2">
            <RidePointInput name={`Parada ${i+1}`} value={s} set={v => setStops(current => current.map((item,j) => i===j ? v : item))} />
            <div className="flex gap-2">{i>0 && <button type="button" className={button} onClick={() => setStops(list => {
              const reordered=[...list]; [reordered[i-1],reordered[i]]=[reordered[i],reordered[i-1]];return reordered;
            })}>Mover parada {i+1} para cima</button>}
            <button type="button" className={button} onClick={() => setStops(list => list.filter((_,j)=>j!==i))}>Remover parada {i+1}</button></div>
          </fieldset>)}
          {stops.length<5 && <button type="button" className={button} onClick={() => setStops(list => [...list,blank()])}>Adicionar parada</button>}
          <RidePointInput name="Novo destino" value={dest} set={setDest} area={to || undefined} />
          <label className="block">Instrução para este percurso<input className="block w-full border p-2" maxLength={180} value={instruction} onChange={e=>setInstruction(e.target.value)} /></label>
        </Suspense>}
        {state.can_reschedule && <label className="block">Novo horário de embarque (São Paulo), se mudar
          <input className="block border p-2" type="datetime-local" value={time} onChange={e=>setTime(e.target.value)} /></label>}
        <p>A espera nas paradas mantém os adicionais já autorizados. Um acréscimo exige nova proposta. O horário do serviço segue a reserva original.</p>
        <button className={button} disabled={busy}>Cotar revisão do trecho</button>
      </form>}
      {state && !state.can_propose && !state.changes.length && <p>Sem alteração proposta para este trecho.</p>}
    </>}
  </section>;
}
