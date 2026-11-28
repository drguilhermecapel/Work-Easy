import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDateBR, lastBookableDayInSaoPaulo, validityEnd } from '../../lib/timezone';
import RideParties from '../../pages/admin/RideParties';
import { partiesAdmin } from '../../services/rideFleets';
import { getRideDashboard, type RideDashboard } from '../../services/rides';

const session = vi.hoisted(() => ({ mode: 'backend' }));
vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: session.mode, authUser: { id: 'operadora' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../services/rides', () => ({ getRideDashboard: vi.fn() }));
vi.mock('../../services/rideFleets', () => ({
  partiesAdmin: {
    verifyAccount: vi.fn(),
    reviewDependent: vi.fn(),
    reviewAssignment: vi.fn(),
    closeInvoice: vi.fn(),
    decideDispute: vi.fn(),
  },
}));

const CODE = '0a1b2c3d-1111-4222-8333-444455556666';
const INVOICE = '9f8e7d6c-aaaa-4bbb-8ccc-ddddeeeeffff';
// Inside every validity window of the forms, whatever day the test runs.
const SOON = lastBookableDayInSaoPaulo(new Date(), 30);
const dashboard = {
  enabled: true,
  simulation: true,
  quote_enabled: true,
  dispatch_enabled: true,
  areas: [],
  driver: null,
  rides: [],
  quotes: [],
  offers: [],
  reviews: [],
} satisfies RideDashboard;

/** Opens the page and answers the card of one action. */
async function card(title: string) {
  render(<RideParties />);
  return screen.findByRole('region', { name: title });
}
const type = (area: HTMLElement, label: string | RegExp, value: string) =>
  fireEvent.change(within(area).getByLabelText(label), { target: { value } });
const press = (area: HTMLElement, name: string) => fireEvent.click(within(area).getByRole('button', { name }));

beforeEach(() => {
  vi.resetAllMocks();
  session.mode = 'backend';
  vi.mocked(getRideDashboard).mockResolvedValue(dashboard);
});

describe('Administração · contas de corridas', () => {
  it('mostra o aviso de ensaio e as cinco ações da operação', async () => {
    render(<RideParties />);
    expect(await screen.findByText(/Ensaio com dados fictícios/)).toBeVisible();
    expect(screen.getByRole('heading', { level: 1, name: 'Contas de corridas' })).toBeVisible();
    for (const name of [
      'Conferir conta de empresa ou frota',
      'Revisar cessão de frota',
      'Revisar dependente',
      'Fechar fatura mensal',
      'Decidir contestação de fatura',
    ])
      expect(screen.getByRole('heading', { level: 3, name })).toBeVisible();
  });

  it('com o módulo desligado não oferece ações', async () => {
    vi.mocked(getRideDashboard).mockResolvedValue({ ...dashboard, enabled: false });
    render(<RideParties />);
    expect(await screen.findByText('O módulo de corridas está desativado neste ambiente.')).toBeVisible();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByText(/Ensaio com dados fictícios/)).toBeNull();
  });

  it('sem servidor configurado não consulta nada', () => {
    session.mode = 'demo';
    render(<RideParties />);
    expect(screen.getByText(/precisam do servidor configurado/)).toBeVisible();
    expect(getRideDashboard).not.toHaveBeenCalled();
  });
});

describe('Administração · conferência de conta', () => {
  it('exige o código completo e registra a conferência até o fim do dia escolhido', async () => {
    vi.mocked(partiesAdmin.verifyAccount).mockResolvedValue(true);
    const area = await card('Conferir conta de empresa ou frota');
    type(area, 'Código da conta', '0a1b2c3d');
    expect(within(area).getByText('Cole o código completo, com 36 caracteres.')).toBeVisible();
    expect(within(area).getByLabelText('Código da conta')).toHaveAttribute('aria-invalid', 'true');
    type(area, 'Referência da conferência', ' DOSSIE-41 ');
    type(area, 'Conferência válida até', SOON);
    expect(within(area).getByRole('button', { name: 'Registrar conferência' })).toBeDisabled();
    type(area, 'Código da conta', ` ${CODE} `);
    press(area, 'Registrar conferência');
    expect(await within(area).findByRole('status')).toHaveTextContent(
      `Conferência da conta 0a1b2c3d registrada, válida até ${formatDateBR(SOON)}.`,
    );
    expect(partiesAdmin.verifyAccount).toHaveBeenCalledWith(CODE, 'DOSSIE-41', validityEnd(SOON)!.toISOString());
  });

  it('retira a conferência só depois da confirmação, sem data', async () => {
    vi.mocked(partiesAdmin.verifyAccount).mockResolvedValue(false);
    const area = await card('Conferir conta de empresa ou frota');
    expect(within(area).getByRole('button', { name: 'Retirar conferência' })).toBeDisabled();
    type(area, 'Código da conta', CODE);
    type(area, 'Referência da conferência', 'DOSSIE-42');
    press(area, 'Retirar conferência');
    expect(within(area).getByText(/Retirar a conferência da conta 0a1b2c3d\?/)).toBeVisible();
    expect(partiesAdmin.verifyAccount).not.toHaveBeenCalled();
    press(area, 'Confirmar retirada');
    expect(await within(area).findByRole('status')).toHaveTextContent(/Conferência da conta 0a1b2c3d retirada/);
    expect(partiesAdmin.verifyAccount).toHaveBeenCalledWith(CODE, 'DOSSIE-42', null);
  });
});

