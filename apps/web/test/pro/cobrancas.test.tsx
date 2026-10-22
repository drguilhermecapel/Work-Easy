import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { baseTables, functionData, functionError, ok, providerRow, signInProvider, type ProFake, type Result } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('./fake');
  return { supabase: createProFake(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderPro } = await import('./render');
const fake = supabase as unknown as ProFake;

const BOOKING = {
  id: 'b-1',
  client_id: null,
  provider_client_id: 'cli-1',
  occupation_slug: 'diarista',
  period: '[2030-01-15T12:00:00Z,2030-01-15T16:00:00Z)',
  price_cents: 15000,
  status: 'completed',
  origin: 'own',
  platform_fee_cents: 0,
  notes: null,
  canceled_reason: null,
  created_at: '2030-01-01T12:00:00Z',
};

const QUOTE = {
  id: 'q-1',
  provider_id: 'prov-1',
  provider_client_id: null,
  client_name: 'Marta Lima',
  client_phone: null,
  title: 'Reforma do banheiro',
  items: [],
  total_cents: 450000,
  valid_until: null,
  notes: null,
  status: 'accepted',
  public_token: 'tok',
  created_at: '2030-01-01T12:00:00Z',
  updated_at: '2030-01-01T12:00:00Z',
};

const PIX = '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913WorkEasy6009SAO PAULO62070503***6304ABCD';

const CHARGE = {
  payment_id: 'pay-1',
  asaas_payment_id: 'pay_asaas_1',
  method: 'pix',
  status: 'pending',
  amount_cents: 15000,
  due_date: '2030-01-16',
  invoice_url: 'https://sandbox.asaas.com/i/abc123',
  pix: { payload: PIX, qr_code_base64: 'iVBORw0KGgo=' },
  reused: false,
};

const PAYMENT = {
  id: 'pay-0',
  booking_id: 'b-0',
  quote_id: null,
  method: 'pix',
  amount_cents: 9000,
  platform_fee_cents: 0,
  status: 'pending',
  invoice_url: 'https://sandbox.asaas.com/i/old',
  pix_qr_code: null,
  pix_payload: '000201-antigo',
  due_date: '2030-01-10',
  created_at: '2030-01-05T12:00:00Z',
};

let account: string | null;

const setup = (provider: ReturnType<typeof providerRow>) => {
  fake.tables = {
    ...baseTables({ provider }),
    provider_payment_accounts: () => ok(account ? { status: account } : null),
    payments: () => ok([PAYMENT, { ...PAYMENT, id: 'pay-00', amount_cents: 30000, status: 'received', pix_payload: null, invoice_url: null, quote_id: 'q-x', platform_fee_cents: 1200 }]),
    bookings: () => ok([BOOKING, { ...BOOKING, id: 'b-plat', origin: 'platform' }, { ...BOOKING, id: 'b-canceled', status: 'canceled' }]),
    quotes: () => ok([QUOTE, { ...QUOTE, id: 'q-draft', status: 'sent' }]),
    provider_clients: () => ok([{ id: 'cli-1', client_id: null, name: 'Carlos Dias', phone: '+5511987654321', email: null, notes: null, origin: 'own', created_at: '2026-10-01T00:00:00Z' }]),
  };
};

beforeEach(() => {
  fake.reset();
  signInProvider(fake);
  account = 'active';
});

const VALID_CPF = '529.982.247-25';

describe('/pro/cobrancas: who can charge', () => {
  it('explains to a provider in draft or under review that charging is not available yet', async () => {
    setup(providerRow({ status: 'pending_review', plan: 'free' }));
    renderPro('/pro/cobrancas');
    expect(await screen.findByRole('heading', { name: 'Cobranças ainda não liberadas' })).toBeInTheDocument();
    expect(screen.getByText(/não recebe pedidos nem cobra clientes/)).toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Nova cobrança' })).not.toBeInTheDocument();
    expect(fake.tableCalls.filter(call => call.table === 'payments')).toEqual([]);
  });

  it('keeps charging for the Pro plan, as the database says, and still lists the payments', async () => {
    setup(providerRow({ plan: 'free' }));
    renderPro('/pro/cobrancas');
    expect(await screen.findByText(/faz parte do plano Pro\. Seu plano atual é o grátis/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o plano Pro' })).toHaveAttribute('href', '/pro/assinatura');
    expect(screen.queryByRole('form', { name: 'Nova cobrança' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Aguardando pagamento').length).toBeGreaterThan(0);
  });

  it('asks a Pro provider without a receiving account to activate it first', async () => {
    account = null;
    setup(providerRow({ plan: 'pro' }));
    renderPro('/pro/cobrancas');
    expect(await screen.findByText(/ative o recebimento/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ativar recebimento' })).toHaveAttribute('href', '/pro/assinatura#recebimento');
    expect(screen.queryByRole('form', { name: 'Nova cobrança' })).not.toBeInTheDocument();
  });
});

describe('/pro/cobrancas: charging', () => {
  beforeEach(() => setup(providerRow({ plan: 'pro' })));

  it('offers own bookings that can be charged and accepted quotes, nothing else', async () => {
    renderPro('/pro/cobrancas');
    const select = await screen.findByLabelText('O que cobrar');
    const options = within(select).getAllByRole('option').map(option => option.textContent);
    expect(options).toHaveLength(3);
    expect(options[1]).toMatch(/Carlos Dias, Diarista, 15\/01\/2030, 09:00 às 13:00, R\$\s150,00/);
    expect(options[2]).toMatch(/Reforma do banheiro, Marta Lima, R\$\s4\.500,00/);
  });

  it('does not offer a booking or a quote that already has a received payment', async () => {
    const paid = (over: Record<string, unknown>) => ({ ...PAYMENT, id: `paid-${Math.random()}`, status: 'received', ...over });
    for (const status of ['received', 'confirmed', 'held', 'released']) {
      fake.tables.payments = () => ok([paid({ booking_id: 'b-1', status }), paid({ booking_id: null, quote_id: 'q-1', status })]);
      const { unmount } = renderPro('/pro/cobrancas');
      expect(await screen.findByText(/Nada a cobrar por aqui ainda/), status).toBeInTheDocument();
      unmount();
    }
    // a pending or refunded payment does not hide the item: it can still be charged
    fake.tables.payments = () => ok([{ ...PAYMENT, booking_id: 'b-1', status: 'refunded' }, { ...PAYMENT, id: 'pay-q', booking_id: null, quote_id: 'q-1', status: 'pending' }]);
    renderPro('/pro/cobrancas');
    const select = await screen.findByLabelText('O que cobrar');
    expect(within(select).getAllByRole('option')).toHaveLength(3);
  });

  it('creates a Pix charge for an own booking and shows the copy-and-paste code, QR and invoice', async () => {
    fake.functionsHandlers['charges-create'] = () => functionData(CHARGE);
    const user = userEvent.setup();
    renderPro('/pro/cobrancas?atendimento=b-1');

    // Coming from the agenda: the booking is already chosen and the client's data filled in
    expect(await screen.findByLabelText('O que cobrar')).toHaveValue('booking:b-1');
    expect(screen.getByLabelText('Nome do cliente')).toHaveValue('Carlos Dias');
    expect(screen.getByLabelText('Celular do cliente (opcional)')).toHaveValue('(11) 98765-4321');

    await user.type(screen.getByLabelText('CPF ou CNPJ do cliente'), VALID_CPF);
    fireEvent.change(screen.getByLabelText('Vencimento (opcional)'), { target: { value: '2030-01-16' } });
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));

    expect(await screen.findByRole('heading', { name: 'Cobrança criada' })).toBeInTheDocument();
    expect(fake.functionCalls).toEqual([
      {
        name: 'charges-create',
        body: {
          booking_id: 'b-1',
          method: 'pix',
          customer: { cpf_cnpj: '52998224725', name: 'Carlos Dias', phone: '+5511987654321' },
          due_date: '2030-01-16',
        },
      },
    ]);
    const result = screen.getByRole('heading', { name: 'Cobrança criada' }).closest('section') as HTMLElement;
    expect(within(result).getByLabelText('Pix copia e cola')).toHaveValue(PIX);
    expect(within(result).getByAltText('QR Code do Pix')).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=');
    const invoice = within(result).getByRole('link', { name: /Abrir a fatura do Asaas/ });
    expect(invoice).toHaveAttribute('href', 'https://sandbox.asaas.com/i/abc123');
    expect(invoice).toHaveAttribute('rel', expect.stringContaining('noopener'));

    await user.click(within(result).getByRole('button', { name: 'Copiar código Pix' }));
    expect(await navigator.clipboard.readText()).toBe(PIX);
  });

  it('charges an accepted quote and never sends card data (the card is paid on the Asaas page)', async () => {
    fake.functionsHandlers['charges-create'] = () => functionData({ ...CHARGE, method: 'credit_card', pix: null, amount_cents: 450000, reused: true });
    const user = userEvent.setup();
    renderPro('/pro/cobrancas?orcamento=q-1');
    expect(await screen.findByLabelText('O que cobrar')).toHaveValue('quote:q-1');
    await user.selectOptions(screen.getByLabelText('Forma de pagamento'), 'credit_card');
    await user.type(screen.getByLabelText('CPF ou CNPJ do cliente'), '11.222.333/0001-81');
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));

    expect(await screen.findByRole('heading', { name: 'Cobrança já existente' })).toBeInTheDocument();
    expect(screen.getByText(/O WorkEasy não recebe nem guarda dados de cartão/)).toBeInTheDocument();
    expect(fake.functionCalls[0].body).toEqual({
      quote_id: 'q-1',
      method: 'credit_card',
      customer: { cpf_cnpj: '11222333000181', name: 'Marta Lima' },
    });
    expect(JSON.stringify(fake.functionCalls)).not.toMatch(/card_number|cvv|creditCard/i);
    expect(screen.queryByLabelText(/número do cartão|cvv/i)).not.toBeInTheDocument();
  });

  it('checks the target, the name and the document before calling the function', async () => {
    const user = userEvent.setup();
    renderPro('/pro/cobrancas');
    await screen.findByLabelText('O que cobrar');
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha o atendimento ou o orçamento a cobrar.');

    await user.selectOptions(screen.getByLabelText('O que cobrar'), 'booking:b-1');
    await user.type(screen.getByLabelText('CPF ou CNPJ do cliente'), '123.456.789-00');
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um CPF ou CNPJ válido do cliente.');
    expect(fake.functionCalls).toEqual([]);
  });

  it.each<[label: string, answer: Result, message: RegExp]>([
    ['pro_required', functionError(403, 'pro_required'), /Este recurso faz parte do plano Pro/],
    ['payments_not_configured', functionError(503, 'payments_not_configured'), /depende de configuração no servidor e ainda não está disponível/],
    ['provider_payment_account_missing', functionError(409, 'provider_payment_account_missing'), /Ative o recebimento em Assinatura/],
    ['booking_not_chargeable', functionError(409, 'booking_not_chargeable'), /não pode ser cobrado na situação atual/],
    ['already_paid', functionError(409, 'already_paid'), /Este item já foi pago/],
  ])('translates %s', async (_label, answer, message) => {
    fake.functionsHandlers['charges-create'] = () => answer;
    const user = userEvent.setup();
    renderPro('/pro/cobrancas?atendimento=b-1');
    await screen.findByLabelText('O que cobrar');
    await user.type(screen.getByLabelText('CPF ou CNPJ do cliente'), VALID_CPF);
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
  });

  it('lists the payments with status, fee and the Pix of the pending ones', async () => {
    renderPro('/pro/cobrancas');
    const pending = (await screen.findByText('R$ 90,00')).closest('li') as HTMLElement;
    expect(within(pending).getByText('Aguardando pagamento')).toBeInTheDocument();
    expect(within(pending).getByText(/vence em 10\/01\/2030/)).toBeInTheDocument();
    await userEvent.setup().click(within(pending).getByText('Pix e link da fatura'));
    expect(within(pending).getByLabelText('Pix copia e cola')).toHaveValue('000201-antigo');
    const received = screen.getByText('Recebido').closest('li') as HTMLElement;
    expect(within(received).getByText(/Taxa da plataforma neste pagamento: R\$\s12,00/)).toBeInTheDocument();
    expect(within(received).queryByText('Pix e link da fatura')).not.toBeInTheDocument();
  });

  it('says there is nothing to charge yet', async () => {
    fake.tables.bookings = () => ok([]);
    fake.tables.quotes = () => ok([]);
    fake.tables.payments = () => ok([]);
    renderPro('/pro/cobrancas');
    expect(await screen.findByText(/Nada a cobrar por aqui ainda/)).toBeInTheDocument();
    expect(await screen.findByText(/Nenhuma cobrança ainda/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('form', { name: 'Nova cobrança' })).not.toBeInTheDocument());
  });
});
