import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExtensionPanel } from '../../components/mobility/modes/ExtensionPanel';
import HourlyBlock from '../../components/mobility/modes/HourlyBlock';
import Intercity from '../../components/mobility/modes/Intercity';
import { rideBlocks, rideIntercity, type BlockState, type ModeQuote } from '../../services/rideModes';
import { consentToRide, getRideDashboard, type RideDashboard } from '../../services/rides';

vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: 'backend', authUser: { id: 'passageira' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../services/rides', () => ({ getRideDashboard: vi.fn(), consentToRide: vi.fn() }));
vi.mock('../../services/rideModes', () => ({
  rideBlocks: { options: vi.fn(), quote: vi.fn(), state: vi.fn(), propose: vi.fn(), decide: vi.fn() },
  rideIntercity: { corridors: vi.fn(), quote: vi.fn() },
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const refusal = (code: string) => ({ code: 'P0001', message: code });
const dashboard = (over: Partial<RideDashboard> = {}): RideDashboard => ({
  enabled: true,
  simulation: true,
  quote_enabled: true,
  dispatch_enabled: true,
  areas: ['Saúde', 'Jabaquara'],
  driver: null,
  rides: [],
  offers: [],
  reviews: [],
  quotes: [],
  ...over,
});
const quote = (leg: Partial<ModeQuote['legs'][number]> = {}, total = 24000): ModeQuote => ({
  id: 'cotacao-1',
  expires_at: '2090-01-09T12:00:00Z',
  total_cents: total,
  legs: [
    {
      seq: 1,
      origin: 'Saúde',
      destination: 'Jabaquara',
      payer: 'passenger',
      fare_cents: total,
      fee_cents: null,
      driver_cents: null,
      extras_cents: 0,
      limit_cents: total,
      ...leg,
    },
  ],
});
const block = { code: 'h3', minutes: 180, included_km: 60, block_cents: 24000, extra_15min_cents: 2000, extra_km_cents: 250 };
const blockState = (over: Partial<BlockState> = {}): BlockState => ({
  minutes: 180,
  included_km: 60,
  extra_15min_cents: 2000,
  extra_km_cents: 250,
  extended_minutes: 0,
  extended_km: 0,
  extension_cents: 0,
  can_propose: true,
  extensions: [],
  ...over,
});
const corridor = {
  origin: 'Saúde',
  destination: 'Santo André',
  origin_jurisdiction: 'Município de São Paulo',
  destination_jurisdiction: 'Município de Santo André',
  empty_return_cents: 3000,
  return_minutes: 40,
};
const open = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

async function chooseBlock() {
  fireEvent.change(await screen.findByLabelText('Área de embarque'), { target: { value: 'Saúde' } });
  fireEvent.change(screen.getByLabelText('Área do desembarque final'), { target: { value: 'Jabaquara' } });
  fireEvent.change(screen.getByLabelText('Início do bloco (São Paulo)'), { target: { value: '2090-01-10T09:00' } });
  fireEvent.click(await screen.findByLabelText(/3 horas · 60 km incluídos/));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getRideDashboard).mockResolvedValue(dashboard());
});

describe('carro com motorista por hora', () => {
  it('mostra minutos, km, preço e excedentes do bloco, cota a escolha e reaproveita o aceite de cotações', async () => {
    vi.mocked(rideBlocks.options).mockResolvedValue([block]);
    vi.mocked(rideBlocks.quote).mockResolvedValue(quote({ duration_minutes: 180 }));
    vi.mocked(consentToRide).mockResolvedValue({ ride_id: 'corrida-1', status: 'accepted' });
    open(<HourlyBlock />);
    expect(await screen.findByText(/Ensaio com dados fictícios/)).toBeVisible();
    expect(screen.getByText(/Escolha a área e o início para ver os blocos/)).toBeVisible();
    await chooseBlock();
    expect(rideBlocks.options).toHaveBeenLastCalledWith('Saúde', '2090-01-10T12:00:00.000Z');
    const option = screen.getByLabelText(/3 horas · 60 km incluídos/).closest('label');
    expect(option).toHaveTextContent(/R\$\s240,00/);
    expect(option).toHaveTextContent(/Extensão, só com aceite: R\$\s20,00 a cada 15 min · R\$\s2,50 por km adicional/);

    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço do bloco' }));
    await waitFor(() =>
      expect(rideBlocks.quote).toHaveBeenCalledWith(
        expect.stringMatching(UUID),
        '2090-01-10T12:00:00.000Z',
        'Saúde',
        'Jabaquara',
        'h3',
      ),
    );
    expect(await screen.findByText(/Bloco de 3 horas \(180 min\) com 60 km incluídos: R\$\s240,00/)).toBeVisible();
    expect(screen.getByText(/cobrados apenas depois de uma extensão aceita por você e pelo motorista/)).toBeVisible();
    expect(screen.getByText(/Total: R\$\s240,00/)).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Aceitar e solicitar' }));
    await waitFor(() => expect(consentToRide).toHaveBeenCalledWith('cotacao-1', true));
    expect(await screen.findByText(/Solicitação registrada/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Acompanhar em Corridas' })).toHaveAttribute('href', '/corridas');
  });

  it('repete a chave da cotação após uma falha e não aceita sem despacho aberto', async () => {
    vi.mocked(getRideDashboard).mockResolvedValue(dashboard({ dispatch_enabled: false }));
    vi.mocked(rideBlocks.options).mockResolvedValue([block]);
    vi.mocked(rideBlocks.quote).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(quote());
    open(<HourlyBlock />);
    await chooseBlock();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço do bloco' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço do bloco' }));
    expect(await screen.findByRole('button', { name: 'Aceitar e solicitar' })).toBeDisabled();
    expect(screen.getByText(/Reservas e chamadas de motoristas estão desativadas/)).toBeVisible();
    const calls = vi.mocked(rideBlocks.quote).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('diz o que fazer quando não há bloco na área e recusa bloco indisponível sem criar cotação', async () => {
    vi.mocked(rideBlocks.options).mockResolvedValueOnce([]).mockResolvedValue([block]);
    vi.mocked(rideBlocks.quote).mockRejectedValue(refusal('ride_block_unavailable'));
    open(<HourlyBlock />);
    fireEvent.change(await screen.findByLabelText('Área de embarque'), { target: { value: 'Jabaquara' } });
    fireEvent.change(screen.getByLabelText('Início do bloco (São Paulo)'), { target: { value: '2090-01-10T09:00' } });
    expect(await screen.findByText(/Nenhum bloco de horas está disponível nesta área e horário/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Consultar preço do bloco' })).toBeDisabled();

    await chooseBlock();
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço do bloco' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este bloco de horas não está disponível');
    expect(screen.queryByRole('button', { name: 'Aceitar e solicitar' })).toBeNull();
  });
});

describe('extensão do bloco', () => {
  it('propõe 30 minutos e 10 km com o preço previsto e avisa que depende dos dois aceites', async () => {
    vi.mocked(rideBlocks.state).mockResolvedValue(blockState());
    vi.mocked(rideBlocks.propose).mockResolvedValue({ id: 'extensao-1', cents: 6500, expires_at: '2090-01-10T13:00:00Z' });
    const changed = vi.fn();
    render(<ExtensionPanel legId="trecho-bloco" legStatus="boarded" onChanged={changed} />);
    expect(await screen.findByText(/Contratado: 3 horas · 60 km incluídos/)).toBeVisible();
    expect(screen.getByText(/Sem extensão aceita pelas duas partes, nenhum excedente é cobrado/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Propor mais tempo ou distância' }));
    expect(screen.getByLabelText('Tempo adicional')).toHaveValue('30');
    fireEvent.change(screen.getByLabelText('Quilômetros adicionais'), { target: { value: '10' } });
    expect(screen.getByText(/Preço previsto da extensão: R\$\s65,00/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Propor extensão' }));
    await waitFor(() =>
      expect(rideBlocks.propose).toHaveBeenCalledWith('trecho-bloco', 30, 10, expect.stringMatching(UUID)),
    );
    expect(await screen.findByText(/Extensão proposta por R\$\s65,00.*aceite do pagador e do motorista/)).toBeVisible();
    expect(changed).toHaveBeenCalled();
  });

  it('registra o aceite da extensão pendente e explica o conflito de agenda do motorista', async () => {
    vi.mocked(rideBlocks.state).mockResolvedValue(
      blockState({
        extensions: [
          {
            id: 'extensao-1',
            minutes: 30,
            km: 0,
            cents: 4000,
            state: 'pending',
            expires_at: '2090-01-10T13:00:00Z',
            may_decide: true,
            accepted_by_me: false,
          },
        ],
      }),
    );
    vi.mocked(rideBlocks.decide).mockRejectedValueOnce(refusal('ride_extension_unavailable')).mockResolvedValue('pending');
    render(<ExtensionPanel legId="trecho-bloco" legStatus="boarded" />);
    expect(await screen.findByText(/Extensão proposta: \+30 min · \+0 km · R\$\s40,00/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Propor mais tempo ou distância' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar extensão' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('não cabe na agenda do motorista');
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar extensão' }));
    expect(await screen.findByText('Aceite registrado. Falta o aceite da outra parte.')).toBeVisible();
    expect(rideBlocks.decide).toHaveBeenLastCalledWith('extensao-1', true);
  });

  it('não aparece nem consulta em trecho encerrado ou que não é bloco por hora', async () => {
    const closed = render(<ExtensionPanel legId="trecho-fim" legStatus="completed" />);
    await waitFor(() => expect(closed.container).toBeEmptyDOMElement());
    expect(rideBlocks.state).not.toHaveBeenCalled();
    closed.unmount();

    vi.mocked(rideBlocks.state).mockResolvedValue(null);
    const other = render(<ExtensionPanel legId="trecho-comum" legStatus="boarded" />);
    await waitFor(() => expect(rideBlocks.state).toHaveBeenCalledWith('trecho-comum'));
    expect(other.container).toBeEmptyDOMElement();
  });
});

describe('viagem entre municípios', () => {
  it('mostra a competência e separa no preço o retorno do motorista sem passageiro', async () => {
    vi.mocked(rideIntercity.corridors).mockResolvedValue([corridor]);
    vi.mocked(rideIntercity.quote).mockResolvedValue(
      quote({ destination: 'Santo André', fare_cents: 12000, empty_return_cents: 3000 }, 12000),
    );
    open(<Intercity />);
    fireEvent.change(await screen.findByLabelText('Área de origem'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Área de destino'), { target: { value: 'Santo André' } });
    expect(screen.getByText(/Competência: Município de São Paulo na origem e Município de Santo André no destino/)).toBeVisible();
    expect(screen.getByText(/esse retorno custa R\$\s30,00 e aparece separado na cotação/)).toBeVisible();
    fireEvent.change(screen.getByLabelText('Data e hora da saída (São Paulo)'), { target: { value: '2090-01-10T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço da viagem' }));
    await waitFor(() =>
      expect(rideIntercity.quote).toHaveBeenCalledWith(expect.stringMatching(UUID), '2090-01-10T12:00:00.000Z', [
        { origin: 'Saúde', destination: 'Santo André', payer: 'passenger', pickup_at: '2090-01-10T12:00:00.000Z' },
      ]),
    );
    expect(await screen.findByText(/Viagem com passageiro: R\$\s90,00/)).toBeVisible();
    expect(screen.getByText(/Retorno do motorista sem passageiro: R\$\s30,00/)).toBeVisible();
    expect(screen.getByText(/Total: R\$\s120,00/)).toBeVisible();
  });

  it('recusa com clareza quando nenhum corredor está autorizado, sem formulário de cotação', async () => {
    vi.mocked(rideIntercity.corridors).mockResolvedValue([]);
    open(<Intercity />);
    expect(await screen.findByText(/Nenhum corredor entre municípios está autorizado agora/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Consultar preço da viagem' })).toBeNull();
    expect(rideIntercity.quote).not.toHaveBeenCalled();
  });

  it('quando o servidor recusa o corredor, diz que nenhuma cotação foi criada', async () => {
    vi.mocked(rideIntercity.corridors).mockRejectedValue(new Error('lista indisponível'));
    vi.mocked(rideIntercity.quote).mockRejectedValue(refusal('ride_corridor_unavailable'));
    open(<Intercity />);
    fireEvent.change(await screen.findByLabelText('Área de origem'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Área de destino'), { target: { value: 'Jabaquara' } });
    fireEvent.change(screen.getByLabelText('Data e hora da saída (São Paulo)'), { target: { value: '2090-01-10T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar preço da viagem' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não há corredor entre municípios autorizado para este trajeto e horário. Nenhuma cotação foi criada.',
    );
    expect(screen.queryByRole('button', { name: 'Aceitar e solicitar' })).toBeNull();
  });
});
