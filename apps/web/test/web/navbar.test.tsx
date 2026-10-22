import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { AuthProvider } from '../../contexts/AuthContext';
import type { AuthContextType, BackendAuth } from '../../contexts/AuthContext';
import Navbar from '../../components/Navbar';
import { isNavActive, navModelFor } from '../../components/navItems';
import { UserType } from '../../types';

const persona = { id: 'u', name: 'Pessoa', type: UserType.CLIENT, isHealthProfessional: false };

const backend = (patch: Partial<BackendAuth>): AuthContextType =>
  ({
    mode: 'backend',
    user: persona,
    switchRole: () => {},
    isAuthenticated: false,
    loading: false,
    session: null,
    authUser: null,
    profile: null,
    provider: null,
    isAdmin: false,
    signInWithOtp: async () => {},
    verifyOtp: async () => null,
    signOut: async () => {},
    refreshProfile: () => {},
    ...patch,
  }) as BackendAuth;

const session = {} as Session;
const labels = (auth: AuthContextType) => navModelFor(auth).items.map(i => i.label);

describe('navModelFor', () => {
  it('keeps the demo menu for each demo persona', () => {
    const demo = (type: UserType) =>
      ({ mode: 'demo', user: { ...persona, type }, switchRole: () => {}, isAuthenticated: true, loading: false }) as AuthContextType;
    expect(labels(demo(UserType.CLIENT))).toEqual(['Categorias', 'Buscar', 'Meus Pedidos']);
    expect(navModelFor(demo(UserType.CLIENT)).cta?.to).toBe('/register-provider');
    expect(labels(demo(UserType.PROVIDER))).toEqual(['Meu Painel']);
    expect(navModelFor(demo(UserType.PROVIDER)).cta).toBeNull();
  });

  it('shows a visitor only what works without an account', () => {
    const model = navModelFor(backend({}));
    expect(model.items.map(i => i.to)).toEqual(['/categorias', '/pedido']);
    expect(model.cta?.to).toBe('/pro/cadastro');
  });

  it('shows a signed-in client the client areas and the way to become a provider', () => {
    const model = navModelFor(backend({ session }));
    expect(model.items.map(i => i.to)).toEqual(['/categorias', '/pedido', '/pedidos', '/atendimentos', '/cuidado']);
    expect(model.cta?.to).toBe('/pro/cadastro');
  });

  it('shows a provider the Pro tools and no more call to action', () => {
    const model = navModelFor(backend({ session, provider: { id: 'p' } as BackendAuth['provider'] }));
    expect(model.items.map(i => i.to)).toEqual(['/pro', '/pro/pedidos', '/pro/agenda', '/atendimentos', '/pro/plantoes', '/pedido']);
    expect(model.cta).toBeNull();
  });

  it('adds the admin area only for admins', () => {
    expect(labels(backend({ session }))).not.toContain('Administração');
    const admin = navModelFor(backend({ session, isAdmin: true }));
    expect(admin.items.at(-1)).toEqual({ label: 'Administração', to: '/admin' });
  });

  it('never links to a route that does not exist in the app', () => {
    const every = [
      backend({}),
      backend({ session }),
      backend({ session, provider: { id: 'p' } as BackendAuth['provider'], isAdmin: true }),
    ].flatMap(a => [...navModelFor(a).items, ...(navModelFor(a).cta ? [navModelFor(a).cta!] : [])]);
    for (const { to } of every) expect(to).toMatch(/^\/[a-z-/]*$/);
  });
});

describe('isNavActive', () => {
  it('matches a whole section, but the home link only exactly', () => {
    expect(isNavActive('/', '/')).toBe(true);
    expect(isNavActive('/pro/agenda', '/')).toBe(false);
    expect(isNavActive('/pro/agenda', '/pro')).toBe(true);
    expect(isNavActive('/pro', '/pro')).toBe(true);
    expect(isNavActive('/produtos', '/pro')).toBe(false);
  });
});

describe('Navbar (demo mode)', () => {
  it('renders the demo links and the role switcher', () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/']}>
          <Navbar />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(screen.getAllByRole('link', { name: 'Categorias' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Prestador' }).length).toBeGreaterThan(0);
  });
});
