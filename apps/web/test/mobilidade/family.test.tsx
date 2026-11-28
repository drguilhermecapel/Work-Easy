import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FamilyPanel from '../../components/mobility/parties/FamilyPanel';
import FundingChoice from '../../components/mobility/parties/FundingChoice';
import Grupos from '../../pages/mobilidade/Grupos';
import {
  SELF_FUNDING,
  fundingProblem,
  parties,
  quoteRideFor,
  type Funding,
  type PartyAccount,
  type PartyOverview,
} from '../../services/rideParties';
import { getRideDashboard, quoteRide, type RideDashboard, type RideLegInput } from '../../services/rides';
import { expectAccessibleScreen } from '../a11y/contract';

const rpc = vi.hoisted(() => vi.fn());
vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: 'backend', authUser: { id: 'titular' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../services/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/client')>()),
  db: () => ({ rpc }),
}));
vi.mock('../../services/rides', () => ({ getRideDashboard: vi.fn(), quoteRide: vi.fn() }));
vi.mock('../../services/rideParties', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/rideParties')>();
  const mocked = Object.fromEntries(Object.keys(original.parties).map((name) => [name, vi.fn()]));
  return { ...original, parties: mocked as unknown as typeof original.parties };
});

const token = 'cd'.repeat(32);
const family: PartyAccount = {
  id: 'grupo',
  kind: 'family',
  name: 'Família Teste',
  role: 'admin',
  owner: true,
  monthly_limit_cents: 10000,
  committed_cents: 8000,
  member_limit_cents: null,
  default_method: 'pix',
  mandate_id: null,
  members: [
    { member_id: 'titular', name: 'Titular', role: 'admin', status: 'active', member_limit_cents: null },
    { member_id: 'bia', name: 'Bia', role: 'member', status: 'active', member_limit_cents: 4000 },
  ],
  invites: [{ id: 'pendente', role: 'member', expires_at: '2090-12-01T14:00:00Z', status: 'pending' }],
};
const asMember: PartyAccount = {
  ...family,
  role: 'member',
  owner: false,
  monthly_limit_cents: null,
  committed_cents: null,
  member_limit_cents: 4000,
  mandate_id: 'mandato',
  members: [],
  invites: [],
};
const empty: PartyOverview = { accounts: [], mandates: [], companions: [], dependents: [], programs: [] };
const dashboard = { enabled: true, simulation: true } as RideDashboard;
const change = vi.fn();
const panel = (accounts: PartyAccount[]) =>
  render(
    <MemoryRouter>
      <FamilyPanel accounts={accounts} onChange={change} />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(parties.riderInvites).mockResolvedValue([]);
});

