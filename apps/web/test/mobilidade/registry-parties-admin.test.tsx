import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RidePartyRegistry from '../../pages/admin/RidePartyRegistry';
import { partiesRegistry, type IssuedGuestInvite } from '../../services/ridePartiesAdmin';
import { expectAccessibleScreen } from '../a11y/contract';

vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: 'backend', authUser: { id: 'operadora' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../services/ridePartiesAdmin', () => ({
  partiesAdmin: { verifyAccount: vi.fn() },
  partiesRegistry: { clearances: vi.fn(), guestInvites: vi.fn(), revokeGuestInvite: vi.fn(), closedInvoices: vi.fn() },
}));

const invite = (over: Partial<IssuedGuestInvite> = {}): IssuedGuestInvite => ({
  id: 'convite-1',
  account_id: 'org',
  account_name: 'Ateliê Fictício',
  status: 'pending',
  legs: [{ origin: 'Saúde', destination: 'Jabaquara' }],
  scheduled_at: null,
  expires_at: '2090-01-02T12:00:00Z',
  answered_at: null,
  created_at: '2090-01-01T12:00:00Z',
  ...over,
});

beforeEach(() => vi.resetAllMocks());

describe('Administração · registros das contas', () => {
  it('só consulta uma lista quando ela é aberta e mostra as liberações vigentes e encerradas', async () => {
    vi.mocked(partiesRegistry.clearances).mockResolvedValue([
      { driver_id: 'm1', driver_label: 'Bruno', vehicle: 'van', driver_status: 'approved', evidence_ref: 'CHECAGEM-1', valid_until: '2090-03-01T03:00:00Z', granted_at: '2090-01-01T12:00:00Z', active: true },
      { driver_id: 'm2', driver_label: null, vehicle: 'sedan', driver_status: 'suspended', evidence_ref: 'CHECAGEM-2', valid_until: '2020-03-01T03:00:00Z', granted_at: '2019-03-01T12:00:00Z', active: false },
    ]);
    render(<RidePartyRegistry />);
    expect(partiesRegistry.clearances).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: 'Motoristas liberados para dependentes' });
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-pressed', 'true');
    expect(await screen.findByText(/Liberação vigente até 01\/03\/2090 · referência CHECAGEM-1/)).toBeVisible();
    expect(screen.getByText(/Liberação encerrada em 01\/03\/2020 · referência CHECAGEM-2 .* cadastro do motorista fora de aprovação/)).toBeVisible();
    expect(partiesRegistry.guestInvites).not.toHaveBeenCalled();
    expectAccessibleScreen();
  });

  it('revoga um convite pendente só com motivo e depois da confirmação, e relê a lista', async () => {
    vi.mocked(partiesRegistry.guestInvites)
      .mockResolvedValueOnce([invite(), invite({ id: 'convite-2', status: 'declined', account_name: 'Gráfica Fictícia' })])
      .mockResolvedValue([invite({ status: 'revoked' })]);
    vi.mocked(partiesRegistry.revokeGuestInvite).mockResolvedValue({ id: 'convite-1', status: 'revoked' });
    render(<RidePartyRegistry />);
    fireEvent.click(screen.getByRole('button', { name: 'Convites de convidados' }));
    expect(await screen.findAllByText(/Saúde → Jabaquara · emitido em/)).toHaveLength(2);
    expect(screen.getByText('Gráfica Fictícia · Recusado')).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^Revogar convite/ })).toHaveLength(1);
    const revoke = screen.getByRole('button', { name: 'Revogar convite de Ateliê Fictício' });
    expect(revoke).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Motivo da revogação do convite de Ateliê Fictício'), { target: { value: ' Pedido da empresa ' } });
    fireEvent.click(revoke);
    expect(partiesRegistry.revokeGuestInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revogação' }));
    expect(await screen.findByText('Convite de Ateliê Fictício revogado. A autorização do convidado foi encerrada.')).toBeVisible();
    expect(partiesRegistry.revokeGuestInvite).toHaveBeenCalledWith('convite-1', 'Pedido da empresa');
    expect(await screen.findByText('Ateliê Fictício · Revogado')).toBeVisible();
  });

  it('lista as faturas fechadas com total, itens e contestações abertas', async () => {
    vi.mocked(partiesRegistry.closedInvoices).mockResolvedValue([
      { id: 'f1', account_id: 'org', account_name: 'Ateliê Fictício', month: '2090-01-01', total_cents: 12345, closed_at: '2090-02-02T12:00:00Z', lines: 3, open_disputes: 1 },
    ]);
    render(<RidePartyRegistry />);
    fireEvent.click(screen.getByRole('button', { name: 'Faturas fechadas' }));
    expect(await screen.findByText('Ateliê Fictício · janeiro de 2090')).toBeVisible();
    expect(screen.getByText(/R\$\s?123,45 · 3 itens · fechada em .* · 1 contestação em aberto/)).toBeVisible();
  });
});
