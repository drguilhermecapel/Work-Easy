import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// No Supabase configured: the demo mode
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

const { AuthProvider } = await import('../../contexts/AuthContext');
const { default: RequireAdmin } = await import('../../components/RequireAdmin');

describe('RequireAdmin in the demo mode', () => {
  it('explains that the area needs the server instead of breaking', () => {
    render(
      <AuthProvider>
        <MemoryRouter>
          <RequireAdmin>
            <p>Conteúdo administrativo</p>
          </RequireAdmin>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Administração indisponível na demonstração' })).toBeInTheDocument();
    expect(screen.queryByText('Conteúdo administrativo')).not.toBeInTheDocument();
  });
});
