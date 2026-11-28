import { useState } from 'react';
import ErrorAlert from '../../ErrorAlert';
import { downloadJson } from '../../../lib/download';
import { formatCents } from '../../../lib/money';
import { formatDateBR, todayInSaoPaulo } from '../../../lib/timezone';
import { useAsync } from '../../../lib/useAsync';
import {
  business,
  type Invoice,
  type InvoiceLine,
  type InvoiceLineKind,
  type OrgAccount,
  type OrgReport,
} from '../../../services/rideBusiness';
import { formatDateTime } from '../../admin/format';
import { Field } from '../../admin/ui';
import { useAction } from '../safety/state';
import { card, cardTitle, field, hint, monthName, primary, secondary } from './shared';

const KINDS: Record<InvoiceLineKind, string> = {
  voucher: 'Voucher de viagem',
  refund: 'Estorno',
  adjustment: 'Ajuste',
  personal_topup: 'Complemento pessoal',
};
const DISPUTES = { open: 'Contestação em análise', accepted: 'Contestação aceita', rejected: 'Contestação recusada' };
const cell = 'px-2 py-1.5 text-left align-top';
const amount = 'px-2 py-1.5 text-right align-top whitespace-nowrap';

const center = (code: string | null, label: string | null) => (code ? code + (label ? ' · ' + label : '') : 'Sem centro de custo');

