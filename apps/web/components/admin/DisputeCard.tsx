import React from 'react';
import { Link } from 'react-router-dom';
import { findOccupation } from '../../catalog';
import { formatCents } from '../../lib/money';
import { parseTstzRange } from '../../lib/tstzrange';
import { useAsync } from '../../lib/useAsync';
import { resolveDispute, type AdminPaymentStatus, type DisputeRow } from '../../services/admin';
import { listBookingEvents, type BookingEventRow } from '../../services/bookings';
import ErrorAlert from '../ErrorAlert';
import { ActionButton } from './ConfirmAction';
import { formatDateTime, formatPeriod, shortId } from './format';
import { METRIC_STATUS_LABELS, PAYMENT_STATUS_LABELS } from './labels';
import { linkClass } from './styles';
import { Card } from './ui';

const actorLabel = (event: BookingEventRow, dispute: DisputeRow): string => {
  if (!event.actor_id) return 'Sistema';
  if (event.actor_id === dispute.client_id) return 'Cliente';
  if (event.actor_id === dispute.provider_id) return 'Profissional';
  return 'Administração';
};

const statusLabel = (status: string): string => METRIC_STATUS_LABELS[status] ?? status;

const Events: React.FC<{ dispute: DisputeRow }> = ({ dispute }) => {
  const events = useAsync(() => listBookingEvents(dispute.booking_id), dispute.booking_id);
  return (
    <div className="mt-3">
      <h4 className="text-sm font-semibold text-gray-800 mb-1">Eventos do atendimento</h4>
      <ErrorAlert error={events.error} />
      {events.loading && !events.data && <p role="status" className="text-sm text-gray-500">Carregando eventos…</p>}
      {events.data && events.data.length === 0 && <p className="text-sm text-gray-500">Sem eventos registrados.</p>}
      {events.data && events.data.length > 0 && (
        <ol className="space-y-2 border-l-2 border-gray-100 pl-3">
          {events.data.map(event => (
            <li key={event.id} className="text-sm">
              <p className="font-medium text-gray-800">
                {event.from_status ? `${statusLabel(event.from_status)} → ${statusLabel(event.to_status)}` : `Criado como ${statusLabel(event.to_status).toLowerCase()}`}
              </p>
              <p className="text-xs text-gray-500">
                {actorLabel(event, dispute)} · {formatDateTime(event.at)}
              </p>
              {event.reason && <p className="text-xs text-gray-700 whitespace-pre-line break-words">Motivo: {event.reason}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

const NO_MONEY = 'Isto muda a situação do atendimento. Devolução ou repasse de dinheiro depende de configuração do Asaas e não acontece por aqui.';

/** An open dispute with its booking, payments and event history, and the two ways to close it. */
const DisputeCard: React.FC<{ dispute: DisputeRow; onResolved: () => void }> = ({ dispute, onResolved }) => {
  const name = findOccupation(dispute.occupation_slug)?.name ?? dispute.occupation_slug;
  return (
    <Card>
      <h3 className="font-bold text-gray-900 break-words">{name}</h3>
      <dl className="text-sm text-gray-700 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-gray-500">Atendimento</dt>
        <dd className="break-all" title={dispute.booking_id}>{shortId(dispute.booking_id)}</dd>
        <dt className="text-gray-500">Cliente</dt>
        <dd className="break-words">{dispute.client_name ?? 'Conta sem nome'}</dd>
        <dt className="text-gray-500">Profissional</dt>
        <dd className="break-words">
          {dispute.provider_id ? (
            <Link to={`/admin/prestadores/${dispute.provider_id}`} className={linkClass}>
              {dispute.provider_name ?? 'Conta sem nome'}
            </Link>
          ) : (
            (dispute.provider_name ?? 'Conta sem nome')
          )}
        </dd>
        <dt className="text-gray-500">Horário</dt>
        <dd>{formatPeriod(parseTstzRange(dispute.period))}</dd>
        <dt className="text-gray-500">Valor</dt>
        <dd>
          {formatCents(dispute.price_cents)}
          {dispute.platform_fee_cents > 0 && ` (comissão ${formatCents(dispute.platform_fee_cents)})`}
        </dd>
        <dt className="text-gray-500">Origem</dt>
        <dd>{dispute.origin === 'platform' ? 'Pela plataforma' : 'Cliente próprio do profissional'}</dd>
        <dt className="text-gray-500">Pagamentos</dt>
        <dd>
          {dispute.payment_statuses.length === 0
            ? 'Nenhum pagamento pelo app'
            : dispute.payment_statuses.map(status => PAYMENT_STATUS_LABELS[status as AdminPaymentStatus] ?? status).join(', ')}
        </dd>
        {dispute.disputed_at && (
          <>
            <dt className="text-gray-500">Contestado em</dt>
            <dd>{formatDateTime(dispute.disputed_at)}</dd>
          </>
        )}
      </dl>

      <Events dispute={dispute} />

      <div className="flex flex-wrap gap-2 mt-4">
        <ActionButton
          label="Liberar a favor do profissional"
          tone="primary"
          title="Encerrar a contestação a favor do profissional"
          description={<p>O atendimento passa para Liberado. {NO_MONEY}</p>}
          reason="required"
          reasonLabel="Motivo da decisão (obrigatório)"
          confirmLabel="Liberar atendimento"
          onConfirm={reason => resolveDispute(dispute.booking_id, 'released', reason)}
          onDone={onResolved}
        />
        <ActionButton
          label="Cancelar a favor do cliente"
          tone="danger"
          title="Encerrar a contestação a favor do cliente"
          description={<p>O atendimento passa para Cancelado. {NO_MONEY}</p>}
          reason="required"
          reasonLabel="Motivo da decisão (obrigatório)"
          confirmLabel="Cancelar atendimento"
          onConfirm={reason => resolveDispute(dispute.booking_id, 'canceled', reason)}
          onDone={onResolved}
        />
      </div>
    </Card>
  );
};

export default DisputeCard;
