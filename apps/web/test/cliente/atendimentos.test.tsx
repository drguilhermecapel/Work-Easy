import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CLIENT_ID, OLD_PERIOD, PROVIDER_ID, bookingRow, newWorld, noAdmin, worldTables, type FakeSupabase, type World } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { AuthProvider } = await import('../../contexts/AuthContext');
const { default: Atendimentos } = await import('../../pages/cliente/Atendimentos');
const { default: AtendimentoDetalhe } = await import('../../pages/cliente/AtendimentoDetalhe');
const fake = supabase as unknown as FakeSupabase;

let world: World;

const signInAs = (id: string) => {
  world.userId = id;
  fake.session = { access_token: 't', user: { id, email: 'a@example.com' } };
};

const renderAt = (path: string) =>
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/atendimentos" element={<Atendimentos />} />
          <Route path="/atendimentos/:id" element={<AtendimentoDetalhe />} />
          <Route path="/entrar" element={<p>Tela de entrar</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );

/** A period that ended `hoursAgo` hours ago, as Postgres prints it. */
const endedHoursAgo = (hoursAgo: number): string => {
  const end = new Date(Date.now() - hoursAgo * 3_600_000);
  const start = new Date(end.getTime() - 3_600_000);
  const text = (d: Date) => `"${d.toISOString().replace('T', ' ').replace('.000Z', '+00')}"`;
  return `[${text(start)},${text(end)})`;
};

