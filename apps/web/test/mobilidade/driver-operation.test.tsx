import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Motorista from '../../pages/mobilidade/Motorista';
import Operacao from '../../pages/mobilidade/Operacao';
import * as rides from '../../services/rides';
import type { RideDashboard, RideLeg } from '../../services/rides';

// Rendering WebGL is covered by the map acceptance check; exercise the surrounding form here.
vi.mock('../../components/mobility/LocalRideMap', () => ({
  LocalRideMap: ({label}: {label?:string}) => <div aria-label={label} />,
}));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ authUser: { id: 'driver-a' }, isAuthenticated: true, loading: false, mode: 'backend' }),
}));
vi.mock('../../components/mobility/DriverSignals', () => ({
  default: () => <span>Localização do trecho</span>,
  DriverAlerts: () => <span>Ativar alertas do motorista</span>,
}));
vi.mock('../../services/rides', () => ({
  getRideDashboard: vi.fn(),
  applyDriver: vi.fn(),
  reviewDriver: vi.fn(),
  setDriverOnline: vi.fn(),
  configureDriverShift: vi.fn(),
  removeDriverShift: vi.fn(),
  acceptRideOffer: vi.fn(),
  declineRideOffer: vi.fn(),
  resolveRide: vi.fn(),
  resolveCompletedRide: vi.fn(),
  transitionRide: vi.fn(),
}));

function makeDashboard(): RideDashboard {
  return {
    enabled: true,
    quote_enabled: true,
    dispatch_enabled: true,
    simulation: true,
    areas: [],
    driver: null,
    reviews: [],
    rides: [],
    quotes: [],
    offers: [],
  };
}

function leg(status: string): RideLeg {
  return {
    id: 'leg-1',
    seq: 1,
    origin: 'Estação A',
    destination: 'Estação B',
    payer: 'passenger',
    pickup_at: '2030-05-01T09:30:00-03:00',
    fare_cents: 2000,
    fee_cents: 200,
    driver_cents: 1800,
    extras_cents: 0,
    limit_cents: 2000,
    status,
    driver_id: 'driver-a',
    can_cancel: true,
  };
}

let dashboard: RideDashboard;
beforeEach(() => {
  vi.resetAllMocks();
  dashboard = makeDashboard();
  vi.mocked(rides.getRideDashboard).mockImplementation(async () => dashboard);
});

const renderDriver = () =>
  render(
    <MemoryRouter>
      <Motorista />
    </MemoryRouter>,
  );

