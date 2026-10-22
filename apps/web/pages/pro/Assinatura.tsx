import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { AppError } from '../../lib/errors';
import { formatCents } from '../../lib/money';
import { formatDateBR } from '../../lib/timezone';
import { useAsync } from '../../lib/useAsync';
import type { PaymentMethod } from '../../services/charges';
import {
  activateReceiving,
  cancelPro,
  getMyPaymentAccount,
  getFreeProposalsPerMonth,
  getMySubscription,
  getProPriceCents,
  getProTrialDays,
  subscribePro,
  type OnboardResult,
  type SubscribeResult,
} from '../../services/proBilling';
import { onlyDigits, parseReaisToCents } from '../../services/proFormat';
import ErrorAlert from '../../components/ErrorAlert';
import ProPage from '../../components/pro/ProPage';
import { useProvider } from '../../components/pro/proContext';
import { PAYMENT_METHOD_LABELS, PROVIDER_STATUS_LABELS, SUBSCRIPTION_STATUS_LABELS } from '../../components/pro/labels';
import { Badge, Card, ConfirmButton, Field, SectionTitle } from '../../components/pro/ui';
import { inputClass, primaryButton, secondaryButton } from '../../components/pro/styles';

const METHODS: PaymentMethod[] = ['pix', 'boleto', 'credit_card', 'undefined'];

// ---- Subscription ---------------------------------------------------------------------

