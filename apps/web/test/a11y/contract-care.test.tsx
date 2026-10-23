import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { FAMILY_ID, newWorld, useWorld, type FakeSupabase } from '../cuidado/fake';
import { expectAccessibleScreen } from './contract';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { renderCare } = await import('../cuidado/render');
const fake = supabase as unknown as FakeSupabase;

beforeEach(() => {
  sessionStorage.clear();
  fake.reset();
  useWorld(fake, newWorld(FAMILY_ID));
});

describe('care line screens keep the accessibility contract', () => {
  it('/cuidado: houses, recipients and the forms to add them', async () => {
    renderCare('/cuidado');
    expect(await screen.findByRole('heading', { level: 1, name: /Cuidado/ })).toBeInTheDocument();
    expectAccessibleScreen();
  });

  it('/cuidado/plantoes: the shifts and their filters', async () => {
    renderCare('/cuidado/plantoes');
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expectAccessibleScreen();
  });
});
