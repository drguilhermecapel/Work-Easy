import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { baseTables, functionData, functionError, ok, providerRow, signInProvider, type ProFake, type TableCall } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderPro } = await import('./render');
const fake = supabase as unknown as ProFake;

let provider: ReturnType<typeof providerRow>;
let subscription: Record<string, unknown> | null;
let account: string | null;
let price: unknown;
let accountCreatedAt: string;

beforeEach(() => {
  fake.reset();
  signInProvider(fake);
  provider = providerRow({ plan: 'free' });
  subscription = null;
  account = null;
  price = 4900;
  accountCreatedAt = new Date().toISOString();
  fake.tables = {
    ...baseTables({ provider }),
    providers: () => ok(provider),
    subscriptions: () => ok(subscription),
    provider_payment_accounts: () => ok(account ? { status: account, created_at: accountCreatedAt } : null),
    platform_settings: (call: TableCall) =>
      call.filters.some(([, column, value]) => column === 'key' && value === 'pro_price_cents') ? ok({ value: price }) : ok([]),
  };
});

const VALID_CPF = '529.982.247-25';

describe('/pro/assinatura: plan', () => {
  it('shows the free plan and the monthly price read from platform_settings', async () => {
    price = 6900;
    renderPro('/pro/assinatura');
    expect(await screen.findByText(/R\$\s69,00 por mês/)).toBeInTheDocument();
    expect(screen.getByText('Grátis')).toBeInTheDocument();
    expect(screen.getByText(/Libera as cobranças de clientes seus/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assinar o Pro' })).toBeEnabled();
  });

  it('does not invent a price when it cannot be read, and does not allow subscribing', async () => {
    price = null;
    renderPro('/pro/assinatura');
    expect(await screen.findByText(/preço indisponível no momento/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assinar o Pro' })).toBeDisabled();
  });

  it('takes the plan from the database, not from the subscription row alone', async () => {
    // An "active" subscription row, but providers.plan is still free (the webhook has not confirmed)
    subscription = { plan: 'pro', status: 'active', current_period_end: null, canceled_at: null };
    renderPro('/pro/assinatura');
    expect(await screen.findByText('Grátis')).toBeInTheDocument();
    expect(screen.queryByText('Pro', { selector: 'span.inline-block' })).not.toBeInTheDocument();
  });

  it('subscribes and says the Pro starts only when the first payment is confirmed', async () => {
    fake.functionsHandlers['subscriptions-manage'] = () =>
      functionData({ status: 'pending', plan: 'free', price_cents: 4900, invoice_url: 'https://sandbox.asaas.com/i/sub1', awaiting_payment: true });
    const user = userEvent.setup();
    renderPro('/pro/assinatura');
    await user.selectOptions(await screen.findByLabelText('Forma de pagamento da assinatura'), 'boleto');
    await user.type(screen.getByLabelText('Seu CPF ou CNPJ'), VALID_CPF);
    await user.click(screen.getByRole('button', { name: 'Assinar o Pro' }));

    expect(await screen.findByText(/O Pro é ativado quando o primeiro pagamento for confirmado/, { selector: 'p' })).toBeInTheDocument();
    expect(fake.functionCalls).toEqual([{ name: 'subscriptions-manage', body: { action: 'subscribe', method: 'boleto', cpf_cnpj: '52998224725' } }]);
    expect(screen.getByRole('link', { name: /Abrir a fatura do primeiro pagamento/ })).toHaveAttribute('href', 'https://sandbox.asaas.com/i/sub1');
    // The screen did not turn the plan into Pro by itself
    expect(screen.getByText('Grátis')).toBeInTheDocument();
  });

  it('does not call the function with an invalid document', async () => {
    const user = userEvent.setup();
    renderPro('/pro/assinatura');
    await user.type(await screen.findByLabelText('Seu CPF ou CNPJ'), '111.111.111-11');
    await user.click(screen.getByRole('button', { name: 'Assinar o Pro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um CPF ou CNPJ válido.');
    expect(fake.functionCalls).toEqual([]);
  });

  it.each([
    ['payments_not_configured', 503, /depende de configuração no servidor e ainda não está disponível/],
    ['cpf_cnpj_required', 400, /Informe o CPF ou CNPJ para continuar/],
    ['already_subscribed', 409, /Já existe uma assinatura Pro para esta conta/],
  ])('translates %s', async (code, status, message) => {
    fake.functionsHandlers['subscriptions-manage'] = () => functionError(status, code);
    const user = userEvent.setup();
    renderPro('/pro/assinatura');
    await user.click(await screen.findByRole('button', { name: 'Assinar o Pro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('shows a first payment still pending as waiting, not as late', async () => {
    subscription = { plan: 'pro', status: 'pending', current_period_end: null, canceled_at: null };
    renderPro('/pro/assinatura');
    expect(await screen.findByText(/Assinatura: aguardando o primeiro pagamento/)).toBeInTheDocument();
    expect(screen.getByText(/O Pro é ativado quando o primeiro pagamento for confirmado/, { selector: 'p' })).toBeInTheDocument();
    expect(screen.queryByText(/atrasado/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assinar o Pro' })).not.toBeInTheDocument();
  });

  it('keeps "late" for a subscription that has a paid period behind it', async () => {
    provider = providerRow({ plan: 'pro' });
    subscription = { plan: 'pro', status: 'past_due', current_period_end: '2030-02-10T02:59:59Z', canceled_at: null };
    renderPro('/pro/assinatura');
    expect(await screen.findByText(/Assinatura: pagamento atrasado/)).toBeInTheDocument();
    expect(screen.queryByText(/aguardando o primeiro pagamento/)).not.toBeInTheDocument();
  });

  it('cancels after confirming and says until when the Pro stays', async () => {
    provider = providerRow({ plan: 'pro' });
    subscription = { plan: 'pro', status: 'active', current_period_end: '2030-02-10T02:59:59Z', canceled_at: null };
    fake.functionsHandlers['subscriptions-manage'] = () => functionData({ status: 'canceled', plan: 'pro', pro_until: '2030-02-10T02:59:59Z' });
    const user = userEvent.setup();
    renderPro('/pro/assinatura');

    expect(await screen.findByText(/Período pago até 09\/02\/2030/)).toBeInTheDocument();
    expect(screen.getByText('Pro', { selector: 'span.inline-block' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar assinatura' }));
    expect(fake.functionCalls).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Sim, cancelar' }));

    expect(await screen.findByText(/Assinatura cancelada\. Você mantém o Pro até 09\/02\/2030/)).toBeInTheDocument();
    expect(fake.functionCalls).toEqual([{ name: 'subscriptions-manage', body: { action: 'cancel' } }]);
  });

  it('reads the plan again on request', async () => {
    const user = userEvent.setup();
    renderPro('/pro/assinatura');
    expect(await screen.findByText('Grátis')).toBeInTheDocument();
    provider = providerRow({ plan: 'pro' });
    subscription = { plan: 'pro', status: 'active', current_period_end: '2030-03-10T02:59:59Z', canceled_at: null };
    await user.click(screen.getByRole('button', { name: 'Atualizar situação' }));
    expect(await screen.findByText('Pro', { selector: 'span.inline-block' })).toBeInTheDocument();
  });
});

describe('/pro/assinatura: receiving account', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(await screen.findByLabelText('E-mail'), 'ana@example.com');
    await user.type(screen.getByLabelText('CPF ou CNPJ'), VALID_CPF);
    fireEvent.change(await screen.findByLabelText('Data de nascimento'), { target: { value: '1990-05-20' } });
    await user.type(screen.getByLabelText('Celular com DDD'), '(11) 98765-4321');
    await user.type(screen.getByLabelText('Renda ou faturamento mensal (R$)'), '3.500,00');
    await user.type(screen.getByLabelText('CEP'), '01310-100');
    await user.type(screen.getByLabelText('Rua ou avenida'), 'Avenida Paulista');
    await user.type(screen.getByLabelText('Número'), '1000');
    await user.type(screen.getByLabelText('Bairro'), 'Bela Vista');
  };

  it('creates the Asaas account with the tax data, asking for the birth date of a person', async () => {
    fake.functionsHandlers['asaas-onboard'] = () => functionData({ account_id: 'acc', wallet_id: 'w', status: 'active', own_charges_enabled: true });
    const user = userEvent.setup();
    renderPro('/pro/assinatura');
    await fill(user);
    expect(screen.queryByLabelText('Tipo da empresa')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ativar recebimento' }));

    expect(await screen.findByText('Recebimento ativado.')).toBeInTheDocument();
    expect(fake.functionCalls).toEqual([
      {
        name: 'asaas-onboard',
        body: {
          name: 'Ana Souza',
          email: 'ana@example.com',
          cpf_cnpj: '52998224725',
          mobile_phone: '+5511987654321',
          income_value_cents: 350000,
          address: 'Avenida Paulista',
          address_number: '1000',
          province: 'Bela Vista',
          postal_code: '01310100',
          birth_date: '1990-05-20',
        },
      },
    ]);
  });

  it('asks for the company type instead when the document is a CNPJ', async () => {
    const user = userEvent.setup();
    renderPro('/pro/assinatura');
    await user.type(await screen.findByLabelText('CPF ou CNPJ'), '11.222.333/0001-81');
    expect(await screen.findByLabelText('Tipo da empresa')).toBeInTheDocument();
    expect(screen.queryByLabelText('Data de nascimento')).not.toBeInTheDocument();
  });

  it('says it depends on configuration when the server has no Asaas account set up', async () => {
    fake.functionsHandlers['asaas-onboard'] = () => functionError(503, 'payments_not_configured');
    const user = userEvent.setup();
    renderPro('/pro/assinatura');
    await fill(user);
    await user.click(screen.getByRole('button', { name: 'Ativar recebimento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este recurso depende de configuração no servidor e ainda não está disponível.');
  });

  it('checks the income before calling the function', async () => {
    const user = userEvent.setup();
    renderPro('/pro/assinatura');
    await fill(user);
    await user.clear(screen.getByLabelText('Renda ou faturamento mensal (R$)'));
    await user.click(screen.getByRole('button', { name: 'Ativar recebimento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe a renda ou o faturamento mensal em reais');
    expect(fake.functionCalls).toEqual([]);
  });

  it('lets the provider send the form again when the activation stayed in "creating" for over 5 minutes', async () => {
    account = 'creating';
    accountCreatedAt = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    renderPro('/pro/assinatura');
    expect(await screen.findByText(/A ativação anterior não terminou/)).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Ativar recebimento' })).toBeInTheDocument();
    expect(screen.queryByText(/Ativação em andamento/)).not.toBeInTheDocument();
  });

  it('keeps asking to wait while a recent "creating" reservation may still be running', async () => {
    account = 'creating';
    accountCreatedAt = new Date(Date.now() - 60 * 1000).toISOString();
    renderPro('/pro/assinatura');
    expect(await screen.findByText(/Ativação em andamento/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Ativar recebimento' })).not.toBeInTheDocument();
  });

  it.each([
    ['active', /Recebimento ativo/],
    ['creating', /Ativação em andamento/],
    ['key_not_stored', /ativação não foi concluída\. Fale com o suporte/],
  ])('shows the account state %s instead of the form', async (status, text) => {
    account = status;
    renderPro('/pro/assinatura');
    expect(await screen.findByText(text)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Ativar recebimento' })).not.toBeInTheDocument());
    const section = screen.getByRole('heading', { name: 'Recebimento dos clientes' }).closest('section') as HTMLElement;
    expect(within(section).queryByLabelText('CPF ou CNPJ')).not.toBeInTheDocument();
  });
});
