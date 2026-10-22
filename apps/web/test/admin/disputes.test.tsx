import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BOOKING_ID, PROVIDER_ID } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createAdminFake, current } = await import('./fake');
  return { supabase: createAdminFake(() => current.world), backendEnabled: true };
});

const { callsOf, renderAdmin, resetWorld } = await import('./harness');

describe('disputas', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    resetWorld();
  });

  const open = async () => {
    renderAdmin('/admin/disputas');
    await screen.findByRole('heading', { name: 'Diarista' });
  };

  it('shows the dispute, its payments and the events of the booking', async () => {
    await open();
    expect(screen.getByText('R$ 180,00')).toBeInTheDocument();
    expect(screen.getAllByText('Cris Cliente').length).toBeGreaterThan(0);
    expect(screen.getByText('Recebido')).toBeInTheDocument();
    const events = (await screen.findByText('Criado como solicitado')).closest('ol') as HTMLElement;
    expect(within(events).getByText('Criado como solicitado')).toBeInTheDocument();
    expect(within(events).getByText('Concluído → Em contestação')).toBeInTheDocument();
    expect(within(events).getByText('Motivo: O serviço não foi feito.')).toBeInTheDocument();
    expect(within(events).getAllByText(/Cliente · /)).toHaveLength(2);
  });

  it('links the provider of the dispute to its page', async () => {
    await open();
    expect(screen.getByRole('link', { name: 'Dr. Paulo Cardio' })).toHaveAttribute('href', `/admin/prestadores/${PROVIDER_ID}`);
  });

  it('refuses to resolve a dispute without a reason, in the interface', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Liberar a favor do profissional' }));
    const form = screen.getByRole('form', { name: 'Encerrar a contestação a favor do profissional' });
    await user.click(within(form).getByRole('button', { name: 'Liberar atendimento' }));
    expect(within(form).getByText('Informe o motivo. Ele fica no histórico da ação.')).toBeInTheDocument();
    expect(callsOf('admin_resolve_dispute')).toHaveLength(0);

    await user.type(within(form).getByLabelText('Motivo da decisão (obrigatório)'), '    ');
    await user.click(within(form).getByRole('button', { name: 'Liberar atendimento' }));
    expect(callsOf('admin_resolve_dispute')).toHaveLength(0);
    // Still on the page, nothing changed
    expect(screen.getByRole('heading', { name: 'Diarista' })).toBeInTheDocument();
  });

  it('refuses the other outcome without a reason too', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Cancelar a favor do cliente' }));
    const form = screen.getByRole('form', { name: 'Encerrar a contestação a favor do cliente' });
    await user.click(within(form).getByRole('button', { name: 'Cancelar atendimento' }));
    expect(callsOf('admin_resolve_dispute')).toHaveLength(0);
  });

  it('resolves with the reason and takes the dispute off the list', async () => {
    await open();
    await user.click(screen.getByRole('button', { name: 'Cancelar a favor do cliente' }));
    const form = screen.getByRole('form', { name: 'Encerrar a contestação a favor do cliente' });
    expect(form).toHaveTextContent('depende de configuração do Asaas');
    await user.type(within(form).getByLabelText('Motivo da decisão (obrigatório)'), 'Cliente enviou fotos; serviço não feito.');
    await user.click(within(form).getByRole('button', { name: 'Cancelar atendimento' }));

    await waitFor(() => expect(callsOf('admin_resolve_dispute')).toHaveLength(1));
    expect(callsOf('admin_resolve_dispute')[0].args).toEqual({
      p_booking: BOOKING_ID,
      p_to: 'canceled',
      p_reason: 'Cliente enviou fotos; serviço não feito.',
    });
    expect(await screen.findByText('Nenhuma disputa aberta.')).toBeInTheDocument();
  });

  it('shows the translated server error when the booking is no longer disputed', async () => {
    const { fake } = await import('./harness');
    fake.rpcs.admin_resolve_dispute = () => ({ data: null, error: { code: 'P0001', message: 'invalid_transition' } });
    await open();
    await user.click(screen.getByRole('button', { name: 'Liberar a favor do profissional' }));
    const form = screen.getByRole('form', { name: 'Encerrar a contestação a favor do profissional' });
    await user.type(within(form).getByLabelText('Motivo da decisão (obrigatório)'), 'Prestador comprovou o serviço.');
    await user.click(within(form).getByRole('button', { name: 'Liberar atendimento' }));
    expect(await within(form).findByText(/Esta mudança de situação não é permitida agora/)).toBeInTheDocument();
  });

  it('says there are no open disputes', async () => {
    (await import('./fake')).current.world.tables.admin_open_disputes = [];
    renderAdmin('/admin/disputas');
    expect(await screen.findByText('Nenhuma disputa aberta.')).toBeInTheDocument();
  });
});
