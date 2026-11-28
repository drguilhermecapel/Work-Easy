import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Modalidades from '../../pages/mobilidade/Modalidades';
import { useAuth } from '../../contexts/AuthContext';
import { rideMarket, type MarketCatalog, type MarketModality } from '../../services/rideMarket';
import { getRideDashboard } from '../../services/rides';

vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../../services/rides', () => ({ getRideDashboard: vi.fn() }));
vi.mock('../../services/rideMarket', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/rideMarket')>();
  return { ...original, rideMarket: { ...original.rideMarket, catalog: vi.fn(), request: vi.fn() } };
});
vi.mock('../../components/mobility/modes/ShuttleSeats', () => ({ default: () => <p>Painel de assentos de teste</p> }));
vi.mock('../../components/mobility/modes/HourlyBlock', () => ({ default: () => <p>Painel por hora de teste</p> }));
vi.mock('../../components/mobility/modes/Intercity', () => ({ default: () => <p>Painel entre municípios de teste</p> }));

const session = { mode: 'backend', authUser: { id: 'passageira' }, loading: false, isAuthenticated: true };
const row = (code: string, label: string, extra: Partial<MarketModality> = {}): MarketModality => ({
  code,
  par: 'PAR-603',
  label,
  operational: false,
  status: 'inventory',
  available: false,
  reason: 'not_authorized',
  source: 'https://fonte.invalid/' + code,
  consulted_on: '2026-11-27',
  note: 'Somente catálogo, sem fluxo operacional. Exige autorização própria.',
  ...extra,
});
const open = (code: string, label: string, extra: Partial<MarketModality> = {}) =>
  row(code, label, { operational: true, status: 'pilot', available: true, reason: null, ...extra });
const records = [
  row('taxi', 'Táxi'),
  row('moto', 'Moto'),
  row('shared', 'Viagem compartilhada'),
  row('route_share', 'Corredor compartilhado'),
  row('transit_info', 'Informação de transporte público'),
  row('transit_ticket', 'Bilhete de transporte público'),
  row('bike', 'Bicicleta'),
  row('scooter', 'Patinete'),
  row('boat', 'Barco'),
  row('rental', 'Locação sem motorista'),
  row('autonomous', 'Veículo autônomo de parceiro'),
];
function catalog(modalities: MarketModality[], extra: Partial<MarketCatalog> = {}): MarketCatalog {
  return {
    environment: 'simulation',
    market: { code: 'sao-paulo', country: 'BR', city: 'São Paulo' },
    language: 'pt-BR',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    gates: { module: true, quote: true, dispatch: true, monetization: false },
    vehicles: [{ category: 'sedan', seats: 4 }],
    classes: [
      { code: 'economico', label: 'Econômico', area: 'Saúde', seats: 4 },
      { code: 'economico', label: 'Econômico', area: 'Jabaquara', seats: 3 },
    ],
    methods: [
      { method: 'pix', origin: 'Saúde', destination: 'Jabaquara' },
      { method: 'pix', origin: 'Jabaquara', destination: 'Saúde' },
    ],
    modalities,
    ...extra,
  };
}
function show() {
  return render(
    <MemoryRouter>
      <Modalidades />
    </MemoryRouter>,
  );
}
async function consult(origin = 'Saúde', destination = 'Jabaquara') {
  fireEvent.change(await screen.findByLabelText('Origem'), { target: { value: origin } });
  fireEvent.change(screen.getByLabelText('Destino'), { target: { value: destination } });
  fireEvent.click(screen.getByRole('button', { name: 'Consultar modalidades' }));
}
const card = (title: string) => screen.getByRole('heading', { level: 3, name: title }).closest('li') as HTMLElement;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(useAuth).mockReturnValue(session as ReturnType<typeof useAuth>);
  vi.mocked(getRideDashboard).mockResolvedValue({ areas: ['Saúde', 'Jabaquara'] } as Awaited<
    ReturnType<typeof getRideDashboard>
  >);
});

