import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { isEq, profileRow, type FakeSupabase, type TableCall } from './fakeSupabase';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('./fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { CONSENT_VERSIONS } = await import('../../config/legal');
const { AuthProvider } = await import('../../contexts/AuthContext');
const { default: Pedido } = await import('../../pages/cliente/Pedido');
const { default: PedidoDetalhe } = await import('../../pages/cliente/PedidoDetalhe');
const fake = supabase as unknown as FakeSupabase;

const USER_ID = 'user-1';
const REQUEST = {
  id: 'req-1',
  client_id: USER_ID,
  occupation_slug: 'diarista',
  neighborhood_id: 'nb-pinheiros',
  description: 'Faxina de apartamento de 2 quartos',
  preferred_dates: null,
  urgent: false,
  status: 'open',
  expires_at: '2030-01-08T12:00:00Z',
  created_at: '2030-01-01T12:00:00Z',
};
const PROPOSAL = {
  id: 'prop-1',
  request_id: 'req-1',
  provider_id: 'prov-1',
  price_cents: 18000,
  message: 'Posso ir no sábado.',
  valid_until: null,
  status: 'sent',
  created_at: '2030-01-01T13:00:00Z',
};

const tables = (): FakeSupabase['tables'] => ({
  profiles: () => ({ data: profileRow(USER_ID), error: null }),
  providers: (call: TableCall) =>
    call.filters.some(([op]) => op === 'in')
      ? { data: [{ id: 'prov-1', display_name: 'Ana Diarista', slug: 'ana-diarista' }], error: null }
      : { data: null, error: null },
  neighborhoods: () => ({
    data: [
      { id: 'nb-lapa', city: 'São Paulo', name: 'Lapa', slug: 'lapa', zone: 'Oeste' },
      { id: 'nb-pinheiros', city: 'São Paulo', name: 'Pinheiros', slug: 'pinheiros', zone: 'Oeste' },
    ],
    error: null,
  }),
  requests: (call: TableCall) =>
    call.op === 'insert'
      ? { data: { ...REQUEST, ...(call.payload as object) }, error: null }
      : { data: isEq(call, 'id', 'req-1') ? REQUEST : [REQUEST], error: null },
  proposals: () => ({ data: [PROPOSAL], error: null }),
  consents: (call: TableCall) =>
    call.op === 'insert'
      ? { data: { id: 'c-new', at: '2030-01-01T12:00:00Z', ...(call.payload as object) }, error: null }
      : { data: ACCEPTED_TERMS, error: null },
});

const ACCEPTED_TERMS = (['terms', 'privacy'] as const).map(purpose => ({
  id: `c-${purpose}`,
  user_id: USER_ID,
  purpose,
  version: CONSENT_VERSIONS[purpose],
  granted: true,
  at: '2030-01-01T10:00:00Z',
}));

const fillRequest = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('button', { name: 'Continuar' }));
  await user.selectOptions(await screen.findByLabelText(/Bairro onde/), 'Pinheiros');
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  fireEvent.change(screen.getByLabelText('Descreva o que você precisa'), { target: { value: 'Faxina de apartamento de 2 quartos' } });
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
};

