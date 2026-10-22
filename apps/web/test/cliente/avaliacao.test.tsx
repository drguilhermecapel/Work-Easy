import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CLIENT_ID, PROVIDER_ID, bookingRow, newWorld, noAdmin, paymentRow, worldTables, type FakeSupabase, type World } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

// Two occupations with fixed rules, so the test does not depend on catalog edits
vi.mock('../../catalog', async importOriginal => {
  const original = await importOriginal<typeof import('../../catalog')>();
  return {
    ...original,
    loadPolicies: () => Promise.resolve({ diarista: { ratingRanking: true }, 'sem-ranking': { ratingRanking: false } }),
  };
});

const { supabase } = await import('../../lib/supabase');
const { AuthProvider } = await import('../../contexts/AuthContext');
const { default: AtendimentoDetalhe } = await import('../../pages/cliente/AtendimentoDetalhe');
const fake = supabase as unknown as FakeSupabase;

let world: World;

const renderDetail = () =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/atendimentos/book-1']}>
        <Routes>
          <Route path="/atendimentos/:id" element={<AtendimentoDetalhe />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

describe('review of a booking', () => {
  beforeEach(() => {
    sessionStorage.clear();
    fake.reset();
    world = newWorld();
    world.bookings = [bookingRow({ status: 'completed' })];
    fake.tables = worldTables(world);
    fake.rpcs = { ...noAdmin };
    fake.session = { access_token: 't', user: { id: CLIENT_ID } };
  });

  it('is blocked while the booking was not paid through the app', async () => {
    renderDetail();
    expect(await screen.findByText('A avaliação só pode ser feita depois de um atendimento concluído e pago pelo app.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar avaliação' })).not.toBeInTheDocument();
  });

  it('stays blocked when the only charge is still pending', async () => {
    world.payments = [paymentRow({ status: 'pending' })];
    renderDetail();
    expect(await screen.findByText(/só pode ser feita depois de um atendimento concluído e pago pelo app/)).toBeInTheDocument();
  });

  it('is not offered before the booking is completed', async () => {
    world.bookings = [bookingRow({ status: 'in_progress' })];
    world.payments = [paymentRow()];
    renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Diarista' });
    expect(screen.queryByRole('heading', { name: 'Avaliar o atendimento' })).not.toBeInTheDocument();
  });

  it('sends the rating and the comment of a paid, completed booking', async () => {
    world.payments = [paymentRow()];
    const user = userEvent.setup();
    renderDetail();

    const send = await screen.findByRole('button', { name: 'Enviar avaliação' });
    expect(send).toBeDisabled(); // a rating is required
    await user.click(screen.getByLabelText('4 estrelas'));
    await user.type(screen.getByLabelText('Comentário (opcional)'), '  Ótimo trabalho  ');
    await user.click(send);

    await waitFor(() => expect(fake.tableCalls.find(c => c.table === 'reviews' && c.op === 'insert')).toBeDefined());
    expect(fake.tableCalls.find(c => c.table === 'reviews' && c.op === 'insert')?.payload).toEqual({
      booking_id: 'book-1',
      client_id: CLIENT_ID,
      rating: 4,
      comment: 'Ótimo trabalho',
    });
    expect(await screen.findByText('Avaliação enviada. Obrigado!')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Nota 4 de 5' })).toBeInTheDocument();
  });

  it('translates review_not_allowed from the database', async () => {
    world.payments = [paymentRow()];
    const user = userEvent.setup();
    renderDetail();
    // The database has the last word: here it refuses
    fake.tables.reviews = call =>
      call.op === 'insert'
        ? { data: null, error: { code: 'P0001', message: 'review_not_allowed' } }
        : { data: null, error: null };
    await user.click(await screen.findByLabelText('5 estrelas'));
    await user.click(screen.getByRole('button', { name: 'Enviar avaliação' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A avaliação só pode ser feita depois de um atendimento concluído e pago pelo app.');
  });

  it('warns that ratings are not public when the occupation does not allow it', async () => {
    world.bookings = [bookingRow({ status: 'released', occupation_slug: 'sem-ranking' })];
    world.payments = [paymentRow()];
    renderDetail();
    expect(await screen.findByText(/as avaliações não são exibidas publicamente: só você e o profissional veem a sua/)).toBeInTheDocument();
  });

  it('does not warn when ratings are public', async () => {
    world.payments = [paymentRow()];
    renderDetail();
    await screen.findByRole('button', { name: 'Enviar avaliação' });
    expect(screen.queryByText(/não são exibidas publicamente/)).not.toBeInTheDocument();
  });

  it('shows an existing private review with its note', async () => {
    world.bookings = [bookingRow({ status: 'released', occupation_slug: 'sem-ranking' })];
    world.payments = [paymentRow()];
    world.reviews = [{ id: 'r1', booking_id: 'book-1', client_id: CLIENT_ID, provider_id: PROVIDER_ID, rating: 5, comment: 'Excelente', published: false, created_at: '2030-02-01T12:00:00Z' }];
    renderDetail();
    expect(await screen.findByText('Excelente')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Nota 5 de 5' })).toBeInTheDocument();
    expect(screen.getByText(/não são exibidas publicamente/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar avaliação' })).not.toBeInTheDocument();
  });

  it('the professional reads the review but cannot write one', async () => {
    fake.session = { access_token: 't', user: { id: PROVIDER_ID } };
    world.userId = PROVIDER_ID;
    world.payments = [paymentRow()];
    world.reviews = [{ id: 'r1', booking_id: 'book-1', client_id: CLIENT_ID, provider_id: PROVIDER_ID, rating: 3, comment: 'Bom', published: true, created_at: '2030-02-01T12:00:00Z' }];
    renderDetail();
    expect(await screen.findByText('Bom')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar avaliação' })).not.toBeInTheDocument();
  });

  it('the professional sees no review block without a review', async () => {
    fake.session = { access_token: 't', user: { id: PROVIDER_ID } };
    world.userId = PROVIDER_ID;
    renderDetail();
    await screen.findByRole('heading', { level: 1, name: 'Diarista' });
    expect(screen.queryByRole('heading', { name: /Avali/ })).not.toBeInTheDocument();
  });
});
