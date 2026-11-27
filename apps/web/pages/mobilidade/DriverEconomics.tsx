import { useState, type FormEvent } from 'react';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { RideAftercare } from '../../components/mobility/RideAftercare';
import { useAuth } from '../../contexts/AuthContext';
import { formatCents } from '../../lib/money';
import { formatDateBR, todayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { driverStatement, recordDriverDiary, type DriverDiary, type DriverStatement } from '../../services/driverEconomics';
import { openRideHelp } from '../../services/rideAftercare';

const quantity = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });
const formatRate = (value: number | null) => value === null ? 'Sem medição suficiente' : formatCents(value);
const kindName: Record<string, string> = {
  earned: 'Transporte e adicionais', capture: 'Recebimento do passageiro', capture_failed: 'Falha no recebimento',
  capture_unknown: 'Recebimento em conferência', payout: 'Repasse liquidado', payout_failed: 'Falha no repasse',
  payout_unknown: 'Repasse em conferência', refund: 'Estorno', refund_failed: 'Falha no estorno', refund_unknown: 'Estorno em conferência',
  dispute_open: 'Disputa aberta', dispute_release: 'Disputa encerrada', chargeback: 'Débito de disputa',
  payout_reversal: 'Reversão de repasse', psp_fee: 'Tarifa de processamento', psp_fee_credit: 'Crédito de processamento',
  cancel_pending: 'Interrupção com custo a apurar', cancel_cost: 'Custo de cancelamento reconhecido', cancel_payout: 'Cancelamento liquidado',
  reward: 'Incentivo reconhecido', reward_payout: 'Incentivo liquidado', reward_reversal: 'Estorno de incentivo',
  reward_payout_reversal: 'Reversão do repasse do incentivo',
};

function Diary({ day, initial, saved }: { day: string; initial: DriverDiary | null; saved: () => void }) {
  const [paid, setPaid] = useState(initial ? String(initial.paid_meters / 1000) : '');
  const [empty, setEmpty] = useState(initial ? String(initial.empty_meters / 1000) : '');
  const [cost, setCost] = useState(initial ? String(initial.cost_cents / 100) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null); setBusy(true);
    try {
      await recordDriverDiary(day, {
        paid_meters: Math.round(Number(paid) * 1000), empty_meters: Math.round(Number(empty) * 1000), cost_cents: Math.round(Number(cost) * 100),
      });
      saved();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-2 rounded-xl border p-3">
    <h3 className="font-semibold">Diário de {formatDateBR(day)}</h3>
    <p className="text-sm">Use as distâncias do odômetro e os gastos efetivos do dia, incluindo combustível, estacionamento e pedágios que pagou. Os reembolsos já entram no extrato. Salvar substitui o diário desse dia.</p>
    <div className="grid gap-2 sm:grid-cols-3">
      <label>Km com passageiro<input className={inputClass} type="number" min="0" max="2000" step="0.001" required value={paid} onChange={e => setPaid(e.target.value)} /></label>
      <label>Km vazios e de retorno<input className={inputClass} type="number" min="0" max="2000" step="0.001" required value={empty} onChange={e => setEmpty(e.target.value)} /></label>
      <label>Gastos próprios (R$)<input className={inputClass} type="number" min="0" max="100000" step="0.01" required value={cost} onChange={e => setCost(e.target.value)} /></label>
    </div>
    <button className={primaryButton} disabled={busy}>Salvar diário</button>
    <ErrorAlert error={error} />
  </form>;
}

function Income({ data }: { data: DriverStatement }) {
  const m = data.metrics;
  const minutes = (seconds: number) => quantity.format(seconds / 60) + ' min';
  const [goal, setGoal] = useState('');
  const values: [string,string][] = [
    ['Saldo anterior', formatCents(m.opening)], ['Remuneração da tarifa e cancelamentos', formatCents(m.income)],
    ['Reembolsos de despesas incluídos nessa remuneração', formatCents(m.reimbursements)],
    ['Incentivos líquidos de estornos',formatCents(m.rewards)], ['Repasse liquidado no período', formatCents(m.paid)],
    [m.closing < 0 ? 'Saldo a recuperar' : 'Saldo a receber no fechamento',formatCents(Math.abs(m.closing))],
    ['Gastos próprios declarados', formatCents(m.costs)], ['Renda após gastos, sem incentivo', formatCents(m.base_net)],
    ['Renda após gastos, com incentivo', formatCents(m.total_net)], ['Tempo online em turno', minutes(m.online_seconds)],
    ['Aproximação ao embarque', minutes(m.approach_seconds)], ['Espera no embarque',minutes(m.wait_seconds)],
    ['Com passageiro',minutes(m.passenger_seconds)], ['Atendendo como prestador',minutes(m.service_seconds)],
    ['Tempo comprometido, unindo os intervalos', minutes(m.committed_seconds)],
    ['Km com passageiro',quantity.format(m.paid_meters / 1000)], ['Km vazios',quantity.format(m.empty_meters / 1000)],
    ['Renda de mobilidade por hora online',formatRate(m.per_online_hour)],
    ['Renda de mobilidade por hora comprometida',formatRate(m.per_committed_hour)],
    ['Renda de mobilidade por km total',formatRate(m.per_km)],
  ];
  return <section className="space-y-2"><h3 className="font-semibold">Saldo e renda do período</h3>
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">{values.map(([name,value]) =>
      <div key={name} className="contents"><dt>{name}</dt><dd className="text-right tabular-nums">{value}</dd></div>)}</dl>
    {m.missing_days>0 && <p>Diário pendente em {m.missing_days} dia(s) de atividade. Distâncias e gastos estão parciais.</p>}
    {m.time_incomplete && <p>Há trechos com horários incompletos. A renda por hora comprometida aguarda medição.</p>}
    <label className="block">Meta pessoal opcional para o período (R$)
      <input className={inputClass} type="number" min="0" step="0.01" value={goal} onChange={e=>setGoal(e.target.value)}/></label>
    {goal && Number(goal)>=0 && <p>Faltam {formatCents(Math.max(0,Math.round(Number(goal)*100)-m.base_net))} para a meta pela tarifa normal, considerando os gastos informados.</p>}
  </section>;
}