describe('grupo familiar', () => {
  it('sem grupo, explica o próximo passo e cria o grupo com limite em centavos, repetindo a chave após falha', async () => {
    vi.mocked(parties.createFamily).mockRejectedValueOnce(new Error('rede')).mockResolvedValue('grupo');
    panel([]);
    expect(screen.getByText(/Você ainda não participa de um grupo familiar/)).toBeVisible();
    expectAccessibleScreen();
    const create = screen.getByRole('button', { name: 'Criar grupo familiar' });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Nome do grupo'), { target: { value: 'Família Teste' } });
    fireEvent.change(screen.getByLabelText('Limite mensal do grupo (R$)'), { target: { value: '300,00' } });
    fireEvent.change(screen.getByLabelText('Forma de pagamento padrão'), { target: { value: 'card' } });
    fireEvent.click(create);
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Criar grupo familiar' }));
    expect(await screen.findByText(/Grupo criado/)).toBeVisible();
    const calls = vi.mocked(parties.createFamily).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1].slice(0, 3)).toEqual(['Família Teste', 30000, 'card']);
    expect(calls[1][3]).toBe(calls[0][3]);
    expect(change).toHaveBeenCalled();
  });

  it('administrador ajusta limites do grupo e de um participante', async () => {
    panel([family]);
    expect(screen.getByText(/Bia · até R\$\s40,00 por mês/)).toBeVisible();
    expect(screen.getByText(/Neste mês:/)).toHaveTextContent(/80,00 usados ou reservados de R\$\s100,00/);
    expect(screen.queryByLabelText('Limite mensal de Titular (R$)')).toBeNull();
    fireEvent.change(screen.getByLabelText('Limite mensal do grupo (R$)'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar limite e pagamento' }));
    await waitFor(() => expect(parties.setAccountLimit).toHaveBeenCalledWith('grupo', 25000, 'pix'));
    fireEvent.change(screen.getByLabelText('Limite mensal de Bia (R$)'), { target: { value: '55,50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar limite de Bia' }));
    await waitFor(() => expect(parties.setMemberLimit).toHaveBeenCalledWith('grupo', 'bia', 5550));
    expect(await screen.findByText('Limite individual salvo.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Limite mensal de Bia (R$)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar limite de Bia' }));
    await waitFor(() => expect(parties.setMemberLimit).toHaveBeenLastCalledWith('grupo', 'bia', null));
    expectAccessibleScreen();
  });

  it('remove participante só após confirmar, avisa que as cobranças ficam e repete a chave após falha', async () => {
    vi.mocked(parties.removeMember).mockRejectedValueOnce(new Error('rede')).mockResolvedValue(true);
    panel([family]);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Bia' }));
    expect(screen.getByText(/cobranças anteriores continuam no extrato e nada\s+é apagado/)).toBeVisible();
    expect(parties.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remover Bia' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByText(/Participante removido/)).toBeVisible();
    const calls = vi.mocked(parties.removeMember).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1].slice(0, 2)).toEqual(['grupo', 'bia']);
    expect(calls[1][2]).toBe(calls[0][2]);
  });

  it('gera o convite de adesão com o link #adesao= e revoga um convite pendente só após confirmar', async () => {
    vi.mocked(parties.inviteMember).mockResolvedValue({ id: 'convite', token, expires_at: '2090-12-01T14:00:00Z' });
    vi.mocked(parties.revokeAccountInvite).mockResolvedValue(true);
    panel([family]);
    fireEvent.change(screen.getByLabelText('E-mail do participante'), { target: { value: 'leo@exemplo.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite de adesão' }));
    const link = (await screen.findByLabelText('Link do convite')) as HTMLInputElement;
    expect(link.value).toMatch(new RegExp('/corridas/convite#adesao=' + token + '$'));
    expect(parties.inviteMember).toHaveBeenCalledWith('grupo', 'leo@exemplo.test', 'member', 60, expect.any(String));
    const pending = screen.getByRole('list', { name: 'Convites pendentes' });
    fireEvent.click(within(pending).getByRole('button', { name: 'Revogar convite' }));
    expect(parties.revokeAccountInvite).not.toHaveBeenCalled();
    fireEvent.click(within(pending).getByRole('button', { name: 'Confirmar revogação' }));
    await waitFor(() => expect(parties.revokeAccountInvite).toHaveBeenCalledWith('pendente'));
    expect(await screen.findByText(/Convite revogado/)).toBeVisible();
  });

  it('mostra no extrato o total autorizado diante do limite e reserva o preço a quem paga', async () => {
    const row = {
      leg_id: 'l1',
      member_id: 'bia',
      member_name: 'Bia',
      date: '2090-12-03',
      pickup_at: '2090-12-03T15:00:00Z',
      status: 'completed',
      counted: true,
      fare_cents: 8000,
      order_status: 'paid',
      received_cents: 8000,
      refunded_cents: 0,
    };
    vi.mocked(parties.statement).mockResolvedValue({
      month: '2090-12-01',
      role: 'admin',
      monthly_limit_cents: 10000,
      member_limit_cents: null,
      total_cents: 8000,
      rows: [row, { ...row, leg_id: 'l2', status: 'cancelled', counted: false, fare_cents: 3000, received_cents: 0 }],
    });
    const admin = panel([family]);
    fireEvent.click(screen.getByRole('button', { name: 'Ver extrato do mês' }));
    expect(await screen.findByText(/Total autorizado no mês/)).toHaveTextContent(/80,00 de R\$\s100,00/);
    expect(screen.getByText(/03\/12\/2090 · Bia · Concluída · R\$\s80,00 · pago R\$\s80,00/)).toBeVisible();
    expect(screen.getByText(/Bia · Cancelada · R\$\s30,00 · fora do total/)).toBeVisible();
    expect(vi.mocked(parties.statement).mock.calls[0]).toEqual(['grupo', expect.stringMatching(/^\d{4}-\d{2}-01$/)]);
    admin.unmount();
    vi.mocked(parties.statement).mockResolvedValue({
      month: '2090-12-01',
      role: 'member',
      monthly_limit_cents: null,
      member_limit_cents: 4000,
      total_cents: null,
      rows: [{ ...row, member_name: null, fare_cents: null, order_status: null, received_cents: null, refunded_cents: null }],
    });
    panel([asMember]);
    expect(screen.getByText(/Seu limite mensal é R\$\s40,00/)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Remover/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver extrato do mês' }));
    expect(await screen.findByText(/03\/12\/2090 · Concluída · Restrito ao pagador/)).toBeVisible();
    expect(screen.queryByText(/Total autorizado no mês/)).toBeNull();
  });

  it('participante sai do grupo só após confirmar, com a própria conta e chave de repetição', async () => {
    vi.mocked(parties.removeMember).mockResolvedValue(true);
    panel([asMember]);
    fireEvent.click(screen.getByRole('button', { name: 'Sair do grupo' }));
    expect(screen.getByText(/corridas já feitas continuam no extrato de quem administra/)).toBeVisible();
    expect(parties.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar saída' }));
    await waitFor(() => expect(parties.removeMember).toHaveBeenCalledWith('grupo', 'titular', expect.any(String)));
    expect(await screen.findByText('Você saiu do grupo.')).toBeVisible();
  });
});

