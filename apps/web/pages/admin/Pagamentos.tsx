import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatDateTime, shortId } from '../../components/admin/format';
import PaymentsAttention from '../../components/admin/PaymentsAttention';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from '../../components/admin/labels';
import { inputClass, linkClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Badge, EmptyState, Field, Pager } from '../../components/admin/ui';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { formatCents } from '../../lib/money';
import { formatDateBR } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { listPayments, PAYMENT_STATUSES, type AdminPaymentStatus } from '../../services/admin';

interface Filters {
  status: AdminPaymentStatus | '';
  from: string;
  to: string;
}

const NO_FILTERS: Filters = { status: '', from: '', to: '' };

const Pagamentos: React.FC = () => {
  const [draft, setDraft] = useState<Filters>(NO_FILTERS);
  const [applied, setApplied] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(0);
  // /admin/pagamentos?pagamento=<id> (the link of "Exigem atenção") shows only that payment
  const [params, setParams] = useSearchParams();
  const only = params.get('pagamento')?.trim() ?? '';
  const payments = useAsync(() => listPayments({ ...applied, id: only, page }), `${only}|${applied.status}|${applied.from}|${applied.to}|${page}`);

  const apply = (event: React.FormEvent) => {
    event.preventDefault();
    setApplied(draft);
    setPage(0);
  };
  const clear = () => {
    setDraft(NO_FILTERS);
    setApplied(NO_FILTERS);
    setPage(0);
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Pagamentos</h1>
        <p className="text-sm text-gray-500 mt-1">Cobranças feitas pelo app, da mais nova para a mais antiga. Datas no fuso de Brasília.</p>
      </header>

      <PaymentsAttention />

      {only && (
        <p role="status" className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-900">
          Mostrando só o pagamento {shortId(only)}.{' '}
          <button type="button" className={linkClass} onClick={() => setParams({})}>
            Ver todos os pagamentos
          </button>
        </p>
      )}

      <form onSubmit={apply} aria-label="Filtros de pagamentos" className="bg-white border border-gray-100 rounded-2xl p-4 grid gap-3 sm:grid-cols-3">
        <Field id="pag-status" label="Situação">
          <select
            id="pag-status"
            className={inputClass}
            value={draft.status}
            onChange={e => setDraft({ ...draft, status: e.target.value as Filters['status'] })}
          >
            <option value="">Todas</option>
            {PAYMENT_STATUSES.map(status => (
              <option key={status} value={status}>
                {PAYMENT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field id="pag-de" label="De">
          <input id="pag-de" type="date" className={inputClass} value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })} />
        </Field>
        <Field id="pag-ate" label="Até">
          <input id="pag-ate" type="date" className={inputClass} value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-3">
          <button type="submit" className={primaryButton}>
            Filtrar
          </button>
          <button type="button" className={secondaryButton} onClick={clear}>
            Limpar filtros
          </button>
        </div>
      </form>

      <ErrorAlert error={payments.error} />
      {payments.loading && !payments.data && <PageStatus />}
      {payments.data && payments.data.rows.length === 0 && <EmptyState>Nenhum pagamento encontrado com estes filtros.</EmptyState>}
      {payments.data && (
        <ul className="space-y-3">
          {payments.data.rows.map(payment => (
            <li key={payment.id} className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Badge className={PAYMENT_STATUS_STYLES[payment.status]}>{PAYMENT_STATUS_LABELS[payment.status]}</Badge>
                <span className="text-xs text-gray-500">{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</span>
                {payment.escrow && <Badge className="bg-indigo-100 text-indigo-800">Retido</Badge>}
              </div>
              <p className="text-lg font-bold text-gray-900">{formatCents(payment.amount_cents)}</p>
              <dl className="text-sm text-gray-700 mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                <dt className="text-gray-500">Comissão</dt>
                <dd>{payment.platform_fee_cents > 0 ? formatCents(payment.platform_fee_cents) : 'Sem comissão'}</dd>
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
                <dt className="text-gray-500">{payment.booking_id ? 'Atendimento' : 'Orçamento'}</dt>
                <dd title={payment.booking_id ?? payment.quote_id ?? ''}>{shortId(payment.booking_id ?? payment.quote_id) || '—'}</dd>
                <dt className="text-gray-500">Criado em</dt>
                <dd>{formatDateTime(payment.created_at)}</dd>
                {payment.due_date && (
                  <>
                    <dt className="text-gray-500">Vencimento</dt>
                    <dd>{formatDateBR(payment.due_date)}</dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ul>
      )}
      {payments.data && <Pager page={page} hasMore={payments.data.hasMore} onPage={setPage} busy={payments.loading} />}
    </div>
  );
};

export default Pagamentos;