function Report({ report, month }: { report: OrgReport; month: string }) {
  if (!report.rows.length)
    return <p>Nenhum valor pago ou reservado pela empresa em {monthName(month)}. Escolha outra competência para consultar.</p>;
  return (
    <>
      <p role="status" className="font-semibold">
        Voucher {formatCents(report.voucher_cents)} · Estornos {formatCents(report.refunded_cents)} · Líquido{' '}
        {formatCents(report.voucher_cents - report.refunded_cents)}
        {report.reserved_cents > 0 && ` · Reservado e ainda não usado ${formatCents(report.reserved_cents)}`}
      </p>
      {report.by_cost_center.length > 0 && (
        <div>
          <h3 className="font-semibold">Líquido por centro de custo</h3>
          <ul className="text-sm">
            {report.by_cost_center.map((item) => (
              <li key={item.cost_center ?? ''}>
                {center(item.cost_center, item.cost_center_label)}: {formatCents(item.net_cents)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Viagens pela empresa em {monthName(month)}</caption>
          <thead>
            <tr className="border-b border-gray-200">
              <th scope="col" className={cell}>
                Data da viagem
              </th>
              <th scope="col" className={cell}>
                Centro de custo
              </th>
              <th scope="col" className={cell}>
                Pessoa
              </th>
              <th scope="col" className={cell}>
                Categoria
              </th>
              <th scope="col" className={amount}>
                Voucher
              </th>
              <th scope="col" className={amount}>
                Estornado
              </th>
              <th scope="col" className={amount}>
                Reservado
              </th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row, index) => (
              <tr key={index} className="border-b border-gray-100">
                <td className={cell}>{formatDateBR(row.date)}</td>
                <td className={cell}>{center(row.cost_center, row.cost_center_label)}</td>
                <td className={cell}>{row.member}</td>
                <td className={cell}>{row.ride_class ?? '—'}</td>
                <td className={amount}>{formatCents(row.voucher_cents)}</td>
                <td className={amount}>{formatCents(row.refunded_cents)}</td>
                <td className={amount}>{formatCents(row.reserved_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={hint}>
        Voucher e estorno entram no mês em que o dinheiro se moveu. O reservado é o voucher de uma viagem deste mês que
        ainda não foi usado: não é despesa e não entra na fatura.
      </p>
    </>
  );
}

function Line({ line, refresh }: { line: InvoiceLine; refresh: () => void }) {
  const action = useAction(refresh);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const id = 'contestar-' + line.id;
  const name = KINDS[line.kind] ?? line.kind;
  return (
    <li className="space-y-2 border-l-2 border-primary/30 pl-3">
      <p>
        <strong>{name}</strong> · {formatCents(line.cents)} · {formatDateTime(line.occurred_at)}
        {!line.billable && ' · informativo, fora do total'}
      </p>
      <p className={hint}>
        {center(line.cost_center, line.cost_center_label)} · {line.member}
      </p>
      {line.dispute ? (
        <p>
          {DISPUTES[line.dispute.status] ?? line.dispute.status}
          {line.dispute.decision && ' · ' + line.dispute.decision}
          {line.dispute.status === 'accepted' && ' · o crédito entra como ajuste na próxima fatura.'}
        </p>
      ) : open ? (
        <div className="space-y-2">
          <Field id={id} label={'Motivo da contestação de ' + name} hint="Até 280 caracteres. O financeiro WorkEasy responde neste item.">
            <textarea
              id={id}
              className={field}
              rows={3}
              maxLength={280}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={primary}
              disabled={action.busy || !reason.trim()}
              onClick={() =>
                void action.run('dispute:' + line.id + ':' + reason.trim(), async (key) => {
                  await business.dispute(line.id, reason.trim(), key);
                  setOpen(false);
                  return 'Contestação registrada. A fatura fechada não muda: se for aceita, o crédito entra na próxima.';
                })
              }
            >
              Enviar contestação
            </button>
            <button type="button" className={secondary} disabled={action.busy} onClick={() => setOpen(false)}>
              Voltar
            </button>
          </div>
        </div>
      ) : (
        // Only a charge is contested: credits and the rider's own complement are not billed to the company.
        line.kind === 'voucher' && (
          <button type="button" className="text-sm text-primary underline" onClick={() => setOpen(true)}>
            Contestar este item
          </button>
        )
      )}
      {action.message}
    </li>
  );
}

function ClosedInvoice({ summary, month }: { summary: NonNullable<OrgReport['invoice']>; month: string }) {
  const [open, setOpen] = useState(false);
  const detail = useAsync<Invoice | null>(() => (open ? business.invoice(summary.id) : Promise.resolve(null)), summary.id + ':' + open);
  const exporting = useAction();
  const invoice = detail.data;
  return (
    <>
      <p>
        Fechada em {formatDateTime(summary.closed_at)} (São Paulo) · Total <strong>{formatCents(summary.total_cents)}</strong>
      </p>
      <div className="flex flex-wrap gap-3">
        {!open && (
          <button type="button" className={primary} onClick={() => setOpen(true)}>
            Ver composição da fatura
          </button>
        )}
        <button
          type="button"
          className={secondary}
          disabled={exporting.busy}
          onClick={() =>
            void exporting.run('export:' + summary.id, async () => {
              downloadJson(await business.exportInvoice(summary.id), 'fatura-corridas-' + month + '.json');
              return 'Arquivo da fatura gerado, sem endereços nem trajetos.';
            })
          }
        >
          Exportar fatura
        </button>
      </div>
      {exporting.message}
      {open && !invoice && detail.loading && <p role="status">Carregando composição…</p>}
      <ErrorAlert error={detail.error} />
      {invoice &&
        (invoice.lines.length ? (
          <ul className="space-y-4">
            {invoice.lines.map((line) => (
              <Line key={line.id} line={line} refresh={detail.reload} />
            ))}
          </ul>
        ) : (
          <p>Esta fatura fechou sem itens.</p>
        ))}
    </>
  );
}

/** Monthly report and invoice of an organization, for the roles that answer for its costs. */
export default function Invoices({ account }: { account: OrgAccount }) {
  const [current] = useState(() => todayInSaoPaulo().slice(0, 7));
  const [month, setMonth] = useState(current);
  const valid = /^\d{4}-\d{2}$/.test(month);
  const result = useAsync<OrgReport | null>(
    () => (valid ? business.report(account.id, month + '-01') : Promise.resolve(null)),
    account.id + ':' + month,
  );
  const report = result.data;
  return (
    <>
      <section className={card} aria-labelledby="empresa-relatorio">
        <h2 id="empresa-relatorio" className={cardTitle}>
          Relatório mensal
        </h2>
        <Field id="relatorio-mes" label="Competência" className="max-w-xs">
          <input
            id="relatorio-mes"
            className={field}
            type="month"
            value={month}
            max={current}
            onChange={(event) => setMonth(event.target.value)}
          />
        </Field>
        <p className={hint}>
          O relatório traz só o que a empresa pagou. Endereços, trajetos e o complemento pago por quem viajou não
          aparecem.
        </p>
        {!report && result.loading && <p role="status">Carregando relatório…</p>}
        <ErrorAlert error={result.error} />
        {report && <Report report={report} month={month} />}
      </section>
      {report && (
        <section className={card} aria-labelledby="empresa-fatura">
          <h2 id="empresa-fatura" className={cardTitle}>
            Fatura de {monthName(month)}
          </h2>
          {report.invoice ? (
            <ClosedInvoice key={report.invoice.id} summary={report.invoice} month={month} />
          ) : (
            <p>
              {month >= current
                ? 'A fatura de um mês só é fechada depois que ele termina. Até lá os valores do relatório podem mudar.'
                : 'Esta competência ainda não foi fechada pelo financeiro WorkEasy. Os valores do relatório podem mudar até o fechamento.'}{' '}
              Estornos posteriores entram como crédito na fatura do mês em que ocorrerem.
            </p>
          )}
        </section>
      )}
    </>
  );
}
