import React, { useRef, useState } from 'react';
import { toAppError } from '../../lib/errors';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { centsToInput, parseReaisToCents } from '../../services/proFormat';
import {
  getRideSettlement, rideFinanceLabels, simulateRideFinanceEvent,
  type RideFinanceKind, type RideSettlement,
} from '../../services/rideLedger';

type Recognized = Extract<RideSettlement, { recognized: true }>;

function SimulateEvent({ legId, account, onSaved }: { legId: string; account: Recognized; onSaved: () => void }) {
  const pending = account.unknown;
  const kinds = (Object.keys(rideFinanceLabels) as RideFinanceKind[]).filter(kind =>
    !pending || kind === pending.kind.split('_')[0] || kind === pending.kind.replace('_unknown', '_failed'));
  const [kind, setKind] = useState<RideFinanceKind>(kinds[0]);
  const [amount, setAmount] = useState(centsToInput(pending?.amount_cents ?? account.fare_cents));
  const [extras, setExtras] = useState(centsToInput(pending?.extras_cents ?? 0));
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const attempted = useRef<{ payload: string; id: string } | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending.current) return;
    const cents = parseReaisToCents(amount);
    const extrasCents = kind.startsWith('refund') || kind === 'chargeback' ? parseReaisToCents(extras) : 0;
    if (!cents || cents > 2147483647 || extrasCents === null || extrasCents > cents) {
      setNotice('Informe um valor positivo e extras de até esse valor.');
      return;
    }
    const payload = [kind, cents, extrasCents].join('/');
    if (!attempted.current || attempted.current.payload !== payload) {
      attempted.current = { payload, id: pending?.operation_id ?? crypto.randomUUID() };
    }
    sending.current = true;
    setBusy(true);
    try {
      await simulateRideFinanceEvent(legId, attempted.current.id, kind, cents, extrasCents);
      attempted.current = null;
      setNotice('Evento simulado registrado.');
      onSaved();
    } catch (error) {
      setNotice(toAppError(error).message);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return <form onSubmit={submit} className="grid gap-3">
    <p>{pending ? 'Há uma operação incerta. Informe o resultado da conciliação para a mesma operação.' :
      'Ensaio financeiro. Os lançamentos ficam no ambiente de simulação.'}</p>
    <label>Evento <select value={kind} onChange={e => setKind(e.target.value as RideFinanceKind)}>
      {kinds.map(value => <option key={value} value={value}>{rideFinanceLabels[value]}</option>)}
    </select></label>
    <label>Valor em reais <input inputMode="decimal" value={amount} readOnly={!!pending} onChange={e => setAmount(e.target.value)} /></label>
    {(kind.startsWith('refund') || kind === 'chargeback') && <label>Extras incluídos no valor (R$) <input
      inputMode="decimal" value={extras} readOnly={!!pending} onChange={e => setExtras(e.target.value)} /></label>}
    <button type="submit" disabled={busy}>Registrar evento simulado</button>
    {notice && <p role="status">{notice}</p>}
  </form>;
}

export function RideLedgerPanel({ legId }: { legId: string }) {
  const { data, loading, error, reload } = useAsync(() => getRideSettlement(legId), legId);
  const parts = data?.recognized ? [
    ['Preço aceito', data.fare_cents], ['Extras', data.extras_cents], ['A receber', data.receivable_cents],
    ['Caixa líquido', data.cash_cents], ['Comissão após ajustes', data.commission_cents],
    [data.driver_balance_cents < 0 ? 'A recuperar do motorista' : 'Saldo a repassar ao motorista', Math.abs(data.driver_balance_cents)],
    ['Em disputa', data.disputed_cents], ['Reembolsos e chargebacks', data.reversed_cents],
  ] as const : [];
  return <section aria-label="Conciliação do trecho" className="grid gap-3">
    <h3>Conciliação do trecho</h3>
    {error && <p role="alert">{error.message} <button type="button" onClick={reload}>Atualizar</button></p>}
    {loading && <p role="status">Consultando lançamentos…</p>}
    {data && !data.recognized && <p>O trecho ainda não tem valores reconhecidos no livro financeiro.</p>}
    {data?.recognized && <>
      <dl>{parts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{formatCents(value)}</dd></div>)}</dl>
      {data.environment === 'simulation' && <SimulateEvent key={legId + (data.unknown?.operation_id ?? '')}
        legId={legId} account={data} onSaved={reload} />}
    </>}
  </section>;
}
