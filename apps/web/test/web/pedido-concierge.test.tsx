import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../contexts/AuthContext';
import Pedido from '../../pages/cliente/Pedido';

// Demo mode even when a developer's .env.local configures Supabase (Vitest loads it like Vite)
vi.mock('../../lib/supabase', () => ({ supabase: null, backendEnabled: false }));

const renderPedido = (path = '/pedido?servico=diarista') =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/pedido" element={<Pedido />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

describe('/pedido in concierge mode (no backend)', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.unstubAllEnvs());

  it('says online requests are not available when no WhatsApp number is configured', () => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '');
    renderPedido();
    expect(screen.getByText('Pedido online ainda não disponível')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    // Not a dead end: the demo professionals of the chosen service are one tap away
    expect(screen.getByRole('link', { name: /Ver profissionais de demonstração de Diarista/ })).toHaveAttribute(
      'href',
      '/search?q=Diarista',
    );
  });

  it('builds the wa.me link with the request', async () => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '5511999999999');
    const user = userEvent.setup();
    renderPedido();

    // Step 1: preselected from ?servico=diarista
    expect(screen.getByText(/Serviço escolhido:/)).toHaveTextContent('Diarista');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    // Step 2: a neighborhood is required
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha o bairro');
    await user.selectOptions(screen.getByLabelText(/Bairro onde o serviço será feito/), 'Pinheiros');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    // Step 3: description with at least 10 characters
    await user.type(screen.getByLabelText('Descreva o que você precisa'), 'Curto');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('10 a 2000 caracteres');
    fireEvent.change(screen.getByLabelText('Descreva o que você precisa'), {
      target: { value: 'Faxina de apartamento de 2 quartos & janelas' },
    });
    await user.type(screen.getByLabelText(/Quando\?/), 'sábado de manhã');
    await user.click(screen.getByLabelText('É urgente'));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    // Step 4: contact and the WhatsApp link
    await user.type(screen.getByLabelText(/Como podemos te chamar/), 'Maria');
    const link = screen.getByRole('link', { name: /Abrir o WhatsApp/ });
    const href = link.getAttribute('href') ?? '';
    const url = new URL(href);
    expect(url.origin).toBe('https://wa.me');
    expect(url.pathname).toBe('/5511999999999');
    expect(url.searchParams.get('text')).toBe(
      [
        'Olá! Quero fazer um pedido pelo WorkEasy.',
        '',
        'Serviço: Diarista',
        'Bairro: Pinheiros (São Paulo)',
        'Quando: sábado de manhã',
        'É urgente.',
        'Descrição: Faxina de apartamento de 2 quartos & janelas',
        'Nome: Maria',
      ].join('\n'),
    );
    // The message is URL-encoded, so "&" cannot split the query string
    expect(href).toContain('%26%20janelas');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('finds an occupation by synonym when there is no ?servico', async () => {
    vi.stubEnv('VITE_CONCIERGE_WHATSAPP', '5511999999999');
    const user = userEvent.setup();
    renderPedido('/pedido');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha o serviço');
    await user.type(screen.getByLabelText('O que você precisa?'), 'faxina');
    await user.click(screen.getByRole('button', { name: /Diarista/ }));
    expect(screen.getByText(/Serviço escolhido:/)).toHaveTextContent('Diarista');
  });
});
