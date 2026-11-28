import { useState } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CompanionPanel from '../../components/mobility/parties/CompanionPanel';
import DependentPanel, { GuardianWatch } from '../../components/mobility/parties/DependentPanel';
import FundingChoice from '../../components/mobility/parties/FundingChoice';
import {
  SELF_FUNDING,
  fundingProblem,
  parties,
  type Companion,
  type Dependent,
  type Funding,
  type GuardianWatch as Watch,
  type PartyAccount,
} from '../../services/rideParties';
import { expectAccessibleScreen } from '../a11y/contract';

vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: 'backend', authUser: { id: 'titular' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../services/rideParties', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/rideParties')>();
  const mocked = Object.fromEntries(Object.keys(original.parties).map((name) => [name, vi.fn()]));
  return { ...original, parties: mocked as unknown as typeof original.parties };
});

const token = 'ef'.repeat(32);
const change = vi.fn();
const mine: Companion = {
  owner_id: 'titular',
  companion_id: 'neto',
  label: 'Caio',
  mine: true,
  notices: ['arriving', 'completed'],
  pays: true,
};
const theirs: Companion = {
  owner_id: 'avo',
  companion_id: 'titular',
  label: 'Dona Lia',
  mine: false,
  notices: ['boarded', 'completed'],
  pays: false,
};
const family: PartyAccount = {
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
  members: [],
  invites: [],
};
const teen: Dependent = {
  id: 'dep',
  account_id: 'grupo',
  label: 'Teca',
  age_band: '16-17',
  legal_basis: 'parental_authority',
  status: 'verified',
  valid_until: '2091-06-30',
  legs: [],
};
// What the guardian reads of a leg: the passenger's own safety status plus the alerts kept for it
const watch = (over: Partial<Watch>): Watch => ({
  lost_checks: [],
  role: 'passenger',
  status: 'boarded',
  simulation: true,
  wellness: null,
  notice_given: false,
  recording_allowed: false,
  media_enabled: false,
  dial: null,
  location: null,
  vehicle: null,
  policy: null,
  cases: [],
  alerts: [],
  ...over,
});
const companions = (list: Companion[], invites: Parameters<typeof CompanionPanel>[0]['invites'] = []) =>
  render(
    <MemoryRouter>
      <CompanionPanel companions={list} invites={invites} onChange={change} />
    </MemoryRouter>,
  );
const dependents = (accounts: PartyAccount[], list: Dependent[]) =>
  render(
    <MemoryRouter>
      <DependentPanel accounts={accounts} dependents={list} onChange={change} />
    </MemoryRouter>,
  );

beforeEach(() => vi.resetAllMocks());

