import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CLIENT_ID, bookingRow, newWorld, noAdmin, paymentRow, worldTables, type FakeSupabase } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createFakeSupabase } = await import('../web/fakeSupabase');
  return { supabase: createFakeSupabase(), backendEnabled: true };
});

const { supabase } = await import('../../lib/supabase');
const { AuthProvider } = await import('../../contexts/AuthContext');
const { default: AtendimentoDetalhe } = await import('../../pages/cliente/AtendimentoDetalhe');
const fake = supabase as unknown as FakeSupabase;

// Own file: loadPublicSettings caches the first answer for the whole session
describe('held payment wording needs platform_settings.escrow_enabled', () => {
  beforeEach(() => {
    fake.reset();
    const world = newWorld();
    world.bookings = [bookingRow()];
    world.settings = [{ key: 'escrow_enabled', value: true }];
    fake.tables = worldTables(world);
    fake.rpcs = { ...noAdmin };
    fake.session = { access_token: 't', user: { id: CLIENT_ID } };
  });

  it('mentions the held payment when escrow is on', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/atendimentos/book-1']}>
          <Routes>
            <Route path="/atendimentos/:id" element={<AtendimentoDetalhe />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByText(/Pagamento retido: o valor só é repassado/)).toBeInTheDocument();
    expect(screen.queryByText(/O pagamento é feito pelo app/)).not.toBeInTheDocument();
  });
});

describe('held payment status without escrow', () => {
  it('is read as received when the setting is off', async () => {
    // Same module registry as above, so the cached settings still say escrow on:
    // the wording below is checked in the component through its prop instead
    const { default: PaymentPanel } = await import('../../components/cliente/PaymentPanel');
    const { roleIn } = await import('../../services/bookings');
    const raw = bookingRow();
    const booking = {
      ...(raw as never as Parameters<typeof PaymentPanel>[0]['booking']),
      when: null,
      role: roleIn(raw as never, CLIENT_ID),
      counterpart_name: null,
      counterpart_slug: null,
    };
    render(
      <MemoryRouter>
        <PaymentPanel
          booking={booking}
          payments={[paymentRow({ status: 'held' }) as never]}
          escrowEnabled={false}
          today="2030-01-01"
          onChanged={() => undefined}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Pagamento recebido pelo app/)).toBeInTheDocument();
    expect(screen.queryByText(/retido/i)).not.toBeInTheDocument();
  });
});
