import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateBR, lastBookableDayInSaoPaulo, saoPauloDateTime, validityEnd } from '../../lib/timezone';
import RideParties from '../../pages/admin/RideParties';
import { partiesAdmin, type AdminOrganization, type PartyQueue } from '../../services/ridePartiesAdmin';
import { getRideDashboard, type RideDashboard } from '../../services/rides';
import { expectAccessibleScreen } from '../a11y/contract';

const session = vi.hoisted(() => ({ mode: 'backend' }));
vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: session.mode, authUser: { id: 'operadora' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../services/rides', () => ({ getRideDashboard: vi.fn() }));
vi.mock('../../services/ridePartiesAdmin', () => ({
  partiesAdmin: {
    queue: vi.fn(),
    organizations: vi.fn(),
    cessionDossiers: vi.fn(),
    verifyAccount: vi.fn(),
    reviewDependent: vi.fn(),
    reviewAssignment: vi.fn(),
    setDriverClearance: vi.fn(),
    saveProgram: vi.fn(),
    closeInvoice: vi.fn(),
    decideDispute: vi.fn(),
    resolveVoucherHold: vi.fn(),
  },
}));

const FLEET = '0a1b2c3d-1111-4222-8333-444455556666';
// Inside every validity window of the forms, whatever day the test runs.
const SOON = lastBookableDayInSaoPaulo(new Date(), 30);
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
  reviews: [
    { driver_id: 'd1a2b3c4-0000-4000-8000-000000000001', vehicle: 'sedan', status: 'approved', valid_until: '2090-01-01' },
    { driver_id: 'e5f6a7b8-0000-4000-8000-000000000002', vehicle: 'van', status: 'pending', valid_until: null },
  ],
} satisfies RideDashboard;
const emptyQueue: PartyQueue = { accounts: [], dependents: [], cessions: [], disputes: [], invoices: [], vouchers: [] };
// What the operation reads of each thing that waits: no place, no e-mail, and of a minor only label and age band
const queue: PartyQueue = {
  accounts: [
    { id: 'org-nova', kind: 'organization', name: 'Ateliê Fictício', state: 'pending', verified_until: null, created_at: '2026-11-20T12:00:00Z' },
    { id: 'frota-velha', kind: 'fleet', name: 'Locadora Fictícia', state: 'expiring', verified_until: '2026-12-10T15:00:00Z', created_at: '2026-01-05T12:00:00Z' },
  ],
  dependents: [{ id: 'dep', label: 'Teca', age_band: '16-17', requested_at: '2026-11-25T12:00:00Z' }],
  cessions: [
    { id: 'cessao', fleet_name: 'Locadora Fictícia', vehicle_identifier: 'ABC1D23', driver_label: 'Bruno', from: '2026-12-01T03:00:00Z', until: '2027-06-01T03:00:00Z' },
  ],
  disputes: [
    { id: 'disputa', account_name: 'Ateliê Fictício', month: '2026-10-01', kind: 'voucher', cents: 3000, reason: 'Valor em duplicidade', raised_at: '2026-11-05T12:00:00Z' },
  ],
  invoices: [{ account_id: 'org-antiga', account_name: 'Gráfica Fictícia', months: ['2026-09-01', '2026-10-01'] }],
  vouchers: [
    { leg_id: 'trecho-pronto', account_name: 'Gráfica Fictícia', program_label: 'Visitas', cents: 3500, since: '2026-11-26T15:00:00Z',
      reason: 'release_closed', ready: true, expires_at: '2026-12-26T15:00:00Z' },
    { leg_id: 'trecho-fechado', account_name: 'Ateliê Fictício', program_label: 'Equipe', cents: 2000, since: '2026-11-27T15:00:00Z',
      reason: 'monetization_off', ready: false, expires_at: '2026-12-27T15:00:00Z' },
  ],
};
const organization: AdminOrganization = {
  id: 'org-antiga',
  name: 'Gráfica Fictícia',
  verified: true,
  verified_until: '2027-05-30T15:00:00Z',
  created_at: '2026-01-05T12:00:00Z',
  programs: [
    {
      id: 'prog',
      label: 'Visitas',
      enabled: true,
      budget_cents: 100000,
      committed_cents: 25000,
      ride_value_cents: 4000,
      member_limit_cents: null,
      areas: ['Saúde'],
      classes: [],
      group_tag: null,
      valid_from: '2026-11-01T03:00:00Z',
      valid_until: '2027-11-01T03:00:00Z',
      excess_payer: 'rider',
      requires_approval: false,
      funding_ref: 'CONTRATO-12',
      evidence_ref: 'DOSSIE-12',
      created_at: '2026-10-20T12:00:00Z',
    },
  ],
};

