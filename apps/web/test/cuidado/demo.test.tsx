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

// Without a backend the care screens say what is not available instead of breaking
const ROUTES: Array<[path: string, expected: RegExp]> = [
  ['/cuidado', /Linha de cuidado ainda não disponível/],
  ['/cuidado/plantoes', /Linha de cuidado ainda não disponível/],
  ['/cuidado/plantoes/abc', /Linha de cuidado ainda não disponível/],
  ['/cuidado/relatorios', /Linha de cuidado ainda não disponível/],
  ['/pro/plantoes', /Ferramenta do profissional ainda não disponível/],
];

describe('care line routes in demo mode', () => {
  it.each(ROUTES)('%s renders inside the app shell with a notice', async (path, expected) => {
    renderAt(path);
    expect(await screen.findByText(expected, {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText(/Dados fictícios, sem atendimento/)).toBeInTheDocument();
  });

  it('does not pretend that anything is stored', async () => {
    renderAt('/cuidado');
    expect(await screen.findByText(/nada é guardado e não há cuidadores cadastrados/, {}, { timeout: 5000 })).toBeInTheDocument();
  });
});
