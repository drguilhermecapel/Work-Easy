import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Approvals from '../../components/mobility/business/Approvals';
import GuestDesk from '../../components/mobility/business/GuestDesk';
import GuestInvite from '../../components/mobility/business/GuestInvite';
import Invoices from '../../components/mobility/business/Invoices';
import Members from '../../components/mobility/business/Members';
import Programs from '../../components/mobility/business/Programs';
import UseVoucher from '../../components/mobility/business/UseVoucher';
import { downloadJson } from '../../lib/download';
import { lastBookableDayInSaoPaulo, saoPauloDateTime } from '../../lib/timezone';
import Empresa from '../../pages/mobilidade/Empresa';
import {
  answerGuestInvite,
  business,
  guestInvite,
  redeemVoucher,
  voucherHold,
  type GuestInviteView,
  type OrgAccount,
  type OrgReport,
  type OrgRole,
  type VoucherProgram,
} from '../../services/rideBusiness';
import { getRideDashboard, type RideDashboard } from '../../services/rides';
import { expectAccessibleScreen } from '../a11y/contract';

const session = vi.hoisted(() => ({ mode: 'backend' }));
vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: session.mode, authUser: { id: 'pessoa' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../lib/download', () => ({ downloadJson: vi.fn() }));
vi.mock('../../services/rides', () => ({ getRideDashboard: vi.fn() }));
vi.mock('../../services/rideBusiness', () => ({
  business: {
    accounts: vi.fn(),
    create: vi.fn(),
    inviteMember: vi.fn(),
    setRole: vi.fn(),
    removeMember: vi.fn(),
    revokeInvite: vi.fn(),
    saveCostCenter: vi.fn(),
    requestGrant: vi.fn(),
    decideGrant: vi.fn(),
    inviteGuest: vi.fn(),
    revokeGuestInvite: vi.fn(),
    report: vi.fn(),
    invoice: vi.fn(),
    exportInvoice: vi.fn(),
    dispute: vi.fn(),
  },
  redeemVoucher: vi.fn(),
  voucherHold: vi.fn(),
  guestInvite: vi.fn(),
  answerGuestInvite: vi.fn(),
}));

const TOKEN = 'ab'.repeat(32);
const refresh = vi.fn();
const dashboard = {
  enabled: true,
  simulation: true,
  quote_enabled: true,
  dispatch_enabled: true,
  areas: ['Saúde', 'Jabaquara'],
  driver: null,
  rides: [],
  quotes: [],
  offers: [],
  reviews: [],
} satisfies RideDashboard;
const program: VoucherProgram = {
  id: 'prog',
  label: 'Visitas a clientes',
  enabled: true,
  budget_cents: 100000,
  committed_cents: 25000,
  ride_value_cents: 4000,
  member_limit_cents: 20000,
  areas: ['Saúde'],
  classes: [],
  group_tag: null,
  valid_from: '2026-11-01T03:00:00Z',
  valid_until: '2090-12-31T03:00:00Z',
  excess_payer: 'rider',
  requires_approval: true,
};
function org(role: OrgRole, extra: Partial<OrgAccount> = {}): OrgAccount {
  return {
    id: 'org',
    kind: 'organization',
    name: 'Ateliê Fictício Ltda.',
    role,
    owner: role === 'admin',
    verified: true,
    verified_until: '2027-06-30T15:00:00Z',
    members: [
      { member_id: 'pessoa', name: 'Ana', role, status: 'active', group_tag: null },
      { member_id: 'm2', name: 'Bruno', role: 'member', status: 'active', group_tag: null },
    ],
    invites: [{ id: 'c0', role: 'operator', expires_at: '2090-01-01T15:00:00Z', status: 'pending' }],
    cost_centers: [{ id: 'cc1', code: 'CC-1', label: 'Comercial', active: true }],
    programs: [program],
    grants: [],
    ...extra,
  };
}
/** A month with no movement, as the database answers it. */
const noReport: OrgReport = {
  account_id: 'org',
  month: '2026-11-01',
  rows: [],
  by_cost_center: [],
  voucher_cents: 0,
  refunded_cents: 0,
  reserved_cents: 0,
  invoice: null,
};
const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.resetAllMocks();
  session.mode = 'backend';
  vi.mocked(getRideDashboard).mockResolvedValue(dashboard);
});

