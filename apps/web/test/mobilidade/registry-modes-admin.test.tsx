import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lastBookableDayInSaoPaulo, validityEnd } from '../../lib/timezone';
import RideModes from '../../pages/admin/RideModes';
import { rideRegistry, rideShuttle, type RegistryLine } from '../../services/rideModes';
import { expectAccessibleScreen } from '../a11y/contract';

vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: 'backend', authUser: { id: 'admin' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../services/rideModes', () => ({
  rideShuttle: { adminDepartures: vi.fn(), cancelDeparture: vi.fn() },
  rideRegistry: {
    lines: vi.fn(),
    saveLine: vi.fn(),
    departures: vi.fn(),
    saveDeparture: vi.fn(),
    designate: vi.fn(),
    markDeparted: vi.fn(),
    tariffs: vi.fn(),
    saveTariff: vi.fn(),
    corridors: vi.fn(),
    saveCorridor: vi.fn(),
    policies: vi.fn(),
    savePolicy: vi.fn(),
  },
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = lastBookableDayInSaoPaulo(new Date(), 60);
const END = validityEnd(DAY)!.toISOString();
const AREAS = ['Jabaquara', 'Saúde', 'Vila Mariana'];
const line: RegistryLine = {
  id: 'linha-1',
  origin_area: 'Saúde',
  destination_area: 'Jabaquara',
  operator_ref: 'OP-1',
  seat_cents: 1800,
  minutes: 45,
  evidence_ref: 'ficticio-o17-e6',
  valid_until: null,
  enabled: true,
  open_departures: 1,
  next_departure: '2090-01-10T12:00:00Z',
};
const open = () =>
  render(
    <MemoryRouter>
      <RideModes />
    </MemoryRouter>,
  );
const panel = async (name: string) => fireEvent.click(await screen.findByRole('button', { name }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(rideShuttle.adminDepartures).mockResolvedValue({ simulation: true, departures: [] });
});

describe('administração · cadastros das modalidades', () => {
  it('só lê um cadastro quando o painel é aberto, e marca o painel aberto', async () => {
    vi.mocked(rideRegistry.lines).mockResolvedValue({ simulation: true, areas: AREAS, lines: [line] });
    open();
    const button = await screen.findByRole('button', { name: 'Linhas e partidas' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(rideRegistry.lines).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'Saúde → Jabaquara' })).toBeVisible();
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Ligada · R\$\s?18,00 por assento · 45 min · operador OP-1/)).toBeVisible();
    expect(screen.getByText(/Evidência ficticio-o17-e6 · sem prazo \(ensaio\) · 1 partidas abertas/)).toBeVisible();
    expect(screen.getAllByText(/ligar exige a referência da evidência conferida/)[0]).toBeVisible();
    expect(rideRegistry.tariffs).not.toHaveBeenCalled();
    expectAccessibleScreen();
  });

  it('cadastra uma linha com a chave da tentativa como código e repete a mesma chave depois de uma falha', async () => {
    vi.mocked(rideRegistry.lines).mockResolvedValue({ simulation: true, areas: AREAS, lines: [] });
    vi.mocked(rideRegistry.saveLine).mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(line);
    open();
    await panel('Linhas e partidas');
    expect(await screen.findByText('Nenhuma linha cadastrada neste ambiente.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar linha' }));
    fireEvent.change(screen.getByLabelText('Origem'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'Jabaquara' } });
    fireEvent.change(screen.getByLabelText('Referência do operador'), { target: { value: ' OP-1 ' } });
    fireEvent.change(screen.getByLabelText('Preço de um assento (R$)'), { target: { value: '18,00' } });
    fireEvent.change(screen.getByLabelText('Duração da viagem (minutos)'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Referência da evidência conferida'), { target: { value: 'CONTRATO-1' } });
    fireEvent.change(screen.getByLabelText('Válido até (São Paulo)'), { target: { value: DAY } });
    fireEvent.click(screen.getByLabelText('Linha ligada para venda de assentos'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar linha' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar linha' }));
    expect(await screen.findByText('Linha Saúde → Jabaquara salva e ligada.')).toBeVisible();
    const calls = vi.mocked(rideRegistry.saveLine).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toEqual({
      id: expect.stringMatching(UUID),
      origin: 'Saúde',
      destination: 'Jabaquara',
      operatorRef: 'OP-1',
      seatCents: 1800,
      minutes: 45,
      evidenceRef: 'CONTRATO-1',
      validUntil: END,
      enabled: true,
    });
    expect(calls[1][0].id).toBe(calls[0][0].id);
    await waitFor(() => expect(rideRegistry.lines).toHaveBeenCalledTimes(3));
  });

  it('recusa no próprio formulário origem igual ao destino, sem chamar o servidor', async () => {
    vi.mocked(rideRegistry.lines).mockResolvedValue({ simulation: true, areas: AREAS, lines: [] });
    open();
    await panel('Linhas e partidas');
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar linha' }));
    fireEvent.change(screen.getByLabelText('Origem'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'Saúde' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar linha' }).closest('form')!);
    expect(await screen.findByText('Escolha a origem e um destino diferente.')).toBeVisible();
    expect(rideRegistry.saveLine).not.toHaveBeenCalled();
  });

  it('nas partidas de uma linha designa só motoristas com lugares e marca a partida', async () => {
    vi.mocked(rideRegistry.lines).mockResolvedValue({ simulation: true, areas: AREAS, lines: [line] });
    vi.mocked(rideRegistry.departures).mockResolvedValue({
      line_id: 'linha-1',
      minutes: 45,
      departures: [
        { id: 'p1', line_id: 'linha-1', departs_at: '2090-01-10T12:00:00Z', seats_total: 10, seats_confirmed: 3, state: 'open', closed_at: null, driver_id: null, driver_label: null, driver_valid: false },
        { id: 'p2', line_id: 'linha-1', departs_at: '2090-01-09T12:00:00Z', seats_total: 10, seats_confirmed: 0, state: 'departed', closed_at: '2090-01-09T12:00:00Z', driver_id: 'm1', driver_label: 'Bruno', driver_valid: true },
      ],
      drivers: [
        { id: 'm1', label: 'Bruno', vehicle: 'van', seats: 12, capacity_until: '2090-02-01T00:00:00Z', valid_until: '2090-02-01' },
        { id: 'm2', label: 'Carla', vehicle: 'sedan', seats: 4, capacity_until: '2090-02-01T00:00:00Z', valid_until: '2090-02-01' },
      ],
    });
    vi.mocked(rideRegistry.designate).mockResolvedValue({} as never);
    open();
    await panel('Linhas e partidas');
    fireEvent.click(await screen.findByRole('button', { name: 'Partidas de Saúde → Jabaquara' }));
    const select = await screen.findByLabelText('Motorista para a partida 10/01/2090 09:00 (São Paulo)');
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Selecione', 'Bruno · Van com 12 lugares']);
    expect(screen.getByRole('button', { name: 'Marcar como partida' })).toBeDisabled();
    expect(screen.getAllByText(/Partiu · 0 de 10 assentos reservados · motorista Bruno/)).toHaveLength(1);
    fireEvent.change(select, { target: { value: 'm1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Designar motorista' }));
    expect(await screen.findByText('Motorista designado para a partida 10/01/2090 09:00 (São Paulo).')).toBeVisible();
    expect(rideRegistry.designate).toHaveBeenCalledWith('p1', 'm1');
  });

  it('cadastra bloco, corredor e política, cada um no seu painel', async () => {
    vi.mocked(rideRegistry.tariffs).mockResolvedValue({ simulation: true, areas: AREAS, tariffs: [] });
    vi.mocked(rideRegistry.saveTariff).mockResolvedValue({} as never);
    vi.mocked(rideRegistry.corridors).mockResolvedValue({ simulation: true, areas: AREAS, corridors: [] });
    vi.mocked(rideRegistry.saveCorridor).mockResolvedValue({} as never);
    vi.mocked(rideRegistry.policies).mockResolvedValue({
      simulation: true,
      areas: AREAS,
      policies: [{ area: 'Saúde', min_lead_minutes: 60, confirm_lead_minutes: 30, max_shift_minutes: 180, evidence_ref: 'ficticio-o17-e6', valid_until: null, enabled: true }],
    });
    vi.mocked(rideRegistry.savePolicy).mockResolvedValue({} as never);
    open();
    await panel('Blocos por hora');
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar bloco' }));
    fireEvent.change(screen.getByLabelText('Área de embarque'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Código do bloco'), { target: { value: '2h' } });
    fireEvent.change(screen.getByLabelText('Duração do bloco (minutos)'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Quilômetros incluídos'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Preço do bloco (R$)'), { target: { value: '150,00' } });
    fireEvent.change(screen.getByLabelText('Excedente por 15 minutos (R$)'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Excedente por quilômetro (R$)'), { target: { value: '2,00' } });
    fireEvent.change(screen.getByLabelText('Referência da evidência conferida'), { target: { value: 'TARIFA-1' } });
    fireEvent.change(screen.getByLabelText('Válido até (São Paulo)'), { target: { value: DAY } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar bloco' }));
    expect(await screen.findByText('Bloco 2h de Saúde salvo.')).toBeVisible();
    expect(rideRegistry.saveTariff).toHaveBeenCalledWith({
      id: expect.stringMatching(UUID),
      area: 'Saúde',
      code: '2h',
      minutes: 120,
      included_km: 40,
      block_cents: 15000,
      extra_15min_cents: 1000,
      extra_km_cents: 200,
      evidence_ref: 'TARIFA-1',
      valid_until: END,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Corredores entre municípios' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar corredor' }));
    fireEvent.change(screen.getByLabelText('Origem'), { target: { value: 'Saúde' } });
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'Cidade vizinha' } });
    fireEvent.change(screen.getByLabelText('Município de origem'), { target: { value: 'Município A' } });
    fireEvent.change(screen.getByLabelText('Município de destino'), { target: { value: 'Município B' } });
    fireEvent.change(screen.getByLabelText('Referência da autorização do trajeto'), { target: { value: 'AUT-1' } });
    fireEvent.change(screen.getByLabelText('Referência da cobertura de seguro'), { target: { value: 'COB-1' } });
    fireEvent.change(screen.getByLabelText('Retorno vazio do motorista (R$)'), { target: { value: '52,00' } });
    fireEvent.change(screen.getByLabelText('Tempo do retorno (minutos)'), { target: { value: '55' } });
    fireEvent.change(screen.getByLabelText('Válido até (São Paulo)'), { target: { value: DAY } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar corredor' }));
    expect(await screen.findByText('Corredor Saúde → Cidade vizinha salvo, desligado.')).toBeVisible();
    expect(rideRegistry.saveCorridor).toHaveBeenCalledWith(
      expect.objectContaining({ origin: 'Saúde', destination: 'Cidade vizinha', empty_return_cents: 5200, return_minutes: 55, enabled: false, valid_until: END }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Políticas de reserva' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Alterar política de Saúde' }));
    expect(screen.getByLabelText('Área de embarque')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motorista confirma até (minutos antes)'), { target: { value: '90' } });
    fireEvent.change(screen.getByLabelText('Válido até (São Paulo)'), { target: { value: DAY } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar política' }));
    expect(await screen.findByText('O prazo de confirmação não pode passar da antecedência mínima.')).toBeVisible();
    expect(rideRegistry.savePolicy).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Motorista confirma até (minutos antes)'), { target: { value: '45' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar política' }));
    expect(await screen.findByText('Política de reserva de Saúde salva e ligada.')).toBeVisible();
    expect(rideRegistry.savePolicy).toHaveBeenCalledWith({
      area: 'Saúde',
      min_lead_minutes: 60,
      confirm_lead_minutes: 45,
      max_shift_minutes: 180,
      evidence_ref: 'ficticio-o17-e6',
      valid_until: END,
      enabled: true,
    });
  });

  it('mostra a frase do servidor quando o ambiente real recusa ligar sem evidência', async () => {
    vi.mocked(rideRegistry.lines).mockResolvedValue({ simulation: false, areas: AREAS, lines: [line] });
    vi.mocked(rideRegistry.saveLine).mockRejectedValue({ code: 'P0001', message: 'ride_registry_evidence_required' });
    open();
    await panel('Linhas e partidas');
    fireEvent.click(await screen.findByRole('button', { name: 'Alterar linha Saúde → Jabaquara' }));
    fireEvent.change(screen.getByLabelText('Válido até (São Paulo)'), { target: { value: DAY } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar linha' }));
    expect(await screen.findByText(/um cadastro só é ligado com a referência da evidência conferida/)).toBeVisible();
    expect(vi.mocked(rideRegistry.saveLine).mock.calls[0][0].id).toBe('linha-1');
  });
});
