import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { newWorld, noAdmin, worldTables, type FakeSupabase } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { AuthProvider } = await import('../../contexts/AuthContext');
const { default: OccupationPage } = await import('../../pages/OccupationPage');
const fake = supabase as unknown as FakeSupabase;

const provider = (overrides: Record<string, unknown> = {}) => ({
  provider_id: 'prov-1',
  display_name: 'Ana Diarista',
  slug: 'ana-diarista',
  bio: 'Limpeza residencial há dez anos.',
  avatar_path: null,
  rating_avg: 4.5,
  rating_count: 8,
  price_min_cents: 18000,
  price_max_cents: 25000,
  unit: 'dia',
  registry_status: 'not_required',
  ...overrides,
});

// The page reads the occupation rules with use(): render inside an awaited act so the Suspense settles
const renderPage = async () => {
  await act(async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/servicos/diarista']}>
          <Routes>
            <Route path="/servicos/:slug" element={<OccupationPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
  });
};

const searchCalls = () => fake.rpcCalls.filter(c => c.name === 'search_providers');

describe('providers section of /servicos/:slug with a backend', () => {
  beforeEach(() => {
    fake.reset();
    fake.tables = worldTables(newWorld());
    fake.rpcs = { ...noAdmin, search_providers: () => ({ data: [provider()], error: null }) };
  });

  it('lists real providers instead of the demonstration ones', async () => {
    await renderPage();
    const section = (await screen.findByRole('heading', { name: 'Profissionais' }, { timeout: 5000 })).closest('section') as HTMLElement;
    expect(await within(section).findByText('Ana Diarista', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(searchCalls()[0].args).toEqual({ p_occupation: 'diarista', p_neighborhood: null, p_limit: 20, p_offset: 0 });
    expect(within(section).getByText('4,5 (8 avaliações)')).toBeInTheDocument();
    expect(within(section).getByText('R$ 180,00 a R$ 250,00 por dia')).toBeInTheDocument();
    expect(within(section).getByRole('link', { name: 'Ver página' })).toHaveAttribute('href', '/p/ana-diarista');
    expect(within(section).getByRole('link', { name: 'Agendar' })).toHaveAttribute('href', '/agendar/ana-diarista');
    expect(within(section).getByRole('link', { name: 'Pedir este serviço' })).toHaveAttribute('href', '/pedido?servico=diarista');
    expect(screen.queryByText('Profissionais de demonstração')).not.toBeInTheDocument();
  });

  it('filters by neighborhood with the id from the database', async () => {
    const user = userEvent.setup();
    await renderPage();
    await screen.findByText('Ana Diarista');
    const select = await screen.findByLabelText('Bairro');
    await screen.findByRole('option', { name: 'Moema' });
    await user.selectOptions(select, 'Moema');
    await vi.waitFor(() => expect(searchCalls().at(-1)?.args).toMatchObject({ p_neighborhood: 'nb-moema' }));
  });

  it('shows no rating when the occupation does not rank by rating (the database returns null)', async () => {
    fake.rpcs.search_providers = () => ({ data: [provider({ rating_avg: null, rating_count: null })], error: null });
    await renderPage();
    await screen.findByText('Ana Diarista');
    expect(screen.queryByText(/avaliações\)|avaliação\)/)).not.toBeInTheDocument();
  });

  it('shows the registry as informed or confirmed by WorkEasy', async () => {
    fake.rpcs.search_providers = () => ({
      data: [provider({ registry_status: 'informed' }), provider({ provider_id: 'prov-2', display_name: 'Bia', slug: 'bia', registry_status: 'confirmed' })],
      error: null,
    });
    await renderPage();
    await screen.findByText('Ana Diarista');
    expect(screen.getByText('Registro profissional: informado pelo profissional')).toBeInTheDocument();
    expect(screen.getByText('Registro profissional: confirmado pelo WorkEasy')).toBeInTheDocument();
  });

  it('explains the empty state and keeps the request button', async () => {
    fake.rpcs.search_providers = () => ({ data: [], error: null });
    await renderPage();
    expect(await screen.findByText(/Ainda não há profissionais de Diarista com página no WorkEasy/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Pedir este serviço' }).length).toBeGreaterThan(0);
  });

  it('shows a failure in pt-BR', async () => {
    fake.rpcs.search_providers = () => ({ data: null, error: { message: 'Failed to fetch' } });
    await renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível falar com o servidor.');
  });

  it('asks for more results when a full page came back', async () => {
    const full = Array.from({ length: 20 }, (_, i) => provider({ provider_id: `p-${i}`, display_name: `Profissional ${i}`, slug: `p-${i}` }));
    fake.rpcs.search_providers = args => ({ data: (args?.p_limit as number) > 20 ? [...full, provider({ provider_id: 'p-20', display_name: 'Profissional 20', slug: 'p-20' })] : full, error: null });
    const user = userEvent.setup();
    await renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ver mais profissionais' }));
    expect(await screen.findByText('Profissional 20')).toBeInTheDocument();
    expect(searchCalls().at(-1)?.args).toMatchObject({ p_limit: 40, p_offset: 0 });
    expect(screen.queryByRole('button', { name: 'Ver mais profissionais' })).not.toBeInTheDocument();
  });
});
