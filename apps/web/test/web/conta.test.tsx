import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CONSENT_VERSIONS } from '../../config/legal';
import { profileRow, type FakeSupabase, type TableCall } from './fakeSupabase';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('./fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { AuthProvider, useAuth } = await import('../../contexts/AuthContext');
const { default: Conta } = await import('../../pages/conta/Conta');
const { default: Entrar } = await import('../../pages/conta/Entrar');
const { deleteMyAccount } = await import('../../services/account');
const fake = supabase as unknown as FakeSupabase;

const USER_ID = 'user-1';

/** What the demo screens (Navbar, Dashboard) read from the context. */
const DemoProbe = () => {
  const auth = useAuth();
  return (
    <p>
      persona={auth.user.name}; conta={auth.mode === 'backend' ? auth.authUser?.email : '-'}
    </p>
  );
};

const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/conta" element={<Conta />} />
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/" element={<p>Início</p>} />
          <Route path="/demo" element={<DemoProbe />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

describe('/conta with a backend (simulated Supabase client)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    fake.reset();
    fake.tables = {
      profiles: () => ({ data: profileRow(USER_ID), error: null }),
      providers: () => ({ data: null, error: null }),
      consents: (call: TableCall) =>
        call.op === 'insert'
          ? { data: { id: 'c-new', at: '2030-01-01T12:00:00Z', ...(call.payload as object) }, error: null }
          : { data: [], error: null },
    };
    fake.rpcs = { is_admin: () => ({ data: false, error: null }) };
  });

  it('sends visitors to /entrar', async () => {
    renderAt('/conta');
    expect(await screen.findByRole('heading', { name: /Entrar/ })).toBeInTheDocument();
  });

  it('requires typing EXCLUIR before deleting the account', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    sessionStorage.setItem('workeasy:pedido-rascunho', JSON.stringify({ description: 'Faxina na casa da Maria' }));
    const user = userEvent.setup();
    renderAt('/conta');

    expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeInTheDocument();
    expect(await screen.findByLabelText('Nome completo')).toHaveValue('Maria Teste');
    expect(screen.getByText(/lei fiscal obriga/)).toBeInTheDocument();

    const button = screen.getByRole('button', { name: /Excluir minha conta/ });
    const input = screen.getByLabelText(/Para confirmar, digite EXCLUIR/);
    expect(button).toBeDisabled();
    await user.type(input, 'excluir');
    expect(button).toBeDisabled();
    await user.click(button);
    expect(fake.functionCalls).toEqual([]);

    await user.clear(input);
    await user.type(input, 'EXCLUIR');
    expect(button).toBeEnabled();
    await user.click(button);

    expect(await screen.findByText('Conta excluída')).toBeInTheDocument();
    expect(sessionStorage.getItem('workeasy:pedido-rascunho')).toBeNull();
    expect(fake.functionCalls).toEqual([{ name: 'account-delete', body: { confirm: 'EXCLUIR' } }]);
    await waitFor(() => expect(fake.authCalls.some(c => c.method === 'signOut')).toBe(true));
  });

  it('keeps the demo persona for the demo screens, apart from the real account', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    renderAt('/demo');
    expect(await screen.findByText('persona=Maria Cliente; conta=maria@example.com')).toBeInTheDocument();
  });

  it('saves the phone in E.164 and shows it formatted', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    fake.tables.profiles = (call: TableCall) =>
      call.op === 'update'
        ? { data: profileRow(USER_ID, call.payload as Record<string, unknown>), error: null }
        : { data: profileRow(USER_ID, { phone: '+5511987654321' }), error: null };
    const user = userEvent.setup();
    renderAt('/conta');
    const phone = await screen.findByLabelText('Telefone com DDD');
    expect(phone).toHaveValue('(11) 98765-4321');

    await user.clear(phone);
    await user.type(phone, 'meu número');
    await user.click(screen.getByRole('button', { name: 'Salvar dados' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira o número de telefone informado');
    expect(fake.tableCalls.some(c => c.table === 'profiles' && c.op === 'update')).toBe(false);

    await user.clear(phone);
    await user.type(phone, '(21) 99876-5432');
    await user.click(screen.getByRole('button', { name: 'Salvar dados' }));
    expect(await screen.findByText('Dados salvos.')).toBeInTheDocument();
    const update = fake.tableCalls.find(c => c.table === 'profiles' && c.op === 'update');
    expect(update?.payload).toMatchObject({ phone: '+5521998765432' });
  });

  it('asks for the terms on /conta when they were never recorded (e.g. sign-in by e-mail link)', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    renderAt('/conta');
    expect(await screen.findByText(/aceite a versão atual dos termos/)).toBeInTheDocument();
    // LGPD rights do not depend on accepting: export and deletion stay available
    expect(screen.getByRole('button', { name: /Baixar meus dados/ })).toBeInTheDocument();
  });

  it('keeps an account without the declaration of 18 years at the gate until it makes it', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    // Terms and privacy were accepted in their current versions; the declaration of age was never made
    const history: Array<Record<string, unknown>> = [
      { id: 'c-terms', user_id: USER_ID, purpose: 'terms', version: CONSENT_VERSIONS.terms, granted: true, at: '2030-01-01T10:00:00Z' },
      { id: 'c-privacy', user_id: USER_ID, purpose: 'privacy', version: CONSENT_VERSIONS.privacy, granted: true, at: '2030-01-01T10:00:00Z' },
    ];
    fake.tables.consents = (call: TableCall) => {
      if (call.op !== 'insert') return { data: history, error: null };
      const row = { id: 'c-new', at: '2030-01-02T10:00:00Z', ...(call.payload as object) };
      history.unshift(row);
      return { data: row, error: null };
    };
    const user = userEvent.setup();
    renderAt('/conta');
    expect(await screen.findByText(/confirme a declaração abaixo/)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Li e aceito/ })).not.toBeInTheDocument();
    const accept = screen.getByRole('button', { name: 'Aceitar e continuar' });
    expect(accept).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'Declaro que tenho 18 anos completos.' }));
    await user.click(accept);

    expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeInTheDocument();
    const inserts = fake.tableCalls.filter(c => c.table === 'consents' && c.op === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({ purpose: 'age_declaration', granted: true, version: CONSENT_VERSIONS.age_declaration });
  });

  it('clears the request draft on sign-out', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    sessionStorage.setItem('workeasy:pedido-rascunho', JSON.stringify({ description: 'Faxina na casa da Maria' }));
    const user = userEvent.setup();
    renderAt('/conta');
    await user.click(await screen.findByRole('button', { name: /Sair/ }));
    expect(await screen.findByText('Início')).toBeInTheDocument();
    expect(sessionStorage.getItem('workeasy:pedido-rascunho')).toBeNull();
  });

  it('refuses to call account-delete without the confirmation word', async () => {
    await expect(deleteMyAccount('excluir')).rejects.toMatchObject({ code: 'invalid_input' });
    expect(fake.functionCalls).toEqual([]);
  });

  it('records a consent decision as a new history row', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    const user = userEvent.setup();
    renderAt('/conta');
    const marketing = await screen.findByText('Comunicações de novidades');
    const row = marketing.closest('li') as HTMLElement;
    await user.click(row.querySelector('button') as HTMLElement);
    await waitFor(() => {
      const insert = fake.tableCalls.find(c => c.table === 'consents' && c.op === 'insert');
      expect(insert?.payload).toMatchObject({ purpose: 'marketing', granted: true });
      // the database fills user_id and grants insert only on purpose/version/granted
      expect(insert?.payload).not.toHaveProperty('user_id');
    });
    expect(fake.tableCalls.some(c => c.table === 'consents' && c.op === 'update')).toBe(false);
  });

  it('says what withdrawing the background-check consent does and does not do', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    renderAt('/conta');
    const row = (await screen.findByText('Consulta de antecedentes')).closest('li') as HTMLElement;
    expect(row).toHaveTextContent('A retirada fica registrada, mas não apaga a certidão já enviada nem muda quem pode vê-la.');
    expect(row).toHaveTextContent('Você remove a certidão no cadastro só enquanto ele está em rascunho e a certidão ainda não foi analisada.');
    expect(row).toHaveTextContent('Depois do envio para análise, você não consegue removê-la; a exclusão da sua conta também apaga a certidão.');
  });

  it('shows a clear message when the account export fails', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    fake.functionsHandlers['account-export'] = () => ({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'non-2xx',
        context: new Response('{"ok":false,"error":{"code":"not_allowed","message":"Você não tem permissão para esta ação."}}', {
          status: 403,
        }),
      },
    });
    const user = userEvent.setup();
    renderAt('/conta');
    await user.click(await screen.findByRole('button', { name: /Baixar meus dados/ }));
    expect(await screen.findByText('Você não tem permissão para fazer isso.')).toBeInTheDocument();
  });

  it('says when part of the account export could not be read', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    fake.functionsHandlers['account-export'] = () => ({
      data: { ok: true, data: { format: 'workeasy-lgpd-export', version: 1, data: {}, unavailable: ['payments'] } },
      error: null,
    });
    Object.assign(URL, { createObjectURL: () => 'blob:test', revokeObjectURL: () => {} });
    const user = userEvent.setup();
    renderAt('/conta');
    await user.click(await screen.findByRole('button', { name: /Baixar meus dados/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Parte dos seus dados não pôde ser incluída no arquivo/);
  });

  it('explains when account-delete says the confirmation is missing', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    fake.functionsHandlers['account-delete'] = () => ({
      data: null,
      error: {
        name: 'FunctionsHttpError',
        message: 'non-2xx',
        context: new Response('{"ok":false,"error":{"code":"confirmation_required","message":"Envie a confirmação."}}', {
          status: 400,
        }),
      },
    });
    const user = userEvent.setup();
    renderAt('/conta');
    await user.type(await screen.findByLabelText(/Para confirmar, digite EXCLUIR/), 'EXCLUIR');
    await user.click(screen.getByRole('button', { name: /Excluir minha conta/ }));
    expect(await screen.findByText('Confira os dados informados e tente de novo.')).toBeInTheDocument();
    expect(screen.queryByText('Conta excluída')).not.toBeInTheDocument();
  });
});

