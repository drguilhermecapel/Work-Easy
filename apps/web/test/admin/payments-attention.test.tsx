import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { current, manyPayments, PROVIDER_ID, type Row } from './fake';

vi.mock('../../lib/supabase', async () => {
  const { createAdminFake, current: world } = await import('./fake');
  return { supabase: createAdminFake(() => world.world), backendEnabled: true };
});

const { callsOf, fake, renderAdmin, resetWorld } = await import("./harness");
const { ATTENTION_LIMIT, listPaymentsNeedingAttention, markPaymentReviewed } = await import('../../services/admin');

const PAY_FAILED = 'f0000000-0000-4000-8000-000000000011';
const PAY_LATE = 'f0000000-0000-4000-8000-000000000012';

/** A row of the view admin_payments_attention (the database decides which entries are still open). */
const entry = (overrides: Row): Row => ({
  audit_id: 1,
  action: 'payment.refund_failed',
  at: '2026-10-20T15:00:00Z',
  data: {},
  payment_id: PAY_FAILED,
  booking_id: 'd0000000-0000-4000-8000-000000000004',
  provider_id: PROVIDER_ID,
  method: 'boleto',
  amount_cents: 15000,
  status: 'received',
  ...overrides,
});

const seedAttention = () => {
  current.world.tables.admin_payments_attention = [
    entry({ audit_id: 12, action: 'payment.refund_failed', at: '2026-10-20T15:01:00Z', data: { code: 'asaas_400', message: 'Boleto não pode ser estornado.' } }),
    entry({ audit_id: 11, action: 'payment.received_after_cancel', at: '2026-10-20T15:00:00Z', data: { event: 'PAYMENT_RECEIVED' } }),
    entry({ audit_id: 7, action: 'payment.received_after_cancel', at: '2026-10-18T09:00:00Z', payment_id: PAY_LATE, method: 'pix', amount_cents: 8000, data: {} }),
  ];
};

/** The section, once its first read has finished. */
const section = async () => {
  const region = await screen.findByRole('region', { name: 'Exigem atenção' });
  await waitFor(() => expect(within(region).queryByRole('status')).not.toBeInTheDocument());
  return region;
};

