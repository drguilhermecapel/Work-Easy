import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { baseTables, occupationRow, ok, policyRow, providerRow, signInProvider, type ProFake } from '../pro/fake';
import { expectAccessibleScreen } from './contract';

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
});

describe('Pro screens keep the accessibility contract', () => {
  it('/pro/cadastro for someone who is not a provider yet: every field is named and the tabs are labelled', async () => {
    fake.tables = baseTables({ provider: null });
    renderPro('/pro/cadastro');
    expect(await screen.findByLabelText('Nome de exibição')).toBeInTheDocument();
    expect(screen.getByLabelText('Endereço da sua página')).toHaveAccessibleDescription(/Só letras minúsculas/);
    expect(screen.getByLabelText('Ocupação principal')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Cadastro de profissional' })).toBeInTheDocument();
    expectAccessibleScreen();
  });

  it('/pro/servicos: tabs, form and list', async () => {
    fake.tables = {
      ...baseTables({ provider: providerRow() }),
      provider_occupations: () => ok([occupationRow('diarista')]),
      occupation_policies: () => ok([policyRow('diarista', { price_units: ['dia'] })]),
    };
    renderPro('/pro/servicos');
    expect(await screen.findByRole('heading', { level: 1, name: 'Serviços e preços' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Ferramentas do profissional' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Serviços' })).toHaveAttribute('aria-current', 'page');
    expectAccessibleScreen();
  });
});
