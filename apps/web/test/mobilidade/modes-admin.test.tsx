import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RideModes from '../../pages/admin/RideModes';
import { rideShuttle, type AdminDeparture } from '../../services/rideModes';

vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: 'backend', authUser: { id: 'admin' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../services/rideModes', () => ({
  rideShuttle: { adminDepartures: vi.fn(), cancelDeparture: vi.fn() },
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const departure = (over: Partial<AdminDeparture> = {}): AdminDeparture => ({
  id: 'partida-1',
  origin_area: 'Saúde',
  destination_area: 'Aeroporto de ensaio',
  departs_at: '2090-01-10T12:00:00Z',
  seats_total: 12,
  seats_confirmed: 7,
  state: 'open',
  driver_assigned: false,
  ...over,
});
const open = () =>
  render(
    <MemoryRouter>
      <RideModes />
    </MemoryRouter>,
  );

beforeEach(() => vi.resetAllMocks());

describe('administração das modalidades de corrida', () => {
  it('lista as partidas no horário de São Paulo e só permite cancelar as abertas', async () => {
    vi.mocked(rideShuttle.adminDepartures).mockResolvedValue({
      simulation: true,
      departures: [departure(), departure({ id: 'partida-2', state: 'departed', driver_assigned: true })],
    });
    open();
    expect(await screen.findByText(/Partida 10\/01\/2090 09:00 \(São Paulo\) · Aberta · Sem motorista designado/)).toBeVisible();
    expect(screen.getByText(/Já partiu · Motorista designado/)).toBeVisible();
    expect(screen.getAllByText('7 de 12 assentos reservados')).toHaveLength(2);
    expect(screen.getByText(/Ensaio com dados fictícios/)).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Cancelar partida' })).toHaveLength(1);
  });

  it('exige motivo, confirma o cancelamento e repete a mesma chave ao reenviar', async () => {
    vi.mocked(rideShuttle.adminDepartures).mockResolvedValue({ simulation: true, departures: [departure()] });
    vi.mocked(rideShuttle.cancelDeparture)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ released_seats: 7, refund_due_cents: 0 });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar partida' }));
    expect(screen.getByText(/O cancelamento não pode ser desfeito\. 7 assentos serão liberados/)).toBeVisible();
    const confirm = screen.getByRole('button', { name: 'Confirmar cancelamento da partida' });
    expect(confirm).toBeDisabled();
    expect(rideShuttle.cancelDeparture).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Motivo do cancelamento'), { target: { value: '  Motorista ausente  ' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento da partida' }));
    expect(await screen.findByText('Partida cancelada. 7 assentos liberados.')).toBeVisible();

    const calls = vi.mocked(rideShuttle.cancelDeparture).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(['partida-1', 'Motorista ausente', expect.stringMatching(UUID)]);
    expect(calls[1][2]).toBe(calls[0][2]);
    await waitFor(() => expect(rideShuttle.adminDepartures).toHaveBeenCalledTimes(3));
  });

  it('permite desistir do cancelamento e mostra o estado vazio', async () => {
    vi.mocked(rideShuttle.adminDepartures).mockResolvedValue({ simulation: false, departures: [departure()] });
    const first = open();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar partida' }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.queryByLabelText('Motivo do cancelamento')).toBeNull();
    expect(screen.queryByText(/Ensaio com dados fictícios/)).toBeNull();
    expect(rideShuttle.cancelDeparture).not.toHaveBeenCalled();
    first.unmount();

    vi.mocked(rideShuttle.adminDepartures).mockResolvedValue({ simulation: true, departures: [] });
    open();
    expect(await screen.findByText(/Nenhuma partida cadastrada/)).toBeVisible();
  });
});