describe('Administração · dependente e cessão de frota', () => {
  it('aprova o vínculo do dependente com evidência e validade', async () => {
    const area = await card('Revisar dependente');
    expect(within(area).getByText(/Não registre data de nascimento nem número de documento/)).toBeVisible();
    type(area, 'Código do dependente', CODE);
    type(area, 'Referência da evidência conferida', 'DOSSIE-7');
    expect(within(area).getByRole('button', { name: 'Aprovar vínculo' })).toBeDisabled();
    type(area, 'Vínculo válido até', SOON);
    press(area, 'Aprovar vínculo');
    expect(await within(area).findByRole('status')).toHaveTextContent(/Vínculo do dependente 0a1b2c3d aprovado até/);
    expect(partiesAdmin.reviewDependent).toHaveBeenCalledWith(CODE, true, 'DOSSIE-7', SOON);
  });

  it('recusa o vínculo só depois da confirmação e sem validade', async () => {
    const area = await card('Revisar dependente');
    type(area, 'Código do dependente', CODE);
    type(area, 'Referência da evidência conferida', 'DOSSIE-8');
    press(area, 'Recusar vínculo');
    expect(partiesAdmin.reviewDependent).not.toHaveBeenCalled();
    press(area, 'Confirmar recusa');
    expect(await within(area).findByRole('status')).toHaveTextContent('Vínculo do dependente 0a1b2c3d recusado.');
    expect(partiesAdmin.reviewDependent).toHaveBeenCalledWith(CODE, false, 'DOSSIE-8', null);
  });

  it('aprova e recusa uma cessão de frota com a referência da revisão', async () => {
    const area = await card('Revisar cessão de frota');
    type(area, 'Código da cessão', CODE);
    expect(within(area).getByRole('button', { name: 'Aprovar cessão' })).toBeDisabled();
    type(area, 'Referência da revisão', 'REVISAO-3');
    press(area, 'Aprovar cessão');
    expect(await within(area).findByRole('status')).toHaveTextContent(/Cessão 0a1b2c3d aprovada/);
    expect(partiesAdmin.reviewAssignment).toHaveBeenCalledWith(CODE, true, 'REVISAO-3');
    expect(within(area).getByLabelText('Código da cessão')).toHaveValue('');
    type(area, 'Código da cessão', CODE);
    press(area, 'Recusar cessão');
    expect(within(area).getByText(/Recusar a cessão 0a1b2c3d\?/)).toBeVisible();
    expect(partiesAdmin.reviewAssignment).toHaveBeenCalledTimes(1);
    press(area, 'Confirmar recusa');
    expect(await within(area).findByText('Cessão 0a1b2c3d recusada.')).toBeVisible();
    expect(partiesAdmin.reviewAssignment).toHaveBeenLastCalledWith(CODE, false, 'REVISAO-3');
  });
});

describe('Administração · faturas', () => {
  it('fecha a competência depois da confirmação e a nova tentativa reutiliza a chave', async () => {
    vi.mocked(partiesAdmin.closeInvoice).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce(INVOICE);
    const area = await card('Fechar fatura mensal');
    expect(within(area).getByRole('button', { name: 'Fechar competência' })).toBeDisabled();
    type(area, 'Código da conta da empresa', CODE);
    type(area, 'Competência', '2020-03');
    press(area, 'Fechar competência');
    expect(within(area).getByText(/Fechar março de 2020 para a conta 0a1b2c3d\?/)).toBeVisible();
    expect(partiesAdmin.closeInvoice).not.toHaveBeenCalled();
    press(area, 'Confirmar fechamento');
    expect(await within(area).findByRole('alert')).toBeVisible();
    press(area, 'Confirmar fechamento');
    expect(await within(area).findByRole('status')).toHaveTextContent('Competência março de 2020 fechada para a conta 0a1b2c3d.');
    expect(within(area).getByText(/Código da fatura/)).toHaveTextContent(INVOICE);
    const calls = vi.mocked(partiesAdmin.closeInvoice).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0].slice(0, 2)).toEqual([CODE, '2020-03-01']);
    expect(calls[0][2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls[1]).toEqual(calls[0]);
  });

  it('não fecha uma competência futura', async () => {
    const area = await card('Fechar fatura mensal');
    type(area, 'Código da conta da empresa', CODE);
    type(area, 'Competência', '2090-01');
    expect(within(area).getByRole('button', { name: 'Fechar competência' })).toBeDisabled();
  });

  it('aceita uma contestação com fundamentação e avisa que vira ajuste', async () => {
    vi.mocked(partiesAdmin.decideDispute).mockResolvedValue('accepted');
    const area = await card('Decidir contestação de fatura');
    type(area, 'Código da contestação', CODE);
    expect(within(area).getByRole('button', { name: 'Aceitar contestação' })).toBeDisabled();
    type(area, 'Fundamentação da decisão', ' Voucher aplicado em duplicidade. ');
    press(area, 'Aceitar contestação');
    expect(await within(area).findByRole('status')).toHaveTextContent(/entra como ajuste no próximo fechamento/);
    expect(partiesAdmin.decideDispute).toHaveBeenCalledWith(CODE, true, 'Voucher aplicado em duplicidade.');
  });

  it('rejeita uma contestação só depois da confirmação', async () => {
    vi.mocked(partiesAdmin.decideDispute).mockResolvedValue('rejected');
    const area = await card('Decidir contestação de fatura');
    type(area, 'Código da contestação', CODE);
    type(area, 'Fundamentação da decisão', 'Linha conferida com o recibo.');
    press(area, 'Rejeitar contestação');
    expect(partiesAdmin.decideDispute).not.toHaveBeenCalled();
    press(area, 'Confirmar rejeição');
    expect(await within(area).findByRole('status')).toHaveTextContent(/Contestação 0a1b2c3d rejeitada/);
    expect(partiesAdmin.decideDispute).toHaveBeenCalledWith(CODE, false, 'Linha conferida com o recibo.');
  });
});
