import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { findOccupation } from '../../catalog';
import { formatDateTime, shortId } from '../../components/admin/format';
import { inputClass, primaryButton, secondaryButton } from '../../components/admin/styles';
import { Badge, EmptyState, Field, Pager } from '../../components/admin/ui';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import { useAsync } from '../../lib/useAsync';
import { REPORT_STATUSES, RESOLUTION_NOTE_MAX, listReports, resolveReport, type ReportRow, type ReportStatus } from '../../services/admin';
import { REPORT_REASON_LABELS, type ReportReason } from '../../services/safety';

const STATUS_LABELS: Record<ReportStatus, string> = { open: 'Aberta', actioned: 'Com providência', dismissed: 'Arquivada' };
const STATUS_STYLES: Record<ReportStatus, string> = {
  open: 'bg-amber-100 text-amber-800',
  actioned: 'bg-green-100 text-green-800',
  dismissed: 'bg-gray-100 text-gray-700',
};
const TARGET_LABELS: Record<ReportRow['target_type'], string> = { provider: 'Perfil de profissional', review: 'Avaliação', request: 'Pedido de cliente' };

const targetTitle = (row: ReportRow): string => {
  if (!row.target_label) return 'Conteúdo já removido';
  if (row.target_type === 'request') return findOccupation(row.target_label)?.name ?? row.target_label;
  return row.target_type === 'review' ? `Avaliação de ${row.target_label}` : row.target_label;
};

const ReportCard: React.FC<{ row: ReportRow; onChanged: () => void }> = ({ row, onChanged }) => {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const close = async (status: 'actioned' | 'dismissed') => {
    setBusy(true);
    setError(null);
    try {
      await resolveReport(row.id, status, note);
      onChanged();
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  };

  return (
    <li className="bg-white border border-gray-100 rounded-2xl p-4 shadow-xs space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={STATUS_STYLES[row.status]}>{STATUS_LABELS[row.status]}</Badge>
        <span className="text-xs text-gray-500">
          {TARGET_LABELS[row.target_type]} · {formatDateTime(row.created_at)}
        </span>
        {row.open_reports_on_target > 1 && (
          <Badge className="bg-red-100 text-red-800">{row.open_reports_on_target} denúncias abertas sobre o mesmo conteúdo</Badge>
        )}
      </div>
      <p className="font-semibold text-gray-900 break-words">{targetTitle(row)}</p>
      {row.target_text && (
        <blockquote className="text-sm text-gray-700 border-l-4 border-gray-200 pl-3 whitespace-pre-line break-words">{row.target_text}</blockquote>
      )}
      <dl className="text-sm text-gray-700 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
        <dt className="text-gray-500">Motivo</dt>
        <dd>{REPORT_REASON_LABELS[row.reason as ReportReason] ?? row.reason}</dd>
        {row.details && (
          <>
            <dt className="text-gray-500">Relato</dt>
            <dd className="whitespace-pre-line break-words">{row.details}</dd>
          </>
        )}
        <dt className="text-gray-500">Quem denunciou</dt>
        <dd>{row.reporter_id ? shortId(row.reporter_id) : 'Conta já excluída'}</dd>
        {row.resolution_note && (
          <>
            <dt className="text-gray-500">Anotação</dt>
            <dd className="whitespace-pre-line break-words">{row.resolution_note}</dd>
          </>
        )}
        {row.resolved_at && (
          <>
            <dt className="text-gray-500">Encerrada em</dt>
            <dd>{formatDateTime(row.resolved_at)}</dd>
          </>
        )}
      </dl>
      {row.target_user_id && row.target_type !== 'request' && (
        <Link to={`/admin/prestadores/${row.target_type === 'provider' ? row.target_id : row.target_user_id}`} className="inline-block text-sm text-primary underline">
          Abrir o cadastro do profissional
        </Link>
      )}
      {row.status === 'open' && (
        <div className="space-y-2 pt-1">
          <Field id={`den-${row.id}-nota`} label="Anotação (opcional)" hint="O que foi feito, ou por que foi arquivada. Fica no histórico.">
            <textarea id={`den-${row.id}-nota`} className={inputClass} rows={2} maxLength={RESOLUTION_NOTE_MAX} value={note} onChange={e => setNote(e.target.value)} />
          </Field>
          <ErrorAlert error={error} />
          <div className="flex flex-wrap gap-2">
            <button type="button" className={primaryButton} disabled={busy} onClick={() => close('actioned')}>
              Encerrar com providência
            </button>
            <button type="button" className={secondaryButton} disabled={busy} onClick={() => close('dismissed')}>
              Arquivar sem providência
            </button>
          </div>
        </div>
      )}
    </li>
  );
};

const Denuncias: React.FC = () => {
  const [status, setStatus] = useState<ReportStatus | ''>('open');
  const [page, setPage] = useState(0);
  const reports = useAsync(() => listReports({ status, page }), `${status}|${page}`);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Denúncias</h1>
        <p className="text-sm text-gray-500 mt-1">
          O que os usuários denunciaram: perfis, avaliações e pedidos. Encerrar registra a decisão; para tirar uma avaliação do ar ou suspender
          um profissional, use as telas de Disputas e de Prestadores.
        </p>
      </header>

      <div className="bg-white border border-gray-100 rounded-2xl p-4 max-w-xs">
        <Field id="den-status" label="Situação">
          <select
            id="den-status"
            className={inputClass}
            value={status}
            onChange={e => {
              setStatus(e.target.value as ReportStatus | '');
              setPage(0);
            }}
          >
            <option value="">Todas</option>
            {REPORT_STATUSES.map(value => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <ErrorAlert error={reports.error} />
      {reports.loading && !reports.data && <PageStatus />}
      {reports.data && reports.data.rows.length === 0 && <EmptyState>Nenhuma denúncia nesta situação.</EmptyState>}
      {reports.data && (
        <ul className="space-y-3">
          {reports.data.rows.map(row => (
            <ReportCard key={row.id} row={row} onChanged={reports.reload} />
          ))}
        </ul>
      )}
      {reports.data && <Pager page={page} hasMore={reports.data.hasMore} onPage={setPage} busy={reports.loading} />}
    </div>
  );
};

export default Denuncias;