describe('pagamentos que exigem atenção', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    resetWorld();
  });

  it('shows, on top of the payments, the open entries grouped by payment with a link to each', async () => {
    seedAttention();
    current.world.tables.payments = manyPayments(2);
    renderAdmin('/admin/pagamentos');
    const attention = await section();
    // The section comes before the filters and the list
    const filters = screen.getByRole('form', { name: 'Filtros de pagamentos' });
    expect(attention.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const items = within(attention).getAllByRole('listitem').filter(li => li.hasAttribute('data-payment-id'));
    expect(items.map(li => li.getAttribute('data-payment-id'))).toEqual([PAY_FAILED, PAY_LATE]);

    const failed = items[0];
    expect(within(failed).getByText('R$ 150,00')).toBeInTheDocument();
    expect(within(failed).getByText('O reembolso automático foi recusado')).toBeInTheDocument();
    expect(within(failed).getByText('Pagamento recebido depois do cancelamento do atendimento')).toBeInTheDocument();
    expect(within(failed).getByText('Código: asaas_400')).toBeInTheDocument();
    expect(within(failed).getByText('Boleto não pode ser estornado.')).toBeInTheDocument();
    expect(within(failed).getByRole('link', { name: /Ver o pagamento f0000000/ })).toHaveAttribute('href', `/admin/pagamentos?pagamento=${PAY_FAILED}`);
    expect(within(failed).getByRole('link', { name: 'Dr. Paulo Cardio' })).toHaveAttribute('href', `/admin/prestadores/${PROVIDER_ID}`);
    expect(within(items[1]).getByText('R$ 80,00')).toBeInTheDocument();
  });

  it('asks the view for the entries, newest first, and never reads the audit log directly', async () => {
    seedAttention();
    renderAdmin('/admin/pagamentos');
    await section();
    const call = fake.tableCalls.find(c => c.table === 'admin_payments_attention');
    expect(call?.columns).not.toMatch(/\*/);
    expect(fake.ranges.find(r => r.table === 'admin_payments_attention')).toEqual({ table: 'admin_payments_attention', from: 0, to: ATTENTION_LIMIT });
    expect(fake.tableCalls.some(c => c.table === 'audit_log')).toBe(false);
  });

  it('says so when nothing needs attention', async () => {
    renderAdmin('/admin/pagamentos');
    const attention = await section();
    expect(await within(attention).findByText('Nenhum pagamento exige ação manual agora.')).toBeInTheDocument();
    expect(within(attention).queryByRole('button')).not.toBeInTheDocument();
  });

  it('refuses to mark as handled without a reason, in the interface', async () => {
    seedAttention();
    renderAdmin('/admin/pagamentos');
    const attention = await section();
    const [first] = await within(attention).findAllByRole('button', { name: 'Marcar como tratado' });
    await user.click(first);
    const form = within(attention).getByRole('form', { name: 'Marcar este pagamento como tratado' });
    await user.click(within(form).getByRole('button', { name: 'Marcar como tratado' }));
    expect(within(form).getByText('Informe o motivo. Ele fica no histórico da ação.')).toBeInTheDocument();
    await user.type(within(form).getByLabelText('O que foi feito (obrigatório)'), '   ');
    await user.click(within(form).getByRole('button', { name: 'Marcar como tratado' }));
    expect(callsOf('admin_review_payment')).toHaveLength(0);
  });

  it('records the reason and takes the payment off the list', async () => {
    seedAttention();
    renderAdmin('/admin/pagamentos');
    const attention = await section();
    const [first] = await within(attention).findAllByRole('button', { name: 'Marcar como tratado' });
    await user.click(first);
    const form = within(attention).getByRole('form', { name: 'Marcar este pagamento como tratado' });
    await user.type(within(form).getByLabelText('O que foi feito (obrigatório)'), 'Devolvido no painel do Asaas em 21/10.');
    await user.click(within(form).getByRole('button', { name: 'Marcar como tratado' }));

    await waitFor(() => expect(callsOf('admin_review_payment')).toHaveLength(1));
    expect(callsOf('admin_review_payment')[0].args).toEqual({ p_payment: PAY_FAILED, p_reason: 'Devolvido no painel do Asaas em 21/10.' });
    await waitFor(() => expect(attention.querySelector(`[data-payment-id="${PAY_FAILED}"]`)).toBeNull());
    expect(attention.querySelector(`[data-payment-id="${PAY_LATE}"]`)).not.toBeNull();
    // The database wrote the audit entry the view looks for
    expect(current.world.tables.audit_log).toContainEqual(
      expect.objectContaining({ action: 'payment.reviewed', entity_id: PAY_FAILED, data: { reason: 'Devolvido no painel do Asaas em 21/10.' } }),
    );
  });

  it('shows the database refusal when someone else already handled it', async () => {
    seedAttention();
    renderAdmin('/admin/pagamentos');
    const attention = await section();
    const [first] = await within(attention).findAllByRole('button', { name: 'Marcar como tratado' });
    await user.click(first);
    const form = within(attention).getByRole('form', { name: 'Marcar este pagamento como tratado' });
    // Another administrator settled it in the meantime
    current.world.tables.admin_payments_attention = [];
    await user.type(within(form).getByLabelText('O que foi feito (obrigatório)'), 'Tratado');
    await user.click(within(form).getByRole('button', { name: 'Marcar como tratado' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Atualize a página');
  });

  it('opens one payment from the link, with a way back to all of them', async () => {
    seedAttention();
    current.world.tables.payments = [
      ...manyPayments(1, { id: PAY_FAILED, amount_cents: 15000, status: 'received' }),
      ...manyPayments(1, { id: 'pay-outro', amount_cents: 2222, status: 'refunded' }),
    ];
    renderAdmin(`/admin/pagamentos?pagamento=${PAY_FAILED}`);
    const note = await screen.findByText(/Mostrando só o pagamento f0000000/);
    const list = fake.tableCalls.filter(c => c.table === 'payments').at(-1);
    expect(list?.filters).toContainEqual(['eq', 'id', PAY_FAILED]);
    expect(screen.queryByText('R$ 22,22')).not.toBeInTheDocument();

    await user.click(within(note.closest('p') as HTMLElement).getByRole('button', { name: 'Ver todos os pagamentos' }));
    expect(await screen.findByText('R$ 22,22')).toBeInTheDocument();
    expect(screen.queryByText(/Mostrando só o pagamento/)).not.toBeInTheDocument();
  });

  it('refuses a payment id that is not an id', async () => {
    renderAdmin('/admin/pagamentos?pagamento=nao-e-um-id');
    expect(await screen.findByText('O pagamento do link não foi reconhecido. Abra a lista e escolha de novo.')).toBeInTheDocument();
  });
});

describe('services: pagamentos que exigem atenção', () => {
  beforeEach(() => {
    resetWorld();
  });

  it('groups the entries by payment, newest first, and names the provider', async () => {
    seedAttention();
    const { payments, truncated } = await listPaymentsNeedingAttention();
    expect(truncated).toBe(false);
    expect(payments.map(p => p.payment_id)).toEqual([PAY_FAILED, PAY_LATE]);
    expect(payments[0].events.map(e => e.audit_id)).toEqual([12, 11]);
    expect(payments[0].provider_name).toBe('Dr. Paulo Cardio');
    expect(payments[0].amount_cents).toBe(15000);
  });

  it('flags a list longer than the limit', async () => {
    current.world.tables.admin_payments_attention = Array.from({ length: ATTENTION_LIMIT + 1 }, (_, i) =>
      entry({ audit_id: i + 1, payment_id: `f0000000-0000-4000-8000-${String(i).padStart(12, '0')}`, at: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString() }),
    );
    const { payments, truncated } = await listPaymentsNeedingAttention();
    expect(truncated).toBe(true);
    expect(payments).toHaveLength(ATTENTION_LIMIT);
  });

  it('needs a reason before it calls the database', async () => {
    seedAttention();
    await expect(markPaymentReviewed(PAY_FAILED, '   ')).rejects.toMatchObject({ code: 'invalid_input' });
    expect(callsOf('admin_review_payment')).toHaveLength(0);
  });

  it('trims the reason it sends', async () => {
    seedAttention();
    await markPaymentReviewed(PAY_FAILED, '  Resolvido  ');
    expect(callsOf('admin_review_payment')[0].args).toEqual({ p_payment: PAY_FAILED, p_reason: 'Resolvido' });
  });

  it('does not let a non-administrator mark anything', async () => {
    resetWorld({ isAdmin: false });
    current.world.tables.admin_payments_attention = [entry({})];
    await expect(markPaymentReviewed(PAY_FAILED, 'Tratado')).rejects.toMatchObject({ code: 'not_allowed' });
  });
});
