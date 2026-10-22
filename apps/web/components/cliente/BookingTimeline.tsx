import React from 'react';
import type { BookingEventRow, BookingView } from '../../services/bookings';
import { BOOKING_STATUS_LABELS } from '../../pages/cliente/labels';
import { formatDateTime } from './format';

const actorLabel = (event: BookingEventRow, booking: BookingView, userId: string): string => {
  if (!event.actor_id) return 'Sistema';
  if (event.actor_id === userId) return 'Você';
  if (event.actor_id === booking.client_id) return 'Cliente';
  if (event.actor_id === booking.provider_id) return 'Profissional';
  return 'Administração';
};

/** Status history of a booking, oldest first, in São Paulo time. */
const BookingTimeline: React.FC<{ events: BookingEventRow[]; booking: BookingView; userId: string }> = ({ events, booking, userId }) => (
  <section aria-labelledby="atendimento-historico" className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs">
    <h2 id="atendimento-historico" className="font-bold text-gray-800 mb-3">Histórico</h2>
    {events.length === 0 ? (
      <p className="text-sm text-gray-500">Ainda não há registros.</p>
    ) : (
      <ol className="space-y-3 border-l-2 border-gray-100 pl-4">
        {events.map(event => (
          <li key={event.id} className="text-sm">
            <p className="font-medium text-gray-800">
              {event.from_status
                ? `${BOOKING_STATUS_LABELS[event.from_status]} → ${BOOKING_STATUS_LABELS[event.to_status]}`
                : `Criado como ${BOOKING_STATUS_LABELS[event.to_status].toLowerCase()}`}
            </p>
            <p className="text-xs text-gray-500">
              {actorLabel(event, booking, userId)} · {formatDateTime(event.at)}
            </p>
            {event.reason && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-line break-words">Motivo: {event.reason}</p>}
          </li>
        ))}
      </ol>
    )}
  </section>
);

export default BookingTimeline;
