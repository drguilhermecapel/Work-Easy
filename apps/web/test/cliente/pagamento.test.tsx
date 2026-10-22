import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CLIENT_ID, PROVIDER_ID, bookingRow, newWorld, noAdmin, paymentRow, worldTables, type FakeSupabase, type World } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { AuthProvider } = await import('../../contexts/AuthContext');
const { default: AtendimentoDetalhe } = await import('../../pages/cliente/AtendimentoDetalhe');
const fake = supabase as unknown as FakeSupabase;

let world: World;

const renderDetail = () =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/atendimentos/book-1']}>
        <Routes>
          <Route path="/atendimentos/:id" element={<AtendimentoDetalhe />} />
          <Route path="/conta" element={<p>Tela da conta</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

const CHARGE = {
  payment_id: 'pay-1',
  method: 'pix',
  status: 'pending',
  amount_cents: 18000,
  due_date: '2030-01-12',
  invoice_url: 'https://sandbox.asaas.com/i/abc123',
  pix: { payload: '00020126580014br.gov.bcb.pix0136abc', qr_code_base64: 'iVBORw0KGgo=' },
  reused: false,
};

describe('payment of a booking (payments-create)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    fake.reset();
    world = newWorld();
    world.bookings = [bookingRow()];
    fake.tables = worldTables(world);
    fake.rpcs = { ...noAdmin };
    fake.session = { access_token: 't', user: { id: CLIENT_ID, email: 'maria@example.com' } };
  });

  it('creates a Pix charge and shows the copy-and-paste code, the QR code and the invoice link', async () => {
    fake.functionsHandlers['payments-create'] = () => ({ data: { ok: true, data: CHARGE }, error: null });
    const user = userEvent.setup();
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Gerar cobrança' }));

    expect(await screen.findByLabelText('Pix copia e cola')).toHaveValue(CHARGE.pix.payload);
    expect(fake.functionCalls).toEqual([{ name: 'payments-create', body: { booking_id: 'book-1', method: 'pix' } }]);
    expect(screen.getByAltText('QR Code do Pix para pagar este atendimento')).toHaveAttribute('src', 'data:image/png;base64,iVBORw0KGgo=');
    const invoice = screen.getByRole('link', { name: /Abrir fatura do Asaas/ });
    expect(invoice).toHaveAttribute('href', CHARGE.invoice_url);
    expect(invoice).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(screen.getByText(/vence em 12\/01\/2030/)).toBeInTheDocument();
  });

  it('does not show an open charge as payable once the booking is canceled', async () => {
    world.bookings = [bookingRow({ status: 'canceled' })];
    world.payments = [paymentRow({ status: 'pending', pix_payload: '00020126580014br.gov.bcb.pix0136abc', invoice_url: 'https://sandbox.asaas.com/i/abc123' })];
    renderDetail();

    expect(await screen.findByText(/Atendimento cancelado: não há pagamento a fazer\./)).toBeInTheDocument();
    expect(screen.getByText(/não a pague/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Pix copia e cola')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Abrir fatura do Asaas/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gerar/ })).not.toBeInTheDocument();
  });

  it('copies the Pix code', async () => {
    fake.functionsHandlers['payments-create'] = () => ({ data: { ok: true, data: CHARGE }, error: null });
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Gerar cobrança' }));
    await user.click(await screen.findByRole('button', { name: 'Copiar código' }));
    expect(await screen.findByText('Código copiado. Cole no app do seu banco.')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(CHARGE.pix.payload);
  });

  it('never asks for card data: the card is typed on the Asaas page', async () => {
    fake.functionsHandlers['payments-create'] = () => ({
      data: { ok: true, data: { ...CHARGE, method: 'credit_card', pix: null } },
      error: null,
    });
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('radio', { name: /Cartão de crédito/ }));
    expect(screen.queryByLabelText(/número do cartão|cvv|validade/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Gerar cobrança' }));
    expect(await screen.findByRole('link', { name: /Abrir fatura do Asaas/ })).toBeInTheDocument();
    expect(fake.functionCalls[0].body).toEqual({ booking_id: 'book-1', method: 'credit_card' });
    expect(screen.getByText(/nunca aqui/)).toBeInTheDocument();
  });

  it('only opens https invoice links', async () => {
    fake.functionsHandlers['payments-create'] = () => ({
      data: { ok: true, data: { ...CHARGE, invoice_url: 'javascript:alert(1)' } },
      error: null,
    });
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Gerar cobrança' }));
    await screen.findByLabelText('Pix copia e cola');
    expect(screen.queryByRole('link', { name: /fatura/ })).not.toBeInTheDocument();
  });

  it('asks for CPF or CNPJ when the function requires it, then sends it once', async () => {
    let calls = 0;
    fake.functionsHandlers['payments-create'] = () => {
      calls += 1;
      return calls === 1
        ? { data: { ok: false, error: { code: 'cpf_cnpj_required', message: 'Informe o CPF ou CNPJ' } }, error: null }
        : { data: { ok: true, data: CHARGE }, error: null };
    };
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Gerar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o CPF ou CNPJ para continuar.');

    const field = screen.getByLabelText(/CPF ou CNPJ/);
    expect(screen.getByRole('button', { name: 'Gerar cobrança' })).toBeDisabled();
    await user.type(field, '529.982.247-25');
    await user.click(screen.getByRole('button', { name: 'Gerar cobrança' }));
    await screen.findByLabelText('Pix copia e cola');
    expect(fake.functionCalls[1].body).toEqual({ booking_id: 'book-1', method: 'pix', cpf_cnpj: '52998224725' });
  });

  it('rejects a malformed CPF before calling the function', async () => {
    fake.functionsHandlers['payments-create'] = () => ({
      data: { ok: false, error: { code: 'cpf_cnpj_required', message: '' } },
      error: null,
    });
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Gerar cobrança' }));
    await user.type(await screen.findByLabelText(/CPF ou CNPJ/), '123');
    await user.click(screen.getByRole('button', { name: 'Gerar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um CPF (11 números) ou CNPJ (14 números) válido.');
    expect(fake.functionCalls).toHaveLength(1);
  });

  it('says the payment depends on configuration when the function is not configured', async () => {
    fake.functionsHandlers['payments-create'] = () => ({
      data: { ok: false, error: { code: 'payments_not_configured', message: 'Pagamentos não configurados' } },
      error: null,
    });
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Gerar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este recurso depende de configuração no servidor e ainda não está disponível.');
  });

  it('explains when the professional has no receiving account yet', async () => {
    fake.functionsHandlers['payments-create'] = () => ({
      data: { ok: false, error: { code: 'provider_payment_account_missing', message: 'x' } },
      error: null,
    });
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Gerar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este profissional ainda não ativou o recebimento pelo app.');
  });

  it('says the item was already paid when the function refuses a second charge', async () => {
    fake.functionsHandlers['payments-create'] = () => ({
      data: { ok: false, error: { code: 'already_paid', message: 'x' } },
      error: null,
    });
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Gerar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este item já foi pago. Não é possível cobrar de novo.');
  });

  it('points to the account when the name is missing', async () => {
    fake.functionsHandlers['payments-create'] = () => ({
      data: { ok: false, error: { code: 'profile_incomplete', message: 'x' } },
      error: null,
    });
    const user = userEvent.setup();
    renderDetail();
    await user.click(await screen.findByRole('button', { name: 'Gerar cobrança' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Complete seu nome em Minha conta antes de continuar.');
    expect(screen.getByRole('link', { name: 'Ir para Minha conta' })).toHaveAttribute('href', '/conta');
  });

  it('shows the open charge of a previous visit', async () => {
    world.payments = [
      paymentRow({ status: 'pending', pix_payload: '000201-pendente', invoice_url: 'https://sandbox.asaas.com/i/old', due_date: '2099-01-01' }),
    ];
    renderDetail();
    expect(await screen.findByLabelText('Pix copia e cola')).toHaveValue('000201-pendente');
    expect(screen.getByRole('button', { name: 'Gerar nova cobrança' })).toBeInTheDocument();
  });

  it('shows the payment as received and offers no new charge', async () => {
    world.payments = [paymentRow({ status: 'received' })];
    renderDetail();
    expect(await screen.findByText(/Pagamento recebido pelo app: R\$ 180,00 \(Pix\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Gerar/ })).not.toBeInTheDocument();
  });

  it('does not offer payment before the professional accepts', async () => {
    world.bookings = [bookingRow({ status: 'requested' })];
    renderDetail();
    expect(await screen.findByText(/fica disponível depois que o profissional aceitar/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerar cobrança' })).not.toBeInTheDocument();
  });

  it('the professional only sees the status', async () => {
    fake.session = { access_token: 't', user: { id: PROVIDER_ID } };
    world.userId = PROVIDER_ID;
    renderDetail();
    expect(await screen.findByText(/O cliente ainda não gerou a cobrança/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerar cobrança' })).not.toBeInTheDocument();
  });

  it('talks only about payment through the app while escrow is off', async () => {
    renderDetail();
    const panel = (await screen.findByRole('heading', { name: 'Pagamento' })).closest('section') as HTMLElement;
    expect(within(panel).getByText(/O pagamento é feito pelo app/)).toBeInTheDocument();
    expect(panel.textContent?.toLowerCase()).not.toContain('retido');
    await waitFor(() => expect(screen.queryByText(/Pagamento retido/)).not.toBeInTheDocument());
  });
});
