import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, ExternalLink, QrCode, RefreshCw } from 'lucide-react';
import { AppError } from '../../lib/errors';
import { formatCents } from '../../lib/money';
import { formatDateBR, isDateOnly } from '../../lib/timezone';
import type { BookingView } from '../../services/bookings';
import { createCharge, isPaid, type PaymentCharge, type PaymentMethod, type PaymentRow } from '../../services/payments';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '../../pages/cliente/labels';
import ErrorAlert from '../ErrorAlert';
import { inputClass, primaryButton, secondaryButton } from './styles';

/** A charge to show, whether it just came from payments-create or from the payments table. */
interface ChargeView {
  method: PaymentRow['method'];
  amountCents: number;
  dueDate: string | null;
  invoiceUrl: string | null;
  pixPayload: string | null;
  qrBase64: string | null;
}

const fromCharge = (c: PaymentCharge): ChargeView => ({
  method: c.method,
  amountCents: c.amount_cents,
  dueDate: c.due_date,
  invoiceUrl: c.invoice_url,
  pixPayload: c.pix?.payload ?? null,
  qrBase64: c.pix?.qr_code_base64 ?? null,
});

const fromRow = (p: PaymentRow): ChargeView => ({
  method: p.method,
  amountCents: p.amount_cents,
  dueDate: p.due_date,
  invoiceUrl: p.invoice_url,
  pixPayload: p.pix_payload,
  qrBase64: p.pix_qr_code,
});

