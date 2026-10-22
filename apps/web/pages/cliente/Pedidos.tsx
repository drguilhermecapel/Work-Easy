import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { findOccupation } from '../../catalog';
import { useAuth } from '../../contexts/AuthContext';
import { backendEnabled } from '../../lib/supabase';
import { useAsync } from '../../lib/useAsync';
import { listMyRequests } from '../../services/requests';
import BackendNotice from '../../components/BackendNotice';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import RequireSession from '../../components/RequireSession';
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_STYLES, formatDate } from './labels';

const RequestList: React.FC<{ userId: string }> = ({ userId }) => {
  const requests = useAsync(() => listMyRequests(), userId);

  if (requests.loading && !requests.data) return <PageStatus />;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-800">Meus pedidos</h1>
        <Link to="/pedido" className="inline-flex items-center gap-1 text-sm font-semibold bg-primary text-white px-4 py-2.5 rounded-xl hover:bg-purple-700">
          <Plus size={16} aria-hidden="true" /> Novo pedido
        </Link>
      </header>
      <ErrorAlert error={requests.error} />
      {requests.data && requests.data.length === 0 && (
        <p className="text-sm text-gray-500 bg-white border border-gray-100 rounded-2xl p-5">
          Você ainda não fez pedidos. Conte o que precisa e receba propostas de profissionais que atendem o seu bairro.
        </p>
      )}
      <ul className="space-y-3">
        {(requests.data ?? []).map(request => (
          <li key={request.id}>
            <Link
              to={`/pedidos/${request.id}`}
              className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 shadow-xs hover:shadow-md transition-shadow"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-sm ${REQUEST_STATUS_STYLES[request.status]}`}>
                    {REQUEST_STATUS_LABELS[request.status]}
                  </span>
                  {request.urgent && <span className="text-xs font-bold px-2 py-0.5 rounded-sm bg-amber-100 text-amber-800">Urgente</span>}
                  <span className="text-xs text-gray-400">{formatDate(request.created_at)}</span>
                </div>
                <p className="font-bold text-gray-900">{findOccupation(request.occupation_slug)?.name ?? request.occupation_slug}</p>
                <p className="text-sm text-gray-500 truncate">{request.description}</p>
              </div>
              <ChevronRight size={18} className="text-gray-400 shrink-0" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

const Pedidos: React.FC = () => {
  const auth = useAuth();
  if (!backendEnabled || auth.mode !== 'backend') {
    return (
      <BackendNotice title="Pedidos online ainda não disponíveis">
        <p>Nesta versão de demonstração, os pedidos não ficam guardados no app.</p>
        <p>
          O painel de demonstração continua em <Link to="/dashboard" className="text-primary underline">Meus Pedidos</Link>, com
          dados fictícios.
        </p>
      </BackendNotice>
    );
  }
  return (
    <RequireSession>
      <RequestList userId={auth.authUser?.id ?? ''} />
    </RequireSession>
  );
};

export default Pedidos;
