import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import AppShell from '../../AppShell';

// Demo mode even when a developer's .env.local configures Supabase (Vitest loads it like Vite)
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

// The first load of the text fails (e.g. the device is offline), the next one works
const loads = vi.hoisted(() => ({ count: 0 }));
vi.mock('../../pages/legal/sources', () => ({
  loadLegalSource: () => {
    loads.count += 1;
    return loads.count === 1 ? Promise.reject(new Error('chunk failed')) : Promise.resolve('# Termos\n\nTexto carregado na segunda tentativa.');
  },
}));

describe('a legal text that fails to load', () => {
  it('keeps the page and lets the person try again', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/termos']}>
          <AppShell />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // the title, the version and the way back stay on screen
    expect(screen.getByRole('heading', { level: 1, name: 'Termos de Uso' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByText('Texto carregado na segunda tentativa.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