// Only an https link to the invoice page is opened; a QR code only if it is plain base64.
const safeInvoiceUrl = (url: string | null): string | null => (url && /^https:\/\//i.test(url) ? url : null);
const safeQr = (value: string | null): string | null => (value && /^[A-Za-z0-9+/=\s]+$/.test(value) ? value.replace(/\s/g, '') : null);

const METHODS: Array<{ value: PaymentMethod; hint: string }> = [
  { value: 'pix', hint: 'Código copia e cola e QR Code' },
  { value: 'credit_card', hint: 'Você digita o cartão na página do Asaas' },
  { value: 'boleto', hint: 'Fatura na página do Asaas' },
];

const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const ChargeDetails: React.FC<{ charge: ChargeView; today: string; onRefresh: () => void }> = ({ charge, today, onRefresh }) => {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const invoice = safeInvoiceUrl(charge.invoiceUrl);
  const qr = safeQr(charge.qrBase64);
  const overdue = charge.dueDate !== null && isDateOnly(charge.dueDate) && charge.dueDate < today;

  return (
    <div className="space-y-3 border border-gray-100 rounded-xl p-4 bg-gray-50">
      <p className="text-sm text-gray-800">
        <strong>{formatCents(charge.amountCents)}</strong> · {PAYMENT_METHOD_LABELS[charge.method]}
        {charge.dueDate && <> · {overdue ? 'venceu em' : 'vence em'} {formatDateBR(charge.dueDate)}</>}
      </p>
      {overdue && <p className="text-xs text-amber-800">Esta cobrança venceu. Gere uma nova abaixo.</p>}
      {charge.pixPayload && (
        <div className="space-y-2">
          <label htmlFor="pix-copia-cola" className="block text-xs font-medium text-gray-700">Pix copia e cola</label>
          <input
            id="pix-copia-cola"
            readOnly
            value={charge.pixPayload}
            className={`${inputClass} font-mono text-xs`}
            onFocus={event => event.currentTarget.select()}
          />
          <button
            type="button"
            className={secondaryButton}
            onClick={async () => setCopied((await copyText(charge.pixPayload ?? '')) ? 'yes' : 'no')}
          >
            {copied === 'yes' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} Copiar código
          </button>
          <p role="status" className="text-xs text-gray-600 min-h-4">
            {copied === 'yes' && 'Código copiado. Cole no app do seu banco.'}
            {copied === 'no' && 'Não foi possível copiar. Selecione o código acima e copie.'}
          </p>
        </div>
      )}
      {qr && (
        <img
          src={`data:image/png;base64,${qr}`}
          alt="QR Code do Pix para pagar este atendimento"
          className="w-40 h-40 bg-white border border-gray-200 rounded-lg p-1"
        />
      )}
      {!charge.pixPayload && !qr && charge.method === 'pix' && (
        <p className="text-xs text-gray-600 flex items-start gap-1.5">
          <QrCode size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
          O código Pix está na página da fatura.
        </p>
      )}
      {invoice && (
        <a href={invoice} target="_blank" rel="noopener noreferrer" className={`${secondaryButton} no-underline`}>
          <ExternalLink size={16} aria-hidden="true" /> Abrir fatura do Asaas
        </a>
      )}
      <div>
        <button type="button" className="text-xs text-primary underline inline-flex items-center gap-1" onClick={onRefresh}>
          <RefreshCw size={12} aria-hidden="true" /> Já paguei: atualizar situação
        </button>
      </div>
    </div>
  );
};

interface Props {
  booking: BookingView;
  payments: PaymentRow[];
  /** platform_settings.escrow_enabled */
  escrowEnabled: boolean;
  /** São Paulo calendar day when the data was read ("YYYY-MM-DD"). */
  today: string;
  onChanged: () => void;
}

const PaymentPanel: React.FC<Props> = ({ booking, payments, escrowEnabled, today, onChanged }) => {
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [askDocument, setAskDocument] = useState(false);
  const [charge, setCharge] = useState<PaymentCharge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const isClient = booking.role === 'client';
  // A held payment (escrow) is money already received: no new charge
  const paid = payments.find(p => isPaid(p) || p.status === 'held');
  const pending = payments.find(p => p.status === 'pending');
  const open = charge ? fromCharge(charge) : pending ? fromRow(pending) : null;
  const canPay = isClient && booking.origin === 'platform' && booking.status === 'accepted' && booking.price_cents > 0 && !paid;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setCharge(await createCharge({ bookingId: booking.id, method, cpfCnpj: askDocument ? cpfCnpj : undefined }));
      onChanged();
    } catch (err) {
      if (err instanceof AppError && err.code === 'cpf_cnpj_required') setAskDocument(true);
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (booking.origin !== 'platform') {
    body = <p className="text-sm text-gray-600">Este atendimento é combinado e cobrado diretamente com o profissional.</p>;
  } else if (paid) {
    const label = paid.status === 'held' && !escrowEnabled ? 'Pagamento recebido' : PAYMENT_STATUS_LABELS[paid.status];
    body = (
      <p role="status" className="text-sm text-green-800 bg-green-50 border border-green-100 rounded-lg p-3">
        {label} pelo app: {formatCents(paid.amount_cents)} ({PAYMENT_METHOD_LABELS[paid.method]}).
      </p>
    );
  } else if (booking.status === 'requested') {
    body = (
      <p className="text-sm text-gray-600">
        O pagamento pelo app fica disponível depois que o profissional aceitar o atendimento.
      </p>
    );
  } else if (canPay) {
    body = (
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-gray-700">
          Valor do atendimento: <strong>{formatCents(booking.price_cents)}</strong>
        </p>
        {open && <ChargeDetails charge={open} today={today} onRefresh={onChanged} />}
        <fieldset className="space-y-2 border-0 p-0 m-0">
          <legend className="text-sm font-medium text-gray-800 mb-1">{open ? 'Gerar outra cobrança' : 'Como você quer pagar?'}</legend>
          {METHODS.map(option => (
            <label key={option.value} className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
              <input
                type="radio"
                name="forma-pagamento"
                value={option.value}
                checked={method === option.value}
                onChange={() => setMethod(option.value)}
                className="mt-1"
              />
              <span>
                {PAYMENT_METHOD_LABELS[option.value]}
                <span className="block text-xs text-gray-500">{option.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {askDocument && (
          <div>
            <label htmlFor="pagamento-documento" className="block text-xs text-gray-600 mb-1">
              CPF ou CNPJ (só na primeira cobrança)
            </label>
            <input
              id="pagamento-documento"
              inputMode="numeric"
              autoComplete="off"
              className={inputClass}
              value={cpfCnpj}
              onChange={e => setCpfCnpj(e.target.value)}
              placeholder="Somente números"
            />
            <p className="text-xs text-gray-500 mt-1">Usado só para emitir a cobrança no Asaas.</p>
          </div>
        )}
        <ErrorAlert error={error} />
        {error instanceof AppError && error.code === 'profile_incomplete' && (
          <Link to="/conta" className="text-sm text-primary underline">Ir para Minha conta</Link>
        )}
        <button type="submit" className={primaryButton} disabled={busy || (askDocument && !cpfCnpj.trim())}>
          {busy ? 'Gerando…' : open ? 'Gerar nova cobrança' : 'Gerar cobrança'}
        </button>
        <p className="text-xs text-gray-500">
          {escrowEnabled
            ? 'Pagamento retido: o valor só é repassado ao profissional depois que o atendimento é concluído e liberado.'
            : 'O pagamento é feito pelo app, por Pix ou fatura do Asaas.'}{' '}
          Dados de cartão são digitados na página do Asaas, nunca aqui.
        </p>
      </form>
    );
  } else if (booking.status === 'canceled') {
    // Before the pending-charge branch: a charge left open at cancellation must not look payable
    body = (
      <p className="text-sm text-gray-600">
        Atendimento cancelado: não há pagamento a fazer.
        {pending && isClient && ' Se você chegou a gerar uma cobrança, não a pague.'}
      </p>
    );
  } else if (pending) {
    body = isClient ? (
      <ChargeDetails charge={fromRow(pending)} today={today} onRefresh={onChanged} />
    ) : (
      <p className="text-sm text-gray-600">Aguardando o pagamento do cliente.</p>
    );
  } else if (booking.status === 'accepted') {
    body = <p className="text-sm text-gray-600">O cliente ainda não gerou a cobrança deste atendimento.</p>;
  } else {
    body = <p className="text-sm text-gray-600">Nenhum pagamento pelo app foi registrado para este atendimento.</p>;
  }

  return (
    <section aria-labelledby="atendimento-pagamento" className="bg-white border border-gray-100 rounded-2xl p-5 shadow-xs space-y-3">
      <h2 id="atendimento-pagamento" className="font-bold text-gray-800">Pagamento</h2>
      {body}
    </section>
  );
};

export default PaymentPanel;
