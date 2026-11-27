import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { RidePointInput } from '../../components/mobility/RidePointInput';
import { searchRidePlaces } from '../../services/rideLocalMap';
import type { Draft } from '../../services/rideRoutes';

vi.mock('../../services/rideLocalMap', () => ({
  searchRidePlaces: vi.fn(),
  listMyRidePlaces: vi.fn(),
  forgetRidePlace: vi.fn(),
  storeRidePlace: vi.fn(),
}));
vi.mock('../../components/mobility/LocalRideMap', () => ({
  LocalRideMap: ({ onPick }: { onPick: (p: { lat: number; lng: number }) => void }) => (
    <button type="button" onClick={() => onPick({ lat: -23.619, lng: -46.636 })}>
      Confirmar ponto central
    </button>
  ),
}));

function PointForm() {
  const [draft, setDraft] = useState<Draft>({ label: '', lat: '', lng: '' });
  return <RidePointInput name="Embarque" area="Saúde" value={draft} set={setDraft} />;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(searchRidePlaces).mockResolvedValue([]);
});

it('distingue estabelecimentos homônimos e exige nova confirmação do pino após editar o endereço selecionado', async () => {
  const user = userEvent.setup();
  vi.mocked(searchRidePlaces).mockResolvedValue([
    { label: 'Mercado', area: 'Saúde', kind: 'place', osm_type: 'node', osm_id: 1, lat: -23.62, lng: -46.63 },
    { label: 'Mercado', area: 'Saúde', kind: 'place', osm_type: 'node', osm_id: 2, lat: -23.61, lng: -46.63 },
  ]);
  render(<PointForm />);
  const address = screen.getByLabelText('Endereço ou ponto de encontro');
  await user.type(address, 'Mercado');
  await user.click(await screen.findByRole('button', { name: /Mercado · Saúde \(-23.6100/ }));
  expect(screen.getByLabelText('Latitude')).toHaveValue(-23.61);
  await user.type(address, ' entrada norte');
  expect(screen.getByLabelText('Latitude')).toHaveValue(null);
});
it('permite marcar o ponto por teclado e completar a entrada quando o GPS é recusado', async () => {
  const user = userEvent.setup();
  const original = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (_: unknown, denied: () => void) => denied(),
    },
  });
  try {
    render(<PointForm />);
    await user.click(screen.getByRole('button', { name: 'Usar minha posição neste ponto' }));
    expect(screen.getByText(/posição indisponível/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ajustar pino no mapa' }));
    screen.getByRole('button', { name: 'Confirmar ponto central' }).focus();
    await user.keyboard('{Enter}');
    await user.type(screen.getByLabelText('Endereço ou ponto de encontro'), ' lateral');
    expect(screen.getByLabelText('Latitude')).toHaveValue(-23.619);
    expect(screen.getByLabelText('Longitude')).toHaveValue(-46.636);
  } finally {
    if (original) Object.defineProperty(navigator, 'geolocation', original);
    else Reflect.deleteProperty(navigator, 'geolocation');
  }
});