describe('rede de motoristas', () => {
  it('mostra o estado desativado e mantém ações de cadastro ocultas', async () => {
    dashboard.enabled = false;
    renderDriver();
    expect(await screen.findByText(/módulo de corridas está desativado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar para revisão' })).not.toBeInTheDocument();
    expect(rides.applyDriver).not.toHaveBeenCalled();
  });

  it('identifica o ensaio e envia à revisão só a categoria escolhida', async () => {
    renderDriver();
    expect(await screen.findByText(/Ensaio com dados fictícios/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Categoria do veículo'), 'van');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar para revisão' }));
    expect(rides.applyDriver).toHaveBeenCalledWith('van');
    expect(screen.queryByText('Ofertas disponíveis')).not.toBeInTheDocument();
  });

  it('um cadastro vencido não recebe ofertas mesmo com disponibilidade antiga', async () => {
    dashboard.driver = { status: 'approved', vehicle: 'compact', valid_until: '2000-01-01', online: true };
    renderDriver();
    expect(await screen.findByText(/Cadastro vencido/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceitar trecho' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Parar de receber ofertas' }));
    expect(rides.setDriverOnline).toHaveBeenCalledWith(false);
  });

  it('retoma a mesma ação após reabrir o painel e perder a resposta do aceite', async () => {
    dashboard.driver = { status: 'approved', vehicle: 'compact', valid_until: '2099-12-31', online: true };
    dashboard.offers = [{ leg_id: 'retomada', origin: 'A', destination: 'B', pickup_at: null, driver_cents: 1800 }];
    vi.mocked(rides.acceptRideOffer).mockRejectedValueOnce(new Error('offline'));
    const original = renderDriver();
    await userEvent.click(await screen.findByRole('button', {name:'Aceitar trecho'}));
    await screen.findByRole('alert');
    const first = vi.mocked(rides.acceptRideOffer).mock.calls[0][1];
    original.unmount();
    renderDriver();
    await userEvent.click(await screen.findByRole('button', {name:'Aceitar trecho'}));
    expect(rides.acceptRideOffer).toHaveBeenLastCalledWith('retomada',first);
  });

  it('repete a mesma chave ao recusar uma oferta após perder a resposta', async () => {
    dashboard.driver = { status: 'approved', vehicle: 'compact', valid_until: '2099-12-31', online: true };
    dashboard.offers = [{ leg_id: 'leg-1', origin: 'A', destination: 'B', pickup_at: null, driver_cents: 1800 }];
    vi.mocked(rides.declineRideOffer).mockRejectedValueOnce(new Error('offline'));
    renderDriver();
    const decline = await screen.findByRole('button', { name: 'Recusar oferta' });
    await userEvent.click(decline);
    await screen.findByRole('alert');
    await waitFor(() => expect(decline).toBeEnabled());
    await userEvent.click(decline);
    expect(rides.declineRideOffer).toHaveBeenCalledTimes(2);
    expect(vi.mocked(rides.declineRideOffer).mock.calls[0]).toEqual(vi.mocked(rides.declineRideOffer).mock.calls[1]);
    expect(rides.acceptRideOffer).not.toHaveBeenCalled();
    expect(screen.queryByText('Ativar alertas do motorista')).not.toBeInTheDocument();
  });

  it('envia o turno em UTC a partir do horário de São Paulo e distingue ETA aproximada', async () => {
    dashboard.driver = { status: 'approved', vehicle: 'compact', valid_until: '2099-12-31', online: true, shifts: [] };
    dashboard.areas = ['Saúde', 'Vila Mariana'];
    dashboard.offers = [
      { leg_id: 'leg-1', origin: 'Saúde', destination: 'Vila Mariana', pickup_at: null, driver_cents: 1800, approach_minutes: 12 },
    ];
    renderDriver();
    expect(await screen.findByText(/Aproximação estimada pela área: 12 min/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Área de partida do turno'), 'Saúde');
    fireEvent.change(screen.getByLabelText('Início do turno (São Paulo)'), { target: { value: '2030-05-02T09:00' } });
    fireEvent.change(screen.getByLabelText('Fim do turno (São Paulo)'), { target: { value: '2030-05-02T23:00' } });
    expect(screen.getByRole('button', { name: 'Cadastrar turno' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Fim do turno (São Paulo)'), { target: { value: '2030-05-02T15:00' } });
    await userEvent.click(screen.getByRole('button', { name: 'Cadastrar turno' }));
    expect(rides.configureDriverShift).toHaveBeenCalledWith('Saúde', '2030-05-02T12:00:00.000Z', '2030-05-02T18:00:00.000Z');
  });

  it('mantém aceite e alertas inativos enquanto o despacho estiver pausado', async () => {
    dashboard.dispatch_enabled = false;
    dashboard.simulation = false;
    dashboard.driver = { status: 'approved', vehicle: 'compact', valid_until: '2099-12-31', online: true };
    dashboard.offers = [{ leg_id: 'leg-1', origin: 'A', destination: 'B', pickup_at: null, driver_cents: 1800 }];
    renderDriver();
    expect(await screen.findByText(/recebimento de novas ofertas está pausado/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceitar trecho' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ativar alertas do motorista')).not.toBeInTheDocument();
  });

  it('mantém interrupção após embarque em apuração sem cancelar ou concluir o serviço', async () => {
    dashboard.rides = [
      { id: 'ride-1', kind: 'linked', status: 'active', booking_id: 'booking', scheduled_at: null, legs: [leg('boarded')] },
    ];
    renderDriver();
    await userEvent.click(await screen.findByRole('button', { name: /Informar interrupção/ }));
    expect(rides.transitionRide).toHaveBeenCalledWith('leg-1', 'unknown', expect.any(String));
    expect(screen.queryByRole('button', { name: 'Cancelar trecho' })).not.toBeInTheDocument();
    expect(screen.queryByText('Localização do trecho')).not.toBeInTheDocument();
  });

  it('exige validade para aprovar e uma decisão explícita para resolver estado desconhecido', async () => {
    dashboard.reviews = [{ driver_id: 'driver-b', status: 'pending', vehicle: 'sedan', valid_until: null }];
    dashboard.rides = [{ id: 'ride-1', kind: 'public', status: 'unknown', booking_id: null, scheduled_at: null, legs: [leg('unknown')] }];
    render(
      <MemoryRouter>
        <Operacao />
      </MemoryRouter>,
    );
    const approve = await screen.findByRole('button', { name: 'Aprovar cadastro' });
    expect(approve).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Validade da aprovação'), '2099-12-31');
    await userEvent.click(approve);
    expect(rides.reviewDriver).toHaveBeenCalledWith('driver-b', true, '2099-12-31');
    const resolve = screen.getByRole('button', { name: 'Registrar resolução' });
    expect(resolve).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Resultado conferido'), 'cancelled');
    await userEvent.click(resolve);
    expect(rides.resolveRide).toHaveBeenCalledWith('leg-1', 'cancelled', expect.any(String));
  });

  it('exige referência em custódia e horários do trecho para concluir uma interrupção', async () => {
    dashboard.rides = [{ id: 'ride-1', kind: 'public', status: 'unknown', booking_id: null, scheduled_at: null, legs: [leg('unknown')] }];
    render(
      <MemoryRouter>
        <Operacao />
      </MemoryRouter>,
    );
    await userEvent.selectOptions(await screen.findByLabelText('Resultado conferido'), 'completed');
    const resolve = screen.getByRole('button', { name: 'Registrar resolução' });
    const reference = screen.getByLabelText('Referência do comprovante em custódia');
    await userEvent.type(reference, 'https://test.invalid');
    const stamp = { target: { value: '2026-01-10T07:55' } };
    fireEvent.change(screen.getByLabelText('Embarque confirmado (São Paulo)'), stamp);
    fireEvent.change(screen.getByLabelText('Desembarque confirmado (São Paulo)'), stamp);
    expect(resolve).toBeDisabled();
    await userEvent.clear(reference);
    await userEvent.type(reference, 'caso-153');
    await userEvent.click(resolve);
    expect(rides.resolveCompletedRide).toHaveBeenCalledWith(
      'leg-1',
      expect.any(String),
      'caso-153',
      '2026-01-10T10:55:00.000Z',
      '2026-01-10T10:55:00.000Z',
    );
    expect(rides.resolveRide).not.toHaveBeenCalled();
  });
});
