import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';

// No VITE_SUPABASE_URL: the demo mode
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

const { renderPro } = await import('./render');

const ROUTES = [
  '/pro',
  '/pro/cadastro',
  '/pro/servicos',
  '/pro/agenda',
  '/pro/pedidos',
  '/pro/orcamentos',
  '/pro/clientes',
  '/pro/cobrancas',
  '/pro/assinatura',
];

describe('Pro area in the demo mode', () => {
  it.each(ROUTES)('%s shows a notice instead of breaking', async path => {
    renderPro(path);
    expect(await screen.findByRole('heading', { name: 'Ferramenta do profissional ainda não disponível' })).toBeInTheDocument();
    expect(screen.getByText(/nesta versão de demonstração nada é guardado/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver categorias' })).toBeInTheDocument();
  });
});
