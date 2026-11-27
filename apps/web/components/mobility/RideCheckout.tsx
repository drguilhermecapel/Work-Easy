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
const labels: Record<string, string> = { available: 'Disponível para emitir', unknown: 'Aguardando conciliação', pending: 'Pendente', settling: 'Pagamento confirmado, aguardando liquidação',
  paid: 'Confirmado', partial_refund: 'Estorno parcial confirmado', refunded: 'Estornado',
  cancelled: 'Cancelado', review: 'Em revisão financeira' };

export function RideCheckout({ legId, simulation }: { legId: string; simulation: boolean }) {
  const view = useAsync(async () => unwrapMaybe<Payment>(await db().rpc(simulation ? 'ride_sandbox_payment_view' : 'ride_live_payment_view', { p_leg: legId })), legId + simulation);
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
      await invokeFunction(simulation ? 'ride-sandbox-checkout' : 'ride-live-checkout', { leg_id: legId });
    } catch (err) {
      setError(err);
    } finally {
      sending.current = false;
      setBusy(false);
      view.reload();
    }
  }
  const allowedInvoice = simulation ? /^https:\/\/sandbox\.asaas\.com\/i\/[\w-]+$/ : /^https:\/\/www\.asaas\.com\/i\/[\w-]+$/;
  const invoice = payment.invoice_url && allowedInvoice.test(payment.invoice_url) ? payment.invoice_url : null;
  return <div className="space-y-2 rounded-xl border border-gray-200 bg-white p-3 text-sm">
    <h4 className="font-semibold">{simulation ? 'Asaas Sandbox · cobrança de teste' : 'Pagamento do trecho por Pix'}</h4>
    <p>{formatCents(payment.amount_cents)} · {labels[payment.state] ?? 'Consulte a operação'}</p>
    {payment.refunded_cents > 0 && <p>Estornado: {formatCents(payment.refunded_cents)}</p>}
    {simulation && <p>Use apenas o ambiente de teste do Asaas. Nenhum valor real deve ser pago.</p>}
    {invoice && payment.state === 'pending' && <a className="block font-semibold underline" href={invoice} target="_blank" rel="noopener noreferrer">{simulation ? 'Abrir fatura no sandbox' : 'Abrir fatura Pix no Asaas'}</a>}
    <button className="font-semibold underline" disabled={busy} onClick={() => void submit()}>{busy ? 'Consultando…' : payment.state === 'available' ? (simulation ? 'Emitir cobrança de teste' : 'Emitir fatura Pix') : 'Consultar situação no Asaas'}</button>
    <ErrorAlert error={error ?? view.error} />
  </div>;
}

interface Review { at: string; reason: string; observed: { gross?: number; fee?: number; split?: number; refund?: number } }
const reasons: Record<string, string> = {
  payment_mismatch: 'Identificação ou valor da cobrança divergente', unverified_payment: 'Identidade da cobrança pendente de revisão',
  ambiguous_reference: 'Referência associada a múltiplas cobranças', invalid_invoice: 'Endereço da fatura divergente',
  unverified_split: 'Recebedor ou situação do split divergente', split_value_mismatch: 'Valor destinado ao motorista divergente',
  split_paid_mismatch: 'Repasse efetivado divergente', net_mismatch: 'Líquido insuficiente ou divergente', missing_net: 'Líquido sem confirmação',
  missing_refund_breakdown: 'Devolução sem discriminação', unverified_split_reversal: 'Devolução do split sem confirmação',
  refund_allocation_requires_review: 'Rateio da devolução pendente', ledger_conflict: 'Divergência na conciliação',
};
export function RidePspReviews({ legId }: { legId: string }) {
  const [open, setOpen] = useState(false);
  const reviews = useAsync(async () => open ? unwrapMaybe<Review[]>(await db().rpc('admin_ride_psp_reviews', { p_leg: legId })) : [], legId + open);
  return <div className="space-y-2 text-sm">
    <button className="font-semibold underline" aria-expanded={open} onClick={() => setOpen(!open)}>Ocorrências da cobrança</button>
    {open && <><ErrorAlert error={reviews.error} />
      {reviews.loading ? <p>Consultando…</p> : reviews.data?.length === 0 ? <p>Sem ocorrência registrada.</p> : reviews.data?.map(review =>
        <p key={review.at + review.reason}>{new Date(review.at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} · {reasons[review.reason] ?? review.reason}
          {typeof review.observed.gross === 'number' && <> · bruto observado {formatCents(review.observed.gross)}</>}</p>)}</>}
  </div>;
}
