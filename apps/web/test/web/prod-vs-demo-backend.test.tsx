import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { profileRow, type FakeSupabase } from './fakeSupabase';

// A build with a backend (VITE_SUPABASE_URL set): the simulated Supabase client stands in for it
vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('./fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { AuthProvider } = await import('../../contexts/AuthContext');
const { default: AppShell } = await import('../../AppShell');
const { DashboardRedirect, RegisterProviderRedirect } = await import('../../pages/prototype/redirects');
const { MOCK_PROVIDERS, MOCK_REQUESTS, MOCK_MEDICAL_RECORDS } = await import('../../constants');
const { findArea } = await import('../../catalog');
const fake = supabase as unknown as FakeSupabase;

const USER_ID = 'user-1';

const Where = () => {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
};

const renderApp = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
        <Where />
      </MemoryRouter>
    </AuthProvider>,
  );

const where = () => screen.getByTestId('where').textContent;

/** Waits until every lazy screen and status line on the page has finished loading. */
const settled = () => waitFor(() => expect(screen.queryByText('Carregando…')).toBeNull());

const signIn = (provider: boolean) => {
  fake.session = { access_token: 'token', user: { id: USER_ID, email: 'maria@example.com' } };
  fake.tables = {
    profiles: () => ({ data: profileRow(USER_ID), error: null }),
    providers: call => ({
      data: provider && call.filters.some(([op, column]) => op === 'eq' && column === 'id')
        ? {
            id: USER_ID,
            display_name: 'Ana Diarista',
            slug: 'ana-diarista',
            bio: null,
            avatar_path: null,
            status: 'approved',
            plan: 'free',
            base_neighborhood_id: null,
            accepts_platform_requests: true,
            created_at: '2026-10-01T12:00:00Z',
          }
        : null,
      error: null,
    }),
  };
  fake.rpcs = { is_admin: () => ({ data: false, error: null }) };
};

// What the prototype shows and a real build must never print: people, request ids and prices of constants.tsx
const FICTITIOUS_TEXTS = [
  ...new Set([
    ...MOCK_PROVIDERS.flatMap(provider => [provider.name, provider.description]),
    ...MOCK_REQUESTS.flatMap(request => [request.id, request.providerName]),
    ...MOCK_MEDICAL_RECORDS.map(record => record.patientName),
  ]),
];
const FICTITIOUS_PRICES = [
  ...new Set([
    ...MOCK_PROVIDERS.flatMap(provider => provider.services.flatMap(service => [service.priceMin, service.priceMax])),
    ...MOCK_REQUESTS.map(request => request.price ?? 0),
  ]),
]
  .filter(price => price > 0)
  .map(price => new RegExp(`R\\$\\s*${price}(?![\\d.,])`));

const expectNothingFictitious = () => {
  const text = document.body.textContent ?? '';
  for (const fictitious of FICTITIOUS_TEXTS) expect(text, fictitious).not.toContain(fictitious);
  for (const price of FICTITIOUS_PRICES) expect(text).not.toMatch(price);
  expect(text).not.toMatch(/fictíci|demonstraç|Protótipo|\(DEMO\)/i);
};

