import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ListChecks, UserCheck } from 'lucide-react';
import FunnelSection from '../../components/admin/FunnelSection';
import { METRIC_ENTITY_LABELS, METRIC_STATUS_LABELS } from '../../components/admin/labels';
import { Card, EmptyState } from '../../components/admin/ui';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { useAsync } from '../../lib/useAsync';
import { getMetrics, groupMetrics, listOpenDisputes, listProviderQueue, METRIC_ENTITIES, type MetricRow } from '../../services/admin';

const MetricsTable: React.FC<{ title: string; rows: MetricRow[] }> = ({ title, rows }) => {
  const sum = (pick: (row: MetricRow) => number) => rows.reduce((total, row) => total + pick(row), 0);
  return (
    <Card>
      <h3 className="font-bold text-gray-800 mb-2">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">Nada registrado ainda.</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">{title} por situação</caption>
          <thead>
            <tr className="text-xs text-gray-500">
              <th scope="col" className="text-left font-medium py-1">Situação</th>
              <th scope="col" className="text-right font-medium py-1">Semana</th>
              <th scope="col" className="text-right font-medium py-1">Mês</th>
              <th scope="col" className="text-right font-medium py-1">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => (
              <tr key={row.status}>
                <th scope="row" className="text-left font-normal text-gray-700 py-1.5">{METRIC_STATUS_LABELS[row.status] ?? row.status}</th>
                <td className="text-right tabular-nums py-1.5">{row.this_week}</td>
                <td className="text-right tabular-nums py-1.5">{row.this_month}</td>
                <td className="text-right tabular-nums py-1.5 font-semibold">{row.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-gray-200 font-semibold text-gray-800">
              <th scope="row" className="text-left py-1.5">Soma</th>
              <td className="text-right tabular-nums py-1.5">{sum(r => r.this_week)}</td>
              <td className="text-right tabular-nums py-1.5">{sum(r => r.this_month)}</td>
              <td className="text-right tabular-nums py-1.5">{sum(r => r.total)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </Card>
  );
};

const Pending: React.FC = () => {
  const queue = useAsync(listProviderQueue, 'queue');
  const disputes = useAsync(listOpenDisputes, 'disputes');
  const toApprove = queue.data?.reduce((total, row) => total + row.occupations_to_approve, 0);
  const items = [
    { to: '/admin/prestadores', icon: UserCheck, label: 'Prestadores na fila', state: queue, value: queue.data?.length, noun: 'na fila' },
    { to: '/admin/prestadores', icon: ListChecks, label: 'Ocupações a aprovar', state: queue, value: toApprove, noun: 'a aprovar' },
    { to: '/admin/disputas', icon: AlertTriangle, label: 'Disputas abertas', state: disputes, value: disputes.data?.length, noun: 'abertas' },
  ];
  return (
    <section aria-labelledby="admin-pendencias" className="space-y-3">
      <h2 id="admin-pendencias" className="text-lg font-bold text-gray-800">Pendências</h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map(({ to, icon: Icon, label, state, value, noun }) => (
          <li key={label}>
            <Link to={to} className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl p-4 shadow-xs hover:shadow-md transition-shadow">
              <Icon size={20} className="text-primary shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-gray-600">{label}</span>
                <span className="block text-2xl font-bold text-gray-900 tabular-nums">
                  {value !== undefined ? value : state.error ? '—' : '…'}
                </span>
              </span>
              {value !== undefined && value > 0 && <span className="sr-only">{value} {noun}</span>}
            </Link>
          </li>
        ))}
      </ul>
      <ErrorAlert error={queue.error ?? disputes.error} />
    </section>
  );
};

const Painel: React.FC = () => {
  const metrics = useAsync(getMetrics, 'metrics');
  if (metrics.loading && !metrics.data) return <PageStatus />;
  const grouped = groupMetrics(metrics.data ?? []);
  const empty = metrics.data !== undefined && metrics.data.length === 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Painel</h1>
        <p className="text-sm text-gray-500 mt-1">Pendências, funil de operação e contagens por situação. Semana (segunda a domingo) e mês no fuso de Brasília.</p>
      </header>
      <ErrorAlert error={metrics.error} />
      <Pending />
      {empty && <EmptyState>Ainda não há pedidos, atendimentos nem prestadores para contar.</EmptyState>}
      {!empty && metrics.data && (
        <>
          <FunnelSection rows={metrics.data} />
          <section aria-labelledby="painel-contagens" className="space-y-3">
            <h2 id="painel-contagens" className="text-lg font-bold text-gray-800">Contagens por situação</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {METRIC_ENTITIES.map(entity => (
                <MetricsTable key={entity} title={METRIC_ENTITY_LABELS[entity]} rows={grouped[entity]} />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default Painel;