const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/pedido" element={<Pedido />} />
          <Route path="/pedidos/:id" element={<PedidoDetalhe />} />
          <Route path="/entrar" element={<p>Tela de entrar</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

describe('/pedido with a backend (simulated Supabase client)', () => {
  // The device is far from Brasília: typed times must still be São Paulo time
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Tokyo';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  beforeEach(() => {
    sessionStorage.clear();
    fake.reset();
    fake.tables = tables();
    fake.rpcs = { is_admin: () => ({ data: false, error: null }), accept_proposal: () => ({ data: 'booking-1', error: null }) };
  });

  it('asks to sign in before sending, keeping the draft', async () => {
    const user = userEvent.setup();
    renderAt('/pedido?servico=diarista');
    await fillRequest(user);
    const link = await screen.findByRole('link', { name: 'Entrar para enviar' });
    expect(link).toHaveAttribute('href', '/entrar?next=%2Fpedido');
    expect(JSON.parse(sessionStorage.getItem('workeasy:pedido-rascunho') ?? '{}')).toMatchObject({
      occupationSlug: 'diarista',
      neighborhood: 'nb-pinheiros',
    });
  });

  it('creates the request, opens it and accepts a proposal with the chosen period', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    const user = userEvent.setup();
    renderAt('/pedido?servico=diarista');

    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.selectOptions(await screen.findByLabelText(/Bairro onde/), 'Pinheiros');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    fireEvent.change(screen.getByLabelText('Descreva o que você precisa'), { target: { value: 'Faxina de apartamento de 2 quartos' } });
    await user.type(screen.getByLabelText(/Quando\?/), 'sábado');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByLabelText('Seu nome')).toHaveValue('Maria Teste');
    await user.click(screen.getByRole('button', { name: /Enviar pedido/ }));

    // The request page loads after the insert
    expect(await screen.findByText('Propostas recebidas (1)')).toBeInTheDocument();
    const insert = fake.tableCalls.find(c => c.table === 'requests' && c.op === 'insert');
    expect(insert?.payload).toEqual({
      client_id: USER_ID,
      occupation_slug: 'diarista',
      neighborhood_id: 'nb-pinheiros',
      description: 'Faxina de apartamento de 2 quartos',
      preferred_dates: 'sábado',
      urgent: false,
    });
    // Name and phone did not change, so the profile is not written
    expect(fake.tableCalls.some(c => c.table === 'profiles' && c.op === 'update')).toBe(false);
    expect(sessionStorage.getItem('workeasy:pedido-rascunho')).toBeNull();

    expect(screen.getByText('Ana Diarista')).toBeInTheDocument();
    expect(screen.getByText('R$ 180,00')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aceitar proposta' }));
    fireEvent.change(screen.getByLabelText('Dia'), { target: { value: '2030-01-15' } });
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Término'), { target: { value: '13:00' } });
    await user.click(screen.getByRole('button', { name: 'Confirmar e aceitar' }));

    expect(await screen.findByText(/Proposta aceita/)).toBeInTheDocument();
    const accept = fake.rpcCalls.find(c => c.name === 'accept_proposal');
    // 09:00-13:00 in São Paulo (UTC-3), not in the device zone (Tokyo)
    expect(accept?.args).toEqual({
      p_proposal: 'prop-1',
      p_period: '[2030-01-15T12:00:00.000Z,2030-01-15T16:00:00.000Z)',
    });
    expect(screen.getByRole('link', { name: 'Ver atendimento' })).toHaveAttribute('href', '/atendimentos/booking-1');
  });

  it('shows the database rule in pt-BR when accepting fails', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID } };
    fake.rpcs.accept_proposal = () => ({ data: null, error: { code: 'P0001', message: 'labor_lock' } });
    const user = userEvent.setup();
    renderAt('/pedidos/req-1');
    await user.click(await screen.findByRole('button', { name: 'Aceitar proposta' }));
    fireEvent.change(screen.getByLabelText('Dia'), { target: { value: '2030-01-15' } });
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Término'), { target: { value: '13:00' } });
    await user.click(screen.getByRole('button', { name: 'Confirmar e aceitar' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('emprego doméstico'));
  });

  it('asks for the current terms before creating a request when they were not recorded', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID, email: 'maria@example.com' } };
    let history: unknown[] = [];
    fake.tables.consents = (call: TableCall) => {
      if (call.op !== 'insert') return { data: history, error: null };
      const row = { id: `c-${history.length}`, at: '2030-01-01T12:00:00Z', ...(call.payload as object) };
      history = [row, ...history];
      return { data: row, error: null };
    };
    const user = userEvent.setup();
    renderAt('/pedido?servico=diarista');
    await fillRequest(user);

    expect(await screen.findByText(/aceite a versão atual dos termos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Enviar pedido/ })).not.toBeInTheDocument();
    const accept = screen.getByRole('button', { name: 'Aceitar e continuar' });
    expect(accept).toBeDisabled();
    await user.click(screen.getByRole('checkbox'));
    await user.click(accept);

    expect(await screen.findByRole('button', { name: /Enviar pedido/ })).toBeInTheDocument();
    const purposes = fake.tableCalls.filter(c => c.table === 'consents' && c.op === 'insert').map(c => (c.payload as { purpose: string }).purpose);
    expect(purposes).toEqual(['terms', 'privacy']);
    expect(fake.tableCalls.some(c => c.table === 'requests' && c.op === 'insert')).toBe(false);
  });

  it('keeps the accepted notice when reloading the request fails after accepting', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID } };
    const user = userEvent.setup();
    renderAt('/pedidos/req-1');
    await user.click(await screen.findByRole('button', { name: 'Aceitar proposta' }));
    fireEvent.change(screen.getByLabelText('Dia'), { target: { value: '2030-01-15' } });
    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Término'), { target: { value: '13:00' } });
    fake.tables.requests = () => ({ data: null, error: { name: 'TypeError', message: 'Failed to fetch' } });
    await user.click(screen.getByRole('button', { name: 'Confirmar e aceitar' }));

    expect(await screen.findByText(/Proposta aceita/)).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível falar com o servidor');
    expect(screen.getByRole('link', { name: 'Ver atendimento' })).toHaveAttribute('href', '/atendimentos/booking-1');
    // The request already shown stays on screen
    expect(screen.getByRole('heading', { name: 'Diarista' })).toBeInTheDocument();
  });

  it('shows a plain valid_until date as written and still valid on that day', async () => {
    fake.session = { access_token: 't', user: { id: USER_ID } };
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2030-01-10T23:00:00-03:00'));
    try {
      fake.tables.proposals = () => ({ data: [{ ...PROPOSAL, valid_until: '2030-01-10' }], error: null });
      renderAt('/pedidos/req-1');
      expect(await screen.findByText(/válida até 10\/01\/2030/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Aceitar proposta' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
