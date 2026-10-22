import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { findOccupation } from '../../catalog';
import { AppError } from '../../lib/errors';
import { formatCents } from '../../lib/money';
import { formatDateBR, todayInSaoPaulo } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import { createCharge, listMyPayments, type ChargeResult, type PaymentMethod, type PaymentRow } from '../../services/charges';
import { getMyPaymentAccount } from '../../services/proBilling';
import { listMyBookings, type BookingView } from '../../services/proAgenda';
import { listClients } from '../../services/proClients';
import { formatPeriodBR } from '../../services/proFormat';
import { listQuotes, type QuoteRow } from '../../services/quotes';
import { formatPhoneBR } from '../../lib/phone';
import ErrorAlert from '../../components/ErrorAlert';
import PageStatus from '../../components/PageStatus';
import PixBox from '../../components/pro/PixBox';
import ProPage from '../../components/pro/ProPage';
import { useProvider } from '../../components/pro/proContext';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES, PROVIDER_STATUS_HELP } from '../../components/pro/labels';
import { Badge, Card, EmptyState, Field, SectionTitle } from '../../components/pro/ui';
import { inputClass, linkClass, primaryButton } from '../../components/pro/styles';

const CHARGEABLE: BookingView['status'][] = ['accepted', 'in_progress', 'completed'];
/** Payments where the money came in: the item must not be charged again (charges-create refuses it too). */
const PAID: PaymentRow['status'][] = ['confirmed', 'received', 'held', 'released'];
const METHODS: PaymentMethod[] = ['pix', 'boleto', 'credit_card', 'undefined'];

const load = async (providerId: string) => {
  const [payments, account, bookings, quotes, clients] = await Promise.all([
    listMyPayments(providerId),
    getMyPaymentAccount(providerId),
    listMyBookings(providerId),
    listQuotes(providerId),
    listClients(providerId),
  ]);
  const paid = payments.filter(item => PAID.includes(item.status));
  const isPaid = (kind: 'booking_id' | 'quote_id', id: string) => paid.some(item => item[kind] === id);
  return {
    payments,
    accountActive: account?.status === 'active',
    bookings: bookings.filter(item => item.origin === 'own' && CHARGEABLE.includes(item.status) && !isPaid('booking_id', item.id)),
    quotes: quotes.filter(item => item.status === 'accepted' && !isPaid('quote_id', item.id)),
    clients,
    today: todayInSaoPaulo(),
  };
};

type Data = Awaited<ReturnType<typeof load>>;

const ChargeResultCard: React.FC<{ result: ChargeResult }> = ({ result }) => (
  <Card as="section" className="space-y-3">
    <h3 className="text-lg font-bold text-gray-800">{result.reused ? 'Cobrança já existente' : 'Cobrança criada'}</h3>
    <p className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
      <strong>{formatCents(result.amount_cents)}</strong> · {PAYMENT_METHOD_LABELS[result.method]}
      {result.due_date ? ` · vence em ${formatDateBR(result.due_date)}` : ''}
      <Badge className={PAYMENT_STATUS_STYLES[result.status]}>{PAYMENT_STATUS_LABELS[result.status]}</Badge>
    </p>
    {result.reused && <p className="text-xs text-gray-500">Já havia uma cobrança aberta para este item; ela foi mantida.</p>}
    <PixBox idPrefix="nova" pixPayload={result.pix?.payload ?? null} pixQrCode={result.pix?.qr_code_base64 ?? null} invoiceUrl={result.invoice_url} />
    {result.method === 'credit_card' && (
      <p className="text-xs text-gray-500">O cliente paga o cartão na página do Asaas. O WorkEasy não recebe nem guarda dados de cartão.</p>
    )}
  </Card>
);

