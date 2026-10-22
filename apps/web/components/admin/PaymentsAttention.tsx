import React from 'react';
import { Link } from 'react-router-dom';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import {
  ATTENTION_LIMIT,
  listPaymentsNeedingAttention,
  markPaymentReviewed,
  type PaymentAttention,
  type PaymentAttentionAction,
  type PaymentAttentionEvent,
} from '../../services/admin';
import ErrorAlert from '../ErrorAlert';
import { ActionButton } from './ConfirmAction';
import { formatDateTime, shortId } from './format';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from './labels';
import { linkClass } from './styles';
import { Badge, EmptyState } from './ui';

const EVENT_LABELS: Record<PaymentAttentionAction, string> = {
  'payment.refund_failed': 'O reembolso automático foi recusado',
  'payment.received_after_cancel': 'Pagamento recebido depois do cancelamento do atendimento',
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const Event: React.FC<{ event: PaymentAttentionEvent }> = ({ event }) => {
  const code = text(event.data.code);
  const message = text(event.data.message);
  return (
    <li className="text-sm">
      <p className="font-medium text-gray-800">{EVENT_LABELS[event.action] ?? event.action}</p>
      <p className="text-xs text-gray-500">{formatDateTime(event.at)}</p>
      {code && <p className="text-xs text-gray-700 break-words">Código: {code}</p>}
      {message && <p className="text-xs text-gray-700 break-words">{message}</p>}
    </li>
  );
};

const Item: React.FC<{ payment: PaymentAttention; onDone: () => void }> = ({ payment, onDone }) => (
  <li className="bg-white border border-amber-200 rounded-2xl p-4 shadow-xs" data-payment-id={payment.payment_id}>
    <div className="flex flex-wrap items-center gap-2 mb-1">
      <Badge className={PAYMENT_STATUS_STYLES[payment.status]}>{PAYMENT_STATUS_LABELS[payment.status] ?? payment.status}</Badge>
      <span className="text-xs text-gray-500">{(payment.method && PAYMENT_METHOD_LABELS[payment.method]) ?? payment.method ?? ''}</span>
    </div>
    <p className="text-lg font-bold text-gray-900">{formatCents(payment.amount_cents)}</p>
    <dl className="text-sm text-gray-700 mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
      <dt className="text-gray-500">Pagamento</dt>
      <dd>
        <Link to={`/admin/pagamentos?pagamento=${payment.payment_id}`} className={linkClass} title={payment.payment_id}>
          {`Ver o pagamento ${shortId(payment.payment_id)}`}
        </Link>
      </dd>
      <dt className="text-gray-500">Profissional</dt>
      <dd className="break-words">
        {payment.provider_id ? (
          <Link to={`/admin/prestadores/${payment.provider_id}`} className={linkClass}>
            {payment.provider_name ?? 'Ver prestador'}
          </Link>
        ) : (
          (payment.provider_name ?? 'Não informado')
        )}
      </dd>
      {payment.booking_id && (
        <>
          <dt className="text-gray-500">Atendimento</dt>
          <dd title={payment.booking_id}>{shortId(payment.booking_id)}</dd>
        </>
      )}
    </dl>
    <ul className="space-y-2 border-l-2 border-amber-200 pl-3 mt-3">
      {payment.events.map(event => (
        <Event key={event.audit_id} event={event} />
      ))}
    </ul>
    <div className="flex flex-wrap gap-2 mt-4">
      <ActionButton
        label="Marcar como tratado"
        tone="primary"
        title="Marcar este pagamento como tratado"
        description={
          <p>
            Use depois de resolver o caso fora do app, por exemplo devolvendo o valor no painel do Asaas. Isto só registra a decisão no
            histórico; não move dinheiro.
          </p>
        }
        reason="required"
        reasonLabel="O que foi feito (obrigatório)"
        confirmLabel="Marcar como tratado"
        onConfirm={reason => markPaymentReviewed(payment.payment_id, reason)}
        onDone={onDone}
      />
    </div>
  </li>
);

/** Payments that need a manual decision, on top of the payments screen. */
const PaymentsAttention: React.FC = () => {
  const attention = useAsync(listPaymentsNeedingAttention, 'attention');
  const payments = attention.data?.payments ?? [];

  return (
    <section aria-labelledby="exigem-atencao" className="space-y-3">
      <div>
        <h2 id="exigem-atencao" className="text-lg font-bold text-gray-800">
          Exigem atenção
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Reembolsos que o Asaas recusou e pagamentos recebidos depois do cancelamento do atendimento. Somem da lista quando o reembolso
          é concluído ou quando você marca como tratado, com o motivo.
        </p>
      </div>
      <ErrorAlert error={attention.error} />
      {attention.loading && !attention.data && <p role="status" className="text-sm text-gray-500">Carregando pagamentos que exigem atenção…</p>}
      {attention.data && payments.length === 0 && <EmptyState>Nenhum pagamento exige ação manual agora.</EmptyState>}
      {payments.length > 0 && (
        <ul className="space-y-3" aria-label="Pagamentos que exigem atenção">
          {payments.map(payment => (
            <Item key={payment.payment_id} payment={payment} onDone={attention.reload} />
          ))}
        </ul>
      )}
      {attention.data?.truncated && (
        <p role="note" className="text-sm text-amber-800">
          Há mais de {ATTENTION_LIMIT} registros abertos; a lista mostra os mais recentes. Trate estes para ver os outros.
        </p>
      )}
    </section>
  );
};

export default PaymentsAttention;
