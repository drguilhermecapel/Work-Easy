import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountInvite from '../../components/mobility/parties/AccountInvite';
import InviteRider, { SentRiderInvites } from '../../components/mobility/parties/InviteRider';
import RiderInvite from '../../components/mobility/parties/RiderInvite';
import { parties, type RiderInviteView } from '../../services/rideParties';
import { expectAccessibleScreen } from '../a11y/contract';

vi.mock('../../lib/supabase', () => ({ backendEnabled: true, supabase: null }));
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ mode: 'backend', authUser: { id: 'convidado' }, loading: false, isAuthenticated: true }),
}));
vi.mock('../../services/rideParties', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../services/rideParties')>();
  const mocked = Object.fromEntries(Object.keys(original.parties).map((name) => [name, vi.fn()]));
  return { ...original, parties: mocked as unknown as typeof original.parties };
});

const token = 'ab'.repeat(32);
const view: RiderInviteView = {
  id: 'convite-1',
  status: 'pending',
  legs: [{ seq: 1, origin: 'Saúde', destination: 'Jabaquara', pickup_at: '2090-12-01T15:00:00Z' }],
  scheduled_at: '2090-12-01T15:00:00Z',
  instructions: 'Espere na portaria.',
  expires_at: '2090-12-01T14:00:00Z',
  simulation: true,
  support: { channel: 'email', address: 'plantao@exemplo.test', team: 'Plantão de ensaio', on_duty: true },
};
const at = (route: string, node: ReactNode) => render(<MemoryRouter initialEntries={[route]}>{node}</MemoryRouter>);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(parties.riderInvites).mockResolvedValue([]);
});