/** Opens the page and answers one of its sections by its heading. */
async function section(title: RegExp) {
  render(<RideParties />);
  return screen.findByRole('region', { name: title }, { timeout: 5000 });
}
const type = (area: HTMLElement, label: string | RegExp, value: string) =>
  fireEvent.change(within(area).getByLabelText(label), { target: { value } });
const press = (area: HTMLElement, name: string | RegExp) => fireEvent.click(within(area).getByRole('button', { name }));

beforeEach(() => {
  vi.resetAllMocks();
  session.mode = 'backend';
  vi.mocked(getRideDashboard).mockResolvedValue(dashboard);
  vi.mocked(partiesAdmin.queue).mockResolvedValue(queue);
  vi.mocked(partiesAdmin.organizations).mockResolvedValue([organization]);
});

describe('Administração · contas de corridas', () => {
  it('lista o que aguarda a operação, com a contagem de cada fila, e mantém o contrato de acessibilidade', async () => {
    render(<RideParties />);
    expect(await screen.findByText(/Ensaio com dados fictícios/)).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Contas de corridas' })).toBeVisible();
    for (const name of [
      'Contas para conferir (2)',
      'Dependentes para revisar (1)',
      'Cessões de frota para revisar (1)',
      'Faturas para fechar (1)',
      'Contestações de fatura (1)',
      'Vouchers retidos (2)',
    ])
      expect(await screen.findByRole('heading', { level: 2, name })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Ateliê Fictício · Empresa' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Locadora Fictícia · Frota' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 3, name: 'Teca (16 ou 17 anos)' })).toBeVisible();
    expect(await screen.findByRole('heading', { level: 2, name: 'Programas de voucher das empresas' }, { timeout: 5000 })).toBeVisible();
    expect(await screen.findByRole('heading', { level: 2, name: 'Outras ações' }, { timeout: 5000 })).toBeVisible();
    const programs = screen.getByRole('region', { name: 'Programas de voucher das empresas' });
    expect(await within(programs).findByRole('heading', { level: 3, name: 'Gráfica Fictícia' })).toBeVisible();
    expect(partiesAdmin.queue).toHaveBeenCalledTimes(1);
    expectAccessibleScreen();
  });

  it('com as filas vazias, diz que nada aguarda em vez de pedir um código', async () => {
    vi.mocked(partiesAdmin.queue).mockResolvedValue(emptyQueue);
    render(<RideParties />);
    expect(await screen.findByText('Nenhuma conta aguardando conferência.')).toBeVisible();
    expect(screen.getByText('Nenhum dependente aguardando revisão.')).toBeVisible();
    expect(screen.getByText('Nenhuma cessão aguardando revisão.')).toBeVisible();
    expect(screen.getByText('Nenhuma competência encerrada aguardando fechamento.')).toBeVisible();
    expect(screen.getByText('Nenhum voucher retido aguardando a operação.')).toBeVisible();
    expect(screen.getByText('Nenhuma contestação aguardando decisão.')).toBeVisible();
    expect(screen.queryByLabelText(/Código da conta$/)).toBeNull();
    expect(screen.queryByLabelText(/Código do dependente/)).toBeNull();
    expect(screen.queryByLabelText(/Código da cessão/)).toBeNull();
    expect(screen.queryByLabelText(/Código da contestação/)).toBeNull();
  });

  it('com o módulo desligado não consulta a fila nem oferece ações', async () => {
    vi.mocked(getRideDashboard).mockResolvedValue({ ...dashboard, enabled: false });
    render(<RideParties />);
    expect(await screen.findByText('O módulo de corridas está desativado neste ambiente.')).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(/Ensaio com dados fictícios/)).toBeNull();
    expect(partiesAdmin.queue).not.toHaveBeenCalled();
  });

  it('sem servidor configurado não consulta nada', () => {
    session.mode = 'demo';
    render(<RideParties />);
    expect(screen.getByText(/precisam do servidor configurado/)).toBeVisible();
    expect(getRideDashboard).not.toHaveBeenCalled();
    expect(partiesAdmin.queue).not.toHaveBeenCalled();
  });
});

