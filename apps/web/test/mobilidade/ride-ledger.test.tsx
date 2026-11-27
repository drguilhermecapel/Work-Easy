import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RideLedgerPanel } from '../../pages/admin/RideLedgerPanel';
import { confirmLiveRideCost, confirmSimulatedRideCost, getRideSettlement, recordRideCostDisbursement, simulateRideFinanceEvent, type RideSettlement } from '../../services/rideLedger';

vi.mock('../../services/rideLedger', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/rideLedger')>(),
  getRideSettlement: vi.fn(), simulateRideFinanceEvent: vi.fn(), confirmSimulatedRideCost: vi.fn(), confirmLiveRideCost: vi.fn(), recordRideCostDisbursement: vi.fn(),
}));

const data: Extract<RideSettlement, { recognized: true }> = {
  recognized: true, source: 'manual', environment: 'simulation', fare_cents: 3309, extras_cents: 300,
  fee_cents: 300, driver_cents: 3009, cash_cents: 0, receivable_cents: 3309, driver_balance_cents: 3009,
  commission_cents: 300, processing_cost_cents: 0, disputed_cents: 0, reversed_cents: 0, reversed_extras_cents: 0, unknown: null,
};
const leg = '88f43429-57ec-4976-a5b8-28c140e206e8';

describe('conciliação financeira da corrida', () => {
  beforeEach(() => vi.resetAllMocks());

  it('não oferece lançamento para corrida aberta ou transação reservada ao PSP', async () => {
    vi.mocked(getRideSettlement).mockResolvedValueOnce({ recognized: false }).mockResolvedValueOnce({ ...data, source: 'psp_sandbox' });
    const view = render(<RideLedgerPanel legId={leg} />);
    expect(await screen.findByText(/ainda não tem valores reconhecidos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar evento/ })).not.toBeInTheDocument();
    view.rerender(<RideLedgerPanel legId="outro-trecho" />);
    expect(await screen.findByText(/vinculada ao PSP/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar evento/ })).not.toBeInTheDocument();
  });

  it('exige desfecho certo antes de registrar despesa e conserva sua evidência', async () => {
    const review = { environment: 'simulation' as const, cost_cents: null, evidence: null, can_review: true, paid_cents: 0, payable_cents: null };
    vi.mocked(getRideSettlement)
      .mockResolvedValueOnce({ recognized: false, review: { ...review, status: 'unknown' } })
      .mockResolvedValueOnce({ recognized: false, review: { ...review, status: 'cancelled' } })
      .mockResolvedValueOnce({ recognized: false, review: { ...review, status: 'cancelled', cost_cents: 600, evidence: 'RC-9' } });
    vi.mocked(confirmSimulatedRideCost).mockResolvedValue({ recognized: false });
    const user = userEvent.setup();
    const view = render(<RideLedgerPanel legId={leg} />);
    expect(await screen.findByText(/custo permanece em apuração/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar custo/ })).not.toBeInTheDocument();
    view.rerender(<RideLedgerPanel legId="trecho-confirmado" />);
    await user.type(await screen.findByLabelText(/Custo comprovado em reais/), '6,00');
    await user.type(screen.getByLabelText(/Referência interna/), 'RC-9');
    await user.click(screen.getByRole('button', { name: /Registrar custo/ }));
    await waitFor(() => expect(confirmSimulatedRideCost).toHaveBeenCalledWith('trecho-confirmado', expect.any(String), 600, 'RC-9'));
    expect(await screen.findByText(/Custo de cancelamento comprovado/)).toHaveTextContent('RC-9');
  });

  it('separa despesa ao confirmar cancelamento real do desembolso bancário comprovado', async () => {
    const review = { environment: 'live' as const, status: 'cancelled' as const, cost_cents: null,
      evidence: null, can_review: false, paid_cents: 0, payable_cents: null };
    vi.mocked(getRideSettlement)
      .mockResolvedValueOnce({ recognized: false, review })
      .mockResolvedValueOnce({ recognized: false, review: { ...review, can_review: true } })
      .mockResolvedValueOnce({ recognized: false, review: { ...review, can_review: true, cost_cents: 600, payable_cents: 600, evidence: 'RC' } })
      .mockResolvedValueOnce({ recognized: false, review: { ...review, can_review: true, cost_cents: 600, payable_cents: 200, paid_cents: 400, evidence: 'RC' } });
    vi.mocked(confirmLiveRideCost).mockResolvedValue({ recognized: false });
    vi.mocked(recordRideCostDisbursement).mockResolvedValue({ recognized: false });
    const user = userEvent.setup();
    const view = render(<RideLedgerPanel legId={leg} />);
    expect(await screen.findByText(/aguarda habilitação/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar custo/ })).not.toBeInTheDocument();
    view.rerender(<RideLedgerPanel legId="live-autorizado" />);
    await user.type(await screen.findByLabelText(/Custo comprovado em reais/), '6');
    await user.type(screen.getByLabelText(/Referência interna/), 'RC');
    await user.click(screen.getByRole('button', { name: /Registrar custo/ }));
    expect(await screen.findByText(/Custo de cancelamento comprovado/)).toBeInTheDocument();
    expect(confirmLiveRideCost).toHaveBeenCalledWith('live-autorizado', expect.any(String), 600, 'RC');
    expect(recordRideCostDisbursement).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/Valor já desembolsado/), '4');
    await user.type(screen.getByLabelText(/Referência interna/), 'BANCO-1');
    await user.click(screen.getByRole('button', { name: /Conciliar desembolso/ }));
    await waitFor(() => expect(recordRideCostDisbursement).toHaveBeenCalledWith('live-autorizado', expect.any(String), 400, 'BANCO-1'));
    expect(simulateRideFinanceEvent).not.toHaveBeenCalled();
  });

  it('reutiliza o identificador e o valor originais ao resolver um timeout', async () => {
    const operation = 'd173724b-f118-4474-baa6-f5ebc325f998';
    const pending: RideSettlement = { ...data, unknown: { operation_id: operation, kind: 'capture_unknown', amount_cents: 3309, extras_cents: 0 } };
    vi.mocked(getRideSettlement).mockResolvedValueOnce(pending).mockResolvedValueOnce(data);
    vi.mocked(simulateRideFinanceEvent).mockResolvedValue(data);
    const user = userEvent.setup();
    render(<RideLedgerPanel legId={leg} />);
    expect(await screen.findByText(/Há uma operação incerta/)).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Confirmar repasse' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar evento simulado' }));
    await waitFor(() => expect(simulateRideFinanceEvent).toHaveBeenCalledWith(leg, operation, 'capture', 3309, 0));
  });
});
