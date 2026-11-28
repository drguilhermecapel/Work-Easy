import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriverModeTasks from '../../components/mobility/modes/DriverModeTasks';
import { ReservePanel } from '../../components/mobility/modes/ReservePanel';
import ShuttleSeats from '../../components/mobility/modes/ShuttleSeats';
import {
  driverModes,
  rideReserve,
  rideShuttle,
  type ReserveTerms,
  type ShuttleBoard,
  type ShuttleSeat,
} from '../../services/rideModes';

vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: 'backend', authUser: { id: 'passageira' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../services/rideModes', () => ({
  rideReserve: { state: vi.fn(), shift: vi.fn(), contingency: vi.fn(), decideShift: vi.fn() },
  rideShuttle: { board: vi.fn(), book: vi.fn(), cancel: vi.fn(), rebook: vi.fn(), manifest: vi.fn() },
  rideBlocks: { decide: vi.fn() },
  driverModes: { tasks: vi.fn() },
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const refusal = (code: string) => ({ code: 'P0001', message: code });
const terms = (over: Partial<ReserveTerms> = {}): ReserveTerms => ({
  state: 'awaiting_driver',
  confirm_by: '2090-01-10T11:00:00Z',
  terminal: 'Terminal 2',
  flight_ref: 'WE1234',
  max_shift_minutes: 180,
  shift: null,
  ...over,
});
const leg = { id: 'trecho-reserva', status: 'requested', pickup_at: '2090-01-10T12:00:00Z' };
const seat = (over: Partial<ShuttleSeat> = {}): ShuttleSeat => ({
  id: 'assento-1',
  line_id: 'linha-1',
  departure_id: 'partida-1',
  origin_area: 'Saúde',
  destination_area: 'Aeroporto de ensaio',
  departs_at: '2090-01-10T12:00:00Z',
  seats: 1,
  seat_cents: 2500,
  state: 'confirmed',
  ...over,
});
const board = (mine: ShuttleSeat[] = []): ShuttleBoard => ({
  simulation: true,
  lines: [
    {
      id: 'linha-1',
      origin_area: 'Saúde',
      destination_area: 'Aeroporto de ensaio',
      seat_cents: 2500,
      departures: [
        { id: 'partida-1', departs_at: '2090-01-10T12:00:00Z', seats_total: 12, seats_left: 1, state: 'open' },
        { id: 'partida-2', departs_at: '2090-01-10T15:00:00Z', seats_total: 12, seats_left: 5, state: 'open' },
      ],
    },
  ],
  my_seats: mine,
});
const openShuttle = () =>
  render(
    <MemoryRouter>
      <ShuttleSeats />
    </MemoryRouter>,
  );

beforeEach(() => vi.resetAllMocks());

describe('reserva agendada', () => {
  it('mostra o prazo de confirmação e o voo, e repete a mesma chave ao reenviar o atraso', async () => {
    vi.mocked(rideReserve.state).mockResolvedValue(terms());
    vi.mocked(rideReserve.shift)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue({ id: 'mudanca', state: 'applied', new_pickup: '2090-01-10T13:30:00Z', expires_at: null });
    const changed = vi.fn();
    render(<ReservePanel leg={leg} onChanged={changed} />);
    expect(await screen.findByText(/precisa confirmar até 10\/01\/2090 08:00 \(São Paulo\)/)).toBeVisible();
    expect(screen.getByText(/Terminal Terminal 2 · Voo WE1234/)).toBeVisible();
    expect(rideReserve.state).toHaveBeenCalledWith('trecho-reserva');

    fireEvent.click(screen.getByRole('button', { name: 'Meu voo atrasou' }));
    fireEvent.change(screen.getByLabelText('Novo horário de embarque (São Paulo)'), {
      target: { value: '2090-01-10T10:30' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Pedir novo horário' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Pedir novo horário' }));
    expect(await screen.findByText(/Horário alterado para 10\/01\/2090 10:30 \(São Paulo\)/)).toBeVisible();

    const calls = vi.mocked(rideReserve.shift).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(['trecho-reserva', '2090-01-10T13:30:00.000Z', 'flight_delay', expect.stringMatching(UUID)]);
    expect(calls[1][3]).toBe(calls[0][3]);
    expect(changed).toHaveBeenCalled();
  });

  it('avisa que o motorista confirmado precisa aceitar e não envia atraso acima do limite da reserva', async () => {
    vi.mocked(rideReserve.state).mockResolvedValue(terms({ state: 'confirmed' }));
    vi.mocked(rideReserve.shift).mockResolvedValue({
      id: 'mudanca',
      state: 'proposed',
      new_pickup: '2090-01-10T13:00:00Z',
      expires_at: '2090-01-10T10:00:00Z',
    });
    render(<ReservePanel leg={{ ...leg, status: 'accepted' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Meu voo atrasou' }));
    expect(screen.getByText(/O motorista confirmado precisa aceitar o novo horário/)).toBeVisible();
    const field = screen.getByLabelText('Novo horário de embarque (São Paulo)');
    fireEvent.change(field, { target: { value: '2090-01-10T14:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pedir novo horário' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('até 180 min');
    expect(rideReserve.shift).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: '2090-01-10T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pedir novo horário' }));
    expect(await screen.findByText(/Pedido enviado ao motorista, que responde até 10\/01\/2090 07:00/)).toBeVisible();
  });

  it('na contingência continua a busca, remarca com novo horário e só cancela após confirmação', async () => {
    vi.mocked(rideReserve.state).mockResolvedValue(terms({ state: 'contingency' }));
    vi.mocked(rideReserve.contingency).mockResolvedValue({ state: 'awaiting_driver' });
    render(<ReservePanel leg={leg} />);
    expect(await screen.findByText(/Nenhum motorista confirmou até 10\/01\/2090 08:00/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Continuar buscando motorista' }));
    await waitFor(() =>
      expect(rideReserve.contingency).toHaveBeenLastCalledWith(
        'trecho-reserva',
        'keep_searching',
        null,
        expect.stringMatching(UUID),
      ),
    );
    expect(await screen.findByText(/A busca por motorista continua/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Remarcar para outro horário' }));
    fireEvent.change(screen.getByLabelText('Novo horário de embarque (São Paulo)'), {
      target: { value: '2090-01-11T09:00' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar novo horário' }));
    await waitFor(() =>
      expect(rideReserve.contingency).toHaveBeenLastCalledWith(
        'trecho-reserva',
        'rebook',
        '2090-01-11T12:00:00.000Z',
        expect.stringMatching(UUID),
      ),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar reserva' }));
    expect(rideReserve.contingency).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/O cancelamento encerra este trecho/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento da reserva' }));
    await waitFor(() =>
      expect(rideReserve.contingency).toHaveBeenLastCalledWith('trecho-reserva', 'cancel', null, expect.stringMatching(UUID)),
    );
    expect(await screen.findByText('Reserva cancelada. O trecho foi encerrado.')).toBeVisible();
  });

  it('quem não é o passageiro acompanha a reserva sem ações, e uma corrida sem agendamento não consulta nada', async () => {
    vi.mocked(rideReserve.state).mockResolvedValue(terms({ state: 'contingency', flight_ref: null, terminal: null }));
    const { unmount } = render(<ReservePanel leg={leg} passenger={false} />);
    expect(await screen.findByText(/O passageiro escolhe entre continuar a busca, remarcar ou cancelar/)).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
    unmount();

    vi.mocked(rideReserve.state).mockClear();
    const { container } = render(<ReservePanel leg={{ id: 'trecho-agora', status: 'requested', pickup_at: null }} />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(rideReserve.state).not.toHaveBeenCalled();
  });
});

describe('assentos em van de linha', () => {
  it('mostra os assentos livres e reserva dois assentos pelo preço unitário exibido, sem cobrança', async () => {
    vi.mocked(rideShuttle.board).mockResolvedValue(board());
    vi.mocked(rideShuttle.book).mockResolvedValue({ id: 'assento-2', state: 'confirmed' });
    openShuttle();
    expect(await screen.findByText(/O assento fica reservado em seu nome\. Nenhum pagamento é cobrado neste ensaio\./)).toBeVisible();
    expect(rideShuttle.board).toHaveBeenCalledWith(null, null);
    expect(screen.getByLabelText('Linha')).toHaveTextContent(/Saúde → Aeroporto de ensaio · R\$\s25,00 por assento/);
    expect(screen.getByRole('button', { name: 'Reservar assento' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Quantos assentos'), { target: { value: '2' } });
    expect(screen.getByLabelText(/10\/01\/2090 09:00 \(São Paulo\) · 1 de 12 assentos livres/)).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/10\/01\/2090 12:00 \(São Paulo\) · 5 de 12 assentos livres/));
    expect(screen.getByText(/Total de 2 assentos: R\$\s50,00/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reservar 2 assentos' }));

    await waitFor(() =>
      expect(rideShuttle.book).toHaveBeenCalledWith('partida-2', 2, 2500, expect.stringMatching(UUID)),
    );
    expect(await screen.findByText(/2 assentos reservados para a partida de 10\/01\/2090 12:00.*Nenhum pagamento foi cobrado/)).toBeVisible();
  });

  it('explica a perda do último assento e reenvia com a mesma chave', async () => {
    vi.mocked(rideShuttle.board).mockResolvedValue(board());
    vi.mocked(rideShuttle.book)
      .mockRejectedValueOnce(refusal('ride_seat_unavailable'))
      .mockResolvedValue({ id: 'assento-2', state: 'confirmed' });
    openShuttle();
    fireEvent.click(await screen.findByLabelText(/1 de 12 assentos livres/));
    fireEvent.click(screen.getByRole('button', { name: 'Reservar assento' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não há assentos suficientes nesta partida');
    await waitFor(() => expect(rideShuttle.board).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Reservar assento' }));
    expect(await screen.findByText(/Assento reservado para a partida/)).toBeVisible();
    const calls = vi.mocked(rideShuttle.book).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('troca de partida pelo mesmo preço e cancela o assento só após confirmação', async () => {
    vi.mocked(rideShuttle.board).mockResolvedValue(board([seat()]));
    vi.mocked(rideShuttle.rebook).mockResolvedValue({ id: 'assento-3' });
    vi.mocked(rideShuttle.cancel).mockResolvedValue({ refund_due_cents: 0 });
    openShuttle();
    const mine = within(await screen.findByRole('region', { name: 'Meus assentos' }));
    expect(mine.getByText(/1 assento · R\$\s25,00 por assento · Reservado/)).toBeVisible();

    fireEvent.click(mine.getByRole('button', { name: 'Trocar de partida' }));
    fireEvent.change(mine.getByLabelText('Nova partida (horário de São Paulo)'), { target: { value: 'partida-2' } });
    fireEvent.click(mine.getByRole('button', { name: 'Confirmar troca de partida' }));
    await waitFor(() =>
      expect(rideShuttle.rebook).toHaveBeenCalledWith('assento-1', 'partida-2', expect.stringMatching(UUID)),
    );
    expect(await screen.findByText(/Assento remarcado para a partida de 10\/01\/2090 12:00.*pelo mesmo preço/)).toBeVisible();

    fireEvent.click(mine.getByRole('button', { name: 'Cancelar assento' }));
    expect(rideShuttle.cancel).not.toHaveBeenCalled();
    fireEvent.click(mine.getByRole('button', { name: 'Confirmar cancelamento do assento' }));
    await waitFor(() => expect(rideShuttle.cancel).toHaveBeenCalledWith('assento-1', expect.stringMatching(UUID)));
    expect(await screen.findByText(/Nada a restituir: nenhum valor foi cobrado/)).toBeVisible();
  });

  it('oferece remarcação quando a operação cancela a partida, e orienta quando não há linha aberta', async () => {
    vi.mocked(rideShuttle.board).mockResolvedValue(board([seat({ state: 'released' })]));
    const first = openShuttle();
    expect(await screen.findByText(/A operação cancelou esta partida e liberou seus assentos/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remarcar em outra partida' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Cancelar assento' })).toBeNull();
    first.unmount();

    vi.mocked(rideShuttle.board).mockResolvedValue({ simulation: true, lines: [], my_seats: [] });
    openShuttle();
    expect(await screen.findByText(/Nenhuma linha de van tem partidas abertas agora/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Corridas' })).toHaveAttribute('href', '/corridas');
    expect(screen.queryByRole('button', { name: /Reservar/ })).toBeNull();
  });
});

describe('decisões do motorista nas modalidades', () => {
  it('aceita o novo horário, recusa só após confirmar e vê apenas contagens da van', async () => {
    vi.mocked(driverModes.tasks).mockResolvedValue({
      shifts: [
        {
          id: 'mudanca-1',
          leg_id: 'trecho-reserva',
          origin: 'Saúde',
          destination: 'Aeroporto de ensaio',
          reason: 'flight_delay',
          old_pickup: '2090-01-10T12:00:00Z',
          new_pickup: '2090-01-10T13:30:00Z',
          expires_at: '2090-01-10T11:00:00Z',
        },
      ],
      extensions: [],
      departures: [
        { id: 'partida-1', origin_area: 'Saúde', destination_area: 'Aeroporto de ensaio', departs_at: '2090-01-10T12:00:00Z' },
      ],
    });
    vi.mocked(rideShuttle.manifest).mockResolvedValue({
      departs_at: '2090-01-10T12:00:00Z',
      state: 'open',
      seats_total: 12,
      seats_confirmed: 7,
      bookings: 4,
    });
    vi.mocked(rideReserve.decideShift).mockResolvedValue('applied');
    const changed = vi.fn();
    render(<DriverModeTasks onChanged={changed} />);
    expect(await screen.findByText(/de 10\/01\/2090 09:00 \(São Paulo\) para 10\/01\/2090 10:30 \(São Paulo\)\. Motivo: atraso de voo/)).toBeVisible();
    expect(screen.getByText('7 de 12 assentos reservados, em 4 reservas.')).toBeVisible();
    expect(screen.getByText(/apenas contagens/)).toBeVisible();
    expect(rideShuttle.manifest).toHaveBeenCalledWith('partida-1');

    fireEvent.click(screen.getByRole('button', { name: 'Aceitar novo horário' }));
    await waitFor(() => expect(rideReserve.decideShift).toHaveBeenCalledWith('mudanca-1', true));
    expect(await screen.findByText(/Novo horário confirmado: 10\/01\/2090 10:30/)).toBeVisible();
    expect(changed).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Não posso neste horário' }));
    expect(rideReserve.decideShift).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recusa e devolver a reserva' }));
    await waitFor(() => expect(rideReserve.decideShift).toHaveBeenLastCalledWith('mudanca-1', false));
    expect(await screen.findByText('Reserva devolvida ao despacho no novo horário.')).toBeVisible();
  });

  it('mostra o estado vazio quando não há decisão pendente', async () => {
    vi.mocked(driverModes.tasks).mockResolvedValue({ shifts: [], extensions: [], departures: [] });
    render(<DriverModeTasks />);
    expect(await screen.findByText(/Nenhuma decisão pendente agora/)).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