describe('Administração · conferência de conta', () => {
  it('registra a conferência na linha da conta, até o fim do dia escolhido, e relê a fila', async () => {
    vi.mocked(partiesAdmin.verifyAccount).mockResolvedValue(true);
    const area = await section(/^Contas para conferir/);
    expect(within(area).getByText(/· nunca conferida\. Até a conferência, a conta não convida pessoas nem opera/)).toBeVisible();
    const submit = within(area).getByRole('button', { name: 'Registrar conferência de Ateliê Fictício' });
    expect(submit).toBeDisabled();
    type(area, 'Referência da conferência de Ateliê Fictício', ' DOSSIE-41 ');
    type(area, 'Conferência de Ateliê Fictício válida até', SOON);
    fireEvent.click(submit);
    expect(await within(area).findByText(`Conferência de Ateliê Fictício registrada, válida até ${formatDateBR(SOON)}.`)).toBeVisible();
    expect(partiesAdmin.verifyAccount).toHaveBeenCalledWith('org-nova', 'DOSSIE-41', validityEnd(SOON)!.toISOString());
    await waitFor(() => expect(partiesAdmin.queue).toHaveBeenCalledTimes(2));
  });

  it('só oferece retirar a conferência de quem ainda a tem, e só retira depois da confirmação', async () => {
    vi.mocked(partiesAdmin.verifyAccount).mockResolvedValue(false);
    const area = await section(/^Contas para conferir/);
    expect(within(area).queryByRole('button', { name: 'Retirar conferência de Ateliê Fictício' })).toBeNull();
    expect(within(area).getByRole('button', { name: 'Retirar conferência de Locadora Fictícia' })).toBeDisabled();
    type(area, 'Referência da conferência de Locadora Fictícia', 'DOSSIE-42');
    press(area, 'Retirar conferência de Locadora Fictícia');
    expect(within(area).getByText(/A conta deixa de operar até uma nova conferência/)).toBeVisible();
    expect(partiesAdmin.verifyAccount).not.toHaveBeenCalled();
    press(area, 'Confirmar retirada');
    expect(await within(area).findByText(/Conferência de Locadora Fictícia retirada/)).toBeVisible();
    expect(partiesAdmin.verifyAccount).toHaveBeenCalledWith('frota-velha', 'DOSSIE-42', null);
  });
});

