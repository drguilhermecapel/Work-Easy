import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { STATIC_PAGES } from '../../components/captacao/content';
import type { FakeSupabase } from '../web/fakeSupabase';
import { expectPageBasics, pageText, renderCaptacao } from './render';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const fake = supabase as unknown as FakeSupabase;

// A backend that cannot be read: config/features answers its own defaults (price 49, three proposals,
// two days a week), and those are not values read from the platform, so no page may print them.
beforeEach(() => {
  fake.reset();
  fake.tables = {
    platform_settings: () => ({ data: null, error: { code: '500', message: 'connection reset' } }),
  };
});

describe('acquisition pages when platform_settings cannot be read', () => {
  it.each(STATIC_PAGES.map(page => [page.path, page] as const))('%s still renders its entry and says the values could not be read', async (_path, page) => {
    const view = renderCaptacao(page.path);
    await expectPageBasics(page, view);
    expect(await screen.findByText(/Não foi possível ler esses valores agora/)).toBeInTheDocument();
    expect(screen.queryByText(/Nesta versão de demonstração/)).not.toBeInTheDocument();
  });

  it('prints none of the defaults of config/features on the Pro section', async () => {
    const view = renderCaptacao('/para-profissionais');
    await screen.findByText(/Não foi possível ler esses valores agora/);
    expect(screen.getByText(/O valor aparece na tela de assinatura, depois do cadastro/)).toBeInTheDocument();
    expect(screen.getByText(/A forma de cobrança prevista para cada ocupação aparece na página do serviço/)).toBeInTheDocument();
    expect(pageText(view.container)).not.toMatch(/R\$/);
    expect(pageText(view.container)).not.toMatch(/comissão sobre serviços fechados/);
  });

  it('prints no proposal limit and no weekly limit', async () => {
    renderCaptacao('/como-funciona');
    expect(await screen.findByText(/Cada pedido recebe um número limitado de propostas/)).toBeInTheDocument();
    expect(screen.queryByText(/Cada pedido recebe até/)).not.toBeInTheDocument();
    renderCaptacao('/para-familias');
    expect(await screen.findByText(/é definido pela plataforma/)).toBeInTheDocument();
    expect(screen.queryByText(/Hoje, o limite é de/)).not.toBeInTheDocument();
  });
});