describe('a build with a backend, as a visitor', () => {
  beforeEach(() => {
    fake.reset();
  });
  afterEach(() => vi.unstubAllEnvs());

  // path, heading shown (if the page is one of ours), where the visitor ends up
  const ROUTES: Array<{ path: string; heading?: string; end: string; scan?: boolean }> = [
    { path: '/', heading: 'Contrate serviços sem complicação', end: '/' },
    { path: '/search', heading: 'Buscar serviço', end: '/search' },
    { path: '/search?q=diarista', heading: 'Resultados para "diarista"', end: '/search?q=diarista' },
    { path: '/profile/1', heading: 'Todas as categorias', end: '/categorias' },
    { path: '/profile/me', end: '/entrar?next=%2Fconta' },
    { path: '/dashboard', end: '/entrar?next=%2Fpedidos' },
    { path: '/verification', heading: 'Verificação de identidade', end: '/verification' },
    { path: '/register-provider', end: '/entrar?next=%2Fpro%2Fcadastro' },
    { path: '/register-provider?ocupacao=diarista', end: '/entrar?next=%2Fpro%2Fcadastro%3Focupacao%3Ddiarista' },
    { path: '/register-provider?ocupacao=nao-existe', end: '/entrar?next=%2Fpro%2Fcadastro' },
    { path: '/health', heading: 'Busca de médicos e consultas', end: '/health' },
    { path: '/doctor/doc-1', heading: 'Perfil de médico', end: '/doctor/doc-1' },
    { path: '/teleconsultation/mock-session-id', heading: 'Teleconsulta', end: '/teleconsultation/mock-session-id' },
    { path: '/medical-records', heading: 'Prontuário eletrônico', end: '/medical-records' },
    { path: '/legal', heading: 'Documentos legais', end: '/legal' },
    { path: '/termos', heading: 'Termos de Uso', end: '/termos' },
    { path: '/privacidade', heading: 'Política de Privacidade', end: '/privacidade' },
    { path: '/sac', heading: 'Atendimento ao Consumidor (SAC)', end: '/sac' },
    { path: '/categorias', heading: 'Todas as categorias', end: '/categorias' },
    // the area page is not part of this front: it still prints a demo link (reported), so only the route is checked
    { path: '/search?category=health', end: '/categorias/health', scan: false },
  ];

  it.each(ROUTES)('$path ends at $end with nothing fictitious on screen', async ({ path, heading, end, scan = true }) => {
    renderApp(path);
    if (heading) await screen.findByRole('heading', { name: heading });
    await waitFor(() => expect(where()).toBe(end));
    await settled();
    expect(screen.queryByText(/Protótipo de demonstração/)).toBeNull();
    expect(screen.queryByText(/Dados fictícios/)).toBeNull();
    if (scan) expectNothingFictitious();
  });

  it('has no demo banner and says nothing about a prototype in the footer', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: 'Contrate serviços sem complicação' });
    expect(screen.queryByRole('note')).toBeNull();
    const footer = screen.getByRole('contentinfo');
    expect(footer).not.toHaveTextContent(/Protótipo|demonstração/);
    expect(footer).toHaveTextContent(`© ${new Date().getFullYear()} WorkEasy. Todos os direitos reservados.`);
  });

  it('links the legal texts, the SAC and the way to join as a professional from the footer', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: 'Contrate serviços sem complicação' });
    const footer = within(screen.getByRole('navigation', { name: 'Rodapé' }));
    expect(footer.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos');
    expect(footer.getByRole('link', { name: 'Privacidade' })).toHaveAttribute('href', '/privacidade');
    expect(footer.getByRole('link', { name: 'SAC' })).toHaveAttribute('href', '/sac');
    expect(footer.getByRole('link', { name: 'Trabalhe conosco' })).toHaveAttribute('href', '/pro/cadastro');
  });

  it('identifies the company in the footer from the build variables', async () => {
    vi.stubEnv('VITE_COMPANY_NAME', 'Acme Serviços Ltda');
    vi.stubEnv('VITE_COMPANY_CNPJ', '12.345.678/0001-95');
    vi.stubEnv('VITE_COMPANY_ADDRESS', 'Rua Exemplo, 100, São Paulo, SP');
    vi.stubEnv('VITE_SAC_EMAIL', 'sac@example.com');
    vi.stubEnv('VITE_SAC_WHATSAPP', '5511999999999');
    renderApp('/');
    await screen.findByRole('heading', { name: 'Contrate serviços sem complicação' });
    const footer = within(screen.getByRole('contentinfo'));
    expect(footer.getByText('Acme Serviços Ltda · CNPJ 12.345.678/0001-95')).toBeInTheDocument();
    expect(footer.getByText('Rua Exemplo, 100, São Paulo, SP')).toBeInTheDocument();
    expect(footer.getByRole('link', { name: 'sac@example.com' })).toHaveAttribute('href', 'mailto:sac@example.com');
    expect(footer.getByRole('link', { name: 'WhatsApp (11) 99999-9999' })).toHaveAttribute('href', 'https://wa.me/5511999999999');
    expect(footer.getByText(new RegExp(`© ${new Date().getFullYear()} Acme Serviços Ltda\\. Todos`))).toBeInTheDocument();
  });

  it('leaves out what is not configured instead of printing placeholders', async () => {
    for (const name of ['VITE_COMPANY_NAME', 'VITE_COMPANY_CNPJ', 'VITE_COMPANY_ADDRESS', 'VITE_SAC_EMAIL', 'VITE_SAC_WHATSAPP']) vi.stubEnv(name, '');
    vi.stubEnv('VITE_COMPANY_NAME', 'Acme Serviços Ltda');
    renderApp('/');
    await screen.findByRole('heading', { name: 'Contrate serviços sem complicação' });
    const footer = screen.getByRole('contentinfo');
    expect(within(footer).getByText('Acme Serviços Ltda')).toBeInTheDocument();
    expect(footer).not.toHaveTextContent(/CNPJ|SAC:/);
    expect(footer.querySelectorAll('address p')).toHaveLength(1);
  });

  it('shows the home page with real actions and catalog content only', async () => {
    renderApp('/');
    await screen.findByRole('heading', { name: 'Contrate serviços sem complicação' });
    expect(screen.getByRole('link', { name: 'Pedir um serviço' })).toHaveAttribute('href', '/pedido');
    for (const link of screen.getAllByRole('link', { name: 'Sou profissional' })) expect(link).toHaveAttribute('href', '/pro/cadastro');
    expect(screen.getByRole('heading', { name: 'Receba propostas' })).toBeInTheDocument();
    expect(screen.queryByText(/Compare avaliações, preços e distância/)).toBeNull();
    expectNothingFictitious();
  });

  it('sends the health category to its catalog page, not to the health search', async () => {
    renderApp('/');
    const health = await screen.findByRole('button', { name: findArea('health')?.name });
    health.click();
    await waitFor(() => expect(where()).toBe('/categorias/health'));
  });

  it('lists catalog services on /search and links each one to its page', async () => {
    renderApp('/search?q=faxina');
    const list = await screen.findByRole('list', { name: 'Serviços encontrados' });
    const links = within(list).getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link.getAttribute('href')).toMatch(/^\/servicos\/[a-z0-9-]+$/);
    expect(links.map(link => link.textContent)).toEqual(expect.arrayContaining([expect.stringMatching(/Diarista/)]));
  });

  it('asks for at least two letters and offers a way on when nothing matches', async () => {
    const { unmount } = renderApp('/search?q=a');
    expect(await screen.findByText(/Digite pelo menos duas letras/)).toBeInTheDocument();
    unmount();
    renderApp('/search?q=zzzzqqqq');
    expect(await screen.findByText(/Nenhum serviço encontrado/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'descreva o que você precisa' })).toHaveAttribute('href', '/pedido');
  });

  it('searches again from the page', async () => {
    renderApp('/search');
    const box = await screen.findByRole('searchbox', { name: 'Procure um serviço ou profissão' });
    box.focus();
    const { default: userEvent } = await import('@testing-library/user-event');
    const user = userEvent.setup();
    await user.type(box, 'encanador{enter}');
    await waitFor(() => expect(where()).toBe('/search?q=encanador'));
    expect(await screen.findByRole('heading', { name: 'Resultados para "encanador"' })).toBeInTheDocument();
  });

  it('explains each future feature and links back', async () => {
    renderApp('/health');
    expect(await screen.findByText('Funcionalidade futura')).toBeInTheDocument();
    expect(screen.getByText(/empresa registrada no CRM, responsável técnico e prontuário certificado/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver a área de saúde' })).toHaveAttribute('href', '/categorias/health');
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
  });
});