describe('Administração · dependente e cessão de frota', () => {
  it('aprova o vínculo do dependente com um código de evidência e a validade', async () => {
    vi.mocked(partiesAdmin.reviewDependent).mockResolvedValue(true);
    const area = await section(/^Dependentes para revisar/);
    expect(within(area).getByText(/cada leitura e cada revisão ficam no registro de acesso/)).toBeVisible();
    type(area, 'Referência da evidência conferida de Teca', 'certidão 12');
    // The database takes only a reference code: the form says so instead of letting the call fail
    expect(within(area).getByText(/sem espaços/)).toBeVisible();
    expect(within(area).getByRole('button', { name: 'Aprovar vínculo de Teca' })).toBeDisabled();
    type(area, 'Referência da evidência conferida de Teca', 'DOSSIE-7');
    type(area, 'Vínculo de Teca válido até', SOON);
    press(area, 'Aprovar vínculo de Teca');
    expect(await within(area).findByText(`Vínculo de Teca (16 ou 17 anos) aprovado até ${formatDateBR(SOON)}.`)).toBeVisible();
    expect(partiesAdmin.reviewDependent).toHaveBeenCalledWith('dep', true, 'DOSSIE-7', SOON);
  });

  it('recusa o vínculo só depois da confirmação e sem validade', async () => {
    vi.mocked(partiesAdmin.reviewDependent).mockResolvedValue(false);
    const area = await section(/^Dependentes para revisar/);
    type(area, 'Referência da evidência conferida de Teca', 'DOSSIE-8');
    press(area, 'Recusar vínculo de Teca');
    expect(partiesAdmin.reviewDependent).not.toHaveBeenCalled();
    press(area, 'Confirmar recusa');
    expect(await within(area).findByText('Vínculo de Teca (16 ou 17 anos) recusado.')).toBeVisible();
    expect(partiesAdmin.reviewDependent).toHaveBeenCalledWith('dep', false, 'DOSSIE-8', null);
  });

  it('mostra o que a frota declarou só quando pedido e decide a cessão com a referência da revisão', async () => {
    vi.mocked(partiesAdmin.cessionDossiers).mockResolvedValue([
      {
        id: 'cessao',
        account_verified: true,
        category: 'sedan',
        document_ref: 'DOC-1',
        insurance_ref: 'APOLICE-9',
        inspection_ref: 'VISTORIA-3',
        vehicle_until: '2090-12-31',
        insurance_until: '2090-06-30',
        inspection_until: '2090-03-31',
        driver_vehicle_match: false,
        cession_ref: 'CONTRATO-7',
        beneficiary: 'fleet',
        status: 'pending_review',
      },
    ]);
    vi.mocked(partiesAdmin.reviewAssignment).mockResolvedValue(true);
    const area = await section(/^Cessões de frota para revisar/);
    expect(within(area).getByRole('heading', { name: 'Locadora Fictícia · ABC1D23 a Bruno' })).toBeVisible();
    expect(partiesAdmin.cessionDossiers).not.toHaveBeenCalled();
    press(area, 'Ver o que a frota declarou sobre ABC1D23');
    expect(await within(area).findByText(/Seguro: APOLICE-9 · válido até 30\/06\/2090/)).toBeVisible();
    expect(within(area).getByText(/contrato de cessão CONTRATO-7 ·\s+beneficiário contratado: frota/)).toBeVisible();
    expect(within(area).getByText(/o identificador não é o do veículo no cadastro do motorista/)).toBeVisible();
    type(area, 'Referência da revisão da cessão de ABC1D23 a Bruno', 'REV-3');
    press(area, 'Aprovar cessão de ABC1D23 a Bruno');
    expect(await within(area).findByText(/Cessão de ABC1D23 a Bruno aprovada/)).toBeVisible();
    expect(partiesAdmin.reviewAssignment).toHaveBeenCalledWith('cessao', true, 'REV-3');
    type(area, 'Referência da revisão da cessão de ABC1D23 a Bruno', 'REV-4');
    press(area, 'Recusar cessão de ABC1D23 a Bruno');
    expect(partiesAdmin.reviewAssignment).toHaveBeenCalledTimes(1);
    press(area, 'Confirmar recusa');
    expect(await within(area).findByText('Cessão de ABC1D23 a Bruno recusada.')).toBeVisible();
    expect(partiesAdmin.reviewAssignment).toHaveBeenLastCalledWith('cessao', false, 'REV-4');
  });
});

