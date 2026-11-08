import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { expectAccessibleScreen } from './contract';

vi.mock('../../lib/supabase', async () => {
  const { createAdminFake, current } = await import('../admin/fake');
  return { supabase: createAdminFake(() => current.world), backendEnabled: true };
});

const { renderAdmin, resetWorld } = await import('../admin/harness');

beforeEach(() => {
  resetWorld();
});

describe('administration screens keep the accessibility contract', () => {
  it('/admin/prestadores: the queue is a list of named links', async () => {
    renderAdmin('/admin/prestadores');
    expect(await screen.findByRole('link', { name: /Dr\. Paulo Cardio/ })).toBeInTheDocument();
    expectAccessibleScreen();
  });

  it('/admin/configuracoes: every setting is a named field', async () => {
    renderAdmin('/admin/configuracoes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Configurações da plataforma' })).toBeInTheDocument();
    // Each setting is a group named by its heading, with a button or a text field inside
    expect((await screen.findAllByRole('group')).length).toBeGreaterThan(0);
    expectAccessibleScreen();
  });
});
