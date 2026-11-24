import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { profileRow, type FakeSupabase } from '../web/fakeSupabase';
import { expectAccessibleScreen } from './contract';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { AuthProvider } = await import('../../contexts/AuthContext');
const { default: Entrar } = await import('../../pages/conta/Entrar');
const { default: Pedido } = await import('../../pages/cliente/Pedido');
const fake = supabase as unknown as FakeSupabase;

const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/entrar" element={<Entrar />} />
          <Route path="/pedido" element={<Pedido />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

beforeEach(() => {
  sessionStorage.clear();
  fake.reset();
  fake.tables = {
    profiles: () => ({ data: profileRow('user-1'), error: null }),
    neighborhoods: () => ({
      data: [
        { id: 'nb-lapa', city: 'São Paulo', name: 'Lapa', slug: 'lapa', zone: 'Oeste' },
        { id: 'nb-pinheiros', city: 'São Paulo', name: 'Pinheiros', slug: 'pinheiros', zone: 'Oeste' },
      ],
      error: null,
    }),
  };
  fake.rpcs = { is_admin: () => ({ data: false, error: null }) };
});

describe('/entrar', () => {
  it('names every control and ties a refusal to the field it is about', async () => {
    const user = userEvent.setup();
    renderAt('/entrar');
    expect(await screen.findByRole('group', { name: 'Receber o código por' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /E-mail/ })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /Celular/ }));
    const phone = screen.getByLabelText('Seu celular com DDD');
    expect(phone).not.toHaveAttribute('aria-invalid');
    expectAccessibleScreen();

    await user.type(phone, '98765');
    await user.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
    await user.click(screen.getByRole('checkbox', { name: /18 anos/ }));
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Confira o número de telefone informado');
    expect(phone).toHaveAttribute('aria-invalid', 'true');
    expect(phone).toHaveAccessibleDescription(/Confira o número de telefone informado/);
    expect(phone).toHaveAccessibleDescription(/O envio por SMS depende do provedor/);
    expectAccessibleScreen();
  });

  it('puts the focus on the code field when the code step opens, and names it', async () => {
    const user = userEvent.setup();
    renderAt('/entrar');
    await user.type(await screen.findByLabelText('Seu e-mail'), 'maria@example.com');
    await user.click(screen.getByRole('checkbox', { name: /Li e aceito/ }));
    await user.click(screen.getByRole('checkbox', { name: /18 anos/ }));
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    const code = await screen.findByLabelText('Código');
    expect(code).toHaveFocus();
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    expectAccessibleScreen();
  });
});

describe('/pedido', () => {
  it('announces the current step and keeps the contract in every step', async () => {
    const user = userEvent.setup();
    renderAt('/pedido?servico=diarista');
    const steps = await screen.findByRole('list', { name: 'Etapas do pedido' });
    expect(within(steps).getAllByRole('listitem')[0]).toHaveAttribute('aria-current', 'step');
    expectAccessibleScreen();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(within(steps).getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step');
    expect(await screen.findByLabelText(/Bairro onde/)).toBeInTheDocument();
    expectAccessibleScreen();
  });

  it('step 1: points the empty search to the message and moves the focus to it', async () => {
    const user = userEvent.setup();
    renderAt('/pedido');
    const search = await screen.findByLabelText('O que você precisa?');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha o serviço que você precisa.');
    expect(search).toHaveAttribute('aria-invalid', 'true');
    expect(search).toHaveAccessibleDescription('Escolha o serviço que você precisa.');
    expect(search).toHaveFocus();
    expectAccessibleScreen();
  });

  it('step 2: the neighborhood list is invalid until one is chosen', async () => {
    const user = userEvent.setup();
    renderAt('/pedido?servico=diarista');
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    const select = await screen.findByLabelText(/Bairro onde/);
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escolha o bairro onde o serviço será feito.');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveFocus();
    await user.selectOptions(select, 'Pinheiros');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByLabelText('Descreva o que você precisa')).toBeInTheDocument();
  });

  it('step 3: the description is read with its help and with the message', async () => {
    const user = userEvent.setup();
    renderAt('/pedido?servico=diarista');
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.selectOptions(await screen.findByLabelText(/Bairro onde/), 'Pinheiros');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    const description = await screen.findByLabelText('Descreva o que você precisa');
    expect(description).toHaveAccessibleDescription(/caracteres, mínimo/);
    await user.type(description, 'curto');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Descreva o que precisa com');
    expect(description).toHaveAttribute('aria-invalid', 'true');
    expect(description).toHaveAccessibleDescription(/caracteres, mínimo[\s\S]*Descreva o que precisa com/);
    expect(description).toHaveFocus();
    expectAccessibleScreen();
  });
});