describe('Administração · vouchers retidos', () => {
  it('lista o voucher retido com empresa, programa, valor, início e motivo, sem cobrar quem viaja', async () => {
    const area = await section(/^Vouchers retidos \(2\)/);
    expect(within(area).getByRole('heading', { level: 3, name: /Gráfica Fictícia · Visitas · R\$\s35,00/ })).toBeVisible();
    expect(within(area).getByText(/a liberação do benefício neste trajeto está fechada\. Nada é cobrado de\s+quem viaja/)).toBeVisible();
    expect(within(area).getByText(/a cobrança está desligada neste ambiente ou trajeto/)).toBeVisible();
    expect(within(area).getByText('Aplicar fica disponível quando a liberação do benefício do trajeto voltar.')).toBeVisible();
    type(area, /Referência da decisão sobre o voucher de Ateliê Fictício/, 'ficticio-dd124');
    expect(within(area).getByRole('button', { name: /^Aplicar voucher de Ateliê Fictício/ })).toBeDisabled();
    expectAccessibleScreen();
  });

  it('aplica o voucher com a referência e a nova tentativa reutiliza a chave', async () => {
    vi.mocked(partiesAdmin.resolveVoucherHold)
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValueOnce({ leg_id: 'trecho-pronto', action: 'apply', reason: 'release_closed', cents: 0, applied_cents: 3500, order_id: 'ordem', payer_choice: false, reference: 'ficticio-dd124' });
    const area = await section(/^Vouchers retidos/);
    const apply = within(area).getByRole('button', { name: /^Aplicar voucher de Gráfica Fictícia/ });
    expect(apply).toBeDisabled();
    type(area, /Referência da decisão sobre o voucher de Gráfica Fictícia/, ' ficticio-dd124 ');
    fireEvent.click(apply);
    expect(await within(area).findByRole('alert')).toBeVisible();
    fireEvent.click(within(area).getByRole('button', { name: /^Aplicar voucher de Gráfica Fictícia/ }));
    expect(await within(area).findByText(/Voucher de Gráfica Fictícia aplicado ao pedido do trecho\. Voucher aplicado: R\$\s35,00/)).toBeVisible();
    const calls = vi.mocked(partiesAdmin.resolveVoucherHold).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 3)).toEqual(['trecho-pronto', 'apply', 'ficticio-dd124']);
    expect(calls[0][3]).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('o voucher parcial sem pedido é liberado para quem viaja escolher como pagar a diferença', async () => {
    vi.mocked(partiesAdmin.resolveVoucherHold).mockResolvedValue({
      leg_id: 'trecho-pronto', action: 'apply', reason: 'release_closed', cents: 3500, applied_cents: null, order_id: null, payer_choice: true, reference: 'ficticio-dd124',
    });
    const area = await section(/^Vouchers retidos/);
    type(area, /Referência da decisão sobre o voucher de Gráfica Fictícia/, 'ficticio-dd124');
    fireEvent.click(within(area).getByRole('button', { name: /^Aplicar voucher de Gráfica Fictícia/ }));
    expect(
      await within(area).findByText('Voucher de Gráfica Fictícia liberado. Quem viaja escolhe em Corridas como pagar a diferença aceita e usa o voucher.'),
    ).toBeVisible();
    expect(within(area).queryByText(/aplicado ao pedido do trecho/)).toBeNull();
  });

  it('devolve o voucher ao programa só depois da confirmação', async () => {
    vi.mocked(partiesAdmin.resolveVoucherHold).mockResolvedValue({
      leg_id: 'trecho-fechado', action: 'return', reason: 'monetization_off', cents: 0, applied_cents: null, order_id: null, payer_choice: false, reference: 'ficticio-dd124',
    });
    const area = await section(/^Vouchers retidos/);
    expect(within(area).getByRole('button', { name: /^Devolver ao programa o voucher de Ateliê Fictício/ })).toBeDisabled();
    type(area, /Referência da decisão sobre o voucher de Ateliê Fictício/, 'ficticio-dd124');
    press(area, /^Devolver ao programa o voucher de Ateliê Fictício/);
    expect(within(area).getByText(/O valor volta ao saldo do programa/)).toBeVisible();
    expect(partiesAdmin.resolveVoucherHold).not.toHaveBeenCalled();
    press(area, 'Confirmar devolução');
    expect(await within(area).findByText(/Voucher de Ateliê Fictício devolvido ao programa/)).toBeVisible();
    expect(vi.mocked(partiesAdmin.resolveVoucherHold).mock.calls[0].slice(0, 3)).toEqual(['trecho-fechado', 'return', 'ficticio-dd124']);
  });
});

