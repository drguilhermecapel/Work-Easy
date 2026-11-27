import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DriverNavigation from '../../pages/mobilidade/DriverNavigation';
import DriverWorkspace from '../../pages/mobilidade/DriverWorkspace';
import * as svc from '../../services/driverJourney';
import type { RideDashboard } from '../../services/rides';

vi.mock('../../services/driverJourney', () => ({
  readNavigation: vi.fn(),
  recalculateRoad: vi.fn(),
  reachWaypoint: vi.fn(),
  devicePoint: vi.fn(),
  shareDriverEta: vi.fn(),
  driverWorkspace: vi.fn(),
  saveDriverPreferences: vi.fn(),
  joinAirport: vi.fn(),
  interestInRide: vi.fn(),
}));
vi.mock(
  '../../components/mobility/LocalRideMap',
  () => ({ default: () => <span>Mapa local de teste</span> }),
);
const ctx: svc.NavigationContext = {
  phase: 'arriving',
  index: 0,
  target: { lat: -23.6, lng: -46.6, label: 'Porta A' },
  origin: null,
  destination: null,
  stops: [],
  geometry: null,
  external_allowed: false,
  instruction: 'Portão azul',
  simulation: true,
  pickup_deviation_seconds: null,
};
beforeEach(() => vi.resetAllMocks());
describe('jornada do motorista', () => {
  it('recalcula o ensaio sem consultar o GPS do navegador e só compartilha ETA por ação do motorista', async () => {
    vi.mocked(svc.readNavigation).mockResolvedValue(ctx);
    vi.mocked(svc.recalculateRoad).mockResolvedValue({
      minutes: 3,
      meters: 750,
      geometry: { coordinates: [[-46.6, -23.6], [-46.61, -23.6]] },
    });
    render(<DriverNavigation leg='leg' phase='arriving' />);
    await screen.findByText('Portão azul');
    expect(screen.queryByText('Usar navegador externo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /recalcular com posição de ensaio/i }));
    await screen.findByText('Trajeto atualizado.');
    expect(svc.devicePoint).not.toHaveBeenCalled();
    expect(svc.recalculateRoad).toHaveBeenCalledWith('leg', ctx, undefined);
    expect(svc.shareDriverEta).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar previsão' }));
    await waitFor(() => expect(svc.shareDriverEta).toHaveBeenCalledWith('leg', 3));
  });
  it('navegação externa exige liberação e oferece apenas o ponto autorizado', async () => {
    vi.mocked(svc.readNavigation).mockResolvedValue({ ...ctx, external_allowed: true, simulation: false });
    render(<DriverNavigation leg='leg' phase='arriving' />);
    fireEvent.click(await screen.findByText('Usar navegador externo'));
    expect(screen.getByRole('link', { name: 'Google Maps' })).toHaveAttribute(
      'href',
      expect.stringContaining('destination=-23.6'),
    );
    expect(screen.getByRole('link', { name: 'Apple Mapas' })).toHaveAttribute(
      'href',
      expect.stringContaining('daddr=-23.6'),
    );
  });
  it('distingue manifestar interesse de aceitar a viagem e usa a posição sintética do terminal', async () => {
    vi.mocked(svc.driverWorkspace).mockResolvedValue({
      opportunities: [{
        id: 'r',
        origin: 'A',
        destination: 'B',
        driver_cents: 1000,
        pickup_at: '2030-05-04T15:00Z',
        scheduled: true,
        interested: false,
      }],
      preferences: {
        destination: null,
        arrive_by: null,
        cost_per_km: null,
        terminals: [{
          id: 't',
          name: 'Terminal de ensaio',
          instruction: 'Porta T',
          reference: 'teste',
          lat: -23,
          lng: -46,
          radius_m: 180,
          until: null,
          position: null,
        }],
      },
    });
    const dashboard = {
      simulation: true,
      driver: { online: true },
      areas: ['A', 'B'],
      offers: [],
    } as unknown as RideDashboard;
    render(
      <DriverWorkspace
        dashboard={dashboard}
        userId='driver'
        busy={false}
        reload={() => {}}
        run={async (_intent, act) => {
          await act('key');
        }}
      />,
    );
    fireEvent.click(await screen.findByText('Tenho interesse'));
    await waitFor(() => expect(svc.interestInRide).toHaveBeenCalledWith('r'));
    fireEvent.click(screen.getByRole('button', { name: 'Entrar na fila com posição fictícia' }));
    await waitFor(() =>
      expect(svc.joinAirport).toHaveBeenCalledWith('t', true, { lat: -23, lng: -46, accuracy: 1 })
    );
    expect(svc.devicePoint).not.toHaveBeenCalled();
  });
});
