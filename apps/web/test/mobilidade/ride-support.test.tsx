import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RideHelp, RideSupportQueue } from '../../components/mobility/RideSupport';
import { openRideHelp } from '../../services/rideAftercare';
import {
  claimSupportRequest,
  getSupportContact,
  listSupportQueue,
  resolveSupportRequest,
  type RideSupportContact,
  type SupportQueueItem,
} from '../../services/rideSupport';

vi.mock('../../services/rideSupport', async (original) => ({
  ...(await original<typeof import('../../services/rideSupport')>()),
  claimSupportRequest: vi.fn(),
  resolveSupportRequest: vi.fn(),
  listSupportQueue: vi.fn(),
  getSupportContact: vi.fn(),
}));
vi.mock('../../services/rideAftercare', () => ({ openRideHelp: vi.fn() }));

const baseItem: SupportQueueItem = {
  protocol: 'protocolo-123',
  leg: 'trecho-456',
  kind: 'ride_help',
  reason: 'payment',
  environment: 'simulation',
  created_at: '2026-11-27T13:00:00Z',
  claimed_by: null,
  claimed_by_me: false,
  can_claim: true,
  can_resolve: false,
  resolved_at: null,
  code: null,
};
const contact: RideSupportContact = {
  environment: 'live',
  team: 'Coordenação de transporte',
  channel: 'email',
  address: 'equipe@workeasy.example',
  from: '2026-11-27T12:00:00Z',
  until: '2026-11-27T18:00:00Z',
  on_duty: true,
  requests: [],
};
beforeEach(() => vi.resetAllMocks());

describe('atendimento da rede de transporte', () => {
  it('mostra o canal profissional, o horário de São Paulo e o protocolo da pessoa', async () => {
    vi.mocked(getSupportContact).mockResolvedValue({
      ...contact,
      requests: [{ ...baseItem, resolved_at: '2026-11-27T15:00:00Z', code: 'rebooked' }],
    });
    render(<RideHelp legId="trecho-456" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pedir ajuda com o trecho' }));
    expect(await screen.findByRole('link', { name: 'equipe@workeasy.example' })).toHaveAttribute('href', 'mailto:equipe@workeasy.example');
    expect(screen.getByText(/27\/11\/2026 09:00 a 27\/11\/2026 15:00/)).toBeInTheDocument();
    expect(screen.getByText(/protocolo-123 · Pagamento.*Reagendamento combinado/)).toBeInTheDocument();
    expect(getSupportContact).toHaveBeenCalledWith('trecho-456');
  });

  it('distingue ensaio de canal ao vivo e continua aceitando protocolo sem plantão configurado', async () => {
    vi.mocked(getSupportContact)
      .mockResolvedValueOnce({ ...contact, environment: 'simulation' })
      .mockResolvedValue({ ...contact, from: null, until: null, on_duty: false, channel: null, address: null });
    vi.mocked(openRideHelp).mockResolvedValue('protocolo-2');
    render(<RideHelp legId="trecho-456" />);
    fireEvent.click(screen.getByRole('button', { name: 'Pedir ajuda com o trecho' }));
    expect(await screen.findByText(/Plantão simulado/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar plantão e protocolos' }));
    expect(await screen.findByText(/Sem plantão ativo/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar pedido de ajuda' }));
    expect(await screen.findByText(/Pedido registrado. Protocolo protocolo-2/)).toBeInTheDocument();
    expect(openRideHelp).toHaveBeenCalledWith('trecho-456', 'safety');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('assume uma ocorrência e exige resultado explícito para encerrá-la, respeitando o retorno do servidor', async () => {
    const active = { ...baseItem, claimed_by: 'admin-1', claimed_by_me: true, can_claim: false, can_resolve: true };
    vi.mocked(listSupportQueue)
      .mockResolvedValueOnce([baseItem])
      .mockResolvedValueOnce([active])
      .mockResolvedValue([{ ...active, can_resolve: false, resolved_at: '2026-11-27T14:30:00Z', code: 'cost_reviewed' }]);
    vi.mocked(claimSupportRequest).mockResolvedValue(baseItem.protocol);
    vi.mocked(resolveSupportRequest).mockResolvedValue(baseItem.protocol);
    render(<RideSupportQueue />);
    expect(await screen.findByText('Pedido de ajuda · Ensaio')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Encerrar atendimento' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Assumir atendimento' }));
    expect(await screen.findByText('Atribuído a você')).toBeInTheDocument();
    expect(claimSupportRequest).toHaveBeenCalledExactlyOnceWith(baseItem.protocol);
    expect(screen.getByRole('button', { name: 'Encerrar atendimento' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Resultado do atendimento'), { target: { value: 'cost_reviewed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar atendimento' }));
    expect(await screen.findByText(/Encerrado em.*Custo revisado/)).toBeInTheDocument();
    expect(resolveSupportRequest).toHaveBeenCalledExactlyOnceWith(baseItem.protocol, 'cost_reviewed');
    expect(screen.queryByRole('button', { name: 'Encerrar atendimento' })).not.toBeInTheDocument();
  });

  it('reconcilia após resposta perdida e obedece à atribuição de outro plantonista', async () => {
    vi.mocked(listSupportQueue)
      .mockResolvedValueOnce([baseItem])
      .mockResolvedValue([{ ...baseItem, claimed_by: 'outro', can_claim: false }]);
    vi.mocked(claimSupportRequest).mockRejectedValue(new Error('timeout'));
    render(<RideSupportQueue />);
    fireEvent.click(await screen.findByRole('button', { name: 'Assumir atendimento' }));
    expect(await screen.findByText('Atribuído a outro operador')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Assumir atendimento' })).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Encerrar atendimento' })).not.toBeInTheDocument();
    expect(resolveSupportRequest).not.toHaveBeenCalled();
  });
});
