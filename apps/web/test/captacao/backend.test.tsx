import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { STATIC_PAGES } from '../../components/captacao/content';
import type { FakeSupabase, TableCall } from '../web/fakeSupabase';
import { expectPageBasics, pageText, renderCaptacao } from './render';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const fake = supabase as unknown as FakeSupabase;

// One file per scenario: loadPublicSettings keeps the first answer for the whole session, so the
// values it reads (proposal limit, weekly limit, commission) must not change between the tests here.
let settings: Record<string, unknown>;

const okRows = (data: unknown) => ({ data, error: null });

beforeEach(() => {
  fake.reset();
  settings = {
    commission_enabled: false,
    commission_bps: 1200,
    escrow_enabled: false,
    pro_price_cents: 6900,
    proposal_limit: 4,
    labor_lock_days_per_week: 3,
    pro_trial_days: 14,
    free_proposals_per_month: 8,
  };
  fake.tables = {
    // The list (loadPublicSettings) and the single-key reads (price, trial, free allowance) of the same table
    platform_settings: (call: TableCall) => {
      const key = call.filters.find(([op, column]) => op === 'eq' && column === 'key')?.[2];
      if (call.single) return okRows(typeof key === 'string' && key in settings ? { value: settings[key] } : null);
      return okRows(Object.entries(settings).map(([k, value]) => ({ key: k, value })));
    },
  };
});

const PAGES = STATIC_PAGES.map(page => [page.path, page] as const);

describe('acquisition pages with a backend', () => {
  it.each(PAGES)('%s shows its entry, its call to action and an ordered outline, without demo notices', async (_path, page) => {
    const view = renderCaptacao(page.path);
    await expectPageBasics(page, view);
    expect(screen.queryByText(/Nesta versão de demonstração/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nesta demonstração não há valores reais/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível ler esses valores/)).not.toBeInTheDocument();
  });

  it('prints the Pro numbers it read from platform_settings', async () => {
    renderCaptacao('/para-profissionais');
    expect(await screen.findByText(/R\$\s69,00 por mês\./)).toBeInTheDocument();
    expect(screen.getByText(/14 dias para quem nunca assinou/)).toBeInTheDocument();
    expect(screen.getByText(/Até 8 propostas novas por mês em pedidos da plataforma/)).toBeInTheDocument();
    expect(screen.getByText(/Hoje está desligada: o WorkEasy não cobra comissão/)).toBeInTheDocument();
  });

  it('uses the singular for one day and one proposal', async () => {
    settings.pro_trial_days = 1;
    settings.free_proposals_per_month = 1;
    renderCaptacao('/para-profissionais');
    expect(await screen.findByText(/1 dia para quem nunca assinou/)).toBeInTheDocument();
    expect(screen.getByText(/Até 1 proposta nova por mês/)).toBeInTheDocument();
  });

  it('prints no trial and no allowance the platform does not set', async () => {
    settings.pro_trial_days = 0;
    settings.free_proposals_per_month = 0;
    renderCaptacao('/para-profissionais');
    expect(await screen.findByText(/Quando a plataforma oferece teste grátis, a tela de assinatura informa o prazo/)).toBeInTheDocument();
    expect(screen.getByText(/O plano grátis pode ter um limite mensal de propostas novas/)).toBeInTheDocument();
  });

  it('prints no price when the setting is not a number', async () => {
    settings.pro_price_cents = '49,00';
    const view = renderCaptacao('/para-profissionais');
    expect(await screen.findByText(/O valor aparece na tela de assinatura, depois do cadastro/)).toBeInTheDocument();
    expect(pageText(view.container)).not.toMatch(/R\$/);
  });

  it('prints the number of proposals a request can receive', async () => {
    renderCaptacao('/como-funciona');
    expect(await screen.findByText(/Cada pedido recebe até 4 propostas/)).toBeInTheDocument();
  });

  it('prints the weekly limit of the care line', async () => {
    renderCaptacao('/para-familias');
    const limit = await screen.findByText(/Hoje, o limite é de/);
    expect(limit).toHaveTextContent(/Hoje, o limite é de 3 dias diferentes por semana, de segunda a domingo, com o mesmo cuidador na mesma casa/);
  });

  it('only reads: platform_settings is the one table the pages touch', async () => {
    for (const { path } of STATIC_PAGES) {
      const view = renderCaptacao(path);
      await screen.findByRole('heading', { level: 1 });
      await screen.findAllByRole('link');
      view.unmount();
    }
    expect(fake.tableCalls.length).toBeGreaterThan(0);
    expect([...new Set(fake.tableCalls.map(call => call.table))]).toEqual(['platform_settings']);
    expect([...new Set(fake.tableCalls.map(call => call.op))]).toEqual(['select']);
    expect(fake.rpcCalls).toEqual([]);
    expect(fake.functionCalls).toEqual([]);
  });
});