describe('acompanhante de confiança', () => {
  it('convida escolhendo os avisos e quem paga, com o link de adesão do acompanhante', async () => {
    vi.mocked(parties.inviteCompanion)
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValue({ id: 'convite', token, expires_at: '2090-12-01T14:00:00Z' });
    companions([], [
      { id: 'enviado', status: 'pending', notices: ['arriving'], pays: true, expires_at: '2090-12-01T14:00:00Z' },
      { id: 'recusado', status: 'declined', notices: ['arriving'], pays: false, expires_at: '2090-12-01T14:00:00Z' },
    ]);
    expect(screen.getByText(/Você ainda não tem acompanhante/)).toBeVisible();
    // The invites the person already sent and that still wait for an answer are listed; closed ones are not
    const waiting = screen.getByRole('list', { name: 'Convites de acompanhante aguardando resposta' });
    expect(within(waiting).getAllByRole('listitem')).toHaveLength(1);
    expect(within(waiting).getByText(/com pagamento das corridas/)).toBeVisible();
    expect(screen.getByText(/Antes de aceitar, a pessoa lê quem convida/)).toBeVisible();
    expectAccessibleScreen();
    const choices = screen.getByRole('group', { name: 'Avisos que a pessoa recebe' });
    expect(within(choices).getByLabelText('Embarque')).toBeChecked();
    fireEvent.click(within(choices).getByLabelText('Motorista a caminho'));
    fireEvent.click(within(choices).getByLabelText('Cancelamento'));
    fireEvent.click(screen.getByLabelText('Pedir que esta pessoa pague minhas corridas'));
    fireEvent.change(screen.getByLabelText('E-mail do acompanhante'), { target: { value: 'caio@exemplo.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite de acompanhante' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite de acompanhante' }));
    const link = (await screen.findByLabelText('Link do convite')) as HTMLInputElement;
    // The server tells the recipient what the token is, so the link carries no marker beyond the fragment
    expect(link.value).toMatch(new RegExp('/corridas/convite#adesao=' + token + '$'));
    const calls = vi.mocked(parties.inviteCompanion).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1].slice(0, 4)).toEqual(['caio@exemplo.test', ['boarded', 'completed', 'cancelled'], true, 1440]);
    expect(calls[1][4]).toBe(calls[0][4]);
  });

  it('a pessoa muda os avisos e quem paga, e retira o acompanhante sem perder o próprio suporte', async () => {
    vi.mocked(parties.revokeCompanion).mockResolvedValue(true);
    companions([mine]);
    const choices = screen.getByRole('group', { name: 'Avisos que Caio recebe' });
    expect(within(choices).getByLabelText('Motorista a caminho')).toBeChecked();
    fireEvent.click(within(choices).getByLabelText('Motorista a caminho'));
    fireEvent.click(screen.getByLabelText('Caio paga minhas corridas'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar avisos de Caio' }));
    await waitFor(() => expect(parties.setCompanion).toHaveBeenCalledWith('neto', ['completed'], false));
    fireEvent.click(screen.getByRole('button', { name: 'Retirar Caio' }));
    expect(screen.getByText(/Seu acesso ao\s+plantão e aos seus protocolos continua igual/)).toBeVisible();
    expect(parties.revokeCompanion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada' }));
    await waitFor(() => expect(parties.revokeCompanion).toHaveBeenCalledWith('neto'));
    expect(await screen.findByText(/Acompanhante retirado/)).toBeVisible();
    expect(change).toHaveBeenCalled();
  });

  it('o acompanhante vê só situação e previsão, e pode sair do acompanhamento', async () => {
    vi.mocked(parties.companionProgress).mockResolvedValue({ status: 'boarded', eta: '2090-12-01T15:30:00Z', simulation: true });
    vi.mocked(parties.revokeCompanion).mockResolvedValue(true);
    const first = companions([theirs]);
    expect(screen.getByText(/Avisos escolhidos por Dona Lia: embarque, chegada ao destino/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ver andamento de Dona Lia' }));
    expect(await screen.findByText('Em viagem')).toBeVisible();
    expect(screen.getByText(/Previsão de chegada/)).toBeVisible();
    expect(screen.getByText(/Ambiente de ensaio/)).toBeVisible();
    expect(parties.companionProgress).toHaveBeenCalledWith('avo');
    fireEvent.click(screen.getByRole('button', { name: 'Deixar de acompanhar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar saída' }));
    await waitFor(() => expect(parties.revokeCompanion).toHaveBeenCalledWith('avo'));
    first.unmount();
    vi.mocked(parties.companionProgress).mockResolvedValue(null);
    companions([theirs]);
    fireEvent.click(screen.getByRole('button', { name: 'Ver andamento de Dona Lia' }));
    expect(await screen.findByText('Nenhuma corrida em andamento agora.')).toBeVisible();
  });
});

describe('adolescente com responsável', () => {
  it('cadastra o dependente no grupo que a pessoa administra, sem documento nem data de nascimento', async () => {
    vi.mocked(parties.registerDependent).mockRejectedValueOnce(new Error('rede')).mockResolvedValue('dep');
    dependents([family], []);
    expect(screen.getByText('Nenhum dependente cadastrado.')).toBeVisible();
    expect(screen.getByText(/Documento e data de nascimento não ficam guardados/)).toBeVisible();
    expectAccessibleScreen();
    fireEvent.change(screen.getByLabelText('Nome ou apelido do dependente'), { target: { value: 'Teca' } });
    fireEvent.change(screen.getByLabelText('Faixa etária'), { target: { value: '16-17' } });
    fireEvent.change(screen.getByLabelText('Vínculo com o dependente'), { target: { value: 'guardianship' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para conferência' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para conferência' }));
    expect(await screen.findByText(/Cadastro enviado/)).toBeVisible();
    const calls = vi.mocked(parties.registerDependent).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1].slice(0, 4)).toEqual(['grupo', 'Teca', '16-17', 'guardianship']);
    expect(calls[1][4]).toBe(calls[0][4]);
  });

  it('mostra a situação da conferência e exige um grupo familiar para cadastrar', () => {
    dependents([], [{ ...teen, status: 'pending', valid_until: null }, { ...teen, id: 'dep2', label: 'Rui', age_band: '13-15' }]);
    expect(screen.getByText(/Em conferência pela operação/)).toBeVisible();
    expect(screen.getByText('Conferido pela operação · vale até 30/06/2091')).toBeVisible();
    expect(screen.getByText(/escolha Rui em “Quem viaja e quem paga”/)).toBeVisible();
    expect(screen.getByText(/crie antes um grupo familiar/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Enviar para conferência' })).toBeNull();
  });

  it('o responsável acompanha o trecho, vê o alerta de desvio e escala ao plantão com a mesma chave ao repetir', async () => {
    vi.mocked(parties.guardianWatch).mockResolvedValue(
      watch({
        wellness: 'route_deviation',
        location: { lat: -23.6, lng: -46.6, at: '2090-12-01T15:10:00Z' },
        alerts: [{ kind: 'route_deviation', at: '2090-12-01T15:12:00Z', seen_at: '2090-12-01T15:13:00Z', escalated_protocol: null }],
      }),
    );
    vi.mocked(parties.guardianEscalate).mockRejectedValueOnce(new Error('rede')).mockResolvedValue('PROTOCOLO-ENSAIO');
    dependents([family], [{ ...teen, legs: [{ leg_id: 'trecho', status: 'boarded', pickup_at: '2090-12-01T15:00:00Z' }] }]);
    fireEvent.click(screen.getByRole('button', { name: 'Acompanhar a viagem de Teca' }));
    const alerts = await screen.findByRole('list', { name: 'Alertas deste trecho' });
    expect(within(alerts).getByText(/fora do percurso de referência/)).toBeVisible();
    expect(parties.guardianWatch).toHaveBeenCalledWith('trecho');
    expect(screen.getByText(/último sinal de localização/)).toBeVisible();
    expectAccessibleScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Chamar o plantão para este trecho' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Chamar o plantão para este trecho' }));
    expect(await screen.findByText(/Plantão acionado\. Protocolo PROTOCOLO-ENSAIO/)).toBeVisible();
    const calls = vi.mocked(parties.guardianEscalate).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1][0]).toBe('trecho');
    expect(calls[1][1]).toBe(calls[0][1]);
    expect(screen.queryByRole('button', { name: 'Chamar o plantão para este trecho' })).toBeNull();
  });

  it('o acompanhamento pode ser montado direto em um trecho e informa quando não há alertas', async () => {
    vi.mocked(parties.guardianWatch).mockResolvedValue(watch({ status: 'arriving', simulation: false }));
    render(<GuardianWatch leg="trecho-2" />);
    fireEvent.click(screen.getByRole('button', { name: 'Acompanhar a viagem do dependente' }));
    expect(await screen.findByText(/Nenhum alerta de desvio ou de sinal ausente/)).toBeVisible();
    expect(screen.queryByText(/Ambiente de ensaio/)).toBeNull();
  });

  it('a cotação para o dependente só fica pronta com o aceite específico do responsável', async () => {
    vi.mocked(parties.overview).mockResolvedValue({
      accounts: [family],
      mandates: [],
      companions: [],
      companionInvites: [],
      programs: [],
      // The database already reads a record past its date as expired
      dependents: [teen, { ...teen, id: 'pendente', label: 'Rui', status: 'pending' }, { ...teen, id: 'vencido', label: 'Davi', status: 'expired' }],
    });
    const seen = vi.fn();
    function Harness() {
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
    render(<Harness />);
    fireEvent.click(await screen.findByLabelText(/Teca viaja \(16-17 anos\) · eu respondo pela viagem e pago/));
    expect(screen.queryByLabelText(/Rui viaja/)).toBeNull();
    expect(screen.queryByLabelText(/Davi viaja/)).toBeNull();
    expect(seen).toHaveBeenLastCalledWith({ kind: 'dependent', dependent: 'dep', consent: false });
    expect(fundingProblem(seen.mock.lastCall![0])).toMatch(/aceite do responsável/);
    fireEvent.click(screen.getByLabelText(/Sou responsável legal por Teca, autorizo esta viagem/));
    expect(seen).toHaveBeenLastCalledWith({ kind: 'dependent', dependent: 'dep', consent: true });
    expect(fundingProblem(seen.mock.lastCall![0])).toBeNull();
    expect(screen.getByText(/Só motoristas liberados pela operação/)).toBeVisible();
    expectAccessibleScreen();
  });
});
