import React, { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatCents } from '../../lib/money';
import { buildFunnel, SUBSCRIPTION_STATUSES, type MetricRow } from '../../services/admin';
import type { ProviderStatus } from '../../services/types';
import { formatShare } from './format';
import { BOOKING_FUNNEL_LABELS, PROVIDER_STATUS_LABELS, SUBSCRIPTION_STATUS_LABELS } from './labels';
import { linkClass } from './styles';
import { Card } from './ui';

// The operating funnel of the panel: who offers the service, what is asked, what becomes a job and
// a payment, who pays for Pro. Every number comes from the view admin_metrics; where the database
// has nothing to count, the card says so instead of showing a row of zeros as if it were a result.

const PROVIDER_ORDER: ProviderStatus[] = ['draft', 'pending_review', 'approved', 'suspended'];

const Empty: React.FC<{ children: ReactNode }> = ({ children }) => <p className="text-sm text-gray-500">{children}</p>;

const FunnelCard: React.FC<{ title: string; note?: ReactNode; children: ReactNode }> = ({ title, note, children }) => (
  <Card>
    <h3 className="font-bold text-gray-800 mb-2">{title}</h3>
    {children}
    {note && <div className="text-xs text-gray-500 mt-3 space-y-1">{note}</div>}
  </Card>
);

const headCell = 'text-right font-medium py-1';
const numberCell = 'text-right tabular-nums py-1.5';