function Report({ userId }: {userId: string}) {
  const today = todayInSaoPaulo();
  const [day,setDay] = useState(today);
  const [week,setWeek] = useState(false);
  const [receipt,setReceipt] = useState<string | null>(null);
  const [protocol,setProtocol] = useState<string | null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState<unknown>(null);
  const {data,loading,error:loadError,reload} = useAsync(()=>driverStatement(day,week),[userId,day,week].join(':'));
  async function dispute(leg: string) {
    setBusy(true); setError(null);
    try { setProtocol(await openRideHelp(leg,'payment')); reload(); }
    catch (err) { setError(err); } finally { setBusy(false); }
  }
  function change(days: string, wholeWeek: boolean) {
    setDay(days); setWeek(wholeWeek); setReceipt(null); setProtocol(null); setError(null);
  }
  return <div className="mt-3 space-y-4">
    <div className="grid gap-2 sm:grid-cols-2">
      <label>Data de referência em São Paulo<input type="date" className={inputClass} value={day} max={today} onChange={e=>e.target.value && change(e.target.value,week)}/></label>
      <label>Período do extrato<select className={inputClass} value={week?'week':'day'} onChange={e=>change(day,e.target.value==='week')}>
        <option value="day">Dia</option><option value="week">Semana de segunda a domingo</option>
      </select></label>
    </div>
    <ErrorAlert error={error ?? loadError}/>
    {loading && !data && <PageStatus/>}
    {data && <>
      <p>Extrato {data.simulation?'simulado ':''}a partir de {formatDateBR(data.from_day)}. Horários de São Paulo.</p>
      <Income key={data.from_day+data.until_day} data={data}/>
      <Diary key={day+JSON.stringify(data.diary)} day={day} initial={data.diary} saved={reload}/>
      <section className="space-y-2"><h3 className="font-semibold">Lançamentos por trecho</h3>
        {data.entries.length===0 && <p>Nenhum lançamento no período.</p>}
        {data.entries.map(e=><article key={e.operation_id+e.kind} className="rounded-lg border p-3">
          <h4 className="font-medium">{kindName[e.kind] ?? e.kind} · {e.gross===null?'A apurar':formatCents(e.gross)}</h4>
          <p className="break-all text-sm">{time.format(new Date(e.at_time))} · Trecho {e.leg_id}</p>
          <p className="text-sm">Crédito de remuneração {formatCents(e.income+e.reward)} · Liquidação {formatCents(e.paid)} · Comissão {formatCents(e.fee)}</p>
          {e.extras!==0 && <p className="text-sm">Adicionais {formatCents(e.extras)}{e.toll_cents!==0 && (e.toll_cents===null?' · inclui pedágio sem valor individual registrado':' · pedágio '+formatCents(e.toll_cents))}</p>}
          {e.status==='completed' && <button type="button" className={secondaryButton} onClick={()=>setReceipt(e.leg_id)}>Ver comprovante</button>}
          <button type="button" disabled={busy} className={secondaryButton} onClick={()=>dispute(e.leg_id)}>{e.protocol?'Consultar contestação':'Contestar lançamento'}</button>
        </article>)}
        {receipt && <RideAftercare legId={receipt} completed/>}
        {protocol && <p role="status">Protocolo de pagamento {protocol}</p>}
      </section>
      <section><h3 className="font-semibold">Histórico por região e horário</h3>
        <p className="text-sm">Quatro semanas encerradas em {time.format(new Date(data.trends.as_of))}. Média da remuneração de tarifa no término da viagem, sem adicionais nem incentivos.</p>
        {data.trends.cells.length===0 ? <p>Amostra insuficiente para publicar regiões.</p> :
          <ul>{data.trends.cells.map(c=><li key={c.zone+c.hour_block}>{c.zone}, {c.hour_block}h–{c.hour_block+4}h · {c.demand} solicitações, {c.completed} concluídas · média {formatCents(c.typical_cents)}</li>)}</ul>}
      </section>
    </>}
  </div>;
}

export default function DriverEconomics() {
  const {authUser} = useAuth();
  const [open,setOpen] = useState(false);
  return <section className="rounded-xl border bg-white p-4"><h2 className="font-semibold">Ganhos e diário do motorista</h2>
    <button type="button" aria-expanded={open} className={secondaryButton} onClick={()=>setOpen(!open)}>{open?'Fechar extrato':'Consultar extrato'}</button>
    {open && authUser && <Report key={authUser.id} userId={authUser.id}/>}
  </section>;
}
