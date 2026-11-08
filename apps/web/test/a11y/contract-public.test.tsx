import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import BackendNotice from '../../components/BackendNotice';
import AreaPage from '../../pages/AreaPage';
import Categories from '../../pages/Categories';
import OccupationNeighborhoodPage from '../../pages/OccupationNeighborhoodPage';
import OccupationPage from '../../pages/OccupationPage';
import { Suspense } from 'react';
import { expectAccessibleScreen } from './contract';

// policies.json is 1.4 MB: parsing it is slow on a shared machine and says nothing about the markup,
// so one realistic policy stands in for it (the real file is scanned in a browser, see the docs)
vi.mock('../../catalog', async importOriginal => {
  // One promise for every call, as the real loader does: React's use() suspends forever on a new one each render
  const policies = Promise.resolve({
    diarista: {
      regulated: false,
      regulatorBody: '',
      registryName: '',
      legalBasis: '',
      verification: ['documento_selfie', 'antecedentes'],
      backgroundCheck: true,
      billing: 'comissao_primeiro_servico',
      ratingRanking: true,
      laborLock: true,
      providerType: 'autonomo',
      priceUnits: ['dia'],
      locations: ['domicilio'],
      audienceMinors: false,
      notes: '',
      confidence: 'a_confirmar',
      sources: ['https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp150.htm'],
    },
  });
  return { ...(await importOriginal<typeof import('../../catalog')>()), loadPolicies: () => policies };
});

// The public pages, in the demo mode (no backend): what a visitor and a search engine reach first
const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Suspense fallback={<p role="status">Carregando…</p>}>
          <Routes>
            <Route path="/categorias" element={<Categories />} />
            <Route path="/categorias/:slug" element={<AreaPage />} />
            <Route path="/servicos/:slug" element={<OccupationPage />} />
            <Route path="/servicos/:slug/:bairro" element={<OccupationNeighborhoodPage />} />
          </Routes>
        </Suspense>
      </MemoryRouter>
    </AuthProvider>,
  );

describe('public catalog pages', () => {
  it('categories: one h1, named search, and the filter says how many services it found', async () => {
    const user = userEvent.setup();
    renderAt('/categorias');
    expect(await screen.findByRole('heading', { level: 1, name: 'Todas as categorias' })).toBeInTheDocument();
    expectAccessibleScreen();
    await user.type(screen.getByRole('searchbox', { name: 'Procure um serviço ou profissão' }), 'diarista');
    expect(screen.getByRole('status')).toHaveTextContent(/serviços? encontrados?\./);
    expectAccessibleScreen();
    await user.clear(screen.getByRole('searchbox'));
    await user.type(screen.getByRole('searchbox'), 'zzzzzz');
    expect(screen.getByRole('status')).toHaveTextContent('Nenhum serviço encontrado.');
  });

  it('area: the breadcrumb names the current page and the list is reachable', async () => {
    renderAt('/categorias/limpeza');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    const trail = screen.getByRole('navigation', { name: 'Caminho' });
    expect(trail.querySelector('[aria-current="page"]')).toHaveTextContent(/Limpeza/);
    expectAccessibleScreen();
  });

  it('occupation: the rules load and every link says where it goes', async () => {
    renderAt('/servicos/diarista');
    expect(await screen.findByRole('heading', { level: 1, name: 'Diarista' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /Como se contrata/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /planalto\.gov\.br/ })).toHaveAttribute('rel', 'noopener noreferrer');
    expectAccessibleScreen();
  });

  it('occupation in a neighborhood', async () => {
    renderAt('/servicos/diarista/pinheiros');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expectAccessibleScreen();
  });

  it('the notice that stands in for screens that need the backend keeps one h1 and 44 px buttons', () => {
    render(
      <MemoryRouter>
        <BackendNotice title="Login ainda não disponível">
          <p>Texto.</p>
        </BackendNotice>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Login ainda não disponível' })).toBeInTheDocument();
    for (const link of screen.getAllByRole('link')) expect(link.className).toContain('min-h-11');
    expectAccessibleScreen();
  });
});
