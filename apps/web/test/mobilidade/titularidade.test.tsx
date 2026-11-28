import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Members from '../../components/mobility/business/Members';
import FleetPanel from '../../components/mobility/fleet/FleetPanel';
import DependentPanel from '../../components/mobility/parties/DependentPanel';
import FamilyPanel from '../../components/mobility/parties/FamilyPanel';
import Ownership from '../../components/mobility/parties/Ownership';
import ExcluirConta from '../../pages/conta/ExcluirConta';
import type { OrgAccount } from '../../services/rideBusiness';
import { fleets, type FleetAccount } from '../../services/rideFleets';
import type { PartyAccount } from '../../services/rideParties';
import type { OwnedAccount } from '../../services/rideOwnership';
import { expectAccessibleScreen } from '../a11y/contract';

const rpc = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ id: 'titular' as string | null }));
vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    mode: 'backend',
    authUser: session.id ? { id: session.id } : null,
    loading: false,
    isAuthenticated: Boolean(session.id),
  }),
}));
vi.mock('../../services/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/client')>()),
  db: () => ({ rpc }),
}));
vi.mock('../../services/rides', () => ({ getRideDashboard: vi.fn(), quoteRide: vi.fn() }));
vi.mock('../../services/rideFleets', () => ({
  fleets: { overview: vi.fn(), myCessions: vi.fn(), removeMember: vi.fn(), inviteMember: vi.fn(), revokeInvite: vi.fn() },
}));

const ok = (data: unknown) => Promise.resolve({ data, error: null });
const fail = (message: string) => Promise.resolve({ data: null, error: { message, code: 'P0001' } });
const transfer = { id: 't1', account_id: 'grupo', owner_id: 'bia', transferred_at: '2026-11-28T15:00:00Z' };

const family: PartyAccount & OwnedAccount = {
  id: 'grupo',
  kind: 'family',
  name: 'Família Teste',
  role: 'admin',
  owner: true,
  verified: true,
  group_tag: null,
  monthly_limit_cents: 10000,
  committed_cents: 0,
  member_limit_cents: null,
  default_method: 'pix',
  mandate_id: null,
  members: [
    { member_id: 'titular', name: 'Titular', role: 'admin', status: 'active', member_limit_cents: null, group_tag: null },
    { member_id: 'bia', name: 'Bia', role: 'admin', status: 'active', member_limit_cents: null, group_tag: null },
    { member_id: 'caio', name: 'Caio', role: 'member', status: 'active', member_limit_cents: null, group_tag: null },
  ],
  invites: [],
  owner_candidates: [{ member_id: 'bia', name: 'Bia', joined_at: '2026-11-01T13:00:00Z' }],
  successor_id: 'bia',
  transferred: null,
};
/** The family row with changes; spreads skip the excess-property check of PartyAccount. */
const familyWith = (changes: Partial<typeof family>): PartyAccount => ({ ...family, ...changes });
const renderIn = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const titularidade = () => screen.getByRole('region', { name: 'Titularidade' });

beforeEach(() => {
  vi.resetAllMocks();
  session.id = 'titular';
});