/** A small table: a label per row and one number per column. */
const FunnelTable: React.FC<{ caption: string; columns: string[]; rows: Array<{ label: string; cells: Array<string | number>; strong?: boolean }> }> = ({
  caption,
  columns,
  rows,
}) => (
  <table className="w-full text-sm">
    <caption className="sr-only">{caption}</caption>
    <thead>
      <tr className="text-xs text-gray-500">
        <th scope="col" className="text-left font-medium py-1">
          <span className="sr-only">Indicador</span>
        </th>
        {columns.map(column => (
          <th key={column} scope="col" className={headCell}>
            {column}
          </th>
        ))}
      </tr>
    </thead>
    <tbody className="divide-y divide-gray-100">
      {rows.map(row => (
        <tr key={row.label}>
          <th scope="row" className="text-left font-normal text-gray-700 py-1.5">
            {row.label}
          </th>
          {row.cells.map((cell, index) => (
            <td key={columns[index]} className={`${numberCell} ${row.strong || index === row.cells.length - 1 ? 'font-semibold' : ''}`}>
              {cell}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

const FunnelSection: React.FC<{ rows: MetricRow[] }> = ({ rows }) => {
  const funnel = buildFunnel(rows);
  const providerTotal = PROVIDER_ORDER.reduce((total, status) => total + funnel.providers[status], 0);
  const bookingTotal = funnel.bookings.reduce((total, row) => total + row.total, 0);
  const subscriberTotal = SUBSCRIPTION_STATUSES.reduce((total, status) => total + funnel.subscribers[status], 0);
  const { requests, requestsWithProposal, paymentsReceived } = funnel;

  return (
    <section aria-labelledby="painel-funil" className="space-y-3">
      <div>
        <h2 id="painel-funil" className="text-lg font-bold text-gray-800">
          Funil de operação
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Do cadastro ao pagamento, com o que está gravado no banco. Os períodos de 7 e 30 dias são os últimos dias corridos, e cada pedido, atendimento ou
          assinatura entra na data em que foi criado.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FunnelCard title="Prestadores">
          {providerTotal === 0 ? (
            <Empty>Nenhum prestador cadastrado ainda.</Empty>
          ) : (
            <FunnelTable
              caption="Funil: prestadores por situação"
              columns={['Total']}
              rows={PROVIDER_ORDER.map(status => ({ label: PROVIDER_STATUS_LABELS[status], cells: [funnel.providers[status]] }))}
            />
          )}
        </FunnelCard>

        <FunnelCard
          title="Pedidos"
          note={<p>&quot;Com pelo menos uma proposta&quot; conta o pedido que recebeu proposta de algum prestador, mesmo que ela tenha sido retirada depois.</p>}
        >
          {requests.total === 0 ? (
            <Empty>Nenhum pedido criado ainda.</Empty>
          ) : (
            <FunnelTable
              caption="Funil: pedidos e propostas recebidas"
              columns={['7 dias', '30 dias', 'Total']}
              rows={[
                { label: 'Pedidos criados', cells: [requests.last7, requests.last30, requests.total] },
                { label: 'Com pelo menos uma proposta', cells: [requestsWithProposal.last7, requestsWithProposal.last30, requestsWithProposal.total] },
                {
                  label: 'Parte com proposta',
                  cells: [
                    formatShare(requestsWithProposal.last7, requests.last7),
                    formatShare(requestsWithProposal.last30, requests.last30),
                    formatShare(requestsWithProposal.total, requests.total),
                  ],
                },
              ]}
            />
          )}
        </FunnelCard>

        <FunnelCard title="Atendimentos">
          {bookingTotal === 0 ? (
            <Empty>Nenhum atendimento criado ainda.</Empty>
          ) : (
            <FunnelTable
              caption="Funil: atendimentos por situação"
              columns={['30 dias', 'Total']}
              rows={funnel.bookings.map(row => ({ label: BOOKING_FUNNEL_LABELS[row.status], cells: [row.last30, row.total] }))}
            />
          )}
        </FunnelCard>

        <FunnelCard
          title="Pagamentos recebidos"
          note={
            <>
              <p>Conta os pagamentos Recebido, Retido e Repassado. Confirmado (ainda não creditado), Devolvido e os demais ficam de fora.</p>
              <p>O valor é o total pago pelos clientes, não a receita da WorkEasy: a assinatura Pro não entra nesta conta.</p>
            </>
          }
        >
          {paymentsReceived.count === 0 ? (
            <Empty>Nenhum pagamento recebido ainda.</Empty>
          ) : (
            <FunnelTable
              caption="Funil: pagamentos recebidos"
              columns={['Este mês', 'Total']}
              rows={[
                { label: 'Pagamentos', cells: [paymentsReceived.monthCount, paymentsReceived.count] },
                { label: 'Valor pago pelos clientes', cells: [formatCents(paymentsReceived.monthCents), formatCents(paymentsReceived.cents)] },
              ]}
            />
          )}
        </FunnelCard>

        <FunnelCard
          title="No limite do plano gratuito"
          note={
            <>
              <p>
                Conta quem está no plano gratuito e já enviou, neste mês, todas as propostas que o plano permite. Só envia outra no mês seguinte ou
                assinando o Pro. Com o limite em 0 (sem limite), ninguém chega a ele.
              </p>
              <p>
                <Link to="/admin/configuracoes" className={linkClass}>
                  Ver a configuração do limite
                </Link>
              </p>
            </>
          }
        >
          {funnel.atFreeLimit === 0 ? (
            <Empty>Nenhum prestador chegou ao limite neste mês.</Empty>
          ) : (
            <p className="text-3xl font-bold text-gray-900 tabular-nums">
              {funnel.atFreeLimit}{' '}
              <span className="text-sm font-normal text-gray-600">{funnel.atFreeLimit === 1 ? 'prestador no limite' : 'prestadores no limite'}</span>
            </p>
          )}
        </FunnelCard>

        <FunnelCard
          title="Assinantes do plano Pro"
          note={<p>Uma assinatura por prestador. &quot;Aguardando o primeiro pagamento&quot; é a assinatura criada que ainda não foi paga e não tem teste grátis.</p>}
        >
          {subscriberTotal === 0 ? (
            <Empty>Nenhuma assinatura Pro ainda.</Empty>
          ) : (
            <FunnelTable
              caption="Funil: assinaturas Pro por situação"
              columns={['Total']}
              rows={SUBSCRIPTION_STATUSES.map(status => ({ label: SUBSCRIPTION_STATUS_LABELS[status], cells: [funnel.subscribers[status]] }))}
            />
          )}
        </FunnelCard>
      </div>
    </section>
  );
};

export default FunnelSection;
