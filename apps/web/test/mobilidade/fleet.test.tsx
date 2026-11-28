import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FleetPanel from '../../components/mobility/fleet/FleetPanel';
import { AppError } from '../../lib/errors';
import { todayInSaoPaulo } from '../../lib/timezone';
import Frota from '../../pages/mobilidade/Frota';
import {
  fleets,
  type DriverCession,
  type FleetAccount,
  type FleetAssignment,
  type FleetOverview,
  type FleetRole,
  type FleetVehicle,
} from '../../services/rideFleets';
import { getRideDashboard, type RideDashboard } from '../../services/rides';
import { expectAccessibleScreen } from '../a11y/contract';

const session = vi.hoisted(() => ({ mode: 'backend' }));
vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: session.mode, authUser: { id: 'pessoa' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../services/rides', () => ({ getRideDashboard: vi.fn() }));
vi.mock('../../services/rideFleets', () => ({
  fleets: {
    accounts: vi.fn(),
    create: vi.fn(),
    inviteMember: vi.fn(),
    revokeInvite: vi.fn(),
    removeMember: vi.fn(),
    saveVehicle: vi.fn(),
    assign: vi.fn(),
    endAssignment: vi.fn(),
    overview: vi.fn(),
    myCessions: vi.fn(),
  },
}));

const TOKEN = 'cd'.repeat(32);
const refresh = vi.fn();
const onLeft = vi.fn();
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
function fleet(role: FleetRole, extra: Partial<FleetAccount> = {}): FleetAccount {
  return {
    id: 'frota',
    kind: 'fleet',
    name: 'Locadora Fictícia',
    role,
    owner: role === 'admin',
    verified: true,
    verified_until: '2027-06-30T15:00:00Z',
    members: [
      { member_id: 'pessoa', name: 'Ana', role, status: 'active' },
      { member_id: 'm2', name: 'Bruno', role: 'fleet_driver', status: 'active' },
    ],
    invites: [{ id: 'c0', role: 'fleet_driver', expires_at: '2090-01-01T15:00:00Z', status: 'pending' }],
    ...extra,
  };
}
// Validities years ahead of today, inside the ten years the database accepts, so no test depends on the day it runs.
const YEAR = Number(todayInSaoPaulo().slice(0, 4));
const DOC_UNTIL = `${YEAR + 5}-12-31`;
const INSURANCE_UNTIL = `${YEAR + 5}-06-30`;
const INSPECTION_UNTIL = `${YEAR + 5}-03-31`;
const RENEWED_UNTIL = `${YEAR + 6}-01-31`;
const vehicle: FleetVehicle = {
  id: 'v1',
  vehicle_identifier: 'ABC1D23',
  category: 'sedan',
  document_ref: 'DOC-1',
  insurance_ref: 'APOLICE-9',
  inspection_ref: 'VISTORIA-3',
  vehicle_until: DOC_UNTIL,
  insurance_until: INSURANCE_UNTIL,
  inspection_until: INSPECTION_UNTIL,
  status: 'active',
  expired: false,
};
const assignment: FleetAssignment = {
  id: 'cessao-1',
  vehicle_id: 'v1',
  driver_id: 'm2',
  driver_name: 'Bruno',
  cession_ref: 'CONTRATO-7',
  beneficiary: 'fleet',
  from: '2026-11-01T03:00:00Z',
  until: '2090-12-01T03:00:00Z',
  status: 'pending_review',
};
const overview = (extra: Partial<FleetOverview> = {}): FleetOverview => ({
  account_id: 'frota',
  month: todayInSaoPaulo().slice(0, 7) + '-01',
  vehicles: [vehicle],
  assignments: [],
  legs: [],
  ...extra,
});
const inRouter = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);
const panel = (account: FleetAccount) =>
  inRouter(<FleetPanel account={account} userId="pessoa" refresh={refresh} onLeft={onLeft} />);
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.resetAllMocks();
  session.mode = 'backend';
  vi.mocked(getRideDashboard).mockResolvedValue(dashboard);
  vi.mocked(fleets.overview).mockResolvedValue(overview());
});

