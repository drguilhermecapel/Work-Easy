import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import AppShell from '../../AppShell';

// Demo mode even when a developer's .env.local configures Supabase
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <AppShell />
      </MemoryRouter>
    </AuthProvider>,
  );

// Without a backend each new screen says what is not available instead of breaking
const ROUTES: Array<[path: string, expected: RegExp]> = [
  ['/atendimentos', /Atendimentos online ainda não disponíveis/],
  ['/atendimentos/abc', /Atendimentos online ainda não disponíveis/],
  ['/p/ana-diarista', /Páginas de profissionais ainda não disponíveis/],
  ['/agendar/ana-diarista', /Agendamento online ainda não disponível/],
  ['/orcamento/8f3c1a2e-5b7d-4e19-9c60-1d2e3f4a5b6c', /Orçamentos online ainda não disponíveis/],
];

describe('client journey routes in demo mode', () => {
  it.each(ROUTES)('%s renders inside the app shell', async (path, expected) => {
    renderAt(path);
    expect(await screen.findByText(expected, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Dados fictícios, sem atendimento/)).toBeInTheDocument();
  });

  it('keeps the demonstration professionals on the service page', async () => {
    renderAt('/servicos/diarista');
    expect(await screen.findByText('Profissionais de demonstração', {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
