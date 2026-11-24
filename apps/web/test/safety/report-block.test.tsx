import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { profileRow, type FakeSupabase } from '../web/fakeSupabase';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { AuthProvider } = await import('../../contexts/AuthContext');
const { default: ReportButton } = await import('../../components/ReportButton');
const { default: BlockButton } = await import('../../components/BlockButton');
const { default: PilotWaitlist } = await import('../../components/cliente/PilotWaitlist');
const { default: ExcluirConta } = await import('../../pages/conta/ExcluirConta');
const { blockProvider } = await import('../../services/safety');
const fake = supabase as unknown as FakeSupabase;

const USER_ID = 'user-1';
const PROVIDER_ID = 'prov-9';

const signIn = () => {
  fake.session = { access_token: 'token', user: { id: USER_ID, email: 'maria@example.com' } };
  fake.tables = { profiles: () => ({ data: profileRow(USER_ID), error: null }) };
  fake.rpcs = { is_admin: () => ({ data: false, error: null }) };
};

const show = (node: React.ReactNode, path = '/p/ana') =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>
    </AuthProvider>,
  );

beforeEach(() => fake.reset());

describe('ReportButton', () => {
  it('sends a visitor to sign in, and back to the page', async () => {
    const user = userEvent.setup();
    show(<ReportButton target={{ type: 'provider', providerId: PROVIDER_ID }} label="Denunciar este perfil" />);
    await user.click(await screen.findByRole('button', { name: 'Denunciar este perfil' }));
    expect(screen.getByRole('link', { name: 'Entre na sua conta para denunciar' })).toHaveAttribute('href', '/entrar?next=%2Fp%2Fana');
    expect(fake.rpcCalls.some(call => call.name === 'report_content')).toBe(false);
  });

  it('reports a profile with the reason and the trimmed account of what happened', async () => {
    signIn();
    fake.rpcs.report_content = () => ({ data: 'rep-1', error: null });
    const user = userEvent.setup();
    show(<ReportButton target={{ type: 'provider', providerId: PROVIDER_ID }} label="Denunciar este perfil" />);
    await user.click(await screen.findByRole('button', { name: 'Denunciar este perfil' }));
    const send = await screen.findByRole('button', { name: 'Enviar denúncia' });
    expect(send).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Motivo'), 'fraude');
    await user.type(screen.getByLabelText(/O que aconteceu/), '  Pediu pagamento por fora.  ');
    await user.click(send);
    expect(await screen.findByRole('status')).toHaveTextContent('Denúncia recebida');
    expect(fake.rpcCalls.find(call => call.name === 'report_content')?.args).toEqual({
      p_type: 'provider',
      p_target: PROVIDER_ID,
      p_reason: 'fraude',
      p_details: 'Pediu pagamento por fora.',
    });
  });

  it('reports a review by the provider and the instant it was written, the only handle the public page has', async () => {
    signIn();
    fake.rpcs.report_review = () => ({ data: 'rep-2', error: null });
    const user = userEvent.setup();
    show(<ReportButton target={{ type: 'review', providerId: PROVIDER_ID, createdAt: '2030-01-02T10:00:00Z' }} label="Denunciar esta avaliação" />);
    await user.click(await screen.findByRole('button', { name: 'Denunciar esta avaliação' }));
    await user.selectOptions(await screen.findByLabelText('Motivo'), 'ofensivo');
    await user.click(screen.getByRole('button', { name: 'Enviar denúncia' }));
    await screen.findByRole('status');
    expect(fake.rpcCalls.find(call => call.name === 'report_review')?.args).toEqual({
      p_provider: PROVIDER_ID,
      p_created_at: '2030-01-02T10:00:00Z',
      p_reason: 'ofensivo',
      p_details: null,
    });
  });

  it('shows the sentence of the daily limit and keeps the form', async () => {
    signIn();
    fake.rpcs.report_content = () => ({ data: null, error: { code: 'P0001', message: 'report_limit' } });
    const user = userEvent.setup();
    show(<ReportButton target={{ type: 'request', requestId: 'req-1' }} label="Denunciar este pedido" />);
    await user.click(await screen.findByRole('button', { name: 'Denunciar este pedido' }));
    await user.selectOptions(await screen.findByLabelText('Motivo'), 'spam');
    await user.click(screen.getByRole('button', { name: 'Enviar denúncia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Você já fez muitas denúncias hoje');
    expect(screen.getByRole('button', { name: 'Enviar denúncia' })).toBeInTheDocument();
  });
});

describe('BlockButton', () => {
  it('is not offered to a visitor', async () => {
    show(<BlockButton onBlock={() => blockProvider(PROVIDER_ID)} label="Bloquear este profissional" consequence="Some da busca." />);
    await screen.findByText(() => true, { selector: 'div' }).catch(() => null);
    expect(screen.queryByRole('button', { name: 'Bloquear este profissional' })).toBeNull();
  });

  it('says what changes, blocks only after the confirmation, and tells where to undo it', async () => {
    signIn();
    const user = userEvent.setup();
    const blocked = vi.fn();
    show(
      <BlockButton
        onBlock={() => blockProvider(PROVIDER_ID)}
        label="Bloquear este profissional"
        consequence="Ana deixa de aparecer nas suas buscas."
        onBlocked={blocked}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Bloquear este profissional' }));
    expect(screen.getByText('Ana deixa de aparecer nas suas buscas.')).toBeInTheDocument();
    expect(fake.rpcCalls.some(call => call.name === 'block_provider')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Confirmar bloqueio' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Para desfazer, abra Minha conta');
    expect(fake.rpcCalls.find(call => call.name === 'block_provider')?.args).toEqual({ p_provider: PROVIDER_ID });
    expect(blocked).toHaveBeenCalledTimes(1);
  });

  it('can be cancelled without blocking', async () => {
    signIn();
    const user = userEvent.setup();
    show(<BlockButton onBlock={() => blockProvider(PROVIDER_ID)} label="Bloquear este profissional" consequence="Some da busca." />);
    await user.click(await screen.findByRole('button', { name: 'Bloquear este profissional' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('button', { name: 'Bloquear este profissional' })).toBeInTheDocument();
    expect(fake.rpcCalls.some(call => call.name === 'block_provider')).toBe(false);
  });
});

describe('PilotWaitlist', () => {
  const OPTIONS = [
    { value: 'n-lapa', name: 'Lapa' },
    { value: 'n-mooca', name: 'Mooca' },
  ];

  it('asks a visitor to sign in before joining the list', async () => {
    const user = userEvent.setup();
    show(<PilotWaitlist options={OPTIONS} occupationSlug="diarista" userId={null} />, '/pedido');
    await user.click(screen.getByText('Meu bairro não está na lista'));
    expect(screen.getByRole('link', { name: /Entre na sua conta/ })).toHaveAttribute('href', '/entrar?next=%2Fpedido');
  });

  it('records the neighborhood and the service wanted, and promises no date', async () => {
    signIn();
    const user = userEvent.setup();
    show(<PilotWaitlist options={OPTIONS} occupationSlug="diarista" userId={USER_ID} />, '/pedido');
    await user.click(screen.getByText('Meu bairro não está na lista'));
    expect(screen.getByText(/Ainda não há data/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Seu bairro'), 'n-mooca');
    await user.click(screen.getByRole('button', { name: 'Entrar na lista de espera' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Mooca está na sua lista de espera');
    expect(fake.tableCalls.find(call => call.table === 'waitlist_entries' && call.op === 'insert')?.payload).toEqual({
      user_id: USER_ID,
      neighborhood_id: 'n-mooca',
      occupation_slug: 'diarista',
    });
  });

  it('treats a repeated entry as done', async () => {
    signIn();
    fake.tables.waitlist_entries = () => ({ data: null, error: { code: '23505', message: 'duplicate key value' } });
    const user = userEvent.setup();
    show(<PilotWaitlist options={OPTIONS} occupationSlug={null} userId={USER_ID} />, '/pedido');
    await user.click(screen.getByText('Meu bairro não está na lista'));
    await user.selectOptions(screen.getByLabelText('Seu bairro'), 'n-lapa');
    await user.click(screen.getByRole('button', { name: 'Entrar na lista de espera' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Lapa está na sua lista de espera');
  });
});

describe('/excluir-conta', () => {
  it('explains, without a session, how to delete the account, what is erased and what is kept', async () => {
    show(<ExcluirConta />, '/excluir-conta');
    expect(await screen.findByRole('heading', { level: 1, name: 'Excluir a conta do WorkEasy' })).toBeInTheDocument();
    for (const name of ['Como excluir', 'O que é apagado', 'O que continua guardado', 'Não consegue entrar na conta?']) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Entrar e abrir Minha conta' })).toHaveAttribute('href', '/entrar?next=%2Fconta');
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacidade');
    // nothing was read from the database to show it
    expect(fake.tableCalls).toEqual([]);
  });
});