describe('/entrar with a backend', () => {
  beforeEach(() => {
    fake.reset();
    fake.tables = {
      profiles: () => ({ data: profileRow('user-otp'), error: null }),
      consents: (call: TableCall) =>
        call.op === 'insert' ? { data: { id: 'c', at: '2030-01-01T00:00:00Z', ...(call.payload as object) }, error: null } : { data: [], error: null },
    };
  });

  /** Both boxes of the sign-in screen: the terms and the declaration of 18 years or more. */
  const acceptBoxes = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Declaro que tenho 18 anos completos.' }));
  };

  it('signs in with an e-mail code and records terms, privacy and the declaration of 18 years', async () => {
    const user = userEvent.setup();
    renderAt('/entrar?next=%2Fconta');
    await user.type(await screen.findByLabelText('Seu e-mail'), ' Maria@Example.com ');
    const send = screen.getByRole('button', { name: 'Enviar código' });
    expect(send).toBeDisabled(); // no box checked yet
    await user.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
    expect(send).toBeDisabled(); // the declaration of 18 years is still missing
    await user.click(send);
    expect(fake.authCalls).toEqual([]);
    await user.click(screen.getByRole('checkbox', { name: 'Declaro que tenho 18 anos completos.' }));
    await user.click(send);
    expect(fake.authCalls[0]).toMatchObject({ method: 'signInWithOtp', args: { email: 'maria@example.com' } });

    await user.type(await screen.findByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeInTheDocument();
    expect(fake.authCalls[1]).toMatchObject({ method: 'verifyOtp', args: { email: 'maria@example.com', token: '123456', type: 'email' } });
    const purposes = fake.tableCalls.filter(c => c.table === 'consents' && c.op === 'insert').map(c => (c.payload as { purpose: string }).purpose);
    expect(purposes).toEqual(['terms', 'privacy', 'age_declaration']);
    const age = fake.tableCalls.find(c => c.table === 'consents' && c.op === 'insert' && (c.payload as { purpose: string }).purpose === 'age_declaration');
    expect(age?.payload).toMatchObject({ granted: true, version: CONSENT_VERSIONS.age_declaration });
  });

  it('rejects an invalid phone or a landline before calling Supabase', async () => {
    const user = userEvent.setup();
    renderAt('/entrar');
    await user.click(await screen.findByRole('button', { name: /Celular/ }));
    const input = screen.getByLabelText('Seu celular com DDD');
    await user.type(input, '98765');
    await acceptBoxes(user);
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confira o número de telefone informado');

    await user.clear(input);
    await user.type(input, '(11) 3456-7890');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use um número de celular');
    expect(fake.authCalls).toEqual([]);
  });

  it('does not go on when recording the terms acceptance fails, and lets the user retry', async () => {
    let failInsert = true;
    fake.tables.consents = (call: TableCall) => {
      if (call.op !== 'insert') return { data: [], error: null };
      if (failInsert) return { data: null, error: { name: 'TypeError', message: 'Failed to fetch' } };
      return { data: { id: 'c', at: '2030-01-01T00:00:00Z', ...(call.payload as object) }, error: null };
    };
    const user = userEvent.setup();
    renderAt('/entrar?next=%2Fconta');
    await user.type(await screen.findByLabelText('Seu e-mail'), 'maria@example.com');
    await acceptBoxes(user);
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    await user.type(await screen.findByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText(/não conseguimos registrar o aceite/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível falar com o servidor');
    expect(screen.queryByRole('heading', { name: 'Minha conta' })).not.toBeInTheDocument();

    failInsert = false;
    await user.click(screen.getByRole('button', { name: 'Tentar registrar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Minha conta' })).toBeInTheDocument();
  });
});