describe('Administração · faturas', () => {
  it('fecha a competência mais antiga depois da confirmação e a nova tentativa reutiliza a chave', async () => {
    vi.mocked(partiesAdmin.closeInvoice).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce('fatura');
    const area = await section(/^Faturas para fechar/);
    // Months close in order: only the oldest open one is offered, and the current month never comes in the queue
    expect(within(area).getByText(/Competência a fechar: setembro de 2026\.\s+Depois dela: outubro de 2026/)).toBeVisible();
    expect(within(area).queryByRole('button', { name: /Fechar outubro/ })).toBeNull();
    press(area, 'Fechar setembro de 2026 de Gráfica Fictícia');
    expect(within(area).getByText(/As linhas da fatura ficam imutáveis/)).toBeVisible();
    expect(partiesAdmin.closeInvoice).not.toHaveBeenCalled();
    press(area, 'Confirmar fechamento');
    expect(await within(area).findByRole('alert')).toBeVisible();
    press(area, 'Confirmar fechamento');
    expect(await within(area).findByText(/Competência setembro de 2026 fechada para Gráfica Fictícia/)).toBeVisible();
    const calls = vi.mocked(partiesAdmin.closeInvoice).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 2)).toEqual(['org-antiga', '2026-09-01']);
    expect(calls[0][2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('aceita uma contestação com fundamentação, lendo o motivo da empresa, e avisa que vira ajuste', async () => {
    vi.mocked(partiesAdmin.decideDispute).mockResolvedValue('accepted');
    const area = await section(/^Contestações de fatura/);
    expect(within(area).getByRole('heading', { name: /Ateliê Fictício, outubro de 2026 · Voucher de viagem de R\$\s30,00/ })).toBeVisible();
    expect(within(area).getByText('Valor em duplicidade')).toBeVisible();
    const accept = within(area).getByRole('button', { name: 'Aceitar contestação de Ateliê Fictício, outubro de 2026' });
    expect(accept).toBeDisabled();
    type(area, 'Fundamentação da decisão sobre Ateliê Fictício, outubro de 2026', ' Cobrança em duplicidade confirmada ');
    fireEvent.click(accept);
    expect(await within(area).findByText(/O crédito entra como ajuste no próximo fechamento/)).toBeVisible();
    expect(partiesAdmin.decideDispute).toHaveBeenCalledWith('disputa', true, 'Cobrança em duplicidade confirmada');
  });

  it('rejeita uma contestação só depois da confirmação', async () => {
    vi.mocked(partiesAdmin.decideDispute).mockResolvedValue('rejected');
    const area = await section(/^Contestações de fatura/);
    type(area, 'Fundamentação da decisão sobre Ateliê Fictício, outubro de 2026', 'Valor conferido com o recibo');
    press(area, 'Rejeitar contestação de Ateliê Fictício, outubro de 2026');
    expect(partiesAdmin.decideDispute).not.toHaveBeenCalled();
    press(area, 'Confirmar rejeição');
    expect(await within(area).findByText(/A linha da fatura fica como está/)).toBeVisible();
    expect(partiesAdmin.decideDispute).toHaveBeenCalledWith('disputa', false, 'Valor conferido com o recibo');
  });
});

describe('Administração · programas de voucher', () => {
  it('registra um programa novo usando a chave da tentativa como código e a repete depois de uma falha', async () => {
    vi.mocked(partiesAdmin.saveProgram).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce('novo');
    const area = await section(/^Programas de voucher das empresas/);
    expect(await within(area).findByRole('heading', { level: 3, name: 'Gráfica Fictícia' })).toBeVisible();
    expect(within(area).getByText(/Orçamento R\$\s1\.000,00 · comprometido R\$\s250,00/)).toBeVisible();
    press(area, 'Registrar programa para Gráfica Fictícia');
    type(area, 'Nome do programa', 'Eventos');
    type(area, 'Orçamento total (R$)', '500,00');
    type(area, 'Valor pago por corrida, até (R$)', '600,00');
    type(area, 'Vigência a partir de (São Paulo)', '2027-01-01T00:00');
    type(area, 'Vigência até (São Paulo)', '2027-07-01T00:00');
    type(area, 'Referência do custeio', 'CONTRATO-13');
    type(area, 'Referência da evidência conferida', 'DOSSIE-13');
    press(area, 'Registrar programa de Gráfica Fictícia');
    expect(await within(area).findByRole('alert')).toHaveTextContent('não pode passar do orçamento');
    expect(partiesAdmin.saveProgram).not.toHaveBeenCalled();
    type(area, 'Valor pago por corrida, até (R$)', '40,00');
    fireEvent.click(within(area).getByLabelText('Jabaquara'));
    fireEvent.click(within(area).getByLabelText(/Programa ativo/));
    press(area, 'Registrar programa de Gráfica Fictícia');
    await waitFor(() => expect(partiesAdmin.saveProgram).toHaveBeenCalledTimes(1));
    expect(await within(area).findByRole('alert')).toBeVisible();
    press(area, 'Registrar programa de Gráfica Fictícia');
    expect(await within(area).findByText('Programa Eventos de Gráfica Fictícia salvo e ativo.')).toBeVisible();
    const calls = vi.mocked(partiesAdmin.saveProgram).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      account: 'org-antiga',
      label: 'Eventos',
      budgetCents: 50000,
      rideValueCents: 4000,
      memberLimitCents: null,
      areas: ['Jabaquara'],
      classes: [],
      group: null,
      from: saoPauloDateTime('2027-01-01', '00:00')!.toISOString(),
      until: saoPauloDateTime('2027-07-01', '00:00')!.toISOString(),
      excessPayer: 'none',
      requiresApproval: false,
      fundingRef: 'CONTRATO-13',
      evidenceRef: 'DOSSIE-13',
      enabled: true,
    });
    expect(calls[1][0].id).toBe(calls[0][0].id);
  });

  it('altera um programa existente sem deixar o orçamento abaixo do já comprometido', async () => {
    vi.mocked(partiesAdmin.saveProgram).mockResolvedValue('prog');
    const area = await section(/^Programas de voucher das empresas/);
    fireEvent.click(await within(area).findByRole('button', { name: 'Alterar Visitas' }));
    expect(within(area).getByLabelText('Nome do programa')).toHaveValue('Visitas');
    expect(within(area).getByLabelText('Saúde')).toBeChecked();
    type(area, 'Orçamento total (R$)', '200,00');
    press(area, 'Salvar alterações de Visitas');
    expect(await within(area).findByRole('alert')).toHaveTextContent(/não pode ficar abaixo do que já está comprometido: R\$\s250,00/);
    expect(partiesAdmin.saveProgram).not.toHaveBeenCalled();
    type(area, 'Orçamento total (R$)', '2.000,00');
    fireEvent.click(within(area).getByLabelText(/Programa ativo/));
    press(area, 'Salvar alterações de Visitas');
    expect(await within(area).findByText('Programa Visitas de Gráfica Fictícia salvo, pausado.')).toBeVisible();
    expect(partiesAdmin.saveProgram).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'prog', account: 'org-antiga', budgetCents: 200000, rideValueCents: 4000, areas: ['Saúde'], excessPayer: 'rider', enabled: false }),
    );
  });
});

