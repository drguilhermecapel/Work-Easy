import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import AppShell from '../../AppShell';

// The care line is not part of a store build (docs/DECISOES.md, D12; docs/lojas/google-play.md, M04): the routes are
// not registered at all, so the screens cannot be reached even by typing the address. Demo mode (no backend) is
// enough to see it: on the site those routes answer with the "not available yet" page, in a store build with the home.
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

afterEach(() => vi.unstubAllEnvs());

const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
      </MemoryRouter>
    </AuthProvider>,
  );

describe('care routes by build', () => {
  it.each([
    ['/cuidado', /Linha de cuidado ainda não disponível/],
    ['/pro/plantoes', /Ferramenta do profissional ainda não disponível/],
  ])('%s exists on the site', async (path, notice) => {
    renderAt(path);
    expect(await screen.findByText(notice, {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it.each([
    ['android', '/cuidado'],
    ['android', '/pro/plantoes'],
    ['ios', '/cuidado'],
  ])('%s build: %s falls through to the home page', async (store, path) => {
    vi.stubEnv('VITE_STORE_BUILD', store);
    renderAt(path);
    expect(await screen.findByText(/Contrate serviços/, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText(/ainda não disponível/)).not.toBeInTheDocument();
  });
});
