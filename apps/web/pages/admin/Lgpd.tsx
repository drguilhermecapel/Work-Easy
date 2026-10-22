import React, { useState } from 'react';
import { formatDateTime, shortId } from '../../components/admin/format';
import { DATA_REQUEST_KIND_LABELS, DATA_REQUEST_STATUS_LABELS, DATA_REQUEST_STATUS_STYLES } from '../../components/admin/labels';
import { inputClass } from '../../components/admin/styles';
import { Badge, EmptyState, Field, Pager } from '../../components/admin/ui';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { useAsync } from '../../lib/useAsync';
import { DATA_REQUEST_STATUSES, listDataRequests, type DataRequestStatus } from '../../services/admin';

const Lgpd: React.FC = () => {
  const [status, setStatus] = useState<DataRequestStatus | ''>('');
  const [page, setPage] = useState(0);
  const requests = useAsync(() => listDataRequests({ status, page }), `${status}|${page}`);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Solicitações de dados (LGPD)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Pedidos de cópia e de exclusão feitos pelos próprios usuários em Minha conta. Somente leitura: as funções do servidor atendem os pedidos e
          mudam a situação.
        </p>
      </header>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 max-w-xs">
        <Field id="lgpd-status" label="Situação">
          <select
            id="lgpd-status"
            className={inputClass}
            value={status}
            onChange={e => {
              setStatus(e.target.value as DataRequestStatus | '');
              setPage(0);
            }}
          >
            <option value="">Todas</option>
            {DATA_REQUEST_STATUSES.map(value => (
              <option key={value} value={value}>
                {DATA_REQUEST_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <ErrorAlert error={requests.error} />
      {requests.loading && !requests.data && <PageStatus />}
      {requests.data && requests.data.rows.length === 0 && <EmptyState>Nenhuma solicitação encontrada.</EmptyState>}
      {requests.data && (
        <ul className="space-y-3">
          {requests.data.rows.map(row => (
            <li key={row.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge className={DATA_REQUEST_STATUS_STYLES[row.status]}>{DATA_REQUEST_STATUS_LABELS[row.status]}</Badge>
                <span className="text-xs text-gray-500">Pedido em {formatDateTime(row.created_at)}</span>
              </div>
              <p className="font-semibold text-gray-900">{DATA_REQUEST_KIND_LABELS[row.kind]}</p>
              <dl className="text-sm text-gray-700 mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-gray-500">Usuário</dt>
                <dd className="break-words" title={row.user_id ?? ''}>
                  {row.user_id ? `${row.user_name ?? 'Conta sem nome'} (${shortId(row.user_id)})` : 'Conta já anonimizada'}
                </dd>
                {row.completed_at && (
                  <>
                    <dt className="text-gray-500">Concluída em</dt>
                    <dd>{formatDateTime(row.completed_at)}</dd>
                  </>
                )}
                {row.result_path && (
                  <>
                    <dt className="text-gray-500">Resultado</dt>
                    <dd>Arquivo gerado</dd>
                  </>
                )}
              </dl>
              {row.status === 'failed' && (
                <p className="text-sm text-red-700 mt-2">Este pedido não terminou. Confira o histórico de auditoria e fale com o usuário.</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {requests.data && <Pager page={page} hasMore={requests.data.hasMore} onPage={setPage} busy={requests.loading} />}
    </div>
  );
};

export default Lgpd;
