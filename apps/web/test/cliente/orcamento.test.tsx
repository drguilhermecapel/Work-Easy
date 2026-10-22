import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { FakeSupabase } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { default: Orcamento } = await import('../../pages/publico/Orcamento');
const fake = supabase as unknown as FakeSupabase;

const TOKEN = '8f3c1a2e-5b7d-4e19-9c60-1d2e3f4a5b6c';

const quote = (overrides: Record<string, unknown> = {}) => ({
  id: 'q-1',
  title: 'Pintura da sala',
  client_name: 'Carlos',
  items: [
    { description: 'Mão de obra', quantity: 2, unit_price_cents: 15000 },
    { description: 'Tinta (lata 18 L)', quantity: 1.5, unit_price_cents: 20000 },
  ],
  total_cents: 60000,
  valid_until: '2030-02-10',
  notes: 'Material por conta do profissional.',
  status: 'sent',
  created_at: '2030-02-01T12:00:00Z',
  provider: { display_name: 'João Pintor', slug: 'joao-pintor', avatar_path: null, page_public: true },
  ...overrides,
});

// No AuthProvider and no session: the quote link must work for anyone who holds it
const renderAt = (token: string = TOKEN) =>
  render(
    <MemoryRouter initialEntries={[`/orcamento/${token}`]}>
      <Routes>
        <Route path="/orcamento/:token" element={<Orcamento />} />
      </Routes>
    </MemoryRouter>,
  );

