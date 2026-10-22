import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CLIENT_ID, newWorld, noAdmin, worldTables, type FakeSupabase } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { AuthProvider } = await import('../../contexts/AuthContext');
const { default: PaginaPrestador } = await import('../../pages/publico/PaginaPrestador');
const { default: Agendar } = await import('../../pages/publico/Agendar');
const fake = supabase as unknown as FakeSupabase;

const PROVIDER_ID = 'prov-1';

const page = (overrides: Record<string, unknown> = {}) => ({
  provider: {
    id: PROVIDER_ID,
    display_name: 'Ana Diarista',
    slug: 'ana-diarista',
    bio: 'Dez anos de experiência com limpeza residencial.',
    avatar_path: null,
    plan: 'free',
    base_neighborhood: { id: 'nb-lapa', name: 'Lapa', slug: 'lapa' },
  },
  occupations: [
    {
      slug: 'diarista',
      name: 'Diarista',
      is_primary: true,
      registry_name: null,
      registry_number: null,
      registry_uf: null,
      registry_status: 'not_required',
      rating_ranking: true,
    },
  ],
  neighborhoods: [
    { id: 'nb-lapa', name: 'Lapa', slug: 'lapa', zone: 'Oeste' },
    { id: 'nb-moema', name: 'Moema', slug: 'moema', zone: 'Sul' },
  ],
  services: [
    { id: 'svc-1', occupation_slug: 'diarista', title: 'Faxina completa', description: 'Casa de até 3 quartos', price_min_cents: 18000, price_max_cents: 25000, unit: 'dia', duration_minutes: 90 },
  ],
  availability: [
    { weekday: 1, start_time: '08:00:00', end_time: '12:00:00' },
    { weekday: 1, start_time: '14:00:00', end_time: '18:00:00' },
    { weekday: 3, start_time: '09:00:00', end_time: '13:00:00' },
  ],
  reviews: [
    { rating: 5, comment: 'Impecável', occupation_slug: 'diarista', created_at: '2030-01-05T15:00:00Z' },
    { rating: 4, comment: null, occupation_slug: 'diarista', created_at: '2030-01-02T15:00:00Z' },
  ],
  ...overrides,
});

