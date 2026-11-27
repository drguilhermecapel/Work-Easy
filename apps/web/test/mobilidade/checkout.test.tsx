import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { RideCheckout } from '../../components/mobility/RideCheckout';

const { rpc, invoke } = vi.hoisted(() => ({ rpc: vi.fn(), invoke: vi.fn() }));
vi.mock('../../services/client', () => ({ db: () => ({ rpc }), unwrapMaybe: (result: { data: unknown }) => result.data, invokeFunction: invoke }));
const leg = '8adda18a-9827-4f3d-bad5-b21bd0e1c862';
beforeEach(() => vi.resetAllMocks());

it.each([
  { simulation: true, rpcName: 'ride_sandbox_payment_view', endpoint: 'ride-sandbox-checkout', label: 'Emitir cobrança de teste' },
  { simulation: false, rpcName: 'ride_live_payment_view', endpoint: 'ride-live-checkout', label: 'Emitir fatura Pix' },
])('emite somente na fonte selecionada pelo projeto ($rpcName)', async ({ simulation, rpcName, endpoint, label }) => {
  rpc.mockResolvedValue({ data: { state: 'available', amount_cents: 2100, refunded_cents: 0, invoice_url: null } });
  invoke.mockResolvedValue({});
  render(<RideCheckout legId={leg} simulation={simulation} />);
  fireEvent.click(await screen.findByRole('button', { name: label }));
  await waitFor(() => expect(invoke).toHaveBeenCalledWith(endpoint, { leg_id: leg }));
  expect(rpc).toHaveBeenCalledWith(rpcName, { p_leg: leg });
});

it('bloqueia uma fatura do outro ambiente e esconde o painel de um trecho sem permissão', async () => {
  rpc.mockResolvedValueOnce({ data: { state: 'pending', amount_cents: 2100, refunded_cents: 0, invoice_url: 'https://sandbox.asaas.com/i/exemplo' } })
    .mockResolvedValueOnce({ data: null });
  const view = render(<RideCheckout legId={leg} simulation={false} />);
  expect(await screen.findByText(/Pagamento do trecho por Pix/)).toBeVisible();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  view.rerender(<RideCheckout legId="outro" simulation={false} />);
  await waitFor(() => expect(rpc).toHaveBeenCalledWith('ride_live_payment_view', { p_leg: 'outro' }));
  expect(screen.queryByText(/Pagamento do trecho por Pix/)).not.toBeInTheDocument();
  expect(invoke).not.toHaveBeenCalled();
});
