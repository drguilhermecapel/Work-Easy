import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '../../components/pro/labels';
import { blobHead, blobText, captureDownloads } from './download';
import { baseTables, functionData, functionError, ok, providerRow, signInProvider, type ProFake, type Result, type TableCall } from './fake';

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

const CLIENTS = [
  { id: 'cli-1', client_id: null, name: 'Carlos Dias', phone: '+5511987654321', email: null, notes: null, origin: 'own', created_at: '2026-10-01T00:00:00Z', cpf_cnpj: null },
  { id: 'cli-2', client_id: null, name: 'Ana Souza', phone: null, email: null, notes: null, origin: 'own', created_at: '2026-10-02T00:00:00Z', cpf_cnpj: '52998224725' },
];

let account: string | null;

const setup = (provider: ReturnType<typeof providerRow>) => {
  fake.tables = {
    ...baseTables({ provider }),
    provider_payment_accounts: () => ok(account ? { status: account } : null),
    payments: () => ok([PAYMENT, { ...PAYMENT, id: 'pay-00', amount_cents: 30000, status: 'received', pix_payload: null, invoice_url: null, quote_id: 'q-x', platform_fee_cents: 1200 }]),
    bookings: () => ok([BOOKING, { ...BOOKING, id: 'b-plat', origin: 'platform' }, { ...BOOKING, id: 'b-canceled', status: 'canceled' }]),
    quotes: () => ok([QUOTE, { ...QUOTE, id: 'q-draft', status: 'sent' }]),
    provider_clients: (call: TableCall) =>
      call.op === 'insert'
        ? ok({ id: 'cli-new', client_id: null, email: null, notes: null, origin: 'own', created_at: '2026-11-01T00:00:00Z', cpf_cnpj: null, ...(call.payload as object) })
        : call.op === 'update'
          ? ok({ id: 'cli-1', client_id: null, name: 'Carlos Dias', phone: '+5511987654321', email: null, notes: null, origin: 'own', created_at: '2026-10-01T00:00:00Z', ...(call.payload as object) })
          : ok(CLIENTS),
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

  it('creates a Pix charge for an own booking: saves the document in the CRM, then sends no payer data', async () => {
    fake.functionsHandlers['charges-create'] = () => functionData(CHARGE);
    const user = userEvent.setup();
    renderPro('/pro/cobrancas?atendimento=b-1');

    // Coming from the agenda: the booking is already chosen and its CRM client is the payer
    expect(await screen.findByLabelText('O que cobrar')).toHaveValue('booking:b-1');
    expect(screen.getByText('Carlos Dias')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cliente do seu CRM')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('CPF ou CNPJ do cliente'), VALID_CPF);
    fireEvent.change(screen.getByLabelText('Vencimento (opcional)'), { target: { value: '2030-01-16' } });
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));

    expect(await screen.findByRole('heading', { name: 'Cobrança criada' })).toBeInTheDocument();
    const saved = fake.tableCalls.find(call => call.table === 'provider_clients' && call.op === 'update');
    expect(saved?.payload).toEqual({ cpf_cnpj: '52998224725' });
    // The payer's data lives in the CRM: the request names neither the document nor the client
    expect(fake.functionCalls).toEqual([{ name: 'charges-create', body: { booking_id: 'b-1', method: 'pix', due_date: '2030-01-16' } }]);
    expect(JSON.stringify(fake.functionCalls)).not.toMatch(/customer|cpf/);
    const result = screen.getByRole('heading', { name: 'Cobrança criada' }).closest('section') as HTMLElement;
    expect(within(result).getByLabelText('Pix copia e cola')).toHaveValue(PIX);
    expect(within(result).getByAltText('QR Code do Pix')).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=');
    const invoice = within(result).getByRole('link', { name: /Abrir a fatura do Asaas/ });
    expect(invoice).toHaveAttribute('href', 'https://sandbox.asaas.com/i/abc123');
    expect(invoice).toHaveAttribute('rel', expect.stringContaining('noopener'));

    await user.click(within(result).getByRole('button', { name: 'Copiar código Pix' }));
    expect(await navigator.clipboard.readText()).toBe(PIX);
  });

  it('charges an accepted quote with no CRM link by registering its client first, and never sends card data', async () => {
    fake.functionsHandlers['charges-create'] = () => functionData({ ...CHARGE, method: 'credit_card', pix: null, amount_cents: 450000, reused: true });
    const user = userEvent.setup();
    renderPro('/pro/cobrancas?orcamento=q-1');
    expect(await screen.findByLabelText('O que cobrar')).toHaveValue('quote:q-1');
    await user.selectOptions(screen.getByLabelText('Forma de pagamento'), 'credit_card');
    await user.selectOptions(screen.getByLabelText('Cliente do seu CRM'), 'new');
    await user.type(screen.getByLabelText('CPF ou CNPJ do cliente'), '11.222.333/0001-81');
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));

    expect(await screen.findByRole('heading', { name: 'Cobrança já existente' })).toBeInTheDocument();
    expect(screen.getByText(/O WorkEasy não recebe nem guarda dados de cartão/)).toBeInTheDocument();
    const created = fake.tableCalls.find(call => call.table === 'provider_clients' && call.op === 'insert');
    expect(created?.payload).toMatchObject({ name: 'Marta Lima', phone: null, cpf_cnpj: '11222333000181', provider_id: 'prov-1' });
    expect(fake.functionCalls[0].body).toEqual({ quote_id: 'q-1', method: 'credit_card', provider_client_id: 'cli-new' });
    expect(JSON.stringify(fake.functionCalls)).not.toMatch(/card_number|cvv|creditCard|customer|cpf/i);
    expect(screen.queryByLabelText(/número do cartão|cvv/i)).not.toBeInTheDocument();
  });

  it('does not register the same client twice when the charge fails and the provider tries again', async () => {
    let attempts = 0;
    fake.functionsHandlers['charges-create'] = () => {
      attempts += 1;
      return attempts === 1 ? functionError(409, 'provider_payment_account_missing', 'Ative o recebimento.') : functionData(CHARGE);
    };
    const user = userEvent.setup();
    renderPro('/pro/cobrancas?orcamento=q-1');
    await user.selectOptions(await screen.findByLabelText('Cliente do seu CRM'), 'new');
    await user.type(screen.getByLabelText('CPF ou CNPJ do cliente'), '11.222.333/0001-81');
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
    await screen.findByRole('alert');

    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
    expect(await screen.findByRole('heading', { name: 'Cobrança criada' })).toBeInTheDocument();

    expect(fake.tableCalls.filter(call => call.table === 'provider_clients' && call.op === 'insert')).toHaveLength(1);
    expect(fake.functionCalls[1].body).toMatchObject({ provider_client_id: 'cli-new' });
  });

  describe('after a charge that fails, the CRM list is read again (not the whole page)', () => {
    /** provider_clients as a small table: inserts and document updates are kept, and the list reads them. */
    const statefulClients = () => {
      const rows = CLIENTS.map(row => ({ ...row }));
      let lists = 0;
      let listFails = false;
      fake.tables.provider_clients = (call: TableCall) => {
        if (call.op === 'insert') {
          const row = { id: 'cli-new', client_id: null, email: null, notes: null, origin: 'own', created_at: '2026-11-01T00:00:00Z', cpf_cnpj: null, ...(call.payload as object) };
          rows.push(row as (typeof rows)[number]);
          return ok(row);
        }
        if (call.op === 'update') {
          const id = call.filters.find(([, column]) => column === 'id')?.[2];
          const row = rows.find(item => item.id === id)!;
          Object.assign(row, call.payload);
          return ok(row);
        }
        lists += 1;
        if (listFails) return { data: null, error: { code: '08006', message: 'connection failure', details: null, hint: null } };
        return ok(rows.map(row => ({ ...row })));
      };
      return { reads: () => lists, failListsFromNow: () => void (listFails = true) };
    };
    const failingOnce = () => {
      let attempts = 0;
      fake.functionsHandlers['charges-create'] = () => {
        attempts += 1;
        return attempts === 1 ? functionError(502, 'payment_provider_error', 'O Asaas não respondeu.') : functionData(CHARGE);
      };
    };
    const reads = (table: string) => fake.tableCalls.filter(call => call.table === table && call.op === 'select').length;

    it('a document saved for the linked client is not asked again: the field becomes optional and empty', async () => {
      setup(providerRow({ plan: 'pro' }));
      const clients = statefulClients();
      failingOnce();
      const user = userEvent.setup();
      renderPro('/pro/cobrancas?atendimento=b-1');
      await user.type(await screen.findByLabelText('CPF ou CNPJ do cliente'), VALID_CPF);
      const before = { clients: clients.reads(), payments: reads('payments'), quotes: reads('quotes'), bookings: reads('bookings') };
      await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
      await screen.findByRole('alert');

      const field = await screen.findByLabelText('Trocar o CPF ou CNPJ (opcional)');
      expect(field).toHaveValue('');
      expect(clients.reads()).toBe(before.clients + 1);
      // Only the CRM list: the payments, bookings and quotes of the page are not read again
      expect({ payments: reads('payments'), quotes: reads('quotes'), bookings: reads('bookings') })
        .toEqual({ payments: before.payments, quotes: before.quotes, bookings: before.bookings });

      await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
      expect(await screen.findByRole('heading', { name: 'Cobrança criada' })).toBeInTheDocument();
      expect(fake.tableCalls.filter(call => call.table === 'provider_clients' && call.op === 'update')).toHaveLength(1);
      expect(fake.functionCalls).toHaveLength(2);
    });

    it('a client registered for the quote becomes the picked client, with its document on file', async () => {
      setup(providerRow({ plan: 'pro' }));
      statefulClients();
      failingOnce();
      const user = userEvent.setup();
      renderPro('/pro/cobrancas?orcamento=q-1');
      await user.selectOptions(await screen.findByLabelText('Cliente do seu CRM'), 'new');
      await user.type(screen.getByLabelText('CPF ou CNPJ do cliente'), '11.222.333/0001-81');
      await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
      await screen.findByRole('alert');

      await waitFor(() => expect(screen.getByLabelText('Cliente do seu CRM')).toHaveValue('cli-new'));
      expect(within(screen.getByLabelText('Cliente do seu CRM')).getByRole('option', { name: 'Marta Lima' })).toBeInTheDocument();
      expect(screen.getByLabelText('Trocar o CPF ou CNPJ (opcional)')).toHaveValue('');

      await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
      expect(await screen.findByRole('heading', { name: 'Cobrança criada' })).toBeInTheDocument();
      expect(fake.tableCalls.filter(call => call.table === 'provider_clients' && call.op === 'insert')).toHaveLength(1);
      expect(fake.tableCalls.filter(call => call.table === 'provider_clients' && call.op === 'update')).toHaveLength(0);
      expect(fake.functionCalls[1].body).toEqual({ quote_id: 'q-1', method: 'pix', provider_client_id: 'cli-new' });
    });

    it('a failure that changed nothing in the CRM does not read it again', async () => {
      setup(providerRow({ plan: 'pro' }));
      const clients = statefulClients();
      failingOnce();
      const user = userEvent.setup();
      renderPro('/pro/cobrancas?orcamento=q-1');
      await user.selectOptions(await screen.findByLabelText('Cliente do seu CRM'), 'cli-2');
      const before = clients.reads();
      await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
      await screen.findByRole('alert');
      expect(clients.reads()).toBe(before);
    });

    it('if the list cannot be read again, the form stays as it was and the error shown is the charge\'s', async () => {
      setup(providerRow({ plan: 'pro' }));
      const clients = statefulClients();
      failingOnce();
      const user = userEvent.setup();
      renderPro('/pro/cobrancas?atendimento=b-1');
      await user.type(await screen.findByLabelText('CPF ou CNPJ do cliente'), VALID_CPF);
      clients.failListsFromNow();
      await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/Asaas|cobrança|tente/i);
      expect(screen.getByLabelText('CPF ou CNPJ do cliente')).toHaveValue(VALID_CPF);
      expect(screen.getByRole('button', { name: 'Criar cobrança' })).toBeEnabled();
    });
  });

  it('keeps the target and the payer fixed while a charge is being sent, so a late answer cannot land on another quote', async () => {
    let release: (value: Result) => void = () => {};
    fake.functionsHandlers['charges-create'] = () => new Promise<Result>(resolve => (release = resolve));
    const user = userEvent.setup();
    renderPro('/pro/cobrancas?orcamento=q-1');
    await user.selectOptions(await screen.findByLabelText('Cliente do seu CRM'), 'new');
    await user.type(screen.getByLabelText('CPF ou CNPJ do cliente'), '11.222.333/0001-81');
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Criando…' })).toBeDisabled());
    expect(screen.getByLabelText('O que cobrar')).toBeDisabled();
    expect(screen.getByLabelText('Cliente do seu CRM')).toBeDisabled();

    release(functionData(CHARGE));
    expect(await screen.findByRole('heading', { name: 'Cobrança criada' })).toBeInTheDocument();
    expect(screen.getByLabelText('O que cobrar')).toBeEnabled();
    expect(fake.tableCalls.filter(call => call.table === 'provider_clients' && call.op === 'insert')).toHaveLength(1);
  });

  it('lets an unlinked quote be charged to an existing CRM client that already has the document, without asking for it again', async () => {
    fake.functionsHandlers['charges-create'] = () => functionData(CHARGE);
    const user = userEvent.setup();
    renderPro('/pro/cobrancas?orcamento=q-1');
    await user.selectOptions(await screen.findByLabelText('Cliente do seu CRM'), 'cli-2');
    expect(screen.getByLabelText('Trocar o CPF ou CNPJ (opcional)')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));

    expect(await screen.findByRole('heading', { name: 'Cobrança criada' })).toBeInTheDocument();
    expect(fake.tableCalls.filter(call => call.table === 'provider_clients' && call.op !== 'select')).toEqual([]);
    expect(fake.functionCalls[0].body).toEqual({ quote_id: 'q-1', method: 'pix', provider_client_id: 'cli-2' });
  });

  it('ties each refusal to its own field: described by it, marked invalid, focused, and cleared when the field changes', async () => {
    const user = userEvent.setup();
    renderPro('/pro/cobrancas');
    const target = await screen.findByLabelText('O que cobrar');
    const submit = () => user.click(screen.getByRole('button', { name: 'Criar cobrança' }));

    await submit();
    expect(target).toHaveFocus();
    expect(target).toHaveAttribute('aria-invalid', 'true');
    expect(target).toHaveAccessibleDescription('Escolha o atendimento ou o orçamento a cobrar.');

    await user.selectOptions(target, 'quote:q-1');
    expect(target).not.toHaveAttribute('aria-invalid');
    await submit();
    const payer = screen.getByLabelText('Cliente do seu CRM');
    expect(payer).toHaveFocus();
    expect(payer).toHaveAccessibleDescription(/Escolha o cliente que paga\./);

    await user.selectOptions(target, 'booking:b-1');
    await submit();
    const document = screen.getByLabelText('CPF ou CNPJ do cliente');
    expect(document).toHaveFocus();
    expect(document).toHaveAttribute('aria-invalid', 'true');
    expect(document).toHaveAccessibleDescription(/Informe o CPF ou CNPJ para continuar\./);
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    await user.type(document, '1');
    expect(document).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('checks the target, the payer and the document before calling the function', async () => {
    const user = userEvent.setup();
    renderPro('/pro/cobrancas');
    await screen.findByLabelText('O que cobrar');
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha o atendimento ou o orçamento a cobrar.');

    // A quote without a CRM link needs the payer to be chosen
    await user.selectOptions(screen.getByLabelText('O que cobrar'), 'quote:q-1');
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha o cliente que paga.');

    // A client with no stored document needs one, and it has to be a valid CPF or CNPJ
    await user.selectOptions(screen.getByLabelText('O que cobrar'), 'booking:b-1');
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o CPF ou CNPJ para continuar.');
    await user.type(screen.getByLabelText('CPF ou CNPJ do cliente'), '123.456.789-00');
    await user.click(screen.getByRole('button', { name: 'Criar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um CPF ou CNPJ válido.');
    expect(fake.functionCalls).toEqual([]);
    expect(fake.tableCalls.filter(call => call.table === 'provider_clients' && call.op === 'update')).toEqual([]);
  });

  it.each<[label: string, answer: Result, message: RegExp]>([
    ['pro_required', functionError(403, 'pro_required'), /Este recurso faz parte do plano Pro/],
    ['payments_not_configured', functionError(503, 'payments_not_configured'), /depende de configuração no servidor e ainda não está disponível/],
    ['provider_payment_account_missing', functionError(409, 'provider_payment_account_missing'), /Ative o recebimento em Assinatura/],
    ['booking_not_chargeable', functionError(409, 'booking_not_chargeable'), /não pode ser cobrado na situação atual/],
    ['already_paid', functionError(409, 'already_paid'), /Este item já foi pago/],
    ['customer_document_missing', functionError(409, 'customer_document_missing'), /Cadastre o CPF ou CNPJ do cliente no CRM/],
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

describe('/pro/cobrancas: invoice shortcut and CSV export', () => {
  it('links a received payment to the national NFS-e issuer and says the app does not issue invoices', async () => {
    setup(providerRow({ plan: 'pro' }));
    renderPro('/pro/cobrancas');
    const links = await screen.findAllByRole('link', { name: 'Emitir nota fiscal (NFS-e)' });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'https://www.nfse.gov.br/EmissorNacional');
    expect(links[0]).toHaveAttribute('target', '_blank');
    expect(links[0]).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(links[0].closest('li')).toHaveTextContent(/R\$\s300,00/);
    expect(screen.getByText(/O WorkEasy não emite nota fiscal/)).toBeInTheDocument();
  });

  it('offers no invoice shortcut while nothing was received', async () => {
    setup(providerRow({ plan: 'pro' }));
    fake.tables.payments = () => ok([PAYMENT]);
    renderPro('/pro/cobrancas');
    expect((await screen.findAllByText('Aguardando pagamento')).length).toBeGreaterThan(0);
    expect(screen.queryByRole('link', { name: /NFS-e/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/O WorkEasy não emite nota fiscal/)).not.toBeInTheDocument();
  });

  it('exports the charges as a CSV file that opens in Excel', async () => {
    const downloads = captureDownloads();
    const user = userEvent.setup();
    setup(providerRow({ plan: 'pro' }));
    renderPro('/pro/cobrancas');
    await user.click(await screen.findByRole('button', { name: 'Exportar CSV' }));

    expect(downloads).toHaveLength(1);
    expect(downloads[0].filename).toMatch(/^cobrancas-workeasy-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(downloads[0].blob.type).toBe('text/csv;charset=utf-8');
    expect(await blobHead(downloads[0].blob)).toEqual([0xef, 0xbb, 0xbf]);
    const lines = (await blobText(downloads[0].blob)).split('\r\n');
    expect(lines[0]).toBe('Criada em;Origem;Forma de pagamento;Valor (R$);Situação;Vencimento;Taxa da plataforma (R$)');
    expect(lines).toContain(`05/01/2030;Atendimento;${PAYMENT_METHOD_LABELS.pix};90,00;${PAYMENT_STATUS_LABELS.pending};10/01/2030;0,00`);
    expect(lines).toContain(`05/01/2030;Orçamento;${PAYMENT_METHOD_LABELS.pix};300,00;${PAYMENT_STATUS_LABELS.received};10/01/2030;12,00`);
    expect(lines).toHaveLength(4); // header, two charges, the empty piece after the last line break
  });

  it('has nothing to export without charges', async () => {
    setup(providerRow({ plan: 'pro' }));
    fake.tables.payments = () => ok([]);
    renderPro('/pro/cobrancas');
    expect(await screen.findByText(/Nenhuma cobrança ainda/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Exportar CSV' })).not.toBeInTheDocument();
  });
});