describe('Empresa · página', () => {
  it('sem conta conectada mostra o ensaio local com uma nota e não consulta empresas', () => {
    session.mode = 'demo';
    inRouter(<Empresa />);
    expect(screen.getByText(/Contas de empresa precisam de uma conta WorkEasy conectada/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Ensaio de corrida' })).toBeVisible();
    expect(business.accounts).not.toHaveBeenCalled();
  });

  it('sem empresa, diz o que fazer e cria a conta reutilizando a chave na nova tentativa', async () => {
    vi.mocked(business.accounts).mockResolvedValue([]);
    vi.mocked(business.create).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce('org');
    inRouter(<Empresa />);
    expect(await screen.findByText(/Você ainda não participa de nenhuma empresa/)).toBeVisible();
    type('Nome da empresa', '  Ateliê Fictício Ltda. ');
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta de empresa' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta de empresa' }));
    expect(await screen.findByText(/Empresa criada. A operação WorkEasy vai conferir/)).toBeVisible();
    const calls = vi.mocked(business.create).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('Ateliê Fictício Ltda.');
    expect(calls[0][1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('empresa em análise explica o próximo passo e não oferece painéis', async () => {
    vi.mocked(business.accounts).mockResolvedValue([org('admin', { verified: false, verified_until: null })]);
    inRouter(<Empresa />);
    expect(await screen.findByText(/Em análise pela operação WorkEasy/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Ateliê Fictício Ltda.' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Programas de voucher' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Pessoas e papéis' })).toBeNull();
  });

  it('empresa com a conferência vencida para de operar, mas quem gere continua lendo relatório e faturas', async () => {
    vi.mocked(business.accounts).mockResolvedValue([org('manager', { verified: false, verified_until: '2026-10-31T15:00:00Z' })]);
    vi.mocked(business.report).mockResolvedValue(noReport);
    inRouter(<Empresa />);
    expect(await screen.findByText(/A conferência desta empresa deixou de valer em 31\/10\/2026/)).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Relatório mensal' }, { timeout: 5000 })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Programas de voucher' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Convidar pessoa' })).toBeNull();
  });

  it.each<[OrgRole, string[], string[]]>([
    ['member', [], ['Pedidos aguardando decisão', 'Central de viagens para convidados', 'Pessoas e papéis', 'Relatório mensal']],
    ['operator', ['Central de viagens para convidados'], ['Pedidos aguardando decisão', 'Pessoas e papéis', 'Relatório mensal']],
    ['approver', ['Pedidos aguardando decisão'], ['Central de viagens para convidados', 'Pessoas e papéis', 'Relatório mensal']],
    ['manager', ['Relatório mensal', 'Pessoas e papéis', 'Convidar pessoa'], ['Pedidos aguardando decisão', 'Central de viagens para convidados', 'Centros de custo']],
    ['admin', ['Pessoas e papéis', 'Centros de custo', 'Central de viagens para convidados', 'Relatório mensal'], []],
  ])('papel %s vê só os painéis que pode usar, com o aviso de ensaio', async (role, shown, hidden) => {
    vi.mocked(business.accounts).mockResolvedValue([org(role)]);
    vi.mocked(business.report).mockResolvedValue(noReport);
    inRouter(<Empresa />);
    expect(await screen.findByRole('heading', { name: 'Programas de voucher' }, { timeout: 5000 })).toBeVisible();
    expect(screen.getByText(/Ambiente de ensaio. Empresas, vouchers e faturas usam dados fictícios/)).toBeVisible();
    expect(screen.getByText(/Empresa conferida pela operação · conferência válida até 30\/06\/2027/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Pedir autorização de viagem' })).toBeVisible();
    for (const name of shown) expect(screen.getByRole('heading', { name })).toBeVisible();
    for (const name of hidden) expect(screen.queryByRole('heading', { name })).toBeNull();
  });

  it('quem não administra pode sair da empresa, com confirmação e chave reutilizada', async () => {
    vi.mocked(business.accounts).mockResolvedValue([org('member')]);
    vi.mocked(business.removeMember).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(true);
    inRouter(<Empresa />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sair desta empresa' }));
    expect(screen.getByText(/Sair de Ateliê Fictício Ltda\.\?/)).toBeVisible();
    expect(business.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar saída' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar saída' }));
    expect(await screen.findByText('Você saiu de Ateliê Fictício Ltda..')).toBeVisible();
    const calls = vi.mocked(business.removeMember).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 2)).toEqual(['org', 'pessoa']);
    expect(calls[1][2]).toBe(calls[0][2]);
  });

  it('quem abriu a empresa não recebe a opção de sair', async () => {
    vi.mocked(business.accounts).mockResolvedValue([org('admin')]);
    vi.mocked(business.report).mockResolvedValue(noReport);
    inRouter(<Empresa />);
    expect(await screen.findByRole('heading', { name: 'Ateliê Fictício Ltda.' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Sair desta empresa' })).toBeNull();
  });

  it('com o módulo desligado não consulta contas e avisa a indisponibilidade', async () => {
    vi.mocked(getRideDashboard).mockResolvedValue({ ...dashboard, enabled: false });
    inRouter(<Empresa />);
    expect(await screen.findByText('Contas de empresa estão indisponíveis neste ambiente.')).toBeVisible();
    expect(business.accounts).not.toHaveBeenCalled();
    expect(screen.queryByText(/Ambiente de ensaio/)).toBeNull();
  });
});

describe('Empresa · pessoas, papéis e centros de custo', () => {
  it('convida com papel e validade e mostra o link de adesão', async () => {
    vi.mocked(business.inviteMember).mockResolvedValue({ id: 'c1', token: TOKEN, expires_at: '2026-11-28T15:00:00Z' });
    inRouter(<Members account={org('admin')} userId="pessoa" refresh={refresh} />);
    type('E-mail da pessoa', 'carla@example.test');
    expect(within(screen.getByLabelText('Papel na empresa')).queryByRole('option', { name: 'Administrador' })).toBeNull();
    type('Papel na empresa', 'approver');
    type('Validade do convite', '4320');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite' }));
    const link = (await screen.findByLabelText('Link para copiar')) as HTMLInputElement;
    expect(link.value).toMatch(new RegExp('/corridas/convite#adesao=' + TOKEN + '$'));
    expect(business.inviteMember).toHaveBeenCalledWith('org', 'carla@example.test', 'approver', 4320, expect.any(String));
    expect(refresh).toHaveBeenCalled();
  });

  it('avisa quando o servidor responde a um convite repetido sem o link', async () => {
    vi.mocked(business.inviteMember).mockResolvedValue({ id: 'c1', token: null, expires_at: '2026-11-28T15:00:00Z' });
    inRouter(<Members account={org('admin')} userId="pessoa" refresh={refresh} />);
    type('E-mail da pessoa', 'carla@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite' }));
    expect(await screen.findByText(/o link aparece uma única vez/)).toBeVisible();
    expect(screen.queryByLabelText('Link para copiar')).toBeNull();
  });

  it('revoga um convite pendente só depois da confirmação', async () => {
    vi.mocked(business.revokeInvite).mockResolvedValue(true);
    inRouter(<Members account={org('admin')} userId="pessoa" refresh={refresh} />);
    expect(screen.getByText(/Operador da central · válido até/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Revogar convite' }));
    expect(screen.getByText(/Revogar este convite\?/)).toBeVisible();
    expect(business.revokeInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revogação' }));
    expect(await screen.findByText('Convite revogado. O link deixou de funcionar.')).toBeVisible();
    expect(business.revokeInvite).toHaveBeenCalledWith('c0');
  });

  it('gestor vê as pessoas sem editar e só convida colaboradores', () => {
    inRouter(<Members account={org('manager')} userId="pessoa" refresh={refresh} />);
    expect(screen.getByText('Ana · você')).toBeVisible();
    expect(screen.getByText('Bruno')).toBeVisible();
    expect(screen.queryByLabelText('Papel de Bruno')).toBeNull();
    expect(screen.queryByRole('button', { name: /Remover Bruno/ })).toBeNull();
    expect(within(screen.getByLabelText('Papel na empresa')).getAllByRole('option')).toHaveLength(1);
    expect(screen.queryByRole('heading', { name: 'Centros de custo' })).toBeNull();
  });

  it('remover pessoa pede confirmação e a nova tentativa reutiliza a chave', async () => {
    vi.mocked(business.removeMember).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(true);
    inRouter(<Members account={org('admin')} userId="pessoa" refresh={refresh} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remover Bruno da empresa' }));
    expect(screen.getByText(/Remover Bruno desta empresa\?/)).toBeVisible();
    expect(business.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByText('Bruno não faz mais parte desta empresa.')).toBeVisible();
    const calls = vi.mocked(business.removeMember).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 2)).toEqual(['org', 'm2']);
    expect(calls[1][2]).toBe(calls[0][2]);
  });

  it('salva papel e grupo de outra pessoa, nunca o próprio, e desativa um centro de custo', async () => {
    inRouter(<Members account={org('admin')} userId="pessoa" refresh={refresh} />);
    expect(screen.queryByLabelText('Papel de Ana')).toBeNull();
    expect(screen.getByRole('button', { name: 'Salvar papel de Bruno' })).toBeDisabled();
    type('Papel de Bruno', 'manager');
    type('Grupo de Bruno', ' vendas ');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar papel de Bruno' }));
    await waitFor(() => expect(business.setRole).toHaveBeenCalledWith('org', 'm2', 'manager', 'vendas'));
    expect(await screen.findByText('Papel de Bruno atualizado: Gestor.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Desativar CC-1' }));
    await waitFor(() => expect(business.saveCostCenter).toHaveBeenCalledWith('org', 'CC-1', 'Comercial', false));
    type('Código', 'CC-2');
    type('Nome do centro de custo', 'Eventos');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar centro de custo' }));
    await waitFor(() => expect(business.saveCostCenter).toHaveBeenLastCalledWith('org', 'CC-2', 'Eventos', true));
  });
});

describe('Empresa · programas de voucher', () => {
  it('mostra orçamento, comprometido e disponível em reais, sem ações de edição', () => {
    render(<Programs programs={[program]} now={Date.parse('2026-11-28T12:00:00Z')} />);
    expect(screen.getByRole('heading', { name: 'Visitas a clientes · Ativo' })).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Orçamento comprometido de Visitas a clientes' })).toHaveAttribute('value', '25000');
    expect(screen.getByText('Orçamento').nextElementSibling).toHaveTextContent(/1\.000,00/);
    expect(screen.getByText('Comprometido').nextElementSibling).toHaveTextContent(/250,00/);
    expect(screen.getByText('Disponível').nextElementSibling).toHaveTextContent(/750,00/);
    expect(screen.getByText(/Valor por corrida: até/)).toHaveTextContent(/40,00/);
    expect(screen.getByText(/a diferença é paga por quem viaja, só depois do aceite/)).toBeVisible();
    expect(screen.getByText(/cadastrados pelo financeiro WorkEasy/)).toBeVisible();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('sem programa, diz o que acontece com as corridas e não mostra orçamento a quem não o recebe', () => {
    const { rerender } = render(<Programs programs={[]} now={0} />);
    expect(screen.getByText(/ainda não tem programa de voucher/)).toBeVisible();
    rerender(<Programs programs={[{ ...program, budget_cents: null, committed_cents: null }]} now={0} />);
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText('Orçamento')).toBeNull();
  });
});

describe('Empresa · central de viagens', () => {
  function fill(destination: string) {
    type('E-mail do convidado', 'convidado@example.test');
    type('Programa que paga a viagem', 'prog');
    type('Centro de custo da viagem', 'cc1');
    type('Ponto de origem', 'Saúde');
    type('Ponto de destino', destination);
  }

  it('operador agenda para um convidado e recebe o link da viagem; a nova tentativa reutiliza a chave', async () => {
    vi.mocked(business.inviteGuest)
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce({ id: 'g1', token: TOKEN, expires_at: '2026-11-28T15:00:00Z' });
    inRouter(<GuestDesk account={org('operator')} areas={dashboard.areas} refresh={refresh} />);
    fill('Jabaquara');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite de viagem' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite de viagem' }));
    const link = (await screen.findByLabelText('Link para copiar')) as HTMLInputElement;
    expect(link.value).toMatch(new RegExp('/corridas/convite#viagem=' + TOKEN + '$'));
    const calls = vi.mocked(business.inviteGuest).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      'org',
      'prog',
      'cc1',
      'convidado@example.test',
      [{ origin: 'Saúde', destination: 'Jabaquara', payer: 'passenger' }],
      null,
      60,
      expect.any(String),
    ]);
    expect(calls[1][7]).toBe(calls[0][7]);
    // The desk can take back the invite it has just issued, after confirming
    vi.mocked(business.revokeGuestInvite).mockResolvedValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Revogar este convite' }));
    expect(business.revokeGuestInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revogação' }));
    await waitFor(() => expect(business.revokeGuestInvite).toHaveBeenCalledWith('g1'));
    expect(await screen.findByText(/Convite revogado/)).toBeVisible();
    expect(screen.queryByLabelText('Link para copiar')).toBeNull();
  });

  it('só oferece ao convidado programas abertos a todos, porque um convidado não tem grupo', () => {
    const programs = [program, { ...program, id: 'restrito', label: 'Só diretoria', group_tag: 'diretoria' }];
    inRouter(<GuestDesk account={org('operator', { programs })} areas={dashboard.areas} refresh={refresh} />);
    const choice = screen.getByLabelText('Programa que paga a viagem');
    expect(within(choice).getByRole('option', { name: 'Visitas a clientes' })).toBeInTheDocument();
    expect(within(choice).queryByRole('option', { name: 'Só diretoria' })).toBeNull();
    expect(screen.getByText(/O convidado nunca paga diferença/)).toBeVisible();
  });

  it('recusa no formulário origem igual ao destino e data fora dos próximos 30 dias', async () => {
    inRouter(<GuestDesk account={org('operator')} areas={dashboard.areas} refresh={refresh} />);
    fill('Saúde');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite de viagem' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha pontos diferentes');
    type('Ponto de destino', 'Jabaquara');
    type('Saída', 'scheduled');
    type('Data e hora da saída (São Paulo)', '2090-03-10T09:00');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite de viagem' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('próximos 30 dias');
    expect(business.inviteGuest).not.toHaveBeenCalled();
  });

  it('sem centro de custo ativo, diz a quem pedir em vez de mostrar o formulário', () => {
    inRouter(<GuestDesk account={org('operator', { cost_centers: [] })} areas={dashboard.areas} refresh={refresh} />);
    expect(screen.getByText(/Falta um centro de custo ativo/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Gerar convite de viagem' })).toBeNull();
  });
});

describe('Empresa · autorizações de viagem', () => {
  const grants: OrgAccount['grants'] = [
    {
      id: 'g1',
      program_id: 'prog',
      cost_center_id: 'cc1',
      beneficiary: 'Ana',
      purpose: 'Feira do setor',
      status: 'requested',
      valid_from: '2026-12-01T12:00:00Z',
      valid_until: '2026-12-02T12:00:00Z',
      guest: false,
      mine: true,
    },
    {
      id: 'g2',
      program_id: 'prog',
      cost_center_id: 'cc1',
      beneficiary: 'Bruno',
      purpose: 'Visita a cliente',
      status: 'requested',
      valid_from: '2026-12-01T12:00:00Z',
      valid_until: '2026-12-02T12:00:00Z',
      guest: false,
      mine: false,
    },
  ];

  it('aprovador decide o pedido de outra pessoa e não recebe ação para o próprio pedido', async () => {
    vi.mocked(business.decideGrant).mockResolvedValue('approved');
    render(<Approvals account={org('approver', { grants })} canDecide refresh={refresh} />);
    const queue = within(screen.getByRole('region', { name: 'Pedidos aguardando decisão' }));
    expect(queue.getByText(/Este pedido é seu/)).toBeVisible();
    expect(queue.queryByRole('button', { name: /pedido de Ana/ })).toBeNull();
    fireEvent.click(queue.getByRole('button', { name: 'Aprovar pedido de Bruno' }));
    await waitFor(() => expect(business.decideGrant).toHaveBeenCalledWith('g2', true));
    expect(await queue.findByText(/Pedido de Bruno aprovado/)).toBeVisible();
    // A request whose period ended answers 'expired' whatever was asked: the screen says so
    vi.mocked(business.decideGrant).mockResolvedValue('expired');
    fireEvent.click(queue.getByRole('button', { name: 'Recusar pedido de Bruno' }));
    await waitFor(() => expect(business.decideGrant).toHaveBeenLastCalledWith('g2', false));
    expect(await queue.findByText(/terminou antes da decisão\. Nada foi autorizado/)).toBeVisible();
  });

  it('colaborador pede autorização com período no horário de São Paulo e acompanha os próprios pedidos', async () => {
    vi.mocked(business.requestGrant).mockResolvedValue('g3');
    render(<Approvals account={org('member', { grants })} canDecide={false} refresh={refresh} />);
    expect(screen.queryByRole('heading', { name: 'Pedidos aguardando decisão' })).toBeNull();
    expect(screen.getByText(/Aguardando decisão · Feira do setor/)).toBeVisible();
    expect(screen.queryByText(/Visita a cliente/)).toBeNull();
    type('Programa', 'prog');
    type('Centro de custo', 'cc1');
    type('Motivo da viagem', 'Reunião com fornecedor');
    // A day inside the window the database accepts (it ends within 90 days and lasts up to 31)
    const day = lastBookableDayInSaoPaulo(new Date(), 3);
    type('Válida a partir de (São Paulo)', day + 'T09:00');
    type('Válida até (São Paulo)', day + 'T08:00');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('fim depois do início');
    type('Válida até (São Paulo)', lastBookableDayInSaoPaulo(new Date(), 60) + 'T18:00');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('até 31 dias');
    type('Válida a partir de (São Paulo)', '2090-03-10T09:00');
    type('Válida até (São Paulo)', '2090-03-10T18:00');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('próximos 90 dias');
    expect(business.requestGrant).not.toHaveBeenCalled();
    type('Válida a partir de (São Paulo)', day + 'T09:00');
    type('Válida até (São Paulo)', day + 'T18:00');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
    await waitFor(() =>
      expect(business.requestGrant).toHaveBeenCalledWith(
        'org',
        'prog',
        'cc1',
        'Reunião com fornecedor',
        saoPauloDateTime(day, '09:00')!.toISOString(),
        saoPauloDateTime(day, '18:00')!.toISOString(),
        expect.any(String),
      ),
    );
    expect(await screen.findByText(/Pedido enviado/)).toBeVisible();
  });

  it('sem programa que exija autorização, orienta a usar o perfil profissional', () => {
    const open = org('member', { programs: [{ ...program, requires_approval: false }] });
    render(<Approvals account={open} canDecide={false} refresh={refresh} />);
    expect(screen.getByText(/Nenhum programa desta empresa exige autorização prévia/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviar pedido' })).toBeNull();
  });
});

describe('Empresa · relatório e fatura', () => {
  // As the database answers: cents by the month the money moved, totals and the cost centers already summed
  const report: OrgReport = {
    account_id: 'org',
    month: '2026-11-01',
    rows: [
      { date: '2026-11-03', cost_center: 'CC-1', cost_center_label: 'Comercial', member: 'Ana', ride_class: 'Conforto', voucher_cents: 3000, refunded_cents: 500, reserved_cents: 0 },
      { date: '2026-11-09', cost_center: 'CC-2', cost_center_label: 'Eventos', member: 'Bruno', ride_class: null, voucher_cents: 2000, refunded_cents: 0, reserved_cents: 0 },
      { date: '2026-11-21', cost_center: 'CC-2', cost_center_label: 'Eventos', member: 'Bruno', ride_class: null, voucher_cents: 0, refunded_cents: 0, reserved_cents: 4000 },
    ],
    by_cost_center: [
      { cost_center: 'CC-1', cost_center_label: 'Comercial', voucher_cents: 3000, refunded_cents: 500, net_cents: 2500 },
      { cost_center: 'CC-2', cost_center_label: 'Eventos', voucher_cents: 2000, refunded_cents: 0, net_cents: 2000 },
    ],
    voucher_cents: 5000,
    refunded_cents: 500,
    reserved_cents: 4000,
    invoice: { id: 'fat', status: 'closed', total_cents: 4500, closed_at: '2026-12-01T12:00:00Z' },
  };
  const line = { billable: true, date: '2026-11-03', cost_center: 'CC-1', cost_center_label: 'Comercial', member: 'Ana', dispute: null };

  it('mostra os totais do servidor, contesta só a linha de voucher com chave reutilizada e exporta a fatura', async () => {
    vi.mocked(business.report).mockResolvedValue(report);
    vi.mocked(business.invoice).mockResolvedValue({
      id: 'fat',
      account_id: 'org',
      month: '2026-11-01',
      status: 'closed',
      closed_at: '2026-12-01T12:00:00Z',
      total_cents: 4500,
      by_cost_center: [],
      lines: [
        { ...line, id: 'l1', kind: 'voucher', cents: 3000, occurred_at: '2026-11-03T15:00:00Z' },
        { ...line, id: 'l2', kind: 'refund', cents: -500, occurred_at: '2026-11-20T15:00:00Z' },
        { ...line, id: 'l3', kind: 'personal_topup', billable: false, cents: 700, occurred_at: '2026-11-03T15:00:00Z' },
        { ...line, id: 'l4', kind: 'voucher', cents: 2000, occurred_at: '2026-11-09T15:00:00Z', dispute: { id: 'd0', status: 'open', decision: null } },
        { ...line, id: 'l5', kind: 'adjustment', cents: -300, occurred_at: '2026-11-10T15:00:00Z' },
      ],
    });
    vi.mocked(business.dispute).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce('d1');
    const exported = { invoice: 'fat', lines: [] };
    vi.mocked(business.exportInvoice).mockResolvedValue(exported);
    render(<Invoices account={org('manager')} />);
    expect(await screen.findByText(/^Voucher R\$/)).toHaveTextContent(
      /Voucher R\$\s50,00 · Estornos R\$\s5,00 · Líquido R\$\s45,00 · Reservado e ainda não usado R\$\s40,00/,
    );
    expect(business.report).toHaveBeenCalledWith('org', expect.stringMatching(/^\d{4}-\d{2}-01$/));
    expect(screen.getByText(/CC-1 · Comercial: R\$\s25,00/)).toBeVisible();
    expect(screen.getByText(/CC-2 · Eventos: R\$\s20,00/)).toBeVisible();
    expect(screen.getAllByRole('row')).toHaveLength(4);
    expect(screen.getByRole('columnheader', { name: 'Reservado' })).toBeVisible();
    expect(screen.getByText(/O reservado é o voucher de uma viagem deste mês que\s+ainda não foi usado/)).toBeVisible();
    expect(screen.getByText(/Fechada em/)).toHaveTextContent(/Total R\$\s45,00/);

    fireEvent.click(screen.getByRole('button', { name: 'Ver composição da fatura' }));
    expect(await screen.findByText('Contestação em análise')).toBeVisible();
    expect(business.invoice).toHaveBeenCalledWith('fat');
    expect(screen.getByText(/informativo, fora do total/)).toBeVisible();
    // The database accepts a contestation only of a voucher line that has none yet: a refund, an adjustment
    // and the rider's own complement offer no such action.
    expect(screen.getAllByRole('button', { name: 'Contestar este item' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Contestar este item' }));
    type('Motivo da contestação de Voucher de viagem', 'Valor em duplicidade');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar contestação' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar contestação' }));
    expect(await screen.findByText(/Contestação registrada/)).toBeVisible();
    const calls = vi.mocked(business.dispute).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 2)).toEqual(['l1', 'Valor em duplicidade']);
    expect(calls[1][2]).toBe(calls[0][2]);

    fireEvent.click(screen.getByRole('button', { name: 'Exportar fatura' }));
    await waitFor(() => expect(downloadJson).toHaveBeenCalledWith(exported, expect.stringMatching(/^fatura-corridas-\d{4}-\d{2}\.json$/)));
    expect(business.exportInvoice).toHaveBeenCalledWith('fat');
  });

  it('o mês corrente explica que só fecha depois de terminar; um mês encerrado e aberto aguarda o financeiro', async () => {
    vi.mocked(business.report).mockResolvedValue(noReport);
    render(<Invoices account={org('manager')} />);
    expect(await screen.findByText(/A fatura de um mês só é fechada depois que ele termina/)).toBeVisible();
    expect(screen.getByText(/Nenhum valor pago ou reservado pela empresa em/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Exportar fatura' })).toBeNull();
    type('Competência', '2026-10');
    await waitFor(() => expect(business.report).toHaveBeenLastCalledWith('org', '2026-10-01'));
    expect(await screen.findByRole('heading', { name: 'Fatura de outubro de 2026' })).toBeVisible();
    expect(await screen.findByText(/ainda não foi fechada pelo financeiro WorkEasy/)).toBeVisible();
  });
});

describe('Empresa · voucher e convite do convidado', () => {
  it('usa o voucher no trecho concluído e mostra a diferença a cargo de quem viajou', async () => {
    vi.mocked(redeemVoucher).mockResolvedValue({ order_id: 'ord', applied_cents: 2500, remainder_cents: 700, method: 'card' });
    render(<UseVoucher legId="trecho" onChange={refresh} />);
    type('Forma de pagamento da diferença', 'card');
    fireEvent.click(screen.getByRole('button', { name: 'Usar voucher' }));
    expect(await screen.findByText(/Voucher aplicado/)).toHaveTextContent(/R\$\s25,00.*Diferença a seu cargo: R\$\s7,00, por cartão/);
    expect(redeemVoucher).toHaveBeenCalledWith('trecho', 'card');
    expect(refresh).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Usar voucher' })).toBeNull();
  });

  it('o voucher que já quitou o trecho ao fim da viagem aparece aplicado, sem diferença a pagar', async () => {
    vi.mocked(redeemVoucher).mockResolvedValue({ order_id: 'ord', applied_cents: 3200, remainder_cents: 0, method: 'pix' });
    render(<UseVoucher legId="quitado" onChange={refresh} />);
    expect(screen.getByText(/Quando ele cobre a tarifa inteira, já é aplicado ao fim do trecho/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Usar voucher' }));
    expect(await screen.findByText(/Voucher aplicado/)).toHaveTextContent(/R\$\s32,00.*Nada a pagar por você neste trecho/);
    expect(redeemVoucher).toHaveBeenCalledWith('quitado', 'pix');
  });

  it('o voucher que aguarda a operação avisa que nada será cobrado e não oferece o uso', async () => {
    vi.mocked(voucherHold).mockResolvedValue({ state: 'on_hold', reason: 'release_closed', cents: 2500 });
    render(<UseVoucher legId="retido" onChange={refresh} />);
    expect(await screen.findByText('O voucher da empresa está aguardando a operação. Nada será cobrado de você enquanto isso.')).toBeVisible();
    expect(voucherHold).toHaveBeenCalledWith('retido');
    expect(screen.queryByRole('button', { name: 'Usar voucher' })).toBeNull();
    expect(redeemVoucher).not.toHaveBeenCalled();
    expectAccessibleScreen();
  });

  it('o voucher devolvido ao programa avisa que a tarifa segue o caminho comum e não oferece o uso', async () => {
    vi.mocked(voucherHold).mockResolvedValue({ state: 'returned', reason: null, cents: 2500 });
    render(<UseVoucher legId="devolvido" onChange={refresh} />);
    expect(await screen.findByText(/O voucher voltou para o programa da empresa\. A tarifa deste trecho agora é paga pelo caminho comum/)).toBeVisible();
    expect(screen.queryByText(/O voucher paga a parte da empresa/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Usar voucher' })).toBeNull();
    expect(redeemVoucher).not.toHaveBeenCalled();
    expectAccessibleScreen();
  });

  it('com o voucher pronto para uso, mantém a escolha da forma da diferença', async () => {
    vi.mocked(voucherHold).mockResolvedValue({ state: 'ready', reason: null, cents: 2500 });
    render(<UseVoucher legId="pronto" onChange={refresh} />);
    await waitFor(() => expect(voucherHold).toHaveBeenCalledWith('pronto'));
    expect(screen.getByRole('button', { name: 'Usar voucher' })).toBeVisible();
    expect(screen.queryByText(/aguardando a operação/)).toBeNull();
  });

  const guest: GuestInviteView = {
    id: 'g1',
    status: 'pending',
    account_name: 'Ateliê Fictício Ltda.',
    legs: [{ seq: 1, origin: 'Saúde', destination: 'Jabaquara', pickup_at: null }],
    scheduled_at: null,
    expires_at: '2090-12-01T14:00:00Z',
    simulation: true,
  };

  it('convidado lê a empresa e o trajeto antes de responder e aceita com a mesma chave na nova tentativa', async () => {
    vi.mocked(guestInvite).mockResolvedValue(guest);
    vi.mocked(answerGuestInvite)
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce({ status: 'accepted', quote_id: 'cotacao', ride_id: 'viagem' });
    inRouter(<GuestInvite token={TOKEN} />);
    expect(await screen.findByText('Saúde → Jabaquara')).toBeVisible();
    expect(guestInvite).toHaveBeenCalledWith(TOKEN);
    expect(screen.getByText(/convidou você para uma viagem paga com voucher/)).toHaveTextContent('Ateliê Fictício Ltda.');
    expect(screen.getByText('Saída quando você aceitar')).toBeVisible();
    expect(screen.getByText(/Você não paga nada por esta viagem/)).toBeVisible();
    expect(screen.getByText(/Ambiente de ensaio/)).toBeVisible();
    expectAccessibleScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Recusar convite' }));
    expect(screen.getByText(/Recusar encerra este convite/)).toBeVisible();
    expect(answerGuestInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar viagem' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar viagem' }));
    expect(await screen.findByText(/Convite aceito/)).toBeVisible();
    const calls = vi.mocked(answerGuestInvite).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 2)).toEqual([TOKEN, true]);
    expect(calls[1][2]).toBe(calls[0][2]);
    expect(screen.getByRole('link', { name: 'Acompanhar em Corridas' })).toHaveAttribute('href', '/corridas');
  });

  it('sem convite para esta conta, ou com o convite encerrado, não oferece resposta', async () => {
    vi.mocked(guestInvite).mockResolvedValue(null);
    const first = inRouter(<GuestInvite token={TOKEN} />);
    expect(await screen.findByText(/Convite indisponível para esta conta/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aceitar viagem' })).toBeNull();
    first.unmount();
    vi.mocked(guestInvite).mockResolvedValue({ ...guest, status: 'revoked', legs: [] });
    inRouter(<GuestInvite token={TOKEN} />);
    expect(await screen.findByText('A empresa revogou este convite.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aceitar viagem' })).toBeNull();
    expect(answerGuestInvite).not.toHaveBeenCalled();
  });
});
