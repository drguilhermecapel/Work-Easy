import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../lib/supabase', async () => {
  const { createAdminFake, current } = await import('./fake');
  return { supabase: createAdminFake(() => current.world), backendEnabled: true };
});

const { fake, renderAdmin, resetWorld } = await import('./harness');

const queried = (table: string) => fake.tableCalls.some(call => call.table === table);

describe('route guard of /admin (backend)', () => {
  beforeEach(() => {
    resetWorld();
  });

  it('shows the panel to an administrator', async () => {
    renderAdmin('/admin');
    expect(await screen.findByRole('heading', { name: 'Painel' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Administração' })).toBeInTheDocument();
    expect(queried('admin_metrics')).toBe(true);
  });

  it('shows "Acesso restrito" to a signed-in user who is not an administrator, and reads nothing from the admin views', async () => {
    resetWorld({ isAdmin: false });
    renderAdmin('/admin/prestadores');
    expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('navigation', { name: 'Administração' })).not.toBeInTheDocument();
    expect(queried('admin_provider_queue')).toBe(false);
    expect(queried('admin_metrics')).toBe(false);
  });

  it('guards every section, not only the panel', async () => {
    resetWorld({ isAdmin: false });
    for (const path of ['/admin/configuracoes', '/admin/auditoria', '/admin/pagamentos', '/admin/lgpd', '/admin/disputas']) {
      const view = renderAdmin(path);
      expect(await screen.findByRole('heading', { name: 'Acesso restrito' })).toBeInTheDocument();
      view.unmount();
    }
    expect(fake.rpcCalls.every(call => call.name === 'is_admin')).toBe(true);
    expect(queried('platform_settings')).toBe(false);
    expect(queried('audit_log')).toBe(false);
  });

  it('does not call a failed read of the access "Acesso restrito": it offers to try again, and lets the administrator in', async () => {
    resetWorld();
    const real = fake.rpcs.is_admin;
    // The network stays down until the test brings it back. Counting the failed calls instead would
    // depend on how many reads the session context and the guard make before the click, which varies
    // with timing: the retry could then consume a failure and the screen would (rightly) show the error again.
    let offline = true;
    fake.rpcs.is_admin = args => (offline ? { data: null, error: { name: 'TypeError', message: 'Failed to fetch' } } : real(args));
    try {
      renderAdmin('/admin');
      expect(await screen.findByRole('heading', { name: 'Não foi possível confirmar o seu acesso' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Acesso restrito' })).not.toBeInTheDocument();
      offline = false;
      await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
      const panel = await screen.findByRole('heading', { name: 'Painel' });
      // Let the session context learn the access that was just confirmed: the panel must stay mounted
      // (the same element, one read of its data), not be rebuilt under the user
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });
      expect(panel).toBeInTheDocument();
      expect(fake.tableCalls.filter(call => call.table === 'admin_metrics')).toHaveLength(1);
    } finally {
      fake.rpcs.is_admin = real;
    }
  });

  it('sends a visitor without a session to /entrar and back', async () => {
    resetWorld({}, false);
    renderAdmin('/admin/configuracoes');
    expect(await screen.findByText('entrar:/entrar?next=%2Fadmin%2Fconfiguracoes')).toBeInTheDocument();
  });

  it('marks the section of the page in the menu', async () => {
    renderAdmin('/admin/auditoria');
    await screen.findByRole('heading', { name: 'Auditoria' });
    expect(screen.getByRole('link', { name: 'Auditoria' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Painel' })).not.toHaveAttribute('aria-current');
  });
});