describe('pedido de viagem para outro adulto', () => {
  it('gera o convite de uso único com o link #viagem= e repete a mesma chave depois de uma falha', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: copy } });
    vi.mocked(parties.inviteRider)
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValue({ id: 'convite-1', token, expires_at: '2090-12-01T14:00:00Z' });
    const issued = vi.fn();
    at('/corridas', <InviteRider quoteId="cotacao" totalCents={3250} onIssued={issued} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pedir para outra pessoa' }));
    expect(screen.getByText(/você paga até R\$\s32,50/)).toBeVisible();
    expectAccessibleScreen();
    const send = screen.getByRole('button', { name: 'Gerar convite de viagem' });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText('E-mail de quem vai viajar'), { target: { value: 'ana@exemplo.test' } });
    fireEvent.change(screen.getByLabelText('Validade do convite'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText(/Instruções para quem viaja/), { target: { value: 'Espere na portaria.' } });
    fireEvent.click(send);
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(issued).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite de viagem' }));
    const link = (await screen.findByLabelText('Link do convite')) as HTMLInputElement;
    expect(link.value).toMatch(new RegExp('/corridas/convite#viagem=' + token + '$'));
    const calls = vi.mocked(parties.inviteRider).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1].slice(0, 4)).toEqual(['cotacao', 'ana@exemplo.test', 15, 'Espere na portaria.']);
    expect(calls[1][4]).toBe(calls[0][4]);
    expect(issued).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Copiar link' }));
    await waitFor(() => expect(copy).toHaveBeenCalledWith(link.value));
    expect(await screen.findByText('Link copiado.')).toBeVisible();
  });

  it('avisa que o link só aparece uma vez quando o servidor repete o convite sem o token', async () => {
    vi.mocked(parties.inviteRider).mockResolvedValue({ id: 'convite-2', token: null, expires_at: '2090-12-01T14:00:00Z' });
    at('/corridas', <InviteRider quoteId="cotacao" totalCents={3250} />);
    fireEvent.click(screen.getByRole('button', { name: 'Pedir para outra pessoa' }));
    fireEvent.change(screen.getByLabelText('E-mail de quem vai viajar'), { target: { value: 'ana@exemplo.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar convite de viagem' }));
    expect(await screen.findByText(/o link só aparece uma vez/)).toBeVisible();
    expect(screen.queryByLabelText('Link do convite')).toBeNull();
  });

  it('lista os convites do pagador e revoga um pendente só depois da confirmação', async () => {
    vi.mocked(parties.riderInvites).mockResolvedValue([
      { id: 'pendente', status: 'pending', ceiling_cents: 3000, scheduled_at: null, expires_at: '2090-12-01T14:00:00Z', answered_at: null, created_at: '2090-12-01T13:30:00Z', ride_id: null },
      { id: 'aceito', status: 'accepted', ceiling_cents: 4100, scheduled_at: '2090-12-01T15:00:00Z', expires_at: '2090-12-01T14:00:00Z', answered_at: '2090-12-01T13:00:00Z', created_at: '2090-12-01T12:30:00Z', ride_id: 'viagem' },
    ]);
    vi.mocked(parties.revokeRiderInvite).mockResolvedValue(true);
    at('/corridas', <SentRiderInvites />);
    expect(await screen.findByText(/Aguardando resposta · você paga até R\$\s30,00/)).toBeVisible();
    expect(screen.getByText(/Para cancelar depois do aceite, use o trecho em Corridas/)).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Revogar convite' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Revogar convite' }));
    expect(parties.revokeRiderInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar revogação' }));
    await waitFor(() => expect(parties.revokeRiderInvite).toHaveBeenCalledWith('pendente'));
    expect(await screen.findByText(/Convite revogado/)).toBeVisible();
  });

  it('mostra o convite ao destinatário confirmado e aceita com a mesma chave ao repetir', async () => {
    vi.mocked(parties.riderInvite).mockResolvedValue(view);
    vi.mocked(parties.answerRiderInvite)
      .mockRejectedValueOnce(new Error('rede'))
      .mockResolvedValue({ status: 'accepted', quote_id: 'cotacao', ride_id: 'viagem' });
    at('/corridas/convite', <RiderInvite token={token} />);
    expect(await screen.findByText('Saúde → Jabaquara')).toBeVisible();
    expect(parties.riderInvite).toHaveBeenCalledWith(token);
    expect(screen.getByText(/Ambiente de ensaio/)).toBeVisible();
    expect(screen.getByText(/Espere na portaria\./)).toBeVisible();
    expect(screen.getByText(/Plantão de ensaio por e-mail: plantao@exemplo\.test · plantão em atendimento agora/)).toBeVisible();
    expect(screen.getByText(/O preço é conferido de novo no aceite/)).toBeVisible();
    expect(screen.getByText(/quem paga recebe o recibo e não vê o seu trajeto/)).toBeVisible();
    expectAccessibleScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar e pedir a viagem' }));
    expect(await screen.findByRole('alert')).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Abrir minhas corridas' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar e pedir a viagem' }));
    expect(await screen.findByRole('link', { name: 'Abrir minhas corridas' })).toHaveAttribute('href', '/corridas');
    const calls = vi.mocked(parties.answerRiderInvite).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[1].slice(0, 2)).toEqual([token, true]);
    expect(calls[1][2]).toBe(calls[0][2]);
    expect(screen.queryByRole('button', { name: 'Aceitar e pedir a viagem' })).toBeNull();
  });

  it('não mostra trajeto nem ações quando o convite não pertence a esta conta', async () => {
    vi.mocked(parties.riderInvite).mockResolvedValue(null);
    at('/corridas/convite', <RiderInvite token={token} />);
    expect(await screen.findByText(/Convite indisponível para esta conta/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aceitar e pedir a viagem' })).toBeNull();
    expect(parties.answerRiderInvite).not.toHaveBeenCalled();
  });

  it('quando o token não é um convite de viagem, mostra a outra leitura do mesmo link em vez do aviso', async () => {
    vi.mocked(parties.riderInvite).mockResolvedValue(null);
    at('/corridas/convite', <RiderInvite token={token} fallback={<p>Convite de empresa</p>} />);
    expect(await screen.findByText('Convite de empresa')).toBeVisible();
    expect(screen.queryByText(/Convite indisponível para esta conta/)).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Convite de viagem' })).toBeNull();
  });

  it('recusa só depois de confirmar e explica um convite já encerrado', async () => {
    vi.mocked(parties.riderInvite).mockResolvedValue(view);
    vi.mocked(parties.answerRiderInvite).mockResolvedValue({ status: 'declined', quote_id: null, ride_id: null });
    const first = at('/corridas/convite', <RiderInvite token={token} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Recusar convite' }));
    expect(parties.answerRiderInvite).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recusa' }));
    await waitFor(() => expect(parties.answerRiderInvite).toHaveBeenCalledWith(token, false, expect.any(String)));
    expect(await screen.findByText(/Nenhuma viagem foi pedida/)).toBeVisible();
    first.unmount();
    // A closed invite comes without legs and without instructions
    vi.mocked(parties.riderInvite).mockResolvedValue({ ...view, status: 'revoked', legs: [], instructions: null });
    at('/corridas/convite', <RiderInvite token={token} />);
    expect(await screen.findByText('Quem convidou revogou este convite.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aceitar e pedir a viagem' })).toBeNull();
  });
});

