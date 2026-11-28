import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RideOrderPayments, QuotePaymentRules } from '../../components/mobility/RideOrderPayments';
import { AppError } from '../../lib/errors';
import { rideOrders, type Desk, type Order } from '../../services/rideOrders';
vi.mock('../../services/rideOrders', () => ({
  rideOrders: {
    desk: vi.fn(),
    statement: vi.fn(),
    terms: vi.fn(),
    termsWallet: vi.fn(),
    voidCash: vi.fn(),
    issuer: vi.fn(),
    open: vi.fn(),
    invite: vi.fn(),
    answer: vi.fn(),
    code: vi.fn(),
    report: vi.fn(),
    confirm: vi.fn(),
    checkout: vi.fn(),
    receipt: vi.fn(),
    benefit: vi.fn(),
    add: vi.fn(),
    review: vi.fn(),
    decide: vi.fn(),
    resolve: vi.fn(),
    sendRefund: vi.fn(),
    voidRefund: vi.fn(),
    acceptProviderRefund: vi.fn(),
    withdraw: vi.fn(),
    transfer: vi.fn(),
  },
}));
const desk: Desk = {
  environment: 'simulation',
  methods: ['card', 'cash'],
  can_open: true,
  has_plan: false,
  wait: null,
  orders: [],
  operator: false,
  invites: [],
  benefits: [],
  wallet: null,
};
const order: Order = {
  id: 'ord',
  leg_id: 'leg',
  component: 'fare',
  method: 'card',
  total: 3309,
  extras: 300,
  commission: 300,
  received: 0,
  refunded: 0,
  status: 'pending',
  invoice: 'https://sandbox.asaas.com/i/test',
  mine: true,
  can_invite: false,
  can_report_cash: false,
  benefit: 0,
  benefit_returned: 0,
  receipts: [],
  cases: [],
};
// Mixed funding: R$ 7,00 of benefit plus a captured Pix balance, with an approved case.
const mixed: Order = {
  ...order,
  method: 'pix',
  status: 'paid',
  invoice: null,
  mine: false,
  received: 3309,
  benefit: 700,
  cases: [{ id: 'case', amount: 600, status: 'approved', reason: 'Cobrança a mais', decision: 'Conferido' }],
};
async function openAdmin(o: Order, operator = true) {
  const base = { ...desk, can_open: false, has_plan: true };
  vi.mocked(rideOrders.desk).mockResolvedValue({ ...base, operator, orders: [o] });
  vi.mocked(rideOrders.statement).mockResolvedValue(null);
  const user = userEvent.setup();
  render(<RideOrderPayments legId="leg" mode="admin" />);
  await user.click(screen.getByRole('button', { name: 'Ordens e devoluções do trecho' }));
  await screen.findByText(/Tarifa do trecho/);
  return user;
}
describe('pagamento por componente', () => {
  beforeEach(() => vi.resetAllMocks());
  it('pede consentimento para o método e usa preço no servidor', async () => {
    vi.mocked(rideOrders.desk).mockResolvedValue(desk);
    render(<RideOrderPayments legId="leg" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Formas de pagamento do trecho' }));
    await user.selectOptions(await screen.findByRole('combobox'), 'cash');
    await user.click(screen.getByRole('button', { name: 'Confirmar forma de pagamento' }));
    expect(rideOrders.open).toHaveBeenCalledWith('leg', 'cash');
  });
  it('exibe somente fatura hospedada no domínio do ambiente e a parcela do pagador', async () => {
    vi.mocked(rideOrders.desk).mockResolvedValue({ ...desk, can_open: false, has_plan: true, orders: [order] });
    const user = userEvent.setup();
    const view = render(<RideOrderPayments legId="leg" />);
    await user.click(screen.getByRole('button', { name: 'Formas de pagamento do trecho' }));
    expect(await screen.findByRole('link', { name: 'Abrir fatura hospedada no Asaas' })).toHaveAttribute(
      'href',
      order.invoice,
    );
    vi.mocked(rideOrders.desk).mockResolvedValue({
      ...desk,
      orders: [{ ...order, invoice: 'https://www.asaas.com/i/other-environment' }],
    });
    await user.click(screen.getByRole('button', { name: 'Atualizar informações financeiras' }));
    await waitFor(() => expect(screen.queryByRole('link')).toBeNull());
    view.unmount();
  });
  it('destinatário pode recusar convite sem assumir saldo de outro pagador', async () => {
    vi.mocked(rideOrders.desk).mockResolvedValue({
      ...desk,
      invites: [{ id: 'inv', cents: 1000, expires: '2027-01-02T12:00Z', incoming: true, status: 'pending' }],
    });
    const user = userEvent.setup();
    render(<RideOrderPayments mode="inbox" />);
    await user.click(screen.getByRole('button', { name: 'Divisão de tarifa e meus comprovantes' }));
    await user.click(await screen.findByRole('button', { name: 'Recusar divisão' }));
    expect(rideOrders.answer).toHaveBeenCalledWith('inv', false);
    expect(rideOrders.checkout).not.toHaveBeenCalled();
  });
  it('só solicita o saque após apresentar prazo, tarifa e líquido', async () => {
    vi.mocked(rideOrders.desk).mockResolvedValue({
      ...desk,
      wallet: { available: 1500, fee: 30, limit: 2000, withdrawals: [] },
    });
    vi.mocked(rideOrders.termsWallet).mockResolvedValue({ time: 'Até o próximo dia útil', fee: 30, limit: 2000 });
    vi.mocked(rideOrders.withdraw).mockResolvedValue('withdraw-test');
    const user = userEvent.setup();
    render(<RideOrderPayments mode="driver" />);
    await user.click(screen.getByRole('button', { name: 'Carteira do motorista' }));
    await user.type(await screen.findByRole('textbox', { name: 'Valor bruto do saque (R$)' }), '10,50');
    await user.click(screen.getByRole('button', { name: 'Conferir valor líquido' }));
    expect(await screen.findByText(/líquido R.*10,20/)).toHaveTextContent('Até o próximo dia útil');
    expect(rideOrders.withdraw).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar saque para minha conta bancária' }));
    expect(rideOrders.withdraw).toHaveBeenCalledWith(expect.any(String), 1050, 30);
    expect(rideOrders.transfer).toHaveBeenCalledWith('withdraw-test');
  });
  it('mostra limite, preço base e política de espera congelados no aceite', async () => {
    vi.mocked(rideOrders.terms).mockResolvedValue([
      {
        seq: 1,
        total_cents: 3309,
        maximum_cents: 3309,
        extras_cents: 300,
        rule: {
          base_cents: 2006,
          multiplier_bps: 15000,
          free_wait_minutes: 5,
          wait_cents_per_minute: 90,
          absence_policy: 'Acione o plantão.',
        },
      },
    ]);
    render(<QuotePaymentRules quote="q" />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver composição e regras do meu preço' }));
    expect(await screen.findByText(/Acione o plantão/)).toHaveTextContent('1,5×');
    expect(rideOrders.terms).toHaveBeenCalledWith('q');
  });
});
describe('devolução por uma única fonte', () => {
  beforeEach(() => vi.resetAllMocks());
  it('operador anula a tentativa de estorno que falhou e recebe a confirmação', async () => {
    vi.mocked(rideOrders.voidRefund).mockResolvedValue('voided');
    const user = await openAdmin(mixed);
    await user.click(screen.getByText('Estorno no Asaas falhou em definitivo'));
    await user.type(
      screen.getByRole('textbox', { name: 'Comprovante da falha do estorno no Asaas' }),
      'Protocolo Asaas 123',
    );
    await user.click(screen.getByRole('button', { name: 'Anular tentativa de estorno' }));
    expect(rideOrders.voidRefund).toHaveBeenCalledWith('case', 'Protocolo Asaas 123');
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Tentativa anulada. Restitua este protocolo pelo benefício original, ou solicite novo estorno se a tentativa não chegou ao Asaas.',
    );
    expect(rideOrders.desk).toHaveBeenCalledTimes(2);
    expect(rideOrders.resolve).not.toHaveBeenCalled();
    expect(rideOrders.sendRefund).not.toHaveBeenCalled();
  });
  it('anulação recusada mostra o erro e não confirma', async () => {
    vi.mocked(rideOrders.voidRefund).mockRejectedValue(new AppError('ride_operation_conflict'));
    const user = await openAdmin(mixed);
    await user.click(screen.getByText('Estorno no Asaas falhou em definitivo'));
    await user.type(
      screen.getByRole('textbox', { name: 'Comprovante da falha do estorno no Asaas' }),
      'Outro comprovante',
    );
    await user.click(screen.getByRole('button', { name: 'Anular tentativa de estorno' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta referência financeira já corresponde');
    expect(screen.queryByRole('status')).toBeNull();
    expect(rideOrders.desk).toHaveBeenCalledTimes(1);
  });
  it('operador aceita a devolução feita direto no provedor com total, adicionais e extrato', async () => {
    vi.mocked(rideOrders.acceptProviderRefund).mockResolvedValue('case-provider');
    const user = await openAdmin({ ...mixed, status: 'review', cases: [] });
    await user.click(screen.getByText('Devolução feita direto no Asaas'));
    await user.type(screen.getByRole('textbox', { name: 'Total já devolvido no Asaas (R$)' }), '5,00');
    await user.type(screen.getByRole('textbox', { name: 'Adicionais incluídos na devolução (R$)' }), '0');
    await user.type(screen.getByRole('textbox', { name: 'Extrato do Asaas com a devolução' }), 'Extrato 77');
    await user.click(screen.getByRole('button', { name: 'Aceitar devolução do provedor' }));
    expect(rideOrders.acceptProviderRefund).toHaveBeenCalledWith('ord', 500, 0, 'Extrato 77');
    expect(await screen.findByRole('status')).toHaveTextContent('Devolução vinculada a um protocolo aprovado');
    // The same extras and reference re-query the charge so the refund is booked in the same step.
    expect(rideOrders.sendRefund).toHaveBeenCalledWith('case-provider', 0, 'Extrato 77');
  });
  it('consulta que falha após o aceite mostra o erro e o reenvio repete aceite e consulta', async () => {
    vi.mocked(rideOrders.acceptProviderRefund).mockResolvedValue('case-provider');
    vi.mocked(rideOrders.sendRefund).mockRejectedValueOnce(new AppError('ride_psp_unknown'));
    const user = await openAdmin({ ...mixed, status: 'review', cases: [] });
    await user.click(screen.getByText('Devolução feita direto no Asaas'));
    await user.type(screen.getByRole('textbox', { name: 'Total já devolvido no Asaas (R$)' }), '5,00');
    await user.type(screen.getByRole('textbox', { name: 'Adicionais incluídos na devolução (R$)' }), '0');
    await user.type(screen.getByRole('textbox', { name: 'Extrato do Asaas com a devolução' }), 'Extrato 77');
    await user.click(screen.getByRole('button', { name: 'Aceitar devolução do provedor' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O Asaas ainda não confirmou');
    expect(screen.queryByRole('status')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Aceitar devolução do provedor' }));
    expect(await screen.findByRole('status')).toHaveTextContent('cobrança reconsultada no Asaas');
    expect(rideOrders.acceptProviderRefund).toHaveBeenCalledTimes(2);
    expect(rideOrders.sendRefund).toHaveBeenLastCalledWith('case-provider', 0, 'Extrato 77');
  });
  it('ordem sem benefício orienta retirar a aprovação após a anulação e oferece essa ação', async () => {
    vi.mocked(rideOrders.voidRefund).mockResolvedValue('voided');
    vi.mocked(rideOrders.decide).mockResolvedValue('declined');
    const user = await openAdmin({ ...mixed, method: 'card', benefit: 0 });
    expect(screen.queryByRole('button', { name: 'Conciliar restituição documentada' })).toBeNull();
    await user.click(screen.getByText('Estorno no Asaas falhou em definitivo'));
    await user.type(screen.getByRole('textbox', { name: 'Comprovante da falha do estorno no Asaas' }), 'Falha 9');
    await user.click(screen.getByRole('button', { name: 'Anular tentativa de estorno' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Esta ordem não tem benefício: retire a aprovação do protocolo, ou solicite novo estorno',
    );
    await user.click(screen.getByText('Retirar a aprovação deste protocolo'));
    await user.type(screen.getByRole('textbox', { name: 'Motivo da retirada da aprovação' }), 'Sem fonte');
    await user.click(screen.getByRole('button', { name: 'Recusar protocolo aprovado' }));
    expect(rideOrders.decide).toHaveBeenCalledWith('case', false, 'Sem fonte');
  });
  it('ordem fora de revisão não oferece o aceite de devolução do provedor', async () => {
    await openAdmin(mixed);
    expect(screen.queryByText('Devolução feita direto no Asaas')).toBeNull();
    expect(screen.getByText('Estorno no Asaas falhou em definitivo')).toBeInTheDocument();
  });
  it('quem não é operador não vê a anulação nem o aceite', async () => {
    await openAdmin({ ...mixed, status: 'review' }, false);
    expect(screen.queryByText('Estorno no Asaas falhou em definitivo')).toBeNull();
    expect(screen.queryByText('Retirar a aprovação deste protocolo')).toBeNull();
    expect(screen.queryByText('Devolução feita direto no Asaas')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Anular tentativa de estorno' })).toBeNull();
  });
});
