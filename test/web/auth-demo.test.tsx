import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../../contexts/AuthContext';
import { backendEnabled, supabase } from '../../lib/supabase';
import { UserType } from '../../types';

// Demo mode even when a developer's .env.local configures Supabase (Vitest loads it like Vite)
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

const Probe = () => {
  const { user, switchRole, isAuthenticated, mode } = useAuth();
  return (
    <div>
      <p data-testid="name">{user.name}</p>
      <p data-testid="type">{user.type}</p>
      <p data-testid="health">{String(user.isHealthProfessional)}</p>
      <p data-testid="auth">{String(isAuthenticated)}</p>
      <p data-testid="mode">{mode}</p>
      <button onClick={() => switchRole(UserType.CLIENT)}>cliente</button>
      <button onClick={() => switchRole(UserType.PROVIDER, false)}>prestador</button>
      <button onClick={() => switchRole(UserType.PROVIDER, true)}>medico</button>
    </div>
  );
};

describe('AuthContext in demo mode', () => {
  it('runs without a backend in tests, whatever the local .env says', () => {
    expect(backendEnabled).toBe(false);
    expect(supabase).toBeNull();
  });

  it('keeps the demo role switcher unchanged', async () => {
    const user = userEvent.setup();
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect(screen.getByTestId('name')).toHaveTextContent('Maria Cliente');
    expect(screen.getByTestId('type')).toHaveTextContent(UserType.CLIENT);
    expect(screen.getByTestId('auth')).toHaveTextContent('true');
    expect(screen.getByTestId('mode')).toHaveTextContent('demo');

    await user.click(screen.getByText('prestador'));
    expect(screen.getByTestId('name')).toHaveTextContent('João Pintor');
    expect(screen.getByTestId('type')).toHaveTextContent(UserType.PROVIDER);
    expect(screen.getByTestId('health')).toHaveTextContent('false');

    await user.click(screen.getByText('medico'));
    expect(screen.getByTestId('name')).toHaveTextContent('Dr. Roberto Costa');
    expect(screen.getByTestId('health')).toHaveTextContent('true');

    await user.click(screen.getByText('cliente'));
    expect(screen.getByTestId('name')).toHaveTextContent('Maria Cliente');
  });

  it('throws outside the provider', () => {
    const Broken = () => {
      useAuth();
      return null;
    };
    // React logs the thrown error; keep the output clean
    const original = console.error;
    console.error = () => {};
    try {
      expect(() => render(<Broken />)).toThrow('useAuth must be used within an AuthProvider');
    } finally {
      console.error = original;
    }
  });
});
