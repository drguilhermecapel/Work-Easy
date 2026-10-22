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

// Demo mode (no VITE_SUPABASE_URL): the new routes exist and say what is not available yet
const ROUTES: Array<[path: string, expected: RegExp]> = [
  ['/entrar', /Login ainda não disponível/],
  ['/conta', /Conta ainda não disponível/],
  ['/pedido', /Pedido online ainda não disponível/],
  ['/pedidos', /Pedidos online ainda não disponíveis/],
  ['/pedidos/abc', /Pedidos online ainda não disponíveis/],
];

describe('MVP routes in demo mode', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(ROUTES)('%s renders inside the app shell', async (path, expected) => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '');
    renderAt(path);
    expect(await screen.findByText(expected, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Dados fictícios, sem atendimento/)).toBeInTheDocument();
  });

  it('/pedido opens the concierge form when the WhatsApp number is configured', async () => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '5511999999999');
    renderAt('/pedido?servico=encanador');
    expect(await screen.findByText(/Serviço escolhido:/, {}, { timeout: 5000 })).toHaveTextContent('Encanador');
  });

  it('the service page links to the guided request when the concierge number is configured', async () => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '5511999999999');
    renderAt('/servicos/diarista');
    const link = await screen.findByRole('link', { name: 'Pedir este serviço' }, { timeout: 5000 });
    expect(link).toHaveAttribute('href', '/pedido?servico=diarista');
    expect(screen.getByRole('link', { name: 'Procurar profissionais' })).toHaveAttribute('href', '/search?q=Diarista');
  });

  it('without backend and concierge, the service page keeps the demo search as its main action', async () => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '');
    renderAt('/servicos/diarista');
    const search = await screen.findByRole('link', { name: 'Procurar profissionais' }, { timeout: 5000 });
    expect(search).toHaveAttribute('href', '/search?q=Diarista');
    expect(search.className).toContain('bg-primary');
    expect(screen.queryByRole('link', { name: 'Pedir este serviço' })).not.toBeInTheDocument();
  });
});