describe('Frota · página', () => {
  it('sem conta conectada mostra o ensaio local com uma nota e não consulta frotas', () => {
    session.mode = 'demo';
    inRouter(<Frota />);
    expect(screen.getByText(/Contas de frota precisam de uma conta WorkEasy conectada/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Ensaio de corrida' })).toBeVisible();
    expect(fleets.accounts).not.toHaveBeenCalled();
  });

  it('sem frota, diz o que fazer e cria a conta reutilizando a chave na nova tentativa', async () => {
    vi.mocked(fleets.accounts).mockResolvedValue([]);
    vi.mocked(fleets.create).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce('frota');
    inRouter(<Frota />);
    expect(await screen.findByText(/Você ainda não participa de nenhuma frota/)).toBeVisible();
    type('Nome da frota', '  Locadora Fictícia ');
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta de frota' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta de frota' }));
    expect(await screen.findByText(/Frota criada. A operação WorkEasy vai conferir/)).toBeVisible();
    const calls = vi.mocked(fleets.create).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('Locadora Fictícia');
    expect(calls[0][1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('frota em análise explica que já está na fila da operação e não abre o painel', async () => {
    vi.mocked(fleets.accounts).mockResolvedValue([fleet('admin', { verified: false, verified_until: null })]);
    inRouter(<Frota />);
    expect(await screen.findByText(/Em análise pela operação WorkEasy/)).toHaveTextContent(/já está na fila de conferência/);
    expect(screen.getByRole('heading', { name: 'Locadora Fictícia' })).toBeVisible();
    // The operation lists the account by name: no code has to be copied and sent
    expect(screen.queryByText(/código da conta/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Veículos' })).toBeNull();
    expect(fleets.overview).not.toHaveBeenCalled();
  });

  it('frota com a conferência vencida avisa o bloqueio e mantém veículos e resumo à vista de quem gere', async () => {
    vi.mocked(fleets.accounts).mockResolvedValue([fleet('manager', { verified: false, verified_until: '2026-10-31T15:00:00Z' })]);
    inRouter(<Frota />);
    expect(await screen.findByText(/A conferência desta frota deixou de valer em 31\/10\/2026/)).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Veículos' }, { timeout: 5000 })).toBeVisible();
    expect(fleets.overview).toHaveBeenCalled();
  });

  it('motorista de uma frota ainda em análise chega à própria participação e pode sair', async () => {
    vi.mocked(fleets.accounts).mockResolvedValue([fleet('fleet_driver', { verified: false, verified_until: null, members: [], invites: [] })]);
    vi.mocked(fleets.myCessions).mockResolvedValue([]);
    inRouter(<Frota />);
    expect(await screen.findByRole('heading', { name: 'Você dirige por esta frota' }, { timeout: 5000 })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sair desta frota' })).toBeVisible();
    expect(fleets.overview).not.toHaveBeenCalled();
  });

  it('frota conferida abre veículos, pessoas e resumo, com o aviso de ensaio', async () => {
    vi.mocked(fleets.accounts).mockResolvedValue([fleet('admin')]);
    inRouter(<Frota />);
    expect(await screen.findByRole('heading', { name: 'Veículos' }, { timeout: 5000 })).toBeVisible();
    expect(screen.getByText(/Ambiente de ensaio. Frotas, veículos e valores usam dados fictícios/)).toBeVisible();
    expect(screen.getByText(/Frota conferida pela operação · conferência válida até 30\/06\/2027/)).toBeVisible();
    expect(screen.getByText('Seu papel: Responsável pela frota.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Motoristas e gestores' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Resumo do mês' })).toBeVisible();
    expect(fleets.overview).toHaveBeenCalledWith('frota', expect.stringMatching(/^\d{4}-\d{2}-01$/));
  });

  it('com o módulo desligado não consulta contas e avisa a indisponibilidade', async () => {
    vi.mocked(getRideDashboard).mockResolvedValue({ ...dashboard, enabled: false });
    inRouter(<Frota />);
    expect(await screen.findByText('Contas de frota estão indisponíveis neste ambiente.')).toBeVisible();
    expect(fleets.accounts).not.toHaveBeenCalled();
    expect(screen.queryByText(/Ambiente de ensaio/)).toBeNull();
  });
});

describe('Frota · veículos e documentos', () => {
  it('sem veículo, explica o primeiro passo e salva o cadastro com as três validades', async () => {
    vi.mocked(fleets.overview).mockResolvedValue(overview({ vehicles: [] }));
    vi.mocked(fleets.saveVehicle).mockResolvedValue('v1');
    panel(fleet('admin'));
    expect(await screen.findByText(/Nenhum veículo cadastrado/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Salvar veículo' })).toBeDisabled();
    type('Placa ou identificador do veículo', ' ABC1D23 ');
    type('Categoria', 'van');
    type('Referência do documento do veículo', 'DOC-1');
    type('Documento válido até', DOC_UNTIL);
    type('Referência da apólice de seguro', 'APOLICE-9');
    type('Seguro válido até', INSURANCE_UNTIL);
    type('Referência da revisão ou vistoria', 'VISTORIA-3');
    type('Revisão válida até', INSPECTION_UNTIL);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar veículo' }));
    expect(await screen.findByText(/Veículo salvo. Agora você pode cedê-lo/)).toBeVisible();
    expect(fleets.saveVehicle).toHaveBeenCalledWith('frota', {
      identifier: 'ABC1D23',
      category: 'van',
      document: 'DOC-1',
      insurance: 'APOLICE-9',
      inspection: 'VISTORIA-3',
      vehicleUntil: DOC_UNTIL,
      insuranceUntil: INSURANCE_UNTIL,
      inspectionUntil: INSPECTION_UNTIL,
    });
    expect(refresh).toHaveBeenCalled();
  });

  it('documento vencido avisa o bloqueio de ofertas e leva à renovação, sem oferecer cessão', async () => {
    vi.mocked(fleets.overview).mockResolvedValue(overview({ vehicles: [{ ...vehicle, insurance_until: '2020-01-31' }] }));
    vi.mocked(fleets.saveVehicle).mockResolvedValue('v1');
    panel(fleet('manager'));
    expect(await screen.findByRole('heading', { name: 'ABC1D23 · Sedã' })).toBeVisible();
    expect(screen.getByText(/Seguro · APOLICE-9 · válido até 31\/01\/2020/)).toHaveTextContent('Vencido');
    expect(screen.getByText(new RegExp(`Documento do veículo · DOC-1 · válido até 31/12/${YEAR + 5}`))).not.toHaveTextContent('Vencido');
    expect(screen.getByText(/não recebe novas ofertas até você atualizar os documentos/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ceder a um motorista' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar documentos' }));
    expect(screen.getByLabelText('Placa ou identificador do veículo')).toHaveAttribute('readonly');
    type('Seguro válido até', RENEWED_UNTIL);
    fireEvent.click(screen.getByRole('button', { name: 'Salvar documentos' }));
    expect(await screen.findByText(/Documentos salvos\. Qualquer mudança de categoria, referência ou validade manda as cessões aprovadas/)).toBeVisible();
    expect(fleets.saveVehicle).toHaveBeenCalledWith(
      'frota',
      expect.objectContaining({ identifier: 'ABC1D23', category: 'sedan', insuranceUntil: RENEWED_UNTIL, inspectionUntil: INSPECTION_UNTIL }),
    );
  });
});

describe('Frota · cessão a motorista', () => {
  it('envia a cessão para revisão no horário de São Paulo e a nova tentativa reutiliza a chave', async () => {
    vi.mocked(fleets.assign).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce('cessao-1');
    panel(fleet('admin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Ceder a um motorista' }));
    expect(within(screen.getByLabelText('Motorista')).getAllByRole('option')).toHaveLength(1);
    type('Referência do contrato de cessão', ' CONTRATO-7 ');
    type(/Início da cessão/, '2090-01-10T08:00');
    type(/Fim da cessão/, '2090-07-10T08:00');
    type('Quem recebe pelas corridas, segundo o contrato', 'fleet');
    expect(screen.getByText(/O repasse das corridas continua sendo feito ao motorista/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar cessão para revisão' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar cessão para revisão' }));
    expect(await screen.findByText(/Cessão enviada para revisão/)).toBeVisible();
    const calls = vi.mocked(fleets.assign).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 6)).toEqual([
      'v1',
      'm2',
      'CONTRATO-7',
      'fleet',
      '2090-01-10T11:00:00.000Z',
      '2090-07-10T11:00:00.000Z',
    ]);
    expect(calls[0][6]).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('avisa no formulário os limites que o servidor aplica ao período da cessão', async () => {
    panel(fleet('admin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Ceder a um motorista' }));
    type('Referência do contrato de cessão', 'CONTRATO-7');
    type(/Início da cessão/, '2090-01-10T08:00');
    type(/Fim da cessão/, '2091-07-10T08:00');
    expect(screen.getByText(/durar até 13 meses/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar cessão para revisão' })).toBeDisabled();
    type(/Início da cessão/, '2020-01-10T08:00');
    type(/Fim da cessão/, '2020-07-10T08:00');
    expect(screen.getByText(/A cessão precisa terminar no futuro/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar cessão para revisão' })).toBeDisabled();
    expect(fleets.assign).not.toHaveBeenCalled();
  });

  it('explica a sobreposição de cessões com as palavras da frota, não como horário ocupado', async () => {
    vi.mocked(fleets.assign).mockRejectedValue(new AppError('slot_unavailable'));
    panel(fleet('admin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Ceder a um motorista' }));
    type('Referência do contrato de cessão', 'CONTRATO-7');
    type(/Início da cessão/, '2090-01-10T08:00');
    type(/Fim da cessão/, '2090-07-10T08:00');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar cessão para revisão' }));
    expect(await screen.findByText(/já tem uma cessão em revisão ou aprovada neste período/)).toBeVisible();
    expect(screen.queryByText(/horário não está mais livre/)).toBeNull();
    expect(screen.queryByText(/Cessão enviada para revisão/)).toBeNull();
  });

  it('não envia a cessão com fim antes do início', async () => {
    panel(fleet('admin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Ceder a um motorista' }));
    type('Referência do contrato de cessão', 'CONTRATO-7');
    type(/Início da cessão/, '2090-07-10T08:00');
    type(/Fim da cessão/, '2090-01-10T08:00');
    expect(screen.getByText('O fim da cessão precisa ser depois do início.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Enviar cessão para revisão' })).toBeDisabled();
  });

  it('sem motorista na frota, orienta a convidar antes de ceder', async () => {
    panel(fleet('admin', { members: [{ member_id: 'pessoa', name: 'Ana', role: 'admin', status: 'active' }] }));
    expect(await screen.findByText(/Convide um motorista para a frota, abaixo, antes de ceder/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ceder a um motorista' })).toBeNull();
    expect(screen.getByText(/Nenhum motorista na frota ainda/)).toBeVisible();
  });

  it('cessão em revisão mostra o bloqueio, sem pedir código, e só encerra depois da confirmação', async () => {
    vi.mocked(fleets.overview).mockResolvedValue(overview({ assignments: [assignment] }));
    vi.mocked(fleets.endAssignment).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(true);
    panel(fleet('admin'));
    expect(await screen.findByText('Bruno · Em revisão pela operação')).toBeVisible();
    expect(screen.getByText(/Contrato CONTRATO-7 · Beneficiário contratado: Frota/)).toBeVisible();
    expect(screen.getByText(/o motorista não recebe ofertas com este veículo/)).toHaveTextContent(/já está na fila da\s+operação/);
    expect(screen.queryByText(/cessao-1/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ceder a um motorista' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar cessão de Bruno' }));
    expect(screen.getByText(/Encerrar a cessão de ABC1D23 a Bruno\?/)).toBeVisible();
    expect(fleets.endAssignment).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
    expect(await screen.findByText(/Cessão encerrada/)).toBeVisible();
    const calls = vi.mocked(fleets.endAssignment).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe('cessao-1');
    expect(calls[1][1]).toBe(calls[0][1]);
  });

  it('cessões encerradas ou com período vencido ficam no histórico e liberam nova cessão', async () => {
    vi.mocked(fleets.overview).mockResolvedValue(
      overview({
        assignments: [
          { ...assignment, id: 'antiga', status: 'ended' },
          { ...assignment, id: 'vencida', status: 'approved', from: '2020-01-01T03:00:00Z', until: '2020-02-01T03:00:00Z' },
        ],
      }),
    );
    panel(fleet('admin'));
    expect(await screen.findByText('Nenhum motorista está com este veículo agora.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ceder a um motorista' })).toBeVisible();
    fireEvent.click(screen.getByText('Cessões anteriores (2)'));
    expect(screen.getByText(/Cessão encerrada$/)).toBeVisible();
    expect(screen.getByText(/Período encerrado$/)).toBeVisible();
  });
});

describe('Frota · motoristas e gestores', () => {
  it('convida um motorista e mostra o link de adesão uma única vez', async () => {
    vi.mocked(fleets.inviteMember).mockResolvedValue({ id: 'c1', token: TOKEN, expires_at: '2090-01-01T15:00:00Z' });
    panel(fleet('admin'));
    await screen.findByRole('heading', { name: 'Motoristas e gestores' });
    expect(screen.getByRole('button', { name: 'Gerar convite' })).toBeDisabled();
    type('E-mail da pessoa convidada', 'motorista@example.test');
    type('Validade do convite', '4320');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite' }));
    const link = (await screen.findByLabelText('Link para copiar')) as HTMLInputElement;
    expect(link.value).toMatch(new RegExp('/corridas/convite#adesao=' + TOKEN + '$'));
    expect(fleets.inviteMember).toHaveBeenCalledWith('frota', 'motorista@example.test', 'fleet_driver', 4320, expect.any(String));
  });

  it('avisa quando o servidor responde a um convite repetido sem o link', async () => {
    vi.mocked(fleets.inviteMember).mockResolvedValue({ id: 'c1', token: null, expires_at: '2090-01-01T15:00:00Z' });
    panel(fleet('admin'));
    await screen.findByRole('heading', { name: 'Motoristas e gestores' });
    type('E-mail da pessoa convidada', 'motorista@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite' }));
    expect(await screen.findByText(/o link aparece uma única vez/)).toBeVisible();
    expect(screen.queryByLabelText('Link para copiar')).toBeNull();
  });

  it('gestor só convida motoristas e não remove pessoas; o responsável também convida gestores', async () => {
    const { unmount } = panel(fleet('manager'));
    await screen.findByRole('heading', { name: 'Motoristas e gestores' });
    expect(screen.getByText('Ana · você · Gestor da frota')).toBeVisible();
    expect(screen.getByText('Bruno · Motorista da frota')).toBeVisible();
    expect(within(screen.getByLabelText('Papel na frota')).getAllByRole('option')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Remover Bruno/ })).toBeNull();
    unmount();
    panel(fleet('admin'));
    await screen.findByRole('heading', { name: 'Motoristas e gestores' });
    expect(within(screen.getByLabelText('Papel na frota')).getByRole('option', { name: 'Gestor da frota' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remover Ana/ })).toBeNull();
  });

  it('remover motorista pede confirmação e a nova tentativa reutiliza a chave', async () => {
    vi.mocked(fleets.removeMember).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(true);
    panel(fleet('admin'));
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Bruno da frota' }));
    expect(screen.getByText(/Remover Bruno desta frota\?/)).toBeVisible();
    expect(fleets.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByText('Bruno não faz mais parte desta frota.')).toBeVisible();
    const calls = vi.mocked(fleets.removeMember).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 2)).toEqual(['frota', 'm2']);
    expect(calls[1][2]).toBe(calls[0][2]);
  });

  it('revoga um convite pendente só depois da confirmação', async () => {
    vi.mocked(fleets.revokeInvite).mockResolvedValue(true);
    panel(fleet('admin'));
    expect(await screen.findByText(/Motorista da frota · válido até/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Revogar convite' }));
    expect(screen.getByText(/Revogar este convite\?/)).toBeVisible();
    expect(fleets.revokeInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revogação' }));
    expect(await screen.findByText('Convite revogado. O link deixou de funcionar.')).toBeVisible();
    expect(fleets.revokeInvite).toHaveBeenCalledWith('c0');
  });
});

describe('Frota · resumo do mês', () => {
  it('mostra só data, veículo, situação e o valor quando a frota é a beneficiária', async () => {
    vi.mocked(fleets.overview).mockResolvedValue(
      overview({
        legs: [
          { date: '2026-11-03', status: 'completed', vehicle_id: 'v1', driver_cents: 2700 },
          { date: '2026-11-04', status: 'completed', vehicle_id: 'v1', driver_cents: null },
          { date: '2026-11-05', status: 'cancelled', vehicle_id: 'v1', driver_cents: 1500 },
        ],
      }),
    );
    panel(fleet('manager'));
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Data',
      'Veículo',
      'Situação',
      'Parte do motorista',
    ]);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/03\/11\/2026.*ABC1D23.*Concluída.*27,00/);
    expect(rows[1]).toHaveTextContent(/04\/11\/2026.*Concluída.*—/);
    expect(rows[2]).toHaveTextContent(/Cancelada/);
    expect(screen.getByText(/Corridas concluídas com valor informado/)).toHaveTextContent(/27,00/);
    expect(screen.getByText(/Trajetos, passageiros e corridas particulares do motorista não aparecem/)).toBeVisible();
  });

  it('consulta outro mês pelo primeiro dia e diz quando não houve corrida', async () => {
    panel(fleet('manager'));
    expect(await screen.findByText(/Nenhuma corrida com veículos desta frota em/)).toBeVisible();
    type('Mês', '2020-05');
    await waitFor(() => expect(fleets.overview).toHaveBeenCalledWith('frota', '2020-05-01'));
    expect(await screen.findByText('Nenhuma corrida com veículos desta frota em maio de 2020.')).toBeVisible();
  });
});

describe('Frota · motorista da frota', () => {
  const cession: DriverCession = {
    id: 'cessao-1',
    account_id: 'frota',
    account_name: 'Locadora Fictícia',
    vehicle_identifier: 'ABC1D23',
    category: 'sedan',
    cession_ref: 'CONTRATO-7',
    beneficiary: 'driver',
    from: '2026-11-01T03:00:00Z',
    until: '2090-12-01T03:00:00Z',
    status: 'pending_review',
    created_at: '2026-10-30T12:00:00Z',
  };

  it('vê as próprias cessões nesta frota e por que não recebe ofertas', async () => {
    vi.mocked(fleets.myCessions).mockResolvedValue([
      cession,
      { ...cession, id: 'antiga', status: 'ended' },
      { ...cession, id: 'outra-frota', account_id: 'outra', vehicle_identifier: 'ZZZ9Z99', status: 'approved' },
    ]);
    panel(fleet('fleet_driver'));
    expect(await screen.findByText('ABC1D23 · Sedã')).toBeVisible();
    expect(screen.getByText(/Em revisão pela operação: você ainda não recebe ofertas com este veículo/)).toBeVisible();
    expect(screen.getByText(/Contrato CONTRATO-7 · Beneficiário contratado: Motorista/)).toBeVisible();
    expect(screen.getByText('Cessões encerradas, recusadas ou com período vencido: 1.')).toBeVisible();
    expect(screen.queryByText(/ZZZ9Z99/)).toBeNull();
    expectAccessibleScreen();
  });

  it('sem cessão em aberto, diz que não chegam ofertas e o que fazer', async () => {
    vi.mocked(fleets.myCessions).mockResolvedValue([]);
    panel(fleet('fleet_driver'));
    expect(await screen.findByText(/Nenhuma cessão em aberto\. Sem ela você não recebe ofertas/)).toBeVisible();
  });

  it('vê a própria participação, sem gestão, e sai só depois da confirmação', async () => {
    vi.mocked(fleets.removeMember).mockResolvedValue(true);
    vi.mocked(fleets.myCessions).mockResolvedValue([]);
    panel(fleet('fleet_driver'));
    expect(screen.getByRole('heading', { name: 'Você dirige por esta frota' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Abrir a área do motorista' })).toHaveAttribute('href', '/corridas/motorista');
    expect(screen.queryByRole('heading', { name: 'Veículos' })).toBeNull();
    expect(fleets.overview).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sair desta frota' }));
    expect(screen.getByText(/Sair de Locadora Fictícia\?/)).toBeVisible();
    expect(fleets.removeMember).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar saída' }));
    await waitFor(() => expect(onLeft).toHaveBeenCalledWith('Você saiu de Locadora Fictícia.'));
    expect(fleets.removeMember).toHaveBeenCalledWith('frota', 'pessoa', expect.any(String));
  });
});
