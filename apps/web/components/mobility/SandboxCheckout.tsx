import { useRef, useState } from 'react';
import ErrorAlert from '../ErrorAlert';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { db, invokeFunction, unwrapMaybe } from '../../services/client';

interface Payment {
  state: string;
  amount_cents: number;
  refunded_cents: number;
  invoice_url: string | null;
}
const labels: Record<string, string> = { available: 'Disponível para emitir', unknown: 'Aguardando conciliação', pending: 'Pendente',
  paid: 'Confirmado no sandbox', partial_refund: 'Estorno parcial confirmado', refunded: 'Estornado no sandbox',
  cancelled: 'Cancelado', review: 'Em revisão financeira' };

export function SandboxCheckout({ legId }: { legId: string }) {
  const view = useAsync(async () => unwrapMaybe<Payment>(await db().rpc('ride_sandbox_payment_view', { p_leg: legId })), legId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const sending = useRef(false);
  const payment = view.data;
  if (!payment) return <ErrorAlert error={view.error} />;
  async function submit() {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await invokeFunction('ride-sandbox-checkout', { leg_id: legId });
    } catch (err) {
      setError(err);
    } finally {
      sending.current = false;
      setBusy(false);
      view.reload();
    }
  }
  const invoice = payment.invoice_url && /^https:\/\/sandbox\.asaas\.com\/i\/[\w-]+$/.test(payment.invoice_url) ? payment.invoice_url : null;
  return <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
    <h4 className="font-semibold">Asaas Sandbox · cobrança de teste</h4>
    <p>{formatCents(payment.amount_cents)} · {labels[payment.state] ?? 'Consulte a operação'}</p>
    {payment.refunded_cents > 0 && <p>Estornado: {formatCents(payment.refunded_cents)}</p>}
    <p>Use apenas o ambiente de teste do Asaas. Nenhum valor real deve ser pago.</p>
    {invoice && payment.state === 'pending' && <a className="block font-semibold underline" href={invoice} target="_blank" rel="noopener noreferrer">Abrir fatura no sandbox</a>}
    <button className="font-semibold underline" disabled={busy} onClick={() => void submit()}>{busy ? 'Consultando…' : payment.state === 'available' ? 'Emitir cobrança de teste' : 'Conciliar com o sandbox'}</button>
    <ErrorAlert error={error ?? view.error} />
  </div>;
}