const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/p/:slug" element={<PaginaPrestador />} />
          <Route path="/agendar/:slug" element={<Agendar />} />
          <Route path="/atendimentos/:id" element={<p>Tela do atendimento</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

describe('/p/:slug', () => {
  beforeEach(() => {
    fake.reset();
    fake.tables = worldTables(newWorld());
    fake.rpcs = { ...noAdmin, get_provider_page: () => ({ data: page(), error: null }) };
  });

  it('shows the public page of the professional, without signing in', async () => {
    renderAt('/p/ana-diarista');
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana Diarista' })).toBeInTheDocument();
    expect(fake.rpcCalls.find(c => c.name === 'get_provider_page')?.args).toEqual({ p_slug: 'ana-diarista' });
    expect(screen.getByText(/Dez anos de experiência/)).toBeInTheDocument();
    expect(screen.getByText('Lapa, São Paulo')).toBeInTheDocument();

    const services = screen.getByRole('heading', { name: 'Serviços' }).closest('section') as HTMLElement;
    expect(within(services).getByText('Faxina completa')).toBeInTheDocument();
    expect(within(services).getByText('R$ 180,00 a R$ 250,00 por dia')).toBeInTheDocument();
    expect(within(services).getByText('Duração estimada: 1 h 30 min')).toBeInTheDocument();

    const schedule = screen.getByRole('heading', { name: /Disponibilidade semanal/ }).closest('section') as HTMLElement;
    expect(within(schedule).getByText('Segunda-feira')).toBeInTheDocument();
    expect(within(schedule).getByText('08:00 às 12:00, 14:00 às 18:00')).toBeInTheDocument();
    expect(within(schedule).getByText('Quarta-feira')).toBeInTheDocument();

    expect(screen.getByText('Lapa, Moema')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Agendar' })).toHaveAttribute('href', '/agendar/ana-diarista');
    expect(screen.getByRole('link', { name: 'Pedir este serviço' })).toHaveAttribute('href', '/pedido?servico=diarista');
  });

  it('shows published reviews with their average', async () => {
    renderAt('/p/ana-diarista');
    const reviews = (await screen.findByRole('heading', { name: 'Avaliações' })).closest('section') as HTMLElement;
    expect(within(reviews).getByText('4,5 em 2 avaliações')).toBeInTheDocument();
    expect(within(reviews).getByText('Impecável')).toBeInTheDocument();
  });

  it('says there are no published reviews yet', async () => {
    fake.rpcs.get_provider_page = () => ({ data: page({ reviews: [] }), error: null });
    renderAt('/p/ana-diarista');
    expect(await screen.findByText('Ainda não há avaliações publicadas.')).toBeInTheDocument();
  });

  it('does not show reviews for an occupation that forbids public ratings', async () => {
    const base = page();
    fake.rpcs.get_provider_page = () => ({
      data: page({ occupations: [{ ...(base.occupations[0] as object), rating_ranking: false }], reviews: [] }),
      error: null,
    });
    renderAt('/p/ana-diarista');
    expect(await screen.findByText('Nesta profissão, as avaliações de clientes não são exibidas publicamente.')).toBeInTheDocument();
    expect(screen.queryByText(/Ainda não há avaliações/)).not.toBeInTheDocument();
  });

  it('states the registry as informed or confirmed by WorkEasy, never as verified', async () => {
    const regulated = (status: string) => ({
      slug: 'psicologo',
      name: 'Psicólogo',
      is_primary: true,
      registry_name: 'CRP',
      registry_number: '06/12345',
      registry_uf: 'SP',
      registry_status: status,
      rating_ranking: false,
    });
    fake.rpcs.get_provider_page = () => ({
      data: page({
        occupations: [regulated('informed'), { ...regulated('confirmed'), slug: 'psicanalista', name: 'Psicanalista', is_primary: false }],
      }),
      error: null,
    });
    renderAt('/p/ana-diarista');
    expect(await screen.findByText('CRP nº 06/12345/SP: informado pelo profissional')).toBeInTheDocument();
    expect(screen.getByText('CRP nº 06/12345/SP: confirmado pelo WorkEasy')).toBeInTheDocument();
    expect(document.body.textContent?.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()).not.toMatch(/verificad/);
  });

  it('hides the booking button when the professional has no services or hours', async () => {
    fake.rpcs.get_provider_page = () => ({ data: page({ services: [], availability: [] }), error: null });
    renderAt('/p/ana-diarista');
    await screen.findByRole('heading', { level: 1, name: 'Ana Diarista' });
    expect(screen.queryByRole('link', { name: 'Agendar' })).not.toBeInTheDocument();
    expect(screen.getByText('Este profissional ainda não cadastrou serviços com preço.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir este serviço' })).toBeInTheDocument();
  });

  it('shows not found for an unknown or unapproved professional', async () => {
    fake.rpcs.get_provider_page = () => ({ data: null, error: null });
    renderAt('/p/ninguem');
    expect(await screen.findByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
  });

  it('shows a failure in pt-BR', async () => {
    fake.rpcs.get_provider_page = () => ({ data: null, error: { message: 'Failed to fetch' } });
    renderAt('/p/ana-diarista');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível falar com o servidor.');
  });
});

describe('/agendar/:slug', () => {
  // Far from Brasília: the day and the slots must still be São Paulo time
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Tokyo';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  const SLOTS = [
    '["2030-01-15 12:00:00+00","2030-01-15 13:30:00+00")',
    '["2030-01-15 13:00:00+00","2030-01-15 14:30:00+00")',
  ];

  beforeEach(() => {
    sessionStorage.clear();
    fake.reset();
    fake.tables = worldTables(newWorld());
    fake.rpcs = {
      ...noAdmin,
      get_provider_page: () => ({ data: page(), error: null }),
      available_slots: () => ({ data: SLOTS, error: null }),
      book_direct: () => ({ data: 'book-new', error: null }),
    };
    fake.session = { access_token: 't', user: { id: CLIENT_ID, email: 'maria@example.com' } };
  });

  const pickSlot = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(await screen.findByLabelText('Dia'), '2030-01-15');
    return user.click(await screen.findByRole('button', { name: /09:00 – 10:30/ }));
  };

  it('lists the free slots of the chosen day in São Paulo time and books the chosen one', async () => {
    const user = userEvent.setup();
    renderAt('/agendar/ana-diarista');
    await pickSlot(user);

    expect(fake.rpcCalls.find(c => c.name === 'available_slots')?.args).toEqual({
      p_provider: PROVIDER_ID,
      p_day: '2030-01-15',
      p_duration_minutes: 90,
    });
    expect(screen.getByRole('button', { name: /09:00 – 10:30/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/das 09:00 às 10:30/)).toBeInTheDocument();
    expect(screen.getByText(/valor inicial do serviço \(R\$ 180,00 por (hora|dia|serviço)\)/)).toBeInTheDocument();
    expect(screen.getByText(/não é multiplicado pela duração do horário/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Observações para o profissional/), 'Portão azul');
    await user.click(screen.getByRole('button', { name: 'Pedir este horário' }));

    expect(await screen.findByText('Pedido de agendamento enviado.')).toBeInTheDocument();
    expect(fake.rpcCalls.find(c => c.name === 'book_direct')?.args).toEqual({
      p_provider: PROVIDER_ID,
      p_service: 'svc-1',
      p_period: '[2030-01-15T12:00:00.000Z,2030-01-15T13:30:00.000Z)',
      p_notes: 'Portão azul',
    });
    expect(screen.getByRole('link', { name: 'Ver atendimento' })).toHaveAttribute('href', '/atendimentos/book-new');
  });

  it('shows the taken slot message and refreshes the list when the slot was lost', async () => {
    const user = userEvent.setup();
    renderAt('/agendar/ana-diarista');
    fake.rpcs.book_direct = () => ({ data: null, error: { code: 'P0001', message: 'slot_unavailable' } });
    await pickSlot(user);
    const before = fake.rpcCalls.filter(c => c.name === 'available_slots').length;
    await user.click(screen.getByRole('button', { name: 'Pedir este horário' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este horário não está mais livre. Escolha outro horário.');
    await waitFor(() => expect(fake.rpcCalls.filter(c => c.name === 'available_slots').length).toBe(before + 1));
    expect(screen.getByRole('button', { name: 'Pedir este horário' })).toBeDisabled(); // choose again
    expect(screen.queryByText('Pedido de agendamento enviado.')).not.toBeInTheDocument();
  });

  it('explains the booking limit rule that the shared table does not know', async () => {
    const user = userEvent.setup();
    renderAt('/agendar/ana-diarista');
    fake.rpcs.book_direct = () => ({ data: null, error: { code: 'P0001', message: 'booking_limit' } });
    await pickSlot(user);
    await user.click(screen.getByRole('button', { name: 'Pedir este horário' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Você já tem muitos pedidos de agendamento aguardando resposta.');
  });

  it('says when the day has no free slot', async () => {
    fake.rpcs.available_slots = () => ({ data: [], error: null });
    const user = userEvent.setup();
    renderAt('/agendar/ana-diarista');
    await user.type(await screen.findByLabelText('Dia'), '2030-01-15');
    expect(await screen.findByText(/Não há horários livres neste dia/)).toBeInTheDocument();
  });

  it('asks visitors to sign in and comes back to the page', async () => {
    fake.session = null;
    const user = userEvent.setup();
    renderAt('/agendar/ana-diarista');
    await pickSlot(user);
    const link = await screen.findByRole('link', { name: 'Entrar para agendar' });
    expect(link).toHaveAttribute('href', '/entrar?next=%2Fagendar%2Fana-diarista');
    expect(screen.queryByRole('button', { name: 'Pedir este horário' })).not.toBeInTheDocument();
  });

  it('points to a request when the professional has no bookable hours', async () => {
    fake.rpcs.get_provider_page = () => ({ data: page({ availability: [] }), error: null });
    renderAt('/agendar/ana-diarista');
    expect(await screen.findByText(/ainda não tem serviços e horários cadastrados para agendamento direto/)).toBeInTheDocument();
  });

  it('shows not found for an unknown professional', async () => {
    fake.rpcs.get_provider_page = () => ({ data: null, error: null });
    renderAt('/agendar/ninguem');
    expect(await screen.findByRole('heading', { name: 'Profissional não encontrado' })).toBeInTheDocument();
  });
});
