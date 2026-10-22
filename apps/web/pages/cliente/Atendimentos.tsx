import React from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { findOccupation } from '../../catalog';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { formatCents } from '../../lib/money';
import { useAsync } from '../../lib/useAsync';
import { listMyBookings } from '../../services/bookings';
import BackendNotice from '../../components/BackendNotice';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import RequireSession from '../../components/RequireSession';
import BookingStatusBadge from '../../components/cliente/BookingStatusBadge';
import { formatPeriod } from '../../components/cliente/format';

const BookingList: React.FC<{ userId: string }> = ({ userId }) => {
  const bookings = useAsync(() => listMyBookings(userId), userId);

  if (bookings.loading && !bookings.data) return <PageStatus />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Meus atendimentos</h1>
        <p className="text-sm text-gray-500 mt-1">Horários no fuso de Brasília.</p>
      </header>
      <ErrorAlert error={bookings.error} />
      {bookings.data && bookings.data.length === 0 && (
        <div className="text-sm text-gray-600 bg-white border border-gray-100 rounded-2xl p-5 space-y-3">
          <p>Você ainda não tem atendimentos. Eles aparecem aqui quando você aceita uma proposta ou agenda direto com um profissional.</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/pedido" className="font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700">
              Fazer um pedido
            </Link>
            <Link to="/categorias" className="font-semibold bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl hover:bg-gray-50">
              Ver categorias
            </Link>
          </div>
        </div>
      )}
      <ul className="space-y-3">
        {(bookings.data ?? []).map(booking => (
          <li key={booking.id}>
            <Link
              to={`/atendimentos/${booking.id}`}
              className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 shadow-xs hover:shadow-md transition-shadow"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <BookingStatusBadge status={booking.status} />
                  {booking.role === 'provider' && <span className="text-xs font-bold px-2 py-0.5 rounded-sm bg-purple-100 text-purple-800">Como profissional</span>}
                </div>
                <p className="font-bold text-gray-900 break-words">{findOccupation(booking.occupation_slug)?.name ?? booking.occupation_slug}</p>
                {booking.counterpart_name && (
                  <p className="text-sm text-gray-600 break-words">
                    {booking.role === 'provider' ? 'Cliente' : 'Profissional'}: {booking.counterpart_name}
                  </p>
                )}
                <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-1">
                  <CalendarDays size={14} className="shrink-0" aria-hidden="true" /> {formatPeriod(booking.when)}
                </p>
                {booking.price_cents > 0 && <p className="text-sm font-semibold text-gray-800 mt-1">{formatCents(booking.price_cents)}</p>}
              </div>
              <ChevronRight size={18} className="text-gray-400 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

const Atendimentos: React.FC = () => {
  const auth = useAuth();
  if (!backendEnabled || auth.mode !== 'backend') {
    return (
      <BackendNotice title="Atendimentos online ainda não disponíveis">
        <p>Nesta versão de demonstração, os atendimentos não ficam guardados no app.</p>
        <p>
          O painel de demonstração continua em <Link to="/dashboard" className="text-primary underline">Meus Pedidos</Link>, com
          dados fictícios.
        </p>
      </BackendNotice>
    );
  }
  return (
    <RequireSession>
      <BookingList userId={auth.authUser?.id ?? ''} />
    </RequireSession>
  );
};

export default Atendimentos;
