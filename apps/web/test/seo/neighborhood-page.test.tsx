import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import AppShell from '../../AppShell';

// Demo mode even when a developer's .env.local configures Supabase (Vitest loads it like Vite)
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
      </MemoryRouter>
    </AuthProvider>,
  );

describe('/servicos/:slug/:bairro', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('shows the occupation, the neighborhood and what is required of the professional', async () => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '');
    renderAt('/servicos/diarista/moema');
    expect(await screen.findByRole('heading', { level: 1, name: 'Diarista em Moema' })).toBeInTheDocument();
    expect(screen.getByText('Zona Sul, São Paulo')).toBeInTheDocument();
    expect(await screen.findByText('O que será exigido do profissional')).toBeInTheDocument();
    expect(screen.getByText('Certidão de antecedentes criminais')).toBeInTheDocument();
    expect(screen.getByText(/não exige registro em conselho profissional/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver Diarista' })).toHaveAttribute('href', '/servicos/diarista');
    expect(document.title).toBe('Diarista em Moema, São Paulo | WorkEasy');
    // Same rule as the occupation page: no request button while /pedido has nothing to offer
    expect(screen.queryByRole('link', { name: 'Pedir este serviço' })).not.toBeInTheDocument();
  });

  it('sends the request with the service and the neighborhood when /pedido is available', async () => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '5511999999999');
    renderAt('/servicos/encanador/vila-mariana');
    expect(await screen.findByRole('heading', { level: 1, name: 'Encanador em Vila Mariana' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pedir este serviço' })).toHaveAttribute('href', '/pedido?servico=encanador&bairro=vila-mariana');
    expect(screen.getByRole('link', { name: 'Ver Encanador' })).toHaveAttribute('href', '/servicos/encanador');
  });

  it('links to other neighborhoods of the same zone', async () => {
    renderAt('/servicos/diarista/moema');
    expect(await screen.findByText('Diarista em outros bairros')).toBeInTheDocument();
    const link = screen.getAllByRole('link').find(a => a.getAttribute('href')?.startsWith('/servicos/diarista/'));
    expect(link).toBeDefined();
    expect(link).not.toHaveAttribute('href', '/servicos/diarista/moema');
  });

  it('falls back to the occupation for an unknown neighborhood and to the categories for an unknown occupation', async () => {
    const { unmount } = renderAt('/servicos/diarista/nao-existe');
    expect(await screen.findByRole('heading', { level: 1, name: 'Diarista' })).toBeInTheDocument();
    unmount();
    renderAt('/servicos/nao-existe/moema');
    expect(await screen.findByText(/Todas as categorias/)).toBeInTheDocument();
  });
});
