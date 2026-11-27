import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BoardingPin, RideCommunication } from '../../components/mobility/safety/RideCommunication';
import { Incident } from '../../components/mobility/safety/Incident';
import { RideDisplayMode } from '../../components/mobility/safety/common';
import { RideTrust } from '../../components/mobility/safety/Trust';
import { safety, type SafetyStatus, type TrustStatus } from '../../services/rideSafety';

vi.mock('../../services/rideSafety', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/rideSafety')>();
  return {
    ...original,
    safety: {
      ...original.safety,
      pin: vi.fn(),
      board: vi.fn(),
      invite: vi.fn(),
      revoke: vi.fn(),
      report: vi.fn(),
      block: vi.fn(),
      access: vi.fn(),
    },
  };
});
const refresh = vi.fn();
const status: SafetyStatus = {
  role: 'passenger',
  status: 'boarded',
  simulation: true,
  wellness: 'stale_signal',
  vehicle: null,
  location: null,
  dial: null,
  policy: null,
  recording_allowed: false,
  notice_given: false,
  media_enabled: false,
  cases: [],
  lost_checks: [],
};
const trust: TrustStatus = {
  role: 'passenger',
  can_rate: false,
  my_stars: null,
  can_block: true,
  blocked: false,
  cue: null,
  assistance: null,
  sharing: null,
  restrictions: [],
};
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
describe('Segurança por trecho', () => {
  it('mostra o PIN do servidor após escolha do passageiro, legível com ampliação', async () => {
    vi.mocked(safety.pin).mockResolvedValue({ pin: '017459', expires_at: '2026-11-27T16:00:00Z' });
    render(
      <>
        <RideDisplayMode />
        <BoardingPin leg="leg-a" driver={false} refresh={refresh} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Modo simplificado/ }));
    expect(document.documentElement).toHaveClass('ride-simple');
    fireEvent.click(screen.getByRole('button', { name: /Gerar PIN/ }));
    expect(await screen.findByText('0 1 7 4 5 9')).toBeVisible();
    expect(safety.pin).toHaveBeenCalledWith('leg-a');
  });
  it('não anuncia embarque quando o backend rejeita o PIN', async () => {
    vi.mocked(safety.board).mockResolvedValue({ ok: false, reason: 'invalid' });
    render(<BoardingPin leg="leg-b" driver refresh={refresh} />);
    fireEvent.change(screen.getByLabelText(/PIN informado/), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar embarque/ }));
    expect(await screen.findByText(/PIN inválido/)).toBeVisible();
    expect(screen.queryByText('Embarque confirmado.')).toBeNull();
  });
  it('gera um convite para a conta selecionada e permite revogá-lo', async () => {
    vi.mocked(safety.invite).mockResolvedValue({
      id: 'share',
      token: 'synthetic-token',
      expires_at: '2026-11-27T16:00:00Z',
    });
    vi.mocked(safety.revoke).mockResolvedValue(true);
    render(
      <MemoryRouter>
        <RideCommunication
          leg="leg-c"
          data={{
            role: 'driver',
            status: 'arriving',
            messages: [],
            shares: [{ id: 'share', expires_at: '2026-11-27T16:00:00Z' }],
          }}
          refresh={refresh}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByText('Conversa e compartilhamento'));
    fireEvent.change(screen.getByLabelText('E-mail do convidado'), { target: { value: 'qa@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite' }));
    expect(((await screen.findByLabelText('Link para copiar')) as HTMLInputElement).value).toContain(
      '#convite=synthetic-token',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revogar convite' }));
    await waitFor(() => expect(safety.revoke).toHaveBeenCalledWith('share'));
  });
  it('ensaia o discador e separa o pedido de ajuda de uma chamada', async () => {
    vi.mocked(safety.report).mockResolvedValue('PROTOCOLO-TESTE');
    render(<Incident leg="leg-a" status={status} refresh={refresh} />);
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Ensaiar discador/ }));
    expect(screen.getByText(/Nenhuma chamada foi iniciada/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Preciso de ajuda do plantão' }));
    expect(await screen.findByText(/PROTOCOLO-TESTE/)).toBeVisible();
  });
  it('classifica indisponibilidade adaptada e bloqueia somente novas combinações', async () => {
    vi.mocked(safety.access).mockResolvedValue({ available: false });
    vi.mocked(safety.block).mockResolvedValue(true);
    render(<RideTrust leg="leg-a" data={trust} active refresh={refresh} />);
    fireEvent.click(screen.getByText('Acessibilidade, avaliação e bloqueio'));
    fireEvent.change(screen.getByLabelText('Assistência ao embarcar'), { target: { value: 'wheelchair_vehicle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar preferências' }));
    expect(await screen.findByText(/Sem par compatível/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear novas combinações deste par' }));
    await waitFor(() => expect(safety.block).toHaveBeenCalledWith('leg-a', true));
  });
});