describe('convite de adesão', () => {
  const invite = {
    id: 'convite',
    account_name: 'Família Teste',
    kind: 'family' as const,
    role: 'member' as const,
    expires_at: '2090-12-01T14:00:00Z',
    simulation: true,
  };

  it('diz de qual grupo e papel é o convite, aceita a entrada e leva aos grupos', async () => {
    vi.mocked(parties.accountInvite).mockResolvedValue(invite);
    vi.mocked(parties.joinAccount).mockResolvedValue('accepted');
    at('/corridas/convite', <AccountInvite token={token} />);
    expect(await screen.findByRole('heading', { name: 'Convite para o grupo familiar' })).toBeVisible();
    expect(parties.accountInvite).toHaveBeenCalledWith(token);
    expect(screen.getByText(/convidou você como participante/)).toHaveTextContent('Família Teste');
    expect(screen.getByText(/quem administra paga dentro dos limites/)).toBeVisible();
    expect(screen.getByText(/Ambiente de ensaio/)).toBeVisible();
    expectAccessibleScreen();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar convite' }));
    expect(await screen.findByRole('link', { name: 'Abrir grupos e pessoas de confiança' })).toHaveAttribute(
      'href',
      '/corridas/grupos',
    );
    expect(parties.joinAccount).toHaveBeenCalledWith(token, true);
    expect(parties.answerCompanion).not.toHaveBeenCalled();
  });

  it('leva à área da empresa quando o convite é de uma organização', async () => {
    vi.mocked(parties.accountInvite).mockResolvedValue({ ...invite, kind: 'organization', role: 'approver', simulation: false });
    vi.mocked(parties.joinAccount).mockResolvedValue('accepted');
    at('/corridas/convite', <AccountInvite token={token} />);
    expect(await screen.findByRole('heading', { name: 'Convite de uma empresa' })).toBeVisible();
    expect(screen.getByText(/convidou você como aprovador/)).toBeVisible();
    expect(screen.queryByText(/Ambiente de ensaio/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar convite' }));
    expect(await screen.findByRole('link', { name: 'Abrir a área da empresa' })).toHaveAttribute('href', '/corridas/empresa');
  });

  it('não oferece ações quando o convite não é desta conta', async () => {
    vi.mocked(parties.accountInvite).mockResolvedValue(null);
    at('/corridas/convite', <AccountInvite token={token} />);
    expect(await screen.findByText(/Convite indisponível para esta conta/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aceitar convite' })).toBeNull();
    expect(parties.joinAccount).not.toHaveBeenCalled();
  });

  const companion = {
    id: 'acompanhante',
    owner_label: 'Dona Lia',
    notices: ['arriving', 'completed'],
    pays: true,
    ceiling_cents: 15000,
    expires_at: '2090-12-01T14:00:00Z',
    simulation: true,
  };

  it('quando o token é um convite de acompanhante, mostra quem convida, os avisos e o teto antes do aceite', async () => {
    vi.mocked(parties.accountInvite).mockResolvedValue(null);
    vi.mocked(parties.companionInvite).mockResolvedValue(companion);
    vi.mocked(parties.answerCompanion).mockResolvedValue('accepted');
    at('/corridas/convite', <AccountInvite token={token} />);
    expect(await screen.findByRole('heading', { name: 'Convite para acompanhar uma pessoa' })).toBeVisible();
    expect(parties.companionInvite).toHaveBeenCalledWith(token);
    expect(screen.getByText(/convidou você para acompanhar/)).toHaveTextContent('Dona Lia');
    expect(screen.getByText('Você recebe estes avisos: motorista a caminho, chegada ao destino.')).toBeVisible();
    expect(screen.getByText(/Você paga as corridas de Dona Lia, até R\$\s150,00 por corrida/)).toBeVisible();
    expect(screen.getByText(/sem o trajeto e sem o código de embarque/)).toBeVisible();
    expectAccessibleScreen();
    expect(parties.answerCompanion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Aceitar e pagar as corridas' }));
    await waitFor(() => expect(parties.answerCompanion).toHaveBeenCalledWith(token, true));
    expect(parties.joinAccount).not.toHaveBeenCalled();
    expect(await screen.findByRole('link', { name: 'Abrir grupos e pessoas de confiança' })).toHaveAttribute('href', '/corridas/grupos');
  });

  it('um convite de acompanhante sem pagamento diz que nada é cobrado e pede confirmação para recusar', async () => {
    vi.mocked(parties.accountInvite).mockResolvedValue(null);
    vi.mocked(parties.companionInvite).mockResolvedValue({ ...companion, pays: false, ceiling_cents: null });
    vi.mocked(parties.answerCompanion).mockResolvedValue('declined');
    at('/corridas/convite', <AccountInvite token={token} />);
    expect(await screen.findByText(/Você não paga nada: Dona Lia continua pagando as próprias corridas/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Recusar convite' }));
    expect(parties.answerCompanion).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar recusa' }));
    await waitFor(() => expect(parties.answerCompanion).toHaveBeenCalledWith(token, false));
    expect(parties.joinAccount).not.toHaveBeenCalled();
    expect(await screen.findByText(/Nada mudou na sua conta/)).toBeVisible();
  });

  it('sem token no link, orienta a abrir o convite de novo e não oferece ações', () => {
    at('/corridas/convite', <AccountInvite token="" />);
    expect(screen.getByText(/Abra novamente o link recebido/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Aceitar convite' })).toBeNull();
    expect(parties.accountInvite).not.toHaveBeenCalled();
    expect(parties.companionInvite).not.toHaveBeenCalled();
  });
});