const ChargeForm: React.FC<{ data: Data; initialTarget: string; onCreated: () => void }> = ({ data, initialTarget, onCreated }) => {
  const clientName = (id: string | null) => data.clients.find(client => client.id === id)?.name ?? '';
  const clientPhone = (id: string | null) => formatPhoneBR(data.clients.find(client => client.id === id)?.phone);
  const defaults = (target: string): { name: string; phone: string } => {
    const [kind, id] = target.split(':');
    if (kind === 'booking') {
      const booking = data.bookings.find(item => item.id === id);
      return { name: booking?.clientName ?? '', phone: clientPhone(booking?.provider_client_id ?? null) };
    }
    const quote = data.quotes.find(item => item.id === id);
    return { name: quote?.client_name ?? clientName(quote?.provider_client_id ?? null), phone: formatPhoneBR(quote?.client_phone) || clientPhone(quote?.provider_client_id ?? null) };
  };

  const [target, setTarget] = useState(initialTarget);
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [name, setName] = useState(() => defaults(initialTarget).name);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(() => defaults(initialTarget).phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<ChargeResult | null>(null);

  const pick = (value: string) => {
    setTarget(value);
    const next = defaults(value);
    setName(next.name);
    setPhone(next.phone);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const [kind, id] = target.split(':');
      if (!id || (kind !== 'booking' && kind !== 'quote')) throw new AppError('invalid_input', { message: 'Escolha o atendimento ou o orçamento a cobrar.' });
      if (!name.trim()) throw new AppError('invalid_input', { message: 'Informe o nome do cliente.' });
      setResult(
        await createCharge({
          target: { kind, id },
          method,
          dueDate,
          description,
          customer: { cpfCnpj, name, email, phone },
        }),
      );
      onCreated();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (data.bookings.length + data.quotes.length === 0) {
    return (
      <EmptyState>
        Nada a cobrar por aqui ainda. Crie um atendimento com cliente seu em <Link to="/pro/agenda" className={linkClass}>Agenda</Link> ou espere
        o cliente aceitar um orçamento em <Link to="/pro/orcamentos" className={linkClass}>Orçamentos</Link>.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="space-y-4" noValidate aria-label="Nova cobrança">
        <Field id="cob-alvo" label="O que cobrar">
          <select id="cob-alvo" className={inputClass} value={target} onChange={e => pick(e.target.value)}>
            <option value="">Escolha…</option>
            {data.bookings.length > 0 && (
              <optgroup label="Atendimentos com cliente seu">
                {data.bookings.map(item => (
                  <option key={item.id} value={`booking:${item.id}`}>
                    {`${item.clientName ?? 'Cliente'}, ${findOccupation(item.occupation_slug)?.name ?? item.occupation_slug}, ${formatPeriodBR(item.period)}, ${formatCents(item.price_cents)}`}
                  </option>
                ))}
              </optgroup>
            )}
            {data.quotes.length > 0 && (
              <optgroup label="Orçamentos aceitos">
                {data.quotes.map((item: QuoteRow) => (
                  <option key={item.id} value={`quote:${item.id}`}>
                    {`${item.title}, ${item.client_name ?? 'sem cliente'}, ${formatCents(item.total_cents)}`}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field id="cob-forma" label="Forma de pagamento">
            <select id="cob-forma" className={inputClass} value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>
              {METHODS.map(item => (
                <option key={item} value={item}>
                  {PAYMENT_METHOD_LABELS[item]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="cob-vencimento" label="Vencimento (opcional)" hint="Sem data, vence no dia seguinte.">
            <input id="cob-vencimento" type="date" min={data.today} className={inputClass} value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </Field>
        </div>
        <Field id="cob-descricao" label="Descrição na fatura (opcional)">
          <input id="cob-descricao" className={inputClass} maxLength={300} value={description} onChange={e => setDescription(e.target.value)} />
        </Field>
        <fieldset className="space-y-3 border border-gray-100 rounded-xl p-3">
          <legend className="text-sm font-medium text-gray-700 px-1">Quem paga</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field id="cob-nome" label="Nome do cliente">
              <input id="cob-nome" className={inputClass} value={name} onChange={e => setName(e.target.value)} />
            </Field>
            <Field id="cob-documento" label="CPF ou CNPJ do cliente" hint="O Asaas exige o documento para emitir a cobrança.">
              <input id="cob-documento" className={inputClass} inputMode="numeric" autoComplete="off" value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} />
            </Field>
            <Field id="cob-email" label="E-mail do cliente (opcional)">
              <input id="cob-email" className={inputClass} type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </Field>
            <Field id="cob-telefone" label="Celular do cliente (opcional)">
              <input id="cob-telefone" className={inputClass} type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
            </Field>
          </div>
        </fieldset>
        <p className="text-xs text-gray-500">
          A cobrança é feita na sua conta de recebimento no Asaas, sem taxa do WorkEasy. Cartão e boleto são pagos na página do Asaas: dados de
          cartão nunca passam pelo app.
        </p>
        <ErrorAlert error={error} />
        <button type="submit" className={primaryButton} disabled={busy}>
          {busy ? 'Criando…' : 'Criar cobrança'}
        </button>
      </form>
      {result && <ChargeResultCard result={result} />}
    </div>
  );
};

const PaymentItem: React.FC<{ payment: PaymentRow }> = ({ payment }) => (
  <Card as="li">
    <div className="flex flex-wrap items-center gap-2 mb-1">
      <span className="font-semibold text-gray-900">{formatCents(payment.amount_cents)}</span>
      <Badge className={PAYMENT_STATUS_STYLES[payment.status]}>{PAYMENT_STATUS_LABELS[payment.status]}</Badge>
      <span className="text-xs text-gray-500">{payment.quote_id ? 'Orçamento' : 'Atendimento'}</span>
    </div>
    <p className="text-sm text-gray-600">
      {PAYMENT_METHOD_LABELS[payment.method]}
      {payment.due_date ? ` · vence em ${formatDateBR(payment.due_date)}` : ''} · criada em {formatDateBR(payment.created_at)}
    </p>
    {payment.platform_fee_cents > 0 && (
      <p className="text-xs text-gray-500">Taxa da plataforma neste pagamento: {formatCents(payment.platform_fee_cents)}.</p>
    )}
    {payment.status === 'pending' && (payment.pix_payload || payment.invoice_url) && (
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-primary font-medium">Pix e link da fatura</summary>
        <div className="mt-3">
          <PixBox idPrefix={`pag-${payment.id}`} pixPayload={payment.pix_payload} pixQrCode={payment.pix_qr_code} invoiceUrl={payment.invoice_url} />
        </div>
      </details>
    )}
  </Card>
);

const Charges: React.FC = () => {
  const { provider } = useProvider();
  const [params] = useSearchParams();
  const approved = provider.status === 'approved';
  const isPro = provider.plan === 'pro';
  // A provider that is not approved never reads payments: the database refuses and the screen only explains
  const data = useAsync(() => (approved ? load(provider.id) : Promise.resolve(null)), `${provider.id}:${approved}`);

  const queryTarget = params.get('atendimento') ? `booking:${params.get('atendimento')}` : params.get('orcamento') ? `quote:${params.get('orcamento')}` : '';

  if (!approved) {
    return (
      <Card as="section">
        <h2 className="text-lg font-bold text-gray-800 mb-2">Cobranças ainda não liberadas</h2>
        <p className="text-sm text-gray-600">{PROVIDER_STATUS_HELP[provider.status]}</p>
        <Link to="/pro/cadastro" className={`${primaryButton} mt-4`}>
          Ir para o cadastro
        </Link>
      </Card>
    );
  }
  if (data.loading && !data.data) return <PageStatus />;

  return (
    <div className="space-y-5">
      <ErrorAlert error={data.error} />
      {data.data && (
        <>
          <section aria-labelledby="cob-nova" className="space-y-3">
            <SectionTitle id="cob-nova">Nova cobrança</SectionTitle>
            {!isPro ? (
              <Card>
                <p className="text-sm text-gray-700">
                  Cobrar clientes seus por Pix, boleto ou cartão faz parte do plano Pro. Seu plano atual é o grátis.
                </p>
                <Link to="/pro/assinatura" className={`${primaryButton} mt-3`}>
                  Ver o plano Pro
                </Link>
              </Card>
            ) : !data.data.accountActive ? (
              <Card>
                <p className="text-sm text-gray-700">
                  Para cobrar, ative o recebimento: o WorkEasy cria a sua conta de recebimento no Asaas com os seus dados fiscais.
                </p>
                <Link to="/pro/assinatura#recebimento" className={`${primaryButton} mt-3`}>
                  Ativar recebimento
                </Link>
              </Card>
            ) : (
              <Card>
                <ChargeForm key={queryTarget} data={data.data} initialTarget={queryTarget} onCreated={data.reload} />
              </Card>
            )}
          </section>
          <section aria-labelledby="cob-lista" className="space-y-3">
            <SectionTitle id="cob-lista">Suas cobranças</SectionTitle>
            {data.data.payments.length === 0 ? (
              <EmptyState>Nenhuma cobrança ainda. Quando você criar uma, ou um cliente pagar pelo app, ela aparece aqui.</EmptyState>
            ) : (
              <ul className="space-y-3">
                {data.data.payments.map(payment => (
                  <PaymentItem key={payment.id} payment={payment} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
};

const Cobrancas: React.FC = () => (
  <ProPage title="Cobranças" banner={false}>
    <Charges />
  </ProPage>
);

export default Cobrancas;
