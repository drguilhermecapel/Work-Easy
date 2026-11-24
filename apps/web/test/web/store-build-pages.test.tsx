import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { baseTables, ok, providerRow, signInProvider, type ProFake } from '../pro/fake';

// What a store build (VITE_STORE_BUILD=android or ios) shows on the screens that carry the sale of the Pro plan,
// rendered with the real route table. The flags are read when the code runs (config/features.ts), so the same
// pages are rendered with the variable set and unset. scripts/check-store-bundle.mjs proves the build sets it.

vi.mock('../../lib/supabase', async () => {
  const { createProFake } = await import('../pro/fake');
  return { supabase: createProFake(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderPro } = await import('../pro/render');
const fake = supabase as unknown as ProFake;

beforeEach(() => {
  fake.reset();
  signInProvider(fake);
  const provider = providerRow({ plan: 'free' });
  fake.tables = {
    ...baseTables({ provider }),
    providers: () => ok(provider),
    subscriptions: () => ok(null),
    provider_payment_accounts: () => ok(null),
    platform_settings: (call: { filters: Array<[string, string, unknown]> }) =>
      call.filters.find(([, column]) => column === 'key')?.[2] === 'pro_price_cents' ? ok({ value: 4900 }) : ok([]),
  };
});
afterEach(() => vi.unstubAllEnvs());

describe('/pro/assinatura', () => {
  it('on the site offers the plan with its price and the button to subscribe', async () => {
    renderPro('/pro/assinatura');
    expect(await screen.findByText(/R\$\s49,00 por mês/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assinar o Pro' })).toBeInTheDocument();
  });

  it.each(['android', 'ios'])('in a %s store build only shows the plan: no price, no button, no link to pay elsewhere', async store => {
    vi.stubEnv('VITE_STORE_BUILD', store);
    renderPro('/pro/assinatura');
    expect(await screen.findByText(/Nesta versão do aplicativo não é possível assinar nem alterar o plano/)).toBeInTheDocument();
    expect(screen.getByText('grátis', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Assinar/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$\s*\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/por mês|Abrir a fatura|Forma de pagamento da assinatura/)).not.toBeInTheDocument();
    expect(document.querySelector('a[href^="http"]')).toBeNull();
  });
});

describe('/pro (painel)', () => {
  it('on the site sends a free provider to "Conhecer o plano Pro"', async () => {
    renderPro('/pro');
    expect(await screen.findByRole('link', { name: 'Conhecer o plano Pro' })).toHaveAttribute('href', '/pro/assinatura');
  });

  it('in a store build names the same screen "Plano e recebimento" and does not advertise the Pro', async () => {
    vi.stubEnv('VITE_STORE_BUILD', 'android');
    renderPro('/pro');
    expect(await screen.findByRole('link', { name: 'Plano e recebimento' })).toHaveAttribute('href', '/pro/assinatura');
    expect(screen.queryByRole('link', { name: /Conhecer o plano Pro/ })).not.toBeInTheDocument();
  });
});
