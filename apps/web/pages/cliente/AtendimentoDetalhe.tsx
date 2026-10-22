import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, CheckCircle2, ChevronLeft } from 'lucide-react';
import { findOccupation, loadPolicies } from '../../catalog';
import { loadPublicSettings } from '../../config/features';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { formatCents } from '../../lib/money';
import { todayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { getBooking, listBookingEvents } from '../../services/bookings';
import { listBookingPayments } from '../../services/payments';
import { getBookingReview } from '../../services/reviews';
import BackendNotice from '../../components/BackendNotice';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import RequireSession from '../../components/RequireSession';
import BookingActions from '../../components/cliente/BookingActions';
import BookingStatusBadge from '../../components/cliente/BookingStatusBadge';
import BookingTimeline from '../../components/cliente/BookingTimeline';
import PaymentPanel from '../../components/cliente/PaymentPanel';
import ReviewPanel from '../../components/cliente/ReviewPanel';
import { formatPeriod } from '../../components/cliente/format';

const BookingDetail: React.FC<{ id: string; userId: string }> = ({ id, userId }) => {
  const result = useAsync(async () => {
    const booking = await getBooking(id, userId);
    const [events, payments, review, settings, policies] = await Promise.all([
      listBookingEvents(id),
      listBookingPayments(id),
      getBookingReview(id),
      loadPublicSettings(),
      loadPolicies(),
    ]);
    // Reference time taken when the data is read (keeps render pure)
    const loadedAt = Date.now();
    return {
      booking,
      events,
      payments,
      review,
      escrowEnabled: settings.escrowEnabled,
      publicRatings: policies[booking.occupation_slug]?.ratingRanking,
      loadedAt,
      today: todayInSaoPaulo(new Date(loadedAt)),
    };
  }, `${userId}:${id}`);
  const [notice, setNotice] = useState<string | null>(null);

  if (result.loading && !result.data) return <PageStatus />;
  if (!result.data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-4">
        <ErrorAlert error={result.error} />
        <Link to="/atendimentos" className="text-sm text-primary underline">Voltar para Meus atendimentos</Link>
      </div>
    );
  }

  const { booking, events, payments, review, escrowEnabled, publicRatings, loadedAt, today } = result.data;
  const refresh = () => result.reload();
  const occupationName = findOccupation(booking.occupation_slug)?.name ?? booking.occupation_slug;
  const counterpartLabel = booking.role === 'provider' ? 'Cliente' : 'Profissional';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <Link to="/atendimentos" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-primary">
        <ChevronLeft size={16} aria-hidden="true" /> Meus atendimentos
      </Link>

      <header className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <BookingStatusBadge status={booking.status} />
          {booking.origin === 'own' && <span className="text-xs font-bold px-2 py-0.5 rounded-sm bg-gray-100 text-gray-700">Cliente próprio do profissional</span>}
        </div>
        <h1 className="text-xl font-bold text-gray-800 break-words">{occupationName}</h1>
        {booking.counterpart_name && (
          <p className="text-sm text-gray-700 break-words">
            {counterpartLabel}: {booking.counterpart_name}
            {booking.counterpart_slug && booking.role === 'client' && (
              <>
                {' · '}
                <Link to={`/p/${booking.counterpart_slug}`} className="text-primary underline">Ver página</Link>
              </>
            )}
          </p>
        )}
        <p className="text-sm text-gray-700 flex items-center gap-1.5">
          <CalendarDays size={16} className="shrink-0 text-gray-400" aria-hidden="true" /> {formatPeriod(booking.when)}
        </p>
        <p className="text-xs text-gray-500">Horário de Brasília.</p>
        {booking.price_cents > 0 && <p className="text-lg font-bold text-gray-900">{formatCents(booking.price_cents)}</p>}
        {booking.notes && <p className="text-sm text-gray-600 whitespace-pre-line break-words">Observações: {booking.notes}</p>}
        {booking.canceled_reason && (
          <p className="text-sm text-gray-600 whitespace-pre-line break-words">Motivo do cancelamento: {booking.canceled_reason}</p>
        )}
      </header>

      {notice && (
        <div role="status" className="bg-green-50 border border-green-100 text-green-800 rounded-2xl p-4 text-sm flex items-center gap-2">
          <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" /> {notice}
        </div>
      )}
      <ErrorAlert error={result.error} />

      <BookingActions
        key={booking.status}
        booking={booking}
        now={loadedAt}
        onDone={message => {
          setNotice(message);
          refresh();
        }}
      />
      <PaymentPanel booking={booking} payments={payments} escrowEnabled={escrowEnabled} today={today} onChanged={refresh} />
      <ReviewPanel
        booking={booking}
        payments={payments}
        review={review}
        publicRatings={publicRatings}
        userId={userId}
        onSent={() => {
          setNotice('Avaliação enviada. Obrigado!');
          refresh();
        }}
      />
      <BookingTimeline events={events} booking={booking} userId={userId} />
    </div>
  );
};

const AtendimentoDetalhe: React.FC = () => {
  const auth = useAuth();
  const { id = '' } = useParams();
  if (!backendEnabled || auth.mode !== 'backend') {
    return (
      <BackendNotice title="Atendimentos online ainda não disponíveis">
        <p>Nesta versão de demonstração, os atendimentos não ficam guardados no app.</p>
      </BackendNotice>
    );
  }
  return (
    <RequireSession>
      <BookingDetail key={id} id={id} userId={auth.authUser?.id ?? ''} />
    </RequireSession>
  );
};

export default AtendimentoDetalhe;