describe('/orcamento/:token (public)', () => {
  beforeEach(() => {
    fake.reset();
    fake.rpcs = { get_quote_by_token: () => ({ data: quote(), error: null }), respond_quote: () => ({ data: 'accepted', error: null }) };
  });

  it('shows the quote to a visitor without a session: provider, items, total and validity', async () => {
    renderAt();
    expect(await screen.findByRole('heading', { level: 1, name: 'Pintura da sala' })).toBeInTheDocument();
    expect(fake.rpcCalls[0]).toEqual({ name: 'get_quote_by_token', args: { p_token: TOKEN } });
    expect(fake.authCalls).toEqual([]);
    expect(screen.getByRole('link', { name: 'João Pintor' })).toHaveAttribute('href', '/p/joao-pintor');
    expect(screen.getByText('Para: Carlos')).toBeInTheDocument();
    expect(screen.getByText(/Válido até 10\/02\/2030/)).toBeInTheDocument();
    expect(screen.getByText('Mão de obra')).toBeInTheDocument();
    expect(screen.getByText('2 × R$ 150,00')).toBeInTheDocument();
    expect(screen.getByText('1,5 × R$ 200,00')).toBeInTheDocument();
    expect(screen.getAllByText('R$ 300,00')).toHaveLength(2); // 2 x 150 and 1,5 x 200
    expect(screen.getByText('R$ 600,00')).toBeInTheDocument();
    expect(screen.getByText('Material por conta do profissional.')).toBeInTheDocument();
  });

  it('does not link to a provider page that is not public', async () => {
    fake.rpcs.get_quote_by_token = () => ({ data: quote({ provider: { display_name: 'João Pintor', slug: 'joao-pintor', avatar_path: null, page_public: false } }), error: null });
    renderAt();
    await screen.findByRole('heading', { level: 1, name: 'Pintura da sala' });
    expect(screen.getByText('João Pintor')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'João Pintor' })).not.toBeInTheDocument();
  });

  it('accepts after a confirmation step', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(await screen.findByRole('button', { name: 'Aceitar orçamento' }));
    expect(screen.getByText(/Confirmar que você aceita este orçamento de R\$ 600,00/)).toBeInTheDocument();
    expect(fake.rpcCalls.some(c => c.name === 'respond_quote')).toBe(false);

    // After the answer the quote is read again
    fake.rpcs.get_quote_by_token = () => ({ data: quote({ status: 'accepted' }), error: null });
    await user.click(screen.getByRole('button', { name: 'Sim, aceitar' }));

    await waitFor(() => expect(fake.rpcCalls.find(c => c.name === 'respond_quote')?.args).toEqual({ p_token: TOKEN, p_accept: true }));
    expect(await screen.findByText(/Orçamento aceito/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceitar orçamento' })).not.toBeInTheDocument();
  });

  it('declines', async () => {
    const user = userEvent.setup();
    fake.rpcs.respond_quote = () => ({ data: 'declined', error: null });
    renderAt();
    await user.click(await screen.findByRole('button', { name: 'Recusar orçamento' }));
    fake.rpcs.get_quote_by_token = () => ({ data: quote({ status: 'declined' }), error: null });
    await user.click(screen.getByRole('button', { name: 'Sim, recusar' }));
    await waitFor(() => expect(fake.rpcCalls.find(c => c.name === 'respond_quote')?.args).toEqual({ p_token: TOKEN, p_accept: false }));
    expect(await screen.findByText(/Orçamento recusado/)).toBeInTheDocument();
  });

  it('lets the user go back from the confirmation', async () => {
    const user = userEvent.setup();
    renderAt();
    await user.click(await screen.findByRole('button', { name: 'Aceitar orçamento' }));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('button', { name: 'Aceitar orçamento' })).toBeInTheDocument();
    expect(fake.rpcCalls.some(c => c.name === 'respond_quote')).toBe(false);
  });

  it('shows quote_expired in pt-BR and the expired status', async () => {
    const user = userEvent.setup();
    fake.rpcs.respond_quote = () => ({ data: null, error: { code: 'P0001', message: 'quote_expired' } });
    renderAt();
    await user.click(await screen.findByRole('button', { name: 'Aceitar orçamento' }));
    fake.rpcs.get_quote_by_token = () => ({ data: quote({ status: 'expired' }), error: null });
    await user.click(screen.getByRole('button', { name: 'Sim, aceitar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este orçamento passou da validade ou já foi respondido.');
    expect(await screen.findByText('Este orçamento passou da validade e não pode mais ser respondido.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceitar orçamento' })).not.toBeInTheDocument();
  });

  it('opens an already expired quote without answer buttons', async () => {
    fake.rpcs.get_quote_by_token = () => ({ data: quote({ status: 'expired' }), error: null });
    renderAt();
    expect(await screen.findByText('Este orçamento passou da validade e não pode mais ser respondido.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aceitar orçamento' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Recusar orçamento' })).not.toBeInTheDocument();
  });

  it('says an answered quote was already answered', async () => {
    const user = userEvent.setup();
    fake.rpcs.respond_quote = () => ({ data: null, error: { code: 'P0001', message: 'invalid_transition' } });
    renderAt();
    await user.click(await screen.findByRole('button', { name: 'Recusar orçamento' }));
    await user.click(screen.getByRole('button', { name: 'Sim, recusar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este orçamento já foi respondido.');
  });

  it('shows not found for an unknown token and for one that is not a uuid', async () => {
    fake.rpcs.get_quote_by_token = () => ({ data: null, error: null });
    const { unmount } = renderAt();
    expect(await screen.findByRole('heading', { name: 'Orçamento não encontrado' })).toBeInTheDocument();
    unmount();

    fake.rpcCalls.length = 0;
    renderAt('qualquer-coisa');
    expect(await screen.findByRole('heading', { name: 'Orçamento não encontrado' })).toBeInTheDocument();
    expect(fake.rpcCalls).toEqual([]); // no request for a malformed link
  });

  it('shows a failure in pt-BR', async () => {
    fake.rpcs.get_quote_by_token = () => ({ data: null, error: { message: 'Failed to fetch' } });
    renderAt();
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível falar com o servidor.');
  });

  it('has a print version and keeps the page out of search engines', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const user = userEvent.setup();
    const { unmount } = renderAt();
    await user.click(await screen.findByRole('button', { name: /Imprimir ou salvar em PDF/ }));
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    expect(document.querySelector('style')?.textContent).toContain('@media print');
    // Answer buttons are hidden when printing
    const actions = screen.getByRole('button', { name: 'Aceitar orçamento' }).parentElement as HTMLElement;
    expect(actions.className).toContain('print:hidden');
    expect(within(actions).getByRole('button', { name: /Imprimir/ })).toBeInTheDocument();
    unmount();
    expect(document.querySelector('meta[name="robots"]')).toBeNull();
  });
});