describe('/dashboard and /register-provider with a backend, in isolation', () => {
  beforeEach(() => {
    fake.reset();
  });

  const renderRoutes = (path: string) =>
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/dashboard" element={<DashboardRedirect />} />
            <Route path="/register-provider" element={<RegisterProviderRedirect />} />
            <Route path="/pedidos" element={<p>lista de pedidos</p>} />
            <Route path="/pro" element={<p>painel pro</p>} />
            <Route path="/pro/cadastro" element={<Where />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

  it('waits for the session before choosing where to send a signed-in provider', async () => {
    signIn(true);
    renderRoutes('/dashboard');
    expect(screen.getByRole('status')).toHaveTextContent('Carregando…');
    expect(screen.queryByText('lista de pedidos')).toBeNull();
    expect(await screen.findByText('painel pro')).toBeInTheDocument();
    expect(screen.queryByText('lista de pedidos')).toBeNull();
  });

  it('sends a signed-in client to the requests', async () => {
    signIn(false);
    renderRoutes('/dashboard');
    expect(await screen.findByText('lista de pedidos')).toBeInTheDocument();
  });

  it('sends a visitor to the requests, which ask to sign in', async () => {
    renderRoutes('/dashboard');
    expect(await screen.findByText('lista de pedidos')).toBeInTheDocument();
  });

  it('keeps the service chosen on a service page when sending a provider to the sign-up', async () => {
    renderRoutes('/register-provider?ocupacao=diarista');
    await waitFor(() => expect(where()).toBe('/pro/cadastro?ocupacao=diarista'));
  });

  it('drops a service that is not in the catalog', async () => {
    renderRoutes('/register-provider?ocupacao=https%3A%2F%2Fevil.example');
    await waitFor(() => expect(where()).toBe('/pro/cadastro'));
  });
});