describe('Titularidade · grupo familiar', () => {
  it('diz o que a exclusão faz, lista quem pode receber e só transfere depois da confirmação', async () => {
    rpc.mockImplementation(() => ok(transfer));
    const change = vi.fn();
    renderIn(<FamilyPanel accounts={[family]} onChange={change} />);
    const section = titularidade();
    expect(section).toHaveTextContent('Se você excluir sua conta, a titularidade passa para Bia, a pessoa da administração que entrou primeiro no grupo.');
    fireEvent.click(within(section).getByRole('button', { name: 'Transferir titularidade' }));
    const group = within(section).getByRole('group', { name: 'Quem recebe a titularidade' });
    expect(within(group).getAllByRole('radio')).toHaveLength(1);
    // The date is when the person joined the group: the promotion date is not stored.
    expect(group).toHaveTextContent('Bia · no grupo desde');
    expect(group).not.toHaveTextContent('na administração desde');
    const confirm = within(section).getByRole('button', { name: 'Confirmar transferência' });
    expect(confirm).toBeDisabled();
    expect(section).toHaveTextContent('As próximas corridas do grupo, inclusive as suas, passam a ser pagas por ela, com os mesmos limites');
    expect(section).toHaveTextContent('Se você cadastrou dependentes, retire-os antes: só quem é titular responde por eles.');
    fireEvent.click(within(group).getByRole('radio', { name: /Bia/ }));
    fireEvent.click(confirm);
    expect(await within(section).findByRole('status')).toHaveTextContent('Titularidade transferida para Bia.');
    expect(rpc).toHaveBeenCalledWith('ride_transfer_account', { p_account: 'grupo', p_new_owner: 'bia', p_key: expect.any(String) });
    expect(change).toHaveBeenCalled();
  });

  it('uma nova tentativa depois de erro reutiliza a mesma chave e o erro aparece em português', async () => {
    rpc.mockImplementationOnce(() => fail('ride_transfer_target_invalid')).mockImplementation(() => ok(transfer));
    renderIn(<FamilyPanel accounts={[family]} onChange={vi.fn()} />);
    const section = titularidade();
    fireEvent.click(within(section).getByRole('button', { name: 'Transferir titularidade' }));
    fireEvent.click(within(section).getByRole('radio', { name: /Bia/ }));
    fireEvent.click(within(section).getByRole('button', { name: 'Confirmar transferência' }));
    expect(await within(section).findByText(/A conta só pode ir para outra pessoa que esteja na administração/)).toBeVisible();
    fireEvent.click(within(section).getByRole('button', { name: 'Confirmar transferência' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledTimes(2));
    expect(rpc.mock.calls[1][1].p_key).toBe(rpc.mock.calls[0][1].p_key);
  });

  it('nomeia uma participante para a administração; sem outra administração, pede isso antes de transferir', async () => {
    rpc.mockImplementation(() => ok(true));
    renderIn(
      <FamilyPanel accounts={[familyWith({ owner_candidates: [], successor_id: null, members: family.members.filter((m) => m.member_id !== 'bia') })]} onChange={vi.fn()} />,
    );
    const section = titularidade();
    expect(section).toHaveTextContent('o grupo familiar é encerrado, porque não há outra pessoa na administração.');
    expect(section).toHaveTextContent('Para transferir a titularidade, primeiro nomeie outra pessoa para a administração.');
    expect(within(section).queryByRole('button', { name: 'Transferir titularidade' })).toBeNull();
    fireEvent.change(within(section).getByLabelText('Nomear para a administração'), { target: { value: 'caio' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Nomear administração' }));
    expect(await within(section).findByRole('status')).toHaveTextContent('Caio agora faz parte da administração.');
    expect(rpc).toHaveBeenCalledWith('ride_set_account_admin', { p_account: 'grupo', p_member: 'caio', p_admin: true });
  });

  it('quem administra sem ser titular vê o aviso de recebimento e pode deixar a administração', async () => {
    session.id = 'bia';
    rpc.mockImplementation(() => ok(true));
    renderIn(
      <FamilyPanel
        accounts={[familyWith({ owner: false, owner_candidates: [], successor_id: null, transferred: null })]}
        onChange={vi.fn()}
      />,
    );
    const section = titularidade();
    expect(section).toHaveTextContent('Só quem é titular transfere o grupo.');
    expect(within(section).queryByRole('button', { name: 'Transferir titularidade' })).toBeNull();
    fireEvent.click(within(section).getByRole('button', { name: 'Deixar a administração' }));
    fireEvent.click(within(section).getByRole('button', { name: 'Confirmar saída da administração' }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('ride_set_account_admin', { p_account: 'grupo', p_member: 'bia', p_admin: false }));
  });

  it('quem administra sem ser titular não vê como remover outra pessoa da administração', () => {
    session.id = 'bia';
    renderIn(<FamilyPanel accounts={[familyWith({ owner: false, owner_candidates: [], successor_id: null })]} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Remover Titular' })).toBeNull();
    expect(screen.getByText('Faz parte da administração: só quem é titular remove.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Remover Caio' })).toBeVisible();
  });

  it('só quem é titular cadastra dependente do grupo familiar', () => {
    const { unmount } = renderIn(<DependentPanel accounts={[{ ...family, owner: false }]} dependents={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole('heading', { name: 'Cadastrar dependente' })).toBeNull();
    expect(screen.getByText(/só quem é titular do grupo pede e acompanha as viagens do dependente/)).toBeVisible();
    unmount();
    renderIn(<DependentPanel accounts={[family]} dependents={[]} onChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Cadastrar dependente' })).toBeVisible();
  });

  it('a titular vê como remover quem administra', () => {
    renderIn(<FamilyPanel accounts={[family]} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Remover Bia' })).toBeVisible();
  });

  it('a nova titular lê que recebeu o grupo pela exclusão da anterior', () => {
    renderIn(
      <Ownership
        account={{ ...family, transferred: { at: '2026-11-28T15:00:00Z', reason: 'erasure' } }}
        userId="titular"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('O grupo familiar passou para você em');
    expect(screen.getByRole('status')).toHaveTextContent('porque a pessoa titular excluiu a conta.');
    expectAccessibleScreen();
  });

  it('participante sem administração não vê a seção', () => {
    session.id = 'caio';
    const { container } = render(<Ownership account={{ ...family, role: 'member', owner: false }} userId="caio" onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('Titularidade · empresa e frota', () => {
  it('a titular da empresa transfere pela página de pessoas, mantendo a conferência', async () => {
    rpc.mockImplementation(() => ok({ ...transfer, account_id: 'empresa' }));
    const org = {
      id: 'empresa',
      kind: 'organization',
      name: 'Empresa Fictícia',
      role: 'admin',
      owner: true,
      verified: true,
      verified_until: '2090-01-01T00:00:00Z',
      members: [
        { member_id: 'titular', name: 'Titular', role: 'admin', status: 'active', group_tag: null },
        { member_id: 'bia', name: 'Bia', role: 'admin', status: 'active', group_tag: null },
      ],
      invites: [],
      cost_centers: [],
      owner_candidates: [{ member_id: 'bia', name: 'Bia', joined_at: '2026-11-01T13:00:00Z' }],
      successor_id: 'bia',
    } as OrgAccount & OwnedAccount;
    renderIn(<Members account={org} userId="titular" refresh={vi.fn()} />);
    const section = titularidade();
    fireEvent.click(within(section).getByRole('button', { name: 'Transferir titularidade' }));
    expect(section).toHaveTextContent('A conferência feita pela operação continua valendo.');
    fireEvent.click(within(section).getByRole('radio', { name: /Bia/ }));
    fireEvent.click(within(section).getByRole('button', { name: 'Confirmar transferência' }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('ride_transfer_account', { p_account: 'empresa', p_new_owner: 'bia', p_key: expect.any(String) }),
    );
  });

  it('o titular da frota encontra a ação no painel da frota', async () => {
    vi.mocked(fleets.overview).mockResolvedValue({ account_id: 'frota', month: '2026-11-01', vehicles: [], assignments: [], legs: [] });
    const fleet = {
      id: 'frota',
      kind: 'fleet',
      name: 'Frota Fictícia',
      role: 'admin',
      owner: true,
      verified: true,
      verified_until: '2090-01-01T00:00:00Z',
      members: [
        { member_id: 'titular', name: 'Titular', role: 'admin', status: 'active' },
        { member_id: 'gil', name: 'Gil', role: 'manager', status: 'active' },
      ],
      invites: [],
      owner_candidates: [],
      successor_id: null,
    } as FleetAccount & OwnedAccount;
    renderIn(<FleetPanel account={fleet} userId="titular" refresh={vi.fn()} onLeft={vi.fn()} />);
    const section = await screen.findByRole('region', { name: 'Titularidade' });
    expect(section).toHaveTextContent('a frota é encerrada, porque não há outra pessoa na administração.');
    expect(within(section).getByRole('option', { name: 'Gil' })).toBeInTheDocument();
  });
});

describe('Titularidade · exclusão da conta', () => {
  it('com sessão, diz o que acontece com cada grupo de que a pessoa é titular', async () => {
    rpc.mockImplementation(() =>
      ok([
        { id: 'grupo', kind: 'family', name: 'Família Teste', outcome: 'transfer', successor_id: 'bia', successor_name: 'Bia' },
        { id: 'frota', kind: 'fleet', name: 'Frota Fictícia', outcome: 'close', successor_id: null, successor_name: null },
      ]),
    );
    renderIn(<ExcluirConta />);
    expect(screen.getByRole('heading', { level: 2, name: 'Grupos de corridas de que você é titular' })).toBeVisible();
    const plan = await screen.findByRole('status');
    expect(plan).toHaveTextContent('Grupo familiar “Família Teste”: a titularidade passa para Bia.');
    expect(plan).toHaveTextContent('Frota “Frota Fictícia”: a conta será encerrada, porque não há outra pessoa na administração.');
    expect(rpc).toHaveBeenCalledWith('ride_erasure_account_plan');
  });

  it('sem sessão, explica a regra e não consulta nada', () => {
    session.id = null;
    renderIn(<ExcluirConta />);
    expect(screen.getByText(/a titularidade passa para a pessoa da administração que entrou primeiro no grupo/)).toBeVisible();
    expect(rpc).not.toHaveBeenCalled();
  });
});
