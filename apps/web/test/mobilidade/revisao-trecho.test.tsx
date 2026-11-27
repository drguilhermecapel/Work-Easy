import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RideAmendmentPanel } from '../../components/mobility/RideAmendmentPanel';
import { amendmentState, decideAmendment, type AmendmentState } from '../../services/rideAmendments';
import { listRideRouteCases } from '../../services/rideRoutes';
vi.mock('../../services/rideAmendments', () => ({ amendmentState: vi.fn(), decideAmendment: vi.fn(), proposeAmendment: vi.fn() }));
vi.mock('../../services/rideRoutes', () => ({ listRideRouteCases: vi.fn() }));
vi.mock('../../components/mobility/RidePointInput', () => ({ RidePointInput: () => null }));
const at = '2026-11-27T15:00:00Z';
const state: AmendmentState = {
  can_propose: false, can_reschedule: false, status: 'accepted', origin_area: null, destination_area: null,
  anchor: null, current_cents: 1925,
  changes: [{ id: 'revision', status: 'pending', pickup_at: at, created_at: at, expires_at: at,
    previous_destination: null, is_current: false, consumed_variable_cents: 0, fare_cents: 2000, old_cents: 1925, driver_cents: null, may_decide: true, accepted_by_me: false,
    remaining_minutes: null, destination: null, stops: null }],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(amendmentState).mockResolvedValue(state);
  vi.mocked(listRideRouteCases).mockResolvedValue([]);
});
describe('alterações no trecho contratado', () => {
  it('avisa o pagador fora do painel e exige aceite expresso do novo total', async () => {
    const user = userEvent.setup();
    vi.mocked(decideAmendment).mockResolvedValue({ status: 'pending' });
    render(<RideAmendmentPanel legId="leg" legStatus="accepted" onChanged={vi.fn()} />);
    expect(await screen.findByText('Uma revisão do trajeto aguarda sua decisão.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Alterações do trecho' }));
    expect(await screen.findByText(/Novo total e limite/)).toHaveTextContent(/20,00/);
    expect(screen.queryByText(/Ordem das paradas/)).not.toBeInTheDocument();
    expect(decideAmendment).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Aceitar nova rota e condições' }));
    expect(decideAmendment).toHaveBeenCalledWith('revision', true);
    expect(await screen.findByText(/Aguardando os demais participantes/)).toBeVisible();
  });
  it('permite ao motorista recusar as condições propostas', async () => {
    const user = userEvent.setup();
    vi.mocked(decideAmendment).mockResolvedValue({ status: 'declined' });
    vi.mocked(amendmentState).mockResolvedValue({
      ...state, changes: [{ ...state.changes[0], fare_cents: null, old_cents: null, driver_cents: 1660,
        destination: 'Destino do trecho', stops: ['Parada um', 'Parada dois'] }],
    });
    render(<RideAmendmentPanel legId="leg" legStatus="accepted" onChanged={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Alterações do trecho' }));
    expect(await screen.findByText(/Parada um → Parada dois/)).toBeVisible();
    expect(screen.getByText(/Repasse proposto/)).toHaveTextContent(/16,60/);
    await user.click(screen.getByRole('button', { name: 'Recusar revisão' }));
    expect(decideAmendment).toHaveBeenCalledWith('revision', false);
    expect(await screen.findByText(/última rota aceita continua vigente/)).toBeVisible();
  });
  it('mantém o percurso vigente quando o ponto a bordo perdeu validade', async () => {
    const user = userEvent.setup();
    vi.mocked(amendmentState).mockResolvedValue({ ...state, can_propose: true, status: 'boarded', changes: [] });
    render(<RideAmendmentPanel legId="leg" legStatus="boarded" onChanged={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Alterações do trecho' }));
    expect(await screen.findByText(/Consulte o plantão/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cotar revisão do trecho' })).not.toBeInTheDocument();
  });
});