describe('página de grupos', () => {
  const open = () =>
    render(
      <MemoryRouter initialEntries={['/corridas/grupos']}>
        <Grupos />
      </MemoryRouter>,
    );

  it('mostra o aviso de ensaio, as três frentes e os estados vazios com o próximo passo', async () => {
    vi.mocked(getRideDashboard).mockResolvedValue(dashboard);
    vi.mocked(parties.overview).mockResolvedValue(empty);
    open();
    expect(await screen.findByText(/Ambiente de ensaio\. Grupos, convites e valores são fictícios/)).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Grupo familiar' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Acompanhante de confiança' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Adolescente com responsável' })).toBeVisible();
    expect(screen.getByText(/crie antes um grupo familiar nesta página/)).toBeVisible();
    expect(await screen.findByText('Nenhum convite de viagem enviado.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Voltar às corridas' })).toHaveAttribute('href', '/corridas');
    expect(screen.getByRole('button', { name: /Modo simplificado/ })).toBeVisible();
    expectAccessibleScreen();
  });

  it('com o módulo desligado, não oferece formulários', async () => {
    vi.mocked(getRideDashboard).mockResolvedValue({ ...dashboard, enabled: false });
    vi.mocked(parties.overview).mockResolvedValue(empty);
    open();
    expect(await screen.findByText(/estão indisponíveis neste ambiente/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Criar grupo familiar' })).toBeNull();
    expect(screen.queryByText(/Ambiente de ensaio/)).toBeNull();
  });
});

describe('quem viaja e quem paga', () => {
  function Harness({ seen }: { seen: (value: Funding) => void }) {
    const [value, setValue] = useState<Funding>(SELF_FUNDING);
    return (
      <MemoryRouter>
        <FundingChoice
          value={value}
          onChange={(next) => {
            seen(next);
            setValue(next);
          }}
        />
      </MemoryRouter>
    );
  }
  const overview: PartyOverview = {
    ...empty,
    mandates: [
      { id: 'mandato', kind: 'family', account_id: 'grupo', payer_label: 'Família Teste', ceiling_cents: null, limit_cents: 5000, valid_until: null },
      { id: 'usado', kind: 'sponsor', account_id: null, payer_label: 'Outra pessoa', ceiling_cents: 3000, limit_cents: null, valid_until: null },
    ],
    programs: [
      {
        program_id: 'programa',
        account_id: 'empresa',
        account_name: 'Empresa Teste',
        label: 'Visitas',
        requires_approval: true,
        cost_centers: [
          { id: 'cc1', code: 'ADM', label: 'Administrativo' },
          { id: 'cc2', code: 'OBR', label: 'Obras' },
        ],
        grants: [{ id: 'aut', cost_center_id: 'cc2', purpose: 'Visita técnica', valid_until: '2090-12-31T00:00:00Z' }],
      },
    ],
  };

  it('não aparece para quem só pode viajar e pagar por si', async () => {
    vi.mocked(parties.overview).mockResolvedValue(empty);
    const seen = vi.fn();
    const view = render(<Harness seen={seen} />);
    await waitFor(() => expect(parties.overview).toHaveBeenCalled());
    await waitFor(() => expect(view.container).toBeEmptyDOMElement());
  });

  it('emite o mandato do grupo e a viagem a trabalho com centro de custo e autorização', async () => {
    vi.mocked(parties.overview).mockResolvedValue(overview);
    const seen = vi.fn();
    render(<Harness seen={seen} />);
    const group = await screen.findByRole('group', { name: 'Quem viaja e quem paga' });
    expect(within(group).getByLabelText('Eu viajo e eu pago')).toBeChecked();
    expect(screen.queryByText(/Outra pessoa/)).toBeNull();
    fireEvent.click(screen.getByLabelText(/o grupo familiar Família Teste paga · seu limite mensal é R\$\s50,00/));
    expect(seen).toHaveBeenLastCalledWith({ kind: 'mandate', mandate: 'mandato' });
    expect(screen.getByText(/Quem paga vê o preço, o recibo e a previsão de embarque/)).toBeVisible();
    fireEvent.click(screen.getByLabelText('Eu viajo a trabalho · Empresa Teste · Visitas'));
    expect(seen).toHaveBeenLastCalledWith({ kind: 'funded', program: 'programa', costCenter: '', grant: null });
    expect(fundingProblem(seen.mock.lastCall![0])).toMatch(/centro de custo/);
    fireEvent.change(screen.getByLabelText('Autorização aprovada'), { target: { value: 'aut' } });
    expect(seen).toHaveBeenLastCalledWith({ kind: 'funded', program: 'programa', costCenter: 'cc2', grant: 'aut' });
    expect(fundingProblem(seen.mock.lastCall![0])).toBeNull();
    expect(screen.getByLabelText('Centro de custo')).toHaveValue('cc2');
    expectAccessibleScreen();
  });

  it('lê as contas do servidor e deriva o mandato familiar e os programas da empresa', async () => {
    const actual = await vi.importActual<typeof import('../../services/rideParties')>('../../services/rideParties');
    rpc.mockResolvedValue({
      error: null,
      data: [
        family,
        asMember,
        {
          ...asMember,
          id: 'empresa',
          kind: 'organization',
          name: 'Empresa Teste',
          mandate_id: null,
          verified: true,
          cost_centers: [
            { id: 'cc1', code: 'ADM', label: 'Administrativo', active: true },
            { id: 'cc0', code: 'OLD', label: 'Encerrado', active: false },
          ],
          programs: [
            { id: 'programa', label: 'Visitas', enabled: true, requires_approval: true },
            { id: 'parado', label: 'Parado', enabled: false, requires_approval: false },
          ],
          grants: [
            { id: 'aut', program_id: 'programa', cost_center_id: 'cc1', purpose: 'Visita', status: 'approved', valid_until: '2090-12-31T00:00:00Z', mine: true },
            { id: 'de-outro', program_id: 'programa', cost_center_id: 'cc1', purpose: 'Outra', status: 'approved', valid_until: '2090-12-31T00:00:00Z', mine: false },
          ],
        },
      ],
    });
    const overview = await actual.parties.overview();
    expect(rpc).toHaveBeenCalledWith('ride_my_accounts');
    expect(overview.accounts.map((a) => a.id)).toEqual(['grupo', 'grupo', 'empresa']);
    expect(overview.mandates).toEqual([
      { id: 'mandato', kind: 'family', account_id: 'grupo', payer_label: 'Família Teste', ceiling_cents: null, limit_cents: 4000, valid_until: null },
    ]);
    expect(overview.programs).toEqual([
      {
        program_id: 'programa',
        account_id: 'empresa',
        account_name: 'Empresa Teste',
        label: 'Visitas',
        requires_approval: true,
        cost_centers: [{ id: 'cc1', code: 'ADM', label: 'Administrativo', active: true }],
        grants: [expect.objectContaining({ id: 'aut' })],
      },
    ]);
    expect(overview.companions).toEqual([]);
    expect(overview.dependents).toEqual([]);
  });

  it('roteia a cotação para a chamada do servidor que corresponde à escolha', async () => {
    const legs: RideLegInput[] = [{ origin: 'Saúde', destination: 'Jabaquara', payer: 'passenger' }];
    const quoted = { id: 'cotacao', expires_at: '2090-12-01T14:00:00Z', total_cents: 3000, legs: [] };
    rpc.mockResolvedValue({ data: quoted, error: null });
    vi.mocked(quoteRide).mockResolvedValue(quoted);
    const base = { p_key: 'chave', p_scheduled_at: null, p_legs: legs };
    expect(await quoteRideFor({ kind: 'mandate', mandate: 'mandato' }, 'chave', null, legs)).toEqual(quoted);
    expect(rpc).toHaveBeenLastCalledWith('ride_quote_sponsored', { ...base, p_mandate: 'mandato' });
    await quoteRideFor({ kind: 'funded', program: 'programa', costCenter: 'cc1', grant: null }, 'chave', null, legs);
    expect(rpc).toHaveBeenLastCalledWith('ride_quote_funded', { ...base, p_program: 'programa', p_cost_center: 'cc1', p_grant: null });
    await quoteRideFor({ kind: 'dependent', dependent: 'dep', consent: true }, 'chave', '2090-12-01T15:00:00Z', legs);
    expect(rpc).toHaveBeenLastCalledWith('ride_quote_for_dependent', {
      ...base,
      p_scheduled_at: '2090-12-01T15:00:00Z',
      p_dependent: 'dep',
      p_consent: true,
    });
    expect(rpc).toHaveBeenCalledTimes(3);
    await quoteRideFor(SELF_FUNDING, 'chave', null, legs);
    expect(quoteRide).toHaveBeenCalledWith('chave', null, null, legs);
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});
