import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Corridas from '../../pages/mobilidade/Corridas';
import { getBooking } from '../../services/bookings';
import { consentToRide, getRideDashboard, type RideDashboard } from '../../services/rides';

vi.mock('../../components/mobility/RouteCases', () => ({ RouteCases: () => null }));
vi.mock('../../services/rideRoutes', () => ({ listRideRouteCases: async () => [] }));
vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ mode: 'backend', authUser: { id: 'cliente' }, loading: false, isAuthenticated: true }) }));
vi.mock('../../services/rides', () => ({ getRideDashboard: vi.fn(), consentToRide: vi.fn(), quoteRide: vi.fn() }));
vi.mock('../../services/bookings', () => ({ getBooking: vi.fn() }));
const booking = { id: 'atendimento', role: 'client', origin: 'platform', status: 'accepted', price_cents: 15000 } as Awaited<ReturnType<typeof getBooking>>;

function data(): RideDashboard {
  return {
    enabled: true, simulation: true, quote_enabled: true, dispatch_enabled: true, areas: ['Saúde', 'Jabaquara'],
    driver: null, rides: [], offers: [], reviews: [],
    quotes: [{
      id: 'cotacao', booking_id: booking.id, total_cents: 3000, expires_at: '2090-12-01T20:00:00Z',
      status: 'awaiting_consent', required_from_me: true, accepted_by_me: false,
      legs: [{ seq: 1, origin: 'Reservado ao passageiro', destination: 'Reservado ao passageiro', payer: 'client',
        fare_cents: 3000, extras_cents: 0, fee_cents: null, driver_cents: null, limit_cents: 3000 }],
    }],
  };
}
function open() {
  render(<MemoryRouter initialEntries={['/atendimentos/atendimento/mobilidade']}>
    <Routes><Route path="/atendimentos/:id/mobilidade" element={<Corridas />} /></Routes>
  </MemoryRouter>);
}
beforeEach(() => {
  vi.mocked(getBooking).mockResolvedValue(booking);
  vi.mocked(consentToRide).mockReset();
});

describe('cotação no atendimento', () => {
  it('mostra componentes e registra o aceite sem concluir o serviço nem prometer uma viagem confirmada', async () => {
    vi.mocked(getRideDashboard).mockResolvedValue(data());
    vi.mocked(consentToRide).mockResolvedValue({ ride_id: null, status: 'awaiting_consent' });
    open();
    expect(await screen.findByText(/Total dos componentes/)).toHaveTextContent(/180,00/);
    expect(screen.getByText('Trajeto reservado ao profissional')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar transporte' }));
    await waitFor(() => expect(consentToRide).toHaveBeenCalledWith('cotacao', true));
    expect(await screen.findByText(/Aguardando os demais participantes/)).toBeVisible();
  });

  it('permite recusar mesmo com despacho desligado e permite desistir enquanto falta o segundo aceite', async () => {
    const dashboard = data();
    dashboard.dispatch_enabled = false;
    dashboard.quotes[0].accepted_by_me = true;
    vi.mocked(getRideDashboard).mockResolvedValue(dashboard);
    vi.mocked(consentToRide).mockResolvedValue({ ride_id: null, status: 'declined' });
    open();
    expect(await screen.findByText('Seu aceite já foi registrado.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aceitar transporte' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retirar meu aceite' }));
    expect(await screen.findByText('Transporte recusado.')).toBeVisible();
    expect(consentToRide).toHaveBeenCalledWith('cotacao', false);
  });

  it('oculta o formulário e os aceites para o módulo desligado e observadores sem consentimento requerido', async () => {
    const dashboard = data();
    dashboard.enabled = false;
    dashboard.quotes[0].required_from_me = false;
    vi.mocked(getRideDashboard).mockResolvedValue(dashboard);
    open();
    expect(await screen.findByText('Novas cotações estão indisponíveis neste ambiente.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Consultar preço' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recusar transporte' })).not.toBeInTheDocument();
  });
});