const SubscriptionSection: React.FC<{ version: number }> = ({ version }) => {
  const { provider, refresh } = useProvider();
  const price = useAsync(() => getProPriceCents(), 'price');
  const trialDays = useAsync(() => getProTrialDays(), 'trial-days');
  const freeProposals = useAsync(() => getFreeProposalsPerMonth(), 'free-proposals');
  const subscription = useAsync(() => getMySubscription(provider.id), `${provider.id}:${version}`);
  const [method, setMethod] = useState<PaymentMethod>('pix');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [created, setCreated] = useState<SubscribeResult | null>(null);
  const [notice, setNotice] = useState('');

  const isPro = provider.plan === 'pro';
  const row = subscription.data;
  // `pending`: subscribed, the first charge is not paid yet (past_due is only for a late payment)
  const waitingFirstPayment = row?.status === 'pending';
  const subscribed = row !== null && row !== undefined && row.status !== 'canceled';
  // The trial is for who never subscribed: the function refuses it to anyone with a subscription row
  const trialOffer = row === null && trialDays.data ? trialDays.data : null;

  const subscribe = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice('');
    try {
      setCreated(await subscribePro({ method, cpfCnpj }));
      subscription.reload();
      refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setError(null);
    setNotice('');
    try {
      const result = await cancelPro();
      setCreated(null);
      setNotice(
        result.pro_until
          ? `Assinatura cancelada. Você mantém o Pro até ${formatDateBR(result.pro_until)}, fim do período já pago.`
          : 'Assinatura cancelada. Você voltou ao plano grátis.',
      );
      subscription.reload();
      refresh();
    } catch (err) {
      setError(err);
    }
  };

  return (
    <Card as="section">
      <SectionTitle id="assinatura-plano">Plano</SectionTitle>
      <p className="flex flex-wrap items-center gap-2 text-sm text-gray-800 mb-2">
        Seu plano agora:
        <Badge className={isPro ? 'bg-purple-100 text-purple-800' : 'bg-gray-100 text-gray-700'}>{isPro ? 'Pro' : 'Grátis'}</Badge>
        {row && <Badge className="bg-gray-100 text-gray-700">Assinatura: {SUBSCRIPTION_STATUS_LABELS[row.status].toLowerCase()}</Badge>}
      </p>
      {row?.current_period_end && (
        <p className="text-sm text-gray-600 mb-2">
          {row.status === 'canceled' ? 'Pro vale até' : row.status === 'trialing' ? 'Teste grátis até' : 'Período pago até'}{' '}
          {formatDateBR(row.current_period_end)}.
        </p>
      )}
      {waitingFirstPayment && (
        <p className="text-sm text-gray-600 mb-2">
          O Pro é ativado quando o primeiro pagamento for confirmado. Isso pode levar um tempo depois do Pix, do boleto ou do cartão; use
          “Atualizar situação” para conferir.
        </p>
      )}
      <ErrorAlert error={subscription.error ?? price.error} />

      {!subscribed && (
        <form onSubmit={subscribe} className="space-y-4 mt-3" noValidate aria-label="Assinar o plano Pro">
          <p className="text-sm text-gray-700">
            Plano Pro:{' '}
            <strong>{price.data ? `${formatCents(price.data)} por mês` : price.loading ? 'carregando o preço…' : 'preço indisponível no momento'}</strong>.
            {' '}Libera as cobranças de clientes seus por Pix, boleto e cartão, feitas na sua conta de recebimento, sem taxa do WorkEasy
            {freeProposals.data
              ? `, e propostas sem limite nos pedidos da plataforma (o plano grátis envia até ${freeProposals.data} por mês)`
              : ''}
            . Você pode cancelar quando quiser.
          </p>
          {trialOffer && (
            <p className="text-sm text-gray-700" role="note">
              <strong>Teste grátis de {trialOffer} dias:</strong> o Pro começa agora e a primeira cobrança só vence quando o teste acaba.
              Cancele antes e você não será cobrado.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field id="ass-forma" label="Forma de pagamento da assinatura">
              <select id="ass-forma" className={inputClass} value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}>
                {METHODS.map(item => (
                  <option key={item} value={item}>
                    {PAYMENT_METHOD_LABELS[item]}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="ass-documento" label="Seu CPF ou CNPJ" hint="Pedido na primeira assinatura, para emitir a cobrança.">
              <input id="ass-documento" className={inputClass} inputMode="numeric" autoComplete="off" value={cpfCnpj} onChange={e => setCpfCnpj(e.target.value)} />
            </Field>
          </div>
          <p className="text-xs text-gray-500">O cartão é pago na página do Asaas: o app nunca recebe dados de cartão.</p>
          <ErrorAlert error={error} />
          <button type="submit" className={primaryButton} disabled={busy || !price.data}>
            {busy ? 'Assinando…' : 'Assinar o Pro'}
          </button>
        </form>
      )}

      {subscribed && (
        <div className="space-y-3 mt-3">
          <ErrorAlert error={error} />
          <ConfirmButton label="Cancelar assinatura" question="Cancelar a assinatura do Pro?" confirmLabel="Sim, cancelar" onConfirm={cancel} />
        </div>
      )}

      {created && (
        <div role="status" className="mt-4 space-y-2 bg-green-50 border border-green-100 rounded-xl p-3 text-sm text-gray-800">
          {created.trial_ends_at ? (
            <p>
              Teste grátis ativado: o Pro vale até {formatDateBR(created.trial_ends_at)}. A primeira cobrança, de {formatCents(created.price_cents)} por
              mês, vence nessa data; cancele antes e você não será cobrado.
            </p>
          ) : (
            <p>Assinatura criada: {formatCents(created.price_cents)} por mês. O Pro é ativado quando o primeiro pagamento for confirmado.</p>
          )}
          {created.invoice_url && !created.trial_ends_at && (
            <a href={created.invoice_url} target="_blank" rel="noopener noreferrer" className={secondaryButton}>
              <ExternalLink size={16} aria-hidden="true" /> Abrir a fatura do primeiro pagamento
            </a>
          )}
        </div>
      )}
      {notice && <p role="status" className="mt-3 text-sm text-gray-800">{notice}</p>}
    </Card>
  );
};

// ---- Receiving account ----------------------------------------------------------------

const ACCOUNT_TEXT: Record<string, string> = {
  active: 'Recebimento ativo: você já pode cobrar clientes seus se estiver no plano Pro.',
  creating: 'Ativação em andamento. Aguarde alguns instantes e use “Atualizar situação”.',
  key_not_stored: 'A conta de recebimento foi criada, mas a ativação não foi concluída. Fale com o suporte para finalizar.',
  key_not_returned: 'A conta de recebimento foi criada, mas a ativação não foi concluída. Fale com o suporte para finalizar.',
};

const COMPANY_TYPES = [
  { value: 'MEI', label: 'MEI' },
  { value: 'INDIVIDUAL', label: 'Empresário individual' },
  { value: 'LIMITED', label: 'Sociedade limitada' },
  { value: 'ASSOCIATION', label: 'Associação' },
] as const;

/** asaas-onboard takes over a reservation stuck in `creating` after this long (5 minutes). */
const CREATING_RESUME_AFTER_MS = 5 * 60 * 1000;

const ReceivingSection: React.FC<{ version: number }> = ({ version }) => {
  const { provider, userId } = useProvider();
  const account = useAsync(async () => ({ row: await getMyPaymentAccount(userId), at: Date.now() }), `${userId}:account:${version}`);
  const [form, setForm] = useState({
    name: provider.display_name,
    email: '',
    cpfCnpj: '',
    birthDate: '',
    companyType: '',
    mobilePhone: '',
    income: '',
    address: '',
    addressNumber: '',
    complement: '',
    province: '',
    postalCode: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<OnboardResult | null>(null);
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const isCompany = onlyDigits(form.cpfCnpj).length > 11;
  const status = account.data?.row?.status ?? null;
  const createdAt = account.data?.row?.created_at ? Date.parse(account.data.row.created_at) : NaN;
  // A reservation that never finished (the function died): sending the form again resumes it
  const stuck = status === 'creating' && Number.isFinite(createdAt) && account.data != null && account.data.at - createdAt > CREATING_RESUME_AFTER_MS;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const incomeCents = parseReaisToCents(form.income);
      if (incomeCents === null) throw new AppError('invalid_input', { message: 'Informe a renda ou o faturamento mensal em reais, por exemplo 3500,00.' });
      setResult(
        await activateReceiving({
          name: form.name,
          email: form.email,
          cpfCnpj: form.cpfCnpj,
          birthDate: isCompany ? undefined : form.birthDate,
          companyType: isCompany ? (form.companyType as (typeof COMPANY_TYPES)[number]['value']) : undefined,
          mobilePhone: form.mobilePhone,
          incomeCents,
          address: form.address,
          addressNumber: form.addressNumber,
          complement: form.complement,
          province: form.province,
          postalCode: form.postalCode,
        }),
      );
      account.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section" className="scroll-mt-20">
      <SectionTitle id="recebimento">Recebimento dos clientes</SectionTitle>
      <ErrorAlert error={account.error} />
      {status && !stuck && ACCOUNT_TEXT[status] && <p className="text-sm text-gray-700">{ACCOUNT_TEXT[status]}</p>}
      {stuck && (
        <p className="text-sm text-gray-700 mb-3">
          A ativação anterior não terminou. Confira os dados e envie de novo para retomar de onde parou; nada é cobrado por isso.
        </p>
      )}
      {(status === null || stuck) && (
        <form onSubmit={submit} className="space-y-4" noValidate aria-label="Ativar recebimento">
          <p className="text-sm text-gray-600">
            Para cobrar clientes seus, o WorkEasy cria a sua conta de recebimento no Asaas com os dados abaixo. Eles são usados só para abrir essa
            conta. Para cobrar, o plano Pro também precisa estar ativo.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field id="rec-nome" label="Nome completo ou razão social">
              <input id="rec-nome" className={inputClass} autoComplete="name" value={form.name} onChange={e => set('name', e.target.value)} />
            </Field>
            <Field id="rec-email" label="E-mail">
              <input id="rec-email" className={inputClass} type="email" autoComplete="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </Field>
            <Field id="rec-documento" label="CPF ou CNPJ">
              <input id="rec-documento" className={inputClass} inputMode="numeric" autoComplete="off" value={form.cpfCnpj} onChange={e => set('cpfCnpj', e.target.value)} />
            </Field>
            {isCompany ? (
              <Field id="rec-tipo" label="Tipo da empresa">
                <select id="rec-tipo" className={inputClass} value={form.companyType} onChange={e => set('companyType', e.target.value)}>
                  <option value="">Escolha…</option>
                  {COMPANY_TYPES.map(item => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <Field id="rec-nascimento" label="Data de nascimento">
                <input id="rec-nascimento" className={inputClass} type="date" autoComplete="bday" value={form.birthDate} onChange={e => set('birthDate', e.target.value)} />
              </Field>
            )}
            <Field id="rec-celular" label="Celular com DDD">
              <input id="rec-celular" className={inputClass} type="tel" autoComplete="tel" value={form.mobilePhone} onChange={e => set('mobilePhone', e.target.value)} />
            </Field>
            <Field id="rec-renda" label="Renda ou faturamento mensal (R$)">
              <input id="rec-renda" className={inputClass} inputMode="decimal" value={form.income} onChange={e => set('income', e.target.value)} />
            </Field>
            <Field id="rec-cep" label="CEP">
              <input id="rec-cep" className={inputClass} inputMode="numeric" autoComplete="postal-code" value={form.postalCode} onChange={e => set('postalCode', e.target.value)} />
            </Field>
            <Field id="rec-endereco" label="Rua ou avenida">
              <input id="rec-endereco" className={inputClass} autoComplete="address-line1" value={form.address} onChange={e => set('address', e.target.value)} />
            </Field>
            <Field id="rec-numero" label="Número">
              <input id="rec-numero" className={inputClass} value={form.addressNumber} onChange={e => set('addressNumber', e.target.value)} />
            </Field>
            <Field id="rec-complemento" label="Complemento (opcional)">
              <input id="rec-complemento" className={inputClass} value={form.complement} onChange={e => set('complement', e.target.value)} />
            </Field>
            <Field id="rec-bairro" label="Bairro">
              <input id="rec-bairro" className={inputClass} autoComplete="address-level3" value={form.province} onChange={e => set('province', e.target.value)} />
            </Field>
          </div>
          <ErrorAlert error={error} />
          <button type="submit" className={primaryButton} disabled={busy}>
            {busy ? 'Ativando…' : 'Ativar recebimento'}
          </button>
        </form>
      )}
      {result && (
        <p role="status" className="mt-3 text-sm text-gray-800">
          {result.message ?? (result.own_charges_enabled ? 'Recebimento ativado.' : `Conta criada (${result.status}). Use “Atualizar situação” para conferir.`)}
        </p>
      )}
    </Card>
  );
};

// ---- Page --------------------------------------------------------------------------------

const Content: React.FC = () => {
  const { provider, refresh } = useProvider();
  const location = useLocation();
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (location.hash === '#recebimento') document.getElementById('recebimento')?.scrollIntoView?.();
  }, [location.hash]);
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Situação do cadastro: <strong>{PROVIDER_STATUS_LABELS[provider.status]}</strong>. O plano e a assinatura vêm sempre do servidor; esta
          tela só mostra o que ele registrou.
        </p>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            refresh();
            setVersion(current => current + 1);
          }}
        >
          Atualizar situação
        </button>
      </div>
      <SubscriptionSection version={version} />
      <ReceivingSection version={version} />
    </div>
  );
};

const Assinatura: React.FC = () => (
  <ProPage title="Assinatura e recebimento">
    <Content />
  </ProPage>
);

export default Assinatura;