describe('catálogo de modalidades', () => {
  it('mostra praça, moeda, fuso, as quatro liberações em separado e o aviso de ensaio dito pelo servidor', async () => {
    vi.mocked(rideMarket.catalog).mockResolvedValue(catalog([open('car', 'Carro'), ...records]));
    show();
    expect(await screen.findByRole('heading', { name: 'Praça: São Paulo, Brasil' })).toBeVisible();
    expect(rideMarket.catalog).toHaveBeenCalledWith(null, null, null);
    const market = screen.getByRole('region', { name: /Praça/ });
    expect(market).toHaveTextContent(/\(BRL\)/);
    expect(market).toHaveTextContent('Horário de São Paulo (America/Sao_Paulo)');
    expect(market).toHaveTextContent('Módulo de corridas: liberado');
    expect(market).toHaveTextContent('Cotação: liberado');
    expect(market).toHaveTextContent('Chamada de motoristas: liberado');
    expect(market).toHaveTextContent('Cobrança: desligado');
    expect(market).toHaveTextContent('Pix');
    expect(market).not.toHaveTextContent('Pix, Pix');
    expect(market).toHaveTextContent('Econômico (até 4 lugares)');
    expect(market).toHaveTextContent('Sedã (até 4 lugares)');
    expect(screen.getByText(/Ambiente de ensaio/)).toHaveAttribute('role', 'status');
    expect(screen.getByRole('link', { name: 'Cotar Carro em Corridas' })).toHaveAttribute('href', '/corridas');
  });

  it('não mostra aviso de ensaio quando o servidor responde pelo ambiente real, e lá nada fica aberto', async () => {
    vi.mocked(rideMarket.catalog).mockResolvedValue(
      catalog(
        [open('shuttle_seat', 'Assento em linha de van', { status: 'inventory', available: false, reason: 'not_authorized' }), ...records],
        { environment: 'live' },
      ),
    );
    show();
    expect(await screen.findByText(/Nenhuma modalidade está aberta para esta consulta/)).toBeVisible();
    expect(screen.queryByText(/Ambiente de ensaio/)).toBeNull();
    expect(within(card('Assento em linha de van')).getByText('Sem autorização vigente nesta praça.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ver partidas e assentos' })).toBeNull();
  });

  it('táxi, moto, compartilhada, transporte público, micromobilidade, locação e autônomo ficam só como registro, com motivo, fonte e data, sem ação de pedido', async () => {
    vi.mocked(rideMarket.catalog).mockResolvedValue(catalog([open('car', 'Carro'), ...records]));
    show();
    const section = await screen.findByRole('region', { name: 'Não disponíveis na WorkEasy' });
    expect(section).toHaveTextContent('Elas não podem ser pedidas.');
    expect(within(section).getAllByRole('heading', { level: 3 })).toHaveLength(records.length);
    expect(within(section).queryAllByRole('button')).toHaveLength(0);
    for (const record of records) {
      const item = card(record.label!);
      expect(section).toContainElement(item);
      expect(item).toHaveTextContent('Não disponível');
      expect(item).toHaveTextContent('Sem autorização nesta praça e sem operação pela WorkEasy.');
      expect(item).toHaveTextContent('Consulta em 27/11/2026');
      const links = within(item).getAllByRole('link');
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAttribute('href', record.source);
      expect(links[0]).toHaveAttribute('rel', 'noopener noreferrer');
      expect(within(item).getByText(/Saber mais sobre/)).toBeInTheDocument();
      expect(item).toHaveTextContent('Não há pedido, lista de espera ou reserva para esta modalidade no aplicativo.');
    }
    expect(rideMarket.request).not.toHaveBeenCalled();
  });

  it('uma autorização registrada para táxi não cria pedido nem habilita moto, e os motivos são diferentes', async () => {
    vi.mocked(rideMarket.catalog).mockResolvedValue(
      catalog([
        // Even a row that claims to be open stays a record: this product has no flow for it.
        row('taxi', 'Táxi', { status: 'authorized', operational: true, available: true, reason: 'no_operational_flow' }),
        row('moto', 'Moto'),
      ]),
    );
    show();
    const taxi = await waitFor(() => card('Táxi'));
    expect(taxi).toHaveTextContent('Não disponível');
    expect(taxi).toHaveTextContent('a WorkEasy não opera esta modalidade');
    expect(card('Moto')).toHaveTextContent('Sem autorização nesta praça e sem operação pela WorkEasy.');
    expect(screen.queryAllByRole('link', { name: /Cotar/ })).toHaveLength(0);
    expect(within(screen.getByRole('region', { name: 'Não disponíveis na WorkEasy' })).queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(/Nenhuma modalidade está aberta para esta consulta/)).toBeVisible();
  });

  it('consulta o trajeto escolhido e só abre o painel de assentos depois da porta do servidor', async () => {
    vi.mocked(rideMarket.catalog).mockResolvedValue(catalog([open('shuttle_seat', 'Assento em linha de van'), ...records]));
    vi.mocked(rideMarket.request).mockResolvedValue({ modality: 'shuttle_seat', flow: 'shuttle' });
    show();
    expect(await screen.findByText('Para abrir, informe origem e destino em "Consultar um trajeto".')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ver partidas e assentos' })).toBeNull();
    await consult();
    await waitFor(() => expect(rideMarket.catalog).toHaveBeenLastCalledWith('Saúde', 'Jabaquara', null));
    expect(await screen.findByText('Consulta para Saúde → Jabaquara, saída agora.')).toBeVisible();
    expect(screen.queryByText('Painel de assentos de teste')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver partidas e assentos' }));
    expect(await screen.findByText('Painel de assentos de teste')).toBeVisible();
    expect(rideMarket.request).toHaveBeenCalledTimes(1);
    expect(rideMarket.request).toHaveBeenCalledWith('shuttle_seat', 'Saúde', 'Jabaquara', null);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar Assento em linha de van' }));
    expect(screen.queryByText('Painel de assentos de teste')).toBeNull();
    // Another trip closes what the door opened for the previous one.
    fireEvent.click(screen.getByRole('button', { name: 'Ver partidas e assentos' }));
    expect(await screen.findByText('Painel de assentos de teste')).toBeVisible();
    await consult('Jabaquara', 'Saúde');
    await screen.findByText('Consulta para Jabaquara → Saúde, saída agora.');
    expect(screen.queryByText('Painel de assentos de teste')).toBeNull();
    expect(rideMarket.request).toHaveBeenCalledTimes(2);
  });

  it('envia o horário de São Paulo ao catálogo e à porta, e recusa origem igual ao destino sem consultar', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2090-06-10T00:00:00Z'));
    vi.mocked(rideMarket.catalog).mockResolvedValue(catalog([open('hourly', 'Por hora')]));
    vi.mocked(rideMarket.request).mockResolvedValue({ modality: 'hourly', flow: 'block' });
    show();
    await consult('Saúde', 'Saúde');
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha origem e destino diferentes.');
    fireEvent.change(screen.getByLabelText(/Data e hora do embarque \(São Paulo\)/), { target: { value: '2090-08-11T09:30' } });
    await consult();
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha um horário nos próximos 30 dias, no horário de São Paulo.');
    expect(rideMarket.catalog).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText(/Data e hora do embarque \(São Paulo\)/), { target: { value: '2090-06-11T09:30' } });
    await consult();
    await waitFor(() => expect(rideMarket.catalog).toHaveBeenLastCalledWith('Saúde', 'Jabaquara', '2090-06-11T12:30:00.000Z'));
    expect(await screen.findByText(/embarque em 11\/06\/2090,? 09:30 \(São Paulo\)/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ver blocos de horas' }));
    expect(await screen.findByText('Painel por hora de teste')).toBeVisible();
    expect(rideMarket.request).toHaveBeenCalledWith('hourly', 'Saúde', 'Jabaquara', '2090-06-11T12:30:00.000Z');
    vi.restoreAllMocks();
  });

  it('a recusa da porta não abre o painel e diz que nada foi solicitado', async () => {
    vi.mocked(rideMarket.catalog).mockResolvedValue(catalog([open('intercity', 'Entre municípios')]));
    vi.mocked(rideMarket.request).mockRejectedValue({ code: 'P0001', message: 'ride_modality_unavailable' });
    show();
    await consult();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver corredores entre municípios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Esta modalidade não está liberada para este trajeto e horário. Nada foi solicitado.',
    );
    expect(screen.queryByText('Painel entre municípios de teste')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver corredores entre municípios' })).toBeEnabled();
  });

  it('modalidade operada mas fechada para a consulta mostra o motivo, a janela e nenhuma ação', async () => {
    vi.mocked(rideMarket.catalog).mockResolvedValue(
      catalog([
        open('hourly', 'Por hora', { available: false, reason: 'outside_hours', open_from: '06:00:00', open_until: '22:00:00' }),
        open('wav', 'Veículo acessível', { available: false, reason: 'authorization_expired' }),
      ]),
    );
    show();
    const section = await screen.findByRole('region', { name: 'Indisponíveis para esta consulta' });
    expect(card('Por hora')).toHaveTextContent('Fora do horário autorizado para o embarque. Janela desta praça: das 06:00 às 22:00');
    expect(card('Veículo acessível')).toHaveTextContent('A autorização desta praça venceu');
    expect(within(section).queryAllByRole('button')).toHaveLength(0);
    expect(within(section).queryAllByRole('link', { name: /Cotar/ })).toHaveLength(0);
  });

  it('atualiza o catálogo quando a página volta a ficar visível e mantém a lista se a nova leitura falhar', async () => {
    vi.mocked(rideMarket.catalog).mockResolvedValueOnce(catalog([open('car', 'Carro')])).mockRejectedValue(new Error('rede'));
    show();
    await screen.findByRole('link', { name: 'Cotar Carro em Corridas' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(rideMarket.catalog).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('link', { name: 'Cotar Carro em Corridas' })).toBeVisible();
  });

  it('sem servidor, mostra o ensaio local com uma nota e não consulta o catálogo', () => {
    vi.mocked(useAuth).mockReturnValue({ ...session, mode: 'demo' } as unknown as ReturnType<typeof useAuth>);
    show();
    expect(screen.getByText(/O catálogo de modalidades depende do servidor/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Ensaio de corrida' })).toBeVisible();
    expect(rideMarket.catalog).not.toHaveBeenCalled();
  });
});
