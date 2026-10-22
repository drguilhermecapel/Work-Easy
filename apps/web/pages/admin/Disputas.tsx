import React from 'react';
import DisputeCard from '../../components/admin/DisputeCard';
import { EmptyState } from '../../components/admin/ui';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { useAsync } from '../../lib/useAsync';
import { listOpenDisputes } from '../../services/admin';

const Disputas: React.FC = () => {
  const disputes = useAsync(listOpenDisputes, 'disputes');
  if (disputes.loading && !disputes.data) return <PageStatus />;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Disputas abertas</h1>
        <p className="text-sm text-gray-500 mt-1">Atendimentos contestados pelo cliente. Toda decisão pede um motivo, que fica no histórico do atendimento.</p>
      </header>
      <ErrorAlert error={disputes.error} />
      {disputes.data && disputes.data.length === 0 && <EmptyState>Nenhuma disputa aberta.</EmptyState>}
      <ul className="space-y-4">
        {(disputes.data ?? []).map(dispute => (
          <li key={dispute.booking_id}>
            <DisputeCard dispute={dispute} onResolved={disputes.reload} />
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Disputas;