describe('/atendimentos and /atendimentos/:id with a backend', () => {
  // The device is far from Brasília: times must still read as São Paulo time
  const originalTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Asia/Tokyo';
  });
  afterAll(() => {
    process.env.TZ = originalTz;
  });

  beforeEach(() => {
    sessionStorage.clear();
    fake.reset();
    world = newWorld();
    fake.tables = worldTables(world);
    fake.rpcs = { ...noAdmin, transition_booking: () => ({ data: 'canceled', error: null }) };
    signInAs(CLIENT_ID);
  });

  describe('list', () => {
    it('sends visitors to /entrar', async () => {
      fake.session = null;
      renderAt('/atendimentos');
      expect(await screen.findByText('Tela de entrar')).toBeInTheDocument();
    });

    it('lists the bookings with status, provider, São Paulo time and price', async () => {
      world.bookings = [bookingRow()];
      renderAt('/atendimentos');
      const link = await screen.findByRole('link', { name: /Diarista/ });
      expect(link).toHaveAttribute('href', '/atendimentos/book-1');
      expect(within(link).getByText('Aceito')).toBeInTheDocument();
      expect(within(link).getByText(/Profissional: Ana Diarista/)).toBeInTheDocument();
      expect(within(link).getByText(/13:00 às 14:00/)).toBeInTheDocument();
      expect(within(link).getByText('R$ 180,00')).toBeInTheDocument();
    });

    it('marks bookings where the user is the professional and names the client', async () => {
      signInAs(PROVIDER_ID);
      world.bookings = [bookingRow()];
      renderAt('/atendimentos');
      const link = await screen.findByRole('link', { name: /Diarista/ });
      expect(within(link).getByText('Como profissional')).toBeInTheDocument();
      expect(within(link).getByText(/Cliente: Maria Cliente/)).toBeInTheDocument();
    });

    it('explains the empty state', async () => {
      renderAt('/atendimentos');
      expect(await screen.findByText(/Você ainda não tem atendimentos/)).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Fazer um pedido' })).toHaveAttribute('href', '/pedido');
    });

    it('shows a database failure in pt-BR', async () => {
      world.errors.bookings = { code: '42501', message: 'permission denied for table bookings' };
      renderAt('/atendimentos');
      expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão para acessar ou alterar estes dados.');
    });
  });

  describe('detail', () => {
    it('shows the booking and its history', async () => {
      world.bookings = [bookingRow({ notes: 'Levar produtos' })];
      world.events = [
        { id: 'e1', booking_id: 'book-1', from_status: null, to_status: 'requested', actor_id: CLIENT_ID, reason: null, at: '2030-01-10T12:00:00Z' },
        { id: 'e2', booking_id: 'book-1', from_status: 'requested', to_status: 'accepted', actor_id: PROVIDER_ID, reason: 'Combinado', at: '2030-01-10T15:30:00Z' },
      ];
      renderAt('/atendimentos/book-1');
      expect(await screen.findByRole('heading', { level: 1, name: 'Diarista' })).toBeInTheDocument();
      expect(screen.getByText(/Profissional: Ana Diarista/)).toBeInTheDocument();
      expect(screen.getByText(/terça-feira, 15\/01\/2030, 13:00 às 14:00/)).toBeInTheDocument();
      expect(screen.getByText('Horário de Brasília.')).toBeInTheDocument();
      expect(screen.getByText(/Levar produtos/)).toBeInTheDocument();
      const history = screen.getByRole('heading', { name: 'Histórico' }).closest('section') as HTMLElement;
      expect(within(history).getByText('Criado como aguardando o profissional')).toBeInTheDocument();
      expect(within(history).getByText('Aguardando o profissional → Aceito')).toBeInTheDocument();
      expect(within(history).getByText(/Profissional · 10\/01\/2030 12:30/)).toBeInTheDocument(); // 15:30 UTC = 12:30 in São Paulo
      expect(within(history).getByText('Você · 10/01/2030 09:00')).toBeInTheDocument();
      expect(within(history).getByText('Motivo: Combinado')).toBeInTheDocument();
    });

    it('translates a failed read', async () => {
      renderAt('/atendimentos/nao-existe');
      expect(await screen.findByRole('alert')).toHaveTextContent('Não encontramos o que você procurou.');
    });

    it('client cancels an accepted booking with a reason', async () => {
      world.bookings = [bookingRow()];
      const user = userEvent.setup();
      renderAt('/atendimentos/book-1');
      await user.click(await screen.findByRole('button', { name: 'Cancelar atendimento' }));
      await user.type(screen.getByLabelText('Motivo (opcional)'), 'Mudei de planos');
      await user.click(screen.getByRole('button', { name: 'Confirmar: cancelar atendimento' }));
      await waitFor(() => expect(fake.rpcCalls.find(c => c.name === 'transition_booking')).toBeDefined());
      expect(fake.rpcCalls.find(c => c.name === 'transition_booking')?.args).toEqual({
        p_booking: 'book-1',
        p_to: 'canceled',
        p_reason: 'Mudei de planos',
      });
      expect(await screen.findByText('Atendimento cancelado.')).toBeInTheDocument();
    });

    it('asks payments-void to cancel the open charge after canceling an accepted booking', async () => {
      world.bookings = [bookingRow()];
      const user = userEvent.setup();
      renderAt('/atendimentos/book-1');
      await user.click(await screen.findByRole('button', { name: 'Cancelar atendimento' }));
      await user.click(screen.getByRole('button', { name: 'Confirmar: cancelar atendimento' }));
      expect(await screen.findByText('Atendimento cancelado.')).toBeInTheDocument();
      expect(fake.functionCalls).toEqual([{ name: 'payments-void', body: { booking_id: 'book-1' } }]);
    });

    it('keeps the cancellation and warns when payments-void fails', async () => {
      world.bookings = [bookingRow()];
      fake.functionsHandlers['payments-void'] = () => ({
        data: null,
        error: {
          name: 'FunctionsHttpError',
          message: 'non-2xx',
          context: new Response(JSON.stringify({ ok: false, error: { code: 'upstream_error', message: 'x' } }), { status: 502 }),
        },
      });
      const user = userEvent.setup();
      renderAt('/atendimentos/book-1');
      await user.click(await screen.findByRole('button', { name: 'Cancelar atendimento' }));
      await user.click(screen.getByRole('button', { name: 'Confirmar: cancelar atendimento' }));
      expect(await screen.findByText('Atendimento cancelado. A cobrança em aberto será cancelada em breve.')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('does not look for a charge when a request that was never accepted is canceled', async () => {
      world.bookings = [bookingRow({ status: 'requested' })];
      const user = userEvent.setup();
      renderAt('/atendimentos/book-1');
      await user.click(await screen.findByRole('button', { name: 'Cancelar atendimento' }));
      await user.click(screen.getByRole('button', { name: 'Confirmar: cancelar atendimento' }));
      expect(await screen.findByText('Atendimento cancelado.')).toBeInTheDocument();
      expect(fake.functionCalls).toEqual([]);
    });

    it('shows invalid_transition and not_allowed in pt-BR', async () => {
      world.bookings = [bookingRow()];
      const user = userEvent.setup();
      fake.rpcs.transition_booking = () => ({ data: null, error: { code: 'P0001', message: 'invalid_transition' } });
      renderAt('/atendimentos/book-1');
      await user.click(await screen.findByRole('button', { name: 'Cancelar atendimento' }));
      await user.click(screen.getByRole('button', { name: 'Confirmar: cancelar atendimento' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Esta mudança de situação não é permitida agora. Atualize a página e tente de novo.');

      fake.rpcs.transition_booking = () => ({ data: null, error: { code: 'P0001', message: 'not_allowed' } });
      await user.click(screen.getByRole('button', { name: 'Confirmar: cancelar atendimento' }));
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Você não tem permissão para fazer isso.'));
    });

    it('offers each role only its own transitions', async () => {
      world.bookings = [bookingRow({ status: 'requested' })];
      renderAt('/atendimentos/book-1');
      // Client: only cancel while the professional has not answered
      expect(await screen.findByRole('button', { name: 'Cancelar atendimento' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Aceitar atendimento' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Marcar como concluído' })).not.toBeInTheDocument();
    });

    it('professional accepts a requested booking', async () => {
      signInAs(PROVIDER_ID);
      world.bookings = [bookingRow({ status: 'requested' })];
      fake.rpcs.transition_booking = () => ({ data: 'accepted', error: null });
      const user = userEvent.setup();
      renderAt('/atendimentos/book-1');
      expect(await screen.findByText(/Cliente: Maria Cliente/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Recusar pedido' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Liberar atendimento' })).not.toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Aceitar atendimento' }));
      await waitFor(() => expect(fake.rpcCalls.find(c => c.name === 'transition_booking')?.args).toEqual({
        p_booking: 'book-1',
        p_to: 'accepted',
        p_reason: null,
      }));
      expect(await screen.findByText('Atendimento aceito.')).toBeInTheDocument();
    });

    it('professional completes a booking in progress; client cannot', async () => {
      world.bookings = [bookingRow({ status: 'in_progress' })];
      signInAs(PROVIDER_ID);
      fake.rpcs.transition_booking = () => ({ data: 'completed', error: null });
      const user = userEvent.setup();
      renderAt('/atendimentos/book-1');
      await user.click(await screen.findByRole('button', { name: 'Marcar como concluído' }));
      await waitFor(() => expect(fake.rpcCalls.find(c => c.name === 'transition_booking')?.args).toMatchObject({ p_to: 'completed' }));
    });

    it('client has no completion button while the booking is in progress', async () => {
      world.bookings = [bookingRow({ status: 'in_progress' })];
      renderAt('/atendimentos/book-1');
      await screen.findByRole('heading', { level: 1, name: 'Diarista' });
      expect(screen.queryByRole('button', { name: 'Marcar como concluído' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'O que você pode fazer' })).not.toBeInTheDocument();
    });

    it('client releases a completed booking', async () => {
      world.bookings = [bookingRow({ status: 'completed', period: endedHoursAgo(3) })];
      fake.rpcs.transition_booking = () => ({ data: 'released', error: null });
      const user = userEvent.setup();
      renderAt('/atendimentos/book-1');
      await user.click(await screen.findByRole('button', { name: 'Liberar atendimento' }));
      await user.click(screen.getByRole('button', { name: 'Confirmar: liberar atendimento' }));
      await waitFor(() => expect(fake.rpcCalls.find(c => c.name === 'transition_booking')?.args).toMatchObject({ p_to: 'released' }));
    });

    it('client contests a completed booking with a required reason', async () => {
      world.bookings = [bookingRow({ status: 'completed', period: endedHoursAgo(3) })];
      fake.rpcs.transition_booking = () => ({ data: 'disputed', error: null });
      const user = userEvent.setup();
      renderAt('/atendimentos/book-1');
      await user.click(await screen.findByRole('button', { name: 'Contestar atendimento' }));
      const confirm = screen.getByRole('button', { name: 'Confirmar: contestar atendimento' });
      expect(confirm).toBeDisabled();
      await user.type(screen.getByLabelText('Motivo'), 'O serviço não foi feito');
      await user.click(confirm);
      await waitFor(() =>
        expect(fake.rpcCalls.find(c => c.name === 'transition_booking')?.args).toEqual({
          p_booking: 'book-1',
          p_to: 'disputed',
          p_reason: 'O serviço não foi feito',
        }),
      );
      expect(await screen.findByText('Contestação registrada.')).toBeInTheDocument();
    });

    it('hides the dispute after 7 days but still allows releasing', async () => {
      world.bookings = [bookingRow({ status: 'completed', period: OLD_PERIOD })];
      renderAt('/atendimentos/book-1');
      expect(await screen.findByRole('button', { name: 'Liberar atendimento' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Contestar atendimento' })).not.toBeInTheDocument();
      expect(screen.getByText('O prazo de 7 dias para contestar este atendimento terminou.')).toBeInTheDocument();
    });

    it('a booking of an own client is charged by the professional', async () => {
      world.bookings = [bookingRow({ origin: 'own' })];
      renderAt('/atendimentos/book-1');
      expect(await screen.findByText(/combinado e cobrado diretamente com o profissional/)).toBeInTheDocument();
    });
  });
});