describe('Administração · outras ações', () => {
  it('libera um motorista aprovado da lista da operação e retira a liberação só depois da confirmação', async () => {
    vi.mocked(partiesAdmin.setDriverClearance).mockResolvedValue(true);
    const area = await section(/^Outras ações/);
    const drivers = within(area).getByLabelText('Motorista aprovado');
    // Only approved drivers of the operation's own review list are offered: no code is pasted
    expect(within(drivers).getAllByRole('option').map((option) => option.textContent)).toEqual(['Selecione', 'Motorista d1a2b3c4 · Sedã']);
    type(area, 'Motorista aprovado', 'd1a2b3c4-0000-4000-8000-000000000001');
    type(area, 'Referência da checagem', 'CHECAGEM-5');
    type(area, 'Liberação válida até', SOON);
    press(area, 'Registrar liberação');
    expect(await within(area).findByText(`Liberação do motorista d1a2b3c4 registrada até ${formatDateBR(SOON)}.`)).toBeVisible();
    expect(partiesAdmin.setDriverClearance).toHaveBeenCalledWith('d1a2b3c4-0000-4000-8000-000000000001', 'CHECAGEM-5', validityEnd(SOON)!.toISOString());
    press(area, 'Retirar liberação');
    expect(partiesAdmin.setDriverClearance).toHaveBeenCalledTimes(1);
    press(area, 'Confirmar retirada');
    expect(await within(area).findByText(/Liberação do motorista d1a2b3c4 retirada/)).toBeVisible();
    expect(partiesAdmin.setDriverClearance).toHaveBeenLastCalledWith('d1a2b3c4-0000-4000-8000-000000000001', 'CHECAGEM-5', null);
  });

  it('o único código colado é o de uma frota fora da fila, e precisa estar completo', async () => {
    vi.mocked(partiesAdmin.verifyAccount).mockResolvedValue(true);
    const area = await section(/^Outras ações/);
    type(area, 'Código da conta da frota', 'abc');
    expect(within(area).getByText('Cole o código completo, com 36 caracteres.')).toBeVisible();
    expect(within(area).queryByRole('button', { name: /Registrar conferência/ })).toBeNull();
    type(area, 'Código da conta da frota', FLEET);
    type(area, 'Referência da conferência de a conta 0a1b2c3d', 'DOSSIE-50');
    type(area, 'Conferência de a conta 0a1b2c3d válida até', SOON);
    press(area, 'Registrar conferência de a conta 0a1b2c3d');
    expect(await within(area).findByText(/registrada, válida até/)).toBeVisible();
    expect(partiesAdmin.verifyAccount).toHaveBeenCalledWith(FLEET, 'DOSSIE-50', validityEnd(SOON)!.toISOString());
  });
});
